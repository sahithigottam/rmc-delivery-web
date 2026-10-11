"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { updateTripPosition } from "@/lib/api";
import { showToast } from "@/components/Toast";
import type { RouteResponse } from "@/types/route";

export type GpsState = "idle" | "requesting" | "active" | "error";

export interface GpsTrackingState {
  gpsState: GpsState;
  gpsPosition: [number, number] | null;  // [lat, lng]
  gpsAccuracy: number | null;            // meters
  gpsSpeed: number | null;               // km/h (null if unavailable)
  gpsHeading: number | null;             // degrees (null if unavailable)
  gpsError: string | null;
  remainingKm: number;
  /** Time (ms) of the last fix received from the device GPS */
  lastFixAt: number | null;
  /** Time (ms) the server last accepted a position from this device */
  lastSentAt: number | null;
  /** Positions recorded while offline, waiting to be sent */
  pendingCount: number;
  /** Whether the screen is being kept awake */
  wakeLockActive: boolean;
  start: () => void;
  stop: () => void;
}

const POSITION_REPORT_INTERVAL_MS = 5_000;  // post to backend every 5 s
const MAX_QUEUED_POSITIONS = 500;           // ~40 min of 5 s reports
const RETRY_INTERVAL_MS = 10_000;
const QUEUE_KEY_PREFIX = "rmc-gps-queue-";
const QUEUE_MAX_AGE_MS = 24 * 60 * 60 * 1000;

interface QueuedPosition {
  lat: number;
  lng: number;
  heading?: number;
  speed_kmh?: number;
  /** When the GPS fix was taken (UTC ISO), so late uploads keep their real time */
  captured_at?: string;
}

type WakeLockSentinelLike = { release: () => Promise<void>; addEventListener: (t: "release", cb: () => void) => void };
type NavigatorWithWakeLock = Navigator & {
  wakeLock?: { request: (type: "screen") => Promise<WakeLockSentinelLike> };
};

