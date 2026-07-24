import { describe, it, expect } from "vitest";
import { normalizeTimestamp } from "./feedback-time";

describe("normalizeTimestamp", () => {
  it("parst Go time.Time mit Monotonic-Suffix + lokaler TZ (+0200)", () => {
    // 2026-04-09 09:24:31 +0200 == 07:24:31 UTC == 1775719471
    const sec = normalizeTimestamp("2026-04-09 09:24:31.055193 +0200 CEST m=+136.580652293");
    expect(sec).toBe(Math.floor(Date.UTC(2026, 3, 9, 7, 24, 31) / 1000));
  });
  it("parst SQLite CURRENT_TIMESTAMP (UTC, ohne TZ-Angabe)", () => {
    const sec = normalizeTimestamp("2026-04-09 07:24:28");
    expect(sec).toBe(Math.floor(Date.UTC(2026, 3, 9, 7, 24, 28) / 1000));
  });
  it("parst UTC-Datum aus Datums-Parse (+0000 UTC)", () => {
    const sec = normalizeTimestamp("2026-04-09 00:00:00 +0000 UTC");
    expect(sec).toBe(Math.floor(Date.UTC(2026, 3, 9, 0, 0, 0) / 1000));
  });
  it("parst Go time.Time mit negativem TZ-Offset (-0700 MST)", () => {
    // 2026-04-09 02:24:31 -0700 == 09:24:31 UTC
    const sec = normalizeTimestamp("2026-04-09 02:24:31.055193 -0700 MST m=+136.580652293");
    expect(sec).toBe(Math.floor(Date.UTC(2026, 3, 9, 9, 24, 31) / 1000));
  });
});
