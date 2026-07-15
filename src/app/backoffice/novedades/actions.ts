"use server";

import { getSupabase } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

const IVA = 0.19;

function sb() {
  const s = getSupabase();
  if (!s) throw new Error("Supabase no está configurado.");
  return s;
}

async function retiro(novedadId: string) {
  const supabase = sb();
  const { data: nov } = await supabase
    .from("novedad")
    .select("id, id_contrato, tipo, estado")
    .eq("id", novedadId)
    .single();
  if (!nov || nov.tipo !== "RETIRO") throw new Error("No es un retiro.");
  return { supabase, nov };
}

/** Aplica el retiro: el contrato pasa a RETIRADO. */
export async function aplicarRetiro(novedadId: string) {
  const { supabase, nov } = await retiro(novedadId);
  if (nov.id_contrato) {
    await supabase.from("contrato").update({ estado: "RETIRADO" }).eq("id", nov.id_contrato);
  }
  await supabase.from("novedad").update({ estado: "APLICADA" }).eq("id", novedadId);
  revalidatePath("/backoffice/novedades");
  revalidatePath("/backoffice/contratos");
}

/** Cancela el retiro (se retuvo): el contrato vuelve a ACTIVO. Invisible para el cliente. */
export async function cancelarRetiro(novedadId: string) {
  const { supabase, nov } = await retiro(novedadId);
  if (nov.id_contrato) {
    await supabase.from("contrato").update({ estado: "ACTIVO" }).eq("id", nov.id_contrato);
  }
  await supabase.from("novedad").update({ estado: "RECHAZADA" }).eq("id", novedadId);
  revalidatePath("/backoffice/novedades");
  revalidatePath("/backoffice/contratos");
}

/** Pausa el retiro mientras se negocia (detiene la ventana de auto-aprobación). */
export async function pausarRetiro(novedadId: string) {
  const { supabase } = await retiro(novedadId);
  await supabase.from("novedad").update({ estado: "PENDIENTE_APROBACION" }).eq("id", novedadId);
  revalidatePath("/backoffice/novedades");
}

/**
 * Retención: mejora los términos del contrato (nueva tasa, amparo integral y/o
 * cláusula penal gratis) para retener a la inmobiliaria. Según `cancelar`, cierra
 * el retiro (retenido) o lo deja pausado mientras se negocia.
 */
export async function aplicarRetencion(
  novedadId: string,
  opts: { nuevaTasaPct?: string; integral?: string; penal?: string; cancelar?: boolean },
) {
  const { supabase, nov } = await retiro(novedadId);
  if (!nov.id_contrato) throw new Error("El retiro no tiene contrato asociado.");
  const { data: c } = await supabase
    .from("contrato")
    .select("id, canon, valor_afianzado_canon, tasa_canon")
    .eq("id", nov.id_contrato)
    .single();
  if (!c) throw new Error("Contrato no encontrado.");

  const update: Record<string, unknown> = {};

  const pct = Number(String(opts.nuevaTasaPct ?? "").replace(",", ".").replace(/[^\d.]/g, ""));
  if (Number.isFinite(pct) && pct > 0) {
    const tasa = pct / 100;
    const base = c.valor_afianzado_canon ?? c.canon ?? 0;
    const neto = Math.round(base * tasa);
    const iva = Math.round(neto * IVA);
    update.tasa_canon = tasa;
    update.costo_canon_neto = neto;
    update.iva_canon_servicio = iva;
    update.costo_canon_total = neto + iva;
  }

  const integral = Math.round(Number(String(opts.integral ?? "").replace(/[^\d]/g, "")));
  if (Number.isFinite(integral) && integral > 0) {
    update.linea_integral = true;
    update.valor_afianzado_integral = integral;
    update.costo_integral_neto = 0;
    update.iva_integral_servicio = 0;
    update.costo_integral_total = 0;
  }

  const penal = Math.round(Number(String(opts.penal ?? "").replace(/[^\d]/g, "")));
  if (Number.isFinite(penal) && penal > 0) {
    update.linea_penal = true;
    update.valor_afianzado_penal = penal;
    update.costo_penal_neto = 0;
    update.iva_penal_servicio = 0;
    update.costo_penal_total = 0;
  }

  // Si se retiene (cancelar), el contrato vuelve a ACTIVO; si solo se pausa para
  // seguir negociando, se mantiene EN_RETIRO.
  if (opts.cancelar) update.estado = "ACTIVO";
  if (Object.keys(update).length) {
    await supabase.from("contrato").update(update).eq("id", c.id);
  }

  await supabase
    .from("novedad")
    .update({ estado: opts.cancelar ? "RECHAZADA" : "PENDIENTE_APROBACION" })
    .eq("id", novedadId);

  revalidatePath("/backoffice/novedades");
  revalidatePath("/backoffice/contratos");
}
