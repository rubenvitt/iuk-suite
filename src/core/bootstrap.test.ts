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
 * DIE NAHT OHNE NETZ (§10.5, Plan Teil 3 / T38 — seit Planteil 5 auch Spec §7.3.7).
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
 *
 * ⛔ WARUM HIER SEIT DEM 2026-08-26 KEINE HANDGEPFLEGTE NAMENSLISTE MEHR STEHT.
 * Bis dahin fuehrten die zwei Faelle unten zweimal das Literal
 * `["filesBootFehler", "lagerbuchBootFehler"]`. Ein dritter Haken, der nie
 * eingehaengt wuerde, bliebe darin GRUEN — eine Liste bewacht nur, was jemand
 * daran denkt einzutragen. (Genau der Fall stand an: `radioBootFehler` kam mit
 * Planteil 5 dazu, `src/core/bootstrap.ts:15` und `:103`, Datei 145 Zeilen.)
 * Spec §7.3.7 verlangt deshalb die ABGELEITETE Form: die Hakenmenge wird aus
 * `src/app/m/<modul>/_lib/boot.ts` gelesen, nicht aufgezaehlt.
 *
 * ⛔ UND DER ZEILENFILTER UNTEN IST NICHT DIE VERGESSENE DREITEILIGE REPARATUR.
 * Die vier Quelltext-Scans des Moduls `radio` tragen seit `6331e77`/`4ed3410`
 * einen dreiteiligen Kommentarschnitt, weil ihr alter Schnitt Regexliterale
 * (`/\//` traegt zwei Schraegstriche) fuer einen Kommentarbeginn hielt. Hier
 * bleibt es bewusst beim einfachen Zeilenfilter, aus zwei gemessenen Gruenden:
 *   (a) `src/core/bootstrap.ts` traegt KEIN Regexliteral (selbst nachgesehen am
 *       2026-08-26 ueber alle 145 Zeilen — die einzigen `/`-Paare stehen in
 *       Importpfaden, `migrationsFolder`-Zeichenketten und Kommentaren);
 *       die Reparatur haette hier also nichts zu reparieren.
 *   (b) Alle Zusicherungen dieses Blocks sind POSITIV („der Aufruf steht da").
 *       Ein zu AGGRESSIVER Schnitt entfernte echte Zeilen und machte den Test
 *       ROT, nicht still gruen — das ist der UMGEKEHRTE Fall zu jener
 *       Blindstelle, die an NEGATIVEN Zusicherungen still weniger fand.
 *
 * ⚠️ (a) UND (b) SAGEN, WARUM DER EINFACHE FILTER HIER ERLAUBT IST — SIE SAGEN
 * NICHT, DASS ER AUSREICHT, UND GEMESSEN TUT ER DAS NICHT. Sie decken nur die
 * zu aggressive Richtung ab. Die zu WENIG aggressive bleibt offen: der Filter
 * kennt allein die Zeilenform `//`. Ein Aufruf, der mit den zwei Block-Marken
 * stillgelegt wird, ueberlebt ihn und geht als wirksam durch — nachgemessen am
 * 2026-08-26 (Fix-Runde 1 zu G3), zweimal 23/23 GRUEN, an
 * `src/core/bootstrap.ts:103` und an `:138`.
 * ⛔ DESHALB WIRD DIESE LUECKE UNTEN NICHT BESCHRIEBEN, SONDERN ZUGESICHERT WEG:
 * der letzte Fall dieses Blocks verbietet in den zwei gelesenen Ausschnitten
 * jeden Blockkommentar. Der Schnitt bleibt der einfache, die Luecke wird laut.
 *
 * ⛔ UND DIESER BLOCK IMPORTIERT NICHTS AUS `src/app/m/radio/_lib/quelltextScan.ts`.
 * Ein Kern-Test, der seine Mechanik aus EINEM Modul zieht, machte diesen Helfer
 * zum Kern-Bestandteil, ohne dass es jemand entschieden hat. (Der `ZAHL_NAMEN`-
 * Import oben, `:14`, ist ein DATUM des Moduls `files`, keine geteilte Mechanik.)
 */
describe("Boot-Haken der Module sind verdrahtet", () => {
  const QUELLE = readFileSync("src/core/bootstrap.ts", "utf8");
  const MODUL_DIR = "src/app/m";

  /**
   * Die abgeleitete Menge, Klausel (I) und (IIa) — der Glob stammt aus Spec
   * §7.3.7 (`src/app/m/<modul>/_lib/boot.ts`) und wird NICHT geweitet.
   *
   * ⛔ WAS DIESE ABLEITUNG ERKENNT, GEMESSEN UND NICHT BEHAUPTET: die Form
   * `export function` / `export async function`. Die drei heute vorhandenen
   * Dateien (`files`, `lagerbuch`, `radio`) tragen ausschliesslich sie —
   * nachgesehen am 2026-08-26; eine Sammelform `export { … }` kommt in keiner
   * vor, ein `export const name = () => …` ebenfalls nicht (`radio`s einziger
   * `export const` ist `RETENTION_MONATE_VORGABE`, `_lib/boot.ts:34`, ein Wert).
   * Eine Regexbranche fuer eine Form, die es nirgends gibt, waere unpruefbar
   * und damit selbst leer-gruen — sie steht deshalb bewusst NICHT hier.
   * ⬜ BENANNTE GRENZE: wer einen Boot-Haken kuenftig als const-Pfeilfunktion
   * oder ueber `export { … }` exportiert, wird von dieser Menge nicht gesehen —
   * und die Zahl unten faengt es NICHT, weil sie mitschrumpft. Wer eine solche
   * Form einfuehrt, weitet zuerst diese Regex und probt sie.
   */
  const exportierteFunktionen = readdirSync(MODUL_DIR, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => `${MODUL_DIR}/${e.name}/_lib/boot.ts`)
    .filter((pfad) => existsSync(pfad))
    .flatMap((pfad) =>
      [
        ...readFileSync(pfad, "utf8").matchAll(
          /^export\s+(?:async\s+)?function\s+([A-Za-z][A-Za-z0-9_]*)/gm,
        ),
      ].map((treffer) => treffer[1]),
    );

  /** Klausel (I): jede exportierte `*BootFehler`-Funktion. Heute drei. */
  const bootHaken = exportierteFunktionen.filter((name) => name.endsWith("BootFehler"));

  /**
   * Klausel (IIa): die Hintergrundstarter — ABER NUR DIE AUS EINER `_lib/boot.ts`.
   *
   * ⛔ DAS IST AUSDRUECKLICH EINE TEILMENGE, UND DIE AUSNAHME WIRD NAMENTLICH
   * GEFUEHRT: `starteAufgabenScanArbeiter` liegt in
   * `src/app/m/aufgaben/_lib/scan.ts:324`, wird von `src/core/bootstrap.ts:16`
   * importiert und laeuft im Rumpf von `startBackgroundWork()` — vom Glob oben
   * ist sie STRUKTURELL nicht sichtbar. Eine reine Vorwaertsableitung stuende
   * damit auf einer zu kleinen Zahl und VERDECKTE die Luecke, statt sie zu melden.
   *
   * ⛔ UND DER NAHELIEGENDE GEGENVORSCHLAG IST GEMESSEN FALSCH: den Glob auf
   * `src/app/m/<modul>/_lib/<datei>.ts` zu weiten zoege `starteAvArbeiter`
   * (`src/app/m/files/_lib/av.ts:505`) mit herein — die steht NICHT im Rumpf von
   * `startBackgroundWork()`, sondern wird von `starteFilesHintergrund` gerufen
   * (`src/app/m/files/_lib/boot.ts:139`). Diese Klausel waere rot by construction.
   * Die Ausnahme faengt stattdessen Klausel (IIb) unten, ohne die Menge zu weiten.
   *
   * ⬜ BENANNTE GRENZE, ZWEITE HAELFTE — DAS SUFFIX. Diese Menge sieht nur, was
   * auf `Hintergrund` oder `Arbeiter` endet. Ein exportierter Starter mit einem
   * DRITTEN Suffix, der NIRGENDS eingehaengt wird, ist fuer alle Klauseln
   * unsichtbar: (IIa) findet ihn nicht, und (IIb) zaehlt nur, was ohnehin schon
   * im Rumpf steht. Gemessen am 2026-08-26 (Fix-Runde 1 zu G3): ein
   * `export function starteRadioTimer(): void {}` in
   * `src/app/m/radio/_lib/boot.ts`, NICHT eingehaengt, laesst alle Faelle gruen.
   *
   * ⛔ UND WARUM DIE VERENGUNG TROTZDEM BLEIBT — auch das gemessen, nicht
   * angenommen. Die naheliegende Weitung „alles, was mit `starte` beginnt"
   * waere heute gruen (ueber die drei `_lib/boot.ts` ist `starteFilesHintergrund`
   * der EINZIGE exportierte `starte*`-Name), aber sie stuende einen `export` weit
   * von rot BY CONSTRUCTION: `starteAufraeumTimer`
   * (`src/app/m/files/_lib/boot.ts:173`) liegt in einer GESCANNTEN Datei und wird
   * NICHT aus `startBackgroundWork()` gerufen, sondern aus `starteFilesHintergrund`
   * (`:140`). Heute rettet uns allein, dass sie nicht exportiert ist — also
   * dieselbe Falle, wegen der schon der Gegenvorschlag `_lib/<datei>.ts` oben
   * verworfen wurde. Wer die Konvention um ein Suffix erweitert, weitet ZUERST
   * diesen Filter und probt ihn mit einer nicht eingehaengten Funktion.
   */
  const hintergrundStarter = exportierteFunktionen.filter(
    (name) =>
      name.startsWith("starte") && (name.endsWith("Hintergrund") || name.endsWith("Arbeiter")),
  );

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

  /**
   * Der Rumpf von `startBackgroundWork()`, wieder nur die wirksamen Zeilen.
   *
   * Der Anker ist bewusst `function startBackgroundWork(` und nicht die volle
   * Signatur: ein spaeter ergaenztes `async` oder ein geaenderter Rueckgabetyp
   * liesse `indexOf` sonst `-1` liefern, und `slice(-1, …)` gaebe einen
   * Restschwanz der Datei — beide Klauseln darunter waeren still leer-gruen.
   * Deshalb wirft die Suche, statt still weiterzulaufen (dieselbe Form wie im
   * `errorsBlock` darueber).
   */
  const hintergrundRumpf = (() => {
    const von = QUELLE.indexOf("function startBackgroundWork(");
    if (von === -1) throw new Error("function startBackgroundWork( ... nicht gefunden");
    const auf = QUELLE.indexOf("{", von);
    const zu = QUELLE.indexOf("\n}", auf);
    if (auf === -1 || zu === -1) throw new Error("Rumpf von startBackgroundWork() nicht gefunden");
    return QUELLE.slice(auf, zu)
      .split("\n")
      .filter((zeile) => !zeile.trim().startsWith("//"))
      .join("\n");
  })();

  /** Klausel (IIb), rueckwaerts: jeder `starte…(`-Aufruf IM Rumpf. Heute zwei. */
  const starterAufrufe = [...hintergrundRumpf.matchAll(/\b(starte[A-Za-z0-9_]*)\s*\(/g)].map(
    (treffer) => treffer[1],
  );

  /** Die Namen aus den benannten Importen von `bootstrap.ts` (`:1-16`). */
  const importierteNamen = [...QUELLE.matchAll(/^import\s*\{([^}]*)\}\s*from/gm)].flatMap(
    (treffer) => treffer[1].split(",").map((teil) => teil.trim()),
  );

  it("jeder Modul-Boot-Haken kommt in bootstrap.ts ueberhaupt vor", () => {
    // ⚠️ DIESER FALL HAT KEINE EIGENE TRENNSCHAERFE, und der Name sagt es jetzt:
    // geprueft wird `QUELLE`, also die ganze Datei, nicht `assertHostConfig()`.
    // Weil `errorsBlock` ein Ausschnitt von `QUELLE` ist, gilt „Fall unten gruen
    // ⟹ dieser Fall gruen" — er kann nie ALLEIN fehlschlagen. Er bleibt, weil er
    // bei einem GANZ fehlenden Haken die lesbarere Meldung liefert; die
    // eigentliche Zusage traegt der Fall darunter. (Der alte Name behauptete
    // „ist in assertHostConfig eingehaengt" und pruefte das nicht.)
    for (const haken of bootHaken) {
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
    // ⚠️ Der Filter dahinter kennt nur die Zeilenform `//`; die Blockform faengt
    // der letzte Fall dieses Blocks, nicht dieser hier.
    for (const haken of bootHaken) {
      expect(errorsBlock, `${haken}: kein wirksames "...(await ${haken}())" im errors-Array`)
        .toContain(`...(await ${haken}())`);
    }
  });

  it("die Zahl der Boot-Haken steht EXAKT auf dem Stand dieses Planteils", () => {
    /*
     * ⛔ DIE LEER-GRUEN-PROBE. Eine Ableitung, die auf NULL Dateien laeuft —
     * falscher Glob, geaenderte Endung, verschobenes Verzeichnis — liefert eine
     * leere Menge, und beide Faelle darueber sind dann gruen, ohne irgendetwas
     * zu bewachen. Diese Zahl ist das Einzige, was das faengt.
     *
     * Der Stand am 2026-08-26, selbst nachgezaehlt und nicht aus dem Plan
     * abgeschrieben: `filesBootFehler` (`src/app/m/files/_lib/boot.ts:82`),
     * `lagerbuchBootFehler` (`src/app/m/lagerbuch/_lib/boot.ts:42`),
     * `radioBootFehler` (`src/app/m/radio/_lib/boot.ts:226`).
     *
     * ⛔ `toBe`, nie `toBeGreaterThanOrEqual`. Woertlich, und nur so weit reicht
     * das Zitat: „ein Waechter, der `>= 5` statt `= 6` prueft, bleibt gruen"
     * (`src/app/m/radio/riegel.test.ts:99-100`). Der Halbsatz „und bewacht
     * nichts" steht dort nicht in der Klammer, sondern im UMGEBENDEN Satz
     * (`:98-99`, im Original in Versalien: eine Klausel ohne Untergrenze ueber
     * einer leeren Menge sei leer-gruen und bewache nichts) — hier getrennt und
     * ohne Anfuehrungszeichen, damit nichts eine Woertlichkeit behauptet, die
     * nicht besteht.
     */
    expect(bootHaken.length).toBe(3);
  });

  it("jeder Hintergrundstarter aus einer _lib/boot.ts ist in startBackgroundWork eingehaengt", () => {
    // Der Testname sagt „aus einer `_lib/boot.ts`" und behauptet damit
    // ausdruecklich KEINE Vollzaehligkeit ueber alle Starter der Suite — die
    // Begruendung steht bei `hintergrundStarter` oben.
    for (const starter of hintergrundStarter) {
      expect(
        hintergrundRumpf,
        `${starter}: kein wirksamer Aufruf im Rumpf von startBackgroundWork()`,
      ).toContain(`${starter}()`);
    }
  });

  it("die Zahl dieser Hintergrundstarter steht EXAKT auf dem Stand dieses Planteils", () => {
    /*
     * Heute EINS: `starteFilesHintergrund` (`src/app/m/files/_lib/boot.ts:113`).
     *
     * ⛔ DASS `radio` HIER NOCH FEHLT, IST KEIN FEHLER: `starteRadioHintergrund()`
     * entsteht erst in Aufgabe G4 dieses Planteils. Der Waechter ist ab jetzt
     * scharf — G4 kann seine Funktion nicht mehr bauen, ohne sie einzuhaengen.
     * ⛔ EIGENTUEMER DIESER ZAHL IST G4: sie geht im selben Commit auf `2`,
     * zusammen mit der `3` im Fall darunter. Wird sie rot, wird sie ANGEHOBEN,
     * nicht geloescht.
     */
    expect(hintergrundStarter.length).toBe(1);
  });

  it("jeder starte-Aufruf in startBackgroundWork hat einen Import, und es sind genau so viele", () => {
    /*
     * ⛔ DIE RUECKWAERTSRICHTUNG, KLAUSEL (IIb) — und sie ist die einzige Zeile
     * dieses Blocks, die `starteAufgabenScanArbeiter` ueberhaupt SIEHT
     * (`src/app/m/aufgaben/_lib/scan.ts:324`, importiert
     * `src/core/bootstrap.ts:16`, gerufen `:138`; Datei 145 Zeilen). Der Glob
     * aus Spec §7.3.7 findet sie strukturell nicht — siehe `hintergrundStarter`.
     *
     * Sie faengt ausserdem einen GELOESCHTEN Aufruf, den Klausel (IIa) nach dem
     * Loeschen der zugehoerigen Datei ebenfalls nicht mehr faende: dort
     * schrumpfte die abgeleitete Menge lautlos mit.
     *
     * ⛔ EIGENTUEMER DER ZAHL IST G4: sie geht im selben Commit auf `3`.
     */
    for (const name of starterAufrufe) {
      expect(importierteNamen, `${name}: kein benannter Import in bootstrap.ts`).toContain(name);
    }
    expect(starterAufrufe.length).toBe(2);
  });

  it("kein Blockkommentar in den zwei gelesenen Ausschnitten, denn der Filter kennt nur //", () => {
    /*
     * ⛔ DIE LUECKE DES ZEILENFILTERS — ZUGESICHERT WEG STATT BESCHRIEBEN.
     * `errorsBlock` und `hintergrundRumpf` schneiden Kommentare ueber
     * `zeile.trim().startsWith("//")`. Der Schnitt kennt damit NUR die
     * Zeilenform. Ein Aufruf, der mit den zwei Block-Marken stillgelegt wird,
     * ueberlebt ihn: die Zeichenkette steht weiter im Ausschnitt, die Klauseln
     * (I), (IIa) und (IIb) finden sie und melden GRUEN, obwohl der Aufruf
     * wirkungslos ist. Gemessen am 2026-08-26 (Fix-Runde 1 zu G3), zweimal
     * 23/23 gruen: `src/core/bootstrap.ts:103` und `:138` je als Blockkommentar.
     *
     * ⛔ WARUM NICHT DER SCHNITT ERWEITERT WIRD: der Auftrag laesst hier
     * ausdruecklich den einfachen Zeilenfilter (siehe Kopfkommentar (a)/(b)),
     * und ein selbst gebauter Kommentarschnitt in einem KERN-Test waere genau
     * der Nachbau, den `briefs/KOPF.md:203-215` verbietet — der geteilte
     * Baustein liegt in `src/app/m/radio/_lib/quelltextScan.ts` und darf von
     * hier nicht importiert werden. Diese Zusicherung loest es andersherum: der
     * Ausschnitt DARF ueberhaupt keinen Blockkommentar tragen. Wer einen
     * einfuegt, bekommt einen LAUTEN Fehlschlag statt eines stillen Durchlaufs
     * — die Richtung aus `quelltextScan.ts:55-59` („ein Scan darf
     * falsch-positiv sein und laut, nie falsch-negativ und still").
     *
     * ⛔ UND ER IST NICHT LEER-GRUEN. Beide Ausschnitte kommen aus `QUELLE`
     * (`src/core/bootstrap.ts`, unmittelbar gelesen) und ihre Anker WERFEN,
     * wenn sie nicht treffen. Ein falscher Glob — die Mutation, die die Mengen
     * oben leert — laesst sie unberuehrt.
     *
     * ⬜ BENANNTE GRENZE: geprueft werden die zwei AUSSCHNITTE, nicht die ganze
     * Datei. Ein Blockkommentar ausserhalb von `const errors = [ … ];` und
     * ausserhalb des Rumpfs von `startBackgroundWork()` bleibt erlaubt — dort
     * steht heute die Mehrzahl der Kommentare dieser Datei, etwa der JSDoc-Kopf
     * auf `src/core/bootstrap.ts:125-133`.
     */
    const ausschnitte = [
      ["errors-Array in assertHostConfig()", errorsBlock],
      ["Rumpf von startBackgroundWork()", hintergrundRumpf],
    ] as const;
    for (const [wo, ausschnitt] of ausschnitte) {
      for (const marke of ["/" + "*", "*" + "/"]) {
        expect(
          ausschnitt,
          `${wo}: Blockkommentar-Marke ${marke} gefunden — der Zeilenfilter dieses Blocks kennt sie nicht, ein so stillgelegter Aufruf wuerde still als wirksam durchgehen`,
        ).not.toContain(marke);
      }
    }
  });

  /*
   * ⛔ WAS DIESER BLOCK BEWUSST NICHT FAENGT, damit es niemand fuer eine Luecke
   * haelt: eine UMBENENNUNG INNERHALB DER NAMENSKONVENTION. Heisst
   * `radioBootFehler` morgen `funkBootFehler` und wird die Einhaengung in
   * `src/core/bootstrap.ts` mitgezogen, bleiben alle 23 Faelle dieser Datei gruen
   * — gemessen am 2026-08-26, nicht angenommen. Das ist Absicht: der Waechter
   * prueft die KOPPLUNG zwischen Export und Einhaengung, nicht die Namenswahl.
   *
   * ⚠️ DIE GRENZE DIESER AUSSAGE IST ENGER, ALS SIE KLINGT, und auch das ist
   * gemessen: verlaesst die Umbenennung das Suffix `BootFehler` (Probe
   * `radioBootFehler` -> `radioStartFehler`, Einhaengung mitgezogen), schrumpft
   * die abgeleitete Menge auf zwei und `die Zahl der Boot-Haken …` wird ROT. Fuer
   * diesen Waechter waere der Haken dann kein Boot-Haken mehr. Wer so umbenennt,
   * entscheidet ueber die Konvention und zieht die Zahl bewusst nach.
   *
   * Eine Umbenennung OHNE mitgezogene Einhaengung faengt er dagegen sofort
   * (gemessen: die ersten beiden Faelle oben rot).
   */
});
