/**
 * T7 — die Ablage-Schicht des Moduls `files` (Spec §5.1–§5.4, §6.5).
 *
 * Die Aussagen dieser Suite, und warum sie hier und nicht im Browser gehören:
 * ein Pfad entsteht ausschliesslich aus DB-IDs, das Schreiben ist atomar über
 * eine deterministisch benannte Zwischendatei, und die zwei Betriebsfehler aus
 * §5.4 (ENOSPC/EACCES) sind eigene Fehlertypen — ohne sie trägt die Abbildung
 * auf 507/500 in T27/T31/T49 keine Mutation.
 *
 * `node:fs/promises` wird gemockt, aber nur an FÜNF Stellen: `open().write` (um
 * ENOSPC/EACCES/EPERM/EROFS überhaupt herstellen zu können), `open().sync` (um
 * `fsync` zu bezeugen), `open().close` (um die FD-Aufräumzusage aus §5.3 zu
 * bezeugen), `readFile` (um die Rückleseprobe aus §5.6 zu verfälschen) und
 * `unlink` (um ein scheiterndes Aufräumen herzustellen — nur so ist prüfbar,
 * dass der Aufräumzweig den Fehler, den er bewahren soll, nicht ersetzt).
 * Alles andere ist echt. Der Grund gegen den naheliegenden Weg
 * „Elternverzeichnis auf 0o500 chmod'en": als root — CI, Container — ignoriert
 * der Kernel die Modusbits und der Schreibvorgang gelingt; die Zusage hier ist
 * die ABBILDUNG errno → Fehlertyp, nicht die Durchsetzung durch das Betriebssystem.
 * Deshalb prüfen die Aufräum-Zusicherungen mit dem UNGEMOCKTEN `node:fs`, damit
 * kein Test durch seinen eigenen Mock hindurchliest.
 *
 * ANNAHME, die diese Suite bewusst NICHT herstellt: die Modus-Zusicherungen
 * (0o640/0o750) gelten nur unter einer umask ≤ 0o027 — `open`/`mkdir` maskieren
 * ihren `mode` mit ihr, `chmod` täte das nicht. Sie werden hier nicht per
 * `process.umask()` erzwungen: das ist prozessweit, ein Worker fährt mehrere
 * Dateien nacheinander, und ein Wurf zwischen Setzen und Zurücksetzen leckte in
 * fremde Suiten. Die exakten Modus-Erwartungen sind damit die Reissleine: eine
 * strengere umask färbt die CI rot, statt in Produktion still fail-closed zu
 * werden (§6.5, offen als §13.3 Frage 16).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { isAbsolute, join } from "node:path";

const fsSteuerung = vi.hoisted(() => ({
  fehlerCode: undefined as string | undefined,
  syncAufrufe: 0,
  schliessAufrufe: 0,
  /** Gesetzt: `readFile` liefert das statt der Bytes auf der Platte (§5.6). */
  falscherLeseInhalt: undefined as string | undefined,
  /** Gesetzt: jedes `unlink` scheitert mit diesem errno — der Betriebsfall „nur lesbar
   * eingehängte Ablage", in dem ein Aufräumversuch selbst wirft. */
  unlinkFehlerCode: undefined as string | undefined,
}));

