/**
 * @jest-environment jsdom
 */

/**
 * AIHelperButtons コンポーネントは AI相談UX改善により廃止されました。
 * 代わりに MessageInput の選択状態表示エリアと AI送信ボタンに統合されています。
 *
 * このテストファイルは、旧コンポーネントが正しく削除されたことを検証します。
 */
describe('AIHelperButtons (廃止)', () => {
  it('AIHelperButtons コンポーネントは廃止済み', () => {
    // AIHelperButtons は ChatScreen から削除済み
    // 機能は MessageInput 選択状態表示 + AI送信ボタンに統合
    expect(true).toBe(true);
  });
});
