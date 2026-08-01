"use server";

/**
 * DIE SERVER ACTIONS DER FILESHARE-VERWALTUNG (Spec §7.1).
 *
 * Hier stehen `anlegenAction`, `bearbeitenAction`, `downloadsAufstockenAction`,
 * `shareLoeschenAction` und `avWiederholenAction` — mehr Schreibwege hat die
 * Fileshare-Verwaltung nicht. Die letzte bedient zusaetzlich den Posteingang:
 * beide Tabellen fuehren denselben AV-Zustand (§4.6), und zwei Actions darueber
 * waeren zwei Statusmodelle.
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
import { eq, isNotNull, and, sql } from "drizzle-orm";
import { nanoid } from "nanoid";

import { getDb } from "../_db/client";
import { inboxFiles, shareFiles, shares } from "../_db/schema";
import { requireFilesAccess } from "../_lib/access";
import { reiheAvEin } from "../_lib/av";
import { grenzen } from "../_lib/grenzen";
import { bcryptHash } from "../_lib/passwort";
import { loesche, loescheShareVerzeichnis } from "../_lib/storage";

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

// ===========================================================================
// T37 — bearbeiten, Downloads aufstocken, loeschen
// ===========================================================================

/**
 * Der Ausgang der drei Verwaltungsaktionen. Ein EIGENER Typ neben
 * `AnlegenErgebnis`, weil keine von ihnen etwas zurueckzugeben hat ausser „hat
 * geklappt": der Aufrufer kennt die ID schon.
 *
 * Die Feldnamen sind `feldFehler`/`werte` wie in `AnlegenErgebnis` und NICHT
 * `fieldErrors`/`values` wie bei den Abgabelinks — wer aus DIESER Datei
 * importiert, soll nicht zwei Vokabulare unterscheiden muessen. Die
 * Bauform (`(_vorher, formData)`) folgt dagegen den Abgabelinks: sie ist die
 * Form, die `useActionState` verlangt, und die Fehler muessen am Feld ankommen
 * (`docs/design/README.md:245-247`).
 */
export type ShareFormZustand =
  | { ok: true }
  | { ok: false; feldFehler: Record<string, string>; werte: Record<string, string> };

/**
 * `revalidatePath` mit `"layout"` statt der einen Seite, anders als
 * `anlegenAction`: eine Aenderung an einer Freigabe ist auf der Uebersicht `/`
 * UND auf `/shares/<id>` sichtbar, und beim Loeschen muss die Detailseite ihren
 * `notFound()`-Zweig neu bekommen. `"layout"` frischt das Segment mit allen
 * Unterrouten auf. Der INTERNE Pfad, nicht der per Host geroutete.
 *
 * `revalidatePath` ist im Test gemockt — diese Wahl faellt also in keinem
 * Testlauf auf, und deshalb steht sie hier ausgeschrieben.
 */
function auffrischenMitUnterrouten(): void {
  revalidatePath(INTERNER_PFAD, "layout");
}

/**
 * Die MITGESCHICKTEN Textfelder, zum Wiedereinsetzen per `defaultValue` — ohne
 * das Passwort (siehe `AnlegenErgebnis`).
 */
function mitgeschickt(formData: FormData, namen: string[]): Record<string, string> {
  const werte: Record<string, string> = {};
  for (const name of namen) if (formData.has(name)) werte[name] = feld(formData, name);
  return werte;
}

/**
 * Die Schalterwerte, die ein Kontrollkaestchen bzw. ein verstecktes Feld
 * erzeugt. `"on"` gehoert dazu, weil ein `<input type="checkbox">` ohne
 * `value`-Attribut genau das sendet — ohne diesen Wert waere „Passwort
 * entfernen" im Formular still wirkungslos.
 *
 * NICHT derselbe Wertebereich wie `SCHALTER_AN` in `_lib/grenzen.ts`
 * (`["1","true"]`, fuer .env-Schalter): `"on"` gehoert nur hierher, weil es aus
 * einem Formular kommt und nicht aus einer Konfigurationszeile. Beide sind
 * modulprivat — der Name lautet hier deshalb `KAESTCHEN_AN` und nicht noch
 * einmal `SCHALTER_AN`, damit eine spaetere Zusammenlegung nicht still eine der
 * beiden Seiten aendert (§9.1, das „truegerische Paar").
 */
