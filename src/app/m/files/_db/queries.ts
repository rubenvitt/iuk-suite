/**
 * Der Datenzugriff des Moduls `files` auf Freigaben (Spec §7.3, §7.4).
 *
 * **`ladeShare` ist die EINE Ladefunktion mit der EINEN Prüfkette**, und die
 * Reihenfolge ist die Zusage, nicht nur das Ergebnis:
 *
 *     Existenz → Ablauf → Passwort-Cookie → AV-Status → Limit
 *                                                       └── LESEND. Das
 *                                            verbrauchende UPDATE läuft
 *                                            ausschliesslich in `download`
 *                                            und `zip` (§7.5, `_db/zaehler.ts`).
 *
 * Die Alt-App hatte fünf Eintrittspunkte mit fünf verschiedenen Prüfketten;
 * `verify` prüfte weder Ablauf noch Limit, und die drei Endpunkte, die Bytes
 * auslieferten, lasen `password_hash` nirgends.
 *
 * **Zwei Reihenfolgen tragen Sicherheitsaussagen, keine Bequemlichkeit:**
 * - **Passwort vor Limit.** Läge das Limit davor und wäre es verbrauchend, hätte
 *   schon das Öffnen der öffentlichen Seite — und jeder anonyme
 *   `/api/download/<id>`-Aufruf OHNE Passwort — einen Download verbraucht: ein
 *   Share mit `max_downloads = 3` wäre mit drei fremden GETs tot und das
 *   serverseitige Gate still ausgehebelt statt schützend (§7.4).
 * - **Passwort vor Dateiauflösung.** Sonst verrät der Statuscode (404 gegen 401),
 *   ob eine geratene `fileId` zu diesem Share gehört, ohne das Passwort zu
 *   kennen.
 *
 * **`password_hash` überquert die Grenze nicht.** Die Projektionen wählen ihre
 * Spalten auf; der Wahrheitswert `hatPasswort` entsteht in SQLite, der Hash
 * verlässt die Datenbank also gar nicht. `select()` ohne Argument ist im Modul
 * nicht erlaubt (Quelltext-Zusicherung in `queries.test.ts`) — die Alt-App
 * selektierte alle Spalten inklusive `password_hash`, spreadete sie und übergab
 * sie an eine Client-Komponente (Analyse Falle 11).
 *
 * Server-only: `getDb()` und die Ablage stehen dahinter. Keine
 * Client-Direktive, und keine Client-Datei darf hier importieren.
 */
import { asc, desc, eq, sql } from "drizzle-orm";

import { AV_STATUS, istFreigegeben, type AvStatus } from "../_lib/av";
import { cookieName, istCookieGueltig } from "../_lib/passwort";
import { BlobFehlt, UngueltigeId, groesse } from "../_lib/storage";
import { getDb } from "./client";
import { downloadLogs, shareFiles, shares } from "./schema";

/**
 * Ein Cookie-LESER, kein Cookie-WERT. Der Name des Entsperr-Cookies hängt an der
 * Share-ID, und `cookieName()` WIRFT bei einer ID, die kein Cookie-Name wäre
 * (`passwort.ts:77-84`, absichtlich: der Name landet in einem Header). Bildete
 * ein Aufrufer den Namen selbst, also VOR der Existenzstufe, wäre `/s/<unrat>`
 * HTTP 500 statt der 404-Seite der Suite. Deshalb reicht der Aufrufer das
 * Lesen herein und die Kette bildet den Namen erst aus der gefundenen Zeile.
 */
export type CookieLeser = (name: string) => string | undefined;

export type ShareAnfrage = {
  shareId: string;
  /** Nur die Byte-Wege setzen sie (`?file=<fileId>`); die Seite lässt sie leer. */
  dateiId?: string | null;
  cookieLeser?: CookieLeser;
  /** Injizierbar, weil die Spalten SEKUNDEN führen und eine laufende Uhr flackert. */
  jetzt?: Date;
};

