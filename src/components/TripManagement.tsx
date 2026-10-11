"use client";

import { useEffect, useRef, useState } from "react";
import type { TripResponse, TripStatus } from "@/types/route";
import { beginTrip, pauseTrip, resumeTrip, completeTrip, cancelTrip } from "@/lib/api";
import { showToast } from "./Toast";
import TruckIcon from "./TruckIcon";
import type { TripActionRequest } from "@/lib/liveTripSummary";
import { isNearSite } from "@/lib/nearSite";
import { applyReasonChip, reasonChips } from "@/lib/completionReasons";
import { formatInZone, isEtaStale, timeZoneForTrip, zoneLabel, zonedInputToUtcIso } from "@/lib/time";

interface TripManagementProps {
  trip: TripResponse | null;
  onTripUpdated: (trip: TripResponse) => void;
  /** Latest known driver position [lat, lng], used to check the driver is at the site before completing */
  driverPosition?: [number, number] | null;
  /** GPS accuracy (m) of driverPosition, when it comes from this device */
  driverAccuracyM?: number | null;
  driverControls?: {
    gpsState: "idle" | "requesting" | "active" | "error";
    gpsError: string | null;
    remainingKm: number | null;
    onStartGps: () => void;
    onFormOpen: () => void;
  };
  /** Triggers an action requested from the always-visible sheet header; each id is handled once */
  actionRequest?: TripActionRequest | null;
}

export const COMPLETION_RADIUS_M = 100;

function distanceMeters(a: [number, number], b: [number, number]): number {
  const R = 6_371_000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b[0] - a[0]);
  const dLng = toRad(b[1] - a[1]);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a[0])) * Math.cos(toRad(b[0])) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

