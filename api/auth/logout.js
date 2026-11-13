// GET /api/auth/logout  ->  cierra solo la sesión del Hub (no la de Microsoft: Outlook y Teams siguen abiertos)
import { SESION, cookie } from "../../lib/auth.js";
import { enviarPagina } from "../../lib/pagina.js";

export default function handler(req, res) {
  res.setHeader("Set-Cookie", cookie(SESION, "", 0));
  enviarPagina(res, 200, {
    eyebrow: "Sesión cerrada", titulo: "Hasta la próxima",
    texto: "Cerraste sesión en el Hub. Tu cuenta de Microsoft sigue abierta en Outlook y Teams.",
    boton: { href: "/api/auth/login", texto: "Volver a entrar", microsoft: true },
    links: [{ href: "/api/auth/login?cuenta=1", texto: "Entrar con otra cuenta" }],
  });
}
