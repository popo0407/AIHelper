#!/usr/bin/env python3
"""CDK Application Entry Point for AICHAT."""
import aws_cdk as cdk
from lib.stacks.database_stack import DatabaseStack
from lib.stacks.cognito_stack import CognitoStack
from lib.stacks.cloudfront_stack import CloudFrontStack
from lib.stacks.appsync_stack import AppSyncStack
from lib.stacks.lambda_stack import LambdaStack
from lib.stacks.frontend_stack import FrontendStack

app = cdk.App()

env_name = app.node.try_get_context("environment") or "dev"
project_name = "aichat"

# AI/モック切り替え（環境とは独立して制御可能）
use_mock_ai = app.node.try_get_context("useMockAI")
if use_mock_ai is None:
    use_mock_ai = (env_name == "dev")  # デフォルト: devならtrue

aws_env = cdk.Environment(
    region="ap-northeast-1",
)

# Database (DynamoDB)
database_stack = DatabaseStack(
    app, f"{project_name}-{env_name}-database",
    env_name=env_name,
    project_name=project_name,
    env=aws_env,
)

# Cognito User Pool
cognito_stack = CognitoStack(
    app, f"{project_name}-{env_name}-cognito",
    env_name=env_name,
    project_name=project_name,
    env=aws_env,
)

# CloudFront Distribution (Knowledge S3 Bucket)
cloudfront_stack = CloudFrontStack(
    app, f"{project_name}-{env_name}-cloudfront",
    env_name=env_name,
    project_name=project_name,
    knowledge_bucket=database_stack.knowledge_bucket,
    env=aws_env,
)
cloudfront_stack.add_dependency(database_stack)

# Lambda Functions
lambda_stack = LambdaStack(
    app, f"{project_name}-{env_name}-lambda",
    env_name=env_name,
    project_name=project_name,
    database_stack=database_stack,
    cloudfront_domain_name=cloudfront_stack.distribution.distribution_domain_name,
    use_mock_ai=use_mock_ai,
    env=aws_env,
)
lambda_stack.add_dependency(database_stack)
lambda_stack.add_dependency(cloudfront_stack)

# AppSync (GraphQL API)
appsync_stack = AppSyncStack(
    app, f"{project_name}-{env_name}-appsync",
    env_name=env_name,
    project_name=project_name,
    lambda_stack=lambda_stack,
    user_pool=cognito_stack.user_pool,
    env=aws_env,
)
appsync_stack.add_dependency(lambda_stack)
appsync_stack.add_dependency(cognito_stack)

# Frontend Hosting (S3 + CloudFront)
frontend_stack = FrontendStack(
    app, f"{project_name}-{env_name}-frontend",
    env_name=env_name,
    project_name=project_name,
    env=aws_env,
)

app.synth()
