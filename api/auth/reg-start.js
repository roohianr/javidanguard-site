import { generateRegistrationOptions } from '@simplewebauthn/server';
import { getCookie, setCookie } from '../_lib/session.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') { res.setHeader('Allow','POST'); return res.status(405).end(); }
  const { handle = 'user' } = req.body || {};
  const rpID = process.env.RP_ID;
  const rpName = process.env.RP_NAME || 'App';
  const origin = `https://${rpID}`;

  const opts = await generateRegistrationOptions({
    rpName, rpID,
    userName: handle,
    timeout: 60_000,
    attestationType: 'none',
    authenticatorSelection: { residentKey: 'preferred', userVerification: 'preferred' }
  });

  // store challenge in a short-lived cookie
  setCookie(res, 'wchal', opts.challenge, { MaxAge: 300 });
  setCookie(res, 'whandle', encodeURIComponent(handle), { MaxAge: 300, HttpOnly: false }); // readable by client to reuse handle
  res.status(200).json({ origin, options: opts });
}