vi.mock("node:fs/promises", async (importOriginal) => {
  const echt = await importOriginal<typeof import("node:fs/promises")>();
  // Im Factory-Rumpf und nicht auf Modulebene: die Factory läuft VOR den
  // Modul-Konstanten dieser Datei, ein `const` von dort wäre in der TDZ.
  const errnoNummern: Record<string, number> = {
    ENOSPC: -28,
    EACCES: -13,
    EPERM: -1,
    EROFS: -30,
    EIO: -5,
  };
  const simuliert = (code: string): NodeJS.ErrnoException => {
    const fehler = new Error(`simuliert: ${code}`) as NodeJS.ErrnoException;
    fehler.code = code;
    // `errno` gehört dazu, damit die Zusicherung „kein Rohfehler wird durchgereicht"
    // unten überhaupt etwas zu greifen hat: ohne sie wäre sie auch für den unverändert
    // weitergegebenen Fehler grün.
    fehler.errno = errnoNummern[code] ?? -1;
    return fehler;
  };
  return {
    ...echt,
    unlink: async (...args: Parameters<typeof echt.unlink>) => {
      if (fsSteuerung.unlinkFehlerCode) throw simuliert(fsSteuerung.unlinkFehlerCode);
      return echt.unlink(...args);
    },
    readFile: async (...args: Parameters<typeof echt.readFile>) => {
      if (fsSteuerung.falscherLeseInhalt !== undefined) return fsSteuerung.falscherLeseInhalt;
      return echt.readFile(...args);
    },
    open: async (...args: Parameters<typeof echt.open>) => {
      const griff = await echt.open(...args);
      // Ein Proxy statt eines Objektliterals: FileHandle-Methoden liegen auf dem
      // Prototyp und brauchen den echten Empfänger (interne Slots), sonst wirft
      // schon `close()`. Unbekannte Methoden reichen damit automatisch durch.
      return new Proxy(griff, {
        get(ziel, eigenschaft) {
          if (eigenschaft === "write") {
            return async (...w: unknown[]) => {
              if (fsSteuerung.fehlerCode) {
                throw simuliert(fsSteuerung.fehlerCode);
              }
              return (ziel.write as unknown as (...a: unknown[]) => unknown)(...w);
            };
          }
          if (eigenschaft === "sync") {
            return async () => {
              fsSteuerung.syncAufrufe += 1;
              return ziel.sync();
            };
          }
          if (eigenschaft === "close") {
            return async () => {
              fsSteuerung.schliessAufrufe += 1;
              return ziel.close();
            };
          }
          const wert = Reflect.get(ziel, eigenschaft, ziel);
          return typeof wert === "function" ? (wert as () => unknown).bind(ziel) : wert;
        },
      });
    },
  };
});

import {
  AblageNichtSchreibbar,
  BlobFehlt,
  GroesseUeberschritten,
  KeinPlatz,
  abschliesse,
  fortschritt,
  groesse,
  kopfBytes,
  lieseStrom,
  loesche,
  pruefeAblage,
  scanPfad,
  schreibeStrom,
  type BlobZiel,
} from "./storage";

/** 10 Zeichen aus dem nanoid-`urlAlphabet`, wie sie die DB liefert. */
const SHARE = "aB3_x-9Qw1";
const DATEI = "Zk8-mN2_p7";
const INBOX = "q1W2e3R4t5";

const shareZiel: BlobZiel = { art: "share", shareId: SHARE, fileId: DATEI };
const inboxZiel: BlobZiel = { art: "inbox", inboxFileId: INBOX };

let wurzel: string;
let datenVorher: string | undefined;

const pfad = (...teile: string[]) => join(wurzel, "files", ...teile);
// Erst in `beforeEach` belegt: `wurzel` entsteht je Test neu.
let zielPfad: string;
let teilPfad: string;

async function* quelle(...teile: string[]): AsyncIterable<Uint8Array> {
  for (const teil of teile) yield Buffer.from(teil, "utf8");
}

async function lese(strom: AsyncIterable<Uint8Array>): Promise<string> {
  const stuecke: Buffer[] = [];
  for await (const stueck of strom) stuecke.push(Buffer.from(stueck));
  return Buffer.concat(stuecke).toString("utf8");
}

beforeEach(() => {
  datenVorher = process.env.DATA_DIR;
  wurzel = mkdtempSync(join(tmpdir(), "files-ablage-"));
  process.env.DATA_DIR = wurzel;
  zielPfad = pfad(SHARE, DATEI);
  teilPfad = `${zielPfad}.part`;
  fsSteuerung.fehlerCode = undefined;
  fsSteuerung.syncAufrufe = 0;
  fsSteuerung.schliessAufrufe = 0;
  fsSteuerung.falscherLeseInhalt = undefined;
  fsSteuerung.unlinkFehlerCode = undefined;
});

afterEach(() => {
  if (datenVorher === undefined) delete process.env.DATA_DIR;
  else process.env.DATA_DIR = datenVorher;
  rmSync(wurzel, { recursive: true, force: true });
  vi.restoreAllMocks();
});

