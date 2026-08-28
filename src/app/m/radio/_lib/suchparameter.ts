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
import { ZONE } from "./anzeige";
import { SORTIER_SCHLUESSEL, SUCHFELDER_VORGABE } from "./geraeteFelder";
import type { AusleihenParameter } from "./lesepfade/ausleihen";
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

/* ============================================================================================
 * DER SUCHPARAMETER-VERTRAG DER AUSLEIHENLISTE — `/admin/ausleihen`, Aufgabe V16.
 *
 * ⛔ ER STEHT IN DIESER DATEI UND NICHT IN EINER ZWEITEN — Vorabscan-Fund F3
 * (`.superpowers/sdd/planteil4/VORABSCAN.md:146-148`, woertlich: „die Normalisierung in
 * `_lib/suchparameter.ts` (V13) mitfuehren, ⛔ nicht in einer zweiten Datei").
 *
 * ⛔ WARUM ES IHN GIBT — UND DASS ER KEIN 1:1-POSTEN IST: Betreiberentscheidung ⬜ **V-L11**
 * vom 2026-08-24 (`.superpowers/sdd/planteil4/progress.md`, Abschnitt „✅ V-L11": „Beides."),
 * die den Plan an drei Stellen ueberholt, wo er ausdruecklich KEIN Bedienelement vorsah. Die
 * Auflage dort bindet: „die Grundliste, ihre Sortierung und ihre Spalten bleiben, wie der
 * Bestand sie hat; der Filter kommt HINZU." Der Alt-Bestand schickt gemessen nur
 * `page`/`pageSize` (`useLoans.ts:18-23`).
 *
 * ⬜ **V16-L1 — WAS DER ZEITRAUMFILTER NICHT BEANTWORTET.** Die Betreiberentscheidung nennt
 * als zweite Rueckfrage „wer hatte was am Einsatztag". Das Fenster steht aber auf
 * `borrowedAt` und nicht auf einer Ueberlappung — 1:1 aus `loanRepo.ts:140-141`, ausdruecklich
 * festgehalten in `_db/leihen.ts` („DIE GRENZEN STEHEN AUF `borrowedAt`, NICHT AUF
 * `returnedAt`"). Eine Leihe, die am Vortag begann und am Einsatztag noch lief, faellt heraus.
 * ⛔ DIE ABFRAGE WIRD DAFUER NICHT AUFGEBOHRT: das braeche die 1:1-Deckung von `leihhistorie`
 * mit `listLoans`. Die Bedienelemente heissen deshalb „Ausgeliehen von"/„Ausgeliehen bis" und
 * sagen, was sie tun. Eigentuemer der Frage, ob ein Ueberlappungsfenster gebraucht wird:
 * **Betreiber**, vor dem Rollout.
 * ========================================================================================= */

/**
 * Die skalaren Werte, die ueber die Insel-Grenze gehen und in der Adresszeile stehen.
 *
 * ⛔ `von` UND `bis` SIND ZEICHENKETTEN `YYYY-MM-DD`, KEIN `Date`
 * (Bauform-Zulaessigkeitstafel Nr. 7, `Spec:4536-4539`). Dieselbe Form wie im Hausvorbild
 * `lagerbuch/verwaltung/(arbeit)/journal/JournalFilter.tsx`, wo `dayjs` erst IN der Insel
 * lebt. Das `Date` entsteht ausschliesslich auf dem Server, unten.
 */
export type AusleihenFilterWerte = {
  /** Die Id des Geraets aus `geraeteAuswahl`, oder leer. */
  geraet: string;
  von: string;
  bis: string;
};

/** Die Anzeigewerte der Flaeche: der Filter plus die Seitenzahl. */
export type AusleihenSuchWerte = AusleihenFilterWerte & { seite: number };

/** Der leere Filter — der Zustand des Zuruecksetzen-Knopfes. */
export const LEERER_AUSLEIHEN_FILTER: AusleihenFilterWerte = { geraet: "", von: "", bis: "" };

/** Format eines Kalendertags in der Adresszeile. */
const TAG_MUSTER = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Format UND echter Kalendertag.
 *
 * ⛔ DIE ZWEITE HAELFTE IST DIE TRAGENDE: `2026-02-31` ist formatgerecht und existiert nicht.
 * Eine blosse Formatpruefung liesse ihn durch, die Rechnung landete beim 3. Maerz, und der
 * Filter zeigte still zu viel. Dieselbe Strenge und dieselbe Begruendung wie in
 * `src/app/m/lagerbuch/_lib/format.ts` (`grenze`).
 */
