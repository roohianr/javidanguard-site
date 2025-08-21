import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';
const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

function send(res, status, obj, cookie){ if(res.writableEnded)return; if(cookie)res.setHeader('Set-Cookie',cookie);
  res.status(status); res.setHeader('Content-Type','application/json'); res.end(JSON.stringify(obj)); }

export default async function handler(req,res){
  try{
    if(req.method!=='POST') return send(res,405,{ok:false,message:'Method not allowed'});
    const chunk=()=>crypto.randomBytes(16).toString('base64url').slice(0,22);
    const recovery=`${chunk()}-${chunk()}`;
    const recovery_hash=crypto.createHash('sha256').update(recovery).digest('hex');

    const { data:user, error:uerr }=await db.from('users').insert({ recovery_hash }).select('id').single();
    if(uerr) return send(res,500,{ok:false,message:uerr.message});

    const sid=crypto.randomUUID();
    const { error:serr }=await db.from('sessions').insert({ sid, user_id:user.id });
    if(serr) return send(res,500,{ok:false,message:serr.message});

    const cookie=`sid=${sid}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=2592000`;
    return send(res,200,{ok:true,recovery},cookie);
  }catch(e){ return send(res,500,{ok:false,message:e?.message||'unknown'}); }
}
