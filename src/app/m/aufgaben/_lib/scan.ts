/**
 * Die modul-eigene Scan-Warteschlange (Aufgabe 18, Spec §2 letzter Absatz,
 * §5.3, §6 `datei`, §7).
 *
 * MODUL-EIGEN, OBWOHL `files` EINE AUSGEWACHSENE HAT: `files`s Warteschlange
 * ist die Datenbank von `files` (`AvTabelle`, `av_status = 'scanning'`); die
 * Suite hat eine SQLite PRO Modul. Ein geteilter Arbeiter muesste mehrere
 * Datenbanken oeffnen und eine Auftragsreihenfolge ueber sie fuehren — neue
 * Architektur, keine Verschiebung. Aufgabe 17 hat deshalb nur das clamd-
 * PROTOKOLL nach `@/core/av/scanner` gehoben (`scanne`, `registriereNetzhaken`);
 * diese Datei ist der `aufgaben`-eigene Teil ueber der EINEN Tabelle `dateien`.
 *
 * `registriereNetzhaken()` wird HIER NICHT noch einmal aufgerufen — er ist
 * bereits prozessweit aus `src/instrumentation.ts` registriert (Aufgabe 17)
 * und idempotent durch sein eigenes `netzhakenGesetzt`-Flag. Eine zweite
 * Registrierung waere die Verdopplung, vor der sein Kopfkommentar warnt.
 *
 * DIE ABSOLUTE ZUSAGE VON `scanne` GILT UNVERAENDERT: sie settelt immer und
 * genau einmal, wirft nie asynchron. Diese Datei unterlaeuft sie an KEINER
 * Stelle — es gibt kein `catch`, das ein Scan-Ergebnis in `sauber` uebersetzt,
 * und jede ausgewaehlte Zeile bekommt ENTWEDER ein geschriebenes Ergebnis ODER
 * eine LAUTE Logzeile (nie beides schweigend aus).
 *
 * WARUM KEIN TAKT MIT `setTimeout` WIE BEI `files`: `files/_lib/av.ts` haelt
 * einen prozessweiten Timer am Leben, der alle `FILES_AV_WIEDERHOLUNG_SEKUNDEN`
 * feuert — angemessen bei einer Warteschlange, die staendig etwas zu tun haben
 * kann. Bei drei BuFDis und ein paar Bildern pro Woche waere ein ewiger Timer
 * reiner Leerlauf. Stattdessen: `bearbeiteOffeneDateien` LEERT die
 * Warteschlange in einem Durchlauf und KEHRT DANN ZURUECK — „ein Arbeiter, der
 * nichts findet, hoert auf" ist hier woertlich das Ende der Funktion, nicht
 * ein Zustand, den ein Flag festhalten muesste. Angestossen wird ein
 * Durchlauf zweimal: beim Boot (Wiederaufnahme liegen gebliebener `offen`-
 * Zeilen nach einem Absturz — siehe `starteAufgabenScanArbeiter`, verdrahtet
 * in `core/bootstrap.ts`) und nach jedem Upload (Aufgabe 19, ueber denselben
 * Aufruf). Zwei ueberlappende Aufrufe TEILEN sich denselben laufenden
 * Durchlauf (`laufenderDurchlauf`), statt einen zweiten zu starten — einfacher
 * als `files`s `inArbeit`-Set plus Nebenlaeufigkeitsschranke, und bei dieser
 * Groessenordnung ausreichend.
 *
 * KONFIGURATION KOMMT VON AUSSEN: `core/av` kennt keine Umgebungsvariable, und
 * dieses Modul liest seine EIGENEN (`AUFGABEN_AV_HOST/PORT/TIMEOUT_MS`), nie
 * die von `files` (`FILES_AV_*`) — eine geteilte Zahl waere eine Kopplung, die
 * niemand gewaehlt hat. Bewusst OHNE ein `_lib/grenzen.ts` nach dem Vorbild
 * von `files`: dessen Boot-Validierung mit Mindest-/Hoechstwerten je Zahl
 * lohnt sich fuer sechzehn Werte mit Kettenregeln; hier sind es drei, und
 * `core/av`s eigene `konfigFehler` faengt eine kaputte Zahl ohnehin fail-
 * closed ab (siehe `scanner.ts`-Kopfkommentar, Abschnitt „kaputte
 * Konfiguration").
 *
 * KEIN `"use client"` in dieser Datei. `istFreigegeben` ist genau der Name,
 * nach dem eine spaetere Oberflaeche (Aufgabe 19, Nachweiskarte) greifen wird
 * — importierte er `../_db/client` statisch, buendelte ein Client-Import
 * dieser Datei den GANZEN statischen Baum inklusive `better-sqlite3` in den
 * Browser (dieselbe Falle wie in `files/_lib/av.ts`, dort ausfuehrlich
 * begruendet). Deshalb kommen Datenbank und Tabelle nur als TYP und per
 * dynamischem Import herein.
 */
