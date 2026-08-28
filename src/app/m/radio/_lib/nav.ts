// src/app/m/radio/_lib/nav.ts
import type { SuiteNavItem } from "@/core/shell/types";
import type { RadioRolle } from "./rollen";

/**
 * DIE MODULNAVIGATION DER VERWALTUNG (Spec:732-733, Spec:4199-4210).
 *
 * Dieser Wert wird von einer Server Component gelesen und liegt deshalb bewusst in
 * `_lib/` OHNE "use client" (Falle 6). Die hrefs tragen die AEUSSERE Pfadform, damit
 * `aktiverEintrag` sie sowohl gegen aeussere als auch gegen umgeschriebene Pfade per
 * Suffix aufloesen kann (Vorbild `lagerbuch/_lib/nav.ts:1-20`).
 *
 * ⛔ EINE FUNKTION UND KEINE KONSTANTE, und der Parameter ist die Rechtestufe
 * (Spec:4203-4210, Spec:4289): „Ohne diesen Parameter sieht eine Person der Updater-Stufe
 * drei Menuepunkte, die sie in ein `notFound()` fuehren." Der Bestand belegt die Form —
 * `/einstellungen` traegt dort schon heute `adminOnly: true`
 * (radio-admin/client/src/layout/AppLayout.tsx:36).
 *
 * ⛔ NICHT DIE ZEHN SEITENPFADE AUS §1.2.2. Die Routenkarte (`_lib/routen.ts`,
 * `VERWALTUNGS_PFADE`) ist die Liste der SEITEN, nicht die der Menuepunkte, und drei der
 * zehn gehoeren nicht in ein Menue: `/admin/geraete/<id>` und
 * `/admin/geraete/<id>/ereignisse` haben keine feste ID, und `/admin/zugaenge/blatt` ist
 * das DRUCKBLATT — ein Menuepunkt darauf schoebe ein Blatt mit Zugangscodes im Klartext in
 * die Navigationsleiste (Spec:316-324).
 * ⚠️ `/admin/einstellungen` steht ebenfalls nicht darunter — entfaellt mit B9 (Spec:98,
 * Kapiteltext Spec:326-331), an seiner Stelle steht `/admin/versionen`.
 *
 * ⛔ KEIN `abschnitt:` AN DIESEN SIEBEN. Erlaubt waere es (`shell: "full"`,
 * `core/shell/navAbschnitte.test.ts:56-70` verbietet es nur fuer `minimal`- und
 * `kiosk`-Module), und `lagerbuch` vergibt es — dort aber gegen fuenfzehn gleichrangige
 * Eintraege, die in der zweiten Kopfzeile umbrachen (`lagerbuch/_lib/nav.ts:12-16`).
 * Sieben brechen nicht um; eine Ueberschrift ueber zwei Eintraegen waere Gliederung ohne
 * Anlass. Spec:4199-4202 fuehrt die sieben als EINE Reihe.
 *
 * DER KOPPLUNGSFALL STEHT SEIT DIESER AUFGABE: `_lib/nav.test.ts` haelt fest, dass jeder
 * `href` auf eine Route der Karte zeigt, dass keiner die innere Form `/m/radio` traegt und
 * dass kein fuer die Updater-Stufe sichtbarer Eintrag auf eine Seite der Admin-Stufe
 * fuehrt. Ueber einer LEEREN Liste waeren alle drei leer-gruen — deshalb stehen die
 * Fallzahlen `toBe(7)` und `toBe(4)` dort als eigene Faelle daneben.
 */

/**
 * Die Schluessel der drei Eintraege, die NUR die Admin-Stufe sieht: Import,
 * Softwareversionen und Zugaenge (Spec:4202-4203, §5.5).
 *
 * ⛔ EINE FILTERLISTE UND KEINE ZWEITE EINTRAGSLISTE. Zwei Literale — eines je Stufe —
 * waeren zwei Abschriften derselben Navigation, und die Korrektur kaeme irgendwann nur an
 * einer von beiden an; derselbe Gedanke steht in `admin/(druck)/layout.tsx:16-20`
 * („dieselben Funktionen, nicht zwei Abschriften").
 */
