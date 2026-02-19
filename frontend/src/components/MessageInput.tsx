'use client';

import { useRef, useEffect } from 'react';
import type { SelectionDisplayItem } from '@/types';

interface MessageInputProps {
  value: string;
  onChange: (value: string) => void;
  onSend: () => void;
  onAISend?: () => void;
  disabled?: boolean;
  kbSearchEnabled?: boolean;
  onToggleKbSearch?: () => void;
  hasKnowledgeSources?: boolean;
  /** AI相談用の選択アイテム一覧 */
  selectionItems?: SelectionDisplayItem[];
  /** 選択アイテムを個別に解除するコールバック */
  onRemoveSelection?: (id: string) => void;
}

/**
 * Message input area with auto-resize textarea, KB search toggle,
 * and AI consultation selection display.
 */
export function MessageInput({
  value,
  onChange,
  onSend,
  onAISend,
  disabled = false,
  kbSearchEnabled = false,
  onToggleKbSearch,
  hasKnowledgeSources = false,
  selectionItems = [],
  onRemoveSelection,
}: MessageInputProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-resize
  useEffect(() => {
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.style.height = 'auto';
      textarea.style.height = `${Math.min(textarea.scrollHeight, 120)}px`;
    }
  }, [value]);

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (value.trim()) {
        onSend();
      }
    }
  }

  const hasSelection = selectionItems.length > 0;

  return (
    <div className="flex-1 flex flex-col gap-2">
      {/* Selection display area */}
      <div
        className={`text-sm rounded-lg px-3 py-2 border ${
          hasSelection
            ? 'bg-serendie-blue-50 border-serendie-blue-200 text-serendie-blue-800'
            : 'bg-serendie-gray-50 border-serendie-gray-200 text-serendie-gray-400'
        }`}
        role="status"
        aria-label="AI相談の選択状態"
        aria-live="polite"
      >
        {hasSelection ? (
          <div className="flex items-center gap-1 flex-wrap">
            <span className="font-medium flex-shrink-0">選択中:</span>
            {selectionItems.map((item) => (
              <span
                key={item.id}
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-serendie-blue-100 text-serendie-blue-700 border border-serendie-blue-200"
              >
                {item.type === 'canvas' ? '📋 ' : '💬 '}
                {item.label}
                {onRemoveSelection && (
                  <button
                    onClick={() => onRemoveSelection(item.id)}
                    className="ml-0.5 hover:text-serendie-blue-900 focus:outline-none"
                    aria-label={`${item.label}の選択を解除`}
                  >
                    ×
                  </button>
                )}
              </span>
            ))}
          </div>
        ) : (
          <span>チャットやCANVASをクリックして選択してください</span>
        )}
      </div>

      {/* KB Search Toggle */}
      {hasKnowledgeSources && onToggleKbSearch && (
        <div className="flex items-center gap-2">
          <button
            className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-sm transition-colors ${
              kbSearchEnabled
                ? 'bg-serendie-blue-100 text-serendie-blue-700 border border-serendie-blue-300'
                : 'bg-serendie-gray-100 text-serendie-gray-600 border border-serendie-gray-200 hover:bg-serendie-gray-200'
            }`}
            onClick={onToggleKbSearch}
            aria-pressed={kbSearchEnabled}
            aria-label="ナレッジベース検索を切り替え"
            title={
              kbSearchEnabled
                ? 'ナレッジベース検索: ON（クリックで解除）'
                : 'ナレッジベース検索: OFF（クリックで有効化）'
            }
          >
            <span aria-hidden="true">{kbSearchEnabled ? '📚' : '📁'}</span>
            <span>KB検索</span>
            <span
              className={`inline-block w-3 h-3 rounded-full ${
                kbSearchEnabled ? 'bg-serendie-blue-500' : 'bg-serendie-gray-400'
              }`}
              aria-hidden="true"
            />
          </button>
          {kbSearchEnabled && (
            <span className="text-xs text-serendie-blue-600">
              ナレッジベースから検索して回答します
            </span>
          )}
        </div>
      )}

      {/* Input row */}
      <div className="flex items-end gap-2">
        <textarea
          ref={textareaRef}
          className="input-field resize-none min-h-[40px] max-h-[120px]"
          rows={1}
          placeholder={
            kbSearchEnabled
              ? 'ナレッジベースに質問... (Shift+Enter で改行)'
              : 'メッセージを入力... (Shift+Enter で改行)'
          }
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={disabled}
          aria-label={kbSearchEnabled ? 'ナレッジベース検索入力' : 'メッセージ入力'}
        />
        <button
          className="btn-primary flex-shrink-0"
          onClick={onSend}
          disabled={disabled || !value.trim()}
          aria-label={kbSearchEnabled ? 'ナレッジベースを検索' : 'メッセージを送信'}
        >
          {kbSearchEnabled ? '🔍 検索' : '送信'}
        </button>
        {onAISend && !kbSearchEnabled && (
          <button
            className="btn-secondary flex-shrink-0"
            onClick={onAISend}
            disabled={disabled || !value.trim() || !hasSelection}
            aria-label="AIに質問を送信"
            title={
              !hasSelection
                ? 'チャットまたはCANVASを選択してください'
                : !value.trim()
                  ? 'テキストを入力してください'
                  : 'AI に選択内容と質問を送信'
            }
          >
            AI送信
          </button>
        )}
      </div>
    </div>
  );
}
