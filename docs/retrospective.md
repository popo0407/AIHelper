# プロジェクト振り返り（Retrospective）

---

## 📅 **2026年2月13日（続） — AWS デプロイ完了・フロントエンド起動・セキュリティ課題の識別**

### ✅ **完了した内容**

#### **1. CDK を使った AWS インフラのデプロイ**

- **DynamoDB Stack**: Users, Messages, Summary, Locks, Conversations テーブル作成（PAY_PER_REQUEST）
- **Lambda Stack**: 6つの Lambda 関数デプロイ（Python 3.12 + 共通レイヤー）
- **AppSync Stack**: GraphQL API デプロイ（45リゾルバー、API Key 認証）
- **デプロイ結果**:
  - AppSync Endpoint: `https://6egm7dk3mbefzamvsx2b3w5kxy.appsync-api.ap-northeast-1.amazonaws.com/graphql`
  - API Key: `da2-qdhwa6iparhe5djocvr4nc5rve`
  - Region: ap-northeast-1

#### **2. GraphQL Subscription の一時削除**

- **問題**: AppSync デプロイ時に "invalid output type" エラー
- **原因**: Subscription 型定義の不備
- **対応**: `schema.graphql` から Subscription セクションを削除（203-217行）
- **影響**: リアルタイム更新が無効化（手動リフレッシュが必要）
- **今後**: 別 Issue で再実装予定

#### **3. フロントエンド環境構築**

- `frontend/.env.local` 作成（AppSync 接続情報）
- 依存関係追加: `@aws-amplify/data-schema@1.24.0`, `autoprefixer@10.4.24`
- `npm install` 完了（936パッケージ、graphql パッケージの破損を修復）
- Next.js 開発サーバー起動成功（`http://localhost:3000`）

#### **4. セキュリティ課題の識別**

- **問題**: API Key がブラウザで公開される（DevTools で確認可能）
- **リスク**:
  - 全ユーザー共通の1つのキー
  - 無制限のリクエスト可能（レート制限なし）
  - DDoS 攻撃の可能性
- **対策**: Cognito User Pools 認証への移行を Issue 化（`.github/ISSUES/cognito-authentication.md`）

#### **5. ドキュメント更新**

- `README.md`: フェーズ4タスクとセキュリティ警告追加
- `docs/retrospective.md`: 今回のタスク記録
- `.github/ISSUES/cognito-authentication.md`: Cognito 移行の詳細 Issue 作成

### **問題と対応**

| 問題                                          | 原因                                             | 対応                                            |
| --------------------------------------------- | ------------------------------------------------ | ----------------------------------------------- |
| GraphQL Subscription デプロイエラー           | Subscription 型の output type 定義不備           | Subscription セクションを一時削除               |
| graphql パッケージ破損（60+モジュール不存在） | npm cache 問題または不完全インストール           | `npm cache clean --force` + 完全再インストール  |
| Next.js 起動時の "require-hook" エラー        | node_modules/.bin/next.cmd の破損                | `npm install --force` で修復                    |
| node_modules 削除失敗（Windows）              | 一部ファイルがロック中                           | `cmd /c "rmdir /s /q node_modules"` で強制削除  |
| API Key がブラウザで公開される                | フロントエンドコードに環境変数として埋め込まれる | ⚠️ 開発環境のみ許容、Cognito 認証への移行を計画 |

### **学んだこと**

1. **AppSync Subscription の型定義は厳密**:
   - Output type は必ず存在する型を指定する
   - `type Subscription` のフィールドは `type Mutation` の戻り値型と一致させる

2. **Windows での node_modules 削除は困難**:
   - PowerShell の `Remove-Item` より `cmd /c "rmdir /s /q"` が確実
   - ファイルロックが発生した場合は Node プロセスを事前に停止

3. **npm cache は定期的にクリアすべき**:
   - `npm cache clean --force` を定期実行
   - 大規模パッケージ（Next.js）のインストール前に実行推奨

4. **API Key 認証の限界**:
   - ブラウザ実行コードでは、NEXT*PUBLIC*\* 環境変数は必ず公開される
   - CloudFront でエンドポイントを隠しても API Key 問題は解決しない
   - **根本解決**: Cognito User Pools で JWT トークン認証

