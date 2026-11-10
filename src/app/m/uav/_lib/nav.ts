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
  // `unterseiten`: `/admin/teilnehmer/<id>` markiert „Teilnehmer" mit (IDA-389); der
  // längere `/admin/katalog` gewinnt für seine eigenen Unterseiten.
  { key: "teilnehmer", title: "Teilnehmer", href: "/admin", ikon: "teilnehmer", abschnitt: "Verwaltung", unterseiten: true },
  { key: "katalog", title: "Aufgabenkatalog", href: "/admin/katalog", ikon: "katalog", abschnitt: "Verwaltung", unterseiten: true },

  // `href: "/"` IST ZUGLEICH DER WURZEL-FALLBACK VON `aktiverEintrag`
  // (`core/shell/SuiteNav.tsx`). Bis IDA-389 hiess das: auf `/admin/teilnehmer/<id>`
  // trug „Trainingsansicht" die Markierung, weil der Pfad auf keinen Eintrag ENDET.
  // Seither traegt „Teilnehmer" `unterseiten` und nimmt die Markierung
  // (`aria-current="true"`); die Wurzel bleibt fuer Seiten, die unter gar
  // keinem Eintrag mit diesem Opt-in liegen.
  { key: "training", title: "Trainingsansicht", href: "/", ikon: "training", abschnitt: "Ansehen" },
];
