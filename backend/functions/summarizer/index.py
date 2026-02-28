"""Summarizer Lambda Handler.

Handles:
  - Query.getSummary
  - Query.getPromptTemplate
  - Query.listPromptTemplates
  - Mutation.updateSummary
  - Mutation.undoSummary
  - Mutation.saveSummaryEdit
  - Mutation.updateSummaryPromptType
  - Mutation.updatePromptTemplate
"""
import logging
from typing import Any

from common.config import get_config
from common.utils import (
    get_bedrock_client,
    get_dynamodb_table,
    invoke_bedrock,
    utc_now_iso,
)

logger = logging.getLogger(__name__)
logger.setLevel(logging.INFO)

config = get_config()

SUMMARY_PROMPT_TEMPLATE = """あなたは入力された内容の要約を作成するAIアシスタントです。

現在の要約:
{current_summary}

追加するメッセージ:
{selected_messages}

指示:
- 現在の要約を尊重し、矛盾や先祖返りを防いでください。
- 必ず「# タイトル」で始めてください（最初の行）。
- その後、内容に応じた適切な見出しをつけて記載してください。
- 最大5000文字以内にまとめてください。
"""

# Default prompt templates for seeding on first use
DEFAULT_PROMPT_TEMPLATES = {
    "summary": {
        "promptType": "summary",
        "promptText": SUMMARY_PROMPT_TEMPLATE,
    },
    "actionItem": {
        "promptType": "actionItem",
        "promptText": """あなたはアクションアイテムを抽出するAIアシスタントです。

現在の内容:
{current_summary}

追加するメッセージ:
{selected_messages}

指示:
- 会議のアクションアイテムを抽出してください。
- 形式: 「[ ] 担当: タスク内容 (期限: YYYY-MM-DD)」
- 背景などの下地があれば追記する
最大5000文字以内にまとめてください。
""",
    },
    "requirement": {
        "promptType": "requirement",
        "promptText": """あなたは与えられた内容から要件定義を作成するAIアシスタントです。

現在の内容:
{current_summary}

追加するメッセージ:
{selected_messages}

指示:
- 機能要件と非機能要件を明確に分類してください。
- 形式: 「## 機能要件 / ## 非機能要件 / ## 制約条件」
- 削除不可な要件は (MUST) 、推奨は (SHOULD) で記載
最大5000文字以内にまとめてください。
""",
    },
    "meds": {
        "promptType": "meds",
        "promptText": """あなたは会議内容を指定の方式で整理するAIアシスタントです。

現在の内容:
{current_summary}

追加するメッセージ:
{selected_messages}

指示:
- 以下の形式で保存してください:
  ## 問題
  ## 原因
  ## アクションアイテム
- 最大5000文字以内にまとめてください。
""",
    },
}


def lambda_handler(event: dict[str, Any], context: Any) -> dict[str, Any]:
    """Route AppSync resolver events to the appropriate handler."""
    info = event.get("info", {})
    field_name = info.get("fieldName", "")
    arguments = event.get("arguments", {})

    logger.info("Summarizer invoked: field=%s", field_name)

    handlers = {
        "getSummary": handle_get_summary,
        "updateSummary": handle_update_summary,
        "undoSummary": handle_undo_summary,
        "saveSummaryEdit": handle_save_summary_edit,
        "getPromptTemplate": handle_get_prompt_template,
        "listPromptTemplates": handle_list_prompt_templates,
        "updateSummaryPromptType": handle_update_summary_prompt_type,
        "updatePromptTemplate": handle_update_prompt_template,
    }

    handler = handlers.get(field_name)
    if not handler:
        logger.error("Unknown field: %s", field_name)
        raise ValueError(f"Unknown field: {field_name}")

    try:
        return handler(arguments)
    except Exception as e:
        logger.error("Summarizer error: field=%s error=%s", field_name, str(e), exc_info=True)
        raise


# ------------------------------------------------------------------
# Handlers
# ------------------------------------------------------------------

def handle_get_summary(args: dict) -> dict | None:
    """Retrieve the current summary for a conversation."""
    conversation_id = args.get("conversationId")
    table = get_dynamodb_table(config.summary_table)
    response = table.get_item(Key={"conversationId": conversation_id})
    return response.get("Item")


