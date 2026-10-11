"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import type { TripResponse } from "@/types/route";
import { getTrip } from "@/lib/api";
import { showToast } from "@/components/Toast";

const POSITION_POLL_INTERVAL_MS = 5_000;

export interface TripRerouteNotice {
  rerouteNumber: number;
  reason: string;
}

interface UseTripStreamProps {
  tripId: number | null;
  enabled: boolean;
  onReroute?: (notice: TripRerouteNotice, trip: TripResponse) => void;
  onTripUpdate?: (trip: TripResponse) => void;
  onTrafficOk?: (trip: TripResponse) => void;
  onStatusChange?: (status: string) => void;
}

/**
 * Polls the trip every 5s. Traffic checks and reroutes are run by the backend
 * monitor; this hook only reports their results, so open browsers never add
 * extra traffic checks.
 */
export function useTripStream({
  tripId,
  enabled,
  onReroute,
  onTripUpdate,
  onTrafficOk,
  onStatusChange,
}: UseTripStreamProps) {
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pollInFlightRef = useRef(false);
  const lastStatusRef = useRef<string | null>(null);
  const lastRerouteCountRef = useRef<number | null>(null);
  const lastTrafficCheckRef = useRef<string | null>(null);
  const callbacksRef = useRef({ onReroute, onTripUpdate, onTrafficOk, onStatusChange });
  callbacksRef.current = { onReroute, onTripUpdate, onTrafficOk, onStatusChange };
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const generationRef = useRef(0);

  const poll = useCallback(async () => {
    if (!tripId || pollInFlightRef.current) return;
    pollInFlightRef.current = true;
    const generation = generationRef.current;

    try {
      const trip = await getTrip(tripId);
      if (generation !== generationRef.current) return;

      callbacksRef.current.onTripUpdate?.(trip);

      if (trip.status !== lastStatusRef.current) {
        const firstObservation = lastStatusRef.current === null;
        lastStatusRef.current = trip.status;
        if (!firstObservation) {
          if (trip.status === "completed") {
            showToast("?? Trip completed!", "success");
          } else if (trip.status === "cancelled") {
            showToast("Trip cancelled", "info");
          }
        }
        callbacksRef.current.onStatusChange?.(trip.status);
      }

      // The first poll only records the baseline, so old reroutes are not re-announced
      const prevReroutes = lastRerouteCountRef.current;
      const prevCheck = lastTrafficCheckRef.current;
      lastRerouteCountRef.current = trip.reroute_count;
      lastTrafficCheckRef.current = trip.last_traffic_check_at ?? null;

      if (prevReroutes !== null && trip.reroute_count > prevReroutes) {
        const event = trip.recent_events?.find((e) => e.event_type === "reroute_suggested");
        const reason =
          typeof event?.data?.reason === "string" ? event.data.reason : "Route updated for traffic";
        showToast(`?? ${reason}`, "warning", 5000);
        callbacksRef.current.onReroute?.({ rerouteNumber: trip.reroute_count, reason }, trip);
      } else if (
        prevCheck !== null &&
        trip.last_traffic_check_at &&
        trip.last_traffic_check_at !== prevCheck
      ) {
        callbacksRef.current.onTrafficOk?.(trip);
      }

      setError(null);
    } catch (err) {
      if (generation !== generationRef.current) return;
      console.error("[Poll] Error", err);
      setError("Trip position refresh failed. Retrying shortly.");
    } finally {
      pollInFlightRef.current = false;
    }
  }, [tripId]);

  const startPolling = useCallback(() => {
    if (!tripId || !enabled) return;
    setConnected(true);
    if (intervalRef.current) clearInterval(intervalRef.current);
    void poll();
    intervalRef.current = setInterval(poll, POSITION_POLL_INTERVAL_MS);
  }, [tripId, enabled, poll]);

  const stopPolling = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    setConnected(false);
  }, []);

  // Reset baselines when switching trips
  useEffect(() => {
    lastStatusRef.current = null;
    lastRerouteCountRef.current = null;
    lastTrafficCheckRef.current = null;
  }, [tripId]);

  useEffect(() => {
    if (enabled && tripId) {
      startPolling();
    } else {
      stopPolling();
    }

    return () => {
      generationRef.current += 1;
      stopPolling();
    };
  }, [tripId, enabled, startPolling, stopPolling]);

  const discardPendingUpdates = useCallback(() => {
    generationRef.current += 1;
  }, []);

  return { connected, error, reconnect: startPolling, discardPendingUpdates };
}
