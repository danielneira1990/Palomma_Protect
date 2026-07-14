"use server";

import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabase } from "@/lib/supabase/server";
import {
  generarContratoMarco,
  subirContratoFirmadoADrive,
} from "@/lib/google/contratoMarco";
import { exportarReglamentosPdf } from "@/lib/google/reglamentos";
import { enviarCorreo } from "@/lib/email/client";
import { correoBienvenida } from "@/lib/email/bienvenida";
import { correoContratoMarco } from "@/lib/email/contratoMarco";
import { fechaLarga } from "@/lib/format";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

type InmoBienvenida = {
  id: string;
  razon_social: string | null;
  persona_contacto: string | null;
  email_contacto: string | null;
};

/** Envía el correo de bienvenida y marca la fecha. Lanza error si falla. */
async function mandarBienvenida(supabase: SupabaseClient, inmo: InmoBienvenida) {
  if (!inmo.email_contacto) {
    throw new Error("La inmobiliaria no tiene correo de contacto.");
  }
  const portalUrl = process.env.PORTAL_URL ?? "http://localhost:3000/inmobiliaria";
  const { subject, html, attachments } = correoBienvenida({
    razonSocial: inmo.razon_social ?? "",
    nombreContacto: inmo.persona_contacto ?? "",
    emailContacto: inmo.email_contacto,
    portalUrl,
  });

  // Adjunta los tres condicionados (reglamentos) exportados de Drive a PDF.
  // Mejor esfuerzo: si Drive falla, el correo igual se envía (con el logo).
  const adjuntos: { filename: string; content: Buffer; cid?: string }[] = [...attachments];
  try {
    adjuntos.push(...(await exportarReglamentosPdf()));
  } catch (e) {
    console.error("No se pudieron adjuntar los reglamentos:", e);
  }

  const res = await enviarCorreo({
    to: inmo.email_contacto,
    subject,
    html,
    attachments: adjuntos,
  });
  if (!res) {
    throw new Error("El envío de correo no está configurado (revisa SMTP_* en .env.local).");
  }
  await supabase
    .from("inmobiliaria")
    .update({ bienvenida_enviada_at: new Date().toISOString() })
    .eq("id", inmo.id);
}

export type MerchantData = {
  merchant_id: string | null;
  razon_social: string | null;
  nit: string | null;
  ciudad: string | null;
  direccion: string | null;
  telefono: string | null;
  email_contacto: string | null;
  representante_legal: string | null;
  cc_representante: string | null;
  email_representante: string | null;
  celular_representante: string | null;
};

/** Trae los datos del merchant (desde Pay/rentals_merchants) para auto-llenar. */
export async function traerMerchant(merchantId: string): Promise<MerchantData> {
  const id = merchantId.trim();
  if (!id) throw new Error("Escribe el Merchant ID.");
  const base = process.env.SCORING_SERVICE_URL ?? "http://127.0.0.1:8000";
  let res: Response;
  try {
    res = await fetch(`${base}/merchant/${encodeURIComponent(id)}`, { cache: "no-store" });
  } catch {
    throw new Error(`No se pudo contactar el servicio en ${base}. ¿Está corriendo?`);
  }
  if (res.status === 404) throw new Error("No encontré ese merchant en Pay.");
  if (!res.ok) throw new Error("No se pudo consultar el merchant.");
  return (await res.json()) as MerchantData;
}

