import { describe, it, expect } from "vitest";
import {
  computeClosesAt,
  isExpired,
  nextStatusOnAccess,
  DEFAULT_CLOSE_AFTER_HOURS,
} from "./lifecycle";

const t = (iso: string) => new Date(iso);

describe("computeClosesAt", () => {
  it("addiert Stunden auf activatedAt", () => {
    expect(computeClosesAt(t("2026-04-09T10:00:00Z"), 48)).toEqual(
      t("2026-04-11T10:00:00Z"),
    );
  });
  it("Default sind 48h", () => {
    expect(DEFAULT_CLOSE_AFTER_HOURS).toBe(48);
  });
});

describe("isExpired", () => {
  it("false wenn closesAt null", () => {
    expect(isExpired(null, t("2026-04-09T10:00:00Z"))).toBe(false);
  });
  it("true wenn now >= closesAt", () => {
    expect(isExpired(t("2026-04-09T10:00:00Z"), t("2026-04-09T10:00:01Z"))).toBe(true);
    expect(isExpired(t("2026-04-09T10:00:00Z"), t("2026-04-09T10:00:00Z"))).toBe(true);
  });
  it("false wenn now < closesAt", () => {
    expect(isExpired(t("2026-04-09T10:00:00Z"), t("2026-04-09T09:59:59Z"))).toBe(false);
  });
});

describe("nextStatusOnAccess", () => {
  it("active + abgelaufen → closed", () => {
    expect(
      nextStatusOnAccess("active", t("2026-04-09T10:00:00Z"), t("2026-04-09T11:00:00Z")),
    ).toBe("closed");
  });
  it("active + nicht abgelaufen bleibt active", () => {
    expect(
      nextStatusOnAccess("active", t("2026-04-09T12:00:00Z"), t("2026-04-09T11:00:00Z")),
    ).toBe("active");
  });
  it("draft/closed/archived bleiben unverändert", () => {
    const now = t("2026-04-09T11:00:00Z");
    expect(nextStatusOnAccess("draft", null, now)).toBe("draft");
    expect(nextStatusOnAccess("closed", t("2020-01-01T00:00:00Z"), now)).toBe("closed");
    expect(nextStatusOnAccess("archived", null, now)).toBe("archived");
  });
});
