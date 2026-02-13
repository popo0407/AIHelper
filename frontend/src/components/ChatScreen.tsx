'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { ChatHeader } from '@/components/ChatHeader';
import { MessageList } from '@/components/MessageList';
import { MessageInput } from '@/components/MessageInput';
import { SummarySidebar } from '@/components/SummarySidebar';
import { AIHelperButtons } from '@/components/AIHelperButtons';
import { NotificationBanner } from '@/components/NotificationBanner';
import { graphqlClient, extractData } from '@/lib/appsync';
import {
  LIST_MESSAGES,
  GET_SUMMARY,
  GET_LOCKS,
  SEND_MESSAGE,
  UPDATE_SUMMARY,
  UNDO_SUMMARY,
  SAVE_SUMMARY_EDIT,
  ACQUIRE_LOCK,
  RELEASE_LOCK,
  ASK_AI_HELPER,
  CREATE_CONVERSATION,
  ON_NEW_MESSAGE,
  ON_SUMMARY_UPDATE,
  ON_LOCK_CHANGE,
} from '@/graphql/operations';
import type {
  User,
  Conversation,
  Message,
  Summary,
  Lock,
  LockState,
  AIActionType,
} from '@/types';
import { AIHELPER_USER_ID } from '@/types';

interface ChatScreenProps {
  user: User;
  conversation: Conversation;
  onSwitchUser: () => void;
  onSwitchConversation: () => void;
  onNewConversation: (conv: Conversation) => void;
}

/**
 * Main chat screen with 2-pane layout: chat area (left) + summary sidebar (right).
 */
