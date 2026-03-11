/* ── API client for the FastAPI backend ── */

import type {
  RouteCreate,
  RouteResponse,
  RerouteRequest,
  RerouteResponse,
} from "@/types/route";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000/api/v1";

async function apiFetch<T>(
  path: string,
  init?: RequestInit
): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...init?.headers,
    },
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.detail ?? `API error ${res.status}`);
  }

  return res.json();
}

/* ── Route endpoints ── */

export async function estimateRoute(
  req: RouteCreate
): Promise<RouteResponse> {
  return apiFetch<RouteResponse>("/routes/estimate", {
    method: "POST",
    body: JSON.stringify(req),
  });
}

export async function checkReroute(
  req: RerouteRequest,
  originalDuration?: number
): Promise<RerouteResponse> {
  const qs = originalDuration
    ? `?original_duration=${originalDuration}`
    : "";
  return apiFetch<RerouteResponse>(`/routes/reroute${qs}`, {
    method: "POST",
    body: JSON.stringify(req),
  });
}

export async function getRoute(routeId: number): Promise<RouteResponse> {
  return apiFetch<RouteResponse>(`/routes/${routeId}`);
}

export async function getRouteHistory(
  vehicleId?: string,
  limit = 10
): Promise<RouteResponse[]> {
  const params = new URLSearchParams();
  if (vehicleId) params.set("vehicle_id", vehicleId);
  params.set("limit", String(limit));
  return apiFetch<RouteResponse[]>(`/routes?${params}`);
}

export async function getCacheStats(): Promise<Record<string, number>> {
  return apiFetch<Record<string, number>>("/routes/cache/stats");
}
