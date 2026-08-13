import { SuiteRahmen } from "@/core/shell/SuiteRahmen";
import type { SuiteNavItem } from "@/core/shell/types";

/**
 * Wie `FullShell`, nur mit begrenzter Inhaltsbreite — und mit dem
 * Handschuh-Masz, das die Suite ueberall vorgibt (`controlHeight: 56`). Genau
 * das ist ab 2026-08-13 der Unterschied: `FullShell` legt fuer die
 * Schreibtischarbeit eine dichtere Bediendichte darueber, `MinimalShell` nicht.
 * `qr` und `beta` sind Einsatzformulare.
 *
 * Die Seitenleiste bekommt diese Variante seither ebenfalls — `qr` uebergibt
 * eine Navigation („Generator" / „Verwaltung"), und die stand vorher als
 * zweite Kopfzeile da.
 *
 * `data-testid="minimal-shell"` bleibt: `e2e/qr.spec.ts` fragt es ab.
 */
export async function MinimalShell({
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
      <div data-testid="minimal-shell" style={{ maxWidth: 640, marginInline: "auto" }}>
        {children}
      </div>
    </SuiteRahmen>
  );
}
