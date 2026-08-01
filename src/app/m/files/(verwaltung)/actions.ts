"use server";

/**
 * DIE SERVER ACTIONS DER FILESHARE-VERWALTUNG (Spec §7.1).
 *
 * Heute steht hier `anlegenAction`; `bearbeitenAction`,
 * `downloadsAufstockenAction` und `shareLoeschenAction` kommen in T37 dazu.
 *
 * DREI FESTLEGUNGEN, DIE DIESE DATEI TRAEGT:
 *
 * 1. **Jede** Funktion hier ruft `requireFilesAccess()` SELBST. Eine Seiten-
 *    oder Layout-Pruefung erstreckt sich NICHT auf die Actions darunter
 *    (mitgelieferte Next-Doku, `data-security.md:282,329`), und in der Alt-App
 *    fehlte `auth()` in ALLEN DREI Actions (`dashboard/actions.ts`).
 *    `actions.test.ts` haelt das als Quelltext-Zusicherung ueber das ganze
 *    Modul fest — nicht nur ueber die Actions, die es heute gibt.
 * 2. **Metadaten per Action, Bytes per Route Handler** (§7.1, Analyse E6): die
 *    Nutzlast dieser Datei ist reiner Text, die 1-MB-Grenze fuer Server Actions
 *    damit unerreichbar. Die Bytes gehen chunkweise ueber
 *    `PUT /api/upload/<fileId>` — der einzige Weg, der die STILLE Kappung des
 *    Next-Proxys bei 10 MiB umgeht (§7.1).
 * 3. **Feldfehler werden ZURUECKGEGEBEN, nicht geworfen.** Eine geworfene
 *    Ausnahme landet auf der technischen Fehlerseite und nimmt die Eingaben mit
 *    (`docs/design/README.md:245-247`). Zugriffsverletzungen gehoeren NICHT
 *    dazu: `requireFilesAccess` wirft weiter (`redirect`/`notFound`).
 *
 * ZEITSTEMPEL SIND UNIX-SEKUNDEN (`mode: "timestamp"`, `_db/schema.ts:4-13`).
 * Hier wird deshalb ein `Date` uebergeben und NICHT selbst gerechnet — Drizzle
 * setzt die Sekunden. Ein Faktor-1000-Fehler waere paritaetsgruen: entweder
 * laeuft nie ein Share ab, oder alles ist sofort abgelaufen.
 */

import { revalidatePath } from "next/cache";
import { nanoid } from "nanoid";

import { getDb } from "../_db/client";
import { shareFiles, shares } from "../_db/schema";
import { requireFilesAccess } from "../_lib/access";
import { grenzen } from "../_lib/grenzen";
import { bcryptHash } from "../_lib/passwort";

/**
 * Der Ausgang eines Formularlaufs.
 *
 * `werte` traegt die Eingaben zurueck, damit `defaultValue` sie wieder
 * einsetzen kann — **ohne das Passwort**: es kaeme im RSC-Payload derselben
 * Antwort an den Browser zurueck und stuende als Attribut im Markup.
 *
 * Der Erfolgszweig liefert `shareId` und je gemeldeter Datei `fileId` und
 * `name`: genau das, was die Upload-Insel braucht, um die Bytes an
 * `PUT /api/upload/<fileId>` zu schicken (§7.1 Schritt 1).
 */
export type AnlegenErgebnis =
  | { ok: true; shareId: string; dateien: { fileId: string; name: string }[] }
  | { ok: false; feldFehler: Record<string, string>; werte: Record<string, string> };

/**
 * Kanonische, vorzeichenlose Ganzzahl — bewusst NICHT `Number()`.
 * `Number("0x10")` ist 16 und `Number("1e1")` ist 10; eine Pruefung ueber
 * `Number` allein liesse beides durch, und die geltende Laufzeit waere eine
 * andere als die, die im Feld stand. `"1.5"` und `"-1"` fallen mit derselben
 * Zeile heraus. Dieselbe Bauform wie `GANZZAHL` in `_lib/grenzen.ts`.
 */
const GANZZAHL = /^\d+$/;

