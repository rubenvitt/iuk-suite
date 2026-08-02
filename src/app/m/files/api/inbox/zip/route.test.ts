import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdirSync, rmSync, readFileSync } from "node:fs";
import { inflateRawSync } from "node:zlib";
import type { Readable } from "node:stream";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import Database from "better-sqlite3";

/*
 * WAS DIESE DATEI BESITZT (Spec §8.6, §7.7, Plan T49):
 *
 *  - dass der Endpunkt UEBERHAUPT existiert, bevor ein Knopf ihn ruft
 *    (Festlegung F in §1 des Plans: die Spec sagt die Mehrfachauswahl zu und
 *    fuehrt den Endpunkt in keiner ihrer beiden Tabellen),
 *  - die zwei Riegel eines Route Handlers, der kein Layout ueber sich hat:
 *    Rolle `verwaltung` und Zugang,
 *  - dass die AUSSCHLUSSREGEL dieselbe ist wie beim Share-ZIP — nicht
 *    nachgebaut, sondern aus `_lib/zip.ts` geholt,
 *  - dass eine unbekannte `id` in einer Mehrfachauswahl den Rest NICHT
 *    mitreisst,
 *  - dass hier NICHTS gezaehlt und NICHTS protokolliert wird: das Audit-Log
 *    gehoert den oeffentlichen Share-Wegen.
 *
 * Was sie NICHT besitzt: die Namens- und Entschaerfungsregeln selbst (das ist
 * `_lib/zip.test.ts`, T21) und den Knopf, der den Endpunkt ruft (T43).
 *
 * Gegen eine echte, migrierte Datei-DB und eine echte Ablage — nicht gegen ein
 * Mock: die Zeitstempelspalten fuehren SEKUNDEN (`mode: "timestamp"`), und der
 * Streamer oeffnet echte Descriptoren. Beides ist gegen ein Mock gruen, ohne zu
 * gelten.
 */

const DIR = "./.data/files-inboxzip-test";
const VERWALTUNG = "files.localtest.me";
const INBOX = "drop.localtest.me";
const GRUPPE = "drk-files-admin";

/** Feste Uhr: der Archivname traegt das Datum, und eine laufende Uhr flackerte. */
const JETZT = new Date("2026-08-01T10:00:00Z");

/**
 * `lieseStrom` wird UMHUELLT, nicht ersetzt: die Bytes kommen weiter vom echten
 * Dateisystem, aber der Test bekommt die Stroeme in die Hand, die der Handler
 * geoeffnet hat. Nur so ist „bei Abbruch keine offenen Descriptoren" eine
 * Messung und nicht eine Behauptung.
 *
 * `steuerung.stockend` schaltet auf einen Strom um, der ein paar Bytes liefert
 * und danach WEDER weitersendet NOCH endet. Das ist der einzige deterministische
 * Weg zur Abbruch-Zusage: mit echten Dateien ist das Archiv fertig, ehe der
 * Abbruch kommt (gemessen mit 4 MiB Zufallsbytes) — und dann sagen die richtige
 * und die kaputte Fassung beide „zerstoert", weil ein zu Ende gelesener Strom
 * sich selbst zerstoert. Ein Strom, der nie endet, kann nur durch den Abbruch
 * zerstoert werden.
 */
const { geoeffneteStroeme, steuerung } = vi.hoisted(() => ({
  geoeffneteStroeme: [] as Readable[],
  steuerung: { stockend: false },
}));

