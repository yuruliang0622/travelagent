"use client";

import { useEffect, useMemo, useRef } from "react";
import type { LatLngBoundsExpression, LayerGroup, Map as LeafletMap } from "leaflet";
import type { ItineraryDay, MapPlace } from "@/types/trip";

const categoryColors: Record<MapPlace["category"], string> = {
  airport: "#0f172a",
  hotel: "#f97316",
  restaurant: "#ef4444",
  attraction: "#2563eb",
  shopping: "#8b5cf6",
  transit: "#0891b2",
  culture: "#059669",
  wellness: "#0d9488",
};

interface TripMapProps {
  places: MapPlace[];
  activeDay: ItineraryDay;
}

export function TripMap({ places, activeDay }: TripMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  const markerLayerRef = useRef<LayerGroup | null>(null);
  const activePlaceIds = useMemo(() => new Set(activeDay.placeIds), [activeDay.placeIds]);
  const visiblePlaces = useMemo(
    () =>
      activeDay.id === "overview"
        ? places
        : places.filter((place) => activePlaceIds.has(place.id)),
    [activeDay.id, activePlaceIds, places],
  );

  useEffect(() => {
    let cancelled = false;

    async function renderMap() {
      const leaflet = await import("leaflet");
      if (cancelled || !containerRef.current) return;

      if (!mapRef.current) {
        mapRef.current = leaflet
          .map(containerRef.current, {
            attributionControl: false,
            scrollWheelZoom: false,
            zoomControl: true,
          })
          .setView([35.68, 139.76], 7);

        leaflet
          .tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
            maxZoom: 19,
          })
          .addTo(mapRef.current);

        leaflet.control.attribution({ prefix: false }).addAttribution("OpenStreetMap").addTo(mapRef.current);
      }

      if (markerLayerRef.current) {
        markerLayerRef.current.remove();
      }

      const markerLayer = leaflet.layerGroup().addTo(mapRef.current);
      markerLayerRef.current = markerLayer;

      visiblePlaces.forEach((place) => {
        const isActive = activePlaceIds.has(place.id);
        const marker = leaflet.marker([place.lat, place.lng], {
          icon: leaflet.divIcon({
            className: "",
            html: `<span style="
              display:block;
              width:${isActive ? 18 : 14}px;
              height:${isActive ? 18 : 14}px;
              border-radius:999px;
              background:${categoryColors[place.category]};
              border:3px solid white;
              box-shadow:0 8px 18px rgba(15,23,42,.28);
            "></span>`,
            iconSize: [24, 24],
            iconAnchor: [12, 12],
          }),
        });

        marker
          .bindPopup(
            `<strong>${place.name}</strong><br/><span>${place.neighborhood}</span><br/><a href="${place.googleMapsUrl}" target="_blank" rel="noreferrer">Open in Google Maps</a>`,
          )
          .addTo(markerLayer);
      });

      if (visiblePlaces.length > 0) {
        const bounds = visiblePlaces.map((place) => [place.lat, place.lng]) as LatLngBoundsExpression;
        mapRef.current.fitBounds(bounds, {
          maxZoom: activeDay.id === "overview" ? 9 : 13,
          padding: [42, 42],
        });
      }

      window.setTimeout(() => mapRef.current?.invalidateSize(), 0);
    }

    renderMap();

    return () => {
      cancelled = true;
    };
  }, [activeDay.id, activePlaceIds, visiblePlaces]);

  useEffect(() => {
    return () => {
      mapRef.current?.remove();
      mapRef.current = null;
      markerLayerRef.current = null;
    };
  }, []);

  return (
    <div className="relative h-[310px] overflow-hidden border-b border-slate-200 bg-slate-100 md:h-[360px]">
      <div ref={containerRef} className="h-full w-full" />
      <div className="pointer-events-none absolute left-4 top-4 rounded-full bg-white/95 px-3 py-1.5 text-xs font-semibold text-slate-600 shadow-sm ring-1 ring-slate-200">
        {activeDay.id === "overview" ? "Japan route overview" : activeDay.title}
      </div>
      <div className="absolute bottom-4 right-4 rounded-lg bg-white/95 p-3 shadow-sm ring-1 ring-slate-200">
        <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs font-semibold text-slate-600">
          {Object.entries(categoryColors)
            .filter(([category]) =>
              visiblePlaces.some((place) => place.category === category),
            )
            .slice(0, 6)
            .map(([category, color]) => (
              <span key={category} className="inline-flex items-center gap-2">
                <span
                  className="size-2.5 rounded-full"
                  style={{ backgroundColor: color }}
                />
                {category}
              </span>
            ))}
        </div>
      </div>
    </div>
  );
}
