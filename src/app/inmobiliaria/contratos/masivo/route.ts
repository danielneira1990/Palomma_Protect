import ExcelJS from "exceljs";
import { getSupabase } from "@/lib/supabase/server";

/** Descarga el formato de administración masiva con los contratos activos. */
export async function POST() {
  const supabase = getSupabase();
  if (!supabase) return new Response("Supabase no está configurado.", { status: 500 });

  const { data } = await supabase
    .from("contrato")
    .select("codigo, canon, tipo_destino, estudio(persona(nombre))")
    .eq("estado", "ACTIVO")
    .order("codigo");
  const rows = (data ?? []) as unknown as {
    codigo: string | null;
    canon: number | null;
    tipo_destino: string | null;
    estudio: { persona: { nombre: string | null } | null } | null;
  }[];

  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Administración");
  ws.columns = [
    { header: "Contrato", key: "codigo", width: 18 },
    { header: "Arrendatario", key: "arr", width: 28 },
    { header: "Canon actual", key: "canon", width: 16 },
    { header: "Tipo", key: "tipo", width: 12 },
    { header: "Acción (AUMENTO / RETIRO)", key: "accion", width: 26 },
    { header: "% aumento", key: "pct", width: 12 },
    { header: "Motivo (si es retiro)", key: "motivo", width: 30 },
  ];
  const head = ws.getRow(1);
  head.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 10 };
  head.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
  head.height = 28;
  head.eachCell((cell) => {
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF4012AB" } };
  });
  ws.views = [{ state: "frozen", ySplit: 1 }];

  for (const r of rows) {
    ws.addRow({
      codigo: r.codigo,
      arr: r.estudio?.persona?.nombre ?? "",
      canon: r.canon,
      tipo: r.tipo_destino,
      accion: "",
      pct: "",
      motivo: "",
    });
  }

  const buf = await wb.xlsx.writeBuffer();
  return new Response(buf as ArrayBuffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": 'attachment; filename="Administracion_Masiva.xlsx"',
    },
  });
}
