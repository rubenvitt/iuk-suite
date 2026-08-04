import { describe, it, expect, afterEach, vi } from "vitest";
import { switcherEntries } from "@/core/shell/switcherEntries";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("switcherEntries", () => {
  it("verlinkt in Dev alle sichtbaren Module über *.localtest.me", () => {
    vi.stubEnv("PORT", "3000");
    const keys = switcherEntries([]).map((e) => e.key);
    // `files` steht hier, obwohl es prodHosts: [] hat — der Widerspruch zur
    // Spec-Begründung „Der App-Switcher zeigt es dann nicht" ist keiner: die
    // gilt NUR für Prod. Außerhalb von NODE_ENV=production liefert moduleUrl
    // die Dev-URL http://files.localtest.me:<port> UNABHÄNGIG von prodHosts
    // (moduleUrl.ts:19-26), und canAccess steigt bei requiresAuth: false sofort
    // mit true aus (registry.ts:133), also filtern die Gruppen nicht. In Prod
    // ohne SUITE_HOST_FILES ist prodHostsFor() leer, moduleUrl liefert null und
    // switcherEntries verwirft den Eintrag — siehe der Prod-Fall unten.
    expect(keys).toEqual(["portal", "qr", "feedback", "files", "lagerbuch", "gamma"]);
    // Nicht über den Index greifen: die Registry-Reihenfolge verschiebt sich mit
    // jedem neuen Modul, das Verhalten dahinter aber nicht.
    const gamma = switcherEntries([]).find((e) => e.key === "gamma");
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
    // Anonym bleiben genau die Module übrig, die keinen Login verlangen — seit
    // qr, feedback und files ist das nicht mehr die leere Liste, aber weiterhin
    // nichts Geschütztes: alle drei stehen auf requiresAuth: false, weil sie
    // anonyme Ansichten tragen (/s/<id>, /u/<token>, /f/<slug>). Der Zugang zur
    // Verwaltung wird modul-intern gegated, nicht hier.
    // lagerbuch steht aus einem ANDEREN Grund auf requiresAuth: false: nicht wegen
    // einer anonymen Ansicht, sondern weil /t/<code> die Helfer-Sitzung erst
    // erzeugt und ohne jede Sitzung aufgerufen wird — requiresAuth: true schickte
    // jedes gedruckte Etikett in den Login. Auch hier wird der Zugang modul-intern
    // geriegelt (_lib/zugang.ts für die Verwaltung, _lib/host.ts für den Host).
    expect(switcherEntries(null).map((e) => e.key)).toEqual(["qr", "feedback", "files", "lagerbuch"]);
  });
});
