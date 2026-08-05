/**
 * Alle Zahlen des Moduls `lagerbuch` an EINER Stelle, und jeder Name traegt
 * seine Einheit (§10.1, §10.3).
 *
 * KEIN "use client" in dieser Datei. Die Zahlen liest sowohl eine Server
 * Component (`verwaltung/artikel/page.tsx`) als auch eine Client-Insel (die
 * Zaehl-Liste) — und ein WERT aus einem Client-Modul kommt in einer Server
 * Component nicht an, sondern als Client-Referenz (Falle 6, `CLAUDE.md:24-27`).
 * HTTP 500 fuer die ganze Seite, das `pnpm build` nicht sieht und Vitest
 * strukturell nicht sehen KANN, weil "use client" dort ein wirkungsloser String
 * ist.
 *
 * DIESE DATEI HAELT KEINE MILLIMETER. Die Druckgeometrie des Etikettenbogens
 * (§8.4) ist CSS-Geometrie und gehoert dorthin; was Server- und Client-Seite
 * beide brauchen, liegt in `_lib/etikettMasse.ts`. Sie hier zu spiegeln erzeugte
 * eine zweite Wahrheit, die niemand gegen das Papier prueft.
 *
 * DIESE DATEI HAELT AUCH KEINE BOOT-PRUEFUNG. `grenzenFehler()` (§10.5) und
 * `_lib/boot.ts` entstehen in TEIL 3 und lesen dieselbe ZAHLEN-Tabelle von hier
 * — zwei Tabellen waeren zwei Wahrheiten, und der Boot pruefte etwas anderes als
 * das, was zur Laufzeit gilt.
 */

import { getModule, prodHostsFor } from "@/core/registry";

/** Wie in `core/hosts.ts`: nur „String rein, String oder undefined raus". */
type EnvLike = Record<string, string | undefined>;

/**
 * Die Konfiguration traegt einen Wert, mit dem das Modul nicht arbeiten kann.
 * Ein EIGENER Typ, damit ein Aufrufer ihn von einem Betriebsfehler unterscheiden
 * kann — er ist immer ein Konfigurationsfehler, nie ein Laufzeitproblem.
 */
export class GrenzenUngueltig extends Error {
  constructor(botschaft: string) {
    super(botschaft);
    this.name = "GrenzenUngueltig";
  }
}

/** Die Einheit, die in JEDE Meldung zu dieser Variable gehoert (§10.1). */
type Einheit = "Tage" | "Stunden" | "Anzahl/min" | "Anzahl/h";

interface ZahlRegel {
  readonly einheit: Einheit;
  readonly min: number;
  readonly max: number;
  readonly vorgabe: number;
}

/**
 * Die Tabelle aus §10.3, vollstaendig — die EINZIGE Quelle. `grenzen()` und (ab
 * Teil 3) `grenzenFehler()` lesen beide von hier.
 *
 * ⚠️ LAGERBUCH_BACKUP_AUFBEWAHRUNG_TAGE FEHLT mit Absicht. Entscheidung 22
 * (Backup-Job) ist offen; bis zur Betreiberantwort gilt Annahme A31 der Spec —
 * Variante (a), kein Hintergrund-Eintrag, Variable entfaellt ersatzlos. Faellt
 * die Antwort anders aus, ergaenzt Teil 3 EINE Zeile hier UND eine in der
 * unabhaengigen Testtabelle in `grenzen.test.ts`; nur eine von beiden macht den
 * Test rot, und das ist der Sinn der Doppelfuehrung.
 */
