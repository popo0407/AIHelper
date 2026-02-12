'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { ChatHeader } from '@/components/ChatHeader';
import { MessageList } from '@/components/MessageList';
import { MessageInput } from '@/components/MessageInput';
import { SummarySidebar } from '@/components/SummarySidebar';
import { AIHelperButtons } from '@/components/AIHelperButtons';
import { NotificationBanner } from '@/components/NotificationBanner';
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

  // ── Auto-scroll ──
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // ── Data loading ──
  async function loadData() {
    setIsLoading(true);
    try {
      // TODO: Replace with AppSync queries
      setMessages([]);
      setSummary(null);
      setLocks([]);
    } catch (err) {
      console.error('Failed to load data:', err);
    } finally {
      setIsLoading(false);
    }
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
      // TODO: Replace with AppSync mutation (sendMessage)
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
      // TODO: Replace with AppSync mutation (updateSummary)
      // Mock: simulate delay
      await new Promise((r) => setTimeout(r, 1500));

      const newSummary: Summary = {
        conversationId: conversation.conversationId,
        title: '会話の要約',
        current: `# 会話の要約\n\n## 追加された内容\n${selectedMsgs
          .map((m) => `- ${m.displayName}: ${m.content}`)
          .join('\n')}`,
        previous: summary?.current ?? '',
        updatedAt: new Date().toISOString(),
        updatedBy: user.loginId,
      };
      setSummary(newSummary);

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
      // TODO: Replace with AppSync mutation (undoSummary)
      setSummary((prev) =>
        prev
          ? { ...prev, current: prev.previous ?? '', previous: '' }
          : null
      );
    } catch (err) {
      console.error('Failed to undo summary:', err);
    }
  }, [canUndo]);

  // ── Edit sidebar ──
  const handleStartEdit = useCallback(() => {
    if (!canEdit) return;
    setIsEditing(true);
    setEditContent(summary?.current ?? '');
    // TODO: acquireLock mutation
  }, [canEdit, summary]);

  const handleSaveEdit = useCallback(async () => {
    try {
      // TODO: Replace with AppSync mutation (saveSummaryEdit) + releaseLock
      setSummary((prev) =>
        prev
          ? {
              ...prev,
              current: editContent,
              previous: prev.current ?? '',
              updatedAt: new Date().toISOString(),
              updatedBy: user.loginId,
            }
          : null
      );
      setIsEditing(false);
    } catch (err) {
      console.error('Failed to save edit:', err);
    }
  }, [editContent, user.loginId]);

  const handleCancelEdit = useCallback(() => {
    setIsEditing(false);
    setEditContent('');
    // TODO: releaseLock mutation
  }, []);

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
        // TODO: Replace with AppSync mutation (askAIHelper)
        await new Promise((r) => setTimeout(r, 2000));

        const aiMessage: Message = {
          conversationId: conversation.conversationId,
          messageId: `ai-${Date.now()}`,
          userId: AIHELPER_USER_ID,
          displayName: 'AIHelper',
          content: `【モック応答】${actionType}の結果です。実際のAI応答はBedrock接続時に生成されます。`,
          timestamp: new Date().toISOString(),
          isUsedInSummary: false,
        };
        setMessages((prev) => [...prev, aiMessage]);
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
        onNewConversation={() => {
          const newConv: Conversation = {
            conversationId: crypto.randomUUID(),
            createdBy: user.loginId,
            createdAt: new Date().toISOString(),
            participants: [user.loginId],
            status: 'active',
            shareLink: null,
            title: '新しい会話',
          };
          onNewConversation(newConv);
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
