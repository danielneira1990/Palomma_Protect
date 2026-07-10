"use client";

import { useState } from "react";
import Link from "next/link";
import { SUCURSALES } from "@/lib/format";
import { crearInmobiliaria, traerMerchant } from "../actions";

const VACIO = {
  merchant_id: "",
  razon_social: "",
  nit: "",
  representante_legal: "",
  cc_representante: "",
  persona_contacto: "",
  email_contacto: "",
  telefono: "",
  sucursal: "Medellín",
  ciudad: "",
  direccion: "",
  modalidad_pago: "Facturación",
};

export function NuevaInmobiliariaForm() {
  const [f, setF] = useState(VACIO);
  const [buscando, setBuscando] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState(false);

  const set = (k: keyof typeof VACIO, v: string) => setF((s) => ({ ...s, [k]: v }));

  async function traer() {
    if (!f.merchant_id.trim()) return;
    setBuscando(true);
    setErr(null);
    setOk(false);
    try {
      const m = await traerMerchant(f.merchant_id);
      setF((s) => ({
        ...s,
        merchant_id: m.merchant_id ?? s.merchant_id,
        razon_social: m.razon_social ?? s.razon_social,
        nit: m.nit ?? s.nit,
        representante_legal: m.representante_legal ?? s.representante_legal,
        cc_representante: m.cc_representante ?? s.cc_representante,
        email_contacto: m.email_contacto ?? s.email_contacto,
        telefono: m.telefono ?? s.telefono,
        ciudad: m.ciudad ?? s.ciudad,
        direccion: m.direccion ?? s.direccion,
      }));
      setOk(true);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "No se pudo traer el merchant.");
    } finally {
      setBuscando(false);
    }
  }

  return (
    <form action={crearInmobiliaria} className="formcard">
      <div className="banner info" style={{ marginBottom: 16 }}>
        <span>⚡</span>
        <div>
          Escribe el <b>Merchant ID</b> de Pay y trae los datos automáticamente. Puedes ajustar lo
          que quieras antes de crear.
        </div>
      </div>

      <div className="row2">
        <div className="field">
          <label>
            Merchant ID (Pay) <span className="star">*</span>
          </label>
          <input
            name="merchant_id"
            required
            placeholder="ej: indika"
            value={f.merchant_id}
            onChange={(e) => set("merchant_id", e.target.value)}
          />
        </div>
        <div className="field" style={{ display: "flex", alignItems: "flex-end", gap: 8 }}>
          <button
            type="button"
            className="btn btn-outline"
            disabled={buscando || !f.merchant_id.trim()}
            onClick={traer}
          >
            {buscando ? "Buscando…" : "⚡ Traer datos de Pay"}
          </button>
          {ok && <span className="pill pill-ok">Datos traídos</span>}
        </div>
      </div>

      {err && (
        <div className="banner warn" style={{ marginBottom: 8 }}>
          <span>⚠️</span>
          <div>{err}</div>
        </div>
      )}

      <div className="row2">
        <div className="field">
          <label>
            Razón social <span className="star">*</span>
          </label>
          <input
            name="razon_social"
            required
            value={f.razon_social}
            onChange={(e) => set("razon_social", e.target.value)}
            placeholder="Ej: Indika Inmobiliaria S.A.S."
          />
        </div>
        <div className="field">
          <label>
            NIT <span className="star">*</span>
          </label>
          <input
            name="nit"
            required
            value={f.nit}
            onChange={(e) => set("nit", e.target.value)}
            placeholder="900.556.252-0"
          />
        </div>
      </div>

      <div className="row2">
        <div className="field">
          <label>
            Representante legal <span className="star">*</span>
          </label>
          <input
            name="representante_legal"
            required
            value={f.representante_legal}
            onChange={(e) => set("representante_legal", e.target.value)}
          />
        </div>
        <div className="field">
          <label>Cédula del RL</label>
          <input
            name="cc_representante"
            value={f.cc_representante}
            onChange={(e) => set("cc_representante", e.target.value)}
          />
        </div>
      </div>

      <div className="row2">
        <div className="field">
          <label>Persona de contacto</label>
          <input
            name="persona_contacto"
            value={f.persona_contacto}
            onChange={(e) => set("persona_contacto", e.target.value)}
          />
        </div>
        <div className="field">
          <label>Correo de contacto</label>
          <input
            name="email_contacto"
            type="email"
            value={f.email_contacto}
            onChange={(e) => set("email_contacto", e.target.value)}
          />
        </div>
      </div>

      <div className="row3">
        <div className="field">
          <label>Teléfono</label>
          <input
            name="telefono"
            value={f.telefono}
            onChange={(e) => set("telefono", e.target.value)}
          />
        </div>
        <div className="field">
          <label>
            Sucursal <span className="star">*</span>
          </label>
          <select
            name="sucursal"
            required
            value={f.sucursal}
            onChange={(e) => set("sucursal", e.target.value)}
          >
            {SUCURSALES.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </div>
        <div className="field">
          <label>Ciudad</label>
          <input name="ciudad" value={f.ciudad} onChange={(e) => set("ciudad", e.target.value)} />
        </div>
      </div>

      <div className="row2">
        <div className="field">
          <label>Dirección</label>
          <input
            name="direccion"
            value={f.direccion}
            onChange={(e) => set("direccion", e.target.value)}
          />
        </div>
        <div className="field">
          <label>Modalidad de pago</label>
          <select
            name="modalidad_pago"
            value={f.modalidad_pago}
            onChange={(e) => set("modalidad_pago", e.target.value)}
          >
            <option>Facturación</option>
            <option>Débito automático</option>
          </select>
        </div>
      </div>

      <div style={{ display: "flex", gap: 10, marginTop: 8 }}>
        <button type="submit" className="btn btn-purple">
          Crear inmobiliaria
        </button>
        <Link href="/backoffice/inmobiliarias" className="btn btn-outline">
          Cancelar
        </Link>
      </div>
    </form>
  );
}
