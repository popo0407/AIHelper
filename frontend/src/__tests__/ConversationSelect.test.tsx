/**
 * @jest-environment jsdom
 */
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ConversationSelect } from '@/components/ConversationSelect';
import type { User, Conversation } from '@/types';

// ── Mock AppSync client ──
const mockGraphql = jest.fn();
jest.mock('@/lib/appsync', () => ({
  graphqlClient: { graphql: (...args: unknown[]) => mockGraphql(...args) },
  extractData: <T,>(result: { data: Record<string, unknown> }, key: string): T =>
    result.data[key] as T,
}));

// ── Test data ──
const testUser: User = {
  loginId: 'tanaka',
  displayName: '田中太郎',
  email: 'tanaka@example.com',
};

const testConversations: Conversation[] = [
  {
    conversationId: 'conv-1',
    createdBy: 'tanaka',
    createdAt: '2026-01-10T10:00:00Z',
    participants: ['tanaka', 'suzuki'],
    status: 'active',
    shareLink: null,
    title: 'プロジェクト打ち合わせ',
  },
  {
    conversationId: 'conv-2',
    createdBy: 'tanaka',
    createdAt: '2026-01-15T14:30:00Z',
    participants: ['tanaka'],
    status: 'active',
    shareLink: null,
    title: null, // タイトルなし → 「会話2」と表示されるはず
  },
];

function setupListConversationsSuccess(convos: Conversation[] = testConversations) {
  mockGraphql.mockResolvedValueOnce({
    data: { listConversations: convos },
  });
}

function setupCreateConversationSuccess(conv: Conversation) {
  mockGraphql.mockResolvedValueOnce({
    data: {
      createConversation: { success: true, conversation: conv },
    },
  });
}

describe('ConversationSelect', () => {
  const onSelect = jest.fn();
  const onNew = jest.fn();
  const onSwitchUser = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ── 1. 会話一覧が表示されること ──
  it('会話一覧を取得して表示する', async () => {
    setupListConversationsSuccess();

    render(
      <ConversationSelect
        user={testUser}
        onSelect={onSelect}
        onNew={onNew}
        onSwitchUser={onSwitchUser}
      />
    );

    // 会話がフェッチされるのを待つ
    await waitFor(() => {
      expect(screen.getByText('プロジェクト打ち合わせ')).toBeInTheDocument();
    });

    // タイトルなしの会話は「会話2」と表示
    expect(screen.getByText('会話2')).toBeInTheDocument();

    // 参加者数が表示される
    expect(screen.getByText(/参加者: 2名/)).toBeInTheDocument();
    expect(screen.getByText(/参加者: 1名/)).toBeInTheDocument();
  });

  it('会話が0件のとき空メッセージを表示する', async () => {
    setupListConversationsSuccess([]);

    render(
      <ConversationSelect
        user={testUser}
        onSelect={onSelect}
        onNew={onNew}
        onSwitchUser={onSwitchUser}
      />
    );

    await waitFor(() => {
      expect(screen.getByText('まだ会話がありません')).toBeInTheDocument();
    });
  });

  it('会話をクリックすると onSelect が呼ばれる', async () => {
    setupListConversationsSuccess();
    const user = userEvent.setup();

    render(
      <ConversationSelect
        user={testUser}
        onSelect={onSelect}
        onNew={onNew}
        onSwitchUser={onSwitchUser}
      />
    );

    await waitFor(() => {
      expect(screen.getByText('プロジェクト打ち合わせ')).toBeInTheDocument();
    });

    await user.click(
      screen.getByLabelText('会話「プロジェクト打ち合わせ」を開く')
    );

    expect(onSelect).toHaveBeenCalledWith(testConversations[0]);
  });

  // ── 2. 新しい会話を作成できること ──
  it('新しい会話を作成すると onNew が呼ばれる', async () => {
    setupListConversationsSuccess();
    const user = userEvent.setup();

    render(
      <ConversationSelect
        user={testUser}
        onSelect={onSelect}
        onNew={onNew}
        onSwitchUser={onSwitchUser}
      />
    );

    await waitFor(() => {
      expect(screen.getByText('プロジェクト打ち合わせ')).toBeInTheDocument();
    });

    const newConv: Conversation = {
      conversationId: 'conv-new',
      createdBy: 'tanaka',
      createdAt: '2026-02-13T10:00:00Z',
      participants: ['tanaka'],
      status: 'active',
      shareLink: null,
      title: null,
    };
    setupCreateConversationSuccess(newConv);

    await user.click(screen.getByLabelText('新しい会話を作成'));

    await waitFor(() => {
      expect(onNew).toHaveBeenCalledWith(newConv);
    });
  });

  // ── 3. ユーザー切り替えボタンが動作すること ──
  it('ユーザー切り替えボタンで onSwitchUser が呼ばれる', async () => {
    setupListConversationsSuccess();
    const user = userEvent.setup();

    render(
      <ConversationSelect
        user={testUser}
        onSelect={onSelect}
        onNew={onNew}
        onSwitchUser={onSwitchUser}
      />
    );

    await user.click(screen.getByLabelText('ユーザー切り替え'));

    expect(onSwitchUser).toHaveBeenCalledTimes(1);
  });

  it('ヘッダーにユーザー表示名が表示される', async () => {
    setupListConversationsSuccess();

    render(
      <ConversationSelect
        user={testUser}
        onSelect={onSelect}
        onNew={onNew}
        onSwitchUser={onSwitchUser}
      />
    );

    expect(screen.getByText('田中太郎')).toBeInTheDocument();
  });
});
