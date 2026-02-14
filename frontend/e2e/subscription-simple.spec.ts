/**
 * GraphQL Subscription - 簡易リアルタイム更新テスト
 * 
 * 複数ブラウザで同じ会話を開き、メッセージがリアルタイムに同期されることを確認
 */

import { test, expect } from '@playwright/test';

const USER_A = {
  email: 'test@example.com',
  password: 'TestPass123!',
};

const USER_B = {
  email: 'test2@example.com',
  password: 'TestPass123!',
};

test.describe('Subscription リアルタイム更新（簡易版）', () => {
  
  test('メッセージのリアルタイム配信テストト', async ({ browser }) => {
    // 2つのブラウザコンテキストで異なるユーザーをシミュレート
    const contextA = await browser.newContext();
    const contextB = await browser.newContext();
    
    const pageA = await contextA.newPage();
    const pageB = await contextB.newPage();
    
    console.log('\n=== ユーザーA: ログイン ===');
    await pageA.goto('/');
    await pageA.waitForLoadState('networkidle');
    
    await pageA.fill('input[type="email"]', USER_A.email);
    await pageA.waitForTimeout(300);
    await pageA.fill('input[type="password"]', USER_A.password);
    await pageA.waitForTimeout(300);
    
    // ログインボタンが有効になるまで待つ
    const loginButtonA = pageA.locator('button[type="submit"]').first();
    await loginButtonA.click();
    console.log('ログインボタンをクリック');
    
    // ログイン処理完了を待つ
    await pageA.waitForTimeout(5000);
    await pageA.waitForLoadState('networkidle');
    console.log('✅ ユーザーA: ログイン成功\n');
    
    // スクリーンショット
    await pageA.screenshot({ path: 'test-results/userA-conversation-list.png', fullPage: true });
    
    console.log('=== ユーザーA: 新しい会話を作成 ===');
    const newConvButton = pageA.locator('button:has-text("新しい会話")');
    await newConvButton.waitFor({ state: 'visible', timeout: 15000 });
    await newConvButton.click();
    console.log('「新しい会話」ボタンをクリック');
    
    // 会話作成完了を待つ
    await pageA.waitForTimeout(3000);
    await pageA.waitForLoadState('networkidle');
    
    // チャット画面に遷移したか確認
    await pageA.waitForSelector('textarea[placeholder*="メッセージ"], input[placeholder*="メッセージ"]', { timeout: 15000 });
    
    const conversationId = pageA.url().split('/chat/')[1]?.split('?')[0] || '';
    console.log(`✅ 会話ID: ${conversationId}\n`);
    
    // メッセージ入力欄が表示されるまで待機
    await pageA.waitForSelector('textarea[placeholder*="メッセージ"]', { timeout: 10000 });
    await pageA.screenshot({ path: 'test-results/userA-chat-screen.png' });
    
    console.log('=== ユーザーB: ログインして同じ会話に参加 ===');
    await pageB.goto('/');
    await pageB.waitForLoadState('networkidle');
    
    await pageB.fill('input[type="email"]', USER_B.email);
    await pageB.waitForTimeout(300);
    await pageB.fill('input[type="password"]', USER_B.password);
    await pageB.waitForTimeout(300);
    
    const loginButtonB = pageB.locator('button[type="submit"]').first();
    await loginButtonB.click();
    console.log('ログインボタンをクリック');
    
    await pageB.waitForTimeout(5000);
    await pageB.waitForLoadState('networkidle');
    console.log('✅ ユーザーB: ログイン成功\n');
    
    // 直接会話URLに遷移
    await pageB.goto(`/chat/${conversationId}`);
    await pageB.waitForSelector('textarea[placeholder*="メッセージ"]', { timeout: 15000 });
    console.log('✅ ユーザーB: 会話に参加\n');
    await pageB.screenshot({ path: 'test-results/userB-chat-screen.png' });
    
    // Subscription接続を確立するために少し待機
    await pageA.waitForTimeout(3000);
    await pageB.waitForTimeout(3000);
    console.log('Subscription接続を確立しました\n');
    
    console.log('=== ユーザーA: メッセージを送信 ===');
    const testMessage = `リアルタイムテスト ${Date.now()}`;
    await pageA.fill('textarea[placeholder*="メッセージ"]', testMessage);
    await pageA.click('button:has-text("送信")');
    console.log(`メッセージ送信: "${testMessage}"`);
    
    // ユーザーA: 自分のメッセージが表示されることを確認
    await pageA.waitForSelector(`text="${testMessage}"`, { timeout: 10000 });
    console.log('✅ ユーザーA: 送信メッセージが表示されました\n');
    
    console.log('=== ユーザーB: リアルタイムメッセージ受信を待機 ===');
    // ユーザーB: Subscription経由でメッセージを受信
    await pageB.waitForSelector(`text="${testMessage}"`, { timeout: 20000 });
    console.log('✅ ユーザーB: リアルタイムでメッセージを受信しました！\n');
    
    // スクリーンショット
    await pageA.screenshot({ path: 'test-results/userA-message-sent.png' });
    await pageB.screenshot({ path: 'test-results/userB-message-received.png' });
    
    // 確認
    const messageAVisible = await pageA.locator(`text="${testMessage}"`).isVisible();
    const messageBVisible = await pageB.locator(`text="${testMessage}"`).isVisible();
    
    expect(messageAVisible).toBe(true);
    expect(messageBVisible).toBe(true);
    
    console.log('✅✅✅ テスト成功: onNewMessage Subscription が正常に動作！\n');
    
    // クリーンアップ
    await contextA.close();
    await contextB.close();
  });
});
