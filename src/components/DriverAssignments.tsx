'use client';

import { useState, useCallback } from 'react';
import type { TripResponse } from '@/types/route';
import {
  beginTrip,
  pauseTrip,
  completeTrip,
  cancelTrip,
  markTripDelayed,
  getTripEvents,
} from '@/lib/api';
import Toast from './Toast';

interface DriverAssignmentsProps {
  trips: TripResponse[];
  driverId: string;
  onTripUpdated?: () => void;
}

export default function DriverAssignments({
  trips,
  driverId,
  onTripUpdated,
}: DriverAssignmentsProps) {
  // Filter fresh assignments: pending status, assigned to this driver
  const freshTrips = trips.filter(
    (t) =>
      t.status === 'pending' &&
      (t.driver_id === driverId || t.driver_id === Number(driverId))
  );

  // State for managing actions
  const [startingId, setStartingId] = useState<number | null>(null);
  const [pausingId, setPausingId] = useState<number | null>(null);
  const [completingId, setCompletingId] = useState<number | null>(null);
  const [delayingId, setDelayingId] = useState<number | null>(null);
  const [cancelingId, setCancelingId] = useState<number | null>(null);

  // Confirmation states
  const [confirmStart, setConfirmStart] = useState<number | null>(null);
  const [confirmPause, setConfirmPause] = useState<number | null>(null);
  const [confirmComplete, setConfirmComplete] = useState<number | null>(null);
  const [confirmDelay, setConfirmDelay] = useState<number | null>(null);
  const [confirmCancel, setConfirmCancel] = useState<number | null>(null);

  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  const showToast = (message: string, type: 'success' | 'error' = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  const handleStart = useCallback(
    async (tripId: number) => {
      try {
        setStartingId(tripId);
        await beginTrip(tripId, { status: 'in_progress' });
        showToast(`Trip #${tripId} started`, 'success');
        setConfirmStart(null);
        onTripUpdated?.();
      } catch (error) {
        showToast(
          `Failed to start trip: ${error instanceof Error ? error.message : 'Unknown error'}`,
          'error'
        );
      } finally {
        setStartingId(null);
      }
    },
    [onTripUpdated]
  );

  const handlePause = useCallback(
    async (tripId: number) => {
      try {
        setPausingId(tripId);
        await pauseTrip(tripId);
        showToast(`Trip #${tripId} paused`, 'success');
        setConfirmPause(null);
        onTripUpdated?.();
      } catch (error) {
        showToast(
          `Failed to pause trip: ${error instanceof Error ? error.message : 'Unknown error'}`,
          'error'
        );
      } finally {
        setPausingId(null);
      }
    },
    [onTripUpdated]
  );

  const handleComplete = useCallback(
    async (tripId: number) => {
      try {
        setCompletingId(tripId);
        await completeTrip(tripId, { success: true });
        showToast(`Trip #${tripId} completed`, 'success');
        setConfirmComplete(null);
        onTripUpdated?.();
      } catch (error) {
        showToast(
          `Failed to complete trip: ${error instanceof Error ? error.message : 'Unknown error'}`,
          'error'
        );
      } finally {
        setCompletingId(null);
      }
    },
    [onTripUpdated]
  );

  const handleDelay = useCallback(
    async (tripId: number) => {
      try {
        setDelayingId(tripId);
        await markTripDelayed(tripId);
        showToast(`Trip #${tripId} marked delayed`, 'success');
        setConfirmDelay(null);
        onTripUpdated?.();
      } catch (error) {
        showToast(
          `Failed to mark trip delayed: ${error instanceof Error ? error.message : 'Unknown error'}`,
          'error'
        );
      } finally {
        setDelayingId(null);
      }
    },
    [onTripUpdated]
  );

  const handleCancel = useCallback(
    async (tripId: number) => {
      try {
        setCancelingId(tripId);
        await cancelTrip(tripId);
        showToast(`Trip #${tripId} cancelled`, 'success');
        setConfirmCancel(null);
        onTripUpdated?.();
      } catch (error) {
        showToast(
          `Failed to cancel trip: ${error instanceof Error ? error.message : 'Unknown error'}`,
          'error'
        );
      } finally {
        setCancelingId(null);
      }
    },
    [onTripUpdated]
  );

  if (freshTrips.length === 0) {
    return (
      <div className="p-6 text-center text-on-surface-variant">
        <p className="text-sm">No fresh assignments at this time</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-4">
        {freshTrips.map((trip) => (
          <div
            key={trip.id}
            className="border border-outline-variant rounded-lg p-4 bg-surface hover:bg-surface-container transition-colors"
          >
            {/* Trip Header */}
            <div className="flex justify-between items-start mb-3">
              <div>
                <div className="font-semibold text-lg">Trip #{trip.id}</div>
                <div className="text-xs text-on-surface-variant">
                  {trip.concrete_mix} · {trip.volume_cubic_meters}m³
                </div>
              </div>
              <div className="text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded-full">
                New Assignment
              </div>
            </div>

            {/* Route Info */}
            <div className="grid grid-cols-2 gap-2 mb-4 text-sm">
              <div>
                <div className="text-xs text-on-surface-variant">From</div>
                <div className="font-medium">{trip.from_location}</div>
              </div>
              <div>
                <div className="text-xs text-on-surface-variant">To</div>
                <div className="font-medium">{trip.to_location}</div>
              </div>
            </div>

            {/* Distance & Time */}
            <div className="grid grid-cols-2 gap-2 mb-4 text-xs text-on-surface-variant">
              <div>📍 {trip.distance_km?.toFixed(1)}km</div>
              <div>⏱️ ~{trip.estimated_duration_minutes}min</div>
            </div>

            {/* Action Buttons */}
            <div className="flex flex-wrap gap-2">
              {/* Start Button */}
              {!confirmStart && (
                <button
                  onClick={() => setConfirmStart(trip.id)}
                  disabled={startingId === trip.id}
                  className="px-3 py-1.5 rounded-lg text-xs font-medium text-blue-600 border border-blue-600/30 hover:bg-blue-600/5 transition-colors disabled:opacity-40"
                >
                  Start
                </button>
              )}
              {confirmStart === trip.id && (
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => handleStart(trip.id)}
                    disabled={startingId === trip.id}
                    className="px-2 py-1.5 rounded-lg text-xs font-medium bg-blue-600 text-white hover:opacity-80 disabled:opacity-40"
                  >
                    {startingId === trip.id ? '…' : 'Yes'}
                  </button>
                  <button
                    onClick={() => setConfirmStart(null)}
                    className="px-2 py-1.5 rounded-lg text-xs text-on-surface-variant border border-outline-variant hover:bg-surface-container"
                  >
                    No
                  </button>
                </div>
              )}

              {/* Pause Button */}
              {!confirmPause && (
                <button
                  onClick={() => setConfirmPause(trip.id)}
                  disabled={pausingId === trip.id}
                  className="px-3 py-1.5 rounded-lg text-xs font-medium text-amber-600 border border-amber-600/30 hover:bg-amber-600/5 transition-colors disabled:opacity-40"
                >
                  Pause
                </button>
              )}
              {confirmPause === trip.id && (
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => handlePause(trip.id)}
                    disabled={pausingId === trip.id}
                    className="px-2 py-1.5 rounded-lg text-xs font-medium bg-amber-600 text-white hover:opacity-80 disabled:opacity-40"
                  >
                    {pausingId === trip.id ? '…' : 'Yes'}
                  </button>
                  <button
                    onClick={() => setConfirmPause(null)}
                    className="px-2 py-1.5 rounded-lg text-xs text-on-surface-variant border border-outline-variant hover:bg-surface-container"
                  >
                    No
                  </button>
                </div>
              )}

              {/* Complete Button */}
              {!confirmComplete && (
                <button
                  onClick={() => setConfirmComplete(trip.id)}
                  disabled={completingId === trip.id}
                  className="px-3 py-1.5 rounded-lg text-xs font-medium text-emerald-600 border border-emerald-600/30 hover:bg-emerald-600/5 transition-colors disabled:opacity-40"
                >
                  Complete
                </button>
              )}
              {confirmComplete === trip.id && (
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => handleComplete(trip.id)}
                    disabled={completingId === trip.id}
                    className="px-2 py-1.5 rounded-lg text-xs font-medium bg-emerald-600 text-white hover:opacity-80 disabled:opacity-40"
                  >
                    {completingId === trip.id ? '…' : 'Yes'}
                  </button>
                  <button
                    onClick={() => setConfirmComplete(null)}
                    className="px-2 py-1.5 rounded-lg text-xs text-on-surface-variant border border-outline-variant hover:bg-surface-container"
                  >
                    No
                  </button>
                </div>
              )}

              {/* Delay Button */}
              {!confirmDelay && (
                <button
                  onClick={() => setConfirmDelay(trip.id)}
                  disabled={delayingId === trip.id}
                  className="px-3 py-1.5 rounded-lg text-xs font-medium text-orange-600 border border-orange-600/30 hover:bg-orange-600/5 transition-colors disabled:opacity-40"
                >
                  Delay
                </button>
              )}
              {confirmDelay === trip.id && (
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => handleDelay(trip.id)}
                    disabled={delayingId === trip.id}
                    className="px-2 py-1.5 rounded-lg text-xs font-medium bg-orange-600 text-white hover:opacity-80 disabled:opacity-40"
                  >
                    {delayingId === trip.id ? '…' : 'Yes'}
                  </button>
                  <button
                    onClick={() => setConfirmDelay(null)}
                    className="px-2 py-1.5 rounded-lg text-xs text-on-surface-variant border border-outline-variant hover:bg-surface-container"
                  >
                    No
                  </button>
                </div>
              )}

              {/* Cancel Button */}
              {!confirmCancel && (
                <button
                  onClick={() => setConfirmCancel(trip.id)}
                  disabled={cancelingId === trip.id}
                  className="px-3 py-1.5 rounded-lg text-xs font-medium text-md-red border border-md-red/30 hover:bg-md-red/5 transition-colors disabled:opacity-40"
                >
                  Reject
                </button>
              )}
              {confirmCancel === trip.id && (
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => handleCancel(trip.id)}
                    disabled={cancelingId === trip.id}
                    className="px-2 py-1.5 rounded-lg text-xs font-medium bg-md-red text-white hover:opacity-80 disabled:opacity-40"
                  >
                    {cancelingId === trip.id ? '…' : 'Yes'}
                  </button>
                  <button
                    onClick={() => setConfirmCancel(null)}
                    className="px-2 py-1.5 rounded-lg text-xs text-on-surface-variant border border-outline-variant hover:bg-surface-container"
                  >
                    No
                  </button>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Toast Notification */}
      {toast && (
        <Toast
          message={toast.message}
          type={toast.type}
          onClose={() => setToast(null)}
        />
      )}
    </div>
  );
}
