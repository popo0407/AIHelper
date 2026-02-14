# AI常駐型グループチャットアプリ

AWS 上に構築するリアルタイムグループチャットアプリケーション。AI アシスタント（AIHelper）がグループ会話から重要な内容を抽出・要約し、ユーザーは議事録を効率的に管理できます。

---

## 📋 **プロジェクト概要**

### **機能**

- **ユーザー認証:** Amazon Cognito による安全なログイン（管理者のみユーザー登録可）
- **リアルタイムチャット:** AppSync (GraphQL WebSocket) でリアルタイム更新
- **AI要約機能:** Bedrock（Claude Haiku 4.5）で会話を自動要約
- **AIアシスタント:** 複数の相談ボタンで AI に質問・回答を依頼
- **排他制御:** 複数ユーザーによる同時編集時のロック管理（3分 TTL）
- **会話管理:** 複数会話のサポート、リンク共有機能

### **技術スタック**

- **フロントエンド:** React / Next.js （AWS Amplify）
- **バックエンド:** AWS AppSync（GraphQL）、AWS Lambda
- **認証:** Amazon Cognito User Pools
- **ストレージ:** Amazon DynamoDB
- **AI エンジン:** Amazon Bedrock（Claude Haiku 4.5 推論プロファイルモデル）
- **リージョン:** Tokyo（東京）（Bedrock のみオレゴン）
- **Infrastructure:** AWS CDK

---

## 📁 **ディレクトリ構成**

```
AICHAT/
├── .github/
│   ├── agents/                     # AI エージェント定義
│   ├── skills/                     # スキルドキュメント
│   └── copilot-instructions.md     # AI 開発憲章
├── cdk/                            # AWS CDK Infrastructure
│   ├── app.py                      # CDK エントリーポイント
│   ├── cdk.json                    # CDK 設定
│   ├── requirements-cdk.txt        # CDK 依存関係
│   ├── graphql/
│   │   └── schema.graphql          # AppSync GraphQL スキーマ
│   └── lib/
│       ├── stacks/
│       │   ├── database_stack.py   # DynamoDB テーブル定義
│       │   ├── cognito_stack.py    # Cognito User Pool 定義
│       │   ├── lambda_stack.py     # Lambda 関数定義
│       │   └── appsync_stack.py    # AppSync API 定義
│       └── constructs/
├── backend/                        # Lambda 関数 & 共通モジュール
│   ├── common/
│   │   ├── config.py               # 環境設定
│   │   ├── models.py               # データモデル
│   │   └── utils.py                # 共通ユーティリティ
│   ├── functions/
│   │   ├── user_management/        # ユーザー管理 Lambda
│   │   ├── chat/                   # チャット Lambda
│   │   ├── summarizer/             # 要約 Lambda (Bedrock 連携)
│   │   ├── ai_support/             # AI 相談 Lambda (Bedrock 連携)
│   │   ├── lock_manager/           # ロック管理 Lambda
│   │   └── conversation/           # 会話管理 Lambda
│   ├── tests/                      # ユニットテスト（pytest / moto）
│   │   ├── conftest.py             # 共通フィクスチャ
│   │   ├── helpers.py              # テストヘルパー
│   │   ├── test_user_management.py
│   │   ├── test_chat.py
│   │   ├── test_summarizer.py
│   │   ├── test_ai_support.py
│   │   ├── test_lock_manager.py
│   │   └── test_conversation.py
│   ├── layers/                     # Lambda Layer
│   └── requirements.txt
├── frontend/                       # React / Next.js フロントエンド
│   ├── src/
│   │   ├── app/                    # Next.js App Router
│   │   │   ├── layout.tsx
│   │   │   └── page.tsx
│   │   ├── components/             # React コンポーネント
│   │   │   ├── LoginScreen.tsx
│   │   │   ├── ConversationSelect.tsx
│   │   │   ├── ChatScreen.tsx
│   │   │   ├── ChatHeader.tsx
│   │   │   ├── ChatBubble.tsx
│   │   │   ├── MessageList.tsx
│   │   │   ├── MessageInput.tsx
│   │   │   ├── SummarySidebar.tsx
│   │   │   ├── AIHelperButtons.tsx
│   │   │   └── NotificationBanner.tsx
│   │   ├── graphql/                # GraphQL 操作定義
│   │   ├── lib/                    # AppSync クライアント
│   │   ├── types/                  # TypeScript 型定義
│   │   ├── config/                 # AWS 設定
│   │   ├── styles/                 # グローバル CSS
│   │   └── __tests__/              # コンポーネントテスト
│   ├── package.json
│   ├── tsconfig.json
│   ├── tailwind.config.js
│   └── next.config.js
├── scripts/                        # 管理者用スクリプト
│   ├── create-user.ps1             # Cognitoユーザー作成（PowerShell）
│   ├── reset-password.ps1          # パスワードリセット（PowerShell）
│   └── README.md                   # スクリプト使用方法
├── documents/
│   ├── 要件定義.md
│   └── AWSシステム構成.md
├── docs/
│   ├── retrospective.md
│   └── deploy-guide.md
├── .gitignore
└── README.md
```

