"use client";

import { useEffect, useRef, useCallback, useMemo } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { decodePolyline, remainingRoute } from "@/lib/polyline";
import type { RouteResponse, SimState } from "@/types/route";

/* ── Fix Leaflet default icon paths in Next.js ── */
delete (L.Icon.Default.prototype as unknown as Record<string, unknown>)
  ._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl:
    "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png",
  iconUrl:
    "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png",
  shadowUrl:
    "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png",
});

interface MapViewProps {
  route: RouteResponse | null;
  simState: SimState;
  simProgress: number; // 0–1
  truckPosition: [number, number] | null;
  animationPoints: [number, number][];
  currentPointIndex: number;
  /** Fraction of map height covered by the bottom sheet on small screens (0–1). */
  bottomInsetRatio?: number;
  remainingPolyline?: string;
  followDriver?: boolean;
}

export default function MapView({
  route,
  simState,
  truckPosition,
  animationPoints,
  currentPointIndex,
  bottomInsetRatio = 0,
  remainingPolyline,
  followDriver = false,
}: MapViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const insetRef = useRef(bottomInsetRatio);
  insetRef.current = bottomInsetRatio;
  const routeRef = useRef(route);
  routeRef.current = route;
  const positionRef = useRef(truckPosition);
  positionRef.current = truckPosition;
  const mapRef = useRef<L.Map | null>(null);
  const markersRef = useRef<L.Layer[]>([]);
  const routeLayerRef = useRef<L.Polyline | null>(null);
  const remainingLayerRef = useRef<L.Polyline | null>(null);
  const truckMarkerRef = useRef<L.Marker | null>(null);
  const fittedRouteIdRef = useRef<number | null>(null);
  const followRef = useRef(followDriver);
  followRef.current = followDriver;
  const manualViewRef = useRef(false);
  const resumeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const clearResumeTimer = useCallback(() => {
    if (resumeTimerRef.current !== null) {
      clearTimeout(resumeTimerRef.current);
      resumeTimerRef.current = null;
    }
  }, []);
  const programmaticViewRef = useRef(false);
  const fullPoints = useMemo(() => route?.polyline ? decodePolyline(route.polyline) : [], [route?.polyline]);
  const currentPoints = useMemo(() => {
    if (animationPoints.length) return animationPoints.slice(currentPointIndex);
    const points = remainingPolyline ? decodePolyline(remainingPolyline) : fullPoints;
    return truckPosition ? remainingRoute(points, truckPosition)?.points ?? points : points;
  }, [animationPoints, currentPointIndex, remainingPolyline, fullPoints, truckPosition]);

  const followPosition = useCallback(() => {
    const map = mapRef.current;
    const position = positionRef.current;
    if (!map || !position || manualViewRef.current ||
        (!window.matchMedia("(min-width: 64rem)").matches && insetRef.current >= 0.8)) return;
    const mobile = !window.matchMedia("(min-width: 64rem)").matches;
    const point = map.project(position, 17);
    // Keep the driver above the mobile sheet or desktop status overlay.
    const offset = mobile ? map.getSize().y * insetRef.current / 2 : Math.min(60, map.getSize().y / 4);
    const center = map.unproject(L.point(point.x, point.y + offset), 17);
    programmaticViewRef.current = true;
    map.setView(center, 17, { animate: false });
    programmaticViewRef.current = false;
  }, []);

  const fitLocations = useCallback((points: L.LatLngTuple[], maxZoom: number) => {
    const map = mapRef.current;
    if (!map || !points.length) return;
    const mobile = !window.matchMedia("(min-width: 64rem)").matches;
    // The full sheet covers the map. Fit when it is lowered instead.
    if (mobile && insetRef.current >= 0.8) return;
    programmaticViewRef.current = true;
    map.fitBounds(L.latLngBounds(points), {
      paddingTopLeft: [36, 96],
      paddingBottomRight: [36, mobile ? 40 + map.getSize().y * insetRef.current : 40],
      maxZoom,
      animate: false,
    });
    programmaticViewRef.current = false;
  }, []);

  const fitRoute = useCallback(() => {
    if (followRef.current && positionRef.current) {
      followPosition();
      return;
    }
    if (manualViewRef.current) return;
    const currentRoute = routeRef.current;
    const position = positionRef.current;
    const points: L.LatLngTuple[] = currentRoute
      ? [
          ...(currentRoute.polyline ? decodePolyline(currentRoute.polyline) : []) as L.LatLngTuple[],
          [currentRoute.start_lat, currentRoute.start_lng],
          [currentRoute.end_lat, currentRoute.end_lng],
        ]
      : [];
    if (position) points.push(position);
    fitLocations(points, currentRoute ? 16 : 15);
  }, [fitLocations, followPosition]);

  /* ── Initialize map once ── */
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = L.map(containerRef.current, {
      center: [-36.85, 174.76], // Auckland default
      zoom: 11,
      zoomControl: true,
      attributionControl: true,
    });

    L.tileLayer(
      "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
      {
        maxZoom: 19,
        attribution:
          '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      }
    ).addTo(map);

    mapRef.current = map;
    const onManualView = () => {
      if (programmaticViewRef.current) return;
      clearResumeTimer();
      manualViewRef.current = true;
    };
    map.on("movestart zoomstart", onManualView);
    const resumeDriverView = () => {
      if (programmaticViewRef.current || !followRef.current || !manualViewRef.current) return;
      clearResumeTimer();
      resumeTimerRef.current = setTimeout(() => {
        resumeTimerRef.current = null;
        if (!followRef.current) return;
        manualViewRef.current = false;
        followPosition();
      }, 10_000);
    };
    map.on("moveend zoomend", resumeDriverView);

    // Panels docking/undocking and device rotation resize the container without a window resize
    const ro = new ResizeObserver(() => {
      programmaticViewRef.current = true;
      map.invalidateSize();
      programmaticViewRef.current = false;
      fitRoute();
    });
    ro.observe(containerRef.current);

    return () => {
      clearResumeTimer();
      ro.disconnect();
      map.remove();
      mapRef.current = null;
    };
  }, [fitRoute, followPosition, clearResumeTimer]);

  useEffect(() => {
    clearResumeTimer();
    manualViewRef.current = false;
    fitRoute();
  }, [bottomInsetRatio, followDriver, fitRoute, clearResumeTimer]);

  useEffect(() => {
    if (followDriver && truckPosition) followPosition();
  }, [followDriver, truckPosition, followPosition]);

  /* ── Clear previous layers helper ── */
  const clearLayers = useCallback(() => {
    const map = mapRef.current;
    if (!map) return;
    markersRef.current.forEach((l) => map.removeLayer(l));
    markersRef.current = [];
    if (routeLayerRef.current) {
      map.removeLayer(routeLayerRef.current);
      routeLayerRef.current = null;
    }
    if (remainingLayerRef.current) {
      map.removeLayer(remainingLayerRef.current);
      remainingLayerRef.current = null;
    }
    if (truckMarkerRef.current) {
      map.removeLayer(truckMarkerRef.current);
      truckMarkerRef.current = null;
    }
  }, []);

  /* ── Draw static route when route changes ── */
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    clearLayers();
    if (!route) {
      fittedRouteIdRef.current = null;
      return;
    }

    const pts = route.polyline ? decodePolyline(route.polyline) as [number, number][] : [];

    // Start marker
    const startIcon = L.icon({
      iconUrl: "/markers/plant.svg",
      iconSize: [56, 64],
      iconAnchor: [28, 62],
      popupAnchor: [0, -54],
    });
    const startMarker = L.marker([route.start_lat, route.start_lng], {
      icon: startIcon,
      alt: "Plant / route start",
      title: "Plant / route start",
    })
      .bindPopup(route.resolved_start_address)
      .addTo(map);

    // End marker
    const endIcon = L.icon({
      iconUrl: "/markers/destination.svg",
      iconSize: [56, 64],
      iconAnchor: [28, 62],
      popupAnchor: [0, -54],
    });
    const endMarker = L.marker([route.end_lat, route.end_lng], {
      icon: endIcon,
      alt: "Destination / job site",
      title: "Destination / job site",
    })
      .bindPopup(route.resolved_end_address)
      .addTo(map);

    markersRef.current = [startMarker, endMarker];

    // Route polyline
    const routeLine = L.polyline(
      pts.map((p) => [p[0], p[1]] as L.LatLngTuple),
      { weight: 7, color: "#b6a1dc", opacity: 0.8 }
    ).addTo(map);
    routeLayerRef.current = routeLine;

    // A reroute redraws the same route; keep the user's current zoom and pan
    if (fittedRouteIdRef.current === route.id) return;
    fittedRouteIdRef.current = route.id;
    manualViewRef.current = false;
    fitRoute();
  }, [route, clearLayers, fitRoute]);

  /* The full planned route stays visible underneath the current remaining road path. */
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    if (remainingLayerRef.current) {
      map.removeLayer(remainingLayerRef.current);
      remainingLayerRef.current = null;
    }
    if (route && currentPoints.length && simState !== "finished") {
      remainingLayerRef.current = L.polyline(currentPoints, { weight: 5, color: "#6750a4", opacity: 1 }).addTo(map);
    }
  }, [currentPoints, route, simState]);

  /* ── Show current driver position in simulation and GPS modes ── */
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    if (!truckPosition) {
      if (truckMarkerRef.current) {
        map.removeLayer(truckMarkerRef.current);
        truckMarkerRef.current = null;
      }
      return;
    }

    if (!truckMarkerRef.current) {
      const truckIcon = L.divIcon({
        html: '<img src="https://img.freepik.com/free-vector/truck-cement-mixer-cartoon-vector-icon-illustration-transportation-vehicle-icon-isolated-flat_138676-13348.jpg" alt="Driver location" style="width:40px;height:40px;filter:drop-shadow(0 2px 4px rgba(0,0,0,.35));border-radius:50%;background:white;padding:2px;" />',
        iconSize: [44, 44],
        iconAnchor: [22, 22],
        className: "",
      });
      truckMarkerRef.current = L.marker(truckPosition, {
        icon: truckIcon,
        zIndexOffset: 1000,
        alt: "Driver location",
      })
        .bindPopup("Driver's current location")
        .addTo(map);
    } else {
      truckMarkerRef.current.setLatLng(truckPosition);
    }

  }, [truckPosition, currentPointIndex, animationPoints, route, simState]);

  /* ── Replace remaining polyline on reroute ── */
  // This is handled by the parent passing new animationPoints

  return (
    <div ref={containerRef} className="w-full h-full" style={{ minHeight: "100%" }} />
  );
}
