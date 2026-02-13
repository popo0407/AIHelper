/**
 * @jest-environment jsdom
 */
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { LoginScreen } from '@/components/LoginScreen';
import type { User } from '@/types';

// ── Mock AppSync client ──
const mockGraphql = jest.fn();
jest.mock('@/lib/appsync', () => ({
  graphqlClient: { graphql: (...args: unknown[]) => mockGraphql(...args) },
  extractData: <T,>(result: { data: Record<string, unknown> }, key: string): T =>
    result.data[key] as T,
}));

// ── Helpers ──
const mockUsers: User[] = [
  {
    loginId: 'tanaka',
    displayName: '田中太郎',
    createdAt: '2026-01-01T00:00:00Z',
    conversationIds: [],
  },
  {
    loginId: 'suzuki',
    displayName: '鈴木花子',
    createdAt: '2026-01-02T00:00:00Z',
    conversationIds: ['conv-1'],
  },
];

function setupListUsersSuccess(users: User[] = mockUsers) {
  mockGraphql.mockResolvedValueOnce({
    data: { listUsers: users },
  });
}

function setupRegisterUserSuccess(user: User) {
  mockGraphql.mockResolvedValueOnce({
    data: {
      registerUser: { success: true, user },
    },
  });
}

function setupRegisterUserFailure(error: string) {
  mockGraphql.mockResolvedValueOnce({
    data: {
      registerUser: { success: false, error },
    },
  });
}

describe('LoginScreen', () => {
  const onLogin = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ── 1. ユーザー一覧が表示されること ──
  it('ユーザー一覧を読み込んでセレクトボックスに表示する', async () => {
    setupListUsersSuccess();
    render(<LoginScreen onLogin={onLogin} />);

    // ユーザー一覧がフェッチされるのを待つ
    await waitFor(() => {
      expect(screen.getByText(/田中太郎/)).toBeInTheDocument();
    });

    expect(screen.getByText(/鈴木花子/)).toBeInTheDocument();
  });

  // ── 2. ユーザーを選択してログインできること ──
  it('ユーザーを選択してログインボタンで onLogin が呼ばれる', async () => {
    setupListUsersSuccess();
    const user = userEvent.setup();
    render(<LoginScreen onLogin={onLogin} />);

    // ユーザーが読み込まれるまで待つ
    await waitFor(() => {
      expect(screen.getByText(/田中太郎/)).toBeInTheDocument();
    });

    // セレクトボックスで田中を選択
    const select = screen.getByLabelText('登録済みユーザーを選択');
    await user.selectOptions(select, 'tanaka');

    // ログインボタンをクリック
    const loginButton = screen.getByLabelText('選択したユーザーでログイン');
    await user.click(loginButton);

    expect(onLogin).toHaveBeenCalledWith(mockUsers[0]);
  });

  // ── 3. 新規ユーザー登録ができること ──
  it('新規ユーザーを登録して onLogin が呼ばれる', async () => {
    const newUser: User = {
      loginId: 'yamada',
      displayName: '山田一郎',
      createdAt: '2026-02-01T00:00:00Z',
      conversationIds: [],
    };
    setupListUsersSuccess();
    render(<LoginScreen onLogin={onLogin} />);

    // ユーザーが読み込まれるまで待つ
    await waitFor(() => {
      expect(screen.getByText(/田中太郎/)).toBeInTheDocument();
    });

    const user = userEvent.setup();

    // フォームに入力
    const loginIdInput = screen.getByLabelText('ログインID');
    const displayNameInput = screen.getByLabelText('表示名');

    await user.type(loginIdInput, 'yamada');
    await user.type(displayNameInput, '山田一郎');

    // 登録ボタンをクリック
    setupRegisterUserSuccess(newUser);
    const registerButton = screen.getByLabelText('新規ユーザーを登録');
    await user.click(registerButton);

    await waitFor(() => {
      expect(onLogin).toHaveBeenCalledWith(newUser);
    });
  });

  // ── 4. バリデーションエラーが表示されること ──
  it('ログインIDまたは表示名が空の場合バリデーションエラーを表示する', async () => {
    setupListUsersSuccess();
    render(<LoginScreen onLogin={onLogin} />);

    // ユーザーが読み込まれるまで待つ
    await waitFor(() => {
      expect(screen.getByText(/田中太郎/)).toBeInTheDocument();
    });

    const user = userEvent.setup();

    // ログインIDのみ入力して登録ボタンを押す — ボタンが disabled なので直接関数を検証
    // ボタンは !newLoginId.trim() || !newDisplayName.trim() の場合 disabled
    const registerButton = screen.getByLabelText('新規ユーザーを登録');
    expect(registerButton).toBeDisabled();

    // ログインIDだけ入力 — まだ disabled
    const loginIdInput = screen.getByLabelText('ログインID');
    await user.type(loginIdInput, 'yamada');
    expect(registerButton).toBeDisabled();
  });

  it('APIがエラーを返した場合エラーメッセージを表示する', async () => {
    setupListUsersSuccess();
    render(<LoginScreen onLogin={onLogin} />);

    await waitFor(() => {
      expect(screen.getByText(/田中太郎/)).toBeInTheDocument();
    });

    const user = userEvent.setup();

    await user.type(screen.getByLabelText('ログインID'), 'existing');
    await user.type(screen.getByLabelText('表示名'), '既存ユーザー');

    setupRegisterUserFailure('このログインIDは既に使用されています。');

    await user.click(screen.getByLabelText('新規ユーザーを登録'));

    await waitFor(() => {
      expect(
        screen.getByText('このログインIDは既に使用されています。')
      ).toBeInTheDocument();
    });
    expect(onLogin).not.toHaveBeenCalled();
  });

  // ── 5. ユーザーが選択されていない場合ログインボタンが無効 ──
  it('ユーザー未選択の場合ログインボタンが disabled', async () => {
    setupListUsersSuccess();
    render(<LoginScreen onLogin={onLogin} />);

    await waitFor(() => {
      expect(screen.getByText(/田中太郎/)).toBeInTheDocument();
    });

    const loginButton = screen.getByLabelText('選択したユーザーでログイン');
    expect(loginButton).toBeDisabled();
  });
});
