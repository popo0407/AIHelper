'use client';

import { AI_BUTTONS, type AIActionType, type LockState } from '@/types';

interface AIHelperButtonsProps {
  selectedCount: number;
  inputText: string;
  onAction: (actionType: AIActionType) => void;
  isProcessing: boolean;
  lockState: LockState;
  excludeButtonIds?: string[];
}

/**
 * AI helper action buttons displayed below the message list.
 *
 * Each button has different enable conditions:
 * - summarize / opinion: requires message selection
 * - next_action: always available
 *
 * Note: The 'answer' button is excluded as its functionality is now
 * integrated into the MessageInput component as the "AI送信" button.
 */
export function AIHelperButtons({
  selectedCount,
  inputText,
  onAction,
  isProcessing,
  lockState,
  excludeButtonIds = [],
}: AIHelperButtonsProps) {
  function isButtonEnabled(button: (typeof AI_BUTTONS)[number]): boolean {
    if (isProcessing) return false;
    if (button.requiresSelection && selectedCount === 0) return false;
    if (button.requiresInput && !inputText.trim()) return false;
    // summarize button is also locked during edit/summarize locks
    if (
      button.id === 'summarize' &&
      (lockState.isEditLocked || lockState.isSummaryLocked)
    ) {
      return false;
    }
    return true;
  }

  return (
    <div className="border-t border-serendie-gray-100 bg-serendie-gray-50 px-4 py-2">
      <div className="flex items-center gap-2 overflow-x-auto">
        <span className="text-xs text-serendie-gray-500 whitespace-nowrap flex-shrink-0">
          AI相談:
        </span>
        {AI_BUTTONS.filter((button) => !excludeButtonIds.includes(button.id)).map((button) => (
          <button
            key={button.id}
            className="px-3 py-1.5 text-xs rounded-full border
              border-serendie-blue-200 text-serendie-blue-700 bg-white
              hover:bg-serendie-blue-50 hover:border-serendie-blue-300
              disabled:opacity-40 disabled:cursor-not-allowed
              transition-colors duration-150 whitespace-nowrap flex-shrink-0
              focus:outline-none focus:ring-2 focus:ring-serendie-blue-400"
            onClick={() => onAction(button.id)}
            disabled={!isButtonEnabled(button)}
            aria-label={button.label}
            title={
              button.requiresSelection && selectedCount === 0
                ? 'メッセージを選択してください'
                : button.requiresInput && !inputText.trim()
                  ? 'テキストを入力してください'
                  : button.label
            }
          >
            {isProcessing ? (
              <span className="flex items-center gap-1">
                <span className="loading-weave w-3 h-3" />
                処理中
              </span>
            ) : (
              button.label
            )}
          </button>
        ))}
      </div>
    </div>
  );
}
