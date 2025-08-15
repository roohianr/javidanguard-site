export default function handler(req, res) {
  res.status(200).json({
    ok: true,
    hasUrl: !!process.env.SUPABASE_URL,
    hasKey: !!process.env.SUPABASE_SERVICE_KEY,
    node: process.version
  });
}
