"""conversation Lambda 関数のユニットテスト."""
import importlib
import pytest
from helpers import make_appsync_event


@pytest.fixture(autouse=True)
def _reload_module(dynamodb_tables):
    """各テストの前にモジュールをリロードして config を再生成する。"""
    import functions.conversation.index as mod
    importlib.reload(mod)
    yield


def _handler():
    from functions.conversation.index import lambda_handler
    return lambda_handler


def _seed_user(users_table, login_id, display_name="テストユーザー"):
    """テスト用ユーザーを作成するヘルパー。"""
    users_table.put_item(Item={
        "loginId": login_id,
        "displayName": display_name,
        "createdAt": "2024-01-01T00:00:00+00:00",
        "conversationIds": [],
    })


def _seed_conversation(conversations_table, conv_id, created_by,
                        participants=None, status="active"):
    """テスト用会話を作成するヘルパー。"""
    conversations_table.put_item(Item={
        "conversationId": conv_id,
        "createdBy": created_by,
        "createdAt": "2024-01-01T00:00:00+00:00",
        "participants": participants or [created_by],
        "status": status,
        "shareLink": f"/chat?cid={conv_id}",
    })


# ================================================================
# createConversation
# ================================================================

class TestCreateConversation:
    """Mutation.createConversation のテスト群."""

    def test_正常に会話を作成できる(self, dynamodb_tables, users_table):
        """会話が正常に作成され、ユーザーの conversationIds に追加される。"""
        _seed_user(users_table, "creator1")

        event = make_appsync_event("createConversation", {
            "input": {"createdBy": "creator1"}
        })
        result = _handler()(event, None)

        assert result["success"] is True
        assert "conversation" in result
        conv = result["conversation"]
        assert conv["createdBy"] == "creator1"
        assert "creator1" in conv["participants"]
        assert conv["status"] == "active"
        assert conv["shareLink"].startswith("/chat?cid=")
        assert conv["title"] == ""
        assert "conversationId" in conv
        assert "createdAt" in conv

    def test_会話作成後にユーザーのconversationIdsが更新される(self, dynamodb_tables, users_table):
        """ユーザーの conversationIds に新しい会話 ID が追加される。"""
        _seed_user(users_table, "creator2")

        event = make_appsync_event("createConversation", {
            "input": {"createdBy": "creator2"}
        })
        result = _handler()(event, None)
        conv_id = result["conversation"]["conversationId"]

        # ユーザーの conversationIds を確認
        user = users_table.get_item(Key={"loginId": "creator2"})["Item"]
        assert conv_id in user["conversationIds"]

    def test_会話作成後に空の要約が初期化される(self, dynamodb_tables, users_table, summary_table):
        """会話作成時に空の要約レコードが作成される。"""
        _seed_user(users_table, "creator3")

        event = make_appsync_event("createConversation", {
            "input": {"createdBy": "creator3"}
        })
        result = _handler()(event, None)
        conv_id = result["conversation"]["conversationId"]

        # 要約テーブルを確認
        summary = summary_table.get_item(Key={"conversationId": conv_id})["Item"]
        assert summary["current"] == ""
        assert summary["title"] == ""

    def test_createdByが未指定の場合エラー(self, dynamodb_tables):
        """createdBy がない場合はエラー。"""
        event = make_appsync_event("createConversation", {
            "input": {}
        })
        result = _handler()(event, None)

        assert result["success"] is False
        assert "required" in result["error"]

    def test_inputが存在しない場合エラー(self, dynamodb_tables):
        """arguments に input がない場合のエラーハンドリング。"""
        event = make_appsync_event("createConversation", {})
        result = _handler()(event, None)

        assert result["success"] is False


# ================================================================
# getConversation
# ================================================================

