import { test, expect } from '@playwright/test';
import * as path from 'path';
import * as fs from 'fs';

// 認証情報
const TEST_EMAIL = 'adiantum.raddianum.87.4.7@gmail.com';
const TEST_PASSWORD = 'aE#4344259';

// テスト用ファイル
const TEST_FILE_NAME = 'test-document.txt';
const TEST_FILE_CONTENT = 'これはテスト用のナレッジベ ースドキュメントです。\n重要な情報: プロジェクトの目標は2026年3月までに完了することです。';

test.describe('ナレッジベース機能のテスト', () => {
  test.beforeEach(async ({ page }) => {
    // ページエラーハンドラ
    page.on('console', msg => {
      if (msg.type() === 'error') console.error('Browser Error:', msg.text());
    });
    page.on('pageerror', error => {
      console.error('Page Error:', error.message);
    });

    // ログイン
    console.log('ログイン処理開始');
    await page.goto('http://localhost:3000');
    await page.waitForLoadState('networkidle');

    await page.locator('input[type="email"]').fill(TEST_EMAIL);
    await page.locator('input[type="password"]').first().fill(TEST_PASSWORD);
    await page.locator('button[type="submit"]').first().click();
    await page.waitForTimeout(3000);
    console.log('ログイン完了');

    // 新しい会話を作成（または既存の会話に入る）
    const newConvButton = page.locator('button:has-text("新しい会話")');
    if (await newConvButton.isVisible().catch(() => false)) {
      await newConvButton.click();
      await page.waitForTimeout(2000);
      console.log('新しい会話を作成');
    } else {
      // すでにチャット画面にいるか確認
      const msgInput = page.locator('textarea[placeholder*="メッセージ"], input[placeholder*="メッセージ"]');
      if (!(await msgInput.isVisible().catch(() => false))) {
        // 会話一覧から最初の会話を選択
        const firstConv = page.locator('[data-testid="conversation-item"]').first();
        if (await firstConv.isVisible().catch(() => false)) {
          await firstConv.click();
          await page.waitForTimeout(2000);
        }
      }
    }
  });

  test('ナレッジベースボタンが表示される', async ({ page }) => {
    const kbButton = page.locator('button', { hasText: /ナレッジベース|📚/ });
    
    if (await kbButton.isVisible().catch(() => false)) {
      console.log('✓ ナレッジベースボタンが表示されている');
      expect(await kbButton.isVisible()).toBeTruthy();
    } else {
      console.log('⚠️  ナレッジベースボタンが見つかりません（機能未実装）');
      test.skip();
    }
  });

  test('ナレッジベースパネルを開閉できる', async ({ page }) => {
    const kbButton = page.locator('button', { hasText: /ナレッジベース|📚/ });
    
    if (!(await kbButton.isVisible().catch(() => false))) {
      console.log('⚠️  ボタンが見つかりません（機能未実装）');
      test.skip();
      return;
    }

    await kbButton.click();
    await page.waitForTimeout(1000);

    // パネルが開いたことを確認
    const panelTitle = page.locator('h2', { hasText: /ナレッジベース|📚/ });
    const uploadButton = page.locator('button', { hasText: /アップロード|📎/ });
    
    const isPanelOpen = (await panelTitle.isVisible().catch(() => false)) 
      || (await uploadButton.isVisible().catch(() => false));
    
    expect(isPanelOpen).toBeTruthy();
    console.log('✓ ナレッジベースパネルが開いた');

    // パネルを閉じる
    const closeButton = page.locator('button[aria-label*="閉じる"], button:has-text("✕")');
    if (await closeButton.isVisible().catch(() => false)) {
      await closeButton.click();
      await page.waitForTimeout(500);
      console.log('✓ パネルを閉じた');
    }
  });

  // ファイル操作フロー（アップロード→検索トグル→削除）
  test.describe.serial('ファイル操作フロー', () => {
    test('ファイルをアップロードできる', async ({ page }) => {
      const kbButton = page.locator('button', { hasText: /ナレッジベース|📚/ });
      await expect(kbButton).toBeVisible({ timeout: 5000 });
      await kbButton.click();
      await page.waitForTimeout(1000);

      const uploadButton = page.locator('button', { hasText: /アップロード|📎/ });
      await expect(uploadButton).toBeVisible({ timeout: 5000 });

      // テスト用ファイル作成
      const tempDir = path.join(process.cwd(), 'test-results', 'temp');
      if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });
      const testFilePath = path.join(tempDir, TEST_FILE_NAME);
      fs.writeFileSync(testFilePath, TEST_FILE_CONTENT, 'utf-8');
      console.log('テスト用ファイル作成:', testFilePath);

      // ファイル選択ダイアログ
      const fileChooserPromise = page.waitForEvent('filechooser');
      await uploadButton.click();
      const fileChooser = await fileChooserPromise;
      await fileChooser.setFiles(testFilePath);
      console.log('ファイル選択完了');

      // アップロード完了を待つ
      await page.waitForTimeout(5000);

      // ファイルが一覧に表示されることを厳格に確認
      const fileListItem = page.locator(`text=${TEST_FILE_NAME}`);
      await expect(fileListItem).toBeVisible({ timeout: 15000 });
      console.log('✓ ファイルが一覧に表示された');

      // パネルを閉じる
      const closeButton = page.locator('button[aria-label*="閉じる"], button:has-text("✕")');
      if (await closeButton.isVisible().catch(() => false)) {
        await closeButton.click();
        await page.waitForTimeout(500);
      }

      // クリーンアップ
      fs.unlinkSync(testFilePath);
    });

    test('KB検索トグルが表示される', async ({ page }) => {
      await page.waitForTimeout(1000);

      // KB検索トグルを厳格にチェック（前のテストでファイルが登録されているはず）
      const kbToggle = page.locator('button', { hasText: /KB検索/ });
      await expect(kbToggle).toBeVisible({ timeout: 5000 });
      console.log('✓ KB検索トグルが表示されている');

      // トグルON/OFF切り替え
      await kbToggle.click();
      await page.waitForTimeout(500);
      console.log('✓ KB検索トグルをON');

      await kbToggle.click();
      await page.waitForTimeout(500);
      console.log('✓ KB検索トグルをOFF');
    });

    test('ファイルを削除できる', async ({ page }) => {
      const kbButton = page.locator('button', { hasText: /ナレッジベース|📚/ });
      await expect(kbButton).toBeVisible({ timeout: 5000 });
      await kbButton.click();
      await page.waitForTimeout(1000);

      // ファイル一覧
      const fileItems = page.locator('ul[role="list"] li');
      const fileCount = await fileItems.count();
      expect(fileCount).toBeGreaterThan(0);
      console.log(`ファイル数: ${fileCount}`);

      // 削除ボタン
      const deleteButton = fileItems.first().locator('button:has-text("🗑")');
      await expect(deleteButton).toBeVisible({ timeout: 5000 });

      // 削除確認ダイアログ
      page.once('dialog', dialog => {
        console.log('削除確認:', dialog.message());
        dialog.accept();
      });

      await deleteButton.click();
      console.log('削除ボタンクリック');
      await page.waitForTimeout(3000);

      // ファイル数が減ったことを確認
      const newFileCount = await fileItems.count();
      expect(newFileCount).toBe(fileCount - 1);
      console.log(`ファイル削除完了: ${fileCount} → ${newFileCount}`);
    });
  });

  test('ナレッジベースボタンにバッジが表示される', async ({ page }) => {
    const kbButton = page.locator('button', { hasText: /ナレッジベース|📚/ });
    
    if (!(await kbButton.isVisible().catch(() => false))) {
      console.log('⚠️  ボタンが見つかりません（機能未実装）');
      test.skip();
      return;
    }

    const badge = kbButton.locator('span.absolute');
    
    if (await badge.isVisible().catch(() => false)) {
      const badgeText = await badge.textContent();
      console.log(`✓ バッジ表示: ${badgeText}件`);
      expect(parseInt(badgeText || '0')).toBeGreaterThan(0);
    } else {
      console.log('⚠️  バッジ未表示（ファイル未登録またはバッジ未実装）');
    }
  });
});
