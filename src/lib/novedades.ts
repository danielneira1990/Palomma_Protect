import type { SupabaseClient } from "@supabase/supabase-js";

/** Siguiente consecutivo de novedad NOV-AAAA-NNN. */
export async function siguienteSeqNovedad(supabase: SupabaseClient): Promise<number> {
  const year = new Date().getFullYear();
  const { count } = await supabase
    .from("novedad")
    .select("*", { count: "exact", head: true })
    .ilike("codigo", `NOV-${year}-%`);
  return count ?? 0;
}

export function codigoNovedad(seq: number): string {
  return `NOV-${new Date().getFullYear()}-${String(seq).padStart(3, "0")}`;
}

/** ISO del primer día del mes actual. */
export function inicioMesISO(hoy: Date = new Date()): string {
  return new Date(hoy.getFullYear(), hoy.getMonth(), 1).toISOString();
}

/**
 * % de contratos retirados este mes para una inmobiliaria.
 * Base = contratos activos + retiros del mes (no rechazados), por número de contratos.
 */
export async function pctRetirosMes(
  supabase: SupabaseClient,
  idInmobiliaria: string,
): Promise<{ pct: number; retirados: number; base: number }> {
  const desde = inicioMesISO();
  const { count: retirados } = await supabase
    .from("novedad")
    .select("*", { count: "exact", head: true })
    .eq("id_inmobiliaria", idInmobiliaria)
    .eq("tipo", "RETIRO")
    .neq("estado", "RECHAZADA")
    .gte("created_at", desde);
  const { count: activos } = await supabase
    .from("contrato")
    .select("*", { count: "exact", head: true })
    .eq("id_inmobiliaria", idInmobiliaria)
    .eq("estado", "ACTIVO");
  const r = retirados ?? 0;
  const base = (activos ?? 0) + r;
  return { pct: base > 0 ? r / base : 0, retirados: r, base };
}

/** Inserta novedades de INGRESO (ya aplicadas) para los contratos recién creados. */
export async function crearNovedadesIngreso(
  supabase: SupabaseClient,
  contratos: { id: string; id_inmobiliaria: string }[],
  actor: string,
): Promise<void> {
  if (contratos.length === 0) return;
  let seq = await siguienteSeqNovedad(supabase);
  const now = new Date().toISOString();
  const filas = contratos.map((c) => {
    seq++;
    return {
      codigo: codigoNovedad(seq),
      id_contrato: c.id,
      id_inmobiliaria: c.id_inmobiliaria,
      tipo: "INGRESO",
      estado: "APLICADA",
      actor,
      fecha_vigencia: now.slice(0, 10),
    };
  });
  await supabase.from("novedad").insert(filas);
}
