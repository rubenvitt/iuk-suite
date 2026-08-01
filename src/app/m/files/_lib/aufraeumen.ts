/**
 * Die Loeschregeln des Moduls `files` (Spec §7.6) als REINE Funktionen: keine
 * Uhr, kein Dateisystem, keine Datenbank.
 *
 * WARUM DAS EINE ZUSAGE IST UND KEIN STIL: der erste Aufraeumlauf nach dem
 * Cutover ist ein LOESCHEREIGNIS, keine Hintergrundaufgabe — auf dem Server der
 * Alt-App laeuft moeglicherweise kein Cleanup-Cron, dann enthaelt die
 * Produktions-DB abgelaufene Shares VOLLSTAENDIG (Analyse Abschnitt 8, Punkt 7).
 * Die einzige Vorschau darauf ist der Trockenlauf, und er ist nur dann eine
 * Vorschau, wenn er dieselbe Rechnung mit demselben `now` ausfuehrt wie der
 * echte Lauf. Eine Regel, die ihre Uhr selbst liest, kann das nicht zusagen.
 *
 * WAS HIER NICHT PASSIERT: es wird nichts geloescht und nichts gelesen. Diese
 * Datei entscheidet, WAS wegkann; das Verzeichnis liest und die Zeilen loescht
 * der Aufraeum-Timer, der auch die Protokollzeile in `aufraeum_laeufe` schreibt
 * (§4.8).
 *
 * KEIN `"use client"`: die Ablage-Kachel ist eine Server Component, und ein
 * WERT aus einem Client-Modul kommt dort als Client-Referenz an — HTTP 500 fuer
 * die ganze Seite, das `pnpm build` nicht sieht und Vitest strukturell nicht
 * sehen KANN (`docs/design/README.md:87-103`).
 */

import type { Grenzen } from "./grenzen";
import type { BlobZiel } from "./storage";
import type { ShareRow, ShareFileRow, DownloadLogRow, InboxFileRow } from "../_db/schema";

/**
 * Die Fristen als AUSSCHNITT aus `Grenzen`, nicht als eigener Typ mit eigenen
 * Namen: eine zweite Namensmenge waere eine zweite Wahrheit, und eine
 * Umbenennung in `grenzen.ts` fiele dann nicht auf.
 *
 * Der Trockenlauf-Schalter reist MIT den Fristen, statt als zweites Argument
 * daneben: ein Aufrufer, der beides einzeln uebergibt, kann die Vorschau mit
 * den Fristen des echten Laufs verwechseln — und umgekehrt.
 */
export type Aufraeumfristen = Pick<
  Grenzen,
  | "loeschKarenzStunden"
  | "uploadVerfallStunden"
  | "logAufbewahrungTage"
  | "inboxAufbewahrungTage"
  | "aufraeumenTrockenlauf"
>;

/**
 * Der Share, so viel wie die Regel sehen DARF — und ausdruecklich mit
 * `downloadCount`/`maxDownloads`, obwohl sie nicht gelesen werden.
 *
 * Das ist die Stelle des Alt-Defekts: `cleanup/route.ts:27` loeschte per
 * `limit_reached_at` einen Share, der weder abgelaufen war noch sein Limit
 * erreicht hatte, samt aller Bytes (Analyse Zeile 251). Die Spalte ist
 * gestrichen; dass der Zaehler hier ANWESEND und unbenutzt ist, macht die
 * Entscheidung im Typ sichtbar statt sie im Weglassen zu verstecken.
 */
export type ShareKandidat = Pick<
  ShareRow,
  "id" | "expiresAt" | "downloadCount" | "maxDownloads"
>;

export type DateiKandidat = Pick<
  ShareFileRow,
  "id" | "shareId" | "size" | "createdAt" | "bytesVollstaendigAt"
>;

/**
 * Mit `shareId` — auch hier ist die Anwesenheit die Aussage: die Frist der
 * Logzeile ist ihre EIGENE (`FILES_LOG_AUFBEWAHRUNG_TAGE`), und sie gilt
 * unabhaengig davon, ob ihr Share diesen Lauf ueberlebt. Ein Log, das mit
 * seinem Share stirbt, ist kein Audit-Log — es verschwindet genau dann, wenn
 * man es braucht (Analyse E12 b, deshalb hat `download_logs` keinen FK).
 */
