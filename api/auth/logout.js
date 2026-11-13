// GET /api/auth/logout  ->  cierra solo la sesión del Hub (no la de Microsoft: Outlook y Teams siguen abiertos)
import { SESION, cookie } from "../../lib/auth.js";

export default function handler(req, res) {
  res.setHeader("Set-Cookie", cookie(SESION, "", 0));
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.end(`<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Hub de Productos Neix</title>
<style>body{margin:0;font-family:Arial,sans-serif;background:#F7F5F3;color:#3D3D3D;display:grid;place-items:center;min-height:100vh;padding:16px}div{max-width:440px;background:#fff;border:1px solid #E4E4E4;border-radius:14px;padding:28px}h1{font-size:20px;font-weight:500;margin:0 0 8px}p{line-height:1.5;margin:0 0 12px}a{color:#476785}</style></head>
<body><div><h1>Cerraste sesión en el Hub</h1><p><a href="/">Volver a entrar</a></p><p><a href="/api/auth/login?cuenta=1">Entrar con otra cuenta</a></p></div></body></html>`);
}
