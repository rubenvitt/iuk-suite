import { headers } from "next/headers";
import { Shell } from "@/core/shell/Shell";
import { requireUavAdminPage } from "../_lib/requireUavAdmin";
import { requireUavHost } from "../_lib/host";

/**
 * Die Hülle der Verwaltung — GESCHWISTER-SEGMENT von `(teilnehmer)/layout.tsx`
 * unter `m/uav` (Vorbild `feedback/(admin)/layout.tsx`, `radio/(ausleihe)/
 * layout.tsx`), nicht dessen Kind: `src/app/m/uav/layout.tsx` trägt seit
 * Aufgabe 15 keine Shell mehr, genau damit dieses Layout `variant="full"`
 * bekommen kann, ohne von der äußeren `variant="minimal"` des Teilnehmer-
 * Zweigs (Registry: `uav.shell`) umschlossen zu werden.
 *
 * `requireUavHost(await headers())` steht als ERSTE Anweisung, VOR
 * `requireUavAdminPage()`: `isModuleAdmin` prüft nur die Gruppenzugehörigkeit,
 * nicht den Host — ohne den Host-Riegel gäte die Verwaltung auf JEDEM
 * Suite-Host, der auf den Container terminiert (Vorbild `radio/_lib/host.ts`-
 * Kopfkommentar). `requireUavAdminPage()` steht HIER UND zusätzlich auf jeder
 * einzelnen Seite (Vorbild `radio/(ausleihe)/layout.tsx`s Kopfkommentar): eine
 * Route-Group ist Bequemlichkeit, keine Sicherheitsgrenze, und ein
 * `page.test.tsx` rendert die Seite ohnehin ohne dieses Layout.
 */
export default async function UavAdminLayout({ children }: { children: React.ReactNode }) {
  requireUavHost(await headers());
  await requireUavAdminPage();

  return (
    <Shell
      variant="full"
      moduleKey="uav"
      nav={[
        { key: "teilnehmer", title: "Teilnehmer", href: "/admin" },
        { key: "katalog", title: "Katalog", href: "/admin/katalog" },
        { key: "training", title: "Training", href: "/" },
      ]}
    >
      {children}
    </Shell>
  );
}
