"use client";

import { useCallback, useEffect, useState } from "react";
import {
  getPlants,
  createPlant,
  updatePlant,
  togglePlant,
  deletePlant,
} from "@/lib/api";
import type { PlantCreate, PlantOut, JobSite } from "@/types/route";
import { showToast } from "@/components/Toast";
import AddressAutocomplete from "@/components/AddressAutocomplete";
import type { Suggestion } from "@/components/AddressAutocomplete";

// ── Job-site localStorage helpers ─────────────────────────────────────────
const JS_KEY = "rmc_job_sites";
function readJobSites(): JobSite[] {
  try { return JSON.parse(localStorage.getItem(JS_KEY) ?? "[]"); } catch { return []; }
}
function writeJobSites(sites: JobSite[]) {
  localStorage.setItem(JS_KEY, JSON.stringify(sites));
}
function newId() {
  return Math.random().toString(36).slice(2, 10);
}

// ── Derive a rough region from lat/lng (Auckland NZ) ──────────────────────
function deriveRegion(lat: number, lng: number): string {
  if (lat > -36.75) return "north";
  if (lng < 174.65) return "west";
  if (lng > 174.90) return "east";
  if (lat < -36.95) return "south";
  return "central";
}

const BLANK: PlantCreate = {
  name: "", brand: "", address: "", lat: 0, lng: 0, region: "central", active: true,
};

