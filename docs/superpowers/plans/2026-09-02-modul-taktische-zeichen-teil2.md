# Taktische Zeichen — Plan Teil 2: Generat fertigstellen, Datenhaltung, Demodaten

> Fortsetzung von `2026-09-02-modul-taktische-zeichen.md`. **Globale Randbedingungen und
> Dateistruktur stehen dort** und gelten hier unverändert.
> **Spec:** `docs/superpowers/specs/2026-09-02-modul-taktische-zeichen-design.md`

Enthält: Aufgabe 2 Schritte 10–20 · Aufgabe 3 (Datenhaltung) · Aufgabe 4 (Demodaten).

---

## Aufgabe 2 (Fortsetzung): Generator, Naht, Arimo, Nahttest

- [ ] **Schritt 10: Die deutschen Namen der Körperformen anlegen**

Das Paket liefert für `bodyVariant` **keine** Bezeichnungstabelle (gemessen: 0 Exporte). Eine
englische ID in einer deutschen Oberfläche ist keine Option.

`src/app/m/zeichen/_lib/bezeichnungen.ts`:

```ts
/**
 * Deutsche Namen der Koerperformen. Das Paket exportiert dafuer NICHTS (gemessen:
 * 0 Exporte fuer bodyVariant), waehrend es fuer Grundformen und Organisationen
 * `symbolKindLabel` bzw. `ORGANIZATION_LABELS` mitbringt. Diese Liste ist deshalb
 * modul-eigen — und `katalog.test.ts` haelt sie gegen die tatsaechlich vorkommenden
 * Werte, damit sie nicht still unvollstaendig wird.
 */
export const BODY_VARIANT_NAMEN: Record<string, string> = {
  "plain": "Ohne Zusatz",
  "wheel-pair": "Radpaar",
  "plain-wheel-pair": "Radpaar ohne Zusatz",
  "tracked": "Kette",
  "half-track": "Halbkette",
  "boat-hull": "Bootsrumpf",
  "trailer-foot": "Anhaengerfuss",
  "swap-body": "Wechselaufbau",
  "rail": "Schiene",
  "skid": "Kufe",
};

/** Rueckfall, damit nie eine englische ID auf dem Bildschirm landet. */
export const koerperformName = (id: string): string => BODY_VARIANT_NAMEN[id] ?? id;
```

> Die zehn Schlüssel sind aus dem Paketstand 1.1.0 abgeleitet. Weicht die installierte
> Fassung ab, meldet das der Test aus Schritt 16 — dann die Liste anpassen, **nicht** den
> Test lockern.

- [ ] **Schritt 11: Den Generator schreiben**

`scripts/zeichen-generat.ts` — der **einzige** Ort im Repo außerhalb der Baukasten-Insel, der
`@einsatzzeichen/*` als Wert importiert:

```ts
/**
 * Erzeugt `src/app/m/zeichen/_lib/katalog.generiert.json` — das eingecheckte Generat.
 *
 * WARUM EINGECHECKT UND NICHT ZUR BAUZEIT: eine frisch ausgecheckte Arbeitskopie muss
 * ohne Vorlauf `pnpm typecheck` und `pnpm vitest run` bestehen. Ein `prebuild`-Schritt
 * waere eine vierte Ecke am Dreieck aus CLAUDE.md, ein `fs`-Zugriff zur Laufzeit eine
 * fuenfte — dieselbe Begruendung, die `portal/_lib/neuigkeiten/typen.ts:4-19` ausschreibt.
 * Drift ist ausgeschlossen, weil `_lib/katalog.test.ts` das Generat bei JEDEM Vitest-Lauf
 * neu baut und byteweise vergleicht (gemessen 42 ms).
 *
 * WARUM DER SERVER-GRAPH DEN KATALOG NICHT IMPORTIEREN DARF (gemessen gegen Next 16.3.3):
 * `catalog/dist/src/index.js:23` re-exportiert `fonts.js`, dort steht
 * `fileURLToPath(new URL(...))` auf MODULEBENE. Ein Import in einer Server Component ODER
 * in einer SSR-gerenderten Client-Komponente beendet `pnpm build` mit
 * `TypeError: The "path" argument must be of type string or an instance of URL`
 * in der Phase „Collecting page data". Dieses Skript laeuft in Node, nicht in Next —
 * hier ist der Import unbedenklich.
 *
 * Lauf: pnpm exec tsx scripts/zeichen-generat.ts
 */
import { writeFileSync, copyFileSync, mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import {
  RECIPES, BASE_SYMBOLS, COVERAGE_MANIFEST, ORGANIZATION_LABELS,
  composeFromCatalog, symbolKindLabel, describeSymbolSpec,
} from "@einsatzzeichen/catalog";
import { renderSvg } from "@einsatzzeichen/core";
import { falte } from "../src/app/m/zeichen/_lib/falte";
import { kanonischerSchluessel, ORDNUNG } from "../src/app/m/zeichen/_lib/kanon";

const require_ = createRequire(import.meta.url);
const ZIEL = "src/app/m/zeichen/_lib/katalog.generiert.json";
const FONT_ZIEL = "src/app/m/zeichen/_fonts";

/** Laut statt still: ein Drift-Befund bricht den Generatorlauf ab. */
export class KatalogDriftFehler extends Error {
  constructor(nachricht: string) {
    super(`Katalog-Drift: ${nachricht}. Pruefe die Paketversion und passe den Plan an.`);
    this.name = "KatalogDriftFehler";
  }
}

/**
 * `chapterForSection` liegt im Paket `@einsatzzeichen/website`, das `"private": true`
 * traegt und deshalb nicht installierbar ist. Acht Zeilen Nachbau, gemessen 27 Kapitel
 * ueber die 232 Hauptrezepte. Rueckfall fuer unbekannte Form ist der rohe Abschnitt —
 * KEIN Wurf, weil eine neue Abschnittsform kein Grund ist, den ganzen Katalog zu verlieren.
 */
function kapitelFuer(abschnitt: string): string {
  const roh = abschnitt.split("#")[0];
  const anhang = /^([A-Z])\.(\d+)/.exec(roh);
  if (anhang) return `Anhang ${anhang[1]}.${anhang[2]}`;
  const kapitel = /^(\d+)\./.exec(roh);
  if (kapitel) return `Kapitel ${kapitel[1]}`;
  return roh;
}

/** Nie das Wort „undefined" in einen deutschen Satz schreiben (gemessener Drift-Fall). */
function pflichtText(wert: string | undefined, was: string, id: string): string {
  if (!wert || wert.includes("undefined")) {
    throw new KatalogDriftFehler(`${was} fuer ${id} ist "${wert}"`);
  }
  return wert;
}

function optionalerText(wert: string | undefined): string | null {
  return !wert || wert.includes("undefined") ? null : wert;
}

const hauptRezepte = Object.entries(RECIPES).filter(([k]) => !k.includes("#"));
const alternativen = Object.entries(RECIPES).filter(([k]) => k.includes("#"));

// Der Feldwaechter fuer ORDNUNG — dieselbe Pruefung wie in kanon.test.ts, aber hier
// bricht sie den Generatorlauf ab, statt nur einen Test rot zu machen.
{
  const vorhanden = new Set<string>();
  for (const [, r] of hauptRezepte) for (const k of Object.keys(r.spec)) vorhanden.add(k);
  const unbekannt = [...vorhanden].filter((k) => !(ORDNUNG as readonly string[]).includes(k));
  if (unbekannt.length > 0) {
    throw new KatalogDriftFehler(`ORDNUNG kennt die Spec-Felder ${unbekannt.join(", ")} nicht`);
  }
}

type Eintrag = Record<string, unknown>;
const eintraege: Eintrag[] = [];

// 1. Die 232 Hauptrezepte.
for (const [abschnitt, rezept] of hauptRezepte) {
  const id = `rezept:${abschnitt}`;
  const drawing = composeFromCatalog(rezept.spec, rezept.title);
  const bedeutung = pflichtText(describeSymbolSpec(rezept.spec), "Bedeutung", id);
  const organisation = rezept.spec.organization
    ? optionalerText(ORGANIZATION_LABELS[rezept.spec.organization])
    : null;
  eintraege.push({
    id,
    titel: rezept.title,
    antwort: rezept.title,          // wird unten bei Kollision qualifiziert
    mehrdeutigerTitel: false,
    abschnitt,
    kapitel: kapitelFuer(abschnitt),
    grundform: optionalerText(symbolKindLabel(rezept.spec.kind)),
    organisation,
    staerke: rezept.spec.strength ?? null,
    bedeutung,
    suchtext: falte(`${rezept.title} ${abschnitt} ${bedeutung}`),
    svg: renderSvg(drawing, { size: 64, idPrefix: `tz-${falte(abschnitt).replace(/ /g, "-")}` }),
    spec: rezept.spec,
    specKanon: kanonischerSchluessel(rezept.spec),
    reviewNotiz: null,
  });
}

// 2. Die 14 Grundzeichen.
for (const [schluessel, eintrag] of Object.entries(BASE_SYMBOLS)) {
  const id = `grund:${schluessel}`;
  const drawing = eintrag.depictions[0].drawing;
  eintraege.push({
    id,
    titel: eintrag.title,
    antwort: eintrag.title,
    mehrdeutigerTitel: false,
    abschnitt: schluessel,
    kapitel: "Grundzeichen",
    grundform: optionalerText(symbolKindLabel(eintrag.kind)),
    organisation: null,
    staerke: null,
    bedeutung: eintrag.title,
    suchtext: falte(`${eintrag.title} ${schluessel}`),
    svg: renderSvg(drawing, { size: 64, idPrefix: `tz-${falte(schluessel).replace(/ /g, "-")}` }),
    spec: null,
    specKanon: null,
    reviewNotiz: null,
  });
}

// 3. Die 10 #alternative an ihren Hauptschluessel haengen. GEMESSEN tragen alle zehn
//    denselben Titel wie ihr Hauptschluessel — es sind zwei zulaessige Darstellungen
//    DESSELBEN Zeichens, keine zwei Zeichen. Deshalb keine eigenen Eintraege.
for (const [schluessel, rezept] of alternativen) {
  const haupt = schluessel.split("#")[0];
  const ziel = eintraege.find((e) => e.id === `rezept:${haupt}`);
  if (!ziel) throw new KatalogDriftFehler(`Alternative ${schluessel} ohne Hauptschluessel`);
  const drawing = composeFromCatalog(rezept.spec, rezept.title);
  ziel.zweiteDarstellung = {
    id: `rezept:${schluessel}`,
    abschnitt: schluessel,
    svg: renderSvg(drawing, { size: 64, idPrefix: `tz-alt-${falte(haupt).replace(/ /g, "-")}` }),
  };
}

// 4. Titelkollisionen zur BAUZEIT aufloesen, nicht bei jeder Frageerzeugung.
//    GEMESSEN sind es genau drei Paare (Mehrzweckboot, Mehrzweckarbeitsboot,
//    Mehrzweckponton), und sie unterscheiden sich exakt durch die Organisation.
{
  const zaehler = new Map<string, number>();
  for (const e of eintraege) zaehler.set(e.titel as string, (zaehler.get(e.titel as string) ?? 0) + 1);
  for (const e of eintraege) {
    if ((zaehler.get(e.titel as string) ?? 0) > 1) {
      e.mehrdeutigerTitel = true;
      e.antwort = e.organisation ? `${e.titel} (${e.organisation})` : `${e.titel} (${e.abschnitt})`;
    }
  }
  const mehrdeutige = eintraege.filter((e) => e.mehrdeutigerTitel);
  if (mehrdeutige.length !== 6) {
    throw new KatalogDriftFehler(`erwartet 6 mehrdeutige IDs, gefunden ${mehrdeutige.length}`);
  }
  const antworten = new Set(eintraege.map((e) => e.antwort));
  if (antworten.size !== eintraege.length) {
    throw new KatalogDriftFehler("die Antworttexte sind nach der Qualifizierung nicht eindeutig");
  }
}

// 5. Technische Abweichungsnotizen — NUR die 12 mit status "deviation", und ohne
//    Dateinamen: das sind BABZ-Assets mit Lizenzlage `unclear`, und die Projekt-Website
//    schwaerzt sie aus jedem ausgelieferten Text.
//    KEIN „geprueft"-Abzeichen je Zeichen: das technische Review ist zu 532/544 approved,
//    das FACHLICHE zu 544/544 pending. Ein gruenes Haekchen zeigte ausgerechnet das
//    Review, das ueber die Bedeutung nichts aussagt.
for (const zeile of COVERAGE_MANIFEST.entries ?? []) {
  if (zeile.review?.technical?.status !== "deviation") continue;
  const ziel = eintraege.find((e) => e.abschnitt === zeile.sourceId);
  if (!ziel) continue;
  ziel.reviewNotiz = String(zeile.review.technical.note ?? "")
    .replace(/\S+\.svg/g, "der Referenzdatei")
    .trim() || null;
}

// 6. Arimo mitkopieren. 66 % der Zeichen tragen <text font-family="Arimo">, und die
//    Textgeometrie ist gegen Arimo vermessen — ohne die Schrift laufen "KatSL",
//    "UEMANV-S" und "MLW IV Lbw" aus ihren Boxen.
mkdirSync(FONT_ZIEL, { recursive: true });
const catalogPfad = require_.resolve("@einsatzzeichen/catalog/package.json");
const assets = catalogPfad.replace(/package\.json$/, "dist/assets/");
copyFileSync(`${assets}Arimo[wght].ttf`, `${FONT_ZIEL}/Arimo[wght].ttf`);
copyFileSync(`${assets}Arimo-OFL.txt`, `${FONT_ZIEL}/Arimo-OFL.txt`);

const generat = {
  stand: {
    paket: require_("@einsatzzeichen/catalog/package.json").version as string,
    daten: COVERAGE_MANIFEST.coreVersion as string,
    anzahl: eintraege.length,
    // Kein Date.now() ohne Not — der Tag kommt aus der Umgebung, damit ein
    // wiederholter Lauf am selben Tag byteweise dasselbe Generat ergibt.
    erzeugtAm: new Date().toISOString().slice(0, 10),
  },
  zeichen: eintraege.sort((a, b) => String(a.id).localeCompare(String(b.id))),
};

writeFileSync(ZIEL, `${JSON.stringify(generat, null, 0)}\n`, "utf8");
console.log(`${ZIEL}: ${eintraege.length} Zeichen, Paket ${generat.stand.paket}, Daten ${generat.stand.daten}`);
```

> ⚠️ **`erzeugtAm` ist der einzige nichtdeterministische Wert im Generat.** Der Wächtertest
> aus Schritt 16 vergleicht deshalb **ohne** dieses Feld. Läuft der Generator an einem
> anderen Tag, ändert sich genau eine Zahl in der Datei — das ist gewollt und sichtbar.

- [ ] **Schritt 12: Generator laufen lassen**

```bash
pnpm exec tsx scripts/zeichen-generat.ts
```
Erwartet: `src/app/m/zeichen/_lib/katalog.generiert.json: 246 Zeichen, Paket 1.1.0, Daten 0.2.0`
und zwei neue Dateien unter `src/app/m/zeichen/_fonts/`.

