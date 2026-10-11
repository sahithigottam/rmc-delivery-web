import type { TripStatus } from "@/types/route";

export type TripActionType = "begin" | "resume" | "start-gps" | "end";

export interface TripActionRequest {
  type: TripActionType;
  id: number;
}

const STATUS_LABEL: Record<TripStatus, string> = {
  pending: "Pending",
  in_progress: "In progress",
  paused: "Paused",
  completed: "Completed",
  cancelled: "Cancelled",
};

export function tripStatusLabel(status: TripStatus): string {
  return STATUS_LABEL[status] ?? status;
}

/** The one action a driver most likely needs next, for the always-visible sheet header. */
export function nextTripAction(
  status: TripStatus,
  gpsRunning: boolean,
  nearSite = false,
): { type: TripActionType; label: string } | null {
  if (status === "pending") return { type: "begin", label: "Start Trip" };
  if (status === "paused") return { type: "resume", label: "Resume" };
  if (status === "in_progress") {
    if (!gpsRunning) return { type: "start-gps", label: "Start GPS" };
    // End Trip stays out of the way until the driver is near the site
    return nearSite ? { type: "end", label: "End Trip" } : null;
  }
  return null;
}

/** Two lines: the numbers a driver needs, then the trip stage with any problem note. */
export function liveTripSummary({
  tripId, status, remainingKm, arrivalTime, arrivalStale = false, note,
}: {
  tripId: number;
  status: TripStatus;
  remainingKm: number | null;
  arrivalTime: string | null;
  /** The arrival time has already passed, so it is not shown as a forecast */
  arrivalStale?: boolean;
  note: string | null;
}): { primary: string; secondary: string } {
  const active = status === "in_progress" || status === "paused";
  const distance = remainingKm != null ? `${remainingKm.toFixed(1)} km` : "Distance updating";
  const arrival = arrivalStale ? " \u00b7 ETA outdated" : arrivalTime ? ` \u00b7 Arrive ${arrivalTime}` : "";
  const primary = active ? `${distance}${arrival}` : `Trip #${tripId}`;
  return { primary, secondary: [STATUS_LABEL[status], note].filter(Boolean).join(" \u00b7 ") };
}
