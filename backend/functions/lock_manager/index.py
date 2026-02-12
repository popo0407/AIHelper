"""Lock Manager Lambda Handler.

Handles:
  - Query.getLocks
  - Mutation.acquireLock
  - Mutation.releaseLock
"""
import logging
import time
from decimal import Decimal
from typing import Any

from common.config import get_config
from common.utils import (
    build_response,
    get_dynamodb_table,
    utc_now_iso,
)

logger = logging.getLogger(__name__)
logger.setLevel(logging.INFO)

config = get_config()

# Lock TTL: 3 minutes
LOCK_TTL_SECONDS = 180


def lambda_handler(event: dict[str, Any], context: Any) -> dict[str, Any]:
    """Route AppSync resolver events to the appropriate handler."""
    info = event.get("info", {})
    field_name = info.get("fieldName", "")
    arguments = event.get("arguments", {})

    logger.info("LockManager invoked: field=%s", field_name)

    handlers = {
        "getLocks": handle_get_locks,
        "acquireLock": handle_acquire_lock,
        "releaseLock": handle_release_lock,
    }

    handler = handlers.get(field_name)
    if not handler:
        logger.error("Unknown field: %s", field_name)
        return build_response(False, error=f"Unknown field: {field_name}")

    return handler(arguments)


# ------------------------------------------------------------------
# Handlers
# ------------------------------------------------------------------

def handle_get_locks(args: dict) -> list[dict]:
    """Return all active locks for a conversation."""
    conversation_id = args.get("conversationId")
    table = get_dynamodb_table(config.locks_table)

    response = table.query(
        KeyConditionExpression="conversationId = :cid",
        ExpressionAttributeValues={":cid": conversation_id},
    )

    now = int(time.time())
    active_locks = []
    for item in response.get("Items", []):
        ttl_val = item.get("ttl", 0)
        if isinstance(ttl_val, (int, float, Decimal)) and int(ttl_val) > now:
            active_locks.append(item)

    return active_locks


def handle_acquire_lock(args: dict) -> dict[str, Any]:
    """Acquire a lock for editing or summarizing."""
    inp = args.get("input", {})
    conversation_id = inp.get("conversationId")
    user_id = inp.get("userId")
    operation_type = inp.get("operationType", "edit")

    if not conversation_id or not user_id:
        return build_response(
            False, error="conversationId and userId are required."
        )

    if operation_type not in ("edit", "summarize"):
        return build_response(
            False, error="operationType must be 'edit' or 'summarize'."
        )

    table = get_dynamodb_table(config.locks_table)
    now = int(time.time())

    # Check for existing active locks of the same type
    lock_type = f"{operation_type}"
    response = table.query(
        KeyConditionExpression="conversationId = :cid",
        ExpressionAttributeValues={":cid": conversation_id},
    )

    for existing in response.get("Items", []):
        existing_ttl = existing.get("ttl", 0)
        if isinstance(existing_ttl, (int, float, Decimal)) and int(existing_ttl) > now:
            existing_op = existing.get("operationType", "")
            if existing_op in ("edit", "summarize"):
                existing_user = existing.get("userId", "")
                if existing_user != user_id:
                    return build_response(
                        False,
                        error=f"Currently locked by another user ({existing_user}).",
                    )

    # Create lock
    ttl_value = now + LOCK_TTL_SECONDS
    start_time = utc_now_iso()

    lock_item = {
        "conversationId": conversation_id,
        "lockType": f"{operation_type}#{user_id}",
        "userId": user_id,
        "operationType": operation_type,
        "startTime": start_time,
        "ttl": ttl_value,
    }

    table.put_item(Item=lock_item)

    logger.info(
        "Lock acquired: conv=%s user=%s op=%s",
        conversation_id,
        user_id,
        operation_type,
    )
    return build_response(True, data={"lock": lock_item})


def handle_release_lock(args: dict) -> dict[str, Any]:
    """Release a lock."""
    inp = args.get("input", {})
    conversation_id = inp.get("conversationId")
    user_id = inp.get("userId")

    if not conversation_id or not user_id:
        return build_response(
            False, error="conversationId and userId are required."
        )

    table = get_dynamodb_table(config.locks_table)

    # Find and delete locks for this user
    response = table.query(
        KeyConditionExpression="conversationId = :cid",
        ExpressionAttributeValues={":cid": conversation_id},
    )

    deleted = False
    for item in response.get("Items", []):
        if item.get("userId") == user_id:
            table.delete_item(
                Key={
                    "conversationId": conversation_id,
                    "lockType": item["lockType"],
                }
            )
            deleted = True

    if not deleted:
        return build_response(False, error="No lock found for this user.")

    logger.info("Lock released: conv=%s user=%s", conversation_id, user_id)
    return build_response(
        True,
        data={
            "lock": {
                "conversationId": conversation_id,
                "lockType": "released",
                "userId": user_id,
                "operationType": "released",
                "startTime": utc_now_iso(),
            }
        },
    )
