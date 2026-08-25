// src/app/m/radio/_lib/csv/klassifizieren.ts
// KEIN "use client" UND KEIN "use server" (Falle 6, `CLAUDE.md`): `KLASSEN_WOERTER` ist ein
// WERT, den die Vorschau-Insel des Import-Assistenten (V18, Insel 4) UND die Server
// Components lesen. Der Scan darueber steht in `src/app/m/radio/riegel.test.ts:909-962`.
//
// ⛔ JEDER SCHEMA-BEZUG HIER IST EIN TYPIMPORT. `import type` verschwindet zur Laufzeit; ein
// Wertimport aus `_db/` zoege Drizzle und `better-sqlite3` ins Browser-Bundle, und weder
// `typecheck` noch `lint` noch `build` saehen es. Aus demselben Grund importiert diese Datei
// NICHTS aus `_lib/csv/einlesen.ts` — dort laufen die Node-Bausteine.
import type { Geraet } from "../../_db/schema";
import type { FeldDiff } from "../geraeteDiff";
import { diffGeraet } from "../geraeteDiff";
import { filterSchreibbareFelder, type RadioRolle } from "../rollen";
import { tagAusWert } from "./spalten";
import type { ImportierbaresFeld } from "./kopfzeilen";
import { GERAETE_MODI } from "../geraeteFelder";

/**
 * Die vier Geraetefunktionen — ⛔ 1:1 aus `radio-admin/shared/src/constants.ts:4`
 * (`DEVICE_MODES`), gehalten von `constants.test.ts:6` und `index.test.ts:19`. ⛔ DIE
 * REIHENFOLGE IST DIE KANONISCHE AUSGABEREIHENFOLGE — sie wird NICHT sortiert. Ein `sort()`
 * in `normalisiereModi` unten machte aus „TMO,DMO" ein „DMO,TMO", und die Zelle saehe fuer
 * jeden Leser anders aus als im Bestand.
 *
 * ⛔ SIE STEHT SEIT DEM NACHTRAG ZU V13 IN `_lib/geraeteFelder.ts` UND WIRD VON HIER NUR
 * WEITERGEREICHT. Grund: die Filterschublade der Insel 1 (`admin/(arbeit)/geraete/`) liest
 * die vier Zeichenketten, und ueber DIESE Datei haengt daran der ganze CSV-Teilbaum
 * (`geraeteDiff`, `rollen`, `csv/spalten`) — unnoetiges Gewicht im Browser-Bundle. ⬜ Aufgabe
 * V14 baut die Geraetefunktions-Auswahl des Formulars und liest die Liste ebenfalls von dort
 * (ihr Testfall nennt `constants.ts:4` namentlich, `briefs/V14.md:114`) — ⛔ keine zweite
 * Kopie. ⚠️ `STATUS_OPTIONS` (`constants.ts:10-16`) liegt seit V13 ebenfalls dort.
 */
export { GERAETE_MODI };

/**
 * Die FUENF Klassen einer Importzeile.
 *
 * ⛔ HIER WEICHT DIE SPEC VON DER MESSUNG AB, UND DIE MESSUNG GILT. `Spec:4711-4714` nennt
 * drei Woerter — „neu / geaendert / unveraendert" — und verlangt, sie seien „aus
 * `classify-import-row.ts` zu uebernehmen, nicht zu erfinden". Gemessen sind es FUENF Klassen
 * mit anderen Woertern (`radio-admin/client/src/features/import/ImportWizard.tsx:60-66`).
 * ⛔ DIE ANWEISUNG DER SPEC WIRD DAMIT ERFUELLT, NICHT GEBROCHEN: uebernommen wird, was im
 * Bestand steht.
 */
export type Importklasse = "created" | "updated" | "unchanged" | "error" | "skipped-no-permission";

/**
 * Der geschlossene Satz als WERT — nach dem Vorbild von `GERAETE_STATUS`
 * (`_lib/status.ts:56-62`). Er ist exportiert, damit die Tests ihn durchlaufen koennen:
 * waechst die Union um einen Zweig, ohne dass diese Liste ihn kennt, ist das ein Typfehler
 * an `KLASSEN_WOERTER` unten und kein stilles `undefined`.
 */
