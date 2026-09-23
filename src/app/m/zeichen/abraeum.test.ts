import { describe, it, expect } from "vitest";
import { GET } from "./sw.js/route";
import { decideRoute } from "@/core/routing";
import { validateHostConfig } from "@/core/hosts";
import { validateGroupConfig } from "@/core/groups";
import { MODULES, visibleSwitcherModules } from "@/core/registry";

/**
 * Der Abräum-Rest von `zeichen` (DRK-465). Die Produktions-`.env` trägt noch
 * SUITE_HOST_ZEICHEN und SUITE_ADMIN_GROUP_ZEICHEN; ohne Registry-Eintrag
 * brach das Image vom 2026-09-23 genau daran seinen Start ab.
 */
describe("zeichen: nur der Abräum-Worker bleibt", () => {
  const keys = MODULES.map((m) => m.key);
  const env = { SUITE_HOST_ZEICHEN: "zeichen.iuk-ue.de", SUITE_ADMIN_GROUP_ZEICHEN: "iuk-zeichen-admin" };

  it("die Produktions-Variablen bestehen die Boot-Prüfung", () => {
    expect(validateHostConfig(keys, env)).toEqual([]);
    expect(validateGroupConfig(keys, env)).toEqual([]);
  });

  it("/sw.js liefert auf dem Modul-Host den Abräum-Worker, auch ohne Sitzung", () => {
    expect(decideRoute({ host: "zeichen.localtest.me:3100", pathname: "/sw.js", groups: null }))
      .toEqual({ action: "rewrite", target: "/m/zeichen/sw.js", moduleKey: "zeichen" });
    expect(decideRoute({ host: "zeichen.localtest.me:3100", pathname: "/m/zeichen/sw.js", groups: null }))
      .toEqual({ action: "next" });
  });

  it.each(["/", "/katalog", "/offline", "/manifest.webmanifest", "/m/zeichen", "/m/zeichen/katalog"])(
    "%s ist weg (410), mit und ohne Sitzung",
    (pathname) => {
      expect(decideRoute({ host: "zeichen.localtest.me", pathname, groups: null })).toEqual({ action: "gone" });
      expect(decideRoute({ host: "zeichen.localtest.me", pathname, groups: ["admin"] })).toEqual({ action: "gone" });
    },
  );

  it("/m/zeichen/… ist auch vom Portal-Host aus weg", () => {
    expect(decideRoute({ host: "portal.localtest.me", pathname: "/m/zeichen/katalog", groups: [] }))
      .toEqual({ action: "gone" });
  });

  it("Health und Auth laufen auf dem Host weiter durch", () => {
    expect(decideRoute({ host: "zeichen.localtest.me", pathname: "/api/health/portal", groups: null }))
      .toEqual({ action: "next" });
  });

  it("taucht für niemanden im App-Umschalter auf", () => {
    expect(visibleSwitcherModules(["admin"]).map((m) => m.key)).not.toContain("zeichen");
    expect(visibleSwitcherModules(null).map((m) => m.key)).not.toContain("zeichen");
  });

  it("der Worker räumt ab, trägt sich aus und beantwortet nichts", async () => {
    const res = GET();
    expect(res.headers.get("content-type")).toBe("text/javascript; charset=utf-8");
    expect(res.headers.get("cache-control")).toBe("no-cache");
    const quelle = await res.text();
    expect(quelle).toContain("caches.delete");
    expect(quelle).toContain('indexedDB.deleteDatabase("zeichen-merkliste")');
    expect(quelle).toContain("self.registration.unregister()");
    expect(quelle).not.toMatch(/addEventListener\(\s*["']fetch/);
  });
});
