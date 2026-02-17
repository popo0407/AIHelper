# ユーザー会話アクセス制限機能 実装計画

## 📋 機能概要

ユーザーが特定の会話セッションにのみ参加できるようにする機能。作成者またはリンク経由の参加者のみがその会話にアクセス可能。

### 実装パターン

- **案A採用**: フロントエンドで会話を開いている人のみが、メッセージ受信時に自動的に`lastMessageId`を更新
- **再参加時の機能**: 保存された`lastMessageId`から表示開始

---

## 🏗️ 全体アーキテクチャ

```
┌─────────────────────────────────────────────────┐
│                 フロントエンド                   │
├─────────────────────────────────────────────────┤
│ 1. 会話を開く → Subscription開始                  │
│    └→ joinConversation（参加者が存在しない場合）  │
│                                                 │
│ 2. メッセージ受信（Subscription.onMessageCreated）│
│    └→ UpdateLastMessageId自動呼び出し (重要)     │
│                                                 │
│ 3. 会話を閉じる → Subscription終了               │
│    └→ leaveConversation呼び出し（role=inactive） │
└─────────────────────────────────────────────────┘
           ↓↑ GraphQL API
┌─────────────────────────────────────────────────┐
│              AppSync + Lambda                   │
├─────────────────────────────────────────────────┤
│ • getConversation (アクセス制御: 参加者のみ)      │
│ • listConversations (フィルター: 参加者のみ表示)   │
│ • joinConversation (新規)                       │
│ • leaveConversation (新規)                      │
│ • updateLastMessageId (新規)                    │
└─────────────────────────────────────────────────┘
           ↓↑ DynamoDB
┌─────────────────────────────────────────────────┐
│            DynamoDB Table: UserConversation     │
├─────────────────────────────────────────────────┤
│ PK: loginId | SK: conversationId                │
│ Attributes:                                     │
│ • joinedAt: timestamp                          │
│ • role: 'creator'|'participant'|'inactive'     │
│ • lastMessageId: string (新規)                  │
│ • lastUpdatedAt: timestamp (新規)               │
└─────────────────────────────────────────────────┘
```

---

## 📝 実装タスク一覧

### Phase 1: スキーマ・テーブル定義（バックエンド基盤）

#### Task 1.1: GraphQL Schemaの更新

**ファイル**: `cdk/graphql/schema.graphql`

**変更内容**:

```graphql
# UserConversation型にlastMessageIdとroleを拡張
type UserConversation {
  loginId: ID!
  conversationId: ID!
  joinedAt: AWSDateTime!
  lastMessageId: String          # 新規追加
  lastUpdatedAt: AWSDateTime     # 新規追加
  role: String!                  # 'creator' | 'participant' | 'inactive'
}

# 新規Mutation
type Mutation {
  ...
  joinConversation(input: JoinConversationInput!): Conversation
  leaveConversation(conversationId: ID!): Boolean
  updateLastMessageId(conversationId: ID!, messageId: ID!): UserConversation
  ...
}

# 入力型
input JoinConversationInput {
  conversationId: ID!
  userId: String!
}
```

**確認事項**:

- [ ] `role`フィールドの型を必須（String!）に変更
- [ ] サブスクリプション時の`onMessageCreated`は既存のまま

---

#### Task 1.2: DynamoDBテーブルスキーマ確認・拡張

**ファイル**: `cdk/lib/stacks/database_stack.py`

**確認項目**:

- [ ] UserConversationsTableに`lastMessageId`属性を許可（DynamoDB必須属性化不要）
- [ ] TTL設定不要（role='inactive'は永続化）
- [ ] GSI"byConversation"の確認（conversationId検索で参加者取得）

**実装内容**:

```python
# database_stack.py のUserConversationsTable定義は既存のままで問題なし
# 新規属性（lastMessageId, lastUpdatedAt）は動的に追加可能
```

---

### Phase 2: バックエンド Lambda実装

#### Task 2.1: Conversation Lambda - joinConversationハンドラ追加

**ファイル**: `backend/functions/conversation/index.py`

**処理フロー**:

