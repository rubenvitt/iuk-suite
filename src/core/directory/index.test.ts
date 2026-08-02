import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect, vi } from "vitest";
import {
  createDirectory,
  getDirectory,
  isDirectoryConfigured,
  type DirectoryTransport,
} from "@/core/directory";

/**
 * DAS PERSONENVERZEICHNIS — die Zusagen, die still brechen.
 *
 * Keiner dieser Tests fasst das Netz an: `createDirectory` bekommt seinen
 * Transport injiziert. Ein Test, der `fetch` global mockt, prueft die Mock-
 * Bibliothek mit; einer, der ein Modul-Singleton zuruecksetzt, prueft die
 * Reihenfolge der Testdatei mit. Beides ist hier ausgeschlossen.
 *
 * Die vier Zusagen in der Reihenfolge ihres Schadens:
 *
 * 1. AUSFALL BRICHT NICHTS. Nicht konfiguriert, HTTP-Fehler, Zeitueberschreitung,
 *    unlesbare Antwort — jeder Fall endet in einem Ergebnis, nie in einer
 *    Ausnahme. Eine geworfene Ausnahme aus dem Verzeichnis nimmt die Cockpit-
 *    Seite mit, und dann sind auch die BESTEHENDEN Zuordnungen unlesbar.
 * 2. EIN FEHLER WIRD NIE GECACHT. Sonst vergiftet eine einzige Zeitueberschreitung
 *    das Verzeichnis fuer die ganze TTL, und die Oberflaeche degradiert still.
 * 3. DIE PAGINIERUNG WIRD VOLLSTAENDIG GELESEN. Pocket ID deckelt
 *    `pagination[limit]` serverseitig auf 100 (`Paginate` in
 *    `utils/list_request_util.go`). Wer nur die erste Seite liest, hat ab Person
 *    101 ein Verzeichnis, das Leute VERSCHWEIGT — und das sieht aus wie „die
 *    Person gibt es nicht", nicht wie ein Fehler.
 * 4. DER SCHLUESSEL IST DER `sub`. `UserDto.id` ist der OIDC-`sub`
 *    (`backend/internal/oidc/claims_service.go:147` — `claims["sub"] = user.ID`).
 *    Das ist der ganze Zweck des Verzeichnisses; ein Eingabefeld koennte den
 *    `sub` nie liefern.
 */

type RohNutzer = Record<string, unknown>;

/** Ein Transport, der eine feste Seitenliste ausliefert und seine Aufrufe merkt. */
function seitenTransport(seiten: RohNutzer[][]): DirectoryTransport & {
  aufrufe: string[];
} {
  const aufrufe: string[] = [];
  const t: DirectoryTransport = async (url) => {
    aufrufe.push(url);
    const seite = Number(new URL(url).searchParams.get("pagination[page]") ?? "1");
    return {
      ok: true,
      status: 200,
      json: async () => ({
        data: seiten[seite - 1] ?? [],
        pagination: { totalPages: seiten.length, totalItems: seiten.flat().length },
      }),
    };
  };
  return Object.assign(t, { aufrufe });
}

const KONFIG = { baseUrl: "https://id.example.test", apiKey: "geheim" };

const ANNA: RohNutzer = {
  id: "sub-anna",
  username: "anna",
  email: "Anna@iuk.example",
  firstName: "Anna",
  lastName: "Beispiel",
  displayName: "Anna Beispiel",
};
const BODO: RohNutzer = {
  id: "sub-bodo",
  username: "bodo",
  email: "bodo@iuk.example",
  firstName: "Bodo",
  lastName: "Zweitmann",
  displayName: "Bodo Zweitmann",
};

