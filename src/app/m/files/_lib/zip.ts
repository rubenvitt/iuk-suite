/**
 * Archiv-NAMEN und Archiv-AUSSCHLUSS — Spec §7.7, Plan T21.
 *
 * Diese Datei entscheidet, WIE die Eintraege heissen und WELCHE Zeilen nicht
 * hineingehoeren. Sie beruehrt kein Byte und kein Dateisystem: das Streaming
 * baut `api/download/[id]/zip` (T34), die Posteingang-Zusammenstellung
 * `api/inbox/zip` (T49). Beide holen die Entscheidungen von hier, damit es nicht
 * ZWEI Wahrheiten darueber gibt, was „freigegeben" heisst (§6.2).
 *
 * KEINE Client-Direktive in dieser Datei. Der QR-Dialog der Verwaltung (T36)
 * ist eine Client-Insel und holt `entschaerfeTitel` von hier, die beiden
 * Route-Handler sind Serverkode. Traege diese Datei die Direktive, bekaeme die
 * Serverseite eine Client-Referenz statt des Wertes — HTTP 500 fuer die ganze
 * Seite, und weder TypeScript noch `pnpm build` noch Vitest sehen es
 * (`docs/design/README.md`, Falle 6).
 *
 * OFFEN, und die Aufloesung liegt AUSSERHALB dieser Datei: `./av` zieht
 * `node:net` (av.ts:35) und ueber `./storage` auch `node:fs/promises` STATISCH in
 * den Graphen — `_db/client` dagegen nur dynamisch (av.ts:311-317), das native
 * `better-sqlite3` haengt also nicht daran. Fuer die beiden Route-Handler ist das
 * gleichgueltig; holt der QR-Dialog (T36) `entschaerfeTitel` von hier, scheitert
 * das CLIENT-Bundle an `node:net`. Das ist keine stille Falle 6, sondern ein
 * lauter Bundler-Fehler in `dev` und `build` — aber keiner, den `pnpm typecheck`
 * zeigt. Heilbar nur durch einen Schnitt, den ein anderer Task besitzt: entweder
 * `istFreigegeben` in ein importfreies Modul (dann bleibt es EINE
 * Freigabepruefung, §6.2), oder `titelBasis`/`entschaerfeTitel` dorthin, und T36
 * Punkt 8 zeigt auf die neue Quelle. `import type` heilt es nicht: `istFreigegeben`
 * ist ein Wert und wird laut §6.2 ausdruecklich gerufen.
 *
 * Vier Alt-Befunde, die hier abgestellt werden:
 *  1. zwei gleichnamige Dateien ergaben zwei Eintraege gleichen Namens
 *     (`zip/route.ts:86-132`, Analyse 2.2) — der Eintragsname war der nackte
 *     `file.filename`;
 *  2. es gab ueberhaupt keine Freigabepruefung auf dem ZIP-Weg, also auch kein
 *     stilles Weglassen zu benennen;
 *  3. ein Titel aus Leerzeichen ergab `___.zip` (`zip/route.ts:125`);
 *  4. `Content-Disposition` war an ALLEN DREI Auslieferungsstellen
 *     `filename="${encodeURIComponent(name)}"` ohne `filename*` (`download:105`,
 *     `preview:107`, `zip:130`) — ein Umlaut kam als `%C3%9C` beim Empfaenger an.
 */
import { istFreigegeben, type AvStatus } from "./av";

/**
 * Der Name der Fehlliste im Archiv. Fuehrender Unterstrich, damit sie in einer
 * alphabetisch sortierten Entpackansicht oben steht — wer sie uebersieht, haelt
 * das Archiv fuer vollstaendig.
 */
export const HINWEIS_DATEINAME = "_HINWEIS.txt";

/**
 * Was anstelle eines Namens steht, von dem nichts Verwendbares uebrig bleibt —
 * fuer den Eintragsnamen im Archiv UND fuer den angefuehrten Teil von
 * `Content-Disposition` (`headerSichererFallback`). Dieselbe Lage, dieselbe
 * Antwort: ein Name ist ehrlicher als ein Leerwert.
 */
export const ERSATZ_EINTRAGSNAME = "unbenannt";

