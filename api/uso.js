// /api/uso  (protegido por middleware.js)
//   POST { eventos: { "<producto>": { v, o, e, p } } }  suma lo que juntó el navegador (cualquier asesor con sesión).
//   GET  los totales por mes (solo EDITORES), para "Uso del Hub" en Gestión.
// v = vistas de la ficha, o = one pager visto o descargado, e = enviado (WhatsApp o mail), p = sumado a una propuesta o presentación.
import { hayArchivos, quien, idValido, leerUso, sumarUso } from "../lib/datos.js";

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  const u = await quien(req);
  if (!u) return res.status(401).json({ error: "Iniciá sesión con tu cuenta de Neix" });
  if (!hayArchivos()) return res.status(200).json({ base: false, uso: {} });
  try {
    if (req.method === "GET") {
      if (!u.editor) return res.status(403).json({ error: "Solo para Gestión" });
      return res.status(200).json({ base: true, uso: await leerUso() });
    }
    if (req.method === "POST") {
      const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body || {};
      const ev = body.eventos && typeof body.eventos === "object" ? body.eventos : {};
      const limpio = Object.fromEntries(Object.entries(ev).filter(([id, c]) => idValido(id) && c && typeof c === "object").slice(0, 200));
      if (Object.keys(limpio).length) await sumarUso(limpio);
      return res.status(200).json({ ok: true });
    }
    res.setHeader("Allow", "GET, POST");
    return res.status(405).json({ error: "Método no permitido" });
  } catch (e) {
    console.error(e);
    return res.status(502).json({ error: "No pudimos registrar el uso" });
  }
}