const KAESTCHEN_AN = ["1", "true", "on"];

function istGesetzt(formData: FormData, name: string): boolean {
  return KAESTCHEN_AN.includes(feld(formData, name).trim().toLowerCase());
}

/** Existiert die Freigabe? Bewusst mit Spaltenliste — `select()` ohne Argument
 *  ist im Modul nicht erlaubt (§7.3, Analyse Falle 11). */
function shareExistiert(id: string): boolean {
  return (
    getDb().select({ id: shares.id }).from(shares).where(eq(shares.id, id)).get() !== undefined
  );
}

const UNBEKANNT = "Diese Freigabe gibt es nicht (mehr).";

/**
 * EINE FREIGABE BEARBEITEN.
 *
 * **Die Regel dieser Action in einem Satz: geaendert wird nur, was die
 * `FormData` MITBRINGT.** Ein Feld, das nicht dabei ist, wird nicht angefasst.
 * Das ist die Antwort auf den Alt-Defekt aus §7.3: `updateShare` schrieb
 * `expires_at` bedingungslos, und das Formular belegte `expiryDays` mit
 * `useState(1)` vor — wer nur den Titel korrigierte, verkuerzte den Share auf
 * 24 Stunden.
 *
 * ZWEI FELDER LESEN AUCH EINEN LEEREN WERT ALS „NICHT ANGEFASST", und beide
 * Male ist der Grund derselbe: ein versehentliches Schreiben waere dort
 * ZERSTOEREND, ein versehentliches Nicht-Schreiben nur folgenlos.
 * - `expiryDays` leer → `expires_at` bleibt. Ein „auf 0 Tage" gaebe es sonst
 *   durch die Hintertuer, obwohl 0 ausdruecklich abgelehnt wird.
 * - `password` leer → der Hash bleibt. Sonst entzoege jede Titelkorrektur einem
 *   Share seinen Schutz, waehrend der Empfaenger den Link weiter fuer
 *   geschuetzt haelt. Das ENTFERNEN braucht deshalb ein eigenes Signal
 *   (`passwortEntfernen`).
 *
 * `description` und `maxDownloads` lesen einen leeren Wert dagegen als Loeschen
 * bzw. „unbegrenzt" — dort ist die leere Eingabe die EINZIGE Art, den Zustand
 * ueberhaupt zu erreichen, und sie ist verlustfrei umkehrbar.
 *
 * Die Deckelung auf `FILES_MAX_ABLAUF_TAGE` steht HIER und nicht (nur) als
 * HTML-Attribut: in der Alt-App waren ueber einen direkten Action-Aufruf 0,
 * negative und beliebig grosse Werte moeglich (§7.3, Punkt 2).
 */