export function istKalendertag(tag: string): boolean {
  if (!TAG_MUSTER.test(tag)) return false;
  const [jahr, monat, tagZahl] = tag.split("-").map(Number) as [number, number, number];
  if (monat < 1 || monat > 12 || tagZahl < 1) return false;
  // `Date.UTC(jahr, monat, 0)` ist der letzte Tag des Monats `monat` (1-basiert).
  return tagZahl <= new Date(Date.UTC(jahr, monat, 0)).getUTCDate();
}

type Zivil = { jahr: number; monat: number; tag: number; std: number; min: number; sek: number };

/**
 * Absoluter Zeitpunkt → Zivilzeit in `ZONE`.
 *
 * ⛔ DER FORMATIERER ENTSTEHT JE AUFRUF UND NICHT AUF MODULEBENE — dieselbe Auflage und
 * derselbe gemessene Grund wie in `_lib/anzeige.ts`: ein auf Modulebene gebauter
 * `Intl.DateTimeFormat` haette seine Zone aufgeloest, BEVOR der Fall „die Zone haengt nicht an
 * der Zone des Prozesses" (`_lib/suchparameter.test.ts`) die Prozesszone dreht — der Fall
 * waere gruen, ohne etwas zu pruefen.
 */
function zonenTeile(at: Date): Zivil {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone: ZONE,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    })
      .formatToParts(at)
      .map((t) => [t.type, t.value]),
  ) as Record<string, string>;
  return {
    jahr: Number(p.year),
    monat: Number(p.month),
    tag: Number(p.day),
    // `% 24` ist Guertel und Hosentraeger: manche ICU-Fassungen liefern trotz `hourCycle: "h23"`
    // fuer Mitternacht die 24 (Vorbild `src/app/m/lagerbuch/_lib/zeit.ts`).
    std: Number(p.hour) % 24,
    min: Number(p.minute),
    sek: Number(p.second),
  };
}

/** Versatz der Zone zum Zeitpunkt `at`, in Minuten (positiv = oestlich von UTC). */
function zonenVersatzMinuten(at: Date): number {
  const t = zonenTeile(at);
  const alsUtc = Date.UTC(t.jahr, t.monat - 1, t.tag, t.std, t.min, t.sek);
  const ohneMs = at.getTime() - (((at.getTime() % 1000) + 1000) % 1000);
  return Math.round((alsUtc - ohneMs) / 60000);
}

/**
 * Zivilzeit in `ZONE` → absoluter Zeitpunkt.
 *
 * ⛔ ZWEI KANDIDATEN, NICHT EINE EINSTUFIGE NAEHERUNG. Der Versatz haengt vom Ergebnis ab, und
 * an den zwei Umstellungstagen ist er innerhalb DESSELBEN Tages verschieden: ein Versatz, der
 * einmal (etwa zur Mittagszeit) abgelesen und auf beide Tagesraender angewandt wird, liegt am
 * letzten Maerz- und am letzten Oktobersonntag um eine Stunde daneben. Die Form ist die des
 * Hauses (`src/app/m/lagerbuch/_lib/zeit.ts`, `ausZivilzeit`) — ⛔ sie wird NACHGEBAUT und
 * nicht importiert: ein modulfremder `_lib/`-Import waere die Bindung, die `_lib/anzeige.ts`
 * fuer dieselbe Frage (die Zone) bereits nicht eingegangen ist.
 *
 * ⚠️ Fuer 00:00:00 und 23:59:59.999 ist die Wahl zwischen den Kandidaten folgenlos — keiner
 * der beiden faellt je in den Berliner Umstellungsrand. Der Rueckfall auf den GROESSEREN
 * Kandidaten steht trotzdem da, damit die Funktion fuer jede Eingabe einen Wert hat.
 */
function ausZivilzeit(
  jahr: number,
  monat1bis12: number,
  tag: number,
  std: number,
  min: number,
  sek: number,
  ms: number,
): Date {
  const naiv = Date.UTC(jahr, monat1bis12 - 1, tag, std, min, sek, ms);
  const kandidaten = [
    naiv - zonenVersatzMinuten(new Date(naiv - 86_400_000)) * 60_000,
    naiv - zonenVersatzMinuten(new Date(naiv + 86_400_000)) * 60_000,
  ].sort((a, b) => a - b);
  for (const k of kandidaten) {
    const t = zonenTeile(new Date(k));
    if (
      t.jahr === jahr &&
      t.monat === monat1bis12 &&
      t.tag === tag &&
      t.std === std &&
      t.min === min &&
      t.sek === sek
    ) {
      return new Date(k);
    }
  }
  return new Date(kandidaten[kandidaten.length - 1]!);
}

