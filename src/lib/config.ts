import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Parámetros de configuración de Palomma Protect (tabla `parametro`, clave-valor).
 * Editables desde el backoffice; con defaults por si no están sembrados.
 */
export type Config = {
  ipc: number; // decimal (0.062 = 6,2%): tope de aumento de canon en vivienda
  retiroAmarillo: number; // umbral semáforo amarillo (0.025 = 2,5%)
  retiroRojo: number; // umbral semáforo rojo (0.03 = 3%)
  diaCorte: number; // día del mes: cierra novedades/ingresos y se factura
};

export const CONFIG_DEFAULT: Config = {
  ipc: 0,
  retiroAmarillo: 0.025,
  retiroRojo: 0.03,
  diaCorte: 20,
};

export const CONFIG_CLAVES = {
  ipc: "IPC",
  retiroAmarillo: "RETIRO_AMARILLO",
  retiroRojo: "RETIRO_ROJO",
  diaCorte: "DIA_CORTE",
} as const;

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
    diaCorte: num(CONFIG_CLAVES.diaCorte, CONFIG_DEFAULT.diaCorte),
  };
}

export type Semaforo = "verde" | "amarillo" | "rojo";

/** Color del semáforo de retiros según el % y los umbrales configurados. */
export function semaforoRetiros(pct: number, cfg: Config): Semaforo {
  if (pct > cfg.retiroRojo) return "rojo";
  if (pct >= cfg.retiroAmarillo) return "amarillo";
  return "verde";
}
