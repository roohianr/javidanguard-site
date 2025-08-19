import { createClient } from '@supabase/supabase-js';
import * as h3 from 'h3-js';

export default async function handler(req, res) {
  try {
    if (req.method !== 'POST') {
      res.setHeader('Allow', 'POST');
      return res.status(405).json({ message: 'Method not allowed' });
    }

    const { SUPABASE_URL, SUPABASE_SERVICE_KEY } = process.env;
    if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
      return res.status(500).json({ message: 'Missing SUPABASE_URL or SUPABASE_SERVICE_KEY' });
    }

    const { h3: cell, bucket, hashedDevice } = req.body || {};
    if (!cell || typeof bucket !== 'number' || bucket < 0 || bucket > 4 || !hashedDevice) {
      return res.status(400).json({ message: 'Bad request: missing h3/bucket/hashedDevice' });
    }

    // Parents for anti-spam
    const h3r7 = h3.cellToParent(cell, 7); // neighborhood cluster
    const h3r6 = h3.cellToParent(cell, 6); // city-ish

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

    const since30d = new Date(Date.now() - 30*24*3600*1000).toISOString();
    const since24h = new Date(Date.now() - 24*3600*1000).toISOString();

    // Block repeat in same r7 area for 30 days
    {
      const { data, error } = await supabase
        .from('submissions')
        .select('id')
        .eq('hashed_device', hashedDevice)
        .eq('h3r7', h3r7)
        .gte('created_at', since30d)
        .limit(1)
        .maybeSingle();
      if (error) return res.status(500).json({ message: 'DB query error', detail: error.message || error });
      if (data) return res.status(429).json({ message: 'You already submitted for this area recently.' });
    }

    // Global: max 1 submission per device per 24h
    {
      const resp = await supabase
        .from('submissions')
        .select('id', { head: true, count: 'exact' })
        .eq('hashed_device', hashedDevice)
        .gte('created_at', since24h);
      if (resp.error) return res.status(500).json({ message: 'DB count error', detail: resp.error.message || resp.error });
      if ((resp.count || 0) >= 1) return res.status(429).json({ message: 'Daily limit reached. Try again tomorrow.' });
    }

    // Insert
    const { error: insErr } = await supabase
      .from('submissions')
      .insert({ h3: cell, h3r7, h3r6, bucket, hashed_device: hashedDevice });
    if (insErr) return res.status(500).json({ message: 'Insert failed', detail: insErr.message || insErr });

    return res.status(200).json({ ok: true });
  } catch (e) {
    return res.status(500).json({ message: 'Server error', detail: e?.message || String(e) });
  }
}
