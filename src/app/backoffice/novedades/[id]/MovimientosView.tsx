"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { fecha, money } from "@/lib/format";
import { aplicarRetiro, cancelarRetiro, pausarRetiro, aplicarRetencion } from "../actions";

export type Movimiento = {
  id: string;
  codigo: string | null;
  tipo: string | null;
  motivo: string | null;
  estado: string | null;
  actor: string | null;
  created_at: string | null;
  fecha_vigencia: string | null;
  payload_anterior: { canon?: number } | null;
  payload_nuevo: { canon?: number } | null;
  contrato: {
    codigo: string | null;
    canon: number | null;
    estudio: { persona: { nombre: string | null } | null } | null;
  } | null;
};

function titulo(n: string | null | undefined): string {
  if (!n) return "—";
  return n.toLowerCase().replace(/\b\p{L}/gu, (c) => c.toUpperCase());
}

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
  if (e === "PENDIENTE_APROBACION") return "pill pill-info";
  if (e === "SOLICITADA") return "pill pill-warn";
  return "pill pill-brand";
}

export function MovimientosView({ rows }: { rows: Movimiento[] }) {
  const [abierto, setAbierto] = useState<string | null>(null);

  if (rows.length === 0) {
    return (
      <div className="tablewrap">
        <div className="empty">
          <div className="ic">🗂️</div>
          <div className="msg">Sin movimientos de este tipo este mes.</div>
        </div>
      </div>
    );
  }

  return (
    <div className="tablewrap">
      <div className="tscroll">
        <table>
          <thead>
            <tr>
              <th>Novedad</th>
              <th>Tipo</th>
              <th>Contrato</th>
              <th>Arrendatario</th>
              <th>Detalle</th>
              <th>Fecha</th>
              <th>Estado</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((m) => (
              <MovimientoFila
                key={m.id}
                m={m}
                abierto={abierto === m.id}
                onToggle={() => setAbierto((v) => (v === m.id ? null : m.id))}
              />
            ))}
          </tbody>
        </table>
      </div>
      <div className="tfoot">{rows.length} movimiento(s) · click en uno para ver el detalle</div>
    </div>
  );
}

function MovimientoFila({
  m,
  abierto,
  onToggle,
}: {
  m: Movimiento;
  abierto: boolean;
  onToggle: () => void;
}) {
  const detalle =
    m.tipo === "AUMENTO" && m.payload_nuevo?.canon != null
      ? `${money(m.payload_anterior?.canon ?? 0)} → ${money(m.payload_nuevo.canon)}`
      : m.motivo
        ? m.motivo.replace(/_/g, " ").toLowerCase()
        : "—";
  return (
    <>
      <tr onClick={onToggle} style={{ cursor: "pointer" }}>
        <td className="mono">{m.codigo}</td>
        <td>
          <span className={tipoPill(m.tipo)}>{m.tipo}</span>
        </td>
        <td className="mono">{m.contrato?.codigo ?? "—"}</td>
        <td className="strong">{titulo(m.contrato?.estudio?.persona?.nombre)}</td>
        <td>{detalle}</td>
        <td>{fecha(m.created_at)}</td>
        <td>
          <span className={estadoPill(m.estado)}>{m.estado}</span>
        </td>
      </tr>
      {abierto && (
        <tr>
          <td colSpan={7} style={{ background: "var(--bg-2)", padding: 16 }}>
            <DetalleMovimiento m={m} />
          </td>
        </tr>
      )}
    </>
  );
}

function DetalleMovimiento({ m }: { m: Movimiento }) {
  return (
    <div>
      <dl className="dl" style={{ marginBottom: m.tipo === "RETIRO" ? 14 : 0 }}>
        <dt>Novedad</dt>
        <dd>
          {m.codigo} · {m.tipo}
        </dd>
        <dt>Contrato</dt>
        <dd>
          {m.contrato?.codigo ?? "—"} · {titulo(m.contrato?.estudio?.persona?.nombre)}
        </dd>
        {m.tipo === "AUMENTO" && m.payload_nuevo?.canon != null && (
          <>
            <dt>Canon</dt>
            <dd>
              {money(m.payload_anterior?.canon ?? 0)} → {money(m.payload_nuevo.canon)}
            </dd>
          </>
        )}
        {m.motivo && (
          <>
            <dt>Motivo</dt>
            <dd>{m.motivo.replace(/_/g, " ").toLowerCase()}</dd>
          </>
        )}
        <dt>Quién</dt>
        <dd>{m.actor ?? "—"}</dd>
        <dt>Fecha</dt>
        <dd>{fecha(m.created_at)}</dd>
        <dt>Estado</dt>
        <dd>{m.estado}</dd>
      </dl>
      {m.tipo === "RETIRO" && <GestionRetiro m={m} />}
    </div>
  );
}

function GestionRetiro({ m }: { m: Movimiento }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [ret, setRet] = useState(false);
  const [tasa, setTasa] = useState("");
  const [integral, setIntegral] = useState("");
  const [penal, setPenal] = useState("");

  const gestionable = m.estado === "SOLICITADA" || m.estado === "PENDIENTE_APROBACION";
  if (!gestionable) return null;

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
    <div style={{ borderTop: "1px solid var(--line)", paddingTop: 12 }}>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 8 }}>
        <button className="btn btn-purple btn-sm" disabled={busy} onClick={() => run(() => aplicarRetiro(m.id))}>
          Aplicar retiro
        </button>
        <button className="btn btn-outline btn-sm" disabled={busy} onClick={() => run(() => cancelarRetiro(m.id))}>
          Cancelar (retener)
        </button>
        {m.estado === "SOLICITADA" && (
          <button className="btn btn-outline btn-sm" disabled={busy} onClick={() => run(() => pausarRetiro(m.id))}>
            Pausar
          </button>
        )}
        <button className="btn btn-outline btn-sm" onClick={() => setRet((v) => !v)} style={{ marginLeft: "auto" }}>
          {ret ? "Ocultar retención" : "Retención / mejorar términos"}
        </button>
      </div>
      {ret && (
        <div style={{ background: "var(--surface)", border: "1px solid var(--line)", borderRadius: 10, padding: 12 }}>
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
              onClick={() => run(() => aplicarRetencion(m.id, { nuevaTasaPct: tasa, integral, penal, cancelar: true }))}
            >
              Aplicar y retener
            </button>
            <button
              className="btn btn-outline btn-sm"
              disabled={busy}
              onClick={() => run(() => aplicarRetencion(m.id, { nuevaTasaPct: tasa, integral, penal, cancelar: false }))}
            >
              Aplicar y pausar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
