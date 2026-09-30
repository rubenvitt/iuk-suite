// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { leseZuletzt, merkeZuletzt, ZULETZT_MAX } from "./zuletzt";

afterEach(() => { vi.restoreAllMocks(); window.localStorage.clear(); });

describe("zuletzt genutzte Zeichen", () => {
  it("neueste zuerst, ohne Doppel, höchstens acht", () => {
    for (let i = 0; i < 10; i++) merkeZuletzt(`z${i}`);
    merkeZuletzt("z5");
    expect(leseZuletzt()).toEqual(["z5", "z9", "z8", "z7", "z6", "z4", "z3", "z2"]);
    expect(leseZuletzt()).toHaveLength(ZULETZT_MAX);
  });
  it("kaputter oder gesperrter Speicher: leer, kein Wurf", () => {
    window.localStorage.setItem("kommplan:zeichen:zuletzt", "{kaputt");
    expect(leseZuletzt()).toEqual([]);
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => { throw new Error("SecurityError"); });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("QuotaExceeded"); });
    expect(leseZuletzt()).toEqual([]);
    expect(merkeZuletzt("x")).toEqual(["x"]);
  });
});
