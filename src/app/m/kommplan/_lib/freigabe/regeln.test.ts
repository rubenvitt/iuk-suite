import { describe, expect, it } from "vitest";
import { randomBytes } from "node:crypto";
import {
  ablaufFuer, ausstellenSchema, besteFreigabe, DAUER_VORGABE, FREIGABE_DAUERN, FREIGABE_GRENZE, freigabeStatus, istTokenForm,
  tokenPfad, tokenUrl, waehleQrFreigabe, widerrufenSchema,
} from "./regeln";
import { qrZielSatz } from "./texte";

const JETZT = Date.UTC(2026, 9, 1, 18, 0); // 01.10.2026, 20:00 in Berlin
const STUNDE = 3_600_000;

describe("Ablauf (Spec §8.2; Entscheidung 3)", () => {
  it("rechnet Dauern ab jetzt, nicht in Kalendertagen; unbegrenzt ist null", () => {
    expect(ablaufFuer("24h", JETZT)).toBe(JETZT + 24 * STUNDE);
    expect(ablaufFuer("7d", JETZT)).toBe(JETZT + 7 * 24 * STUNDE);
    expect(ablaufFuer("30d", JETZT)).toBe(JETZT + 30 * 24 * STUNDE);
    expect(ablaufFuer("unbegrenzt", JETZT)).toBeNull();
  });
  it("Vorgabe sind 7 Tage, die Reihenfolge ist die des Flyins", () => {
    expect(DAUER_VORGABE).toBe("7d");
    expect(FREIGABE_DAUERN).toEqual(["24h", "7d", "30d", "unbegrenzt"]);
  });
});

describe("Status", () => {
  it("gültig, abgelaufen genau an der Grenze, widerrufen schlägt abgelaufen", () => {
    expect(freigabeStatus({ ablauf: null, widerrufenAm: null }, JETZT)).toBe("gueltig");
    expect(freigabeStatus({ ablauf: JETZT + 1, widerrufenAm: null }, JETZT)).toBe("gueltig");
    expect(freigabeStatus({ ablauf: JETZT, widerrufenAm: null }, JETZT)).toBe("abgelaufen");
    expect(freigabeStatus({ ablauf: JETZT - 1, widerrufenAm: JETZT - 5 }, JETZT)).toBe("widerrufen");
    expect(freigabeStatus({ ablauf: null, widerrufenAm: JETZT }, JETZT)).toBe("widerrufen");
  });
});

describe("Token-Form (Entscheidung 2)", () => {
  it("32 Byte Zufall base64url sind genau 43 Zeichen und passen", () => {
    for (let i = 0; i < 50; i++) {
      const t = randomBytes(32).toString("base64url");
      expect(t).toHaveLength(43);
      expect(istTokenForm(t)).toBe(true);
    }
  });
  it("weist alles andere ab: zu kurz, zu lang, Auffüllung, Pfadzeichen, Prozent, Leerzeichen", () => {
    const gut = "A".repeat(43);
    for (const t of ["", "A".repeat(42), "A".repeat(44), `${"A".repeat(42)}=`, `${"A".repeat(42)}/`, `${"A".repeat(42)}%`, `${"A".repeat(42)} `, `${"A".repeat(42)}+`, `../${gut}`]) {
      expect(istTokenForm(t), JSON.stringify(t)).toBe(false);
    }
  });
});

describe("QR-Wahl (Entscheidung 10)", () => {
  const z = (token: string, ablauf: number | null, erstelltAm: number, widerrufenAm: number | null = null) => ({ token, ablauf, erstelltAm, widerrufenAm });
  it("unbegrenzt vor spätestem Ablauf, bei Gleichstand der jüngste; ungültige nie", () => {
    expect(waehleQrFreigabe([z("a", JETZT + STUNDE, 1), z("b", JETZT + 2 * STUNDE, 2)], JETZT)?.token).toBe("b");
    expect(waehleQrFreigabe([z("a", null, 1), z("b", JETZT + 999 * STUNDE, 2)], JETZT)?.token).toBe("a");
    expect(waehleQrFreigabe([z("a", null, 1), z("b", null, 2)], JETZT)?.token).toBe("b");
    expect(waehleQrFreigabe([z("a", null, 1, JETZT - 1), z("b", JETZT, 2), z("c", JETZT - 1, 3)], JETZT)).toBeNull();
    expect(waehleQrFreigabe([], JETZT)).toBeNull();
  });
  it("besteFreigabe: dieselbe Rangfolge ohne Uhr — der Editor reicht nur die schon gültigen", () => {
    expect(besteFreigabe([z("a", JETZT + STUNDE, 1), z("b", null, 2), z("c", JETZT + 2 * STUNDE, 3)])?.token).toBe("b");
    expect(besteFreigabe([z("a", JETZT + STUNDE, 5), z("b", JETZT + STUNDE, 6)])?.token).toBe("b");
    expect(besteFreigabe([])).toBeNull();
  });
});

describe("URL", () => {
  it("hängt /t/<token> an die Basis, ohne doppelten Schrägstrich", () => {
    expect(tokenPfad("abc")).toBe("/t/abc");
    expect(tokenUrl("https://kommplan.iuk-ue.de", "abc")).toBe("https://kommplan.iuk-ue.de/t/abc");
    expect(tokenUrl("http://kommplan.localtest.me:3000/", "abc")).toBe("http://kommplan.localtest.me:3000/t/abc");
  });
});

describe("Eingaben der Actions", () => {
  it("Ausstellen: Dauer aus der Liste, Notiz getrimmt und höchstens 200 Zeichen, keine fremden Felder", () => {
    expect(ausstellenSchema.parse({ planId: "p", dauer: "24h", notiz: "  Leitstelle  " })).toEqual({ planId: "p", dauer: "24h", notiz: "Leitstelle" });
    expect(ausstellenSchema.safeParse({ planId: "p", dauer: "1y", notiz: "" }).success).toBe(false);
    expect(ausstellenSchema.safeParse({ planId: "p", dauer: "7d", notiz: "x".repeat(FREIGABE_GRENZE.notiz + 1) }).success).toBe(false);
    expect(ausstellenSchema.safeParse({ planId: "p", dauer: "7d", notiz: "", token: "eigen" }).success).toBe(false);
  });
  it("Widerrufen braucht Plan UND Link", () => {
    expect(widerrufenSchema.safeParse({ freigabeId: "f" }).success).toBe(false);
    expect(widerrufenSchema.parse({ planId: "p", freigabeId: "f" })).toEqual({ planId: "p", freigabeId: "f" });
  });
});

describe("qrZielSatz (Entscheidung 10)", () => {
  it("sagt Notiz und Ablauf; unbegrenzt ohne Warnung, befristet mit", () => {
    expect(qrZielSatz({ notiz: "Aushang", ablauf: null })).toBe("Der QR-Code führt auf „Aushang“ – unbegrenzt gültig.");
    expect(qrZielSatz({ notiz: null, ablauf: null })).toBe("Der QR-Code führt auf den Link ohne Notiz – unbegrenzt gültig.");
    expect(qrZielSatz({ notiz: "Leitstelle", ablauf: Date.UTC(2026, 9, 2, 18, 0) })).toBe("Der QR-Code führt auf „Leitstelle“ – gültig bis 02.10.2026, 20:00; danach führt der Ausdruck ins Leere.");
  });
});
