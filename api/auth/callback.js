// GET /api/auth/callback  <-  vuelta de Microsoft: valida la cuenta y deja la sesión abierta por 90 días
import { enviarPagina } from "../../lib/pagina.js";
import { CFG, SESION, ESTADO, DIAS_SESION, firmar, verificar, leerCookie, decodificarJWT, cookie, origen, habilitado } from "../../lib/auth.js";

const pagina = (res, status, titulo, texto) => enviarPagina(res, status, {
  eyebrow: "Acceso", titulo, texto,
  boton: { href: "/api/auth/ingresar", texto: "Volver a intentar" },
  links: [{ href: "/api/auth/login?cuenta=1", texto: "Entrar con otra cuenta" }],
});

export default async function handler(req, res) {
  if (!CFG.clientSecret || !CFG.sessionSecret) { res.statusCode = 503; res.setHeader("Content-Type", "text/plain; charset=utf-8"); return res.end("Falta configurar el acceso (AZURE_CLIENT_SECRET y SESSION_SECRET en Vercel)."); }
  const url = new URL(req.url, "https://x");
  const estado = await verificar(leerCookie(req.headers.cookie, ESTADO));
  if (url.searchParams.get("error")) return pagina(res, 400, "No pudimos iniciar sesión", "Microsoft no confirmó el ingreso. Probá de nuevo.");
  if (!estado || estado.state !== url.searchParams.get("state")) return pagina(res, 400, "El ingreso venció", "Pasó demasiado tiempo desde que empezaste. Volvé a entrar.");

  // Cambiar el código por el token de identidad (pedido directo a Microsoft, con el secreto de la aplicación)
  const r = await fetch(`https://login.microsoftonline.com/${CFG.tenantId}/oauth2/v2.0/token`, {
    method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: CFG.clientId, client_secret: CFG.clientSecret, grant_type: "authorization_code",
      code: url.searchParams.get("code") || "", redirect_uri: origen(req) + "/api/auth/callback", scope: "openid profile email",
    }),
  });
  const tok = await r.json().catch(() => ({}));
  if (!r.ok || !tok.id_token) { console.error("token", r.status, tok.error, tok.error_description); return pagina(res, 502, "No pudimos iniciar sesión", "Microsoft rechazó el ingreso. Si sigue pasando, avisale a Sistemas."); }

  const id = decodificarJWT(tok.id_token);
  const ahora = Date.now() / 1000;
  if (id.aud !== CFG.clientId || id.tid !== CFG.tenantId || id.nonce !== estado.nonce || !(id.exp > ahora)) return pagina(res, 400, "No pudimos validar el ingreso", "Probá de nuevo.");
  const email = String(id.preferred_username || id.email || id.upn || "").toLowerCase();
  if (!habilitado(email)) return pagina(res, 403, "Tu cuenta no tiene acceso", `Ingresaste como ${(email || "una cuenta sin mail").replace(/[<>&"]/g, "")}. Si necesitás usar el Hub, pedile acceso a Marketing.`);

  const sesion = await firmar({ email, nombre: id.name || "", exp: Math.floor(ahora + DIAS_SESION * 86400) });
  res.setHeader("Set-Cookie", [cookie(SESION, sesion, DIAS_SESION * 86400), cookie(ESTADO, "", 0)]);
  res.writeHead(302, { Location: estado.destino || "/" });
  res.end();
}
