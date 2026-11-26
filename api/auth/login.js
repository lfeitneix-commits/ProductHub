// GET /api/auth/login?next=/ruta  ->  ventana de inicio de sesión de Microsoft (cuenta de Neix)
// GET /api/auth/login?mail=1      ->  lo mismo, pidiendo además permiso para enviar mails desde la casilla del asesor
// GET /api/auth/login?prov=google ->  ventana de Google (FAs con Gmail o mail de empresa en Google)
import { CFG, GOOGLE, hayGoogle, ESTADO, SCOPE_MAIL, firmar, azar, cookie, origen } from "../../lib/auth.js";

export default async function handler(req, res) {
  if (!CFG.clientSecret || !CFG.sessionSecret) { res.statusCode = 503; res.setHeader("Content-Type", "text/plain; charset=utf-8"); return res.end("Falta configurar el acceso (AZURE_CLIENT_SECRET y SESSION_SECRET en Vercel)."); }
  const url = new URL(req.url, "https://x");
  let destino = url.searchParams.get("next") || "/";
  if (!destino.startsWith("/") || destino.startsWith("//")) destino = "/"; // solo rutas del propio Hub
  const state = azar(), nonce = azar(), mail = !!url.searchParams.get("mail");   // mail=1: además, permiso para enviar mails desde Outlook
  if (url.searchParams.get("prov") === "google") {
    if (!hayGoogle()) { res.writeHead(302, { Location: "/api/auth/ingresar" }); return res.end(); }
    const g = new URLSearchParams({ client_id: GOOGLE.id, response_type: "code", redirect_uri: origen(req) + "/api/auth/callback", scope: "openid email profile", state, nonce, prompt: "select_account" });
    res.setHeader("Set-Cookie", cookie(ESTADO, await firmar({ state, nonce, destino, prov: "google", exp: Date.now() / 1000 + 600 }), 600));
    res.setHeader("Cache-Control", "no-store");
    res.writeHead(302, { Location: `https://accounts.google.com/o/oauth2/v2/auth?${g}` });
    return res.end();
  }
  const params = new URLSearchParams({
    client_id: CFG.clientId, response_type: "code", response_mode: "query",
    redirect_uri: origen(req) + "/api/auth/callback", scope: mail ? SCOPE_MAIL : "openid profile email",
    state, nonce,
  });
  if (!url.searchParams.get("fa") && CFG.loginTenant === CFG.tenantId) params.set("domain_hint", CFG.dominio);   // con FAs habilitados por Microsoft, sin atajo a Neix
  if (url.searchParams.get("cuenta")) params.set("prompt", "select_account"); // elegir otra cuenta
  res.setHeader("Set-Cookie", cookie(ESTADO, await firmar({ state, nonce, destino, mail, exp: Date.now() / 1000 + 600 }), 600));
  res.setHeader("Cache-Control", "no-store");
  res.writeHead(302, { Location: `https://login.microsoftonline.com/${CFG.loginTenant}/oauth2/v2.0/authorize?${params}` });
  res.end();
}
