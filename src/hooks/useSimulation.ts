"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { checkReroute } from "@/lib/api";
import { decodePolyline, subsampleRoute } from "@/lib/polyline";
import type { RouteResponse, SimState } from "@/types/route";

const TICK_MS = 120; // animation interval
const SUBSAMPLE_N = 300; // number of animation points
const REROUTE_CHECK_FRACTION = 5; // check traffic every 1/5th of the route

export interface SimulationState {
  simState: SimState;
  progress: number;
  truckPosition: [number, number] | null;
  animationPoints: [number, number][];
  currentPointIndex: number;
  remainingKm: number;
  trafficMsg: string | null;
  toggle: () => void;
  stop: () => void;
}

export function useSimulation(route: RouteResponse | null): SimulationState {
  const [simState, setSimState] = useState<SimState>("idle");
  const [progress, setProgress] = useState(0);
  const [truckPosition, setTruckPosition] = useState<[number, number] | null>(null);
  const [animationPoints, setAnimationPoints] = useState<[number, number][]>([]);
  const [currentPointIndex, setCurrentPointIndex] = useState(0);
  const [remainingKm, setRemainingKm] = useState(0);
  const [trafficMsg, setTrafficMsg] = useState<string | null>(null);

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const indexRef = useRef(0);
  const pointsRef = useRef<[number, number][]>([]);
  const reroutingRef = useRef(false);
  const rerouteCountRef = useRef(0);
  const totalKmRef = useRef(0);
  const pausedRef = useRef(false);
  const stateRef = useRef<SimState>("idle");

  // Keep stateRef in sync
  useEffect(() => {
    stateRef.current = simState;
  }, [simState]);

  /* ── Check traffic from truck's current position ── */
  const checkTraffic = useCallback(
    async (curPt: [number, number]) => {
      if (!route || reroutingRef.current) return;
      reroutingRef.current = true;
      setTrafficMsg("🔄 Checking traffic…");

      try {
        const result = await checkReroute(
          {
            current_lat: curPt[0],
            current_lng: curPt[1],
            end: { address: route.resolved_end_address },
            vehicle_type: route.vehicle_type,
            priority: route.priority,
            avoid: route.avoid ?? undefined,
          },
          route.duration_seconds
        );

        if (result.reroute_recommended && result.polyline) {
          rerouteCountRef.current++;
          setTrafficMsg(
            `⚠️ ${result.reason} (reroute #${rerouteCountRef.current})`
          );

          // Actually replace the remaining path
          const newPts = decodePolyline(result.polyline);
          const newSmooth = subsampleRoute(newPts, SUBSAMPLE_N);

          // Replace from current index onwards
          const kept = pointsRef.current.slice(0, indexRef.current + 1);
          const merged = [...kept, ...newSmooth];
          pointsRef.current = merged;
          setAnimationPoints(merged);

          // Update total km estimate
          totalKmRef.current =
            (totalKmRef.current * (indexRef.current / (pointsRef.current.length - 1 || 1))) +
            result.distance_meters / 1000;
        } else {
          setTrafficMsg("✅ Traffic OK");
        }

        // Clear message after 3s
        setTimeout(() => {
          if (stateRef.current === "running") {
            setTrafficMsg(null);
          }
        }, 3000);
      } catch {
        setTrafficMsg("⚠️ Traffic check failed");
        setTimeout(() => setTrafficMsg(null), 3000);
      } finally {
        reroutingRef.current = false;
      }
    },
    [route]
  );

  /* ── Start the animation loop ── */
  const startLoop = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);

    const pts = pointsRef.current;
    const speed = Math.max(1, Math.ceil(pts.length / 300));
    const checkEvery = Math.max(15, Math.floor(pts.length / REROUTE_CHECK_FRACTION));

    timerRef.current = setInterval(() => {
      if (pausedRef.current) return;

      const pts = pointsRef.current;
      indexRef.current = Math.min(indexRef.current + speed, pts.length - 1);
      const idx = indexRef.current;
      const p = pts[idx];

      setTruckPosition(p);
      setCurrentPointIndex(idx);

      const prog = idx / (pts.length - 1 || 1);
      setProgress(prog);
      setRemainingKm(totalKmRef.current * (1 - prog));

      // Periodic traffic check
      if (idx > 0 && idx % checkEvery === 0 && idx < pts.length - speed) {
        checkTraffic(p);
      }

      // Finished
      if (idx >= pts.length - 1) {
        clearInterval(timerRef.current!);
        timerRef.current = null;
        setSimState("finished");
        setProgress(1);
        setRemainingKm(0);
        setTrafficMsg(null);
      }
    }, TICK_MS);
  }, [checkTraffic]);

  /* ── Toggle: idle→running, running→paused, paused→running ── */
  const toggle = useCallback(() => {
    if (!route?.polyline) return;

    if (simState === "idle" || simState === "finished") {
      // Start fresh
      const rawPts = decodePolyline(route.polyline);
      const smooth = subsampleRoute(rawPts, SUBSAMPLE_N);
      pointsRef.current = smooth;
      indexRef.current = 0;
      rerouteCountRef.current = 0;
      totalKmRef.current = route.distance_meters / 1000;
      pausedRef.current = false;

      setAnimationPoints(smooth);
      setTruckPosition(smooth[0]);
      setCurrentPointIndex(0);
      setProgress(0);
      setRemainingKm(route.distance_meters / 1000);
      setTrafficMsg(null);
      setSimState("running");
      // startLoop will fire via useEffect below
    } else if (simState === "running") {
      pausedRef.current = true;
      setSimState("paused");
    } else if (simState === "paused") {
      pausedRef.current = false;
      setSimState("running");
    }
  }, [route, simState]);

  /* ── Stop: full reset ── */
  const stop = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    pausedRef.current = false;
    indexRef.current = 0;
    rerouteCountRef.current = 0;
    setSimState("idle");
    setProgress(0);
    setTruckPosition(null);
    setAnimationPoints([]);
    setCurrentPointIndex(0);
    setRemainingKm(0);
    setTrafficMsg(null);
  }, []);

  /* ── Manage interval lifecycle ── */
  useEffect(() => {
    if (simState === "running") {
      startLoop();
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [simState, startLoop]);

  // Reset if route changes
  useEffect(() => {
    stop();
  }, [route?.id, stop]);

  return {
    simState,
    progress,
    truckPosition,
    animationPoints,
    currentPointIndex,
    remainingKm,
    trafficMsg,
    toggle,
    stop,
  };
}
