import { getSupabase } from "@/lib/supabase/server";
import { leerConfig } from "@/lib/config";
import { aplicarRetirosVencidos } from "@/lib/novedades";
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

  // Auto-aprobación de retiros vencidos (para el cliente es solo "se procesó").
  await aplicarRetirosVencidos(supabase);

  // Cartera vigente: activos + los que están EN_RETIRO (en trámite). Solo se
  // ocultan los ya RETIRADO (esos se ven en Novedades).
  const { data } = await supabase
    .from("contrato")
    .select(
      "id, codigo, inmueble_direccion, tipo_destino, canon, valor_afianzado_canon, tasa_canon, costo_canon_total, linea_integral, linea_penal, estado, fecha_fin, created_at, estudio(persona(nombre))",
    )
    .neq("estado", "RETIRADO")
    .order("created_at", { ascending: false });

  const raw = (data ?? []) as unknown as {
    id: string;
    codigo: string | null;
    inmueble_direccion: string | null;
    tipo_destino: string | null;
    canon: number | null;
    valor_afianzado_canon: number | null;
    tasa_canon: number | null;
    costo_canon_total: number | null;
    linea_integral: boolean | null;
    linea_penal: boolean | null;
    estado: string | null;
    fecha_fin: string | null;
    estudio: { persona: { nombre: string | null } | null } | null;
  }[];

  const rows: ContratoPortalRow[] = raw.map((c) => ({
    id: c.id,
    codigo: c.codigo,
    inmueble_direccion: c.inmueble_direccion,
    tipo_destino: c.tipo_destino,
    canon: c.canon,
    costo_canon_total: c.costo_canon_total,
    estado: c.estado,
    fecha_fin: c.fecha_fin,
    retiro_en_tramite: c.estado === "EN_RETIRO",
    arrendatario: c.estudio?.persona?.nombre ?? null,
  }));

  // KPIs de la cartera.
  const valorAfianzado = raw.reduce((a, c) => a + (c.valor_afianzado_canon ?? 0), 0);
  const ponderada = raw.reduce((a, c) => a + (c.tasa_canon ?? 0) * (c.valor_afianzado_canon ?? 0), 0);
  const kpis = {
    nContratos: raw.length,
    valorAfianzado,
    costoMensual: raw.reduce((a, c) => a + (c.costo_canon_total ?? 0), 0),
    tasaPromedioPct: fmtTasaPct(valorAfianzado > 0 ? ponderada / valorAfianzado : 0),
    conIntegral: raw.filter((c) => c.linea_integral).length,
    conPenal: raw.filter((c) => c.linea_penal).length,
  };

  const { ipc } = await leerConfig(supabase);

  return <ContratosView rows={rows} ipcPct={fmtTasaPct(ipc)} kpis={kpis} />;
}
