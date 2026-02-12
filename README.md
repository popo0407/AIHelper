# AI常駐型グループチャットアプリ

AWS 上に構築するリアルタイムグループチャットアプリケーション。AI アシスタント（AIHelper）がグループ会話から重要な内容を抽出・要約し、ユーザーは議事録を効率的に管理できます。

---

## 📋 **プロジェクト概要**

### **機能**

- **リアルタイムチャット:** AppSync (GraphQL WebSocket) でリアルタイム更新
- **AI要約機能:** Bedrock（Claude Haiku 4.5）で会話を自動要約
- **AIアシスタント:** 複数の相談ボタンで AI に質問・回答を依頼
- **排他制御:** 複数ユーザーによる同時編集時のロック管理（3分 TTL）
- **会話管理:** 複数会話のサポート、リンク共有機能

### **技術スタック**

- **フロントエンド:** React / Next.js （AWS Amplify）
- **バックエンド:** AWS AppSync（GraphQL）、AWS Lambda
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
│   │   ├── types/                  # TypeScript 型定義
│   │   ├── config/                 # AWS 設定
│   │   └── styles/                 # グローバル CSS
│   ├── package.json
│   ├── tsconfig.json
│   ├── tailwind.config.js
│   └── next.config.js
├── documents/
│   ├── 要件定義.md
│   └── AWSシステム構成.md
├── docs/
│   └── retrospective.md
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
git clone <repository-url>
cd AICHAT

# 2. 依存関係をインストール
npm install
npm install -g @aws-cdk/cli

# 3. 環境変数を設定
cp .env.example .env.local
# .env.local を編集

# 4. CDK スタックをデプロイ（初回）
cdk deploy
```

---

## 📚 **ドキュメント**

| ドキュメント                                                                        | 概要                                            |
| ----------------------------------------------------------------------------------- | ----------------------------------------------- |
| [要件定義.md](documents/要件定義.md)                                                | 機能仕様、ユーザーフロー、UI/UX                 |
| [AWSシステム構成.md](documents/AWSシステム構成.md)                                  | アーキテクチャ、DynamoDB スキーマ、ワークフロー |
| [.github/copilot-instructions.md](.github/copilot-instructions.md)                  | AI 開発プロセス憲章                             |
| [.github/skills/\*](https://github.com/popo0407/AICHAT/tree/develop/.github/skills) | 開発スキルガイド                                |
| [docs/retrospective.md](docs/retrospective.md)                                      | プロジェクト振り返り                            |

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

### **フェーズ 3：フロントエンド実装（✅ 基盤完了）**

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
- [ ] AppSync クライアント接続（Amplify 統合）
- [ ] E2E テスト

### **フェーズ 4：統合テスト＆本番デプロイ（予定）**

- [ ] 統合テスト
- [ ] セキュリティ監査
- [ ] パフォーマンステスト
- [ ] 本番環境デプロイ

---

## 🔐 **セキュリティ考慮事項**

- ✅ IAM ロール / ポリシー最小権限の原則
- ✅ DynamoDB TTL による自動ロック解放
- ✅ AppSync VTL でのデータ検証
- ✅ Lambda での入力サニタイゼーション
- ✅ Bedrock API への認証

詳細は [.github/skills/security/SKILL.md](.github/skills/security/SKILL.md) を参照。

---

## 📞 **サポート＆報告**

不具合報告やフィードバックは GitHub Issues で お願いします。

---

## 📝 **ライセンス**

MIT License

---

**プロジェクトステータス:** ð§ 開発中（フェーズ 2・3 基盤完了、バックエンドテスト完了）

最終更新：2026年2月13日
