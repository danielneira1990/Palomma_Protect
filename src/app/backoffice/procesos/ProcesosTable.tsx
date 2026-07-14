"use client";

import { useState } from "react";
import Link from "next/link";
import { money, fecha } from "@/lib/format";
import { PASOS, etapaIndex, etapaProgreso, tiempoDesde } from "@/lib/radicacion";

export type ProcesoRow = {
  id: string;
  codigo: string | null;
  etapa: string | null;
  num_clientes: number | null;
  valor_asegurado: number | null;
  created_at: string | null;
  updated_at: string | null;
  excel_key: string | null;
  paz_salvo_key: string | null;
  firma_doc_id: string | null;
  firma_email: string | null;
  firma_metodo: string | null;
  firma_at: string | null;
  ultimo_error: string | null;
  ultimo_error_at: string | null;
  inmobiliaria: {
    razon_social: string | null;
    codigo: string | null;
    persona_contacto: string | null;
    email_contacto: string | null;
    telefono: string | null;
  } | null;
};

const TERMINALES = ["INGRESADA", "PENDIENTE_INGRESO", "CANCELADA"];

/** En curso → contador "hace X"; finalizada → fecha de finalización. */
function tiempoOFin(etapa: string | null, created: string | null, fin: string | null): string {
  if (TERMINALES.includes((etapa ?? "").toUpperCase())) return `Finalizó ${fecha(fin)}`;
  return tiempoDesde(created);
}

function etapaPill(etapa: string | null) {
  const e = (etapa ?? "").toUpperCase();
  if (e === "INGRESADA") return "pill pill-ok";
  if (e === "CANCELADA") return "pill pill-danger";
  if (e === "PENDIENTE_INGRESO") return "pill pill-warn";
  if (e === "FIRMADO" || e === "APROBADA" || e === "EN_VALIDACION") return "pill pill-info";
  if (e === "EXCEL_SUBIDO" || e === "PAZ_SALVO") return "pill pill-warn";
  return "pill pill-brand"; // INICIADA
}

export function ProcesosTable({ rows }: { rows: ProcesoRow[] }) {
  const [sel, setSel] = useState<ProcesoRow | null>(null);
  const activos = rows.filter((r) => r.etapa !== "INGRESADA" && r.etapa !== "CANCELADA").length;
  const atascados = rows.filter((r) => r.ultimo_error).length;

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
                      {r.ultimo_error && (
                        <span
                          className="pill pill-danger"
                          style={{ marginLeft: 6 }}
                          title={r.ultimo_error}
                        >
                          ⚠️ atascado
                        </span>
                      )}
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
                    <td>{tiempoOFin(r.etapa, r.created_at, r.updated_at)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="tfoot">
          {rows.length} proceso(s) · {activos} activo(s)
          {atascados > 0 && ` · ${atascados} atascado(s) — necesita(n) ayuda`}
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
              {sel.ultimo_error && (
                <div className="banner warn" style={{ marginBottom: 18 }}>
                  <span>⚠️</span>
                  <div style={{ fontSize: ".84rem" }}>
                    <b>Cliente atascado — se le rebotó el proceso.</b>
                    <div style={{ margin: "4px 0" }}>{sel.ultimo_error}</div>
                    {sel.ultimo_error_at && (
                      <div style={{ color: "var(--muted)" }}>{tiempoDesde(sel.ultimo_error_at)}</div>
                    )}
                    <div style={{ marginTop: 8 }}>
                      <b>Contacta a la inmobiliaria para ayudar:</b>{" "}
                      {sel.inmobiliaria?.persona_contacto ?? "—"}
                      {sel.inmobiliaria?.email_contacto && (
                        <>
                          {" · "}
                          <a href={`mailto:${sel.inmobiliaria.email_contacto}`}>
                            {sel.inmobiliaria.email_contacto}
                          </a>
                        </>
                      )}
                      {sel.inmobiliaria?.telefono && (
                        <>
                          {" · "}
                          <a href={`tel:${sel.inmobiliaria.telefono}`}>{sel.inmobiliaria.telefono}</a>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              )}

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
                  {fecha(sel.created_at)} · {tiempoOFin(sel.etapa, sel.created_at, sel.updated_at)}
                </dd>
              </dl>

              <div className="modal-sec">
                <h3>Clientes</h3>
                <Link
                  href={`/backoffice/procesos/${sel.id}`}
                  className="btn btn-outline btn-sm"
                >
                  👥 Ver clientes ({sel.num_clientes ?? 0})
                </Link>
              </div>

              <div className="modal-sec" style={{ marginTop: 18 }}>
                <h3>Documentos</h3>
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

                {sel.firma_doc_id || sel.firma_email ? (
                  <div
                    className="banner"
                    style={{
                      background: "var(--sbg)",
                      border: "1px solid rgba(29,158,117,.18)",
                      color: "var(--success)",
                      marginBottom: 0,
                    }}
                  >
                    <span>🔏</span>
                    <div style={{ fontSize: ".82rem" }}>
                      <b>Firma validada (AUCO).</b> Firmó el representante legal
                      {sel.firma_email ? ` (${sel.firma_email})` : ""}
                      {sel.firma_metodo ? ` · ${sel.firma_metodo}` : ""}
                      {sel.firma_doc_id ? ` · doc ${sel.firma_doc_id}` : ""}
                      {sel.firma_at ? ` · ${fecha(sel.firma_at)}` : ""}.
                    </div>
                  </div>
                ) : (
                  <div style={{ fontSize: ".82rem", color: "var(--muted)" }}>
                    Monitoreo: Palomma ya no aprueba la radicación. La inmobiliaria firma el
                    paz y salvo (validado contra AUCO) y hace el ingreso ella misma.
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
