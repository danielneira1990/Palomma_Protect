import ExcelJS from "exceljs";
import { getSupabase } from "@/lib/supabase/server";
import { enviarCorreo, destinatarios } from "@/lib/email/client";
import { correoInduccion } from "@/lib/email/induccion";

type Persona = {
  nombre: string | null;
  documento: string | null;
  email: string | null;
  telefono: string | null;
};

function titulo(n: string | null): string {
  if (!n) return "";
  return n.toLowerCase().replace(/\b\p{L}/gu, (c) => c.toUpperCase());
}

const CONTRATO_COLS: [string, string, number][] = [
  ["No. Contrato", "no_contrato", 14],
  ["Fecha inicio", "fecha_inicio", 14],
  ["Fecha fin", "fecha_fin", 14],
  ["Tipo destino (Vivienda/Comercio)", "tipo_destino", 24],
  ["Meses con inmobiliaria", "meses", 18],
  ["Ciudad", "ciudad", 14],
  ["Dirección inmueble", "direccion", 28],
  ["Canon mensual", "canon", 14],
  ["Administración", "admin", 14],
  ["IVA", "iva", 12],
];

function personaCols(prefix: string, label: string): [string, string, number][] {
  return [
    [`${label} · Nombre completo`, `${prefix}_nombre`, 26],
    [`${label} · Tipo doc`, `${prefix}_tipo`, 12],
    [`${label} · Documento`, `${prefix}_doc`, 18],
    [`${label} · Celular`, `${prefix}_cel`, 14],
    [`${label} · Correo`, `${prefix}_correo`, 26],
  ];
}

export async function POST(request: Request) {
  const supabase = getSupabase();
  if (!supabase) {
    return new Response("Supabase no está configurado.", { status: 500 });
  }

  let ids: string[] = [];
  try {
    const body = await request.json();
    ids = Array.isArray(body?.ids)
      ? body.ids.filter((x: unknown): x is string => typeof x === "string")
      : [];
  } catch {
    /* body inválido */
  }
  if (ids.length === 0) {
    return new Response("Selecciona al menos un cliente.", { status: 400 });
  }

  const { data } = await supabase
    .from("estudio")
    .select("id, id_inmobiliaria, id_radicacion, persona(nombre, documento, email, telefono)")
    .in("id", ids)
    .eq("estado_ingreso", "PREAPROBADO");

  const estudios = (data ?? []) as unknown as {
    id: string;
    id_inmobiliaria: string | null;
    id_radicacion: string | null;
    persona: Persona | null;
  }[];

  // Crea (o reusa) la radicación —el proceso de inducción— y vincula los estudios.
  const idInmo = estudios.find((e) => e.id_inmobiliaria)?.id_inmobiliaria ?? null;
  let idRad = estudios.find((e) => e.id_radicacion)?.id_radicacion ?? null;
  if (!idRad && idInmo) {
    const year = new Date().getFullYear();
    const { count } = await supabase
      .from("radicacion")
      .select("*", { count: "exact", head: true })
      .ilike("codigo", `RAD-${year}-%`);
    const codigo = `RAD-${year}-${String((count ?? 0) + 1).padStart(3, "0")}`;
    const { data: rad } = await supabase
      .from("radicacion")
      .insert({
        codigo,
        id_inmobiliaria: idInmo,
        etapa: "INICIADA",
        num_clientes: estudios.length,
      })
      .select("id")
      .single();
    idRad = rad?.id ?? null;
    if (idRad) {
      await supabase
        .from("estudio")
        .update({ id_radicacion: idRad })
        .in(
          "id",
          estudios.map((e) => e.id),
        );
    }
  }

  const cols = [
    ...CONTRATO_COLS,
    ...personaCols("inq", "Inquilino"),
    ...personaCols("c1", "Codeudor 1"),
    ...personaCols("c2", "Codeudor 2"),
    ...personaCols("c3", "Codeudor 3"),
  ];

  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Radicación");
  ws.columns = cols.map(([header, key, width]) => ({ header, key, width }));

  // Encabezado con estilo Palomma.
  const head = ws.getRow(1);
  head.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 10 };
  head.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
  head.height = 30;
  head.eachCell((cell) => {
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF4012AB" } };
  });
  ws.views = [{ state: "frozen", ySplit: 1 }];

  // Filas de inquilinos prellenadas; contrato y codeudores en blanco para llenar.
  for (const e of estudios) {
    ws.addRow({
      tipo_destino: "",
      inq_nombre: titulo(e.persona?.nombre ?? null),
      inq_tipo: "CC",
      inq_doc: e.persona?.documento ?? "",
      inq_cel: e.persona?.telefono ?? "",
      inq_correo: e.persona?.email ?? "",
    });
  }

  const buf = await wb.xlsx.writeBuffer();

  // Enviar el correo de inducción con el Excel adjunto (mejor esfuerzo).
  try {
    const idInmo = estudios.find((e) => e.id_inmobiliaria)?.id_inmobiliaria;
    if (idInmo) {
      const { data: inmo } = await supabase
        .from("inmobiliaria")
        .select("razon_social, persona_contacto, email_contacto, email_representante")
        .eq("id", idInmo)
        .single();
      const to = destinatarios(inmo?.email_contacto, inmo?.email_representante);
      if (to) {
        const { subject, html, attachments } = correoInduccion({
          razonSocial: inmo?.razon_social ?? "",
          nombreContacto: inmo?.persona_contacto ?? "",
          numClientes: estudios.length,
        });
        await enviarCorreo({
          to,
          subject,
          html,
          attachments: [
            ...attachments,
            {
              filename: "Radicacion_Palomma.xlsx",
              content: Buffer.from(buf as ArrayBuffer),
            },
          ],
        });
      }
    }
  } catch (e) {
    console.error("No se pudo enviar el correo de inducción:", e);
  }

  return new Response(buf as ArrayBuffer, {
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": 'attachment; filename="Radicacion_Palomma.xlsx"',
    },
  });
}
