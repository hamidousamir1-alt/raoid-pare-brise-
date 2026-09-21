"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
type Prospect = {
  id: string;
  name: string;
  sector?: string;
  zone?: string;
  address?: string;
  phone?: string;
  fleet?: string;
  status?: string;
  score?: number;
  next?: string;
  notes?: string;
  access?: string;
  insurance?: string;
  potentialRevenue?: number;
  signedRevenue?: number;
  generatedRevenue?: number;
};
const nav = [
  ["/", "▦", "Tableau de bord"],
  ["/prospection", "◎", "Prospection"],
  ["/pipeline", "◇", "Pipeline"],
  ["/terrain", "⌖", "Terrain"],
  ["/partenaires", "♢", "Partenaires"],
  ["/documents", "▤", "Documents"],
  ["/messages", "✉", "Messages"],
  ["/performance", "↗", "Performance"],
] as const;
const money = (n = 0) =>
  new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(n);
export default function AppShell({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  const [q, setQ] = useState("");
  const [items, setItems] = useState<Prospect[]>([]);
  const [selected, setSelected] = useState<Prospect | null>(null);
  useEffect(() => {
    if (path === "/login") return;
    let live = true;
    (async () => {
      try {
        const r = await fetch("/api/prospects", { cache: "no-store" });
        if (r.status === 401) {
          location.href = "/login";
          return;
        }
        if (!r.ok) return;
        const d = await r.json();
        if (d.mode === "postgresql" && live) setItems(d.items || []);
      } catch {}
    })();
    return () => {
      live = false;
    };
  }, [path]);
  const results = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (s.length < 2) return [];
    return items
      .filter((p) =>
        [p.name, p.sector, p.zone, p.address, p.phone].some((v) =>
          String(v || "")
            .toLowerCase()
            .includes(s),
        ),
      )
      .slice(0, 7);
  }, [q, items]);
  if (path === "/login") return <>{children}</>;
  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" }).catch(() => {});
    location.href = "/login";
  }
  return (
    <div className="appFrame">
      <aside className="side persistentSide">
        <Link href="/" className="brand">
          <span>R</span>
          <div>
            RAPID
            <br />
            <b>PARE-BRISE</b>
            <small>CRM B2B</small>
          </div>
        </Link>
        <nav>
          {nav.map(([href, icon, label]) => (
            <Link
              key={href}
              className={path === href ? "active" : ""}
              href={href}
            >
              <i>{icon}</i>
              <span>{label}</span>
            </Link>
          ))}
        </nav>
        <div className="profile">
          <div className="avatar">SR</div>
          <div>
            <b>Samir</b>
            <small>Commercial B2B</small>
          </div>
          <button
            onClick={logout}
            title="Se déconnecter"
            aria-label="Se déconnecter"
          >
            ↪
          </button>
        </div>
      </aside>
      <div className="appMain">
        <div className="globalBar">
          <div className="globalSearch">
            <span>⌕</span>
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Rechercher une entreprise, zone, téléphone…"
              aria-label="Rechercher une entreprise"
            />
            {q && <button onClick={() => setQ("")}>×</button>}
            {q.trim().length >= 2 && (
              <div className="searchResults">
                {results.length ? (
                  results.map((p) => (
                    <button
                      key={p.id}
                      onClick={() => {
                        setSelected(p);
                        setQ("");
                      }}
                    >
                      <b>{p.name}</b>
                      <small>
                        {p.sector || "Activité à renseigner"} ·{" "}
                        {p.zone || p.address || "Zone à renseigner"}
                      </small>
                      <span>
                        {p.status || "Nouveau"} · {p.score || 0}/100
                      </span>
                    </button>
                  ))
                ) : (
                  <p>Aucune entreprise trouvée.</p>
                )}
              </div>
            )}
          </div>
          <Link className="quickAdd" href="/prospection">
            ＋ Nouveau prospect
          </Link>
        </div>
        {children}
      </div>
      {selected && (
        <div className="companyOverlay" onMouseDown={() => setSelected(null)}>
          <aside
            className="companySheet"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <header>
              <div>
                <small>FICHE ENTREPRISE</small>
                <h2>{selected.name}</h2>
                <p>
                  {selected.sector || "Activité à renseigner"} ·{" "}
                  {selected.status || "Nouveau"}
                </p>
              </div>
              <button onClick={() => setSelected(null)}>×</button>
            </header>
            <div className="sheetKpis">
              <div>
                <small>SCORE</small>
                <b>{selected.score || 0}/100</b>
              </div>
              <div>
                <small>POTENTIEL</small>
                <b>{money(selected.potentialRevenue)}</b>
              </div>
              <div>
                <small>CA SIGNÉ</small>
                <b>{money(selected.signedRevenue)}</b>
              </div>
            </div>
            <section>
              <h3>Coordonnées & flotte</h3>
              <p>
                <b>Zone :</b> {selected.zone || "À renseigner"}
              </p>
              <p>
                <b>Adresse :</b> {selected.address || "À renseigner"}
              </p>
              <p>
                <b>Téléphone :</b> {selected.phone || "À renseigner"}
              </p>
              <p>
                <b>Flotte :</b> {selected.fleet || "À estimer"}
              </p>
            </section>
            <section>
              <h3>Suivi commercial</h3>
              <p>
                <b>Prochaine action :</b> {selected.next || "À planifier"}
              </p>
              <p>
                <b>Accès :</b> {selected.access || "À vérifier"} ·{" "}
                <b>Assurance :</b> {selected.insurance || "À vérifier"}
              </p>
              <p>
                <b>CA généré :</b> {money(selected.generatedRevenue)}
              </p>
              <p>
                <b>Notes :</b> {selected.notes || "Aucune note"}
              </p>
            </section>
            <footer>
              <Link
                href={`/prospection?prospect=${selected.id}`}
                onClick={() => setSelected(null)}
              >
                Ouvrir la fiche complète →
              </Link>
            </footer>
          </aside>
        </div>
      )}
    </div>
  );
}
