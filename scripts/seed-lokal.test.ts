import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { MODULE_MIGRATIONS } from "@/core/bootstrap";
import { SEED_MODULE, pruefeLokal, waehleModule } from "./seed-lokal";

describe("seed-lokal: Riegel gegen Produktion", () => {
  it("wirft bei NODE_ENV=production", () => {
    expect(() => pruefeLokal({ NODE_ENV: "production" } as NodeJS.ProcessEnv)).toThrow(
      /production/,
    );
  });

  it("läuft in development und in einer Testumgebung durch", () => {
    expect(() => pruefeLokal({ NODE_ENV: "development" } as NodeJS.ProcessEnv)).not.toThrow();
    expect(() => pruefeLokal({} as NodeJS.ProcessEnv)).not.toThrow();
  });
});

describe("seed-lokal: Modulauswahl", () => {
  it("ohne Argumente sind alle Module dran", () => {
    expect(waehleModule([])).toEqual(SEED_MODULE);
  });

  it("wählt genau die genannten Module", () => {
    expect(waehleModule(["lagerbuch", "qr"]).map((m) => m.key)).toEqual(["qr", "lagerbuch"]);
  });

  it("meldet einen Tippfehler, statt still nichts zu tun", () => {
    expect(() => waehleModule(["lagerbücher"])).toThrow(/Unbekannte Module/);
  });
});

/*
 * Die eigentliche Regressionssicherung. Beides sind Zusagen, die man beim
 * Nachziehen eines Moduls still bricht:
 */
describe("seed-lokal: Abgrenzung zum Boot-Pfad", () => {
  it("deckt jedes Modul mit eigener Datenbank ab", () => {
    // Sonst bekommt das nächste Modul mit `_db/` lautlos keine lokalen Daten,
    // und der Befund lautet später „die Seite ist leer", nicht „Seed fehlt".
    expect(SEED_MODULE.map((m) => m.key).sort()).toEqual(
      MODULE_MIGRATIONS.map((m) => m.key).sort(),
    );
  });

  it("hängt nicht am Boot — weder bootstrap noch instrumentation kennen ihn", () => {
    /*
     * Quelltext-Scan, weil die Wirkung erst zur Laufzeit eines echten Boots
     * einträte und dann zu spät wäre: `shouldSeed()` ist wahr bei
     * `SUITE_SEED=1`, und das ist der GENERALPROBEN-Schalter. Ein aus
     * Bequemlichkeit in `seedAllModules()` gehängter Aufruf legte damit
     * Demodaten in eine Generalprobe — beim Modul `files` samt gültigem
     * anonymen Abgabelink.
     */
    for (const datei of ["src/core/bootstrap.ts", "src/instrumentation.ts"]) {
      expect(readFileSync(datei, "utf8")).not.toMatch(/seedLokal|seed-lokal|seedeLokal/);
    }
  });
});
