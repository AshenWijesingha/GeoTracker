'use client';

// Leaflet map with multiple base layers, accuracy radii, a movement trail,
// "fit all" / "follow" controls and tile-failure recovery.
// Leaflet touches `window` at import time, so it is loaded lazily on the client.

import { useEffect, useRef, useState } from 'react';
import type * as Leaflet from 'leaflet';
import { LocateFixed, Maximize2 } from 'lucide-react';
import { currentTheme } from '@/lib/theme';
import styles from './LiveMap.module.css';

export interface MapMarker {
  id: string;
  latitude: number;
  longitude: number;
  accuracy?: number | null;
  label: string;
  detail?: string;
  variant?: 'live' | 'idle' | 'paused' | 'sos' | 'self' | 'selected';
}

interface LiveMapProps {
  markers: MapMarker[];
  trail?: Array<{ latitude: number; longitude: number }>;
  /** Marker to keep centred while "follow" is on. */
  followId?: string | null;
  /** Change this value to re-fit the view to all markers + trail. */
  fitKey?: string | number;
  onMarkerClick?: (id: string) => void;
  height?: number | string;
  className?: string;
}

type LayerDef = { url: string; attribution: string; maxZoom?: number; subdomains?: string };

const BASE_LAYERS: Record<string, LayerDef> = {
  'Dark': {
    url: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
    attribution: '&copy; OpenStreetMap contributors &copy; CARTO',
    maxZoom: 20,
  },
  'Streets (OSM)': {
    url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    attribution: '&copy; OpenStreetMap contributors',
    maxZoom: 19,
  },
  'Satellite': {
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    attribution: 'Tiles &copy; Esri',
    maxZoom: 19,
  },
  'Light': {
    url: 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png',
    attribution: '&copy; OpenStreetMap contributors &copy; CARTO',
    maxZoom: 20,
  },
  'Voyager': {
    url: 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png',
    attribution: '&copy; OpenStreetMap contributors &copy; CARTO',
    maxZoom: 20,
  },
  'Topographic': {
    url: 'https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png',
    attribution: '&copy; OpenStreetMap contributors, SRTM | &copy; OpenTopoMap',
    maxZoom: 17,
  },
  'Esri Streets': {
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}',
    attribution: 'Tiles &copy; Esri',
    maxZoom: 19,
  },
};

const LAYER_STORAGE_KEY = 'geotracker:map-layer';
const DEFAULT_VIEW: [number, number] = [20, 0];

const VARIANT_COLORS: Record<NonNullable<MapMarker['variant']>, string> = {
  // Match the status tokens in globals.css (success, neutral, warning, danger, accent).
  live: '#16a34a',
  idle: '#8a93a3',
  paused: '#d97706',
  sos: '#dc2626',
  self: '#2563eb',
  selected: '#2563eb',
};

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

function readStoredLayer(): string {
  try {
    const v = localStorage.getItem(LAYER_STORAGE_KEY);
    if (v && v in BASE_LAYERS) return v;
  } catch {
    // ignore
  }
  // No saved choice: match the app theme.
  return currentTheme() === 'dark' ? 'Dark' : 'Voyager';
}

