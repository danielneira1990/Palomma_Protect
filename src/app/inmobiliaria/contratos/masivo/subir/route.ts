import ExcelJS from "exceljs";
import { getSupabase } from "@/lib/supabase/server";
import { leerConfig } from "@/lib/config";
import { siguienteSeqNovedad, codigoNovedad } from "@/lib/novedades";

const IVA = 0.19;
const MOTIVO_KEYS = [
  "TERMINACION_VENCIMIENTO",
  "MUTUO_ACUERDO",
  "INCUMPLIMIENTO_ARRENDATARIO",
  "VENTA_INMUEBLE",
  "TRASLADO_AFIANZADORA",
  "OTRO",
];

function json(o: unknown) {
  return new Response(JSON.stringify(o), { headers: { "Content-Type": "application/json" } });
}

function normMotivo(s: string): string {
  const up = s.trim().toUpperCase().replace(/\s+/g, "_");
  if (MOTIVO_KEYS.includes(up)) return up;
  const t = s.toLowerCase();
  if (t.includes("vencim")) return "TERMINACION_VENCIMIENTO";
  if (t.includes("mutuo")) return "MUTUO_ACUERDO";
  if (t.includes("incumpl")) return "INCUMPLIMIENTO_ARRENDATARIO";
  if (t.includes("venta")) return "VENTA_INMUEBLE";
  if (t.includes("traslado")) return "TRASLADO_AFIANZADORA";
  return "OTRO";
}

type Cto = {
  id: string;
  tipo_destino: string | null;
  canon: number | null;
  tasa_canon: number | null;
  id_inmobiliaria: string | null;
  inmobiliaria: { razon_social: string | null } | null;
};

