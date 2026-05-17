"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { updateTripPosition, checkReroute } from "@/lib/api";
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
  trafficMsg: string | null;
  start: () => void;
  stop: () => void;
}

const REROUTE_CHECK_INTERVAL_MS = 120_000;  // 2 min between traffic checks
const POSITION_REPORT_INTERVAL_MS = 5_000;  // post to backend every 5 s

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
  const [trafficMsg, setTrafficMsg]   = useState<string | null>(null);

  const watchIdRef            = useRef<number | null>(null);
  const lastReportRef         = useRef<number>(0);
  const lastTrafficCheckRef   = useRef<number>(0);
  const reroutingRef          = useRef(false);
  const mountedRef            = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  /* ── Traffic check from current GPS position ── */
  const checkTraffic = useCallback(
    async (pos: [number, number]) => {
      if (!route || reroutingRef.current) return;
      reroutingRef.current = true;
      if (mountedRef.current) setTrafficMsg("🔄 Checking traffic…");

      try {
        const result = await checkReroute(
          {
            current_lat: pos[0],
            current_lng: pos[1],
            end: { address: route.resolved_end_address },
            vehicle_type: route.vehicle_type,
            priority: route.priority,
            avoid: route.avoid ?? undefined,
          },
          route.duration_seconds,
        );

        if (!mountedRef.current) return;

        if (result.reroute_recommended) {
          const msg = result.reason ?? "Reroute recommended";
          setTrafficMsg(`⚠️ ${msg}`);
          showToast(msg, "warning", 5000);
        } else {
          setTrafficMsg("✅ Traffic OK");
        }
      } catch {
        if (mountedRef.current) setTrafficMsg("⚠️ Traffic check failed");
      } finally {
        reroutingRef.current = false;
        setTimeout(() => {
          if (mountedRef.current) setTrafficMsg(null);
        }, 4000);
      }
    },
    [route],
  );

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

      // Remaining distance to destination
      if (route) {
        const dist = haversineKm(latLng, [route.end_lat, route.end_lng]);
        setRemainingKm(dist);
      }

      const now = Date.now();

      // Report position to backend (throttled)
      if (tripId && now - lastReportRef.current >= POSITION_REPORT_INTERVAL_MS) {
        lastReportRef.current = now;
        updateTripPosition(tripId, {
          lat: latitude,
          lng: longitude,
          heading: heading ?? undefined,
          speed_kmh: speedKmh ?? undefined,
        }).catch(() => {
          // silent — don't disrupt GPS tracking on backend errors
        });
      }

      // Periodic traffic check
      if (now - lastTrafficCheckRef.current >= REROUTE_CHECK_INTERVAL_MS) {
        lastTrafficCheckRef.current = now;
        checkTraffic(latLng);
      }
    },
    [route, tripId, checkTraffic],
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
    lastTrafficCheckRef.current = 0;

    watchIdRef.current = navigator.geolocation.watchPosition(
      handlePosition,
      handleError,
      {
        enableHighAccuracy: true,
        timeout: 15_000,
        maximumAge: 2_000,
      },
    );
  }, [handlePosition, handleError]);

  const stop = useCallback(() => {
    if (watchIdRef.current != null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
    if (mountedRef.current) {
      setGpsState("idle");
      setGpsPosition(null);
      setGpsAccuracy(null);
      setGpsSpeed(null);
      setGpsHeading(null);
      setGpsError(null);
      setRemainingKm(0);
      setTrafficMsg(null);
    }
  }, []);

  // Auto-stop when disabled or unmounted
  useEffect(() => {
    if (!enabled) stop();
  }, [enabled, stop]);

  useEffect(() => {
    return () => {
      if (watchIdRef.current != null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
      }
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
    trafficMsg,
    start,
    stop,
  };
}
