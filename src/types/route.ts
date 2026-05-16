/* â”€â”€ Route domain types matching the FastAPI backend schemas â”€â”€ */

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

/* â”€â”€ Simulation types â”€â”€ */

export type SimState = "idle" | "running" | "paused" | "finished";

/* â”€â”€ Trip types â”€â”€ */

export type TripStatus = "pending" | "in_progress" | "paused" | "completed" | "cancelled";

export type TripEventType = 
  | "trip_started"
  | "trip_paused"
  | "trip_resumed"
  | "trip_completed"
  | "trip_cancelled"
  | "position_update"
  | "traffic_check"
  | "reroute_suggested"
  | "reroute_applied"
  | "eta_updated"
  | "delay_detected"
  | "delay_cleared";

export interface TripStartRequest {
  route_id: number;
  vehicle_id?: string;
}

export interface TripPositionUpdate {
  lat: number;
  lng: number;
  heading?: number;
  speed_kmh?: number;
}

export interface TripEventResponse {
  id: number;
  trip_id: number;
  event_type: TripEventType;
  data: Record<string, any>;
  lat?: number;
  lng?: number;
  created_at: string;
}

export interface TripResponse {
  id: number;
  route_id: number;
  status: TripStatus;
  
  current_lat?: number;
  current_lng?: number;
  heading?: number;
  
  start_address: string;
  end_address: string;
  start_lat: number;
  start_lng: number;
  end_lat: number;
  end_lng: number;
  
  vehicle_type: string;
  vehicle_id?: string;
  priority: string;
  avoid_options?: string[];
  
  current_polyline?: string;
  original_distance_meters: number;
  original_duration_seconds: number;
  remaining_distance_meters?: number;
  remaining_duration_seconds?: number;
  current_traffic_delay?: number;
  
  reroute_count: number;
  last_reroute_at?: string;
  last_traffic_check_at?: string;
  estimated_arrival?: string;
  
  started_at?: string;
  completed_at?: string;
  created_at: string;
  updated_at: string;
  
  recent_events?: TripEventResponse[];

  // RMC / dispatch fields
  batch_time?: string;
  load_expiry_time?: string;
  load_status?: string;
  load_minutes_remaining?: number;
  load_max_life_minutes?: number;
  mix_code?: string;
  concrete_grade?: string;
  volume_m3?: number;
  plant_id?: string;
  pour_duration_minutes?: number;
  scheduled_at?: string;
  concrete_mix?: string;
  outcome?: string;
}

export interface TripRerouteInfo {
  trip_id: number;
  reroute_number: number;
  reason: string;
  old_duration_seconds: number;
  new_duration_seconds: number;
  new_distance_meters: number;
  traffic_delay_seconds: number;
  new_polyline: string;
  new_steps: RouteStep[];
  applied: boolean;
}

export interface SSETripEvent {
  type: "reroute" | "position" | "traffic_ok" | "status" | "heartbeat";
  data: any;
}

export interface SimulationConfig {
  speed: number; // animation multiplier
  checkInterval: number; // how often to check traffic (in animation ticks)
}

/*  Plants & Dispatch types  */

export interface PlantOut {
  id: string;
  name: string;
  brand: string;
  address: string;
  lat: number;
  lng: number;
  region: string;
  active: boolean;
}

export interface PlantCreate {
  name: string;
  brand: string;
  address: string;
  lat: number;
  lng: number;
  region: string;
  active: boolean;
}

export interface PlantUpdate {
  name?: string;
  brand?: string;
  address?: string;
  lat?: number;
  lng?: number;
  region?: string;
  active?: boolean;
}

export interface JobSite {
  id: string;        // uuid generated client-side
  name: string;      // friendly label e.g. "Newmarket Countdown"
  address: string;
  notes?: string;
  created_at: string;
}

export interface PlantPredictionResult {
  plant: PlantOut;
  google_eta_minutes?: number;
  adjusted_eta_minutes?: number;
  remaining_life_minutes?: number;
  buffer_depletion_rate?: number;
  delay_constant_used?: number;
  risk_level?: string;
  success_probability?: number;
  recommendation?: string;
  llm_analysis?: Record<string, unknown>;
  error?: string;
}

export interface BrandAnalysisRequest {
  brand: string;
  job_site_data: Record<string, unknown>;
  concrete_mix?: string;
  top_n?: number;
  include_llm_analysis?: boolean;
}

export interface BrandAnalysisResponse {
  brand: string;
  job_site_address: string;
  concrete_mix: string;
  total_plants_analysed: number;
  results: PlantPredictionResult[];
  best_plant_id?: string;
}

export interface DispatchRequest {
  plant_id: string;
  job_site_address: string;
  concrete_mix?: string;
  scheduled_at: string;
  vehicle_id?: string;
  volume_m3?: number;
  pour_duration_minutes?: number;
  prediction_snapshot?: Record<string, unknown>;
}

export interface DispatchResponse {
  trip_id: number;
  route_id: number;
  status: string;
  plant_id: string;
  plant_name: string;
  plant_address: string;
  job_site_address: string;
  concrete_mix: string;
  scheduled_at: string;
  distance_meters?: number;
  estimated_duration_minutes?: number;
  created_at: string;
}

export interface TripBeginRequest {
  batch_time?: string;
  mix_code?: string;
  concrete_grade?: string;
  volume_m3?: number;
  requires_retarder?: boolean;
  pour_duration_minutes?: number;
}

export interface TripCompleteRequest {
  success?: boolean;
  notes?: string;
}