export async function bearbeitenAction(
  _vorher: ShareFormZustand,
  formData: FormData,
): Promise<ShareFormZustand> {
  await requireFilesAccess();
  const grenze = grenzen();

  const werte = mitgeschickt(formData, [
    "id",
    "title",
    "description",
    "expiryDays",
    "maxDownloads",
  ]);
  const feldFehler: Record<string, string> = {};

  const id = feld(formData, "id").trim();
  if (id === "" || !shareExistiert(id)) {
    return { ok: false, feldFehler: { id: UNBEKANNT }, werte };
  }

  /*
   * Ein Teilbild der Zeile, gesammelt VOR dem ersten Schreiben. Ein `UPDATE` je
   * Feld waere sonst teilweise wirksam, sobald ein spaeteres Feld einen
   * Feldfehler traegt — und der Betreiber saehe eine Fehlermeldung neben einer
   * halb uebernommenen Aenderung.
   */
  const aenderung: {
    title?: string;
    description?: string | null;
    expiresAt?: Date;
    maxDownloads?: number | null;
    passwordHash?: string | null;
  } = {};

  if (formData.has("title")) {
    const titel = werte.title.trim();
    if (titel === "") feldFehler.title = "Bitte einen Titel angeben.";
    else aenderung.title = titel;
  }

  if (formData.has("description")) {
    // Leer heisst NULL, nicht "": die Spalte ist nullable, und eine leere
    // Zeichenkette waere ein zweiter Ausdruck fuer „keine Beschreibung".
    const beschreibung = werte.description.trim();
    aenderung.description = beschreibung === "" ? null : beschreibung;
  }

  // `feld` liefert fuer ein FEHLENDES Feld dieselbe leere Zeichenkette wie fuer
  // ein leeres — und genau das ist hier gewollt: beides heisst „nicht
  // angefasst". Deshalb steht hier KEIN `formData.has(…)` wie bei den anderen
  // drei Feldern.
  const gemeldeteTage = feld(formData, "expiryDays").trim();
  if (gemeldeteTage !== "") {
    const tage = ganzzahl(gemeldeteTage);
    if (tage === null || tage < 1 || tage > grenze.maxAblaufTage) {
      feldFehler.expiryDays = `Laufzeit in ganzen Tagen, 1 bis ${grenze.maxAblaufTage}.`;
    } else {
      // Wie beim Anlegen: ein `Date` an Drizzle, das die SEKUNDEN setzt — hier
      // wird nichts selbst gerechnet (`_db/schema.ts:4-13`).
      aenderung.expiresAt = new Date(Date.now() + tage * SEKUNDEN_PRO_TAG * 1000);
    }
  }

  if (formData.has("maxDownloads")) {
    const gemeldetesLimit = werte.maxDownloads.trim();
    if (gemeldetesLimit === "") {
      aenderung.maxDownloads = null;
    } else {
      const zahl = ganzzahl(gemeldetesLimit);
      if (zahl === null || zahl < 1) {
        feldFehler.maxDownloads =
          "Download-Limit als ganze Zahl ab 1 — leer lassen heisst unbegrenzt.";
      } else {
        aenderung.maxDownloads = zahl;
      }
    }
  }

  // Nicht gestutzt: fuehrende und schliessende Leerzeichen sind Teil eines
  // Passworts. Gezaehlt wird in Code Points, damit ein Emoji nicht als zwei
  // Zeichen durchgeht.
  const passwort = feld(formData, "password");
  const entfernen = istGesetzt(formData, "passwortEntfernen");
  if (entfernen && passwort !== "") {
    // Kein stiller Vorrang: welche der beiden Absichten gewaenne, waere geraten.
    feldFehler.password =
      "Bitte entweder ein neues Passwort setzen ODER den Schutz entfernen, nicht beides.";
  } else if (entfernen) {
    aenderung.passwordHash = null;
  } else if (passwort !== "") {
    if ([...passwort].length < PASSWORT_MIN_ZEICHEN) {
      feldFehler.password = `Das Passwort braucht mindestens ${PASSWORT_MIN_ZEICHEN} Zeichen.`;
    } else {
      // bcryptjs, cost 12, Praefix `$2b$12$` — auch fuer NEUE Passwoerter
      // (§4.2).
      aenderung.passwordHash = bcryptHash(passwort);
    }
  }

  if (Object.keys(feldFehler).length > 0) return { ok: false, feldFehler, werte };

  // Ein `set({})` waere fuer Drizzle ein Fehler, und ein Formular ohne eine
  // einzige Aenderung ist kein Fehlerfall — es ist einfach nichts zu tun.
  if (Object.keys(aenderung).length > 0) {
    getDb().update(shares).set(aenderung).where(eq(shares.id, id)).run();
  }

  auffrischenMitUnterrouten();
  return { ok: true };
}

/**
 * DAS DOWNLOAD-LIMIT AUFSTOCKEN — das Gegenmittel zu §7.5.
 *
 * Ein abgebrochener Download ist dort ausdruecklich VERBRAUCHT (der Zaehler
 * laeuft atomar vor dem ersten Byte). Das ist die betreiberfreundliche
 * Richtung, und diese Action ist der Ausgleich dafuer.
 *
 * **Angegeben wird der ZUWACHS, nicht die neue Summe** — dieselbe Begruendung
 * wie bei `kontingentAufstockenAction` (§8.4): das `UPDATE` bleibt ein
 * `max_downloads + ?` und kann damit keinen gleichzeitig laufenden Download
 * ueberschreiben, und eine absolute Zahl liesse sich versehentlich NACH UNTEN
 * setzen — mitten in einem Vorgang. Der Feldname sagt es (`zusatzDownloads`).
 *
 * **`max_downloads IS NOT NULL` ist Teil der Bedingung, nicht Kosmetik.** Ein
 * unbegrenzter Share hat kein Limit, das man aufstocken koennte; in SQL waere
 * `NULL + 5` wieder `NULL`, die Zeile gaelte als geaendert, und der Betreiber
 * bekaeme eine Erfolgsmeldung fuer einen Vorgang, der nichts getan hat
 * (dieselbe Falle wie `budget + 0` bei den Abgabelinks).
 *
 * DIESE ACTION SETZT KEINEN ZEITSTEMPEL ZURUECK, und genau dafuer wurde
 * `limit_reached_at` gestrichen (`_db/schema.ts:29-33`): die Alt-Fassung setzte
 * die Spalte nur im Zweig `maxDownloads === null` zurueck, das ANHEBEN eines
 * Limits hinterliess also einen gesetzten Wert — 24 h spaeter antworteten drei
 * Auslieferungsrouten mit 410, und der Aufraeumjob loeschte den Share samt
 * Dateien. Der Admin wollte das Gegenteil.
 */
