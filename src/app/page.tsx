"use client";

import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { useCallback, useState, useEffect } from "react";
import { getTrip, getRoute } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import { useSimulation } from "@/hooks/useSimulation";
import { useGpsTracking } from "@/hooks/useGpsTracking";
import { useTripStream } from "@/hooks/useTripStream";
import SimulationControls from "@/components/SimulationControls";
import TripManagement from "@/components/TripManagement";
import TripEventLog from "@/components/TripEventLog";
import TruckStatusPanel from "@/components/TruckStatusPanel";
import TrucksSchedulePage from "@/components/TrucksSchedulePage";
import MapOverlay from "@/components/MapOverlay";
import DispatchPanel from "@/components/DispatchPanel";
import TripsListPanel from "@/components/TripsListPanel";
import PlantsPanel from "@/components/PlantsPanel";
import DriverAssignments from "@/components/DriverAssignments";
import ToastContainer, { showToast } from "@/components/Toast";
import TruckIcon from "@/components/TruckIcon";
import { getAllTrips } from "@/lib/api";
import type { RouteResponse, TripResponse, DispatchResponse, SimState } from "@/types/route";

/* Leaflet must not SSR */
const MapView = dynamic(() => import("@/components/MapView"), { ssr: false });

type ActiveTab = "dispatch" | "trip" | "trips" | "plants";

