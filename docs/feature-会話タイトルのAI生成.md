# 機能仕様：会話タイトルのAI自動生成（非同期）

## 概要

会話開始時に初回ユーザーメッセージを受け取った際、AIを用いて **短いタイトル（20文字以内）** を自動生成し、会話セッションに付与する機能。

---

## 変更内容

### Before（現在の動作）

- 初回メッセージ送信後、メッセージの最初の50文字を自動的にタイトルに設定
- シンプルだが、長すぎたり意味が曖昧なタイトルになることがある

### After（新仕様）

- 初回メッセージをAIに送送信し、短いタイトル（20文字以内）を生成させる
- **非同期処理** で実行（ユーザー待機なし）
- AI生成失敗時はフォールバック：メッセージの最初の50文字を使用

---

## 動作フロー

```
ユーザー「初回メッセージ」を送信
  ↓
[フロントエンド] ChatScreen.tsx：メッセージ送信完了
  ↓
[フロントエンド] handleSendMessage() 内で、
   isFirstMessageSentRef.current === false か確認
  ↓
   YES → conversation Lambda の GraphQL Mutation
         「generateConversationTitle」を非同期実行
         （タイトルが空の場合のみ）
  ↓
[バックエンド] conversation Lambda
  → conversation テーブルの title フィールドを確認
  → 空の場合、ai_support.call_llm() を呼び出し
  ↓
[LLM] Bedrock Claude にプロンプト送信：
  「ユーザーのメッセージから 短いタイトル（20文字以内程度）
   を生成してください」
  ↓
  タイトル生成結果を conversationId で取得
  ↓
[バックエンド] タイトルを Conversations + Summary テーブルに保存
  ↓
[フロントエンド] タイトル変更イベント受信 → 画面反映
  または
  別途 Polling / Subscription で最新タイトル取得
```

---

## 実装パターン

### パターン①：GraphQL Mutation（推奨）

**endpoint:** `Mutation.generateConversationTitle`

```graphql
mutation GenerateConversationTitle {
  generateConversationTitle(input: {
    conversationId: String!
    messageContent: String!
  }) {
    conversationId
    title
    success
    errorMessage
  }
}
```

**フロントエンド側（ChatScreen.tsx）**

```typescript
// 初回メッセージ送信直後、タイトルが空の場合
if (!isFirstMessageSentRef.current && conversationTitle === "無題の会話") {
  isFirstMessageSentRef.current = true;
  // 非同期で実行（await しない）
  graphqlClient
    .graphql({
      query: GENERATE_CONVERSATION_TITLE,
      variables: {
        input: {
          conversationId: conversation.conversationId,
          messageContent: content, // ユーザーのメッセージテキスト
        },
      },
    })
    .catch((err) => console.error("Failed to generate title:", err));
}
```

**バックエンド側（conversation/index.py）**

```python
def handle_generate_conversation_title(args: dict) -> dict:
    """Generate conversation title from first message using LLM."""
    inp = args.get("input", {})
    conversation_id = inp.get("conversationId")
    message_content = inp.get("messageContent")

    if not conversation_id or not message_content:
        raise ValueError("conversationId and messageContent are required.")

    # Check if title is already generated
    conversations_table = get_dynamodb_table(config.conversations_table)
    conv_resp = conversations_table.get_item(
        Key={"conversationId": conversation_id}
    )
    conv_item = conv_resp.get("Item", {})

    if conv_item.get("title"):
        # Already has title, skip
        return {
            "conversationId": conversation_id,
            "title": conv_item["title"],
            "success": True,
        }

    # Call LLM to generate title
    try:
        from common.ai_support import call_llm

        prompt = f"""ユーザーのメッセージから 短いタイトル（20文字以内程度） を生成してください。

ユーザーメッセージ：
{message_content}

タイトルのみを返してください。説明文や余分な文字は不要です。"""

        title = call_llm(prompt, max_tokens=50)
        title = title.strip()[:20]  # 念のため20文字制限

    except Exception as e:
        # Fallback: first 50 chars
        logger.warning(f"Failed to generate title via LLM: {e}")
        title = message_content[:50] + ('...' if len(message_content) > 50 else '')

    # Update database
    conversations_table.update_item(
        Key={"conversationId": conversation_id},
        UpdateExpression="SET title = :title",
        ExpressionAttributeValues={":title": title},
    )

    summary_table = get_dynamodb_table(config.summary_table)
    summary_table.update_item(
        Key={"conversationId": conversation_id},
        UpdateExpression="SET title = :title",
        ExpressionAttributeValues={":title": title},
    )

    logger.info(f"Generated title for {conversation_id}: {title}")
    return {
        "conversationId": conversation_id,
        "title": title,
        "success": True,
    }
```