export async function crearInmobiliaria(formData: FormData) {
  const supabase = getSupabase();
  if (!supabase) {
    throw new Error("Supabase no está configurado. Revisa .env.local");
  }

  const year = new Date().getFullYear();

  // Consecutivo del año (IMB-AAAA-NNN). El código legible es de negocio;
  // la llave real de la tabla es el UUID.
  const { count } = await supabase
    .from("inmobiliaria")
    .select("*", { count: "exact", head: true })
    .ilike("codigo", `IMB-${year}-%`);

  const seq = String((count ?? 0) + 1).padStart(3, "0");
  const codigo = `IMB-${year}-${seq}`;
  const num_contrato_marco = `CMF-${year}-${seq}`;

  const payload = {
    codigo,
    num_contrato_marco,
    razon_social: String(formData.get("razon_social") ?? "").trim(),
    nit: String(formData.get("nit") ?? "").trim(),
    merchant_id: String(formData.get("merchant_id") ?? "").trim(),
    representante_legal: String(formData.get("representante_legal") ?? "").trim(),
    cc_representante: String(formData.get("cc_representante") ?? "").trim(),
    email_representante: String(formData.get("email_representante") ?? "").trim(),
    celular_representante: String(formData.get("celular_representante") ?? "").trim(),
    persona_contacto: String(formData.get("persona_contacto") ?? "").trim(),
    email_contacto: String(formData.get("email_contacto") ?? "").trim(),
    telefono: String(formData.get("telefono") ?? "").trim(),
    sucursal: String(formData.get("sucursal") ?? "").trim(),
    ciudad: String(formData.get("ciudad") ?? "").trim(),
    direccion: String(formData.get("direccion") ?? "").trim(),
    modalidad_pago: String(formData.get("modalidad_pago") ?? "Facturación").trim(),
    estado: "PENDIENTE",
  };

  const { data: inmo, error } = await supabase
    .from("inmobiliaria")
    .insert(payload)
    .select("id, codigo, num_contrato_marco, razon_social, nit, ciudad, representante_legal, cc_representante")
    .single();
  if (error) throw new Error(error.message);

  // Genera el Contrato Marco en Google Drive (mejor esfuerzo: si falla, la
  // inmobiliaria igual queda creada). Se registra el PDF en la tabla documento.
  try {
    const doc = await generarContratoMarco({
      codigo: inmo.codigo,
      numContratoMarco: inmo.num_contrato_marco,
      razonSocial: inmo.razon_social ?? "",
      nit: inmo.nit ?? "",
      ciudad: inmo.ciudad ?? "",
      representanteLegal: inmo.representante_legal ?? "",
      ccRepresentante: inmo.cc_representante ?? "",
      fechaSuscripcion: fechaLarga(new Date()),
    });

    if (doc) {
      // Guarda la carpeta de Drive para poder subir luego el firmado a la misma.
      await supabase
        .from("inmobiliaria")
        .update({ drive_folder_id: doc.folderId })
        .eq("id", inmo.id);

      await supabase.from("documento").insert({
        tipo_entidad: "INMOBILIARIA",
        id_entidad: inmo.id,
        tipo_documento: "CONTRATO_MARCO",
        storage_key: doc.pdfLink || doc.pdfId,
      });

      // Correo con el Contrato Marco adjunto, para que lo firmen.
      if (payload.email_contacto) {
        const { subject, html, attachments } = correoContratoMarco({
          razonSocial: payload.razon_social,
          nombreContacto: payload.persona_contacto,
          contratoLink: doc.pdfLink,
        });
        await enviarCorreo({
          to: payload.email_contacto,
          subject,
          html,
          attachments: [
            ...attachments,
            { filename: "Contrato_Marco_Palomma.pdf", content: doc.pdf },
          ],
        });
      }
    }
  } catch (e) {
    // No bloquea la creación; se registra para revisión.
    console.error("Error generando/enviando el Contrato Marco:", e);
  }

  revalidatePath("/backoffice/inmobiliarias");
  redirect("/backoffice/inmobiliarias");
}

/**
 * Sube el Contrato Marco firmado a Drive y activa la inmobiliaria
 * (PENDIENTE → ACTIVA). Falla ruidosamente si no se pudo guardar el archivo.
 */
