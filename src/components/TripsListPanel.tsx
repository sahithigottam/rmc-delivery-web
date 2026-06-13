"use client";

import { useCallback, useEffect, useState } from "react";
import { getAllTrips, cancelTrip, deleteTrip, completeTrip, markTripPending, markTripDelayed, getPlants } from "@/lib/api";
import type { TripResponse, TripStatus, PlantOut } from "@/types/route";
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
  const [completingId, setCompletingId] = useState<number | null>(null);
  const [pendingId, setPendingId] = useState<number | null>(null);
  const [delayedId, setDelayedId] = useState<number | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [mixFilter, setMixFilter] = useState("all");
  const [brandFilter, setBrandFilter] = useState("all");
  const [plantFilter, setPlantFilter] = useState("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [plants, setPlants] = useState<PlantOut[]>([]);
  const [confirmCancel, setConfirmCancel] = useState<number | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<number | null>(null);
  const [confirmComplete, setConfirmComplete] = useState<number | null>(null);
  const [confirmPending, setConfirmPending] = useState<number | null>(null);
  const [confirmDelayed, setConfirmDelayed] = useState<number | null>(null);

  // Load plants for brand/plant filter labels
  useEffect(() => {
    getPlants().then(setPlants).catch(() => {});
  }, []);

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

  const handleComplete = async (tripId: number) => {
    setCompletingId(tripId);
    try {
      await completeTrip(tripId);
      showToast(`Trip #${tripId} marked done`, "success");
      setTrips((prev) => {
        const updated = prev.map((t) => t.id === tripId ? { ...t, status: "completed" as TripStatus } : t);
        writeHistory(updated);
        return updated;
      });
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Complete failed", "error");
    } finally { setCompletingId(null); setConfirmComplete(null); }
  };

  const handleMarkPending = async (tripId: number) => {
    setPendingId(tripId);
    try {
      await markTripPending(tripId);
      showToast(`Trip #${tripId} marked pending`, "success");
      setTrips((prev) => {
        const updated = prev.map((t) => t.id === tripId ? { ...t, status: "pending" as TripStatus } : t);
        writeHistory(updated);
        return updated;
      });
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Mark pending failed", "error");
    } finally { setPendingId(null); setConfirmPending(null); }
  };

  const handleMarkDelayed = async (tripId: number) => {
    setDelayedId(tripId);
    try {
      await markTripDelayed(tripId);
      showToast(`Trip #${tripId} marked delayed`, "success");
      setTrips((prev) => {
        const updated = prev.map((t) => t.id === tripId ? { ...t, status: "delayed" as TripStatus } : t);
        writeHistory(updated);
        return updated;
      });
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Mark delayed failed", "error");
    } finally { setDelayedId(null); setConfirmDelayed(null); }
  };

  const mixes = Array.from(new Set(trips.map((t) => t.concrete_mix).filter(Boolean))).sort() as string[];

  // Derive brand/plant options from plants data (only those seen in trips)
  const plantMap = Object.fromEntries(plants.map((p) => [p.id, p]));
  const brands = Array.from(new Set(
    trips.map((t) => t.plant_id ? plantMap[t.plant_id]?.brand : undefined).filter(Boolean)
  )).sort() as string[];
  const plantsForBrand = plants.filter(
    (p) => brandFilter === "all" || p.brand === brandFilter
  ).filter((p) => trips.some((t) => t.plant_id === p.id));

  function exportCSV() {
    const esc = (v: string | number | null | undefined) => {
      if (v == null) return "";
      const s = String(v);
      return s.includes(",") || s.includes("\"") || s.includes("\n") ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const fmtDate = (iso?: string | null) =>
      iso ? new Date(iso).toLocaleString("en-NZ", { timeZone: "Pacific/Auckland" }) : "";
    const durMin = (secs?: number | null) =>
      secs != null ? (secs / 60).toFixed(1) : "";
    const distKm = (m?: number | null) =>
      m != null ? (m / 1000).toFixed(3) : "";

    const headers = [
      "Trip ID", "Status", "Outcome",
      "Mix", "Mix Code", "Grade", "Volume m³",
      "Brand", "Plant",
      "From (full)", "To (full)",
      "Scheduled At (NZT)", "Started At (NZT)", "Completed At (NZT)",
      "Duration (min)",
      "Original Distance (km)", "Original Duration (min)",
      "Traffic Delay (s)",
      "Reroute Count", "Last Rerouted At (NZT)",
      "Load Status", "Load Remaining (min)", "Batch Time (NZT)", "Load Expiry (NZT)",
      "Vehicle ID", "Priority",
      "Created At (NZT)",
    ];

    const rows = visible.map((t) => {
      const actualDuration =
        t.started_at && t.completed_at
          ? ((new Date(t.completed_at).getTime() - new Date(t.started_at).getTime()) / 60000).toFixed(1)
          : "";
      const plant = t.plant_id ? plantMap[t.plant_id] : undefined;
      return [
        esc(t.id), esc(t.status), esc(t.outcome),
        esc(t.concrete_mix), esc(t.mix_code), esc(t.concrete_grade), esc(t.volume_m3),
        esc(plant?.brand ?? ""), esc(plant?.name ?? t.plant_id ?? ""),
        esc(t.start_address), esc(t.end_address),
        esc(fmtDate(t.scheduled_at)), esc(fmtDate(t.started_at)), esc(fmtDate(t.completed_at)),
        esc(actualDuration),
        esc(distKm(t.original_distance_meters)), esc(durMin(t.original_duration_seconds)),
        esc(t.current_traffic_delay),
        esc(t.reroute_count), esc(fmtDate(t.last_reroute_at)),
        esc(t.load_status), esc(t.load_minutes_remaining != null ? t.load_minutes_remaining.toFixed(1) : undefined),
        esc(fmtDate(t.batch_time)), esc(fmtDate(t.load_expiry_time)),
        esc(t.vehicle_id), esc(t.priority),
        esc(fmtDate(t.created_at)),
      ].join(",");
    });

    const csv = [headers.join(","), ...rows].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `trips-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const visible = trips.filter((t) => {
    if (statusFilter === "active" && !ACTIVE_STATUSES.includes(t.status)) return false;
    if (statusFilter === "pending" && t.status !== "pending") return false;
    if (statusFilter === "in_progress" && t.status !== "in_progress") return false;
    if (statusFilter === "completed" && t.status !== "completed") return false;
    if (statusFilter === "cancelled" && t.status !== "cancelled") return false;
    if (statusFilter === "delayed" && t.status !== "delayed") return false;
    if (mixFilter !== "all" && t.concrete_mix !== mixFilter) return false;
    if (brandFilter !== "all") {
      const tripBrand = t.plant_id ? plantMap[t.plant_id]?.brand : undefined;
      if (tripBrand !== brandFilter) return false;
    }
    if (plantFilter !== "all" && t.plant_id !== plantFilter) return false;
    if (dateFrom) {
      const ref = t.scheduled_at ?? t.created_at;
      if (!ref || ref < dateFrom) return false;
    }
    if (dateTo) {
      const ref = t.scheduled_at ?? t.created_at;
      const toEnd = dateTo + "T23:59:59";
      if (!ref || ref > toEnd) return false;
    }
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
        <div className="flex items-center gap-3">
          <button onClick={() => exportCSV()} disabled={visible.length === 0}
            className="flex items-center gap-1.5 text-xs text-on-surface-variant font-medium hover:opacity-70 disabled:opacity-40 transition-opacity">
            <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="7 10 12 15 17 10" />
              <line x1="12" y1="15" x2="12" y2="3" />
            </svg>
            Export CSV
          </button>
          <button onClick={refresh} disabled={loading}
            className="flex items-center gap-1.5 text-xs text-primary font-medium hover:opacity-70 disabled:opacity-40 transition-opacity">
            <svg className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M1 4v6h6M23 20v-6h-6" /><path d="M20.49 9A9 9 0 0 0 5.64 5.64L1 10m22 4-4.64 4.36A9 9 0 0 1 3.51 15" />
            </svg>
            Refresh
          </button>
        </div>
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
          <option value="delayed">Delayed</option>
        </select>
        {mixes.length > 0 && (
          <select value={mixFilter} onChange={(e) => setMixFilter(e.target.value)}
            className="px-3 py-1.5 rounded-lg border border-outline-variant bg-surface text-sm focus:outline-none focus:border-primary">
            <option value="all">All mixes</option>
            {mixes.map((m) => <option key={m} value={m}>{m}</option>)}
          </select>
        )}
        {brands.length > 0 && (
          <select value={brandFilter} onChange={(e) => { setBrandFilter(e.target.value); setPlantFilter("all"); }}
            className="px-3 py-1.5 rounded-lg border border-outline-variant bg-surface text-sm focus:outline-none focus:border-primary">
            <option value="all">All brands</option>
            {brands.map((b) => <option key={b} value={b}>{b}</option>)}
          </select>
        )}
        {plantsForBrand.length > 0 && (
          <select value={plantFilter} onChange={(e) => setPlantFilter(e.target.value)}
            className="px-3 py-1.5 rounded-lg border border-outline-variant bg-surface text-sm focus:outline-none focus:border-primary">
            <option value="all">All plants</option>
            {plantsForBrand.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        )}
        <div className="flex items-center gap-1.5">
          <label className="text-xs text-on-surface-variant whitespace-nowrap">From</label>
          <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)}
            className="px-2 py-1.5 rounded-lg border border-outline-variant bg-surface text-sm focus:outline-none focus:border-primary" />
        </div>
        <div className="flex items-center gap-1.5">
          <label className="text-xs text-on-surface-variant whitespace-nowrap">To</label>
          <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)}
            className="px-2 py-1.5 rounded-lg border border-outline-variant bg-surface text-sm focus:outline-none focus:border-primary" />
        </div>
        {(statusFilter !== "all" || mixFilter !== "all" || brandFilter !== "all" || plantFilter !== "all" || dateFrom || dateTo) && (
          <button onClick={() => { setStatusFilter("all"); setMixFilter("all"); setBrandFilter("all"); setPlantFilter("all"); setDateFrom(""); setDateTo(""); }}
            className="text-xs text-on-surface-variant hover:text-on-surface transition-colors underline underline-offset-2">
            Clear
          </button>
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
                      <div className="flex items-center justify-end gap-1 flex-wrap">
                        {onViewTrip && (
                          <button onClick={() => onViewTrip(trip)}
                            className="px-2.5 py-1 rounded-lg text-xs font-medium text-primary border border-primary/30 hover:bg-primary/5 transition-colors">
                            View
                          </button>
                        )}
                        {trip.status !== "completed" && !confirmComplete && (
                          <button onClick={() => setConfirmComplete(trip.id)} disabled={completingId === trip.id}
                            className="px-2.5 py-1 rounded-lg text-xs font-medium text-emerald-600 border border-emerald-600/30 hover:bg-emerald-600/5 transition-colors disabled:opacity-40">
                            Done
                          </button>
                        )}
                        {confirmComplete === trip.id && (
                          <div className="flex items-center gap-1">
                            <button onClick={() => handleComplete(trip.id)} disabled={completingId === trip.id}
                              className="px-2 py-1 rounded-lg text-xs font-medium bg-emerald-600 text-white hover:opacity-80 disabled:opacity-40">
                              {completingId === trip.id ? "…" : "Yes"}
                            </button>
                            <button onClick={() => setConfirmComplete(null)}
                              className="px-2 py-1 rounded-lg text-xs text-on-surface-variant border border-outline-variant hover:bg-surface-container">
                              No
                            </button>
                          </div>
                        )}
                        {trip.status !== "delayed" && trip.status !== "completed" && trip.status !== "cancelled" && !confirmDelayed && (
                          <button onClick={() => setConfirmDelayed(trip.id)} disabled={delayedId === trip.id}
                            className="px-2.5 py-1 rounded-lg text-xs font-medium text-amber-600 border border-amber-600/30 hover:bg-amber-600/5 transition-colors disabled:opacity-40">
                            Delay
                          </button>
                        )}
                        {confirmDelayed === trip.id && (
                          <div className="flex items-center gap-1">
                            <button onClick={() => handleMarkDelayed(trip.id)} disabled={delayedId === trip.id}
                              className="px-2 py-1 rounded-lg text-xs font-medium bg-amber-600 text-white hover:opacity-80 disabled:opacity-40">
                              {delayedId === trip.id ? "…" : "Yes"}
                            </button>
                            <button onClick={() => setConfirmDelayed(null)}
                              className="px-2 py-1 rounded-lg text-xs text-on-surface-variant border border-outline-variant hover:bg-surface-container">
                              No
                            </button>
                          </div>
                        )}
                        {trip.status !== "pending" && trip.status !== "completed" && trip.status !== "cancelled" && !confirmPending && (
                          <button onClick={() => setConfirmPending(trip.id)} disabled={pendingId === trip.id}
                            className="px-2.5 py-1 rounded-lg text-xs font-medium text-blue-600 border border-blue-600/30 hover:bg-blue-600/5 transition-colors disabled:opacity-40">
                            Pending
                          </button>
                        )}
                        {confirmPending === trip.id && (
                          <div className="flex items-center gap-1">
                            <button onClick={() => handleMarkPending(trip.id)} disabled={pendingId === trip.id}
                              className="px-2 py-1 rounded-lg text-xs font-medium bg-blue-600 text-white hover:opacity-80 disabled:opacity-40">
                              {pendingId === trip.id ? "…" : "Yes"}
                            </button>
                            <button onClick={() => setConfirmPending(null)}
                              className="px-2 py-1 rounded-lg text-xs text-on-surface-variant border border-outline-variant hover:bg-surface-container">
                              No
                            </button>
                          </div>
                        )}
                        {trip.status === "pending" || trip.status === "in_progress" || trip.status === "paused" ? (
                          !confirmCancel && (
                            <button onClick={() => setConfirmCancel(trip.id)} disabled={cancellingId === trip.id}
                              className="px-2.5 py-1 rounded-lg text-xs font-medium text-md-red border border-md-red/30 hover:bg-md-red/5 transition-colors disabled:opacity-40">
                              Cancel
                            </button>
                          )
                        ) : null}
                        {confirmCancel === trip.id && (
                          <div className="flex items-center gap-1">
                            <span className="text-xs text-on-surface-variant">Sure?</span>
                            <button onClick={() => handleCancel(trip.id)} disabled={cancellingId === trip.id}
                              className="px-2 py-1 rounded-lg text-xs font-medium bg-md-red text-white hover:opacity-80 disabled:opacity-40">
                              {cancellingId === trip.id ? "…" : "Yes"}
                            </button>
                            <button onClick={() => setConfirmCancel(null)}
                              className="px-2 py-1 rounded-lg text-xs text-on-surface-variant border border-outline-variant hover:bg-surface-container">
                              No
                            </button>
                          </div>
                        )}
                        {trip.status === "cancelled" || trip.status === "completed" ? (
                          !confirmDelete && (
                            <button onClick={() => setConfirmDelete(trip.id)} disabled={deletingId === trip.id}
                              className="px-2.5 py-1 rounded-lg text-xs font-medium text-on-surface-variant border border-outline-variant hover:bg-surface-container transition-colors disabled:opacity-40">
                              Delete
                            </button>
                          )
                        ) : null}
                        {confirmDelete === trip.id && (
                          <div className="flex items-center gap-1">
                            <span className="text-xs text-on-surface-variant">Delete?</span>
                            <button onClick={() => handleDelete(trip.id)} disabled={deletingId === trip.id}
                              className="px-2 py-1 rounded-lg text-xs font-medium bg-md-red text-white hover:opacity-80 disabled:opacity-40">
                              {deletingId === trip.id ? "…" : "Yes"}
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
