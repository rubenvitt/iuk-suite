/**
 * Die BOOT-NAHT des Moduls `files` — zwei Funktionen, zwei Zeitpunkte
 * (Spec §9.4, §6.4, §7.6).
 *
 * `filesBootFehler()` laeuft VOR den Migrationen, in derselben Fehlerliste wie
 * `validateHostConfig`/`validateGroupConfig` (`core/bootstrap.ts`).
 * `starteFilesHintergrund()` laeuft NACH ihnen, weil der AV-Arbeiter Tabellen
 * liest.
 *
 * WARUM DIESE DATEI EXISTIERT UND DIE PRUEFUNGEN NICHT DORT STEHEN, WO SIE
 * IMPLEMENTIERT SIND: die sechs Pruefungen aus §9.4 liegen an drei Orten —
 * 1–4 in `_lib/grenzen.ts`, 5 in `_lib/hostRolle.ts`, 6 in `_lib/storage.ts`.
 * Jede dieser Dateien hat einen anderen Gegenstand (Zahlen, Hostrollen,
 * Ablage); zusammengesetzt werden sie genau hier, damit `core/bootstrap.ts`
 * EINEN Namen des Moduls kennt statt drei.
 *
 * KEIN `"use client"`. Diese Datei wird ausschliesslich vom Server-Boot
 * gelesen — und ein Wert aus einem Client-Modul kommt in einer Server Component
 * nicht an (`docs/design/README.md:87-103`).
 */

import { readdir } from "node:fs/promises";
import { resolve } from "node:path";
import { eq, inArray, isNull, lte, or } from "drizzle-orm";

import { getModule, prodHostsFor } from "@/core/registry";

import { getDb } from "../_db/client";
import {
  aufraeumLaeufe,
  downloadLogs,
  inboxFiles,
  shareFiles,
  shares,
} from "../_db/schema";
import {
  planeAufraeumen,
  type Aufraeumzahlen,
  type Aufraeumplan,
  type DateiKandidat,
} from "./aufraeumen";
import { grenzen, grenzenFehler, type Grenzen } from "./grenzen";
import { validateFilesHosts } from "./hostRolle";
import { fortschritt, loesche, loescheShareVerzeichnis, pruefeAblage, type BlobZiel } from "./storage";
import { starteAvArbeiter } from "./av";

/**
 * Die Pruefliste des Moduls fuer den Boot — leer heisst „in Ordnung".
 *
 * `async`, weil Pruefung 6 die Ablage tatsaechlich anfasst (anlegen,
 * schreiben, zuruecklesen, loeschen). Das faerbt `assertHostConfig()` mit ein;
 * ein `readFileSync`-Nachbau waere eine zweite Ablage-Implementierung und damit
 * genau der Ort, an dem Boot-Probe und Betrieb auseinanderlaufen.
 *
 * BEDINGT sind die Pruefungen 1–4 und 6, UNBEDINGT ist Pruefung 5:
 * - 1–4 (`grenzenFehler`) gaten sich selbst und lesen dazu dieselbe Variable
 *   wie hier (`grenzen.ts:348`) — bewusst DIESELBE, nicht eine zweite: ein
 *   zweiter Schalter waere einer, den jemand vergessen kann.
 * - 6 (die Ablage-Probe) gatet hier, weil sie eine NEBENWIRKUNG hat: ohne das
 *   Gate legte ein Modul, das niemand erreichen kann, auf jedem Suite-Boot ein
 *   Verzeichnis an und braechte den Start ab, wenn es das nicht darf.
 * - 5 (`validateFilesHosts`) laeuft IMMER: sie liest nur Konfiguration, hat
 *   keine Nebenwirkung und ist genau dann nuetzlich, wenn jemand die Hostliste
 *   gerade aendert — waere sie gegatet, meldete ein Tippfehler in
 *   `SUITE_HOST_FILES` sich erst, nachdem er wirkt.
 *
 * Warum die Bedingtheit keine Milderung ist: diese Kette laeuft aus
 * `src/instrumentation.ts` fuer die GANZE Suite, VOR den Migrationen aller
 * Module. Eine unbedingte Zahlenpflicht hiesse — sobald ein Image mit `files`
 * auf dem Server landet, startet `portal`, `qr` und `feedback` nicht mehr, bis
 * die .env ergaenzt ist. Das Modul blockierte damit jeden unbeteiligten Deploy
 * im Fenster zwischen Merge und Cutover.
 *
 * ALLE Fehler werden gesammelt statt beim ersten abgebrochen: der Betreiber
 * liest die Liste einmal und ergaenzt die .env einmal.
 *
 * WAS DER BOOT NICHT PRUEFEN KANN (Runbook, Spec 2): die WIRKSAME clamd-Kappe
 * (`clamconf -n` — ob der Sidecar `clamd.files.conf` geladen hat), die
 * Cloudflare-Grenze (Plan-Eigenschaft, nirgends im Repo) und den
 * konfigurierten Wert von `proxyClientMaxBodySize`.
 */
