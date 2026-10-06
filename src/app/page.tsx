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

/* Leaflet must not SSR */
const MapView = dynamic(() => import("@/components/MapView"), { ssr: false });

type ActiveTab = "dispatch" | "trip" | "trips" | "plants";

export default function Home() {
  const [route, setRoute] = useState<RouteResponse | null>(null);
  const [trip, setTrip] = useState<TripResponse | null>(null);
  const [viewedTrip, setViewedTrip] = useState<TripResponse | null>(null);
  const [activeTab, setActiveTab] = useState<ActiveTab>("dispatch");
  const [gpsMode, setGpsMode] = useState(false);
  const [showSheet, setShowSheet] = useState(false);

  // Simulation mode — animates truck along polyline
  const sim = useSimulation(route, !gpsMode && trip?.status === "in_progress" ? trip.id : null);

  // Real GPS mode — uses device location
  const gps = useGpsTracking(
    route,
    gpsMode && trip?.status === "in_progress" ? trip.id : null,
    gpsMode,
  );

  // Effective truck position: GPS when active, simulation otherwise
  const activeTruckPosition = gpsMode && gps.gpsPosition ? gps.gpsPosition : sim.truckPosition;
  const activeSimState: SimState = gpsMode
    ? gps.gpsState === "active"
      ? "running"
      : gps.gpsState === "requesting"
      ? "paused"
      : "idle"
    : sim.simState;
  const activeProgress = gpsMode && route
    ? Math.max(0, Math.min(1, 1 - gps.remainingKm / Math.max(route.distance_meters / 1000, 0.001)))
    : sim.progress;
  const activeRemainingKm = gpsMode ? gps.remainingKm : sim.remainingKm;
  const activeTrafficMsg = gpsMode ? gps.trafficMsg : sim.trafficMsg;
  const activeSpeed = gpsMode ? (gps.gpsSpeed ?? 0) : sim.currentSpeed;

  /* SSE connection for real-time trip updates */
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

  /* -- Dispatch flow -- */
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
      showToast(`Trip #${resp.trip_id} dispatched to ${resp.plant_name}`, "success");
    } catch {
      showToast("Dispatch succeeded but couldn't load trip details", "info");
      setActiveTab("trip");
    }
  }, []);


  const liveTrip = trip?.status === "in_progress" || trip?.status === "paused";

  return (
    <div className="flex flex-col h-screen bg-surface">
      <ToastContainer />

      {/* Header */}
      <header className="h-14 px-4 bg-primary text-on-primary flex items-center justify-between border-b border-outline-variant z-30 flex-shrink-0">
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

      {/* Main Content */}
      <div className="flex-1 flex flex-col md:flex-row overflow-hidden gap-0 md:gap-4 md:p-4">
        
        {/* Desktop Sidebar - hidden on mobile */}
        <aside className="hidden md:flex md:w-80 md:flex-col bg-surface-container rounded-lg border border-outline-variant overflow-hidden">
          <div className="p-4 border-b border-outline-variant">
            <h2 className="text-sm font-bold text-on-surface">
              {activeTab === "dispatch" && "📦 Dispatch"}
              {activeTab === "trip" && "🚚 Trip"}
              {activeTab === "trips" && "📋 Trips"}
              {activeTab === "plants" && "🏭 Plants"}
            </h2>
          </div>
          <div className="flex-1 overflow-y-auto sidebar-scroll p-4 space-y-4">
            {activeTab === "dispatch" && <DispatchPanel onDispatched={handleDispatched} />}
            {activeTab === "trip" && (
              <div className="space-y-4">
                {viewedTrip && (
                  <div className="flex items-center justify-between px-3 py-2 rounded-xl bg-surface border border-outline-variant text-xs text-on-surface-variant">
                    <span>Viewing Trip #{viewedTrip.id}</span>
                    <button onClick={() => setViewedTrip(null)}
                      className="text-primary font-medium hover:opacity-70">
                      ← Back
                    </button>
                  </div>
                )}
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
            <div className="border-t border-outline-variant p-4 bg-surface flex-shrink-0">
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

        {/* Map - full screen on mobile, flex grow on desktop */}
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
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-[400]">
              <div className="text-center space-y-3 p-8 max-w-sm bg-surface/80 rounded-2xl backdrop-blur">
                <div className="flex justify-center text-5xl">📍</div>
                <h2 className="text-lg font-bold text-on-surface">No Active Route</h2>
                <p className="text-sm text-on-surface-variant">
                  Tap <strong>Dispatch</strong> to schedule delivery.
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

      {/* Mobile Bottom Sheet */}
      {showSheet && (
        <div className="fixed inset-0 z-50 md:hidden flex flex-col items-end">
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-black/40"
            onClick={() => setShowSheet(false)}
          />
          {/* Sheet */}
          <div className="relative bg-surface w-full rounded-t-3xl max-h-[80vh] overflow-y-auto flex flex-col shadow-2xl">
            {/* Handle */}
            <div className="flex justify-center sticky top-0 bg-surface pt-3 pb-2 z-10">
              <div className="w-12 h-1 bg-outline-variant rounded-full" />
            </div>

            {/* Content */}
            <div className="flex-1 px-4 pb-20">
              {activeTab === "dispatch" && <DispatchPanel onDispatched={handleDispatched} />}
              
              {activeTab === "trip" && (
                <div className="space-y-4">
                  {viewedTrip && (
                    <div className="flex items-center justify-between px-3 py-2 rounded-xl bg-surface-container border border-outline-variant text-xs text-on-surface-variant">
                      <span>Viewing Trip #{viewedTrip.id}</span>
                      <button onClick={() => setViewedTrip(null)}
                        className="text-primary font-medium hover:opacity-70">
                        ← Back
                      </button>
                    </div>
                  )}
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

      {/* Mobile Bottom Navigation Bar - fixed at bottom */}
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
    </div>
  );
}

/**
 * Mobile Navigation Button
 */
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

// Trip info panel
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
            value={new Date(trip.scheduled_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
            icon=""
          />
        )}
      </div>
    </div>
  );
}

// Format helpers
function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.round((seconds % 3600) / 60);
  return h > 0 ? `${h}h ${m}m` : `${m} min`;
}

function formatDistance(meters: number): string {
  return (meters / 1000).toFixed(1) + " km";
}

// Info Card component
function InfoCard({ label, value, icon }: { label: string; value: string; icon: string }) {
  return (
    <div className="rounded-xl bg-surface-container p-3 text-center">
      <p className="text-lg mb-0.5">{icon}</p>
      <p className="text-sm font-medium text-on-surface truncate">{value}</p>
      <p className="text-[11px] text-on-surface-variant">{label}</p>
    </div>
  );
}

// Tag component
function Tag({ icon, label }: { icon: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-surface-container-low border border-outline-variant text-xs text-on-surface-variant">
      {icon} {label}
    </span>
  );
}