export type LogKandidat = Pick<DownloadLogRow, "id" | "shareId" | "downloadedAt">;

/**
 * OHNE `bytesVollstaendigAt` — und das ist eine offene Beauftragung, keine
 * Entscheidung dieser Datei. Die Spalte EXISTIERT (`_db/schema.ts:194`, §4.6 sagt
 * „wie §4.4"), aber die Regeltabelle §7.6 kennt fuer die Inbox nur die fachliche
 * Frist, und §4.4 formuliert den Verfall ueber `created_at` — eine Spalte, die
 * `inbox_files` nicht hat. Eine sechste Regel hier waere kein Detail, sondern die
 * Umkehrung einer ausdruecklichen Zusage: `FILES_INBOX_AUFBEWAHRUNG_TAGE` hat
 * BEWUSST keine Vorbelegung (`grenzen.ts:120`, „nicht gesetzt heisst keine
 * Frist"), und fuer `inbox_files` gibt es keine geschriebene Import-Zusage wie
 * fuer `share_files` (§4.2, Spec-Zeile 84). `empfangen_at` importierter Zeilen ist
 * die Quell-`mtime` und damit alt — eine Verfallsregel ueber diese Spalte loeschte
 * unter STANDARDkonfiguration Altbestand.
 *
 * Der Preis, ehrlich benannt: ein abgebrochener anonymer Chunk-Upload hinterlaesst
 * Zeile und `inbox/<id>.part` dauerhaft, solange die Frist nicht gesetzt ist.
 */
export type InboxKandidat = Pick<InboxFileRow, "id" | "size" | "empfangenAt">;

export interface AufraeumEingabe {
  /** Die EINE Uhr des Laufs, vom Aufrufer gestellt. */
  readonly now: Date;
  readonly fristen: Aufraeumfristen;
  readonly shares: readonly ShareKandidat[];
  readonly dateien: readonly DateiKandidat[];
  readonly logzeilen: readonly LogKandidat[];
  readonly inbox: readonly InboxKandidat[];
  /**
   * ALLE `shares.id` der Datenbank — nicht der Kandidaten-Ausschnitt, der ist
   * `shares`. Zwei Felder, weil die beiden Rollen zwei verschiedene Abfragen
   * wollen: die naheliegende Kandidatenabfrage ist `WHERE expires_at < now −
   * Karenz` (genau dafuer ist `idx_shares_expires` da, `_db/schema.ts:92`), und
   * mit ihrem Ergebnis als Referenzmenge waere JEDES lebende Verzeichnis eine
   * „Waise". Als eigenes, benanntes Argument ist „ich habe nur die abgelaufenen
   * geladen" kein stiller Fehler mehr — und der Bericht ist die Grundlage, auf
   * der ein Betreiber Bytes loescht.
   */
  readonly alleShareIds: readonly string[];
  /**
   * Die WURZEL-Auflistung der Ablage (`readdir(<DATA_DIR>/files)`), ungefiltert —
   * gelesen hat sie der Aufrufer. Ungefiltert, weil das Aussortieren eine Regel
   * ist und keine Lesearbeit: was von diesen Namen ueberhaupt ein Share-Verzeichnis
   * sein KANN, entscheidet `SHARE_ID_MUSTER` hier.
   *
   * Nur die Wurzel: ein Blob ohne Zeile INNERHALB von `inbox/` ist eine andere
   * Klasse, und §7.6 nennt ausdruecklich „Verzeichnis ohne `shares`-Zeile".
   */
  readonly blobVerzeichnisse: readonly string[];
}

/**
 * Die Zaehlspalten aus §4.8 — bis auf `parts_geloescht`.
 *
 * `parts_geloescht` fehlt hier ABSICHTLICH: eine `.part`-Datei muss nicht
 * existieren (die Zeile entsteht vor dem ersten Byte, §7.1). Eine Zahl aus der
 * Laenge einer Zielliste waere also eine Behauptung ueber das Dateisystem, die
 * diese Datei nicht pruefen kann — und sie landete als Tatsache in einer Spalte,
 * die der Betreiber liest. Die Zielliste steht in `loeschen.parts`; die Zahl
 * zaehlt der Ausfuehrende aus den tatsaechlichen Unlinks.
 */
