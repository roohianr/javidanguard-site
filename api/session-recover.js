// api/session-recover.js
import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

export default async function handler(req, res) {
  try {
    const { recovery } = req.body || {};
    if (!recovery) return res.status(400).json({ ok:false, message:'Missing recovery' });
    const recovery_hash = crypto.createHash('sha256').update(recovery).digest('hex');

    const { data: user, error } = await supabase
      .from('users').select('id').eq('recovery_hash', recovery_hash).single();
    if (error || !user) return res.status(401).json({ ok:false, message:'Invalid recovery' });

    const sid = crypto.randomUUID();
    const { error: serr } = await supabase.from('sessions').insert({ sid, user_id: user.id });
    if (serr) return res.status(500).json({ ok:false, message:serr.message });

    res.setHeader('Set-Cookie', `sid=${sid}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=2592000`);
    return res.status(200).json({ ok:true });
  } catch (e) {
    return res.status(500).json({ ok:false, message:e.message });
  }
}