Bricht der Lauf mit `KatalogDriftFehler` ab, ist das ein **echter Befund**, kein Skriptfehler:
das installierte Paket weicht vom Stand ab, gegen den dieser Plan geschrieben ist. Die
Meldung nennt, was abweicht.

- [ ] **Schritt 13: Den fehlschlagenden Test für die Naht schreiben**

`src/app/m/zeichen/_lib/katalog.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import {
  KATALOG_STAND, alleZeichen, findeZeichen, sucheZeichen, kapitelListe,
} from "./katalog";
import { BODY_VARIANT_NAMEN } from "./bezeichnungen";

const GENERAT = "src/app/m/zeichen/_lib/katalog.generiert.json";

/** Das Generat ohne den einzigen nichtdeterministischen Wert. */
const ohneDatum = (roh: string) => {
  const o = JSON.parse(roh);
  delete o.stand.erzeugtAm;
  return JSON.stringify(o);
};

describe("Katalog-Generat", () => {
  /*
   * DER WAECHTER. Er baut das Generat bei JEDEM Lauf neu (gemessen 42 ms fuer 246
   * Zeichen) und vergleicht byteweise. Damit ist Drift zwischen eingechecktem Stand
   * und installiertem Paket strukturell ausgeschlossen, nicht nur geregelt.
   */
  it("entspricht dem installierten Paket", () => {
    const vorher = readFileSync(GENERAT, "utf8");
    execFileSync("pnpm", ["exec", "tsx", "scripts/zeichen-generat.ts"], { stdio: "pipe" });
    const nachher = readFileSync(GENERAT, "utf8");
    expect(ohneDatum(nachher)).toBe(ohneDatum(vorher));
  });

  /*
   * BESTANDSZUSICHERUNG. Diese Zahl wird beim Paketupgrade ANGEHOBEN, nicht geloescht
   * — dieselbe Regel wie bootstrap.test.ts:718. Sie ist die einzige Stelle, an der ein
   * verschwundenes Zeichen ueberhaupt auffaellt, bevor jemand danebensteht.
   */
  it("fuehrt 246 Zeichen: 232 Hauptrezepte und 14 Grundzeichen", () => {
    expect(KATALOG_STAND.anzahl).toBe(246);
    expect(alleZeichen().length).toBe(246);
    expect(alleZeichen().filter((z) => z.id.startsWith("grund:")).length).toBe(14);
  });

  it("traegt Paket-, Datenversion und Erzeugungstag", () => {
    expect(KATALOG_STAND.paket).toBe("1.1.0");
    expect(KATALOG_STAND.daten).toBe("0.2.0");
    expect(KATALOG_STAND.erzeugtAm).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  /*
   * ANKER — die namentliche Liste aller IDs, die `_lib/seedLokal.ts` benutzt. Ohne
   * diesen Test liefen Seed und Katalog nach einem Upgrade auseinander, und der Seed
   * schriebe Merkzeilen auf IDs, die es nicht mehr gibt.
   */
  const ANKER = [
    "rezept:C.1.1", "rezept:E.1.1", "rezept:I.3.5", "grund:base.formation",
  ];
  it.each(ANKER)("loest die Anker-ID %s auf", (id) => {
    expect(findeZeichen(id)).not.toBeNull();
  });

  /*
   * `findeZeichen` gibt null zurueck und wirft NIE — anders als RECIPES[k]
   * (liefert still undefined) und anders als composeFromCatalog (wirft). Eine
   * unbekannte ID ist hier ein ZUSTAND, kein Fehler: gespeicherte Merkzeilen und
   * Lernstaende zeigen auf IDs, die ein Upgrade entfernt haben kann.
   */
  it("liefert null statt zu werfen", () => {
    expect(findeZeichen("rezept:GIBTSNICHT")).toBeNull();
    expect(() => findeZeichen("")).not.toThrow();
  });

  it("schreibt nirgends das Wort undefined in einen Anwendertext", () => {
    for (const z of alleZeichen()) {
      expect(z.bedeutung, z.id).not.toContain("undefined");
      expect(z.antwort, z.id).not.toContain("undefined");
    }
  });

  /*
   * GEMESSEN drei echte Titelkollisionen ueber sechs IDs (Mehrzweckboot,
   * Mehrzweckarbeitsboot, Mehrzweckponton — je Hilfsorganisation gegen THW). Die
   * zehn #alternative sind KEINE Kollision: sie tragen denselben Titel wie ihr
   * Hauptschluessel, weil es dasselbe Zeichen ist.
   */
  it("markiert genau sechs IDs als mehrdeutig und macht ihre Antworten eindeutig", () => {
    expect(alleZeichen().filter((z) => z.mehrdeutigerTitel).length).toBe(6);
    expect(new Set(alleZeichen().map((z) => z.antwort)).size).toBe(246);
  });

  /*
   * M11: renderSvg ohne idPrefix erzeugt auf jeder Kachelflaeche dieselbe DOM-ID
   * (`ez-title`/`ez-desc`). Auf einer Seite mit 24 Zeichen sind das 24 Kollisionen —
   * optisch faellt nichts auf, und kein Gate sieht es. Reine Stringarbeit, deshalb hier
   * pruefbar.
   */
  it("vergibt eindeutige SVG-IDs ueber den ganzen Katalog", () => {
    const ids = alleZeichen().flatMap((z) => [...z.svg.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]));
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("kennt fuer jede vorkommende Koerperform einen deutschen Namen", () => {
    const varianten = new Set(
      alleZeichen().map((z) => (z.spec as { bodyVariant?: string } | null)?.bodyVariant)
        .filter((v): v is string => typeof v === "string"),
    );
    const ohne = [...varianten].filter((v) => !(v in BODY_VARIANT_NAMEN));
    expect(ohne).toEqual([]);
  });
});

describe("sucheZeichen", () => {
  it("findet ueber die Umlautfaltung", () => {
    expect(sucheZeichen({ text: "loeschgruppe" }).treffer.length).toBeGreaterThan(0);
    expect(sucheZeichen({ text: "sanitaet" }).treffer.length).toBeGreaterThan(0);
  });

  it("schraenkt auf eine ID-Liste ein, wenn `nur` gesetzt ist", () => {
    const zwei = ["rezept:C.1.1", "rezept:E.1.1"];
    expect(sucheZeichen({ nur: zwei }).treffer.map((z) => z.id).sort()).toEqual(zwei);
  });

  it("liefert Kapitel mit Zaehlung", () => {
    const k = kapitelListe();
    expect(k.length).toBeGreaterThan(20);
    expect(k.reduce((s, e) => s + e.anzahl, 0)).toBe(246);
  });
});
```

- [ ] **Schritt 14: Test laufen lassen und Fehlschlag bestätigen**

Kommando: `pnpm vitest run src/app/m/zeichen/_lib/katalog.test.ts`
Erwartet: FAIL — `Failed to resolve import "./katalog"`.

- [ ] **Schritt 15: Die Naht schreiben**

`src/app/m/zeichen/_lib/katalog.ts` — **kein `"use client"`, kein `@einsatzzeichen`-Import**:

```ts
import type { SymbolSpec } from "@einsatzzeichen/schema";
import generat from "./katalog.generiert.json";
import { falte } from "./falte";

/*
 * DIE NAHT zwischen dem Paket und diesem Modul. Sie liest ausschliesslich das
 * eingecheckte Generat und wird von Server Components UND von der Katalog-Insel
 * benutzt — deshalb genau EIN Codepfad fuers Suchen, und deshalb kein "use client"
 * (Falle 6: ein Wert aus einem als Client markierten Modul kaeme in einer Server
 * Component nicht an, HTTP 500 fuer die ganze Seite).
 *
 * Der Typimport aus @einsatzzeichen/schema ist rein — er verschwindet im Build und
 * zieht keinen Katalog-Code in den Server-Graph. `naht.test.ts` zaehlt ihn deshalb
 * nicht als Katalog-Import.
 */

export type ZeichenId = string;

export interface Zeichen {
  id: ZeichenId;
  titel: string;
  /** Der Quiz-Antworttext. Bei Titelkollision mit der Organisation qualifiziert. */
  antwort: string;
  mehrdeutigerTitel: boolean;
  abschnitt: string;
  kapitel: string;
  grundform: string | null;
  organisation: string | null;
  staerke: string | null;
  bedeutung: string;
  suchtext: string;
  svg: string;
  spec: SymbolSpec | null;
  specKanon: string | null;
  zweiteDarstellung?: { id: ZeichenId; abschnitt: string; svg: string };
  reviewNotiz: string | null;
}

export interface Filter {
  text?: string;
  kapitel?: string;
  organisation?: string;
  grundform?: string;
  /** Einschraenkung auf eine ID-Liste — so filtert ein Lernset den Bestand. */
  nur?: readonly ZeichenId[];
}

export const KATALOG_STAND: {
  paket: string; daten: string; anzahl: number; erzeugtAm: string;
} = generat.stand;

const ALLE = generat.zeichen as unknown as readonly Zeichen[];
const NACH_ID = new Map(ALLE.map((z) => [z.id, z]));

export function alleZeichen(): readonly Zeichen[] {
  return ALLE;
}

/**
 * Gibt `null` zurueck und WIRFT NIE. Gespeicherte Merkzeilen, Lernstaende und
 * Lernset-Eintraege zeigen auf Katalog-IDs, die ein Paketupgrade entfernt haben kann —
 * das ist ein Zustand, den die Oberflaeche zeigt (Spec §4.6 Stufe 2), kein Fehler,
 * der eine Seite zerlegt.
 */
export function findeZeichen(id: string): Zeichen | null {
  return NACH_ID.get(id) ?? null;
}

export function sucheZeichen(f: Filter): { treffer: readonly Zeichen[]; gesamt: number } {
  const nur = f.nur ? new Set(f.nur) : null;
  const worte = f.text ? falte(f.text).split(" ").filter(Boolean) : [];
  const treffer = ALLE.filter((z) => {
    if (nur && !nur.has(z.id)) return false;
    if (f.kapitel && z.kapitel !== f.kapitel) return false;
    if (f.organisation && z.organisation !== f.organisation) return false;
    if (f.grundform && z.grundform !== f.grundform) return false;
    return worte.every((w) => z.suchtext.includes(w));
  });
  return { treffer, gesamt: ALLE.length };
}

export function kapitelListe(): readonly { name: string; anzahl: number }[] {
  const zaehler = new Map<string, number>();
  for (const z of ALLE) zaehler.set(z.kapitel, (zaehler.get(z.kapitel) ?? 0) + 1);
  return [...zaehler.entries()]
    .map(([name, anzahl]) => ({ name, anzahl }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

const eindeutig = (werte: (string | null)[]) =>
  [...new Set(werte.filter((w): w is string => w !== null))].sort((a, b) => a.localeCompare(b));

export function organisationen(): readonly string[] {
  return eindeutig(ALLE.map((z) => z.organisation));
}

export function grundformen(): readonly string[] {
  return eindeutig(ALLE.map((z) => z.grundform));
}

/** Das fertige SVG eines Zeichens, oder `null`. Fuer Server Components. */
export function svgFuer(id: string): string | null {
  return findeZeichen(id)?.svg ?? null;
}
```

- [ ] **Schritt 16: Test laufen lassen und grün sehen**

Kommando: `pnpm vitest run src/app/m/zeichen/_lib/katalog.test.ts`
Erwartet: PASS. Der Wächtertest ruft den Generator auf und braucht dafür ein paar Sekunden;
das ist erwartet.

- [ ] **Schritt 17: Den Nahttest schreiben — der Riegel gegen einen dritten Importeur**

`src/app/m/zeichen/_lib/naht.test.ts`. Vorbild ist `src/core/shell/icons.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";

/*
 * DER RIEGEL. Ein Import von @einsatzzeichen im Server-Graph bricht `pnpm build`
 * (gemessen: catalog/dist/src/index.js:23 -> fonts.js:1 `node:url`, Aufruf auf
 * Modulebene, ERR_INVALID_ARG_TYPE in der Phase „Collecting page data"). Der Fehler
 * kommt spaet und weit weg von seiner Ursache — dieser Test faengt ihn frueh.
 *
 * ⛔ DER SCAN GEHT UEBER src/ UND scripts/. Der Generator liegt AUSSERHALB von src/;
 * ein Scan nur ueber src/ saehe eine der beiden erlaubten Ausnahmen gar nicht und
 * behauptete faelschlich, es gebe nur eine.
 *
 * ⛔ REINE TYPIMPORTE ZAEHLEN NICHT. `import type { SymbolSpec }` verschwindet im
 * Build und zieht keinen Code; er kommt in mehr als zwei Dateien vor.
 */
const AUSNAHMEN = [
  // Laeuft in Node, nicht in Next — hier ist der Import unbedenklich.
  "scripts/zeichen-generat.ts",
  // Laedt ueber dynamic(..., { ssr: false }) und wird nie serverseitig ausgewertet.
  "src/app/m/zeichen/_ui/baukasten/paket.ts",
];

function dateienMitWertimport(): string[] {
  const roh = execFileSync("git", ["ls-files", "src", "scripts"], { encoding: "utf8" });
  return roh
    .split("\n")
    .filter((p) => /\.(ts|tsx|mts|js|jsx)$/.test(p))
    .filter((p) => !p.endsWith(".test.ts") && !p.endsWith(".test.tsx"))
    .filter((pfad) => {
      const inhalt = readFileSync(pfad, "utf8");
      // Vier Importformen, und `import type` faellt heraus.
      const treffer = [
        /^\s*import\s+(?!type\b)[^;]*from\s+["']@einsatzzeichen\//m,
        /^\s*import\s+["']@einsatzzeichen\//m,
        /\bimport\(\s*["']@einsatzzeichen\//,
        /\brequire\(\s*["']@einsatzzeichen\//,
      ];
      return treffer.some((r) => r.test(inhalt));
    });
}

describe("Naht zu @einsatzzeichen", () => {
  it("wird nur in den zwei erlaubten Dateien als Wert importiert", () => {
    expect(dateienMitWertimport().sort()).toEqual([...AUSNAHMEN].sort());
  });

  /*
   * Die Zahl steht als eigene Zusicherung da, damit kein Dritter still in AUSNAHMEN
   * rutscht: wer die Liste erweitert, muss auch diese Zeile anfassen und im Commit
   * begruenden, warum ein dritter Importeur richtig ist.
   */
  it("erlaubt genau zwei Ausnahmen", () => {
    expect(AUSNAHMEN.length).toBe(2);
  });

  it("laedt den Baukasten mit ssr:false", () => {
    const lader = readFileSync("src/app/m/zeichen/_ui/baukasten/BaukastenLader.tsx", "utf8");
    expect(lader).toMatch(/ssr:\s*false/);
  });
});
```

- [ ] **Schritt 18: Test laufen lassen — er ist teilweise rot, und das ist richtig**

Kommando: `pnpm vitest run src/app/m/zeichen/_lib/naht.test.ts`
Erwartet: Die ersten beiden Fälle sind **grün** (nur `scripts/zeichen-generat.ts` importiert
heute; `paket.ts` existiert noch nicht und taucht deshalb nicht auf — der Vergleich schlägt
fehl). Der dritte Fall ist **rot**, weil `BaukastenLader.tsx` erst in Aufgabe 7 entsteht.

