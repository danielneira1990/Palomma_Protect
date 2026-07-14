"use server";

import { getSupabase } from "@/lib/supabase/server";
import { enviarCorreo, destinatarios } from "@/lib/email/client";
import { correoCancelacion, correoIngreso } from "@/lib/email/proceso";
import { ingresaEsteMes } from "@/lib/radicacion";
import { revalidatePath } from "next/cache";

/**
 * Afianza (ingresa a fianza) los preaprobados seleccionados.
 * MVP: marca estado_ingreso = INGRESADO. En la Parte 2 esto pasará por el
 * flujo de documentos prellenados + firma del paz y salvo antes de ingresar.
 */
export async function afianzarSeleccionados(ids: string[]) {
  const supabase = getSupabase();
  if (!supabase) {
    throw new Error("Supabase no está configurado. Revisa .env.local");
  }
  if (!ids || ids.length === 0) return;

  const { error } = await supabase
    .from("estudio")
    .update({ estado_ingreso: "INGRESADO", fecha_ingreso: new Date().toISOString() })
    .in("id", ids);
  if (error) throw new Error(error.message);

  revalidatePath("/inmobiliaria/preaprobados");
}

/**
 * Cancela un proceso de radicación: libera los preaprobados (vuelven a estar
 * disponibles) y deja la radicación marcada como CANCELADA para el backoffice.
 */
export async function cancelarRadicacion(id: string) {
  const supabase = getSupabase();
  if (!supabase) {
    throw new Error("Supabase no está configurado. Revisa .env.local");
  }
  if (!id) throw new Error("Falta la radicación.");

  // No se desvincula: se conserva el histórico de clientes para el backoffice.
  // Los preaprobados de una radicación CANCELADA vuelven a estar disponibles
  // (ver el filtro en la página del portal).
  const { data: rad } = await supabase
    .from("radicacion")
    .select("id_inmobiliaria")
    .eq("id", id)
    .single();

  const { error } = await supabase
    .from("radicacion")
    .update({ etapa: "CANCELADA", updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw new Error(error.message);

  // Correo de cancelación (mejor esfuerzo).
  try {
    if (rad?.id_inmobiliaria) {
      const { data: inmo } = await supabase
        .from("inmobiliaria")
        .select("razon_social, persona_contacto, email_contacto, email_representante")
        .eq("id", rad.id_inmobiliaria)
        .single();
      const to = destinatarios(inmo?.email_contacto, inmo?.email_representante);
      if (to) {
        const { subject, html, attachments } = correoCancelacion({
          nombreContacto: inmo?.persona_contacto ?? "",
        });
        await enviarCorreo({ to, subject, html, attachments });
      }
    }
  } catch (e) {
    console.error("No se pudo enviar el correo de cancelación:", e);
  }

  revalidatePath("/inmobiliaria/preaprobados");
}

/**
 * Ingreso a fianza — lo hace la inmobiliaria tras el visto bueno del analista.
 * Depende del corte del mes: hasta el corte ingresa ya (INGRESADA); después
 * queda PENDIENTE_INGRESO para el ingreso real del próximo mes.
 */
export async function ingresarRadicacion(id: string) {
  const supabase = getSupabase();
  if (!supabase) {
    throw new Error("Supabase no está configurado. Revisa .env.local");
  }
  if (!id) throw new Error("Falta la radicación.");

  const esteMes = ingresaEsteMes();
  const now = new Date().toISOString();
  if (esteMes) {
    await supabase
      .from("estudio")
      .update({ estado_ingreso: "INGRESADO", fecha_ingreso: now })
      .eq("id_radicacion", id);
    await supabase.from("radicacion").update({ etapa: "INGRESADA", updated_at: now }).eq("id", id);
  } else {
    await supabase
      .from("radicacion")
      .update({ etapa: "PENDIENTE_INGRESO", updated_at: now })
      .eq("id", id);
  }

  // Correo de cierre (mejor esfuerzo).
  try {
    const { data: rad } = await supabase
      .from("radicacion")
      .select("id_inmobiliaria, num_clientes")
      .eq("id", id)
      .single();
    if (rad?.id_inmobiliaria) {
      const { data: inmo } = await supabase
        .from("inmobiliaria")
        .select("persona_contacto, email_contacto, email_representante")
        .eq("id", rad.id_inmobiliaria)
        .single();
      const to = destinatarios(inmo?.email_contacto, inmo?.email_representante);
      if (to) {
        const { subject, html, attachments } = correoIngreso(
          { nombreContacto: inmo?.persona_contacto ?? "", numContratos: rad.num_clientes ?? 0 },
          esteMes,
        );
        await enviarCorreo({ to, subject, html, attachments });
      }
    }
  } catch (e) {
    console.error("No se pudo enviar el correo de cierre:", e);
  }

  revalidatePath("/inmobiliaria/preaprobados");
}
