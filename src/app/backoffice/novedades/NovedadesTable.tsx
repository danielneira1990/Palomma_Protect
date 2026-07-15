"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { fecha, money } from "@/lib/format";
import type { Semaforo } from "@/lib/config";
import { aplicarRetiro, rechazarNovedad } from "./actions";

export type NovedadRow = {
  id: string;
  codigo: string | null;
  tipo: string | null;
  motivo: string | null;
  estado: string | null;
  actor: string | null;
  created_at: string | null;
  payload_anterior: { canon?: number } | null;
  payload_nuevo: { canon?: number } | null;
  id_inmobiliaria: string | null;
  inmobiliaria: { razon_social: string | null } | null;
  contrato: { codigo: string | null; estudio: { persona: { nombre: string | null } | null } | null } | null;
};

export type SemaforoInfo = { pct: number; color: Semaforo };

const COLOR: Record<Semaforo, { bg: string; label: string }> = {
  verde: { bg: "var(--success)", label: "OK" },
  amarillo: { bg: "#e0a400", label: "Alerta" },
  rojo: { bg: "var(--danger)", label: "Riesgo" },
};

function tipoPill(tipo: string | null) {
  const t = (tipo ?? "").toUpperCase();
  if (t === "INGRESO") return "pill pill-ok";
  if (t === "RETIRO") return "pill pill-danger";
  if (t === "AUMENTO") return "pill pill-info";
  return "pill pill-brand";
}

function estadoPill(estado: string | null) {
  const e = (estado ?? "").toUpperCase();
  if (e === "APLICADA") return "pill pill-ok";
  if (e === "RECHAZADA") return "pill pill-muted";
  if (e === "SOLICITADA" || e === "PENDIENTE_APROBACION") return "pill pill-warn";
  return "pill pill-brand";
}

function titulo(n: string | null | undefined): string {
  if (!n) return "—";
  return n.toLowerCase().replace(/\b\p{L}/gu, (c) => c.toUpperCase());
}

const pctTxt = (p: number) => `${(p * 100).toLocaleString("es-CO", { maximumFractionDigits: 1 })}%`;

export function NovedadesTable({
  rows,
  semaforos,
}: {
  rows: NovedadRow[];
  semaforos: Record<string, SemaforoInfo>;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);

  const pendientes = rows.filter((r) => r.tipo === "RETIRO" && r.estado === "SOLICITADA");

  async function accion(fn: (id: string) => Promise<void>, id: string) {
    setBusy(id);
    try {
      await fn(id);
      router.refresh();
    } finally {
      setBusy(null);
    }
  }

  return (
    <>
      {/* Cola de revisión de retiros */}
      {pendientes.length > 0 && (
        <div className="card card-pad" style={{ marginBottom: 18 }}>
          <h3 style={{ marginTop: 0 }}>
            Cola de revisión · retiros pendientes ({pendientes.length})
          </h3>
          <p style={{ fontSize: ".85rem", color: "var(--muted)", marginTop: -4 }}>
            Los retiros no se aplican solos: aquí decides. El semáforo mide los retiros del mes de
            cada inmobiliaria (por número de contratos).
          </p>
          <div className="tscroll">
            <table>
              <thead>
                <tr>
                  <th>Novedad</th>
                  <th>Inmobiliaria</th>
                  <th>Contrato</th>
                  <th>Motivo</th>
                  <th>Semáforo del mes</th>
                  <th>Solicitado</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {pendientes.map((r) => {
                  const s = r.id_inmobiliaria ? semaforos[r.id_inmobiliaria] : undefined;
                  const col = s ? COLOR[s.color] : null;
                  return (
                    <tr key={r.id}>
                      <td className="mono">{r.codigo}</td>
                      <td className="strong">{r.inmobiliaria?.razon_social ?? "—"}</td>
                      <td className="mono">{r.contrato?.codigo ?? "—"}</td>
                      <td>{(r.motivo ?? "—").replace(/_/g, " ").toLowerCase()}</td>
                      <td>
                        {s && col ? (
                          <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                            <span
                              style={{
                                width: 10,
                                height: 10,
                                borderRadius: 99,
                                background: col.bg,
                                display: "inline-block",
                              }}
                            />
                            {pctTxt(s.pct)} · {col.label}
                          </span>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td>{fecha(r.created_at)}</td>
                      <td>
                        <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
                          <button
                            className="btn btn-purple btn-sm"
                            disabled={busy === r.id}
                            onClick={() => accion(aplicarRetiro, r.id)}
                          >
                            {busy === r.id ? "…" : "Aplicar"}
                          </button>
                          <button
                            className="btn btn-outline btn-sm"
                            disabled={busy === r.id}
                            onClick={() => accion(rechazarNovedad, r.id)}
                          >
                            Rechazar
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Histórico completo */}
      <div className="tablewrap">
        {rows.length === 0 ? (
          <div className="empty">
            <div className="ic">🗂️</div>
            <div className="msg">Aún no hay novedades. Se generan al ingresar, retirar o aumentar.</div>
          </div>
        ) : (
          <>
            <div className="tscroll">
              <table>
                <thead>
                  <tr>
                    <th>Novedad</th>
                    <th>Tipo</th>
                    <th>Inmobiliaria</th>
                    <th>Contrato</th>
                    <th>Arrendatario</th>
                    <th>Detalle</th>
                    <th>Quién</th>
                    <th>Fecha</th>
                    <th>Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.id}>
                      <td className="mono">{r.codigo}</td>
                      <td>
                        <span className={tipoPill(r.tipo)}>{r.tipo}</span>
                      </td>
                      <td>{r.inmobiliaria?.razon_social ?? "—"}</td>
                      <td className="mono">{r.contrato?.codigo ?? "—"}</td>
                      <td className="strong">{titulo(r.contrato?.estudio?.persona?.nombre)}</td>
                      <td>
                        {r.tipo === "AUMENTO" && r.payload_nuevo?.canon != null
                          ? `${money(r.payload_anterior?.canon ?? 0)} → ${money(r.payload_nuevo.canon)}`
                          : r.motivo
                            ? r.motivo.replace(/_/g, " ").toLowerCase()
                            : "—"}
                      </td>
                      <td>{r.actor ?? "—"}</td>
                      <td>{fecha(r.created_at)}</td>
                      <td>
                        <span className={estadoPill(r.estado)}>{r.estado}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="tfoot">{rows.length} novedad(es)</div>
          </>
        )}
      </div>
    </>
  );
}
