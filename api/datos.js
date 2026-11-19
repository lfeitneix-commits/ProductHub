// /api/datos  (protegido por middleware.js)
//   GET   lo guardado desde Gestión: fichas editadas, validaciones y (para editores) las últimas notas.
//   POST  { col: "productos" | "validaciones", id, data }  guarda un documento (solo EDITORES).
//   POST  { accion: "resolverNota", id, resuelta }  marca una nota como resuelta o la reabre (solo EDITORES).
//   POST  { accion: "uso", eventos: { "<producto>": { v, o, e, p } } }  suma el uso del Hub que juntó el navegador (cualquier asesor).
//   GET   ?me=1  quién está usando el Hub: { email, nombre, editor }.
//   GET   ?uso=1  totales de uso por mes (solo EDITORES), para "Uso del Hub" en Gestión.
//   GET   ?me=1  incluye mail: true si el asesor habilitó el envío desde su casilla.
//   POST  { accion: "mail", para: [mails], asunto, texto, archivos: [{ nombre, datos (base64) }] }  envía el mail desde la casilla del asesor
//         (Microsoft Graph, permiso Mail.Send). Sin permiso responde 409 { habilitar: true }.
//   (Van en esta función porque el plan Hobby de Vercel permite hasta 12 funciones, y el middleware cuenta como una.)
// Lo que no está guardado acá sale de los archivos del repo (public/data). Almacenamiento: lib/datos.js.
import { CFG, MAIL, SCOPE_MAIL, leerCookie, cifrar, descifrar, cookie } from "../lib/auth.js";
import { hayBase, hayArchivos, leerTodo, guardarDoc, colValida, quien, idValido, CONFIG_EDITABLE, resolverNota, leerUso, sumarUso } from "../lib/datos.js";

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  const u = await quien(req);
  if (!u) return res.status(401).json({ error: "Iniciá sesión con tu cuenta de Neix" });
  if (req.method === "GET" && req.query && req.query.me) {   // quién está usando el Hub (antes api/me)
    const m = await descifrar(leerCookie(req.headers.cookie, MAIL));
    return res.status(200).json(Object.assign({}, u, { mail: !!(m && m.email === u.email) }));
  }
  if (req.method === "POST" && req.body && (req.body.accion === "mail" || (typeof req.body === "string" && req.body.includes('"accion":"mail"')))) return enviarMail(req, res, u);
  if (!hayBase()) return res.status(200).json({ base: false });
  try {
    if (req.method === "GET" && req.query && req.query.uso) {
      if (!u.editor) return res.status(403).json({ error: "Solo para Gestión" });
      return res.status(200).json({ base: true, uso: hayArchivos() ? await leerUso() : {} });
    }
    if (req.method === "GET") {
      const t = await leerTodo(u.editor);
      return res.status(200).json({ base: true, fichas: t.fichas, validaciones: t.validaciones, config: t.config || {}, notas: u.editor ? t.notas : [], cambios: u.editor ? t.cambios : [], editor: u.editor });
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

/* ── Enviar un mail desde la casilla del asesor (Microsoft Graph) ── */
const MAX_ADJUNTOS = 3.2 * 1024 * 1024;   // bytes reales; en base64 ocupa ~4,3 MB (las funciones aceptan hasta 4,5 MB por pedido)
const esMail = (m) => /^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$/.test(m);
const escHTML = (t) => String(t || "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
async function enviarMail(req, res, u) {
  const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body || {};
  const m = await descifrar(leerCookie(req.headers.cookie, MAIL));
  if (!m || m.email !== u.email || !m.rt) return res.status(409).json({ habilitar: true, error: "Falta habilitar el envío desde tu Outlook" });
  const para = (Array.isArray(body.para) ? body.para : String(body.para || "").split(/[,;\s]+/)).map((x) => String(x).trim()).filter(Boolean);
  if (!para.length || para.length > 10 || !para.every(esMail)) return res.status(400).json({ error: "Revisá los mails de destino" });
  const asunto = String(body.asunto || "").replace(/[\r\n]+/g, " ").slice(0, 200), texto = String(body.texto || "").slice(0, 10000);
  const archivos = (Array.isArray(body.archivos) ? body.archivos : []).slice(0, 3).map((a) => ({ nombre: String(a.nombre || "archivo.pdf").replace(/[\\/:*?"<>|]+/g, " ").slice(0, 120), datos: String(a.datos || "") }));
  const peso = archivos.reduce((n, a) => n + Math.floor(a.datos.length * 3 / 4), 0);
  if (peso > MAX_ADJUNTOS) return res.status(413).json({ error: "Los adjuntos pesan más de 3 MB" });
  if (archivos.some((a) => !/^[A-Za-z0-9+/=]+$/.test(a.datos))) return res.status(400).json({ error: "Adjunto inválido" });

  // 1) Renovar el acceso con el token guardado (Microsoft devuelve uno nuevo: se actualiza la cookie)
  const r = await fetch(`https://login.microsoftonline.com/${CFG.tenantId}/oauth2/v2.0/token`, {
    method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: CFG.clientId, client_secret: CFG.clientSecret, grant_type: "refresh_token", refresh_token: m.rt, scope: SCOPE_MAIL }),
  });
  const tok = await r.json().catch(() => ({}));
  if (!r.ok || !tok.access_token) {
    console.error("mail token", r.status, tok.error, tok.error_description);
    res.setHeader("Set-Cookie", cookie(MAIL, "", 0));
    return res.status(409).json({ habilitar: true, error: "Hay que volver a habilitar el envío desde tu Outlook" });
  }
  if (tok.refresh_token) res.setHeader("Set-Cookie", cookie(MAIL, await cifrar({ rt: tok.refresh_token, email: u.email }), 90 * 86400));

  // 2) Armar el mail: el texto y la firma de Neix (datos del asesor + logo como imagen incrustada)
  const f = body.firma && typeof body.firma === "object" ? body.firma : {};
  const nombre = String(f.nombre || u.nombre || "").slice(0, 80), cargo = String(f.cargo || "").slice(0, 80), cel = String(f.cel || "").slice(0, 30);
  const d = cel.replace(/\D/g, "").replace(/^0/, ""), wa = d ? (d.length === 10 ? "549" + d : d.length === 11 && d[0] === "9" ? "54" + d : d) : "";
  const logo = /^data:image\/png;base64,[A-Za-z0-9+/=]{100,60000}$/.test(String(body.logo || "")) ? String(body.logo).split(",")[1] : "";
  const a = 'style="color:#3D3D3D;text-decoration:none"';
  // Firma oficial de Neix: nombre, cargo en bordó, teléfono, dirección y el bloque con barra bordó, logo y leyenda.
  const html = `<div style="font-family:Calibri,Arial,sans-serif;font-size:11pt;line-height:1.5;color:#222">${escHTML(texto).replace(/\r?\n/g, "<br>")}</div>
<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin-top:20px;font-family:Calibri,Arial,sans-serif;font-size:11pt;line-height:1.35;color:#3D3D3D"><tr><td>
${nombre ? `<div style="font-weight:bold;color:#3D3D3D">${escHTML(nombre)}</div>` : ""}
${cargo ? `<div style="font-weight:bold;color:#AB1930">${escHTML(cargo)}</div>` : ""}
<div>Tel. <a href="tel:+541148591552" ${a}>4859-1552</a></div>
${cel ? `<div>Cel. ${wa ? `<a href="https://wa.me/${wa}" ${a}>${escHTML(cel)}</a>` : escHTML(cel)}</div>` : ""}
<div>P8 Buenavista - Don Francisco 3345, Piso 5, San Fernando</div>
<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin-top:10px"><tr><td style="border-left:3px solid #AB1930;padding:6px 0 4px 16px">
<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
${logo ? `<td style="vertical-align:middle"><img src="cid:logo-neix" alt="NEIX" width="150" style="display:block;width:150px;height:auto;border:0"></td>` : `<td style="vertical-align:middle;font-size:24pt;font-weight:bold;letter-spacing:6px;color:#3D3D3D">NEIX</td>`}
<td style="vertical-align:middle;padding-left:10px;font-family:Georgia,'Times New Roman',serif;font-size:9pt;line-height:1.15;color:#6B6B6B">Inteligencia<br>&nbsp;&nbsp;&nbsp;&nbsp;Financiera</td></tr></table>
<div style="font-size:7pt;font-style:italic;line-height:1.4;color:#444;margin-top:10px;max-width:340px">NEIX S.A. Agente de Liquidación y Compensación y Agente de Negociación Propio, Registrado bajo el N° 145 de la CNV y Agente de Colocación y Distribución Integral de Fondos Comunes de Inversión Registrado bajo el N° 14 de la CNV.</div>
</td></tr></table>
</td></tr></table>`;
  const g = await fetch("https://graph.microsoft.com/v1.0/me/sendMail", {
    method: "POST", headers: { Authorization: "Bearer " + tok.access_token, "Content-Type": "application/json" },
    body: JSON.stringify({ saveToSentItems: true, message: {
      subject: asunto, body: { contentType: "HTML", content: html },
      toRecipients: para.map((address) => ({ emailAddress: { address } })),
      attachments: archivos.map((x) => ({ "@odata.type": "#microsoft.graph.fileAttachment", name: x.nombre, contentType: "application/pdf", contentBytes: x.datos }))
        .concat(logo ? [{ "@odata.type": "#microsoft.graph.fileAttachment", name: "neix.png", contentType: "image/png", contentBytes: logo, isInline: true, contentId: "logo-neix" }] : []),
    } }),
  });
  if (g.status !== 202) {
    const e = await g.json().catch(() => ({}));
    console.error("sendMail", g.status, e && e.error && e.error.code, e && e.error && e.error.message);
    if (g.status === 401 || g.status === 403) return res.status(409).json({ habilitar: true, error: "Microsoft no dejó enviar desde tu casilla. Volvé a habilitar el envío." });
    return res.status(502).json({ error: "Microsoft no pudo enviar el mail. Probá de nuevo." });
  }
  return res.status(200).json({ ok: true, para });
}
