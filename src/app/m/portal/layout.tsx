import "./portal.css";
import { Shell } from "@/core/shell/Shell";
import { getModule } from "@/core/registry";
import { canAdminModule } from "@/core/auth/guards";
import type { SuiteNavItem } from "@/core/shell/types";

/**
 * Die Navigationseintraege des Moduls — als benannte Funktion, damit die
 * Ableitung ohne Rendering pruefbar ist (`layout.test.tsx`).
 *
 * OHNE VERWALTUNGSRECHT GAR KEINE NAVIGATION, statt einer Zeile mit dem einen
 * Eintrag „Uebersicht", der auf die Seite zeigt, auf der man steht. Der Slot
 * ist optional (siehe 2026-07-27-suite-chrome-design.md §5); wer nichts
 * uebergibt, bekommt exakt das bisherige Bild.
 */
export function navFuerPortal(darfVerwalten: boolean): SuiteNavItem[] {
  if (!darfVerwalten) return [];
  return [
    { key: "start", title: "Übersicht", href: "/" },
    { key: "admin", title: "Verwaltung", href: "/admin" },
  ];
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
