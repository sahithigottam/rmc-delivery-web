"use client";

import { useState } from "react";
import type { TripResponse, TripStatus } from "@/types/route";
import { beginTrip, pauseTrip, resumeTrip, completeTrip, cancelTrip } from "@/lib/api";
import { showToast } from "./Toast";
import TruckIcon from "./TruckIcon";

interface TripManagementProps {
  trip: TripResponse | null;
  onTripUpdated: (trip: TripResponse) => void;
}

const STATUS_CONFIG: Record<TripStatus, { label: string; dot: string; icon: string }> = {
  pending:     { label: "Pending",     dot: "bg-gray-400",    icon: "" },
  in_progress: { label: "In Progress", dot: "bg-md-green",    icon: "" },
  paused:      { label: "Paused",      dot: "bg-md-yellow",   icon: "" },
  completed:   { label: "Completed",   dot: "bg-blue-500",    icon: "" },
  cancelled:   { label: "Cancelled",   dot: "bg-md-red",      icon: ""  },
};

const LOAD_STATUS_STYLE: Record<string, string> = {
  fresh:    "text-emerald-700 bg-emerald-100",
  warning:  "text-amber-700  bg-amber-100",
  critical: "text-orange-700 bg-orange-100",
  expired:  "text-red-700    bg-red-100",
};