export type ShareDatei = {
  id: string;
  dateiname: string;
  mimeType: string;
  /** Die Bytezahl AUS DER ZEILE — die Grundlage jeder Summe. */
  groesse: number;
  /** Die auf dem Dateisystem gemessene Länge, oder `null`, wenn kein Blob liegt.
   *  Der Download liefert diese aus, nicht `groesse`: ein falsches
   *  `Content-Length` bricht beim Empfänger ab (§5.4). */
  gemesseneGroesse: number | null;
  /** Zeile vollständig übertragen, aber kein Blob → „nicht auffindbar" (§10.1). */
  blobFehlt: boolean;
  /** `bytes_vollstaendig_at IS NOT NULL` (§4.4). */
  vollstaendig: boolean;
  avStatus: AvStatus;
  freigegeben: boolean;
  /** Die einzige Frage, die ein Byte-Weg stellen muss. */
  ladbar: boolean;
  angelegtAt: Date;
};

export type ShareKopf = {
  id: string;
  titel: string;
  beschreibung: string | null;
  typ: string;
  hatPasswort: boolean;
  ablaufAt: Date;
  maxDownloads: number | null;
  downloadCount: number;
};

export type ShareInhalt = {
  /** ALLE Zeilen, auch die unvollständigen: `/s/<id>` und die Detailseite müssen
   *  wissen, dass es sie gibt („Keine Datei vollständig übertragen"). Ladbar
   *  sind sie nicht. */
  dateien: ShareDatei[];
  /** Summe der `size`-Spalte über die VOLLSTÄNDIGEN Zeilen. Nie `shares.total_size`
   *  und nie die gemessene Länge: heute zeigen Dashboard und Detailseite dieselbe
   *  Größe aus ZWEI Quellen und können verschiedene Zahlen zeigen. */
  gesamtGroesse: number;
  anzahlLadbar: number;
  anzahlUnvollstaendig: number;
  /** Trägt die Zusage „`<meta http-equiv="refresh">` steht GENAU DANN im Markup"
   *  (§7.4). `error` und `infected` sind Endzustände und zählen NICHT mit —
   *  sonst lädt eine Seite mit einer dauerhaft fehlgeschlagenen Datei für immer
   *  alle 5 Sekunden nach, auf einem fremden Handy. */
  mindestensEineWirdGeprueft: boolean;
  /** Auch für einen Share OHNE jede Zeile wahr — §10.1 und die Detailseite
   *  formulieren beide „keine Datei vollständig übertragen", und ohne diese
   *  Festlegung rät jede der beiden Ansichten selbst. */
  alleUnvollstaendig: boolean;
};

/**
 * Der Ausgang der Prüfkette. Ein NAME je Stufe, damit jeder Aufrufer denselben
 * Zustand auf seinen Statuscode abbildet (§7.4-Tabelle):
 *
 * | Zustand | Seite `/s/<id>` | Byte-Weg |
 * |---|---|---|
 * | `unbekannt` | `notFound()` | 404 |
 * | `abgelaufen` | 200 + Zustandsseite | 410 |
 * | `passwortNoetig` | nur die Maske | 401 |
 * | `dateiNichtGefunden` | — | 404 |
 * | `gesperrt` | Zeilenzustand | 403 |
 * | `blobFehlt` | „nicht auffindbar" | 404 |
 * | `limitErreicht` | 200 + Zustandsseite | 410 |
 * | `offen` | Inhalt | Bytes |
 */
