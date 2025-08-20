import { createClient } from '@supabase/supabase-js';
import * as h3 from 'h3-js';

const BUCKET_MID = [1, 3, 8, 15, 25];

export default async function handler(req, res) {
  try {
    if (req.method !== 'GET') {
      res.setHeader('Allow', 'GET');
      return res.status(405).json({ message: 'Method not allowed' });
    }

    const { SUPABASE_URL, SUPABASE_SERVICE_KEY, ADMIN_KEY } = process.env;
    if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY || !ADMIN_KEY) {
      return res.status(500).json({ message: 'Server not configured' });
    }

    const key = req.headers['x-admin-key'] || req.query.key;
    if (key !== ADMIN_KEY) return res.status(401).json({ message: 'Unauthorized' });

    const { bbox, z } = req.query;
    if (!bbox) return res.status(400).json({ message: 'bbox required' });
    const [minLng, minLat, maxLng, maxLat] = bbox.split(',').map(Number);
    const zoom = Number(z || 6);

    // Same split logic as user map, but we DO NOT apply K threshold here
    const targetRes = zoom < 6 ? 5 : zoom < 8 ? 6 : zoom < 10 ? 7 : 8;

    const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
    const since = new Date(Date.now() - 365 * 24 * 3600 * 1000).toISOString();

    // Read from current table (submissions). We'll migrate to memberships later.
    const { data: rows, error } = await sb
      .from('submissions')
      .select('h3,bucket,created_at')
      .gte('created_at', since);

    if (error) return res.status(500).json({ message: 'DB read error', detail: error.message || error });

    const agg = new Map();
    for (const r of rows) {
      if (!h3.isValidCell?.(r.h3)) continue;
      const parent = h3.cellToParent(r.h3, targetRes);
      const [lat, lng] = h3.cellToLatLng(parent);
      if (lat < minLat || lat > maxLat || lng < minLng || lng > maxLng) continue;
      agg.set(parent, (agg.get(parent) || 0) + BUCKET_MID[r.bucket || 0]);
    }

    const features = [];
    for (const [cell, count] of agg.entries()) {
      const [lat, lng] = h3.cellToLatLng(cell);
      features.push({
        type: 'Feature',
        properties: { cell, count: Math.round(count), res: targetRes },
        geometry: { type: 'Point', coordinates: [lng, lat] }
      });
    }

    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json({ type: 'FeatureCollection', features });
  } catch (e) {
    return res.status(500).json({ message: 'Server error', detail: e?.message || String(e) });
  }
}
