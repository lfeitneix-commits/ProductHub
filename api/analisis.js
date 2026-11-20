// Función de Vercel: POST /api/analisis
// También atiende a NEIA en el Hub: POST { accion: "neia", messages } (ver neiaChat más abajo).
// Recibe los datos del cliente que arma el Hub (datosIA en public/index.html) y devuelve el análisis
// con la misma forma que la simulación: { resumen, metricas, asignacion, diagnostico, rotaciones, estrategia, proximo_paso }.
//
// Requiere la variable de entorno ANTHROPIC_API_KEY en Vercel (Settings › Environment Variables).
// Para activarla en el Hub: public/js/ia-config.js -> modo: "api".
import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic(); // lee ANTHROPIC_API_KEY del entorno

const str = { type: "string" };
const obj = (properties) => ({ type: "object", properties, required: Object.keys(properties), additionalProperties: false });
const SCHEMA = obj({
  resumen: { type: "string", description: "Dos o tres oraciones con números: tamaño, riesgo, dolarización, exposición a Argentina y la jugada principal." },
  metricas: obj({
    riesgo_ponderado: { type: "number" }, riesgo_objetivo: { type: "number" }, dolarizacion_pct: { type: "number" },
    riesgo_argentino_pct: { type: "number" }, liquidez_inmediata_pct: { type: "number" }, posiciones_efectivas: { type: "number" },
  }),
  asignacion: { type: "array", items: obj({ clase: str, actual_pct: { type: "number" }, modelo_pct: { type: "number" }, propuesto_pct: { type: "number" } }) },
  diagnostico: { type: "array", items: obj({ titulo: str, detalle: str, nivel: { type: "string", enum: ["ok", "alerta", "oportunidad"] } }) },
  rotaciones: { type: "array", items: obj({
    desde: { type: "string", description: "activo de la tenencia que se vende o reduce" },
    hacia_producto_id: { type: "string", description: "id exacto de un producto del catálogo" },
    monto_usd: { type: "number" }, motivo: str, impacto: str,
  }) },
  estrategia: { type: "array", items: obj({
    producto_id: { type: "string", description: "id exacto de un producto del catálogo" },
    prioridad: { type: "integer" }, por_que: str,
    argumento: { type: "string", description: "frase para decirle al cliente, en segunda persona" },
  }) },
  proximo_paso: str,
});

const SYSTEM = `Sos un estratega senior de inversiones de Neix, una ALyC argentina, y preparás el análisis de un cliente para un asesor financiero con experiencia comercial. El asesor sabe vender: necesita un análisis técnico sólido y accionable, no generalidades.

Los asesores tienen años de experiencia: no les expliques cómo vender ni les sugieras preguntas u objeciones; dales el análisis técnico.

Te pasan la tenencia (con tipo y clase de activo), métricas ya calculadas, la cartera modelo que corresponde (por perfil o de tesorería si es empresa), lo que busca, su situación y el catálogo de productos de Neix con su pitch.

Entregá:
- resumen: la foto con números y la jugada principal.
- metricas: devolvé las que te pasan (podés corregirlas si ves un error).
- diagnostico (3 a 5 puntos): riesgo ponderado contra el perfil, concentración por emisor y por activo, exposición a riesgo argentino (soberano, corporativo, pesos), moneda (MEP, cable, pesos), liquidez ociosa, duration o plazos si se infieren, coherencia con lo que busca.
- rotaciones (hasta 3): de un activo concreto de la tenencia a un producto del catálogo, con monto en USD redondeado a 5.000, el motivo técnico y el impacto en la cartera. Priorizá bajar concentración y acercarse a la cartera modelo sin cambiar el perfil. Si busca preservar dólares, no rotes dólares a pesos. Si es empresa, cuidá la liquidez operativa.
- asignacion: por clase de activo, hoy, con las rotaciones aplicadas y el modelo.
- estrategia (2 a 4 productos del catálogo, id exacto, ordenados): por qué para este cliente y un argumento de venta en segunda persona.
- proximo_paso: la acción concreta para esta semana.

Español rioplatense, directo, con números. No inventes rendimientos ni precios que no estén en los datos. Es material interno para el asesor, no una recomendación al cliente.`;

/* ── NEIA en el Hub ──
   La misma NEIA del tablero de rentabilidad, pero acá solo conoce el Hub de Productos. Las herramientas se ejecutan en el navegador
   (neiaHerramienta en public/index.html), que solo tiene fichas, instructivos, simuladores y fondos: no hay ninguna herramienta ni dato
   del centro de costos, así que no puede darlos aunque se los pidan. Esta función solo hace de puente con la API de Claude. */
