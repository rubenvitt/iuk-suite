import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Wie `uav/_lib/hostRiegel.test.ts`: `notFound()` wirft in Next einen internen Fehler,
// hier genügt ein erkennbarer Wurf.
vi.mock("next/navigation", () => ({
  notFound: () => { throw new Error("NEXT_NOT_FOUND"); },
}));

import { istEinsatzbuchHost, requireEinsatzbuchHost } from "./host";
import { hostAbweisung } from "./hostRiegel";

const alt = process.env.SUITE_HOST_EINSATZBUCH;
beforeEach(() => { process.env.SUITE_HOST_EINSATZBUCH = "einsatzbuch.iuk-ue.de"; });
afterEach(() => { if (alt === undefined) delete process.env.SUITE_HOST_EINSATZBUCH; else process.env.SUITE_HOST_EINSATZBUCH = alt; });

const req = (host: string) => new Request("http://x/m/einsatzbuch/api/stammdaten", { headers: { host } });

describe("einsatzbuch-Host-Riegel", () => {
  it("Prod-Host und Dev-Host sind eigen", () => {
    expect(istEinsatzbuchHost(new Headers({ host: "einsatzbuch.iuk-ue.de" }))).toBe(true);
    expect(istEinsatzbuchHost(new Headers({ host: "einsatzbuch.localtest.me:3000" }))).toBe(true);
  });
  it("fremder Suite-Host → 404 als Text, nicht HTML", () => {
    const r = hostAbweisung(req("feedback.localtest.me"));
    expect(r?.status).toBe(404);
    expect(r?.headers.get("content-type")).not.toContain("text/html");
  });
  it("eigener Host → null", () => expect(hostAbweisung(req("einsatzbuch.iuk-ue.de"))).toBeNull());
  it("x-forwarded-host gewinnt", () => {
    expect(hostAbweisung(new Request("http://x/", { headers: { host: "localhost:3000", "x-forwarded-host": "einsatzbuch.iuk-ue.de" } }))).toBeNull();
  });
  it("requireEinsatzbuchHost wirft auf fremdem Host notFound, nicht 403", () => {
    expect(() => requireEinsatzbuchHost(new Headers({ host: "einsatzbuch.localtest.me:3000" }))).not.toThrow();
    expect(() => requireEinsatzbuchHost(new Headers({ host: "feedback.localtest.me" }))).toThrow("NEXT_NOT_FOUND");
  });
});
