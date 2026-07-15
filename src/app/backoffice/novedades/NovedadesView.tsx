"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { fecha, money } from "@/lib/format";
import type { Semaforo } from "@/lib/config";
import { aplicarRetiro, cancelarRetiro, pausarRetiro, aplicarRetencion } from "./actions";

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

function titulo(n: string | null | undefined): string {
  if (!n) return "—";
  return n.toLowerCase().replace(/\b\p{L}/gu, (c) => c.toUpperCase());
}
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

  // Mantener el modal sincronizado si cambian los datos.
  const selActual = sel ? grupos.find((g) => g.id === sel.id) ?? null : null;

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

      <div className="tablewrap">
        {grupos.length === 0 ? (
          <div className="empty">
            <div className="ic">🗂️</div>
            <div className="msg">No hay {TABS.find((t) => t.key === tab)?.label.toLowerCase()} este mes.</div>
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
                        <td style={{ textAlign: "right", color: "var(--muted)" }}>ver detalle →</td>
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

      {selActual && (
        <DetalleModal grupo={selActual} tab={tab} onClose={() => setSel(null)} />
      )}
    </>
  );
}

function DetalleModal({ grupo, tab, onClose }: { grupo: Grupo; tab: string; onClose: () => void }) {
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <div>
            <h2>{grupo.razon}</h2>
            <div className="sub">
              {grupo.items.length} {TABS.find((t) => t.key === tab)?.label.toLowerCase()} este mes
            </div>
          </div>
          <button className="modal-x" onClick={onClose} aria-label="Cerrar">
            ✕
          </button>
        </div>
        <div className="modal-body">
          {grupo.items.map((n) =>
            tab === "RETIRO" ? (
              <RetiroItem key={n.id} n={n} />
            ) : (
              <div className="docbox" key={n.id}>
                <span className="di">{tab === "INGRESO" ? "➕" : "📈"}</span>
                <div className="dinfo">
                  <div className="dt">
                    {titulo(n.contrato?.estudio?.persona?.nombre)} · {n.contrato?.codigo ?? "—"}
                  </div>
                  <div className="dd">
                    {tab === "AUMENTO" && n.payload_nuevo?.canon != null
                      ? `${money(n.payload_anterior?.canon ?? 0)} → ${money(n.payload_nuevo.canon)}`
                      : "Ingreso a fianza"}{" "}
                    · {fecha(n.created_at)}
                  </div>
                </div>
                <span className="pill pill-ok">{n.estado}</span>
              </div>
            ),
          )}
        </div>
      </div>
    </div>
  );
}

function estadoRetiroPill(estado: string | null) {
  if (estado === "APLICADA") return "pill pill-ok";
  if (estado === "RECHAZADA") return "pill pill-muted";
  if (estado === "PENDIENTE_APROBACION") return "pill pill-info";
  return "pill pill-warn"; // SOLICITADA
}

function RetiroItem({ n }: { n: NovedadRow }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [retencion, setRetencion] = useState(false);
  const [tasa, setTasa] = useState("");
  const [integral, setIntegral] = useState("");
  const [penal, setPenal] = useState("");

  const gestionable = n.estado === "SOLICITADA" || n.estado === "PENDIENTE_APROBACION";

  async function run(fn: () => Promise<void>) {
    setBusy(true);
    try {
      await fn();
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className="docbox"
      style={{ flexDirection: "column", alignItems: "stretch", gap: 10 }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <span className="di">🚪</span>
        <div className="dinfo">
          <div className="dt">
            {titulo(n.contrato?.estudio?.persona?.nombre)} · {n.contrato?.codigo ?? "—"}
          </div>
          <div className="dd">
            {(n.motivo ?? "—").replace(/_/g, " ").toLowerCase()} · {fecha(n.created_at)}
            {n.estado === "PENDIENTE_APROBACION" && " · en retención (pausado)"}
          </div>
        </div>
        <span className={estadoRetiroPill(n.estado)}>{n.estado}</span>
      </div>

      {gestionable && (
        <>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            <button className="btn btn-purple btn-sm" disabled={busy} onClick={() => run(() => aplicarRetiro(n.id))}>
              Aplicar retiro
            </button>
            <button
              className="btn btn-outline btn-sm"
              disabled={busy}
              onClick={() => run(() => cancelarRetiro(n.id))}
            >
              Cancelar (retener)
            </button>
            {n.estado === "SOLICITADA" && (
              <button
                className="btn btn-outline btn-sm"
                disabled={busy}
                onClick={() => run(() => pausarRetiro(n.id))}
              >
                Pausar
              </button>
            )}
            <button
              className="btn btn-outline btn-sm"
              onClick={() => setRetencion((v) => !v)}
              style={{ marginLeft: "auto" }}
            >
              {retencion ? "Ocultar retención" : "Retención / mejorar términos"}
            </button>
          </div>

          {retencion && (
            <div
              style={{
                background: "var(--bg-2)",
                border: "1px solid var(--line)",
                borderRadius: 10,
                padding: 12,
              }}
            >
              <div style={{ fontSize: ".8rem", color: "var(--muted)", marginBottom: 8 }}>
                Mejora los términos para retener (invisible para la inmobiliaria).
              </div>
              <div className="row3">
                <div className="field" style={{ marginBottom: 8 }}>
                  <label>Nueva tasa (%)</label>
                  <input value={tasa} onChange={(e) => setTasa(e.target.value)} placeholder="ej: 1,20" />
                </div>
                <div className="field" style={{ marginBottom: 8 }}>
                  <label>Amparo integral gratis ($)</label>
                  <input value={integral} onChange={(e) => setIntegral(e.target.value)} placeholder="1000000" />
                </div>
                <div className="field" style={{ marginBottom: 8 }}>
                  <label>Cláusula penal gratis ($)</label>
                  <input value={penal} onChange={(e) => setPenal(e.target.value)} placeholder="0" />
                </div>
              </div>
              <div style={{ display: "flex", gap: 6 }}>
                <button
                  className="btn btn-purple btn-sm"
                  disabled={busy}
                  onClick={() =>
                    run(() =>
                      aplicarRetencion(n.id, { nuevaTasaPct: tasa, integral, penal, cancelar: true }),
                    )
                  }
                >
                  Aplicar y retener
                </button>
                <button
                  className="btn btn-outline btn-sm"
                  disabled={busy}
                  onClick={() =>
                    run(() =>
                      aplicarRetencion(n.id, { nuevaTasaPct: tasa, integral, penal, cancelar: false }),
                    )
                  }
                >
                  Aplicar y pausar (sigo negociando)
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
