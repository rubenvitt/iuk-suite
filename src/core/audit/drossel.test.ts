import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AblehnungsDrossel } from "./drossel";

const geschrieben = vi.hoisted(() => [] as { module: string; objectType: string }[]);
vi.mock("./storage", () => ({ recordAuditEvent: (e: { module: string; objectType: string }) => { geschrieben.push({ module: e.module, objectType: e.objectType }); } }));
import { LOGIN_AUDIT_BUENDEL_MS, LOGIN_AUDIT_PRO_MIN, auditLoginRequired, loginDrosselnZuruecksetzen } from "./server";

describe("AblehnungsDrossel mit Bündelfenster", () => {
  it("still innerhalb des Bündels, ohne das Budget zu belasten", () => {
    let t = 1_000_000;
    const drossel = new AblehnungsDrossel({ max: 2, windowMs: 60_000, buendelMs: 2_000, now: () => t });
    expect(drossel.entscheiden()).toBe("einzeln");
    t += 10;
    expect(drossel.entscheiden()).toBe("still");
    t += 1_989;
    expect(drossel.entscheiden()).toBe("still");
    t += 1;
    expect(drossel.entscheiden()).toBe("einzeln");
    t += 2_000;
    expect([drossel.entscheiden(), drossel.entscheiden()]).toEqual(["gedrosselt", "still"]);
  });
});

describe("auditLoginRequired (IDA-263)", () => {
  beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(1_000_000); loginDrosselnZuruecksetzen(); geschrieben.length = 0; });
  afterEach(() => { vi.useRealTimers(); });

  it("Layout- und Seitenriegel einer Navigation schreiben EINE Zeile", () => {
    auditLoginRequired("kommplan");
    vi.advanceTimersByTime(10);
    auditLoginRequired("kommplan");
    expect(geschrieben).toEqual([{ module: "kommplan", objectType: "login_required" }]);
  });

  it("ein Tab mit vier parallelen Abrufen schreibt eine Zeile, ein zweiter Besuch später wieder eine", () => {
    for (let i = 0; i < 8; i++) auditLoginRequired("lagerbuch");
    vi.advanceTimersByTime(44_000);
    auditLoginRequired("lagerbuch");
    expect(geschrieben).toHaveLength(2);
  });

  it("je Modul getrennt", () => {
    auditLoginRequired("kommplan");
    auditLoginRequired("einsatzbuch");
    expect(geschrieben.map(z => z.module)).toEqual(["kommplan", "einsatzbuch"]);
  });

  it("ein Scan bleibt sichtbar: Budget einzeln, dann genau eine Markierung je Minute", () => {
    for (let i = 0; i < 300; i++) { auditLoginRequired("files"); vi.advanceTimersByTime(100); }
    const typen = geschrieben.map(z => z.objectType);
    expect(typen.filter(t => t === "login_required")).toHaveLength(LOGIN_AUDIT_PRO_MIN);
    expect(typen.filter(t => t === "access_throttled")).toHaveLength(1);
    expect(typen.at(-1)).toBe("access_throttled");
    vi.advanceTimersByTime(60_000 - 300 * 100 + LOGIN_AUDIT_BUENDEL_MS);
    auditLoginRequired("files");
    expect(geschrieben.at(-1)).toEqual({ module: "files", objectType: "login_required" });
  });
});
