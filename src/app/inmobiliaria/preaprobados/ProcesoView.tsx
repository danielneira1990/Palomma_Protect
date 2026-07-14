"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  PASOS,
  etapaIndex,
  etapaProgreso,
  tiempoDesde,
  DIA_CORTE_INGRESOS,
} from "@/lib/radicacion";
import { money } from "@/lib/format";
import { cancelarRadicacion, ingresarRadicacion } from "./actions";

type Rad = {
  id: string;
  codigo: string | null;
  etapa: string | null;
  num_clientes: number | null;
  valor_asegurado: number | null;
  created_at: string | null;
};

export function ProcesoView({
  radicacion,
  estudioIds,
}: {
  radicacion: Rad;
  estudioIds: string[];
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [errores, setErrores] = useState<string[]>([]);

  const idx = etapaIndex(radicacion.etapa);
  const prog = etapaProgreso(radicacion.etapa);

  async function descargarExcel() {
    setBusy(true);
    try {
      const res = await fetch("/inmobiliaria/preaprobados/radicacion", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: estudioIds }),
      });
      if (!res.ok) throw new Error();
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "Radicacion_Palomma.xlsx";
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      /* noop */
    } finally {
      setBusy(false);
    }
  }

  async function subirExcel(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setBusy(true);
    setErrores([]);
    try {
      const fd = new FormData();
      fd.append("archivo", file);
      fd.append("radicacionId", radicacion.id);
      const res = await fetch("/inmobiliaria/preaprobados/subir", { method: "POST", body: fd });
      const j = (await res.json()) as { ok: boolean; errores?: string[] };
      if (j.ok) router.refresh();
      else setErrores(j.errores ?? ["No se pudo validar el archivo."]);
    } catch {
      setErrores(["Error subiendo el archivo."]);
    } finally {
      setBusy(false);
      e.target.value = "";
    }
  }

  async function cancelar() {
    if (!confirm("¿Cancelar este proceso? Tus clientes volverán a estar disponibles para afianzar.")) {
      return;
    }
    setBusy(true);
    try {
      await cancelarRadicacion(radicacion.id);
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  async function ingresar() {
    setBusy(true);
    setErrores([]);
    try {
      await ingresarRadicacion(radicacion.id);
      router.refresh();
    } catch (e) {
      setErrores([e instanceof Error ? e.message : "Error al ingresar a fianza."]);
    } finally {
      setBusy(false);
    }
  }

  async function descargarPazSalvo() {
    setBusy(true);
    setErrores([]);
    try {
      const res = await fetch("/inmobiliaria/preaprobados/pazsalvo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ radicacionId: radicacion.id }),
      });
      if (!res.ok) throw new Error(await res.text());
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "Declaracion_Juramentada_Palomma.pdf";
      a.click();
      URL.revokeObjectURL(url);
      router.refresh();
    } catch (e) {
      setErrores([e instanceof Error ? e.message : "No se pudo generar el paz y salvo."]);
    } finally {
      setBusy(false);
    }
  }

  async function subirFirmado(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setBusy(true);
    setErrores([]);
    try {
      const fd = new FormData();
      fd.append("archivo", file);
      fd.append("radicacionId", radicacion.id);
      const res = await fetch("/inmobiliaria/preaprobados/firmar", { method: "POST", body: fd });
      const j = (await res.json()) as { ok: boolean; errores?: string[] };
      if (j.ok) router.refresh();
      else setErrores(j.errores ?? ["No se pudo validar el documento firmado."]);
    } catch {
      setErrores(["Error subiendo el archivo."]);
    } finally {
      setBusy(false);
      e.target.value = "";
    }
  }

  return (
    <>
      <div className="card card-pad" style={{ marginBottom: 14 }}>
        <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
          <div style={{ flex: 1 }}>
            <h2 style={{ fontSize: "1.15rem", fontWeight: 700, color: "var(--ink)" }}>
              Tu proceso de inducción
            </h2>
            <div style={{ fontSize: ".82rem", color: "var(--muted)", marginTop: 3 }}>
              {radicacion.codigo} · {radicacion.num_clientes ?? 0} clientes · iniciado{" "}
              {tiempoDesde(radicacion.created_at)}
            </div>
          </div>
          <span className="pill pill-brand">{prog}% completado</span>
        </div>
        <div
          style={{
            height: 8,
            background: "var(--line)",
            borderRadius: 99,
            marginTop: 16,
            overflow: "hidden",
          }}
        >
          <div
            style={{
              width: `${prog}%`,
              height: "100%",
              background: "linear-gradient(90deg,var(--brand),var(--brand-2))",
              transition: "width .35s ease",
            }}
          />
        </div>
      </div>

      <div className="card card-pad" style={{ marginBottom: 14 }}>
        {PASOS.map((p, i) => {
          const estado = i < idx ? "hecho" : i === idx ? "actual" : "pendiente";
          return (
            <div
              key={p.etapa}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 12,
                padding: "8px 0",
                opacity: estado === "pendiente" ? 0.5 : 1,
              }}
            >
              <span
                style={{
                  width: 26,
                  height: 26,
                  borderRadius: 99,
                  flex: "none",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 12,
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
              <div>
                <div style={{ fontWeight: 600, color: "var(--ink)", fontSize: ".9rem" }}>
                  {estado === "hecho" ? p.hecho : p.titulo}
                </div>
                {estado === "actual" && (
                  <div style={{ fontSize: ".78rem", color: "var(--brand)" }}>Paso actual</div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <div className="card card-pad">
        <h3 style={{ font: "600 11px var(--mono)", letterSpacing: ".08em", textTransform: "uppercase", color: "var(--muted-2)", marginBottom: 12 }}>
          Continúa tu proceso
        </h3>

        {errores.length > 0 && (
          <div className="banner warn" style={{ marginBottom: 14 }}>
            <span>⚠️</span>
            <div>
              <b>No pudimos continuar. Corrige estos puntos en el mismo archivo y vuelve a subirlo:</b>
              <ul style={{ margin: "6px 0 0 16px" }}>
                {errores.map((e, i) => (
                  <li key={i}>{e}</li>
                ))}
              </ul>
              <div style={{ marginTop: 8, fontSize: ".82rem", color: "var(--muted)" }}>
                Recuerda: cada <b>inquilino</b> va una sola vez; los <b>codeudores sí pueden
                repetirse</b>. Si necesitas ayuda, escríbenos y te acompañamos.
              </div>
            </div>
          </div>
        )}

        {radicacion.etapa === "INICIADA" && (
          <>
            <p style={{ fontSize: ".9rem", marginBottom: 14 }}>
              Completa el Excel (datos del contrato + codeudores) y súbelo. Validamos que estén todos
              tus clientes y el canon antes de continuar.
            </p>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <label className="btn btn-purple" style={{ cursor: busy ? "default" : "pointer" }}>
                {busy ? "Validando…" : "📤 Subir Excel completado"}
                <input type="file" accept=".xlsx" hidden disabled={busy} onChange={subirExcel} />
              </label>
              <button className="btn btn-outline" disabled={busy} onClick={descargarExcel}>
                Descargar Excel de nuevo
              </button>
            </div>
          </>
        )}

        {radicacion.etapa === "EXCEL_SUBIDO" && (
          <>
            <p style={{ fontSize: ".9rem", marginBottom: 14 }}>
              Radicación validada · valor asegurado <b>{money(radicacion.valor_asegurado)}</b>. Genera
              la declaración juramentada, fírmala y súbela.
            </p>
            <button className="btn btn-purple" disabled={busy} onClick={descargarPazSalvo}>
              {busy ? "Generando…" : "📄 Generar y descargar declaración"}
            </button>
          </>
        )}

        {radicacion.etapa === "PAZ_SALVO" && (
          <>
            <p style={{ fontSize: ".9rem", marginBottom: 14 }}>
              El <b>representante legal</b> firma la declaración juramentada por <b>AUCO</b> (con OTP,
              foto y documento) y aquí subes el PDF firmado. Validamos automáticamente que la firma
              sea la suya.
            </p>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <label className="btn btn-purple" style={{ cursor: busy ? "default" : "pointer" }}>
                {busy ? "Validando…" : "📤 Subir declaración firmada"}
                <input type="file" accept=".pdf" hidden disabled={busy} onChange={subirFirmado} />
              </label>
              <button className="btn btn-outline" disabled={busy} onClick={descargarPazSalvo}>
                Descargar de nuevo
              </button>
            </div>
          </>
        )}

        {radicacion.etapa === "FIRMADO" && (
          <>
            <div
              className="banner"
              style={{
                background: "var(--sbg)",
                border: "1px solid rgba(29,158,117,.18)",
                color: "var(--success)",
                marginBottom: 14,
              }}
            >
              <span>✅</span>
              <div>
                <b>Declaración firmada y validada.</b> Confirmamos que firmó el representante legal.
                Solo falta que confirmes el ingreso a fianza.
              </div>
            </div>
            <p style={{ fontSize: ".9rem", marginBottom: 14 }}>
              Al ingresar, tus contratos entran a fianza. Si ya pasó el corte del mes (día{" "}
              {DIA_CORTE_INGRESOS}), quedan pendientes para el ingreso del próximo mes.
            </p>
            <button className="btn btn-purple" disabled={busy} onClick={ingresar}>
              {busy ? "Procesando…" : "✅ Ingresar a fianza"}
            </button>
          </>
        )}

        {radicacion.etapa === "PENDIENTE_INGRESO" && (
          <div className="banner info" style={{ marginBottom: 0 }}>
            <span>🗓️</span>
            <div>
              Firmado y aprobado. Como ya pasó el corte del mes, tus contratos{" "}
              <b>ingresan a fianza el próximo mes</b>. No tienes que hacer nada más.
            </div>
          </div>
        )}
      </div>

      <div style={{ textAlign: "center", marginTop: 16 }}>
        <button
          className="btn btn-outline btn-sm"
          style={{ color: "var(--danger)", borderColor: "#f1d4d4" }}
          disabled={busy}
          onClick={cancelar}
        >
          Cancelar proceso
        </button>
      </div>
    </>
  );
}
