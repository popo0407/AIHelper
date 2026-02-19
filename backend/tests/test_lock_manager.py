"""lock_manager Lambda 関数のユニットテスト."""
import importlib
import time
import pytest
from helpers import make_appsync_event


@pytest.fixture(autouse=True)
def _reload_module(dynamodb_tables):
    """各テストの前にモジュールをリロードして config を再生成する。"""
    import functions.lock_manager.index as mod
    importlib.reload(mod)
    yield


def _handler():
    from functions.lock_manager.index import lambda_handler
    return lambda_handler


def _create_active_lock(locks_table, conv_id, user_id, op_type="edit"):
    """有効期限内のロックを作成するヘルパー。"""
    now = int(time.time())
    lock_item = {
        "conversationId": conv_id,
        "lockType": f"{op_type}#{user_id}",
        "userId": user_id,
        "operationType": op_type,
        "startTime": "2024-01-01T00:00:00+00:00",
        "ttl": now + 180,  # 3分後に期限切れ
    }
    locks_table.put_item(Item=lock_item)
    return lock_item


def _create_expired_lock(locks_table, conv_id, user_id, op_type="edit"):
    """期限切れのロックを作成するヘルパー。"""
    lock_item = {
        "conversationId": conv_id,
        "lockType": f"{op_type}#{user_id}",
        "userId": user_id,
        "operationType": op_type,
        "startTime": "2024-01-01T00:00:00+00:00",
        "ttl": 1,  # 1970年 = 期限切れ
    }
    locks_table.put_item(Item=lock_item)
    return lock_item


# ================================================================
# acquireLock
# ================================================================

class TestAcquireLock:
    """Mutation.acquireLock のテスト群."""

    def test_正常にロックを取得できる(self, dynamodb_tables):
        """ロックが存在しない場合、正常に取得できる。"""
        event = make_appsync_event("acquireLock", {
            "input": {
                "conversationId": "conv-lock",
                "userId": "user1",
                "operationType": "edit",
            }
        })
        result = _handler()(event, None)

        # acquireLock は Lock! を直接返す（GraphQL スキーマ準拠）
        assert result["conversationId"] == "conv-lock"
        assert result["userId"] == "user1"
        assert result["operationType"] == "edit"
        assert "ttl" in result

    def test_summarizeロックを取得できる(self, dynamodb_tables):
        """summarize タイプのロックが正常に取得できる。"""
        event = make_appsync_event("acquireLock", {
            "input": {
                "conversationId": "conv-lock",
                "userId": "user1",
                "operationType": "summarize",
            }
        })
        result = _handler()(event, None)

        assert result["operationType"] == "summarize"

    def test_他ユーザーがロック中の場合エラー(self, dynamodb_tables, locks_table):
        """別のユーザーがロックを保持している場合は ValueError を送出する。"""
        _create_active_lock(locks_table, "conv-locked", "other_user", "edit")

        event = make_appsync_event("acquireLock", {
            "input": {
                "conversationId": "conv-locked",
                "userId": "new_user",
                "operationType": "edit",
            }
        })
        with pytest.raises(ValueError, match="another user"):
            _handler()(event, None)

    def test_同一ユーザーは再取得できる(self, dynamodb_tables, locks_table):
        """同じユーザーがロックを保持中でも再取得できる。"""
        _create_active_lock(locks_table, "conv-same", "user1", "edit")

        event = make_appsync_event("acquireLock", {
            "input": {
                "conversationId": "conv-same",
                "userId": "user1",
                "operationType": "edit",
            }
        })
        result = _handler()(event, None)

        assert result["userId"] == "user1"

    def test_期限切れロックは無視される(self, dynamodb_tables, locks_table):
        """期限が切れたロックがある場合は新規ロックを取得できる。"""
        _create_expired_lock(locks_table, "conv-expired", "old_user", "edit")

        event = make_appsync_event("acquireLock", {
            "input": {
                "conversationId": "conv-expired",
                "userId": "new_user",
                "operationType": "edit",
            }
        })
        result = _handler()(event, None)

        assert result["userId"] == "new_user"

    def test_conversationIdが未指定の場合エラー(self, dynamodb_tables):
        """conversationId がない場合は ValueError を送出する。"""
        event = make_appsync_event("acquireLock", {
            "input": {"userId": "user1", "operationType": "edit"}
        })
        with pytest.raises(ValueError, match="required"):
            _handler()(event, None)

    def test_userIdが未指定の場合エラー(self, dynamodb_tables):
        """userId がない場合は ValueError を送出する。"""
        event = make_appsync_event("acquireLock", {
            "input": {"conversationId": "conv-1", "operationType": "edit"}
        })
        with pytest.raises(ValueError, match="required"):
            _handler()(event, None)

    def test_不正なoperationTypeの場合エラー(self, dynamodb_tables):
        """operationType が edit/summarize 以外の場合は ValueError を送出する。"""
        event = make_appsync_event("acquireLock", {
            "input": {
                "conversationId": "conv-1",
                "userId": "user1",
                "operationType": "invalid",
            }
        })
        with pytest.raises(ValueError, match="operationType"):
            _handler()(event, None)


