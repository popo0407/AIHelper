"""Knowledgebase Lambda Handler.

Handles:
  - Query.listKnowledgeSources
  - Mutation.uploadKnowledgebase   (Presigned URL generation + metadata)
  - Mutation.deleteKnowledgebase   (S3 delete + metadata cleanup)
  - Mutation.searchKnowledgebase   (RAG: keyword extraction + search + answer)
"""
import json
import logging
import re
import unicodedata
from datetime import datetime, timedelta, timezone
from typing import Any
from urllib.parse import urlparse, urlunparse

import boto3

from common.config import get_config
from common.utils import (
    build_response,
    generate_uuid,
    get_bedrock_client,
    get_dynamodb_table,
    invoke_bedrock,
    utc_now_iso,
)

logger = logging.getLogger(__name__)
logger.setLevel(logging.INFO)

config = get_config()

AIHELPER_USER_ID = "AIHELPER"
AIHELPER_DISPLAY_NAME = "AIHelper"

# Presigned URL expiry (seconds)
PRESIGNED_URL_EXPIRY = 900  # 15 minutes

# Max file size (bytes) - 25MB
MAX_FILE_SIZE = 25 * 1024 * 1024

# Allowed content types
ALLOWED_CONTENT_TYPES = {"pdf", "docx", "doc", "html", "md", "txt"}


def _sanitize_filename(filename: str, max_length: int = 60) -> str:
    """Sanitize filename to prevent metadata size issues in Bedrock S3 Vectors.
    
    Args:
        filename: Original filename
        max_length: Maximum length for sanitized filename (default: 60)
        
    Returns:
        Sanitized filename with ASCII-only characters
    """
    # Split extension
    name_parts = filename.rsplit(".", 1)
    name = name_parts[0]
    ext = name_parts[1] if len(name_parts) > 1 else ""
    
    # Remove non-ASCII characters
    name_ascii = "".join(c for c in name if ord(c) < 128 and (c.isalnum() or c in "-_"))
    
    # If name becomes empty (e.g., Japanese-only filename), use timestamp
    if len(name_ascii) < 1:
        name_ascii = f"file_{datetime.now(timezone.utc).strftime('%Y%m%d%H%M%S')}"
        logger.info(f"Japanese-only filename '{filename}' → '{name_ascii}.{ext}'")
    
    # Truncate if too long
    max_name_length = max_length - len(ext) - 1 if ext else max_length
    if len(name_ascii) > max_name_length:
        name_ascii = name_ascii[:max_name_length]
    
    # Reconstruct filename
    sanitized = f"{name_ascii}.{ext}" if ext else name_ascii
    
    if sanitized != filename:
        logger.info(f"Sanitized: '{filename}' → '{sanitized}'")
    return sanitized


def lambda_handler(event: dict, context: Any) -> Any:
    """Main Lambda handler routed by AppSync field name."""
    info = event.get("info", {})
    field_name = info.get("fieldName", "")
    arguments = event.get("arguments", {})

    logger.info("Knowledgebase handler: field=%s", field_name)

    handlers = {
        "listKnowledgeSources": handle_list_knowledge_sources,
        "uploadKnowledgebase": handle_upload_knowledgebase,
        "completeKnowledgebaseUpload": handle_complete_knowledgebase_upload,
        "deleteKnowledgebase": handle_delete_knowledgebase,
        "searchKnowledgebase": handle_search_knowledgebase,
    }

    handler = handlers.get(field_name)
    if not handler:
        raise ValueError(f"Unknown field: {field_name}")

    return handler(arguments)


# =========================================================
# User context helper
# =========================================================