def handle_update_summary(args: dict) -> dict[str, Any]:
    """Generate a new summary using Bedrock AI."""
    inp = args.get("input", {})
    conversation_id = inp.get("conversationId")
    user_id = inp.get("userId")
    display_name = inp.get("displayName") or user_id
    selected_message_ids = inp.get("selectedMessageIds", [])

    if not conversation_id or not selected_message_ids:
        raise ValueError("conversationId and selectedMessageIds are required.")

    # Fetch selected messages
    messages_table = get_dynamodb_table(config.messages_table)
    selected_messages = []
    for msg_id in selected_message_ids:
        resp = messages_table.get_item(
            Key={"conversationId": conversation_id, "messageId": msg_id}
        )
        item = resp.get("Item")
        if item:
            selected_messages.append(item)

    if not selected_messages:
        raise ValueError("No valid messages found.")

    # Fetch current summary
    summary_table = get_dynamodb_table(config.summary_table)
    summary_resp = summary_table.get_item(Key={"conversationId": conversation_id})
    current_summary_item = summary_resp.get("Item", {})
    current_text = current_summary_item.get("current", "")

    # Build messages text
    messages_text = "\n".join(
        f"[{m.get('displayName', m.get('userId', 'Unknown'))}] {m.get('content', '')}"
        for m in selected_messages
    )

    # Generate summary using prompt type
    selected_prompt_type = current_summary_item.get("selectedPromptType", "summary")
    custom_prompt_text = current_summary_item.get("customPromptText", "")

    if config.use_mock_ai:
        new_summary = _mock_summary(current_text, messages_text)
    else:
        # Determine prompt template
        if selected_prompt_type == "custom" and custom_prompt_text:
            # Custom prompt: use as-is, appending messages
            prompt = custom_prompt_text.format(
                current_summary=current_text or "(empty)",
                selected_messages=messages_text,
            ) if "{current_summary}" in custom_prompt_text else (
                f"{custom_prompt_text}\n\n現在の内容:\n{current_text or '(空)'}\n\n"
                f"追加するメッセージ:\n{messages_text}"
            )
        else:
            # Use stored template or fall back to built-in
            prompt_templates_table = get_dynamodb_table(config.prompt_templates_table)
            template_resp = prompt_templates_table.get_item(Key={"promptType": selected_prompt_type})
            template_item = template_resp.get("Item")
            if template_item:
                template_text = template_item.get("promptText", SUMMARY_PROMPT_TEMPLATE)
            else:
                template_text = DEFAULT_PROMPT_TEMPLATES.get(
                    selected_prompt_type, DEFAULT_PROMPT_TEMPLATES["summary"]
                )["promptText"]
            prompt = template_text.format(
                current_summary=current_text or "(empty)",
                selected_messages=messages_text,
            )
        client = get_bedrock_client(config.bedrock_region)
        new_summary = invoke_bedrock(client, config.bedrock_model_id, prompt)

    # タイトルはユーザーが手動管理するため、AI要約からは抽出しない（ISSUE 05対応）
    # 既存タイトルを維持
    existing_title = current_summary_item.get("title", "")

    now = utc_now_iso()

    # Update summary table (preserve selectedPromptType & customPromptText)
    new_item: dict[str, Any] = {
        "conversationId": conversation_id,
        "title": existing_title,
        "current": new_summary,
        "previous": current_text,
        "updatedAt": now,
        "updatedBy": display_name,
        "selectedPromptType": selected_prompt_type,
        "customPromptText": custom_prompt_text,
    }
    summary_table.put_item(Item=new_item)

    # Mark messages as used in summary
    for msg_id in selected_message_ids:
        messages_table.update_item(
            Key={"conversationId": conversation_id, "messageId": msg_id},
            UpdateExpression="SET isUsedInSummary = :val",
            ExpressionAttributeValues={":val": True},
        )

    summary_data = {
        "conversationId": conversation_id,
        "title": existing_title,
        "current": new_summary,
        "previous": current_text,
        "updatedAt": now,
        "updatedBy": display_name,
        "selectedPromptType": selected_prompt_type,
        "customPromptText": custom_prompt_text,
    }

    logger.info("Summary updated: conv=%s by=%s", conversation_id, user_id)
    # Subscription対応: Summary型を直接返す
    return summary_data