```python
def handle_join_conversation(args: dict) -> dict[str, Any]:
    # 1. ユーザーが既に参加しているか確認
    # 2. 参加していない場合 → role: 'participant'でレコード作成
    # 3. role='inactive'の場合 → role: 'participant'に更新
    # 4. conversation情報を返す

    login_id = args.get("userId")  # フロント側から送信
    conversation_id = args.get("conversationId")

    user_conversations_table = get_dynamodb_table(config.user_conversations_table)
    now = utc_now_iso()

    # 既存レコード確認
    response = user_conversations_table.get_item(
        Key={"loginId": login_id, "conversationId": conversation_id}
    )
    existing = response.get("Item")

    if existing:
        # 既存の場合はroleをチェック
        if existing.get("role") == "inactive":
            # 再参加: role を 'participant' に更新
            user_conversations_table.update_item(
                Key={"loginId": login_id, "conversationId": conversation_id},
                UpdateExpression="SET #role = :role, joinedAt = :now",
                ExpressionAttributeNames={"#role": "role"},
                ExpressionAttributeValues={":role": "participant", ":now": now}
            )
        # 既にactiveなら何もしない
    else:
        # 新規参加
        user_conversations_table.put_item(
            Item={
                "loginId": login_id,
                "conversationId": conversation_id,
                "joinedAt": now,
                "role": "participant",
                # lastMessageId は明示的には設定しない（初参加は全メッセージから）
            }
        )

    # Conversation情報を返す
    return handle_get_conversation({"conversationId": conversation_id})
```

**テストケース**:

- [ ] 新規参加ユーザー → role='participant'でレコード作成
- [ ] inactive状態から再参加 → role='participant'に更新
- [ ] 既にactive状態 → エラーなく実行（べき等性）

---

#### Task 2.2: Conversation Lambda - leaveConversationハンドラ追加

**ファイル**: `backend/functions/conversation/index.py`

**処理フロー**:

```python
def handle_leave_conversation(args: dict) -> dict[str, Any]:
    # 1. ユーザーのroleをチェック
    # 2. role='creator'の場合はエラー（作成者は退出不可or別途処理）
    # 3. role を 'inactive' に更新（削除ではなく更新）

    login_id = args.get("userId")
    conversation_id = args.get("conversationId")

    user_conversations_table = get_dynamodb_table(config.user_conversations_table)

    # 既存レコード確認
    response = user_conversations_table.get_item(
        Key={"loginId": login_id, "conversationId": conversation_id}
    )
    existing = response.get("Item")

    if not existing:
        return build_response(False, error="Not a participant")

    if existing.get("role") == "creator":
        return build_response(False, error="Creator cannot leave conversation")

    # role を 'inactive' に更新
    user_conversations_table.update_item(
        Key={"loginId": login_id, "conversationId": conversation_id},
        UpdateExpression="SET #role = :role",
        ExpressionAttributeNames={"#role": "role"},
        ExpressionAttributeValues={":role": "inactive"}
    )

    return build_response(True, data={"conversationId": conversation_id})
```

**テストケース**:

- [ ] participant退出 → role='inactive'に更新
- [ ] creator退出試行 → エラー返却
- [ ] 非参加者が退出試行 → エラー返却

---

#### Task 2.3: Chat Lambda - sendMessageハンドラ改修（変更なし）

**ファイル**: `backend/functions/chat/index.py`

**確認事項**:

- [ ] 送信者の参加確認（既存のアクセス制御）
- [ ] メッセージ保存時に新messageIDが生成される
- [ ] **フロント側で**UpdateLastMessageIdを呼び出すため、Lambda側の変更不要

---

#### Task 2.4: Conversation Lambda - updateLastMessageIdハンドラ追加

**ファイル**: `backend/functions/conversation/index.py`

**処理フロー**:

```python
def handle_update_last_message_id(args: dict) -> dict[str, Any]:
    # 1. ユーザーが参加者か確認（role != 'inactive'）
    # 2. UserConversation レコドの lastMessageId を更新
    # 3. 更新後のレコードを返す

    login_id = args.get("userId")
    conversation_id = args.get("conversationId")
    message_id = args.get("messageId")

    user_conversations_table = get_dynamodb_table(config.user_conversations_table)

    # 参加確認
    response = user_conversations_table.get_item(
        Key={"loginId": login_id, "conversationId": conversation_id}
    )
    existing = response.get("Item")

    if not existing or existing.get("role") == "inactive":
        return build_response(False, error="Not a participant")

    # lastMessageId を更新
    now = utc_now_iso()
    user_conversations_table.update_item(
        Key={"loginId": login_id, "conversationId": conversation_id},
        UpdateExpression="SET lastMessageId = :msgId, lastUpdatedAt = :now",
        ExpressionAttributeValues={":msgId": message_id, ":now": now}
    )

    # 更新後のレコードを返す
    response = user_conversations_table.get_item(
        Key={"loginId": login_id, "conversationId": conversation_id}
    )
    return response.get("Item", {})
```

**テストケース**:

- [ ] active参加者 → lastMessageId更新成功
- [ ] inactive参加者 → エラー返却
- [ ] 非参加者 → エラー返却

---

#### Task 2.5: Conversation Lambda - listConversationsのアクセス制御強化

**ファイル**: `backend/functions/conversation/index.py`

