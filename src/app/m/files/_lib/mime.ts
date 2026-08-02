/**
 * Die Inhaltsprüfung des Moduls `files` — Magic Bytes und der Abgleich in drei
 * Richtungen (Spec §8.5).
 *
 * DIE ZUSAGE: `mime_type` in der Datenbank trägt den **festgestellten** Typ,
 * nicht den vom Client deklarierten; ein Inhalt, der zu keinem Allowlist-Format
 * passt, wird **abgelehnt** (der Aufrufer löscht daraufhin die Zwischendatei,
 * §7.1, §8.2).
 *
 * WARUM DAS NÖTIG IST — der Unterschied zwischen `drop` und diesem Modul:
 * `drop` prüft ausschließlich `config.allowedMime.includes(part.mimetype)`, also
 * die Client-Angabe (`drop/src/app.js:307`). Gemessen: HTML-Inhalt in
 * `evil.html`, deklariert als `image/png`, bei `allowedMime=['image/png']` →
 * 200, gespeichert als `evil.html`. Heute ist das ungefährlich, weil `drop`
 * nichts ausliefert. **Dieses Modul liefert aus** (Download und Vorschau) — aus
 * demselben Durchschlupf wird gespeicherter XSS auf einer Domain im
 * Cookie-Scope der ganzen Suite.
 *
 * DIESE PRÜFUNG IST DIE ZWEITE LINIE, NICHT DIE ERSTE. Die erste ist das
 * Pfadschema (die Datei liegt unter einer ID, kein Dateiname steckt im Pfad,
 * `_lib/storage.ts`) plus `attachment` + `nosniff` bei jeder Auslieferung
 * (§7.7). Deshalb hält die Maßnahme auch bei einer **Fehlklassifikation** — und
 * deshalb darf eine unpassende Endung eine Abweichung sein statt einer
 * Ablehnung.
 *
 * KEIN `"use client"` UND KEIN `node:`-IMPORT. Beide Richtungen brauchen das:
 * die Server-Seite (Route Handler) darf hier keinen Client-Wert bekommen
 * (`docs/design/README.md:87-103` — eine Konstante aus einem Client-Modul kommt
 * in einer Server Component als Client-Referenz an, HTTP 500 für die ganze
 * Seite, unsichtbar für `pnpm build` und für Vitest), und die Client-Inseln
 * (Upload-Insel §7.2, Abgabeformular §8.1) leiten ihr `accept`-Attribut aus
 * `MIME_ALLOWLIST` ab. Auch T51 (Inline-Vorschau) importiert seine Typen von
 * hier statt sie zu kopieren; `image/heic` **und** `image/heif` sind zwei
 * Zeichenketten, und wer nur eine listet, verliert die Hälfte der iPhone-Fotos.
 *
 * Erbe für Spec 2: der Import bringt Zeilen **ohne** `mime_type`
 * (`inbox_files.mime_type` ist nullable, §4.1) — für Altbestand wird hier
 * nichts erfunden, die Auslieferung nimmt dann `application/octet-stream`.
 */

/**
 * Wie viele Bytes vom **Anfang** der Zwischendatei der Aufrufer liest und als
 * `praefix` übergibt.
 *
 * Die weiteste Signaturstelle liegt bei Offset 8..12 (die ISO-BMFF-Marke), 12
 * Bytes würden also für die Tabelle reichen. Der Wert ist deutlich größer, weil
 * `text/plain` **keine** Signatur hat und stattdessen über seine Kodierung
 * geprüft wird: je mehr Bytes, desto belastbarer die UTF-8-Aussage. 4096 ist
 * eine Blocklänge und liegt bei einem einzigen `read` weit unter jeder
 * Speichersorge.
 */
export const MIME_PRAEFIX_BYTES = 4096;

/**
 * Ein Typ, der als **festgestellter** Wert in `share_files.mime_type` bzw.
 * `inbox_files.mime_type` darf.
 *
 * **Nicht** enthalten ist `application/octet-stream`, und das ist Absicht: es ist
 * kein feststellbarer Typ, sondern der Platzhalter, den `anlegenAction` in die
 * noch bytelose Zeile schreibt (§7.1) und den die Auslieferung für Altbestand
 * ohne `mime_type` einsetzt (§8.6). Die Spalte bleibt deshalb `text`/`string` —
 * wer sie gegen diese Union typisiert, kann den Platzhalter nicht mehr schreiben.
 */
