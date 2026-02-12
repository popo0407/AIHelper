#!/usr/bin/env python3
"""CDK Application Entry Point for AICHAT."""
import aws_cdk as cdk
from lib.stacks.database_stack import DatabaseStack
from lib.stacks.appsync_stack import AppSyncStack
from lib.stacks.lambda_stack import LambdaStack

app = cdk.App()

env_name = app.node.try_get_context("environment") or "dev"
project_name = "aichat"

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

# Lambda Functions
lambda_stack = LambdaStack(
    app, f"{project_name}-{env_name}-lambda",
    env_name=env_name,
    project_name=project_name,
    database_stack=database_stack,
    env=aws_env,
)
lambda_stack.add_dependency(database_stack)

# AppSync (GraphQL API)
appsync_stack = AppSyncStack(
    app, f"{project_name}-{env_name}-appsync",
    env_name=env_name,
    project_name=project_name,
    lambda_stack=lambda_stack,
    env=aws_env,
)
appsync_stack.add_dependency(lambda_stack)

app.synth()
