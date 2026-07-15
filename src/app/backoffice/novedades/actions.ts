"use server";

import { getSupabase } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

/** Aplica un retiro pendiente: el contrato pasa a RETIRADO y la novedad a APLICADA. */
export async function aplicarRetiro(novedadId: string) {
  const supabase = getSupabase();
  if (!supabase) throw new Error("Supabase no está configurado.");
  if (!novedadId) throw new Error("Falta la novedad.");

  const { data: nov } = await supabase
    .from("novedad")
    .select("id, id_contrato, tipo, estado")
    .eq("id", novedadId)
    .single();
  if (!nov) throw new Error("Novedad no encontrada.");
  if (nov.tipo !== "RETIRO" || nov.estado !== "SOLICITADA") {
    throw new Error("No es un retiro pendiente.");
  }

  if (nov.id_contrato) {
    await supabase.from("contrato").update({ estado: "RETIRADO" }).eq("id", nov.id_contrato);
  }
  await supabase.from("novedad").update({ estado: "APLICADA" }).eq("id", novedadId);

  revalidatePath("/backoffice/novedades");
  revalidatePath("/backoffice/contratos");
}

/** Rechaza una novedad pendiente (el contrato sigue como estaba). */
export async function rechazarNovedad(novedadId: string) {
  const supabase = getSupabase();
  if (!supabase) throw new Error("Supabase no está configurado.");
  if (!novedadId) throw new Error("Falta la novedad.");

  await supabase.from("novedad").update({ estado: "RECHAZADA" }).eq("id", novedadId);
  revalidatePath("/backoffice/novedades");
}
