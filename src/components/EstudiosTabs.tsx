"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/backoffice/estudios", label: "Estudios" },
  { href: "/backoffice/procesos", label: "Procesos de inducción" },
];

export function EstudiosTabs() {
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
