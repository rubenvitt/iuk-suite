import { readdirSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";

import {
  CLOUD_CHROMIUM,
  LOOPBACK_DNS,
  LOOPBACK_IM_BROWSER,
  OHNE_PROXY,
  cloudHeadlessShell,
  cloudTauglich,
  cloudTauglichUse,
  istCloudSession,
  loopbackDnsEinrichten,
  mitPreload,
} from "../e2e/helpers/cloud";

const nichts = () => {};

/**
 * PLAYWRIGHT IN DER CLOUD-SESSION (DRK-473). Die Wirkung sieht nur ein echter
 * Lauf dort; hier steht, was sich ohne ihn beweisen lässt: wann der Helfer
 * greift, dass er nichts Vorhandenes verdrängt, und dass alle drei Profile
 * und jedes `test.use` mit eigenen Startoptionen durch ihn gehen — ein
 * vergessenes wäre in der Cloud still rot.
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

describe("cloudHeadlessShell", () => {
  it("findet die Shell der neuesten vorinstallierten Revision", () => {
    const liste = () => ["chromium-1194", "chromium_headless_shell-1194", "chromium_headless_shell-1200", "ffmpeg-1011"];
    expect(cloudHeadlessShell(liste, () => true)).toBe(
      "/opt/pw-browsers/chromium_headless_shell-1200/chrome-linux/headless_shell",
    );
  });

  it("kennt auch das neuere Verzeichnislayout", () => {
    const liste = () => ["chromium_headless_shell-1243"];
    const gibtEs = (pfad: string) => pfad.endsWith("chrome-headless-shell-linux64/chrome-headless-shell");
    expect(cloudHeadlessShell(liste, gibtEs)).toBe(
      "/opt/pw-browsers/chromium_headless_shell-1243/chrome-headless-shell-linux64/chrome-headless-shell",
    );
  });

  it("gibt undefined, wenn keine Shell vorinstalliert ist", () => {
    expect(cloudHeadlessShell(() => ["chromium-1194"], () => true)).toBeUndefined();
    expect(cloudHeadlessShell(() => ["chromium_headless_shell-1194"], () => false)).toBeUndefined();
  });
});

describe("cloudTauglich", () => {
  const SHELL = "/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell";

  it("lässt die Konfiguration außerhalb der Cloud unangetastet", () => {
    const config = { testDir: "./e2e", use: { baseURL: "http://x" } };
    expect(cloudTauglich(config, false)).toBe(config);
  });

  it("nimmt wie die CI die Headless-Shell und verzichtet auf den Proxy (DRK-489)", () => {
    const aus = cloudTauglich({ testDir: "./e2e" }, true, () => SHELL, nichts);
    expect(aus.use?.launchOptions).toEqual({ executablePath: SHELL, args: [OHNE_PROXY, LOOPBACK_IM_BROWSER] });
  });

  it("nimmt den vollen Chromium für channel: chromium, wie Playwright selbst", () => {
    const aus = cloudTauglich({ use: { channel: "chromium" } }, true, () => SHELL, nichts);
    expect(aus.use?.launchOptions?.executablePath).toBe(CLOUD_CHROMIUM);
  });

  it("fällt ohne vorinstallierte Shell auf den vollen Chromium zurück", () => {
    const aus = cloudTauglich({ testDir: "./e2e" }, true, () => undefined, nichts);
    expect(aus.use?.launchOptions?.executablePath).toBe(CLOUD_CHROMIUM);
  });

  it("behält vorhandene use-Werte und Startargumente", () => {
    const aus = cloudTauglich(
      { use: { baseURL: "http://x", channel: "chromium", launchOptions: { args: ["--a"], slowMo: 5 } } },
      true,
      () => SHELL,
      nichts,
    );
    expect(aus.use).toMatchObject({ baseURL: "http://x", channel: "chromium" });
    expect(aus.use?.launchOptions).toEqual({ slowMo: 5, executablePath: CLOUD_CHROMIUM, args: ["--a", OHNE_PROXY, LOOPBACK_IM_BROWSER] });
  });
});

describe("Namensauflösung *.localtest.me (IDA-374)", () => {
  it("richtet sie nur in der Cloud ein", () => {
    const aufloesen = vi.fn();
    cloudTauglich({ testDir: "./e2e" }, false, () => undefined, aufloesen);
    expect(aufloesen).not.toHaveBeenCalled();
    cloudTauglich({ testDir: "./e2e" }, true, () => undefined, aufloesen);
    expect(aufloesen).toHaveBeenCalledOnce();
  });

  it("lädt die Datei im Lauf und reicht sie an Kindprozesse weiter", () => {
    const env: Record<string, string | undefined> = { NODE_OPTIONS: "--max-old-space-size=8192" };
    const laden = vi.fn();
    loopbackDnsEinrichten(env, laden);
    loopbackDnsEinrichten(env, laden);
    expect(laden).toHaveBeenCalledWith(LOOPBACK_DNS);
    expect(env.NODE_OPTIONS).toBe(`--max-old-space-size=8192 --require ${LOOPBACK_DNS}`);
  });

  it("setzt Pfade mit Leerzeichen in Anführungszeichen", () => {
    expect(mitPreload(undefined, "/a b/x.cjs")).toBe('--require "/a b/x.cjs"');
  });

  it("biegt localtest.me auf Loopback und lässt andere Namen beim Resolver", async () => {
    const dns = await import("node:dns");
    // Der Spion steht für den echten Resolver; `mockRestore` nimmt die Umbiegung wieder heraus.
    const echt = vi.spyOn(dns.default, "lookup").mockImplementation(((_n: string, _o: unknown, rueckruf: (...a: unknown[]) => void) =>
      rueckruf(null, "192.0.2.1", 4)) as never);
    try {
      const geladen = createRequire(LOOPBACK_DNS)(LOOPBACK_DNS) as { istLoopbackName: (n: string) => boolean };
      expect(geladen.istLoopbackName("feedback.localtest.me")).toBe(true);
      expect(geladen.istLoopbackName("LOCALTEST.ME.")).toBe(true);
      expect(geladen.istLoopbackName("localtest.me.example.org")).toBe(false);

      const einzeln = await new Promise((fertig) =>
        dns.default.lookup("portal.localtest.me", (_f, adresse, familie) => fertig([adresse, familie])),
      );
      expect(einzeln).toEqual(["127.0.0.1", 4]);
      expect(await dns.promises.lookup("qr.localtest.me", { all: true })).toEqual([{ address: "127.0.0.1", family: 4 }]);
      expect(await dns.promises.lookup("qr.localtest.me", { family: 6 })).toEqual({ address: "::1", family: 6 });
      expect(echt).not.toHaveBeenCalled();

      dns.default.lookup("example.org", {}, () => {});
      expect(echt).toHaveBeenCalledWith("example.org", {}, expect.any(Function));
    } finally {
      echt.mockRestore();
    }
  });
});

describe("die Playwright-Profile", () => {
  it.each(["playwright.config.ts", "playwright.pwa.config.ts", "playwright.rueckmeldung.config.ts", "playwright.anleitung.config.ts"])(
    "%s geht durch cloudTauglich",
    (datei) => {
      const quelle = readFileSync(path.join(__dirname, "..", datei), "utf8");
      expect(quelle).toContain("export default cloudTauglich(defineConfig({");
    },
  );
});

describe("cloudTauglichUse (DRK-503)", () => {
  const SHELL = "/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell";

  it("lässt die Optionen außerhalb der Cloud unangetastet", () => {
    const use = { channel: "chromium", launchOptions: { args: ["--a"] } };
    expect(cloudTauglichUse(use, false)).toBe(use);
  });

  it("führt Spec-eigene Startoptionen mit dem Cloud-Browser zusammen", () => {
    const aus = cloudTauglichUse({ channel: "chromium", launchOptions: { args: ["--a"] } }, true, () => SHELL);
    expect(aus).toEqual({
      channel: "chromium",
      launchOptions: { executablePath: CLOUD_CHROMIUM, args: ["--a", OHNE_PROXY, LOOPBACK_IM_BROWSER] },
    });
  });
});

describe("Startoptionen im Spec", () => {
  const e2e = path.join(__dirname, "..", "e2e");
  const specs = readdirSync(e2e).filter((datei) => datei.endsWith(".spec.ts"));

  it.each(specs)("%s: test.use mit launchOptions oder channel geht durch cloudTauglichUse", (datei) => {
    const quelle = readFileSync(path.join(e2e, datei), "utf8");
    const aufrufe = [...quelle.matchAll(/test\.use\(([\s\S]*?)\);/g)].map((treffer) => treffer[1]);
    for (const aufruf of aufrufe.filter((a) => /launchOptions|channel/.test(a))) {
      expect(aufruf.trimStart()).toMatch(/^cloudTauglichUse\(/);
    }
  });
});