export const IMPORTKLASSEN: readonly Importklasse[] = [
  "created",
  "updated",
  "unchanged",
  "error",
  "skipped-no-permission",
] as const;

/**
 * Wort und Ton je Klasse, 1:1 aus `ImportWizard.tsx:60-66`.
 *
 * ⛔ „Aktualisiert", NICHT „geändert" — der Bestand schreibt es so, und die Spec-Formulierung
 * ist die veraltete (siehe `Importklasse` oben).
 *
 * ⚠️ FALLE 3 (`CLAUDE.md`): `colorError === colorPrimary === #c8000f`. Der Fehlerton bleibt
 * 1:1 „red", ABER er ist nicht der einzige Traeger — die Klasse traegt ihr Wort, und die
 * Fehlerzeile traegt zusaetzlich ihren eigenen Text (`ImportWizard.tsx:286`,
 * `<Typography.Text type="danger">{row.error}</Typography.Text>`). Wer die Farbe zum einzigen
 * Unterschied machte, baute eine Fehlerzeile, die aussieht wie eine Primaeraktion.
 */
export const KLASSEN_WOERTER: Record<Importklasse, { wort: string; ton: string }> = {
  created: { wort: "Neu", ton: "green" },
  updated: { wort: "Aktualisiert", ton: "blue" },
  unchanged: { wort: "Unverändert", ton: "default" },
  error: { wort: "Fehler", ton: "red" },
  "skipped-no-permission": { wort: "Übersprungen", ton: "orange" },
};

/**
 * Feld -> Spaltenindex der Datei.
 *
 * 1:1 aus `commit-service.ts:15` (`ColumnMapping`): die Oberflaeche legt fest, welche Spalte
 * welches Feld speist — nach dem Vorschlag aus `automatischeSpaltenzuordnung`, aber
 * ueberstimmbar.
 */
export type Spaltenzuordnung = Partial<Record<ImportierbaresFeld, number>>;

/** Eine gelesene Zeile: der Schluessel plus die zugeordneten Felder. */
export type EingehendeZeile = Partial<Record<ImportierbaresFeld, unknown>> & { issi: string };

/** Das Ergebnis fuer EINE Zeile. */
export type Klassifikation = {
  klasse: Importklasse;
  aenderungen: FeldDiff[];
  fehler?: string;
};

/** Eine klassifizierte Zeile mit ihrer Position in der Datei. */
export type KlassifizierteZeile = Klassifikation & { zeilenNummer: number; issi: string };

/** Die Zusammenfassung zaehlt ALLE FUENF Klassen (`commit-service.ts:123-129`). */
export type Zusammenfassung = Record<Importklasse, number>;

/**
 * Die Zellwerte, die einen Wahrheitswert wahr machen — klein und getrimmt verglichen.
 *
 * ⛔ 1:1 AUS `commit-service.ts:19`, inklusive des Hakens `✓`. Er ist ein Zellinhalt aus dem
 * Bestand, kein Bezeichner. Der Alt-Kommentar (`:17-18`) nennt den Grund, warum beide
 * Wahrheitsfelder dieselbe Menge benutzen: „Shared by both boolean fields so the truthy rule
 * is identical."
 */
const WAHR_WOERTER = new Set<string>(["x", "ja", "yes", "y", "1", "true", "wahr", "✓"]);

/**
 * Normalisiert eine Wahrheitswertzelle.
 *
 * ⛔ 1:1 AUS `commit-service.ts:25-29`: leer -> `null`, ein bekanntes Wort -> `true`, ⛔ ALLES
 * ANDERE -> `false`. Der letzte Teil ist die Zeile, die man versehentlich zu `null` macht:
 * „nein" und „0" sind eine AUSSAGE, kein fehlender Wert. Wer sie zu `null` faltet, laesst
 * einen bewussten Haken-weg still stehen.
 */
function normalisiereWahrheitswert(zelle: string): boolean | null {
  const wert = zelle.trim().toLowerCase();
  if (wert === "") return null;
  return WAHR_WOERTER.has(wert);
}

