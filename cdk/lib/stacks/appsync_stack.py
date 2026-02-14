"""AppSync GraphQL API Stack for AICHAT."""
import os
from aws_cdk import (
    Stack,
    CfnOutput,
    aws_appsync as appsync,
    aws_iam as iam,
    aws_cognito as cognito,
)
from constructs import Construct

from lib.stacks.lambda_stack import LambdaStack


class AppSyncStack(Stack):
    """AppSync GraphQL API with Lambda resolvers."""

    def __init__(
        self,
        scope: Construct,
        id: str,
        env_name: str,
        project_name: str,
        lambda_stack: LambdaStack,
        user_pool: cognito.IUserPool,
        **kwargs,
    ) -> None:
        super().__init__(scope, id, **kwargs)

        self.env_name = env_name
        self.project_name = project_name

        schema_path = os.path.join(
            os.path.dirname(__file__), "../../../cdk/graphql/schema.graphql"
        )

        # =========================================================
        # AppSync API
        # =========================================================
        self.api = appsync.GraphqlApi(
            self,
            "GraphqlApi",
            name=f"{project_name}-{env_name}-api",
            definition=appsync.Definition.from_file(schema_path),
            authorization_config=appsync.AuthorizationConfig(
                default_authorization=appsync.AuthorizationMode(
                    authorization_type=appsync.AuthorizationType.USER_POOL,
                    user_pool_config=appsync.UserPoolConfig(
                        user_pool=user_pool,
                    ),
                ),
            ),
            log_config=appsync.LogConfig(
                field_log_level=appsync.FieldLogLevel.ERROR,
            ),
            xray_enabled=env_name == "prod",
        )

        # =========================================================
        # Lambda Data Sources
        # =========================================================
        chat_ds = self.api.add_lambda_data_source(
            "ChatDS", lambda_stack.chat_fn
        )
        summarizer_ds = self.api.add_lambda_data_source(
            "SummarizerDS", lambda_stack.summarizer_fn
        )
        ai_support_ds = self.api.add_lambda_data_source(
            "AISupportDS", lambda_stack.ai_support_fn
        )
        lock_ds = self.api.add_lambda_data_source(
            "LockDS", lambda_stack.lock_manager_fn
        )
        conversation_ds = self.api.add_lambda_data_source(
            "ConversationDS", lambda_stack.conversation_fn
        )
        knowledgebase_ds = self.api.add_lambda_data_source(
            "KnowledgebaseDS", lambda_stack.knowledgebase_fn
        )

        # =========================================================
        # Query Resolvers
        # =========================================================
        conversation_ds.create_resolver(
            "GetConversationResolver",
            type_name="Query",
            field_name="getConversation",
        )
        conversation_ds.create_resolver(
            "ListConversationsResolver",
            type_name="Query",
            field_name="listConversations",
        )
        chat_ds.create_resolver(
            "ListMessagesResolver",
            type_name="Query",
            field_name="listMessages",
        )
        summarizer_ds.create_resolver(
            "GetSummaryResolver",
            type_name="Query",
            field_name="getSummary",
        )
        lock_ds.create_resolver(
            "GetLocksResolver",
            type_name="Query",
            field_name="getLocks",
        )
        knowledgebase_ds.create_resolver(
            "ListKnowledgeSourcesResolver",
            type_name="Query",
            field_name="listKnowledgeSources",
        )

        # =========================================================
        # Mutation Resolvers
        # =========================================================
        conversation_ds.create_resolver(
            "CreateConversationResolver",
            type_name="Mutation",
            field_name="createConversation",
        )
        conversation_ds.create_resolver(
            "JoinConversationResolver",
            type_name="Mutation",
            field_name="joinConversation",
        )
        chat_ds.create_resolver(
            "SendMessageResolver",
            type_name="Mutation",
            field_name="sendMessage",
        )
        summarizer_ds.create_resolver(
            "UpdateSummaryResolver",
            type_name="Mutation",
            field_name="updateSummary",
        )
        summarizer_ds.create_resolver(
            "UndoSummaryResolver",
            type_name="Mutation",
            field_name="undoSummary",
        )
        summarizer_ds.create_resolver(
            "SaveSummaryEditResolver",
            type_name="Mutation",
            field_name="saveSummaryEdit",
        )
        lock_ds.create_resolver(
            "AcquireLockResolver",
            type_name="Mutation",
            field_name="acquireLock",
        )
        lock_ds.create_resolver(
            "ReleaseLockResolver",
            type_name="Mutation",
            field_name="releaseLock",
        )
        ai_support_ds.create_resolver(
            "AskAIHelperResolver",
            type_name="Mutation",
            field_name="askAIHelper",
        )
        conversation_ds.create_resolver(
            "UpdateConversationTitleResolver",
            type_name="Mutation",
            field_name="updateConversationTitle",
        )
        knowledgebase_ds.create_resolver(
            "UploadKnowledgebaseResolver",
            type_name="Mutation",
            field_name="uploadKnowledgebase",
        )
        knowledgebase_ds.create_resolver(
            "DeleteKnowledgebaseResolver",
            type_name="Mutation",
            field_name="deleteKnowledgebase",
        )
        knowledgebase_ds.create_resolver(
            "SearchKnowledgebaseResolver",
            type_name="Mutation",
            field_name="searchKnowledgebase",
        )

        # =========================================================
        # Outputs
        # =========================================================
        CfnOutput(self, "GraphqlApiUrl", value=self.api.graphql_url)
        CfnOutput(self, "GraphqlApiKey", value=self.api.api_key or "")
        CfnOutput(self, "GraphqlApiId", value=self.api.api_id)
