"use client";

import { useMemo, useState } from "react";
import { money, fecha } from "@/lib/format";
import { fmtTasaPct } from "@/lib/radicacion";

type PersonaMin = { nombre: string | null; documento: string | null } | null;

export type ContratoRow = {
  id: string;
  codigo: string | null;
  num_contrato_arr: string | null;
  inmueble_direccion: string | null;
  inmueble_ciudad: string | null;
  tipo_destino: string | null;
  canon: number | null;
  valor_afianzado_canon: number | null;
  tasa_canon: number | null;
  costo_canon_neto: number | null;
  iva_canon_servicio: number | null;
  costo_canon_total: number | null;
  valor_afianzado_integral: number | null;
  linea_integral: boolean | null;
  linea_penal: boolean | null;
  estado: string | null;
  fecha_inicio: string | null;
  fecha_fin: string | null;
  fecha_ingreso: string | null;
  created_at: string | null;
  inmobiliaria: { razon_social: string | null; codigo: string | null } | null;
  estudio: { persona: PersonaMin } | null;
  contrato_persona: { rol: string | null; persona: PersonaMin }[];
};

function titulo(n: string | null): string {
  if (!n) return "—";
  return n.toLowerCase().replace(/\b\p{L}/gu, (c) => c.toUpperCase());
}

function estadoPill(estado: string | null) {
  const e = (estado ?? "").toUpperCase();
  if (e === "ACTIVO") return "pill pill-ok";
  if (e === "POR_VENCER") return "pill pill-warn";
  if (e === "SUSPENDIDO") return "pill pill-warn";
  if (e === "TERMINADO" || e === "RETIRADO") return "pill pill-muted";
  return "pill pill-brand";
}

export function ContratosTable({
  rows,
  notConfigured,
}: {
  rows: ContratoRow[];
  notConfigured: boolean;
}) {
  const [sel, setSel] = useState<ContratoRow | null>(null);

  const totalAfianzado = rows.reduce((a, r) => a + (r.valor_afianzado_canon ?? 0), 0);
  const kpis = useMemo(() => {
    const ponderada = rows.reduce((a, r) => a + (r.tasa_canon ?? 0) * (r.valor_afianzado_canon ?? 0), 0);
    return {
      n: rows.length,
      valor: totalAfianzado,
      tasaPct: fmtTasaPct(totalAfianzado > 0 ? ponderada / totalAfianzado : 0),
      integral: rows.filter((r) => r.linea_integral).length,
      penal: rows.filter((r) => r.linea_penal).length,
    };
  }, [rows, totalAfianzado]);

  return (
    <>
      {rows.length > 0 && (
        <div className="kpis">
          <div className="kpi">
            <div className="kt">Contratos</div>
            <div className="kn">{kpis.n}</div>
          </div>
          <div className="kpi">
            <div className="kt">Valor afianzado</div>
            <div className="kn">{money(kpis.valor)}</div>
            <div className="kd">canon protegido / mes</div>
          </div>
          <div className="kpi">
            <div className="kt">Tasa promedio</div>
            <div className="kn">{kpis.tasaPct}</div>
            <div className="kd">ponderada por valor afianzado</div>
          </div>
          <div className="kpi">
            <div className="kt">Coberturas</div>
            <div className="kn">{kpis.integral}</div>
            <div className="kd">con integral · {kpis.penal} con cláusula penal</div>
          </div>
        </div>
      )}

      <div className="tablewrap">
        {rows.length === 0 ? (
          <div className="empty">
            <div className="ic">🛡️</div>
            <div className="msg">
              {notConfigured
                ? "Conecta Supabase para empezar."
                : "Aún no hay contratos afianzados. Se crean al ingresar una radicación."}
            </div>
          </div>
        ) : (
          <>
            <div className="tscroll">
              <table>
                <thead>
                  <tr>
                    <th>Fianza</th>
                    <th>Arrendatario</th>
                    <th>Inmobiliaria</th>
                    <th>Inmueble</th>
                    <th>Canon</th>
                    <th>Valor afianzado</th>
                    <th>Costo/mes</th>
                    <th>Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.id} onClick={() => setSel(r)} style={{ cursor: "pointer" }}>
                      <td className="mono">{r.codigo}</td>
                      <td className="strong">{titulo(r.estudio?.persona?.nombre ?? null)}</td>
                      <td>{r.inmobiliaria?.razon_social ?? "—"}</td>
                      <td>{r.inmueble_direccion ?? "—"}</td>
                      <td className="mono">{r.canon != null ? money(r.canon) : "—"}</td>
                      <td className="mono">
                        {r.valor_afianzado_canon != null ? money(r.valor_afianzado_canon) : "—"}
                      </td>
                      <td className="mono">
                        {r.costo_canon_total != null ? money(r.costo_canon_total) : "—"}
                      </td>
                      <td>
                        <span className={estadoPill(r.estado)}>{r.estado}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="tfoot">
              {rows.length} contrato(s) · valor afianzado (canon): {money(totalAfianzado)}
            </div>
          </>
        )}
      </div>

      {sel && <ContratoModal contrato={sel} onClose={() => setSel(null)} />}
    </>
  );
}

