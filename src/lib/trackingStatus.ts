import type { GpsState } from "@/hooks/useGpsTracking";
import type { TripStatus } from "@/types/route";

export type TrackingTone = "ok" | "warn" | "bad";

export interface TrackingStatus {
  label: string;
  detail: string;
  tone: TrackingTone;
}

const STALE_MS = 120_000;

/**
 * What the header says about location sharing. "Live tracking" is claimed only when this
 * device has a recent GPS fix and the office has confirmed receiving a recent upload.
 * Returns null when there is nothing to report (no trip in progress).
 */
export function trackingStatus({
  status, gpsMode, gpsState, simActive, lastFixAt, lastSentAt, pendingCount, now,
}: {
  status: TripStatus;
  gpsMode: boolean;
  gpsState: GpsState;
  simActive: boolean;
  lastFixAt: number | null;
  lastSentAt: number | null;
  pendingCount: number;
  now: number;
}): TrackingStatus | null {
  if (status !== "in_progress") return null;
  if (!gpsMode) {
    return simActive
      ? { label: "Simulation", detail: "Simulation only. Nothing is sent to the office.", tone: "warn" }
      : { label: "GPS off", detail: "Your location is not being shared with the office.", tone: "warn" };
  }
  if (gpsState === "error") {
    return { label: "GPS unavailable", detail: "This device cannot get a location.", tone: "bad" };
  }
  if (gpsState === "requesting") {
    return { label: "Locating", detail: "Waiting for the first GPS location.", tone: "warn" };
  }
  if (gpsState !== "active") {
    return { label: "GPS off", detail: "Your location is not being shared with the office.", tone: "warn" };
  }
  const fresh = (at: number | null) => at !== null && now - at <= STALE_MS;
  if (!fresh(lastFixAt)) {
    return { label: "No GPS signal", detail: "No recent GPS location from this device.", tone: "warn" };
  }
  if (pendingCount > 0) {
    return {
      label: "Not sending",
      detail: `${pendingCount} location${pendingCount === 1 ? "" : "s"} waiting to reach the office.`,
      tone: "warn",
    };
  }
  if (lastSentAt === null) {
    return { label: "Connecting", detail: "Waiting for the office to confirm the first location.", tone: "warn" };
  }
  if (!fresh(lastSentAt)) {
    return { label: "Not sending", detail: "The office has not received a location recently.", tone: "warn" };
  }
  return { label: "Live tracking", detail: "Your location is reaching the office.", tone: "ok" };
}