---

## 🚀 **セットアップ手順**

### **前提条件**

- Node.js 18+
- AWS CLI v2
- AWS Amplify CLI
- Python 3.11+（CDK 用）
- Git

### **インストール**

```bash
# 1. リポジトリをクローン
git clone https://github.com/popo0407/AIHelper.git
cd AIHelper

# 2. フロントエンド依存関係をインストール
cd frontend
npm install --legacy-peer-deps
cd ..

# 3. CDK 依存関係をインストール
pip install -r cdk/requirements-cdk.txt

# 4. CDK スタックをデプロイ（詳細は docs/deploy-guide.md 参照）
cd cdk
cdk deploy --all --context environment=dev --require-approval never

# 5. Cognito UserPool情報を取得して環境変数を設定
aws cloudformation describe-stacks --stack-name aichat-dev-cognito --query "Stacks[0].Outputs"
# 上記の出力からUserPoolIdとUserPoolClientIdを取得

# frontend/.env.local を作成して設定
cat > ../frontend/.env.local << EOF
NEXT_PUBLIC_AWS_REGION=ap-northeast-1
NEXT_PUBLIC_APPSYNC_ENDPOINT=<AppSync GraphQL endpoint from deployment>
NEXT_PUBLIC_USER_POOL_ID=<UserPoolId from Cognito stack>
NEXT_PUBLIC_USER_POOL_CLIENT_ID=<UserPoolClientId from Cognito stack>
EOF

# 6. テストユーザーを作成
cd ../scripts
# PowerShell (Windows)
.\create-user.ps1 -Email "user@example.com" -UserName "ユーザー名" -TempPassword "TempPass123!"
# 直接AWS CLI (Linux/Mac)
aws cognito-idp admin-create-user --user-pool-id <UserPoolId> --username "user@example.com" ...

# 7. フロントエンド開発サーバー起動
cd ../frontend
npm run dev
```

### **テスト実行**

```bash
# バックエンドテスト（89テスト）
cd backend && python -m pytest tests/ -v

# フロントエンドテスト（127テスト）
cd frontend && npm test

# E2Eテスト（PlayWright MCPで自動化）
cd frontend
npm run e2e                # ヘッドレスモード
npm run e2e:ui            # UIで対話的に実行・デバッグ
npm run e2e:debug         # デバッグモード
npm run e2e:headed        # ブラウザ表示モード
```

**E2Eテストについて：**

- PlayWright MCPによるユーザーインタラクションテスト
- ログイン、フォーム入力、ナビゲーション等をテスト
- Copilot Chat統合による自動テストコード生成対応
- 詳細は [PlayWright MCPセットアップガイド](docs/playwright-guide.md) を参照

---

## 📚 **ドキュメント**

