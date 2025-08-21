// ESM
export default async function handler(_req, res) {
  try {
    const key = process.env.SUPABASE_SERVICE_KEY || '';
    if (!key) return res.status(500).json({ ok:false, message:'SUPABASE_SERVICE_KEY missing' });
    const parts = key.split('.');
    if (parts.length < 2) return res.status(500).json({ ok:false, message:'Key format invalid' });
    const payloadJson = Buffer.from(parts[1].replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8');
    let payload = {};
    try { payload = JSON.parse(payloadJson); } catch {}
    const role = payload?.role || payload?.['https://supabase.io/claims']?.role || null;
    const exp = payload?.exp || null;

    // don't leak full key; just show first/last few chars and length
    const masked = key.length > 16 ? key.slice(0,6) + '…' + key.slice(-6) : 'short';
    return res.status(200).json({
      ok: true,
      keyPreview: masked,
      keyLen: key.length,
      role,
      exp
    });
  } catch (e) {
    return res.status(500).json({ ok:false, message:e.message });
  }
}