import { and, asc, eq } from "drizzle-orm";

import { scanne as scanneKern, type AvErgebnis, type AvKonfig } from "@/core/av/scanner";

import { nachweisPfad } from "./ablage";
import type { ScanStatus } from "../_db/schema";

/**
 * DIE Freigabepruefung. Genau EIN Wert gibt frei — dieselbe fail-closed-Linie
 * wie `istFreigegeben` im Modul `files`: `offen` ist die Vorbelegung und gibt
 * ausdruecklich NICHT frei, `befund` und `fehler` sind getrennte Werte, weil
 * „Scan lief schief" etwas anderes ist als ein Befund, aber BEIDE liefern
 * nicht aus.
 */
export function istFreigegeben(status: ScanStatus): boolean {
  return status === "sauber";
}

const AV_HOST_VORGABE = "clamav";
const AV_PORT_VORGABE = 3310;
const AV_TIMEOUT_MS_VORGABE = 60_000;

function ganzzahlAus(roh: string | undefined, vorgabe: number): number {
  if (roh === undefined || roh.trim() === "") return vorgabe;
  const text = roh.trim();
  if (!/^[+-]?\d+$/.test(text)) return vorgabe;
  return Number(text);
}

/**
 * Die eigenen Zahlen des Moduls, bei JEDEM Aufruf gelesen (dieselbe Form wie
 * `files/_lib/grenzen.ts` und `core/db`). Eine unguelige Zahl fuehrt HIER zu
 * keinem Fehler — sie wird an `scanne` weitergereicht, und dessen
 * `konfigFehler` ist die eine Stelle, die eine kaputte Konfiguration fail-
 * closed in ein `{art:"error"}` uebersetzt (siehe `scanner.ts`). Ein zweiter
 * Pruefweg hier waere die zweite Fassung derselben Bedingung.
 */
export function avKonfigAusEnv(env: Record<string, string | undefined> = process.env): AvKonfig {
  return {
    host: env.AUFGABEN_AV_HOST?.trim() || AV_HOST_VORGABE,
    port: ganzzahlAus(env.AUFGABEN_AV_PORT, AV_PORT_VORGABE),
    timeoutMs: ganzzahlAus(env.AUFGABEN_AV_TIMEOUT_MS, AV_TIMEOUT_MS_VORGABE),
  };
}

/** Was ein Durchlauf an EINER Zeile entschieden hat. `grund` fehlt genau bei `sauber`. */
export interface ScanBefund {
  readonly id: string;
  readonly status: "sauber" | "befund" | "fehler";
  readonly grund?: string;
}

// Datenbank und Tabelle kommen NUR als Typ und per dynamischem Import herein —
// Begruendung im Kopfkommentar.
export type AufgabenDb = ReturnType<typeof import("../_db/client").getDb>;

async function holeTabelle() {
  const { dateien } = await import("../_db/schema");
  return dateien;
}