function ContratoModal({ contrato: c, onClose }: { contrato: ContratoRow; onClose: () => void }) {
  const codeudores = c.contrato_persona.filter((p) => (p.rol ?? "").toUpperCase() === "CODEUDOR");
  const arrendatario =
    c.contrato_persona.find((p) => (p.rol ?? "").toUpperCase() === "ARRENDATARIO")?.persona ??
    c.estudio?.persona ??
    null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <div>
            <h2>{titulo(arrendatario?.nombre ?? null)}</h2>
            <div className="sub">
              {c.codigo} · {c.inmobiliaria?.razon_social ?? "—"}
            </div>
          </div>
          <span className={estadoPill(c.estado)}>{c.estado}</span>
          <button className="modal-x" onClick={onClose} aria-label="Cerrar">
            ✕
          </button>
        </div>

        <div className="modal-body">
          <dl className="dl">
            <dt>Inmueble</dt>
            <dd>
              {c.inmueble_direccion ?? "—"}
              {c.inmueble_ciudad ? ` · ${c.inmueble_ciudad}` : ""}
            </dd>
            <dt>Tipo</dt>
            <dd>{c.tipo_destino ?? "—"}</dd>
            <dt>Contrato de arriendo</dt>
            <dd>{c.num_contrato_arr ?? "—"}</dd>
            <dt>Vigencia</dt>
            <dd>
              {fecha(c.fecha_inicio)} → {fecha(c.fecha_fin)}
            </dd>
            <dt>Ingreso a fianza</dt>
            <dd>{fecha(c.fecha_ingreso)}</dd>
          </dl>

          <div className="modal-sec">
            <h3>Fianza</h3>
            <dl className="dl" style={{ marginBottom: 0 }}>
              <dt>Canon mensual</dt>
              <dd>{c.canon != null ? money(c.canon) : "—"}</dd>
              <dt>Valor afianzado (canon)</dt>
              <dd>{c.valor_afianzado_canon != null ? money(c.valor_afianzado_canon) : "—"}</dd>
              <dt>Tasa</dt>
              <dd>{c.tasa_canon != null ? fmtTasaPct(c.tasa_canon) : "—"}</dd>
              <dt>Costo de fianza</dt>
              <dd>
                {c.costo_canon_total != null ? `${money(c.costo_canon_total)} / mes` : "—"}
                {c.costo_canon_neto != null && c.iva_canon_servicio != null && (
                  <span style={{ color: "var(--muted)", fontSize: ".82rem" }}>
                    {" "}
                    (neto {money(c.costo_canon_neto)} + IVA {money(c.iva_canon_servicio)})
                  </span>
                )}
              </dd>
              <dt>Amparo integral</dt>
              <dd>
                {c.valor_afianzado_integral != null ? money(c.valor_afianzado_integral) : "—"}{" "}
                <span style={{ color: "var(--success)", fontSize: ".82rem" }}>· de cortesía 🎁</span>
              </dd>
            </dl>
          </div>

          <div className="modal-sec">
            <h3>Personas</h3>
            <div className="docbox">
              <span className="di">👤</span>
              <div className="dinfo">
                <div className="dt">{titulo(arrendatario?.nombre ?? null)}</div>
                <div className="dd">Arrendatario · {arrendatario?.documento ?? "—"}</div>
              </div>
            </div>
            {codeudores.length === 0 ? (
              <div style={{ fontSize: ".82rem", color: "var(--muted)", marginTop: 6 }}>
                Sin codeudores.
              </div>
            ) : (
              codeudores.map((cd, i) => (
                <div className="docbox" key={i}>
                  <span className="di">🤝</span>
                  <div className="dinfo">
                    <div className="dt">{titulo(cd.persona?.nombre ?? null)}</div>
                    <div className="dd">Codeudor · {cd.persona?.documento ?? "—"}</div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
