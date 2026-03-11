"use client";

import dynamic from "next/dynamic";
import { useCallback, useState } from "react";
import { estimateRoute } from "@/lib/api";
import { useSimulation } from "@/hooks/useSimulation";
import RouteForm from "@/components/RouteForm";
import type { RouteFormData } from "@/components/RouteForm";
import RouteDetails from "@/components/RouteDetails";
import SimulationControls from "@/components/SimulationControls";
import type { RouteResponse } from "@/types/route";

/* Leaflet must not SSR (uses window/document) */
const MapView = dynamic(() => import("@/components/MapView"), { ssr: false });

export default function Home() {
  const [route, setRoute] = useState<RouteResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const sim = useSimulation(route);

  /* ── Estimate route ── */
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
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to calculate route");
      } finally {
        setLoading(false);
      }
    },
    []
  );

  /* ── Select route variant ── */
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
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load variant");
      } finally {
        setLoading(false);
      }
    },
    [route]
  );

  return (
    <div className="flex flex-col h-screen">
      {/* ── Top bar ── */}
      <header className="flex items-center h-14 px-5 bg-primary text-on-primary shadow-md z-20 flex-shrink-0">
        <span className="text-lg font-medium tracking-wide">
          🚚 RMC Delivery Route Optimizer
        </span>
      </header>

      {/* ── Body: sidebar + map ── */}
      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar */}
        <aside className="w-[400px] flex-shrink-0 bg-surface border-r border-outline-variant
                          flex flex-col overflow-hidden z-10">
          <div className="flex-1 overflow-y-auto sidebar-scroll p-4 space-y-5">
            {/* Route form */}
            <RouteForm
              onEstimate={handleEstimate}
              loading={loading}
              route={route}
              simState={sim.simState}
            />

            {/* Error */}
            {error && (
              <div className="px-3 py-2 rounded-xl bg-md-red/10 text-md-red text-sm">
                {error}
              </div>
            )}

            {/* Route details */}
            {route && (
              <RouteDetails
                route={route}
                onSelectVariant={handleSelectVariant}
              />
            )}
          </div>

          {/* Simulation controls — pinned at bottom */}
          {route && (
            <div className="border-t border-outline-variant p-4 bg-surface">
              <SimulationControls
                simState={sim.simState}
                progress={sim.progress}
                remainingKm={sim.remainingKm}
                trafficMsg={sim.trafficMsg}
                onToggle={sim.toggle}
                onStop={sim.stop}
              />
            </div>
          )}
        </aside>

        {/* Map */}
        <main className="flex-1 relative">
          <MapView
            route={route}
            simState={sim.simState}
            simProgress={sim.progress}
            truckPosition={sim.truckPosition}
            animationPoints={sim.animationPoints}
            currentPointIndex={sim.currentPointIndex}
          />
        </main>
      </div>
    </div>
  );
}
