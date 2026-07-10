import type { SupabaseClient } from "@supabase/supabase-js";
import { ubicarOcrearSubcarpeta } from "@/lib/google/drive";

/**
 * Devuelve (creando si hace falta) la carpeta de Drive de una radicación,
 * ubicada DENTRO de la carpeta de la inmobiliaria. Ahí van los comprobantes
 * (Excel de radicación, paz y salvo firmado). Guarda el id en la radicación.
 */
export async function carpetaRadicacion(
  supabase: SupabaseClient,
  radicacionId: string,
): Promise<string | null> {
  const { data: rad } = await supabase
    .from("radicacion")
    .select("id, codigo, drive_folder_id, id_inmobiliaria")
    .eq("id", radicacionId)
    .single();
  if (!rad) return null;
  if (rad.drive_folder_id) return rad.drive_folder_id;

  // Parent = carpeta de la inmobiliaria (o la global de Inmobiliarias como respaldo).
  let parent = process.env.GOOGLE_DRIVE_INMOBILIARIAS_FOLDER_ID ?? null;
  if (rad.id_inmobiliaria) {
    const { data: inmo } = await supabase
      .from("inmobiliaria")
      .select("drive_folder_id")
      .eq("id", rad.id_inmobiliaria)
      .single();
    if (inmo?.drive_folder_id) parent = inmo.drive_folder_id;
  }
  if (!parent) return null;

  const folderId = await ubicarOcrearSubcarpeta(parent, `Radicación ${rad.codigo ?? radicacionId}`);
  if (folderId) {
    await supabase.from("radicacion").update({ drive_folder_id: folderId }).eq("id", radicacionId);
  }
  return folderId;
}
