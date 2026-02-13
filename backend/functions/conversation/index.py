"""Conversation Management Lambda Handler.

Handles:
  - Query.getConversation
  - Query.listConversations
  - Mutation.createConversation
  - Mutation.joinConversation
"""
import logging
from typing import Any

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


def lambda_handler(event: dict[str, Any], context: Any) -> dict[str, Any]:
    """Route AppSync resolver events to the appropriate handler."""
    info = event.get("info", {})
    field_name = info.get("fieldName", "")
    arguments = event.get("arguments", {})

    logger.info("Conversation invoked: field=%s", field_name)

    handlers = {
        "getConversation": handle_get_conversation,
        "listConversations": handle_list_conversations,
        "createConversation": handle_create_conversation,
        "joinConversation": handle_join_conversation,
    }

    handler = handlers.get(field_name)
    if not handler:
        logger.error("Unknown field: %s", field_name)
        return build_response(False, error=f"Unknown field: {field_name}")

    return handler(arguments)


# ------------------------------------------------------------------
# Handlers
# ------------------------------------------------------------------

def handle_get_conversation(args: dict) -> dict | None:
    """Retrieve a single conversation."""
    conversation_id = args.get("conversationId")
    table = get_dynamodb_table(config.conversations_table)
    response = table.get_item(Key={"conversationId": conversation_id})
    item = response.get("Item")

    if item:
        # Fetch title from summary table
        summary_table = get_dynamodb_table(config.summary_table)
        summary_resp = summary_table.get_item(
            Key={"conversationId": conversation_id}
        )
        summary_item = summary_resp.get("Item", {})
        item["title"] = summary_item.get("title", "")

    return item


def handle_list_conversations(args: dict) -> list[dict]:
    """List conversations for a user from UserConversations table."""
    login_id = args.get("loginId")

    # Query UserConversations table
    user_conversations_table = get_dynamodb_table(config.user_conversations_table)
    response = user_conversations_table.query(
        KeyConditionExpression="loginId = :lid",
        ExpressionAttributeValues={":lid": login_id}
    )
    
    user_conversation_items = response.get("Items", [])
    
    if not user_conversation_items:
        return []

    # Extract conversation IDs
    conversation_ids = [item["conversationId"] for item in user_conversation_items]

    # Fetch each conversation
    conversations_table = get_dynamodb_table(config.conversations_table)
    summary_table = get_dynamodb_table(config.summary_table)
    conversations = []

    for cid in conversation_ids:
        conv_resp = conversations_table.get_item(Key={"conversationId": cid})
        conv_item = conv_resp.get("Item")
        if conv_item:
            # Attach title from summary
            summary_resp = summary_table.get_item(Key={"conversationId": cid})
            summary_item = summary_resp.get("Item", {})
            conv_item["title"] = summary_item.get("title", "")
            conversations.append(conv_item)

    return conversations


def handle_create_conversation(args: dict) -> dict[str, Any]:
    """Create a new conversation."""
    inp = args.get("input", {})
    created_by = inp.get("createdBy")

    if not created_by:
        return build_response(False, error="createdBy is required.")

    conversation_id = generate_uuid()
    now = utc_now_iso()

    conversation_item = {
        "conversationId": conversation_id,
        "createdBy": created_by,
        "createdAt": now,
        "participants": [created_by],
        "status": "active",
        "shareLink": f"/chat?cid={conversation_id}",
    }

    # Save conversation
    conversations_table = get_dynamodb_table(config.conversations_table)
    conversations_table.put_item(Item=conversation_item)

    # Initialize empty summary
    summary_table = get_dynamodb_table(config.summary_table)
    summary_table.put_item(
        Item={
            "conversationId": conversation_id,
            "title": "",
            "current": "",
            "previous": "",
            "updatedAt": now,
            "updatedBy": created_by,
        }
    )

    # Add user-conversation relationship
    user_conversations_table = get_dynamodb_table(config.user_conversations_table)
    user_conversations_table.put_item(
        Item={
            "loginId": created_by,
            "conversationId": conversation_id,
            "joinedAt": now,
        }
    )

    conversation_item["title"] = ""

    logger.info(
        "Conversation created: %s by %s", conversation_id, created_by
    )
    return build_response(True, data={"conversation": conversation_item})


def handle_join_conversation(args: dict) -> dict[str, Any]:
    """Join an existing conversation."""
    inp = args.get("input", {})
    login_id = inp.get("loginId")
    conversation_id = inp.get("conversationId")

    if not login_id or not conversation_id:
        return build_response(
            False, error="loginId and conversationId are required."
        )

    # Check conversation exists
    conversations_table = get_dynamodb_table(config.conversations_table)
    conv_resp = conversations_table.get_item(
        Key={"conversationId": conversation_id}
    )
    conv_item = conv_resp.get("Item")

    if not conv_item:
        return build_response(False, error="Conversation not found.")

    # Add user to participants (if not already there)
    participants = conv_item.get("participants", [])
    if login_id not in participants:
        conversations_table.update_item(
            Key={"conversationId": conversation_id},
            UpdateExpression="SET participants = list_append(participants, :uid)",
            ExpressionAttributeValues={":uid": [login_id]},
        )

    # Add user-conversation relationship
    user_conversations_table = get_dynamodb_table(config.user_conversations_table)
    try:
        user_conversations_table.put_item(
            Item={
                "loginId": login_id,
                "conversationId": conversation_id,
                "joinedAt": utc_now_iso(),
            },
            ConditionExpression="attribute_not_exists(loginId) AND attribute_not_exists(conversationId)"
        )
    except Exception:
        # Already joined - ignore
        pass

    # Fetch title
    summary_table = get_dynamodb_table(config.summary_table)
    summary_resp = summary_table.get_item(Key={"conversationId": conversation_id})
    conv_item["title"] = summary_resp.get("Item", {}).get("title", "")

    logger.info(
        "User joined conversation: %s -> %s", login_id, conversation_id
    )
    return build_response(True, data={"conversation": conv_item})
