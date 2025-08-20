// api/[...route].js
import { createClient } from '@supabase/supabase-js';
import * as h3 from 'h3-js';
import {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
} from '@simplewebauthn/server';
import { randomBytes, createHash } from 'crypto';

// ---------- helpers ----------
const BUCKET_MID = [1,3,8,15,25];
const DEFAULT_K = 20;
const K = Math.max(1, Number(process.env.K_THRESHOLD || DEFAULT_K));
const NOISE_B = Number(process.env.NOISE_B || 0);

function laplace(b){ const u=Math.random()-0.5; return -b*Math.sign(u)*Math.log(1-2*Math.abs(u)); }

function sb() {
  const { SUPABASE_URL, SUPABASE_SERVICE_KEY } = process.env;
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
}

function makeToken(n=32){ return randomBytes(n).toString('base64url'); }
function hashToken(token, secret=''){ return createHash('sha256').update(`${secret}:${token}`).digest('hex'); }

function setCookie(res, name, value, opts={}) {
  const def = { Path:'/', HttpOnly:true, Secure:true, SameSite:'Lax', MaxAge:60*60*24*7 };
  const o = { ...def, ...opts };
  const parts = [`${name}=${value}`];
  if (o.MaxAge) parts.push(`Max-Age=${o.MaxAge}`);
  if (o.SameSite) parts.push(`SameSite=${o.SameSite}`);
  if (o.Secure) parts.push('Secure');
  if (o.HttpOnly) parts.push('HttpOnly');
  if (o.Path) parts.push(`Path=${o.Path}`);
  res.setHeader('Set-Cookie', parts.join('; '));
}
function getCookie(req, name){
  const c = req.headers.cookie || ''; const parts = c.split(/;\s*/);
  for (const kv of parts){ const [k,...v]=kv.split('='); if(k===name) return v.join('='); }
  return null;
}
async function getJSON(req){ try{ return JSON.parse(await new Promise(res=>{ let b=''; req.on('data',c=>b+=c); req.on('end',()=>res(b||'{}')); })); } catch{ return {}; } }

function parsePath(req){
  const url = new URL(req.url, `http://${req.headers.host}`);
  const path = url.pathname.replace(/^\/api\/?/, ''); // e.g. "auth/reg-start"
  return { url, path };
}
// add near the other helpers
function handleHealth(req, res) {
  const ok = !!process.env.SUPABASE_URL && !!process.env.SUPABASE_SERVICE_KEY;
  return res.status(200).json({
    ok,
    hasUrl: !!process.env.SUPABASE_URL,
    hasKey: !!process.env.SUPABASE_SERVICE_KEY,
    node: process.version
  });
}
function handleK(req, res) {
  return res.status(200).json({
    K: Math.max(1, Number(process.env.K_THRESHOLD || DEFAULT_K)),
    NOISE_B: Number(process.env.NOISE_B || 0)
  });
}
// ---------- auth helpers ----------
async function requireSession(req){
  const { SESSION_SECRET } = process.env;
  const s = sb();
  const sid = getCookie(req, 'sid');
  if(!sid) return null;
  const token_hash = hashToken(sid, SESSION_SECRET || '');
  const { data } = await s.from('sessions')
    .select('user_id,expires_at').eq('token_hash', token_hash)
    .gte('expires_at', new Date().toISOString()).maybeSingle();
  return data || null;
}

