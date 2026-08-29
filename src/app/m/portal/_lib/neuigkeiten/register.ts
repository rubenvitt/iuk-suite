import type { Releasenotiz } from "@/app/m/portal/_lib/neuigkeiten/typen";

import anleitungJeAnsicht from "@/app/m/portal/_lib/neuigkeiten/notizen/aufgaben/2026-08-16-anleitung-je-ansicht";
import verteilenZweiAnsichten from "@/app/m/portal/_lib/neuigkeiten/notizen/aufgaben/2026-08-16-verteilen-zwei-ansichten";
import checklisteAlsPdf from "@/app/m/portal/_lib/neuigkeiten/notizen/lagerbuch/2026-08-16-checkliste-als-pdf";
import neuerNameSammelhaus from "@/app/m/portal/_lib/neuigkeiten/notizen/portal/2026-08-16-neuer-name-sammelhaus";
import lesbaresRotImDunkelmodus from "@/app/m/portal/_lib/neuigkeiten/notizen/portal/2026-08-28-lesbares-rot-im-dunkelmodus";
import vonAllenGeraetenAbmelden from "@/app/m/portal/_lib/neuigkeiten/notizen/portal/2026-08-14-von-allen-geraeten-abmelden";
import alteQrCodesGeltenWeiter from "@/app/m/portal/_lib/neuigkeiten/notizen/radio/2026-08-28-alte-qr-codes-gelten-weiter";
import funkInDerSuite from "@/app/m/portal/_lib/neuigkeiten/notizen/radio/2026-08-28-funk-in-der-suite";
import drohnentrainingInDerSuite from "@/app/m/portal/_lib/neuigkeiten/notizen/uav/2026-08-29-drohnentraining-in-der-suite";

/**
 * DAS VERZEICHNIS ALLER NOTIZEN — eine Zeile je Datei, und das ist die einzige
 * Handarbeit, die eine neue Notiz kostet.
 *
 * WARUM ES DIESE LISTE ÜBERHAUPT GIBT. Ein Verzeichnis einzulesen wäre `fs` zur
 * Laufzeit und damit genau der Weg, den `typen.ts` ausschreibt: der Inhalt fände
 * ohne eine weitere `COPY`-Zeile nicht ins Image, und der Ausfall wäre still —
 * eine leere Seite statt eines roten Tores. Ein `import` steht dagegen im
 * Bundle. Der Preis ist die vergessene Zeile hier, und den zahlt `register.test.ts`:
 * er liest das Verzeichnis `notizen/` mit `fs` (im Test darf das, dort läuft
 * Node) und vergleicht es mit dieser Liste. Eine nicht eingetragene Notizdatei
 * ist damit ein roter Test, keine stille Auslassung — dieselbe Bauform, mit der
 * `bootstrap.test.ts` das Migrations-Dreieck und `seed-lokal.test.ts` die
 * Seed-Pflicht absichern.
 *
 * DIE REIHENFOLGE HIER IST BEDEUTUNGSLOS, sortiert wird unten. Die Einträge
 * stehen nach Modul und darin nach Datum, damit die Liste beim Lesen einer
 * Ordnung folgt — nicht, weil die Anzeige sie bräuchte.
 */
const NOTIZEN: readonly Releasenotiz[] = [
  anleitungJeAnsicht,
  verteilenZweiAnsichten,
  checklisteAlsPdf,
  neuerNameSammelhaus,
  vonAllenGeraetenAbmelden,
  lesbaresRotImDunkelmodus,
  funkInDerSuite,
  alteQrCodesGeltenWeiter,
  drohnentrainingInDerSuite,
];

/**
 * Neueste zuerst; bei gleichem Tag nach `slug`.
 *
 * `a.datum < b.datum` UND KEIN `new Date(...)`: `YYYY-MM-DD` sortiert als
 * Zeichenkette exakt chronologisch (feste Feldbreiten, führende Nullen), und
 * ein Datumsobjekt brächte an dieser Stelle nur die Zeitzonenfrage zurück, die
 * `datum.ts` gerade erst beantwortet hat.
 *
 * Der Zweitschlüssel ist ein einfacher Zeichenkettenvergleich und ausdrücklich
 * KEIN `localeCompare`: gebraucht wird hier keine Lesereihenfolge, sondern
 * Stabilität — zwei Notizen desselben Tages sollen in jedem Lauf und auf jeder
 * Maschine gleich stehen. `slug` und nicht `titel`, weil `slug` eindeutig ist
 * (`register.test.ts`) und ein Titel es nicht sein muss.
 */
export function sortiereNotizen(notizen: readonly Releasenotiz[]): Releasenotiz[] {
  return [...notizen].sort((a, b) => {
    if (a.datum !== b.datum) return a.datum < b.datum ? 1 : -1;
    if (a.slug === b.slug) return 0;
    return a.slug < b.slug ? -1 : 1;
  });
}

/** Alle Notizen, neueste zuerst — ungefiltert. Wer filtert, ist `auswahl.ts`. */
export const ALLE_NOTIZEN: readonly Releasenotiz[] = sortiereNotizen(NOTIZEN);
