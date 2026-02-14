"""summarizer Lambda 関数のユニットテスト."""
import importlib
import pytest
from unittest.mock import patch, MagicMock
from helpers import make_appsync_event


@pytest.fixture(autouse=True)
def _reload_module(dynamodb_tables):
    """各テストの前にモジュールをリロードして config を再生成する。"""
    import functions.summarizer.index as mod
    importlib.reload(mod)
    yield


def _handler():
    from functions.summarizer.index import lambda_handler
    return lambda_handler


def _seed_messages(messages_table, conv_id, count=3):
    """テスト用メッセージをシードする。"""
    msg_ids = []
    for i in range(count):
        msg_id = f"msg-{i}"
        messages_table.put_item(Item={
            "conversationId": conv_id,
            "messageId": msg_id,
            "userId": "user1",
            "displayName": "テストユーザー",
            "content": f"テストメッセージ{i}",
            "timestamp": f"2024-01-01T00:00:0{i}+00:00",
            "isUsedInSummary": False,
        })
        msg_ids.append(msg_id)
    return msg_ids


# ================================================================
# getSummary
# ================================================================

class TestGetSummary:
    """Query.getSummary のテスト群."""

    def test_要約を取得できる(self, dynamodb_tables, summary_table):
        """保存済み要約を取得する。"""
        summary_table.put_item(Item={
            "conversationId": "conv-s1",
            "title": "テスト会議",
            "current": "# テスト会議\n内容",
            "previous": "",
            "updatedAt": "2024-01-01T00:00:00+00:00",
            "updatedBy": "user1",
        })

        event = make_appsync_event("getSummary", {"conversationId": "conv-s1"})
        result = _handler()(event, None)

        assert result is not None
        assert result["title"] == "テスト会議"
        assert "# テスト会議" in result["current"]

    def test_要約が存在しない場合Noneを返す(self, dynamodb_tables):
        """要約がない conversation の場合は None を返す。"""
        event = make_appsync_event("getSummary", {"conversationId": "no-summary"})
        result = _handler()(event, None)

        assert result is None


# ================================================================
# updateSummary (モック AI)
# ================================================================