export async function filesBootFehler(): Promise<string[]> {
  const fehler = [...grenzenFehler(), ...validateFilesHosts()];

  if (prodHostsFor(getModule("files")).length > 0) {
    try {
      await pruefeAblage();
    } catch (grund) {
      fehler.push(grund instanceof Error ? grund.message : String(grund));
    }
  }

  return fehler;
}

/**
 * Der Startpunkt fuer alles, was im Modul `files` im Hintergrund laeuft —
 * gerufen NACH den Migrationen (`core/bootstrap.ts` →
 * `src/instrumentation.ts`), weil der AV-Arbeiter Tabellen liest.
 *
 * Ein Arbeiter ohne Startpunkt ist eine Warteschlange, die niemand abarbeitet:
 * die Uploads werden quittiert, alles bleibt auf `scanning`, und kein Test wird
 * rot (§6.4). Deshalb ist der Startpunkt benannt und hat einen Test.
 *
 * Idempotent, weil `register()` unter HMR mehr als einmal laeuft — die Wache
 * dagegen sitzt in `starteAvArbeiter` selbst.
 *
 * EIN CONTAINER, EIN ARBEITER — und dasselbe gilt fuer den Aufraeum-Timer, der
 * hier in T46 dazukommt. `compose.yaml` hat kein `deploy:`/`replicas:`; bei
 * mehreren Instanzen liefe der Takt mehrfach und braeuchte ein Lock. Wer
 * skaliert, muss diese Voraussetzung zuerst aufloesen.
 */
export function starteFilesHintergrund(): void {
  /*
   * WACHE VOR DEM START — sonst laeuft ein Modul, das gar nicht konfiguriert
   * ist, in eine unbegrenzte Fehlerschleife.
   *
   * Gemessen an einem 75-Sekunden-Dev-Lauf mit leerem `SUITE_HOST_FILES` und
   * ohne `FILES_`-Variablen: 16 von 22 Logzeilen waren `console.error`, naemlich
   * je vier Zeilen „uebersprungen, die Zahlen sind ungueltig: …" pro Runde und
   * pro Takt — und der Rueckfall-Takt wiederholt das alle 60 s, ohne Ende. Kein
   * `NODE_ENV`-Zweig davor, es traefe also auch die Produktion, und zwar genau
   * die Instanzen, auf denen `files` (noch) keinen Host hat.
   *
   * Die Wache kostet nichts: sind die Zahlen ungueltig UND ein Host gesetzt,
   * hat `filesBootFehler()` den Start ohnehin schon abgebrochen — dieser Zweig
   * wird dann nie erreicht. Er greift nur im gegenteiligen Fall, und dort ist
   * Schweigen richtig: ein Modul ohne Host soll nichts tun und nichts melden.
   */
  try {
    grenzen();
  } catch (grund) {
    console.info(
      "[files] Hintergrundarbeit nicht gestartet — das Modul ist auf dieser " +
        `Instanz nicht konfiguriert: ${grund instanceof Error ? grund.message : String(grund)}`,
    );
    return;
  }
  starteAvArbeiter();
  starteAufraeumTimer();
}

// ---------------------------------------------------------------------------
// Der Aufraeum-Timer (Spec §7.6) und der Lauf, den er ausloest (§4.8)
// ---------------------------------------------------------------------------

const MS_PRO_MINUTE = 60_000;
const MS_PRO_STUNDE = 3_600_000;
const STUNDEN_PRO_TAG = 24;

