"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { money, fecha } from "@/lib/format";
import { registrarRetiroMasivo, registrarAumentoMasivo } from "./actions";

export type ContratoPortalRow = {
  id: string;
  codigo: string | null;
  inmueble_direccion: string | null;
  tipo_destino: string | null;
  canon: number | null;
  costo_canon_total: number | null;
  estado: string | null;
  fecha_fin: string | null;
  retiro_en_tramite: boolean;
  arrendatario: string | null;
};

export type ContratosKpis = {
  nContratos: number;
  valorAfianzado: number;
  costoMensual: number;
  tasaPromedioPct: string;
  conIntegral: number;
  conPenal: number;
};

const MOTIVOS: { v: string; l: string }[] = [
  { v: "TERMINACION_VENCIMIENTO", l: "Terminación por vencimiento" },
  { v: "MUTUO_ACUERDO", l: "Mutuo acuerdo" },
  { v: "INCUMPLIMIENTO_ARRENDATARIO", l: "Incumplimiento del arrendatario" },
  { v: "VENTA_INMUEBLE", l: "Venta del inmueble" },
  { v: "TRASLADO_AFIANZADORA", l: "Traslado de afianzadora" },
  { v: "OTRO", l: "Otro" },
];

const DIAS_VENCE = 60;

function titulo(n: string | null): string {
  if (!n) return "—";
  return n.toLowerCase().replace(/\b\p{L}/gu, (c) => c.toUpperCase());
}

/** Días hasta la fecha de fin (negativo si ya venció). null si no hay fecha. */
function diasParaVencer(fechaFin: string | null): number | null {
  if (!fechaFin) return null;
  const t = new Date(fechaFin).getTime();
  if (isNaN(t)) return null;
  return Math.floor((t - Date.now()) / 86_400_000);
}

