// GET /api/auth/ingresar?next=/ruta  ->  pantalla de entrada del Hub (botón "Entrar con Microsoft")
import { enviarPagina } from "../../lib/pagina.js";

export default function handler(req, res) {
  const url = new URL(req.url, "https://x");
  let destino = url.searchParams.get("next") || "/";
  if (!destino.startsWith("/") || destino.startsWith("//")) destino = "/";
  enviarPagina(res, 200, {
    eyebrow: "Bancas · FAs · Mesa",
    titulo: "Productos, clientes y propuestas en un solo lugar",
    texto: "Entrá con tu cuenta de Neix para consultar las fichas, analizar carteras y armar propuestas.",
    boton: { href: "/api/auth/login?next=" + encodeURIComponent(destino), texto: "Entrar con Microsoft", microsoft: true },
    nota: "Usá tu cuenta @neix.com.ar. La sesión queda abierta en este navegador.",
  });
}
