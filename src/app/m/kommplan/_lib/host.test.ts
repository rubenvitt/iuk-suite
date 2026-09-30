import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ notFound: () => { throw new Error("NEXT_NOT_FOUND"); } }));
import { istKommplanHost, requireKommplanHost } from "./host";

describe("kommplan-Host-Riegel", () => {
  it("eigener Dev-Host ja, fremder Suite-Host nein, x-forwarded-host gewinnt", () => {
    expect(istKommplanHost(new Headers({ host: "kommplan.localtest.me:3000" }))).toBe(true);
    expect(istKommplanHost(new Headers({ host: "feedback.localtest.me" }))).toBe(false);
    expect(istKommplanHost(new Headers({ host: "localhost:3000", "x-forwarded-host": "kommplan.localtest.me" }))).toBe(true);
  });
  it("fremder Host → notFound, nicht 403", () => {
    expect(() => requireKommplanHost(new Headers({ host: "feedback.localtest.me" }))).toThrow("NEXT_NOT_FOUND");
    expect(() => requireKommplanHost(new Headers({ host: "kommplan.localtest.me" }))).not.toThrow();
  });
});