export interface Aufraeumzahlen {
  readonly sharesGeloescht: number;
  readonly dateienGeloescht: number;
  /** Bytes, nicht MiB — die Einheit steht im Namen (§9.1). */
  readonly bytesGeloescht: number;
  readonly logzeilenGeloescht: number;
  readonly inboxGeloescht: number;
  readonly verwaisteBlobsGemeldet: number;
}

/**
 * Die Auftraege. Im Trockenlauf ist JEDE Liste leer — deshalb sind die Zahlen
 * ein eigenes Feld: der Ausfuehrende kann nur loeschen, was hier steht, und
 * damit ist „Trockenlauf loescht nichts" eine Eigenschaft der Form, keine
 * Verabredung.
 */
export interface Loeschliste {
  /** Share samt Verzeichnis und (per Cascade) seiner `share_files`-Zeilen. */
  readonly shareIds: readonly string[];
  /**
   * Einzelne `share_files`-Zeilen — nur die verfallenen unvollstaendigen
   * Uploads von Shares, die diesen Lauf UEBERLEBEN. Die eines sterbenden
   * Shares stehen hier nicht: sie waeren ein Loeschauftrag auf eine Zeile, die
   * es dann nicht mehr gibt.
   */
  readonly dateiIds: readonly string[];
  readonly logzeilenIds: readonly number[];
  readonly inboxIds: readonly string[];
  /**
   * Die Zwischendateien zu `dateiIds`. `BlobZiel` statt eines Pfades: ein Pfad
   * entsteht ausschliesslich in `_lib/storage.ts` aus DB-IDs, damit die
   * Traversal-Klasse strukturell verschwindet statt per Guard.
   */
  readonly parts: readonly BlobZiel[];
}

export interface Aufraeumplan {
  readonly trockenlauf: boolean;
  readonly zahlen: Aufraeumzahlen;
  readonly loeschen: Loeschliste;
  /**
   * BERICHT, kein Auftrag — und deshalb ein Geschwisterfeld von `loeschen` und
   * kein Eintrag darin: verwaiste Bytes automatisch zu loeschen waere in einem
   * Modul, dessen Bestand gerade importiert wird, der teuerste denkbare Fehler
   * (§7.6). Ein verwaister Blob kann eine Datei sein, deren Zeile noch entsteht.
   */
  readonly verwaisteBlobs: readonly string[];
}

const MS_PRO_STUNDE = 3600_000;
const STUNDEN_PRO_TAG = 24;

/**
 * Die FORM einer Share-ID: `nanoid(10)`. Dieselbe wie `ID_MUSTER` in
 * `_lib/storage.ts:26` und bewusst eine zweite Kopie — dort ist sie privat, weil
 * das PRUEFEN von IDs Sache der Ablage ist, und ein Export nur fuer diese Datei
 * machte aus einem strukturellen Guard eine geteilte Konstante. Damit die Kopie
 * nicht auseinanderlaeuft, vergleicht `aufraeumen.test.ts` beide Literale im
 * Quelltext.
 *
 * WARUM DIE FORM UEBERHAUPT ZAEHLT: in der Ablagewurzel liegen neben den
 * Share-Verzeichnissen planmaessig Eintraege, die keine `shares`-Zeile haben und
 * nie eine bekommen — `inbox/` (das anonyme Postfach, `storage.ts:120-126`) und im
 * Fehlerfall eine liegen gebliebene `.ablage-probe` (`storage.ts:365`). „Kein
 * Share" allein machte daraus zwei dauerhafte Phantomeintraege im
 * Betreiber-Bericht, und wer ihn befolgt, loescht mit `inbox` das GANZE Postfach —
 * genau die Klasse, die §7.6 „der teuerste denkbare Fehler" nennt. Die
 * Namensraeume sind disjunkt, weil eine Share-ID immer zehn Zeichen hat und
 * `inbox` fuenf; das faellt strukturell heraus statt per Aufzaehlung.
 */
const SHARE_ID_MUSTER = /^[A-Za-z0-9_-]{10}$/;