let aufraeumUhr: ReturnType<typeof setInterval> | undefined;
let aufraeumLaeuft = false;

/**
 * DER TAKT. `setInterval` und nicht `setTimeout`: der erste Lauf ist damit
 * VERZOEGERT (§7.6) und jeder weitere folgt im selben Abstand.
 *
 * Warum verzoegert: der Timer wird hinter den Migrationen registriert, also
 * mitten im Start der GANZEN Suite. Ein Lauf zum Zeitpunkt 0 laege im selben
 * Moment wie die erste Anfrage, und der ERSTE Lauf nach dem Cutover ist ein
 * Loeschereignis (§7.6) — er soll nicht zufaellig mit dem Deploy zusammenfallen,
 * sondern nach einem vollen Takt, in dem der Betreiber die Kachel sehen kann.
 *
 * `FILES_AUFRAEUMEN_TAKT_MINUTEN` sind MINUTEN — die Einheit steht im Namen
 * (§9.1), und `* 1000` statt `* 60_000` waere ein Takt von 60 Sekunden, der
 * unbemerkt 60-mal so oft loescht.
 *
 * IDEMPOTENT, weil `register()` unter HMR mehr als einmal laeuft: zwei Timer
 * waeren zwei Laeufe je Takt. **Ein Container, ein Timer** — `compose.yaml` hat
 * kein `deploy:`/`replicas:`; bei mehreren Instanzen liefe der Takt mehrfach und
 * braeuchte ein Lock.
 */
function starteAufraeumTimer(): void {
  if (aufraeumUhr !== undefined) return;
  aufraeumUhr = setInterval(() => {
    void taktLauf();
  }, grenzen().aufraeumenTaktMinuten * MS_PRO_MINUTE);
  // `unref`, damit ein Skript, das die Suite nur laedt, nicht am Timer haengt.
  aufraeumUhr.unref?.();
}

/** Haelt den Takt an. Exportiert, weil ein Modulzustand sonst den Test ueberlebt. */
export function stoppeAufraeumTimer(): void {
  if (aufraeumUhr !== undefined) clearInterval(aufraeumUhr);
  aufraeumUhr = undefined;
  aufraeumLaeuft = false;
}

/**
 * Ein Takt. Die Wache gegen Ueberlappung ist kein Luxus: ein Lauf, der laenger
 * dauert als der Takt, liefe sonst gegen sich selbst — zwei Laeufe loeschten
 * dieselben Zeilen, und beide zaehlten sie.
 */
async function taktLauf(): Promise<void> {
  if (aufraeumLaeuft) return;
  aufraeumLaeuft = true;
  try {
    await fuehreAufraeumLaufAus();
  } catch (grund) {
    // `fuehreAufraeumLaufAus` faengt selbst; hier bleibt nur, was beim Schreiben
    // der Protokollzeile schiefgeht. Eine Logzeile ist die Antwort, nicht das
    // Ende des Takts.
    console.error("[files] Aufraeumlauf konnte nicht protokolliert werden:", grund);
  } finally {
    aufraeumLaeuft = false;
  }
}

/** Was ein Lauf getan hat — dieselben Zahlen, die in der Protokollzeile stehen. */
export interface AufraeumLaufErgebnis {
  readonly laufId: number;
  readonly trockenlauf: boolean;
  readonly zahlen: Aufraeumzahlen & { readonly partsGeloescht: number };
  /** NULL = fehlerfrei; sonst der Grund im Klartext (§4.8). */
  readonly fehler: string | null;
}

