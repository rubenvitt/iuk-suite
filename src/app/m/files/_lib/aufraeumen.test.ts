import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  shareLoeschbar,
  uploadVerfallen,
  logzeileVerfallen,
  inboxVerfallen,
  planeAufraeumen,
  type Aufraeumfristen,
  type AufraeumEingabe,
} from "./aufraeumen";

/*
 * Die Loeschregeln aus Spec §7.6 — und der Grund, warum sie REINE Funktionen
 * sind: eine Regel, die ihre Uhr selbst liest, ist nur mit Zeitreise pruefbar,
 * und eine, die das Dateisystem befragt, nur mit einem Verzeichnis. Beides
 * waere hier kein Detail: der erste Lauf nach dem Cutover ist ein
 * LOESCHEREIGNIS (Analyse Abschnitt 8, Punkt 7), und der Trockenlauf davor ist
 * die einzige Vorschau, die der Betreiber bekommt.
 *
 * Die Zahlen kommen aus `_lib/grenzen.ts` (Vorbelegungen: Karenz 24 h, Verfall
 * 24 h, Log 90 Tage, Inbox OHNE Frist) — hier stehen sie als Testwerte, weil
 * eine Regel gegen ihre eigene Vorbelegung geprueft nichts belegt.
 */

const STUNDE = 3600_000;
const TAG = 24 * STUNDE;
const SEKUNDE = 1000;

/** Eine feste Uhr. Keine der geprueften Funktionen darf eine eigene haben. */
const JETZT = new Date("2026-07-30T12:00:00.000Z");
const vor = (ms: number) => new Date(JETZT.getTime() - ms);
const nach = (ms: number) => new Date(JETZT.getTime() + ms);

const FRISTEN: Aufraeumfristen = {
  loeschKarenzStunden: 24,
  uploadVerfallStunden: 24,
  logAufbewahrungTage: 90,
  // `null` = keine Frist — das heutige Verhalten von `drop` (Spec §7.6).
  inboxAufbewahrungTage: null,
  aufraeumenTrockenlauf: false,
};

type ShareEingabe = AufraeumEingabe["shares"][number];
type DateiEingabe = AufraeumEingabe["dateien"][number];
type LogEingabe = AufraeumEingabe["logzeilen"][number];
type InboxEingabe = AufraeumEingabe["inbox"][number];

function share(teil: Partial<ShareEingabe> & Pick<ShareEingabe, "id">): ShareEingabe {
  return {
    expiresAt: nach(7 * TAG),
    downloadCount: 0,
    maxDownloads: null,
    ...teil,
  };
}

function datei(teil: Partial<DateiEingabe> & Pick<DateiEingabe, "id" | "shareId">): DateiEingabe {
  return {
    size: 1000,
    createdAt: vor(STUNDE),
    bytesVollstaendigAt: vor(STUNDE),
    ...teil,
  };
}

function logzeile(teil: Partial<LogEingabe> & Pick<LogEingabe, "id" | "shareId">): LogEingabe {
  return { downloadedAt: vor(STUNDE), ...teil };
}

function inboxDatei(teil: Partial<InboxEingabe> & Pick<InboxEingabe, "id">): InboxEingabe {
  return { size: 2000, empfangenAt: vor(STUNDE), ...teil };
}

/**
 * Die Lage, gegen die mehrere Zusagen gleichzeitig gelten. Sie ist bewusst
 * EINE: die Regeln greifen im echten Lauf zusammen, und ein Fehler zeigt sich
 * meist im Zusammenspiel (die Logzeile eines geloeschten Shares, die
 * unvollstaendige Datei IN einem geloeschten Share).
 *
 * Alle IDs sind zehnzeichig wie `nanoid(10)` (`_lib/storage.ts:26`) — mit
 * kuerzeren IDs waere ein spaeterer Pfadbau im Test gruen und in Produktion
 * rot.
 */