/**
 * Normalisiert eine Geraetefunktions-Zelle in die kanonische, komma-verbundene Teilmenge.
 *
 * ⛔ 1:1 AUS `commit-service.ts:74-83`: Split an `/ , ;` und Leerraum, gross, nur bekannte
 * Modi, ⛔ in `GERAETE_MODI`-Reihenfolge, dedupliziert. Keine bekannten Modi -> `null`.
 *
 * ⛔ DIE REIHENFOLGE KOMMT AUS DER KONSTANTEN, NICHT AUS DER ZELLE UND NICHT AUS `sort()`
 * (`commit-service.ts:81`, `DEVICE_MODES.filter(...)`). Ein `sort()` hier waere alphabetisch
 * und ergaebe „DMO,TMO" statt „TMO,DMO".
 */
function normalisiereModi(zelle: string): string | null {
  const gefunden = new Set(
    zelle
      .split(/[/,;\s]+/)
      .map((teil) => teil.trim().toUpperCase())
      .filter((teil) => teil !== ""),
  );
  const geordnet = GERAETE_MODI.filter((modus) => gefunden.has(modus));
  return geordnet.length === 0 ? null : geordnet.join(",");
}

/**
 * Macht aus einer rohen Zeichenkettenzeile die typisierte Form `{ issi, …patch }`.
 *
 * ⛔ 1:1 AUS `commit-service.ts:86-110` (`rowToIncoming`), Zweig fuer Zweig:
 *
 * - `issi`: getrimmt, roh (`:95-96`) — sie ist der Schluessel und wird NICHT zu `null`.
 * - `deviceModes`: ueber `normalisiereModi` (`:97-98`).
 * - `alamosIntegrated`/`loanable`: ueber `normalisiereWahrheitswert` (`:99-100`).
 * - `lastUpdatedAt`: ⛔ ueber `tagAusWert` aus `_lib/csv/spalten.ts` — DIESELBE Funktion, die
 *   der Export und das Formular lesen (Entscheidung E-V11 Punkt 4, `Spec:4739-4746`). Hier
 *   steht ausdruecklich KEINE zweite Umrechnung.
 * - alles andere: getrimmt, leer -> `null` (`:106`).
 *
 * ⛔ EINE FEHLENDE SPALTE IST KEIN `undefined`, SONDERN EIN LEERWERT (`:93-94`,
 * `typeof raw === 'string' ? raw.trim() : ''`). `diffGeraet` steigt bei `undefined` aus
 * (`_lib/geraeteDiff.ts:73`); eine kurze Zeile wuerde sonst je nach Feld einmal als „nicht
 * angefasst" und einmal als „geleert" gelesen.
 *
 * ⚠️ WELCHE HAELFTE DIESER ZEILE BEWACHT IST — gemessen am 2026-08-25 (Fix-Runde 1 zu
 * Review V9, Fund F5), weil die Sondentabelle des V9-Berichts hier eine unverdiente Zeile
 * fuehrte:
 *
 *   - die TYPPRUEFUNG ist ein nachgewiesener No-op. `const wert = roh?.trim() ?? "";` ergibt
 *     `59 passed` — 0 rot. Beide Schreibungen sind fuer die heutigen Aufrufer Identitaeten.
 *   - das `.trim()` IST die Zusicherung. `const wert = roh ?? "";` ergibt **1 rot**.
 *
 * ⛔ Wer die Zeile also zur optionalen Kette „aufraeumt", bekommt vom Tor kein Signal, und
 * das ist in Ordnung — wer dabei das `.trim()` mitnimmt, bekommt eines. Der Satz steht hier,
 * damit niemand die Nullmessung fuer eine Testschwaeche haelt und den falschen Fall baut.
 */
export function zeileZuEingehend(
  zeile: readonly string[],
  zuordnung: Spaltenzuordnung,
): EingehendeZeile {
  const ergebnis: Record<string, unknown> = { issi: "" };
  for (const [feld, spaltenIndex] of Object.entries(zuordnung)) {
    if (spaltenIndex === undefined) continue;
    const roh = zeile[spaltenIndex];
    const wert = typeof roh === "string" ? roh.trim() : "";
    if (feld === "issi") {
      ergebnis.issi = wert;
    } else if (feld === "deviceModes") {
      ergebnis.deviceModes = normalisiereModi(typeof roh === "string" ? roh : "");
    } else if (feld === "alamosIntegrated" || feld === "loanable") {
      ergebnis[feld] = normalisiereWahrheitswert(typeof roh === "string" ? roh : "");
    } else if (feld === "lastUpdatedAt") {
      ergebnis.lastUpdatedAt = tagAusWert(wert);
    } else {
      ergebnis[feld] = wert === "" ? null : wert;
    }
  }
  return ergebnis as EingehendeZeile;
}