/**
 * EIN AUFRAEUMLAUF, vom Timer und vom Knopf aus derselben Funktion (§7.6).
 *
 * DREI SCHRITTE, UND IHRE REIHENFOLGE IST DIE ZUSAGE:
 * 1. Die Protokollzeile entsteht ZUERST, mit `beendet_at` NULL. Waere sie am
 *    Ende geschrieben, hinterliesse ein Absturz mitten im Lauf gar keine Spur —
 *    und §4.8 verspricht, dass genau daran ein Absturz erkennbar ist.
 * 2. Gerechnet wird in `_lib/aufraeumen.ts`, mit EINER Uhr fuer den ganzen Lauf.
 *    Diese Funktion laedt und fuehrt aus; sie entscheidet nichts.
 * 3. Erst die BYTES, dann die ZEILEN. Bricht der Prozess dazwischen ab, bleibt
 *    eine Zeile ohne Bytes stehen — der naechste Lauf holt sie wieder ab. Die
 *    Gegenrichtung hinterliesse Bytes, die niemand mehr einer Zeile zuordnen
 *    kann, und die der Bericht dann als „verwaist" fuehrt.
 *
 * `nurVorschau` kann den Trockenlauf nur EINSCHALTEN, nie ausschalten:
 * `FILES_AUFRAEUMEN_TROCKENLAUF` ist die Sicherung fuer den ersten Lauf nach dem
 * Cutover, und ein Knopf, der sie ueberstimmt, hebt genau das auf, wofuer sie
 * gesetzt wurde.
 */
export async function fuehreAufraeumLaufAus(
  opts: { nurVorschau?: boolean } = {},
): Promise<AufraeumLaufErgebnis> {
  const g = grenzen();
  const trockenlauf = g.aufraeumenTrockenlauf || (opts.nurVorschau ?? false);
  const bank = getDb();
  const gestartet = new Date();

  const zeile = bank
    .insert(aufraeumLaeufe)
    .values({ gestartetAt: gestartet, beendetAt: null, trockenlauf })
    .returning({ id: aufraeumLaeufe.id })
    .get();

  let zahlen: Aufraeumzahlen = {
    sharesGeloescht: 0,
    dateienGeloescht: 0,
    bytesGeloescht: 0,
    logzeilenGeloescht: 0,
    inboxGeloescht: 0,
    verwaisteBlobsGemeldet: 0,
  };
  let partsGeloescht = 0;
  let fehler: string | null = null;

  try {
    const { plan, dateien } = await ladeUndPlane(g, gestartet, trockenlauf);
    /*
     * Die Zahlen stammen aus dem PLAN, nicht aus der Ausfuehrung — im
     * Trockenlauf gibt es keine Ausfuehrung, und nur so ist die Vorschau mit dem
     * echten Lauf vergleichbar (§4.8). Der Preis steht hier, damit ihn niemand
     * uebersieht: scheitert die Ausfuehrung auf halbem Weg, tragen die Spalten
     * das VORHABEN und `fehler` sagt, dass es nicht vollstaendig ausgefuehrt
     * wurde.
     */
    zahlen = plan.zahlen;
    partsGeloescht = await fuehreLoeschungAus(plan, dateien);
  } catch (grund) {
    fehler = grund instanceof Error ? grund.message : String(grund);
    // Laut, weil ein stumm gescheitertes Aufraeumen sich erst meldet, wenn das
    // Volume voll ist.
    console.error("[files] Aufraeumlauf gescheitert:", grund);
  }

  bank
    .update(aufraeumLaeufe)
    .set({
      beendetAt: new Date(),
      sharesGeloescht: zahlen.sharesGeloescht,
      dateienGeloescht: zahlen.dateienGeloescht,
      bytesGeloescht: zahlen.bytesGeloescht,
      logzeilenGeloescht: zahlen.logzeilenGeloescht,
      inboxGeloescht: zahlen.inboxGeloescht,
      partsGeloescht,
      verwaisteBlobsGemeldet: zahlen.verwaisteBlobsGemeldet,
      fehler,
    })
    .where(eq(aufraeumLaeufe.id, zeile.id))
    .run();

  return { laufId: zeile.id, trockenlauf, zahlen: { ...zahlen, partsGeloescht }, fehler };
}

/**
 * Laedt die Kandidaten und laesst `planeAufraeumen` entscheiden.
 *
 * JEDE ABFRAGE IST BEWUSST EIN SUPERSET DER REGEL (`<=` statt `<`): die
 * Entscheidung faellt in `_lib/aufraeumen.ts` und nirgends sonst. Waere die
 * Abfrage die Regel, gaebe es die Regel zweimal — und die zweite Fassung liesse
 * sich nicht ohne Datenbank pruefen.
 */
