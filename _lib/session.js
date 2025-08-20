import { randomBytes, createHash } from 'crypto';

export function makeToken(bytes = 32) {
  return randomBytes(bytes).toString('base64url');
}
export function hashToken(token, secret = '') {
  return createHash('sha256').update(secret + ':' + token).digest('hex');
}
export function setCookie(res, name, value, opts = {}) {
  const parts = [`${name}=${value}`];
  const def = { Path: '/', HttpOnly: true, Secure: true, SameSite: 'Lax', MaxAge: 60*60*24*7 };
  const o = { ...def, ...opts };
  if (o.MaxAge) parts.push(`Max-Age=${o.MaxAge}`);
  if (o.SameSite) parts.push(`SameSite=${o.SameSite}`);
  if (o.Secure) parts.push('Secure');
  if (o.HttpOnly) parts.push('HttpOnly');
  if (o.Path) parts.push(`Path=${o.Path}`);
  res.setHeader('Set-Cookie', parts.join('; '));
}
export function getCookie(req, name) {
  const c = req.headers.cookie || '';
  for (const kv of c.split(/;\s*/)) {
    const [k, ...rest] = kv.split('=');
    if (k === name) return rest.join('=');
  }
  return null;
}