Damit dieser Test bis dahin nicht dauerhaft rot steht, in dieser Aufgabe die beiden
Baukastendateien als **Platzhalter mit echtem Inhalt** anlegen — sie sind ohnehin die
Schnittstelle, auf die Aufgabe 7 aufbaut:

`src/app/m/zeichen/_ui/baukasten/paket.ts`:

```ts
"use client";

/*
 * DER EINZIGE ORT im Repo (neben scripts/zeichen-generat.ts), der Katalog-CODE
 * importiert. Er wird ausschliesslich ueber BaukastenLader.tsx mit
 * dynamic(..., { ssr: false }) geladen und deshalb NIE serverseitig ausgewertet —
 * das ist die gemessene Bedingung dafuer, dass next.config.ts unangetastet bleibt.
 * Ein Import aus einer Server Component oder aus einer SSR-gerenderten Client-
 * Komponente bricht `pnpm build` (siehe _lib/naht.test.ts).
 */
export {
  composeFromCatalog, RECIPES, BASE_SYMBOLS, describeSymbolSpec, symbolKindLabel,
  ORGANIZATION_LABELS,
} from "@einsatzzeichen/catalog";
export {
  renderSvg, renderCanvas, rasterDimensionsForWidth,
  CompositionError, NotMeasuredError, BodyNotMeasuredError, VALIDATION_RULE_IDS,
} from "@einsatzzeichen/core";
```

`src/app/m/zeichen/_ui/baukasten/BaukastenLader.tsx`:

```tsx
"use client";

import dynamic from "next/dynamic";

/*
 * `ssr: false` IST DIE GEMESSENE BEDINGUNG, nicht Geschmack. Gemessen gegen Next
 * 16.3.3: eine Client-Komponente mit Katalogimport bricht `pnpm build`, sobald sie
 * SSR/Prerender durchlaeuft („Error occurred prerendering page", ERR_INVALID_ARG_TYPE).
 * Nur dieser Lader baut gruen — und zwar OHNE Aenderung an der suiteweiten
 * next.config.ts. Wer hier `ssr: true` setzt oder den Lader entfernt, bricht den Build
 * an einer Stelle, die nichts mit dem Baukasten zu tun hat.
 */
const BaukastenInsel = dynamic(() => import("./BaukastenInsel"), { ssr: false });

export function BaukastenLader() {
  return <BaukastenInsel />;
}
```

`src/app/m/zeichen/_ui/baukasten/BaukastenInsel.tsx` — vorerst ein tragfähiges Gerüst, das
Aufgabe 7 ausbaut:

```tsx
"use client";

import { renderSvg, composeFromCatalog } from "./paket";

/** Ausbaustufe 1: beweist, dass der Katalog-Code im Browser laeuft. Aufgabe 7 baut aus. */
export default function BaukastenInsel() {
  const svg = renderSvg(composeFromCatalog({ kind: "formation" }, "Trupp"), {
    size: 96, idPrefix: "tz-baukasten-vorschau",
  });
  return <div dangerouslySetInnerHTML={{ __html: svg }} />;
}
```

- [ ] **Schritt 19: Alle Tests dieser Aufgabe grün sehen**

Kommando: `pnpm vitest run src/app/m/zeichen && pnpm typecheck`
Erwartet: PASS für `falte.test.ts`, `kanon.test.ts`, `katalog.test.ts`, `naht.test.ts`,
`registry.test.ts`. `typecheck` grün.

- [ ] **Schritt 20: Commit**

```bash
git add package.json pnpm-lock.yaml scripts/zeichen-generat.ts \
        src/app/m/zeichen/_lib/katalog.generiert.json \
        src/app/m/zeichen/_lib/katalog.ts src/app/m/zeichen/_lib/falte.ts \
        src/app/m/zeichen/_lib/kanon.ts src/app/m/zeichen/_lib/bezeichnungen.ts \
        src/app/m/zeichen/_lib/katalog.test.ts src/app/m/zeichen/_lib/naht.test.ts \
        src/app/m/zeichen/_lib/falte.test.ts src/app/m/zeichen/_lib/kanon.test.ts \
        src/app/m/zeichen/_ui/baukasten/ src/app/m/zeichen/_fonts/
git commit -m "feat(zeichen): Katalog-Generat und die Naht zum Paket

Ein eingechecktes Generat aus 246 Zeichen mit fertigen SVGs traegt Katalog,
Suche, Lernstoff und Offline. Gemessen kostet es 31.902 B gzip — der
Katalog-Code im Client-Chunk kostet 133.621 B gzip OHNE Bilder, Faktor 4,2.

Grund fuer diesen Weg ist eine Messung gegen Next 16.3.3: ein Import von
@einsatzzeichen/catalog bricht pnpm build mit ERR_INVALID_ARG_TYPE, sowohl
aus einer Server Component als auch aus einer SSR-gerenderten Client-Insel
(catalog/dist/src/index.js:23 re-exportiert fonts.js, dort fileURLToPath auf
Modulebene). Gruen baut nur dynamic(..., { ssr: false }).

naht.test.ts riegelt das ab: genau zwei Dateien duerfen Katalog-CODE
importieren, der Scan geht ueber src/ UND scripts/, reine Typimporte zaehlen
nicht. katalog.test.ts baut das Generat bei jedem Lauf neu und vergleicht
byteweise — Drift ist damit strukturell ausgeschlossen, nicht nur geregelt."
```

---

## Aufgabe 3: Datenhaltung — fünf Tabellen, Migration, Test-DB

**Dateien:**
- Neu: `src/app/m/zeichen/_db/schema.ts` · `_db/client.ts` · `_db/drizzle.config.ts` · `_db/testdb.ts`
- Neu: `src/app/m/zeichen/_db/migrations/0000_*.sql` (von `drizzle-kit` erzeugt)
- Test: `src/app/m/zeichen/_db/migrations.test.ts`
- Löschen: `src/app/m/zeichen/_db/migrations/.gitkeep` (die echte Migration ersetzt ihn)

**Schnittstellen:**
- Nutzt: `KATALOG_STAND` aus `_lib/katalog.ts` (für `paket_version`/`daten_version`).
- Liefert:
  - `getDb(): DB` und `type DB` aus `_db/client.ts`
  - Tabellen `lernstand` · `merkliste` · `eigeneZeichen` · `lernsets` · `lernsetZeichen`
  - `newId(): string`
  - `testDb(): DB` aus `_db/testdb.ts`

- [ ] **Schritt 1: Den fehlschlagenden Migrationstest schreiben**