describe("Pfadschema — ein Pfad entsteht nur aus DB-IDs", () => {
  const boese = [
    ["Punkt-Punkt", ".."],
    ["zwei Ebenen", "../.."],
    ["Trenner", "a/b"],
    ["Rückwärts-Trenner", "a\\b"],
    ["leer", ""],
    ["elf Zeichen", "abcdefghijk"],
    // Zehn Zeichen: es ist das NUL, das abgewiesen wird, nicht die Laenge.
    ["NUL-Byte", "abcde\u0000fghi"],
    ["absolut", "/etc/passwd"],
    ["Punkt-Segment", "aB3_x-9Qw."],
  ] as const;

  for (const [name, id] of boese) {
    it(`wirft für eine shareId (${name})`, () => {
      expect(() => scanPfad({ art: "share", shareId: id, fileId: DATEI })).toThrow();
    });

    it(`wirft für eine fileId (${name})`, () => {
      expect(() => scanPfad({ art: "share", shareId: SHARE, fileId: id })).toThrow();
    });

    it(`wirft für eine inboxFileId (${name})`, () => {
      expect(() => scanPfad({ art: "inbox", inboxFileId: id })).toThrow();
    });
  }

  // Zwei böse IDs, und die zweite ist die eigentliche Wache: `".."` allein kann die
  // Reihenfolge nicht bewachen, weil `join(wurzel,"files","..",fileId)` zu
  // `wurzel/fileId` normalisiert — dessen `dirname` IST `wurzel`, ein `mkdir` daraus
  // wäre ein No-op auf einem längst bestehenden Verzeichnis und bliebe unsichtbar.
  // `"a/b"` steigt dagegen ab: ein Dateizugriff vor der Prüfung legte `files/a/b` an.
  const schlechteZiele: ReadonlyArray<readonly [string, BlobZiel]> = [
    ["normalisierend (..)", { art: "share", shareId: "..", fileId: DATEI }],
    ["absteigend (a/b)", { art: "share", shareId: "a/b", fileId: DATEI }],
  ];

  for (const [name, schlecht] of schlechteZiele) {
    it(`prüft auch auf den asynchronen Wegen, und zwar VOR jedem Dateizugriff — ${name}`, async () => {
      await expect(groesse(schlecht)).rejects.toThrow();
      await expect(lieseStrom(schlecht)).rejects.toThrow();
      await expect(loesche(schlecht)).rejects.toThrow();
      await expect(fortschritt(schlecht)).rejects.toThrow();
      await expect(abschliesse(schlecht)).rejects.toThrow();
      await expect(kopfBytes(schlecht, 8)).rejects.toThrow();
      await expect(schreibeStrom(schlecht, quelle("x"), { maxBytes: 100 })).rejects.toThrow();
      // Ein abgewiesenes Ziel legt nichts an — sonst wäre die Prüfung eine Notiz,
      // keine Naht. Nur `schreibeStrom` legt überhaupt Verzeichnisse an; die sechs
      // Leseoperationen darüber können diese Zusage nicht tragen.
      expect(existsSync(join(wurzel, "files"))).toBe(false);
    });
  }

  it("bildet die zwei Namensräume beweisbar disjunkt ab", () => {
    expect(scanPfad(shareZiel)).toBe(zielPfad);
    expect(scanPfad(inboxZiel)).toBe(pfad("inbox", INBOX));
    // `inbox` hat fünf Zeichen, eine shareId immer zehn: ein Share-Verzeichnis
    // kann `inbox` nie heissen.
    expect("inbox".length).toBe(5);
    expect(SHARE.length).toBe(10);
    expect(() => scanPfad({ art: "share", shareId: "inbox", fileId: DATEI })).toThrow();
  });
});

