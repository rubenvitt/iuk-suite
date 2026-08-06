import { describe, it, expect, afterEach, vi } from "vitest";
import { switcherEntries } from "@/core/shell/switcherEntries";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("switcherEntries", () => {
  it("verlinkt in Dev nur die fuer den Nutzer sichtbaren Module über *.localtest.me", () => {
    vi.stubEnv("PORT", "3000");
    const groups = ["da-feedback-gl", "iuk-files-admin", "lagerbuch_nutzer"];
    const keys = switcherEntries(groups).map((e) => e.key);
    // `files` steht hier, obwohl es prodHosts: [] hat — der Widerspruch zur
    // Spec-Begründung „Der App-Switcher zeigt es dann nicht" ist keiner: die
    // gilt NUR für Prod. Außerhalb von NODE_ENV=production liefert moduleUrl
    // die Dev-URL http://files.localtest.me:<port> UNABHÄNGIG von prodHosts
    // (moduleUrl.ts:19-26). Sichtbar ist es hier nur, weil die Session oben die
    // konfigurierte Modulgruppe traegt; ohne sie greift der neue Filter. In
    // Prod ohne SUITE_HOST_FILES ist prodHostsFor() leer, moduleUrl liefert
    // null und switcherEntries verwirft den Eintrag — siehe der Fall unten.
    expect(keys).toEqual(["portal", "qr", "feedback", "files", "lagerbuch", "gamma"]);
    // Nicht über den Index greifen: die Registry-Reihenfolge verschiebt sich mit
    // jedem neuen Modul, das Verhalten dahinter aber nicht.
    const gamma = switcherEntries(groups).find((e) => e.key === "gamma");
    expect(gamma?.href).toBe("http://gamma.localtest.me:3000");
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
    // Anonyme Teilpfade bleiben erreichbar, aber der App-Einstieg im Switcher
    // wird jetzt getrennt davon bewertet. Von den anonym erreichbaren Modulen
    // ist nur QR selbst ohne Pocket-ID-Gruppe als App nutzbar.
    expect(switcherEntries(null).map((e) => e.key)).toEqual(["qr"]);
  });

  it("blendet gruppengeschuetzte App-Einstiege ohne passende Gruppe aus", () => {
    const keys = switcherEntries([]).map((e) => e.key);
    expect(keys).toEqual(["portal", "qr", "gamma"]);
  });
});
