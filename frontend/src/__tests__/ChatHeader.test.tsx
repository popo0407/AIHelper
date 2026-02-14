/**
 * @jest-environment jsdom
 */
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ChatHeader } from '@/components/ChatHeader';

describe('ChatHeader', () => {
  const onNewConversation = jest.fn();
  const onSwitchConversation = jest.fn();
  const onSwitchUser = jest.fn();
  const onCopyLink = jest.fn();
  const onReload = jest.fn();

  const defaultProps = {
    conversationTitle: 'テスト会話',
    userName: '田中太郎',
    onNewConversation,
    onSwitchConversation,
    onSwitchUser,
    onCopyLink,
    onReload,
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ── 1. タイトルとユーザー名が表示されること ──
  it('会話タイトルが表示される', () => {
    render(<ChatHeader {...defaultProps} />);

    expect(screen.getByText('テスト会話')).toBeInTheDocument();
  });

  it('ユーザー名が表示される', () => {
    render(<ChatHeader {...defaultProps} />);

    expect(screen.getByText('田中太郎')).toBeInTheDocument();
  });

  it('長いタイトルも表示される（truncateクラスで省略）', () => {
    render(
      <ChatHeader
        {...defaultProps}
        conversationTitle="これはとても長い会話タイトルです。テスト用途で使用しています。"
      />
    );

    expect(
      screen.getByText('これはとても長い会話タイトルです。テスト用途で使用しています。')
    ).toBeInTheDocument();
  });

  // ── 2. 各ボタンが表示されること ──
  it('新しい会話ボタンが表示される', () => {
    render(<ChatHeader {...defaultProps} />);

    expect(screen.getByLabelText('新しい会話を作成')).toBeInTheDocument();
  });

  it('別の会話に移動ボタンが表示される', () => {
    render(<ChatHeader {...defaultProps} />);

    expect(screen.getByLabelText('別の会話に移動')).toBeInTheDocument();
  });

  it('ユーザー切り替えボタンが表示される', () => {
    render(<ChatHeader {...defaultProps} />);

    expect(screen.getByLabelText('ユーザー切り替え')).toBeInTheDocument();
  });

  it('リンクコピーボタンが表示される', () => {
    render(<ChatHeader {...defaultProps} />);

    expect(screen.getByLabelText('リンクコピー')).toBeInTheDocument();
  });

  it('セッション再読み込みボタンが表示される', () => {
    render(<ChatHeader {...defaultProps} />);

    expect(screen.getByLabelText('セッション再読み込み')).toBeInTheDocument();
  });

  // ── 3. ボタンクリックでコールバックが呼ばれること ──
  it('新しい会話ボタンクリックで onNewConversation が呼ばれる', async () => {
    const user = userEvent.setup();
    render(<ChatHeader {...defaultProps} />);

    await user.click(screen.getByLabelText('新しい会話を作成'));

    expect(onNewConversation).toHaveBeenCalledTimes(1);
  });

  it('別の会話に移動ボタンクリックで onSwitchConversation が呼ばれる', async () => {
    const user = userEvent.setup();
    render(<ChatHeader {...defaultProps} />);

    await user.click(screen.getByLabelText('別の会話に移動'));

    expect(onSwitchConversation).toHaveBeenCalledTimes(1);
  });

  it('ユーザー切り替えボタンクリックで onSwitchUser が呼ばれる', async () => {
    const user = userEvent.setup();
    render(<ChatHeader {...defaultProps} />);

    await user.click(screen.getByLabelText('ユーザー切り替え'));

    expect(onSwitchUser).toHaveBeenCalledTimes(1);
  });

  it('リンクコピーボタンクリックで onCopyLink が呼ばれる', async () => {
    const user = userEvent.setup();
    render(<ChatHeader {...defaultProps} />);

    await user.click(screen.getByLabelText('リンクコピー'));

    expect(onCopyLink).toHaveBeenCalledTimes(1);
  });

  it('セッション再読み込みボタンクリックで onReload が呼ばれる', async () => {
    const user = userEvent.setup();
    render(<ChatHeader {...defaultProps} />);

    await user.click(screen.getByLabelText('セッション再読み込み'));

    expect(onReload).toHaveBeenCalledTimes(1);
  });
});
