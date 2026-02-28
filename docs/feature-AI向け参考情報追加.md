# 機能設計書：AI 向けシステムプロンプト機能

**作成日:** 2026-02-18  
**ステータス:** ✅ 要件確定・設計完了

---

## 📌 概要

各会話に **システムプロンプト** を設定し、AI の回答品質・一貫性を向上させる機能。  
システムプロンプトには、チーム方針・過去の決定事項・重要なガイドラインなどを記載。

### 機能のゴール

- **統一した思考フレーム：** 会話ごとに AI の回答スタイル・ルール・背景を明確にできる
- **過去の資産の再利用：** 自分が参加している他の会話から設定を流用できる
- **コンテキスト充実：** 現在の会話要約 ＋ カスタマイズされたシステムプロンプトで高精度な AI 支援を実現

---

## 🎯 仕様

### システムプロンプト（1会話 = 1設定）

**定義：** 会話内のすべての AI 支援アクション（要約・意見・回答・次のアクション提案）で使用される共通の背景情報・指示

**記載例：**

```
【対象】
- 目的：SaaS (B2B) 新規営業の課題分析
- チーム方針：顧客主導型、AI は分析のみ担当

【過去の重要決定】
- 2025年Q2：主力商品を Enterprise プラン中心に切り替え
- ターゲット業界：金融・保険

【チームルール】
- 意見は根拠をつける（推測で話さない）
- 回答スタイル：日本語、カジュアルすぎない
- 営業チームの主体性を尊重（AI は提案補助のみ）
```

**フィールド仕様：**

- **長さ：** 最大 2000 字（AI プロンプトに埋め込みされるため）
- **更新：** 会話メンバーなら誰でも可能
- **デフォルト：** 空でも可（設定しない場合は AI がデフォルト動作）

**AI プロンプトへの埋め込み例：**

```python
prompt = ANSWER_PROMPT.format(
    system_prompt=conversation.get('systemPrompt', ''),
    current_summary=current_summary,
    user_input=user_input
)
```

プロンプト内での位置：

```
あなたはグループチャットのAIアシスタントです。

【システム情報・ガイドライン】
{system_prompt}

【現在の会話要約】
{current_summary}

【ユーザーの質問】
{user_input}
```

---

## 📊 データモデル変更

### DynamoDB: Conversation テーブル

**追加フィールド：**

| フィールド              | 型               | 説明                             | 例                      | 必須 |
| ----------------------- | ---------------- | -------------------------------- | ----------------------- | ---- |
| `systemPrompt`          | String           | システムプロンプト（最大2000字） | "あなたは営業チーム..." | No   |
| `systemPromptUpdatedAt` | String (ISO8601) | 最後更新時刻                     | "2026-02-18T10:30:00Z"  | No   |
| `systemPromptUpdatedBy` | String (userId)  | 最後更新者                       | "user123"               | No   |

**マイグレーション戦略：**

- 既存会話：`systemPrompt = null` で初期化
- 新規作成時：オプション（空でも可）
- 既存会話でも後から設定可能

---

## 🔄 ユースケース・フロー

### UC-1: 会話内でシステムプロンプトを設定（新規追加メインフロー）

**配置：** ナレッジベース左に「⚙️ システムプロンプト」ボタン

```
1. ユーザーが会話内で「⚙️ システムプロンプト」ボタンをクリック

2. モーダル表示：「システムプロンプト設定」
   ┌─────────────────────────────────────────────────┐
   │ ⚙️ システムプロンプト設定                        │
   ├─────────────────────────────────────────────────┤
   │                                                 │
   │ 📝 ガイド説明文：                               │
   │ このプロンプトは、会話内のすべての AI 支援      │
   │ アクション（要約・意見・回答など）で使用され   │
   │ ます。以下の内容を記載するといいでしょう：     │
   │ - チームの方針やルール                           │
   │ - 過去の重要な決定事項                           │
   │ - 対象プロジェクト・市場の背景                   │
   │ - AI に求めるスタイル（格調高い/カジュアル等）│
   │                                                 │
   │ 【テンプレート選択】                            │
   │ ┌──────────────────────────────────────┐        │
   │ │ ✓ 営業戦略会議 - 2026-02-10         │ ← ドロップダウン
   │ │ Project A キックオフ - 2026-02-08   │   自分が参加している
   │ │ ...                                  │   会話タイトルが並ぶ
   │ └──────────────────────────────────────┘        │
   │                                                 │
   │ 【入力フィールド】                              │
   │ ┌──────────────────────────────────────┐        │
   │ │ 　　　　　　　　　　　　　　　　　　　　│        │
   │ │ 　　　　　              (0/2000字)    │        │
   │ │                                      │        │
   │ │ 【重要ルール】                       │        │
   │ │ - 意見は根拠をつける                  │        │
   │ │ - 営業の主体性を尊重                  │        │
   │ │                                      │        │
   │ │                                      │        │
   │ └──────────────────────────────────────┘        │
   │                                                 │
   │   [キャンセル]  [保存]                         │
   └─────────────────────────────────────────────────┘

3. ユーザーがテンプレート選択 or 手動入力
   - テンプレート選択時：その会話の systemPrompt をテキストに自動入力
   - 手動入力：フリーテキストで記載

4. 「保存」クリック
   → GraphQL: updateConversationSystemPrompt 実行
   → systemPrompt, systemPromptUpdatedAt, systemPromptUpdatedBy 保存

5. モーダル閉じる、画面に「最後更新：user123 @2026-02-18 10:30」表示
```

