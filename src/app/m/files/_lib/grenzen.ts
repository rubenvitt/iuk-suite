/**
 * Alle Zahlen des Moduls `files` an EINER Stelle, und jeder Name traegt seine
 * Einheit (Spec §9.3, §9.4).
 *
 * WARUM DIE EINHEIT IM NAMEN STEHT und nicht in einem Kommentar (Analyse Falle
 * 22, Spec §9.1): die beiden Alt-Anwendungen fuehren dieselbe Grenze unter
 * `MAX_FILE_SIZE` (Byte) und `MAX_FILE_SIZE_MB` (MB) und erzwingen sie heute
 * gemessen IDENTISCH (`500 * 1024 * 1024 === 524288000`) — die Kollision ist
 * damit unsichtbar. Ueberlebt der drop-Name mit dem Fileshare-Wert, ist die
 * Grenze 524.288.000 MB und praktisch aufgehoben; ueberlebt der
 * Fileshare-Name mit dem drop-Wert, ist sie 500 Byte und jeder Upload wird
 * abgelehnt. Beide Werte sind `number`, beide Zuweisungen typkorrekt: Build,
 * Typecheck und Vitest koennen den Unterschied nicht sehen. Nur der Name kann
 * es.
 *
 * KEIN `"use client"` in dieser Datei. Die Zahlen liest sowohl eine Server
 * Component als auch eine Client-Insel — und ein WERT aus einem Client-Modul
 * kommt in einer Server Component nicht an, sondern als Client-Referenz
 * (`docs/design/README.md:87-103`; HTTP 500 fuer die ganze Seite, das
 * `pnpm build` nicht sieht und Vitest strukturell nicht sehen KANN).
 *
 * DIESE DATEI HAELT KEINE HOSTREGEL UND KEINE ABLAGE-PROBE. Von den sechs
 * Boot-Pruefungen aus §9.4 gehoeren 1–4 hierher; Pruefung 5
 * (`validateFilesHosts`) liegt in `_lib/hostRolle.ts`, Pruefung 6 (die
 * Ablage-Probe) in `_lib/storage.ts`. Zusammengesetzt werden alle drei in
 * `_lib/boot.ts` — nicht hier.
 */

import { getModule, prodHostsFor } from "@/core/registry";

/** Wie in `core/hosts.ts`: nur „String rein, String oder undefined raus". */
type EnvLike = Record<string, string | undefined>;

/**
 * 4 MiB, und zwar eine KONSTANTE statt einer Env-Variable.
 *
 * Sie ist die Untergrenze gegen den Next-Default `proxyClientMaxBodySize` =
 * 10 MiB (`node_modules/next/dist/server/config-shared.js:260`): oberhalb
 * bricht `cloneBodyStream` ab, schiebt `null` in BEIDE Streams und gibt nur
 * ein `console.warn` aus (`server/body-streams.js:85-101`) — eine stille
 * Kappung, die im Container-Log als Warnung erscheint und sonst nirgends. Das
 * ist eine Zahl, die wir ohne Server kennen, also keine Betreiberfrage.
 *
 * Per Env herabsetzbar zu sein waere schaedlich: die Chunk-Groesse ist der
 * Grund, warum die Kappungsebenen 1 (Cloudflare, 100 MB) und 2 (Next-Proxy)
 * aus dem Spiel sind und `FILES_MAX_DATEI_BYTES` die einzige wirksame Grenze
 * ist (§9.2).
 */
export const FILES_CHUNK_BYTES = 4 * 1024 * 1024;

/** Der Hinweistext der anonymen Abgabe, in Code Points (§8.3). Konstante. */
export const FILES_HINWEIS_MAX_ZEICHEN = 500;

/** Fehlversuche pro Minute am Passwort-Gate (§8.4). Konstante. */
export const FILES_FEHLVERSUCHE_PRO_MIN = 10;

