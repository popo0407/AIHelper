# CDK デプロイ手順書

## 前提条件

1. **AWS CLI** がインストールされ、認証情報が設定済み

   ```bash
   aws configure
   # AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, Region: ap-northeast-1
   ```

2. **AWS CDK CLI** がインストール済み

   ```bash
   npm install -g aws-cdk
   cdk --version
   ```

3. **Python 依存関係** がインストール済み
   ```bash
   pip install -r cdk/requirements-cdk.txt
   ```

---

## Dev 環境デプロイ手順

### 1. CDK Bootstrap（初回のみ）

```bash
cd cdk
cdk bootstrap --context environment=dev
```

### 2. 差分確認

```bash
cdk diff --context environment=dev
```

### 3. デプロイ実行

```bash
cdk deploy --all --context environment=dev --require-approval never
```

### 4. デプロイ出力の確認

デプロイ完了後、以下の出力値を取得:

- `GraphqlApiUrl` — AppSync エンドポイント URL
- `GraphqlApiKey` — AppSync API キー
- `GraphqlApiId` — AppSync API ID

### 5. フロントエンド環境変数の設定

取得した値を `frontend/.env.local` に設定:

```bash
NEXT_PUBLIC_APPSYNC_ENDPOINT=<GraphqlApiUrl の値>
NEXT_PUBLIC_APPSYNC_API_KEY=<GraphqlApiKey の値>
NEXT_PUBLIC_AWS_REGION=ap-northeast-1
```

### 6. フロントエンド起動

```bash
cd frontend
npm run dev
```

---

## スタック構成

| スタック名            | リソース                                                             |
| --------------------- | -------------------------------------------------------------------- |
| `aichat-dev-database` | DynamoDB 5 テーブル (Users, Messages, Summary, Locks, Conversations) |
| `aichat-dev-lambda`   | Lambda 6 関数 + 共通レイヤー + IAM ロール                            |
| `aichat-dev-appsync`  | AppSync GraphQL API + Lambda リゾルバー                              |

## コスト注意事項

- DynamoDB: PAY_PER_REQUEST（オンデマンド）→ 使用量に応じた課金
- Lambda: リクエストベース課金
- AppSync: リクエスト + リアルタイム接続ベース課金
- **Bedrock**: `USE_MOCK_AI=true` (dev) でモック → 実際の AI 呼び出しなし
- dev 環境の`RemovalPolicy`は`DESTROY` → スタック削除時にすべてのリソースが削除される

## スタック削除

```bash
cdk destroy --all --context environment=dev
```