async function holeDb(db: AufgabenDb | undefined): Promise<AufgabenDb> {
  if (db !== undefined) return db;
  const { getDb } = await import("../_db/client");
  return getDb();
}

/** Der sprechende Teil eines Ergebnisses — `clean` hat keinen, und das ist der Punkt. */
function ergebnisGrund(ergebnis: AvErgebnis): string {
  if (ergebnis.art === "infected") return ergebnis.signatur;
  if (ergebnis.art === "error") return ergebnis.grund;
  return "";
}

function statusFuer(ergebnis: AvErgebnis): "sauber" | "befund" | "fehler" {
  if (ergebnis.art === "clean") return "sauber";
  if (ergebnis.art === "infected") return "befund";
  return "fehler";
}

/**
 * Eine Zeile scannen und das Ergebnis schreiben — mit `scan_status = 'offen'`
 * als Vorbehalt im WHERE. Bei dieser Groessenordnung (ein Prozess, kein
 * zweiter Schreiber) sollte dieser Vorbehalt nie greifen; er steht hier aus
 * demselben Grund wie in `files/_lib/av.ts`: BILLIG und eine zweite Linie,
 * falls doch einmal zwei Aufrufe dieselbe Zeile erreichen.
 *
 * Wirft NICHT weiter: ein Fehler beim Schreiben (die Datenbank ist gesperrt,
 * etwa) wird geloggt, und die Zeile bleibt `offen` fuer den naechsten
 * Durchlauf — das ist der einzige Fall, in dem eine Zeile laenger als noetig
 * `offen` bleibt, und er ist LAUT, nicht still.
 */
async function verarbeiteZeile(
  db: AufgabenDb,
  tabelle: Awaited<ReturnType<typeof holeTabelle>>,
  zeile: { id: string },
  konfig: AvKonfig,
): Promise<ScanBefund | null> {
  let ergebnis: AvErgebnis;
  try {
    // `nachweisPfad` wirft NUR bei einer verdorbenen `id` (`UngueltigeId`) — ein
    // Datenfehler, kein Netzwerkfehler; `scanneKern` selbst wirft nie (siehe
    // `core/av/scanner.ts`). Trotzdem: OHNE dieses `try` bliebe eine Zeile mit
    // verdorbener `id` ohne Ergebnis 'offen' stecken UND risse den ganzen
    // Durchlauf ab, statt nur diese eine Zeile als 'fehler' zu markieren.
    ergebnis = await scanneKern(nachweisPfad(zeile.id), konfig);
  } catch (fehler) {
    const grund = fehler instanceof Error ? fehler.message : String(fehler);
    console.error(`[aufgaben][scan] Pfad für Datei ${zeile.id} ungültig: ${grund}`);
    ergebnis = { art: "error", grund };
  }
  const status = statusFuer(ergebnis);

  if (ergebnis.art === "infected") {
    console.error(`[aufgaben][scan] Fund in Datei ${zeile.id}: ${ergebnis.signatur}`);
  } else if (ergebnis.art === "error") {
    console.error(`[aufgaben][scan] Prüfung nicht möglich für Datei ${zeile.id}: ${ergebnis.grund}`);
  }

  try {
    const treffer = db
      .update(tabelle)
      .set({ scanStatus: status, scanGeprueftAm: new Date() })
      .where(and(eq(tabelle.id, zeile.id), eq(tabelle.scanStatus, "offen")))
      .run();
    if (treffer.changes === 0) {
      console.error(`[aufgaben][scan] Datei ${zeile.id} war nicht mehr 'offen' — Ergebnis verworfen`);
      return null;
    }
  } catch (fehler) {
    console.error(
      `[aufgaben][scan] Ergebnis für Datei ${zeile.id} konnte nicht geschrieben werden — ` +
        `sie bleibt 'offen' für den nächsten Durchlauf:`,
      fehler,
    );
    return null;
  }

  return { id: zeile.id, status, grund: ergebnisGrund(ergebnis) || undefined };
}

