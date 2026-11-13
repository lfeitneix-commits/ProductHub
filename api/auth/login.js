// GET /api/auth/login?next=/ruta  ->  ventana de inicio de sesión de Microsoft (cuenta de Neix)
import { CFG, ESTADO, firmar, azar, cookie, origen } from "../../lib/auth.js";

export default async function handler(req, res) {
  if (!CFG.clientSecret || !CFG.sessionSecret) { res.statusCode = 503; res.setHeader("Content-Type", "text/plain; charset=utf-8"); return res.end("Falta configurar el acceso (AZURE_CLIENT_SECRET y SESSION_SECRET en Vercel)."); }
  const url = new URL(req.url, "https://x");
  let destino = url.searchParams.get("next") || "/";
  if (!destino.startsWith("/") || destino.startsWith("//")) destino = "/"; // solo rutas del propio Hub
  const state = azar(), nonce = azar();
  const params = new URLSearchParams({
    client_id: CFG.clientId, response_type: "code", response_mode: "query",
    redirect_uri: origen(req) + "/api/auth/callback", scope: "openid profile email",
    state, nonce, domain_hint: CFG.dominio,
  });
  if (url.searchParams.get("cuenta")) params.set("prompt", "select_account"); // elegir otra cuenta
  res.setHeader("Set-Cookie", cookie(ESTADO, await firmar({ state, nonce, destino, exp: Date.now() / 1000 + 600 }), 600));
  res.setHeader("Cache-Control", "no-store");
  res.writeHead(302, { Location: `https://login.microsoftonline.com/${CFG.tenantId}/oauth2/v2.0/authorize?${params}` });
  res.end();
}
