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
 * Tasa de fianza (sobre el canon) por sucursal, como default. La tasa real vive
 * en inmobiliaria.tasa_canon (editable en su modal); si está vacía, se usa el
 * default de la sucursal, y si la sucursal no está mapeada, TASA_FIANZA_DEFAULT.
 * Es la MISMA tasa que ve el cliente en sus preaprobados ("Tasa preferencial").
 */
export const SUCURSAL_TASA: Record<string, number> = {
  "Medellín": 0.0135,
  "Bogotá": 0.0204,
};

/** Default para las sucursales no mapeadas (Barranquilla, Cali, etc.). */
export const TASA_FIANZA_DEFAULT = 0.0166;

/** Tasa por defecto de una sucursal. */
export function tasaSucursal(sucursal: string | null | undefined): number {
  return SUCURSAL_TASA[(sucursal ?? "").trim()] ?? TASA_FIANZA_DEFAULT;
}

/** Tasa de fianza efectiva de una inmobiliaria: la suya, o el default de su sucursal. */
export function tasaFianzaInmo(inmo: {
  tasa_canon: number | null;
  sucursal: string | null;
}): number {
  return inmo.tasa_canon ?? tasaSucursal(inmo.sucursal);
}

/** Formatea una tasa decimal como porcentaje colombiano (0.0135 → "1,35%"). */
export function fmtTasaPct(tasa: number): string {
  return (
    (tasa * 100).toLocaleString("es-CO", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }) + "%"
  );
}

export function ingresaEsteMes(hoy: Date = new Date(), dia: number = DIA_CORTE_INGRESOS): boolean {
  return hoy.getDate() <= dia;
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
