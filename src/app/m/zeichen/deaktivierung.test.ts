import { describe, expect, it } from "vitest";
import { canAccess, getModule, visibleSwitcherModules } from "@/core/registry";
import { decideRoute } from "@/core/routing";
import { baueAntwort } from "./sw.js/route";
import { ZEICHEN_SW_ABRAEUM_QUELLE } from "./_lib/sw-quelle";

describe("voruebergehende Sperre der taktischen Zeichen", () => {
  it.each([null, [], ["iuk-zeichen-admin", "iuk-admin"]])(
    "sperrt das Modul und entfernt den Einstieg fuer Gruppen %j",
    (groups) => {
      expect(canAccess(getModule("zeichen"), groups)).toBe(false);
      expect(visibleSwitcherModules(groups).map((m) => m.key)).not.toContain("zeichen");
      for (const pathname of ["/", "/katalog", "/offline", "/manifest.webmanifest", "/verwaltung/lernsets"]) {
        expect(decideRoute({ host: "zeichen.localtest.me", pathname, groups })).toEqual({
          action: "unavailable",
        });
      }
      for (const host of ["portal.localtest.me", "qr.localtest.me", "zeichen.localtest.me"]) {
        for (const pathname of ["/m/zeichen", "/m/zeichen/katalog", "/m/zeichen/api/merkliste"]) {
          expect(decideRoute({ host, pathname, groups })).toEqual({ action: "unavailable" });
        }
      }
    },
  );

  it("laesst nur den Worker-Updatepfad auch ohne Sitzung ins Modul", async () => {
    expect(decideRoute({ host: "zeichen.localtest.me", pathname: "/sw.js", groups: null })).toEqual({
      action: "rewrite", target: "/m/zeichen/sw.js", moduleKey: "zeichen",
    });
    expect(decideRoute({ host: "portal.localtest.me", pathname: "/m/zeichen/sw.js", groups: null })).toEqual({
      action: "next",
    });
    expect(await baueAntwort({ ZEICHEN_SW: "1" }).text()).toBe(ZEICHEN_SW_ABRAEUM_QUELLE);
  });

  it("laesst andere Module und die gemeinsame Anmeldung erreichbar", () => {
    expect(decideRoute({ host: "zeichen.localtest.me", pathname: "/m/qr", groups: null })).toEqual({
      action: "next",
    });
    expect(decideRoute({ host: "qr.localtest.me", pathname: "/", groups: null })).toEqual({
      action: "rewrite", target: "/m/qr", moduleKey: "qr",
    });
    expect(decideRoute({ host: "zeichen.localtest.me", pathname: "/api/auth/session", groups: null })).toEqual({
      action: "next",
    });
  });
});