describe("Verzeichnis — Abruf und Abbildung", () => {
  it("liefert den OIDC-sub als userId, nicht Name oder E-Mail", async () => {
    const v = createDirectory({ ...KONFIG, transport: seitenTransport([[ANNA]]) });

    const r = await v.list();

    expect(r.status).toBe("ok");
    expect(r.people).toEqual([
      { userId: "sub-anna", name: "Anna Beispiel", email: "Anna@iuk.example" },
    ]);
  });

  it("schickt den API-Key im X-API-KEY-Header", async () => {
    const transport = vi.fn<DirectoryTransport>(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ data: [ANNA], pagination: { totalPages: 1 } }),
    }));
    const v = createDirectory({ ...KONFIG, transport });

    await v.list();

    expect(transport.mock.calls[0][1].headers["X-API-KEY"]).toBe("geheim");
  });

  it("leitet den Anzeigenamen ab: displayName, sonst Vor-/Nachname, sonst Kennung", async () => {
    const v = createDirectory({
      ...KONFIG,
      transport: seitenTransport([
        [
          { id: "a", displayName: "Anzeige", firstName: "Vor", lastName: "Nach", username: "kurz" },
          { id: "b", firstName: "Vor", lastName: "Nach", username: "kurz" },
          { id: "c", username: "kurz" },
          { id: "d" },
        ],
      ]),
    });

    const namen = (await v.list()).people.map((p) => p.name);

    expect(namen).toEqual(["Anzeige", "Vor Nach", "kurz", null]);
  });

  it("laesst Eintraege ohne id aus — ein Vorschlag ohne sub waere nicht speicherbar", async () => {
    const v = createDirectory({
      ...KONFIG,
      transport: seitenTransport([[{ username: "ohne-id" }, ANNA, { id: "" }]]),
    });

    expect((await v.list()).people.map((p) => p.userId)).toEqual(["sub-anna"]);
  });

  it("laesst gesperrte Konten aus — sie koennen sich nicht anmelden", async () => {
    const v = createDirectory({
      ...KONFIG,
      transport: seitenTransport([[ANNA, { ...BODO, disabled: true }]]),
    });

    expect((await v.list()).people.map((p) => p.userId)).toEqual(["sub-anna"]);
  });
});

describe("Verzeichnis — Paginierung", () => {
  it("liest ALLE Seiten und nicht nur die erste", async () => {
    const transport = seitenTransport([
      [ANNA],
      [BODO],
      [{ id: "sub-cara", username: "cara", displayName: "Cara Dritt" }],
    ]);
    const v = createDirectory({ ...KONFIG, transport });

    const r = await v.list();

    expect(r.people.map((p) => p.userId)).toEqual(["sub-anna", "sub-bodo", "sub-cara"]);
    expect(transport.aufrufe).toHaveLength(3);
  });

  it("fordert die serverseitige Obergrenze von 100 pro Seite an", async () => {
    const transport = seitenTransport([[ANNA]]);
    const v = createDirectory({ ...KONFIG, transport });

    await v.list();

    const params = new URL(transport.aufrufe[0]).searchParams;
    expect(params.get("pagination[limit]")).toBe("100");
    expect(params.get("pagination[page]")).toBe("1");
  });

  it("deckelt die Seitenzahl — eine kaputte totalPages laeuft nicht endlos", async () => {
    const aufrufe: string[] = [];
    const transport: DirectoryTransport = async (url) => {
      aufrufe.push(url);
      return {
        ok: true,
        status: 200,
        json: async () => ({ data: [ANNA], pagination: { totalPages: 999_999 } }),
      };
    };
    const v = createDirectory({ ...KONFIG, transport, maxPages: 4 });

    const r = await v.list();

    expect(aufrufe).toHaveLength(4);
    expect(r.status).toBe("ok");
  });
});