function lage(): AufraeumEingabe {
  return {
    now: JETZT,
    fristen: FRISTEN,
    shares: [
      // Abgelaufen VOR der Karenz → loeschbar.
      share({ id: "sh-alt-001", expiresAt: vor(25 * STUNDE) }),
      // AUSGESCHOEPFT, aber nicht abgelaufen → bleibt (der Alt-Defekt).
      share({ id: "sh-limit-1", downloadCount: 3, maxDownloads: 3 }),
      share({ id: "sh-frisch1" }),
    ],
    dateien: [
      datei({ id: "fi-alt-a01", shareId: "sh-alt-001", size: 1000 }),
      // Unvollstaendig UND in einem Share, der stirbt: zaehlt einmal, steht
      // aber nicht einzeln in der Loeschliste.
      datei({
        id: "fi-alt-b02",
        shareId: "sh-alt-001",
        size: 500,
        bytesVollstaendigAt: null,
        createdAt: vor(30 * STUNDE),
      }),
      // Unvollstaendig in einem Share, der LEBT → einzeln loeschbar.
      datei({
        id: "fi-halb-01",
        shareId: "sh-frisch1",
        size: 700,
        bytesVollstaendigAt: null,
        createdAt: vor(30 * STUNDE),
      }),
      // Unvollstaendig, aber jung → ein laufender Upload, kein Ueberrest.
      datei({
        id: "fi-neu-001",
        shareId: "sh-frisch1",
        size: 900,
        bytesVollstaendigAt: null,
        createdAt: vor(STUNDE),
      }),
      datei({ id: "fi-lim-a01", shareId: "sh-limit-1", size: 300 }),
    ],
    logzeilen: [
      // Die Logzeile des STERBENDEN Shares, frisch → bleibt. Genau das ist der
      // Zweck des fehlenden FK (Spec §4.5, Analyse E12 b).
      logzeile({ id: 1, shareId: "sh-alt-001", downloadedAt: vor(STUNDE) }),
      logzeile({ id: 2, shareId: "sh-frisch1", downloadedAt: vor(91 * TAG) }),
    ],
    inbox: [inboxDatei({ id: "in-alt-001", empfangenAt: vor(400 * TAG) })],
    // ALLE bekannten IDs, hier deckungsgleich mit `shares`. Dass beides
    // auseinanderfallen KANN, pruefen zwei eigene Faelle in Regel 6.
    alleShareIds: ["sh-alt-001", "sh-limit-1", "sh-frisch1"],
    // Die Wurzel-Auflistung, wie `readdir` sie liefert: neben den
    // Share-Verzeichnissen liegen dort planmaessig `inbox/` und im Fehlerfall
    // eine liegen gebliebene `.ablage-probe`.
    blobVerzeichnisse: [
      "sh-alt-001",
      "sh-limit-1",
      "sh-frisch1",
      "sh-waise01",
      "inbox",
      ".ablage-probe",
    ],
  };
}

describe("Regel 1: Share loeschbar erst nach expires_at + Karenz", () => {
  it("loescht einen Share, der eine Sekunde JENSEITS der Karenz liegt", () => {
    const s = share({ id: "sh-alt-001", expiresAt: vor(24 * STUNDE + SEKUNDE) });
    expect(shareLoeschbar(s, JETZT, FRISTEN)).toBe(true);
  });

  it("loescht ihn GENAU auf der Schwelle nicht", () => {
    // `<`, nicht `<=`: auf der Schwelle ist die Karenz noch nicht abgelaufen.
    const s = share({ id: "sh-alt-001", expiresAt: vor(24 * STUNDE) });
    expect(shareLoeschbar(s, JETZT, FRISTEN)).toBe(false);
  });

  it("loescht ihn eine Sekunde vor der Schwelle nicht", () => {
    const s = share({ id: "sh-alt-001", expiresAt: vor(24 * STUNDE - SEKUNDE) });
    expect(shareLoeschbar(s, JETZT, FRISTEN)).toBe(false);
  });

  it("loescht einen abgelaufenen Share ohne Karenz nicht sofort", () => {
    // Ohne Karenz war die Alt-App asymmetrisch (`cleanup/route.ts:26`): kein
    // Aufschub fuer abgelaufene Shares, 24 h fuer limit-erreichte. Mit EINEM
    // Wert ist ein Share nach Ablauf ueberhaupt noch verlaengerbar.
    const s = share({ id: "sh-alt-001", expiresAt: vor(SEKUNDE) });
    expect(shareLoeschbar(s, JETZT, FRISTEN)).toBe(false);
  });

  it("haelt die Grenze auch bei Karenz 0 ein (der Cutover-Wert)", () => {
    // `min: 0` ist in `grenzen.ts:115` ausdruecklich erlaubt. Ein Fehler um
    // eins loescht hier einen Share, der noch laeuft.
    const ohneKarenz: Aufraeumfristen = { ...FRISTEN, loeschKarenzStunden: 0 };
    const mitAblauf = (expiresAt: Date) =>
      shareLoeschbar(share({ id: "sh-alt-001", expiresAt }), JETZT, ohneKarenz);
    expect(mitAblauf(vor(SEKUNDE))).toBe(true);
    expect(mitAblauf(JETZT)).toBe(false);
    expect(mitAblauf(nach(SEKUNDE))).toBe(false);
  });
});

