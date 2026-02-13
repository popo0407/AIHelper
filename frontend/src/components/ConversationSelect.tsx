'use client';

import { useState, useEffect } from 'react';
import type { User, Conversation } from '@/types';
import { graphqlClient, extractData } from '@/lib/appsync';
import { LIST_CONVERSATIONS, CREATE_CONVERSATION } from '@/graphql/operations';

interface ConversationSelectProps {
  user: User;
  onSelect: (conv: Conversation) => void;
  onNew: (conv: Conversation) => void;
  onSwitchUser: () => void;
}

/**
 * Conversation selection screen – list user's conversations or create a new one.
 */
export function ConversationSelect({
  user,
  onSelect,
  onNew,
  onSwitchUser,
}: ConversationSelectProps) {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    loadConversations();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function loadConversations() {
    setIsLoading(true);
    try {
      const result = await graphqlClient.graphql({
        query: LIST_CONVERSATIONS,
        variables: { loginId: user.loginId },
      });
      const convos = extractData<Conversation[]>(result, 'listConversations');
      setConversations(convos ?? []);
    } catch (err) {
      console.error('Failed to load conversations:', err);
    } finally {
      setIsLoading(false);
    }
  }

  async function handleCreateConversation() {
    setIsLoading(true);
    try {
      const result = await graphqlClient.graphql({
        query: CREATE_CONVERSATION,
        variables: { input: { createdBy: user.loginId } },
      });
      const data = extractData<{ success: boolean; conversation: Conversation; error?: string }>(
        result,
        'createConversation'
      );
      if (!data.success) {
        console.error('Failed to create conversation:', data.error);
        return;
      }
      onNew(data.conversation);
    } catch (err) {
      console.error('Failed to create conversation:', err);
    } finally {
      setIsLoading(false);
    }
  }

  /** Derive display title for a conversation. */
  function getConversationTitle(conv: Conversation, index: number): string {
    if (conv.title) return conv.title;
    return `会話${index + 1}`;
  }

  return (
    <div className="flex-1 flex flex-col">
      {/* Header */}
      <header className="bg-white border-b border-serendie-gray-200 px-6 py-4 flex items-center justify-between">
        <h1 className="text-xl font-bold text-serendie-gray-900">
          会話一覧
        </h1>
        <div className="flex items-center gap-3">
          <span className="text-sm text-serendie-gray-600">
            {user.displayName}
          </span>
          <button
            className="btn-secondary text-sm"
            onClick={onSwitchUser}
            aria-label="ユーザー切り替え"
          >
            ユーザー切り替え
          </button>
        </div>
      </header>

      {/* Content */}
      <div className="flex-1 flex items-start justify-center p-6">
        <div className="w-full max-w-lg space-y-6">
          {/* Create new */}
          <button
            className="btn-primary w-full text-lg py-3"
            onClick={handleCreateConversation}
            disabled={isLoading}
            aria-label="新しい会話を作成"
          >
            ＋ 新しい会話を作成
          </button>

          {/* Conversation list */}
          {isLoading && (
            <div className="flex justify-center py-8">
              <span className="loading-weave" />
            </div>
          )}

          {!isLoading && conversations.length === 0 && (
            <div className="text-center py-12 text-serendie-gray-500">
              <p className="text-lg">まだ会話がありません</p>
              <p className="text-sm mt-1">
                上のボタンから新しい会話を作成してください
              </p>
            </div>
          )}

          {!isLoading && conversations.length > 0 && (
            <div className="space-y-2">
              {conversations.map((conv, index) => (
                <button
                  key={conv.conversationId}
                  className="w-full text-left bg-white rounded-xl border border-serendie-gray-200 p-4
                    hover:border-serendie-blue-300 hover:shadow-sm
                    focus:outline-none focus:ring-2 focus:ring-serendie-blue-400
                    transition-all duration-150"
                  onClick={() => onSelect(conv)}
                  aria-label={`会話「${getConversationTitle(conv, index)}」を開く`}
                >
                  <div className="font-medium text-serendie-gray-900">
                    {getConversationTitle(conv, index)}
                  </div>
                  <div className="text-xs text-serendie-gray-500 mt-1">
                    参加者: {conv.participants.length}名 ・ 作成:{' '}
                    {new Date(conv.createdAt).toLocaleDateString('ja-JP')}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
