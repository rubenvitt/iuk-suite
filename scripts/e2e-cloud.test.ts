import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { CLOUD_CHROMIUM, OHNE_PROXY, cloudTauglich, istCloudSession } from "../e2e/helpers/cloud";

/**
 * PLAYWRIGHT IN DER CLOUD-SESSION (DRK-473). Die Wirkung sieht nur ein echter
 * Lauf dort; hier steht, was sich ohne ihn beweisen lässt: wann der Helfer
 * greift, dass er nichts Vorhandenes verdrängt, und dass alle drei Profile
 * durch ihn gehen — ein vergessenes Profil wäre in der Cloud still rot.
 */

describe("istCloudSession", () => {
  const da = () => true;
  const weg = () => false;

  it("greift nur mit Cloud-Kennung UND vorinstalliertem Browser", () => {
    expect(istCloudSession({ CLAUDE_CODE_REMOTE: "true" }, da)).toBe(true);
    expect(istCloudSession({ CLAUDE_CODE_REMOTE: "true" }, weg)).toBe(false);
    expect(istCloudSession({}, da)).toBe(false);
    expect(istCloudSession({ CLAUDE_CODE_REMOTE: "false" }, da)).toBe(false);
  });
});

describe("cloudTauglich", () => {
  it("lässt die Konfiguration außerhalb der Cloud unangetastet", () => {
    const config = { testDir: "./e2e", use: { baseURL: "http://x" } };
    expect(cloudTauglich(config, false)).toBe(config);
  });

  it("setzt in der Cloud Browser und Proxy-Verzicht", () => {
    const aus = cloudTauglich({ testDir: "./e2e" }, true);
    expect(aus.use?.launchOptions).toEqual({ executablePath: CLOUD_CHROMIUM, args: [OHNE_PROXY] });
  });

  it("behält vorhandene use-Werte und Startargumente", () => {
    const aus = cloudTauglich(
      { use: { baseURL: "http://x", channel: "chromium", launchOptions: { args: ["--a"], slowMo: 5 } } },
      true,
    );
    expect(aus.use).toMatchObject({ baseURL: "http://x", channel: "chromium" });
    expect(aus.use?.launchOptions).toEqual({ slowMo: 5, executablePath: CLOUD_CHROMIUM, args: ["--a", OHNE_PROXY] });
  });
});

describe("die drei Playwright-Profile", () => {
  it.each(["playwright.config.ts", "playwright.pwa.config.ts", "playwright.rueckmeldung.config.ts"])(
    "%s geht durch cloudTauglich",
    (datei) => {
      const quelle = readFileSync(path.join(__dirname, "..", datei), "utf8");
      expect(quelle).toContain("export default cloudTauglich(defineConfig({");
    },
  );
});
