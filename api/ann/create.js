import { createClient } from '@supabase/supabase-js';
import * as h3 from 'h3-js';
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

  const { cell_h3, kind, title='', details='' } = req.body || {};
  if (!cell_h3 || !h3.isValidCell?.(cell_h3)) return res.status(400).json({ message:'Valid cell required' });
  if (!kind) return res.status(400).json({ message:'kind required' });
  if (details.length > 2000) return res.status(400).json({ message:'details too long' });

  const { error } = await sb.from('annotations').insert({ author_id: sess.user_id, cell_h3, kind, title, details });
  if (error) return res.status(500).json({ message:'Create failed', detail: error.message });
  res.status(200).json({ ok:true });
}