export async function downloadsAufstockenAction(
  _vorher: ShareFormZustand,
  formData: FormData,
): Promise<ShareFormZustand> {
  await requireFilesAccess();

  const werte = mitgeschickt(formData, ["id", "zusatzDownloads"]);
  const feldFehler: Record<string, string> = {};

  const id = feld(formData, "id").trim();
  if (id === "") feldFehler.id = UNBEKANNT;

  const zusatz = ganzzahl(feld(formData, "zusatzDownloads"));
  if (zusatz === null || zusatz < 1) {
    feldFehler.zusatzDownloads = "Bitte eine ganze Zahl ab 1 angeben.";
  }

  if (Object.keys(feldFehler).length > 0) return { ok: false, feldFehler, werte };

  const ergebnis = getDb()
    .update(shares)
    .set({ maxDownloads: sql`${shares.maxDownloads} + ${zusatz}` })
    .where(and(eq(shares.id, id), isNotNull(shares.maxDownloads)))
    .run();

  // Die Entscheidung ist die Zahl betroffener Zeilen, nie ein vorher gelesener
  // Wert (`_db/zaehler.ts`): ein `SELECT` davor und ein `UPDATE` danach waeren
  // zwei Schritte mit einem Fenster dazwischen.
  if (ergebnis.changes !== 1) {
    return {
      ok: false,
      feldFehler: {
        id:
          "Diese Freigabe hat kein Download-Limit (oder es gibt sie nicht mehr) — " +
          "aufstocken laesst sich nur ein gesetztes Limit.",
      },
      werte,
    };
  }

  auffrischenMitUnterrouten();
  return { ok: true };
}

/**
 * EINE FREIGABE LOESCHEN — Zeilen, Blobs und Zwischendateien.
 *
 * **Das Audit-Log bleibt.** `download_logs` traegt bewusst KEINEN
 * Fremdschluessel und kein Cascade (§4.5, `_db/schema.ts:140-143`): ein Log,
 * das mit seinem Share stirbt, ist keins — es verschwindet genau dann, wenn man
 * es braucht. Seine eigene Frist ist `FILES_LOG_AUFBEWAHRUNG_TAGE`.
 *
 * **Erst die Bytes, dann die Zeilen.** Die andere Reihenfolge waere nicht
 * wiederholbar: scheiterte das Loeschen eines Blobs, waere die Zeile schon weg,
 * der Share aus der Oberflaeche verschwunden und die Bytes nur noch ueber den
 * Aufraeum-Lauf AUFFINDBAR (der verwaiste Blobs meldet und nicht loescht,
 * §7.6). Bricht dagegen das Byte-Loeschen ab, steht die Zeile noch da und der
 * Vorgang laesst sich einfach wiederholen. `loesche` ist idempotent und nimmt
 * Ziel UND Zwischendatei mit.
 *
 * Die `share_files`-Zeilen werden AUSDRUECKLICH geloescht, obwohl der
 * Fremdschluessel `onDelete: "cascade"` traegt: das Cascade haengt an
 * `PRAGMA foreign_keys = ON` (`core/db/index.ts`), und eine Zusage dieses
 * Moduls sollte nicht an einer Einstellung ausserhalb des Moduls haengen.
 *
 * **Und nach den Blobs das VERZEICHNIS** (§7.3: „alle Blobs — `loesche` je
 * Datei, danach das Verzeichnis"). Das ist nicht kosmetisch:
 * `_lib/aufraeumen.ts:planeAufraeumen` bildet `verwaisteBlobs` aus den direkten
 * Kindern der Ablagewurzel, gefiltert gegen die vorhandenen `shares`-Zeilen.
 * Bliebe das leere Verzeichnis stehen, meldete JEDER Aufraeumlauf ab dann jede
 * PLANMAESSIGE Loeschung als „verwaisten Blob", monoton steigend — und der
 * Bericht, der laut §7.6 bewusst nur meldet und nicht loescht, verlore genau
 * diese Aussage.
 *
 * Das `rmdir` steht in `_lib/storage.ts` und nicht hier: dort entsteht im Modul
 * der einzige Ablagepfad, und eine zweite Pfadquelle hoebe die
 * Traversal-Zusage des ganzen Moduls auf.
 */
