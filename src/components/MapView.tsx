"use client";

import { useEffect, useRef, useCallback } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { decodePolyline, subsampleRoute } from "@/lib/polyline";
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
}

export default function MapView({
  route,
  simState,
  truckPosition,
  animationPoints,
  currentPointIndex,
  bottomInsetRatio = 0,
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
  const traversedLayerRef = useRef<L.Polyline | null>(null);
  const remainingLayerRef = useRef<L.Polyline | null>(null);
  const truckMarkerRef = useRef<L.Marker | null>(null);
  const fittedRouteIdRef = useRef<number | null>(null);

  const fitLocations = useCallback((points: L.LatLngTuple[], maxZoom: number) => {
    const map = mapRef.current;
    if (!map || !points.length) return;
    const mobile = !window.matchMedia("(min-width: 64rem)").matches;
    // The full sheet covers the map. Fit when it is lowered instead.
    if (mobile && insetRef.current >= 0.8) return;
    map.fitBounds(L.latLngBounds(points), {
      paddingTopLeft: [36, 96],
      paddingBottomRight: [36, mobile ? 40 + map.getSize().y * insetRef.current : 40],
      maxZoom,
    });
  }, []);

  const fitRoute = useCallback(() => {
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
  }, [fitLocations]);

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

    // Panels docking/undocking and device rotation resize the container without a window resize
    const ro = new ResizeObserver(() => {
      map.invalidateSize();
      fitRoute();
    });
    ro.observe(containerRef.current);

    return () => {
      ro.disconnect();
      map.remove();
      mapRef.current = null;
    };
  }, [fitRoute]);

  useEffect(() => {
    fitRoute();
  }, [bottomInsetRatio, fitRoute]);

  const hasDriverPosition = truckPosition !== null;
  useEffect(() => {
    if (hasDriverPosition) fitRoute();
  }, [hasDriverPosition, fitRoute]);

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
    if (traversedLayerRef.current) {
      map.removeLayer(traversedLayerRef.current);
      traversedLayerRef.current = null;
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
      { weight: 5, color: "#1a73e8", opacity: 1 }
    ).addTo(map);
    routeLayerRef.current = routeLine;

    // A reroute redraws the same route; keep the user's current zoom and pan
    if (fittedRouteIdRef.current === route.id) return;
    fittedRouteIdRef.current = route.id;
    fitRoute();
  }, [route, clearLayers, fitRoute]);

  /* ── Simulation: add truck + traversed/remaining when sim starts ── */
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    if (
      simState === "running" ||
      simState === "paused" ||
      simState === "finished"
    ) {
      // Swap the static line for the animated one only when there is an animated path (GPS mode has none)
      if (routeLayerRef.current && animationPoints.length > 0) {
        map.removeLayer(routeLayerRef.current);
        routeLayerRef.current = null;
      }

      // Shadow polyline (full path)
      if (!traversedLayerRef.current && animationPoints.length > 0) {
        const shadow = L.polyline(animationPoints, {
          weight: 8,
          color: "#1a73e8",
          opacity: 0.12,
        }).addTo(map);
        // Traversed (gray dashed)
        const traversed = L.polyline([], {
          weight: 5,
          color: "#9aa0a6",
          opacity: 0.6,
          dashArray: "6",
        }).addTo(map);
        // Remaining (blue)
        const remaining = L.polyline(animationPoints, {
          weight: 5,
          color: "#1a73e8",
          opacity: 1,
        }).addTo(map);

        markersRef.current.push(shadow);
        traversedLayerRef.current = traversed;
        remainingLayerRef.current = remaining;
      }

    }

    if (simState === "idle") {
      // Remove simulation layers, re-draw static route
      if (traversedLayerRef.current) {
        map.removeLayer(traversedLayerRef.current);
        traversedLayerRef.current = null;
      }
      if (remainingLayerRef.current) {
        map.removeLayer(remainingLayerRef.current);
        remainingLayerRef.current = null;
      }
      if (truckMarkerRef.current) {
        map.removeLayer(truckMarkerRef.current);
        truckMarkerRef.current = null;
      }
      if (!routeLayerRef.current && route?.polyline) {
        routeLayerRef.current = L.polyline(
          decodePolyline(route.polyline).map((p) => [p[0], p[1]] as L.LatLngTuple),
          { weight: 5, color: "#1a73e8", opacity: 1 }
        ).addTo(map);
      }
    }
  }, [simState, animationPoints, route]);

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

    if (traversedLayerRef.current) {
      traversedLayerRef.current.setLatLngs(
        animationPoints.slice(0, currentPointIndex + 1)
      );
    }
    if (remainingLayerRef.current) {
      remainingLayerRef.current.setLatLngs(
        animationPoints.slice(currentPointIndex)
      );
    }
  }, [truckPosition, currentPointIndex, animationPoints, route, simState]);

  /* ── Replace remaining polyline on reroute ── */
  // This is handled by the parent passing new animationPoints

  return (
    <div ref={containerRef} className="w-full h-full" style={{ minHeight: "100%" }} />
  );
}
