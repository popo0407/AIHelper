---
name: git-versioning
description: GitHub バージョン管理の手順と規約
---

## GitHub バージョン管理の原則

AIエージェントがシステム変更を完了した後、Git を通じて一元管理し、人間による確認・マージを可能にする。

---

## 1. ブランチ戦略（Git Flow）

### 1.1 ブランチ種別

| ブランチ    | 用途               | 作成元  | マージ先       |
| ----------- | ------------------ | ------- | -------------- |
| `main`      | 本番環境リリース用 | -       | -              |
| `develop`   | 開発統合ブランチ   | -       | -              |
| `feature/*` | 機能開発           | develop | develop → PR   |
| `bugfix/*`  | バグ修正           | develop | develop → PR   |
| `hotfix/*`  | 緊急本番対応       | main    | main + develop |
| `release/*` | リリース準備       | develop | main + develop |

### 1.2 命名規則

```
feature/aws-cdk-integration          # 機能追加
feature/wcag-2.2-compliance          # アクセシビリティ対応

bugfix/lambda-timeout-issue          # バグ修正
bugfix/cognito-token-expiration      # 既知の問題修正

hotfix/bedrock-api-error            # 緊急対応

release/v1.2.0                       # リリース準備
```

---

## 2. コミット規約（Conventional Commits）

### 2.1 コミットメッセージフォーマット

```
<type>(<scope>): <subject>

<body>

<footer>
```

### 2.2 Type の種別

| Type       | 説明                   | 例                                          |
| ---------- | ---------------------- | ------------------------------------------- |
| `feat`     | 新機能                 | `feat(auth): add cognito integration`       |
| `fix`      | バグ修正               | `fix(lambda): resolve timeout issue`        |
| `docs`     | ドキュメント           | `docs(aws): update CDK deployment guide`    |
| `style`    | コード整形（機能なし） | `style(frontend): format TypeScript files`  |
| `refactor` | リファクタリング       | `refactor(backend): extract lambda handler` |
| `perf`     | パフォーマンス改善     | `perf(api): optimize dynamodb query`        |
| `test`     | テスト追加・修正       | `test(frontend): add wcag compliance tests` |
| `chore`    | 依存関係・設定変更     | `chore(cdk): upgrade aws-cdk-lib`           |
| `ci`       | CI/CD設定変更          | `ci: add github actions workflow`           |

### 2.3 コミットメッセージ例

```
feat(cdk): implement auto-layer versioning

- Implement CDK Layer version management
- Add automatic dependency detection
- Update Lambda functions with new layer references
- Add hash-based versioning to prevent redundant builds

Closes #123
```

### 2.4 コミットの粒度

✅ **良い例**：機能ごとに分けたコミット

```
1. feat(cdk): add lambda_stack.py scaffold
2. feat(lambda): implement auth function handler
3. feat(cdk): define api gateway integration
4. test(auth): add unit tests for auth handler
```

❌ **悪い例**：まとめすぎたコミット

```
1. feat: add entire backend with tests and deployment scripts
```

---

## 3. Pull Request（PR）ワークフロー

### 3.1 PR作成時の必須項目

````markdown
## 📝 概要

CDK統合化によるインフラストラクチャコード化を完了しました。

## 🎯 関連Issue

Closes #45, #67

## ✅ チェックリスト

- [x] ローカルでテスト実行確認
- [x] `cdk diff` で変更内容を確認
- [x] ドキュメント更新：.github/skills/aws/SKILL.md
- [x] コミットメッセージが Conventional Commits に従う
- [x] 不要なファイル（.env, node_modules等）は除外

## 📋 変更内容

### 追加

- cdk/app.py: CDKアプリケーション エントリーポイント
- cdk/lib/stacks/lambda_stack.py: Lambda統合スタック
- backend/requirements.txt: Lambda実行依存関係

### 変更

- .github/skills/aws/SKILL.md: AWS CDK規約を追加

### 削除

- deploy-all.ps1（CDKで統合）
- layer-deploy.ps1（CDKで統合）

## 🔍 テスト手順

```bash
cd cdk
cdk diff --context environment=dev
# 出力内容を確認（CloudFormationテンプレート差分）
```
````

## 🚀 デプロイ手順

```bash
cdk deploy --context environment=dev --require-approval never
```

````

### 3.2 PR レビュー項目（Reviewer チェックリスト）

- [ ] コード品質：命名規則、型定義は適切か？
- [ ] テスト：ユニットテスト、統合テストは実施されているか？
- [ ] ドキュメント：SKILL.mdや README.mdは更新されているか？
- [ ] セキュリティ：認証情報はコミットされていないか？（.gitignore確認）
- [ ] パフォーマンス：不要な依存やループはないか？
- [ ] アクセシビリティ：WCAG 2.2準拠か？（フロントエンド）
- [ ] ルール遵守：コミットメッセージは Conventional Commits か？

### 3.3 PR マージ前確認

```bash
# mainブランチに切り替え
git checkout main

# リモート更新
git fetch origin

# マージシミュレーション
git merge --no-commit --no-ff origin/feature/xxx

# 競合確認
git status

# キャンセル（問題があった場合）
git merge --abort

# 実際のマージ
git merge --ff-only origin/feature/xxx
````

---

## 4. AI エージェント の Git 作業フロー

### 4.1 タスク完了時の標準手順（推奨）

```bash
# 1. 作成・修正内容をステージ
git add .github/skills/aws/SKILL.md
git add backend/functions/auth/index.py
git add cdk/lib/stacks/lambda_stack.py

