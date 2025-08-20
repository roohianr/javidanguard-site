import { verifyRegistrationResponse } from '@simplewebauthn/server';
import { createClient } from '@supabase/supabase-js';
import { makeToken, hashToken, getCookie, setCookie } from '../_lib/session.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') { res.setHeader('Allow','POST'); return res.status(405).end(); }
  const rpID = process.env.RP_ID;
  const origin = `https://${rpID}`;
  const expectedChallenge = getCookie(req, 'wchal');
  const handle = decodeURIComponent(getCookie(req, 'whandle') || 'user');

  const { SUPABASE_URL, SUPABASE_SERVICE_KEY, SESSION_SECRET } = process.env;
  const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

  try {
    const verification = await verifyRegistrationResponse({
      response: req.body,
      expectedChallenge,
      expectedOrigin: origin,
      expectedRPID: rpID
    });
    if (!verification.verified) return res.status(400).json({ message: 'Registration not verified' });

    // Create user + save passkey
    const { data: userRow } = await sb.from('app_users').insert({ handle }).select('id').single();
    const user_id = userRow.id;

    const reg = verification.registrationInfo;
    const credId = Buffer.from(reg.credentialID).toString('base64url');
    const { error: pkErr } = await sb.from('passkeys').insert({
      user_id,
      cred_id: credId,
      public_key: Buffer.from(reg.credentialPublicKey),
      counter: reg.counter ?? 0,
      transports: reg.transports || [],
      backed_up: reg.backedUp ?? null,
      device_type: reg.credentialDeviceType ?? null
    });
    if (pkErr) return res.status(500).json({ message: 'Save passkey failed', detail: pkErr.message });

    // issue session
    const token = makeToken();
    const token_hash = hashToken(token, SESSION_SECRET);
    const expires_at = new Date(Date.now() + 7*24*3600*1000).toISOString();
    const { error: sErr } = await sb.from('sessions').insert({ user_id, token_hash, expires_at });
    if (sErr) return res.status(500).json({ message: 'Session create failed', detail: sErr.message });

    setCookie(res, 'sid', token, { MaxAge: 60*60*24*7, SameSite:'Lax' });
    res.status(200).json({ ok: true });
  } catch (e) {
    res.status(400).json({ message: 'Registration error', detail: e.message || String(e) });
  }
}