describe("schreibeStrom — Zwischendatei, fsync, gemessene Bytes", () => {
  it("liefert die gemessene Bytezahl und legt das Elternverzeichnis an", async () => {
    const { bytes } = await schreibeStrom(shareZiel, quelle("Hallo", " Welt"), {
      maxBytes: 1024,
    });

    expect(bytes).toBe(10);
    expect(existsSync(pfad(SHARE))).toBe(true);
    expect(readFileSync(teilPfad, "utf8")).toBe("Hallo Welt");
    // Das Ziel entsteht erst mit `abschliesse` — dazwischen liegt die
    // Magic-Byte-Prüfung des letzten Chunks (T27 Punkt 5/6).
    expect(existsSync(zielPfad)).toBe(false);
  });

  it("ruft fsync, bevor die Zwischendatei liegen bleibt", async () => {
    await schreibeStrom(shareZiel, quelle("x"), { maxBytes: 1024 });
    expect(fsSteuerung.syncAufrufe).toBeGreaterThan(0);
  });

  it("setzt Datei- und Verzeichnismodus explizit (§6.5: clamd liest per Pfad)", async () => {
    await schreibeStrom(shareZiel, quelle("x"), { maxBytes: 1024 });

    expect(statSync(teilPfad).mode & 0o777).toBe(0o640);
    expect(statSync(pfad(SHARE)).mode & 0o777).toBe(0o750);
    expect(statSync(join(wurzel, "files")).mode & 0o777).toBe(0o750);

    await abschliesse(shareZiel);
    expect(statSync(zielPfad).mode & 0o777).toBe(0o640);
  });

  it("benennt mit abschliesse atomar um: Ziel da, Zwischendatei weg", async () => {
    await schreibeStrom(shareZiel, quelle("abc"), { maxBytes: 1024 });
    const { bytes } = await abschliesse(shareZiel);

    expect(bytes).toBe(3);
    expect(readFileSync(zielPfad, "utf8")).toBe("abc");
    expect(existsSync(teilPfad)).toBe(false);
  });

  it("wirft BlobFehlt, wenn abschliesse keine Zwischendatei findet", async () => {
    await expect(abschliesse(shareZiel)).rejects.toBeInstanceOf(BlobFehlt);
  });
});

describe("maxBytes wird beim Zählen durchgesetzt", () => {
  it("bricht bei Überschreitung ab und lässt weder Ziel noch Zwischendatei zurück", async () => {
    await expect(
      schreibeStrom(shareZiel, quelle("12345", "67890"), { maxBytes: 8 }),
    ).rejects.toBeInstanceOf(GroesseUeberschritten);

    expect(existsSync(zielPfad)).toBe(false);
    expect(existsSync(teilPfad)).toBe(false);
  });

  it("zählt beim Anhängen die BEREITS liegenden Bytes mit", async () => {
    await schreibeStrom(shareZiel, quelle("12345"), { maxBytes: 8, anhaengen: true });

    // Viele kleine Chunks dürfen die Grenze nicht unterlaufen: 5 + 5 > 8.
    await expect(
      schreibeStrom(shareZiel, quelle("67890"), { maxBytes: 8, anhaengen: true }),
    ).rejects.toBeInstanceOf(GroesseUeberschritten);

    expect(existsSync(teilPfad)).toBe(false);
    expect(existsSync(zielPfad)).toBe(false);
  });

  it("lässt die Grenze selbst zu (≤, nicht <)", async () => {
    const { bytes } = await schreibeStrom(shareZiel, quelle("12345678"), { maxBytes: 8 });
    expect(bytes).toBe(8);
  });
});

