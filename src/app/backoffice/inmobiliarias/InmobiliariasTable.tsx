"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { fecha } from "@/lib/format";
import {
  subirContratoFirmado,
  cambiarEstadoInmobiliaria,
  reenviarContratoMarco,
  editarContacto,
  actualizarPreaprobados,
} from "./actions";

export type InmobiliariaRow = {
  id: string;
  codigo: string | null;
  razon_social: string | null;
  nit: string | null;
  sucursal: string | null;
  ciudad: string | null;
  estado: string | null;
  sagrilaft_estado: string | null;
  num_contrato_marco: string | null;
  persona_contacto: string | null;
  email_contacto: string | null;
  telefono: string | null;
  created_at: string | null;
  bienvenida_enviada_at: string | null;
  merchant_id: string | null;
  contratoLink: string | null;
  firmadoLink: string | null;
};

function estadoPill(estado: string | null) {
  const e = (estado ?? "").toUpperCase();
  if (e === "ACTIVA") return "pill pill-ok";
  if (e === "SUSPENDIDA") return "pill pill-warn";
  if (e === "INACTIVA") return "pill pill-muted";
  return "pill pill-brand"; // PENDIENTE
}

export function InmobiliariasTable({
  rows,
  notConfigured,
}: {
  rows: InmobiliariaRow[];
  notConfigured: boolean;
}) {
  const [selected, setSelected] = useState<InmobiliariaRow | null>(null);

  return (
    <>
      <div className="tablewrap">
        {rows.length === 0 ? (
          <div className="empty">
            <div className="ic">🏢</div>
            <div className="msg">
              {notConfigured
                ? "Conecta Supabase para empezar."
                : "Aún no hay inmobiliarias. Crea la primera."}
            </div>
          </div>
        ) : (
          <>
            <div className="tscroll">
              <table>
                <thead>
                  <tr>
                    <th>Código</th>
                    <th>Razón social</th>
                    <th>NIT</th>
                    <th>Sucursal</th>
                    <th>Contrato marco</th>
                    <th>Estado</th>
                    <th>Firma</th>
                    <th>Creada</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.id} onClick={() => setSelected(r)} style={{ cursor: "pointer" }}>
                      <td className="mono">{r.codigo}</td>
                      <td className="strong">{r.razon_social}</td>
                      <td className="mono">{r.nit}</td>
                      <td>{r.sucursal}</td>
                      <td className="mono">{r.num_contrato_marco}</td>
                      <td>
                        <span className={estadoPill(r.estado)}>{r.estado}</span>
                      </td>
                      <td>
                        {r.firmadoLink ? (
                          <span className="pill pill-ok">Firmado</span>
                        ) : (
                          <span className="pill pill-muted">Pendiente</span>
                        )}
                      </td>
                      <td className="mono">{fecha(r.created_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="tfoot">Registros: {rows.length}</div>
          </>
        )}
      </div>

      {selected && <GestionModal inmo={selected} onClose={() => setSelected(null)} />}
    </>
  );
}

function GestionModal({ inmo, onClose }: { inmo: InmobiliariaRow; onClose: () => void }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [busyEstado, setBusyEstado] = useState(false);
  const [busyMail, setBusyMail] = useState(false);
  const [busyEdit, setBusyEdit] = useState(false);
  const [editando, setEditando] = useState(false);
  const [estado, setEstado] = useState(inmo.estado);
  const [contacto, setContacto] = useState({
    persona_contacto: inmo.persona_contacto ?? "",
    email_contacto: inmo.email_contacto ?? "",
    telefono: inmo.telefono ?? "",
  });
  const [draft, setDraft] = useState(contacto);
  const [busyScore, setBusyScore] = useState(false);
  const [scoreMsg, setScoreMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const firmado = !!inmo.firmadoLink;

  async function actualizar() {
    setErr(null);
    setScoreMsg(null);
    setBusyScore(true);
    try {
      const { preaprobados } = await actualizarPreaprobados(inmo.id);
      setScoreMsg(`${preaprobados} preaprobados actualizados.`);
      router.refresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Error corriendo el scoring.");
    } finally {
      setBusyScore(false);
    }
  }

  async function guardarContacto() {
    setErr(null);
    setBusyEdit(true);
    try {
      await editarContacto(inmo.id, draft);
      setContacto(draft);
      setEditando(false);
      router.refresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Error guardando el contacto.");
    } finally {
      setBusyEdit(false);
    }
  }

  async function enviar() {
    setErr(null);
    setBusyMail(true);
    try {
      await reenviarContratoMarco(inmo.id);
      router.refresh();
      onClose();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Error enviando el correo.");
      setBusyMail(false);
    }
  }

  async function cambiar(nuevo: string) {
    if (nuevo === "INACTIVA" && !confirm("¿Dar de baja esta inmobiliaria?")) return;
    setErr(null);
    setBusyEstado(true);
    try {
      await cambiarEstadoInmobiliaria(inmo.id, nuevo);
      setEstado(nuevo);
      router.refresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Error cambiando el estado.");
    } finally {
      setBusyEstado(false);
    }
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setErr(null);
    const fd = new FormData(e.currentTarget);
    const file = fd.get("archivo");
    if (!(file instanceof File) || file.size === 0) {
      setErr("Selecciona el archivo del contrato firmado.");
      return;
    }
    setBusy(true);
    try {
      await subirContratoFirmado(fd);
      router.refresh();
      onClose();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Error subiendo el archivo.");
      setBusy(false);
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <div>
            <h2>{inmo.razon_social}</h2>
            <div className="sub">
              {inmo.codigo} · {inmo.num_contrato_marco}
            </div>
          </div>
          <span className={estadoPill(estado)}>{estado}</span>
          <button className="modal-x" onClick={onClose} aria-label="Cerrar">
            ✕
          </button>
        </div>

        <div className="modal-body">
          {err && (
            <div className="banner warn" style={{ marginBottom: 16 }}>
              <span>⚠️</span>
              <div>{err}</div>
            </div>
          )}

          <dl className="dl">
            <dt>NIT</dt>
            <dd>{inmo.nit || "—"}</dd>
            <dt>Sucursal</dt>
            <dd>{inmo.sucursal || "—"}</dd>
            <dt>Ciudad</dt>
            <dd>{inmo.ciudad || "—"}</dd>
            <dt>SAGRILAFT</dt>
            <dd>
              <span className="pill pill-muted">{inmo.sagrilaft_estado || "PENDIENTE"}</span>
            </dd>
            <dt>Creada</dt>
            <dd>{fecha(inmo.created_at)}</dd>
          </dl>

          <div className="modal-sec" style={{ marginBottom: 20 }}>
            <div style={{ display: "flex", alignItems: "center", marginBottom: 10 }}>
              <h3 style={{ margin: 0 }}>Contacto</h3>
              {!editando && (
                <button
                  className="btn btn-outline btn-sm"
                  style={{ marginLeft: "auto" }}
                  onClick={() => {
                    setDraft(contacto);
                    setEditando(true);
                  }}
                >
                  Editar
                </button>
              )}
            </div>

            {editando ? (
              <>
                <div className="field" style={{ marginBottom: 10 }}>
                  <label>Persona de contacto</label>
                  <input
                    value={draft.persona_contacto}
                    onChange={(e) => setDraft({ ...draft, persona_contacto: e.target.value })}
                  />
                </div>
                <div className="field" style={{ marginBottom: 10 }}>
                  <label>Correo de contacto</label>
                  <input
                    type="email"
                    value={draft.email_contacto}
                    onChange={(e) => setDraft({ ...draft, email_contacto: e.target.value })}
                  />
                </div>
                <div className="field" style={{ marginBottom: 12 }}>
                  <label>Teléfono</label>
                  <input
                    value={draft.telefono}
                    onChange={(e) => setDraft({ ...draft, telefono: e.target.value })}
                  />
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  <button
                    className="btn btn-purple btn-sm"
                    disabled={busyEdit}
                    onClick={guardarContacto}
                  >
                    {busyEdit ? "Guardando…" : "Guardar"}
                  </button>
                  <button
                    className="btn btn-outline btn-sm"
                    disabled={busyEdit}
                    onClick={() => setEditando(false)}
                  >
                    Cancelar
                  </button>
                </div>
              </>
            ) : (
              <dl className="dl" style={{ marginBottom: 0 }}>
                <dt>Persona</dt>
                <dd>{contacto.persona_contacto || "—"}</dd>
                <dt>Correo</dt>
                <dd>{contacto.email_contacto || "—"}</dd>
                <dt>Teléfono</dt>
                <dd>{contacto.telefono || "—"}</dd>
              </dl>
            )}
          </div>

          <div className="modal-sec">
            <h3>Contrato Marco</h3>

            <div className="docbox">
              <span className="di">📄</span>
              <div className="dinfo">
                <div className="dt">Contrato Marco generado</div>
                <div className="dd">Descárgalo y envíalo a la inmobiliaria para firma.</div>
              </div>
              {inmo.contratoLink ? (
                <a
                  href={inmo.contratoLink}
                  target="_blank"
                  rel="noreferrer"
                  className="btn btn-outline btn-sm"
                >
                  Ver / descargar
                </a>
              ) : (
                <span className="pill pill-warn">No generado</span>
              )}
            </div>

            {firmado ? (
              <div className="docbox">
                <span className="di">✅</span>
                <div className="dinfo">
                  <div className="dt">Contrato firmado</div>
                  <div className="dd">La inmobiliaria quedó activa.</div>
                </div>
                <a
                  href={inmo.firmadoLink!}
                  target="_blank"
                  rel="noreferrer"
                  className="btn btn-outline btn-sm"
                >
                  Ver firmado
                </a>
              </div>
            ) : (
              <form onSubmit={onSubmit}>
                <input type="hidden" name="id" value={inmo.id} />
                <div className="field" style={{ marginBottom: 12 }}>
                  <label>Subir contrato firmado</label>
                  <input type="file" name="archivo" accept="application/pdf,image/*" />
                </div>
                <button type="submit" className="btn btn-purple" disabled={busy}>
                  {busy ? "Subiendo…" : "Subir firmado y activar"}
                </button>
              </form>
            )}
          </div>

          <div className="modal-sec" style={{ marginTop: 20 }}>
            <h3>Contrato marco</h3>
            <div className="docbox">
              <span className="di">📄</span>
              <div className="dinfo">
                <div className="dt">Contrato marco para firma</div>
                <div className="dd">
                  {contacto.email_contacto
                    ? `Se envía a ${contacto.email_contacto}`
                    : "Sin correo de contacto"}
                </div>
              </div>
              <button
                className="btn btn-outline btn-sm"
                disabled={busyMail || !contacto.email_contacto || editando}
                onClick={enviar}
              >
                {busyMail ? "Enviando…" : "Reenviar contrato marco"}
              </button>
            </div>
          </div>

          <div className="modal-sec" style={{ marginTop: 20 }}>
            <h3>Preaprobados (scoring)</h3>
            <div className="docbox">
              <span className="di">📊</span>
              <div className="dinfo">
                <div className="dt">Merchant: {inmo.merchant_id || "— sin merchant"}</div>
                <div className="dd">
                  {scoreMsg ?? "Corre el modelo y refresca los preaprobados PRIME (~30s)."}
                </div>
              </div>
              <button
                className="btn btn-outline btn-sm"
                disabled={busyScore || !inmo.merchant_id}
                onClick={actualizar}
              >
                {busyScore ? "Corriendo…" : "Actualizar preaprobados"}
              </button>
            </div>
          </div>

          <div
            className="modal-sec"
            style={{ marginTop: 20, borderTop: "1px solid var(--line)", paddingTop: 16 }}
          >
            <h3>Estado</h3>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {estado !== "ACTIVA" && (
                <button
                  className="btn btn-outline btn-sm"
                  disabled={busyEstado}
                  onClick={() => cambiar("ACTIVA")}
                >
                  Activar
                </button>
              )}
              {estado !== "SUSPENDIDA" && (
                <button
                  className="btn btn-outline btn-sm"
                  disabled={busyEstado}
                  onClick={() => cambiar("SUSPENDIDA")}
                >
                  Suspender
                </button>
              )}
              {estado !== "INACTIVA" && (
                <button
                  className="btn btn-danger btn-sm"
                  disabled={busyEstado}
                  onClick={() => cambiar("INACTIVA")}
                >
                  Dar de baja
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
