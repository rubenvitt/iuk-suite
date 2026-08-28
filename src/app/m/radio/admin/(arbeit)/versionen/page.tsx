// src/app/m/radio/admin/(arbeit)/versionen/page.tsx
import { Alert } from "antd";
import { getDb } from "../../../_db/client";
import { versionenMitGeraetezahl } from "../../../_lib/lesepfade/versionen";
import { requireRadioAdmin } from "../../../_lib/zugang";
import s from "../../../_ui/verwaltung.module.css";
import { NeuVersion } from "./NeuVersion";
import { VersionenTabelle } from "./VersionenTabelle";

/**
 * DIE SOFTWAREVERSIONEN DER VERWALTUNG — der aeussere Pfad `/admin/versionen`
 * (Spec §5.12; Routenkarte `_lib/routen.ts:63`, Navigation `_lib/nav.ts:79`). ⚠️ Der Pfad
 * heisst `versionen` und NICHT `einstellungen`: B9 (`Spec:98`) gibt Kapitel 5 an dieser
 * Stelle den Vorrang, und der Tab „API-Zugriff" des Bestands (`SettingsPage.tsx:11`) faellt
 * mit Entscheidung 13 ganz weg.
 *
 * ⛔ **ERSTE ANWEISUNG: `await requireRadioAdmin()` (`Spec:4376`) — NICHT
 * `requireRadioVerwaltung()`.** Die Rechtetafel fuehrt „Softwareversionen anlegen / Ziel
 * setzen / loeschen / sortieren | ja | **nein**" (`Spec:4444-4454`): die Zielversion
 * bestimmt, welches Geraet als „aktuell" gilt (`_db/schema.ts:84-92`) — wer sie verstellt,
 * verstellt den Update-Stand des ganzen Bestands auf einmal. Diese Seite ist damit die ERSTE
 * der Verwaltung auf der ADMIN-Stufe.
 *
 * ⛔ **UND HIER STEHT DIE LUECKE, DIE KEIN SCAN SCHLIESST.** `riegel.test.ts` laesst im
 * `(arbeit)`-Zweig `requireRadioAdmin(` **oder** `requireRadioVerwaltung(` zu, und zwar
 * ABSICHTLICH (`riegel.test.ts:237-244`) — ohne das ODER waere die Klausel gegen `Spec:4367`
 * rot-by-construction, sobald das Group-Layout auf die Verwaltungs-Stufe stellt. Ein
 * pfadsensitiver Scan kann innerhalb DERSELBEN Route-Group „richtig auf der
 * Verwaltungsstufe" nicht von „faelschlich von der Admin-Stufe abgesenkt" unterscheiden.
 * ⛔ Der einzige Waechter dieser Zeile ist der namentliche Fall in `admin/actions.test.ts`
 * („V19: admin/(arbeit)/versionen/page.tsx nennt requireRadioAdmin und NICHT
 * requireRadioVerwaltung"), und er prueft BEIDE Haelften ueber dem LITERALEN Pfad.
 *
 * ⛔ KEIN `requireRadioHost(` DANEBEN: `Spec:4369-4378` gibt jeder der zehn Seiten GENAU EINE
 * erste Anweisung; den Host haelt das Group-Layout (`admin/(arbeit)/layout.tsx`) und
 * zusaetzlich der werfende Riegel selbst (`_lib/zugang.ts`, `riegelAufStufe`).
 *
 * ⛔ KEIN `force-dynamic` — und das ist eine Auslassung mit Grund, keine Vergesslichkeit:
 * `Spec:4644-4645` verlangt es fuer Seiten, die SUCHPARAMETER oder ein dynamisches Segment
 * lesen (`admin/(arbeit)/geraete/page.tsx`, `.../[id]/page.tsx`, `.../ereignisse/page.tsx`,
 * `software/page.tsx`). Diese Seite liest weder das eine noch das andere — dieselbe Lage und
 * dieselbe Entscheidung wie bei der Uebersicht (`admin/(arbeit)/page.tsx`) und beim Import
 * (`import/page.tsx:45-49`). Frisch bleibt die Liste ueber `revalidatePath(VERSIONSLISTE)`,
 * das alle vier Versions-Actions schreiben (`admin/actions.ts`).
 *
 * ⛔ ZWEI DATEIEN AN DER GRENZE, UND BEIDE SIND CLIENT: die Tabelle wegen Falle 9 (vier
 * `render`) und Falle 1 (`Space.Compact`), das Anlegefeld wegen Falle 1 und seines
 * Eingabezustands. Diese Datei reicht ausschliesslich VORFORMATIERTE, serialisierbare Werte
 * hinueber — keine Funktion, kein `Date` (`Spec:4536-4539`); die vier Actions importieren die
 * zwei Inseldateien DIREKT (Bauform-Zulaessigkeitstafel Nr. 6). ⛔ `NeuVersion` bekommt KEINE
 * Props: es gibt nichts, was der Server ihm sagen muesste.
 *
 * ⛔ `<h1 className={s.titel}>` UND NICHT `Typography.Title` (`SoftwareVersionsPage.tsx:179`):
 * ein Compound-Zugriff in einer Server Component ist HTTP 500 (Falle 1, `CLAUDE.md`).
 * `Alert` ist dagegen ein gewoehnliches Bauteil und in einer Server Component sicher —
 * Hausvorbild `lagerbuch/verwaltung/(arbeit)/checks/[id]/page.tsx:121`.
 */

