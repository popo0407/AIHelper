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

    def test_会話作成後にUserConversationsレコードが作成される(self, dynamodb_tables, users_table,
                                                            user_conversations_table):
        """UserConversations テーブルに新しいレコードが作成される。"""
        _seed_user(users_table, "creator2")

        event = make_appsync_event("createConversation", {
            "input": {"createdBy": "creator2"}
        })
        result = _handler()(event, None)
        conv_id = result["conversation"]["conversationId"]

        # UserConversations テーブルを確認
        uc = user_conversations_table.get_item(
            Key={"loginId": "creator2", "conversationId": conv_id}
        ).get("Item")
        assert uc is not None
        assert uc["role"] == "creator"

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
                                     conversations_table, summary_table,
                                     user_conversations_table):
        """ユーザーが参加している会話の一覧を title 付きで返す。"""
        users_table.put_item(Item={
            "loginId": "list_user",
            "displayName": "リストユーザー",
            "createdAt": "2024-01-01T00:00:00+00:00",
            "conversationIds": ["conv-l1", "conv-l2"],
        })
        _seed_conversation(conversations_table, "conv-l1", "list_user")
        _seed_conversation(conversations_table, "conv-l2", "list_user")
        # UserConversations テーブルにも追加
        user_conversations_table.put_item(Item={
            "loginId": "list_user",
            "conversationId": "conv-l1",
            "joinedAt": "2024-01-01T00:00:00+00:00",
            "role": "creator",
        })
        user_conversations_table.put_item(Item={
            "loginId": "list_user",
            "conversationId": "conv-l2",
            "joinedAt": "2024-01-01T00:00:00+00:00",
            "role": "creator",
        })
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

    def test_参加後にUserConversationsレコードが作成される(self, dynamodb_tables, users_table,
                                                        conversations_table, summary_table,
                                                        user_conversations_table):
        """参加後、UserConversations テーブルにレコードが追加される。"""
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

        uc = user_conversations_table.get_item(
            Key={"loginId": "joiner2", "conversationId": "conv-join2"}
        ).get("Item")
        assert uc is not None
        assert uc["role"] == "participant"

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


# ================================================================
# updateConversationTitle
# ================================================================

class TestUpdateConversationTitle:
    """Mutation.updateConversationTitle のテスト群."""

    def test_タイトルを更新できる(self, dynamodb_tables, conversations_table, summary_table):
        """会話のタイトルが正常に更新される。"""
        _seed_conversation(conversations_table, "conv-title", "user1")
        summary_table.put_item(Item={
            "conversationId": "conv-title",
            "title": "",
            "current": "",
            "previous": "",
            "updatedAt": "2024-01-01T00:00:00+00:00",
            "updatedBy": "user1",
        })

        event = make_appsync_event("updateConversationTitle", {
            "input": {
                "conversationId": "conv-title",
                "title": "新しいタイトル",
            }
        })
        result = _handler()(event, None)

        assert result["conversationId"] == "conv-title"
        assert result["title"] == "新しいタイトル"

        # Conversations テーブルも更新されていること
        conv = conversations_table.get_item(
            Key={"conversationId": "conv-title"}
        )["Item"]
        assert conv["title"] == "新しいタイトル"

        # Summary テーブルも更新されていること
        summary = summary_table.get_item(
            Key={"conversationId": "conv-title"}
        )["Item"]
        assert summary["title"] == "新しいタイトル"

    def test_conversationIdが未指定の場合エラー(self, dynamodb_tables):
        """conversationId がない場合はエラー。"""
        event = make_appsync_event("updateConversationTitle", {
            "input": {"title": "タイトル"}
        })
        with pytest.raises(ValueError, match="conversationId is required"):
            _handler()(event, None)


# ================================================================
# leaveConversation
# ================================================================

def _seed_user_conversation(user_conversations_table, login_id, conv_id,
                             role="participant"):
    """テスト用UserConversationレコードを作成するヘルパー。"""
    user_conversations_table.put_item(Item={
        "loginId": login_id,
        "conversationId": conv_id,
        "joinedAt": "2024-01-01T00:00:00+00:00",
        "role": role,
    })


