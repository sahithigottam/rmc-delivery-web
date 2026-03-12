"use client";

import { useState } from "react";
import type { RouteResponse, SimState } from "@/types/route";
import AddressAutocomplete from "./AddressAutocomplete";
import TruckIcon from "./TruckIcon";

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
  { value: "economy", label: "Economy", hint: "Optimistic ETA" },
  { value: "normal", label: "Normal", hint: "Best guess ETA" },
  { value: "urgent", label: "Urgent", hint: "Worst-case ETA" },
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

  const [showAdvanced, setShowAdvanced] = useState(false);

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
      {/* ── Required: Start & End addresses ── */}
      <AddressAutocomplete
        label="Pickup / Plant"
        value={form.start}
        onChange={(value) => setForm({ ...form, start: value })}
        placeholder="e.g. Allied Concrete, Mt Wellington"
        disabled={disabled}
      />

      <AddressAutocomplete
        label="Delivery Site"
        value={form.end}
        onChange={(value) => setForm({ ...form, end: value })}
        placeholder="e.g. 42 Vogel Street, Ponsonby"
        disabled={disabled}
      />

      {/* ── Delivery urgency (maps to Google traffic_model) ── */}
      <div>
        <label className="block text-xs font-medium text-on-surface-variant mb-1.5">
          Delivery Urgency
        </label>
        <div className="grid grid-cols-3 gap-2">
          {PRIORITY_OPTIONS.map((o) => {
            const active = form.priority === o.value;
            return (
              <button
                key={o.value}
                type="button"
                onClick={() => setForm({ ...form, priority: o.value })}
                disabled={disabled}
                className={`px-3 py-2 rounded-xl text-xs font-medium border transition-all text-center
                  ${
                    active
                      ? "bg-primary text-on-primary border-primary shadow-sm"
                      : "bg-surface text-on-surface-variant border-outline-variant hover:bg-surface-container"
                  }
                  disabled:opacity-50`}
              >
                <div>{o.label}</div>
                <div className={`text-[10px] mt-0.5 ${active ? "text-on-primary/70" : "text-on-surface-variant/60"}`}>
                  {o.hint}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Avoid chips ── */}
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

      {/* ── Show alternatives toggle ── */}
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

      {/* ── Advanced / fleet metadata (collapsed by default) ── */}
      <button
        type="button"
        onClick={() => setShowAdvanced(!showAdvanced)}
        className="flex items-center gap-1.5 text-xs text-on-surface-variant/70
                   hover:text-on-surface-variant transition-colors"
      >
        <svg
          className={`w-3 h-3 transition-transform ${showAdvanced ? "rotate-90" : ""}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
        </svg>
        Fleet details (optional)
      </button>

      {showAdvanced && (
        <div className="space-y-3 pl-3 border-l-2 border-outline-variant/30">
          <p className="text-[10px] text-on-surface-variant/50">
            These fields are for fleet tracking only — they don't affect route calculation.
          </p>
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
        </div>
      )}

      {/* ── Submit ── */}
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
          <span className="flex items-center justify-center gap-2">
            <TruckIcon size={18} /> Calculate Route
          </span>
        )}
      </button>
    </form>
  );
}
