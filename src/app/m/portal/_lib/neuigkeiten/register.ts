import ereignisseNachvollziehen from "./notizen/portal/2026-09-06-ereignisse-nachvollziehen";
import zeichenVoruebergehendPausiert from "./notizen/portal/2026-09-07-zeichen-voruebergehend-pausiert";
import versionsnummerImProfil from "./notizen/portal/2026-09-08-versionsnummer-im-profil";
import type { Releasenotiz } from "@/app/m/portal/_lib/neuigkeiten/typen";

import anleitungJeAnsicht from "@/app/m/portal/_lib/neuigkeiten/notizen/aufgaben/2026-08-16-anleitung-je-ansicht";
import verteilenZweiAnsichten from "@/app/m/portal/_lib/neuigkeiten/notizen/aufgaben/2026-08-16-verteilen-zwei-ansichten";
import checklisteAlsPdf from "@/app/m/portal/_lib/neuigkeiten/notizen/lagerbuch/2026-08-16-checkliste-als-pdf";
import mitCodeEinsteigen from "@/app/m/portal/_lib/neuigkeiten/notizen/lagerbuch/2026-09-13-mit-code-einsteigen";
import bestandNullAusblenden from "@/app/m/portal/_lib/neuigkeiten/notizen/lagerbuch/2026-09-13-bestand-null-ausblenden";
import checklisteVerfallLeer from "@/app/m/portal/_lib/neuigkeiten/notizen/lagerbuch/2026-09-14-checkliste-verfall-leer";
import kategorienAusblenden from "@/app/m/portal/_lib/neuigkeiten/notizen/lagerbuch/2026-09-14-kategorien-ausblenden";
import inventurJeCharge from "@/app/m/portal/_lib/neuigkeiten/notizen/lagerbuch/2026-09-14-inventur-je-charge";
import mehrereArtikelBearbeiten from "@/app/m/portal/_lib/neuigkeiten/notizen/lagerbuch/2026-09-14-mehrere-artikel-bearbeiten";
import journalNachladen from "@/app/m/portal/_lib/neuigkeiten/notizen/lagerbuch/2026-09-14-journal-nachladen";
import schraenke from "@/app/m/portal/_lib/neuigkeiten/notizen/lagerbuch/2026-09-15-schraenke";
import inventurJeSchrank from "@/app/m/portal/_lib/neuigkeiten/notizen/lagerbuch/2026-09-15-inventur-je-schrank";
import aussondernAmFahrzeug from "@/app/m/portal/_lib/neuigkeiten/notizen/lagerbuch/2026-09-15-aussondern-am-fahrzeug";
import abgelaufenesJeFahrzeug from "@/app/m/portal/_lib/neuigkeiten/notizen/lagerbuch/2026-09-15-abgelaufenes-je-fahrzeug";
import checkNurFuerDeinFahrzeug from "@/app/m/portal/_lib/neuigkeiten/notizen/lagerbuch/2026-09-15-check-nur-fuer-dein-fahrzeug";
import entnahmeAufsFahrzeug from "@/app/m/portal/_lib/neuigkeiten/notizen/lagerbuch/2026-09-15-entnahme-aufs-fahrzeug";
import letzterCheckUndVerfallLoeschen from "@/app/m/portal/_lib/neuigkeiten/notizen/lagerbuch/2026-09-15-letzter-check-und-verfall-loeschen";
import mengenSelbstZaehlen from "@/app/m/portal/_lib/neuigkeiten/notizen/lagerbuch/2026-09-15-mengen-selbst-zaehlen";
import aussonderungUndInventurImJournal from "@/app/m/portal/_lib/neuigkeiten/notizen/lagerbuch/2026-09-15-aussonderung-und-inventur-im-journal";
import sauerstoffWechselhinweis from "@/app/m/portal/_lib/neuigkeiten/notizen/lagerbuch/2026-09-15-sauerstoff-wechselhinweis";
import umlagernImHandlager from "@/app/m/portal/_lib/neuigkeiten/notizen/lagerbuch/2026-09-15-umlagern-im-handlager";
import neuerNameSammelhaus from "@/app/m/portal/_lib/neuigkeiten/notizen/portal/2026-08-16-neuer-name-sammelhaus";
import lesbaresRotImDunkelmodus from "@/app/m/portal/_lib/neuigkeiten/notizen/portal/2026-08-28-lesbares-rot-im-dunkelmodus";
import neuerNameIda from "@/app/m/portal/_lib/neuigkeiten/notizen/portal/2026-09-04-neuer-name-ida";
import tabellenSortierenFiltern from "@/app/m/portal/_lib/neuigkeiten/notizen/portal/2026-09-14-tabellen-sortieren-filtern";
import vonAllenGeraetenAbmelden from "@/app/m/portal/_lib/neuigkeiten/notizen/portal/2026-08-14-von-allen-geraeten-abmelden";
import alteQrCodesGeltenWeiter from "@/app/m/portal/_lib/neuigkeiten/notizen/radio/2026-08-28-alte-qr-codes-gelten-weiter";
import funkInDerSuite from "@/app/m/portal/_lib/neuigkeiten/notizen/radio/2026-08-28-funk-in-der-suite";
import drohnentrainingInDerSuite from "@/app/m/portal/_lib/neuigkeiten/notizen/uav/2026-08-29-drohnentraining-in-der-suite";
import fortschrittZaehltDurchfuehrungen from "@/app/m/portal/_lib/neuigkeiten/notizen/uav/2026-08-29-fortschritt-zaehlt-durchfuehrungen";
import katalogOhneCodeAnsehen from "@/app/m/portal/_lib/neuigkeiten/notizen/uav/2026-08-29-katalog-ohne-code-ansehen";
import trainingsansichtOhneSuiteLeiste from "@/app/m/portal/_lib/neuigkeiten/notizen/uav/2026-08-29-trainingsansicht-ohne-suite-leiste";
import eigeneZeichenBauen from "@/app/m/portal/_lib/neuigkeiten/notizen/zeichen/2026-09-02-eigene-zeichen-bauen";
import zeichenNachschlagen from "@/app/m/portal/_lib/neuigkeiten/notizen/zeichen/2026-09-02-taktische-zeichen-nachschlagen";
import zeichenUeben from "@/app/m/portal/_lib/neuigkeiten/notizen/zeichen/2026-09-03-zeichen-ueben";
import zeichenOhneNetz from "@/app/m/portal/_lib/neuigkeiten/notizen/zeichen/2026-09-03-zeichen-ohne-netz";

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
  mitCodeEinsteigen,
  bestandNullAusblenden,
  checklisteVerfallLeer,
  kategorienAusblenden,
  inventurJeCharge,
  mehrereArtikelBearbeiten,
  journalNachladen,
  schraenke,
  inventurJeSchrank,
  aussondernAmFahrzeug,
  abgelaufenesJeFahrzeug,
  checkNurFuerDeinFahrzeug,
  entnahmeAufsFahrzeug,
  letzterCheckUndVerfallLoeschen,
  mengenSelbstZaehlen,
  aussonderungUndInventurImJournal,
  sauerstoffWechselhinweis,
  umlagernImHandlager,
  neuerNameSammelhaus,
  vonAllenGeraetenAbmelden,
  lesbaresRotImDunkelmodus,
  neuerNameIda,
  ereignisseNachvollziehen,
  zeichenVoruebergehendPausiert,
  versionsnummerImProfil,
  tabellenSortierenFiltern,
  funkInDerSuite,
  alteQrCodesGeltenWeiter,
  drohnentrainingInDerSuite,
  katalogOhneCodeAnsehen,
  trainingsansichtOhneSuiteLeiste,
  fortschrittZaehltDurchfuehrungen,
  zeichenNachschlagen,
  eigeneZeichenBauen,
  zeichenUeben,
  zeichenOhneNetz,
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
