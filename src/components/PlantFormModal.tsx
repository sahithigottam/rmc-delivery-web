"use client";

import { useRef, useState } from "react";
import { ApiError, createPlant, getPlant, isVersionConflict, updatePlant } from "@/lib/api";
import type { Brand, PlantCreate, PlantOut, PlantPatch, Region } from "@/types/route";
import { showToast } from "@/components/Toast";
import AddressAutocomplete from "@/components/AddressAutocomplete";
import type { Suggestion } from "@/components/AddressAutocomplete";
import GeographySelectors, { type GeographyCatalogue } from "@/components/GeographySelectors";

// Until the backend exposes approved mix policies, these are the mixes the UI knows about
const MIX_OPTIONS = [
  { code: "GP", label: "General Purpose" },
  { code: "HE", label: "High Early Strength" },
  { code: "RE", label: "Retarded / Extended" },
];

interface FormState {
  name: string;
  brand_id: string;
  country_code: string;
  state_id: string;
  city_id: string;
  region_id: string;
  address: string;
  lat: number | null;
  lng: number | null;
  active: boolean;
  supported_mix_codes: string[];
}

function fromPlant(p: PlantOut | null, regions: Region[]): FormState {
  const region = p?.region_id ? regions.find((r) => r.id === p.region_id) : undefined;
  return {
    name: p?.name ?? "",
    brand_id: p?.brand_id ?? "",
    country_code: region?.country_code ?? "",
    state_id: region?.state_id ?? "",
    city_id: region?.city_id ?? "",
    region_id: p?.region_id ?? "",
    address: p?.address ?? "",
    lat: p ? p.lat : null,
    lng: p ? p.lng : null,
    active: p?.active ?? true,
    supported_mix_codes: p?.supported_mix_codes ?? ["GP"],
  };
}

function sameSet(a: string[], b: string[]) {
  return a.length === b.length && a.every((x) => b.includes(x));
}

/** Only fields the user actually changed, so PATCH never clears data by accident */
function diff(form: FormState, base: PlantOut): Partial<PlantCreate> {
  const out: Partial<PlantCreate> = {};
  if (form.name.trim() !== base.name) out.name = form.name.trim();
  if (form.brand_id !== base.brand_id) out.brand_id = form.brand_id;
  if (form.region_id !== (base.region_id ?? "")) out.region_id = form.region_id;
  if (form.address.trim() !== base.address) out.address = form.address.trim();
  if (form.lat !== base.lat || form.lng !== base.lng) {
    out.location = { latitude: form.lat!, longitude: form.lng! };
  }
  if (form.active !== base.active) out.active = form.active;
  if (!sameSet(form.supported_mix_codes, base.supported_mix_codes)) {
    out.supported_mix_codes = form.supported_mix_codes;
  }
  return out;
}

function newIdempotencyKey() {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function validate(form: FormState): Record<string, string> {
  const errs: Record<string, string> = {};
  if (!form.name.trim()) errs.name = "Name is required";
  if (!form.brand_id) errs.brand_id = "Choose a brand";
  if (!form.region_id) errs.region_id = "Choose a region";
  if (!form.address.trim()) errs.address = "Address is required";
  const okLat = form.lat != null && Number.isFinite(form.lat) && form.lat >= -90 && form.lat <= 90;
  const okLng = form.lng != null && Number.isFinite(form.lng) && form.lng >= -180 && form.lng <= 180;
  if (!okLat || !okLng) errs.location = "Pick the address from the suggestions to capture coordinates";
  if (form.supported_mix_codes.length === 0) errs.supported_mix_codes = "Select at least one mix";
  return errs;
}

/** Maps backend field paths (e.g. "location.latitude") onto the inputs that show them */
function normaliseFieldErrors(fe: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(fe)) {
    const key = k.startsWith("location") ? "location" : k;
    if (!out[key]) out[key] = v;
  }
  return out;
}

