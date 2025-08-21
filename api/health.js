import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

export default async function handler(req, res) {
  try {
    const { data, error } = await supabase.from('points').select('id').limit(1);
    if (error) {
      console.error('[SUPABASE]', error);
      return res.status(500).json({
        ok: false,
        where: 'supabase',
        message: error.message,
        details: error
      });
    }
    return res.status(200).json({ ok: true, data });
  } catch (err) {
    console.error('[API]', err);
    return res.status(500).json({
      ok: false,
      where: 'api',
      message: err?.message || 'unknown',
      stack: process.env.NODE_ENV === 'development' ? err?.stack : undefined
    });
  }
}
