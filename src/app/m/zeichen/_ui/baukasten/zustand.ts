"use client";

import type { SymbolSpec } from "@einsatzzeichen/schema";
import type { ValidationIssue } from "@einsatzzeichen/core";
import {
  BodyNotMeasuredError,
  CompositionError,
  NotMeasuredError,
  composeFromCatalog,
  describeSymbolSpec,
  renderSvg,
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
  return reduceSpec(spec, {
    feld: "labels",
    wert: Object.keys(labels).length ? labels : undefined,
  });
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

/**
 * Ein Regeltext, wie er am Feld erscheint: der eigene Satz erklaert, die
 * ORIGINALE Paketmeldung belegt (Spec §6.3, Korrektur 5 des Auftrags).
 */
export interface Regelhinweis {
  titel: string;
  erklaerung: string;
  /**
   * `issue.message` des Pakets, nicht `error.message`: letztere fasst alle
   * Verstoesse zusammen und ist fuers Log gedacht. Bei einer Vermessungsluecke
   * gibt es keine Regel-ID, wohl aber eine Meldung.
   */
  meldung?: string;
}

/**
 * Die Regeltexte eines Bauergebnisses, gruppiert nach der Achse, an der sie
 * erscheinen (Korrektur 4 des Auftrags, Spec §6.3).
 *
 * ⛔ NICHT ALLES UNTER „beschriftung" ABLEGEN. Der Erklaertext gehoert an das
 * Feld, an dem gerade geklickt wurde — sonst steht `strength-requires-unit` unter
 * der Beschriftung, und der Anwender sucht die Erklaerung dort, wo er nichts
 * geaendert hat. Die Zuordnung fuehrt `_lib/regeltexte.ts`.
 *
 * Eine VERMESSUNGSLUECKE traegt keine Regel-ID und laesst sich deshalb keiner
 * Achse zuordnen; sie landet an der Beschriftung — der einzigen Achse, die immer
 * gerendert wird.
 */
export function hinweiseZu(ergebnis: BauErgebnis): Map<string, Regelhinweis[]> {
  const karte = new Map<string, Regelhinweis[]>();
  if (ergebnis.ok) return karte;
  const anhaengen = (achse: string, hinweis: Regelhinweis) => {
    const vorhanden = karte.get(achse);
    if (vorhanden) vorhanden.push(hinweis);
    else karte.set(achse, [hinweis]);
  };
  if (ergebnis.art === "regel") {
    for (const verstoss of ergebnis.verstoesse) {
      const text = regeltext(verstoss.rule);
      anhaengen(text.achse, {
        titel: text.titel,
        erklaerung: text.erklaerung,
        meldung: verstoss.message,
      });
    }
    return karte;
  }
  anhaengen("beschriftung", {
    titel: "Diese Zusammenstellung ist nicht vermessen",
    erklaerung:
      ergebnis.bereich === "value"
        ? "Für einen der gewählten Werte führt der Katalog keine vermessene Fassung."
        : "Der Katalog kennt diese Kombination nicht. Nimm einen der Werte heraus.",
    meldung: ergebnis.meldung,
  });
  return karte;
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
 * das 9,7 ms kalt / 3,4 ms warm fuer 247 Kandidaten ueber elf Felder (M16); genau
 * diese 247 fuehrt auch das Vokabular dieses Moduls.
 *
 * ⛔ NUR KOMPONIEREN, NICHT ZEICHNEN. `baue()` rendert zusaetzlich SVG; ueber 247
 * Kandidaten waere das ein Vielfaches der gemessenen Zeit fuer eine Antwort, die
 * niemand ansieht.
 *
 * ⛔ KEINE VORPRUEFUNG MIT `validateSpec`. Sie waere schneller und FALSCH: ohne den
 * Kontext aus aufgeloester Funktionsfassung und Verwaltungskopf, den `compose()`
 * aus den Ports baut, lehnt sie alle 25 Funktionsrollen ab — die Auswahl sperrte
 * dann Gueltiges.
 *
 * WARUM IM BROWSER UND NICHT PER SERVER ACTION: 247 Kandidaten je Tastendruck
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
 * `nurIds` schraenkt den Pool auf ein Lernset ein (Spec §6.5: „aus den 232 ODER
 * aus dem zuletzt auf /lernen gewaehlten Lernset"). Aufgabe 8 liefert
 * `idsAusSet(db, slug)` und den `?set=`-Parameter dazu; bis dahin kommt hier
 * `undefined` an und der ganze Bestand ist im Spiel.
 *
 * ⛔ EINE LEERE LISTE IST NICHT „ALLES". Ein Lernset ohne Zeichen hat keine
 * Aufgabe; eine stattdessen gezogene beliebige waere eine falsche Auskunft ueber
 * das Set. Deshalb die Unterscheidung `undefined` gegen `[]`.
 *
 * DIE UEBUNG SCHREIBT KEINEN LERNSTAND und keine Zeile in irgendeine Tabelle. Sie
 * ist ein Werkzeug, kein Pruefungsteil — deshalb braucht sie weder Server Action
 * noch Fragetoken noch eine dritte Insel. Der Katalog-Code liegt an dieser Stelle
 * ohnehin schon im Browser (Betreiberentscheidung 2026-09-02).
 */
export function ziehePruefaufgabe(
  pool: readonly Uebungsaufgabe[],
  wuerfel: () => number = Math.random,
  nurIds?: readonly string[],
): Uebungsaufgabe | null {
  const auswahl =
    nurIds === undefined ? pool : pool.filter((a) => nurIds.includes(a.id));
  if (auswahl.length === 0) return null;
  const i = Math.min(auswahl.length - 1, Math.floor(wuerfel() * auswahl.length));
  return auswahl[i];
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
    // Der Umweg ueber `unknown`: `SymbolSpec` hat keine Indexsignatur, ein
    // direkter Cast ist deshalb ein Typfehler (TS2352).
    const a = (eigene as unknown as Record<string, unknown>)[feld];
    const b = (ziel as unknown as Record<string, unknown>)[feld];
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
