// POST /api/subir  (solo EDITORES)  cuerpo: el PDF (application/octet-stream), encabezado x-producto: id
// Guarda el one pager en Vercel Blob como archivo PRIVADO y devuelve la ruta para verlo desde el Hub (/api/archivo).
import { put } from "@vercel/blob";
import { hayArchivos, quien, idValido } from "../lib/datos.js";

const MAX = 4 * 1024 * 1024; // las funciones de Vercel aceptan hasta 4,5 MB por pedido

async function leerCuerpo(req) {
  if (Buffer.isBuffer(req.body)) return req.body;
  const partes = []; let total = 0;
  for await (const c of req) { total += c.length; if (total > MAX) throw Object.assign(new Error("grande"), { code: 413 }); partes.push(c); }
  return Buffer.concat(partes);
}

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST") { res.setHeader("Allow", "POST"); return res.status(405).json({ error: "Usá POST" }); }
  const u = await quien(req);
  if (!u) return res.status(401).json({ error: "Iniciá sesión con tu cuenta de Neix" });
  if (!u.editor) return res.status(403).json({ error: "Solo los editores pueden subir archivos" });
  if (!hayArchivos()) return res.status(503).json({ error: "Falta conectar Vercel Blob" });
  const id = String(req.headers["x-producto"] || "");
  if (!idValido(id)) return res.status(400).json({ error: "Producto inválido" });
  try {
    const buf = await leerCuerpo(req);
    if (buf.length > MAX) return res.status(413).json({ error: "El PDF supera los 4 MB" });
    if (buf.subarray(0, 5).toString("latin1") !== "%PDF-") return res.status(400).json({ error: "Tiene que ser un PDF" });
    const b = await put(`onepagers/${id}.pdf`, buf, { access: "private", contentType: "application/pdf", addRandomSuffix: true });
    return res.status(200).json({ id: "api/archivo?p=" + encodeURIComponent(b.pathname) });
  } catch (e) {
    if (e.code === 413) return res.status(413).json({ error: "El PDF supera los 4 MB" });
    console.error(e);
    return res.status(502).json({ error: "No pudimos guardar el archivo" });
  }
}