describe("Verzeichnis — Ausfall bricht nichts", () => {
  it("nicht konfiguriert: leere Liste, Status unconfigured, KEIN Abruf", async () => {
    const transport = vi.fn();
    const v = createDirectory({ baseUrl: "https://id.example.test", apiKey: "", transport });

    const r = await v.list();

    expect(r).toEqual({ status: "unconfigured", people: [] });
    expect(transport).not.toHaveBeenCalled();
  });

  it("ohne Basis-URL ebenfalls unconfigured", async () => {
    const v = createDirectory({ baseUrl: "", apiKey: "geheim", transport: vi.fn() });

    expect((await v.list()).status).toBe("unconfigured");
  });

  it("HTTP-Fehler (z. B. 401, weil der Key keinem Admin gehoert): Status error, kein Wurf", async () => {
    const v = createDirectory({
      ...KONFIG,
      transport: async () => ({ ok: false, status: 401, json: async () => ({}) }),
    });

    await expect(v.list()).resolves.toEqual({ status: "error", people: [] });
  });

  it("ein haengender Abruf wird nach der Zeitgrenze ABGEBROCHEN, nicht abgewartet", async () => {
    // Der Test, den die simulierte Ausnahme darunter NICHT ersetzt: er beweist,
    // dass der AbortController wirklich verdrahtet ist. Ohne ihn haengt die
    // Cockpit-Seite an einem Identitaetsanbieter, der nicht mehr antwortet — und
    // eine haengende Seite ist schlimmer als eine ohne Namen.
    const v = createDirectory({
      ...KONFIG,
      timeoutMs: 5,
      transport: (_url, init) =>
        new Promise((_erfuellen, ablehnen) => {
          init.signal?.addEventListener("abort", () =>
            ablehnen(Object.assign(new Error("aborted"), { name: "AbortError" })),
          );
        }),
    });

    await expect(v.list()).resolves.toEqual({ status: "error", people: [] });
  });

  it("Zeitueberschreitung: Status error, kein Wurf", async () => {
    const v = createDirectory({
      ...KONFIG,
      transport: async () => {
        throw Object.assign(new Error("The operation was aborted"), { name: "AbortError" });
      },
    });

    await expect(v.list()).resolves.toEqual({ status: "error", people: [] });
  });

  it("unlesbare Antwort: Status error, kein Wurf", async () => {
    const v = createDirectory({
      ...KONFIG,
      transport: async () => ({
        ok: true,
        status: 200,
        json: async () => {
          throw new SyntaxError("Unexpected token <");
        },
      }),
    });

    await expect(v.list()).resolves.toEqual({ status: "error", people: [] });
  });

  it("bricht auf einer SPAETEREN Seite ab: Status error statt halbem Verzeichnis", async () => {
    let n = 0;
    const v = createDirectory({
      ...KONFIG,
      transport: async () => {
        n += 1;
        if (n === 1) {
          return {
            ok: true,
            status: 200,
            json: async () => ({ data: [ANNA], pagination: { totalPages: 2 } }),
          };
        }
        return { ok: false, status: 500, json: async () => ({}) };
      },
    });

    // Ein halbes Verzeichnis waere die schlimmste Variante: es sieht vollstaendig
    // aus und verschweigt Personen, ohne dass irgendwo ein Fehler sichtbar wird.
    await expect(v.list()).resolves.toEqual({ status: "error", people: [] });
  });
});