---

## テスト仕様

### ユニットテスト（test_conversation.py）

```python
def test_generateConversationTitle_成功時():
    """タイトルが正常に生成される。"""
    # Given: 新規会話（titleが空）
    # When: generateConversationTitle を呼び出し
    # Then: LLMから返された短いタイトルが saved される

def test_generateConversationTitle_失敗時_フォールバック():
    """LLM失敗時は最初の50文字を使う。"""
    # Given: LLMが失敗する状態をモック
    # When: generateConversationTitle を呼び出し
    # Then: メッセージの最初の50文字がタイトルになる

def test_generateConversationTitle_既に存在する場合():
    """タイトルが既に存在する場合はスキップ。"""
    # Given: 既にタイトルが存在する会話
    # When: generateConversationTitle を呼び出し
    # Then: 既存タイトルのままで変更されない
```

### E2Eテスト（conversation-features.spec.ts）

```typescript
test("初回メッセージ送信後、AIがタイトルを生成する", async ({ page }) => {
  // Given: ログイン済みで新規会話を開始
  // When: 初回メッセージを送信
  // Then: 数秒後、AIが生成したタイトルが表示される
});
```

---

## 実装チェックリスト

- [ ] **フロントエンド**
  - [ ] ChatScreen.tsx：初回メッセージ送信時に `generateConversationTitle` mutation を非同期実行
  - [ ] サブスクリプション / Polling で title 更新を反映
  - [ ] TODO UI（生成中表示）は **なし**（無表示）

- [ ] **バックエンド**
  - [ ] Mutation `generateConversationTitle` を conversation/index.py に追加
  - [ ] ai_support.call_llm() を使用
  - [ ] Conversations + Summary テーブルの両方を更新
  - [ ] フェイルセーフ：LLM失敗時は50文字フォールバック

- [ ] **GraphQL スキーマ**
  - [ ] cdk/graphql/schema.graphql に `generateConversationTitle` mutation を追加

- [ ] **テスト**
  - [ ] ユニットテスト（成功、失敗、既存タイトル）
  - [ ] E2Eテスト（非同期生成の確認）

- [ ] **ドキュメント**
  - [ ] README.md に機能を記載
  - [ ] docs/retrospective.md に実装記録

---

## 懸念事項・検討点

1. **LLM の遅延**
   - 通常 1～3秒程度だが、負荷が高い場合は遅くなる可能性
   - → 非同期なので UX 影響なし

2. **20文字制限**
   - 中文など文字が多くなる言語対応
   - → 実装時にプロンプト調整

3. **タイトル変更イベントの同期**
   - フロントエンド側で title 更新をリアルタイム反映する仕組み
   - → ConversationSelect で定期 Poll OR GraphQL Subscription

---

## 参考：既存コード

### ai_support.call_llm() の使用例

```python
from common.ai_support import call_llm

result = call_llm(
    prompt="...",
    max_tokens=100,
    temperature=0.7  # オプション
)
```

### 既存の summarizer での AI 呼び出し

- [backend/functions/summarizer/index.py](../backend/functions/summarizer/index.py)
- プロンプト例：`SUMMARY_PROMPT_TEMPLATE`

---

## 予想される実装時間

- **フロントエンド：** 1～2時間（既存の handleTitleChange の応用）
- **バックエンド：** 1～2時間（新 Mutation 追加 + テスト）
- **GraphQL スキーマ更新：** 30分
- **テスト・確認：** 1時間

**合計：** 約 4～5時間
