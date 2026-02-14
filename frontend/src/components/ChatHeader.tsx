'use client';

import { useState, useRef, useEffect } from 'react';

interface ChatHeaderProps {
  conversationTitle: string;
  userName: string;
  onNewConversation: () => void;
  onSwitchConversation: () => void;
  onSwitchUser: () => void;
  onCopyLink: () => void;
  onReload: () => void;
  onTitleChange?: (newTitle: string) => void;
  onToggleKnowledgebase?: () => void;
  knowledgeSourceCount?: number;
}

/**
 * Chat screen header with navigation and action buttons.
 * Title is editable by clicking on it (ISSUE 05).
 */
export function ChatHeader({
  conversationTitle,
  userName,
  onNewConversation,
  onSwitchConversation,
  onSwitchUser,
  onCopyLink,
  onReload,
  onTitleChange,
  onToggleKnowledgebase,
  knowledgeSourceCount = 0,
}: ChatHeaderProps) {
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [editTitle, setEditTitle] = useState(conversationTitle);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setEditTitle(conversationTitle);
  }, [conversationTitle]);

  useEffect(() => {
    if (isEditingTitle && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditingTitle]);

  function handleTitleClick() {
    if (onTitleChange) {
      setIsEditingTitle(true);
    }
  }

  function handleTitleSave() {
    const trimmed = editTitle.trim();
    if (trimmed && trimmed !== conversationTitle && onTitleChange) {
      onTitleChange(trimmed);
    } else {
      setEditTitle(conversationTitle);
    }
    setIsEditingTitle(false);
  }

  function handleTitleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter') {
      handleTitleSave();
    } else if (e.key === 'Escape') {
      setEditTitle(conversationTitle);
      setIsEditingTitle(false);
    }
  }

  return (
    <header className="bg-white border-b border-serendie-gray-200 px-4 py-3">
      <div className="flex items-center justify-between">
        {/* Left: Title */}
        <div className="flex items-center gap-3 min-w-0">
          {isEditingTitle ? (
            <input
              ref={inputRef}
              type="text"
              className="text-lg font-bold text-serendie-gray-900 border-b-2 border-serendie-blue-500 bg-transparent outline-none px-1 py-0"
              value={editTitle}
              onChange={(e) => setEditTitle(e.target.value)}
              onBlur={handleTitleSave}
              onKeyDown={handleTitleKeyDown}
              maxLength={100}
              aria-label="会話タイトルを編集"
            />
          ) : (
            <h1
              className={`text-lg font-bold text-serendie-gray-900 truncate ${
                onTitleChange ? 'cursor-pointer hover:text-serendie-blue-600 transition-colors' : ''
              }`}
              title={onTitleChange ? 'クリックしてタイトルを編集' : conversationTitle}
              onClick={handleTitleClick}
              role={onTitleChange ? 'button' : undefined}
              tabIndex={onTitleChange ? 0 : undefined}
              onKeyDown={onTitleChange ? (e) => { if (e.key === 'Enter') handleTitleClick(); } : undefined}
            >
              {conversationTitle}
              {onTitleChange && (
                <span className="ml-1 text-serendie-gray-400 text-sm" aria-hidden="true">✏️</span>
              )}
            </h1>
          )}
        </div>

        {/* Right: Buttons */}
        <div className="flex items-center gap-2 flex-shrink-0">
          <button
            className="btn-secondary text-sm"
            onClick={onNewConversation}
            aria-label="新しい会話を作成"
          >
            新しい会話
          </button>
          <button
            className="btn-secondary text-sm"
            onClick={onSwitchConversation}
            aria-label="別の会話に移動"
          >
            別の会話に移動
          </button>
          <button
            className="btn-secondary text-sm"
            onClick={onSwitchUser}
            aria-label="ユーザー切り替え"
          >
            ユーザー切り替え
          </button>
          {onToggleKnowledgebase && (
            <button
              className="btn-secondary text-sm relative"
              onClick={onToggleKnowledgebase}
              aria-label="ナレッジベースを開く"
              title="ナレッジベース管理"
            >
              📚 ナレッジベース
              {knowledgeSourceCount > 0 && (
                <span className="absolute -top-1 -right-1 bg-serendie-blue-500 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center">
                  {knowledgeSourceCount}
                </span>
              )}
            </button>
          )}
          <button
            className="btn-secondary text-sm"
            onClick={onCopyLink}
            aria-label="リンクコピー"
            title="会話リンクをコピー"
          >
            🔗 リンクコピー
          </button>
          <button
            className="btn-secondary text-sm"
            onClick={onReload}
            aria-label="セッション再読み込み"
            title="データを再読み込み"
          >
            🔄
          </button>
          <span className="text-sm text-serendie-gray-600 ml-2">
            {userName}
          </span>
        </div>
      </div>
    </header>
  );
}
