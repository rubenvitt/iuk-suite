import { describe, it, expect, afterEach, vi } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import {
  modulEintraege,
  mischeEintraege,
  launcherEintraege,
  ABSCHNITT_APPS,
} from "@/core/shell/launcherEintraege";
import type { LauncherEintrag } from "@/core/shell/types";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

function eintrag(teil: Partial<LauncherEintrag>): LauncherEintrag {
  return { key: "x", title: "X", href: "/", abschnitt: "A", extern: false, ...teil };
}

/*
 * Gemockt wird EINE Ebene UNTER `dienstEintraege` (`_lib/services`, nicht
 * `_lib/launcher`) — mit Absicht: `dienstEintraege` trägt seit Befund 1 selbst
 * das `try`/`catch`, das diesen Test rechtfertigt. Ein Mock von
 * `_lib/launcher` ersetzte die ganze Datei samt Fang; die echte Funktion liefe
 * dann nie, und der Test bewiese nichts über sie. So bleibt `dienstEintraege`
 * echt, nur ihr Aufruf in die Datenbank schlägt fehl — genau der Pfad, den
 * Befund 1 beschreibt (`getVisibleServicesForUser` → `getDb()`).
 */
vi.mock("@/app/m/portal/_lib/services", () => ({
  getVisibleServicesForUser: vi.fn(() => Promise.reject(new Error("SQLITE_BUSY"))),
}));

describe("modulEintraege", () => {
  it("verlinkt in Dev nur die für den Nutzer sichtbaren Module über *.localtest.me", () => {
    vi.stubEnv("PORT", "3000");
    const groups = ["da-feedback-gl", "iuk-files-admin", "lagerbuch_nutzer"];
    expect(modulEintraege(groups).map((e) => e.key)).toEqual([
      "portal",
      "qr",
      "feedback",
      "files",
      "lagerbuch",
      "radio",
      "gamma",
      "zeichen",
    ]);
    const gamma = modulEintraege(groups).find((e) => e.key === "gamma");
    expect(gamma?.href).toBe("http://gamma.localtest.me:3000");
  });

  it("lässt in Prod Module ohne eigene Domain weg", () => {
    vi.stubEnv("NODE_ENV", "production");
    const eintraege = modulEintraege([]);
    expect(eintraege.map((e) => e.key)).toEqual(["portal"]);
    expect(eintraege[0].href).toBe("https://iuk-ue.de");
  });

  it("filtert weiterhin auf die Gruppen der Session", () => {
    expect(modulEintraege(["alpha-users"]).map((e) => e.key)).toContain("alpha");
    expect(modulEintraege(null).map((e) => e.key)).toEqual(["qr", "radio"]);
  });

  it("steckt alle Module in denselben Abschnitt und trägt ihren Icon-Namen", () => {
    vi.stubEnv("PORT", "3000");
    const portal = modulEintraege([]).find((e) => e.key === "portal");
    expect(portal?.abschnitt).toBe(ABSCHNITT_APPS);
    // Der NAME, nicht die Komponente: die Auflösung gehört in die Client-Insel
    // (`@ant-design/icons` in RSC ist HTTP 500, den kein Gate sieht).
    expect(portal?.icon).toBe("AppstoreOutlined");
    // Module bleiben im selben Tab — sie liegen zwar auf fremden Hosts, gehören
    // aber zur Suite.
    expect(portal?.extern).toBe(false);
  });
});

describe("mischeEintraege", () => {
  it("stellt die Apps voran und ordnet Dienste nach erstem Auftreten ihrer Kategorie", () => {
    // Nicht `module` genannt: eslint (`@next/next/no-assign-module-variable`)
    // verbietet die Zuweisung an diesen Namen, weil er im CJS-Modulscope
    // bereits belegt ist.
    const apps = [eintrag({ key: "portal", abschnitt: ABSCHNITT_APPS })];
    const dienste = [
      eintrag({ key: "dienst:1", abschnitt: "Zusammenarbeit" }),
      eintrag({ key: "dienst:2", abschnitt: "Verwaltung" }),
      eintrag({ key: "dienst:3", abschnitt: "Zusammenarbeit" }),
    ];
    expect(mischeEintraege(apps, dienste).map((e) => e.key)).toEqual([
      "portal",
      "dienst:1",
      "dienst:3",
      "dienst:2",
    ]);
  });

  it("lässt den Apps-Abschnitt weg, wenn keine Module sichtbar sind", () => {
    const dienste = [eintrag({ key: "dienst:1", abschnitt: "Zusammenarbeit" })];
    expect(mischeEintraege([], dienste).map((e) => e.key)).toEqual(["dienst:1"]);
  });

  it("liefert eine leere Liste, wenn beide Quellen leer sind", () => {
    expect(mischeEintraege([], [])).toEqual([]);
  });
});

/*
 * BEFUND 1: EIN FEHLER DER PORTAL-DATENBANK REISST NICHT DIE GANZE SUITE MIT.
 * `launcherEintraege()` läuft über `SuiteHeader` auf jeder Seite jedes
 * angemeldeten Moduls; ein `SQLITE_BUSY` im Portal darf deshalb höchstens das
 * Portal treffen, nicht lagerbuch, files, feedback, qr oder gamma.
 */
describe("launcherEintraege — Fehlergrenze zum Portal", () => {
  it("fällt bei einer werfenden Dienste-Abfrage auf die Modul-Einträge zurück, statt zu werfen", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.spyOn(console, "error").mockImplementation(() => {});

    await expect(launcherEintraege([])).resolves.toEqual(modulEintraege([]));
  });
});

/*
 * Der Riegel an der Schichtgrenze. `docs/design/README.md`: Modul-Interna sind
 * kein API. Genau EIN Import aus dem Portal ist verabredet — die
 * Launcher-Funktion. Ohne diesen Scan wächst der zweite lautlos nach, und
 * `core` hätte danach das Portal-Schema im Blick.
 *
 * Der Scan fängt die naheliegende Verdrahtung, nicht jede denkbare: ein
 * umbenanntes Re-Export käme durch. Dieselbe eingestandene Grenze wie beim
 * Seed-Scan in `scripts/seed-lokal.test.ts` — und besser als nichts.
 *
 * `readdirSync` läuft mit `{ recursive: true }`: eine Datei unter einem
 * künftigen `src/core/shell/<unterverzeichnis>/` bliebe dem Scanner sonst
 * unsichtbar — derselbe blinde Fleck wie beim umbenannten Re-Export, nur ohne
 * dass die Klausel oben ihn nannte. Die zurückgegebenen Pfade sind relativ zu
 * `verzeichnis` (z. B. `unterverzeichnis/datei.tsx`), `join` darunter bleibt
 * deshalb unverändert korrekt.
 */
describe("Grenze zwischen core/shell und dem Modul portal", () => {
  it("importiert aus dem Portal ausschließlich _lib/launcher", () => {
    const verzeichnis = "src/core/shell";
    const dateien = readdirSync(verzeichnis, { recursive: true, encoding: "utf8" }).filter((d) =>
      /\.tsx?$/.test(d),
    );
    expect(dateien.length).toBeGreaterThan(0);

    for (const datei of dateien) {
      const quelle = readFileSync(join(verzeichnis, datei), "utf8");
      const treffer = [...quelle.matchAll(/from\s+"@\/app\/m\/portal\/([^"]+)"/g)];
      for (const [, pfad] of treffer) {
        expect(
          pfad,
          `${datei} importiert @/app/m/portal/${pfad} — erlaubt ist nur _lib/launcher`,
        ).toBe("_lib/launcher");
      }
    }
  });
});
