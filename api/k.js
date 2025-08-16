export default function handler(req, res) {
  const DEFAULT_K = 20;
  const K = Math.max(1, Number(process.env.K_THRESHOLD || DEFAULT_K));
  res.status(200).json({ K });
}