class TestLeaveConversation:
    """Mutation.leaveConversation のテスト群."""

    def test_participantが退出できる(self, dynamodb_tables, user_conversations_table):
        """participant が退出すると role が 'inactive' に更新される。"""
        _seed_user_conversation(user_conversations_table, "leaver1", "conv-leave1")

        event = make_appsync_event("leaveConversation", {
            "input": {"loginId": "leaver1", "conversationId": "conv-leave1"}
        })
        result = _handler()(event, None)

        assert result["success"] is True
        assert result["conversationId"] == "conv-leave1"

        # role が 'inactive' に更新されていること
        uc = user_conversations_table.get_item(
            Key={"loginId": "leaver1", "conversationId": "conv-leave1"}
        )["Item"]
        assert uc["role"] == "inactive"

    def test_creatorは退出できない(self, dynamodb_tables, user_conversations_table):
        """role='creator' のユーザーは退出エラーとなる。"""
        _seed_user_conversation(user_conversations_table, "creator1", "conv-leave2",
                                 role="creator")

        event = make_appsync_event("leaveConversation", {
            "input": {"loginId": "creator1", "conversationId": "conv-leave2"}
        })
        result = _handler()(event, None)

        assert result["success"] is False
        assert "Creator" in result["error"]

    def test_非参加者が退出するとエラー(self, dynamodb_tables, user_conversations_table):
        """UserConversation レコードがないユーザーはエラー。"""
        event = make_appsync_event("leaveConversation", {
            "input": {"loginId": "ghost", "conversationId": "conv-leave3"}
        })
        result = _handler()(event, None)

        assert result["success"] is False
        assert "Not a participant" in result["error"]

    def test_既にinactiveの場合エラー(self, dynamodb_tables, user_conversations_table):
        """既に inactive のユーザーが再度退出しようとするとエラー。"""
        _seed_user_conversation(user_conversations_table, "inactive1", "conv-leave4",
                                 role="inactive")

        event = make_appsync_event("leaveConversation", {
            "input": {"loginId": "inactive1", "conversationId": "conv-leave4"}
        })
        result = _handler()(event, None)

        assert result["success"] is False
        assert "Already left" in result["error"]

    def test_loginIdが未指定の場合エラー(self, dynamodb_tables):
        """loginId がない場合はエラー。"""
        event = make_appsync_event("leaveConversation", {
            "input": {"conversationId": "conv-1"}
        })
        result = _handler()(event, None)

        assert result["success"] is False
        assert "required" in result["error"]


# ================================================================
# updateLastMessageId
# ================================================================

class TestUpdateLastMessageId:
    """Mutation.updateLastMessageId のテスト群."""

    def test_active参加者がlastMessageIdを更新できる(self, dynamodb_tables,
                                                 user_conversations_table):
        """active 参加者が lastMessageId を正常に更新できる。"""
        _seed_user_conversation(user_conversations_table, "user1", "conv-msg1")

        event = make_appsync_event("updateLastMessageId", {
            "input": {
                "loginId": "user1",
                "conversationId": "conv-msg1",
                "messageId": "msg-001",
            }
        })
        result = _handler()(event, None)

        assert result["success"] is True
        uc = result["userConversation"]
        assert uc["lastMessageId"] == "msg-001"
        assert "lastUpdatedAt" in uc

    def test_creator参加者がlastMessageIdを更新できる(self, dynamodb_tables,
                                                  user_conversations_table):
        """creator も lastMessageId を正常に更新できる。"""
        _seed_user_conversation(user_conversations_table, "creator1", "conv-msg2",
                                 role="creator")

        event = make_appsync_event("updateLastMessageId", {
            "input": {
                "loginId": "creator1",
                "conversationId": "conv-msg2",
                "messageId": "msg-002",
            }
        })
        result = _handler()(event, None)

        assert result["success"] is True

    def test_inactive参加者はエラー(self, dynamodb_tables, user_conversations_table):
        """role='inactive' のユーザーは更新不可。"""
        _seed_user_conversation(user_conversations_table, "inactive1", "conv-msg3",
                                 role="inactive")

        event = make_appsync_event("updateLastMessageId", {
            "input": {
                "loginId": "inactive1",
                "conversationId": "conv-msg3",
                "messageId": "msg-003",
            }
        })
        result = _handler()(event, None)

        assert result["success"] is False
        assert "Not an active participant" in result["error"]

    def test_非参加者はエラー(self, dynamodb_tables, user_conversations_table):
        """UserConversation レコードがないユーザーはエラー。"""
        event = make_appsync_event("updateLastMessageId", {
            "input": {
                "loginId": "ghost",
                "conversationId": "conv-msg4",
                "messageId": "msg-004",
            }
        })
        result = _handler()(event, None)

        assert result["success"] is False

    def test_必須パラメータ未指定でエラー(self, dynamodb_tables):
        """messageId がない場合はエラー。"""
        event = make_appsync_event("updateLastMessageId", {
            "input": {
                "loginId": "user1",
                "conversationId": "conv-1",
            }
        })
        result = _handler()(event, None)

        assert result["success"] is False
        assert "required" in result["error"]


