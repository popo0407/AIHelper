"""Knowledgebase Lambda Handler.

Handles:
  - Query.listKnowledgeSources
  - Mutation.uploadKnowledgebase   (Presigned URL generation + metadata)
  - Mutation.deleteKnowledgebase   (S3 delete + metadata cleanup)
  - Mutation.searchKnowledgebase   (RAG: keyword extraction + search + answer)
"""
import json
import logging
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

# ----- Prompt Templates -----

EXTRACT_KEYWORDS_PROMPT = """あなたは質問分析の専門家です。
ユーザーの質問から、ドキュメント検索に最適な3〜5個のキーワードを抽出してください。

ユーザーの質問:
{user_query}

出力形式: JSON配列のみ（例: ["キーワード1", "キーワード2", "キーワード3"]）
余計な説明は不要です。"""

RAG_ANSWER_PROMPT = """あなたはナレッジベース検索アシスタントです。
ユーザーの質問に対し、提供されたドキュメントのみから回答してください。

ユーザーの質問:
{user_query}

参照ドキュメント:
---
{retrieved_chunks}
---

注意:
- ドキュメントに情報がない場合は「該当する情報は見つかりませんでした」と明記
- 必ず出典ファイル名を【出典: ファイル名】の形式で記載
- 日本語で簡潔に回答"""


