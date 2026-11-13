// Pantallas de acceso (entrada, sin acceso, sesión cerrada) con la estética del Hub:
// banda grafito con halo arena, logo NEIX y tipografía Inter.
import { LOGO_BLANCO } from "./logo.js";
import { FAVICON } from "./favicon.js";

const esc = (t) => String(t ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const MS = `<svg width="18" height="18" viewBox="0 0 21 21" aria-hidden="true"><rect x="1" y="1" width="9" height="9" fill="#F25022"/><rect x="11" y="1" width="9" height="9" fill="#7FBA00"/><rect x="1" y="11" width="9" height="9" fill="#00A4EF"/><rect x="11" y="11" width="9" height="9" fill="#FFB900"/></svg>`;

/**
 * @param {{eyebrow?:string, titulo:string, texto?:string, boton?:{href:string, texto:string, microsoft?:boolean}, links?:{href:string, texto:string}[], nota?:string}} o
 */
export function paginaAcceso(o) {
  const boton = o.boton ? `<a class="btn" href="${esc(o.boton.href)}">${o.boton.microsoft ? MS : ""}<span>${esc(o.boton.texto)}</span></a>` : "";
  const links = (o.links || []).map((l) => `<a href="${esc(l.href)}">${esc(l.texto)}</a>`).join("");
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Hub de Productos Neix</title><meta name="robots" content="noindex">${FAVICON}
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600&display=swap" rel="stylesheet">
<style>
:root{--dark:#262523;--ink:#F3F0EB;--ink-2:#A9A196;--arena:#B8AB96;--glow:rgba(196,178,148,.55)}
*{box-sizing:border-box}html,body{height:100%}
body{margin:0;font-family:Inter,Arial,sans-serif;color:var(--ink);background:radial-gradient(80% 70% at 50% 118%,var(--glow),transparent 62%) var(--dark);display:grid;grid-template-rows:auto 1fr auto;min-height:100vh}
header{display:flex;align-items:center;gap:14px;padding:22px 28px;border-bottom:1px solid rgba(255,255,255,.07)}
header img{height:17px;width:auto}header span{color:var(--ink-2);font-size:13.5px;padding-left:14px;border-left:1px solid rgba(255,255,255,.18)}
main{display:grid;place-items:center;padding:40px 16px}
.box{width:min(460px,100%);text-align:center}
.eyebrow{font-size:11px;letter-spacing:.18em;text-transform:uppercase;color:var(--arena);font-weight:600;margin:0 0 18px}
h1{font-weight:300;font-size:clamp(34px,6vw,48px);line-height:1.08;letter-spacing:-.01em;margin:0 0 16px}
p.t{color:var(--ink-2);font-size:15.5px;line-height:1.55;margin:0 auto 30px;max-width:38ch}
.btn{display:inline-flex;align-items:center;justify-content:center;gap:12px;background:#fff;color:#1F1E1C;text-decoration:none;font-weight:500;font-size:15px;padding:14px 26px;border-radius:999px;min-width:270px;transition:transform .15s,box-shadow .15s;box-shadow:0 8px 30px rgba(0,0,0,.25)}
.btn:hover{transform:translateY(-1px);box-shadow:0 12px 36px rgba(0,0,0,.32)}
.nota{font-size:12.5px;color:var(--ink-2);margin:18px 0 0}
.links{display:flex;gap:18px;justify-content:center;flex-wrap:wrap;margin-top:22px}.links a{color:var(--ink);font-size:13.5px;text-underline-offset:3px}
footer{padding:18px 28px 24px;font-size:11px;line-height:1.5;color:rgba(169,161,150,.8);text-align:center}
@media (prefers-reduced-motion:reduce){.btn{transition:none}}
</style></head>
<body><header><img src="${LOGO_BLANCO}" alt="NEIX"><span>Hub de Productos</span></header>
<main><div class="box">${o.eyebrow ? `<p class="eyebrow">${esc(o.eyebrow)}</p>` : ""}<h1>${esc(o.titulo)}</h1>${o.texto ? `<p class="t">${o.texto}</p>` : ""}
${boton}${o.nota ? `<p class="nota">${esc(o.nota)}</p>` : ""}${links ? `<div class="links">${links}</div>` : ""}</div></main>
<footer>NEIX S.A. ALyC Propio registrado bajo el N° 145 de la CNV y Agente de Colocación y Distribución Integral de FCI registrado bajo el N° 14 de la CNV. Uso interno.</footer>
</body></html>`;
}

export function enviarPagina(res, status, o) {
  res.statusCode = status;
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.end(paginaAcceso(o));
}
