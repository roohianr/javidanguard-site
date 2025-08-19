import { createClient } from '@supabase/supabase-js';
import * as h3 from 'h3-js';

const BUCKET_MID = [1, 3, 8, 15, 25];
const DEFAULT_K = 20;
const K = Math.max(1, Number(process.env.K_THRESHOLD || DEFAULT_K));
const NOISE_B = Number(process.env.NOISE_B || 0); // 0 for testing; 1 for light noise

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

    // Choose H3 resolution based on zoom (tweak as you like)
    const targetRes = zoom < 6 ? 5 : zoom < 8 ? 6 : zoom < 10 ? 7 : 8;

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
    const since = new Date(Date.now() - 365*24*3600*1000).toISOString();
    const { data: rows, error } = await supabase
      .from('submissions')
      .select('h3,bucket,created_at')
      .gte('created_at', since);

    if (error) return res.status(500).json({ message: 'DB read error', detail: error.message || error });

    // Aggregate to targetRes; keep only points inside bbox
    const agg = new Map();
    for (const r of rows) {
      if (!h3.isValidCell?.(r.h3)) continue;
      const parent = h3.cellToParent(r.h3, targetRes);
      const [lat, lng] = h3.cellToLatLng(parent); // centroid
      if (lat < minLat || lat > maxLat || lng < minLng || lng > maxLng) continue;
      const key = parent;
      agg.set(key, (agg.get(key) || 0) + BUCKET_MID[r.bucket || 0]);
    }

    const features = [];
    for (const [cell, baseCount] of agg.entries()) {
      let count = baseCount + (NOISE_B ? laplace(NOISE_B) : 0);
      if (count < K) continue;
      const [lat, lng] = h3.cellToLatLng(cell);
      features.push({
        type: 'Feature',
        properties: { cell, count: Math.max(1, Math.round(count)), res: targetRes },
        geometry: { type: 'Point', coordinates: [lng, lat] }
      });
    }

    res.setHeader('Cache-Control', 'public, max-age=10, s-maxage=10, stale-while-revalidate=60');
    return res.status(200).json({ type: 'FeatureCollection', features });
  } catch (e) {
    return res.status(500).json({ message: 'Server error', detail: e?.message || String(e) });
  }
}

function laplace(b){
  const u = Math.random() - 0.5;
  return -b * Math.sign(u) * Math.log(1 - 2*Math.abs(u));
}
