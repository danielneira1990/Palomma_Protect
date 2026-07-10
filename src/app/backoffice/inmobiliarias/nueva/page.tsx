import Link from "next/link";
import { crearInmobiliaria } from "../actions";
import { SUCURSALES } from "@/lib/format";

export default function NuevaInmobiliariaPage() {
  return (
    <>
      <div className="head">
        <div>
          <h1>Nueva inmobiliaria</h1>
          <p>El sistema asigna automáticamente el ID (IMB) y el número de contrato marco (CMF).</p>
        </div>
        <div className="actions">
          <Link href="/backoffice/inmobiliarias" className="btn btn-outline btn-sm">
            ← Volver
          </Link>
        </div>
      </div>

      <form action={crearInmobiliaria} className="formcard">
        <div className="row2">
          <div className="field">
            <label>
              Razón social <span className="star">*</span>
            </label>
            <input name="razon_social" required placeholder="Ej: Indika Inmobiliaria S.A.S." />
          </div>
          <div className="field">
            <label>
              NIT <span className="star">*</span>
            </label>
            <input name="nit" required placeholder="900.556.252-0" />
          </div>
        </div>

        <div className="row2">
          <div className="field">
            <label>
              Merchant ID (Pay) <span className="star">*</span>
            </label>
            <input name="merchant_id" required placeholder="ej: indika" />
          </div>
          <div className="field" style={{ display: "flex", alignItems: "flex-end" }}>
            <p style={{ fontSize: ".8rem", color: "var(--muted)", margin: 0, paddingBottom: 10 }}>
              Identificador de la inmobiliaria en Pay. Con él se traen sus preaprobados del modelo.
            </p>
          </div>
        </div>

        <div className="row2">
          <div className="field">
            <label>
              Representante legal <span className="star">*</span>
            </label>
            <input name="representante_legal" required placeholder="Andrés Alejandro Murillo" />
          </div>
          <div className="field">
            <label>Cédula del RL</label>
            <input name="cc_representante" placeholder="98.567.322" />
          </div>
        </div>

        <div className="row2">
          <div className="field">
            <label>Persona de contacto</label>
            <input name="persona_contacto" placeholder="Juan Felipe Jaramillo" />
          </div>
          <div className="field">
            <label>Correo de contacto</label>
            <input name="email_contacto" type="email" placeholder="contacto@inmobiliaria.com" />
          </div>
        </div>

        <div className="row3">
          <div className="field">
            <label>Teléfono</label>
            <input name="telefono" placeholder="3122583236" />
          </div>
          <div className="field">
            <label>
              Sucursal <span className="star">*</span>
            </label>
            <select name="sucursal" required defaultValue="Medellín">
              {SUCURSALES.map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>Ciudad</label>
            <input name="ciudad" placeholder="Medellín" />
          </div>
        </div>

        <div className="row2">
          <div className="field">
            <label>Dirección</label>
            <input name="direccion" placeholder="Carrera 29D # 6º 05 Local 105" />
          </div>
          <div className="field">
            <label>Modalidad de pago</label>
            <select name="modalidad_pago" defaultValue="Facturación">
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
    </>
  );
}