vi.mock("@/app/m/files/_lib/storage", async (echt) => {
  const modul = await echt<typeof import("@/app/m/files/_lib/storage")>();
  const { Readable: Strom } = await import("node:stream");
  return {
    ...modul,
    lieseStrom: async (ziel: Parameters<typeof modul.lieseStrom>[0]) => {
      if (steuerung.stockend) {
        let gesendet = false;
        const strom = new Strom({
          read() {
            // Genau einmal etwas, danach nichts mehr — kein `push(null)`, also
            // auch kein Ende. Kein Dauersenden, sonst waechst der Puffer des
            // Archivierers unbegrenzt.
            if (!gesendet) {
              gesendet = true;
              this.push(Buffer.alloc(64));
            }
          },
        });
        geoeffneteStroeme.push(strom);
        return { strom, bytes: 64 };
      }
      const ergebnis = await modul.lieseStrom(ziel);
      geoeffneteStroeme.push(ergebnis.strom);
      return ergebnis;
    },
  };
});

const { authMock } = vi.hoisted(() => ({ authMock: vi.fn() }));
vi.mock("@/core/auth", () => ({ auth: authMock }));

/*
 * `requireFilesAccess` schickt die ANONYME Anfrage in den Login, und das Ziel
 * baut es ueber `oeffentlicheUrl(…, await headers())`. Ausserhalb eines
 * Next-Request-Kontexts gibt es die Funktion nicht — sie wird deshalb umgehaengt
 * und liefert echte `Headers`, keinen Platzhalter: `resolveHost` liest daraus
 * den Port, und ein `undefined` waere ein TypeError statt einer Weiterleitung.
 */
vi.mock("next/headers", () => ({ headers: vi.fn() }));
import { headers } from "next/headers";

