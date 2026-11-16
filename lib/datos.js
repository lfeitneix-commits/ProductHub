// Base de datos de Gestión (Upstash Redis por su API REST) y sesión de quien llama.
// Variables (las carga Vercel al conectar Upstash): KV_REST_API_URL + KV_REST_API_TOKEN
// (o UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN). Archivos: BLOB_READ_WRITE_TOKEN o BLOB_STORE_ID (Vercel Blob).
import { SESION, verificar, leerCookie, esEditor } from "./auth.js";

const URL_ = () => process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL || "";
const TOKEN = () => process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN || "";
export const hayBase = () => !!(URL_() && TOKEN());
// Blob: clave de lectura/escritura, o el sistema nuevo de Vercel (BLOB_STORE_ID + credencial automática del proyecto)
export const hayArchivos = () => !!(process.env.BLOB_READ_WRITE_TOKEN || process.env.BLOB_STORE_ID);

// Claves: fichas editadas y validaciones (hash id -> JSON), notas y registro de cambios (listas).
export const K = { fichas: "hub:fichas", validaciones: "hub:validaciones", notas: "hub:notas", cambios: "hub:cambios" };

async function llamar(ruta, cuerpo) {
  const r = await fetch(URL_() + ruta, { method: "POST", headers: { Authorization: "Bearer " + TOKEN(), "Content-Type": "application/json" }, body: JSON.stringify(cuerpo) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || j.error) throw new Error("Redis: " + (j.error || r.status));
  return j;
}
export const redis = async (...cmd) => (await llamar("", cmd)).result;
export const pipeline = async (cmds) => (await llamar("/pipeline", cmds)).map((x) => { if (x.error) throw new Error("Redis: " + x.error); return x.result; });
// HGETALL devuelve [campo, valor, campo, valor...]
export const deHash = (arr) => { const o = {}; for (let i = 0; i + 1 < (arr || []).length; i += 2) { try { o[arr[i]] = JSON.parse(arr[i + 1]); } catch {} } return o; };

export async function quien(req) {
  const s = await verificar(leerCookie(req.headers.cookie, SESION));
  return s ? { email: s.email, nombre: s.nombre || "", editor: esEditor(s.email) } : null;
}
export const idValido = (id) => /^[a-z0-9][a-z0-9-]{0,79}$/.test(String(id || ""));
