"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import type { Semaforo } from "@/lib/config";

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
  contrato: {
    codigo: string | null;
    canon: number | null;
    estudio: { persona: { nombre: string | null } | null } | null;
  } | null;
};

export type SemaforoInfo = { pct: number; color: Semaforo };

const TABS = [
  { key: "INGRESO", label: "Ingresos" },
  { key: "RETIRO", label: "Retiros" },
  { key: "AUMENTO", label: "Aumentos" },
];

const COLOR: Record<Semaforo, { bg: string; label: string }> = {
  verde: { bg: "var(--success)", label: "OK" },
  amarillo: { bg: "#e0a400", label: "Alerta" },
  rojo: { bg: "var(--danger)", label: "Riesgo" },
};

const pctTxt = (p: number) => `${(p * 100).toLocaleString("es-CO", { maximumFractionDigits: 1 })}%`;

type Grupo = { id: string; razon: string; items: NovedadRow[]; pendientes: number };

export function NovedadesView({
  rows,
  semaforos,
}: {
  rows: NovedadRow[];
  semaforos: Record<string, SemaforoInfo>;
}) {
  const [tab, setTab] = useState("RETIRO");
  const [sel, setSel] = useState<Grupo | null>(null);

  const grupos = useMemo(() => {
    const m = new Map<string, Grupo>();
    for (const r of rows.filter((r) => r.tipo === tab)) {
      const id = r.id_inmobiliaria ?? "—";
      if (!m.has(id)) m.set(id, { id, razon: r.inmobiliaria?.razon_social ?? "—", items: [], pendientes: 0 });
      const g = m.get(id)!;
      g.items.push(r);
      if (r.estado === "SOLICITADA" || r.estado === "PENDIENTE_APROBACION") g.pendientes++;
    }
    return [...m.values()].sort((a, b) => b.items.length - a.items.length);
  }, [rows, tab]);

  const totalTab = grupos.reduce((a, g) => a + g.items.length, 0);
  const pendientes = grupos.reduce((a, g) => a + g.pendientes, 0);
  const enAlerta = grupos.filter((g) => {
    const s = semaforos[g.id];
    return s && s.color !== "verde";
  }).length;
  const tabLabel = TABS.find((t) => t.key === tab)?.label ?? "";

  return (
    <>
      <div className="tabs" style={{ marginBottom: 14 }}>
        {TABS.map((t) => (
          <button
            key={t.key}
            className={`tab${tab === t.key ? " on" : ""}`}
            onClick={() => {
              setTab(t.key);
              setSel(null);
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="kpis" style={{ gridTemplateColumns: "repeat(3,1fr)" }}>
        <div className="kpi">
          <div className="kt">{tabLabel} del mes</div>
          <div className="kn">{totalTab}</div>
        </div>
        <div className="kpi">
          <div className="kt">Inmobiliarias</div>
          <div className="kn">{grupos.length}</div>
        </div>
        {tab === "RETIRO" ? (
          <div className="kpi">
            <div className="kt">Pendientes · alerta</div>
            <div className="kn">{pendientes}</div>
            <div className="kd">{enAlerta} inmobiliaria(s) en amarillo/rojo</div>
          </div>
        ) : (
          <div className="kpi">
            <div className="kt">Movimientos</div>
            <div className="kn">{totalTab}</div>
          </div>
        )}
      </div>

      <div className="tablewrap">
        {grupos.length === 0 ? (
          <div className="empty">
            <div className="ic">🗂️</div>
            <div className="msg">No hay {tabLabel.toLowerCase()} este mes.</div>
          </div>
        ) : (
          <>
            <div className="tscroll">
              <table>
                <thead>
                  <tr>
                    <th>Inmobiliaria</th>
                    <th>Cantidad</th>
                    {tab === "RETIRO" && (
                      <>
                        <th>Pendientes</th>
                        <th>Semáforo del mes</th>
                      </>
                    )}
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {grupos.map((g) => {
                    const s = semaforos[g.id];
                    const col = s ? COLOR[s.color] : null;
                    return (
                      <tr key={g.id} onClick={() => setSel(g)} style={{ cursor: "pointer" }}>
                        <td className="strong">{g.razon}</td>
                        <td className="mono">{g.items.length}</td>
                        {tab === "RETIRO" && (
                          <>
                            <td className="mono">{g.pendientes || "—"}</td>
                            <td>
                              {s && col ? (
                                <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                                  <span
                                    style={{ width: 10, height: 10, borderRadius: 99, background: col.bg }}
                                  />
                                  {pctTxt(s.pct)} · {col.label}
                                </span>
                              ) : (
                                "—"
                              )}
                            </td>
                          </>
                        )}
                        <td style={{ textAlign: "right", color: "var(--muted)" }}>resumen →</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="tfoot">{grupos.length} inmobiliaria(s)</div>
          </>
        )}
      </div>

      {sel && (
        <ResumenModal
          grupo={grupos.find((g) => g.id === sel.id) ?? sel}
          tab={tab}
          tabLabel={tabLabel}
          semaforo={semaforos[sel.id]}
          onClose={() => setSel(null)}
        />
      )}
    </>
  );
}

function ResumenModal({
  grupo,
  tab,
  tabLabel,
  semaforo,
  onClose,
}: {
  grupo: Grupo;
  tab: string;
  tabLabel: string;
  semaforo: SemaforoInfo | undefined;
  onClose: () => void;
}) {
  const aplicados = grupo.items.filter((i) => i.estado === "APLICADA").length;
  const col = semaforo ? COLOR[semaforo.color] : null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <div>
            <h2>{grupo.razon}</h2>
            <div className="sub">Resumen de {tabLabel.toLowerCase()} del mes</div>
          </div>
          <button className="modal-x" onClick={onClose} aria-label="Cerrar">
            ✕
          </button>
        </div>
        <div className="modal-body">
          <dl className="dl">
            <dt>{tabLabel} este mes</dt>
            <dd>{grupo.items.length}</dd>
            <dt>Aplicados</dt>
            <dd>{aplicados}</dd>
            {tab === "RETIRO" && (
              <>
                <dt>Pendientes</dt>
                <dd>{grupo.pendientes}</dd>
                <dt>Semáforo del mes</dt>
                <dd>
                  {semaforo && col ? (
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                      <span style={{ width: 10, height: 10, borderRadius: 99, background: col.bg }} />
                      {pctTxt(semaforo.pct)} · {col.label}
                    </span>
                  ) : (
                    "—"
                  )}
                </dd>
              </>
            )}
          </dl>

          <Link href={`/backoffice/novedades/${grupo.id}?tipo=${tab}`} className="btn btn-purple">
            Ver detalle uno a uno →
          </Link>
        </div>
      </div>
    </div>
  );
}
