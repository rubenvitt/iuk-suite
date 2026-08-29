import { headers } from "next/headers";
import { Shell } from "@/core/shell/Shell";
import { getModule } from "@/core/registry";
import { canAdminModule } from "@/core/auth/guards";
import { RegisterSW } from "../RegisterSW";
import { swModus } from "../_lib/boot";
import { requireUavHost } from "../_lib/host";

/**
 * Die Hülle des Teilnehmer-Zweigs (`/`, `/aufgabe`, `/login`) — Vorbild
 * `feedback/(admin)/layout.tsx` bzw. `radio/(ausleihe)/layout.tsx`: Route-
 * Groups tragen ihre EIGENE Shell-Entscheidung, weil `src/app/m/uav/layout.tsx`
 * (Vorfahr JEDES Kindes, auch der Verwaltung) seit Aufgabe 15 bewusst KEINE
 * Shell mehr trägt (Vorbild `lagerbuch/layout.tsx`/`radio/layout.tsx`) — sonst
 * bekäme die Verwaltung (`(admin)/layout.tsx`, `variant="full"`) eine ZWEITE,
 * äußere Shell in `variant="minimal"` (Registry: `uav.shell === "minimal"`)
 * um sich herum: doppelte `SuiteHeader`/`AppUmschalter`.
 *
 * `RegisterSW`/`swModus` bleiben HIER, nicht am Modul-Root: der Service-Worker
 * ist eine Teilnehmer-PWA-Angelegenheit, die Verwaltung braucht ihn nicht. Im
 * Modus `abraeumen` (Vorgabe) registriert die Komponente ohnehin nichts — kein
 * Verhalten geht verloren, nur der Aufruf zieht in den Zweig, der ihn braucht.
 *
 * `requireUavHost(await headers())` steht als ERSTE Anweisung (Vorbild `radio/_lib/
 * host.ts`-Kopfkommentar, Zeile „fuer LAYOUTS UND SEITEN, erste Anweisung"): ohne ihn
 * rendert dieser Zweig unter JEDEM Suite-Host, der auf den Container terminiert, und
 * die relativen `/api/*`-Aufrufe des Teilnehmer-Inselcodes träfen dort das FALSCHE Modul.
 */
export default async function UavTeilnehmerLayout({ children }: { children: React.ReactNode }) {
  requireUavHost(await headers());
  const mod = getModule("uav");
  const darfVerwalten = await canAdminModule("uav");

  return (
    <Shell
      variant={mod.shell}
      moduleKey={mod.key}
      nav={[
        { key: "start", title: "Training", href: "/" },
        ...(darfVerwalten ? [{ key: "admin", title: "Verwaltung", href: "/admin" }] : []),
      ]}
    >
      <RegisterSW modus={swModus(process.env)} />
      {children}
    </Shell>
  );
}
