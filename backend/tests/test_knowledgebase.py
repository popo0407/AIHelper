"""knowledgebase Lambda 関数のユニットテスト."""
import importlib
import pytest
from helpers import make_appsync_event


@pytest.fixture(autouse=True)
def _reload_module(dynamodb_tables, s3_knowledge_bucket):
    """各テストの前にモジュールをリロードして config を再生成する。"""
    import functions.knowledgebase.index as mod
    importlib.reload(mod)
    yield


def _handler():
    from functions.knowledgebase.index import lambda_handler
    return lambda_handler


def _seed_knowledge_source(knowledge_sources_table, conv_id="conv-kb", **overrides):
    """テスト用のナレッジソースを登録する。"""
    item = {
        "conversationId": conv_id,
        "knowledgeSourceId": "ks-001",
        "fileName": "test-document.txt",
        "fileSize": 1024,
        "s3Key": f"conversations/{conv_id}/ks-001/test-document.txt",
        "contentType": "txt",
        "uploadedBy": "user1",
        "uploadedAt": "2024-01-01T00:00:00+00:00",
        "status": "ready",
    }
    item.update(overrides)
    knowledge_sources_table.put_item(Item=item)
    return item


def _upload_test_file(s3_knowledge_bucket, conv_id="conv-kb", ks_id="ks-001", file_name="test-document.txt", content="テストドキュメントの内容です。"):
    """S3 にテスト用ファイルをアップロードする。"""
    bucket_name = "test-knowledge-bucket"
    s3_key = f"conversations/{conv_id}/{ks_id}/{file_name}"
    s3_knowledge_bucket.put_object(
        Bucket=bucket_name,
        Key=s3_key,
        Body=content.encode("utf-8"),
    )
    return s3_key


# ================================================================
# listKnowledgeSources
# ================================================================


class TestListKnowledgeSources:
    """listKnowledgeSources クエリのテスト群."""

    def test_空のリストを返す(self, dynamodb_tables):
        """ナレッジソースが登録されていない場合、空リストを返す。"""
        event = make_appsync_event("listKnowledgeSources", {
            "conversationId": "conv-empty",
        })
        result = _handler()(event, None)
        assert result == []

    def test_登録済みソースをリストアップできる(self, dynamodb_tables, knowledge_sources_table):
        """登録されたナレッジソースが一覧で取得できる。"""
        _seed_knowledge_source(knowledge_sources_table, conv_id="conv-list")
        _seed_knowledge_source(
            knowledge_sources_table,
            conv_id="conv-list",
            knowledgeSourceId="ks-002",
            fileName="another-file.pdf",
            contentType="pdf",
        )

        event = make_appsync_event("listKnowledgeSources", {
            "conversationId": "conv-list",
        })
        result = _handler()(event, None)

        assert len(result) == 2
        names = {item["fileName"] for item in result}
        assert "test-document.txt" in names
        assert "another-file.pdf" in names

    def test_別の会話のソースは含まれない(self, dynamodb_tables, knowledge_sources_table):
        """異なる conversationId のソースは結果に含まれない。"""
        _seed_knowledge_source(knowledge_sources_table, conv_id="conv-a")
        _seed_knowledge_source(knowledge_sources_table, conv_id="conv-b", knowledgeSourceId="ks-b")

        event = make_appsync_event("listKnowledgeSources", {
            "conversationId": "conv-a",
        })
        result = _handler()(event, None)
        assert len(result) == 1
        assert result[0]["conversationId"] == "conv-a"


# ================================================================
# uploadKnowledgebase
# ================================================================


class TestUploadKnowledgebase:
    """uploadKnowledgebase ミューテーションのテスト群."""

    def test_正常にアップロード準備ができる(self, dynamodb_tables, knowledge_sources_table, s3_knowledge_bucket):
        """有効なファイル情報で presigned URL と metadata が返る。"""
        event = make_appsync_event("uploadKnowledgebase", {
            "input": {
                "conversationId": "conv-upload",
                "fileName": "report.txt",
                "fileSize": 2048,
                "contentType": "txt",
                "uploadedBy": "user1",
            }
        })
        result = _handler()(event, None)

        assert result["success"] is True
        assert result["presignedUrl"] is not None
        assert "https" in result["presignedUrl"]
        assert result["knowledgeSource"]["fileName"] == "report.txt"
        assert result["knowledgeSource"]["status"] == "ready"

        # DynamoDB にメタデータが保存されている
        scan = knowledge_sources_table.scan()
        items = scan["Items"]
        assert len(items) == 1
        assert items[0]["fileName"] == "report.txt"

    def test_サポートされていない形式はエラーを返す(self, dynamodb_tables, s3_knowledge_bucket):
        """許可されていない contentType の場合エラーを返す。"""
        event = make_appsync_event("uploadKnowledgebase", {
            "input": {
                "conversationId": "conv-upload",
                "fileName": "data.csv",
                "fileSize": 512,
                "contentType": "csv",
                "uploadedBy": "user1",
            }
        })
        result = _handler()(event, None)

        assert result["success"] is False
        assert "サポートされていない" in result["error"]

    def test_ファイルサイズ上限超過はエラーを返す(self, dynamodb_tables, s3_knowledge_bucket):
        """25MB を超えるファイルの場合エラーを返す。"""
        event = make_appsync_event("uploadKnowledgebase", {
            "input": {
                "conversationId": "conv-upload",
                "fileName": "huge.pdf",
                "fileSize": 30 * 1024 * 1024,  # 30MB
                "contentType": "pdf",
                "uploadedBy": "user1",
            }
        })
        result = _handler()(event, None)

        assert result["success"] is False
        assert "上限" in result["error"]


