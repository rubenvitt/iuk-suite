import { headers } from "next/headers";
import { canAdminModule } from "@/core/auth/guards";
import { RegisterSW } from "../RegisterSW";
import { TeilnehmerRahmen } from "../_ui/teilnehmer/TeilnehmerRahmen";
import { swModus } from "../_lib/boot";
import { requireUavHost } from "../_lib/host";

/**
 * Die Hülle des Teilnehmer-Zweigs (`/`, `/aufgabe`, `/anmelden`, `/login`).
 *
 * ⛔ KEINE `<Shell>` MEHR — BETREIBERENTSCHEIDUNG 2026-08-29, die die
 * Entscheidung aus Aufgabe 15 aufhebt. Wörtlich: „anonymer Zugriff muss möglich
 * sein und im Kiosk Mode ohne Shell auch für Teilnehmer." Hier stand bis dahin
 * `<Shell variant={mod.shell}>` (`minimal`, aus dem Registry) mit
 * Suite-Kopfzeile, App-Umschalter und Modulleiste; die Trainingsansicht läuft
 * seither in ihrem eigenen, schlanken Rahmen
 * (`_ui/teilnehmer/TeilnehmerRahmen.tsx`, dort die volle Begründung samt der
 * Frage, was mit der Kopfzeile verschwindet). Vorbild sind
 * `radio/(ausleihe)` und `lagerbuch/helfer`, die ihren öffentlichen Zweig
 * ebenfalls ohne `<Shell>` fahren.
 *
 * ⛔ NICHT `variant="kiosk"`: `KioskShell` verbietet mit `overflow: hidden` das
 * Scrollen, und jede Fläche dieses Zweigs ist länger als ein Telefonbildschirm.
 *
 * ⚠️ `src/app/m/uav/layout.tsx` (Vorfahr JEDES Kindes, auch der Verwaltung)
 * trägt weiterhin nur `metadata.manifest` und `{children}` — die Verwaltung
 * setzt ihre eigene `FullShell` in `(admin)/layout.tsx`. An dieser Aufteilung
 * ändert sich nichts; es entfällt allein die Hülle DIESES Zweigs. Der Registry
 * führt für `uav` weiterhin `shell: "minimal"`; gelesen wird der Wert im Modul
 * seither nirgends mehr (die Verwaltung setzt `variant="full"` ausdrücklich).
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
 *
 * `canAdminModule("uav")` entscheidet NUR über das Ziel des Verwaltungslinks im
 * Rahmen, nicht über seine Existenz — Begründung im Rahmen selbst. Ein
 * anonymer Aufruf bleibt anonym: `uav` trägt `requiresAuth: false`, und weder
 * hier noch im Rahmen steht ein Riegel, der jemanden in den Suite-Login
 * schickte.
 */
export default async function UavTeilnehmerLayout({ children }: { children: React.ReactNode }) {
  requireUavHost(await headers());
  const darfVerwalten = await canAdminModule("uav");

  return (
    <TeilnehmerRahmen darfVerwalten={darfVerwalten}>
      <RegisterSW modus={swModus(process.env)} />
      {children}
    </TeilnehmerRahmen>
  );
}
