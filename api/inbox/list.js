import { createClient } from '@supabase/supabase-js';
import { getCookie, hashToken } from '../_lib/session.js';

export default async function handler(req,res){
  const { SUPABASE_URL, SUPABASE_SERVICE_KEY, SESSION_SECRET } = process.env;
  const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
  const sid = getCookie(req,'sid');
  if (!sid) return res.status(401).json({ message:'Not logged in' });
  const token_hash = hashToken(sid, SESSION_SECRET);
  const { data: sess } = await sb.from('sessions').select('user_id').eq('token_hash', token_hash).gte('expires_at', new Date().toISOString()).single();
  if (!sess) return res.status(401).json({ message:'Session invalid' });

  const { data: msgs } = await sb.from('inbox_messages')
    .select('id,title,body,created_at').or(`to_user.eq.${sess.user_id},to_user.is.null`)
    .order('created_at', { ascending: false }).limit(50);
  res.status(200).json({ items: msgs || [] });
}