/**
 * DIE BILDSCHIRMTEXTE DIESER SEITE, in EINER benannten Liste und nicht inline verstreut
 * (`Spec:4815-4832`, 1:1-Tafel Abschnitt E). ⚠️ Sie tragen ihre Umlaute und ihre
 * typografischen Anfuehrungszeichen — es sind Bildschirmtexte, keine Bezeichner.
 *
 * ⚠️ DIE TEXTE DER INSEL STEHEN NICHT HIER: sie leben in `VERSIONEN_TEXTE`
 * (`VersionenTabelle.tsx`) und `NEUVERSION_TEXTE` (`NeuVersion.tsx`) bzw. kommen als `fehler`
 * aus `admin/actions.ts:136`/`:137`. ⛔ DREI LISTEN, JE DATEI EINE, und der Grund ist zweimal
 * ein anderer: gegen die INSEL trennt die RSC-Grenze (eine gemeinsame Liste muesste in einer
 * Datei ohne Bauform-Direktive liegen — moeglich, aber eine Datei mehr, als diese Aufgabe
 * fuehrt), und INNERHALB der Insel trennt Vorabscan-Fund **F22**: `NeuVersion.tsx` teilt mit
 * `VersionenTabelle.tsx` keinen Zustand und waere nach E-V6s Kriterium eine eigene Insel; eine
 * gemeinsame Liste brauchte einen Export ohne zweiten Verbraucher (gegen REVIEW-V17, Fund F4).
 *
 * ⛔ KEIN SATZ STEHT DESHALB ZWEIMAL; jeder hat genau einen Ort. ⚠️ Die EINE benannte Ausnahme
 * ist das Wort „Softwareversionen": es steht hier als Ueberschrift der SEITE und in
 * `VERSIONEN_TEXTE.tabelleName` als zugaenglicher Name der TABELLE — zwei verschiedene Rollen,
 * und ein anderes Wort machte fuer eine Vorlesesoftware aus einer Flaeche zwei Themen.
 */
const SEITEN_TEXTE = {
  titel: "Softwareversionen",
  /** ⛔ Woertlich `SoftwareVersionsPage.tsx:185`. */
  hinweis:
    "Die als „Ziel“ markierte Version bestimmt, welche Geräte als „aktuell“ gelten. Neu angelegte Versionen werden nicht automatisch zum Ziel — die Reihenfolge dient nur der Anzeige.",
} as const;

export default async function RadioVersionenSeite() {
  await requireRadioAdmin();

  const zeilen = versionenMitGeraetezahl(getDb());

  return (
    <>
      <h1 className={s.titel}>{SEITEN_TEXTE.titel}</h1>
      {/*
        ⛔ `type="info"` UND `showIcon` 1:1 `:182-186`. Kein Rotton auf einer Datenflaeche
        (Falle 3): `colorError === colorPrimary` (`src/core/theme/theme.ts:32-33`).

        ⛔ `title=` UND NICHT `message=` (`SoftwareVersionsPage.tsx:185`): unter antd 6 ist
        `message` ABGEKUENDIGT — nachgeschlagen in
        `node_modules/…/antd/es/alert/Alert.d.ts:50-52` („@deprecated please use `title`
        instead"). Hausvorbild ist bereits die neue Form
        (`lagerbuch/verwaltung/(arbeit)/checks/[id]/page.tsx:121-126`).

        ⛔ DER TEXT TRAEGT EINEN EIGENEN GRIFF. Ohne ihn muesste der Playwright-Fall auf eine
        antd-INTERNE Klasse greifen — die einzige Stelle dieser Flaeche, die das taete, und
        genau die Art Griff, die bei einem Bauteil-Umbau still danebengeht. Dieselbe Bauform
        und derselbe Grund wie in `import/ImportAssistent.tsx` (Griff am inneren `<span>`,
        Begruendung `import/ImportAssistent.test.tsx:155-161`).
      */}
      <Alert
        type="info"
        showIcon
        title={<span data-rolle="radio-versionen-hinweis">{SEITEN_TEXTE.hinweis}</span>}
        className={s.abstand}
      />
      <NeuVersion />
      <VersionenTabelle zeilen={zeilen} />
    </>
  );
}