/**
 * Was anstelle eines leeren Titels in den Archivnamen geht. Der Titel ist
 * serverseitig getrimmt und auf Nichtleere geprueft (§4.2) — dies ist die
 * zweite Linie, nicht die erste, und deckt den Altbestand ab.
 */
export const ERSATZ_TITEL = "archiv";

/**
 * Eine Zeile, die fuer das Archiv in Frage kommt — bewusst NICHT die
 * Drizzle-Zeile: `share_files` nennt das Feld `filename`, `inbox_files` nennt es
 * `dateiname` (§4.6). Die Abbildung machen die Aufrufer, die Regel steht hier
 * einmal.
 *
 * `bytesVollstaendigAt` wird als ROHER Spaltenwert uebergeben und nicht als
 * `vollstaendig: boolean`: das Praedikat „`bytes_vollstaendig_at IS NULL` heisst
 * unvollstaendig" gehoert in diese Datei, nicht in jeden Aufrufer.
 */
export type ZipKandidat = {
  id: string;
  name: string;
  avStatus: AvStatus;
  bytesVollstaendigAt: Date | null;
};

/**
 * Warum eine Zeile fehlt. Ein geschlossener Wertebereich mit EINER Meldung je
 * Wert — die Texte liegen hier, weil sonst T34 und T49 je einen eigenen
 * formulieren wuerden.
 *
 * `unvollstaendig` steht absichtlich VOR den AV-Gruenden: siehe `ausschlussGrund`.
 */
export const ZIP_AUSSCHLUSS_MELDUNGEN = {
  unvollstaendig: "Die Übertragung wurde nicht abgeschlossen",
  scanning: "Die Virenprüfung läuft noch",
  infected: "Die Virenprüfung hat einen Fund gemeldet",
  error: "Die Virenprüfung war nicht möglich",
  unscanned: "Nicht virengeprüft",
  "nicht-gefunden": "Nicht gefunden",
} as const;

export type ZipAusschlussGrund = keyof typeof ZIP_AUSSCHLUSS_MELDUNGEN;

/** Ein Eintrag, der ins Archiv kommt: Bytes holt der Streamer ueber `id`. */
export type ZipEintrag = {
  id: string;
  eintragsname: string;
};

/** Eine Zeile, die NICHT ins Archiv kommt, mit ihrem Grund im Klartext. */
export type ZipAusschluss = {
  id: string;
  name: string;
  grund: ZipAusschlussGrund;
  meldung: string;
};

/**
 * Das Ergebnis der Planung. Zwei Aeste, weil „leeres Archiv" kein Ergebnis ist,
 * das man ausliefern darf: ein ZIP ohne Eintraege sieht fuer den Empfaenger wie
 * ein Fehler seines Entpackprogramms aus. Die Aufrufer antworten stattdessen mit
 * einem benannten Zustand (T34 Punkt 3, T49 Punkt 5).
 *
 * `ausgeschlossen` bleibt in BEIDEN Aesten erhalten — im leeren Ast ist die
 * Liste gerade die Begruendung.
 */
export type ZipPlan =
  | {
      art: "archiv";
      eintraege: ZipEintrag[];
      ausgeschlossen: ZipAusschluss[];
      /** Der fertige Inhalt der `_HINWEIS.txt`, oder `null`, wenn nichts fehlt. */
      hinweis: string | null;
    }
  | {
      art: "leer";
      grund: "keine-dateien" | "alle-ausgeschlossen";
      meldung: string;
      ausgeschlossen: ZipAusschluss[];
    };

/** Steuerzeichen inklusive DEL — in einem Eintragsnamen hat keines etwas zu suchen. */
const STEUERZEICHEN = /[\u0000-\u001f\u007f]/g;

/**
 * Der Eintragsname einer Datei im Archiv.
 *
 * Der Anzeigename darf laut §4.6 nur Anzeige, `Content-Disposition` und
 * Eintragsname sein und NIE Teil eines Pfades. In einem ZIP ist der
 * Eintragsname aber genau das — beim Entpacken auf der Platte des Empfaengers.
 * `easy-filesharing` hat `file.filename` ungeprueft in den S3-Key konkateniert
 * (`init/route.ts:68`, Analyse 2.2, dort harmlos), der Bestand kann also
 * Trenner und `..` enthalten. Diese Datei ist die letzte Stelle davor.
 *
 * Bewusst NICHT mehr als das: keine Laengenkappung, keine Unicode-Normalisierung,
 * keine Windows-Reservenamen. Jede davon aendert Namen, die heute funktionieren.
 */