/** Die Einheit, die in JEDE Meldung zu dieser Variable gehoert. */
type Einheit =
  | "Bytes"
  | "Tage"
  | "Stunden"
  | "Minuten"
  | "Sekunden"
  | "Millisekunden"
  | "Anzahl"
  // Eigenes Glied und NICHT als „Anzahl" mitgezaehlt: eine Notbremse ohne
  // Bezugszeitraum ist keine Zahl, die man einordnen kann (Spec §9.3). Der Preis
  // ist, dass `"Anzahl"` ein Praefix davon ist — die Meldungspruefung im Test
  // sucht deshalb MIT Abschlusszeichen (`in Bytes.`, `(Einheit: Bytes)`).
  | "Anzahl/10 min"
  | "Port";

/**
 * Wie eine fehlende Variable zu lesen ist. Drei Faelle, und der Unterschied
 * zwischen dem zweiten und dem dritten traegt eine Fachaussage:
 * - `pflicht`  — es gibt KEINE Vorbelegung, der Boot bricht ab (§9.3),
 * - `wert`     — die Vorbelegung aus §9.3 gilt,
 * - `ohne`     — die Abwesenheit selbst ist die Aussage („keine Frist").
 */
type Vorbelegung = { art: "pflicht" } | { art: "wert"; wert: number } | { art: "ohne" };

interface ZahlRegel {
  readonly einheit: Einheit;
  readonly min: number;
  readonly max?: number;
  readonly vorbelegung: Vorbelegung;
}

const PFLICHT: Vorbelegung = { art: "pflicht" };
const OHNE: Vorbelegung = { art: "ohne" };
function wert(w: number): Vorbelegung {
  return { art: "wert", wert: w };
}

/**
 * Die Tabelle aus §9.3, vollstaendig — die EINZIGE Quelle. `grenzen()` und
 * `grenzenFehler()` lesen beide von hier; zwei Tabellen waeren zwei
 * Wahrheiten, und die Boot-Pruefung pruefte dann etwas anderes als das, was
 * zur Laufzeit gilt.
 *
 * Die Mindestwerte: `0` steht dort, wo die Spec 0 ausdruecklich erlaubt
 * (§9.4 Pruefung 4: Loesch-Karenz und AV-Wiederholung), sonst `1`. Eine 0 in
 * einer Aufbewahrungs- oder Verfallsfrist waere „sofort loeschen" — ein
 * Schalter mit grosser Wirkung, der wie eine Zahl aussieht.
 */
const ZAHLEN = {
  FILES_MAX_DATEI_BYTES: { einheit: "Bytes", min: 1, vorbelegung: PFLICHT },
  // KEINE Vorbelegung aus FILES_MAX_DATEI_BYTES: dieselbe Zahl an zwei
  // Bedeutungen (Annahme- und Scangrenze) machte die Kette aus §6.6 zur
  // Tautologie und verdeckte genau die Kollision aus §9.1.
  FILES_AV_MAX_BYTES: { einheit: "Bytes", min: 1, vorbelegung: PFLICHT },
  FILES_MAX_ABLAUF_TAGE: { einheit: "Tage", min: 1, vorbelegung: PFLICHT },
  FILES_MAX_DATEIEN_PRO_SHARE: { einheit: "Anzahl", min: 1, vorbelegung: wert(200) },
  FILES_VORSCHAU_MAX_BYTES: { einheit: "Bytes", min: 1, vorbelegung: wert(5 * 1024 * 1024) },
  FILES_LOESCH_KARENZ_STUNDEN: { einheit: "Stunden", min: 0, vorbelegung: wert(24) },
  FILES_UPLOAD_VERFALL_STUNDEN: { einheit: "Stunden", min: 1, vorbelegung: wert(24) },
  FILES_LOG_AUFBEWAHRUNG_TAGE: { einheit: "Tage", min: 1, vorbelegung: wert(90) },
  // `ohne`: keine Frist ist das heutige Verhalten von `drop`. Eine 0 waere
  // „sofort loeschen" und damit ein zweiter Ausdruck fuer etwas anderes.
  FILES_INBOX_AUFBEWAHRUNG_TAGE: { einheit: "Tage", min: 1, vorbelegung: OHNE },
  FILES_INBOX_BUDGET_DATEIEN: { einheit: "Anzahl", min: 1, vorbelegung: wert(100) },
  FILES_INBOX_BUDGET_BYTES: { einheit: "Bytes", min: 1, vorbelegung: wert(2 * 1024 * 1024 * 1024) },
  // Einheit MIT Bezugszeitraum (Spec §9.3, Tabellenzeile): „600 Anfragen" allein
  // liesse offen, woran gemessen wird — und genau diese Meldung liest der
  // Betreiber, wenn der Boot abbricht.
  FILES_IP_ANFRAGEN_PRO_10MIN: { einheit: "Anzahl/10 min", min: 1, vorbelegung: wert(600) },
  FILES_AV_PORT: { einheit: "Port", min: 1, max: 65535, vorbelegung: wert(3310) },
  FILES_AV_TIMEOUT_MS: { einheit: "Millisekunden", min: 1, vorbelegung: wert(60_000) },
  FILES_AV_VERSUCHE: { einheit: "Anzahl", min: 1, vorbelegung: wert(5) },
  FILES_AV_WIEDERHOLUNG_SEKUNDEN: { einheit: "Sekunden", min: 0, vorbelegung: wert(60) },
  FILES_AV_PARALLEL: { einheit: "Anzahl", min: 1, vorbelegung: wert(2) },
  FILES_AUFRAEUMEN_TAKT_MINUTEN: { einheit: "Minuten", min: 1, vorbelegung: wert(60) },
} as const satisfies Record<string, ZahlRegel>;

