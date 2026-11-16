// /api/datos  (protegido por middleware.js)
//   GET   lo guardado desde Gestión: fichas editadas, validaciones y (para editores) las últimas notas.
//   POST  { col: "productos" | "validaciones", id, data }  guarda un documento (solo EDITORES).
// Lo que no está guardado acá sale de los archivos del repo (public/data). Almacenamiento: lib/datos.js.
import { hayBase, leerTodo, guardarDoc, colValida, quien, idValido } from "../lib/datos.js";

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  const u = await quien(req);
  if (!u) return res.status(401).json({ error: "Iniciá sesión con tu cuenta de Neix" });
  if (!hayBase()) return res.status(200).json({ base: false });
  try {
    if (req.method === "GET") {
      const t = await leerTodo(u.editor);
      return res.status(200).json({ base: true, fichas: t.fichas, validaciones: t.validaciones, notas: u.editor ? t.notas : [], editor: u.editor });
    }
    if (req.method === "POST") {
      if (!u.editor) return res.status(403).json({ error: "Solo los editores pueden guardar cambios" });
      const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body || {};
      if (!colValida(body.col) || !idValido(body.id) || !body.data || typeof body.data !== "object") return res.status(400).json({ error: "Datos inválidos" });
      if (JSON.stringify(body.data).length > 200000) return res.status(413).json({ error: "La ficha es demasiado grande" });
      await guardarDoc(body.col, body.id, body.data, u.email);
      return res.status(200).json({ ok: true });
    }
    res.setHeader("Allow", "GET, POST");
    return res.status(405).json({ error: "Método no permitido" });
  } catch (e) {
    console.error(e);
    return res.status(502).json({ error: "No pudimos guardar en la base de datos", detalle: u.editor ? String((e && (e.name + ": " + e.message)) || e).slice(0, 300) : undefined });
  }
}
