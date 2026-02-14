# Issue: Cognito 認証への移行

**優先度**: 高  
**見積もり**: 2-3時間  
**ラベル**: security, enhancement  
**関連**: セキュリティ強化

## 背景

現在、AppSync API の認証に **API Key** を使用していますが、以下の問題があります：

1. **API Key が公開される**: ブラウザの DevTools で誰でも確認可能
2. **1つのキーを全ユーザーで共有**: 漏洩時の影響範囲が大きい
3. **無期限または長期間有効**: 悪用されるリスクが高い
4. **レート制限なし**: DDoS攻撃の可能性

## 目的

**Amazon Cognito User Pools** による認証に移行し、以下を実現：

- ✅ ユーザーごとに異なる JWT トークン
- ✅ トークンの自動有効期限（1時間）
- ✅ ログイン必須化による匿名攻撃の防止
- ✅ ユーザー管理の一元化

## 実装タスク

### 1. バックエンド（CDK）

- [ ] **Cognito UserPool の作成**
  - ファイル: `cdk/lib/stacks/cognito_stack.py`
  - パスワードポリシー設定
  - メール検証設定
  - ユーザー属性定義（email, userName）

- [ ] **AppSync 認証方式の変更**
  - ファイル: `cdk/lib/stacks/appsync_stack.py`
  - `API_KEY` → `USER_POOL` に変更
  - UserPoolConfig の設定

- [ ] **Lambda に Cognito トリガー追加**（オプション）
  - PostConfirmation: 自動的に Users テーブルに登録

### 2. フロントエンド（React/Next.js）

- [ ] **Amplify Auth の設定**
  - ファイル: `frontend/src/lib/amplify.ts`
  - Cognito UserPool ID, Client ID の設定

- [ ] **LoginScreen の改修**
  - ファイル: `frontend/src/components/LoginScreen.tsx`
  - サインアップフォーム追加
  - Amplify Auth.signUp/signIn の統合
  - メール検証フロー追加

- [ ] **認証状態管理**
  - ファイル: `frontend/src/app/page.tsx`
  - `Auth.currentAuthenticatedUser()` で自動ログイン

- [ ] **GraphQL クライアント設定更新**
  - ファイル: `frontend/src/lib/graphql-client.ts`
  - 認証ヘッダーに JWT トークンを付与

### 3. 既存機能との統合

- [ ] **REGISTER_USER mutation の廃止または変更**
  - 現在: メールアドレスとユーザー名で登録
  - 変更後: Cognito で管理、DynamoDB は補助情報のみ

- [ ] **userId の管理方法変更**
  - 現在: UUID を自動生成
  - 変更後: Cognito の `sub`（UUID）を使用

### 4. テスト

- [ ] 新規ユーザー登録フロー
- [ ] ログイン/ログアウト
- [ ] トークン更新
- [ ] 既存の会話・メッセージ機能との連携

## マイグレーション戦略

### オプション A: 完全移行（推奨）

既存の Users テーブルをクリアし、Cognito から再構築

**メリット**: シンプル、クリーンな状態  
**デメリット**: 既存データ削除（開発環境のため問題なし）

### オプション B: 段階的移行

API Key と Cognito の両方をサポート（AppSync の additional_authorization_modes）

**メリット**: 既存データ保持  
**デメリット**: 複雑、セキュリティ問題が残る

→ **開発環境のため、オプション A を推奨**

## 技術仕様

### Cognito UserPool 設定

```python
user_pool = cognito.UserPool(
    self, "UserPool",
    user_pool_name=f"{project_name}-{env_name}-users",
    self_sign_up_enabled=True,
    sign_in_aliases=cognito.SignInAliases(email=True),
    auto_verify=cognito.AutoVerifiedAttrs(email=True),
    password_policy=cognito.PasswordPolicy(
        min_length=8,
        require_lowercase=True,
        require_uppercase=True,
        require_digits=True,
        require_symbols=False,
    ),
    account_recovery=cognito.AccountRecovery.EMAIL_ONLY,
)

user_pool_client = user_pool.add_client(
    "UserPoolClient",
    auth_flows=cognito.AuthFlow(
        user_password=True,
        user_srp=True,
    ),
)
```

### AppSync 認証設定

```python
authorization_config=appsync.AuthorizationConfig(
    default_authorization=appsync.AuthorizationMode(
        authorization_type=appsync.AuthorizationType.USER_POOL,
        user_pool_config=appsync.UserPoolConfig(
            user_pool=user_pool,
        ),
    ),
)
```

### フロントエンド Amplify 設定

```typescript
Amplify.configure({
  Auth: {
    Cognito: {
      userPoolId: process.env.NEXT_PUBLIC_USER_POOL_ID!,
      userPoolClientId: process.env.NEXT_PUBLIC_USER_POOL_CLIENT_ID!,
      region: process.env.NEXT_PUBLIC_AWS_REGION!,
    },
  },
  API: {
    GraphQL: {
      endpoint: process.env.NEXT_PUBLIC_APPSYNC_ENDPOINT!,
      region: process.env.NEXT_PUBLIC_AWS_REGION!,
      defaultAuthMode: "userPool",
    },
  },
});
```

## 実装順序

1. **CDK でインフラ構築**（30分）
   - Cognito UserPool 作成
   - AppSync 認証設定変更
   - デプロイ

2. **フロントエンド基本実装**（1時間）
   - Amplify Auth 設定
   - サインアップ/ログイン画面

3. **統合テスト**（30分）
   - 登録→ログイン→会話作成の一連の流れ

4. **既存機能の調整**（30分）
   - userId の参照方法変更
   - エラーハンドリング

## 完了条件

- [ ] ユーザーがメールアドレス＋パスワードで登録できる
- [ ] メール検証が動作する
- [ ] ログイン後、既存の会話・メッセージ機能が正常に動作する
- [ ] トークンの有効期限が1時間である
- [ ] DevTools でトークン確認時、短期間で無効化されることを確認
- [ ] 既存の統合テスト（89 backend + 46 frontend）がパスする

## 参考資料

- [AWS Amplify Auth ドキュメント](https://docs.amplify.aws/react/build-a-backend/auth/set-up-auth/)
- [AppSync + Cognito 統合](https://docs.aws.amazon.com/appsync/latest/devguide/security-authz.html#amazon-cognito-user-pools-authorization)
- [CDK Cognito Construct](https://docs.aws.amazon.com/cdk/api/v2/python/aws_cdk.aws_cognito/README.html)

## リスク

- **学習コスト**: Cognito の設定に慣れていない場合、追加時間が必要
- **既存データ消失**: 開発環境のため許容範囲
- **テストの書き直し**: 認証フローが変わるため、一部テストの修正が必要

## 代替案

WAF でレート制限を追加し、API Key のままにする（非推奨）

**理由**: API Key 漏洩の根本的な解決にならない