function haversineKm(a: [number, number], b: [number, number]): number {
  const R = 6371;
  const dLat = ((b[0] - a[0]) * Math.PI) / 180;
  const dLng = ((b[1] - a[1]) * Math.PI) / 180;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((a[0] * Math.PI) / 180) *
      Math.cos((b[0] * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

export function useGpsTracking(
  route: RouteResponse | null,
  tripId: number | null,
  enabled: boolean,
): GpsTrackingState {
  const [gpsState, setGpsState]       = useState<GpsState>("idle");
  const [gpsPosition, setGpsPosition] = useState<[number, number] | null>(null);
  const [gpsAccuracy, setGpsAccuracy] = useState<number | null>(null);
  const [gpsSpeed, setGpsSpeed]       = useState<number | null>(null);
  const [gpsHeading, setGpsHeading]   = useState<number | null>(null);
  const [gpsError, setGpsError]       = useState<string | null>(null);
  const [remainingKm, setRemainingKm] = useState(0);
  const [lastFixAt, setLastFixAt]     = useState<number | null>(null);
  const [lastSentAt, setLastSentAt]   = useState<number | null>(null);
  const [pendingCount, setPendingCount] = useState(0);
  const [wakeLockActive, setWakeLockActive] = useState(false);

  const watchIdRef            = useRef<number | null>(null);
  const lastReportRef         = useRef<number>(0);
  const mountedRef            = useRef(true);
  const queueRef              = useRef<QueuedPosition[]>([]);
  const flushingRef           = useRef(false);
  const wakeLockRef           = useRef<WakeLockSentinelLike | null>(null);
  const trackingRef           = useRef(false);

  const queueKey = tripId ? `${QUEUE_KEY_PREFIX}${tripId}` : null;

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  // Drop unsent queues left by other trips that are over a day old
  useEffect(() => {
    try {
      const cutoff = Date.now() - QUEUE_MAX_AGE_MS;
      for (let i = localStorage.length - 1; i >= 0; i--) {
        const key = localStorage.key(i);
        if (!key?.startsWith(QUEUE_KEY_PREFIX) || key === queueKey) continue;
        const items = JSON.parse(localStorage.getItem(key) ?? "[]") as QueuedPosition[];
        const newest = Math.max(0, ...items.map((p) => (p.captured_at ? Date.parse(p.captured_at) || 0 : 0)));
        if (newest < cutoff) localStorage.removeItem(key);
      }
    } catch {
      // storage unavailable — nothing to clean
    }
  }, [queueKey]);

  /* ── Offline queue: persisted so a reload doesn't lose unsent positions ── */
  const saveQueue = useCallback(() => {
    setPendingCount(queueRef.current.length);
    if (!queueKey) return;
    try {
      if (queueRef.current.length) localStorage.setItem(queueKey, JSON.stringify(queueRef.current));
      else localStorage.removeItem(queueKey);
    } catch {
      // storage full or unavailable — keep the in-memory queue
    }
  }, [queueKey]);

  useEffect(() => {
    queueRef.current = [];
    if (queueKey) {
      try {
        const saved = localStorage.getItem(queueKey);
        if (saved) queueRef.current = JSON.parse(saved) as QueuedPosition[];
      } catch {
        queueRef.current = [];
      }
    }
    setPendingCount(queueRef.current.length);
  }, [queueKey]);

  const flushQueue = useCallback(async () => {
    if (!tripId || flushingRef.current || queueRef.current.length === 0) return;
    if (typeof navigator !== "undefined" && navigator.onLine === false) return;
    flushingRef.current = true;
    try {
      // Send oldest first so the server ends on the latest position
      while (queueRef.current.length > 0) {
        const next = queueRef.current[0];
        try {
          await updateTripPosition(tripId, next);
        } catch (err) {
          // fetch() throws TypeError on network failure; 5xx means the server is down — retry later
          if (err instanceof TypeError) break;
          const msg = err instanceof Error ? err.message : "";
          if (/API error 5\d\d/.test(msg)) break;
          if (/Cannot update position|not found/i.test(msg)) {
            // Trip is no longer active — nothing in the queue can be accepted
            queueRef.current = [];
            saveQueue();
            break;
          }
          if (/in the future/i.test(msg) && next.captured_at) {
            // Phone clock is ahead of the server: resend without captured_at so the server uses receipt time
            const { captured_at: _skewed, ...withoutTime } = next;
            queueRef.current[0] = withoutTime;
            saveQueue();
            continue;
          }
          // Server rejected this one report (e.g. stale or duplicate) — drop it and continue
          queueRef.current.shift();
          saveQueue();
          continue;
        }
        queueRef.current.shift();
        saveQueue();
        if (mountedRef.current) setLastSentAt(Date.now());
      }
    } finally {
      flushingRef.current = false;
    }
  }, [tripId, saveQueue]);

  // Retry when the network comes back, and periodically in case "online" never fires
  useEffect(() => {
    if (!tripId) return;
    const onOnline = () => { void flushQueue(); };
    window.addEventListener("online", onOnline);
    const timer = setInterval(() => { void flushQueue(); }, RETRY_INTERVAL_MS);
    void flushQueue();
    return () => {
      window.removeEventListener("online", onOnline);
      clearInterval(timer);
    };
  }, [tripId, flushQueue]);

  /* ── Screen wake lock: keeps GPS alive while the screen would otherwise sleep ── */
  const requestWakeLock = useCallback(async () => {
    const nav = navigator as NavigatorWithWakeLock;
    if (!nav.wakeLock || wakeLockRef.current) return;
    try {
      const sentinel = await nav.wakeLock.request("screen");
      wakeLockRef.current = sentinel;
      if (mountedRef.current) setWakeLockActive(true);
      sentinel.addEventListener("release", () => {
        wakeLockRef.current = null;
        if (mountedRef.current) setWakeLockActive(false);
      });
    } catch {
      // Denied (e.g. low battery) — tracking still works while the screen stays on
    }
  }, []);

  const releaseWakeLock = useCallback(() => {
    void wakeLockRef.current?.release().catch(() => {});
    wakeLockRef.current = null;
    if (mountedRef.current) setWakeLockActive(false);
  }, []);

  // The browser drops the wake lock when the tab is hidden; re-acquire on return
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible" && trackingRef.current) {
        void requestWakeLock();
        void flushQueue();
      }
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [requestWakeLock, flushQueue]);

  /* ── Handle each Geolocation position update ── */
  const handlePosition = useCallback(
    (pos: GeolocationPosition) => {
      if (!mountedRef.current) return;

      const { latitude, longitude, accuracy, speed, heading } = pos.coords;
      const latLng: [number, number] = [latitude, longitude];
      const speedKmh = speed != null ? speed * 3.6 : null;

      setGpsState("active");
      setGpsPosition(latLng);
      setGpsAccuracy(accuracy);
      setGpsSpeed(speedKmh != null ? Math.round(speedKmh) : null);
      setGpsHeading(heading);
      setLastFixAt(Date.now());

      // Remaining distance to destination
      if (route) {
        const dist = haversineKm(latLng, [route.end_lat, route.end_lng]);
        setRemainingKm(dist);
      }

      const now = Date.now();

      // Queue the position (throttled) and send; unsent positions survive network drops
      if (tripId && now - lastReportRef.current >= POSITION_REPORT_INTERVAL_MS) {
        lastReportRef.current = now;
        queueRef.current.push({
          lat: latitude,
          lng: longitude,
          heading: heading ?? undefined,
          speed_kmh: speedKmh ?? undefined,
          // Original fix time; a "future" rejection is handled once in flushQueue
          captured_at: new Date(pos.timestamp || now).toISOString(),
        });
        if (queueRef.current.length > MAX_QUEUED_POSITIONS) {
          queueRef.current.splice(0, queueRef.current.length - MAX_QUEUED_POSITIONS);
        }
        saveQueue();
        void flushQueue();
      }
    },
    [route, tripId, saveQueue, flushQueue],
  );

  const handleError = useCallback((err: GeolocationPositionError) => {
    if (!mountedRef.current) return;
    const messages: Record<number, string> = {
      1: "Location permission denied. Please allow location access.",
      2: "Location unavailable. Check device GPS.",
      3: "Location request timed out.",
    };
    const msg = messages[err.code] ?? "GPS error";
    setGpsState("error");
    setGpsError(msg);
    showToast(msg, "error");
  }, []);

  // The watcher outlives renders; always call the latest handlers (current trip id and route)
  const handlePositionRef = useRef(handlePosition);
  handlePositionRef.current = handlePosition;
  const handleErrorRef = useRef(handleError);
  handleErrorRef.current = handleError;

  /* ── start / stop ── */
  const start = useCallback(() => {
    if (!("geolocation" in navigator)) {
      setGpsState("error");
      setGpsError("Geolocation is not supported by this browser.");
      showToast("GPS not supported", "error");
      return;
    }

    setGpsState("requesting");
    setGpsError(null);
    lastReportRef.current = 0;
    trackingRef.current = true;
    void requestWakeLock();

    watchIdRef.current = navigator.geolocation.watchPosition(
      (pos) => handlePositionRef.current(pos),
      (err) => handleErrorRef.current(err),
      {
        enableHighAccuracy: true,
        timeout: 15_000,
        maximumAge: 2_000,
      },
    );
  }, [requestWakeLock]);

  const stop = useCallback(() => {
    if (watchIdRef.current != null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
    trackingRef.current = false;
    releaseWakeLock();
    if (mountedRef.current) {
      setGpsState("idle");
      setGpsPosition(null);
      setGpsAccuracy(null);
      setGpsSpeed(null);
      setGpsHeading(null);
      setGpsError(null);
      setRemainingKm(0);
      setLastFixAt(null);
    }
  }, [releaseWakeLock]);

  // Auto-stop when disabled or unmounted
  useEffect(() => {
    if (!enabled) stop();
  }, [enabled, stop]);

  useEffect(() => {
    return () => {
      if (watchIdRef.current != null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
      }
      void wakeLockRef.current?.release().catch(() => {});
    };
  }, []);

  return {
    gpsState,
    gpsPosition,
    gpsAccuracy,
    gpsSpeed,
    gpsHeading,
    gpsError,
    remainingKm,
    lastFixAt,
    lastSentAt,
    pendingCount,
    wakeLockActive,
    start,
    stop,
  };
}