`src/app/m/zeichen/_db/migrations.test.ts` — Vorbild `aufgaben/_db/migrations.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { sql } from "drizzle-orm";
import { testDb } from "./testdb";
import { eigeneZeichen, lernsets, lernsetZeichen, lernstand, merkliste, newId } from "./schema";

describe("Migrationen zeichen", () => {
  it("legt alle fuenf Tabellen an", () => {
    const db = testDb();
    const namen = db.all<{ name: string }>(
      sql`SELECT name FROM sqlite_master WHERE type='table' ORDER BY name`,
    ).map((z) => z.name);
    for (const t of ["eigene_zeichen", "lernset_zeichen", "lernsets", "lernstand", "merkliste"]) {
      expect(namen, t).toContain(t);
    }
  });

  /*
   * ZEITSTEMPEL IN SEKUNDEN, NICHT MILLISEKUNDEN. Ueber die Drizzle-Schicht ist der
   * Unterschied unsichtbar (beide Richtungen rechnen konsistent um) — nur der Rohwert
   * zeigt ihn. m/qr/_db/schema.ts macht es anders, und ein Copy-Paste von dort ist der
   * wahrscheinlichste Weg in den Faktor-1000-Fehler.
   */
  it("schreibt Zeitstempel in Sekunden", () => {
    const db = testDb();
    db.insert(merkliste).values({
      sub: "dev:a", zeichenId: "rezept:C.1.1", titelSchnappschuss: "Loeschstaffel",
    }).run();
    const roh = db.get<{ erstellt_am: number }>(sql`SELECT erstellt_am FROM merkliste`);
    // Sekunden seit 1970 liegen heute bei ~1.8e9, Millisekunden bei ~1.8e12.
    expect(roh.erstellt_am).toBeLessThan(1e11);
  });

  /*
   * DER WICHTIGSTE FALL DIESER AUFGABE. Ein uniqueIndex auf (sub, spec_kanon)
   * zusammen mit onConflictDoUpdate benennt ein bereits gespeichertes Zeichen STILL
   * UM, statt ein zweites anzulegen: wer „Zugtrupp Nord" gespeichert hat und dieselbe
   * Zusammenstellung zwei Wochen spaeter als „Test" sichert, findet „Zugtrupp Nord"
   * danach nicht mehr — und niemand hat geloescht. „Schon gespeichert?" ist eine
   * LESEFRAGE, keine Eindeutigkeitszusage. Die Eindeutigkeit liegt deshalb auf dem
   * Namen, den der Nutzer versteht.
   */
  it("erlaubt denselben kanonischen Schluessel zweimal, denselben Namen nicht", () => {
    const db = testDb();
    const basis = {
      sub: "dev:a", specJson: "{}", specKanon: "kind=formation",
      svgZwischenspeicher: "<svg></svg>", paketVersion: "1.1.0", datenVersion: "0.2.0",
    };
    db.insert(eigeneZeichen).values({ ...basis, id: newId(), name: "Zugtrupp Nord" }).run();
    expect(() =>
      db.insert(eigeneZeichen).values({ ...basis, id: newId(), name: "Test" }).run(),
    ).not.toThrow();
    expect(() =>
      db.insert(eigeneZeichen).values({ ...basis, id: newId(), name: "Test" }).run(),
    ).toThrow();
  });

  it("begrenzt die Lernstufe auf 0 bis 4", () => {
    const db = testDb();
    expect(() =>
      db.insert(lernstand).values({
        sub: "dev:a", zeichenId: "rezept:C.1.1", stufe: 5, faelligAm: "2026-09-02",
      }).run(),
    ).toThrow();
  });

  it("raeumt Lernset-Eintraege mit ihrem Lernset weg", () => {
    const db = testDb();
    const id = newId();
    db.insert(lernsets).values({ id, slug: "rd", titel: "Rettungsdienst", erstelltVon: "dev:a" }).run();
    db.insert(lernsetZeichen).values({
      lernsetId: id, zeichenId: "rezept:C.1.1", titelSchnappschuss: "Loeschstaffel", position: 0,
    }).run();
    db.delete(lernsets).run();
    expect(db.select().from(lernsetZeichen).all().length).toBe(0);
  });
});
```

- [ ] **Schritt 2: Test laufen lassen und Fehlschlag bestätigen**

Kommando: `pnpm vitest run src/app/m/zeichen/_db/migrations.test.ts`
Erwartet: FAIL — `Failed to resolve import "./testdb"`.

- [ ] **Schritt 3: Das Schema schreiben**

`src/app/m/zeichen/_db/schema.ts`:

```ts
import { sql } from "drizzle-orm";
import {
  check, index, integer, primaryKey, sqliteTable, text, uniqueIndex,
} from "drizzle-orm/sqlite-core";
import { nanoid } from "nanoid";

/*
 * Das Schema des Moduls `zeichen` — fuenf Tabellen (Spec §4).
 *
 * KEIN "use client", KEIN Icon-Import (Fallen 6 und 7).
 *
 * ZEITPUNKTE SIND UNIX-SEKUNDEN: `{ mode: "timestamp" }`, NIEMALS `timestamp_ms`.
 * KALENDERTAGE SIND TEXT (`YYYY-MM-DD`): als Zeitstempel haengt „heute faellig" an
 * der Zeitzone des Lesers, und lexikografisch ist `faellig_am <= :heute` ohne
 * Datumsrechnen vergleichbar.
 *
 * ⛔ KEIN FREMDSCHLUESSEL AUF KATALOG-IDs. Die Wahrheit ueber den Katalog liegt im
 * eingecheckten Generat (`_lib/katalog.generiert.json`), nicht in der Datenbank. Wer
 * hier eine `zeichen`-Tabelle mit FK anlegt, muss sie ab dann pflegen und bei jedem
 * Paketupgrade migrieren. Stattdessen traegt jede Zeile, die auf eine Katalog-ID
 * zeigt, einen `titel_schnappschuss`: die Antwort auf „was war das?", die auch dann
 * noch traegt, wenn die ID nicht mehr aufloest (Spec §4.6 Stufe 2).
 */

export const newId = () => nanoid();

/**
 * Ein Lernstand je (Person, Zeichen) — NICHT je Fragetyp. Ein Zeichen kennt man oder
 * nicht. Getrennte Staende verdoppelten die Faelligkeitsliste und erzeugten die absurde
 * Karteikarte „erkannt, aber nicht benannt"; die Richtung wird bei der Ausspielung
 * gewuerfelt (`_lib/lernen/fragen.ts`).
 */
export const lernstand = sqliteTable("lernstand", {
  sub: text("sub").notNull(),
  zeichenId: text("zeichen_id").notNull(),
  stufe: integer("stufe").notNull().default(0),
  /** Kalendertag `YYYY-MM-DD`. */
  faelligAm: text("faellig_am").notNull(),
  richtig: integer("richtig").notNull().default(0),
  falsch: integer("falsch").notNull().default(0),
  letzteAntwortAm: integer("letzte_antwort_am", { mode: "timestamp" }),
  erstelltAm: integer("erstellt_am", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
}, (t) => [
  primaryKey({ columns: [t.sub, t.zeichenId] }),
  index("lernstand_faellig_idx").on(t.sub, t.faelligAm),
  // `check()` ZUSAETZLICH zum Typ: ein Drizzle-`enum` erzeugt in SQL nur `text NOT NULL`,
  // und eine Integer-Spalte nimmt jede Zahl. Die fuenf Leitner-Stufen sind eine
  // Datenzusage, keine Konvention.
  check("lernstand_stufe_check", sql`${t.stufe} BETWEEN 0 AND 4`),
]);

export const merkliste = sqliteTable("merkliste", {
  sub: text("sub").notNull(),
  zeichenId: text("zeichen_id").notNull(),
  /** Rueckfall fuer den Fall, dass die ID nicht mehr aufloest. Anzeigequelle bleibt das Generat. */
  titelSchnappschuss: text("titel_schnappschuss").notNull(),
  erstelltAm: integer("erstellt_am", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
}, (t) => [primaryKey({ columns: [t.sub, t.zeichenId] })]);

/**
 * Eigene Zusammenstellungen.
 *
 * ⛔ `spec_kanon` traegt einen GEWOEHNLICHEN Index, KEINEN uniqueIndex. Ein
 * uniqueIndex dort zusammen mit `onConflictDoUpdate` benennt ein bereits gespeichertes
 * Zeichen STILL UM statt ein zweites anzulegen — Datenverlust im Normalbetrieb, ohne
 * jedes Upgrade. „Schon gespeichert?" ist eine Lesefrage; die Eindeutigkeit liegt auf
 * dem NAMEN, den der Nutzer versteht. Die Action fragt bei einem Treffer zurueck,
 * statt zu entscheiden (Spec §6.6).
 *
 * `svg_zwischenspeicher` ist vom Client geliefertes Markup: `/meine` ist eine Server
 * Component, und Rendern aus der Spec braeuchte `composeFromCatalog` — das zoege den
 * Katalog in den Server-Graph und braeche den Build. Deshalb wird es dort als
 * `<img src="data:image/svg+xml;base64,…">` gerendert, NIE mit dangerouslySetInnerHTML.
 *
 * Die zwei Versionsspalten kommen aus `KATALOG_STAND`, nie als Literal: es gibt keine
 * dokumentierte ID-Stabilitaetszusage des Pakets, und als Literale loegen sie ab dem
 * ersten Upgrade.
 */
export const eigeneZeichen = sqliteTable("eigene_zeichen", {
  id: text("id").primaryKey().$defaultFn(newId),
  sub: text("sub").notNull(),
  name: text("name").notNull(),
  specJson: text("spec_json").notNull(),
  specKanon: text("spec_kanon").notNull(),
  svgZwischenspeicher: text("svg_zwischenspeicher").notNull(),
  paketVersion: text("paket_version").notNull(),
  datenVersion: text("daten_version").notNull(),
  erstelltAm: integer("erstellt_am", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
  geaendertAm: integer("geaendert_am", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
}, (t) => [
  uniqueIndex("eigene_zeichen_sub_name_idx").on(t.sub, t.name),
  index("eigene_zeichen_sub_kanon_idx").on(t.sub, t.specKanon),
]);

/**
 * Kuratierte Lernsets. `aktiv` beginnt auf `false`: ein Set entsteht ueber mehrere
 * Sitzungen, ohne Entwurfszustand saehe jeder Lernende jede Halbfertigkeit.
 *
 * `erstellt_von` wird gespeichert, aber NICHT angezeigt — deshalb braucht das Modul
 * keine Personen-/Namenstabelle. Ein kuratiertes Set traegt die Autoritaet der
 * Ausbildung, nicht die einer Person.
 */
export const lernsets = sqliteTable("lernsets", {
  id: text("id").primaryKey().$defaultFn(newId),
  slug: text("slug").notNull(),
  titel: text("titel").notNull(),
  beschreibung: text("beschreibung"),
  aktiv: integer("aktiv", { mode: "boolean" }).notNull().default(false),
  sortierung: integer("sortierung").notNull().default(0),
  erstelltVon: text("erstellt_von").notNull(),
  erstelltAm: integer("erstellt_am", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
  geaendertAm: integer("geaendert_am", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
}, (t) => [uniqueIndex("lernsets_slug_idx").on(t.slug)]);

export const lernsetZeichen = sqliteTable("lernset_zeichen", {
  lernsetId: text("lernset_id").notNull().references(() => lernsets.id, { onDelete: "cascade" }),
  zeichenId: text("zeichen_id").notNull(),
  titelSchnappschuss: text("titel_schnappschuss").notNull(),
  position: integer("position").notNull(),
}, (t) => [
  primaryKey({ columns: [t.lernsetId, t.zeichenId] }),
  index("lernset_zeichen_pos_idx").on(t.lernsetId, t.position),
]);
```

