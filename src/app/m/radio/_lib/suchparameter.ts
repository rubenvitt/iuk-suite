// src/app/m/radio/_lib/suchparameter.ts
// KEIN "use client" UND KEIN "use server" (Falle 6, `CLAUDE.md`): diese Datei liefert WERTE,
// die die Server Component `admin/(arbeit)/geraete/page.tsx` UND die Client-Insel
// `GeraeteTabelle.tsx` lesen. Eine Direktive machte aus jedem von ihnen eine Modulreferenz
// statt eines Wertes — HTTP 500 fuer die ganze Seite, und weder typecheck noch lint noch
// build saehen etwas. Der Scan darueber steht in `src/app/m/radio/riegel.test.ts:909-962`.
/*
 * ⛔ DIE DREI SCHLUESSELLISTEN KOMMEN AUS DEM BLATTMODUL `_lib/geraeteFelder.ts` UND NICHT AUS
 * `_lib/lesepfade/geraete.ts`, obwohl jenes sie weiterexportiert: diese Datei wird von der
 * Client-Insel gelesen, und `lesepfade/geraete.ts` importiert `drizzle-orm` und `_db/schema`
 * als WERTE. Ein Wertimport von dort zoege beides in das Browser-Bundle —
 * `_lib/csv/klassifizieren.ts:6-9` schreibt es aus: „weder `typecheck` noch `lint` noch
 * `build` saehen es."
 * ⛔ `GeraetFilter` DAGEGEN IST EIN `import type` UND VERSCHWINDET ZUR LAUFZEIT.
 */
import { SORTIER_SCHLUESSEL, SUCHFELDER_VORGABE } from "./geraeteFelder";
import type { GeraetFilter } from "./lesepfade/geraete";
import type { UpdateStand } from "./updateStand";

/**
 * DER SUCHPARAMETER-VERTRAG DER GERAETELISTE — §5.7.1
 * (`docs/superpowers/specs/2026-08-17-radio-modul-design.md:4631-4645`), Aufgabe V13.
 *
 * ⛔ REGIME B, HAUSMUSTER: Blaetterung, Sortierung und die zehn Filter laufen ueber die
 * URL, nicht ueber antds `Table`-internen Zustand. Der Server normalisiert die rohen
 * Parameter, bevor irgendetwas sie liest; die Insel schreibt sie zurueck. Vorbild
 * `src/app/m/lagerbuch/verwaltung/(arbeit)/journal/journalFilterLogik.ts` und
 * `src/app/m/lagerbuch/_ui/useUrlFilter.ts:16-27`.
 *
 * ⛔ DIESE DATEI SCHREIBT KEINE SCHLUESSELLISTE ZWEITMAL. Die zwoelf Suchfelder, die sieben
 * Vorgabefelder und die acht Sortierschluessel stehen in `_lib/geraeteFelder.ts` und werden
 * von `_lib/lesepfade/geraete.ts` nur WEITERexportiert (`:224`, `:239`, `:273`) — mit der
 * Begruendung dort: schriebe die Flaeche `location` und der Lesepfad `lagerort`, blieben
 * typecheck, lint, build und jeder Test gruen, und die Liste waere dauerhaft leer.
 */

/**
 * ⛔ FEST ZWANZIG, KEIN GROESSENWECHSLER — 1:1 aus
 * `radio-admin/client/src/features/devices/DeviceList.tsx:28` (`const PAGE_SIZE = 20;`) und
 * `:168` (`showSizeChanger: false`).
 *
 * ⚠️ DIE VORGABE DES LESEPFADS IST EINE ANDERE (25, `_lib/lesepfade/geraete.ts:398`, 1:1 zu
 * `radio-admin/server/src/repos/deviceRepo.ts:193`). Wer sie hier stehen liesse, zeigte im
 * Bestand zwanzig und in der Suite fuenfundzwanzig Zeilen je Seite — ein Unterschied, den
 * kein Tor meldet.
 */
export const SEITEN_GROESSE = 20;

/**
 * Die SECHS Listenfilter (`deviceRepo.ts:174-182`: CSV-Liste → `IN`, `deviceModes` → `AND`
 * ueber `LIKE`). Sie stehen als Liste da, weil `suchparameterZu` und `geraeteParameterAus`
 * sie beide durchlaufen muessen — zwei handgepflegte Aufzaehlungen liefen auseinander.
 */