export async function subirContratoFirmado(formData: FormData) {
  const supabase = getSupabase();
  if (!supabase) {
    throw new Error("Supabase no está configurado. Revisa .env.local");
  }

  const id = String(formData.get("id") ?? "").trim();
  const archivo = formData.get("archivo");
  if (!id) throw new Error("Falta la inmobiliaria.");
  if (!(archivo instanceof File) || archivo.size === 0) {
    throw new Error("Selecciona el archivo del contrato firmado.");
  }

  const { data: inmo, error } = await supabase
    .from("inmobiliaria")
    .select(
      "id, codigo, razon_social, num_contrato_marco, drive_folder_id, persona_contacto, email_contacto, bienvenida_enviada_at",
    )
    .eq("id", id)
    .single();
  if (error) throw new Error(error.message);

  const buffer = Buffer.from(await archivo.arrayBuffer());
  const subido = await subirContratoFirmadoADrive({
    folderId: inmo.drive_folder_id,
    codigo: inmo.codigo,
    razonSocial: inmo.razon_social ?? "",
    numContratoMarco: inmo.num_contrato_marco,
    buffer,
    mimeType: archivo.type || "application/pdf",
  });

  if (!subido) {
    throw new Error(
      "No se pudo subir el contrato firmado a Drive (revisa la configuración de Google).",
    );
  }

  await supabase.from("documento").insert({
    tipo_entidad: "INMOBILIARIA",
    id_entidad: inmo.id,
    tipo_documento: "CONTRATO_MARCO_FIRMADO",
    storage_key: subido.link || subido.fileId,
  });

  // Guarda la carpeta si la ubicamos por fallback, y activa la inmobiliaria.
  await supabase
    .from("inmobiliaria")
    .update({ estado: "ACTIVA", drive_folder_id: subido.folderId })
    .eq("id", inmo.id);

  // Correo de bienvenida automático al activar (mejor esfuerzo, una sola vez).
  if (inmo.email_contacto && !inmo.bienvenida_enviada_at) {
    try {
      await mandarBienvenida(supabase, inmo);
    } catch (e) {
      console.error("Error enviando la bienvenida:", e);
    }
  }

  // Al activar, corre el modelo y carga los preaprobados automáticamente
  // (mejor esfuerzo; tarda ~30s porque corre el scoring en vivo).
  try {
    await actualizarPreaprobados(inmo.id);
  } catch (e) {
    console.error("No se pudieron actualizar los preaprobados tras la firma:", e);
  }

  revalidatePath("/backoffice/inmobiliarias");
}

/**
 * Cambia manualmente el estado de una inmobiliaria (activar, suspender, dar de
 * baja). No permite volver a PENDIENTE: ese es el estado inicial automático.
 */
export async function cambiarEstadoInmobiliaria(id: string, estado: string) {
  const supabase = getSupabase();
  if (!supabase) {
    throw new Error("Supabase no está configurado. Revisa .env.local");
  }

  const permitidos = ["ACTIVA", "SUSPENDIDA", "INACTIVA"];
  if (!id) throw new Error("Falta la inmobiliaria.");
  if (!permitidos.includes(estado)) throw new Error("Estado no válido.");

  const { error } = await supabase
    .from("inmobiliaria")
    .update({ estado })
    .eq("id", id);
  if (error) throw new Error(error.message);

  revalidatePath("/backoffice/inmobiliarias");
}

/** Reenvía manualmente el Contrato Marco (para firma) a la inmobiliaria. */
export async function reenviarContratoMarco(id: string) {
  const supabase = getSupabase();
  if (!supabase) {
    throw new Error("Supabase no está configurado. Revisa .env.local");
  }
  if (!id) throw new Error("Falta la inmobiliaria.");

  const { data: inmo, error } = await supabase
    .from("inmobiliaria")
    .select("id, razon_social, persona_contacto, email_contacto")
    .eq("id", id)
    .single();
  if (error) throw new Error(error.message);
  if (!inmo.email_contacto) {
    throw new Error("La inmobiliaria no tiene correo de contacto.");
  }

  const { data: docu } = await supabase
    .from("documento")
    .select("storage_key")
    .eq("tipo_entidad", "INMOBILIARIA")
    .eq("id_entidad", id)
    .eq("tipo_documento", "CONTRATO_MARCO")
    .maybeSingle();

  const { subject, html, attachments } = correoContratoMarco({
    razonSocial: inmo.razon_social ?? "",
    nombreContacto: inmo.persona_contacto ?? "",
    contratoLink: docu?.storage_key ?? undefined,
  });
  const res = await enviarCorreo({ to: inmo.email_contacto, subject, html, attachments });
  if (!res) {
    throw new Error("El envío de correo no está configurado (revisa SMTP_* en .env.local).");
  }

  revalidatePath("/backoffice/inmobiliarias");
}