// ── Plant Modal ───────────────────────────────────────────────────────────
function PlantModal({
  initial,
  existingBrands,
  onSave,
  onClose,
}: {
  initial: PlantCreate & { id?: string };
  existingBrands: string[];
  onSave: (data: PlantCreate, id?: string) => Promise<void>;
  onClose: () => void;
}) {
  const [form, setForm] = useState<PlantCreate>({ ...initial });
  const [saving, setSaving] = useState(false);
  const [brandMode, setBrandMode] = useState<"existing" | "new">(
    existingBrands.includes(initial.brand) ? "existing" : "new"
  );
  const [addressText, setAddressText] = useState(initial.address);

  const set = (k: keyof PlantCreate, v: string | number | boolean) =>
    setForm((f) => ({ ...f, [k]: v }));

  const handleAddressSelect = (s: Suggestion) => {
    const lat = parseFloat(s.lat);
    const lng = parseFloat(s.lon);
    setForm((f) => ({ ...f, address: s.display_name, lat, lng, region: deriveRegion(lat, lng) }));
    setAddressText(s.display_name);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name || !form.brand || !form.address) {
      showToast("Name, brand and address are required", "error"); return;
    }
    if (brandMode === "new" && existingBrands.map((b) => b.toLowerCase()).includes(form.brand.toLowerCase())) {
      showToast(`Brand "${form.brand}" already exists — use "Use existing" instead`, "error"); return;
    }
    if (!form.lat || !form.lng) {
      showToast("Please select an address from the dropdown to get coordinates", "error"); return;
    }
    setSaving(true);
    try { await onSave(form, initial.id); onClose(); } finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div role="dialog" aria-modal="true" aria-label={initial.id ? "Edit plant" : "Add plant"} className="bg-surface rounded-2xl shadow-xl w-full max-w-md mx-3 sm:mx-4 overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-outline-variant">
          <h2 className="font-semibold text-on-surface">{initial.id ? "Edit Plant" : "Add Plant"}</h2>
          <button onClick={onClose} aria-label="Close" className="px-3 -mr-3 text-on-surface-variant hover:text-on-surface text-xl leading-none">&times;</button>
        </div>
        <form onSubmit={handleSubmit} className="p-5 space-y-4 overflow-y-auto max-h-[80dvh]">
          <div>
            <label className="text-xs font-semibold text-on-surface-variant tracking-wide">PLANT NAME *</label>
            <input value={form.name} onChange={(e) => set("name", e.target.value)}
              className="mt-1 w-full px-3 py-2.5 rounded-xl border border-outline-variant bg-surface text-sm focus:outline-none focus:border-primary"
              placeholder="e.g. Holcim Avondale" />
          </div>
          <div>
            <label className="text-xs font-semibold text-on-surface-variant tracking-wide">BRAND *</label>
            <div className="flex gap-4 mt-2 mb-2">
              <label className="flex items-center gap-1.5 text-sm cursor-pointer">
                <input type="radio" name="brandMode" checked={brandMode === "existing"}
                  onChange={() => { setBrandMode("existing"); set("brand", existingBrands[0] ?? ""); }}
                  className="accent-primary" disabled={existingBrands.length === 0} />
                Use existing
              </label>
              <label className="flex items-center gap-1.5 text-sm cursor-pointer">
                <input type="radio" name="brandMode" checked={brandMode === "new"}
                  onChange={() => { setBrandMode("new"); set("brand", ""); }}
                  className="accent-primary" />
                New brand
              </label>
            </div>
            {brandMode === "existing" && existingBrands.length > 0 ? (
              <select value={form.brand} onChange={(e) => set("brand", e.target.value)}
                className="w-full px-3 py-2.5 rounded-xl border border-outline-variant bg-surface text-sm focus:outline-none focus:border-primary">
                <option value="">Select brand</option>
                {existingBrands.map((b) => <option key={b} value={b}>{b}</option>)}
              </select>
            ) : (
              <input value={form.brand} onChange={(e) => set("brand", e.target.value)}
                className="w-full px-3 py-2.5 rounded-xl border border-outline-variant bg-surface text-sm focus:outline-none focus:border-primary"
                placeholder="e.g. Holcim" />
            )}
          </div>
          <div>
            <AddressAutocomplete
              label="PLANT ADDRESS *"
              value={addressText}
              onChange={(v) => { setAddressText(v); setForm((f) => ({ ...f, address: v, lat: 0, lng: 0 })); }}
              onSelect={handleAddressSelect}
              placeholder="e.g. 54 Patiki Road, Avondale, Auckland"
            />
            {form.lat !== 0 && form.lng !== 0 && (
              <p className="mt-1 text-[11px] text-emerald-600 font-medium">
                ✓ Coordinates captured: {form.lat.toFixed(5)}, {form.lng.toFixed(5)}
              </p>
            )}
          </div>
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={form.active} onChange={(e) => set("active", e.target.checked)}
              className="accent-primary w-4 h-4" />
            <span className="text-sm text-on-surface">Active (visible in dispatch)</span>
          </label>
          <div className="flex justify-end gap-2 pt-1">
            <button type="button" onClick={onClose}
              className="px-4 py-2 rounded-xl text-sm text-on-surface-variant border border-outline-variant hover:bg-surface-container transition-colors">
              Cancel
            </button>
            <button type="submit" disabled={saving}
              className="px-4 py-2 rounded-xl text-sm font-medium bg-primary text-on-primary hover:opacity-90 transition-opacity disabled:opacity-40">
              {saving ? "Saving…" : initial.id ? "Save Changes" : "Add Plant"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Job Site Modal ────────────────────────────────────────────────────────
function JobSiteModal({
  initial,
  onSave,
  onClose,
}: {
  initial?: JobSite;
  onSave: (data: Omit<JobSite, "id" | "created_at">, id?: string) => void;
  onClose: () => void;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [address, setAddress] = useState(initial?.address ?? "");
  const [notes, setNotes] = useState(initial?.notes ?? "");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !address) { showToast("Name and address required", "error"); return; }
    onSave({ name, address, notes: notes || undefined }, initial?.id);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div role="dialog" aria-modal="true" aria-label={initial ? "Edit job site" : "Add job site"} className="bg-surface rounded-2xl shadow-xl w-full max-w-md mx-3 sm:mx-4 overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-outline-variant">
          <h2 className="font-semibold text-on-surface">{initial ? "Edit Job Site" : "Add Job Site"}</h2>
          <button onClick={onClose} aria-label="Close" className="px-3 -mr-3 text-on-surface-variant hover:text-on-surface text-xl leading-none">&times;</button>
        </div>
        <form onSubmit={handleSubmit} className="p-5 space-y-3 overflow-y-auto max-h-[80dvh]">
          <div>
            <label className="text-xs font-medium text-on-surface-variant">Label *</label>
            <input value={name} onChange={(e) => setName(e.target.value)}
              className="mt-1 w-full px-3 py-2 rounded-lg border border-outline-variant bg-surface text-sm focus:outline-none focus:border-primary"
              placeholder="Newmarket Countdown" />
          </div>
          <div>
            <label className="text-xs font-medium text-on-surface-variant">Address *</label>
            <input value={address} onChange={(e) => setAddress(e.target.value)}
              className="mt-1 w-full px-3 py-2 rounded-lg border border-outline-variant bg-surface text-sm focus:outline-none focus:border-primary"
              placeholder="2 Broadway, Newmarket, Auckland" />
          </div>
          <div>
            <label className="text-xs font-medium text-on-surface-variant">Notes</label>
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2}
              className="mt-1 w-full px-3 py-2 rounded-lg border border-outline-variant bg-surface text-sm focus:outline-none focus:border-primary resize-none"
              placeholder="Gate code, contact, etc." />
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <button type="button" onClick={onClose}
              className="px-4 py-2 rounded-lg text-sm text-on-surface-variant border border-outline-variant hover:bg-surface-container transition-colors">Cancel</button>
            <button type="submit"
              className="px-4 py-2 rounded-lg text-sm font-medium bg-primary text-on-primary hover:opacity-90 transition-opacity">
              {initial ? "Save Changes" : "Add Site"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Main Panel ────────────────────────────────────────────────────────────
export default function PlantsPanel() {
  const [plants, setPlants] = useState<PlantOut[]>([]);
  const [jobSites, setJobSites] = useState<JobSite[]>([]);
  const [loading, setLoading] = useState(true);
  const [plantModal, setPlantModal] = useState<(PlantCreate & { id?: string }) | null>(null);
  const [jobSiteModal, setJobSiteModal] = useState<JobSite | "new" | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<{ type: "plant" | "site"; id: string } | null>(null);
  const [brandFilter, setBrandFilter] = useState("all");
  const [showInactive, setShowInactive] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getPlants(undefined, undefined, false);
      setPlants(data);
    } catch {
      showToast("Failed to load plants", "error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
    setJobSites(readJobSites());
  }, [refresh]);

  const handleSavePlant = async (data: PlantCreate, id?: string) => {
    try {
      if (id) {
        const updated = await updatePlant(id, data);
        setPlants((prev) => prev.map((p) => (p.id === id ? updated : p)));
        showToast("Plant updated", "success");
      } else {
        const created = await createPlant(data);
        setPlants((prev) => [...prev, created]);
        showToast("Plant added", "success");
      }
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Save failed", "error");
      throw e;
    }
  };

  const handleToggle = async (plant: PlantOut) => {
    try {
      const updated = await togglePlant(plant.id, !plant.active);
      setPlants((prev) => prev.map((p) => (p.id === plant.id ? updated : p)));
      showToast(`${updated.name} ${updated.active ? "activated" : "deactivated"}`, "info");
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Toggle failed", "error");
    }
  };

  const handleDeletePlant = async (id: string) => {
    try {
      await deletePlant(id);
      setPlants((prev) => prev.filter((p) => p.id !== id));
      showToast("Plant deleted", "success");
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Delete failed", "error");
    } finally {
      setConfirmDelete(null);
    }
  };

  const handleSaveJobSite = (data: Omit<JobSite, "id" | "created_at">, id?: string) => {
    setJobSites((prev) => {
      let updated: JobSite[];
      if (id) {
        updated = prev.map((s) => s.id === id ? { ...s, ...data } : s);
        showToast("Job site updated", "success");
      } else {
        updated = [...prev, { ...data, id: newId(), created_at: new Date().toISOString() }];
        showToast("Job site added", "success");
      }
      writeJobSites(updated);
      return updated;
    });
  };

  const handleDeleteSite = (id: string) => {
    setJobSites((prev) => {
      const updated = prev.filter((s) => s.id !== id);
      writeJobSites(updated);
      return updated;
    });
    setConfirmDelete(null);
    showToast("Job site deleted", "success");
  };

  const brands = Array.from(new Set(plants.map((p) => p.brand))).sort();
  const visible = plants.filter((p) => {
    if (!showInactive && !p.active) return false;
    if (brandFilter !== "all" && p.brand !== brandFilter) return false;
    return true;
  });

  const renderToggle = (plant: PlantOut) => (
    <button role="switch" aria-checked={plant.active} aria-label={`${plant.name} active`} onClick={() => handleToggle(plant)}
      className={`relative w-9 h-5 rounded-full transition-colors before:absolute before:-inset-3.5 before:content-[''] ${plant.active ? "bg-primary" : "bg-outline-variant"}`}>
      <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${plant.active ? "translate-x-4" : "translate-x-0.5"}`} />
    </button>
  );

  return (
    <div className="max-w-6xl mx-auto px-3 sm:px-5 py-6 space-y-8">

      {/* ── Plants section ── */}
      <section>
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <div>
            <h1 className="text-lg font-semibold">Concrete Plants</h1>
            <p className="text-sm text-on-surface-variant">{plants.length} plants · {plants.filter((p) => p.active).length} active</p>
          </div>
          <button onClick={() => setPlantModal({ ...BLANK })}
            className="flex items-center gap-1.5 min-h-12 md:min-h-0 px-4 py-2 bg-primary text-on-primary text-sm font-medium rounded-xl hover:opacity-90 transition-opacity whitespace-nowrap">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M12 5v14M5 12h14" />
            </svg>
            Add Plant
          </button>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap gap-2 mb-4 items-center">
          <select value={brandFilter} onChange={(e) => setBrandFilter(e.target.value)}
            className="px-3 py-1.5 rounded-lg border border-outline-variant bg-surface text-sm focus:outline-none focus:border-primary">
            <option value="all">All brands</option>
            {brands.map((b) => <option key={b} value={b}>{b}</option>)}
          </select>
          <label className="flex items-center gap-1.5 min-h-12 md:min-h-0 text-sm text-on-surface-variant cursor-pointer ml-1">
            <input type="checkbox" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)}
              className="accent-primary w-3.5 h-3.5" />
            Show inactive
          </label>
          <button onClick={refresh} disabled={loading}
            className="ml-auto flex items-center gap-1 min-h-12 md:min-h-0 px-2 md:px-0 text-xs text-primary font-medium hover:opacity-70 disabled:opacity-40 transition-opacity">
            <svg className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M1 4v6h6M23 20v-6h-6" /><path d="M20.49 9A9 9 0 0 0 5.64 5.64L1 10m22 4-4.64 4.36A9 9 0 0 1 3.51 15" />
            </svg>
            Refresh
          </button>
        </div>

        {loading ? (
          <div className="flex justify-center py-12">
            <svg className="animate-spin h-7 w-7 text-primary" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
          </div>
        ) : visible.length === 0 ? (
          <div className="py-10 text-center text-sm text-on-surface-variant border border-outline-variant rounded-xl">
            No plants match your filters
          </div>
        ) : (
          <>
          <div className="md:hidden space-y-3">
            {visible.map((plant) => (
              <div key={plant.id} className={`rounded-xl border border-outline-variant p-3 space-y-2 ${!plant.active ? "opacity-60" : ""}`}>
                <div className="flex items-center justify-between gap-3">
                  <span className="font-medium text-on-surface [overflow-wrap:anywhere]">{plant.name}</span>
                  {renderToggle(plant)}
                </div>
                <span className="inline-block px-2 py-0.5 rounded-full bg-primary/10 text-primary text-[11px] font-semibold">{plant.brand}</span>
                <p className="text-sm text-on-surface-variant [overflow-wrap:anywhere]">{plant.address}</p>
                <div className="flex gap-2">
                  <button onClick={() => setPlantModal({ ...plant })}
                    className="flex-1 min-h-12 rounded-lg text-sm font-medium text-primary border border-primary/30 hover:bg-primary/5 transition-colors">Edit</button>
                  <button onClick={() => setConfirmDelete({ type: "plant", id: plant.id })}
                    className="flex-1 min-h-12 rounded-lg text-sm font-medium text-on-surface-variant border border-outline-variant hover:bg-surface-container transition-colors">Delete</button>
                </div>
              </div>
            ))}
          </div>
          <div className="hidden md:block rounded-xl border border-outline-variant overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-surface-container text-on-surface-variant uppercase text-[11px] tracking-wide">
                <tr>
                  <th className="px-4 py-3 text-left font-medium">Name</th>
                  <th className="px-4 py-3 text-left font-medium">Brand</th>
                  <th className="px-4 py-3 text-left font-medium hidden md:table-cell">Address</th>
                  <th className="px-4 py-3 text-center font-medium">Active</th>
                  <th className="px-4 py-3 text-right font-medium">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-outline-variant/50">
                {visible.map((plant) => (
                  <tr key={plant.id} className={`hover:bg-surface-container/50 transition-colors ${!plant.active ? "opacity-50" : ""}`}>
                    <td className="px-4 py-3 font-medium text-on-surface">{plant.name}</td>
                    <td className="px-4 py-3">
                      <span className="px-2 py-0.5 rounded-full bg-primary/10 text-primary text-[11px] font-semibold">{plant.brand}</span>
                    </td>
                    <td className="px-4 py-3 text-on-surface-variant hidden md:table-cell max-w-xs truncate">{plant.address}</td>
                    <td className="px-4 py-3 text-center">
                      {renderToggle(plant)}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1.5">
                        <button onClick={() => setPlantModal({ ...plant })}
                          className="px-2.5 py-1 rounded-lg text-xs font-medium text-primary border border-primary/30 hover:bg-primary/5 transition-colors">
                          Edit
                        </button>
                        <button onClick={() => setConfirmDelete({ type: "plant", id: plant.id })}
                          className="px-2.5 py-1 rounded-lg text-xs font-medium text-on-surface-variant border border-outline-variant hover:bg-surface-container transition-colors">
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          </>
        )}
      </section>

      {/* ── Job Sites section ── */}
      <section>
        <div className="flex items-center justify-between gap-3 mb-4">
          <div>
            <h2 className="text-lg font-semibold">Job Sites</h2>
            <p className="text-sm text-on-surface-variant">Saved delivery destinations · stored in this browser</p>
          </div>
          <button onClick={() => setJobSiteModal("new")}
            className="flex items-center gap-1.5 min-h-12 md:min-h-0 px-4 py-2 bg-primary text-on-primary text-sm font-medium rounded-xl hover:opacity-90 transition-opacity whitespace-nowrap">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M12 5v14M5 12h14" />
            </svg>
            Add Site
          </button>
        </div>

        {jobSites.length === 0 ? (
          <div className="py-10 text-center text-sm text-on-surface-variant border border-outline-variant rounded-xl">
            No job sites saved yet. Add one to quickly reuse delivery addresses.
          </div>
        ) : (
          <>
          <div className="md:hidden space-y-3">
            {jobSites.map((site) => (
              <div key={site.id} className="rounded-xl border border-outline-variant p-3 space-y-2">
                <p className="font-medium text-on-surface [overflow-wrap:anywhere]">{site.name}</p>
                <p className="text-sm text-on-surface-variant [overflow-wrap:anywhere]">{site.address}</p>
                {site.notes && <p className="text-xs text-on-surface-variant [overflow-wrap:anywhere]">{site.notes}</p>}
                <div className="flex gap-2">
                  <button onClick={() => setJobSiteModal(site)}
                    className="flex-1 min-h-12 rounded-lg text-sm font-medium text-primary border border-primary/30 hover:bg-primary/5 transition-colors">Edit</button>
                  <button onClick={() => setConfirmDelete({ type: "site", id: site.id })}
                    className="flex-1 min-h-12 rounded-lg text-sm font-medium text-on-surface-variant border border-outline-variant hover:bg-surface-container transition-colors">Delete</button>
                </div>
              </div>
            ))}
          </div>
          <div className="hidden md:block rounded-xl border border-outline-variant overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-surface-container text-on-surface-variant uppercase text-[11px] tracking-wide">
                <tr>
                  <th className="px-4 py-3 text-left font-medium">Label</th>
                  <th className="px-4 py-3 text-left font-medium">Address</th>
                  <th className="px-4 py-3 text-left font-medium hidden md:table-cell">Notes</th>
                  <th className="px-4 py-3 text-right font-medium">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-outline-variant/50">
                {jobSites.map((site) => (
                  <tr key={site.id} className="hover:bg-surface-container/50 transition-colors">
                    <td className="px-4 py-3 font-medium text-on-surface">{site.name}</td>
                    <td className="px-4 py-3 text-on-surface-variant max-w-xs truncate">{site.address}</td>
                    <td className="px-4 py-3 text-on-surface-variant hidden md:table-cell text-xs">{site.notes ?? "—"}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1.5">
                        <button onClick={() => setJobSiteModal(site)}
                          className="px-2.5 py-1 rounded-lg text-xs font-medium text-primary border border-primary/30 hover:bg-primary/5 transition-colors">Edit</button>
                        <button onClick={() => setConfirmDelete({ type: "site", id: site.id })}
                          className="px-2.5 py-1 rounded-lg text-xs font-medium text-on-surface-variant border border-outline-variant hover:bg-surface-container transition-colors">Delete</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          </>
        )}
      </section>

      {/* ── Modals ── */}
      {plantModal && (
        <PlantModal
          initial={plantModal}
          existingBrands={brands}
          onSave={handleSavePlant}
          onClose={() => setPlantModal(null)}
        />
      )}
      {jobSiteModal && (
        <JobSiteModal
          initial={jobSiteModal === "new" ? undefined : jobSiteModal}
          onSave={handleSaveJobSite}
          onClose={() => setJobSiteModal(null)}
        />
      )}
      {confirmDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div role="dialog" aria-modal="true" aria-label="Confirm delete" className="bg-surface rounded-2xl shadow-xl w-full max-w-sm mx-3 sm:mx-4 p-5 space-y-4">
            <p className="text-sm text-on-surface">
              Delete this {confirmDelete.type === "plant" ? "plant" : "job site"}? This cannot be undone.
            </p>
            <div className="flex justify-end gap-2">
              <button onClick={() => setConfirmDelete(null)}
                className="px-4 py-2 rounded-lg text-sm text-on-surface-variant border border-outline-variant hover:bg-surface-container transition-colors">Cancel</button>
              <button
                onClick={() => confirmDelete.type === "plant"
                  ? handleDeletePlant(confirmDelete.id)
                  : handleDeleteSite(confirmDelete.id)}
                className="px-4 py-2 rounded-lg text-sm font-medium bg-red-600 text-white hover:opacity-80 transition-opacity">
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
