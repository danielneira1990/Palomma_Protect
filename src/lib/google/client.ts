import { google } from "googleapis";

/**
 * Clientes de Google (Drive + Docs) autenticados con el service account.
 * Devuelve null si no hay credencial configurada, igual que la capa de Supabase,
 * para que la app corra sin la integración (sin generar contratos).
 *
 * La credencial se lee de GOOGLE_SERVICE_ACCOUNT_KEY_BASE64 (el JSON del service
 * account codificado en base64). Solo servidor; nunca se expone al cliente.
 */
export function getGoogleClients() {
  const b64 = process.env.GOOGLE_SERVICE_ACCOUNT_KEY_BASE64;
  if (!b64) return null;

  const credentials = JSON.parse(Buffer.from(b64, "base64").toString("utf8"));
  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: [
      "https://www.googleapis.com/auth/drive",
      "https://www.googleapis.com/auth/documents",
    ],
  });

  return {
    drive: google.drive({ version: "v3", auth }),
    docs: google.docs({ version: "v1", auth }),
  };
}
