"use client";

import { useCallback, useEffect, useState } from "react";
import { getAllTrips, cancelTrip } from "@/lib/api";
import type { TripResponse, TripStatus } from "@/types/route";
import TripStatusBadge from "@/components/TripStatusBadge";
import { showToast } from "@/components/Toast";

const STATUS_FILTERS: { label: string; values: TripStatus[] | "all" }[] = [
  { label: "All", values: "all" },
  { label: "Active", values: ["pending", "in_progress", "paused"] },
  { label: "Pending", values: ["pending"] },
  { label: "In Progress", values: ["in_progress"] },
  { label: "Completed", values: ["completed"] },
  { label: "Cancelled", values: ["cancelled"] },
];

function formatNZT(iso: string) {
  return new Date(iso).toLocaleString("en-NZ", {
    timeZone: "Pacific/Auckland",
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function TripsListPanel({
  onViewTrip,
}: {
  onViewTrip?: (trip: TripResponse) => void;
}) {
  const [trips, setTrips] = useState<TripResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [cancellingId, setCancellingId] = useState<number | null>(null);
  const [filterIdx, setFilterIdx] = useState(1); // default: Active
  const [confirmCancel, setConfirmCancel] = useState<number | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getAllTrips(100);
      setTrips(data);
    } catch {
      showToast("Failed to load trips", "error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const handleCancel = async (tripId: number) => {
    setCancellingId(tripId);
    try {
      await cancelTrip(tripId);
      showToast(`Trip #${tripId} cancelled`, "success");
      setTrips((prev) =>
        prev.map((t) => (t.id === tripId ? { ...t, status: "cancelled" } : t))
      );
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Cancel failed", "error");
    } finally {
      setCancellingId(null);
      setConfirmCancel(null);
    }
  };

  const filter = STATUS_FILTERS[filterIdx];
  const visible =
    filter.values === "all"
      ? trips
      : trips.filter((t) => (filter.values as TripStatus[]).includes(t.status));

  return (
    <div className="space-y-3">
      {/* Header row */}
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-on-surface">Trips</h3>
        <button
          onClick={refresh}
          disabled={loading}
          className="flex items-center gap-1.5 text-xs text-primary font-medium hover:opacity-80 transition-opacity disabled:opacity-40"
        >
          <svg
            className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
          >
            <path d="M1 4v6h6M23 20v-6h-6" />
            <path d="M20.49 9A9 9 0 0 0 5.64 5.64L1 10m22 4-4.64 4.36A9 9 0 0 1 3.51 15" />
          </svg>
          Refresh
        </button>
      </div>

      {/* Filter chips */}
      <div className="flex flex-wrap gap-1.5">
        {STATUS_FILTERS.map((f, i) => (
          <button
            key={i}
            onClick={() => setFilterIdx(i)}
            className={`px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${
              filterIdx === i
                ? "bg-primary text-on-primary"
                : "bg-surface-container text-on-surface-variant hover:bg-surface-container-high"
            }`}
          >
            {f.label}
            {f.values !== "all" && (
              <span className="ml-1 opacity-70">
                ({trips.filter((t) => (f.values as TripStatus[]).includes(t.status)).length})
              </span>
            )}
          </button>
        ))}
      </div>

      {/* List */}
      {loading && trips.length === 0 ? (
        <div className="flex justify-center py-8">
          <svg className="animate-spin h-6 w-6 text-primary" viewBox="0 0 24 24" fill="none">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
        </div>
      ) : visible.length === 0 ? (
        <div className="py-8 text-center text-sm text-on-surface-variant">
          No trips found
        </div>
      ) : (
        <div className="space-y-2">
          {visible.map((trip) => {
            const canCancel = trip.status === "pending" || trip.status === "in_progress" || trip.status === "paused";
            const isConfirming = confirmCancel === trip.id;
            const isCancelling = cancellingId === trip.id;

            return (
              <div
                key={trip.id}
                className="p-3 rounded-xl border border-outline-variant bg-surface-container space-y-2"
              >
                {/* Row 1: ID + status + actions */}
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-sm font-semibold text-on-surface">#{trip.id}</span>
                    <TripStatusBadge status={trip.status} size="sm" />
                    {trip.concrete_mix && (
                      <span className="px-1.5 py-0.5 rounded-md bg-primary/10 text-primary text-[10px] font-bold">
                        {trip.concrete_mix}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    {onViewTrip && (
                      <button
                        onClick={() => onViewTrip(trip)}
                        className="px-2 py-1 rounded-lg text-xs font-medium text-primary border border-primary/30 hover:bg-primary/5 transition-colors"
                      >
                        View
                      </button>
                    )}
                    {canCancel && !isConfirming && (
                      <button
                        onClick={() => setConfirmCancel(trip.id)}
                        disabled={isCancelling}
                        className="px-2 py-1 rounded-lg text-xs font-medium text-md-red border border-md-red/30 hover:bg-md-red/5 transition-colors disabled:opacity-40"
                      >
                        Cancel
                      </button>
                    )}
                    {isConfirming && (
                      <div className="flex items-center gap-1">
                        <span className="text-xs text-on-surface-variant">Sure?</span>
                        <button
                          onClick={() => handleCancel(trip.id)}
                          disabled={isCancelling}
                          className="px-2 py-1 rounded-lg text-xs font-medium bg-md-red text-white hover:opacity-80 transition-opacity disabled:opacity-40"
                        >
                          {isCancelling ? "…" : "Yes"}
                        </button>
                        <button
                          onClick={() => setConfirmCancel(null)}
                          className="px-2 py-1 rounded-lg text-xs font-medium text-on-surface-variant border border-outline-variant hover:bg-surface-container-high transition-colors"
                        >
                          No
                        </button>
                      </div>
                    )}
                  </div>
                </div>

                {/* Row 2: addresses */}
                <div className="text-xs text-on-surface-variant space-y-0.5">
                  <p className="truncate">
                    <span className="font-medium text-on-surface">From:</span>{" "}
                    {trip.start_address}
                  </p>
                  <p className="truncate">
                    <span className="font-medium text-on-surface">To:</span>{" "}
                    {trip.end_address}
                  </p>
                </div>

                {/* Row 3: metadata */}
                <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-on-surface-variant">
                  {trip.vehicle_id && <span>🚛 {trip.vehicle_id}</span>}
                  {trip.volume_m3 != null && <span>📦 {trip.volume_m3} m³</span>}
                  {trip.scheduled_at && (
                    <span>🕐 {formatNZT(trip.scheduled_at)}</span>
                  )}
                  {trip.original_distance_meters && (
                    <span>📍 {(trip.original_distance_meters / 1000).toFixed(1)} km</span>
                  )}
                  {trip.original_duration_seconds && (
                    <span>⏱ ~{Math.round(trip.original_duration_seconds / 60)} min</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