export function eintragsname(rohname: string): string {
  const bereinigt = rohname
    .replace(STEUERZEICHEN, "")
    .replace(/[/\\]/g, "_")
    .trim();
  if (bereinigt === "" || bereinigt === "." || bereinigt === "..") {
    return ERSATZ_EINTRAGSNAME;
  }
  return bereinigt;
}

/**
 * Macht einen Eintragsnamen im Archiv eindeutig — `bericht.pdf`,
 * `bericht-1.pdf`, `bericht-2.pdf`.
 *
 * Geprueft wird gegen die MENGE der bereits vergebenen Namen, nicht gegen einen
 * Zaehler je Stammname: bei `bericht.pdf`, `bericht-1.pdf`, `bericht.pdf` legt
 * ein Zaehler die dritte Zeile auf `bericht-1.pdf` — den Namen, den die zweite
 * schon traegt.
 *
 * Der Vergleich ist zeichengenau, also `Bericht.pdf` und `bericht.pdf` gelten
 * als verschieden. Auf einem case-insensitiven Dateisystem kollidieren sie beim
 * Entpacken trotzdem; das zu vereinheitlichen hiesse, Namen zu aendern, die auf
 * jedem Linux-System korrekt sind — die Entscheidung gehoert dem Entpacker.
 */
function eindeutigerName(name: string, belegt: Set<string>): string {
  if (!belegt.has(name)) {
    belegt.add(name);
    return name;
  }
  // Der Suffix steht VOR der Endung, sonst verliert die Datei ihren Typ. Ein
  // Punkt an Position 0 ist keine Endung (`.gitignore`), und `lastIndexOf`
  // trifft absichtlich nur die LETZTE Endung (`a.tar.gz` → `a.tar-1.gz`).
  const punkt = name.lastIndexOf(".");
  const stamm = punkt > 0 ? name.slice(0, punkt) : name;
  const endung = punkt > 0 ? name.slice(punkt) : "";
  let zaehler = 1;
  let kandidat = `${stamm}-${zaehler}${endung}`;
  while (belegt.has(kandidat)) {
    zaehler += 1;
    kandidat = `${stamm}-${zaehler}${endung}`;
  }
  belegt.add(kandidat);
  return kandidat;
}

/**
 * Der Ausschlussgrund einer Zeile, oder `null`, wenn sie ausgeliefert wird.
 *
 * DIE REIHENFOLGE IST DIE AUSSAGE: eine laufende Uebertragung ist immer
 * gleichzeitig `scanning` UND `bytes_vollstaendig_at IS NULL`. Gewaenne der
 * AV-Grund, stuende bei jedem abgebrochenen Upload „Die Virenpruefung laeuft
 * noch" — und niemand erfuehre, dass die Bytes fehlen.
 *
 * Freigegeben wird ueber `istFreigegeben` und nicht ueber einen Vergleich hier:
 * ein zweiter Vergleich waere ein zweites Statusmodell (§6.2, §6.3).
 */
function ausschlussGrund(kandidat: ZipKandidat): ZipAusschlussGrund | null {
  if (kandidat.bytesVollstaendigAt === null) return "unvollstaendig";
  if (istFreigegeben(kandidat.avStatus)) return null;
  // `istFreigegeben` liefert ein `boolean`, keinen Typwaechter — TypeScript kann
  // `clean` hier nicht ausschliessen, obwohl die Zeile darueber es tut. Ein
  // Direktvergleich gegen den Freigabewert waere hier ein zweites Statusmodell
  // (§6.2), also wird die Einengung BEHAUPTET — und die Quelltext-Zusicherung in
  // `zip.test.ts` verbietet den Vergleich ausdruecklich. Was sie traegt, ist der
  // Meldungskatalog: er
  // hat einen Eintrag fuer jeden Status ausser `clean`, und `zip.test.ts` prueft
  // das ueber die Schleife durch alle `AV_STATUS`.
  return kandidat.avStatus as Exclude<AvStatus, "clean">;
}

