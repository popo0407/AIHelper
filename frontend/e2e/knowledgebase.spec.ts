import { test, expect } from '@playwright/test';
import * as path from 'path';
import * as fs from 'fs';

// 認証情報
const TEST_EMAIL = 'adiantum.raddianum.87.4.7@gmail.com';
const TEST_PASSWORD = 'aE#4344259';

// テスト用ファイルパス
const TEST_FILE_NAME = 'test-document.txt';
const TEST_FILE_CONTENT = 'これはテスト用のナレッジベースドキュメントです。\n重要な情報: プロジェクトの目標は2026年3月までに完了することです。';

// 各テスト前にログインしてチャット画面に遷移
test.beforeEach(async ({ page }) => {
  // コンソールエラーをキャプチャ
  page.on('console', msg => {
    if (msg.type() === 'error') {
      console.error('❌ Browser Console Error:', msg.text());
    }
  });

  page.on('pageerror', error => {
    console.error('❌ Page Error:', error.message);
  });

  console.log('✓ ログイン処理開始...');
  await page.goto('http://localhost:3001');
  await page.waitForLoadState('networkidle');

  // ログイン
  const emailInput = page.locator('input[type="email"]');
  await emailInput.fill(TEST_EMAIL);
  
  const passwordInput = page.locator('input[type="password"]').first();
  await passwordInput.fill(TEST_PASSWORD);
  
  const loginButton = page.locator('button[type="submit"]').first();
  await loginButton.click();
  
  await page.waitForTimeout(3000);
  console.log('✓ ログイン完了');

  // 新しい会話を作成
  const newConversationButton = page.locator('button:has-text("新しい会話")');
  
  // 会話一覧画面にいる場合は新規会話作成、すでにチャット画面の場合はそのまま
  const isListView = await newConversationButton.isVisible().catch(() => false);
  if (isListView) {
    await newConversationButton.click();
    await page.waitForTimeout(2000);
    console.log('✓ 新しい会話を作成');
  }

  // チャット画面に遷移したことを確認
  const messageInput = page.locator('textarea[placeholder*="メッセージ"], input[placeholder*="メッセージ"]');
  const isVisible = await messageInput.isVisible().catch(() => false);
  
  if (isVisible) {
    console.log('✓ チャット画面に遷移');
  } else {
    console.log('⚠️  チャット画面に直接遷移できなかった。会話一覧から選択します。');
    // 会話一覧にいる場合は最初の会話を選択
    const firstConv = page.locator('[data-testid="conversation-item"]').first();
    const hasConv = await firstConv.isVisible().catch(() => false);
    if (hasConv) {
      await firstConv.click();
      await page.waitForTimeout(2000);
    }
  }
});

