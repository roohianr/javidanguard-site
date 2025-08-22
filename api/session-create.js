import crypto from 'crypto';
import { db, send, sessionUser, sessionCookie } from './_util.js';

export default async function handler(req, res) {
  try {
    if (!(req.method === 'POST' || req.method === 'GET')) {
      return send(res, 405, { ok: false, message: 'Method not allowed' });
    }
    const existingUid = await sessionUser(req);
    if (existingUid) {
      return send(res, 200, { ok: true, already: true, message: 'Already logged in' });
    }
    const chunk = () => crypto.randomBytes(16).toString('base64url').slice(0, 22);
    const recovery = `${chunk()}-${chunk()}`;
    const recovery_hash = crypto.createHash('sha256').update(recovery).digest('hex');

    const { data: user, error: uerr } = await db
      .from('users').insert({ recovery_hash }).select('id').single();
    if (uerr) return send(res, 500, { ok: false, message: uerr.message });

    const sid = crypto.randomUUID();
    const token_hash = crypto.createHash('sha256').update(sid).digest('hex');
    const expires_at = new Date(Date.now() + 30*24*60*60*1000).toISOString();

    const { error: serr } = await db
      .from('sessions').insert({ sid, token_hash, user_id: user.id, expires_at });
    if (serr) return send(res, 500, { ok: false, message: serr.message });

    return send(res, 200, { ok: true, recovery }, sessionCookie(sid));
  } catch (e) {
    return send(res, 500, { ok: false, message: e?.message || 'unknown' });
  }
}
