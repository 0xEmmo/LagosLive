'use client';

import { useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import 'mapbox-gl/dist/mapbox-gl.css';
import type {
  CircleLayerSpecification,
  HeatmapLayerSpecification,
  LngLatLike,
  Map as MapboxMap,
  MapLayerMouseEvent,
  SymbolLayerSpecification,
} from 'mapbox-gl';
import type { Party } from '@/lib/types';
import { VC, VIBE_LABEL, partyPhoto } from '@/lib/data';

const LAGOS_CENTER: LngLatLike = [3.42, 6.445];
const LAGOS_ZOOM = 11.5;

const EMPTY_FC = {
  type: 'FeatureCollection' as const,
  features: [
    {
      type: 'Feature' as const,
      geometry: { type: 'Point' as const, coordinates: [0, 0] as [number, number] },
      properties: {},
    },
  ],
};

interface FeatureLike {
  properties?: Record<string, string | number | boolean | undefined>;
  geometry?: { type?: string; coordinates?: [number, number] };
}

interface ClusterSource {
  setData(data: unknown): void;
  getClusterExpansionZoom(clusterId: number, callback: (error: Error | null, zoom: number) => void): void;
}

interface EventMapProps {
  parties: Party[];
  userLocation?: { lat: number; lng: number } | null;
  onSelectParty?: (id: number) => void;
  showHeatmap?: boolean;
  single?: boolean;
}

function esc(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function toGeoJSON(parties: Party[]) {
  return {
    type: 'FeatureCollection' as const,
    features: parties
      .filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lng))
      .map((p) => ({
        type: 'Feature' as const,
        geometry: { type: 'Point' as const, coordinates: [p.lng, p.lat] as [number, number] },
        properties: { id: p.id, vibe: p.vibe, label: VIBE_LABEL[p.vibe] },
      })),
  };
}

function userFeature(lat: number, lng: number) {
  return {
    type: 'FeatureCollection' as const,
    features: [
      {
        type: 'Feature' as const,
        geometry: { type: 'Point' as const, coordinates: [lng, lat] as [number, number] },
        properties: {},
      },
    ],
  };
}

// Compact Lagos Live popup built as HTML (Mapbox popups take raw strings). Uses
// the canonical cover URL (partyPhoto) with the gradient-only fallback when an
// event has no uploaded image.
function popupHtml(party: Party) {
  const img = partyPhoto(party.id, party.coverUrl);
  const cover = img
    ? `<img src="${esc(img)}" alt="${esc(party.title)}" style="width:100%;height:88px;object-fit:cover;display:block" />`
    : `<div style="height:88px;background:${party.gradient}"></div>`;
  const priceLabel = party.feeNum === 0 ? 'Free' : party.fee;
  return `
    <style>
      .llpopup .mapboxgl-popup-content { background:#171725; border-radius:14px; padding:0; border:1px solid rgba(255,255,255,0.1); overflow:hidden; box-shadow:0 14px 40px rgba(0,0,0,0.5); width:252px; }
      .llpopup .mapboxgl-popup-content .mapboxgl-popup-close-button { color:#A7A8B5; font-size:18px; padding:6px 8px; z-index:2; }
      .llpopup .mapboxgl-popup-tip { border-top-color:#171725; }
    </style>
    <div style="position:relative;height:88px">
      ${cover}
      <span style="position:absolute;left:8px;bottom:8px;background:${party.vibe in VC ? VC[party.vibe] : '#FF2D95'};color:#fff;padding:2px 9px;border-radius:12px;font:700 10px/1.5 'Montserrat',sans-serif;text-transform:uppercase;letter-spacing:0.4px">${esc(party.vibe)}</span>
    </div>
    <div style="padding:10px 12px 12px">
      <div style="font:700 14px/1.35 'Montserrat',sans-serif;color:#fff;margin-bottom:3px">${esc(party.title)}</div>
      <div style="color:#A7A8B5;font-size:12px;line-height:1.5;margin-bottom:2px">${esc(party.date)} &middot; ${esc(party.time)}</div>
      <div style="color:#A7A8B5;font-size:12px;line-height:1.5;margin-bottom:10px">${esc(party.location)}</div>
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">
        <span style="color:#00F5D4;font-weight:700;font-size:14px">${esc(priceLabel)}</span>
        <span style="color:#6B6C80;font-size:10px;text-transform:uppercase;letter-spacing:0.4px">${party.feeNum === 0 ? 'Free Entry' : 'Starting price'}</span>
      </div>
      <button type="button" data-ll-view="${party.id}" style="width:100%;background:linear-gradient(135deg,#FF2D95,#8A2BE2);border:none;border-radius:8px;padding:9px;color:#fff;font:700 12px/1 'Montserrat',sans-serif;cursor:pointer">View Event</button>
    </div>`;
}