def handle_undo_summary(args: dict) -> dict[str, Any]:
    """Revert summary to the previous version."""
    conversation_id = args.get("conversationId")
    if not conversation_id:
        raise ValueError("conversationId is required.")

    table = get_dynamodb_table(config.summary_table)
    response = table.get_item(Key={"conversationId": conversation_id})
    item = response.get("Item")

    if not item or not item.get("previous"):
        raise ValueError("No previous summary to undo.")

    previous_text = item["previous"]
    now = utc_now_iso()

    # Extract title from previous
    title = ""
    for line in previous_text.split("\n"):
        stripped = line.strip()
        if stripped.startswith("# "):
            title = stripped[2:].strip()
            break

    table.update_item(
        Key={"conversationId": conversation_id},
        UpdateExpression="SET #current = :prev, #previous = :empty, title = :title, updatedAt = :now",
        ExpressionAttributeNames={"#current": "current", "#previous": "previous"},
        ExpressionAttributeValues={
            ":prev": previous_text,
            ":empty": "",
            ":title": title,
            ":now": now,
        },
    )

    summary_data = {
        "conversationId": conversation_id,
        "title": title,
        "current": previous_text,
        "previous": "",
        "updatedAt": now,
        "updatedBy": item.get("updatedBy", ""),
    }

    logger.info("Summary undone: conv=%s", conversation_id)
    # Subscription対応: Summary型を直接返す
    return summary_data


def handle_save_summary_edit(args: dict) -> dict[str, Any]:
    """Save a manual edit to the summary."""
    inp = args.get("input", {})
    conversation_id = inp.get("conversationId")
    user_id = inp.get("userId")
    display_name = inp.get("displayName") or user_id
    content = inp.get("content", "")

    if not conversation_id:
        raise ValueError("conversationId is required.")

    if len(content) > 5000:
        raise ValueError("Summary must be 5000 characters or less.")

    table = get_dynamodb_table(config.summary_table)

    # Fetch current for previous backup
    resp = table.get_item(Key={"conversationId": conversation_id})
    old_item = resp.get("Item", {})
    old_current = old_item.get("current", "")

    # Extract title
    title = ""
    for line in content.split("\n"):
        stripped = line.strip()
        if stripped.startswith("# "):
            title = stripped[2:].strip()
            break

    now = utc_now_iso()

    table.put_item(
        Item={
            "conversationId": conversation_id,
            "title": title,
            "current": content,
            "previous": old_current,
            "updatedAt": now,
            "updatedBy": display_name,
        }
    )

    summary_data = {
        "conversationId": conversation_id,
        "title": title,
        "current": content,
        "previous": old_current,
        "updatedAt": now,
        "updatedBy": display_name,
    }

    logger.info("Summary edited: conv=%s by=%s", conversation_id, user_id)
    # Subscription対応: Summary型を直接返す
    return summary_data


# ------------------------------------------------------------------
# New handlers (CANVAS / Prompt Templates)
# ------------------------------------------------------------------

def _ensure_default_template(prompt_type: str, table) -> dict | None:
    """Fetch prompt template; seed default if not present in DB."""
    resp = table.get_item(Key={"promptType": prompt_type})
    item = resp.get("Item")
    if item:
        return item
    # Auto-seed default template
    default = DEFAULT_PROMPT_TEMPLATES.get(prompt_type)
    if default:
        now = utc_now_iso()
        item = {**default, "updatedAt": now}
        table.put_item(Item=item)
        return item
    return None


def handle_get_prompt_template(args: dict) -> dict | None:
    """Retrieve a prompt template by type, seeding default if absent."""
    prompt_type = args.get("promptType")
    if not prompt_type:
        raise ValueError("promptType is required.")
    table = get_dynamodb_table(config.prompt_templates_table)
    return _ensure_default_template(prompt_type, table)