export type ErlaubterMimeTyp =
  | "image/jpeg"
  | "image/png"
  | "image/gif"
  | "image/webp"
  | "image/heic"
  | "image/heif"
  | "application/pdf"
  | "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
  | "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
  | "application/vnd.openxmlformats-officedocument.presentationml.presentation"
  | "text/plain";

const DOCX = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
const PPTX = "application/vnd.openxmlformats-officedocument.presentationml.presentation";

/**
 * Die Allowlist: erlaubter Typ und die Endungen, die zu ihm passen.
 *
 * **DIESE LISTE IST EINE VORLAGE, NOCH KEINE ANTWORT** (Spec §13.1 Frage 3).
 * Die wirklich eingesetzte `ALLOWED_MIME` des Servers kennt nur der Betreiber;
 * ein zu enger Wert lehnt Handyfotos ab (HEIC), ein zu weiter öffnet den
 * Ausliefer-Weg. Herkunft je Eintrag, damit die Antwort eine Subtraktion ist
 * und keine Suche:
 *
 * - aus `drop`s gemessener Vorlage (`drop/.env.example:8`, identisch mit
 *   `defaultAllowedMime` in `drop/src/config.js:14-22`): `image/jpeg`,
 *   `image/png`, `image/webp`, `application/pdf`, DOCX, XLSX, `text/plain`;
 * - aus Spec §8.5 ergänzt: `image/gif`, `image/heic`/`image/heif` (ohne sie
 *   fällt jedes iPhone-Foto durch) und PPTX (§8.5 nennt „ZIP-basierte
 *   Office-Formate" im Plural; `drop`s Vorlage führte nur Text und Tabelle).
 *
 * Die Endungen überschneiden sich bei HEIC/HEIF, und das ist gemessene
 * Realität: Handys schreiben Dateien mit der generischen HEIF-Marke `mif1` unter
 * der Endung `.heic`. Getrennte Mengen würden bei jedem zweiten Handyfoto eine
 * Abweichung melden, die keine ist. **Sonst steht hier je Typ nur die Endung,
 * die es real trägt** — keine Sammlung historischer Schreibweisen (`.jpe`,
 * `.text`): für `text/plain` ist die Endung ein Positivsignal (siehe
 * `pruefeInhaltstyp`), und jede zusätzliche Endung weitet dort die Annahme,
 * ohne einen Beleg dafür zu haben.
 */
export const MIME_ALLOWLIST: readonly { typ: ErlaubterMimeTyp; endungen: readonly string[] }[] = [
  { typ: "image/jpeg", endungen: ["jpg", "jpeg"] },
  { typ: "image/png", endungen: ["png"] },
  { typ: "image/gif", endungen: ["gif"] },
  { typ: "image/webp", endungen: ["webp"] },
  { typ: "image/heic", endungen: ["heic", "heif", "hif"] },
  { typ: "image/heif", endungen: ["heif", "heic", "hif"] },
  { typ: "application/pdf", endungen: ["pdf"] },
  { typ: DOCX, endungen: ["docx"] },
  { typ: XLSX, endungen: ["xlsx"] },
  { typ: PPTX, endungen: ["pptx"] },
  // OFFENER PUNKT zu §13.1 Frage 3, und ein anderer als bei den Typen selbst:
  // hier ist das Modul ENGER als die Anwendung, die es ersetzt. `drop` prüfte
  // allein die Deklaration (`config.allowedMime.includes(part.mimetype)`,
  // `drop/src/app.js:307`) — `liste.csv`, `notiz.md`, `verlauf.log` mit
  // ehrlicher `text/plain`-Deklaration kamen dort durch und werden hier
  // abgelehnt. Der Endungs-Gate ist eine Hausentscheidung gegen `bericht.html`,
  // keine Spec-Zusage: §8.5 verlangt für `text/plain` nur die
  // UTF-8-Gültigkeitsprüfung und sagt zur Endung nichts. Diese Verengung kann
  // nur der Betreiber quittieren — die Frage gehört zu §13.1 Frage 3: welche
  // Textendungen kommen real vor, nur `.txt`?
  { typ: "text/plain", endungen: ["txt"] },
];

