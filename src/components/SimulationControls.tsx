"use client";

import { useEffect, useState } from "react";
import type { SimState } from "@/types/route";
import type { GpsState } from "@/hooks/useGpsTracking";
import TruckIcon from "./TruckIcon";

const GPS_STALE_MS = 2 * 60 * 1000;

function ago(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000));
  return s < 60 ? `${s}s ago` : `${Math.floor(s / 60)} min ago`;
}

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
  gpsRemainingKm: number | null;
  gpsLastFixAt?: number | null;
  gpsLastSentAt?: number | null;
  gpsPendingCount?: number;
  gpsWakeLockActive?: boolean;
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
  gpsLastFixAt = null,
  gpsLastSentAt = null,
  gpsPendingCount = 0,
  gpsWakeLockActive = false,
  gpsTrafficMsg,
  onGpsStart,
  onGpsStop,
}: SimulationControlsProps) {
  const pct = Math.round(progress * 100);
  const isActive = simState === "running" || simState === "paused";

  // Re-render every 5 s so the "X ago" labels stay current
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!gpsMode || gpsState !== "active") return;
    const t = setInterval(() => setNow(Date.now()), 5_000);
    return () => clearInterval(t);
  }, [gpsMode, gpsState]);
  const fixAge = gpsLastFixAt != null ? now - gpsLastFixAt : null;
  const sentAge = gpsLastSentAt != null ? now - gpsLastSentAt : null;
  const fixStale = fixAge != null && fixAge > GPS_STALE_MS;
  const sendStale = gpsState === "active" && (sentAge == null ? gpsPendingCount > 0 : sentAge > GPS_STALE_MS);

  return (
    <div className="space-y-3">
      {/* Mode toggle */}
      <div className="flex items-center gap-2 p-2 rounded-xl bg-surface-container border border-outline-variant">
        <span className={`flex-1 text-sm font-semibold ${!gpsMode ? "text-primary" : "text-on-surface-variant"}`}>
          Simulation
        </span>
        <button
          type="button"
          role="switch"
          aria-label="Use GPS instead of simulation"
          aria-checked={gpsMode}
          onClick={() => onGpsModeChange(!gpsMode)}
          className="flex h-12 w-16 shrink-0 items-center justify-center rounded-lg hover:bg-surface-container-high active:bg-surface-container-high focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
        >
          <span aria-hidden="true" className={`flex h-7 w-12 items-center rounded-full p-1 ${gpsMode ? "bg-primary" : "bg-outline"}`}>
            <span className={`h-5 w-5 rounded-full bg-surface ${gpsMode ? "translate-x-5" : ""}`} />
          </span>
        </button>
        <span className={`flex-1 text-right text-sm font-semibold ${gpsMode ? "text-primary" : "text-on-surface-variant"}`}>
          GPS
        </span>
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
                  {gpsRemainingKm != null ? `${gpsRemainingKm.toFixed(1)} km remaining` : "Tracking active - distance updating"}
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

          {/* Freshness of GPS and uploads */}
          {gpsState === "active" && (
            <div className="space-y-1 px-1 text-[11px]">
              <p className={fixStale ? "text-amber-700" : "text-on-surface-variant"}>
                {fixStale ? "⚠️ " : ""}GPS fix {fixAge != null ? ago(fixAge) : "—"}
                {" · "}
                Sent to office {sentAge != null ? ago(sentAge) : "not yet"}
              </p>
              {gpsPendingCount > 0 && (
                <p className="text-amber-700">
                  📶 {gpsPendingCount} location{gpsPendingCount !== 1 ? "s" : ""} waiting to send. They&apos;ll upload when the signal returns.
                </p>
              )}
              {(fixStale || sendStale) && (
                <p className="text-amber-700">
                  {fixStale
                    ? "No fresh GPS signal. Move to open sky and keep this screen on."
                    : "The office isn't receiving your location. Check your internet connection."}
                </p>
              )}
              <p className="text-on-surface-variant/70">
                {gpsWakeLockActive
                  ? "🔆 Screen kept awake while tracking"
                  : "Screen may sleep on this device. Keep this page open and the screen on."}
              </p>
            </div>
          )}

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
          <p className="text-[11px] text-on-surface-variant bg-surface-container rounded-lg px-3 py-2">
            Demo only — shown on this screen and not sent to the office. Use Real GPS to track the trip.
          </p>
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
