'use client';

import type { Summary, LockState } from '@/types';
import { SUMMARY_MAX_LENGTH } from '@/types';

interface SummarySidebarProps {
  summary: Summary | null;
  isEditing: boolean;
  editContent: string;
  onEditContentChange: (value: string) => void;
  onStartEdit: () => void;
  onSaveEdit: () => void;
  onCancelEdit: () => void;
  onUndo: () => void;
  canEdit: boolean;
  canUndo: boolean;
  lockState: LockState;
  isSummaryProcessing: boolean;
}

/**
 * Summary sidebar panel with edit and undo capabilities.
 *
 * Design notes (Serendie):
 * - Lock state shown as glassmorphism overlay
 * - Editing state highlighted with accent border
 * - AI-generated content has a subtle badge
 */
export function SummarySidebar({
  summary,
  isEditing,
  editContent,
  onEditContentChange,
  onStartEdit,
  onSaveEdit,
  onCancelEdit,
  onUndo,
  canEdit,
  canUndo,
  lockState,
  isSummaryProcessing,
}: SummarySidebarProps) {
  const charCount = isEditing ? editContent.length : (summary?.current?.length ?? 0);
  const isOverLimit = charCount > SUMMARY_MAX_LENGTH;

  return (
    <div className={`sidebar-panel flex flex-col ${isEditing ? 'sidebar-editing' : ''}`}>
      {/* Header */}
      <div className="p-4 border-b border-serendie-gray-200">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-serendie-gray-900">
            要約・議事録
          </h2>
          <span className="text-xs text-serendie-gray-400">
            {charCount} / {SUMMARY_MAX_LENGTH}
          </span>
        </div>

        {/* Lock notification */}
        {lockState.isLocked && lockState.lockedBy && (
          <div className="mt-2 text-sm text-serendie-accent bg-purple-50 rounded-lg px-3 py-2">
            {lockState.operationType === 'edit'
              ? `${lockState.lockedBy}さんが思考中です...`
              : `${lockState.lockedBy}さんが要約に追加中です...`}
          </div>
        )}

        {/* Summary processing */}
        {isSummaryProcessing && (
          <div className="mt-2 flex items-center gap-2 text-sm text-serendie-blue-600">
            <span className="loading-weave" />
            <span>要約を生成中...</span>
          </div>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 relative overflow-y-auto p-4">
        {/* Lock overlay */}
        {lockState.isLocked && !isEditing && (
          <div className="lock-overlay" aria-hidden="true">
            <div className="text-center text-serendie-gray-600">
              <div className="text-2xl mb-2">🔒</div>
              <p className="text-sm">
                {lockState.lockedBy}さんが
                {lockState.operationType === 'edit' ? '編集' : '要約更新'}中
              </p>
            </div>
          </div>
        )}

        {isEditing ? (
          <textarea
            className="w-full h-full min-h-[300px] input-field resize-none font-mono text-sm leading-relaxed"
            value={editContent}
            onChange={(e) => onEditContentChange(e.target.value)}
            maxLength={SUMMARY_MAX_LENGTH}
            aria-label="要約を編集"
            autoFocus
          />
        ) : (
          <div className="prose prose-sm max-w-none">
            {summary?.current ? (
              <pre className="whitespace-pre-wrap text-sm text-serendie-gray-800 font-sans leading-relaxed">
                {summary.current}
              </pre>
            ) : (
              <p className="text-serendie-gray-400 text-center mt-8">
                まだ要約がありません。
                <br />
                チャットからメッセージを選択して
                <br />
                「要約に追加」してください。
              </p>
            )}

            {summary?.updatedBy && (
              <div className="mt-4 pt-3 border-t border-serendie-gray-100 flex items-center gap-1.5">
                <span className="inline-block w-1.5 h-1.5 rounded-full bg-serendie-blue-400" />
                <span className="text-xs text-serendie-gray-400">
                  最終更新: {summary.updatedBy}
                  {summary.updatedAt &&
                    ` (${new Date(summary.updatedAt).toLocaleTimeString('ja-JP')})`}
                </span>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Action buttons */}
      <div className="p-4 border-t border-serendie-gray-200 space-y-2">
        {isEditing ? (
          <div className="flex gap-2">
            <button
              className="btn-primary flex-1"
              onClick={onSaveEdit}
              disabled={isOverLimit}
              aria-label="編集を保存"
            >
              保存
            </button>
            <button
              className="btn-secondary flex-1"
              onClick={onCancelEdit}
              aria-label="編集をキャンセル"
            >
              キャンセル
            </button>
          </div>
        ) : (
          <div className="flex gap-2">
            <button
              className="btn-secondary flex-1"
              onClick={onStartEdit}
              disabled={!canEdit || isSummaryProcessing}
              aria-label="要約を編集"
            >
              ✏️ 編集
            </button>
            <button
              className="btn-secondary flex-1"
              onClick={onUndo}
              disabled={!canUndo}
              aria-label="要約を元に戻す"
            >
              ↩️ 取消
            </button>
          </div>
        )}

        {isOverLimit && (
          <p className="text-xs text-red-500" role="alert">
            要約は{SUMMARY_MAX_LENGTH}文字以内にしてください。
            (現在: {charCount}文字)
          </p>
        )}
      </div>
    </div>
  );
}
