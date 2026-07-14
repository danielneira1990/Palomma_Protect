"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { fecha } from "@/lib/format";
import { decidirEstudio, marcarIngresado } from "./actions";

export type EstudioRow = {
  id: string;
  codigo: string | null;
  tipo_estudio: string | null;
  score: number | null;
  tier: string | null;
  estado: string | null;
  decision_fianza: string | null;
  estado_ingreso: string | null;
  vigencia_hasta: string | null;
  fecha_ingreso: string | null;
  created_at: string | null;
  persona: {
    nombre: string | null;
    documento: string | null;
    email: string | null;
    telefono: string | null;
  } | null;
  inmobiliaria: { razon_social: string | null; codigo: string | null } | null;
};

function estadoPill(estado: string | null) {
  const e = (estado ?? "").toUpperCase();
  if (e === "APROBADO") return "pill pill-ok";
  if (e === "CONDICIONAL") return "pill pill-warn";
  if (e === "NO_VIABLE") return "pill pill-danger";
  if (e === "APLAZADO_FALTA_INFO") return "pill pill-muted";
  return "pill pill-brand"; // EN_ANALISIS
}

function ingresoPill(ing: string | null) {
  const e = (ing ?? "").toUpperCase();
  if (e === "INGRESADO") return "pill pill-ok";
  if (e === "PREAPROBADO") return "pill pill-info";
  if (e === "VENCIDO") return "pill pill-muted";
  return null;
}

export function EstudiosTable({
  rows,
  notConfigured,
}: {
  rows: EstudioRow[];
  notConfigured: boolean;
}) {
  const [selected, setSelected] = useState<EstudioRow | null>(null);

  return (
    <>
      <div className="tablewrap">
        {rows.length === 0 ? (
          <div className="empty">
            <div className="ic">🧮</div>
            <div className="msg">
              {notConfigured
                ? "Conecta Supabase para empezar."
                : "Aún no hay estudios. Radica el primero."}
            </div>
          </div>
        ) : (
          <>
            <div className="tscroll">
              <table>
                <thead>
                  <tr>
                    <th>Estudio</th>
                    <th>Arrendatario</th>
                    <th>Inmobiliaria</th>
                    <th>Tier</th>
                    <th>Score</th>
                    <th>Estado</th>
                    <th>Ingreso</th>
                    <th>Creado</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => {
                    const ing = ingresoPill(r.estado_ingreso);
                    return (
                      <tr key={r.id} onClick={() => setSelected(r)} style={{ cursor: "pointer" }}>
                        <td className="mono">{r.codigo}</td>
                        <td className="strong">{r.persona?.nombre ?? "—"}</td>
                        <td>{r.inmobiliaria?.razon_social ?? "—"}</td>
                        <td>{r.tier ? <span className="pill pill-brand">{r.tier}</span> : "—"}</td>
                        <td className="mono strong">{r.score ?? "—"}</td>
                        <td>
                          <span className={estadoPill(r.estado)}>{r.estado}</span>
                        </td>
                        <td>
                          {ing ? <span className={ing}>{r.estado_ingreso}</span> : "—"}
                        </td>
                        <td className="mono">{fecha(r.created_at)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="tfoot">Registros: {rows.length}</div>
          </>
        )}
      </div>

      {selected && <GestionModal estudio={selected} onClose={() => setSelected(null)} />}
    </>
  );
}

function GestionModal({ estudio, onClose }: { estudio: EstudioRow; onClose: () => void }) {
  const router = useRouter();
  const [estado, setEstado] = useState(estudio.estado);
  const [ingreso, setIngreso] = useState(estudio.estado_ingreso);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const decidido = estado !== "EN_ANALISIS";

  async function decidir(decision: string) {
    setErr(null);
    setBusy(true);
    try {
      await decidirEstudio(estudio.id, decision);
      setEstado(decision);
      setIngreso(decision === "NO_VIABLE" ? null : "PREAPROBADO");
      router.refresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Error registrando la decisión.");
    } finally {
      setBusy(false);
    }
  }

  async function ingresar() {
    setErr(null);
    setBusy(true);
    try {
      await marcarIngresado(estudio.id);
      setIngreso("INGRESADO");
      router.refresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Error marcando el ingreso.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <div>
            <h2>{estudio.persona?.nombre ?? "Arrendatario"}</h2>
            <div className="sub">
              {estudio.codigo} · {estudio.persona?.documento ?? "—"}
            </div>
          </div>
          <span className={estadoPill(estado)}>{estado}</span>
          <button className="modal-x" onClick={onClose} aria-label="Cerrar">
            ✕
          </button>
        </div>

        <div className="modal-body">
          {err && (
            <div className="banner warn" style={{ marginBottom: 16 }}>
              <span>⚠️</span>
              <div>{err}</div>
            </div>
          )}

          <dl className="dl">
            <dt>Inmobiliaria</dt>
            <dd>{estudio.inmobiliaria?.razon_social ?? "—"}</dd>
            <dt>Tipo</dt>
            <dd>{estudio.tipo_estudio ?? "—"}</dd>
            <dt>Score</dt>
            <dd>{estudio.score ?? "—"}</dd>
            <dt>Tier</dt>
            <dd>{estudio.tier ? <span className="pill pill-brand">{estudio.tier}</span> : "—"}</dd>
            <dt>Vigencia</dt>
            <dd>{fecha(estudio.vigencia_hasta)}</dd>
            <dt>Ingreso</dt>
            <dd>{ingreso ?? "—"}</dd>
            {ingreso === "INGRESADO" && (
              <>
                <dt>Fecha de ingreso</dt>
                <dd>{fecha(estudio.fecha_ingreso)}</dd>
              </>
            )}
          </dl>

          <div className="modal-sec">
            <h3>Decisión de fianza</h3>
            {!decidido ? (
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <button
                  className="btn btn-outline btn-sm"
                  disabled={busy}
                  onClick={() => decidir("APROBADO")}
                >
                  Aprobar
                </button>
                <button
                  className="btn btn-outline btn-sm"
                  disabled={busy}
                  onClick={() => decidir("CONDICIONAL")}
                >
                  Condicional
                </button>
                <button
                  className="btn btn-danger btn-sm"
                  disabled={busy}
                  onClick={() => decidir("NO_VIABLE")}
                >
                  No viable
                </button>
              </div>
            ) : (
              <div className="docbox">
                <span className="di">
                  {estado === "NO_VIABLE" ? "⛔" : estado === "CONDICIONAL" ? "⚠️" : "✅"}
                </span>
                <div className="dinfo">
                  <div className="dt">Decisión: {estado}</div>
                  <div className="dd">
                    {ingreso === "INGRESADO"
                      ? "Ingresado a fianza."
                      : ingreso === "PREAPROBADO"
                        ? `Preaprobado${estudio.vigencia_hasta ? ` · vigencia hasta ${fecha(estudio.vigencia_hasta)}` : ""}`
                        : "Sin ingreso a fianza."}
                  </div>
                </div>
                {ingreso === "PREAPROBADO" && (
                  <button className="btn btn-purple btn-sm" disabled={busy} onClick={ingresar}>
                    {busy ? "…" : "Marcar ingresado"}
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
