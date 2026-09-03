/**
 * Erzeugt `src/app/m/zeichen/_lib/katalog.generiert.json` — das eingecheckte Generat.
 *
 * WARUM EINGECHECKT UND NICHT ZUR BAUZEIT: eine frisch ausgecheckte Arbeitskopie muss
 * ohne Vorlauf `pnpm typecheck` und `pnpm vitest run` bestehen. Ein `prebuild`-Schritt
 * waere eine vierte Ecke am Dreieck aus CLAUDE.md, ein `fs`-Zugriff zur Laufzeit eine
 * fuenfte — dieselbe Begruendung, die `portal/_lib/neuigkeiten/typen.ts:4-19` ausschreibt.
 * Drift ist ausgeschlossen, weil `_lib/katalog.test.ts` das Generat bei JEDEM Vitest-Lauf
 * neu baut und byteweise vergleicht.
 *
 * WARUM DER SERVER-GRAPH DEN KATALOG NICHT IMPORTIEREN DARF (gemessen gegen Next 16.3.3):
 * `catalog/dist/src/index.js:23` re-exportiert `fonts.js`, dort steht
 * `fileURLToPath(new URL(...))` auf MODULEBENE (nachgeprueft am installierten 1.1.0:
 * `fonts.js:14`). Ein Import in einer Server Component ODER in einer SSR-gerenderten
 * Client-Komponente beendet `pnpm build` mit
 * `TypeError: The "path" argument must be of type string or an instance of URL`
 * in der Phase „Collecting page data". Dieses Skript laeuft in Node, nicht in Next —
 * hier ist der Import unbedenklich.
 *
 * Lauf: pnpm exec tsx scripts/zeichen-generat.ts
 */
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";

import {
  BASE_SYMBOLS,
  COVERAGE_MANIFEST,
  ORGANIZATION_LABELS,
  RECIPES,
  composeFromCatalog,
  describeSymbolSpec,
  symbolKindLabel,
} from "@einsatzzeichen/catalog";
import { renderSvg } from "@einsatzzeichen/core";
import type { SymbolSpec } from "@einsatzzeichen/schema";

import { falte } from "../src/app/m/zeichen/_lib/falte";
import { ORDNUNG, kanonischerSchluessel } from "../src/app/m/zeichen/_lib/kanon";

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
 * Das Paketverzeichnis von `@einsatzzeichen/catalog`.
 *
 * ⚠️ NICHT ueber `require.resolve("@einsatzzeichen/catalog/package.json")`: das Paket
 * fuehrt in `exports` NUR den Einstiegspunkt `"."`, und jeder andere Unterpfad — die
 * `package.json` eingeschlossen — endet mit `ERR_PACKAGE_PATH_NOT_EXPORTED`. Gemessen
 * am installierten 1.1.0. Deshalb den Einstiegspunkt aufloesen und von dort aus die
 * Wurzel bilden; passt die erwartete Endung nicht, bricht der Lauf laut ab, statt sich
 * einen falschen Pfad zusammenzureimen.
 */
function paketWurzel(): string {
  const einstieg = require_.resolve("@einsatzzeichen/catalog");
  const wurzel = einstieg.replace(/dist[/\\]src[/\\]index\.js$/, "");
  if (wurzel === einstieg) {
    throw new KatalogDriftFehler(`der Einstiegspunkt liegt unerwartet unter "${einstieg}"`);
  }
  return wurzel;
}

const WURZEL = paketWurzel();
const PAKET_VERSION = (
  JSON.parse(readFileSync(`${WURZEL}package.json`, "utf8")) as { version: string }
).version;

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

/** Aus einem Abschnitt einen SVG-tauglichen, ueber den Katalog eindeutigen Praefix machen. */
const praefix = (roh: string) => falte(roh).replace(/ /g, "-");

// 1. Die 232 Hauptrezepte.
for (const [abschnitt, rezept] of hauptRezepte) {
  const id = `rezept:${abschnitt}`;
  /*
   * ⚠️ Auf `SymbolSpec` verbreitern, bevor irgendein Feld gelesen wird. `RECIPES` ist
   * NICHT als `Record<string, Recipe>` typisiert, sondern als Vereinigung der 242
   * Literaltypen — und in dieser Vereinigung gibt es kein gemeinsames `organization`
   * oder `strength`, weil nicht jedes Rezept sie fuehrt. Ein direkter Zugriff ist
   * deshalb ein Typfehler (TS2339), den `pnpm vitest run` NICHT sieht: esbuild wirft
   * Typen weg, statt sie zu pruefen. Nur `pnpm typecheck` faengt ihn.
   */
  const spec: SymbolSpec = rezept.spec;
  const drawing = composeFromCatalog(spec, rezept.title);
  const bedeutung = pflichtText(describeSymbolSpec(spec), "Bedeutung", id);
  const organisation = spec.organization
    ? optionalerText(ORGANIZATION_LABELS[spec.organization])
    : null;
  eintraege.push({
    id,
    titel: rezept.title,
    antwort: rezept.title, // wird unten bei Kollision qualifiziert
    mehrdeutigerTitel: false,
    abschnitt,
    kapitel: kapitelFuer(abschnitt),
    grundform: optionalerText(symbolKindLabel(spec.kind)),
    organisation,
    staerke: spec.strength ?? null,
    bedeutung,
    suchtext: falte(`${rezept.title} ${abschnitt} ${bedeutung}`),
    svg: renderSvg(drawing, { size: 64, idPrefix: `tz-${praefix(abschnitt)}` }),
    spec,
    specKanon: kanonischerSchluessel(spec),
    reviewNotiz: null,
  });
}

