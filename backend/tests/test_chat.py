"""chat Lambda 関数のユニットテスト."""
import importlib
import pytest
from unittest.mock import patch
from helpers import make_appsync_event


@pytest.fixture(autouse=True)
def _reload_module(dynamodb_tables):
    """各テストの前にモジュールをリロードして config を再生成する。"""
    import functions.chat.index as mod
    importlib.reload(mod)
    yield


def _handler():
    from functions.chat.index import lambda_handler
    return lambda_handler


# ================================================================
# sendMessage
# ================================================================

class TestSendMessage:
    """Mutation.sendMessage のテスト群."""

    def test_正常にメッセージを送信できる(self, dynamodb_tables, users_table):
        """通常ユーザーのメッセージが正しく保存される。"""
        users_table.put_item(Item={
            "loginId": "sender1",
            "displayName": "送信者1",
            "createdAt": "2024-01-01T00:00:00+00:00",
            "conversationIds": [],
        })

        event = make_appsync_event("sendMessage", {
            "input": {
                "conversationId": "conv-001",
                "userId": "sender1",
                "content": "こんにちは！",
            }
        })
        result = _handler()(event, None)

        # sendMessage は Message! を直接返す（GraphQL スキーマ準拠）
        assert result["content"] == "こんにちは！"
        assert result["userId"] == "sender1"
        assert result["conversationId"] == "conv-001"
        assert result["isUsedInSummary"] is False
        assert "messageId" in result
        assert "timestamp" in result

    def test_AIHELPERのメッセージはdisplayNameがAIHelper(self, dynamodb_tables):
        """AIHELPER ユーザーは DB 参照なしに固定の displayName を使う。"""
        event = make_appsync_event("sendMessage", {
            "input": {
                "conversationId": "conv-001",
                "userId": "AIHELPER",
                "content": "AI応答です",
            }
        })
        result = _handler()(event, None)

        assert result["displayName"] == "AIHelper"

    def test_conversationIdが未指定の場合エラー(self, dynamodb_tables):
        """conversationId が欠落している場合は ValueError を送出する。"""
        event = make_appsync_event("sendMessage", {
            "input": {"userId": "user1", "content": "テスト"}
        })
        with pytest.raises(ValueError, match="required"):
            _handler()(event, None)

    def test_userIdが未指定の場合エラー(self, dynamodb_tables):
        """userId が欠落している場合は ValueError を送出する。"""
        event = make_appsync_event("sendMessage", {
            "input": {"conversationId": "conv-001", "content": "テスト"}
        })
        with pytest.raises(ValueError, match="required"):
            _handler()(event, None)

    def test_contentが空の場合エラー(self, dynamodb_tables):
        """content が空文字の場合は ValueError を送出する。"""
        event = make_appsync_event("sendMessage", {
            "input": {
                "conversationId": "conv-001",
                "userId": "user1",
                "content": "",
            }
        })
        with pytest.raises(ValueError):
            _handler()(event, None)

    def test_contentが空白のみの場合エラー(self, dynamodb_tables):
        """content が空白のみの場合は strip 後に ValueError を送出する。"""
        event = make_appsync_event("sendMessage", {
            "input": {
                "conversationId": "conv-001",
                "userId": "user1",
                "content": "   ",
            }
        })
        with pytest.raises(ValueError):
            _handler()(event, None)

    def test_inputが未指定の場合エラー(self, dynamodb_tables):
        """arguments に input がない場合は ValueError を送出する。"""
        event = make_appsync_event("sendMessage", {})
        with pytest.raises(ValueError):
            _handler()(event, None)


# ================================================================
# listMessages
# ================================================================

class TestListMessages:
    """Query.listMessages のテスト群."""

    def test_メッセージ一覧を取得できる(self, dynamodb_tables, messages_table, users_table):
        """保存済みメッセージを timestamp 順で取得する。"""
        users_table.put_item(Item={
            "loginId": "user_a",
            "displayName": "ユーザーA",
            "createdAt": "2024-01-01T00:00:00+00:00",
            "conversationIds": [],
        })

        for i in range(3):
            messages_table.put_item(Item={
                "conversationId": "conv-list",
                "messageId": f"msg-{i}",
                "userId": "user_a",
                "displayName": "ユーザーA",
                "content": f"メッセージ{i}",
                "timestamp": f"2024-01-01T00:00:0{i}+00:00",
                "isUsedInSummary": False,
            })

        event = make_appsync_event("listMessages", {"conversationId": "conv-list"})
        result = _handler()(event, None)

        assert "items" in result
        assert len(result["items"]) == 3
        assert result["items"][0]["displayName"] == "ユーザーA"

    def test_conversationIdが未指定の場合空リストを返す(self, dynamodb_tables):
        """conversationId が未指定の場合は空の結果を返す。"""
        event = make_appsync_event("listMessages", {})
        result = _handler()(event, None)

        assert result["items"] == []
        assert result["nextToken"] is None

    def test_メッセージが存在しない場合空リストを返す(self, dynamodb_tables):
        """対象 conversation にメッセージがない場合の動作。"""
        event = make_appsync_event("listMessages", {
            "conversationId": "empty-conv"
        })
        result = _handler()(event, None)

        assert result["items"] == []

    def test_limit指定でメッセージ数を制限できる(self, dynamodb_tables, messages_table, users_table):
        """limit パラメータでメッセージの取得件数を制限する。"""
        users_table.put_item(Item={
            "loginId": "user_b",
            "displayName": "ユーザーB",
            "createdAt": "2024-01-01T00:00:00+00:00",
            "conversationIds": [],
        })

        for i in range(5):
            messages_table.put_item(Item={
                "conversationId": "conv-limit",
                "messageId": f"msg-{i}",
                "userId": "user_b",
                "displayName": "ユーザーB",
                "content": f"メッセージ{i}",
                "timestamp": f"2024-01-01T00:00:0{i}+00:00",
                "isUsedInSummary": False,
            })

        event = make_appsync_event("listMessages", {
            "conversationId": "conv-limit",
            "limit": 2,
        })
        result = _handler()(event, None)

        assert len(result["items"]) == 2


# ================================================================
# 不明なフィールド
# ================================================================

class TestUnknownField:
    """未知のフィールド名に対するテスト."""

    def test_不明なフィールドでエラーレスポンスを返す(self, dynamodb_tables):
        """存在しない fieldName は ValueError を送出する。"""
        event = make_appsync_event("invalidField", {})
        with pytest.raises(ValueError, match="Unknown field"):
            _handler()(event, None)