class TestGetConversation:
    """Query.getConversation のテスト群."""

    def test_会話を取得できる(self, dynamodb_tables, conversations_table, summary_table):
        """存在する会話を取得し、title を要約テーブルから補完する。"""
        _seed_conversation(conversations_table, "conv-get", "user1")
        summary_table.put_item(Item={
            "conversationId": "conv-get",
            "title": "取得テスト会議",
            "current": "",
            "previous": "",
            "updatedAt": "2024-01-01T00:00:00+00:00",
            "updatedBy": "user1",
        })

        event = make_appsync_event("getConversation", {
            "conversationId": "conv-get"
        })
        result = _handler()(event, None)

        assert result is not None
        assert result["conversationId"] == "conv-get"
        assert result["title"] == "取得テスト会議"

    def test_存在しない会話はNoneを返す(self, dynamodb_tables):
        """存在しない conversationId を指定すると None が返る。"""
        event = make_appsync_event("getConversation", {
            "conversationId": "nonexistent"
        })
        result = _handler()(event, None)

        assert result is None

    def test_要約がない場合titleは空文字(self, dynamodb_tables, conversations_table):
        """要約テーブルにレコードがない場合、title は空文字。"""
        _seed_conversation(conversations_table, "conv-no-summary", "user1")

        event = make_appsync_event("getConversation", {
            "conversationId": "conv-no-summary"
        })
        result = _handler()(event, None)

        assert result is not None
        assert result["title"] == ""


# ================================================================
# listConversations
# ================================================================

class TestListConversations:
    """Query.listConversations のテスト群."""

    def test_ユーザーの会話一覧を取得できる(self, dynamodb_tables, users_table,
                                     conversations_table, summary_table):
        """ユーザーが参加している会話の一覧を title 付きで返す。"""
        users_table.put_item(Item={
            "loginId": "list_user",
            "displayName": "リストユーザー",
            "createdAt": "2024-01-01T00:00:00+00:00",
            "conversationIds": ["conv-l1", "conv-l2"],
        })
        _seed_conversation(conversations_table, "conv-l1", "list_user")
        _seed_conversation(conversations_table, "conv-l2", "list_user")
        summary_table.put_item(Item={
            "conversationId": "conv-l1",
            "title": "会議1",
            "current": "",
            "previous": "",
            "updatedAt": "2024-01-01T00:00:00+00:00",
            "updatedBy": "list_user",
        })
        summary_table.put_item(Item={
            "conversationId": "conv-l2",
            "title": "会議2",
            "current": "",
            "previous": "",
            "updatedAt": "2024-01-01T00:00:00+00:00",
            "updatedBy": "list_user",
        })

        event = make_appsync_event("listConversations", {"loginId": "list_user"})
        result = _handler()(event, None)

        assert isinstance(result, list)
        assert len(result) == 2
        titles = [c["title"] for c in result]
        assert "会議1" in titles
        assert "会議2" in titles

    def test_会話を持たないユーザーは空リスト(self, dynamodb_tables, users_table):
        """conversationIds が空のユーザーには空リストを返す。"""
        _seed_user(users_table, "empty_user")

        event = make_appsync_event("listConversations", {"loginId": "empty_user"})
        result = _handler()(event, None)

        assert result == []

    def test_存在しないユーザーは空リスト(self, dynamodb_tables):
        """存在しない loginId の場合は空リストを返す。"""
        event = make_appsync_event("listConversations", {"loginId": "ghost"})
        result = _handler()(event, None)

        assert result == []


# ================================================================
# joinConversation
# ================================================================

