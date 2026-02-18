"""Lambda Functions Stack for AICHAT."""
import os
from aws_cdk import (
    Stack,
    Duration,
    RemovalPolicy,
    aws_lambda as lambda_,
    aws_iam as iam,
    aws_logs as logs,
    aws_s3 as s3,
    aws_s3_notifications as s3n,
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
        cloudfront_domain_name: str,
        bedrock_kb_id: str = "",
        bedrock_ds_id: str = "",
        use_mock_ai: bool = True,
        **kwargs,
    ) -> None:
        super().__init__(scope, id, **kwargs)

        self.env_name = env_name
        self.project_name = project_name
        self._cloudfront_domain_name = cloudfront_domain_name

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

        # Bedrock Agent (Knowledge Bases) access
        lambda_role.add_to_policy(
            iam.PolicyStatement(
                effect=iam.Effect.ALLOW,
                actions=[
                    "bedrock:Retrieve",
                    "bedrock:RetrieveAndGenerate",
                ],
                resources=["*"],
            )
        )

        # S3 access for knowledge bucket
        lambda_role.add_to_policy(
            iam.PolicyStatement(
                effect=iam.Effect.ALLOW,
                actions=[
                    "s3:GetObject",
                    "s3:PutObject",
                    "s3:DeleteObject",
                    "s3:ListBucket",
                ],
                resources=[
                    database_stack.knowledge_bucket.bucket_arn,
                    f"{database_stack.knowledge_bucket.bucket_arn}/*",
                ],
            )
        )

        # Common environment variables
        common_env = {
            "ENVIRONMENT": env_name,
            "PROJECT_NAME": project_name,
            "USER_CONVERSATIONS_TABLE": database_stack.user_conversations_table.table_name,
            "MESSAGES_TABLE": database_stack.messages_table.table_name,
            "SUMMARY_TABLE": database_stack.summary_table.table_name,
            "LOCKS_TABLE": database_stack.locks_table.table_name,
            "CONVERSATIONS_TABLE": database_stack.conversations_table.table_name,
            "KNOWLEDGE_SOURCES_TABLE": database_stack.knowledge_sources_table.table_name,
            "KNOWLEDGE_BUCKET": database_stack.knowledge_bucket.bucket_name,
            "USE_MOCK_AI": "true" if use_mock_ai else "false",
            "BEDROCK_REGION": "ap-northeast-1",  # Tokyo region for Knowledge Base
            "BEDROCK_MODEL_ID": "anthropic.claude-3-haiku-20240307-v1:0",  # Haiku for RAG processing
            "BEDROCK_KB_ID": bedrock_kb_id,
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
            timeout=Duration.seconds(30),
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

        # =========================================================
        # Knowledgebase Lambda
        # =========================================================
        self.knowledgebase_fn = lambda_.Function(
            self,
            "KnowledgebaseFunction",
            function_name=f"{project_name}-{env_name}-knowledgebase",
            runtime=lambda_.Runtime.PYTHON_3_12,
            handler="index.lambda_handler",
            code=lambda_.Code.from_asset(
                os.path.join(backend_path, "functions", "knowledgebase")
            ),
            layers=[common_layer],
            timeout=Duration.seconds(30),
            memory_size=512,
            environment=common_env,
            role=lambda_role,
            log_retention=logs.RetentionDays.ONE_WEEK,
        )

        # CloudFront ドメインを Knowledgebase Lambda のみに追加
        self.knowledgebase_fn.add_environment(
            "CLOUDFRONT_DOMAIN_NAME", self._cloudfront_domain_name
        )

        # =========================================================
        # Ingestion Trigger Lambda (Auto-sync for Knowledge Base)
        # =========================================================
        if bedrock_kb_id and bedrock_ds_id:
            # IAM Role for Ingestion Trigger
            ingestion_trigger_role = iam.Role(
                self,
                "IngestionTriggerRole",
                assumed_by=iam.ServicePrincipal("lambda.amazonaws.com"),
                managed_policies=[
                    iam.ManagedPolicy.from_aws_managed_policy_name(
                        "service-role/AWSLambdaBasicExecutionRole"
                    )
                ]
            )
            
            # Grant permission to start ingestion jobs
            ingestion_trigger_role.add_to_policy(
                iam.PolicyStatement(
                    effect=iam.Effect.ALLOW,
                    actions=[
                        "bedrock:StartIngestionJob",
                        "bedrock:GetIngestionJob",
                        "bedrock:ListIngestionJobs"
                    ],
                    resources=[
                        f"arn:aws:bedrock:{self.region}:{self.account}:knowledge-base/{bedrock_kb_id}"
                    ]
                )
            )
            
            # Ingestion Trigger Lambda Function
            self.ingestion_trigger_fn = lambda_.Function(
                self,
                "IngestionTriggerFunction",
                function_name=f"{project_name}-{env_name}-ingestion-trigger",
                runtime=lambda_.Runtime.PYTHON_3_12,
                handler="index.lambda_handler",
                code=lambda_.Code.from_asset(
                    os.path.join(backend_path, "functions", "ingestion_trigger")
                ),
                role=ingestion_trigger_role,
                timeout=Duration.seconds(60),
                memory_size=256,
                environment={
                    "BEDROCK_KB_ID": bedrock_kb_id,
                    "BEDROCK_DS_ID": bedrock_ds_id,
                    "BEDROCK_REGION": self.region,
                    "ENVIRONMENT": env_name
                },
                log_retention=logs.RetentionDays.ONE_WEEK,
            )
            
            # Reference S3 bucket from database stack (avoid circular dependency)
            knowledge_bucket = s3.Bucket.from_bucket_name(
                self,
                "KnowledgeBucketRef",
                database_stack.knowledge_bucket.bucket_name
            )
            
            # S3 Event Notification: ObjectCreated (upload)
            knowledge_bucket.add_event_notification(
                s3.EventType.OBJECT_CREATED,
                s3n.LambdaDestination(self.ingestion_trigger_fn),
                s3.NotificationKeyFilter(prefix="conversations/")
            )
            
            # S3 Event Notification: ObjectRemoved (delete)
            knowledge_bucket.add_event_notification(
                s3.EventType.OBJECT_REMOVED,
                s3n.LambdaDestination(self.ingestion_trigger_fn),
                s3.NotificationKeyFilter(prefix="conversations/")
            )