type ZahlName = keyof typeof ZAHLEN;

/**
 * Die NAMEN der Zahl-Variablen — und ausdruecklich nur sie, nicht `ZAHLEN`
 * selbst.
 *
 * Der Test in `grenzen.test.ts` fuehrt eine eigene Tabelle mit Einheitenwort,
 * Mindest- und Hoechstwert je Variable und vergleicht sie gegen diese Liste. So
 * faellt eine hier ergaenzte Zeile auf, die dort fehlt (und umgekehrt) — ohne
 * dass der Test seine Erwartungswerte aus der Implementierung zieht. Wer `ZAHLEN`
 * exportierte, machte aus dem Test eine Tautologie: er pruefte den Code gegen
 * sich selbst und blieb auch bei falscher Einheit gruen.
 *
 * Genau das war hier der Fall: die Einheit von `FILES_IP_ANFRAGEN_PRO_10MIN`
 * stand als „Anzahl" im Code, waehrend Spec §9.3 „Anzahl/10 min" verlangt. Die
 * unabhaengige Testtabelle hat es gefunden.
 */
export const ZAHL_NAMEN: readonly ZahlName[] = Object.keys(ZAHLEN) as ZahlName[];

/** Die Werte, mit denen das Modul arbeitet. Jeder Feldname traegt seine Einheit. */
export interface Grenzen {
  readonly maxDateiBytes: number;
  readonly avMaxBytes: number;
  readonly maxAblaufTage: number;
  readonly maxDateienProShare: number;
  readonly vorschauMaxBytes: number;
  readonly loeschKarenzStunden: number;
  readonly uploadVerfallStunden: number;
  readonly logAufbewahrungTage: number;
  /** `null` = keine Frist (heutiges Verhalten von `drop`), nicht „0 Tage". */
  readonly inboxAufbewahrungTage: number | null;
  readonly inboxBudgetDateien: number;
  readonly inboxBudgetBytes: number;
  readonly ipAnfragenPro10Min: number;
  readonly avHost: string;
  readonly avPort: number;
  readonly avTimeoutMs: number;
  readonly avVersuche: number;
  readonly avWiederholungSekunden: number;
  readonly avParallel: number;
  readonly aufraeumenTaktMinuten: number;
  readonly aufraeumenTrockenlauf: boolean;
}

/**
 * Die Konfiguration traegt eine Zahl, mit der das Modul nicht arbeiten kann.
 * Ein eigener Typ, damit ein Aufrufer ihn von einem Betriebsfehler
 * unterscheiden kann — er ist immer ein Konfigurationsfehler.
 */