class TestJoinConversation:
    """Mutation.joinConversation のテスト群."""

    def test_正常に会話に参加できる(self, dynamodb_tables, users_table,
                               conversations_table, summary_table):
        """ユーザーが会話に参加し、participants に追加される。"""
        _seed_user(users_table, "joiner1")
        _seed_conversation(conversations_table, "conv-join", "creator1",
                           participants=["creator1"])
        summary_table.put_item(Item={
            "conversationId": "conv-join",
            "title": "参加テスト",
            "current": "",
            "previous": "",
            "updatedAt": "2024-01-01T00:00:00+00:00",
            "updatedBy": "creator1",
        })

        event = make_appsync_event("joinConversation", {
            "input": {
                "loginId": "joiner1",
                "conversationId": "conv-join",
            }
        })
        result = _handler()(event, None)

        assert result["success"] is True
        assert "conversation" in result
        assert result["conversation"]["title"] == "参加テスト"

    def test_参加後にユーザーのconversationIdsが更新される(self, dynamodb_tables, users_table,
                                                   conversations_table, summary_table):
        """参加後、ユーザーの conversationIds に会話 ID が追加される。"""
        _seed_user(users_table, "joiner2")
        _seed_conversation(conversations_table, "conv-join2", "creator1")
        summary_table.put_item(Item={
            "conversationId": "conv-join2",
            "title": "",
            "current": "",
            "previous": "",
            "updatedAt": "2024-01-01T00:00:00+00:00",
            "updatedBy": "creator1",
        })

        event = make_appsync_event("joinConversation", {
            "input": {"loginId": "joiner2", "conversationId": "conv-join2"}
        })
        _handler()(event, None)

        user = users_table.get_item(Key={"loginId": "joiner2"})["Item"]
        assert "conv-join2" in user["conversationIds"]

    def test_既に参加済みのユーザーは重複追加されない(self, dynamodb_tables, users_table,
                                             conversations_table, summary_table):
        """既に participants に含まれるユーザーが再参加しても重複しない。"""
        users_table.put_item(Item={
            "loginId": "already_in",
            "displayName": "既参加者",
            "createdAt": "2024-01-01T00:00:00+00:00",
            "conversationIds": ["conv-dup"],
        })
        _seed_conversation(conversations_table, "conv-dup", "creator1",
                           participants=["creator1", "already_in"])
        summary_table.put_item(Item={
            "conversationId": "conv-dup",
            "title": "",
            "current": "",
            "previous": "",
            "updatedAt": "2024-01-01T00:00:00+00:00",
            "updatedBy": "creator1",
        })

        event = make_appsync_event("joinConversation", {
            "input": {"loginId": "already_in", "conversationId": "conv-dup"}
        })
        result = _handler()(event, None)

        assert result["success"] is True
        # participants の重複がないことを確認
        conv = conversations_table.get_item(
            Key={"conversationId": "conv-dup"}
        )["Item"]
        assert conv["participants"].count("already_in") == 1

    def test_存在しない会話に参加するとエラー(self, dynamodb_tables, users_table):
        """存在しない conversationId への参加はエラー。"""
        _seed_user(users_table, "joiner_err")

        event = make_appsync_event("joinConversation", {
            "input": {
                "loginId": "joiner_err",
                "conversationId": "nonexistent-conv",
            }
        })
        result = _handler()(event, None)

        assert result["success"] is False
        assert "not found" in result["error"].lower()

    def test_loginIdが未指定の場合エラー(self, dynamodb_tables):
        """loginId がない場合はエラー。"""
        event = make_appsync_event("joinConversation", {
            "input": {"conversationId": "conv-1"}
        })
        result = _handler()(event, None)

        assert result["success"] is False
        assert "required" in result["error"]

    def test_conversationIdが未指定の場合エラー(self, dynamodb_tables):
        """conversationId がない場合はエラー。"""
        event = make_appsync_event("joinConversation", {
            "input": {"loginId": "user1"}
        })
        result = _handler()(event, None)

        assert result["success"] is False
        assert "required" in result["error"]


# ================================================================
# 不明なフィールド
# ================================================================

class TestUnknownField:
    """未知のフィールド名に対するテスト."""

    def test_不明なフィールドでエラーレスポンスを返す(self, dynamodb_tables):
        """存在しない fieldName でエラーを返す。"""
        event = make_appsync_event("invalidField", {})
        result = _handler()(event, None)

        assert result["success"] is False
        assert "Unknown field" in result["error"]
