import { afterEach, describe, expect, it, vi } from "vitest";
import { baue } from "../../_lib/beispiele/bau";
import { neueId, neueIds } from "./ids";

afterEach(() => vi.restoreAllMocks());

describe("neue IDs", () => {
  it("weicht vergebenen IDs aus — Stellen, Einheiten und Verbindungen teilen einen Namensraum", () => {
    const p = baue({ verbindungen: [{ id: "v-aaaa", art: "tmo", bezeichnung: "X" }], stellen: [{ id: "s-aaaa", titel: "A", einheiten: ["RTW 1"] }] });
    const folge = ["aaaa", "aaaa", "bbbb"];
    expect(neueId(p, "s", () => folge.shift()!)).toBe("s-bbbb");
    expect(neueId(p, "v", () => "cccc")).toBe("v-cccc");
    expect(neueId(p, "e")).toMatch(/^e-[a-z0-9]{8}$/);
  });
  it("braucht keinen sicheren Kontext: ohne randomUUID (http auf *.localtest.me) geht es weiter", () => {
    vi.spyOn(crypto, "randomUUID").mockImplementation(() => { throw new TypeError("crypto.randomUUID is not a function"); });
    expect(neueId(baue({ stellen: [] }), "s")).toMatch(/^s-[a-z0-9]{8}$/);
  });
  it("mehrere auf einmal sind auch untereinander verschieden", () => {
    const p = baue({ stellen: [{ id: "w", titel: "W" }] });
    const folge = ["x", "x", "y", "z"];
    expect(neueIds(p, "e", 3, () => folge.shift()!)).toEqual(["e-x", "e-y", "e-z"]);
  });
});