# ================================================================
# listConversations - inactive フィルタリング
# ================================================================

class TestListConversationsAccessControl:
    """listConversations のアクセス制御テスト群."""

    def test_inactiveな会話はリストに表示されない(self, dynamodb_tables,
                                           conversations_table, summary_table,
                                           user_conversations_table):
        """role='inactive' の会話はリストから除外される。"""
        _seed_conversation(conversations_table, "conv-active", "user1")
        _seed_conversation(conversations_table, "conv-inactive", "user1")
        summary_table.put_item(Item={
            "conversationId": "conv-active",
            "title": "アクティブ会話",
            "current": "", "previous": "",
            "updatedAt": "2024-01-01T00:00:00+00:00",
            "updatedBy": "user1",
        })
        summary_table.put_item(Item={
            "conversationId": "conv-inactive",
            "title": "非アクティブ会話",
            "current": "", "previous": "",
            "updatedAt": "2024-01-01T00:00:00+00:00",
            "updatedBy": "user1",
        })
        _seed_user_conversation(user_conversations_table, "filter_user",
                                 "conv-active", role="participant")
        _seed_user_conversation(user_conversations_table, "filter_user",
                                 "conv-inactive", role="inactive")

        event = make_appsync_event("listConversations",
                                    {"loginId": "filter_user"})
        result = _handler()(event, None)

        assert isinstance(result, list)
        assert len(result) == 1
        assert result[0]["conversationId"] == "conv-active"

    def test_joinしてからの退出後再参加のフロー(self, dynamodb_tables,
                                          conversations_table, summary_table,
                                          user_conversations_table, users_table):
        """参加 → 退出 → 再参加の一連フローが正しく動作する。"""
        _seed_user(users_table, "flow_user")
        _seed_conversation(conversations_table, "conv-flow", "creator1",
                           participants=["creator1"])
        summary_table.put_item(Item={
            "conversationId": "conv-flow",
            "title": "フローテスト",
            "current": "", "previous": "",
            "updatedAt": "2024-01-01T00:00:00+00:00",
            "updatedBy": "creator1",
        })

        # Step 1: Join
        event = make_appsync_event("joinConversation", {
            "input": {"loginId": "flow_user", "conversationId": "conv-flow"}
        })
        result = _handler()(event, None)
        assert result["success"] is True

        # Verify role is participant
        uc = user_conversations_table.get_item(
            Key={"loginId": "flow_user", "conversationId": "conv-flow"}
        )["Item"]
        assert uc["role"] == "participant"

        # Step 2: Leave
        event = make_appsync_event("leaveConversation", {
            "input": {"loginId": "flow_user", "conversationId": "conv-flow"}
        })
        result = _handler()(event, None)
        assert result["success"] is True

        # Verify role is inactive
        uc = user_conversations_table.get_item(
            Key={"loginId": "flow_user", "conversationId": "conv-flow"}
        )["Item"]
        assert uc["role"] == "inactive"

        # Step 3: Rejoin
        event = make_appsync_event("joinConversation", {
            "input": {"loginId": "flow_user", "conversationId": "conv-flow"}
        })
        result = _handler()(event, None)
        assert result["success"] is True

        # Verify role is reactivated to participant
        uc = user_conversations_table.get_item(
            Key={"loginId": "flow_user", "conversationId": "conv-flow"}
        )["Item"]
        assert uc["role"] == "participant"
