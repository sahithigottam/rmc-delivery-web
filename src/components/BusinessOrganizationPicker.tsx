"use client";

import { useOrganizationList } from "@clerk/nextjs";

export default function BusinessOrganizationPicker({
  value, disabled, onSelect,
}: {
  value: string;
  disabled: boolean;
  onSelect: (id: string, name: string) => void;
}) {
  const { isLoaded, userMemberships } = useOrganizationList({
    userMemberships: { infinite: true, pageSize: 20 },
  });
  const memberships = userMemberships.data ?? [];
  const loading = !isLoaded || userMemberships.isLoading;

  return (
    <div className="space-y-2">
      <label className="block text-sm">Existing Clerk organization
        <select value={value} disabled={disabled || loading || userMemberships.isError} required
          onChange={(event) => {
            const organization = memberships.find((membership) => membership.organization.id === event.target.value)?.organization;
            onSelect(organization?.id ?? "", organization?.name ?? "");
          }}
          className="block w-full mt-1 min-h-12 px-3 border border-outline-variant rounded-xl bg-surface">
          <option value="">{loading ? "Loading organizations..." : "Select an organization by name"}</option>
          {memberships.map(({ organization }) => (
            <option key={organization.id} value={organization.id}>
              {organization.name}
            </option>
          ))}
        </select>
      </label>
      {userMemberships.isError && <p role="alert" className="text-sm text-error">
        Could not load your organization memberships. Close and reopen this form to retry.
      </p>}
      {!loading && !userMemberships.isError && memberships.length === 0 && (
        <p className="text-sm text-on-surface-variant">You do not belong to any Clerk organizations. Join an existing organization before registering its business.</p>
      )}
      {userMemberships.hasNextPage && <button type="button" disabled={disabled || loading}
        onClick={() => userMemberships.fetchNext()}
        className="min-h-12 text-primary disabled:opacity-40">
        {loading ? "Loading..." : "Load more organizations"}
      </button>}
      <p className="text-xs text-on-surface-variant">Only organizations you belong to are listed. Selecting one does not switch your active organization.</p>
    </div>
  );
}
