import { describe, it, expect, afterEach, vi } from "vitest";
import { switcherEntries } from "@/core/shell/switcherEntries";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("switcherEntries", () => {
  it("verlinkt in Dev alle sichtbaren Module über *.localtest.me", () => {
    vi.stubEnv("PORT", "3000");
    const keys = switcherEntries([]).map((e) => e.key);
    expect(keys).toEqual(["portal", "gamma"]);
    expect(switcherEntries([])[1].href).toBe("http://gamma.localtest.me:3000");
  });

  // Wegwerf-/Noch-nicht-ausgerollte Module haben keinen prodHost und fallen
  // damit in Prod aus dem Switcher, statt als toter Link zu erscheinen.
  it("lässt in Prod Module ohne eigene Domain weg", () => {
    vi.stubEnv("NODE_ENV", "production");
    const entries = switcherEntries([]);
    expect(entries.map((e) => e.key)).toEqual(["portal"]);
    expect(entries[0].href).toBe("https://iuk-ue.de");
  });

  it("filtert weiterhin auf die Gruppen der Session", () => {
    expect(switcherEntries(["alpha-users"]).map((e) => e.key)).toContain("alpha");
    expect(switcherEntries(null)).toEqual([]);
  });
});
