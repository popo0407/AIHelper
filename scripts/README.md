# 管理者用スクリプト

このフォルダには、AICHAT システムの管理者用スクリプトが含まれています。

---

## 📋 スクリプト一覧

### 1. `deploy-aws.ps1` - AWS へのデプロイ

フロントエンドをビルドしてから AWS CDK でデプロイするスクリプトです。

#### 使用方法

```powershell
cd c:\Users\user\Downloads\AICHAT

# 開発環境にデプロイ
.\scripts\deploy-aws.ps1 -Environment dev

# 本番環境にデプロイ
.\scripts\deploy-aws.ps1 -Environment prod
```

#### パラメータ

| パラメータ     | 必須 | 説明                                     | デフォルト |
| -------------- | ---- | ---------------------------------------- | ---------- |
| `-Environment` | -    | デプロイする環境（`dev` または `prod`）  | `dev`      |
| `-SetEnv`      | -    | デプロイ後に .env.local を自動生成するか | `$true`    |

#### スクリプト処理フロー

1. ✅ **前提条件チェック**
   - Node.js、npm、AWS CLI のインストール確認
   - AWS 認証情報の確認（未認証の場合は SSO ログイン）

2. 🏗️ **フロントエンドビルド**
   - `npm install` で依存関係をインストール
   - `npm run build` でビルド実行

3. 🚀 **CDK デプロイ**
   - `cdk deploy --all` で全スタックをデプロイ
   - `outputs.json` を自動生成

4. ⚙️ **環境変数セットアップ（オプション）**
   - `update-frontend-env.ps1` で AppSync、Cognito 設定を自動反映

#### 実行例

```powershell
# 開発環境にデプロイ（デフォルト）
.\scripts\deploy-aws.ps1

# 本番環境にデプロイ
.\scripts\deploy-aws.ps1 -Environment prod

# 環境変数セットアップをスキップ
.\scripts\deploy-aws.ps1 -Environment dev -SetEnv $false
```

---

### 2. `dev-local.ps1` - ローカル開発環境起動

ローカルで npm run dev を実行してフロントエンド開発サーバーを起動するスクリプトです。

#### 使用方法

```powershell
cd c:\Users\user\Downloads\AICHAT

# デフォルトポート 3000 で起動
.\scripts\dev-local.ps1

# カスタムポート 3001 で起動
.\scripts\dev-local.ps1 -Port 3001
```

#### パラメータ

| パラメータ    | 必須 | 説明                                 | デフォルト |
| ------------- | ---- | ------------------------------------ | ---------- |
| `-Port`       | -    | 開発サーバーのポート番号             | `3000`     |
| `-NoEnvSetup` | -    | 環境変数セットアップをスキップするか | `$false`   |

#### スクリプト処理フロー

1. ✅ **前提条件チェック**
   - Node.js、npm のインストール確認

2. 🧹 **既存プロセスクリーンアップ**
   - 同一ポートで動作中のプロセスを停止
   - `.next` キャッシュをクリア

3. ⚙️ **環境変数セットアップ（オプション）**
   - `.env.local` が未作成の場合は自動生成
   - CDK デプロイの `outputs.json` から設定を取得

4. 📦 **npm 依存関係インストール**
   - `npm install` で最新の依存関係をインストール

5. 🚀 **開発サーバー起動**
   - `npm run dev` でローカル開発サーバーを起動
   - `http://localhost:PORT` でアクセス可能

#### 実行例

```powershell
# デフォルトで起動（ポート 3000）
.\scripts\dev-local.ps1

# ポート 3001 で起動
.\scripts\dev-local.ps1 -Port 3001

# 環境変数セットアップをスキップして起動
.\scripts\dev-local.ps1 -NoEnvSetup $true
```

#### 終了方法

```powershell
# Ctrl+C を押してサーバーを停止
# またはターミナルを閉じる
```

---

### 3. `create-user.ps1` - 新規ユーザー作成

管理者のみが実行可能な、新規ユーザー作成スクリプトです。

#### 使用方法

```powershell
cd c:\Users\user\Downloads\AICHAT\scripts

.\create-user.ps1 `
  -Email "user@example.com" `
  -UserName "山田太郎" `
  -TempPassword "TempPass123!" `
  -Environment "dev"
```