// ---------- handlers ----------
async function handleAgg2(req, res, url) {
  const bbox = url.searchParams.get('bbox');
  if (!bbox) return res.status(400).json({ message:'bbox required' });
  const [minLng,minLat,maxLng,maxLat] = bbox.split(',').map(Number);
  const zoom = Number(url.searchParams.get('z') || 6);
  const targetRes = zoom < 6 ? 5 : zoom < 8 ? 6 : zoom < 10 ? 7 : 8;

  const client = sb();
  const since = new Date(Date.now() - 365*24*3600*1000).toISOString();
  const { data: rows, error } = await client.from('submissions')
    .select('h3,bucket,created_at').gte('created_at', since);
  if (error) return res.status(500).json({ message:'DB read error', detail:error.message });

  const agg = new Map();
  for (const r of rows||[]) {
    if (!h3.isValidCell?.(r.h3)) continue;
    const parent = h3.cellToParent(r.h3, targetRes);
    const [lat,lng] = h3.cellToLatLng(parent);
    if (lat<minLat||lat>maxLat||lng<minLng||lng>maxLng) continue;
    agg.set(parent, (agg.get(parent)||0) + BUCKET_MID[r.bucket||0]);
  }

  const features = [];
  for (const [cell, base] of agg.entries()){
    let count = base + (NOISE_B ? laplace(NOISE_B) : 0);
    if (count < K) continue;
    const [lat,lng] = h3.cellToLatLng(cell);
    features.push({ type:'Feature', properties:{ cell, count:Math.max(1,Math.round(count)), res:targetRes }, geometry:{ type:'Point', coordinates:[lng,lat] } });
  }
  res.setHeader('Cache-Control','public, max-age=10, s-maxage=10, stale-while-revalidate=60');
  return res.status(200).json({ type:'FeatureCollection', features });
}

async function handleSubmit(req, res) {
  if (req.method !== 'POST') { res.setHeader('Allow','POST'); return res.status(405).end(); }
  const body = await getJSON(req);
  const { h3: cell, bucket, hashedDevice } = body || {};
  if (!cell || typeof bucket !== 'number' || bucket<0 || bucket>4 || !hashedDevice) {
    return res.status(400).json({ message:'Bad request' });
  }
  const client = sb();
  const h3r7 = h3.cellToParent(cell, 7);
  const h3r6 = h3.cellToParent(cell, 6);
  const h3r5 = h3.cellToParent(cell, 5);
  const since30d = new Date(Date.now()-30*24*3600*1000).toISOString();
  const since24h = new Date(Date.now()-24*3600*1000).toISOString();

  const { data: recentCluster, error: q1 } = await client
    .from('submissions').select('id').eq('hashed_device', hashedDevice)
    .eq('h3r7', h3r7).gte('created_at', since30d).limit(1).maybeSingle();
  if (q1) return res.status(500).json({ message:'DB query error', detail:q1.message||q1 });
  if (recentCluster) return res.status(429).json({ message:'You already submitted for this area recently.' });

  const day = await client.from('submissions').select('id',{ head:true, count:'exact' })
    .eq('hashed_device', hashedDevice).gte('created_at', since24h);
  if (day.error) return res.status(500).json({ message:'DB count error', detail:day.error.message });
  if ((day.count||0)>=1) return res.status(429).json({ message:'Daily limit reached' });

  const { error: ins } = await client.from('submissions').insert({ h3:cell, h3r7, h3r6, h3r5, bucket, hashed_device: hashedDevice });
  if (ins) return res.status(500).json({ message:'Insert failed', detail: ins.message });
  return res.status(200).json({ ok:true });
}

async function handleAdminAgg2(req,res,url){
  const key = req.headers['x-admin-key'] || url.searchParams.get('key');
  if (key !== process.env.ADMIN_KEY) return res.status(401).json({ message:'Unauthorized' });
  const bbox = url.searchParams.get('bbox');
  if (!bbox) return res.status(400).json({ message:'bbox required' });
  const [minLng,minLat,maxLng,maxLat] = bbox.split(',').map(Number);
  const zoom = Number(url.searchParams.get('z') || 6);
  const targetRes = zoom < 6 ? 5 : zoom < 8 ? 6 : zoom < 10 ? 7 : 8;

  const client = sb();
  const since = new Date(Date.now() - 365*24*3600*1000).toISOString();
  const { data: rows, error } = await client.from('submissions')
    .select('h3,bucket,created_at').gte('created_at', since);
  if (error) return res.status(500).json({ message:'DB read error', detail:error.message });

  const agg = new Map();
  for (const r of rows||[]) {
    if (!h3.isValidCell?.(r.h3)) continue;
    const parent = h3.cellToParent(r.h3, targetRes);
    const [lat,lng] = h3.cellToLatLng(parent);
    if (lat<minLat||lat>maxLat||lng<minLng||lng>maxLng) continue;
    agg.set(parent, (agg.get(parent)||0) + BUCKET_MID[r.bucket||0]);
  }
  const features = [];
  for (const [cell, count] of agg.entries()){
    const [lat,lng] = h3.cellToLatLng(cell);
    features.push({ type:'Feature', properties:{ cell, count:Math.round(count), res:targetRes }, geometry:{ type:'Point', coordinates:[lng,lat] } });
  }
  res.setHeader('Cache-Control','no-store');
  return res.status(200).json({ type:'FeatureCollection', features });
}

