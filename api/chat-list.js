import { db, send } from './_util.js';

export default async function handler(req, res) {
  try {
    if (req.method !== 'GET') return send(res, 405, { ok:false, message:'Method not allowed' });
    const area = (req.query?.area || '').toString();
    const limit = Math.min(200, Number(req.query?.limit || 50));
    if (!area) return send(res, 400, { ok:false, message:'Missing area' });

    const { data, error } = await db
      .from('messages')
      .select('id, user_id, body, created_at')
      .eq('area_h3', area)
      .order('created_at', { ascending: false })
      .limit(limit);
    if (error) return send(res, 500, { ok:false, message:error.message });

    return send(res, 200, { ok:true, items: (data || []).reverse() });
  } catch (e) {
    return send(res, 500, { ok:false, message:e?.message || 'unknown' });
  }
}
