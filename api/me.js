// GET /api/me  ->  quién está usando el Hub (protegido por middleware.js)
import { SESION, verificar, leerCookie, esEditor } from "../lib/auth.js";

export default async function handler(req, res) {
  const s = await verificar(leerCookie(req.headers.cookie, SESION));
  res.setHeader("Cache-Control", "no-store");
  if (!s) return res.status(401).json({ error: "Sin sesión" });
  return res.status(200).json({ email: s.email, nombre: s.nombre, editor: esEditor(s.email) });
}
