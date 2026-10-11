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
import { utcReviver } from "@/lib/time";
import type { Clerk } from "@clerk/types";

const API = process.env.NEXT_PUBLIC_API_URL ?? "/api/v1";
// Request logging is for local development; production consoles stay quiet
const DEBUG_API = process.env.NODE_ENV !== "production";

/** Error raised for non-2xx responses; understands both `{code, message, details}` and FastAPI `{detail}` */
export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string | null,
    readonly details: Record<string, unknown>,
    /** Field name → message, for showing validation errors next to form inputs */
    readonly fieldErrors: Record<string, string>,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

function fieldFromLoc(loc: unknown): string | null {
  if (!Array.isArray(loc)) return null;
  // FastAPI loc looks like ["body", "location", "latitude"]
  const parts = loc.filter((p) => p !== "body" && p !== "query" && p !== "path").map(String);
  return parts.length ? parts.join(".") : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function toApiError(status: number, value: unknown): ApiError {
  const body = isRecord(value) ? value : {};
  const error = isRecord(body.detail) ? body.detail : body;
  const fieldErrors: Record<string, string> = {};
  const details = isRecord(error.details) ? error.details : {};

  const collect = (items: unknown) => {
    if (!Array.isArray(items)) return;
    for (const it of items) {
      if (!isRecord(it)) continue;
      const field = typeof it.field === "string" ? it.field : fieldFromLoc(it.loc);
      const msg = it.message ?? it.msg;
      if (field && typeof msg === "string" && !fieldErrors[field]) fieldErrors[field] = msg;
    }
  };
  collect(details.fields);
  collect(details.errors);
  if (Array.isArray(body?.detail)) collect(body.detail);

  let message: string;
  if (typeof error.message === "string") message = error.message;
  else if (typeof body?.detail === "string") message = body.detail;
  else if (Object.keys(fieldErrors).length) message = "Please fix the highlighted fields";
  else if (status === 401) message = "Please sign in to continue";
  else if (status === 403) message = "You don't have permission to do that";
  else message = `API error ${status}`;

  return new ApiError(message, status, typeof error.code === "string" ? error.code : null, details, fieldErrors);
}

/**
 * Bearer token for the signed-in Clerk user. Fetched per request because Clerk
 * session tokens are short-lived (~60 s) — this also covers queued GPS uploads.
 */
async function clerkAuthHeader(): Promise<Record<string, string>> {
  if (typeof window === "undefined") return {};
  const clerk = (window as Window & { Clerk?: Clerk }).Clerk;
  const token = await clerk?.session?.getToken();
  if (!token) throw new ApiError("Your session has expired. Please sign in again.", 401, null, {}, {});
  return { Authorization: `Bearer ${token}` };
}

async function apiFetch<T>(
  path: string,
  init?: RequestInit
): Promise<T> {
  const url = `${API}${path}`;
  const method = init?.method ?? "GET";

  if (DEBUG_API) {
    console.log(`%c[API] ${method} ${url}`, "color: #1a73e8; font-weight: bold;");
    if (init?.body) {
      try {
        console.log("[API] Request body:", JSON.parse(init.body as string));
      } catch {
        console.log("[API] Request body:", init.body);
      }
    }
  }

  const t0 = performance.now();
  const authHeader = await clerkAuthHeader();
  const res = await fetch(url, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...authHeader,
      ...init?.headers,
    },
  });
  const elapsed = (performance.now() - t0).toFixed(0);

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    console.error(`[API] ${res.status} ${method} ${path} (${elapsed}ms)`, DEBUG_API ? body : "");
    throw toApiError(res.status, body);
  }

  // Backend sends UTC times without "Z"; the reviver marks them as UTC
  const text = await res.text();
  const data = (text ? JSON.parse(text, utcReviver) : null) as T;
  if (DEBUG_API) {
    console.log(`%c[API] ${res.status} ${method} ${url} (${elapsed}ms)`, "color: #1e8e3e; font-weight: bold;", data);
  }
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
  return apiFetch<TripResponse[]>("/trips/active", { cache: "no-store" });
}

export async function getAllTrips(limit = 100): Promise<TripResponse[]> {
  return apiFetch<TripResponse[]>(`/trips/all?limit=${limit}`);
}

export async function deleteTrip(tripId: number): Promise<void> {
  await apiFetch<void>(`/trips/${tripId}`, { method: "DELETE" });
}

