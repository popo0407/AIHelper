'use client';

import { useRef, useEffect } from 'react';

interface MessageInputProps {
  value: string;
  onChange: (value: string) => void;
  onSend: () => void;
  disabled?: boolean;
}

/**
 * Message input area with auto-resize textarea.
 */
export function MessageInput({
  value,
  onChange,
  onSend,
  disabled = false,
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

  return (
    <div className="flex-1 flex items-end gap-2">
      <textarea
        ref={textareaRef}
        className="input-field resize-none min-h-[40px] max-h-[120px]"
        rows={1}
        placeholder="メッセージを入力... (Shift+Enter で改行)"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={handleKeyDown}
        disabled={disabled}
        aria-label="メッセージ入力"
      />
      <button
        className="btn-primary flex-shrink-0"
        onClick={onSend}
        disabled={disabled || !value.trim()}
        aria-label="メッセージを送信"
      >
        送信
      </button>
    </div>
  );
}
