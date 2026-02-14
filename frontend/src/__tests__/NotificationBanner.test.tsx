/**
 * @jest-environment jsdom
 */
import { render, screen } from '@testing-library/react';
import { NotificationBanner } from '@/components/NotificationBanner';

describe('NotificationBanner', () => {
  // ── 1. メッセージが表示されること ──
  it('指定したメッセージが表示される', () => {
    render(<NotificationBanner message="要約を生成中です..." />);

    expect(screen.getByText('要約を生成中です...')).toBeInTheDocument();
  });

  it('日本語の通知メッセージが正しく表示される', () => {
    render(
      <NotificationBanner message="田中太郎さんがチャット「テストメッセ...」を要約に追加中です。" />
    );

    expect(
      screen.getByText('田中太郎さんがチャット「テストメッセ...」を要約に追加中です。')
    ).toBeInTheDocument();
  });

  it('AIHelper処理中の通知が表示される', () => {
    render(<NotificationBanner message="AIHelperが処理中です。" />);

    expect(screen.getByText('AIHelperが処理中です。')).toBeInTheDocument();
  });

  // ── 2. アクセシビリティ ──
  it('role="status" が設定されている', () => {
    render(<NotificationBanner message="テスト通知" />);

    const banner = screen.getByRole('status');
    expect(banner).toBeInTheDocument();
  });

  it('aria-live="polite" が設定されている', () => {
    render(<NotificationBanner message="テスト通知" />);

    const banner = screen.getByRole('status');
    expect(banner).toHaveAttribute('aria-live', 'polite');
  });

  // ── 3. 異なるメッセージで再レンダリングされること ──
  it('メッセージが変更されると新しいメッセージが表示される', () => {
    const { rerender } = render(<NotificationBanner message="初期メッセージ" />);

    expect(screen.getByText('初期メッセージ')).toBeInTheDocument();

    rerender(<NotificationBanner message="更新されたメッセージ" />);

    expect(screen.getByText('更新されたメッセージ')).toBeInTheDocument();
    expect(screen.queryByText('初期メッセージ')).not.toBeInTheDocument();
  });

  it('リンクコピー完了通知が表示される', () => {
    render(<NotificationBanner message="リンクをコピーしました" />);

    expect(screen.getByText('リンクをコピーしました')).toBeInTheDocument();
  });
});