function formatDistance(m: number): string {
  return m >= 1000 ? `${(m / 1000).toFixed(1)} km` : `${Math.round(m)} m`;
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

export default function TripManagement({ trip, onTripUpdated, driverPosition, driverAccuracyM, driverControls, actionRequest }: TripManagementProps) {
  const [loading, setLoading] = useState(false);
  const handledRequestRef = useRef(actionRequest?.id ?? 0);
  const formRef = useRef<HTMLDivElement>(null);
  const scrollToFormRef = useRef(false);

  // Begin trip state
  const [showBeginForm, setShowBeginForm] = useState(false);
  const [batchTime, setBatchTime] = useState("");
  const [requiresRetarder, setRequiresRetarder] = useState(false);

  // Complete outcome state
  const [showCompleteForm, setShowCompleteForm] = useState(false);
  const [outcomeSuccess, setOutcomeSuccess] = useState<boolean | null>(null);
  const [outcomeNotes, setOutcomeNotes] = useState("");

  useEffect(() => {
    setShowBeginForm(false);
    setBatchTime("");
    setRequiresRetarder(false);
    setShowCompleteForm(false);
    setOutcomeSuccess(null);
    setOutcomeNotes("");
  }, [trip?.id]);

  useEffect(() => {
    if (!actionRequest || actionRequest.id === handledRequestRef.current || !trip) return;
    handledRequestRef.current = actionRequest.id;
    if (actionRequest.type === "begin" && trip.status === "pending") {
      scrollToFormRef.current = true;
      setShowBeginForm(true);
      driverControls?.onFormOpen();
    } else if (actionRequest.type === "end" && trip.status === "in_progress") {
      scrollToFormRef.current = true;
      setShowCompleteForm(true);
      driverControls?.onFormOpen();
    } else if (actionRequest.type === "resume" && trip.status === "paused") {
      void handleResume();
    }
    // handleResume is declared below and reads only trip.id and setters
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [actionRequest?.id]);

  // The header can request a form while the sheet is scrolled elsewhere
  useEffect(() => {
    if (!scrollToFormRef.current || !(showBeginForm || showCompleteForm)) return;
    scrollToFormRef.current = false;
    formRef.current?.scrollIntoView({ block: "nearest" });
  }, [showBeginForm, showCompleteForm]);

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
  const siteTz = timeZoneForTrip(trip);

  // Completing away from the job site is allowed, but the driver is warned
  // and the backend flags the trip for review.
  const distanceToSiteM = driverPosition
    ? distanceMeters(driverPosition, [trip.end_lat, trip.end_lng])
    : null;
  // A fix less precise than the completion radius can't prove the driver is at the site
  const lowAccuracy = driverAccuracyM != null && driverAccuracyM > COMPLETION_RADIUS_M;
  const atSite =
    distanceToSiteM !== null && distanceToSiteM <= COMPLETION_RADIUS_M && !lowAccuracy;
  const offSiteWarning = atSite
    ? null
    : distanceToSiteM === null
      ? "Driver location unknown. Completing now will be flagged for review."
      : lowAccuracy && distanceToSiteM <= COMPLETION_RADIUS_M
        ? `GPS is only accurate to ±${Math.round(driverAccuracyM!)} m, so arrival at the site can't be confirmed. Completing now may be flagged for review.`
        : `Driver is ${formatDistance(distanceToSiteM)} from the site (more than ${COMPLETION_RADIUS_M} m). Completing now will be flagged for review.`;

  // The backend rejects a successful completion of an expired load unless a reason is given
  const loadExpired =
    trip.load_status === "expired" ||
    (trip.load_minutes_remaining != null && trip.load_minutes_remaining <= 0);
  const notesRequired = outcomeSuccess === false || (outcomeSuccess === true && loadExpired);

  /*  Handlers  */
  const handleBegin = async () => {
    setLoading(true);
    try {
      const updated = await beginTrip(trip.id, {
        batch_time: batchTime ? zonedInputToUtcIso(batchTime, siteTz) : undefined,
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
    if (notesRequired && !outcomeNotes.trim()) {
      showToast(
        outcomeSuccess
          ? "The load has expired. Please explain why it was still delivered"
          : "Please add a reason for the failed delivery",
        "error",
      );
      return;
    }
    if (!atSite) {
      const where = distanceToSiteM === null
        ? "Your location is unknown"
        : lowAccuracy && distanceToSiteM <= COMPLETION_RADIUS_M
          ? `Your GPS is only accurate to ±${Math.round(driverAccuracyM!)} m, so we can't confirm you're at the site`
          : `You're ${formatDistance(distanceToSiteM)} away from the delivery site`;
      if (!confirm(`${where}. This trip may be flagged for review.\n\nComplete anyway?`)) return;
    }
    setLoading(true);
    try {
      const updated = await completeTrip(trip.id, {
        success: outcomeSuccess,
        notes: outcomeNotes.trim() || undefined,
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
      <div className={`${driverControls ? "p-3 flex flex-col" : "p-4"} rounded-xl bg-surface-container space-y-3`}>
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

        <div className="text-xs text-on-surface-variant space-y-0.5">
          <p className={driverControls ? "truncate" : ""} title={trip.start_address}>From: {trip.start_address}</p>
          <p className={driverControls ? "truncate" : ""} title={trip.end_address}>To: {trip.end_address}</p>
          {trip.scheduled_at && (
            <p> Scheduled: {formatInZone(trip.scheduled_at, siteTz, "full")}</p>
          )}
        </div>

        {/* Route info (always visible) */}
        {!driverControls && <div className="grid grid-cols-3 gap-2">
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
        </div>}

        {/* Load Timer (in-progress trips) */}
        {!driverControls && isActive && trip.load_minutes_remaining != null && trip.load_max_life_minutes && (
          <LoadTimerBar minutes={trip.load_minutes_remaining} max={trip.load_max_life_minutes} />
        )}

        {/* Load status badge */}
        {!driverControls && isActive && trip.load_status && (
          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold capitalize ${LOAD_STATUS_STYLE[trip.load_status] ?? "bg-gray-100 text-gray-600"}`}>
            {trip.load_status}
          </span>
        )}

        {/* Active trip metrics */}
        {isActive && (
          <div className={`grid ${driverControls ? "grid-cols-3" : "grid-cols-2"} gap-2`}>
            {(driverControls || trip.remaining_distance_meters != null) && (
              <div className="px-3 py-2 rounded-lg bg-surface-container-low">
                <p className="text-[11px] text-on-surface-variant">REMAINING</p>
                <p className="text-sm font-semibold text-on-surface">{driverControls
                  ? driverControls.remainingKm != null ? `${driverControls.remainingKm.toFixed(1)} km` : "Updating"
                  : `${(trip.remaining_distance_meters! / 1000).toFixed(1)} km`}</p>
              </div>
            )}
            {!driverControls && trip.remaining_duration_seconds != null && (
              <div className="px-3 py-2 rounded-lg bg-surface-container-low">
                <p className="text-[11px] text-on-surface-variant">DRIVE LEFT</p>
                <p className="text-sm font-semibold text-on-surface">{Math.round(trip.remaining_duration_seconds / 60)} min</p>
              </div>
            )}
            {(driverControls || trip.estimated_arrival) && (() => {
              const etaStale = isEtaStale(trip.estimated_arrival);
              return (
              <div className={`px-3 py-2 rounded-lg ${etaStale ? "bg-amber-50 text-amber-800" : "bg-surface-container-low"}`}>
                <p className={`text-[11px] ${etaStale ? "" : "text-on-surface-variant"}`}>ETA</p>
                <p className="text-sm font-semibold text-on-surface">
                  {etaStale ? "Outdated"
                    : trip.estimated_arrival ? formatInZone(trip.estimated_arrival, siteTz, "time")
                    : trip.remaining_duration_seconds != null ? `${Math.round(trip.remaining_duration_seconds / 60)} min` : "Updating"}
                </p>
                {etaStale && trip.estimated_arrival && (
                  <p className="text-[11px]">was {formatInZone(trip.estimated_arrival, siteTz, "time")}</p>
                )}
              </div>
              );
            })()}
            {driverControls && (
              <div className={`px-2 py-2 rounded-lg ${loadExpired ? "bg-md-red/10 text-error" : "bg-surface-container-low"}`}>
                <p className="text-[11px]">LOAD TIME</p>
                <p className="text-sm font-semibold">{trip.load_minutes_remaining != null
                  ? `${Math.max(0, Math.round(trip.load_minutes_remaining))} min` : "Updating"}</p>
                {trip.load_status && <p className="text-[11px] capitalize">{trip.load_status}</p>}
              </div>
            )}
            {trip.current_traffic_delay != null && trip.current_traffic_delay > 60 && (
              <div className="px-3 py-2 rounded-lg bg-md-red/10 col-span-2">
                <p className="text-[11px] text-md-red">TRAFFIC DELAY</p>
                <p className="text-sm font-semibold text-md-red">+{Math.round(trip.current_traffic_delay / 60)} min</p>
              </div>
            )}
            {driverControls && isActive && (
              <p role="status" className={`text-xs ${driverControls.gpsState === "error" ? "text-error" : "text-on-surface-variant"}`}>
                {driverControls.gpsState === "active" ? `GPS active${driverAccuracyM != null ? ` - accuracy ${Math.round(driverAccuracyM)} m` : ""}`
                  : driverControls.gpsState === "requesting" ? "Requesting GPS location..."
                  : driverControls.gpsState === "error" ? driverControls.gpsError ?? "GPS error"
                  : "GPS not started on this device"}
              </p>
            )}
          </div>
        )}

        {/* Outcome badge (completed/cancelled) */}
        {isDone && trip.outcome && (
          <div className={`px-3 py-2 rounded-lg text-sm font-medium ${trip.outcome === "succeeded" ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"}`}>
            {trip.outcome === "succeeded" ? " Delivered successfully" : " Delivery failed"}
          </div>
        )}
        {isDone && trip.completion_review_required && (
          <div role="status" className="px-3 py-2 rounded-lg text-xs font-medium bg-amber-50 text-amber-800">
            ⚠️ Flagged for review: {trip.completion_review_reason ?? "completed away from the site"}
            {trip.completion_distance_meters != null && ` (${formatDistance(trip.completion_distance_meters)} from site)`}
          </div>
        )}
      </div>

      {/*  Pending: Begin Trip Form  */}
      {trip.status === "pending" && (
        <div ref={formRef} className={`${driverControls ? "sticky bottom-0 z-10" : ""} p-4 rounded-xl bg-surface-container space-y-3`}>
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
                  BATCH TIME ({zoneLabel(siteTz)}, leave blank to use now)
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
                onClick={() => { setShowBeginForm(true); driverControls?.onFormOpen(); }}
                className="flex-1 py-2.5 rounded-xl bg-md-green text-white font-semibold text-sm hover:shadow-md transition-all active:scale-[0.98]"
              >
                 Start Trip
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
        <div className={`${driverControls ? "sticky bottom-0 z-10 bg-surface py-2" : ""} space-y-2`}>
          {driverControls && trip.status === "in_progress" &&
            (driverControls.gpsState === "idle" || driverControls.gpsState === "error") && (
              <button type="button" onClick={driverControls.onStartGps}
                className="w-full min-h-12 rounded-xl bg-primary text-on-primary text-sm font-semibold hover:bg-primary/90">
                Start GPS
              </button>
            )}
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
                onClick={() => { setShowCompleteForm(t => !t); driverControls?.onFormOpen(); }}
                disabled={loading}
                className={`flex-1 py-2 rounded-xl text-sm disabled:opacity-50 ${driverControls && !isNearSite(driverPosition, trip)
                  ? "border border-outline-variant font-medium text-on-surface-variant"
                  : "bg-md-green text-white font-semibold hover:shadow-md transition-all"}`}
              >
                 End Trip
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
      {showCompleteForm && trip.status === "in_progress" && (
        <div ref={formRef} className="p-4 rounded-xl border border-outline-variant bg-surface-container space-y-3">
          <p className="text-sm font-semibold text-on-surface">End Trip</p>

          <p
            role="status"
            className={`text-xs rounded-lg px-3 py-2 ${
              atSite ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-800"
            }`}
          >
            {atSite
              ? `Driver is at the site (${formatDistance(distanceToSiteM!)} away).`
              : offSiteWarning}
          </p>

          <div className="grid grid-cols-2 gap-2">
            <button
              aria-pressed={outcomeSuccess === true}
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
              aria-pressed={outcomeSuccess === false}
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

          {loadExpired && outcomeSuccess === true && (
            <p role="status" className="text-xs rounded-lg px-3 py-2 bg-red-50 text-red-700">
              This load has passed its concrete life. Explain why it was still poured (required).
            </p>
          )}

          {(() => {
            const chips = reasonChips(outcomeSuccess, loadExpired);
            return chips.length > 0 && (
              <div role="group" aria-label="Quick reasons" className="flex flex-wrap gap-2">
                {chips.map((chip) => (
                  <button
                    key={chip}
                    type="button"
                    aria-pressed={outcomeNotes.trim() === chip}
                    onClick={() => setOutcomeNotes(applyReasonChip(outcomeNotes, chip, chips))}
                    className={`min-h-12 rounded-full border px-4 text-sm ${
                      outcomeNotes.trim() === chip
                        ? "border-primary bg-primary-container font-medium text-primary"
                        : "border-outline-variant text-on-surface-variant"
                    }`}
                  >
                    {chip}
                  </button>
                ))}
              </div>
            );
          })()}

          <textarea
            aria-label={notesRequired ? "Delivery notes (required)" : "Delivery notes (optional)"}
            aria-required={notesRequired}
            value={outcomeNotes}
            onChange={(e) => setOutcomeNotes(e.target.value)}
            placeholder={outcomeSuccess === false
              ? "Reason for failure (required) — e.g. 'Truck broke down', 'Site refused load'"
              : outcomeSuccess === true && loadExpired
                ? "Reason (required) — e.g. 'Site engineer approved after slump test'"
                : "Notes (optional) — e.g. 'Poured on time, minor slump issue'"}
            rows={2}
            className="w-full px-3 py-2 rounded-xl border border-outline-variant bg-surface text-sm placeholder:text-on-surface-variant/40 focus:outline-none focus:border-primary transition-colors resize-none"
          />

          <div className="flex gap-2">
            <button
              onClick={handleComplete}
              disabled={
                loading ||
                outcomeSuccess === null ||
                (notesRequired && !outcomeNotes.trim())
              }
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
          Last traffic check: {formatInZone(trip.last_traffic_check_at, siteTz, "time")}
        </p>
      )}
    </div>
  );
}