/** Welche der drei Richtungen von der Feststellung abweicht. */
export type MimeAbweichung = "deklaration" | "endung";

/**
 * Warum abgelehnt wurde. Jeder Grund benennt einen **anderen nächsten
 * Schritt** — deshalb sind es fünf und nicht einer: `inhalt-nicht-erlaubt`
 * heißt „diese Datei gehört nicht hierher", `text-nicht-ausgewiesen` und
 * `zip-nicht-office` heißen „vielleicht ist die Allowlist zu eng" (§13.1
 * Frage 3 ist offen), `text-nicht-utf8` heißt „die Datei ist kaputt oder in
 * einer anderen Kodierung", `kein-inhalt` heißt „es sind keine Bytes
 * angekommen".
 */
export type MimeAblehnungsGrund =
  | "kein-inhalt"
  | "inhalt-nicht-erlaubt"
  | "zip-nicht-office"
  | "text-nicht-ausgewiesen"
  | "text-nicht-utf8";

export type MimeBefund =
  | { ok: true; typ: ErlaubterMimeTyp; abweichungen: readonly MimeAbweichung[] }
  | { ok: false; grund: MimeAblehnungsGrund; meldung: string };

/** Was `pruefeInhaltstyp` braucht — alles, was der Aufrufer schon hat. */
export type MimeEingabe = {
  /** Die ersten `MIME_PRAEFIX_BYTES` der geschriebenen Zwischendatei. */
  praefix: Uint8Array;
  /**
   * Die **gemessene** Gesamtgröße der Datei (aus `schreibeStrom`, nicht aus
   * einer Client-Angabe). Sie sagt, ob das Präfix abgeschnitten ist — daran
   * hängt die Nachsicht gegenüber einer zerschnittenen UTF-8-Sequenz. Ein
   * eigener Schalter dafür wäre ein zweiter Wert, den ein Aufrufer falsch
   * setzen kann; die Bytezahl hat er ohnehin.
   */
  gesamtGroesse: number;
  /** Der vom Client deklarierte Inhaltstyp, oder `null`, wenn keiner kam. */
  deklariert: string | null | undefined;
  /** Der **Anzeigename** (nicht ein Pfad) — nur die Endung wird gelesen. */
  dateiname: string;
};

const ZIP_CONTAINER = "zip-container";

/** Die drei Typen, die dieselben vier Signaturbytes tragen wie jedes ZIP. */
const OOXML_TYPEN: readonly ErlaubterMimeTyp[] = [DOCX, XLSX, PPTX];

/**
 * ISO-BMFF-Marken ab Offset 8. Ohne diese Prüfung wäre jede `ftyp`-Datei ein
 * HEIC — auch ein MP4 (`isom`) oder ein AVIF (`avif`), die beide in keiner
 * Allowlist dieses Moduls stehen.
 */
const HEIC_MARKEN = ["heic", "heix", "hevc", "hevx", "heim", "heis", "hevm", "hevs"] as const;
const HEIF_MARKEN = ["mif1", "msf1"] as const;

type Signatur = {
  typ: ErlaubterMimeTyp | typeof ZIP_CONTAINER;
  teile: readonly { ab: number; bytes: readonly number[] }[];
};

function ascii(text: string): number[] {
  return [...text].map((zeichen) => zeichen.charCodeAt(0));
}

/**
 * Die Tabelle, die wir besitzen — statt einer Abhängigkeit (§8.5: „keine neue
 * Abhängigkeit"). Der Preis ist benannt: bei jedem neuen Containerformat zieht
 * sie nach. Jede Signatur wird an einem **festen Offset** geprüft.
 */
