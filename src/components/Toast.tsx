"use client";

import { useEffect, useState } from "react";

export interface Toast {
  id: string;
  message: string;
  type: "info" | "success" | "warning" | "error";
  duration?: number;
}

const COLORS = {
  info: "bg-md-blue/10 text-md-blue border-md-blue/20",
  success: "bg-md-green/10 text-md-green border-md-green/20",
  warning: "bg-md-yellow/10 text-[#8a6d00] border-md-yellow/30",
  error: "bg-md-red/10 text-md-red border-md-red/20",
};

const ICONS = {
  info: "ℹ️",
  success: "✅",
  warning: "⚠️",
  error: "❌",
};

/* ── Global toast store ── */
let toastListeners: ((t: Toast) => void)[] = [];

export function showToast(
  message: string,
  type: Toast["type"] = "info",
  duration = 4000
) {
  const toast: Toast = { id: Date.now().toString(), message, type, duration };
  toastListeners.forEach((fn) => fn(toast));
}

/* ── Toast container component ── */
export default function ToastContainer() {
  const [toasts, setToasts] = useState<Toast[]>([]);

  useEffect(() => {
    const handler = (t: Toast) => {
      setToasts((prev) => [...prev, t]);
      if (t.duration && t.duration > 0) {
        setTimeout(() => {
          setToasts((prev) => prev.filter((x) => x.id !== t.id));
        }, t.duration);
      }
    };
    toastListeners.push(handler);
    return () => {
      toastListeners = toastListeners.filter((fn) => fn !== handler);
    };
  }, []);

  if (toasts.length === 0) return null;

  return (
    <div className="fixed top-16 left-4 right-4 sm:left-auto z-50 flex flex-col gap-2 sm:max-w-sm">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={`flex items-start gap-2 px-4 py-3 rounded-xl border shadow-lg
                      backdrop-blur-sm animate-slide-in ${COLORS[t.type]}`}
        >
          <span className="text-base flex-shrink-0">{ICONS[t.type]}</span>
          <p className="text-sm font-medium flex-1">{t.message}</p>
          <button
            onClick={() =>
              setToasts((prev) => prev.filter((x) => x.id !== t.id))
            }
            aria-label="Dismiss"
            className="text-xs opacity-60 hover:opacity-100 flex-shrink-0 -m-2 p-2"
          >
            ✕
          </button>
        </div>
      ))}
    </div>
  );
}
