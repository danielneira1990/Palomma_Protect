import { getSupabase } from "@/lib/supabase/server";
import { leerConfig, CONFIG_DEFAULT } from "@/lib/config";
import { ConfigView, type CalRow } from "./ConfigView";

const pct = (n: number) => (n * 100).toLocaleString("es-CO", { maximumFractionDigits: 3 });

export default async function ConfiguracionPage() {
  const supabase = getSupabase();

  let config = CONFIG_DEFAULT;
  let calendario: CalRow[] = [];
  let notConfigured = false;

  if (!supabase) {
    notConfigured = true;
  } else {
    config = await leerConfig(supabase);
    const { data } = await supabase
      .from("calendario_operativo")
      .select(
        "periodo, corte_ingresos, dia_max_avisos, dia_desistimientos, pago_siniestro_vigente, pago_siniestro_nuevo",
      )
      .order("periodo", { ascending: false });
    calendario = (data ?? []) as unknown as CalRow[];
  }

  return (
    <>
      <div className="head">
        <div>
          <h1>Configuración</h1>
          <p>Parámetros del producto y calendario operativo mes a mes.</p>
        </div>
      </div>

      {notConfigured ? (
        <div className="banner warn">
          <span>🔌</span>
          <div>
            Conecta Supabase para editar la configuración (llaves en{" "}
            <span className="mono">.env.local</span>).
          </div>
        </div>
      ) : (
        <ConfigView
          config={{
            ipcPct: pct(config.ipc),
            amarilloPct: pct(config.retiroAmarillo),
            rojoPct: pct(config.retiroRojo),
            diaCorte: String(config.diaCorte),
          }}
          calendario={calendario}
        />
      )}
    </>
  );
}
