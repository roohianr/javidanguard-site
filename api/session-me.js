import { send, sessionUser } from './_util.js';

export default async function handler(req, res) {
  try {
    if (req.method !== 'GET') return send(res, 405, { ok: false, message: 'Method not allowed' });
    const uid = await sessionUser(req);
    return send(res, 200, { ok: true, loggedIn: !!uid, userId: uid || null });
  } catch (e) {
    return send(res, 500, { ok: false, message: e?.message || 'unknown' });
  }
}