export default function PlantFormModal({
  plant,
  brands,
  regions,
  geography,
  onSaved,
  onClose,
}: {
  /** null when adding a new plant */
  plant: PlantOut | null;
  brands: Brand[];
  regions: Region[];
  geography: GeographyCatalogue;
  onSaved: (plant: PlantOut) => void;
  onClose: () => void;
}) {
  const [base, setBase] = useState<PlantOut | null>(plant);
  const [form, setForm] = useState<FormState>(() => fromPlant(plant, regions));
  const [addressText, setAddressText] = useState(plant?.address ?? "");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [conflict, setConflict] = useState<PlantOut | null>(null);
  // Kept across retries of the same create so a timeout can't produce a duplicate plant
  const attempt = useRef<{ body: string; key: string } | null>(null);
  const selectedRegion = regions.find((r) => r.id === form.region_id);
  const searchCountry = form.country_code.toLowerCase();
  const isEdit = !!base;

  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => {
    setForm((f) => ({ ...f, [k]: v }));
    setErrors((e) => {
      const key = k === "lat" || k === "lng" ? "location" : k;
      if (!e[key]) return e;
      const { [key]: _removed, ...rest } = e;
      return rest;
    });
  };

  const handleAddressSelect = (s: Suggestion) => {
    const lat = parseFloat(s.lat);
    const lng = parseFloat(s.lon);
    setForm((f) => ({ ...f, address: s.display_name, lat, lng }));
    setAddressText(s.display_name);
    setErrors(({ address: _a, location: _l, ...rest }) => rest);
  };

  const handleError = (e: unknown) => {
    if (e instanceof ApiError) {
      const fe = normaliseFieldErrors(e.fieldErrors);
      setErrors(fe);
      setFormError(Object.keys(fe).length ? "Please fix the highlighted fields." : e.message);
      // A definitive rejection means the next attempt is a new request, not a retry
      if (e.status >= 400 && e.status < 500) attempt.current = null;
    } else {
      setFormError(
        e instanceof TypeError
          ? "Couldn't reach the server. Your changes are still here — try again."
          : e instanceof Error ? e.message : "Save failed",
      );
    }
  };

  const save = async (againstVersion?: PlantOut) => {
    const local = validate(form);
    setErrors(local);
    if (Object.keys(local).length) { setFormError("Please fix the highlighted fields."); return; }
    setFormError(null);
    setSaving(true);
    try {
      let saved: PlantOut;
      const target = againstVersion ?? base;
      if (target) {
        const changes = diff(form, target);
        if (Object.keys(changes).length === 0) { onClose(); return; }
        const patch: PlantPatch = { ...changes, version: target.version };
        saved = await updatePlant(target.id, patch);
        showToast("Plant updated", "success");
      } else {
        const body: PlantCreate = {
            name: form.name.trim(),
            brand_id: form.brand_id,
            region_id: form.region_id,
            address: form.address.trim(),
            location: { latitude: form.lat!, longitude: form.lng! },
            active: form.active,
            supported_mix_codes: form.supported_mix_codes,
          };
        const identity = JSON.stringify(body);
        if (attempt.current?.body !== identity) attempt.current = { body: identity, key: newIdempotencyKey() };
        saved = await createPlant(body, attempt.current.key);
        showToast("Plant added", "success");
      }
      onSaved(saved);
      onClose();
    } catch (e) {
      if (isVersionConflict(e) && base) {
        try {
          setConflict(await getPlant(base.id));
          setFormError(null);
        } catch {
          setFormError("This plant was changed by someone else. Close and reopen it to see the latest version.");
        }
      } else {
        handleError(e);
      }
    } finally {
      setSaving(false);
    }
  };

  const loadLatest = () => {
    if (!conflict) return;
    setBase(conflict);
    setForm(fromPlant(conflict, regions));
    setAddressText(conflict.address);
    setErrors({});
    setConflict(null);
  };

  const inputCls = (field: string) =>
    `mt-1 w-full px-3 py-2.5 rounded-xl border bg-surface text-sm focus:outline-none focus:border-primary ${
      errors[field] ? "border-red-500" : "border-outline-variant"
    }`;
  const FieldError = ({ field }: { field: string }) =>
    errors[field] ? <p id={`plant-${field}-error`} className="mt-1 text-xs text-red-600">{errors[field]}</p> : null;

  const brandName = (id: string) => brands.find((b) => b.id === id)?.name ?? id;
  const regionName = (id: string | null) => (id ? regions.find((r) => r.id === id)?.name ?? id : "—");

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div role="dialog" aria-modal="true" aria-label={isEdit ? "Edit plant" : "Add plant"} className="bg-surface rounded-2xl shadow-xl w-full max-w-md mx-3 sm:mx-4 overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-outline-variant">
          <h2 className="font-semibold text-on-surface">{isEdit ? "Edit Plant" : "Add Plant"}</h2>
          <button onClick={onClose} aria-label="Close" className="px-3 -mr-3 text-on-surface-variant hover:text-on-surface text-xl leading-none">&times;</button>
        </div>
        <form
          onSubmit={(e) => { e.preventDefault(); void save(); }}
          noValidate
          className="p-5 space-y-4 overflow-y-auto max-h-[80dvh]"
        >
          {conflict && (
            <div role="alert" className="rounded-xl border border-amber-300 bg-amber-50 p-3 space-y-2 text-sm text-amber-900">
              <p className="font-semibold">Someone else changed this plant while you were editing.</p>
              <ul className="text-xs space-y-0.5">
                <li>Name: {conflict.name}</li>
                <li>Brand: {brandName(conflict.brand_id)} · Region: {regionName(conflict.region_id)}</li>
                <li>Address: {conflict.address}</li>
                <li>Mixes: {conflict.supported_mix_codes.join(", ") || "—"} · {conflict.active ? "Active" : "Inactive"}</li>
              </ul>
              <div className="flex flex-wrap gap-2 pt-1">
                <button type="button" onClick={loadLatest}
                  className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-amber-600 text-white hover:opacity-90">
                  Discard mine, load theirs
                </button>
              </div>
            </div>
          )}

          {formError && (
            <p role="alert" className="rounded-xl bg-red-50 text-red-700 text-sm px-3 py-2">{formError}</p>
          )}

          <div>
            <label htmlFor="plant-name" className="text-xs font-semibold text-on-surface-variant tracking-wide">PLANT NAME *</label>
            <input id="plant-name" value={form.name} onChange={(e) => set("name", e.target.value)}
              aria-invalid={!!errors.name} aria-describedby={errors.name ? "plant-name-error" : undefined}
              className={inputCls("name")} placeholder="e.g. Holcim Avondale" />
            <FieldError field="name" />
          </div>

          <div>
            <label htmlFor="plant-brand" className="text-xs font-semibold text-on-surface-variant tracking-wide">BRAND *</label>
            <select id="plant-brand" value={form.brand_id} onChange={(e) => set("brand_id", e.target.value)}
              aria-invalid={!!errors.brand_id} className={inputCls("brand_id")}>
              <option value="">Select brand</option>
              {brands.filter((b) => b.active !== false || b.id === form.brand_id).map((b) => (
                <option key={b.id} value={b.id}>{b.name}</option>
              ))}
            </select>
            {brands.length === 0 && <p className="mt-1 text-sm text-error">
              This business has no brands. Close this form and use Add Brand before adding a plant.
            </p>}
            <FieldError field="brand_id" />
          </div>

          <GeographySelectors catalogue={geography}
            value={{ countryCode: form.country_code, stateId: form.state_id, cityId: form.city_id, regionId: form.region_id }}
            disabled={saving} requireRegion
            onChange={(value) => {
              const changedCountry = value.countryCode !== form.country_code;
              setForm((f) => ({ ...f, country_code: value.countryCode, state_id: value.stateId,
                city_id: value.cityId, region_id: value.regionId,
                ...(changedCountry ? { address: "", lat: null, lng: null } : {}) }));
              if (changedCountry) setAddressText("");
            }} />
          <FieldError field="region_id" />
          {selectedRegion?.city_id === null && <p role="alert" className="text-sm text-error">
            This legacy region must be linked to a verified city in Business Geography before selecting it for a plant.
          </p>}
          <div className="grid grid-cols-2 gap-3">
            <label className="text-sm">Latitude
              <input type="number" step="any" min={-90} max={90} value={form.lat ?? ""}
                onChange={(e) => set("lat", e.target.value === "" ? null : Number(e.target.value))}
                className={inputCls("location")} />
            </label>
            <label className="text-sm">Longitude
              <input type="number" step="any" min={-180} max={180} value={form.lng ?? ""}
                onChange={(e) => set("lng", e.target.value === "" ? null : Number(e.target.value))}
                className={inputCls("location")} />
            </label>
          </div>
          {selectedRegion && (
            <p className="-mt-2 text-[11px] text-on-surface-variant">
              Time zone {selectedRegion.timezone}
              {selectedRegion.calibration_status !== "calibrated" && " · predictions here are uncalibrated estimates"}
            </p>
          )}

          <div>
            <AddressAutocomplete
              label="PLANT ADDRESS *"
              value={addressText}
              onChange={(v) => {
                setAddressText(v);
                setForm((f) => ({ ...f, address: v, lat: null, lng: null }));
              }}
              onSelect={handleAddressSelect}
              country={searchCountry}
              countryWide
              disabled={saving || !form.country_code}
              placeholder="Search an address in the selected country"
            />
            <FieldError field="address" />
            {errors.location ? (
              <FieldError field="location" />
            ) : form.lat != null && form.lng != null ? (
              <p className="mt-1 text-[11px] text-emerald-600 font-medium">
                ✓ Coordinates captured: {form.lat.toFixed(5)}, {form.lng.toFixed(5)}
              </p>
            ) : null}
          </div>

          <fieldset>
            <legend className="text-xs font-semibold text-on-surface-variant tracking-wide">SUPPORTED MIXES *</legend>
            <div className="mt-2 flex flex-wrap gap-3">
              {MIX_OPTIONS.map((m) => (
                <label key={m.code} className="flex items-center gap-1.5 text-sm cursor-pointer">
                  <input type="checkbox" className="accent-primary w-4 h-4"
                    checked={form.supported_mix_codes.includes(m.code)}
                    onChange={(e) => set(
                      "supported_mix_codes",
                      e.target.checked
                        ? [...form.supported_mix_codes, m.code]
                        : form.supported_mix_codes.filter((c) => c !== m.code),
                    )} />
                  <span><strong>{m.code}</strong> <span className="text-on-surface-variant">{m.label}</span></span>
                </label>
              ))}
            </div>
            <FieldError field="supported_mix_codes" />
          </fieldset>

          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={form.active} onChange={(e) => set("active", e.target.checked)}
              className="accent-primary w-4 h-4" />
            <span className="text-sm text-on-surface">Active (available for new dispatches)</span>
          </label>

          <div className="flex justify-end gap-2 pt-1">
            <button type="button" onClick={onClose}
              className="px-4 py-2 rounded-xl text-sm text-on-surface-variant border border-outline-variant hover:bg-surface-container transition-colors">
              Cancel
            </button>
            <button type="submit" disabled={saving || !!conflict}
              className="px-4 py-2 rounded-xl text-sm font-medium bg-primary text-on-primary hover:opacity-90 transition-opacity disabled:opacity-40">
              {saving ? "Saving…" : isEdit ? "Save Changes" : "Add Plant"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
