"""共通テストフィクスチャ.

全 Lambda 関数テストで共有する DynamoDB モックテーブルと環境変数を定義する。
"""
import os
import sys
import pytest
import boto3
from moto import mock_aws

# テストディレクトリをパスに追加（helpers モジュールを解決できるように）
TESTS_DIR = os.path.dirname(__file__)
sys.path.insert(0, TESTS_DIR)
# バックエンドルートをパスに追加（Lambda 関数が common パッケージを解決できるように）
BACKEND_DIR = os.path.join(TESTS_DIR, "..")
sys.path.insert(0, BACKEND_DIR)
# functions ディレクトリもパスに追加
sys.path.insert(0, os.path.join(BACKEND_DIR, "functions"))

# ---------- 環境変数 ----------

TEST_ENV_VARS = {
    "ENVIRONMENT": "test",
    "PROJECT_NAME": "aichat-test",
    "USERS_TABLE": "test-users",
    "USER_CONVERSATIONS_TABLE": "test-user-conversations",
    "MESSAGES_TABLE": "test-messages",
    "SUMMARY_TABLE": "test-summary",
    "LOCKS_TABLE": "test-locks",
    "CONVERSATIONS_TABLE": "test-conversations",
    "KNOWLEDGE_SOURCES_TABLE": "test-knowledge-sources",
    "KNOWLEDGE_BUCKET": "test-knowledge-bucket",
    "USE_MOCK_AI": "true",
    "BEDROCK_REGION": "us-west-2",
    "BEDROCK_MODEL_ID": "us.anthropic.claude-haiku-4-5-20251001-v1:0",
    "AWS_DEFAULT_REGION": "ap-northeast-1",
    "AWS_ACCESS_KEY_ID": "testing",
    "AWS_SECRET_ACCESS_KEY": "testing",
    "AWS_SECURITY_TOKEN": "testing",
    "AWS_SESSION_TOKEN": "testing",
}


@pytest.fixture(autouse=True)
def _set_env_vars(monkeypatch):
    """すべてのテストで必要な環境変数を自動設定する。"""
    for key, value in TEST_ENV_VARS.items():
        monkeypatch.setenv(key, value)


# ---------- DynamoDB テーブル作成ヘルパー ----------


def _create_users_table(dynamodb):
    """Users テーブルを作成する。"""
    dynamodb.create_table(
        TableName=TEST_ENV_VARS["USERS_TABLE"],
        KeySchema=[{"AttributeName": "loginId", "KeyType": "HASH"}],
        AttributeDefinitions=[
            {"AttributeName": "loginId", "AttributeType": "S"},
        ],
        BillingMode="PAY_PER_REQUEST",
    )


def _create_messages_table(dynamodb):
    """Messages テーブルを作成する（GSI byTimestamp 付き）。"""
    dynamodb.create_table(
        TableName=TEST_ENV_VARS["MESSAGES_TABLE"],
        KeySchema=[
            {"AttributeName": "conversationId", "KeyType": "HASH"},
            {"AttributeName": "messageId", "KeyType": "RANGE"},
        ],
        AttributeDefinitions=[
            {"AttributeName": "conversationId", "AttributeType": "S"},
            {"AttributeName": "messageId", "AttributeType": "S"},
            {"AttributeName": "timestamp", "AttributeType": "S"},
        ],
        GlobalSecondaryIndexes=[
            {
                "IndexName": "byTimestamp",
                "KeySchema": [
                    {"AttributeName": "conversationId", "KeyType": "HASH"},
                    {"AttributeName": "timestamp", "KeyType": "RANGE"},
                ],
                "Projection": {"ProjectionType": "ALL"},
            },
        ],
        BillingMode="PAY_PER_REQUEST",
    )


def _create_summary_table(dynamodb):
    """Summary テーブルを作成する。"""
    dynamodb.create_table(
        TableName=TEST_ENV_VARS["SUMMARY_TABLE"],
        KeySchema=[{"AttributeName": "conversationId", "KeyType": "HASH"}],
        AttributeDefinitions=[
            {"AttributeName": "conversationId", "AttributeType": "S"},
        ],
        BillingMode="PAY_PER_REQUEST",
    )


def _create_locks_table(dynamodb):
    """Locks テーブルを作成する。"""
    dynamodb.create_table(
        TableName=TEST_ENV_VARS["LOCKS_TABLE"],
        KeySchema=[
            {"AttributeName": "conversationId", "KeyType": "HASH"},
            {"AttributeName": "lockType", "KeyType": "RANGE"},
        ],
        AttributeDefinitions=[
            {"AttributeName": "conversationId", "AttributeType": "S"},
            {"AttributeName": "lockType", "AttributeType": "S"},
        ],
        BillingMode="PAY_PER_REQUEST",
    )


