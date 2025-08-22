import { db, send, getJson, sessionUser } from './_util.js';
import * as h3 from 'h3-js';

export default async function handler(req, res) {
  try {
    if (req.method !== 'POST') return send(res, 405, { ok:false, message:'Method not allowed' });
    const uid = await sessionUser(req);
    if (!uid) return send(res, 401, { ok:false, message:'Login required' });

    const { area_h3, body } = await getJson(req);
    const text = (body || '').toString().trim();
    if (!area_h3 || !h3.isValidCell(area_h3)) return send(res, 400, { ok:false, message:'Invalid area' });
    if (!text) return send(res, 400, { ok:false, message:'Empty message' });
    if (text.length > 2000) return send(res, 400, { ok:false, message:'Message too long' });

    const { error } = await db.from('messages').insert({ area_h3, user_id: uid, body: text });
    if (error) return send(res, 500, { ok:false, message:error.message });

    // mark as seen for sender
    await db.from('chat_seen')
      .upsert({ user_id: uid, area_h3, last_seen: new Date().toISOString() }, { onConflict: 'user_id,area_h3' });

    return send(res, 200, { ok:true });
  } catch (e) {
    return send(res, 500, { ok:false, message:e?.message || 'unknown' });
  }
}