describe("lieseStrom und groesse — Fehlendes ist BlobFehlt, nicht ENOENT", () => {
  it("wirft BlobFehlt statt eines durchgereichten ENOENT", async () => {
    await expect(lieseStrom(shareZiel)).rejects.toBeInstanceOf(BlobFehlt);
    await expect(groesse(shareZiel)).rejects.toBeInstanceOf(BlobFehlt);
    await expect(groesse(inboxZiel)).rejects.toBeInstanceOf(BlobFehlt);
  });

  it("liefert Strom und Bytezahl der fertigen Datei", async () => {
    await schreibeStrom(shareZiel, quelle("Hallo Welt"), { maxBytes: 1024 });
    await abschliesse(shareZiel);

    expect(await groesse(shareZiel)).toBe(10);
    const { strom, bytes } = await lieseStrom(shareZiel);
    expect(bytes).toBe(10);
    expect(await lese(strom)).toBe("Hallo Welt");
  });

  it("sieht die Zwischendatei NICHT als Blob an", async () => {
    await schreibeStrom(shareZiel, quelle("halb"), { maxBytes: 1024 });
    await expect(groesse(shareZiel)).rejects.toBeInstanceOf(BlobFehlt);
    // Beide Wege, nicht nur `groesse` (Testpunkt 4 nennt beide): „halber Upload liegt,
    // Ziel fehlt" IST der Regelzustand des chunked Wegs, und `lieseStrom` liest sein
    // `bytes` aus einem eigenen `stat`. Ein Rückfall auf die `.part` lieferte einen
    // Download halber Bytes mit 200.
    await expect(lieseStrom(shareZiel)).rejects.toBeInstanceOf(BlobFehlt);
  });
});

describe("loesche — still, idempotent, und die Zwischendatei mit", () => {
  it("ist auf Fehlendes still", async () => {
    await expect(loesche(shareZiel)).resolves.toBeUndefined();
    await expect(loesche(inboxZiel)).resolves.toBeUndefined();
  });

  it("räumt eine liegen gebliebene Zwischendatei mit", async () => {
    await schreibeStrom(shareZiel, quelle("halb"), { maxBytes: 1024 });
    expect(existsSync(teilPfad)).toBe(true);

    await loesche(shareZiel);
    expect(existsSync(teilPfad)).toBe(false);
  });

  // Still ist `loesche` nur bei ENOENT. Ein EACCES/EROFS ist ein Konfigurationsfehler und
  // muss den Aufrufer erreichen (§5.4 → 500, laut) — sonst quittiert das Abbrechen in T31
  // einen Erfolg, während der Blob liegen bleibt. Seit `schreibeStrom` seinen Aufräumzweig
  // mit `unlink().catch()` schreibt, ist dies die EINZIGE Stelle, die den nicht-stillen
  // Zweig von `entferneStill` noch bewacht: ohne sie bliebe ein „schluck einfach alles"
  // unbemerkt.
  it("ist NICHT still, wenn das Löschen an den Rechten scheitert", async () => {
    const laut = vi.spyOn(console, "error").mockImplementation(() => {});
    fsSteuerung.unlinkFehlerCode = "EACCES";

    await expect(loesche(shareZiel)).rejects.toBeInstanceOf(AblageNichtSchreibbar);
    expect(laut).toHaveBeenCalled();
  });

  it("löscht das Ziel und ist beim zweiten Aufruf weiter still", async () => {
    await schreibeStrom(shareZiel, quelle("ganz"), { maxBytes: 1024 });
    await abschliesse(shareZiel);

    await loesche(shareZiel);
    expect(existsSync(zielPfad)).toBe(false);
    await expect(loesche(shareZiel)).resolves.toBeUndefined();
  });
});

describe("der chunked Weg — drei Zusagen aus §5.3", () => {
  it("findet die Zwischendatei in der nächsten Anfrage und hängt an", async () => {
    const erst = await schreibeStrom(shareZiel, quelle("AAAA"), {
      maxBytes: 1024,
      anhaengen: true,
    });
    const zweit = await schreibeStrom(shareZiel, quelle("BBB"), {
      maxBytes: 1024,
      anhaengen: true,
    });

    expect(erst.bytes).toBe(4);
    expect(zweit.bytes).toBe(7);
    expect(readFileSync(teilPfad, "utf8")).toBe("AAAABBB");

    await abschliesse(shareZiel);
    expect(readFileSync(zielPfad, "utf8")).toBe("AAAABBB");
  });

  it("meldet den Fortschritt als Länge der Zwischendatei", async () => {
    expect(await fortschritt(shareZiel)).toBe(0);

    await schreibeStrom(shareZiel, quelle("AAAA"), { maxBytes: 1024, anhaengen: true });
    expect(await fortschritt(shareZiel)).toBe(4);
    expect(await fortschritt(shareZiel)).toBe(statSync(teilPfad).size);

    await schreibeStrom(shareZiel, quelle("BBB"), { maxBytes: 1024, anhaengen: true });
    expect(await fortschritt(shareZiel)).toBe(7);

    // Nach dem Umbenennen ist kein Fortschritt mehr offen.
    await abschliesse(shareZiel);
    expect(await fortschritt(shareZiel)).toBe(0);
  });

  it("gibt einem zweiten Starter EEXIST statt verschränkter Bytes", async () => {
    await schreibeStrom(shareZiel, quelle("AAAA"), { maxBytes: 1024, anhaengen: true });

    let fehler: NodeJS.ErrnoException | undefined;
    try {
      await schreibeStrom(shareZiel, quelle("BBB"), { maxBytes: 1024, anhaengen: false });
    } catch (e: unknown) {
      fehler = e as NodeJS.ErrnoException;
    }

    expect(fehler?.code).toBe("EEXIST");
    // Und die Bytes des ersten Schreibers stehen unversehrt da.
    expect(readFileSync(teilPfad, "utf8")).toBe("AAAA");
  });
});

