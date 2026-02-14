'use client';

import type { Message } from '@/types';

interface ChatBubbleProps {
  message: Message;
  isOwn: boolean;
  isAI: boolean;
  isSelected: boolean;
  onToggleSelect: () => void;
}

/**
 * Single chat message bubble with selection (highlight) interaction.
 *
 * Visual design follows Serendie design system:
 * - Selected bubbles float up slightly with accent ring
 * - Used-in-summary messages have a left accent border
 * - AI messages have a gradient background
 */
export function ChatBubble({
  message,
  isOwn,
  isAI,
  isSelected,
  onToggleSelect,
}: ChatBubbleProps) {
  const baseClass = isAI
    ? 'chat-bubble chat-bubble-ai'
    : isOwn
      ? 'chat-bubble chat-bubble-own'
      : 'chat-bubble chat-bubble-other';

  const selectedClass = isSelected ? 'chat-bubble-selected' : '';
  const usedClass = message.isUsedInSummary ? 'chat-bubble-used' : '';

  const time = new Date(message.timestamp).toLocaleTimeString('ja-JP', {
    hour: '2-digit',
    minute: '2-digit',
  });

  return (
    <div
      className={`flex ${isOwn ? 'justify-end' : 'justify-start'}`}
      role="article"
      aria-label={`${message.displayName}のメッセージ`}
    >
      <button
        className={`${baseClass} ${selectedClass} ${usedClass} text-left cursor-pointer`}
        onClick={onToggleSelect}
        aria-pressed={isSelected}
        aria-label={`メッセージを${isSelected ? '選択解除' : '選択'}: ${message.content.slice(0, 30)}`}
      >
        {/* Selection indicator (ISSUE 02) */}
        {isSelected && (
          <div className="absolute -top-2 -left-2 w-6 h-6 rounded-full bg-serendie-accent text-white flex items-center justify-center text-xs shadow-md z-10" aria-hidden="true">
            ✓
          </div>
        )}
        {/* Sender name (shown for others & AI) */}
        {!isOwn && (
          <div className="flex items-center gap-1.5 mb-1">
            {isAI && (
              <span
                className="inline-block w-2 h-2 rounded-full bg-serendie-accent"
                aria-hidden="true"
              />
            )}
            <span
              className={`text-xs font-semibold ${
                isAI ? 'text-serendie-accent' : 'text-serendie-blue-600'
              }`}
            >
              {message.displayName}
            </span>
          </div>
        )}

        {/* Content */}
        <p className="whitespace-pre-wrap break-words text-sm leading-relaxed">
          {message.content}
        </p>

        {/* Timestamp */}
        <div
          className={`text-[10px] mt-1 ${
            isOwn ? 'text-blue-100' : 'text-serendie-gray-400'
          } text-right`}
        >
          {time}
        </div>

        {/* Used in summary badge */}
        {message.isUsedInSummary && (
          <div className="absolute -top-1 -right-1">
            <span
              className="inline-block w-3 h-3 rounded-full bg-serendie-blue-400"
              title="要約に含まれています"
              aria-label="要約に含まれたメッセージ"
            />
          </div>
        )}
      </button>
    </div>
  );
}
