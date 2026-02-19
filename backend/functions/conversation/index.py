"""Conversation Management Lambda Handler.

Handles:
  - Query.getConversation
  - Query.listConversations
  - Mutation.createConversation
  - Mutation.joinConversation
  - Mutation.leaveConversation
  - Mutation.updateLastMessageId
"""
import logging
from typing import Any

from common.config import get_config
from common.utils import (
    build_response,
    generate_uuid,
    generate_short_id,
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
        "leaveConversation": handle_leave_conversation,
        "updateLastMessageId": handle_update_last_message_id,
        "updateConversationTitle": handle_update_conversation_title,
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
    """List conversations for a user from UserConversations table.
    
    Only returns conversations where user role is not 'inactive'.
    """
    login_id = args.get("loginId")

    # Query UserConversations table
    user_conversations_table = get_dynamodb_table(config.user_conversations_table)
    response = user_conversations_table.query(
        KeyConditionExpression="loginId = :lid",
        FilterExpression="attribute_not_exists(#role) OR #role <> :inactive",
        ExpressionAttributeNames={"#role": "role"},
        ExpressionAttributeValues={":lid": login_id, ":inactive": "inactive"}
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

    conversation_id = generate_short_id(8)  # 8-char short ID instead of UUID
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

    # Add user-conversation relationship with role='creator'
    user_conversations_table = get_dynamodb_table(config.user_conversations_table)
    user_conversations_table.put_item(
        Item={
            "loginId": created_by,
            "conversationId": conversation_id,
            "joinedAt": now,
            "role": "creator",
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

    # Add or reactivate user-conversation relationship
    user_conversations_table = get_dynamodb_table(config.user_conversations_table)
    existing_uc = user_conversations_table.get_item(
        Key={"loginId": login_id, "conversationId": conversation_id}
    ).get("Item")

    if existing_uc and existing_uc.get("role") == "inactive":
        # Reactivate inactive participant
        user_conversations_table.update_item(
            Key={"loginId": login_id, "conversationId": conversation_id},
            UpdateExpression="SET #role = :role, joinedAt = :now",
            ExpressionAttributeNames={"#role": "role"},
            ExpressionAttributeValues={":role": "participant", ":now": utc_now_iso()},
        )
    elif not existing_uc:
        # New participant
        user_conversations_table.put_item(
            Item={
                "loginId": login_id,
                "conversationId": conversation_id,
                "joinedAt": utc_now_iso(),
                "role": "participant",
            }
        )
    # If already active, do nothing (idempotent)

    # Fetch title
    summary_table = get_dynamodb_table(config.summary_table)
    summary_resp = summary_table.get_item(Key={"conversationId": conversation_id})
    conv_item["title"] = summary_resp.get("Item", {}).get("title", "")

    logger.info(
        "User joined conversation: %s -> %s", login_id, conversation_id
    )
    return build_response(True, data={"conversation": conv_item})


def handle_leave_conversation(args: dict) -> dict[str, Any]:
    """Leave an existing conversation by setting role to 'inactive'."""
    inp = args.get("input", {})
    login_id = inp.get("loginId")
    conversation_id = inp.get("conversationId")

    if not login_id or not conversation_id:
        return build_response(
            False, error="loginId and conversationId are required."
        )

    user_conversations_table = get_dynamodb_table(config.user_conversations_table)
    response = user_conversations_table.get_item(
        Key={"loginId": login_id, "conversationId": conversation_id}
    )
    existing = response.get("Item")

    if not existing:
        return build_response(False, error="Not a participant.")

    if existing.get("role") == "creator":
        return build_response(
            False, error="Creator cannot leave conversation."
        )

    if existing.get("role") == "inactive":
        return build_response(
            False, error="Already left this conversation."
        )

    # Set role to 'inactive'
    user_conversations_table.update_item(
        Key={"loginId": login_id, "conversationId": conversation_id},
        UpdateExpression="SET #role = :role",
        ExpressionAttributeNames={"#role": "role"},
        ExpressionAttributeValues={":role": "inactive"},
    )

    logger.info(
        "User left conversation: %s -> %s", login_id, conversation_id
    )
    return build_response(
        True, data={"conversationId": conversation_id}
    )


def handle_update_last_message_id(args: dict) -> dict[str, Any]:
    """Update the lastMessageId for a user in a conversation."""
    inp = args.get("input", {})
    login_id = inp.get("loginId")
    conversation_id = inp.get("conversationId")
    message_id = inp.get("messageId")

    if not login_id or not conversation_id or not message_id:
        return build_response(
            False,
            error="loginId, conversationId, and messageId are required.",
        )

    user_conversations_table = get_dynamodb_table(config.user_conversations_table)
    response = user_conversations_table.get_item(
        Key={"loginId": login_id, "conversationId": conversation_id}
    )
    existing = response.get("Item")

    if not existing or existing.get("role") == "inactive":
        return build_response(False, error="Not an active participant.")

    now = utc_now_iso()
    user_conversations_table.update_item(
        Key={"loginId": login_id, "conversationId": conversation_id},
        UpdateExpression="SET lastMessageId = :msgId, lastUpdatedAt = :now",
        ExpressionAttributeValues={":msgId": message_id, ":now": now},
    )

    # Fetch updated record
    updated = user_conversations_table.get_item(
        Key={"loginId": login_id, "conversationId": conversation_id}
    ).get("Item", {})

    logger.info(
        "LastMessageId updated: user=%s, conv=%s, msg=%s",
        login_id,
        conversation_id,
        message_id,
    )
    return build_response(True, data={"userConversation": updated})


def handle_update_conversation_title(args: dict) -> dict:
    """Update the title of a conversation."""
    inp = args.get("input", {})
    conversation_id = inp.get("conversationId")
    title = inp.get("title", "").strip()

    if not conversation_id:
        raise ValueError("conversationId is required.")

    # Update title in Conversations table
    conversations_table = get_dynamodb_table(config.conversations_table)
    conversations_table.update_item(
        Key={"conversationId": conversation_id},
        UpdateExpression="SET title = :title",
        ExpressionAttributeValues={":title": title},
    )

    # Also update title in Summary table for consistency
    summary_table = get_dynamodb_table(config.summary_table)
    summary_table.update_item(
        Key={"conversationId": conversation_id},
        UpdateExpression="SET title = :title",
        ExpressionAttributeValues={":title": title},
    )

    # Return updated conversation
    conv_resp = conversations_table.get_item(
        Key={"conversationId": conversation_id}
    )
    conv_item = conv_resp.get("Item", {})
    conv_item["title"] = title

    logger.info(
        "Conversation title updated: %s -> %s", conversation_id, title
    )
    return conv_item
