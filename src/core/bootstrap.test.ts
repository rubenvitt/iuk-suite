import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { existsSync, mkdtempSync, rmSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";
import {
  migrateAllModules,
  shouldSeed,
  MODULE_MIGRATIONS,
  CORE_MIGRATIONS,
  assertHostConfig,
  startBackgroundWork,
} from "@/core/bootstrap";
import { ZAHL_NAMEN } from "@/app/m/files/_lib/grenzen";

/**
 * ZWEI Durchreich-Spione, und beide sind nötig, weil ihre Aussage sonst
 * niemandem gehört:
 *
 * - `validateFilesHosts` (Prüfung 5) greift laut Spec §9.4 IMMER, auch bei null
 *   Hosts — anders als die Prüfungen 1–4 und 6. Bei null Hosts liefert sie
 *   selbst aber `[]`, also ist der Unterschied zwischen „ungegatet" und „wie 1–4
 *   gegatet" von außen NICHT beobachtbar. Nur der Aufrufzähler sieht ihn.
 * - `starteAvArbeiter` wird bewusst NICHT durchgereicht: der echte Arbeiter
 *   öffnet Sockets und liest Tabellen. Gebraucht wird hier allein die Naht
 *   „`startBackgroundWork()` startet ihn" — ohne sie wäre ein leerer Rumpf von
 *   `starteFilesHintergrund` grün, und die Warteschlange arbeitete niemand ab.
 */
const spione = vi.hoisted(() => ({ hostPruefung: 0, avArbeiter: 0 }));

vi.mock("@/app/m/files/_lib/hostRolle", async (importOriginal) => {
  const echt = await importOriginal<typeof import("@/app/m/files/_lib/hostRolle")>();
  return {
    ...echt,
    validateFilesHosts: (...args: Parameters<typeof echt.validateFilesHosts>) => {
      spione.hostPruefung += 1;
      return echt.validateFilesHosts(...args);
    },
  };
});

vi.mock("@/app/m/files/_lib/av", async (importOriginal) => {
  const echt = await importOriginal<typeof import("@/app/m/files/_lib/av")>();
  return {
    ...echt,
    starteAvArbeiter: () => {
      spione.avArbeiter += 1;
    },
  };
});

const DIR = "./.data/bootstrap-test";

beforeEach(() => {
  rmSync(DIR, { recursive: true, force: true });
  process.env.DATA_DIR = DIR;
});
afterEach(() => {
  rmSync(DIR, { recursive: true, force: true });
  vi.unstubAllEnvs();
});

describe("migrateAllModules", () => {
  it("creates portal.db with the services table", () => {
    migrateAllModules();
    expect(existsSync(`${DIR}/portal.db`)).toBe(true);
    const db = new Database(`${DIR}/portal.db`);
    const row = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='services'")
      .get() as { name?: string } | undefined;
    db.close();
    expect(row?.name).toBe("services");
  });
});

/**
 * Ein neues Modul muss an drei entkoppelten Stellen eingetragen werden:
 * `_db/`-Ordner, MODULE_MIGRATIONS hier, COPY-Zeile im Dockerfile. Vergisst man
 * eine davon, merkt man es nicht beim Bauen und nicht in den Tests, sondern
 * erst beim Boot des Prod-Images — also genau dort, wo es am teuersten ist.
 * Diese Tests koppeln die drei Stellen aneinander.
 */
describe("Modul-Registrierung ist vollständig", () => {
  const MODULE_DIR = "src/app/m";
  // Beide Listen: das Dreieck (Ordner, Eintrag, COPY) gilt für eine core-DB
  // genauso. Ohne diese Zeile fiele die COPY-Zeile für `konto` lautlos unter
  // den Tisch und das Prod-Image bräche erst beim Boot.
  const ALLE_MIGRATIONEN = [...MODULE_MIGRATIONS, ...CORE_MIGRATIONS];

  it("jedes Modul mit _db/ steht in MODULE_MIGRATIONS", () => {
    const withDb = readdirSync(MODULE_DIR, { withFileTypes: true })
      .filter((e) => e.isDirectory() && existsSync(`${MODULE_DIR}/${e.name}/_db`))
      .map((e) => e.name);
    const registered = MODULE_MIGRATIONS.map((m) => m.key);
    expect(withDb.filter((k) => !registered.includes(k))).toEqual([]);
  });

  it("jeder Migrations-Ordner existiert und hat ein Journal", () => {
    for (const m of ALLE_MIGRATIONEN) {
      expect(existsSync(m.migrationsFolder), `${m.key}: ${m.migrationsFolder}`).toBe(true);
      expect(existsSync(`${m.migrationsFolder}/meta/_journal.json`), m.key).toBe(true);
    }
  });

  it("jeder Migrations-Ordner wird ins Prod-Image kopiert", () => {
    // Ohne COPY fehlen die Migrationen im standalone-Image und der Boot
    // scheitert erst im Container, nicht im Build.
    const dockerfile = readFileSync("Dockerfile", "utf8");
    for (const m of ALLE_MIGRATIONEN) {
      expect(dockerfile, `Dockerfile: COPY für ${m.key} fehlt`).toContain(m.migrationsFolder);
    }
  });
});

// Next's next-env.d.ts augments NodeJS.ProcessEnv with `readonly NODE_ENV`,
// so direct `process.env.NODE_ENV = ...` assignment (as in the task brief)
// fails `tsc --noEmit`. Use vi.stubEnv/unstubAllEnvs instead — the repo's own
// established pattern for this exact constraint (see devLogin.test.ts).
// Assertions and behavior are unchanged from the brief.
describe("shouldSeed", () => {
  it("is true when SUITE_SEED=1", () => {
    vi.stubEnv("SUITE_SEED", "1");
    vi.stubEnv("NODE_ENV", "production");
    expect(shouldSeed()).toBe(true);
  });
  it("is false in production without SUITE_SEED", () => {
    vi.stubEnv("SUITE_SEED", undefined);
    vi.stubEnv("NODE_ENV", "production");
    expect(shouldSeed()).toBe(false);
  });
});

/**
 * T22 — die Boot-Naht des Moduls `files` (Spec §9.4, Prüfungen 1–6).
 *
 * Warum die Zahlenpflicht BEDINGT ist und das keine Milderung ist: diese Kette
 * läuft aus `instrumentation.ts` für die GANZE Suite, VOR den Migrationen aller
 * Module. Eine unbedingte Pflicht hieße — sobald ein Image mit `files` auf dem
 * Server landet, startet `portal`, `qr` und `feedback` nicht mehr, bis die .env
 * ergänzt ist. Der Schalter ist DIESELBE Variable, die das Modul einschaltet
 * (`SUITE_HOST_FILES`); es gibt keinen zweiten, den jemand vergessen kann.
 *
 * `DATA_DIR` liegt hier in einem eigenen tmp-Verzeichnis und NICHT im geteilten
 * `./.data/bootstrap-test`: Prüfung 6 legt `<DATA_DIR>/files` an, und ihre
 * Abwesenheit bei null Hosts ist eine Zusage dieses Blocks — die trüge nicht,
 * wenn ein anderer Test dasselbe Verzeichnis anfasst.
 */
describe("assertHostConfig — die sechs Boot-Prüfungen von `files` (§9.4)", () => {
  const HOST_A = "files.localtest.me";
  const HOST_B = "drop.localtest.me";

  /** Die drei Pflichtzahlen aus §9.3 in den Dev-Werten (§9.3-Tabelle). */
  const PFLICHTZAHLEN: Record<string, string> = {
    FILES_MAX_DATEI_BYTES: "12582912",
    FILES_AV_MAX_BYTES: "12582912",
    FILES_MAX_ABLAUF_TAGE: "7",
  };

  let daten: string;
  const ablage = () => join(daten, "files");

  function setzeZahlen(): void {
    for (const [name, wert] of Object.entries(PFLICHTZAHLEN)) vi.stubEnv(name, wert);
  }

  beforeEach(() => {
    daten = mkdtempSync(join(tmpdir(), "files-boot-"));
    vi.stubEnv("DATA_DIR", daten);
    // Eine Entwickler-Shell kann FILES_* gesetzt haben; „keine Variable
    // gesetzt" muss aber wörtlich gelten, sonst prüft Punkt 1 etwas anderes.
    for (const name of ZAHL_NAMEN) vi.stubEnv(name, undefined);
    vi.stubEnv("SUITE_HOST_FILES", undefined);
    // Seit T38 ruft `assertHostConfig()` auch `lagerbuchBootFehler()` mit —
    // eine gesetzte `SUITE_HOST_LAGERBUCH` in einer Entwickler-Shell schaltete
    // sonst dessen Pruefungen 5/6 scharf und liesse Assertions dieses Blocks an
    // einer Variable scheitern, die er gar nicht prueft.
    vi.stubEnv("SUITE_HOST_LAGERBUCH", undefined);
    spione.hostPruefung = 0;
    spione.avArbeiter = 0;
  });

  afterEach(() => {
    rmSync(daten, { recursive: true, force: true });
  });

  it("null Hosts, keine einzige FILES_-Variable: der Start bricht NICHT ab", async () => {
    // Ein Modul, das niemand erreichen kann, nimmt portal, qr und feedback
    // nicht mit.
    await expect(assertHostConfig()).resolves.toBeUndefined();
    // Und Prüfung 6 hat NICHT gelaufen: ohne diese Zeile bliebe das Entfernen
    // des `erreichbar`-Gates um die Ablage-Probe grün, weil die Probe auf einem
    // beschreibbaren tmp-Verzeichnis gelingt.
    expect(existsSync(ablage())).toBe(false);
  });

  it("Prüfung 5 greift auch bei null Hosts — sie liest nur Konfiguration", async () => {
    // Genau dann nützlich, wenn jemand die Hostliste gerade ändert. Ihr
    // Rückgabewert ist bei null Hosts leer, die Aussage steckt also allein im
    // Aufruf (§9.4).
    await assertHostConfig();
    expect(spione.hostPruefung).toBe(1);
  });

  it("zwei Hosts, FILES_MAX_DATEI_BYTES fehlt: bricht ab und nennt Name UND Einheit", async () => {
    vi.stubEnv("SUITE_HOST_FILES", `${HOST_A},${HOST_B}`);
    vi.stubEnv("FILES_AV_MAX_BYTES", PFLICHTZAHLEN.FILES_AV_MAX_BYTES);
    vi.stubEnv("FILES_MAX_ABLAUF_TAGE", PFLICHTZAHLEN.FILES_MAX_ABLAUF_TAGE);

    const fehler = await assertHostConfig().then(
      () => null,
      (e: unknown) => e as Error,
    );

    expect(fehler).toBeInstanceOf(Error);
    expect(fehler?.message).toContain("FILES_MAX_DATEI_BYTES");
    // MIT Präposition: „Bytes" allein steckt schon im Variablennamen, die
    // Zusicherung wäre sonst auch bei fehlender Einheit grün (Spec §9.1).
    expect(fehler?.message).toContain("in Bytes");
  });

  it("EIN Host: bricht ab, weil eine Rolle keinen Host hätte", async () => {
    // Die Zahlen sind gültig — sonst ritte diese Zusage auf Prüfung 1 mit.
    setzeZahlen();
    vi.stubEnv("SUITE_HOST_FILES", HOST_A);

    const fehler = await assertHostConfig().then(
      () => null,
      (e: unknown) => e as Error,
    );

    expect(fehler).toBeInstanceOf(Error);
    expect(fehler?.message).toContain("SUITE_HOST_FILES");
    expect(fehler?.message).toContain("zwei Rollen");
  });

  it("zwei GLEICHE Hosts: bricht ab — `validateHostConfig` sieht das nicht", async () => {
    // `claimedBy` meldet nur, wenn `other !== key` (`hosts.ts:87-94`): eine
    // Doppelung INNERHALB eines Moduls fällt dort durch, und beide Rollen
    // zeigten still auf denselben Host.
    setzeZahlen();
    vi.stubEnv("SUITE_HOST_FILES", `${HOST_A},${HOST_A}`);

    const fehler = await assertHostConfig().then(
      () => null,
      (e: unknown) => e as Error,
    );

    expect(fehler).toBeInstanceOf(Error);
    expect(fehler?.message).toContain("denselben Host");
  });

  it("Hosts und Zahlen in Ordnung: startet — und Prüfung 6 hat die Ablage angelegt", async () => {
    // Die Gegenprobe zu den vier Abbrüchen: ohne sie wäre „wirft immer" grün.
    setzeZahlen();
    vi.stubEnv("SUITE_HOST_FILES", `${HOST_A},${HOST_B}`);

    await expect(assertHostConfig()).resolves.toBeUndefined();
    expect(existsSync(ablage())).toBe(true);
  });

  it("unbeschreibbare Ablage bei gesetzten Hosts: bricht ab (Prüfung 6)", async () => {
    // Nicht per `chmod`: als root — CI, Container — ignoriert der Kernel die
    // Modusbits und der Schreibvorgang gelingt. Ein DATA_DIR, das auf eine
    // REGULÄRE DATEI zeigt, ist derselbe Betriebsfall („die Ablage lässt sich
    // nicht anlegen") und root-fest: `mkdir` liefert ENOTDIR.
    const laut = vi.spyOn(console, "error").mockImplementation(() => {});
    const datei = join(daten, "keine-ablage");
    writeFileSync(datei, "x");
    vi.stubEnv("DATA_DIR", datei);
    setzeZahlen();
    vi.stubEnv("SUITE_HOST_FILES", `${HOST_A},${HOST_B}`);

    const fehler = await assertHostConfig().then(
      () => null,
      (e: unknown) => e as Error,
    );

    expect(fehler).toBeInstanceOf(Error);
    expect(fehler?.message).toContain("Ablage");
    expect(laut).toHaveBeenCalled();
    laut.mockRestore();
  });
});

/**
 * Der Startpunkt der Hintergrundarbeit — die Naht, die kein Verhaltenstest
 * sehen kann.
 *
 * `assertHostConfig` ist ab T22 `async` (die Ablage-Probe aus §5.6 ist es), und
 * ein fehlendes `await` in `instrumentation.ts` verwandelt „der Start bricht ab"
 * in eine unbehandelte Rejection, die nichts abbricht — die Migrationen liefen
 * dann VOR der Prüfung. Deshalb ist die Reihenfolge hier ein Quelltext-Scan:
 * `register()` selbst läuft nur im Next-Runtime.
 */
describe("die Reihenfolge im Boot (src/instrumentation.ts)", () => {
  const quelle = readFileSync("src/instrumentation.ts", "utf8");

  it("wartet auf assertHostConfig", () => {
    expect(quelle).toContain("await assertHostConfig();");
  });

  it("prüft die Konfiguration VOR den Migrationen und startet den Hintergrund DANACH", () => {
    const pruefung = quelle.indexOf("await assertHostConfig();");
    const migration = quelle.indexOf("migrateAllModules();");
    const hintergrund = quelle.indexOf("startBackgroundWork();");

    expect(pruefung).toBeGreaterThan(-1);
    expect(migration).toBeGreaterThan(-1);
    expect(hintergrund).toBeGreaterThan(-1);
    expect(pruefung).toBeLessThan(migration);
    // Der AV-Arbeiter liest Tabellen — vor den Migrationen gäbe es sie nicht.
    expect(migration).toBeLessThan(hintergrund);
  });

  it("startBackgroundWork startet den AV-Arbeiter — wenn `files` konfiguriert ist", () => {
    /*
     * DIE ENV GEHOERT ZUM TEST, seit `starteFilesHintergrund()` eine Wache hat:
     * ohne die drei Pflichtzahlen tut das Modul absichtlich nichts (sonst
     * schriebe eine Instanz ohne Host alle 60 Sekunden vier Fehlerzeilen, siehe
     * `files/_lib/boot.test.ts`).
     *
     * Ohne diese Zeilen prueft der Test also den UNKONFIGURIERTEN Fall und waere
     * dauerhaft gruen, obwohl der Arbeiter nie startet — genau die Blindheit, die
     * er verhindern soll („eine Warteschlange, die niemand abarbeitet").
     */
    const vorher = { ...process.env };
    Object.assign(process.env, {
      FILES_MAX_DATEI_BYTES: "524288000",
      FILES_AV_MAX_BYTES: "524288000",
      FILES_MAX_ABLAUF_TAGE: "7",
    });
    try {
      spione.avArbeiter = 0;
      startBackgroundWork();
      expect(spione.avArbeiter).toBe(1);
    } finally {
      process.env = vorher;
    }
  });

  it("und startet ihn NICHT, solange `files` keine Zahlen hat", () => {
    // Die Gegenrichtung im selben Besitz: der Boot der Suite laeuft weiter,
    // wenn ein Modul (noch) nicht konfiguriert ist — er startet dessen
    // Hintergrundarbeit nur nicht. Bis zum files-Cutover ist das der Normalfall.
    const vorher = { ...process.env };
    for (const n of ["FILES_MAX_DATEI_BYTES", "FILES_AV_MAX_BYTES", "FILES_MAX_ABLAUF_TAGE"]) {
      delete process.env[n];
    }
    const stumm = vi.spyOn(console, "info").mockImplementation(() => {});
    try {
      spione.avArbeiter = 0;
      startBackgroundWork();
      expect(spione.avArbeiter).toBe(0);
    } finally {
      stumm.mockRestore();
      process.env = vorher;
    }
  });
});

/**
 * DIE NAHT OHNE NETZ (§10.5, Plan Teil 3 / T38).
 *
 * `bootstrap.test.ts` koppelt bisher NUR das Migrations-Dreieck. Die Boot-Haken
 * koppelt es nicht — und ohne diesen Block koennte `lagerbuchBootFehler()`
 * existieren, gruen getestet sein und NIE GERUFEN WERDEN: alle sechs Pruefungen
 * liefen nicht, und weder typecheck noch lint noch build noch Vitest noch
 * Playwright wuerde rot.
 *
 * Warum ein QUELLTEXT-Scan und kein Verhaltenstest: `assertHostConfig()` ohne
 * Prod-Host liefert bei JEDER Verdrahtung eine leere Fehlerliste (die
 * Bedingtheit ist Absicht), und MIT Prod-Host braeuchte der Test eine
 * vollstaendige, gueltige Umgebung fuer ALLE Module — dann prueft er das
 * Zusammenspiel und nicht mehr die Naht. Der Scan haelt genau die eine Aussage
 * fest, um die es geht: DER AUFRUF STEHT DA, UND ER STEHT IM errors-ARRAY.
 */
describe("Boot-Haken der Module sind verdrahtet", () => {
  const QUELLE = readFileSync("src/core/bootstrap.ts", "utf8");

  /**
   * Nur der `errors`-Array-Block, und darin nur die WIRKSAMEN (nicht
   * auskommentierten) Zeilen. Ein Ganzdatei-Scan liesse ein
   * `// ...(await lagerbuchBootFehler()),` — mitten im Debuggen
   * auskommentiert und vergessen — als bestanden durch: die Zeichenkette
   * steht ja noch im Quelltext, nur nicht mehr wirksam. Genau diese Mutation
   * ist die wahrscheinlichere als das entfernte `await` aus der Gegenprobe.
   */
  const errorsBlock = (() => {
    const von = QUELLE.indexOf("const errors = [");
    const bis = QUELLE.indexOf("];", von);
    if (von === -1 || bis === -1) throw new Error("const errors = [ ... ]; nicht gefunden");
    return QUELLE.slice(von, bis)
      .split("\n")
      .filter((zeile) => !zeile.trim().startsWith("//"))
      .join("\n");
  })();

  it("assertHostConfig ruft jeden Modul-Boot-Haken", () => {
    for (const haken of ["filesBootFehler", "lagerbuchBootFehler"]) {
      expect(QUELLE, `${haken} fehlt in bootstrap.ts`).toContain(haken);
    }
  });

  it("jeder Haken steht WIRKSAM AWAITET im errors-Array, nicht irgendwo", () => {
    // Ein `lagerbuchBootFehler();` ohne `await` und ohne Spread waere
    // typkorrekt, lint-sauber und wirkungslos — die Promise liefe ins Leere und
    // die Fehlerliste bliebe leer. Genau dieselbe Klasse, die der Kopfkommentar
    // von assertHostConfig fuer `files` ausschreibt. Geprueft wird gegen
    // `errorsBlock`, nicht gegen `QUELLE`: ein auskommentierter Aufruf ist im
    // Quelltext lesbar, aber wirkungslos, und darf hier nicht bestehen.
    for (const haken of ["filesBootFehler", "lagerbuchBootFehler"]) {
      expect(errorsBlock, `${haken}: kein wirksames "...(await ${haken}())" im errors-Array`)
        .toContain(`...(await ${haken}())`);
    }
  });
});
