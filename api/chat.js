// /api/chat.js
import { db, send, getJson, sessionUser, subpath } from '../lib/api-util.js';
import * as h3 from 'h3-js';

export default async function handler(req, res) {
  try {
    const path = subpath(req, '/api/chat'); // 'list','post','seen','unread'

    if (path === 'list' && req.method === 'GET') {
      const url = new URL(req.url, 'http://localhost'); // base not used
      const area = url.searchParams.get('area') || '';
      const limit = Math.min(200, Number(url.searchParams.get('limit') || 50));
      if (!area) return send(res,400,{ ok:false, message:'Missing area' });

      const { data, error } = await db
        .from('messages')
        .select('id, user_id, body, created_at')
        .eq('area_h3', area)
        .order('created_at', { ascending: false })
        .limit(limit);
      if (error) return send(res,500,{ ok:false, message:error.message });
      return send(res,200,{ ok:true, items: (data || []).reverse() });
    }

    if (path === 'post' && req.method === 'POST') {
      const uid = await sessionUser(req);
      if (!uid) return send(res,401,{ ok:false, message:'Login required' });
      const { area_h3, body } = await getJson(req);
      const text = (body || '').toString().trim();
      if (!area_h3 || !h3.isValidCell(area_h3)) return send(res,400,{ ok:false, message:'Invalid area' });
      if (!text) return send(res,400,{ ok:false, message:'Empty message' });
      if (text.length > 2000) return send(res,400,{ ok:false, message:'Message too long' });

      const { error } = await db.from('messages').insert({ area_h3, user_id: uid, body: text });
      if (error) return send(res,500,{ ok:false, message:error.message });

      await db.from('chat_seen').upsert(
        { user_id: uid, area_h3, last_seen: new Date().toISOString() },
        { onConflict: 'user_id,area_h3' }
      );

      return send(res,200,{ ok:true });
    }

    if (path === 'seen' && req.method === 'POST') {
      const uid = await sessionUser(req);
      if (!uid) return send(res,401,{ ok:false, message:'Login required' });
      const { area_h3 } = await getJson(req);
      if (!area_h3 || !h3.isValidCell(area_h3)) return send(res,400,{ ok:false, message:'Invalid area' });

      const now = new Date().toISOString();
      const { error } = await db.from('chat_seen')
        .upsert({ user_id: uid, area_h3, last_seen: now }, { onConflict:'user_id,area_h3' });
      if (error) return send(res,500,{ ok:false, message:error.message });

      return send(res,200,{ ok:true });
    }

    if (path === 'unread' && req.method === 'GET') {
      const url = new URL(req.url, 'http://localhost');
      const area = url.searchParams.get('area') || '';
      const uid = url.searchParams.get('uid') || '';
      if (!area || !uid) return send(res,400,{ ok:false, message:'Missing area or uid' });

      const { data: seenRow } = await db
        .from('chat_seen').select('last_seen')
        .eq('user_id', uid).eq('area_h3', area).single();

      const since = seenRow?.last_seen || '1970-01-01';
      const { count, error } = await db
        .from('messages')
        .select('id', { count:'exact', head:true })
        .eq('area_h3', area)
        .gt('created_at', since);
      if (error) return send(res,500,{ ok:false, message:error.message });

      return send(res,200,{ ok:true, count: count || 0 });
    }

    return send(res,404,{ ok:false, message:'Unknown chat route' });
  } catch (e) {
    return send(res,500,{ ok:false, message:e?.message || 'unknown' });
  }
}
