"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV = [
  { href: "/backoffice/inmobiliarias", label: "Inmobiliarias" },
  { href: "/backoffice/estudios", label: "Estudios" },
  { href: "/backoffice/usuarios", label: "Usuarios" },
  { href: "/backoffice/calendario", label: "Calendario" },
  { href: "/backoffice/contratos", label: "Contratos" },
  { href: "/backoffice/avisos", label: "Avisos" },
  { href: "/backoffice/facturacion", label: "Facturación" },
  { href: "/backoffice/cobranza", label: "Cobranza" },
];

export function BackofficeNav() {
  const path = usePathname();
  return (
    <>
      <div className="sb-sec">Operación</div>
      {NAV.map((n) => {
        const active = path.startsWith(n.href);
        return (
          <Link key={n.href} href={n.href} className={`nav-item${active ? " active" : ""}`}>
            <span style={{ width: 6, height: 6, borderRadius: 99, background: "currentColor", opacity: 0.5, flex: "none" }} />
            {n.label}
          </Link>
        );
      })}
    </>
  );
}