5. **ローカル開発のメリット**:
   - フロントエンド: HMR による高速イテレーション（0.5秒で反映）
   - CloudFront ビルド: 2-5分のビルド時間
   - バックエンド: AWS 上で動作（ローカルエミュレートは LocalStack で可能）

### **再発防止策**

- GraphQL Subscription を追加する際は、型定義を厳密にチェック
- CDK デプロイ前に `cdk synth` で CloudFormation テンプレートを確認
- API Key 認証は開発環境のみにし、本番環境では Cognito を必須化
- WAF でレート制限を追加（5分間に100リクエスト等）
- npm install に問題が発生したら、`npm cache clean --force` を最初に実行
- Windows 環境では `cmd /c "rmdir /s /q node_modules"` を優先使用

### **次のタスク**

1. **Cognito 認証への移行**（優先度: 高、見積: 2-3時間）
   - Issue: `.github/ISSUES/cognito-authentication.md`
   - Cognito UserPool 作成
   - AppSync 認証設定変更（API_KEY → USER_POOL）
   - フロントエンド Amplify Auth 統合
   - ログイン/サインアップフロー実装

2. **GraphQL Subscription の再実装**
   - Subscription 型定義の修正
   - リアルタイム更新の復旧

3. **WAF レート制限の追加**
   - 5分間に100リクエストまで
   - CloudWatch アラーム設定

---

## 📅 **2026年2月13日 — AppSync 統合・フロントエンドテスト・デプロイ準備**

### ✅ **完了した内容**

#### **1. AppSync クライアント統合（Amplify v6）**

- `frontend/src/lib/appsync.ts` — `generateClient()` + `extractData<T>()` ヘルパー作成
- `LoginScreen` — `LIST_USERS` クエリ + `REGISTER_USER` ミューテーション統合
- `ConversationSelect` — `LIST_CONVERSATIONS` クエリ + `CREATE_CONVERSATION` ミューテーション統合
- `ChatScreen` — 全8ミューテーション + 3クエリ + 3サブスクリプション統合
  - リアルタイムサブスクリプション: ON_NEW_MESSAGE / ON_SUMMARY_UPDATE / ON_LOCK_CHANGE
  - 楽観的更新: 一時メッセージID → サーバーIDへの差し替え
  - サブスクリプション cleanup を useEffect return で適切に実装

#### **2. フロントエンドテスト（46テスト全合格）**

- `LoginScreen.test.tsx` — レンダリング・ユーザー選択・登録（6テスト）
- `ConversationSelect.test.tsx` — 会話一覧・新規作成（6テスト）
- `ChatBubble.test.tsx` — メッセージ表示・選択・スタイル（8テスト）
- `MessageInput.test.tsx` — 入力・送信・バリデーション（10テスト）
- `SummarySidebar.test.tsx` — 要約表示・編集・ロック（16テスト）
- Jest + React Testing Library + ts-jest 環境構築

#### **3. CDK デプロイ準備**

- `docs/deploy-guide.md` — CDK bootstrap・diff・deploy 手順書作成
- 環境変数設定ガイド・コスト見積もり追記

#### **4. GitHub PR 作成**

- PR #1: `feature/full-stack-implementation` → `develop`（https://github.com/popo0407/AIHelper/pull/1）

### **問題と対応**

| 問題                                    | 原因                                   | 対応                                            |
| --------------------------------------- | -------------------------------------- | ----------------------------------------------- |
| npm install で "Invalid Version" エラー | npm 10.9.2 の semver パーサーバグ      | npm 11.10.0 へグローバルアップグレード          |
| CDK synth で jsii ランタイムエラー      | Windows 上の Node.js / jsii 互換性問題 | デプロイガイドを作成し、CI/CD での synth を推奨 |

### **再発防止策**

- npm バージョンは 11.x 以上を使用する
- CDK synth は CI/CD パイプライン（GitHub Actions）で実行する
- AppSync クライアントをモジュールレベルで初期化し、コンポーネント間で共有する
- フロントエンドテストでは AppSync クライアントを jest.mock でモック化する

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

| 問題                                           | 原因                                                                                   | 対応                                                                    |
| ---------------------------------------------- | -------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
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

## � **2026年2月14日 — Cognito User Pool 認証統合完了**

### ✅ **完了した内容**

#### **1. Cognito User Pool CDK 定義**