/**
 * Der Inhalt der `_HINWEIS.txt`, oder `null`, wenn nichts fehlt.
 *
 * Ein stilles Weglassen waere schlimmer als ein 403 (§7.7): der Empfaenger
 * haette ein Archiv, das vollstaendig aussieht. Deshalb steht jede fehlende
 * Datei mit Namen UND Grund darin.
 */
export function hinweisText(ausgeschlossen: readonly ZipAusschluss[]): string | null {
  if (ausgeschlossen.length === 0) return null;
  // Derselbe Schnitt wie in `eintragsname`, und aus demselben Grund: ein
  // Zeilenumbruch in `share_files.filename` (ungepruefter Altbestand, §4.6)
  // erzeugte hier sonst eine ZWEITE Fehlzeile ueber eine Datei, die tatsaechlich
  // ausgeliefert wurde. Dann luegt gerade die Datei, die es nur gibt, weil ein
  // stilles Weglassen schlimmer waere als ein 403. Pfadtrenner bleiben absichtlich
  // stehen: hier steht der ORIGINALNAME, nicht der Eintragsname.
  const zeilen = ausgeschlossen.map(
    (a) => `- ${a.name.replace(STEUERZEICHEN, "")} — ${a.meldung}`,
  );
  return [
    "Dieses Archiv ist NICHT vollständig.",
    "",
    "Die folgenden Dateien wurden nicht aufgenommen:",
    "",
    ...zeilen,
    "",
    "Nicht freigegebene Dateien werden nicht ausgeliefert. Wenn Sie eine der",
    "genannten Dateien brauchen, wenden Sie sich an die Person, die Ihnen den",
    "Link gegeben hat.",
    "",
  ].join("\n");
}

/**
 * Die eine Planung fuer beide Archiv-Wege.
 *
 * `nichtGefundeneIds` deckt T49 Punkt 6 ab: eine unbekannte oder fremde `id`
 * aus `?ids=` wird uebergangen und benannt, statt das ganze Archiv auf 404 zu
 * setzen — in einer Mehrfachauswahl waere das eine Sackgasse, bei der die
 * auswaehlende Person nicht erfaehrt, welche Zeile schuld war.
 */
export function planeArchiv(
  kandidaten: readonly ZipKandidat[],
  nichtGefundeneIds: readonly string[] = [],
): ZipPlan {
  const freigegeben: ZipKandidat[] = [];
  const ausgeschlossen: ZipAusschluss[] = [];

  // ERST trennen, DANN benennen — die Namensvergabe braucht die vollstaendige
  // Fehlliste, weil `_HINWEIS.txt` selbst ein Eintrag ist (siehe unten).
  for (const kandidat of kandidaten) {
    const grund = ausschlussGrund(kandidat);
    if (grund !== null) {
      // Eine ausgeschlossene Zeile verbraucht KEINEN Eintragsnamen: sonst
      // hiesse die eine ausgelieferte Datei `bericht-1.pdf` und der Empfaenger
      // suchte nach `bericht.pdf`. Im Hinweis steht der Originalname.
      ausgeschlossen.push({
        id: kandidat.id,
        name: kandidat.name,
        grund,
        meldung: ZIP_AUSSCHLUSS_MELDUNGEN[grund],
      });
      continue;
    }
    freigegeben.push(kandidat);
  }

  for (const id of nichtGefundeneIds) {
    // Der Name IST die id: einen Anzeigenamen gibt es nicht, sonst waere die
    // Zeile gefunden worden.
    ausgeschlossen.push({
      id,
      name: id,
      grund: "nicht-gefunden",
      meldung: ZIP_AUSSCHLUSS_MELDUNGEN["nicht-gefunden"],
    });
  }

  if (freigegeben.length === 0) {
    const garNichts = ausgeschlossen.length === 0;
    return {
      art: "leer",
      grund: garNichts ? "keine-dateien" : "alle-ausgeschlossen",
      meldung: garNichts
        ? "Hier ist keine Datei vorhanden."
        : "Keine der Dateien ist zum Herunterladen freigegeben.",
      ausgeschlossen,
    };
  }

  const hinweis = hinweisText(ausgeschlossen);
  const belegt = new Set<string>();
  // Die Fehlliste ist SELBST ein Archiveintrag. Ohne diese Zeile bekaeme eine
  // Datei, die `_HINWEIS.txt` heisst, denselben Namen wie sie — genau der
  // Alt-Befund „zwei Eintraege gleichen Namens", nur durch die Hintertuer, und
  // `share_files.filename` ist ungepruefter Altbestand. Belegt wird der Name
  // NUR, wenn die Fehlliste auch geschrieben wird: sonst wuerde eine Datei ohne
  // Anlass umbenannt.
  if (hinweis !== null) belegt.add(HINWEIS_DATEINAME);

  const eintraege: ZipEintrag[] = freigegeben.map((kandidat) => ({
    id: kandidat.id,
    eintragsname: eindeutigerName(eintragsname(kandidat.name), belegt),
  }));

  return { art: "archiv", eintraege, ausgeschlossen, hinweis };
}

