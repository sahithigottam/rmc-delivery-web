"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getActiveTrips, getTrip, getRoute } from "@/lib/api";
import { formatInZone, isEtaStale, timeZoneForTrip } from "@/lib/time";
import { useSimulation } from "@/hooks/useSimulation";
import { useGpsTracking } from "@/hooks/useGpsTracking";
import { useTripStream } from "@/hooks/useTripStream";
import { decodePolyline, remainingRoute } from "@/lib/polyline";
import { liveTripSummary, nextTripAction, peekDetails, displayAddress, tripStatusLabel, type TripActionRequest, type TripActionType } from "@/lib/liveTripSummary";
import { isNearSite } from "@/lib/nearSite";
import DriverVoiceToggle from "@/components/DriverVoiceToggle";
import HeaderTrackingStatus from "@/components/HeaderTrackingStatus";
import SimulationControls from "@/components/SimulationControls";
import TripManagement from "@/components/TripManagement";
import TripEventLog from "@/components/TripEventLog";
import DriverLocationFreshness from "@/components/DriverLocationFreshness";
import MapOverlay from "@/components/MapOverlay";
import DispatchPanel from "@/components/DispatchPanel";
import TripsListPanel from "@/components/TripsListPanel";
import PlantsPanel from "@/components/PlantsPanel";
import AuthControls from "@/components/AuthControls";
import BusinessesPanel from "@/components/BusinessesPanel";
import { availableTabs, type AppTab } from "@/lib/access";
import ToastContainer, { showToast } from "@/components/Toast";
import TruckIcon from "@/components/TruckIcon";
import type { CurrentUserCapabilities, RouteResponse, TripResponse, TripStatus, DispatchResponse, SimState } from "@/types/route";

/* Leaflet must not SSR */
const MapView = dynamic(() => import("@/components/MapView"), { ssr: false });

type ActiveTab = AppTab;
type SheetState = "collapsed" | "half" | "full";

/** Trip id this device was tracking with real GPS, so tracking can resume after a reload */
const GPS_TRIP_KEY = "rmc-gps-tracking-trip";

