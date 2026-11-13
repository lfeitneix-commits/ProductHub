// GET /api/auth/logout  ->  cierra solo la sesión del Hub (no la de Microsoft: Outlook y Teams siguen abiertos)
// y vuelve a la misma pantalla de entrada del Hub.
import { SESION, cookie } from "../../lib/auth.js";

export default function handler(req, res) {
  res.setHeader("Set-Cookie", cookie(SESION, "", 0));
  res.setHeader("Cache-Control", "no-store");
  res.writeHead(302, { Location: "/api/auth/ingresar" });
  res.end();
}
