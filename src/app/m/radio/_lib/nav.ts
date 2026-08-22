// src/app/m/radio/_lib/nav.ts
import type { SuiteNavItem } from "@/core/shell/types";

/**
 * DIE MODULNAVIGATION DER VERWALTUNG (Spec:732-733).
 *
 * Dieser Wert wird von einer Server Component gelesen und liegt deshalb bewusst in
 * `_lib/` OHNE "use client" (Falle 6). Die hrefs tragen die AEUSSERE Pfadform, damit
 * `aktiverEintrag` sie sowohl gegen aeussere als auch gegen umgeschriebene Pfade per
 * Suffix aufloesen kann (Vorbild `lagerbuch/_lib/nav.ts:1-20`).
 *
 * ⛔ HEUTE LEER, UND DAS IST DIE RICHTIGE FORM — kein Platzhalter, keine Vorwegnahme.
 * Planteil 2 baut keine einzige Verwaltungsseite; jeder Eintrag hier fuehrte auf 404.
 * `qr/layout.tsx:16-18` schreibt die Regel aus: „Ein Eintrag, der auf 404 fuehrt, ist
 * schlimmer als kein Eintrag."
 *
 * ⬜ PLANTEIL 4 FUELLT SIE mit den SIEBEN Eintraegen aus Spec:4199-4203: Uebersicht ·
 * Geraete · Ausleihen · Update-Modus · Import · Softwareversionen · Zugaenge — DREI davon
 * (Import, Softwareversionen, Zugaenge) nur fuer die ADMIN-Stufe sichtbar (§5.5).
 *
 * ⛔ NICHT die zehn Seitenpfade aus §1.2.2. Die Routenkarte ist die Liste der SEITEN,
 * nicht die der Menuepunkte, und drei der zehn gehoeren nicht in ein Menue:
 * `/admin/geraete/<id>` und `/admin/geraete/<id>/ereignisse` haben keine feste ID, und
 * `/admin/zugaenge/blatt` ist das DRUCKBLATT — ein Menuepunkt darauf schoebe ein Blatt
 * mit Zugangscodes im Klartext in die Navigationsleiste (Spec:316-324).
 * ⚠️ `/admin/einstellungen` steht ebenfalls nicht darunter — entfaellt mit B9 (Spec:98,
 * Kapiteltext Spec:326-331).
 *
 * ⛔ UND DIE FORM IST NICHT ENDGUELTIG. Spec:4289 und Spec:4203-4210 verlangen
 * `radioNav(stufe: RadioRolle)` — eine FUNKTION mit der Rechtestufe als Parameter, keine
 * feste Liste: „Ohne diesen Parameter sieht eine Person der Updater-Stufe drei
 * Menuepunkte, die sie in ein `notFound()` fuehren." Die Konstantenform hier ist der
 * Zustand von Planteil 2, weil `RadioRolle` erst mit `_lib/rollen.ts` entsteht
 * (Spec:4420-4422, Planteil 4) und eine Signatur auf einen Typ, den es nicht gibt, nicht
 * typprueft. ⬜ PLANTEIL 4 STELLT DATEI UND AUFRUFSTELLE UM — die Datei auf
 * `radioNav(stufe)` UND die `nav`-Weitergabe in `admin/(arbeit)/layout.tsx`. Der
 * Bestand belegt die Notwendigkeit: `/einstellungen` traegt dort schon heute
 * `adminOnly: true` (radio-admin/client/src/layout/AppLayout.tsx:36).
 *
 * `abschnitt:` DARF vergeben werden, weil `shell: "full"` gilt (Spec:732-733);
 * `core/shell/navAbschnitte.test.ts:56-70` verbietet es nur fuer `minimal`- und
 * `kiosk`-Module.
 *
 * ⚠️ ES GIBT HIER KEINEN TEST, DER hrefs GEGEN DIE ROUTENKARTE KOPPELT. Ueber einer
 * leeren Liste waere er leer-gruen — dieselbe Fehlerklasse, gegen die `riegel.test.ts`
 * seine Untergrenzen setzt. Er gehoert zu Planteil 4, MIT den Eintraegen.
 */
export const RADIO_NAV: SuiteNavItem[] = [];