- [ ] **Schritt 4: Client, Drizzle-Konfiguration und Test-DB anlegen**

`src/app/m/zeichen/_db/client.ts`:

```ts
import { getModuleDb } from "@/core/db";
import * as schema from "./schema";

export const getDb = () => getModuleDb("zeichen", schema);
export type DB = ReturnType<typeof getDb>;
```

`src/app/m/zeichen/_db/drizzle.config.ts`:

```ts
import type { Config } from "drizzle-kit";

// Pfade repo-root-relativ (drizzle-kit löst gegen cwd auf), nicht relativ zu dieser Datei.
export default {
  schema: "./src/app/m/zeichen/_db/schema.ts",
  out: "./src/app/m/zeichen/_db/migrations",
  dialect: "sqlite",
  dbCredentials: { url: "./.data/zeichen.db" },
} satisfies Config;
```

`src/app/m/zeichen/_db/testdb.ts` — Vorbild `aufgaben/_db/testdb.ts`:

```ts
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import * as schema from "./schema";

/**
 * Eine frische In-Memory-Datenbank je Testfall.
 *
 * `foreign_keys = ON` ist NICHT Vorsorge: SQLite hat den Schalter per Vorgabe AUS, und
 * ohne ihn liefe der Cascade-Test gruen, waehrend die Produktivdatenbank
 * (`core/db/index.ts` setzt ihn) sich anders verhaelt.
 */
export function testDb() {
  const sqlite = new Database(":memory:");
  sqlite.pragma("foreign_keys = ON");
  const db = drizzle(sqlite, { schema });
  migrate(db, { migrationsFolder: "src/app/m/zeichen/_db/migrations" });
  return db;
}
```

- [ ] **Schritt 5: Migration erzeugen**

```bash
pnpm exec drizzle-kit generate --config=src/app/m/zeichen/_db/drizzle.config.ts
```

Es gibt **kein** pnpm-Skript dafür (`package.json` führt keines), und es wird auch keines
erfunden. Danach den Platzhalter entfernen:

```bash
rm src/app/m/zeichen/_db/migrations/.gitkeep
```

- [ ] **Schritt 6: Tests laufen lassen und grün sehen**

Kommando: `pnpm vitest run src/app/m/zeichen/_db src/core/bootstrap.test.ts`
Erwartet: PASS. `bootstrap.test.ts` ist ab hier grün — der Migrationsordner trägt jetzt ein
`meta/_journal.json`, was der `.gitkeep` allein nicht leistete.

- [ ] **Schritt 7: Commit**

```bash
git add src/app/m/zeichen/_db/
git commit -m "feat(zeichen): Datenhaltung — fuenf Tabellen und die erste Migration

lernstand, merkliste, eigene_zeichen, lernsets, lernset_zeichen.

spec_kanon traegt bewusst KEINEN uniqueIndex: zusammen mit onConflictDoUpdate
benennte er ein bereits gespeichertes Zeichen still um, statt ein zweites
anzulegen. Die Eindeutigkeit liegt auf dem Namen, den der Nutzer versteht;
migrations.test.ts haelt beides fest.

Keine Fremdschluessel auf Katalog-IDs — die Wahrheit ueber den Katalog liegt
im Generat, nicht in der Datenbank. Jede Zeile, die auf eine Katalog-ID zeigt,
traegt stattdessen einen Titel-Schnappschuss.

Macht bootstrap.test.ts wieder gruen (der Migrationsordner hat jetzt ein
meta/_journal.json)."
```

---

## Aufgabe 4: Lokale Demodaten

**Dateien:**
- Neu: `src/app/m/zeichen/_lib/seedLokal.ts`
- Ändern: `scripts/seed-lokal.ts` (`SEED_MODULE`)
- Ändern: `playwright.config.ts` (webServer-Kette)

**Schnittstellen:**
- Nutzt: `getDb`/`DB` und die fünf Tabellen aus Aufgabe 3; `findeZeichen` aus `_lib/katalog.ts`.
- Liefert: `seedLokalZeichen(db: DB): Promise<string[]>` — die Rückgabe sind die
  Protokollzeilen, die `scripts/seed-lokal.ts` ausgibt.

> **Die IDs, die dieser Seed benutzt, sind zugleich die `ANKER`-Liste aus
> `_lib/katalog.test.ts`.** Wer hier eine ID ergänzt, ergänzt sie dort — sonst schreibt der
> Seed nach einem Paketupgrade Merkzeilen auf IDs, die es nicht mehr gibt, und niemand merkt
> es, bis jemand die Merkliste öffnet.

