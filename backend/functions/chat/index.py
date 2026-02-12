"""Chat Lambda Handler.

Handles:
  - Query.listMessages
  - Mutation.sendMessage
"""
import logging
import sys
import os

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from common.config import get_config
from common.utils import (
    build_response,
    generate_uuid,
    get_dynamodb_table,
    utc_now_iso,
)

logger = logging.getLogger(__name__)
logger.setLevel(logging.INFO)

config = get_config()

# AIHelper fixed identity
AIHELPER_USER_ID = "AIHELPER"
AIHELPER_DISPLAY_NAME = "AIHelper"


def lambda_handler(event: dict, context) -> dict:
    """Route AppSync requests to the appropriate handler."""
    info = event.get("info", {})
    field = info.get("fieldName", "")
    arguments = event.get("arguments", {})

    logger.info("Chat invoked: field=%s", field)

    handlers = {
        "listMessages": handle_list_messages,
        "sendMessage": handle_send_message,
    }

    handler = handlers.get(field)
    if not handler:
        return build_response(False, error=f"Unknown field: {field}")

    return handler(arguments)


# ── Queries ───────────────────────────────────────────────

def handle_list_messages(args: dict) -> dict:
    """Return messages for a conversation, ordered by timestamp."""
    conversation_id = args.get("conversationId")
    limit = args.get("limit", 100)
    next_token = args.get("nextToken")

    if not conversation_id:
        return {"items": [], "nextToken": None}

    table = get_dynamodb_table(config.messages_table)

    query_params = {
        "IndexName": "byTimestamp",
        "KeyConditionExpression": "conversationId = :cid",
        "ExpressionAttributeValues": {":cid": conversation_id},
        "ScanIndexForward": True,  # oldest first
        "Limit": limit,
    }

    if next_token:
        query_params["ExclusiveStartKey"] = {"conversationId": conversation_id, "timestamp": next_token}

    result = table.query(**query_params)
    items = result.get("Items", [])

    # Resolve display names
    users_table = get_dynamodb_table(config.users_table)
    user_cache: dict[str, str] = {AIHELPER_USER_ID: AIHELPER_DISPLAY_NAME}

    for item in items:
        uid = item.get("userId", "")
        if uid not in user_cache:
            user_data = users_table.get_item(Key={"loginId": uid}).get("Item", {})
            user_cache[uid] = user_data.get("displayName", uid)
        item["displayName"] = user_cache[uid]

    last_key = result.get("LastEvaluatedKey")
    return {
        "items": items,
        "nextToken": last_key.get("timestamp") if last_key else None,
    }


# ── Mutations ─────────────────────────────────────────────

def handle_send_message(args: dict) -> dict:
    """Post a new message to a conversation."""
    input_data = args.get("input", {})
    conversation_id = input_data.get("conversationId")
    user_id = input_data.get("userId")
    content = input_data.get("content", "").strip()

    if not conversation_id or not user_id or not content:
        return build_response(
            False, error="conversationId, userId, and content are required."
        )

    # Resolve display name
    if user_id == AIHELPER_USER_ID:
        display_name = AIHELPER_DISPLAY_NAME
    else:
        users_table = get_dynamodb_table(config.users_table)
        user_data = users_table.get_item(Key={"loginId": user_id}).get("Item", {})
        display_name = user_data.get("displayName", user_id)

    now = utc_now_iso()
    message_id = generate_uuid()

    message_item = {
        "conversationId": conversation_id,
        "messageId": message_id,
        "userId": user_id,
        "displayName": display_name,
        "content": content,
        "timestamp": now,
        "isUsedInSummary": False,
    }

    table = get_dynamodb_table(config.messages_table)
    table.put_item(Item=message_item)

    logger.info(
        "Message sent: conv=%s, user=%s, msgId=%s",
        conversation_id,
        user_id,
        message_id,
    )

    return build_response(True, data={"message": message_item})