export async function getTrip(tripId: number): Promise<TripResponse> {
  return apiFetch<TripResponse>(`/trips/${tripId}`, { cache: "no-store" });
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

export function getTripStreamURL(tripId: number): string {
  return `${API}/trips/${tripId}/stream`;
}

/*  Plants & Dispatch endpoints  */

import type {
  PlantOut,
  PlantResource,
  PlantCreate,
  PlantPatch,
  PlantPredictionResult,
  Brand,
  Business,
  CurrentUserCapabilities,
  Region,
  Country,
  StateProvince,
  City,
  BrandAnalysisRequest,
  BrandAnalysisResponse,
  DispatchRequest,
  DispatchResponse,
  TripBeginRequest,
  TripCompleteRequest,
} from "@/types/route";

/** Flatten structured coordinates for the existing map components. */
export function normalizePlant(raw: PlantResource): PlantOut {
  if (!raw.location || !Number.isFinite(raw.location.latitude) || !Number.isFinite(raw.location.longitude) ||
      !raw.brand_id || !raw.region_id || !Number.isInteger(raw.version) || raw.version < 1) {
    throw new Error("Invalid structured plant response. Verify the backend catalogue deployment.");
  }
  const { location, ...plant } = raw;
  return { ...plant, lat: location.latitude, lng: location.longitude };
}

function listItems<T>(data: unknown): T[] {
  if (isRecord(data) && Array.isArray(data.items) &&
      typeof data.total === "number" && Number.isInteger(data.total) && data.total >= 0 &&
      typeof data.limit === "number" && Number.isInteger(data.limit) && data.limit >= 1 && data.limit <= 100 &&
      typeof data.offset === "number" && Number.isInteger(data.offset) && data.offset >= 0) {
    return data.items as T[];
  }
  throw new Error("Invalid catalogue response: expected items, total, limit and offset.");
}

const PAGE_SIZE = 100;

/** Follows pagination so callers always get every matching record */
async function fetchAllPages<T>(path: string, params: URLSearchParams): Promise<T[]> {
  const out: T[] = [];
  let offset = 0;
  for (let guard = 0; guard < 50; guard++) {
    params.set("limit", String(PAGE_SIZE));
    params.set("offset", String(offset));
    const data = await apiFetch<unknown>(`${path}?${params}`);
    const items = listItems<T>(data);
    out.push(...items);
    const page = data as { total?: number; limit?: number } | null;
    const total = page?.total;
    if (total != null && out.length >= total) return out;
    if (!items.length) {
      if (total != null && out.length < total) throw new Error("Catalogue pagination stopped before all records were returned.");
      return out;
    }
    if (total == null && items.length < (page?.limit ?? PAGE_SIZE)) return out;
    offset += items.length;
  }
  throw new Error("Catalogue is too large to load completely. Narrow the filters and retry.");
}

export function getCurrentUser(): Promise<CurrentUserCapabilities> {
  return apiFetch("/auth/me");
}

export function getBusinesses(): Promise<Business[]> {
  return fetchAllPages("/businesses", new URLSearchParams());
}

export function createBusiness(body: { id: string; name: string }, key: string): Promise<Business> {
  return apiFetch("/businesses", { method: "POST", headers: { "Idempotency-Key": key }, body: JSON.stringify(body) });
}

export function updateBusiness(id: string, body: { name: string; version: number }): Promise<Business> {
  return apiFetch(`/businesses/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify(body) });
}

export function getBrands(organizationId?: string): Promise<Brand[]> {
  const params = new URLSearchParams();
  if (organizationId) params.set("organization_id", organizationId);
  return fetchAllPages("/brands", params);
}

export function createBrand(body: { name: string; organization_id: string }, key: string): Promise<Brand> {
  return apiFetch("/brands", { method: "POST", headers: { "Idempotency-Key": key }, body: JSON.stringify(body) });
}

export function updateBrand(id: string, body: { name: string; version: number }): Promise<Brand> {
  return apiFetch(`/brands/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify(body) });
}

export async function getRegions(countryCode?: string, organizationId?: string): Promise<Region[]> {
  const params = new URLSearchParams();
  if (countryCode) params.set("country_code", countryCode);
  if (organizationId) params.set("organization_id", organizationId);
  return fetchAllPages("/regions", params);
}

export function getCountries(organizationId?: string): Promise<Country[]> {
  const params = new URLSearchParams();
  if (organizationId) params.set("organization_id", organizationId);
  return fetchAllPages("/countries", params);
}

export function getCountry(code: string, organizationId: string): Promise<Country> {
  const params = new URLSearchParams({ organization_id: organizationId });
  return apiFetch(`/countries/${encodeURIComponent(code)}?${params}`);
}