export type ShareLadung =
  | { zustand: "unbekannt" }
  /** Der Titel kommt mit, damit die Zustandsseite nicht namenlos ist — nicht mehr:
   *  keine Dateiliste, keine IDs, keine Größen, keine Beschreibung. Dass der
   *  Titel auch ohne Passwort sichtbar ist, ist dieselbe Festlegung wie bei der
   *  Maske (§7.4: Titel, Hinweis, Feld, Knopf). */
  | { zustand: "abgelaufen"; titel: string }
  /** Titel JA, Beschreibung NEIN: die Maske zeigt Titel, Hinweis, Feld, Knopf
   *  und sonst nichts (§7.4). Ein Feld mehr hier ist ein Feld im RSC-Payload
   *  derselben Antwort, die das Passwort erst erfragt. */
  | { zustand: "passwortNoetig"; titel: string }
  | { zustand: "dateiNichtGefunden" }
  | { zustand: "gesperrt"; avStatus: AvStatus }
  | { zustand: "blobFehlt" }
  | { zustand: "limitErreicht"; titel: string }
  | { zustand: "offen"; share: ShareKopf; inhalt: ShareInhalt; datei: ShareDatei | null };

export type AvSammelwert =
  | "leer"
  | "freigegeben"
  | "wirdGeprueft"
  | "gesperrt"
  | "pruefungFehlt"
  | "ungeprueft";

export type UebersichtZeile = ShareKopf & {
  anzahlDateien: number;
  anzahlUnvollstaendig: number;
  gesamtGroesse: number;
  avSammelwert: AvSammelwert;
  erstelltVon: string;
  erstelltAt: Date;
};

export type ShareDetail = ShareKopf &
  ShareInhalt & {
    erstelltVon: string;
    erstelltAt: Date;
  };

export type AuditZeile = {
  id: number;
  /** `null` = ZIP des GANZEN Shares — ein 1:1-pflichtiger Magic Value (§4.5). */
  dateiId: string | null;
  clientIpUnbestaetigt: string | null;
  userAgent: string | null;
  zeit: Date;
};

// ---------------------------------------------------------------------------

/**
 * `hatPasswort` entsteht in SQLite. Der Hash wird damit nicht „später
 * weggelassen", sondern nie geholt — die einzige Bauform, an der ein späteres
 * „ist doch schon da" nicht scheitern kann.
 */
const KOPF_SPALTEN = {
  id: shares.id,
  titel: shares.title,
  beschreibung: shares.description,
  typ: shares.type,
  hatPasswort: sql<number>`(${shares.passwordHash} IS NOT NULL)`,
  ablaufAt: shares.expiresAt,
  maxDownloads: shares.maxDownloads,
  downloadCount: shares.downloadCount,
} as const;

const DATEI_SPALTEN = {
  id: shareFiles.id,
  shareId: shareFiles.shareId,
  dateiname: shareFiles.filename,
  mimeType: shareFiles.mimeType,
  groesse: shareFiles.size,
  angelegtAt: shareFiles.createdAt,
  bytesVollstaendigAt: shareFiles.bytesVollstaendigAt,
  avStatus: shareFiles.avStatus,
} as const;

type RohKopf = {
  id: string;
  titel: string;
  beschreibung: string | null;
  typ: string;
  hatPasswort: number;
  ablaufAt: Date;
  maxDownloads: number | null;
  downloadCount: number;
};

type RohDatei = {
  id: string;
  shareId: string;
  dateiname: string;
  mimeType: string;
  groesse: number;
  angelegtAt: Date;
  bytesVollstaendigAt: Date | null;
  avStatus: string;
};

function zuKopf(roh: RohKopf): ShareKopf {
  const { hatPasswort, ...rest } = roh;
  return { ...rest, hatPasswort: hatPasswort !== 0 };
}

/**
 * Der CHECK der Spalte lässt nur die fünf Werte zu (§4.3). Ein sechster wäre
 * also ein Datenbankfehler — und wird `error`, nicht „unbekannt, also
 * freigegeben": fail-closed ist hier die einzige Richtung, weil `istFreigegeben`
 * genau EINEN Wert kennt und ein Fremdwert sonst über eine Lücke im
 * Typensystem freigäbe.
 */
function alsAvStatus(roh: string): AvStatus {
  return (AV_STATUS as readonly string[]).includes(roh) ? (roh as AvStatus) : "error";
}

