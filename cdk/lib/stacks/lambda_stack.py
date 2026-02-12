"""Lambda Functions Stack for AICHAT."""
import os
from aws_cdk import (
    Stack,
    Duration,
    RemovalPolicy,
    aws_lambda as lambda_,
    aws_iam as iam,
    aws_logs as logs,
)
from constructs import Construct

from lib.stacks.database_stack import DatabaseStack


class LambdaStack(Stack):
    """Lambda functions for the AICHAT application."""

    def __init__(
        self,
        scope: Construct,
        id: str,
        env_name: str,
        project_name: str,
        database_stack: DatabaseStack,
        **kwargs,
    ) -> None:
        super().__init__(scope, id, **kwargs)

        self.env_name = env_name
        self.project_name = project_name

        backend_path = os.path.join(os.path.dirname(__file__), "../../../backend")

        # =========================================================
        # IAM Role for Lambda
        # =========================================================
        lambda_role = iam.Role(
            self,
            "LambdaExecutionRole",
            assumed_by=iam.ServicePrincipal("lambda.amazonaws.com"),
            managed_policies=[
                iam.ManagedPolicy.from_aws_managed_policy_name(
                    "service-role/AWSLambdaBasicExecutionRole"
                ),
            ],
        )

        # DynamoDB access
        lambda_role.add_to_policy(
            iam.PolicyStatement(
                effect=iam.Effect.ALLOW,
                actions=[
                    "dynamodb:GetItem",
                    "dynamodb:Query",
                    "dynamodb:Scan",
                    "dynamodb:PutItem",
                    "dynamodb:UpdateItem",
                    "dynamodb:DeleteItem",
                    "dynamodb:BatchWriteItem",
                    "dynamodb:BatchGetItem",
                ],
                resources=[
                    f"arn:aws:dynamodb:{self.region}:{self.account}:table/{project_name}-{env_name}-*",
                    f"arn:aws:dynamodb:{self.region}:{self.account}:table/{project_name}-{env_name}-*/index/*",
                ],
            )
        )

        # Bedrock access (both dev & prod -- dev uses mock flag)
        lambda_role.add_to_policy(
            iam.PolicyStatement(
                effect=iam.Effect.ALLOW,
                actions=[
                    "bedrock:InvokeModel",
                    "bedrock:InvokeModelWithResponseStream",
                ],
                resources=["*"],
            )
        )

        # Common environment variables
        common_env = {
            "ENVIRONMENT": env_name,
            "PROJECT_NAME": project_name,
            "USERS_TABLE": database_stack.users_table.table_name,
            "MESSAGES_TABLE": database_stack.messages_table.table_name,
            "SUMMARY_TABLE": database_stack.summary_table.table_name,
            "LOCKS_TABLE": database_stack.locks_table.table_name,
            "CONVERSATIONS_TABLE": database_stack.conversations_table.table_name,
            "USE_MOCK_AI": "true" if env_name == "dev" else "false",
            "BEDROCK_REGION": "us-west-2",
            "BEDROCK_MODEL_ID": "us.anthropic.claude-haiku-4-5-20251001-v1:0",
        }

        # =========================================================
        # Common Layer
        # =========================================================
        common_layer = lambda_.LayerVersion(
            self,
            "CommonLayer",
            code=lambda_.Code.from_asset(
                os.path.join(backend_path, "layers", "common")
            ),
            compatible_runtimes=[lambda_.Runtime.PYTHON_3_12],
            removal_policy=RemovalPolicy.DESTROY,
            description=f"{project_name}-{env_name}-common-layer",
        )

        # =========================================================
        # User Management Lambda
        # =========================================================
        self.user_management_fn = lambda_.Function(
            self,
            "UserManagementFunction",
            function_name=f"{project_name}-{env_name}-user-management",
            runtime=lambda_.Runtime.PYTHON_3_12,
            handler="index.lambda_handler",
            code=lambda_.Code.from_asset(
                os.path.join(backend_path, "functions", "user_management")
            ),
            layers=[common_layer],
            timeout=Duration.seconds(30),
            memory_size=256,
            environment=common_env,
            role=lambda_role,
            log_retention=logs.RetentionDays.ONE_WEEK,
        )

        # =========================================================
        # Chat Lambda
        # =========================================================
        self.chat_fn = lambda_.Function(
            self,
            "ChatFunction",
            function_name=f"{project_name}-{env_name}-chat",
            runtime=lambda_.Runtime.PYTHON_3_12,
            handler="index.lambda_handler",
            code=lambda_.Code.from_asset(
                os.path.join(backend_path, "functions", "chat")
            ),
            layers=[common_layer],
            timeout=Duration.seconds(30),
            memory_size=256,
            environment=common_env,
            role=lambda_role,
            log_retention=logs.RetentionDays.ONE_WEEK,
        )

        # =========================================================
        # Summarizer Lambda
        # =========================================================
        self.summarizer_fn = lambda_.Function(
            self,
            "SummarizerFunction",
            function_name=f"{project_name}-{env_name}-summarizer",
            runtime=lambda_.Runtime.PYTHON_3_12,
            handler="index.lambda_handler",
            code=lambda_.Code.from_asset(
                os.path.join(backend_path, "functions", "summarizer")
            ),
            layers=[common_layer],
            timeout=Duration.seconds(120),
            memory_size=512,
            environment=common_env,
            role=lambda_role,
            log_retention=logs.RetentionDays.ONE_WEEK,
        )

        # =========================================================
        # AI Support Lambda
        # =========================================================
        self.ai_support_fn = lambda_.Function(
            self,
            "AISupportFunction",
            function_name=f"{project_name}-{env_name}-ai-support",
            runtime=lambda_.Runtime.PYTHON_3_12,
            handler="index.lambda_handler",
            code=lambda_.Code.from_asset(
                os.path.join(backend_path, "functions", "ai_support")
            ),
            layers=[common_layer],
            timeout=Duration.seconds(120),
            memory_size=512,
            environment=common_env,
            role=lambda_role,
            log_retention=logs.RetentionDays.ONE_WEEK,
        )

        # =========================================================
        # Lock Manager Lambda
        # =========================================================
        self.lock_manager_fn = lambda_.Function(
            self,
            "LockManagerFunction",
            function_name=f"{project_name}-{env_name}-lock-manager",
            runtime=lambda_.Runtime.PYTHON_3_12,
            handler="index.lambda_handler",
            code=lambda_.Code.from_asset(
                os.path.join(backend_path, "functions", "lock_manager")
            ),
            layers=[common_layer],
            timeout=Duration.seconds(30),
            memory_size=256,
            environment=common_env,
            role=lambda_role,
            log_retention=logs.RetentionDays.ONE_WEEK,
        )

        # =========================================================
        # Conversation Management Lambda
        # =========================================================
        self.conversation_fn = lambda_.Function(
            self,
            "ConversationFunction",
            function_name=f"{project_name}-{env_name}-conversation",
            runtime=lambda_.Runtime.PYTHON_3_12,
            handler="index.lambda_handler",
            code=lambda_.Code.from_asset(
                os.path.join(backend_path, "functions", "conversation")
            ),
            layers=[common_layer],
            timeout=Duration.seconds(30),
            memory_size=256,
            environment=common_env,
            role=lambda_role,
            log_retention=logs.RetentionDays.ONE_WEEK,
        )
