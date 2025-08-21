import { createClient } from '@supabase/supabase-js';

const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

function send(res, status, obj) {
  if (res.writableEnded) return;
  res.status(status);
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(obj));
}

export default async function handler(req, res) {
  try {
    if (req.method !== 'GET') return send(res, 405, { ok:false, message:'Method not allowed' });
    const { error } = await db.from('points').select('id').limit(1);
    if (error) return send(res, 500, { ok:false, where:'supabase-select', message:error.message });
    return send(res, 200, { ok:true, db:'ok' });
  } catch (e) {
    return send(res, 500, { ok:false, where:'api', message:e?.message || 'unknown' });
  }
}
