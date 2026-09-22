/**
 * DER RÜCKMELDEWEG DER SUITE — eine Adresse, und ihre Vorgabe ist AUS.
 *
 * Die Suite sammelt Rückmeldungen über ein externes Formular (heute ein
 * ClickUp-Formular). Diese Datei beantwortet die eine Frage, an der alles
 * hängt: ist der Weg überhaupt eingerichtet? Ohne die Variable lautet die
 * Antwort `null`, und dann gibt es weder Menüeintrag noch Kachel noch Knopf —
 * die Suite verhält sich wie vorher.
 *
 * ⚠️ VERLINKT, NICHT EINGEBETTET, und das ist eine Entscheidung mit Gründen
 * (DRK-453). ClickUp bietet für dasselbe Formular ein `<iframe>` samt einem
 * Skript von `app-cdn.clickup.com`, das dessen Höhe nachführt. Der Preis wäre
 * ein zweites Fremdskript auf jeder Arbeitsfläche — für ein Formular, das
 * keinen Dunkelmodus kennt und dessen Innenleben wir weder messen noch
 * anpassen können. Die abgelöste Formbricks-Einbindung hat genau diese Arbeit
 * gekostet (ein ganzes Stylesheet nur dafür, dass eine Umfrage dieselben Farben
 * trägt wie die Suite); hier ließe sie sich nicht einmal erledigen. Ein Link
 * kostet nichts, öffnet in einem neuen Tab, und ein Wechsel des Formularanbieters
 * ist eine Zeile in der `.env`.
 *
 * ⚠️ KEIN `"use client"` IN DIESER DATEI, und das ist keine Formsache (Falle 6,
 * `CLAUDE.md`). `FullShell` und `SuiteHeader` sind Server Components und lesen
 * `rueckmeldungUrl()` beim Rendern. Trüge dieses Modul `"use client"`, bekämen
 * sie eine Client-Referenz statt der Adresse — HTTP 500 für jede Arbeitsfläche
 * der Suite. `typecheck` und `build` blieben grün, und **Vitest könnte es
 * strukturell nicht finden** (dort ist `"use client"` ein wirkungsloser
 * String). `einbindung.test.ts` hält die Abwesenheit als Quelltext-Zusicherung
 * fest.
 *
 * ⚠️ DER WERT IST SERVERSEITIG, NICHT `NEXT_PUBLIC_*`. Er erreicht den Browser
 * als Prop der Client-Insel, nicht über das Bundle. Das ist der Unterschied,
 * der „nicht gesetzt = aus" überhaupt erst prüfbar macht: ein
 * `NEXT_PUBLIC_`-Wert wird zur Bauzeit eingebacken, und das Abschalten in E2E
 * (`playwright.config.ts`) erreichte den gebauten Stand nicht mehr.
 */

/**
 * ⚠️ `SUITE_RUECKMELDUNG_URL` UND NICHT `SUITE_FEEDBACK_URL`, obwohl die
 * Oberfläche „Feedback" sagt — das Wort ist in der `.env` bereits dreifach
 * vergeben, und zwar an etwas anderes: `SUITE_HOST_FEEDBACK`,
 * `SUITE_ACCESS_GROUP_FEEDBACK` und `SUITE_ADMIN_GROUP_FEEDBACK` gehören dem
 * MODUL `feedback` (Dienstabend-Rückmeldungen mit eigener Datenbank, eigenen
 * Gruppen, eigenem Host). Eine vierte Variable mit demselben Wort und einer
 * fremden Bedeutung wäre genau die Sorte Nachbarschaft, in der sich jemand beim
 * Einrichten vergreift — und der Irrtum wäre still: ein Formularlink im Feld
 * für einen Hostnamen bricht nichts, er schaltet nur das Falsche.
 */
export const RUECKMELDUNG_URL_ENV = "SUITE_RUECKMELDUNG_URL";

/**
 * Nur `http`/`https`. Der Wert landet als `href` eines Links, und `javascript:`
 * ist dort eine Skriptausführung mit den Rechten der Suite. Ein Tippfehler wie
 * `forms.clickup.com/…` (ohne Schema) gäbe eine relative Adresse auf dem
 * eigenen Host — der Link führte ins Leere, und niemand wüsste, warum.
 */
function istBrauchbareAdresse(wert: string): boolean {
  try {
    const { protocol } = new URL(wert);
    return protocol === "https:" || protocol === "http:";
  } catch {
    return false;
  }
}

/**
 * ⚠️ HÖCHSTENS EINE WARNUNG JE PROZESS, und das ist kein Feinschliff.
 *
 * `rueckmeldungUrl()` läuft in `FullShell` und `SuiteHeader`, und beide rendern
 * JE ANFRAGE. Ohne diese Sperre schriebe ein Tippfehler in der `.env` nicht
 * „eine Warnung ins Serverlog", sondern zwei Zeilen pro Seitenaufruf jeder
 * Arbeitsfläche — und ersäufte damit genau das Log, das er informieren soll.
 */
let schonGewarnt = false;

/** Nur für Tests: die Sperre zurücknehmen. */
export function _warnsperreZuruecksetzen(): void {
  schonGewarnt = false;
}

/**
 * ⚠️ EIN GESETZTER, ABER UNBRAUCHBARER WERT BRICHT DEN START NICHT AB — anders
 * als bei den Zugriffsgruppen (`validateGroupConfig`), und der Unterschied ist
 * die Tragweite: eine falsche Gruppe ist ein Sicherheitsfehler, eine falsche
 * Formularadresse kostet eine Rückmeldung. Die ganze Suite dafür anzuhalten
 * wäre nicht verhältnismäßig.
 *
 * Still ist es trotzdem nicht: der Fall schreibt eine Warnung ins Serverlog.
 * Das ist der Unterschied zwischen „aus, weil nicht eingerichtet" und „aus,
 * obwohl jemand es einrichten wollte" — und nur der zweite Fall ist ein Fehler.
 */
export function rueckmeldungUrl(
  // Wie in `hosts.ts`/`registry.ts`: nur „String rein, String oder undefined
  // raus" — bewusst nicht `NodeJS.ProcessEnv`, den Next mit einem
  // schreibgeschützten `NODE_ENV` augmentiert (ein Testobjekt ohne dieses Feld
  // wäre sonst nicht zuweisbar).
  env: Record<string, string | undefined> = process.env,
  warnen: (meldung: string) => void = console.warn,
): string | null {
  const roh = (env[RUECKMELDUNG_URL_ENV] ?? "").trim();

  // Leer: nicht eingerichtet. Der Normalfall, und kein Wort darüber.
  if (roh === "") return null;

  if (!istBrauchbareAdresse(roh)) {
    if (!schonGewarnt) {
      schonGewarnt = true;
      warnen(
        `Der Rückmeldeweg bleibt aus: ${RUECKMELDUNG_URL_ENV} ist keine http(s)-Adresse (${roh}).`,
      );
    }
    return null;
  }

  return roh;
}
