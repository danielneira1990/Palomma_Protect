import ExcelJS from "exceljs";
import { getSupabase } from "@/lib/supabase/server";
import { carpetaRadicacion } from "@/lib/radicacionDrive";
import { subirArchivo } from "@/lib/google/drive";

function json(obj: unknown) {
  return new Response(JSON.stringify(obj), {
    headers: { "Content-Type": "application/json" },
  });
}

function numero(v: unknown): number {
  if (typeof v === "number") return v;
  const n = Number(String(v ?? "").replace(/[^\d.-]/g, ""));
  return Number.isFinite(n) ? n : 0;
}

/** Parsea una fecha de una celda (Date de Excel, ISO, o dd/mm/aaaa). */
function fecha(v: unknown): Date | null {
  if (v instanceof Date) return isNaN(v.getTime()) ? null : v;
  const s = String(v ?? "").trim();
  if (!s) return null;
  const dmy = s.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})$/);
  if (dmy) {
    const [, d, m, y] = dmy;
    const year = y.length === 2 ? 2000 + Number(y) : Number(y);
    const dt = new Date(year, Number(m) - 1, Number(d));
    return isNaN(dt.getTime()) ? null : dt;
  }
  const dt = new Date(s);
  return isNaN(dt.getTime()) ? null : dt;
}

// Rango sano del canon mensual (COP). Fuera de esto, se pide revisar.
const CANON_MIN = 200_000;
const CANON_MAX = 100_000_000;

