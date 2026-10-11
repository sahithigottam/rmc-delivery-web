"use client";

import { useAuth } from "@clerk/nextjs";
import { useEffect, useState } from "react";
import { ApiError, getCurrentUser } from "@/lib/api";
import type { CurrentUserCapabilities } from "@/types/route";
import AuthControls from "@/components/AuthControls";

type Result =
  | { scope: string; capabilities: CurrentUserCapabilities; error?: never }
  | { scope: string; error: string; capabilities?: never };

export default function CapabilityGate({
  children,
}: {
  children: (capabilities: CurrentUserCapabilities) => React.ReactNode;
}) {
  const { isLoaded, userId, orgId, orgRole } = useAuth();
  const scope = JSON.stringify([userId, orgId, orgRole]);
  const [result, setResult] = useState<Result | null>(null);
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    if (!isLoaded || !userId) return;
    let cancelled = false;
    getCurrentUser().then((capabilities) => {
      if (capabilities.user_id !== userId || capabilities.organization_id !== (orgId ?? null)) {
        throw new Error("Your organization session changed. Retry to load the current access permissions.");
      }
      if (!cancelled) setResult({ scope, capabilities });
    }).catch((error: unknown) => {
      if (cancelled) return;
      const message = error instanceof ApiError && error.status === 401
        ? "Authentication failed. Please sign out and sign in again."
        : error instanceof ApiError && error.status === 403
          ? "You do not have access to this business. Select an organization you belong to."
          : error instanceof Error ? error.message : "Could not load your access permissions.";
      setResult({ scope, error: message });
    });
    return () => { cancelled = true; };
  }, [isLoaded, userId, orgId, scope, retry]);

  // Unmount the old company immediately, before a new capabilities request resolves.
  if (isLoaded && userId && result?.scope === scope && result.capabilities) {
    return <div key={scope} className="h-full">{children(result.capabilities)}</div>;
  }

  return (
    <div className="flex flex-col h-screen h-dvh bg-surface text-on-surface">
      <header className="flex items-center min-h-14 gap-3 px-3 bg-primary text-on-primary">
        <span className="flex-1 font-medium">RMC Delivery</span>
        <AuthControls />
      </header>
      <main className="p-6 space-y-3">
        {result?.scope === scope && result.error ? (
          <>
            <p role="alert">{result.error}</p>
            <button onClick={() => { setResult(null); setRetry((n) => n + 1); }}
              className="min-h-12 px-4 rounded-xl bg-primary text-on-primary">Retry</button>
          </>
        ) : <p role="status">Loading your access permissions...</p>}
      </main>
    </div>
  );
}