async function handleAdminSeed(req,res){
  if (req.method !== 'POST') { res.setHeader('Allow','POST'); return res.status(405).end(); }
  const key = req.headers['x-admin-key'] || new URL(req.url, 'http://x').searchParams.get('key');
  if (key !== process.env.ADMIN_KEY) return res.status(401).json({ message:'Unauthorized' });
  const body = await getJSON(req);
  const { cell, n=1, bucket=0 } = body || {};
  if (!cell || !h3.isValidCell?.(cell)) return res.status(400).json({ message:'valid cell required' });
  const N = Math.min(200, Math.max(1, parseInt(n,10) || 1));
  const b = Math.max(0, Math.min(4, +bucket || 0));
  const h3r7 = h3.cellToParent(cell, 7);
  const h3r6 = h3.cellToParent(cell, 6);
  const h3r5 = h3.cellToParent(cell, 5);
  const rows = Array.from({length:N}, ()=>({ h3:cell, h3r7, h3r6, h3r5, bucket:b, hashed_device: randomBytes(16).toString('hex') }));
  const client = sb();
  const { error } = await client.from('submissions').insert(rows);
  if (error) return res.status(500).json({ message:'Insert failed', detail:error.message });
  return res.status(200).json({ ok:true, inserted:N });
}

// ---- Passkey auth handlers ----
async function handleRegStart(req,res){
  if (req.method!=='POST') { res.setHeader('Allow','POST'); return res.status(405).end(); }
  const { handle='user' } = await getJSON(req);
  const rpID = process.env.RP_ID; const rpName = process.env.RP_NAME || 'App';
  const origin = `https://${rpID}`;
  const opts = await generateRegistrationOptions({
    rpName, rpID, userName: handle, timeout: 60_000,
    attestationType:'none',
    authenticatorSelection:{ residentKey:'preferred', userVerification:'preferred' }
  });
  setCookie(res,'wchal', opts.challenge, { MaxAge:300 });
  setCookie(res,'whandle', encodeURIComponent(handle), { MaxAge:300, HttpOnly:false });
  return res.status(200).json({ origin, options: opts });
}
async function handleRegFinish(req,res){
  if (req.method!=='POST') { res.setHeader('Allow','POST'); return res.status(405).end(); }
  const rpID = process.env.RP_ID; const origin = `https://${rpID}`;
  const expectedChallenge = getCookie(req,'wchal');
  const handle = decodeURIComponent(getCookie(req,'whandle') || 'user');
  const client = sb();
  try{
    const verification = await verifyRegistrationResponse({
      response: await getJSON(req),
      expectedChallenge, expectedOrigin: origin, expectedRPID: rpID
    });
    if (!verification.verified) return res.status(400).json({ message:'Registration not verified' });

    const { data: userRow, error: uErr } = await client.from('app_users').insert({ handle }).select('id').single();
    if (uErr) return res.status(500).json({ message:'Create user failed', detail:uErr.message });
    const user_id = userRow.id;

    const reg = verification.registrationInfo;
    const credId = Buffer.from(reg.credentialID).toString('base64url');
    const { error: pkErr } = await client.from('passkeys').insert({
      user_id, cred_id: credId,
      public_key: Buffer.from(reg.credentialPublicKey),
      counter: reg.counter ?? 0,
      transports: reg.transports || [],
      backed_up: reg.backedUp ?? null,
      device_type: reg.credentialDeviceType ?? null
    });
    if (pkErr) return res.status(500).json({ message:'Save passkey failed', detail: pkErr.message });

    const token = makeToken();
    const token_hash = hashToken(token, process.env.SESSION_SECRET || '');
    const expires_at = new Date(Date.now()+7*24*3600*1000).toISOString();
    const { error: sErr } = await client.from('sessions').insert({ user_id, token_hash, expires_at });
    if (sErr) return res.status(500).json({ message:'Session create failed', detail:sErr.message });

    setCookie(res,'sid', token, { MaxAge:60*60*24*7, SameSite:'Lax' });
    return res.status(200).json({ ok:true });
  }catch(e){ return res.status(400).json({ message:'Registration error', detail:e.message||String(e) }); }
}
async function handleLoginStart(req,res){
  if (req.method!=='POST') { res.setHeader('Allow','POST'); return res.status(405).end(); }
  const rpID = process.env.RP_ID;
  const opts = await generateAuthenticationOptions({
    rpID, timeout:60_000, userVerification:'preferred', allowCredentials:[]
  });
  setCookie(res,'wchal', opts.challenge, { MaxAge:300 });
  return res.status(200).json({ origin:`https://${rpID}`, options: opts });
}
async function handleLoginFinish(req,res){
  if (req.method!=='POST') { res.setHeader('Allow','POST'); return res.status(405).end(); }
  const rpID = process.env.RP_ID; const origin = `https://${rpID}`;
  const expectedChallenge = getCookie(req,'wchal');
  const client = sb();
  try{
    const verification = await verifyAuthenticationResponse({
      response: await getJSON(req),
      expectedRPID: rpID, expectedOrigin: origin, expectedChallenge
    });
    if (!verification.verified) return res.status(400).json({ message:'Auth not verified' });
    const { credentialID, newCounter } = verification.authenticationInfo;
    const credId = Buffer.from(credentialID).toString('base64url');
    const { data: pk } = await client.from('passkeys').select('user_id,counter,id').eq('cred_id', credId).maybeSingle();
    if (!pk) return res.status(404).json({ message:'Credential not found' });
    await client.from('passkeys').update({ counter: newCounter ?? pk.counter }).eq('id', pk.id);

    const token = makeToken();
    const token_hash = hashToken(token, process.env.SESSION_SECRET || '');
    const expires_at = new Date(Date.now()+7*24*3600*1000).toISOString();
    await client.from('sessions').insert({ user_id: pk.user_id, token_hash, expires_at });
    setCookie(res,'sid', token, { MaxAge:60*60*24*7, SameSite:'Lax' });
    return res.status(200).json({ ok:true });
  }catch(e){ return res.status(400).json({ message:'Login error', detail:e.message||String(e) }); }
}

