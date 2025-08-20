import { generateAuthenticationOptions } from '@simplewebauthn/server';
import { setCookie } from '../_lib/session.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') { res.setHeader('Allow','POST'); return res.status(405).end(); }
  const rpID = process.env.RP_ID;
  const origin = `https://${rpID}`;

  const opts = await generateAuthenticationOptions({
    rpID,
    timeout: 60_000,
    userVerification: 'preferred',
    allowCredentials: [] // username-less (discoverable credentials)
  });

  setCookie(res, 'wchal', opts.challenge, { MaxAge: 300 });
  res.status(200).json({ origin, options: opts });
}
