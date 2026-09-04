# Taktische Zeichen — Plan Teil 3: Hülle, Katalog, Baukasten

> Fortsetzung von `2026-09-02-modul-taktische-zeichen.md` (Teil 1) und `…-teil2.md` (Teil 2).
> **Globale Randbedingungen und Dateistruktur stehen in Teil 1** und gelten hier unverändert.
> **Spec:** `docs/superpowers/specs/2026-09-02-modul-taktische-zeichen-design.md`

Enthält: Aufgabe 5 (Hülle) · Aufgabe 6 (Katalog) · Aufgabe 7 (Baukasten).

## Korrekturblatt — verbindlich, vor der Umsetzung lesen

Diese Aufgabenblöcke sind gegen die echten Vorbilddateien geschrieben und anschließend
gegengeprüft worden. **Die Befunde unten sind noch nicht im Text eingearbeitet** — wer eine
der genannten Stellen umsetzt, folgt dem Korrekturblatt, nicht dem Schritt.

| Stelle | Statt | Richtig | Warum |
|---|---|---|---|
| **A6 Schritt 10**, `KatalogInsel.test.tsx`, Filter-Fälle | `await fill('[data-testid="zeichen-filter-kapitel"]', …)` | Einen lokalen Helfer `waehle(selektor, wert)` benutzen: Wert über den `HTMLSelectElement.prototype`-Setter schreiben und ein **`change`**-Ereignis auslösen (Vorbild `qr/admin/preset-form.test.tsx:31-36`) | `fill()` verschickt ein `input`-Ereignis. React bindet `onChange` für `<select>` an das native `change`-Ereignis, nicht an `input` — der Handler feuert nie, die Filter bleiben leer, und der Test misst zweimal dieselbe Trefferzahl. Betrifft alle vier Filterfelder. |
| **A7 Schritt 26**, `AchsenFelder.tsx`, Zweig `achse.art === "wahl"` | ein `<select>` je Spec-Feld | **ein** `<select>` je Achse, dessen Optionen aus allen Feldern der Achse zusammenlaufen (der Wert trägt schon das Präfix `${feld}:${wert}`), gruppiert über `<optgroup>` | Spec §6.1 legt für Zugehörigkeit („ein Feld — sie schließen sich aus") und Kopfzone („ein Feld, drei Quellen … als drei Felder erzeugte jeder zweite Klick `head-zone-conflict`") ausdrücklich **ein** Bedienfeld fest. Das Wertpräfix zeigt, dass ein einziges Feld gemeint war. |
| **A7 Schritt 28**, `BaukastenInsel.tsx`, `hinweise`-`useMemo` | `karte.set("beschriftung", texte)` | Regel-ID → Achse über eine kleine Tabelle abbilden, Rückfall `"beschriftung"` | Spec §6.3 verlangt die Liste **am betroffenen Feld**. Sonst steht `strength-requires-unit` unter der Beschriftung, und der Anwender sucht die Erklärung dort, wo er geklickt hat. |
| **A7 Schritt 23**, „In `actions.ts` ergänzen" | der Codeblock beginnt mit `import { revalidatePath } …`, `import { auth } …`, `import { getDb } …` | **nur die neuen** Importe ergänzen | Aufgabe 6 hat diese drei bereits importiert. Wer den Block wörtlich einfügt, erzeugt doppelte Bezeichner — ein Syntaxfehler, der den ganzen Server-Graph des Moduls mitnimmt. |
| **A7**, Regelverstöße | nur der eigene Text | eigener Text zuerst, **`ValidationIssue.message` klein darunter** | Spec §6.3, letzter Absatz. Fehlt heute ganz. |
| **A7 Schritt 5**, `BODY_VARIANT_NAMEN` | Korrektur hier nachreichen | die Tabelle **in Aufgabe 2** berichtigen und deren Commit ergänzen | Eine Korrektur, die an einem Test hängt, der erst zwei Aufgaben später läuft, lässt Aufgabe 2 falsch stehen. |
| **A7**, Bauübung (§6.5) | fester Vorrat über alle Rezepte | `ziehePruefaufgabe` nimmt optional die IDs des auf `/lernen` gewählten Lernsets (`?set=<slug>`) entgegen — `fragbareZeichen(idsAusSet(db, slug))` aus Aufgabe 8 | Spec §6.5: „zieht ein Zeichen aus den 232 **oder aus dem zuletzt auf `/lernen` gewählten Lernset**". Hängt an Aufgabe 8; nach deren Fertigstellung nachziehen. |
| **A7**, `/meine` → Baukasten | generischer Satz „lässt sich noch nicht zeichnen" | den Satz aus Spec §4.6 Stufe 2 mit der **gespeicherten Paketversion**: „… sie wurde mit `<paket_version>` gespeichert." — `/meine` reicht sie im `?s=`-Link mit | Ohne die Version sagt die Meldung nicht, *warum* es heute nicht mehr geht. |
| **A6 Schritt 12**, `s.detailbereich` | „Alternativ die Zeile streichen — beides ist richtig." | Die Klasse anlegen und leer lassen, mit einem Kommentar, wofür sie da ist | Eine offen gelassene Entscheidung in einem auszuführenden Schritt wird zur Münzwurfentscheidung des Umsetzers. |
| **A5 Schritt 12**, `next/font/local` | `weight: "400 700"` ungemessen | den in Schritt 11 gemessenen Wert eintragen | Der Codeblock trägt sonst eine Vermutung als Tatsache. |

## Aufgabe 5: Hülle — Layouts, Navigation, fünf neue Nav-Ikonen, Startseite

Setzt Spec §2 (Routen und Navigation), §3.5 (wo die Arimo-Klasse hängt), §5.6 (der fachliche
Vorbehalt) und §10 Commit 5 um.

**Dateien:**
- Neu: `src/app/m/zeichen/layout.tsx` · `src/app/m/zeichen/layout.test.tsx`
- Neu: `src/app/m/zeichen/(shell)/layout.tsx` · `src/app/m/zeichen/(shell)/layout.test.tsx`
- Neu: `src/app/m/zeichen/(shell)/page.tsx` · `src/app/m/zeichen/(shell)/page.test.tsx`
- Neu: `src/app/m/zeichen/_lib/nav.ts` · `src/app/m/zeichen/_lib/nav.test.ts`
- Neu: `src/app/m/zeichen/_lib/vorbehalt.ts`
- Ändern: `src/core/shell/types.ts` (fünf Namen in `NavIkonName`, heute 21)
- Ändern: `src/core/shell/navIkonen.tsx` (Importblock **und** `NAV_IKONEN`-Map)
- Ändern: `src/core/shell/navIkonen.test.tsx` (Zeile 21, `GESETZTE_NAVS`)

**Schnittstellen:**
- Nutzt:
  - `KATALOG_STAND` aus `_lib/katalog.ts` (Aufgabe 2) — Zahl, Erzeugungstag, Paket- und
    Datenversion für den Katalogstand auf der Startseite.
  - `src/app/m/zeichen/_fonts/Arimo[wght].ttf` (Aufgabe 2) — die Schriftdatei, die
    `next/font/local` hier einbindet.
  - `canAdminModule(moduleKey): Promise<boolean>` aus `@/core/auth/guards`.
  - `Shell` aus `@/core/shell/Shell`, `Seitenkopf` aus `@/core/shell/Seitenkopf`,
    `SCHRIFT` aus `@/core/theme/schrift`, `SPACE` aus `@/core/theme/tokens`.
  - `SuiteNavItem`/`NavIkonName` aus `@/core/shell/types`.
  - Registry-Eintrag `zeichen` (Aufgabe 1) — `canAdminModule("zeichen")` löst über ihn auf.
- Liefert:
  - `ZEICHEN_NAV: SuiteNavItem[]` — **alle sechs** Einträge, aus `_lib/nav.ts`, **ohne**
    `"use client"`. Das ist die Liste, die `core/shell/navIkonen.test.tsx` liest.
  - `zeichenNav(darfVerwalten: boolean): SuiteNavItem[]` — dieselbe Liste, ohne den
    Verwaltungsabschnitt, wenn die Person das Modul nicht verwalten darf.
  - `VORBEHALT: { titel: string; text: string }` aus `_lib/vorbehalt.ts`, **ohne**
    `"use client"`. **Aufgabe 8 (`/lernen`) benutzt genau diese Konstante** und schreibt den
    Wortlaut nicht ab — Spec §5.6 verlangt denselben Kasten an beiden Stellen, und zwei
    Abschriften laufen auseinander, ohne dass ein Tor rot wird.
  - Die CSS-Variable `--tz-zeichenschrift` steht ab hier auf **jedem** Knoten unter
    `src/app/m/zeichen/` bereit — auch unter der Routengruppe `(rahmenlos)`, die Aufgabe 9
    anlegt. Die Regel `.zeichenflaeche svg text { font-family: var(--tz-zeichenschrift); }`
    schreibt Aufgabe 6 in `_ui/zeichen.module.css`; sie greift nur, weil die Klasse hier hängt.
  - Fünf neue Namen in `NavIkonName`: `zeichensuche` · `merkliste` · `baukasten` · `ueben` ·
    `lernsets`. Ab hier darf jedes Modul sie setzen.
  - Die Routen `/m/zeichen` (Startseite) und die `(shell)`-Hülle, in die die Aufgaben 6, 7 und 8
    ihre Seiten hängen.