async function handleMe(req,res){
  const sess = await requireSession(req);
  if (!sess) return res.status(401).json({ message:'Not logged in' });
  const client = sb();
  const { data: user } = await client.from('app_users').select('id,handle,created_at').eq('id', sess.user_id).single();
  const { data: memb } = await client.from('memberships').select('cell_h3,bucket,locked_until,h3r7').eq('user_id', sess.user_id).maybeSingle();
  return res.status(200).json({ user, membership: memb || null });
}

async function handleUpsertZone(req,res){
  if (req.method!=='POST') { res.setHeader('Allow','POST'); return res.status(405).end(); }
  const sess = await requireSession(req);
  if (!sess) return res.status(401).json({ message:'Not logged in' });
  const body = await getJSON(req);
  const { cell_h3, bucket } = body || {};
  if (!cell_h3 || !h3.isValidCell?.(cell_h3)) return res.status(400).json({ message:'Valid cell_h3 required' });
  if (typeof bucket!=='number' || bucket<2 || bucket>4) return res.status(400).json({ message:'Group must be 5+' });
  const client = sb();
  const { data: cur } = await client.from('memberships').select('locked_until').eq('user_id', sess.user_id).maybeSingle();
  const now = new Date(); if (cur && new Date(cur.locked_until) > now) return res.status(429).json({ message:'Zone change locked', locked_until: cur.locked_until });
  const locked_until = new Date(now.getTime()+7*24*3600*1000).toISOString();
  const h3r7 = h3.cellToParent(cell_h3,7), h3r6 = h3.cellToParent(cell_h3,6), h3r5 = h3.cellToParent(cell_h3,5);
  const { error } = await client.from('memberships').upsert({ user_id: sess.user_id, cell_h3, bucket, h3r7, h3r6, h3r5, updated_at: now.toISOString(), locked_until });
  if (error) return res.status(500).json({ message:'Save failed', detail:error.message });
  return res.status(200).json({ ok:true, locked_until });
}

