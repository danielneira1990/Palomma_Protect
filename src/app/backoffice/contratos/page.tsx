import { getSupabase } from "@/lib/supabase/server";
import { ContratosTable, type ContratoRow } from "./ContratosTable";

export default async function ContratosPage() {
  const supabase = getSupabase();
  let rows: ContratoRow[] = [];
  let notConfigured = false;

  if (!supabase) {
    notConfigured = true;
  } else {
    const { data } = await supabase
      .from("contrato")
      .select(
        "id, codigo, num_contrato_arr, inmueble_direccion, inmueble_ciudad, tipo_destino, canon, valor_afianzado_canon, tasa_canon, costo_canon_neto, iva_canon_servicio, costo_canon_total, valor_afianzado_integral, estado, fecha_inicio, fecha_fin, fecha_ingreso, created_at, inmobiliaria(razon_social, codigo), estudio(persona(nombre, documento)), contrato_persona(rol, persona(nombre, documento))",
      )
      .order("created_at", { ascending: false });
    rows = (data ?? []) as unknown as ContratoRow[];
  }

  return (
    <>
      <div className="head">
        <div>
          <h1>Contratos</h1>
          <p>Cartera afianzada. Cada contrato nace al ingresar una radicación.</p>
        </div>
      </div>

      {notConfigured && (
        <div className="banner warn">
          <span>🔌</span>
          <div>
            Supabase no está configurado. Agrega tus llaves en{" "}
            <span className="mono">.env.local</span> y corre las migraciones.
          </div>
        </div>
      )}

      <ContratosTable rows={rows} notConfigured={notConfigured} />
    </>
  );
}
