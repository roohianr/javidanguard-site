import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY // server key
);

export default async function handler(req, res) {
  try {
    const { data, error } = await supabase.from('points').select('id').limit(1);
    if (error) return res.status(500).json({ ok:false, where:'supabase', message:error.message, details:error });
    // Optional write test:
    // const { error: insertErr } = await supabase.from('points').insert({ h3:'test', value:0 });
    // if (insertErr) return res.status(500).json({ ok:false, where:'supabase-insert', message:insertErr.message, details:insertErr });

    return res.status(200).json({ ok:true, db:'ok' });
  } catch (e) {
    return res.status(500).json({ ok:false, where:'api', message:e.message });
  }
}