/**
 * Ein synthetisches ALL-NULL-Geraet, damit die Aenderungen einer Neuanlage `alt: null`
 * tragen.
 *
 * ⛔ 1:1 AUS `classify-import-row.ts:56-84` (`emptyDevice`). Ohne es haette eine Neuanlage
 * ueberhaupt keine Aenderungszeilen — es gaebe nichts, wogegen zu diffen waere.
 *
 * ⚠️ `new Date(0)` STEHT HIER FUER `createdAt`/`updatedAt` (die Quelle schreibt `0`,
 * `:80-81`), UND DIESE ZEILE VERLAESST NIE DEN SPEICHER: `diffGeraet` laeuft ausschliesslich
 * ueber die Schluessel des PATCHES (`_lib/geraeteDiff.ts:71`), und weder `createdAt` noch
 * `updatedAt` sind importierbare Felder (`kopfzeilen.ts`, `IMPORTIERBARE_FELDER`). Der
 * vernarbte Praezedenzfall — ein `?? new Date(0)` auf `returnedAt`, das jede aktive Leihe zu
 * einer 1970 zurueckgegebenen gemacht haette — betrifft eine GESPEICHERTE Spalte; diese hier
 * ist ein Vergleichswert.
 */
function leeresGeraet(issi: string): Geraet {
  return {
    id: "",
    rufname: null,
    issi,
    tei: null,
    serialNumber: null,
    deviceType: null,
    status: null,
    location: null,
    assignedTo: null,
    softwareVersion: null,
    lastUpdatedAt: null,
    notes: null,
    hiorgId: null,
    opta: null,
    funktion: null,
    hersteller: null,
    bedieneinheit: null,
    deviceModes: null,
    alamosIntegrated: null,
    loanable: null,
    updateNote: null,
    createdAt: new Date(0),
    updatedAt: new Date(0),
    createdBy: null,
    updatedBy: null,
  };
}

/**
 * Klassifiziert EINE zugeordnete Zeile gegen das passende bestehende Geraet.
 *
 * ⛔ 1:1 AUS `classify-import-row.ts:25-53`, in dieser Reihenfolge:
 *
 * 1. ⛔ LEERE ODER NUR-LEERRAUM-ISSI -> `error` „Leere ISSI" (`:33-35`). Die ISSI ist der
 *    Pflicht-Schluessel; ohne sie gibt es kein Ziel.
 * 2. ⛔ `issi` WIRD AUS DEM PATCH ENTFERNT, BEVOR GEFILTERT UND GEDIFFET WIRD (`:39`),
 *    woertlich: „it is the match key, never a diffed/persisted field". Bliebe sie drin,
 *    truege jede Zeile eine Scheinaenderung auf sich selbst.
 * 3. ROLLEN-ALLOWLIST AUF DEN EINGEHENDEN PATCH (`:40`) — dieselbe `filterSchreibbareFelder`
 *    aus `_lib/rollen.ts:101`, die auch das Formular benutzt.
 * 4. ⛔ UNBEKANNTE ISSI: `created` FUER ADMIN, `skipped-no-permission` FUER UPDATER
 *    (`:43-49`). Die Updater-Stufe hat kein Anlegerecht; sie bekommt eine sichtbare
 *    Uebersprungen-Zeile und keinen stillen Ausfall.
 * 5. BEKANNTE ISSI: `updated`, wenn der Diff nicht leer ist, sonst `unchanged` (`:52-53`).
 */