### UC-2: AI アクション実行時にシステムプロンプトを適用

**フロー：**

```python
# Step 1: Conversation から systemPrompt を取得
conversation = fetch_conversation(conversation_id)
system_prompt = conversation.get('systemPrompt', '')

# Step 2: プロンプトテンプレートに埋め込み
prompt = ANSWER_PROMPT.format(
    system_prompt=system_prompt,
    current_summary=current_summary,
    user_input=user_input
)

# Step 3: Bedrock に送信 → AI が システムプロンプトを考慮して回答
```

**4 つの AI アクション全て で共通適用：**

- summarize（選択メッセージの要約）
- opinion（選択メッセージへの意見）
- answer（質問への回答）
- next_action（次のアクション提案）

---

## 📝 GraphQL スキーマ変更案

```graphql
# Type 定義拡張
type Conversation {
  conversationId: ID!
  createdBy: String!
  createdAt: AWSDateTime!
  participants: [String!]!
  status: String!
  shareLink: String
  title: String

  # 【新規追加】
  systemPrompt: String # AI向けシステムプロンプト（最大2000字）
  systemPromptUpdatedAt: AWSDateTime # 最後更新時刻
  systemPromptUpdatedBy: String # 最後更新者
}

# Mutation 追加
type Mutation {
  # ...既存の Mutation
  updateConversationSystemPrompt(
    input: UpdateConversationSystemPromptInput!
  ): Conversation!
}

input UpdateConversationSystemPromptInput {
  conversationId: ID!
  systemPrompt: String # 最大2000字
}

# Query 追加（自分が参加している会話一覧 - テンプレート選択用）
type Query {
  # ...既存
  getConversationsForSystemPromptTemplate(
    loginId: ID!
  ): [ConversationTemplateOption!]!
}

type ConversationTemplateOption {
  conversationId: ID!
  conversationTitle: String!
  systemPrompt: String! # 空の場合は表示しない
}
```

---

## 🏗️ 実装タスク分解

### **フェーズ 1：バックエンド基盤（優先度：高）**

- [ ] DynamoDB スキーママイグレーション
  - Conversation テーブルに `systemPrompt`, `systemPromptUpdatedAt`, `systemPromptUpdatedBy` 追加
  - バックアップ → 段階的デプロイ
- [ ] GraphQL スキーマ更新
  - `Conversation` type に 3 フィールド追加
  - `updateConversationSystemPrompt` Mutation 追加
  - `getConversationsForSystemPromptTemplate` Query 追加
- [ ] conversation Lambda 関数修正
  - 新 `handle_update_conversation_system_prompt` 実装
  - `handle_get_conversation` で新フィールド取得対応
  - `getConversationsForSystemPromptTemplate` 実装（自分が参加している会話から systemPrompt != null なものを取得、タイトルでソート）
- [ ] ai_support Lambda 関数修正
  - `_build_prompt` にシステムプロンプト埋め込みロジック追加
  - 全 4 アクション（summarize, opinion, answer, next_action）で適用
  - モックレスポンスにシステムプロンプト情報追加

### **フェーズ 2：フロントエンド UI（優先度：高）**

**2-1. ナレッジベース左に「⚙️ システムプロンプト」ボタン追加**

- [ ] knowledgebase.tsx コンポーネント修正
  - ナレッジベース（ファイルリスト）の左に新ボタン「⚙️ システムプロンプト」を追加
  - ボタンクリック → モーダル表示

**2-2. システムプロンプト設定モーダル実装**