const ZAHLEN = {
  // Zu klein: Chargen laufen ab, ohne je rot gewesen zu sein — die Ampel warnt
  // zu spaet, und niemand merkt es, weil sie ja etwas anzeigt.
  LAGERBUCH_VERFALL_ROT_TAGE: { einheit: "Tage", min: 1, max: 3650, vorgabe: 31 },
  // Obergrenze 3650, weil die Kopplungspruefung allein ROT=9999, GELB=99999
  // durchliesse — und das ist eine Ampel, die immer leuchtet.
  LAGERBUCH_VERFALL_GELB_TAGE: { einheit: "Tage", min: 1, max: 3650, vorgabe: 56 },
  // Obergrenze 24: eine Feldsitzung darf nie laenger dauern als eine Schicht plus
  // Puffer. Der Wert steht ZWEIMAL in derselben Sitzung — als JWT-`exp` und als
  // Cookie-`maxAge` (§3.4.3); ein verlorenes Kaertchen gibt dem Finder genau so
  // lange Lesezugriff auf den gesamten Bestand, wie diese Zahl sagt.
  LAGERBUCH_HELFER_SITZUNG_STUNDEN: { einheit: "Stunden", min: 1, max: 24, vorgabe: 12 },
  // 1:1 die heutige Zusage (`lagerbuch/src/lib/auth/rateLimit.ts:4-5`). Der Eimer
  // wird ab jetzt NUR bei Fehlversuchen verbraucht (§3.5.3) — dieselbe Zahl ist
  // damit deutlich grosszuegiger als heute.
  LAGERBUCH_GATE_VERSUCHE_PRO_ABSENDER_PRO_MIN: { einheit: "Anzahl/min", min: 1, max: 60, vorgabe: 5 },
  // Die modulweite Burst-Kappe gegen Rotation des Absenderschluessels.
  // 30 = sechs Absender-Budgets.
  LAGERBUCH_GATE_FEHLVERSUCHE_GESAMT_PRO_MIN: { einheit: "Anzahl/min", min: 1, max: 600, vorgabe: 30 },
  // DER tragende Zaehler. 300 = 5/min x 60 — die Zahl stellt genau die Zusage
  // wieder her, die das Per-Absender-Limit nur unter der Annahme einer
  // wahrhaftigen Absenderadresse je hatte.
  // ⚠️ Runbook: `select count(*) from tokens where aktiv = 1`; liegt die Zahl
  // oberhalb von etwa 60, gehoert dieser Wert gesenkt.
  LAGERBUCH_GATE_FEHLVERSUCHE_GESAMT_PRO_STUNDE: { einheit: "Anzahl/h", min: 1, max: 3600, vorgabe: 300 },
} as const satisfies Record<string, ZahlRegel>;

type ZahlName = keyof typeof ZAHLEN;

/**
 * Die NAMEN der Zahl-Variablen — und ausdruecklich nur sie, nicht `ZAHLEN`
 * selbst.
 *
 * `grenzen.test.ts` fuehrt eine EIGENE Tabelle mit Einheit, Mindest- und
 * Hoechstwert je Variable und vergleicht sie gegen diese Liste. So faellt eine
 * hier ergaenzte Zeile auf, die dort fehlt (und umgekehrt) — ohne dass der Test
 * seine Erwartungswerte aus der Implementierung zieht. Wer `ZAHLEN` exportierte,
 * machte aus dem Test eine Tautologie: er pruefte den Code gegen sich selbst und
 * bliebe auch bei falscher Einheit gruen (§10.8, Eigenschaft 2).
 */
export const ZAHL_NAMEN: readonly ZahlName[] = Object.keys(ZAHLEN) as ZahlName[];

/** Die Werte, mit denen das Modul arbeitet. Jeder Feldname traegt seine Einheit. */
export interface Grenzen {
  readonly verfallRotTage: number;
  readonly verfallGelbTage: number;
  readonly helferSitzungStunden: number;
  readonly gateProAbsenderProMin: number;
  readonly gateGesamtProMin: number;
  readonly gateGesamtProStunde: number;
}

/**
 * Ganze Dezimalzahl mit optionalem Vorzeichen — bewusst NICHT `Number()`.
 * `Number("0x10")` ist 16 und `Number.isInteger(16)` wahr: eine Pruefung ueber
 * `Number` allein liesse Hex und `1e7` durch, und die GELTENDE Grenze waere eine
 * andere als die, die in der .env steht (Vorbild `files/_lib/grenzen.ts:199`).
 */
const GANZZAHL = /^[+-]?\d+$/;

