"""Configuration module for AICHAT Lambda functions."""
import os
from dataclasses import dataclass


@dataclass(frozen=True)
class AppConfig:
    """Application configuration loaded from environment variables."""

    environment: str
    project_name: str
    user_conversations_table: str
    messages_table: str
    summary_table: str
    locks_table: str
    conversations_table: str
    knowledge_sources_table: str
    knowledge_bucket: str
    use_mock_ai: bool
    bedrock_region: str
    bedrock_model_id: str


def get_config() -> AppConfig:
    """Load configuration from environment variables."""
    return AppConfig(
        environment=os.environ.get("ENVIRONMENT", "dev"),
        project_name=os.environ.get("PROJECT_NAME", "aichat"),
        user_conversations_table=os.environ.get(
            "USER_CONVERSATIONS_TABLE", "aichat-dev-user-conversations"
        ),
        messages_table=os.environ.get("MESSAGES_TABLE", "aichat-dev-messages"),
        summary_table=os.environ.get("SUMMARY_TABLE", "aichat-dev-summary"),
        locks_table=os.environ.get("LOCKS_TABLE", "aichat-dev-locks"),
        conversations_table=os.environ.get(
            "CONVERSATIONS_TABLE", "aichat-dev-conversations"
        ),
        knowledge_sources_table=os.environ.get(
            "KNOWLEDGE_SOURCES_TABLE", "aichat-dev-knowledge-sources"
        ),
        knowledge_bucket=os.environ.get(
            "KNOWLEDGE_BUCKET", "aichat-dev-knowledge"
        ),
        use_mock_ai=os.environ.get("USE_MOCK_AI", "true").lower() == "true",
        bedrock_region=os.environ.get("BEDROCK_REGION", "us-west-2"),
        bedrock_model_id=os.environ.get(
            "BEDROCK_MODEL_ID", "us.anthropic.claude-haiku-4-5-20251001-v1:0"
        ),
    )
