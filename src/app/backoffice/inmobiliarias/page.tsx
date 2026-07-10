import Link from "next/link";
import { getSupabase } from "@/lib/supabase/server";
import { InmobiliariasTable, type InmobiliariaRow } from "./InmobiliariasTable";

export default async function InmobiliariasPage() {
  const supabase = getSupabase();
  let rows: InmobiliariaRow[] = [];
  let notConfigured = false;
  let error: string | null = null;

  if (!supabase) {
    notConfigured = true;
  } else {
    const { data, error: e } = await supabase
      .from("inmobiliaria")
      .select(
        "id, codigo, razon_social, nit, sucursal, ciudad, estado, sagrilaft_estado, num_contrato_marco, persona_contacto, email_contacto, telefono, created_at, bienvenida_enviada_at, merchant_id",
      )
      .order("created_at", { ascending: false });

    if (e) {
      error = e.message;
    } else {
      const inmos = (data ?? []) as Omit<InmobiliariaRow, "contratoLink" | "firmadoLink">[];
      const ids = inmos.map((r) => r.id);

      // Documentos (contrato generado y firmado) de todas las inmobiliarias.
      let docs: { id_entidad: string; tipo_documento: string; storage_key: string | null }[] = [];
      if (ids.length) {
        const { data: d } = await supabase
          .from("documento")
          .select("id_entidad, tipo_documento, storage_key")
          .eq("tipo_entidad", "INMOBILIARIA")
          .in("id_entidad", ids);
        docs = d ?? [];
      }

      rows = inmos.map((r) => ({
        ...r,
        contratoLink:
          docs.find((x) => x.id_entidad === r.id && x.tipo_documento === "CONTRATO_MARCO")
            ?.storage_key ?? null,
        firmadoLink:
          docs.find((x) => x.id_entidad === r.id && x.tipo_documento === "CONTRATO_MARCO_FIRMADO")
            ?.storage_key ?? null,
      }));
    }
  }

  return (
    <>
      <div className="head">
        <div>
          <h1>Inmobiliarias</h1>
          <p>Clientes comerciales de Palomma. Genera su ID (IMB) y su contrato marco (CMF).</p>
        </div>
        <div className="actions">
          <Link href="/backoffice/inmobiliarias/nueva" className="btn btn-purple">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
              <path d="M12 5v14M5 12h14" />
            </svg>
            Nueva inmobiliaria
          </Link>
        </div>
      </div>

      {notConfigured && (
        <div className="banner warn">
          <span>🔌</span>
          <div>
            Supabase no está configurado todavía. Copia <span className="mono">.env.example</span> a{" "}
            <span className="mono">.env.local</span>, agrega tus llaves y corre la migración de{" "}
            <span className="mono">supabase/migrations</span>.
          </div>
        </div>
      )}

      {error && (
        <div className="banner warn">
          <span>⚠️</span>
          <div>Error consultando la base: {error}</div>
        </div>
      )}

      <InmobiliariasTable rows={rows} notConfigured={notConfigured} />
    </>
  );
}