describe("Regel 2: ein ausgeschoepfter, nicht abgelaufener Share bleibt", () => {
  it("loescht einen Share mit erreichtem Limit nicht", () => {
    // DER Alt-Defekt (Analyse Zeile 251): `cleanup/route.ts:27` loeschte per
    // `limit_reached_at` einen Share, der weder abgelaufen war noch sein Limit
    // erreicht hatte — samt Bytes. Die Spalte ist gestrichen, die Regel kennt
    // den Zaehler nicht mehr.
    const s = share({ id: "sh-limit-1", downloadCount: 3, maxDownloads: 3 });
    expect(shareLoeschbar(s, JETZT, FRISTEN)).toBe(false);
  });

  it("loescht auch bei UEBERschrittenem Zaehler nicht", () => {
    const s = share({ id: "sh-limit-1", downloadCount: 9, maxDownloads: 3 });
    expect(shareLoeschbar(s, JETZT, FRISTEN)).toBe(false);
  });

  it("loescht einen ausgeschoepften Share, sobald Ablauf plus Karenz vorbei ist", () => {
    // Die Gegenprobe: der Zaehler darf das Loeschen auch nicht VERHINDERN,
    // sonst belegte ein ausgeschoepfter Share fuer immer Platz.
    const s = share({
      id: "sh-limit-1",
      downloadCount: 3,
      maxDownloads: 3,
      expiresAt: vor(25 * STUNDE),
    });
    expect(shareLoeschbar(s, JETZT, FRISTEN)).toBe(true);
  });

  it("laesst den ausgeschoepften Share aus der Loeschliste des ganzen Laufs heraus", () => {
    const plan = planeAufraeumen(lage());
    expect(plan.loeschen.shareIds).toEqual(["sh-alt-001"]);
    expect(plan.loeschen.shareIds).not.toContain("sh-limit-1");
    expect(plan.zahlen.sharesGeloescht).toBe(1);
  });
});

describe("Regel 3: unvollstaendige Uploads samt Zwischendatei", () => {
  it("loescht eine unvollstaendige Zeile jenseits des Verfalls", () => {
    const d = datei({
      id: "fi-halb-01",
      shareId: "sh-frisch1",
      bytesVollstaendigAt: null,
      createdAt: vor(24 * STUNDE + SEKUNDE),
    });
    expect(uploadVerfallen(d, JETZT, FRISTEN)).toBe(true);
  });

  it("loescht eine VOLLSTAENDIGE alte Zeile nicht", () => {
    const d = datei({
      id: "fi-alt-a01",
      shareId: "sh-frisch1",
      bytesVollstaendigAt: vor(400 * TAG),
      createdAt: vor(400 * TAG),
    });
    expect(uploadVerfallen(d, JETZT, FRISTEN)).toBe(false);
  });

  it("loescht eine unvollstaendige Zeile auf der Schwelle nicht", () => {
    const d = datei({
      id: "fi-neu-001",
      shareId: "sh-frisch1",
      bytesVollstaendigAt: null,
      createdAt: vor(24 * STUNDE),
    });
    expect(uploadVerfallen(d, JETZT, FRISTEN)).toBe(false);
  });

  it("nennt nur die unvollstaendigen Zeilen ueberlebender Shares einzeln — mit Zwischendatei", () => {
    const plan = planeAufraeumen(lage());
    // `fi-alt-b02` ist ebenfalls unvollstaendig und alt, stirbt aber mit
    // seinem Share: eine zweite Nennung waere ein Loeschauftrag auf eine Zeile,
    // die es dann nicht mehr gibt.
    expect(plan.loeschen.dateiIds).toEqual(["fi-halb-01"]);
    expect(plan.loeschen.parts).toEqual([
      { art: "share", shareId: "sh-frisch1", fileId: "fi-halb-01" },
    ]);
    // Gezaehlt wird sie trotzdem, und zwar genau einmal:
    // 2 Zeilen aus sh-alt-001 + fi-halb-01.
    expect(plan.zahlen.dateienGeloescht).toBe(3);
    // 1000 + 500 + 700 — die `size` aus der Datenbank, nicht die Laenge auf der
    // Platte. `fi-alt-b02`/`fi-halb-01` sind hier importierte Zeilen mit Altwert;
    // die heutige Produktionsform einer unvollstaendigen Zeile ist `size = 0`
    // (§7.1) und steht im Fall darunter.
    expect(plan.zahlen.bytesGeloescht).toBe(2200);
  });

  it("zaehlt eine neue unvollstaendige Zeile mit ihren null Bytes", () => {
    // §7.1 Schritt 1 legt jede `share_files`-Zeile mit `size = 0` an; der Wert
    // entsteht erst beim letzten Chunk. Es gibt also keine „angekuendigte"
    // Groesse, und die Vorschau nennt fuer diese Zeile genau 0 — die tatsaechliche
    // Laenge der `.part` kennt nur der Ausfuehrende. Ohne diesen Fall kaeme die
    // Produktionsform in der Suite nicht ein einziges Mal vor.
    const plan = planeAufraeumen({
      now: JETZT,
      fristen: FRISTEN,
      shares: [share({ id: "sh-frisch1" })],
      alleShareIds: ["sh-frisch1"],
      dateien: [
        datei({
          id: "fi-leer-01",
          shareId: "sh-frisch1",
          size: 0,
          bytesVollstaendigAt: null,
          createdAt: vor(30 * STUNDE),
        }),
      ],
      logzeilen: [],
      inbox: [],
      blobVerzeichnisse: [],
    });
    expect(plan.loeschen.dateiIds).toEqual(["fi-leer-01"]);
    expect(plan.loeschen.parts).toEqual([
      { art: "share", shareId: "sh-frisch1", fileId: "fi-leer-01" },
    ]);
    expect(plan.zahlen.dateienGeloescht).toBe(1);
    expect(plan.zahlen.bytesGeloescht).toBe(0);
  });
});

