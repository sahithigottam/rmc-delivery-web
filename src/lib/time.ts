/* Time helpers.
 *
 * The backend stores and returns UTC, but without a zone suffix
 * (e.g. "2026-10-11T09:17:23"). Browsers read such strings as *local* time,
 * so every API time is normalised to carry "Z" before use.
 *
 * Times are shown in the delivery site's time zone (India → IST, NZ → NZST/NZDT)
 * so the office and the driver see the same clock time for a trip.
 */

/** Any IANA zone; the two known site zones are listed for autocomplete. Region records supply others. */
export type SiteTimeZone = "Asia/Kolkata" | "Pacific/Auckland" | (string & {});

const NAIVE_ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?$/;

/** Append "Z" to ISO date-times that have no zone (backend sends UTC without it). */
export function asUtcIso(value: string): string {
  return NAIVE_ISO.test(value) ? `${value}Z` : value;
}

/** JSON.parse reviver: mark every zone-less ISO date-time from the API as UTC. */
export function utcReviver(_key: string, value: unknown): unknown {
  return typeof value === "string" ? asUtcIso(value) : value;
}

export function parseApiTime(iso: string | null | undefined): Date | null {
  if (!iso) return null;
  const d = new Date(asUtcIso(iso));
  return Number.isNaN(d.getTime()) ? null : d;
}

/** True once an estimated arrival has passed (after a short grace), so it is no longer a forecast. */
export function isEtaStale(
  iso: string | null | undefined,
  now: number = Date.now(),
  graceMs = 60_000,
): boolean {
  const at = parseApiTime(iso)?.getTime();
  return at !== undefined && now > at + graceMs;
}

export function timeZoneForCountry(country: "in" | "nz" | "IN" | "NZ"): SiteTimeZone {
  return country.toLowerCase() === "in" ? "Asia/Kolkata" : "Pacific/Auckland";
}

/** Infer the site's zone from coordinates (only India and NZ are supported). */
export function timeZoneForLocation(lat?: number | null, lng?: number | null): SiteTimeZone {
  if (lat != null && lng != null && lat > 5 && lat < 38 && lng > 67 && lng < 98) return "Asia/Kolkata";
  return "Pacific/Auckland";
}

export function timeZoneForTrip(trip: { end_lat?: number | null; end_lng?: number | null }): SiteTimeZone {
  return timeZoneForLocation(trip.end_lat, trip.end_lng);
}

/** Short zone label, e.g. "IST", "NZDT", "NZST". */
export function zoneLabel(tz: SiteTimeZone, at: Date = new Date()): string {
  if (tz === "Asia/Kolkata") return "IST";
  try {
    const part = new Intl.DateTimeFormat(localeFor(tz), { timeZone: tz, timeZoneName: "short" })
      .formatToParts(at)
      .find((p) => p.type === "timeZoneName");
    return part?.value ?? tz;
  } catch {
    return tz;
  }
}

const LOCALE: Record<string, string> = {
  "Asia/Kolkata": "en-IN",
  "Pacific/Auckland": "en-NZ",
};

function localeFor(tz: SiteTimeZone): string {
  return LOCALE[tz] ?? "en-GB";
}

type Style = "time" | "datetime" | "full";

/** Format an API time in the given zone, with the zone label, e.g. "2:47 pm IST". */
export function formatInZone(
  iso: string | null | undefined,
  tz: SiteTimeZone,
  style: Style = "datetime",
  withLabel = true,
): string {
  const d = parseApiTime(iso);
  if (!d) return "";
  const opts: Intl.DateTimeFormatOptions =
    style === "time"
      ? { hour: "2-digit", minute: "2-digit" }
      : style === "full"
        ? { dateStyle: "medium", timeStyle: "short" }
        : { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" };
  const text = d.toLocaleString(localeFor(tz), { ...opts, timeZone: tz });
  return withLabel ? `${text} ${zoneLabel(tz, d)}` : text;
}

/** Calendar date "YYYY-MM-DD" of an API time in the given zone. */
export function dateInZone(iso: string | null | undefined, tz: SiteTimeZone): string {
  const d = parseApiTime(iso);
  if (!d) return "";
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(d);
  const get = (t: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === t)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

/** Offset of `tz` from UTC at instant `at`, in minutes (handles daylight saving). */
function zoneOffsetMinutes(tz: SiteTimeZone, at: Date): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz, hourCycle: "h23",
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
  }).formatToParts(at);
  const get = (t: Intl.DateTimeFormatPartTypes) => Number(parts.find((p) => p.type === t)?.value);
  const asUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second"));
  return Math.round((asUtc - at.getTime()) / 60_000);
}

/** Convert a <input type="datetime-local"> value typed in `tz` to a UTC ISO string. */
export function zonedInputToUtcIso(local: string, tz: SiteTimeZone): string {
  const [datePart, timePart = "00:00"] = local.split("T");
  const [y, mo, d] = datePart.split("-").map(Number);
  const [h, mi] = timePart.split(":").map(Number);
  const guess = Date.UTC(y, mo - 1, d, h, mi);
  // Two passes so the offset is correct even right at a daylight-saving change
  let utc = guess - zoneOffsetMinutes(tz, new Date(guess)) * 60_000;
  utc = guess - zoneOffsetMinutes(tz, new Date(utc)) * 60_000;
  return new Date(utc).toISOString();
}

/** Value for <input type="datetime-local"> showing "now + minutes" in `tz`. */
export function nowInZoneInput(tz: SiteTimeZone, plusMinutes = 0): string {
  const at = new Date(Date.now() + plusMinutes * 60_000);
  const shifted = new Date(at.getTime() + zoneOffsetMinutes(tz, at) * 60_000);
  return shifted.toISOString().slice(0, 16);
}
