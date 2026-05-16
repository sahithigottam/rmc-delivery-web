"use client";

import type { SimState } from "@/types/route";
import TruckIcon from "./TruckIcon";

interface SimulationControlsProps {
  simState: SimState;
  progress: number; // 0–1
  remainingKm: number;
  trafficMsg: string | null;
  speedMultiplier: number;
  currentSpeed?: number;
  onSpeedChange: (speed: number) => void;
  onToggle: () => void;
  onStop: () => void;
}

const SPEED_OPTIONS = [
  { value: 1, label: "1x (Real-time)" },
  { value: 4, label: "4x (1hr = 15min)" },
  { value: 10, label: "10x (1hr = 6min)" },
  { value: 30, label: "30x (1hr = 2min)" },
  { value: 60, label: "60x (1hr = 1min)" },
  { value: 120, label: "120x (1hr = 30s)" },
  { value: 300, label: "300x (1hr = 12s)" },
];

export default function SimulationControls({
  simState,
  progress,
  remainingKm,
  trafficMsg,
  speedMultiplier,
  currentSpeed = 0,
  onSpeedChange,
  onToggle,
  onStop,
}: SimulationControlsProps) {
  const pct = Math.round(progress * 100);
  const isActive = simState === "running" || simState === "paused";

  return (
    <div className="space-y-3">
      {/* Speed selector */}
      <div>
        <label className="block text-xs font-medium text-on-surface-variant mb-1.5">
          Simulation Speed
        </label>
        <select
          value={speedMultiplier}
          onChange={(e) => onSpeedChange(Number(e.target.value))}
          disabled={simState === "running" || simState === "paused"}
          className="w-full px-3 py-2 rounded-xl border border-outline-variant
                     bg-surface text-on-surface text-sm
                     focus:outline-none focus:border-primary
                     disabled:opacity-50"
        >
          {SPEED_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
        {(simState === "running" || simState === "paused") && (
          <p className="text-xs text-on-surface-variant mt-1">
            Speed locked during simulation
          </p>
        )}
      </div>

      {/* Progress bar (visible during sim) */}
      {isActive && (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <div
              className={`w-2.5 h-2.5 rounded-full flex-shrink-0
                ${simState === "running" ? "bg-md-green animate-pulse" : "bg-md-yellow"}`}
            />
            <span className="flex-1 text-sm text-on-surface">
              {simState === "paused" ? (
                "⏸ Paused"
              ) : (
                <span className="flex items-center gap-1.5">
                  <TruckIcon size={16} /> {remainingKm.toFixed(1)} km remaining                  {currentSpeed > 0 && (
                    <span className="text-xs text-on-surface-variant">· {currentSpeed} km/h</span>
                  )}                </span>
              )}
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