const NEIA_MODELO = "claude-sonnet-5-5"; // el mismo modelo que NEIA en el tablero de rentabilidad
const NEIA_SYSTEM = `Sos NEIA, la asistente de Neix S.A., una ALyC argentina. En el Hub de Productos ayudás a los asesores comerciales (Banca Privada, Banca Corporativa, Financial Advisors y la Mesa) a encontrar el producto adecuado, entender cómo funciona, armar el argumento para el cliente y ubicar instructivos, simuladores y fondos.

## Qué información tenés
Solo la del Hub de Productos, a través de tus herramientas: fichas de productos (para el cliente y para el asesor), instructivos, simuladores y la lista de fondos comunes de inversión con su rendimiento. No sabés nada más de Neix que lo que te dan esas herramientas. Nunca des un dato de un producto sin haberlo consultado antes en esta conversación.

## Lo que no hacés
- No das información del centro de costos ni de la gestión interna de Neix: rentabilidad, EERR, resultados por área, costos, gastos, proveedores, sueldos, comisiones internas, presupuestos ni nada parecido. No la tenés. Si te la piden, respondé en una línea: "Eso no lo manejo desde el Hub de Productos." y ofrecé ayudar con productos. No digas dónde está esa información ni que existe otra herramienta.
- No inventás tasas, precios, montos ni condiciones que no estén en las fichas. Si un dato no está, decilo.
- No das recomendaciones de inversión personalizadas a clientes finales: ayudás al asesor con la información de los productos.
- No opinás sobre personas.

## Cómo respondés
- Español rioplatense, breve y directo: 1 a 5 líneas salvo que te pidan más. Sin preámbulos.
- Los asesores tienen experiencia: no les expliques cómo vender.
- Cuando nombres un producto, linkealo a su ficha así: [Nombre del producto](#p-ID). Para un simulador: [Simulador de descuento de documentos](#sim-descuento). Para los instructivos: [Instructivos](#instructivos).
- Para buscar productos por necesidad, área o palabra, usá buscar_productos; para el detalle, obtener_ficha. Probá variantes si una búsqueda no trae nada.
- Rendimientos de fondos: aclarás la fecha y que rendimientos pasados no aseguran rendimientos futuros.`;
const NEIA_TOOLS = [
  { name: "buscar_productos", description: "Busca productos del Hub por texto libre (nombre, necesidad, tipo de cliente), área (Banca Privada, Banca Corporativa, Financial Advisors, Mercado de Capitales) o necesidad (fin: financiarse, liq: rentabilizar liquidez, renta: generar renta, usd: dolarizar e invertir afuera, cob: cubrirse, pat: ordenar el patrimonio). Pasá \"\" en los campos que no uses. Devuelve id, nombre, tipo, áreas y titular.",
    input_schema: { type: "object", properties: { texto: { type: "string" }, area: { type: "string" }, necesidad: { type: "string" } }, required: ["texto", "area", "necesidad"], additionalProperties: false }, strict: true },
  { name: "obtener_ficha", description: "Ficha completa de un producto por su id: qué es, para quién, beneficios, cómo funciona, lo que hay que saber, datos (moneda, plazo, riesgo, mínimo, liquidez, dónde opera), argumento para el asesor, perfiles, señales, operativa, productos relacionados y si tiene one pager o simulador.",
    input_schema: { type: "object", properties: { id: { type: "string" } }, required: ["id"], additionalProperties: false }, strict: true },
  { name: "listar_instructivos", description: "Lista los instructivos generales del Hub (videos y guías: apertura de cuenta, cómo operar, alta en EPYME, etc.).",
    input_schema: { type: "object", properties: {}, required: [], additionalProperties: false }, strict: true },
  { name: "listar_simuladores", description: "Lista los simuladores del Hub (caución, descuento de documentos, cheques Neix vs. banco, FAL) con su link.",
    input_schema: { type: "object", properties: {}, required: [], additionalProperties: false }, strict: true },
  { name: "buscar_fondos", description: "Busca fondos comunes de inversión que ofrece Neix por texto (nombre, sociedad gerente, especie) y/o tipo (Money Market, Renta Fija en $, Renta Fija en USD, Fondos Mixtos en $, Fondos Mixtos en USD, Renta Variable en $, Renta Variable USD). Pasá \"\" en lo que no uses. Devuelve especie, moneda y rendimiento en el año y últimos 3 meses con su fecha, ordenados por rendimiento de 3 meses.",
    input_schema: { type: "object", properties: { texto: { type: "string" }, tipo: { type: "string" } }, required: ["texto", "tipo"], additionalProperties: false }, strict: true },
];
async function neiaChat(body, res) {
  const messages = Array.isArray(body.messages) ? body.messages.slice(-40) : [];
  if (!messages.length || messages[0].role !== "user") return res.status(400).json({ error: "Faltan los mensajes" });
  if (JSON.stringify(messages).length > 400000) return res.status(413).json({ error: "La conversación es muy larga: empezá una nueva" });
  try {
    const r = await client.beta.messages.create({
      model: NEIA_MODELO, max_tokens: 8000,
      betas: ["server-side-fallback-2026-07-01"], fallbacks: "default",   // si el modelo declina, la API reintenta sola con el de respaldo
      output_config: { effort: "low" },                                  // chat: respuestas rápidas
      cache_control: { type: "ephemeral" },
      system: NEIA_SYSTEM, tools: NEIA_TOOLS, messages,
    });
    // Se devuelve el contenido completo (incluidos los bloques de razonamiento): el navegador lo reenvía tal cual en la próxima vuelta.
    return res.status(200).json({ content: r.content, stop_reason: r.stop_reason });
  } catch (error) {
    if (error instanceof Anthropic.RateLimitError) return res.status(429).json({ error: "Muchas consultas juntas. Probá en un minuto." });
    if (error instanceof Anthropic.AuthenticationError) return res.status(500).json({ error: "La clave de Anthropic no es válida" });
    if (error instanceof Anthropic.BadRequestError) { console.error(error); return res.status(400).json({ error: "No pude procesar la consulta. Empezá una conversación nueva." }); }
    if (error instanceof Anthropic.APIError) return res.status(502).json({ error: `Error de la API (${error.status})` });
    console.error(error);
    return res.status(500).json({ error: "Error inesperado" });
  }
}

