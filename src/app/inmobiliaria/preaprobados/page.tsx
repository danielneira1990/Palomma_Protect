import { getSupabase } from "@/lib/supabase/server";
import { tasaFianzaInmo, fmtTasaPct, TASA_FIANZA_DEFAULT } from "@/lib/radicacion";
import { PreaprobadosView, type PreaprobadoRow } from "./PreaprobadosView";
import { ProcesoView } from "./ProcesoView";

type InmoTasa = { tasa_canon: number | null; sucursal: string | null } | null;
const tasaDe = (inmo: InmoTasa) => (inmo ? tasaFianzaInmo(inmo) : TASA_FIANZA_DEFAULT);

export default async function PreaprobadosPage() {
  const supabase = getSupabase();

  if (!supabase) {
    return (
      <div className="tablewrap">
        <div className="empty">
          <div className="ic">🔌</div>
          <div className="msg">
            Conecta Supabase para ver tus preaprobados.
            <br />
            (Configura las variables en <span className="mono">.env.local</span>.)
          </div>
        </div>
      </div>
    );
  }

  // ¿Hay un proceso de inducción activo? (etapa != INGRESADA)
  const { data: rad } = await supabase
    .from("radicacion")
    .select(
      "id, codigo, etapa, num_clientes, valor_asegurado, created_at, inmobiliaria(tasa_canon, sucursal)",
    )
    .not("etapa", "in", "(INGRESADA,CANCELADA)")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (rad) {
    const { data: est } = await supabase
      .from("estudio")
      .select("id")
      .eq("id_radicacion", rad.id);
    const estudioIds = (est ?? []).map((e) => e.id);
    const tasaFianza = tasaDe((rad as unknown as { inmobiliaria: InmoTasa }).inmobiliaria);
    return <ProcesoView radicacion={rad} estudioIds={estudioIds} tasaFianza={tasaFianza} />;
  }

  // Sin proceso activo → selección de preaprobados: los que no están en un
  // proceso, o cuyo proceso fue cancelado (vuelven a estar disponibles).
  const { data: canc } = await supabase.from("radicacion").select("id").eq("etapa", "CANCELADA");
  const cancIds = (canc ?? []).map((r) => r.id);

  let q = supabase
    .from("estudio")
    .select(
      "id, created_at, persona(nombre, documento, email, telefono), inmobiliaria(tasa_canon, sucursal)",
    )
    .eq("tipo_estudio", "PREAPROBACION")
    .eq("estado_ingreso", "PREAPROBADO");
  q =
    cancIds.length > 0
      ? q.or(`id_radicacion.is.null,id_radicacion.in.(${cancIds.join(",")})`)
      : q.is("id_radicacion", null);

  const { data } = await q.order("created_at", { ascending: false });

  const rows: PreaprobadoRow[] = (
    (data ?? []) as unknown as {
      id: string;
      persona: { nombre: string | null; documento: string | null; email: string | null; telefono: string | null } | null;
    }[]
  ).map((r) => ({
    id: r.id,
    nombre: r.persona?.nombre ?? null,
    documento: r.persona?.documento ?? null,
    email: r.persona?.email ?? null,
    telefono: r.persona?.telefono ?? null,
  }));

  const { count } = await supabase
    .from("estudio")
    .select("*", { count: "exact", head: true })
    .eq("tipo_estudio", "PREAPROBACION")
    .eq("estado_ingreso", "INGRESADO");

  const inmoTasa =
    (data?.[0] as unknown as { inmobiliaria: InmoTasa } | undefined)?.inmobiliaria ?? null;
  const tasaPct = fmtTasaPct(tasaDe(inmoTasa));
  return <PreaprobadosView rows={rows} afianzados={count ?? 0} tasaPct={tasaPct} />;
}