describe("Verzeichnis — Cache", () => {
  it("fragt innerhalb der TTL nicht erneut ab", async () => {
    const transport = seitenTransport([[ANNA]]);
    const v = createDirectory({ ...KONFIG, transport, ttlMs: 60_000, now: () => 1_000 });

    await v.list();
    await v.list();

    expect(transport.aufrufe).toHaveLength(1);
  });

  it("fragt nach Ablauf der TTL erneut ab", async () => {
    const transport = seitenTransport([[ANNA]]);
    let jetzt = 1_000;
    const v = createDirectory({ ...KONFIG, transport, ttlMs: 60_000, now: () => jetzt });

    await v.list();
    jetzt += 60_001;
    await v.list();

    expect(transport.aufrufe).toHaveLength(2);
  });

  it("CACHT KEINEN FEHLER ueber die volle TTL: nach der kurzen Sperre wird wieder abgefragt", async () => {
    let kaputt = true;
    const aufrufe: string[] = [];
    let jetzt = 1_000;
    const v = createDirectory({
      ...KONFIG,
      ttlMs: 300_000,
      fehlerSperreMs: 30_000,
      now: () => jetzt,
      transport: async (url) => {
        aufrufe.push(url);
        if (kaputt) throw new Error("Netz weg");
        return {
          ok: true,
          status: 200,
          json: async () => ({ data: [ANNA], pagination: { totalPages: 1 } }),
        };
      },
    });

    expect((await v.list()).status).toBe("error");
    kaputt = false;
    // Der Kern der Zusage: die Erholung haengt an der SPERRE (30 s), nicht an der
    // TTL eines erfolgreichen Abzugs (5 min). Ein Ausfall vergiftet das
    // Verzeichnis also nicht fuer die volle TTL.
    jetzt += 30_001;
    const zweiter = await v.list();

    expect(zweiter.status).toBe("ok");
    expect(zweiter.people).toHaveLength(1);
    expect(aufrufe).toHaveLength(2);
  });

  /**
   * DIE FEHLERSPERRE.
   *
   * Ein Fehler wird nicht als ERGEBNIS gecacht — `list()` liefert weiter
   * `status: "error"`, nie eine veraltete Liste. Gesperrt wird der ABRUF, und
   * zwar kurz.
   *
   * Ohne sie zahlt die Cockpit-Seite bei einem haengenden Identitaetsanbieter die
   * volle Zeitgrenze BEI JEDEM AUFRUF — der Abzug wird ja nie gecacht, also wird
   * er jedes Mal neu versucht. Das ist kein theoretischer Fall: genau dann, wenn
   * die API weg ist, will ein Admin die Zuordnung nachsehen, und dann laedt jede
   * Seite fuenf Sekunden lang, dauerhaft.
   */
  it("SPERRT den Abruf nach einem Ausfall kurz — nicht jede Seitenladung zahlt die Zeitgrenze", async () => {
    const aufrufe: string[] = [];
    let jetzt = 1_000;
    const v = createDirectory({
      ...KONFIG,
      fehlerSperreMs: 30_000,
      now: () => jetzt,
      transport: async (url) => {
        aufrufe.push(url);
        throw new Error("Netz weg");
      },
    });

    expect((await v.list()).status).toBe("error");
    jetzt += 10_000;
    // Das Ergebnis bleibt „error" — gesperrt ist der Abruf, nicht die Wahrheit.
    expect((await v.list()).status).toBe("error");
    expect((await v.list()).status).toBe("error");

    expect(aufrufe).toHaveLength(1);
  });

  /**
   * DAS GESAMTBUDGET.
   *
   * `maxPages` allein deckelt nur die ZAHL der Abrufe. 50 Seiten mal 5 Sekunden
   * Zeitgrenze sind im schlechtesten Fall vier Minuten in EINEM Seitenaufbau —
   * das ist keine langsame Seite mehr, das ist eine kaputte. Der Fall braucht
   * keinen Ausfall, nur einen langsamen Anbieter und ein gewachsenes
   * Verzeichnis.
   */
  it("bricht einen langsamen Abzug nach dem Gesamtbudget ab, statt maxPages mal Zeitgrenze zu warten", async () => {
    const aufrufe: string[] = [];
    let jetzt = 0;
    const v = createDirectory({
      ...KONFIG,
      maxPages: 50,
      gesamtBudgetMs: 3_000,
      now: () => jetzt,
      transport: async (url) => {
        aufrufe.push(url);
        jetzt += 1_000; // jede Seite kostet eine Sekunde
        return {
          ok: true,
          status: 200,
          json: async () => ({ data: [ANNA], pagination: { totalPages: 50 } }),
        };
      },
    });

    const r = await v.list();

    expect(aufrufe.length).toBeLessThanOrEqual(4);
    // Kein halbes Verzeichnis: ein abgebrochener Abzug ist ein Fehler, kein
    // Teilergebnis, das vollstaendig aussieht.
    expect(r).toEqual({ status: "error", people: [] });
  });

  it("buendelt gleichzeitige Abrufe zu einem einzigen Durchlauf", async () => {
    const transport = seitenTransport([[ANNA]]);
    const v = createDirectory({ ...KONFIG, transport });

    await Promise.all([v.list(), v.list(), v.list()]);

    expect(transport.aufrufe).toHaveLength(1);
  });

  it("invalidate() erzwingt den naechsten Abruf", async () => {
    const transport = seitenTransport([[ANNA]]);
    const v = createDirectory({ ...KONFIG, transport, ttlMs: 60_000, now: () => 1_000 });

    await v.list();
    v.invalidate();
    await v.list();

    expect(transport.aufrufe).toHaveLength(2);
  });
});

describe("Verzeichnis — Suche", () => {
  const mitBeiden = () =>
    createDirectory({ ...KONFIG, transport: seitenTransport([[ANNA, BODO]]) });

  it("findet ueber den Namen, ohne Ruecksicht auf Gross-/Kleinschreibung", async () => {
    expect((await mitBeiden().search("beis")).people.map((p) => p.userId)).toEqual(["sub-anna"]);
  });

  it("findet ueber die E-Mail", async () => {
    expect((await mitBeiden().search("bodo@iuk")).people.map((p) => p.userId)).toEqual([
      "sub-bodo",
    ]);
  });

  it("findet ueber die eingefuegte Kennung (den sub selbst)", async () => {
    expect((await mitBeiden().search("sub-bodo")).people.map((p) => p.userId)).toEqual([
      "sub-bodo",
    ]);
  });

  it("begrenzt die Treffermenge — die Nutzlast ist kein Verzeichnisabzug", async () => {
    const viele = Array.from({ length: 50 }, (_, i) => ({
      id: `sub-${i}`,
      username: `person${i}`,
      displayName: `Person ${i}`,
    }));
    const v = createDirectory({ ...KONFIG, transport: seitenTransport([viele]) });

    expect((await v.search("person", 5)).people).toHaveLength(5);
  });

  it("eine leere Suche liefert nichts — nicht das ganze Verzeichnis", async () => {
    expect((await mitBeiden().search("   ")).people).toEqual([]);
  });

  /**
   * DERSELBE TRENNER WIE IM LOKALEN VERZEICHNIS.
   *
   * `_lib/personen.ts` baut sein Suchfeld aus denselben drei Feldern und sagt
   * ausdruecklich zu: „damit ein Begriff nicht je nach Quelle anders trifft".
   * Steht hier ein anderer Trenner, ist diese Zusage gebrochen — derselbe Begriff
   * findet dann eine Person aus `known_users`, aber nicht dieselbe Person aus dem
   * Verzeichnis.
   */
  it("sucht ueber Feldgrenzen hinweg wie das lokale Verzeichnis — derselbe Trenner", async () => {
    expect((await mitBeiden().search("beispiel anna@")).people.map((p) => p.userId)).toEqual([
      "sub-anna",
    ]);
  });

  it("faellt bei Ausfall auf die leere Trefferliste zurueck, ohne Wurf", async () => {
    const v = createDirectory({
      ...KONFIG,
      transport: async () => ({ ok: false, status: 500, json: async () => ({}) }),
    });

    await expect(v.search("anna")).resolves.toEqual({ status: "error", people: [] });
  });
});