export default function LiveMap({
  markers,
  trail,
  followId,
  fitKey,
  onMarkerClick,
  height = 420,
  className,
}: LiveMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const LRef = useRef<typeof Leaflet | null>(null);
  const mapRef = useRef<Leaflet.Map | null>(null);
  const markerLayerRef = useRef<Map<string, { marker: Leaflet.Marker; circle: Leaflet.Circle | null; key: string }>>(new Map());
  const trailRef = useRef<Leaflet.Polyline | null>(null);
  const currentLayerRef = useRef<Leaflet.TileLayer | null>(null);
  const userMovedRef = useRef(false);
  const fittedOnceRef = useRef(false);
  const onClickRef = useRef(onMarkerClick);
  const [ready, setReady] = useState(false);
  const [follow, setFollow] = useState(true);
  const [tilesFailed, setTilesFailed] = useState(false);

  onClickRef.current = onMarkerClick;

  // Create the map once.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const mod = await import('leaflet');
      const L = ((mod as unknown as { default?: typeof Leaflet }).default ?? mod) as typeof Leaflet;
      if (cancelled || !containerRef.current || mapRef.current) return;
      LRef.current = L;
      const map = L.map(containerRef.current, { zoomControl: true, worldCopyJump: true }).setView(DEFAULT_VIEW, 2);
      mapRef.current = map;

      const layers: Record<string, Leaflet.TileLayer> = {};
      for (const [name, def] of Object.entries(BASE_LAYERS)) {
        const layer = L.tileLayer(def.url, {
          attribution: def.attribution,
          maxZoom: def.maxZoom ?? 19,
          crossOrigin: true,
        });
        // Warn only when an entire batch of tiles fails (provider down/blocked).
        let ok = 0;
        let failed = 0;
        layer.on('loading', () => {
          ok = 0;
          failed = 0;
        });
        layer.on('tileload', () => ok++);
        layer.on('tileerror', () => failed++);
        layer.on('load', () => {
          if (layer !== currentLayerRef.current) return;
          setTilesFailed(ok === 0 && failed > 0);
        });
        layers[name] = layer;
      }
      const initial = readStoredLayer();
      currentLayerRef.current = layers[initial];
      layers[initial].addTo(map);
      L.control.layers(layers, undefined, { position: 'topright' }).addTo(map);
      L.control.scale({ imperial: false }).addTo(map);

      map.on('baselayerchange', (e: Leaflet.LayersControlEvent) => {
        currentLayerRef.current = e.layer as Leaflet.TileLayer;
        setTilesFailed(false);
        try {
          localStorage.setItem(LAYER_STORAGE_KEY, e.name);
        } catch {
          // ignore
        }
      });
      // Respect a view the user picked: stop auto-following after manual pan/zoom.
      map.on('dragstart', () => {
        userMovedRef.current = true;
        setFollow(false);
      });

      setReady(true);
    })();
    return () => {
      cancelled = true;
      mapRef.current?.remove();
      mapRef.current = null;
      markerLayerRef.current.clear();
      trailRef.current = null;
    };
  }, []);

  // Keep the map sized correctly when its container changes (e.g. sidebar toggles).
  useEffect(() => {
    if (!ready || !containerRef.current || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => mapRef.current?.invalidateSize());
    ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, [ready]);

  // Sync markers (diffed by id so unchanged markers aren't recreated).
  useEffect(() => {
    const L = LRef.current;
    const map = mapRef.current;
    if (!ready || !L || !map) return;
    const existing = markerLayerRef.current;
    const seen = new Set<string>();

    for (const m of markers) {
      seen.add(m.id);
      const variant = m.variant ?? 'live';
      const color = VARIANT_COLORS[variant];
      const key = `${m.latitude},${m.longitude},${m.accuracy},${variant},${m.label},${m.detail}`;
      const entry = existing.get(m.id);
      if (entry && entry.key === key) continue;

      const icon = L.divIcon({
        className: '',
        html: `<div class="${styles.pin} ${variant === 'sos' ? styles.pinSos : ''}" style="--pin:${color}"><span></span></div>`,
        iconSize: [22, 22],
        iconAnchor: [11, 11],
        popupAnchor: [0, -12],
      });
      const popup = `<strong>${escapeHtml(m.label)}</strong>${m.detail ? `<br/><span>${escapeHtml(m.detail)}</span>` : ''}`;

      if (entry) {
        entry.marker.setLatLng([m.latitude, m.longitude]).setIcon(icon).setPopupContent(popup);
        if (entry.circle) {
          if (m.accuracy) entry.circle.setLatLng([m.latitude, m.longitude]).setRadius(m.accuracy).setStyle({ color });
          else {
            entry.circle.remove();
            entry.circle = null;
          }
        } else if (m.accuracy) {
          entry.circle = L.circle([m.latitude, m.longitude], { radius: m.accuracy, color, weight: 1, fillOpacity: 0.08 }).addTo(map);
        }
        entry.key = key;
      } else {
        const marker = L.marker([m.latitude, m.longitude], { icon, title: m.label, riseOnHover: true })
          .bindPopup(popup)
          .addTo(map);
        marker.on('click', () => onClickRef.current?.(m.id));
        const circle = m.accuracy
          ? L.circle([m.latitude, m.longitude], { radius: m.accuracy, color, weight: 1, fillOpacity: 0.08 }).addTo(map)
          : null;
        existing.set(m.id, { marker, circle, key });
      }
    }

    for (const [id, entry] of existing) {
      if (!seen.has(id)) {
        entry.marker.remove();
        entry.circle?.remove();
        existing.delete(id);
      }
    }
  }, [markers, ready]);

  // Sync the trail polyline.
  useEffect(() => {
    const L = LRef.current;
    const map = mapRef.current;
    if (!ready || !L || !map) return;
    const latlngs = (trail ?? []).map((p) => [p.latitude, p.longitude] as [number, number]);
    if (latlngs.length < 2) {
      trailRef.current?.remove();
      trailRef.current = null;
      return;
    }
    if (trailRef.current) trailRef.current.setLatLngs(latlngs);
    else
      trailRef.current = L.polyline(latlngs, { color: '#2563eb', weight: 4, opacity: 0.75, lineCap: 'round', lineJoin: 'round' }).addTo(map);
  }, [trail, ready]);

  const fitAll = () => {
    const L = LRef.current;
    const map = mapRef.current;
    if (!L || !map) return;
    const pts: [number, number][] = markers.map((m) => [m.latitude, m.longitude]);
    (trail ?? []).forEach((p) => pts.push([p.latitude, p.longitude]));
    if (pts.length === 0) return;
    if (pts.length === 1) map.setView(pts[0], Math.max(map.getZoom(), 16));
    else map.fitBounds(L.latLngBounds(pts), { padding: [40, 40], maxZoom: 17 });
  };

  // Fit on first data and whenever fitKey changes.
  useEffect(() => {
    if (!ready) return;
    if (markers.length === 0 && (trail?.length ?? 0) === 0) return;
    fitAll();
    fittedOnceRef.current = true;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, fitKey, markers.length > 0]);

  // Follow a marker.
  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map || !follow || !followId) return;
    const m = markers.find((x) => x.id === followId);
    if (m) map.panTo([m.latitude, m.longitude], { animate: true });
  }, [markers, followId, follow, ready]);

  return (
    <div className={`${styles.wrapper} ${className ?? ''}`} style={{ height }}>
      <div ref={containerRef} className={styles.map} role="application" aria-label="Live location map" />
      {!ready && <div className={styles.loading}>Loading map…</div>}
      <div className={styles.controls}>
        <button type="button" onClick={fitAll} title="Show everything on the map">
          <Maximize2 size={14} aria-hidden="true" /> Fit all
        </button>
        {followId && (
          <button
            type="button"
            className={follow ? styles.active : ''}
            onClick={() => setFollow((f) => !f)}
            title="Keep the selected device centred"
          >
            <LocateFixed size={14} aria-hidden="true" /> {follow ? 'Following' : 'Follow'}
          </button>
        )}
      </div>
      {tilesFailed && (
        <div className={styles.tileWarning}>
          Map tiles failed to load.{' '}
          <button
            type="button"
            onClick={() => {
              setTilesFailed(false);
              currentLayerRef.current?.redraw();
            }}
          >
            Retry
          </button>{' '}
          or pick another style (top right).
        </div>
      )}
    </div>
  );
}
