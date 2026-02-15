'use client';

import { useEffect } from 'react';

export default function ToastRemover() {
  useEffect(() => {
    // 初期状態で削除
    const removeNextJsIndicators = () => {
      // Static indicator (丸いボタン)
      const staticIndicators = document.querySelectorAll(
        '[class*="nextjs-static-indicator-toast-wrapper"]'
      );
      staticIndicators.forEach((indicator) => indicator.remove());

      // errors でない Toast は削除
      const toasts = document.querySelectorAll('[class*="nextjs-toast"]');
      toasts.forEach((toast) => {
        if (!toast.className.includes('errors-parent')) {
          toast.remove();
        }
      });
    };

    // 初期呼び出し
    removeNextJsIndicators();

    // DOM 変更を監視して、新しく追加される要素も削除
    const observer = new MutationObserver(() => {
      removeNextJsIndicators();
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
    });

    return () => observer.disconnect();
  }, []);

  // このコンポーネントは何もレンダリングしない
  return null;
}