def handle_list_prompt_templates(args: dict) -> list[dict]:
    """List all prompt templates, seeding defaults for missing ones."""
    table = get_dynamodb_table(config.prompt_templates_table)
    # Ensure all defaults are seeded
    for ptype in DEFAULT_PROMPT_TEMPLATES:
        _ensure_default_template(ptype, table)
    response = table.scan()
    return response.get("Items", [])


def handle_update_summary_prompt_type(args: dict) -> dict[str, Any]:
    """Save the selected prompt type (and optional custom text) into the summary item."""
    inp = args.get("input", {})
    conversation_id = inp.get("conversationId")
    selected_prompt_type = inp.get("selectedPromptType")
    custom_prompt_text = inp.get("customPromptText")  # may be None

    if not conversation_id or not selected_prompt_type:
        raise ValueError("conversationId and selectedPromptType are required.")

    table = get_dynamodb_table(config.summary_table)

    # Fetch existing item to merge
    resp = table.get_item(Key={"conversationId": conversation_id})
    existing = resp.get("Item", {})

    # Build update expression
    update_parts = ["selectedPromptType = :spt"]
    expr_values: dict[str, Any] = {":spt": selected_prompt_type}

    if custom_prompt_text is not None:
        update_parts.append("customPromptText = :cpt")
        expr_values[":cpt"] = custom_prompt_text
    elif selected_prompt_type != "custom":
        # Clear customPromptText when switching away from custom
        update_parts.append("customPromptText = :cpt")
        expr_values[":cpt"] = ""

    # Ensure the item exists; create minimal record if needed
    if not existing:
        now = utc_now_iso()
        item: dict[str, Any] = {
            "conversationId": conversation_id,
            "title": "",
            "current": "",
            "previous": "",
            "updatedAt": now,
            "updatedBy": "",
            "selectedPromptType": selected_prompt_type,
            "customPromptText": custom_prompt_text or "",
        }
        table.put_item(Item=item)
        return item

    update_expression = "SET " + ", ".join(update_parts)
    table.update_item(
        Key={"conversationId": conversation_id},
        UpdateExpression=update_expression,
        ExpressionAttributeValues=expr_values,
    )

    # Fetch updated item
    resp = table.get_item(Key={"conversationId": conversation_id})
    return resp.get("Item", {})


def handle_update_prompt_template(args: dict) -> dict[str, Any]:
    """Admin: update the text of a prompt template."""
    inp = args.get("input", {})
    prompt_type = inp.get("promptType")
    prompt_text = inp.get("promptText")

    if not prompt_type or prompt_text is None:
        raise ValueError("promptType and promptText are required.")

    # Custom prompts are stored in summary table, not here
    if prompt_type == "custom":
        raise ValueError("Custom prompts are managed per conversation in the summary table.")

    now = utc_now_iso()
    table = get_dynamodb_table(config.prompt_templates_table)
    item = {"promptType": prompt_type, "promptText": prompt_text, "updatedAt": now}
    table.put_item(Item=item)
    logger.info("PromptTemplate updated: type=%s", prompt_type)
    return item


# ------------------------------------------------------------------
# Mock
# ------------------------------------------------------------------

def _mock_summary(current: str, messages: str) -> str:
    """Generate a mock summary for dev environment with debug info.
    
    Returns the prompt that would be sent to Bedrock for debugging Lambda data flow.
    """
    return f"""# [モック要約 - デバッグ情報]

## Lambda が Bedrock に渡すはずの情報

### 【現在の要約】（DynamoDB 取得）
{current if current else '(初回・要約なし)'}

### 【追加するメッセージ】（messageId で取得したテキスト）
{messages if messages else '(メッセージ未選択)'}

---

## 注釈
- "現在の要約" が空の場合 → 要約が初回作成
- "追加するメッセージ" が空の場合 → selectedMessageIds が空またはメッセージ取得失敗
- 上記の内容が正常に表示されれば、Lambda は正しくデータベースからデータを取得できています
- 本番時（USE_MOCK_AI=false）はこの部分が Claude Haiku 4.5 の実際の要約に置き換わります
"""