export const FILTER_LISTEN = [
  "status",
  "lagerort",
  "geraeteTyp",
  "funktion",
  "hersteller",
  "geraeteFunktionen",
] as const;

/**
 * Die DREI Schalter (`deviceRepo.ts:186-188`). ⛔ Sie filtern NUR, wenn sie wahr sind —
 * „nicht ausleihbar" ist in dieser Maske nicht ausdrueckbar, und der Suite-Lesepfad
 * schreibt denselben Satz aus (`_lib/lesepfade/geraete.ts:491-493`).
 */
export const FILTER_SCHALTER = ["ausleihbar", "alamos", "hatAbweichung"] as const;

/** Die drei Werte des Update-Stands (`DeviceFilterDrawer.tsx:26-30`). */
export const UPDATE_STAND_WERTE: readonly UpdateStand[] = ["aktuell", "veraltet", "unbekannt"];


/**
 * Die ZEHN Filter der Geraeteliste, je einzeln benannt — 1:1 zu `DeviceFilters`
 * (`DeviceFilterDrawer.tsx:6-9`) mit den Feldnamen aus `GeraetZeile`.
 *
 * ⛔ EINZELN UND NICHT ALS INDEXSIGNATUR: der Alt-Kommentar `DeviceList.tsx:77-78` nennt den
 * Grund („Map every filter key explicitly (not a spread) so that clearing a filter actually
 * removes it from params"), und ein `Record<string, …>` machte jeden Tippfehler zu einem
 * gueltigen, wirkungslosen Filter.
 */
export type GeraetFilterWerte = {
  updateStand: string;
  status: string[];
  lagerort: string[];
  geraeteTyp: string[];
  funktion: string[];
  hersteller: string[];
  geraeteFunktionen: string[];
  ausleihbar: boolean;
  alamos: boolean;
  hatAbweichung: boolean;
};

/** Der Zustand des Zuruecksetzen-Knopfes — 1:1 `EMPTY_FILTERS` (`DeviceFilterDrawer.tsx:11`). */
export const LEERE_FILTER: GeraetFilterWerte = {
  updateStand: "",
  status: [],
  lagerort: [],
  geraeteTyp: [],
  funktion: [],
  hersteller: [],
  geraeteFunktionen: [],
  ausleihbar: false,
  alamos: false,
  hatAbweichung: false,
};

/**
 * Die SKALAREN Werte, die ueber die Insel-Grenze gehen und in der Adresszeile stehen.
 *
 * ⛔ NUR SERIALISIERBARES, KEIN `Date`, KEINE FUNKTION (Bauform-Zulaessigkeitstafel Nr. 7,
 * `.superpowers/sdd/planteil4/briefs/KOPF.md:320`).
 */
export type GeraeteSuchWerte = {
  q: string;
  sf: string[];
  seite: number;
  /** `schluessel:asc|desc`, oder leer. `sortierungLesen` zerlegt sie wieder. */
  sortierung: string;
  filter: GeraetFilterWerte;
};

/** Was Next einer Seite als `searchParams` uebergibt. */
export type RohSuchparameter = Record<string, string | string[] | undefined>;

/**
 * Ein mehrfach gesetzter Parameter (`?q=a&q=b`) kommt bei Next als `string[]` an.
 *
 * ⛔ DER ERSTE WERT GEWINNT. Ohne diese Faltung erzeugte `String(["a","b"])` still den
 * Suchbegriff `a,b` — gueltiges JavaScript, falsche Suche, kein Tor.
 */
function skalar(wert: string | string[] | undefined): string {
  if (Array.isArray(wert)) return wert[0]?.trim() ?? "";
  return wert?.trim() ?? "";
}

/** Kommagetrennt lesen, trimmen, Leerglieder wegwerfen. */
function liste(wert: string | string[] | undefined): string[] {
  return skalar(wert)
    .split(",")
    .map((teil) => teil.trim())
    .filter(Boolean);
}

/** `"1"` ist wahr, alles andere falsch — ein Schalter kennt nur an und aus. */
function schalter(wert: string | string[] | undefined): boolean {
  return skalar(wert) === "1";
}