/**
 * Die Schwelle, ab der eine Frist abgelaufen ist. Ein eigener Helfer, damit
 * „vor der Schwelle" an EINER Stelle `<` heisst: `<=` machte aus jeder Frist
 * eine um eine Millisekunde kuerzere, und bei Karenz 0 — dem Wert, den der
 * Betreiber beim Cutover setzt — waere das ein noch laufender Share.
 */
function schwelle(now: Date, stunden: number): number {
  return now.getTime() - stunden * MS_PRO_STUNDE;
}

function vorSchwelle(zeitpunkt: Date, now: Date, stunden: number): boolean {
  return zeitpunkt.getTime() < schwelle(now, stunden);
}

/**
 * EINE Regel fuer ALLE Shares: `expires_at < now − FILES_LOESCH_KARENZ_STUNDEN`.
 *
 * Heute ist sie asymmetrisch (abgelaufene ohne jede Karenz, limit-erreichte mit
 * 24 h, `cleanup/route.ts:26-27`). Mit einem Wert hat die Karenz EINE Bedeutung,
 * und ein Share ist nach Ablauf ueberhaupt noch verlaengerbar. Der Preis ist
 * ausdruecklich gewaehlt: ein ausgeschoepfter Share belegt Platz bis Ablauf plus
 * Karenz. Die Gegenrichtung hat in der Alt-App Daten gekostet.
 */
export function shareLoeschbar(
  share: ShareKandidat,
  now: Date,
  fristen: Aufraeumfristen,
): boolean {
  return vorSchwelle(share.expiresAt, now, fristen.loeschKarenzStunden);
}

/**
 * `bytes_vollstaendig_at IS NULL AND created_at < now − FILES_UPLOAD_VERFALL_STUNDEN`.
 *
 * In der Alt-App war dieser Zustand unsichtbar und dauerhaft: die Zeile entsteht
 * vor dem ersten Byte, und `abortMultipartUpload` hatte keinen Aufrufer
 * (Analyse Abschnitt 5).
 */
export function uploadVerfallen(
  datei: DateiKandidat,
  now: Date,
  fristen: Aufraeumfristen,
): boolean {
  if (datei.bytesVollstaendigAt !== null) return false;
  return vorSchwelle(datei.createdAt, now, fristen.uploadVerfallStunden);
}

/** `downloaded_at < now − FILES_LOG_AUFBEWAHRUNG_TAGE`. Ohne Blick auf den Share. */
export function logzeileVerfallen(
  zeile: LogKandidat,
  now: Date,
  fristen: Aufraeumfristen,
): boolean {
  return vorSchwelle(zeile.downloadedAt, now, fristen.logAufbewahrungTage * STUNDEN_PRO_TAG);
}

/**
 * Nur wenn `FILES_INBOX_AUFBEWAHRUNG_TAGE` GESETZT ist. `null` heisst „keine
 * Frist" und nicht „sofort" — das ist das heutige Verhalten von `drop` (weder
 * Frist noch Loeschfunktion), und die Frist ist eine fachliche Zusage, keine
 * technische Entscheidung (§13).
 */
export function inboxVerfallen(
  datei: InboxKandidat,
  now: Date,
  fristen: Aufraeumfristen,
): boolean {
  const tage = fristen.inboxAufbewahrungTage;
  if (tage === null) return false;
  return vorSchwelle(datei.empfangenAt, now, tage * STUNDEN_PRO_TAG);
}

const LEERE_LISTE: Loeschliste = {
  shareIds: [],
  dateiIds: [],
  logzeilenIds: [],
  inboxIds: [],
  parts: [],
};

/**
 * Der ganze Lauf als Rechnung. Zwei Stufen, und die Trennung ist der Punkt:
 * erst wird das Vorhaben vollstaendig ermittelt und daraus werden die Zahlen
 * abgeleitet, DANN entscheidet der Trockenlauf-Schalter, ob das Vorhaben auch
 * ausgeliefert wird. Waeren die Zahlen aus der ausgelieferten Liste gerechnet,
 * zaehlte der Trockenlauf Nullen — und damit waere die Vorschau, deren einziger
 * Zweck der Vergleich mit dem echten Lauf ist (§4.8), wertlos.
 */
