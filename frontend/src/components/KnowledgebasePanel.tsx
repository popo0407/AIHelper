'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { graphqlClient, extractData } from '@/lib/appsync';
import {
  LIST_KNOWLEDGE_SOURCES,
  UPLOAD_KNOWLEDGEBASE,
  DELETE_KNOWLEDGEBASE,
} from '@/graphql/operations';
import type {
  KnowledgeSource,
  UploadKnowledgebaseResponse,
  DeleteKnowledgebaseResponse,
} from '@/types';
import { ALLOWED_KB_CONTENT_TYPES, MAX_KB_FILE_SIZE } from '@/types';

interface KnowledgebasePanelProps {
  conversationId: string;
  userId: string;
  isOpen: boolean;
  onClose: () => void;
  /** Number of registered knowledge sources (for header badge) */
  onSourceCountChange?: (count: number) => void;
}

/**
 * Overlay panel for managing knowledgebase files.
 * Triggered from ChatHeader "📚 ナレッジベース" button.
 */
export function KnowledgebasePanel({
  conversationId,
  userId,
  isOpen,
  onClose,
  onSourceCountChange,
}: KnowledgebasePanelProps) {
  const [sources, setSources] = useState<KnowledgeSource[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Notify parent when sources change
  useEffect(() => {
    onSourceCountChange?.(sources.length);
  }, [sources.length, onSourceCountChange]);

  // Fetch knowledge sources when panel opens
  useEffect(() => {
    if (isOpen) {
      loadSources();
    }
  }, [isOpen, conversationId]);

  const loadSources = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const result = await graphqlClient.graphql({
        query: LIST_KNOWLEDGE_SOURCES,
        variables: { conversationId },
      });
      console.log('listKnowledgeSources result:', JSON.stringify(result, null, 2));
      const data = extractData<KnowledgeSource[]>(result, 'listKnowledgeSources');
      console.log('extracted knowledge sources:', data);
      const items = data ?? [];
      setSources(items);
    } catch (err) {
      console.error('Failed to load knowledge sources:', err);
      const errorMessage = err instanceof Error ? err.message : 'ナレッジソースの読み込みに失敗しました';
      setError(errorMessage);
    } finally {
      setIsLoading(false);
    }
  }, [conversationId]);

  // ── Upload handler ──
  const handleFileSelect = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;

      // Reset input
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }

      // Validate content type
      const contentType = ALLOWED_KB_CONTENT_TYPES[file.type];
      if (!contentType) {
        // Try by extension as fallback
        const ext = file.name.split('.').pop()?.toLowerCase();
        const validExts = Object.values(ALLOWED_KB_CONTENT_TYPES);
        if (!ext || !validExts.includes(ext)) {
          setError(
            `サポートされていないファイル形式です。対応形式: PDF, DOCX, DOC, HTML, MD, TXT`
          );
          return;
        }
      }

      // Validate file size
      if (file.size > MAX_KB_FILE_SIZE) {
        setError(
          `ファイルサイズが上限（25MB）を超えています: ${(file.size / 1024 / 1024).toFixed(1)}MB`
        );
        return;
      }

      setIsUploading(true);
      setError(null);

      try {
        // Determine content type string
        const ct =
          contentType ??
          file.name.split('.').pop()?.toLowerCase() ??
          'txt';

        // 1. Call mutation to get presigned URL + register metadata
        const result = await graphqlClient.graphql({
          query: UPLOAD_KNOWLEDGEBASE,
          variables: {
            input: {
              conversationId,
              fileName: file.name,
              fileSize: file.size,
              contentType: ct,
              uploadedBy: userId,
            },
          },
        });
        const data = extractData<UploadKnowledgebaseResponse>(
          result,
          'uploadKnowledgebase'
        );

        console.log('uploadKnowledgebase result:', JSON.stringify(result, null, 2));
        console.log('extracted data:', data);

        if (!data?.success || !data.presignedUrl) {
          console.error('Upload preparation failed:', data);
          setError(data?.error ?? 'アップロードの準備に失敗しました');
          return;
        }

        // 2. Upload file to S3 via CloudFront presigned PUT URL
        // CloudFront Function が OPTIONS preflight をエッジで処理するため
        // CORS 問題なく PUT リクエストが可能
        const uploadResponse = await fetch(data.presignedUrl, {
          method: 'PUT',
          headers: {
            'Content-Type': file.type || 'application/octet-stream',
          },
          body: file,
        });

        if (!uploadResponse.ok) {
          const errorText = await uploadResponse.text();
          console.error('S3 upload failed:', uploadResponse.status, errorText);
          setError('ファイルのアップロードに失敗しました');
          return;
        }

        // 3. Refresh the list
        await loadSources();
      } catch (err) {
        console.error('Upload failed:', err);
        const errorMessage = err instanceof Error ? err.message : 'アップロード中にエラーが発生しました';
        setError(errorMessage);
      } finally {
        setIsUploading(false);
      }
    },
    [conversationId, userId, loadSources]
  );

  // ── Delete handler ──
  const handleDelete = useCallback(
    async (knowledgeSourceId: string, fileName: string) => {
      if (!window.confirm(`「${fileName}」を削除しますか？`)) return;

      setDeletingId(knowledgeSourceId);
      setError(null);

      try {
        const result = await graphqlClient.graphql({
          query: DELETE_KNOWLEDGEBASE,
          variables: {
            input: {
              conversationId,
              knowledgeSourceId,
            },
          },
        });
        const data = extractData<DeleteKnowledgebaseResponse>(
          result,
          'deleteKnowledgebase'
        );

        if (!data?.success) {
          setError(data?.error ?? '削除に失敗しました');
          return;
        }

        // Remove from list
        setSources((prev) => {
          return prev.filter(
            (s) => s.knowledgeSourceId !== knowledgeSourceId
          );
        });
      } catch (err) {
        console.error('Delete failed:', err);
        setError('削除中にエラーが発生しました');
      } finally {
        setDeletingId(null);
      }
    },
    [conversationId]
  );

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-16">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/30"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Panel */}
      <div
        className="relative bg-white rounded-lg shadow-xl w-full max-w-lg mx-4 max-h-[70vh] flex flex-col"
        role="dialog"
        aria-modal="true"
        aria-label="ナレッジベース管理"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-serendie-gray-200">
          <h2 className="text-lg font-bold text-serendie-gray-900">
            📚 ナレッジベース
          </h2>
          <button
            className="text-serendie-gray-500 hover:text-serendie-gray-700 text-xl leading-none"
            onClick={onClose}
            aria-label="パネルを閉じる"
          >
            ✕
          </button>
        </div>

        {/* Error banner */}
        {error && (
          <div className="mx-4 mt-3 p-2 bg-red-50 border border-red-200 rounded text-sm text-red-700">
            {error}
            <button
              className="ml-2 text-red-500 hover:text-red-700"
              onClick={() => setError(null)}
              aria-label="エラーを閉じる"
            >
              ✕
            </button>
          </div>
        )}

        {/* Upload area */}
        <div className="px-4 py-3 border-b border-serendie-gray-100">
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,.docx,.doc,.html,.md,.txt"
            onChange={handleFileSelect}
            className="hidden"
            aria-label="ファイルを選択"
          />
          <button
            className="btn-primary w-full"
            onClick={() => fileInputRef.current?.click()}
            disabled={isUploading}
            aria-label="ファイルをアップロード"
          >
            {isUploading ? (
              <span className="flex items-center justify-center gap-2">
                <span className="animate-spin inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full" />
                アップロード中...
              </span>
            ) : (
              '📎 ファイルをアップロード'
            )}
          </button>
          <p className="text-xs text-serendie-gray-500 mt-1">
            対応形式: PDF, DOCX, DOC, HTML, MD, TXT（最大25MB）
          </p>
        </div>

        {/* File list */}
        <div className="flex-1 overflow-y-auto px-4 py-2">
          {isLoading ? (
            <div className="text-center py-8 text-serendie-gray-500">
              読み込み中...
            </div>
          ) : sources.length === 0 ? (
            <div className="text-center py-8 text-serendie-gray-500">
              <p className="text-2xl mb-2">📁</p>
              <p>ナレッジソースがありません</p>
              <p className="text-xs mt-1">
                上のボタンからファイルをアップロードしてください
              </p>
            </div>
          ) : (
            <ul className="divide-y divide-serendie-gray-100" role="list">
              {sources.map((source) => (
                <li
                  key={source.knowledgeSourceId}
                  className="flex items-center justify-between py-2 gap-2"
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-serendie-gray-900 truncate">
                      {_getFileIcon(source.contentType)} {source.fileName}
                    </p>
                    <p className="text-xs text-serendie-gray-500">
                      {_formatFileSize(source.fileSize)} ・{' '}
                      {_formatDate(source.uploadedAt)}
                      {source.status !== 'ready' && (
                        <span className="ml-1 text-yellow-600">
                          ({source.status})
                        </span>
                      )}
                    </p>
                  </div>
                  <button
                    className="text-red-500 hover:text-red-700 text-sm flex-shrink-0 px-2 py-1 rounded hover:bg-red-50 transition-colors"
                    onClick={() =>
                      handleDelete(source.knowledgeSourceId, source.fileName)
                    }
                    disabled={deletingId === source.knowledgeSourceId}
                    aria-label={`${source.fileName}を削除`}
                  >
                    {deletingId === source.knowledgeSourceId
                      ? '削除中...'
                      : '🗑 削除'}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Footer */}
        <div className="px-4 py-3 border-t border-serendie-gray-200 text-xs text-serendie-gray-500">
          {sources.length}件のファイルが登録されています
        </div>
      </div>
    </div>
  );
}

// ── Helpers ──

function _getFileIcon(contentType: string): string {
  const icons: Record<string, string> = {
    pdf: '📕',
    docx: '📘',
    doc: '📘',
    html: '🌐',
    md: '📝',
    txt: '📄',
  };
  return icons[contentType] ?? '📎';
}

function _formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function _formatDate(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleDateString('ja-JP', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}