export function klassifiziereZeile(args: {
  eingehend: EingehendeZeile;
  bestehend: Geraet | null;
  rolle: RadioRolle;
}): Klassifikation {
  const { eingehend, bestehend, rolle } = args;

  // 1) Die ISSI ist der Pflicht-Schluessel.
  if (typeof eingehend.issi !== "string" || eingehend.issi.trim() === "") {
    return { klasse: "error", aenderungen: [], fehler: "Leere ISSI" };
  }

  // 2) + 3) `issi` faellt heraus, dann die Rollen-Allowlist.
  const { issi: _issi, ...uebrige } = eingehend;
  const erlaubt = filterSchreibbareFelder(rolle, uebrige as Record<string, unknown>) as Partial<Geraet>;

  // 4) Unbekannte ISSI.
  if (bestehend === null) {
    if (rolle !== "admin") {
      return { klasse: "skipped-no-permission", aenderungen: [] };
    }
    return { klasse: "created", aenderungen: diffGeraet(leeresGeraet(eingehend.issi), erlaubt) };
  }

  // 5) Bekannte ISSI.
  const aenderungen = diffGeraet(bestehend, erlaubt);
  return { klasse: aenderungen.length === 0 ? "unchanged" : "updated", aenderungen };
}

/**
 * Klassifiziert alle Zeilen einer Datei und zaehlt sie.
 *
 * ⛔ 1:1 AUS `commit-service.ts:116-147`, mit zwei Eigenschaften, die je eine eigene Zeile
 * sind:
 *
 * 1. ⛔ DOPPELTE ISSI IN DERSELBEN DATEI: die zweite und jede weitere -> `error`
 *    „Duplikat in Datei" (`:135-138`). ⛔ DAS ERSTE VORKOMMEN BLEIBT GUELTIG — der Speicher
 *    wird erst NACH der Pruefung gefuellt (`:139`). Ohne diese Erkennung schriebe ein Import
 *    dieselbe Zeile zweimal und die zweite gewaenne, ohne dass es jemand saehe.
 * 2. ⛔ DIE PRUEFUNG HAENGT AN `issi !== ''` (`:135`, `:139`): eine LEERE ISSI kommt gar nicht
 *    erst in den Speicher. Zwei Zeilen ohne Kennung tragen deshalb beide „Leere ISSI" und
 *    nicht ab der zweiten „Duplikat in Datei" — sonst suchte die bedienende Person ein
 *    Duplikat, das es nicht gibt.
 *
 * ⛔ DIE ZUSAMMENFASSUNG WIRD MIT ALLEN FUENF KLASSEN AUF 0 ANGELEGT (`:123-129`), nicht
 * unterwegs aufgebaut: eine Klasse, die in dieser Datei nicht vorkommt, muss als `0`
 * dastehen und nicht als `undefined`.
 */
export function klassifiziereZeilen(args: {
  zeilen: readonly (readonly string[])[];
  zuordnung: Spaltenzuordnung;
  bestehendNachIssi: Map<string, Geraet>;
  rolle: RadioRolle;
}): { zeilen: KlassifizierteZeile[]; zusammenfassung: Zusammenfassung } {
  const { zeilen, zuordnung, bestehendNachIssi, rolle } = args;
  const zusammenfassung: Zusammenfassung = {
    created: 0,
    updated: 0,
    unchanged: 0,
    error: 0,
    "skipped-no-permission": 0,
  };
  const gesehen = new Set<string>();

  const ergebnis: KlassifizierteZeile[] = zeilen.map((zeile, zeilenNummer) => {
    const eingehend = zeileZuEingehend(zeile, zuordnung);
    const issi = eingehend.issi;

    if (issi !== "" && gesehen.has(issi)) {
      zusammenfassung.error += 1;
      return { zeilenNummer, issi, klasse: "error", aenderungen: [], fehler: "Duplikat in Datei" };
    }
    if (issi !== "") gesehen.add(issi);

    const bestehend = issi === "" ? null : (bestehendNachIssi.get(issi) ?? null);
    const klassifikation = klassifiziereZeile({ eingehend, bestehend, rolle });
    zusammenfassung[klassifikation.klasse] += 1;
    return {
      zeilenNummer,
      issi,
      klasse: klassifikation.klasse,
      aenderungen: klassifikation.aenderungen,
      fehler: klassifikation.fehler,
    };
  });

  return { zeilen: ergebnis, zusammenfassung };
}
