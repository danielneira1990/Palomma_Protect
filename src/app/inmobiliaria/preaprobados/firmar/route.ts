import { getSupabase } from "@/lib/supabase/server";
import { carpetaRadicacion } from "@/lib/radicacionDrive";
import { subirArchivo } from "@/lib/google/drive";
import { extraerTextoPdf, parsearEvidenciaAuco, validarFirmaRepresentante } from "@/lib/auco";

function json(obj: unknown) {
  return new Response(JSON.stringify(obj), { headers: { "Content-Type": "application/json" } });
}

export async function POST(request: Request) {
  const supabase = getSupabase();
  if (!supabase) return json({ ok: false, errores: ["Supabase no está configurado."] });

  const form = await request.formData();
  const file = form.get("archivo");
  const radicacionId = String(form.get("radicacionId") ?? "");
  if (!(file instanceof File) || file.size === 0 || !radicacionId) {
    return json({ ok: false, errores: ["Falta el archivo o la radicación."] });
  }

  const { data: rad } = await supabase
    .from("radicacion")
    .select("id, codigo, id_inmobiliaria")
    .eq("id", radicacionId)
    .single();
  if (!rad) return json({ ok: false, errores: ["Radicación no encontrada."] });

  // Datos del representante legal para cruzar contra la evidencia de AUCO.
  const { data: inmo } = await supabase
    .from("inmobiliaria")
    .select("email_representante, celular_representante")
    .eq("id", rad.id_inmobiliaria)
    .single();

  // 1. Extraer texto del PDF y validar la firma electrónica (AUCO).
  const buffer = Buffer.from(await file.arrayBuffer());
  let texto = "";
  try {
    texto = await extraerTextoPdf(buffer);
  } catch (e) {
    console.error("No se pudo leer el PDF firmado:", e);
    return json({ ok: false, errores: ["No pude leer el PDF. ¿Es el documento firmado por AUCO?"] });
  }

  const evidencia = parsearEvidenciaAuco(texto);
  const { ok, errores } = validarFirmaRepresentante(evidencia, {
    email: inmo?.email_representante ?? null,
    celular: inmo?.celular_representante ?? null,
  });
  if (!ok) {
    // Registra el rebote para que el backoffice lo vea y pueda ayudar al cliente.
    await supabase
      .from("radicacion")
      .update({
        ultimo_error: `Firma: ${errores.join(" · ")}`,
        ultimo_error_at: new Date().toISOString(),
      })
      .eq("id", radicacionId);
    return json({ ok: false, errores });
  }

  // 2. Guardar el firmado en la carpeta de la radicación (mejor esfuerzo).
  let link = "";
  try {
    const folder = await carpetaRadicacion(supabase, radicacionId);
    if (folder) {
      const up = await subirArchivo(
        folder,
        `Declaracion FIRMADA — ${rad.codigo ?? radicacionId}.pdf`,
        buffer,
        file.type || "application/pdf",
      );
      link = up?.link ?? "";
    }
  } catch (e) {
    console.error("No se pudo subir la declaración firmada a Drive:", e);
  }

  // 3. Avanzar a FIRMADO (listo para que la inmobiliaria haga el ingreso) y
  //    guardar la evidencia de la firma.
  await supabase
    .from("radicacion")
    .update({
      etapa: "FIRMADO",
      paz_salvo_key: link || undefined,
      firma_doc_id: evidencia.docId,
      firma_hash: evidencia.hash,
      firma_email: (inmo?.email_representante ?? "").trim().toLowerCase() || null,
      firma_metodo: evidencia.metodoFuerte ? "AUCO · OTP+Foto+Documento" : "AUCO",
      firma_at: new Date().toISOString(),
      ultimo_error: null, // firma válida → limpia el rebote anterior
      ultimo_error_at: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", radicacionId);

  return json({ ok: true });
}
