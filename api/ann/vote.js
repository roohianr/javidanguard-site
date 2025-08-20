import { createClient } from '@supabase/supabase-js';
import { getCookie, hashToken } from '../_lib/session.js';

export default async function handler(req,res){
  if (req.method !== 'POST') { res.setHeader('Allow','POST'); return res.status(405).end(); }
  const { SUPABASE_URL, SUPABASE_SERVICE_KEY, SESSION_SECRET } = process.env;
  const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
  const sid = getCookie(req,'sid');
  if (!sid) return res.status(401).json({ message:'Not logged in' });
  const token_hash = hashToken(sid, SESSION_SECRET);
  const { data: sess } = await sb.from('sessions').select('user_id').eq('token_hash', token_hash).gte('expires_at', new Date().toISOString()).single();
  if (!sess) return res.status(401).json({ message:'Session invalid' });

  const { id, value } = req.body || {};
  if (!id || ![1,-1].includes(value)) return res.status(400).json({ message:'Bad vote' });

  // upsert vote
  const { error: vErr } = await sb.from('annotation_votes').upsert({
    annotation_id: id, voter_id: sess.user_id, value
  });
  if (vErr) return res.status(500).json({ message:'Vote failed', detail: vErr.message });

  // recompute counts
  const { data: counts } = await sb.from('annotation_votes')
    .select('value')
    .eq('annotation_id', id);

  const up = (counts||[]).filter(v=>v.value===1).length;
  const down = (counts||[]).filter(v=>v.value===-1).length;
  await sb.from('annotations').update({ up, down }).eq('id', id);

  res.status(200).json({ ok:true, up, down });
}