/** Der Titel, auf dem beide Namensformen aufsetzen — getrimmt, nie leer. */
function titelBasis(titel: string): string {
  const getrimmt = titel.trim();
  return getrimmt === "" ? ERSATZ_TITEL : getrimmt;
}

/**
 * Die harte Entschaerfung eines Titels — 1:1 `zip/route.ts:125`
 * (`replace(/[^a-zA-Z0-9_-]/g, "_")`).
 *
 * Sie ist nicht Dekoration: der uebrige Zeichenraum macht den Wert auch fuer den
 * ANGEFUEHRTEN Teil von `Content-Disposition` sicher — kein Anfuehrungszeichen,
 * kein Backslash, kein Semikolon, das den Header aufbrechen koennte.
 *
 * Die EINE Korrektur gegenueber Alt ist der leere Titel (`___.zip`). Sie wird
 * ABSICHTLICH nicht auf „das Ergebnis besteht nur aus Unterstrichen" ausgedehnt:
 * dann wuerde der Titel „Ü" zu `archiv` statt zu `_`, obwohl er ein Titel ist,
 * und die Zusage „1:1" waere weg. Den echten Titel traegt `filename*`.
 *
 * Zweiter Aufrufer neben dem Archivnamen: der PNG-Download im QR-Dialog
 * (`<entschaerfter-titel>-qr.png`, T36) — dieselbe Entschaerfung, weil derselbe
 * Titel denselben Weg geht.
 */
export function entschaerfeTitel(titel: string): string {
  return titelBasis(titel).replace(/[^a-zA-Z0-9_-]/g, "_");
}

/**
 * Zeichen, die den ANGEFUEHRTEN Teil einer `Content-Disposition` zerstoeren.
 * Alle drei Wirkungen sind mit Node 24 gemessen:
 *  - `"` beendet den Wert mitten im Namen — `filename="ber"icht.pdf"` parst nach
 *    der quoted-string-Regel zu `ber`;
 *  - `\` maskiert das folgende Zeichen (quoted-pair), also auch das schliessende
 *    Anfuehrungszeichen;
 *  - CR, LF und NUL lassen `new Headers({…})` mit `TypeError: Headers.append`
 *    platzen, und auf einem Byte-Weg ist das HTTP 500 statt eines Downloads.
 * DEL steht mit dabei, weil es in einem Dateinamen so wenig zu suchen hat wie im
 * Eintragsnamen — dieselbe Klasse wie `STEUERZEICHEN`, um `"` und `\` erweitert.
 */
