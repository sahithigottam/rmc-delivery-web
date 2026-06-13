/* â”€â”€ API client for the FastAPI backend â”€â”€ */

import type {
  RouteCreate,
  RouteResponse,
  RerouteRequest,
  RerouteResponse,
  TripStartRequest,
  TripResponse,
  TripPositionUpdate,
  TripEventResponse,
  TripRerouteInfo,
} from "@/types/route";

const API = process.env.NEXT_PUBLIC_API_URL ?? "/api/v1";

async function apiFetch<T>(
  path: string,
  init?: RequestInit
): Promise<T> {
  const url = `${API}${path}`;
  const method = init?.method ?? "GET";

  // Log request
  console.log(
    `%c[API] ${method} ${url}`,
    "color: #1a73e8; font-weight: bold;"
  );
  if (init?.body) {
    try {
      console.log("[API] Request body:", JSON.parse(init.body as string));
    } catch {
      console.log("[API] Request body:", init.body);
    }
  }

  const t0 = performance.now();
  const res = await fetch(url, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...init?.headers,
    },
  });
  const elapsed = (performance.now() - t0).toFixed(0);

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    console.error(
      `%c[API] âŒ ${res.status} ${method} ${url} (${elapsed}ms)`,
      "color: #ea4335; font-weight: bold;",
      body
    );
    throw new Error(body.detail ?? `API error ${res.status}`);
  }

  const data = await res.json();
  console.log(
    `%c[API] âœ… ${res.status} ${method} ${url} (${elapsed}ms)`,
    "color: #1e8e3e; font-weight: bold;",
    data
  );
  return data;
}

/* â”€â”€ Route endpoints â”€â”€ */

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

/* â”€â”€ Trip endpoints â”€â”€ */

export async function startTrip(req: TripStartRequest): Promise<TripResponse> {
  return apiFetch<TripResponse>("/trips/start", {
    method: "POST",
    body: JSON.stringify(req),
  });
}

export async function getActiveTrips(): Promise<TripResponse[]> {
  return apiFetch<TripResponse[]>("/trips/active");
}

export async function getAllTrips(limit = 100): Promise<TripResponse[]> {
  return apiFetch<TripResponse[]>(`/trips/all?limit=${limit}`);
}

export async function deleteTrip(tripId: number): Promise<void> {
  await apiFetch<void>(`/trips/${tripId}`, { method: "DELETE" });
}

export async function getTrip(tripId: number): Promise<TripResponse> {
  return apiFetch<TripResponse>(`/trips/${tripId}`);
}

export async function getTripEvents(
  tripId: number,
  limit = 50
): Promise<TripEventResponse[]> {
  return apiFetch<TripEventResponse[]>(`/trips/${tripId}/events?limit=${limit}`);
}

export async function updateTripPosition(
  tripId: number,
  position: TripPositionUpdate
): Promise<TripResponse> {
  return apiFetch<TripResponse>(`/trips/${tripId}/position`, {
    method: "POST",
    body: JSON.stringify(position),
  });
}

export async function checkTripTraffic(
  tripId: number
): Promise<TripRerouteInfo | { message: string }> {
  return apiFetch(`/trips/${tripId}/check`, {
    method: "POST",
  });
}

export async function pauseTrip(tripId: number): Promise<TripResponse> {
  return apiFetch<TripResponse>(`/trips/${tripId}/pause`, {
    method: "POST",
  });
}

export async function resumeTrip(tripId: number): Promise<TripResponse> {
  return apiFetch<TripResponse>(`/trips/${tripId}/resume`, {
    method: "POST",
  });
}

export async function completeTrip(tripId: number, req?: { success?: boolean; notes?: string }): Promise<TripResponse> {
  return apiFetch<TripResponse>(`/trips/${tripId}/complete`, {
    method: "POST",
    ...(req ? { headers: { "Content-Type": "application/json" }, body: JSON.stringify(req) } : {}),
  });
}

export async function cancelTrip(tripId: number): Promise<TripResponse> {
  return apiFetch<TripResponse>(`/trips/${tripId}/cancel`, {
    method: "POST",
  });
}

export async function markTripPending(tripId: number): Promise<TripResponse> {
  return apiFetch<TripResponse>(`/trips/${tripId}/mark-pending`, {
    method: "POST",
  });
}

export async function markTripDelayed(tripId: number): Promise<TripResponse> {
  return apiFetch<TripResponse>(`/trips/${tripId}/mark-delayed`, {
    method: "POST",
  });
}

export function getTripStreamURL(tripId: number): string {
  return `${API}/trips/${tripId}/stream`;
}

/*  Plants & Dispatch endpoints  */

import type {
  PlantOut,
  PlantCreate,
  PlantUpdate,
  BrandAnalysisRequest,
  BrandAnalysisResponse,
  DispatchRequest,
  DispatchResponse,
  TripBeginRequest,
  TripCompleteRequest,
} from "@/types/route";

export async function getBrands(): Promise<string[]> {
  return apiFetch<string[]>("/plants/brands");
}

export async function getPlants(brand?: string, region?: string, activeOnly = false): Promise<PlantOut[]> {
  const params = new URLSearchParams();
  if (brand) params.set("brand", brand);
  if (region) params.set("region", region);
  if (!activeOnly) params.set("active_only", "false");
  const qs = params.toString() ? `?${params}` : "";
  return apiFetch<PlantOut[]>(`/plants${qs}`);
}

export async function createPlant(body: PlantCreate): Promise<PlantOut> {
  return apiFetch<PlantOut>("/plants", { method: "POST", body: JSON.stringify(body) });
}

export async function updatePlant(plantId: string, body: PlantCreate): Promise<PlantOut> {
  return apiFetch<PlantOut>(`/plants/${plantId}`, { method: "PUT", body: JSON.stringify(body) });
}

export async function togglePlant(plantId: string, active: boolean): Promise<PlantOut> {
  return apiFetch<PlantOut>(`/plants/${plantId}`, { method: "PATCH", body: JSON.stringify({ active }) });
}

export async function deletePlant(plantId: string): Promise<void> {
  await apiFetch<void>(`/plants/${plantId}`, { method: "DELETE" });
}

export async function analyseBrand(req: BrandAnalysisRequest): Promise<BrandAnalysisResponse> {
  return apiFetch<BrandAnalysisResponse>("/plants/analyse", {
    method: "POST",
    body: JSON.stringify(req),
  });
}

export async function dispatchTrip(req: DispatchRequest): Promise<DispatchResponse> {
  return apiFetch<DispatchResponse>("/trips/dispatch", {
    method: "POST",
    body: JSON.stringify(req),
  });
}

export async function beginTrip(tripId: number, req: TripBeginRequest): Promise<TripResponse> {
  return apiFetch<TripResponse>(`/trips/${tripId}/begin`, {
    method: "POST",
    body: JSON.stringify(req),
  });
}