export default async function handler(req, res) {
  if (req.method !== "POST") { res.setHeader("Allow", "POST"); return res.status(405).json({ error: "Usá POST" }); }
  const datos = typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body || {};
  if (datos.accion === "neia") {
    if (!process.env.ANTHROPIC_API_KEY) return res.status(503).json({ error: "NEIA todavía no está activada en el Hub (falta la clave de Anthropic en Vercel)." });
    return neiaChat(datos, res);
  }
  if (!datos.cliente || !Array.isArray(datos.catalogo)) return res.status(400).json({ error: "Faltan datos del cliente o el catálogo" });
  if (!process.env.ANTHROPIC_API_KEY) return res.status(500).json({ error: "Falta ANTHROPIC_API_KEY en Vercel" });

  try {
    const response = await client.beta.messages.create({
      model: "claude-opus-5-5",
      max_tokens: 16000,
      // Si el modelo declina por seguridad, la API reintenta sola con el modelo de respaldo recomendado.
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { effort: "high", format: { type: "json_schema", schema: SCHEMA } },
      system: SYSTEM,
      messages: [{ role: "user", content: "Datos del cliente y catálogo de productos de Neix (JSON):\n" + JSON.stringify(datos) }],
    });

    if (response.stop_reason === "refusal") return res.status(422).json({ error: "El modelo no pudo hacer este análisis" });
    if (response.stop_reason === "max_tokens") return res.status(502).json({ error: "La respuesta quedó incompleta" });
    const texto = response.content.filter((b) => b.type === "text").map((b) => b.text).join("");
    const analisis = JSON.parse(texto);

    // Solo productos que existen en el catálogo.
    const ids = new Set(datos.catalogo.map((p) => p.id));
    analisis.estrategia = analisis.estrategia.filter((e) => ids.has(e.producto_id));
    analisis.rotaciones = analisis.rotaciones.filter((r) => ids.has(r.hacia_producto_id));
    return res.status(200).json(analisis);
  } catch (error) {
    if (error instanceof Anthropic.RateLimitError) return res.status(429).json({ error: "Muchas consultas juntas. Probá en un minuto." });
    if (error instanceof Anthropic.AuthenticationError) return res.status(500).json({ error: "La clave de Anthropic no es válida" });
    if (error instanceof Anthropic.APIError) return res.status(502).json({ error: `Error de la API (${error.status})` });
    if (error instanceof SyntaxError) return res.status(502).json({ error: "La respuesta no tuvo el formato esperado" });
    console.error(error);
    return res.status(500).json({ error: "Error inesperado" });
  }
}