/**
 * Eine Zahl aus der Umgebung — oder ihre Vorbelegung.
 *
 * LEER GESETZT GILT WIE NICHT GESETZT. `LAGERBUCH_VERFALL_ROT_TAGE=` ist der
 * haeufigere Fall als die fehlende Zeile (jemand raeumt eine .env auf), und
 * `Number("")` waere 0 — eine Ampel, die sofort rot ist, oder ein Gate-Limit,
 * das jeden abweist.
 */
function zahl(name: ZahlName, env: EnvLike): number {
  const regel = ZAHLEN[name];
  const roh = env[name]?.trim();
  if (roh === undefined || roh === "") return regel.vorgabe;
  if (!GANZZAHL.test(roh)) {
    throw new GrenzenUngueltig(
      `${name}="${roh}" ist keine ganze Zahl. Erwartet: ${regel.min} bis ${regel.max} ` +
        `(${regel.einheit}).`,
    );
  }
  const wert = Number.parseInt(roh, 10);
  if (wert < regel.min || wert > regel.max) {
    throw new GrenzenUngueltig(
      `${name}=${wert} liegt ausserhalb von ${regel.min} bis ${regel.max} (${regel.einheit}).`,
    );
  }
  return wert;
}

/**
 * Die geltenden Werte. GELESEN WIRD BEI JEDEM AUFRUF, nicht beim Import
 * (§10.8, Eigenschaft 3) — dieselbe Form wie `DATA_DIR` in `core/db` und wie
 * `files/_lib/grenzen.ts:368`.
 *
 * KEINE KOPPLUNGSPRUEFUNG hier. „ROT <= GELB" und die Gate-Ungleichungskette
 * sind BOOT-Pruefungen (§10.5) und liegen ab Teil 3 in `grenzenFehler()`: der
 * Boot will ALLE Fehler auf einmal melden, nicht den ersten, und `grenzen()`
 * muss dieselbe Auswertung ohne Gate liefern koennen — sonst gaebe es zwei
 * Auswertungen und damit zwei Wahrheiten.
 */
export function grenzen(env: EnvLike = process.env): Grenzen {
  return {
    verfallRotTage: zahl("LAGERBUCH_VERFALL_ROT_TAGE", env),
    verfallGelbTage: zahl("LAGERBUCH_VERFALL_GELB_TAGE", env),
    helferSitzungStunden: zahl("LAGERBUCH_HELFER_SITZUNG_STUNDEN", env),
    gateProAbsenderProMin: zahl("LAGERBUCH_GATE_VERSUCHE_PRO_ABSENDER_PRO_MIN", env),
    gateGesamtProMin: zahl("LAGERBUCH_GATE_FEHLVERSUCHE_GESAMT_PRO_MIN", env),
    gateGesamtProStunde: zahl("LAGERBUCH_GATE_FEHLVERSUCHE_GESAMT_PRO_STUNDE", env),
  };
}

/**
 * Das Sitzungsgeheimnis — PFLICHT, und deshalb ausdruecklich KEINE Zeile in
 * `ZAHLEN` und kein Feld von `Grenzen`.
 *
 * WARUM DIE TRENNUNG TRAEGT: alle sechs Zahlen haben eine Vorbelegung, `grenzen()`
 * laeuft also auf einer leeren Umgebung klaglos durch — und genau das braucht
 * `next build`, das mit NODE_ENV=production und OHNE Secrets laeuft und dabei
 * `gateSchranke.ts` importiert, wo `grenzen()` auf Modulebene steht. Zoege man
 * das Geheimnis in dieselbe Auswertung, braeche `pnpm build`, und kein Kapitel
 * dieser Spec sonst faengt das ab (§10.8, Eigenschaft 3).
 *
 * DIESE FUNKTION LAEUFT ZUR ANFRAGEZEIT. Ihr einziger Aufrufer ist
 * `_lib/helferSitzung.ts`, und zwar in einem Thunk, nicht auf Modulebene.
 *
 * SIE PRUEFT NUR „gesetzt und nicht leer". Mindestlaenge, Dev-Default und die
 * Ungleichheit zu AUTH_SECRET sind BOOT-Pruefungen (§10.5, Pruefung 4) und
 * gehoeren zu `grenzenFehler()` in Teil 3 — ein zu kurzes Geheimnis waehrend
 * eines Cutover-Abends abzulehnen machte aus einer Konfigurationswarnung einen
 * Ausfall JEDER laufenden Feld-Sitzung, an einer Stelle, an der niemand die
 * Meldung liest.
 */