**変更内容**:

```python
def handle_list_conversations(args: dict) -> list[dict]:
    """List conversations where user is ACTIVE participant."""
    login_id = args.get("loginId")

    user_conversations_table = get_dynamodb_table(config.user_conversations_table)
    response = user_conversations_table.query(
        KeyConditionExpression="loginId = :lid",
        ExpressionAttributeValues={":lid": login_id},
        # フィルター: role != 'inactive'のみ取得
        FilterExpression="#role <> :inactive",
        ExpressionAttributeNames={"#role": "role"},
        ExpressionAttributeValues={":lid": login_id, ":inactive": "inactive"}
    )
    # ... 以降処理は既存と同じ
```

**テストケース**:

- [ ] activeな会話 → リスト表示
- [ ] inactiveな会話 → 非表示
- [ ] 参加していない会話 → 非表示

---

#### Task 2.6: Chat Lambda - listMessagesのアクセス制御追加

**ファイル**: `backend/functions/chat/index.py`

**追加処理**:

```python
def handle_list_messages(args: dict) -> list[dict]:
    """List messages with access control."""
    conversation_id = args.get("conversationId")
    user_id = args.get("userId")  # 認証ユーザーのID取得必要

    # アクセス制御チェック
    user_conversations_table = get_dynamodb_table(config.user_conversations_table)
    response = user_conversations_table.get_item(
        Key={"loginId": user_id, "conversationId": conversation_id}
    )

    user_conv = response.get("Item")
    if not user_conv or user_conv.get("role") == "inactive":
        return build_response(False, error="Access denied")

    # lastMessageId が存在する場合、それ以降のメッセージのみ取得
    last_message_id = user_conv.get("lastMessageId")

    messages_table = get_dynamodb_table(config.messages_table)
    query_params = {
        "KeyConditionExpression": "conversationId = :cid",
        "ExpressionAttributeValues": {":cid": conversation_id}
    }

    # lastMessageId が存在する場合は、それ以降のメッセージを取得
    if last_message_id:
        # messageId の大小比較（タイムスタンプベース or ID順序に依存）
        # 実装方法はメッセージID生成ロジックに依存
        query_params["FilterExpression"] = "messageId > :lastMsgId"
        query_params["ExpressionAttributeValues"][":lastMsgId"] = last_message_id

    response = messages_table.query(**query_params)
    return response.get("Items", [])
```

**テストケース**:

- [ ] 参加者がlastMessageId付きで照会 → lastMessageId以降のメッセージのみ返却
- [ ] 非参加者が照会 → エラー返却

---

### Phase 3: AppSync Resolver & GraphQL設定

#### Task 3.1: AppSync Mutationレゾルバ追加

**ファイル**: `cdk/lib/stacks/appsync_stack.py`

**追加内容**:

```python
# Mutation resolver を追加
conversation_ds.create_resolver(
    "LeaveConversationResolver",
    type_name="Mutation",
    field_name="leaveConversation",
)

conversation_ds.create_resolver(
    "JoinConversationResolver",
    type_name="Mutation",
    field_name="joinConversation",
)

conversation_ds.create_resolver(
    "UpdateLastMessageIdResolver",
    type_name="Mutation",
    field_name="updateLastMessageId",
)
```

---

### Phase 4: フロントエンド実装

#### Task 4.1: GraphQL操作の定義

**ファイル**: `frontend/src/graphql/mutations.ts` (新規作成or既存ファイル確認)

**追加内容**:

```typescript
export const JOIN_CONVERSATION = gql`
  mutation JoinConversation($input: JoinConversationInput!) {
    joinConversation(input: $input) {
      conversationId
      createdBy
      title
      createdAt
    }
  }
`;

export const LEAVE_CONVERSATION = gql`
  mutation LeaveConversation($conversationId: ID!) {
    leaveConversation(conversationId: $conversationId)
  }
`;

export const UPDATE_LAST_MESSAGE_ID = gql`
  mutation UpdateLastMessageId($conversationId: ID!, $messageId: ID!) {
    updateLastMessageId(
      conversationId: $conversationId
      messageId: $messageId
    ) {
      lastMessageId
      lastUpdatedAt
    }
  }
`;
```

---

#### Task 4.2: 会話開く時のロジック改修

**ファイル**: `frontend/src/components/ConversationSelect.tsx` (または該当コンポーネント)

**変更内容**:

1. 会話を開く時に自動的に`joinConversation`を呼び出す（既に参加していた場合はスキップ）
2. `lastMessageId`を取得し、その位置からスクロール開始

