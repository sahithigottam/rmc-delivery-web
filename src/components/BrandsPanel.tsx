"use client";

import { useCallback, useEffect, useState } from "react";
import { createBrand, getBrands, isVersionConflict, updateBrand } from "@/lib/api";
import type { Brand, Business } from "@/types/route";
import CatalogueNameForm from "@/components/CatalogueNameForm";

export default function BrandsPanel({ business, onChanged }: { business: Business; onChanged?: () => void }) {
  const [brands, setBrands] = useState<Brand[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState<Brand | null | undefined>();
  const [saveMessage, setSaveMessage] = useState("");
  const refresh = useCallback(async () => {
    setLoading(true);
    setError("");
    try { setBrands(await getBrands(business.id)); }
    catch (e) { setError(e instanceof Error ? e.message : "Could not load brands."); }
    finally { setLoading(false); }
  }, [business.id]);
  useEffect(() => { void refresh(); }, [refresh]);

  const save = async (name: string, _id: string, key: string) => {
    try {
      const saved = editing
        ? await updateBrand(editing.id, { name, version: editing.version })
        : await createBrand({ name, organization_id: business.id }, key);
      setBrands((current) => current.some((brand) => brand.id === saved.id)
        ? current.map((brand) => brand.id === saved.id ? saved : brand)
        : [...current, saved]);
      setSaveMessage(`${saved.name} saved to the server.`);
      onChanged?.();
      await refresh();
    } catch (e) {
      if (isVersionConflict(e)) {
        await refresh();
        throw new Error("This brand changed while you were editing. The list is reloaded; cancel and reopen it to review the latest version. Nothing was overwritten.");
      }
      throw e;
    }
  };

  return (
    <section className="px-3 sm:px-5 py-4 space-y-3 max-w-6xl mx-auto">
      <div className="flex flex-wrap justify-between items-center gap-3">
        <h2 className="text-lg font-semibold">Brands</h2>
        <button onClick={() => setEditing(null)} disabled={loading || !!error}
          className="min-h-12 px-4 rounded-xl bg-primary text-on-primary whitespace-nowrap disabled:opacity-40">Add Brand</button>
      </div>
      {saveMessage && <p role="status" className="text-primary">{saveMessage}</p>}
      {error ? <p role="alert" className="text-error">{error} <button onClick={refresh} className="underline">Retry</button></p>
        : loading ? <p role="status">Loading brands...</p>
          : !brands.length ? <p className="text-on-surface-variant">No brands registered for this business.</p>
            : <ul className="divide-y divide-outline-variant border-y border-outline-variant">
              {brands.map((brand) => (
                <li key={brand.id} className="py-3 flex justify-between items-center gap-3">
                  <div className="min-w-0"><p className="font-medium break-words">{brand.name}</p></div>
                  <button onClick={() => setEditing(brand)} className="min-h-12 px-3 border border-outline-variant rounded-xl">Edit</button>
                </li>
              ))}
            </ul>}
      {editing !== undefined && <CatalogueNameForm title={editing ? "Edit Brand" : "Add Brand"}
        initialName={editing?.name} organizationId={business.id} onSave={save} onClose={() => setEditing(undefined)} />}
    </section>
  );
}
