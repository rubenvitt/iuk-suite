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
 * beide Formen per Suffix auf.
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
  { key: "teilnehmer", title: "Teilnehmer", href: "/admin", ikon: "teilnehmer", abschnitt: "Verwaltung" },
  { key: "katalog", title: "Aufgabenkatalog", href: "/admin/katalog", ikon: "katalog", abschnitt: "Verwaltung" },

  // ⚠️ `href: "/"` IST ZUGLEICH DER WURZEL-FALLBACK VON `aktiverEintrag`
  // (`core/shell/SuiteNav.tsx`), UND DAS HAT EINE HEUTE SICHTBARE NEBENWIRKUNG: auf
  // jeder Seite, auf die kein anderer Eintrag passt, wird DIESER hervorgehoben — mit
  // `aria-current="true"` statt `"page"`. Auf `/admin/teilnehmer/<id>` heisst das:
  // „Trainingsansicht" traegt die Markierung, obwohl man in der Teilnehmerverwaltung
  // steht. `aktiverEintrag` vergleicht per SUFFIX (wegen des Proxy-Rewrites), und
  // `/admin/teilnehmer/<id>` endet nicht auf `/admin`.
  //
  // Im Browser nachgemessen und BESTEHT SEIT AUFGABE 15, nicht erst seit dieser
  // Ueberarbeitung — die Leiste trug schon vorher einen Eintrag mit `href: "/"`.
  // `lagerbuch/_lib/nav.ts` kennt genau diese Falle und weicht ihr aus, indem es
  // GAR KEINEN Wurzel-Eintrag fuehrt; hier geht das nicht: der Weg zurueck in die
  // Trainingsansicht ist die Modulwurzel, und die Kopfzeile bietet ihn nicht an (der
  // Modultitel ist dort der App-Umschalter, kein Link).
  //
  // ⛔ NICHT IM ALLEINGANG IN `core` REPARIERT. Die saubere Abhilfe waere, dass
  // `aktiverEintrag` einen Pfad, der UNTER einem anderen Eintrag liegt, diesem Eintrag
  // zuschlaegt statt der Wurzel — das ist eine Verhaltensaenderung fuer JEDES Modul mit
  // Navigation und gehoert einer eigenen Aufgabe mit eigenem Browser-Lauf, nicht dieser.
  // Der Massstab aus `docs/design/README.md` verlangt fuer `core` ohnehin einen zweiten,
  // heute belegbaren Nutzniesser.
  { key: "training", title: "Trainingsansicht", href: "/", ikon: "training", abschnitt: "Ansehen" },
];