# ================================================================
# releaseLock
# ================================================================

class TestReleaseLock:
    """Mutation.releaseLock のテスト群."""

    def test_正常にロックを解放できる(self, dynamodb_tables, locks_table):
        """保持中のロックを解放できる。"""
        _create_active_lock(locks_table, "conv-rel", "user1", "edit")

        event = make_appsync_event("releaseLock", {
            "input": {
                "conversationId": "conv-rel",
                "userId": "user1",
            }
        })
        result = _handler()(event, None)

        # releaseLock は Lock! を直接返す（GraphQL スキーマ準拠）
        assert result["userId"] == "user1"

    def test_ロックが存在しない場合エラー(self, dynamodb_tables):
        """ロックが存在しないユーザーの解放リクエストは ValueError を送出する。"""
        event = make_appsync_event("releaseLock", {
            "input": {
                "conversationId": "conv-none",
                "userId": "user_no_lock",
            }
        })
        with pytest.raises(ValueError, match="No lock found"):
            _handler()(event, None)

    def test_conversationIdが未指定の場合エラー(self, dynamodb_tables):
        """conversationId がない場合は ValueError を送出する。"""
        event = make_appsync_event("releaseLock", {
            "input": {"userId": "user1"}
        })
        with pytest.raises(ValueError, match="required"):
            _handler()(event, None)

    def test_userIdが未指定の場合エラー(self, dynamodb_tables):
        """userId がない場合は ValueError を送出する。"""
        event = make_appsync_event("releaseLock", {
            "input": {"conversationId": "conv-1"}
        })
        with pytest.raises(ValueError, match="required"):
            _handler()(event, None)


# ================================================================
# getLocks
# ================================================================

class TestGetLocks:
    """Query.getLocks のテスト群."""

    def test_アクティブなロック一覧を取得できる(self, dynamodb_tables, locks_table):
        """有効期限内のロックのみ返す。"""
        _create_active_lock(locks_table, "conv-gl", "user1", "edit")
        _create_active_lock(locks_table, "conv-gl", "user2", "summarize")

        event = make_appsync_event("getLocks", {"conversationId": "conv-gl"})
        result = _handler()(event, None)

        assert isinstance(result, list)
        assert len(result) == 2

    def test_期限切れのロックは除外される(self, dynamodb_tables, locks_table):
        """TTL が過ぎたロックはリストに含まれない。"""
        _create_active_lock(locks_table, "conv-gl2", "user1", "edit")
        _create_expired_lock(locks_table, "conv-gl2", "user2", "summarize")

        event = make_appsync_event("getLocks", {"conversationId": "conv-gl2"})
        result = _handler()(event, None)

        assert isinstance(result, list)
        assert len(result) == 1
        assert result[0]["userId"] == "user1"

    def test_ロックが存在しない場合空リスト(self, dynamodb_tables):
        """ロックがない conversation では空リストを返す。"""
        event = make_appsync_event("getLocks", {"conversationId": "conv-empty"})
        result = _handler()(event, None)

        assert result == []


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
