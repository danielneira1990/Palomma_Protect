import Link from "next/link";
import { getSupabase } from "@/lib/supabase/server";
import { crearEstudio } from "../actions";
import { TIERS } from "@/lib/format";

const SUBHEAD: React.CSSProperties = {
  font: "600 11px var(--mono)",
  letterSpacing: ".08em",
  textTransform: "uppercase",
  color: "var(--muted-2)",
  margin: "6px 0 12px",
};

export default async function NuevoEstudioPage() {
  const supabase = getSupabase();
  let inmobiliarias: { id: string; codigo: string | null; razon_social: string | null }[] = [];
  if (supabase) {
    const { data } = await supabase
      .from("inmobiliaria")
      .select("id, codigo, razon_social")
      .order("razon_social");
    inmobiliarias = data ?? [];
  }

  return (
    <>
      <div className="head">
        <div>
          <h1>Nuevo estudio</h1>
          <p>Radica el estudio de un arrendatario. El sistema asigna el código (EST).</p>
        </div>
        <div className="actions">
          <Link href="/backoffice/estudios" className="btn btn-outline btn-sm">
            ← Volver
          </Link>
        </div>
      </div>

      <form action={crearEstudio} className="formcard">
        <div style={SUBHEAD}>Arrendatario</div>
        <div className="row2">
          <div className="field">
            <label>
              Documento <span className="star">*</span>
            </label>
            <input name="documento" required placeholder="71.234.567" />
          </div>
          <div className="field">
            <label>Tipo de documento</label>
            <select name="tipo_documento" defaultValue="CC">
              <option value="CC">CC</option>
              <option value="CE">CE</option>
              <option value="NIT">NIT</option>
              <option value="PP">PP</option>
            </select>
          </div>
        </div>

        <div className="row2">
          <div className="field">
            <label>
              Nombre completo <span className="star">*</span>
            </label>
            <input name="nombre" required placeholder="Carlos Andrés Martínez" />
          </div>
          <div className="field">
            <label>Correo</label>
            <input name="email" type="email" placeholder="carlos@correo.com" />
          </div>
        </div>

        <div className="row2">
          <div className="field">
            <label>Teléfono</label>
            <input name="telefono" placeholder="3001234567" />
          </div>
          <div className="field">
            <label>
              Inmobiliaria <span className="star">*</span>
            </label>
            <select name="id_inmobiliaria" required defaultValue="">
              <option value="" disabled>
                Selecciona…
              </option>
              {inmobiliarias.map((i) => (
                <option key={i.id} value={i.id}>
                  {i.razon_social} {i.codigo ? `(${i.codigo})` : ""}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div style={SUBHEAD}>Resultado del estudio</div>
        <div className="row3">
          <div className="field">
            <label>Tipo de estudio</label>
            <select name="tipo_estudio" defaultValue="PREAPROBACION">
              <option value="PREAPROBACION">Preaprobación</option>
              <option value="NORMAL">Normal</option>
              <option value="INDUCCION">Inducción</option>
            </select>
          </div>
          <div className="field">
            <label>Score</label>
            <input name="score" type="number" min="0" max="1000" placeholder="720" />
          </div>
          <div className="field">
            <label>Tier</label>
            <select name="tier" defaultValue="">
              <option value="">—</option>
              {TIERS.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="row2">
          <div className="field">
            <label>Cupo máximo (pesos)</label>
            <input name="cupo_max" type="number" min="0" placeholder="1800000" />
          </div>
          <div className="field">
            <label>Tasa sugerida (decimal, ej. 0.02 = 2%)</label>
            <input name="tasa_sugerida" type="number" step="0.00001" min="0" placeholder="0.02" />
          </div>
        </div>

        <div style={{ display: "flex", gap: 10, marginTop: 8 }}>
          <button type="submit" className="btn btn-purple">
            Crear estudio
          </button>
          <Link href="/backoffice/estudios" className="btn btn-outline">
            Cancelar
          </Link>
        </div>
      </form>
    </>
  );
}