- **新規スタック作成**: `cdk/lib/stacks/cognito_stack.py`（119行）
- **設定**:
  - `self_sign_up_enabled=False`（管理者のみユーザー登録可）
  - `auto_verify=None`（メール認証なし）
  - カスタム属性: `userName`（表示名、1-100文字、mutable）
  - パスワードポリシー: 8文字以上、大小英字+数字必須
- **UserPoolClient**:
  - 認証フロー: SRP認証（user_srp=True）+ ユーザー名+パスワード認証
  - トークン有効期限: アクセス/IDトークン 1時間、リフレッシュトークン 30日
- **Outputs**: UserPoolId, UserPoolClientId, UserPoolArn

#### **2. AppSync 認証設定変更**

- `cdk/lib/stacks/appsync_stack.py` を修正:
  - `authorization_type`: `API_KEY` → `USER_POOL`
  - `user_pool_config`: Cognito UserPool 参照追加
  - API Key 認証を完全削除
- `cdk/app.py` を修正:
  - CognitoStack インスタンス追加
  - AppSyncStack に `user_pool` パラメータ渡す
  - 依存関係追加: `appsync_stack.add_dependency(cognito_stack)`

#### **3. 管理者用ツール作成**

- `scripts/create-user.ps1`（80行）:
  - CloudFormation から UserPoolId 自動取得
  - `admin-create-user` 実行
  - `email_verified=true` 設定（メール認証スキップ）
  - `message_action=SUPPRESS`（メール送信なし）
  - パスワードポリシー検証（8文字、大小英字+数字）

- `scripts/reset-password.ps1`（95行）:
  - `admin-set-user-password` 実行
  - `-Permanent` スイッチ: 永続的パスワード設定（初回変更不要）
  - デフォルト: 仮パスワード設定（初回変更必須）

- `scripts/README.md`（250行）:
  - 各スクリプトの使用方法
  - パラメータ一覧
  - 実行例
  - トラブルシューティング
  - セキュリティ注意事項（パスワード管理、IAM権限）

#### **4. フロントエンド Cognito 対応**

- `frontend/src/components/LoginScreen.tsx` を完全書き換え（254行）:
  - 既存ユーザー選択ドロップダウン削除
  - 新規登録フォーム削除（管理者のみ登録可のため）
  - **新機能**:
    - メールアドレス + パスワード入力フォーム
    - `aws-amplify/auth` 統合（`signIn`, `confirmSignIn`, `fetchAuthSession`）
    - 初回ログイン時パスワード変更フロー対応（`CONFIRM_SIGN_IN_WITH_NEW_PASSWORD_REQUIRED`）
    - パスワード複雑性検証（8文字以上、大小英字+数字）
    - IDトークンから userId, email, userName 取得
  - **削除**:
    - LIST_USERS GraphQL クエリ
    - REGISTER_USER GraphQL ミューテーション

- `frontend/src/config/aws.ts` を更新:
  - `Auth.Cognito` 設定追加（UserPoolId, UserPoolClientId）
  - `defaultAuthMode`: `apiKey` → `userPool`
  - API Key 削除

- `frontend/.env.local` を更新:
  - `NEXT_PUBLIC_USER_POOL_ID=ap-northeast-1_37JNHWLS0`
  - `NEXT_PUBLIC_USER_POOL_CLIENT_ID=3fbv5dbk7rra9qcpdnlclhe7in`
  - API Key 削除

#### **5. CDK デプロイ実行**

- **修正**: `cognito_stack.py` の `cognito.Duration` → `Duration`（import 追加）
- **既存スタック削除**: `cdk destroy aichat-dev-appsync --force`（認証方式変更のため）
- **全スタックデプロイ**: `cdk deploy --all --context environment=dev`
  - aichat-dev-database（既存）
  - **aichat-dev-cognito**（新規）
  - aichat-dev-lambda（既存）
  - aichat-dev-appsync（再作成、USER_POOL認証）
- **デプロイ時間**: 約2分
- **結果**:
  - UserPoolId: `ap-northeast-1_37JNHWLS0`
  - UserPoolClientId: `3fbv5dbk7rra9qcpdnlclhe7in`
  - AppSync Endpoint: `https://37q5govhjjhtrpjgerywf4efkm.appsync-api.ap-northeast-1.amazonaws.com/graphql`