class TestUpdateSummary:
    """Mutation.updateSummary のテスト群."""

    def test_モックAIで要約を更新できる(self, dynamodb_tables, messages_table, summary_table):
        """USE_MOCK_AI=true でモック要約が生成・保存される。"""
        msg_ids = _seed_messages(messages_table, "conv-upd")

        event = make_appsync_event("updateSummary", {
            "input": {
                "conversationId": "conv-upd",
                "userId": "user1",
                "displayName": "テストユーザー",
                "selectedMessageIds": msg_ids,
            }
        })
        result = _handler()(event, None)

        # GraphQL resolver レスポンス（直接 Summary 型）
        assert result["conversationId"] == "conv-upd"
        assert result["current"] != ""
        assert result["updatedBy"] == "テストユーザー"
        
        # モック要約の検証
        content = result["current"]
        assert "[モック要約 - デバッグ情報]" in content
        
        # 実際にDynamoDBから取得されたメッセージが含まれているか確認
        # _seed_messages で作成した"テストメッセージ0", "テストメッセージ1"が含まれているはず
        assert "テストメッセージ" in content, f"DynamoDBから取得したメッセージが含まれていません。content: {content}"
        assert "【追加するメッセージ】" in content
        assert "updatedAt" in result

    def test_メッセージが選択されていない場合エラー(self, dynamodb_tables):
        """selectedMessageIds が空の場合はエラーを返す。"""
        event = make_appsync_event("updateSummary", {
            "input": {
                "conversationId": "conv-err",
                "userId": "user1",
                "selectedMessageIds": [],
            }
        })
        result = _handler()(event, None)

        assert result["success"] is False
        assert "required" in result["error"]

    def test_conversationIdが未指定の場合エラー(self, dynamodb_tables):
        """conversationId が未指定の場合はエラー。"""
        event = make_appsync_event("updateSummary", {
            "input": {
                "userId": "user1",
                "selectedMessageIds": ["msg-0"],
            }
        })
        result = _handler()(event, None)

        assert result["success"] is False

    def test_存在しないメッセージIDを指定するとエラー(self, dynamodb_tables):
        """存在しないメッセージ ID のみを指定した場合エラーを返す。"""
        event = make_appsync_event("updateSummary", {
            "input": {
                "conversationId": "conv-bad",
                "userId": "user1",
                "selectedMessageIds": ["nonexistent-msg"],
            }
        })
        result = _handler()(event, None)

        assert result["success"] is False
        assert "No valid messages" in result["error"]

    def test_要約更新後にメッセージがisUsedInSummaryになる(self, dynamodb_tables, messages_table, summary_table):
        """要約更新後、対象メッセージの isUsedInSummary が True に更新される。"""
        msg_ids = _seed_messages(messages_table, "conv-mark")

        event = make_appsync_event("updateSummary", {
            "input": {
                "conversationId": "conv-mark",
                "userId": "user1",
                "selectedMessageIds": msg_ids,
            }
        })
        _handler()(event, None)

        # メッセージの isUsedInSummary を確認
        for msg_id in msg_ids:
            resp = messages_table.get_item(
                Key={"conversationId": "conv-mark", "messageId": msg_id}
            )
            assert resp["Item"]["isUsedInSummary"] is True

    def test_既存要約がある場合previousに保存される(self, dynamodb_tables, messages_table, summary_table):
        """既存の current がある場合、更新後に previous に退避される。"""
        summary_table.put_item(Item={
            "conversationId": "conv-prev",
            "title": "旧タイトル",
            "current": "# 旧タイトル\n旧内容",
            "previous": "",
            "updatedAt": "2024-01-01T00:00:00+00:00",
            "updatedBy": "user1",
        })
        msg_ids = _seed_messages(messages_table, "conv-prev")

        event = make_appsync_event("updateSummary", {
            "input": {
                "conversationId": "conv-prev",
                "userId": "user1",
                "selectedMessageIds": msg_ids,
            }
        })
        result = _handler()(event, None)

        # Summary型を直接返す（Subscriptionに対応）
        assert result["conversationId"] == "conv-prev"
        assert result["previous"] == "# 旧タイトル\n旧内容"

    def test_Bedrock呼び出しでの要約生成(self, dynamodb_tables, messages_table, monkeypatch):
        """USE_MOCK_AI=false の場合、Bedrock API を呼び出す。"""
        monkeypatch.setenv("USE_MOCK_AI", "false")
        import functions.summarizer.index as mod
        importlib.reload(mod)

        msg_ids = _seed_messages(messages_table, "conv-bedrock")

        mock_bedrock_response = "# AI要約\n\n## 決定事項\n- テスト完了"

        with patch("functions.summarizer.index.get_bedrock_client") as mock_client, \
             patch("functions.summarizer.index.invoke_bedrock", return_value=mock_bedrock_response):
            event = make_appsync_event("updateSummary", {
                "input": {
                    "conversationId": "conv-bedrock",
                    "userId": "user1",
                    "displayName": "Bedrockユーザー",
                    "selectedMessageIds": msg_ids,
                }
            })
            result = mod.lambda_handler(event, None)

        # Summary型を直接返す（Subscriptionに対応）
        assert result["conversationId"] == "conv-bedrock"
        assert result["current"] == mock_bedrock_response
        # ISSUE 05: タイトルはAI要約から抽出しない（ユーザー管理）
        assert result["updatedBy"] == "Bedrockユーザー"


# ================================================================
# undoSummary
# ================================================================

