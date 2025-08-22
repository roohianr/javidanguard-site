import { db, send } from './_util.js';

export default async function handler(req, res) {
  try {
    if (req.method !== 'GET') return send(res, 405, { ok:false, message:'Method not allowed' });
    const area = (req.query?.area || '').toString();
    const uid = (req.query?.uid || '').toString();
    if (!area || !uid) return send(res, 400, { ok:false, message:'Missing area or uid' });

    const { data: seenRow } = await db
      .from('chat_seen')
      .select('last_seen')
      .eq('user_id', uid)
      .eq('area_h3', area)
      .single();

    const since = seenRow?.last_seen || '1970-01-01';
    const { count, error } = await db
      .from('messages')
      .select('id', { count: 'exact', head: true })
      .eq('area_h3', area)
      .gt('created_at', since);

    if (error) return send(res, 500, { ok:false, message:error.message });
    return send(res, 200, { ok:true, count: count || 0 });
  } catch (e) {
    return send(res, 500, { ok:false, message:e?.message || 'unknown' });
  }
}
