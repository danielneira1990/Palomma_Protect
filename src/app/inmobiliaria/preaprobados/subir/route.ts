import ExcelJS from "exceljs";
import { getSupabase } from "@/lib/supabase/server";
import { carpetaRadicacion } from "@/lib/radicacionDrive";
import { subirArchivo } from "@/lib/google/drive";
import type { FilaContrato, PersonaFila } from "@/lib/contratos";

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

/** Parsea una fecha de celda (Date de Excel, ISO, o dd/mm/aaaa) → ISO date. */
function fechaISO(v: unknown): string | null {
  let d: Date | null = null;
  if (v instanceof Date) d = isNaN(v.getTime()) ? null : v;
  else {
    const s = String(v ?? "").trim();
    if (s) {
      const dmy = s.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})$/);
      if (dmy) {
        const [, dd, mm, yy] = dmy;
        const year = yy.length === 2 ? 2000 + Number(yy) : Number(yy);
        const dt = new Date(year, Number(mm) - 1, Number(dd));
        d = isNaN(dt.getTime()) ? null : dt;
      } else {
        const dt = new Date(s);
        d = isNaN(dt.getTime()) ? null : dt;
      }
    }
  }
  return d ? d.toISOString().slice(0, 10) : null;
}

/** Clasifica un encabezado del Excel a una llave lógica. */
function keyFor(h: string): string | null {
  const v = h.toLowerCase().trim();
  for (const [needle, pre] of [
    ["inquilino", "inq"],
    ["codeudor 1", "c1"],
    ["codeudor 2", "c2"],
    ["codeudor 3", "c3"],
  ] as const) {
    if (v.includes(needle)) {
      if (v.includes("nombre")) return `${pre}_nombre`;
      if (v.includes("tipo")) return `${pre}_tipo`;
      if (v.includes("documento")) return `${pre}_doc`;
      if (v.includes("celular")) return `${pre}_cel`;
      if (v.includes("correo")) return `${pre}_correo`;
      return null;
    }
  }
  if (v.includes("contrato")) return "no_contrato";
  if (v.includes("fecha") && v.includes("inicio")) return "fecha_inicio";
  if (v.includes("fecha") && v.includes("fin")) return "fecha_fin";
  if (v.includes("tipo") && v.includes("destino")) return "tipo_destino";
  if (v.includes("meses")) return "meses";
  if (v.includes("ciudad")) return "ciudad";
  if (v.includes("direcci")) return "direccion";
  if (v.includes("canon")) return "canon";
  if (v.includes("administ")) return "admin";
  if (v === "iva") return "iva";
  return null;
}

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

  // Mapa encabezado → columna.
  const col: Record<string, number> = {};
  ws.getRow(1).eachCell((cell, c) => {
    const k = keyFor(String(cell.value ?? ""));
    if (k) col[k] = c;
  });
  if (col.inq_doc == null) {
    return json({
      ok: false,
      errores: ["No encontré la columna 'Inquilino · Documento'. ¿Usaste la plantilla que te dimos?"],
    });
  }

  const txt = (row: ExcelJS.Row, key: string) =>
    col[key] != null ? String(row.getCell(col[key]).value ?? "").trim() : "";
  const num = (row: ExcelJS.Row, key: string) => (col[key] != null ? numero(row.getCell(col[key]).value) : 0);

  function personaDe(row: ExcelJS.Row, pre: string): PersonaFila {
    return {
      nombre: txt(row, `${pre}_nombre`),
      tipo: txt(row, `${pre}_tipo`) || "CC",
      doc: txt(row, `${pre}_doc`),
      cel: txt(row, `${pre}_cel`),
      correo: txt(row, `${pre}_correo`),
    };
  }

  const filas: FilaContrato[] = [];
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
    const doc = txt(row, "inq_doc");
    if (!doc) return;
    if (subidos.has(doc)) duplicados.add(doc);
    subidos.add(doc);

    const canon = num(row, "canon");
    if (canon <= 0) sinCanon.push(doc);
    else {
      valorTotal += canon;
      if (canon < CANON_MIN || canon > CANON_MAX) canonRaro.push(doc);
    }

    const destino = txt(row, "tipo_destino").toLowerCase();
    if (col.tipo_destino != null) {
      if (!destino) sinDestino.push(doc);
      else if (!destino.startsWith("vivienda") && !destino.startsWith("comercio")) destinoInvalido.push(doc);
    }

    if (col.direccion != null && !txt(row, "direccion")) sinDireccion.push(doc);

    const fi = fechaISO(col.fecha_inicio != null ? row.getCell(col.fecha_inicio).value : null);
    const ff = fechaISO(col.fecha_fin != null ? row.getCell(col.fecha_fin).value : null);
    if (col.fecha_inicio != null && col.fecha_fin != null) {
      if (!fi || !ff) sinFechas.push(doc);
      else if (new Date(ff).getTime() <= new Date(fi).getTime()) fechasIncoherentes.push(doc);
    }

    const codeudores = ["c1", "c2", "c3"]
      .map((p) => personaDe(row, p))
      .filter((c) => c.doc); // solo codeudores con documento

    filas.push({
      no_contrato: txt(row, "no_contrato"),
      fecha_inicio: fi,
      fecha_fin: ff,
      tipo_destino: destino.startsWith("comercio") ? "COMERCIO" : "VIVIENDA",
      meses: num(row, "meses"),
      ciudad: txt(row, "ciudad"),
      direccion: txt(row, "direccion"),
      canon,
      admin: num(row, "admin"),
      iva: num(row, "iva"),
      inquilino: personaDe(row, "inq"),
      codeudores,
    });
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
    await supabase
      .from("radicacion")
      .update({
        ultimo_error: `Excel: ${errores.join(" · ")}`,
        ultimo_error_at: new Date().toISOString(),
      })
      .eq("id", radicacionId);
    return json({ ok: false, errores });
  }

  // Válido → guardar el Excel en Drive + persistir el detalle + avanzar etapa.
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
      detalle: filas,
      ultimo_error: null,
      ultimo_error_at: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", radicacionId);

  return json({ ok: true, valorAsegurado: Math.round(valorTotal), clientes: subidos.size });
}