async function handleInboxList(req,res){
  const sess = await requireSession(req);
  if (!sess) return res.status(401).json({ message:'Not logged in' });
  const client = sb();
  const { data: msgs } = await client.from('inbox_messages')
    .select('id,title,body,created_at').or(`to_user.eq.${sess.user_id},to_user.is.null`)
    .order('created_at',{ ascending:false }).limit(50);
  return res.status(200).json({ items: msgs || [] });
}

async function handleChatFetch(req,res){
  const sess = await requireSession(req);
  if (!sess) return res.status(401).json({ message:'Not logged in' });
  const client = sb();
  const { data: memb } = await client.from('memberships').select('h3r7').eq('user_id', sess.user_id).single();
  const { data: rows } = await client.from('chat_messages')
    .select('user_id,text,created_at').eq('h3r7', memb.h3r7).order('created_at',{ascending:false}).limit(100);
  return res.status(200).json({ h3r7: memb.h3r7, items: rows || [] });
}

async function handleChatPost(req,res){
  if (req.method!=='POST') { res.setHeader('Allow','POST'); return res.status(405).end(); }
  const sess = await requireSession(req);
  if (!sess) return res.status(401).json({ message:'Not logged in' });
  const { text } = await getJSON(req);
  if (!text || text.length<1 || text.length>500) return res.status(400).json({ message:'Bad text' });
  const client = sb();
  const { data: memb } = await client.from('memberships').select('h3r7').eq('user_id', sess.user_id).single();
  const { error } = await client.from('chat_messages').insert({ user_id: sess.user_id, h3r7: memb.h3r7, text });
  if (error) return res.status(500).json({ message:'Post failed', detail:error.message });
  return res.status(200).json({ ok:true });
}

async function handleAnnCreate(req,res){
  if (req.method!=='POST') { res.setHeader('Allow','POST'); return res.status(405).end(); }
  const sess = await requireSession(req);
  if (!sess) return res.status(401).json({ message:'Not logged in' });
  const { cell_h3, kind, title='', details='' } = await getJSON(req);
  if (!cell_h3 || !h3.isValidCell?.(cell_h3)) return res.status(400).json({ message:'Valid cell required' });
  if (!kind) return res.status(400).json({ message:'kind required' });
  if (details.length>2000) return res.status(400).json({ message:'details too long' });
  const client = sb();
  const { error } = await client.from('annotations').insert({ author_id: sess.user_id, cell_h3, kind, title, details });
  if (error) return res.status(500).json({ message:'Create failed', detail:error.message });
  return res.status(200).json({ ok:true });
}

async function handleAnnVote(req,res){
  if (req.method!=='POST') { res.setHeader('Allow','POST'); return res.status(405).end(); }
  const sess = await requireSession(req);
  if (!sess) return res.status(401).json({ message:'Not logged in' });
  const { id, value } = await getJSON(req);
  if (!id || ![1,-1].includes(value)) return res.status(400).json({ message:'Bad vote' });
  const client = sb();
  const { error: vErr } = await client.from('annotation_votes').upsert({ annotation_id:id, voter_id:sess.user_id, value });
  if (vErr) return res.status(500).json({ message:'Vote failed', detail:vErr.message });
  const { data: vs } = await client.from('annotation_votes').select('value').eq('annotation_id', id);
  const up = (vs||[]).filter(v=>v.value===1).length; const down = (vs||[]).filter(v=>v.value===-1).length;
  await client.from('annotations').update({ up, down }).eq('id', id);
  return res.status(200).json({ ok:true, up, down });
}

