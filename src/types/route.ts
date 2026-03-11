/* ── Route domain types matching the FastAPI backend schemas ── */

export interface Coordinate {
  latitude: number;
  longitude: number;
}

export interface LocationRequest {
  address: string;
}

export interface RouteCreate {
  start: LocationRequest;
  end: LocationRequest;
  vehicle_type?: string;
  vehicle_id?: string;
  load_weight?: number;
  load_volume?: number;
  departure_datetime?: string;
  priority?: string;
  max_delivery_minutes?: number;
  request_alternatives?: boolean;
  avoid?: string[];
  waypoints?: Coordinate[];
  route_index?: number;
}

export interface RouteStep {
  start_location: Coordinate;
  end_location: Coordinate;
  instruction: string;
  distance_meters: number;
  duration_seconds: number;
}

export interface AlternativeSummary {
  index: number;
  distance_km: number;
  duration_mins: number;
  summary: string;
  warnings: string[];
}

export interface RouteResponse {
  id: number;
  start: LocationRequest;
  end: LocationRequest;
  resolved_start_address: string;
  resolved_end_address: string;
  start_lat: number;
  start_lng: number;
  end_lat: number;
  end_lng: number;
  vehicle_type: string;
  vehicle_id?: string;
  load_weight?: number;
  load_volume?: number;
  departure_datetime?: string;
  priority: string;
  max_delivery_minutes?: number;
  distance_meters: number;
  duration_seconds: number;
  traffic_delay_seconds?: number;
  exceeds_delivery_limit?: boolean;
  delivery_limit_exceeded_by?: number;
  polyline?: string;
  route_steps?: RouteStep[];
  total_alternatives: number;
  selected_route_index: number;
  alternatives_summary?: AlternativeSummary[];
  avoid?: string[];
  request_alternatives?: boolean;
  route_index?: number;
  created_at: string;
  updated_at: string;
}

export interface RerouteRequest {
  current_lat: number;
  current_lng: number;
  end: LocationRequest;
  vehicle_type?: string;
  priority?: string;
  avoid?: string[];
}

export interface RerouteResponse {
  distance_meters: number;
  duration_seconds: number;
  traffic_delay_seconds?: number;
  polyline?: string;
  route_steps?: RouteStep[];
  reroute_recommended: boolean;
  reason?: string;
}

/* ── Simulation types ── */

export type SimState = "idle" | "running" | "paused" | "finished";

export interface SimulationConfig {
  speed: number; // animation multiplier
  checkInterval: number; // how often to check traffic (in animation ticks)
}
