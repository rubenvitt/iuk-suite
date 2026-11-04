// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import dayjs from "dayjs";
import {
  HALTBARKEIT_MS, PRAEFIX, deserialisiere, entwurfSchluessel, ladeEntwurf, loescheEntwurf,
  raeumeAuf, serialisiere, speichereEntwurf, vergissFluechtig,
} from "./ablage";
import { entwurfMeldung } from "./meldung";
import { istVeralteteAktion, wartezeit } from "./senden";

beforeEach(() => {
  localStorage.clear();
  vergissFluechtig();
});

const eintrag = (stand: unknown, geaendert = Date.now()) => ({ stand, geaendert, pfad: "/x", sendung: null });

describe("ablage", () => {
  it("legt ab, liest zurück und löscht", () => {
    expect(speichereEntwurf("m:a", eintrag({ ist: { p1: 3 } }))).toBe(true);
    expect(localStorage.getItem(PRAEFIX + "m:a")).not.toBeNull();
    expect(ladeEntwurf<{ ist: Record<string, number> }>("m:a")?.stand.ist.p1).toBe(3);
    expect(entwurfSchluessel()).toEqual(["m:a"]);
    loescheEntwurf("m:a");
    expect(ladeEntwurf("m:a")).toBeNull();
  });

  it("nimmt dayjs und Date mit", () => {
    const d = dayjs("2026-11-04T18:00:00Z");
    const zurueck = deserialisiere<{ d: dayjs.Dayjs; t: Date; s: string }>(
      serialisiere({ d, t: new Date("2026-01-02T00:00:00Z"), s: "x" }),
    );
    expect(dayjs.isDayjs(zurueck.d)).toBe(true);
    expect(zurueck.d.toISOString()).toBe(d.toISOString());
    expect(zurueck.t).toBeInstanceOf(Date);
    expect(zurueck.s).toBe("x");
  });

  it("verwirft alte Entwürfe, eine offene Sendung aber nie", () => {
    const alt = Date.now() - HALTBARKEIT_MS - 1;
    speichereEntwurf("m:alt", eintrag({ a: 1 }, alt));
    speichereEntwurf("m:sendung", { ...eintrag({ a: 1 }, alt), sendung: { id: "s", nutzlast: {}, seit: alt, versuche: 1 } });
    raeumeAuf();
    expect(ladeEntwurf("m:alt")).toBeNull();
    expect(ladeEntwurf("m:sendung")?.sendung?.id).toBe("s");
  });

  it("trägt im Arbeitsspeicher weiter, wenn localStorage wirft", () => {
    const orig = Storage.prototype.setItem;
    Storage.prototype.setItem = () => {
      throw new Error("QuotaExceeded");
    };
    try {
      expect(speichereEntwurf("m:voll", eintrag({ a: 2 }))).toBe(false);
      expect(ladeEntwurf<{ a: number }>("m:voll")?.stand.a).toBe(2);
    } finally {
      Storage.prototype.setItem = orig;
    }
  });

  it("übersteht kaputten Inhalt", () => {
    localStorage.setItem(PRAEFIX + "m:kaputt", "{nicht json");
    expect(ladeEntwurf("m:kaputt")).toBeNull();
  });
});

describe("senden", () => {
  it("wartet 3, 6, 12, 24, dann 30 s", () => {
    expect([1, 2, 3, 4, 5, 9].map(wartezeit)).toEqual([3000, 6000, 12000, 24000, 30000, 30000]);
  });

  it("erkennt eine nach dem Rollout unbekannte Server Action", () => {
    const e = new Error("Server Action \"abc\" was not found on the server.");
    e.name = "UnrecognizedActionError";
    expect(istVeralteteAktion(e)).toBe(true);
    expect(istVeralteteAktion(new TypeError("Failed to fetch"))).toBe(false);
    expect(istVeralteteAktion(null)).toBe(false);
  });
});

describe("meldung", () => {
  it("nennt nur den Status", () => {
    expect(entwurfMeldung({ zustand: "wartet", naechsterVersuch: 12_400, wiederhergestellt: false }, 0)?.text)
      .toBe("Nicht gesendet. Neuer Versuch in 13 s.");
    expect(entwurfMeldung({ zustand: "wartet", naechsterVersuch: 10 ** 9, wiederhergestellt: false }, 0)?.text)
      .toBe("Nicht gesendet. Neuer Versuch in 30 s.");
    expect(entwurfMeldung({ zustand: "ruhe", naechsterVersuch: null, wiederhergestellt: true }, 0)?.art)
      .toBe("wiederhergestellt");
    expect(entwurfMeldung({ zustand: "ruhe", naechsterVersuch: null, wiederhergestellt: false }, 0)).toBeNull();
  });
});