const HEADER_UNSICHER = /["\\\u0000-\u001f\u007f]/g;

/**
 * Alles jenseits von DRUCKBAREM ASCII. Ab Codepunkt 256 wirft `new Headers`
 * („Cannot convert argument to a ByteString", gemessen mit `→`), und 128–255
 * kommt beim Empfaenger als Latin-1 an, also als Buchstabensalat. Ein Emoji- oder
 * CJK-Dateiname ist im Bestand wahrscheinlicher als ein Anfuehrungszeichen, eine
 * Haertung ohne diesen Schritt waere also die halbe. Das Leerzeichen (0x20) und
 * `;` bleiben: beides ist innerhalb der Anfuehrungszeichen gueltig.
 */
const NICHT_DRUCKBARES_ASCII = /[^\u0020-\u007e]/g;

/** Der angefuehrte Wert, aus dem der Header nicht ausbrechen kann. */
function headerSichererFallback(text: string): string {
  const bereinigt = text.replace(HEADER_UNSICHER, "").replace(NICHT_DRUCKBARES_ASCII, "_");
  // Ein Name aus nichts als Anfuehrungszeichen laesst nichts uebrig. `filename=""`
  // waere gueltig, aber ein Name ist ehrlicher als ein Leerwert.
  return bereinigt.trim() === "" ? ERSATZ_EINTRAGSNAME : bereinigt;
}

/**
 * RFC 8187 `ext-value`: `encodeURIComponent` laesst `!'()*` roh stehen, und
 * davon ist `'` der TRENNER in `UTF-8''…` — ein Apostroph im Titel wuerde die
 * Angabe mitten im Namen beenden. Die uebrigen vier sind ausserhalb von
 * `attr-char` und werden mitkodiert, statt sich auf die Nachsicht des Clients zu
 * verlassen.
 */
function extWert(wert: string): string {
  return encodeURIComponent(wert).replace(
    /['()*!]/g,
    (zeichen) => `%${zeichen.charCodeAt(0).toString(16).toUpperCase()}`,
  );
}

/**
 * `Content-Disposition` mit BEIDEN Formen.
 *
 * Der angefuehrte `filename=` traegt den ASCII-Fallback UNKODIERT — gehaertet
 * (siehe unten), aber nicht prozentkodiert. Genau das war der Alt-Fehler an allen drei Stellen
 * (`filename="${encodeURIComponent(name)}"`): der Empfaenger bekam `%C3%9C` als
 * Teil des Dateinamens zu sehen, weil ein Client den angefuehrten Teil nicht
 * dekodiert. Der echte Name gehoert ausschliesslich in `filename*`.
 *
 * Zwei Parameter statt einem, weil die Ableitung des Fallbacks vom Gegenstand
 * abhaengt: bei einem Archivnamen wird der TITEL entschaerft und `.zip` danach
 * angehaengt, bei einem Dateidownload muessen Punkt und Endung erhalten bleiben.
 * Ein gemeinsamer Automatismus haette `bericht.pdf` zu `bericht_pdf` gemacht.
 *
 * Der `asciiFallback` wird HIER gehaertet und steht nicht mehr unter einer
 * Vorbedingung, die nur ein Kommentar behauptet: `entschaerfeTitel` erfuellte sie
 * zwangsweise, ein Dateiname aus dem Bestand (T33, T51) NICHT von allein — und
 * `share_files.filename` / `inbox_files.dateiname` sind ungepruefter Altbestand
 * (§4.6). Diese Datei ist die gemeinsame Naht der drei Auslieferungsstellen, also
 * gehoert die Haertung hierher und nicht in jeden Aufrufer.
 *
 * `echterName` braucht keine: er geht vollstaendig durch `extWert`, und
 * `encodeURIComponent` kodiert jedes Zeichen weg, das eine Kopfzeile brechen
 * koennte. Er bleibt deshalb UNANGETASTET — sonst waere der echte Name verloren,
 * und `filename*` gibt es nur seiner wegen.
 */
export function dispositionKopfzeile(echterName: string, asciiFallback: string): string {
  return `attachment; filename="${headerSichererFallback(asciiFallback)}"; filename*=UTF-8''${extWert(echterName)}`;
}

/**
 * Die Kopfzeile fuer das Archiv eines Shares bzw. einer Posteingang-Auswahl.
 *
 * `.zip` wird NACH der Entschaerfung angehaengt — der Punkt selbst liegt
 * ausserhalb von `[a-zA-Z0-9_-]` und wuerde sonst zu `_` (`Lage_zip`).
 */
export function archivDisposition(titel: string): string {
  return dispositionKopfzeile(`${titelBasis(titel)}.zip`, `${entschaerfeTitel(titel)}.zip`);
}