export class GrenzenUngueltig extends Error {
  constructor(botschaft: string) {
    super(botschaft);
    this.name = "GrenzenUngueltig";
  }
}

const AV_HOST_VORBELEGUNG = "clamav";

/**
 * Ganze Dezimalzahl mit optionalem Vorzeichen — bewusst NICHT `Number()`.
 * `Number("0x10")` ist 16 und `Number.isInteger(16)` wahr: eine Pruefung ueber
 * `Number` allein liesse Hex und `1e7` durch, und die geltende Grenze waere
 * eine andere als die, die in der .env steht.
 */
const GANZZAHL = /^[+-]?\d+$/;

const SCHALTER_AN = ["1", "true"];
const SCHALTER_AUS = ["0", "false"];

interface Auswertung {
  readonly zahlen: Readonly<Record<ZahlName, number | null>>;
  readonly avHost: string;
  readonly trockenlauf: boolean;
  readonly fehler: string[];
}

/**
 * Pruefungen 1–4 aus §9.4, UNBEDINGT — die Bedingtheit sitzt in
 * `grenzenFehler`, nicht hier: `grenzen()` braucht dieselbe Auswertung ohne
 * Gate, sonst gaebe es zwei Auswertungen und damit zwei Wahrheiten.
 *
 * Reihenfolge ist Absicht: erst lesen und je Variable pruefen, DANN die Ketten
 * 2 und 3 — und die nur, wenn ihre Operanden sauber gelesen wurden. Sonst
 * meldete eine fehlende Pflichtzahl zusaetzlich „NaN ist kleiner als …", und
 * an der Meldung waere nicht mehr ablesbar, welche Zeile in der .env fehlt.
 */
