import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';

const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

function send(res, status, obj, cookie) {
  if (res.writableEnded) return;
  if (cookie) res.setHeader('Set-Cookie', cookie);
  res.status(status);
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(obj));
}

async function getJson(req) {
  if (req.body) return req.body;
  const chunks = [];
  for await (const c of req) chunks.push(c);
  const raw = Buffer.concat(chunks).toString('utf8');
  try { return JSON.parse(raw || '{}'); } catch { return {}; }
}

export default async function handler(req, res) {
  try {
    if (req.method !== 'POST') return send(res, 405, { ok:false, message:'Method not allowed' });

    const body = await getJson(req);
    const recovery = (body?.recovery || '').trim();
    if (!recovery) return send(res, 400, { ok:false, message:'Missing recovery' });

    const recovery_hash = crypto.createHash('sha256').update(recovery).digest('hex');
    const { data: user, error } = await db
      .from('users').select('id').eq('recovery_hash', recovery_hash).single();
    if (error || !user) return send(res, 401, { ok:false, message:'Invalid recovery' });

    const sid = crypto.randomUUID();
    const { error: serr } = await db.from('sessions').insert({ sid, user_id: user.id });
    if (serr) return send(res, 500, { ok:false, message:serr.message });

    const cookie = `sid=${sid}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=2592000`;
    return send(res, 200, { ok:true }, cookie);
  } catch (e) {
    return send(res, 500, { ok:false, message:e?.message || 'unknown' });
  }
}
