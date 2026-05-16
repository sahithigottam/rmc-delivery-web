"use client";

import { useCallback, useEffect, useState } from "react";
import { getAllTrips, cancelTrip, deleteTrip } from "@/lib/api";
import type { TripResponse, TripStatus } from "@/types/route";
import TripStatusBadge from "@/components/TripStatusBadge";
import { showToast } from "@/components/Toast";

const ACTIVE_STATUSES: TripStatus[] = ["pending", "in_progress", "paused"];

function formatNZT(iso: string) {
  return new Date(iso).toLocaleString("en-NZ", {
    timeZone: "Pacific/Auckland",
    day: "numeric",
    month: "short",
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
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [mixFilter, setMixFilter] = useState("all");
  const [confirmCancel, setConfirmCancel] = useState<number | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<number | null>(null);

  const SS_KEY = "rmc_trip_history";

  function readHistory(): TripResponse[] {
    try { return JSON.parse(sessionStorage.getItem(SS_KEY) ?? "[]"); } catch { return []; }
  }
  function writeHistory(ts: TripResponse[]) {
    const trimmed = ts.filter((t) => !ACTIVE_STATUSES.includes(t.status)).sort((a, b) => b.id - a.id).slice(0, 200);
    sessionStorage.setItem(SS_KEY, JSON.stringify(trimmed));
  }

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const active = await getAllTrips();
      const historical = readHistory();
      const activeIds = new Set(active.map((t) => t.id));
      setTrips([...active, ...historical.filter((t) => !activeIds.has(t.id))]);
    } catch {
      showToast("Failed to load trips", "error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const handleCancel = async (tripId: number) => {
    setCancellingId(tripId);
    try {
      await cancelTrip(tripId);
      showToast(`Trip #${tripId} cancelled`, "success");
      setTrips((prev) => {
        const updated = prev.map((t) => t.id === tripId ? { ...t, status: "cancelled" as TripStatus } : t);
        writeHistory(updated);
        return updated;
      });
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Cancel failed", "error");
    } finally { setCancellingId(null); setConfirmCancel(null); }
  };

  const handleDelete = async (tripId: number) => {
    setDeletingId(tripId);
    try {
      await deleteTrip(tripId);
      showToast(`Trip #${tripId} deleted`, "success");
      setTrips((prev) => {
        const updated = prev.filter((t) => t.id !== tripId);
        writeHistory(updated);
        return updated;
      });
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Delete failed", "error");
    } finally { setDeletingId(null); setConfirmDelete(null); }
  };

  const mixes = Array.from(new Set(trips.map((t) => t.concrete_mix).filter(Boolean))).sort() as string[];

  const visible = trips.filter((t) => {
    if (statusFilter === "active" && !ACTIVE_STATUSES.includes(t.status)) return false;
    if (statusFilter === "pending" && t.status !== "pending") return false;
    if (statusFilter === "in_progress" && t.status !== "in_progress") return false;
    if (statusFilter === "completed" && t.status !== "completed") return false;
    if (statusFilter === "cancelled" && t.status !== "cancelled") return false;
    if (mixFilter !== "all" && t.concrete_mix !== mixFilter) return false;
    return true;
  });

  return (
    <div className="max-w-6xl mx-auto px-5 py-6 space-y-4">

      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold">Trips</h1>
          <p className="text-sm text-on-surface-variant">
            {trips.length} total · {trips.filter((t) => ACTIVE_STATUSES.includes(t.status)).length} active
          </p>
        </div>
        <button onClick={refresh} disabled={loading}
          className="flex items-center gap-1.5 text-xs text-primary font-medium hover:opacity-70 disabled:opacity-40 transition-opacity">
          <svg className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <path d="M1 4v6h6M23 20v-6h-6" /><path d="M20.49 9A9 9 0 0 0 5.64 5.64L1 10m22 4-4.64 4.36A9 9 0 0 1 3.51 15" />
          </svg>
          Refresh
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2 items-center">
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}
          className="px-3 py-1.5 rounded-lg border border-outline-variant bg-surface text-sm focus:outline-none focus:border-primary">
          <option value="all">All statuses</option>
          <option value="active">Active</option>
          <option value="pending">Pending</option>
          <option value="in_progress">In Progress</option>
          <option value="completed">Completed</option>
          <option value="cancelled">Cancelled</option>
        </select>
        {mixes.length > 0 && (
          <select value={mixFilter} onChange={(e) => setMixFilter(e.target.value)}
            className="px-3 py-1.5 rounded-lg border border-outline-variant bg-surface text-sm focus:outline-none focus:border-primary">
            <option value="all">All mixes</option>
            {mixes.map((m) => <option key={m} value={m}>{m}</option>)}
          </select>
        )}
        <span className="ml-auto text-xs text-on-surface-variant">{visible.length} shown</span>
      </div>

      {/* Table */}
      {loading && trips.length === 0 ? (
        <div className="flex justify-center py-12">
          <svg className="animate-spin h-7 w-7 text-primary" viewBox="0 0 24 24" fill="none">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
        </div>
      ) : visible.length === 0 ? (
        <div className="py-10 text-center text-sm text-on-surface-variant border border-outline-variant rounded-xl">
          No trips match your filters
        </div>
      ) : (
        <div className="rounded-xl border border-outline-variant overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-surface-container text-on-surface-variant uppercase text-[11px] tracking-wide">
              <tr>
                <th className="px-4 py-3 text-left font-medium">Trip</th>
                <th className="px-4 py-3 text-left font-medium">Status</th>
                <th className="px-4 py-3 text-left font-medium hidden sm:table-cell">From</th>
                <th className="px-4 py-3 text-left font-medium hidden md:table-cell">To</th>
                <th className="px-4 py-3 text-left font-medium hidden lg:table-cell">Scheduled</th>
                <th className="px-4 py-3 text-right font-medium">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-outline-variant/50">
              {visible.map((trip) => {
                const canCancel = trip.status === "pending" || trip.status === "in_progress" || trip.status === "paused";
                const canDelete = trip.status === "cancelled" || trip.status === "completed";
                const isConfirming = confirmCancel === trip.id;
                const isCancelling = cancellingId === trip.id;
                const isConfirmingDelete = confirmDelete === trip.id;
                const isDeleting = deletingId === trip.id;

                return (
                  <tr key={trip.id} className="hover:bg-surface-container/50 transition-colors">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-on-surface">#{trip.id}</span>
                        {trip.concrete_mix && (
                          <span className="px-1.5 py-0.5 rounded-md bg-primary/10 text-primary text-[10px] font-bold">{trip.concrete_mix}</span>
                        )}
                      </div>
                      {trip.original_distance_meters != null && (
                        <p className="text-[11px] text-on-surface-variant mt-0.5">
                          {(trip.original_distance_meters / 1000).toFixed(1)} km
                          {trip.original_duration_seconds != null && ` · ~${Math.round(trip.original_duration_seconds / 60)} min`}
                        </p>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <TripStatusBadge status={trip.status} size="sm" />
                    </td>
                    <td className="px-4 py-3 text-on-surface-variant hidden sm:table-cell max-w-[180px] truncate">
                      {trip.start_address.split(",")[0]}
                    </td>
                    <td className="px-4 py-3 text-on-surface-variant hidden md:table-cell max-w-[180px] truncate">
                      {trip.end_address.split(",")[0]}
                    </td>
                    <td className="px-4 py-3 text-on-surface-variant hidden lg:table-cell text-xs whitespace-nowrap">
                      {trip.scheduled_at ? formatNZT(trip.scheduled_at) : "—"}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1.5">
                        {onViewTrip && (
                          <button onClick={() => onViewTrip(trip)}
                            className="px-2.5 py-1 rounded-lg text-xs font-medium text-primary border border-primary/30 hover:bg-primary/5 transition-colors">
                            View
                          </button>
                        )}
                        {canCancel && !isConfirming && (
                          <button onClick={() => setConfirmCancel(trip.id)} disabled={isCancelling}
                            className="px-2.5 py-1 rounded-lg text-xs font-medium text-md-red border border-md-red/30 hover:bg-md-red/5 transition-colors disabled:opacity-40">
                            Cancel
                          </button>
                        )}
                        {isConfirming && (
                          <div className="flex items-center gap-1">
                            <span className="text-xs text-on-surface-variant">Sure?</span>
                            <button onClick={() => handleCancel(trip.id)} disabled={isCancelling}
                              className="px-2 py-1 rounded-lg text-xs font-medium bg-md-red text-white hover:opacity-80 disabled:opacity-40">
                              {isCancelling ? "…" : "Yes"}
                            </button>
                            <button onClick={() => setConfirmCancel(null)}
                              className="px-2 py-1 rounded-lg text-xs text-on-surface-variant border border-outline-variant hover:bg-surface-container">
                              No
                            </button>
                          </div>
                        )}
                        {canDelete && !isConfirmingDelete && (
                          <button onClick={() => setConfirmDelete(trip.id)} disabled={isDeleting}
                            className="px-2.5 py-1 rounded-lg text-xs font-medium text-on-surface-variant border border-outline-variant hover:bg-surface-container transition-colors disabled:opacity-40">
                            Delete
                          </button>
                        )}
                        {isConfirmingDelete && (
                          <div className="flex items-center gap-1">
                            <span className="text-xs text-on-surface-variant">Delete?</span>
                            <button onClick={() => handleDelete(trip.id)} disabled={isDeleting}
                              className="px-2 py-1 rounded-lg text-xs font-medium bg-md-red text-white hover:opacity-80 disabled:opacity-40">
                              {isDeleting ? "…" : "Yes"}
                            </button>
                            <button onClick={() => setConfirmDelete(null)}
                              className="px-2 py-1 rounded-lg text-xs text-on-surface-variant border border-outline-variant hover:bg-surface-container">
                              No
                            </button>
                          </div>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
