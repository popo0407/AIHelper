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
  /** CANVAS\u304c AI\u76f8\u8ac7\u7528\u306b\u9078\u629e\u3055\u308c\u3066\u3044\u308b\u304b */
  isCanvasSelected?: boolean;
  /** CANVAS\u9078\u629e\u30c8\u30b0\u30eb */
  onToggleCanvasSelection?: () => void;
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
  isCanvasSelected = false,
  onToggleCanvasSelection,
}: SummarySidebarProps) {
  const [copyStatus, setCopyStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [copyMessage, setCopyMessage] = useState('');
  const [showCustomModal, setShowCustomModal] = useState(false);
  const [modalDraftText, setModalDraftText] = useState<string>('');
  const [prevPromptType, setPrevPromptType] = useState<PromptType>('summary');

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
    if (newType === 'custom') {
      // カスタム選択時はモーダルを開く
      setPrevPromptType(currentPromptType);
      setModalDraftText(localCustomText);
      setShowCustomModal(true);
    } else if (onUpdatePromptType) {
      onUpdatePromptType(newType);
    }
  };

  const handleOpenCustomModal = () => {
    setModalDraftText(localCustomText);
    setShowCustomModal(true);
  };

  const handleSaveCustomPrompt = () => {
    const trimmed = modalDraftText.trim();
    if (!trimmed) return;
    setLocalCustomText(trimmed);
    setShowCustomModal(false);
    if (onUpdatePromptType) {
      onUpdatePromptType('custom', trimmed);
    }
  };

  const handleCancelCustomModal = () => {
    setShowCustomModal(false);
    // カスタムプロンプトが未保存の場合は前の種別に戻す
    if (!localCustomText && onUpdatePromptType && prevPromptType !== 'custom') {
      onUpdatePromptType(prevPromptType);
    }
  };

  const getTemplateHint = (): string | null => {
    if (currentPromptType === 'custom') return null;
    const tpl = promptTemplates.find((t) => t.promptType === currentPromptType);
    return tpl?.promptText ?? null;
  };

  const templateHint = getTemplateHint();

  return (
    <div className={`sidebar-panel flex flex-col ${isEditing ? 'sidebar-editing' : ''} ${isCanvasSelected ? 'ring-2 ring-serendie-accent ring-offset-1' : ''}`}>
      <div className="p-4 border-b border-serendie-gray-200">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-lg font-bold text-serendie-gray-900 flex-shrink-0">
            CANVAS
          </h2>

          {/* CANVAS selection toggle for AI consultation */}
          {onToggleCanvasSelection && (
            <button
              onClick={onToggleCanvasSelection}
              className={`flex-shrink-0 px-2 py-1 rounded-full text-xs font-medium transition-colors ${
                isCanvasSelected
                  ? 'bg-serendie-accent text-white shadow-sm'
                  : 'bg-serendie-gray-100 text-serendie-gray-600 hover:bg-serendie-gray-200 border border-serendie-gray-200'
              }`}
              aria-pressed={isCanvasSelected}
              aria-label={isCanvasSelected ? 'CANVAS選択を解除' : 'CANVASをAI相談用に選択'}
              title={isCanvasSelected ? 'クリックで選択解除' : 'クリックでAI相談用に選択'}
            >
              {isCanvasSelected ? '✓ 選択中' : 'AI選択'}
            </button>
          )}

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
          <div className="mt-2 flex items-start gap-2 bg-serendie-gray-50 rounded p-2">
            <div className="flex-1 min-w-0">
              <p className="text-xs text-serendie-gray-500 mb-0.5">カスタムプロンプト</p>
              {localCustomText ? (
                <p className="text-xs text-serendie-gray-700 truncate" title={localCustomText}>
                  {localCustomText.slice(0, 60)}{localCustomText.length > 60 ? '…' : ''}
                </p>
              ) : (
                <p className="text-xs text-serendie-gray-400 italic">未設定</p>
              )}
            </div>
            <button
              onClick={handleOpenCustomModal}
              disabled={isSummaryProcessing || lockState.isLocked}
              className="flex-shrink-0 text-xs px-2 py-1 rounded border border-serendie-gray-300 bg-white hover:bg-serendie-gray-100 disabled:opacity-50 disabled:cursor-not-allowed"
              aria-label="カスタムプロンプトを編集"
            >
              ✏️ 編集
            </button>
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
      {/* カスタムプロンプト入力モーダル */}
      {showCustomModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
          role="dialog"
          aria-modal="true"
          aria-label="カスタムプロンプト設定"
          onClick={(e) => { if (e.target === e.currentTarget) handleCancelCustomModal(); }}
        >
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md mx-4 flex flex-col">
            <div className="flex items-center justify-between px-5 py-4 border-b border-serendie-gray-200">
              <h3 className="text-base font-bold text-serendie-gray-900">カスタムプロンプト</h3>
              <button
                onClick={handleCancelCustomModal}
                className="text-serendie-gray-400 hover:text-serendie-gray-600 text-xl leading-none"
                aria-label="閉じる"
              >
                ×
              </button>
            </div>

            <div className="px-5 py-4">
              <label className="block text-sm text-serendie-gray-700 mb-2">
                AIへの指示を入力してください
              </label>
              <textarea
                className="w-full text-sm border border-serendie-gray-300 rounded px-3 py-2 resize-none focus:outline-none focus:ring-2 focus:ring-serendie-blue-400"
                rows={8}
                placeholder="例: 会話から課題とその担当者を箇条書きで抽出してください。"
                value={modalDraftText}
                onChange={(e) => setModalDraftText(e.target.value)}
                aria-label="カスタムプロンプトを入力"
                autoFocus
              />
              <p className="text-xs text-serendie-gray-400 mt-1 text-right">
                {modalDraftText.length} 文字
              </p>
            </div>

            <div className="flex gap-3 px-5 pb-5">
              <button
                onClick={handleCancelCustomModal}
                className="btn-secondary flex-1"
                aria-label="キャンセル"
              >
                キャンセル
              </button>
              <button
                onClick={handleSaveCustomPrompt}
                disabled={!modalDraftText.trim()}
                className="btn-primary flex-1 disabled:opacity-50 disabled:cursor-not-allowed"
                aria-label="保存"
              >
                保存
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}