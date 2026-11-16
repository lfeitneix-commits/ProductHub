// /api/datos  (protegido por middleware.js)
//   GET   lo guardado desde Gestión: fichas editadas, validaciones y (para editores) las últimas notas.
//   POST  { col: "productos" | "validaciones", id, data }  guarda un documento (solo EDITORES).
// Lo que no está guardado acá sale de los archivos del repo (public/data).
import { hayBase, redis, pipeline, deHash, K, quien, idValido } from "../lib/datos.js";

const COLS = { productos: K.fichas, validaciones: K.validaciones };

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  const u = await quien(req);
  if (!u) return res.status(401).json({ error: "Iniciá sesión con tu cuenta de Neix" });
  if (!hayBase()) return res.status(200).json({ base: false });

  try {
    if (req.method === "GET") {
      const cmds = [["HGETALL", K.fichas], ["HGETALL", K.validaciones]];
      if (u.editor) cmds.push(["LRANGE", K.notas, "0", "99"]);
      const [f, v, n] = await pipeline(cmds);
      const notas = (n || []).map((x) => { try { return JSON.parse(x); } catch { return null; } }).filter(Boolean);
      return res.status(200).json({ base: true, fichas: deHash(f), validaciones: deHash(v), notas, editor: u.editor });
    }
    if (req.method === "POST") {
      if (!u.editor) return res.status(403).json({ error: "Solo los editores pueden guardar cambios" });
      const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body || {};
      const clave = COLS[body.col];
      if (!clave || !idValido(body.id) || !body.data || typeof body.data !== "object") return res.status(400).json({ error: "Datos inválidos" });
      const json = JSON.stringify(body.data);
      if (json.length > 200000) return res.status(413).json({ error: "La ficha es demasiado grande" });
      const cambio = JSON.stringify({ fecha: new Date().toISOString(), quien: u.email, col: body.col, id: body.id });
      await pipeline([["HSET", clave, body.id, json], ["LPUSH", K.cambios, cambio], ["LTRIM", K.cambios, "0", "499"]]);
      return res.status(200).json({ ok: true });
    }
    res.setHeader("Allow", "GET, POST");
    return res.status(405).json({ error: "Método no permitido" });
  } catch (e) {
    console.error(e);
    return res.status(502).json({ error: "No pudimos conectar con la base de datos" });
  }
}