function LoadTimerBar({ minutes, max }: { minutes: number; max: number }) {
  const pct = Math.max(0, Math.min(100, (minutes / max) * 100));
  const color = pct > 50 ? "bg-emerald-500" : pct > 20 ? "bg-amber-500" : "bg-red-500";
  return (
    <div>
      <div className="flex justify-between text-[11px] text-on-surface-variant mb-1">
        <span>Load Timer</span>
        <span className="font-semibold">{Math.max(0, Math.round(minutes))} min remaining</span>
      </div>
      <div className="h-2 rounded-full bg-outline-variant/30 overflow-hidden">
        <div className={`h-full rounded-full transition-all ${color}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

export default function TripManagement({ trip, onTripUpdated }: TripManagementProps) {
  const [loading, setLoading] = useState(false);

  // Begin trip state
  const [showBeginForm, setShowBeginForm] = useState(false);
  const [batchTime, setBatchTime] = useState("");
  const [requiresRetarder, setRequiresRetarder] = useState(false);

  // Complete outcome state
  const [showCompleteForm, setShowCompleteForm] = useState(false);
  const [outcomeSuccess, setOutcomeSuccess] = useState<boolean | null>(null);
  const [outcomeNotes, setOutcomeNotes] = useState("");

  if (!trip) {
    return (
      <div className="p-4 rounded-xl bg-surface-container text-center space-y-3">
        <TruckIcon size={40} />
        <p className="text-sm text-on-surface-variant">
          No active trip. Schedule a delivery in the <strong>Dispatch</strong> tab.
        </p>
      </div>
    );
  }

  const cfg = STATUS_CONFIG[trip.status];
  const isActive = trip.status === "in_progress" || trip.status === "paused";
  const isDone = trip.status === "completed" || trip.status === "cancelled";

  /*  Handlers  */
  const handleBegin = async () => {
    setLoading(true);
    try {
      const updated = await beginTrip(trip.id, {
        batch_time: batchTime ? new Date(batchTime).toISOString() : undefined,
        requires_retarder: requiresRetarder,
      });
      onTripUpdated(updated);
      setShowBeginForm(false);
      showToast(" Trip started! Load timer running.", "success");
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Failed to begin trip", "error");
    } finally {
      setLoading(false);
    }
  };

  const handleComplete = async () => {
    if (outcomeSuccess === null) { showToast("Please choose succeeded or failed", "error"); return; }
    setLoading(true);
    try {
      const updated = await completeTrip(trip.id, {
        success: outcomeSuccess,
        notes: outcomeNotes || undefined,
      });
      onTripUpdated(updated);
      setShowCompleteForm(false);
      showToast(outcomeSuccess ? " Delivery completed successfully!" : "Trip marked as failed", outcomeSuccess ? "success" : "info");
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Failed to complete trip", "error");
    } finally {
      setLoading(false);
    }
  };

  const handlePause = async () => {
    setLoading(true);
    try { onTripUpdated(await pauseTrip(trip.id)); showToast("Trip paused", "info"); }
    catch (e) { showToast(e instanceof Error ? e.message : "Failed", "error"); }
    finally { setLoading(false); }
  };

  const handleResume = async () => {
    setLoading(true);
    try { onTripUpdated(await resumeTrip(trip.id)); showToast("Trip resumed", "success"); }
    catch (e) { showToast(e instanceof Error ? e.message : "Failed", "error"); }
    finally { setLoading(false); }
  };

  const handleCancel = async () => {
    if (!confirm("Cancel this trip? This cannot be undone.")) return;
    setLoading(true);
    try { onTripUpdated(await cancelTrip(trip.id)); showToast("Trip cancelled", "info"); }
    catch (e) { showToast(e instanceof Error ? e.message : "Failed", "error"); }
    finally { setLoading(false); }
  };

  return (
    <div className="space-y-3">

      {/*  Trip Header  */}
      <div className="p-4 rounded-xl bg-surface-container space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 flex-wrap">
            <div className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${cfg.dot} ${trip.status === "in_progress" ? "animate-pulse" : ""}`} />
            <span className="font-semibold text-on-surface">Trip #{trip.id}</span>
            <span className="px-2 py-0.5 rounded-md bg-surface-container-high text-xs font-medium">
              {cfg.icon} {cfg.label}
            </span>
            {trip.concrete_mix && (
              <span className="px-2 py-0.5 rounded-md bg-primary-container text-primary text-xs font-medium">
                {trip.concrete_mix}
              </span>
            )}
          </div>
          {trip.reroute_count > 0 && (
            <span className="text-xs text-on-surface-variant flex-shrink-0">
               {trip.reroute_count} reroute{trip.reroute_count !== 1 ? "s" : ""}
            </span>
          )}
        </div>

        {/* Addresses */}
        <div className="text-xs text-on-surface-variant space-y-0.5">
          <p> {trip.start_address}</p>
          <p> {trip.end_address}</p>
          {trip.scheduled_at && (
            <p> Scheduled: {new Date(trip.scheduled_at).toLocaleString("en-NZ", { dateStyle: "medium", timeStyle: "short" })}</p>
          )}
        </div>

        {/* Route info (always visible) */}
        <div className="grid grid-cols-3 gap-2">
          {trip.original_distance_meters != null && (
            <div className="px-3 py-2 rounded-lg bg-surface-container-low">
              <p className="text-[11px] text-on-surface-variant">DISTANCE</p>
              <p className="text-sm font-semibold text-on-surface">{(trip.original_distance_meters / 1000).toFixed(1)} km</p>
            </div>
          )}
          {trip.original_duration_seconds != null && (
            <div className="px-3 py-2 rounded-lg bg-surface-container-low">
              <p className="text-[11px] text-on-surface-variant">EST. DRIVE</p>
              <p className="text-sm font-semibold text-on-surface">{Math.round(trip.original_duration_seconds / 60)} min</p>
            </div>
          )}
          {trip.concrete_mix && (
            <div className="px-3 py-2 rounded-lg bg-surface-container-low">
              <p className="text-[11px] text-on-surface-variant">WINDOW</p>
              <p className="text-sm font-semibold text-on-surface">{trip.load_max_life_minutes ?? (trip.concrete_mix === "HE" ? 60 : trip.concrete_mix === "RE" ? 120 : 90)} min</p>
            </div>
          )}
        </div>

        {/* Load Timer (in-progress trips) */}
        {isActive && trip.load_minutes_remaining != null && trip.load_max_life_minutes && (
          <LoadTimerBar minutes={trip.load_minutes_remaining} max={trip.load_max_life_minutes} />
        )}

        {/* Load status badge */}
        {isActive && trip.load_status && (
          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold capitalize ${LOAD_STATUS_STYLE[trip.load_status] ?? "bg-gray-100 text-gray-600"}`}>
            {trip.load_status}
          </span>
        )}

        {/* Active trip metrics */}
        {isActive && (
          <div className="grid grid-cols-2 gap-2">
            {trip.remaining_distance_meters != null && (
              <div className="px-3 py-2 rounded-lg bg-surface-container-low">
                <p className="text-[11px] text-on-surface-variant">REMAINING</p>
                <p className="text-sm font-semibold text-on-surface">{(trip.remaining_distance_meters / 1000).toFixed(1)} km</p>
              </div>
            )}
            {trip.remaining_duration_seconds != null && (
              <div className="px-3 py-2 rounded-lg bg-surface-container-low">
                <p className="text-[11px] text-on-surface-variant">DRIVE LEFT</p>
                <p className="text-sm font-semibold text-on-surface">{Math.round(trip.remaining_duration_seconds / 60)} min</p>
              </div>
            )}
            {trip.estimated_arrival && (
              <div className="px-3 py-2 rounded-lg bg-surface-container-low">
                <p className="text-[11px] text-on-surface-variant">ETA</p>
                <p className="text-sm font-semibold text-on-surface">
                  {new Date(trip.estimated_arrival).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                </p>
              </div>
            )}
            {trip.current_traffic_delay != null && trip.current_traffic_delay > 60 && (
              <div className="px-3 py-2 rounded-lg bg-md-red/10 col-span-2">
                <p className="text-[11px] text-md-red">TRAFFIC DELAY</p>
                <p className="text-sm font-semibold text-md-red">+{Math.round(trip.current_traffic_delay / 60)} min</p>
              </div>
            )}
          </div>
        )}

        {/* Outcome badge (completed/cancelled) */}
        {isDone && trip.outcome && (
          <div className={`px-3 py-2 rounded-lg text-sm font-medium ${trip.outcome === "succeeded" ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"}`}>
            {trip.outcome === "succeeded" ? " Delivered successfully" : " Delivery failed"}
          </div>
        )}
      </div>

      {/*  Pending: Begin Trip Form  */}
      {trip.status === "pending" && (
        <div className="p-4 rounded-xl bg-surface-container space-y-3">
          <div className="flex items-center gap-2">
            <TruckIcon size={22} />
            <div>
              <p className="text-sm font-semibold text-on-surface">Ready to Begin?</p>
              <p className="text-xs text-on-surface-variant">Truck at plant, concrete being batched</p>
            </div>
          </div>

          {showBeginForm ? (
            <div className="space-y-3">
              <div className="space-y-1.5">
                <label className="text-[11px] font-semibold text-on-surface-variant tracking-wide">
                  BATCH TIME (leave blank to use now)
                </label>
                <input
                  type="datetime-local"
                  value={batchTime}
                  onChange={(e) => setBatchTime(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-outline-variant bg-surface text-sm focus:outline-none focus:border-primary transition-colors"
                />
              </div>

              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={requiresRetarder}
                  onChange={(e) => setRequiresRetarder(e.target.checked)}
                  className="w-4 h-4 rounded accent-primary"
                />
                <span className="text-sm text-on-surface">Add chemical retarder (extends window)</span>
              </label>

              <div className="flex gap-2">
                <button
                  onClick={handleBegin}
                  disabled={loading}
                  className="flex-1 py-2.5 rounded-xl bg-md-green text-white font-semibold text-sm hover:shadow-md transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {loading ? "Starting" : " Begin Trip"}
                </button>
                <button
                  onClick={() => setShowBeginForm(false)}
                  className="px-4 py-2 rounded-xl border border-outline-variant text-sm hover:bg-surface-container-low transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <div className="flex gap-2">
              <button
                onClick={() => setShowBeginForm(true)}
                className="flex-1 py-2.5 rounded-xl bg-md-green text-white font-semibold text-sm hover:shadow-md transition-all active:scale-[0.98]"
              >
                 Begin Trip
              </button>
              <button
                onClick={handleCancel}
                disabled={loading}
                className="px-4 py-2 rounded-xl border border-md-red text-md-red text-sm font-medium hover:bg-md-red/10 transition-colors disabled:opacity-50"
              >
                 Cancel
              </button>
            </div>
          )}
        </div>
      )}

      {/*  In-progress controls  */}
      {isActive && (
        <div className="space-y-2">
          {trip.status === "in_progress" && (
            <div className="flex gap-2">
              <button
                onClick={handlePause}
                disabled={loading}
                className="flex-1 py-2 rounded-xl border border-outline-variant text-sm font-medium hover:bg-surface-container transition-colors disabled:opacity-50"
              >
                 Pause
              </button>
              <button
                onClick={() => setShowCompleteForm(true)}
                disabled={loading}
                className="flex-1 py-2 rounded-xl bg-md-green text-white text-sm font-semibold hover:shadow-md transition-all disabled:opacity-50"
              >
                 Complete
              </button>
            </div>
          )}
          {trip.status === "paused" && (
            <div className="flex gap-2">
              <button
                onClick={handleResume}
                disabled={loading}
                className="flex-1 py-2 rounded-xl bg-md-green text-white text-sm font-semibold hover:shadow-md transition-all disabled:opacity-50"
              >
                 Resume
              </button>
              <button
                onClick={handleCancel}
                disabled={loading}
                className="flex-1 py-2 rounded-xl border border-md-red text-md-red text-sm font-medium hover:bg-md-red/10 transition-colors disabled:opacity-50"
              >
                 Cancel
              </button>
            </div>
          )}
        </div>
      )}

      {/*  Complete outcome dialog  */}
      {showCompleteForm && (
        <div className="p-4 rounded-xl border border-outline-variant bg-surface-container space-y-3">
          <p className="text-sm font-semibold text-on-surface">Mark as Completed</p>

          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => setOutcomeSuccess(true)}
              className={`py-2.5 rounded-xl text-sm font-semibold border-2 transition-all ${
                outcomeSuccess === true
                  ? "border-emerald-500 bg-emerald-50 text-emerald-700"
                  : "border-outline-variant text-on-surface-variant hover:border-emerald-300"
              }`}
            >
               Succeeded
            </button>
            <button
              onClick={() => setOutcomeSuccess(false)}
              className={`py-2.5 rounded-xl text-sm font-semibold border-2 transition-all ${
                outcomeSuccess === false
                  ? "border-red-400 bg-red-50 text-red-700"
                  : "border-outline-variant text-on-surface-variant hover:border-red-300"
              }`}
            >
               Failed
            </button>
          </div>

          <textarea
            value={outcomeNotes}
            onChange={(e) => setOutcomeNotes(e.target.value)}
            placeholder="Notes (optional) — e.g. 'Poured on time, minor slump issue'"
            rows={2}
            className="w-full px-3 py-2 rounded-xl border border-outline-variant bg-surface text-sm placeholder:text-on-surface-variant/40 focus:outline-none focus:border-primary transition-colors resize-none"
          />

          <div className="flex gap-2">
            <button
              onClick={handleComplete}
              disabled={loading || outcomeSuccess === null}
              className="flex-1 py-2 rounded-xl bg-primary text-on-primary text-sm font-semibold hover:shadow-md transition-all disabled:opacity-40"
            >
              {loading ? "Saving" : "Confirm"}
            </button>
            <button
              onClick={() => { setShowCompleteForm(false); setOutcomeSuccess(null); setOutcomeNotes(""); }}
              className="px-4 py-2 rounded-xl border border-outline-variant text-sm hover:bg-surface-container-low transition-colors"
            >
              Back
            </button>
          </div>
        </div>
      )}

      {/* Last traffic check */}
      {trip.last_traffic_check_at && isActive && (
        <p className="text-xs text-on-surface-variant text-center">
          Last traffic check: {new Date(trip.last_traffic_check_at).toLocaleTimeString()}
        </p>
      )}
    </div>
  );
}
