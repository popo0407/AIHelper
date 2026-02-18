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
        graphqlClient
          .graphql({
            query: JOIN_CONVERSATION,
            variables: {
              input: {
                loginId: currentUser.loginId,
                conversationId: cid,
              },
            },
          })
          .then((result) => {
            const data = extractData<{
              success: boolean;
              conversation: Conversation;
              error?: string;
            }>(result as any, 'joinConversation');
            if (data?.success && data.conversation) {
              setCurrentConversation(data.conversation);
            } else {
              // Fallback: still try to open with minimal info
              setCurrentConversation({
                conversationId: cid,
                createdBy: '',
                createdAt: '',
                participants: [],
                status: 'active',
                shareLink: null,
                title: null,
              });
            }
            setScreen('chat');
          })
          .catch(() => {
            setCurrentConversation({
              conversationId: cid,
              createdBy: '',
              createdAt: '',
              participants: [],
              status: 'active',
              shareLink: null,
              title: null,
            });
            setScreen('chat');
          });
      }
    }
  }, [currentUser]);

  const handleLogin = useCallback((user: User) => {
    setCurrentUser(user);
    setScreen('conversations');
  }, []);

  const handleSelectConversation = useCallback((conv: Conversation) => {
    setCurrentConversation(conv);
    setScreen('chat');
  }, []);

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
