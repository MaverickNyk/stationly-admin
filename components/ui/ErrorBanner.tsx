'use client';

/**
 * Inline error with a per-resource Retry button. Each data view renders its own
 * so a single failing fetch can be retried in place, without reloading the
 * whole screen.
 */
export default function ErrorBanner({
  message,
  onRetry,
  busy,
}: {
  message: string;
  onRetry?: () => void;
  busy?: boolean;
}) {
  if (!message) return null;
  return (
    <div className="errors errors-row">
      <span>{message}</span>
      {onRetry && (
        <button className="retry-btn" onClick={onRetry} disabled={busy}>
          {busy ? '…' : '↻ Retry'}
        </button>
      )}
    </div>
  );
}
