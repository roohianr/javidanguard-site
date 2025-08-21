// api/points-list.js
import { createClient } from '@supabase/supabase-js';
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

export default async function handler(_req, res) {
  try {
    const { data, error } = await supabase
      .from('points')
      .select('h3, value')
      .limit(5000);
    if (error) return res.status(500).json({ ok:false, message:error.message });
    res.status(200).json({ ok:true, items: data || [] });
  } catch (e) {
    res.status(500).json({ ok:false, message:e.message });
  }
}
