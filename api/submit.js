import { createClient } from '@supabase/supabase-js';
import * as h3 from 'h3-js';

export default async function handler(req, res) {
  // …env + body checks…
  const cell = req.body.h3;
  const h3r7 = h3.cellToParent(cell, 7);
  const h3r6 = h3.cellToParent(cell, 6);
  const h3r5 = h3.cellToParent(cell, 5);

  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
  const since30d = new Date(Date.now() - 30*24*3600*1000).toISOString();
  const since24h = new Date(Date.now() - 24*3600*1000).toISOString();

  // per-res7 cooldown (30d)
  const { data: existCluster, error: q1 } = await supabase
    .from('submissions').select('id').eq('hashed_device', req.body.hashedDevice)
    .eq('h3r7', h3r7).gte('created_at', since30d).limit(1);
  if (q1) return res.status(500).json({ message:'DB query error', detail:q1.message });
  if ((existCluster?.length||0) > 0) return res.status(429).json({ message:'You already submitted for this area recently.' });

  // max 1/day anywhere (use data length, not header count)
  const { data: lastDay, error: q2 } = await supabase
    .from('submissions').select('id').eq('hashed_device', req.body.hashedDevice)
    .gte('created_at', since24h).limit(1);
  if (q2) return res.status(500).json({ message:'DB count error', detail:q2.message });
  if ((lastDay?.length||0) >= 1) return res.status(429).json({ message:'Daily limit reached. Try again tomorrow.' });

  const { error: ins } = await supabase
    .from('submissions')
    .insert({ h3: cell, h3r7, h3r6, h3r5, bucket: req.body.bucket, hashed_device: req.body.hashedDevice });
  if (ins) return res.status(500).json({ message:'Insert failed', detail:ins.message });

  return res.status(200).json({ ok:true });
}
