/*
 * Borradores en Outlook (Microsoft 365) con Microsoft Graph.
 *
 * window.neixM365.configurado        true si m365-config.js tiene clientId y tenantId
 * window.neixM365.crearBorrador(...)  crea un borrador en la carpeta Borradores del asesor:
 *     { asunto, html | cuerpo(mail), archivo: File }  ->  { webLink, cuenta }
 *   La primera vez se abre la ventana de inicio de sesión de Microsoft con la cuenta de Neix.
 *   Permisos: User.Read y Mail.ReadWrite (delegados: el Hub solo actúa sobre el buzón de quien inició sesión).
 */
(function () {
  "use strict";
  const CFG = window.NEIX_M365 || {};
  const configurado = !!(CFG.clientId && CFG.tenantId);
  const MSAL_URL = "https://cdn.jsdelivr.net/npm/@azure/msal-browser@3.27.0/lib/msal-browser.min.js";
  const SCOPES = ["User.Read", "Mail.ReadWrite"];
  const GRAPH = "https://graph.microsoft.com/v1.0";

  const cargar = (src) => new Promise((ok, ko) => {
    if (window.msal) return ok();
    const s = document.createElement("script"); s.src = src; s.onload = ok; s.onerror = () => ko(new Error("No se pudo cargar MSAL")); document.head.appendChild(s);
  });

  // Se prepara al abrir la página, así el clic en Enviar abre la ventana de Microsoft sin que el navegador la bloquee.
  let app = null;
  const listo = configurado ? cargar(MSAL_URL).then(async () => {
    app = new window.msal.PublicClientApplication({
      auth: { clientId: CFG.clientId, authority: "https://login.microsoftonline.com/" + CFG.tenantId, redirectUri: location.origin + location.pathname },
      cache: { cacheLocation: "localStorage" },
    });
    await app.initialize();
    await app.handleRedirectPromise().catch(() => null);
    return app;
  }).catch((e) => { console.error("neixM365", e); return null; }) : Promise.resolve(null);

  async function token() {
    const a = app || (await listo);
    if (!a) throw Object.assign(new Error("Outlook no disponible"), { code: "no_m365" });
    let cuenta = a.getActiveAccount() || a.getAllAccounts()[0];
    if (!cuenta) { const r = await a.loginPopup({ scopes: SCOPES, prompt: "select_account" }); cuenta = r.account; }
    a.setActiveAccount(cuenta);
    try { return { t: (await a.acquireTokenSilent({ scopes: SCOPES, account: cuenta })).accessToken, cuenta }; }
    catch (_) { const r = await a.acquireTokenPopup({ scopes: SCOPES, account: cuenta }); return { t: r.accessToken, cuenta: r.account }; }
  }

  const b64 = async (file) => {
    const u8 = new Uint8Array(await file.arrayBuffer()); let s = "";
    for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000));
    return btoa(s);
  };

  async function crearBorrador({ asunto, html, archivo, cuerpo }) {
    const { t, cuenta } = await token();
    if (typeof cuerpo === "function") html = cuerpo((cuenta && cuenta.username) || ""); // la firma usa la cuenta que inició sesión
    const msg = { subject: asunto, body: { contentType: "HTML", content: html } };
    // Graph acepta adjuntos de hasta 3 MB dentro del mismo pedido (los one pagers y las propuestas pesan menos).
    if (archivo) msg.attachments = [{ "@odata.type": "#microsoft.graph.fileAttachment", name: archivo.name, contentType: archivo.type || "application/pdf", contentBytes: await b64(archivo) }];
    const r = await fetch(GRAPH + "/me/messages", { method: "POST", headers: { Authorization: "Bearer " + t, "Content-Type": "application/json" }, body: JSON.stringify(msg) });
    if (!r.ok) throw Object.assign(new Error("Graph " + r.status), { code: "graph_" + r.status, detalle: await r.text().catch(() => "") });
    const d = await r.json();
    return { webLink: d.webLink, cuenta: (cuenta && cuenta.username) || "" };
  }

  async function salir() { const a = app || (await listo); if (a) { const c = a.getActiveAccount(); if (c) await a.logoutPopup({ account: c }).catch(() => {}); } }

  window.neixM365 = { configurado, crearBorrador, salir, cuenta: () => { const a = app; const c = a && (a.getActiveAccount() || a.getAllAccounts()[0]); return c ? c.username : ""; } };
})();
