"use server";

import { getSupabase } from "@/lib/supabase/server";
import { enviarCorreo } from "@/lib/email/client";
import { correoAprobado } from "@/lib/email/proceso";
import { revalidatePath } from "next/cache";

/**
 * Visto bueno del analista: valida los documentos y la firma, y aprueba la
 * radicación (etapa APROBADA). NO ingresa por la inmobiliaria — le avisa por
 * correo para que ella misma haga el ingreso desde su portal.
 */
export async function aprobarRadicacion(id: string) {
  const supabase = getSupabase();
  if (!supabase) {
    throw new Error("Supabase no está configurado. Revisa .env.local");
  }
  if (!id) throw new Error("Falta la radicación.");

  await supabase
    .from("radicacion")
    .update({ etapa: "APROBADA", updated_at: new Date().toISOString() })
    .eq("id", id);

  // Correo "aprobado, ya puedes ingresar" (mejor esfuerzo).
  try {
    const { data: rad } = await supabase
      .from("radicacion")
      .select("id_inmobiliaria, num_clientes")
      .eq("id", id)
      .single();
    if (rad?.id_inmobiliaria) {
      const { data: inmo } = await supabase
        .from("inmobiliaria")
        .select("persona_contacto, email_contacto")
        .eq("id", rad.id_inmobiliaria)
        .single();
      if (inmo?.email_contacto) {
        const portalUrl =
          process.env.PORTAL_URL ?? "http://localhost:3000/inmobiliaria/preaprobados";
        const { subject, html, attachments } = correoAprobado({
          nombreContacto: inmo.persona_contacto ?? "",
          numContratos: rad.num_clientes ?? 0,
          portalUrl,
        });
        await enviarCorreo({ to: inmo.email_contacto, subject, html, attachments });
      }
    }
  } catch (e) {
    console.error("No se pudo enviar el correo de aprobación:", e);
  }

  revalidatePath("/backoffice/procesos");
  revalidatePath("/inmobiliaria/preaprobados");
}
