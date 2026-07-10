"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { money, fecha } from "@/lib/format";
import { PASOS, etapaIndex, etapaProgreso, tiempoDesde } from "@/lib/radicacion";
import { aprobarRadicacion } from "./actions";

export type ProcesoRow = {
  id: string;
  codigo: string | null;
  etapa: string | null;
  num_clientes: number | null;
  valor_asegurado: number | null;
  created_at: string | null;
  excel_key: string | null;
  paz_salvo_key: string | null;
  inmobiliaria: { razon_social: string | null; codigo: string | null } | null;
};

export type Cliente = { nombre: string | null; documento: string | null };

function etapaPill(etapa: string | null) {
  const e = (etapa ?? "").toUpperCase();
  if (e === "INGRESADA" || e === "APROBADA") return "pill pill-ok";
  if (e === "CANCELADA") return "pill pill-danger";
  if (e === "PENDIENTE_INGRESO") return "pill pill-warn";
  if (e === "FIRMADO" || e === "EN_VALIDACION") return "pill pill-info";
  if (e === "EXCEL_SUBIDO" || e === "PAZ_SALVO") return "pill pill-warn";
  return "pill pill-brand"; // INICIADA
}

function titulo(n: string | null): string {
  if (!n) return "—";
  return n.toLowerCase().replace(/\b\p{L}/gu, (c) => c.toUpperCase());
}

