// api/_util.js
import { createClient } from '@supabase/supabase-js';

export const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

export function send(res, status, obj, cookie) {
  if (res.writableEnded) return;
  if (cookie) res.setHeader('Set-Cookie', cookie);
  res.status(status);
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(obj));
}

export function parseCookie(req, name) {
  const cookie = req.headers.cookie || '';
  const m = cookie.match(new RegExp('(?:^|;\\s*)' + name + '=([^;]+)'));
  return m ? decodeURIComponent(m[1]) : null;
}

export async function getJson(req) {
  if (req.body) return req.body;
  const chunks = []; for await (const c of req) chunks.push(c);
  const raw = Buffer.concat(chunks).toString('utf8');
  try { return JSON.parse(raw || '{}'); } catch { return {}; }
}

export async function sessionUser(req) {
  const sid = parseCookie(req, 'sid');
  if (!sid) return null;
  const { data, error } = await db
    .from('sessions')
    .select('user_id, expires_at')
    .eq('sid', sid)
    .single();
  if (error || !data) return null;
  if (new Date(data.expires_at) <= new Date()) return null;
  return data.user_id;
}

export function sessionCookie(sid) {
  // 30 days
  return `sid=${sid}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=2592000`;
}
