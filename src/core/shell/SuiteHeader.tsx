import Link from "next/link";
// `Header` NICHT als `Layout.Header` referenzieren, auch nicht per Destrukturierung
// auf Modulebene: antds Layout-Komposition haengt die Unterkomponenten erst zur
// Laufzeit per Property-Zuweisung an (`Layout.Header = Header`). In einer Server
// Component loest Next/Turbopack diesen Laufzeit-Property-Zugriff auf einem
// "use client"-Export nicht auf — Ergebnis: `undefined`, 500er ("Element type is
// invalid"). Empirisch verifiziert (curl gegen `next dev`, siehe FullShell.tsx-
// Historie); `pnpm build`/`pnpm typecheck` decken das NICHT ab. Der direkte
// Named-Import aus dem tiefen Pfad umgeht das.
import { Header } from "antd/es/layout/layout";

import { auth } from "@/core/auth";
import { getModule } from "@/core/registry";
import { moduleUrl } from "@/core/shell/moduleUrl";
import { modulEintraege } from "@/core/shell/launcherEintraege";
import { Modulnav, SuiteNav } from "@/core/shell/SuiteNav";
import type { SuiteNavItem } from "@/core/shell/types";
import { SCHRIFT } from "@/core/theme/schrift";
import s from "./shell.module.css";

/**
 * Die eine Kopfzeile der Suite. `FullShell` und `MinimalShell` rufen beide sie —
 * damit ist der Maszstab aus docs/design/README.md erfuellt (zwei belegbare
 * Nutznieszer, heute).
 *
 * Server-Komponente, und das ist geprueft unbedenklich: der Kommentar in
 * `app/m/qr/layout.tsx`, ein `await auth()` mache die Routen dynamisch, ist
 * veraltet — `pnpm build` weist jede Route der Suite als `f (Dynamic)` aus,
 * weil das Root-Layout `cookies()` fuer den Theme-Modus liest.
 *
 * Die Eintraege werden HIER gebaut, nicht im Client: `modulEintraege()` liest
 * über `moduleUrl()` `process.env`, das im Client-Bundle nicht existiert.
 * `SuiteNav` bekommt nur fertige hrefs.
 */
export async function SuiteHeader({
  moduleKey,
  nav = [],
}: {
  moduleKey: string;
  nav?: SuiteNavItem[];
}) {
  const session = await auth();
  const angemeldet = !!session?.user;
  const mod = getModule(moduleKey);
  // NUR `modulEintraege`, noch nicht die gemischte Liste: die Modulzeile ist
  // in dieser Aufgabe unverändert (`SuiteNav.tsx`, `<nav aria-label="Module">`)
  // und würde einen Dienst fälschlich als „Modul" auszeichnen — falsch für
  // einen Screenreader — und `extern` (neuer Tab) nirgends lesen. Der Merge
  // (`launcherEintraege`, der die Portal-Datenbank braucht) zieht hier erst in
  // Task 4 ein, wo der App-Umschalter ihn tatsächlich konsumiert. Anonym
  // bleibt die Liste leer: `modulEintraege` berührt zwar keine Datenbank,
  // aber SuiteNav zeigt die Modulzeile ohnehin nur angemeldet.
  const eintraege = angemeldet ? modulEintraege(session?.user?.groups ?? null) : [];

  /*
   * ZWEI GESCHWISTER, NICHT EIN VERSCHACHTELTER BLOCK — die Modulnavigation
   * steht UNTER der Kopfzeile und nicht darin.
   *
   * Als drittes Flex-Kind von `.kopf` konkurrierte sie mit dem Titel um die
   * Breite: zwischen 768px und 903px schrumpfte er auf 0px und die Seite
   * scrollte seitwaerts (rechte Kante 904px, gemessen). Der Entwurf (§4,
   * Tabelle) sah immer eine „zweite Zeile" vor, und `headerHeight` bleibt
   * deshalb 64 — die Zeile kommt darunter hinzu, statt den Kopf zu dehnen.
   * Die ausfuehrliche Begruendung steht an `Modulnav` in `SuiteNav.tsx`.
   *
   * `data-testid="suite-header"` bleibt am `<Header>` und umfasst die zweite
   * Zeile damit NICHT mehr. Das ist gewollt: der 390px-Hoehentest misst genau
   * diesen Knoten und soll weiter nur die Kopfzeile messen. Dass die zweite
   * Zeile mobil unsichtbar bleibt, hat seitdem eine eigene Zusicherung in
   * `e2e/shell-mobil.spec.ts`.
   */
  return (
    <>
      {/* Vor der Kopfzeile, nicht darin: eine Kante an der antd-Flaeche waere ein
          Spezifitaetsstreit, ein eigenes Element ist keiner. `aria-hidden`, weil
          der Streifen reine Marke ist und nichts vorliest. */}
      <div className={s.streifen} aria-hidden="true" />
      <Header data-testid="suite-header" className={s.kopf}>
        {/*
         * Der Modultitel fuehrt auf die Startseite SEINES Moduls (Entwurf
         * feedback-admin §4.1). Ohne diesen Link ist jede Unterseite eine
         * Sackgasse — der Defekt hing an der Shell und galt fuer jedes Modul.
         *
         * `data-testid` bleibt auf dem `<strong>` und wandert NICHT an den
         * Link: der Keystone-E2E fragt es dort ab. `moduleUrl` kennt Dev- und
         * Prod-Hosts; ohne Host bleibt "/" — nie ein toter Link.
         */}
        <Link href={moduleUrl(moduleKey) ?? "/"} className={s.titel}>
          {/* `data-testid` bleibt auf dem `<strong>` — der Keystone-E2E fragt es
              dort ab. Die Rolle `unterTitel` (20/600) statt `titel` (24): die
              Kopfzeile ist 64px hoch, 24px waeren darin zu laut. Die Sperrung
              des Vorbilds kommt hier dazu, statt eine achte Rolle mit einem
              einzigen Anwender anzulegen. */}
          <strong data-testid="module-title" style={{ ...SCHRIFT.unterTitel, letterSpacing: "0.07em" }}>
            {mod.title}
          </strong>
        </Link>
        <SuiteNav
          entries={eintraege}
          nav={nav}
          userName={session?.user?.name ?? null}
          angemeldet={angemeldet}
        />
      </Header>
      <Modulnav nav={nav} />
    </>
  );
}
