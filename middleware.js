// Controla cada pedido al Hub (páginas, fichas, PDF y /api) en Vercel.
// Sin sesión válida: las páginas van a la pantalla de entrada (api/auth/ingresar) y los datos responden 401.
// /api/auth/* queda afuera para poder iniciar y cerrar sesión.
// En local (npm run dev) no corre: el Hub queda abierto para probar.
import { next } from "@vercel/functions";
import { CFG, SESION, verificar, leerCookie, habilitado } from "./lib/auth.js";

export default async function middleware(request) {
  const url = new URL(request.url);
  if (!CFG.clientSecret || !CFG.sessionSecret) {
    return new Response("Falta configurar el acceso (AZURE_CLIENT_SECRET y SESSION_SECRET en Vercel).", { status: 503, headers: { "content-type": "text/plain; charset=utf-8" } });
  }
  const sesion = await verificar(leerCookie(request.headers.get("cookie"), SESION));
  if (sesion && habilitado(sesion.email)) return next();

  const pideHTML = (request.headers.get("accept") || "").includes("text/html");
  if (request.method === "GET" && pideHTML) {
    const destino = url.pathname + url.search;
    return Response.redirect(new URL("/api/auth/ingresar?next=" + encodeURIComponent(destino), url), 302);
  }
  return new Response(JSON.stringify({ error: "Iniciá sesión con tu cuenta de Neix" }), { status: 401, headers: { "content-type": "application/json" } });
}

export const config = { matcher: ["/((?!api/auth/).*)"] };
