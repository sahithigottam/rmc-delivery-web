"use client";

import type { SimState } from "@/types/route";

interface MapOverlayProps {
  simState: SimState;
  progress: number;
  remainingKm: number;
  destination: string;
  trafficMsg: string | null;
}

export default function MapOverlay({
  simState,
  progress,
  remainingKm,
  destination,
  trafficMsg,
}: MapOverlayProps) {
  if (simState === "idle") return null;

  const pct = Math.round(progress * 100);
  const isFinished = simState === "finished";

  return (
    <div
      className="absolute bottom-5 left-5 right-5 z-[1000]
                 bg-white/95 backdrop-blur-md rounded-2xl
                 px-5 py-4 shadow-xl
                 font-sans"
    >
      {/* Status row */}
      <div className="flex items-center gap-3">
        <div
          className={`w-3 h-3 rounded-full flex-shrink-0
            ${isFinished ? "bg-primary" : simState === "paused" ? "bg-md-yellow" : "bg-md-green animate-pulse"}`}
        />
        <span className="flex-1 text-sm text-on-surface font-medium">
          {isFinished
            ? `🏁 Delivered to ${destination}`
            : simState === "paused"
            ? "⏸ Paused"
            : `🚚 En route — ${remainingKm.toFixed(1)} km remaining`}
        </span>
        <span className="text-xs text-on-surface-variant font-medium">
          {pct}%
        </span>
      </div>

      {/* Progress bar */}
      <div className="h-1 bg-outline-variant/20 rounded-full mt-3 overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-300 ease-out"
          style={{
            width: `${pct}%`,
            background: isFinished
              ? "#6750a4"
              : simState === "paused"
              ? "#fbbc04"
              : "#1a73e8",
          }}
        />
      </div>

      {/* Metrics row */}
      <div className="flex gap-5 mt-2.5 text-xs text-on-surface-variant">
        <span>
          Remaining: <strong className="text-on-surface">{remainingKm.toFixed(1)} km</strong>
        </span>
        <span>
          Progress: <strong className="text-on-surface">{pct}%</strong>
        </span>
      </div>

      {/* Traffic message */}
      {trafficMsg && (
        <p className="mt-2 text-xs font-medium text-md-yellow">{trafficMsg}</p>
      )}
    </div>
  );
}
