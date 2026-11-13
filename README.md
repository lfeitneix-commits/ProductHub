# Hub de Productos Neix

Herramienta interna para que los comerciales de Neix consulten productos, analicen la cartera de un cliente
y armen propuestas y presentaciones. Es la versión del artifact de claude.ai sin dependencias de Claude:
corre en cualquier hosting estático (Vercel) con Firebase como base de datos.

## Modo actual: prototipo sin base externa
El Hub lee las fichas de `public/data` y los one pagers de `public/onepagers`. No necesita Firebase ni login.
Lo que se edita en Gestión (`?editor=1` en la dirección) o las notas para Marketing quedan solo en esa pestaña hasta recargar.
Para cambiar una ficha de forma permanente, se edita su JSON en `public/data/productos/`.
Firebase (más abajo) es opcional, para cuando haga falta guardar cambios compartidos.

## Estructura
- `public/index.html`: el Hub (HTML, CSS y JS en un archivo).
- `public/js/runtime.js`: reemplazo de `window.claude` (base de datos, archivos, usuario, descargas).
- `public/js/firebase-config.js`: configuración web de Firebase (no es secreta). Si `apiKey` queda vacío, el Hub corre en modo local.
- `public/onepagers/*.pdf`: one pagers originales.
- `public/data/productos/*.json`, `public/data/config/*.json`: fichas y configuración (lo que muestra el Hub y la fuente para cargar Firestore).
- `firestore.rules`, `storage.rules`: quién lee y quién escribe.
- `scripts/dev-server.mjs`: servidor local. `scripts/seed-firestore.mjs`: carga `public/data/` en Firestore.

## Qué reemplaza a claude.ai
| En el Hub | Antes (claude.ai) | Ahora |
| --- | --- | --- |
| Fichas, validaciones, notas, config | base del artifact | Firestore (sin Firebase: JSON de `public/data/`, lo editado queda en memoria) |
| Quién edita | cuenta de la organización | "Acceso editores" al pie de la página: link al mail, el mail tiene que estar en `config/editores` |
| One pagers subidos desde Gestión | assets del artifact | Firebase Storage (carpeta `uploads/`) |
| One pagers originales | `/_blob/...` | `public/onepagers`, según `config/onepagers` |
| Descargas | runtime de Claude | descarga normal del navegador |

La tenencia de comitentes sigue SIMULADA (`API_DEMO`: 10234, 20871, 31555).

## Correr en local
Requiere Node 18 o superior.

```bash
npm run dev
```

Abrir http://localhost:5173. Para probar Gestión y la edición en modo local: http://localhost:5173/?editor=1
(el servidor local regenera `public/data/productos/index.json` si sumás o sacás fichas).

## Firebase (opcional)
Para activarlo, completar `public/js/firebase-config.js` con los valores del proyecto `product-hub-a1b33` (están comentados en el archivo)
y terminar estos pasos en https://console.firebase.google.com. Si Firebase no deja leer, el Hub muestra igual las fichas de `public/data` en solo lectura.

1. **Firestore Database** creada (ubicación `southamerica-east1`).
2. **Authentication › Sign-in method › Email/Password** con **Email link (passwordless sign-in)** activado.
   En **Settings › Authorized domains** sumar el dominio de Vercel cuando esté publicado.
3. **Reglas de Firestore**: pegar `firestore.rules` en Firestore › Rules y publicar.
4. **Storage** (solo para subir one pagers desde Gestión): crear el bucket y pegar `storage.rules` en Storage › Rules.
   Firebase pide el plan Blaze para crear buckets nuevos; el uso de un Hub interno queda dentro de la cuota gratuita.
5. **Cargar los datos**: Configuración del proyecto › Cuentas de servicio › Generar nueva clave privada.
   Guardar el JSON **fuera del repo**, copiar `.env.example` a `.env` y completar la ruta y los editores.

```bash
npm install
```

```bash
npm run seed -- --dry-run
```

```bash
npm run seed
```

`npm run seed` no pisa fichas que ya existen; `--force` las pisa con `public/data/`. `config/editores` se actualiza siempre con `EDITORES`.

Con Firebase CLI, las reglas se publican con:

```bash
firebase deploy --only firestore:rules,storage
```

### Formato en Firestore
Firestore no admite arrays dentro de arrays (beneficios, objeciones, matriz impositiva).
Se guardan como `[{"_a": [...]}]` y el runtime los reconstruye al leer. No editar esos campos a mano en la consola.

## Quién puede hacer qué
- **Consultar** fichas, cliente, simuladores, propuestas y presentaciones: cualquiera que abra el Hub, sin login.
- **Dejar una nota para Marketing** desde una ficha: cualquiera. Las notas se guardan en `notas`; solo los editores las ven en Gestión.
  El aviso por mail a Marketing no está implementado todavía.
- **Editar fichas, validar y subir one pagers**: editores (mail en `config/editores`).

## Publicar en Vercel
Importar el repo en Vercel sin framework ni build. Vercel sirve la carpeta `public/`.
Después sumar el dominio en Firebase › Authentication › Authorized domains.

## Análisis con IA (pantalla Cliente)
"Analizalo con IA" muestra dentro del Hub un resumen, el diagnóstico de la cartera, una estrategia con productos de Neix
(con botón para sumarlos a la propuesta), riesgos y preguntas para la reunión.

- **Hoy (simulación):** `public/js/ia-config.js` tiene `modo: "simulacion"`. El análisis lo arma el navegador con reglas, sin IA real.
- **Con la API de Anthropic:** la función `api/analisis.js` (Vercel) llama a Claude (`claude-opus-5-5`) y devuelve el análisis
  con la misma estructura que la simulación. Para activarla:
  1. Crear una clave en https://console.anthropic.com (Settings › API keys).
  2. En Vercel: Settings › Environment Variables › `ANTHROPIC_API_KEY` = la clave. Nunca en el repo ni en el navegador.
  3. Cambiar `public/js/ia-config.js` a `modo: "api"` y publicar.

La función solo recibe los datos que se ven en la pantalla Cliente (perfil, tenencia, lo que busca y su situación) y el catálogo,
y solo devuelve productos que existen en el catálogo.

## Ingreso con Microsoft (control de acceso)
En Vercel, el Hub entero (páginas, fichas, PDF y /api) pide iniciar sesión con la cuenta de Microsoft de Neix.
La primera vez el asesor toca su cuenta; después la sesión dura 90 días en ese navegador. "Salir" (al pie) cierra solo el Hub.
En local (`npm run dev`) no hay ingreso.

Piezas: `middleware.js` (controla cada pedido), `api/auth/login.js`, `api/auth/callback.js`, `api/auth/logout.js`, `api/me.js`, `lib/auth.js`.

Configuración (una vez, con la dirección de Vercel ya publicada, por ejemplo `https://producthub-xxxx.vercel.app`):
1. **entra.microsoft.com › App registrations › Hub de Productos Neix**
   - **Authentication › Add a platform › Web** › Redirect URI: `https://producthub-xxxx.vercel.app/api/auth/callback` › Configure.
   - **Certificates & secrets › Client secrets › New client secret** (24 meses) › copiar el **Value** (se ve una sola vez).
2. **Vercel › Settings › Environment Variables** (Production):
   - `AZURE_CLIENT_SECRET` = el Value del paso anterior.
   - `SESSION_SECRET` = un texto largo al azar (40 caracteres o más). Si se cambia, todos vuelven a iniciar sesión.
   - `EDITORES` = mails que ven Gestión, separados por coma (por ejemplo, Marketing y vos).
   - `HABILITADOS` = (opcional) mails que pueden entrar. Vacío: cualquier cuenta @neix.com.ar.
3. Volver a publicar (Deployments › Redeploy). Los cambios en las variables se aplican al publicar.

Quién entra: solo cuentas del directorio de Neix (@neix.com.ar), y si `HABILITADOS` tiene mails, solo esos.
Si alguien sale de `HABILITADOS`, pierde el acceso en la próxima publicación aunque tenga la sesión abierta;
si Sistemas da de baja su cuenta de Microsoft, ya no puede volver a iniciar sesión.
El secreto de Microsoft vence: anotá la fecha y renovalo antes (paso 1).
