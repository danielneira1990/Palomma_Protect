"use client";

import { useState } from "react";
import { fecha } from "@/lib/format";

export type ClienteEstudio = {
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
};

function titulo(n: string | null): string {
  if (!n) return "—";
  return n.toLowerCase().replace(/\b\p{L}/gu, (c) => c.toUpperCase());
}

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

export function ClientesRadicacion({ rows }: { rows: ClienteEstudio[] }) {
  const [sel, setSel] = useState<ClienteEstudio | null>(null);

  return (
    <>
      <div className="tablewrap">
        {rows.length === 0 ? (
          <div className="empty">
            <div className="ic">👥</div>
            <div className="msg">Esta radicación no tiene clientes registrados.</div>
          </div>
        ) : (
          <>
            <div className="tscroll">
              <table>
                <thead>
                  <tr>
                    <th>Cliente</th>
                    <th>Cédula</th>
                    <th>Correo</th>
                    <th>Teléfono</th>
                    <th>Tier</th>
                    <th>Score</th>
                    <th>Estado</th>
                    <th>Ingreso</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => {
                    const ing = ingresoPill(r.estado_ingreso);
                    return (
                      <tr key={r.id} onClick={() => setSel(r)} style={{ cursor: "pointer" }}>
                        <td className="strong">{titulo(r.persona?.nombre ?? null)}</td>
                        <td className="mono">{r.persona?.documento ?? "—"}</td>
                        <td>{r.persona?.email ?? "—"}</td>
                        <td className="mono">{r.persona?.telefono ?? "—"}</td>
                        <td>{r.tier ? <span className="pill pill-brand">{r.tier}</span> : "—"}</td>
                        <td className="mono strong">{r.score ?? "—"}</td>
                        <td>
                          <span className={estadoPill(r.estado)}>{r.estado}</span>
                        </td>
                        <td>{ing ? <span className={ing}>{r.estado_ingreso}</span> : "—"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="tfoot">{rows.length} cliente(s) · click en uno para ver su estudio</div>
          </>
        )}
      </div>

      {sel && <DetalleModal estudio={sel} onClose={() => setSel(null)} />}
    </>
  );
}

function DetalleModal({ estudio, onClose }: { estudio: ClienteEstudio; onClose: () => void }) {
  const ing = estudio.estado_ingreso;
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <div>
            <h2>{titulo(estudio.persona?.nombre ?? null)}</h2>
            <div className="sub">
              {estudio.codigo} · {estudio.persona?.documento ?? "—"}
            </div>
          </div>
          <span className={estadoPill(estudio.estado)}>{estudio.estado}</span>
          <button className="modal-x" onClick={onClose} aria-label="Cerrar">
            ✕
          </button>
        </div>

        <div className="modal-body">
          <dl className="dl">
            <dt>Tipo</dt>
            <dd>{estudio.tipo_estudio ?? "—"}</dd>
            <dt>Score</dt>
            <dd>{estudio.score ?? "—"}</dd>
            <dt>Tier</dt>
            <dd>{estudio.tier ? <span className="pill pill-brand">{estudio.tier}</span> : "—"}</dd>
            <dt>Decisión</dt>
            <dd>{estudio.decision_fianza ?? "—"}</dd>
            <dt>Vigencia</dt>
            <dd>{fecha(estudio.vigencia_hasta)}</dd>
            <dt>Ingreso</dt>
            <dd>{ing ?? "—"}</dd>
            {ing === "INGRESADO" && (
              <>
                <dt>Fecha de ingreso</dt>
                <dd>{fecha(estudio.fecha_ingreso)}</dd>
              </>
            )}
            <dt>Correo</dt>
            <dd>{estudio.persona?.email ?? "—"}</dd>
            <dt>Teléfono</dt>
            <dd>{estudio.persona?.telefono ?? "—"}</dd>
          </dl>

          <button className="btn btn-outline btn-sm" onClick={onClose} style={{ marginTop: 6 }}>
            ← Volver a los radicados
          </button>
        </div>
      </div>
    </div>
  );
}
