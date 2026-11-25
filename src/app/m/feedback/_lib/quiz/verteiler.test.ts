import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { abonniere, anzahlAbonnenten, melde } from "./verteiler";

describe("verteiler", () => {
  const abmeldungen: Array<() => void> = [];
  const sub = (id: number, h: () => void) => {
    const a = abonniere(id, h);
    if (a) abmeldungen.push(a);
    return a;
  };
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    abmeldungen.splice(0).forEach((a) => a());
    vi.useRealTimers();
  });

  it("bündelt fünf Meldungen in 50 ms zu einem Aufruf nach 200 ms", () => {
    const h = vi.fn();
    sub(1, h);
    for (let i = 0; i < 5; i++) {
      melde(1);
      vi.advanceTimersByTime(10);
    }
    expect(h).not.toHaveBeenCalled();
    vi.advanceTimersByTime(250);
    expect(h).toHaveBeenCalledTimes(1);
  });

  it("hält den Takt: Meldung nach dem Aufruf startet ein neues Fenster", () => {
    const h = vi.fn();
    sub(2, h);
    melde(2);
    vi.advanceTimersByTime(200);
    expect(h).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(50);
    melde(2);
    vi.advanceTimersByTime(199);
    expect(h).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(1);
    expect(h).toHaveBeenCalledTimes(2);
  });

  it("meldet ab", () => {
    const a = sub(3, () => {});
    expect(anzahlAbonnenten(3)).toBe(1);
    a!();
    expect(anzahlAbonnenten(3)).toBe(0);
  });

  it("lehnt den 201. Abonnenten ab", () => {
    for (let i = 0; i < 200; i++) expect(sub(4, () => {})).not.toBeNull();
    expect(sub(4, () => {})).toBeNull();
    expect(anzahlAbonnenten(4)).toBe(200);
  });

  it("Runden sind getrennt", () => {
    const a = vi.fn();
    const b = vi.fn();
    sub(5, a);
    sub(6, b);
    melde(5);
    vi.advanceTimersByTime(250);
    expect(a).toHaveBeenCalledTimes(1);
    expect(b).not.toHaveBeenCalled();
  });
});
