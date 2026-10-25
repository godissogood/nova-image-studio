'use client';

import { useEffect } from 'react';
import { CheckCircle, XCircle, X, Info } from 'lucide-react';
import { createPortal } from 'react-dom';

export interface ToastData {
  id: string;
  message: string;
  type: 'success' | 'error' | 'info';
}

export function Toast({
  toast,
  onDismiss,
}: {
  toast: ToastData;
  onDismiss: (id: string) => void;
}) {
  useEffect(() => {
    const timer = setTimeout(() => onDismiss(toast.id), 5000);
    return () => clearTimeout(timer);
  }, [toast.id, onDismiss]);

  const Icon = toast.type === 'success' ? CheckCircle : toast.type === 'info' ? Info : XCircle;
  const borderColor =
    toast.type === 'success' ? 'border-green-500/30'
      : toast.type === 'info' ? 'border-blue-500/30'
        : 'border-destructive/20';
  const textColor =
    toast.type === 'success' ? 'text-green-600'
      : toast.type === 'info' ? 'text-blue-600'
        : 'text-destructive';

  return createPortal(
    <div
      role={toast.type === 'error' ? 'alert' : 'status'}
      aria-live={toast.type === 'error' ? 'assertive' : 'polite'}
      aria-atomic="true"
      className={`fixed left-1/2 top-4 z-[10000] flex min-h-12 w-fit max-w-[min(32rem,calc(100vw-2rem))] -translate-x-1/2 items-center gap-3 rounded-xl border ${borderColor} bg-card px-5 py-3 text-sm ${textColor} shadow-xl`}
    >
      <Icon className="w-4 h-4 flex-shrink-0" />
      <span className="flex-1">{toast.message}</span>
      <button
        onClick={() => onDismiss(toast.id)}
        aria-label="关闭提示"
        title="关闭提示"
        className="flex-shrink-0 opacity-60 hover:opacity-100"
      >
        <X className="w-3.5 h-3.5" />
      </button>
    </div>,
    document.body,
  );
}
