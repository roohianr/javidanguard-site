import { verifyAuthenticationResponse } from '@simplewebauthn/server';
import { createClient } from '@supabase/supabase-js';
import { makeToken, hashToken, setCookie, getCookie } from '../_lib/session.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') { res.setHeader('Allow','POST'); return res.status(405).end(); }
  const rpID = process.env.RP_ID;
  const origin = `https://${rpID}`;
  const expectedChallenge = getCookie(req, 'wchal');

  const { SUPABASE_URL, SUPABASE_SERVICE_KEY, SESSION_SECRET } = process.env;
  const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

  try {
    const verification = await verifyAuthenticationResponse({
      response: req.body,
      expectedRPID: rpID,
      expectedOrigin: origin,
      expectedChallenge
    });
    if (!verification.verified) return res.status(400).json({ message: 'Auth not verified' });

    const { credentialID, newCounter } = verification.authenticationInfo;
    const credId = Buffer.from(credentialID).toString('base64url');

    // find passkey -> user
    const { data: pk } = await sb.from('passkeys').select('user_id,counter,id').eq('cred_id', credId).single();
    if (!pk) return res.status(404).json({ message: 'Credential not found' });

    // update counter
    await sb.from('passkeys').update({ counter: newCounter ?? pk.counter }).eq('id', pk.id);

    // issue session
    const token = makeToken();
    const token_hash = hashToken(token, SESSION_SECRET);
    const expires_at = new Date(Date.now() + 7*24*3600*1000).toISOString();
    await sb.from('sessions').insert({ user_id: pk.user_id, token_hash, expires_at });

    setCookie(res, 'sid', token, { MaxAge: 60*60*24*7, SameSite:'Lax' });
    res.status(200).json({ ok: true });
  } catch (e) {
    res.status(400).json({ message: 'Login error', detail: e.message || String(e) });
  }
}
