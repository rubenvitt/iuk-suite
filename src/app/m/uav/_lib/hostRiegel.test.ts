import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// `notFound()` wirft in der echten Laufzeit einen Next-internen Fehler. Fuer die
// Unit-Aussage genuegt ein erkennbarer Wurf — geprueft wird, DASS geworfen wird.
// Zeichengleich zu `radio/_lib/host.test.ts:7-9`.
vi.mock("next/navigation", () => ({
  notFound: () => { throw new Error("NEXT_NOT_FOUND"); },
}));

import { hostAbweisung } from "./hostRiegel";
import { istUavHost, requireUavHost } from "./host";

const alt = process.env.SUITE_HOST_UAV;
beforeEach(() => { process.env.SUITE_HOST_UAV = "uav-training.iuk-ue.de"; });
afterEach(() => { if (alt === undefined) delete process.env.SUITE_HOST_UAV; else process.env.SUITE_HOST_UAV = alt; });

const req = (host: string) => new Request("http://x/api/me", { headers: { host } });

describe("uav-Host-Riegel", () => {
  it("Prod-Host und Dev-Host sind eigen", () => {
    expect(istUavHost(new Headers({ host: "uav-training.iuk-ue.de" }))).toBe(true);
    expect(istUavHost(new Headers({ host: "uav.localtest.me:3000" }))).toBe(true);
  });
  it("fremder Suite-Host → 404 als text, nicht HTML", async () => {
    const r = hostAbweisung(req("feedback.localtest.me"));
    expect(r?.status).toBe(404);
    expect(r?.headers.get("content-type")).not.toContain("text/html");
  });
  it("eigener Host → null", () => expect(hostAbweisung(req("uav-training.iuk-ue.de"))).toBeNull());
  it("x-forwarded-host gewinnt", () => {
    expect(hostAbweisung(new Request("http://x/", { headers: { host: "localhost:3000", "x-forwarded-host": "uav-training.iuk-ue.de" } }))).toBeNull();
  });
});

describe("requireUavHost — fuer LAYOUTS UND SEITEN, erste Anweisung (M1)", () => {
  it("laesst den eigenen Host durch", () => {
    expect(() => requireUavHost(new Headers({ host: "uav-training.iuk-ue.de" }))).not.toThrow();
    expect(() => requireUavHost(new Headers({ host: "uav.localtest.me:3000" }))).not.toThrow();
  });

  it("wirft auf fremdem Host — notFound(), KEIN 403", () => {
    // Die Existenz eines Pfades auf dem falschen Host wird nicht verraten (Vorbild
    // radio/_lib/host.ts). `(teilnehmer)/layout.tsx` und `(admin)/layout.tsx` rufen
    // diese Form als ERSTE Anweisung — ohne sie renderte die Teilnehmer-Insel bzw. die
    // Verwaltung auf JEDEM Suite-Host, der auf den Container terminiert, und ihre
    // relativen `/api/*`-Aufrufe träfen dort das falsche Modul.
    expect(() => requireUavHost(new Headers({ host: "feedback.localtest.me" })))
      .toThrow("NEXT_NOT_FOUND");
  });
});
