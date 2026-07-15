"use client";

import { useState } from "react";
import { fecha } from "@/lib/format";
import { guardarConfig, guardarMesCalendario } from "./actions";

export type CalRow = {
  periodo: string | null;
  corte_ingresos: string | null;
  dia_max_avisos: string | null;
  dia_desistimientos: string | null;
  pago_siniestro_vigente: string | null;
  pago_siniestro_nuevo: string | null;
};

const VACIO = {
  periodo: "",
  corte: "",
  reporte_siniestros: "",
  desistir: "",
  pago_vigentes: "",
  pago_nuevos: "",
};

export function ConfigView({
  config,
  calendario,
}: {
  config: { ipcPct: string; amarilloPct: string; rojoPct: string; diaCorte: string };
  calendario: CalRow[];
}) {
  const [cal, setCal] = useState(VACIO);
  const set = (k: keyof typeof VACIO, v: string) => setCal((s) => ({ ...s, [k]: v }));

  function cargar(r: CalRow) {
    setCal({
      periodo: r.periodo ?? "",
      corte: r.corte_ingresos ?? "",
      reporte_siniestros: r.dia_max_avisos ?? "",
      desistir: r.dia_desistimientos ?? "",
      pago_vigentes: r.pago_siniestro_vigente ?? "",
      pago_nuevos: r.pago_siniestro_nuevo ?? "",
    });
  }

  return (
    <>
      {/* Parámetros generales */}
      <div className="card card-pad" style={{ marginBottom: 18 }}>
        <h3 style={{ marginTop: 0 }}>Parámetros</h3>
        <form action={guardarConfig}>
          <div className="row3">
            <div className="field">
              <label>IPC (%) — tope de aumento en vivienda</label>
              <input name="ipc" defaultValue={config.ipcPct} placeholder="6,2" />
            </div>
            <div className="field">
              <label>Semáforo amarillo (%) — retiros del mes</label>
              <input name="retiro_amarillo" defaultValue={config.amarilloPct} placeholder="2,5" />
            </div>
            <div className="field">
              <label>Semáforo rojo (%) — retiros del mes</label>
              <input name="retiro_rojo" defaultValue={config.rojoPct} placeholder="3" />
            </div>
          </div>
          <div className="row3">
            <div className="field">
              <label>Día de corte (cierra novedades/ingresos y factura)</label>
              <input name="dia_corte" defaultValue={config.diaCorte} placeholder="20" />
            </div>
          </div>
          <button type="submit" className="btn btn-purple">
            Guardar parámetros
          </button>
        </form>
      </div>

      {/* Calendario operativo */}
      <div className="card card-pad">
        <h3 style={{ marginTop: 0 }}>Calendario operativo</h3>
        <p style={{ fontSize: ".85rem", color: "var(--muted)", marginTop: -4 }}>
          Fechas mes a mes. El <b>corte</b> es el día en que cierran novedades e ingresos y se
          calcula la facturación.
        </p>

        <div className="tscroll" style={{ marginBottom: 16 }}>
          <table>
            <thead>
              <tr>
                <th>Periodo</th>
                <th>Corte</th>
                <th>Reporte siniestros</th>
                <th>Desistir</th>
                <th>Pago vigentes</th>
                <th>Pago nuevos</th>
              </tr>
            </thead>
            <tbody>
              {calendario.length === 0 ? (
                <tr>
                  <td colSpan={6} className="msg" style={{ padding: 16 }}>
                    Aún no hay meses configurados.
                  </td>
                </tr>
              ) : (
                calendario.map((r) => (
                  <tr key={r.periodo} onClick={() => cargar(r)} style={{ cursor: "pointer" }}>
                    <td className="mono strong">{r.periodo}</td>
                    <td>{fecha(r.corte_ingresos)}</td>
                    <td>{fecha(r.dia_max_avisos)}</td>
                    <td>{fecha(r.dia_desistimientos)}</td>
                    <td>{fecha(r.pago_siniestro_vigente)}</td>
                    <td>{fecha(r.pago_siniestro_nuevo)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <form action={guardarMesCalendario}>
          <h4 style={{ margin: "0 0 10px" }}>Agregar / editar mes</h4>
          <div className="row3">
            <div className="field">
              <label>Periodo (AAAA-MM)</label>
              <input
                name="periodo"
                required
                value={cal.periodo}
                onChange={(e) => set("periodo", e.target.value)}
                placeholder="2026-08"
              />
            </div>
            <div className="field">
              <label>Corte</label>
              <input
                name="corte"
                type="date"
                value={cal.corte}
                onChange={(e) => set("corte", e.target.value)}
              />
            </div>
            <div className="field">
              <label>Reporte siniestros</label>
              <input
                name="reporte_siniestros"
                type="date"
                value={cal.reporte_siniestros}
                onChange={(e) => set("reporte_siniestros", e.target.value)}
              />
            </div>
          </div>
          <div className="row3">
            <div className="field">
              <label>Límite desistir</label>
              <input
                name="desistir"
                type="date"
                value={cal.desistir}
                onChange={(e) => set("desistir", e.target.value)}
              />
            </div>
            <div className="field">
              <label>Pago siniestros vigentes</label>
              <input
                name="pago_vigentes"
                type="date"
                value={cal.pago_vigentes}
                onChange={(e) => set("pago_vigentes", e.target.value)}
              />
            </div>
            <div className="field">
              <label>Pago siniestros nuevos</label>
              <input
                name="pago_nuevos"
                type="date"
                value={cal.pago_nuevos}
                onChange={(e) => set("pago_nuevos", e.target.value)}
              />
            </div>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button type="submit" className="btn btn-purple">
              Guardar mes
            </button>
            <button type="button" className="btn btn-outline" onClick={() => setCal(VACIO)}>
              Limpiar
            </button>
          </div>
        </form>
      </div>
    </>
  );
}
