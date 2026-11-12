# Hub de Productos Neix

Herramienta interna para que los comerciales de Neix consulten productos, analicen la cartera de un cliente
y armen propuestas y presentaciones. Es la versión del artifact de claude.ai sin dependencias de Claude:
corre en cualquier hosting estático (Vercel) con Firebase como base de datos.

## Estructura
- `public/index.html`: el Hub (HTML, CSS y JS en un archivo).
- `public/js/runtime.js`: reemplazo de `window.claude` (base de datos, archivos, usuario, descargas).
- `public/js/firebase-config.js`: configuración web de Firebase (no es secreta). Si `apiKey` queda vacío, el Hub corre en modo local.
- `public/onepagers/*.pdf`: one pagers originales.
- `data/productos/*.json`, `data/config/*.json`: fichas y configuración (fuente para cargar Firestore y para el modo local).
- `firestore.rules`, `storage.rules`: quién lee y quién escribe.
- `scripts/dev-server.mjs`: servidor local. `scripts/seed-firestore.mjs`: carga `data/` en Firestore.

## Qué reemplaza a claude.ai
| En el Hub | Antes (claude.ai) | Ahora |
| --- | --- | --- |
| Fichas, validaciones, notas, config | base del artifact | Firestore (modo local: JSON de `data/`, lo editado queda en memoria) |
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
(con `firebase-config.js` completo, el Hub usa Firebase también en local).

## Firebase
`public/js/firebase-config.js` apunta al proyecto `product-hub-a1b33`, el mismo del repo Product-Hub.
Para que el Hub muestre las fichas hay que terminar estos pasos en https://console.firebase.google.com:

1. **Firestore Database** creada (ubicación `southamerica-east1`).
2. **Authentication › Sign-in method › Email/Password** con **Email link (passwordless sign-in)** activado.
   En **Settings › Authorized domains** sumar el dominio de Vercel cuando esté publicado.
3. **Reglas de Firestore**: pegar `firestore.rules` en Firestore › Rules y publicar.
   Sin esto, el Hub muestra "No pudimos abrir la base de fichas".
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

`npm run seed` no pisa fichas que ya existen; `--force` las pisa con `data/`. `config/editores` se actualiza siempre con `EDITORES`.

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