/**
 * Der Blob-Abgleich, EINMAL. `groesse` wirft `BlobFehlt` bei ENOENT (§5.4: 404,
 * nicht 500) und `UngueltigeId`, wenn eine Zeile eine ID trägt, die keine
 * nanoid(10) ist — ein Datenfehler, wie ihn ein Import hinterlassen kann. Beide
 * werden hier zu „nicht auffindbar": ein Wurf wäre HTTP 500 auf einer
 * öffentlichen Seite für einen Zustand, den §10.1 als Zeilenzustand vorsieht.
 */
async function gemessen(shareId: string, fileId: string): Promise<number | null> {
  try {
    return await groesse({ art: "share", shareId, fileId });
  } catch (fehler) {
    if (fehler instanceof BlobFehlt || fehler instanceof UngueltigeId) return null;
    throw fehler;
  }
}

async function zuDatei(roh: RohDatei): Promise<ShareDatei> {
  const vollstaendig = roh.bytesVollstaendigAt !== null;
  const avStatus = alsAvStatus(roh.avStatus);
  const freigegeben = istFreigegeben(avStatus);
  // Nur vollständige Zeilen werden geprobt: für eine Zeile ohne Bytes ist das
  // Fehlen des Blobs der ERWARTETE Zustand, kein Befund.
  const gemesseneGroesse = vollstaendig ? await gemessen(roh.shareId, roh.id) : null;
  const blobFehlt = vollstaendig && gemesseneGroesse === null;
  return {
    id: roh.id,
    dateiname: roh.dateiname,
    mimeType: roh.mimeType,
    groesse: roh.groesse,
    gemesseneGroesse,
    blobFehlt,
    vollstaendig,
    avStatus,
    freigegeben,
    ladbar: vollstaendig && freigegeben && !blobFehlt,
    angelegtAt: roh.angelegtAt,
  };
}

function fasseZusammen(dateien: ShareDatei[]): ShareInhalt {
  const vollstaendige = dateien.filter((d) => d.vollstaendig);
  return {
    dateien,
    gesamtGroesse: vollstaendige.reduce((summe, d) => summe + d.groesse, 0),
    anzahlLadbar: dateien.filter((d) => d.ladbar).length,
    anzahlUnvollstaendig: dateien.length - vollstaendige.length,
    // Nur VOLLSTÄNDIGE `scanning`-Zeilen: eine Zeile ohne Bytes ist beim Scanner
    // nie angekommen. Zählte sie mit, liefe ein abgebrochener Upload stundenlang
    // als Wartezustand mit Selbstaktualisierung — bis der Aufräum-Lauf ihn
    // abholt (§7.6).
    mindestensEineWirdGeprueft: vollstaendige.some((d) => d.avStatus === "scanning"),
    alleUnvollstaendig: vollstaendige.length === 0,
  };
}

/** Die Rangfolge des Sammelwerts: der ungünstigste Zustand gewinnt, damit die
 *  Liste nicht „freigegeben" sagt, während eine Datei gesperrt ist. Gerechnet
 *  wird über die VOLLSTÄNDIGEN Zeilen — dieselbe Menge wie `alleUnvollstaendig`,
 *  sonst widersprächen Liste und Detailseite einander. */
function sammelwert(dateien: ShareDatei[]): AvSammelwert {
  const zustaende = dateien.filter((d) => d.vollstaendig).map((d) => d.avStatus);
  if (zustaende.length === 0) return "leer";
  if (zustaende.includes("infected")) return "gesperrt";
  if (zustaende.includes("error")) return "pruefungFehlt";
  if (zustaende.includes("scanning")) return "wirdGeprueft";
  if (zustaende.includes("unscanned")) return "ungeprueft";
  return "freigegeben";
}

async function ladeInhalt(shareId: string): Promise<ShareInhalt> {
  const rohe = getDb()
    .select(DATEI_SPALTEN)
    .from(shareFiles)
    .where(eq(shareFiles.shareId, shareId))
    .orderBy(asc(shareFiles.createdAt), asc(shareFiles.id))
    .all() as RohDatei[];
  return fasseZusammen(await Promise.all(rohe.map(zuDatei)));
}