def _save_kb_search_messages(
    conversation_id: str,
    user_query: str,
    user_id: str,
    display_name: str,
    answer: str,
    sources: list[str],
) -> tuple[str, str]:
    """Save KB search user question and AI answer to Messages table.
    
    Args:
        conversation_id: Conversation ID
        user_query: User's query text
        user_id: Authenticated user ID from AppSync
        display_name: User's display name from AppSync
        answer: AI-generated answer
        sources: List of source file names (unused but kept for compatibility)
    
    Returns: (user_message_id, ai_message_id)
    """
    messages_table = get_dynamodb_table(config.messages_table)
    
    # Generate timestamps: user question 1 second before AI answer
    # This ensures proper ordering in message list (questions before answers)
    now_dt = datetime.now(timezone.utc)
    user_timestamp = (now_dt - timedelta(seconds=1)).isoformat().replace("+00:00", "Z")
    ai_timestamp = now_dt.isoformat().replace("+00:00", "Z")
    
    # User question message
    user_msg_id = generate_uuid()
    user_message = {
        "conversationId": conversation_id,
        "messageId": user_msg_id,
        "userId": user_id,
        "displayName": display_name,
        "content": f"📚 KB検索: {user_query}",
        "timestamp": user_timestamp,
        "isUsedInSummary": False,
    }
    messages_table.put_item(Item=user_message)
    logger.info("Saved user KB question: %s (user=%s)", user_msg_id, user_id)
    
    # AI answer message (no source attribution)
    ai_msg_id = generate_uuid()
    ai_message = {
        "conversationId": conversation_id,
        "messageId": ai_msg_id,
        "userId": AIHELPER_USER_ID,
        "displayName": "AIHelper (KB)",
        "content": answer,
        "timestamp": ai_timestamp,
        "isUsedInSummary": False,
    }
    messages_table.put_item(Item=ai_message)
    logger.info("Saved KB answer: %s", ai_msg_id)
    
    return user_msg_id, ai_msg_id





def handle_list_knowledge_sources(arguments: dict) -> list[dict]:
    """List knowledge sources for a conversation."""
    conversation_id = arguments["conversationId"]

    table = get_dynamodb_table(config.knowledge_sources_table)
    response = table.query(
        KeyConditionExpression="conversationId = :cid",
        ExpressionAttributeValues={":cid": conversation_id},
    )

    items = response.get("Items", [])
    # Convert fileSize from Decimal to int
    for item in items:
        if "fileSize" in item:
            item["fileSize"] = int(item["fileSize"])
    return items


# =========================================================
# Mutation: uploadKnowledgebase
# =========================================================


def handle_upload_knowledgebase(arguments: dict) -> dict:
    """Generate presigned URL and register metadata."""
    inp = arguments.get("input", {})
    conversation_id = inp["conversationId"]
    file_name = inp["fileName"]
    file_size = int(inp["fileSize"])
    content_type = inp["contentType"]

    # Validate content type
    if content_type not in ALLOWED_CONTENT_TYPES:
        return build_response(
            False,
            error=f"サポートされていないファイル形式です: {content_type}。"
            f"対応形式: {', '.join(sorted(ALLOWED_CONTENT_TYPES))}",
        )

    # Validate file size
    if file_size > MAX_FILE_SIZE:
        return build_response(
            False,
            error=f"ファイルサイズが上限（25MB）を超えています: {file_size / 1024 / 1024:.1f}MB",
        )

    # Sanitize filename to prevent Bedrock S3 Vectors metadata size limit
    sanitized_file_name = _sanitize_filename(file_name)

    # Use sanitized filename directly (no UUID - enables overwrite)
    s3_key = f"conversations/{conversation_id}/{sanitized_file_name}"
    now = utc_now_iso()

    # Get identity (userId) from AppSync event
    uploaded_by = _get_user_id_from_event(arguments)

    # Store metadata in DynamoDB (fileName as sort key - enables overwrite)
    table = get_dynamodb_table(config.knowledge_sources_table)
    item = {
        "conversationId": conversation_id,
        "fileName": sanitized_file_name,  # Use sanitized name as PK
        "originalFileName": file_name,  # Keep original for display
        "fileSize": file_size,
        "s3Key": s3_key,
        "contentType": content_type,
        "uploadedBy": uploaded_by,
        "uploadedAt": now,
        "status": "ready",
    }
    table.put_item(Item=item)

    # Generate presigned PUT URL for S3 upload with conversation metadata
    # CloudFront 経由でアップロードするため、S3 presigned URL のホスト部分を
    # CloudFront ドメインに置換する。CloudFront が Host ヘッダーを S3 オリジンに
    # 書き換えるため、presigned URL の署名検証は正常に通過する。
    #
    # 重要 1: SigV4 を使用すること。V2 署名は x-amz-* ヘッダーと Content-Type を
    # 署名に含むが、CloudFront が付加する x-amz-cf-id ヘッダーは署名生成時に
    # 存在しないため、V2 では SignatureDoesNotMatch エラーになる。
    # V4 は SignedHeaders に明示したヘッダーのみ検証するため、CloudFront 経由で安全。
    #
    # 重要 2: endpoint_url にリージョナル S3 エンドポイントを指定し、
    # addressing_style=virtual を併用すること。
    # boto3 デフォルトは s3.amazonaws.com (グローバル) だが、CloudFront オリジンは
    # s3.ap-northeast-1.amazonaws.com (リージョナル) を使用するため、Host ヘッダーが
    # 不一致となり署名検証が失敗する。リージョナルエンドポイント + virtual-hosted で
    # CloudFront オリジンと同一の Host を使用させる。
    from botocore.config import Config as BotoConfig

    s3_client = boto3.client(
        "s3",
        region_name="ap-northeast-1",
        endpoint_url="https://s3.ap-northeast-1.amazonaws.com",
        config=BotoConfig(
            signature_version="s3v4",
            s3={"addressing_style": "virtual"},
        ),
    )
    
    # Generate presigned URL for client-side upload
    # Note: Metadata cannot be set via presigned URL - it will be added via completeKnowledgebaseUpload
    presigned_url = s3_client.generate_presigned_url(
        "put_object",
        Params={
            "Bucket": config.knowledge_bucket,
            "Key": s3_key,
        },
        ExpiresIn=PRESIGNED_URL_EXPIRY,
    )

    # CloudFront ドメインで URL を置換
    cloudfront_domain = config.cloudfront_domain
    if cloudfront_domain:
        parsed = urlparse(presigned_url)
        presigned_url = urlunparse((
            parsed.scheme,
            cloudfront_domain,
            parsed.path,
            parsed.params,
            parsed.query,
            parsed.fragment,
        ))

    logger.info(
        "Upload presigned URL generated (CloudFront): conversation=%s, file=%s",
        conversation_id,
        file_name,
    )

    return {
        "success": True,
        "knowledgeSource": item,
        "presignedUrl": presigned_url,
    }