type ScoreRow = {
  customer_document_number?: string | number;
  status?: string;
  tier?: string;
  confidence?: string;
  score?: number;
  max_loan_amount?: number;
  interest_rate_min?: number;
  expected_default_rate?: number;
  risk_flags?: unknown;
  inactive_customer?: boolean | number | string;
  name?: string | null;
  email?: string | null;
  phoneNumber?: string | null;
  [k: string]: unknown;
};

/** Cliente inactivo según el modelo (boolean inactive_customer, en varias formas). */
function esInactivo(r: ScoreRow): boolean {
  const v = r.inactive_customer;
  return v === true || v === 1 || v === "1" || v === "true" || v === "True";
}

/**
 * Corre el motor de scoring para la inmobiliaria y refresca sus preaprobados:
 *   - trae los scores en vivo del servicio (por merchant),
 *   - toma los PRIME, saltando los que ya están en fianza (INGRESADO),
 *   - reemplaza los preaprobados vigentes por la corrida nueva.
 * Devuelve cuántos preaprobados quedaron.
 */
export async function actualizarPreaprobados(
  inmobiliariaId: string,
): Promise<{ preaprobados: number }> {
  const supabase = getSupabase();
  if (!supabase) {
    throw new Error("Supabase no está configurado. Revisa .env.local");
  }

  const { data: inmo, error } = await supabase
    .from("inmobiliaria")
    .select("id, merchant_id")
    .eq("id", inmobiliariaId)
    .single();
  if (error) throw new Error(error.message);
  if (!inmo.merchant_id) {
    throw new Error("La inmobiliaria no tiene merchant_id configurado.");
  }

  // 1. Correr el motor (servicio Python).
  const base = process.env.SCORING_SERVICE_URL ?? "http://127.0.0.1:8000";
  let scores: ScoreRow[] = [];
  try {
    const res = await fetch(`${base}/score/${encodeURIComponent(inmo.merchant_id)}`, {
      method: "POST",
      cache: "no-store",
    });
    if (!res.ok) {
      throw new Error(`el motor respondió ${res.status}`);
    }
    const json = (await res.json()) as { scores?: ScoreRow[] };
    scores = json.scores ?? [];
  } catch (e) {
    throw new Error(
      `No se pudo contactar el motor de scoring en ${base}. ¿Está corriendo? (${e instanceof Error ? e.message : "error"})`,
    );
  }

  const prime = scores.filter(
    (r) =>
      r.status === "SCORED" &&
      r.tier === "PRIME" &&
      r.confidence === "HIGH" &&
      !esInactivo(r),
  );

  // 2. Documentos ya en fianza (INGRESADO): no revivirlos.
  const { data: existentesRaw } = await supabase
    .from("estudio")
    .select("estado_ingreso, persona(documento)")
    .eq("id_inmobiliaria", inmo.id)
    .eq("merchant_id", inmo.merchant_id);
  const existentes = (existentesRaw ?? []) as unknown as {
    estado_ingreso: string | null;
    persona: { documento: string | null } | null;
  }[];
  const enFianza = new Set(
    existentes
      .filter((e) => e.estado_ingreso === "INGRESADO")
      .map((e) => e.persona?.documento)
      .filter((d): d is string => !!d),
  );

  // 3. Reemplazar los preaprobados vigentes (no los ingresados).
  await supabase
    .from("estudio")
    .delete()
    .eq("id_inmobiliaria", inmo.id)
    .eq("merchant_id", inmo.merchant_id)
    .eq("estado_ingreso", "PREAPROBADO");

  const year = new Date().getFullYear();
  const { count } = await supabase
    .from("estudio")
    .select("*", { count: "exact", head: true })
    .ilike("codigo", `EST-${year}-%`);
  let seq = count ?? 0;

  const vig = new Date();
  vig.setDate(vig.getDate() + 30);
  const vigencia = vig.toISOString().slice(0, 10);
  const now = new Date().toISOString();

  const estudios: Record<string, unknown>[] = [];
  for (const r of prime) {
    const documento = String(r.customer_document_number ?? "").trim();
    if (!documento || enFianza.has(documento)) continue;

    // persona: find-or-create y actualiza contacto (nombre/email/tel del modelo).
    const contacto = {
      nombre: r.name ?? null,
      email: r.email ?? null,
      telefono: r.phoneNumber ?? null,
    };
    let idPersona: string;
    const { data: ex } = await supabase
      .from("persona")
      .select("id")
      .eq("documento", documento)
      .maybeSingle();
    if (ex) {
      idPersona = ex.id;
      await supabase.from("persona").update(contacto).eq("id", idPersona);
    } else {
      const { data: n, error: ep } = await supabase
        .from("persona")
        .insert({ documento, tipo_documento: "CC", ...contacto })
        .select("id")
        .single();
      if (ep || !n) continue;
      idPersona = n.id;
    }

    let flags: unknown = [];
    if (Array.isArray(r.risk_flags)) flags = r.risk_flags;
    else if (typeof r.risk_flags === "string") {
      try {
        flags = JSON.parse(r.risk_flags);
      } catch {
        flags = [];
      }
    }

    seq++;
    estudios.push({
      codigo: `EST-${year}-${String(seq).padStart(5, "0")}`,
      tipo_estudio: "PREAPROBACION",
      id_inmobiliaria: inmo.id,
      id_persona: idPersona,
      merchant_id: inmo.merchant_id,
      score: Math.round(Number(r.score) || 0),
      tier: r.tier,
      cupo_max: Math.round(Number(r.max_loan_amount) || 0),
      tasa_sugerida: (Number(r.interest_rate_min) || 0) / 100,
      default_rate: Number(r.expected_default_rate) || null,
      risk_flags: flags,
      score_payload: r,
      estado: "APROBADO",
      decision_fianza: "APROBADO",
      decision_final: true,
      fecha_resultado: now,
      estado_ingreso: "PREAPROBADO",
      vigencia_hasta: vigencia,
      fecha_ingreso_estudio: now,
    });
  }

  if (estudios.length) {
    const { error: ee } = await supabase.from("estudio").insert(estudios);
    if (ee) throw new Error(ee.message);
  }

  revalidatePath("/backoffice/inmobiliarias");
  revalidatePath("/backoffice/estudios");
  return { preaprobados: estudios.length };
}

/**
 * Edita solo los datos de contacto de la inmobiliaria (persona, correo, teléfono).
 * Los datos legales (razón social, NIT, representante…) no se tocan aquí.
 */
export async function editarContacto(
  id: string,
  datos: { persona_contacto: string; email_contacto: string; telefono: string },
) {
  const supabase = getSupabase();
  if (!supabase) {
    throw new Error("Supabase no está configurado. Revisa .env.local");
  }
  if (!id) throw new Error("Falta la inmobiliaria.");

  const { error } = await supabase
    .from("inmobiliaria")
    .update({
      persona_contacto: datos.persona_contacto.trim(),
      email_contacto: datos.email_contacto.trim(),
      telefono: datos.telefono.trim(),
    })
    .eq("id", id);
  if (error) throw new Error(error.message);

  revalidatePath("/backoffice/inmobiliarias");
}
