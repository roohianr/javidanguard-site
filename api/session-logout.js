import { send } from './_util.js';
export default async function handler(req, res) {
  try {
    if (!(req.method === 'POST' || req.method === 'GET')) {
      return send(res, 405, { ok:false, message:'Method not allowed' });
    }
    const cookie = 'sid=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0';
    return send(res, 200, { ok:true, loggedIn:false }, cookie);
  } catch (e) {
    return send(res, 500, { ok:false, message:e?.message || 'unknown' });
  }
}
