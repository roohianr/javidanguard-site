// /api/map.js
import { db, send, getJson, sessionUser, subpath } from '../lib/api-util.js';
import * as h3 from 'h3-js';

export default async function handler(req, res) {
  try {
    const path = subpath(req, '/api/map'); // 'points-list', 'points-insert', 'area-aggregate'

    if (path === 'points-list' && req.method === 'GET') {
      const { data, error } = await db.from('points').select('h3, value').limit(5000);
      if (error) return send(res,500,{ ok:false, message:error.message });
      return send(res,200,{ ok:true, items:data || [] });
    }

    if (path === 'points-insert' && req.method === 'POST') {
      const uid = await sessionUser(req);
      if (!uid) return send(res,401,{ ok:false, message:'Login required' });

      const { cell, value } = await getJson(req);
      const val = Number(value);
      if (!cell || !Number.isFinite(val)) return send(res,400,{ ok:false, message:'Missing cell or value' });
      if (!h3.isValidCell(cell)) return send(res,400,{ ok:false, message:'Invalid H3 index' });

      const { error } = await db.from('points').insert({ h3: cell, value: val, user_id: uid });
      if (error) return send(res,500,{ ok:false, message:error.message });
      return send(res,200,{ ok:true });
    }

    if (path === 'area-aggregate' && req.method === 'GET') {
      // Fallback client-side aggregation
      const { data: rows, error } = await db
        .from('users')
        .select('area_h3, group_size')
        .not('area_h3','is',null);
      if (error) return send(res,500,{ ok:false, message:error.message });

      const map = new Map();
      for (const r of rows || []) {
        const key = r.area_h3;
        const o = map.get(key) || { h3:key, users:0, units:0 };
        o.users += 1;
        o.units += Number(r.group_size || 0);
        map.set(key, o);
      }
      return send(res,200,{ ok:true, items: Array.from(map.values()) });
    }

    return send(res,404,{ ok:false, message:'Unknown map route' });
  } catch (e) {
    return send(res,500,{ ok:false, message:e?.message || 'unknown' });
  }
}