async function ladeUndPlane(
  g: Grenzen,
  now: Date,
  trockenlauf: boolean,
): Promise<{ plan: Aufraeumplan; dateien: DateiKandidat[] }> {
  const bank = getDb();

  const kandidatenShares = bank
    .select({
      id: shares.id,
      expiresAt: shares.expiresAt,
      downloadCount: shares.downloadCount,
      maxDownloads: shares.maxDownloads,
    })
    .from(shares)
    .where(lte(shares.expiresAt, new Date(now.getTime() - g.loeschKarenzStunden * MS_PRO_STUNDE)))
    .all();

  /*
   * ALLE Share-IDs, als EIGENE Abfrage. Mit den Kandidaten als Referenzmenge
   * waere jedes lebende Verzeichnis eine „Waise" — der Bericht ist die
   * Grundlage, auf der ein Betreiber Bytes loescht (`aufraeumen.ts`,
   * `alleShareIds`).
   */
  const alleShareIds = bank.select({ id: shares.id }).from(shares).all().map((z) => z.id);

  const kandidatenIds = kandidatenShares.map((s) => s.id);
  const dateiFilter =
    kandidatenIds.length > 0
      ? or(isNull(shareFiles.bytesVollstaendigAt), inArray(shareFiles.shareId, kandidatenIds))
      : isNull(shareFiles.bytesVollstaendigAt);
  const dateien = bank
    .select({
      id: shareFiles.id,
      shareId: shareFiles.shareId,
      size: shareFiles.size,
      createdAt: shareFiles.createdAt,
      bytesVollstaendigAt: shareFiles.bytesVollstaendigAt,
    })
    .from(shareFiles)
    .where(dateiFilter)
    .all();

  const logzeilen = bank
    .select({
      id: downloadLogs.id,
      shareId: downloadLogs.shareId,
      downloadedAt: downloadLogs.downloadedAt,
    })
    .from(downloadLogs)
    .where(
      lte(
        downloadLogs.downloadedAt,
        new Date(now.getTime() - g.logAufbewahrungTage * STUNDEN_PRO_TAG * MS_PRO_STUNDE),
      ),
    )
    .all();

  /*
   * Ohne gesetzte Frist wird die Inbox GAR NICHT abgefragt. `inboxVerfallen`
   * antwortete zwar ebenfalls `false`, aber eine Abfrage ohne Grenze laedt bei
   * jedem Takt den ganzen Posteingang — und „nicht gesetzt heisst keine Frist"
   * (§7.6) soll auch als Arbeitsersparnis sichtbar sein.
   */
  const inbox =
    g.inboxAufbewahrungTage === null
      ? []
      : bank
          .select({ id: inboxFiles.id, size: inboxFiles.size, empfangenAt: inboxFiles.empfangenAt })
          .from(inboxFiles)
          .where(
            lte(
              inboxFiles.empfangenAt,
              new Date(
                now.getTime() - g.inboxAufbewahrungTage * STUNDEN_PRO_TAG * MS_PRO_STUNDE,
              ),
            ),
          )
          .all();

  const plan = planeAufraeumen({
    now,
    fristen: {
      loeschKarenzStunden: g.loeschKarenzStunden,
      uploadVerfallStunden: g.uploadVerfallStunden,
      logAufbewahrungTage: g.logAufbewahrungTage,
      inboxAufbewahrungTage: g.inboxAufbewahrungTage,
      // Der WIRKSAME Schalter, nicht der aus der .env: der Knopf darf den
      // Trockenlauf einschalten, und dann muss die Rechnung ihn kennen.
      aufraeumenTrockenlauf: trockenlauf,
    },
    shares: kandidatenShares,
    dateien,
    logzeilen,
    inbox,
    alleShareIds,
    blobVerzeichnisse: await ablageWurzelListe(),
  });

  return { plan, dateien };
}

