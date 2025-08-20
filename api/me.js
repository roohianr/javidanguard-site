import { createClient } from '@supabase/supabase-js';
import { getCookie, hashToken } from './_lib/session.js';

export default async function handler(req, res) {
  const { SUPABASE_URL, SUPABASE_SERVICE_KEY, SESSION_SECRET } = process.env;
  const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
  const sid = getCookie(req, 'sid');
  if (!sid) return res.status(401).json({ message: 'Not logged in' });

  const token_hash = hashToken(sid, SESSION_SECRET);
  const { data: sess } = await sb.from('sessions')
    .select('user_id,expires_at').gte('expires_at', new Date().toISOString())
    .eq('token_hash', token_hash).single();
  if (!sess) return res.status(401).json({ message: 'Session invalid' });

  const { data: user } = await sb.from('app_users').select('id,handle').eq('id', sess.user_id).single();
  const { data: memb } = await sb.from('memberships').select('cell_h3,bucket,locked_until,h3r7').eq('user_id', sess.user_id).maybeSingle();

  res.status(200).json({ user, membership: memb || null });
}