export function helferSitzungGeheimnis(env: EnvLike = process.env): string {
  const wert = env.LAGERBUCH_HELFER_SITZUNG_SECRET?.trim();
  if (!wert) {
    throw new GrenzenUngueltig(
      `LAGERBUCH_HELFER_SITZUNG_SECRET ist nicht gesetzt oder leer. Ohne das Geheimnis ` +
        `kann keine Helfer-Sitzung ausgestellt oder geprueft werden. Der Wert wird beim ` +
        `Cutover 1:1 aus der alten stack.env uebernommen (HELFER_SESSION_SECRET) und ` +
        `ueber env_file gesetzt, nicht als \${VAR:?}-Zeile in der compose.yaml.`,
    );
  }
  return wert;
}

/* ──────────────────────────────────────────────────────────────────────────
 * DIE DREI REINEN DECKEL (§5.14.3, §10.3) — Konstanten, keine Env-Variablen.
 * ────────────────────────────────────────────────────────────────────────── */

/**
 * Sie stehen HIER und nicht neben ihrer Abfrage, weil ZWEI Leser denselben Wert
 * brauchen: die Abfrage (`limit(GRENZE + 1)`) und der Beschreibungstext („Neueste
 * 100 von mehr Treffern"). Heute stehen die 100 an zwei Stellen
 * (`queries.ts:87`, `journal/page.tsx:32`) und koennen auseinanderlaufen — und
 * der Text ist UNBEDINGT: er behauptet die 100 auch dann, wenn drei Zeilen
 * zurueckkommen.
 *
 * SIE WERDEN NICHT KONFIGURIERBAR (§10.3). Es sind heute Vorgabewerte, die KEIN
 * Aufrufer je ueberschreibt. Ein Regler daran bei 5000 liesse die Journalseite bei
 * realer Datenmenge stehen — und `better-sqlite3` ist SYNCHRON, die Seite
 * blockierte dabei die GANZE Suite: portal, qr, feedback und files antworten in
 * dieser Zeit nicht (Falle 10, §5.2.3).
 *
 * Gelesen wird `GRENZE + 1`, angezeigt `GRENZE`, und der Hinweis erscheint NUR,
 * wenn die Grenze tatsaechlich griff.
 */
export const JOURNAL_GRENZE = 100;
/** Dieselbe Regel — und der strengere Fall: die Checks-Seite nennt ihre 50 heute
 *  an KEINER Stelle (§5.14.3). */
export const CHECK_GRENZE = 50;
/** dito (`lagerbuch/src/db/bz.ts:124`). */
export const BZ_LOGBUCH_GRENZE = 100;
/**
 * Der VIERTE Deckel — der Buchungsverlauf im Artikel-Detail.
 *
 * ⚠️ Er stand bis zuletzt als nackte `8` in `lesepfade/artikel.ts`, und die
 * Abfrage holte ALLE Buchungen des Artikels und schnitt erst in JS ab. Genau die
 * teure Klasse, gegen die dieses Kapitel geschrieben ist: `better-sqlite3` ist
 * SYNCHRON, ein Vollladen blockiert die GANZE Suite, nicht nur dieses Modul —
 * und ein Artikel mit langer Historie faehrt das bei jedem Seitenaufruf.
 */
export const ARTIKEL_VERLAUF_GRENZE = 8;

/* ──────────────────────────────────────────────────────────────────────────
 * DIE BOOT-LISTE (§10.5, Pruefungen 1 bis 4).
 * ────────────────────────────────────────────────────────────────────────── */

/** Der Wert, den die Alt-Anwendung als Entwicklungs-Vorbelegung fuehrte
 *  (`lagerbuch/src/lib/config.ts:104-113`). Er darf produktiv nie stehen. */
const DEV_GEHEIMNIS = "dev-insecure-secret-change-me";

