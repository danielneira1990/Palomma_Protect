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
  let colDoc = -1;
  let colCanon = -1;
  ws.getRow(1).eachCell((cell, col) => {
    const v = String(cell.value ?? "").toLowerCase();
    if (v.includes("inquilino") && v.includes("documento")) colDoc = col;
    if (v.includes("canon")) colCanon = col;
  });
  if (colDoc < 0) {
    return json({
      ok: false,
      errores: ["No encontré la columna 'Inquilino · Documento'. ¿Usaste la plantilla que te dimos?"],
    });
  }

  const subidos = new Set<string>();
  const sinCanon: string[] = [];
  let valorTotal = 0;
  ws.eachRow((row, n) => {
    if (n === 1) return;
    const doc = String(row.getCell(colDoc).value ?? "").trim();
    if (!doc) return;
    subidos.add(doc);
    const canon = colCanon > 0 ? numero(row.getCell(colCanon).value) : 0;
    if (canon <= 0) sinCanon.push(doc);
    else valorTotal += canon;
  });

  // Validación (contraste).
  const errores: string[] = [];
  const faltantes = [...esperados].filter((d) => !subidos.has(d));
  if (faltantes.length) {
    errores.push(
      `Faltan ${faltantes.length} cliente(s) de tu selección (no los borres): ${faltantes.slice(0, 5).join(", ")}${faltantes.length > 5 ? "…" : ""}`,
    );
  }
  const extras = [...subidos].filter((d) => !esperados.has(d));
  if (extras.length) {
    errores.push(
      `Hay ${extras.length} documento(s) que no estaban en tu selección: ${extras.slice(0, 5).join(", ")}${extras.length > 5 ? "…" : ""}`,
    );
  }
  if (sinCanon.length) {
    errores.push(`Falta el canon mensual en ${sinCanon.length} fila(s).`);
  }
  if (subidos.size === 0) errores.push("El Excel no tiene filas de inquilinos con documento.");

  if (errores.length) return json({ ok: false, errores });

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
      updated_at: new Date().toISOString(),
    })
    .eq("id", radicacionId);

  return json({ ok: true, valorAsegurado: Math.round(valorTotal), clientes: subidos.size });
}