async function handleAnnList(req,res,url){
  const bbox = url.searchParams.get('bbox');
  if (!bbox) return res.status(400).json({ message:'bbox required' });
  const [minLng,minLat,maxLng,maxLat] = bbox.split(',').map(Number);
  const zoom = Number(url.searchParams.get('z') || 8);
  const kind = url.searchParams.get('kind') || '';
  const resZoom = zoom < 6 ? 5 : zoom < 8 ? 6 : zoom < 10 ? 7 : 8;

  const client = sb();
  const { data: memb } = await client.from('memberships').select('cell_h3,bucket');
  const agg = new Map();
  for (const m of (memb||[])) {
    if (!h3.isValidCell?.(m.cell_h3)) continue;
    const parent = h3.cellToParent(m.cell_h3, resZoom);
    agg.set(parent, (agg.get(parent)||0) + BUCKET_MID[m.bucket||2]);
  }
  const ok = new Set([...agg.entries()].filter(([,v])=> v>=K).map(([k])=>k));

  const { data: anns } = await client.from('annotations')
    .select('id,cell_h3,kind,title,details,up,down,status,created_at')
    .order('created_at',{ascending:false}).limit(500);

  const features = [];
  for (const a of (anns||[])) {
    if (kind && a.kind!==kind) continue;
    if ((a.up - a.down) < 1) continue;
    const parent = h3.cellToParent(a.cell_h3, resZoom);
    if (!ok.has(parent)) continue;
    const [lat,lng] = h3.cellToLatLng(parent);
    if (lat<minLat||lat>maxLat||lng<minLng||lng>maxLng) continue;
    features.push({ type:'Feature', properties:{ id:a.id, kind:a.kind, title:a.title, votes:a.up-a.down }, geometry:{ type:'Point', coordinates:[lng,lat] } });
  }
  return res.status(200).json({ type:'FeatureCollection', features });
}

// ---------- main router ----------
export default async function handler(req, res) {
  const { url, path } = parsePath(req);

  try {
    // public map + admin
    if (path === 'agg2' && req.method==='GET') return handleAgg2(req,res,url);
    if (path === 'submit') return handleSubmit(req,res);
    if (path === 'admin/agg2' && req.method==='GET') return handleAdminAgg2(req,res,url);
    if (path === 'admin/seed') return handleAdminSeed(req,res);
    // k and health
    if (path === 'health' && req.method === 'GET') return handleHealth(req, res);
    if (path === 'k' && req.method === 'GET') return handleK(req, res);
    // auth
    if (path === 'auth/reg-start') return handleRegStart(req,res);
    if (path === 'auth/reg-finish') return handleRegFinish(req,res);
    if (path === 'auth/login-start') return handleLoginStart(req,res);
    if (path === 'auth/login-finish') return handleLoginFinish(req,res);

    // me
    if (path === 'me' && req.method==='GET') return handleMe(req,res);
    if (path === 'me/upsert-zone') return handleUpsertZone(req,res);

    // inbox & chat
    if (path === 'inbox/list' && req.method==='GET') return handleInboxList(req,res);
    if (path === 'chat/fetch' && req.method==='GET') return handleChatFetch(req,res);
    if (path === 'chat/post') return handleChatPost(req,res);

    // annotations
    if (path === 'ann/create') return handleAnnCreate(req,res);
    if (path === 'ann/vote') return handleAnnVote(req,res);
    if (path === 'ann/list' && req.method==='GET') return handleAnnList(req,res,url);

    // fallback
    return res.status(404).json({ message: 'Not found', path });
  } catch (e) {
    return res.status(500).json({ message: 'Server error', detail: e?.message || String(e) });
  }
}
