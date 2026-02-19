'use client';

import { useState, useEffect } from 'react';
import type { Summary, LockState, PromptTemplate, PromptType } from '@/types';
import { SUMMARY_MAX_LENGTH, PROMPT_TYPES } from '@/types';

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
  onAddToSummary?: () => void;
  canAddToSummary?: boolean;
  selectedMessageCount?: number;
  onUpdatePromptType?: (promptType: PromptType, customPromptText?: string) => void;
  promptTemplates?: PromptTemplate[];
}

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
  onAddToSummary,
  canAddToSummary = false,
  selectedMessageCount = 0,
  onUpdatePromptType,
  promptTemplates = [],
}: SummarySidebarProps) {
  const [copyStatus, setCopyStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [copyMessage, setCopyMessage] = useState('');

  const currentPromptType: PromptType =
    (summary?.selectedPromptType as PromptType) ?? 'summary';
  const [localCustomText, setLocalCustomText] = useState<string>(
    summary?.customPromptText ?? ''
  );

  useEffect(() => {
    setLocalCustomText(summary?.customPromptText ?? '');
  }, [summary?.customPromptText]);

  const charCount = isEditing ? editContent.length : (summary?.current?.length ?? 0);
  const isOverLimit = charCount > SUMMARY_MAX_LENGTH;

  useEffect(() => {
    if (copyStatus !== 'idle') {
      const timer = setTimeout(() => {
        setCopyStatus('idle');
        setCopyMessage('');
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [copyStatus]);

  const handleCopySummary = async () => {
    const textToCopy = isEditing ? editContent : (summary?.current ?? '');
    if (!textToCopy) {
      setCopyStatus('error');
      setCopyMessage('コピーするテキストがありません');
      return;
    }
    try {
      await navigator.clipboard.writeText(textToCopy);
      setCopyStatus('success');
      setCopyMessage('コピーしました！');
    } catch {
      setCopyStatus('error');
      setCopyMessage('コピーに失敗しました');
    }
  };

  const handlePromptTypeChange = (newType: PromptType) => {
    if (onUpdatePromptType) {
      onUpdatePromptType(newType, newType === 'custom' ? localCustomText : undefined);
    }
  };

  const handleCustomTextBlur = () => {
    if (currentPromptType === 'custom' && onUpdatePromptType) {
      onUpdatePromptType('custom', localCustomText);
    }
  };

  const getTemplateHint = (): string | null => {
    if (currentPromptType === 'custom') return null;
    const tpl = promptTemplates.find((t) => t.promptType === currentPromptType);
    return tpl?.promptText ?? null;
  };

  const templateHint = getTemplateHint();

  return (
    <div className={`sidebar-panel flex flex-col ${isEditing ? 'sidebar-editing' : ''}`}>
      <div className="p-4 border-b border-serendie-gray-200">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-lg font-bold text-serendie-gray-900 flex-shrink-0">
            CANVAS
          </h2>

          <select
            className="flex-1 min-w-0 text-sm border border-serendie-gray-300 rounded px-2 py-1 bg-white text-serendie-gray-800 focus:outline-none focus:ring-1 focus:ring-serendie-blue-400 cursor-pointer"
            value={currentPromptType}
            onChange={(e) => handlePromptTypeChange(e.target.value as PromptType)}
            aria-label="プロンプト種別を選択"
            disabled={isSummaryProcessing || lockState.isLocked}
          >
            {PROMPT_TYPES.map(({ value, label }) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>

          <button
            onClick={handleCopySummary}
            disabled={!summary?.current || isEditing}
            className="flex-shrink-0 p-1 rounded hover:bg-serendie-gray-100 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            aria-label="CANVASをコピー"
            title="CANVASをコピー"
          >
            {copyStatus === 'success' ? (
              <span className="text-green-500" aria-label="コピー成功">✓</span>
            ) : (
              <span className="text-serendie-gray-600">📋</span>
            )}
          </button>

          <span className="flex-shrink-0 text-xs text-serendie-gray-400">
            {charCount} / {SUMMARY_MAX_LENGTH}
          </span>
        </div>

        {copyStatus !== 'idle' && (
          <div
            className={`mt-2 text-sm p-2 rounded ${
              copyStatus === 'success' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'
            }`}
            role="status"
            aria-live="polite"
          >
            {copyMessage}
          </div>
        )}

        {currentPromptType === 'custom' && (
          <div className="mt-2">
            <label className="block text-xs text-serendie-gray-600 mb-1">
              カスタムプロンプト
            </label>
            <textarea
              className="w-full text-sm border border-serendie-gray-300 rounded px-2 py-1 resize-none focus:outline-none focus:ring-1 focus:ring-serendie-blue-400"
              rows={4}
              placeholder="AIへの指示を入力してください..."
              value={localCustomText}
              onChange={(e) => setLocalCustomText(e.target.value)}
              onBlur={handleCustomTextBlur}
              aria-label="カスタムプロンプトを入力"
              disabled={isSummaryProcessing || lockState.isLocked}
            />
            <p className="text-xs text-serendie-gray-400 mt-1">
              {`{current_summary}`} と {`{selected_messages}`} が利用可能です
            </p>
          </div>
        )}

        {currentPromptType !== 'custom' && templateHint && (
          <details className="mt-2">
            <summary className="text-xs text-serendie-gray-500 cursor-pointer select-none hover:text-serendie-gray-700">
              プロンプト内容を確認
            </summary>
            <pre className="mt-1 text-xs text-serendie-gray-600 bg-serendie-gray-50 rounded p-2 whitespace-pre-wrap max-h-24 overflow-y-auto">
              {templateHint}
            </pre>
          </details>
        )}

        {selectedMessageCount > 0 && (
          <button
            className="mt-2 w-full btn-primary text-sm"
            onClick={onAddToSummary}
            disabled={!canAddToSummary || isSummaryProcessing}
            aria-label="CANVASに追加"
          >
            {isSummaryProcessing ? (
              <span className="flex items-center justify-center gap-2">
                <span className="loading-weave" />
                生成中...
              </span>
            ) : (
              `CANVASに追加 (${selectedMessageCount})`
            )}
          </button>
        )}

        {lockState.isLocked && lockState.lockedBy && (
          <div className="mt-2 text-sm text-serendie-accent bg-purple-50 rounded-lg px-3 py-2">
            {lockState.operationType === 'edit'
              ? `${lockState.lockedBy}さんが思考中です...`
              : `${lockState.lockedBy}さんが要約に追加中です...`}
          </div>
        )}

        {isSummaryProcessing && (
          <div className="mt-2 flex items-center gap-2 text-sm text-serendie-blue-600">
            <span className="loading-weave" />
            <span>要約を生成中...</span>
          </div>
        )}
      </div>

      <div className="flex-1 relative overflow-y-auto p-4">
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
                まだ内容がありません。
                <br />
                チャットからメッセージを選択して
                <br />
                「CANVASに追加」してください。
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
            要約は{SUMMARY_MAX_LENGTH}文字以内にしてください。 (現在: {charCount}文字)
          </p>
        )}
      </div>
    </div>
  );
}