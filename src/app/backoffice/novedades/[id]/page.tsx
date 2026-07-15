import Link from "next/link";
import { getSupabase } from "@/lib/supabase/server";
import { aplicarRetirosVencidos } from "@/lib/novedades";
import { MovimientosView, type Movimiento } from "./MovimientosView";

const TIPOS: Record<string, string> = { INGRESO: "Ingresos", RETIRO: "Retiros", AUMENTO: "Aumentos" };

export default async function MovimientosPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tipo?: string }>;
}) {
  const { id } = await params;
  const { tipo } = await searchParams;
  const t = (tipo ?? "").toUpperCase();
  const supabase = getSupabase();

  let razon = "—";
  let rows: Movimiento[] = [];

  if (supabase) {
    await aplicarRetirosVencidos(supabase);
    const { data: inmo } = await supabase
      .from("inmobiliaria")
      .select("razon_social")
      .eq("id", id)
      .maybeSingle();
    razon = (inmo as { razon_social: string | null } | null)?.razon_social ?? "—";

    let q = supabase
      .from("novedad")
      .select(
        "id, codigo, tipo, motivo, estado, actor, created_at, fecha_vigencia, payload_anterior, payload_nuevo, contrato(codigo, canon, estudio(persona(nombre)))",
      )
      .eq("id_inmobiliaria", id)
      .order("created_at", { ascending: false });
    if (TIPOS[t]) q = q.eq("tipo", t);
    const { data } = await q;
    rows = (data ?? []) as unknown as Movimiento[];
  }

  return (
    <>
      <div className="head">
        <div>
          <Link href="/backoffice/novedades" className="btn btn-outline btn-sm" style={{ marginBottom: 10 }}>
            ← Novedades
          </Link>
          <h1>
            {TIPOS[t] ?? "Movimientos"} · {razon}
          </h1>
          <p>Detalle uno a uno del mes.</p>
        </div>
      </div>

      <MovimientosView rows={rows} />
    </>
  );
}
