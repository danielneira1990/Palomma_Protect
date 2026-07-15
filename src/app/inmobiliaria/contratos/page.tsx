import { getSupabase } from "@/lib/supabase/server";
import { leerConfig } from "@/lib/config";
import { fmtTasaPct } from "@/lib/radicacion";
import { ContratosView, type ContratoPortalRow } from "./ContratosView";

export default async function ContratosPage() {
  const supabase = getSupabase();
  if (!supabase) {
    return (
      <div className="tablewrap">
        <div className="empty">
          <div className="ic">🔌</div>
          <div className="msg">Conecta Supabase para ver tus contratos.</div>
        </div>
      </div>
    );
  }

  const { data } = await supabase
    .from("contrato")
    .select(
      "id, codigo, inmueble_direccion, tipo_destino, canon, costo_canon_total, estado, created_at, estudio(persona(nombre))",
    )
    .order("created_at", { ascending: false });

  // Contratos con retiro pendiente (SOLICITADA).
  const { data: pend } = await supabase
    .from("novedad")
    .select("id_contrato")
    .eq("tipo", "RETIRO")
    .eq("estado", "SOLICITADA");
  const enTramite = new Set(((pend ?? []) as { id_contrato: string | null }[]).map((p) => p.id_contrato));

  const rows: ContratoPortalRow[] = (
    (data ?? []) as unknown as {
      id: string;
      codigo: string | null;
      inmueble_direccion: string | null;
      tipo_destino: string | null;
      canon: number | null;
      costo_canon_total: number | null;
      estado: string | null;
      estudio: { persona: { nombre: string | null } | null } | null;
    }[]
  ).map((c) => ({
    id: c.id,
    codigo: c.codigo,
    inmueble_direccion: c.inmueble_direccion,
    tipo_destino: c.tipo_destino,
    canon: c.canon,
    costo_canon_total: c.costo_canon_total,
    estado: c.estado,
    retiro_en_tramite: enTramite.has(c.id),
    arrendatario: c.estudio?.persona?.nombre ?? null,
  }));

  const { ipc } = await leerConfig(supabase);

  return <ContratosView rows={rows} ipcPct={fmtTasaPct(ipc)} />;
}
