// GET /api/auth/callback  <-  vuelta de Microsoft o de Google: valida la cuenta y deja la sesión abierta hasta las 4 de la mañana.
// Entran las cuentas de Neix habilitadas y los FAs de la lista de Gestión (con su Gmail, Hotmail o mail de empresa).
import { enviarPagina } from "../../lib/pagina.js";
import { buscarFA } from "../../lib/datos.js";
import { CFG, GOOGLE, SESION, ESTADO, MAIL, SCOPE_MAIL, DIAS_SESION, segundosHastaFinDelDia, azar, firmar, verificar, leerCookie, decodificarJWT, cookie, origen, habilitado, cifrar } from "../../lib/auth.js";

const pagina = (res, status, titulo, texto) => enviarPagina(res, status, {
  eyebrow: "Acceso", titulo, texto,
  boton: { href: "/api/auth/ingresar", texto: "Volver a intentar" },
  links: [{ href: "/api/auth/login?cuenta=1", texto: "Entrar con otra cuenta" }],
});

export default async function handler(req, res) {
  if (!CFG.clientSecret || !CFG.sessionSecret) { res.statusCode = 503; res.setHeader("Content-Type", "text/plain; charset=utf-8"); return res.end("Falta configurar el acceso (AZURE_CLIENT_SECRET y SESSION_SECRET en Vercel)."); }
  const url = new URL(req.url, "https://x");
  const estado = await verificar(leerCookie(req.headers.cookie, ESTADO));
  if (url.searchParams.get("error")) {
    if (estado && estado.mail) return pagina(res, 400, "No se habilitó el envío por mail", "Microsoft no dio el permiso para enviar mails desde tu casilla (puede que lo tenga que aprobar Sistemas). El Hub sigue funcionando y el mail se manda como antes, desde Outlook.");
    return pagina(res, 400, "No pudimos iniciar sesión", "Microsoft no confirmó el ingreso. Probá de nuevo.");
  }
  if (!estado || estado.state !== url.searchParams.get("state")) return pagina(res, 400, "El ingreso venció", "Pasó demasiado tiempo desde que empezaste. Volvé a entrar.");

  const ahora = Date.now() / 1000, code = url.searchParams.get("code") || "", redirect_uri = origen(req) + "/api/auth/callback";
  let email = "", nombre = "", deNeix = false, tok = {};
  if (estado.prov === "google") {
    // Google: cambiar el código por el token de identidad (pedido directo a Google, con el secreto de la credencial)
    const r = await fetch("https://oauth2.googleapis.com/token", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ client_id: GOOGLE.id, client_secret: GOOGLE.secret, grant_type: "authorization_code", code, redirect_uri }) });
    tok = await r.json().catch(() => ({}));
    if (!r.ok || !tok.id_token) { console.error("google token", r.status, tok.error, tok.error_description); return pagina(res, 502, "No pudimos iniciar sesión", "Google rechazó el ingreso. Probá de nuevo."); }
    const id = decodificarJWT(tok.id_token);
    if (id.aud !== GOOGLE.id || !["accounts.google.com", "https://accounts.google.com"].includes(id.iss) || id.nonce !== estado.nonce || !(id.exp > ahora) || id.email_verified === false) return pagina(res, 400, "No pudimos validar el ingreso", "Probá de nuevo.");
    email = String(id.email || "").toLowerCase(); nombre = id.name || "";
  } else {
    // Microsoft: cambiar el código por el token de identidad (pedido directo a Microsoft, con el secreto de la aplicación)
    const r = await fetch(`https://login.microsoftonline.com/${CFG.loginTenant}/oauth2/v2.0/token`, {
      method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ client_id: CFG.clientId, client_secret: CFG.clientSecret, grant_type: "authorization_code", code, redirect_uri, scope: estado.mail ? SCOPE_MAIL : "openid profile email" }),
    });
    tok = await r.json().catch(() => ({}));
    if (!r.ok || !tok.id_token) { console.error("token", r.status, tok.error, tok.error_description); return pagina(res, 502, "No pudimos iniciar sesión", "Microsoft rechazó el ingreso. Si sigue pasando, avisale a Sistemas."); }
    const id = decodificarJWT(tok.id_token);
    if (id.aud !== CFG.clientId || id.nonce !== estado.nonce || !(id.exp > ahora)) return pagina(res, 400, "No pudimos validar el ingreso", "Probá de nuevo.");
    email = String(id.preferred_username || id.email || id.upn || "").toLowerCase(); nombre = id.name || "";
    deNeix = id.tid === CFG.tenantId;   // cuenta del directorio de Neix
  }
  let rol = "";
  if (deNeix && habilitado(email)) rol = "neix";
  else { const fa = await buscarFA(email).catch((e) => { console.error("buscarFA", e); return null; }); if (fa) { rol = "fa"; nombre = fa.nombre || nombre; } }
  if (!rol) return pagina(res, 403, "Tu cuenta no tiene acceso", `Ingresaste como ${(email || "una cuenta sin mail").replace(/[<>&"]/g, "")}. Si sos FA de Neix, pedile a tu contacto en Neix que te sume con este mail. Si sos de Neix, entrá con tu cuenta @neix.com.ar.`);

  const dura = segundosHastaFinDelDia();
  const sesion = await firmar({ email, nombre, rol, sid: azar().slice(0, 12), exp: Math.floor(ahora + dura) });   // sid: cada ingreso es una sesión nueva (el navegador borra los borradores de la anterior)
  const cookies = [cookie(SESION, sesion, dura), cookie(ESTADO, "", 0)];
  if (rol === "neix" && estado.mail && tok.refresh_token) cookies.push(cookie(MAIL, await cifrar({ rt: tok.refresh_token, email }), DIAS_SESION * 86400));   // para enviar mails desde su casilla
  res.setHeader("Set-Cookie", cookies);
  res.writeHead(302, { Location: estado.destino || "/" });
  res.end();
}
