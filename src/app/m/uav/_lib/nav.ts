import type { SuiteNavItem } from "@/core/shell/types";

/**
 * DIE MODULNAVIGATION DER VERWALTUNG.
 *
 * Dieser Wert wird von einer Server Component gelesen (`(admin)/layout.tsx`) und liegt
 * deshalb bewusst in `_lib/` OHNE `"use client"` — ein Wert aus einem Client-Modul kaeme
 * dort als Client-Referenz an und ergaebe HTTP 500 fuer jede Seite mit Navigation
 * (`CLAUDE.md`, Falle 6). Vorbild: `lagerbuch/_lib/nav.ts`, `radio/_lib/nav.ts`.
 *
 * DIE AEUSSERE PFADFORM (`/admin`, nicht `/m/uav/admin`): das Modul haengt unter seinem
 * eigenen Host an der Wurzel, und `aktiverEintrag` (`core/shell/SuiteNav.tsx`) loest
 * beide Formen per Pfadanfang auf.
 *
 * ZWEI ABSCHNITTE, UND DAS IST DER GANZE ANLASS FUER DAS FELD. „Training" fuehrt NICHT
 * auf eine dritte Verwaltungsflaeche, sondern aus der Verwaltung heraus in die
 * Teilnehmeransicht (`/`) — dieselbe Anwendung, die die Teilnehmer auf ihrem Telefon
 * sehen. In einer ununterschiedenen Reihe von drei Eintraegen ist das nicht ablesbar:
 * wer „Training" liest, erwartet eine weitere Einstellflaeche und landet in der
 * Trainingsansicht. Die Ueberschrift sagt es vorher.
 *
 * ⚠️ `uav` STEHT IM REGISTRY MIT `shell: "minimal"`, UND DIESER WERT IST HEUTE
 * TOT: der Teilnehmer-Zweig laeuft seit der Betreiberentscheidung vom
 * 2026-08-29 ganz ohne `<Shell>` (eigener Rahmen,
 * `_ui/teilnehmer/TeilnehmerRahmen.tsx`), und die Verwaltung setzt
 * `variant="full"` ausdruecklich (`(admin)/layout.tsx`). Diese Eintraege landen
 * also in der Seitenleiste der `FullShell` — unabhaengig vom Registry-Wert. `core/shell/navAbschnitte.test.ts` fuehrt `uav` deshalb als benannte
 * Ausnahme seiner Markierung „bislang vergibt nur ein `full`-Modul `abschnitt`" — der
 * Test ist genau dafuer da, dass dieser Fall eine bewusste Entscheidung ist und keine
 * zufaellige.
 *
 * JEDER EINTRAG TRAEGT EIN ZEICHEN. `navIkonen.test.tsx` haelt das fuer diese Liste
 * fest; die drei Namen sind mit dieser Verwaltung neu in `NavIkonName` gekommen
 * (Begruendung dort).
 */
export const UAV_NAV: SuiteNavItem[] = [
  // `/admin/teilnehmer/<id>` markiert „Teilnehmer" mit (Pfadanfang, IDA-392); der
  // längere `/admin/katalog` gewinnt für seine eigenen Unterseiten.
  { key: "teilnehmer", title: "Teilnehmer", href: "/admin", ikon: "teilnehmer", abschnitt: "Verwaltung" },
  { key: "katalog", title: "Aufgabenkatalog", href: "/admin/katalog", ikon: "katalog", abschnitt: "Verwaltung" },

  // ⚠️ `href: "/"` WAR BIS IDA-392 ZUGLEICH DER WURZEL-FALLBACK VON `aktiverEintrag`
  // (`core/shell/SuiteNav.tsx`), UND DAS HATTE EINE SICHTBARE NEBENWIRKUNG: auf
  // jeder Seite, auf die kein anderer Eintrag passte, wurde DIESER hervorgehoben —
  // mit `aria-current="true"`. Auf `/admin/teilnehmer/<id>` hiess das:
  // „Trainingsansicht" trug die Markierung, obwohl man in der Teilnehmerverwaltung
  // stand — `aktiverEintrag` verglich damals per SUFFIX, und
  // `/admin/teilnehmer/<id>` endet nicht auf `/admin`.
  //
  // SEIT IDA-392 vergleicht `aktiverEintrag` per PFADANFANG: `/admin/teilnehmer/<id>`
  // liegt unter `/admin` und markiert „Teilnehmer" (als Abschnitt, `"true"`). Die
  // Wurzel `/` ist nur noch exakt ein Treffer — ausser ein Eintrag traegt
  // `auffang: true`. DIESER traegt es bewusst NICHT: die Trainingsansicht ist eine
  // andere Flaeche, keine Liste, unter die fremde Seiten fallen.
  //
  // `lagerbuch/_lib/nav.ts` weicht der alten Falle aus, indem es GAR KEINEN
  // Wurzel-Eintrag fuehrt; hier ginge das nicht: der Weg zurueck in die
  // Trainingsansicht ist die Modulwurzel, und die Kopfzeile bietet ihn nicht an (der
  // Modultitel ist dort der App-Umschalter, kein Link).
  //
  // Wer diesem Eintrag `auffang: true` gibt, holt den Befund von Aufgabe 15 zurueck
  // (`core/shell/types.ts`, Feld `auffang`).
  { key: "training", title: "Trainingsansicht", href: "/", ikon: "training", abschnitt: "Ansehen" },
];
