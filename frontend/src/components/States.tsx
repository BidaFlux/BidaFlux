import type { ReactNode } from "react";

export function Loading({ label = "Loading…" }: { label?: string }) {
  return (
    <div className="state" role="status">
      <div className="spinner" aria-hidden="true" />
      {label}
    </div>
  );
}

export function ErrorState({ title = "Something went wrong", message, onRetry }: { title?: string; message?: string; onRetry?: () => void }) {
  return (
    <div className="state error" role="alert">
      <strong>{title}</strong>
      {message && <p className="small">{message}</p>}
      {onRetry && (
        <button className="btn ghost" onClick={onRetry}>
          Try again
        </button>
      )}
    </div>
  );
}

export function Empty({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="state">
      <strong>{title}</strong>
      {children}
    </div>
  );
}
