"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import type { TripRerouteInfo } from "@/types/route";
import { getTrip, checkTripTraffic } from "@/lib/api";
import { showToast } from "@/components/Toast";

const POLL_INTERVAL_MS = 2 * 60 * 1000; // 2 minutes

interface UseTripStreamProps {
  tripId: number | null;
  enabled: boolean;
  onReroute?: (info: TripRerouteInfo) => void;
  onPosition?: (data: { lat: number; lng: number; remaining_km: number }) => void;
  onTrafficOk?: (data: { remaining_km: number; delay_seconds: number; eta: string }) => void;
  onStatusChange?: (status: string) => void;
}

export function useTripStream({
  tripId,
  enabled,
  onReroute,
  onPosition,
  onTrafficOk,
  onStatusChange,
}: UseTripStreamProps) {
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastStatusRef = useRef<string | null>(null);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const poll = useCallback(async () => {
    if (!tripId) return;
    console.log(`[Poll] Checking trip ${tripId}`);

    try {
      // 1. Fetch current trip state for position & status
      const trip = await getTrip(tripId);

      if (trip.current_lat != null && trip.current_lng != null) {
        onPosition?.({
          lat: trip.current_lat,
          lng: trip.current_lng,
          remaining_km: (trip.remaining_distance_meters ?? 0) / 1000,
        });
      }

      if (trip.status !== lastStatusRef.current) {
        lastStatusRef.current = trip.status;
        if (trip.status === "completed") {
          showToast("🎉 Trip completed!", "success");
        } else if (trip.status === "cancelled") {
          showToast("Trip cancelled", "info");
        }
        onStatusChange?.(trip.status);
      }

      // 2. Check traffic for reroute / traffic_ok events
      const trafficResult = await checkTripTraffic(tripId);
      if ("reason" in trafficResult) {
        // It's a TripRerouteInfo reroute
        showToast(`🔄 ${trafficResult.reason}`, "warning", 5000);
        onReroute?.(trafficResult as TripRerouteInfo);
      } else if ("message" in trafficResult) {
        // traffic_ok — backend just returns a message string, fabricate enough for the callback
        onTrafficOk?.({
          remaining_km: (trip.remaining_distance_meters ?? 0) / 1000,
          delay_seconds: 0,
          eta: trip.estimated_arrival ?? "",
        });
      }

      setError(null);
    } catch (err) {
      console.error("[Poll] Error", err);
      setError("Poll failed. Will retry in 4 min.");
    }
  }, [tripId, onReroute, onPosition, onTrafficOk, onStatusChange]);

  const startPolling = useCallback(() => {
    if (!tripId || !enabled) return;
    console.log(`[Poll] Starting 4-min poll for trip ${tripId}`);
    setConnected(true);
    poll(); // immediate first call
    intervalRef.current = setInterval(poll, POLL_INTERVAL_MS);
  }, [tripId, enabled, poll]);

  const stopPolling = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    setConnected(false);
  }, []);

  useEffect(() => {
    if (enabled && tripId) {
      startPolling();
    } else {
      stopPolling();
    }

    return () => stopPolling();
  }, [tripId, enabled, startPolling, stopPolling]);

  return { connected, error, reconnect: startPolling };
}
