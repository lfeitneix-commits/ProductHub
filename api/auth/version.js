// GET /api/auth/version  ->  qué versión del repo está publicada (para soporte; no expone datos)
export default function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  res.status(200).json({ commit: (process.env.VERCEL_GIT_COMMIT_SHA || "").slice(0, 7), entorno: process.env.VERCEL_ENV || "" });
}
