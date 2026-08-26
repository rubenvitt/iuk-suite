// src/app/m/radio/admin/(arbeit)/zugaenge/page.tsx
import { Alert } from "antd";
import { getDb } from "../../../_db/client";
import { codesListe } from "../../../_lib/lesepfade/codes";
import { requireRadioAdmin } from "../../../_lib/zugang";
import s from "../../../_ui/verwaltung.module.css";
import { CodeTabelle } from "./CodeTabelle";

/**
 * DIE ZUGANGSVERWALTUNG — der aeussere Pfad `/admin/zugaenge` (Spec §5.13; Routenkarte
 * `_lib/routen.ts:64`, Navigation `_lib/nav.ts:81`).
 *
 * ⛔ DER PFAD HEISST `zugaenge`, NICHT `codes` — B9 (`Spec:98`): „Kapitel 1 §1.2.2 ist die
 * Routenkarte und gewinnt bei den Pfadnamen." §5.6.1s Insel-Tabelle (`Spec:4510`) und §5.13
 * (`Spec:4860`) tragen den alten Namen und sind an dieser Stelle ueberholt
 * (`.superpowers/sdd/planteil4/E1-spec-kapitel5.md:434-440`).
 *
 * ⛔ **ERSTE ANWEISUNG: `await requireRadioAdmin()` (`Spec:4377`) — NICHT
 * `requireRadioVerwaltung()`.** Der fachliche Grund steht ausgeschrieben (`Spec:4456-4459`):
 * „die Updater-Stufe erreicht die Code-Verwaltung **nicht**. Jede codebezogene Seite/Action
 * ruft `requireRadioAdmin()`, **nicht** `requireRadioVerwaltung()`, weil Ausstellen/Sperren
 * laut Betreiberantwort 6 allein den radio-admins gehoeren." ⛔ UND DIE LISTE SELBST IST DAS
 * GEHEIMNIS (`Spec:2249-2250`): sie zeigt jeden Zugangscode im Klartext.
 *
 * ⛔ **UND HIER STEHT DIE LUECKE, DIE KEIN SCAN SCHLIESST.** `riegel.test.ts` laesst im
 * `(arbeit)`-Zweig `requireRadioAdmin(` **oder** `requireRadioVerwaltung(` zu, und zwar
 * ABSICHTLICH (`riegel.test.ts:225-251`, Auswertung `:253-262`) — ohne das ODER waere die
 * Klausel gegen `Spec:4367` rot-by-construction. Ein pfadsensitiver Scan kann innerhalb
 * DERSELBEN Route-Group „richtig auf der Verwaltungsstufe" nicht von „faelschlich von der
 * Admin-Stufe abgesenkt" unterscheiden. ⛔ Der einzige Waechter dieser Zeile ist der
 * namentliche Fall in `admin/actions.test.ts` („V20: admin/(arbeit)/zugaenge/page.tsx nennt
 * requireRadioAdmin und NICHT requireRadioVerwaltung"), und er prueft BEIDE Haelften ueber dem
 * LITERALEN Pfad.
 *
 * ⛔ **DER KLARTEXT UEBERQUERT DIE PROPS-GRENZE — UND DAS IST DER GROESSTE TRAEGER, NICHT DIE
 * PROTOKOLLZEILE** (Vorabscan-Fund **F23**,
 * `.superpowers/sdd/planteil4/VORABSCAN.md:542-556`): `{ zeilen: CodeZeile[] }` wird als
 * RSC-Nutzlast serialisiert und steht im ausgelieferten HTML JEDER Antwort dieser Route.
 * ⛔ DIE ADMIN-STUFE DIESER SEITE IST DESHALB IHR RIEGEL, NICHT IHRE KUER. Der Auftragsbrief
 * verlangt zusaetzlich, dass der Code „in keiner Protokollzeile und keiner Fehlermeldung"
 * landet (`.superpowers/sdd/planteil4/briefs/V20.md:29`) — das haelt die Insel, indem sie
 * jede gefangene Ausnahme ungelesen verwirft (`CodeTabelle.tsx`, die zwei `catch`-Zweige).
 *
 * ⛔ KEIN `requireRadioHost(` DANEBEN: `Spec:4369-4378` gibt jeder der zehn Seiten GENAU EINE
 * erste Anweisung; den Host haelt das Group-Layout (`admin/(arbeit)/layout.tsx`) und
 * zusaetzlich der werfende Riegel selbst (`_lib/zugang.ts`, `riegelAufStufe`).
 * Bauform-Zulaessigkeitstafel Nr. 13.
 *
 * ⛔ KEIN `force-dynamic` — und das ist eine Auslassung mit Grund, keine Vergesslichkeit:
 * `Spec:4644-4645` verlangt es fuer Seiten, die SUCHPARAMETER oder ein dynamisches Segment
 * lesen. Diese Seite liest weder das eine noch das andere — dieselbe Lage und dieselbe
 * Entscheidung wie bei der Uebersicht (`admin/(arbeit)/page.tsx`), beim Import
 * (`import/page.tsx:45-49`) und bei den Versionen (`versionen/page.tsx`).
 * ⚠️ FRISCH BLEIBT DIE LISTE HIER NICHT UEBER `revalidatePath` — die zwei Aktionen aus
 * Planteil 3 rufen keines (`/usr/bin/grep -n revalidatePath
 * src/app/m/radio/_actions/codes.ts` → nichts, gemessen 2026-08-26). ⛔ DIE INSEL LAEDT SELBST
 * NACH (`router.refresh()`), und das wirkt, weil `requireRadioAdmin()` `headers()` liest
 * (`_lib/zugang.ts:459-461`) und die Route damit dynamisch ist.
 *
 * ⛔ EINE DATEI AN DER GRENZE, UND SIE IST CLIENT: `CodeTabelle.tsx` wegen Falle 9 (fuenf
 * `render`) und wegen ihres Zustands. Diese Datei reicht ausschliesslich VORFORMATIERTE,
 * serialisierbare Werte hinueber — keine Funktion, kein `Date` (`Spec:4536-4539`); die zwei
 * Aktionen importiert die Insel DIREKT (Bauform-Zulaessigkeitstafel Nr. 6).
 *
 * ⛔ `<h1 className={s.titel}>` UND NICHT `Typography.Title`: ein Compound-Zugriff in einer
 * Server Component ist HTTP 500 (Falle 1, `CLAUDE.md`). `Alert` ist dagegen ein gewoehnliches
 * Bauteil und in einer Server Component sicher — Hausvorbild
 * `lagerbuch/verwaltung/(arbeit)/checks/[id]/page.tsx:121`.
 */

