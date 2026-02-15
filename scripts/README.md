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

| パラメータ  | 必須 | 説明                                        | デフォルト |
| ----------- | ---- | ------------------------------------------- | ---------- |
| `-Environment` | -  | デプロイする環境（`dev` または `prod`）     | `dev`      |
| `-SetEnv`   | -    | デプロイ後に .env.local を自動生成するか    | `$true`    |

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

| パラメータ    | 必須 | 説明                                          | デフォルト |
| ------------- | ---- | --------------------------------------------- | ---------- |
| `-Port`       | -    | 開発サーバーのポート番号                      | `3000`     |
| `-NoEnvSetup` | -    | 環境変数セットアップをスキップするか           | `$false`   |

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
