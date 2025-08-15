'use client';
import { useEffect, useRef } from 'react';
import maplibregl from 'maplibre-gl';

export default function MapPage() {
  const mapRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!mapRef.current) return;

    const map = new maplibregl.Map({
      container: mapRef.current,
      // DEV-ONLY raster tiles so you can see a map immediately.
      // We'll swap to Protomaps vector tiles before launch.
      style: {
        version: 8,
        sources: {
          osm: {
            type: 'raster',
            tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
            tileSize: 256,
            attribution:
              '© OpenStreetMap contributors',
          },
        },
        layers: [{ id: 'osm', type: 'raster', source: 'osm' }],
      },
      center: [54, 32], // Iran-ish center [lng, lat]
      zoom: 4.5,
      minZoom: 3,
      maxZoom: 16,
    });

    map.addControl(new maplibregl.NavigationControl(), 'top-right');

    return () => map.remove();
  }, []);

  return (
    <div style={{ height: '100dvh', width: '100%' }}>
      <div ref={mapRef} style={{ height: '100%', width: '100%' }} />
    </div>
  );
}

