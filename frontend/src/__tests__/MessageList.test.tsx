/**
 * @jest-environment jsdom
 */
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MessageList } from '@/components/MessageList';
import type { Message } from '@/types';

// ── Test data ──
const testMessages: Message[] = [
  {
    conversationId: 'conv-1',
    messageId: 'msg-1',
    userId: 'tanaka',
    displayName: '田中太郎',
    content: 'こんにちは、今日の議題について話しましょう。',
    timestamp: '2026-02-13T10:30:00Z',
    isUsedInSummary: false,
  },
  {
    conversationId: 'conv-1',
    messageId: 'msg-2',
    userId: 'suzuki',
    displayName: '鈴木花子',
    content: 'はい、まずスケジュール確認からお願いします。',
    timestamp: '2026-02-13T10:31:00Z',
    isUsedInSummary: false,
  },
  {
    conversationId: 'conv-1',
    messageId: 'msg-ai-1',
    userId: 'AIHELPER',
    displayName: 'AIHelper',
    content: 'スケジュールを確認しました。以下の議題が予定されています。',
    timestamp: '2026-02-13T10:32:00Z',
    isUsedInSummary: true,
  },
];

describe('MessageList', () => {
  const onToggleSelect = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  function renderMessageList(
    overrides: Partial<Parameters<typeof MessageList>[0]> = {}
  ) {
    const defaultProps = {
      messages: testMessages,
      currentUserId: 'tanaka',
      selectedMessageIds: new Set<string>(),
      onToggleSelect,
      isLoading: false,
    };
    return render(<MessageList {...defaultProps} {...overrides} />);
  }

  // ── 1. メッセージが表示されること ──
  it('すべてのメッセージが表示される', () => {
    renderMessageList();

    expect(screen.getByText('こんにちは、今日の議題について話しましょう。')).toBeInTheDocument();
    expect(screen.getByText('はい、まずスケジュール確認からお願いします。')).toBeInTheDocument();
    expect(screen.getByText('スケジュールを確認しました。以下の議題が予定されています。')).toBeInTheDocument();
  });

  it('他ユーザーのメッセージには送信者名が表示される', () => {
    renderMessageList();

    // 田中は自分なので表示されない（ChatBubble内で isOwn=true の場合は名前非表示）
    // 鈴木は他ユーザーなので表示される
    expect(screen.getByText('鈴木花子')).toBeInTheDocument();
    // AIHelper も他ユーザーとして表示
    expect(screen.getByText('AIHelper')).toBeInTheDocument();
  });

  // ── 2. 空リストの表示 ──
  it('メッセージが0件のとき空メッセージが表示される', () => {
    renderMessageList({ messages: [] });

    expect(screen.getByText('まだメッセージがありません')).toBeInTheDocument();
    expect(screen.getByText('最初のメッセージを送信してみましょう')).toBeInTheDocument();
  });

  // ── 3. ローディング状態 ──
  it('読み込み中はスピナーが表示される', () => {
    renderMessageList({ isLoading: true });

    expect(screen.getByText('メッセージを読み込み中...')).toBeInTheDocument();
  });

  it('読み込み中はメッセージが表示されない', () => {
    renderMessageList({ isLoading: true });

    expect(screen.queryByText('こんにちは、今日の議題について話しましょう。')).not.toBeInTheDocument();
  });

  // ── 4. メッセージ選択 ──
  it('メッセージをクリックすると onToggleSelect が呼ばれる', async () => {
    const user = userEvent.setup();
    renderMessageList();

    // 鈴木のメッセージをクリック (ChatBubble内のボタン)
    const msgButton = screen.getByLabelText(
      /メッセージを選択: はい、まずスケジュール確認/
    );
    await user.click(msgButton);

    expect(onToggleSelect).toHaveBeenCalledWith('msg-2');
  });

  it('選択済みメッセージの選択解除ができる', async () => {
    const user = userEvent.setup();
    renderMessageList({ selectedMessageIds: new Set(['msg-1']) });

    const msgButton = screen.getByLabelText(
      /メッセージを選択解除: こんにちは/
    );
    await user.click(msgButton);

    expect(onToggleSelect).toHaveBeenCalledWith('msg-1');
  });

  // ── 5. アクセシビリティ ──
  it('メッセージリストに role="log" が設定されている', () => {
    renderMessageList();

    expect(screen.getByRole('log')).toBeInTheDocument();
  });

  it('メッセージリストに aria-label が設定されている', () => {
    renderMessageList();

    expect(screen.getByLabelText('チャットメッセージ')).toBeInTheDocument();
  });

  // ── 6. AI メッセージの識別 ──
  it('AIHelperメッセージの送信者名が表示される', () => {
    renderMessageList();

    expect(screen.getByText('AIHelper')).toBeInTheDocument();
  });

  // ── 7. 要約使用済みメッセージの表示 ──
  it('要約に使用されたメッセージにはバッジが表示される', () => {
    renderMessageList();

    // isUsedInSummary=true のメッセージにバッジが付く
    const badge = screen.getByLabelText('要約に含まれたメッセージ');
    expect(badge).toBeInTheDocument();
  });
});