export function planeAufraeumen(eingabe: AufraeumEingabe): Aufraeumplan {
  const { now, fristen } = eingabe;

  const sterbendeShares = eingabe.shares.filter((s) => shareLoeschbar(s, now, fristen));
  const sterbendeShareIds = new Set(sterbendeShares.map((s) => s.id));

  // Dateien eines sterbenden Shares gehen per Cascade und mit dem Verzeichnis —
  // sie zaehlen, stehen aber nicht einzeln in der Liste.
  const mitgerissene = eingabe.dateien.filter((d) => sterbendeShareIds.has(d.shareId));
  const einzelneDateien = eingabe.dateien.filter(
    (d) => !sterbendeShareIds.has(d.shareId) && uploadVerfallen(d, now, fristen),
  );

  const verfalleneLogzeilen = eingabe.logzeilen.filter((z) => logzeileVerfallen(z, now, fristen));
  const verfalleneInbox = eingabe.inbox.filter((d) => inboxVerfallen(d, now, fristen));

  // Referenz sind ALLE bekannten Shares, nicht die Ueberlebenden: sonst waere das
  // Verzeichnis jedes gerade geloeschten Shares eine „Waise", die Zahl stiege mit
  // jedem Lauf, und der Betreiber jagte Bytes, die planmaessig verschwinden.
  //
  // Die Kandidaten kommen HINZU, statt sich auf `alleShareIds` zu verlassen: ein
  // Aufrufer, der dieses Feld falsch fuellt, soll den Bericht hoechstens
  // unvollstaendig machen. Das Verzeichnis eines Shares, den DIESER Lauf loescht,
  // kann dadurch nie darin landen — und das ist die Zusage, die sonst am Wohlwollen
  // des Aufrufers haengt.
  const referenz = new Set([...eingabe.alleShareIds, ...eingabe.shares.map((s) => s.id)]);
  const verwaisteBlobs = eingabe.blobVerzeichnisse.filter(
    (name) => SHARE_ID_MUSTER.test(name) && !referenz.has(name),
  );

  const summe = (posten: readonly { size: number }[]) =>
    posten.reduce((zwischen, p) => zwischen + p.size, 0);

  const vorhaben: Loeschliste = {
    shareIds: sterbendeShares.map((s) => s.id),
    dateiIds: einzelneDateien.map((d) => d.id),
    logzeilenIds: verfalleneLogzeilen.map((z) => z.id),
    inboxIds: verfalleneInbox.map((d) => d.id),
    parts: einzelneDateien.map((d) => ({
      art: "share" as const,
      shareId: d.shareId,
      fileId: d.id,
    })),
  };

  const zahlen: Aufraeumzahlen = {
    sharesGeloescht: sterbendeShares.length,
    dateienGeloescht: mitgerissene.length + einzelneDateien.length,
    // Die Summe der `size` AUS DER DATENBANK — und damit weder eine angekuendigte
    // noch die tatsaechlich freigegebene Groesse: eine neue unvollstaendige Zeile
    // traegt 0 (§7.1 Schritt 1 legt sie mit `size = 0` an und setzt den GEMESSENEN
    // Wert erst beim letzten Chunk), eine importierte Zeile ohne Blob ihren
    // Altwert. Die Laenge der `.part` auf der Platte kennt nur der Ausfuehrende —
    // dieselbe Grenze wie bei `parts_geloescht` (siehe `Aufraeumzahlen`): eine Zahl
    // aus dem Dateisystem waere hier eine Behauptung, die diese Datei nicht
    // pruefen kann, und sie landete als Tatsache in einer Spalte, die der
    // Betreiber liest (§4.8).
    bytesGeloescht: summe(mitgerissene) + summe(einzelneDateien) + summe(verfalleneInbox),
    logzeilenGeloescht: verfalleneLogzeilen.length,
    inboxGeloescht: verfalleneInbox.length,
    verwaisteBlobsGemeldet: verwaisteBlobs.length,
  };

  return {
    trockenlauf: fristen.aufraeumenTrockenlauf,
    zahlen,
    loeschen: fristen.aufraeumenTrockenlauf ? LEERE_LISTE : vorhaben,
    verwaisteBlobs,
  };
}