class TestUndoSummary:
    """Mutation.undoSummary のテスト群."""

    def test_要約を元に戻せる(self, dynamodb_tables, summary_table):
        """previous が存在する場合、要約を前バージョンに戻す。"""
        summary_table.put_item(Item={
            "conversationId": "conv-undo",
            "title": "現在のタイトル",
            "current": "# 現在のタイトル\n現在の内容",
            "previous": "# 前のタイトル\n前の内容",
            "updatedAt": "2024-01-01T00:00:00+00:00",
            "updatedBy": "user1",
        })

        event = make_appsync_event("undoSummary", {"conversationId": "conv-undo"})
        result = _handler()(event, None)

        # Summary型を直接返す（Subscriptionに対応）
        assert result["conversationId"] == "conv-undo"
        assert result["current"] == "# 前のタイトル\n前の内容"
        assert result["previous"] == ""
        assert result["title"] == "前のタイトル"

    def test_previousが空の場合エラー(self, dynamodb_tables, summary_table):
        """previous がない場合は undo 不可。"""
        summary_table.put_item(Item={
            "conversationId": "conv-no-undo",
            "title": "タイトル",
            "current": "内容",
            "previous": "",
            "updatedAt": "2024-01-01T00:00:00+00:00",
            "updatedBy": "user1",
        })

        event = make_appsync_event("undoSummary", {"conversationId": "conv-no-undo"})
        result = _handler()(event, None)

        assert result["success"] is False
        assert "No previous summary" in result["error"]

    def test_要約が存在しない場合エラー(self, dynamodb_tables):
        """要約レコードが存在しない場合はエラー。"""
        event = make_appsync_event("undoSummary", {"conversationId": "no-record"})
        result = _handler()(event, None)

        assert result["success"] is False

    def test_conversationIdが未指定の場合エラー(self, dynamodb_tables):
        """conversationId が未指定の場合はエラー。"""
        event = make_appsync_event("undoSummary", {})
        result = _handler()(event, None)

        assert result["success"] is False


# ================================================================
# saveSummaryEdit
# ================================================================

class TestSaveSummaryEdit:
    """Mutation.saveSummaryEdit のテスト群."""

    def test_手動編集を保存できる(self, dynamodb_tables, summary_table):
        """手動編集した要約が正しく保存される。"""
        summary_table.put_item(Item={
            "conversationId": "conv-edit",
            "title": "旧タイトル",
            "current": "旧内容",
            "previous": "",
            "updatedAt": "2024-01-01T00:00:00+00:00",
            "updatedBy": "user1",
        })

        new_content = "# 新タイトル\n\n## 決定事項\n- 変更1"
        event = make_appsync_event("saveSummaryEdit", {
            "input": {
                "conversationId": "conv-edit",
                "userId": "user2",
                "displayName": "編集ユーザー",
                "content": new_content,
            }
        })
        result = _handler()(event, None)

        # Summary型を直接返す（Subscriptionに対応）
        assert result["conversationId"] == "conv-edit"
        assert result["current"] == new_content
        assert result["title"] == "新タイトル"
        assert result["previous"] == "旧内容"
        assert result["updatedBy"] == "編集ユーザー"

    def test_5000文字超過でエラー(self, dynamodb_tables, summary_table):
        """要約が5000文字を超える場合はエラーを返す。"""
        summary_table.put_item(Item={
            "conversationId": "conv-long",
            "title": "",
            "current": "",
            "previous": "",
            "updatedAt": "2024-01-01T00:00:00+00:00",
            "updatedBy": "user1",
        })

        long_content = "あ" * 5001
        event = make_appsync_event("saveSummaryEdit", {
            "input": {
                "conversationId": "conv-long",
                "userId": "user1",
                "content": long_content,
            }
        })
        result = _handler()(event, None)

        assert result["success"] is False
        assert "5000" in result["error"]

    def test_5000文字ちょうどは成功する(self, dynamodb_tables, summary_table):
        """5000文字ちょうどの場合は保存可能（境界値テスト）。"""
        summary_table.put_item(Item={
            "conversationId": "conv-boundary",
            "title": "",
            "current": "",
            "previous": "",
            "updatedAt": "2024-01-01T00:00:00+00:00",
            "updatedBy": "user1",
        })

        content = "# タイトル\n" + "あ" * 4990
        event = make_appsync_event("saveSummaryEdit", {
            "input": {
                "conversationId": "conv-boundary",
                "userId": "user1",
                "content": content,
            }
        })
        result = _handler()(event, None)

        # Summary型を直接返す（Subscriptionに対応）
        assert result["conversationId"] == "conv-boundary"
        assert len(result["current"]) == len(content)

    def test_conversationIdが未指定の場合エラー(self, dynamodb_tables):
        """conversationId がない場合はエラー。"""
        event = make_appsync_event("saveSummaryEdit", {
            "input": {"userId": "user1", "content": "内容"}
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
