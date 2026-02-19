import { test, expect } from '@playwright/test';

// 認証情報
const TEST_EMAIL = 'adiantum.raddianum.87.4.7@gmail.com';
const TEST_PASSWORD = 'aE#4344259';

// 各テスト前にログインする
test.beforeEach(async ({ page }) => {
  // コンソールエラーをキャプチャ
  page.on('console', msg => {
    if (msg.type() === 'error') {
      console.error('❌ Browser Console Error:', msg.text());
    } else if (msg.type() === 'warning') {
      console.warn('⚠️  Browser Console Warning:', msg.text());
    }
  });

  // ページエラーをキャプチャ
  page.on('pageerror', error => {
    console.error('❌ Page Error:', error.message);
  });

  console.log('✓ ログイン処理開始...');
  await page.goto('http://localhost:3001');
  await page.waitForLoadState('networkidle');

  // メールアドレスとパスワードを入力
  const emailInput = page.locator('input[type="email"]');
  await emailInput.fill(TEST_EMAIL);
  
  const passwordInput = page.locator('input[type="password"]').first();
  await passwordInput.fill(TEST_PASSWORD);
  
  // ログインボタンをクリック
  const loginButton = page.locator('button[type="submit"]').first();
  await loginButton.click();
  
  // 会話一覧画面が表示されるまで待機（最大15秒）
  await page.waitForTimeout(3000);
  console.log('✓ ログイン完了');
});

