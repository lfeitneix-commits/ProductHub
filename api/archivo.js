// GET /api/archivo?p=onepagers/...pdf  (protegido por middleware.js)
// Entrega un one pager guardado en Vercel Blob (privado): solo lo ven quienes iniciaron sesión en el Hub.
import { get } from "@vercel/blob";
import { hayArchivos } from "../lib/datos.js";

export default async function handler(req, res) {
  const p = new URL(req.url, "https://x").searchParams.get("p") || "";
  if (!/^onepagers\/[A-Za-z0-9._-]+\.pdf$/.test(p)) return res.status(400).json({ error: "Archivo inválido" });
  if (!hayArchivos()) return res.status(503).json({ error: "Falta conectar Vercel Blob" });
  try {
    const r = await get(p, { access: "private" });
    if (!r || r.statusCode !== 200) return res.status(404).json({ error: "No encontramos el archivo" });
    const buf = Buffer.from(await new Response(r.stream).arrayBuffer());
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", "inline");
    res.setHeader("Cache-Control", "private, max-age=3600");
    return res.status(200).end(buf);
  } catch (e) {
    console.error(e);
    return res.status(502).json({ error: "No pudimos leer el archivo" });
  }
}
