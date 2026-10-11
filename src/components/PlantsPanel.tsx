"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { getBrands, getPlants, getRegions, getCountries, getStates, getCities, isVersionConflict, setPlantActive } from "@/lib/api";
import type { Brand, JobSite, PlantOut, Region } from "@/types/route";
import { showToast } from "@/components/Toast";
import PlantFormModal from "@/components/PlantFormModal";
import GeographyPanel from "@/components/GeographyPanel";
import type { GeographyCatalogue } from "@/components/GeographySelectors";

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
export default function PlantsPanel(props: {
  canManage: boolean;
  organizationId?: string;
  showJobSites?: boolean;
  catalogueRevision?: number;
}) {
  return <ScopedPlantsPanel key={props.organizationId ?? "global"} {...props} />;
}

function ScopedPlantsPanel({
  canManage,
  organizationId,
  showJobSites = true,
  catalogueRevision = 0,
}: {
  canManage: boolean;
  organizationId?: string;
  showJobSites?: boolean;
  catalogueRevision?: number;
}) {
  const [plants, setPlants] = useState<PlantOut[]>([]);
  const [brandList, setBrandList] = useState<Brand[]>([]);
  const [regions, setRegions] = useState<Region[]>([]);
  const [geography, setGeography] = useState<GeographyCatalogue>({ countries: [], states: [], cities: [], regions: [] });
  const [loadError, setLoadError] = useState("");
  const [catalogueReady, setCatalogueReady] = useState(false);
  const [jobSites, setJobSites] = useState<JobSite[]>([]);
  const [loading, setLoading] = useState(true);
  // undefined = closed, null = adding, PlantOut = editing
  const [plantModal, setPlantModal] = useState<PlantOut | null | undefined>(undefined);
  const [jobSiteModal, setJobSiteModal] = useState<JobSite | "new" | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<{ type: "site"; id: string } | null>(null);
  const [confirmDeactivate, setConfirmDeactivate] = useState<PlantOut | null>(null);
  const [brandFilter, setBrandFilter] = useState("all");
  const [regionFilter, setRegionFilter] = useState("all");
  const [showInactive, setShowInactive] = useState(true);
  const requestGeneration = useRef(0);

  const refresh = useCallback(async () => {
    const generation = ++requestGeneration.current;
    setLoading(true);
    setLoadError("");
    try {
      const [p, b, r, countries, states, cities] = await Promise.all([
        getPlants({ organizationId, activeOnly: false }), getBrands(organizationId), getRegions(undefined, organizationId),
        getCountries(organizationId), getStates(undefined, organizationId), getCities(undefined, organizationId),
      ]);
      if (generation !== requestGeneration.current) return false;
      setPlants(p);
      setBrandList(b);
      setRegions(r);
      setGeography({ countries, states, cities, regions: r });
      setCatalogueReady(true);
      return true;
    } catch (e) {
      if (generation !== requestGeneration.current) return false;
      setLoadError(e instanceof Error ? e.message : "Failed to load catalogue");
      return false;
    } finally {
      if (generation === requestGeneration.current) setLoading(false);
    }
  }, [organizationId]);

  const openPlantForm = async (plant: PlantOut | null) => {
    if (await refresh()) setPlantModal(plant);
  };

  useEffect(() => {
    refresh();
    setJobSites(readJobSites());
    return () => { requestGeneration.current++; };
  }, [refresh, catalogueRevision]);

  const handleSaved = (saved: PlantOut) => {
    setPlants((prev) =>
      prev.some((p) => p.id === saved.id) ? prev.map((p) => (p.id === saved.id ? saved : p)) : [...prev, saved],
    );
  };

  const handleToggle = async (plant: PlantOut) => {
    try {
      const updated = await setPlantActive(plant, !plant.active);
      handleSaved(updated);
      showToast(`${updated.name} ${updated.active ? "activated" : "deactivated"}`, "info");
    } catch (e) {
      if (isVersionConflict(e)) {
        showToast(`${plant.name} was changed by someone else. Reloaded the latest — please try again.`, "error");
        void refresh();
      } else {
        showToast(e instanceof Error ? e.message : "Update failed", "error");
      }
    } finally {
      setConfirmDeactivate(null);
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

  const brandName = (id: string) => brandList.find((b) => b.id === id)?.name ?? id;
  const regionLabel = (id: string | null) => (id ? regions.find((r) => r.id === id)?.name ?? id : "—");
  const brandIds = Array.from(new Set([...brandList.map((b) => b.id), ...plants.map((p) => p.brand_id)]))
    .sort((a, b) => brandName(a).localeCompare(brandName(b)));
  const visible = plants.filter((p) => {
    if (!showInactive && !p.active) return false;
    if (brandFilter !== "all" && p.brand_id !== brandFilter) return false;
    if (regionFilter !== "all" && p.region_id !== regionFilter) return false;
    return true;
  });

  const renderToggle = (plant: PlantOut) => (
    !canManage ? <span className="text-xs">{plant.active ? "Active" : "Inactive"}</span> :
    <button role="switch" aria-checked={plant.active} aria-label={`${plant.name} active`}
      onClick={() => (plant.active ? setConfirmDeactivate(plant) : handleToggle(plant))}
      className={`relative w-9 h-5 rounded-full transition-colors before:absolute before:-inset-3.5 before:content-[''] ${plant.active ? "bg-primary" : "bg-outline-variant"}`}>
      <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${plant.active ? "translate-x-4" : "translate-x-0.5"}`} />
    </button>
  );

  return (
    <div className="max-w-6xl mx-auto px-3 sm:px-5 py-6 space-y-8">
      {loadError && <p role="alert" className="text-error">{loadError} <button onClick={refresh} className="underline">Retry</button></p>}
      {canManage && organizationId && catalogueReady &&
        <GeographyPanel key={organizationId} organizationId={organizationId} catalogue={geography}
          disabled={loading || !!loadError}
          onRefresh={async () => { await refresh(); }} />}

      {/* ── Plants section ── */}
      <section>
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <div>
            <h1 className="text-lg font-semibold">Concrete Plants</h1>
            <p className="text-sm text-on-surface-variant">{plants.length} plants · {plants.filter((p) => p.active).length} active</p>
          </div>
          {canManage && organizationId && <button disabled={loading || !!loadError} onClick={() => void openPlantForm(null)}
            className="flex items-center gap-1.5 min-h-12 md:min-h-0 px-4 py-2 bg-primary text-on-primary text-sm font-medium rounded-xl hover:opacity-90 transition-opacity whitespace-nowrap">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M12 5v14M5 12h14" />
            </svg>
            {loading ? "Loading catalogue..." : "Add Plant"}
          </button>}
        </div>
        {canManage && !organizationId && (
          <p className="mb-4 text-sm text-on-surface-variant">
            To create a plant, open its business from Businesses first. Legacy unowned records are labelled below; they are never assigned automatically.
          </p>
        )}

        {/* Filters */}
        <div className="flex flex-wrap gap-2 mb-4 items-center">
          <select value={brandFilter} onChange={(e) => setBrandFilter(e.target.value)}
            className="px-3 py-1.5 rounded-lg border border-outline-variant bg-surface text-sm focus:outline-none focus:border-primary">
            <option value="all">All brands</option>
            {brandIds.map((b) => <option key={b} value={b}>{brandName(b)}</option>)}
          </select>
          {regions.length > 0 && (
            <select value={regionFilter} onChange={(e) => setRegionFilter(e.target.value)} aria-label="Region"
              className="px-3 py-1.5 rounded-lg border border-outline-variant bg-surface text-sm focus:outline-none focus:border-primary">
              <option value="all">All regions</option>
              {regions.map((r) => <option key={r.id} value={r.id}>{r.name} ({r.country_code})</option>)}
            </select>
          )}
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
                  <span className="font-medium text-on-surface [overflow-wrap:anywhere]">{plant.name}
                    {canManage && plant.organization_id === null && <span className="block text-xs text-error">Legacy - unowned</span>}
                  </span>
                  {renderToggle(plant)}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="inline-block px-2 py-0.5 rounded-full bg-primary/10 text-primary text-[11px] font-semibold">{brandName(plant.brand_id)}</span>
                  <span className="text-xs text-on-surface-variant">{regionLabel(plant.region_id)}</span>
                </div>
                <p className="text-sm text-on-surface-variant [overflow-wrap:anywhere]">{plant.address}</p>
                {canManage && <div className="flex gap-2">
                  <button disabled={loading} onClick={() => void openPlantForm(plant)}
                    className="flex-1 min-h-12 rounded-lg text-sm font-medium text-primary border border-primary/30 hover:bg-primary/5 transition-colors">Edit</button>
                </div>}
              </div>
            ))}
          </div>
          <div className="hidden md:block rounded-xl border border-outline-variant overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-surface-container text-on-surface-variant uppercase text-[11px] tracking-wide">
                <tr>
                  <th className="px-4 py-3 text-left font-medium">Name</th>
                  <th className="px-4 py-3 text-left font-medium">Brand</th>
                  <th className="px-4 py-3 text-left font-medium">Region</th>
                  <th className="px-4 py-3 text-left font-medium hidden lg:table-cell">Address</th>
                  <th className="px-4 py-3 text-center font-medium">Active</th>
                  {canManage && <th className="px-4 py-3 text-right font-medium">Actions</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-outline-variant/50">
                {visible.map((plant) => (
                  <tr key={plant.id} className={`hover:bg-surface-container/50 transition-colors ${!plant.active ? "opacity-50" : ""}`}>
                    <td className="px-4 py-3 font-medium text-on-surface">{plant.name}
                      {canManage && plant.organization_id === null && <span className="block text-xs text-error">Legacy - unowned</span>}
                    </td>
                    <td className="px-4 py-3">
                      <span className="px-2 py-0.5 rounded-full bg-primary/10 text-primary text-[11px] font-semibold">{brandName(plant.brand_id)}</span>
                    </td>
                    <td className="px-4 py-3 text-on-surface-variant">{regionLabel(plant.region_id)}</td>
                    <td className="px-4 py-3 text-on-surface-variant hidden lg:table-cell max-w-xs truncate">{plant.address}</td>
                    <td className="px-4 py-3 text-center">
                      {renderToggle(plant)}
                    </td>
                    {canManage && <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1.5">
                        <button disabled={loading} onClick={() => void openPlantForm(plant)}
                          className="px-2.5 py-1 rounded-lg text-xs font-medium text-primary border border-primary/30 hover:bg-primary/5 transition-colors">
                          Edit
                        </button>
                      </div>
                    </td>}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          </>
        )}
      </section>

      {/* ── Job Sites section ── */}
      {showJobSites && <section>
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
      </section>}

      {/* ── Modals ── */}
      {canManage && plantModal !== undefined && (
        <PlantFormModal
          plant={plantModal}
          brands={brandList.filter((brand) => brand.organization_id === (organizationId ?? plantModal?.organization_id ?? null))}
          regions={regions}
          geography={geography}
          onSaved={handleSaved}
          onClose={() => setPlantModal(undefined)}
        />
      )}
      {jobSiteModal && (
        <JobSiteModal
          initial={jobSiteModal === "new" ? undefined : jobSiteModal}
          onSave={handleSaveJobSite}
          onClose={() => setJobSiteModal(null)}
        />
      )}
      {canManage && confirmDeactivate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div role="dialog" aria-modal="true" aria-label="Confirm deactivate" className="bg-surface rounded-2xl shadow-xl w-full max-w-sm mx-3 sm:mx-4 p-5 space-y-4">
            <p className="text-sm text-on-surface">
              Deactivate <strong>{confirmDeactivate.name}</strong>? It won&apos;t be offered for new dispatches.
              Past trips keep their plant details, and you can reactivate it at any time.
            </p>
            <div className="flex justify-end gap-2">
              <button onClick={() => setConfirmDeactivate(null)}
                className="px-4 py-2 rounded-lg text-sm text-on-surface-variant border border-outline-variant hover:bg-surface-container transition-colors">Cancel</button>
              <button onClick={() => handleToggle(confirmDeactivate)}
                className="px-4 py-2 rounded-lg text-sm font-medium bg-amber-600 text-white hover:opacity-90 transition-opacity">
                Deactivate
              </button>
            </div>
          </div>
        </div>
      )}
      {confirmDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div role="dialog" aria-modal="true" aria-label="Confirm delete" className="bg-surface rounded-2xl shadow-xl w-full max-w-sm mx-3 sm:mx-4 p-5 space-y-4">
            <p className="text-sm text-on-surface">
              Delete this job site? This cannot be undone.
            </p>
            <div className="flex justify-end gap-2">
              <button onClick={() => setConfirmDelete(null)}
                className="px-4 py-2 rounded-lg text-sm text-on-surface-variant border border-outline-variant hover:bg-surface-container transition-colors">Cancel</button>
              <button
                onClick={() => handleDeleteSite(confirmDelete.id)}
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