export default function Home() {
  const router = useRouter();
  const { isAuthenticated, loading, user } = useAuth();

  // ⚠️ ALL hooks must be called BEFORE any conditional returns
  const [route, setRoute] = useState<RouteResponse | null>(null);
  const [trip, setTrip] = useState<TripResponse | null>(null);
  const [viewedTrip, setViewedTrip] = useState<TripResponse | null>(null);
  const [activeTab, setActiveTab] = useState<ActiveTab>("dispatch");
  const [gpsMode, setGpsMode] = useState(false);
  const [allTrips, setAllTrips] = useState<TripResponse[]>([]);
  const [currentJobDetails, setCurrentJobDetails] = useState<{
    jobSiteAddress?: string;
    plantId?: string;
    plantName?: string;
    scheduledAt?: string;
  } | null>(null);
  const [showSchedulePage, setShowSchedulePage] = useState(false);
  const [jobTrips, setJobTrips] = useState<TripResponse[]>([]);
  const [dispatchBatchTripIds, setDispatchBatchTripIds] = useState<Set<number>>(new Set());
  const [driverViewMode, setDriverViewMode] = useState<"list" | "cards">("cards");

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

  // Load all trips periodically to show multi-truck status
  const loadTrips = useCallback(async () => {
    try {
      const trips = await getAllTrips();
      setAllTrips(trips);
    } catch (e) {
      console.error("Failed to load trips:", e);
    }
  }, []);

  useEffect(() => {
    loadTrips();
    const interval = setInterval(loadTrips, 5000); // Refresh every 5 seconds
    return () => clearInterval(interval);
  }, [loadTrips]);

  // Manual refresh for drivers
  const handleRefreshTrips = useCallback(async () => {
    showToast("🔄 Fetching new assignments...", "info");
    await loadTrips();
    showToast("✅ Assignments updated!", "success");
  }, [loadTrips]);

  // Redirect to login if not authenticated
  useEffect(() => {
    if (!loading && !isAuthenticated) {
      router.push("/login");
    }
  }, [isAuthenticated, loading, router]);

  /* -- Dispatch flow -- */
  const handleDispatched = useCallback(async (resp: DispatchResponse) => {
    try {
      // Store the first dispatch response's creation time to identify this batch
      const dispatchTime = new Date(resp.created_at);
      const dispatchBatchWindow = {
        start: new Date(dispatchTime.getTime() - 2000), // 2 seconds before
        end: new Date(dispatchTime.getTime() + 10000), // 10 seconds after
      };
      
      // Store job details to filter trucks for this specific job
      setCurrentJobDetails({
        jobSiteAddress: resp.job_site_address,
        plantId: resp.plant_id,
        plantName: resp.plant_name,
        scheduledAt: resp.created_at,
      });
      
      // Fetch all trips to find those created in this dispatch batch
      const allTripsData = await getAllTrips();
      
      // Filter trips: ONLY show trips created within 2-10 seconds of dispatch
      // This ensures we only get the newly created trucks, not old ones
      const matchingTrips = allTripsData.filter((t) => {
        if (t.plant_id !== resp.plant_id) return false;
        
        const tripCreatedAt = t.created_at ? new Date(t.created_at) : null;
        return tripCreatedAt 
          ? tripCreatedAt >= dispatchBatchWindow.start && tripCreatedAt <= dispatchBatchWindow.end
          : false;
      });
      
      // Store the specific trip IDs so we only show these trucks
      setDispatchBatchTripIds(new Set(matchingTrips.map(t => t.id)));
      setJobTrips(matchingTrips);
      
      // Show schedule page if multiple trucks
      if (matchingTrips.length > 1) {
        setShowSchedulePage(true);
        setActiveTab("trip");
        showToast(`${matchingTrips.length} trucks scheduled`, "success");
      } else {
        // Single truck, load directly
        const [fullTrip, fullRoute] = await Promise.all([
          getTrip(resp.trip_id),
          getRoute(resp.route_id),
        ]);
        setTrip(fullTrip);
        setViewedTrip(null);
        setRoute(fullRoute);
        setActiveTab("trip");
        showToast(`Trip #${resp.trip_id} dispatched to ${resp.plant_name}`, "success");
      }
    } catch (e) {
      console.error(e);
      showToast("Dispatch succeeded but couldn't load trip details", "info");
    }
  }, []);

  // Handle truck selection from schedule page
  const handleSelectTruck = useCallback(async (tripId: number) => {
    try {
      const fullTrip = await getTrip(tripId);
      const fullRoute = fullTrip.route_id ? await getRoute(fullTrip.route_id) : null;
      setTrip(fullTrip);
      setViewedTrip(null);
      setRoute(fullRoute);
      setShowSchedulePage(false);
      setDispatchBatchTripIds(new Set()); // Clear batch when navigating to live trip
      setActiveTab("trip");
      const truckLabel = fullTrip.vehicle_id || `Trip #${tripId}`;
      showToast(`Tracking truck: ${truckLabel}`, "success");
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Failed to load truck details", "error");
    }
  }, []);

  // Loading screen while checking auth
  if (loading || !isAuthenticated) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-purple-600"></div>
          <p className="mt-4 text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }

  const { logout } = useAuth();
  const liveTrip = trip?.status === "in_progress" || trip?.status === "paused";
  const showMap = (activeTab === "dispatch" || activeTab === "trip") && !showSchedulePage;

  /* -- DRIVER VIEW -- */
  if (user?.role === "driver") {
    return (
      <div className="flex flex-col h-screen">
        <ToastContainer />

        {/* Top bar */}
        <header className="flex items-center h-14 px-5 bg-primary text-on-primary shadow-md z-30 flex-shrink-0">
          <span className="text-lg font-medium tracking-wide flex-1">RMC Delivery - Driver</span>
          {connected && liveTrip && (
            <div className="flex items-center gap-2 text-sm opacity-90">
              <div className="w-2 h-2 rounded-full bg-md-green animate-pulse" />
              Live Tracking
            </div>
          )}
          <div className="flex items-center gap-3 ml-6 pl-6 border-l border-on-primary border-opacity-30">
            <span className="text-sm font-medium">{user?.username}</span>
            <button
              onClick={() => {
                logout();
                router.push("/login");
              }}
              className="text-sm px-3 py-1 rounded hover:bg-on-primary hover:bg-opacity-20 transition-colors"
              title="Sign Out"
            >
              Sign Out
            </button>
          </div>
        </header>

        {/* Body */}
        <div className="flex flex-1 overflow-hidden">
          {/* Left sidebar - Assigned trips list */}
          <aside className="w-80 flex-shrink-0 bg-surface border-r border-outline-variant flex flex-col overflow-hidden">
            <div className="p-4 border-b border-outline-variant">
              <div className="flex items-center justify-between gap-2">
                <div className="flex-1">
                  <h2 className="text-lg font-semibold text-on-surface">Fresh Assignments</h2>
                  <p className="text-xs text-on-surface-variant mt-1">
                    Pending deliveries
                  </p>
                </div>
                <div className="flex gap-2">
                  {user?.role === "driver" && (
                    <>
                      <button
                        onClick={() => setDriverViewMode("cards")}
                        className={`px-2 py-1 rounded text-xs font-medium transition-colors ${
                          driverViewMode === "cards"
                            ? "bg-primary text-on-primary"
                            : "bg-surface-container text-on-surface-variant hover:bg-surface-container-high"
                        }`}
                        title="View as cards with actions"
                      >
                        Actions
                      </button>
                      <button
                        onClick={() => setDriverViewMode("list")}
                        className={`px-2 py-1 rounded text-xs font-medium transition-colors ${
                          driverViewMode === "list"
                            ? "bg-primary text-on-primary"
                            : "bg-surface-container text-on-surface-variant hover:bg-surface-container-high"
                        }`}
                        title="View as list"
                      >
                        List
                      </button>
                      <button
                        onClick={handleRefreshTrips}
                        className="px-2 py-1 rounded-lg bg-primary/10 text-primary hover:bg-primary/20 transition-colors font-medium text-sm"
                        title="Refresh assignments"
                      >
                        🔄
                      </button>
                    </>
                  )}
                </div>
              </div>
            </div>
            
            <div className="flex-1 overflow-y-auto sidebar-scroll">
              {(() => {
                // Filter by: status (fresh) AND driver_id (assigned to this driver)
                const isDriver = user?.role === "driver";
                const freshTrips = allTrips.filter(
                  t => (t.status === "pending" || t.status === "scheduled") &&
                       (isDriver ? t.driver_id === user?.username : true)  // Drivers: only their assigned trips; Dispatchers: all
                );
                
                // Show cards view with action buttons for drivers
                if (driverViewMode === "cards") {
                  return (
                    <DriverAssignments 
                      trips={freshTrips} 
                      driverId={user?.username || ""} 
                      onTripUpdated={loadTrips}
                    />
                  );
                }
                
                // Show list view (original)
                if (freshTrips.length === 0) {
                  return (
                    <div className="flex flex-col items-center justify-center h-full text-on-surface-variant">
                      <TruckIcon size={48} />
                      <p className="text-sm mt-4">No pending assignments</p>
                    </div>
                  );
                }
                
                return (
                  <div className="space-y-2 p-3">
                    {freshTrips.map((t, idx) => (
                      <button
                        key={t.id}
                        onClick={async () => {
                          try {
                            const fullTrip = await getTrip(t.id);
                            const fullRoute = fullTrip.route_id ? await getRoute(fullTrip.route_id) : null;
                            setTrip(fullTrip);
                            setRoute(fullRoute);
                            showToast(`Viewing Trip #${t.id}`, "success");
                          } catch (e) {
                            showToast("Failed to load trip", "error");
                          }
                        }}
                        className={`w-full text-left p-3 rounded-lg border-2 transition-all ${
                          trip?.id === t.id
                            ? "border-primary bg-primary bg-opacity-10"
                            : "border-outline-variant bg-surface-container hover:border-primary"
                        }`}
                      >
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <div className="font-medium text-sm text-on-surface">Trip #{t.id}</div>
                            <div className="text-xs text-on-surface-variant mt-1">
                              📍 {t.start_address?.substring(0, 30)}...
                            </div>
                            <div className="text-xs text-on-surface-variant">
                              🎯 {t.end_address?.substring(0, 30)}...
                            </div>
                            <div className="flex gap-2 mt-2">
                              <span className="inline-block px-2 py-1 rounded bg-primary bg-opacity-20 text-primary text-xs font-medium">
                                {t.status}
                              </span>
                              {t.volume_m3 && (
                                <span className="inline-block px-2 py-1 rounded bg-secondary bg-opacity-20 text-secondary text-xs">
                                  {t.volume_m3}m³
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>
                );
              })()}
            </div>
          </aside>

          {/* Main content - Map and trip details */}
          <main className="flex-1 flex flex-col overflow-hidden">
            {trip ? (
              <>
                {/* Map section */}
                <div className="relative flex-1 flex flex-col">
                  <MapView
                    route={route}
                    simState={!gpsMode ? sim.simState : "idle"}
                    simProgress={sim.progress}
                    truckPosition={activeTruckPosition}
                    animationPoints={sim.animationPoints}
                    currentPointIndex={sim.currentPointIndex}
                    currentLocation={gpsMode ? gps.gpsPosition : null}
                  />
                  <MapOverlay
                    simState={gpsMode ? (gps.gpsState === "active" ? "running" : "idle") : sim.simState}
                    progress={sim.progress}
                    remainingKm={gpsMode ? gps.remainingKm : sim.remainingKm}
                    destination={route?.resolved_end_address ?? trip?.end_address ?? ""}
                    trafficMsg={gpsMode ? gps.trafficMsg : sim.trafficMsg}
                    currentSpeed={gpsMode ? (gps.gpsSpeed ?? 0) : sim.currentSpeed}
                  />
                </div>

                {/* Trip info and controls */}
                <div className="border-t border-outline-variant bg-surface flex flex-col max-h-80 overflow-y-auto sidebar-scroll">
                  <div className="p-4 space-y-4">
                    {/* Trip Info */}
                    <div>
                      <h3 className="font-semibold text-on-surface mb-3">Trip #{trip.id}</h3>
                      <div className="space-y-2 text-sm">
                        <div>
                          <span className="text-on-surface-variant">From:</span>
                          <p className="text-on-surface font-medium">{trip.start_address}</p>
                        </div>
                        <div>
                          <span className="text-on-surface-variant">To:</span>
                          <p className="text-on-surface font-medium">{trip.end_address}</p>
                        </div>
                        <div className="grid grid-cols-2 gap-4 pt-2">
                          <div>
                            <span className="text-on-surface-variant text-xs">Status</span>
                            <p className="text-on-surface font-medium">{trip.status}</p>
                          </div>
                          <div>
                            <span className="text-on-surface-variant text-xs">Volume</span>
                            <p className="text-on-surface font-medium">{trip.volume_m3}m³</p>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Trip Management */}
                    <TripManagement
                      trip={trip}
                      onTripUpdated={(updated) => setTrip(updated)}
                    />

                    {/* Trip Event Log */}
                    <TripEventLog tripId={trip.id} />

                    {/* Simulation Controls */}
                    {route && (
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
                        onGpsModeChange={(on) => {
                          setGpsMode(on);
                          if (!on) gps.stop();
                        }}
                        gpsState={gps.gpsState}
                        gpsAccuracy={gps.gpsAccuracy}
                        gpsSpeed={gps.gpsSpeed}
                        gpsError={gps.gpsError}
                        gpsRemainingKm={gps.remainingKm}
                        gpsTrafficMsg={gps.trafficMsg}
                        onGpsStart={gps.start}
                        onGpsStop={gps.stop}
                      />
                    )}
                  </div>
                </div>
              </>
            ) : (
              <div className="flex items-center justify-center h-full">
                <div className="text-center space-y-3">
                  <TruckIcon size={80} />
                  <h2 className="text-xl font-medium text-on-surface">Select a Trip</h2>
                  <p className="text-sm text-on-surface-variant">
                    Choose from your assigned trips to see the route and details.
                  </p>
                </div>
              </div>
            )}
          </main>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen">
      <ToastContainer />

      {/* Top bar */}
      <header className="flex items-center h-14 px-5 bg-primary text-on-primary shadow-md z-30 flex-shrink-0">
        <span className="text-lg font-medium tracking-wide flex-1">RMC Delivery</span>
        {connected && liveTrip && (
          <div className="flex items-center gap-2 text-sm opacity-90">
            <div className="w-2 h-2 rounded-full bg-md-green animate-pulse" />
            Live Tracking
          </div>
        )}
        <div className="flex items-center gap-3 ml-6 pl-6 border-l border-on-primary border-opacity-30">
          <span className="text-sm font-medium">{user?.username}</span>
          <button
            onClick={() => {
              logout();
              router.push("/login");
            }}
            className="text-sm px-3 py-1 rounded hover:bg-on-primary hover:bg-opacity-20 transition-colors"
            title="Sign Out"
          >
            Sign Out
          </button>
        </div>
      </header>

      {/* Body */}
      <div className="flex flex-1 overflow-hidden">

        {/* Left nav */}
        <nav className="w-52 flex-shrink-0 bg-surface border-r border-outline-variant flex flex-col py-2 z-20">
          <NavItem id="dispatch" active={activeTab} label="Dispatch" onClick={setActiveTab}
            icon={<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="1" y="3" width="15" height="13" rx="2"/><path d="M16 8h4l3 5v3h-7V8z"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/></svg>}
          />
          <NavItem id="trip" active={activeTab} label="Live Trip" onClick={setActiveTab}
            badge={trip != null} badgePulse={liveTrip}
            icon={<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z"/><circle cx="12" cy="9" r="2.5"/></svg>}
          />
          <NavItem id="trips" active={activeTab} label="Trips" onClick={setActiveTab}
            icon={<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2"/><rect x="9" y="3" width="6" height="4" rx="1"/><path d="M9 12h6M9 16h4"/></svg>}
          />
          <NavItem id="plants" active={activeTab} label="Plants" onClick={setActiveTab}
            icon={<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 21h18"/><path d="M5 21V7l7-4 7 4v14"/><path d="M9 21v-4h6v4"/></svg>}
          />
        </nav>

        {/* Full-width panels: Trips & Plants (no map) */}
        {(activeTab === "trips" || activeTab === "plants") && (
          <div className="flex-1 overflow-y-auto sidebar-scroll bg-surface">
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
        )}

        {/* Truck Schedule Page - Full Width */}
        {showSchedulePage && (
          <TrucksSchedulePage
            trips={jobTrips}
            jobDetails={{
              jobSiteAddress: currentJobDetails?.jobSiteAddress,
              plantId: currentJobDetails?.plantId,
              plantName: currentJobDetails?.plantName,
              totalVolume: jobTrips.reduce((sum, t) => sum + (t.volume_m3 || 0), 0),
            }}
            onSelectTruck={handleSelectTruck}
            selectedTruckId={trip?.id}
          />
        )}

        {/* Dispatch / Live Trip — content sidebar + map */}
        {showMap && (
          <>
            {/* Content sidebar */}
            <aside className="w-[380px] flex-shrink-0 bg-surface border-r border-outline-variant flex flex-col overflow-hidden">
              <div className="flex-1 overflow-y-auto sidebar-scroll p-4 space-y-4">

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
                    
                    {/* Show all trucks for the current job */}
                    {currentJobDetails && (
                      <TruckStatusPanel
                        trips={allTrips}
                        highlightedTripId={viewedTrip?.id ?? trip?.id}
                        jobSiteAddress={currentJobDetails.jobSiteAddress}
                        plantId={currentJobDetails.plantId}
                        scheduledAt={currentJobDetails.scheduledAt}
                      />
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
              </div>
            </aside>

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

            {/* Map + info */}
            <main className="flex-1 flex flex-col overflow-hidden">
              <div className="relative" style={{ flex: "0 0 65%", minHeight: 0 }}>
                <MapView
                  route={route}
                  simState={!gpsMode ? sim.simState : "idle"}
                  simProgress={sim.progress}
                  truckPosition={activeTruckPosition}
                  animationPoints={sim.animationPoints}
                  currentPointIndex={sim.currentPointIndex}
                  currentLocation={gpsMode ? gps.gpsPosition : null}
                />
                {!route && (
                  <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-[400]">
                    <div className="text-center space-y-3 p-8 max-w-sm">
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
                <MapOverlay
                  simState={gpsMode ? (gps.gpsState === "active" ? "running" : "idle") : sim.simState}
                  progress={sim.progress}
                  remainingKm={gpsMode ? gps.remainingKm : sim.remainingKm}
                  destination={route?.resolved_end_address ?? ""}
                  trafficMsg={gpsMode ? gps.trafficMsg : sim.trafficMsg}
                  currentSpeed={gpsMode ? (gps.gpsSpeed ?? 0) : sim.currentSpeed}
                />
              </div>

              <div className="border-t border-outline-variant bg-surface overflow-y-auto sidebar-scroll"
                style={{ flex: "0 0 35%", minHeight: 0 }}>
                {route ? (
                  <InfoPanel route={route} simState={sim.simState} simProgress={sim.progress} />
                ) : trip ? (
                  <TripInfoPanel trip={trip} />
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
  );
}

/* Nav item */
function NavItem({
  id, active, label, icon, onClick, badge, badgePulse,
}: {
  id: ActiveTab; active: ActiveTab; label: string; icon: React.ReactNode;
  onClick: (id: ActiveTab) => void; badge?: boolean; badgePulse?: boolean;
}) {
  const isActive = id === active;
  return (
    <button
      onClick={() => onClick(id)}
      className={`flex items-center gap-3 px-4 py-3 text-sm font-medium w-full text-left transition-colors relative ${
        isActive
          ? "bg-primary/10 text-primary border-r-2 border-primary"
          : "text-on-surface-variant hover:bg-surface-container hover:text-on-surface"
      }`}
    >
      {icon}
      <span>{label}</span>
      {badge && (
        <span className={`ml-auto w-2 h-2 rounded-full bg-md-green ${badgePulse ? "animate-pulse" : ""}`} />
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
