// /api/auth.js
import crypto from 'crypto';
import { db, send, getJson, sessionUser, sessionCookie, subpath } from '../lib/api-util.js';

export default async function handler(req, res) {
  try {
    const path = subpath(req, '/api/auth'); // '', 'create', 'recover', 'me', 'logout'

    if (path === 'me' && req.method === 'GET') {
      const uid = await sessionUser(req);
      return send(res, 200, { ok:true, loggedIn: !!uid, userId: uid || null });
    }

    if (path === 'logout' && (req.method === 'POST' || req.method === 'GET')) {
      const cookie = 'sid=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0';
      return send(res, 200, { ok:true, loggedIn:false }, cookie);
    }

    if (path === 'create' && (req.method === 'POST' || req.method === 'GET')) {
      const existing = await sessionUser(req);
      if (existing) return send(res, 200, { ok:true, already:true, message:'Already logged in' });

      const chunk=()=>crypto.randomBytes(16).toString('base64url').slice(0,22);
      const recovery=`${chunk()}-${chunk()}`;
      const recovery_hash=crypto.createHash('sha256').update(recovery).digest('hex');

      const { data:user, error:uerr }=await db.from('users').insert({ recovery_hash }).select('id').single();
      if (uerr) return send(res,500,{ ok:false, message:uerr.message });

      const sid = crypto.randomUUID();
      const token_hash = crypto.createHash('sha256').update(sid).digest('hex');
      const expires_at = new Date(Date.now() + 30*24*60*60*1000).toISOString();

      const { error:serr }=await db.from('sessions').insert({ sid, token_hash, user_id:user.id, expires_at });
      if (serr) return send(res,500,{ ok:false, message:serr.message });

      return send(res,200,{ ok:true, recovery }, sessionCookie(sid));
    }

    if (path === 'recover' && req.method === 'POST') {
      const { recovery } = await getJson(req);
      if (!recovery) return send(res,400,{ ok:false, message:'Missing recovery' });
      const recovery_hash=crypto.createHash('sha256').update(recovery).digest('hex');

      const { data:user, error }=await db.from('users').select('id').eq('recovery_hash',recovery_hash).single();
      if (error || !user) return send(res,401,{ ok:false, message:'Invalid recovery' });

      const sid = crypto.randomUUID();
      const token_hash = crypto.createHash('sha256').update(sid).digest('hex');
      const expires_at = new Date(Date.now() + 30*24*60*60*1000).toISOString();

      const { error:serr }=await db.from('sessions').insert({ sid, token_hash, user_id:user.id, expires_at });
      if (serr) return send(res,500,{ ok:false, message:serr.message });

      return send(res,200,{ ok:true }, sessionCookie(sid));
    }

    return send(res, 404, { ok:false, message:'Unknown auth route' });
  } catch (e) {
    return send(res, 500, { ok:false, message:e?.message || 'unknown' });
  }
}
