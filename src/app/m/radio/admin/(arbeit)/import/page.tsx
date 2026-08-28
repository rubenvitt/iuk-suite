// src/app/m/radio/admin/(arbeit)/import/page.tsx
import { requireRadioAdmin } from "../../../_lib/zugang";
import s from "../../../_ui/verwaltung.module.css";
import { ImportAssistent } from "./ImportAssistent";

/**
 * DER CSV-IMPORT — der aeussere Pfad `/admin/import` (Spec §5.7, `Spec:4695-4710`;
 * Routenkarte `_lib/routen.ts`, Navigation `_lib/nav.ts:77`).
 *
 * ⛔ ERSTE ANWEISUNG: `await requireRadioAdmin()` — die ADMIN-Stufe, nicht die
 * Verwaltungsstufe. ⚠️ DAS UEBERHOLT `Spec:4375` UND DIE ENTSCHEIDUNG E-V4 DES PLANS, die
 * beide `requireRadioVerwaltung()` vorsahen. Massgeblich ist die Betreiberentscheidung zu
 * ⬜ **V-L5** vom 2026-08-24 (`.superpowers/sdd/planteil4/progress.md`, Abschnitt „V-L5":
 * „**Nur Admin**, nicht Updater"), Begruendung dort woertlich: „ein CSV-Import schreibt viele
 * Datensaetze auf einmal und ist schwer rueckgaengig zu machen."
 *
 * ⛔ DIE SPEC WIDERSPRICHT SICH AN DIESER STELLE SELBST, und alle drei Stellen gehoeren
 * genannt, statt die bequemste zu zitieren:
 *
 *   `Spec:4207-4208`  §5.5 — der Menuepunkt „Import" ist fuer die Updater-Stufe ausgeblendet
 *   `Spec:4375`       §5.4 — die als „verbindlich" bezeichnete Aufruftabelle setzt die Seite
 *                            auf `await requireRadioVerwaltung()`
 *   `Spec:4451`       §5.9 — die Rechtetafel: „CSV-Import | ja | **nein**"
 *
 * Zwei von drei sagen „nur Admin"; die Betreiberentscheidung folgt ihnen und entscheidet den
 * Widerspruch. ⛔ DER `Result`-ZWEIG FUER `rolle === "updater"`, den `briefs/V18.md:60-63`
 * verlangt, ENTFAELLT DAMIT ERSATZLOS: mit der Admin-Stufe endet jede Updater-Person schon
 * im Riegel (`notFound()`), der Block waere von Geburt an toter Code und truege einen Satz,
 * den kein Abruf je erreicht (Vorabscan-Fund **F1**, Vorschlag Punkt 2,
 * `.superpowers/sdd/planteil4/VORABSCAN.md`). Ein Test darauf haette eine Zusage geprueft,
 * welche die Bauform nicht halten kann.
 *
 * ⛔ UND DIESE ZEILE HAT KEINEN SCAN UEBER SICH. `riegel.test.ts` laesst im `(arbeit)`-Zweig
 * `requireRadioAdmin(` ODER `requireRadioVerwaltung(` zu, und zwar absichtlich
 * (`riegel.test.ts:253-262`) — sonst waere die Klausel gegen `Spec:4367` rot-by-construction.
 * Eine faelschlich ABGESENKTE Seite faengt sie damit strukturell nicht. Der einzige Waechter
 * ist die namentliche Zusicherung in `admin/actions.test.ts`
 * („V18: admin/(arbeit)/import/page.tsx nennt requireRadioAdmin und NICHT
 * requireRadioVerwaltung (V-L5)").
 *
 * ⛔ KEIN `requireRadioHost(` DANEBEN: `Spec:4369-4378` gibt jeder der zehn Seiten GENAU EINE
 * erste Anweisung; den Host haelt das Group-Layout (`admin/(arbeit)/layout.tsx`) und
 * zusaetzlich der werfende Riegel selbst (`_lib/zugang.ts`, `riegelAufStufe`).
 *
 * ⛔ KEIN `force-dynamic` — und das ist eine Auslassung mit Grund, keine Vergesslichkeit:
 * `Spec:4644-4645` verlangt es fuer Seiten, die SUCHPARAMETER lesen (sonst fallen sie in
 * Nexts statischen Zweig und zeigen den Stand des Bauzeitpunkts). Diese Seite liest keinen
 * Parameter und keine Zeile aus der Datenbank; ihr ganzer Inhalt entsteht in der Insel, und
 * `requireRadioAdmin()` liest ohnehin `headers()` und die Sitzung.
 *
 * ⛔ EINE INSEL, EINE GRENZE — und sie ist hier so schmal wie in keiner anderen Aufgabe:
 * `ImportAssistent` bekommt KEINE Props (`Spec:4506`). Der Assistent haelt Schritt, Zuordnung
 * und Vorschau selbst, holt die Datei ueber den Hochladen-Handler und ruft
 * `importSchreibenAction` DIREKT (Bauform-Zulaessigkeitstafel Nr. 6). Es gibt damit nichts,
 * was diese Datei hinueberreichen koennte — und genau deshalb steht die Grenze hier.
 *
 * ⛔ `<h1 className={s.titel}>` UND NICHT `Typography.Title` (`ImportPage.tsx:7`): ein
 * Compound-Zugriff in einer Server Component ist HTTP 500 (Falle 1, `CLAUDE.md`). Der Text
 * „CSV-Import" wandert woertlich mit.
 */
export default async function RadioImportSeite() {
  await requireRadioAdmin();

  return (
    <>
      <h1 className={s.titel}>CSV-Import</h1>
      <ImportAssistent />
    </>
  );
}