/**
 * EIN Durchlauf: alles, was gerade `offen` ist, in Erstellungsreihenfolge
 * (mit ID als Stichentscheid — dieselbe Begruendung wie `files/_lib/av.ts`:
 * `erstellt_am` ist in SEKUNDEN, mehrere Dateien in derselben Sekunde brauchen
 * eine deterministische Reihenfolge). SEQUENZIELL, nicht parallel — bei „ein
 * paar Bildern pro Woche" waere eine Nebenlaeufigkeitsschranke wie
 * `FILES_AV_PARALLEL` eine Antwort auf eine Frage, die dieses Modul nicht
 * stellt.
 *
 * Endet, sobald die Auswahl leer ist — „ein Arbeiter, der nichts findet,
 * hoert auf" ist damit woertlich erfuellt: es gibt keinen Zustand, den ein
 * `stoppe...()` beenden muesste, weil die Funktion selbst endet.
 */
async function fuehreDurchlaufAus(db: AufgabenDb, konfig: AvKonfig): Promise<ScanBefund[]> {
  const tabelle = await holeTabelle();
  const befunde: ScanBefund[] = [];

  for (;;) {
    const offene = db
      .select({ id: tabelle.id })
      .from(tabelle)
      .where(eq(tabelle.scanStatus, "offen"))
      .orderBy(asc(tabelle.erstelltAm), asc(tabelle.id))
      .all();
    if (offene.length === 0) return befunde;

    for (const zeile of offene) {
      const befund = await verarbeiteZeile(db, tabelle, zeile, konfig);
      if (befund !== null) befunde.push(befund);
    }
    // Zurueck zum SELECT: waehrend dieses Durchlaufs koennen neue `offen`-
    // Zeilen entstanden sein (ein weiterer Upload). Der naechste Durchlauf
    // dieser Schleife holt sie, statt auf einen externen Anstoss zu warten.
  }
}

/** Teilt ueberlappende Aufrufe denselben laufenden Durchlauf statt einen zweiten zu starten. */
let laufenderDurchlauf: Promise<ScanBefund[]> | null = null;

/**
 * Verarbeitet die Warteschlange bis sie leer ist und gibt jeden Befund
 * zurueck. Wirft weiter, wenn `fuehreDurchlaufAus` selbst einen unerwarteten
 * Fehler hat (z. B. `holeDb`/`holeTabelle` schlagen fehl) — Aufrufer, die das
 * nicht behandeln wollen, nutzen `starteAufgabenScanArbeiter` weiter unten.
 */
export function bearbeiteOffeneDateien(
  db?: AufgabenDb,
  konfig: AvKonfig = avKonfigAusEnv(),
): Promise<ScanBefund[]> {
  if (laufenderDurchlauf !== null) return laufenderDurchlauf;
  const durchlauf = (async () => {
    const bank = await holeDb(db);
    return fuehreDurchlaufAus(bank, konfig);
  })();
  laufenderDurchlauf = durchlauf.finally(() => {
    laufenderDurchlauf = null;
  });
  return laufenderDurchlauf;
}

/**
 * Synchron, wirft NIE — fuer den Boot-Pfad (`core/bootstrap.ts`,
 * `startBackgroundWork`) und fuer den Upload-Weg (Aufgabe 19), die beide kein
 * Promise entgegennehmen wollen. Dieselbe Form wie `files/_lib/av.ts:reiheAvEin`.
 *
 * Die erste Runde nach dem Boot IST die Wiederaufnahme: eine Zeile, die beim
 * letzten Prozessende mitten im Scan stand, steht als `offen` da und wird
 * hier gefunden — ohne diesen Aufruf bliebe sie fuer immer stehen.
 */
export function starteAufgabenScanArbeiter(db?: AufgabenDb): void {
  void bearbeiteOffeneDateien(db).catch((fehler) => {
    console.error("[aufgaben][scan] ein Durchlauf der Warteschlange ist gescheitert:", fehler);
  });
}
