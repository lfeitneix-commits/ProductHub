// Función de Vercel: POST /api/analisis
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

export default async function handler(req, res) {
  if (req.method !== "POST") { res.setHeader("Allow", "POST"); return res.status(405).json({ error: "Usá POST" }); }
  const datos = typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body || {};
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
