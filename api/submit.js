import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
  try {
    if (req.method !== 'POST') {
      res.setHeader('Allow', 'POST');
      return res.status(405).json({ message: 'Method not allowed' });
    }

    // ENV check
    const { SUPABASE_URL, SUPABASE_SERVICE_KEY } = process.env;
    if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
      return res.status(500).json({ message: 'Missing SUPABASE_URL or SUPABASE_SERVICE_KEY' });
    }

    // Parse body safely
    const body = req.body && typeof req.body === 'object' ? req.body : {};
    const { h3, bucket, hashedDevice } = body;
    if (!h3 || typeof bucket !== 'number' || bucket < 0 || bucket > 4 || !hashedDevice) {
      return res.status(400).json({ message: 'Bad request: missing h3/bucket/hashedDevice' });
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

    // 30-day cooldown
    const since = new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString();
    const { data: recent, error: qErr } = await supabase
      .from('submissions')
      .select('id')
      .eq('h3', h3)
      .eq('hashed_device', hashedDevice)
      .gte('created_at', since)
      .limit(1)
      .maybeSingle();

    if (qErr) {
      return res.status(500).json({ message: 'DB query error', detail: qErr.message || qErr });
    }
    if (recent) {
      return res.status(429).json({ message: 'شما برای این محدوده اخیراً ثبت کرده‌اید.' });
    }

    const { error: insErr } = await supabase
      .from('submissions')
      .insert({ h3, bucket, hashed_device: hashedDevice });

    if (insErr) {
      // رایج‌ترین: جدول وجود ندارد یا RLS
      return res.status(500).json({ message: 'Insert failed', detail: insErr.message || insErr });
    }

    return res.status(200).json({ ok: true });
  } catch (e) {
    return res.status(500).json({ message: 'Server error', detail: e?.message || String(e) });
  }
}
