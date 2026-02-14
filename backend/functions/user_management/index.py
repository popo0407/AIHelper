"""User Management Lambda Handler.

Handles:
  - Query.listUsers
  - Query.getUser
  - Mutation.registerUser
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


def lambda_handler(event: dict, context) -> dict:
    """Route AppSync requests to the appropriate handler."""
    info = event.get("info", {})
    field = info.get("fieldName", "")
    arguments = event.get("arguments", {})

    logger.info("UserManagement invoked: field=%s", field)

    handlers = {
        "listUsers": handle_list_users,
        "getUser": handle_get_user,
        "registerUser": handle_register_user,
    }

    handler = handlers.get(field)
    if not handler:
        return build_response(False, error=f"Unknown field: {field}")

    return handler(arguments)


# ── Queries ───────────────────────────────────────────────

def handle_list_users(_args: dict) -> list[dict]:
    """Return all registered users."""
    table = get_dynamodb_table(config.users_table)
    result = table.scan()
    users = result.get("Items", [])

    # Convert conversationIds from DynamoDB set to list
    for user in users:
        if "conversationIds" not in user:
            user["conversationIds"] = []
        elif isinstance(user["conversationIds"], set):
            user["conversationIds"] = list(user["conversationIds"])

    return users


def handle_get_user(args: dict) -> dict | None:
    """Return a single user by loginId."""
    login_id = args.get("loginId")
    if not login_id:
        return None

    table = get_dynamodb_table(config.users_table)
    result = table.get_item(Key={"loginId": login_id})
    user = result.get("Item")

    if user and "conversationIds" not in user:
        user["conversationIds"] = []

    return user


# ── Mutations ─────────────────────────────────────────────

def handle_register_user(args: dict) -> dict:
    """Register a new user. Returns error if loginId already exists."""
    input_data = args.get("input", {})
    login_id = input_data.get("loginId", "").strip()
    display_name = input_data.get("displayName", "").strip()

    if not login_id or not display_name:
        return build_response(
            False, error="loginId and displayName are required."
        )

    table = get_dynamodb_table(config.users_table)

    # Duplicate check
    existing = table.get_item(Key={"loginId": login_id}).get("Item")
    if existing:
        return build_response(
            False, error="This ID is already registered."
        )

    now = utc_now_iso()
    user_item = {
        "loginId": login_id,
        "displayName": display_name,
        "createdAt": now,
        "conversationIds": [],
    }
    table.put_item(Item=user_item)

    logger.info("User registered: %s (%s)", login_id, display_name)

    return build_response(True, data={"user": user_item})
