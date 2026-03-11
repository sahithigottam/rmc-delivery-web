"use client";

import { useState } from "react";
import type { RouteResponse, SimState } from "@/types/route";

interface RouteFormProps {
  onEstimate: (form: RouteFormData) => Promise<void>;
  loading: boolean;
  route: RouteResponse | null;
  simState: SimState;
}

export interface RouteFormData {
  start: string;
  end: string;
  vehicle_type: string;
  vehicle_id: string;
  load_weight: string;
  priority: string;
  avoid: string[];
  request_alternatives: boolean;
  route_index: number;
}

const AVOID_OPTIONS = [
  { value: "tolls", label: "Tolls" },
  { value: "highways", label: "Highways" },
  { value: "ferries", label: "Ferries" },
];

const PRIORITY_OPTIONS = [
  { value: "economy", label: "Economy" },
  { value: "low", label: "Low" },
  { value: "normal", label: "Normal" },
  { value: "urgent", label: "Urgent" },
  { value: "high", label: "High" },
];

export default function RouteForm({
  onEstimate,
  loading,
  route,
  simState,
}: RouteFormProps) {
  const [form, setForm] = useState<RouteFormData>({
    start: "",
    end: "",
    vehicle_type: "rmc_truck",
    vehicle_id: "",
    load_weight: "",
    priority: "normal",
    avoid: [],
    request_alternatives: true,
    route_index: 0,
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onEstimate(form);
  };

  const toggleAvoid = (val: string) => {
    setForm((prev) => ({
      ...prev,
      avoid: prev.avoid.includes(val)
        ? prev.avoid.filter((a) => a !== val)
        : [...prev.avoid, val],
    }));
  };

  const disabled = loading || simState === "running" || simState === "paused";

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {/* Start */}
      <div>
        <label className="block text-xs font-medium text-on-surface-variant mb-1">
          Start Address
        </label>
        <input
          type="text"
          value={form.start}
          onChange={(e) => setForm({ ...form, start: e.target.value })}
          placeholder="e.g. Queen Street, Auckland"
          required
          disabled={disabled}
          className="w-full px-3 py-2.5 rounded-xl border border-outline-variant
                     bg-surface text-on-surface text-sm
                     focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20
                     disabled:opacity-50"
        />
      </div>

      {/* End */}
      <div>
        <label className="block text-xs font-medium text-on-surface-variant mb-1">
          Destination
        </label>
        <input
          type="text"
          value={form.end}
          onChange={(e) => setForm({ ...form, end: e.target.value })}
          placeholder="e.g. Hamilton City"
          required
          disabled={disabled}
          className="w-full px-3 py-2.5 rounded-xl border border-outline-variant
                     bg-surface text-on-surface text-sm
                     focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20
                     disabled:opacity-50"
        />
      </div>

      {/* Vehicle + Priority row */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-medium text-on-surface-variant mb-1">
            Vehicle Type
          </label>
          <select
            value={form.vehicle_type}
            onChange={(e) =>
              setForm({ ...form, vehicle_type: e.target.value })
            }
            disabled={disabled}
            className="w-full px-3 py-2.5 rounded-xl border border-outline-variant
                       bg-surface text-on-surface text-sm
                       focus:outline-none focus:border-primary"
          >
            <option value="rmc_truck">RMC Truck</option>
            <option value="van">Van</option>
            <option value="car">Car</option>
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-on-surface-variant mb-1">
            Priority
          </label>
          <select
            value={form.priority}
            onChange={(e) =>
              setForm({ ...form, priority: e.target.value })
            }
            disabled={disabled}
            className="w-full px-3 py-2.5 rounded-xl border border-outline-variant
                       bg-surface text-on-surface text-sm
                       focus:outline-none focus:border-primary"
          >
            {PRIORITY_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Vehicle ID + Weight */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-medium text-on-surface-variant mb-1">
            Vehicle ID
          </label>
          <input
            type="text"
            value={form.vehicle_id}
            onChange={(e) =>
              setForm({ ...form, vehicle_id: e.target.value })
            }
            placeholder="RMC-001"
            disabled={disabled}
            className="w-full px-3 py-2.5 rounded-xl border border-outline-variant
                       bg-surface text-on-surface text-sm
                       focus:outline-none focus:border-primary
                       disabled:opacity-50"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-on-surface-variant mb-1">
            Load (kg)
          </label>
          <input
            type="number"
            value={form.load_weight}
            onChange={(e) =>
              setForm({ ...form, load_weight: e.target.value })
            }
            placeholder="8000"
            disabled={disabled}
            className="w-full px-3 py-2.5 rounded-xl border border-outline-variant
                       bg-surface text-on-surface text-sm
                       focus:outline-none focus:border-primary
                       disabled:opacity-50"
          />
        </div>
      </div>

      {/* Avoid chips */}
      <div>
        <label className="block text-xs font-medium text-on-surface-variant mb-1.5">
          Avoid
        </label>
        <div className="flex gap-2 flex-wrap">
          {AVOID_OPTIONS.map((opt) => {
            const active = form.avoid.includes(opt.value);
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => toggleAvoid(opt.value)}
                disabled={disabled}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors
                  ${
                    active
                      ? "bg-primary-container text-primary border-primary/30"
                      : "bg-surface text-on-surface-variant border-outline-variant hover:bg-surface-container"
                  }
                  disabled:opacity-50`}
              >
                {active ? "✓ " : ""}
                {opt.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Alternatives toggle */}
      <label className="flex items-center gap-2 cursor-pointer">
        <input
          type="checkbox"
          checked={form.request_alternatives}
          onChange={(e) =>
            setForm({ ...form, request_alternatives: e.target.checked })
          }
          disabled={disabled}
          className="w-4 h-4 rounded border-outline-variant text-primary
                     focus:ring-primary/20"
        />
        <span className="text-sm text-on-surface-variant">
          Show alternative routes
        </span>
      </label>

      {/* Submit */}
      <button
        type="submit"
        disabled={disabled || !form.start || !form.end}
        className="w-full py-3 rounded-2xl bg-primary text-on-primary font-medium
                   text-sm shadow-md hover:shadow-lg transition-all
                   disabled:opacity-50 disabled:cursor-not-allowed
                   active:scale-[0.98]"
      >
        {loading ? (
          <span className="flex items-center justify-center gap-2">
            <svg
              className="animate-spin h-4 w-4"
              viewBox="0 0 24 24"
              fill="none"
            >
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
              />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
              />
            </svg>
            Calculating…
          </span>
        ) : (
          "🚚 Calculate Route"
        )}
      </button>
    </form>
  );
}