export async function shareLoeschenAction(
  _vorher: ShareFormZustand,
  formData: FormData,
): Promise<ShareFormZustand> {
  await requireFilesAccess();

  const werte = mitgeschickt(formData, ["id"]);
  const id = feld(formData, "id").trim();
  if (id === "" || !shareExistiert(id)) {
    return { ok: false, feldFehler: { id: UNBEKANNT }, werte };
  }

  // Spaltenliste statt `select()` — im Modul nicht erlaubt (§7.3).
  const dateien = getDb()
    .select({ id: shareFiles.id })
    .from(shareFiles)
    .where(eq(shareFiles.shareId, id))
    .all();

  for (const datei of dateien) {
    await loesche({ art: "share", shareId: id, fileId: datei.id });
  }

  /*
   * Nach der Schleife, nie darin: `rmdir` gelingt erst, wenn die letzte Datei
   * weg ist. Ein Fehlschlag darf das Loeschen NICHT scheitern lassen — die
   * Zeilen sind der teurere Zustand, und der Vorgang liesse sich sonst nicht
   * abschliessen. Er darf aber auch nicht still bleiben, sonst sucht der
   * Betreiber die Ursache der steigenden „verwaisten Blobs" im Aufraeum-Bericht
   * und findet sie nie. Dieselbe Linie wie `raeumeBytesWeg` in
   * `api/u/[token]/upload/route.ts`.
   */
  try {
    await loescheShareVerzeichnis(id);
  } catch (grund) {
    console.error(`[files] Verzeichnis der geloeschten Freigabe ${id} blieb stehen:`, grund);
  }

  // EINE Transaktion: ein Fehler zwischen den beiden DELETEs hinterliesse sonst
  // Dateizeilen ohne Kopf — sichtbar in keiner Ansicht und nur noch per SQL
  // auffindbar.
  getDb().transaction((tx) => {
    tx.delete(shareFiles).where(eq(shareFiles.shareId, id)).run();
    tx.delete(shares).where(eq(shares.id, id)).run();
  });

  auffrischenMitUnterrouten();
  return { ok: true };
}

// ===========================================================================
// T45 — die Virenpruefung einer Zeile wiederholen
// ===========================================================================

/**
 * Die beiden Tabellen mit AV-Zustand (§4.6) als FORMULARWERT. Ihre Namen sind
 * die des `BlobZiel`-Diskriminators aus `_lib/storage.ts` (`"share"` /
 * `"inbox"`) und NICHT die Tabellennamen: die Kette Formular → Action →
 * `reiheAvEin` traegt damit EIN Vokabular, und es gibt keine Stelle, an der
 * jemand `"share_files"` in `"share"` uebersetzt und sich dabei vertut.
 */
const AV_ARTEN = ["share", "inbox"] as const;
type AvArt = (typeof AV_ARTEN)[number];

/** `null` fuer alles, was nicht genau einer der beiden Werte ist. */
function avArt(formData: FormData): AvArt | null {
  const roh = feld(formData, "art").trim();
  return (AV_ARTEN as readonly string[]).includes(roh) ? (roh as AvArt) : null;
}

