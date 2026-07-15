"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { money } from "@/lib/format";
import { registrarRetiro, registrarAumento } from "./actions";

export type ContratoPortalRow = {
  id: string;
  codigo: string | null;
  inmueble_direccion: string | null;
  tipo_destino: string | null;
  canon: number | null;
  costo_canon_total: number | null;
  estado: string | null;
  retiro_en_tramite: boolean;
  arrendatario: string | null;
};

const MOTIVOS: { v: string; l: string }[] = [
  { v: "TERMINACION_VENCIMIENTO", l: "Terminación por vencimiento" },
  { v: "MUTUO_ACUERDO", l: "Mutuo acuerdo" },
  { v: "INCUMPLIMIENTO_ARRENDATARIO", l: "Incumplimiento del arrendatario" },
  { v: "VENTA_INMUEBLE", l: "Venta del inmueble" },
  { v: "TRASLADO_AFIANZADORA", l: "Traslado de afianzadora" },
  { v: "OTRO", l: "Otro" },
];

function titulo(n: string | null): string {
  if (!n) return "—";
  return n.toLowerCase().replace(/\b\p{L}/gu, (c) => c.toUpperCase());
}

export function ContratosView({ rows, ipcPct }: { rows: ContratoPortalRow[]; ipcPct: string }) {
  const router = useRouter();
  const [modal, setModal] = useState<{ tipo: "retiro" | "aumento"; c: ContratoPortalRow } | null>(null);

  return (
    <>
      <div className="banner info">
        <span>🛡️</span>
        <div>
          Tu cartera afianzada. Desde aquí puedes <b>aumentar el canon</b> o <b>retirar</b> contratos.
          Los retiros se reflejan en las próximas horas.
        </div>
      </div>

      <div className="tablewrap">
        {rows.length === 0 ? (
          <div className="empty">
            <div className="ic">🛡️</div>
            <div className="msg">Aún no tienes contratos afianzados.</div>
          </div>
        ) : (
          <>
            <div className="tscroll">
              <table>
                <thead>
                  <tr>
                    <th>Fianza</th>
                    <th>Arrendatario</th>
                    <th>Inmueble</th>
                    <th>Canon</th>
                    <th>Costo/mes</th>
                    <th>Estado</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.id}>
                      <td className="mono">{r.codigo}</td>
                      <td className="strong">{titulo(r.arrendatario)}</td>
                      <td>{r.inmueble_direccion ?? "—"}</td>
                      <td className="mono">{r.canon != null ? money(r.canon) : "—"}</td>
                      <td className="mono">
                        {r.costo_canon_total != null ? money(r.costo_canon_total) : "—"}
                      </td>
                      <td>
                        {r.retiro_en_tramite ? (
                          <span className="pill pill-warn">Retiro en trámite</span>
                        ) : (
                          <span className="pill pill-ok">{r.estado}</span>
                        )}
                      </td>
                      <td>
                        {r.estado === "ACTIVO" && !r.retiro_en_tramite && (
                          <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
                            <button
                              className="btn btn-outline btn-sm"
                              onClick={() => setModal({ tipo: "aumento", c: r })}
                            >
                              Aumentar canon
                            </button>
                            <button
                              className="btn btn-outline btn-sm"
                              style={{ color: "var(--danger)", borderColor: "#f1d4d4" }}
                              onClick={() => setModal({ tipo: "retiro", c: r })}
                            >
                              Retirar
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="tfoot">{rows.length} contrato(s)</div>
          </>
        )}
      </div>

      {modal?.tipo === "retiro" && (
        <RetiroModal
          contrato={modal.c}
          onClose={() => setModal(null)}
          onDone={() => {
            setModal(null);
            router.refresh();
          }}
        />
      )}
      {modal?.tipo === "aumento" && (
        <AumentoModal
          contrato={modal.c}
          ipcPct={ipcPct}
          onClose={() => setModal(null)}
          onDone={() => {
            setModal(null);
            router.refresh();
          }}
        />
      )}
    </>
  );
}

function RetiroModal({
  contrato,
  onClose,
  onDone,
}: {
  contrato: ContratoPortalRow;
  onClose: () => void;
  onDone: () => void;
}) {
  const [motivo, setMotivo] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState(false);

  async function confirmar() {
    setErr(null);
    setBusy(true);
    try {
      await registrarRetiro(contrato.id, motivo);
      setOk(true);
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
            <h2>Retirar contrato</h2>
            <div className="sub">
              {contrato.codigo} · {titulo(contrato.arrendatario)}
            </div>
          </div>
          <button className="modal-x" onClick={onClose} aria-label="Cerrar">
            ✕
          </button>
        </div>
        <div className="modal-body">
          {ok ? (
            <>
              <div className="banner info" style={{ marginBottom: 16 }}>
                <span>✅</span>
                <div>
                  Registramos tu solicitud de retiro. <b>Se verá reflejado en las próximas horas</b>{" "}
                  (máximo 1 día hábil).
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

function AumentoModal({
  contrato,
  ipcPct,
  onClose,
  onDone,
}: {
  contrato: ContratoPortalRow;
  ipcPct: string;
  onClose: () => void;
  onDone: () => void;
}) {
  const [canon, setCanon] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const esVivienda = (contrato.tipo_destino ?? "").toUpperCase() === "VIVIENDA";

  async function confirmar() {
    setErr(null);
    setBusy(true);
    try {
      await registrarAumento(contrato.id, canon);
      onDone();
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
            <h2>Aumentar canon</h2>
            <div className="sub">
              {contrato.codigo} · {titulo(contrato.arrendatario)}
            </div>
          </div>
          <button className="modal-x" onClick={onClose} aria-label="Cerrar">
            ✕
          </button>
        </div>
        <div className="modal-body">
          {err && (
            <div className="banner warn" style={{ marginBottom: 14 }}>
              <span>⚠️</span>
              <div>{err}</div>
            </div>
          )}
          <div style={{ fontSize: ".85rem", marginBottom: 12 }}>
            Canon actual: <b>{contrato.canon != null ? money(contrato.canon) : "—"}</b>
            {esVivienda && (
              <div style={{ color: "var(--muted)", marginTop: 4 }}>
                🏠 Es vivienda: el aumento no puede superar el <b>IPC ({ipcPct})</b>.
              </div>
            )}
          </div>
          <div className="field" style={{ marginBottom: 14 }}>
            <label>Nuevo canon mensual</label>
            <input
              value={canon}
              onChange={(e) => setCanon(e.target.value)}
              placeholder="ej: 1500000"
              inputMode="numeric"
            />
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button className="btn btn-purple" disabled={busy || !canon} onClick={confirmar}>
              {busy ? "Aplicando…" : "Aumentar canon"}
            </button>
            <button className="btn btn-outline" disabled={busy} onClick={onClose}>
              Cancelar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
