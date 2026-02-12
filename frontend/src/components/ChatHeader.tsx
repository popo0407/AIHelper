'use client';

interface ChatHeaderProps {
  conversationTitle: string;
  userName: string;
  onNewConversation: () => void;
  onSwitchConversation: () => void;
  onSwitchUser: () => void;
  onCopyLink: () => void;
  onReload: () => void;
}

/**
 * Chat screen header with navigation and action buttons.
 */
export function ChatHeader({
  conversationTitle,
  userName,
  onNewConversation,
  onSwitchConversation,
  onSwitchUser,
  onCopyLink,
  onReload,
}: ChatHeaderProps) {
  return (
    <header className="bg-white border-b border-serendie-gray-200 px-4 py-3">
      <div className="flex items-center justify-between">
        {/* Left: Title */}
        <div className="flex items-center gap-3 min-w-0">
          <h1
            className="text-lg font-bold text-serendie-gray-900 truncate"
            title={conversationTitle}
          >
            {conversationTitle}
          </h1>
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
