"use client";

import { useEffect, useState } from "react";
import { getBrands, getPlants, analyseBrand, dispatchTrip } from "@/lib/api";
import type {
  PlantOut,
  PlantPredictionResult,
  BrandAnalysisResponse,
  DispatchResponse,
} from "@/types/route";
import { showToast } from "./Toast";
import AddressAutocomplete from "./AddressAutocomplete";
import type { Suggestion } from "./AddressAutocomplete";

/*  Types  */
type Step = 1 | 3;   // Step 2 (analysis results) is now inline in Step 1
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
  const labels = ["Plan & Select Plant", "Schedule"];
  const steps = [1, 3] as Step[];
  const idx = steps.indexOf(current);
  return (
    <div className="flex items-center gap-1 mb-4">
      {steps.map((s, i) => (
        <div key={s} className="flex items-center">
          <div
            className={`w-6 h-6 rounded-full text-[11px] font-bold flex items-center justify-center transition-all ${
              current === s
                ? "bg-primary text-on-primary shadow-sm"
                : idx > i
                ? "bg-primary/20 text-primary"
                : "bg-surface-container text-on-surface-variant"
            }`}
          >
            {idx > i ? "✓" : i + 1}
          </div>
          {i < steps.length - 1 && (
            <div className={`h-0.5 w-7 mx-0.5 transition-all ${idx > i ? "bg-primary/40" : "bg-outline-variant"}`} />
          )}
        </div>
      ))}
      <span className="ml-2 text-xs text-on-surface-variant font-medium">{labels[idx]}</span>
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
  const [brandPlants, setBrandPlants] = useState<PlantOut[]>([]);
  const [loadingPlants, setLoadingPlants] = useState(false);
  // Analysis — runs automatically when brand + jobSite are set
  const [analysis, setAnalysis] = useState<BrandAnalysisResponse | null>(null);
  const [analysing, setAnalysing] = useState(false);
  // analysisKey tracks what the current analysis is for; if stale we re-run
  const [analysisKey, setAnalysisKey] = useState("");
  // User-chosen plant (optional — falls back to best from analysis)
  const [selectedPlantId, setSelectedPlantId] = useState<string | null>(null);
  // Multi-truck dispatch state
  const [numTrucks, setNumTrucks] = useState("1");
  const [totalQuantity, setTotalQuantity] = useState("6");
  const [dispatchDateTime, setDispatchDateTime] = useState("");
  const [pouringMechanism, setPouringMechanism] = useState("");
  const [simultaneousPourPoints, setSimultaneousPourPoints] = useState("");

  // Auto-select pouring configuration based on truck count
  useEffect(() => {
    const trucks = parseInt(numTrucks) || 1;
    const quantity = parseFloat(totalQuantity) || 6;
    
    // Auto-select mechanism
    let mechanism = "pump";
    let pourPoints = 1;
    
    if (trucks === 1) {
      mechanism = "pump";
      pourPoints = 1;
    } else if (trucks <= 3) {
      mechanism = "pump";
      pourPoints = 2;
    } else {
      mechanism = "boom";
      pourPoints = Math.min(3, Math.ceil(trucks / 2));
    }
    
    setPouringMechanism(mechanism);
    setSimultaneousPourPoints(String(pourPoints));
  }, [numTrucks]);

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

  // Load plants for selected brand (instant, no Google API)
  useEffect(() => {
    if (!brand) { setBrandPlants([]); setAnalysis(null); return; }
    setLoadingPlants(true);
    setSelectedPlantId(null);
    getPlants(brand)
      .then(setBrandPlants)
      .catch(() => setBrandPlants([]))
      .finally(() => setLoadingPlants(false));
    setAnalysis(null);
    setAnalysisKey("");
  }, [brand]);

  // Set a sensible default departure time when entering step 3
  useEffect(() => {
    if (step === 3 && !scheduledAt) {
      const NZT_OFFSET_MS = 12 * 60 * 60 * 1000;
      const d = new Date(Date.now() + NZT_OFFSET_MS + 30 * 60_000);
      const pad = (n: number) => String(n).padStart(2, "0");
      setScheduledAt(
        `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}T${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`
      );
    }
  }, [step, scheduledAt]);

  // Derive the effective selected plant (user pick OR algorithm best)
  const effectivePlant: PlantPredictionResult | null = (() => {
    if (analysis) {
      const pick = analysis.results.find(
        (r) => r.plant.id === (selectedPlantId ?? analysis.best_plant_id)
      );
      return pick ?? analysis.results[0] ?? null;
    }
    if (selectedPlantId) {
      const p = brandPlants.find((p) => p.id === selectedPlantId);
      if (p) return {
        plant: p,
        google_eta_minutes: undefined, adjusted_eta_minutes: undefined,
        remaining_life_minutes: undefined, risk_level: undefined,
        success_probability: undefined,
      };
    }
    return null;
  })();

  // Manual re-analyse trigger
  const handleAnalyse = async () => {
    if (!brand || !jobSiteData) { showToast("Select brand and job site first", "error"); return; }
    const key = `${brand}|${(jobSiteData as any).display_name ?? jobSite}|${mix}`;
    setAnalysisKey(key);
    setAnalysis(null);
    setAnalysing(true);
    try {
      const res = await analyseBrand({ brand, job_site_data: jobSiteData as unknown as Record<string, unknown>, concrete_mix: mix, top_n: 10, include_llm_analysis: false });
      setAnalysis(res);
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Analysis failed", "error");
    } finally {
      setAnalysing(false);
    }
  };

  const handleDispatch = async () => {
    if (!effectivePlant) { showToast("Select a brand and plant", "error"); return; }
    if (!jobSiteData) { showToast("Enter a job site address", "error"); return; }
    // Use dispatch datetime from Step 1 if available, otherwise scheduledAt from Step 3
    const finalDateTime = dispatchDateTime || scheduledAt;
    if (!finalDateTime) { showToast("Set a departure time", "error"); return; }
    setLoading(true);
    try {
      const numTrucksValue = numTrucks ? Number(numTrucks) : 1;
      const totalQtyValue = totalQuantity ? Number(totalQuantity) : 0;
      const perTruckQty = totalQtyValue / numTrucksValue;
      
      // For multi-truck dispatch: create separate trips for each driver in round-robin
      const drivers = ["driver1", "driver2", "driver3"];
      let lastResponse: any = null;
      
      for (let i = 0; i < numTrucksValue; i++) {
        const assignedDriver = drivers[i % drivers.length];
        const resp = await dispatchTrip({
          plant_id: effectivePlant.plant.id,
          job_site_address: jobSite,
          concrete_mix: mix,
          scheduled_at: new Date(finalDateTime + ":00+12:00").toISOString(),
          vehicle_id: vehicleId || undefined,
          volume_m3: perTruckQty,
          pour_duration_minutes: pourMin ? Number(pourMin) : undefined,
          num_trucks: 1,  // Each trip is for 1 truck
          total_quantity_m3: perTruckQty,
          pouring_mechanism: pouringMechanism,
          simultaneous_pour_points: 1,
          driver_id: assignedDriver,  // Assign to driver in round-robin
          prediction_snapshot: {
            google_eta_minutes: effectivePlant.google_eta_minutes,
            adjusted_eta_minutes: effectivePlant.adjusted_eta_minutes,
            remaining_life_minutes: effectivePlant.remaining_life_minutes,
            risk_level: effectivePlant.risk_level,
            success_probability: effectivePlant.success_probability,
          },
        });
        lastResponse = resp;
      }
      
      setDispatched(lastResponse);
      onDispatched(lastResponse);
      showToast(`✅ ${numTrucksValue} trips dispatched: driver1, driver2, driver3 assigned (round-robin)`, "success");
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Dispatch failed", "error");
    } finally {
      setLoading(false);
    }
  };

  const resetFlow = () => {
    setStep(1);
    setAnalysis(null);
    setAnalysisKey("");
    setSelectedPlantId(null);
    setDispatched(null);
    setScheduledAt("");
    setVehicleId("");
    setBrandPlants([]);
    setJobSiteData(null);
    setVolumeM3("6");
    setPourMin("");
    setNumTrucks("1");
    setTotalQuantity("6");
    setDispatchDateTime("");
    setPouringMechanism("pump");
    setSimultaneousPourPoints("1");
  };

  const concreteWindow = CONCRETE_WINDOWS[mix];

  /*  Success state  */
  if (dispatched) {
    const depDate = new Date(dispatched.scheduled_at).toLocaleString("en-NZ", {
      weekday: "short", day: "numeric", month: "short",
      hour: "2-digit", minute: "2-digit",
    });
    return (
      <div className="p-4 rounded-xl bg-surface-container space-y-4">
        <div className="flex items-center gap-2">
          <div className="w-10 h-10 rounded-full bg-emerald-100 flex items-center justify-center text-xl">✅</div>
          <div>
            <p className="font-semibold text-on-surface">Trip Scheduled</p>
            <p className="text-xs text-on-surface-variant">Pending driver departure</p>
          </div>
        </div>
        <div className="p-3 rounded-xl bg-primary/5 border border-primary/20 space-y-1 text-sm">
          <p className="font-medium text-on-surface">Trip #{dispatched.trip_id}</p>
          <p className="text-on-surface-variant">{dispatched.plant_name}</p>
          <p className="text-xs text-on-surface-variant">{dispatched.plant_address}</p>
          <p className="text-on-surface-variant pt-1">📍 {dispatched.job_site_address}</p>
          <div className="flex flex-wrap gap-3 pt-1 text-xs text-on-surface-variant">
            {dispatched.distance_meters && <span>📏 {(dispatched.distance_meters / 1000).toFixed(1)} km</span>}
            {dispatched.estimated_duration_minutes && <span>⏱ ~{Math.round(dispatched.estimated_duration_minutes)} min</span>}
            <span>🧱 {dispatched.concrete_mix}</span>
          </div>
          <p className="pt-1 text-xs font-medium text-on-surface">🕐 {depDate}</p>
        </div>
        <p className="text-xs text-on-surface-variant text-center">
          Route loaded on map. Go to <strong>Live Trip</strong> tab to begin when truck is loaded.
        </p>
        <button onClick={resetFlow}
          className="w-full py-2.5 rounded-xl border border-outline-variant text-sm font-medium hover:bg-surface-container-low transition-colors">
          + Schedule Another Delivery
        </button>
      </div>
    );
  }

  /*  Render  */
  return (
    <div className="space-y-1">
      <StepBar current={step} />

      {/*  Step 1: Plan + Plant picker  */}
      {step === 1 && (
        <div className="space-y-3">
          <h3 className="font-semibold text-on-surface">Plan Delivery</h3>

          {/* Brand */}
          <div className="space-y-1.5">
            <label className="text-[11px] font-semibold text-on-surface-variant tracking-wide">CONCRETE BRAND</label>
            <select value={brand} onChange={(e) => { setBrand(e.target.value); setSelectedPlantId(null); setAnalysis(null); setAnalysisKey(""); }}
              disabled={loadingBrands}
              className="w-full px-3 py-2.5 rounded-xl border border-outline-variant bg-surface text-sm focus:outline-none focus:border-primary transition-colors disabled:opacity-60">
              <option value="">{loadingBrands ? "Loading…" : "Select brand"}</option>
              {brands.map((b) => <option key={b} value={b}>{b}</option>)}
            </select>
          </div>

          {/* Plant — shown once brand is selected */}
          {brand && (
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="text-[11px] font-semibold text-on-surface-variant tracking-wide">PLANT</label>
                {analysis && !selectedPlantId && (
                  <span className="text-[10px] text-emerald-600 font-medium">★ algorithm pick</span>
                )}
              </div>
              <select
                value={selectedPlantId ?? ""}
                onChange={(e) => setSelectedPlantId(e.target.value || null)}
                disabled={loadingPlants}
                className="w-full px-3 py-2.5 rounded-xl border border-outline-variant bg-surface text-sm focus:outline-none focus:border-primary transition-colors disabled:opacity-60"
              >
                <option value="">
                  {loadingPlants ? "Loading plants…" : "N/A"}
                </option>
                {brandPlants.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </div>
          )}

          {/* Mix type */}
          <div className="space-y-1.5">
            <label className="text-[11px] font-semibold text-on-surface-variant tracking-wide">CONCRETE MIX</label>
            <div className="grid grid-cols-3 gap-2">
              {MIXES.map((m) => (
                <button key={m} onClick={() => { setMix(m); setAnalysis(null); setAnalysisKey(""); }}
                  className={`py-2 rounded-xl text-sm font-bold border transition-all ${
                    mix === m ? "bg-primary text-on-primary border-primary shadow-sm" : "border-outline-variant text-on-surface-variant hover:bg-surface-container"
                  }`}>
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
            onChange={(v) => { setJobSite(v); setJobSiteData(null); setAnalysis(null); setAnalysisKey(""); }}
            onSelect={(s) => setJobSiteData(s)}
            placeholder="e.g. 45 Queen Street, Auckland CBD"
            disabled={loading}
          />

          {/* Trucks & Quantity */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-[11px] font-semibold text-on-surface-variant tracking-wide">NUMBER OF TRUCKS</label>
              <input type="number" value={numTrucks} onChange={(e) => setNumTrucks(e.target.value)}
                placeholder="1" min="1" max="10" step="1"
                className="w-full px-3 py-2.5 rounded-xl border border-outline-variant bg-surface text-sm focus:outline-none focus:border-primary transition-colors" />
            </div>
            <div className="space-y-1.5">
              <label className="text-[11px] font-semibold text-on-surface-variant tracking-wide">CONCRETE QUANTITY (m³)</label>
              <input type="number" value={totalQuantity} onChange={(e) => setTotalQuantity(e.target.value)}
                placeholder="6.0" min="0.5" max="100" step="0.5"
                className="w-full px-3 py-2.5 rounded-xl border border-outline-variant bg-surface text-sm focus:outline-none focus:border-primary transition-colors" />
            </div>
          </div>

          {/* Dispatch Date & Time */}
          <div className="space-y-1.5">
            <label className="text-[11px] font-semibold text-on-surface-variant tracking-wide">DISPATCH DATE & TIME (NZST)</label>
            <input type="datetime-local" value={dispatchDateTime} onChange={(e) => setDispatchDateTime(e.target.value)}
              className="w-full px-3 py-2.5 rounded-xl border border-outline-variant bg-surface text-sm focus:outline-none focus:border-primary transition-colors" />
          </div>

          {/* Pouring Configuration — Auto-selected based on truck count */}
          <div className="p-2 rounded-lg bg-primary/5 border border-primary/20">
            <p className="text-[10px] font-semibold text-primary mb-2">🤖 POURING SETUP (Auto-selected • Editable)</p>
            
            <div className="space-y-1.5">
              <label className="text-[11px] font-semibold text-on-surface-variant tracking-wide">POURING MECHANISM</label>
              <select value={pouringMechanism} onChange={(e) => setPouringMechanism(e.target.value)}
                className="w-full px-3 py-2.5 rounded-xl border border-outline-variant bg-surface text-sm focus:outline-none focus:border-primary transition-colors">
                <option value="auto">Auto (System Decides)</option>
                <option value="pump">Concrete Pump</option>
                <option value="boom">Boom Truck</option>
                <option value="manual">Manual (Chute)</option>
                <option value="pipeline">Pipeline System</option>
              </select>
            </div>

            <div className="space-y-1.5">
              <label className="text-[11px] font-semibold text-on-surface-variant tracking-wide">SIMULTANEOUS POUR POINTS</label>
              <input type="number" value={simultaneousPourPoints} onChange={(e) => setSimultaneousPourPoints(e.target.value)}
                placeholder="1" min="1" max="5" step="1"
                disabled={pouringMechanism === "auto"}
                className="w-full px-3 py-2.5 rounded-xl border border-outline-variant bg-surface text-sm focus:outline-none focus:border-primary transition-colors disabled:opacity-60 disabled:cursor-not-allowed" />
              <p className="text-xs text-on-surface-variant">
                {pouringMechanism === "auto" 
                  ? "System will automatically optimize spacing based on truck count and quantity"
                  : parseInt(numTrucks) <= 1 ? "Single pour point for this delivery"
                  : parseInt(numTrucks) <= 3 ? "2 simultaneous pours recommended for efficient delivery"
                  : "Multiple pour points for parallel operations"}
              </p>
            </div>
          </div>

          {/* Analyse button */}
          {jobSiteData && brand && (
            <button onClick={handleAnalyse} disabled={analysing}
              className="w-full py-2.5 rounded-xl border border-primary text-primary font-semibold text-sm flex items-center justify-center gap-2 hover:bg-primary/5 transition-colors disabled:opacity-40">
              {analysing ? (
                <><Spinner /> Analysing…</>
              ) : analysis ? "↺ Re-analyse Plants" : "⚡ Analyse Plants"}
            </button>
          )}

          {/* Analysis results card */}
          {analysis && (() => {
            const best = analysis.results.find((r) => r.plant.id === analysis.best_plant_id);
            const shown = selectedPlantId
              ? analysis.results.find((r) => r.plant.id === selectedPlantId)
              : best;
            if (!shown) return null;
            return (
              <div className="p-3 rounded-xl bg-surface-container border border-outline-variant space-y-1.5">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs font-semibold text-on-surface">
                    {selectedPlantId ? shown.plant.name : `★ Best: ${shown.plant.name}`}
                  </p>
                  <RiskBadge level={shown.risk_level} />
                </div>
                <div className="flex flex-wrap gap-3 text-xs text-on-surface-variant">
                  {shown.google_eta_minutes != null && (
                    <span>⏱ ~{Math.round(shown.google_eta_minutes)} min drive</span>
                  )}
                  {shown.remaining_life_minutes != null && (
                    <span>🧱 {Math.round(shown.remaining_life_minutes)} min buffer</span>
                  )}
                  {shown.success_probability != null && (
                    <span>✅ {Math.round(shown.success_probability * 100)}% on-time</span>
                  )}
                </div>
                {shown.remaining_life_minutes != null && (
                  <LifeBar remaining={shown.remaining_life_minutes} total={concreteWindow} />
                )}
              </div>
            );
          })()}

          {/* CTA - Direct to trucks schedule */}
          <button
            onClick={handleDispatch}
            disabled={!jobSiteData || !brand || (!effectivePlant) || loading}
            className="w-full py-3 rounded-xl bg-primary text-on-primary font-semibold text-sm shadow-sm hover:shadow-md transition-all disabled:opacity-40 active:scale-[0.98]"
          >
            {loading ? (
              <span className="flex items-center justify-center gap-2"><Spinner /> Dispatching…</span>
            ) : effectivePlant ? (
              `📋 Show Truck Schedule →`
            ) : (
              "Select brand & job site to continue"
            )}
          </button>
        </div>
      )}

      {/* Step 3 removed - dispatch now goes directly to trucks schedule after plant selection */}}
    </div>
  );
}