> **Was diese Aufgabe absichtlich NICHT tut, damit es niemand „schnell mit erledigt":**
>
> 1. **Keine `existsSync`-Prüfung der Nav-Ziele.** `uav/_lib/nav.test.ts` hat so einen Fall
>    („zeigt mit jedem href auf eine Route, die es gibt"). Hier wäre er bis Aufgabe 8 rot —
>    `/katalog` kommt in Aufgabe 6, `/baukasten` und `/meine` in Aufgabe 7, `/lernen` und
>    `/verwaltung/lernsets` in Aufgabe 8. Drei Commits lang ein roter Test ist Rauschen, in dem
>    ein echter Fehlschlag untergeht. Stattdessen steht hier die **Tafel als Zweitschrift**
>    (`toEqual` über Titel, Ziel, Zeichen, Abschnitt und Reihenfolge, Vorbild
>    `radio/_lib/nav.test.ts:175-205`) — sie fängt Tippfehler im `href` schärfer als
>    `existsSync`, weil sie den Pfad **stellungsgenau** vergleicht statt nur seine Existenz.
>    Dass jeder Eintrag wirklich irgendwohin führt, misst der e2e-Lauf aus Commit 10.
> 2. **Keine Release-Notiz.** Die vier Notizen hängen laut Spec §10 an den Commits 6, 7, 8 und 9.
>    Die Hülle allein zeigt eine Startseite, deren vier Einstiege auf Routen zeigen, die es erst
>    danach gibt — eine Notiz darüber wäre ein Versprechen auf einen 404.
> 3. **Kein `_ui/zeichen.module.css`.** Es gehört zu Aufgabe 6 (Katalogfläche). Hier entsteht nur
>    die Variable, nicht ihr Leser.

---

- [ ] **Schritt 1: Den fehlschlagenden Navigationstest schreiben**

`src/app/m/zeichen/_lib/nav.test.ts`:

```ts
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { ZEICHEN_NAV, zeichenNav } from "./nav";

/*
 * DIE TAFEL IST EINE ZWEITSCHRIFT UND MUSS ES SEIN (Vorbild `radio/_lib/nav.test.ts:175-205`).
 * Ein Fall, der seine Erwartung aus `nav.ts` ableitet, bewacht nichts: `title`, `href` und
 * `ikon` sind Zeichenketten, und eine Vertauschung — `ikon: "merkliste"` am Baukasten, ein
 * `href` mit Tippfehler — laesst typecheck, lint und jeden Mengenfall gruen. Quelle dieser
 * Tafel ist Spec §2 („Navigation"), nicht `nav.ts`.
 *
 * ⚠️ DIE TITEL TRAGEN IHRE UMLAUTE („Üben") — es sind Bildschirmtexte, keine Bezeichner.
 */
const TAFEL: (string | undefined)[][] = [
  ["Katalog",       "/m/zeichen/katalog",             "zeichensuche", undefined],
  ["Merkliste",     "/m/zeichen/merkliste",           "merkliste",    undefined],
  ["Baukasten",     "/m/zeichen/baukasten",           "baukasten",    undefined],
  ["Meine Zeichen", "/m/zeichen/meine",               "baukasten",    undefined],
  ["Üben",          "/m/zeichen/lernen",              "ueben",        undefined],
  ["Lernsets",      "/m/zeichen/verwaltung/lernsets", "lernsets",     "Verwaltung"],
];

describe("ZEICHEN_NAV", () => {
  it("fuehrt die sechs Eintraege aus Spec §2 — Titel, Ziel, Zeichen, Abschnitt, Reihenfolge", () => {
    expect(ZEICHEN_NAV.map((e) => [e.title, e.href, e.ikon, e.abschnitt])).toEqual(TAFEL);
  });

  /*
   * ⛔ KEIN EINTRAG AUF DIE MODULWURZEL. `aktiverEintrag` (`core/shell/SuiteNav.tsx:99-107`)
   * behandelt einen Eintrag mit `href: "/"` als WURZEL-RUECKFALL: auf jeder Seite, auf die kein
   * anderer Eintrag passt, wird dieser hervorgehoben — mit `aria-current="true"`. `uav/_lib/nav.ts`
   * traegt genau diesen Fall samt Browser-Messung aus, `lagerbuch/_lib/nav.ts` weicht ihm durch
   * einen fehlenden Wurzel-Eintrag aus. Hier geht der lagerbuch-Weg: die Startseite `/m/zeichen`
   * markiert nichts in der Leiste, und das ist richtig — sie ist die Uebersicht ueber die
   * Eintraege, nicht einer von ihnen.
   */
  it("fuehrt keinen Eintrag auf die Modulwurzel", () => {
    expect(ZEICHEN_NAV.length, "leere Liste — jeder Fall waere leer-gruen").toBe(6);
    expect(ZEICHEN_NAV.filter((e) => e.href === "/" || e.href === "/m/zeichen")).toEqual([]);
  });

  /*
   * DIE INNERE PFADFORM, UND DAS IST EINE ABWEICHUNG VON `lagerbuch`/`radio`/`uav` MIT GRUND.
   * Jene drei tragen die AEUSSERE Form (`/verwaltung`, `/admin`), weil sie ausschliesslich unter
   * ihrem eigenen Host bedient werden. `zeichen` muss BEIDE Hosts koennen: bis zum Cutover haengt
   * es unter `iuk-ue.de/m/zeichen/...`, danach zusaetzlich unter `SUITE_HOST_ZEICHEN` an der
   * Wurzel. Ein `href="/katalog"` fuehrte auf dem Suite-Host in `decideRoute` auf das PORTAL
   * (`core/routing.ts`, letzte Zeile: `rewrite` nach `/m/portal/katalog`) → 404. Die innere Form
   * traegt beide: `decideRoute` erkennt `/m/<key>/...` in seinem `internal`-Zweig und gatet dort
   * nach dem Segment, nicht nach dem Host.
   *
   * ⚠️ DER PREIS, AUSGESCHRIEBEN STATT VERSCHWIEGEN: `aktiverEintrag` vergleicht per Suffix
   * (`pfad === e.href || pfad.endsWith(e.href)`). Wer auf dem Modul-Host `/katalog` direkt
   * aufruft, bekommt intern `/m/zeichen/katalog` gerendert, in der Adresszeile steht aber
   * `/katalog` — und `"/katalog".endsWith("/m/zeichen/katalog")` ist falsch. Die Markierung in
   * der Leiste fehlt dann bis zum ersten Klick auf einen Nav-Link. Das ist ein Schoenheitsfehler
   * gegen einen 404 abgewogen, keine Unachtsamkeit.
   */
  it("traegt die innere Pfadform, weil das Modul unter beiden Hosts erreichbar sein muss", () => {
    const fremd = ZEICHEN_NAV.filter((e) => !e.href.startsWith("/m/zeichen/")).map((e) => e.key);
    expect(fremd).toEqual([]);
  });

  /*
   * ⚠️ NICHT TYPSEITIG GEDECKT: `SuiteNavItem.ikon` ist OPTIONAL (`core/shell/types.ts`), und
   * `NavIkone` liefert fuer einen fehlenden Namen still `null`. Ein Eintrag ohne Zeichen steht
   * dann als nackter Text zwischen fuenf Zeichen — kein Typ- und kein Lint-Fehler.
   * ⛔ DASS DER NAME AUFLOEST, PRUEFT DIESER FALL NICHT: das ist die Zusage von
   * `core/shell/navIkonen.test.tsx`, und dort steht diese Liste seit Schritt 3 drin.
   */
  it("setzt fuer jeden Eintrag ein Zeichen", () => {
    expect(ZEICHEN_NAV.filter((e) => e.ikon === undefined).map((e) => e.key)).toEqual([]);
  });

  /*
   * DER VERWALTUNGSEINTRAG HAENGT AM SELBEN PRAEDIKAT WIE DIE ROUTE (Spec §2): sichtbar bei
   * `canAdminModule("zeichen")`, gegated durch `moduleAdminPageOrNotFound("zeichen")`. Die
   * Pruefrage aus `docs/design/README.md` lautet „fuehrt KEIN Weg dorthin, wo die aufrufende
   * Person nicht hindarf?" — ein Eintrag, der in ein 404 fuehrt, beantwortet sie mit nein.
   *
   * GEFILTERT WIRD UEBER `abschnitt`, NICHT UEBER DEN SCHLUESSEL `lernsets`: kommt eine zweite
   * Verwaltungsflaeche dazu, ist sie damit von selbst mitgegatet. Ein Filter auf den Schluessel
   * haette sie still durchgelassen.
   */
  it("blendet die Verwaltung aus, wer das Modul nicht verwalten darf", () => {
    expect(zeichenNav(false).map((e) => e.key)).toEqual([
      "katalog", "merkliste", "baukasten", "meine", "lernen",
    ]);
    expect(zeichenNav(false).filter((e) => e.abschnitt !== undefined)).toEqual([]);
    expect(zeichenNav(true)).toEqual(ZEICHEN_NAV);
  });

  /*
   * FALLE 6, UND SIE IST HIER SCHARF: `(shell)/layout.tsx` ist eine Server Component und liest
   * diesen WERT. Traegt `nav.ts` je ein `"use client"`, kommt dort eine Client-Referenz statt
   * des Arrays an — HTTP 500 fuer jede Seite des Moduls, und weder `typecheck` noch `build`
   * noch dieser Test-Runner sieht es (in Vitest ist `"use client"` ein wirkungsloser String).
   * Was der Runner sehen kann, ist der Quelltext.
   */
  it("ist kein Client-Modul", () => {
    const quelle = readFileSync("src/app/m/zeichen/_lib/nav.ts", "utf8");
    expect(quelle).not.toMatch(/["']use client["']/);
  });
});
```

- [ ] **Schritt 2: Test laufen lassen und Fehlschlag bestätigen**

Kommando: `pnpm vitest run src/app/m/zeichen/_lib/nav.test.ts`
Erwartet: FAIL — `Failed to load url ./nav` bzw. `Cannot find module './nav'`. Die Datei gibt es
noch nicht; kein einziger Fall läuft.

- [ ] **Schritt 3: `navIkonen.test.tsx` von Hand erweitern — Zeile 21**

**Dieser Schritt steht getrennt, weil dieser Test sonst NIE rot wird.** `GESETZTE_NAVS` ist eine
handgepflegte Liste; ein Modul, das seine Navigation nicht dort einträgt, wird von keinem Tor
geprüft — die fünf neuen Namen könnten in `NavIkonName` stehen und in `NAV_IKONEN` fehlen, und
`Record<NavIkonName, IconType>` fiele das erst auf, wenn jemand `typecheck` liest.

In `src/core/shell/navIkonen.test.tsx`, beim Importblock:

```ts
import { ZEICHEN_NAV } from "@/app/m/zeichen/_lib/nav";
```

und Zeile 21 (`GESETZTE_NAVS`) ersetzen durch:

```ts
/*
 * ⛔ `radioNav("admin")` UND NICHT `radioNav("updater")`: die Admin-Form ist die
 * OBERMENGE (sieben Eintraege statt vier). Die Updater-Form liesse genau die drei
 * Eintraege ungeprueft, die die Admin-Stufe allein sieht — darunter zwei der drei
 * Zeichen, die mit dem Modul `radio` neu in die Map gekommen sind.
 *
 * ⛔ AUS DEMSELBEN GRUND `ZEICHEN_NAV` UND NICHT `zeichenNav(false)`: die Konstante ist die
 * Obermenge (sechs Eintraege statt fuenf). Die gefilterte Form liesse ausgerechnet den
 * Verwaltungseintrag „Lernsets" ungeprueft — und damit `lernsets`/`PiCardsThree`, einen der
 * fuenf Namen, die mit diesem Modul neu in die Map kommen.
 */
const GESETZTE_NAVS = [...LAGERBUCH_NAV, ...radioNav("admin"), ...UAV_NAV, ...ZEICHEN_NAV];
```

- [ ] **Schritt 4: Zweiten Fehlschlag bestätigen**

Kommando: `pnpm vitest run src/core/shell/navIkonen.test.tsx`
Erwartet: FAIL — derselbe Auflösungsfehler (`Cannot find module '@/app/m/zeichen/_lib/nav'`);
die vier Fälle der Datei laufen nicht an.

- [ ] **Schritt 5: `_lib/nav.ts` schreiben**

`src/app/m/zeichen/_lib/nav.ts`:

```ts
import type { SuiteNavItem } from "@/core/shell/types";

/**
 * DIE MODULNAVIGATION (Spec §2).
 *
 * KEIN `"use client"` (Falle 6): `(shell)/layout.tsx` ist eine Server Component und liest
 * diesen Wert. Aus einem Client-Modul kaeme dort eine Client-Referenz statt des Arrays an —
 * HTTP 500 fuer jede Seite mit Navigation, unsichtbar fuer `typecheck`, `build` und Vitest.
 * Vorbild: `lagerbuch/_lib/nav.ts`, `radio/_lib/nav.ts`, `uav/_lib/nav.ts`.
 *
 * DIE INNERE PFADFORM (`/m/zeichen/...`), ANDERS ALS BEI `lagerbuch`, `radio` UND `uav`. Jene
 * drei tragen die aeussere Form, weil sie nur unter ihrem eigenen Host bedient werden. Dieses
 * Modul muss beide Hosts koennen — bis zum Cutover `iuk-ue.de/m/zeichen/...`, danach zusaetzlich
 * `SUITE_HOST_ZEICHEN` an der Wurzel. `/katalog` fuehrte auf dem Suite-Host in `decideRoute` auf
 * das Portal (→ 404); die innere Form traegt beide Hosts, weil `decideRoute` sie in seinem
 * `internal`-Zweig erkennt und nach dem Segment gatet. Der Preis steht in `nav.test.ts`: nach
 * einem DIREKTEN Aufruf von `/katalog` auf dem Modul-Host fehlt die Aktivmarkierung, bis zum
 * ersten Klick in der Leiste.
 *
 * KEIN WURZEL-EINTRAG. `aktiverEintrag` (`core/shell/SuiteNav.tsx:99-107`) behandelt `href: "/"`
 * als Rueckfall und markierte ihn auf jeder nicht zugeordneten Seite. `uav` traegt diesen Fall
 * mit Browser-Messung aus, `lagerbuch` weicht ihm aus — hier wird ausgewichen.
 *
 * „MEINE ZEICHEN" TEILT SICH DAS ZEICHEN MIT „BAUKASTEN", UND ZWAR ABSICHTLICH: es ist dieselbe
 * Sache aus zwei Richtungen (bauen / das Gebaute). Ein sechster Name in `NavIkonName` haette
 * eine Unterscheidung behauptet, die es fachlich nicht gibt.
 *
 * EIN ABSCHNITT, UND ER IST ZUGLEICH DAS FILTERKRITERIUM (s. `zeichenNav`).
 */
export const ZEICHEN_NAV: SuiteNavItem[] = [
  { key: "katalog", title: "Katalog", href: "/m/zeichen/katalog", ikon: "zeichensuche" },
  { key: "merkliste", title: "Merkliste", href: "/m/zeichen/merkliste", ikon: "merkliste" },
  { key: "baukasten", title: "Baukasten", href: "/m/zeichen/baukasten", ikon: "baukasten" },
  { key: "meine", title: "Meine Zeichen", href: "/m/zeichen/meine", ikon: "baukasten" },
  { key: "lernen", title: "Üben", href: "/m/zeichen/lernen", ikon: "ueben" },
  {
    key: "lernsets",
    title: "Lernsets",
    href: "/m/zeichen/verwaltung/lernsets",
    ikon: "lernsets",
    abschnitt: "Verwaltung",
  },
];

/**
 * Die Liste, wie sie EINE bestimmte Person sieht.
 *
 * ⛔ DASSELBE PRAEDIKAT, DAS DIE ROUTE GATET (Spec §2): `canAdminModule("zeichen")` entscheidet
 * ueber den Eintrag, `moduleAdminPageOrNotFound("zeichen")` ueber die Seite. Zwei verschiedene
 * Quellen liefen auseinander, und die harmlosere Richtung — Eintrag da, Seite 404 — ist genau
 * die, die `docs/design/README.md` verbietet („fuehrt KEIN Weg dorthin, wo die aufrufende Person
 * nicht hindarf?").
 *
 * GEFILTERT WIRD UEBER `abschnitt`, NICHT UEBER DEN SCHLUESSEL: eine zweite Verwaltungsflaeche
 * ist damit von selbst mitgegatet, statt bei ihrer Einfuehrung still durchzurutschen.
 *
 * ⚠️ DIE KONSTANTE BLEIBT EXPORTIERT UND IST DIE OBERMENGE — `core/shell/navIkonen.test.tsx`
 * liest sie, weil nur sie alle fuenf neuen Zeichen enthaelt.
 */
export function zeichenNav(darfVerwalten: boolean): SuiteNavItem[] {
  if (darfVerwalten) return ZEICHEN_NAV;
  return ZEICHEN_NAV.filter((eintrag) => eintrag.abschnitt !== "Verwaltung");
}
```

- [ ] **Schritt 6: `typecheck` laufen lassen und den dritten Fehlschlag sehen — er ist der Beleg**

Kommando: `pnpm typecheck`
Erwartet: FAIL mit **sechs** Zeilen der Form

```
src/app/m/zeichen/_lib/nav.ts(…): error TS2322: Type '"zeichensuche"' is not assignable to type 'NavIkonName | undefined'.
```

(sechs Einträge, fünf verschiedene Namen — `meine` wiederholt `baukasten`). **Das ist die
Zusicherung, die diese Aufgabe braucht:** `NavIkonName` ist eine geschlossene Union, und ein
Modul kann sich kein Zeichen ausdenken, ohne `core` anzufassen. `aufgaben/_lib/nav.ts:38` hat
denselben Befund und deshalb gar keine Zeichen.

> ⚠️ **Außerhalb dieser Umgebung den Exit-Code prüfen, nicht die Meldung** (`CLAUDE.md`): RTKs
> tsc-Filter meldet „TypeScript: No errors found", wenn tsc seine pretty-Form ausgibt, und
> `grep "error TS"` zählt auf farbigem Output 0, weil eine ANSI-Sequenz zwischen `error` und
> `TS` steht. In fish: `pnpm typecheck; echo $status`.

- [ ] **Schritt 7: Die fünf Namen in `core/shell/types.ts` und `core/shell/navIkonen.tsx` eintragen**

Erst prüfen, dass die Komponenten wirklich existieren — `react-icons` exportiert über 40.000
Namen, und ein Tippfehler ist ein `undefined` in der Map, das `NavIkone` **still** als `null`
rendert:

```bash
node -e "const pi=require('react-icons/pi'); const n=['PiMagnifyingGlass','PiBookmarkSimple','PiPuzzlePiece','PiGraduationCap','PiCardsThree']; const fehlt=n.filter(x=>typeof pi[x]!=='function'); if(fehlt.length){console.error('FEHLT:',fehlt.join(', ')); process.exit(1)} console.log('alle fuenf vorhanden')"
```

Erwartet: `alle fuenf vorhanden` (gemessen gegen `react-icons` 5.7.0, die im Repo installierte
Version).

In `src/core/shell/types.ts`, an die Union `NavIkonName` (heute 21 Namen), nach `training`:

```ts
  // Fuenf Zeichen fuer das Modul `zeichen` (Taktische Zeichen). Dieselbe Begruendung wie bei
  // `radio` und `uav`, und sie traegt hier besonders: KEIN geliehener Name. `katalog` ist von
  // `uav` belegt und heisst dort „Aufgabenkatalog" — ein Katalog taktischer Zeichen daneben
  // gaebe dem naechsten Leser einen FALSCHEN Begriff statt eines fehlenden. `checks` und
  // `vorlagen` (lagerbuch) meinen Pruefungen und Fahrzeugvorlagen, nicht Uebung und Lernset.
  // `zeichensuche` und nicht `suche`: gesucht wird hier ein taktisches Zeichen, und ein
  // allgemeiner Name laedt das naechste Modul ein, ihn fuer etwas anderes zu nehmen.
  | "zeichensuche" | "merkliste" | "baukasten" | "ueben" | "lernsets";
```

In `src/core/shell/navIkonen.tsx`, im Importblock aus `react-icons/pi`:

```ts
  PiMagnifyingGlass, PiBookmarkSimple, PiPuzzlePiece, PiGraduationCap, PiCardsThree,
```

und ans Ende der `NAV_IKONEN`-Map:

```ts
  // Fuenf Zeichen fuer das Modul `zeichen` (Taktische Zeichen) — Begruendung an der Union in
  // `types.ts`. `Record<NavIkonName, IconType>` erzwingt beide Haelften typseitig: ein
  // Union-Mitglied ohne Eintrag hier ist ein typecheck-Fehler.
  // `baukasten` traegt ZWEI Nav-Eintraege („Baukasten" und „Meine Zeichen") — dieselbe Sache
  // aus zwei Richtungen, deshalb dasselbe Zeichen und kein sechster Name.
  zeichensuche: PiMagnifyingGlass,
  merkliste: PiBookmarkSimple,
  baukasten: PiPuzzlePiece,
  ueben: PiGraduationCap,
  lernsets: PiCardsThree,
```

- [ ] **Schritt 8: Grün sehen**

Kommando: `pnpm typecheck && pnpm vitest run src/app/m/zeichen/_lib/nav.test.ts src/core/shell`
Erwartet: `typecheck` grün, alle Fälle grün — darunter die vier aus `navIkonen.test.tsx` und
`navAbschnitte.test.ts`.

> **`navAbschnitte.test.ts` braucht KEINE Änderung, und das ist eine Aussage, keine Auslassung.**
> Der Test markiert Module, die `abschnitt` vergeben, ohne im Registry `shell: "full"` zu tragen
> (`FULL_TROTZ_REGISTRY = ["uav"]`). `zeichen` steht seit Aufgabe 1 mit `shell: "full"` im
> Registry und fällt gar nicht erst in die geprüfte Menge. Wer `zeichen` dort einträgt, behauptet
> eine Ausnahme, die es nicht gibt.

- [ ] **Schritt 9: Den fehlschlagenden Test für das Modul-Layout schreiben**

`src/app/m/zeichen/layout.test.tsx`:

```tsx
import { readFileSync } from "node:fs";
import { Children, type ReactElement } from "react";
import { describe, expect, it, vi } from "vitest";

/*
 * `next/font/local` braucht Nexts SWC-Plugin; unter Vitest wirft der Loader. Dieselbe Abhilfe
 * wie in `src/app/layout.test.tsx` und `feedback/f/[slugSecret]/page.test.tsx`: den Loader
 * mocken und sein Argument ECHOEN. Der echte Rueckgabewert von `variable` ist ein generierter
 * Klassenname (`__variable_1a2b3c`); der Mock gibt stattdessen den Variablennamen zurueck, damit
 * die Zusicherung unten lesbar ist und zugleich die Paarung Option ↔ verwendeter Wert prueft.
 */
vi.mock("next/font/local", () => ({
  default: (optionen: { variable: string }) => ({
    variable: optionen.variable,
    className: optionen.variable,
    style: { fontFamily: "Arimo" },
  }),
}));

import ZeichenLayout from "./layout";

type Wurzel = ReactElement<{ className?: string; children?: unknown }>;
type LinkKnoten = ReactElement<{ rel?: string; href?: string; crossOrigin?: string }>;

function wurzelMitKindern() {
  const wurzel = ZeichenLayout({ children: null }) as Wurzel;
  const kinder = Children.toArray(wurzel.props.children) as LinkKnoten[];
  return { wurzel, kinder };
}

describe("Modul-Layout zeichen", () => {
  /*
   * SPEC §3.5: DIE `.variable`-KLASSE HAENGT AN DIESEM `<div>` UND NIRGENDWO SONST.
   *
   * Gemessen tragen 160 von 242 Rezepten `<text font-family="Arimo">`, und die Textgeometrie
   * des Katalogs ist gegen Arimo vermessen — ohne die Schrift laufen „KatSL", „ÜMANV-S" und
   * „MLW IV Lbw" aus ihren Boxen.
   *
   * ⛔ NICHT AM `(shell)`-LAYOUT: dort haenge sie nicht ueber `/offline`, das Aufgabe 9 unter
   * der zweiten Routengruppe `(rahmenlos)` anlegt — und ausgerechnet die Offline-Flaeche zeigt
   * denselben Katalog. Diese Datei ist der EINZIGE gemeinsame Vorfahre beider Gruppen.
   * ⛔ NICHT AM `<html>`: das waere das Wurzel-Layout der Suite und damit eine core-Aenderung
   * ohne zweiten Nutzniesser (`CLAUDE.md`: „nur was ein zweites Modul braucht").
   */
  it("haengt die Arimo-Klasse an den gemeinsamen Vorfahren beider Routengruppen", () => {
    const { wurzel } = wurzelMitKindern();
    expect(wurzel.type).toBe("div");
    expect(wurzel.props.className).toBe("--tz-zeichenschrift");
  });

  /*
   * SPEC §7.3: OHNE `crossOrigin="use-credentials"` HOLT DER BROWSER DAS MANIFEST OHNE COOKIES
   * UND BEKOMMT LOGIN-HTML. `zeichen` traegt `requiresAuth: true`; eine Anfrage ohne Sitzung
   * beantwortet die Middleware mit `307 → /login`. Das Attribut kam im ganzen Repo bisher nicht
   * vor (`grep -rn crossOrigin src/` → leer).
   */
  it("verweist mit Zugangsdaten auf das Manifest", () => {
    const { kinder } = wurzelMitKindern();
    const link = kinder.find((k) => k?.props?.rel === "manifest");
    expect(link, "kein <link rel=\"manifest\"> im Layout").toBeDefined();
    expect(link!.props.href).toBe("/manifest.webmanifest");
    expect(link!.props.crossOrigin).toBe("use-credentials");
  });

  /*
   * ⛔ DER LINK DARF NICHT NACH `metadata.manifest` „AUFGERAEUMT" WERDEN. Nexts Metadata-API
   * kennt fuer das Feld nur `null | string | URL`
   * (`node_modules/next/dist/lib/metadata/types/metadata-interface.d.ts:253`) — sie kann das
   * Attribut GAR NICHT ausdruecken. Wer `<link>` durch `export const metadata` ersetzt, entfernt
   * damit still die Zugangsdaten, und das Manifest ist ab dann Login-HTML. `uav/layout.tsx` und
   * `lagerbuch/layout.tsx` benutzen `metadata.manifest` — sie sind hier ausdruecklich KEIN
   * Vorbild, weil ihre Manifeste ohne Sitzung erreichbar sind.
   */
  it("schreibt den Verweis von Hand und nicht ueber die Metadata-API", () => {
    const quelle = readFileSync("src/app/m/zeichen/layout.tsx", "utf8");
    expect(quelle).toContain('crossOrigin="use-credentials"');
    expect(quelle).not.toContain("export const metadata");
  });

  /*
   * FALLE 6: diese Datei ist eine Server Component. Ein `"use client"` machte sie zur
   * Client-Insel — `next/font/local` laeuft dort nicht, und das Layout zoege den ganzen
   * Modulbaum ins Client-Bundle.
   */
  it("ist kein Client-Modul", () => {
    const quelle = readFileSync("src/app/m/zeichen/layout.tsx", "utf8");
    expect(quelle).not.toMatch(/["']use client["']/);
  });
});
```

- [ ] **Schritt 10: Fehlschlag bestätigen**

Kommando: `pnpm vitest run src/app/m/zeichen/layout.test.tsx`
Erwartet: FAIL — `Cannot find module './layout'`.

- [ ] **Schritt 11: Den Gewichtsbereich der Schriftdatei nachlesen**

Kommando:

```bash
node -e '
const fs=require("fs"); const b=fs.readFileSync("src/app/m/zeichen/_fonts/Arimo[wght].ttf");
const n=b.readUInt16BE(4); let gefunden=false;
for(let i=0;i<n;i++){const o=12+i*16; if(b.toString("ascii",o,o+4)==="fvar"){gefunden=true;
 const f=b.readUInt32BE(o+8), ao=f+b.readUInt16BE(f+4), ac=b.readUInt16BE(f+8), as=b.readUInt16BE(f+10);
 for(let a=0;a<ac;a++){const p=ao+a*as;
  console.log(b.toString("ascii",p,p+4), b.readInt32BE(p+4)/65536, b.readInt32BE(p+8)/65536, b.readInt32BE(p+12)/65536);}}}
if(!gefunden) console.log("keine fvar-Tabelle: statische Schrift");
'
```

Erwartet: eine Zeile `wght <min> <default> <max>` — für Googles Arimo `wght 400 400 700`.
**Trage genau diese min/max als `weight: "<min> <max>"` in Schritt 12 ein.** Meldet der Befehl
„keine fvar-Tabelle", ist die Datei statisch; dann steht dort `weight: "400"`. Ein falscher
Bereich ist still: der Browser synthetisiert das fehlende Gewicht, und die Beschriftungen werden
breiter als vermessen.

- [ ] **Schritt 12: `layout.tsx` schreiben**

`src/app/m/zeichen/layout.tsx`:

```tsx
import localFont from "next/font/local";

/**
 * ARIMO — DIE SCHRIFT, GEGEN DIE DIE ZEICHEN VERMESSEN SIND (Spec §3.5).
 *
 * Gemessen tragen 160 von 242 Rezepten `<text font-family="Arimo">`, und die Textgeometrie im
 * Generat ist gegen Arimo gerechnet. Ohne die Schrift laufen „KatSL", „ÜMANV-S" und
 * „MLW IV Lbw" aus ihren Boxen — sichtbar erst im Browser, nie in einem Tor: jsdom rechnet
 * keine Glyphen (§9, H2).
 *
 * `next/font/local` UND NICHT `public/m/zeichen/`: so landet die Datei unter
 * `/_next/static/media/` mit Inhaltshash, und `/_next` steht in `PASSTHROUGH`
 * (`core/routing.ts:12`) — sie ist ohne Sitzung abrufbar. Unter `public/` liefe sie durch
 * `decideRoute` und waere bei `requiresAuth: true` gegatet (gemessen an
 * `uav/illustrationen.test.ts:8-13`, das nur durchkommt, weil `uav` `requiresAuth: false`
 * traegt).
 *
 * ⚠️ ES GIBT IM REPO KEIN ZWEITES `next/font/local`. Vorbild ist deshalb `src/app/layout.tsx`
 * mit fuenf `next/font/google`-Aufrufen — dieselbe Bauform, andere Quelle: der Aufruf steht auf
 * Modulebene (nie in der Komponente, sonst laedt Next die Schrift bei jedem Render neu), und
 * `variable:` deklariert eine CSS-Variable, die erst wirkt, wo jemand sie liest.
 *
 * `display: "block"` STATT DER VORGABE `swap`: mit `swap` zeigte der Browser die Beschriftungen
 * zuerst in der Rueckfallschrift — also genau in der Form, die aus den Boxen laeuft. `block`
 * haelt sie bis zu 3 s unsichtbar und faellt danach zurueck. Kurz unsichtbar ist besser als
 * kurz falsch.
 *
 * `preload` BLEIBT AUF DER VORGABE `true`, UND DAS IST EINE VORLEISTUNG FUER COMMIT 9: der
 * Vorlade-Verweis im HTML ist die Spur, an der der Service Worker die Schriftdatei findet
 * (Spec §3.5: sie kommt ueber `cacheReferencedAssets` von selbst mit). Wer hier `preload: false`
 * setzt, nimmt der Offline-Flaeche ihre Schrift, ohne dass ein Tor es sieht.
 *
 * ⚠️ DER DATEINAME TRAEGT ECKIGE KLAMMERN, weil das Quellprojekt seine variable Schrift so
 * ausliefert und `scripts/zeichen-generat.ts` sie unter diesem Namen kopiert. Unter `src/app/`
 * sind Klammern Nexts Syntax fuer dynamische Segmente — hier folgenlos, weil `_fonts` ein
 * privater Ordner ist (Unterstrich-Praefix) und vom Routing ausgenommen. Stolpert der
 * Font-Loader trotzdem darueber, wird die Datei zu `Arimo-variable.ttf` umbenannt: an ZWEI
 * Stellen, hier und in der `copyFileSync`-Zeile des Generators.
 */
const arimo = localFont({
  src: "./_fonts/Arimo[wght].ttf",
  weight: "400 700",
  style: "normal",
  variable: "--tz-zeichenschrift",
  display: "block",
});

/**
 * DER EINZIGE GEMEINSAME VORFAHRE BEIDER ROUTENGRUPPEN — `(shell)` und die `(rahmenlos)`, die
 * Aufgabe 9 anlegt. Next stapelt Layouts pro PFAD-SEGMENT, nicht pro Routengruppe; alles, was
 * beide Gruppen brauchen, gehoert deshalb hierher und nirgendwo sonst hin. Vorbild fuer die
 * duenne Form: `uav/layout.tsx`, `lagerbuch/layout.tsx`, `radio/layout.tsx` — sie tragen
 * ebenfalls keine `<Shell>`, damit ihre Zweige die Variante selbst entscheiden koennen.
 *
 * DER MANIFEST-VERWEIS VON HAND, MIT `crossOrigin="use-credentials"` (Spec §7.3). Ohne das
 * Attribut holt der Browser das Manifest OHNE Cookies und bekommt bei `requiresAuth: true` das
 * Login-HTML. Nexts `metadata.manifest` kann das Attribut nicht ausdruecken (Typ
 * `null | string | URL`) — deshalb der Knoten im Markup. React haengt ihn selbst in den
 * `<head>`: ein `<link>` mit `rel` und `href` und ohne `onLoad`/`onError` ist fuer React ein
 * hoistbarer Knoten (`react-dom` … `isHostHoistableType`), gleich wo er im Baum steht.
 *
 * ⚠️ BIS COMMIT 9 ANTWORTET `/manifest.webmanifest` MIT 404 — den Route Handler legt erst jene
 * Aufgabe an, und auf dem SUITE-Host bleibt es dauerhaft bei 404, weil der Pfad dort ins Portal
 * rewritet. Beides ist folgenlos (der Browser installiert dann eben keine PWA) und steht im
 * Commit-Text, damit es niemand fuer einen Fehler haelt.
 *
 * DER `<div>` TRAEGT NUR DIE KLASSE UND KEINEN `style` — er soll das Layout der Shell nicht
 * anfassen. Vorbild: `aufgaben/layout.tsx`, das aus demselben Grund einen Traeger AUSSERHALB
 * der Shell haelt.
 */
export default function ZeichenLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className={arimo.variable}>
      <link rel="manifest" href="/manifest.webmanifest" crossOrigin="use-credentials" />
      {children}
    </div>
  );
}
```

- [ ] **Schritt 13: Grün sehen**

Kommando: `pnpm vitest run src/app/m/zeichen/layout.test.tsx`
Erwartet: PASS, vier Fälle.

- [ ] **Schritt 14: Den fehlschlagenden Test für das `(shell)`-Layout schreiben**

`src/app/m/zeichen/(shell)/layout.test.tsx`:

```tsx
import type { ReactElement } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SuiteNavItem } from "@/core/shell/types";

/*
 * `@/core/auth` MUSS GEMOCKT SEIN, auch wenn dieser Test nichts rendert: `canAdminModule`
 * ruft `auth()`, und next-auths eigener `next/server`-Import bricht im `node`-Environment
 * (Begruendung ausgeschrieben in `portal/layout.test.tsx`). Dieselbe Form wie
 * `aufgaben/layout.test.tsx`.
 */
let sitzung: unknown = null;
vi.mock("@/core/auth", () => ({ auth: async () => sitzung }));

import { ZEICHEN_NAV } from "../_lib/nav";
import ZeichenShellLayout from "./layout";

beforeEach(() => {
  sitzung = null;
});

/*
 * DIE VERDRAHTUNG OHNE RENDERN: `ZeichenShellLayout` ist eine Server Component, ihr
 * Rueckgabewert ist ein React-ELEMENT. `element.props` zu lesen prueft, was bei `<Shell>`
 * ankommt, ohne die Shell auszufuehren — Vorbild `aufgaben/layout.test.tsx`,
 * `portal/layout.test.tsx`.
 */
async function shellProps() {
  const element = (await ZeichenShellLayout({ children: null })) as ReactElement<{
    variant: string;
    moduleKey: string;
    nav: SuiteNavItem[];
  }>;
  return element.props;
}

describe("(shell)-Layout zeichen", () => {
  /*
   * `variant="full"` ALS LITERAL UND NICHT AUS `getModule("zeichen").shell`, obwohl das Registry
   * denselben Wert traegt: dieses Layout beschreibt EINE der zwei Routengruppen des Moduls. Die
   * zweite — `(rahmenlos)/offline`, Aufgabe 9 — laeuft ausdruecklich OHNE Shell. Ein aus dem
   * Registry gelesener Wert behauptete, er gaelte fuer das ganze Modul. Vorbild:
   * `uav/(admin)/layout.tsx`, das aus demselben Grund den Literalwert setzt.
   *
   * `full` heisst zugleich: `FullShell` legt `ARBEITSDICHTE` (44/48) um den INHALT
   * (`FullShell.tsx`, `theme.ts`). Deshalb steht an keinem antd-Bedienelement dieses Moduls ein
   * `size` (Falle 4: `size="large"` waere 72px), und eigenes Markup traegt `minHeight: 44` als
   * Literal.
   */
  it("setzt die volle Huelle mit dem Modulschluessel", async () => {
    const props = await shellProps();
    expect(props.variant).toBe("full");
    expect(props.moduleKey).toBe("zeichen");
  });

  it("gibt ohne Verwaltungsrecht fuenf Eintraege und keinen Verwaltungsabschnitt", async () => {
    sitzung = { user: { groups: [] } };
    const props = await shellProps();
    expect(props.nav.map((e) => e.key)).toEqual([
      "katalog", "merkliste", "baukasten", "meine", "lernen",
    ]);
  });

  /*
   * `iuk-zeichen-admin` IST DER REGISTRY-VORGABEWERT (Aufgabe 1); `SUITE_ADMIN_GROUP_ZEICHEN`
   * ist in der Testumgebung nicht gesetzt. Geprueft wird die Kette Sitzung → `canAdminModule`
   * → `zeichenNav` → `nav`-Prop, nicht `zeichenNav` allein (das tut `_lib/nav.test.ts`).
   */
  it("gibt mit der Modul-Admin-Gruppe alle sechs Eintraege", async () => {
    sitzung = { user: { groups: ["iuk-zeichen-admin"] } };
    const props = await shellProps();
    expect(props.nav).toEqual(ZEICHEN_NAV);
  });
});
```

- [ ] **Schritt 15: Fehlschlag bestätigen**

Kommando: `pnpm vitest run "src/app/m/zeichen/(shell)/layout.test.tsx"`
Erwartet: FAIL — `Cannot find module './layout'`. (Die Anführungszeichen sind Pflicht: fish
expandiert die Klammern sonst als Wortliste.)

- [ ] **Schritt 16: `(shell)/layout.tsx` schreiben**

`src/app/m/zeichen/(shell)/layout.tsx`:

```tsx
import { canAdminModule } from "@/core/auth/guards";
import { Shell } from "@/core/shell/Shell";
import { zeichenNav } from "../_lib/nav";

/**
 * DIE HUELLE DER ARBEITSFLAECHEN — Startseite, Katalog, Merkliste, Baukasten, Meine Zeichen,
 * Ueben und die Lernset-Verwaltung. GESCHWISTER-SEGMENT der Routengruppe `(rahmenlos)`, die
 * Aufgabe 9 anlegt und die bewusst OHNE `<Shell>` laeuft (Spec §2: jede Seite unter
 * `SuiteRahmen` traegt Klarnamen und gruppenabhaengige App-Liste im Flight-Payload, und genau
 * das darf auf der gecachten Offline-Seite nicht liegen). Vorbild fuer die Aufteilung:
 * `uav/(admin)/layout.tsx` neben `uav/(teilnehmer)/layout.tsx`.
 *
 * `variant="full"` ALS LITERAL: siehe `layout.test.tsx`. `FullShell` legt damit `ARBEITSDICHTE`
 * (44/48) um den Inhalt — an keinem antd-Bedienelement dieses Moduls steht ein `size` (Falle 4).
 *
 * ⛔ HIER STEHT KEIN ZUGRIFFSRIEGEL, UND DAS IST RICHTIG: `zeichen` traegt `requiresAuth: true`
 * mit leerem `requiredGroups` — den ganzen Modulzugang haelt das generische Middleware-Gate
 * (`core/routing.ts`), es gibt keinen anonymen Teilpfad und damit nichts modulintern
 * nachzudurchsetzen. Die EINE gruppenabhaengige Flaeche ist die Lernset-Verwaltung; sie traegt
 * `moduleAdminPageOrNotFound("zeichen")` als erste Anweisung ihrer eigenen Seite (Aufgabe 8).
 * Eine Routengruppe ist Bequemlichkeit, keine Sicherheitsgrenze.
 *
 * `canAdminModule("zeichen")` ENTSCHEIDET NUR UEBER DIE SICHTBARKEIT DES EINTRAGS — dasselbe
 * Praedikat, das die Route gatet (Spec §2). Es wirft nicht: wer nicht verwalten darf, sieht die
 * Leiste ohne den Abschnitt „Verwaltung" und sonst alles.
 */
export default async function ZeichenShellLayout({ children }: { children: React.ReactNode }) {
  const darfVerwalten = await canAdminModule("zeichen");

  return (
    <Shell variant="full" moduleKey="zeichen" nav={zeichenNav(darfVerwalten)}>
      {children}
    </Shell>
  );
}
```

- [ ] **Schritt 17: Grün sehen**

Kommando: `pnpm vitest run "src/app/m/zeichen/(shell)/layout.test.tsx"`
Erwartet: PASS, drei Fälle.

- [ ] **Schritt 18: Den Vorbehaltstext anlegen und den fehlschlagenden Test für die Startseite schreiben**

`src/app/m/zeichen/_lib/vorbehalt.ts`:

```ts
/**
 * DER FACHLICHE VORBEHALT (Spec §5.6) — EINE QUELLE FUER ZWEI FLAECHEN.
 *
 * Gemessen ist `review.domain.status` bei 544 von 544 Zeilen des Quellprojekts `"pending"` —
 * kein einziges `approved`. Der AFKzV hat die vorlaeufige Anwendung der Empfehlungen am
 * 13./14.03.2025 aufgehoben, die Verbreitung ist ausgesetzt.
 *
 * ⛔ DASS DER KASTEN DASTEHT, IST KEINE OPTION (Spec §5.6). Er steht auf der Modul-Startseite
 * UND auf `/lernen` ueber dem ersten Startknopf. Beide lesen DIESE Konstante; zwei Abschriften
 * liefen auseinander, und kein Tor saehe es. Der Wortlaut ist Betreibersache (§9, E2) — wer ihn
 * aendert, aendert ihn hier, einmal.
 *
 * ⛔ DARGESTELLT ALS `Alert type="warning"`, NIE `type="error"` (Falle 3):
 * `colorError === colorPrimary === #c8000f` — ein Fehlerkasten saehe aus wie eine
 * Primaeraktion, und in einem Modul, in dem Rot die Farbe einer Organisation ist, traegt Rot
 * auf einer Datenflaeche eine falsche Aussage.
 *
 * KEIN `"use client"` (Falle 6): Server Components lesen diesen Wert.
 */
export const VORBEHALT: { titel: string; text: string } = {
  titel: "Die Bedeutungen in dieser App folgen einem Entwurf, dessen fachliche Prüfung noch läuft.",
  text:
    "Zum Üben der Systematik taugt er; für eine verbindliche Auskunft gilt die " +
    "Dienstvorschrift deiner Organisation.",
};
```

`src/app/m/zeichen/(shell)/page.test.tsx`:

```tsx
// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

let sitzung: unknown = null;
vi.mock("@/core/auth", () => ({ auth: async () => sitzung }));

import { KATALOG_STAND } from "../_lib/katalog";
import { VORBEHALT } from "../_lib/vorbehalt";
import ZeichenStartPage from "./page";

beforeEach(() => {
  sitzung = { user: { groups: [] } };
});

/*
 * `renderToStaticMarkup` UND NICHT `mount` AUS `qr/_lib/test-dom.tsx` — kein zweites Harness,
 * sondern die andere der beiden Hausformen: `mount` ist fuer DOM-VERHALTEN (Eingaben, Klicks),
 * diese Seite hat keines. Vorbild `feedback/(admin)/page.test.tsx:3`. Der Nebeneffekt ist
 * erwuenscht: `next/link` braucht so keinen Router-Kontext, den wir sonst faelschen muessten.
 * Fuer strukturierte Abfragen wandert das Markup in einen losen Knoten.
 */
async function seite() {
  const html = renderToStaticMarkup(await ZeichenStartPage());
  const knoten = document.createElement("div");
  knoten.innerHTML = html;
  return { html, knoten };
}

describe("Startseite zeichen", () => {
  /*
   * FALLE 1: KEIN `Typography.Title`. Der Compound-Zugriff auf antd in einer Server Component
   * ergibt HTTP 500 — die Ueberschrift kommt deshalb aus `core/shell/Seitenkopf`, das ein
   * natives `<h1>` mit `SCHRIFT.titel` rendert.
   */
  it("traegt eine native Ueberschrift", async () => {
    const { knoten } = await seite();
    expect(knoten.querySelector("h1")?.textContent).toBe("Taktische Zeichen");
  });

  /*
   * DER VORBEHALT AUS SPEC §5.6 — der wichtigste Fall dieser Seite.
   * ⛔ `warning`, NIE `error` (Falle 3). Der Griff sitzt IM Titel des Kastens, nicht am Kasten:
   * `Alert` reicht fremde Attribute nicht zuverlaessig an seine Wurzel durch. Ueber
   * `closest(".ant-alert")` kommt man von dort an die Klassen — dieselbe Bauform wie
   * `radio/.../ImportAssistent.test.tsx:164`.
   */
  it("zeigt den fachlichen Vorbehalt als Warnung, nicht als Fehler", async () => {
    const { knoten, html } = await seite();
    const griff = knoten.querySelector('[data-testid="zeichen-vorbehalt"]');
    expect(griff, "kein Vorbehaltskasten auf der Startseite").not.toBeNull();
    expect(griff!.textContent).toBe(VORBEHALT.titel);

    const kasten = griff!.closest(".ant-alert");
    expect(kasten!.className).toContain("ant-alert-warning");
    expect(kasten!.className).not.toContain("ant-alert-error");
    expect(kasten!.textContent).toContain(VORBEHALT.text);

    // Falle 3 gilt fuer die GANZE Seite, nicht nur fuer diesen einen Kasten.
    expect(html).not.toContain("ant-alert-error");
  });

  /*
   * DER KATALOGSTAND. Ohne Erzeugungstag kann niemand beurteilen, ob das, was er sieht, aktuell
   * ist — die Begruendung steht in Spec §7.4 fuer `/offline` und gilt hier genauso, weil beide
   * Flaechen dasselbe eingecheckte Generat zeigen.
   * ⛔ DIE ERWARTUNG LEITET SICH AUS `KATALOG_STAND` AB UND IST KEINE ZWEITSCHRIFT: dass dort
   * 246 und `0.2.0` stehen, ist die Zusage von `_lib/katalog.test.ts`. Dieser Fall prueft, dass
   * die Seite die Werte ZEIGT, nicht welche es sind.
   */
  it("nennt Bestand, Stand und Version der Sammlung", async () => {
    const { knoten } = await seite();
    expect(knoten.querySelector(".ant-statistic-content")?.textContent)
      .toContain(String(KATALOG_STAND.anzahl));
    const zeile = knoten.querySelector('[data-rolle="zeichen-katalogstand"]')?.textContent ?? "";
    expect(zeile).toContain(KATALOG_STAND.erzeugtAm);
    expect(zeile).toContain(KATALOG_STAND.paket);
    expect(zeile).toContain(KATALOG_STAND.daten);
  });

  it("fuehrt in die vier Flaechen des Moduls", async () => {
    const { knoten } = await seite();
    const ziele = [...knoten.querySelectorAll("a")].map((a) => a.getAttribute("href"));
    expect(ziele).toContain("/m/zeichen/katalog");
    expect(ziele).toContain("/m/zeichen/merkliste");
    expect(ziele).toContain("/m/zeichen/baukasten");
    expect(ziele).toContain("/m/zeichen/lernen");
  });

  /*
   * DASSELBE PRAEDIKAT WIE IN DER LEISTE UND AUF DER ROUTE: `canAdminModule("zeichen")`. Ein
   * Einstieg, der fuer alle sichtbar waere, fuehrte fuer die meisten in ein 404.
   */
  it("zeigt den Verwaltungseinstieg nur mit der Modul-Admin-Gruppe", async () => {
    const ohne = await seite();
    expect(ohne.html).not.toContain("/m/zeichen/verwaltung/lernsets");

    sitzung = { user: { groups: ["iuk-zeichen-admin"] } };
    const mit = await seite();
    expect(mit.html).toContain("/m/zeichen/verwaltung/lernsets");
  });
});
```

- [ ] **Schritt 19: Fehlschlag bestätigen**

Kommando: `pnpm vitest run "src/app/m/zeichen/(shell)/page.test.tsx"`
Erwartet: FAIL — `Cannot find module './page'`.

- [ ] **Schritt 20: `(shell)/page.tsx` schreiben**

`src/app/m/zeichen/(shell)/page.tsx`:

```tsx
import { Alert, Card, Col, Row, Statistic } from "antd";
import Link from "next/link";
import { canAdminModule } from "@/core/auth/guards";
import { Seitenkopf } from "@/core/shell/Seitenkopf";
import { SCHRIFT } from "@/core/theme/schrift";
import { SPACE } from "@/core/theme/tokens";
import { KATALOG_STAND } from "../_lib/katalog";
import { VORBEHALT } from "../_lib/vorbehalt";

/**
 * DIE STARTSEITE — Vorbehalt, Katalogstand, Einstiege (Spec §2).
 *
 * ⛔ EINE SERVER COMPONENT, UND SIE BLEIBT EINE. Was hier sicher ist und was HTTP 500 ergibt,
 * ist gemessen und steht in `CLAUDE.md`:
 *   SICHER   `Card`, `Statistic`, `Result`, `Progress`, `Tag`, `Row`, `Col`, `Alert` — alles
 *            Direktexporte von `antd`. Sie sind selbst Client-Komponenten; sie AUS einer Server
 *            Component zu rendern ist erlaubt, es entsteht eine gewoehnliche Client-Referenz.
 *   HTTP 500 JEDER Compound-Zugriff: `Typography.Title`, `Descriptions.Item`, `Form.Item`,
 *            `Input.TextArea`, `List.Item` (Falle 1). Statt `Typography.Title` steht hier
 *            `core/shell/Seitenkopf` mit nativem `<h1>`.
 *   HTTP 500 jeder Import aus `@ant-design/icons` (Falle 7) — und `"use client"` behebt das
 *            nicht, es macht es still. Dieses Modul fasst das Paket nirgends an;
 *            `core/shell/icons.test.ts` riegelt das repo-weit ab.
 *   VERBOTEN antds `Table` und `Listy` (Falle 9): beide verlangen eine Funktion als Prop, und
 *            eine in einer Server Component entstandene Funktion darf die RSC-Grenze nicht
 *            ueberqueren.
 *
 * `showIcon` AN `Alert` IST KEIN VERSTOSS GEGEN FALLE 7: das Zeichen kommt aus antds eigenem
 * Bundle, im Client-Graph. Vorbild `radio/admin/(arbeit)/versionen/page.tsx:109-114`, eine
 * Server Component mit demselben Aufruf.
 *
 * `force-dynamic`, WEIL DIE SEITE DIE SITZUNG LIEST: der Verwaltungseinstieg haengt an
 * `canAdminModule`. Eine vorgerenderte Fassung zeigte allen dieselbe Karte. Vorbild
 * `aufgaben/page.tsx`.
 *
 * ⚠️ DIE VIER EINSTIEGE ZEIGEN AUF ROUTEN, DIE ES NACH DIESEM COMMIT NOCH NICHT GIBT — Katalog
 * und Merkliste kommen in Aufgabe 6, Baukasten und Meine Zeichen in Aufgabe 7, Ueben und
 * Lernsets in Aufgabe 8. Das steht im Commit-Text; eine Release-Notiz gibt es deshalb hier
 * ausdruecklich noch nicht.
 */
export const dynamic = "force-dynamic";

type Einstieg = { key: string; titel: string; href: string; text: string };

const EINSTIEGE: Einstieg[] = [
  {
    key: "katalog",
    titel: "Katalog",
    href: "/m/zeichen/katalog",
    text: "Alle Zeichen durchsuchen und nach Kapitel, Organisation und Grundform filtern.",
  },
  {
    key: "merkliste",
    titel: "Merkliste",
    href: "/m/zeichen/merkliste",
    text: "Die Zeichen, die du dir gemerkt hast — an einer Stelle.",
  },
  {
    key: "baukasten",
    titel: "Baukasten",
    href: "/m/zeichen/baukasten",
    text: "Ein Zeichen Schritt für Schritt zusammenstellen und als Bild herunterladen.",
  },
  {
    key: "lernen",
    titel: "Üben",
    href: "/m/zeichen/lernen",
    text: "Fragen zu Zeichen und Bedeutungen, in Stufen wiederholt.",
  },
];

const VERWALTUNG: Einstieg = {
  key: "lernsets",
  titel: "Lernsets",
  href: "/m/zeichen/verwaltung/lernsets",
  text: "Kuratierte Listen für das Üben anlegen und pflegen.",
};

export default async function ZeichenStartPage() {
  const darfVerwalten = await canAdminModule("zeichen");
  const einstiege = darfVerwalten ? [...EINSTIEGE, VERWALTUNG] : EINSTIEGE;

  return (
    <>
      <Seitenkopf
        titel="Taktische Zeichen"
        beschreibung="Nachschlagen, selbst zusammenstellen und üben."
      />

      {/*
        ⛔ `type="warning"`, NIE `type="error"` (Falle 3). Der Griff sitzt im Titel und nicht am
        Kasten, weil `Alert` fremde Attribute nicht zuverlaessig an seine Wurzel durchreicht —
        Vorbild `radio/.../versionen/page.tsx:112`.
      */}
      <Alert
        type="warning"
        showIcon
        title={<span data-testid="zeichen-vorbehalt">{VORBEHALT.titel}</span>}
        description={VORBEHALT.text}
        style={{ marginBlockEnd: SPACE.xl }}
      />

      <Card style={{ marginBlockEnd: SPACE.xl }}>
        <Statistic title="Zeichen in der Sammlung" value={KATALOG_STAND.anzahl} />
        <p
          data-rolle="zeichen-katalogstand"
          style={{ ...SCHRIFT.neben, margin: 0, marginBlockStart: SPACE.sm }}
        >
          Stand {KATALOG_STAND.erzeugtAm} · Zeichensatz {KATALOG_STAND.paket} · Daten{" "}
          {KATALOG_STAND.daten}
        </p>
      </Card>

      {/*
        `Link` UM DIE `Card` UND KEIN `onClick` AUF IHR: ein Handler waere eine Funktion ueber
        die RSC-Grenze (Falle 9) und kostete eine Insel, die diese Flaeche sonst nicht braucht.
        Vorbild `radio/admin/(arbeit)/page.tsx`.
        `color: "inherit"` AM LINK: ohne ihn faerbte `colorLink` den ganzen Kartentext in
        Suite-Rot — und Rot traegt in diesem Modul fachliche Bedeutung (Falle 3).
      */}
      <Row gutter={[SPACE.lg, SPACE.lg]}>
        {einstiege.map((e) => (
          <Col key={e.key} xs={24} sm={12} xl={8}>
            <Link href={e.href} style={{ display: "block", height: "100%", color: "inherit" }}>
              <Card hoverable title={e.titel} style={{ height: "100%" }}>
                <span style={SCHRIFT.text}>{e.text}</span>
              </Card>
            </Link>
          </Col>
        ))}
      </Row>
    </>
  );
}
```

- [ ] **Schritt 21: Grün sehen**

Kommando: `pnpm vitest run src/app/m/zeichen "src/app/m/zeichen/(shell)"`
Erwartet: PASS — Registry-Test (Aufgabe 1), Katalog-/Naht-/Kanon-/Faltungstests (Aufgabe 2),
Migrationstest (Aufgabe 3), `nav.test.ts`, `layout.test.tsx`, `(shell)/layout.test.tsx`,
`(shell)/page.test.tsx`.

- [ ] **Schritt 22: Die Gates laufen lassen**

Kommando: `pnpm typecheck && pnpm lint && pnpm vitest run && pnpm build`
Erwartet: alle vier grün. `bootstrap.test.ts` und `seed-lokal.test.ts` sind seit den Aufgaben 3
und 4 wieder grün — ein roter Test ist ab hier ein echter Fehler. `pnpm build` ist der erste
Lauf, in dem der `next/font/local`-Aufruf samt der eckigen Klammern im Dateinamen wirklich
aufgelöst wird; bricht er dort, gilt die Umbenennung aus dem Kopfkommentar von `layout.tsx`.

- [ ] **Schritt 23: Handlauf im Browser — der einzige Weg, die RSC-Fallen zu sehen**

`typecheck`, `lint`, Vitest und `build` sehen die Fallen 1, 6 und 9 **strukturell nicht**
(`CLAUDE.md`: `build` prüft Modulgrenzen statisch, nicht die Serialisierung eines Requests; in
Vitest ist `"use client"` ein wirkungsloser String; jsdom hat gar keine RSC-Grenze). Dies hier
ist der erste renderbare Bildschirm des Moduls — der Abruf gehört deshalb in **diesen** Commit
und nicht erst in den nächsten.

```bash
pnpm dev
```

1. Ohne Sitzung, in einer zweiten Schale:
   `curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/m/zeichen`
   Erwartet: `307` — das generische Middleware-Gate greift (`requiresAuth: true`). Das belegt
   den Riegel und **ersetzt den Browser-Abruf nicht**.
2. Im Browser `http://localhost:3000/login?callbackUrl=%2Fm%2Fzeichen` öffnen, `email` =
   `dev@localtest.me`, `groups` leer lassen, „Dev-Login" klicken.
   Erwartet: HTTP 200 auf `/m/zeichen` mit Überschrift „Taktische Zeichen", dem gelben
   Vorbehaltskasten (**nicht rot** — ein roter Kasten heißt, dass `type="error"` gesetzt wurde),
   der Karte „Zeichen in der Sammlung" mit 246 und der Standzeile, vier Einstiegskarten und
   einer Seitenleiste mit **fünf** Einträgen ohne Überschrift „Verwaltung".
   Ein HTTP 500 statt der Seite ist Falle 1, 6 oder 9; die Fehlermeldung nennt die Datei.
3. Abmelden, dann derselbe Weg mit `groups` = `iuk-zeichen-admin`.
   Erwartet: **sechs** Einträge in der Leiste, „Lernsets" unter der Überschrift „Verwaltung",
   und eine fünfte Einstiegskarte auf der Startseite.
4. In den Entwicklerwerkzeugen die Netzwerkliste ansehen.
   Erwartet: `/manifest.webmanifest` mit **404** — der Route Handler kommt in Aufgabe 9, und auf
   dem Suite-Host bleibt der Pfad ohnehin beim Portal. Kein Fehler, sondern der angekündigte
   Zwischenstand.
5. Die Schriftauflösung ist an dieser Stelle noch **nicht** prüfbar: die Regel, die
   `--tz-zeichenschrift` liest, entsteht in Aufgabe 6, und vorher zeigt keine Fläche ein SVG mit
   Text. Was hier geprüft werden kann, ist die Auslieferung — im Netzwerkfilter „Font": eine
   Datei unter `/_next/static/media/` mit `200`.

- [ ] **Schritt 24: Commit**

```bash
git add src/app/m/zeichen/layout.tsx src/app/m/zeichen/layout.test.tsx \
        "src/app/m/zeichen/(shell)/layout.tsx" "src/app/m/zeichen/(shell)/layout.test.tsx" \
        "src/app/m/zeichen/(shell)/page.tsx" "src/app/m/zeichen/(shell)/page.test.tsx" \
        src/app/m/zeichen/_lib/nav.ts src/app/m/zeichen/_lib/nav.test.ts \
        src/app/m/zeichen/_lib/vorbehalt.ts \
        src/core/shell/types.ts src/core/shell/navIkonen.tsx src/core/shell/navIkonen.test.tsx
git commit -m "feat(zeichen): Huelle — Layouts, Navigation, fuenf Nav-Zeichen, Startseite

Modul-Layout mit dem Manifest-Verweis von Hand (crossOrigin=use-credentials,
im Repo bisher nirgends verwendet) und der Arimo-Klasse am div um children.
Nexts metadata.manifest kann das Attribut nicht ausdruecken (Typ
null|string|URL); ohne es holte der Browser das Manifest ohne Cookies und
bekaeme bei requiresAuth: true Login-HTML.

Die Arimo-Klasse haengt an diesem Layout und nicht an (shell): es ist der
einzige gemeinsame Vorfahre beider Routengruppen, und die rahmenlose Gruppe
aus Commit 9 zeigt denselben Katalog.

ZEICHEN_NAV mit sechs Eintraegen, ohne Wurzel-Eintrag (der waere in
aktiverEintrag der Rueckfall und markierte jede nicht zugeordnete Seite).
Innere Pfadform /m/zeichen/... statt der aeusseren wie bei lagerbuch/radio/uav:
das Modul muss bis zum Cutover unter dem Suite-Host UND danach unter
SUITE_HOST_ZEICHEN tragen, und /katalog fuehrte auf dem Suite-Host ins Portal.
Der Verwaltungseintrag haengt an canAdminModule('zeichen') — demselben
Praedikat, das die Route gatet.

Fuenf neue Namen in NavIkonName und NAV_IKONEN: zeichensuche, merkliste,
baukasten, ueben, lernsets. Kein geliehener Name — 'katalog' ist von uav
belegt und heisst dort etwas anderes. navIkonen.test.tsx liest jetzt auch
ZEICHEN_NAV; ohne diese Handerweiterung wird der Test fuer dieses Modul nie
rot.

Startseite als Server Component: nativer Seitenkopf statt Typography.Title
(Falle 1), Alert type=warning und nie type=error fuer den fachlichen Vorbehalt
(Falle 3 — colorError ist Suite-Rot), Katalogstand aus KATALOG_STAND, Link um
Card statt onClick (Falle 9). Kein @ant-design/icons im Modul (Falle 7).

Die Einstiege zeigen auf Routen, die die Commits 6 bis 8 anlegen; bis dahin
ist das Modul absichtlich nur die Huelle. /manifest.webmanifest antwortet bis
Commit 9 mit 404 — der Route Handler kommt dort.

Keine Release-Notiz: die vier Notizen haengen an den Commits 6, 7, 8 und 9."
```

---

## Aufgabe 6: Katalog — Insel mit Suche, Detailseite als Server Component, Merkliste

Setzt Spec §2 (Routen und Flächen), §3.2 (die Naht als einziger Suchpfad), §4.2 (Merkliste,
Anzeigequelle), §4.6 Stufe 2 (was passiert, wenn eine ID verschwindet) und §10 Commit 6 um.

**Dateien:**
- Neu: `src/app/m/zeichen/_lib/merkliste.ts`
- Neu: `src/app/m/zeichen/actions.ts`
- Neu: `src/app/m/zeichen/_ui/zeichen.module.css`
- Neu: `src/app/m/zeichen/_ui/KatalogInsel.tsx`
- Neu: `src/app/m/zeichen/_ui/MerklisteZeilen.tsx`
- Neu: `src/app/m/zeichen/(shell)/katalog/page.tsx`
- Neu: `src/app/m/zeichen/(shell)/katalog/[id]/page.tsx`
- Neu: `src/app/m/zeichen/(shell)/merkliste/page.tsx`
- Neu: `src/app/m/portal/_lib/neuigkeiten/notizen/zeichen/2026-09-02-taktische-zeichen-nachschlagen.ts`
- Ändern: `src/app/m/portal/_lib/neuigkeiten/register.ts` (eine Import- und eine Listenzeile)
- Test: `_lib/merkliste.test.ts` · `actions.test.ts` · `_ui/KatalogInsel.test.tsx` ·
  `_ui/MerklisteZeilen.test.tsx`

**Schnittstellen:**

- **Nutzt:**
  - Aufgabe 2, `_lib/katalog.ts`: `sucheZeichen(f: Filter)`, `findeZeichen(id)`, `svgFuer(id)`,
    `alleZeichen()`, `kapitelListe()`, `organisationen()`, `grundformen()`, `KATALOG_STAND`,
    `type Zeichen`, `type ZeichenId`.
  - Aufgabe 3, `_db/client.ts`: `getDb()`; `_db/schema.ts`: Tabelle `merkliste`
    (`sub`, `zeichenId`, `titelSchnappschuss`, `erstelltAm`, PK `(sub, zeichenId)`).
  - Aufgabe 4, `_lib/seedLokal.ts`: die drei Merkzeilen für `dev:demo@localtest.me` — ohne sie
    zeigt der Abruf in Schritt 20 eine leere Merkliste und beweist die halbe Fläche nicht.
  - Aufgabe 5, `(shell)/layout.tsx`: `<Shell variant="full" moduleKey="zeichen" nav={zeichenNav(await canAdminModule("zeichen"))}>`.
    Die drei Seiten hier bringen **keine** eigene Hülle mit.
  - `@/core/auth` → `auth()` · `@/core/shell/Seitenkopf` → `Seitenkopf` ·
    `@/core/theme/schrift` → `SCHRIFT` · `@/core/theme/tokens` → `SPACE` ·
    `@/core/bootstrap` → `migrateAllModules()` (nur im Action-Test) ·
    `src/app/m/qr/_lib/test-dom.tsx` → `mount`/`unmount`/`query`/`queryAll`/`exists`/`fill`/`click`.
- **Liefert:**
  - `_lib/merkliste.ts`: `VERWAIST_TEXT`, `interface MerkZeile`, `interface MerkAnzeige`,
    `merkAnzeige(zeilen: readonly MerkZeile[]): MerkAnzeige[]` — **kein `"use client"`**.
  - `actions.ts`: `merkeZeichen(zeichenId: string): Promise<void>` und
    `entferneZeichen(zeichenId: string): Promise<void>`.
  - `_ui/KatalogInsel.tsx`: `KatalogInsel({ offline?: boolean; gemerkt?: readonly ZeichenId[] })`
    — **Aufgabe 9 rendert dieselbe Komponente auf `/offline` mit `offline`**.
  - `_ui/MerklisteZeilen.tsx`: `MerklisteZeilen({ zeilen: readonly MerkAnzeige[] })`.
  - `_ui/zeichen.module.css` mit den `--tz-*`-Variablen — **Aufgabe 7 und 9 erweitern diese Datei,
    sie legen sie nicht neu an.**
  - Die Routen `/m/zeichen/katalog`, `/m/zeichen/katalog/[id]`, `/m/zeichen/merkliste`.
  - Das Verzeichnis `notizen/zeichen/`; die Notizen der Aufgaben 7, 8 und 9 kommen daneben.

> **Drei Festlegungen dieser Aufgabe, die man sonst beim nächsten Umbau wegoptimiert:**
>
> 1. **Server und Client rufen DIESELBE `sucheZeichen()` auf demselben Generat auf.** Deshalb
>    liegt die Filterfunktion in `_lib/` **ohne** `"use client"`, und deshalb hydriert die Insel
>    ohne Mismatch (Spec §1 Punkt 4, §2). Wer die Suche in die Insel kopiert, hat zwei Codepfade
>    für dieselbe Frage — und der Unterschied zeigt sich als Hydrationsfehler, nicht als Testfehler.
> 2. **Die Merkliste-Anzeige nimmt IMMER das Generat als Quelle, `titelSchnappschuss` nur als
>    Rückfall** (Spec §4.2). Ohne diese Regel laufen zwei Fassungen desselben Titels bei jeder
>    Katalogkorrektur auseinander, und niemand weiß, welche stimmt.
> 3. **Eine Merkzeile ohne Auflösung bleibt SICHTBAR** — mit dem Schnappschuss, dem Satz aus
>    Spec §4.6 Stufe 2 und einem funktionierenden Entfernen-Knopf. **Nie automatisch löschen:**
>    der Katalog könnte die ID zurückbringen, und ein stiller Verlust ist schlimmer als eine
>    Zeile, die etwas erklärt.

---

- [ ] **Schritt 1: Den fehlschlagenden Test für die Merklisten-Auflösung schreiben**

`src/app/m/zeichen/_lib/merkliste.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { findeZeichen } from "./katalog";
import { merkAnzeige, VERWAIST_TEXT } from "./merkliste";

/*
 * `rezept:C.1.1` ist eine ANKER-ID (siehe `_lib/katalog.test.ts` und
 * `_lib/seedLokal.ts`). Faellt sie weg, wird zuerst die Bestandszusicherung aus
 * Aufgabe 2 rot — dieser Wurf hier nennt nur den Zusammenhang, damit niemand
 * lange sucht.
 */
const BEISPIEL = findeZeichen("rezept:C.1.1");
if (BEISPIEL === null) {
  throw new Error("Anker rezept:C.1.1 fehlt im Generat — _lib/katalog.test.ts sagt, warum");
}

describe("merkAnzeige — das Generat gewinnt, der Schnappschuss traegt den Rest", () => {
  /*
   * SPEC §4.2. Ohne diese Richtung laufen zwei Fassungen desselben Titels bei
   * jeder Katalogkorrektur auseinander, und niemand weiss, welche stimmt: die
   * Datenbank haelt den Stand des Merkens, das Generat den von heute.
   */
  it("nimmt Titel, Bedeutung und Bild aus dem Generat, nicht aus dem Schnappschuss", () => {
    const [zeile] = merkAnzeige([
      { zeichenId: BEISPIEL.id, titelSchnappschuss: "Alter Name von gestern" },
    ]);
    expect(zeile?.titel).toBe(BEISPIEL.titel);
    expect(zeile?.titel).not.toBe("Alter Name von gestern");
    expect(zeile?.bedeutung).toBe(BEISPIEL.bedeutung);
    expect(zeile?.svg).toBe(BEISPIEL.svg);
    expect(zeile?.verwaist).toBe(false);
  });

  /*
   * SPEC §4.6 STUFE 2 — DER FALL, DER DIESE FUNKTION UEBERHAUPT RECHTFERTIGT.
   * Eine Merkzeile zeigt auf eine Katalog-ID, und es gibt keine dokumentierte
   * ID-Stabilitaetszusage des Pakets (Praezedenzfall: ein Commit entfernte acht
   * comms.*-IDs ersatzlos). Die Zeile wird deshalb NICHT geloescht — sie bleibt
   * sichtbar, traegt ihren Schnappschuss und sagt, was los ist.
   */
  it("behaelt eine nicht mehr aufloesbare Zeile mit ihrem Schnappschuss", () => {
    const [zeile] = merkAnzeige([
      { zeichenId: "rezept:GIBTSNICHT", titelSchnappschuss: "Bergungsgruppe" },
    ]);
    expect(zeile?.titel).toBe("Bergungsgruppe");
    expect(zeile?.verwaist).toBe(true);
    expect(zeile?.svg).toBeNull();
    expect(zeile?.bedeutung).toBeNull();
  });

  it("wirft nichts weg — zwei Zeilen gehen als zwei Zeilen wieder heraus", () => {
    const aus = merkAnzeige([
      { zeichenId: BEISPIEL.id, titelSchnappschuss: BEISPIEL.titel },
      { zeichenId: "rezept:GIBTSNICHT", titelSchnappschuss: "Bergungsgruppe" },
    ]);
    expect(aus).toHaveLength(2);
    expect(aus.map((z) => z.verwaist)).toEqual([false, true]);
  });

  /* Der Satz steht auf dem Bildschirm einer Helferin — keine ID, kein Dateiname. */
  it("der Satz fuer eine verwaiste Zeile ist fuer Anwender geschrieben", () => {
    expect(VERWAIST_TEXT).not.toMatch(/rezept:|grund:|\.ts\b|\.json\b|undefined/);
    expect(VERWAIST_TEXT.length).toBeGreaterThan(10);
  });
});
```

- [ ] **Schritt 2: Test laufen lassen und Fehlschlag bestätigen**

Kommando: `pnpm vitest run src/app/m/zeichen/_lib/merkliste.test.ts`
Erwartet: FAIL — `Failed to resolve import "./merkliste"`.

- [ ] **Schritt 3: Die Auflösung schreiben**

`src/app/m/zeichen/_lib/merkliste.ts` — **kein `"use client"`**, die Datei wird von einer Server
Component (`(shell)/merkliste/page.tsx`) gelesen (Falle 6):

```ts
import { findeZeichen, type ZeichenId } from "./katalog";

/**
 * Der Satz fuer eine Merkzeile, deren Zeichen der Katalog nicht mehr fuehrt
 * (Spec §4.6 Stufe 2). EINE Quelle fuer Oberflaeche und Test — stuende er in
 * beiden, aenderte jemand eines Tages nur eine der zwei Stellen, und der Test
 * bewiese danach die alte Fassung.
 */
export const VERWAIST_TEXT = "Dieses Zeichen fuehrt der Katalog nicht mehr.";

/** So kommt eine Zeile aus der Tabelle `merkliste` — mehr braucht die Anzeige nicht. */
export interface MerkZeile {
  zeichenId: string;
  titelSchnappschuss: string;
}

/** Die fertig aufgeloeste Zeile. Ausschliesslich serialisierbare Felder (Falle 9). */
export interface MerkAnzeige {
  zeichenId: ZeichenId;
  titel: string;
  bedeutung: string | null;
  svg: string | null;
  verwaist: boolean;
}

/**
 * DIE EINE AUFLOESUNGSSTELLE DER MERKLISTE.
 *
 * ⛔ DIE ANZEIGEQUELLE IST IMMER DAS GENERAT, DER SCHNAPPSCHUSS IST DER RUECKFALL
 * (Spec §4.2). Loest `findeZeichen(id)` auf, gewinnt der heutige Titel; sonst der
 * Schnappschuss. Umgekehrt herum — Schnappschuss zuerst — zeigte die Merkliste
 * dauerhaft den Stand vom Tag des Merkens, waehrend die Detailseite denselben
 * Zeichen anders benennt. Zwei Wahrheiten ueber eine Sache, und keine davon
 * erkennbar falsch.
 *
 * ⛔ HIER WIRD NICHTS GELOESCHT. Eine nicht aufloesbare Zeile bekommt
 * `verwaist: true` und behaelt ihren Schnappschuss. Es gibt keine dokumentierte
 * ID-Stabilitaetszusage des Pakets, und der Katalog kann eine ID auch
 * ZURUECKBRINGEN — ein automatisches Aufraeumen waere eine Vermutung ueber fremde
 * Absicht mit unumkehrbarer Folge (Spec §4.6 Stufe 3).
 */
export function merkAnzeige(zeilen: readonly MerkZeile[]): MerkAnzeige[] {
  return zeilen.map((zeile) => {
    const zeichen = findeZeichen(zeile.zeichenId);
    if (zeichen === null) {
      return {
        zeichenId: zeile.zeichenId,
        titel: zeile.titelSchnappschuss,
        bedeutung: null,
        svg: null,
        verwaist: true,
      };
    }
    return {
      zeichenId: zeichen.id,
      titel: zeichen.titel,
      bedeutung: zeichen.bedeutung,
      svg: zeichen.svg,
      verwaist: false,
    };
  });
}
```

- [ ] **Schritt 4: Test laufen lassen und grün sehen**

Kommando: `pnpm vitest run src/app/m/zeichen/_lib/merkliste.test.ts`
Erwartet: PASS, vier Tests.

---

- [ ] **Schritt 5: Den fehlschlagenden Test für die beiden Server Actions schreiben**

`src/app/m/zeichen/actions.test.ts` — Vorbild `src/app/m/uav/_actions/katalog.test.ts`: echte
Datenbank in einem eigenen `DATA_DIR`, gemockt werden nur `@/core/auth` und `next/cache`.

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";
import { rmSync } from "node:fs";
import { and, eq } from "drizzle-orm";
import { migrateAllModules } from "@/core/bootstrap";

/*
 * ECHTE DATENBANK, GEMOCKTE SITZUNG (Vorbild uav/_actions/katalog.test.ts). Eine
 * gemockte `getDb()` bewiese ueber die PK (sub, zeichenId) und ueber
 * `onConflictDoNothing()` nichts — genau die beiden entscheiden hier, ob ein
 * zweites Merken eine zweite Zeile anlegt.
 *
 * `next/cache` muss gemockt werden: `revalidatePath` ausserhalb eines Requests
 * wirft, und die Auffrischung ist nicht der Pruefgegenstand.
 */
const DIR = "./.data/zeichen-actions-test";
let angemeldet: string | null = null;

vi.mock("@/core/auth", () => ({
  auth: async () => (angemeldet === null ? null : { user: { id: angemeldet } }),
}));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));

