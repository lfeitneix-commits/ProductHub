// POST /api/nota  { producto, productoNombre, texto }
// Publica la nota de una ficha en el canal de Teams de Marketing (flujo "Post to a channel when a webhook request is received").
// Quién la escribe sale de la sesión de Microsoft (no lo manda el navegador). Requiere TEAMS_WEBHOOK_URL en Vercel.
import { SESION, verificar, leerCookie, origen } from "../lib/auth.js";

const limpio = (t, max) => String(t || "").replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, max);

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST") { res.setHeader("Allow", "POST"); return res.status(405).json({ error: "Usá POST" }); }
  const s = await verificar(leerCookie(req.headers.cookie, SESION));
  if (!s) return res.status(401).json({ error: "Iniciá sesión con tu cuenta de Neix" });
  const url = process.env.TEAMS_WEBHOOK_URL;
  if (!url) return res.status(503).json({ error: "Falta TEAMS_WEBHOOK_URL en Vercel" });

  const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body || {};
  const texto = String(body.texto || "").trim().slice(0, 2000);
  const id = limpio(body.producto, 80).replace(/[^a-z0-9-]/gi, "");
  const nombre = limpio(body.productoNombre, 120) || id;
  if (!texto || !id) return res.status(400).json({ error: "Falta la nota o el producto" });

  const quien = s.nombre ? `${s.nombre} (${s.email})` : s.email;
  const ficha = `${origen(req)}/#p-${id}`;
  const card = {
    type: "AdaptiveCard", $schema: "http://adaptivecards.io/schemas/adaptive-card.json", version: "1.4",
    body: [
      { type: "TextBlock", text: `Nota sobre ${nombre}`, weight: "Bolder", size: "Medium", wrap: true },
      { type: "TextBlock", text: `${quien} dejó esta nota en el Hub de Productos:`, isSubtle: true, spacing: "None", wrap: true },
      { type: "TextBlock", text: texto, wrap: true, spacing: "Medium" },
      { type: "FactSet", facts: [{ title: "Producto", value: nombre }, { title: "Quién", value: quien }, { title: "Fecha", value: new Date().toLocaleString("es-AR", { timeZone: "America/Argentina/Buenos_Aires" }) }] },
    ],
    actions: [{ type: "Action.OpenUrl", title: "Abrir la ficha", url: ficha }],
  };
  try {
    const r = await fetch(url, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "message", attachments: [{ contentType: "application/vnd.microsoft.card.adaptive", content: card }] }),
    });
    if (!r.ok) { console.error("teams", r.status, await r.text().catch(() => "")); return res.status(502).json({ error: "Teams no aceptó la nota" }); }
    return res.status(200).json({ ok: true });
  } catch (e) {
    console.error(e); return res.status(502).json({ error: "No pudimos conectar con Teams" });
  }
}
