/**
 * @jest-environment jsdom
 */
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { LoginScreen } from '@/components/LoginScreen';
import type { User } from '@/types';

// ── Mock aws-amplify/auth ──
const mockSignIn = jest.fn();
const mockConfirmSignIn = jest.fn();
const mockFetchAuthSession = jest.fn();
const mockSignOut = jest.fn();
const mockGetCurrentUser = jest.fn();

jest.mock('aws-amplify/auth', () => ({
  signIn: (...args: unknown[]) => mockSignIn(...args),
  confirmSignIn: (...args: unknown[]) => mockConfirmSignIn(...args),
  fetchAuthSession: (...args: unknown[]) => mockFetchAuthSession(...args),
  signOut: (...args: unknown[]) => mockSignOut(...args),
  getCurrentUser: (...args: unknown[]) => mockGetCurrentUser(...args),
}));

// ── Mock appsync (Amplify configure) ──
jest.mock('@/lib/appsync', () => ({
  ensureAmplifyConfigured: jest.fn(),
  graphqlClient: { graphql: jest.fn() },
  extractData: jest.fn(),
}));

describe('LoginScreen', () => {
  const onLogin = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    // デフォルト: 既存セッションなし
    mockGetCurrentUser.mockRejectedValue(new Error('Not signed in'));
  });

  // ── 1. ログイン画面が表示されること ──
  it('ログインフォームが表示される', async () => {
    render(<LoginScreen onLogin={onLogin} />);

    await waitFor(() => {
      expect(screen.getByText('AI常駐型グループチャット')).toBeInTheDocument();
    });

    expect(screen.getByLabelText('メールアドレス')).toBeInTheDocument();
    expect(screen.getByLabelText('パスワード')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'ログイン' })).toBeInTheDocument();
  });

  it('説明テキストが表示される', async () => {
    render(<LoginScreen onLogin={onLogin} />);

    await waitFor(() => {
      expect(
        screen.getByText('メールアドレスとパスワードでログインしてください')
      ).toBeInTheDocument();
    });
  });

  // ── 2. 空入力ではログインボタンが disabled ──
  it('メールアドレスとパスワードが空の場合ログインボタンが disabled', async () => {
    render(<LoginScreen onLogin={onLogin} />);

    await waitFor(() => {
      const loginButton = screen.getByRole('button', { name: 'ログイン' });
      expect(loginButton).toBeDisabled();
    });
  });

  it('メールアドレスのみ入力ではログインボタンが disabled', async () => {
    const user = userEvent.setup();
    render(<LoginScreen onLogin={onLogin} />);

    await waitFor(() => {
      expect(screen.getByLabelText('メールアドレス')).toBeInTheDocument();
    });

    await user.type(screen.getByLabelText('メールアドレス'), 'test@example.com');

    expect(screen.getByRole('button', { name: 'ログイン' })).toBeDisabled();
  });

  it('パスワードのみ入力ではログインボタンが disabled', async () => {
    const user = userEvent.setup();
    render(<LoginScreen onLogin={onLogin} />);

    await waitFor(() => {
      expect(screen.getByLabelText('パスワード')).toBeInTheDocument();
    });

    await user.type(screen.getByLabelText('パスワード'), 'TestPass123!');

    expect(screen.getByRole('button', { name: 'ログイン' })).toBeDisabled();
  });

  // ── 3. 正常ログイン ──
  it('メール・パスワードを入力してログインが成功する', async () => {
    const user = userEvent.setup();

    const expectedUser: User = {
      loginId: 'user-uuid-123',
      displayName: 'テストユーザー',
      email: 'test@example.com',
    };

    mockSignIn.mockResolvedValue({
      nextStep: { signInStep: 'DONE' },
    });

    mockFetchAuthSession.mockResolvedValue({
      tokens: {
        idToken: {
          payload: {
            sub: expectedUser.loginId,
            email: expectedUser.email,
            'custom:userName': expectedUser.displayName,
          },
        },
      },
    });

    render(<LoginScreen onLogin={onLogin} />);

    await waitFor(() => {
      expect(screen.getByLabelText('メールアドレス')).toBeInTheDocument();
    });

    await user.type(screen.getByLabelText('メールアドレス'), 'test@example.com');
    await user.type(screen.getByLabelText('パスワード'), 'TestPass123!');

    const loginButton = screen.getByRole('button', { name: 'ログイン' });
    expect(loginButton).toBeEnabled();
    await user.click(loginButton);

    await waitFor(() => {
      expect(onLogin).toHaveBeenCalledWith(expectedUser);
    });

    expect(mockSignIn).toHaveBeenCalledWith({
      username: 'test@example.com',
      password: 'TestPass123!',
    });
  });

  // ── 4. ログインエラー ──
  it('ログイン失敗時にエラーメッセージが表示される', async () => {
    const user = userEvent.setup();

    mockSignIn.mockRejectedValue(new Error('Incorrect username or password.'));

    render(<LoginScreen onLogin={onLogin} />);

    await waitFor(() => {
      expect(screen.getByLabelText('メールアドレス')).toBeInTheDocument();
    });

    await user.type(screen.getByLabelText('メールアドレス'), 'test@example.com');
    await user.type(screen.getByLabelText('パスワード'), 'wrongpassword');
    await user.click(screen.getByRole('button', { name: 'ログイン' }));

    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument();
      expect(screen.getByText('Incorrect username or password.')).toBeInTheDocument();
    });

    expect(onLogin).not.toHaveBeenCalled();
  });

  // ── 5. 仮パスワード変更フロー ──
  it('初回ログインでパスワード変更画面が表示される', async () => {
    const user = userEvent.setup();

    mockSignIn.mockResolvedValue({
      nextStep: { signInStep: 'CONFIRM_SIGN_IN_WITH_NEW_PASSWORD_REQUIRED' },
    });

    render(<LoginScreen onLogin={onLogin} />);

    await waitFor(() => {
      expect(screen.getByLabelText('メールアドレス')).toBeInTheDocument();
    });

    await user.type(screen.getByLabelText('メールアドレス'), 'new@example.com');
    await user.type(screen.getByLabelText('パスワード'), 'TempPass123!');
    await user.click(screen.getByRole('button', { name: 'ログイン' }));

    await waitFor(() => {
      expect(screen.getByText('パスワード変更（初回ログイン）')).toBeInTheDocument();
    });

    expect(screen.getByLabelText('新しいパスワード')).toBeInTheDocument();
    expect(screen.getByLabelText('パスワード確認')).toBeInTheDocument();
  });

  it('新しいパスワードが一致しない場合エラーが表示される', async () => {
    const user = userEvent.setup();

    mockSignIn.mockResolvedValue({
      nextStep: { signInStep: 'CONFIRM_SIGN_IN_WITH_NEW_PASSWORD_REQUIRED' },
    });

    render(<LoginScreen onLogin={onLogin} />);

    await waitFor(() => {
      expect(screen.getByLabelText('メールアドレス')).toBeInTheDocument();
    });

    await user.type(screen.getByLabelText('メールアドレス'), 'new@example.com');
    await user.type(screen.getByLabelText('パスワード'), 'TempPass123!');
    await user.click(screen.getByRole('button', { name: 'ログイン' }));

    await waitFor(() => {
      expect(screen.getByLabelText('新しいパスワード')).toBeInTheDocument();
    });

    await user.type(screen.getByLabelText('新しいパスワード'), 'NewPass123!');
    await user.type(screen.getByLabelText('パスワード確認'), 'DifferentPass123!');
    await user.click(screen.getByRole('button', { name: 'パスワードを変更' }));

    await waitFor(() => {
      expect(screen.getByText('パスワードが一致しません。')).toBeInTheDocument();
    });
  });

  it('8文字未満のパスワードはエラーが表示される', async () => {
    const user = userEvent.setup();

    mockSignIn.mockResolvedValue({
      nextStep: { signInStep: 'CONFIRM_SIGN_IN_WITH_NEW_PASSWORD_REQUIRED' },
    });

    render(<LoginScreen onLogin={onLogin} />);

    await waitFor(() => {
      expect(screen.getByLabelText('メールアドレス')).toBeInTheDocument();
    });

    await user.type(screen.getByLabelText('メールアドレス'), 'new@example.com');
    await user.type(screen.getByLabelText('パスワード'), 'TempPass123!');
    await user.click(screen.getByRole('button', { name: 'ログイン' }));

    await waitFor(() => {
      expect(screen.getByLabelText('新しいパスワード')).toBeInTheDocument();
    });

    await user.type(screen.getByLabelText('新しいパスワード'), 'Ab1');
    await user.type(screen.getByLabelText('パスワード確認'), 'Ab1');
    await user.click(screen.getByRole('button', { name: 'パスワードを変更' }));

    await waitFor(() => {
      expect(screen.getByText('パスワードは8文字以上である必要があります。')).toBeInTheDocument();
    });
  });

  it('大文字・小文字・数字が含まれないパスワードはエラーが表示される', async () => {
    const user = userEvent.setup();

    mockSignIn.mockResolvedValue({
      nextStep: { signInStep: 'CONFIRM_SIGN_IN_WITH_NEW_PASSWORD_REQUIRED' },
    });

    render(<LoginScreen onLogin={onLogin} />);

    await waitFor(() => {
      expect(screen.getByLabelText('メールアドレス')).toBeInTheDocument();
    });

    await user.type(screen.getByLabelText('メールアドレス'), 'new@example.com');
    await user.type(screen.getByLabelText('パスワード'), 'TempPass123!');
    await user.click(screen.getByRole('button', { name: 'ログイン' }));

    await waitFor(() => {
      expect(screen.getByLabelText('新しいパスワード')).toBeInTheDocument();
    });

    await user.type(screen.getByLabelText('新しいパスワード'), 'lowercaseonly');
    await user.type(screen.getByLabelText('パスワード確認'), 'lowercaseonly');
    await user.click(screen.getByRole('button', { name: 'パスワードを変更' }));

    await waitFor(() => {
      expect(
        screen.getByText('パスワードは小文字・大文字・数字を含む必要があります。')
      ).toBeInTheDocument();
    });
  });

  it('正しいパスワード変更でログインが完了する', async () => {
    const user = userEvent.setup();

    const expectedUser: User = {
      loginId: 'new-user-uuid',
      displayName: 'new',
      email: 'new@example.com',
    };

    mockSignIn.mockResolvedValue({
      nextStep: { signInStep: 'CONFIRM_SIGN_IN_WITH_NEW_PASSWORD_REQUIRED' },
    });

    mockConfirmSignIn.mockResolvedValue({ isSignedIn: true });

    mockFetchAuthSession.mockResolvedValue({
      tokens: {
        idToken: {
          payload: {
            sub: expectedUser.loginId,
            email: expectedUser.email,
            // custom:userName がない場合はメールのローカル部分が使われる
          },
        },
      },
    });

    render(<LoginScreen onLogin={onLogin} />);

    await waitFor(() => {
      expect(screen.getByLabelText('メールアドレス')).toBeInTheDocument();
    });

    await user.type(screen.getByLabelText('メールアドレス'), 'new@example.com');
    await user.type(screen.getByLabelText('パスワード'), 'TempPass123!');
    await user.click(screen.getByRole('button', { name: 'ログイン' }));

    await waitFor(() => {
      expect(screen.getByLabelText('新しいパスワード')).toBeInTheDocument();
    });

    await user.type(screen.getByLabelText('新しいパスワード'), 'NewStrong1Pass');
    await user.type(screen.getByLabelText('パスワード確認'), 'NewStrong1Pass');
    await user.click(screen.getByRole('button', { name: 'パスワードを変更' }));

    await waitFor(() => {
      expect(onLogin).toHaveBeenCalledWith({
        loginId: 'new-user-uuid',
        displayName: 'new', // email.split('@')[0]
        email: 'new@example.com',
      });
    });

    expect(mockConfirmSignIn).toHaveBeenCalledWith({
      challengeResponse: 'NewStrong1Pass',
    });
  });

  // ── 6. 管理者案内テキスト ──
  it('アカウント作成の案内テキストが表示される', async () => {
    render(<LoginScreen onLogin={onLogin} />);

    await waitFor(() => {
      expect(
        screen.getByText('アカウントをお持ちでない場合は、管理者にお問い合わせください。')
      ).toBeInTheDocument();
    });
  });

  // ── 7. 既存セッションのクリア ──
  it('既存セッションがある場合サインアウトされる', async () => {
    mockGetCurrentUser.mockResolvedValue({ userId: 'existing-user' });
    mockSignOut.mockResolvedValue(undefined);

    render(<LoginScreen onLogin={onLogin} />);

    await waitFor(() => {
      expect(mockGetCurrentUser).toHaveBeenCalled();
    });

    // signOut is called when an existing session is found
    await waitFor(() => {
      expect(mockSignOut).toHaveBeenCalled();
    });
  });
});
