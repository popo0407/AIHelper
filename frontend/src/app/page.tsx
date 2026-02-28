'use client';

import { useState, useEffect, useCallback } from 'react';
import { LoginScreen } from '@/components/LoginScreen';
import { ConversationSelect } from '@/components/ConversationSelect';
import { ChatScreen } from '@/components/ChatScreen';
import { graphqlClient, extractData } from '@/lib/appsync';
import { JOIN_CONVERSATION } from '@/graphql/operations';
import type { User, Conversation } from '@/types';

/** Application screens */
type Screen = 'login' | 'conversations' | 'chat';

export default function Home() {
  const [screen, setScreen] = useState<Screen>('login');
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [currentConversation, setCurrentConversation] =
    useState<Conversation | null>(null);

  // Check URL for shared conversation link
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      const cid = params.get('cid');
      if (cid && currentUser) {
        // Auto-join conversation via share link
        (async () => {
          const fallback: Conversation = {
            conversationId: cid,
            createdBy: '',
            createdAt: '',
            participants: [],
            status: 'active',
            shareLink: null,
            title: null,
          };
          try {
            const result = await (graphqlClient.graphql({
              query: JOIN_CONVERSATION,
              variables: {
                input: {
                  loginId: currentUser.loginId,
                  conversationId: cid,
                },
              },
            }) as Promise<unknown>);
            const data = extractData<{
              success: boolean;
              conversation: Conversation;
              error?: string;
            }>(result as any, 'joinConversation');
            setCurrentConversation(
              data?.success && data.conversation ? data.conversation : fallback,
            );
          } catch {
            setCurrentConversation(fallback);
          }
          setScreen('chat');
        })();
      }
    }
  }, [currentUser]);

  const handleLogin = useCallback((user: User) => {
    setCurrentUser(user);
    setScreen('conversations');
  }, []);

  const handleSelectConversation = useCallback(
    async (conv: Conversation) => {
      if (currentUser) {
        try {
          await graphqlClient.graphql({
            query: JOIN_CONVERSATION,
            variables: {
              input: {
                loginId: currentUser.loginId,
                conversationId: conv.conversationId,
              },
            },
          });
        } catch {
          // joinConversation失敗しても会話は開く（冪等性のため）
        }
      }
      setCurrentConversation(conv);
      setScreen('chat');
    },
    [currentUser],
  );

  const handleNewConversation = useCallback((conv: Conversation) => {
    setCurrentConversation(conv);
    setScreen('chat');
  }, []);

  const handleSwitchUser = useCallback(() => {
    setCurrentUser(null);
    setCurrentConversation(null);
    setScreen('login');
  }, []);

  const handleSwitchConversation = useCallback(() => {
    setScreen('conversations');
  }, []);

  return (
    <main className="h-screen flex flex-col">
      {screen === 'login' && <LoginScreen onLogin={handleLogin} />}
      {screen === 'conversations' && currentUser && (
        <ConversationSelect
          user={currentUser}
          onSelect={handleSelectConversation}
          onNew={handleNewConversation}
          onSwitchUser={handleSwitchUser}
        />
      )}
      {screen === 'chat' && currentUser && currentConversation && (
        <ChatScreen
          user={currentUser}
          conversation={currentConversation}
          onSwitchUser={handleSwitchUser}
          onSwitchConversation={handleSwitchConversation}
          onNewConversation={handleNewConversation}
        />
      )}
    </main>
  );
}