// ---------------------------------------------------------------------------

/**
 * Die EINE Ladefunktion. Sie **zählt nichts hoch** — kein `UPDATE` in dieser
 * Datei, geprüft im Quelltext-Scan von `queries.test.ts`.
 */
export async function ladeShare(anfrage: ShareAnfrage): Promise<ShareLadung> {
  const jetzt = anfrage.jetzt ?? new Date();

  // Stufe 1 — Existenz.
  const rohKopf = getDb()
    .select(KOPF_SPALTEN)
    .from(shares)
    .where(eq(shares.id, anfrage.shareId))
    .get() as RohKopf | undefined;
  if (!rohKopf) return { zustand: "unbekannt" };
  const kopf = zuKopf(rohKopf);

  // Stufe 2 — Ablauf. Gleichstand ist abgelaufen: `expires_at` bezeichnet das
  // Ende der Laufzeit, nicht den letzten gültigen Augenblick.
  if (kopf.ablaufAt.getTime() <= jetzt.getTime())
    return { zustand: "abgelaufen", titel: kopf.titel };

  // Stufe 3 — Passwort-Cookie. GENAU EIN Annahmeweg: kein Bestandslink-Sonderweg,
  // keine Karenz, kein zweites Prädikat (§7.4). Der Cookie-Name entsteht erst
  // hier, aus der GEFUNDENEN Zeile.
  if (kopf.hatPasswort) {
    const wert = anfrage.cookieLeser?.(cookieName(kopf.id));
    if (!istCookieGueltig(kopf.id, wert, jetzt)) {
      return { zustand: "passwortNoetig", titel: kopf.titel };
    }
  }

  // Erst ab hier wird das Dateisystem angefasst: ein unberechtigter Aufruf löst
  // keine Blob-Proben aus.
  const inhalt = await ladeInhalt(kopf.id);

  // Stufe 4 — die gewählte Datei und ihr AV-Status.
  let datei: ShareDatei | null = null;
  if (anfrage.dateiId) {
    // Die Zeile wird über den PRIMÄRSCHLÜSSEL geholt und die Zugehörigkeit
    // danach GEPRÜFT. Das ist die einzige serverseitige
    // Objekt-Zugehörigkeitsprüfung, die die Alt-App hatte
    // (`download/[id]/route.ts:64`, `preview/route.ts:83`) — dort dreimal in
    // drei Routen, hier einmal. Sie ist keine Ownership-Frage (die gibt es
    // nicht, §2.4), sondern die Zusammengehörigkeit zweier IDs. Ohne sie lädt
    // jede `fileId` über jede gültige `shareId`.
    const rohDatei = getDb()
      .select(DATEI_SPALTEN)
      .from(shareFiles)
      .where(eq(shareFiles.id, anfrage.dateiId))
      .get() as RohDatei | undefined;
    if (!rohDatei || rohDatei.shareId !== kopf.id) return { zustand: "dateiNichtGefunden" };

    datei = await zuDatei(rohDatei);
    // Eine Zeile ohne Bytes ist nicht ladbar (§4.4) und für einen Byte-Weg
    // dasselbe wie „gibt es nicht" — ihre Existenz ist ein Zustand der
    // Verwaltung, keine Auskunft für einen Empfänger.
    if (!datei.vollstaendig) return { zustand: "dateiNichtGefunden" };
    // AV VOR dem Blob: sonst verrät der Statuscode (403 gegen 404), ob zu einer
    // gesperrten Datei überhaupt Bytes liegen.
    if (!datei.freigegeben) return { zustand: "gesperrt", avStatus: datei.avStatus };
    if (datei.blobFehlt) return { zustand: "blobFehlt" };
  }

  // Stufe 5 — Limit, LESEND. `maxDownloads === null` heisst unbegrenzt; `0`
  // heisst erschöpft. Ein `||` an dieser Stelle machte aus „0 Downloads" still
  // einen unbegrenzten Share — dieselbe Klasse wie `maxDownloads || null` beim
  // Schreiben (Alt: `init/route.ts:59`).
  if (kopf.maxDownloads !== null && kopf.downloadCount >= kopf.maxDownloads) {
    return { zustand: "limitErreicht", titel: kopf.titel };
  }

  return { zustand: "offen", share: kopf, inhalt, datei };
}