def lambda_handler(event: dict, context: Any) -> Any:
    """Main Lambda handler routed by AppSync field name."""
    info = event.get("info", {})
    field_name = info.get("fieldName", "")
    arguments = event.get("arguments", {})

    logger.info("Knowledgebase handler: field=%s", field_name)

    handlers = {
        "listKnowledgeSources": handle_list_knowledge_sources,
        "uploadKnowledgebase": handle_upload_knowledgebase,
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
        sources: List of source file names
    
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
    
    # AI answer message with source attribution
    sources_attribution = (
        f"\n\n【参照元: {', '.join(sources)}】"
        if sources
        else ""
    )
    ai_msg_id = generate_uuid()
    ai_message = {
        "conversationId": conversation_id,
        "messageId": ai_msg_id,
        "userId": AIHELPER_USER_ID,
        "displayName": "AIHelper (KB)",
        "content": answer + sources_attribution,
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

    knowledge_source_id = generate_uuid()
    s3_key = f"conversations/{conversation_id}/{knowledge_source_id}/{file_name}"
    now = utc_now_iso()

    # Get identity (userId) from AppSync event
    uploaded_by = _get_user_id_from_event(arguments)

    # Store metadata in DynamoDB
    table = get_dynamodb_table(config.knowledge_sources_table)
    item = {
        "conversationId": conversation_id,
        "knowledgeSourceId": knowledge_source_id,
        "fileName": file_name,
        "fileSize": file_size,
        "s3Key": s3_key,
        "contentType": content_type,
        "uploadedBy": uploaded_by,
        "uploadedAt": now,
        "status": "ready",
    }
    table.put_item(Item=item)

    # Generate presigned PUT URL for S3 upload
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
    presigned_url = s3_client.generate_presigned_url(
        "put_object",
        Params={"Bucket": config.knowledge_bucket, "Key": s3_key},
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
# Mutation: deleteKnowledgebase
# =========================================================


def handle_delete_knowledgebase(arguments: dict) -> dict:
    """Delete knowledge source: S3 file + DynamoDB metadata."""
    inp = arguments.get("input", {})
    conversation_id = inp["conversationId"]
    knowledge_source_id = inp["knowledgeSourceId"]

    table = get_dynamodb_table(config.knowledge_sources_table)

    # Get the record to find S3 key
    response = table.get_item(
        Key={
            "conversationId": conversation_id,
            "knowledgeSourceId": knowledge_source_id,
        }
    )
    item = response.get("Item")
    if not item:
        return build_response(False, error="指定されたナレッジソースが見つかりません")

    s3_key = item["s3Key"]

    # Delete from S3
    try:
        s3_client = boto3.client("s3")
        s3_client.delete_object(
            Bucket=config.knowledge_bucket,
            Key=s3_key,
        )
        logger.info("S3 object deleted: %s", s3_key)
    except Exception as e:
        logger.error("Failed to delete S3 object: %s", e)
        return build_response(False, error=f"S3ファイルの削除に失敗しました: {str(e)}")

    # Delete metadata from DynamoDB
    table.delete_item(
        Key={
            "conversationId": conversation_id,
            "knowledgeSourceId": knowledge_source_id,
        }
    )

    logger.info(
        "Knowledge source deleted: id=%s, file=%s",
        knowledge_source_id,
        item.get("fileName"),
    )

    return {
        "success": True,
        "knowledgeSourceId": knowledge_source_id,
    }


# =========================================================
# Mutation: searchKnowledgebase
# =========================================================


def handle_search_knowledgebase(arguments: dict) -> dict:
    """RAG pipeline: extract keywords → retrieve → generate answer."""
    inp = arguments.get("input", {})
    conversation_id = inp["conversationId"]
    user_query = inp["query"]
    user_id = inp.get("userId", "UNKNOWN")
    display_name = inp.get("displayName", user_id)

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

    # 2. Mock mode or real Bedrock
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

    # 3. Extract keywords using Bedrock
    bedrock_client = get_bedrock_client(config.bedrock_region)
    keywords_prompt = EXTRACT_KEYWORDS_PROMPT.format(user_query=user_query)
    keywords_raw = invoke_bedrock(
        bedrock_client,
        config.bedrock_model_id,
        keywords_prompt,
        max_tokens=200,
        temperature=0.1,
    )

    try:
        keywords = json.loads(keywords_raw)
    except (json.JSONDecodeError, TypeError):
        keywords = [user_query]

    logger.info("Extracted keywords: %s", keywords)

    # 4. Retrieve relevant content from S3 files
    retrieved_chunks = _retrieve_from_s3(
        conversation_id, sources, keywords, user_query
    )

    if not retrieved_chunks:
        answer = "登録されたドキュメントから該当する情報は見つかりませんでした。"
        source_names = [s["fileName"] for s in sources]
        user_msg_id, ai_msg_id = _save_kb_search_messages(
            conversation_id, user_query, user_id, display_name, answer, source_names
        )
        return {
            "conversationId": conversation_id,
            "query": user_query,
            "answer": answer,
            "sources": source_names,
            "userMessageId": user_msg_id,
            "aiMessageId": ai_msg_id,
        }

    # 5. Generate answer using Bedrock RAG
    chunks_text = "\n\n".join(
        [
            f"【{c['fileName']}】\n{c['content']}"
            for c in retrieved_chunks
        ]
    )
    rag_prompt = RAG_ANSWER_PROMPT.format(
        user_query=user_query,
        retrieved_chunks=chunks_text,
    )
    answer = invoke_bedrock(
        bedrock_client,
        config.bedrock_model_id,
        rag_prompt,
        max_tokens=2048,
        temperature=0.3,
    )

    source_names = list(set(c["fileName"] for c in retrieved_chunks))

    # Save user question and AI answer to Messages table
    user_msg_id, ai_msg_id = _save_kb_search_messages(
        conversation_id, user_query, user_id, display_name, answer, source_names
    )

    return {
        "conversationId": conversation_id,
        "query": user_query,
        "answer": answer,
        "sources": source_names,
        "userMessageId": user_msg_id,
        "aiMessageId": ai_msg_id,
    }


# =========================================================
# S3 text retrieval (simple keyword matching)
# =========================================================


def _retrieve_from_s3(
    conversation_id: str,
    sources: list[dict],
    keywords: list[str],
    user_query: str,
) -> list[dict]:
    """Retrieve relevant text chunks from S3 files.

    Simple implementation: download files, extract text,
    and search for keyword matches.
    When AWS Knowledge Bases is configured, this can be
    replaced with the Retrieve API.
    """
    s3_client = boto3.client("s3")
    results = []

    for source in sources:
        try:
            s3_key = source["s3Key"]
            file_name = source["fileName"]
            content_type = source.get("contentType", "txt")

            # Get file from S3
            obj = s3_client.get_object(
                Bucket=config.knowledge_bucket,
                Key=s3_key,
            )
            raw_content = obj["Body"].read()

            # Extract text based on content type
            text = _extract_text(raw_content, content_type)
            if not text:
                continue

            # Simple keyword matching: split into chunks and score
            chunks = _split_into_chunks(text, chunk_size=500)
            for chunk in chunks:
                chunk_lower = chunk.lower()
                query_lower = user_query.lower()
                score = sum(
                    1 for kw in keywords if kw.lower() in chunk_lower
                )
                # Also check if query terms appear
                if any(term in chunk_lower for term in query_lower.split()):
                    score += 1

                if score > 0:
                    results.append(
                        {
                            "fileName": file_name,
                            "content": chunk.strip(),
                            "score": score,
                        }
                    )
        except Exception as e:
            logger.warning("Failed to process file %s: %s", source.get("fileName"), e)
            continue

    # Sort by score and return top results
    results.sort(key=lambda x: x["score"], reverse=True)
    return results[:5]


def _extract_text(raw_content: bytes, content_type: str) -> str:
    """Extract text from file content based on type."""
    if content_type in ("txt", "md"):
        return raw_content.decode("utf-8", errors="replace")
    elif content_type == "html":
        return _extract_html_text(raw_content)
    elif content_type in ("pdf",):
        return _extract_pdf_text(raw_content)
    elif content_type in ("docx", "doc"):
        return _extract_docx_text(raw_content)
    return ""


def _extract_html_text(raw_content: bytes) -> str:
    """Extract text from HTML content."""
    import re

    text = raw_content.decode("utf-8", errors="replace")
    # Remove HTML tags
    text = re.sub(r"<script[^>]*>.*?</script>", "", text, flags=re.DOTALL)
    text = re.sub(r"<style[^>]*>.*?</style>", "", text, flags=re.DOTALL)
    text = re.sub(r"<[^>]+>", " ", text)
    text = re.sub(r"\s+", " ", text)
    return text.strip()


def _extract_pdf_text(raw_content: bytes) -> str:
    """Extract text from PDF content.

    Uses a simple approach - in production, consider PyPDF2 in Lambda Layer.
    """
    try:
        import io

        from PyPDF2 import PdfReader

        reader = PdfReader(io.BytesIO(raw_content))
        text_parts = []
        for page in reader.pages:
            page_text = page.extract_text()
            if page_text:
                text_parts.append(page_text)
        return "\n".join(text_parts)
    except ImportError:
        logger.warning("PyPDF2 not available, skipping PDF extraction")
        return ""
    except Exception as e:
        logger.warning("PDF extraction failed: %s", e)
        return ""


def _extract_docx_text(raw_content: bytes) -> str:
    """Extract text from DOCX content.

    Uses python-docx if available, otherwise falls back.
    """
    try:
        import io

        from docx import Document

        doc = Document(io.BytesIO(raw_content))
        return "\n".join(p.text for p in doc.paragraphs if p.text)
    except ImportError:
        logger.warning("python-docx not available, skipping DOCX extraction")
        return ""
    except Exception as e:
        logger.warning("DOCX extraction failed: %s", e)
        return ""


def _split_into_chunks(text: str, chunk_size: int = 500) -> list[str]:
    """Split text into chunks of roughly chunk_size characters."""
    if not text:
        return []
    chunks = []
    words = text.split()
    current_chunk: list[str] = []
    current_len = 0
    for word in words:
        current_chunk.append(word)
        current_len += len(word) + 1
        if current_len >= chunk_size:
            chunks.append(" ".join(current_chunk))
            current_chunk = []
            current_len = 0
    if current_chunk:
        chunks.append(" ".join(current_chunk))
    return chunks


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
