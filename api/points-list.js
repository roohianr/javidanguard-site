import { createClient } from '@supabase/supabase-js';
const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

function send(res,status,obj){ if(res.writableEnded)return; res.status(status);
  res.setHeader('Content-Type','application/json'); res.end(JSON.stringify(obj)); }

export default async function handler(req,res){
  try{
    if(req.method!=='GET') return send(res,405,{ok:false,message:'Method not allowed'});
    const { data, error } = await db.from('points').select('h3, value').limit(5000);
    if(error) return send(res,500,{ok:false,message:error.message});
    return send(res,200,{ok:true,items:data||[]});
  }catch(e){ return send(res,500,{ok:false,message:e?.message||'unknown'}); }
}
