import { createClient } from '@supabase/supabase-js';
import * as h3 from 'h3-js';
import { randomBytes } from 'crypto';

function randId() { return randomBytes(16).toString('hex'); }

export default async function handler(req, res) {
  try {
    if (req.method !== 'POST') {
      res.setHeader('Allow', 'POST');
      return res.status(405).json({ message: 'Method not allowed' });
    }

    const { SUPABASE_URL, SUPABASE_SERVICE_KEY, ADMIN_KEY } = process.env;
    if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY || !ADMIN_KEY) {
      return res.status(500).json({ message: 'Server not configured' });
    }

    const key = req.headers['x-admin-key'] || req.query.key;
    if (key !== ADMIN_KEY) return res.status(401).json({ message: 'Unauthorized' });

    const { cell, n = 1, bucket = 0 } = req.body || {};
    if (!cell || !h3.isValidCell?.(cell)) return res.status(400).json({ message: 'valid cell required' });

    const N = Math.min(200, Math.max(1, parseInt(n, 10) || 1));
    const b = Math.max(0, Math.min(4, +bucket || 0));

    const h3r7 = h3.cellToParent(cell, 7);
    const h3r6 = h3.cellToParent(cell, 6);
    const h3r5 = h3.cellToParent(cell, 5);

    const rows = Array.from({ length: N }, () => ({
      h3: cell, h3r7, h3r6, h3r5, bucket: b, hashed_device: randId()
    }));

    const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
    const { error } = await sb.from('submissions').insert(rows);
    if (error) return res.status(500).json({ message: 'Insert failed', detail: error.message });

    return res.status(200).json({ ok: true, inserted: N });
  } catch (e) {
    return res.status(500).json({ message: 'Server error', detail: e?.message || String(e) });
  }
}
