import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

export default async function handler(_req, res) {
  try {
    const { error } = await supabase.from('points').select('id').limit(1);
    if (error) {
      return res.status(500).json({ ok:false, where:'supabase-select', message:error.message, details:error });
    }
    return res.status(200).json({ ok:true, db:'ok' });
  } catch (e) {
    return res.status(500).json({ ok:false, where:'api', message:e.message });
  }
}
