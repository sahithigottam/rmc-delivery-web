"use client";

import { useEffect, useState } from "react";
import { getBrands, analyseBrand, dispatchTrip } from "@/lib/api";
import type {
  PlantPredictionResult,
  BrandAnalysisResponse,
  DispatchResponse,
} from "@/types/route";
import { showToast } from "./Toast";
import AddressAutocomplete from "./AddressAutocomplete";
import type { Suggestion } from "./AddressAutocomplete";

/*  Types  */
type Step = 1 | 2 | 3;
const MIXES = ["GP", "HE", "RE"] as const;
type Mix = (typeof MIXES)[number];

const MIX_LABELS: Record<Mix, string> = {
  GP: "General Purpose (90 min)",
  HE: "High Early Strength (60 min)",
  RE: "Retarded / Extended (120 min)",
};

const CONCRETE_WINDOWS: Record<Mix, number> = { GP: 90, HE: 60, RE: 120 };

const RISK_STYLE: Record<string, string> = {
  low: "bg-emerald-100 text-emerald-700 border-emerald-200",
  medium: "bg-amber-100 text-amber-700 border-amber-200",
  high: "bg-orange-100 text-orange-700 border-orange-200",
  critical: "bg-red-100 text-red-700 border-red-200",
};

/*  Sub-components  */
function RiskBadge({ level }: { level?: string }) {
  if (!level) return null;
  const cls = RISK_STYLE[level.toLowerCase()] ?? "bg-gray-100 text-gray-600 border-gray-200";
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide border ${cls}`}>
      {level}
    </span>
  );
}

function LifeBar({ remaining, total }: { remaining: number; total: number }) {
  const pct = Math.max(0, Math.min(100, (remaining / total) * 100));
  const color = pct > 55 ? "bg-emerald-500" : pct > 25 ? "bg-amber-500" : "bg-red-500";
  return (
    <div className="flex items-center gap-2 mt-1">
      <div className="flex-1 h-1.5 rounded-full bg-outline-variant/40 overflow-hidden">
        <div className={`h-full rounded-full ${color} transition-all duration-300`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-[11px] font-semibold text-on-surface whitespace-nowrap">
        {Math.round(remaining)} min left
      </span>
    </div>
  );
}

function Spinner() {
  return (
    <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  );
}

function StepBar({ current }: { current: Step }) {
  const labels = ["Plan", "Select Plant", "Schedule"];
  return (
    <div className="flex items-center gap-1 mb-4">
      {([1, 2, 3] as Step[]).map((s) => (
        <div key={s} className="flex items-center">
          <div
            className={`w-6 h-6 rounded-full text-[11px] font-bold flex items-center justify-center transition-all ${
              current === s
                ? "bg-primary text-on-primary shadow-sm"
                : current > s
                ? "bg-primary/20 text-primary"
                : "bg-surface-container text-on-surface-variant"
            }`}
          >
            {current > s ? "✓" : s}
          </div>
          {s < 3 && (
            <div className={`h-0.5 w-7 mx-0.5 transition-all ${current > s ? "bg-primary/40" : "bg-outline-variant"}`} />
          )}
        </div>
      ))}
      <span className="ml-2 text-xs text-on-surface-variant font-medium">{labels[current - 1]}</span>
    </div>
  );
}

/*  Main Component  */
export interface DispatchPanelProps {
  onDispatched: (resp: DispatchResponse) => void;
}

export default function DispatchPanel({ onDispatched }: DispatchPanelProps) {
  const [step, setStep] = useState<Step>(1);
  const [brands, setBrands] = useState<string[]>([]);
  const [loadingBrands, setLoadingBrands] = useState(true);
  const [loading, setLoading] = useState(false);

  // Step 1 state
  const [brand, setBrand] = useState("");
  const [mix, setMix] = useState<Mix>("GP");
  const [jobSite, setJobSite] = useState("");
  const [jobSiteData, setJobSiteData] = useState<Suggestion | null>(null);

  // Step 2 state
  const [analysis, setAnalysis] = useState<BrandAnalysisResponse | null>(null);
  const [selected, setSelected] = useState<PlantPredictionResult | null>(null);

  // Step 3 state
  const [scheduledAt, setScheduledAt] = useState("");
  const [vehicleId, setVehicleId] = useState("");
  const [volumeM3, setVolumeM3] = useState("6");
  const [pourMin, setPourMin] = useState("");

  // Success state
  const [dispatched, setDispatched] = useState<DispatchResponse | null>(null);

  // Load brands on mount
  useEffect(() => {
    getBrands()
      .then(setBrands)
      .catch(() => {})
      .finally(() => setLoadingBrands(false));
  }, []);

  // Set a sensible default departure time when entering step 3
  useEffect(() => {
    if (step === 3 && !scheduledAt) {
      const d = new Date(Date.now() + 30 * 60_000);
      const pad = (n: number) => String(n).padStart(2, "0");
      setScheduledAt(
        `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
      );
    }
  }, [step, scheduledAt]);

  /*  Handlers  */
  const handleAnalyse = async () => {
    if (!brand) { showToast("Please select a brand", "error"); return; }
    if (!jobSite.trim() || !jobSiteData) { showToast("Please enter and select a job site address", "error"); return; }
    setLoading(true);
    try {
      const res = await analyseBrand({ brand, job_site_data: jobSiteData, concrete_mix: mix, top_n: 5 });
      setAnalysis(res);
      setStep(2);
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Analysis failed", "error");
    } finally {
      setLoading(false);
    }
  };

  const handleSelectPlant = (r: PlantPredictionResult) => {
    setSelected(r);
    setStep(3);
  };

  const handleDispatch = async () => {
    if (!selected || !scheduledAt) { showToast("Please set a departure date/time", "error"); return; }
    setLoading(true);
    try {
      const resp = await dispatchTrip({
        plant_id: selected.plant.id,
        job_site_address: jobSite,
        concrete_mix: mix,
        scheduled_at: new Date(scheduledAt).toISOString(),
        vehicle_id: vehicleId || undefined,
        volume_m3: volumeM3 ? Number(volumeM3) : undefined,
        pour_duration_minutes: pourMin ? Number(pourMin) : undefined,
        prediction_snapshot: {
          google_eta_minutes: selected.google_eta_minutes,
          adjusted_eta_minutes: selected.adjusted_eta_minutes,
          remaining_life_minutes: selected.remaining_life_minutes,
          risk_level: selected.risk_level,
          success_probability: selected.success_probability,
        },
      });
      setDispatched(resp);
      onDispatched(resp);
      showToast(` Trip #${resp.trip_id} scheduled`, "success");
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Dispatch failed", "error");
    } finally {
      setLoading(false);
    }
  };

  const resetFlow = () => {
    setStep(1);
    setAnalysis(null);
    setSelected(null);
    setDispatched(null);
    setScheduledAt("");
    setVehicleId("");
    setJobSiteData(null);
    setVolumeM3("6");
    setPourMin("");
  };

  /*  Success state  */
  if (dispatched) {
    const depDate = new Date(dispatched.scheduled_at).toLocaleString("en-NZ", {
      weekday: "short", day: "numeric", month: "short",
      hour: "2-digit", minute: "2-digit",
    });
    return (
      <div className="p-4 rounded-xl bg-surface-container space-y-4">
        <div className="flex items-center gap-2">
          <div className="w-10 h-10 rounded-full bg-emerald-100 flex items-center justify-center text-xl"></div>
          <div>
            <p className="font-semibold text-on-surface">Trip Scheduled</p>
            <p className="text-xs text-on-surface-variant">Pending driver departure</p>
          </div>
        </div>

        <div className="p-3 rounded-xl bg-primary/5 border border-primary/20 space-y-1 text-sm">
          <p className="font-medium text-on-surface">Trip #{dispatched.trip_id}</p>
          <p className="text-on-surface-variant">{dispatched.plant_name}</p>
          <p className="text-xs text-on-surface-variant">{dispatched.plant_address}</p>
          <p className="text-on-surface-variant pt-1"> {dispatched.job_site_address}</p>
          <div className="flex flex-wrap gap-3 pt-1 text-xs text-on-surface-variant">
            {dispatched.distance_meters && (
              <span> {(dispatched.distance_meters / 1000).toFixed(1)} km</span>
            )}
            {dispatched.estimated_duration_minutes && (
              <span> ~{Math.round(dispatched.estimated_duration_minutes)} min</span>
            )}
            <span> {dispatched.concrete_mix}</span>
          </div>
          <p className="pt-1 text-xs font-medium text-on-surface"> {depDate}</p>
        </div>

        <p className="text-xs text-on-surface-variant text-center">
          Route loaded on map. Go to the <strong>Live Trip</strong> tab to begin the trip when the truck is loaded.
        </p>

        <button
          onClick={resetFlow}
          className="w-full py-2.5 rounded-xl border border-outline-variant text-sm font-medium hover:bg-surface-container-low transition-colors"
        >
          + Schedule Another Delivery
        </button>
      </div>
    );
  }

  /*  Render  */
  const concreteWindow = CONCRETE_WINDOWS[mix];

  return (
    <div className="space-y-1">
      <StepBar current={step} />

      {/*  Step 1: Plan  */}
      {step === 1 && (
        <div className="space-y-3">
          <h3 className="font-semibold text-on-surface">Plan Delivery</h3>

          {/* Brand */}
          <div className="space-y-1.5">
            <label className="text-[11px] font-semibold text-on-surface-variant tracking-wide">CONCRETE BRAND</label>
            <select
              value={brand}
              onChange={(e) => setBrand(e.target.value)}
              disabled={loadingBrands}
              className="w-full px-3 py-2.5 rounded-xl border border-outline-variant bg-surface text-sm focus:outline-none focus:border-primary transition-colors disabled:opacity-60"
            >
              <option value="">{loadingBrands ? "Loading" : "Select brand"}</option>
              {brands.map((b) => (
                <option key={b} value={b}>{b}</option>
              ))}
            </select>
          </div>

          {/* Mix type */}
          <div className="space-y-1.5">
            <label className="text-[11px] font-semibold text-on-surface-variant tracking-wide">CONCRETE MIX</label>
            <div className="grid grid-cols-3 gap-2">
              {MIXES.map((m) => (
                <button
                  key={m}
                  onClick={() => setMix(m)}
                  className={`py-2 rounded-xl text-sm font-bold border transition-all ${
                    mix === m
                      ? "bg-primary text-on-primary border-primary shadow-sm"
                      : "border-outline-variant text-on-surface-variant hover:bg-surface-container"
                  }`}
                >
                  {m}
                </button>
              ))}
            </div>
            <p className="text-xs text-on-surface-variant">{MIX_LABELS[mix]}</p>
          </div>

          {/* Job site */}
          <AddressAutocomplete
            label="JOB SITE ADDRESS"
            value={jobSite}
            onChange={(v) => { setJobSite(v); setJobSiteData(null); }}
            onSelect={(s) => setJobSiteData(s)}
            placeholder="e.g. 45 Queen Street, Auckland CBD"
            disabled={loading}
          />

          <button
            onClick={handleAnalyse}
            disabled={loading || !brand || !jobSiteData}
            className="w-full py-3 rounded-xl bg-primary text-on-primary font-semibold text-sm shadow-sm hover:shadow-md transition-all disabled:opacity-40 active:scale-[0.98] flex items-center justify-center gap-2"
          >
            {loading ? <><Spinner /> Analysing plants</> : " Analyse Plants"}
          </button>
        </div>
      )}

      {/*  Step 2: Select plant  */}
      {step === 2 && analysis && (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setStep(1)}
              className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-surface-container text-on-surface-variant transition-colors"
            >
              ←
            </button>
            <div>
              <h3 className="font-semibold text-on-surface">{analysis.brand} Plants</h3>
              <p className="text-xs text-on-surface-variant">{analysis.total_plants_analysed} analysed  ranked by concrete life</p>
            </div>
          </div>

          <div className="space-y-2 max-h-[440px] overflow-y-auto pr-0.5 sidebar-scroll">
            {analysis.results.map((r) => {
              const isBest = r.plant.id === analysis.best_plant_id;
              return (
                <div
                  key={r.plant.id}
                  className={`p-3 rounded-xl border transition-colors ${
                    isBest
                      ? "border-emerald-300 bg-emerald-50/60"
                      : "border-outline-variant bg-surface-container"
                  }`}
                >
                  {/* Plant header */}
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="text-sm font-semibold text-on-surface">{r.plant.name}</span>
                        {isBest && (
                          <span className="px-1.5 py-0.5 rounded-full bg-emerald-500 text-white text-[9px] font-bold">BEST</span>
                        )}
                        <RiskBadge level={r.risk_level} />
                      </div>
                      <p className="text-xs text-on-surface-variant mt-0.5 truncate">{r.plant.address}</p>
                    </div>
                  </div>

                  {r.error ? (
                    <p className="text-xs text-md-red"> {r.error}</p>
                  ) : (
                    <>
                      {/* Metrics */}
                      <div className="grid grid-cols-3 gap-2 text-xs mb-2">
                        <div>
                          <p className="text-on-surface-variant">Google ETA</p>
                          <p className="font-semibold text-on-surface">
                            {r.google_eta_minutes != null ? `${Math.round(r.google_eta_minutes)} min` : "â€“"}
                          </p>
                        </div>
                        <div>
                          <p className="text-on-surface-variant">Adj. ETA</p>
                          <p className="font-semibold text-on-surface">
                            {r.adjusted_eta_minutes != null ? `${Math.round(r.adjusted_eta_minutes)} min` : "â€“"}
                          </p>
                        </div>
                        <div>
                          <p className="text-on-surface-variant">Success</p>
                          <p className="font-semibold text-on-surface">
                            {r.success_probability != null ? `${Math.round(r.success_probability * 100)}%` : "â€“"}
                          </p>
                        </div>
                      </div>

                      {/* Life bar */}
                      {r.remaining_life_minutes != null && (
                        <LifeBar remaining={r.remaining_life_minutes} total={concreteWindow} />
                      )}

                      {/* Recommendation */}
                      {r.recommendation && (
                        <p className="text-xs text-on-surface-variant italic border-t border-outline-variant/50 mt-2 pt-2">
                          {r.recommendation}
                        </p>
                      )}
                    </>
                  )}

                  <button
                    onClick={() => handleSelectPlant(r)}
                    disabled={!!r.error}
                    className="mt-2.5 w-full py-1.5 rounded-lg bg-primary text-on-primary text-xs font-semibold hover:shadow-sm transition-all disabled:opacity-40 active:scale-[0.98]"
                  >
                    Select This Plant 
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/*  Step 3: Schedule  */}
      {step === 3 && selected && (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setStep(2)}
              className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-surface-container text-on-surface-variant transition-colors"
            >
              ←
            </button>
            <h3 className="font-semibold text-on-surface">Schedule Delivery</h3>
          </div>

          {/* Selected plant summary */}
          <div className="p-3 rounded-xl bg-primary/5 border border-primary/20">
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-semibold text-on-surface">{selected.plant.name}</p>
              <RiskBadge level={selected.risk_level} />
            </div>
            <p className="text-xs text-on-surface-variant mt-0.5">{selected.plant.address}</p>
            <p className="text-xs text-on-surface-variant mt-1"> {jobSite}</p>
            <div className="flex gap-3 mt-1.5 text-xs text-on-surface-variant">
              {selected.adjusted_eta_minutes != null && (
                <span> ~{Math.round(selected.adjusted_eta_minutes)} min drive</span>
              )}
              {selected.remaining_life_minutes != null && (
                <span> {Math.round(selected.remaining_life_minutes)} min buffer</span>
              )}
            </div>
          </div>

          {/* Departure time */}
          <div className="space-y-1.5">
            <label className="text-[11px] font-semibold text-on-surface-variant tracking-wide">
              DEPARTURE DATE & TIME <span className="text-md-red">*</span>
            </label>
            <input
              type="datetime-local"
              value={scheduledAt}
              onChange={(e) => setScheduledAt(e.target.value)}
              className="w-full px-3 py-2.5 rounded-xl border border-outline-variant bg-surface text-sm focus:outline-none focus:border-primary transition-colors"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-[11px] font-semibold text-on-surface-variant tracking-wide">VOLUME (m)</label>
              <input
                type="number"
                value={volumeM3}
                onChange={(e) => setVolumeM3(e.target.value)}
                placeholder="6.0"
                min="0.5" max="20" step="0.5"
                className="w-full px-3 py-2.5 rounded-xl border border-outline-variant bg-surface text-sm focus:outline-none focus:border-primary transition-colors"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-[11px] font-semibold text-on-surface-variant tracking-wide">POUR DURATION (min)</label>
              <input
                type="number"
                value={pourMin}
                onChange={(e) => setPourMin(e.target.value)}
                placeholder="optional"
                min="1" max="240"
                className="w-full px-3 py-2.5 rounded-xl border border-outline-variant bg-surface text-sm focus:outline-none focus:border-primary transition-colors"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-[11px] font-semibold text-on-surface-variant tracking-wide">VEHICLE ID (optional)</label>
            <input
              type="text"
              value={vehicleId}
              onChange={(e) => setVehicleId(e.target.value)}
              placeholder="e.g. TRK-001"
              className="w-full px-3 py-2.5 rounded-xl border border-outline-variant bg-surface text-sm focus:outline-none focus:border-primary transition-colors"
            />
          </div>

          <button
            onClick={handleDispatch}
            disabled={loading || !scheduledAt}
            className="w-full py-3 rounded-xl bg-primary text-on-primary font-semibold text-sm shadow-sm hover:shadow-md transition-all disabled:opacity-40 active:scale-[0.98] flex items-center justify-center gap-2"
          >
            {loading ? <><Spinner /> Scheduling</> : " Confirm Dispatch"}
          </button>
        </div>
      )}
    </div>
  );
}
