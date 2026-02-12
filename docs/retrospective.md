# プロジェクト振り返り（Retrospective）

---

## 📅 **2026年2月13日 — バックエンド Lambda ユニットテスト追加**

### ✅ **完了した内容**

#### **1. ユニットテスト作成（89テスト全合格）**

- `test_user_management.py` — registerUser / getUser / listUsers の正常系・異常系・境界値（10テスト）
- `test_chat.py` — sendMessage / listMessages の正常系・異常系（12テスト）
- `test_summarizer.py` — getSummary / updateSummary / undoSummary / saveSummaryEdit + Bedrock モック（15テスト）
- `test_ai_support.py` — askAIHelper の 4種アクション + Bedrock モック（11テスト）
- `test_lock_manager.py` — acquireLock / releaseLock / getLocks + TTL 検証（16テスト）
- `test_conversation.py` — createConversation / getConversation / listConversations / joinConversation（16テスト）
- `conftest.py` — DynamoDB テーブル moto モック（5テーブル）+ 環境変数設定

#### **2. テスト基盤**

- pytest + moto (mock_aws) + unittest.mock による完全モック化
- 各テストで Lambda モジュールを reload して env vars の影響を分離
- Bedrock API 呼び出しは `USE_MOCK_AI=true` のモック応答 + `patch` による Bedrock クライアントモック

### **問題と対応**

| 問題 | 原因 | 対応 |
| ---- | ---- | ---- |
| lock_manager の TTL 比較が moto 環境で常に失敗 | DynamoDB が数値を `Decimal` 型で返すが、`isinstance(val, (int, float))` で判定していた | `Decimal` を判定対象に追加し `int()` でキャストしてから比較するよう修正 |

### **再発防止策**

- DynamoDB から取得した数値は `Decimal` 型であることを前提に、`int()` への変換を行う
- ユニットテストを moto で実行し、DynamoDB の型変換の問題を早期検出する

---

## 📅 **2026年2月13日 — フェーズ 2・3 バックエンド＆フロントエンド基盤実装**

### ✅ **完了した内容**

#### **1. AWS CDK インフラストラクチャ**

- CDK エントリーポイント (`cdk/app.py`) — 環境パラメータ対応（dev / prod）
- `DatabaseStack` — DynamoDB 5テーブル定義（Users / Messages / Summary / Locks / Conversations）
  - Messages Table に `byTimestamp` GSI 追加
  - Locks Table に TTL 有効化（3分自動削除）
- `LambdaStack` — Lambda 6関数定義 + IAM ロール + Bedrock アクセス
- `AppSyncStack` — GraphQL API + Lambda データソース・リゾルバー接続

#### **2. GraphQL スキーマ**

- 完全な型定義（User / Message / Summary / Lock / Conversation / Notification）
- Query 7種、Mutation 10種、Subscription 3種
- Input / Response 型の標準化

#### **3. Lambda 関数実装（Python 3.12）**

- `user_management` — ユーザー一覧・取得・登録（重複チェック付き）
- `chat` — メッセージ一覧・投稿（displayName 解決、AIHelper 対応）
- `summarizer` — 要約生成・Undo・手動編集保存（Bedrock 連携 + dev モック）
- `ai_support` — 4種のAI相談アクション（summarize / opinion / answer / next_action）
- `lock_manager` — ロック取得・解放・一覧（TTL / 排他制御）
- `conversation` — 会話作成・参加・一覧取得

#### **4. フロントエンド基盤（Next.js 15 / React 19）**

- プロジェクト構成（TypeScript / Tailwind CSS / App Router）
- Serendie Design System インスパイアのカスタムスタイル
- コンポーネント実装:
  - `LoginScreen` — ユーザー選択 / 新規登録
  - `ConversationSelect` — 会話一覧 / 新規作成
  - `ChatScreen` — 2ペインレイアウト（チャット＋サイドバー）
  - `ChatBubble` — 選択ハイライト / 要約使用済みインジケーター
  - `MessageInput` — 自動リサイズ textarea
  - `SummarySidebar` — 編集 / Undo / ロック表示（glassmorphism）
  - `AIHelperButtons` — 4つのAI相談ボタン
  - `NotificationBanner` — 処理状態通知
- GraphQL 操作定義（queries / mutations / subscriptions）
- 型定義・定数管理

### **問題と対応**

| 問題 | 原因 | 対応                             |
| ---- | ---- | -------------------------------- |
| なし | —    | フェーズ2・3は設計通りに実装完了 |

### **再発防止策**

- CDK スタック間の依存関係を明示的に `add_dependency()` で管理
- Lambda 関数は `common/` モジュールで設定・ユーティリティを共有し、コード重複を排除
- フロントエンドは TODO コメントで AppSync 接続ポイントを明示

---

## ✅ **本フェーズで完了した内容**

### **1. 要件定義ドキュメント作成**