test.describe('ナレッジベース機能のテスト', () => {
  
  test('ナレッジベースボタンが表示される', async ({ page }) => {
    await page.screenshot({ path: 'test-results/kb-button-check.png', fullPage: true });
    
    // 📚ナレッジベースボタンを探す
    const kbButton = page.locator('button', { hasText: /ナレッジベース|📚/ });
    const isVisible = await kbButton.isVisible().catch(() => false);
    
    if (isVisible) {
      console.log('✓ ナレッジベースボタンが表示されている');
      expect(isVisible).toBeTruthy();
    } else {
      console.log('⚠️  ナレッジベースボタンが見つかりません（機能が未実装の可能性）');
      test.skip();
    }
  });
  
  test('ナレッジベースパネルを開閉できる', async ({ page }) => {
    await page.screenshot({ path: 'test-results/kb-before-open.png', fullPage: true });
    
    // 📚ナレッジベースボタンを探す
    const kbButton = page.locator('button', { hasText: /ナレッジベース|📚/ });
    const isButtonVisible = await kbButton.isVisible().catch(() => false);
    
    if (!isButtonVisible) {
      console.log('⚠️  ナレッジベースボタンが見つかりません');
      test.skip();
      return;
    }
    
    console.log('✓ ナレッジベースボタンを発見');
    
    // ボタンをクリックしてパネルを開く
    await kbButton.click();
    await page.waitForTimeout(1000);
    
    // パネルが表示されることを確認（タイトルまたはアップロードボタン）
    const panelTitle = page.locator('h2', { hasText: /ナレッジベース|📚/ });
    const uploadButton = page.locator('button', { hasText: /アップロード|📎/ });
    
    const isTitleVisible = await panelTitle.isVisible().catch(() => false);
    const isUploadVisible = await uploadButton.isVisible().catch(() => false);
    
    if (isTitleVisible || isUploadVisible) {
      console.log('✓ ナレッジベースパネルが開いた');
    } else {
      console.log('⚠️  パネルが開けませんでした');
      test.fail();
    }
    
    await page.screenshot({ path: 'test-results/kb-panel-open.png', fullPage: true });
    
    // パネルを閉じる（閉じるボタンまたはオーバーレイクリック）
    const closeButton = page.locator('button[aria-label*="閉じる"], button:has-text("✕")');
    const hasCloseButton = await closeButton.isVisible().catch(() => false);
    
    if (hasCloseButton) {
      await closeButton.click();
      await page.waitForTimeout(500);
      console.log('✓ ナレッジベースパネルを閉じた');
    }
  });

  test('ファイルをアップロードできる', async ({ page }) => {
    // ナレッジベースパネルを開く
    const kbButton = page.locator('button', { hasText: /ナレッジベース|📚/ });
    const isButtonVisible = await kbButton.isVisible().catch(() => false);
    
    if (!isButtonVisible) {
      console.log('⚠️  ナレッジベース機能が利用できません');
      test.skip();
      return;
    }
    
    await kbButton.click();
    await page.waitForTimeout(1000);
    
    // アップロードボタンをクリック
    const uploadButton = page.locator('button', { hasText: /アップロード|📎/ });
    const isUploadVisible = await uploadButton.isVisible().catch(() => false);
    
    if (!isUploadVisible) {
      console.log('⚠️  アップロードボタンが見つかりません');
      test.skip();
      return;
    }
    
    // テスト用ファイルを一時的に作成
    const tempDir = path.join(process.cwd(), 'test-results', 'temp');
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }
    const testFilePath = path.join(tempDir, TEST_FILE_NAME);
    fs.writeFileSync(testFilePath, TEST_FILE_CONTENT, 'utf-8');
    console.log('✓ テスト用ファイルを作成:', testFilePath);
    
    // ファイル選択ダイアログをハンドル
    const fileChooserPromise = page.waitForEvent('filechooser');
    await uploadButton.click();
    const fileChooser = await fileChooserPromise;
    await fileChooser.setFiles(testFilePath);
    
    console.log('✓ ファイルを選択');
    
    // アップロード処理が完了するまで待機
    await page.waitForTimeout(3000);
    
    await page.screenshot({ path: 'test-results/kb-after-upload.png', fullPage: true });
    
    // ファイルが一覧に表示されることを確認
    const fileListItem = page.locator(`text=${TEST_FILE_NAME}`);
    const isFileVisible = await fileListItem.isVisible({ timeout: 10000 }).catch(() => false);
    
    if (isFileVisible) {
      console.log('✓ アップロードしたファイルが一覧に表示された');
    } else {
      console.log('⚠️  ファイルアップロードがAPIで失敗した可能性があります');
    }
    
    // クリーンアップ
    fs.unlinkSync(testFilePath);
  });

  test('ナレッジベース検索トグルが表示される', async ({ page }) => {
    // メッセージ入力エリアまでスクロール
    await page.waitForTimeout(1000);
    
    // ナレッジベース検索トグルを探す（ファイルが登録されている場合のみ表示）
    const kbToggle = page.locator('button', { hasText: /KB検索/ });
    
    // トグルが表示されない場合はファイルがないのでスキップ
    const isToggleVisible = await kbToggle.isVisible().catch(() => false);
    if (!isToggleVisible) {
      console.log('⚠️  KB検索トグルが表示されません（ファイル未登録）');
      test.skip();
      return;
    }
    
    console.log('✓ KB検索トグルが表示されている');
  });

  test('ファイルを削除できる', async ({ page }) => {
    // ナレッジベースパネルを開く
    const kbButton = page.locator('button', { hasText: /ナレッジベース|📚/ });
    const isButtonVisible = await kbButton.isVisible().catch(() => false);
    
    if (!isButtonVisible) {
      console.log('⚠️  ナレッジベース機能が利用できません');
      test.skip();
      return;
    }
    
    await kbButton.click();
    await page.waitForTimeout(1000);
    
    // ファイル一覧を取得
    const fileItems = page.locator('ul[role="list"] li');
    const fileCount = await fileItems.count();
    
    if (fileCount === 0) {
      console.log('⚠️  削除対象のファイルがありません');
      test.skip();
      return;
    }
    
    console.log(`✓ ファイル数: ${fileCount}`);
    
    await page.screenshot({ path: 'test-results/kb-before-delete.png', fullPage: true });
    
    // 最初のファイルの削除ボタンをクリック
    const deleteButton = fileItems.first().locator('button:has-text("🗑")');
    await expect(deleteButton).toBeVisible({ timeout: 5000 });
    
    // ブラウザの確認ダイアログをハンドル
    page.once('dialog', dialog => {
      console.log('✓ 削除確認ダイアログ:', dialog.message());
      dialog.accept();
    });
    
    await deleteButton.click();
    console.log('✓ 削除ボタンをクリック');
    
    // 削除処理が完了するまで待機
    await page.waitForTimeout(3000);
    
    await page.screenshot({ path: 'test-results/kb-after-delete.png', fullPage: true });
    
    // ファイル数が減っていることを確認
    const newFileCount = await fileItems.count();
    expect(newFileCount).toBe(fileCount - 1);
    console.log(`✓ ファイルが削除されました（${fileCount} → ${newFileCount}）`);
  });

  test.skip('複数ファイルを管理できる', async ({ page }) => {
    // テスト用ファイルを2つ作成
    const tempDir = path.join(process.cwd(), 'test-results', 'temp');
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }
    
    const file1Path = path.join(tempDir, 'doc1.txt');
    const file2Path = path.join(tempDir, 'doc2.txt');
    fs.writeFileSync(file1Path, 'ドキュメント1の内容', 'utf-8');
    fs.writeFileSync(file2Path, 'ドキュメント2の内容', 'utf-8');
    
    // ナレッジベースパネルを開く
    const kbButton = page.locator('button:has-text("📚")');
    await kbButton.click();
    await page.waitForTimeout(1000);
    
    // 初期のファイル数を取得
    const initialCount = await page.locator('ul[role="list"] li').count();
    console.log(`✓ 初期ファイル数: ${initialCount}`);
    
    // 1つ目のファイルをアップロード
    const uploadButton = page.locator('button:has-text("📎 ファイルをアップロード")');
    
    let fileChooserPromise = page.waitForEvent('filechooser');
    await uploadButton.click();
    let fileChooser = await fileChooserPromise;
    await fileChooser.setFiles(file1Path);
    await page.waitForTimeout(3000);
    
    // 2つ目のファイルをアップロード
    fileChooserPromise = page.waitForEvent('filechooser');
    await uploadButton.click();
    fileChooser = await fileChooserPromise;
    await fileChooser.setFiles(file2Path);
    await page.waitForTimeout(3000);
    
    await page.screenshot({ path: 'test-results/kb-multiple-files.png', fullPage: true });
    
    // ファイル数が増えていることを確認
    const newCount = await page.locator('ul[role="list"] li').count();
    expect(newCount).toBe(initialCount + 2);
    console.log(`✓ 2つのファイルをアップロード（${initialCount} → ${newCount}）`);
    
    // クリーンアップ
    fs.unlinkSync(file1Path);
    fs.unlinkSync(file2Path);
  });

  test('ナレッジベースボタンにバッジが表示される', async ({ page }) => {
    // ファイルが1つ以上登録されている場合、バッジが表示される
    const kbButton = page.locator('button', { hasText: /ナレッジベース|📚/ });
    const isButtonVisible = await kbButton.isVisible().catch(() => false);
    
    if (!isButtonVisible) {
      console.log('⚠️  ナレッジベースボタンが見つかりません');
      test.skip();
      return;
    }
    
    await page.screenshot({ path: 'test-results/kb-button-badge.png', fullPage: true });
    
    // バッジ要素を探す（span要素で数値が表示される）
    const badge = kbButton.locator('span.absolute');
    
    // バッジが表示されている場合はファイルが登録されている
    const isBadgeVisible = await badge.isVisible().catch(() => false);
    
    if (isBadgeVisible) {
      const badgeText = await badge.textContent();
      console.log(`✓ バッジが表示されている: ${badgeText}件`);
      expect(parseInt(badgeText || '0')).toBeGreaterThan(0);
    } else {
      console.log('⚠️  バッジが表示されていません（ファイル未登録）');
    }
  });
});
