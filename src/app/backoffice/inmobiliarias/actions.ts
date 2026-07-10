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
    representante_legal: String(formData.get("representante_legal") ?? "").trim(),
    cc_representante: String(formData.get("cc_representante") ?? "").trim(),
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
    }
  } catch (e) {
    // No bloquea la creación; se registra para revisión.
    console.error("Error generando el Contrato Marco:", e);
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

/** Envía (o reenvía) manualmente el correo de bienvenida a la inmobiliaria. */
export async function enviarBienvenida(id: string) {
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

  await mandarBienvenida(supabase, inmo);
  revalidatePath("/backoffice/inmobiliarias");
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
