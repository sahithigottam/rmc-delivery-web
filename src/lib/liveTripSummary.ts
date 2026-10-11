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

export type LoadTone = "ok" | "warn" | "critical" | "expired";

/** The route lines and the load window shown on the collapsed trip card. */
export function peekDetails(trip: {
  status: TripStatus;
  start_address: string;
  end_address: string;
  load_minutes_remaining?: number | null;
  load_max_life_minutes?: number | null;
  load_status?: string | null;
}): { from: string; to: string; load: { text: string; tone: LoadTone } | null } {
  const live = trip.status === "in_progress" || trip.status === "paused";
  const minutes = trip.load_minutes_remaining;
  let load: { text: string; tone: LoadTone } | null = null;
  if (live && minutes != null) {
    // The colour follows the number, so a missing or stale backend status cannot make 1 minute look fine.
    // Thresholds match the load timer bar (share of life left) or, without a maximum, the trip info panel.
    const max = trip.load_max_life_minutes;
    const share = max ? (minutes / max) * 100 : null;
    const expired = trip.load_status === "expired" || minutes <= 0;
    const critical = trip.load_status === "critical" || (share != null ? share <= 20 : minutes < 20);
    const warn = trip.load_status === "warning" || (share != null ? share <= 50 : minutes < 40);
    const tone: LoadTone = expired ? "expired" : critical ? "critical" : warn ? "warn" : "ok";
    const word = { expired: " \u00b7 Expired", critical: " \u00b7 Critical", warn: " \u00b7 Warning", ok: "" }[tone];
    load = { text: `Load window ${Math.max(0, Math.round(minutes))} min${word}`, tone };
  }
  return { from: displayAddress(trip.start_address), to: displayAddress(trip.end_address), load };
}

// Google Plus Codes such as "XGH6+6QX" are not useful to a driver reading an address
const PLUS_CODE = /^[23456789CFGHJMPQRVWX]{4,8}\+[23456789CFGHJMPQRVWX]{2,3}\s*,?\s*/;

export function displayAddress(address: string): string {
  const cleaned = address.replace(PLUS_CODE, "").trim();
  return cleaned || address;
}
