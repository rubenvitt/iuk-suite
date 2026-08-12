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
import { launcherEintraege } from "@/core/shell/launcherEintraege";
import { AppUmschalter } from "@/core/shell/AppUmschalter";
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
 * Die Einträge werden HIER gebaut, nicht im Client: `launcherEintraege()`
 * liest über `moduleUrl()` `process.env`, das im Client-Bundle nicht existiert,
 * und erreicht für die Dienste-Hälfte die Portal-Datenbank. `AppUmschalter`
 * bekommt nur die fertige Liste mit fertigen hrefs.
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
  // DIE GEMISCHTE LISTE — Module UND Dienste —, aber NUR angemeldet: der
  // App-Umschalter ist der einzige Konsument, und er existiert anonym gar
  // nicht (Begründung am JSX unten). `launcherEintraege` erreicht für die
  // Dienste-Hälfte die Portal-Datenbank; ein anonymer Aufruf würde sie für
  // eine Liste öffnen, die niemand zu sehen bekommt. Deshalb bleibt sie hier
  // ungerufen, und die Liste bleibt `[]`.
  const eintraege = angemeldet ? await launcherEintraege(session?.user?.groups ?? null) : [];

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
         * DER TITEL IST JETZT DER UMSCHALTER, kein Link mehr.
         *
         * Der Weg zurück auf die Modulstartseite geht nicht verloren, er
         * wandert: als eigener, markierter Eintrag im Panel und als erster
         * Eintrag der Modulnavigation. Das kostet einen Klick. Der Gegenwert
         * ist, dass „wo bin ich" und „wohin kann ich" an einer Stelle stehen
         * statt an zweien — und dass die Kopfzeile nicht mehr jedes sichtbare
         * Modul aufführt.
         *
         * Anonym gibt es keinen Umschalter, sondern nur den Titel: eine
         * Liste, deren Einträge sämtlich zum Login umleiten, verspricht
         * „hier kannst du hin" und liefert „hier musst du dich erst anmelden"
         * (Suite-Chrome §6). `data-testid="module-title"` steht deshalb in
         * GENAU EINEM der beiden Zweige — nie in beiden, sonst fände ein
         * Playwright-Locator zwei Knoten (Strict-Mode-Verletzung).
         * `moduleUrl` kennt Dev- und Prod-Hosts; ohne Host bleibt "/" — nie
         * ein toter Link.
         */}
        {angemeldet ? (
          <AppUmschalter modulTitel={mod.title} modulKey={moduleKey} eintraege={eintraege} />
        ) : (
          <Link href={moduleUrl(moduleKey) ?? "/"} className={s.titel}>
            {/* `data-testid` bleibt auf dem `<strong>` — der Keystone-E2E fragt es
                dort ab. Die Rolle `unterTitel` (20/600) statt `titel` (24): die
                Kopfzeile ist 64px hoch, 24px wären darin zu laut. Die Sperrung
                des Vorbilds kommt hier dazu, statt eine achte Rolle mit einem
                einzigen Anwender anzulegen.

                DIESELBE Rolle trägt der Titel im `AppUmschalter` — sonst sähe
                der Modulname angemeldet anders aus als anonym, und das wäre
                weder gewollt noch erklärbar. */}
            <strong
              data-testid="module-title"
              style={{ ...SCHRIFT.unterTitel, letterSpacing: "0.07em" }}
            >
              {mod.title}
            </strong>
          </Link>
        )}
        <SuiteNav nav={nav} userName={session?.user?.name ?? null} angemeldet={angemeldet} />
      </Header>
      <Modulnav nav={nav} />
    </>
  );
}