/**
 * Die INKLUSIVEN Raender eines Kalendertags `YYYY-MM-DD` als absolute Zeitpunkte.
 *
 * ⛔ `bis` IST DAS TAGESENDE UND NICHT DER TAGESANFANG. `leihhistorie` vergleicht
 * `lte(borrowedAt, bis)` gegen einen Zeitstempel (`_db/leihen.ts`); waere `bis` Mitternacht,
 * fiele jede Leihe heraus, die an diesem Tag ueberhaupt ausgeliehen wurde — `von = bis =
 * heute` ergaebe eine leere Liste, und kein Typ, kein Lint und kein Build saehe es.
 */
export function tagesGrenzen(tag: string): { von: Date; bis: Date } {
  const [jahr, monat, tagZahl] = tag.split("-").map(Number) as [number, number, number];
  return {
    von: ausZivilzeit(jahr, monat, tagZahl, 0, 0, 0, 0),
    bis: ausZivilzeit(jahr, monat, tagZahl, 23, 59, 59, 999),
  };
}

/**
 * Die rohen Parameter der Adresszeile in die skalaren Anzeigewerte UND den Lesefilter
 * trennen — dieselbe Zweiteilung wie `geraeteParameterAus` oben.
 *
 * ⛔ EIN VERWORFENES DATUM VERSCHWINDET AUS BEIDEN HAELFTEN. Bliebe die rohe Zeichenkette in
 * `werte` stehen, zeigte das Datumsfeld einen Zeitraum an, nach dem gar nicht gefiltert wird —
 * der stille Ausgang, den `src/app/m/lagerbuch/_lib/format.ts` fuer denselben Fall
 * ausschreibt („ein gespeicherter Link mit defektem `von` liefert die Seite OHNE Fehlermeldung
 * und UNGEFILTERT").
 *
 * ⛔ `seitenGroesse` STEHT HIER NICHT. Sie ist eine andere Zahl als die der Geraeteliste und
 * hat einen anderen Beleg (`LoanList.tsx:8` gegen `DeviceList.tsx:28`); sie lebt im Lesepfad
 * (`_lib/lesepfade/ausleihen.ts`), und eine zweite Fassung hier liefe auseinander.
 */
export function ausleihenParameterAus(roh: RohSuchparameter): {
  werte: AusleihenSuchWerte;
  parameter: AusleihenParameter;
} {
  const geraet = skalar(roh.geraet);

  const vonRoh = skalar(roh.von);
  const bisRoh = skalar(roh.bis);
  const von = istKalendertag(vonRoh) ? vonRoh : "";
  const bis = istKalendertag(bisRoh) ? bisRoh : "";

  const seiteZahl = Number.parseInt(skalar(roh.seite), 10);
  const seite = Number.isFinite(seiteZahl) && seiteZahl >= 1 ? seiteZahl : 1;

  const werte: AusleihenSuchWerte = { geraet, von, bis, seite };

  const parameter: AusleihenParameter = {
    // ⛔ `|| undefined`, NICHT `?? undefined`: die Datenfunktion prueft auf WAHRHEIT
    // (`_db/leihen.ts`, `if (f.geraeteId)`, 1:1 aus `loanRepo.ts:139`) — eine leere Id darf
    // sie gar nicht erst erreichen.
    geraeteId: geraet || undefined,
    von: von ? tagesGrenzen(von).von : undefined,
    bis: bis ? tagesGrenzen(bis).bis : undefined,
    seite,
  };

  return { werte, parameter };
}

/**
 * Die Werte als Patch fuer die Adresszeile — ⛔ MIT ALLEN VIER SCHLUESSELN, auch den leeren.
 * Derselbe Grund wie bei `suchparameterZu` oben (`DeviceList.tsx:77-78`): die Insel schreibt
 * in eine BESTEHENDE Adresszeile, und ein Patch nur der gesetzten Werte liesse den geleerten
 * Filter dort stehen.
 */
export function ausleihenSuchparameterZu(werte: AusleihenSuchWerte): Record<string, string> {
  // ⛔ DIE VIER SCHLUESSEL STEHEN HIER UND IN `ausleihenParameterAus` — und der Waechter
  // darueber ist NICHT eine dritte, exportierte Liste (die waere selbst die dritte
  // handgepflegte Aufzaehlung, Ruling R-V11-1), sondern der Fall „der Patch fuehrt ALLE vier
  // Schluessel, auch die leeren" in `_lib/suchparameter.test.ts`: er prueft das Ergebnis mit
  // `toEqual`, nicht die Liste.
  return {
    geraet: werte.geraet,
    von: werte.von,
    bis: werte.bis,
    // Seite 1 ist die Vorgabe und gehoert nicht in die Adresszeile.
    seite: werte.seite > 1 ? String(werte.seite) : "",
  };
}