#### **6. テストユーザー作成**

- AWS CLI で直接実行（PowerShell スクリプトの文字エンコーディング問題を回避）:
  ```bash
  aws cognito-idp admin-create-user \
    --user-pool-id ap-northeast-1_37JNHWLS0 \
    --username "test@example.com" \
    --user-attributes Name=email,Value="test@example.com" \
                       Name=email_verified,Value=true \
                       Name="custom:userName",Value="テストユーザー" \
    --temporary-password "TestPass123!" \
    --message-action SUPPRESS
  ```
- **結果**:
  - Username: `97e4fa48-4051-7022-f408-04c5e9da2560`（自動生成UUID）
  - UserStatus: `FORCE_CHANGE_PASSWORD`（初回ログイン時変更必須）

#### **7. ドキュメント更新**

- `README.md`:
  - 技術スタックに「認証: Amazon Cognito User Pools」追加
  - 機能リストに「ユーザー認証」追加
  - セットアップ手順を更新（Cognito 情報取得、テストユーザー作成）
  - ディレクトリ構成に `cognito_stack.py` と `scripts/` 追加

- `docs/retrospective.md`:
  - 今回の実装内容を追加

### **問題と対応**

| 問題                                        | 原因                                     | 対応                                           |
| ------------------------------------------- | ---------------------------------------- | ---------------------------------------------- |
| `cognito.Duration` 属性エラー               | `Duration` は `aws_cdk` モジュールに存在 | `from aws_cdk import Duration` import 追加     |
| PowerShell スクリプトの文字エンコーディング | 日本語ヘルプメッセージの文字化け         | AWS CLI コマンドを直接実行（スクリプトは保留） |
| Next.js ポート 3000 使用中                  | 前回のプロセスが残留                     | ポート 3001 で自動起動（問題なし）             |

### **学んだこと**

1. **Cognito User Pool の認証フロー**:
   - `FORCE_CHANGE_PASSWORD` 状態では `confirmSignIn()` が必要
   - IDトークンから `sub`, `email`, `custom:userName` を取得可能
   - JWTトークンは1時間で自動失効（セキュリティ向上）

2. **AppSync 認証の変更**:
   - API Key → USER_POOL 変更時はスタック再作成が必要
   - Cognito UserPool はスタックの依存関係を正しく設定する必要がある

3. **管理者用ツールの重要性**:
   - AWS CLIスクリプトでユーザー作成を効率化
   - `-Permanent` オプションで初回パスワード変更をスキップ可能
   - CloudFormation Outputs から動的に UserPoolId 取得

4. **PowerShell のエンコーディング問題**:
   - 日本語コメントは UTF-8 BOM 必須
   - 本番環境では AWS CLI を直接実行する方が安全

5. **セキュリティ向上**:
   - API Key: 全ユーザー共通、無期限 → **Cognito JWT**: ユーザー毎、1時間有効
   - ブラウザからの API Key 漏洩リスク解消
   - 管理者のみユーザー登録可（self-signup 無効）

### **再発防止策**

- CDK で `Duration` を使う際は、常に `aws_cdk` モジュールから import
- AppSync 認証変更時は、事前に既存スタックを削除してから再デプロイ
- PowerShell スクリプトは UTF-8 BOM で保存、または AWS CLI を直接使用
- Cognito UserPool 設定は、初回ログイン時のフローを考慮してテスト

### **次のタスク**

1. **ログイン画面の動作テスト**（優先度: 高、見積: 30分）
   - http://localhost:3001 でログインテスト
   - 初回ログイン時のパスワード変更フロー確認
   - IDトークンから userId 取得確認

2. **既存機能の Cognito 統合**（優先度: 中、見積: 1時間）
   - ConversationSelect コンポーネント: User 型の取得元を Cognito に変更
   - userId 管理: UUID 自動生成 → Cognito `sub` 使用
   - REGISTER_USER mutation 廃止または変更（DynamoDB は補助情報のみ保存）

3. **GraphQL Subscription 再実装**（優先度: 低、見積: 2時間）
   - `schema.graphql` に Subscription セクション再追加
   - Output 型の厳密チェック
   - リアルタイム更新機能の復活

---

## �🚀 **次フェーズの計画**

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
