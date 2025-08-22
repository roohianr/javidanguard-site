import crypto from 'crypto';
import { db, send, getJson, sessionCookie } from './_util.js';

export default async function handler(req, res) {
  try {
    if (req.method !== 'POST') return send(res, 405, { ok: false, message: 'Method not allowed' });
    const { recovery } = await getJson(req);
    if (!recovery) return send(res, 400, { ok: false, message: 'Missing recovery' });

    const recovery_hash = crypto.createHash('sha256').update(recovery).digest('hex');
    const { data: user, error } = await db
      .from('users').select('id').eq('recovery_hash', recovery_hash).single();
    if (error || !user) return send(res, 401, { ok: false, message: 'Invalid recovery' });

    const sid = crypto.randomUUID();
    const token_hash = crypto.createHash('sha256').update(sid).digest('hex');
    const expires_at = new Date(Date.now() + 30*24*60*60*1000).toISOString();

    const { error: serr } = await db
      .from('sessions').insert({ sid, token_hash, user_id: user.id, expires_at });
    if (serr) return send(res, 500, { ok: false, message: serr.message });

    return send(res, 200, { ok: true }, sessionCookie(sid));
  } catch (e) {
    return send(res, 500, { ok: false, message: e?.message || 'unknown' });
  }
}
