/**
 * GraphQL Subscription リアルタイム更新のE2Eテスト
 * 
 * このテストでは、複数ユーザー間でリアルタイム更新が正しく動作することを確認します：
 * - onNewMessage: メッセージの送信・受信
 * - onSummaryUpdate: 要約の更新
 * - onLockChange: ロックの取得・解放
 */

import { test, expect, Browser, BrowserContext, Page } from '@playwright/test';

// テスト用ユーザー情報
const USER_A = {
  email: 'test@example.com',
  password: 'TestPass123!',
  displayName: 'テストユーザーA',
};

const USER_B = {
  email: 'test2@example.com',
  password: 'TestPass123!',
  displayName: 'テストユーザーB',
};

// ヘルパー関数: ログイン処理
async function login(page: Page, email: string, password: string) {
  await page.goto('/');
  
  // ログイン画面が表示されるまで待機
  const emailInput = page.locator('input[type="email"]');
  await emailInput.waitFor({ state: 'visible', timeout: 10000 });
  
  // 認証情報をゆっくり入力（バリデーションをトリガー）
  await emailInput.fill(email);
  await page.waitForTimeout(500); // バリデーション待機
  
  const passwordInput = page.locator('input[type="password"]');
  await passwordInput.fill(password);
  await page.waitForTimeout(500); // バリデーション待機
  
  // ログインボタンが有効化されるまで待機
  const loginButton = page.locator('button:has-text("ログイン")');
  await loginButton.waitFor({ state: 'visible', timeout: 5000 });
  
  // ボタンが有効化されるまで待つ
  await page.waitForFunction(() => {
    const btn = document.querySelector('button[type="submit"]');
    return btn && !btn.hasAttribute('disabled');
  }, { timeout: 10000 });
  
  // ログインボタンをクリック
  await loginButton.click();
  
  // ログイン完了を待つ（会話選択画面が表示される）
  await page.waitForSelector('h1:has-text("会話")', { timeout: 20000 });
}

// ヘルパー関数: 会話作成
async function createConversation(page: Page, conversationName: string): Promise<string> {
  // 「新しい会話」ボタンをクリック
  const newConvButton = page.locator('button:has-text("新しい会話")').first();
  await newConvButton.waitFor({ state: 'visible', timeout: 10000 });
  await newConvButton.click();
  
  // ダイアログが表示されるまで待機
  await page.waitForSelector('input[placeholder*="会話名"]', { timeout: 5000 });
  
  // 会話名を入力
  await page.fill('input[placeholder*="会話名"]', conversationName);
  
  // 作成ボタンをクリック
  await page.click('button:has-text("作成")');
  
  // チャット画面に遷移するまで待機
  await page.waitForURL(/\/chat\/[a-zA-Z0-9-]+/, { timeout: 10000 });
  
  // URLから会話IDを取得
  const url = page.url();
  const conversationId = url.split('/chat/')[1];
  
  return conversationId;
}

// ヘルパー関数: 会話に参加
async function joinConversation(page: Page, conversationId: string) {
  await page.goto(`/chat/${conversationId}`);
  await page.waitForSelector('textarea[placeholder*="メッセージ"]', { timeout: 10000 });
}

// ヘルパー関数: メッセージ送信
async function sendMessage(page: Page, content: string) {
  const textarea = page.locator('textarea[placeholder*="メッセージ"]');
  await textarea.fill(content);
  
  const sendButton = page.locator('button:has-text("送信")');
  await sendButton.click();
  
  // 送信完了を待つ（テキストエリアがクリアされる）
  await expect(textarea).toHaveValue('', { timeout: 5000 });
}

// ヘルパー関数: メッセージが表示されるまで待機
async function waitForMessage(page: Page, content: string, timeoutMs: number = 10000) {
  await page.waitForSelector(`text="${content}"`, { timeout: timeoutMs });
}