export function ContratosView({
  rows,
  ipcPct,
  kpis,
}: {
  rows: ContratoPortalRow[];
  ipcPct: string;
  kpis: ContratosKpis;
}) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [tipo, setTipo] = useState("");
  const [vencePronto, setVencePronto] = useState(false);
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [modal, setModal] = useState<"aumento" | "retiro" | null>(null);

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    return rows.filter((r) => {
      if (term && !`${r.arrendatario ?? ""} ${r.codigo ?? ""} ${r.inmueble_direccion ?? ""}`.toLowerCase().includes(term))
        return false;
      if (tipo && (r.tipo_destino ?? "").toUpperCase() !== tipo) return false;
      if (vencePronto) {
        const d = diasParaVencer(r.fecha_fin);
        if (d == null || d > DIAS_VENCE) return false;
      }
      return true;
    });
  }, [rows, q, tipo, vencePronto]);

  // Solo se pueden accionar los activos sin retiro en trámite.
  const accionables = filtered.filter((r) => r.estado === "ACTIVO" && !r.retiro_en_tramite);
  const selActivos = [...sel].filter((id) => accionables.some((r) => r.id === id));
  const allChecked = accionables.length > 0 && selActivos.length === accionables.length;

  function toggle(id: string) {
    setSel((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }
  function toggleAll() {
    setSel(allChecked ? new Set() : new Set(accionables.map((r) => r.id)));
  }

  return (
    <>
      <div className="kpis">
        <div className="kpi">
          <div className="kt">Contratos activos</div>
          <div className="kn">{kpis.nContratos}</div>
        </div>
        <div className="kpi">
          <div className="kt">Valor afianzado</div>
          <div className="kn">{money(kpis.valorAfianzado)}</div>
          <div className="kd">canon protegido / mes</div>
        </div>
        <div className="kpi">
          <div className="kt">Tasa promedio</div>
          <div className="kn">{kpis.tasaPromedioPct}</div>
          <div className="kd">ponderada por valor afianzado</div>
        </div>
        <div className="kpi">
          <div className="kt">Coberturas</div>
          <div className="kn">{kpis.conIntegral}</div>
          <div className="kd">con integral · {kpis.conPenal} con cláusula penal</div>
        </div>
      </div>

      <div className="banner info">
        <span>🛡️</span>
        <div>
          Tu cartera afianzada. Filtra los <b>próximos a vencer</b>, selecciona varios y{" "}
          <b>renueva (sube el canon)</b> o <b>retira</b> en bloque. Los retiros se reflejan en las
          próximas horas.
        </div>
      </div>

      {/* Buscador + filtros */}
      <div className="card card-pad" style={{ marginBottom: 14 }}>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-end" }}>
          <div className="field" style={{ marginBottom: 0, flex: "1 1 240px" }}>
            <label>Buscar</label>
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Arrendatario, código o dirección…"
            />
          </div>
          <div className="field" style={{ marginBottom: 0 }}>
            <label>Tipo</label>
            <select value={tipo} onChange={(e) => setTipo(e.target.value)}>
              <option value="">Todos</option>
              <option value="VIVIENDA">Vivienda</option>
              <option value="COMERCIO">Comercio</option>
            </select>
          </div>
          <label
            className="btn btn-outline btn-sm"
            style={{ marginBottom: 0, background: vencePronto ? "var(--brand-tint)" : undefined }}
          >
            <input
              type="checkbox"
              checked={vencePronto}
              onChange={(e) => setVencePronto(e.target.checked)}
              style={{ marginRight: 6 }}
            />
            Próximos a vencer ({DIAS_VENCE} días)
          </label>
        </div>
      </div>

      {/* Barra de acción masiva */}
      {selActivos.length > 0 && (
        <div
          className="banner"
          style={{
            alignItems: "center",
            background: "var(--brand-tint)",
            border: "1px solid rgba(64,18,171,.16)",
            color: "var(--brand)",
          }}
        >
          <span>✔️</span>
          <div style={{ flex: 1 }}>{selActivos.length} contrato(s) seleccionado(s)</div>
          <div style={{ display: "flex", gap: 8 }}>
            <button className="btn btn-purple btn-sm" onClick={() => setModal("aumento")}>
              Renovar / Aumentar canon
            </button>
            <button
              className="btn btn-outline btn-sm"
              style={{ color: "var(--danger)", borderColor: "#f1d4d4", background: "#fff" }}
              onClick={() => setModal("retiro")}
            >
              Retirar
            </button>
          </div>
        </div>
      )}

      <div className="tablewrap">
        {filtered.length === 0 ? (
          <div className="empty">
            <div className="ic">🛡️</div>
            <div className="msg">
              {rows.length === 0 ? "Aún no tienes contratos afianzados." : "Ningún contrato con esos filtros."}
            </div>
          </div>
        ) : (
          <>
            <div className="tscroll">
              <table>
                <thead>
                  <tr>
                    <th style={{ width: 34 }}>
                      <input
                        type="checkbox"
                        checked={allChecked}
                        onChange={toggleAll}
                        aria-label="Seleccionar accionables"
                      />
                    </th>
                    <th>Fianza</th>
                    <th>Arrendatario</th>
                    <th>Inmueble</th>
                    <th>Canon</th>
                    <th>Vence</th>
                    <th>Estado</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((r) => {
                    const d = diasParaVencer(r.fecha_fin);
                    const accionable = r.estado === "ACTIVO" && !r.retiro_en_tramite;
                    return (
                      <tr key={r.id}>
                        <td>
                          {accionable && (
                            <input
                              type="checkbox"
                              checked={sel.has(r.id)}
                              onChange={() => toggle(r.id)}
                              aria-label={`Seleccionar ${r.codigo ?? ""}`}
                            />
                          )}
                        </td>
                        <td className="mono">{r.codigo}</td>
                        <td className="strong">{titulo(r.arrendatario)}</td>
                        <td>{r.inmueble_direccion ?? "—"}</td>
                        <td className="mono">{r.canon != null ? money(r.canon) : "—"}</td>
                        <td>
                          {r.fecha_fin ? (
                            <span
                              className={d != null && d <= DIAS_VENCE ? "pill pill-warn" : undefined}
                            >
                              {fecha(r.fecha_fin)}
                              {d != null && d <= DIAS_VENCE ? (d < 0 ? " · vencido" : " · pronto") : ""}
                            </span>
                          ) : (
                            "—"
                          )}
                        </td>
                        <td>
                          {r.retiro_en_tramite ? (
                            <span className="pill pill-warn">Retiro en trámite</span>
                          ) : (
                            <span className={r.estado === "ACTIVO" ? "pill pill-ok" : "pill pill-muted"}>
                              {r.estado}
                            </span>
                          )}
                        </td>
                        <td>
                          <CertBtn contrato={r} />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="tfoot">
              {filtered.length} de {rows.length} contrato(s)
              {selActivos.length > 0 && ` · ${selActivos.length} seleccionado(s)`}
            </div>
          </>
        )}
      </div>

      {modal === "aumento" && (
        <BulkAumentoModal
          ids={selActivos}
          ipcPct={ipcPct}
          onClose={() => setModal(null)}
          onDone={() => {
            setModal(null);
            setSel(new Set());
            router.refresh();
          }}
        />
      )}
      {modal === "retiro" && (
        <BulkRetiroModal
          ids={selActivos}
          onClose={() => setModal(null)}
          onDone={() => {
            setModal(null);
            setSel(new Set());
            router.refresh();
          }}
        />
      )}
    </>
  );
}

function CertBtn({ contrato }: { contrato: ContratoPortalRow }) {
  const [busy, setBusy] = useState(false);
  async function descargar() {
    setBusy(true);
    try {
      const res = await fetch("/inmobiliaria/contratos/certificado", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contratoId: contrato.id }),
      });
      if (!res.ok) throw new Error();
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `Certificado_${contrato.codigo ?? "fianza"}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      /* noop */
    } finally {
      setBusy(false);
    }
  }
  return (
    <button className="btn btn-outline btn-sm" disabled={busy} onClick={descargar}>
      {busy ? "…" : "📄 Certificado"}
    </button>
  );
}

function BulkAumentoModal({
  ids,
  ipcPct,
  onClose,
  onDone,
}: {
  ids: string[];
  ipcPct: string;
  onClose: () => void;
  onDone: () => void;
}) {
  const [pct, setPct] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [res, setRes] = useState<{ aplicados: number; topados: number } | null>(null);

  async function confirmar() {
    setErr(null);
    setBusy(true);
    try {
      setRes(await registrarAumentoMasivo(ids, pct));
    } catch (e) {
      setErr(e instanceof Error ? e.message : "No se pudo aumentar el canon.");
      setBusy(false);
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <div>
            <h2>Renovar / Aumentar canon</h2>
            <div className="sub">{ids.length} contrato(s)</div>
          </div>
          <button className="modal-x" onClick={onClose} aria-label="Cerrar">
            ✕
          </button>
        </div>
        <div className="modal-body">
          {res ? (
            <>
              <div className="banner info" style={{ marginBottom: 16 }}>
                <span>✅</span>
                <div>
                  Aumentamos el canon de <b>{res.aplicados}</b> contrato(s).
                  {res.topados > 0 && (
                    <> {res.topados} de vivienda se toparon al IPC ({ipcPct}).</>
                  )}
                </div>
              </div>
              <button className="btn btn-purple" onClick={onDone}>
                Entendido
              </button>
            </>
          ) : (
            <>
              {err && (
                <div className="banner warn" style={{ marginBottom: 14 }}>
                  <span>⚠️</span>
                  <div>{err}</div>
                </div>
              )}
              <p style={{ fontSize: ".85rem", marginBottom: 12, color: "var(--muted)" }}>
                Se aplica el mismo % a los seleccionados. En <b>vivienda</b> se topa al{" "}
                <b>IPC ({ipcPct})</b>; en comercio no hay tope.
              </p>
              <div className="field" style={{ marginBottom: 14 }}>
                <label>% de aumento</label>
                <input
                  value={pct}
                  onChange={(e) => setPct(e.target.value)}
                  placeholder="ej: 6,2"
                  inputMode="decimal"
                  style={{ width: 140 }}
                />
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <button className="btn btn-purple" disabled={busy || !pct} onClick={confirmar}>
                  {busy ? "Aplicando…" : "Aplicar aumento"}
                </button>
                <button className="btn btn-outline" disabled={busy} onClick={onClose}>
                  Cancelar
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function BulkRetiroModal({
  ids,
  onClose,
  onDone,
}: {
  ids: string[];
  onClose: () => void;
  onDone: () => void;
}) {
  const [motivo, setMotivo] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [res, setRes] = useState<{ solicitados: number; omitidos: number } | null>(null);

  async function confirmar() {
    setErr(null);
    setBusy(true);
    try {
      setRes(await registrarRetiroMasivo(ids, motivo));
    } catch (e) {
      setErr(e instanceof Error ? e.message : "No se pudo registrar el retiro.");
      setBusy(false);
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <div>
            <h2>Retirar contratos</h2>
            <div className="sub">{ids.length} contrato(s)</div>
          </div>
          <button className="modal-x" onClick={onClose} aria-label="Cerrar">
            ✕
          </button>
        </div>
        <div className="modal-body">
          {res ? (
            <>
              <div className="banner info" style={{ marginBottom: 16 }}>
                <span>✅</span>
                <div>
                  Registramos <b>{res.solicitados}</b> retiro(s). <b>Se reflejan en las próximas
                  horas</b> (máximo 1 día hábil).
                  {res.omitidos > 0 && <> {res.omitidos} se omitieron (ya en trámite).</>}
                </div>
              </div>
              <button className="btn btn-purple" onClick={onDone}>
                Entendido
              </button>
            </>
          ) : (
            <>
              {err && (
                <div className="banner warn" style={{ marginBottom: 14 }}>
                  <span>⚠️</span>
                  <div>{err}</div>
                </div>
              )}
              <div className="field" style={{ marginBottom: 14 }}>
                <label>Motivo del retiro</label>
                <select value={motivo} onChange={(e) => setMotivo(e.target.value)}>
                  <option value="">Selecciona…</option>
                  {MOTIVOS.map((m) => (
                    <option key={m.v} value={m.v}>
                      {m.l}
                    </option>
                  ))}
                </select>
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <button
                  className="btn btn-purple"
                  disabled={busy || !motivo}
                  onClick={confirmar}
                  style={{ background: "var(--danger)" }}
                >
                  {busy ? "Registrando…" : "Confirmar retiro"}
                </button>
                <button className="btn btn-outline" disabled={busy} onClick={onClose}>
                  Cancelar
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
