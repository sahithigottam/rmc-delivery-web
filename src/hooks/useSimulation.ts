"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { checkReroute, updateTripPosition } from "@/lib/api";
import { decodePolyline, subsampleRoute } from "@/lib/polyline";
import { showToast } from "@/components/Toast";
import type { RouteResponse, SimState } from "@/types/route";

const TICK_MS = 1000; // animation interval - 1 second for real-time
const SUBSAMPLE_N = 300; // number of animation points
const REROUTE_CHECK_INTERVAL_MS = 120000; // check traffic every 2 minutes (real-time)
// Post GPS position to backend every N simulated seconds (keeps API calls low)
const POSITION_REPORT_INTERVAL_SIMULATED_S = 30;

export interface SimulationState {
  simState: SimState;
  progress: number;
  truckPosition: [number, number] | null;
  animationPoints: [number, number][];
  currentPointIndex: number;
  currentStepIndex: number;
  remainingKm: number;
  trafficMsg: string | null;
  speedMultiplier: number;
  currentSpeed: number;
  setSpeedMultiplier: (speed: number) => void;
  toggle: () => void;
  stop: () => void;
}

export function useSimulation(
  route: RouteResponse | null,
  tripId?: number | null,
): SimulationState {
  const [simState, setSimState] = useState<SimState>("idle");
  const [progress, setProgress] = useState(0);
  const [truckPosition, setTruckPosition] = useState<[number, number] | null>(null);
  const [animationPoints, setAnimationPoints] = useState<[number, number][]>([]);
  const [currentPointIndex, setCurrentPointIndex] = useState(0);
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [remainingKm, setRemainingKm] = useState(0);
  const [trafficMsg, setTrafficMsg] = useState<string | null>(null);
  const [speedMultiplier, setSpeedMultiplier] = useState(4); // Default 4x speed (1 hour = 15 minutes)
  const [currentSpeed, setCurrentSpeed] = useState(0); // km/h

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startTimeRef = useRef<number>(0);
  const pausedTimeRef = useRef<number>(0);
  const lastTrafficCheckRef = useRef<number>(0);
  const lastPositionReportRef = useRef<number>(0); // simulated seconds at last position POST
  const indexRef = useRef(0);
  const pointsRef = useRef<[number, number][]>([]);
  const reroutingRef = useRef(false);
  const rerouteCountRef = useRef(0);
  const totalKmRef = useRef(0);
  const totalDurationRef = useRef(0);
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
          const msg = `${result.reason} (reroute #${rerouteCountRef.current})`;
          setTrafficMsg(`⚠️ ${msg}`);
          showToast(msg, "warning", 5000);

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
        showToast("Traffic check failed", "error", 3000);
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
    startTimeRef.current = Date.now() - pausedTimeRef.current;
    lastTrafficCheckRef.current = Date.now();

    timerRef.current = setInterval(() => {
      if (pausedRef.current) return;

      const pts = pointsRef.current;
      const totalDuration = totalDurationRef.current; // in seconds
      const elapsedReal = (Date.now() - startTimeRef.current) / 1000; // elapsed in real seconds
      const elapsedSimulated = elapsedReal * speedMultiplier; // apply speed multiplier
      
      // Calculate progress based on simulated time
      const prog = Math.min(elapsedSimulated / totalDuration, 1);
      const idx = Math.floor(prog * (pts.length - 1));
      
      indexRef.current = idx;
      const p = pts[idx];

      setTruckPosition(p);
      setCurrentPointIndex(idx);
      setProgress(prog);
      setRemainingKm(totalKmRef.current * (1 - prog));

      // Calculate current step based on progress
      if (route?.route_steps && route.route_steps.length > 0) {
        const totalDuration = route.duration_seconds;
        let accumulatedDuration = 0;
        let stepIdx = 0;
        
        for (let i = 0; i < route.route_steps.length; i++) {
          accumulatedDuration += route.route_steps[i].duration_seconds;
          const stepProgress = accumulatedDuration / totalDuration;
          if (prog < stepProgress) {
            stepIdx = i;
            break;
          }
          stepIdx = i;
        }
        setCurrentStepIndex(stepIdx);

        // Calculate current speed from step's distance/duration
        const step = route.route_steps[stepIdx];
        if (step && step.duration_seconds > 0) {
          const speedKmh = (step.distance_meters / 1000) / (step.duration_seconds / 3600);
          setCurrentSpeed(Math.round(speedKmh));
        }
      } else {
        // Fallback: average speed from total route
        if (route && route.duration_seconds > 0) {
          const avgSpeed = (route.distance_meters / 1000) / (route.duration_seconds / 3600);
          setCurrentSpeed(Math.round(avgSpeed));
        }
      }

      // Check if behind schedule for rerouting
      const expectedProgress = elapsedReal / totalDuration; // where we should be at normal speed
      const actualProgress = prog; // where we actually are
      const behindSchedule = actualProgress < expectedProgress * 0.85; // 15% behind

      // Periodic traffic check every 2 minutes (adjusted for speed)
      const checkInterval = REROUTE_CHECK_INTERVAL_MS / speedMultiplier;
      const timeSinceLastCheck = Date.now() - lastTrafficCheckRef.current;
      if ((timeSinceLastCheck >= checkInterval || behindSchedule) && prog < 0.95 && prog > 0.05) {
        lastTrafficCheckRef.current = Date.now();
        if (behindSchedule) {
          setTrafficMsg("⚠️ Behind schedule - checking for faster route...");
        }
        checkTraffic(p);
      }

      // ── Report position to live backend trip ───────────────────────
      // Throttled to every POSITION_REPORT_INTERVAL_SIMULATED_S of simulated time.
      // This drives the backend load timer, traffic monitor, and SSE alerts.
      if (tripId) {
        const lastReport = lastPositionReportRef.current;
        if (elapsedSimulated - lastReport >= POSITION_REPORT_INTERVAL_SIMULATED_S) {
          lastPositionReportRef.current = elapsedSimulated;
          updateTripPosition(tripId, { lat: p[0], lng: p[1] }).catch(() => {
            // silent — don't interrupt the simulation on backend errors
          });
        }
      }

      // Finished
      if (prog >= 1 || idx >= pts.length - 1) {
        clearInterval(timerRef.current!);
        timerRef.current = null;
        setSimState("finished");
        setProgress(1);
        setRemainingKm(0);
        setTrafficMsg(null);
      }
    }, TICK_MS);
  }, [checkTraffic, route?.route_steps, route?.duration_seconds, speedMultiplier]);

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
      totalDurationRef.current = route.duration_seconds;
      pausedRef.current = false;
      pausedTimeRef.current = 0;
      startTimeRef.current = Date.now();
      lastTrafficCheckRef.current = Date.now();
      lastPositionReportRef.current = 0;

      setAnimationPoints(smooth);
      setTruckPosition(smooth[0]);
      setCurrentPointIndex(0);
      setCurrentStepIndex(0);
      setProgress(0);
      setRemainingKm(route.distance_meters / 1000);
      setTrafficMsg(null);
      setSimState("running");
      // startLoop will fire via useEffect below
    } else if (simState === "running") {
      pausedRef.current = true;
      pausedTimeRef.current = Date.now() - startTimeRef.current;
      setSimState("paused");
    } else if (simState === "paused") {
      pausedRef.current = false;
      startTimeRef.current = Date.now() - pausedTimeRef.current;
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
    setCurrentStepIndex(0);
    setRemainingKm(0);
    setCurrentSpeed(0);
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
    currentStepIndex,
    remainingKm,
    trafficMsg,
    speedMultiplier,
    currentSpeed,
    setSpeedMultiplier,
    toggle,
    stop,
  };
}