/** §10.3: „≥ 32 Zeichen". Die Zahl steht hier EINMAL und in der Meldung. */
const GEHEIMNIS_MINDESTLAENGE = 32;

/**
 * Die Konfigurationsfehler dieses Moduls, als Liste statt als Wurf.
 *
 * ⚠️ SIE SAMMELT, SIE WIRFT NICHT. `grenzen()` WIRFT bei einem kaputten Wert; hier
 * wird der Wurf ABGEFANGEN und in eine Zeichenkette verwandelt. Sonst meldete der
 * Boot den ERSTEN Fehler statt aller, und der Betreiber faehrt drei Deploys fuer
 * drei Tippfehler. Der Aufrufer (`_lib/boot.ts` → `assertHostConfig`) entscheidet,
 * ob aus der Liste ein Abbruch wird.
 *
 * ⚠️ SIE GREIFT NUR, WENN DAS MODUL ERREICHBAR IST, und das ist keine Milderung,
 * sondern eine Notwendigkeit (§10.5): `assertHostConfig()` laeuft fuer die GANZE
 * Suite. Eine unbedingte Pflicht hiesse — sobald ein Image mit lagerbuch auf dem
 * Server landet, startet die Suite nicht mehr, portal, qr, feedback und files
 * inklusive. Der Schalter ist DIESELBE Variable, die das Modul einschaltet
 * (`SUITE_HOST_LAGERBUCH` ueber `prodHostsFor`); es gibt keinen zweiten, den
 * jemand vergessen kann.
 *
 * ⚠️ GELESEN WIRD UEBER `prodHostsFor(...)`, NIE UEBER `mod.prodHosts`. Der
 * Registry-Eintrag traegt `prodHosts: []`; der Feldzugriff machte
 * `SUITE_HOST_LAGERBUCH` an genau dieser Stelle wirkungslos, und alle vier
 * Pruefungen liefen nie. Dieselbe Falle wie `adminGroupsFor(mod)` gegen
 * `mod.adminGroups` (Teil 2, §2).
 *
 * ⚠️ DIESE DATEI HAELT DIE PRUEFUNGEN 5 UND 6 NICHT. `SUITE_ADMIN_GROUP_LAGERBUCH`
 * ist gesetzt (5) und `SUITE_ACCESS_GROUP_LAGERBUCH` ist NICHT gesetzt (6) sind
 * GRUPPEN-Fragen, keine Zahlen-Fragen; sie liegen in `_lib/boot.ts`, das diese
 * Liste einsammelt.
 */