| ドキュメント                                                                        | 概要                                            |
| ----------------------------------------------------------------------------------- | ----------------------------------------------- |
| [要件定義.md](documents/要件定義.md)                                                | 機能仕様、ユーザーフロー、UI/UX                 |
| [AWSシステム構成.md](documents/AWSシステム構成.md)                                  | アーキテクチャ、DynamoDB スキーマ、ワークフロー |
| [PlayWright MCPガイド](docs/playwright-guide.md)                                    | E2Eテスト自動化（PlayWright、Copilot Chat統合） |
| [.github/copilot-instructions.md](.github/copilot-instructions.md)                  | AI 開発プロセス憲章                             |
| [.github/skills/\*](https://github.com/popo0407/AICHAT/tree/develop/.github/skills) | 開発スキルガイド                                |
| [docs/retrospective.md](docs/retrospective.md)                                      | プロジェクト振り返り                            |
| [docs/deploy-guide.md](docs/deploy-guide.md)                                        | CDK デプロイ手順書                              |

---

## 🔄 **Git ワークフロー**

このプロジェクトは **Git Flow** を採用しています。

### **ブランチ戦略**

```
feature/*          → develop (PR)
         ↗
develop            → main (リリース)
         ↗
main               (本番リリース)
```

### **コミット規約**

Conventional Commits に従います：

```
<type>(<scope>): <subject>

<body>

<footer>
```

**Type の種別:** `feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`, `chore`, `ci`

**例:**

```bash
git commit -m "feat(backend): add summarizer lambda function

- Implement Bedrock integration for summary generation
- Add DynamoDB write operations
- Include error handling and retry logic

Closes #123"
```

詳細は [.github/skills/git/SKILL.md](.github/skills/git/SKILL.md) を参照してください。

---

## ✅ **開発チェックリスト**

### **フェーズ 1：要件・設計（✅ 完了）**

- [x] 要件定義書作成
- [x] AWS アーキテクチャ設計
- [x] DynamoDB スキーマ設計（パターンB）
- [x] UI/UX フロー定義
- [x] Git ワークフロー確立

### **フェーズ 2：バックエンド実装（✅ 完了）**

- [x] CDK スタック実装（Database / Lambda / AppSync）
- [x] DynamoDB テーブル定義（Users / Messages / Summary / Locks / Conversations）
- [x] Lambda 関数実装（UserManagement, Chat, Summarizer, AISupport, LockManager, Conversation）
- [x] AppSync GraphQL スキーマ＆リゾルバー定義
- [x] Bedrock 連携（Claude Haiku 4.5 推論プロファイル / dev モック対応）
- [x] ユニットテスト作成（pytest / moto — 89テスト全合格）

### **フェーズ 3：フロントエンド実装（✅ 完了）**

- [x] Next.js プロジェクト構築（App Router / TypeScript / Tailwind CSS）
- [x] React コンポーネント構築（Login / ConversationSelect / ChatScreen）
- [x] GraphQL クエリ・ミューテーション・サブスクリプション定義
- [x] Serendie Design System インスパイアの UI 実装
- [x] ログイン画面 & ユーザー登録
- [x] チャット画面（2ペインレイアウト）
- [x] 要約サイドバー（編集・Undo 対応）
- [x] AI 相談ボタン（4種類）
- [x] メッセージ選択・ハイライト
- [x] 排他制御 UI（ロック表示）
- [x] AppSync クライアント接続（Amplify v6 統合）
- [x] リアルタイムサブスクリプション（メッセージ・要約・ロック）
- [x] コンポーネントテスト（Jest + RTL — 127テスト全合格）
  - LoginScreen（Cognito認証フロー: 13テスト）
  - ConversationSelect（会話一覧: 6テスト）
  - ChatHeader（ヘッダー操作: 10テスト）
  - ChatBubble（メッセージ表示）
  - MessageList（メッセージ一覧: 11テスト）
  - MessageInput（メッセージ入力）
  - SummarySidebar（要約サイドバー: 14テスト）
  - AIHelperButtons（AI相談ボタン: 17テスト）
  - NotificationBanner（通知バナー: 7テスト）
  - SubscriptionHandlers（リアルタイム同期ロジック: 28テスト）
- [x] E2E テスト（PlayWright - ログイン・会話操作・Subscriptionリアルタイム更新テスト作成済み）

### **フェーズ 4：統合テスト＆本番デプロイ（予定）**

- [x] **Cognito 認証への移行**（✅ 完了 - 既にUSER_POOL認証を使用中）
- [x] GraphQL Subscription の再実装（AWS AppSync ベストプラクティスに準拠）
- [ ] Subscription リアルタイム更新の手動動作確認
- [ ] WAF レート制限の追加
- [ ] 統合テスト
- [ ] セキュリティ監査
- [ ] パフォーマンステスト
- [ ] 本番環境デプロイ

---

## 🔐 **セキュリティ考慮事項**

### **実装済み**

- ✅ IAM ロール / ポリシー最小権限の原則
- ✅ DynamoDB TTL による自動ロック解放
- ✅ AppSync VTL でのデータ検証
- ✅ Lambda での入力サニタイゼーション
- ✅ Bedrock API への認証
- ✅ **Amazon Cognito User Pools 認証**（JWT トークンによるユーザー認証・認可）

### **次の優先事項**

- ⚠️ **WAF レート制限**: API 呼び出し制限の追加（DDoS 対策）
- ⚠️ **本番環境設定**: HTTPS、カスタムドメイン、CloudFront CDN

詳細は [.github/skills/security/SKILL.md](.github/skills/security/SKILL.md) を参照。

---

## 📞 **サポート＆報告**

不具合報告やフィードバックは GitHub Issues で お願いします。

---
## 📌 **進行中の ISSUE**

| # | タイトル | ステータス | 優先度 |
|---|---------|------------|-------|
| [ISSUE-01](docs/ISSUE-knowledgebase.md) | **Knowledgebase 登録・検索機能の追加** | 🔄 設計完了 | 🔴 高 |

### **Knowledgebase 機能追加**

PDF、Word、HTML などのドキュメントをセッションに登録し、会話内容の質問に対して Bedrock が該当ドキュメントから検索・回答できる機能を追加予定。

**主な機能:**
- 🔹 ファイルアップロード（PDF / Word / HTML / Markdown / テキスト形式対応）
- 🔹 セッション内の Knowledgebase 一覧表示・削除
- 🔹 Knowledgebase 検索トグル（チャット欄に追加）
- 🔹 Bedrock RAG で検索・回答生成（出典ファイル表示）
- 🔹 AWS Knowledge Bases for Bedrock + S3Vector 採用
- 🔹 非同期ベクトル化パイプライン

**実装予定:** 3-4週間（17日工数）

詳細は [docs/ISSUE-knowledgebase.md](docs/ISSUE-knowledgebase.md) を参照。

---
## � **変更履歴**

### v0.5.0 (2026-02-14)

- **ISSUE 01:** ユーザーID表示の改善 — 要約の最終更新表示がUUIDからユーザー名に変更
- **ISSUE 02:** メッセージ選択UIの強調改善 — チェックマークアイコン、背景色変更、より強い視覚的フィードバック
- **ISSUE 03:** nextjs-toast問題の修正 — `devIndicators: false` + CSS非表示で入力欄を邪魔しないよう対策
- **ISSUE 04:** サイドバー幅スライダー — チャット欄と要約サイドバーの間にドラッグ可能なリサイズハンドル追加
- **ISSUE 05:** 会話タイトルの自動登録・編集機能 — 初回メッセージから自動設定、クリックで編集可能、AI抽出タイトル削除

---

## 📝 **ライセンス**

MIT License

---

**プロジェクトステータス:** 🟢 開発中（フェーズ 2・3 完了、フェーズ 4 準備中）

最終更新：2026年2月14日