/**
 * Aus Spaltenschluessel und antd-Sortierrichtung die Zeichenkette des Vertrags.
 *
 * ⛔ 1:1 AUS `DeviceList.tsx:120-123`:
 * `sort = \`${String(single.columnKey)}:${single.order === 'descend' ? 'desc' : 'asc'}\``.
 * Alles, was nicht `descend` ist, ist aufsteigend — es gibt keinen dritten Zustand und
 * keinen Fehlerzweig.
 *
 * ⛔ EIN UNBEKANNTER SCHLUESSEL ERGIBT DIE LEERE SORTIERUNG (Entscheidung E-V9,
 * `.superpowers/sdd/planteil4/briefs/KOPF.md:708-733`). Der Lesepfad selbst faellt bei einem
 * unbekannten Schluessel still auf `desc(createdAt)` zurueck
 * (`_lib/lesepfade/geraete.ts:504-511`) — gefaehrlich ist er also nicht, aber er hat in der
 * Adresszeile nichts verloren: dort behauptete er eine Sortierung, die die Tabelle nicht hat.
 */
export function sortierungZeichenkette(schluessel: unknown, richtung: unknown): string {
  if (schluessel == null || richtung == null) return "";
  const k = String(schluessel);
  if (!SORTIER_SCHLUESSEL.includes(k)) return "";
  return `${k}:${richtung === "descend" ? "desc" : "asc"}`;
}

/** Die Gegenrichtung — fuer den gesteuerten Sortierpfeil der Tabelle. */
export function sortierungLesen(
  sortierung: string,
): { schluessel: string; richtung: "asc" | "desc" } | null {
  const [schluessel, richtung] = sortierung.split(":");
  if (!schluessel || !SORTIER_SCHLUESSEL.includes(schluessel)) return null;
  return { schluessel, richtung: richtung === "desc" ? "desc" : "asc" };
}

/**
 * Die rohen Parameter der Adresszeile in die skalaren Anzeigewerte UND den validierten
 * Lesefilter trennen — dieselbe Zweiteilung wie
 * `lagerbuch/.../journalFilterLogik.ts:47-68`.
 *
 * ⛔ DIE SUCHFELDER WERDEN NICHT GEFILTERT, UND DAS IST DER GEGENLAEUFIGE POSTEN DIESER
 * DATEI. Der Lesepfad fuehrt einen Sicherheitszweig: sind ALLE angeforderten Felder
 * unbekannt, liefert die Abfrage KEINE Zeile (`_lib/lesepfade/geraete.ts:465-471`, 1:1 zu
 * `deviceRepo.ts:168-172`, „never interpolate unknown names into SQL") — waehrend eine LEERE
 * Liste die sieben Vorgabefelder bedeutet (`:458`). Wer hier unbekannte Felder wegwuerfe,
 * drehte „alle unbekannt ⇒ keine Zeile" in „alle unbekannt ⇒ alle Zeilen".
 */
export function geraeteParameterAus(roh: RohSuchparameter): {
  werte: GeraeteSuchWerte;
  filter: GeraetFilter;
} {
  const q = skalar(roh.q);
  const sfRoh = liste(roh.sf);
  const sf = sfRoh.length ? sfRoh : [...SUCHFELDER_VORGABE];

  const seiteZahl = Number.parseInt(skalar(roh.seite), 10);
  const seite = Number.isFinite(seiteZahl) && seiteZahl >= 1 ? seiteZahl : 1;

  const sortierung = (() => {
    const gelesen = sortierungLesen(skalar(roh.sortierung));
    return gelesen ? `${gelesen.schluessel}:${gelesen.richtung}` : "";
  })();

  const standRoh = skalar(roh.updateStand);
  const updateStand = (UPDATE_STAND_WERTE as readonly string[]).includes(standRoh)
    ? standRoh
    : "";

  const filterWerte: GeraetFilterWerte = {
    updateStand,
    status: liste(roh.status),
    lagerort: liste(roh.lagerort),
    geraeteTyp: liste(roh.geraeteTyp),
    funktion: liste(roh.funktion),
    hersteller: liste(roh.hersteller),
    geraeteFunktionen: liste(roh.geraeteFunktionen),
    ausleihbar: schalter(roh.ausleihbar),
    alamos: schalter(roh.alamos),
    hatAbweichung: schalter(roh.hatAbweichung),
  };

  const werte: GeraeteSuchWerte = { q, sf, seite, sortierung, filter: filterWerte };

  const filter: GeraetFilter = {
    q: q || undefined,
    suchfelder: sfRoh.length ? sfRoh : undefined,
    updateStand: (filterWerte.updateStand || undefined) as UpdateStand | undefined,
    status: filterWerte.status.length ? filterWerte.status : undefined,
    lagerort: filterWerte.lagerort.length ? filterWerte.lagerort : undefined,
    geraeteTyp: filterWerte.geraeteTyp.length ? filterWerte.geraeteTyp : undefined,
    funktion: filterWerte.funktion.length ? filterWerte.funktion : undefined,
    hersteller: filterWerte.hersteller.length ? filterWerte.hersteller : undefined,
    geraeteFunktionen: filterWerte.geraeteFunktionen.length
      ? filterWerte.geraeteFunktionen
      : undefined,
    // ⛔ `|| undefined`, NICHT `?? undefined`: ein `false` darf den Lesepfad gar nicht
    // erreichen (`deviceRepo.ts:186-188`).
    ausleihbar: filterWerte.ausleihbar || undefined,
    alamos: filterWerte.alamos || undefined,
    hatAbweichung: filterWerte.hatAbweichung || undefined,
    sortierung: sortierung || undefined,
    seite,
    seitenGroesse: SEITEN_GROESSE,
  };

  return { werte, filter };
}

