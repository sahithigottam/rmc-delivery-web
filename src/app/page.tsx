"use client";

import dynamic from "next/dynamic";
import { useCallback, useState } from "react";
import { estimateRoute, getTrip, getRoute } from "@/lib/api";
import { useSimulation } from "@/hooks/useSimulation";
import { useTripStream } from "@/hooks/useTripStream";
import RouteForm from "@/components/RouteForm";
import type { RouteFormData } from "@/components/RouteForm";
import RouteDetails from "@/components/RouteDetails";
import SimulationControls from "@/components/SimulationControls";
import TripManagement from "@/components/TripManagement";
import TripEventLog from "@/components/TripEventLog";
import MapOverlay from "@/components/MapOverlay";
import DispatchPanel from "@/components/DispatchPanel";
import ToastContainer, { showToast } from "@/components/Toast";
import TruckIcon from "@/components/TruckIcon";
import type { RouteResponse, TripResponse, DispatchResponse, SimState } from "@/types/route";

/* Leaflet must not SSR */
const MapView = dynamic(() => import("@/components/MapView"), { ssr: false });

type ActiveTab = "dispatch" | "route" | "trip";

export default function Home() {
  const [route, setRoute] = useState<RouteResponse | null>(null);
  const [trip, setTrip] = useState<TripResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [activeTab, setActiveTab] = useState<ActiveTab>("dispatch");

  const sim = useSimulation(route);

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
      setRoute(fullRoute);
      setActiveTab("trip");
      showToast(`Trip #${resp.trip_id} dispatched to ${resp.plant_name}`, "success");
    } catch {
      showToast("Dispatch succeeded but couldn't load trip details", "info");
      setActiveTab("trip");
    }
  }, []);

  /* -- Estimate route -- */
  const handleEstimate = useCallback(
    async (form: RouteFormData) => {
      setLoading(true);
      setError(null);
      try {
        const result = await estimateRoute({
          start: { address: form.start },
          end: { address: form.end },
          vehicle_type: form.vehicle_type,
          vehicle_id: form.vehicle_id || undefined,
          load_weight: form.load_weight ? Number(form.load_weight) : undefined,
          priority: form.priority,
          avoid: form.avoid.length > 0 ? form.avoid : undefined,
          request_alternatives: form.request_alternatives,
          route_index: form.route_index,
        });
        setRoute(result);
        setActiveTab("route");
        showToast(`Route: ${(result.distance_meters / 1000).toFixed(1)} km`, "success");
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Failed to calculate route";
        setError(msg);
        showToast(msg, "error");
      } finally {
        setLoading(false);
      }
    },
    []
  );

  /* -- Select route variant -- */
  const handleSelectVariant = useCallback(
    async (index: number) => {
      if (!route) return;
      setLoading(true);
      setError(null);
      try {
        const result = await estimateRoute({
          start: route.start,
          end: route.end,
          vehicle_type: route.vehicle_type,
          vehicle_id: route.vehicle_id ?? undefined,
          load_weight: route.load_weight ?? undefined,
          priority: route.priority,
          avoid: route.avoid ?? undefined,
          request_alternatives: true,
          route_index: index,
        });
        setRoute(result);
        showToast(
          `Switched to ${result.alternatives_summary?.[index]?.summary ?? "Route " + (index + 1)}`,
          "info"
        );
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Failed to load variant";
        setError(msg);
        showToast(msg, "error");
      } finally {
        setLoading(false);
      }
    },
    [route]
  );

  const liveTrip = trip?.status === "in_progress" || trip?.status === "paused";

  return (
    <div className="flex flex-col h-screen">
      <ToastContainer />

      {/* Top bar */}
      <header className="flex items-center h-14 px-4 bg-primary text-on-primary shadow-md z-30 flex-shrink-0">
        <button
          onClick={() => setSidebarOpen((v) => !v)}
          className="w-9 h-9 flex items-center justify-center rounded-xl hover:bg-white/10 transition-colors mr-2"
          aria-label="Toggle sidebar"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M3 12h18M3 6h18M3 18h18" />
          </svg>
        </button>
        <span className="text-lg font-medium tracking-wide">RMC Delivery Route Optimizer</span>
        {connected && liveTrip && (
          <div className="ml-auto flex items-center gap-2 text-sm opacity-90">
            <div className="w-2 h-2 rounded-full bg-md-green animate-pulse" />
            Live Tracking
          </div>
        )}
      </header>

      {/* Body */}
      <div className="flex flex-1 overflow-hidden relative">
        {/* Sidebar */}
        <aside
          className={`
            ${sidebarOpen ? "translate-x-0" : "-translate-x-full"}
            w-[400px] max-w-[85vw] flex-shrink-0 bg-surface border-r border-outline-variant
            flex flex-col overflow-hidden z-20
            transition-transform duration-300 ease-in-out
            absolute md:relative h-full
          `}
        >
          {/* Tab bar */}
          <div className="flex border-b border-outline-variant bg-surface flex-shrink-0">
            <TabBtn id="dispatch" active={activeTab} label="Dispatch" icon="" onClick={setActiveTab} />
            <TabBtn id="route" active={activeTab} label="Route" icon="" onClick={setActiveTab} />
            <TabBtn
              id="trip"
              active={activeTab}
              label="Live Trip"
              icon=""
              onClick={setActiveTab}
              badge={trip != null}
              badgePulse={liveTrip}
            />
          </div>

          {/* Scrollable content */}
          <div className="flex-1 overflow-y-auto sidebar-scroll p-4 space-y-4">

            {/* DISPATCH TAB */}
            {activeTab === "dispatch" && (
              <DispatchPanel onDispatched={handleDispatched} />
            )}

            {/* ROUTE TAB */}
            {activeTab === "route" && (
              <>
                <RouteForm
                  onEstimate={handleEstimate}
                  loading={loading}
                  route={route}
                  simState={sim.simState}
                />
                {error && (
                  <div className="flex items-start gap-2 px-3 py-2.5 rounded-xl bg-md-red/10 text-md-red text-sm">
                    <span className="flex-shrink-0"></span>
                    <p className="flex-1">{error}</p>
                    <button onClick={() => setError(null)} className="text-xs opacity-60 hover:opacity-100 flex-shrink-0"></button>
                  </div>
                )}
                {route && (
                  <RouteDetails
                    route={route}
                    onSelectVariant={handleSelectVariant}
                    simState={sim.simState}
                    currentStepIndex={sim.currentStepIndex}
                  />
                )}
                {!route && !loading && (
                  <div className="p-4 rounded-xl bg-surface-container text-center space-y-2">
                    <p className="text-sm text-on-surface-variant">Enter addresses above to calculate a route</p>
                  </div>
                )}
              </>
            )}

            {/* TRIP TAB */}
            {activeTab === "trip" && (
              <div className="space-y-4">
                <TripManagement
                  trip={trip}
                  onTripUpdated={setTrip}
                />
                <TripEventLog tripId={trip?.id ?? null} />
              </div>
            )}
          </div>

          {/* Simulation controls — pinned at bottom when route exists */}
          {route && activeTab === "route" && (
            <div className="border-t border-outline-variant p-4 bg-surface flex-shrink-0">
              <SimulationControls
                simState={sim.simState}
                progress={sim.progress}
                remainingKm={sim.remainingKm}
                trafficMsg={sim.trafficMsg}
                speedMultiplier={sim.speedMultiplier}
                onSpeedChange={sim.setSpeedMultiplier}
                onToggle={sim.toggle}
                onStop={sim.stop}
              />
            </div>
          )}
        </aside>

        {/* Sidebar backdrop (mobile) */}
        {sidebarOpen && (
          <div
            className="absolute inset-0 bg-black/20 z-10 md:hidden"
            onClick={() => setSidebarOpen(false)}
          />
        )}

        {/* Right: map + info panel */}
        <main className="flex-1 flex flex-col overflow-hidden">
          {/* Map — 65% */}
          <div className="relative" style={{ flex: "0 0 65%", minHeight: 0 }}>
            <MapView
              route={route}
              simState={sim.simState}
              simProgress={sim.progress}
              truckPosition={sim.truckPosition}
              animationPoints={sim.animationPoints}
              currentPointIndex={sim.currentPointIndex}
            />

            {/* Empty state overlay */}
            {!route && !loading && (
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-[400]">
                <div className="text-center space-y-3 p-8 max-w-sm">
                  <div className="flex justify-center">
                    <TruckIcon size={80} />
                  </div>
                  <h2 className="text-xl font-medium text-on-surface">Plan Your Delivery Route</h2>
                  <p className="text-sm text-on-surface-variant leading-relaxed">
                    Use the <strong>Dispatch</strong> tab to schedule a delivery, or the <strong>Route</strong> tab to manually plan a route.
                  </p>
                </div>
              </div>
            )}

            {/* Loading overlay */}
            {loading && (
              <div className="absolute inset-0 flex items-center justify-center bg-white/40 backdrop-blur-[2px] z-[400]">
                <div className="flex flex-col items-center gap-3 p-6 rounded-2xl bg-white/90 shadow-xl">
                  <svg className="animate-spin h-8 w-8 text-primary" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  <p className="text-sm font-medium text-on-surface">Calculating route</p>
                </div>
              </div>
            )}

            <MapOverlay
              simState={sim.simState}
              progress={sim.progress}
              remainingKm={sim.remainingKm}
              destination={route?.resolved_end_address ?? ""}
              trafficMsg={sim.trafficMsg}
            />
          </div>

          {/* Info panel — 35% */}
          <div
            className="border-t border-outline-variant bg-surface overflow-y-auto sidebar-scroll"
            style={{ flex: "0 0 35%", minHeight: 0 }}
          >
            {route ? (
              <InfoPanel route={route} simState={sim.simState} simProgress={sim.progress} />
            ) : trip ? (
              <TripInfoPanel trip={trip} />
            ) : (
              <div className="flex items-center justify-center h-full text-on-surface-variant text-sm">
                <div className="text-center space-y-2 p-6">
                  <p className="text-2xl"></p>
                  <p>Route or trip details will appear here</p>
                </div>
              </div>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}

/*  Tab button  */
function TabBtn({
  id, active, label, icon, onClick, badge, badgePulse,
}: {
  id: ActiveTab; active: ActiveTab; label: string; icon: string;
  onClick: (id: ActiveTab) => void; badge?: boolean; badgePulse?: boolean;
}) {
  const isActive = id === active;
  return (
    <button
      onClick={() => onClick(id)}
      className={`flex-1 flex items-center justify-center gap-1.5 py-3 text-sm font-medium border-b-2 transition-colors ${
        isActive
          ? "border-primary text-primary"
          : "border-transparent text-on-surface-variant hover:text-on-surface"
      }`}
    >
      <span>{icon}</span>
      <span>{label}</span>
      {badge && (
        <span className={`w-2 h-2 rounded-full bg-md-green ${badgePulse ? "animate-pulse" : ""}`} />
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
            value={new Date(trip.scheduled_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
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
}: {
  route: RouteResponse;
  simState: SimState;
  simProgress: number;
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
        <InfoCard
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
        />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="rounded-xl bg-surface-container p-3">
          <p className="text-[11px] text-on-surface-variant font-medium mb-0.5">FROM</p>
          <p className="text-sm text-on-surface">{route.resolved_start_address}</p>
          <p className="text-xs text-on-surface-variant mt-1">{route.start_lat.toFixed(5)}, {route.start_lng.toFixed(5)}</p>
        </div>
        <div className="rounded-xl bg-surface-container p-3">
          <p className="text-[11px] text-on-surface-variant font-medium mb-0.5">TO</p>
          <p className="text-sm text-on-surface">{route.resolved_end_address}</p>
          <p className="text-xs text-on-surface-variant mt-1">{route.end_lat.toFixed(5)}, {route.end_lng.toFixed(5)}</p>
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        <Tag icon="" label={route.vehicle_type} />
        {route.vehicle_id && <Tag icon="" label={route.vehicle_id} />}
        <Tag icon="" label={route.priority} />
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
        <div>
          <p className="text-xs font-medium text-on-surface-variant mb-2">
            Turn-by-turn ({route.route_steps.length} steps)
          </p>
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
        </div>
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