/**
 * Die Zeilen der Freigaben-Übersicht (§7.3).
 *
 * **Ohne Blob-Proben**, und das ist entschieden: die Übersicht zeigt n Shares mit
 * m Dateien, das wären n×m `stat`-Aufrufe für eine Spalte, die „nicht
 * auffindbar" ohnehin erst auf der Detailseite je Zeile ausweist (§10.1).
 */
export async function ladeUebersicht(): Promise<UebersichtZeile[]> {
  const db = getDb();
  const koepfe = db
    .select({ ...KOPF_SPALTEN, erstelltVon: shares.createdBy, erstelltAt: shares.createdAt })
    .from(shares)
    .orderBy(desc(shares.createdAt), desc(shares.id))
    .all() as (RohKopf & { erstelltVon: string; erstelltAt: Date })[];

  // EINE Abfrage für alle Zeilen statt einer je Share: die Gruppierung in
  // JavaScript ist billiger als n+1 Abfragen und trägt dieselbe Summe wie
  // `ladeShareDetail` — dieselbe Spalte, dieselbe Bedingung.
  const alleDateien = db
    .select(DATEI_SPALTEN)
    .from(shareFiles)
    .orderBy(asc(shareFiles.createdAt), asc(shareFiles.id))
    .all() as RohDatei[];

  const jeShare = new Map<string, ShareDatei[]>();
  for (const roh of alleDateien) {
    const eintrag: ShareDatei = {
      id: roh.id,
      dateiname: roh.dateiname,
      mimeType: roh.mimeType,
      groesse: roh.groesse,
      gemesseneGroesse: null,
      blobFehlt: false,
      vollstaendig: roh.bytesVollstaendigAt !== null,
      avStatus: alsAvStatus(roh.avStatus),
      freigegeben: istFreigegeben(alsAvStatus(roh.avStatus)),
      ladbar: false,
      angelegtAt: roh.angelegtAt,
    };
    const liste = jeShare.get(roh.shareId);
    if (liste) liste.push(eintrag);
    else jeShare.set(roh.shareId, [eintrag]);
  }

  return koepfe.map(({ erstelltVon, erstelltAt, ...rohKopf }) => {
    const dateien = jeShare.get(rohKopf.id) ?? [];
    const zusammen = fasseZusammen(dateien);
    return {
      ...zuKopf(rohKopf),
      anzahlDateien: dateien.length - zusammen.anzahlUnvollstaendig,
      anzahlUnvollstaendig: zusammen.anzahlUnvollstaendig,
      gesamtGroesse: zusammen.gesamtGroesse,
      avSammelwert: sammelwert(dateien),
      erstelltVon,
      erstelltAt,
    };
  });
}

/**
 * Die Detailseite (§7.3). Mit Blob-Proben, weil hier jede Zeile ihren Zustand
 * ausweist — auch „nicht auffindbar" (§10.1).
 *
 * `null` statt eines Wurfs: `notFound()` gehört in die Seite, nicht in eine
 * Abfrage. Diese Funktion trägt **keine** Prüfkette — die Verwaltung ist
 * gegatet (`requireFilesAccess`), nicht passwortgeschützt.
 */
export async function ladeShareDetail(shareId: string): Promise<ShareDetail | null> {
  const roh = getDb()
    .select({ ...KOPF_SPALTEN, erstelltVon: shares.createdBy, erstelltAt: shares.createdAt })
    .from(shares)
    .where(eq(shares.id, shareId))
    .get() as (RohKopf & { erstelltVon: string; erstelltAt: Date }) | undefined;
  if (!roh) return null;

  const { erstelltVon, erstelltAt, ...rohKopf } = roh;
  const inhalt = await ladeInhalt(rohKopf.id);
  return { ...zuKopf(rohKopf), ...inhalt, erstelltVon, erstelltAt };
}