export async function POST(request: Request) {
  const supabase = getSupabase();
  if (!supabase) return json({ ok: false, errores: ["Supabase no está configurado."] });

  const form = await request.formData();
  const file = form.get("archivo");
  const radicacionId = String(form.get("radicacionId") ?? "");
  if (!(file instanceof File) || file.size === 0 || !radicacionId) {
    return json({ ok: false, errores: ["Falta el archivo o la radicación."] });
  }

  // Documentos esperados = los clientes de esta radicación.
  const { data: estRaw } = await supabase
    .from("estudio")
    .select("persona(documento)")
    .eq("id_radicacion", radicacionId);
  const esperados = new Set(
    ((estRaw ?? []) as unknown as { persona: { documento: string | null } | null }[])
      .map((e) => e.persona?.documento)
      .filter((d): d is string => !!d),
  );

  // Parsear el Excel.
  const buf = Buffer.from(await file.arrayBuffer());
  let ws: ExcelJS.Worksheet | undefined;
  try {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buf as unknown as Parameters<typeof wb.xlsx.load>[0]);
    ws = wb.worksheets[0];
  } catch {
    return json({ ok: false, errores: ["No pude leer el Excel. ¿Es el archivo correcto?"] });
  }
  if (!ws) return json({ ok: false, errores: ["El archivo no tiene hojas."] });

  // Ubicar columnas por su encabezado.
  const col = { doc: -1, canon: -1, fini: -1, ffin: -1, destino: -1, direccion: -1 };
  ws.getRow(1).eachCell((cell, c) => {
    const v = String(cell.value ?? "").toLowerCase();
    if (v.includes("inquilino") && v.includes("documento")) col.doc = c;
    else if (v.includes("canon")) col.canon = c;
    else if (v.includes("fecha") && v.includes("inicio")) col.fini = c;
    else if (v.includes("fecha") && v.includes("fin")) col.ffin = c;
    else if (v.includes("tipo") && v.includes("destino")) col.destino = c;
    else if (v.includes("direcci")) col.direccion = c;
  });
  if (col.doc < 0) {
    return json({
      ok: false,
      errores: ["No encontré la columna 'Inquilino · Documento'. ¿Usaste la plantilla que te dimos?"],
    });
  }

  const subidos = new Set<string>();
  const duplicados = new Set<string>();
  const sinCanon: string[] = [];
  const canonRaro: string[] = [];
  const sinDestino: string[] = [];
  const destinoInvalido: string[] = [];
  const sinDireccion: string[] = [];
  const sinFechas: string[] = [];
  const fechasIncoherentes: string[] = [];
  let valorTotal = 0;

  ws.eachRow((row, n) => {
    if (n === 1) return;
    const doc = String(row.getCell(col.doc).value ?? "").trim();
    if (!doc) return;
    if (subidos.has(doc)) duplicados.add(doc);
    subidos.add(doc);

    // Canon
    const canon = col.canon > 0 ? numero(row.getCell(col.canon).value) : 0;
    if (canon <= 0) sinCanon.push(doc);
    else {
      valorTotal += canon;
      if (canon < CANON_MIN || canon > CANON_MAX) canonRaro.push(doc);
    }

    // Tipo destino
    if (col.destino > 0) {
      const d = String(row.getCell(col.destino).value ?? "").trim().toLowerCase();
      if (!d) sinDestino.push(doc);
      else if (!d.startsWith("vivienda") && !d.startsWith("comercio")) destinoInvalido.push(doc);
    }

    // Dirección
    if (col.direccion > 0 && !String(row.getCell(col.direccion).value ?? "").trim()) {
      sinDireccion.push(doc);
    }

    // Fechas del contrato
    if (col.fini > 0 && col.ffin > 0) {
      const fi = fecha(row.getCell(col.fini).value);
      const ff = fecha(row.getCell(col.ffin).value);
      if (!fi || !ff) sinFechas.push(doc);
      else if (ff.getTime() <= fi.getTime()) fechasIncoherentes.push(doc);
    }
  });

  // Validación (contraste).
  const errores: string[] = [];
  const lista = (ds: string[]) => `${ds.slice(0, 5).join(", ")}${ds.length > 5 ? "…" : ""}`;

  const faltantes = [...esperados].filter((d) => !subidos.has(d));
  if (faltantes.length) {
    errores.push(`Faltan ${faltantes.length} cliente(s) de tu selección (no los borres): ${lista(faltantes)}`);
  }
  const extras = [...subidos].filter((d) => !esperados.has(d));
  if (extras.length) {
    errores.push(`Hay ${extras.length} documento(s) que no estaban en tu selección: ${lista(extras)}`);
  }
  if (duplicados.size) {
    // Solo el inquilino no puede repetirse; los codeudores sí pueden aparecer
    // varias veces (una persona puede ser codeudor de varios contratos).
    errores.push(
      `Hay inquilino(s) repetido(s) en el archivo (cada arrendatario va una sola vez; los codeudores sí pueden repetirse): ${lista([...duplicados])}`,
    );
  }
  if (sinCanon.length) errores.push(`Falta el canon mensual en ${sinCanon.length} fila(s): ${lista(sinCanon)}`);
  if (canonRaro.length)
    errores.push(`Revisa el canon (fuera de rango) en ${canonRaro.length} fila(s): ${lista(canonRaro)}`);
  if (sinDestino.length) errores.push(`Falta el tipo de destino en ${sinDestino.length} fila(s): ${lista(sinDestino)}`);
  if (destinoInvalido.length)
    errores.push(`Tipo de destino debe ser Vivienda o Comercio en: ${lista(destinoInvalido)}`);
  if (sinDireccion.length)
    errores.push(`Falta la dirección del inmueble en ${sinDireccion.length} fila(s): ${lista(sinDireccion)}`);
  if (sinFechas.length)
    errores.push(`Faltan/no se entienden las fechas del contrato en ${sinFechas.length} fila(s): ${lista(sinFechas)}`);
  if (fechasIncoherentes.length)
    errores.push(`La fecha fin debe ser posterior a la de inicio en: ${lista(fechasIncoherentes)}`);
  if (subidos.size === 0) errores.push("El Excel no tiene filas de inquilinos con documento.");

  if (errores.length) {
    // Registra el rebote para que el backoffice lo vea y pueda ayudar al cliente.
    await supabase
      .from("radicacion")
      .update({
        ultimo_error: `Excel: ${errores.join(" · ")}`,
        ultimo_error_at: new Date().toISOString(),
      })
      .eq("id", radicacionId);
    return json({ ok: false, errores });
  }

  // Válido → guardar el Excel en la carpeta de la radicación + avanzar etapa.
  let excelKey: string | null = null;
  try {
    const folder = await carpetaRadicacion(supabase, radicacionId);
    if (folder) {
      const up = await subirArchivo(
        folder,
        `Radicacion completada — ${new Date().toISOString().slice(0, 10)}.xlsx`,
        buf,
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      );
      excelKey = up?.link ?? up?.id ?? null;
    }
  } catch (e) {
    console.error("No se pudo guardar el Excel en Drive:", e);
  }

  await supabase
    .from("radicacion")
    .update({
      etapa: "EXCEL_SUBIDO",
      valor_asegurado: Math.round(valorTotal),
      num_clientes: subidos.size,
      excel_key: excelKey,
      ultimo_error: null, // pasó la validación → limpia el rebote anterior
      ultimo_error_at: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", radicacionId);

  return json({ ok: true, valorAsegurado: Math.round(valorTotal), clientes: subidos.size });
}