def _create_conversations_table(dynamodb):
    """Conversations テーブルを作成する。"""
    dynamodb.create_table(
        TableName=TEST_ENV_VARS["CONVERSATIONS_TABLE"],
        KeySchema=[{"AttributeName": "conversationId", "KeyType": "HASH"}],
        AttributeDefinitions=[
            {"AttributeName": "conversationId", "AttributeType": "S"},
        ],
        BillingMode="PAY_PER_REQUEST",
    )


def _create_knowledge_sources_table(dynamodb):
    """KnowledgeSources テーブルを作成する。"""
    dynamodb.create_table(
        TableName=TEST_ENV_VARS["KNOWLEDGE_SOURCES_TABLE"],
        KeySchema=[
            {"AttributeName": "conversationId", "KeyType": "HASH"},
            {"AttributeName": "knowledgeSourceId", "KeyType": "RANGE"},
        ],
        AttributeDefinitions=[
            {"AttributeName": "conversationId", "AttributeType": "S"},
            {"AttributeName": "knowledgeSourceId", "AttributeType": "S"},
        ],
        BillingMode="PAY_PER_REQUEST",
    )


def _create_user_conversations_table(dynamodb):
    """UserConversations テーブルを作成する（GSI byConversation 付き）。"""
    dynamodb.create_table(
        TableName=TEST_ENV_VARS["USER_CONVERSATIONS_TABLE"],
        KeySchema=[
            {"AttributeName": "loginId", "KeyType": "HASH"},
            {"AttributeName": "conversationId", "KeyType": "RANGE"},
        ],
        AttributeDefinitions=[
            {"AttributeName": "loginId", "AttributeType": "S"},
            {"AttributeName": "conversationId", "AttributeType": "S"},
        ],
        GlobalSecondaryIndexes=[
            {
                "IndexName": "byConversation",
                "KeySchema": [
                    {"AttributeName": "conversationId", "KeyType": "HASH"},
                ],
                "Projection": {"ProjectionType": "ALL"},
            },
        ],
        BillingMode="PAY_PER_REQUEST",
    )


@pytest.fixture()
def dynamodb_tables():
    """全 DynamoDB テーブルを moto でモック作成するフィクスチャ。"""
    with mock_aws():
        dynamodb = boto3.resource("dynamodb", region_name="ap-northeast-1")
        _create_users_table(dynamodb)
        _create_messages_table(dynamodb)
        _create_summary_table(dynamodb)
        _create_locks_table(dynamodb)
        _create_conversations_table(dynamodb)
        _create_knowledge_sources_table(dynamodb)
        _create_user_conversations_table(dynamodb)
        yield dynamodb


@pytest.fixture()
def users_table(dynamodb_tables):
    """Users テーブルリソースを返す。"""
    return dynamodb_tables.Table(TEST_ENV_VARS["USERS_TABLE"])


@pytest.fixture()
def messages_table(dynamodb_tables):
    """Messages テーブルリソースを返す。"""
    return dynamodb_tables.Table(TEST_ENV_VARS["MESSAGES_TABLE"])


@pytest.fixture()
def summary_table(dynamodb_tables):
    """Summary テーブルリソースを返す。"""
    return dynamodb_tables.Table(TEST_ENV_VARS["SUMMARY_TABLE"])


@pytest.fixture()
def locks_table(dynamodb_tables):
    """Locks テーブルリソースを返す。"""
    return dynamodb_tables.Table(TEST_ENV_VARS["LOCKS_TABLE"])


@pytest.fixture()
def conversations_table(dynamodb_tables):
    """Conversations テーブルリソースを返す。"""
    return dynamodb_tables.Table(TEST_ENV_VARS["CONVERSATIONS_TABLE"])


@pytest.fixture()
def knowledge_sources_table(dynamodb_tables):
    """KnowledgeSources テーブルリソースを返す。"""
    return dynamodb_tables.Table(TEST_ENV_VARS["KNOWLEDGE_SOURCES_TABLE"])


@pytest.fixture()
def user_conversations_table(dynamodb_tables):
    """UserConversations テーブルリソースを返す。"""
    return dynamodb_tables.Table(TEST_ENV_VARS["USER_CONVERSATIONS_TABLE"])


@pytest.fixture()
def s3_knowledge_bucket(dynamodb_tables):
    """S3 ナレッジバケットを moto でモック作成するフィクスチャ。"""
    s3 = boto3.client("s3", region_name="ap-northeast-1")
    s3.create_bucket(
        Bucket=TEST_ENV_VARS["KNOWLEDGE_BUCKET"],
        CreateBucketConfiguration={"LocationConstraint": "ap-northeast-1"},
    )
    yield s3




