import { getSupabase } from "@/lib/supabase/server";
import { generarPazYSalvo } from "@/lib/google/pazSalvo";
import { carpetaRadicacion } from "@/lib/radicacionDrive";
import { enviarCorreo } from "@/lib/email/client";
import { correoPazSalvo } from "@/lib/email/proceso";

const MESES = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
];

export async function POST(request: Request) {
  const supabase = getSupabase();
  if (!supabase) return new Response("Supabase no está configurado.", { status: 500 });

  let radicacionId = "";
  try {
    const body = await request.json();
    radicacionId = String(body?.radicacionId ?? "");
  } catch {
    /* body inválido */
  }
  if (!radicacionId) return new Response("Falta la radicación.", { status: 400 });

  const { data: rad } = await supabase
    .from("radicacion")
    .select("id, id_inmobiliaria, num_clientes, valor_asegurado")
    .eq("id", radicacionId)
    .single();
  if (!rad) return new Response("Radicación no encontrada.", { status: 404 });

  const { data: inmo } = await supabase
    .from("inmobiliaria")
    .select("razon_social, nit, representante_legal, cc_representante, ciudad, persona_contacto, email_contacto")
    .eq("id", rad.id_inmobiliaria)
    .single();
  if (!inmo) return new Response("Inmobiliaria no encontrada.", { status: 404 });

  const folder = await carpetaRadicacion(supabase, radicacionId);
  if (!folder) {
    return new Response("No se pudo preparar la carpeta en Drive.", { status: 500 });
  }

  const now = new Date();
  const gen = await generarPazYSalvo(
    {
      razonSocial: inmo.razon_social ?? "",
      nit: inmo.nit ?? "",
      representanteLegal: inmo.representante_legal ?? "",
      ccRepresentante: inmo.cc_representante ?? "",
      ciudad: inmo.ciudad ?? "Medellín",
      numContratos: rad.num_clientes ?? 0,
      valorAsegurado: rad.valor_asegurado ?? 0,
      nombreArchivoExcel: "Radicacion_Palomma.xlsx",
      dia: String(now.getDate()),
      mes: MESES[now.getMonth()],
      anio: String(now.getFullYear()),
    },
    folder,
  );

  if (!gen) {
    return new Response("No se pudo generar el paz y salvo (revisa la config de Google).", {
      status: 500,
    });
  }

  // Avanza la etapa y guarda el link.
  await supabase
    .from("radicacion")
    .update({ etapa: "PAZ_SALVO", paz_salvo_key: gen.link, updated_at: now.toISOString() })
    .eq("id", radicacionId);

  // Correo con el paz y salvo adjunto (mejor esfuerzo).
  try {
    if (inmo.email_contacto) {
      const { subject, html, attachments } = correoPazSalvo({
        nombreContacto: inmo.persona_contacto ?? "",
        numContratos: rad.num_clientes ?? 0,
      });
      await enviarCorreo({
        to: inmo.email_contacto,
        subject,
        html,
        attachments: [...attachments, { filename: "Paz_y_Salvo_Palomma.pdf", content: gen.pdf }],
      });
    }
  } catch (e) {
    console.error("No se pudo enviar el correo del paz y salvo:", e);
  }

  return new Response(gen.pdf as unknown as ArrayBuffer, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": 'attachment; filename="Paz_y_Salvo_Palomma.pdf"',
    },
  });
}
