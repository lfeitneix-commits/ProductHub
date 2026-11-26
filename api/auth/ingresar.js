// GET /api/auth/ingresar?next=/ruta  ->  pantalla de entrada del Hub (botón "Entrar con Microsoft")
import { enviarPagina } from "../../lib/pagina.js";
import { hayGoogle } from "../../lib/auth.js";

export default function handler(req, res) {
  const url = new URL(req.url, "https://x");
  let destino = url.searchParams.get("next") || "/";
  if (!destino.startsWith("/") || destino.startsWith("//")) destino = "/";
  enviarPagina(res, 200, {
    eyebrow: "Bancas · FAs · Mesa",
    titulo: "Productos, clientes y propuestas en un solo lugar",
    texto: "Entrá con tu cuenta de Neix para consultar las fichas, analizar carteras y armar propuestas. Si sos FA, entrá con el mail que tenés registrado en Neix.",
    boton: { href: "/api/auth/login?next=" + encodeURIComponent(destino), texto: "Entrar con Microsoft", microsoft: true },
    boton2: hayGoogle() ? { href: "/api/auth/login?prov=google&next=" + encodeURIComponent(destino), texto: "Entrar con Google", google: true } : null,
    nota: hayGoogle() ? "Equipo de Neix: cuenta @neix.com.ar. FAs: Google (Gmail) o Microsoft (Hotmail, Outlook o el mail de tu empresa)." : "Usá tu cuenta @neix.com.ar. La sesión dura hasta el final del día.",
    links: [{ href: "/api/auth/login?cuenta=1&next=" + encodeURIComponent(destino), texto: "Entrar con otra cuenta" }],
  });
}
