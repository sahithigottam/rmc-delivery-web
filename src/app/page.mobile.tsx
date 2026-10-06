"use client";

import dynamic from "next/dynamic";
import { useCallback, useState, useEffect } from "react";
import { getTrip, getRoute } from "@/lib/api";
import { useSimulation } from "@/hooks/useSimulation";
import { useGpsTracking } from "@/hooks/useGpsTracking";
import { useTripStream } from "@/hooks/useTripStream";
import SimulationControls from "@/components/SimulationControls";
import TripManagement from "@/components/TripManagement";
import TripEventLog from "@/components/TripEventLog";
import MapOverlay from "@/components/MapOverlay";
import DispatchPanel from "@/components/DispatchPanel";
import TripsListPanel from "@/components/TripsListPanel";
import PlantsPanel from "@/components/PlantsPanel";
import ToastContainer, { showToast } from "@/components/Toast";
import TruckIcon from "@/components/TruckIcon";
import type { RouteResponse, TripResponse, DispatchResponse, SimState } from "@/types/route";

const MapView = dynamic(() => import("@/components/MapView"), { ssr: false });

type ActiveTab = "dispatch" | "trip" | "trips" | "plants";

export default function Home() {
  const [route, setRoute] = useState<RouteResponse | null>(null);
  const [trip, setTrip] = useState<TripResponse | null>(null);
  const [viewedTrip, setViewedTrip] = useState<TripResponse | null>(null);
  const [activeTab, setActiveTab] = useState<ActiveTab>("dispatch");
  const [gpsMode, setGpsMode] = useState(false);
  const [showSheet, setShowSheet] = useState(false);

  const sim = useSimulation(route, !gpsMode && trip?.status === "in_progress" ? trip.id : null);
  const gps = useGpsTracking(
    route,
    gpsMode && trip?.status === "in_progress" ? trip.id : null,
    gpsMode,
  );

  const activeTruckPosition = gpsMode && gps.gpsPosition ? gps.gpsPosition : sim.truckPosition;
  const activeSimState: SimState = gpsMode
    ? gps.gpsState === "active" ? "running" : gps.gpsState === "requesting" ? "paused" : "idle"
    : sim.simState;
  const activeProgress = gpsMode && route
    ? Math.max(0, Math.min(1, 1 - gps.remainingKm / Math.max(route.distance_meters / 1000, 0.001)))
    : sim.progress;
  const activeRemainingKm = gpsMode ? gps.remainingKm : sim.remainingKm;
  const activeTrafficMsg = gpsMode ? gps.trafficMsg : sim.trafficMsg;
  const activeSpeed = gpsMode ? (gps.gpsSpeed ?? 0) : sim.currentSpeed;

  const { connected } = useTripStream({
    tripId: trip?.id ?? null,
    enabled: trip?.status === "in_progress" || trip?.status === "paused",
    onReroute: (info) => {
      if (route && info.new_polyline) {
        setRoute({
          ...route,
          polyline: info.new_polyline,
          route_steps: info.new_steps,
          duration_seconds: info.new_duration_seconds,
          distance_meters: info.new_distance_meters,
        });
      }
    },
    onStatusChange: (status) => {
      if (trip) setTrip({ ...trip, status: status as any });
    },
  });

  const handleDispatched = useCallback(async (resp: DispatchResponse) => {
    try {
      const [fullTrip, fullRoute] = await Promise.all([
        getTrip(resp.trip_id),
        getRoute(resp.route_id),
      ]);
      setTrip(fullTrip);
      setViewedTrip(null);
      setRoute(fullRoute);
      setActiveTab("trip");
      setShowSheet(false);
      showToast(`🚚 Trip #${resp.trip_id} dispatched!`, "success");
    } catch {
      showToast("Dispatch succeeded but couldn't load trip details", "info");
      setActiveTab("trip");
    }
  }, []);

  const liveTrip = trip?.status === "in_progress" || trip?.status === "paused";

  // Mobile Bottom Action Bar
  const MobileBottomNav = () => (
    <nav className="fixed bottom-0 left-0 right-0 bg-surface border-t border-outline-variant flex justify-around h-16 z-40 md:hidden">
      <NavButton
        id="dispatch"
        icon="📦"
        label="Dispatch"
        active={activeTab === "dispatch"}
        onClick={() => { setActiveTab("dispatch"); setShowSheet(true); }}
      />
      <NavButton
        id="trip"
        icon="🚚"
        label="Trip"
        active={activeTab === "trip"}
        badge={trip != null}
        badgePulse={liveTrip}
        onClick={() => { setActiveTab("trip"); setShowSheet(true); }}
      />
      <NavButton
        id="trips"
        icon="📋"
        label="Trips"
        active={activeTab === "trips"}
        onClick={() => { setActiveTab("trips"); setShowSheet(true); }}
      />
      <NavButton
        id="plants"
        icon="🏭"
        label="Plants"
        active={activeTab === "plants"}
        onClick={() => { setActiveTab("plants"); setShowSheet(true); }}
      />
    </nav>
  );

  return (
    <div className="flex flex-col h-screen bg-surface">
      <ToastContainer />

      {/* Header */}
      <header className="h-14 px-4 bg-primary text-on-primary flex items-center justify-between border-b border-outline-variant z-30">
        <div className="flex items-center gap-2">
          <span className="text-lg font-bold">🚚 RMC</span>
        </div>
        {connected && liveTrip && (
          <div className="flex items-center gap-1 text-xs">
            <div className="w-2 h-2 rounded-full bg-md-green animate-pulse" />
            Tracking
          </div>
        )}
      </header>

      {/* Main Content - Full screen map or list view */}
      <div className="flex-1 overflow-hidden md:flex md:gap-4 md:p-4">
        {/* Desktop Sidebar (hidden on mobile) */}
        <aside className="hidden md:flex md:w-80 md:flex-col bg-surface-container rounded-lg border border-outline-variant overflow-hidden">
          <div className="p-4 border-b border-outline-variant">
            <h2 className="text-sm font-bold text-on-surface">
              {activeTab === "dispatch" && "📦 Dispatch"}
              {activeTab === "trip" && "🚚 Trip"}
              {activeTab === "trips" && "📋 Trips"}
              {activeTab === "plants" && "🏭 Plants"}
            </h2>
          </div>
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {activeTab === "dispatch" && <DispatchPanel onDispatched={handleDispatched} />}
            {activeTab === "trip" && (
              <div className="space-y-4">
                <TripManagement
                  trip={viewedTrip ?? trip}
                  onTripUpdated={(updated) => {
                    if (viewedTrip && updated.id === viewedTrip.id) setViewedTrip(updated);
                    else setTrip(updated);
                  }}
                />
                <TripEventLog tripId={(viewedTrip ?? trip)?.id ?? null} />
              </div>
            )}
            {activeTab === "trips" && (
              <TripsListPanel
                onViewTrip={async (t) => {
                  try {
                    const fullTrip = await getTrip(t.id);
                    setViewedTrip(fullTrip);
                    setActiveTab("trip");
                  } catch {
                    showToast("Could not load trip details", "error");
                  }
                }}
              />
            )}
            {activeTab === "plants" && <PlantsPanel />}
          </div>
          {activeTab === "trip" && (viewedTrip ?? trip) && (
            <div className="border-t border-outline-variant p-4 bg-surface">
              <SimulationControls
                simState={sim.simState}
                progress={sim.progress}
                remainingKm={sim.remainingKm}
                trafficMsg={sim.trafficMsg}
                speedMultiplier={sim.speedMultiplier}
                currentSpeed={sim.currentSpeed}
                onSpeedChange={sim.setSpeedMultiplier}
                onToggle={sim.toggle}
                onStop={sim.stop}
                gpsMode={gpsMode}
                onGpsModeChange={(on) => { setGpsMode(on); if (!on) gps.stop(); }}
                gpsState={gps.gpsState}
                gpsAccuracy={gps.gpsAccuracy}
                gpsSpeed={gps.gpsSpeed}
                gpsError={gps.gpsError}
                gpsRemainingKm={gps.remainingKm}
                gpsTrafficMsg={gps.trafficMsg}
                onGpsStart={gps.start}
                onGpsStop={gps.stop}
              />
            </div>
          )}
        </aside>

        {/* Map (desktop full width, mobile full screen) */}
        <div className="flex-1 relative md:rounded-lg md:border md:border-outline-variant overflow-hidden">
          <MapView
            route={route}
            simState={activeSimState}
            simProgress={activeProgress}
            truckPosition={activeTruckPosition}
            animationPoints={gpsMode ? [] : sim.animationPoints}
            currentPointIndex={gpsMode ? 0 : sim.currentPointIndex}
            followTruck={gpsMode}
          />
          {!route && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/20 z-[400]">
              <div className="text-center space-y-3 p-6 max-w-xs bg-surface rounded-2xl shadow-lg">
                <div className="flex justify-center text-5xl">📍</div>
                <h2 className="text-lg font-bold text-on-surface">No Active Route</h2>
                <p className="text-sm text-on-surface-variant">
                  Tap <strong>Dispatch</strong> to schedule a delivery.
                </p>
              </div>
            </div>
          )}
          <MapOverlay
            simState={activeSimState}
            progress={activeProgress}
            remainingKm={activeRemainingKm}
            destination={route?.resolved_end_address ?? ""}
            trafficMsg={activeTrafficMsg}
            currentSpeed={activeSpeed}
          />
        </div>
      </div>

      {/* Mobile Bottom Sheet (slides up) */}
      {showSheet && (
        <div className="fixed inset-0 z-50 md:hidden">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/40"
            onClick={() => setShowSheet(false)}
          />
          {/* Sheet */}
          <div className="absolute bottom-0 left-0 right-0 bg-surface rounded-t-3xl shadow-2xl max-h-[75vh] overflow-y-auto flex flex-col">
            {/* Handle */}
            <div className="flex justify-center p-3">
              <div className="w-12 h-1 bg-outline-variant rounded-full" />
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto px-4 pb-24">
              {activeTab === "dispatch" && <DispatchPanel onDispatched={handleDispatched} />}
              {activeTab === "trip" && (
                <div className="space-y-4">
                  <TripManagement
                    trip={viewedTrip ?? trip}
                    onTripUpdated={(updated) => {
                      if (viewedTrip && updated.id === viewedTrip.id) setViewedTrip(updated);
                      else setTrip(updated);
                    }}
                  />
                  <TripEventLog tripId={(viewedTrip ?? trip)?.id ?? null} />
                  {(viewedTrip ?? trip) && (
                    <div className="border-t border-outline-variant pt-4">
                      <SimulationControls
                        simState={sim.simState}
                        progress={sim.progress}
                        remainingKm={sim.remainingKm}
                        trafficMsg={sim.trafficMsg}
                        speedMultiplier={sim.speedMultiplier}
                        currentSpeed={sim.currentSpeed}
                        onSpeedChange={sim.setSpeedMultiplier}
                        onToggle={sim.toggle}
                        onStop={sim.stop}
                        gpsMode={gpsMode}
                        onGpsModeChange={(on) => { setGpsMode(on); if (!on) gps.stop(); }}
                        gpsState={gps.gpsState}
                        gpsAccuracy={gps.gpsAccuracy}
                        gpsSpeed={gps.gpsSpeed}
                        gpsError={gps.gpsError}
                        gpsRemainingKm={gps.remainingKm}
                        gpsTrafficMsg={gps.trafficMsg}
                        onGpsStart={gps.start}
                        onGpsStop={gps.stop}
                      />
                    </div>
                  )}
                </div>
              )}
              {activeTab === "trips" && (
                <TripsListPanel
                  onViewTrip={async (t) => {
                    try {
                      const fullTrip = await getTrip(t.id);
                      setViewedTrip(fullTrip);
                      setActiveTab("trip");
                    } catch {
                      showToast("Could not load trip details", "error");
                    }
                  }}
                />
              )}
              {activeTab === "plants" && <PlantsPanel />}
            </div>
          </div>
        </div>
      )}

      {/* Mobile Bottom Navigation */}
      <MobileBottomNav />
    </div>
  );
}

// Mobile Nav Button
function NavButton({
  id,
  icon,
  label,
  active,
  badge,
  badgePulse,
  onClick,
}: {
  id: string;
  icon: string;
  label: string;
  active: boolean;
  badge?: boolean;
  badgePulse?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex flex-col items-center justify-center gap-1 flex-1 relative transition-colors ${
        active ? "text-primary" : "text-on-surface-variant"
      }`}
    >
      <span className="text-2xl">{icon}</span>
      <span className="text-[10px] font-medium">{label}</span>
      {badge && (
        <span
          className={`absolute top-2 right-2 w-2 h-2 bg-md-red rounded-full ${
            badgePulse ? "animate-pulse" : ""
          }`}
        />
      )}
    </button>
  );
}