describe("kopfBytes — die Magic-Byte-Prüfung liest VOR dem Umbenennen", () => {
  it("liefert den Kopf der Zwischendatei", async () => {
    await schreibeStrom(shareZiel, quelle("%PDF-1.7 Rest"), {
      maxBytes: 1024,
      anhaengen: true,
    });

    const kopf = await kopfBytes(shareZiel, 5);
    expect(Buffer.from(kopf).toString("utf8")).toBe("%PDF-");
  });

  it("liefert höchstens so viele Bytes, wie da sind", async () => {
    await schreibeStrom(shareZiel, quelle("ab"), { maxBytes: 1024, anhaengen: true });
    expect((await kopfBytes(shareZiel, 512)).length).toBe(2);
  });

  it("wirft BlobFehlt ohne Zwischendatei", async () => {
    await expect(kopfBytes(shareZiel, 8)).rejects.toBeInstanceOf(BlobFehlt);
  });
});

describe("die zwei Fehlerklassen aus §5.4 sind eigene Typen", () => {
  it("bildet ENOSPC auf KeinPlatz ab und räumt die Zwischendatei weg", async () => {
    fsSteuerung.fehlerCode = "ENOSPC";

    const fehler = await schreibeStrom(shareZiel, quelle("viel"), { maxBytes: 1024 }).catch(
      (e: unknown) => e,
    );

    expect(fehler).toBeInstanceOf(KeinPlatz);
    // Der Rohfehler des Mocks TRÄGT ein `errno` — die Zeile belegt damit, dass er
    // nicht durchgereicht, sondern übersetzt wurde (der Grund liegt in `cause`).
    expect(fehler).not.toHaveProperty("errno");
    // Ungemockt gelesen: sonst prüfte der Test durch seinen eigenen Mock.
    expect(existsSync(teilPfad)).toBe(false);
    expect(existsSync(zielPfad)).toBe(false);
  });

  // Alle drei Codes, nicht nur EACCES: ein nur lesbar eingehängtes Volume meldet
  // EROFS, und genau dieser Betriebsfall ist laut §5.6 der Zweck von `pruefeAblage`.
  // Mit nur einem Code fiele ein Streichen der beiden anderen keinem Test auf.
  for (const code of ["EACCES", "EPERM", "EROFS"] as const) {
    it(`bildet ${code} auf AblageNichtSchreibbar ab und loggt laut`, async () => {
      const laut = vi.spyOn(console, "error").mockImplementation(() => {});
      fsSteuerung.fehlerCode = code;

      await expect(
        schreibeStrom(shareZiel, quelle("viel"), { maxBytes: 1024 }),
      ).rejects.toBeInstanceOf(AblageNichtSchreibbar);

      expect(laut).toHaveBeenCalled();
      expect(String(laut.mock.calls[0]?.[0])).toContain("[files]");
      expect(String(laut.mock.calls[0]?.[0])).toContain(code);
    });
  }

  it("bildet nicht jeden errno auf eine der beiden Klassen ab", async () => {
    fsSteuerung.fehlerCode = "EIO";

    const fehler = await schreibeStrom(shareZiel, quelle("viel"), { maxBytes: 1024 }).catch(
      (e: unknown) => e,
    );

    expect(fehler).not.toBeInstanceOf(KeinPlatz);
    expect(fehler).not.toBeInstanceOf(AblageNichtSchreibbar);
  });
});