export function getStates(countryCode?: string, organizationId?: string): Promise<StateProvince[]> {
  const params = new URLSearchParams();
  if (countryCode) params.set("country_code", countryCode);
  if (organizationId) params.set("organization_id", organizationId);
  return fetchAllPages("/states", params);
}

export function getCities(stateId?: string, organizationId?: string): Promise<City[]> {
  const params = new URLSearchParams();
  if (stateId) params.set("state_id", stateId);
  if (organizationId) params.set("organization_id", organizationId);
  return fetchAllPages("/cities", params);
}

export function createCountry(body: { organization_id: string; code: string; name: string }): Promise<Country> {
  return apiFetch("/countries", { method: "POST", body: JSON.stringify(body) });
}

export function createState(body: { organization_id: string; country_code: string; name: string }): Promise<StateProvince> {
  return apiFetch("/states", { method: "POST", body: JSON.stringify(body) });
}

export function createCity(body: { state_id: string; name: string; timezone: string }): Promise<City> {
  return apiFetch("/cities", { method: "POST", body: JSON.stringify(body) });
}

export function createRegion(body: { city_id: string; name: string }, key: string): Promise<Region> {
  return apiFetch("/regions", { method: "POST", headers: { "Idempotency-Key": key }, body: JSON.stringify(body) });
}

export function updateRegion(id: string, body: { city_id: string; name: string; version: number }): Promise<Region> {
  return apiFetch(`/regions/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify(body) });
}

export type GeographyKind = "country" | "state" | "city" | "region";

export async function deleteGeography(kind: GeographyKind, id: string, organizationId?: string): Promise<void> {
  const resources: Record<GeographyKind, string> = {
    country: "countries", state: "states", city: "cities", region: "regions",
  };
  if (kind === "country" && !organizationId) throw new Error("Select a business before deleting its country.");
  const query = kind === "country" ? `?${new URLSearchParams({ organization_id: organizationId! })}` : "";
  await apiFetch<void>(`/${resources[kind]}/${encodeURIComponent(id)}${query}`, { method: "DELETE" });
}

export interface PlantFilters {
  organizationId?: string;
  countryCode?: string;
  brandId?: string;
  regionId?: string;
  /** Inactive plants are included unless this is true (they're still needed for trip history) */
  activeOnly?: boolean;
}

export async function getPlants(filters: PlantFilters = {}): Promise<PlantOut[]> {
  const params = new URLSearchParams();
  if (filters.organizationId) params.set("organization_id", filters.organizationId);
  if (filters.countryCode) params.set("country_code", filters.countryCode);
  if (filters.brandId) params.set("brand_id", filters.brandId);
  if (filters.regionId) params.set("region_id", filters.regionId);
  params.set("active_only", filters.activeOnly ? "true" : "false");
  const rows = await fetchAllPages<PlantResource>("/plants", params);
  return rows.map(normalizePlant);
}

export async function getPlant(plantId: string): Promise<PlantOut> {
  return normalizePlant(await apiFetch<PlantResource>(`/plants/${encodeURIComponent(plantId)}`));
}

/** The same idempotency key must be reused when retrying, so a timeout can't create a duplicate plant */
export async function createPlant(body: PlantCreate, idempotencyKey: string): Promise<PlantOut> {
  return normalizePlant(await apiFetch<PlantResource>("/plants", {
    method: "POST",
    headers: { "Idempotency-Key": idempotencyKey },
    body: JSON.stringify(body),
  }));
}

/** Send only changed fields; a stale version gets 409 PLANT_VERSION_CONFLICT */
export async function updatePlant(plantId: string, patch: PlantPatch): Promise<PlantOut> {
  return normalizePlant(await apiFetch<PlantResource>(`/plants/${encodeURIComponent(plantId)}`, {
    method: "PATCH",
    body: JSON.stringify(patch),
  }));
}

export async function setPlantActive(plant: PlantOut, active: boolean): Promise<PlantOut> {
  return updatePlant(plant.id, { active, version: plant.version });
}

export function isVersionConflict(e: unknown): e is ApiError {
  return e instanceof ApiError && e.status === 409 && e.code === "VERSION_CONFLICT";
}

export async function analyseBrand(req: BrandAnalysisRequest): Promise<BrandAnalysisResponse> {
  const res = await apiFetch<Omit<BrandAnalysisResponse, "results"> & {
    results: (Omit<PlantPredictionResult, "plant"> & { plant: PlantResource })[];
  }>("/plants/analyse", {
    method: "POST",
    body: JSON.stringify(req),
  });
  return {
    ...res,
    results: res.results.map((r) => ({ ...r, plant: normalizePlant(r.plant) })),
  };
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
