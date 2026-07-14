import { getSupabase } from "@/lib/supabase/server";
import { EstudiosTabs } from "@/components/EstudiosTabs";
import { ProcesosTable, type ProcesoRow } from "./ProcesosTable";

export default async function ProcesosPage() {
  const supabase = getSupabase();
  let rows: ProcesoRow[] = [];
  let notConfigured = false;

  if (!supabase) {
    notConfigured = true;
  } else {
    const { data } = await supabase
      .from("radicacion")
      .select(
        "id, codigo, etapa, num_clientes, valor_asegurado, created_at, updated_at, excel_key, paz_salvo_key, firma_doc_id, firma_email, firma_metodo, firma_at, ultimo_error, ultimo_error_at, inmobiliaria(razon_social, codigo, persona_contacto, email_contacto, telefono)",
      )
      .order("created_at", { ascending: false });
    rows = (data ?? []) as unknown as ProcesoRow[];
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
        <ProcesosTable rows={rows} />
      )}
    </>
  );
}