#### パラメータ

| パラメータ      | 必須 | 説明                                     | デフォルト |
| --------------- | ---- | ---------------------------------------- | ---------- |
| `-Email`        | ✅   | ユーザーのメールアドレス                 | -          |
| `-UserName`     | ✅   | 表示名（日本語可）                       | -          |
| `-TempPassword` | ✅   | 仮パスワード（8文字以上、大小英字+数字） | -          |
| `-Environment`  | -    | 環境名（`dev` または `prod`）            | `dev`      |

#### パスワードポリシー

- **最小文字数**: 8文字以上
- **必須文字**: 大文字、小文字、数字を各1文字以上
- **例**: `TempPass123!`, `Welcome2024`

#### 実行例

```powershell
# 開発環境にユーザー作成
.\create-user.ps1 -Email "tanaka@example.com" -UserName "田中花子" -TempPassword "Welcome2024"

# 本番環境にユーザー作成
.\create-user.ps1 `
  -Email "admin@company.com" `
  -UserName "管理者" `
  -TempPassword "SecureP@ss99" `
  -Environment "prod"
```

#### 注意事項

- ユーザーは初回ログイン時に新しいパスワードへの変更を求められます
- 仮パスワードはユーザーに安全に伝えてください（Slack DM、メール等）
- CDK デプロイが完了している必要があります

---

### 3. `update-frontend-env.ps1` - フロントエンド環境変数の自動生成

CDK デプロイ後の `outputs.json` から AppSync、Cognito 設定を読み込み、フロントエンドの `.env.local` ファイルを自動生成するスクリプトです。

#### 使用方法

```powershell
cd c:\Users\user\Downloads\AICHAT

# 自動生成（outputs.json から最新設定を取得）
.\scripts\update-frontend-env.ps1
```

#### パラメータ

なし（`outputs.json` から自動読込）

#### 生成される環境変数

以下の変数が `frontend/.env.local` に自動設定されます：

```env
NEXT_PUBLIC_APPSYNC_ENDPOINT=https://xxxxx.appsync-api.ap-northeast-1.amazonaws.com/graphql
NEXT_PUBLIC_APPSYNC_REGION=ap-northeast-1
NEXT_PUBLIC_COGNITO_REGION=ap-northeast-1
NEXT_PUBLIC_COGNITO_CLIENT_ID=xxxxxxxxx
NEXT_PUBLIC_COGNITO_USER_POOL_ID=ap-northeast-1_xxxxxxxxx
NEXT_PUBLIC_COGNITO_DOMAIN=aichat-dev-xxxxxxxxx.auth.ap-northeast-1.amazoncognito.com
NEXT_PUBLIC_COGNITO_REDIRECT_URI=http://localhost:3000/auth/callback
```

#### 実行例

```powershell
# CDK デプロイ後に環境変数を自動生成
cdk deploy --all --outputs-file outputs.json
.\scripts\update-frontend-env.ps1

# または deploy-aws.ps1、dev-local.ps1 内で自動実行
```

#### 注意事項

- `cdk/outputs.json` が必要です（CDK デプロイで自動生成）
- `.env.local` があれば上書きされます
- ローカル開発環境では `NEXT_PUBLIC_COGNITO_REDIRECT_URI` が自動で `http://localhost:3000/auth/callback` に設定されます

---

### 4. `reset-password.ps1` - パスワードリセット

ユーザーのパスワードを管理者がリセットするスクリプトです。

#### 使用方法

```powershell
# 仮パスワード設定（初回変更必須）
.\reset-password.ps1 `
  -Email "user@example.com" `
  -NewPassword "NewTemp456!" `
  -Environment "dev"

# 永続的パスワード設定（初回変更不要）
.\reset-password.ps1 `
  -Email "user@example.com" `
  -NewPassword "StrongP@ssw0rd" `
  -Permanent `
  -Environment "dev"