const SIGNATUREN: readonly Signatur[] = [
  { typ: "image/jpeg", teile: [{ ab: 0, bytes: [0xff, 0xd8, 0xff] }] },
  { typ: "image/png", teile: [{ ab: 0, bytes: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] }] },
  { typ: "image/gif", teile: [{ ab: 0, bytes: ascii("GIF87a") }] },
  { typ: "image/gif", teile: [{ ab: 0, bytes: ascii("GIF89a") }] },
  {
    typ: "image/webp",
    teile: [
      { ab: 0, bytes: ascii("RIFF") },
      { ab: 8, bytes: ascii("WEBP") },
    ],
  },
  ...HEIC_MARKEN.map<Signatur>((marke) => ({
    typ: "image/heic",
    teile: [
      { ab: 4, bytes: ascii("ftyp") },
      { ab: 8, bytes: ascii(marke) },
    ],
  })),
  ...HEIF_MARKEN.map<Signatur>((marke) => ({
    typ: "image/heif",
    teile: [
      { ab: 4, bytes: ascii("ftyp") },
      { ab: 8, bytes: ascii(marke) },
    ],
  })),
  { typ: "application/pdf", teile: [{ ab: 0, bytes: ascii("%PDF-") }] },
  // Nur der Local-File-Header `PK\x03\x04`. `PK\x05\x06` ist ein LEERES Archiv
  // und `PK\x07\x08` ein gespanntes — beides ist kein Office-Dokument.
  { typ: ZIP_CONTAINER, teile: [{ ab: 0, bytes: [0x50, 0x4b, 0x03, 0x04] }] },
];

/**
 * Die Feststellung. `null` heißt „keine Signatur getroffen" — und das ist keine
 * Vorstufe zu `text/plain`, sondern schlicht keine Evidenz.
 *
 * **Jede Signatur greift nur an ihrem Offset.** Viele PDF-Leser suchen `%PDF-`
 * in den ersten 1024 Bytes; wer das hier nachbaut, nimmt einen Polyglot an, der
 * im Browser HTML und im PDF-Leser ein PDF ist — und liefert ihn unter
 * `application/pdf` aus.
 */
function signaturTyp(praefix: Uint8Array): ErlaubterMimeTyp | typeof ZIP_CONTAINER | null {
  for (const signatur of SIGNATUREN) {
    const trifft = signatur.teile.every(
      (teil) =>
        // Diese Längenprüfung ist in DIESER Schreibweise redundant — ein Zugriff
        // hinter das Ende liefert `undefined`, und das ist nie `=== byte`.
        // Sie steht hier, weil sie es bei der naheliegenden Umschreibung auf
        // `praefix.subarray(ab, ab + n)` plus Vergleich über die Länge des
        // Ausschnitts NICHT mehr ist: dann trifft `ff d8` die JPEG-Signatur
        // `ff d8 ff`. Bewacht wird das Verhalten vom Test „lehnt eine
        // abgeschnittene Signatur ab", nicht von dieser Zeile.
        teil.ab + teil.bytes.length <= praefix.length &&
        teil.bytes.every((byte, i) => praefix[teil.ab + i] === byte),
    );
    if (trifft) return signatur.typ;
  }
  return null;
}

/** `text/plain; charset=utf-8` → `text/plain`; Leerwerte → `null`. */
function normalisiereDeklaration(roh: string | null | undefined): string | null {
  if (typeof roh !== "string") return null;
  const ohneParameter = (roh.split(";")[0] ?? "").trim().toLowerCase();
  return ohneParameter === "" ? null : ohneParameter;
}

/**
 * Die Endung **nach dem letzten Punkt**, kleingeschrieben, ohne Punkt.
 *
 * Der letzte Punkt und nicht der erste: `foto.jpg.txt` ist für jedes
 * Betriebssystem eine `.txt`-Datei, und genau diese Doppelendung liegt im
 * Altbestand (Analyse Abschnitt 2.4). Ein Name, der mit einem Punkt beginnt
 * (`.gitignore`) oder endet, hat keine Endung.
 */
function dateiEndung(dateiname: string): string {
  const punkt = dateiname.lastIndexOf(".");
  if (punkt <= 0 || punkt === dateiname.length - 1) return "";
  return dateiname.slice(punkt + 1).toLowerCase();
}

function endungenVon(typ: ErlaubterMimeTyp): readonly string[] {
  return MIME_ALLOWLIST.find((eintrag) => eintrag.typ === typ)?.endungen ?? [];
}

/**
 * Ist der Rest am Präfixende der **Anfang** einer Mehrbyte-Sequenz? Nur dann
 * darf eine abgeschnittene Datei als gültiges UTF-8 durchgehen.
 */
