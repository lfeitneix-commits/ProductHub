/*
 * Conexión con el Outlook de Neix (Microsoft 365) para "Enviar por mail".
 * Con estos datos completos, Enviar crea un borrador en el Outlook del asesor con el mensaje, la firma y el PDF adjunto.
 * Vacío = Enviar usa el menú de compartir del sistema (el PDF va adjunto, el texto se pega con Ctrl+V).
 *
 * Los completa Sistemas al registrar la aplicación en Microsoft Entra ID (ver README, "Outlook de Neix").
 * No son secretos: identifican la aplicación, no dan acceso por sí solos.
 */
window.NEIX_M365 = {
  clientId: "", // "Id. de aplicación (cliente)"
  tenantId: "", // "Id. de directorio (inquilino)"
};
