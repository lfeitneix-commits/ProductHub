// /api/datos  (protegido por middleware.js)
//   GET   lo guardado desde Gestión: fichas editadas, validaciones y (para editores) las últimas notas.
//   POST  { col: "productos" | "validaciones", id, data }  guarda un documento (solo EDITORES).
//   POST  { accion: "resolverNota", id, resuelta }  marca una nota como resuelta o la reabre (solo EDITORES).
//   POST  { accion: "uso", eventos: { "<producto>": { v, o, e, p } } }  suma el uso del Hub que juntó el navegador (cualquier asesor).
//   GET   ?me=1  quién está usando el Hub: { email, nombre, editor }.
//   GET   ?uso=1  totales de uso por mes (solo EDITORES), para "Uso del Hub" en Gestión.
//   (Van en esta función porque el plan Hobby de Vercel permite hasta 12 funciones, y el middleware cuenta como una.)
// Lo que no está guardado acá sale de los archivos del repo (public/data). Almacenamiento: lib/datos.js.
import { hayBase, hayArchivos, leerTodo, guardarDoc, colValida, quien, idValido, CONFIG_EDITABLE, resolverNota, leerUso, sumarUso } from "../lib/datos.js";

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  const u = await quien(req);
  if (!u) return res.status(401).json({ error: "Iniciá sesión con tu cuenta de Neix" });
  if (req.method === "GET" && req.query && req.query.me) return res.status(200).json(u); // quién está usando el Hub (antes api/me)
  if (!hayBase()) return res.status(200).json({ base: false });
  try {
    if (req.method === "GET" && req.query && req.query.uso) {
      if (!u.editor) return res.status(403).json({ error: "Solo para Gestión" });
      return res.status(200).json({ base: true, uso: hayArchivos() ? await leerUso() : {} });
    }
    if (req.method === "GET") {
      const t = await leerTodo(u.editor);
      return res.status(200).json({ base: true, fichas: t.fichas, validaciones: t.validaciones, config: t.config || {}, notas: u.editor ? t.notas : [], cambios: u.editor ? t.cambios : [], actualizadas: t.actualizadas || {}, editor: u.editor });
    }
    if (req.method === "POST") {
      const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body || {};
      if (body.accion === "uso") {   // v = vistas, o = one pager visto o descargado, e = enviado, p = sumado a propuesta o presentación
        const ev = body.eventos && typeof body.eventos === "object" ? body.eventos : {};
        const limpio = Object.fromEntries(Object.entries(ev).filter(([id, c]) => idValido(id) && c && typeof c === "object").slice(0, 200));
        if (Object.keys(limpio).length && hayArchivos()) await sumarUso(limpio);
        return res.status(200).json({ ok: true });
      }
      if (!u.editor) return res.status(403).json({ error: "Solo los editores pueden guardar cambios" });
      if (body.accion === "resolverNota") {   // Pendientes de Gestión: marcar una nota como resuelta o reabrirla
        if (!/^[a-z0-9]{4,24}$/.test(String(body.id || ""))) return res.status(400).json({ error: "Nota inválida" });
        await resolverNota(body.id, !!body.resuelta, u.email, u.nombre);
        return res.status(200).json({ ok: true });
      }
      if (!colValida(body.col) || !idValido(body.id) || !body.data || typeof body.data !== "object") return res.status(400).json({ error: "Datos inválidos" });
      if (body.col === "config" && !CONFIG_EDITABLE.includes(body.id)) return res.status(400).json({ error: "Esa configuración no se edita desde Gestión" });
      if (JSON.stringify(body.data).length > 200000) return res.status(413).json({ error: "La ficha es demasiado grande" });
      const que = String(body.que || "").slice(0, 60);
      await guardarDoc(body.col, body.id, body.data, u.email, u.nombre, que);
      return res.status(200).json({ ok: true, cambio: { fecha: new Date().toISOString(), quien: u.email, nombre: u.nombre, col: body.col, id: body.id, que } });
    }
    res.setHeader("Allow", "GET, POST");
    return res.status(405).json({ error: "Método no permitido" });
  } catch (e) {
    console.error(e);
    return res.status(502).json({ error: "No pudimos guardar en la base de datos", detalle: u.editor ? String((e && (e.name + ": " + e.message)) || e).slice(0, 300) : undefined });
  }
}
