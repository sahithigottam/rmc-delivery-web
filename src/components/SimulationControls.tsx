"use client";

import type { SimState } from "@/types/route";
import type { GpsState } from "@/hooks/useGpsTracking";
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
  // GPS mode
  gpsMode: boolean;
  onGpsModeChange: (enabled: boolean) => void;
  gpsState: GpsState;
  gpsAccuracy: number | null;
  gpsSpeed: number | null;
  gpsError: string | null;
  gpsRemainingKm: number;
  gpsTrafficMsg: string | null;
  onGpsStart: () => void;
  onGpsStop: () => void;
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
  gpsMode,
  onGpsModeChange,
  gpsState,
  gpsAccuracy,
  gpsSpeed,
  gpsError,
  gpsRemainingKm,
  gpsTrafficMsg,
  onGpsStart,
  onGpsStop,
}: SimulationControlsProps) {
  const pct = Math.round(progress * 100);
  const isActive = simState === "running" || simState === "paused";

  return (
    <div className="space-y-3">
      {/* Mode toggle */}
      <div className="flex items-center gap-2 p-2 rounded-xl bg-surface-container border border-outline-variant">
        <button
          onClick={() => onGpsModeChange(false)}
          className={`flex-1 py-1.5 rounded-lg text-xs font-semibold transition-all ${
            !gpsMode ? "bg-primary text-on-primary shadow-sm" : "text-on-surface-variant hover:bg-surface-container-high"
          }`}
        >
          Simulation
        </button>
        <button
          onClick={() => onGpsModeChange(true)}
          className={`flex-1 py-1.5 rounded-lg text-xs font-semibold transition-all ${
            gpsMode ? "bg-md-green text-white shadow-sm" : "text-on-surface-variant hover:bg-surface-container-high"
          }`}
        >
          📍 Real GPS
        </button>
      </div>

      {/* ── GPS MODE ── */}
      {gpsMode && (
        <div className="space-y-2">
          {/* Status row */}
          <div className="flex items-center gap-2">
            <div
              className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${
                gpsState === "active"
                  ? "bg-md-green animate-pulse"
                  : gpsState === "requesting"
                  ? "bg-md-yellow animate-pulse"
                  : gpsState === "error"
                  ? "bg-md-red"
                  : "bg-outline-variant"
              }`}
            />
            <span className="flex-1 text-sm text-on-surface">
              {gpsState === "idle" && "GPS not started"}
              {gpsState === "requesting" && "Requesting location…"}
              {gpsState === "active" && (
                <span className="flex items-center gap-1.5">
                  <TruckIcon size={16} />
                  {gpsRemainingKm > 0 ? `${gpsRemainingKm.toFixed(1)} km remaining` : "Tracking active"}
                  {gpsSpeed != null && (
                    <span className="text-xs text-on-surface-variant">· {gpsSpeed} km/h</span>
                  )}
                </span>
              )}
              {gpsState === "error" && (
                <span className="text-md-red text-xs">{gpsError}</span>
              )}
            </span>
            {gpsAccuracy != null && gpsState === "active" && (
              <span className="text-[11px] text-on-surface-variant">±{Math.round(gpsAccuracy)}m</span>
            )}
          </div>

          {/* Traffic message */}
          {gpsTrafficMsg && (
            <p className="text-xs text-md-yellow px-1">{gpsTrafficMsg}</p>
          )}

          {/* Buttons */}
          <div className="flex gap-2">
            {gpsState === "idle" || gpsState === "error" ? (
              <button
                onClick={onGpsStart}
                className="flex-1 py-2.5 rounded-2xl text-sm font-medium bg-md-green/15 text-md-green border border-md-green/30 hover:bg-md-green/25 transition-colors active:scale-[0.98]"
              >
                📍 Start GPS Tracking
              </button>
            ) : (
              <button
                onClick={onGpsStop}
                className="flex-1 py-2.5 rounded-2xl text-sm font-medium bg-md-red/10 text-md-red border border-md-red/20 hover:bg-md-red/20 transition-colors active:scale-[0.98]"
              >
                ⏹ Stop GPS
              </button>
            )}
          </div>

          <p className="text-[11px] text-on-surface-variant/60 text-center">
            Uses device GPS — keep browser tab open while driving
          </p>
        </div>
      )}

      {/* ── SIMULATION MODE ── */}
      {!gpsMode && (
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

          {/* Progress bar */}
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
                      <TruckIcon size={16} /> {remainingKm.toFixed(1)} km remaining
                      {currentSpeed > 0 && (
                        <span className="text-xs text-on-surface-variant">· {currentSpeed} km/h</span>
                      )}
                    </span>
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
      )}
    </div>
  );
}
