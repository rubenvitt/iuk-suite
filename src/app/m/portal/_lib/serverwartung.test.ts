import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  _warnsperreZuruecksetzen,
  darfWartungSehen,
  WARTUNG_GRUPPEN_ENV,
  WARTUNG_NTFY_ENV,
  wartungsAbo,
  wartungsGruppen,
} from "@/app/m/portal/_lib/serverwartung";

/*
 * Ausgedachte Themen, nie das echte: das Repo ist öffentlich, und wer das
 * Thema kennt, kann mitlesen und an alle senden (Kopf von `serverwartung.ts`).
 */
const THEMA = "beispiel_Thema-42";

describe("wartungsAbo", () => {
  beforeEach(() => _warnsperreZuruecksetzen());

  it("ist ohne Variable aus, und zwar still", () => {
    const warnen = vi.fn();
    expect(wartungsAbo({}, warnen)).toBeNull();
    expect(wartungsAbo({ [WARTUNG_NTFY_ENV]: "  " }, warnen)).toBeNull();
    expect(warnen).not.toHaveBeenCalled();
  });

  it("zerlegt eine ntfy.sh-Adresse in Thema, Server und App-Link", () => {
    expect(wartungsAbo({ [WARTUNG_NTFY_ENV]: `https://ntfy.sh/${THEMA}/` })).toEqual({
      url: `https://ntfy.sh/${THEMA}`,
      server: "ntfy.sh",
      serverUrl: "https://ntfy.sh",
      standardServer: true,
      thema: THEMA,
      appLink: `ntfy://ntfy.sh/${THEMA}?display=I%26K%20Serverwartung`,
    });
  });

  it("nimmt auch einen eigenen Server, dann mit Server-Schritt", () => {
    const abo = wartungsAbo({ [WARTUNG_NTFY_ENV]: `https://ntfy.example.org:8443/${THEMA}` });
    expect(abo?.standardServer).toBe(false);
    expect(abo?.serverUrl).toBe("https://ntfy.example.org:8443");
    expect(abo?.appLink).toBe(`ntfy://ntfy.example.org:8443/${THEMA}?display=I%26K%20Serverwartung`);
  });

  it("markiert http im App-Link, sonst abonnierte die App per https", () => {
    const abo = wartungsAbo({ [WARTUNG_NTFY_ENV]: `http://ntfy.example.org/${THEMA}` });
    expect(abo?.appLink).toMatch(/&secure=false$/);
    expect(abo?.standardServer).toBe(false);
  });

  it.each([
    ["ohne Schema", `ntfy.sh/${THEMA}`],
    ["javascript:", "javascript:alert(1)"],
    ["ohne Thema", "https://ntfy.sh/"],
    ["mit Unterpfad", `https://ntfy.sh/${THEMA}/json`],
    ["mit Zeichen, die ntfy nicht annimmt", "https://ntfy.sh/thema.mit.punkt"],
    ["mit Anfrageteil", `https://ntfy.sh/${THEMA}?auth=x`],
  ])("weist eine Adresse %s ab und warnt, ohne den Wert zu nennen", (_fall, wert) => {
    const warnen = vi.fn();
    expect(wartungsAbo({ [WARTUNG_NTFY_ENV]: wert }, warnen)).toBeNull();
    expect(warnen).toHaveBeenCalledTimes(1);
    expect(warnen.mock.calls[0][0]).not.toContain(wert);
  });

  it("warnt höchstens einmal je Prozess", () => {
    const warnen = vi.fn();
    wartungsAbo({ [WARTUNG_NTFY_ENV]: "kaputt" }, warnen);
    wartungsAbo({ [WARTUNG_NTFY_ENV]: "kaputt" }, warnen);
    expect(warnen).toHaveBeenCalledTimes(1);
  });
});

describe("darfWartungSehen", () => {
  it("lässt den Suite-Betrieb zu, auch mit umbenannter ADMIN_GROUP", () => {
    expect(darfWartungSehen(["admin"], {})).toBe(true);
    expect(darfWartungSehen(["betrieb"], { ADMIN_GROUP: "betrieb" })).toBe(true);
    expect(darfWartungSehen(["admin"], { ADMIN_GROUP: "betrieb" })).toBe(false);
  });

  it("lässt zusätzliche Gruppen aus der .env zu", () => {
    const env = { [WARTUNG_GRUPPEN_ENV]: " radio-admin, ,lagerbuch-admin " };
    expect(wartungsGruppen(env)).toEqual(["admin", "radio-admin", "lagerbuch-admin"]);
    expect(darfWartungSehen(["lagerbuch-admin"], env)).toBe(true);
  });

  it("lässt Angemeldete ohne passende Gruppe und Anonyme nicht zu", () => {
    expect(darfWartungSehen(["user", "portal-admin"], {})).toBe(false);
    expect(darfWartungSehen([], {})).toBe(false);
    expect(darfWartungSehen(null, {})).toBe(false);
  });
});