# =========================================================
# Mutation: completeKnowledgebaseUpload
# =========================================================


def handle_complete_knowledgebase_upload(arguments: dict) -> dict:
    """Generate and upload .metadata.json for Bedrock Knowledge Base filtering.
    
    This mutation must be called after the client successfully uploads a file to S3.
    It creates a .metadata.json file containing conversationId for Bedrock filtering.
    
    Args:
        arguments: {
            "input": {
                "conversationId": str,
                "fileName": str (sanitized filename)
            }
        }
    
    Returns:
        {"success": bool, "error": str | None}
    """
    inp = arguments.get("input", {})
    conversation_id = inp.get("conversationId")
    file_name = inp.get("fileName")
    
    if not conversation_id or not file_name:
        return {"success": False, "error": "conversationId and fileName are required"}
    
    try:
        # Construct S3 keys
        document_key = f"conversations/{conversation_id}/{file_name}"
        metadata_key = f"{document_key}.metadata.json"
        
        # Create metadata JSON content
        # Bedrock Knowledge Base uses "metadataAttributes" structure
        metadata_content = {
            "metadataAttributes": {
                "conversationId": conversation_id
            }
        }
        
        # Upload .metadata.json to S3
        s3_client = boto3.client("s3", region_name="ap-northeast-1")
        s3_client.put_object(
            Bucket=config.knowledge_bucket,
            Key=metadata_key,
            Body=json.dumps(metadata_content, ensure_ascii=False, indent=2),
            ContentType="application/json",
        )
        
        logger.info(
            "Metadata file created: %s for document %s",
            metadata_key,
            document_key,
        )
        
        return {"success": True, "error": None}
        
    except Exception as e:
        logger.error("Failed to create metadata file: %s", e, exc_info=True)
        return {"success": False, "error": str(e)}


# =========================================================
# Mutation: deleteKnowledgebase
# =========================================================


