// GET /api/archivo?p=onepagers/...pdf | instructivos/...mp4  (protegido por middleware.js)
// Entrega un archivo guardado en Vercel Blob (privado): solo lo ven quienes iniciaron sesión en el Hub.
// Los videos se entregan también por partes (Range), porque Safari en el iPhone no los reproduce de otra forma.
import { get } from "@vercel/blob";
import { hayArchivos } from "../lib/datos.js";

const TIPOS = { pdf: "application/pdf", mp4: "video/mp4", mov: "video/quicktime", webm: "video/webm" };

export default async function handler(req, res) {
  const p = new URL(req.url, "https://x").searchParams.get("p") || "";
  const m = /^(?:onepagers\/[A-Za-z0-9._-]+\.(pdf)|instructivos\/[A-Za-z0-9._-]+\.(mp4|mov|webm))$/.exec(p);
  if (!m) return res.status(400).json({ error: "Archivo inválido" });
  if (!hayArchivos()) return res.status(503).json({ error: "Falta conectar Vercel Blob" });
  try {
    const r = await get(p, { access: "private" });
    if (!r || r.statusCode !== 200) return res.status(404).json({ error: "No encontramos el archivo" });
    const buf = Buffer.from(await new Response(r.stream).arrayBuffer());
    res.setHeader("Content-Type", TIPOS[m[1] || m[2]]);
    res.setHeader("Content-Disposition", "inline");
    res.setHeader("Cache-Control", "private, max-age=3600");
    res.setHeader("Accept-Ranges", "bytes");
    const rango = /^bytes=(\d*)-(\d*)$/.exec(String(req.headers.range || ""));
    if (rango && (rango[1] || rango[2])) {
      let ini = rango[1] ? +rango[1] : buf.length - +rango[2], fin = rango[1] && rango[2] ? +rango[2] : buf.length - 1;
      ini = Math.max(0, ini); fin = Math.min(fin, buf.length - 1);
      if (ini > fin) { res.setHeader("Content-Range", `bytes */${buf.length}`); return res.status(416).end(); }
      res.setHeader("Content-Range", `bytes ${ini}-${fin}/${buf.length}`);
      res.setHeader("Content-Length", fin - ini + 1);
      return res.status(206).end(buf.subarray(ini, fin + 1));
    }
    res.setHeader("Content-Length", buf.length);
    return res.status(200).end(buf);
  } catch (e) {
    console.error(e);
    return res.status(502).json({ error: "No pudimos leer el archivo" });
  }
}