# 2. ステータス確認
git status

# 3. Conventional Commits 形式でコミット
git commit -m "feat(cdk): implement lambda stack with auto versioning

- Add PythonFunction construct for auth handler
- Implement Layer version management
- Add environment-specific configurations

Closes #123"

# 4. リモートにプッシュ
git push origin feature/lambda-stack-implementation

# 5. GitHub UI で PR 作成
# https://github.com/YOUR_ORG/YOUR_REPO/pull/new/feature/lambda-stack-implementation
```

### 4.2 タスク中の作業記録

**各タスク実行時に以下をコメント出力：**

```
[Git] Feature branch を作成：feature/wcag-2.2-compliance
[Git] 現在のブランチ：feature/wcag-2.2-compliance
[Git] 変更ファイル：.github/skills/frontend/SKILL.md
[Git] コミット予定：feat(frontend): add WCAG 2.2 compliance guidelines
```

---

## 5. .gitignore テンプレート

```
# Environment
.env
.env.local
.env.*.local

# Python
__pycache__/
*.py[cod]
*$py.class
venv/
env/
.venv

# Node.js
node_modules/
dist/
.next/
build/

# CDK
cdk.out/
.cdk.staging/

# IDE
.vscode/
.idea/
*.swp
*.swo
*~

# OS
.DS_Store
Thumbs.db

# AWS
.aws/

# Logs
*.log
npm-debug.log*
yarn-debug.log*
yarn-error.log*

# Hash files
.frontend.hash
.layer-requirements.hash
```

---

## 6. GitHub Actions ワークフロー例（CI/CD）

```yaml
# .github/workflows/deploy.yml
name: Deploy to AWS

on:
  pull_request:
    branches:
      - develop
  push:
    branches:
      - develop
      - main

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3

      - name: Set up Python
        uses: actions/setup-python@v4
        with:
          python-version: "3.12"

      - name: Install CDK dependencies
        run: |
          pip install -r cdk/requirements-cdk.txt

      - name: Run CDK Diff
        run: |
          cd cdk
          cdk diff --context environment=dev

      - name: Run Tests
        run: |
          python -m pytest backend/tests/

  deploy-dev:
    needs: test
    if: github.ref == 'refs/heads/develop' && github.event_name == 'push'
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3

      - name: Set up Python
        uses: actions/setup-python@v4
        with:
          python-version: "3.12"

      - name: Configure AWS credentials
        uses: aws-actions/configure-aws-credentials@v2
        with:
          aws-access-key-id: ${{ secrets.AWS_ACCESS_KEY_ID }}
          aws-secret-access-key: ${{ secrets.AWS_SECRET_ACCESS_KEY }}
          aws-region: ap-northeast-1

      - name: Deploy to Dev
        run: |
          pip install -r cdk/requirements-cdk.txt
          cd cdk
          cdk deploy --context environment=dev --require-approval never
```

---

## 7. リリース手順

### 7.1 リリースブランチ作成

```bash
# develop から release ブランチを作成
git checkout develop
git pull origin develop
git checkout -b release/v1.2.0

# バージョン番号を更新
# package.json, cdk.json, README.md 等のバージョン更新

git commit -m "chore(release): bump version to v1.2.0"
git push origin release/v1.2.0
```

### 7.2 main へのマージとタグ作成

```bash
# main にマージ
git checkout main
git pull origin main
git merge release/v1.2.0

# タグを作成
git tag -a v1.2.0 -m "Release v1.2.0: Add WCAG 2.2 compliance and CDK integration"
git push origin main
git push origin v1.2.0

# develop へも戻す
git checkout develop
git merge main
git push origin develop
```

### 7.3 リリースノート作成

GitHub UI でリリースを作成：

```
# v1.2.0 Release Notes

## 🎉 新機能
- WCAG 2.2 準拠のアクセシビリティ実装
- AWS CDK によるインフラストラクチャコード化
- Lambda Layer の自動バージョン管理

## 🐛 バグ修正
- Cognito トークン有効期限の問題を解決
- API Gateway のCORSエラーを修正

## 📚 その他
- CDK テンプレートのドキュメント追加
- Retrofit test suite で網羅率が 95% に到達

## ⚠️ Breaking Changes
なし
```

---

## 8. トラブルシューティング

### 8.1 競合（Conflict）が発生

```bash
# 競合ファイルを確認
git status

# エディタで手動解決
# または開発リーダーに相談

# 解決後
git add <resolved-file>
git commit -m "chore: resolve merge conflict"
```

### 8.2 誤ったコミットをプッシュ

```bash
# プッシュ前：直前のコミット修正
git commit --amend

# プッシュ後（develop など共有ブランチの場合）
# → 新しいコミットで修正する（revert 使用）
git revert <commit-hash>
git commit -m "revert: undo incorrect changes"
git push origin develop
```

### 8.3 main に誤ってプッシュ

1. リポジトリ管理者に通知
2. GitHub UI で Revert PR を作成
3. ホットフィックスで対応

---

## 9. チェックリスト（タスク完了時）

- [ ] ローカルで動作確認した
- [ ] `git status` で不要なファイルがないか確認
- [ ] コミットメッセージが Conventional Commits か
- [ ] `.github/skills/*.md` を更新した
- [ ] `README.md` を更新した（含）
- [ ] 機能ブランチから develop ブランチへ PR を作成した
- [ ] PR テンプレートは埋められたか
- [ ] CI が成功したか（全テスト合格）
- [ ] コードレビュー指摘に対応したか
- [ ] マージ前に develop ブランチが最新か確認した