export function ProcesosTable({
  rows,
  clientes,
}: {
  rows: ProcesoRow[];
  clientes: Record<string, Cliente[]>;
}) {
  const router = useRouter();
  const [sel, setSel] = useState<ProcesoRow | null>(null);
  const [busy, setBusy] = useState(false);
  const activos = rows.filter((r) => r.etapa !== "INGRESADA" && r.etapa !== "CANCELADA").length;

  async function aprobar(id: string) {
    if (busy) return;
    setBusy(true);
    try {
      await aprobarRadicacion(id);
      setSel(null);
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="tablewrap">
        <div className="tscroll">
          <table>
            <thead>
              <tr>
                <th>Radicación</th>
                <th>Inmobiliaria</th>
                <th>Etapa</th>
                <th>Avance</th>
                <th>Clientes</th>
                <th>Valor asegurado</th>
                <th>Iniciado</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const prog = etapaProgreso(r.etapa);
                return (
                  <tr key={r.id} onClick={() => setSel(r)} style={{ cursor: "pointer" }}>
                    <td className="mono">{r.codigo}</td>
                    <td className="strong">{r.inmobiliaria?.razon_social ?? "—"}</td>
                    <td>
                      <span className={etapaPill(r.etapa)}>{r.etapa}</span>
                    </td>
                    <td style={{ minWidth: 110 }}>
                      <div
                        style={{
                          height: 6,
                          background: "var(--line)",
                          borderRadius: 99,
                          overflow: "hidden",
                        }}
                      >
                        <div
                          style={{
                            width: `${r.etapa === "CANCELADA" ? 0 : prog}%`,
                            height: "100%",
                            background: "var(--brand)",
                          }}
                        />
                      </div>
                    </td>
                    <td className="mono">{r.num_clientes ?? "—"}</td>
                    <td className="mono">
                      {r.valor_asegurado != null ? money(r.valor_asegurado) : "—"}
                    </td>
                    <td>{tiempoDesde(r.created_at)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="tfoot">
          {rows.length} proceso(s) · {activos} activo(s)
        </div>
      </div>

      {sel && (
        <div className="modal-overlay" onClick={() => setSel(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <div>
                <h2>{sel.inmobiliaria?.razon_social ?? "—"}</h2>
                <div className="sub">
                  {sel.codigo} · {sel.num_clientes ?? 0} clientes
                </div>
              </div>
              <span className={etapaPill(sel.etapa)}>{sel.etapa}</span>
              <button className="modal-x" onClick={() => setSel(null)} aria-label="Cerrar">
                ✕
              </button>
            </div>

            <div className="modal-body">
              {sel.etapa === "CANCELADA" ? (
                <div className="banner warn" style={{ marginBottom: 18 }}>
                  <span>🚫</span>
                  <div>Proceso cancelado por la inmobiliaria. Los clientes volvieron a preaprobados.</div>
                </div>
              ) : (
                <div style={{ marginBottom: 18 }}>
                  <div
                    style={{
                      height: 8,
                      background: "var(--line)",
                      borderRadius: 99,
                      overflow: "hidden",
                      marginBottom: 12,
                    }}
                  >
                    <div
                      style={{
                        width: `${etapaProgreso(sel.etapa)}%`,
                        height: "100%",
                        background: "linear-gradient(90deg,var(--brand),var(--brand-2))",
                      }}
                    />
                  </div>
                  {PASOS.map((p, i) => {
                    const idx = etapaIndex(sel.etapa);
                    const estado = i < idx ? "hecho" : i === idx ? "actual" : "pendiente";
                    return (
                      <div
                        key={p.etapa}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 10,
                          padding: "4px 0",
                          opacity: estado === "pendiente" ? 0.5 : 1,
                        }}
                      >
                        <span
                          style={{
                            width: 20,
                            height: 20,
                            borderRadius: 99,
                            flex: "none",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            fontSize: 10,
                            fontWeight: 700,
                            color: estado === "pendiente" ? "var(--muted)" : "#fff",
                            background:
                              estado === "hecho"
                                ? "var(--success)"
                                : estado === "actual"
                                  ? "var(--brand)"
                                  : "var(--bg-2)",
                          }}
                        >
                          {estado === "hecho" ? "✓" : i + 1}
                        </span>
                        <span style={{ fontSize: ".85rem", fontWeight: estado === "actual" ? 600 : 400 }}>
                          {estado === "hecho" ? p.hecho : p.titulo}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}

              <dl className="dl">
                <dt>Valor asegurado</dt>
                <dd>{sel.valor_asegurado != null ? money(sel.valor_asegurado) : "—"}</dd>
                <dt>Clientes</dt>
                <dd>{sel.num_clientes ?? "—"}</dd>
                <dt>Iniciado</dt>
                <dd>
                  {fecha(sel.created_at)} · {tiempoDesde(sel.created_at)}
                </dd>
              </dl>

              <div className="modal-sec">
                <h3>Clientes de la radicación</h3>
                <div className="tscroll" style={{ maxHeight: 240, overflowY: "auto" }}>
                  <table>
                    <thead>
                      <tr>
                        <th>Cliente</th>
                        <th>Cédula</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(clientes[sel.id] ?? []).map((c, i) => (
                        <tr key={i}>
                          <td className="strong">{titulo(c.nombre)}</td>
                          <td className="mono">{c.documento ?? "—"}</td>
                        </tr>
                      ))}
                      {(clientes[sel.id] ?? []).length === 0 && (
                        <tr>
                          <td colSpan={2} className="msg" style={{ padding: 16 }}>
                            Sin clientes registrados.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="modal-sec" style={{ marginTop: 18 }}>
                <h3>Documentos y validación</h3>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
                  {sel.excel_key ? (
                    <a
                      href={sel.excel_key}
                      target="_blank"
                      rel="noreferrer"
                      className="btn btn-outline btn-sm"
                    >
                      📊 Excel de radicación
                    </a>
                  ) : (
                    <span className="pill pill-muted">Sin Excel</span>
                  )}
                  {sel.paz_salvo_key ? (
                    <a
                      href={sel.paz_salvo_key}
                      target="_blank"
                      rel="noreferrer"
                      className="btn btn-outline btn-sm"
                    >
                      📄 Paz y salvo firmado
                    </a>
                  ) : (
                    <span className="pill pill-muted">Sin paz y salvo</span>
                  )}
                </div>
                {sel.etapa === "EN_VALIDACION" ? (
                  <button
                    className="btn btn-purple"
                    disabled={busy}
                    onClick={() => aprobar(sel.id)}
                  >
                    {busy ? "Aprobando…" : "✅ Dar visto bueno"}
                  </button>
                ) : sel.etapa === "APROBADA" ? (
                  <div style={{ fontSize: ".82rem", color: "var(--success)" }}>
                    ✅ Visto bueno dado. Esperando que la inmobiliaria confirme el ingreso.
                  </div>
                ) : (
                  <div style={{ fontSize: ".82rem", color: "var(--muted)" }}>
                    La aprobación se habilita cuando la inmobiliaria sube el paz y salvo firmado.
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