export function ChatScreen({
  user,
  conversation,
  onSwitchUser,
  onSwitchConversation,
  onNewConversation,
}: ChatScreenProps) {
  // ── State ──
  const [messages, setMessages] = useState<Message[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [locks, setLocks] = useState<Lock[]>([]);
  const [selectedMessageIds, setSelectedMessageIds] = useState<Set<string>>(
    new Set()
  );
  const [inputText, setInputText] = useState('');
  const [isEditing, setIsEditing] = useState(false);
  const [editContent, setEditContent] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isSummaryProcessing, setIsSummaryProcessing] = useState(false);
  const [isAIProcessing, setIsAIProcessing] = useState(false);
  const [notification, setNotification] = useState<string | null>(null);
  const [previousSummary, setPreviousSummary] = useState<string>('');

  const messagesEndRef = useRef<HTMLDivElement>(null);

  // ── Derived state ──
  const lockState: LockState = deriveLockState(locks, user.loginId);
  const canAddToSummary =
    selectedMessageIds.size > 0 &&
    !lockState.isEditLocked &&
    !lockState.isSummaryLocked;
  const canEdit = !lockState.isEditLocked && !lockState.isSummaryLocked;
  const canUndo =
    !!summary?.previous && !isSummaryProcessing && !lockState.isSummaryLocked;

  // ── Initial load ──
  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversation.conversationId]);

  // ── Real-time subscriptions ── (DISABLED: スキーマに Subscription がないため)
  // TODO: ポーリングまたは Subscription 再実装
  /*
  useEffect(() => {
    const subscriptions: Array<{ unsubscribe: () => void }> = [];

    try {
      // Subscribe to new messages
      const msgSub = graphqlClient
        .graphql({
          query: ON_NEW_MESSAGE,
          variables: { conversationId: conversation.conversationId },
        })
        .subscribe({
          next: ({ data }: { data: Record<string, Message> }) => {
            const newMsg = data.onNewMessage;
            if (newMsg) {
              setMessages((prev) => {
                // Avoid duplicates (e.g. own optimistic update)
                if (prev.some((m) => m.messageId === newMsg.messageId)) {
                  return prev.map((m) =>
                    m.messageId === newMsg.messageId ? newMsg : m
                  );
                }
                return [...prev, newMsg];
              });
            }
          },
          error: (err: unknown) =>
            console.error('Message subscription error:', err),
        });
      subscriptions.push(msgSub);

      // Subscribe to summary updates
      const sumSub = graphqlClient
        .graphql({
          query: ON_SUMMARY_UPDATE,
          variables: { conversationId: conversation.conversationId },
        })
        .subscribe({
          next: ({ data }: { data: Record<string, Summary> }) => {
            const updated = data.onSummaryUpdate;
            if (updated) setSummary(updated);
          },
          error: (err: unknown) =>
            console.error('Summary subscription error:', err),
        });
      subscriptions.push(sumSub);

      // Subscribe to lock changes
      const lockSub = graphqlClient
        .graphql({
          query: ON_LOCK_CHANGE,
          variables: { conversationId: conversation.conversationId },
        })
        .subscribe({
          next: ({ data }: { data: Record<string, Lock> }) => {
            const lockEvent = data.onLockChange;
            if (lockEvent) {
              setLocks((prev) => {
                if (lockEvent.operationType === 'released') {
                  return prev.filter(
                    (l) => l.userId !== lockEvent.userId
                  );
                }
                const exists = prev.findIndex(
                  (l) =>
                    l.userId === lockEvent.userId &&
                    l.lockType === lockEvent.lockType
                );
                if (exists >= 0) {
                  const next = [...prev];
                  next[exists] = lockEvent;
                  return next;
                }
                return [...prev, lockEvent];
              });
            }
          },
          error: (err: unknown) =>
            console.error('Lock subscription error:', err),
        });
      subscriptions.push(lockSub);
    } catch (err) {
      console.error('Failed to set up subscriptions:', err);
    }

    return () => {
      subscriptions.forEach((sub) => sub.unsubscribe());
    };
  }, [conversation.conversationId]);
  */

  // ── Auto-scroll ──
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // ── Data loading ──
  async function loadData() {
    setIsLoading(true);
    
    // メッセージを読み込み
    try {
      const msgResult = await graphqlClient.graphql({
        query: LIST_MESSAGES,
        variables: { conversationId: conversation.conversationId, limit: 100 },
      });
      const msgData = extractData<{ items: Message[]; nextToken?: string }>(msgResult, 'listMessages');
      setMessages(msgData?.items ?? []);
    } catch (err) {
      console.error('Failed to load messages:', err);
      // GraphQL エラーの詳細を表示
      if (typeof err === 'object' && err !== null && 'errors' in err) {
        const graphqlError = err as { errors?: Array<{ message: string }> };
        if (graphqlError.errors) {
          graphqlError.errors.forEach((e, i) => {
            console.error(`GraphQL Error ${i + 1}:`, e.message);
          });
        }
      }
      setMessages([]);
    }

    // サマリーを読み込み
    try {
      const sumResult = await graphqlClient.graphql({
        query: GET_SUMMARY,
        variables: { conversationId: conversation.conversationId },
      });
      const sumData = extractData<Summary | null>(sumResult, 'getSummary');
      setSummary(sumData ?? null);
    } catch (err) {
      console.error('Failed to load summary:', err);
      setSummary(null);
    }

    // ロックを読み込み
    try {
      const lockResult = await graphqlClient.graphql({
        query: GET_LOCKS,
        variables: { conversationId: conversation.conversationId },
      });
      const lockData = extractData<Lock[]>(lockResult, 'getLocks');
      setLocks(lockData ?? []);
    } catch (err) {
      console.error('Failed to load locks:', err);
      setLocks([]);
    }

    setIsLoading(false);
  }

  // ── Message selection ──
  const toggleMessageSelection = useCallback((messageId: string) => {
    setSelectedMessageIds((prev) => {
      const next = new Set(prev);
      if (next.has(messageId)) {
        next.delete(messageId);
      } else {
        next.add(messageId);
      }
      return next;
    });
  }, []);

  // ── Send message ──
  const handleSendMessage = useCallback(async () => {
    const content = inputText.trim();
    if (!content) return;

    // Optimistic update
    const tempMessage: Message = {
      conversationId: conversation.conversationId,
      messageId: `temp-${Date.now()}`,
      userId: user.loginId,
      displayName: user.displayName,
      content,
      timestamp: new Date().toISOString(),
      isUsedInSummary: false,
    };
    setMessages((prev) => [...prev, tempMessage]);
    setInputText('');

    try {
      const result = await graphqlClient.graphql({
        query: SEND_MESSAGE,
        variables: {
          input: {
            conversationId: conversation.conversationId,
            userId: user.loginId,
            displayName: user.displayName,
            content,
          },
        },
      });
      const data = extractData<{ success: boolean; message: Message; error?: string }>(result, 'sendMessage');
      if (data?.success && data.message) {
        // Replace temp message with server response
        setMessages((prev) =>
          prev.map((m) =>
            m.messageId === tempMessage.messageId ? data.message : m
          )
        );
      }
    } catch (err) {
      console.error('Failed to send message:', err);
    }
  }, [inputText, conversation.conversationId, user]);

  // ── Add to summary ──
  const handleAddToSummary = useCallback(async () => {
    if (selectedMessageIds.size === 0) return;

    setIsSummaryProcessing(true);
    setPreviousSummary(summary?.current ?? '');

    // Show notification
    const selectedMsgs = messages.filter((m) =>
      selectedMessageIds.has(m.messageId)
    );
    const preview = selectedMsgs
      .map((m) => `「${m.content.slice(0, 15)}...」`)
      .join('、');
    setNotification(
      `${user.displayName}さんがチャット${preview}を要約に追加中です。`
    );

    try {
      const result = await graphqlClient.graphql({
        query: UPDATE_SUMMARY,
        variables: {
          input: {
            conversationId: conversation.conversationId,
            selectedMessageIds: Array.from(selectedMessageIds),
            userId: user.loginId,
          },
        },
      });
      const data = extractData<{ success: boolean; summary: Summary; error?: string }>(result, 'updateSummary');
      if (data?.success && data.summary) {
        setSummary(data.summary);
      }

      // Mark messages as used
      setMessages((prev) =>
        prev.map((m) =>
          selectedMessageIds.has(m.messageId)
            ? { ...m, isUsedInSummary: true }
            : m
        )
      );
      setSelectedMessageIds(new Set());
    } catch (err) {
      console.error('Failed to update summary:', err);
    } finally {
      setIsSummaryProcessing(false);
      setNotification(null);
    }
  }, [selectedMessageIds, messages, summary, conversation.conversationId, user]);

  // ── Undo summary ──
  const handleUndoSummary = useCallback(async () => {
    if (!canUndo) return;
    try {
      const result = await graphqlClient.graphql({
        query: UNDO_SUMMARY,
        variables: { conversationId: conversation.conversationId },
      });
      const data = extractData<{ success: boolean; summary: Summary; error?: string }>(result, 'undoSummary');
      if (data?.success && data.summary) {
        setSummary(data.summary);
      }
    } catch (err) {
      console.error('Failed to undo summary:', err);
    }
  }, [canUndo, conversation.conversationId]);

  // ── Edit sidebar ──
  const handleStartEdit = useCallback(async () => {
    if (!canEdit) return;
    setIsEditing(true);
    setEditContent(summary?.current ?? '');
    try {
      await graphqlClient.graphql({
        query: ACQUIRE_LOCK,
        variables: {
          input: {
            conversationId: conversation.conversationId,
            userId: user.loginId,
            operationType: 'edit',
          },
        },
      });
    } catch (err) {
      console.error('Failed to acquire lock:', err);
    }
  }, [canEdit, summary, conversation.conversationId, user.loginId]);

  const handleSaveEdit = useCallback(async () => {
    try {
      const [saveResult] = await Promise.all([
        graphqlClient.graphql({
          query: SAVE_SUMMARY_EDIT,
          variables: {
            input: {
              conversationId: conversation.conversationId,
              content: editContent,
              userId: user.loginId,
            },
          },
        }),
        graphqlClient.graphql({
          query: RELEASE_LOCK,
          variables: {
            input: {
              conversationId: conversation.conversationId,
              userId: user.loginId,
            },
          },
        }),
      ]);
      const data = extractData<{ success: boolean; summary: Summary; error?: string }>(saveResult, 'saveSummaryEdit');
      if (data?.success && data.summary) {
        setSummary(data.summary);
      }
      setIsEditing(false);
    } catch (err) {
      console.error('Failed to save edit:', err);
    }
  }, [editContent, conversation.conversationId, user.loginId]);

  const handleCancelEdit = useCallback(async () => {
    setIsEditing(false);
    setEditContent('');
    try {
      await graphqlClient.graphql({
        query: RELEASE_LOCK,
        variables: {
          input: {
            conversationId: conversation.conversationId,
            userId: user.loginId,
          },
        },
      });
    } catch (err) {
      console.error('Failed to release lock:', err);
    }
  }, [conversation.conversationId, user.loginId]);

  // ── AI Helper actions ──
  const handleAIAction = useCallback(
    async (actionType: AIActionType) => {
      setIsAIProcessing(true);
      const processingMsg =
        actionType === 'answer'
          ? `AIHelperが${user.displayName}さんの質問に回答中です。`
          : `AIHelperが処理中です。`;
      setNotification(processingMsg);

      try {
        const result = await graphqlClient.graphql({
          query: ASK_AI_HELPER,
          variables: {
            input: {
              conversationId: conversation.conversationId,
              userId: user.loginId,
              actionType,
              userInput: inputText || undefined,
              selectedMessageIds:
                selectedMessageIds.size > 0
                  ? Array.from(selectedMessageIds)
                  : undefined,
            },
          },
        });
        const data = extractData<{ success: boolean; message: Message; error?: string }>(result, 'askAIHelper');
        if (data?.success && data.message) {
          setMessages((prev) => [...prev, data.message]);
        }
      } catch (err) {
        console.error('AI Helper error:', err);
      } finally {
        setIsAIProcessing(false);
        setNotification(null);
      }
    },
    [user, conversation.conversationId]
  );

  // ── Copy share link ──
  const handleCopyLink = useCallback(() => {
    const url = `${window.location.origin}/chat?cid=${conversation.conversationId}`;
    navigator.clipboard.writeText(url).then(() => {
      setNotification('リンクをコピーしました');
      setTimeout(() => setNotification(null), 2000);
    });
  }, [conversation.conversationId]);

  // ── Reload data ──
  const handleReload = useCallback(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversation.conversationId]);

  return (
    <div className="flex flex-col h-screen">
      {/* Header */}
      <ChatHeader
        conversationTitle={
          summary?.title || conversation.title || '無題の会話'
        }
        userName={user.displayName}
        onNewConversation={async () => {
          try {
            const result = await graphqlClient.graphql({
              query: CREATE_CONVERSATION,
              variables: { input: { createdBy: user.loginId } },
            });
            const data = extractData<{ success: boolean; conversation: Conversation; error?: string }>(
              result,
              'createConversation'
            );
            if (data?.success && data.conversation) {
              onNewConversation(data.conversation);
            }
          } catch (err) {
            console.error('Failed to create conversation:', err);
          }
        }}
        onSwitchConversation={onSwitchConversation}
        onSwitchUser={onSwitchUser}
        onCopyLink={handleCopyLink}
        onReload={handleReload}
      />

      {/* Notification banner */}
      {notification && <NotificationBanner message={notification} />}

      {/* Main content: 2-pane layout */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left pane: Chat */}
        <div className="flex-1 flex flex-col min-w-0">
          {/* Messages */}
          <MessageList
            messages={messages}
            currentUserId={user.loginId}
            selectedMessageIds={selectedMessageIds}
            onToggleSelect={toggleMessageSelection}
            isLoading={isLoading}
          />
          <div ref={messagesEndRef} />

          {/* AI buttons */}
          <AIHelperButtons
            selectedCount={selectedMessageIds.size}
            inputText={inputText}
            onAction={handleAIAction}
            isProcessing={isAIProcessing}
            lockState={lockState}
          />

          {/* Message input + Add to summary */}
          <div className="border-t border-serendie-gray-200 bg-white p-4">
            <div className="flex items-center gap-3">
              {selectedMessageIds.size > 0 && (
                <button
                  className="btn-primary whitespace-nowrap"
                  onClick={handleAddToSummary}
                  disabled={!canAddToSummary || isSummaryProcessing}
                  aria-label="要約に追加"
                >
                  {isSummaryProcessing ? (
                    <span className="flex items-center gap-2">
                      <span className="loading-weave" />
                      要約中...
                    </span>
                  ) : (
                    `要約に追加 (${selectedMessageIds.size})`
                  )}
                </button>
              )}
              <MessageInput
                value={inputText}
                onChange={setInputText}
                onSend={handleSendMessage}
                disabled={isLoading}
              />
            </div>
          </div>
        </div>

        {/* Right pane: Summary sidebar */}
        <div className="w-96 flex-shrink-0">
          <SummarySidebar
            summary={summary}
            isEditing={isEditing}
            editContent={editContent}
            onEditContentChange={setEditContent}
            onStartEdit={handleStartEdit}
            onSaveEdit={handleSaveEdit}
            onCancelEdit={handleCancelEdit}
            onUndo={handleUndoSummary}
            canEdit={canEdit}
            canUndo={canUndo}
            lockState={lockState}
            isSummaryProcessing={isSummaryProcessing}
          />
        </div>
      </div>
    </div>
  );
}

/** Derive lock state from the locks array. */
function deriveLockState(locks: Lock[], currentUserId: string): LockState {
  const now = Math.floor(Date.now() / 1000);
  const activeLocks = locks.filter(
    (l) => l.ttl === null || l.ttl > now
  );

  const editLock = activeLocks.find((l) => l.operationType === 'edit');
  const summarizeLock = activeLocks.find(
    (l) => l.operationType === 'summarize'
  );

  return {
    isLocked: activeLocks.length > 0,
    lockedBy:
      editLock?.userId ??
      summarizeLock?.userId ??
      null,
    operationType:
      editLock ? 'edit' : summarizeLock ? 'summarize' : null,
    isSummaryLocked: !!summarizeLock && summarizeLock.userId !== currentUserId,
    isEditLocked: !!editLock && editLock.userId !== currentUserId,
  };
}
