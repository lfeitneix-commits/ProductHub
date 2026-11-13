/*
 * "Analizalo con IA" (pantalla Cliente).
 *   "simulacion": el análisis se arma en el navegador con reglas, para probar la pantalla.
 *   "api":        el Hub llama a /api/analisis (función de Vercel), que usa Claude con la clave
 *                 ANTHROPIC_API_KEY guardada en Vercel. Ver README, "Análisis con IA".
 */
window.NEIX_IA = { modo: "simulacion" };
