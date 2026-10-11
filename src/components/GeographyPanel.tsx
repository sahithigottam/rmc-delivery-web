"use client";

import { useRef, useState } from "react";
import { ApiError, createCity, createCountry, createRegion, createState, updateRegion, deleteGeography, type GeographyKind } from "@/lib/api";
import GeographySelectors, { type GeographyCatalogue, type GeographySelection } from "@/components/GeographySelectors";
import type { Region } from "@/types/route";

type Entity = GeographyKind;

export default function GeographyPanel({
  catalogue, onRefresh, organizationId, disabled = false,
}: {
  catalogue: GeographyCatalogue;
  onRefresh: () => Promise<void>;
  organizationId: string;
  disabled?: boolean;
}) {
  const [entity, setEntity] = useState<Entity | null>(null);
  const [editing, setEditing] = useState<Region | null>(null);
  const [selection, setSelection] = useState<GeographySelection>({ countryCode: "", stateId: "", cityId: "", regionId: "" });
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [timezone, setTimezone] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState("");
  const [reviewRequired, setReviewRequired] = useState(false);
  const [conflicted, setConflicted] = useState(false);
  const [deleting, setDeleting] = useState<{ kind: Entity; id: string; name: string } | null>(null);
  const [deleteError, setDeleteError] = useState("");
  const [deleteBusy, setDeleteBusy] = useState(false);
  const attempt = useRef<{ body: string; key: string } | null>(null);

  const open = (kind: Entity, region?: Region) => {
    setEntity(kind);
    setEditing(region ?? null);
    setName(region?.name ?? "");
    setCode("");
    setTimezone("");
    setError("");
    setReviewRequired(false);
    setConflicted(false);
    attempt.current = null;
    setSelection({ countryCode: region?.country_code ?? "", stateId: region?.state_id ?? "",
      cityId: region?.city_id ?? "", regionId: region?.id ?? "" });
  };

  const confirmDelete = (kind: Entity, id: string, name: string) => {
    setDeleting({ kind, id, name });
    setDeleteError("");
    setSuccess("");
  };

  const remove = async () => {
    if (!deleting) return;
    setDeleteBusy(true);
    setDeleteError("");
    try {
      await deleteGeography(deleting.kind, deleting.id, organizationId);
      setSuccess(`${deleting.name} deleted from the server.`);
      setDeleting(null);
      await onRefresh();
    } catch (e) {
      setDeleteError(e instanceof Error ? e.message : "Could not delete geography.");
    } finally {
      setDeleteBusy(false);
    }
  };

  const locationGroups = [
    { kind: "country" as const, label: "Countries", rows: catalogue.countries.map((country) => ({ id: country.code, name: country.name, parent: "" })) },
    { kind: "state" as const, label: "States / Provinces", rows: catalogue.states.map((state) => ({
      id: state.id, name: state.name, parent: catalogue.countries.find((country) => country.code === state.country_code)?.name ?? state.country_code,
    })) },
    { kind: "city" as const, label: "Cities", rows: catalogue.cities.map((city) => ({
      id: city.id, name: city.name, parent: catalogue.states.find((state) => state.id === city.state_id)?.name ?? "State unavailable",
    })) },
  ];

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    const trimmed = name.trim();
    if (!trimmed || trimmed.length > 200) { setError("Enter a non-blank name of at most 200 characters."); return; }
    if (entity === "country" && !/^[A-Z]{2}$/.test(code.trim())) { setError("Enter a two-letter uppercase ISO country code."); return; }
    if (entity === "state" && !selection.countryCode) { setError("Select a country."); return; }
    if (entity === "city" && !selection.stateId) { setError("Select a state/province."); return; }
    if (entity === "region" && !selection.cityId) { setError("Select a city."); return; }
    if (entity === "city") {
      try { new Intl.DateTimeFormat("en", { timeZone: timezone.trim() }); }
      catch { setError("Enter a valid IANA time zone, such as Asia/Kolkata."); return; }
      if (!timezone.trim()) { setError("Enter an IANA time zone."); return; }
    }
    const body = JSON.stringify([entity, trimmed, code.trim(), selection.cityId, timezone.trim(), selection.stateId, selection.countryCode]);
    setSaving(true);
    setError("");
    try {
      if (entity === "region" && attempt.current?.body !== body) attempt.current = { body, key: crypto.randomUUID() };
      if (entity === "country") await createCountry({ organization_id: organizationId, code: code.trim(), name: trimmed });
      else if (entity === "state") await createState({ organization_id: organizationId, country_code: selection.countryCode, name: trimmed });
      else if (entity === "city") await createCity({ state_id: selection.stateId, name: trimmed, timezone: timezone.trim() });
      else if (entity === "region") {
        if (editing) await updateRegion(editing.id, { city_id: selection.cityId, name: trimmed, version: editing.version });
        else await createRegion({ city_id: selection.cityId, name: trimmed }, attempt.current!.key);
      }
      setEntity(null);
      setSuccess("Geography saved.");
      await onRefresh();
    } catch (e) {
      const uncertain = e instanceof TypeError || (e instanceof ApiError && e.status >= 500);
      setReviewRequired(uncertain && entity !== "region");
      setConflicted(!!editing && e instanceof ApiError && e.status === 409);
      setError(uncertain
        ? "The response was uncertain. Check the refreshed catalogue for the existing record before retrying."
        : e instanceof ApiError && Object.keys(e.fieldErrors).length
          ? Object.entries(e.fieldErrors).map(([field, message]) => `${field}: ${message}`).join("; ")
          : e instanceof Error ? e.message : "Could not save geography.");
      if (uncertain || (e instanceof ApiError && e.status === 409)) await onRefresh();
    } finally { setSaving(false); }
  };

  return (
    <section className="max-w-6xl mx-auto px-3 sm:px-5 py-4 space-y-3 border-b border-outline-variant">
      <h2 className="text-lg font-semibold">Business Geography</h2>
      <p className="text-sm text-on-surface-variant">
        Add verified operating locations only. New regions are uncalibrated; they do not approve traffic or concrete-life rules.
      </p>
      {success && <p role="status" className="text-primary">{success}</p>}
      <div className="flex flex-wrap gap-2">
        {(["country", "state", "city", "region"] as const).map((kind) => (
          <button key={kind} disabled={disabled} onClick={() => open(kind)}
            className="min-h-12 px-3 rounded-xl border border-outline-variant whitespace-nowrap">Add {kind}</button>
        ))}
      </div>
      <p className="text-sm text-on-surface-variant">Delete only unused locations. Referenced records are protected by the backend; deletion never cascades.</p>
      {locationGroups.map((group) => (
        <details key={group.kind} className="border-b border-outline-variant">
          <summary className="min-h-12 py-3 cursor-pointer font-medium">{group.label} ({group.rows.length})</summary>
          {!group.rows.length && <p className="pb-3 text-sm text-on-surface-variant">No records saved. Use Add {group.kind} above.</p>}
          <ul className="divide-y divide-outline-variant">
            {group.rows.map((row) => (
              <li key={row.id} className="flex items-center justify-between gap-3 py-3">
                <div className="min-w-0"><p className="break-words">{row.name}</p>
                  {row.parent && <p className="text-xs text-on-surface-variant">{row.parent}</p>}</div>
                <button disabled={disabled} onClick={() => confirmDelete(group.kind, row.id, row.name)}
                  className="min-h-12 px-3 text-error border border-outline-variant rounded-xl whitespace-nowrap">Delete</button>
              </li>
            ))}
          </ul>
        </details>
      ))}
      <h3 className="font-medium">Operating Regions ({catalogue.regions.length})</h3>
      <ul className="divide-y divide-outline-variant">
        {catalogue.regions.map((region) => (
          <li key={region.id} className="flex justify-between items-center gap-3 py-3">
            <div className="min-w-0"><p className="font-medium break-words">{region.name}</p>
              <p className="text-xs text-on-surface-variant">{region.country_code} / {region.timezone}
                {region.city_id === null ? " / Legacy mapping - needs geographic review and city linkage" : ""}</p></div>
            <div className="flex flex-wrap justify-end gap-2">
              <button disabled={disabled} onClick={() => open("region", region)}
                className="min-h-12 px-3 border border-outline-variant rounded-xl whitespace-nowrap">Edit region</button>
              <button disabled={disabled} onClick={() => confirmDelete("region", region.id, region.name)}
                className="min-h-12 px-3 text-error border border-outline-variant rounded-xl whitespace-nowrap">Delete</button>
            </div>
          </li>
        ))}
      </ul>
      {deleting && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div role="dialog" aria-modal="true" aria-label={`Delete ${deleting.kind}`}
            className="max-w-md w-full mx-3 p-5 rounded-2xl bg-surface space-y-3">
            <h3 className="text-lg font-semibold">Delete {deleting.name}?</h3>
            <p className="text-sm">This permanently removes an unused {deleting.kind}. Child records and plants are not deleted. A region referenced by any plant, including inactive plants, cannot be removed. Audit history is retained.</p>
            {deleteError && <p role="alert" className="text-error">{deleteError}</p>}
            <div className="flex justify-end gap-2">
              <button disabled={deleteBusy} onClick={() => setDeleting(null)}
                className="min-h-12 px-4 border border-outline-variant rounded-xl disabled:opacity-40">Cancel</button>
              <button disabled={deleteBusy} onClick={() => void remove()}
                className="min-h-12 px-4 border border-error text-error rounded-xl disabled:opacity-40">
                {deleteBusy ? "Deleting..." : "Delete"}
              </button>
            </div>
          </div>
        </div>
      )}
      {entity && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <form onSubmit={save} role="dialog" aria-modal="true" aria-label={`${editing ? "Edit" : "Add"} ${entity}`}
            className="max-w-md w-full mx-3 p-5 rounded-2xl bg-surface space-y-3 overflow-y-auto max-h-[85dvh]">
            <h3 className="text-lg font-semibold">{editing ? "Edit" : "Add"} {entity}</h3>
            {error && <p role="alert" className="text-error">{error}</p>}
            {conflicted && <p className="text-sm text-error">Cancel and reopen the region to review the latest version. Nothing was overwritten.</p>}
            {reviewRequired && <label className="flex gap-2 text-sm">
              <input type="checkbox" onChange={(e) => setReviewRequired(!e.target.checked)} />
              I checked the refreshed catalogue and this record does not exist.
            </label>}
            {entity !== "country" && <GeographySelectors catalogue={catalogue} value={selection}
              onChange={setSelection} disabled={saving} depth={entity === "state" ? 1 : entity === "city" ? 2 : 3} />}
            {entity === "country" && <label className="block text-sm">ISO country code
              <input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} maxLength={2} required disabled={saving}
                className="mt-1 block w-full min-h-12 px-3 rounded-xl border border-outline-variant bg-surface" /></label>}
            <label className="block text-sm">Name
              <input value={name} onChange={(e) => setName(e.target.value)} maxLength={200} required disabled={saving}
                className="mt-1 block w-full min-h-12 px-3 rounded-xl border border-outline-variant bg-surface" /></label>
            {entity === "city" && <label className="block text-sm">IANA time zone
              <input value={timezone} onChange={(e) => setTimezone(e.target.value)} placeholder="Asia/Kolkata" required disabled={saving}
                className="mt-1 block w-full min-h-12 px-3 rounded-xl border border-outline-variant bg-surface" /></label>}
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setEntity(null)} disabled={saving}
                className="min-h-12 px-4 border border-outline-variant rounded-xl disabled:opacity-40">Cancel</button>
              <button disabled={saving || reviewRequired || conflicted} className="min-h-12 px-4 bg-primary text-on-primary rounded-xl disabled:opacity-40">
                {saving ? "Saving..." : "Save"}
              </button>
            </div>
          </form>
        </div>
      )}
    </section>
  );
}
