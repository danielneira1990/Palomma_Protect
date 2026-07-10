import { getSupabase } from "@/lib/supabase/server";
import { EstudiosTabs } from "@/components/EstudiosTabs";
import { ProcesosTable, type ProcesoRow, type Cliente } from "./ProcesosTable";

export default async function ProcesosPage() {
  const supabase = getSupabase();
  let rows: ProcesoRow[] = [];
  const clientes: Record<string, Cliente[]> = {};
  let notConfigured = false;

  if (!supabase) {
    notConfigured = true;
  } else {
    const { data } = await supabase
      .from("radicacion")
      .select(
        "id, codigo, etapa, num_clientes, valor_asegurado, created_at, excel_key, paz_salvo_key, inmobiliaria(razon_social, codigo)",
      )
      .order("created_at", { ascending: false });
    rows = (data ?? []) as unknown as ProcesoRow[];

    const ids = rows.map((r) => r.id);
    if (ids.length) {
      const { data: est } = await supabase
        .from("estudio")
        .select("id_radicacion, persona(nombre, documento)")
        .in("id_radicacion", ids);
      for (const e of (est ?? []) as unknown as {
        id_radicacion: string | null;
        persona: { nombre: string | null; documento: string | null } | null;
      }[]) {
        if (!e.id_radicacion) continue;
        (clientes[e.id_radicacion] ??= []).push({
          nombre: e.persona?.nombre ?? null,
          documento: e.persona?.documento ?? null,
        });
      }
    }
  }

  return (
    <>
      <div className="head">
        <div>
          <h1>Estudios</h1>
          <p>Preaprobación y procesos de inducción de las inmobiliarias.</p>
        </div>
      </div>
      <EstudiosTabs />

      {notConfigured ? (
        <div className="tablewrap">
          <div className="empty">
            <div className="ic">🔌</div>
            <div className="msg">Conecta Supabase para ver los procesos.</div>
          </div>
        </div>
      ) : rows.length === 0 ? (
        <div className="tablewrap">
          <div className="empty">
            <div className="ic">📋</div>
            <div className="msg">Aún no hay procesos de inducción iniciados.</div>
          </div>
        </div>
      ) : (
        <ProcesosTable rows={rows} clientes={clientes} />
      )}
    </>
  );
}
