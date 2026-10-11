"use client";

import { useCallback, useEffect, useState } from "react";
import { createBusiness, getBusinesses, isVersionConflict, updateBusiness } from "@/lib/api";
import type { Business } from "@/types/route";
import BrandsPanel from "@/components/BrandsPanel";
import PlantsPanel from "@/components/PlantsPanel";
import CatalogueNameForm from "@/components/CatalogueNameForm";

export default function BusinessesPanel({ canManageCatalogue }: { canManageCatalogue: boolean }) {
  const [businesses, setBusinesses] = useState<Business[]>([]);
  const [selected, setSelected] = useState<Business | null>(null);
  const [editing, setEditing] = useState<Business | null | undefined>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [saveMessage, setSaveMessage] = useState("");
  const [catalogueRevision, setCatalogueRevision] = useState(0);
  const refresh = useCallback(async () => {
    setLoading(true);
    setError("");
    try { setBusinesses(await getBusinesses()); }
    catch (e) { setError(e instanceof Error ? e.message : "Could not load businesses."); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void refresh(); }, [refresh]);
  const save = async (name: string, id: string, key: string) => {
    try {
      const saved = editing
        ? await updateBusiness(editing.id, { name, version: editing.version })
        : await createBusiness({ id, name }, key);
      setBusinesses((current) => current.some((business) => business.id === saved.id)
        ? current.map((business) => business.id === saved.id ? saved : business)
        : [...current, saved]);
      setSaveMessage(`${saved.name} saved to the server.`);
      await refresh();
    } catch (e) {
      if (isVersionConflict(e)) {
        await refresh();
        throw new Error("This business changed while you were editing. The list is reloaded; cancel and reopen it to review the latest version. Nothing was overwritten.");
      }
      throw e;
    }
  };

  if (selected) return (
    <div key={selected.id}>
      <div className="max-w-6xl mx-auto px-3 sm:px-5 pt-6">
        <button onClick={() => setSelected(null)} className="min-h-12 text-primary">Back to businesses</button>
        <h1 className="text-xl font-semibold break-words">{selected.name}</h1>
      </div>
      <p className="max-w-6xl mx-auto px-3 sm:px-5 pt-2 text-sm text-on-surface-variant">
        Add a brand for this business, then set up its Country, State, City and Operating Region in Business Geography. Finally add a plant using that brand and region.
      </p>
      {canManageCatalogue && <BrandsPanel business={selected}
        onChanged={() => setCatalogueRevision((revision) => revision + 1)} />}
      <PlantsPanel organizationId={selected.id} canManage={canManageCatalogue} showJobSites={false}
        catalogueRevision={catalogueRevision} />
    </div>
  );

  return (
    <section className="max-w-6xl mx-auto px-3 sm:px-5 py-6 space-y-4">
      <div className="flex flex-wrap justify-between items-center gap-3">
        <div><h1 className="text-xl font-semibold">Businesses</h1>
          <p className="text-sm text-on-surface-variant">Registered businesses linked to existing Clerk organizations.</p></div>
        <button onClick={() => setEditing(null)} disabled={loading || !!error}
          className="min-h-12 px-4 bg-primary text-on-primary rounded-xl whitespace-nowrap disabled:opacity-40">Register Business</button>
      </div>
      {saveMessage && <p role="status" className="text-primary">{saveMessage}</p>}
      {error ? <p role="alert" className="text-error">{error} <button onClick={refresh} className="underline">Retry</button></p>
        : loading ? <p role="status">Loading businesses...</p>
          : !businesses.length ? <p>No businesses registered yet.</p>
            : <ul className="divide-y divide-outline-variant border-y border-outline-variant">
              {businesses.map((business) => (
                <li key={business.id} className="py-4 flex flex-wrap items-center justify-between gap-3">
                  <div className="min-w-0"><p className="font-semibold break-words">{business.name}</p></div>
                  <div className="flex gap-2">
                    <button onClick={() => setEditing(business)} className="min-h-12 px-3 border border-outline-variant rounded-xl">Edit</button>
                    <button onClick={() => setSelected(business)} className="min-h-12 px-3 rounded-xl text-primary border border-primary whitespace-nowrap">Open Business</button>
                  </div>
                </li>
              ))}
            </ul>}
      {editing !== undefined && <CatalogueNameForm title={editing ? "Edit Business" : "Register Business"}
        initialName={editing?.name} register={!editing} onSave={save} onClose={() => setEditing(undefined)} />}
    </section>
  );
}
