import type { SupabaseClient } from "@supabase/supabase-js";
import { tasaFianzaInmo, AMPARO_INTEGRAL_CORTESIA } from "@/lib/radicacion";

export type PersonaFila = {
  nombre: string;
  tipo: string;
  doc: string;
  cel: string;
  correo: string;
};

export type FilaContrato = {
  no_contrato: string;
  fecha_inicio: string | null;
  fecha_fin: string | null;
  tipo_destino: string; // VIVIENDA | COMERCIO
  meses: number;
  ciudad: string;
  direccion: string;
  canon: number;
  admin: number;
  iva: number;
  inquilino: PersonaFila;
  codeudores: PersonaFila[];
};

const IVA = 0.19;

function sucPrefix(sucursal: string | null): string {
  return (sucursal ?? "GEN")
    .normalize("NFD")
    .replace(/[^a-zA-Z]/g, "")
    .slice(0, 3)
    .toUpperCase()
    .padEnd(3, "X");
}

/** find-or-create de persona por documento; actualiza contacto. Devuelve el id. */
async function idPersona(supabase: SupabaseClient, p: PersonaFila): Promise<string | null> {
  const doc = p.doc.trim();
  if (!doc) return null;
  const contacto = { nombre: p.nombre || null, email: p.correo || null, telefono: p.cel || null };
  const { data: ex } = await supabase.from("persona").select("id").eq("documento", doc).maybeSingle();
  if (ex) {
    await supabase.from("persona").update(contacto).eq("id", ex.id);
    return ex.id;
  }
  const { data: n } = await supabase
    .from("persona")
    .insert({ documento: doc, tipo_documento: p.tipo || "CC", ...contacto })
    .select("id")
    .single();
  return n?.id ?? null;
}

/**
 * Materializa los `contrato` + `contrato_persona` de una radicación a partir de
 * su detalle (el Excel persistido). Idempotente: no recrea contratos ya creados
 * (por id_estudio). Devuelve cuántos contratos creó.
 */
export async function materializarContratos(
  supabase: SupabaseClient,
  radicacionId: string,
): Promise<number> {
  const { data: rad } = await supabase
    .from("radicacion")
    .select("id, id_inmobiliaria, detalle")
    .eq("id", radicacionId)
    .single();
  const filas = (rad?.detalle ?? []) as FilaContrato[];
  if (!rad?.id_inmobiliaria || filas.length === 0) return 0;

  const { data: inmo } = await supabase
    .from("inmobiliaria")
    .select("sucursal, tasa_canon")
    .eq("id", rad.id_inmobiliaria)
    .single();
  const tasa = tasaFianzaInmo({ tasa_canon: inmo?.tasa_canon ?? null, sucursal: inmo?.sucursal ?? null });

  // Mapa documento → {estudio, persona} para vincular el arrendatario.
  const { data: estRaw } = await supabase
    .from("estudio")
    .select("id, id_persona, persona(documento)")
    .eq("id_radicacion", radicacionId);
  const porDoc = new Map<string, { estudio: string; persona: string | null }>();
  for (const e of (estRaw ?? []) as unknown as {
    id: string;
    id_persona: string | null;
    persona: { documento: string | null } | null;
  }[]) {
    const d = e.persona?.documento;
    if (d) porDoc.set(d, { estudio: e.id, persona: e.id_persona });
  }

  // Estudios que ya tienen contrato (idempotencia).
  const { data: yaRaw } = await supabase
    .from("contrato")
    .select("id_estudio")
    .in("id_estudio", [...porDoc.values()].map((v) => v.estudio));
  const yaConContrato = new Set(((yaRaw ?? []) as { id_estudio: string | null }[]).map((c) => c.id_estudio));

  // Consecutivo del año FZ-SUC-AAAA-NNNNN.
  const year = new Date().getFullYear();
  const pre = sucPrefix(inmo?.sucursal ?? null);
  const { count } = await supabase
    .from("contrato")
    .select("*", { count: "exact", head: true })
    .ilike("codigo", `FZ-${pre}-${year}-%`);
  let seq = count ?? 0;
  const hoy = new Date().toISOString().slice(0, 10);

  let creados = 0;
  for (const f of filas) {
    const ref = porDoc.get(f.inquilino.doc);
    if (!ref || yaConContrato.has(ref.estudio)) continue;

    const costoCanonNeto = Math.round(f.canon * tasa);
    const ivaCanon = Math.round(costoCanonNeto * IVA);
    seq++;
    const codigo = `FZ-${pre}-${year}-${String(seq).padStart(5, "0")}`;

    const { data: contrato } = await supabase
      .from("contrato")
      .insert({
        codigo,
        id_inmobiliaria: rad.id_inmobiliaria,
        id_estudio: ref.estudio,
        num_contrato_arr: f.no_contrato || null,
        inmueble_direccion: f.direccion || null,
        inmueble_ciudad: f.ciudad || null,
        tipo_destino: f.tipo_destino,
        sucursal: inmo?.sucursal ?? null,
        canon: f.canon,
        iva_canon: f.iva || null,
        administracion: f.admin || null,
        // Línea canon
        linea_canon: true,
        valor_afianzado_canon: f.canon,
        tasa_canon: tasa,
        costo_canon_neto: costoCanonNeto,
        iva_canon_servicio: ivaCanon,
        costo_canon_total: costoCanonNeto + ivaCanon,
        // Línea integral: amparo de cortesía (gratis para preaprobados)
        linea_integral: true,
        valor_afianzado_integral: AMPARO_INTEGRAL_CORTESIA,
        costo_integral_neto: 0,
        iva_integral_servicio: 0,
        costo_integral_total: 0,
        estado: "ACTIVO",
        fecha_inicio: f.fecha_inicio,
        fecha_fin: f.fecha_fin,
        fecha_ingreso: hoy,
      })
      .select("id")
      .single();
    if (!contrato) continue;

    // Arrendatario + codeudores.
    const personas: { id_persona: string; rol: string }[] = [];
    if (ref.persona) personas.push({ id_persona: ref.persona, rol: "ARRENDATARIO" });
    for (const c of f.codeudores) {
      const pid = await idPersona(supabase, c);
      if (pid) personas.push({ id_persona: pid, rol: "CODEUDOR" });
    }
    if (personas.length) {
      await supabase
        .from("contrato_persona")
        .insert(personas.map((p) => ({ id_contrato: contrato.id, ...p })));
    }
    creados++;
  }

  return creados;
}
