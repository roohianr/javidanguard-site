// Minimal anonymous submission with 30-day cooldown per device+cell
import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ message: 'Method not allowed' });

  try {
    const { h3, bucket, hashedDevice } = req.body || {};
    if (!h3 || typeof bucket !== 'number' || bucket < 0 || bucket > 4 || !hashedDevice)
      return res.status(400).json({ message: 'Bad request' });

    const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

    // cooldown: one submission per device per cell per 30 days
    const since = new Date(Date.now() - 30*24*3600*1000).toISOString();
    const { data: recent, error: qErr } = await supabase
      .from('submissions')
      .select('id').eq('h3', h3).eq('hashed_device', hashedDevice)
      .gte('created_at', since).limit(1).maybeSingle();

    if (qErr) throw qErr;
    if (recent) return res.status(429).json({ message: 'Already submitted for this area recently.' });

    const { error: insErr } = await supabase.from('submissions').insert({ h3, bucket, hashed_device: hashedDevice });
    if (insErr) throw insErr;

    return res.status(200).json({ ok: true });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ message: 'Server error' });
  }
}