describe("Regel 4: Audit-Logzeilen haben ihre EIGENE Frist", () => {
  it("loescht eine Logzeile jenseits der Aufbewahrung", () => {
    expect(
      logzeileVerfallen(
        logzeile({ id: 2, shareId: "sh-frisch1", downloadedAt: vor(90 * TAG + SEKUNDE) }),
        JETZT,
        FRISTEN,
      ),
    ).toBe(true);
  });

  it("loescht eine Logzeile auf der Schwelle nicht", () => {
    expect(
      logzeileVerfallen(
        logzeile({ id: 2, shareId: "sh-frisch1", downloadedAt: vor(90 * TAG) }),
        JETZT,
        FRISTEN,
      ),
    ).toBe(false);
  });

  it("laesst die frische Logzeile eines GELOESCHTEN Shares stehen (kein Cascade)", () => {
    // Ein Log, das mit seinem Share stirbt, ist kein Audit-Log — es
    // verschwindet genau dann, wenn man es braucht (Analyse E12 b). Die Zeile
    // hier traegt die shareId von `sh-alt-001` und liegt INNERHALB der
    // Aufbewahrung: nur so sind die beiden Regeln unterscheidbar.
    const plan = planeAufraeumen(lage());
    expect(plan.loeschen.shareIds).toContain("sh-alt-001");
    expect(plan.loeschen.logzeilenIds).toEqual([2]);
    expect(plan.loeschen.logzeilenIds).not.toContain(1);
    expect(plan.zahlen.logzeilenGeloescht).toBe(1);
  });
});

describe("Regel 5: Inbox-Dateien nur mit gesetzter Frist", () => {
  it("loescht ohne gesetzte Frist gar nichts — auch nicht nach Jahren", () => {
    // Nicht gesetzt heisst „keine Frist" und NICHT „sofort": das ist das
    // heutige Verhalten von `drop` (weder Frist noch Loeschfunktion).
    const alt = inboxDatei({ id: "in-alt-001", empfangenAt: vor(400 * TAG) });
    expect(inboxVerfallen(alt, JETZT, FRISTEN)).toBe(false);

    const plan = planeAufraeumen(lage());
    expect(plan.loeschen.inboxIds).toEqual([]);
    expect(plan.zahlen.inboxGeloescht).toBe(0);
  });

  it("loescht mit gesetzter Frist jenseits der Schwelle", () => {
    const mitFrist: Aufraeumfristen = { ...FRISTEN, inboxAufbewahrungTage: 30 };
    expect(
      inboxVerfallen(
        inboxDatei({ id: "in-alt-001", empfangenAt: vor(30 * TAG + SEKUNDE) }),
        JETZT,
        mitFrist,
      ),
    ).toBe(true);
    expect(
      inboxVerfallen(inboxDatei({ id: "in-alt-001", empfangenAt: vor(30 * TAG) }), JETZT, mitFrist),
    ).toBe(false);
  });

  it("nennt mit gesetzter Frist die Datei und ihre Bytes im Plan", () => {
    const plan = planeAufraeumen({
      ...lage(),
      fristen: { ...FRISTEN, inboxAufbewahrungTage: 30 },
    });
    expect(plan.loeschen.inboxIds).toEqual(["in-alt-001"]);
    expect(plan.zahlen.inboxGeloescht).toBe(1);
    // 2200 aus den Shares plus die 2000 der Inbox-Datei.
    expect(plan.zahlen.bytesGeloescht).toBe(4200);
  });
});