```

#### パラメータ

| パラメータ     | 必須 | 説明                                         | デフォルト |
| -------------- | ---- | -------------------------------------------- | ---------- |
| `-Email`       | ✅   | ユーザーのメールアドレス                     | -          |
| `-NewPassword` | ✅   | 新しいパスワード（8文字以上、大小英字+数字） | -          |
| `-Permanent`   | -    | 永続的に設定（初回変更不要）                 | false      |
| `-Environment` | -    | 環境名（`dev` または `prod`）                | `dev`      |

#### 実行例

```powershell
# ユーザーが忘れた場合（初回変更必須）
.\reset-password.ps1 -Email "user@example.com" -NewPassword "TempReset999"

# 管理者が直接設定（初回変更不要）
.\reset-password.ps1 -Email "admin@example.com" -NewPassword "AdminP@ss2024" -Permanent
```

#### `-Permanent` フラグの違い

| フラグなし（デフォルト）   | `-Permanent` 指定時                |
| -------------------------- | ---------------------------------- |
| 仮パスワードとして設定     | 永続的パスワードとして設定         |
| 初回ログイン時に変更を強制 | すぐにそのパスワードでログイン可能 |
| セキュリティ重視           | 利便性重視                         |

---

### 5. `deploy-bedrock-kb.ps1` - Bedrock Knowledge Base のデプロイ

CloudFormation を使用して AWS Bedrock Knowledge Base (us-west-2) をデプロイするスクリプトです。

#### 使用方法

```powershell
cd c:\Users\user\Downloads\AICHAT

# 開発環境にデプロイ
.\scripts\deploy-bedrock-kb.ps1 -Environment dev

# 本番環境にデプロイ
.\scripts\deploy-bedrock-kb.ps1 -Environment prod
```

#### パラメータ

| パラメータ          | 必須 | 説明                                | デフォルト  |
| ------------------- | ---- | ----------------------------------- | ----------- |
| `-Environment`      | -    | デプロイ環境（`dev` または `prod`） | `dev`       |
| `-Region`           | -    | AWS リージョン（固定: us-west-2）   | `us-west-2` |
| `-CreateDataSource` | -    | Data Source 作成フラグ（互換用）    | `$false`    |
| `-SkipChainFail`    | -    | Lambda 設定失敗を無視するか         | `$false`    |

**注記**: Data Source は CloudFormation で自動作成されるため、`-CreateDataSource` は互換性のためのみ残置

#### スクリプト処理フロー

1. ✅ **前提条件チェック**
   - AWS CLI のインストール確認
   - AWS 認証情報確認（未認証の場合は `aws sso login` を実行）

2. 🏗️ **CloudFormation デプロイ**
   - テンプレート(`cdk.out` から生成済み）をus-west-2 にデプロイ
   - Knowledge Base + S3 Vectors ストレージを作成
   - IAM Role で Tokyo S3 への Data Source アクセスを許可

3. 📦 **Data Source 自動作成**
   - CloudFormation で S3 Data Source を自動作成（Tokyo S3 参照）
   - Chunking Strategy: FIXED_SIZE (1024 tokens, 20% overlap)
   - ベクトル化が自動で開始

4. 🔑 **Knowledge Base ID 取得**
   - CloudFormation Outputs から Knowledge Base ID を取得
   - `cdk/outputs.json` に `Bedrock.BedrockKbId` として保存
   - Data Source ID も取得・保存

5. ⚙️ **Lambda 環境変数設定**
   - 東京リージョンの `knowledgebase` Lambda 関数の `BEDROCK_KB_ID` 環境変数に設定
   - Lambda は Bedrock Knowledge Base への `Retrieve` 権限あり

6. 📊 **デプロイ完了 & Sync 進捗**
   - スクリプトが Data Source Sync ステータスを表示
   - AWS Console で進捗を追跡可能

#### 実行例

```powershell
# 開発環境にベースとなる Knowledge Base をデプロイ
.\scripts\deploy-bedrock-kb.ps1 -Environment dev

# 本番環境にデプロイ
.\scripts\deploy-bedrock-kb.ps1 -Environment prod