# ================================================================
# deleteKnowledgebase
# ================================================================


class TestDeleteKnowledgebase:
    """deleteKnowledgebase ミューテーションのテスト群."""

    def test_正常に削除できる(self, dynamodb_tables, knowledge_sources_table, s3_knowledge_bucket):
        """S3 ファイルと DynamoDB メタデータが削除される。"""
        item = _seed_knowledge_source(knowledge_sources_table, conv_id="conv-del")
        _upload_test_file(s3_knowledge_bucket, conv_id="conv-del")

        event = make_appsync_event("deleteKnowledgebase", {
            "input": {
                "conversationId": "conv-del",
                "fileName": "test-document.txt",  # 実装は fileName を RANGE KEYとして使用
            }
        })
        result = _handler()(event, None)

        assert result["success"] is True
        assert result["fileName"] == "test-document.txt"

        # DynamoDB からメタデータが削除されている
        response = knowledge_sources_table.get_item(
            Key={"conversationId": "conv-del", "fileName": "test-document.txt"}
        )
        assert "Item" not in response

    def test_存在しないソースの削除はエラーを返す(self, dynamodb_tables, s3_knowledge_bucket):
        """存在しない fileName の場合エラーを返す。"""
        event = make_appsync_event("deleteKnowledgebase", {
            "input": {
                "conversationId": "conv-notexist",
                "fileName": "nonexistent.txt",
            }
        })
        result = _handler()(event, None)

        assert result["success"] is False
        assert "見つかりません" in result["error"]


# ================================================================
# searchKnowledgebase
# ================================================================


class TestSearchKnowledgebase:
    """searchKnowledgebase ミューテーションのテスト群."""

    def test_ソースがない場合案内メッセージを返す(self, dynamodb_tables):
        """ナレッジソースが登録されていない場合、案内メッセージを返す。"""
        event = make_appsync_event("searchKnowledgebase", {
            "input": {
                "conversationId": "conv-nosrc",
                "query": "テスト検索",
            }
        })
        result = _handler()(event, None)

        assert "ナレッジベースが登録されていません" in result["answer"]
        assert result["sources"] == []

    def test_モックAIで検索結果を返す(self, dynamodb_tables, knowledge_sources_table, s3_knowledge_bucket):
        """USE_MOCK_AI=true の場合、デバッグ情報付きモック応答が返る。"""
        _seed_knowledge_source(knowledge_sources_table, conv_id="conv-search")
        _upload_test_file(s3_knowledge_bucket, conv_id="conv-search")

        event = make_appsync_event("searchKnowledgebase", {
            "input": {
                "conversationId": "conv-search",
                "query": "ドキュメントの内容を教えて",
            }
        })
        result = _handler()(event, None)

        assert result["conversationId"] == "conv-search"
        assert result["query"] == "ドキュメントの内容を教えて"
        
        # モック応答にはデバッグ情報が含まれている
        answer = result["answer"]
        assert "【モック回答 - RAG デバッグ情報】" in answer
        assert "ユーザーの質問" in answer
        assert "知識ベース確認" in answer
        assert "キーワード抽出（疑似実行）" in answer
        assert "コンテンツ検索" in answer
        assert "RAG 応答生成" in answer
        
        # ドキュメント情報が表示されている
        assert "test-document.txt" in answer
        
        # ソースが正しく返されている
        assert "test-document.txt" in result["sources"]


# ================================================================
# lambda_handler ルーティング
# ================================================================


class TestLambdaHandlerRouting:
    """lambda_handler のフィールドルーティングテスト群."""

    def test_不明なフィールド名はエラーになる(self, dynamodb_tables, s3_knowledge_bucket):
        """未定義の fieldName の場合 ValueError が発生する。"""
        event = make_appsync_event("unknownField", {})
        with pytest.raises(ValueError, match="Unknown field"):
            _handler()(event, None)
