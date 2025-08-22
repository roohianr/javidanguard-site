import { db, send } from './_util.js';

export default async function handler(_req, res) {
  try {
    // Aggregate users by area_h3
    const { data: aggUsers, error: uerr } = await db
      .rpc('exec_sql', { sql: `
        select area_h3 as h3, count(*) as users, coalesce(sum(group_size),0) as units
        from public.users
        where area_h3 is not null
        group by area_h3
      `});
    // Fallback if you don't have exec_sql RPC enabled:
    // const { data: users } = await db.from('users')
    //   .select('area_h3, group_size').not('area_h3','is',null);

    if (uerr) {
      // fallback way (client-side aggregate)
      const { data: rows, error: e2 } = await db
        .from('users').select('area_h3, group_size').not('area_h3','is',null);
      if (e2) return send(res, 500, { ok:false, message:e2.message });
      const map = new Map();
      for (const r of rows || []) {
        const key = r.area_h3; const obj = map.get(key) || { h3:key, users:0, units:0 };
        obj.users += 1; obj.units += Number(r.group_size || 0);
        map.set(key, obj);
      }
      return send(res, 200, { ok:true, items: Array.from(map.values()) });
    }

    return send(res, 200, { ok:true, items: aggUsers || [] });
  } catch (e) {
    return send(res, 500, { ok:false, message:e?.message || 'unknown' });
  }
}
