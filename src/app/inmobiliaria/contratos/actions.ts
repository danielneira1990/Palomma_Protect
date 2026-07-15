"use server";

import { getSupabase } from "@/lib/supabase/server";
import { leerConfig } from "@/lib/config";
import { siguienteSeqNovedad, codigoNovedad } from "@/lib/novedades";
import { revalidatePath } from "next/cache";

const MOTIVOS_RETIRO = [
  "TERMINACION_VENCIMIENTO",
  "MUTUO_ACUERDO",
  "INCUMPLIMIENTO_ARRENDATARIO",
  "VENTA_INMUEBLE",
  "TRASLADO_AFIANZADORA",
  "OTRO",
];
const IVA = 0.19;

type CtoRef = {
  id: string;
  id_inmobiliaria: string | null;
  estado: string | null;
  tipo_destino: string | null;
  canon: number | null;
  tasa_canon: number | null;
  inmobiliaria: { razon_social: string | null } | null;
};

/**
 * Solicita el retiro de uno o varios contratos. NO es automático: cada retiro
 * queda SOLICITADA (pendiente) y el contrato sigue ACTIVO hasta que Palomma lo
 * aplique — ventana para retener. Al cliente se le dice que se refleja en las
 * próximas horas (nunca "en revisión").
 */
export async function registrarRetiroMasivo(
  contratoIds: string[],
  motivo: string,
): Promise<{ solicitados: number; omitidos: number }> {
  const supabase = getSupabase();
  if (!supabase) throw new Error("Supabase no está configurado.");
  if (!MOTIVOS_RETIRO.includes(motivo)) throw new Error("Selecciona un motivo de retiro.");
  if (!contratoIds.length) throw new Error("Selecciona al menos un contrato.");

  const { data } = await supabase
    .from("contrato")
    .select("id, id_inmobiliaria, estado, inmobiliaria(razon_social)")
    .in("id", contratoIds)
    .eq("estado", "ACTIVO");
  const contratos = (data ?? []) as unknown as CtoRef[];

  // Excluir los que ya tienen un retiro pendiente.
  const { data: pend } = await supabase
    .from("novedad")
    .select("id_contrato")
    .in("id_contrato", contratoIds)
    .eq("tipo", "RETIRO")
    .eq("estado", "SOLICITADA");
  const yaPendiente = new Set(((pend ?? []) as { id_contrato: string | null }[]).map((p) => p.id_contrato));

  const elegibles = contratos.filter((c) => !yaPendiente.has(c.id));
  if (!elegibles.length) return { solicitados: 0, omitidos: contratoIds.length };

  let seq = await siguienteSeqNovedad(supabase);
  const hoy = new Date().toISOString().slice(0, 10);
  const filas = elegibles.map((c) => {
    seq++;
    return {
      codigo: codigoNovedad(seq),
      id_contrato: c.id,
      id_inmobiliaria: c.id_inmobiliaria,
      tipo: "RETIRO",
      motivo,
      estado: "SOLICITADA",
      actor: `Inmobiliaria ${c.inmobiliaria?.razon_social ?? ""}`.trim(),
      fecha_vigencia: hoy,
    };
  });
  await supabase.from("novedad").insert(filas);

  // Estado intermedio: no sale de una, queda "en retiro" hasta aplicar/cancelar.
  await supabase
    .from("contrato")
    .update({ estado: "EN_RETIRO" })
    .in(
      "id",
      elegibles.map((c) => c.id),
    );

  revalidatePath("/inmobiliaria/contratos");
  return { solicitados: elegibles.length, omitidos: contratoIds.length - elegibles.length };
}

/**
 * Aumenta el canon de uno o varios contratos en un %. En vivienda se topa al IPC
 * (si el % pedido lo supera, se aplica el IPC). Se aplica de inmediato y deja la
 * novedad de AUMENTO por cada contrato.
 */
export async function registrarAumentoMasivo(
  contratoIds: string[],
  pctInput: string,
): Promise<{ aplicados: number; topados: number }> {
  const supabase = getSupabase();
  if (!supabase) throw new Error("Supabase no está configurado.");
  if (!contratoIds.length) throw new Error("Selecciona al menos un contrato.");
  const pct = Number(String(pctInput).replace(",", ".").replace(/[^\d.]/g, "")) / 100;
  if (!Number.isFinite(pct) || pct <= 0) throw new Error("Escribe un % de aumento válido.");

  const { data } = await supabase
    .from("contrato")
    .select("id, id_inmobiliaria, estado, tipo_destino, canon, tasa_canon, inmobiliaria(razon_social)")
    .in("id", contratoIds)
    .eq("estado", "ACTIVO");
  const contratos = (data ?? []) as unknown as CtoRef[];

  const { ipc } = await leerConfig(supabase);
  let seq = await siguienteSeqNovedad(supabase);
  const hoy = new Date().toISOString().slice(0, 10);
  const novedades: Record<string, unknown>[] = [];
  let aplicados = 0;
  let topados = 0;

  for (const c of contratos) {
    const esVivienda = (c.tipo_destino ?? "").toUpperCase() === "VIVIENDA";
    const efectivo = esVivienda ? Math.min(pct, ipc) : pct;
    const canonActual = c.canon ?? 0;
    if (efectivo <= 0 || canonActual <= 0) continue;
    if (esVivienda && pct > ipc) topados++;

    const nuevoCanon = Math.round(canonActual * (1 + efectivo));
    if (nuevoCanon <= canonActual) continue;
    const tasa = c.tasa_canon ?? 0;
    const costoNeto = Math.round(nuevoCanon * tasa);
    const iva = Math.round(costoNeto * IVA);
    await supabase
      .from("contrato")
      .update({
        canon: nuevoCanon,
        valor_afianzado_canon: nuevoCanon,
        costo_canon_neto: costoNeto,
        iva_canon_servicio: iva,
        costo_canon_total: costoNeto + iva,
      })
      .eq("id", c.id);

    seq++;
    novedades.push({
      codigo: codigoNovedad(seq),
      id_contrato: c.id,
      id_inmobiliaria: c.id_inmobiliaria,
      tipo: "AUMENTO",
      estado: "APLICADA",
      actor: `Inmobiliaria ${c.inmobiliaria?.razon_social ?? ""}`.trim(),
      payload_anterior: { canon: canonActual },
      payload_nuevo: { canon: nuevoCanon },
      fecha_vigencia: hoy,
    });
    aplicados++;
  }

  if (novedades.length) await supabase.from("novedad").insert(novedades);

  revalidatePath("/inmobiliaria/contratos");
  return { aplicados, topados };
}
