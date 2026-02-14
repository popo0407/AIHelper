"""ai_support Lambda 関数のユニットテスト."""
import importlib
import pytest
from unittest.mock import patch
from helpers import make_appsync_event


@pytest.fixture(autouse=True)
def _reload_module(dynamodb_tables):
    """各テストの前にモジュールをリロードして config を再生成する。"""
    import functions.ai_support.index as mod
    importlib.reload(mod)
    yield


def _handler():
    from functions.ai_support.index import lambda_handler
    return lambda_handler


def _seed_data(messages_table, summary_table, conv_id="conv-ai"):
    """テスト用のメッセージと要約を作成する。"""
    msg_ids = []
    for i in range(2):
        msg_id = f"ai-msg-{i}"
        messages_table.put_item(Item={
            "conversationId": conv_id,
            "messageId": msg_id,
            "userId": "user1",
            "displayName": "テストユーザー",
            "content": f"テスト発言{i}",
            "timestamp": f"2024-01-01T00:00:0{i}+00:00",
            "isUsedInSummary": False,
        })
        msg_ids.append(msg_id)

    summary_table.put_item(Item={
        "conversationId": conv_id,
        "title": "テスト要約",
        "current": "# テスト要約\n現在の要約内容",
        "previous": "",
        "updatedAt": "2024-01-01T00:00:00+00:00",
        "updatedBy": "user1",
    })
    return msg_ids


# ================================================================
# askAIHelper - summarize
# ================================================================

class TestAskAIHelperSummarize:
    """askAIHelper (actionType=summarize) のテスト群."""

    def test_モックAIで要約応答を取得できる(self, dynamodb_tables, messages_table, summary_table):
        """summarize アクションでモック AI 応答が返る。"""
        msg_ids = _seed_data(messages_table, summary_table)

        event = make_appsync_event("askAIHelper", {
            "input": {
                "conversationId": "conv-ai",
                "userId": "user1",
                "actionType": "summarize",
                "selectedMessageIds": msg_ids,
            }
        })
        result = _handler()(event, None)

        # Message型を直接返す（Subscriptionに対応）
        assert result["messageId"] is not None
        assert result["userId"] == "AIHELPER"
        assert result["displayName"] == "AIHelper"
        # デバッグ情報フォーマットの確認（モック機能の有効性検証）
        assert "【モック応答 - デバッグ情報】" in result["content"]
        assert "アクションタイプ: summarize" in result["content"]
        # DynamoDB から取得したデータが含まれているか確認（データ取得検証）
        assert "【選択されたメッセージ】" in result["content"] or "テスト発言" in result["content"]

    def test_要約応答がメッセージテーブルに保存される(self, dynamodb_tables, messages_table, summary_table):
        """AI 応答がメッセージとして DB に保存される。"""
        msg_ids = _seed_data(messages_table, summary_table)

        event = make_appsync_event("askAIHelper", {
            "input": {
                "conversationId": "conv-ai",
                "userId": "user1",
                "actionType": "summarize",
                "selectedMessageIds": msg_ids,
            }
        })
        result = _handler()(event, None)

        # DB から直接確認
        saved = messages_table.get_item(Key={
            "conversationId": "conv-ai",
            "messageId": result["messageId"],
        })
        assert saved["Item"]["content"] == result["content"]


# ================================================================
# askAIHelper - opinion
# ================================================================

class TestAskAIHelperOpinion:
    """askAIHelper (actionType=opinion) のテスト群."""

    def test_モックAIで意見応答を取得できる(self, dynamodb_tables, messages_table, summary_table):
        """opinion アクションでモック AI 応答が返る。"""
        msg_ids = _seed_data(messages_table, summary_table)

        event = make_appsync_event("askAIHelper", {
            "input": {
                "conversationId": "conv-ai",
                "userId": "user1",
                "actionType": "opinion",
                "selectedMessageIds": msg_ids,
            }
        })
        result = _handler()(event, None)

        # Message型を直接返す（Subscriptionに対応）
        assert result["messageId"] is not None
        # デバッグ情報フォーマットの確認（モック機能の有効性検証）
        assert "【モック応答 - デバッグ情報】" in result["content"]
        assert "アクションタイプ: opinion" in result["content"]
        # DynamoDB から取得したデータが含まれているか確認（データ取得検証）
        assert "【選択されたメッセージ】" in result["content"] or "テスト発言" in result["content"]


# ================================================================
# askAIHelper - answer
# ================================================================

class TestAskAIHelperAnswer:
    """askAIHelper (actionType=answer) のテスト群."""

    def test_モックAIで質問回答を取得できる(self, dynamodb_tables, messages_table, summary_table):
        """answer アクションでモック AI 応答が返る。"""
        _seed_data(messages_table, summary_table)

        event = make_appsync_event("askAIHelper", {
            "input": {
                "conversationId": "conv-ai",
                "userId": "user1",
                "actionType": "answer",
                "userInput": "次のステップは？",
            }
        })
        result = _handler()(event, None)

        # Message型を直接返す（Subscriptionに対応）
        assert result["messageId"] is not None
        # デバッグ情報フォーマットの確認（モック機能の有効性検証）
        assert "【モック応答 - デバッグ情報】" in result["content"]
        assert "アクションタイプ: answer" in result["content"]
        # ユーザー入力が含まれているか確認（ユーザー入力受け取り検証）
        assert "【ユーザー入力】" in result["content"] or "次のステップ" in result["content"]


