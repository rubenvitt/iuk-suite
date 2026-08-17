import "./portal.css";
import { Shell } from "@/core/shell/Shell";
import { getModule } from "@/core/registry";
import { canAdminModule } from "@/core/auth/guards";
import type { SuiteNavItem } from "@/core/shell/types";

/**
 * Die Navigationseintraege des Moduls — als benannte Funktion, damit die
 * Ableitung ohne Rendering pruefbar ist (`layout.test.tsx`).
 *
 * BIS ZU DEN RELEASE NOTES STAND HIER: „ohne Verwaltungsrecht gar keine
 * Navigation" — mit der Begruendung, die Leiste haette dann genau einen
 * Eintrag („Uebersicht") gehabt, der auf die Seite zeigt, auf der man steht.
 * Das war keine Navigation, sondern eine Beschriftung. Die Begruendung ist mit
 * `/neuigkeiten` entfallen, nicht die Regel dahinter: es gibt jetzt eine ZWEITE
 * Seite, die jede angemeldete Person erreichen darf, und ohne Leiste waere sie
 * nur ueber die Adresszeile zu haben — auf dem Telefon das schlechteste
 * Eingabegeraet, das es gibt (Pruefrage „Hat jede Action einen Weg in der
 * Oberflaeche?", `docs/design/README.md`).
 *
 * Die Verwaltung bleibt an `darfVerwalten`: ein Eintrag, der auf 404 fuehrt,
 * ist schlimmer als kein Eintrag.
 */
export function navFuerPortal(darfVerwalten: boolean): SuiteNavItem[] {
  const jeder: SuiteNavItem[] = [
    { key: "start", title: "Übersicht", href: "/" },
    { key: "neuigkeiten", title: "Neuigkeiten", href: "/neuigkeiten" },
  ];
  if (!darfVerwalten) return jeder;
  return [...jeder, { key: "admin", title: "Verwaltung", href: "/admin" }];
}

export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  const mod = getModule("portal");
  // Die Verwaltung steht nur Modul-Admins offen (`core/auth/guards`, hier die
  // Suite-Admin-Gruppe, weil `portal` keine eigene fuehrt) — also steht sie
  // auch nur ihnen in der Navigation. Ein Eintrag, der auf 404 fuehrt, ist
  // schlimmer als kein Eintrag. Dieselbe Bauform wie in `qr/layout.tsx`.
  const darfVerwalten = await canAdminModule("portal");

  return (
    <Shell variant={mod.shell} moduleKey={mod.key} nav={navFuerPortal(darfVerwalten)}>
      {children}
    </Shell>
  );
}
