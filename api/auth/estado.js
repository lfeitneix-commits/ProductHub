// GET /api/auth/estado  ->  diagnóstico de configuración: qué variables ve esta publicación (solo sí/no, nunca valores)
export default function handler(req, res) {
  const hay = (k) => !!(process.env[k] && process.env[k].trim());
  const largo = (k) => (process.env[k] || "").length;
  const lista = (k) => (process.env[k] || "").split(",").map((s) => s.trim()).filter(Boolean).length;
  res.setHeader("Cache-Control", "no-store");
  res.status(200).json({
    entorno: process.env.VERCEL_ENV || "desconocido",
    AZURE_CLIENT_SECRET: hay("AZURE_CLIENT_SECRET"),
    SESSION_SECRET: hay("SESSION_SECRET"), SESSION_SECRET_suficientemente_largo: largo("SESSION_SECRET") >= 32,
    EDITORES_cantidad: lista("EDITORES"), HABILITADOS_cantidad: lista("HABILITADOS"),
    variables_parecidas: Object.keys(process.env).filter((k) => /AZURE|SESSION|EDITOR|HABILIT/i.test(k)),
  });
}
