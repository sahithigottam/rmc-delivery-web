"use client";

import { useState } from "react";
import type { TripResponse } from "@/types/route";
import { beginTrip } from "@/lib/api";
import { showToast } from "./Toast";

interface TrucksSchedulePageProps {
  trips: TripResponse[];
  jobDetails: {
    jobSiteAddress?: string;
    plantId?: string;
    plantName?: string;
    totalVolume?: number;
  };
  onSelectTruck: (tripId: number) => void;
  selectedTruckId?: number;
}

function formatTime(dateStr?: string) {
  if (!dateStr) return "-";
  return new Date(dateStr).toLocaleTimeString("en-NZ", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });
}

function formatDate(dateStr?: string) {
  if (!dateStr) return "-";
  return new Date(dateStr).toLocaleDateString("en-NZ", {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
}

export default function TrucksSchedulePage({
  trips,
  jobDetails,
  onSelectTruck,
  selectedTruckId,
}: TrucksSchedulePageProps) {
  const [isDispatching, setIsDispatching] = useState(false);

  const handleDispatchTruck = async () => {
    if (trips.length === 0) return;
    
    const firstTruck = trips[0];
    setIsDispatching(true);
    
    try {
      // Call /trips/{id}/begin to activate the trip and trigger route calculation
      await beginTrip(firstTruck.id, {});
      // Then select the truck to load and display it
      onSelectTruck(firstTruck.id);
      showToast("Truck activated and route calculated", "success");
    } catch (error) {
      console.error("Failed to dispatch truck:", error);
      showToast(error instanceof Error ? error.message : "Failed to dispatch truck", "error");
    } finally {
      setIsDispatching(false);
    }
  };
  if (trips.length === 0) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center space-y-3 p-8">
          <div className="text-4xl">📋</div>
          <h3 className="font-semibold text-on-surface">No trucks scheduled</h3>
          <p className="text-sm text-on-surface-variant">Go to Dispatch to schedule a delivery</p>
        </div>
      </div>
    );
  }

  const totalVolume = trips.reduce((sum, t) => sum + (t.volume_m3 || 0), 0);
  const firstDeparture = trips.length > 0
    ? new Date(Math.min(...trips.map(t => new Date(t.scheduled_at || Date.now()).getTime())))
    : null;
  const lastArrival = trips.length > 0
    ? trips
        .filter(t => t.estimated_arrival)
        .reduce((latest, t) => {
          const eta = new Date(t.estimated_arrival!);
          return eta > latest ? eta : latest;
        }, new Date(0))
    : null;

  return (
    <div className="flex flex-col h-full bg-surface-container">
      {/* Header */}
      <div className="flex-shrink-0 p-4 border-b border-outline-variant bg-surface space-y-3">
        <h2 className="text-lg font-semibold text-on-surface">🚛 Trucks Schedule</h2>

        {/* Job Summary */}
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div className="p-2 rounded-lg bg-primary/5 border border-primary/20">
            <p className="text-on-surface-variant text-xs">Plant</p>
            <p className="font-semibold text-on-surface">{jobDetails.plantName || "-"}</p>
          </div>
          <div className="p-2 rounded-lg bg-primary/5 border border-primary/20">
            <p className="text-on-surface-variant text-xs">Total Volume</p>
            <p className="font-semibold text-on-surface">{totalVolume.toFixed(1)} m³</p>
          </div>
          <div className="p-2 rounded-lg bg-primary/5 border border-primary/20">
            <p className="text-on-surface-variant text-xs">First Depart</p>
            <p className="font-semibold text-on-surface">
              {firstDeparture ? formatTime(firstDeparture.toISOString()) : "-"}
            </p>
          </div>
          <div className="p-2 rounded-lg bg-primary/5 border border-primary/20">
            <p className="text-on-surface-variant text-xs">Last ETA</p>
            <p className="font-semibold text-on-surface">
              {lastArrival && lastArrival.getTime() > 0 ? formatTime(lastArrival.toISOString()) : "-"}
            </p>
          </div>
        </div>

        {/* Job Site */}
        <div className="p-2 rounded-lg bg-amber-50 border border-amber-200">
          <p className="text-xs text-amber-700 font-semibold">📍 Job Site</p>
          <p className="text-sm text-amber-900 leading-snug">{jobDetails.jobSiteAddress || "N/A"}</p>
        </div>
      </div>

      {/* Trucks Grid - Side by Side */}
      <div className="flex-1 overflow-y-auto sidebar-scroll">
        <div className="p-4">
          <div
            className="grid gap-4 mb-4"
            style={{ gridTemplateColumns: `repeat(${Math.min(trips.length, 3)}, 1fr)` }}
          >
            {trips.map((trip, idx) => {
              const isSelected = trip.id === selectedTruckId;
              const departTime = formatTime(trip.scheduled_at);

              return (
                <button
                  key={trip.id}
                  onClick={() => onSelectTruck(trip.id)}
                  className={`p-4 rounded-lg border-2 text-left transition-all ${
                    isSelected
                      ? "bg-primary/10 border-primary shadow-md"
                      : "bg-surface border-outline-variant hover:border-primary/50"
                  }`}
                >
                  {/* Truck Number + Status */}
                  <div className="flex items-center justify-between mb-3">
                    <div className="w-10 h-10 rounded-full bg-primary text-on-primary flex items-center justify-center font-bold">
                      {idx + 1}
                    </div>
                    <span className="text-xs px-2 py-1 rounded-full bg-primary/10 text-primary font-semibold">
                      Batch {idx + 1}
                    </span>
                  </div>

                  {/* Vehicle ID */}
                  <div className="mb-2">
                    <p className="text-xs text-on-surface-variant">Vehicle ID</p>
                    <p className="font-bold text-on-surface">
                      {trip.vehicle_id || `Truck ${idx + 1}`}
                    </p>
                  </div>

                  {/* Status Badge */}
                  <div className="mb-3 p-2 rounded-lg bg-amber-100 border border-amber-200">
                    <p className="text-xs font-semibold text-amber-700">
                      ⏳ {trip.status === "pending" ? "Pending Assignment" : trip.status}
                    </p>
                  </div>

                  {/* Departure Time */}
                  <div className="mb-2 border-t border-outline-variant/30 pt-3">
                    <p className="text-xs text-on-surface-variant">Depart (NZST)</p>
                    <p className="font-bold text-lg text-on-surface">{departTime}</p>
                  </div>

                  {/* Volume */}
                  <div>
                    <p className="text-xs text-on-surface-variant">Concrete</p>
                    <p className="font-bold text-on-surface">{trip.volume_m3 || "-"} m³</p>
                  </div>

                  {/* Selection Indicator */}
                  {isSelected && (
                    <div className="mt-3 p-2 rounded-lg bg-primary/10 border border-primary/30">
                      <p className="text-xs font-semibold text-primary text-center">✅ Selected</p>
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Dispatch Button */}
      <div className="flex-shrink-0 p-4 border-t border-outline-variant bg-surface-container space-y-2">
        <button
          onClick={handleDispatchTruck}
          disabled={trips.length === 0 || isDispatching}
          className="w-full py-3 px-4 rounded-lg bg-primary text-on-primary font-semibold hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {isDispatching ? "⏳ Dispatching..." : "🚀 Start Dispatching Trucks"}
        </button>
        <p className="text-xs text-on-surface-variant text-center">
          {isDispatching ? "Calculating route..." : "Click to activate first truck & calculate route"}
        </p>
      </div>
    </div>
  );
}
