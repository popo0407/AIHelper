# 管理者用スクリプト

このフォルダには、AICHAT システムの管理者用スクリプトが含まれています。

---

## 📋 スクリプト一覧

### 1. `create-user.ps1` - 新規ユーザー作成

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

| パラメータ      | 必須 | 説明                                       | デフォルト |
| --------------- | ---- | ------------------------------------------ | ---------- |
| `-Email`        | ✅    | ユーザーのメールアドレス                   | -          |
| `-UserName`     | ✅    | 表示名（日本語可）                         | -          |
| `-TempPassword` | ✅    | 仮パスワード（8文字以上、大小英字+数字）   | -          |
| `-Environment`  | -    | 環境名（`dev` または `prod`）              | `dev`      |

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

### 2. `reset-password.ps1` - パスワードリセット

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

| パラメータ      | 必須 | 説明                                      | デフォルト |
| --------------- | ---- | ----------------------------------------- | ---------- |
| `-Email`        | ✅    | ユーザーのメールアドレス                  | -          |
| `-NewPassword`  | ✅    | 新しいパスワード（8文字以上、大小英字+数字）| -          |
| `-Permanent`    | -    | 永続的に設定（初回変更不要）              | false      |
| `-Environment`  | -    | 環境名（`dev` または `prod`）             | `dev`      |

#### 実行例

```powershell
# ユーザーが忘れた場合（初回変更必須）
.\reset-password.ps1 -Email "user@example.com" -NewPassword "TempReset999"

# 管理者が直接設定（初回変更不要）
.\reset-password.ps1 -Email "admin@example.com" -NewPassword "AdminP@ss2024" -Permanent
```

#### `-Permanent` フラグの違い

| フラグなし（デフォルト）      | `-Permanent` 指定時                |
| ----------------------------- | ---------------------------------- |
| 仮パスワードとして設定        | 永続的パスワードとして設定        |
| 初回ログイン時に変更を強制    | すぐにそのパスワードでログイン可能 |
| セキュリティ重視              | 利便性重視                        |

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

最終更新: 2026年2月13日
