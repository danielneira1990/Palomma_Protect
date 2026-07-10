import { getSupabase } from "@/lib/supabase/server";
import { money } from "@/lib/format";

type Preaprobado = {
  id: string;
  codigo: string | null;
  tier: string | null;
  score: number | null;
  cupo_max: number | null;
  decision_fianza: string | null;
  estado_ingreso: string | null;
};

export default async function PreaprobadosPage() {
  const supabase = getSupabase();
  let rows: Preaprobado[] = [];
  let notConfigured = false;

  if (!supabase) {
    notConfigured = true;
  } else {
    const { data } = await supabase
      .from("estudio")
      .select("id, codigo, tier, score, cupo_max, decision_fianza, estado_ingreso")
      .eq("tipo_estudio", "PREAPROBACION")
      .eq("estado_ingreso", "PREAPROBADO")
      .order("score", { ascending: false });
    rows = (data as Preaprobado[]) ?? [];
  }

  return (
    <>
      <div className="banner info">
        <span>🛡️</span>
        <div>
          Aquí ves los <b>clientes preaprobados</b> por Palomma (tier PRIME). Al completar el proceso,
          el contrato se ingresa de una vez. La lista se refresca cada mes.
        </div>
      </div>

      {notConfigured ? (
        <div className="tablewrap">
          <div className="empty">
            <div className="ic">🔌</div>
            <div className="msg">
              Conecta Supabase y el motor de scoring para ver los preaprobados.
              <br />
              (Configura las variables en <span className="mono">.env.local</span>.)
            </div>
          </div>
        </div>
      ) : rows.length === 0 ? (
        <div className="tablewrap">
          <div className="empty">
            <div className="ic">📭</div>
            <div className="msg">Todavía no hay preaprobados cargados para esta inmobiliaria.</div>
          </div>
        </div>
      ) : (
        <div className="tablewrap">
          <div className="tscroll">
            <table>
              <thead>
                <tr>
                  <th>Estudio</th>
                  <th>Tier</th>
                  <th>Score</th>
                  <th>Cupo</th>
                  <th>Decisión</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id}>
                    <td className="mono">{r.codigo}</td>
                    <td>
                      <span className="pill pill-brand">{r.tier}</span>
                    </td>
                    <td className="mono strong">{r.score}</td>
                    <td className="mono">{money(r.cupo_max)}</td>
                    <td>
                      <span className="pill pill-ok">{r.decision_fianza ?? "APROBADO"}</span>
                    </td>
                    <td>
                      <button className="btn btn-outline btn-sm">Preaprobado →</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </>
  );
}
