// Acceso al Hub con la cuenta de Microsoft de Neix (Microsoft Entra ID).
// Lo usan middleware.js (controla cada pedido) y api/auth/* (inicio y cierre de sesión).
//
// Variables de entorno en Vercel (Settings › Environment Variables):
//   AZURE_CLIENT_SECRET  secreto de la aplicación "Hub de Productos Neix" (obligatorio)
//   SESSION_SECRET       texto largo al azar para firmar la sesión (obligatorio)
//   HABILITADOS          mails que pueden entrar, separados por coma (opcional; vacío = toda cuenta @neix.com.ar)
//   EDITORES             mails que ven Gestión y editan, separados por coma
//   AZURE_CLIENT_ID / AZURE_TENANT_ID  (opcionales: por defecto, los de la aplicación ya registrada)

export const CFG = {
  clientId: process.env.AZURE_CLIENT_ID || "f937d6ea-cd12-4888-9eda-ef8d945f7599",
  tenantId: process.env.AZURE_TENANT_ID || "a719c112-0ddd-4fd9-9dc4-a92568a689c5",
  clientSecret: process.env.AZURE_CLIENT_SECRET || "",
  sessionSecret: process.env.SESSION_SECRET || "",
  dominio: (process.env.DOMINIO || "neix.com.ar").toLowerCase(),
};
export const SESION = "neix_sesion";
export const ESTADO = "neix_login";
export const DIAS_SESION = 90;

const lista = (v) => String(v || "").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
export const habilitado = (mail) => {
  mail = String(mail || "").toLowerCase();
  if (!mail.endsWith("@" + CFG.dominio)) return false;
  const h = lista(process.env.HABILITADOS);
  return !h.length || h.includes(mail);
};
export const esEditor = (mail) => lista(process.env.EDITORES).includes(String(mail || "").toLowerCase());

/* ── Firma HMAC-SHA256 (Web Crypto: funciona en el middleware y en las funciones) ── */
const enc = new TextEncoder();
const b64url = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const desdeB64url = (s) => Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4)), (c) => c.charCodeAt(0));
let claveCache = null;
const clave = () => claveCache || (claveCache = crypto.subtle.importKey("raw", enc.encode(CFG.sessionSecret), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]));

export async function firmar(datos) {
  const cuerpo = b64url(enc.encode(JSON.stringify(datos)));
  const firma = b64url(await crypto.subtle.sign("HMAC", await clave(), enc.encode(cuerpo)));
  return cuerpo + "." + firma;
}
export async function verificar(token) {
  if (!token || !CFG.sessionSecret) return null;
  const [cuerpo, firma] = String(token).split(".");
  if (!cuerpo || !firma) return null;
  try {
    const ok = await crypto.subtle.verify("HMAC", await clave(), desdeB64url(firma), enc.encode(cuerpo));
    if (!ok) return null;
    const datos = JSON.parse(new TextDecoder().decode(desdeB64url(cuerpo)));
    return datos.exp && datos.exp > Date.now() / 1000 ? datos : null;
  } catch { return null; }
}
export const decodificarJWT = (jwt) => JSON.parse(new TextDecoder().decode(desdeB64url(String(jwt).split(".")[1] || "")));
export const azar = () => b64url(crypto.getRandomValues(new Uint8Array(24)));

/* ── Cookies ── */
export function leerCookie(header, nombre) {
  const m = String(header || "").split(/;\s*/).find((c) => c.startsWith(nombre + "="));
  return m ? decodeURIComponent(m.slice(nombre.length + 1)) : "";
}
export const cookie = (nombre, valor, segundos) =>
  `${nombre}=${encodeURIComponent(valor)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${segundos}`;

/* ── Dirección pública del Hub (detrás del proxy de Vercel) ── */
export const origen = (req) => `https://${req.headers["x-forwarded-host"] || req.headers.host}`;