describe("Regel 6: verwaiste Blobs werden BERICHTET, nicht geloescht", () => {
  it("meldet ein Verzeichnis ohne shares-Zeile und loescht es nicht", () => {
    const plan = planeAufraeumen(lage());
    expect(plan.verwaisteBlobs).toEqual(["sh-waise01"]);
    expect(plan.zahlen.verwaisteBlobsGemeldet).toBe(1);
    // Automatisch geloescht waere das in einem Modul, dessen Bestand gerade
    // importiert wird, der teuerste denkbare Fehler (Spec §7.6).
    expect(plan.loeschen.shareIds).not.toContain("sh-waise01");
  });

  it("meldet das Verzeichnis eines gerade geloeschten Shares NICHT als verwaist", () => {
    // Gemessen wird gegen ALLE bekannten Shares, nicht gegen die Ueberlebenden.
    // Sonst stiege die Waisenzahl mit jedem Lauf, und der Betreiber jagte
    // Bytes, die planmaessig verschwinden.
    const plan = planeAufraeumen(lage());
    expect(plan.verwaisteBlobs).not.toContain("sh-alt-001");
  });

  it("meldet das Verzeichnis eines lebenden Shares nicht", () => {
    const plan = planeAufraeumen(lage());
    expect(plan.verwaisteBlobs).not.toContain("sh-frisch1");
    expect(plan.verwaisteBlobs).not.toContain("sh-limit-1");
  });

  it("meldet `inbox` und eine liegen gebliebene `.ablage-probe` NICHT", () => {
    // Beide liegen planmaessig in derselben Wurzel wie die Share-Verzeichnisse
    // (`storage.ts:120-126` und `:365`) und bekommen NIE eine `shares`-Zeile.
    // Waeren sie im Bericht, stuenden dort zwei dauerhafte Phantomeintraege — und
    // wer den Bericht befolgt, loescht mit `inbox` das ganze anonyme Postfach.
    const plan = planeAufraeumen(lage());
    expect(plan.verwaisteBlobs).toEqual(["sh-waise01"]);
    expect(plan.zahlen.verwaisteBlobsGemeldet).toBe(1);
  });

  it("meldet ein LEBENDES Verzeichnis nicht, wenn `shares` nur die abgelaufenen traegt", () => {
    // Die naheliegende Kandidatenabfrage ist `WHERE expires_at < now − Karenz`
    // (dafuer ist `idx_shares_expires` da). Mit ihr als Referenzmenge waere jedes
    // lebende Verzeichnis eine Waise — deshalb ist die Referenz ein eigenes,
    // benanntes Argument.
    const grund = lage();
    const plan = planeAufraeumen({
      ...grund,
      shares: grund.shares.filter((s) => s.id === "sh-alt-001"),
    });
    expect(plan.loeschen.shareIds).toEqual(["sh-alt-001"]);
    expect(plan.verwaisteBlobs).toEqual(["sh-waise01"]);
  });

  it("meldet ein sterbendes Verzeichnis auch dann nicht, wenn `alleShareIds` es nicht nennt", () => {
    // Die Referenzmenge ist `alleShareIds` VEREINIGT mit den Kandidaten: ein
    // Aufrufer, der beim Fuellen des Feldes danebengreift, soll den Bericht
    // hoechstens unvollstaendig machen — nicht das Verzeichnis eines Shares
    // hineinschreiben, den derselbe Lauf gerade loescht.
    const plan = planeAufraeumen({ ...lage(), alleShareIds: [] });
    expect(plan.verwaisteBlobs).not.toContain("sh-alt-001");
  });
});

