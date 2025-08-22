import { db, send, getJson, sessionUser } from './_util.js';
import * as h3 from 'h3-js';

export default async function handler(req, res) {
  try {
    if (req.method !== 'POST') return send(res, 405, { ok:false, message:'Method not allowed' });
    const uid = await sessionUser(req);
    if (!uid) return send(res, 401, { ok:false, message:'Login required' });

    const { area_h3 } = await getJson(req);
    if (!area_h3 || !h3.isValidCell(area_h3)) return send(res, 400, { ok:false, message:'Invalid area' });

    const now = new Date().toISOString();
    const { error } = await db.from('chat_seen')
      .upsert({ user_id: uid, area_h3, last_seen: now }, { onConflict: 'user_id,area_h3' });
    if (error) return send(res, 500, { ok:false, message:error.message });

    return send(res, 200, { ok:true });
  } catch (e) {
    return send(res, 500, { ok:false, message:e?.message || 'unknown' });
  }
}