- [ ] `SystemPromptModal` コンポーネント作成
  - **ガイド説明文：** ユーザーが何を記載すべきか分かるように

    ```
    このプロンプトは、会話内のすべての AI 支援アクション
    （要約・意見・回答など）で使用されます。

    以下の内容を記載するといいでしょう：
    • チームの方針やルール
    • 過去の重要な決定事項
    ```

  - **テンプレート選択ドロップダウン**
    - Query: `getConversationsForSystemPromptTemplate` を呼び出し
    - 自分が参加している会話で systemPrompt がある会話をフィルタ
    - 会話タイトルでソート、リスト表示
    - 選択時 → その会話の systemPrompt をテキストエリアに自動入力
  - **入力フィールド**
    - textarea、最大 2000 字、リアルタイム字数表示
    - プレースホルダーに記載例を表示
  - **更新日時表示**
    - 「最後更新：user123 @2026-02-18 10:30」
  - **ボタン**
    - キャンセル、保存

**2-3. 更新完了後の処理**

- [ ] 保存実行 → `updateConversationSystemPrompt` Mutation
  - systemPromptUpdatedAt, systemPromptUpdatedBy は自動設定（バックエンド側で userId 取得）
- [ ] キャッシュ無効化（Apollo インスタンスにキャッシュ削除通知）
- [ ] モーダル内に「保存完了」トースト表示
- [ ] モーダル閉じる

### **フェーズ 3：テスト & ドキュメント（優先度：中）**

- [ ] ユニットテスト
  - バックエンド：プロンプト埋め込みロジック
  - フロントエンド：フォーム検証、2000 字制限
- [ ] 統合テスト
  - 会話内でプロンプト設定 → AI アクション実行 → プロンプト適用確認
- [ ] E2E テスト（Playwright）
  - シナリオ：モーダル開く → テンプレート選択 → 保存 → AI に質問 → 回答確認
- [ ] ドキュメント更新
  - README.md：新機能説明
  - セットアップガイド：DynamoDB マイグレーション手順

---

## ✅ 要件確定事項

| 項目                     | 決定内容                                           |
| ------------------------ | -------------------------------------------------- |
| **Q1: 編集権限**         | 会話メンバー全員が編集可能                         |
| **Q2: サイズ上限**       | 2000 字（`systemPrompt` フィールド 1 つで管理）    |
| **Q3: テンプレート選択** | ドロップダウン：自分が参加している会話から選択可能 |
| **Q4: デフォルト**       | なし（空でも OK）                                  |
| **UI 配置**              | ナレッジベース左に「⚙️ システムプロンプト」ボタン  |
| **説明文**               | モーダル内に「何を記載すべきか」ガイド付き         |

---

## 📚 参考：プロンプト埋め込みの変化

**before（現在）**

```python
ANSWER_PROMPT = """あなたはグループチャットのAIアシスタントです。

ユーザーの質問:
{user_input}

現在の会話要約:
{current_summary}

この質問に対する回答をしてください。
会話の文脈を考慮した的確な回答を心がけてください。
"""
```

**after（実装後）**

```python
ANSWER_PROMPT = """あなたはグループチャットのAIアシスタントです。

【システム情報・ガイドライン】
{system_prompt}

【現在の会話要約】
{current_summary}

【ユーザーの質問】
{user_input}

この質問に対する回答をしてください。
会話の文脈を考慮した的確な回答を心がけてください。
"""

# 各プロンプトテンプレートに対応
with format(system_prompt=..., current_summary=..., user_input=...)
```

**効果：**

- システムプロンプトで AI の「思考の枠組み」を統一
- 同じ会話内で複数アクション実行時、一貫性が向上
- テンプレート再利用で 設定工数削減

---

## 📅 推奨実装スケジュール

| フェーズ                         | タスク数 | 推定工数（人日） | 実装順序 |
| -------------------------------- | -------- | ---------------- | -------- |
| 1（バックエンド基盤：DB+API）    | 5        | 2-3              | 1st      |
| 2（フロントエンド UI：モーダル） | 4        | 2-3              | 2nd      |
| 3（テスト & ドキュメント）       | 5        | 2-3              | 3rd      |
| **合計**                         | **14**   | **6-9**          |          |

---

## 📝 設計完了・実装準備完了

- **設計者：** AI Agent (Architect)
- **確認者：** ユーザー ✅
- **ステータス：** 🟢 要件確定・設計完了

### 実装前チェックリスト

- [ ] 各実装エージェント（backend, frontend）にタスク分解を依頼
- [ ] DynamoDB スキーマ変更の慎重性確認（バックアップ戦略）
- [ ] GraphQL スキーマ変更による既存クライアント への影響確認
- [ ] テスト計画を事前レビュー（E2E でシステムプロンプト埋め込みを検証）
- [ ] デプロイ順序決定：バックエンド → GraphQL → フロントエンド

### ドキュメント

この設計書に基づいて実装エージェントが以下を作成予定：

- **backend エージェント：** DynamoDB マイグレーション、Lambda 関数実装
- **frontend エージェント：** UI コンポーネント実装、ModalSystemPrompt の検証テスト
