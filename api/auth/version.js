// GET /api/auth/version  ->  qué versión está publicada y qué servicios ve (solo nombres de variables, nunca valores)
export default function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  const nombres = Object.keys(process.env).filter((k) => /KV|REDIS|UPSTASH|BLOB|STORAGE/i.test(k)).sort();
  res.status(200).json({ commit: (process.env.VERCEL_GIT_COMMIT_SHA || "").slice(0, 7), entorno: process.env.VERCEL_ENV || "", servicios: nombres });
}
