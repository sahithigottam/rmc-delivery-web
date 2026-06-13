"use client";

import type { TripResponse, TripStatus } from "@/types/route";
import TripStatusBadge from "./TripStatusBadge";

interface TruckStatusPanelProps {
  trips: TripResponse[];
  highlightedTripId?: number;
  jobSiteAddress?: string;
  plantId?: string;
  scheduledAt?: string;
}

const STATUS_COLORS: Record<TripStatus, { bg: string; text: string; icon: string }> = {
  pending: { bg: "bg-gray-100", text: "text-gray-700", icon: "⏳" },
  in_progress: { bg: "bg-blue-100", text: "text-blue-700", icon: "🚛" },
  paused: { bg: "bg-yellow-100", text: "text-yellow-700", icon: "⏸️" },
  completed: { bg: "bg-green-100", text: "text-green-700", icon: "✅" },
  cancelled: { bg: "bg-red-100", text: "text-red-700", icon: "❌" },
};

function formatDistance(meters?: number) {
  if (!meters) return "-";
  return meters >= 1000 ? `${(meters / 1000).toFixed(1)}km` : `${meters}m`;
}

function formatDuration(seconds?: number) {
  if (!seconds) return "-";
  const mins = Math.round(seconds / 60);
  return mins < 60 ? `${mins}min` : `${(mins / 60).toFixed(1)}h`;
}