```typescript
// 会話を開く時
useEffect(() => {
  if (selectedConversationId) {
    // joinConversation 呼び出し
    joinConversation({
      variables: {
        input: {
          conversationId: selectedConversationId,
          userId: currentUser.id,
        },
      },
    });

    // Subscription 開始
    subscribeToMessages(selectedConversationId);
  }
}, [selectedConversationId]);
```

---

#### Task 4.3: メッセージ受信時の自動更新ロジック

**ファイル**: `frontend/src/hooks/useConversation.ts` (または メッセージSubscription処理)

**重要**: **Subscription受信時に自動的に`updateLastMessageId`を呼び出す**

```typescript
useEffect(() => {
  // メッセージ受信Subscription
  const subscription = subscribeToMessages(
    onMessageCreated((data) => {
      const newMessage = data.onMessageCreated;

      // ★ ここで自動的に lastMessageId を更新 ★
      updateLastMessageId({
        variables: {
          conversationId: newMessage.conversationId,
          messageId: newMessage.messageId,
        },
      });

      // UIの更新
      setMessages((prev) => [...prev, newMessage]);
    }),
  );

  return () => subscription.unsubscribe();
}, [conversationId]);
```

---

#### Task 4.4: 会話を閉じる時のロジック

**ファイル**: `frontend/src/components/ConversationSelect.tsx`

**変更内容**:

```typescript
// 会話を閉じる時（アンマウント or 別の会話を選択）
useEffect(() => {
  return () => {
    if (selectedConversationId && showLeaveOptionOnClose) {
      leaveConversation({
        variables: { conversationId: selectedConversationId },
      });
    }
  };
}, [selectedConversationId]);
```

**注意**: `leaveConversation`を呼び出すかどうかはUX設計に依存

- 「会話セッションから退出させたい時」のみ呼び出し
- または設定で制御

---

### Phase 5: テスト実装

#### Task 5.1: バックエンド単体テスト

**ファイル**: `backend/tests/test_conversation.py`

**追加テストケース**:

- `test_join_conversation_new_participant`
- `test_join_conversation_already_participant`
- `test_join_conversation_inactive_reactivate`
- `test_leave_conversation_participant`
- `test_leave_conversation_creator_fails`
- `test_update_last_message_id_success`
- `test_update_last_message_id_inactive_fails`
- `test_list_conversations_filters_inactive`

---

#### Task 5.2: フロントエンド統合テスト

**ファイル**: `frontend/e2e/conversation-access-control.spec.ts` (新規)

**テストシナリオ**:

1. ユーザーA: 会話作成（自動参加）
2. ユーザーB: リンク経由で会話に参加
3. ユーザーB: メッセージ受信時に自動的にlastMessageIDが更新される
4. ユーザーB: 会話を閉じて再度開く → lastMessageIDの位置から表示開始
5. ユーザーB: 退出 → ConversationSelectで非表示
6. ユーザーB: 再度リンク経由で参加 → 復活

---

## 📊 実装優先順序

| 優先度 | Task | 説明 |

|----------|---------|------|
| **P1** | 1.1 GraphQL Schema更新 | 基盤定義 |
| **P1** | 2.1 joinConversation | コア機能 |
| **P1** | 2.4 updateLastMessageId | コア機能 |
| **P1** | 3.1 AppSync Resolver追加 | GraphQL接続 |
| **P2** | 2.2 leaveConversation | ユーザー操作 |
| **P2** | 2.5 listConversations制御 | アクセス制御 |
| **P2** | 2.6 listMessages制御 | アクセス制御 |
| **P3** | 4.1〜4.4 フロントエンド実装 | UI統合 |
| **P3** | 5.1〜5.2 テスト実装 | 品質保証 |

---

## ✅ 完了条件

- [ ] GraphQL Schemaが更新され、デプロイ可能
- [ ] 全バックエンドハンドラが実装・テスト済み
- [ ] AppSync Mutationが動作確認済み
- [ ] フロントエンドでjoinConversation/updateLastMessageId/leaveConversationが統合実装
- [ ] E2Eテストで全シナリオが通過
- [ ] README.mdが更新されている

---

## 🔄 その他検討項目

### 後続タスク

- [ ] リアルタイム参加者一覧表示（WSで同期）
- [ ] 参加者情報の詳細ビュー
- [ ] メッセージ削除時のlastMessageID自動調整
- [ ] 一括ユーザーアクセス設定（管理者画面）

### セキュリティ確認

- [ ] AppSyncの認証・認可ルール確認
- [ ] DynamoDB読み取り/書き込み権限確認
- [ ] リンク経由の参加ロジックのセキュリティレビュー

---

## 📚 関連ドキュメント

- システム要件: `documents/要件定義.md`
- デプロイガイド: `docs/deploy-guide.md`
- AWSシステム構成: `documents/AWSシステム構成.md`
