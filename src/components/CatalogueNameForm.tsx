"use client";

import { useRef, useState } from "react";
import { ApiError } from "@/lib/api";
import BusinessOrganizationPicker from "@/components/BusinessOrganizationPicker";

export default function CatalogueNameForm({
  title, initialName = "", organizationId, register = false, onSave, onClose,
}: {
  title: string;
  initialName?: string;
  organizationId?: string;
  register?: boolean;
  onSave: (name: string, organizationId: string, idempotencyKey: string) => Promise<void>;
  onClose: () => void;
}) {
  const [name, setName] = useState(initialName);
  const [id, setId] = useState(organizationId ?? "");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const attempt = useRef<{ body: string; key: string } | null>(null);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    const trimmedName = name.trim();
    const trimmedId = id.trim();
    if (!trimmedName || trimmedName.length > 200) { setError("Enter a non-blank name of at most 200 characters."); return; }
    if (register && !/^org_[A-Za-z0-9]+$/.test(trimmedId)) { setError("Select an existing Clerk organization by name."); return; }
    const body = JSON.stringify([trimmedName, trimmedId]);
    setSaving(true);
    setError("");
    try {
      if (attempt.current?.body !== body) attempt.current = { body, key: crypto.randomUUID() };
      await onSave(trimmedName, trimmedId, attempt.current.key);
      onClose();
    } catch (e) {
      setError(e instanceof ApiError && Object.keys(e.fieldErrors).length
        ? Object.entries(e.fieldErrors).map(([field, message]) => `${field}: ${message}`).join("; ")
        : e instanceof Error ? e.message : "Save failed.");
      if (e instanceof ApiError && e.status >= 400 && e.status < 500) attempt.current = null;
    } finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <form onSubmit={submit} noValidate className="w-full max-w-md mx-3 p-5 space-y-4 rounded-2xl bg-surface shadow-xl"
        role="dialog" aria-modal="true" aria-label={title}>
        <h2 className="text-lg font-semibold">{title}</h2>
        {register && <p className="text-sm text-on-surface-variant">Saves a business profile in the backend for the selected existing organization. It does not create a Clerk organization or invite users.</p>}
        {error && <p role="alert" className="text-error">{error}</p>}
        {register && (
          <BusinessOrganizationPicker value={id} disabled={saving}
            onSelect={(nextId, nextName) => {
              setId(nextId);
              setName(nextName);
              setError("");
            }} />
        )}
        <label className="block text-sm">Name
          <input value={name} onChange={(e) => setName(e.target.value)} disabled={saving} required maxLength={200}
            className="block w-full mt-1 min-h-12 px-3 border border-outline-variant rounded-xl bg-surface" />
        </label>
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} disabled={saving}
            className="min-h-12 px-4 rounded-xl border border-outline-variant whitespace-nowrap disabled:opacity-40">Cancel</button>
          <button disabled={saving} className="min-h-12 px-4 rounded-xl bg-primary text-on-primary whitespace-nowrap disabled:opacity-40">
            {saving ? "Saving..." : "Save"}
          </button>
        </div>
      </form>
    </div>
  );
}
