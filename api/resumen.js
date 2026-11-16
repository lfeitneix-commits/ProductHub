// GET /api/resumen  — resumen semanal para el canal de Teams (lo dispara Vercel Cron, ver vercel.json: lunes 9 h de Argentina).
// Solo publica si hay algo para informar: notas de los asesores sin resolver, fichas vencidas o que vencen en los próximos 7 días.
// Si no hay nada, no manda ningún mensaje.
// Seguridad: si existe CRON_SECRET en Vercel, exige "Authorization: Bearer <CRON_SECRET>" (Vercel lo manda solo).
// Sin CRON_SECRET, solo acepta el pedido de Vercel Cron, y nunca publica dos veces el mismo día.
// La respuesta no muestra datos: solo si publicó o no.
import { readFile } from "node:fs/promises";
import path from "node:path";
import { hayArchivos, leerParaResumen, marcarResumen } from "../lib/datos.js";
import { origen } from "../lib/auth.js";

const hoyAR = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/Argentina/Buenos_Aires" });
const dias = (iso, hoy) => (iso ? Math.round((Date.parse(iso + "T00:00:00Z") - Date.parse(hoy + "T00:00:00Z")) / 86400000) : null);
const fecha = (iso) => iso.split("-").reverse().join("/");

async function fichasDelRepo() {
  const dir = path.join(process.cwd(), "public", "data", "productos");
  const ids = JSON.parse(await readFile(path.join(dir, "index.json"), "utf8"));
  const out = {};
  await Promise.all(ids.map(async (id) => { try { out[id] = JSON.parse(await readFile(path.join(dir, id + ".json"), "utf8")); } catch {} }));
  return out;
}

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  const secreto = process.env.CRON_SECRET;
  const auth = req.headers.authorization || "";
  if (secreto ? auth !== "Bearer " + secreto : !/vercel-cron/i.test(req.headers["user-agent"] || "")) return res.status(401).json({ error: "No autorizado" });
  const url = process.env.TEAMS_WEBHOOK_URL;
  if (!url || !hayArchivos()) return res.status(200).json({ publicado: false, motivo: "Falta TEAMS_WEBHOOK_URL o la base" });

  try {
    const hoy = hoyAR(), g = await leerParaResumen();
    if (g.ultimoResumen === hoy) return res.status(200).json({ publicado: false, motivo: "Ya se publicó hoy" });

    const fichas = Object.assign(await fichasDelRepo(), g.fichas); // lo editado en Gestión manda
    const porVencer = [];
    for (const [id, p] of Object.entries(fichas)) {
      if (!p || p.oculto) continue;
      const v = g.validaciones[id] || (p.estado === "validado" ? { vence: p.vence } : null);
      const d = dias((v && v.vence) || p.vence, hoy);
      if (d !== null && d <= 7) porVencer.push({ id, nombre: p.nombre || id, d, vence: (v && v.vence) || p.vence });
    }
    porVencer.sort((a, b) => a.d - b.d);
    const notas = g.notas.filter((n) => n && !n.resuelta);
    if (!porVencer.length && !notas.length) return res.status(200).json({ publicado: false, motivo: "Nada para informar" });

    const base = origen(req), linea = (t) => ({ type: "TextBlock", text: t, wrap: true, spacing: "Small" });
    const body = [
      { type: "TextBlock", text: "Pendientes del Hub de Productos", weight: "Bolder", size: "Medium", wrap: true },
      { type: "TextBlock", text: "Resumen semanal para Marketing.", isSubtle: true, spacing: "None", wrap: true },
    ];
    if (notas.length) {
      body.push({ type: "TextBlock", text: `Notas sin resolver (${notas.length})`, weight: "Bolder", spacing: "Medium" });
      notas.slice(0, 8).forEach((n) => body.push(linea(`• **${n.productoNombre || n.producto}**: ${String(n.texto || "").slice(0, 140)}${String(n.texto || "").length > 140 ? "…" : ""}`)));
      if (notas.length > 8) body.push(linea(`y ${notas.length - 8} más.`));
    }
    if (porVencer.length) {
      body.push({ type: "TextBlock", text: `Fichas para renovar (${porVencer.length})`, weight: "Bolder", spacing: "Medium" });
      porVencer.slice(0, 12).forEach((f) => body.push(linea(`• **${f.nombre}**: ${f.d < 0 ? `venció el ${fecha(f.vence)}` : f.d === 0 ? "vence hoy" : `vence el ${fecha(f.vence)}`}`)));
      if (porVencer.length > 12) body.push(linea(`y ${porVencer.length - 12} más.`));
    }
    const card = { type: "AdaptiveCard", $schema: "http://adaptivecards.io/schemas/adaptive-card.json", version: "1.4", body,
      actions: [{ type: "Action.OpenUrl", title: "Abrir Gestión", url: `${base}/#gestion` }] };
    const r = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "message", attachments: [{ contentType: "application/vnd.microsoft.card.adaptive", content: card }] }) });
    if (!r.ok) { console.error("teams", r.status, await r.text().catch(() => "")); return res.status(502).json({ publicado: false, motivo: "Teams no aceptó el mensaje" }); }
    await marcarResumen(hoy);
    return res.status(200).json({ publicado: true, notas: notas.length, fichas: porVencer.length });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ publicado: false, motivo: "Error inesperado" });
  }
}
