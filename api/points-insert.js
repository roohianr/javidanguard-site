// api/points-insert.js
import { createClient } from '@supabase/supabase-js';
import * as h3 from 'h3-js'; // v4 API (isValidCell, latLngToCell, cellToBoundary)
const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

function send(res, status, obj){ if(res.writableEnded)return; res.status(status);
  res.setHeader('Content-Type','application/json'); res.end(JSON.stringify(obj)); }

async function getJson(req){
  if (req.body) return req.body;
  const chunks=[]; for await (const c of req) chunks.push(c);
  const raw=Buffer.concat(chunks).toString('utf8'); try{ return JSON.parse(raw||'{}'); }catch{ return {}; }
}

async function userFromSid(req){
  const cookie=req.headers.cookie||''; const m=cookie.match(/(?:^|;\s*)sid=([^;]+)/); if(!m) return null;
  const sid=decodeURIComponent(m[1]);
  const { data, error }=await db.from('sessions')
    .select('user_id, expires_at').eq('sid',sid).single();
  if (error || !data) return null;
  if (new Date(data.expires_at) <= new Date()) return null; // refuse expired
  return data.user_id;
}

export default async function handler(req,res){
  try{
    if (req.method !== 'POST') return send(res,405,{ok:false,message:'Method not allowed'});

    const uid = await userFromSid(req);
    if (!uid) return send(res,401,{ok:false,message:'Login required'});

    const body = await getJson(req);
    const cell = body?.cell;
    const value = Number(body?.value);

    if (!cell || !Number.isFinite(value)) return send(res,400,{ok:false,message:'Missing cell or value'});

    // ✅ v4 name:
    if (!h3.isValidCell(cell)) return send(res,400,{ok:false,message:'Invalid H3 index'});

    const { error } = await db.from('points').insert({ h3: cell, value, user_id: uid });
    if (error) return send(res,500,{ok:false,message:error.message});

    return send(res,200,{ok:true});
  } catch (e) {
    return send(res,500,{ok:false,message:e?.message||'unknown'});
  }
}