function istUnvollstaendigeSequenz(rest: Uint8Array): boolean {
  const erstes = rest[0];
  if (erstes === undefined) return false;
  let laenge = 0;
  if (erstes >= 0xc2 && erstes <= 0xdf) laenge = 2;
  else if (erstes >= 0xe0 && erstes <= 0xef) laenge = 3;
  else if (erstes >= 0xf0 && erstes <= 0xf4) laenge = 4;
  else return false;
  // Eine VOLLSTÄNDIGE Sequenz hätte dekodieren müssen; dann ist sie kaputt.
  if (rest.length >= laenge) return false;
  return rest.slice(1).every((byte) => byte >= 0x80 && byte <= 0xbf);
}

/**
 * Zwei Bedingungen, und die zweite steht nicht im Standard:
 *
 * 1. **gültiges UTF-8** (`TextDecoder` mit `fatal: true` — eine Implementierung
 *    der Plattform, keine eigene Zustandsmaschine);
 * 2. **kein NUL-Byte.** UTF-8 erlaubt NUL, echter Text enthält es nie. Ohne
 *    diese Zeile geht UTF-16-Text durch (`H\0a\0l\0l\0o\0` ist gültiges UTF-8),
 *    würde als `text/plain` ausgeliefert und wäre im Browser unlesbar — und
 *    jede Binärdatei ohne bekannte Signatur, deren Bytes zufällig gültiges
 *    UTF-8 sind, gleich mit.
 *
 * Bei einem **abgeschnittenen** Präfix darf die letzte Sequenz unvollständig
 * sein: die Präfixgrenze fällt irgendwann mitten in ein `ö`, und ohne diese
 * Nachsicht wäre jede längere Textdatei je nach Länge still abgelehnt.
 */
function istUtf8Text(praefix: Uint8Array, abgeschnitten: boolean): boolean {
  if (praefix.includes(0)) return false;
  const decoder = new TextDecoder("utf-8", { fatal: true });
  try {
    decoder.decode(praefix);
    return true;
  } catch {
    if (!abgeschnitten) return false;
  }
  // Eine an der Grenze zerschnittene Sequenz ist höchstens 3 Bytes lang.
  for (let weg = 1; weg <= 3 && weg < praefix.length; weg++) {
    const kopf = praefix.subarray(0, praefix.length - weg);
    try {
      decoder.decode(kopf);
    } catch {
      continue;
    }
    if (istUnvollstaendigeSequenz(praefix.subarray(praefix.length - weg))) return true;
  }
  return false;
}

/** Für Meldungen: „.jpg, .jpeg, …" aus der Allowlist, nicht aus einem Literal. */
function erlaubteEndungenText(): string {
  const alle = new Set<string>();
  for (const eintrag of MIME_ALLOWLIST) for (const endung of eintrag.endungen) alle.add(endung);
  return [...alle].map((endung) => `.${endung}`).join(", ");
}

function ablehnung(grund: MimeAblehnungsGrund, meldung: string): MimeBefund {
  return { ok: false, grund, meldung };
}

/**
 * Stellt den Typ aus den Bytes fest und gleicht ihn gegen Deklaration und
 * Endung ab. **Die Feststellung gewinnt** — Deklaration und Endung erzeugen
 * höchstens eine `abweichung`, die der Aufrufer protokollieren kann.
 *
 * ZWEI STELLEN, AN DENEN DAS ANDERS IST, UND BEIDE HABEN EINEN GRUND:
 *
 * - **ZIP-Container.** DOCX, XLSX und PPTX tragen dieselben vier Bytes; am
 *   Präfix sind sie nicht zu unterscheiden. Dort verfeinert die Deklaration und
 *   — wenn sie fehlt oder `application/octet-stream` sagt — die Endung. Die
 *   Feststellung gewinnt trotzdem: ein ZIP wird dadurch nie ein PDF, und ohne
 *   Office-Ausweis wird es abgelehnt.
 * - **`text/plain`.** Der einzige Allowlist-Typ **ohne** Signatur; es gibt für
 *   ihn keine positive Byte-Evidenz. Deshalb muss er von **beiden** anderen
 *   Richtungen ausgewiesen werden (Deklaration `text/plain` **und** eine
 *   Textendung). Nur die Deklaration genügt nicht: sonst kommt `bericht.html`
 *   als `text/plain` durch und ist beim Empfänger nach dem Speichern einen
 *   Doppelklick von ausgeführtem Markup entfernt. Und eine **fehlende**
 *   Deklaration darf hier nie durchfallen — genau das war der Durchschlupf von
 *   `drop`: `@fastify/busboy` setzt `contype = 'text/plain'`, wenn ein
 *   Multipart-Teil keinen Header trägt.
 *
 * Eine fehlende Deklaration ist für die **Signatur**formate dagegen keine
 * Ablehnung, sondern eine Abweichung: Browser lassen `File.type` leer, wenn sie
 * eine Endung nicht kennen, und ein echtes PNG deswegen abzulehnen verlangt
 * keine Zeile der Spec (§8.5 lehnt ab, wenn „die **Feststellung** von der
 * Allowlist abweicht").
 */
