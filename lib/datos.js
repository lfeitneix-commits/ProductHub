// Base de datos de Gestión. Dos opciones, según lo que esté conectado en Vercel:
//   - Vercel Blob (plan gratis): archivos privados datos/estado.json (fichas, validaciones, registro de cambios) y datos/notas.json.
//     Variables: BLOB_STORE_ID (sistema nuevo de Vercel) o BLOB_READ_WRITE_TOKEN.
//   - Upstash Redis (opcional): KV_REST_API_URL + KV_REST_API_TOKEN (o UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN).
import { put, get, BlobPreconditionFailedError } from "@vercel/blob";
import { SESION, verificar, leerCookie, esEditor } from "./auth.js";

/* ── Quién llama ── */
export async function quien(req) {
  const s = await verificar(leerCookie(req.headers.cookie, SESION));
  return s ? { email: s.email, nombre: s.nombre || "", editor: esEditor(s.email) } : null;
}
export const idValido = (id) => /^[a-z0-9][a-z0-9-]{0,79}$/.test(String(id || ""));
export const hayArchivos = () => !!(process.env.BLOB_READ_WRITE_TOKEN || process.env.BLOB_STORE_ID);

/* ── Redis (si está conectado) ── */
const RURL = () => process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL || "";
const RTOK = () => process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN || "";
const hayRedis = () => !!(RURL() && RTOK());
async function rLlamar(ruta, cuerpo) {
  const r = await fetch(RURL() + ruta, { method: "POST", headers: { Authorization: "Bearer " + RTOK(), "Content-Type": "application/json" }, body: JSON.stringify(cuerpo) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || j.error) throw new Error("Redis: " + (j.error || r.status));
  return j;
}
const rPipe = async (cmds) => (await rLlamar("/pipeline", cmds)).map((x) => { if (x.error) throw new Error("Redis: " + x.error); return x.result; });
const deHash = (arr) => { const o = {}; for (let i = 0; i + 1 < (arr || []).length; i += 2) { try { o[arr[i]] = JSON.parse(arr[i + 1]); } catch {} } return o; };
const RK = { fichas: "hub:fichas", validaciones: "hub:validaciones", config: "hub:config", notas: "hub:notas", cambios: "hub:cambios" };

/* ── Blob: JSON privados con escritura condicional (si otro editor guardó en el medio, se reintenta) ── */
const ESTADO = "datos/estado.json", NOTAS = "datos/notas.json";
async function leerJSON(ruta, vacio) {
  const r = await get(ruta, { access: "private", useCache: false }).catch((e) => { if (e && e.name === "BlobNotFoundError") return null; throw e; });
  if (!r || r.statusCode !== 200) return { data: vacio, etag: null };
  return { data: JSON.parse(await new Response(r.stream).text() || "null") || vacio, etag: r.blob.etag || null };
}
async function modificarJSON(ruta, vacio, cambiar) {
  // 1) Escritura condicional: si otro editor guardó en el medio, se vuelve a leer y se aplica el cambio sobre lo nuevo.
  // 2) Si la condición falla dos veces seguidas (Vercel puede informar la huella del archivo en otro formato),
  //    se guarda igual sobre la versión recién leída, que viene sin caché.
  for (let intento = 0; intento < 3; intento++) {
    const { data, etag } = await leerJSON(ruta, vacio);
    const nuevo = cambiar(data);
    const condicional = etag && intento < 2;
    try {
      await put(ruta, JSON.stringify(nuevo), { access: "private", contentType: "application/json", addRandomSuffix: false, allowOverwrite: true, ...(condicional ? { ifMatch: etag } : {}) });
      return;
    } catch (e) {
      if (!(e instanceof BlobPreconditionFailedError) || !condicional) throw e;
      console.warn("modificarJSON: la huella no coincidió, reintento", ruta, intento + 1);
    }
  }
}

/* ── Interfaz única para las funciones del Hub ── */
export const hayBase = () => hayRedis() || hayArchivos();
const COLS = { productos: "fichas", validaciones: "validaciones", config: "config" };
export const colValida = (c) => !!COLS[c];
export const CONFIG_EDITABLE = ["instructivos"]; // configuración general que se edita desde Gestión

export async function leerTodo(conNotas) {
  if (hayRedis()) {
    const cmds = [["HGETALL", RK.fichas], ["HGETALL", RK.validaciones], ["HGETALL", RK.config]];
    if (conNotas) cmds.push(["LRANGE", RK.notas, "0", "99"]);
    const [f, v, g, n] = await rPipe(cmds);
    const json = (arr) => (arr || []).map((x) => { try { return JSON.parse(x); } catch { return null; } }).filter(Boolean);
    const c = conNotas ? (await rPipe([["LRANGE", RK.cambios, "0", "299"]]))[0] : [];
    return { fichas: deHash(f), validaciones: deHash(v), config: deHash(g), notas: json(n), cambios: json(c) };
  }
  const [e, n] = await Promise.all([leerJSON(ESTADO, {}), conNotas ? leerJSON(NOTAS, []) : Promise.resolve({ data: [] })]);
  return { fichas: e.data.fichas || {}, validaciones: e.data.validaciones || {}, config: e.data.config || {}, notas: (n.data || []).slice(0, 100), cambios: conNotas ? (e.data.cambios || []) : [] };
}
export async function guardarDoc(col, id, data, email, nombre, que) {
  const cambio = { fecha: new Date().toISOString(), quien: email, nombre: nombre || "", col, id, que: que || "" };
  if (hayRedis()) {
    await rPipe([["HSET", RK[COLS[col]], id, JSON.stringify(data)], ["LPUSH", RK.cambios, JSON.stringify(cambio)], ["LTRIM", RK.cambios, "0", "499"]]);
    return;
  }
  await modificarJSON(ESTADO, {}, (e) => {
    e.fichas = e.fichas || {}; e.validaciones = e.validaciones || {}; e.config = e.config || {};
    e[COLS[col]][id] = data;
    e.cambios = [cambio].concat(e.cambios || []).slice(0, 300);
    return e;
  });
}
export async function agregarNota(nota) {
  if (hayRedis()) { await rPipe([["LPUSH", RK.notas, JSON.stringify(nota)], ["LTRIM", RK.notas, "0", "299"]]); return; }
  await modificarJSON(NOTAS, [], (lista) => [nota].concat(Array.isArray(lista) ? lista : []).slice(0, 300));
}
/* Marca una nota como resuelta (o la reabre). Queda quién la resolvió y cuándo. */
export async function resolverNota(id, resuelta, email, nombre) {
  const marca = resuelta ? { fecha: new Date().toISOString(), quien: email, nombre: nombre || "" } : null;
  const aplicar = (n) => { if (!n || n.id !== id) return n; const c = Object.assign({}, n); if (marca) c.resuelta = marca; else delete c.resuelta; return c; };
  if (hayRedis()) {
    const [lista] = await rPipe([["LRANGE", RK.notas, "0", "299"]]);
    const nuevas = (lista || []).map((x) => { try { return JSON.stringify(aplicar(JSON.parse(x))); } catch { return x; } });
    await rPipe([["DEL", RK.notas]].concat(nuevas.length ? [["RPUSH", RK.notas, ...nuevas]] : []));
    return;
  }
  await modificarJSON(NOTAS, [], (lista) => (Array.isArray(lista) ? lista : []).map(aplicar));
}