def handle_delete_knowledgebase(arguments: dict) -> dict:
    """Delete knowledge source: S3 file + DynamoDB metadata."""
    inp = arguments.get("input", {})
    conversation_id = inp["conversationId"]
    file_name = inp["fileName"]  # Changed from knowledgeSourceId

    table = get_dynamodb_table(config.knowledge_sources_table)

    # Get the record to find S3 key
    response = table.get_item(
        Key={
            "conversationId": conversation_id,
            "fileName": file_name,
        }
    )
    item = response.get("Item")
    if not item:
        return build_response(False, error="指定されたナレッジソースが見つかりません")

    s3_key = item["s3Key"]

    # Delete from S3 (document + metadata.json)
    try:
        s3_client = boto3.client("s3")
        
        # Delete document file
        s3_client.delete_object(
            Bucket=config.knowledge_bucket,
            Key=s3_key,
        )
        logger.info("S3 object deleted: %s", s3_key)
        
        # Delete metadata file
        metadata_key = f"{s3_key}.metadata.json"
        s3_client.delete_object(
            Bucket=config.knowledge_bucket,
            Key=metadata_key,
        )
        logger.info("S3 metadata deleted: %s", metadata_key)
        
    except Exception as e:
        logger.error("Failed to delete S3 object: %s", e)
        return build_response(False, error=f"S3ファイルの削除に失敗しました: {str(e)}")

    # Delete metadata from DynamoDB
    table.delete_item(
        Key={
            "conversationId": conversation_id,
            "fileName": file_name,
        }
    )

    logger.info(
        "Knowledge source deleted: file=%s, conversation=%s",
        file_name,
        conversation_id,
    )

    return {
        "success": True,
        "fileName": file_name,
    }


# =========================================================
# Mutation: searchKnowledgebase
# =========================================================


def handle_search_knowledgebase(arguments: dict) -> dict:
    """Search Knowledge Base using Bedrock RetrieveAndGenerate API."""
    inp = arguments.get("input", {})
    conversation_id = inp["conversationId"]
    user_query = inp["query"]
    user_id = inp.get("userId", "UNKNOWN")
    display_name = inp.get("displayName", user_id)
    
    logger.info(
        "searchKnowledgebase: conversationId=%s, query=%s, userId=%s",
        conversation_id,
        user_query,
        user_id,
    )

    # 1. Get knowledge sources for this conversation
    table = get_dynamodb_table(config.knowledge_sources_table)
    response = table.query(
        KeyConditionExpression="conversationId = :cid",
        ExpressionAttributeValues={":cid": conversation_id},
    )
    sources = [
        s for s in response.get("Items", []) if s.get("status") == "ready"
    ]

    if not sources:
        answer = (
            "この会話にはナレッジベースが登録されていません。"
            "ヘッダーの📚ボタンからファイルをアップロードしてください。"
        )
        user_msg_id, ai_msg_id = _save_kb_search_messages(
            conversation_id, user_query, user_id, display_name, answer, []
        )
        return {
            "conversationId": conversation_id,
            "query": user_query,
            "answer": answer,
            "sources": [],
            "userMessageId": user_msg_id,
            "aiMessageId": ai_msg_id,
        }

    # 2. Mock mode
    if config.use_mock_ai:
        result = _mock_search_result(conversation_id, user_query, sources)
        user_msg_id, ai_msg_id = _save_kb_search_messages(
            conversation_id,
            user_query,
            user_id,
            display_name,
            result["answer"],
            result["sources"],
        )
        result["userMessageId"] = user_msg_id
        result["aiMessageId"] = ai_msg_id
        return result

    # 3. Call Bedrock RetrieveAndGenerate API with conversation filter
    try:
        bedrock_client = boto3.client(
            "bedrock-agent-runtime",
            region_name=config.bedrock_region,
        )
        
        response = bedrock_client.retrieve_and_generate(
            input={"text": user_query},
            retrieveAndGenerateConfiguration={
                "type": "KNOWLEDGE_BASE",
                "knowledgeBaseConfiguration": {
                    "knowledgeBaseId": config.bedrock_kb_id,
                    "modelArn": f"arn:aws:bedrock:{config.bedrock_region}::foundation-model/{config.bedrock_model_id}",
                    "retrievalConfiguration": {
                        "vectorSearchConfiguration": {
                            "filter": {
                                "equals": {
                                    "key": "conversationId",
                                    "value": conversation_id,
                                }
                            }
                        }
                    }
                },
            },
        )
        
        # Extract answer from Bedrock (without citation information)\n        answer = response.get(\"output\", {}).get(\"text\", \"回答の生成に失敗しました。\")
        
        # Remove any citation/reference information from the answer
        # Pattern: 【参照元: ...】or [Citation: ...] etc.
        answer = re.sub(
            r'【参照元[：:][^】]*】|【Citation[：:][^】]*】|\[Citation[：:][^\]]*\]|\[References?[：:][^\]]*\]',
            '',
            answer
        ).strip()
        
        # Build map of sanitized filename -> original filename for display
        # Only include sources that were actually used in the search
        source_names = []  # Sanitized names (used internally)
        source_display_names = []  # Original names (for UI)
        
        citations = response.get("citations", [])
        for citation in citations:
            for ref in citation.get("retrievedReferences", []):
                location = ref.get("location", {})
                s3_location = location.get("s3Location", {})
                uri = s3_location.get("uri", "")
                if uri:
                    # Extract sanitized file name from S3 URI
                    sanitized_name = uri.split("/")[-1]
                    if sanitized_name and sanitized_name not in source_names:
                        source_names.append(sanitized_name)
                        # Find original filename from sources list
                        for src in sources:
                            if src["fileName"] == sanitized_name:
                                original_name = src.get("originalFileName", sanitized_name)
                                source_display_names.append(original_name)
                                break
        
        logger.info("KB search completed: sources=%s", source_names)
        
    except Exception as e:
        logger.error("Bedrock RetrieveAndGenerate failed: %s", e, exc_info=True)
        answer = f"ナレッジベース検索中にエラーが発生しました: {str(e)}"
        source_names = []
    
    # 4. Save user question and AI answer to Messages table
    user_msg_id, ai_msg_id = _save_kb_search_messages(
        conversation_id, user_query, user_id, display_name, answer, source_names
    )

    return {
        "conversationId": conversation_id,
        "query": user_query,
        "answer": answer,
        "sources": source_names,  # Sanitized names for internal use
        "sourceDisplayNames": source_display_names,  # Original names for UI
        "userMessageId": user_msg_id,
        "aiMessageId": ai_msg_id,
    }


