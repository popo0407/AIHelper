'use client';

import type { Message } from '@/types';
import { AIHELPER_USER_ID } from '@/types';
import { ChatBubble } from '@/components/ChatBubble';

interface MessageListProps {
  messages: Message[];
  currentUserId: string;
  selectedMessageIds: Set<string>;
  onToggleSelect: (messageId: string) => void;
  isLoading: boolean;
}

/**
 * Scrollable message list with selection support.
 */
export function MessageList({
  messages,
  currentUserId,
  selectedMessageIds,
  onToggleSelect,
  isLoading,
}: MessageListProps) {
  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center">
          <span className="loading-weave" />
          <p className="mt-3 text-serendie-gray-500 text-sm">
            メッセージを読み込み中...
          </p>
        </div>
      </div>
    );
  }

  if (messages.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center text-serendie-gray-500">
          <p className="text-lg">まだメッセージがありません</p>
          <p className="text-sm mt-1">最初のメッセージを送信してみましょう</p>
        </div>
      </div>
    );
  }

  return (
    <div
      className="flex-1 overflow-y-auto px-4 py-3 space-y-3"
      role="log"
      aria-label="チャットメッセージ"
      aria-live="polite"
    >
      {messages.map((message) => {
        const isOwn = message.userId === currentUserId;
        const isAI = message.userId === AIHELPER_USER_ID;
        const isSelected = selectedMessageIds.has(message.messageId);

        return (
          <ChatBubble
            key={message.messageId}
            message={message}
            isOwn={isOwn}
            isAI={isAI}
            isSelected={isSelected}
            onToggleSelect={() => onToggleSelect(message.messageId)}
          />
        );
      })}
    </div>
  );
}
