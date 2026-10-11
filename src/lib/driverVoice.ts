import type { TripStatus } from "@/types/route";

export interface DriverVoiceSnapshot {
  tripId: number;
  status: TripStatus;
  remainingKm: number | null;
  trafficMessage: string | null;
  gpsError: string | null;
}

const STATUS: Record<TripStatus, string> = {
  pending: "Trip is waiting to start.",
  in_progress: "Trip in progress.",
  paused: "Trip paused.",
  completed: "Trip completed.",
  cancelled: "Trip cancelled.",
};
const MILESTONES_KM = [50, 25, 10, 5, 2, 1, 0.5, 0.2];

function distanceMessage(km: number | null): string {
  if (km == null || !Number.isFinite(km) || km < 0) return "";
  return km < 1 ? `Approximately ${Math.round(km * 1000)} metres remaining.`
    : `Approximately ${km.toFixed(1)} kilometres remaining.`;
}

/** Chooses new announcements only; browser speech is owned by the UI component. */
export class DriverVoiceUpdates {
  private previous: DriverVoiceSnapshot | null = null;
  private distanceBaseline: number | null = null;
  private lastDistanceAt = 0;
  private lastTraffic: string | null = null;

  reset(snapshot: DriverVoiceSnapshot, now: number): string {
    this.previous = snapshot;
    this.distanceBaseline = snapshot.remainingKm;
    this.lastDistanceAt = now;
    this.lastTraffic = snapshot.trafficMessage;
    return `Voice updates on. ${STATUS[snapshot.status]} ${distanceMessage(snapshot.remainingKm)}`.trim();
  }

  update(snapshot: DriverVoiceSnapshot, now: number): string | null {
    const previous = this.previous;
    if (!previous || previous.tripId !== snapshot.tripId) return this.reset(snapshot, now);
    this.previous = snapshot;
    const messages: string[] = [];
    if (snapshot.status !== previous.status) messages.push(STATUS[snapshot.status]);
    if (snapshot.gpsError && snapshot.gpsError !== previous.gpsError) messages.push(snapshot.gpsError);
    if (snapshot.trafficMessage && snapshot.trafficMessage !== this.lastTraffic) {
      this.lastTraffic = snapshot.trafficMessage;
      const text = snapshot.trafficMessage.replace(/[\uD800-\uDBFF][\uDC00-\uDFFF]|[\u2600-\u27BF\uFE0F]/g, "").trim();
      if (text) messages.push(text);
    }
    const km = snapshot.remainingKm;
    if (snapshot.status === "in_progress" && km != null && Number.isFinite(km) && km >= 0) {
      if (this.distanceBaseline == null || km > this.distanceBaseline + 1) {
        this.distanceBaseline = km;
      } else if (now - this.lastDistanceAt >= 120_000 &&
        MILESTONES_KM.some((milestone) => this.distanceBaseline! > milestone && km <= milestone)) {
        messages.push(distanceMessage(km));
        this.distanceBaseline = km;
        this.lastDistanceAt = now;
      }
    }
    return messages.length ? messages.join(" ") : null;
  }
}
