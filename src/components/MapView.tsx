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
}

export default function MapView({
  route,
  simState,
  truckPosition,
  animationPoints,
  currentPointIndex,
}: MapViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markersRef = useRef<L.Layer[]>([]);
  const routeLayerRef = useRef<L.Polyline | null>(null);
  const traversedLayerRef = useRef<L.Polyline | null>(null);
  const remainingLayerRef = useRef<L.Polyline | null>(null);
  const truckMarkerRef = useRef<L.Marker | null>(null);

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

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

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
    if (!map || !route?.polyline) return;

    clearLayers();

    const pts = decodePolyline(route.polyline) as [number, number][];

    // Start marker
    const startMarker = L.circleMarker(
      [route.start_lat, route.start_lng],
      {
        radius: 10,
        color: "white",
        fillColor: "#1a73e8",
        fillOpacity: 1,
        weight: 3,
      }
    )
      .bindPopup(route.resolved_start_address)
      .addTo(map);

    // End marker
    const endIcon = L.divIcon({
      html: '<div style="font-size:24px;">📍</div>',
      iconSize: [24, 24],
      iconAnchor: [12, 24],
      className: "",
    });
    const endMarker = L.marker([route.end_lat, route.end_lng], {
      icon: endIcon,
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

    map.fitBounds(routeLine.getBounds(), { padding: [60, 80] });
  }, [route, clearLayers]);

  /* ── Simulation: add truck + traversed/remaining when sim starts ── */
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    if (
      simState === "running" ||
      simState === "paused" ||
      simState === "finished"
    ) {
      // Remove static route line while simulating
      if (routeLayerRef.current) {
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

      // Truck marker
      if (!truckMarkerRef.current && animationPoints.length > 0) {
        const truckIcon = L.divIcon({
          html: '<img src="https://img.freepik.com/free-vector/truck-cement-mixer-cartoon-vector-icon-illustration-transportation-vehicle-icon-isolated-flat_138676-13348.jpg" alt="RMC Truck" style="width:40px;height:40px;filter:drop-shadow(0 2px 4px rgba(0,0,0,.35));border-radius:50%;background:white;padding:2px;" />',
          iconSize: [44, 44],
          iconAnchor: [22, 22],
          className: "",
        });
        truckMarkerRef.current = L.marker(animationPoints[0], {
          icon: truckIcon,
          zIndexOffset: 1000,
        }).addTo(map);
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
    }
  }, [simState, animationPoints]);

  /* ── Update truck position each tick ── */
  useEffect(() => {
    if (!truckPosition || !truckMarkerRef.current) return;

    truckMarkerRef.current.setLatLng(truckPosition);

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
  }, [truckPosition, currentPointIndex, animationPoints]);

  /* ── Replace remaining polyline on reroute ── */
  // This is handled by the parent passing new animationPoints

  return (
    <div
      ref={containerRef}
      className="w-full h-full"
      style={{ minHeight: "100%" }}
    />
  );
}
