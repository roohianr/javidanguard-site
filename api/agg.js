// Returns GeoJSON of H3 cells within bbox, aggregated & k-anonymized
import { createClient } from '@supabase/supabase-js';
import * as h3 from 'h3-js';

const BUCKET_MID = [1, 3, 8, 15, 25];    // estimate per bucket
const K = 20;                             // k-anonymity threshold
const NOISE = 1;                          // Laplace noise scale (~±1)

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ message: 'Method not allowed' });
  try {
    const { bbox, z } = req.query;
    if (!bbox) return res.status(400).json({ message: 'bbox required' });
    const [minLng, minLat, maxLng, maxLat] = bbox.split(',').map(Number);
    const zoom = Number(z || 6);

    // choose aggregation resolution by zoom
    const resZoom = zoom < 6 ? 6 : zoom < 9 ? 7 : 8;

    const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

    // Pull recent submissions (last 12 months). For MVP this scans the table; fine for low volume.
    const since = new Date(Date.now() - 365*24*3600*1000).toISOString();
    const { data: rows, error } = await supabase
      .from('submissions')
      .select('h3,bucket,created_at')
      .gte('created_at', since);

    if (error) throw error;

    // Aggregate to parent cells & filter to viewport
    const agg = new Map();
    const bboxPoly = [
      [minLat, minLng],[minLat, maxLng],[maxLat, maxLng],[maxLat, minLng],[minLat, minLng]
    ];
    for (const r of rows) {
      const parent = h3.cellToParent(r.h3, resZoom);
      // quick viewport test: include if any vertex of parent hex is inside bbox
      const boundary = h3.cellToBoundary(parent, true); // [ [lat,lng], ... ]
      let intersects = false;
      for (const [lat, lng] of boundary) {
        if (lat >= minLat && lat <= maxLat && lng >= minLng && lng <= maxLng) { intersects = true; break; }
      }
      if (!intersects) continue;

      const key = parent;
      const cur = agg.get(key) || 0;
      agg.set(key, cur + BUCKET_MID[r.bucket || 0]);
    }

    // Build GeoJSON, apply k-threshold and small DP noise
    const features = [];
    for (const [cell, count0] of agg.entries()) {
      if (count0 < K) continue; // hide sparse cells
      const count = Math.max(0, count0 + laplace(NOISE));
      const boundary = h3.cellToBoundary(cell, true).map(([lat,lng]) => [lng, lat]);
      features.push({
        type: 'Feature',
        properties: { cell, count: Math.round(count) },
        geometry: { type: 'Polygon', coordinates: [ [...boundary, boundary[0]] ] }
      });
    }

    const gj = { type: 'FeatureCollection', features };
    res.setHeader('Cache-Control', 'public, max-age=30, s-maxage=30, stale-while-revalidate=120');
    return res.status(200).json(gj);
  } catch (e) {
    console.error(e);
    return res.status(500).json({ message: 'Server error' });
  }
}

function laplace(b){
  // sample from Laplace(0, b)
  const u = Math.random() - 0.5;
  return -b * Math.sign(u) * Math.log(1 - 2*Math.abs(u));
}