export async function POST(request: Request) {
  const supabase = getSupabase();
  if (!supabase) return json({ ok: false, errores: ["Supabase no está configurado."] });

  const form = await request.formData();
  const file = form.get("archivo");
  if (!(file instanceof File) || file.size === 0) {
    return json({ ok: false, errores: ["Falta el archivo."] });
  }

  // Contratos activos por código.
  const { data: ctos } = await supabase
    .from("contrato")
    .select("id, codigo, tipo_destino, canon, tasa_canon, id_inmobiliaria, inmobiliaria(razon_social)")
    .eq("estado", "ACTIVO");
  const porCodigo = new Map<string, Cto>();
  for (const c of (ctos ?? []) as unknown as (Cto & { codigo: string | null })[]) {
    if (c.codigo) porCodigo.set(c.codigo.trim().toUpperCase(), c);
  }

  // Parsear Excel.
  const buf = Buffer.from(await file.arrayBuffer());
  let ws: ExcelJS.Worksheet | undefined;
  try {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buf as unknown as Parameters<typeof wb.xlsx.load>[0]);
    ws = wb.worksheets[0];
  } catch {
    return json({ ok: false, errores: ["No pude leer el Excel. ¿Es el formato correcto?"] });
  }
  if (!ws) return json({ ok: false, errores: ["El archivo no tiene hojas."] });

  const col = { codigo: -1, accion: -1, pct: -1, motivo: -1 };
  ws.getRow(1).eachCell((cell, c) => {
    const v = String(cell.value ?? "").toLowerCase();
    if (v.includes("contrato")) col.codigo = c;
    else if (v.includes("acci")) col.accion = c;
    else if (v.includes("aumento") || v.includes("%")) col.pct = c;
    else if (v.includes("motivo")) col.motivo = c;
  });
  if (col.codigo < 0 || col.accion < 0) {
    return json({
      ok: false,
      errores: ["No encontré las columnas 'Contrato' y 'Acción'. ¿Usaste el formato que descargaste?"],
    });
  }

  const { ipc } = await leerConfig(supabase);
  const errores: string[] = [];
  const aumentos: { c: Cto; efectivo: number }[] = [];
  const retiros: { c: Cto; motivo: string }[] = [];

  ws.eachRow((row, n) => {
    if (n === 1) return;
    const cod = String(row.getCell(col.codigo).value ?? "").trim().toUpperCase();
    const accion = String(row.getCell(col.accion).value ?? "").trim().toUpperCase();
    if (!cod && !accion) return; // fila vacía
    if (!accion) return; // sin acción → se ignora
    const ref = `${cod || "(sin código)"}`;

    const c = porCodigo.get(cod);
    if (!c) {
      errores.push(`Fila ${n}: el contrato ${ref} no existe o no está activo.`);
      return;
    }
    if (accion === "AUMENTO") {
      const raw = String(col.pct > 0 ? row.getCell(col.pct).value ?? "" : "");
      const pct = Number(raw.replace(",", ".").replace(/[^\d.]/g, "")) / 100;
      if (!Number.isFinite(pct) || pct <= 0) {
        errores.push(`Fila ${n} (${ref}): AUMENTO necesita un % válido.`);
        return;
      }
      const esViv = (c.tipo_destino ?? "").toUpperCase() === "VIVIENDA";
      const efectivo = esViv ? Math.min(pct, ipc) : pct;
      if (efectivo <= 0) {
        errores.push(`Fila ${n} (${ref}): en vivienda el aumento requiere IPC configurado (> 0).`);
        return;
      }
      aumentos.push({ c, efectivo });
    } else if (accion === "RETIRO") {
      const mot = String(col.motivo > 0 ? row.getCell(col.motivo).value ?? "" : "").trim();
      if (!mot) {
        errores.push(`Fila ${n} (${ref}): RETIRO necesita un motivo.`);
        return;
      }
      retiros.push({ c, motivo: normMotivo(mot) });
    } else {
      errores.push(`Fila ${n} (${ref}): acción "${accion}" inválida (usa AUMENTO o RETIRO).`);
    }
  });

  if (errores.length) return json({ ok: false, errores: errores.slice(0, 12) });

  // Procesar aumentos.
  let seq = await siguienteSeqNovedad(supabase);
  const hoy = new Date().toISOString().slice(0, 10);
  const novedades: Record<string, unknown>[] = [];
  for (const { c, efectivo } of aumentos) {
    const canon = c.canon ?? 0;
    if (canon <= 0) continue;
    const nuevo = Math.round(canon * (1 + efectivo));
    const tasa = c.tasa_canon ?? 0;
    const neto = Math.round(nuevo * tasa);
    const iva = Math.round(neto * IVA);
    await supabase
      .from("contrato")
      .update({
        canon: nuevo,
        valor_afianzado_canon: nuevo,
        costo_canon_neto: neto,
        iva_canon_servicio: iva,
        costo_canon_total: neto + iva,
      })
      .eq("id", c.id);
    seq++;
    novedades.push({
      codigo: codigoNovedad(seq),
      id_contrato: c.id,
      id_inmobiliaria: c.id_inmobiliaria,
      tipo: "AUMENTO",
      estado: "APLICADA",
      actor: `Inmobiliaria ${c.inmobiliaria?.razon_social ?? ""}`.trim(),
      payload_anterior: { canon },
      payload_nuevo: { canon: nuevo },
      fecha_vigencia: hoy,
    });
  }

  // Procesar retiros (a estado intermedio + cola).
  const idsRetiro: string[] = [];
  for (const { c, motivo } of retiros) {
    seq++;
    novedades.push({
      codigo: codigoNovedad(seq),
      id_contrato: c.id,
      id_inmobiliaria: c.id_inmobiliaria,
      tipo: "RETIRO",
      motivo,
      estado: "SOLICITADA",
      actor: `Inmobiliaria ${c.inmobiliaria?.razon_social ?? ""}`.trim(),
      fecha_vigencia: hoy,
    });
    idsRetiro.push(c.id);
  }

  if (novedades.length) await supabase.from("novedad").insert(novedades);
  if (idsRetiro.length) {
    await supabase.from("contrato").update({ estado: "EN_RETIRO" }).in("id", idsRetiro);
  }

  return json({ ok: true, aumentos: aumentos.length, retiros: retiros.length });
}
