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

import { getModule, prodHostsFor } from "@/core/registry";

import { grenzen, grenzenFehler } from "./grenzen";
import { validateFilesHosts } from "./hostRolle";
import { pruefeAblage } from "./storage";
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
}
