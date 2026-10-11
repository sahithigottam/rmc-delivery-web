"use client";

import { useEffect, useState } from "react";
import { parseApiTime } from "@/lib/time";

export const STALE_AFTER_MS = 2 * 60 * 1000;

function timeAgo(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000));
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.floor(m / 60);
  return `${h} h ${m % 60} min ago`;
}

interface Props {
  /** When the driver's latest accepted GPS position was captured (from the trip) */
  positionAt?: string | null;
}

/**
 * Shows when the driver's location was last received and warns when it is
 * out of date, so the office can't mistake an old position for where the truck is now.
 */
export default function DriverLocationFreshness({ positionAt }: Props) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const tick = setInterval(() => setNow(Date.now()), 5_000);
    return () => clearInterval(tick);
  }, []);

  const lastAt = parseApiTime(positionAt)?.getTime() ?? null;

  if (lastAt === null) {
    return (
      <p role="status" className="text-xs rounded-lg px-3 py-2 bg-amber-50 text-amber-800">
        No live location received from the driver yet. The truck marker may not reflect where it really is.
      </p>
    );
  }

  const age = now - lastAt;
  const stale = age > STALE_AFTER_MS;
  return (
    <p
      role="status"
      className={`text-xs rounded-lg px-3 py-2 ${stale ? "bg-amber-50 text-amber-800" : "bg-surface-container text-on-surface-variant"}`}
    >
      {stale ? "⚠️ " : "📍 "}
      Driver location last updated {timeAgo(age)}
      {stale && ". The driver's GPS may be off, the phone locked, or there's no signal."}
    </p>
  );
}