/**
 * Die Werte als Patch fuer die Adresszeile — ⛔ MIT ALLEN VIERZEHN SCHLUESSELN, auch den
 * leeren.
 *
 * ⛔ DAS IST DER GANZE PUNKT, und der Alt-Kommentar `DeviceList.tsx:77-78` sagt ihn woertlich:
 * „Map every filter key explicitly (not a spread) so that clearing a filter actually removes
 * it from params." Die Insel schreibt in eine BESTEHENDE Adresszeile (`angewandt`); ein Patch,
 * der nur die gesetzten Werte fuehrt, laesst den geleerten Filter dort stehen.
 */
/** Ist die Feldauswahl zeichengleich die Vorgabe? Dann gehoert sie nicht in die URL. */
function sindVorgabefelder(sf: string[]): boolean {
  return sf.join(",") === SUCHFELDER_VORGABE.join(",");
}

export function suchparameterZu(werte: GeraeteSuchWerte): Record<string, string> {
  const f = werte.filter;
  return {
    q: werte.q,
    /*
     * ⛔ NUR, WENN DIE AUSWAHL VON DER VORGABE ABWEICHT. `werte.sf` fuehrt IMMER die
     * WIRKSAMEN Felder — die Feldauswahl muss ihre Haken setzen koennen, auch wenn die
     * Adresszeile nichts sagt. Die sieben Vorgabefelder bei jedem Klick mitzuschreiben
     * machte aus jeder Adresse eine Zeile Rauschen, und „alle Haken weg" heisst im
     * Bestand ohnehin dasselbe wie „Vorgabe" (`deviceRepo.ts:162`,
     * `_lib/lesepfade/geraete.ts:458`).
     */
    sf: sindVorgabefelder(werte.sf) ? "" : werte.sf.join(","),
    // Seite 1 ist die Vorgabe und gehoert nicht in die Adresszeile.
    seite: werte.seite > 1 ? String(werte.seite) : "",
    sortierung: werte.sortierung,
    updateStand: f.updateStand,
    status: f.status.join(","),
    lagerort: f.lagerort.join(","),
    geraeteTyp: f.geraeteTyp.join(","),
    funktion: f.funktion.join(","),
    hersteller: f.hersteller.join(","),
    geraeteFunktionen: f.geraeteFunktionen.join(","),
    ausleihbar: f.ausleihbar ? "1" : "",
    alamos: f.alamos ? "1" : "",
    hatAbweichung: f.hatAbweichung ? "1" : "",
  };
}

/**
 * Den Patch auf eine bestehende Adresszeile legen: gesetzt wird gesetzt, leer wird
 * GELOESCHT. Bauform 1:1 aus `src/app/m/lagerbuch/_ui/useUrlFilter.ts:16-27`.
 *
 * ⛔ SIE STEHT HIER UND NICHT IN DER INSEL, damit „ein geleerter Filter verschwindet" ohne
 * Browser pruefbar ist. In der Insel waere sie nur ueber einen echten Abruf messbar.
 */
export function angewandt(
  bestand: URLSearchParams,
  patch: Record<string, string>,
): URLSearchParams {
  const naechste = new URLSearchParams(bestand);
  for (const [name, wert] of Object.entries(patch)) {
    if (wert) naechste.set(name, wert);
    else naechste.delete(name);
  }
  return naechste;
}