describe("aufgeräumt wird NUR bei den zwei benannten Fällen (§5.3/§5.4)", () => {
  // Die Gegenrichtung der ENOSPC-Zusage, und sie trägt mehr als eine Symmetrie: beim
  // chunked Weg IST die Zwischendatei der Fortschritt (§5.3), und ein Verbindungsabbruch
  // oder ein EIO mitten in Chunk 7 darf ihn nicht kosten — sonst beginnt die Wiederaufnahme
  // in T27 bei 0 statt bei `ab`. Ohne diese Zusicherung bliebe ein Aufräumen auf JEDEM
  // Fehlerweg unbemerkt: die EIO-Tests darüber prüfen nur Fehlertyp und `close`.
  it("lässt die Zwischendatei bei einem NICHT benannten Fehler stehen", async () => {
    await schreibeStrom(shareZiel, quelle("AAAA"), { maxBytes: 1024, anhaengen: true });

    fsSteuerung.fehlerCode = "EIO";
    await expect(
      schreibeStrom(shareZiel, quelle("BBB"), { maxBytes: 1024, anhaengen: true }),
    ).rejects.toThrow();

    // Ungemockt gelesen, damit der Test nicht durch seinen eigenen Mock prüft.
    expect(existsSync(teilPfad)).toBe(true);
    expect(readFileSync(teilPfad, "utf8")).toBe("AAAA");
    // Und der Fortschritt, den T27 als `ab` zurückmeldet, ist unverändert.
    expect(await fortschritt(shareZiel)).toBe(4);
  });

  // Der Aufräumzweig darf den Fehler, den er bewahren soll, nicht ERSETZEN. `unlink`
  // scheitert auf einer nur lesbar eingehängten Ablage mit EACCES/EROFS — genau der
  // Betriebsfall, den §5.6 als Zweck von `pruefeAblage` nennt —, und ein Wurf aus dem
  // Aufräumen machte aus 413 (Nutzerfehler) still 500 samt lauter Logzeile. Ohne diese
  // Zusicherung fällt Testpunkt 9 auf genau dem Weg, für den er gebaut ist: T27 Punkt 4
  // (413 mit Grenze) und Punkt 10 (507) bekämen `AblageNichtSchreibbar`.
  // Dieselbe Naht ist im `finally` von `pruefeAblage` bereits benannt; dies ist die zweite Stelle.
  it("behält 413, wenn schon das Aufräumen scheitert — und schweigt dabei", async () => {
    const laut = vi.spyOn(console, "error").mockImplementation(() => {});
    fsSteuerung.unlinkFehlerCode = "EACCES";

    await expect(
      schreibeStrom(shareZiel, quelle("12345", "67890"), { maxBytes: 8 }),
    ).rejects.toBeInstanceOf(GroesseUeberschritten);

    // Kein Wort im Log: ein misslungenes Aufräumen ist Sache des Aufräum-Laufs (§7.6),
    // und eine überschrittene Grenze ist keine Betreibersache.
    expect(laut).not.toHaveBeenCalled();
    // Die Zwischendatei bleibt liegen — die ehrliche Folge des scheiternden `unlink`,
    // kein zweiter Aufräumweg.
    expect(existsSync(teilPfad)).toBe(true);
  });
});

