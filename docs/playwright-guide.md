# PlayWright MCP セットアップガイド

## 🎯 概要

GitHub CopilotがPlayWrightを使用したE2Eテストを自動生成・支援できるようになりました。このガイドではセットアップと使用方法を説明します。

## ✅ 完了したセットアップ

### 1. PlayWrightのインストール
```bash
# frontendディレクトリに @playwright/test をインストール済み
npm install -D @playwright/test
```

### 2. PlayWright設定ファイル
- [playwright.config.ts](../frontend/playwright.config.ts) を作成完了
- 対応ブラウザ：Chromium、Firefox、WebKit
- モバイルテスト対応：Pixel 5、iPhone 12
- ローカルdesserverの自動起動設定（http://localhost:3000）

### 3. ブラウザのインストール
```bash
# 実行済み: Chromium、Firefox、WebKitをローカルにインストール
npx playwright install
```

### 4. E2Eテストサンプル
- [e2e/login.spec.ts](../frontend/e2e/login.spec.ts) を作成完了
- ログイン画面のUIテストを7個実装
- 各テストは独立して実行可能

### 5. VSCode設定
- [.vscode/settings.json](.vscode/settings.json) を更新
- テスト実行UI設定を追加
- TypeScript/JavaScriptフォーマット設定を追加

## 🚀 使用方法

### 基本的なテスト実行

```bash
cd frontend

# ヘッドレスモードで全テストを実行
npm run e2e

# UIモード（対話的にテストを実行・デバッグ）
npm run e2e:ui

# デバッグモード（ブレークポイント設定可能）
npm run e2e:debug

# 特定のブラウザでテスト実行
npm run e2e:chromium
npm run e2e:firefox
npm run e2e:webkit

# ブラウザを表示してテスト実行（headed mode）
npm run e2e:headed
```

## 🤖 Copilot Chat での使用方法

### テストコード自動生成

Copilot Chatで以下のようなプロンプトを入力すると、PlayWrightのテストコードを自動生成してくれます：

**プロンプト例：**
```
「ログイン機能のE2EテストをPlayWrightで書いてください。
以下の動作をテストしてください：
1. ログインフォームが表示される
2. メールアドレスとパスワードを入力できる
3. ログインボタンをクリックするとチャット画面にナビゲートされる」
```

**Copilotが提案してくれること：**
- ページ要素のロケーター定義
- ユーザーインタラクションのテストコード
- エラーハンドリング
- アサーション（検証）
- 非同期処理の適切な待機

### テストデバッグ支援

失敗したテストについて、Copilot Chatで以下のように質問できます：

```
「このE2Eテストが失敗しています：
[テストコードを貼り付け]
[エラーメッセージを貼り付け]

原因を分析して、修正方法を教えてください。」
```

## 📂 プロジェクト構成

```
frontend/
├── playwright.config.ts          # PlayWright設定ファイル
├── e2e/
│   └── login.spec.ts            # ログイン画面のE2Eテスト
├── package.json                  # 新しいスクリプト追加済み
└── [その他のフロントエンドファイル]
```

## 🔧 E2Eテスト作成のベストプラクティス

### 1. テスト命名規則
```typescript
test.describe('機能名 E2Eテスト', () => {
  test('動作説明を日本語で記述', async ({ page }) => {
    // テスト実装
  });
});
```

### 2. ページ要素のロケーター
```typescript
// data-testid 属性を使用（最も推奨）
page.locator('[data-testid="login-form"]')

// 通常のセレクター
page.locator('input[type="email"]')
page.locator('button:has-text("ログイン")')

// Role-based selector（アクセシビリティを考慮）
page.locator('role=button[name="ログイン"]')
```

### 3. 待機・タイムアウト
```typescript
// 要素が表示されるまで待機（デフォルト30秒）
await expect(element).toBeVisible();

// ナビゲーション完了を待機
await page.waitForURL('/chat');

// カスタムタイムアウト
await expect(element).toBeVisible({ timeout: 5000 });
```

### 4. テストデータ
```typescript
// テスト用認証情報（.env.localで管理推奨）
const testUser = {
  email: 'test@example.com',
  password: 'TestPassword123!'
};
```

## 📊 テストレポート

PlayWrightはテスト実行後、HTMLレポートを自動生成します：

```bash
# テスト実行後、以下でレポートを開く
npx playwright show-report
```

レポートには以下が含まれます：
- テスト結果（成功/失敗）
- スクリーンショット（失敗時のみ）
- トレース情報（ビデオ）
- テスト実行時間

## 🐛 トラブルシューティング

### 1. ブラウザが見つからないエラー
```bash
# ブラウザを再インストール
npx playwright install
```

### 2. ポート競合エラー
```
⚠ Port 3000 is in use, trying 3001 instead.
```
→ playwright.config.ts で自動的に別ポートを使用しています。

### 3. テスト失敗時
- `npm run e2e:ui` で対話的にデバッグ
- `npm run e2e:debug` で詳細なデバッグ情報を表示
- スクリーンショットとトレース情報を確認

## 📚 参考資料

- [PlayWright 公式ドキュメント](https://playwright.dev/)
- [PlayWright API リファレンス](https://playwright.dev/docs/api/class-playwright)
- [ベストプラクティス](https://playwright.dev/docs/best-practices)

## 🎓 次のステップ

1. **既存コンポーネントへのdata-testid属性追加**
   - LoginScreen.tsx
   - ChatsScreen.tsx
   - その他のUIコンポーネント

2. **より多くのE2Eテストを作成**
   - チャット送信機能
   - 会話選択・管理機能
   - AI補助機能

3. **CI/CDパイプラインへの統合**
   - プルリクエスト時の自動テスト実行
   - デプロイ前品質ゲート

4. **ビジュアルレグレッションテスト**
   - UIの予期しない変化を検出

---

**セットアップ完了日時：** 2026年2月14日
**PlayWrightバージョン：** @playwright/test@latest
