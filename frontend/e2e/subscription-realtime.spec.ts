/**
 * GraphQL Subscription リアルタイム更新のE2Eテスト
 *
 * 前提条件:
 *   1. Next.js 開発サーバーが起動していること (npm run dev)
 *   2. AWS AppSync バックエンドがデプロイ済みであること
 *   3. テスト用ユーザーが Cognito に登録済みであること
 *      - User A: test@example.com / TestPass123!
 *      - User B: test2@example.com / TestPass123!
 *
 * 実行方法:
 *   npx playwright test e2e/subscription-realtime.spec.ts --project=chromium
 *
 * ⚠ このテストは実際のバックエンド接続が必要なため、CI では自動実行されません。
 *   ローカルの統合テストとして使用してください。
 */

import { test, expect, BrowserContext, Page } from '@playwright/test';

// テスト用ユーザー情報
const USER_A = {
  email: 'test@example.com',
  password: 'TestPass123!',
};

const USER_B = {
  email: 'test2@example.com',
  password: 'TestPass123!',
};

/**
 * ログインヘルパー
 * - conversation-features.spec.ts と同じセレクターパターンを使用
 */
async function loginUser(page: Page, email: string, password: string): Promise<void> {
  await page.goto('/');
  await page.waitForLoadState('networkidle');

  // メール・パスワード入力
  const emailInput = page.locator('input[type="email"]');
  await emailInput.waitFor({ state: 'visible', timeout: 10000 });
  await emailInput.fill(email);

  const passwordInput = page.locator('input[type="password"]').first();
  await passwordInput.fill(password);

  // ログインボタンをクリック
  const loginButton = page.locator('button[type="submit"]').first();
  await loginButton.click();

  // ログイン完了待機 - 会話一覧画面が表示されるまで
  await page.waitForTimeout(5000);
  await page.waitForLoadState('networkidle');
}

/**
 * 新しい会話を作成して会話IDを返す
 */
async function createNewConversation(page: Page): Promise<string> {
  // 「新しい会話を作成」ボタンをクリック
  const newConvBtn = page.locator('button:has-text("新しい会話を作成")');
  await newConvBtn.waitFor({ state: 'visible', timeout: 15000 });
  await newConvBtn.click();

  // チャット画面への遷移を待機
  await page.waitForTimeout(3000);
  await page.waitForLoadState('networkidle');

  // メッセージ入力欄が表示されることを確認
  await page.waitForSelector('textarea[aria-label="メッセージ入力"]', {
    timeout: 15000,
  });

  // URL またはページ情報から会話IDを取得する（アプリが SPA の場合）
  const url = page.url();
  // URL にパスがある場合は取得を試みる
  const match = url.match(/[?&]cid=([^&]+)/);
  return match ? match[1] : `test-conv-${Date.now()}`;
}

/**
 * メッセージ送信ヘルパー
 */
async function sendChatMessage(page: Page, content: string): Promise<void> {
  const textarea = page.locator('textarea[aria-label="メッセージ入力"]');
  await textarea.fill(content);

  const sendBtn = page.locator('button[aria-label="メッセージを送信"]');
  await sendBtn.click();

  // 送信完了（テキストエリアがクリアされる）を待つ
  await expect(textarea).toHaveValue('', { timeout: 5000 });
}

// ────────────────────────────────────────
// テスト本体
// ────────────────────────────────────────