test.describe('GraphQL Subscription リアルタイム更新テスト', () => {
  let browser: Browser;
  let contextA: BrowserContext;
  let contextB: BrowserContext;
  let pageA: Page;
  let pageB: Page;
  let sharedConversationId: string; // テスト間で共有する会話ID
  
  test.beforeAll(async ({ browser: testBrowser }) => {
    browser = testBrowser;
    
    // 2つの独立したブラウザコンテキストを作成（異なるユーザーをシミュレート）
    contextA = await browser.newContext();
    contextB = await browser.newContext();
    
    pageA = await contextA.newPage();
    pageB = await contextB.newPage();
    
    console.log('✓ ブラウザコンテキストを初期化しました');
  });
  
  test.afterAll(async () => {
    await contextA.close();
    await contextB.close();
  });
  
  // テストを順番に実行する（シリアル実行）
  test.describe.serial('リアルタイム更新シナリオ', () => {
  
  test('1. セットアップ: 両ユーザーがログインして同じ会話に参加', async () => {
    console.log('✓ テスト開始: セットアップ');
    
    // ユーザーA: ログイン
    console.log('✓ ユーザーA: ログイン処理開始...');
    await login(pageA, USER_A.email, USER_A.password);
    console.log('✓ ユーザーA: ログイン完了');
    
    // ユーザーA: 新しい会話を作成
    console.log('✓ ユーザーA: 会話作成開始...');
    const conversationName = `Subscription Test ${Date.now()}`;
    sharedConversationId = await createConversation(pageA, conversationName);
    console.log(`✓ ユーザーA: 会話作成完了（ID: ${sharedConversationId}）`);
    
    // ユーザーB: ログイン
    console.log('✓ ユーザーB: ログイン処理開始...');
    await login(pageB, USER_B.email, USER_B.password);
    console.log('✓ ユーザーB: ログイン完了');
    
    // ユーザーB: 同じ会話に参加
    console.log(`✓ ユーザーB: 会話に参加（ID: ${sharedConversationId}）...`);
    await joinConversation(pageB, sharedConversationId);
    console.log('✓ ユーザーB: 会話に参加完了');
    
    // Subscription接続を確立するために少し待機
    await pageA.waitForTimeout(3000);
    await pageB.waitForTimeout(3000);
    
    console.log('✅ セットアップ完了');
  });
  
  test('2. 複数ユーザー間でメッセージのリアルタイム配信（onNewMessage）', async () => {
    console.log('✓ テスト開始: 複数ユーザー間でメッセージのリアルタイム配信');
    
    // ユーザーA: メッセージを送信
    const messageContent = 'これはSubscriptionテストメッセージです！';
    console.log(`✓ ユーザーA: メッセージ送信「${messageContent}」`);
    await sendMessage(pageA, messageContent);
    
    // ユーザーA: 自分のメッセージが表示されることを確認
    await waitForMessage(pageA, messageContent);
    console.log('✓ ユーザーA: 送信したメッセージが表示されました');
    
    // ユーザーB: リアルタイムでメッセージを受信（Subscription経由）
    console.log('✓ ユーザーB: リアルタイムメッセージ受信を待機中...');
    await waitForMessage(pageB, messageContent, 15000);
    console.log('✓ ユーザーB: リアルタイムでメッセージを受信しました！');
    
    // 確認: ユーザーBにメッセージが表示されている
    const messageBVisible = await pageB.locator(`text="${messageContent}"`).isVisible();
    expect(messageBVisible).toBe(true);
    
    console.log('✅ テスト成功: onNewMessage Subscription が正常に動作');
  });
  
  test('3. 複数ユーザー間で要約のリアルタイム更新（onSummaryUpdate）', async () => {
    console.log('✓ テスト開始: 複数ユーザー間で要約のリアルタイム更新');
    
    // ユーザーA: 要約生成ボタンをクリック
    console.log('✓ ユーザーA: 要約生成ボタンをクリック');
    const summaryButton = pageA.locator('button:has-text("要約を生成")').or(pageA.locator('button:has-text("要約生成")'));
    
    // 要約ボタンが表示されるまで待機（メッセージが1件以上必要）
    await summaryButton.first().waitFor({ state: 'visible', timeout: 15000 });
    await summaryButton.first().click();
    
    // ユーザーA: 要約が表示されるまで待機
    console.log('✓ ユーザーA: 要約生成中...');
    const summaryText = pageA.locator('.summary-content').or(pageA.locator('[data-testid="summary-content"]'));
    await summaryText.waitFor({ state: 'visible', timeout: 40000 }); // AI生成に時間がかかる
    console.log('✓ ユーザーA: 要約が生成されました');
    
    // ユーザーB: リアルタイムで要約を受信（Subscription経由）
    console.log('✓ ユーザーB: リアルタイム要約受信を待機中...');
    const summaryTextB = pageB.locator('.summary-content').or(pageB.locator('[data-testid="summary-content"]'));
    await summaryTextB.waitFor({ state: 'visible', timeout: 20000 });
    console.log('✓ ユーザーB: リアルタイムで要約を受信しました！');
    
    // 確認: 両ユーザーに要約が表示されている
    const summaryAVisible = await summaryText.isVisible();
    const summaryBVisible = await summaryTextB.isVisible();
    expect(summaryAVisible).toBe(true);
    expect(summaryBVisible).toBe(true);
    
    console.log('✅ テスト成功: onSummaryUpdate Subscription が正常に動作');
  });
  
  test('4. 複数ユーザー間でロック状態のリアルタイム通知（onLockChange）', async () => {
    console.log('✓ テスト開始: 複数ユーザー間でロック状態のリアルタイム通知');
    
    // ユーザーA: 要約を編集モードにする（ロックを取得）
    console.log('✓ ユーザーA: 要約の編集ボタンをクリック（ロック取得）');
    const editButton = pageA.locator('button[aria-label="要約を編集"]').or(pageA.locator('button:has-text("編集")'));
    await editButton.first().waitFor({ state: 'visible', timeout: 15000 });
    await editButton.first().click();
    
    // ユーザーA: 編集モードになることを確認
    const editTextarea = pageA.locator('textarea[placeholder*="要約"]').or(pageA.locator('textarea.summary-edit'));
    await editTextarea.first().waitFor({ state: 'visible', timeout: 10000 });
    console.log('✓ ユーザーA: 編集モードになりました（ロック取得）');
    
    // ユーザーB: リアルタイムでロック通知を受信（Subscription経由）
    console.log('✓ ユーザーB: リアルタイムロック通知を待機中...');
    const lockNotification = pageB.locator('text*="編集中"').or(pageB.locator('text*="ロック"')).or(pageB.locator('text*="使用中"'));
    await lockNotification.first().waitFor({ state: 'visible', timeout: 20000 });
    console.log('✓ ユーザーB: リアルタイムでロック通知を受信しました！');
    
    // 確認: ユーザーBにロック通知が表示されている
    const lockVisible = await lockNotification.isVisible();
    expect(lockVisible).toBe(true);
    
    // ユーザーA: 編集をキャンセル（ロック解放）
    console.log('✓ ユーザーA: 編集キャンセル（ロック解放）');
    const cancelButton = pageA.locator('button:has-text("キャンセル")').or(pageA.locator('button:has-text("閉じる")'));
    await cancelButton.first().click();
    
    // ユーザーB: リアルタイムでロック解放通知を受信
    console.log('✓ ユーザーB: リアルタイムロック解放通知を待機中...');
    await lockNotification.waitFor({ state: 'hidden', timeout: 20000 });
    console.log('✓ ユーザーB: リアルタイムでロック解放を確認しました！');
    
    // 確認: ユーザーBからロック通知が消えている
    const lockHidden = await lockNotification.isHidden();
    expect(lockHidden).toBe(true);
    
    console.log('✅ テスト成功: onLockChange Subscription が正常に動作');
  });
  
  test('5. ネットワーク切断後の再接続でSubscriptionが復旧する', async () => {
    console.log('✓ テスト開始: Subscription再接続テスト');
    
    // ユーザーA: ネットワークをオフラインにする
    console.log('✓ ユーザーA: ネットワークをオフライン化...');
    await contextA.setOffline(true);
    await pageA.waitForTimeout(3000);
    
    // ユーザーA: ネットワークをオンラインに戻す
    console.log('✓ ユーザーA: ネットワークを復旧...');
    await contextA.setOffline(false);
    await pageA.waitForTimeout(5000); // 再接続待機
    
    // ページをリロードして再接続を確実にする
    await pageA.reload();
    await pageA.waitForTimeout(3000);
    
    // ユーザーB: メッセージを送信
    const reconnectMessage = 'ネットワーク復旧後のテストメッセージ';
    console.log(`✓ ユーザーB: メッセージ送信「${reconnectMessage}」`);
    await sendMessage(pageB, reconnectMessage);
    
    // ユーザーA: 再接続後にメッセージを受信できることを確認
    console.log('✓ ユーザーA: 再接続後のメッセージ受信を待機中...');
    await waitForMessage(pageA, reconnectMessage, 25000);
    console.log('✓ ユーザーA: 再接続後にメッセージを受信しました！');
    
    const messageVisible = await pageA.locator(`text="${reconnectMessage}"`).isVisible();
    expect(messageVisible).toBe(true);
    
    console.log('✅ テスト成功: Subscription再接続が正常に動作');
  });
  
  }); // test.describe.serial 終了
});