export function pruefeInhaltstyp(eingabe: MimeEingabe): MimeBefund {
  const { praefix, gesamtGroesse } = eingabe;
  const deklariert = normalisiereDeklaration(eingabe.deklariert);
  const endung = dateiEndung(eingabe.dateiname);

  if (praefix.length === 0 || gesamtGroesse === 0) {
    return ablehnung(
      "kein-inhalt",
      "Die Datei enthält keine Bytes und lässt sich deshalb keinem Format zuordnen.",
    );
  }

  const festgestellt = signaturTyp(praefix);

  if (festgestellt === ZIP_CONTAINER) {
    const ausDeklaration = OOXML_TYPEN.find((typ) => typ === deklariert);
    const ausEndung = OOXML_TYPEN.find((typ) => endungenVon(typ).includes(endung));
    const typ = ausDeklaration ?? ausEndung;
    if (!typ) {
      return ablehnung(
        "zip-nicht-office",
        "Die Datei ist ein ZIP-Archiv. Angenommen werden davon nur die Office-Formate " +
          ".docx, .xlsx und .pptx.",
      );
    }
    return befundOk(typ, deklariert, endung);
  }

  if (festgestellt !== null) return befundOk(festgestellt, deklariert, endung);

  // Keine Signatur: der einzige signaturfreie Allowlist-Typ ist `text/plain`,
  // und er braucht beide Positivsignale.
  const abgeschnitten = gesamtGroesse > praefix.length;
  const alsTextAusgewiesen = deklariert === "text/plain" && endungenVon("text/plain").includes(endung);

  if (!alsTextAusgewiesen) {
    // Die Unterscheidung ist der nächste Schritt des Betreibers: sieht der
    // Inhalt wie Text aus, ist womöglich die Allowlist zu eng (§13.1 Frage 3);
    // ist er binär, gehört die Datei schlicht nicht hierher.
    if (istUtf8Text(praefix, abgeschnitten)) {
      return ablehnung(
        "text-nicht-ausgewiesen",
        "Der Inhalt ist Text, wird aber nicht als solcher ausgewiesen. Reiner Text wird nur " +
          "als .txt mit dem Inhaltstyp text/plain angenommen.",
      );
    }
    return ablehnung(
      "inhalt-nicht-erlaubt",
      `Der Inhalt gehört zu keinem der erlaubten Formate (${erlaubteEndungenText()}).`,
    );
  }

  if (!istUtf8Text(praefix, abgeschnitten)) {
    return ablehnung(
      "text-nicht-utf8",
      "Die Datei ist als Text angegeben, ihr Inhalt ist aber kein gültiges UTF-8.",
    );
  }

  return befundOk("text/plain", deklariert, endung);
}

/** Der Erfolgsfall samt Abgleich in den beiden anderen Richtungen. */
function befundOk(
  typ: ErlaubterMimeTyp,
  deklariert: string | null,
  endung: string,
): MimeBefund {
  const abweichungen: MimeAbweichung[] = [];
  if (deklariert !== typ) abweichungen.push("deklaration");
  if (!endungenVon(typ).includes(endung)) abweichungen.push("endung");
  return { ok: true, typ, abweichungen };
}