test.describe('GraphQL Subscription リアルタイム更新テスト', () => {
  // このテストはローカル統合テスト用。CI ではスキップ。
  test.skip(!!process.env.CI, 'CI環境ではスキップ（バックエンド接続が必要）');

  let contextA: BrowserContext;
  let contextB: BrowserContext;
  let pageA: Page;
  let pageB: Page;

  test.beforeAll(async ({ browser }) => {
    // 2つの独立したコンテキスト（セッション分離）
    contextA = await browser.newContext();
    contextB = await browser.newContext();
    pageA = await contextA.newPage();
    pageB = await contextB.newPage();
  });

  test.afterAll(async () => {
    await contextA?.close();
    await contextB?.close();
  });

  test.describe.serial('リアルタイム同期シナリオ', () => {
    test('セットアップ: 両ユーザーがログインして同じ会話に参加', async () => {
      // ユーザーA: ログイン
      await loginUser(pageA, USER_A.email, USER_A.password);
      await pageA.screenshot({ path: 'test-results/sub-userA-loggedin.png' });

      // ユーザーA: 新しい会話を作成
      await createNewConversation(pageA);
      await pageA.screenshot({ path: 'test-results/sub-userA-chat.png' });

      // 会話のリンクをコピーする代わりに、ユーザーBにも同じURLを共有
      const chatUrl = pageA.url();

      // ユーザーB: ログイン
      await loginUser(pageB, USER_B.email, USER_B.password);
      await pageB.screenshot({ path: 'test-results/sub-userB-loggedin.png' });

      // ユーザーB: ユーザーAが作成した会話と同じ画面に遷移
      await pageB.goto(chatUrl);
      await pageB.waitForTimeout(3000);
      await pageB.waitForLoadState('networkidle');
      await pageB.screenshot({ path: 'test-results/sub-userB-chat.png' });

      // Subscription 接続確立を待機
      await pageA.waitForTimeout(2000);
      await pageB.waitForTimeout(2000);
    });

    test('onNewMessage: メッセージのリアルタイム配信', async () => {
      const testMsg = `リアルタイムテスト ${Date.now()}`;

      // ユーザーA がメッセージ送信
      await sendChatMessage(pageA, testMsg);

      // ユーザーA の画面にメッセージが表示
      await expect(pageA.locator(`text="${testMsg}"`)).toBeVisible({
        timeout: 10000,
      });

      // ユーザーB の画面でもリアルタイムに受信（Subscription 経由）
      await expect(pageB.locator(`text="${testMsg}"`)).toBeVisible({
        timeout: 20000,
      });

      await pageA.screenshot({ path: 'test-results/sub-msg-sent.png' });
      await pageB.screenshot({ path: 'test-results/sub-msg-received.png' });
    });

    test('onLockChange: 編集ロックのリアルタイム通知', async () => {
      // ユーザーA が要約を編集モードにする（ロック取得）
      const editBtn = pageA.locator('button[aria-label="要約を編集"]');
      // 編集ボタンが存在する場合のみテスト実行
      const editBtnVisible = await editBtn.isVisible().catch(() => false);
      if (!editBtnVisible) {
        test.skip(true, '要約編集ボタンが表示されていないためスキップ');
        return;
      }

      await editBtn.click();

      // ユーザーA: 編集モード確認
      const editTextarea = pageA.locator('textarea[aria-label="要約を編集"]');
      await expect(editTextarea).toBeVisible({ timeout: 10000 });

      // ユーザーB: ロック通知を受信
      const lockNotice = pageB.locator('text=/編集中|思考中/');
      await expect(lockNotice).toBeVisible({ timeout: 15000 });

      // ユーザーA: キャンセルしてロック解放
      const cancelBtn = pageA.locator('button[aria-label="編集をキャンセル"]');
      await cancelBtn.click();

      // ユーザーB: ロック通知が消える
      await expect(lockNotice).toBeHidden({ timeout: 15000 });

      await pageB.screenshot({ path: 'test-results/sub-lock-released.png' });
    });

    test('双方向メッセージ: ユーザーBからAへの逆方向送信', async () => {
      const reverseMsg = `逆方向テスト ${Date.now()}`;

      // ユーザーB がメッセージ送信
      await sendChatMessage(pageB, reverseMsg);

      // ユーザーB の画面にメッセージが表示
      await expect(pageB.locator(`text="${reverseMsg}"`)).toBeVisible({
        timeout: 10000,
      });

      // ユーザーA の画面でもリアルタイムに受信
      await expect(pageA.locator(`text="${reverseMsg}"`)).toBeVisible({
        timeout: 20000,
      });

      await pageA.screenshot({ path: 'test-results/sub-reverse-received.png' });
      await pageB.screenshot({ path: 'test-results/sub-reverse-sent.png' });
    });
  });
});
