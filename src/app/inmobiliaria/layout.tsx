import { Bird } from "@/components/Bird";
import { ProtectTabs } from "@/components/ProtectTabs";

const PagosMenu = ["Resumen", "Clientes", "Recaudos", "Conciliación", "WhatsApp", "Pagos"];

export default function InmobiliariaLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="app">
      <aside className="sidebar">
        <div className="sb-head">
          <Bird />
          <span className="wm">
            PALOMMA<small>Pay</small>
          </span>
        </div>

        <div className="sb-sec">Pagos</div>
        {PagosMenu.map((m) => (
          <div key={m} className="nav-item" style={{ opacity: 0.55, cursor: "default" }}>
            <span style={{ width: 18 }} />
            {m}
          </div>
        ))}

        <div className="sb-sec">Fianza</div>
        <div className="nav-item active">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
            <path d="M12 3l7 3v5c0 4.5-3 8-7 10-4-2-7-5.5-7-10V6z" />
            <path d="M9 12l2 2 4-4" />
          </svg>
          Protect
          <span className="nb">MVP</span>
        </div>
      </aside>

      <div className="main">
        <div className="topbar">
          <div className="comercio">
            <span className="ci">🏢</span> Indika Inmobiliaria S.A.S.
          </div>
          <div className="right">
            <div className="who">
              <span className="av">JF</span>Juan Felipe · Admin
            </div>
          </div>
        </div>
        <div className="content">
          <div className="head">
            <div>
              <h1>Protect</h1>
              <p>Tu fianza de arrendamiento, dentro de Pay.</p>
            </div>
          </div>
          <ProtectTabs />
          {children}
        </div>
      </div>
    </div>
  );
}