const ANNA = "dev:anna@localtest.me";
const BERT = "dev:bert@localtest.me";
const ANKER = "rezept:C.1.1";

beforeEach(() => {
  rmSync(DIR, { recursive: true, force: true });
  process.env.DATA_DIR = DIR;
  delete (globalThis as { __suiteDb?: unknown }).__suiteDb;
  migrateAllModules();
  angemeldet = ANNA;
});

async function merkzeilen(sub: string) {
  const { getDb } = await import("./_db/client");
  const { merkliste } = await import("./_db/schema");
  return getDb().select().from(merkliste).where(eq(merkliste.sub, sub)).all();
}

describe("merkeZeichen", () => {
  it("legt eine Zeile mit dem HEUTIGEN Titel als Schnappschuss an", async () => {
    const { merkeZeichen } = await import("./actions");
    const { findeZeichen } = await import("./_lib/katalog");
    await merkeZeichen(ANKER);
    const zeilen = await merkzeilen(ANNA);
    expect(zeilen).toHaveLength(1);
    expect(zeilen[0]?.zeichenId).toBe(ANKER);
    expect(zeilen[0]?.titelSchnappschuss).toBe(findeZeichen(ANKER)?.titel);
  });

  /* PK (sub, zeichenId) + onConflictDoNothing: zweimal merken ist EIN Merken. */
  it("legt beim zweiten Mal keine zweite Zeile an", async () => {
    const { merkeZeichen } = await import("./actions");
    await merkeZeichen(ANKER);
    await merkeZeichen(ANKER);
    expect(await merkzeilen(ANNA)).toHaveLength(1);
  });

  /*
   * `findeZeichen` WIRFT NIE, und diese Action tut es ihm gleich: eine unbekannte
   * ID kann aus einem alten Lesezeichen oder einem manipulierten Aufruf kommen.
   * Sie ist kein Angriff und kein Feldfehler — es gibt schlicht nichts zu merken.
   */
  it("merkt nichts, was der Katalog nicht kennt — und wirft dabei nicht", async () => {
    const { merkeZeichen } = await import("./actions");
    await expect(merkeZeichen("rezept:GIBTSNICHT")).resolves.toBeUndefined();
    expect(await merkzeilen(ANNA)).toHaveLength(0);
  });

  it("wirft ohne Sitzung, BEVOR etwas geschrieben wurde", async () => {
    angemeldet = null;
    const { merkeZeichen } = await import("./actions");
    await expect(merkeZeichen(ANKER)).rejects.toThrow("Forbidden");
    expect(await merkzeilen(ANNA)).toHaveLength(0);
  });
});

describe("entferneZeichen", () => {
  /*
   * DER WICHTIGSTE FALL DIESER DATEI. Spec §4.6 Stufe 2 sagt zu, dass eine
   * verwaiste Merkzeile SICHTBAR bleibt UND einen Entfernen-Knopf traegt. Wuerde
   * diese Action wie `merkeZeichen` gegen den Katalog pruefen, waere genau diese
   * Zeile die einzige, die man NICHT loswird — der Knopf staende da und taete
   * nichts, still.
   */
  it("entfernt auch eine Zeile, deren Zeichen der Katalog nicht mehr fuehrt", async () => {
    const { getDb } = await import("./_db/client");
    const { merkliste } = await import("./_db/schema");
    getDb()
      .insert(merkliste)
      .values({ sub: ANNA, zeichenId: "rezept:GIBTSNICHT", titelSchnappschuss: "Bergungsgruppe" })
      .run();
    const { entferneZeichen } = await import("./actions");
    await entferneZeichen("rezept:GIBTSNICHT");
    expect(await merkzeilen(ANNA)).toHaveLength(0);
  });

  /*
   * IDOR: der `sub` kommt aus `auth()`, NIE aus einem Argument. Beide Personen
   * haben dieselbe zeichenId gemerkt; entfernt werden darf genau eine Zeile.
   */
  it("raeumt nur die eigene Zeile, nicht die einer anderen Person", async () => {
    const { merkeZeichen, entferneZeichen } = await import("./actions");
    await merkeZeichen(ANKER);
    angemeldet = BERT;
    await merkeZeichen(ANKER);
    await entferneZeichen(ANKER);
    expect(await merkzeilen(BERT)).toHaveLength(0);
    expect(await merkzeilen(ANNA)).toHaveLength(1);
  });

  it("wirft ohne Sitzung", async () => {
    angemeldet = null;
    const { entferneZeichen } = await import("./actions");
    await expect(entferneZeichen(ANKER)).rejects.toThrow("Forbidden");
  });
});
```

- [ ] **Schritt 6: Test laufen lassen und Fehlschlag bestätigen**

Kommando: `pnpm vitest run src/app/m/zeichen/actions.test.ts`
Erwartet: FAIL — `Failed to resolve import "./actions"`.

- [ ] **Schritt 7: Die beiden Server Actions schreiben**

`src/app/m/zeichen/actions.ts`:

```ts
"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { auth } from "@/core/auth";
import { getDb } from "./_db/client";
import { merkliste } from "./_db/schema";
import { findeZeichen } from "./_lib/katalog";

/*
 * DIE ZWEI ACTIONS DES KATALOGS. Beide werden von Client-Inseln DIREKT
 * IMPORTIERT, nie als Prop durchgereicht — Server Actions sind die einzigen
 * Funktionen, die die RSC-Grenze ueberqueren duerfen (Falle 9).
 *
 * ⛔ DER `sub` KOMMT AUS `auth()`, NIE AUS EINEM ARGUMENT. Sonst waere die
 * Merkliste jeder anderen Person mit einer erratenen Kennung zu leeren (IDOR).
 *
 * DER TYP LUEGT: `@auth/core` baut `session.user` OHNE `id`
 * (`lib/actions/session.js`), waehrend `core/auth/config.ts` den Pocket-ID-`sub`
 * im jwt-Callback aktiv zurueckholt. TypeScript sieht die Luecke nicht — deshalb
 * prueft jede Stelle explizit. In einer Server Action heisst das WERFEN: eine
 * Action, die unerlaubt aufgerufen wird, darf nicht „nichts tun und aussehen wie
 * Erfolg".
 */

const ZEICHEN_WURZEL = "/m/zeichen";

/**
 * EIN Aufruf mit `"layout"` (Vorbild `feedback/actions.ts`, `aufgaben/actions.ts`):
 * die Merkzahl steht auf `/katalog`, `/katalog/[id]` UND `/merkliste`. Ohne
 * `"layout"` bliebe die jeweils andere Fläche auf dem alten Stand.
 */
function revalidate(): void {
  revalidatePath(ZEICHEN_WURZEL, "layout");
}

async function eigenerSub(): Promise<string> {
  const sub = (await auth())?.user?.id;
  if (!sub) throw new Error("Forbidden");
  return sub;
}

/**
 * Ein Zeichen auf die eigene Merkliste legen.
 *
 * Der `titelSchnappschuss` wird HIER aus dem Generat genommen und nicht vom
 * Client geliefert: der Client koennte jeden Text schicken, und der Schnappschuss
 * ist genau die Angabe, die spaeter trotz verschwundener ID noch etwas taugt
 * (Spec §4.2).
 *
 * Eine unbekannte ID ist ein ZUSTAND, kein Fehler (`findeZeichen` wirft nie): es
 * gibt nichts zu merken, also passiert nichts. Ein Wurf schickte ein altes
 * Lesezeichen auf die technische Fehlerseite.
 */
export async function merkeZeichen(zeichenId: string): Promise<void> {
  const sub = await eigenerSub();
  const zeichen = findeZeichen(zeichenId);
  if (zeichen === null) return;

  getDb()
    .insert(merkliste)
    .values({ sub, zeichenId: zeichen.id, titelSchnappschuss: zeichen.titel })
    .onConflictDoNothing()
    .run();
  revalidate();
}

/**
 * Ein Zeichen von der eigenen Merkliste nehmen.
 *
 * ⛔ HIER WIRD BEWUSST NICHT GEGEN DEN KATALOG GEPRUEFT. Spec §4.6 Stufe 2 sagt
 * zu, dass eine Merkzeile ohne Aufloesung SICHTBAR bleibt und einen
 * Entfernen-Knopf traegt. Mit einer `findeZeichen`-Huerde waere ausgerechnet
 * diese Zeile die einzige, die niemand mehr loswird — der Knopf stuende da und
 * taete nichts, ohne Meldung.
 */
export async function entferneZeichen(zeichenId: string): Promise<void> {
  const sub = await eigenerSub();
  getDb()
    .delete(merkliste)
    .where(and(eq(merkliste.sub, sub), eq(merkliste.zeichenId, zeichenId)))
    .run();
  revalidate();
}
```

- [ ] **Schritt 8: Test laufen lassen und grün sehen**

Kommando: `pnpm vitest run src/app/m/zeichen/actions.test.ts`
Erwartet: PASS, sieben Tests.

---

- [ ] **Schritt 9: Die Trägerfläche — `_ui/zeichen.module.css`**

Diese Datei ist kein Testgegenstand (jsdom rechnet keine Kaskade, Falle 5/8), aber jede
Entscheidung darin ist begründet und wird von den Aufgaben 7 und 9 **erweitert, nicht ersetzt**.

`src/app/m/zeichen/_ui/zeichen.module.css`:

```css
/*
 * Modul-CSS von `zeichen`. `.modul` ist der Traeger aller --tz-*-Variablen.
 *
 * WARUM EIGENE VARIABLEN UND NICHT --ant-*: antd deklariert seine Variablen auf
 * SEINER Scope-Klasse, nicht an `:root`. Eigenes Markup ausserhalb eines
 * antd-Komponentenbaums sieht sie NICHT, und der Fehler ist still — die Linie
 * verschwindet einfach (Falle 2).
 *
 * WARUM :root[data-theme="dark"] UND NICHT prefers-color-scheme: der Umschalter
 * der Suite hat DREI Zustaende (auto|light|dark, zwei Cookies). Auf die
 * Medienabfrage zu selektieren bricht den Fall „System dunkel, Umschalter hell".
 *
 * KEINE MEDIENABFRAGE UND KEINE ANIMATION. Das Raster regelt seine Spalten ueber
 * `auto-fill`, und diese Datei fuehrt keinen `transition` — wo nichts sich
 * bewegt, gibt es nichts zu reduzieren. Wer hier spaeter einen Hover-Effekt
 * ergaenzt, schuldet in derselben Aenderung die
 * `prefers-reduced-motion`-Ausnahme.
 *
 * KEINE `font-size`-REGEL AN EIGENEN FELDERN, UND DAS IST FALLE 5 IN IHRER
 * DRITTEN AUSPRAEGUNG („eigene Regel zu stark"): `app/globals.css` setzt
 * `input, textarea, select { font-size: 16px }` mit BEWUSST niedriger
 * Spezifitaet (0,0,1) als Untergrenze. Eine Klasse `.eingabe` (0,1,0) schlaegt
 * sie — eine `font-size` hier unterliefe die Untergrenze, ohne dass ein Tor rot
 * wird. `core/theme/feldschrift.test.ts` bewacht die andere Richtung, nicht
 * diese.
 */
.modul {
  /*
   * ⛔ --tz-blatt BLEIBT IN BEIDEN ZWEIGEN #ffffff. Gemessen haben alle drei
   * RENDER_THEMES des Pakets `surface: '#ffffff'`, und `renderSvg` malt keinen
   * Hintergrund: jedes Zeichen liegt auf einer hellen PLATTE, nie auf einem
   * umgefaerbten Theme. Die Organisationsfarben sind fachlich festgelegt — ein
   * im Dunkelmodus aufgehelltes DRK-Rot waere eine falsche Auskunft, kein
   * Stilfehler. Wer --tz-blatt mit --tz-feld zusammenlegt, kippt entweder die
   * Eingabefelder auf Weiss oder die Zeichen auf Dunkelgrau.
   */
  --tz-blatt: #ffffff;
  --tz-feld: #ffffff;
  --tz-tinte: #1a1d20;
  --tz-stahl: #5b6570;
  --tz-linie: #d9dde1;
  /* Der Ton fuer Hinweise am Feld und die technische Abweichungsnotiz. NIE Rot:
     colorError === colorPrimary === #c8000f, ein roter Streifen an einer
     Datenflaeche sieht aus wie eine Primaeraktion (Falle 3). */
  --tz-hinweis: #b26a00;
  /*
   * Arimo aus `next/font/local` (Aufgabe 2/5). Gemessen tragen 160 von 242
   * Rezepten `<text font-family="Arimo">`, und die Textgeometrie ist gegen Arimo
   * vermessen — ohne die Schrift laufen „KatSL", „UEMANV-S" und „MLW IV Lbw" aus
   * ihren Boxen. Der Rueckfall steht hier, weil ein nicht gesetzter Variablenname
   * die ganze Deklaration ungueltig machen wuerde.
   */
  /* --tz-zeichenschrift wird NICHT hier deklariert: next/font/local setzt sie in
     layout.tsx (Aufgabe 5) auf dem gemeinsamen Vorfahren BEIDER Routengruppen. Eine
     Neudeklaration hier laege naeher am Element, ueberschriebe den geladenen Wert und
     wuerfe Arimo still weg — genau der Ausfall, gegen den Handlauf H2 steht. */
}

:root[data-theme="dark"] .modul {
  --tz-feld: #1f1f1f;
  --tz-tinte: #e6e6e6;
  --tz-stahl: #9aa4ae;
  --tz-linie: #303030;
  --tz-hinweis: #d9a441;
}

/*
 * DIE EINE REGEL, DIE DAS PRAESENTATIONSATTRIBUT SCHLAEGT. `renderSvg` schreibt
 * `font-family="Arimo"` als ATTRIBUT ins SVG; ein Attribut hat Spezifitaet 0, jede
 * CSS-Regel gewinnt. Nicht gemessen, argumentativ sicher — H2 aus Spec §9 ist der
 * Handlauf im echten Browser, jsdom rechnet keine Glyphen.
 */
.zeichenflaeche svg text,
.zeichengross svg text {
  font-family: var(--tz-zeichenschrift);
}

/*
 * Das erzeugte SVG bringt nur eine viewBox mit, keine Breite/Hoehe — ohne die
 * explizite Groesse faellt es auf die Ersatzgroesse des Browsers (300x150)
 * zurueck statt seine Box zu fuellen. Dieselbe Regel, die `qr/QrDisplay.tsx` fuer
 * denselben Grund braucht.
 */
.zeichenflaeche > svg,
.zeichengross > svg {
  display: block;
  width: 100%;
  height: auto;
}

.suchzeile {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  align-items: flex-end;
  margin-block-end: 16px;
}

.feld {
  display: flex;
  flex: 1 1 200px;
  flex-direction: column;
  gap: 4px;
  min-width: 200px;
}

/* 44 als LITERAL: ARBEITSDICHTE setzt `controlHeight: 44` als antd-Token, und
   ein rohes <input>/<select> ausserhalb jeder antd-Steuerung erbt es nicht. */
.eingabe {
  min-height: 44px;
  padding: 0 12px;
  color: var(--tz-tinte);
  background: var(--tz-feld);
  border: 1px solid var(--tz-linie);
  border-radius: 8px;
}

.raster {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(148px, 1fr));
  gap: 12px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.kachel {
  display: flex;
}

.kachelKnopf {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 4px;
  align-items: center;
  min-height: 44px;
  padding: 8px;
  color: var(--tz-tinte);
  text-align: center;
  background: var(--tz-blatt);
  border: 1px solid var(--tz-linie);
  border-radius: 8px;
  cursor: pointer;
}

/* Die Auswahl wird ueber eine KONTUR markiert, nicht ueber Rot (Falle 3) und
   nicht allein ueber Farbe — `aria-pressed` traegt sie zusaetzlich vor. */
.kachelKnopf[aria-pressed="true"] {
  outline: 2px solid var(--tz-stahl);
  outline-offset: 1px;
}

.detailblatt {
  display: flex;
  justify-content: center;
  padding: 16px;
  background: var(--tz-blatt);
  border: 1px solid var(--tz-linie);
  border-radius: 8px;
}

.zeichengross {
  width: 100%;
  max-width: 240px;
}

.zeichenflaeche {
  display: block;
  width: 64px;
}

/* Der Platzhalter fuer eine Merkzeile ohne Bild. Gestrichelt und leer: er sagt
   „hier war einmal etwas", ohne ein Zeichen zu erfinden. */
.zeichenfehlt {
  display: block;
  flex: 0 0 auto;
  width: 64px;
  height: 64px;
  border: 1px dashed var(--tz-linie);
  border-radius: 8px;
}

.daten {
  display: grid;
  grid-template-columns: max-content 1fr;
  gap: 4px 16px;
  margin: 0;
}

.daten dt,
.daten dd {
  margin: 0;
}

.hinweis {
  margin: 0;
  padding-inline-start: 12px;
  border-inline-start: 3px solid var(--tz-hinweis);
}

.merkliste {
  margin: 0;
  padding: 0;
  list-style: none;
}

.merkzeile {
  display: flex;
  gap: 12px;
  align-items: center;
  min-height: 44px;
  padding-block: 8px;
  border-block-end: 1px solid var(--tz-linie);
}

.merktext {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
}
```

- [ ] **Schritt 10: Den fehlschlagenden Test für die Katalog-Insel schreiben**

`src/app/m/zeichen/_ui/KatalogInsel.test.tsx`:

```tsx
// @vitest-environment jsdom
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mount, unmount, query, queryAll, exists, fill, click } from "@/app/m/qr/_lib/test-dom";
import { alleZeichen, findeZeichen } from "../_lib/katalog";

/*
 * DREI MOCKS, UND JEDER HAT EINEN GRUND.
 *
 * `next/navigation`: `useSearchParams` braucht einen echten App-Router-Kontext,
 * den jsdom + `mount()` nicht stellt (dieselbe Form wie `TagesWaehler.test.tsx`).
 * `useRouter().push` steht mit im Mock, damit der Test BEWEISEN kann, dass die
 * Insel NICHT navigiert.
 *
 * `next/link`: greift ebenfalls auf den Router-Kontext zu (Vorbild
 * `uav/_ui/teilnehmer/Dashboard.test.tsx`).
 *
 * `../actions`: die echten Actions zoegen `@/core/auth` und better-sqlite3 in
 * einen jsdom-Lauf; geprueft wird hier ohnehin nur, DASS die Insel die richtige
 * Action mit der richtigen Id ruft.
 */
