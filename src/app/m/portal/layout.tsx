import "./portal.css";
import { canReadAudit } from "@/core/audit/access";
import { Shell } from "@/core/shell/Shell";
import { getModule } from "@/core/registry";
import { canAdminModule } from "@/core/auth/guards";
import { auth } from "@/core/auth";
import { darfWartungSehen, wartungsAbo } from "@/app/m/portal/_lib/serverwartung";
import type { SuiteNavItem } from "@/core/shell/types";
import { sichtbareQuellen } from "@/app/m/portal/_lib/faelligkeiten/sammeln";

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
 * ist schlimmer als kein Eintrag. Aus demselben Grund haengt „Serverwartung"
 * an `darfWartung` — und das ist eine EIGENE Frage, nicht die der Verwaltung
 * (`_lib/serverwartung.ts`, `darfWartungSehen`).
 */
export function navFuerPortal(darfVerwalten: boolean, darfAuditLesen = false, darfWartung = false, darfFristen = false): SuiteNavItem[] {
  const jeder: SuiteNavItem[] = [
    { key: "start", title: "Übersicht", href: "/" },
    // IDA-297: dasselbe Prädikat wie die Seite (`sichtbareQuellen`), sonst führte der Eintrag auf 404.
    ...(darfFristen ? [{ key: "faelligkeiten", title: "Was steht an", href: "/faelligkeiten" }] : []),
    { key: "neuigkeiten", title: "Neuigkeiten", href: "/neuigkeiten" },
    ...(darfWartung ? [{ key: "serverwartung", title: "Serverwartung", href: "/serverwartung" }] : []),
  ];
  if (!darfVerwalten) return jeder;
  return [...jeder, { key: "admin", title: "Verwaltung", href: "/admin" },
    ...(darfAuditLesen ? [{ key: "audit", title: "Audit-Log", href: "/admin/audit" }] : [])];
}

export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  const mod = getModule("portal");
  // Die Verwaltung steht nur Modul-Admins offen (`core/auth/guards`, hier die
  // Suite-Admin-Gruppe, weil `portal` keine eigene fuehrt) — also steht sie
  // auch nur ihnen in der Navigation. Ein Eintrag, der auf 404 fuehrt, ist
  // schlimmer als kein Eintrag. Dieselbe Bauform wie in `qr/layout.tsx`.
  const [darfVerwalten, darfAuditLesen, session] = await Promise.all([
    canAdminModule("portal"),
    canReadAudit(),
    auth(),
  ]);
  // Ohne eingerichtetes Abo fuehrte der Eintrag auf 404 (`serverwartung/page.tsx`).
  const darfWartung = wartungsAbo() !== null && darfWartungSehen(session?.user?.groups);
  const darfFristen = sichtbareQuellen(session?.user?.groups).length > 0;

  return (
    <Shell variant={mod.shell} moduleKey={mod.key} nav={navFuerPortal(darfVerwalten, darfAuditLesen, darfWartung, darfFristen)}>
      {children}
    </Shell>
  );
}
