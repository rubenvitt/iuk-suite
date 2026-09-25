import { withAuditContext } from "@/core/audit/server";
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
import { and, eq, inArray, isNotNull, isNull, lte, or, sql } from "drizzle-orm";

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
  type InboxKandidat,
} from "./aufraeumen";
import { grenzen, grenzenFehler, type Grenzen } from "./grenzen";
import { validateFilesHosts } from "./hostRolle";
import {
  SchreibbesitzBelegt,
  loesche,
  loescheShareVerzeichnis,
  mitSchreibbesitzAller,
  pruefeAblage,
  type BlobZiel,
} from "./storage";
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
  return withAuditContext({ actor: { kind: "system" } }, async (): Promise<void> => {
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
  });
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
  // Die Ausfuehrung zaehlt HIER HINEIN, Posten fuer Posten — ein Wurf mitten im
  // Lauf laesst stehen, was bis dahin wirklich geschehen ist.
  const ausgefuehrt: Ausgefuehrt = {
    sharesGeloescht: 0,
    dateienGeloescht: 0,
    bytesGeloescht: 0,
    logzeilenGeloescht: 0,
    inboxGeloescht: 0,
    partsGeloescht: 0,
  };
  let fehler: string | null = null;

  try {
    const { plan, inbox } = await ladeUndPlane(g, gestartet, trockenlauf);
    /*
     * ZWEI QUELLEN, und der Schalter entscheidet (DRK-448):
     *
     * - Im TROCKENLAUF die Zahlen des PLANS — es gibt keine Ausfuehrung, und nur
     *   so ist die Vorschau mit dem echten Lauf vergleichbar (§4.8).
     * - Im echten Lauf die Zahlen der AUSFUEHRUNG. Vorher standen auch hier die
     *   des Plans, und eine Datei, die ein laufender Upload gerade hielt und die
     *   deshalb blieb, zaehlte als geloescht — die Spalte, die der Betreiber
     *   liest, behauptete eine Loeschung, die nicht stattfand. Scheitert die
     *   Ausfuehrung auf halbem Weg, tragen die Spalten, was bis dahin geschah,
     *   und `fehler` sagt, dass es nicht alles war.
     *
     * `verwaiste_blobs_gemeldet` ist in beiden Faellen die Zahl des Plans: ein
     * Bericht, keine Loeschung.
     */
    zahlen = { ...plan.zahlen };
    if (!plan.trockenlauf) {
      await fuehreLoeschungAus(plan, inbox, ausgefuehrt);
    }
  } catch (grund) {
    fehler = grund instanceof Error ? grund.message : String(grund);
    // Laut, weil ein stumm gescheitertes Aufraeumen sich erst meldet, wenn das
    // Volume voll ist.
    console.error("[files] Aufraeumlauf gescheitert:", grund);
  }

  if (!trockenlauf) {
    zahlen = {
      sharesGeloescht: ausgefuehrt.sharesGeloescht,
      dateienGeloescht: ausgefuehrt.dateienGeloescht,
      bytesGeloescht: ausgefuehrt.bytesGeloescht,
      logzeilenGeloescht: ausgefuehrt.logzeilenGeloescht,
      inboxGeloescht: ausgefuehrt.inboxGeloescht,
      verwaisteBlobsGemeldet: zahlen.verwaisteBlobsGemeldet,
    };
  }
  const partsGeloescht = ausgefuehrt.partsGeloescht;

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
): Promise<{ plan: Aufraeumplan; inbox: InboxKandidat[] }> {
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
   * Ohne gesetzte Frist wird die abgeschlossene Inbox GAR NICHT abgefragt.
   * `inboxVerfallen` antwortete zwar ebenfalls `false`, aber eine Abfrage ohne
   * Grenze laedt bei jedem Takt den ganzen Posteingang — und „nicht gesetzt
   * heisst keine Frist" (§7.6) soll auch als Arbeitsersparnis sichtbar sein.
   *
   * OFFENE Abgaben dagegen immer (DRK-288): ihre Lebensdauer ist technisch und
   * hat eine Vorbelegung. Superset der Regel wie oben — entschieden wird in
   * `offeneAbgabeVerfallen`.
   */
  const inboxSpalten = {
    id: inboxFiles.id,
    size: inboxFiles.size,
    empfangenAt: inboxFiles.empfangenAt,
    tokenId: inboxFiles.tokenId,
    bytesVollstaendigAt: inboxFiles.bytesVollstaendigAt,
  };
  const abgeschlosseneInbox =
    g.inboxAufbewahrungTage === null
      ? []
      : bank
          .select(inboxSpalten)
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
  const offeneInbox = bank
    .select(inboxSpalten)
    .from(inboxFiles)
    .where(
      and(
        isNull(inboxFiles.bytesVollstaendigAt),
        isNotNull(inboxFiles.tokenId),
        lte(inboxFiles.empfangenAt, new Date(now.getTime() - g.uploadVerfallStunden * MS_PRO_STUNDE)),
      ),
    )
    .all();
  const schonDa = new Set(abgeschlosseneInbox.map((z) => z.id));
  const inbox = [...abgeschlosseneInbox, ...offeneInbox.filter((z) => !schonDa.has(z.id))];

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

  return { plan, inbox };
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

/** Was die Ausfuehrung WIRKLICH geloescht hat — dieselben Spalten wie §4.8. */
type Ausgefuehrt = {
  -readonly [K in Exclude<keyof Aufraeumzahlen, "verwaisteBlobsGemeldet">]: number;
} & { partsGeloescht: number };

/**
 * Fuehrt aus, was der Plan auftraegt — und ZAEHLT DABEI, was tatsaechlich ging
 * (DRK-448), in `zaehlt` hinein.
 *
 * Gezaehlt wird an der Wirkung, nie am Auftrag: Zeilen an den `changes` des
 * DELETE, Bytes an der `size` der Zeile, die unter dem Schreibbesitz noch da war,
 * Zwischendateien an dem, was `loesche` wirklich entfernt hat — auch eine LEERE,
 * die ein `fortschritt()` von einer fehlenden nicht unterscheiden koennte. Was ein
 * laufender Upload gerade haelt, bleibt diesmal stehen und zaehlt nicht; der
 * naechste Lauf holt es.
 */
async function fuehreLoeschungAus(
  plan: Aufraeumplan,
  inbox: InboxKandidat[],
  zaehlt: Ausgefuehrt,
): Promise<void> {
  // Im Trockenlauf ist jede Liste leer — die Wache hier ist trotzdem richtig:
  // sie macht „ein Trockenlauf loescht nichts" unabhaengig davon, ob die Form
  // des Plans das eines Tages noch traegt.
  if (plan.trockenlauf) return;

  const bank = getDb();

  // 1. Sterbende Shares, JE SHARE im Schreibbesitz ALLER seiner Dateien: erst die
  //    Bytes, dann das (nun leere) Verzeichnis, dann die Zeilen. Ohne den Besitz
  //    legte ein laufender Chunk nach dem Loeschen der Bytes eine neue
  //    Zwischendatei an, deren Zeile gleich darauf verschwand (DRK-448). Neue
  //    Dateien kommen nicht hinzu: `share_files` entsteht nur mit dem Share.
  for (const shareId of plan.loeschen.shareIds) {
    const ziele: BlobZiel[] = bank
      .select({ id: shareFiles.id })
      .from(shareFiles)
      .where(eq(shareFiles.shareId, shareId))
      .all()
      .map((datei) => ({ art: "share", shareId, fileId: datei.id }));
    await imBesitzAllerOderNicht(ziele, async () => {
      for (const ziel of ziele) {
        if ((await loesche(ziel)).teil) zaehlt.partsGeloescht += 1;
      }
      await loescheShareVerzeichnis(shareId);
      const { dateien, bytes, shares: weg } = bank.transaction((tx) => {
        const stand = tx
          .select({
            anzahl: sql<number>`count(*)`,
            bytes: sql<number>`coalesce(sum(${shareFiles.size}), 0)`,
          })
          .from(shareFiles)
          .where(eq(shareFiles.shareId, shareId))
          .get();
        // Ausdruecklich, nicht per Cascade: das haengt an `PRAGMA foreign_keys`
        // (dieselbe Linie wie `shareLoeschenAction`).
        tx.delete(shareFiles).where(eq(shareFiles.shareId, shareId)).run();
        const geloescht = tx.delete(shares).where(eq(shares.id, shareId)).run();
        return { dateien: stand?.anzahl ?? 0, bytes: stand?.bytes ?? 0, shares: geloescht.changes };
      });
      zaehlt.sharesGeloescht += weg;
      zaehlt.dateienGeloescht += dateien;
      zaehlt.bytesGeloescht += bytes;
    });
  }

  // 2. Einzelne verfallene Uploads an UEBERLEBENDEN Shares — je Datei im
  //    Schreibbesitz (DRK-289): ein gerade laufender Chunk behielte sonst einen
  //    Deskriptor auf eine geloeschte Zwischendatei. Belegt → diesmal nicht;
  //    der naechste Lauf holt sie. Unter dem Besitz wird erneut geprueft, ob die
  //    Datei noch offen ist — sonst naehme der Lauf eine eben fertig gewordene mit.
  for (const ziel of plan.loeschen.parts) {
    if (ziel.art !== "share") continue;
    await imBesitzAllerOderNicht([ziel], async () => {
      const nochOffen = bank
        .select({ size: shareFiles.size })
        .from(shareFiles)
        .where(and(eq(shareFiles.id, ziel.fileId), isNull(shareFiles.bytesVollstaendigAt)))
        .get();
      if (nochOffen === undefined) return;
      if ((await loesche(ziel)).teil) zaehlt.partsGeloescht += 1;
      const weg = bank.delete(shareFiles).where(eq(shareFiles.id, ziel.fileId)).run().changes;
      zaehlt.dateienGeloescht += weg;
      zaehlt.bytesGeloescht += weg * nochOffen.size;
    });
  }

  // 3. Audit-Logzeilen — ohne Bytes, mit eigener Frist.
  if (plan.loeschen.logzeilenIds.length > 0) {
    zaehlt.logzeilenGeloescht += bank
      .delete(downloadLogs)
      .where(inArray(downloadLogs.id, [...plan.loeschen.logzeilenIds]))
      .run().changes;
  }

  // 4. Inbox — abgeschlossene nach ihrer Aufbewahrung, offene nach ihrer
  //    Lebensdauer (DRK-288). Je Datei im Schreibbesitz, wie oben; unter ihm
  //    zaehlt der Zustand, den der PLAN sah: eine als offen verplante Abgabe, die
  //    inzwischen abgeschlossen ist, bleibt. Mit der Zeile geht der Dateiplatz
  //    des Links — genau einmal, weil es keinen Zaehler dafuer gibt.
  const warOffen = new Map(inbox.map((z) => [z.id, z.bytesVollstaendigAt === null]));
  for (const id of plan.loeschen.inboxIds) {
    const ziel: BlobZiel = { art: "inbox", inboxFileId: id };
    const offenVerplant = warOffen.get(id) === true;
    await imBesitzAllerOderNicht([ziel], async () => {
      const jetzt = bank
        .select({ size: inboxFiles.size, bytesVollstaendigAt: inboxFiles.bytesVollstaendigAt })
        .from(inboxFiles)
        .where(eq(inboxFiles.id, id))
        .get();
      if (jetzt === undefined) return;
      if (offenVerplant && jetzt.bytesVollstaendigAt !== null) return;
      if ((await loesche(ziel)).teil) zaehlt.partsGeloescht += 1;
      const weg = bank.delete(inboxFiles).where(eq(inboxFiles.id, id)).run().changes;
      zaehlt.inboxGeloescht += weg;
      zaehlt.bytesGeloescht += weg * jetzt.size;
    });
  }
}

/**
 * `arbeit` im Schreibbesitz aller `ziele` — oder gar nicht, wenn gerade ein
 * Upload eine davon haelt (DRK-289). Dann bleibt alles stehen; der naechste
 * Lauf holt es.
 */
async function imBesitzAllerOderNicht(
  ziele: readonly BlobZiel[],
  arbeit: () => Promise<void>,
): Promise<void> {
  try {
    await mitSchreibbesitzAller(ziele, arbeit);
  } catch (grund) {
    if (grund instanceof SchreibbesitzBelegt) return;
    throw grund;
  }
}