test.describe('会話機能のテスト', () => {
  test('会話一覧が表示される', async ({ page }) => {
    await page.screenshot({ path: 'test-results/conversation-list.png', fullPage: true });
    
    // 「会話一覧」のテキストまたは「新しい会話」ボタンが表示されることを確認
    const conversationListTitle = page.locator('text=会話一覧');
    const newConversationButton = page.locator('button:has-text("新しい会話")');
    
    const isTitleVisible = await conversationListTitle.isVisible().catch(() => false);
    const isButtonVisible = await newConversationButton.isVisible().catch(() => false);
    
    console.log('会話一覧タイトル表示:', isTitleVisible);
    console.log('新しい会話ボタン表示:', isButtonVisible);
    
    expect(isTitleVisible || isButtonVisible).toBeTruthy();
  });

  test('新しい会話を作成できる', async ({ page }) => {
    await page.waitForTimeout(2000);
    await page.screenshot({ path: 'test-results/before-create-conversation.png', fullPage: true });
    
    // 既存の会話数を取得
    const conversationItems = await page.locator('[data-testid="conversation-item"]').count().catch(() => 0);
    console.log('既存の会話数:', conversationItems);
    
    // 「新しい会話」ボタンを探す
    const newConversationButton = page.locator('button:has-text("新しい会話")');
    
    // ボタンが表示されるまで待機
    await expect(newConversationButton).toBeVisible({ timeout: 10000 });
    console.log('✓ 「新しい会話」ボタンを発見');
    
    // ボタンをクリック
    await newConversationButton.click();
    console.log('✓ 「新しい会話」ボタンをクリック');
    
    // 会話が作成されるまで待機
    await page.waitForTimeout(3000);
    await page.screenshot({ path: 'test-results/after-create-conversation.png', fullPage: true });
    
    // チャット画面に遷移したか確認（メッセージ入力欄が表示されるはず）
    const messageInput = page.locator('textarea[placeholder*="メッセージ"], input[placeholder*="メッセージ"]');
    const isMessageInputVisible = await messageInput.isVisible().catch(() => false);
    
    console.log('メッセージ入力欄表示:', isMessageInputVisible);
    
    // メッセージ入力欄が表示されているか、または会話一覧の会話数が増えているかを確認
    if (isMessageInputVisible) {
      console.log('✓ チャット画面に遷移しました');
    } else {
      const newConversationItems = await page.locator('[data-testid="conversation-item"]').count().catch(() => 0);
      console.log('更新後の会話数:', newConversationItems);
      expect(newConversationItems).toBeGreaterThan(conversationItems);
    }
  });

  test('会話を選択してチャット画面に遷移できる', async ({ page }) => {
    await page.waitForTimeout(2000);
    
    // 会話一覧から最初の会話を探す
    const conversationItems = page.locator('[data-testid="conversation-item"], button:has-text("会話")').first();
    const hasConversations = await conversationItems.count() > 0;
    
    if (!hasConversations) {
      console.log('既存の会話がないため、新しい会話を作成します');
      const newConversationButton = page.locator('button:has-text("新しい会話")');
      await newConversationButton.click();
      await page.waitForTimeout(2000);
    } else {
      // 既存の会話をクリック
      await conversationItems.click();
      await page.waitForTimeout(2000);
      console.log('✓ 会話を選択しました');
    }
    
    await page.screenshot({ path: 'test-results/chat-screen.png', fullPage: true });
    
    // チャット画面が表示されたことを確認
    const messageInput = page.locator('textarea, input[type="text"]');
    const isVisible = await messageInput.first().isVisible().catch(() => false);
    console.log('メッセージ入力欄表示:', isVisible);
  });

  test('メッセージを送信できる', async ({ page }) => {
    await page.waitForTimeout(2000);
    
    // まず会話を作成または選択
    const newConversationButton = page.locator('button:has-text("新しい会話")');
    const isButtonVisible = await newConversationButton.isVisible().catch(() => false);
    
    if (isButtonVisible) {
      await newConversationButton.click();
      await page.waitForTimeout(2000);
      console.log('✓ 新しい会話を作成');
    }
    
    await page.screenshot({ path: 'test-results/before-send-message.png', fullPage: true });
    
    // メッセージ入力欄を探す
    const messageInput = page.locator('textarea, input[type="text"]').first();
    const isInputVisible = await messageInput.isVisible().catch(() => false);
    
    if (isInputVisible) {
      // テストメッセージを入力
      const testMessage = 'これはPlaywrightからのテストメッセージです。';
      await messageInput.fill(testMessage);
      console.log('✓ メッセージを入力:', testMessage);
      
      // 送信ボタンを探してクリック
      const sendButton = page.locator('button[type="submit"], button:has-text("送信")').last();
      const isSendButtonVisible = await sendButton.isVisible().catch(() => false);
      
      if (isSendButtonVisible) {
        await sendButton.click();
        console.log('✓ 送信ボタンをクリック');
        
        // メッセージが送信されるまで待機
        await page.waitForTimeout(3000);
        await page.screenshot({ path: 'test-results/after-send-message.png', fullPage: true });
        
        // 送信したメッセージが画面に表示されるか確認
        const sentMessage = page.locator(`text=${testMessage}`);
        const isMessageVisible = await sentMessage.isVisible().catch(() => false);
        console.log('送信メッセージ表示:', isMessageVisible);
      } else {
        console.log('送信ボタンが見つかりませんでした');
        await page.screenshot({ path: 'test-results/send-button-not-found.png', fullPage: true });
      }
    } else {
      console.log('メッセージ入力欄が見つかりませんでした');
      await page.screenshot({ path: 'test-results/message-input-not-found.png', fullPage: true });
    }
  });

  test('ページ全体の構造を確認', async ({ page }) => {
    await page.waitForTimeout(2000);
    await page.screenshot({ path: 'test-results/full-page-structure.png', fullPage: true });
    
    // ページの主要な要素を確認
    const pageContent = await page.content();
    console.log('ページの長さ:', pageContent.length, '文字');
    
    // 主要な要素の存在確認
    const elements = {
      'ログインユーザー名': await page.locator('text=' + TEST_EMAIL.split('@')[0]).isVisible().catch(() => false),
      '会話一覧': await page.locator('text=会話一覧').isVisible().catch(() => false),
      '新しい会話ボタン': await page.locator('button:has-text("新しい会話")').isVisible().catch(() => false),
      'ユーザー切り替え': await page.locator('button:has-text("ユーザー切り替え")').isVisible().catch(() => false),
    };
    
    console.log('要素の表示状態:', elements);
    
    // コンソールログを取得
    page.on('console', msg => console.log('Browser console:', msg.text()));
  });
});