function auswerten(env: EnvLike): Auswertung {
  const fehler: string[] = [];
  const zahlen = {} as Record<ZahlName, number | null>;

  for (const name of Object.keys(ZAHLEN) as ZahlName[]) {
    const regel: ZahlRegel = ZAHLEN[name];
    const roh = env[name];

    // Leer gesetzt gilt wie nicht gesetzt: `FILES_MAX_ABLAUF_TAGE=` ist der
    // haeufigere Fall als die fehlende Zeile, und `Number("")` waere 0.
    if (roh === undefined || roh.trim() === "") {
      if (regel.vorbelegung.art === "pflicht") {
        fehler.push(
          `${name} fehlt: Pflichtangabe in ${regel.einheit}, ohne Vorbelegung. ` +
            `Eine erfundene Vorbelegung waere hier gefaehrlicher als ein Startabbruch (Spec §9.3).`,
        );
        zahlen[name] = null;
      } else if (regel.vorbelegung.art === "wert") {
        zahlen[name] = regel.vorbelegung.wert;
      } else {
        zahlen[name] = null;
      }
      continue;
    }

    const text = roh.trim();
    if (!GANZZAHL.test(text)) {
      fehler.push(`${name}="${roh}" ist keine ganze Zahl in ${regel.einheit}.`);
      zahlen[name] = null;
      continue;
    }

    const zahl = Number(text);
    if (zahl < regel.min) {
      fehler.push(
        `${name}=${zahl} liegt unter dem Mindestwert ${regel.min} (Einheit: ${regel.einheit}).`,
      );
      zahlen[name] = null;
      continue;
    }
    if (regel.max !== undefined && zahl > regel.max) {
      fehler.push(
        `${name}=${zahl} liegt ueber dem Hoechstwert ${regel.max} (Einheit: ${regel.einheit}).`,
      );
      zahlen[name] = null;
      continue;
    }
    zahlen[name] = zahl;
  }

  // Pruefung 2: die Chunk-Groesse ist eine KONSTANTE, keine Env-Variable —
  // sonst liesse sich die Pruefung genau dort ausschalten, wo sie traegt.
  const maxDatei = zahlen.FILES_MAX_DATEI_BYTES;
  if (maxDatei !== null && FILES_CHUNK_BYTES >= maxDatei) {
    fehler.push(
      `FILES_CHUNK_BYTES (${FILES_CHUNK_BYTES} Bytes) muss KLEINER sein als ` +
        `FILES_MAX_DATEI_BYTES (${maxDatei} Bytes) — bei Gleichstand passte genau ein Chunk ` +
        `in eine Datei, und der chunked Upload waere unbenutzbar (Spec §9.4 Pruefung 2).`,
    );
  }

  // Pruefung 3: Gleichheit ist erlaubt. Ohne diese Kette aeussert sich die
  // Verletzung nicht als „Datei zu gross", sondern als AV-Fehler — und der
  // Betreiber sucht in der falschen Schicht (§6.6).
  const avMax = zahlen.FILES_AV_MAX_BYTES;
  if (maxDatei !== null && avMax !== null && maxDatei > avMax) {
    fehler.push(
      `FILES_MAX_DATEI_BYTES (${maxDatei} Bytes) darf FILES_AV_MAX_BYTES (${avMax} Bytes) ` +
        `nicht ueberschreiten — sonst landet jede Datei dazwischen fail-closed im AV-Fehler ` +
        `statt in einer benannten Groessenmeldung (Spec §9.4 Pruefung 3).`,
    );
  }

  const rohHost = env.FILES_AV_HOST?.trim();
  let avHost = AV_HOST_VORBELEGUNG;
  if (rohHost !== undefined && rohHost !== "") {
    // Dieselbe Linie wie `validateHostConfig` (`hosts.ts:78-86`): ohne sie
    // waere `clamav:3310` ein Hostname, den kein DNS aufloest — und der Befund
    // lautete `ECONNREFUSED clamav:3310:3310` statt „Tippfehler in der .env".
    if (rohHost.includes(":") || rohHost.includes("/") || /\s/.test(rohHost)) {
      fehler.push(
        `FILES_AV_HOST="${rohHost}" muss ein reiner Hostname sein — ohne Protokoll und ohne ` +
          `Port. Der Port gehoert in FILES_AV_PORT.`,
      );
    } else {
      avHost = rohHost;
    }
  }

  const rohSchalter = env.FILES_AUFRAEUMEN_TROCKENLAUF?.trim().toLowerCase();
  let trockenlauf = false;
  if (rohSchalter !== undefined && rohSchalter !== "") {
    if (SCHALTER_AN.includes(rohSchalter)) {
      trockenlauf = true;
    } else if (!SCHALTER_AUS.includes(rohSchalter)) {
      // Ein unbekannter Wert wird NICHT still zu „aus". Ein Trockenlauf, der
      // sich fuer einen echten Loeschlauf haelt, ist der teuerste denkbare
      // Fall dieses Moduls — und der Betreiber saehe in der .env „an".
      fehler.push(
        `FILES_AUFRAEUMEN_TROCKENLAUF="${rohSchalter}" ist kein Schalterwert. ` +
          `Erlaubt: ${[...SCHALTER_AN, ...SCHALTER_AUS].join(", ")} oder leer.`,
      );
    }
  }

  return { zahlen, avHost, trockenlauf, fehler };
}

/**
 * Die Pruefliste fuer den Boot (§9.4, Pruefungen 1–4) — LEER, solange das
 * Modul keinen Prod-Host hat.
 *
 * Die Bedingtheit ist keine Milderung, sondern eine Notwendigkeit:
 * `assertHostConfig()` laeuft aus `instrumentation.ts:11` fuer die GANZE Suite
 * und VOR den Migrationen aller Module. Eine unbedingte Pflicht hiesse: sobald
 * ein Image mit `files` auf dem Server landet, startet die Suite nicht mehr —
 * `portal`, `qr` und `feedback` inklusive —, bis der Betreiber die .env
 * ergaenzt hat. Damit blockierte dieses Modul jeden unbeteiligten Deploy im
 * Fenster zwischen Merge und Cutover.
 *
 * Der Schalter ist DIESELBE Variable, die das Modul einschaltet
 * (`SUITE_HOST_FILES` ueber `prodHostsFor`) — es gibt keinen zweiten, den
 * jemand vergessen kann. Gelesen wird ueber `prodHostsFor`, NIE
 * `mod.prodHosts` direkt (`registry.ts:28-34`; genau so entstand
 * Post-Cutover-Befund 2).
 */
