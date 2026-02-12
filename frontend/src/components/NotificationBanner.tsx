'use client';

interface NotificationBannerProps {
  message: string;
}

/**
 * Top banner for transient notifications (processing state, link copied, etc.).
 */
export function NotificationBanner({ message }: NotificationBannerProps) {
  return (
    <div
      className="bg-serendie-blue-50 border-b border-serendie-blue-200 px-4 py-2 text-sm text-serendie-blue-700 flex items-center gap-2 animate-float-up"
      role="status"
      aria-live="polite"
    >
      <span className="loading-weave w-4 h-4 flex-shrink-0" />
      <span>{message}</span>
    </div>
  );
}