/**
 * Mindestlaenge eines NEU gesetzten Share-Passworts (§7.1: „Passwort optional,
 * bei gesetztem Wert Mindestlaenge").
 *
 * Sie gilt nur beim Setzen. Bestandspasswoerter bleiben unberuehrt — sie liegen
 * bei ihren Empfaengern, und eine nachtraeglich erzwungene Laenge machte jeden
 * kuerzer geschuetzten Bestands-Share unoeffenbar.
 *
 * WARUM SIE HIER STEHT UND NICHT IN `_lib/grenzen.ts`: nicht aus Prinzip —
 * dort liegen sehr wohl auch reine Konstanten (`FILES_CHUNK_BYTES`,
 * `FILES_HINWEIS_MAX_ZEICHEN`, `FILES_FEHLVERSUCHE_PRO_MIN`). Der Grund ist
 * mechanisch: T26 besitzt `_lib/grenzen.ts` nicht, und eine `"use server"`-Datei
 * darf ausser asynchronen Funktionen NICHTS exportieren — das Formular in T35
 * kann die Zahl von hier also gar nicht lesen und muesste sie abschreiben.
 * Deshalb gehoert sie mittelfristig nach `_lib/grenzen.ts`; bis dahin ist
 * dieser Kommentar die Fundstelle.
 */
const PASSWORT_MIN_ZEICHEN = 8;

/**
 * Der MIME-Typ einer Zeile, durch die noch kein Byte geflossen ist. Er wird
 * beim letzten Chunk durch den serverseitig FESTGESTELLTEN Typ ersetzt
 * (Magic Bytes, §8.5) — nie durch die Client-Deklaration wie in der Alt-App.
 */
const PLATZHALTER_MIME = "application/octet-stream";

const SEKUNDEN_PRO_TAG = 86_400;

/**
 * Der INTERNE Pfad, wie ihn `revalidatePath` braucht — nicht der per Host
 * gerouteten Wurzel `/`. Dieselbe Form wie in `qr/actions.ts` und im Portal.
 * Dort haengt die Freigaben-Uebersicht (`page.tsx`, Zweig `verwaltung`), und
 * ohne diese Zeile fehlte die frisch angelegte Freigabe in der Liste.
 */
const INTERNER_PFAD = "/m/files";

/** Ein Textfeld, immer als String — `FormData.get` liefert auch `File`. */
function feld(formData: FormData, name: string): string {
  const wert = formData.get(name);
  return typeof wert === "string" ? wert : "";
}

/** `null`, wenn der Text keine kanonische Ganzzahl ist. */
function ganzzahl(text: string): number | null {
  const gestutzt = text.trim();
  return GANZZAHL.test(gestutzt) ? Number(gestutzt) : null;
}

/**
 * EINE FREIGABE ANLEGEN — Metadaten und die Zeilen ohne Bytes.
 *
 * Die Reihenfolge im Rumpf ist verbindlich:
 * **Riegel → Validierung VOLLSTAENDIG → erst dann der erste `INSERT`.**
 *
 * - Der Riegel steht vorn, damit eine nicht berechtigte Person nicht einmal
 *   erfaehrt, welche Felder es gibt.
 * - Die Validierung sammelt ALLE Feldfehler, bevor sie ablehnt: sonst
 *   korrigiert man das Formular Runde um Runde.
 * - Und sie liegt VOR dem ersten `INSERT`. Bei
 *   `FILES_MAX_DATEIEN_PRO_SHARE + 1` gemeldeten Dateien entsteht deshalb
 *   keine einzige Zeile — sonst waere der halb angelegte Share genau der
 *   Zustand, den §4.4 vermeiden will, und der Aufraeum-Timer holte ihn erst
 *   nach `FILES_UPLOAD_VERFALL_STUNDEN` ab. Die Dateiliste kommt vom Client;
 *   ein Aufruf mit 50.000 gemeldeten Dateien legte in der Alt-App 50.000
 *   Zeilen an, ohne dass ein Byte fliesst (§7.1).
 */