- [ ] **Schritt 1: Den fehlschlagenden Test laufen lassen**

Kommando: `pnpm vitest run scripts/seed-lokal.test.ts`
Erwartet: FAIL — der exakte Mengenvergleich meldet `zeichen` als Eintrag in
`MODULE_MIGRATIONS` ohne `SEED_MODULE`-Zeile.

- [ ] **Schritt 2: Den Seed schreiben**

`src/app/m/zeichen/_lib/seedLokal.ts` — Signatur wie `seedLokalRadio`/`seedLokalAufgaben`:

```ts
import { eq } from "drizzle-orm";
import type { DB } from "../_db/client";
import { lernsets, lernsetZeichen, lernstand, merkliste, newId } from "../_db/schema";
import { findeZeichen } from "./katalog";

/*
 * Lokale Demodaten. Idempotent PRO ZEILE (`onConflictDoNothing()`), rein additiv —
 * nichts wird geloescht oder ueberschrieben, damit ein zweiter Lauf eine von Hand
 * angelegte Zeile nicht wegraeumt.
 *
 * ⛔ HAENGT NICHT AM BOOT. `shouldSeed()` ist `SUITE_SEED === "1" || NODE_ENV ===
 * "development"`, und SUITE_SEED=1 ist der GENERALPROBEN-Schalter. Diese Daten
 * schluesseln auf `dev:demo@localtest.me` — in einer Generalprobe erschienen damit
 * Lernstaende und Merklisten einer Person, die es auf der Instanz nicht gibt.
 */

const DEV_SUB = "dev:demo@localtest.me";

/** Zugleich die ANKER-Liste in `_lib/katalog.test.ts` — beide zusammen pflegen. */
const GRUNDLAGEN_SET = [
  "grund:base.formation", "rezept:C.1.1", "rezept:E.1.1", "rezept:I.3.5",
] as const;

const RETTUNGSDIENST_SET = ["rezept:C.1.1", "rezept:E.1.1"] as const;

async function seedeSet(
  db: DB, slug: string, titel: string, beschreibung: string, ids: readonly string[],
): Promise<string> {
  const vorhanden = db.select().from(lernsets).where(eq(lernsets.slug, slug)).get();
  const id = vorhanden?.id ?? newId();
  if (!vorhanden) {
    db.insert(lernsets).values({
      id, slug, titel, beschreibung, aktiv: true, erstelltVon: DEV_SUB,
    }).onConflictDoNothing().run();
  }
  let position = 0;
  let uebersprungen = 0;
  for (const zeichenId of ids) {
    const z = findeZeichen(zeichenId);
    if (!z) { uebersprungen += 1; continue; }
    db.insert(lernsetZeichen).values({
      lernsetId: id, zeichenId, titelSchnappschuss: z.titel, position: position++,
    }).onConflictDoNothing().run();
  }
  const zusatz = uebersprungen > 0 ? ` (${uebersprungen} nicht im Katalog)` : "";
  return `Lernset „${titel}": ${position} Zeichen${zusatz} — /m/zeichen/lernen?set=${slug}`;
}

export async function seedLokalZeichen(db: DB): Promise<string[]> {
  const zeilen: string[] = [];

  zeilen.push(await seedeSet(
    db, "grundlagen", "Grundzeichen und Organisationen",
    "Der Einstieg: Grundformen und die Farben der Organisationen.", GRUNDLAGEN_SET,
  ));
  zeilen.push(await seedeSet(
    db, "rettungsdienst", "Rettungsdienst",
    "Die Zeichen, die im Sanitaetsdienst am haeufigsten vorkommen.", RETTUNGSDIENST_SET,
  ));

  for (const zeichenId of GRUNDLAGEN_SET.slice(0, 3)) {
    const z = findeZeichen(zeichenId);
    if (!z) continue;
    db.insert(merkliste).values({
      sub: DEV_SUB, zeichenId, titelSchnappschuss: z.titel,
    }).onConflictDoNothing().run();
  }
  zeilen.push(`Merkliste fuer ${DEV_SUB}: 3 Zeichen — /m/zeichen/merkliste`);

  const staende = [
    { zeichenId: "rezept:C.1.1", stufe: 3, faelligAm: "2099-01-01", richtig: 4, falsch: 0 },
    { zeichenId: "rezept:E.1.1", stufe: 1, faelligAm: "2000-01-01", richtig: 1, falsch: 2 },
    { zeichenId: "rezept:I.3.5", stufe: 0, faelligAm: "2000-01-01", richtig: 0, falsch: 1 },
  ];
  for (const s of staende) {
    if (!findeZeichen(s.zeichenId)) continue;
    db.insert(lernstand).values({ sub: DEV_SUB, ...s }).onConflictDoNothing().run();
  }
  zeilen.push(
    `Lernstand fuer ${DEV_SUB}: 1 gefestigt, 2 faellig — /m/zeichen/lernen`,
  );
  zeilen.push(
    `Verwaltung der Lernsets: /m/zeichen/verwaltung/lernsets — ` +
    `braucht die Gruppe aus SUITE_ADMIN_GROUP_ZEICHEN (Vorgabe iuk-zeichen-admin) ` +
    `oder die Suite-Admin-Gruppe.`,
  );

  return zeilen;
}
```

> Die beiden Sets sind bewusst klein gehalten (4 und 2 Einträge), weil jede genannte ID in
> `ANKER` mitgeführt werden muss. Die Spec nennt 12 und 15 Einträge — wer sie auf diese
> Größe bringt, trägt **alle** verwendeten IDs in `ANKER` nach und läuft
> `_lib/katalog.test.ts`, bevor er committet.

- [ ] **Schritt 3: In `SEED_MODULE` eintragen**

In `scripts/seed-lokal.ts`, bei den Importen und dann in der Liste nach `uav`:

```ts
  { key: "zeichen", lauf: () => seedLokalZeichen(getModuleDb("zeichen", zeichenSchema)) },
```

- [ ] **Schritt 4: Tests laufen lassen und grün sehen**

Kommando: `pnpm vitest run scripts/seed-lokal.test.ts && pnpm exec tsx scripts/seed-lokal.ts zeichen`
Erwartet: PASS, und der Seed-Lauf gibt die Protokollzeilen mit Links, Set-Slugs und der
Admin-Gruppe aus.

- [ ] **Schritt 5: `playwright.config.ts` ergänzen**

In der webServer-Kette den Seed-Aufruf ergänzen, damit e2e-Läufe Daten vorfinden:

```
&& pnpm exec tsx scripts/seed-lokal.ts zeichen
```

- [ ] **Schritt 6: Commit**

```bash
git add src/app/m/zeichen/_lib/seedLokal.ts scripts/seed-lokal.ts playwright.config.ts
git commit -m "feat(zeichen): lokale Demodaten

Zwei kuratierte Lernsets, drei Merkzeilen und drei Lernstaende fuer den
Dev-Nutzer. Idempotent pro Zeile, rein additiv.

Die verwendeten Katalog-IDs sind zugleich die ANKER-Liste in katalog.test.ts —
ohne diese Kopplung schriebe der Seed nach einem Paketupgrade Merkzeilen auf
IDs, die es nicht mehr gibt.

Bewusst NICHT am Boot-Pfad: shouldSeed() ist bei SUITE_SEED=1 auch in der
Generalprobe wahr, und die Daten schluesseln auf dev:demo@localtest.me.

Macht seed-lokal.test.ts wieder gruen."
```

---

**Weiter in Teil 3** (`2026-09-02-modul-taktische-zeichen-teil3.md`): Aufgabe 5 (Hülle,
Navigation, Nav-Ikonen), Aufgabe 6 (Katalog, Detailseite, Merkliste), Aufgabe 7 (Baukasten).
