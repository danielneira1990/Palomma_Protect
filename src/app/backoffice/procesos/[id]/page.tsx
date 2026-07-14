import Link from "next/link";
import { getSupabase } from "@/lib/supabase/server";
import { ClientesRadicacion, type ClienteEstudio } from "./ClientesRadicacion";

export default async function ClientesRadicacionPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = getSupabase();

  let codigo: string | null = null;
  let razonSocial: string | null = null;
  let rows: ClienteEstudio[] = [];

  if (supabase) {
    const { data: rad } = await supabase
      .from("radicacion")
      .select("codigo, inmobiliaria(razon_social)")
      .eq("id", id)
      .maybeSingle();
    codigo = (rad as { codigo: string | null } | null)?.codigo ?? null;
    razonSocial =
      (rad as unknown as { inmobiliaria: { razon_social: string | null } | null } | null)
        ?.inmobiliaria?.razon_social ?? null;

    const { data } = await supabase
      .from("estudio")
      .select(
        "id, codigo, tipo_estudio, score, tier, estado, decision_fianza, estado_ingreso, vigencia_hasta, fecha_ingreso, created_at, persona(nombre, documento, email, telefono)",
      )
      .eq("id_radicacion", id)
      .order("created_at", { ascending: false });
    rows = (data ?? []) as unknown as ClienteEstudio[];
  }

  return (
    <>
      <div className="head">
        <div>
          <Link
            href="/backoffice/procesos"
            className="btn btn-outline btn-sm"
            style={{ marginBottom: 10 }}
          >
            ← Procesos de inducción
          </Link>
          <h1>Clientes{codigo ? ` · ${codigo}` : ""}</h1>
          <p>
            {razonSocial ?? "—"} · {rows.length} cliente(s) preaprobado(s) en esta radicación.
          </p>
        </div>
      </div>

      <ClientesRadicacion rows={rows} />
    </>
  );
}