/**
 * QUELLTEXTHYGIENE — kein Selbstzweck.
 *
 * Diese Datei ist die einzige im Projekt, die den API-Key anfasst. Enthaelt sie
 * ein NUL-Byte, gilt sie `ripgrep` (und damit `cona grep` und jedem Prueflauf,
 * der ueber das Repo greppt) als BINAERDATEI und wird STILL UEBERSPRUNGEN. Eine
 * projektweite Suche nach `console.log` oder nach dem Key meldet dann „sauber" —
 * ausgerechnet fuer die Datei, die als einzige etwas zu verbergen haette. Genau
 * das ist in der Pruefung dieses Zweiges passiert.
 */
describe("Verzeichnis — Quelltext", () => {
  it("enthaelt keine unsichtbaren Steuerzeichen — sonst ueberspringt ripgrep die Datei still", () => {
    const quelle = readFileSync(join(process.cwd(), "src/core/directory/index.ts"), "utf8");

    expect(quelle.match(/[\u0000-\u0008\u000B-\u001F]/g)).toBeNull();
  });
});

describe("Verzeichnis — Konfiguration aus der Env", () => {
  it("nimmt POCKET_ID_ISSUER als Basis, wenn keine eigene API-URL gesetzt ist", () => {
    expect(
      isDirectoryConfigured({ POCKET_ID_ISSUER: "https://id.example.test", POCKET_ID_API_KEY: "k" }),
    ).toBe(true);
  });

  it("ohne API-Key ist nichts konfiguriert — der Issuer allein reicht nicht", () => {
    expect(isDirectoryConfigured({ POCKET_ID_ISSUER: "https://id.example.test" })).toBe(false);
    expect(
      isDirectoryConfigured({ POCKET_ID_ISSUER: "https://id.example.test", POCKET_ID_API_KEY: " " }),
    ).toBe(false);
  });

  it("ohne Basis ist nichts konfiguriert", () => {
    expect(isDirectoryConfigured({ POCKET_ID_API_KEY: "k" })).toBe(false);
  });

  it("getDirectory liefert dasselbe Verzeichnis (und damit denselben Cache) je Konfiguration", () => {
    const env = { POCKET_ID_ISSUER: "https://id.example.test", POCKET_ID_API_KEY: "k" };

    expect(getDirectory(env)).toBe(getDirectory(env));
    // Andere Konfiguration → anderes Verzeichnis, sonst haengt in `next dev` der
    // erste gelesene Key bis zum Neustart fest.
    expect(getDirectory({ ...env, POCKET_ID_API_KEY: "anders" })).not.toBe(getDirectory(env));
  });

  it("ein nicht konfiguriertes Verzeichnis aus der Env wirft nicht, sondern meldet unconfigured", async () => {
    await expect(getDirectory({}).list()).resolves.toEqual({
      status: "unconfigured",
      people: [],
    });
  });
});

