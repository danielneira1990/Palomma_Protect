import { getSupabase } from "@/lib/supabase/server";
import { carpetaRadicacion } from "@/lib/radicacionDrive";
import { subirArchivo } from "@/lib/google/drive";

function json(obj: unknown) {
  return new Response(JSON.stringify(obj), { headers: { "Content-Type": "application/json" } });
}

export async function POST(request: Request) {
  const supabase = getSupabase();
  if (!supabase) return json({ ok: false, error: "Supabase no está configurado." });

  const form = await request.formData();
  const file = form.get("archivo");
  const radicacionId = String(form.get("radicacionId") ?? "");
  if (!(file instanceof File) || file.size === 0 || !radicacionId) {
    return json({ ok: false, error: "Falta el archivo o la radicación." });
  }

  const { data: rad } = await supabase
    .from("radicacion")
    .select("id, codigo")
    .eq("id", radicacionId)
    .single();
  if (!rad) return json({ ok: false, error: "Radicación no encontrada." });

  // Sube el firmado a la carpeta de la radicación (mejor esfuerzo).
  let link = "";
  try {
    const folder = await carpetaRadicacion(supabase, radicacionId);
    if (folder) {
      const buffer = Buffer.from(await file.arrayBuffer());
      const up = await subirArchivo(
        folder,
        `Paz y Salvo FIRMADO — ${rad.codigo ?? radicacionId}.pdf`,
        buffer,
        file.type || "application/pdf",
      );
      link = up?.link ?? "";
    }
  } catch (e) {
    console.error("No se pudo subir el paz y salvo firmado a Drive:", e);
  }

  await supabase
    .from("radicacion")
    .update({
      etapa: "EN_VALIDACION",
      paz_salvo_key: link || undefined,
      updated_at: new Date().toISOString(),
    })
    .eq("id", radicacionId);

  return json({ ok: true });
}
