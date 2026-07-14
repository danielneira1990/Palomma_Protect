export const ETAPAS = [
  "INICIADA",
  "EXCEL_SUBIDO",
  "PAZ_SALVO",
  "FIRMADO",
  "INGRESADA",
] as const;

export type Etapa = (typeof ETAPAS)[number];

/**
 * Los 5 pasos del proceso de inducción, en orden. Modelo self-service: Palomma
 * ya no valida internamente; la declaración de paz y salvo firmada (validada contra
 * la evidencia de AUCO) habilita directamente el ingreso a fianza.
 */
export const PASOS: { etapa: Etapa; titulo: string; hecho: string }[] = [
  { etapa: "INICIADA", titulo: "Radicación iniciada", hecho: "Radicación iniciada" },
  { etapa: "EXCEL_SUBIDO", titulo: "Excel cargado y validado", hecho: "Excel cargado" },
  { etapa: "PAZ_SALVO", titulo: "Paz y salvo generado", hecho: "Paz y salvo generado" },
  { etapa: "FIRMADO", titulo: "Paz y salvo firmado y validado", hecho: "Firmado y validado" },
  { etapa: "INGRESADA", titulo: "Contratos afianzados", hecho: "Afianzados" },
];

export function etapaIndex(etapa: string | null): number {
  // Estados legados (ya no se usan): la validación interna se eliminó.
  if (etapa === "EN_VALIDACION" || etapa === "APROBADA") return 3; // ≈ FIRMADO
  if (etapa === "PENDIENTE_INGRESO") return 4; // ingresado, pendiente del próximo mes
  const i = ETAPAS.indexOf((etapa ?? "") as Etapa);
  return i < 0 ? 0 : i;
}

/** % de avance (la etapa actual cuenta como completada). */
export function etapaProgreso(etapa: string | null): number {
  if (etapa === "CANCELADA") return 0;
  if (etapa === "PENDIENTE_INGRESO") return 95;
  return Math.round(((etapaIndex(etapa) + 1) / ETAPAS.length) * 100);
}

/**
 * Día de corte de ingresos del mes. Antes o el día del corte → ingresa este mes;
 * después → queda pendiente para el ingreso real del mes siguiente.
 * (MVP: constante. Debería venir de calendario_operativo.corte_ingresos.)
 */
export const DIA_CORTE_INGRESOS = 20;

/** Amparo integral de cortesía por contrato para los preaprobados (regalo). */
export const AMPARO_INTEGRAL_CORTESIA = 1_000_000;

/**
 * Tasa de fianza a la que ingresan los contratos (sobre el canon). Es la MISMA
 * tasa que se le muestra al cliente en sus preaprobados ("Tasa preferencial").
 * Fuente única: alimenta la KPI del portal y el resumen del ingreso.
 * MVP: constante; debería venir de la negociación por inmobiliaria.
 */
export const TASA_FIANZA = 0.0135;

/** La tasa de fianza formateada para mostrar (ej. "1,35%"). */
export const TASA_FIANZA_PCT =
  (TASA_FIANZA * 100).toLocaleString("es-CO", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }) + "%";

export function ingresaEsteMes(hoy: Date = new Date()): boolean {
  return hoy.getDate() <= DIA_CORTE_INGRESOS;
}

/** Tiempo transcurrido legible desde una fecha ISO. */
export function tiempoDesde(iso: string | null): string {
  if (!iso) return "—";
  const ms = Date.now() - new Date(iso).getTime();
  const min = Math.floor(ms / 60000);
  if (min < 60) return `hace ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `hace ${h} h`;
  const d = Math.floor(h / 24);
  return `hace ${d} día${d === 1 ? "" : "s"}`;
}
