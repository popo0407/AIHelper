"""Shared utility functions for AICHAT Lambda functions."""
import json
import uuid
import logging
from datetime import datetime, timezone
from typing import Any

import boto3

logger = logging.getLogger(__name__)
logger.setLevel(logging.INFO)


def generate_uuid() -> str:
    """Generate a UUID v4 string."""
    return str(uuid.uuid4())


def utc_now_iso() -> str:
    """Return current UTC time in ISO 8601 format."""
    return datetime.now(timezone.utc).isoformat()


def build_response(
    success: bool,
    data: dict[str, Any] | None = None,
    error: str | None = None,
) -> dict[str, Any]:
    """Build a standardised AppSync response payload."""
    response: dict[str, Any] = {"success": success}
    if data:
        response.update(data)
    if error:
        response["error"] = error
    return response


def get_dynamodb_resource():
    """Return a DynamoDB resource."""
    return boto3.resource("dynamodb")


def get_dynamodb_table(table_name: str):
    """Return a DynamoDB table resource."""
    dynamodb = get_dynamodb_resource()
    return dynamodb.Table(table_name)


def get_bedrock_client(region: str):
    """Return a Bedrock Runtime client for the given region."""
    return boto3.client("bedrock-runtime", region_name=region)


def invoke_bedrock(
    client,
    model_id: str,
    prompt: str,
    max_tokens: int = 4096,
    temperature: float = 0.3,
) -> str:
    """Invoke a Bedrock model and return the response text."""
    body = json.dumps(
        {
            "anthropic_version": "bedrock-2023-05-31",
            "max_tokens": max_tokens,
            "temperature": temperature,
            "messages": [{"role": "user", "content": prompt}],
        }
    )

    response = client.invoke_model(
        modelId=model_id,
        contentType="application/json",
        accept="application/json",
        body=body,
    )

    result = json.loads(response["body"].read())
    return result["content"][0]["text"]