describe("Regel 7: der Trockenlauf zaehlt gleich und loescht nichts", () => {
  it("liefert dieselben Zahlen wie der echte Lauf, aber eine leere Loeschliste", () => {
    const echt = planeAufraeumen({
      ...lage(),
      fristen: { ...FRISTEN, inboxAufbewahrungTage: 30 },
    });
    const trocken = planeAufraeumen({
      ...lage(),
      fristen: { ...FRISTEN, inboxAufbewahrungTage: 30, aufraeumenTrockenlauf: true },
    });

    expect(trocken.trockenlauf).toBe(true);
    expect(echt.trockenlauf).toBe(false);
    // Der Vergleich ist der ZWECK des Trockenlaufs vor dem ersten Lauf nach
    // dem Cutover (Spec §4.8): eine Vorschau mit anderen Zahlen ist keine.
    expect(trocken.zahlen).toEqual(echt.zahlen);
    expect(echt.zahlen.sharesGeloescht).toBeGreaterThan(0);

    expect(trocken.loeschen).toEqual({
      shareIds: [],
      dateiIds: [],
      logzeilenIds: [],
      inboxIds: [],
      parts: [],
    });
    // Der Bericht bleibt: er loescht nichts und ist die einzige Sicht auf
    // verwaiste Bytes.
    expect(trocken.verwaisteBlobs).toEqual(echt.verwaisteBlobs);
  });
});

describe("Die ID-Form der Waisenpruefung bleibt an `storage.ts` gebunden", () => {
  /**
   * Die Form steht ZWEIMAL im Quelltext: als `ID_MUSTER` in `storage.ts` (dort
   * privat, weil das Pruefen von IDs Sache der Ablage ist) und als
   * `SHARE_ID_MUSTER` in `aufraeumen.ts`. Dieser Fall ist die Klammer darum —
   * ohne ihn liefe die Kopie irgendwann auseinander, und der Waisenbericht
   * meldete wieder `inbox`.
   */
  const FORM = "/^[A-Za-z0-9_-]{10}$/";

  const literalVon = (datei: string, name: string): string | null => {
    const quelle = readFileSync(join(__dirname, datei), "utf8");
    return quelle.match(new RegExp(`const ${name} = (/.+/);`))?.[1] ?? null;
  };

  it("nennt in beiden Dateien dieselbe zehnzeichige nanoid-Form", () => {
    const inStorage = literalVon("storage.ts", "ID_MUSTER");
    const inAufraeumen = literalVon("aufraeumen.ts", "SHARE_ID_MUSTER");

    // ZUERST die Extraktion: bei einem Fehlschlag verglichen sonst zwei `null`
    // miteinander, und der Fall waere gruen, waehrend er nichts prueft.
    expect(inStorage, "`ID_MUSTER` in storage.ts nicht gefunden — Form geaendert?").not.toBeNull();
    expect(
      inAufraeumen,
      "`SHARE_ID_MUSTER` in aufraeumen.ts nicht gefunden — Form geaendert?",
    ).not.toBeNull();

    expect(inStorage).toBe(FORM);
    expect(inAufraeumen).toBe(FORM);
  });
});

describe("Die Datei hat keine Uhr und kein Dateisystem", () => {
  const quelle = readFileSync(join(__dirname, "aufraeumen.ts"), "utf8");

  it("ruft nirgends `Date.now()` oder `new Date()`", () => {
    // Eine Regel mit eigener Uhr ist nur mit Zeitreise pruefbar, und der
    // Trockenlauf koennte den echten Lauf nicht mehr vorhersagen: zwischen
    // Vorschau und Lauf haette sich `now` bewegt.
    expect(quelle).not.toMatch(/Date\.now\s*\(/);
    expect(quelle).not.toMatch(/new Date\s*\(/);
  });

  it("importiert kein Dateisystem-Modul", () => {
    // Das Verzeichnis liest der Aufrufer (T46) und uebergibt die Namen. Ohne
    // diese Trennung waere Regel 6 nur mit einem echten Verzeichnis pruefbar.
    expect(quelle).not.toMatch(/from\s+"node:fs/);
    expect(quelle).not.toMatch(/from\s+"fs/);
    expect(quelle).not.toMatch(/require\(\s*"(node:)?fs/);
  });

  it("bringt kein `\"use client\"` mit", () => {
    // Die Zahlen dieses Moduls liest eine Server Component (die Ablage-Kachel).
    // Ein WERT aus einem Client-Modul kommt dort als Client-Referenz an —
    // HTTP 500 fuer die ganze Seite, und Vitest kann das strukturell nicht
    // sehen (`docs/design/README.md:87-103`).
    expect(quelle).not.toMatch(/^\s*"use client"/m);
  });
});