export default function Home({ capabilities }: { capabilities: CurrentUserCapabilities }) {
  const tabs = availableTabs(capabilities);
  const [route, setRoute] = useState<RouteResponse | null>(null);
  const [trip, setTrip] = useState<TripResponse | null>(null);
  const activeTripIdRef = useRef<number | null>(null);
  activeTripIdRef.current = trip?.id ?? null;
  const [viewedTrip, setViewedTrip] = useState<TripResponse | null>(null);
  const [viewedRoute, setViewedRoute] = useState<RouteResponse | null>(null);
  const [activeTab, setActiveTab] = useState<ActiveTab>(tabs[0] ?? "plants");
  const [gpsMode, setGpsMode] = useState(false);
  const [sheet, setSheet] = useState<SheetState>("half");
  const [actionRequest, setActionRequest] = useState<TripActionRequest | null>(null);
  const actionRequestCount = useRef(0);
  const tripSelectionRef = useRef(false);
  const userNavigationRef = useRef(false);
  const dragStartY = useRef<number | null>(null);
  const swiped = useRef(false);
  // lg+ only: labelled sidebar vs icon rail. Saved choice wins, otherwise expanded from xl up.
  const [navExpanded, setNavExpanded] = useState(true);
  useEffect(() => {
    const saved = localStorage.getItem("rmc_nav_expanded");
    setNavExpanded(saved != null ? saved === "true" : window.matchMedia("(min-width: 80rem)").matches);
  }, []);
  const toggleNav = () => {
    const next = !navExpanded;
    setNavExpanded(next);
    localStorage.setItem("rmc_nav_expanded", String(next));
  };

  // Simulation mode — on-screen demo only, never reported to the backend
  const currentRoute = useMemo(() => {
    if (!route || trip?.route_id !== route.id ||
        (trip.status !== "in_progress" && trip.status !== "paused") || !trip.current_polyline) return route;
    return {
      ...route,
      polyline: trip.current_polyline,
      route_steps: trip.current_polyline === route.polyline ? route.route_steps : undefined,
      distance_meters: trip.remaining_distance_meters ?? route.distance_meters,
      duration_seconds: trip.remaining_duration_seconds ?? route.duration_seconds,
    };
  }, [route, trip?.route_id, trip?.status, trip?.current_polyline, trip?.remaining_distance_meters, trip?.remaining_duration_seconds]);
  const sim = useSimulation(currentRoute);

  // Real GPS mode — uses device location
  const gps = useGpsTracking(
    currentRoute,
    gpsMode && trip?.status === "in_progress" ? trip.id : null,
    gpsMode && trip?.status === "in_progress",
  );

  useEffect(() => {
    if (!capabilities.can_operate_trips) return;
    let cancelled = false;
    const restoreLiveTrip = async () => {
      try {
        const activeTrips = await getActiveTrips();
        if (cancelled || tripSelectionRef.current) return;

        const priority: Record<TripStatus, number> = {
          in_progress: 0,
          paused: 1,
          pending: 2,
          completed: 3,
          cancelled: 4,
        };
        const [activeTrip] = activeTrips.sort(
          (a, b) =>
            priority[a.status] - priority[b.status] ||
            b.updated_at.localeCompare(a.updated_at),
        );
        if (!activeTrip) return;

        setTrip(activeTrip);
        if (!userNavigationRef.current) setActiveTab("trip");
        try {
          const activeRoute = await getRoute(activeTrip.route_id);
          if (!cancelled && !tripSelectionRef.current) setRoute(activeRoute);
        } catch (error) {
          console.error("Could not restore the active trip route:", error);
          showToast("Active trip restored, but its route could not be loaded", "warning");
        }
      } catch (error) {
        console.error("Could not restore active trips:", error);
      }
    };

    void restoreLiveTrip();
    return () => {
      cancelled = true;
    };
  }, [capabilities.can_operate_trips]);

  const handleTripUpdate = useCallback((updatedTrip: TripResponse) => {
    setTrip((current) => {
      if (!current || current.id !== updatedTrip.id ||
          Date.parse(updatedTrip.updated_at) < Date.parse(current.updated_at)) return current;
      return updatedTrip;
    });
    setViewedTrip((current) => {
      if (!current || current.id !== updatedTrip.id ||
          Date.parse(updatedTrip.updated_at) < Date.parse(current.updated_at)) return current;
      return updatedTrip;
    });
    if (updatedTrip.id === activeTripIdRef.current && updatedTrip.status !== "in_progress") {
      setGpsMode(false);
      const finished = updatedTrip.status === "completed" || updatedTrip.status === "cancelled";
      if (finished && localStorage.getItem(GPS_TRIP_KEY) === String(updatedTrip.id)) {
        localStorage.removeItem(GPS_TRIP_KEY);
      }
    }
  }, []);

  // Resume device GPS after a reload if this device was tracking the live trip.
  // Two steps: switch to GPS mode first so the tracker has the trip id, then start.
  const gpsResumeRef = useRef<"none" | "pending" | "done">("none");
  useEffect(() => {
    if (trip?.status !== "in_progress") {
      // Re-arm so tracking resumes when a paused trip continues
      if (gpsResumeRef.current === "done") gpsResumeRef.current = "none";
      return;
    }
    if (gpsResumeRef.current !== "none") return;
    if (localStorage.getItem(GPS_TRIP_KEY) === String(trip.id)) {
      gpsResumeRef.current = "pending";
      setGpsMode(true);
    } else {
      gpsResumeRef.current = "done";
    }
  }, [trip?.id, trip?.status]);
  useEffect(() => {
    if (gpsResumeRef.current !== "pending" || !gpsMode || trip?.status !== "in_progress") return;
    gpsResumeRef.current = "done";
    gps.start();
    showToast("Resumed live GPS tracking for this trip", "info");
  }, [gpsMode, trip?.status, gps]);

  const startGps = () => {
    if (trip) localStorage.setItem(GPS_TRIP_KEY, String(trip.id));
    setSheet("half");
    gps.start();
  };
  const startDriverGps = () => {
    sim.stop();
    setGpsMode(true);
    startGps();
  };
  const stopGps = () => {
    localStorage.removeItem(GPS_TRIP_KEY);
    gps.stop();
  };

  const tripPosition: [number, number] | null =
    trip?.current_lat != null && trip.current_lng != null
      ? [trip.current_lat, trip.current_lng]
      : null;
  const activeTruckPosition = gpsMode
    ? gps.gpsPosition ?? tripPosition
    : sim.truckPosition ?? tripPosition;
  const roadRemainingKm = useMemo(() => {
    if (currentRoute?.polyline && gps.gpsPosition) {
      const remaining = remainingRoute(decodePolyline(currentRoute.polyline), gps.gpsPosition);
      if (remaining) return remaining.distanceKm;
    }
    return trip?.remaining_distance_meters != null ? trip.remaining_distance_meters / 1000 : null;
  }, [currentRoute?.polyline, gps.gpsPosition, trip?.remaining_distance_meters]);

  // Traffic result from the trip monitor, shown while in Real GPS mode
  const [tripTrafficMsg, setTripTrafficMsg] = useState<string | null>(null);
  const tripTrafficMsgTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const showTripTrafficMsg = useCallback((msg: string, clearAfterMs?: number) => {
    if (tripTrafficMsgTimerRef.current) clearTimeout(tripTrafficMsgTimerRef.current);
    setTripTrafficMsg(msg);
    tripTrafficMsgTimerRef.current = clearAfterMs
      ? setTimeout(() => setTripTrafficMsg(null), clearAfterMs)
      : null;
  }, []);
  useEffect(() => () => {
    if (tripTrafficMsgTimerRef.current) clearTimeout(tripTrafficMsgTimerRef.current);
  }, []);

  /* Trip monitor: refreshes trip details and reports the backend's traffic checks */
  const monitoredTrip = viewedTrip ?? trip;
  const { error: tripRefreshError, discardPendingUpdates } = useTripStream({
    tripId: monitoredTrip?.id ?? null,
    enabled: monitoredTrip?.status === "pending" || monitoredTrip?.status === "in_progress" || monitoredTrip?.status === "paused",
    onTripUpdate: handleTripUpdate,
    onTrafficOk: () => showTripTrafficMsg("✅ Traffic OK", 4000),
    onReroute: (notice) => showTripTrafficMsg(`⚠️ ${notice.reason}`),
  });

  /* -- Dispatch flow -- */
  const handleDispatched = useCallback(async (resp: DispatchResponse) => {
    tripSelectionRef.current = true;
    try {
      const [fullTrip, fullRoute] = await Promise.all([
        getTrip(resp.trip_id),
        getRoute(resp.route_id),
      ]);
      setTrip(fullTrip);
      setViewedTrip(null);
      setRoute(fullRoute);
      setActiveTab("trip");
      setSheet("half");
      showToast(`Trip #${resp.trip_id} dispatched to ${resp.plant_name}`, "success");
    } catch {
      showToast("Dispatch succeeded but couldn't load trip details", "info");
      setActiveTab("trip");
      setSheet("half");
    }
  }, []);



  const liveTrip = trip?.status === "in_progress" || trip?.status === "paused";
  const showMap = activeTab === "dispatch" || activeTab === "trip";

  const selectTab = (id: ActiveTab) => {
    userNavigationRef.current = true;
    setActiveTab(id);
    setSheet("half");
  };

  // Sheet header text: the driver-critical status must stay visible when the sheet is collapsed
  const trafficMsg = gpsMode ? tripTrafficMsg : sim.trafficMsg;
  const shownTrip = viewedTrip ?? trip;
  // A trip opened from the Trips list shows its own route and no live animation
  const mapRoute = viewedTrip ? viewedRoute : route;
  const shownRoute = viewedTrip ? viewedRoute : currentRoute;
  let summary = "Dispatch a delivery";
  if (activeTab === "trip") {
    if (gpsMode) {
      summary =
        gps.gpsState === "active"
          ? `${roadRemainingKm != null ? `${roadRemainingKm.toFixed(1)} km left` : "Distance updating"}${gps.gpsSpeed != null ? ` \u00b7 ${gps.gpsSpeed} km/h` : ""}`
          : gps.gpsState === "error"
          ? gps.gpsError ?? "GPS error"
          : "GPS not started";
    } else if (sim.simState === "running") {
      summary = `${sim.remainingKm.toFixed(1)} km left \u00b7 ${sim.currentSpeed} km/h`;
    } else if (sim.simState === "paused") {
      summary = "Paused";
    } else if (sim.simState === "finished") {
      summary = "Delivered";
    } else {
      summary = shownTrip ? `Trip #${shownTrip.id}` : "No active trip";
    }
  }

  // The live trip's stage, numbers and next action stay visible in the sheet header and collapsed bar
  let summaryDetail: string | null = null;
  let headerAction: { type: TripActionType; label: string } | null = null;
  if (activeTab === "trip" && !viewedTrip && trip) {
    const simActive = !gpsMode && sim.simState !== "idle";
    const gpsRunning = gpsMode && (gps.gpsState === "active" || gps.gpsState === "requesting");
    let note: string | null = null;
    if (trip.status === "in_progress") {
      if (gpsMode && gps.gpsState === "error") note = gps.gpsError ?? "GPS error";
      else if (!gpsRunning && !simActive) note = "GPS not started";
      else if (simActive) note = sim.simState === "finished" ? "Simulation finished" : "Simulation";
    }
    const live = liveTripSummary({
      tripId: trip.id,
      status: trip.status,
      remainingKm: simActive && sim.simState !== "finished" ? sim.remainingKm : roadRemainingKm,
      arrivalTime: !simActive && trip.estimated_arrival
        ? formatInZone(trip.estimated_arrival, timeZoneForTrip(trip), "time")
        : null,
      arrivalStale: !simActive && isEtaStale(trip.estimated_arrival),
      note: note ?? trafficMsg,
    });
    summary = live.primary;
    summaryDetail = live.secondary;
    headerAction = nextTripAction(trip.status, gpsRunning, isNearSite(activeTruckPosition, trip));
  } else if (activeTab === "trip" && viewedTrip) {
    // A trip opened from the list shows its own stage, never the live trip's GPS state
    summary = `Trip #${viewedTrip.id}`;
    summaryDetail = tripStatusLabel(viewedTrip.status);
  }
  const peek = activeTab === "trip" && !viewedTrip && trip ? peekDetails(trip) : null;
  const requestTripAction = (type: TripActionType) => {
    if (type === "start-gps") {
      startDriverGps();
      return;
    }
    actionRequestCount.current += 1;
    setActionRequest({ type, id: actionRequestCount.current });
  };
  const headerActionButton = headerAction && ((action) => (
    <button
      type="button"
      onClick={() => requestTripAction(action.type)}
      className="flex min-h-12 flex-shrink-0 items-center whitespace-nowrap px-1"
    >
      <span className={`rounded-lg px-3 py-1.5 text-sm font-medium ${action.type === "end" ? "bg-md-green text-white" : "bg-primary text-on-primary"}`}>
        {action.label}
      </span>
    </button>
  ))(headerAction);

  const trackingProps = {
    simState: sim.simState,
    progress: sim.progress,
    remainingKm: sim.remainingKm,
    trafficMsg: sim.trafficMsg,
    speedMultiplier: sim.speedMultiplier,
    currentSpeed: sim.currentSpeed,
    onSpeedChange: sim.setSpeedMultiplier,
    onToggle: sim.toggle,
    onStop: sim.stop,
    gpsMode,
    onGpsModeChange: (on: boolean) => {
      setGpsMode(on);
      if (on) sim.stop();
      else stopGps();
    },
    gpsState: gps.gpsState,
    gpsAccuracy: gps.gpsAccuracy,
    gpsSpeed: gps.gpsSpeed,
    gpsError: gps.gpsError,
    gpsRemainingKm: roadRemainingKm,
    gpsLastFixAt: gps.lastFixAt,
    gpsLastSentAt: gps.lastSentAt,
    gpsPendingCount: gps.pendingCount,
    gpsWakeLockActive: gps.wakeLockActive,
    gpsTrafficMsg: tripTrafficMsg,
    onGpsStart: startGps,
    onGpsStop: stopGps,
  };

  return (
    <div className="app-viewport flex flex-col pl-[env(safe-area-inset-left)] pr-[env(safe-area-inset-right)]">
      <ToastContainer />

      {/* Top bar */}
      <header className="app-header flex items-center h-14 px-3 lg:px-5 bg-primary text-on-primary shadow-md z-30 flex-shrink-0">
        <span className="text-lg font-medium tracking-wide flex-1">RMC Delivery</span>
        {trip && (
          <HeaderTrackingStatus
            status={trip.status}
            gpsMode={gpsMode}
            gpsState={gps.gpsState}
            simActive={!gpsMode && sim.simState !== "idle"}
            lastFixAt={gps.lastFixAt}
            lastSentAt={gps.lastSentAt}
            pendingCount={gps.pendingCount}
          />
        )}
        <AuthControls />
      </header>

      {/* Body */}
      <div className="flex flex-1 flex-col lg:flex-row min-h-0 overflow-hidden">

        {/* Left nav */}
        <nav aria-label="Primary" className={`order-last lg:order-first flex flex-row flex-shrink-0 z-20 bg-surface border-t border-outline-variant pb-[env(safe-area-inset-bottom)] lg:flex-col lg:border-t-0 lg:border-r lg:py-2 lg:pb-2 ${navExpanded ? "lg:w-52" : "lg:w-16"}`}>
          {tabs.includes("businesses") && (
            <NavItem id="businesses" active={activeTab} label="Businesses" onClick={selectTab} expanded={navExpanded}
              icon={<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 21h18M5 21V3h14v18M9 7h6M9 11h6M10 21v-6h4v6"/></svg>} />
          )}
          {capabilities.can_operate_trips && <>
          <NavItem id="dispatch" active={activeTab} label="Dispatch" onClick={selectTab} expanded={navExpanded}
            icon={<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="1" y="3" width="15" height="13" rx="2"/><path d="M16 8h4l3 5v3h-7V8z"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/></svg>}
          />
          <NavItem id="trip" active={activeTab} label="Live Trip" onClick={selectTab} expanded={navExpanded}
            badge={trip != null} badgePulse={liveTrip}
            icon={<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z"/><circle cx="12" cy="9" r="2.5"/></svg>}
          />
          <NavItem id="trips" active={activeTab} label="Trips" onClick={selectTab} expanded={navExpanded}
            icon={<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2"/><rect x="9" y="3" width="6" height="4" rx="1"/><path d="M9 12h6M9 16h4"/></svg>}
          />
          </>}
          {tabs.includes("plants") && <NavItem id="plants" active={activeTab} label="Plants" onClick={selectTab} expanded={navExpanded}
            icon={<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 21h18"/><path d="M5 21V7l7-4 7 4v14"/><path d="M9 21v-4h6v4"/></svg>}
          />}
          <button
            type="button"
            onClick={toggleNav}
            aria-expanded={navExpanded}
            aria-label={navExpanded ? "Collapse navigation" : "Expand navigation"}
            title={navExpanded ? "Collapse navigation" : "Expand navigation"}
            className={`hidden lg:flex mt-auto min-h-12 items-center gap-3 whitespace-nowrap text-sm text-on-surface-variant hover:bg-surface-container hover:text-on-surface transition-colors ${navExpanded ? "px-4" : "justify-center"}`}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={navExpanded ? "" : "rotate-180"}>
              <path d="M15 6l-6 6 6 6" />
            </svg>
            {navExpanded && <span>Collapse</span>}
          </button>
        </nav>

        <div className="relative flex flex-1 min-h-0 min-w-0">
        {!tabs.length && <p role="alert" className="p-6">No application access is available for this account. Contact your administrator.</p>}
        {/* Full-width panels: Trips & Plants (no map) */}
        {tabs.includes(activeTab) && (activeTab === "trips" || activeTab === "plants" || activeTab === "businesses") && (
          <div className="flex-1 overflow-y-auto sidebar-scroll bg-surface">
            {activeTab === "businesses" && <BusinessesPanel canManageCatalogue={capabilities.can_manage_catalogue} />}
            {activeTab === "trips" && (
              <TripsListPanel
                organizationId={capabilities.organization_id}
                onViewTrip={async (t) => {
                  userNavigationRef.current = true;
                  try {
                    const [fullTrip, tripRoute] = await Promise.all([
                      getTrip(t.id),
                      getRoute(t.route_id).catch(() => null),
                    ]);
                    setViewedTrip(fullTrip);
                    setViewedRoute(tripRoute);
                    setActiveTab("trip");
                    setSheet("half");
                  } catch {
                    showToast("Could not load trip details", "error");
                  }
                }}
              />
            )}
            {activeTab === "plants" && <PlantsPanel canManage={capabilities.can_manage_catalogue} />}
          </div>
        )}

        {/* Dispatch / Live Trip — content sidebar + map */}
        {showMap && (
          <>
            {/* Content sidebar */}
            <aside
              onFocusCapture={(e) => {
                if (/^(INPUT|SELECT|TEXTAREA)$/.test((e.target as HTMLElement).tagName)) setSheet("full");
              }}
              className={`absolute inset-x-0 bottom-0 z-30 mx-auto w-full max-w-xl flex-col overflow-hidden rounded-t-3xl border-t border-outline-variant bg-surface shadow-2xl lg:static lg:mx-0 lg:h-auto lg:w-[340px] lg:max-w-none lg:flex-shrink-0 lg:rounded-none lg:border-r lg:border-t-0 lg:shadow-none xl:w-[380px] ${
                sheet === "collapsed" ? "hidden" : sheet === "half" ? "flex h-[55%]" : "flex h-full"
              }`}
            >
              {/* Sheet header: below lg only */}
              <div className="lg:hidden flex h-16 flex-shrink-0 items-center px-2">
                <button
                  type="button"
                  aria-expanded={sheet === "full"}
                  onPointerDown={(e) => { dragStartY.current = e.clientY; swiped.current = false; }}
                  onPointerCancel={() => { dragStartY.current = null; }}
                  onPointerUp={(e) => {
                    if (dragStartY.current == null) return;
                    const dy = e.clientY - dragStartY.current;
                    dragStartY.current = null;
                    if (Math.abs(dy) < 40) return;
                    swiped.current = true;
                    setSheet((s) => dy < 0 ? (s === "collapsed" ? "half" : "full") : (s === "full" ? "half" : "collapsed"));
                  }}
                  onClick={() => {
                    if (swiped.current) { swiped.current = false; return; }
                    setSheet(sheet === "full" ? "half" : "full");
                  }}
                  className="flex h-full min-w-0 flex-1 touch-none flex-col items-center justify-center gap-1 text-left"
                >
                  <span aria-hidden className="h-1 w-10 rounded-full bg-outline-variant" />
                  <span className="block w-full min-w-0 px-2">
                    <span className="block truncate text-sm font-medium text-on-surface">{summary}</span>
                    {(summaryDetail ?? trafficMsg) && (
                      <span className="block truncate text-xs text-on-surface-variant">{summaryDetail ?? trafficMsg}</span>
                    )}
                  </span>
                </button>
                {headerActionButton}
                <button
                  type="button"
                  aria-label={sheet === "full" ? "Shrink panel" : "Expand panel"}
                  onClick={() => setSheet(sheet === "full" ? "half" : "full")}
                  className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-xl text-on-surface-variant hover:bg-surface-container"
                >
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={sheet === "full" ? "rotate-180" : ""}>
                    <path d="M6 15l6-6 6 6" />
                  </svg>
                </button>
                <button
                  type="button"
                  aria-label="Minimise details and show the map"
                  title="Minimise"
                  onClick={() => setSheet("collapsed")}
                  className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-xl text-on-surface-variant hover:bg-surface-container"
                >
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M4 14h6v6M20 10h-6V4M14 10l7-7M3 21l7-7" />
                  </svg>
                </button>
              </div>
              {/* Panel header: lg and up */}
              <div className="hidden lg:flex flex-shrink-0 items-center justify-between border-b border-outline-variant px-4 py-1">
                <span className="text-sm font-medium text-on-surface">{activeTab === "dispatch" ? "Dispatch" : "Live Trip"}</span>
                <button
                  type="button"
                  aria-label="Minimise details and show the map"
                  title="Minimise"
                  onClick={() => setSheet("collapsed")}
                  className="flex h-12 w-12 items-center justify-center rounded-lg text-on-surface-variant hover:bg-surface-container"
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M4 14h6v6M20 10h-6V4M14 10l7-7M3 21l7-7" />
                  </svg>
                </button>
              </div>
              <div className="flex-1 overflow-y-auto sidebar-scroll p-3 lg:p-4 space-y-4">

                {activeTab === "dispatch" && (
                  <DispatchPanel onDispatched={handleDispatched} />
                )}

                {activeTab === "trip" && (
                  <div className="space-y-4">
                    {viewedTrip && (
                      <div className="flex items-center justify-between px-3 py-2 rounded-xl bg-surface-container border border-outline-variant text-xs text-on-surface-variant">
                        <span>Viewing Trip #{viewedTrip.id}</span>
                        <button onClick={() => setViewedTrip(null)}
                          className="text-primary font-medium hover:opacity-70 transition-opacity">
                          ← Back to live trip
                        </button>
                      </div>
                    )}
                    {!viewedTrip && trip?.status === "in_progress" && (
                      <SimulationControls {...trackingProps} part="switch" />
                    )}
                    <TripManagement
                      actionRequest={actionRequest}
                      trip={viewedTrip ?? trip}
                      driverControls={!viewedTrip ? {
                        gpsState: gpsMode ? gps.gpsState : "idle",
                        gpsError: gps.gpsError,
                        remainingKm: roadRemainingKm,
                        onStartGps: startDriverGps,
                        onFormOpen: () => setSheet("full"),
                      } : undefined}
                      driverPosition={
                        viewedTrip
                          ? viewedTrip.current_lat != null && viewedTrip.current_lng != null
                            ? [viewedTrip.current_lat, viewedTrip.current_lng]
                            : null
                          : gpsMode
                            ? gps.gpsPosition ?? tripPosition
                            : tripPosition
                      }
                      driverAccuracyM={!viewedTrip && gpsMode && gps.gpsPosition ? gps.gpsAccuracy : null}
                      onTripUpdated={(updated) => {
                        discardPendingUpdates();
                        handleTripUpdate(updated);
                      }}
                    />
                    {tripRefreshError && <p role="alert" className="text-xs text-error">{tripRefreshError}</p>}
                    {!viewedTrip && liveTrip && trip && (
                      <DriverLocationFreshness positionAt={trip.current_position_at} />
                    )}
                    <details className="trip-accordion">
                      <summary className="min-h-12 flex items-center cursor-pointer text-sm font-medium text-primary">More details</summary>
                      <div className="space-y-4">
                      {!viewedTrip && trip?.status === "in_progress" && (
                        <section aria-label="GPS and simulation settings" className="space-y-2">
                          <h3 className="text-sm font-medium">GPS and simulation settings</h3>
                          <SimulationControls {...trackingProps} part="details" />
                        </section>
                      )}
                      <h3 className="text-sm font-medium">Trip history</h3>
                    <TripEventLog
                      tripId={(viewedTrip ?? trip)?.id ?? null}
                      live={!viewedTrip && liveTrip}
                    />
                    {/* Below lg the route info lives in the sheet; lg+ shows it under the map */}
                    <div className="lg:hidden">
                      <h3 className="text-sm font-medium">Route information</h3>
                      {shownRoute ? (
                        <InfoPanel compact route={shownRoute} simState={viewedTrip ? "idle" : sim.simState} simProgress={viewedTrip ? 0 : sim.progress} />
                      ) : shownTrip ? (
                        <TripInfoPanel trip={shownTrip} />
                      ) : null}
                    </div>
                      </div>
                    </details>
                  </div>
                )}
              </div>
            </aside>

            {/* Map + info */}
            <main className="flex-1 min-w-0 flex flex-col overflow-hidden">
              <div className="relative isolate flex-1 min-h-0 lg:flex-[0_0_65%]">
                <MapView
                  route={mapRoute}
                  remainingPolyline={viewedTrip ? viewedTrip.current_polyline : currentRoute?.polyline}
                  followDriver={activeTab === "trip" && !viewedTrip && liveTrip &&
                    (gpsMode ? gps.gpsState === "active" : sim.simState === "running" || tripPosition !== null)}
                  simState={viewedTrip ? "idle" : gpsMode ? (gps.gpsState === "active" ? "running" : "idle") : sim.simState}
                  simProgress={sim.progress}
                  truckPosition={viewedTrip
                    ? viewedTrip.current_lat != null && viewedTrip.current_lng != null
                      ? [viewedTrip.current_lat, viewedTrip.current_lng]
                      : null
                    : activeTruckPosition}
                  animationPoints={viewedTrip || gpsMode ? [] : sim.animationPoints}
                  currentPointIndex={viewedTrip || gpsMode ? 0 : sim.currentPointIndex}
                  bottomInsetRatio={sheet === "half" ? 0.55 : sheet === "full" ? 1 : 0.1}
                />
                {!mapRoute && (
                  <div className="absolute inset-0 flex items-start pt-10 lg:items-center lg:pt-0 justify-center pointer-events-none z-[400]">
                    <div className="text-center space-y-3 p-4 lg:p-8 max-w-sm">
                      <div className="flex justify-center">
                        <TruckIcon size={80} />
                      </div>
                      <h2 className="text-xl font-medium text-on-surface">Plan Your Delivery Route</h2>
                      <p className="text-sm text-on-surface-variant leading-relaxed">
                        Use <strong>Dispatch</strong> to schedule a delivery.
                      </p>
                    </div>
                  </div>
                )}
                {mapRoute && (
                  <div className="pointer-events-none absolute top-3 right-3 z-[1000] rounded-lg bg-surface/95 px-2 py-1 text-xs text-on-surface-variant">
                    <p><span className="mr-1 inline-block h-1 w-5 bg-primary-container" />Full route</p>
                    <p><span className="mr-1 inline-block h-1 w-5 bg-primary" />Remaining</p>
                  </div>
                )}
                {activeTab === "trip" && shownTrip && (
                  <div className="absolute right-3 top-[4.25rem] z-[1100]">
                    <DriverVoiceToggle
                      key={shownTrip.id}
                      tripId={shownTrip.id}
                      status={shownTrip.status}
                      active={activeTab === "trip"}
                      remainingKm={viewedTrip
                        ? viewedTrip.remaining_distance_meters != null ? viewedTrip.remaining_distance_meters / 1000 : null
                        : gpsMode ? roadRemainingKm : sim.simState !== "idle" ? sim.remainingKm : roadRemainingKm}
                      trafficMessage={viewedTrip ? null : trafficMsg}
                      gpsError={!viewedTrip && gpsMode ? gps.gpsError : null}
                    />
                  </div>
                )}
                {!viewedTrip && <MapOverlay
                  simState={gpsMode ? (gps.gpsState === "active" ? "running" : "idle") : sim.simState}
                  progress={sim.progress}
                  remainingKm={gpsMode ? roadRemainingKm : sim.remainingKm}
                  destination={mapRoute?.resolved_end_address ?? ""}
                  trafficMsg={trafficMsg}
                  currentSpeed={gpsMode ? (gps.gpsSpeed ?? 0) : sim.currentSpeed}
                />}
                {sheet === "collapsed" && (
                  <div className="absolute bottom-4 left-4 right-4 z-[1100] rounded-2xl border border-outline-variant bg-surface shadow-lg lg:bottom-auto lg:left-auto lg:right-3 lg:top-3 lg:max-w-xs">
                  <button
                    type="button"
                    onClick={() => setSheet("half")}
                    aria-label="Show details"
                    className="flex min-h-12 w-full min-w-0 items-center gap-3 px-4 text-left"
                  >
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="flex-shrink-0 text-primary">
                      <path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" />
                    </svg>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-on-surface">{summary}</span>
                      {(summaryDetail ?? trafficMsg) && (
                        <span className="block truncate text-xs text-on-surface-variant">{summaryDetail ?? trafficMsg}</span>
                      )}
                    </span>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="flex-shrink-0 text-on-surface-variant">
                      <path d="M6 15l6-6 6 6" />
                    </svg>
                  </button>
                  {peek && (
                    <div className="flex gap-3 px-4 pb-2">
                      <span aria-hidden="true" className="flex flex-col items-center py-1">
                        <span className="h-2 w-2 rounded-full bg-md-green" />
                        <span className="my-0.5 w-px flex-1 border-l border-dotted border-outline" />
                        <span className="h-2 w-2 rounded-full bg-primary" />
                      </span>
                      <span className="min-w-0 flex-1 text-xs">
                        <span className="block truncate text-on-surface-variant" title={peek.from}>{peek.from}</span>
                        <span className="mt-1 block truncate font-medium text-on-surface" title={peek.to}>{peek.to}</span>
                      </span>
                    </div>
                  )}
                  {(peek?.load || headerActionButton) && (
                    <div className="flex items-center justify-between gap-2 pl-4 pr-3 pb-2">
                      {peek?.load ? (
                        <span className={`min-w-0 truncate rounded-lg px-2.5 py-1 text-xs font-medium ${
                          peek.load.tone === "expired" || peek.load.tone === "critical" ? "bg-md-red/10 text-error"
                            : peek.load.tone === "warn" ? "bg-amber-50 text-amber-800"
                            : "bg-surface-container text-on-surface"
                        }`}>{peek.load.text}</span>
                      ) : <span />}
                      {headerActionButton}
                    </div>
                  )}
                  </div>
                )}
              </div>

              <div className="hidden lg:block lg:flex-[0_0_35%] min-h-0 border-t border-outline-variant bg-surface overflow-y-auto sidebar-scroll">
                {shownRoute ? (
                  <InfoPanel route={shownRoute} simState={viewedTrip ? "idle" : sim.simState} simProgress={viewedTrip ? 0 : sim.progress} />
                ) : shownTrip ? (
                  <TripInfoPanel trip={shownTrip} />
                ) : (
                  <div className="flex items-center justify-center h-full text-on-surface-variant text-sm">
                    <div className="text-center space-y-2 p-6">
                      <p className="text-2xl">🗺</p>
                      <p>Route or trip details will appear here</p>
                    </div>
                  </div>
                )}
              </div>
            </main>
          </>
        )}
        </div>
      </div>
    </div>
  );
}

/* Nav item */
function NavItem({
  id, active, label, icon, onClick, badge, badgePulse, expanded,
}: {
  id: ActiveTab; active: ActiveTab; label: string; icon: React.ReactNode;
  onClick: (id: ActiveTab) => void; badge?: boolean; badgePulse?: boolean; expanded: boolean;
}) {
  const isActive = id === active;
  return (
    <button
      onClick={() => onClick(id)}
      aria-current={isActive ? "page" : undefined}
      title={label}
      className={`relative flex min-h-14 flex-1 flex-col items-center justify-center gap-0.5 px-2 text-xs font-medium whitespace-nowrap transition-colors lg:flex-none [&_svg]:h-[22px] [&_svg]:w-[22px] lg:[&_svg]:h-[18px] lg:[&_svg]:w-[18px] ${
        expanded
          ? "lg:min-h-0 lg:w-full lg:flex-row lg:justify-start lg:gap-3 lg:px-4 lg:py-3 lg:text-left lg:text-sm"
          : "lg:min-h-12 lg:py-3"
      } ${
        isActive
          ? `bg-primary/10 text-primary ${expanded ? "lg:border-r-2 lg:border-primary" : ""}`
          : "text-on-surface-variant hover:bg-surface-container hover:text-on-surface"
      }`}
    >
      {icon}
      <span className={expanded ? "" : "lg:sr-only"}>{label}</span>
      {badge && (
        <span className={`absolute right-[calc(50%-1.5rem)] top-2.5 w-2 h-2 rounded-full bg-md-green ${expanded ? "lg:static lg:ml-auto" : "lg:right-3 lg:top-2.5"} ${badgePulse ? "animate-pulse" : ""}`} />
      )}
    </button>
  );
}

/*  Trip info panel (bottom right when trip is active)  */
function TripInfoPanel({ trip }: { trip: TripResponse }) {
  return (
    <div className="p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-on-surface">Active Delivery</h3>
        <span className="text-xs px-2 py-0.5 rounded-full bg-primary-container text-primary font-medium">
          Trip #{trip.id}
        </span>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <InfoCard label="From" value={trip.start_address.split(",")[0]} icon="" />
        <InfoCard label="To" value={trip.end_address.split(",")[0]} icon="" />
        {trip.concrete_mix && <InfoCard label="Mix" value={trip.concrete_mix} icon="" />}
        {trip.volume_m3 != null && <InfoCard label="Volume" value={`${trip.volume_m3} m`} icon="" />}
        {trip.load_minutes_remaining != null && (
          <InfoCard
            label="Load Remaining"
            value={`${Math.round(trip.load_minutes_remaining)} min`}
            icon={trip.load_minutes_remaining < 20 ? "" : trip.load_minutes_remaining < 40 ? "" : ""}
          />
        )}
        {trip.scheduled_at && (
          <InfoCard
            label="Scheduled"
            value={formatInZone(trip.scheduled_at, timeZoneForTrip(trip), "time")}
            icon=""
          />
        )}
      </div>
    </div>
  );
}

/*  Route info panel (bottom right)  */
function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.round((seconds % 3600) / 60);
  return h > 0 ? `${h}h ${m}m` : `${m} min`;
}
function formatDistance(meters: number): string {
  return (meters / 1000).toFixed(1) + " km";
}

import type {} from "@/types/route";

function InfoPanel({
  route,
  simState,
  simProgress,
  compact = false,
}: {
  route: RouteResponse;
  simState: SimState;
  simProgress: number;
  /** Driver view on a phone: no coordinates, no internal vehicle/priority tags, no simulation status */
  compact?: boolean;
}) {
  const traffic = route.traffic_delay_seconds ?? 0;
  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-on-surface">Route Information</h3>
        <span className="text-xs px-2 py-0.5 rounded-full bg-primary-container text-primary font-medium">
          ID #{route.id}
        </span>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <InfoCard label="Distance" value={formatDistance(route.distance_meters)} icon="" />
        <InfoCard label="Duration" value={formatDuration(route.duration_seconds)} icon="" />
        <InfoCard
          label="Traffic Delay"
          value={traffic > 0 ? `+${formatDuration(traffic)}` : "Clear"}
          icon={traffic > 300 ? "" : ""}
        />
        {!compact && <InfoCard
          label="Status"
          value={
            simState === "running"
              ? `${Math.round(simProgress * 100)}% En Route`
              : simState === "paused"
              ? "Paused"
              : simState === "finished"
              ? "Delivered"
              : "Ready"
          }
          icon={simState === "running" ? "" : simState === "finished" ? "" : ""}
        />}
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="rounded-xl bg-surface-container p-3">
          <p className="text-[11px] text-on-surface-variant font-medium mb-0.5">FROM</p>
          <p className="text-sm text-on-surface">{compact ? displayAddress(route.resolved_start_address) : route.resolved_start_address}</p>
          {!compact && <p className="text-xs text-on-surface-variant mt-1">{route.start_lat.toFixed(5)}, {route.start_lng.toFixed(5)}</p>}
        </div>
        <div className="rounded-xl bg-surface-container p-3">
          <p className="text-[11px] text-on-surface-variant font-medium mb-0.5">TO</p>
          <p className="text-sm text-on-surface">{compact ? displayAddress(route.resolved_end_address) : route.resolved_end_address}</p>
          {!compact && <p className="text-xs text-on-surface-variant mt-1">{route.end_lat.toFixed(5)}, {route.end_lng.toFixed(5)}</p>}
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        {!compact && <Tag icon="" label={route.vehicle_type} />}
        {!compact && route.vehicle_id && <Tag icon="" label={route.vehicle_id} />}
        {!compact && <Tag icon="" label={route.priority} />}
        {route.load_weight && <Tag icon="" label={`${route.load_weight} kg`} />}
        {route.avoid && route.avoid.length > 0 && <Tag icon="" label={`Avoid: ${route.avoid.join(", ")}`} />}
        {route.total_alternatives > 1 && <Tag icon="" label={`${route.total_alternatives} routes`} />}
      </div>
      {route.exceeds_delivery_limit && (
        <div className="px-3 py-2 rounded-xl bg-md-red/10 text-md-red text-xs font-medium">
           Exceeds delivery limit by {route.delivery_limit_exceeded_by} min
        </div>
      )}
      {route.route_steps && route.route_steps.length > 0 && (
        <details className="trip-accordion">
          <summary className="min-h-12 flex items-center cursor-pointer text-xs font-medium text-on-surface-variant mb-2">
            Turn-by-turn ({route.route_steps.length} steps)
          </summary>
          <div className="max-h-[200px] overflow-y-auto space-y-0.5 pr-1 sidebar-scroll">
            {route.route_steps.map((step, i) => (
              <div
                key={i}
                className="flex gap-2 items-start py-1.5 px-2 rounded-lg hover:bg-surface-container transition-colors text-xs"
              >
                <span className="flex-shrink-0 w-5 h-5 rounded-full bg-primary-container text-primary text-[10px] font-medium flex items-center justify-center">
                  {i + 1}
                </span>
                <span className="flex-1 text-on-surface leading-relaxed" dangerouslySetInnerHTML={{ __html: step.instruction }} />
                <span className="flex-shrink-0 text-on-surface-variant whitespace-nowrap">
                  {formatDistance(step.distance_meters)}
                </span>
              </div>
            ))}
          </div>
        </details>
      )}
    </div>
  );
}

function InfoCard({ label, value, icon }: { label: string; value: string; icon: string }) {
  return (
    <div className="rounded-xl bg-surface-container p-3 text-center">
      <p className="text-lg mb-0.5">{icon}</p>
      <p className="text-sm font-medium text-on-surface truncate">{value}</p>
      <p className="text-[11px] text-on-surface-variant">{label}</p>
    </div>
  );
}

function Tag({ icon, label }: { icon: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-surface-container-low border border-outline-variant text-xs text-on-surface-variant">
      {icon} {label}
    </span>
  );
}