const pushMock = vi.fn();
const merkeMock = vi.fn(async () => {});
const entferneMock = vi.fn(async () => {});
let suchparameter = new URLSearchParams();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock }),
  usePathname: () => "/m/zeichen/katalog",
  useSearchParams: () => suchparameter,
}));
vi.mock("next/link", () => ({
  default: ({ href, children }: { href: string; children?: ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}));
vi.mock("../actions", () => ({
  merkeZeichen: (id: string) => merkeMock(id),
  entferneZeichen: (id: string) => entferneMock(id),
}));

const { KatalogInsel } = await import("./KatalogInsel");

const ERSTE = alleZeichen()[0];
if (ERSTE === undefined) throw new Error("Das Generat ist leer — _lib/katalog.test.ts sagt, warum");

/*
 * EIN KAPITEL, DAS ZWEI ORGANISATIONEN FUEHRT — aus den Daten gesucht statt
 * geraten. Mit einem Kapitel, in dem alle Zeichen dieselbe Organisation tragen,
 * BEWIESE der Kombinationstest nichts: das Ergebnis waere mit und ohne den
 * zweiten Filter identisch. Faellt hier nichts an, ist das ein Befund und kein
 * Testfehler — dann kann diese Fläche zwei Filter gar nicht sinnvoll kombinieren.
 */
const KOMBI = (() => {
  for (const z of alleZeichen()) {
    if (z.organisation === null) continue;
    const imKapitel = alleZeichen().filter((k) => k.kapitel === z.kapitel);
    if (imKapitel.length > 48) continue; // sonst schneidet die Raster-Schranke mit
    const beides = imKapitel.filter((k) => k.organisation === z.organisation);
    if (beides.length > 0 && beides.length < imKapitel.length) {
      return { kapitel: z.kapitel, organisation: z.organisation, beides: beides.length };
    }
  }
  throw new Error("Kein Kapitel des Generats fuehrt zwei Organisationen — der Test bewiese nichts");
})();

function kachelIds(): string[] {
  return queryAll('[data-testid^="zeichen-kachel-"]').map((k) =>
    k.getAttribute("data-testid")!.slice("zeichen-kachel-".length),
  );
}

beforeEach(() => {
  suchparameter = new URLSearchParams();
  window.history.replaceState(null, "", "http://localhost:3000/katalog");
  pushMock.mockClear();
  merkeMock.mockClear();
  entferneMock.mockClear();
});

afterEach(async () => {
  await unmount();
});

describe("KatalogInsel — Suche und Filter", () => {
  /*
   * DIE FALTUNG TRAEGT BIS IN DIE OBERFLAECHE. Gemessen findet „loeschgruppe" mit
   * reiner Kleinschreibung 0 von 232 Zeichen; wer auf einem Tablet mit
   * Handschuhen tippt, schreibt keine Umlaute. Dieser Test prueft die
   * VERDRAHTUNG — dass die Eingabe ueberhaupt bei `sucheZeichen` ankommt —, nicht
   * die Faltung selbst (das tut `_lib/falte.test.ts`).
   */
  it("die Suche filtert das Raster, und loeschgruppe findet Loeschgruppe", async () => {
    await mount(<KatalogInsel />);
    const vorher = kachelIds().length;
    expect(vorher).toBeGreaterThan(0);

    await fill('[data-testid="zeichen-suche"]', "loeschgruppe");

    const nachher = kachelIds();
    expect(nachher.length).toBeGreaterThan(0);
    expect(nachher.length).toBeLessThan(vorher);
    for (const id of nachher) {
      expect(findeZeichen(id)?.suchtext, id).toContain("loeschgruppe");
    }
  });

  /*
   * ZWEI FILTER SCHNEIDEN SICH, SIE ADDIEREN SICH NICHT. Der naheliegende Fehler
   * ist ein `||` statt eines `&&` in der Filterkette — mit nur EINEM gesetzten
   * Filter waere er ununterscheidbar vom richtigen Verhalten.
   */
  it("Kapitel und Organisation kombinieren sich zu einer Schnittmenge", async () => {
    await mount(<KatalogInsel />);
    await fill('[data-testid="zeichen-filter-kapitel"]', KOMBI.kapitel);
    const nurKapitel = kachelIds().length;

    await fill('[data-testid="zeichen-filter-organisation"]', KOMBI.organisation);
    const beides = kachelIds();

    expect(beides.length).toBe(KOMBI.beides);
    expect(beides.length).toBeLessThan(nurKapitel);
    for (const id of beides) {
      const z = findeZeichen(id);
      expect(z?.kapitel, id).toBe(KOMBI.kapitel);
      expect(z?.organisation, id).toBe(KOMBI.organisation);
    }
  });

  it("sagt bei null Treffern, was zu tun ist, statt nur „nichts da“", async () => {
    await mount(<KatalogInsel />);
    await fill('[data-testid="zeichen-suche"]', "zzzgibtesnicht");
    expect(kachelIds()).toHaveLength(0);
    expect(document.body.textContent).toContain("Weniger Woerter");
  });
});

describe("KatalogInsel — der Detailbereich liegt auf DERSELBEN Seite", () => {
  it("?z=<id> oeffnet ihn beim ersten Rendern, ohne jede Navigation", async () => {
    suchparameter = new URLSearchParams(`z=${ERSTE.id}`);
    await mount(<KatalogInsel />);
    const detail = query('[data-testid="zeichen-detailbereich"]');
    expect(detail.textContent).toContain(ERSTE.titel);
    expect(detail.textContent).toContain(ERSTE.bedeutung);
    expect(pushMock).not.toHaveBeenCalled();
  });

  /*
   * ⛔ KEIN router.push. Auf `/offline` ist genau EINE Navigationsroute gecacht;
   * ein `push` loeste dort einen RSC-Abruf aus, den es ohne Netz nicht gibt, und
   * der Navigationsrueckfall lieferte dieselbe Flaeche noch einmal aus. Die
   * Adresszeile wird deshalb mit `history.replaceState` nachgezogen — EIN
   * Codepfad fuer online und offline.
   */
  it("ein Klick auf eine Kachel oeffnet ihn und setzt ?z=, ohne zu navigieren", async () => {
    await mount(<KatalogInsel />);
    expect(exists('[data-testid="zeichen-detailbereich"]')).toBe(false);

    await click(`[data-testid="zeichen-kachel-${ERSTE.id}"]`);

    expect(query('[data-testid="zeichen-detailbereich"]').textContent).toContain(ERSTE.titel);
    expect(new URL(window.location.href).searchParams.get("z")).toBe(ERSTE.id);
    expect(pushMock).not.toHaveBeenCalled();
  });
});

describe("KatalogInsel — Merken", () => {
  it("online traegt der Detailbereich den Merken-Knopf und den Weg zur Einzelseite", async () => {
    suchparameter = new URLSearchParams(`z=${ERSTE.id}`);
    await mount(<KatalogInsel />);

    await click('[data-testid="zeichen-merken"]');
    expect(merkeMock).toHaveBeenCalledWith(ERSTE.id);

    const ziele = queryAll<HTMLAnchorElement>("a").map((a) => a.getAttribute("href"));
    expect(ziele).toContain(`/m/zeichen/katalog/${encodeURIComponent(ERSTE.id)}`);
  });

  it("ein bereits gemerktes Zeichen bietet das Entfernen an, nicht das Merken", async () => {
    suchparameter = new URLSearchParams(`z=${ERSTE.id}`);
    await mount(<KatalogInsel gemerkt={[ERSTE.id]} />);

    expect(query('[data-testid="zeichen-merken"]').textContent).toContain("Aus der Merkliste");
    await click('[data-testid="zeichen-merken"]');
    expect(entferneMock).toHaveBeenCalledWith(ERSTE.id);
    expect(merkeMock).not.toHaveBeenCalled();
  });

  /*
   * DAS `offline`-PROP KANN GENAU ZWEI DINGE, UND BEIDE SIND MESSBAR BEGRUENDET:
   * (1) Schreiben braucht eine Verbindung — ein Knopf, der offline in einen
   *     Fehler laeuft, kostet an der Einsatzstelle genau die Zeit, um die es geht.
   * (2) `/katalog/[id]` ist NICHT im Cache. Der Navigationsrueckfall des Workers
   *     schickt jede nicht gecachte Navigation auf `/offline` — der Anwender
   *     landete auf derselben Flaeche und hielte das fuer einen Fehler.
   */
  it("offline gibt es weder Merken-Knopf noch Link auf die Einzelseite", async () => {
    suchparameter = new URLSearchParams(`z=${ERSTE.id}`);
    await mount(<KatalogInsel offline />);

    expect(exists('[data-testid="zeichen-merken"]')).toBe(false);
    expect(queryAll("a")).toHaveLength(0);
    expect(query('[data-testid="zeichen-detailbereich"]').textContent).toContain(
      "Merken braucht eine Verbindung",
    );
  });
});
```

- [ ] **Schritt 11: Test laufen lassen und Fehlschlag bestätigen**

Kommando: `pnpm vitest run src/app/m/zeichen/_ui/KatalogInsel.test.tsx`
Erwartet: FAIL — `Failed to resolve import "./KatalogInsel"`.

- [ ] **Schritt 12: Die Katalog-Insel schreiben**

`src/app/m/zeichen/_ui/KatalogInsel.tsx`:

```tsx
"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Button } from "antd";
import { SCHRIFT } from "@/core/theme/schrift";
import { SPACE } from "@/core/theme/tokens";
import { entferneZeichen, merkeZeichen } from "../actions";
import {
  findeZeichen,
  grundformen,
  kapitelListe,
  organisationen,
  sucheZeichen,
  type ZeichenId,
} from "../_lib/katalog";
import s from "./zeichen.module.css";

/*
 * DIE KATALOG-INSEL — Suche, drei Filter, Raster, Detailbereich auf DERSELBEN
 * Seite. Aufgabe 9 rendert genau diese Komponente ein zweites Mal auf `/offline`,
 * mit gesetztem `offline`-Prop und ohne <Shell>; `/offline` verdoppelt die
 * Katalogflaeche deshalb NICHT.
 *
 * ⛔ SERVER UND CLIENT RUFEN DIESELBE `sucheZeichen()` AUF DEMSELBEN GENERAT AUF.
 * Das ist der Grund, warum diese Insel per SSR rendert und ohne Mismatch
 * hydriert, und der Grund, warum die Filterfunktion in `_lib/` OHNE "use client"
 * liegt. Wer die Suche hierher kopiert, hat zwei Codepfade fuer dieselbe Frage —
 * und der Unterschied meldet sich als Hydrationsfehler im Browser, nicht als
 * roter Test.
 *
 * ⛔ KEIN `router.push`, WEDER FUER DIE AUSWAHL NOCH FUER DIE FILTER. Auf
 * `/offline` ist genau EINE Navigationsroute im Cache; ein `push` loeste einen
 * RSC-Abruf aus, den es ohne Netz nicht gibt, und der Navigationsrueckfall
 * lieferte dieselbe Flaeche erneut. Die Adresszeile wird stattdessen mit
 * `window.history.replaceState` nachgezogen — Next unterstuetzt das
 * ausdruecklich, es loest keine Server-Runde aus, und es bleibt EIN Codepfad fuer
 * online und offline.
 *
 * ⛔ KEIN antd-`Table`, KEIN `Listy`, KEIN `Select`, KEIN `Input.Search`. Die
 * ersten beiden verlangen eine Funktion als Prop (Falle 9) — hier waere das
 * unschaedlich, weil dies eine Client-Komponente ist, aber die Flaeche wandert
 * mit Aufgabe 9 unter eine zweite Huelle, und dieselben Bausteine sollen dort
 * dieselben bleiben. `Select` und `Input.Search` sind Compound-Zugriffe bzw.
 * Portal-Bauformen, deren Wert in einem versteckten Feld liegt; ein natives
 * <select> ist vor der Hydration bedienbar und im Test ohne `queryPortal`
 * pruefbar.
 *
 * ⛔ KEIN Import aus `@ant-design/icons`, nirgends im Modul (Falle 7).
 */

/* Einmal beim Modulladen — reine Funktionen ueber eine Konstante. */
const KAPITEL = kapitelListe();
const ORGANISATIONEN = organisationen();
const GRUNDFORMEN = grundformen();

/**
 * Wie viele Kacheln auf einmal im Baum haengen.
 *
 * NICHT GEMESSEN, und deshalb konservativ: gemessen ist nur, dass alle 246 SVGs
 * zusammen 381.541 B roh sind — wie ein Tablet 246 gleichzeitig eingehaengte
 * SVG-Baeume verkraftet, hat niemand nachgesehen. 48 fuellt auf jedem Geraet mehr
 * als einen Bildschirm, und der Knopf darunter hebt die Schranke. Wer sie misst,
 * darf sie streichen.
 */
const RASTER_SCHRITT = 48;

export function KatalogInsel({
  offline = false,
  gemerkt = [],
}: {
  /** Auf `/offline` (Aufgabe 9): kein Schreiben, keine ungecachten Ziele. */
  offline?: boolean;
  /** Die eigenen Merk-IDs, von der RSC-Huelle gelesen. */
  gemerkt?: readonly ZeichenId[];
}) {
  const suchparameter = useSearchParams();

  /*
   * ERSTSTAND AUS DER URL — Server und Client lesen DIESELBEN Parameter, rufen
   * DIESELBE Funktion auf und rendern deshalb dasselbe erste Bild.
   *
   * Der Suchtext bleibt danach im lokalen Zustand: ein `push` je Tastendruck
   * waere eine Navigation je Tastendruck, und offline gaebe es dafuer kein Ziel.
   */
  const [text, setText] = useState(() => suchparameter.get("q") ?? "");
  const [kapitel, setKapitel] = useState(() => suchparameter.get("kapitel") ?? "");
  const [organisation, setOrganisation] = useState(() => suchparameter.get("org") ?? "");
  const [grundform, setGrundform] = useState(() => suchparameter.get("form") ?? "");
  const [gewaehlt, setGewaehlt] = useState(() => suchparameter.get("z") ?? "");
  const [grenze, setGrenze] = useState(RASTER_SCHRITT);
  const [merkstand, setMerkstand] = useState<readonly string[]>(gemerkt);
  const [schreibt, schreibe] = useTransition();

  const { treffer, gesamt } = useMemo(
    () =>
      sucheZeichen({
        text,
        kapitel: kapitel === "" ? undefined : kapitel,
        organisation: organisation === "" ? undefined : organisation,
        grundform: grundform === "" ? undefined : grundform,
      }),
    [text, kapitel, organisation, grundform],
  );

  const detail = gewaehlt === "" ? null : findeZeichen(gewaehlt);
  const istGemerkt = detail !== null && merkstand.includes(detail.id);

  /** Die Adresszeile nachziehen — OHNE Navigation, siehe Kopfkommentar. */
  function spiegele(schluessel: string, wert: string): void {
    if (typeof window === "undefined") return;
    const url = new URL(window.location.href);
    if (wert === "") url.searchParams.delete(schluessel);
    else url.searchParams.set(schluessel, wert);
    window.history.replaceState(null, "", url);
  }

  function waehle(id: string): void {
    setGewaehlt(id);
    spiegele("z", id);
  }

  return (
    <div className={s.modul}>
      {/* Ein <div role="search">, KEIN <form>: ein Formular schickte bei Enter
          eine echte GET-Navigation los — offline ins Leere. */}
      <div className={s.suchzeile} role="search">
        <label className={s.feld}>
          <span style={SCHRIFT.kicker}>Suchen</span>
          <input
            type="search"
            className={s.eingabe}
            data-testid="zeichen-suche"
            value={text}
            placeholder="Titel, Kuerzel oder Bedeutung"
            onChange={(e) => setText(e.target.value)}
          />
        </label>

        <label className={s.feld}>
          <span style={SCHRIFT.kicker}>Kapitel</span>
          <select
            className={s.eingabe}
            data-testid="zeichen-filter-kapitel"
            value={kapitel}
            onChange={(e) => {
              setKapitel(e.target.value);
              spiegele("kapitel", e.target.value);
            }}
          >
            <option value="">Alle Kapitel</option>
            {KAPITEL.map((k) => (
              <option key={k.name} value={k.name}>
                {k.name} ({k.anzahl})
              </option>
            ))}
          </select>
        </label>

        <label className={s.feld}>
          <span style={SCHRIFT.kicker}>Organisation</span>
          <select
            className={s.eingabe}
            data-testid="zeichen-filter-organisation"
            value={organisation}
            onChange={(e) => {
              setOrganisation(e.target.value);
              spiegele("org", e.target.value);
            }}
          >
            <option value="">Alle Organisationen</option>
            {ORGANISATIONEN.map((o) => (
              <option key={o} value={o}>
                {o}
              </option>
            ))}
          </select>
        </label>

        <label className={s.feld}>
          <span style={SCHRIFT.kicker}>Grundform</span>
          <select
            className={s.eingabe}
            data-testid="zeichen-filter-grundform"
            value={grundform}
            onChange={(e) => {
              setGrundform(e.target.value);
              spiegele("form", e.target.value);
            }}
          >
            <option value="">Alle Grundformen</option>
            {GRUNDFORMEN.map((g) => (
              <option key={g} value={g}>
                {g}
              </option>
            ))}
          </select>
        </label>
      </div>

      {/* `aria-live`, damit ein Bildschirmleser die Zahl nach dem Tippen
          mitbekommt — das Raster darunter meldet sich selbst nicht. */}
      <p
        style={{ ...SCHRIFT.neben, marginBlockEnd: SPACE.md }}
        data-testid="zeichen-trefferzahl"
        aria-live="polite"
      >
        {treffer.length} von {gesamt} Zeichen
      </p>

      {detail !== null && (
        <section
          className={s.detailbereich}
          data-testid="zeichen-detailbereich"
          style={{ display: "grid", gap: SPACE.md, marginBlockEnd: SPACE.xl }}
        >
          <div className={s.detailblatt}>
            {/* Serverseitig erzeugtes, eingechecktes Markup aus dem Generat —
                dieselbe Vertrauenslage wie `qr/QrDisplay.tsx`. Ein vom Client
                geliefertes SVG kaeme NIE hierher (Spec §4.3). */}
            <div
              className={s.zeichengross}
              dangerouslySetInnerHTML={{ __html: detail.svg }}
            />
          </div>
          <h2 style={SCHRIFT.unterTitel}>{detail.titel}</h2>
          <p style={SCHRIFT.text}>{detail.bedeutung}</p>
          <dl className={s.daten}>
            <dt style={SCHRIFT.kicker}>Kapitel</dt>
            <dd style={SCHRIFT.text}>{detail.kapitel}</dd>
            <dt style={SCHRIFT.kicker}>Abschnitt</dt>
            <dd style={SCHRIFT.text}>{detail.abschnitt}</dd>
            {/* „—" statt des Wortes „undefined": `symbolKindLabel` und
                `ORGANIZATION_LABELS` liefern gemessen still `undefined` fuer
                unbekannte Werte; der Generator hat das auf `null` gedreht. */}
            <dt style={SCHRIFT.kicker}>Organisation</dt>
            <dd style={SCHRIFT.text}>{detail.organisation ?? "—"}</dd>
          </dl>

          {detail.reviewNotiz !== null && (
            <p className={s.hinweis} style={SCHRIFT.neben} data-testid="zeichen-reviewnotiz">
              {detail.reviewNotiz}
            </p>
          )}

          <div style={{ display: "flex", flexWrap: "wrap", gap: SPACE.sm }}>
            {offline ? (
              <p style={SCHRIFT.neben}>
                Merken braucht eine Verbindung. Nachschlagen und Durchsuchen gehen ohne.
              </p>
            ) : (
              <>
                <Button
                  data-testid="zeichen-merken"
                  loading={schreibt}
                  onClick={() =>
                    schreibe(async () => {
                      if (istGemerkt) {
                        await entferneZeichen(detail.id);
                        setMerkstand((m) => m.filter((x) => x !== detail.id));
                      } else {
                        await merkeZeichen(detail.id);
                        setMerkstand((m) => [...m, detail.id]);
                      }
                    })
                  }
                >
                  {istGemerkt ? "Aus der Merkliste nehmen" : "Merken"}
                </Button>
                {/* NUR ONLINE: `/katalog/[id]` liegt nicht im Cache, und der
                    Navigationsrueckfall des Workers schickte den Aufruf auf
                    `/offline` zurueck — dieselbe Flaeche, wie ein Fehler wirkend. */}
                <Link
                  href={`/m/zeichen/katalog/${encodeURIComponent(detail.id)}`}
                  style={SCHRIFT.text}
                >
                  Ganze Seite oeffnen
                </Link>
              </>
            )}
            <Button
              data-testid="zeichen-detail-schliessen"
              onClick={() => {
                setGewaehlt("");
                spiegele("z", "");
              }}
            >
              Schliessen
            </Button>
          </div>
        </section>
      )}

      {treffer.length === 0 ? (
        <p style={SCHRIFT.text} data-testid="zeichen-leer">
          Kein Zeichen passt dazu. Weniger Woerter oder ein Filter weniger helfen meistens.
        </p>
      ) : (
        <ul className={s.raster} data-testid="zeichen-raster">
          {treffer.slice(0, grenze).map((z) => (
            <li key={z.id} className={s.kachel}>
              <button
                type="button"
                className={s.kachelKnopf}
                data-testid={`zeichen-kachel-${z.id}`}
                aria-pressed={z.id === gewaehlt}
                onClick={() => waehle(z.id)}
              >
                {/* `aria-hidden` am Bild: das SVG traegt aus dem Generator
                    `aria-labelledby` auf Titel und Beschreibung, und der Titel
                    steht direkt darunter noch einmal als Text. Ohne das
                    Attribut liest ein Bildschirmleser jede Kachel doppelt vor. */}
                <span
                  className={s.zeichenflaeche}
                  aria-hidden="true"
                  dangerouslySetInnerHTML={{ __html: z.svg }}
                />
                <span style={SCHRIFT.text}>{z.titel}</span>
                <span style={SCHRIFT.neben}>{z.abschnitt}</span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {treffer.length > grenze && (
        <Button
          data-testid="zeichen-mehr"
          style={{ marginBlockStart: SPACE.md }}
          onClick={() => setGrenze((g) => g + RASTER_SCHRITT)}
        >
          Weitere {Math.min(RASTER_SCHRITT, treffer.length - grenze)} anzeigen
        </Button>
      )}
    </div>
  );
}
```

> Die Klasse `s.detailbereich` steht im JSX, aber nicht in Schritt 9 — **das ist kein Versehen und
> auch kein fehlender Stil:** CSS-Module liefern für einen unbekannten Schlüssel `undefined`, und
> `className={undefined}` rendert kein Attribut. Der Bereich bekommt sein Layout über den Inline-Stil
> daneben. Wer ihm später eigene Regeln geben will, legt die Klasse in `zeichen.module.css` an; bis
> dahin ist der Name ein Haken ohne Wirkung. **Alternativ die Zeile streichen** — beides ist richtig,
> nur nicht eine leere Klasse ins CSS schreiben, die dann aussieht, als täte sie etwas.

- [ ] **Schritt 13: Test laufen lassen und grün sehen**

Kommando: `pnpm vitest run src/app/m/zeichen/_ui/KatalogInsel.test.tsx`
Erwartet: PASS, acht Tests. Schlägt „Kein Kapitel des Generats fuehrt zwei Organisationen" zu,
ist das ein **Datenbefund**, kein Testfehler: dann kombinieren die beiden Filter fachlich nichts,
und die Fläche gehört neu geschnitten — nicht der Test gelockert.

---

- [ ] **Schritt 14: Den fehlschlagenden Test für die Merklisten-Zeilen schreiben**

`src/app/m/zeichen/_ui/MerklisteZeilen.test.tsx`:

```tsx
// @vitest-environment jsdom
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mount, unmount, query, queryAll, exists, click } from "@/app/m/qr/_lib/test-dom";
import { findeZeichen } from "../_lib/katalog";
import { merkAnzeige, VERWAIST_TEXT } from "../_lib/merkliste";

const entferneMock = vi.fn(async () => {});
vi.mock("../actions", () => ({
  merkeZeichen: async () => {},
  entferneZeichen: (id: string) => entferneMock(id),
}));
vi.mock("next/link", () => ({
  default: ({ href, children }: { href: string; children?: ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}));

const { MerklisteZeilen } = await import("./MerklisteZeilen");

const ANKER = "rezept:C.1.1";
const BEISPIEL = findeZeichen(ANKER);
if (BEISPIEL === null) throw new Error("Anker rezept:C.1.1 fehlt im Generat");

const ZEILEN = merkAnzeige([
  { zeichenId: ANKER, titelSchnappschuss: BEISPIEL.titel },
  { zeichenId: "rezept:GIBTSNICHT", titelSchnappschuss: "Bergungsgruppe" },
]);

beforeEach(() => {
  entferneMock.mockClear();
});

afterEach(async () => {
  await unmount();
});

describe("MerklisteZeilen", () => {
  it("zeigt eine aufloesbare Zeile mit Bild, Titel und Bedeutung aus dem Generat", async () => {
    await mount(<MerklisteZeilen zeilen={ZEILEN} />);
    const zeile = query(`[data-testid="zeichen-merkzeile-${ANKER}"]`);
    expect(zeile.querySelector("svg")).not.toBeNull();
    expect(zeile.textContent).toContain(BEISPIEL.titel);
    expect(zeile.textContent).toContain(BEISPIEL.bedeutung);
  });

  /*
   * SPEC §4.6 STUFE 2 — DIE ZEILE BLEIBT STEHEN. Der naheliegende „Aufraeumer"
   * (nicht aufloesbar -> nicht anzeigen) laesst eine gemerkte Sache spurlos
   * verschwinden, ohne dass jemand geloescht hat. Genau das darf nicht passieren.
   */
  it("laesst eine nicht mehr aufloesbare Zeile stehen — mit Schnappschuss und Erklaerung", async () => {
    await mount(<MerklisteZeilen zeilen={ZEILEN} />);
    const zeile = query('[data-testid="zeichen-merkzeile-rezept:GIBTSNICHT"]');
    expect(zeile.textContent).toContain("Bergungsgruppe");
    expect(zeile.textContent).toContain(VERWAIST_TEXT);
    expect(zeile.querySelector("svg")).toBeNull();
  });

  /*
   * Ein Link auf `/katalog/rezept:GIBTSNICHT` liefe in ein `notFound()` — die
   * Zeile erklaert sich, sie verspricht keinen Weg, den es nicht gibt.
   */
  it("verlinkt eine verwaiste Zeile NICHT auf die Einzelseite", async () => {
    await mount(<MerklisteZeilen zeilen={ZEILEN} />);
    const ziele = queryAll<HTMLAnchorElement>("a").map((a) => a.getAttribute("href"));
    expect(ziele).toContain(`/m/zeichen/katalog/${encodeURIComponent(ANKER)}`);
    expect(ziele.join(" ")).not.toContain("GIBTSNICHT");
  });

  /*
   * ZWEI ZEILEN, NICHT EINE. Mit einer einzigen waere eine fest verdrahtete Id
   * ununterscheidbar von der richtigen — dieselbe Regel wie in
   * `aufgaben/_ui/RoutinenTabelle.test.tsx`.
   */
  it("jeder Entfernen-Knopf traegt die EIGENE Id, auch der einer verwaisten Zeile", async () => {
    await mount(<MerklisteZeilen zeilen={ZEILEN} />);
    await click('[data-testid="zeichen-merkliste-entfernen-rezept:GIBTSNICHT"]');
    expect(entferneMock).toHaveBeenCalledWith("rezept:GIBTSNICHT");

    await click(`[data-testid="zeichen-merkliste-entfernen-${ANKER}"]`);
    expect(entferneMock).toHaveBeenLastCalledWith(ANKER);
    expect(entferneMock).toHaveBeenCalledTimes(2);
  });

  it("der Leerzustand sagt, woher Merkzeilen kommen", async () => {
    await mount(<MerklisteZeilen zeilen={[]} />);
    expect(exists('[data-testid="zeichen-merkliste"]')).toBe(false);
    expect(document.body.textContent).toContain("Merken");
    expect(document.body.textContent).toContain("Katalog");
  });
});
```

- [ ] **Schritt 15: Test laufen lassen und Fehlschlag bestätigen**

Kommando: `pnpm vitest run src/app/m/zeichen/_ui/MerklisteZeilen.test.tsx`
Erwartet: FAIL — `Failed to resolve import "./MerklisteZeilen"`.

- [ ] **Schritt 16: Die Merklisten-Zeilen schreiben**

`src/app/m/zeichen/_ui/MerklisteZeilen.tsx`:

```tsx
"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Button } from "antd";
import { SCHRIFT } from "@/core/theme/schrift";
import { entferneZeichen } from "../actions";
import { VERWAIST_TEXT, type MerkAnzeige } from "../_lib/merkliste";
import s from "./zeichen.module.css";

/*
 * DIE MERKLISTE ALS EIGENE CLIENT-KOMPONENTE — Vorbild
 * `lagerbuch/verwaltung/(arbeit)/LetzteBuchungenTable.tsx` und
 * `aufgaben/_ui/RoutinenTabelle.tsx`.
 *
 * ⛔ SIE BEKOMMT NUR SERIALISIERBARE DATEN (Falle 9). `(shell)/merkliste/page.tsx`
 * bleibt dadurch eine Server Component: sie liest die Zeilen, ruft
 * `merkAnzeige()` und reicht das Ergebnis weiter. Eine Funktion — etwa ein
 * fertiger Entfernen-Handler — kaeme ueber die RSC-Grenze NICHT an
 * („Functions cannot be passed directly to Client Components"), und weder
 * `pnpm build` noch ein jsdom-`mount()` saehe das: der Build prueft Modulgrenzen
 * statt Serialisierung, und jsdom kennt gar keine RSC-Grenze.
 *
 * `entferneZeichen` ist die EINE erlaubte Ausnahme: Server Actions sind
 * serialisierbar — aber DIREKT IMPORTIERT, nie als Prop durchgereicht.
 */
export function MerklisteZeilen({ zeilen }: { zeilen: readonly MerkAnzeige[] }) {
  /*
   * Die laufende Id EINZELN, nicht nur ein Sammel-Flag: mit `loading={laeuft}` an
   * jedem Knopf draehte nach einem Klick die ganze Liste, und die Oberflaeche
   * behauptete etwas, das nicht stimmt.
   */
  const [laufend, setLaufend] = useState<string | null>(null);
  const [imUebergang, starte] = useTransition();

  if (zeilen.length === 0) {
    return (
      <p style={SCHRIFT.text} data-testid="zeichen-merkliste-leer">
        Noch nichts gemerkt. Im Katalog steht an jedem Zeichen der Knopf „Merken".
      </p>
    );
  }

  return (
    <ul className={s.merkliste} data-testid="zeichen-merkliste">
      {zeilen.map((z) => (
        <li
          key={z.zeichenId}
          className={s.merkzeile}
          data-testid={`zeichen-merkzeile-${z.zeichenId}`}
        >
          {/* Kein Bild fuer eine verwaiste Zeile: es gaebe keines, und ein
              erfundenes waere schlimmer als ein leerer Platzhalter. */}
          {z.svg === null ? (
            <span className={s.zeichenfehlt} aria-hidden="true" />
          ) : (
            <span
              className={s.zeichenflaeche}
              aria-hidden="true"
              dangerouslySetInnerHTML={{ __html: z.svg }}
            />
          )}

          <div className={s.merktext}>
            {z.verwaist ? (
              /* Kein Link — `/katalog/<id>` liefe hier in ein notFound(). */
              <span style={SCHRIFT.text}>{z.titel}</span>
            ) : (
              <Link
                href={`/m/zeichen/katalog/${encodeURIComponent(z.zeichenId)}`}
                style={SCHRIFT.text}
              >
                {z.titel}
              </Link>
            )}
            <span style={SCHRIFT.neben}>{z.verwaist ? VERWAIST_TEXT : z.bedeutung}</span>
          </div>

          <Button
            data-testid={`zeichen-merkliste-entfernen-${z.zeichenId}`}
            loading={imUebergang && laufend === z.zeichenId}
            onClick={() => {
              setLaufend(z.zeichenId);
              starte(async () => {
                await entferneZeichen(z.zeichenId);
              });
            }}
          >
            Entfernen
          </Button>
        </li>
      ))}
    </ul>
  );
}
```

- [ ] **Schritt 17: Test laufen lassen und grün sehen**

Kommando: `pnpm vitest run src/app/m/zeichen/_ui/MerklisteZeilen.test.tsx`
Erwartet: PASS, fünf Tests.

---

- [ ] **Schritt 18: Die drei Seiten schreiben**

`src/app/m/zeichen/(shell)/katalog/page.tsx` — die RSC-Hülle:

```tsx
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { auth } from "@/core/auth";
import { Seitenkopf } from "@/core/shell/Seitenkopf";
import { getDb } from "../../_db/client";
import { merkliste } from "../../_db/schema";
import { KATALOG_STAND } from "../../_lib/katalog";
import { KatalogInsel } from "../../_ui/KatalogInsel";

/*
 * ⛔ `<Suspense>` UM DIE INSEL, weil sie `useSearchParams()` liest. Ohne die
 * Grenze verlangt Next die Grenze selbst — Vorbild `uav/(teilnehmer)/page.tsx`.
 * Ein Ersatzinhalt ist nicht noetig: die Seite ist ohnehin dynamisch (sie ruft
 * `auth()`), und die Insel rendert per SSR vollstaendig durch.
 *
 * ⛔ DER `sub` KOMMT AUS `auth()`, NIE AUS EINEM PARAMETER. `session.user.id` IST
 * der Pocket-ID-`sub`, aber der Typ luegt (@auth/core baut `user` ohne `id`) —
 * deshalb die ausdrueckliche Pruefung. Auf einer SEITE ist `notFound()` der
 * richtige Ausgang, nicht ein Wurf.
 *
 * KEIN `Typography.Title`: `Seitenkopf` rendert ein nacktes <h1> (Falle 1).
 */
export default async function KatalogSeite() {
  const sub = (await auth())?.user?.id;
  if (!sub) notFound();

  const gemerkt = getDb()
    .select({ zeichenId: merkliste.zeichenId })
    .from(merkliste)
    .where(eq(merkliste.sub, sub))
    .all()
    .map((z) => z.zeichenId);

  return (
    <>
      <Seitenkopf
        titel="Katalog"
        beschreibung={`${KATALOG_STAND.anzahl} Zeichen, Stand ${KATALOG_STAND.erzeugtAm}.`}
      />
      <Suspense>
        <KatalogInsel gemerkt={gemerkt} />
      </Suspense>
    </>
  );
}
```

`src/app/m/zeichen/(shell)/katalog/[id]/page.tsx` — **die reine Server Component**:

```tsx
import { notFound } from "next/navigation";
import { Seitenkopf } from "@/core/shell/Seitenkopf";
import { SCHRIFT } from "@/core/theme/schrift";
import { SPACE } from "@/core/theme/tokens";
import { findeZeichen, svgFuer } from "../../../_lib/katalog";
import s from "../../../_ui/zeichen.module.css";

/*
 * DIE DETAILSEITE — EINE REINE SERVER COMPONENT, UND SIE BLEIBT ES.
 *
 * `svgFuer(id)` liefert einen String aus dem EINGECHECKTEN Generat; er geht
 * unveraendert per `dangerouslySetInnerHTML` ins Markup. Die Vertrauenslage ist
 * dieselbe wie bei `qr/QrDisplay.tsx` und `radio/admin/(druck)/…/blatt/page.tsx`:
 * serverseitig erzeugtes Markup. Ein vom Client geliefertes SVG kaeme hier NIE
 * an — dafuer gibt es `/meine` mit `<img src="data:image/svg+xml;base64,…">`
 * (Spec §4.3).
 *
 * DIESE ROUTE IST DAS EINZIGE TOR, DAS EINEN RSC-BRUCH NACH EINEM PAKETUPGRADE
 * SIEHT (Spec §8.3/§8.4): `typecheck`, `lint` und Vitest koennen diese Klasse
 * strukturell nicht sehen. Aufgabe 10 haengt deshalb einen e2e-Abruf daran, der
 * nichts weiter tut, als `<svg` im gelieferten HTML zu suchen.
 *
 * VIER DINGE SIND HIER VERBOTEN, und jedes davon waere HTTP 500:
 *   - `Descriptions.Item`, `Typography.Title`, `List.Item` (Falle 1) -> natives
 *     <dl> und `Seitenkopf`.
 *   - ein Wert aus einem "use client"-Modul (Falle 6) -> alles aus `_lib/`.
 *   - ein Import aus `@ant-design/icons` (Falle 7) -> das Modul fasst das Paket
 *     nirgends an.
 *   - `<Table columns={[{ render: fn }]}>` (Falle 9) -> es gibt hier keine Tabelle.
 *
 * `encodeURIComponent` beim BAUEN des Links (Insel und Merkliste) und der von
 * Next dekodierte `params.id` beim LESEN sind das Paar: eine Zeichen-Id traegt
 * einen Doppelpunkt („rezept:E.1.1"), und ohne die Kodierung haengt es vom
 * Browser ab, was ankommt.
 */
export default async function ZeichenDetailSeite({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const zeichen = findeZeichen(id);
  const svg = svgFuer(id);
  // Beides zusammen: `findeZeichen` traegt den Text, `svgFuer` das Bild. Eine
  // unbekannte Id ist ein Zustand, kein Fehler — beide Funktionen werfen nie.
  if (zeichen === null || svg === null) notFound();

  return (
    <div className={s.modul} data-testid="zeichen-detail" style={{ display: "grid", gap: SPACE.lg }}>
      <Seitenkopf
        titel={zeichen.titel}
        beschreibung={zeichen.bedeutung}
        zurueck={{ titel: "Katalog", href: "/m/zeichen/katalog" }}
      />

      <div className={s.detailblatt}>
        <div className={s.zeichengross} dangerouslySetInnerHTML={{ __html: svg }} />
      </div>

      {/* Natives <dl>, kein `Descriptions` — der Compound-Zugriff waere HTTP 500. */}
      <dl className={s.daten}>
        <dt style={SCHRIFT.kicker}>Kapitel</dt>
        <dd style={SCHRIFT.text}>{zeichen.kapitel}</dd>
        <dt style={SCHRIFT.kicker}>Abschnitt</dt>
        <dd style={SCHRIFT.text}>{zeichen.abschnitt}</dd>
        {/* „—" statt „undefined": `symbolKindLabel('quatsch')` und
            `ORGANIZATION_LABELS[…]` liefern gemessen still `undefined`; der
            Generator hat daraus `null` gemacht, damit dieses Wort nie auf einem
            Bildschirm landet. */}
        <dt style={SCHRIFT.kicker}>Grundform</dt>
        <dd style={SCHRIFT.text}>{zeichen.grundform ?? "—"}</dd>
        <dt style={SCHRIFT.kicker}>Organisation</dt>
        <dd style={SCHRIFT.text}>{zeichen.organisation ?? "—"}</dd>
        <dt style={SCHRIFT.kicker}>Staerke</dt>
        <dd style={SCHRIFT.text}>{zeichen.staerke ?? "—"}</dd>
      </dl>

      {zeichen.zweiteDarstellung !== undefined && (
        <section style={{ display: "grid", gap: SPACE.sm }}>
          <h2 style={SCHRIFT.unterTitel}>Zweite zulaessige Darstellung</h2>
          <p style={SCHRIFT.neben}>
            Abschnitt {zeichen.zweiteDarstellung.abschnitt} — dasselbe Zeichen, andere Zeichnung.
            Beide sind richtig.
          </p>
          <div className={s.detailblatt}>
            <div
              className={s.zeichengross}
              dangerouslySetInnerHTML={{ __html: zeichen.zweiteDarstellung.svg }}
            />
          </div>
        </section>
      )}

      {/*
        ⛔ KEIN „GEPRUEFT"-ABZEICHEN, und das ist keine Auslassung (Spec §5.6):
        das TECHNISCHE Review steht auf 532/544 `approved`, das FACHLICHE auf
        544/544 `pending`. Ein gruenes Haekchen je Zeichen zeigte ausgerechnet
        das Review, das ueber die BEDEUTUNG nichts aussagt — und widerspraeche
        dem Vorbehaltskasten auf der Startseite. Gezeigt wird nur die technische
        Abweichungsnotiz der 12 betroffenen Zeichen, in einem Satz, ohne
        Dateinamen (die entfernt der Generator).
      */}
      {zeichen.reviewNotiz !== null && (
        <p className={s.hinweis} style={SCHRIFT.neben} data-testid="zeichen-reviewnotiz">
          {zeichen.reviewNotiz}
        </p>
      )}
    </div>
  );
}
```

`src/app/m/zeichen/(shell)/merkliste/page.tsx`:

```tsx
import { desc, eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { auth } from "@/core/auth";
import { Seitenkopf } from "@/core/shell/Seitenkopf";
import { getDb } from "../../_db/client";
import { merkliste } from "../../_db/schema";
import { merkAnzeige } from "../../_lib/merkliste";
import { MerklisteZeilen } from "../../_ui/MerklisteZeilen";

/*
 * DIE MERKLISTE — Server Component. Sie liest, loest ueber `merkAnzeige()` auf
 * und reicht ausschliesslich serialisierbare Daten an die Client-Komponente
 * (Falle 9).
 *
 * `orderBy(desc(erstelltAm))`: zuletzt Gemerktes zuerst. Der Zeitstempel steht in
 * SEKUNDEN (`{ mode: "timestamp" }`) — die Sortierung ist davon unberuehrt, die
 * Anzeige zeigt ihn gar nicht.
 *
 * DIE ZAHL DER VERWAISTEN ZEILEN STEHT IM KOPF, nicht nur an den Zeilen: nach
 * einem Paketupgrade ist „3 nicht mehr im Katalog" die Auskunft, die jemand
 * sucht, bevor er scrollt.
 */
export default async function MerklisteSeite() {
  const sub = (await auth())?.user?.id;
  if (!sub) notFound();

  const zeilen = getDb()
    .select({
      zeichenId: merkliste.zeichenId,
      titelSchnappschuss: merkliste.titelSchnappschuss,
    })
    .from(merkliste)
    .where(eq(merkliste.sub, sub))
    .orderBy(desc(merkliste.erstelltAm))
    .all();

  const anzeige = merkAnzeige(zeilen);
  const verwaist = anzeige.filter((z) => z.verwaist).length;

  return (
    <>
      <Seitenkopf
        titel="Merkliste"
        beschreibung={
          verwaist === 0
            ? `${anzeige.length} Zeichen.`
            : `${anzeige.length} Zeichen, davon ${verwaist} nicht mehr im Katalog.`
        }
      />
      <div className={s.modul}>
        <MerklisteZeilen zeilen={anzeige} />
      </div>
    </>
  );
}
```

- [ ] **Schritt 19: Die Release-Notiz schreiben und eintragen**

`src/app/m/portal/_lib/neuigkeiten/notizen/zeichen/2026-09-02-taktische-zeichen-nachschlagen.ts`:

```ts
// Stilregeln fuer Notizen: CLAUDE.md, Abschnitt „Release Notes".
// Zielgruppe: jeder Angemeldete — das Modul traegt `requiredGroups: []`, die
// Kachel und damit diese Notiz sieht, wer sich anmelden kann.
//
// DER TITEL WIEDERHOLT DEN APP-NAMEN NICHT. Spec §10 schlaegt „Taktische Zeichen
// nachschlagen und merken" vor; CLAUDE.md verbietet die Wiederholung
// ausdruecklich, und der Modultitel steht ohnehin daneben (er kommt aus
// core/registry.ts). Der Dateiname und der slug bleiben wie in der Spec — der
// slug ist die Sprungmarke unter /neuigkeiten und wird von register.test.ts
// gegen den Dateinamen gehalten.
import { absatz, type Releasenotiz } from "@/app/m/portal/_lib/neuigkeiten/typen";

const notiz: Releasenotiz = {
  modul: "zeichen",
  slug: "taktische-zeichen-nachschlagen",
  datum: "2026-09-02",
  titel: "Zeichen nachschlagen und auf eine Merkliste legen",
  inhalt: [
    absatz(
      "In der Suite gibt es eine neue App fuer taktische Zeichen. Unter Katalog stehen alle " +
        "Zeichen mit Bild, Bedeutung, Kapitel und Abschnitt; ein Klick auf ein Zeichen oeffnet " +
        "die Einzelheiten direkt ueber der Liste, ohne dass du die Seite verlaesst. Was du " +
        "oefter brauchst, legst du mit „Merken“ ab und findest es unter Merkliste wieder.",
    ),
    absatz(
      "An den Apps, die du schon benutzt, aendert sich nichts. Die Anmeldung ist dieselbe, und " +
        "fuer die neue App brauchst du keine zusaetzliche Berechtigung: wer angemeldet ist, kann " +
        "nachschlagen.",
    ),
    absatz(
      "Die Suche liest neben den Titeln auch die Bedeutungen mit, deshalb fuehren Kuerzel wie " +
        "SEG, RTW oder KTW zu Treffern. Umlaute kannst du weglassen — „loeschgruppe“ findet " +
        "„Löschgruppe“. Umgangssprachliche Fahrzeugnamen findet sie nicht: auf „Drehleiter“ " +
        "oder „Krankenwagen“ kommt nichts zurueck, weil der Katalog diese Eintraege nicht " +
        "fuehrt. In dem Fall helfen die Filter Kapitel, Organisation und Grundform weiter.",
    ),
    absatz(
      "Die Bedeutungen folgen einem Entwurf, dessen fachliche Pruefung noch laeuft. Zum " +
        "Nachschlagen und Einordnen taugt er; fuer eine verbindliche Auskunft gilt die " +
        "Dienstvorschrift deiner Organisation. Bei einzelnen Zeichen steht unter dem Bild ein " +
        "Satz zu einer bekannten zeichnerischen Abweichung.",
    ),
  ],
};

export default notiz;
```

In `src/app/m/portal/_lib/neuigkeiten/register.ts` — **zwei** Zeilen, sonst ist der Test rot.
Bei den Importen (nach den `radio`-Zeilen, vor den `uav`-Zeilen):

```ts
import zeichenNachschlagen from "@/app/m/portal/_lib/neuigkeiten/notizen/zeichen/2026-09-02-taktische-zeichen-nachschlagen";
```

und in der Liste `NOTIZEN`, am Ende:

```ts
  zeichenNachschlagen,
```

- [ ] **Schritt 20: Die Gates laufen lassen**

Kommando:
```bash
pnpm typecheck && pnpm lint && pnpm vitest run src/app/m/zeichen src/app/m/portal/_lib/neuigkeiten
```
Erwartet: `typecheck` grün (Exit-Code 0 — **die Meldung nicht mit `grep "error TS"` prüfen**,
auf farbigem Output steht dort eine ANSI-Sequenz zwischen `error` und `TS`). `lint` ohne Fehler;
Warnungen blockieren nicht. Vitest PASS für `merkliste.test.ts` (4), `actions.test.ts` (7),
`KatalogInsel.test.tsx` (8), `MerklisteZeilen.test.tsx` (5), `registry.test.ts`,
`_db/migrations.test.ts`, `_lib/*.test.ts` **und** `register.test.ts` — Letzterer wird genau
dann rot, wenn die Registerzeile aus Schritt 19 fehlt.

Danach der volle Lauf:
```bash
pnpm vitest run && pnpm build
```
Erwartet: alles grün. **`pnpm build` ist hier keine Formalie:** er ist die erste Stelle, an der
ein versehentlicher `@einsatzzeichen`-Import im Server-Graph auffiele (`ERR_INVALID_ARG_TYPE` in
der Phase „Collecting page data") — `_lib/naht.test.ts` fängt ihn früher, aber nur für die vier
Importformen, die er kennt.

---

- [ ] **Schritt 21: DER ERSTE ECHTE ABRUF GEGEN `next dev`**

**Das ist der Kern dieser Aufgabe, kein Anhang.** Vier der zwölf Fallen aus `CLAUDE.md` ergeben
HTTP 500 und werden von `typecheck`, `lint`, Vitest **und** `build` strukturell nicht gesehen —
sie zeigen sich ausschließlich bei einem echten Abruf. Bis hierher hat noch keine einzige Zeile
dieses Moduls je in einer RSC-Umgebung gestanden.

Vorbereiten:

```bash
cd /home/rubeen/dev/iuk-suite
pnpm seed:lokal zeichen     # legt Merkzeilen fuer dev:demo@localtest.me an
pnpm dev                    # next dev auf Port 3000; Dev-Login ist ausserhalb
                            # von production per Vorgabe an (core/auth/devLogin.ts)
```

Im Browser: `http://zeichen.localtest.me:3000/login?callbackUrl=%2Fkatalog`, dort mit
`demo@localtest.me` anmelden (Gruppenfeld leer lassen — das Modul verlangt keine Zugangsgruppe).
Danach **diese vier Adressen der Reihe nach**:

| # | Adresse | Was zu sehen ist, wenn es trägt |
|---|---|---|
| 1 | `http://zeichen.localtest.me:3000/katalog` | Die Suchzeile mit vier Feldern, darunter „246 von 246 Zeichen" und 48 Kacheln mit **sichtbaren Zeichen** (nicht 48 leere Kästen). Tippe `loeschgruppe` — die Zahl fällt, das Raster wechselt **ohne Seitenwechsel**. |
| 2 | Klick auf eine Kachel | Der Detailbereich erscheint **über** dem Raster, die Adresszeile bekommt `?z=rezept:…` angehängt, **und der Netzwerkteil der Entwicklerwerkzeuge bleibt still** — keine RSC-Anfrage. Genau das ist die Zusage, die `/offline` in Aufgabe 9 braucht. |
| 3 | „Merken" klicken, dann `http://zeichen.localtest.me:3000/merkliste` | Das eben gemerkte Zeichen steht in der Liste, mit Bild und Bedeutung; die drei Seed-Zeilen ebenfalls. „Entfernen" lässt die Zeile verschwinden. |
| 4 | `http://zeichen.localtest.me:3000/katalog/rezept%3AC.1.1` | Das Zeichen groß, Bedeutung, `<dl>` mit fünf Zeilen, ggf. zweite Darstellung. **Danach im Browser „Seitenquelltext anzeigen" und nach `<svg` suchen — es MUSS dort stehen.** Steht es nur im DOM-Inspektor, aber nicht im Quelltext, kommt es aus dem Client-JS und die Seite ist keine Server Component mehr. |

**Was du siehst, wenn es bricht** — vier Fehlerbilder, jedes mit seiner Ursache:

```
TypeError: Cannot read properties of undefined (reading 'Item')
```
→ **Falle 1.** Irgendwo in einer der drei Seiten steht doch ein Compound-Zugriff auf antd
(`Descriptions.Item`, `Typography.Title`, `List.Item`, `Form.Item`). Lösung: natives Markup,
`Seitenkopf` für die Überschrift.

```
TypeError: (0 , _react.createContext) is not a function
```
→ **Falle 7**, und zwar **schon beim Import, nicht beim Rendern**: eine Datei im Server-Graph
importiert `@ant-design/icons`. `"use client"` daraufzusetzen behebt es **nicht**, es macht es
still. Das Modul fasst das Paket nirgends an — findet sich der Import doch, nennt
`src/core/shell/icons.test.ts` die Datei beim Namen.

```
Error: Functions cannot be passed directly to Client Components unless you
explicitly expose it by marking it with "use server".
```
→ **Falle 9.** Eine Funktion überquert die RSC-Grenze — in dieser Aufgabe fast sicher, weil jemand
`MerklisteZeilen` einen Handler statt der Daten gibt, oder weil ein antd-`Table` mit
`columns[].render` in eine Seite gerutscht ist. Lösung: nur serialisierbare Daten als Prop,
Server Actions **direkt importieren**.

```
HTTP 500, und im Log: eine Client-Referenz statt eines Wertes
```
→ **Falle 6.** Eine Server Component liest einen Wert aus einem `"use client"`-Modul. Alle Werte
dieses Moduls liegen in `_lib/` — prüfe, ob jemand `_ui/` importiert hat, wo `_lib/` gemeint war.

**Ein leeres Kästchen statt eines Zeichens** ist kein 500 und trotzdem ein Befund: dann greift
`.zeichenflaeche > svg { width: 100% }` nicht (das SVG bringt nur eine `viewBox` mit und fiele
sonst auf 300×150 zurück — dieselbe Ursache, die `qr/QrDisplay.tsx` schon einmal gekostet hat),
oder das Generat trägt an dieser ID einen leeren String.

**Zwei Dinge bleiben in diesem Schritt bewusst ungeprüft** und stehen als Handläufe in Spec §9:
ob Arimo im Browser wirklich steht (H2 — jsdom rechnet keine Glyphen; sichtbar an einem Zeichen
mit langer Beschriftung wie „MLW IV Lbw"), und ob Nexts File-Tracing die Schrift ins Image zieht
(H1 — `docker build`, dann `find .next/standalone -name '*.ttf'`).

- [ ] **Schritt 22: Commit**

```bash
git add src/app/m/zeichen/_lib/merkliste.ts src/app/m/zeichen/_lib/merkliste.test.ts \
        src/app/m/zeichen/actions.ts src/app/m/zeichen/actions.test.ts \
        src/app/m/zeichen/_ui/zeichen.module.css \
        src/app/m/zeichen/_ui/KatalogInsel.tsx src/app/m/zeichen/_ui/KatalogInsel.test.tsx \
        src/app/m/zeichen/_ui/MerklisteZeilen.tsx src/app/m/zeichen/_ui/MerklisteZeilen.test.tsx \
        "src/app/m/zeichen/(shell)/katalog" "src/app/m/zeichen/(shell)/merkliste" \
        src/app/m/portal/_lib/neuigkeiten/notizen/zeichen/ \
        src/app/m/portal/_lib/neuigkeiten/register.ts
git commit -m "feat(zeichen): Katalog, Detailseite und Merkliste (DRK-247)

Suche, drei Filter und ein Detailbereich auf derselben Seite (?z=<id>); die
Einzelseite /katalog/[id] als reine Server Component; die Merkliste mit zwei
Server Actions.

Server und Client rufen DIESELBE sucheZeichen() auf demselben Generat auf —
deshalb hydriert die Insel ohne Mismatch, und deshalb liegt die Filterfunktion
in _lib/ ohne \"use client\". Die Insel navigiert NICHT: die Auswahl wird mit
history.replaceState in die Adresszeile geschrieben. Ein router.push loeste auf
/offline (Aufgabe 9) einen RSC-Abruf aus, den es ohne Netz nicht gibt — ein
Codepfad fuer online und offline statt zwei.

Die Merkliste nimmt IMMER das Generat als Anzeigequelle, der
titel_schnappschuss ist der Rueckfall; sonst laufen zwei Fassungen desselben
Titels bei jeder Katalogkorrektur auseinander. Eine Zeile ohne Aufloesung
bleibt sichtbar, erklaert sich und laesst sich entfernen — entferneZeichen
prueft deshalb bewusst NICHT gegen den Katalog, sonst waere ausgerechnet diese
Zeile die einzige, die niemand mehr loswird.

Die Detailseite rendert das SVG serverseitig aus dem eingecheckten Generat und
traegt KEIN 'geprueft'-Abzeichen: technisch 532/544 approved, fachlich 544/544
pending — ein Haekchen je Zeichen zeigte das Review, das ueber die Bedeutung
nichts aussagt.

Erster echter Abruf gegen next dev ist gelaufen (Katalog, Auswahl ohne
Netzanfrage, Merken/Entfernen, /katalog/rezept%3AC.1.1 mit <svg> im
Seitenquelltext). Das ist die einzige Pruefung, die die RSC-Fallen 1, 6, 7
und 9 ueberhaupt sehen kann.

Release-Notiz 1 von 4 liegt im selben Commit."
```

---

## Aufgabe 7: Baukasten — Wertesperrung, Regeltexte, Export, Speichern, Bauübung

Setzt Spec §6 (vollständig), §3.4, §4.3 und Commit 7 aus §10 um.

**Dateien:**
- Ändern: `package.json` · `pnpm-lock.yaml` (`@einsatzzeichen/schema`)
- Ändern: `src/app/m/zeichen/_ui/baukasten/paket.ts` (weitere Re-Exporte)
- Ändern: `src/app/m/zeichen/_ui/baukasten/BaukastenInsel.tsx` (aus dem Gerüst von Aufgabe 2)
- Ändern: `src/app/m/zeichen/actions.ts` (Aufgabe 6 hat sie angelegt)
- Ändern: `src/app/m/portal/_lib/neuigkeiten/register.ts`
- Neu: `src/app/m/zeichen/_ui/baukasten/vokabular.ts` · `zustand.ts` · `AchsenFelder.tsx` ·
  `SpeichernFormular.tsx` · `baukasten.module.css`
- Neu: `src/app/m/zeichen/_lib/regeltexte.ts` · `_lib/pruefung.ts`
- Neu: `src/app/m/zeichen/_db/eigeneZeichen.ts`
- Neu: `src/app/m/zeichen/(shell)/baukasten/page.tsx` · `(shell)/meine/page.tsx`
- Neu: `src/app/m/portal/_lib/neuigkeiten/notizen/zeichen/2026-09-02-eigene-zeichen-bauen.ts`
- Test: `_ui/baukasten/vokabular.test.ts` · `_ui/baukasten/zustand.test.ts` ·
  `_ui/baukasten/BaukastenInsel.test.tsx` · `_lib/regeltexte.test.ts` · `_lib/pruefung.test.ts` ·
  `_db/eigeneZeichen.test.ts`

**Schnittstellen:**

- **Nutzt:**
  - `_ui/baukasten/paket.ts`, `BaukastenLader.tsx`, `BaukastenInsel.tsx` — das Gerüst aus Aufgabe 2,
    Schritt 18. `BaukastenLader` bleibt unverändert (`dynamic(..., { ssr: false })`).
  - `_lib/kanon.ts` — `ORDNUNG`, `kanonischerSchluessel(spec)` (Aufgabe 2).
  - `_lib/bezeichnungen.ts` — `BODY_VARIANT_NAMEN`, `koerperformName(id)` (Aufgabe 2).
  - `_lib/katalog.ts` — `alleZeichen()`, `findeZeichen(id)`, `KATALOG_STAND`, `type Zeichen`.
  - `_db/client.ts` (`getDb`, `type DB`), `_db/schema.ts` (`eigeneZeichen`, `newId`),
    `_db/testdb.ts` (`testDb()`).
  - `actions.ts` aus Aufgabe 6 — wird **erweitert**, nicht ersetzt.
  - `@/core/shell/Seitenkopf`, `@/core/theme/schrift` (`SCHRIFT`), `@/core/theme/tokens` (`SPACE`),
    `@/core/auth` (`auth()`).
  - `src/app/m/qr/_lib/test-dom.tsx` — kein zweites Harness.
- **Liefert:**
  - `_ui/baukasten/vokabular.ts`: `ACHSEN`, `type Achse`, `kandidaten(feld)`, `bezeichnung(feld, id)`,
    `FARBWORTE`.
  - `_ui/baukasten/zustand.ts`: `reduceSpec`, `setzeBeschriftung`, `ohneTexte`, `baue`,
    `erlaubteWerte`, `LISTENFELDER`, `kodiereSpec`, `dekodiereSpec`, `ziehePruefaufgabe`,
    `felddifferenz`, `type BauErgebnis`, `type Wertbefund`.
  - `_lib/regeltexte.ts`: `REGELTEXTE`, `regeltext(id)`, `TEXTLAUF_REGELN`.
  - `_lib/pruefung.ts`: `specFormFehler`, `svgFormFehler`, `konfliktFrage`, `SVG_MAX_ZEICHEN`.
  - `_db/eigeneZeichen.ts`: `eigeneZeichenVon`, `eigenesZeichenMitNamen`, `eigenesZeichenMitKanon`,
    `legeEigenesZeichenAn`, `ueberschreibeEigenesZeichen`.
  - `actions.ts`: `speichereEigenesZeichen`, `type SpeichernZustand`.
  - Die Routen `/m/zeichen/baukasten` und `/m/zeichen/meine`.

> **Vier Dinge in dieser Aufgabe sind Reparaturen und werden nicht wegoptimiert.**
>
> 1. **`/meine` rendert das gespeicherte SVG als `<img src="data:image/svg+xml;base64,…">`, nie mit
>    `dangerouslySetInnerHTML`.** Es ist vom Client geliefertes Markup, das die Server Action
>    fachlich nicht nachprüfen kann (Spec §4.3). In einem `<img>` führt ein SVG kein Script aus und
>    lädt nichts nach. Die Formprüfung beim Speichern ist **Hygiene, nicht der Riegel** — der Riegel
>    ist das `<img>`. Die Katalog-Detailseite aus Aufgabe 6 rendert weiter mit
>    `dangerouslySetInnerHTML`, weil ihr SVG aus dem eingecheckten Generat stammt.
> 2. **Die Action prüft nur die FORM der Spec, nicht ihre fachliche Gültigkeit.** Eine fachliche
>    Prüfung bräuchte `composeFromCatalog` und zöge damit den Katalog in den Server-Graph — M1, und
>    `pnpm build` bräche mit `ERR_INVALID_ARG_TYPE` in der Phase „Collecting page data".
> 3. **Beide Konfliktfälle fragen ZURÜCK, statt zu entscheiden** (Spec §6.6). Gleicher Name →
>    „Überschreiben oder anders benennen?"; gleiche Zusammenstellung → „Trotzdem zusätzlich
>    sichern?". Nichts wird still überschrieben; genau deshalb trägt `spec_kanon` keinen
>    `uniqueIndex` (Aufgabe 3).
> 4. **`validateSpec` wird NICHT benutzt.** Gemessen hat es falsch-negative Befunde (unbekannte IDs
>    und Vermessungslücken passieren es) **und** falsch-positive: ohne `ValidationContext` lehnt es
>    alle 25 Funktionsrollen ab, 0 gültige Paare statt 8. Zwei Prüfwege, die sich widersprechen,
>    sind unwartbar. Geprüft wird ausschließlich durch **Komponieren und Auffangen**.

> **Kein `Form`/`Form.Item`** — Compound-Zugriff, in einer Server Component verboten (Falle 1), und
> in der Insel dann eine zweite Bauform für dasselbe. Stattdessen `useActionState` mit nativem
> `<label htmlFor>`, `aria-invalid`, `aria-describedby` und **gedämpftem** Fehlertext:
> `colorError === colorPrimary === #c8000f` (Falle 3), ein roter Fehlertext sieht in diesem Modul
> aus wie eine Primäraktion. **Kein `size` an irgendeinem Bedienelement** (Falle 4); eigenes Markup
> trägt `minHeight: 44` als Literal.

- [ ] **Schritt 1: `@einsatzzeichen/schema` prüfen — die Installation gehört in Aufgabe 2**

> ⚠️ **Diese Abhängigkeit muss bereits in Aufgabe 2, Schritt 1 mitinstalliert worden sein.**
> `_lib/kanon.ts` und `_lib/katalog.ts` schreiben dort schon
> `import type { SymbolSpec } from "@einsatzzeichen/schema"`, und pnpm arbeitet ohne
> `.npmrc` mit isoliertem `node_modules` — das transitive Paket ist aus `src/` nicht
> auflösbar. Wäre es erst hier installiert, stünde `pnpm typecheck` in den Aufgaben 2, 5
> und 6 rot, und ein echter Fehler ginge darin unter. Fehlt es: nachinstallieren und den
> Commit von Aufgabe 2 ergänzen, nicht hier.

```bash
pnpm add @einsatzzeichen/schema@^1.1.0
```

Erwartet: `+ @einsatzzeichen/schema 1.1.0` in `package.json` unter `dependencies`.

Warum ausdrücklich und nicht transitiv: das Repo hat **keine `.npmrc`**, pnpm arbeitet also mit
isoliertem `node_modules` — ein Paket, das nur `@einsatzzeichen/catalog` als Abhängigkeit führt, ist
aus `src/` **nicht auflösbar**. Aufgabe 2 schreibt bereits `import type { SymbolSpec } from
"@einsatzzeichen/schema"` in `_lib/katalog.ts`; ohne diesen Schritt ist das ein
`Cannot find module`-Typfehler. Diese Aufgabe braucht zusätzlich **Werte** daraus (`SYMBOL_KINDS`,
`BODY_VARIANT_IDS`, `PALETTE`) — die Achsenlisten des Baukastens.

⛔ Der Wertimport aus `@einsatzzeichen/schema` steht **ausschließlich in `paket.ts`**. `naht.test.ts`
(Aufgabe 2) prüft auf das Präfix `@einsatzzeichen/`, nicht auf einzelne Pakete: ein Wertimport aus
`schema` in einer dritten Datei ist derselbe rote Test wie einer aus `catalog`. Das ist richtig so —
`schema` ist im Server-Graph zwar harmlos, aber die Ausnahmenliste soll nicht durch eine Nebentür
wachsen.

- [ ] **Schritt 2: Den fehlschlagenden Test für das Vokabular schreiben**

`src/app/m/zeichen/_ui/baukasten/vokabular.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { BODY_VARIANT_IDS, PALETTE } from "@einsatzzeichen/schema";
import { ACHSEN, FARBWORTE, bezeichnung, kandidaten } from "./vokabular";
import { BODY_VARIANT_NAMEN } from "../../_lib/bezeichnungen";

/*
 * Eine Testdatei darf @einsatzzeichen direkt importieren: `naht.test.ts` schliesst
 * `*.test.ts`/`*.test.tsx` aus dem Scan aus, und Vitest laeuft in Node — die
 * Modulebenen-Aufrufe aus `fonts.js`, die `pnpm build` brechen (M1), sind hier
 * unbedenklich. Nur Produktivcode geht durch `paket.ts`.
 */

describe("Vokabular des Baukastens", () => {
  /*
   * DIE REIHENFOLGE IST VON DEN DATEN ERZWUNGEN, nicht Geschmack (Spec §6.1):
   * `kind` entscheidet, welche Achsen ueberhaupt existieren; die Kopfzone ist EIN
   * Feld aus drei Quellen, weil drei getrennte Felder gemessen bei jedem zweiten
   * Klick `head-zone-conflict` erzeugten. Wer die Reihenfolge aendert, aendert die
   * Bedienbarkeit — dieser Test macht das zu einer bewussten Entscheidung.
   */
  it("fuehrt genau neun Achsen in der erzwungenen Reihenfolge", () => {
    expect(ACHSEN.map((a) => a.key)).toEqual([
      "grundzeichenart", "zugehoerigkeit", "kopfzone", "funktion", "fussstreifen",
      "koerperform", "faehigkeit", "koerpermarken", "beschriftung",
    ]);
  });

  /*
   * Zahlen aus Spec §6.1, gemessen gegen 1.1.0. Sie werden beim Paketupgrade
   * ANGEHOBEN, nicht geloescht — dieselbe Regel wie bootstrap.test.ts:718. Eine
   * neue Achse, die niemand bemerkt, waere ein Feld, das der Baukasten nie zeigt.
   */
  it("kennt die gemessenen Wertemengen je Achse", () => {
    expect(kandidaten("kind").length).toBe(19);
    expect(kandidaten("organization").length).toBe(9);
    expect(kandidaten("strength").length).toBe(4);
    expect(kandidaten("administrativeLevel").length).toBe(6);
    expect(kandidaten("technicalHeadMark").length).toBe(1);
    expect(kandidaten("functionRole").length).toBe(25);
    expect(kandidaten("vehicleCategory").length).toBe(8);
    expect(kandidaten("bodyVariant").length).toBe(10);
    expect(kandidaten("capabilities").length).toBe(88);
    expect(kandidaten("bodyMarks").length).toBe(132);
  });

  /*
   * ⛔ DER WAECHTER GEGEN EINE ENGLISCHE ID AUF DEM BILDSCHIRM. `koerperformName`
   * faellt auf die rohe ID zurueck — richtig, damit nie eine leere Stelle steht,
   * aber still. Dieser Test macht die Luecke laut: fuer JEDE vom Paket gefuehrte
   * Koerperform muss ein deutscher Name in `_lib/bezeichnungen.ts` stehen.
   *
   * GEHT ER ROT, IST `BODY_VARIANT_NAMEN` ZU KORRIGIEREN, NICHT DIESER TEST.
   */
  it("hat fuer jede Koerperform des Pakets einen deutschen Namen", () => {
    for (const id of BODY_VARIANT_IDS) {
      expect(Object.keys(BODY_VARIANT_NAMEN), id).toContain(id);
      expect(bezeichnung("bodyVariant", id), id).not.toBe(id);
    }
  });

  /** Dieselbe Luecke fuer die Farbtoken der technischen Fuellung. */
  it("hat fuer jeden Farbtoken ein deutsches Wort", () => {
    for (const token of Object.keys(PALETTE)) {
      expect(Object.keys(FARBWORTE), token).toContain(token);
    }
  });

  /*
   * M9: `symbolKindLabel('quatsch')` liefert STILL `undefined`, und
   * `describeSymbolSpec({kind:'quatsch'})` schreibt das Wort „undefined" in einen
   * deutschen Satz. Die Naht faengt das ab, statt es durchzureichen.
   */
  it("schreibt nie das Wort undefined auf den Bildschirm", () => {
    for (const achse of ACHSEN) {
      for (const feld of achse.felder) {
        for (const id of kandidaten(feld)) {
          expect(bezeichnung(feld, id), `${feld}/${id}`).not.toMatch(/undefined/);
          expect(bezeichnung(feld, id).trim(), `${feld}/${id}`).not.toBe("");
        }
      }
    }
    expect(bezeichnung("kind", "gibtsnicht")).toBe("gibtsnicht");
  });
});
```

- [ ] **Schritt 3: Test laufen lassen und Fehlschlag bestätigen**

Kommando: `pnpm vitest run src/app/m/zeichen/_ui/baukasten/vokabular.test.ts`
Erwartet: FAIL — `Failed to resolve import "./vokabular"`.

- [ ] **Schritt 4: `paket.ts` um die Register erweitern**

`src/app/m/zeichen/_ui/baukasten/paket.ts` — die bestehenden Re-Exporte bleiben, es kommen die
Register dazu, aus denen das Vokabular entsteht:

```ts
"use client";

/*
 * DER EINZIGE ORT im Repo (neben scripts/zeichen-generat.ts), der Katalog-CODE
 * importiert. Er wird ausschliesslich ueber BaukastenLader.tsx mit
 * dynamic(..., { ssr: false }) geladen und deshalb NIE serverseitig ausgewertet —
 * das ist die gemessene Bedingung dafuer, dass next.config.ts unangetastet bleibt.
 * Ein Import aus einer Server Component oder aus einer SSR-gerenderten Client-
 * Komponente bricht `pnpm build` (siehe _lib/naht.test.ts).
 *
 * WARUM HIER ZWOELF NAMEN MEHR STEHEN ALS NACH AUFGABE 2: der Baukasten braucht
 * die WERTELISTEN seiner neun Achsen und die deutschen Bezeichnungen dazu. Beides
 * fuehrt das Paket bereits — eine handgeschriebene zweite Liste im Modul liefe mit
 * dem naechsten Upgrade auseinander, ohne dass irgendetwas rot wuerde. Die einzige
 * Ausnahme bleibt `bodyVariant`: dafuer exportiert das Paket gemessen NICHTS, und
 * die Namen stehen deshalb in `_lib/bezeichnungen.ts`.
 */
export {
  composeFromCatalog, RECIPES, BASE_SYMBOLS, describeSymbolSpec, symbolKindLabel,
  ORGANIZATION_LABELS, STRENGTH_LABELS, ADMIN_LEVEL_LABELS, TECHNICAL_HEAD_MARK_LABELS,
  VEHICLE_CATEGORY_LABELS, TECHNICAL_BODY_MARK_LABELS, FUNCTION_ROLE_DEFINITIONS,
  functionRole, pictogram, ALL_PICTOGRAMS, BODY_MARK_IDS,
} from "@einsatzzeichen/catalog";
export {
  renderSvg, renderCanvas, rasterDimensionsForWidth,
  CompositionError, NotMeasuredError, BodyNotMeasuredError, VALIDATION_RULE_IDS,
} from "@einsatzzeichen/core";
/*
 * Die Wertelisten der Achsen stehen im Schema-Paket: `SYMBOL_KINDS` und
 * `BODY_VARIANT_IDS` entstehen dort als Schluessel eines `Record<X, true>` — eine
 * fehlende Union-Variante ist ein Compilerfehler, die Vollstaendigkeit haengt also
 * nicht an einem Test. `PALETTE` traegt die dreizehn Farbtoken der technischen
 * Fuellung.
 */
export { SYMBOL_KINDS, BODY_VARIANT_IDS, PALETTE } from "@einsatzzeichen/schema";
```

- [ ] **Schritt 5: Das Vokabular schreiben**

`src/app/m/zeichen/_ui/baukasten/vokabular.ts`:

```ts
"use client";

import type { SymbolSpec } from "@einsatzzeichen/schema";
import {
  ADMIN_LEVEL_LABELS, ALL_PICTOGRAMS, BODY_MARK_IDS, BODY_VARIANT_IDS,
  FUNCTION_ROLE_DEFINITIONS, ORGANIZATION_LABELS, PALETTE, STRENGTH_LABELS,
  SYMBOL_KINDS, TECHNICAL_BODY_MARK_LABELS, TECHNICAL_HEAD_MARK_LABELS,
  VEHICLE_CATEGORY_LABELS, functionRole, pictogram, symbolKindLabel,
} from "./paket";
import { koerperformName } from "../../_lib/bezeichnungen";

/**
 * DIE NEUN ACHSEN DES BAUKASTENS, in der von den Daten erzwungenen Reihenfolge.
 *
 * Gemessen tragen von 225.720 aufgezaehlten Kombinationen der fuenf Hauptachsen
 * 894 — 0,4 % (M16). Sechs unabhaengige Auswahlfelder produzierten also in
 * 99,6 % der Faelle Unsinn: der Baukasten MUSS sperren, nicht hinterher meckern.
 *
 * Drei Achsen fassen mehrere Spec-Felder zu EINEM Bedienfeld zusammen, und jede
 * hat ihren gemessenen Grund:
 *   - Zugehoerigkeit: `organization` und `technicalFill` schliessen sich aus
 *     (`technical-fill-organization-conflict`).
 *   - Kopfzone: `strength`, `administrativeLevel` und `technicalHeadMark` teilen
 *     sich den Platz ueber dem Koerper — als drei Felder erzeugte jeder zweite
 *     Klick `head-zone-conflict`.
 *   - Unter dem Koerper: `vehicleCategory` und `designation` belegen denselben
 *     Streifen (`chassis-foot-conflict`).
 *
 * NICHT IN DER OBERFLAECHE: die elf Metrikfelder in `BodyLabels`. Das sind
 * Quellenvermessungen, kein Nutzerregler. Stammt eine Spec aus einem Rezept,
 * werden sie unveraendert DURCHGEREICHT — ein Verwerfen aenderte das Bild.
 */
export interface Achse {
  key: string;
  titel: string;
  /** Die Spec-Felder, die dieses eine Bedienfeld setzt. */
  felder: readonly (keyof SymbolSpec)[];
  art: "kacheln" | "wahl" | "mehrfach" | "fussstreifen" | "beschriftung";
  hilfe: string;
}

export const ACHSEN: readonly Achse[] = [
  { key: "grundzeichenart", titel: "Grundzeichenart", felder: ["kind"], art: "kacheln",
    hilfe: "Entscheidet, welche weiteren Felder es überhaupt gibt." },
  { key: "zugehoerigkeit", titel: "Zugehörigkeit", felder: ["organization", "technicalFill"],
    art: "wahl", hilfe: "Organisation oder technische Füllung — beides zusammen geht nicht." },
  { key: "kopfzone", titel: "Kopfzone",
    felder: ["strength", "administrativeLevel", "technicalHeadMark"], art: "wahl",
    hilfe: "Stärke, Verwaltungsstufe oder technische Kopfmarke — sie teilen sich den Platz." },
  { key: "funktion", titel: "Funktion", felder: ["functionRole"], art: "wahl",
    hilfe: "Führungs- und Funktionszeichen aus den Anhängen D.1, D.3 und D.4." },
  { key: "fussstreifen", titel: "Unter dem Körper", felder: ["vehicleCategory", "designation"],
    art: "fussstreifen", hilfe: "Fahrzeugkategorie oder eigener Text — derselbe Streifen." },
  { key: "koerperform", titel: "Körperform", felder: ["bodyVariant"], art: "wahl",
    hilfe: "Zweite belegte Zeichnung derselben Grundzeichenart." },
  { key: "faehigkeit", titel: "Fähigkeit", felder: ["capabilities"], art: "wahl",
    hilfe: "Eine Fähigkeit. Mehrere landen in derselben Box und überlagern sich." },
  { key: "koerpermarken", titel: "Körpermarken", felder: ["bodyMarks"], art: "mehrfach",
    hilfe: "Mehrere möglich." },
  { key: "beschriftung", titel: "Beschriftung", felder: ["labels"], art: "beschriftung",
    hilfe: "Fünf Zonen im Körper. Lange Texte laufen aus ihrer Zone." },
];

/**
 * Deutsche Woerter fuer die dreizehn Farbtoken. Das Paket exportiert dafuer kein
 * Register (`COLOR_WORDS` liegt in `packages/website`, `"private": true`), und
 * ein Token wie `funktionslauf-kontrast` hat in einem Auswahlfeld nichts verloren,
 * das auch jemand ohne Technikbezug bedient. `vokabular.test.ts` haelt die Liste
 * gegen `PALETTE`.
 */
export const FARBWORTE: Record<string, string> = {
  schwarz: "Schwarz",
  "funktionslauf-kontrast": "Schwarz (Funktionslauf)",
  weiss: "Weiß",
  rot: "Rot",
  blau: "Blau",
  gelb: "Gelb",
  gruen: "Grün",
  hellgruen: "Hellgrün",
  orange: "Orange",
  braun: "Braun",
  grau: "Grau",
  hellgrau: "Hellgrau",
  hellblau: "Hellblau",
};

const KAPABILITAETEN = ALL_PICTOGRAMS.filter(
  (p) => p.variant === "primary" && p.id.startsWith("capability."),
).map((p) => ({ id: p.id.slice("capability.".length), titel: p.title }));

const KAPABILITAET_TITEL = new Map(KAPABILITAETEN.map((e) => [e.id, e.titel]));

/** Die Kandidaten einer Spec-Achse. Ein unbekanntes Feld hat keine — kein Wurf. */
export function kandidaten(feld: keyof SymbolSpec | string): readonly string[] {
  switch (feld) {
    case "kind": return SYMBOL_KINDS;
    case "organization": return Object.keys(ORGANIZATION_LABELS);
    case "technicalFill": return Object.keys(PALETTE);
    case "strength": return Object.keys(STRENGTH_LABELS);
    case "administrativeLevel": return Object.keys(ADMIN_LEVEL_LABELS);
    case "technicalHeadMark": return Object.keys(TECHNICAL_HEAD_MARK_LABELS);
    case "functionRole": return Object.keys(FUNCTION_ROLE_DEFINITIONS);
    case "vehicleCategory": return Object.keys(VEHICLE_CATEGORY_LABELS);
    case "bodyVariant": return BODY_VARIANT_IDS;
    case "capabilities": return KAPABILITAETEN.map((e) => e.id);
    case "bodyMarks": return BODY_MARK_IDS;
    default: return [];
  }
}

/**
 * Die deutsche Bezeichnung eines Wertes.
 *
 * RUECKFALL AUF DIE ROHE ID STATT EINES WURFS: eine Spec aus einem geteilten Link
 * kann einen Wert tragen, den das Paket nicht mehr fuehrt — die Kennung zu zeigen
 * ist dann die ehrlichere Auskunft als eine leere Stelle. Dass der Rueckfall nicht
 * zum Normalfall wird, sichert `vokabular.test.ts` ab.
 */
export function bezeichnung(feld: keyof SymbolSpec | string, id: string): string {
  switch (feld) {
    case "kind": return symbolKindLabel(id as never) ?? id;
    case "organization": return ORGANIZATION_LABELS[id as never] ?? id;
    case "technicalFill": return FARBWORTE[id] ?? id;
    case "strength": return STRENGTH_LABELS[id as never] ?? id;
    case "administrativeLevel": return ADMIN_LEVEL_LABELS[id as never] ?? id;
    case "technicalHeadMark": return TECHNICAL_HEAD_MARK_LABELS[id as never] ?? id;
    case "functionRole": return sicherFunktionstitel(id);
    case "vehicleCategory": return VEHICLE_CATEGORY_LABELS[id as never] ?? id;
    case "bodyVariant": return koerperformName(id);
    case "capabilities": return KAPABILITAET_TITEL.get(id) ?? id;
    case "bodyMarks": return koerpermarkeName(id);
    default: return id;
  }
}

function sicherFunktionstitel(id: string): string {
  try {
    return functionRole(id as never).title;
  } catch {
    return id;
  }
}

/**
 * Koerpermarken sind zweierlei: rein geometrische technische Marken mit eigenem
 * Vorlesetext, und Faehigkeitspiktogramme in ihrer randbuendigen Fassung. Fuer die
 * zweite Gruppe traegt `pictogram('capability.<id>')` den Titel — und wirft bei
 * einer unbekannten ID, deshalb der try/catch.
 */
function koerpermarkeName(id: string): string {
  const technisch = (TECHNICAL_BODY_MARK_LABELS as Record<string, string>)[id];
  if (technisch !== undefined) return technisch;
  try {
    return pictogram(`capability.${id}` as never).title;
  } catch {
    return id;
  }
}
```

**Wenn der Test „hat für jede Körperform des Pakets einen deutschen Namen" rot wird**, ist
`BODY_VARIANT_NAMEN` aus Aufgabe 2 gegen den installierten Stand zu korrigieren — nicht der Test zu
lockern. Gemessen im Arbeitsbaum `~/dev/einsatzzeichen` führt `BODY_VARIANT_IDS` diese zehn
Kennungen; die passenden deutschen Namen (aus den Vermessungskommentaren in
`schema/src/taxonomy.ts` abgeleitet):

```ts
export const BODY_VARIANT_NAMEN: Record<string, string> = {
  "raised-hull": "Angehobener Rumpf",
  "inset-hull": "Eingesenkter Rumpf",
  "foot-band": "Fußband, 3 mm",
  "plain-wheel-pair": "Schlichtes Radpaar",
  "raised-gable": "Kreis mit Giebel",
  "inverted-hull-track": "Umgekehrter Rumpf mit Kettenband",
  "fixed-wing-hull": "Starrflügler-Rumpf",
  "raised-circle-1mm": "Kreis, 1 mm angehoben",
  "compact-person-diamond-26mm": "Kompakte Personenraute, 26 mm",
  "compact-person-diamond-26mm-lowered-2mm": "Kompakte Personenraute, 26 mm, 2 mm tiefer",
};
```

- [ ] **Schritt 6: Test laufen lassen und grün sehen**

Kommando: `pnpm vitest run src/app/m/zeichen/_ui/baukasten/vokabular.test.ts`
Erwartet: PASS, 5 Fälle.

- [ ] **Schritt 7: Den fehlschlagenden Test für die Regeltexte schreiben**

`src/app/m/zeichen/_lib/regeltexte.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { VALIDATION_RULE_IDS } from "@einsatzzeichen/core";
import { REGELTEXTE, TEXTLAUF_REGELN, regeltext } from "./regeltexte";

/*
 * DER TEST GEHT IN DIE GEGENRICHTUNG, und das ist der ganze Punkt.
 *
 * Die 835-Zeilen-Erklaerungstabelle aus `packages/website` ist MIT-lizenziert und
 * duerfte kopiert werden — es waeren 78 Texte, die niemand gegen ein Upgrade
 * prueft und die still veralten. Dieses Modul fuehrt stattdessen 15: die
 * Wertesperrung faengt fast alle Kombinationsregeln vorher ab, uebrig bleiben die,
 * die sie strukturell nicht abfangen kann, weil der Text frei ist.
 *
 * Geprueft wird deshalb NICHT „jede Paketregel hat einen Text" (das waere die
 * 78er-Tabelle), sondern „jede EIGENE ID existiert im Paket". Ein Tippfehler in
 * einem Schluessel oder eine in einem Upgrade entfallene Regel wird damit laut.
 */
describe("Regeltexte", () => {
  it("fuehrt die fuenfzehn Regeln aus Spec §6.3", () => {
    expect(Object.keys(REGELTEXTE).length).toBe(15);
  });

  /*
   * `compose()` kann gemessen 78 Kennungen werfen, `VALIDATION_RULE_IDS` zaehlt 72:
   * die sechs Textlauf-Regeln entstehen erst in `assertTextRunsFit` aus den
   * Praefixen `label`, `designation`, `function-role-run` mal `-too-wide`/
   * `-unknown-glyph` und stehen deshalb in keiner Liste des Pakets. Ohne die
   * zweite Menge waeren genau die sechs Texte falsch-verdaechtig, die ein Anwender
   * am haeufigsten sieht — eine zu lange Beschriftung ist der Normalfall.
   */
  it("kennt jede eigene ID entweder im Paket oder als Textlauf-Regel", () => {
    for (const id of Object.keys(REGELTEXTE)) {
      const bekannt = VALIDATION_RULE_IDS.includes(id) || TEXTLAUF_REGELN.includes(id);
      expect(bekannt, `unbekannte Regel-ID: ${id}`).toBe(true);
    }
  });

  it("belegt, dass die sechs Textlauf-Regeln dem Paket fehlen", () => {
    for (const id of TEXTLAUF_REGELN) expect(VALIDATION_RULE_IDS, id).not.toContain(id);
    expect(TEXTLAUF_REGELN.length).toBe(6);
  });

  /*
   * BESTANDSZUSICHERUNG, beim Upgrade ANHEBEN statt loeschen: eine gewachsene Zahl
   * heisst, das Paket hat Regeln ergaenzt — dann ist zu pruefen, ob eine davon
   * einen eigenen Text braucht, weil die Wertesperrung sie nicht abfaengt.
   */
  it("misst 72 Paketregeln", () => {
    expect(VALIDATION_RULE_IDS.length).toBe(72);
  });

  /*
   * Der Rueckfall ist Pflicht: die Paketmeldungen sind teils englisch und nennen
   * Katalogkennungen („Die Verwaltungsstufe ‚kreis‘ besitzt keinen aufgeloesten
   * gemessenen Kopf aus D.3/D.4"). Ohne Rueckfall stuende bei einer neuen Regel
   * gar nichts am Feld.
   */
  it("gibt einer unbekannten Regel-ID einen Rueckfalltext mit der rohen ID", () => {
    const text = regeltext("voellig-neue-regel");
    expect(text.titel.length).toBeGreaterThan(0);
    expect(text.erklaerung).toContain("voellig-neue-regel");
  });

  it("nennt bei head-zone-conflict die drei Quellen der Kopfzone", () => {
    expect(regeltext("head-zone-conflict").erklaerung).toMatch(/Stärke/);
  });
});
```

- [ ] **Schritt 8: Test laufen lassen und Fehlschlag bestätigen**

Kommando: `pnpm vitest run src/app/m/zeichen/_lib/regeltexte.test.ts`
Erwartet: FAIL — `Failed to resolve import "./regeltexte"`.

- [ ] **Schritt 9: Die Regeltexte schreiben**

`src/app/m/zeichen/_lib/regeltexte.ts` — **kein `"use client"`, kein `@einsatzzeichen`-Import**
(die Texte sind Daten; sie werden von der Insel gelesen, und ein Wertimport hier wäre ein dritter
Katalogimporteur):

```ts
/**
 * ERKLAERTEXTE ZU DEN REGELN, DIE EIN ANWENDER TATSAECHLICH ZU SEHEN BEKOMMT.
 *
 * Die Wertesperrung (§6.2) ist der Hauptweg: was nicht zusammenpasst, laesst sich
 * gar nicht erst waehlen. Uebrig bleiben die Regeln, die sie strukturell nicht
 * abfangen kann, weil der Text FREI ist — eine zu breite Beschriftung faellt erst
 * beim Tippen auf —, und die wenigen Konflikte zwischen zwei bereits gesetzten
 * Feldern.
 *
 * Die Paketmeldung wird NICHT roh gezeigt: vier der Meldungen sind englisch, und
 * „Die Verwaltungsstufe ‚kreis‘ besitzt keinen aufgeloesten gemessenen Kopf aus
 * D.3/D.4" sagt einem Helfer nichts. Der eigene Satz kommt zuerst, die
 * Paketmeldung darunter klein (`error.issues`, nicht `error.message` — die ist
 * fuers Log).
 */
export interface Regeltext {
  /** Eine Aussage, kein Etikett. Steht fett am Feld. */
  readonly titel: string;
  /** Was zu tun ist. Ein bis zwei Saetze, Du-Form. */
  readonly erklaerung: string;
}

/**
 * Die sechs Kennungen, die `compose()` in `assertTextRunsFit` selbst baut
 * (Praefix `label`/`designation`/`function-role-run` mal `-too-wide`/
 * `-unknown-glyph`). Sie stehen in KEINER Liste des Pakets — `VALIDATION_RULE_IDS`
 * zaehlt 72, `compose()` kann gemessen 78 werfen. `regeltexte.test.ts` prueft
 * gegen beide Mengen.
 */
export const TEXTLAUF_REGELN: readonly string[] = [
  "label-too-wide", "label-unknown-glyph",
  "designation-too-wide", "designation-unknown-glyph",
  "function-role-run-too-wide", "function-role-run-unknown-glyph",
];

export const REGELTEXTE: Record<string, Regeltext> = {
  "label-too-wide": {
    titel: "Die Beschriftung ist zu breit",
    erklaerung:
      "Der Text passt nicht in seine Zone im Körper. Kürze ihn oder setze ihn in eine andere Zone.",
  },
  "label-unknown-glyph": {
    titel: "Ein Zeichen der Beschriftung ist nicht vermessen",
    erklaerung:
      "Für dieses Schriftzeichen gibt es keine gemessene Breite. Buchstaben, Ziffern, " +
      "Bindestrich und Schrägstrich sind sicher.",
  },
  "designation-too-wide": {
    titel: "Der Text unter dem Körper ist zu breit",
    erklaerung: "Der Streifen unter dem Körper ist schmal. Ein Kürzel passt, ein Satz nicht.",
  },
  "designation-unknown-glyph": {
    titel: "Ein Zeichen im Text unter dem Körper ist nicht vermessen",
    erklaerung:
      "Für dieses Schriftzeichen gibt es keine gemessene Breite. Buchstaben, Ziffern, " +
      "Bindestrich und Schrägstrich sind sicher.",
  },
  "function-role-run-too-wide": {
    titel: "Die Funktionsbezeichnung ist zu breit",
    erklaerung:
      "Die gewählte Funktion bringt ihren eigenen Schriftzug mit, und der passt an diesem " +
      "Körper nicht. Eine andere Grundzeichenart oder Körperform schafft Platz.",
  },
  "function-role-run-unknown-glyph": {
    titel: "Ein Zeichen der Funktionsbezeichnung ist nicht vermessen",
    erklaerung: "Der Schriftzug der Funktion enthält ein Zeichen ohne gemessene Breite.",
  },
  "head-zone-conflict": {
    titel: "Die Kopfzone ist schon belegt",
    erklaerung:
      "Stärke, Verwaltungsstufe und technische Kopfmarke teilen sich den Platz über dem " +
      "Körper. Es geht immer nur eines davon.",
  },
  "technical-fill-organization-conflict": {
    titel: "Farbe und Organisation zugleich",
    erklaerung:
      "Die Organisation färbt den Körper bereits. Eine zusätzliche technische Füllung " +
      "würde diese Farbe überschreiben.",
  },
  "chassis-foot-conflict": {
    titel: "Unter dem Körper ist schon etwas",
    erklaerung:
      "Fahrzeugkategorie und eigener Text belegen denselben Streifen unter dem Körper. " +
      "Nimm eines von beidem heraus.",
  },
  "body-variant-foot-conflict": {
    titel: "Die Körperform belegt den Fußstreifen",
    erklaerung:
      "Die gewählte Körperform zeichnet unten selbst. Ein Text oder eine Fahrzeugkategorie " +
      "kämen an dieselbe Stelle.",
  },
  "surface-label-foot-conflict": {
    titel: "Beschriftung auf der Fläche und Fußstreifen zugleich",
    erklaerung:
      "Diese Beschriftungszone liegt auf dem Fußstreifen. Entweder die Zone oder der " +
      "Streifen darunter.",
  },
  "strength-requires-unit": {
    titel: "Eine Stärke gibt es nur an Einheiten",
    erklaerung:
      "Trupp, Staffel, Gruppe und Zug stehen an einer taktischen Formation oder an einer " +
      "Person — nicht an einem Fahrzeug, Gebäude oder Ereignis.",
  },
  "administrative-level-not-measured": {
    titel: "Diese Verwaltungsstufe steht nicht allein",
    erklaerung:
      "Sie ist nur zusammen mit einer Funktion vermessen. Wähle zuerst eine Funktion, " +
      "dann steht die Stufe zur Verfügung.",
  },
  "foot-band-head-requires-measured-strength": {
    titel: "Diese Kopfzone ist mit dem Fußband nicht vermessen",
    erklaerung:
      "Zu dieser Körperform gibt es keine Quelle mit dieser Kopfzone. Eine andere Stärke " +
      "oder eine andere Körperform trägt.",
  },
  "plain-wheel-pair-chassis-conflict": {
    titel: "Radpaar und Fahrzeugkategorie zugleich",
    erklaerung: "Die gewählte Körperform bringt die Räder schon mit.",
  },
};

/**
 * Der Text zu einer Regel — mit RUECKFALL. Ein Wurf waere hier falsch: die Regel,
 * die kein Text erklaert, ist genau die, die ein Upgrade neu eingefuehrt hat, und
 * dann soll am Feld ein brauchbarer Satz stehen und nicht die Seite abbrechen.
 * Die rohe Kennung steht in Klammern dabei, damit eine Rueckfrage beantwortbar ist.
 */
export function regeltext(id: string): Regeltext {
  return (
    REGELTEXTE[id] ?? {
      titel: "Diese Zusammenstellung trägt nicht",
      erklaerung: `Der Katalog lehnt sie ab (Regel ${id}).`,
    }
  );
}
```

- [ ] **Schritt 10: Test laufen lassen und grün sehen**

Kommando: `pnpm vitest run src/app/m/zeichen/_lib/regeltexte.test.ts`
Erwartet: PASS, 6 Fälle.

- [ ] **Schritt 11: Den fehlschlagenden Test für den Baukasten-Zustand schreiben**

`src/app/m/zeichen/_ui/baukasten/zustand.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import type { SymbolSpec } from "@einsatzzeichen/schema";
import {
  baue, dekodiereSpec, erlaubteWerte, felddifferenz, kodiereSpec, ohneTexte,
  reduceSpec, setzeBeschriftung, ziehePruefaufgabe,
} from "./zustand";

const grund = (zusatz: Partial<SymbolSpec> = {}) =>
  ({ kind: "formation", ...zusatz }) as SymbolSpec;

describe("reduceSpec", () => {
  /*
   * Leerer Text, leere Liste und `undefined` heissen „nicht gesetzt". Ein
   * `designation: ""` waere eine LEERE Beschriftung statt gar keiner, ein
   * `bodyMarks: []` eine leere Markenliste statt keiner — beides sagt etwas
   * anderes aus als das Weglassen und ergaebe eine Spec, die so in keinem Rezept
   * steht. `kanon.ts` normalisiert genau das nicht, es MUSS hier passieren.
   */
  it("entfernt ein Feld bei leerem Wert", () => {
    const mit = reduceSpec(grund(), { feld: "designation", wert: "RTW" });
    expect(mit.designation).toBe("RTW");
    expect("designation" in reduceSpec(mit, { feld: "designation", wert: "" })).toBe(false);
    expect("bodyMarks" in reduceSpec(mit, { feld: "bodyMarks", wert: [] })).toBe(false);
  });
});

describe("setzeBeschriftung", () => {
  it("setzt eine Zone und raeumt das leere labels-Objekt weg", () => {
    const mit = setzeBeschriftung(grund(), "center", "SEG");
    expect(mit.labels?.center).toBe("SEG");
    expect("labels" in setzeBeschriftung(mit, "center", "")).toBe(false);
  });

  /*
   * DIE ELF METRIKFELDER WERDEN DURCHGEREICHT (Spec §6.1). Sie sind
   * Quellenvermessungen, kein Nutzerregler — wer eine Rezept-Spec bearbeitet und
   * eine Zone leert, darf ihre Vermessung nicht verlieren, sonst aendert sich das
   * Bild an einer Stelle, die er nie angefasst hat.
   */
  it("laesst die Metrikfelder unberuehrt", () => {
    const mit = { ...grund(), labels: { center: "A", centerBoxMarginMm: 1.5 } } as SymbolSpec;
    const ohne = setzeBeschriftung(mit, "center", "");
    expect(ohne.labels?.centerBoxMarginMm).toBe(1.5);
  });
});

describe("baue", () => {
  it("liefert SVG und Bedeutung fuer eine tragende Zusammenstellung", () => {
    const e = baue(grund({ organization: "hilfsorganisation" }), 96, "tz-test");
    expect(e.ok).toBe(true);
    if (e.ok) {
      expect(e.svg).toMatch(/^<svg/);
      expect(e.svg).toContain("tz-test");
      expect(e.bedeutung).not.toMatch(/undefined/);
    }
  });

  /*
   * M10: `instanceof` genuegt. Die Wortlautpruefung /vermessen|nicht belegt/ aus
   * dem Referenz-Builder ist gegen 1.0.2 geschrieben und in 1.1.0 ueberfluessig.
   */
  it("macht aus einem Regelverstoss `regel` mit issues", () => {
    const e = baue(grund({ kind: "building", strength: "zug" } as never), 96, "tz-test");
    expect(e.ok).toBe(false);
    if (!e.ok && e.art === "regel") {
      expect(e.verstoesse.map((v) => v.rule)).toContain("strength-requires-unit");
    } else {
      throw new Error("erwartet wurde ein Regelverstoss");
    }
  });

  it("macht aus einer Vermessungsluecke `unvermessen` mit Bereich", () => {
    const e = baue(
      { kind: "vehicle-land", vehicleCategory: "amphibienfahrzeug" } as SymbolSpec, 96, "tz-test",
    );
    expect(e.ok).toBe(false);
    if (!e.ok) expect(e.art).toBe("unvermessen");
    if (!e.ok && e.art === "unvermessen") expect(e.bereich).toBe("value");
  });

  /*
   * EIN NACKTES Error IST EIN PROGRAMMFEHLER UND FLIEGT WEITER. Wuerde es hier
   * gefangen, gaebe die Wertesperrung fuer jeden Kandidaten in jedem Feld „nicht
   * vermessen" aus und behauptete eine Datenluecke, die es nicht gibt.
   */
  it("wirft ein nacktes Error weiter", () => {
    expect(() => baue({ kind: "quatsch" } as never, 96, "tz-test")).toThrow(/quatsch/);
  });
});

describe("erlaubteWerte", () => {
  it("sperrt einen nirgends vermessenen Wert als `wert`", () => {
    const befunde = erlaubteWerte(
      { kind: "vehicle-land" } as SymbolSpec, "vehicleCategory",
      ["kfz-kategorie-1", "amphibienfahrzeug"],
    );
    expect(befunde.find((b) => b.wert === "kfz-kategorie-1")?.frei).toBe(true);
    const amphi = befunde.find((b) => b.wert === "amphibienfahrzeug");
    expect(amphi?.frei).toBe(false);
    expect(amphi?.sperre).toBe("wert");
  });

  it("sperrt eine nicht tragende Kombination als `kombination` mit Grund", () => {
    const befunde = erlaubteWerte(
      { kind: "building" } as SymbolSpec, "strength", ["trupp"],
    );
    expect(befunde[0].frei).toBe(false);
    expect(befunde[0].sperre).toBe("kombination");
    expect(befunde[0].grund).toContain("Einheiten");
  });

  /*
   * DER GERADE GESETZTE WERT WIRD NIE GESPERRT. Ihn zu sperren hiesse, die eigene
   * Auswahl unbedienbar zu machen, sobald die Spec aus einem ANDEREN Grund nicht
   * traegt — und ein gesperrter Eintrag, der zugleich der ausgewaehlte ist, wird
   * von Browsern verschieden dargestellt. Verloren geht nichts: warum die Spec
   * nicht traegt, steht vollstaendig unter der Vorschau.
   */
  it("sperrt den gerade gesetzten Wert nie", () => {
    const spec = { kind: "building", strength: "trupp" } as SymbolSpec;
    expect(erlaubteWerte(spec, "strength", ["trupp"])[0].frei).toBe(true);
  });

  /*
   * ⛔ DIE FALLE, DIE SONST NIEMAND SIEHT: eine zu lange Beschriftung laesst JEDEN
   * Probelauf mit `label-too-wide` scheitern — jede Achse waere gesperrt, und die
   * Oberflaeche behauptete, gar nichts passe mehr zusammen. Deshalb probt die
   * Sperrung gegen `ohneTexte(spec)`; der Textverstoss erscheint am Textfeld.
   */
  it("laesst eine zu lange Beschriftung keine andere Achse sperren", () => {
    const zuLang = setzeBeschriftung(
      grund({ organization: "hilfsorganisation" }), "center", "VIEL ZU LANGER TEXT HIER",
    );
    const befunde = erlaubteWerte(ohneTexte(zuLang), "strength", ["gruppe"]);
    expect(befunde[0].frei).toBe(true);
  });
});

describe("URL-Zustand", () => {
  /*
   * base64url UEBER UTF-8: `btoa` nimmt nur Latin-1, und `designation` traegt
   * Umlaute. Ohne den Umweg ueber `TextEncoder` wirft `btoa` bei „Lösch" ein
   * InvalidCharacterError — und zwar erst beim Teilen, nicht beim Bauen.
   */
  it("traegt Umlaute durch die Adresszeile", () => {
    const spec = grund({ designation: "Löschzug Süd" });
    expect(dekodiereSpec(kodiereSpec(spec))).toEqual(spec);
  });

  it("kodiert ohne Fuellzeichen und ohne + oder /", () => {
    expect(kodiereSpec(grund({ designation: "ÄÖÜ~~~" }))).not.toMatch(/[+/=]/);
  });

  /*
   * DIESELBE ZEICHENKETTE WIE AUF DEM SERVER. `(shell)/meine/page.tsx` baut den
   * Link mit `Buffer.from(json).toString("base64url")` — der Browser kennt kein
   * `Buffer`, der Server kein `btoa` mit UTF-8. Zwei Wege, ein Ergebnis: dieser
   * Test ist die einzige Stelle, an der beide nebeneinander laufen.
   */
  it("stimmt mit der Server-Kodierung ueberein", () => {
    const spec = grund({ designation: "Löschzug Süd" });
    const serverseitig = Buffer.from(JSON.stringify(spec), "utf8").toString("base64url");
    expect(kodiereSpec(spec)).toBe(serverseitig);
  });

  /*
   * UNLESBAR HEISST `null`, NICHT WURF. Der Referenz-Builder wirft dort mit
   * Klartext — richtig fuer ein Entwicklerwerkzeug. Hier kommt der Parameter aus
   * einem geteilten Link, und eine leere Seite an der Einsatzstelle ist der
   * schlechteste Ausgang. Die Insel faengt `null` ab und beginnt leer.
   */
  it("gibt bei Unsinn null zurueck, statt zu werfen", () => {
    expect(dekodiereSpec("%%%kein-base64%%%")).toBeNull();
    expect(dekodiereSpec(kodiereSpec({ ohneKind: true } as never))).toBeNull();
  });
});

describe("Bauuebung", () => {
  const pool = [
    { id: "rezept:A.1", titel: "Erstes", bedeutung: "Bedeutung eins",
      specKanon: "k1", spec: grund(), svg: "<svg/>" },
    { id: "rezept:A.2", titel: "Zweites", bedeutung: "Bedeutung zwei",
      specKanon: "k2", spec: grund({ organization: "feuerwehr" }), svg: "<svg/>" },
  ];

  /** Der Wuerfel kommt als Parameter herein — sonst ist eine Uebung nicht pruefbar. */
  it("zieht deterministisch, wenn der Wuerfel es ist", () => {
    expect(ziehePruefaufgabe(pool, () => 0)?.id).toBe("rezept:A.1");
    expect(ziehePruefaufgabe(pool, () => 0.99)?.id).toBe("rezept:A.2");
    expect(ziehePruefaufgabe([], () => 0)).toBeNull();
  });

  const benenne = (_feld: string, wert: string) => `„${wert}“`;

  it("nennt Uebereinstimmung, wenn der kanonische Schluessel gleich ist", () => {
    const urteil = felddifferenz(
      grund({ organization: "feuerwehr" }), grund({ organization: "feuerwehr" }), benenne,
    );
    expect(urteil.gleich).toBe(true);
  });

  /*
   * BEWERTET WIRD UEBER DEN KANONISCHEN SCHLUESSEL, nicht ueber das Bild und nicht
   * ueber `matchFingerprint` (M15: eine Spec mit FALSCHER Organisation und ganz
   * fehlender Faehigkeit besteht dort mit {"ok":true,"problems":[]}). Ein
   * SVG-Vergleich waere ebenso falsch — er wertete eine sachlich richtige Antwort
   * mit anderer capabilities-Reihenfolge als falsch, weil die Reihenfolge die
   * z-Ordnung aendert.
   */
  it("nennt die Felddifferenz statt nur `falsch`", () => {
    const urteil = felddifferenz(
      grund({ organization: "feuerwehr" }),
      grund({ organization: "feuerwehr", capabilities: ["fire-fighting"] } as never),
      benenne,
    );
    expect(urteil.gleich).toBe(false);
    expect(urteil.satz).toContain("fire-fighting");
    expect(urteil.satz).toMatch(/fehlt/i);
  });

  it("nennt einen abweichenden Wert mit beiden Seiten", () => {
    const urteil = felddifferenz(
      grund({ organization: "thw" }), grund({ organization: "feuerwehr" }), benenne,
    );
    expect(urteil.satz).toContain("thw");
    expect(urteil.satz).toContain("feuerwehr");
  });
});
```

- [ ] **Schritt 12: Test laufen lassen und Fehlschlag bestätigen**

Kommando: `pnpm vitest run src/app/m/zeichen/_ui/baukasten/zustand.test.ts`
Erwartet: FAIL — `Failed to resolve import "./zustand"`.

- [ ] **Schritt 13: Den Baukasten-Zustand schreiben**

`src/app/m/zeichen/_ui/baukasten/zustand.ts`:

```ts
"use client";

import type { SymbolSpec } from "@einsatzzeichen/schema";
import type { ValidationIssue } from "@einsatzzeichen/core";
import {
  BodyNotMeasuredError, CompositionError, NotMeasuredError,
  composeFromCatalog, describeSymbolSpec, renderSvg,
} from "./paket";
import { ORDNUNG, kanonischerSchluessel } from "../../_lib/kanon";
import { regeltext } from "../../_lib/regeltexte";

/*
 * DER ZUSTAND DES BAUKASTENS ALS REINE FUNKTIONEN. Die Insel haelt nur den
 * React-State; alles, was entscheidet, steht hier und ist ohne DOM pruefbar.
 *
 * "use client" traegt die Datei, weil sie ueber `./paket` Katalog-CODE zieht und
 * NIE serverseitig ausgewertet werden darf (M1/M2). Die Typimporte aus
 * @einsatzzeichen sind rein und verschwinden im Build — `naht.test.ts` zaehlt sie
 * deshalb nicht als Katalogimport.
 */

export interface SpecAktion {
  feld: keyof SymbolSpec;
  wert: unknown;
}

/**
 * Ein Feld setzen oder entfernen. Leerer Text, leere Liste und `undefined` heissen
 * „nicht gesetzt": ein `designation: ''` waere eine LEERE Beschriftung statt gar
 * keiner und ein `bodyMarks: []` eine leere Markenliste — beides sagt etwas
 * anderes aus als das Weglassen und ergaebe eine Spec, die so in keinem Rezept
 * steht.
 *
 * Der Wert ist ehrlich `unknown`: er kommt aus einem Formularfeld, und ob er zur
 * Achse passt, entscheidet `composeFromCatalog()` und niemand sonst. Auch das
 * Pflichtfeld `kind` laesst sich so entfernen — dann bricht die Komposition
 * SICHTBAR ab, statt dass diese Funktion eine Gueltigkeit behauptet, die sie nicht
 * geprueft hat.
 */
export function reduceSpec(spec: SymbolSpec, aktion: SpecAktion): SymbolSpec {
  const naechste: Record<string, unknown> = { ...spec };
  const leer =
    aktion.wert === undefined ||
    aktion.wert === "" ||
    (Array.isArray(aktion.wert) && aktion.wert.length === 0);
  if (leer) delete naechste[aktion.feld];
  else naechste[aktion.feld] = aktion.wert;
  return naechste as unknown as SymbolSpec;
}

/** Die fuenf Beschriftungszonen, die die Oberflaeche anbietet (Spec §6.1, Achse 9). */
export const ZONEN = ["center", "topLeft", "bottomLeft", "bottomCenter", "bottomRight"] as const;
export type Zone = (typeof ZONEN)[number];

/**
 * Eine Beschriftungszone setzen oder leeren.
 *
 * ⛔ DIE ELF METRIKFELDER IN `labels` BLEIBEN UNBERUEHRT. Sie sind
 * Quellenvermessungen, kein Nutzerregler (Spec §6.1). Wer eine Rezept-Spec
 * bearbeitet und eine Zone leert, wuerde sonst still eine Vermessung verlieren und
 * bekaeme ein anderes Bild an einer Stelle, die er nie angefasst hat.
 */
export function setzeBeschriftung(spec: SymbolSpec, zone: Zone, text: string): SymbolSpec {
  const labels: Record<string, unknown> = { ...(spec.labels ?? {}) };
  if (text.trim() === "") delete labels[zone];
  else labels[zone] = text;
  return reduceSpec(spec, { feld: "labels", wert: Object.keys(labels).length ? labels : undefined });
}

/**
 * Die Spec ohne ihre FREIEN TEXTE — die Vorlage, gegen die die Wertesperrung probt.
 *
 * ⛔ OHNE DAS IST DIE GANZE SPERRUNG FALSCH, und zwar still: ein zu langer Text
 * laesst JEDEN Probelauf mit `label-too-wide` scheitern. Die Oberflaeche zeigte
 * dann jede Achse als gesperrt und behauptete, nichts passe mehr zusammen — wegen
 * eines Tippfehlers in einem Textfeld. Der Textverstoss gehoert ans Textfeld, und
 * dorthin bringt ihn `baue()` mit der VOLLEN Spec.
 *
 * Der Preis, ausdruecklich benannt: eine Sperre, die NUR aus einem gesetzten Text
 * folgt (`body-variant-foot-conflict`), erscheint erst nach dem Klick als Regeltext
 * am Feld statt vorher als graue Zeile. Das ist der kleinere Schaden.
 */
export function ohneTexte(spec: SymbolSpec): SymbolSpec {
  const rest: Record<string, unknown> = { ...spec };
  delete rest.designation;
  delete rest.labels;
  return rest as unknown as SymbolSpec;
}

export type BauErgebnis =
  | { ok: true; svg: string; bedeutung: string }
  | { ok: false; art: "regel"; verstoesse: readonly ValidationIssue[] }
  | { ok: false; art: "unvermessen"; bereich: "value" | "combination"; meldung: string };

type Komposition =
  | { ok: true; zeichnung: ReturnType<typeof composeFromCatalog> }
  | Exclude<BauErgebnis, { ok: true }>;

/**
 * Komponieren und die drei bekannten Fehlerklassen auffangen — `instanceof`
 * genuegt (M10). Die Wortlautpruefung /vermessen|nicht belegt/ aus dem
 * Referenz-Builder ist gegen 1.0.2 geschrieben und seit 1.1.0 ueberfluessig.
 *
 * DIE REIHENFOLGE DER PRUEFUNGEN IST DIE SPEZIFISCHERE ZUERST: sollte
 * `BodyNotMeasuredError` in einer kuenftigen Fassung von `NotMeasuredError` erben,
 * bleibt sie damit richtig.
 *
 * ⛔ ALLES ANDERE FLIEGT WEITER. Ein `TypeError` kommt aus einem Programmfehler,
 * nie aus einer Aussage ueber die Referenz — gefangen wuerde er jeden Kandidaten
 * in jedem Feld als „nicht vermessen" ausgeben und eine Datenluecke behaupten, die
 * es nicht gibt.
 */
function komponiere(spec: SymbolSpec): Komposition {
  try {
    return { ok: true, zeichnung: composeFromCatalog(spec) };
  } catch (fehler) {
    if (fehler instanceof CompositionError) {
      return { ok: false, art: "regel", verstoesse: fehler.issues };
    }
    if (fehler instanceof BodyNotMeasuredError) {
      return { ok: false, art: "unvermessen", bereich: "combination", meldung: fehler.message };
    }
    if (fehler instanceof NotMeasuredError) {
      /*
       * `scope` wird eng gelesen: nur „value" heisst „ueberall unmoeglich, dauerhaft
       * ausgrauen". Ein unbekannter dritter Wert einer kuenftigen Fassung faellt auf
       * „passt hier nicht" — die mildere Aussage, die sich mit der naechsten
       * Auswahl von selbst aufloest.
       */
      const bereich = fehler.scope === "value" ? "value" : "combination";
      return { ok: false, art: "unvermessen", bereich, meldung: fehler.message };
    }
    throw fehler;
  }
}

/** Vorschau: komponieren, zeichnen, Bedeutung dazu. Vollstaendig im Browser (Spec §6.2). */
export function baue(spec: SymbolSpec, groessePx: number, idPrefix: string): BauErgebnis {
  const k = komponiere(spec);
  if (!k.ok) return k;
  /*
   * `idPrefix` IST PFLICHT, nicht Kosmetik: ohne ihn erzeugt `renderSvg`
   * `aria-labelledby="ez-title ez-desc"` — auf einer Flaeche mit mehreren Zeichen
   * mehrfach dieselbe DOM-ID (M11). Optisch faellt nichts auf, kein Gate sieht es,
   * und ein Bildschirmleser liest den falschen Namen.
   */
  return {
    ok: true,
    svg: renderSvg(k.zeichnung, { size: groessePx, idPrefix }),
    bedeutung: describeSymbolSpec(spec),
  };
}

export interface Wertbefund {
  wert: string;
  frei: boolean;
  /** „wert" = ueberall unmoeglich (dauerhaft ausgegraut) · „kombination" = passt hier nicht. */
  sperre?: "wert" | "kombination";
  grund?: string;
}

/** Die beiden Achsen, die eine Liste tragen. Explizit aufgezaehlt, nicht aus dem Wert geraten. */
export const LISTENFELDER: readonly (keyof SymbolSpec)[] = ["capabilities", "bodyMarks"];

/**
 * Probiert jeden Kandidaten einmal durch und sagt, ob er zusammenpasst.
 *
 * Es gibt im Paket keine Funktion „erlaubte Werte je Feld", und sie liesse sich
 * auch nicht ehrlich schreiben: ob eine Kombination traegt, haengt an vermessenen
 * Fassungen, Profilen und Zonen — das weiss erst die Komposition. Gemessen kostet
 * das 9,7 ms kalt / 3,4 ms warm fuer 247 Kandidaten ueber elf Felder (M16); die elf
 * Achsen dieses Moduls fuehren 315 Kandidaten, hochgerechnet also rund 12 ms. Das
 * ist eine HOCHRECHNUNG aus der Messung, keine eigene Messung.
 *
 * ⛔ NUR KOMPONIEREN, NICHT ZEICHNEN. `baue()` rendert zusaetzlich SVG; ueber 315
 * Kandidaten waere das ein Vielfaches der gemessenen Zeit fuer eine Antwort, die
 * niemand ansieht.
 *
 * ⛔ KEINE VORPRUEFUNG MIT `validateSpec`. Sie waere schneller und FALSCH: ohne den
 * Kontext aus aufgeloester Funktionsfassung und Verwaltungskopf, den `compose()`
 * aus den Ports baut, lehnt sie alle 25 Funktionsrollen ab — die Auswahl sperrte
 * dann Gueltiges.
 *
 * WARUM IM BROWSER UND NICHT PER SERVER ACTION: 315 Kandidaten je Tastendruck
 * ueber die Leitung waeren ein Roundtrip pro Zeichen — und liefen zusaetzlich in
 * Falle 10 (ein POST in der Erstuebersetzung wird abgebrochen, ohne je zu
 * antworten).
 */
export function erlaubteWerte(
  spec: SymbolSpec,
  feld: keyof SymbolSpec,
  kandidaten: readonly string[],
): Wertbefund[] {
  const aktuell = spec[feld];
  const liste = LISTENFELDER.includes(feld);
  const gewaehlt: readonly string[] = liste
    ? Array.isArray(aktuell)
      ? (aktuell as readonly string[])
      : []
    : typeof aktuell === "string"
      ? [aktuell]
      : [];

  return kandidaten.map((wert) => {
    // Der gerade gesetzte Wert wird NIE gesperrt — siehe zustand.test.ts.
    if (gewaehlt.includes(wert)) return { wert, frei: true };
    // Listenfelder pruefen den Kandidaten ZUSAETZLICH zur bestehenden Auswahl:
    // gefragt ist, ob er sich anfuegen laesst, nicht ob er allein truege.
    const probe = reduceSpec(spec, { feld, wert: liste ? [...gewaehlt, wert] : wert });
    const k = komponiere(probe);
    if (k.ok) return { wert, frei: true };
    if (k.art === "regel") {
      const erste = k.verstoesse[0];
      return {
        wert,
        frei: false,
        sperre: "kombination",
        grund: erste ? regeltext(erste.rule).titel : "Passt hier nicht.",
      };
    }
    return {
      wert,
      frei: false,
      sperre: k.bereich === "value" ? "wert" : "kombination",
      grund:
        k.bereich === "value"
          ? "Dafür führt der Katalog keine vermessene Fassung."
          : "In dieser Zusammenstellung nicht vermessen.",
    };
  });
}

/* --- Der Zustand in der Adresszeile ------------------------------------------------------ */

/**
 * `btoa` nimmt nur Latin-1, und `designation` traegt Umlaute. Also erst UTF-8-Bytes,
 * dann base64, dann die URL-sichere Zeichenauswahl ohne Fuellzeichen. Das Ergebnis
 * ist byteweise dasselbe wie `Buffer.from(json).toString("base64url")` auf dem
 * Server — `zustand.test.ts` haelt beide Wege gegeneinander.
 */
export function kodiereSpec(spec: SymbolSpec): string {
  const bytes = new TextEncoder().encode(JSON.stringify(spec));
  let binaer = "";
  for (const b of bytes) binaer += String.fromCharCode(b);
  return btoa(binaer).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

/**
 * Umkehrung. Gibt `null` zurueck, statt zu werfen: der Parameter kommt aus einem
 * geteilten Link, und eine weisse Seite an der Einsatzstelle ist der schlechteste
 * Ausgang. Die Insel beginnt dann leer und sagt es in einem Satz.
 */
export function dekodiereSpec(param: string): SymbolSpec | null {
  try {
    const gefuellt = param.replaceAll("-", "+").replaceAll("_", "/");
    const binaer = atob(gefuellt.padEnd(Math.ceil(gefuellt.length / 4) * 4, "="));
    const bytes = Uint8Array.from(binaer, (z) => z.charCodeAt(0));
    const gelesen: unknown = JSON.parse(new TextDecoder().decode(bytes));
    if (typeof gelesen !== "object" || gelesen === null || Array.isArray(gelesen)) return null;
    if (typeof (gelesen as { kind?: unknown }).kind !== "string") return null;
    return gelesen as SymbolSpec;
  } catch {
    return null;
  }
}

/* --- Die Bauuebung (Spec §6.5) ------------------------------------------------------------ */

export interface Uebungsaufgabe {
  id: string;
  titel: string;
  bedeutung: string;
  specKanon: string;
  spec: SymbolSpec;
  svg: string;
}

/**
 * Zieht eine Aufgabe. Der Wuerfel kommt als PARAMETER herein — die einzige
 * Bauform, in der eine Uebung pruefbar ist (dieselbe Regel wie `_lib/lernen/`).
 *
 * DIE UEBUNG SCHREIBT KEINEN LERNSTAND und keine Zeile in irgendeine Tabelle. Sie
 * ist ein Werkzeug, kein Pruefungsteil — deshalb braucht sie weder Server Action
 * noch Fragetoken noch eine dritte Insel. Der Katalog-Code liegt an dieser Stelle
 * ohnehin schon im Browser (Betreiberentscheidung 2026-09-02).
 */
export function ziehePruefaufgabe(
  pool: readonly Uebungsaufgabe[],
  wuerfel: () => number = Math.random,
): Uebungsaufgabe | null {
  if (pool.length === 0) return null;
  const i = Math.min(pool.length - 1, Math.floor(wuerfel() * pool.length));
  return pool[i];
}

const FELDNAMEN: Record<string, string> = {
  kind: "Grundzeichenart",
  bodyVariant: "Körperform",
  organization: "Organisation",
  technicalFill: "Technische Füllung",
  strength: "Stärke",
  technicalHeadMark: "Technische Kopfmarke",
  administrativeLevel: "Verwaltungsstufe",
  functionRole: "Funktion",
  vehicleCategory: "Fahrzeugkategorie",
  capabilities: "Fähigkeit",
  bodyMarks: "Körpermarken",
  designation: "Text unter dem Körper",
  labels: "Beschriftung",
};

const alsText = (wert: unknown): string =>
  Array.isArray(wert)
    ? [...(wert as string[])].sort().join(", ")
    : typeof wert === "object" && wert !== null
      ? JSON.stringify(wert)
      : String(wert);

/**
 * Die Rueckmeldung der Bauuebung: erst das Urteil, dann die FELDDIFFERENZ.
 *
 * Bewertet wird ueber `kanonischerSchluessel` (§3.6) — nicht ueber das Bild und
 * nicht ueber `matchFingerprint`: gemessen besteht eine Spec mit FALSCHER
 * Organisation und ganz fehlender Faehigkeit dessen Kennwert mit
 * {"ok":true,"problems":[]} (M15). Ein SVG-Vergleich waere ebenso falsch, er
 * wertete eine sachlich richtige Antwort mit anderer capabilities-Reihenfolge als
 * falsch (die Reihenfolge aendert die z-Ordnung).
 *
 * `benenne` kommt als Parameter herein, damit diese Funktion ohne Katalog pruefbar
 * bleibt; die Insel reicht `bezeichnung` aus `vokabular.ts` durch.
 */
export function felddifferenz(
  eigene: SymbolSpec,
  ziel: SymbolSpec,
  benenne: (feld: string, wert: string) => string,
): { gleich: boolean; satz: string } {
  if (kanonischerSchluessel(eigene) === kanonischerSchluessel(ziel)) {
    return { gleich: true, satz: "Das ist genau das gesuchte Zeichen." };
  }
  const gleich: string[] = [];
  const fehlt: string[] = [];
  const zuviel: string[] = [];
  const anders: string[] = [];
  for (const feld of ORDNUNG) {
    const a = (eigene as Record<string, unknown>)[feld];
    const b = (ziel as Record<string, unknown>)[feld];
    const aLeer = a === undefined || (Array.isArray(a) && a.length === 0);
    const bLeer = b === undefined || (Array.isArray(b) && b.length === 0);
    if (aLeer && bLeer) continue;
    const name = FELDNAMEN[feld] ?? feld;
    if (aLeer) fehlt.push(`${name} ${benenne(feld, alsText(b))}`);
    else if (bLeer) zuviel.push(`${name} ${benenne(feld, alsText(a))}`);
    else if (alsText(a) === alsText(b)) gleich.push(name);
    else anders.push(`${name} (du: ${alsText(a)}, gesucht: ${alsText(b)})`);
  }
  const teile: string[] = [];
  if (gleich.length) teile.push(`Stimmt schon: ${gleich.join(", ")}.`);
  if (fehlt.length) teile.push(`Es fehlt: ${fehlt.join(", ")}.`);
  if (zuviel.length) teile.push(`Zu viel: ${zuviel.join(", ")}.`);
  if (anders.length) teile.push(`Anders: ${anders.join(", ")}.`);
  return { gleich: false, satz: teile.join(" ") };
}
```

- [ ] **Schritt 14: Test laufen lassen und grün sehen**

Kommando: `pnpm vitest run src/app/m/zeichen/_ui/baukasten/zustand.test.ts`
Erwartet: PASS, 15 Fälle. Der Lauf lädt den Katalog-Code (in Node unbedenklich) und braucht ein
bis zwei Sekunden.

- [ ] **Schritt 15: Den fehlschlagenden Test für die Formprüfungen schreiben**

`src/app/m/zeichen/_lib/pruefung.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { SVG_MAX_ZEICHEN, konfliktFrage, specFormFehler, svgFormFehler } from "./pruefung";

/*
 * DIESE PRUEFUNGEN SIND HYGIENE, NICHT DER RIEGEL (Spec §4.3). Der Riegel ist das
 * `<img src="data:image/svg+xml;base64,…">` auf /meine: dort fuehrt ein SVG kein
 * Script aus und laedt nichts nach. Die Form zu pruefen kostet nichts und faengt
 * den Unfall, nicht den Angriff.
 *
 * ⛔ EINE FACHLICHE PRUEFUNG GIBT ES HIER NICHT UND KANN ES NICHT GEBEN: sie
 * braeuchte `composeFromCatalog` und zoege den Katalog in den Server-Graph — M1,
 * und `pnpm build` braeche mit ERR_INVALID_ARG_TYPE.
 */
describe("Formpruefung der Spec", () => {
  it("nimmt eine gewoehnliche Spec an", () => {
    expect(specFormFehler(JSON.stringify({ kind: "formation", organization: "thw" }))).toBeNull();
  });

  it("nimmt Listen, Beschriftungen und deren Metriken an", () => {
    const spec = {
      kind: "formation",
      capabilities: ["transport"],
      labels: { center: "SEG", centerBoxMarginMm: 1.5, bottomRightMetrics: { boxWidthMm: 4 } },
    };
    expect(specFormFehler(JSON.stringify(spec))).toBeNull();
  });

  it("lehnt Unlesbares, Listen und fehlendes kind ab", () => {
    expect(specFormFehler("kein json")).toMatch(/lesen/i);
    expect(specFormFehler("[1,2]")).not.toBeNull();
    expect(specFormFehler(JSON.stringify({ organization: "thw" }))).toMatch(/Grundzeichenart/);
  });

  /*
   * ⛔ ALLE FELDNAMEN MUESSEN AUS `ORDNUNG` KOMMEN. Ein unbekanntes Feld waere
   * nicht nur unbenutzt: `kanonischerSchluessel` serialisiert nur die Felder aus
   * ORDNUNG, zwei verschiedene Zusammenstellungen fielen also auf denselben
   * Schluessel — und „schon gespeichert?" antwortete falsch.
   */
  it("lehnt ein Feld ab, das ORDNUNG nicht kennt", () => {
    expect(specFormFehler(JSON.stringify({ kind: "formation", quatsch: "x" }))).toMatch(/quatsch/);
  });

  it("lehnt eine Funktion oder einen verschachtelten Baum als Wert ab", () => {
    expect(specFormFehler(JSON.stringify({ kind: "formation", designation: [[1]] }))).not.toBeNull();
    expect(
      specFormFehler(JSON.stringify({ kind: "formation", labels: { center: { tief: {} } } })),
    ).not.toBeNull();
  });
});

describe("Formpruefung des SVG", () => {
  const svg = '<svg xmlns="http://www.w3.org/2000/svg"><rect width="1" height="1"/></svg>';

  it("nimmt ein gewoehnliches SVG an", () => {
    expect(svgFormFehler(svg)).toBeNull();
  });

  it("lehnt ab, was nicht mit <svg beginnt und mit </svg> endet", () => {
    expect(svgFormFehler(`<div>${svg}</div>`)).not.toBeNull();
    expect(svgFormFehler("")).not.toBeNull();
  });

  it("lehnt script-Tags und on-Attribute ab", () => {
    expect(svgFormFehler(`<svg><script>alert(1)</script></svg>`)).toMatch(/Script/i);
    expect(svgFormFehler(`<svg onload="x()"></svg>`)).toMatch(/Attribut/i);
    expect(svgFormFehler(`<svg ONLOAD = "x()"></svg>`)).toMatch(/Attribut/i);
  });

  /*
   * Die Obergrenze ist grosszuegig und trotzdem noetig: das Generat traegt 246
   * fertige SVGs in 381.541 B, im Schnitt also rund 1,5 KB je Zeichen bei
   * Groesse 64. 200.000 Zeichen lassen jede sinnvolle Exportgroesse durch und
   * verhindern, dass jemand die Datenbank als Ablage benutzt.
   */
  it("lehnt ein masslos grosses SVG ab", () => {
    expect(svgFormFehler(`<svg>${"x".repeat(SVG_MAX_ZEICHEN)}</svg>`)).toMatch(/groß/);
  });
});

describe("Konfliktfrage", () => {
  /*
   * BEIDE FAELLE FRAGEN ZURUECK, STATT ZU ENTSCHEIDEN (Spec §6.6). Ein
   * onConflictDoUpdate auf dem Namen ueberschriebe still fremde Arbeit; ein
   * uniqueIndex auf spec_kanon benennte ein vorhandenes Zeichen still UM.
   */
  it("fragt beim gleichen Namen nach", () => {
    expect(konfliktFrage(true, null, "")).toBe("name");
  });

  it("fragt bei gleicher Zusammenstellung nach", () => {
    expect(konfliktFrage(false, "Zugtrupp Nord", "")).toBe("zusammenstellung");
  });

  it("schweigt, wenn die passende Bestaetigung vorliegt", () => {
    expect(konfliktFrage(true, null, "ueberschreiben")).toBeNull();
    expect(konfliktFrage(false, "Zugtrupp Nord", "zusaetzlich")).toBeNull();
  });

  /*
   * DIE BESTAETIGUNG GILT NUR FUER IHREN FALL. Wer „trotzdem zusaetzlich sichern"
   * bestaetigt hat und dabei versehentlich einen vergebenen Namen tippt, bekommt
   * die Namensfrage — sonst ueberschriebe eine Bestaetigung fuer den einen Fall
   * still den anderen.
   */
  it("laesst eine Bestaetigung nicht auf den anderen Fall durchschlagen", () => {
    expect(konfliktFrage(true, null, "zusaetzlich")).toBe("name");
    expect(konfliktFrage(false, "Zugtrupp Nord", "ueberschreiben")).toBe("zusammenstellung");
  });
});
```

- [ ] **Schritt 16: Test laufen lassen und Fehlschlag bestätigen**

Kommando: `pnpm vitest run src/app/m/zeichen/_lib/pruefung.test.ts`
Erwartet: FAIL — `Failed to resolve import "./pruefung"`.

- [ ] **Schritt 17: Die Formprüfungen schreiben**

`src/app/m/zeichen/_lib/pruefung.ts` — **kein `"use client"`, kein `@einsatzzeichen`-Import**:

```ts
import { ORDNUNG } from "./kanon";

/*
 * DIE FORMPRUEFUNGEN DER SERVER ACTION (Spec §4.3, §6.6).
 *
 * Sie liegen hier und nicht in `actions.ts`, weil eine Datei mit "use server" nur
 * asynchrone Funktionen exportieren darf — und weil sie so ohne Sitzung pruefbar
 * sind. Kein Katalogimport: `ORDNUNG` ist eine reine Zeichenkettenliste.
 */

/**
 * Obergrenze fuer das gespeicherte SVG. Das Generat traegt 246 fertige Zeichen in
 * 381.541 B — rund 1,5 KB je Zeichen bei Groesse 64. 200.000 Zeichen lassen jede
 * sinnvolle Exportgroesse durch und verhindern, dass die Tabelle als Ablage dient.
 */
export const SVG_MAX_ZEICHEN = 200_000;

const ERLAUBTE_FELDER = new Set<string>(ORDNUNG);

/** Ein Wert der Spec: Text, Zahl, Liste von Texten — oder ein flaches Metrikobjekt. */
function wertFehler(feld: string, wert: unknown, tiefe: number): string | null {
  if (typeof wert === "string" || typeof wert === "number" || typeof wert === "boolean") return null;
  if (Array.isArray(wert)) {
    return wert.every((e) => typeof e === "string")
      ? null
      : `Das Feld „${feld}“ enthält eine Liste, die nicht nur aus Text besteht.`;
  }
  if (typeof wert === "object" && wert !== null) {
    if (tiefe === 0) return `Das Feld „${feld}“ ist zu tief verschachtelt.`;
    for (const [k, v] of Object.entries(wert)) {
      const fehler = wertFehler(`${feld}.${k}`, v, tiefe - 1);
      if (fehler) return fehler;
    }
    return null;
  }
  return `Das Feld „${feld}“ hat einen Wert, der sich nicht speichern lässt.`;
}

/**
 * Prueft die FORM einer Spec, nicht ihre fachliche Gueltigkeit.
 *
 * ⛔ EINE FACHLICHE PRUEFUNG BRAEUCHTE `composeFromCatalog` — und das zoege den
 * Katalog in den Server-Graph (M1: `catalog/dist/src/index.js:23` re-exportiert
 * `fonts.js` mit `fileURLToPath` auf Modulebene, `pnpm build` bricht in der Phase
 * „Collecting page data"). Ein manipuliertes Spec-JSON schaedigt nur die eigene
 * Zeichenliste, und das Markup wird nie als HTML ausgefuehrt (§4.3).
 *
 * Alle Feldnamen muessen aus `ORDNUNG` kommen: `kanonischerSchluessel`
 * serialisiert nur diese Felder, ein fremdes Feld liesse zwei verschiedene
 * Zusammenstellungen auf denselben Schluessel fallen — und „schon gespeichert?"
 * antwortete falsch.
 */
export function specFormFehler(json: string): string | null {
  let gelesen: unknown;
  try {
    gelesen = JSON.parse(json);
  } catch {
    return "Die Zusammenstellung lässt sich nicht lesen.";
  }
  if (typeof gelesen !== "object" || gelesen === null || Array.isArray(gelesen)) {
    return "Die Zusammenstellung hat nicht die erwartete Form.";
  }
  const eintraege = Object.entries(gelesen as Record<string, unknown>);
  if (typeof (gelesen as { kind?: unknown }).kind !== "string") {
    return "Es fehlt die Grundzeichenart.";
  }
  for (const [feld, wert] of eintraege) {
    if (!ERLAUBTE_FELDER.has(feld)) return `Unbekanntes Feld „${feld}“ in der Zusammenstellung.`;
    const fehler = wertFehler(feld, wert, 2);
    if (fehler) return fehler;
  }
  return null;
}

/**
 * Prueft die Form des gelieferten SVG. HYGIENE, NICHT DER RIEGEL: der Riegel ist
 * das `<img src="data:image/svg+xml;base64,…">` auf /meine (Spec §4.3).
 */
export function svgFormFehler(svg: string): string | null {
  const t = svg.trim();
  if (!t.startsWith("<svg") || !t.endsWith("</svg>")) return "Das Bild hat nicht die Form eines SVG.";
  if (t.length > SVG_MAX_ZEICHEN) return "Das Bild ist zu groß zum Speichern.";
  if (/<script/i.test(t)) return "Das Bild enthält ein Script-Element.";
  // `\son…=` mit optionalem Leerraum: `onload = "…"` ist dasselbe Ereignis.
  if (/\son[a-z]+\s*=/i.test(t)) return "Das Bild enthält ein Ereignis-Attribut.";
  return null;
}

/**
 * Welche Rueckfrage vor dem Schreiben noch offen ist — oder keine.
 *
 * BEIDE FAELLE FRAGEN ZURUECK, STATT ZU ENTSCHEIDEN (Spec §6.6): gleicher Name →
 * „Überschreiben oder anders benennen?", gleiche Zusammenstellung → „Trotzdem
 * zusätzlich sichern?". Nichts wird still ueberschrieben.
 *
 * Die Namensfrage kommt zuerst, weil ihre Antwort die andere erledigt: wer
 * ueberschreibt, legt nichts Zweites an.
 */
export function konfliktFrage(
  namenVergeben: boolean,
  gleicheZusammenstellungAls: string | null,
  bestaetigung: string,
): "name" | "zusammenstellung" | null {
  if (namenVergeben && bestaetigung !== "ueberschreiben") return "name";
  if (gleicheZusammenstellungAls !== null && bestaetigung !== "zusaetzlich") {
    return "zusammenstellung";
  }
  return null;
}
```

- [ ] **Schritt 18: Test laufen lassen und grün sehen**

Kommando: `pnpm vitest run src/app/m/zeichen/_lib/pruefung.test.ts`
Erwartet: PASS, 12 Fälle.

- [ ] **Schritt 19: Den fehlschlagenden Test für die Datenzugriffe schreiben**

`src/app/m/zeichen/_db/eigeneZeichen.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { testDb } from "./testdb";
import {
  eigeneZeichenVon, eigenesZeichenMitKanon, eigenesZeichenMitNamen,
  legeEigenesZeichenAn, ueberschreibeEigenesZeichen,
} from "./eigeneZeichen";

const werte = (zusatz: Partial<Parameters<typeof legeEigenesZeichenAn>[1]> = {}) => ({
  sub: "sub-1",
  name: "Zugtrupp Nord",
  specJson: '{"kind":"formation"}',
  specKanon: "kind=formation",
  svg: "<svg/></svg>",
  paketVersion: "1.1.0",
  datenVersion: "0.2.0",
  ...zusatz,
});

describe("eigene Zeichen", () => {
  it("legt an und liest die eigenen zurueck", () => {
    const db = testDb();
    legeEigenesZeichenAn(db, werte());
    legeEigenesZeichenAn(db, werte({ name: "Zweites" }));
    legeEigenesZeichenAn(db, werte({ sub: "sub-2", name: "Fremdes" }));
    const meine = eigeneZeichenVon(db, "sub-1");
    expect(meine.map((z) => z.name).sort()).toEqual(["Zugtrupp Nord", "Zweites"]);
  });

  /*
   * ⛔ DIESELBE ZUSAMMENSTELLUNG DARF ZWEIMAL DASTEHEN, DERSELBE NAME NICHT.
   * Ein uniqueIndex auf spec_kanon zusammen mit onConflictDoUpdate benennte ein
   * bereits gespeichertes Zeichen STILL UM: wer „Zugtrupp Nord" gespeichert hat
   * und dieselbe Zusammenstellung zwei Wochen spaeter als „Test" sichert, faende
   * „Zugtrupp Nord" danach nicht mehr — und niemand haette geloescht. „Schon
   * gespeichert?" ist eine LESEFRAGE, keine Eindeutigkeitszusage.
   */
  it("erlaubt denselben kanonischen Schluessel zweimal", () => {
    const db = testDb();
    legeEigenesZeichenAn(db, werte());
    legeEigenesZeichenAn(db, werte({ name: "Test" }));
    expect(eigeneZeichenVon(db, "sub-1").length).toBe(2);
  });

  it("verbietet denselben Namen zweimal bei derselben Person", () => {
    const db = testDb();
    legeEigenesZeichenAn(db, werte());
    expect(() => legeEigenesZeichenAn(db, werte({ specKanon: "anders" }))).toThrow();
  });

  it("erlaubt denselben Namen bei zwei Personen", () => {
    const db = testDb();
    legeEigenesZeichenAn(db, werte());
    expect(() => legeEigenesZeichenAn(db, werte({ sub: "sub-2" }))).not.toThrow();
  });

  it("findet nach Name und nach Zusammenstellung — nur die eigenen", () => {
    const db = testDb();
    legeEigenesZeichenAn(db, werte());
    expect(eigenesZeichenMitNamen(db, "sub-1", "Zugtrupp Nord")?.name).toBe("Zugtrupp Nord");
    expect(eigenesZeichenMitNamen(db, "sub-2", "Zugtrupp Nord")).toBeNull();
    expect(eigenesZeichenMitKanon(db, "sub-1", "kind=formation")?.name).toBe("Zugtrupp Nord");
    expect(eigenesZeichenMitKanon(db, "sub-2", "kind=formation")).toBeNull();
  });

  it("ueberschreibt Zusammenstellung, Bild und Versionen", () => {
    const db = testDb();
    const id = legeEigenesZeichenAn(db, werte());
    ueberschreibeEigenesZeichen(db, id, {
      specJson: '{"kind":"person"}', specKanon: "kind=person", svg: "<svg>neu</svg>",
      paketVersion: "1.2.0", datenVersion: "0.3.0",
    });
    const zeile = eigenesZeichenMitNamen(db, "sub-1", "Zugtrupp Nord");
    expect(zeile?.specKanon).toBe("kind=person");
    expect(zeile?.paketVersion).toBe("1.2.0");
  });
});
```

- [ ] **Schritt 20: Test laufen lassen und Fehlschlag bestätigen**

Kommando: `pnpm vitest run src/app/m/zeichen/_db/eigeneZeichen.test.ts`
Erwartet: FAIL — `Failed to resolve import "./eigeneZeichen"`.

- [ ] **Schritt 21: Die Datenzugriffe schreiben**

`src/app/m/zeichen/_db/eigeneZeichen.ts`:

```ts
import { and, desc, eq } from "drizzle-orm";
import type { DB } from "./client";
import { eigeneZeichen } from "./schema";

/*
 * DIE ZUGRIFFE AUF `eigene_zeichen` — bewusst eine eigene Datei und nicht
 * `_db/queries.ts`: dort liegen die Abfragen fuer Katalog und Merkliste aus der
 * vorigen Aufgabe, und zwei Autoren in derselben Datei sind ein Konflikt ohne
 * Gegenwert. Diese Tabelle hat genau einen Konsumenten.
 *
 * ABFRAGEN MIT DEM QUERY-BUILDER: `db.query.*` und `relations()` kommen im ganzen
 * Repo null mal vor.
 *
 * ⛔ `sub` KOMMT IMMER AUS `auth()`, NIE AUS EINEM URL-PARAMETER. Jede Funktion
 * hier filtert auf ihn — es gibt keinen Lesepfad, der ohne ihn auskommt.
 */

export interface EigenesZeichenZeile {
  id: string;
  name: string;
  specJson: string;
  specKanon: string;
  svg: string;
  paketVersion: string;
  datenVersion: string;
  geaendertAm: Date;
}

export interface EigenesZeichenWerte {
  sub: string;
  name: string;
  specJson: string;
  specKanon: string;
  svg: string;
  paketVersion: string;
  datenVersion: string;
}

const AUSWAHL = {
  id: eigeneZeichen.id,
  name: eigeneZeichen.name,
  specJson: eigeneZeichen.specJson,
  specKanon: eigeneZeichen.specKanon,
  svg: eigeneZeichen.svgZwischenspeicher,
  paketVersion: eigeneZeichen.paketVersion,
  datenVersion: eigeneZeichen.datenVersion,
  geaendertAm: eigeneZeichen.geaendertAm,
};

export function eigeneZeichenVon(db: DB, sub: string): EigenesZeichenZeile[] {
  return db
    .select(AUSWAHL)
    .from(eigeneZeichen)
    .where(eq(eigeneZeichen.sub, sub))
    .orderBy(desc(eigeneZeichen.geaendertAm))
    .all();
}

export function eigenesZeichenMitNamen(
  db: DB, sub: string, name: string,
): EigenesZeichenZeile | null {
  const treffer = db
    .select(AUSWAHL)
    .from(eigeneZeichen)
    .where(and(eq(eigeneZeichen.sub, sub), eq(eigeneZeichen.name, name)))
    .all();
  return treffer[0] ?? null;
}

/**
 * Die LESEFRAGE „diese Zusammenstellung habe ich schon gespeichert?". Der Index
 * darauf ist bewusst NICHT eindeutig; hier wird gelesen, nicht durchgesetzt.
 */
export function eigenesZeichenMitKanon(
  db: DB, sub: string, kanon: string,
): EigenesZeichenZeile | null {
  const treffer = db
    .select(AUSWAHL)
    .from(eigeneZeichen)
    .where(and(eq(eigeneZeichen.sub, sub), eq(eigeneZeichen.specKanon, kanon)))
    .all();
  return treffer[0] ?? null;
}

export function legeEigenesZeichenAn(db: DB, werte: EigenesZeichenWerte): string {
  const jetzt = new Date();
  const zeilen = db
    .insert(eigeneZeichen)
    .values({
      sub: werte.sub,
      name: werte.name,
      specJson: werte.specJson,
      specKanon: werte.specKanon,
      svgZwischenspeicher: werte.svg,
      paketVersion: werte.paketVersion,
      datenVersion: werte.datenVersion,
      erstelltAm: jetzt,
      geaendertAm: jetzt,
    })
    .returning({ id: eigeneZeichen.id })
    .all();
  return zeilen[0].id;
}

/**
 * ⛔ KEIN `onConflictDoUpdate`. Ueberschrieben wird nur, wenn die Person die
 * Rueckfrage aus §6.6 ausdruecklich beantwortet hat — die Entscheidung faellt in
 * `konfliktFrage`, nicht in einer SQL-Klausel.
 */
export function ueberschreibeEigenesZeichen(
  db: DB,
  id: string,
  werte: Omit<EigenesZeichenWerte, "sub" | "name">,
): void {
  db.update(eigeneZeichen)
    .set({
      specJson: werte.specJson,
      specKanon: werte.specKanon,
      svgZwischenspeicher: werte.svg,
      paketVersion: werte.paketVersion,
      datenVersion: werte.datenVersion,
      geaendertAm: new Date(),
    })
    .where(eq(eigeneZeichen.id, id))
    .run();
}
```

- [ ] **Schritt 22: Test laufen lassen und grün sehen**

Kommando: `pnpm vitest run src/app/m/zeichen/_db/eigeneZeichen.test.ts`
Erwartet: PASS, 6 Fälle.

- [ ] **Schritt 23: Die Server Action ergänzen**

In `src/app/m/zeichen/actions.ts` (Aufgabe 6 hat die Datei mit `"use server"` und den
Merklisten-Actions angelegt) ergänzen — die bestehenden Actions bleiben unberührt:

```ts
import { revalidatePath } from "next/cache";
import { auth } from "@/core/auth";
import { getDb } from "./_db/client";
import {
  eigenesZeichenMitKanon, eigenesZeichenMitNamen, legeEigenesZeichenAn,
  ueberschreibeEigenesZeichen,
} from "./_db/eigeneZeichen";
import { KATALOG_STAND } from "./_lib/katalog";
import { kanonischerSchluessel } from "./_lib/kanon";
import { konfliktFrage, specFormFehler, svgFormFehler } from "./_lib/pruefung";

/**
 * Der Rueckgabetyp von `speichereEigenesZeichen`.
 *
 * Ein Typexport aus einer "use server"-Datei ist zulaessig — er verschwindet im
 * Build (Vorbild `files/(verwaltung)/actions.ts` mit `ShareFormZustand`).
 *
 * DREI AUSGAENGE, WEIL ES DREI LAGEN GIBT: Erfolg, Feldfehler (der Name fehlt) und
 * RUECKFRAGE (§6.6). Die Rueckfrage ist ausdruecklich KEIN Feldfehler: es ist
 * nichts falsch, es ist nur etwas zu entscheiden — und die Entscheidung trifft die
 * Person, nicht die Action.
 */
export type SpeichernZustand =
  | { ok: true; name: string }
  | { ok: false; art: "fehler"; feldFehler: Record<string, string>; werte: Record<string, string> }
  | {
      ok: false;
      art: "rueckfrage";
      frage: "name" | "zusammenstellung";
      text: string;
      werte: Record<string, string>;
    };

const feld = (formData: FormData, name: string): string => {
  const wert = formData.get(name);
  return typeof wert === "string" ? wert : "";
};

/**
 * EIN EIGENES ZEICHEN SPEICHERN (Spec §6.6).
 *
 * Die Kette: `sub` pruefen → FORMpruefung von Spec und SVG → kanonischer
 * Schluessel → Konfliktfrage → schreiben → revalidatePath.
 *
 * ⛔ DER KANONISCHE SCHLUESSEL WIRD HIER GERECHNET, nicht vom Client uebernommen.
 * Er beantwortet die Frage „schon gespeichert?", und ein mitgelieferter Wert
 * koennte sie beliebig beantworten. `_lib/kanon.ts` importiert keinen Katalogcode,
 * das Rechnen ist reine Zeichenkettenarbeit.
 *
 * ⛔ EINE FACHLICHE PRUEFUNG DER SPEC GIBT ES NICHT: sie braeuchte
 * `composeFromCatalog` und zoege den Katalog in den Server-Graph (M1). Gespeichert
 * wird das von der Insel gelieferte SVG; auf /meine wird es als `<img>`-Datenquelle
 * gerendert und nie als HTML ausgefuehrt (§4.3).
 *
 * `paket_version`/`daten_version` kommen aus `KATALOG_STAND` — als Literale
 * notiert loegen sie ab dem ersten Upgrade.
 *
 * Zugriffsverletzungen WERFEN; Feldfehler kommen zurueck.
 */
export async function speichereEigenesZeichen(
  _vorher: SpeichernZustand,
  formData: FormData,
): Promise<SpeichernZustand> {
  const sub = (await auth())?.user?.id;
  if (!sub) throw new Error("Forbidden");

  const name = feld(formData, "name").trim();
  const specJson = feld(formData, "spec");
  const svg = feld(formData, "svg");
  const bestaetigung = feld(formData, "bestaetigung");
  const werte = { name };

  if (name === "") {
    return {
      ok: false, art: "fehler", werte,
      feldFehler: { name: "Gib dem Zeichen einen Namen, damit du es wiederfindest." },
    };
  }
  if (name.length > 80) {
    return { ok: false, art: "fehler", werte, feldFehler: { name: "Höchstens 80 Zeichen." } };
  }
  const specFehler = specFormFehler(specJson);
  if (specFehler) return { ok: false, art: "fehler", werte, feldFehler: { spec: specFehler } };
  const svgFehler = svgFormFehler(svg);
  if (svgFehler) return { ok: false, art: "fehler", werte, feldFehler: { spec: svgFehler } };

  const kanon = kanonischerSchluessel(JSON.parse(specJson));
  const db = getDb();
  const gleicherName = eigenesZeichenMitNamen(db, sub, name);
  const gleicheForm = eigenesZeichenMitKanon(db, sub, kanon);
  const frage = konfliktFrage(
    gleicherName !== null,
    gleicheForm && gleicheForm.name !== name ? gleicheForm.name : null,
    bestaetigung,
  );
  if (frage === "name") {
    return {
      ok: false, art: "rueckfrage", frage, werte,
      text: "Unter diesem Namen hast du schon ein Zeichen. Überschreiben oder anders benennen?",
    };
  }
  if (frage === "zusammenstellung") {
    return {
      ok: false, art: "rueckfrage", frage, werte,
      text:
        `Diese Zusammenstellung hast du schon als „${gleicheForm?.name}“ gespeichert — ` +
        "trotzdem zusätzlich sichern?",
    };
  }

  const gemeinsam = {
    specJson, specKanon: kanon, svg,
    paketVersion: KATALOG_STAND.paket, datenVersion: KATALOG_STAND.daten,
  };
  if (gleicherName) ueberschreibeEigenesZeichen(db, gleicherName.id, gemeinsam);
  else legeEigenesZeichenAn(db, { sub, name, ...gemeinsam });

  revalidatePath("/m/zeichen", "layout");
  return { ok: true, name };
}
```

- [ ] **Schritt 24: Den fehlschlagenden Test für die Insel schreiben**

`src/app/m/zeichen/_ui/baukasten/BaukastenInsel.test.tsx`:

```tsx
// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { click, exists, mount, query, queryAll, unmount } from "@/app/m/qr/_lib/test-dom";
import BaukastenInsel from "./BaukastenInsel";

/*
 * Die Server Action wird ATTRAPPIERT: `useActionState` braucht nur eine Funktion,
 * und ein echter Aufruf zoege `auth()` und die Datenbank in einen jsdom-Lauf.
 * Direkt importiert wird sie in der Insel trotzdem — Server Actions duerfen als
 * einzige ueber die RSC-Grenze, aber nur importiert, nie als Prop (Falle 9).
 */
vi.mock("../../actions", () => ({
  speichereEigenesZeichen: vi.fn(async () => ({ ok: true, name: "Test" })),
}));

afterEach(async () => {
  await unmount();
});

describe("Baukasten-Insel", () => {
  it("stellt die neun Achsen in der erzwungenen Reihenfolge dar", async () => {
    await mount(<BaukastenInsel />);
    expect(queryAll("[data-achse]").map((e) => e.getAttribute("data-achse"))).toEqual([
      "grundzeichenart", "zugehoerigkeit", "kopfzone", "funktion", "fussstreifen",
      "koerperform", "faehigkeit", "koerpermarken", "beschriftung",
    ]);
  });

  it("zeigt nach der Wahl einer Grundzeichenart eine Vorschau", async () => {
    await mount(<BaukastenInsel />);
    await click("[data-testid='tz-kachel-formation']");
    expect(query("[data-testid='tz-vorschau']").innerHTML).toContain("<svg");
  });

  /*
   * DIE ZWEI SPERRARTEN (M10, Spec §6.2): `scope: "value"` heisst „ueberall
   * unmoeglich" und bleibt dauerhaft ausgegraut; alles andere heisst „passt hier
   * nicht" und traegt seinen Grund am Feld. Ein Baukasten, der stattdessen
   * hinterher meckert, laesst 99,6 % Unsinn zu (M16: 894 von 225.720 tragen).
   */
  it("graut einen nirgends vermessenen Wert aus", async () => {
    await mount(<BaukastenInsel />);
    await click("[data-testid='tz-kachel-vehicle-land']");
    const option = query<HTMLOptionElement>(
      "[data-feld='vehicleCategory'] option[value='vehicleCategory:amphibienfahrzeug']",
    );
    expect(option.disabled).toBe(true);
    expect(option.textContent).toContain("nicht vermessen");
  });

  it("nennt gesperrte Kombinationen mit Grund am Feld", async () => {
    await mount(<BaukastenInsel />);
    await click("[data-testid='tz-kachel-building']");
    expect(query("[data-gesperrt='kopfzone']").textContent).toMatch(/Einheiten|passt/i);
  });

  /*
   * WORT ZUERST, ZEICHEN ZWEITENS, FARBE ZULETZT — und Rot gar nicht: in dieser
   * Suite ist `colorError === colorPrimary === #c8000f` (Falle 3), ein roter
   * Hinweis saehe aus wie eine Primaeraktion.
   */
  it("setzt keinen Fehlertext in Rot", async () => {
    await mount(<BaukastenInsel />);
    await click("[data-testid='tz-kachel-building']");
    const stil = query("[data-gesperrt='kopfzone']").getAttribute("style") ?? "";
    expect(stil).not.toMatch(/#c8000f|red/i);
  });

  it("startet eine Uebungsaufgabe, zeigt nur die Bedeutung und schreibt nichts", async () => {
    await mount(<BaukastenInsel />);
    await click("[data-testid='tz-uebung-start']");
    const aufgabe = query("[data-testid='tz-uebung-aufgabe']");
    expect(aufgabe.textContent).toMatch(/Grundzeichen/);
    // Der gesuchte Titel steht NICHT da — sonst waere die Aufgabe geschenkt.
    expect(exists("[data-testid='tz-uebung-loesung']")).toBe(false);
    await click("[data-testid='tz-uebung-pruefen']");
    expect(query("[data-testid='tz-uebung-urteil']").textContent).toMatch(/Stimmt|fehlt|Anders/);
  });

  it("bietet die drei Ausgabewege an", async () => {
    await mount(<BaukastenInsel />);
    await click("[data-testid='tz-kachel-formation']");
    expect(exists("[data-testid='tz-export-svg']")).toBe(true);
    expect(exists("[data-testid='tz-export-png']")).toBe(true);
    expect(exists("[data-testid='tz-export-json']")).toBe(true);
  });

  /*
   * Kein `Form`/`Form.Item` (Compound, in RSC verboten — und eine zweite Bauform
   * fuers gleiche Formular hier). Statt dessen ein natives `<label htmlFor>`.
   */
  it("beschriftet das Namensfeld nativ ueber htmlFor", async () => {
    await mount(<BaukastenInsel />);
    const label = query<HTMLLabelElement>("label[for='tz-name']");
    expect(label.textContent).toMatch(/Name/);
    expect(exists("#tz-name")).toBe(true);
  });
});
```

- [ ] **Schritt 25: Test laufen lassen und Fehlschlag bestätigen**

Kommando: `pnpm vitest run src/app/m/zeichen/_ui/baukasten/BaukastenInsel.test.tsx`
Erwartet: FAIL — die Insel ist noch das Gerüst aus Aufgabe 2 und rendert nur ein einzelnes SVG,
`[data-achse]` findet nichts.

- [ ] **Schritt 26: Stilblatt und Achsenfelder schreiben**

`src/app/m/zeichen/_ui/baukasten/baukasten.module.css`:

```css
/*
 * ⛔ HIER STEHT KEIN `--ant-*`. antd deklariert seine Variablen auf SEINER
 * Scope-Klasse, eigenes Markup sieht sie nicht, und der Fehler ist still — die
 * Linie verschwindet einfach (Falle 2). Die `--tz-*`-Variablen des Moduls kommen
 * aus `_ui/zeichen.module.css`; die `var(..., …)`-Rueckfaelle hier halten den
 * Baukasten auch dann lesbar, wenn er als erstes gerendert wird.
 */

/*
 * DIE HELLE PLATTE. Gemessen tragen alle drei RENDER_THEMES `surface: '#ffffff'`,
 * und `renderSvg` malt keinen Hintergrund. Jedes Zeichen liegt deshalb auf einer
 * hellen Flaeche, nie auf einem umgefaerbten Theme — die Organisationsfarben sind
 * fachlich festgelegt und duerfen im Dunkelmodus nicht kippen.
 */
.blatt {
  background: var(--tz-blatt, #ffffff);
  border-radius: 8px;
  padding: 12px;
  display: flex;
  justify-content: center;
}

/*
 * Arimo. Gemessen tragen 160 von 242 Rezepten `<text font-family="Arimo">`, und
 * die Textgeometrie ist gegen Arimo vermessen. Diese Regel schlaegt das
 * Praesentationsattribut (Attributspezifitaet 0) — Falle 5 in die richtige
 * Richtung. Die Klasse steht hier ein zweites Mal, weil ein CSS-Modul LOKAL
 * benannt ist: dieselbe Regel im zweiten Geltungsbereich, keine zweite Wahrheit.
 */
.blatt svg text {
  font-family: var(--tz-zeichenschrift, sans-serif);
}

/*
 * Der Hinweis am Feld: 3 px linke Kante, gedaempft — NIE rot (Falle 3:
 * colorError === colorPrimary === #c8000f, ein roter Hinweis saehe aus wie eine
 * Primaeraktion).
 */
.hinweis {
  border-inline-start: 3px solid var(--tz-hinweis, #8c8c8c);
  padding-inline-start: 8px;
  margin: 4px 0 0;
  opacity: 0.85;
}

/* ARBEITSDICHTE als Literal: eigenes Markup erbt den antd-Token nicht (Falle 4). */
.feld {
  display: block;
  width: 100%;
  min-height: 44px;
  padding: 8px;
  margin-block-start: 4px;
}

.kachel {
  min-height: 44px;
  min-width: 88px;
  padding: 8px;
  cursor: pointer;
}

.kachelGewaehlt {
  outline: 2px solid currentColor;
}

.kachelraster {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
```

`src/app/m/zeichen/_ui/baukasten/AchsenFelder.tsx`:

```tsx
"use client";

import type { SymbolSpec } from "@einsatzzeichen/schema";
import { SCHRIFT } from "@/core/theme/schrift";
import { SPACE } from "@/core/theme/tokens";
import { ACHSEN, bezeichnung, kandidaten } from "./vokabular";
import { ZONEN, type Wertbefund, type Zone } from "./zustand";
import css from "./baukasten.module.css";

/*
 * DIE NEUN BEDIENFELDER. Native `<select>`/`<input>` statt antd-Auswahlfeldern,
 * und das ist begruendet:
 *   - Die Sperrung bildet sich 1:1 auf `<option disabled>` ab, samt Grund im
 *     Optionstext. Ein antd-Select zeigte den Grund gar nicht.
 *   - `FullShell` rendert auch auf dem Telefon; ein natives Feld bekommt dort den
 *     Auswaehler des Betriebssystems — bei 132 Koerpermarken der Unterschied
 *     zwischen bedienbar und nicht.
 *   - Kein Portal, also auch keine zweite Bedienhilfe fuer Tests: `testFelder.ts`
 *     in `aufgaben/_ui` ist ausdruecklich modulprivat.
 * `size` wird nirgends gesetzt (Falle 4); die 44 px stehen als Literal im CSS.
 */

export interface AchsenFelderProps {
  spec: SymbolSpec;
  /** Feldname → Wert → Befund, aus `erlaubteWerte`. */
  befunde: Map<string, Map<string, Wertbefund>>;
  /** Kachel-Vorschauen der Grundzeichenarten; `null` heisst „komponiert nackt nicht". */
  miniaturen: Map<string, string | null>;
  setzeFeld: (feld: keyof SymbolSpec, wert: unknown) => void;
  setzeFelder: (paare: readonly (readonly [keyof SymbolSpec, unknown])[]) => void;
  setzeZone: (zone: Zone, text: string) => void;
  /** Regeltexte, die gerade an einem Feld haengen. Schluessel ist der Achsen-Key. */
  hinweise: Map<string, readonly string[]>;
}

const GESPERRT_MAX = 3;

function gesperrteZeile(befunde: readonly Wertbefund[], feld: string): string | null {
  const gesperrt = befunde.filter((b) => !b.frei);
  if (gesperrt.length === 0) return null;
  const genannt = gesperrt
    .slice(0, GESPERRT_MAX)
    .map((b) => `${bezeichnung(feld, b.wert)} — ${b.grund}`);
  const rest = gesperrt.length - genannt.length;
  return rest > 0 ? `${genannt.join(" · ")} · und ${rest} weitere` : genannt.join(" · ");
}

export function AchsenFelder(props: AchsenFelderProps) {
  const { spec, befunde, setzeFeld, setzeFelder, setzeZone, hinweise, miniaturen } = props;

  return (
    <>
      {ACHSEN.map((achse) => {
        const achsenHinweise = hinweise.get(achse.key) ?? [];
        return (
          <section
            key={achse.key}
            data-achse={achse.key}
            style={{ marginBlockEnd: SPACE.lg }}
          >
            <h3 style={{ ...SCHRIFT.unterTitel, margin: 0 }}>{achse.titel}</h3>
            <p style={{ ...SCHRIFT.neben, margin: 0 }}>{achse.hilfe}</p>

            {achse.art === "kacheln" && (
              <div className={css.kachelraster}>
                {kandidaten("kind").map((id) => {
                  const svg = miniaturen.get(id) ?? null;
                  return (
                    <button
                      key={id}
                      type="button"
                      data-testid={`tz-kachel-${id}`}
                      className={`${css.kachel} ${spec.kind === id ? css.kachelGewaehlt : ""}`}
                      aria-pressed={spec.kind === id}
                      onClick={() => setzeFeld("kind", id)}
                    >
                      {/*
                        Das Markup stammt aus `renderSvg` im selben Prozess, nicht
                        aus einer Eingabe — dieselbe Lage wie `qr/QrDisplay.tsx:151`.
                        `circle-12` und `reduced-house` komponieren nackt nicht und
                        bekommen einen Platzhalter statt einer erfundenen Zeichnung.
                      */}
                      {svg ? (
                        <span dangerouslySetInnerHTML={{ __html: svg }} />
                      ) : (
                        <span aria-hidden="true">▢</span>
                      )}
                      <span style={{ display: "block" }}>{bezeichnung("kind", id)}</span>
                    </button>
                  );
                })}
              </div>
            )}

            {(achse.art === "wahl" || achse.art === "fussstreifen") &&
              achse.felder
                .filter((f) => f !== "designation")
                .map((feld) => {
                  const liste = befunde.get(feld) ?? new Map<string, Wertbefund>();
                  const werte = kandidaten(feld);
                  return (
                    <select
                      key={feld}
                      className={css.feld}
                      data-feld={feld}
                      aria-label={`${achse.titel} — ${feld}`}
                      value={
                        typeof spec[feld] === "string"
                          ? `${feld}:${spec[feld] as string}`
                          : Array.isArray(spec[feld])
                            ? `${feld}:${(spec[feld] as string[])[0] ?? ""}`
                            : ""
                      }
                      onChange={(e) => {
                        const roh = e.target.value;
                        // Beim Wechsel der Quelle die anderen Felder derselben Achse
                        // leeren — sie belegen denselben Platz (head-zone-conflict,
                        // chassis-foot-conflict, technical-fill-organization-conflict).
                        // ⛔ ALLES IN EINEM SCHRITT. Zwei setzeFeld-Aufrufe im selben
                        // Ereignis rechnen beide vom selben Ausgangsstand — das
                        // konkurrierende Feld bliebe stehen, und die Buendelung waere
                        // wirkungslos.
                        const paare: (readonly [keyof SymbolSpec, unknown])[] = achse.felder
                          .filter((anderes) => !roh.startsWith(`${anderes}:`))
                          .map((anderes) => [anderes, undefined] as const);
                        if (roh !== "") {
                          const wert = roh.slice(roh.indexOf(":") + 1);
                          paare.push([feld, feld === "capabilities" ? [wert] : wert] as const);
                        }
                        setzeFelder(paare);
                      }}
                    >
                      <option value="">— ohne —</option>
                      {werte.map((wert) => {
                        const befund = liste.get(wert);
                        const zusatz =
                          befund && !befund.frei
                            ? befund.sperre === "wert"
                              ? " (nicht vermessen)"
                              : " (passt hier nicht)"
                            : "";
                        return (
                          <option
                            key={wert}
                            value={`${feld}:${wert}`}
                            disabled={befund ? !befund.frei : false}
                            title={befund?.grund}
                          >
                            {bezeichnung(feld, wert)}
                            {zusatz}
                          </option>
                        );
                      })}
                    </select>
                  );
                })}

            {achse.art === "fussstreifen" && (
              <label className={css.feld} htmlFor="tz-designation">
                Eigener Text unter dem Körper
                <input
                  id="tz-designation"
                  className={css.feld}
                  value={spec.designation ?? ""}
                  onChange={(e) => {
                    // Kategorie und Text belegen denselben Streifen — in EINEM Schritt
                    // leeren und setzen, aus demselben Grund wie oben.
                    setzeFelder(
                      e.target.value !== ""
                        ? ([["vehicleCategory", undefined], ["designation", e.target.value]] as const)
                        : ([["designation", e.target.value]] as const),
                    );
                  }}
                />
              </label>
            )}

            {achse.art === "mehrfach" && (
              <MarkenFeld
                gewaehlt={(spec.bodyMarks as string[] | undefined) ?? []}
                befunde={befunde.get("bodyMarks") ?? new Map()}
                setze={(werte) => setzeFeld("bodyMarks", werte)}
              />
            )}

            {achse.art === "beschriftung" &&
              ZONEN.map((zone) => (
                <label key={zone} className={css.feld} htmlFor={`tz-zone-${zone}`}>
                  {ZONENNAMEN[zone]}
                  <input
                    id={`tz-zone-${zone}`}
                    className={css.feld}
                    value={spec.labels?.[zone] ?? ""}
                    onChange={(e) => setzeZone(zone, e.target.value)}
                  />
                </label>
              ))}

            {achse.felder.map((feld) => {
              const zeile = gesperrteZeile([...(befunde.get(feld)?.values() ?? [])], feld);
              return zeile ? (
                <p key={feld} className={css.hinweis} data-gesperrt={achse.key}>
                  Nicht möglich: {zeile}
                </p>
              ) : null;
            })}

            {achsenHinweise.map((text) => (
              <p key={text} className={css.hinweis} data-regel={achse.key}>
                {text}
              </p>
            ))}
          </section>
        );
      })}
    </>
  );
}

const ZONENNAMEN: Record<Zone, string> = {
  center: "Mitte",
  topLeft: "Oben links",
  bottomLeft: "Unten links",
  bottomCenter: "Unten mittig",
  bottomRight: "Unten rechts",
};

/**
 * Die Koerpermarken: 132 Werte, mehrfach waehlbar. Ein Suchfeld mit `datalist`
 * plus Chips statt einer Liste aus 132 Kaestchen — auf einem Telefon waere die
 * Liste unbedienbar, und ein `<select multiple>` verlangt Strg-Klicks, die es dort
 * nicht gibt. Angeboten werden nur die FREIEN Werte; die gesperrten stehen mit
 * Grund in der Zeile darunter (dieselbe Zeile wie bei den uebrigen Achsen).
 */
function MarkenFeld(props: {
  gewaehlt: readonly string[];
  befunde: Map<string, Wertbefund>;
  setze: (werte: string[]) => void;
}) {
  const frei = [...props.befunde.values()].filter((b) => b.frei).map((b) => b.wert);
  return (
    <div>
      <label className={css.feld} htmlFor="tz-marke-suche">
        Körpermarke suchen und hinzufügen
        <input id="tz-marke-suche" className={css.feld} list="tz-marken" />
      </label>
      <datalist id="tz-marken">
        {frei.map((wert) => (
          <option key={wert} value={bezeichnung("bodyMarks", wert)} data-id={wert} />
        ))}
      </datalist>
      <button
        type="button"
        className={css.kachel}
        data-testid="tz-marke-hinzufuegen"
        onClick={() => {
          const eingabe = document.querySelector<HTMLInputElement>("#tz-marke-suche");
          const text = eingabe?.value ?? "";
          const treffer = frei.find((w) => bezeichnung("bodyMarks", w) === text);
          if (!treffer || props.gewaehlt.includes(treffer)) return;
          props.setze([...props.gewaehlt, treffer]);
          if (eingabe) eingabe.value = "";
        }}
      >
        Hinzufügen
      </button>
      <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
        {props.gewaehlt.map((wert) => (
          <li key={wert} style={{ minHeight: 44, display: "flex", alignItems: "center" }}>
            {bezeichnung("bodyMarks", wert)}
            <button
              type="button"
              className={css.kachel}
              onClick={() => props.setze(props.gewaehlt.filter((w) => w !== wert))}
            >
              Entfernen
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
```

- [ ] **Schritt 27: Das Speichern-Formular schreiben**

`src/app/m/zeichen/_ui/baukasten/SpeichernFormular.tsx`:

```tsx
"use client";

import { useActionState, useState } from "react";
import { Alert, Button } from "antd";
import { SPACE } from "@/core/theme/tokens";
import { speichereEigenesZeichen, type SpeichernZustand } from "../../actions";
import css from "./baukasten.module.css";

/*
 * ⛔ KEIN `Form`/`Form.Item` (Compound-Zugriff, in einer Server Component
 * verboten — und hier waere es eine zweite Bauform fuer dasselbe). Stattdessen
 * `useActionState` mit nativem `<label htmlFor>`, `aria-invalid` und einem
 * GEDAEMPFTEN Fehlertext: `colorError === colorPrimary === #c8000f` (Falle 3),
 * roter Text saehe aus wie eine Primaeraktion.
 *
 * Die Server Action wird DIREKT IMPORTIERT, nie als Prop durchgereicht (Falle 9).
 */

const START: SpeichernZustand = { ok: false, art: "fehler", feldFehler: {}, werte: {} };

export function SpeichernFormular(props: { specJson: string; svg: string; bereit: boolean }) {
  const [zustand, absenden] = useActionState(speichereEigenesZeichen, START);
  const [name, setName] = useState("");

  const fehler =
    !zustand.ok && zustand.art === "fehler" ? (zustand.feldFehler.name ?? zustand.feldFehler.spec) : undefined;
  const rueckfrage = !zustand.ok && zustand.art === "rueckfrage" ? zustand : null;

  return (
    <form action={absenden} data-testid="tz-speichern">
      <input type="hidden" name="spec" value={props.specJson} />
      <input type="hidden" name="svg" value={props.svg} />
      {/*
        ⛔ KEIN VERSTECKTES FELD UND KEIN REACT-STATE FUER DIE BESTAETIGUNG.
        `setBestaetigung` wirkte erst nach dem Re-Render; das Formular geht im
        selben Ereignis raus und truege noch den ALTEN Wert — „Ueberschreiben"
        loeste dieselbe Rueckfrage endlos erneut aus, und eine stehengebliebene
        Bestaetigung ueberschriebe beim naechsten Speichern ungefragt.
        Stattdessen traegt der ausloesende Submit-Knopf name+value; genau sein
        Wert landet in der FormData, und der gewoehnliche Speichern-Knopf traegt
        keinen — `bestaetigung` fehlt dann schlicht.
      */}

      <label htmlFor="tz-name">Name</label>
      <input
        id="tz-name"
        name="name"
        className={css.feld}
        value={name}
        onChange={(e) => setName(e.target.value)}
        aria-invalid={fehler ? true : undefined}
        aria-describedby={fehler ? "tz-name-fehler" : undefined}
      />
      {fehler && (
        <p id="tz-name-fehler" className={css.hinweis}>
          {fehler}
        </p>
      )}

      {rueckfrage && (
        /* `type="warning"`, NIE `type="error"` — Falle 3. Und es ist auch kein
           Fehler: es ist eine Frage. */
        <Alert
          type="warning"
          showIcon
          data-testid="tz-rueckfrage"
          message={rueckfrage.text}
          action={
            <Button
              htmlType="submit"
              data-testid="tz-rueckfrage-ja"
              name="bestaetigung"
              value={rueckfrage.frage === "name" ? "ueberschreiben" : "zusaetzlich"}
            >
              {rueckfrage.frage === "name" ? "Überschreiben" : "Trotzdem sichern"}
            </Button>
          }
        />
      )}

      {zustand.ok && (
        <Alert type="success" showIcon title={`„${zustand.name}“ ist gespeichert.`} />
      )}

      <Button
        htmlType="submit"
        type="primary"
        disabled={!props.bereit}
        data-testid="tz-speichern-knopf"
        style={{ marginBlockStart: SPACE.sm }}
      >
        Speichern
      </Button>
    </form>
  );
}
```

- [ ] **Schritt 28: Die Insel ausbauen**

`src/app/m/zeichen/_ui/baukasten/BaukastenInsel.tsx` — ersetzt das Gerüst aus Aufgabe 2:

```tsx
"use client";

import { useCallback, useMemo, useState } from "react";
import { Alert, Button, Card } from "antd";
import type { SymbolSpec } from "@einsatzzeichen/schema";
import { SCHRIFT } from "@/core/theme/schrift";
import { SPACE } from "@/core/theme/tokens";
import { alleZeichen } from "../../_lib/katalog";
import { regeltext } from "../../_lib/regeltexte";
import { AchsenFelder } from "./AchsenFelder";
import { SpeichernFormular } from "./SpeichernFormular";
import { ACHSEN, bezeichnung, kandidaten } from "./vokabular";
import { composeFromCatalog, rasterDimensionsForWidth, renderCanvas } from "./paket";
import {
  baue, dekodiereSpec, erlaubteWerte, felddifferenz, kodiereSpec, ohneTexte, reduceSpec,
  setzeBeschriftung, ziehePruefaufgabe, type Uebungsaufgabe, type Wertbefund, type Zone,
} from "./zustand";
import css from "./baukasten.module.css";

/*
 * DER BAUKASTEN. Wird ausschliesslich ueber `BaukastenLader.tsx` mit
 * dynamic(..., { ssr: false }) geladen — die gemessene Bedingung dafuer, dass
 * `next.config.ts` unangetastet bleibt (M2/M3).
 *
 * Das Generat wird hier MIT importiert (`alleZeichen`), fuer die Bauuebung. Es
 * kostet gemessen 31.902 B gzip inklusive aller 246 Bilder und liegt im selben
 * Chunk, den die Katalog-Insel ohnehin laedt. Die Alternative — den Aufgabenpool
 * als Prop aus der Server Component reichen — schickte bei JEDEM Aufruf rund
 * 46 KB unkomprimiert und nicht zwischenspeicherbar durch den Flight-Payload und
 * braeuchte einen zweiten Codepfad fuer dieselben Daten.
 */

const VORSCHAU_PX = 256;
const MINIATUR_PX = 48;

/** Die 232 fragbaren Hauptrezepte mit Spec — der Pool der Bauuebung (Spec §6.5). */
const UEBUNGSPOOL: readonly Uebungsaufgabe[] = alleZeichen()
  .filter((z) => z.id.startsWith("rezept:") && z.spec !== null && z.specKanon !== null)
  .map((z) => ({
    id: z.id,
    titel: z.titel,
    bedeutung: z.bedeutung,
    specKanon: z.specKanon as string,
    spec: z.spec as SymbolSpec,
    svg: z.svg,
  }));

/** Der Anfangszustand: aus `?s=` gelesen, sonst leer. Nur im Browser — `ssr:false`. */
function anfangsSpec(): SymbolSpec {
  const param = new URLSearchParams(window.location.search).get("s");
  return (param && dekodiereSpec(param)) || ({ kind: "formation" } as SymbolSpec);
}

export default function BaukastenInsel() {
  const [spec, setSpec] = useState<SymbolSpec>(anfangsSpec);
  const [aufgabe, setAufgabe] = useState<Uebungsaufgabe | null>(null);
  const [urteil, setUrteil] = useState<string | null>(null);
  const [weisserGrund, setWeisserGrund] = useState(true);
  const [exportFehler, setExportFehler] = useState<string | null>(null);

  const aendere = useCallback((naechste: SymbolSpec) => {
    setSpec(naechste);
    /*
     * `history.replaceState` und NICHT `router.replace`: die Adresse ist hier ein
     * Merkzettel zum Teilen, kein Navigationsziel. Ein Router-Aufruf loeste bei
     * jeder Auswahl eine RSC-Anfrage aus — Dutzende pro Zeichen.
     */
    const url = new URL(window.location.href);
    url.searchParams.set("s", kodiereSpec(naechste));
    window.history.replaceState(null, "", url);
  }, []);

  const setzeFeld = useCallback(
    (feld: keyof SymbolSpec, wert: unknown) => aendere(reduceSpec(spec, { feld, wert })),
    [aendere, spec],
  );
  /*
   * MEHRERE FELDER IN EINEM SCHRITT — und das ist kein Komfort, sondern die Bedingung
   * dafuer, dass die Achsenbuendelung ueberhaupt wirkt. Zwei aufeinanderfolgende
   * `setzeFeld`-Aufrufe im SELBEN Ereignis rechnen beide vom selben `spec` aus der
   * Closure; der letzte gewinnt, und das konkurrierende Feld der Achse wird gerade
   * NICHT geleert. Die Spec traegt danach genau die Kombination, die Spec §6.1
   * ausschliessen will, und die Vorschau faellt in head-zone-conflict bzw.
   * chassis-foot-conflict.
   */
  const setzeFelder = useCallback(
    (paare: readonly (readonly [keyof SymbolSpec, unknown])[]) =>
      aendere(paare.reduce((s, [feld, wert]) => reduceSpec(s, { feld, wert }), spec)),
    [aendere, spec],
  );
  const setzeZone = useCallback(
    (zone: Zone, text: string) => aendere(setzeBeschriftung(spec, zone, text)),
    [aendere, spec],
  );

  const ergebnis = useMemo(() => baue(spec, VORSCHAU_PX, "tz-vorschau"), [spec]);

  /*
   * DIE WERTESPERRUNG PROBT GEGEN `ohneTexte(spec)`. Sonst sperrte ein einziger zu
   * langer Text jede Achse mit `label-too-wide` und die Oberflaeche behauptete,
   * nichts passe mehr zusammen (siehe Kopfkommentar von `ohneTexte`). Der
   * Textverstoss steht unten an seinem Feld.
   *
   * Die Rechnung liegt in einem `useMemo` ueber dem textfreien Stand: gemessen
   * 9,7 ms kalt / 3,4 ms warm fuer 247 Kandidaten (M16), hochgerechnet rund 12 ms
   * fuer die 315 Kandidaten dieses Vokabulars. Alle Felder auf einmal statt erst
   * beim Oeffnen eines Feldes — sonst zeigte das Feld beim ersten Oeffnen die
   * Sperren des vorigen Standes.
   */
  const sperrGrundlage = useMemo(() => ohneTexte(spec), [spec]);
  const befunde = useMemo(() => {
    const karte = new Map<string, Map<string, Wertbefund>>();
    for (const achse of ACHSEN) {
      for (const feld of achse.felder) {
        if (feld === "labels" || feld === "designation" || feld === "kind") continue;
        karte.set(
          feld,
          new Map(
            erlaubteWerte(sperrGrundlage, feld, kandidaten(feld)).map((b) => [b.wert, b]),
          ),
        );
      }
    }
    return karte;
  }, [sperrGrundlage]);

  /*
   * Die Kachelvorschauen entstehen EINMAL: sie haengen nur an `kind`, nicht am
   * uebrigen Stand. `circle-12` und `reduced-house` komponieren nackt nicht und
   * bekommen `null` — die Kachel zeichnet dann einen Platzhalter statt einer
   * erfundenen Zeichnung.
   */
  const miniaturen = useMemo(() => {
    const karte = new Map<string, string | null>();
    for (const id of kandidaten("kind")) {
      const e = baue({ kind: id } as SymbolSpec, MINIATUR_PX, `tz-mini-${id}`);
      karte.set(id, e.ok ? e.svg : null);
    }
    return karte;
  }, []);

  /**
   * Die Regeltexte, die gerade anliegen — an der Achse, zu der die Regel gehoert.
   * Gerendert wird `error.issues`, nicht `error.message` (die ist fuers Log).
   */
  const hinweise = useMemo(() => {
    const karte = new Map<string, string[]>();
    if (ergebnis.ok) return karte;
    const texte =
      ergebnis.art === "regel"
        ? ergebnis.verstoesse.map((v) => {
            const t = regeltext(v.rule);
            return `${t.titel}. ${t.erklaerung}`;
          })
        : [`Diese Zusammenstellung ist nicht vermessen. ${ergebnis.meldung}`];
    karte.set("beschriftung", texte);
    return karte;
  }, [ergebnis]);

  const svg = ergebnis.ok ? ergebnis.svg : "";

  const lade = (blob: Blob, dateiname: string) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = dateiname;
    a.click();
    URL.revokeObjectURL(url);
  };

  /*
   * PNG — drei Fallstricke, alle behandelt (Spec §6.4):
   *  (a) `renderCanvas` malt KEINEN Hintergrund. Ohne den Umschalter landete ein
   *      schwarzes Zeichen unsichtbar in einer dunklen Praesentation.
   *  (b) `await document.fonts.load("16px Arimo")` VOR dem Zeichnen — sonst
   *      rastert der erste Export mit der Ersatzschrift und der zweite mit Arimo:
   *      ein stiller, nicht reproduzierbarer Unterschied. `?.` weil jsdom keine
   *      FontFaceSet kennt.
   *  (c) `renderCanvas` kann werfen → Anwendermeldung statt weisser Seite.
   */
  const exportierePng = async () => {
    setExportFehler(null);
    try {
      const zeichnung = composeFromCatalog(spec);
      const masse = rasterDimensionsForWidth(zeichnung.viewBox, 1024);
      const leinwand = document.createElement("canvas");
      leinwand.width = masse.widthPx;
      leinwand.height = masse.heightPx;
      const ctx = leinwand.getContext("2d");
      if (!ctx) {
        setExportFehler("Dieser Browser kann kein Bild erzeugen. Nimm den SVG-Export.");
        return;
      }
      await document.fonts?.load("16px Arimo");
      if (weisserGrund) {
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, masse.widthPx, masse.heightPx);
      }
      renderCanvas(zeichnung, ctx, { size: 1024 });
      leinwand.toBlob((blob) => {
        if (blob) lade(blob, "zeichen.png");
        else setExportFehler("Das Bild ließ sich nicht erzeugen.");
      }, "image/png");
    } catch {
      setExportFehler("Dieses Zeichen lässt sich gerade nicht als Bild ausgeben.");
    }
  };

  const starteUebung = () => {
    setAufgabe(ziehePruefaufgabe(UEBUNGSPOOL));
    setUrteil(null);
    aendere({ kind: "formation" } as SymbolSpec);
  };

  return (
    <div>
      <Card style={{ marginBlockEnd: SPACE.lg }}>
        <div className={css.blatt} data-testid="tz-vorschau" dangerouslySetInnerHTML={{ __html: svg }} />
        {ergebnis.ok ? (
          <p style={{ ...SCHRIFT.neben }}>{ergebnis.bedeutung}</p>
        ) : (
          /* `type="warning"`, nie `type="error"` — Falle 3. */
          <Alert
            type="warning"
            showIcon
            data-testid="tz-kein-bild"
            message="Diese Zusammenstellung lässt sich noch nicht zeichnen."
          />
        )}

        <div style={{ display: "flex", flexWrap: "wrap", gap: SPACE.sm }}>
          <Button
            data-testid="tz-export-svg"
            disabled={!ergebnis.ok}
            onClick={() => lade(new Blob([svg], { type: "image/svg+xml" }), "zeichen.svg")}
          >
            SVG herunterladen
          </Button>
          <Button data-testid="tz-export-png" disabled={!ergebnis.ok} onClick={exportierePng}>
            PNG herunterladen
          </Button>
          <Button
            data-testid="tz-export-json"
            onClick={() =>
              lade(
                new Blob([JSON.stringify(spec, null, 2)], { type: "application/json" }),
                "zeichen.json",
              )
            }
          >
            Zusammenstellung als Datei
          </Button>
          <label style={{ display: "inline-flex", alignItems: "center", minHeight: 44 }}>
            <input
              type="checkbox"
              checked={weisserGrund}
              onChange={(e) => setWeisserGrund(e.target.checked)}
            />
            Weißer Hintergrund im PNG
          </label>
        </div>
        {exportFehler && <p className={css.hinweis}>{exportFehler}</p>}
      </Card>

      <Card style={{ marginBlockEnd: SPACE.lg }} title="Übungsaufgabe">
        <p style={{ ...SCHRIFT.neben, margin: 0 }}>
          Ein Zeichen aus dem Katalog, nur mit seiner Bedeutung. Bau es nach und prüfe es. Das
          zählt nicht zum Lernstand.
        </p>
        <Button data-testid="tz-uebung-start" onClick={starteUebung}>
          Übungsaufgabe ziehen
        </Button>
        {aufgabe && (
          <>
            <p data-testid="tz-uebung-aufgabe">{aufgabe.bedeutung}</p>
            <Button
              data-testid="tz-uebung-pruefen"
              onClick={() => setUrteil(felddifferenz(spec, aufgabe.spec, bezeichnung).satz)}
            >
              Prüfen
            </Button>
          </>
        )}
        {urteil && (
          <>
            <p data-testid="tz-uebung-urteil">{urteil}</p>
            {/* Erst NACH dem Pruefen — vorher waere die Aufgabe geschenkt. */}
            <div
              data-testid="tz-uebung-loesung"
              className={css.blatt}
              dangerouslySetInnerHTML={{ __html: aufgabe?.svg ?? "" }}
            />
          </>
        )}
      </Card>

      <AchsenFelder
        spec={spec}
        befunde={befunde}
        miniaturen={miniaturen}
        setzeFeld={setzeFeld}
        setzeFelder={setzeFelder}
        setzeZone={setzeZone}
        hinweise={hinweise}
      />

      <Card title="Zeichen speichern">
        <SpeichernFormular specJson={JSON.stringify(spec)} svg={svg} bereit={ergebnis.ok} />
      </Card>
    </div>
  );
}
```

- [ ] **Schritt 29: Test laufen lassen und grün sehen**

Kommando: `pnpm vitest run src/app/m/zeichen/_ui/baukasten/BaukastenInsel.test.tsx`
Erwartet: PASS, 8 Fälle.

- [ ] **Schritt 30: Die beiden Seiten anlegen**

`src/app/m/zeichen/(shell)/baukasten/page.tsx`:

```tsx
import { Alert, Card } from "antd";
import { Seitenkopf } from "@/core/shell/Seitenkopf";
import { BaukastenLader } from "../../_ui/baukasten/BaukastenLader";

/*
 * DIE RSC-HUELLE. Sie fasst den Katalog NICHT an: `BaukastenLader` ist eine
 * Client-Komponente, und eine KOMPONENTE ueber die RSC-Grenze zu reichen ist die
 * gewoehnliche Naht — Falle 6 betrifft WERTE aus "use client"-Modulen, nicht
 * Komponenten.
 *
 * ⛔ Kein `Typography.Title`, kein `Descriptions.Item` (Falle 1): natives `<h1>`
 * kommt aus `Seitenkopf`. Kein `@ant-design/icons` (Falle 7).
 */
export default function BaukastenSeite() {
  return (
    <>
      <Seitenkopf
        titel="Baukasten"
        beschreibung="Ein Zeichen zusammenstellen, herunterladen und speichern."
      />
      {/* `type="warning"`, nie `type="error"` — Falle 3. */}
      <Alert
        type="warning"
        showIcon
        message={
          "Die Bedeutungen folgen einem Entwurf, dessen fachliche Prüfung noch läuft. " +
          "Für eine verbindliche Auskunft gilt die Dienstvorschrift deiner Organisation."
        }
      />
      <Card>
        <BaukastenLader />
      </Card>
    </>
  );
}
```

`src/app/m/zeichen/(shell)/meine/page.tsx`:

```tsx
import Link from "next/link";
import { notFound } from "next/navigation";
import { Card } from "antd";
import { auth } from "@/core/auth";
import { Seitenkopf } from "@/core/shell/Seitenkopf";
import { SCHRIFT } from "@/core/theme/schrift";
import { SPACE } from "@/core/theme/tokens";
import { getDb } from "../../_db/client";
import { eigeneZeichenVon } from "../../_db/eigeneZeichen";
import { KATALOG_STAND } from "../../_lib/katalog";

export const dynamic = "force-dynamic";

/*
 * MEINE ZEICHEN — eine reine Server Component.
 *
 * ⛔ DAS GESPEICHERTE SVG WIRD ALS `<img src="data:image/svg+xml;base64,…">`
 * GERENDERT, NIEMALS MIT `dangerouslySetInnerHTML`. Es ist vom Client geliefertes
 * Markup, das die Server Action fachlich nicht nachpruefen kann (§6.6) — der
 * Vertrag im Repo lautet an beiden Praezedenzstellen, dass nur SERVERSEITIG
 * erzeugtes Markup so eingesetzt wird. In einem `<img>` fuehrt ein SVG kein Script
 * aus und laedt nichts nach. Die Formpruefung beim Speichern ist Hygiene; der
 * Riegel ist dieses `<img>`. Die Katalog-Detailseite rendert weiter mit
 * `dangerouslySetInnerHTML`, weil ihr SVG aus dem eingecheckten Generat stammt.
 *
 * ⛔ `session.user.id` IST der Pocket-ID-`sub`, aber der Typ luegt: @auth/core baut
 * `user` ohne `id`. Deshalb die ausdrueckliche Pruefung — TypeScript sieht das
 * nicht. Auf einer Seite ist der richtige Ausgang `notFound()`.
 */
export default async function MeineSeite() {
  const sub = (await auth())?.user?.id;
  if (!sub) notFound();

  const meine = eigeneZeichenVon(getDb(), sub);

  return (
    <>
      <Seitenkopf
        titel="Meine Zeichen"
        beschreibung={`${meine.length} gespeichert. Bearbeiten öffnet sie im Baukasten.`}
      />
      {meine.length === 0 ? (
        <Card>
          <p>
            Hier stehen die Zeichen, die du im Baukasten speicherst. Noch ist nichts dabei.
          </p>
          <Link href="/m/zeichen/baukasten">Zum Baukasten</Link>
        </Card>
      ) : (
        <div style={{ display: "flex", flexWrap: "wrap", gap: SPACE.md }}>
          {meine.map((z) => (
            <Card key={z.id} style={{ width: 240 }}>
              <img
                src={`data:image/svg+xml;base64,${Buffer.from(z.svg, "utf8").toString("base64")}`}
                alt={z.name}
                width={160}
                height={160}
              />
              <h2 style={{ ...SCHRIFT.unterTitel, margin: 0 }}>{z.name}</h2>
              {/*
                Ein eigenes Zeichen bleibt IMMER sichtbar — das Bild ueberlebt jede
                Katalogaenderung (Spec §4.6, Stufe 2). Nur das Bearbeiten kann
                fehlschlagen, deshalb steht der Stand dabei, gegen den es einmal
                gueltig war.
              */}
              <p style={{ ...SCHRIFT.neben, margin: 0 }}>
                Gespeichert mit Paket {z.paketVersion}, Daten {z.datenVersion}
                {z.paketVersion === KATALOG_STAND.paket ? "" : " — heute gilt ein neuerer Stand"}
              </p>
              <Link
                href={`/m/zeichen/baukasten?s=${Buffer.from(z.specJson, "utf8").toString("base64url")}`}
              >
                Im Baukasten öffnen
              </Link>
            </Card>
          ))}
        </div>
      )}
    </>
  );
}
```

> **`Buffer.from(...).toString("base64url")` ist byteweise dasselbe wie `kodiereSpec` im Browser** —
> `zustand.test.ts` hält beide Wege gegeneinander. Der Browser kennt kein `Buffer`, der Server kein
> `btoa` über UTF-8; zwei Wege, ein Ergebnis, und ein Test, der es festhält.

- [ ] **Schritt 31: Die Release-Notiz schreiben und eintragen**

`src/app/m/portal/_lib/neuigkeiten/notizen/zeichen/2026-09-02-eigene-zeichen-bauen.ts`:

```ts
// Stilregeln für Notizen: CLAUDE.md, Abschnitt „Release Notes".
// `datum` ist der Tag des ROLLOUTS. Wird er verschoben, wandern Dateiname UND Feld
// gemeinsam — `register.test.ts` hält beides zusammen.
import { absatz, type Releasenotiz } from "@/app/m/portal/_lib/neuigkeiten/typen";

const notiz: Releasenotiz = {
  modul: "zeichen",
  slug: "eigene-zeichen-bauen",
  datum: "2026-09-02",
  titel: "Eigene Zeichen zusammenstellen und herunterladen",
  inhalt: [
    absatz(
      "Unter „Baukasten“ stellst du jetzt ein taktisches Zeichen selbst zusammen: Grundzeichenart, " +
        "Zugehörigkeit, Kopfzone, Funktion, Körperform, Fähigkeit, Körpermarken und Beschriftung. " +
        "Die Vorschau zeichnet bei jeder Auswahl mit.",
    ),
    absatz(
      "Was in einer Zusammenstellung nicht vorkommt, lässt sich gar nicht erst auswählen — es steht " +
        "grau in der Liste, und daneben steht, warum. Eine Stärke gibt es zum Beispiel nur an " +
        "Formationen und Personen, und über dem Körper ist nur für eines von dreien Platz.",
    ),
    absatz(
      "Fertige Zeichen lädst du als SVG oder als PNG herunter, oder du speicherst sie unter „Meine " +
        "Zeichen“. Speicherst du zweimal denselben Namen, fragt die App nach, statt zu " +
        "überschreiben. Hast du dieselbe Zusammenstellung schon einmal gesichert, sagt sie dir, " +
        "unter welchem Namen.",
    ),
    absatz(
      "Zum Üben gibt es im Baukasten den Knopf „Übungsaufgabe ziehen“: du bekommst die Bedeutung " +
        "eines Zeichens und baust es nach. Beim Prüfen steht da, was schon stimmt und was noch " +
        "fehlt. Diese Übung zählt nicht zum Lernstand — der Katalog und deine Merkliste bleiben " +
        "unverändert.",
    ),
  ],
};

export default notiz;
```

In `src/app/m/portal/_lib/neuigkeiten/register.ts` — **zwei** Stellen, sonst ist die Notiz nicht
eingetragen und `register.test.ts` wird rot (er liest das Verzeichnis mit `fs` und vergleicht):

```ts
import eigeneZeichenBauen from "@/app/m/portal/_lib/neuigkeiten/notizen/zeichen/2026-09-02-eigene-zeichen-bauen";
```

und in der Liste `NOTIZEN`, nach den `uav`-Einträgen:

```ts
  eigeneZeichenBauen,
```

- [ ] **Schritt 32: Alle Tore laufen lassen**

Kommando:
`pnpm typecheck && pnpm lint && pnpm vitest run && pnpm build`

Erwartet: alle vier grün. Drei davon verdienen einen Blick:

- **`pnpm build` ist in dieser Aufgabe das tragende Tor.** Hier wird der Katalog-Code zum ersten Mal
  wirklich benutzt. Bricht der Build mit
  `TypeError: The "path" argument must be of type string or an instance of URL … ERR_INVALID_ARG_TYPE`,
  hat ein Import den `ssr: false`-Weg verlassen — `_lib/naht.test.ts` nennt die Datei.
- **`pnpm typecheck` läuft mit `--pretty false`**, und das ist kein Geschmack: RTKs tsc-Filter meldet
  „No errors found", wenn tsc seine pretty-Form ausgibt. Wer das Tor außerhalb dieser Umgebung fährt,
  prüft den **Exit-Code**, nicht die Meldung.
- **`pnpm vitest run`** enthält `register.test.ts` (die Notiz) und `naht.test.ts` (weiterhin genau
  zwei erlaubte Katalogimporteure — `paket.ts` ist einer davon und darf beliebig viel
  re-exportieren).

- [ ] **Schritt 33: Handlauf — ein echter Abruf gegen `next dev`**

Keines der vier Tore sieht einen RSC-Bruch: `pnpm build` prüft Modulgrenzen statisch, nicht die
tatsächliche Serialisierung eines Requests, und ein `mount()` in jsdom ist ein einziger JS-Prozess
**ohne RSC-Grenze überhaupt**.

```bash
pnpm dev
```

Dann im Browser, angemeldet über den Dev-Login:

1. `http://zeichen.localtest.me:3000/baukasten` — die Seite lädt, die Insel erscheint nach einem
   kurzen Moment (`ssr: false` heißt: erst nach dem JS).
2. Eine Grundzeichenart wählen → Vorschau erscheint; ein Zeichen mit Beschriftung („MLW IV Lbw" in
   die Zone „Unten links") → **greift Arimo?** Läuft der Text aus seiner Box, steht die Schrift
   nicht (H2 aus Spec §9; jsdom rechnet keine Glyphen, das sieht nur ein Browser).
3. PNG herunterladen, Datei öffnen: weißer Hintergrund, Schrift wie in der Vorschau. **Zweimal
   exportieren** — beide Bilder müssen gleich aussehen (Fallstrick b, `document.fonts.load`).
4. Ein Zeichen speichern, dann `http://zeichen.localtest.me:3000/meine` — das Bild erscheint, und im
   Seitenquelltext steht `<img src="data:image/svg+xml;base64,` und **kein** eingebettetes `<svg>`.
5. Denselben Namen ein zweites Mal speichern → die Rückfrage erscheint, **nichts** wurde vorher
   geschrieben.
6. Im Terminal von `next dev`: keine `500`, kein `Functions cannot be passed directly to Client
   Components`, kein `(0, _react.createContext) is not a function`.

- [ ] **Schritt 34: Commit**

```bash
git add package.json pnpm-lock.yaml \
        src/app/m/zeichen/_ui/baukasten/ \
        src/app/m/zeichen/_lib/regeltexte.ts src/app/m/zeichen/_lib/regeltexte.test.ts \
        src/app/m/zeichen/_lib/pruefung.ts src/app/m/zeichen/_lib/pruefung.test.ts \
        src/app/m/zeichen/_lib/bezeichnungen.ts \
        src/app/m/zeichen/_db/eigeneZeichen.ts src/app/m/zeichen/_db/eigeneZeichen.test.ts \
        src/app/m/zeichen/actions.ts \
        "src/app/m/zeichen/(shell)/baukasten" "src/app/m/zeichen/(shell)/meine" \
        src/app/m/portal/_lib/neuigkeiten/notizen/zeichen/ \
        src/app/m/portal/_lib/neuigkeiten/register.ts
git commit -m "feat(zeichen): Baukasten mit Wertesperrung, Export und eigenen Zeichen

Neun Achsen in der von den Daten erzwungenen Reihenfolge, Live-Vorschau,
Wertesperrung, drei Ausgabewege, eine Bauuebung und gespeicherte eigene
Zeichen unter /meine.

DER BAUKASTEN SPERRT, STATT ZU MECKERN. Von 225.720 aufgezaehlten
Kombinationen der fuenf Hauptachsen tragen gemessen 894 — 0,4 %. Sechs
unabhaengige Auswahlfelder produzierten in 99,6 % der Faelle Unsinn.
erlaubteWerte probiert jeden Kandidaten einmal durch die Komposition
(gemessen 9,7 ms kalt / 3,4 ms warm fuer 247 Kandidaten) und unterscheidet
die zwei Sperrarten aus NotMeasuredError.scope: \"value\" ist ueberall
unmoeglich und bleibt ausgegraut, alles andere passt nur hier nicht.

Geprobt wird gegen die Spec OHNE ihre freien Texte. Sonst laesst eine
einzige zu lange Beschriftung jeden Probelauf mit label-too-wide
scheitern, und die Oberflaeche behauptete, nichts passe mehr zusammen.

validateSpec wird NICHT benutzt: gemessen hat es falsch-negative Befunde
(unbekannte IDs und Vermessungsluecken passieren es) und falsch-positive
(ohne ValidationContext lehnt es alle 25 Funktionsrollen ab). Zwei
Pruefwege, die sich widersprechen, sind unwartbar.

regeltexte.ts fuehrt 15 Erklaerungen statt der 78 aus packages/website —
sie waeren 78 Texte, die niemand gegen ein Upgrade prueft. Der Test geht
in die Gegenrichtung: jede eigene ID muss in VALIDATION_RULE_IDS (72) oder
in der Liste der sechs assertTextRunsFit-IDs stehen; compose() kann
gemessen 78 werfen, nicht 72.

/meine rendert das gespeicherte SVG als img mit data:-URL, NICHT mit
dangerouslySetInnerHTML: es ist vom Client geliefertes Markup, das die
Server Action fachlich nicht nachpruefen kann. Eine fachliche Pruefung
braeuchte composeFromCatalog und zoege den Katalog in den Server-Graph —
dann braeche pnpm build (ERR_INVALID_ARG_TYPE, Phase Collecting page
data). Die Formpruefung beim Speichern ist Hygiene, der Riegel ist das img.

Beide Konfliktfaelle fragen zurueck, statt zu entscheiden: gleicher Name
ueberschreibt nur nach Bestaetigung, gleiche Zusammenstellung wird nur
nach Bestaetigung ein zweites Mal gesichert. Deshalb traegt spec_kanon
keinen uniqueIndex.

@einsatzzeichen/schema kommt als direkte Abhaengigkeit dazu: ohne .npmrc
arbeitet pnpm mit isoliertem node_modules, ein transitives Paket ist aus
src/ nicht aufloesbar — das repariert zugleich den Typimport aus dem
Katalog-Commit. Der Wertimport steht ausschliesslich in paket.ts,
naht.test.ts bleibt bei genau zwei Ausnahmen.

Release-Notiz: eigene-zeichen-bauen."
```


---

**Weiter in Teil 4** (`2026-09-02-modul-taktische-zeichen-teil4.md`): Aufgabe 8 (Lernen),
Aufgabe 9 (Offline), Aufgabe 10 (e2e, PWA-Lauf, Handläufe).
