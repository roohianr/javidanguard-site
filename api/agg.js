import { createClient } from '@supabase/supabase-js';
import * as h3 from 'h3-js';

const BUCKET_MID = [1, 3, 8, 15, 25];
const DEFAULT_K = 20;
const K = Math.max(1, Number(process.env.K_THRESHOLD || DEFAULT_K));
const NOISE = 1;

export default async function handler(req, res) {
  try {
    if (req.method !== 'GET') {
      res.setHeader('Allow', 'GET');
      return res.status(405).json({ message: 'Method not allowed' });
    }

    const { SUPABASE_URL, SUPABASE_SERVICE_KEY } = process.env;
    if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
      return res.status(500).json({ message: 'Missing SUPABASE_URL or SUPABASE_SERVICE_KEY' });
    }

    const { bbox, z } = req.query;
    if (!bbox) return res.status(400).json({ message: 'bbox required' });
    const [minLng, minLat, maxLng, maxLat] = bbox.split(',').map(Number);
    const zoom = Number(z || 6);
    const resZoom = zoom < 6 ? 6 : zoom < 9 ? 7 : 8;

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
    const since = new Date(Date.now() - 365 * 24 * 3600 * 1000).toISOString();

    const { data: rows, error } = await supabase
      .from('submissions')
      .select('h3,bucket,created_at')
      .gte('created_at', since);

    if (error) return res.status(500).json({ message: 'DB read error', detail: error.message || error });

    const agg = new Map();

    for (const r of rows) {
      // Skip any bad H3 strings so one bad row can't crash the API
      if (!h3.isValidCell?.(r.h3)) continue;

      let parent;
      try {
        parent = h3.cellToParent(r.h3, resZoom);
      } catch { continue; }

      // simple bbox check using any vertex of the parent hex
      let inside = false;
      try {
        const boundary = h3.cellToBoundary(parent, true);
        for (const [lat, lng] of boundary) {
          if (lat >= minLat && lat <= maxLat && lng >= minLng && lng <= maxLng) { inside = true; break; }
        }
        if (!inside) continue;
      } catch { continue; }

      agg.set(parent, (agg.get(parent) || 0) + BUCKET_MID[r.bucket || 0]);
    }

    const features = [];
    for (const [cell, count0] of agg.entries()) {
      if (count0 < K) continue;
      let boundary;
      try {
        boundary = h3.cellToBoundary(cell, true).map(([lat,lng]) => [lng, lat]);
      } catch { continue; }
      const count = Math.max(0, count0 + laplace(NOISE));
      features.push({
        type: 'Feature',
        properties: { cell, count: Math.round(count) },
        geometry: { type: 'Polygon', coordinates: [[...boundary, boundary[0]]] }
      });
    }

    res.setHeader('Cache-Control', 'public, max-age=30, s-maxage=30, stale-while-revalidate=120');
    return res.status(200).json({ type: 'FeatureCollection', features });
  } catch (e) {
    return res.status(500).json({ message: 'Server error', detail: e?.message || String(e) });
  }
}

function laplace(b){
  const u = Math.random() - 0.5;
  return -b * Math.sign(u) * Math.log(1 - 2 * Math.abs(u));
}
