/*
 * Runtime del Hub de Productos Neix fuera de claude.ai.
 *
 * Reemplaza a window.claude con la misma forma de uso: window.neixRuntime.use(nombre)
 * devuelve una promesa con el servicio pedido. El código del Hub no cambia según el backend.
 *
 * Dos modos, según public/js/firebase-config.js:
 *   Firebase (hay apiKey): datos en Firestore, lectura abierta; los editores ingresan con un link al mail.
 *   Local (sin apiKey):    JSON de public/data/, sin login (fase 1).
 *   Si Firebase no deja leer (reglas sin publicar, base vacía), el Hub usa staticDb() en solo lectura.
 *                          Con ?editor=1 en la URL se simula un editor para probar Gestión.
 *
 *   db         collection(n)[.orderBy(campo, dir)][.limit(n)].onSnapshot · doc(p).onSnapshot · doc(p).set · doc(p).update
 *   user       canEdit · id · me · search · profiles(ids)
 *   downloads  save({filename, data}) con Blob + <a download>
 *   assets     upload(file) -> {id}: el id es la URL del archivo (Firebase Storage; en local, una URL temporal)
 */
(function () {
  "use strict";

  const FB_VERSION = "10.12.2";
  const CFG = window.NEIX_FIREBASE || {};
  const DOMINIO = (window.NEIX_DOMINIO || "neix.com.ar").toLowerCase();
  const MODE = CFG.apiKey ? "firebase" : "local";
  const clone = (o) => JSON.parse(JSON.stringify(o));

  /* ── Firestore no admite arrays dentro de arrays (beneficios, objeciones, matriz impositiva).
        Se guardan como [{_a:[...]}] y se reconstruyen al leer. Mismo formato que scripts/seed-firestore.mjs. ── */
  const enc = (v) =>
    Array.isArray(v) ? v.map((x) => (Array.isArray(x) ? { _a: enc(x) } : enc(x)))
    : v && typeof v === "object" ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, enc(x)]))
    : v;
  const dec = (v) =>
    Array.isArray(v) ? v.map(dec)
    : v && typeof v === "object" ? (Object.keys(v).length === 1 && Array.isArray(v._a) ? v._a.map(dec) : Object.fromEntries(Object.entries(v).map(([k, x]) => [k, dec(x)])))
    : v;

  /* ── Descargas: Blob + <a download> ── */
  const downloads = {
    async save({ filename, data }) {
      const blob = data instanceof Blob ? data : new Blob([data], { type: "text/html;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      a.rel = "noopener";
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 30000);
    },
  };

  // Nombre visible de cada autor: los ids son mails, se muestra la parte antes de la @.
  const perfiles = (ids) => Object.fromEntries((ids || []).map((id) => [id, { name: String(id).split("@")[0] }]));

  /* ════════ Modo local (fase 1) ════════ */
  const getJSON = async (url) => {
    const r = await fetch(url, { cache: "no-store" });
    if (!r.ok) throw new Error("HTTP " + r.status + " " + url);
    return r.json();
  };
  const CONFIG_FILES = {
    asesores: "data/config/asesores.json",
    exterior: "data/config/exterior.json",
    impuestos: "data/config/impuestos.json",
    onepagers: "data/config/onepagers.local.json",
  };
  function createStaticDb() {
    const store = { productos: null, validaciones: {}, notas: {}, config: {} };
    const listeners = [];
    async function loadCollection(name) {
      if (name === "validaciones") return store.validaciones;
      if (name === "notas") return store.notas;
      if (name !== "productos") return {};
      if (!store.productos) {
        const ids = await getJSON("data/productos/index.json");
        const docs = await Promise.all(ids.map((id) => getJSON("data/productos/" + id + ".json").then((d) => [id, d])));
        store.productos = Object.fromEntries(docs);
      }
      return store.productos;
    }
    async function loadDoc(path) {
      const [col, id] = path.split("/");
      if (col === "config") {
        if (!(id in store.config)) store.config[id] = CONFIG_FILES[id] ? await getJSON(CONFIG_FILES[id]).catch(() => null) : null;
        return store.config[id];
      }
      const all = await loadCollection(col);
      return all[id] == null ? null : all[id];
    }
    const colSnap = (all, q) => {
      let docs = Object.entries(all).map(([id, d]) => ({ id, data: () => clone(d) }));
      if (q && q.orden) {
        const [campo, dir] = q.orden, k = dir === "desc" ? -1 : 1;
        docs.sort((a, b) => { const x = a.data()[campo], y = b.data()[campo]; return x === y ? 0 : x > y ? k : -k; });
      }
      if (q && q.max) docs = docs.slice(0, q.max);
      return { metadata: { fromCache: false }, docs };
    };
    const docSnap = (d) => ({ exists: d != null, data: () => (d == null ? undefined : clone(d)) });
    function notify(path) {
      const col = path.split("/")[0];
      listeners.forEach((l) => {
        if (l.kind === "doc" && l.path === path) loadDoc(path).then((d) => l.cb(docSnap(d)));
        if (l.kind === "col" && l.path === col) loadCollection(col).then((all) => l.cb(colSnap(all, l.q)));
      });
    }
    const listen = (kind, path, load, wrap, q) => (cb, onErr) => {
      const l = { kind, path, cb, q };
      listeners.push(l);
      load(path).then((x) => cb(wrap(x, q)), (e) => onErr && onErr(e));
      return () => listeners.splice(listeners.indexOf(l), 1);
    };
    return {
      collection: (name) => {
        const consulta = (q) => ({
          orderBy: (campo, dir) => consulta(Object.assign({}, q, { orden: [campo, dir || "asc"] })),
          limit: (n) => consulta(Object.assign({}, q, { max: n })),
          onSnapshot: listen("col", name, loadCollection, colSnap, q),
        });
        return consulta({});
      },
      doc: (path) => {
        const guardar = async (data, merge) => { // queda en memoria hasta recargar
          const [col, id] = path.split("/");
          const base = merge ? (await loadDoc(path)) || {} : {};
          const nuevo = Object.assign(clone(base), clone(data));
          if (col === "config") store.config[id] = nuevo;
          else (await loadCollection(col))[id] = nuevo;
          notify(path);
        };
        return {
          onSnapshot: listen("doc", path, loadDoc, docSnap),
          set: (data) => guardar(data, false),
          update: (data) => guardar(data, true),
        };
      },
    };
  }
  const localServices = () => {
    const devUser = /[?&]editor=1\b/.test(location.search)
      ? { canEdit: async () => true, id: async () => "editor-local", me: async () => ({ name: "", email: "" }), search: async () => [], profiles: async (ids) => perfiles(ids) }
      : null;
    // Archivos subidos en local: URL temporal del navegador (se pierde al recargar).
    const assets = { async upload(file) { return { id: URL.createObjectURL(file) }; } };
    return { db: async () => createStaticDb(), user: async () => devUser, assets: async () => assets };
  };

  /* ════════ Modo Firebase ════════
     Lectura abierta: cualquiera con el link ve el Hub (Firestore lo permite en firestore.rules).
     Edición: solo editores. Se identifican con un link que les llega al mail (sin contraseña);
     después Firestore verifica que el mail esté en config/editores. */
  const LINK_KEY = "neix-hub-mail-editor";
  let fbReady = null; // promesa con {auth, fs, user, authSdk, fsSdk, linkPendiente}
  function loadFirebase() {
    if (fbReady) return fbReady;
    const base = "https://www.gstatic.com/firebasejs/" + FB_VERSION + "/";
    fbReady = Promise.all([import(base + "firebase-app.js"), import(base + "firebase-auth.js"), import(base + "firebase-firestore.js"), import(base + "firebase-storage.js")]).then(
      async ([appSdk, authSdk, fsSdk, stSdk]) => {
        const app = appSdk.initializeApp(CFG);
        const auth = authSdk.getAuth(app);
        const fs = fsSdk.getFirestore(app);
        const F = { app, auth, fs, authSdk, fsSdk, stSdk, user: null, linkPendiente: false, linkError: "" };
        // ¿Se abrió el link del mail? Completar el ingreso.
        if (authSdk.isSignInWithEmailLink(auth, location.href)) {
          let mail = "";
          try { mail = localStorage.getItem(LINK_KEY) || ""; } catch (_) {}
          if (mail) {
            try { await authSdk.signInWithEmailLink(auth, mail, location.href); try { localStorage.removeItem(LINK_KEY); } catch (_) {} }
            catch (e) { F.linkError = "El link venció o ya se usó. Pedí uno nuevo."; }
            limpiarURL();
          } else {
            F.linkPendiente = true; // abierto en otro navegador: hay que volver a escribir el mail
          }
        }
        F.user = await new Promise((ok) => { const off = authSdk.onAuthStateChanged(auth, (u) => { off(); ok(u); }); });
        if (F.user && !esNeix(F.user)) { await authSdk.signOut(auth); F.user = null; }
        if (F.user) {
          F.editor = await esEditor(F);
          if (!F.editor) { await authSdk.signOut(auth); F.user = null; F.linkError = "Ese mail no tiene permiso para editar el Hub."; }
        }
        return F;
      }
    );
    return fbReady;
  }
  function limpiarURL() {
    const u = new URL(location.href);
    ["apiKey", "oobCode", "mode", "lang", "continueUrl", "tenantId"].forEach((k) => u.searchParams.delete(k));
    history.replaceState(null, "", u.pathname + (u.search.length > 1 ? u.search : "") + "#inicio");
  }
  const esNeix = (u) => !!(u && u.email && u.emailVerified && u.email.toLowerCase().endsWith("@" + DOMINIO));
  // config/editores solo lo puede leer un editor (ver firestore.rules): si la lectura falla, no es editor.
  async function esEditor(F) {
    try {
      const d = await F.fsSdk.getDoc(F.fsSdk.doc(F.fs, "config", "editores"));
      return d.exists() && (d.data().mails || []).map((m) => String(m).toLowerCase()).includes(F.user.email.toLowerCase());
    } catch (_) { return false; }
  }

  // Los códigos de Firestore vienen con guion ("permission-denied"); el Hub espera guion bajo.
  const fsErr = (e) => { const x = new Error(e && e.message); x.code = String((e && e.code) || "").replace(/-/g, "_"); return x; };

  function createFirestoreDb(F) {
    const { fs, fsSdk: S } = F;
    const ref = (path) => S.doc(fs, ...path.split("/"));
    return {
      collection: (name) => {
        const consulta = (partes) => ({
          orderBy: (campo, dir) => consulta(partes.concat(S.orderBy(campo, dir || "asc"))),
          limit: (n) => consulta(partes.concat(S.limit(n))),
          onSnapshot: (cb, onErr) =>
            S.onSnapshot(S.query(S.collection(fs, name), ...partes), { includeMetadataChanges: true },
              (snap) => cb({ metadata: { fromCache: snap.metadata.fromCache }, docs: snap.docs.map((d) => ({ id: d.id, data: () => dec(d.data()) })) }),
              (e) => onErr && onErr(fsErr(e))),
        });
        return consulta([]);
      },
      doc: (path) => ({
        onSnapshot: (cb, onErr) =>
          S.onSnapshot(ref(path),
            (d) => cb({ exists: d.exists(), data: () => (d.exists() ? dec(d.data()) : undefined) }),
            (e) => onErr && onErr(fsErr(e))),
        set: (data) => S.setDoc(ref(path), enc(clone(data))).catch((e) => { throw fsErr(e); }),
        update: (data) => S.updateDoc(ref(path), enc(clone(data))).catch((e) => { throw fsErr(e); }),
      }),
    };
  }
  function createEditorUser(F) {
    const u = F.user;
    return {
      canEdit: async () => true,
      id: async () => u.email.toLowerCase(),
      me: async () => ({ name: u.displayName || "", email: u.email || "" }),
      search: async () => [], // el Hub ya busca en config/asesores (data/config/asesores.json)
      profiles: async (ids) => perfiles(ids),
    };
  }
  // One pagers e imágenes que suben los editores: Firebase Storage (ver storage.rules).
  function createStorageAssets(F) {
    const { stSdk: St } = F;
    const st = St.getStorage(F.app);
    return {
      async upload(file) {
        const nombre = String(file.name || "archivo").normalize("NFD").replace(/[^\w.-]+/g, "-").toLowerCase();
        const r = St.ref(st, "uploads/" + Date.now().toString(36) + "-" + nombre);
        await St.uploadBytes(r, file, { contentType: file.type || undefined });
        return { id: await St.getDownloadURL(r) };
      },
    };
  }
  const firebaseServices = () => ({
    db: async () => createFirestoreDb(await loadFirebase()),
    user: async () => { const F = await loadFirebase(); return F.user ? createEditorUser(F) : null; },
    assets: async () => { const F = await loadFirebase(); return F.user ? createStorageAssets(F) : null; },
  });

  /* ── Acceso de editores (solo modo Firebase) ── */
  const mailValido = (m) => /^[^\s@]+@[^\s@]+$/.test(m) && m.endsWith("@" + DOMINIO);
  async function enviarLink(mail) {
    mail = String(mail || "").trim().toLowerCase();
    if (!mailValido(mail)) { const e = new Error("dominio"); e.code = "wrong_domain"; throw e; }
    const F = await loadFirebase();
    await F.authSdk.sendSignInLinkToEmail(F.auth, mail, { url: location.origin + location.pathname, handleCodeInApp: true });
    try { localStorage.setItem(LINK_KEY, mail); } catch (_) {}
    return mail;
  }
  // Link abierto en otro navegador: se completa con el mail escrito de nuevo.
  async function completarLink(mail) {
    mail = String(mail || "").trim().toLowerCase();
    const F = await loadFirebase();
    try { await F.authSdk.signInWithEmailLink(F.auth, mail, location.href); }
    catch (e) { const x = new Error("link"); x.code = "bad_link"; throw x; }
    limpiarURL();
    location.reload();
  }
  async function logout() {
    if (MODE !== "firebase") return;
    const F = await loadFirebase();
    await F.authSdk.signOut(F.auth);
    location.reload();
  }
  // Estado para la barra lateral y la pantalla de acceso.
  async function session() {
    if (MODE !== "firebase") return null;
    const F = await loadFirebase();
    return { editor: F.user ? { name: F.user.displayName || "", email: F.user.email || "" } : null, linkPendiente: F.linkPendiente, error: F.linkError };
  }

  const services = Object.assign(
    { downloads: async () => downloads },
    MODE === "firebase" ? firebaseServices() : localServices()
  );

  window.neixRuntime = {
    mode: MODE,
    dominio: DOMINIO,
    use(name) {
      const make = services[name];
      return make ? make().catch((e) => { console.error("neixRuntime." + name, e); return null; }) : Promise.resolve(null);
    },
    staticDb: createStaticDb, // fichas de public/data, en solo lectura si Firebase no responde
    enviarLink,
    completarLink,
    logout,
    session,
  };
})();