/**
 * Das Audit-Log eines Shares, jüngste Zeile zuerst (§7.8).
 *
 * `gibtMehr` entsteht aus `grenze + 1` gelesenen Zeilen — kein zweites `COUNT`,
 * das mit der ersten Abfrage auseinanderlaufen könnte. Die KLEMMUNG von `grenze`
 * (Vorgabe 100, Vielfaches, Obergrenze) gehört zur Seite, die den
 * Suchparameter `?logs=<n>` entgegennimmt: sie kennt ihren Nachladeweg, diese
 * Funktion nicht.
 *
 * Das Log hat **keinen** FK auf `shares` und stirbt nicht mit dem Share (§4.5) —
 * es kann also Zeilen zu einem Share liefern, den es nicht mehr gibt.
 */
export async function ladeAuditLog(
  shareId: string,
  grenze: number,
): Promise<{ zeilen: AuditZeile[]; gibtMehr: boolean }> {
  const rohe = getDb()
    .select({
      id: downloadLogs.id,
      dateiId: downloadLogs.fileId,
      clientIpUnbestaetigt: downloadLogs.clientIpUnbestaetigt,
      userAgent: downloadLogs.userAgent,
      zeit: downloadLogs.downloadedAt,
    })
    .from(downloadLogs)
    .where(eq(downloadLogs.shareId, shareId))
    .orderBy(desc(downloadLogs.downloadedAt), desc(downloadLogs.id))
    .limit(grenze + 1)
    .all() as AuditZeile[];

  return { zeilen: rohe.slice(0, grenze), gibtMehr: rohe.length > grenze };
}

/**
 * **Der einzige Weg, auf dem `password_hash` die Datenbank verlässt** — und er
 * endet in `bcryptVerify`, nicht in einem Rendering. Aufrufer ist ausschliesslich
 * `POST /api/s/<id>/verify` (§7.4); der Name sagt es, damit ein Blick in die
 * Aufruferliste genügt.
 *
 * `null` für einen unbekannten Share, und der Aufrufer antwortet darauf
 * **401**, nicht 404: das Orakel ist geschlossen, „existiert nicht", „existiert
 * ohne Passwort" und „falsches Passwort" sind ununterscheidbar. Ein
 * passwortfreier Share liefert `passwortHash: null`, und `bcryptVerify` weist
 * das ab (`passwort.ts:96-105`) — „hat kein Passwort" beantwortet nicht die
 * Frage „ist dieses Passwort richtig".
 *
 * `ablaufAt` kommt mit, weil das Cookie auf `min(4 h, Restlaufzeit)` begrenzt
 * wird; ohne die zweite Hälfte überlebte die Entsperrung den Share.
 */
export async function ladeVerifikationsdaten(
  shareId: string,
): Promise<{ passwortHash: string | null; ablaufAt: Date } | null> {
  const roh = getDb()
    .select({ passwortHash: shares.passwordHash, ablaufAt: shares.expiresAt })
    .from(shares)
    .where(eq(shares.id, shareId))
    .get();
  return roh ?? null;
}

/*
 * Was hier ABSICHTLICH nicht steht: eine eigene Abfrage für das ZIP. Die Menge,
 * aus der das Archiv entsteht, ist `ladeShare(...).inhalt.dateien` — dieselben
 * Zeilen, die die Seite zeigt, samt `vollstaendig`, `freigegeben` und
 * `blobFehlt`. Der AUSSCHLUSS und die `_HINWEIS.txt` entscheiden sich in
 * `_lib/zip.ts` (T21). Eine zweite Abfrage mit einem `WHERE` „nur die
 * vollständigen" wäre eine zweite Definition derselben Menge, und genau daran
 * laufen die beiden Größenangaben der Alt-App auseinander.
 */