# ================================================================
# askAIHelper - next_action
# ================================================================

class TestAskAIHelperNextAction:
    """askAIHelper (actionType=next_action) のテスト群."""

    def test_モックAIで次アクション提案を取得できる(self, dynamodb_tables, messages_table, summary_table):
        """next_action アクションでモック AI 応答が返る。"""
        _seed_data(messages_table, summary_table)

        event = make_appsync_event("askAIHelper", {
            "input": {
                "conversationId": "conv-ai",
                "userId": "user1",
                "actionType": "next_action",
            }
        })
        result = _handler()(event, None)

        # Message型を直接返す（Subscriptionに対応）
        assert result["messageId"] is not None
        # デバッグ情報フォーマットの確認（モック機能の有効性検証）
        assert "【モック応答 - デバッグ情報】" in result["content"]
        assert "アクションタイプ: next_action" in result["content"]
        # DynamoDB から取得した要約が含まれているか確認（データ取得検証）
        assert "【現在の要約】" in result["content"] or "テスト要約" in result["content"]


# ================================================================
# askAIHelper - Bedrock 呼び出し
# ================================================================

class TestAskAIHelperBedrock:
    """USE_MOCK_AI=false での Bedrock 呼び出しテスト."""

    def test_Bedrockを使った要約生成(self, dynamodb_tables, messages_table, summary_table, monkeypatch):
        """USE_MOCK_AI=false の場合、Bedrock API をモックで呼び出す。"""
        monkeypatch.setenv("USE_MOCK_AI", "false")
        import functions.ai_support.index as mod
        importlib.reload(mod)

        msg_ids = _seed_data(messages_table, summary_table)

        with patch("functions.ai_support.index.get_bedrock_client") as mock_get_client, \
             patch("functions.ai_support.index.invoke_bedrock", return_value="Bedrock AI 応答テスト"):
            event = make_appsync_event("askAIHelper", {
                "input": {
                    "conversationId": "conv-ai",
                    "userId": "user1",
                    "actionType": "summarize",
                    "selectedMessageIds": msg_ids,
                }
            })
            result = mod.lambda_handler(event, None)

        # Message型を直接返す（Subscriptionに対応）
        assert result["messageId"] is not None
        assert result["content"] == "Bedrock AI 応答テスト"


# ================================================================
# 異常系
# ================================================================

class TestAskAIHelperErrors:
    """askAIHelper の異常系テスト."""

    def test_conversationIdが未指定の場合エラー(self, dynamodb_tables):
        """conversationId がない場合はエラー。"""
        event = make_appsync_event("askAIHelper", {
            "input": {
                "userId": "user1",
                "actionType": "summarize",
            }
        })
        result = _handler()(event, None)

        assert result["success"] is False
        assert "required" in result["error"]

    def test_userIdが未指定の場合エラー(self, dynamodb_tables):
        """userId がない場合はエラー。"""
        event = make_appsync_event("askAIHelper", {
            "input": {
                "conversationId": "conv-ai",
                "actionType": "summarize",
            }
        })
        result = _handler()(event, None)

        assert result["success"] is False
        assert "required" in result["error"]

    def test_actionTypeが未指定の場合エラー(self, dynamodb_tables):
        """actionType がない場合はエラー。"""
        event = make_appsync_event("askAIHelper", {
            "input": {
                "conversationId": "conv-ai",
                "userId": "user1",
            }
        })
        result = _handler()(event, None)

        assert result["success"] is False
        assert "required" in result["error"]

    def test_不明なactionTypeでもモック応答を返す(self, dynamodb_tables, messages_table, summary_table):
        """未知の actionType でもモックのデフォルト応答を返す。"""
        _seed_data(messages_table, summary_table)

        event = make_appsync_event("askAIHelper", {
            "input": {
                "conversationId": "conv-ai",
                "userId": "user1",
                "actionType": "unknown_action",
            }
        })
        result = _handler()(event, None)

        # Message型を直接返す（Subscriptionに対応）
        assert result["messageId"] is not None
        # デバッグ情報フォーマットの確認（モック機能の有効性検証）
        assert "【モック応答 - デバッグ情報】" in result["content"]
        assert "アクションタイプ: unknown_action" in result["content"]


# ================================================================
# 不明なフィールド
# ================================================================

class TestUnknownField:
    """未知のフィールド名に対するテスト."""

    def test_askAIHelper以外のフィールドでエラー(self, dynamodb_tables):
        """askAIHelper 以外の fieldName でエラーを返す。"""
        event = make_appsync_event("someOtherField", {})
        result = _handler()(event, None)

        assert result["success"] is False
        assert "Unknown field" in result["error"]