/**
 * DIE WURZEL-AUFLISTUNG DER ABLAGE, ungefiltert — das Aussortieren ist eine
 * Regel und steht in `_lib/aufraeumen.ts` (`SHARE_ID_MUSTER`).
 *
 * Das ist die EINZIGE Stelle ausserhalb von `_lib/storage.ts`, an der diese
 * Datei einen Pfad bildet, und sie bildet nur den der WURZEL: `readdir` liest
 * Namen, es entsteht kein Pfad zu einem Blob. Jeder Zugriff auf Bytes laeuft
 * unten ueber `BlobZiel` und damit weiter ausschliesslich ueber `storage.ts` —
 * die Traversal-Zusage des Moduls bleibt unberuehrt.
 *
 * Ein fehlendes Verzeichnis ist KEIN Fehler: vor dem ersten Upload gibt es die
 * Ablage noch nicht, und ein Lauf, der daran scheitert, protokollierte einen
 * Fehler, der keiner ist.
 */
async function ablageWurzelListe(): Promise<string[]> {
  const wurzel = resolve(process.env.DATA_DIR ?? "./.data", "files");
  try {
    return await readdir(wurzel);
  } catch (grund) {
    if ((grund as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw grund;
  }
}

/**
 * Fuehrt aus, was der Plan auftraegt — und liefert `parts_geloescht`.
 *
 * Diese Zahl kann NUR hier entstehen: `_lib/aufraeumen.ts` kennt das
 * Dateisystem nicht, und eine `.part` muss nicht existieren (die Zeile entsteht
 * vor dem ersten Byte, §7.1). Gezaehlt wird deshalb, was tatsaechlich dalag.
 *
 * GRENZE, ehrlich benannt: `fortschritt()` liefert 0 fuer „fehlt" UND fuer
 * „liegt da, ist aber leer" — eine nullbyteige `.part` (Abbruch zwischen
 * `open` und dem ersten `write`) wird nicht mitgezaehlt. Sauber waere ein
 * `loesche`, das meldet, was es entfernt hat; das ist eine Aenderung an
 * `_lib/storage.ts` und gehoert nicht in diesen Task.
 */
async function fuehreLoeschungAus(plan: Aufraeumplan, dateien: DateiKandidat[]): Promise<number> {
  // Im Trockenlauf ist jede Liste leer — die Wache hier ist trotzdem richtig:
  // sie macht „ein Trockenlauf loescht nichts" unabhaengig davon, ob die Form
  // des Plans das eines Tages noch traegt.
  if (plan.trockenlauf) return 0;

  const bank = getDb();
  let parts = 0;

  // 1. Sterbende Shares: erst die Bytes jeder Datei, dann das (nun leere)
  //    Verzeichnis, dann die Zeile — `share_files` faellt per Cascade.
  const sterbend = new Set(plan.loeschen.shareIds);
  for (const datei of dateien) {
    if (!sterbend.has(datei.shareId)) continue;
    if (await entferneBytes({ art: "share", shareId: datei.shareId, fileId: datei.id })) parts += 1;
  }
  for (const shareId of plan.loeschen.shareIds) {
    await loescheShareVerzeichnis(shareId);
  }
  if (plan.loeschen.shareIds.length > 0) {
    bank.delete(shares).where(inArray(shares.id, [...plan.loeschen.shareIds])).run();
  }

  // 2. Einzelne verfallene Uploads an UEBERLEBENDEN Shares.
  for (const ziel of plan.loeschen.parts) {
    if (await entferneBytes(ziel)) parts += 1;
  }
  if (plan.loeschen.dateiIds.length > 0) {
    bank.delete(shareFiles).where(inArray(shareFiles.id, [...plan.loeschen.dateiIds])).run();
  }

  // 3. Audit-Logzeilen — ohne Bytes, mit eigener Frist.
  if (plan.loeschen.logzeilenIds.length > 0) {
    bank.delete(downloadLogs).where(inArray(downloadLogs.id, [...plan.loeschen.logzeilenIds])).run();
  }

  // 4. Inbox.
  for (const id of plan.loeschen.inboxIds) {
    if (await entferneBytes({ art: "inbox", inboxFileId: id })) parts += 1;
  }
  if (plan.loeschen.inboxIds.length > 0) {
    bank.delete(inboxFiles).where(inArray(inboxFiles.id, [...plan.loeschen.inboxIds])).run();
  }

  return parts;
}

/** Loescht Blob UND Zwischendatei; liefert, ob eine `.part` dalag. */
async function entferneBytes(ziel: BlobZiel): Promise<boolean> {
  const lagDa = (await fortschritt(ziel)) > 0;
  await loesche(ziel);
  return lagDa;
}
