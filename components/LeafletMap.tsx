'use client';

import { useEffect, useRef } from 'react';
import 'leaflet/dist/leaflet.css';
import 'leaflet.markercluster/dist/MarkerCluster.css';
import 'leaflet.markercluster/dist/MarkerCluster.Default.css';
import type L from 'leaflet';
import type { Party } from '@/lib/types';
import { VC, VIBE_LABEL, distanceColor } from '@/lib/data';

interface LeafletMapProps {
  parties: Party[];
  userLocation: { lat: number; lng: number } | null;
  onSelectParty: (id: number) => void;
  showHeatmap?: boolean;
}

export default function LeafletMap({ parties, userLocation, onSelectParty, showHeatmap = false }: LeafletMapProps) {
  const mapRef = useRef<L.Map | null>(null);
  const clusterRef = useRef<any>(null);
  const heatRef = useRef<any>(null);
  const userMarkerRef = useRef<L.Marker | null>(null);
  const onSelectRef = useRef(onSelectParty);
  onSelectRef.current = onSelectParty;
  const showHeatmapRef = useRef(showHeatmap);
  showHeatmapRef.current = showHeatmap;

  // Init map once
  useEffect(() => {
    let cancelled = false;

    (async () => {
      const leaflet = (await import('leaflet')).default;
      await import('leaflet.markercluster');
      await import('leaflet.heat');

      if (cancelled || mapRef.current) return;
      const el = document.getElementById('ll-map');
      if (!el) return;

      const map = leaflet.map('ll-map', { center: [6.445, 3.42], zoom: 12, zoomControl: true });
      leaflet
        .tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
          attribution: '© OpenStreetMap © CARTO',
          subdomains: 'abcd',
          maxZoom: 19,
        })
        .addTo(map);

      const cluster = (leaflet as any).markerClusterGroup({
        showCoverageOnHover: false,
        spiderfyOnMaxZoom: true,
        spiderfyDistanceMultiplier: 1.6,
        zoomToBoundsOnClick: true,
        animate: true,
        animateAddingMarkers: true,
        spiderLegPolylineOptions: { weight: 1.5, color: '#A896C9', opacity: 0.55, dashArray: '3,5' },
        maxClusterRadius: 55,
        iconCreateFunction: (c: any) => {
          const count = c.getChildCount();
          const size = count < 10 ? 42 : count < 25 ? 50 : 58;
          return leaflet.divIcon({
            html: `<div style="width:${size}px;height:${size}px;border-radius:50%;background:linear-gradient(135deg,#6D5A99,#A85670);border:2.5px solid rgba(255,255,255,0.85);box-shadow:0 4px 20px rgba(0,0,0,0.55),0 0 18px rgba(109,90,153,0.4);display:flex;align-items:center;justify-content:center;font-family:'Montserrat',sans-serif;font-weight:700;color:white;font-size:${count < 10 ? 14 : 16}px">${count}</div>`,
            className: '',
            iconSize: [size, size],
            iconAnchor: [size / 2, size / 2],
          });
        },
      });
      cluster.addTo(map);

      const heat = (leaflet as any).heatLayer([], {
        radius: 42,
        blur: 32,
        maxZoom: 15,
        minOpacity: 0.35,
        gradient: { 0.2: '#2E2447', 0.4: '#6D5A99', 0.6: '#A85670', 0.8: '#C2954F', 1.0: '#E8B860' },
      });

      mapRef.current = map;
      clusterRef.current = cluster;
      heatRef.current = heat;
      renderMarkers(leaflet, cluster, parties, onSelectRef.current);
      renderHeat(heat, parties);
      if (showHeatmapRef.current) heat.addTo(map);
    })();

    return () => {
      cancelled = true;
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
        clusterRef.current = null;
        heatRef.current = null;
        userMarkerRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Re-render markers + heat data when the filtered party list changes
  useEffect(() => {
    if (!mapRef.current || !clusterRef.current) return;
    (async () => {
      const leaflet = (await import('leaflet')).default;
      renderMarkers(leaflet, clusterRef.current, parties, onSelectRef.current);
      if (heatRef.current) renderHeat(heatRef.current, parties);
    })();
  }, [parties]);

  // Toggle heatmap layer visibility
  useEffect(() => {
    if (!mapRef.current || !heatRef.current) return;
    if (showHeatmap) {
      heatRef.current.addTo(mapRef.current);
    } else {
      heatRef.current.remove();
    }
  }, [showHeatmap]);

  // User location marker
  useEffect(() => {
    if (!mapRef.current || !userLocation) return;
    (async () => {
      const leaflet = (await import('leaflet')).default;
      if (userMarkerRef.current) {
        userMarkerRef.current.remove();
      }
      const marker = leaflet
        .marker([userLocation.lat, userLocation.lng], {
          icon: leaflet.divIcon({
            html: '<div style="width:16px;height:16px;background:#B69763;border-radius:50%;border:3px solid white;box-shadow:0 0 0 8px rgba(182,151,99,0.22),0 0 20px rgba(182,151,99,0.5)"></div>',
            className: '',
            iconSize: [16, 16],
            iconAnchor: [8, 8],
          }),
        })
        .addTo(mapRef.current!)
        .bindPopup('<span style="color:#B69763;font-family:Montserrat,sans-serif;font-size:13px;font-weight:600;letter-spacing:0.5px">Your Location</span>');
      userMarkerRef.current = marker;
      mapRef.current!.panTo([userLocation.lat, userLocation.lng]);
    })();
  }, [userLocation]);

  return <div id="ll-map" className="h-full w-full" style={{ zIndex: 0 }} />;
}

function renderMarkers(leaflet: typeof L, cluster: any, parties: Party[], onSelect: (id: number) => void) {
  cluster.clearLayers();
  parties.forEach((p) => {
    const clr = VC[p.vibe];
    const dc = distanceColor(p.distance);
    const lbl = VIBE_LABEL[p.vibe];
    const icon = leaflet.divIcon({
      html: `<div style="position:relative;display:inline-block"><div style="width:38px;height:38px;background:${clr};border-radius:50%;border:2.5px solid rgba(255,255,255,0.85);box-shadow:0 4px 16px rgba(0,0,0,0.5),0 0 16px ${clr}55;display:flex;align-items:center;justify-content:center;font-family:'Montserrat',sans-serif;font-size:10px;font-weight:700;color:rgba(255,255,255,0.95);letter-spacing:0.5px">${lbl}</div><div style="position:absolute;bottom:-22px;left:50%;transform:translateX(-50%);background:rgba(20,17,31,0.92);border:1px solid ${dc};border-radius:10px;padding:1px 6px;white-space:nowrap;font-size:9px;font-weight:700;color:${dc};font-family:'Montserrat',sans-serif">${p.distance}km</div></div>`,
      className: '',
      iconSize: [38, 38],
      iconAnchor: [19, 19],
      popupAnchor: [0, -24],
    });
    const popupId = `ll-popup-view-${p.id}`;
    const marker = leaflet.marker([p.lat, p.lng], { icon }).bindPopup(
      `<div style="width:222px;font-family:Inter,sans-serif">
        <div style="height:90px;background:${p.gradient};border-radius:10px;margin-bottom:10px;display:flex;align-items:flex-end;padding:8px">
          <span style="background:${clr};color:white;padding:3px 10px;border-radius:20px;font-size:11px;font-weight:700">${p.vibe}</span>
        </div>
        <div style="font-family:'Montserrat',sans-serif;font-size:14px;font-weight:700;color:#F1F5F9;margin-bottom:4px">${p.title}</div>
        <div style="color:#9691A3;font-size:12px;margin-bottom:8px">${p.date} · ${p.time}</div>
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">
          <span style="color:#A896C9;font-weight:700;font-size:14px">${p.fee}</span>
          <span style="color:${dc};font-size:11px;font-weight:600">${p.distance} km away</span>
        </div>
        <button id="${popupId}" style="width:100%;background:linear-gradient(135deg,#6D5A99,#A85670);border:none;border-radius:8px;padding:8px;color:white;font-family:'Montserrat',sans-serif;font-size:12px;font-weight:700;cursor:pointer">View Details</button>
      </div>`,
      { maxWidth: 250 }
    );
    marker.on('popupopen', () => {
      const btn = document.getElementById(popupId);
      btn?.addEventListener('click', () => onSelect(p.id), { once: true });
    });
    cluster.addLayer(marker);
  });
}

// Weight each point by how full the event is so heavily-attended parties read as "hotter"
function renderHeat(heat: any, parties: Party[]) {
  const points = parties.map((p) => {
    const fill = (p.capacity - p.spotsLeft) / p.capacity;
    const intensity = 0.45 + Math.min(1, Math.max(0, fill)) * 0.55;
    return [p.lat, p.lng, intensity];
  });
  heat.setLatLngs(points);
}
