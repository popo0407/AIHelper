"""Summarizer Lambda Handler.

Handles:
  - Query.getSummary
  - Mutation.updateSummary
  - Mutation.undoSummary
  - Mutation.saveSummaryEdit
"""
import logging
from typing import Any

from common.config import get_config
from common.utils import (
    build_response,
    get_bedrock_client,
    get_dynamodb_table,
    invoke_bedrock,
    utc_now_iso,
)

logger = logging.getLogger(__name__)
logger.setLevel(logging.INFO)

config = get_config()

SUMMARY_PROMPT_TEMPLATE = """あなたは会議の議事録を作成するAIアシスタントです。

現在の要約:
{current_summary}

追加するメッセージ:
{selected_messages}

指示:
- 現在の要約を尊重し、矛盾や先祖返りを防いでください。
- 必ず「# タイトル」で始めてください（最初の行）。
- その後、「## 決定事項」「## TODO」「## その他」と分類して記述してください。
- 最大5000文字以内にまとめてください。
- 人間が既に編集した内容は尊重し、そのまま維持してください。
"""


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
    }

    handler = handlers.get(field_name)
    if not handler:
        logger.error("Unknown field: %s", field_name)
        return build_response(False, error=f"Unknown field: {field_name}")

    return handler(arguments)


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
    selected_message_ids = inp.get("selectedMessageIds", [])

    if not conversation_id or not selected_message_ids:
        return build_response(
            False, error="conversationId and selectedMessageIds are required."
        )

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
        return build_response(False, error="No valid messages found.")

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

    # Generate summary
    if config.use_mock_ai:
        new_summary = _mock_summary(current_text, messages_text)
    else:
        prompt = SUMMARY_PROMPT_TEMPLATE.format(
            current_summary=current_text or "(empty)",
            selected_messages=messages_text,
        )
        client = get_bedrock_client(config.bedrock_region)
        new_summary = invoke_bedrock(client, config.bedrock_model_id, prompt)

    # Extract title (first line starting with #)
    title = ""
    for line in new_summary.split("\n"):
        stripped = line.strip()
        if stripped.startswith("# "):
            title = stripped[2:].strip()
            break

    now = utc_now_iso()

    # Update summary table
    summary_table.put_item(
        Item={
            "conversationId": conversation_id,
            "title": title,
            "current": new_summary,
            "previous": current_text,
            "updatedAt": now,
            "updatedBy": user_id,
        }
    )

    # Mark messages as used in summary
    for msg_id in selected_message_ids:
        messages_table.update_item(
            Key={"conversationId": conversation_id, "messageId": msg_id},
            UpdateExpression="SET isUsedInSummary = :val",
            ExpressionAttributeValues={":val": True},
        )

    summary_data = {
        "conversationId": conversation_id,
        "title": title,
        "current": new_summary,
        "previous": current_text,
        "updatedAt": now,
        "updatedBy": user_id,
    }

    logger.info("Summary updated: conv=%s by=%s", conversation_id, user_id)
    return build_response(True, data={"summary": summary_data})


def handle_undo_summary(args: dict) -> dict[str, Any]:
    """Revert summary to the previous version."""
    conversation_id = args.get("conversationId")
    if not conversation_id:
        return build_response(False, error="conversationId is required.")

    table = get_dynamodb_table(config.summary_table)
    response = table.get_item(Key={"conversationId": conversation_id})
    item = response.get("Item")

    if not item or not item.get("previous"):
        return build_response(False, error="No previous summary to undo.")

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
    return build_response(True, data={"summary": summary_data})


def handle_save_summary_edit(args: dict) -> dict[str, Any]:
    """Save a manual edit to the summary."""
    inp = args.get("input", {})
    conversation_id = inp.get("conversationId")
    user_id = inp.get("userId")
    content = inp.get("content", "")

    if not conversation_id:
        return build_response(False, error="conversationId is required.")

    if len(content) > 5000:
        return build_response(False, error="Summary must be 5000 characters or less.")

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
            "updatedBy": user_id,
        }
    )

    summary_data = {
        "conversationId": conversation_id,
        "title": title,
        "current": content,
        "previous": old_current,
        "updatedAt": now,
        "updatedBy": user_id,
    }

    logger.info("Summary edited: conv=%s by=%s", conversation_id, user_id)
    return build_response(True, data={"summary": summary_data})


# ------------------------------------------------------------------
# Mock
# ------------------------------------------------------------------

def _mock_summary(current: str, messages: str) -> str:
    """Generate a mock summary for dev environment."""
    if current:
        return f"{current}\n\n## 追加メッセージ\n{messages}"
    return f"# 会話の要約\n\n## 決定事項\n- (要約生成中のモック)\n\n## TODO\n- メッセージ内容を確認\n\n## その他\n{messages}"
