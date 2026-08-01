import { describe, it, expect } from "vitest";
import { readFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import konfigImport from "../../../../../playwright.config";
import { AV_MODUS_DATEI, AV_MODI, setzeAvModus } from "../../../../../e2e/helpers/avModus";
import { ZAHL_NAMEN, grenzenFehler } from "./grenzen";
import { validateFilesHosts } from "./hostRolle";

/**
 * Der Aufbau, ohne den das Modul LOKAL unbenutzbar ist — und zwar still: es
 * gibt keinen fail-open-Schalter (Spec §6.3), also erreicht ohne antwortenden
 * Scanner keine Datei je `clean`, und ohne ZWEI `files`-Hosts ist die
 * Rollentrennung (§3.4, Analyse-Falle 17) lokal gar nicht darstellbar.
 *
 * WARUM DAS EIN QUELLTEXT-/KONFIGURATIONS-SCAN IST und kein Verhaltenstest:
 * die Wirkung zeigen erst die E2E-Tests der Wellen 4–8. Bis dahin waere ein
 * fehlender Wert eine Zeile, die niemandem auffaellt — und in Welle 6a fiele
 * sie zusammen mit ganz anderen Aenderungen auf.
 *
 * Gelesen wird `playwright.config.ts` als MODUL, nicht als Text: nur so ist
 * `webServer[i].env` ein Objekt, dessen Schluessel man AUFZAEHLEN kann. Eine
 * Regex ueber den Quelltext koennte „traegt jeden Namen der Liste" nicht
 * ehrlich pruefen. `.env.example` ist dagegen keine ausfuehrbare Datei und wird
 * deshalb als Text gelesen.
 */

const WURZEL = path.resolve(__dirname, "../../../../..");

/**
 * DIE LISTE ZAEHLT AUF, SIE ZAEHLT NICHT AB (Plan T14). Die E2E-Tabelle in
 * Spec §9.3 hat ZEHN Zeilen, aber ELF Variablen — `FILES_AV_HOST` und
 * `FILES_AV_PORT` teilen eine Zeile. Ein Scan gegen „zehn" ist um eins daneben
 * und laesst entweder Host oder Port durch.
 *
 * Die Werte stehen hier als Zahlen und nicht als „klein": jeder Wert unter
 * `FILES_CHUNK_BYTES` (4-MiB-KONSTANTE) braecht den Boot des E2E-Servers ab,
 * bevor ein Test laeuft (Boot-Pruefung 2), und §11.5 verlangt eine Datei ueber
 * 10 MiB.
 */
const E2E_WERTE = {
  FILES_MAX_DATEI_BYTES: "12582912",
  FILES_AV_MAX_BYTES: "12582912",
  FILES_MAX_ABLAUF_TAGE: "7",
  FILES_AV_HOST: "127.0.0.1",
  FILES_AV_PORT: "3310",
  FILES_AV_TIMEOUT_MS: "2000",
  FILES_AV_VERSUCHE: "2",
  FILES_AV_WIEDERHOLUNG_SEKUNDEN: "1",
  FILES_AV_PARALLEL: "1",
  FILES_LOESCH_KARENZ_STUNDEN: "0",
  FILES_AUFRAEUMEN_TAKT_MINUTEN: "60",
} as const;

/** Der woertliche Wert aus Spec §3.4 — Index 0 ist `files.localtest.me`. */
const HOSTS = "files.localtest.me,drop.localtest.me";

/** Der Fake-clamd lauscht auf diesem Port; Playwright wartet darauf. */
const FAKE_PORT = 3310;

interface EintragSicht {
  readonly command: string;
  readonly port?: number;
  readonly url?: string;
  readonly reuseExistingServer?: boolean;
  readonly env?: Record<string, string>;
}

function eintraege(): EintragSicht[] {
  const ws = konfigImport.webServer;
  // Playwright typisiert `webServer` als Einzelobjekt ODER Array. Die Narrowing
  // muss echt sein, sonst ist der Index unten ein Typfehler — und ein
  // stillschweigendes `as` wuerde genau die Aussage „ist ein Array" verlieren,
  // die dieser Test halten soll.
  if (!Array.isArray(ws)) {
    throw new Error("playwright.config.ts: webServer ist kein Array");
  }
  return ws as EintragSicht[];
}

function suche(teil: string): EintragSicht {
  const treffer = eintraege().filter((e) => e.command.includes(teil));
  expect(treffer, `genau ein webServer-Eintrag mit "${teil}"`).toHaveLength(1);
  return treffer[0];
}

const envBeispiel = readFileSync(path.join(WURZEL, ".env.example"), "utf8");
const envZeilen = envBeispiel.split("\n").map((z) => z.trim());

describe("playwright.config.ts — zwei files-Hosts, echte Zahlen, Fake-Scanner", () => {
  it("fuehrt webServer als Array mit einem Fake-clamd- und einem next-dev-Eintrag", () => {
    expect(Array.isArray(konfigImport.webServer)).toBe(true);
    expect(eintraege()).toHaveLength(2);
    // Der Fake steht VORNE (Spec §6.8: „startet vor `next dev`").
    expect(eintraege()[0].command).toContain("scripts/fake-clamd.mjs");
  });

  it("wartet auf den Fake mit `port`, NICHT mit `url`", () => {
    const fake = suche("scripts/fake-clamd.mjs");
    // Playwrights `url`-Probe schickt eine HTTP-Anfrage; ein roher
    // clamd-Socket antwortet darauf nicht — der Lauf hinge beim Start, statt
    // laut zu scheitern.
    expect(fake.port).toBe(FAKE_PORT);
    expect(fake.url).toBeUndefined();
  });

  it("setzt SUITE_HOST_FILES auf zwei Hosts, Index 0 woertlich files.localtest.me", () => {
    const next = suche("next dev");
    expect(next.env?.SUITE_HOST_FILES).toBe(HOSTS);
    const liste = (next.env?.SUITE_HOST_FILES ?? "").split(",");
    expect(liste).toHaveLength(2);
    // Index 0 muss der Dev-Zweig von `moduleUrl` (`<key>.localtest.me`) sein,
    // sonst zeigt der App-Switcher lokal auf einen Host, der die Rolle
    // `verwaltung` nicht traegt — die naechste Ausprägung von Falle 17.
    expect(liste[0]).toBe("files.localtest.me");
    expect(liste[1]).not.toBe(liste[0]);
  });

  it("traegt JEDEN Namen der verbindlichen Liste mit seinem Wert", () => {
    // Guard gegen ein Abschmelzen DIESER Tabelle: elf, nicht zehn.
    expect(Object.keys(E2E_WERTE)).toHaveLength(11);
    const next = suche("next dev");
    for (const [name, wert] of Object.entries(E2E_WERTE)) {
      expect(next.env, `webServer.env kennt ${name}`).toHaveProperty(name);
      expect(next.env?.[name], `${name} in webServer.env`).toBe(wert);
    }
  });

  it("benennt in der Liste nur Variablen, die `_lib/grenzen.ts` wirklich kennt", () => {
    // Ohne diese Gegenprobe waere ein Tippfehler im Namen selbstkonsistent:
    // Testtabelle und Konfiguration truegen denselben falschen Namen, und das
    // Modul lieffe still auf der Vorbelegung.
    for (const name of Object.keys(E2E_WERTE)) {
      // `FILES_AV_HOST` ist keine ZAHL, sondern ein Hostname — er steht
      // deshalb nicht in `ZAHL_NAMEN` und wird hier ausgenommen.
      if (name === "FILES_AV_HOST") continue;
      expect(ZAHL_NAMEN, `${name} ist eine bekannte Grenze`).toContain(name);
    }
  });

  it("liefert mit genau diesem env-Objekt WEDER einen Grenzen- noch einen Hostfehler", () => {
    // Die tragende, nicht-tautologische Zusage: die Zahlen sind nicht nur da,
    // sie halten auch die Boot-Pruefungen 1–5 aus §9.4 — geprueft gegen NUR
    // das env des Eintrags, also ohne Hilfe aus `process.env`.
    const next = suche("next dev");
    expect(grenzenFehler(next.env)).toEqual([]);
    expect(validateFilesHosts(next.env)).toEqual([]);
  });
});

describe("Der AV-Modus ist in E2E umschaltbar — ein Pfad, zwei Prozesse", () => {
  it("setzt FAKE_CLAMD_MODUS_DATEI in BEIDEN Eintraegen auf denselben Pfad", () => {
    const fake = suche("scripts/fake-clamd.mjs");
    const next = suche("next dev");
    // Der Fake LIEST die Datei, der Helfer SCHREIBT sie. Weichen die Pfade ab,
    // schreibt der Test ins Leere und der Lauf ist rennabhaengig gruen.
    expect(fake.env?.FAKE_CLAMD_MODUS_DATEI).toBe(AV_MODUS_DATEI);
    expect(next.env?.FAKE_CLAMD_MODUS_DATEI).toBe(AV_MODUS_DATEI);
  });

  it("legt die Modusdatei AUSSERHALB des geloeschten E2E-Datenverzeichnisses ab", () => {
    const next = suche("next dev");
    // Beide Haelften gehoeren zusammen: der next-Eintrag loescht `./.data/e2e`
    // bei jedem Start. Laege die Modusdatei darin, verschwaende sie mitten im
    // Lauf — und der Fake faellt dann auf seinen Startwert zurueck.
    expect(next.command).toContain("rm -rf ./.data/e2e");
    expect(AV_MODUS_DATEI.startsWith("./.data/e2e")).toBe(false);
  });

  it("raeumt eine Modusdatei aus einem FRUEHEREN Lauf ab und startet auf `ok`", () => {
    const fake = suche("scripts/fake-clamd.mjs");
    // Die Modusdatei schlaegt `FAKE_CLAMD_MODUS`: ein `error` aus dem letzten
    // Lauf machte den naechsten stillschweigend zu einem fail-closed-Lauf.
    expect(fake.command).toContain(`rm -f ${AV_MODUS_DATEI}`);
    expect(fake.env?.FAKE_CLAMD_MODUS).toBe("ok");
  });

  it("darf keinen bestehenden Fake wiederverwenden", () => {
    const fake = suche("scripts/fake-clamd.mjs");
    // `true` griffe einen `pnpm dev:av` ab, der auf einer ANDEREN Modusdatei
    // laeuft — genau der rennabhaengig gruene Lauf.
    expect(fake.reuseExistingServer).toBe(false);
  });

  it("kennt genau die vier Modi, die `scripts/fake-clamd.mjs` kennt", () => {
    const quelle = readFileSync(path.join(WURZEL, "scripts/fake-clamd.mjs"), "utf8");
    const treffer = quelle.match(/const MODI = \[([^\]]*)\]/);
    expect(treffer, "MODI-Liste in scripts/fake-clamd.mjs").not.toBeNull();
    const desFakes = (treffer?.[1] ?? "")
      .split(",")
      .map((s) => s.trim().replace(/^["']|["']$/g, ""))
      .filter((s) => s !== "");
    // Ein Modus im Helfer, den der Fake nicht kennt, gilt dort als `error` —
    // der Test bekaeme fail-closed, wo er `found` bestellt hat.
    expect([...AV_MODI].sort()).toEqual([...desFakes].sort());
  });

  it("schreibt den Modus SYNCHRON — nach dem Aufruf steht er in der Datei", () => {
    const verzeichnis = mkdtempSync(path.join(tmpdir(), "avmodus-"));
    const datei = path.join(verzeichnis, "modus");
    try {
      // Ein `await`-freier Aufruf ist der Gegenstand: ein Playwright-Test
      // navigiert unmittelbar danach weiter, und ein noch fliegender Schreib
      // waere ein Rennen gegen den ersten Scan.
      setzeAvModus("error", datei);
      expect(readFileSync(datei, "utf8").trim()).toBe("error");
      setzeAvModus("found", datei);
      expect(readFileSync(datei, "utf8").trim()).toBe("found");
    } finally {
      rmSync(verzeichnis, { recursive: true, force: true });
    }
  });
});

describe(".env.example — die Dev-Zeilen und die Asymmetrie der beiden SUITE_*-Leerwerte", () => {
  it("traegt die kommentierte Dev-Zeile mit BEIDEN files-Hosts", () => {
    // Auf die WOERTLICHE Zeile geprueft und nicht per Schluessel-Parser: die
    // Datei fuehrt im Prod-Block bereits ein leeres `# SUITE_HOST_FILES=`, und
    // ein Parser griffe irgendeine der beiden.
    expect(envZeilen).toContain(`# SUITE_HOST_FILES=${HOSTS}`);
  });

  it("traegt jede der elf Dev-Zahlen als kommentierte Zeile mit demselben Wert wie E2E", () => {
    for (const [name, wert] of Object.entries(E2E_WERTE)) {
      expect(envZeilen, `.env.example fuehrt ${name}`).toContain(`# ${name}=${wert}`);
    }
  });

  it("erklaert im selben Kommentarblock, warum leer bei SUITE_ACCESS_GROUP_FILES abbricht und bei SUITE_HOST_FILES eine Aussage ist", () => {
    // Der Anker ist `SUITE_ACCESS_GROUP_FILES`: die Datei erklaert die
    // Asymmetrie heute schon fuer `SUITE_ACCESS_GROUP_FEEDBACK`, ein Scan auf
    // die allgemeine Formulierung waere also von Anfang an gruen und besaesse
    // nichts. Gefordert ist der Block, der BEIDE files-Variablen
    // gegenueberstellt — zwei `SUITE_*`-Variablen desselben Moduls mit
    // ENTGEGENGESETZTER Bedeutung des Leerwerts stehen nirgends sonst.
    const bloecke = envBeispiel
      .split(/\n(?!\s*#)/)
      .map((b) => b)
      .filter((b) => b.includes("SUITE_ACCESS_GROUP_FILES"));
    expect(bloecke.length, "ein Kommentarblock nennt SUITE_ACCESS_GROUP_FILES").toBeGreaterThan(0);
    const block = bloecke.find((b) => b.includes("SUITE_HOST_FILES"));
    expect(block, "derselbe Block stellt SUITE_HOST_FILES gegenueber").toBeDefined();
    expect(block).toMatch(/bricht den Boot ab/);
    expect(block).toMatch(/zurücknehmen|zurueckziehen|Cutover/);
  });
});
