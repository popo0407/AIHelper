'use client';

import { useState, useEffect } from 'react';
import type { User } from '@/types';
import { graphqlClient, extractData } from '@/lib/appsync';
import { LIST_USERS, REGISTER_USER } from '@/graphql/operations';

interface LoginScreenProps {
  onLogin: (user: User) => void;
}

/**
 * Login screen with user selection dropdown and new user registration.
 */
export function LoginScreen({ onLogin }: LoginScreenProps) {
  const [users, setUsers] = useState<User[]>([]);
  const [selectedUserId, setSelectedUserId] = useState('');
  const [newLoginId, setNewLoginId] = useState('');
  const [newDisplayName, setNewDisplayName] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  // Load users on mount
  useEffect(() => {
    loadUsers();
  }, []);

  async function loadUsers() {
    setIsLoading(true);
    try {
      const result = await graphqlClient.graphql({ query: LIST_USERS });
      const users = extractData<User[]>(result, 'listUsers');
      setUsers(users ?? []);
    } catch (err) {
      console.error('Failed to load users:', err);
    } finally {
      setIsLoading(false);
    }
  }

  function handleSelectUser() {
    if (!selectedUserId) return;
    const user = users.find((u) => u.loginId === selectedUserId);
    if (user) {
      onLogin(user);
    }
  }

  async function handleRegister() {
    setError('');
    const loginId = newLoginId.trim();
    const displayName = newDisplayName.trim();

    if (!loginId || !displayName) {
      setError('ログインIDと表示名を入力してください。');
      return;
    }

    setIsLoading(true);
    try {
      const result = await graphqlClient.graphql({
        query: REGISTER_USER,
        variables: { input: { loginId, displayName } },
      });
      const data = extractData<{ success: boolean; user: User; error?: string }>(
        result,
        'registerUser'
      );
      if (!data.success) {
        setError(data.error ?? '登録に失敗しました。');
        return;
      }
      onLogin(data.user);
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : '登録中にエラーが発生しました。';
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
            ログインまたは新規登録してください
          </p>
        </div>

        {/* Existing user selection */}
        <div className="bg-white rounded-xl shadow-sm border border-serendie-gray-200 p-6 space-y-4">
          <h2 className="text-lg font-semibold text-serendie-gray-800">
            ユーザーを選択
          </h2>
          <div className="space-y-3">
            <select
              className="input-field"
              value={selectedUserId}
              onChange={(e) => setSelectedUserId(e.target.value)}
              aria-label="登録済みユーザーを選択"
              disabled={isLoading}
            >
              <option value="">-- ユーザーを選んでください --</option>
              {users.map((user) => (
                <option key={user.loginId} value={user.loginId}>
                  {user.displayName} ({user.loginId})
                </option>
              ))}
            </select>
            <button
              className="btn-primary w-full"
              onClick={handleSelectUser}
              disabled={!selectedUserId || isLoading}
              aria-label="選択したユーザーでログイン"
            >
              ログイン
            </button>
          </div>
        </div>

        {/* Divider */}
        <div className="relative">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-serendie-gray-300" />
          </div>
          <div className="relative flex justify-center text-sm">
            <span className="bg-serendie-gray-50 px-4 text-serendie-gray-500">
              OR
            </span>
          </div>
        </div>

        {/* New user registration */}
        <div className="bg-white rounded-xl shadow-sm border border-serendie-gray-200 p-6 space-y-4">
          <h2 className="text-lg font-semibold text-serendie-gray-800">
            新規ユーザー登録
          </h2>

          {error && (
            <div
              className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm"
              role="alert"
            >
              {error}
            </div>
          )}

          <div className="space-y-3">
            <div>
              <label
                htmlFor="loginId"
                className="block text-sm font-medium text-serendie-gray-700 mb-1"
              >
                ログインID
              </label>
              <input
                id="loginId"
                type="text"
                className="input-field"
                placeholder="例: tanaka"
                value={newLoginId}
                onChange={(e) => setNewLoginId(e.target.value)}
                disabled={isLoading}
              />
            </div>
            <div>
              <label
                htmlFor="displayName"
                className="block text-sm font-medium text-serendie-gray-700 mb-1"
              >
                表示名
              </label>
              <input
                id="displayName"
                type="text"
                className="input-field"
                placeholder="例: 田中太郎"
                value={newDisplayName}
                onChange={(e) => setNewDisplayName(e.target.value)}
                disabled={isLoading}
              />
            </div>
            <button
              className="btn-accent w-full"
              onClick={handleRegister}
              disabled={
                !newLoginId.trim() || !newDisplayName.trim() || isLoading
              }
              aria-label="新規ユーザーを登録"
            >
              {isLoading ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="loading-weave" />
                  登録中...
                </span>
              ) : (
                '登録'
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