export function grenzenFehler(env: EnvLike = process.env): string[] {
  const erreichbar = prodHostsFor(getModule("files"), env).length > 0;
  if (!erreichbar) return [];
  return auswerten(env).fehler;
}

/**
 * Die geltenden Zahlen. Wirft `GrenzenUngueltig`, wenn die Konfiguration
 * nicht taugt — und zwar UNABHAENGIG von der Hostliste, anders als
 * `grenzenFehler`.
 *
 * Der Unterschied ist Absicht: `moduleForHost` trifft `files.localtest.me`
 * unabhaengig von `prodHosts` (`registry.ts:141-148`), ein Entwickler ohne
 * `SUITE_HOST_FILES` erreicht das Modul also trotzdem. Er bekommt hier einen
 * BENANNTEN Fehler mit dem Variablennamen statt einer still vorbelegten
 * Grenze — der Unterschied zwischen einer Logzeile und einem halben Tag.
 *
 * Gelesen wird bei JEDEM Aufruf, nicht beim Import (dieselbe Form wie
 * `DATA_DIR` in `core/db` und `_lib/storage.ts`): ein modulweit
 * festgehaltener Wert waere in Tests und beim Boot eine stille Falle.
 */
export function grenzen(env: EnvLike = process.env): Grenzen {
  const { zahlen, avHost, trockenlauf, fehler } = auswerten(env);
  if (fehler.length > 0) {
    throw new GrenzenUngueltig(`[files] Ungueltige Grenzen:\n  - ${fehler.join("\n  - ")}`);
  }

  // Nach der Fehlerpruefung ist jede Zahl mit Pflicht oder Vorbelegung
  // gesetzt. `muss` haelt das fest, statt es mit `!` zu behaupten: ein
  // spaeterer Umbau, der einen Zweig ohne Fehlermeldung entstehen laesst,
  // wirft dann laut statt `NaN` weiterzugeben.
  const muss = (name: ZahlName): number => {
    const w = zahlen[name];
    if (w === null) throw new GrenzenUngueltig(`[files] ${name} ist nicht gesetzt`);
    return w;
  };

  return {
    maxDateiBytes: muss("FILES_MAX_DATEI_BYTES"),
    avMaxBytes: muss("FILES_AV_MAX_BYTES"),
    maxAblaufTage: muss("FILES_MAX_ABLAUF_TAGE"),
    maxDateienProShare: muss("FILES_MAX_DATEIEN_PRO_SHARE"),
    vorschauMaxBytes: muss("FILES_VORSCHAU_MAX_BYTES"),
    loeschKarenzStunden: muss("FILES_LOESCH_KARENZ_STUNDEN"),
    uploadVerfallStunden: muss("FILES_UPLOAD_VERFALL_STUNDEN"),
    logAufbewahrungTage: muss("FILES_LOG_AUFBEWAHRUNG_TAGE"),
    inboxAufbewahrungTage: zahlen.FILES_INBOX_AUFBEWAHRUNG_TAGE,
    inboxBudgetDateien: muss("FILES_INBOX_BUDGET_DATEIEN"),
    inboxBudgetBytes: muss("FILES_INBOX_BUDGET_BYTES"),
    ipAnfragenPro10Min: muss("FILES_IP_ANFRAGEN_PRO_10MIN"),
    avHost,
    avPort: muss("FILES_AV_PORT"),
    avTimeoutMs: muss("FILES_AV_TIMEOUT_MS"),
    avVersuche: muss("FILES_AV_VERSUCHE"),
    avWiederholungSekunden: muss("FILES_AV_WIEDERHOLUNG_SEKUNDEN"),
    avParallel: muss("FILES_AV_PARALLEL"),
    aufraeumenTaktMinuten: muss("FILES_AUFRAEUMEN_TAKT_MINUTEN"),
    aufraeumenTrockenlauf: trockenlauf,
  };
}
