"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export type PreaprobadoRow = {
  id: string;
  nombre: string | null;
  documento: string | null;
  email: string | null;
  telefono: string | null;
};

const PAGE_SIZE = 25;

function titulo(n: string | null): string {
  if (!n) return "—";
  return n.toLowerCase().replace(/\b\p{L}/gu, (c) => c.toUpperCase());
}

const PASOS = [
  "Descarga el <b>Excel</b> — tus clientes ya vienen prellenados.",
  "Completa el <b>contrato</b> (canon, dirección, fechas) y los <b>codeudores</b>.",
  "<b>Sube</b> el Excel completado aquí en el portal.",
  "Firma el <b>paz y salvo</b> que generamos con tu radicación.",
  "Listo: tus contratos quedan <b>afianzados</b>. 🎉",
];

export function PreaprobadosView({
  rows,
  afianzados,
  tasaPct,
}: {
  rows: PreaprobadoRow[];
  afianzados: number;
  tasaPct: string;
}) {
  const router = useRouter();
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [page, setPage] = useState(0);
  const [modal, setModal] = useState(false);
  const [sent, setSent] = useState(false);

  const total = rows.length + afianzados;
  const conv = total ? Math.round((afianzados / total) * 100) : 0;

  const totalPages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const curPage = Math.min(page, totalPages - 1);
  const pageRows = rows.slice(curPage * PAGE_SIZE, curPage * PAGE_SIZE + PAGE_SIZE);

  // "Seleccionar todos" aplica a TODA la cartera (todas las páginas), no solo a la página actual.
  const allChecked = rows.length > 0 && sel.size === rows.length;

  function toggle(id: string) {
    setSel((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }
  function toggleAll() {
    setSel(allChecked ? new Set() : new Set(rows.map((r) => r.id)));
  }

  function cerrarModal() {
    if (busy) return;
    setModal(false);
    setSent(false);
  }

  async function descargarRadicacion() {
    if (sel.size === 0 || busy) return;
    setBusy(true);
    try {
      const res = await fetch("/inmobiliaria/preaprobados/radicacion", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: [...sel] }),
      });
      if (!res.ok) throw new Error(await res.text());
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "Radicacion_Palomma.xlsx";
      a.click();
      URL.revokeObjectURL(url);
      // Refresca: la radicación ya existe → la página pasa a la vista del proceso.
      router.refresh();
    } catch {
      /* noop */
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="kpis">
        <div className="kpi" style={{ background: "var(--brand)", border: "none" }}>
          <div className="kt" style={{ color: "rgba(255,255,255,.82)" }}>
            🛡️ Tasa preferencial · Palomma Protect
          </div>
          <div className="kn" style={{ color: "#fff" }}>
            {tasaPct} <span style={{ fontSize: ".85rem", fontWeight: 500 }}>/ canon</span>
          </div>
          <div className="kd" style={{ color: "rgba(255,255,255,.82)" }}>
            Tu cartera preaprobada queda afianzada al instante, sin estudios adicionales.
          </div>
        </div>

        <div className="kpi">
          <div className="kt">Preaprobados 🕊️</div>
          <div className="kn">{total}</div>
          <div className="kd">en tu cartera</div>
        </div>

        <div className="kpi">
          <div className="kt">Ya afianzados ✅</div>
          <div className="kn">{afianzados}</div>
          <div
            style={{
              height: 5,
              background: "var(--line)",
              borderRadius: 99,
              margin: "8px 0 4px",
              overflow: "hidden",
            }}
          >
            <div style={{ width: `${conv}%`, height: "100%", background: "var(--success)" }} />
          </div>
          <div className="kd">{conv}% de conversión</div>
        </div>

        <div className="kpi">
          <div className="kt">Pendientes ⏳</div>
          <div className="kn">{rows.length}</div>
          <div className="kd">por afianzar</div>
        </div>
      </div>

      <div className="banner info" style={{ alignItems: "center" }}>
        <span>🛡️</span>
        <div>
          Estos son tus clientes <b>preaprobados</b>. Selecciona los que quieras afianzar e inicia la{" "}
          <b>radicación</b>: te damos el Excel con sus datos prellenados. Al completar el proceso, el
          contrato se ingresa.
        </div>
      </div>

      {sel.size > 0 && (
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
          <div style={{ flex: 1 }}>{sel.size} cliente(s) seleccionado(s)</div>
          <button className="btn btn-purple btn-sm" onClick={() => setModal(true)}>
            Iniciar radicación
          </button>
        </div>
      )}

      <div className="tablewrap">
        {rows.length === 0 ? (
          <div className="empty">
            <div className="ic">🕊️</div>
            <div className="msg">No tienes clientes preaprobados pendientes por afianzar.</div>
          </div>
        ) : (
          <>
            <div className="tscroll">
              <table>
                <thead>
                  <tr>
                    <th style={{ width: 36 }}>
                      <input
                        type="checkbox"
                        checked={allChecked}
                        onChange={toggleAll}
                        aria-label="Seleccionar toda la cartera"
                      />
                    </th>
                    <th>Cliente</th>
                    <th>Cédula</th>
                    <th>Correo</th>
                    <th>Teléfono</th>
                    <th>Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {pageRows.map((r) => (
                    <tr key={r.id}>
                      <td>
                        <input
                          type="checkbox"
                          checked={sel.has(r.id)}
                          onChange={() => toggle(r.id)}
                          aria-label={`Seleccionar ${r.documento ?? ""}`}
                        />
                      </td>
                      <td className="strong">{titulo(r.nombre)}</td>
                      <td className="mono">{r.documento ?? "—"}</td>
                      <td>{r.email ?? "—"}</td>
                      <td className="mono">{r.telefono ?? "—"}</td>
                      <td>
                        <span className="pill pill-brand">Preaprobado</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="tfoot">
              <span>
                Registros {curPage * PAGE_SIZE + 1}–
                {Math.min((curPage + 1) * PAGE_SIZE, rows.length)} de {rows.length}
              </span>
              {sel.size > 0 && <span>· {sel.size} seleccionado(s)</span>}
              <div style={{ marginLeft: "auto", display: "flex", gap: 6 }}>
                <button
                  className="btn btn-outline btn-sm"
                  disabled={curPage === 0}
                  onClick={() => setPage(curPage - 1)}
                >
                  ‹
                </button>
                <button
                  className="btn btn-outline btn-sm"
                  disabled={curPage >= totalPages - 1}
                  onClick={() => setPage(curPage + 1)}
                >
                  ›
                </button>
              </div>
            </div>
          </>
        )}
      </div>

      {modal && (
        <div className="modal-overlay" onClick={cerrarModal}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <div>
                <h2>Proceso de inducción</h2>
                <div className="sub">{sel.size} cliente(s) seleccionado(s)</div>
              </div>
              <button className="modal-x" onClick={cerrarModal} aria-label="Cerrar" disabled={busy}>
                ✕
              </button>
            </div>

            <div className="modal-body">
              {sent ? (
                <div className="banner info" style={{ marginBottom: 0 }}>
                  <span>✅</span>
                  <div>
                    Descargamos tu Excel y te lo enviamos al correo. Complétalo (contrato + codeudores)
                    y súbelo cuando esté listo para generar tu paz y salvo.
                  </div>
                </div>
              ) : (
                <>
                  <p style={{ fontSize: "13.5px", marginBottom: 14 }}>
                    Así va tu radicación — es rápido:
                  </p>
                  <table role="presentation" cellPadding={0} cellSpacing={0} style={{ fontSize: "13.5px", lineHeight: 1.5 }}>
                    <tbody>
                      {PASOS.map((t, i) => (
                        <tr key={i}>
                          <td style={{ padding: "5px 0", verticalAlign: "top", color: "var(--brand)", fontWeight: 800, width: 24 }}>
                            {i + 1}.
                          </td>
                          <td
                            style={{ padding: "5px 0 5px 6px", color: "var(--text)" }}
                            dangerouslySetInnerHTML={{ __html: t }}
                          />
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <p style={{ fontSize: "12.5px", color: "var(--muted)", marginTop: 14 }}>
                    📎 También te enviamos el Excel a tu correo para que lo tengas a mano.
                  </p>
                </>
              )}
            </div>

            <div style={{ display: "flex", gap: 8, padding: "0 22px 22px" }}>
              {sent ? (
                <button className="btn btn-purple" onClick={cerrarModal}>
                  Cerrar
                </button>
              ) : (
                <>
                  <button className="btn btn-purple" disabled={busy} onClick={descargarRadicacion}>
                    {busy ? "Generando…" : "📄 Descargar y enviar por correo"}
                  </button>
                  <button className="btn btn-outline" disabled={busy} onClick={cerrarModal}>
                    Cancelar
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
