import { createClient } from '@supabase/supabase-js';
import * as h3 from 'h3-js';
import { getCookie, hashToken } from '../_lib/session.js';

const BUCKETS = [1,3,8,15,25]; // 0..4 (we only allow 2..4 here)

export default async function handler(req,res){
  if (req.method !== 'POST') { res.setHeader('Allow','POST'); return res.status(405).end(); }

  const { SUPABASE_URL, SUPABASE_SERVICE_KEY, SESSION_SECRET } = process.env;
  const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

  const sid = getCookie(req,'sid');
  if (!sid) return res.status(401).json({ message:'Not logged in' });
  const token_hash = hashToken(sid, SESSION_SECRET);
  const { data: sess } = await sb.from('sessions').select('user_id,expires_at').eq('token_hash', token_hash).gte('expires_at', new Date().toISOString()).single();
  if (!sess) return res.status(401).json({ message:'Session invalid' });

  const { cell_h3, bucket } = req.body || {};
  if (!cell_h3 || !h3.isValidCell?.(cell_h3)) return res.status(400).json({ message:'Valid cell_h3 required' });
  if (typeof bucket !== 'number' || bucket < 2 || bucket > 4) return res.status(400).json({ message:'Group must be 5+ (choose 6–10, 11–20, or 20+)' });

  const { data: current } = await sb.from('memberships').select('locked_until').eq('user_id', sess.user_id).maybeSingle();
  const now = new Date();
  if (current && new Date(current.locked_until) > now) {
    return res.status(429).json({ message:'Zone change locked', locked_until: current.locked_until });
  }

  const h3r7 = h3.cellToParent(cell_h3, 7);
  const h3r6 = h3.cellToParent(cell_h3, 6);
  const h3r5 = h3.cellToParent(cell_h3, 5);
  const locked_until = new Date(now.getTime() + 7*24*3600*1000).toISOString();

  const { error } = await sb.from('memberships').upsert({
    user_id: sess.user_id, cell_h3, bucket, h3r7, h3r6, h3r5, updated_at: now.toISOString(), locked_until
  });
  if (error) return res.status(500).json({ message:'Save failed', detail: error.message });

  res.status(200).json({ ok:true, locked_until });
}
