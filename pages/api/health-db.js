// pages/api/health-db.js
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  // Use SERVICE key here (server only) to bypass RLS while debugging
  process.env.SUPABASE_SERVICE_KEY
);

export default async function handler(req, res) {
  try {
    // 1) trivial ping
    const ping = await supabase.rpc('pg_sleep', { seconds: 0 }).catch(() => null);

    // 2) does the table exist?
    const { data: tables, error: tablesErr } = await supabase
      .from('points')
      .select('id')
      .limit(1);

    if (tablesErr) {
      return res.status(500).json({
        ok: false,
        where: 'supabase-select',
        message: tablesErr.message,
        details: tablesErr
      });
    }

    // 3) test insert (comment out if you don’t want writes)
    const { error: insertErr } = await supabase.from('points').insert({
      h3: 'test-cell',
      value: 0.0001
    });
    if (insertErr) {
      return res.status(500).json({
        ok: false,
        where: 'supabase-insert',
        message: insertErr.message,
        details: insertErr
      });
    }

    return res.status(200).json({
      ok: true,
      db: 'ok',
      rls: 'bypassed (service key)',
    });
  } catch (err) {
    return res.status(500).json({
      ok: false,
      where: 'api',
      message: err?.message || 'unknown',
      stack: process.env.NODE_ENV === 'development' ? err?.stack : undefined
    });
  }
}