function vibeColor(vibe: string) {
  return vibe in VC ? VC[vibe as keyof typeof VC] : '#FF2D95';
}

export default function EventMap({ parties, userLocation, onSelectParty, showHeatmap = false, single = false }: EventMapProps) {
  const router = useRouter();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MapboxMap | null>(null);
  const popupRef = useRef<HTMLElement | null>(null);
  const onSelectRef = useRef(onSelectParty);
  onSelectRef.current = onSelectParty;
  const partiesRef = useRef(parties);
  partiesRef.current = parties;
  const userLocationRef = useRef(userLocation);
  userLocationRef.current = userLocation;
  const showHeatmapRef = useRef(showHeatmap);
  showHeatmapRef.current = showHeatmap;
  const singleRef = useRef(single);
  singleRef.current = single;

  const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;

  // Init map once per mount. Mapbox is loaded lazily on the client (never SSR)
  // and torn down on unmount so no instances leak across route changes.
  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    let map: MapboxMap | null = null;

    (async () => {
      const { default: mapboxgl } = await import('mapbox-gl');
      if (cancelled || mapRef.current || !containerRef.current) return;
      mapboxgl.accessToken = token;

      const center: LngLatLike =
        singleRef.current && partiesRef.current[0]
          ? [partiesRef.current[0].lng, partiesRef.current[0].lat]
          : LAGOS_CENTER;
      const zoom = singleRef.current ? 13 : LAGOS_ZOOM;

      const m = new mapboxgl.Map({
        container: containerRef.current,
        style: 'mapbox://styles/mapbox/dark-v11',
        center,
        zoom,
        maxZoom: 18,
      });
      map = m;
      mapRef.current = m;

      m.addControl(new mapboxgl.NavigationControl({ showCompass: true, visualizePitch: false }), 'bottom-right');
      m.addControl(new mapboxgl.FullscreenControl(), 'bottom-right');

      m.on('load', () => {
        if (cancelled) {
          m.remove();
          mapRef.current = null;
          return;
        }
        m.addSource('events', {
          type: 'geojson',
          data: EMPTY_FC,
          cluster: !singleRef.current,
          clusterMaxZoom: 13,
          clusterRadius: 48,
        });
        m.addSource('user', { type: 'geojson', data: EMPTY_FC });

        const heatLayer: HeatmapLayerSpecification = {
          id: 'events-heat',
          type: 'heatmap',
          source: 'events',
          maxzoom: 16,
          paint: {
            'heatmap-weight': 0.85,
            'heatmap-intensity': 0.55,
            'heatmap-radius': ['interpolate', ['linear'], ['zoom'], 8, 20, 14, 42],
            'heatmap-opacity': 0.7,
            'heatmap-color': [
              'interpolate',
              ['linear'],
              ['heatmap-density'],
              0, 'rgba(0,191,255,0)',
              0.22, 'rgba(0,191,255,0.5)',
              0.5, 'rgba(138,43,226,0.72)',
              0.78, 'rgba(255,45,149,0.88)',
              1, 'rgba(255,214,0,0.95)',
            ],
          },
        };
        m.addLayer(heatLayer);

        const clusterLayer: CircleLayerSpecification = {
          id: 'events-clusters',
          type: 'circle',
          source: 'events',
          filter: ['has', 'point_count'],
          paint: {
            'circle-color': '#FF2D95',
            'circle-radius': ['interpolate', ['linear'], ['zoom'], 1, 18, 10, 24, 25, 34],
            'circle-stroke-width': 2,
            'circle-stroke-color': '#0B0B10',
          },
        };
        m.addLayer(clusterLayer);

        const clusterCountLayer: SymbolLayerSpecification = {
          id: 'events-cluster-count',
          type: 'symbol',
          source: 'events',
          filter: ['has', 'point_count'],
          layout: {
            'text-field': ['get', 'point_count'],
            'text-size': 12,
            'text-font': ['DIN Pro Bold'],
          },
          paint: { 'text-color': '#FFFFFF' },
        };
        m.addLayer(clusterCountLayer);

        const pointLayer: CircleLayerSpecification = {
          id: 'events-points',
          type: 'circle',
          source: 'events',
          filter: ['!', ['has', 'point_count']],
          paint: {
            'circle-radius': 9,
            'circle-color': [
              'match',
              ['get', 'vibe'],
              'Club', VC.Club,
              'Rooftop', VC.Rooftop,
              'Festival', VC.Festival,
              'Concert', VC.Concert,
              'House Party', VC['House Party'],
              'Lounge', VC.Lounge,
              '#FF2D95',
            ],
            'circle-stroke-width': 1.5,
            'circle-stroke-color': 'rgba(255,255,255,0.85)',
          },
        };
        m.addLayer(pointLayer);

        const pointLabelLayer: SymbolLayerSpecification = {
          id: 'events-point-labels',
          type: 'symbol',
          source: 'events',
          filter: ['!', ['has', 'point_count']],
          layout: {
            'text-field': ['get', 'label'],
            'text-size': 8,
            'text-font': ['DIN Pro Bold'],
          },
          paint: { 'text-color': '#FFFFFF' },
        };
        m.addLayer(pointLabelLayer);

        const userLocationLayer: CircleLayerSpecification = {
          id: 'user-location',
          type: 'circle',
          source: 'user',
          paint: {
            'circle-radius': 8,
            'circle-color': '#00F5D4',
            'circle-stroke-width': 3,
            'circle-stroke-color': '#0B0B10',
          },
        };
        m.addLayer(userLocationLayer);

        m.on('click', 'events-clusters', (e: MapLayerMouseEvent) => {
          const feature = e.features?.[0] as FeatureLike | undefined;
          const source = m.getSource('events') as ClusterSource | undefined;
          const featureProps = feature?.properties;
          const clusterId = featureProps?.cluster_id as number | undefined;
          if (!source || typeof clusterId !== 'number') return;
          source.getClusterExpansionZoom(clusterId, (err, zoom) => {
            if (err) return;
            m.easeTo({ center: feature!.geometry!.coordinates as LngLatLike, zoom });
          });
        });

        m.on('click', 'events-points', (e: MapLayerMouseEvent) => {
          const feature = e.features?.[0] as FeatureLike | undefined;
          const id = feature?.properties?.id as number | undefined;
          const party = partiesRef.current.find((p) => p.id === id);
          if (!party || !feature?.geometry) return;

          const coords = feature.geometry.coordinates as LngLatLike;

          popupRef.current?.remove();
          const popup = new mapboxgl.Popup({ offset: [0, -14], closeButton: true, maxWidth: 'none', className: 'llpopup' })
            .setLngLat(coords)
            .setHTML(popupHtml(party));
          popup.on('open', () => {
            const el = popup.getElement();
            if (!el) return;
            const btn = el.querySelector<HTMLElement>('[data-ll-view]');
            btn?.addEventListener('click', (ev) => {
              ev.preventDefault();
              const action = onSelectRef.current ?? ((pid: number) => router.push(`/party/${pid}`));
              action(party.id);
            });
          });
          popup.addTo(m);
          popupRef.current = popup.getElement() ?? null;
        });

        m.on('mouseenter', 'events-clusters', () => { m.getCanvas().style.cursor = 'pointer'; });
        m.on('mouseleave', 'events-clusters', () => { m.getCanvas().style.cursor = ''; });
        m.on('mouseenter', 'events-points', () => { m.getCanvas().style.cursor = 'pointer'; });
        m.on('mouseleave', 'events-points', () => { m.getCanvas().style.cursor = ''; });

        (m.getSource('events') as ClusterSource).setData(toGeoJSON(partiesRef.current));
        if (userLocationRef.current) {
          (m.getSource('user') as ClusterSource).setData(
            userFeature(userLocationRef.current.lat, userLocationRef.current.lng),
          );
        }
        m.setLayoutProperty('events-heat', 'visibility', showHeatmapRef.current ? 'visible' : 'none');
        mapRef.current = m;
      });
    })();

    return () => {
      cancelled = true;
      popupRef.current?.remove();
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, [token, router]);

  // Keep markers in sync when the filtered party list changes (filters/search).
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const source = map.getSource('events') as ClusterSource | undefined;
    if (!source) return;
    source.setData(toGeoJSON(parties));
    if (single && parties[0]) {
      map.easeTo({ center: [parties[0].lng, parties[0].lat], zoom: 13 });
    }
  }, [parties, single]);

  // Heatmap toggle.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (!map.getLayer('events-heat')) return;
    map.setLayoutProperty('events-heat', 'visibility', showHeatmap ? 'visible' : 'none');
  }, [showHeatmap]);

  // User location marker (only ever set after an explicit "Use my location" click).
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const source = map.getSource('user') as ClusterSource | undefined;
    if (!source) return;
    if (!userLocation) {
      source.setData(EMPTY_FC);
      return;
    }
    source.setData(userFeature(userLocation.lat, userLocation.lng));
    map.easeTo({ center: [userLocation.lng, userLocation.lat], duration: 800 });
  }, [userLocation]);

  if (!token) {
    return (
      <div
        role="application"
        aria-label="Map unavailable"
        className="flex h-full w-full flex-col items-center justify-center gap-1"
        style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)' }}
      >
        <div className="text-[13px] font-semibold" style={{ color: '#A7A8B5' }}>Map unavailable</div>
        <div className="max-w-[220px] text-center text-[11px]" style={{ color: '#6B6C80' }}>Set NEXT_PUBLIC_MAPBOX_TOKEN to enable event maps.</div>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      role="application"
      aria-label="Map of events on Lagos Live"
      className="h-full w-full"
    />
  );
}