export default function TruckStatusPanel({ 
  trips, 
  highlightedTripId,
  jobSiteAddress,
  plantId,
  scheduledAt,
}: TruckStatusPanelProps) {
  // Filter trips to only show those for the current job
  const jobTrips = trips.filter((t) => {
    // Match job site address (partial match for flexibility)
    if (jobSiteAddress && t.end_address) {
      const searchTerm = jobSiteAddress.split(',')[0].trim().toLowerCase();
      const dbTerm = t.end_address.split(',')[0].trim().toLowerCase();
      if (!dbTerm.includes(searchTerm) && !searchTerm.includes(dbTerm)) return false;
    }
    // Match plant ID
    if (plantId && t.plant_id !== plantId) return false;
    // Match scheduled date (compare dates loosely)
    if (scheduledAt) {
      const tripDate = t.scheduled_at ? new Date(t.scheduled_at).toDateString() : null;
      const schedDate = new Date(scheduledAt).toDateString();
      if (tripDate !== schedDate) return false;
    }
    return true;
  });

  if (jobTrips.length === 0) {
    return null;
  }

  const activeTrucks = jobTrips.filter((t) => ["pending", "in_progress", "paused"].includes(t.status));
  const completedTrucks = jobTrips.filter((t) => t.status === "completed");
  const cancelledTrucks = jobTrips.filter((t) => t.status === "cancelled");
  
  // Calculate total volume and expected pour time
  const totalVolume = jobTrips.reduce((sum, t) => sum + (t.volume_m3 || 0), 0);
  const firstDeparture = jobTrips.length > 0 
    ? new Date(Math.min(...jobTrips.map(t => new Date(t.scheduled_at || Date.now()).getTime()))).toLocaleTimeString("en-NZ", { hour: "2-digit", minute: "2-digit" })
    : "-";
  const lastETA = jobTrips.length > 0
    ? jobTrips.filter(t => t.estimated_arrival)
        .reduce((latest, t) => {
          const eta = new Date(t.estimated_arrival!);
          return eta > latest ? eta : latest;
        }, new Date(0))
        .toLocaleTimeString("en-NZ", { hour: "2-digit", minute: "2-digit" })
    : "-";

  return (
    <div className="p-4 rounded-xl bg-surface-container space-y-4">
      <div>
        <h3 className="font-semibold text-on-surface mb-3">🚛 Trucks Assigned ({jobTrips.length})</h3>
        
        {/* Job Summary */}
        <div className="grid grid-cols-3 gap-2 mb-3 text-xs p-2 rounded-lg bg-primary/5 border border-primary/20">
          <div>
            <p className="text-on-surface-variant">Total Volume</p>
            <p className="font-semibold text-on-surface">{totalVolume.toFixed(1)} m³</p>
          </div>
          <div>
            <p className="text-on-surface-variant">First Depart</p>
            <p className="font-semibold text-on-surface">{firstDeparture}</p>
          </div>
          <div>
            <p className="text-on-surface-variant">Last ETA</p>
            <p className="font-semibold text-on-surface">{lastETA}</p>
          </div>
        </div>
        
        <p className="text-xs text-on-surface-variant">
          {activeTrucks.length} active · {completedTrucks.length} completed · {cancelledTrucks.length} cancelled
        </p>
      </div>

      {/* Active Trucks */}
      {activeTrucks.length > 0 && (
        <div className="space-y-2">
          <p className="text-[11px] font-semibold text-on-surface-variant uppercase tracking-wide">Active</p>
          <div className="grid gap-2">
            {activeTrucks.map((trip, idx) => {
              const cfg = STATUS_COLORS[trip.status];
              const isHighlighted = trip.id === highlightedTripId;
              return (
                <div
                  key={trip.id}
                  className={`p-3 rounded-lg border-2 transition-all ${
                    isHighlighted
                      ? "bg-primary/10 border-primary shadow-md"
                      : `${cfg.bg} border-transparent`
                  }`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <span className="text-lg">{cfg.icon}</span>
                      <span className={`text-sm font-semibold ${cfg.text}`}>
                        Truck {idx + 1}
                      </span>
                      {trip.vehicle_id && (
                        <span className="text-xs text-on-surface-variant bg-surface px-2 py-1 rounded">
                          {trip.vehicle_id}
                        </span>
                      )}
                    </div>
                    <TripStatusBadge status={trip.status} />
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-xs mb-2">
                    <div>
                      <p className="text-on-surface-variant">Volume</p>
                      <p className="font-semibold text-on-surface">{trip.volume_m3 ?? "-"} m³</p>
                    </div>
                    <div>
                      <p className="text-on-surface-variant">Depart (NZST)</p>
                      <p className="font-semibold text-on-surface">
                        {trip.scheduled_at
                          ? new Date(trip.scheduled_at).toLocaleTimeString("en-NZ", {
                              hour: "2-digit",
                              minute: "2-digit",
                            })
                          : "-"}
                      </p>
                    </div>
                    <div>
                      <p className="text-on-surface-variant">Distance</p>
                      <p className="font-semibold text-on-surface">
                        {formatDistance(trip.remaining_distance_meters)}
                      </p>
                    </div>
                    <div>
                      <p className="text-on-surface-variant">ETA (NZST)</p>
                      <p className="font-semibold text-on-surface">
                        {trip.estimated_arrival
                          ? new Date(trip.estimated_arrival).toLocaleTimeString("en-NZ", {
                              hour: "2-digit",
                              minute: "2-digit",
                            })
                          : "-"}
                      </p>
                    </div>
                  </div>

                  {/* Load Timer if available */}
                  {trip.load_minutes_remaining !== undefined && trip.load_max_life_minutes !== undefined && (
                    <div className="pt-2 border-t border-outline-variant/50">
                      <div className="flex justify-between text-[10px] mb-1">
                        <span className="text-on-surface-variant">Load Timer</span>
                        <span className="font-semibold text-on-surface">
                          {Math.max(0, Math.round(trip.load_minutes_remaining))} / {trip.load_max_life_minutes} min
                        </span>
                      </div>
                      <div className="h-1.5 rounded-full bg-outline-variant/30 overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all ${
                            trip.load_minutes_remaining > trip.load_max_life_minutes * 0.5
                              ? "bg-emerald-500"
                              : trip.load_minutes_remaining > trip.load_max_life_minutes * 0.2
                                ? "bg-amber-500"
                                : "bg-red-500"
                          }`}
                          style={{
                            width: `${Math.max(0, Math.min(100, (trip.load_minutes_remaining / trip.load_max_life_minutes) * 100))}%`,
                          }}
                        />
                      </div>
                    </div>
                  )}

                  {/* Traffic Delay if present */}
                  {trip.current_traffic_delay && trip.current_traffic_delay > 0 && (
                    <div className="mt-2 p-2 rounded bg-orange-100/50 border border-orange-200/50">
                      <p className="text-[10px] text-orange-700 font-medium">
                        ⚠️ Traffic delay: {Math.round(trip.current_traffic_delay / 60)} min
                      </p>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Completed Trucks */}
      {completedTrucks.length > 0 && (
        <div className="space-y-2 pt-2 border-t border-outline-variant">
          <p className="text-[11px] font-semibold text-on-surface-variant uppercase tracking-wide">Completed</p>
          <div className="grid gap-2">
            {completedTrucks.map((trip, idx) => (
              <div key={trip.id} className="p-3 rounded-lg bg-green-50 border border-green-100">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-lg">✅</span>
                    <span className="text-sm font-semibold text-green-700">Truck {activeTrucks.length + idx + 1}</span>
                    {trip.vehicle_id && (
                      <span className="text-xs text-on-surface-variant bg-surface px-2 py-1 rounded">
                        {trip.vehicle_id}
                      </span>
                    )}
                  </div>
                  {trip.outcome && (
                    <span className="text-xs px-2 py-1 rounded bg-white text-green-700 font-medium">
                      {trip.outcome}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Cancelled Trucks */}
      {cancelledTrucks.length > 0 && (
        <div className="space-y-2 pt-2 border-t border-outline-variant">
          <p className="text-[11px] font-semibold text-on-surface-variant uppercase tracking-wide">Cancelled</p>
          <div className="grid gap-2">
            {cancelledTrucks.map((trip, idx) => (
              <div key={trip.id} className="p-3 rounded-lg bg-red-50 border border-red-100">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-lg">❌</span>
                    <span className="text-sm font-semibold text-red-700">Truck {activeTrucks.length + completedTrucks.length + idx + 1}</span>
                    {trip.vehicle_id && (
                      <span className="text-xs text-on-surface-variant bg-surface px-2 py-1 rounded">
                        {trip.vehicle_id}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
