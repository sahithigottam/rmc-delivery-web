"use client";

import type { RouteResponse, AlternativeSummary } from "@/types/route";

interface RouteDetailsProps {
  route: RouteResponse;
  onSelectVariant: (index: number) => void;
}

function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.round((seconds % 3600) / 60);
  return h > 0 ? `${h}h ${m}m` : `${m} min`;
}

function formatDistance(meters: number): string {
  return (meters / 1000).toFixed(1) + " km";
}

export default function RouteDetails({
  route,
  onSelectVariant,
}: RouteDetailsProps) {
  const traffic = route.traffic_delay_seconds ?? 0;

  return (
    <div className="space-y-4">
      {/* Summary card */}
      <div className="rounded-xl bg-surface-container p-4 space-y-3">
        <div className="flex items-start gap-3">
          <div className="flex flex-col items-center gap-0.5 pt-1">
            <div className="w-2.5 h-2.5 rounded-full bg-md-blue" />
            <div className="w-0.5 h-8 bg-outline-variant" />
            <div className="w-2.5 h-2.5 rounded-full bg-md-red" />
          </div>
          <div className="flex-1 min-w-0 space-y-2">
            <div>
              <p className="text-[11px] text-on-surface-variant">FROM</p>
              <p className="text-sm text-on-surface font-medium truncate">
                {route.resolved_start_address}
              </p>
            </div>
            <div>
              <p className="text-[11px] text-on-surface-variant">TO</p>
              <p className="text-sm text-on-surface font-medium truncate">
                {route.resolved_end_address}
              </p>
            </div>
          </div>
        </div>

        {/* Metric pills */}
        <div className="grid grid-cols-3 gap-2">
          <MetricPill
            label="Distance"
            value={formatDistance(route.distance_meters)}
          />
          <MetricPill
            label="Duration"
            value={formatDuration(route.duration_seconds)}
          />
          <MetricPill
            label="Traffic"
            value={
              traffic > 0
                ? `+${formatDuration(traffic)}`
                : "Clear"
            }
            color={traffic > 300 ? "text-md-red" : "text-md-green"}
          />
        </div>

        {/* Delivery limit warning */}
        {route.exceeds_delivery_limit && (
          <div className="px-3 py-2 rounded-lg bg-md-red/10 text-md-red text-xs font-medium">
            ⚠️ Exceeds delivery limit by {route.delivery_limit_exceeded_by} min
          </div>
        )}

        {/* Vehicle info */}
        <div className="flex flex-wrap gap-2 text-xs text-on-surface-variant">
          <span className="px-2 py-1 rounded-md bg-surface-container-low border border-outline-variant">
            🚛 {route.vehicle_type}
          </span>
          {route.vehicle_id && (
            <span className="px-2 py-1 rounded-md bg-surface-container-low border border-outline-variant">
              ID: {route.vehicle_id}
            </span>
          )}
          <span className="px-2 py-1 rounded-md bg-surface-container-low border border-outline-variant">
            ⚡ {route.priority}
          </span>
          {route.load_weight && (
            <span className="px-2 py-1 rounded-md bg-surface-container-low border border-outline-variant">
              📦 {route.load_weight} kg
            </span>
          )}
        </div>
      </div>

      {/* Route variants */}
      {route.alternatives_summary && route.alternatives_summary.length > 1 && (
        <div className="space-y-2">
          <p className="text-xs font-medium text-on-surface-variant">
            Route Variants ({route.alternatives_summary.length})
          </p>
          {route.alternatives_summary.map((alt: AlternativeSummary) => {
            const active = alt.index === route.selected_route_index;
            return (
              <button
                key={alt.index}
                onClick={() => onSelectVariant(alt.index)}
                className={`w-full text-left px-3 py-2.5 rounded-xl border text-sm transition-colors
                  ${
                    active
                      ? "border-primary bg-primary-container/50 text-primary"
                      : "border-outline-variant bg-surface text-on-surface hover:bg-surface-container"
                  }`}
              >
                <span className="font-medium">
                  {active ? "✓ " : ""}
                  {alt.summary}
                </span>
                <span className="block text-xs text-on-surface-variant mt-0.5">
                  {alt.distance_km.toFixed(1)} km · {Math.round(alt.duration_mins)} min
                </span>
              </button>
            );
          })}
        </div>
      )}

      {/* Direction steps */}
      {route.route_steps && route.route_steps.length > 0 && (
        <div className="space-y-1">
          <p className="text-xs font-medium text-on-surface-variant mb-2">
            Directions ({route.route_steps.length} steps)
          </p>
          <div className="max-h-[300px] overflow-y-auto space-y-1 pr-1">
            {route.route_steps.map((step, i) => (
              <div
                key={i}
                className="flex gap-3 items-start py-2 px-2 rounded-lg
                           hover:bg-surface-container transition-colors"
              >
                <span className="flex-shrink-0 w-6 h-6 rounded-full bg-primary-container
                                text-primary text-xs font-medium flex items-center
                                justify-center mt-0.5">
                  {i + 1}
                </span>
                <div className="flex-1 min-w-0">
                  <p
                    className="text-sm text-on-surface"
                    dangerouslySetInnerHTML={{ __html: step.instruction }}
                  />
                  <p className="text-xs text-on-surface-variant mt-0.5">
                    {formatDistance(step.distance_meters)} ·{" "}
                    {formatDuration(step.duration_seconds)}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function MetricPill({
  label,
  value,
  color,
}: {
  label: string;
  value: string;
  color?: string;
}) {
  return (
    <div className="rounded-lg bg-surface-container-low px-3 py-2 text-center">
      <p className="text-[11px] text-on-surface-variant">{label}</p>
      <p className={`text-sm font-medium ${color ?? "text-on-surface"}`}>
        {value}
      </p>
    </div>
  );
}