describe("schreibeStrom schliesst den File-Descriptor auf JEDEM Ausgang (§5.3)", () => {
  // Der Preis eines Lecks ist nicht ein fehlgeschlagener Upload, sondern
  // FD-Erschöpfung unter chunked Last, also ein Prozessausfall.
  //
  // Die Wache tragen die Wege „Erfolg" und „EIO": dort ist das `close` im `finally`
  // das EINZIGE. Bei `GroesseUeberschritten` und `ENOSPC` schliesst der Aufräumzweig
  // ohnehin schon — die zwei Fälle dokumentieren die Zusage, bewachen sie aber nicht.
  it("schliesst nach erfolgreichem Schreiben", async () => {
    await schreibeStrom(shareZiel, quelle("x"), { maxBytes: 1024 });
    expect(fsSteuerung.schliessAufrufe).toBeGreaterThan(0);
  });

  it("schliesst, wenn EIO fliegt (kein Aufräumzweig, nur das finally)", async () => {
    fsSteuerung.fehlerCode = "EIO";
    await expect(schreibeStrom(shareZiel, quelle("x"), { maxBytes: 1024 })).rejects.toThrow();
    expect(fsSteuerung.schliessAufrufe).toBeGreaterThan(0);
  });

  it("schliesst, wenn die Grenze überschritten wird", async () => {
    await expect(
      schreibeStrom(shareZiel, quelle("12345", "67890"), { maxBytes: 8 }),
    ).rejects.toBeInstanceOf(GroesseUeberschritten);
    expect(fsSteuerung.schliessAufrufe).toBeGreaterThan(0);
  });

  it("schliesst, wenn ENOSPC fliegt", async () => {
    fsSteuerung.fehlerCode = "ENOSPC";
    await expect(
      schreibeStrom(shareZiel, quelle("viel"), { maxBytes: 1024 }),
    ).rejects.toBeInstanceOf(KeinPlatz);
    expect(fsSteuerung.schliessAufrufe).toBeGreaterThan(0);
  });
});

describe("pruefeAblage — die Boot-Probe (§5.6)", () => {
  it("legt die Wurzel an, schreibt, liest, löscht und lässt nichts liegen", async () => {
    await expect(pruefeAblage()).resolves.toBeUndefined();

    const ablage = join(wurzel, "files");
    expect(existsSync(ablage)).toBe(true);
    expect(statSync(ablage).mode & 0o777).toBe(0o750);
    // Keine Probedatei bleibt zurück — sonst zählt sie T46 als Rest mit.
  });

  it("hinterlässt kein Artefakt in der Ablage", async () => {
    await pruefeAblage();
    const { readdirSync } = await import("node:fs");
    expect(readdirSync(join(wurzel, "files"))).toEqual([]);
  });

  it("wirft AblageNichtSchreibbar, wenn die Ablage nicht beschreibbar ist", async () => {
    const laut = vi.spyOn(console, "error").mockImplementation(() => {});
    fsSteuerung.fehlerCode = "EACCES";

    await expect(pruefeAblage()).rejects.toBeInstanceOf(AblageNichtSchreibbar);
    expect(laut).toHaveBeenCalled();
  });

  it("liest die Probe zurück und wirft, wenn sie sich anders liest als geschrieben", async () => {
    // Der Fall, für den §5.6 die Rückleseprobe fordert: ein volles oder nur scheinbar
    // eingehängtes Volume, auf dem „open ging" und „write ging" noch nichts belegen.
    // Der verfälschte Rücklesewert trägt kein `code`, fällt also durch `uebersetze`
    // hindurch auf den lauten Sammelzweig — daher der Spy.
    const laut = vi.spyOn(console, "error").mockImplementation(() => {});
    fsSteuerung.falscherLeseInhalt = "etwas voellig anderes";

    await expect(pruefeAblage()).rejects.toBeInstanceOf(AblageNichtSchreibbar);
    expect(laut).toHaveBeenCalled();
  });
});

describe("der Pfad, der das Modul verlässt, ist absolut (§6.4/§6.5)", () => {
  it("macht auch ein relatives DATA_DIR absolut, weil clamd anderswo arbeitet", () => {
    // Ohne diese Zusage bekäme clamd per `zSCAN` einen relativen Pfad und fände im
    // Sidecar — anderes Arbeitsverzeichnis — nichts: fail-closed auf JEDER Datei.
    // `beforeEach` setzt DATA_DIR immer absolut, deshalb hier ausdrücklich relativ.
    process.env.DATA_DIR = "./.data";
    expect(isAbsolute(scanPfad(shareZiel))).toBe(true);
    expect(isAbsolute(scanPfad(inboxZiel))).toBe(true);
  });
});
