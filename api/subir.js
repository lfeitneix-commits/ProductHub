// POST /api/subir  (solo EDITORES)  cuerpo: el archivo (application/octet-stream)
//   encabezados: x-producto: id (o "instructivo"), x-tipo: "video" para los videos de los instructivos (si no, PDF).
// Guarda en Vercel Blob como archivo PRIVADO y devuelve la ruta para verlo desde el Hub (/api/archivo).
// Hasta 4 MB: es lo que aceptan las funciones de Vercel por pedido (los videos cortos de tutorial pesan 3 a 4 MB).
import { put } from "@vercel/blob";
import { hayArchivos, quien, idValido } from "../lib/datos.js";

const MAX = 4 * 1024 * 1024; // las funciones de Vercel aceptan hasta 4,5 MB por pedido

async function leerCuerpo(req) {
  if (Buffer.isBuffer(req.body)) return req.body;
  const partes = []; let total = 0;
  for await (const c of req) { total += c.length; if (total > MAX) throw Object.assign(new Error("grande"), { code: 413 }); partes.push(c); }
  return Buffer.concat(partes);
}
// Tipo de video por su contenido (no por el nombre): MP4 y MOV tienen "ftyp" en los bytes 4 a 8; WebM empieza con 1A 45 DF A3.
function tipoVideo(buf) {
  if (buf.subarray(4, 8).toString("latin1") === "ftyp") return buf.subarray(8, 10).toString("latin1") === "qt" ? ["mov", "video/quicktime"] : ["mp4", "video/mp4"];
  if (buf.subarray(0, 4).equals(Buffer.from([0x1a, 0x45, 0xdf, 0xa3]))) return ["webm", "video/webm"];
  return null;
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
  const video = req.headers["x-tipo"] === "video", que = video ? "El video" : "El PDF";
  try {
    const buf = await leerCuerpo(req);
    if (buf.length > MAX) return res.status(413).json({ error: `${que} supera los 4 MB` });
    let ruta, tipo;
    if (video) {
      const t = tipoVideo(buf);
      if (!t) return res.status(400).json({ error: "Tiene que ser un video MP4, MOV o WebM" });
      ruta = `instructivos/${id}.${t[0]}`; tipo = t[1];
    } else {
      if (buf.subarray(0, 5).toString("latin1") !== "%PDF-") return res.status(400).json({ error: "Tiene que ser un PDF" });
      ruta = `onepagers/${id}.pdf`; tipo = "application/pdf";
    }
    const b = await put(ruta, buf, { access: "private", contentType: tipo, addRandomSuffix: true });
    return res.status(200).json({ id: "api/archivo?p=" + encodeURIComponent(b.pathname) });
  } catch (e) {
    if (e.code === 413) return res.status(413).json({ error: `${que} supera los 4 MB` });
    console.error(e);
    return res.status(502).json({ error: "No pudimos guardar el archivo" });
  }
}
