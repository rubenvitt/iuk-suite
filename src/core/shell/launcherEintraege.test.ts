import { describe, it, expect, afterEach, vi } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import {
  modulEintraege,
  mischeEintraege,
  ABSCHNITT_APPS,
} from "@/core/shell/launcherEintraege";
import type { LauncherEintrag } from "@/core/shell/types";

afterEach(() => {
  vi.unstubAllEnvs();
});

function eintrag(teil: Partial<LauncherEintrag>): LauncherEintrag {
  return { key: "x", title: "X", href: "/", abschnitt: "A", extern: false, ...teil };
}

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
      "gamma",
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
    expect(modulEintraege(null).map((e) => e.key)).toEqual(["qr"]);
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
 * Der Riegel an der Schichtgrenze. `docs/design/README.md`: Modul-Interna sind
 * kein API. Genau EIN Import aus dem Portal ist verabredet — die
 * Launcher-Funktion. Ohne diesen Scan wächst der zweite lautlos nach, und
 * `core` hätte danach das Portal-Schema im Blick.
 *
 * Der Scan fängt die naheliegende Verdrahtung, nicht jede denkbare: ein
 * umbenanntes Re-Export käme durch. Dieselbe eingestandene Grenze wie beim
 * Seed-Scan in `scripts/seed-lokal.test.ts` — und besser als nichts.
 */
describe("Grenze zwischen core/shell und dem Modul portal", () => {
  it("importiert aus dem Portal ausschließlich _lib/launcher", () => {
    const verzeichnis = "src/core/shell";
    const dateien = readdirSync(verzeichnis).filter((d) => /\.tsx?$/.test(d));
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
