import Link from "next/link";
import { Bird } from "@/components/Bird";

export default function Home() {
  return (
    <div className="landing">
      <div className="landing-inner">
        <div style={{ display: "flex", justifyContent: "center", marginBottom: 14 }}>
          <Bird color="#7c4de8" className="bird" />
        </div>
        <h1>Palomma Protect</h1>
        <p className="sub">Fianza de arrendamiento · entorno de desarrollo</p>
        <div className="entries">
          <Link href="/inmobiliaria" className="entry">
            <h3>Portal Inmobiliaria →</h3>
            <span>Vista embebida en Pay: preaprobados, contratos, avisos, siniestros y facturación.</span>
          </Link>
          <Link href="/backoffice" className="entry">
            <h3>Backoffice Palomma →</h3>
            <span>Operación interna: inmobiliarias, usuarios, calendario, facturación y cobranza.</span>
          </Link>
        </div>
      </div>
    </div>
  );
}