export async function anlegenAction(formData: FormData): Promise<AnlegenErgebnis> {
  const viewer = await requireFilesAccess();
  const grenze = grenzen();

  // Ohne das Passwort — siehe `AnlegenErgebnis`.
  const werte: Record<string, string> = {
    title: feld(formData, "title"),
    description: feld(formData, "description"),
    expiryDays: feld(formData, "expiryDays"),
    maxDownloads: feld(formData, "maxDownloads"),
  };
  const passwort = feld(formData, "password");
  const feldFehler: Record<string, string> = {};

  const titel = werte.title.trim();
  if (titel === "") feldFehler.title = "Bitte einen Titel angeben.";

  /*
   * Die Laufzeit wird bei JEDEM Speichern gedeckelt, nicht nur hier: `updateShare`
   * schrieb in der Alt-App `now + expiryDays*86400` ohne Deckelung, und das
   * Formular belegte `expiryDays` mit `useState(1)` vor — wer nur den Titel
   * korrigierte, verkuerzte den Share still auf 24 Stunden. Deshalb gibt es hier
   * auch KEINE Vorbelegung fuer ein leeres Feld: ein geratener Wert ist genau
   * dieser Defekt in gruen.
   */
  let tage = 0;
  const gemeldeteTage = ganzzahl(werte.expiryDays);
  if (gemeldeteTage === null || gemeldeteTage < 1 || gemeldeteTage > grenze.maxAblaufTage) {
    feldFehler.expiryDays = `Laufzeit in ganzen Tagen, 1 bis ${grenze.maxAblaufTage}.`;
  } else {
    tage = gemeldeteTage;
  }

  /*
   * LEER heisst NULL heisst unbegrenzt; `0` ist eine ABLEHNUNG. Die Alt-Zeile
   * `maxDownloads || null` machte aus „0 Downloads" still einen unbegrenzten
   * Share (§4.1). Ein `??` statt `||` allein reichte nicht — es machte daraus
   * einen sofort erschoepften Share. Nur die Ablehnung sagt, was gemeint war.
   */
  let maxDownloads: number | null = null;
  const gemeldetesLimit = werte.maxDownloads.trim();
  if (gemeldetesLimit !== "") {
    const zahl = ganzzahl(gemeldetesLimit);
    if (zahl === null || zahl < 1) {
      feldFehler.maxDownloads =
        "Download-Limit als ganze Zahl ab 1 — leer lassen heisst unbegrenzt.";
    } else {
      maxDownloads = zahl;
    }
  }

  // Nicht gestutzt: fuehrende und schliessende Leerzeichen sind Teil eines
  // Passworts. Gezaehlt wird in Code Points, damit ein Emoji nicht als zwei
  // Zeichen durchgeht.
  if (passwort !== "" && [...passwort].length < PASSWORT_MIN_ZEICHEN) {
    feldFehler.password = `Das Passwort braucht mindestens ${PASSWORT_MIN_ZEICHEN} Zeichen.`;
  }

  // Gestutzt wird hier UND beim Schreiben derselbe Wert: pruefte die Validierung
  // den gestutzten Namen und die Zeile truege den rohen, hiesse eine Datei
  // gleich „   ".
  const namen = formData
    .getAll("dateien")
    .map((wert) => (typeof wert === "string" ? wert.trim() : ""));
  if (namen.length === 0) {
    feldFehler.dateien = "Bitte mindestens eine Datei auswählen.";
  } else if (namen.some((name) => name === "")) {
    feldFehler.dateien = "Eine gemeldete Datei hat keinen Namen.";
  } else if (namen.length > grenze.maxDateienProShare) {
    feldFehler.dateien =
      `Höchstens ${grenze.maxDateienProShare} Dateien je Freigabe ` +
      `(gemeldet: ${namen.length}).`;
  }

  if (Object.keys(feldFehler).length > 0) return { ok: false, feldFehler, werte };

  const jetzt = new Date();
  const shareId = nanoid(10);
  const dateien = namen.map((name) => ({ fileId: nanoid(10), name }));
  const beschreibung = werte.description.trim();

  /*
   * EINE Transaktion fuer Kopf und Zeilen. Ohne sie hinterliesse ein Fehler
   * mitten in der Schleife einen Share mit zu wenigen Zeilen — sichtbar, aber
   * unvollstaendig, und niemand koennte die fehlenden Dateien nachreichen.
   */
  getDb().transaction((tx) => {
    tx.insert(shares)
      .values({
        id: shareId,
        title: titel,
        // Leer heisst NULL, nicht "": die Spalte ist nullable, und eine leere
        // Zeichenkette waere ein zweiter Ausdruck fuer „keine Beschreibung".
        description: beschreibung === "" ? null : beschreibung,
        // Kleingeschrieben, 1:1-Pflicht (§4.2). Das Schema traegt bewusst KEINEN
        // CHECK — diese Zeile ist die setzende Seite. Neu abgeleitet wird der
        // Wert danach an genau EINER weiteren Stelle: beim Abbruch
        // `DELETE /api/upload/<fileId>` (T27), wo die Dateizahl sinken kann.
        type: dateien.length === 1 ? "file" : "folder",
        expiresAt: new Date(jetzt.getTime() + tage * SEKUNDEN_PRO_TAG * 1000),
        maxDownloads,
        downloadCount: 0,
        // bcryptjs, cost 12, Praefix `$2b$12$` — auch fuer NEUE Passwoerter
        // (§4.2): ein Wechsel der Hash-Familie machte jeden geschuetzten
        // Bestands-Share unoeffenbar.
        passwordHash: passwort === "" ? null : bcryptHash(passwort),
        // 0 und nicht die Client-Selbstauskunft: `total_size` ist die GEMESSENE
        // Bytesumme (§4.2) und entsteht erst, wenn Bytes geflossen sind.
        totalSize: 0,
        createdAt: jetzt,
        // Reines Audit-Feld (§4.2). `viewer.sub` ist der OIDC-`sub` und immer
        // gesetzt: ohne `user.id` liefert `viewerAusSession` keinen Viewer, und
        // `requireFilesAccess` ist dann schon in die Anmeldung gesprungen. Ein
        // `?? "unbekannt"` waere hier unerreichbarer Code, der aussaehe wie ein
        // Riegel.
        createdBy: viewer.sub,
      })
      .run();

    for (const datei of dateien) {
      tx.insert(shareFiles)
        .values({
          id: datei.fileId,
          shareId,
          // NUR Anzeige, `Content-Disposition` und ZIP-Eintragsname — NIE Teil
          // eines Pfades (§4.6). Der Name wird hier nicht weiter bereinigt: das
          // geschieht an der Grenze, an der er wirklich ein Pfad wird
          // (`_lib/zip.ts:eintragsname`), und eine zweite Bereinigung hier
          // aenderte Namen, die heute funktionieren.
          filename: datei.name,
          mimeType: PLATZHALTER_MIME,
          size: 0,
          // Alle Zeilen einer Freigabe tragen DENSELBEN Zeitpunkt — sie
          // entstehen in einem Aufruf. Die Anzeige sortiert deshalb ueber die
          // ID (`_db/queries.ts:ladeInhalt`).
          createdAt: jetzt,
          // NULL = Upload nicht abgeschlossen (§4.4). Der Zwischenzustand
          // „Zeile ohne Bytes" ist damit SICHTBAR: zaehlt nicht in `total_size`,
          // nicht herunterladbar, nicht im ZIP — und der Aufraeum-Timer holt ihn
          // samt `.part` ab. In der Alt-App war er unsichtbar und dauerhaft.
          bytesVollstaendigAt: null,
          // Der Startwert gehoert zum Upload-Weg, nicht in einen SQL-Default
          // (§4.6). Eingereiht wird der Scan erst, wenn Bytes vorliegen (T27) —
          // bis dahin ist `scanning` der ehrliche Zustand: nicht freigegeben.
          avStatus: "scanning",
          avGeprueftAt: null,
        })
        .run();
    }
  });

  revalidatePath(INTERNER_PFAD);
  return { ok: true, shareId, dateien };
}
