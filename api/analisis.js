// Función de Vercel: POST /api/analisis
// Recibe los datos del cliente que arma el Hub (datosIA en public/index.html) y devuelve el análisis
// con la misma forma que la simulación: { resumen, diagnostico, estrategia, riesgos, preguntas }.
//
// Requiere la variable de entorno ANTHROPIC_API_KEY en Vercel (Settings › Environment Variables).
// Para activarla en el Hub: public/js/ia-config.js -> modo: "api".
import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic(); // lee ANTHROPIC_API_KEY del entorno

const SCHEMA = {
  type: "object",
  properties: {
    resumen: { type: "string", description: "Dos o tres oraciones: situación del cliente y por dónde empezar." },
    diagnostico: {
      type: "array",
      items: {
        type: "object",
        properties: {
          titulo: { type: "string" },
          detalle: { type: "string" },
          nivel: { type: "string", enum: ["ok", "alerta", "oportunidad"] },
        },
        required: ["titulo", "detalle", "nivel"],
        additionalProperties: false,
      },
    },
    estrategia: {
      type: "array",
      items: {
        type: "object",
        properties: {
          producto_id: { type: "string", description: "id exacto de un producto del catálogo" },
          prioridad: { type: "integer" },
          por_que: { type: "string" },
        },
        required: ["producto_id", "prioridad", "por_que"],
        additionalProperties: false,
      },
    },
    riesgos: { type: "array", items: { type: "string" } },
    preguntas: { type: "array", items: { type: "string" } },
  },
  required: ["resumen", "diagnostico", "estrategia", "riesgos", "preguntas"],
  additionalProperties: false,
};

const SYSTEM = `Sos un asistente para los asesores comerciales de Neix, una ALyC argentina.
Con los datos de un cliente, preparás un análisis breve para que el asesor lo use en la próxima conversación:
- diagnóstico de la cartera (concentración, moneda, liquidez, coherencia con el perfil de inversor), de 2 a 4 puntos;
- una estrategia de 2 a 4 productos, solo del catálogo que te pasan (usá el id exacto), ordenados por prioridad, que respeten el perfil de inversor y respondan a lo que busca y a su situación;
- riesgos o puntos a cuidar, y de 3 a 4 preguntas para la reunión.
Escribí en español rioplatense, claro y concreto, sin jerga innecesaria. Es una sugerencia para el asesor, no una recomendación al cliente: no prometas rendimientos.`;

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
      output_config: { effort: "medium", format: { type: "json_schema", schema: SCHEMA } },
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
