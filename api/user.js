// /api/user.js
import { db, send, getJson, sessionUser, subpath } from '../lib/api-util.js';
import * as h3 from 'h3-js';

export default async function handler(req, res) {
  try {
    const path = subpath(req, '/api/user'); // 'update', etc.

    if (path === 'update' && req.method === 'POST') {
      const uid = await sessionUser(req);
      if (!uid) return send(res,401,{ ok:false, message:'Login required' });

      const { area_h3, group_size } = await getJson(req);
      if (!area_h3 || !h3.isValidCell(area_h3)) return send(res,400,{ ok:false, message:'Invalid area_h3' });

      const size = Number(group_size);
      if (!Number.isInteger(size) || size < 1 || size > 9999) return send(res,400,{ ok:false, message:'Invalid group_size' });

      const { error } = await db.from('users').update({ area_h3, group_size: size }).eq('id', uid);
      if (error) return send(res,500,{ ok:false, message:error.message });

      return send(res,200,{ ok:true });
    }

    return send(res,404,{ ok:false, message:'Unknown user route' });
  } catch (e) {
    return send(res,500,{ ok:false, message:e?.message || 'unknown' });
  }
}
