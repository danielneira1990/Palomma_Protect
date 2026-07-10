/** Formatea un valor en pesos (entero) a "$ 1.234.567". */
export function money(n: number | null | undefined): string {
  return "$ " + (Number(n) || 0).toLocaleString("es-CO");
}

/** Formatea una fecha ISO a dd/mm/aaaa. */
export function fecha(d: string | null | undefined): string {
  if (!d) return "—";
  const date = new Date(d);
  if (isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("es-CO");
}

/** Formatea una fecha a "9 de julio de 2026" (para textos legales). */
export function fechaLarga(d: Date): string {
  return d.toLocaleDateString("es-CO", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

export const SUCURSALES = [
  "Barranquilla",
  "Bogotá",
  "Bucaramanga",
  "Cali",
  "Cartagena",
  "Medellín",
  "Pereira",
] as const;
