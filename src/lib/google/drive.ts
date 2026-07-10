import { Readable } from "node:stream";
import { getGoogleClients } from "./client";

/** Ubica (o crea) una subcarpeta por nombre dentro de parentId. */
export async function ubicarOcrearSubcarpeta(
  parentId: string,
  nombre: string,
): Promise<string | null> {
  const clients = getGoogleClients();
  if (!clients) return null;
  const { drive } = clients;

  const found = await drive.files.list({
    q: `'${parentId}' in parents and name = '${nombre.replace(/'/g, "\\'")}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
    fields: "files(id)",
    supportsAllDrives: true,
    includeItemsFromAllDrives: true,
  });
  const existente = found.data.files?.[0]?.id;
  if (existente) return existente;

  const creada = await drive.files.create({
    requestBody: {
      name: nombre,
      mimeType: "application/vnd.google-apps.folder",
      parents: [parentId],
    },
    fields: "id",
    supportsAllDrives: true,
  });
  return creada.data.id ?? null;
}

/** Sube un archivo a una carpeta de Drive. */
export async function subirArchivo(
  folderId: string,
  nombre: string,
  buffer: Buffer,
  mimeType: string,
): Promise<{ id: string; link: string } | null> {
  const clients = getGoogleClients();
  if (!clients) return null;
  const { drive } = clients;

  const up = await drive.files.create({
    requestBody: { name: nombre, parents: [folderId], mimeType },
    media: { mimeType, body: Readable.from(buffer) },
    fields: "id, webViewLink",
    supportsAllDrives: true,
  });
  return { id: up.data.id!, link: up.data.webViewLink ?? "" };
}
