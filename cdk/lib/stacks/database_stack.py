"""DynamoDB Tables Stack for AICHAT."""
from aws_cdk import (
    Stack,
    RemovalPolicy,
    aws_dynamodb as dynamodb,
    aws_s3 as s3,
    aws_iam as iam,
)
from constructs import Construct


class DatabaseStack(Stack):
    """DynamoDB tables for the AICHAT application."""

    def __init__(
        self,
        scope: Construct,
        id: str,
        env_name: str,
        project_name: str,
        **kwargs,
    ) -> None:
        super().__init__(scope, id, **kwargs)

        self.env_name = env_name
        self.project_name = project_name

        removal = (
            RemovalPolicy.DESTROY if env_name == "dev" else RemovalPolicy.RETAIN
        )

        # =========================================================
        # UserConversations Table  PK: loginId, SK: conversationId
        # ユーザーと会話の参加関係を管理（Cognito がユーザー管理）
        # =========================================================
        self.user_conversations_table = dynamodb.Table(
            self,
            "UserConversationsTable",
            table_name=f"{project_name}-{env_name}-user-conversations",
            partition_key=dynamodb.Attribute(
                name="loginId", type=dynamodb.AttributeType.STRING
            ),
            sort_key=dynamodb.Attribute(
                name="conversationId", type=dynamodb.AttributeType.STRING
            ),
            billing_mode=dynamodb.BillingMode.PAY_PER_REQUEST,
            removal_policy=removal,
            point_in_time_recovery=env_name == "prod",
        )

        # GSI: conversationId で検索（会話の全参加者を取得）
        self.user_conversations_table.add_global_secondary_index(
            index_name="byConversation",
            partition_key=dynamodb.Attribute(
                name="conversationId", type=dynamodb.AttributeType.STRING
            ),
            projection_type=dynamodb.ProjectionType.ALL,
        )

        # =========================================================
        # Messages Table  PK: conversationId, SK: messageId
        # =========================================================
        self.messages_table = dynamodb.Table(
            self,
            "MessagesTable",
            table_name=f"{project_name}-{env_name}-messages",
            partition_key=dynamodb.Attribute(
                name="conversationId", type=dynamodb.AttributeType.STRING
            ),
            sort_key=dynamodb.Attribute(
                name="messageId", type=dynamodb.AttributeType.STRING
            ),
            billing_mode=dynamodb.BillingMode.PAY_PER_REQUEST,
            removal_policy=removal,
            point_in_time_recovery=env_name == "prod",
        )

        # GSI: timestamp-based sorting for message retrieval
        self.messages_table.add_global_secondary_index(
            index_name="byTimestamp",
            partition_key=dynamodb.Attribute(
                name="conversationId", type=dynamodb.AttributeType.STRING
            ),
            sort_key=dynamodb.Attribute(
                name="timestamp", type=dynamodb.AttributeType.STRING
            ),
            projection_type=dynamodb.ProjectionType.ALL,
        )

        # =========================================================
        # Summary Table  PK: conversationId
        # =========================================================
        self.summary_table = dynamodb.Table(
            self,
            "SummaryTable",
            table_name=f"{project_name}-{env_name}-summary",
            partition_key=dynamodb.Attribute(
                name="conversationId", type=dynamodb.AttributeType.STRING
            ),
            billing_mode=dynamodb.BillingMode.PAY_PER_REQUEST,
            removal_policy=removal,
            point_in_time_recovery=env_name == "prod",
        )

        # =========================================================
        # Locks Table  PK: conversationId, SK: lockType
        #   TTL enabled for auto-expiry (3 min)
        # =========================================================
        self.locks_table = dynamodb.Table(
            self,
            "LocksTable",
            table_name=f"{project_name}-{env_name}-locks",
            partition_key=dynamodb.Attribute(
                name="conversationId", type=dynamodb.AttributeType.STRING
            ),
            sort_key=dynamodb.Attribute(
                name="lockType", type=dynamodb.AttributeType.STRING
            ),
            billing_mode=dynamodb.BillingMode.PAY_PER_REQUEST,
            removal_policy=removal,
            time_to_live_attribute="ttl",
        )

        # =========================================================
        # Conversations Table  PK: conversationId
        # =========================================================
        self.conversations_table = dynamodb.Table(
            self,
            "ConversationsTable",
            table_name=f"{project_name}-{env_name}-conversations",
            partition_key=dynamodb.Attribute(
                name="conversationId", type=dynamodb.AttributeType.STRING
            ),
            billing_mode=dynamodb.BillingMode.PAY_PER_REQUEST,
            removal_policy=removal,
            point_in_time_recovery=env_name == "prod",
        )

        # =========================================================
        # KnowledgeSources Table  PK: conversationId, SK: fileName
        # ナレッジベースのメタデータを管理（同名ファイルは上書き）
        # テーブル名変更: v2（キースキーマ変更のため再作成が必要）
        # =========================================================
        self.knowledge_sources_table = dynamodb.Table(
            self,
            "KnowledgeSourcesTable",
            table_name=f"{project_name}-{env_name}-knowledge-sources-v2",
            partition_key=dynamodb.Attribute(
                name="conversationId", type=dynamodb.AttributeType.STRING
            ),
            sort_key=dynamodb.Attribute(
                name="fileName", type=dynamodb.AttributeType.STRING
            ),
            billing_mode=dynamodb.BillingMode.PAY_PER_REQUEST,
            removal_policy=removal,
            point_in_time_recovery=env_name == "prod",
        )

        # =========================================================
        # S3 Bucket for Knowledgebase files
        # CloudFront 経由でアクセスするため S3 側の CORS 設定は不要。
        # presigned URL は IAM 認証付きなので BLOCK_ALL でも動作する。
        # =========================================================
        self.knowledge_bucket = s3.Bucket(
            self,
            "KnowledgeBucket",
            bucket_name=f"{project_name}-{env_name}-knowledge-{self.account}",
            removal_policy=removal,
            auto_delete_objects=env_name == "dev",
            block_public_access=s3.BlockPublicAccess.BLOCK_ALL,
            encryption=s3.BucketEncryption.S3_MANAGED,
        )
