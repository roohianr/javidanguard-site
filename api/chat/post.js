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

  const { data: memb } = await sb.from('memberships').select('h3r7').eq('user_id', sess.user_id).single();
  const { text } = req.body || {};
  if (!text || text.length < 1 || text.length > 500) return res.status(400).json({ message:'Bad text' });

  const { error } = await sb.from('chat_messages').insert({ user_id: sess.user_id, h3r7: memb.h3r7, text });
  if (error) return res.status(500).json({ message:'Post failed', detail: error.message });
  res.status(200).json({ ok:true });
}
