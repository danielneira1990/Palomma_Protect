"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/inmobiliaria/preaprobados", label: "Preaprobados" },
  { href: "/inmobiliaria/contratos", label: "Contratos" },
  { href: "/inmobiliaria/avisos", label: "Avisos" },
  { href: "/inmobiliaria/siniestros", label: "Siniestros" },
  { href: "/inmobiliaria/facturacion", label: "Facturación" },
];

export function ProtectTabs() {
  const path = usePathname();
  return (
    <div className="tabs">
      {TABS.map((t) => (
        <Link key={t.href} href={t.href} className={`tab${path === t.href ? " on" : ""}`}>
          {t.label}
        </Link>
      ))}
    </div>
  );
}