# =========================================================
# Mock & helpers
# =========================================================


def _mock_search_result(
    conversation_id: str, user_query: str, sources: list[dict]
) -> dict:
    """Return a mock search result for development with debug info.
    
    Shows the RAG pipeline steps for easier debugging of Lambda data flow.
    """
    source_names = [s["fileName"] for s in sources]
    sources_info = "\n".join(
        [f"  - {s['fileName']} ({s['fileSize']} bytes)" for s in sources]
    )
    
    # Simulate keyword extraction (what Bedrock would do)
    simulated_keywords = [
        term.strip() for term in user_query.split() 
        if len(term.strip()) > 2
    ][:5]
    
    return {
        "conversationId": conversation_id,
        "query": user_query,
        "answer": f"""【モック回答 - RAG デバッグ情報】

## ユーザーの質問
{user_query}

## ステップ 1: 知識ベース確認
登録済みドキュメント（{len(sources)}件）:
{sources_info}

## ステップ 2: キーワード抽出（疑似実行）
Lambda が Bedrock に「キーワード抽出」を依頼した場合:
  {', '.join(simulated_keywords)}

## ステップ 3: コンテンツ検索
→ 各ドキュメントから検索対象チャンクを抽出します
→ キーワード/質問用語とのマッチングスコアで順位付けします

## ステップ 4: RAG 応答生成
Lambda が Bedrock RAG に渡すプロンプト構成:
  【質問】: {user_query}
  【参照ドキュメント】: {len(source_names)}件から抽出したチャンク
  【出典】: {', '.join(source_names)}

---

本番時（USE_MOCK_AI=false）:
- キーワード抽出: Claude Haiku 4.5 が実行
- コンテンツ検索: S3 から実際のテキストを取得・スコアリング
- RAG 応答: Claude Haiku 4.5 がドキュメント内容を参考に生成
""",
        "sources": source_names,
    }


def _get_user_id_from_event(arguments: dict) -> str:
    """Extract user ID from AppSync arguments or input."""
    inp = arguments.get("input", {})
    return inp.get("uploadedBy", inp.get("userId", "unknown"))


def _get_mime_type(content_type: str) -> str:
    """Convert content type to MIME type for S3."""
    mime_map = {
        "pdf": "application/pdf",
        "docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "doc": "application/msword",
        "html": "text/html",
        "md": "text/markdown",
        "txt": "text/plain",
    }
    return mime_map.get(content_type, "application/octet-stream")
