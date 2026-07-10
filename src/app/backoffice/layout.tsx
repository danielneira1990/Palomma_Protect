import { Bird } from "@/components/Bird";
import { BackofficeNav } from "@/components/BackofficeNav";

export default function BackofficeLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="app bo">
      <aside className="sidebar">
        <div className="sb-head">
          <Bird color="#7c4de8" />
          <span className="wm">
            PALOMMA<small>Protect · Backoffice</small>
          </span>
        </div>
        <BackofficeNav />
      </aside>
      <div className="main">
        <div className="topbar">
          <span className="badge">Operación interna</span>
          <div className="right">
            <div className="who">
              <span className="av">DN</span>Daniel · Palomma
            </div>
          </div>
        </div>
        <div className="content">{children}</div>
      </div>
    </div>
  );
}
