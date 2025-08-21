// api/points-insert.js
import { createClient } from '@supabase/supabase-js';
import * as h3 from 'h3-js';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

async function userFromSid(req) {
  const cookie = req.headers.cookie || '';
  const m = cookie.match(/(?:^|;\s*)sid=([^;]+)/);
  if (!m) return null;
  const sid = decodeURIComponent(m[1]);
  const { data, error } = await supabase
    .from('sessions')
    .select('user_id')
    .eq('sid', sid)
    .gt('created_at', new Date(Date.now() - 1000*60*60*24*60).toISOString()) // 60 days
    .single();
  if (error) return null;
  return data?.user_id || null;
}

export default async function handler(req, res) {
  try {
    const uid = await userFromSid(req);
    if (!uid) return res.status(401).json({ ok:false, message:'Login required' });

    const { cell, value } = req.body || {};
    if (!cell || typeof value !== 'number') return res.status(400).json({ ok:false, message:'Missing cell or value' });
    if (!h3.h3IsValid(cell)) return res.status(400).json({ ok:false, message:'Invalid H3 index' });

    const { error } = await supabase.from('points').insert({
      h3: cell,
      value,
      user_id: uid
    });
    if (error) return res.status(500).json({ ok:false, message:error.message });
    res.status(200).json({ ok:true });
  } catch (e) {
    res.status(500).json({ ok:false, message:e.message });
  }
}
