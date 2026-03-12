"use client";

import { useState, useEffect } from "react";
import type { TripEventResponse } from "@/types/route";
import { getTripEvents } from "@/lib/api";

interface TripEventLogProps {
  tripId: number | null;
}

const EVENT_CONFIG: Record<string, { icon: string; color: string; label: string }> = {
  trip_started: { icon: "🚀", color: "text-md-green", label: "Trip Started" },
  trip_paused: { icon: "⏸", color: "text-md-yellow", label: "Paused" },
  trip_resumed: { icon: "▶", color: "text-md-green", label: "Resumed" },
  trip_completed: { icon: "✅", color: "text-blue-500", label: "Completed" },
  trip_cancelled: { icon: "✕", color: "text-md-red", label: "Cancelled" },
  position_update: { icon: "📍", color: "text-on-surface-variant", label: "Position Update" },
  traffic_check: { icon: "🚦", color: "text-on-surface-variant", label: "Traffic Check" },
  reroute_suggested: { icon: "💡", color: "text-md-yellow", label: "Reroute Suggested" },
  reroute_applied: { icon: "🔄", color: "text-primary", label: "Reroute Applied" },
  eta_updated: { icon: "⏱", color: "text-on-surface-variant", label: "ETA Updated" },
  delay_detected: { icon: "⚠️", color: "text-md-red", label: "Delay Detected" },
  delay_cleared: { icon: "✓", color: "text-md-green", label: "Delay Cleared" },
};

export default function TripEventLog({ tripId }: TripEventLogProps) {
  const [events, setEvents] = useState<TripEventResponse[]>([]);
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    if (!tripId) {
      setEvents([]);
      return;
    }

    setLoading(true);
    getTripEvents(tripId, 20)
      .then(setEvents)
      .catch((err) => console.error("Failed to load events:", err))
      .finally(() => setLoading(false));
  }, [tripId]);

  if (!tripId) return null;

  if (loading) {
    return (
      <div className="p-4 rounded-xl bg-surface-container text-center text-sm text-on-surface-variant">
        Loading events...
      </div>
    );
  }

  if (events.length === 0) {
    return (
      <div className="p-4 rounded-xl bg-surface-container text-center text-sm text-on-surface-variant">
        No events yet
      </div>
    );
  }

  const displayEvents = expanded ? events : events.slice(0, 5);

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-medium text-on-surface-variant">
          Trip Activity Log ({events.length} events)
        </h3>
        {events.length > 5 && (
          <button
            onClick={() => setExpanded(!expanded)}
            className="text-xs text-primary hover:underline"
          >
            {expanded ? "Show less" : "Show all"}
          </button>
        )}
      </div>

      <div className="rounded-xl bg-surface-container overflow-hidden max-h-[400px] overflow-y-auto">
        {displayEvents.map((event, index) => {
          const config = EVENT_CONFIG[event.event_type] || {
            icon: "•",
            color: "text-on-surface-variant",
            label: event.event_type,
          };

          return (
            <div
              key={event.id}
              className={`px-4 py-3 border-b border-outline-variant/30 last:border-0
                         hover:bg-surface-container-high transition-colors`}
            >
              <div className="flex items-start gap-3">
                <span className={`text-lg ${config.color} flex-shrink-0`}>
                  {config.icon}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-medium text-on-surface">
                      {config.label}
                    </span>
                    <span className="text-xs text-on-surface-variant flex-shrink-0">
                      {new Date(event.created_at).toLocaleTimeString([], {
                        hour: '2-digit',
                        minute: '2-digit',
                        second: '2-digit'
                      })}
                    </span>
                  </div>

                  {/* Event-specific data */}
                  {event.event_type === "reroute_suggested" && event.data.reason && (
                    <p className="text-xs text-on-surface-variant mt-0.5">
                      {event.data.reason}
                    </p>
                  )}
                  {event.event_type === "reroute_applied" && (
                    <p className="text-xs text-on-surface-variant mt-0.5">
                      Saved {((event.data.old_duration - event.data.new_duration) / 60).toFixed(0)} min
                    </p>
                  )}
                  {event.event_type === "delay_detected" && event.data.reason && (
                    <p className="text-xs text-md-red mt-0.5">
                      {event.data.reason}
                    </p>
                  )}
                  {event.event_type === "traffic_check" && event.data.condition && (
                    <p className="text-xs text-on-surface-variant mt-0.5">
                      Traffic: {event.data.condition}
                      {event.data.delay_seconds > 0 && ` (+${Math.round(event.data.delay_seconds / 60)}m)`}
                    </p>
                  )}

                  {/* Location if available */}
                  {event.lat && event.lng && (
                    <p className="text-xs text-on-surface-variant/60 mt-0.5 font-mono">
                      {event.lat.toFixed(4)}, {event.lng.toFixed(4)}
                    </p>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
