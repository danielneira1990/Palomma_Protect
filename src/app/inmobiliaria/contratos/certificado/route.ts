import { getSupabase } from "@/lib/supabase/server";
import { generarCertificadoFianza } from "@/lib/google/certificadoFianza";

type ContratoCert = {
  codigo: string | null;
  num_contrato_arr: string | null;
  inmueble_direccion: string | null;
  inmueble_ciudad: string | null;
  canon: number | null;
  valor_afianzado_canon: number | null;
  tasa_canon: number | null;
  valor_afianzado_integral: number | null;
  fecha_inicio: string | null;
  fecha_ingreso: string | null;
  inmobiliaria: {
    razon_social: string | null;
    nit: string | null;
    codigo: string | null;
    num_contrato_marco: string | null;
    created_at: string | null;
  } | null;
  estudio: { persona: { nombre: string | null; documento: string | null } | null } | null;
  contrato_persona: { rol: string | null; persona: { nombre: string | null } | null }[];
};

export async function POST(request: Request) {
  const supabase = getSupabase();
  if (!supabase) return new Response("Supabase no está configurado.", { status: 500 });

  let contratoId = "";
  try {
    const b = await request.json();
    contratoId = String(b?.contratoId ?? "");
  } catch {
    /* body inválido */
  }
  if (!contratoId) return new Response("Falta el contrato.", { status: 400 });

  const { data } = await supabase
    .from("contrato")
    .select(
      "codigo, num_contrato_arr, inmueble_direccion, inmueble_ciudad, canon, valor_afianzado_canon, tasa_canon, valor_afianzado_integral, fecha_inicio, fecha_ingreso, inmobiliaria(razon_social, nit, codigo, num_contrato_marco, created_at), estudio(persona(nombre, documento)), contrato_persona(rol, persona(nombre))",
    )
    .eq("id", contratoId)
    .single();
  const c = data as unknown as ContratoCert | null;
  if (!c) return new Response("Contrato no encontrado.", { status: 404 });

  const deudores = (c.contrato_persona ?? [])
    .filter((p) => (p.rol ?? "").toUpperCase() === "CODEUDOR")
    .map((p) => p.persona?.nombre)
    .filter((n): n is string => !!n);

  const pdf = await generarCertificadoFianza({
    numeroCertificado: c.codigo ?? "",
    razonSocial: c.inmobiliaria?.razon_social ?? "",
    nitInmobiliaria: c.inmobiliaria?.nit ?? "",
    codigoInmobiliaria: c.inmobiliaria?.codigo ?? "",
    numContratoMarco: c.inmobiliaria?.num_contrato_marco ?? "",
    nombreArrendatario: c.estudio?.persona?.nombre ?? "",
    documentoArrendatario: c.estudio?.persona?.documento ?? "",
    direccionInmueble: c.inmueble_direccion ?? "",
    ciudadInmueble: c.inmueble_ciudad ?? "",
    numContratoArr: c.num_contrato_arr ?? "",
    canon: c.canon ?? 0,
    valorAfianzadoCanon: c.valor_afianzado_canon ?? 0,
    tasaCanon: c.tasa_canon ?? 0,
    valorAfianzadoIntegral: c.valor_afianzado_integral ?? 0,
    fechaInicioContrato: c.fecha_inicio,
    fechaInicioFianza: c.fecha_ingreso,
    fechaContratoMarco: c.inmobiliaria?.created_at ?? null,
    deudoresSolidarios: deudores.join(", "),
  });

  if (!pdf) {
    return new Response("No se pudo generar el certificado (revisa la config de Google).", {
      status: 500,
    });
  }

  return new Response(pdf as unknown as ArrayBuffer, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="Certificado_${c.codigo ?? "fianza"}.pdf"`,
    },
  });
}