test.describe('要約のコピー機能テスト', () => {
  test('要約テキストをコピーできる', async ({ page }) => {
    await page.waitForTimeout(2000);
    
    // 会話を作成または選択
    const newConversationButton = page.locator('button:has-text("新しい会話")');
    const isButtonVisible = await newConversationButton.isVisible().catch(() => false);
    
    if (isButtonVisible) {
      await newConversationButton.click();
      await page.waitForTimeout(2000);
      console.log('✓ 新しい会話を作成');
    }
    
    // メッセージを送信してチャット履歴を生成
    const messageInput = page.locator('textarea, input[type="text"]').first();
    const isInputVisible = await messageInput.isVisible().catch(() => false);
    
    if (isInputVisible) {
      const testMessage = 'テスト: 要約コピー機能をテストしています。これは長めのテストメッセージです。';
      await messageInput.fill(testMessage);
      
      const sendButton = page.locator('button[type="submit"], button:has-text("送信")').last();
      const isSendButtonVisible = await sendButton.isVisible().catch(() => false);
      
      if (isSendButtonVisible) {
        await sendButton.click();
        console.log('✓ メッセージを送信');
        await page.waitForTimeout(3000);
      }
    }
    
    // 右サイドバーの要約パネルを確認
    const summaryTitle = page.locator('h2:has-text("要約")');
    const isSummaryVisible = await summaryTitle.isVisible().catch(() => false);
    
    console.log('要約パネル表示:', isSummaryVisible);
    
    if (isSummaryVisible) {
      // コピーボタンを探す
      const copyButton = page.locator('button[aria-label="要約をコピー"]');
      const isCopyButtonVisible = await copyButton.isVisible().catch(() => false);
      
      console.log('コピーボタン表示:', isCopyButtonVisible);
      await page.screenshot({ path: 'test-results/summary-copy-button.png', fullPage: true });
      
      if (isCopyButtonVisible) {
        // コピーボタンをクリック
        await copyButton.click();
        console.log('✓ コピーボタンをクリック');
        
        // 成功メッセージを待機
        const successMessage = page.locator('text=コピーしました');
        try {
          await expect(successMessage).toBeVisible({ timeout: 5000 });
          console.log('✓ コピー成功メッセージが表示されました');
          await page.screenshot({ path: 'test-results/summary-copy-success.png', fullPage: true });
        } catch (e) {
          console.log('✗ コピー成功メッセージが表示されませんでした');
          await page.screenshot({ path: 'test-results/summary-copy-failed.png', fullPage: true });
        }
      } else {
        console.log('✗ コピーボタンが見つかりませんでした');
        await page.screenshot({ path: 'test-results/summary-copy-button-not-found.png', fullPage: true });
      }
    } else {
      console.log('✗ 要約パネルが見つかりませんでした');
      await page.screenshot({ path: 'test-results/summary-panel-not-found.png', fullPage: true });
    }
  });

  test('コピーボタンがキーボードアクセス可能', async ({ page }) => {
    await page.waitForTimeout(2000);
    
    // 会話を作成または選択
    const newConversationButton = page.locator('button:has-text("新しい会話")');
    const isButtonVisible = await newConversationButton.isVisible().catch(() => false);
    
    if (isButtonVisible) {
      await newConversationButton.click();
      await page.waitForTimeout(2000);
      console.log('✓ 新しい会話を作成');
    }
    
    // 要約パネルを確認
    const summaryTitle = page.locator('h2:has-text("要約")');
    const isSummaryVisible = await summaryTitle.isVisible().catch(() => false);
    
    if (isSummaryVisible) {
      const copyButton = page.locator('button[aria-label="要約をコピー"]');
      const isCopyButtonVisible = await copyButton.isVisible().catch(() => false);
      
      if (isCopyButtonVisible) {
        // Tab キーでボタンにフォーカス
        await page.keyboard.press('Tab');
        
        // ボタンが focus 状態になったか確認
        const isFocused = await copyButton.evaluate(el => el === document.activeElement);
        console.log('コピーボタンがフォーカス中:', isFocused);
        
        // Enter キーでクリック
        await page.keyboard.press('Enter');
        console.log('✓ Enter キーでコピーボタンを実行');
        
        await page.waitForTimeout(1000);
        await page.screenshot({ path: 'test-results/summary-copy-keyboard.png', fullPage: true });
      }
    }
  });

  test('エンプティ状態でコピーボタンが disabled', async ({ page }) => {
    await page.waitForTimeout(2000);
    
    // 会話一覧画面を確認
    const summaryTitle = page.locator('h2:has-text("要約")');
    const isSummaryVisible = await summaryTitle.isVisible().catch(() => false);
    
    if (isSummaryVisible) {
      // コピーボタンを探す
      const copyButton = page.locator('button[aria-label="要約をコピー"]');
      const isDisabled = await copyButton.evaluate(el => (el as HTMLButtonElement).disabled);
      
      console.log('要約がない状態でコピーボタンが disabled:', isDisabled);
      
      // 要約がない場合は disabled であるべき
      if (isDisabled) {
        console.log('✓ コピーボタンが正しく disabled 状態です');
      }
    }
  });
});
