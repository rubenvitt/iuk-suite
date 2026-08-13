import { SuiteRahmen } from "@/core/shell/SuiteRahmen";
import type { SuiteNavItem } from "@/core/shell/types";

/**
 * Die Arbeitsflaechen-Variante: voller Inhaltsbreite, Seitenleiste wenn das
 * Modul eine Navigation uebergibt. Das Geruest teilt sie sich mit
 * `MinimalShell` (`SuiteRahmen`); der Unterschied liegt allein im Inhalt.
 *
 * Die Bediendichte kommt in Aufgabe 5 hier dazu.
 */
export async function FullShell({
  moduleKey,
  nav,
  children,
}: {
  moduleKey: string;
  nav?: SuiteNavItem[];
  children: React.ReactNode;
}) {
  return (
    <SuiteRahmen moduleKey={moduleKey} nav={nav}>
      {children}
    </SuiteRahmen>
  );
}
