"use client";

import type { TripResponse } from "@/types/route";

interface TruckSchedulePanelProps {
  trips: TripResponse[];
  jobSiteAddress?: string;
  plantId?: string;
  scheduledAt?: string;
}

export default function TruckSchedulePanel({
  trips,
  jobSiteAddress,
  plantId,
  scheduledAt,
}: TruckSchedulePanelProps) {
  // Filter trips for this job
  const jobTrips = trips.filter((t) => {
    // Match job site address (partial match)
    if (jobSiteAddress && t.end_address) {
      const searchTerm = jobSiteAddress.split(',')[0].trim().toLowerCase();
      const dbTerm = t.end_address.split(',')[0].trim().toLowerCase();
      if (!dbTerm.includes(searchTerm) && !searchTerm.includes(dbTerm)) return false;
    }
    // Match plant ID
    if (plantId && t.plant_id !== plantId) return false;
    // Match scheduled date
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

  // Sort by scheduled time
  const sortedTrips = [...jobTrips].sort(
    (a, b) =>
      (a.scheduled_at ? new Date(a.scheduled_at).getTime() : 0) -
      (b.scheduled_at ? new Date(b.scheduled_at).getTime() : 0)
  );

  return (
    <div className="p-6 rounded-xl bg-surface-container space-y-6">
      <div>
        <h3 className="font-semibold text-on-surface mb-1">📋 Truck Schedule</h3>
        <p className="text-xs text-on-surface-variant">
          {sortedTrips.length} trucks scheduled for this delivery
        </p>
      </div>

      {/* Trucks Grid - Side by Side */}
      <div className="grid gap-4" style={{ gridTemplateColumns: `repeat(${Math.min(sortedTrips.length, 3)}, 1fr)` }}>
        {sortedTrips.map((trip, idx) => (
          <div
            key={trip.id}
            className="p-4 rounded-lg bg-surface border-2 border-primary/20 space-y-3 hover:border-primary/50 transition-colors"
          >
            {/* Truck Number Badge */}
            <div className="flex items-center justify-between">
              <div className="w-10 h-10 rounded-full bg-primary text-on-primary flex items-center justify-center font-bold text-lg">
                {idx + 1}
              </div>
              <span className="text-xs px-2 py-1 rounded-full bg-primary/10 text-primary font-semibold">
                Batch {Math.floor(idx / 2) + 1}
              </span>
            </div>

            {/* Vehicle ID */}
            <div className="space-y-1">
              <p className="text-xs text-on-surface-variant">Vehicle ID</p>
              <p className="font-bold text-lg text-on-surface">
                {trip.vehicle_id || `Truck ${idx + 1}`}
              </p>
            </div>

            {/* Status */}
            <div className="p-2 rounded-lg bg-amber-100 border border-amber-200">
              <p className="text-xs font-semibold text-amber-700">⏳ Pending Assignment</p>
            </div>

            {/* Departure Time */}
            <div className="space-y-1 border-t border-outline-variant/30 pt-3">
              <p className="text-xs text-on-surface-variant">Departure (NZST)</p>
              <p className="font-bold text-on-surface text-lg">
                {trip.scheduled_at
                  ? new Date(trip.scheduled_at).toLocaleTimeString("en-NZ", {
                      hour: "2-digit",
                      minute: "2-digit",
                    })
                  : "-"}
              </p>
            </div>

            {/* Volume */}
            <div className="space-y-1">
              <p className="text-xs text-on-surface-variant">Concrete Volume</p>
              <p className="font-bold text-on-surface">{trip.volume_m3} m³</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