// 2. Die 14 Grundzeichen.
//
//    ⚠️ Der Schluessel ist `eintrag.id` („base.formation"), NICHT der Schluessel des
//    Registers („formation"). Gemessen tragen die vierzehn CatalogEntry-Objekte beide
//    Formen; die Anker-IDs, auf die spaetere Aufgaben und `_lib/seedLokal.ts` zeigen,
//    lauten `grund:base.formation`. Wer hier den Registerschluessel nimmt, erzeugt
//    `grund:formation` und laesst jede gespeicherte Merkzeile ins Leere zeigen.
for (const eintrag of Object.values(BASE_SYMBOLS)) {
  const schluessel = eintrag.id;
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
    svg: renderSvg(drawing, { size: 64, idPrefix: `tz-${praefix(schluessel)}` }),
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
    svg: renderSvg(drawing, { size: 64, idPrefix: `tz-alt-${praefix(haupt)}` }),
  };
}

// 4. Titelkollisionen zur BAUZEIT aufloesen, nicht bei jeder Frageerzeugung.
//    GEMESSEN sind es genau drei Paare (Mehrzweckboot, Mehrzweckarbeitsboot,
//    Mehrzweckponton), und sie unterscheiden sich exakt durch die Organisation.
{
  const zaehler = new Map<string, number>();
  for (const e of eintraege) {
    zaehler.set(e.titel as string, (zaehler.get(e.titel as string) ?? 0) + 1);
  }
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
{
  /*
   * ⚠️ `sourceId` traegt einen Quellenpraefix: gemessen lautet er durchgaengig
   * `bbk-babz-2025:` (einziger Praefix ueber alle 544 Zeilen), der Abschnitt steht
   * dahinter. Ein direkter Vergleich mit `abschnitt` trifft deshalb NULL Zeilen — und
   * zwar still, weil eine nicht zugeordnete Notiz einfach fehlt. Genau dagegen steht
   * die Zaehlpruefung unten.
   */
  const abschnittVon = (sourceId: string) => sourceId.slice(sourceId.indexOf(":") + 1);

  /*
   * ⚠️ Die Dateinamen tragen LEERZEICHEN („F.1.1_Medizinische Task Force.svg"). Ein
   * Muster auf `\S+\.svg` schwaerzte davon nur „Force.svg" und liesse den Rest des
   * Namens im ausgelieferten Text stehen — die Schwaerzung waere da und wirkte nicht.
   * Deshalb bis zur naechsten Anfuehrung greifen: im Bestand stehen die Namen
   * durchgaengig in Backticks oder deutschen Anfuehrungszeichen.
   */
  const DATEINAME = /[^\s`„"]+(?: [^\s`„"]+)*\.svg/g;

  let notizen = 0;
  for (const zeile of COVERAGE_MANIFEST.entries ?? []) {
    if (zeile.review?.technical?.status !== "deviation") continue;
    const ziel = eintraege.find((e) => e.abschnitt === abschnittVon(zeile.sourceId));
    if (!ziel) {
      throw new KatalogDriftFehler(
        `die Abweichungsnotiz zu ${zeile.sourceId} findet kein Zeichen`,
      );
    }
    ziel.reviewNotiz =
      String(zeile.review.technical.note ?? "")
        .replace(DATEINAME, "der Referenzdatei")
        .trim() || null;
    notizen += 1;
  }
  if (notizen !== 12) {
    throw new KatalogDriftFehler(`erwartet 12 Abweichungsnotizen, zugeordnet ${notizen}`);
  }
}

// 6. Arimo mitkopieren. 66 % der Zeichen tragen <text font-family="Arimo">, und die
//    Textgeometrie ist gegen Arimo vermessen — ohne die Schrift laufen "KatSL",
//    "UEMANV-S" und "MLW IV Lbw" aus ihren Boxen.
mkdirSync(FONT_ZIEL, { recursive: true });
const assets = `${WURZEL}dist/assets/`;
copyFileSync(`${assets}Arimo[wght].ttf`, `${FONT_ZIEL}/Arimo[wght].ttf`);
copyFileSync(`${assets}Arimo-OFL.txt`, `${FONT_ZIEL}/Arimo-OFL.txt`);

const generat = {
  stand: {
    paket: PAKET_VERSION,
    daten: COVERAGE_MANIFEST.coreVersion,
    anzahl: eintraege.length,
    // Kein Date.now() ohne Not — der Tag kommt aus der Umgebung, damit ein
    // wiederholter Lauf am selben Tag byteweise dasselbe Generat ergibt.
    erzeugtAm: new Date().toISOString().slice(0, 10),
  },
  zeichen: eintraege.sort((a, b) => String(a.id).localeCompare(String(b.id))),
};

writeFileSync(ZIEL, `${JSON.stringify(generat, null, 0)}\n`, "utf8");
console.log(
  `${ZIEL}: ${eintraege.length} Zeichen, Paket ${generat.stand.paket}, Daten ${generat.stand.daten}`,
);
