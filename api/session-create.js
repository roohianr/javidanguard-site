// api/session-create.js
import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

function makeRecovery() {
  // Simple 2-chunk base64url; replace with a BIP-39 word list if you want
  const chunk = () => crypto.randomBytes(16).toString('base64url').slice(0,22);
  return `${chunk()}-${chunk()}`;
}

export default async function handler(_req, res) {
  try {
    const recovery = makeRecovery();
    const recovery_hash = crypto.createHash('sha256').update(recovery).digest('hex');

    const { data: user, error: uerr } = await supabase
      .from('users')
      .insert({ recovery_hash })
      .select('id')
      .single();
    if (uerr) return res.status(500).json({ ok:false, message:uerr.message });

    const sid = crypto.randomUUID();
    const { error: serr } = await supabase.from('sessions').insert({ sid, user_id: user.id });
    if (serr) return res.status(500).json({ ok:false, message:serr.message });

    res.setHeader('Set-Cookie', `sid=${sid}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=2592000`);
    return res.status(200).json({ ok:true, recovery });
  } catch (e) {
    return res.status(500).json({ ok:false, message:e.message });
  }
}