beforeEach(() => {
  rmSync(DIR, { recursive: true, force: true });
  mkdirSync(DIR, { recursive: true });
  process.env.DATA_DIR = DIR;
  const sqlite = new Database(`${DIR}/files.db`);
  migrate(drizzle(sqlite), { migrationsFolder: "src/app/m/files/_db/migrations" });
  sqlite.close();
  // `getModuleDb` haelt die Verbindung global fest und zeigte sonst auf die
  // geloeschte Datei weiter.
  delete (globalThis as { __suiteDb?: unknown }).__suiteDb;

  vi.stubEnv("SUITE_HOST_FILES", `${VERWALTUNG},${INBOX}`);
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.setSystemTime(JETZT);
  geoeffneteStroeme.length = 0;
  steuerung.stockend = false;
  authMock.mockReset();
  authMock.mockResolvedValue({ user: { id: "verwalter-1", groups: [GRUPPE] } });
  vi.mocked(headers).mockResolvedValue(new Headers({ host: `${VERWALTUNG}:3100` }));
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

// ---------------------------------------------------------------------------
// Vorrichtungen
// ---------------------------------------------------------------------------

type Vorgabe = {
  id: string;
  dateiname?: string;
  avStatus?: string;
  /** `false` = `bytes_vollstaendig_at IS NULL`, also Upload nicht abgeschlossen. */
  vollstaendig?: boolean;
  inhalt?: string | Buffer;
  /** `true` = Zeile ja, Blob nein (Waise, Analyse Falle 9). */
  ohneBlob?: boolean;
};

async function legeInboxDatei(vorgabe: Vorgabe): Promise<void> {
  const roh = vorgabe.inhalt ?? `Inhalt von ${vorgabe.id}`;
  const inhalt = Buffer.isBuffer(roh) ? roh : Buffer.from(roh, "utf8");
  const { getDb } = await import("@/app/m/files/_db/client");
  const { inboxFiles } = await import("@/app/m/files/_db/schema");
  getDb()
    .insert(inboxFiles)
    .values({
      id: vorgabe.id,
      tokenId: null,
      dateiname: vorgabe.dateiname ?? `${vorgabe.id}.txt`,
      kategorie: null,
      hinweis: null,
      mimeType: "text/plain",
      size: inhalt.byteLength,
      clientIpUnbestaetigt: null,
      empfangenAt: JETZT,
      bytesVollstaendigAt: (vorgabe.vollstaendig ?? true) ? JETZT : null,
      avStatus: vorgabe.avStatus ?? "clean",
      avGeprueftAt: null,
    })
    .run();

  if (vorgabe.ohneBlob) return;
  // Echte Bytes ueber die echte Ablage — der Streamer oeffnet sie spaeter.
  const { schreibeStrom, abschliesse } = await import("@/app/m/files/_lib/storage");
  const ziel = { art: "inbox", inboxFileId: vorgabe.id } as const;
  // `schreibeStrom` will ein ASYNCHRONES Iterable — ein Array laeuft zur
  // Laufzeit zwar durch `for await`, ist dem Typ nach aber keins.
  async function* stueck(): AsyncIterable<Uint8Array> {
    yield new Uint8Array(inhalt);
  }
  await schreibeStrom(ziel, stueck(), { maxBytes: 1024 * 1024 * 16 });
  await abschliesse(ziel);
}

async function ruf(
  frage: string,
  opts: { host?: string; signal?: AbortSignal } = {},
): Promise<Response> {
  const { GET } = await import("./route");
  return GET(
    new Request(`http://localhost:3000/m/files/api/inbox/zip${frage}`, {
      headers: { host: opts.host ?? `${VERWALTUNG}:3100` },
      signal: opts.signal,
    }),
  );
}

/**
 * Ein minimaler ZIP-Leser ueber das ZENTRALVERZEICHNIS — nicht ueber die
 * lokalen Koepfe: archiver streamt, setzt also Bit 3 und schreibt die Groessen
 * erst in den Datendeskriptor HINTER den Daten. Im Zentralverzeichnis stehen sie
 * richtig, und nur von dort ist der Inhalt sicher zu schneiden.
 */
function zipEintraege(daten: Buffer): { name: string; inhalt: string }[] {
  let eocd = -1;
  for (let i = daten.length - 22; i >= 0; i--) {
    if (daten.readUInt32LE(i) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  expect(eocd, "kein End-of-Central-Directory — das ist kein ZIP").toBeGreaterThanOrEqual(0);

  const anzahl = daten.readUInt16LE(eocd + 10);
  let p = daten.readUInt32LE(eocd + 16);
  const aus: { name: string; inhalt: string }[] = [];
  for (let n = 0; n < anzahl; n++) {
    const methode = daten.readUInt16LE(p + 10);
    const komprimiert = daten.readUInt32LE(p + 20);
    const namensLaenge = daten.readUInt16LE(p + 28);
    const extraLaenge = daten.readUInt16LE(p + 30);
    const kommentarLaenge = daten.readUInt16LE(p + 32);
    const versatz = daten.readUInt32LE(p + 42);
    const name = daten.subarray(p + 46, p + 46 + namensLaenge).toString("utf8");
    // Das lokale `extra` ist NICHT dasselbe wie das zentrale — es muss aus dem
    // lokalen Kopf gelesen werden, sonst schneidet der Versatz daneben.
    const start = versatz + 30 + daten.readUInt16LE(versatz + 26) + daten.readUInt16LE(versatz + 28);
    const roh = daten.subarray(start, start + komprimiert);
    aus.push({
      name,
      inhalt: (methode === 8 ? inflateRawSync(roh) : Buffer.from(roh)).toString("utf8"),
    });
    p += 46 + namensLaenge + extraLaenge + kommentarLaenge;
  }
  return aus;
}

async function archiv(res: Response): Promise<{ name: string; inhalt: string }[]> {
  expect(res.status).toBe(200);
  expect(res.headers.get("Content-Type")).toBe("application/zip");
  return zipEintraege(Buffer.from(await res.arrayBuffer()));
}

/** Kurz gepollt statt fest gewartet: eine feste Frist waere entweder zu kurz
 *  (Flackern) oder so lang, dass sie die Aussage selbst erledigt. */
async function warteBis(bedingung: () => boolean, fristMs = 2000): Promise<void> {
  const ende = Date.now() + fristMs;
  while (!bedingung() && Date.now() < ende) {
    await new Promise((f) => setTimeout(f, 2));
  }
  expect(bedingung(), "Bedingung wurde innerhalb der Frist nicht wahr").toBe(true);
}

function namen(eintraege: { name: string }[]): string[] {
  return eintraege.map((e) => e.name);
}

/**
 * Liest den Antwortkoerper leer und kehrt zurueck, sobald er ENDET — ob mit
 * Fehler oder mit `done`, ist gleichgueltig. Getestet wird, DASS er endet: ein
 * Empfaenger, dessen Verbindung abgebrochen ist, darf nicht auf einen Koerper
 * warten, den niemand mehr fuellt.
 */
async function erwarteRumpfEnde(res: Response): Promise<void> {
  const leser = res.body!.getReader();
  try {
    for (;;) {
      const { done } = await leser.read();
      if (done) return;
    }
  } catch {
    return;
  }
}

/**
 * `notFound()` und `redirect()` WERFEN. Next uebersetzt genau diese Digests in
 * eine 404- bzw. 307-Antwort (`route-modules/app-route/module.js:475`) — der
 * Digest ist deshalb die ehrliche Zusicherung, und nicht ein selbstgebauter
 * Marker aus einem `next/navigation`-Mock. Wortgleich zu T32
 * (`api/inbox/[id]/route.test.ts:160`), weil beide Handler denselben Riegel
 * rufen und dieselbe Antwortform schulden.
 */
async function erwarteNextNotFound(aufruf: Promise<unknown>): Promise<void> {
  await expect(aufruf).rejects.toMatchObject({ digest: "NEXT_HTTP_ERROR_FALLBACK;404" });
}

async function erwarteAnmeldung(aufruf: Promise<unknown>): Promise<void> {
  // Nur der Praefix wird festgehalten: die vollstaendige Digest-Zeichenkette
  // traegt Next-interne Felder, die eine Version spaeter anders lauten duerfen.
  await expect(aufruf).rejects.toMatchObject({
    digest: expect.stringContaining("NEXT_REDIRECT"),
  });
  await expect(aufruf).rejects.toMatchObject({
    digest: expect.stringContaining("/login"),
  });
}

function hinweis(eintraege: { name: string; inhalt: string }[]): string {
  const treffer = eintraege.find((e) => e.name === "_HINWEIS.txt");
  expect(treffer, "keine _HINWEIS.txt im Archiv").toBeDefined();
  return treffer!.inhalt;
}

// ---------------------------------------------------------------------------

describe("GET /api/inbox/zip — die zwei Riegel eines Handlers ohne Layout", () => {
  it("ohne Zugang: 404, und kein einziges Byte wird geoeffnet", async () => {
    await legeInboxDatei({ id: "in00000001" });
    authMock.mockResolvedValue({ user: { id: "fremd-1", groups: ["andere-gruppe"] } });

    await erwarteNextNotFound(ruf("?ids=in00000001"));

    expect(geoeffneteStroeme).toHaveLength(0);
  });

  it("ohne Sitzung: die Anmeldung — dieselbe Antwortform wie T32, nicht eine nackte 404", async () => {
    /*
     * Der Riegel ist DERSELBE wie in `api/inbox/[id]` (T32) und auf jeder
     * Verwaltungsseite: `requireFilesAccess`. Ein eigener 404-Zweig waere hier
     * eine zweite Antwortform fuer dieselbe Frage — und die Person, deren
     * Sitzung waehrend der Arbeit ablief, saehe auf dem Mehrfach-Download
     * „Not found" statt einer Anmeldung. Die 307 traegt kein
     * `Content-Disposition`; der Browser folgt ihr und zeigt den Login.
     */
    await legeInboxDatei({ id: "in00000001" });
    authMock.mockResolvedValue(null);

    await erwarteAnmeldung(ruf("?ids=in00000001"));

    expect(geoeffneteStroeme).toHaveLength(0);
  });

  it("auf dem INBOX-Host: 404 — der Endpunkt gehoert der Rolle verwaltung", async () => {
    await legeInboxDatei({ id: "in00000001" });

    const res = await ruf("?ids=in00000001", { host: `${INBOX}:3100` });

    expect(res.status).toBe(404);
    // Die Rollensperre ist die ERSTE Anweisung: sie fragt die Sitzung gar nicht.
    expect(authMock).not.toHaveBeenCalled();
    // Jede Textantwort dieses Handlers traegt dieselben Kopfzeilen: der Rumpf
    // wird nicht geraten, und er gehoert in keinen geteilten Zwischenspeicher.
    expect(res.headers.get("Content-Type")).toContain("text/plain");
    expect(res.headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(res.headers.get("Cache-Control")).toBe("private, no-store");
  });
});

describe("GET /api/inbox/zip — die Auswahl wird ein Archiv", () => {
  it("drei clean-Zeilen ergeben drei Eintraege, gleichnamige mit Zaehlsuffix", async () => {
    await legeInboxDatei({ id: "in00000001", dateiname: "bericht.pdf", inhalt: "eins" });
    await legeInboxDatei({ id: "in00000002", dateiname: "bericht.pdf", inhalt: "zwei" });
    await legeInboxDatei({ id: "in00000003", dateiname: "lage.txt", inhalt: "drei" });

    const eintraege = await archiv(await ruf("?ids=in00000001,in00000002,in00000003"));

    expect(namen(eintraege).sort()).toEqual(["bericht-1.pdf", "bericht.pdf", "lage.txt"]);
    // Der Zaehlsuffix darf die BYTES nicht vertauschen.
    expect(eintraege.find((e) => e.name === "lage.txt")!.inhalt).toBe("drei");
    expect(new Set(eintraege.map((e) => e.inhalt))).toEqual(new Set(["eins", "zwei", "drei"]));
    // Nichts fehlt, also gibt es keine Fehlliste.
    expect(namen(eintraege)).not.toContain("_HINWEIS.txt");
  });

  it("Pfadtrenner im Anzeigenamen werden entschaerft — der Eintragsname landet auf einer Platte", async () => {
    await legeInboxDatei({ id: "in00000001", dateiname: "../../etc/passwd" });

    const eintraege = await archiv(await ruf("?ids=in00000001"));

    expect(namen(eintraege)).toEqual([".._.._etc_passwd"]);
  });
});

describe("GET /api/inbox/zip — dieselbe Ausschlussregel wie der Share-ZIP", () => {
  it("nicht freigegebene und unvollstaendige Zeilen fehlen und stehen mit GRUND in _HINWEIS.txt", async () => {
    await legeInboxDatei({ id: "in00000001", dateiname: "gut.txt" });
    await legeInboxDatei({ id: "in00000002", dateiname: "geprueft.txt", avStatus: "scanning" });
    await legeInboxDatei({ id: "in00000003", dateiname: "fund.txt", avStatus: "infected" });
    await legeInboxDatei({ id: "in00000004", dateiname: "kaputt.txt", avStatus: "error" });
    await legeInboxDatei({ id: "in00000005", dateiname: "alt.txt", avStatus: "unscanned" });
    await legeInboxDatei({ id: "in00000006", dateiname: "halb.txt", vollstaendig: false });

    const eintraege = await archiv(
      await ruf(
        "?ids=in00000001,in00000002,in00000003,in00000004,in00000005,in00000006",
      ),
    );

    expect(namen(eintraege).sort()).toEqual(["_HINWEIS.txt", "gut.txt"]);
    const text = hinweis(eintraege);
    expect(text).toContain("geprueft.txt — Die Virenprüfung läuft noch");
    expect(text).toContain("fund.txt — Die Virenprüfung hat einen Fund gemeldet");
    expect(text).toContain("kaputt.txt — Die Virenprüfung war nicht möglich");
    expect(text).toContain("alt.txt — Nicht virengeprüft");
    expect(text).toContain("halb.txt — Die Übertragung wurde nicht abgeschlossen");
    // Die ausgelieferte Datei steht NICHT in der Fehlliste.
    expect(text).not.toContain("gut.txt");
  });

  it("eine unvollstaendige Zeile nennt die fehlenden BYTES, nicht die laufende Pruefung", async () => {
    // Eine laufende Uebertragung ist immer gleichzeitig `scanning` UND
    // `bytes_vollstaendig_at IS NULL`. Gewaenne der AV-Grund, erfuehre niemand,
    // dass die Bytes fehlen.
    await legeInboxDatei({ id: "in00000001", dateiname: "gut.txt" });
    await legeInboxDatei({
      id: "in00000002",
      dateiname: "laeuft.txt",
      avStatus: "scanning",
      vollstaendig: false,
    });

    const text = hinweis(await archiv(await ruf("?ids=in00000001,in00000002")));

    expect(text).toContain("laeuft.txt — Die Übertragung wurde nicht abgeschlossen");
    expect(text).not.toContain("laeuft.txt — Die Virenprüfung läuft noch");
  });

  it("alle ausgeschlossen: benannter Zustand statt eines leeren Archivs", async () => {
    await legeInboxDatei({ id: "in00000001", dateiname: "a.txt", avStatus: "scanning" });
    await legeInboxDatei({ id: "in00000002", dateiname: "b.txt", avStatus: "infected" });

    const res = await ruf("?ids=in00000001,in00000002");

    expect(res.status).toBe(403);
    expect(res.headers.get("Content-Type")).not.toBe("application/zip");
    // Der Rumpf listet Dateinamen eines gegateten Postfachs — dieselben
    // Kopfzeilen wie auf der 200 derselben Datei (T32 `text()`, T34 `meldung()`).
    expect(res.headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(res.headers.get("Cache-Control")).toBe("private, no-store");
    const text = await res.text();
    expect(text).toContain("Keine der Dateien ist zum Herunterladen freigegeben.");
    // Der Grund je Zeile geht auch hier nicht verloren.
    expect(text).toContain("a.txt");
    expect(text).toContain("b.txt");
  });

  it("eine Zeile ohne Blob reisst das Archiv nicht auf — sie wird mit ihrem NAMEN benannt", async () => {
    // Der Anzeigename liegt in derselben Abfrage, und ausgewaehlt wurde die
    // Zeile in der Liste nach ihm (T43). Eine nanoid in der `_HINWEIS.txt` waere
    // fuer den Leser eine Nachschlageaufgabe — dieselbe Begruendung wie T34
    // (`download/[id]/zip/route.ts:186-189`) fuer dieselbe Bedingung.
    await legeInboxDatei({ id: "in00000001", dateiname: "gut.txt" });
    await legeInboxDatei({ id: "in00000002", dateiname: "waise.txt", ohneBlob: true });

    const eintraege = await archiv(await ruf("?ids=in00000001,in00000002"));

    expect(namen(eintraege).sort()).toEqual(["_HINWEIS.txt", "gut.txt"]);
    expect(hinweis(eintraege)).toContain("waise.txt — Nicht gefunden");
    expect(hinweis(eintraege)).not.toContain("in00000002");
  });
});

describe("GET /api/inbox/zip — die Auswahl selbst", () => {
  it("eine unbekannte id wird uebergangen und benannt, der Rest wird ausgeliefert", async () => {
    await legeInboxDatei({ id: "in00000001", dateiname: "gut.txt" });

    const eintraege = await archiv(await ruf("?ids=in00000001,gibtsnicht"));

    expect(namen(eintraege).sort()).toEqual(["_HINWEIS.txt", "gut.txt"]);
    expect(hinweis(eintraege)).toContain("gibtsnicht — Nicht gefunden");
  });

  it("eine leere Auswahl ist 400 mit Grund, nicht ein leeres Archiv", async () => {
    for (const frage of ["", "?ids=", "?ids=,,%20,"]) {
      const res = await ruf(frage);
      expect(res.status, `frage=${frage}`).toBe(400);
      expect(res.headers.get("X-Content-Type-Options"), `frage=${frage}`).toBe("nosniff");
      expect(res.headers.get("Cache-Control"), `frage=${frage}`).toBe("private, no-store");
      expect(await res.text()).toMatch(/keine Datei ausgewählt/i);
    }
  });

  it("dieselbe id zweimal ergibt EINEN Eintrag und EINE Fehlzeile", async () => {
    await legeInboxDatei({ id: "in00000001", dateiname: "gut.txt" });

    const eintraege = await archiv(
      await ruf("?ids=in00000001,in00000001,gibtsnicht,gibtsnicht"),
    );

    // Die bekannte id deckt `WHERE id IN (…)` schon ab — die UNBEKANNTE ist die
    // tragende Haelfte: sie geht an der Datenbank vorbei, und ohne Entdopplung
    // stuende sie zweimal in der Fehlliste.
    expect(namen(eintraege).sort()).toEqual(["_HINWEIS.txt", "gut.txt"]);
    expect(hinweis(eintraege).match(/gibtsnicht/g)).toHaveLength(1);
  });
});

describe("GET /api/inbox/zip — Kopfzeilen und Abbruch", () => {
  it("der Archivname traegt ASCII-Rueckfall UND filename*", async () => {
    await legeInboxDatei({ id: "in00000001" });

    const res = await ruf("?ids=in00000001");

    // Der ASCII-Teil ist hart entschaerft (Leerzeichen → `_`), der echte Name
    // steht ausschliesslich in `filename*` — genau der Alt-Fehler, der `%C3%9C`
    // beim Empfaenger ankommen liess.
    expect(res.headers.get("Content-Disposition")).toBe(
      `attachment; filename="Posteingang_2026-08-01.zip"; filename*=UTF-8''Posteingang%202026-08-01.zip`,
    );
    expect(res.headers.get("X-Content-Type-Options")).toBe("nosniff");
    await res.arrayBuffer();
  });

  it("sequenziell: der zweite Strom wird erst geoeffnet, wenn der erste Eintrag STEHT", async () => {
    /*
     * DIE ZUSAGE AUS T34 (`download/[id]/zip/route.ts:28-32`), hier gemessen:
     * zu jedem Zeitpunkt ist hoechstens EIN Quellstrom offen. `?ids=` hat keine
     * Obergrenze — wer alle Quellen vorab oeffnet, hat ein Descriptor-Leck per
     * BAUFORM, das erst bei einer grossen Auswahl auffaellt und dann nicht mehr
     * nach diesem Handler aussieht.
     *
     * `archiv.append()` kehrt SOFORT zurueck: ohne ein Warten auf das
     * `entry`-Ereignis liefe die Schleife durch und haette beide Deskriptoren
     * gleichzeitig offen, waehrend Eintrag 1 noch ungelesen ist. Genau deshalb
     * ist der stockende Strom hier der Messhebel — er kommt nie zu Ende, also
     * darf die Zahl NIE ueber 1 steigen.
     */
    steuerung.stockend = true;
    await legeInboxDatei({ id: "in00000001" });
    await legeInboxDatei({ id: "in00000002" });
    const abbruch = new AbortController();

    const res = await ruf("?ids=in00000001,in00000002", { signal: abbruch.signal });
    expect(res.status).toBe(200);
    await warteBis(() => geoeffneteStroeme.length === 1);
    // Grosszuegig gewartet: ein zu kurzes Fenster bestuende auch gegen die
    // durchlaufende Schleife, und der Test besaesse seine Aussage nicht.
    await new Promise((f) => setTimeout(f, 300));

    expect(geoeffneteStroeme).toHaveLength(1);

    // Aufgeraeumt: ohne den Abbruch bliebe der stockende Strom offen und der
    // Hintergrundlauf haengen, ueber das Ende dieses Tests hinaus.
    abbruch.abort();
    await new Promise((f) => setTimeout(f, 50));
  });

  it("Abbruch der Anfrage: der offene Strom wird geschlossen, ehe er zu Ende ist", async () => {
    /*
     * TRAGEND IST `readableEnded === false`. Ein zu Ende gelesener Strom
     * zerstoert sich selbst; „destroyed" allein ist deshalb auch OHNE jede
     * Abbruchbehandlung irgendwann wahr, und ein Test, der nur darauf sieht,
     * misst die Wartezeit statt der Zusage — genau so ueberlebte diese Datei die
     * Mutation „`req.signal`-Zuhoerer entfernt".
     *
     * Zwei Zeilen ausgewaehlt, obwohl nur eine oeffnet: die zweite belegt, dass
     * der Abbruch die Schleife auch VERLAESST, statt nach dem Aufraeumen noch
     * einen frischen Deskriptor zu oeffnen.
     */
    steuerung.stockend = true;
    await legeInboxDatei({ id: "in00000001" });
    await legeInboxDatei({ id: "in00000002" });
    const abbruch = new AbortController();

    const res = await ruf("?ids=in00000001,in00000002", { signal: abbruch.signal });
    expect(res.status).toBe(200);
    // Der Rumpf wird ABSICHTLICH nicht gelesen — genau so verhaelt sich ein
    // Empfaenger, der die Verbindung fallen laesst.
    await warteBis(() => geoeffneteStroeme.length === 1);
    expect(geoeffneteStroeme[0].destroyed).toBe(false);

    abbruch.abort();
    await new Promise((f) => setTimeout(f, 100));

    expect(geoeffneteStroeme.map((s) => s.destroyed)).toEqual([true]);
    expect(geoeffneteStroeme.map((s) => s.readableEnded)).toEqual([false]);
    // Und der ANTWORTKOERPER endet auch. Der stockende Quellstrom schliesst den
    // PassThrough nie von selbst; beendet wird er auf ZWEI Wegen — `beiAbbruch`
    // und der `catch` des Hintergrundlaufs zerstoeren ihn beide. Zugesichert ist
    // deshalb nur, DASS er endet, nicht welcher der beiden ihn beendet: eine
    // Fassung, die den Empfaenger auf einem Koerper sitzen liesse, den niemand
    // mehr fuellt, kaeme hier nicht zurueck. Das Ausbleiben faellt als
    // Zeitueberschreitung der Suite auf, nicht als eigene Zusicherung.
    await erwarteRumpfEnde(res);
  });
});

describe("GET /api/inbox/zip — hier wird nichts gezaehlt und nichts protokolliert", () => {
  it("kein Eintrag in download_logs nach einem vollstaendigen Abruf", async () => {
    await legeInboxDatei({ id: "in00000001" });

    await archiv(await ruf("?ids=in00000001"));

    const { getDb } = await import("@/app/m/files/_db/client");
    const { downloadLogs } = await import("@/app/m/files/_db/schema");
    expect(getDb().select({ id: downloadLogs.id }).from(downloadLogs).all()).toEqual([]);
  });

  it("Quelltext-Zusicherung: der Handler kennt das Audit-Log gar nicht", async () => {
    // Das Log gehoert den OEFFENTLICHEN Share-Wegen; hier gibt es keinen Zaehler
    // und keinen anonymen Abrufer. Ein spaeteres „loggen wir das doch auch"
    // faellt damit auf, statt sich einzuschleichen.
    const quelle = readFileSync("src/app/m/files/api/inbox/zip/route.ts", "utf8");
    expect(quelle).not.toMatch(/downloadLogs|protokolliereDownload|downloadCount/);
  });
});
