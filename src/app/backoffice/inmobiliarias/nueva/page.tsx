import Link from "next/link";
import { NuevaInmobiliariaForm } from "./NuevaInmobiliariaForm";

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

      <NuevaInmobiliariaForm />
    </>
  );
}
