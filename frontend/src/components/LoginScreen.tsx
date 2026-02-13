'use client';

import { useState } from 'react';
import { signIn, confirmSignIn, fetchAuthSession } from 'aws-amplify/auth';
import type { User } from '@/types';
import { graphqlClient, extractData } from '@/lib/appsync';
import { REGISTER_USER } from '@/graphql/operations';

// Initialize Amplify (via appsync client)
import '@/lib/appsync';

interface LoginScreenProps {
  onLogin: (user: User) => void;
}

/**
 * Login screen with email + password authentication via Cognito.
 * User registration is administered only - no self-signup.
 */
export function LoginScreen({ onLogin }: LoginScreenProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [requireNewPassword, setRequireNewPassword] = useState(false);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setError('');

    if (!email.trim() || !password.trim()) {
      setError('メールアドレスとパスワードを入力してください。');
      return;
    }

    setIsLoading(true);
    try {
      const result = await signIn({ username: email, password });
      
      // Check if password change is required (first login)
      if (result.nextStep.signInStep === 'CONFIRM_SIGN_IN_WITH_NEW_PASSWORD_REQUIRED') {
        setRequireNewPassword(true);
        setIsLoading(false);
        return;
      }

      // Successful login - get user info
      const session = await fetchAuthSession();
      const idToken = session.tokens?.idToken;
      
      if (!idToken) {
        throw new Error('認証トークンの取得に失敗しました。');
      }

      // Extract user info from ID token
      const userId = idToken.payload.sub as string;
      const userEmail = idToken.payload.email as string;
      const userName = (idToken.payload['custom:userName'] as string) || userEmail.split('@')[0];

      const user: User = {
        loginId: userId,
        displayName: userName,
        createdAt: new Date().toISOString(),
        conversationIds: [],
      };

      // Register user in DynamoDB
      try {
        const registerResult = await graphqlClient.graphql({
          query: REGISTER_USER,
          variables: {
            input: {
              loginId: userId,
              displayName: userName,
            },
          },
        });
        const registerData = extractData<{
          success: boolean;
          user: User;
          error?: string;
        }>(registerResult, 'registerUser');

        if (registerData.success && registerData.user) {
          onLogin(registerData.user);
        } else {
          // Fall back to Cognito user if registration fails
          console.warn('User registration failed:', registerData.error);
          onLogin(user);
        }
      } catch (registerErr) {
        console.warn('User registration error:', registerErr);
        onLogin(user);
      }
    } catch (err: unknown) {
      console.error('Login error:', err);
      const message =
        err instanceof Error ? err.message : 'ログインに失敗しました。';
      setError(message);
    } finally {
      setIsLoading(false);
    }
  }

  async function handleChangePassword(e: React.FormEvent) {
    e.preventDefault();
    setError('');

    if (!newPassword.trim() || !confirmPassword.trim()) {
      setError('新しいパスワードと確認用パスワードを入力してください。');
      return;
    }

    if (newPassword !== confirmPassword) {
      setError('パスワードが一致しません。');
      return;
    }

    if (newPassword.length < 8) {
      setError('パスワードは8文字以上である必要があります。');
      return;
    }

    // Validate password complexity
    const hasLowercase = /[a-z]/.test(newPassword);
    const hasUppercase = /[A-Z]/.test(newPassword);
    const hasNumber = /\d/.test(newPassword);
    
    if (!hasLowercase || !hasUppercase || !hasNumber) {
      setError('パスワードは小文字・大文字・数字を含む必要があります。');
      return;
    }

    setIsLoading(true);
    try {
      await confirmSignIn({ challengeResponse: newPassword });
      
      // Get user info after password change
      const session = await fetchAuthSession();
      const idToken = session.tokens?.idToken;
      
      if (!idToken) {
        throw new Error('認証トークンの取得に失敗しました。');
      }

      const userId = idToken.payload.sub as string;
      const userEmail = idToken.payload.email as string;
      const userName = (idToken.payload['custom:userName'] as string) || userEmail.split('@')[0];

      onLogin({
        userId,
        email: userEmail,
        userName,
        createdAt: new Date().toISOString(),
      });
    } catch (err: unknown) {
      console.error('Password change error:', err);
      const message =
        err instanceof Error ? err.message : 'パスワード変更に失敗しました。';
      setError(message);
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="flex-1 flex items-center justify-center p-4">
      <div className="w-full max-w-md space-y-8">
        {/* Title */}
        <div className="text-center">
          <h1 className="text-3xl font-bold text-serendie-gray-900">
            AI常駐型グループチャット
          </h1>
          <p className="mt-2 text-serendie-gray-600">
            メールアドレスとパスワードでログインしてください
          </p>
        </div>

        {/* Login form */}
        {!requireNewPassword ? (
          <div className="bg-white rounded-xl shadow-sm border border-serendie-gray-200 p-6">
            <h2 className="text-lg font-semibold text-serendie-gray-800 mb-4">
              ログイン
            </h2>

            {error && (
              <div
                className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm mb-4"
                role="alert"
              >
                {error}
              </div>
            )}

            <form onSubmit={handleLogin} className="space-y-4">
              <div>
                <label
                  htmlFor="email"
                  className="block text-sm font-medium text-serendie-gray-700 mb-1"
                >
                  メールアドレス
                </label>
                <input
                  id="email"
                  type="email"
                  className="input-field"
                  placeholder="user@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  disabled={isLoading}
                  autoComplete="email"
                  required
                />
              </div>

              <div>
                <label
                  htmlFor="password"
                  className="block text-sm font-medium text-serendie-gray-700 mb-1"
                >
                  パスワード
                </label>
                <input
                  id="password"
                  type="password"
                  className="input-field"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  disabled={isLoading}
                  autoComplete="current-password"
                  required
                />
              </div>

              <button
                type="submit"
                className="btn-primary w-full"
                disabled={!email.trim() || !password.trim() || isLoading}
              >
                {isLoading ? (
                  <span className="flex items-center justify-center gap-2">
                    <span className="loading-weave" />
                    ログイン中...
                  </span>
                ) : (
                  'ログイン'
                )}
              </button>
            </form>

            <p className="mt-4 text-center text-sm text-serendie-gray-600">
              アカウントをお持ちでない場合は、管理者にお問い合わせください。
            </p>
          </div>
        ) : (
          /* Password change form (first login) */
          <div className="bg-white rounded-xl shadow-sm border border-serendie-gray-200 p-6">
            <h2 className="text-lg font-semibold text-serendie-gray-800 mb-4">
              パスワード変更（初回ログイン）
            </h2>

            <p className="text-sm text-serendie-gray-600 mb-4">
              仮パスワードでログインしました。新しいパスワードを設定してください。
            </p>

            {error && (
              <div
                className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm mb-4"
                role="alert"
              >
                {error}
              </div>
            )}

            <form onSubmit={handleChangePassword} className="space-y-4">
              <div>
                <label
                  htmlFor="newPassword"
                  className="block text-sm font-medium text-serendie-gray-700 mb-1"
                >
                  新しいパスワード
                </label>
                <input
                  id="newPassword"
                  type="password"
                  className="input-field"
                  placeholder="8文字以上（大小英字・数字）"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  disabled={isLoading}
                  autoComplete="new-password"
                  required
                />
              </div>

              <div>
                <label
                  htmlFor="confirmPassword"
                  className="block text-sm font-medium text-serendie-gray-700 mb-1"
                >
                  パスワード確認
                </label>
                <input
                  id="confirmPassword"
                  type="password"
                  className="input-field"
                  placeholder="もう一度入力"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  disabled={isLoading}
                  autoComplete="new-password"
                  required
                />
              </div>

              <button
                type="submit"
                className="btn-primary w-full"
                disabled={!newPassword.trim() || !confirmPassword.trim() || isLoading}
              >
                {isLoading ? (
                  <span className="flex items-center justify-center gap-2">
                    <span className="loading-weave" />
                    変更中...
                  </span>
                ) : (
                  'パスワードを変更'
                )}
              </button>
            </form>
          </div>
        )}
      </div>
    </div>
  );
}
