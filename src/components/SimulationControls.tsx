"use client";

import type { SimState } from "@/types/route";

interface SimulationControlsProps {
  simState: SimState;
  progress: number; // 0–1
  remainingKm: number;
  trafficMsg: string | null;
  onToggle: () => void;
  onStop: () => void;
}

export default function SimulationControls({
  simState,
  progress,
  remainingKm,
  trafficMsg,
  onToggle,
  onStop,
}: SimulationControlsProps) {
  const pct = Math.round(progress * 100);
  const isActive = simState === "running" || simState === "paused";

  return (
    <div className="space-y-3">
      {/* Progress bar (visible during sim) */}
      {isActive && (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <div
              className={`w-2.5 h-2.5 rounded-full flex-shrink-0
                ${simState === "running" ? "bg-md-green animate-pulse" : "bg-md-yellow"}`}
            />
            <span className="flex-1 text-sm text-on-surface">
              {simState === "paused"
                ? "⏸ Paused"
                : `🚚 ${remainingKm.toFixed(1)} km remaining`}
            </span>
            <span className="text-xs text-on-surface-variant">{pct}%</span>
          </div>
          <div className="h-1 bg-outline-variant/30 rounded-full overflow-hidden">
            <div
              className="h-full bg-primary rounded-full transition-all duration-200"
              style={{ width: `${pct}%` }}
            />
          </div>

          {/* Traffic message */}
          {trafficMsg && (
            <p className="text-xs text-md-yellow px-1">{trafficMsg}</p>
          )}
        </div>
      )}

      {/* Finished */}
      {simState === "finished" && (
        <div className="flex items-center gap-2 text-sm text-primary font-medium">
          <div className="w-2.5 h-2.5 rounded-full bg-primary" />
          🏁 Delivered!
        </div>
      )}

      {/* Buttons */}
      <div className="flex gap-2">
        <button
          onClick={onToggle}
          className={`flex-1 py-2.5 rounded-2xl text-sm font-medium transition-all
            active:scale-[0.98]
            ${
              simState === "running"
                ? "bg-md-yellow/15 text-md-yellow border border-md-yellow/30"
                : simState === "paused"
                ? "bg-md-green/15 text-md-green border border-md-green/30"
                : "bg-primary-container text-primary"
            }
          `}
        >
          {simState === "idle" || simState === "finished"
            ? "▶ Start Trip"
            : simState === "running"
            ? "⏸ Pause"
            : "▶ Resume"}
        </button>

        {isActive && (
          <button
            onClick={onStop}
            className="px-4 py-2.5 rounded-2xl text-sm font-medium
                       bg-md-red/10 text-md-red border border-md-red/20
                       hover:bg-md-red/20 transition-colors active:scale-[0.98]"
          >
            ⏹
          </button>
        )}
      </div>
    </div>
  );
}