**成果物:** [documents/要件定義.md](../documents/要件定義.md)

#### **主要な決定事項**

- **ユーザー認証:** 不要（シンプルラジオボタン / 新規登録のみ）
- **AIHelper:** ID「AIHELPER」固定、DB 登録不要
- **会話管理:** UUID ベース、複数会話対応、リンク共有機能
- **DynamoDBスキーマ:** パターンB（Current + Previous）で統一
- **最大文字数:** 要約は最大 5000 文字
- **メッセージ表示順序:** 時系列（古い→新い）で固定、自動スクロール追従
- **エラーハンドリング:** AIHelper 名義でチャットにエラーメッセージを投稿

### **2. AWS システム構成ドキュメント作成**

**成果物:** [documents/AWSシステム構成.md](../documents/AWSシステム構成.md)

#### **主要な決定事項**

- **Bedrock設定:** オレゴンリージョン、Claude Haiku 4.5 推論プロファイルモデル
- **DynamoDBテーブル:**
  - Messages Table（conversationId + messageId）
  - Summary Table（title + current + previous）
  - Locks Table（ロック管理、3分 TTL）
  - Users Table（ユーザー管理）
  - Conversations Table（オプション：会話メタデータ）
- **ワークフロー詳細:** 要約更新、ロック制御、ユーザー登録、AIHelper相談、AI要約の各フローを記述
- **操作ロックルール:** 要約実行中＆AIHelper処理中の詳細なロック仕様

### **3. Git ワークフロー確立**

**成果物:**

- ✅ Git リポジトリ初期化
- ✅ Git Flow ブランチ構造構築（main / develop / feature/\*）
- ✅ Conventional Commits で初期コミット実行
- ✅ 全プロジェクト構造をコミット（.github、documents、.vscode など）

#### **初期コミット**

```
Commit: d3ec76a
Message: docs: add requirement definition and AWS system architecture
Files: 27 files, 2378 insertions

Branch Structure:
- main: d3ec76a
- develop: d3ec76a
- feature/requirement-definition: d3ec76a
```

### **4. その他 ドキュメント**

- ✅ README.md（プロジェクト概要、セットアップ手順）
- ✅ .github/copilot-instructions.md（AI 開発憲章）
- ✅ .github/skills/\* （開発スキルガイド全9個）

---

## 🎯 **不確定要素から確定した決定**

### **1. 認証・ユーザー管理**

- **決定:** 認証不要、シンプルなユーザー選択/新規登録のみ
- **理由:** MVP グレード、手軽な起動体験を優先
- **影響:** セキュリティ監査の必要性が低下、デプロイ速度向上

### **2. DynamoDB スキーマ**

- **決定:** パターンB（シンプル・Current + Previous）で全テーブル統一
- **理由:** Undo が 1 段階限定、複雑性不要、保守性向上
- **影響:** 監査ログなし（ただし将来拡張可能）

### **3. 選択状態の管理**

- **決定:** AppSync State（メモリ）で管理、DB 永続化不要
- **理由:** リアルタイム性優先、DBコスト削減
- **影響:** AppSync 再起動時に選択状態消失（許容範囲）

### **4. AI 処理の競合**

- **決定:** 要約＆AIHelper は別々に実行可能、ただし要約実行中は要約不可、AIHelper処理中は制限なし
- **理由:** ユーザー体験と実装の複雑性のバランス
- **影響:** キューイング不要で簡潔な実装に

### **5. Bedrock モデル**

- **決定:** Claude Haiku 4.5 推論プロファイルモデル（オレゴンリージョン）
- **理由:** コスト効率、十分な性能、推論プロファイルの利用可能性
- **影響:** クロスリージョン呼び出し（レイテンシ +50-100ms）

### **6. メッセージ編集・削除**

- **決定:** 現状では不提供（将来拡張の対象）
- **理由:** MVP グレード、複雑性軽減
- **影響:** ユーザーの完全な発言修正不可

### **7. 会話終了・アーカイブ**

- **決定:** 不提供（将来拡張の対象）
- **理由:** MVP グレード
- **影響:** 古い会話が永続的に残る

---

## 📊 **意思決定マトリクス**

| 項目              | 選択肢                                             | 採用         | 理由           |
| ----------------- | -------------------------------------------------- | ------------ | -------------- |
| DynamoDB スキーマ | Pattern A (Version管理) / **Pattern B (シンプル)** | B            | Undo 1段階限定 |
| 選択状態管理      | **AppSync State** / DynamoDB                       | AppSync      | リアルタイム性 |
| 認証方式          | Cognito / **シンプル登録**                         | シンプル登録 | MVP グレード   |
| Bedrock モデル    | **Claude Haiku 4.5** / Claude 3.5 Sonnet           | Haiku 4.5    | コスト最適化   |
| 競合処理          | **Optimistic Lock** / フロント側ロック             | フロント側   | 実装簡潔性     |
| Undo 段階数       | **1段階** / 複数段階                               | 1段階        | 実装シンプル化 |