/**
 * DIE BILDSCHIRMTEXTE DIESER SEITE, in EINER benannten Liste und nicht inline verstreut
 * (Global Constraint, `.superpowers/sdd/planteil4/briefs/KOPF.md:1340`). ⚠️ Sie tragen ihre
 * Umlaute — es sind Bildschirmtexte, keine Bezeichner.
 *
 * ⚠️ DIE TEXTE DER INSEL STEHEN NICHT HIER: sie leben in `CODE_TEXTE` (`CodeTabelle.tsx`).
 * ⛔ KEIN SATZ STEHT ZWEIMAL; jeder hat genau einen Ort. ⚠️ Auch nicht der Titel: die
 * Ueberschrift der SEITE heisst „Zugänge" (wie der Menuepunkt, `_lib/nav.ts:81`), der
 * zugaengliche Name der TABELLE „Ausgestellte Zugänge" — zwei Rollen, zwei Woerter.
 *
 * ⚠️ KEINER DIESER SAETZE STAMMT AUS DER 1:1-TAFEL ABSCHNITT E
 * (`.superpowers/sdd/planteil4/briefs/KOPF.md:1322-1339`): sie fuehrt dreizehn Zeilen, KEINE
 * aus einer Codeverwaltung — es gibt im Alt-Bestand keine (die Messung steht im Kopf von
 * `_lib/lesepfade/codes.ts`). ⛔ Deshalb traegt hier kein Satz eine Alt-Belegzeile; eine
 * erfundene waere genau die Klasse, gegen die die eiserne Regel steht.
 */
const SEITEN_TEXTE = {
  titel: "Zugänge",
  /**
   * ⛔ ER ERKLAERT DEN FEHLENDEN LOESCHKNOPF, und das ist seine ganze Aufgabe. Ohne ihn sucht
   * eine bedienende Person nach einer Loeschung, die es absichtlich nicht gibt (NS-A6,
   * `_actions/codes.ts:20-52`), und haelt die Flaeche fuer unfertig. Der zweite Satz nennt die
   * Wirkung der Sperre, weil sie sonst wie ein Anzeigezustand aussieht (`Spec:2229-2232`: sie
   * wirkt binnen des naechsten Aufrufs, lesend wie schreibend).
   */
  hinweis:
    "Ein Zugang wird nie gelöscht — sperren ist der einzige Widerruf, und die gesperrte Zeile bleibt mit Zeitpunkt und Person stehen. Eine Sperre wirkt beim nächsten Aufruf des Codes, auch mitten in einer laufenden Sitzung.",
} as const;

export default async function RadioZugaengeSeite() {
  await requireRadioAdmin();

  const zeilen = codesListe(getDb());

  return (
    <>
      <h1 className={s.titel}>{SEITEN_TEXTE.titel}</h1>
      {/*
        ⛔ `type="info"`, kein Rotton auf einer Datenflaeche (Falle 3):
        `colorError === colorPrimary` (`src/core/theme/theme.ts:32-33`).

        ⛔ `title=` UND NICHT `message=`: unter antd 6 ist `message` ABGEKUENDIGT
        (`node_modules/…/antd/es/alert/Alert.d.ts:50-52`, „@deprecated please use `title`
        instead"); dieselbe Form wie in `versionen/page.tsx`.

        ⛔ DER TEXT TRAEGT EINEN EIGENEN GRIFF. Ohne ihn muesste ein Playwright-Fall auf eine
        antd-INTERNE Klasse greifen — die Art Griff, die bei einem Bauteil-Umbau still
        danebengeht.
      */}
      <Alert
        type="info"
        showIcon
        title={<span data-rolle="radio-zugaenge-hinweis">{SEITEN_TEXTE.hinweis}</span>}
        className={s.abstand}
      />
      {/*
        ⬜ DIE STELLE FUER DEN LINK AUF DAS DRUCKBLATT — sie bleibt in V20 FREI und wird von
        **V21** gefuellt, zusammen mit `admin/(druck)/zugaenge/blatt/page.tsx`
        (`.superpowers/sdd/planteil4/briefs/V20.md:45-47`; dieselbe Regel wie bei V14/V15).
        ⛔ EIN LINK AUF EINE 404 IST SCHLIMMER ALS KEIN LINK: die Zielseite gibt es heute
        nicht, `riegel.test.ts` zaehlt neun Seiten und nicht zehn. Der Waechter dieser
        Uebergabe ist der Fall „die Stelle fuer den Blatt-Link steht als benannte Leerstelle
        mit Nachfolger da" in `CodeTabelle.test.tsx`.
      */}
      <CodeTabelle zeilen={zeilen} />
    </>
  );
}
