import Link from "next/link";
import { getSupabase } from "@/lib/supabase/server";
import { EstudiosTable, type EstudioRow } from "./EstudiosTable";
import { EstudiosTabs } from "@/components/EstudiosTabs";

export default async function EstudiosPage() {
  const supabase = getSupabase();
  let rows: EstudioRow[] = [];
  let notConfigured = false;
  let error: string | null = null;

  if (!supabase) {
    notConfigured = true;
  } else {
    // Solo estudios "normales" (manuales). Los preaprobados del modelo (que traen
    // merchant_id) se manejan en la pestaña Procesos de inducción.
    const { data, error: e } = await supabase
      .from("estudio")
      .select(
        "id, codigo, tipo_estudio, score, tier, estado, decision_fianza, estado_ingreso, vigencia_hasta, fecha_ingreso, created_at, persona(nombre, documento, email, telefono), inmobiliaria(razon_social, codigo)",
      )
      .is("merchant_id", null)
      .order("created_at", { ascending: false });

    if (e) error = e.message;
    else rows = (data as unknown as EstudioRow[]) ?? [];
  }

  return (
    <>
      <div className="head">
        <div>
          <h1>Estudios</h1>
          <p>Preaprobación y estudios de arrendatarios. Score, cupo y decisión de fianza.</p>
        </div>
        <div className="actions">
          <Link href="/backoffice/estudios/nuevo" className="btn btn-purple">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
              <path d="M12 5v14M5 12h14" />
            </svg>
            Nuevo estudio
          </Link>
        </div>
      </div>
      <EstudiosTabs />

      {notConfigured && (
        <div className="banner warn">
          <span>🔌</span>
          <div>
            Supabase no está configurado todavía. Agrega tus llaves en{" "}
            <span className="mono">.env.local</span> y corre las migraciones.
          </div>
        </div>
      )}

      {error && (
        <div className="banner warn">
          <span>⚠️</span>
          <div>Error consultando la base: {error}</div>
        </div>
      )}

      <EstudiosTable rows={rows} notConfigured={notConfigured} />
    </>
  );
}
