import { getSupabase } from "@/lib/supabase/server";
import { leerConfig, semaforoRetiros } from "@/lib/config";
import { pctRetirosMes } from "@/lib/novedades";
import { NovedadesTable, type NovedadRow, type SemaforoInfo } from "./NovedadesTable";

export default async function NovedadesPage() {
  const supabase = getSupabase();
  let rows: NovedadRow[] = [];
  const semaforos: Record<string, SemaforoInfo> = {};
  let notConfigured = false;

  if (!supabase) {
    notConfigured = true;
  } else {
    const { data } = await supabase
      .from("novedad")
      .select(
        "id, codigo, tipo, motivo, estado, actor, created_at, payload_anterior, payload_nuevo, id_inmobiliaria, inmobiliaria(razon_social), contrato(codigo, estudio(persona(nombre)))",
      )
      .order("created_at", { ascending: false });
    rows = (data ?? []) as unknown as NovedadRow[];

    // Semáforo del mes por cada inmobiliaria con retiros pendientes.
    const cfg = await leerConfig(supabase);
    const inmoPend = [
      ...new Set(
        rows
          .filter((r) => r.tipo === "RETIRO" && r.estado === "SOLICITADA" && r.id_inmobiliaria)
          .map((r) => r.id_inmobiliaria as string),
      ),
    ];
    for (const idInmo of inmoPend) {
      const { pct } = await pctRetirosMes(supabase, idInmo);
      semaforos[idInmo] = { pct, color: semaforoRetiros(pct, cfg) };
    }
  }

  return (
    <>
      <div className="head">
        <div>
          <h1>Novedades</h1>
          <p>Ingresos, retiros y aumentos de la cartera afianzada.</p>
        </div>
      </div>

      {notConfigured ? (
        <div className="banner warn">
          <span>🔌</span>
          <div>
            Conecta Supabase para ver las novedades (llaves en{" "}
            <span className="mono">.env.local</span>).
          </div>
        </div>
      ) : (
        <NovedadesTable rows={rows} semaforos={semaforos} />
      )}
    </>
  );
}
