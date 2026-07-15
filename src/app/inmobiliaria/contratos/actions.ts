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

type ContratoRef = {
  id: string;
  id_inmobiliaria: string | null;
  estado: string | null;
  tipo_destino: string | null;
  canon: number | null;
  tasa_canon: number | null;
  inmobiliaria: { razon_social: string | null } | null;
};

/**
 * Solicita el retiro de un contrato. NO es automático: queda en estado SOLICITADA
 * (pendiente) y el contrato sigue ACTIVO hasta que Palomma lo aplique — así hay
 * ventana para actuar ante pérdida de cartera. Al cliente se le dice que se
 * reflejará en las próximas horas (nunca "en revisión").
 */
export async function registrarRetiro(contratoId: string, motivo: string) {
  const supabase = getSupabase();
  if (!supabase) throw new Error("Supabase no está configurado.");
  if (!contratoId) throw new Error("Falta el contrato.");
  if (!MOTIVOS_RETIRO.includes(motivo)) throw new Error("Selecciona un motivo de retiro.");

  const { data } = await supabase
    .from("contrato")
    .select("id, id_inmobiliaria, estado, inmobiliaria(razon_social)")
    .eq("id", contratoId)
    .single();
  const c = data as unknown as ContratoRef | null;
  if (!c) throw new Error("Contrato no encontrado.");
  if (c.estado !== "ACTIVO") throw new Error("El contrato no está activo.");

  const { count: pend } = await supabase
    .from("novedad")
    .select("*", { count: "exact", head: true })
    .eq("id_contrato", contratoId)
    .eq("tipo", "RETIRO")
    .eq("estado", "SOLICITADA");
  if ((pend ?? 0) > 0) throw new Error("Ya hay un retiro en trámite para este contrato.");

  const seq = (await siguienteSeqNovedad(supabase)) + 1;
  await supabase.from("novedad").insert({
    codigo: codigoNovedad(seq),
    id_contrato: contratoId,
    id_inmobiliaria: c.id_inmobiliaria,
    tipo: "RETIRO",
    motivo,
    estado: "SOLICITADA",
    actor: `Inmobiliaria ${c.inmobiliaria?.razon_social ?? ""}`.trim(),
    fecha_vigencia: new Date().toISOString().slice(0, 10),
  });

  revalidatePath("/inmobiliaria/contratos");
}

/**
 * Aumenta el canon de un contrato. En vivienda no puede superar el IPC. Se aplica
 * de inmediato (recalcula la fianza) y deja la novedad de AUMENTO.
 */
export async function registrarAumento(contratoId: string, nuevoCanonInput: string) {
  const supabase = getSupabase();
  if (!supabase) throw new Error("Supabase no está configurado.");
  const nuevoCanon = Math.round(Number(String(nuevoCanonInput).replace(/[^\d]/g, "")));
  if (!contratoId || !Number.isFinite(nuevoCanon) || nuevoCanon <= 0) {
    throw new Error("Escribe un canon válido.");
  }

  const { data } = await supabase
    .from("contrato")
    .select("id, id_inmobiliaria, estado, tipo_destino, canon, tasa_canon, inmobiliaria(razon_social)")
    .eq("id", contratoId)
    .single();
  const c = data as unknown as ContratoRef | null;
  if (!c) throw new Error("Contrato no encontrado.");
  if (c.estado !== "ACTIVO") throw new Error("El contrato no está activo.");
  const canonActual = c.canon ?? 0;
  if (nuevoCanon <= canonActual) throw new Error("El nuevo canon debe ser mayor al actual.");

  const { ipc } = await leerConfig(supabase);
  if ((c.tipo_destino ?? "").toUpperCase() === "VIVIENDA") {
    const tope = Math.round(canonActual * (1 + ipc));
    if (nuevoCanon > tope) {
      throw new Error(
        `En vivienda el aumento no puede superar el IPC (${(ipc * 100).toLocaleString("es-CO", { maximumFractionDigits: 2 })}%). Máximo: $${tope.toLocaleString("es-CO")}.`,
      );
    }
  }

  const tasa = c.tasa_canon ?? 0;
  const costoNeto = Math.round(nuevoCanon * tasa);
  const iva = Math.round(costoNeto * 0.19);
  await supabase
    .from("contrato")
    .update({
      canon: nuevoCanon,
      valor_afianzado_canon: nuevoCanon,
      costo_canon_neto: costoNeto,
      iva_canon_servicio: iva,
      costo_canon_total: costoNeto + iva,
    })
    .eq("id", contratoId);

  const seq = (await siguienteSeqNovedad(supabase)) + 1;
  await supabase.from("novedad").insert({
    codigo: codigoNovedad(seq),
    id_contrato: contratoId,
    id_inmobiliaria: c.id_inmobiliaria,
    tipo: "AUMENTO",
    estado: "APLICADA",
    actor: `Inmobiliaria ${c.inmobiliaria?.razon_social ?? ""}`.trim(),
    payload_anterior: { canon: canonActual },
    payload_nuevo: { canon: nuevoCanon },
    fecha_vigencia: new Date().toISOString().slice(0, 10),
  });

  revalidatePath("/inmobiliaria/contratos");
}
