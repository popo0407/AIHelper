/**
 * @jest-environment jsdom
 */
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ChatBubble } from '@/components/ChatBubble';
import type { Message } from '@/types';

// ── Test data ──
const baseMessage: Message = {
  conversationId: 'conv-1',
  messageId: 'msg-1',
  userId: 'tanaka',
  displayName: '田中太郎',
  content: 'こんにちは、今日の議題について話しましょう。',
  timestamp: '2026-02-13T10:30:00Z',
  isUsedInSummary: false,
};

const aiMessage: Message = {
  conversationId: 'conv-1',
  messageId: 'msg-ai-1',
  userId: 'AIHELPER',
  displayName: 'AIHelper',
  content: '議題についてまとめました。',
  timestamp: '2026-02-13T10:31:00Z',
  isUsedInSummary: false,
};

const usedInSummaryMessage: Message = {
  ...baseMessage,
  messageId: 'msg-2',
  isUsedInSummary: true,
};

describe('ChatBubble', () => {
  const onToggleSelect = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ── 1. 自分のメッセージが正しいスタイルで表示されること ──
  it('自分のメッセージが右寄せで表示される', () => {
    render(
      <ChatBubble
        message={baseMessage}
        isOwn={true}
        isAI={false}
        isSelected={false}
        onToggleSelect={onToggleSelect}
      />
    );

    // メッセージ内容が表示されている
    expect(
      screen.getByText('こんにちは、今日の議題について話しましょう。')
    ).toBeInTheDocument();

    // 自分のメッセージの場合、送信者名は表示されない
    expect(screen.queryByText('田中太郎')).not.toBeInTheDocument();

    // justify-end クラスで右寄せ
    const wrapper = screen.getByRole('article');
    expect(wrapper.className).toContain('justify-end');
  });

  // ── 2. 他ユーザーのメッセージが表示されること ──
  it('他ユーザーのメッセージが左寄せで送信者名付きで表示される', () => {
    render(
      <ChatBubble
        message={baseMessage}
        isOwn={false}
        isAI={false}
        isSelected={false}
        onToggleSelect={onToggleSelect}
      />
    );

    // 送信者名が表示される
    expect(screen.getByText('田中太郎')).toBeInTheDocument();

    // 左寄せ
    const wrapper = screen.getByRole('article');
    expect(wrapper.className).toContain('justify-start');
  });

  // ── 3. AIHelper のメッセージが表示されること ──
  it('AIHelperのメッセージがAIスタイルで表示される', () => {
    render(
      <ChatBubble
        message={aiMessage}
        isOwn={false}
        isAI={true}
        isSelected={false}
        onToggleSelect={onToggleSelect}
      />
    );

    // AI 送信者名
    expect(screen.getByText('AIHelper')).toBeInTheDocument();

    // メッセージ内容
    expect(screen.getByText('議題についてまとめました。')).toBeInTheDocument();

    // chat-bubble-ai クラスが含まれる
    const button = screen.getByRole('button');
    expect(button.className).toContain('chat-bubble-ai');
  });

  // ── 4. メッセージ選択の切り替えが動作すること ──
  it('クリックで onToggleSelect が呼ばれる', async () => {
    const user = userEvent.setup();

    render(
      <ChatBubble
        message={baseMessage}
        isOwn={false}
        isAI={false}
        isSelected={false}
        onToggleSelect={onToggleSelect}
      />
    );

    const button = screen.getByRole('button');
    await user.click(button);

    expect(onToggleSelect).toHaveBeenCalledTimes(1);
  });

  it('選択状態のとき aria-pressed=true と selected クラスが付く', () => {
    render(
      <ChatBubble
        message={baseMessage}
        isOwn={false}
        isAI={false}
        isSelected={true}
        onToggleSelect={onToggleSelect}
      />
    );

    const button = screen.getByRole('button');
    expect(button).toHaveAttribute('aria-pressed', 'true');
    expect(button.className).toContain('chat-bubble-selected');
  });

  it('未選択のとき aria-pressed=false', () => {
    render(
      <ChatBubble
        message={baseMessage}
        isOwn={false}
        isAI={false}
        isSelected={false}
        onToggleSelect={onToggleSelect}
      />
    );

    const button = screen.getByRole('button');
    expect(button).toHaveAttribute('aria-pressed', 'false');
  });

  // ── 5. 要約に使用済みメッセージのバッジ ──
  it('isUsedInSummary=true のときバッジが表示される', () => {
    render(
      <ChatBubble
        message={usedInSummaryMessage}
        isOwn={false}
        isAI={false}
        isSelected={false}
        onToggleSelect={onToggleSelect}
      />
    );

    expect(screen.getByTitle('要約に含まれています')).toBeInTheDocument();
  });

  it('isUsedInSummary=false のときバッジは表示されない', () => {
    render(
      <ChatBubble
        message={baseMessage}
        isOwn={false}
        isAI={false}
        isSelected={false}
        onToggleSelect={onToggleSelect}
      />
    );

    expect(screen.queryByTitle('要約に含まれています')).not.toBeInTheDocument();
  });
});
