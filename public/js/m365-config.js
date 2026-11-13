/*
 * Conexión con el Outlook de Neix (Microsoft 365) para "Enviar por mail".
 * Con estos datos completos, Enviar crea un borrador en el Outlook del asesor con el mensaje, la firma y el PDF adjunto.
 * Vacío = Enviar usa el menú de compartir del sistema (el PDF va adjunto, el texto se pega con Ctrl+V).
 *
 * Los completa Sistemas al registrar la aplicación en Microsoft Entra ID (ver README, "Outlook de Neix").
 * No son secretos: identifican la aplicación, no dan acceso por sí solos.
 */
window.NEIX_M365 = {
  clientId: "f937d6ea-cd12-4888-9eda-ef8d945f7599", // "Application (client) ID"
  tenantId: "a719c112-0ddd-4fd9-9dc4-a92568a689c5", // "Directory (tenant) ID"
};