describe("Verzeichnis — E-Mail exakt aufloesen", () => {
  const v = () => createDirectory({ ...KONFIG, transport: seitenTransport([[ANNA, BODO]]) });

  it("loest eine E-Mail auf den sub auf, Gross-/Kleinschreibung egal", async () => {
    const r = await v().findByEmail("ANNA@IUK.EXAMPLE");

    expect(r.status).toBe("ok");
    expect(r.people.map((p) => p.userId)).toEqual(["sub-anna"]);
  });

  it("EXAKT, nicht enthalten: ein Praefix trifft nicht", async () => {
    expect((await v().findByEmail("anna@iuk")).people).toEqual([]);
  });

  it("unbekannte E-Mail: leere Liste, Status ok (das Verzeichnis lief)", async () => {
    expect(await v().findByEmail("niemand@iuk.example")).toEqual({ status: "ok", people: [] });
  });

  /**
   * DIE FRISCHEPROBE BEI EINEM FEHLTREFFER.
   *
   * `findByEmail` beantwortet eine Frage, auf die die Oberflaeche eine BEHAUPTUNG
   * stuetzt: „Diese E-Mail ist unbekannt — bitte die Schreibweise pruefen."
   * Steht dahinter ein bis zu fuenf Minuten alter Abzug, ist dieser Satz
   * schlicht falsch — und zwar genau im vorgesehenen Ablauf des Runbooks: Konto
   * in Pocket ID anlegen, danach zuordnen. Der Admin sucht dann einen Tippfehler,
   * den es nicht gibt.
   *
   * Ein Fehltreffer ist selten (eine abgeschickte Eingabe, kein Tastendruck) —
   * er darf einen zweiten Abruf kosten. Die Suche im Autofill macht das
   * ABSICHTLICH nicht: dort waere jeder Anschlag ohne Treffer ein Abruf.
   */
  it("sieht bei einem Fehltreffer einmal frisch nach — ein neues Konto ist nicht bis zum TTL-Ende unbekannt", async () => {
    let leute = [ANNA];
    const aufrufe: string[] = [];
    const verzeichnis = createDirectory({
      ...KONFIG,
      ttlMs: 300_000,
      now: () => 1_000, // die TTL laeuft NICHT ab
      transport: async (url) => {
        aufrufe.push(url);
        return {
          ok: true,
          status: 200,
          json: async () => ({ data: leute, pagination: { totalPages: 1 } }),
        };
      },
    });

    await verzeichnis.list(); // Abzug gefuellt, BODO existiert noch nicht
    leute = [ANNA, BODO]; // Konto wird jetzt in Pocket ID angelegt

    const r = await verzeichnis.findByEmail("bodo@iuk.example");

    expect(r.people.map((p) => p.userId)).toEqual(["sub-bodo"]);
    expect(aufrufe).toHaveLength(2);
  });

  it("ein Treffer aus dem Zwischenspeicher kostet KEINEN zweiten Abruf", async () => {
    const transport = seitenTransport([[ANNA, BODO]]);
    const verzeichnis = createDirectory({ ...KONFIG, transport, ttlMs: 300_000, now: () => 1_000 });

    await verzeichnis.list();
    await verzeichnis.findByEmail("anna@iuk.example");

    expect(transport.aufrufe).toHaveLength(1);
  });

  it("die Frischeprobe laeuft hoechstens EINMAL, nicht in einer Schleife", async () => {
    const transport = seitenTransport([[ANNA]]);
    const verzeichnis = createDirectory({ ...KONFIG, transport, ttlMs: 300_000, now: () => 1_000 });

    await verzeichnis.list();
    const r = await verzeichnis.findByEmail("gibtesnicht@iuk.example");

    expect(r).toEqual({ status: "ok", people: [] });
    expect(transport.aufrufe).toHaveLength(2);
  });

  it("scheitert die Frischeprobe, bleibt es bei der Auskunft aus dem Abzug — kein Fehlerstatus", async () => {
    let kaputt = false;
    const verzeichnis = createDirectory({
      ...KONFIG,
      ttlMs: 300_000,
      now: () => 1_000,
      transport: async () => {
        if (kaputt) throw new Error("Netz weg");
        return {
          ok: true,
          status: 200,
          json: async () => ({ data: [ANNA], pagination: { totalPages: 1 } }),
        };
      },
    });

    await verzeichnis.list();
    kaputt = true;

    // Der Abzug ist weiter gueltig und kennt die Adresse nicht. „error" waere hier
    // die falsche Auskunft — sie schickt den Admin mit „muss sich einmal
    // anmelden" auf die falsche Faehrte.
    expect(await verzeichnis.findByEmail("gibtesnicht@iuk.example")).toEqual({
      status: "ok",
      people: [],
    });
    // Und der gueltige Abzug ueberlebt die gescheiterte Probe.
    expect((await verzeichnis.list()).people.map((p) => p.userId)).toEqual(["sub-anna"]);
  });
});