export function grenzenFehler(env: EnvLike = process.env): string[] {
  if (prodHostsFor(getModule("lagerbuch"), env).length === 0) return [];
  const fehler: string[] = [];

  // Pruefung 1 — ganzzahlig und im Bereich. Jede Zahl EINZELN auswerten, damit
  // ein kaputter Wert die uebrigen nicht verdeckt.
  const werte: Partial<Record<ZahlName, number>> = {};
  for (const name of ZAHL_NAMEN) {
    try {
      werte[name] = zahl(name, env);
    } catch (e) {
      fehler.push(e instanceof GrenzenUngueltig ? e.message : String(e));
    }
  }

  // Pruefung 2 — ROT <= GELB. Nur, wenn BEIDE Werte gelesen werden konnten;
  // sonst waere die Meldung eine Folge des schon gemeldeten Fehlers.
  const rot = werte.LAGERBUCH_VERFALL_ROT_TAGE;
  const gelb = werte.LAGERBUCH_VERFALL_GELB_TAGE;
  if (rot !== undefined && gelb !== undefined && rot > gelb) {
    fehler.push(
      `LAGERBUCH_VERFALL_ROT_TAGE=${rot} ist groesser als LAGERBUCH_VERFALL_GELB_TAGE=${gelb}. ` +
        `Erlaubt ist ROT <= GELB — sonst ist der Gelb-Zweig unerreichbar und die Ampel hat ` +
        `zwei Zustaende statt drei ("kritisch" ist das KLEINERE Fenster, §10.1).`,
    );
  }

  // Pruefung 3 — die Gate-Kette. Bricht das erste Glied, fuellt ein einzelner
  // Absender die Gesamtbremse, bevor sein eigener Eimer leer ist; bricht das
  // zweite, ist der Stundendeckel wirkungslos.
  const absender = werte.LAGERBUCH_GATE_VERSUCHE_PRO_ABSENDER_PRO_MIN;
  const proMin = werte.LAGERBUCH_GATE_FEHLVERSUCHE_GESAMT_PRO_MIN;
  const proStunde = werte.LAGERBUCH_GATE_FEHLVERSUCHE_GESAMT_PRO_STUNDE;
  if (absender !== undefined && proMin !== undefined && absender > proMin) {
    fehler.push(
      `LAGERBUCH_GATE_VERSUCHE_PRO_ABSENDER_PRO_MIN=${absender} ist groesser als ` +
        `LAGERBUCH_GATE_FEHLVERSUCHE_GESAMT_PRO_MIN=${proMin}. Dann fuellt ein einzelner ` +
        `Absender die modulweite Bremse, bevor sein eigener Eimer leer ist — die Reihenfolge ` +
        `der Bremsen waere umgekehrt zur Absicht (§3.5.3).`,
    );
  }
  if (proMin !== undefined && proStunde !== undefined && proMin > proStunde) {
    fehler.push(
      `LAGERBUCH_GATE_FEHLVERSUCHE_GESAMT_PRO_MIN=${proMin} ist groesser als ` +
        `LAGERBUCH_GATE_FEHLVERSUCHE_GESAMT_PRO_STUNDE=${proStunde}. Dann ist der ` +
        `Stundendeckel wirkungslos — und er ist der tragende Zaehler (§3.5.3).`,
    );
  }

  // Pruefung 4 — das Sitzungsgeheimnis, fuenf Bedingungen. Die ersten vier sind
  // `assertProductionSecrets` (`config.ts:104-113`) an seinem neuen Ort; die
  // fuenfte ist neu und kostet eine Zeile.
  const geheim = env.LAGERBUCH_HELFER_SITZUNG_SECRET?.trim() ?? "";
  const authSecret = env.AUTH_SECRET?.trim() ?? "";
  if (geheim === "") {
    fehler.push(
      `LAGERBUCH_HELFER_SITZUNG_SECRET ist nicht gesetzt oder leer. jose verweigert einen ` +
        `Nullschluessel ("Zero-length key is not supported"); ohne diesen Riegel bootet der ` +
        `Container gruen und faellt erst beim ersten /t/<code>-Scan mit 500 um — das Scheitern ` +
        `waere von der Startzeit in die Nutzungszeit gewandert. Der Wert kommt beim Cutover ` +
        `1:1 aus der alten stack.env (HELFER_SESSION_SECRET), ueber env_file gesetzt.`,
    );
  } else {
    if (geheim.length < GEHEIMNIS_MINDESTLAENGE) {
      fehler.push(
        `LAGERBUCH_HELFER_SITZUNG_SECRET ist ${geheim.length} Zeichen lang, mindestens ` +
          `${GEHEIMNIS_MINDESTLAENGE} sind gefordert.`,
      );
    }
    if (geheim === DEV_GEHEIMNIS) {
      fehler.push(
        `LAGERBUCH_HELFER_SITZUNG_SECRET traegt den Entwicklungs-Vorgabewert ` +
          `"${DEV_GEHEIMNIS}". Er ist im Repo nachlesbar und damit kein Geheimnis.`,
      );
    }
    if (authSecret !== "" && geheim === authSecret) {
      fehler.push(
        `LAGERBUCH_HELFER_SITZUNG_SECRET ist identisch mit AUTH_SECRET. Damit gaebe es keine ` +
          `Domaenentrennung mehr zwischen Suite-Sitzung und Helfer-Sitzung — dieselbe Signatur ` +
          `truege zwei Bedeutungen (§3.4.1). AUTH_SECRET gehoert der Suite und bleibt ` +
          `unveraendert (§10.6, Abweichung 1).`,
      );
    }
  }

  return fehler;
}
