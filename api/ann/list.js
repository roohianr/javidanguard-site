import { createClient } from '@supabase/supabase-js';
import * as h3 from 'h3-js';

const DEFAULT_K = 20;
const K = Math.max(1, Number(process.env.K_THRESHOLD || DEFAULT_K));
const T = Number(process.env.VOTE_THRESHOLD || 1); // show annotations if net >= T

export default async function handler(req,res){
  const { bbox, z, kind } = req.query;
  if (!bbox) return res.status(400).json({ message:'bbox required' });
  const [minLng,minLat,maxLng,maxLat] = bbox.split(',').map(Number);
  const zoom = Number(z || 8);
  const resZoom = zoom < 6 ? 5 : zoom < 8 ? 6 : zoom < 10 ? 7 : 8;

  const { SUPABASE_URL, SUPABASE_SERVICE_KEY } = process.env;
  const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

  // Get cells that meet K (from memberships)
  const { data: memb } = await sb.from('memberships').select('cell_h3,bucket');
  const buckets = [1,3,8,15,25];
  const agg = new Map();
  for (const m of (memb||[])) {
    if (!h3.isValidCell?.(m.cell_h3)) continue;
    const parent = h3.cellToParent(m.cell_h3, resZoom);
    agg.set(parent, (agg.get(parent)||0) + buckets[m.bucket||2]);
  }
  const okCells = new Set([...agg.entries()].filter(([,v])=> v>=K).map(([k])=>k));

  // Query annotations inside bbox, passing vote threshold & K cells
  const { data: anns } = await sb.from('annotations')
    .select('id,cell_h3,kind,title,details,up,down,status,created_at')
    .order('created_at',{ascending:false}).limit(500);

  const features = [];
  for (const a of (anns||[])) {
    if (kind && a.kind !== kind) continue;
    if ((a.up - a.down) < T) continue;
    const parent = h3.cellToParent(a.cell_h3, resZoom);
    if (!okCells.has(parent)) continue;
    const [lat,lng] = h3.cellToLatLng(parent);
    if (lat<minLat||lat>maxLat||lng<minLng||lng>maxLng) continue;
    features.push({
      type:'Feature',
      properties:{ id:a.id, kind:a.kind, title:a.title, votes:a.up-a.down },
      geometry:{ type:'Point', coordinates:[lng,lat] }
    });
  }
  res.status(200).json({ type:'FeatureCollection', features });
}