---

## 🔍 **設計の妥当性チェック**

### ✅ **スケーラビリティ**

- DynamoDB：オンデマンド課金で自動スケール ✅
- AppSync：フルマネージド、自動スケール ✅
- Lambda：イベント駆動、自動スケール ✅
- Bedrock：の API 上限確認（次フェーズで詳細化）⚠️

### ✅ **セキュリティ**

- IAM ロール最小権限：CDK で実装予定 ✅
- DynamoDB TTL：3 分自動削除（ロック自動解放） ✅
- AppSync リゾルバー：入力検証実装予定 ✅
- 認証：現状なし（MVP グレード） ⚠️

### ✅ **保守性**

- コード構成：統一された規約（Conventional Commits） ✅
- ドキュメント：詳細な仕様書、ワークフロー ✅
- Git ワークフロー：Git Flow で標準化 ✅

### ⚠️ **今後の検討事項**

- Bedrock API のの Error Handling（タイムアウト、Rate Limit）
- キューイング戦略（複数 AIHelper 要望同時投入時）
- バックアップ / ディザスタリカバリー戦略
- キャッシング戦略（高頻度アクセスの要約取得）

---

## 🚀 **次フェーズの計画**

### **フェーズ 2：バックエンド実装**

#### **優先度 1（必須）**

1. [ ] AWS CDK スタック作成
   - DynamoDB テーブル（Messages, Summary, Locks, Users）
   - IAM ロール / ポリシー
2. [ ] Lambda 関数実装
   - User Registration Lambda（ユーザー重複チェック）
   - Summarizer Lambda（Bedrock 連携）
   - AI Support Lambda（AIHelper 相談機能）
3. [ ] AppSync スキーマ＆リゾルバー
   - クエリ（listUsers, getSummary）
   - ミューテーション（registerUser, updateSummary, postMessage）
   - サブスクリプション（メッセージ更新、ロック状態）

#### **優先度 2（推奨）**

4. [ ] ユニットテスト（Lambda）
5. [ ] 統合テスト（AppSync + Lambda）
6. [ ] CloudWatch ログ / モニタリング設定

#### **優先度 3（オプション）**

7. [ ] API Gateway（非同期処理用）
8. [ ] Lambda Layer（共通ライブラリ）
9. [ ] Secrets Manager（API キー管理）

---

## 📈 **メトリクス**

| メトリクス       | 値      | 備考                   |
| ---------------- | ------- | ---------------------- |
| ドキュメント工数 | ~4 時間 | 要件 + AWS 構成        |
| 決定項目数       | 25+     | 詳細な要件確定         |
| コミット数       | 1       | 初期セットアップ       |
| Git ブランチ数   | 3       | main, develop, feature |

---

## 💡 **学んだこと・改善案**

### **学んだこと**

1. **要件の曖昧さ解決の重要性**
   - 初期段階での詳細質問が後続実装を加速
   - Bedrock オレゴン、Claude Haiku 4.5、等の決定が早期に必要

2. **DynamoDB スキーマの選択**
   - シンプル設計（パターンB）の優位性
   - 将来の複雑化に備えつつ、MVP では軽量化

3. **Git ワークフローの重要性**
   - 初期段階での Git Flow 確立で、後続開発の効率化

### **改善案**

1. **Bedrock プロンプト設計**
   - 現フェーズで大まかなプロンプトテンプレート作成推奨
   - 次フェーズで詳細化・テスト

2. **リスク管理**
   - Bedrock API のレート制限（次フェーズで詳細化）
   - オレゴンリージョンのレイテンシ影響（監視推奨）

3. **テスト戦略**
   - 単体テスト（Lambda 関数ごと）
   - 統合テスト（AppSync + Lambda + DynamoDB）
   - E2E テスト（フロント含める）

---

## 🎓 **参考リソース**

- [AWS CDK Documentation](https://docs.aws.amazon.com/cdk/)
- [AppSync GraphQL API](https://docs.aws.amazon.com/appsync/)
- [Amazon Bedrock](https://docs.aws.amazon.com/bedrock/)
- [Conventional Commits](https://www.conventionalcommits.org/)
- [Git Flow](https://nvie.com/posts/a-successful-git-branching-model/)

---

## 📝 **チェックリスト：タスク完了確認**

- [x] 要件定義ドキュメント作成
- [x] AWS システム構成ドキュメント作成
- [x] 不確定要素の全て確定
- [x] Git ワークフロー確立
- [x] README.md 作成
- [x] docs/retrospective.md 作成
- [x] GitHub へのコミット実行

---

**ステータス:** ✅ **フェーズ 1 完了 / フェーズ 2・3 基盤完了**

**次のチェックイン:** AppSync クライアント接続 → テスト → 本番デプロイ

**作成者:** AI Development Agent  
**最終更新:** 2026年2月13日