const NUR_ADMIN: readonly string[] = ["import", "versionen", "zugaenge"];

/**
 * Die sieben Eintraege in ihrer Reihenfolge (Spec:4199-4202): Uebersicht · Geraete ·
 * Ausleihen · Update-Modus · Import · Softwareversionen · Zugaenge.
 *
 * ⛔ NICHT EXPORTIERT: der Weg nach draussen ist `radioNav(stufe)`, sonst umginge ein
 * Aufrufer die Stufenfilterung, ohne dass ein Tor rot wird.
 */
const EINTRAEGE: SuiteNavItem[] = [
  { key: "uebersicht", title: "Übersicht", href: "/admin", ikon: "uebersicht" },
  { key: "geraete", title: "Geräte", href: "/admin/geraete", ikon: "geraete" },
  { key: "ausleihen", title: "Ausleihen", href: "/admin/ausleihen", ikon: "ausleihen" },
  // ⚠️ Titel und Pfad gehen hier AUSEINANDER, und beides ist so gewollt: die Flaeche heisst
  // auf dem Bildschirm „Update-Modus" (Spec:4201), ihr Pfad ist `/admin/software`
  // (Kapitel 1 §1.2.2, B9 — `Spec:98`). Wer den Pfad an den Titel angleicht, bricht den
  // Kopplungsfall gegen `_lib/routen.ts`.
  { key: "software", title: "Update-Modus", href: "/admin/software", ikon: "update" },
  // ⛔ NUR FUER DIE ADMIN-STUFE — und seit dem 2026-08-24 gilt das fuer die SEITE ebenso.
  // Die Ausblendung in der Navigation folgt Spec:4202-4203; dass `/admin/import` auch
  // dahinter die Admin-Stufe verlangt, ist die Betreiberentscheidung zu ⬜ V-L5
  // (`.superpowers/sdd/planteil4/progress.md`, Abschnitt „V-L5": „Nur Admin, nicht
  // Updater"). ⚠️ Sie ueberholt `Spec:4375` (dort noch `requireRadioVerwaltung()`) und
  // die Entscheidung E-V4 des Plans: bis dahin war der Eintrag ausgeblendet, die Seite
  // aber offen — dieser Widerspruch besteht nicht mehr. `import/page.tsx` entsteht in V18
  // und traegt `requireRadioAdmin()`.
  { key: "import", title: "Import", href: "/admin/import", ikon: "import" },
  // Nur Admin (Spec:4202-4203); die Seite traegt `requireRadioAdmin()` (Spec:4376), V19.
  { key: "versionen", title: "Softwareversionen", href: "/admin/versionen", ikon: "versionen" },
  // Nur Admin (Spec:4202-4203); die Seite traegt `requireRadioAdmin()` (Spec:4377), V20.
  { key: "zugaenge", title: "Zugänge", href: "/admin/zugaenge", ikon: "tokens" },
];

/**
 * Die Navigation fuer eine Rechtestufe.
 *
 * ⛔ GIBT EINE FLACHE KOPIE ZURUECK, NICHT `EINTRAEGE` SELBST: der Aufrufer reicht das
 * Ergebnis als Prop weiter, und eine zurueckgegebene Referenz liesse jede spaetere
 * Aenderung daran in den Modulzustand zurueckschreiben. Dieselbe Begruendung wie bei
 * `filterSchreibbareFelder` in `_lib/rollen.ts`.
 */
export function radioNav(stufe: RadioRolle): SuiteNavItem[] {
  if (stufe === "admin") return [...EINTRAEGE];
  return EINTRAEGE.filter((eintrag) => !NUR_ADMIN.includes(eintrag.key));
}