# Lambda 設定エラーを無視（トラブルシューティング時）
.\scripts\deploy-bedrock-kb.ps1 -Environment dev -SkipChainFail $true
```

#### CloudFormation デプロイメント内訳

| コンポーネント    | 対応状況 | 注記                                        |
| ----------------- | -------- | ------------------------------------------- |
| Knowledge Base    | ✅ 自動  | US-WEST-2 で自動作成（Titan v2 Embeddings） |
| S3 Vectors Bucket | ✅ 自動  | ベクトルストレージ（us-west-2）             |
| IAM Role          | ✅ 自動  | Bedrock の S3 リージョン横断アクセス権限    |
| Data Source (S3)  | ✅ 自動  | CloudFormation で自動作成（Tokyo S3 参照）  |
| Vector Sync       | ⏳ 自動  | 5-10分で自動開始（AWS Console で確認）      |

#### Data Source セットアップと Sync 確認

CloudFormation デプロイで **Data Source は自動作成**されます。以下は確認と Sync 進捗追跡の手順です：

**1. Data Source 自動作成（スクリプト内で確認）**

```powershell
.\scripts\deploy-bedrock-kb.ps1 -Environment dev
# スクリプトが Data Source ID を自動検出・保存します
```

**2. AWS Console で Sync 進捗を確認**

```
1. AWS Bedrock Console を開く
   https://console.aws.amazon.com/bedrock/home?region=us-west-2#/knowledge-bases

2. Knowledge Base を選択： "aichat-{environment}-kb"

3. [Data sources] タブで確認：
   - Status: AVAILABLE (準備完了)
   - Last synced: タイムスタンプ
   - Sync status: READY (or IN_PROGRESS)

4. 最初の sync は5-10分で自動開始
   （ドキュメント数、ファイルサイズに依存）
```

**3. Sync が完了したら Knowledge Base が利用可能**

```
- Lambda が Bedrock API で検索クエリを実行可能
- ベクトル化と semantic search が有効
```

**Knowledge Base ID 取得：**

```powershell
# 方法 1: outputs.json から取得
$outputs = Get-Content cdk/outputs.json | ConvertFrom-Json
$kbId = $outputs.Bedrock.BedrockKbId

# 方法 2: AWS CLI で取得
aws bedrock-agent list-knowledge-bases --region us-west-2 --query 'knowledgeBases[0].knowledgeBaseId' --output text
```

**Data Source ID 取得（手動追加後）：**

```powershell
# AWS CLI で Knowledge Base の Data Sources を取得
aws bedrock-agent list-data-sources `
  --knowledge-base-id {KnowledgeBaseId} `
  --region us-west-2 `
  --query 'dataSourceSummaries[0].dataSourceId' `
  --output text
```

**Lambda への環境変数確認：**

```powershell
aws lambda get-function-configuration `
  --function-name aichat-{environment}-knowledgebase `
  --region ap-northeast-1 `
  --query 'Environment.Variables.BEDROCK_KB_ID' `
  --output text
```

#### トラブルシューティング

**Q: CloudFormation デプロイに失敗**

```powershell
# 1. テンプレート確認
Test-Path cdk/cdk.out/aichat-dev-bedrock-kb.template.json

# 2. 未生成の場合は CDK synth 実行
cd cdk
cdk synth

# 3. AWS CLI で直接デプロイ試行
aws cloudformation deploy `
  --template-file cdk/cdk.out/aichat-dev-bedrock-kb.template.json `
  --stack-name aichat-dev-bedrock-kb `
  --region us-west-2 `
  --capabilities CAPABILITY_IAM
```

**Q: Lambda 環境変数設定に失敗**

```powershell
# Lambda 関数が存在するか確認
aws lambda get-function `
  --function-name aichat-dev-knowledgebase `
  --region ap-northeast-1

# 手動で設定
aws lambda update-function-configuration `
  --function-name aichat-dev-knowledgebase `
  --region ap-northeast-1 `
  --environment "Variables={BEDROCK_KB_ID=<取得したID>}"
```

**Q: Knowledge Base ID が出力されない**

```powershell
# CloudFormation スタックが作成されているか確認
aws cloudformation describe-stacks `
  --stack-name aichat-dev-bedrock-kb `
  --region us-west-2 `
  --query 'Stacks[0]'

# Outputs を確認
aws cloudformation describe-stacks `
  --stack-name aichat-dev-bedrock-kb `
  --region us-west-2 `
  --query 'Stacks[0].Outputs'
```

