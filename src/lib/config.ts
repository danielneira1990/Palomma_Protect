import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Parámetros de configuración de Palomma Protect (tabla `parametro`, clave-valor).
 * Editables desde el backoffice; con defaults por si no están sembrados.
 */
export type Config = {
  ipc: number; // decimal (0.062 = 6,2%): tope de aumento de canon en vivienda
  retiroAmarillo: number; // umbral semáforo amarillo (0.025 = 2,5%)
  retiroRojo: number; // umbral semáforo rojo (0.03 = 3%)
  ventanaRetiroHoras: number; // horas para actuar antes de que el retiro se apruebe solo
};

export const CONFIG_DEFAULT: Config = {
  ipc: 0,
  retiroAmarillo: 0.025,
  retiroRojo: 0.03,
  ventanaRetiroHoras: 24,
};

export const CONFIG_CLAVES = {
  ipc: "IPC",
  retiroAmarillo: "RETIRO_AMARILLO",
  retiroRojo: "RETIRO_ROJO",
  ventanaRetiroHoras: "VENTANA_RETIRO_HORAS",
} as const;

/** Día de corte por defecto si el mes no está en el calendario. */
export const DIA_CORTE_DEFAULT = 20;

export async function leerConfig(supabase: SupabaseClient): Promise<Config> {
  const { data } = await supabase.from("parametro").select("clave, valor");
  const map = new Map(
    ((data ?? []) as { clave: string | null; valor: string | null }[]).map((p) => [p.clave, p.valor]),
  );
  const num = (k: string, d: number) => {
    const v = Number(map.get(k));
    return Number.isFinite(v) ? v : d;
  };
  return {
    ipc: num(CONFIG_CLAVES.ipc, CONFIG_DEFAULT.ipc),
    retiroAmarillo: num(CONFIG_CLAVES.retiroAmarillo, CONFIG_DEFAULT.retiroAmarillo),
    retiroRojo: num(CONFIG_CLAVES.retiroRojo, CONFIG_DEFAULT.retiroRojo),
    ventanaRetiroHoras: num(CONFIG_CLAVES.ventanaRetiroHoras, CONFIG_DEFAULT.ventanaRetiroHoras),
  };
}

/**
 * Día de corte del mes (cierra novedades/ingresos y se factura), leído del
 * calendario operativo del periodo actual. Si el mes no está configurado, usa
 * el default.
 */
export async function diaCorteDelMes(
  supabase: SupabaseClient,
  hoy: Date = new Date(),
): Promise<number> {
  const periodo = `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, "0")}`;
  const { data } = await supabase
    .from("calendario_operativo")
    .select("corte_ingresos")
    .eq("periodo", periodo)
    .maybeSingle();
  const corte = data?.corte_ingresos as string | null | undefined;
  if (corte) {
    const d = new Date(corte);
    if (!isNaN(d.getTime())) return d.getUTCDate();
  }
  return DIA_CORTE_DEFAULT;
}

export type Semaforo = "verde" | "amarillo" | "rojo";

/** Color del semáforo de retiros según el % y los umbrales configurados. */
export function semaforoRetiros(pct: number, cfg: Config): Semaforo {
  if (pct > cfg.retiroRojo) return "rojo";
  if (pct >= cfg.retiroAmarillo) return "amarillo";
  return "verde";
}
