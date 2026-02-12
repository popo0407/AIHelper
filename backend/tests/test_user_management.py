"""user_management Lambda 関数のユニットテスト."""
import importlib
import pytest
from helpers import make_appsync_event


@pytest.fixture(autouse=True)
def _reload_module(dynamodb_tables):
    """各テストの前にモジュールをリロードして config を再生成する。"""
    import functions.user_management.index as mod
    importlib.reload(mod)
    yield


def _handler():
    from functions.user_management.index import lambda_handler
    return lambda_handler


# ================================================================
# registerUser
# ================================================================

class TestRegisterUser:
    """Mutation.registerUser のテスト群."""

    def test_正常にユーザーを登録できる(self, dynamodb_tables):
        """新規ユーザーが正しく登録され、success=True が返る。"""
        event = make_appsync_event("registerUser", {
            "input": {"loginId": "user1", "displayName": "テストユーザー1"}
        })
        result = _handler()(event, None)

        assert result["success"] is True
        assert result["user"]["loginId"] == "user1"
        assert result["user"]["displayName"] == "テストユーザー1"
        assert result["user"]["conversationIds"] == []
        assert "createdAt" in result["user"]

    def test_重複するloginIdで登録するとエラー(self, dynamodb_tables, users_table):
        """同じ loginId での二重登録はエラーになる。"""
        users_table.put_item(Item={
            "loginId": "dup_user",
            "displayName": "既存ユーザー",
            "createdAt": "2024-01-01T00:00:00+00:00",
            "conversationIds": [],
        })

        event = make_appsync_event("registerUser", {
            "input": {"loginId": "dup_user", "displayName": "新しい名前"}
        })
        result = _handler()(event, None)

        assert result["success"] is False
        assert "already registered" in result["error"]

    def test_loginIdが空の場合エラー(self, dynamodb_tables):
        """loginId が空文字の場合はバリデーションエラー。"""
        event = make_appsync_event("registerUser", {
            "input": {"loginId": "", "displayName": "名前あり"}
        })
        result = _handler()(event, None)

        assert result["success"] is False
        assert "required" in result["error"]

    def test_displayNameが空の場合エラー(self, dynamodb_tables):
        """displayName が空文字の場合はバリデーションエラー。"""
        event = make_appsync_event("registerUser", {
            "input": {"loginId": "user_ok", "displayName": ""}
        })
        result = _handler()(event, None)

        assert result["success"] is False
        assert "required" in result["error"]

    def test_loginIdが空白のみの場合エラー(self, dynamodb_tables):
        """空白のみの loginId は strip 後に空文字となりエラー。"""
        event = make_appsync_event("registerUser", {
            "input": {"loginId": "   ", "displayName": "名前"}
        })
        result = _handler()(event, None)

        assert result["success"] is False

    def test_inputキーが存在しない場合エラー(self, dynamodb_tables):
        """arguments に input が含まれない場合のエラーハンドリング。"""
        event = make_appsync_event("registerUser", {})
        result = _handler()(event, None)

        assert result["success"] is False


# ================================================================
# getUser
# ================================================================

class TestGetUser:
    """Query.getUser のテスト群."""

    def test_存在するユーザーを取得できる(self, dynamodb_tables, users_table):
        """登録済みユーザーの情報を正しく返す。"""
        users_table.put_item(Item={
            "loginId": "user_get",
            "displayName": "取得テスト",
            "createdAt": "2024-01-01T00:00:00+00:00",
            "conversationIds": ["conv1"],
        })

        event = make_appsync_event("getUser", {"loginId": "user_get"})
        result = _handler()(event, None)

        assert result is not None
        assert result["loginId"] == "user_get"
        assert result["displayName"] == "取得テスト"

    def test_存在しないユーザーはNoneを返す(self, dynamodb_tables):
        """存在しない loginId を指定すると None が返る。"""
        event = make_appsync_event("getUser", {"loginId": "nonexistent"})
        result = _handler()(event, None)

        assert result is None

    def test_loginIdが未指定の場合Noneを返す(self, dynamodb_tables):
        """loginId が空の場合は None を返す。"""
        event = make_appsync_event("getUser", {})
        result = _handler()(event, None)

        assert result is None

    def test_conversationIdsがないユーザーは空リストで補完される(self, dynamodb_tables, users_table):
        """conversationIds フィールドがない場合、空リストを補完する。"""
        users_table.put_item(Item={
            "loginId": "no_conv_user",
            "displayName": "会話なし",
            "createdAt": "2024-01-01T00:00:00+00:00",
        })

        event = make_appsync_event("getUser", {"loginId": "no_conv_user"})
        result = _handler()(event, None)

        assert result is not None
        assert result["conversationIds"] == []


# ================================================================
# listUsers
# ================================================================

class TestListUsers:
    """Query.listUsers のテスト群."""

    def test_ユーザーが存在しない場合空リストを返す(self, dynamodb_tables):
        """テーブルが空の場合は空リストが返る。"""
        event = make_appsync_event("listUsers", {})
        result = _handler()(event, None)

        assert result == []

    def test_複数ユーザーを一覧取得できる(self, dynamodb_tables, users_table):
        """複数のユーザーが正しくリスト化される。"""
        for i in range(3):
            users_table.put_item(Item={
                "loginId": f"user_{i}",
                "displayName": f"ユーザー{i}",
                "createdAt": "2024-01-01T00:00:00+00:00",
                "conversationIds": [],
            })

        event = make_appsync_event("listUsers", {})
        result = _handler()(event, None)

        assert len(result) == 3

    def test_conversationIdsがsetの場合listに変換される(self, dynamodb_tables, users_table):
        """DynamoDB の set 型が list に変換される。"""
        users_table.put_item(Item={
            "loginId": "set_user",
            "displayName": "セットユーザー",
            "createdAt": "2024-01-01T00:00:00+00:00",
            "conversationIds": ["c1", "c2"],
        })

        event = make_appsync_event("listUsers", {})
        result = _handler()(event, None)

        assert len(result) == 1
        assert isinstance(result[0]["conversationIds"], list)


# ================================================================
# 不明なフィールド
# ================================================================

class TestUnknownField:
    """未知のフィールド名に対するテスト."""

    def test_不明なフィールドでエラーレスポンスを返す(self, dynamodb_tables):
        """存在しない fieldName が指定された場合、エラーを返す。"""
        event = make_appsync_event("unknownField", {})
        result = _handler()(event, None)

        assert result["success"] is False
        assert "Unknown field" in result["error"]
