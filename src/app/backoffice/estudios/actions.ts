"use server";

import { getSupabase } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

export async function crearEstudio(formData: FormData) {
  const supabase = getSupabase();
  if (!supabase) {
    throw new Error("Supabase no está configurado. Revisa .env.local");
  }

  const documento = String(formData.get("documento") ?? "").trim();
  const nombre = String(formData.get("nombre") ?? "").trim();
  if (!documento || !nombre) {
    throw new Error("Documento y nombre del arrendatario son obligatorios.");
  }

  const personaData = {
    documento,
    tipo_documento: String(formData.get("tipo_documento") ?? "CC"),
    nombre,
    email: String(formData.get("email") ?? "").trim(),
    telefono: String(formData.get("telefono") ?? "").trim(),
  };

  // Persona: reusar por documento si ya existe, si no crear.
  let idPersona: string;
  const { data: existente } = await supabase
    .from("persona")
    .select("id")
    .eq("documento", documento)
    .maybeSingle();

  if (existente) {
    idPersona = existente.id;
    await supabase.from("persona").update(personaData).eq("id", idPersona);
  } else {
    const { data: nueva, error: ep } = await supabase
      .from("persona")
      .insert(personaData)
      .select("id")
      .single();
    if (ep) throw new Error(ep.message);
    idPersona = nueva.id;
  }

  // Consecutivo del año: EST-AAAA-NNNNN.
  const year = new Date().getFullYear();
  const { count } = await supabase
    .from("estudio")
    .select("*", { count: "exact", head: true })
    .ilike("codigo", `EST-${year}-%`);
  const seq = String((count ?? 0) + 1).padStart(5, "0");
  const codigo = `EST-${year}-${seq}`;

  const { error } = await supabase.from("estudio").insert({
    codigo,
    tipo_estudio: String(formData.get("tipo_estudio") ?? "PREAPROBACION"),
    id_inmobiliaria: String(formData.get("id_inmobiliaria") ?? "") || null,
    id_persona: idPersona,
    score: Number(formData.get("score")) || null,
    tier: String(formData.get("tier") ?? "") || null,
    cupo_max: Number(formData.get("cupo_max")) || null,
    tasa_sugerida: Number(formData.get("tasa_sugerida")) || null,
    estado: "EN_ANALISIS",
    estado_ingreso: null,
    fecha_ingreso_estudio: new Date().toISOString(),
  });
  if (error) throw new Error(error.message);

  revalidatePath("/backoffice/estudios");
  redirect("/backoffice/estudios");
}

/**
 * Registra la decisión del estudio (aprobado / condicional / no viable).
 * Aprobado o condicional dejan al arrendatario PREAPROBADO con 30 días de vigencia.
 */
export async function decidirEstudio(id: string, decision: string) {
  const supabase = getSupabase();
  if (!supabase) {
    throw new Error("Supabase no está configurado. Revisa .env.local");
  }
  const permitidos = ["APROBADO", "CONDICIONAL", "NO_VIABLE"];
  if (!id) throw new Error("Falta el estudio.");
  if (!permitidos.includes(decision)) throw new Error("Decisión no válida.");

  const update: Record<string, unknown> = {
    estado: decision,
    decision_fianza: decision,
    decision_final: true,
    fecha_resultado: new Date().toISOString(),
  };

  if (decision === "NO_VIABLE") {
    update.estado_ingreso = null;
  } else {
    update.estado_ingreso = "PREAPROBADO";
    const v = new Date();
    v.setDate(v.getDate() + 30);
    update.vigencia_hasta = v.toISOString().slice(0, 10);
  }

  const { error } = await supabase.from("estudio").update(update).eq("id", id);
  if (error) throw new Error(error.message);

  revalidatePath("/backoffice/estudios");
}

/** Marca el preaprobado como ingresado a fianza (paso previo al contrato). */
export async function marcarIngresado(id: string) {
  const supabase = getSupabase();
  if (!supabase) {
    throw new Error("Supabase no está configurado. Revisa .env.local");
  }
  if (!id) throw new Error("Falta el estudio.");

  const { error } = await supabase
    .from("estudio")
    .update({ estado_ingreso: "INGRESADO", fecha_ingreso: new Date().toISOString() })
    .eq("id", id);
  if (error) throw new Error(error.message);

  revalidatePath("/backoffice/estudios");
}