#### 注意事項

- **リージョン固定**: Bedrock Knowledge Base はus-west-2にのみ対応
- **クロスリージョン**: Tokyo S3 bucket (ap-northeast-1) を Data Source として参照
- **Embedding Model**: Titan Embeddings V2 (amazon.titan-embed-text-v2:0) 固定
- **Vector Dimension**: 1536次元（Titan v2 仕様）

---

## 🚀 デプロイと開発ワークフロー

### AWS へのデプロイフロー

```powershell
# 1. AWS 認証
aws sso login

# 2. AWS へデプロイ（フロントエンド build + CDK deploy）
.\scripts\deploy-aws.ps1 -Environment dev

# 3. CloudFront URL でアクセス確認
```

### ローカル開発フロー

```powershell
# 1. ローカル開発サーバーを起動
.\scripts\dev-local.ps1

# 2. http://localhost:3000 でアクセス
# 3. Ctrl+C で停止
```

### 初回セットアップ手順

```powershell
# 1. リポジトリをクローン
git clone https://github.com/popo0407/AIHelper.git
cd AIHelper

# 2. AWS 認証
aws sso login

# 3. CDK デプロイ
.\scripts\deploy-aws.ps1 -Environment dev

# 4. ユーザー作成（オプション）
.\scripts\create-user.ps1 `
  -Email "developer@example.com" `
  -UserName "開発者" `
  -TempPassword "Welcome2024"

# 5. ローカル開発環境で開発
.\scripts\dev-local.ps1
```

---

## 🔧 前提条件

### 1. AWS CLI のインストール

```powershell
# winget でインストール
winget install Amazon.AWSCLI
```

### 2. AWS 認証情報の設定

```powershell
aws configure
# または環境変数で設定
$env:AWS_ACCESS_KEY_ID = "YOUR_ACCESS_KEY"
$env:AWS_SECRET_ACCESS_KEY = "YOUR_SECRET_KEY"
$env:AWS_DEFAULT_REGION = "ap-northeast-1"
```

### 3. CDK デプロイの完了

```powershell
cd c:\Users\user\Downloads\AICHAT
cdk deploy --all --context environment=dev --require-approval never
```

---

## 🚨 トラブルシューティング

### エラー: "CloudFormation スタックが見つかりません"

**原因**: CDK がデプロイされていない  
**解決策**:

```powershell
cd c:\Users\user\Downloads\AICHAT
cdk deploy --all --context environment=dev
```

### エラー: "パスワードは8文字以上である必要があります"

**原因**: パスワードポリシー違反  
**解決策**: 大文字・小文字・数字を含む8文字以上のパスワードを指定

### エラー: "User already exists"

**原因**: 同じメールアドレスのユーザーが既に存在  
**解決策**:

- 別のメールアドレスを使用
- または既存ユーザーを削除:
  ```powershell
  aws cognito-idp admin-delete-user `
    --user-pool-id <USER_POOL_ID> `
    --username "user@example.com" `
    --region ap-northeast-1
  ```

---

## 📚 関連ドキュメント

- [Cognito 認証移行 Issue](../.github/ISSUES/cognito-authentication.md)
- [AWS CLI Cognito-IDP コマンドリファレンス](https://docs.aws.amazon.com/cli/latest/reference/cognito-idp/)
- [セキュリティスキル](../.github/skills/security/SKILL.md)

---

## 🔒 セキュリティ注意事項

1. **仮パスワードの管理**
   - 平文のパスワードを Slack、メールで送信しない
   - 可能な限り安全な方法で伝える（対面、暗号化メッセージ等）

2. **スクリプト実行履歴**
   - PowerShell の履歴にパスワードが残る可能性
   - 実行後は `Clear-History` で履歴をクリア推奨

3. **本番環境での実行**
   - 本番環境（`-Environment prod`）での実行は慎重に
   - 必ず `-WhatIf` 相当のチェックを実施

4. **IAM 権限**
   - `cognito-idp:AdminCreateUser`
   - `cognito-idp:AdminSetUserPassword`
   - `cloudformation:DescribeStacks`
     が必要

---

最終更新: 2026年2月15日