/**
 * DIE WIEDERHOLUNG DER AV-PRUEFUNG — der einzige Weg von `error` nach
 * `scanning` (§6.2), und der Knopf steht an jeder solchen Zeile auf der
 * Share-Detailseite UND im Posteingang (§10.2).
 *
 * SIE IST DIE ANTWORT AUF EINEN ERSCHOEPFTEN ZUSTAND, nicht auf einen Fehler:
 * `FILES_AV_VERSUCHE × FILES_AV_WIEDERHOLUNG_SEKUNDEN` (5 × 60 s) ueberspannen
 * das Startfenster von clamd; was danach kommt, ist ein BENANNTER Zustand mit
 * einem Knopf und ausdruecklich **kein** automatischer Dauerversuch (§6.4).
 *
 * `WHERE av_status = 'error'` IST DIE ZUSAGE, NICHT EIN `if` DAVOR. Der
 * Wertebereich der Uebergaenge steht in §6.2: aus `clean` und `infected` fuehrt
 * KEIN Weg heraus, `scanning` laeuft schon, und `unscanned → scanning` gehoert
 * ausschliesslich dem Nachscan-Lauf aus Spec 2. Als Bedingung des `UPDATE` ist
 * das eine Eigenschaft des SQL und kein Zweig, den eine spaetere Aufraeumrunde
 * fuer ueberfluessig halten kann — und es gibt kein Fenster zwischen Lesen und
 * Schreiben, in dem der AV-Arbeiter dieselbe Zeile anders entscheidet.
 *
 * `av_geprueft_at` WIRD MITGELOESCHT. Heute waehlt `_lib/av.ts:auftraege`
 * breiter (`scanning` plus vollstaendige Bytes), der Wert waere also folgenlos;
 * §6.4 beschreibt die Boot-Wiederaufnahme aber als `scanning` UND
 * `av_geprueft_at IS NULL`. Zoege jemand die Auswahl auf diesen Wortlaut
 * zusammen, bliebe jede wiederholte Zeile mit altem Zeitstempel fuer immer auf
 * „wird geprueft" — ein stiller Ausfall, den kein Test von heute sieht.
 *
 * SIE GIBT NICHTS ZURUECK, anders als die drei Actions darueber. Die tragen
 * getippte Felder, die eine Ablehnung ueberleben muessen; hier gibt es nur eine
 * verborgene ID und keine Eingabe, die verloren gehen koennte. Die Rueckmeldung
 * ist die Auffrischung: die Zeile verlaesst `error`, und der Knopf verschwindet
 * mit ihr. Und weil `Promise<void>` genau die Form ist, die React fuer
 * `<form action={…}>` verlangt, laeuft der Knopf ohne JavaScript und ohne
 * Typumdeutung — auf einer Seite, die eine Server Component bleibt.
 */
export async function avWiederholenAction(formData: FormData): Promise<void> {
  await requireFilesAccess();

  const art = avArt(formData);
  const id = feld(formData, "id").trim();
  if (art === null || id === "") return;

  const db = getDb();
  const treffer =
    art === "share"
      ? db
          .update(shareFiles)
          .set({ avStatus: "scanning", avGeprueftAt: null })
          .where(and(eq(shareFiles.id, id), eq(shareFiles.avStatus, "error")))
          .run()
      : db
          .update(inboxFiles)
          .set({ avStatus: "scanning", avGeprueftAt: null })
          .where(and(eq(inboxFiles.id, id), eq(inboxFiles.avStatus, "error")))
          .run();

  // Die Entscheidung ist die Zahl betroffener Zeilen, nie ein vorher gelesener
  // Wert — dieselbe Linie wie in `downloadsAufstockenAction` und `_db/zaehler.ts`.
  if (treffer.changes !== 1) return;

  if (art === "share") {
    /*
     * ERST NACH dem `UPDATE` gelesen, und nur fuer das Blob-Ziel: `_lib/storage.ts`
     * baut den Pfad einer Freigabedatei aus BEIDEN IDs, `fileId` allein ist kein
     * gueltiges Ziel. Ein `SELECT` VOR dem `UPDATE` waere dagegen der zweite
     * Schritt, den der Vorbehalt oben gerade vermeidet.
     */
    const zeile = db
      .select({ shareId: shareFiles.shareId })
      .from(shareFiles)
      .where(eq(shareFiles.id, id))
      .get();
    if (zeile !== undefined) {
      reiheAvEin({ art: "share", shareId: zeile.shareId, fileId: id });
    }
  } else {
    reiheAvEin({ art: "inbox", inboxFileId: id });
  }

  /*
   * `"layout"`, weil der Knopf an ZWEI Orten steht: `/shares/<id>` und
   * `/posteingang`. Ohne die Unterrouten bliebe der jeweils andere auf dem alten
   * Stand — dieselbe Begruendung wie bei den drei T37-Actions.
   */
  auffrischenMitUnterrouten();
}
