import { describe, expect, it } from "vitest";
import { begruendungSchema, pruefeAnfrage, pruefeSperrzeit } from "./vermietungEingabe";
import { pruefePdf, sichererName, VERTRAG_MAX_BYTES, anhangKopf } from "./vermietungPdf";
import { zeitraumText } from "./vermietungText";
import { zeitpunkt } from "./zeit";

const JETZT = zeitpunkt("2026-11-01", "12:00");
const gut = { vonTag: "2026-11-07", vonUhr: "18:00", bisTag: "2026-11-08", bisUhr: "01:00", anlass: " Geburtstag ", personen: "35", person: "Jana Wolff", kontakt: "0151 2345678", hinweis: "", webseite: "" };

describe("pruefeAnfrage", () => {
  it("rechnet Datum und Uhrzeit in der Suite-Zone und trimmt Texte", () => {
    const r = pruefeAnfrage(gut, JETZT);
    expect(r.ok && r.wert).toMatchObject({ von: zeitpunkt("2026-11-07", "18:00"), bis: zeitpunkt("2026-11-08", "01:00"), anlass: "Geburtstag", personen: 35 });
  });

  it("Ende vor Beginn, Beginn in der Vergangenheit, zu lang, zu weit voraus", () => {
    const fehler = (abw: object) => { const r = pruefeAnfrage({ ...gut, ...abw }, JETZT); return r.ok ? null : r.feldFehler; };
    expect(fehler({ bisTag: "2026-11-07", bisUhr: "17:00" })?.bisTag).toMatch(/vor dem Beginn/);
    expect(fehler({ vonTag: "2026-10-31", bisTag: "2026-10-31", bisUhr: "23:00" })?.vonTag).toMatch(/Vergangenheit/);
    expect(fehler({ bisTag: "2026-11-11" })?.bisTag).toMatch(/drei Tage/);
    expect(fehler({ vonTag: "2028-06-01", bisTag: "2028-06-02" })?.vonTag).toMatch(/18 Monate/);
  });

  it("Längen- und Wertgrenzen jedes Feldes", () => {
    const fehler = (abw: object) => { const r = pruefeAnfrage({ ...gut, ...abw }, JETZT); return r.ok ? {} : r.feldFehler; };
    expect(fehler({ anlass: "x".repeat(121) }).anlass).toMatch(/120/);
    expect(fehler({ anlass: "   " }).anlass).toBeTruthy();
    expect(fehler({ personen: "0" }).personen).toBeTruthy();
    expect(fehler({ personen: "201" }).personen).toMatch(/200/);
    expect(fehler({ personen: "2.5" }).personen).toBeTruthy();
    expect(fehler({ person: "x".repeat(121) }).person).toBeTruthy();
    expect(fehler({ kontakt: "x".repeat(201) }).kontakt).toBeTruthy();
    // IDA-387: grob erreichbar — Ziffern oder eine E-Mail.
    expect(fehler({ kontakt: "abc" }).kontakt).toMatch(/Telefonnummer oder E-Mail/);
    expect(fehler({ kontakt: "erika@" }).kontakt).toBeTruthy();
    expect(fehler({ kontakt: "12345" }).kontakt).toBeTruthy();
    for (const gutKontakt of ["erika@example.org", "0151 2345678 (abends)", "+49 5141 12345"]) expect(fehler({ kontakt: gutKontakt }).kontakt).toBeUndefined();
    expect(fehler({ hinweis: "x".repeat(1001) }).hinweis).toBeTruthy();
    expect(fehler({ webseite: "x".repeat(501) }).webseite).toBeTruthy();
    expect(fehler({ vonUhr: "18:07" }).vonUhr).toMatch(/Viertelstunde/);
    expect(fehler({ vonTag: "2026-02-30" }).vonTag).toBeTruthy();
    expect(fehler({ vonTag: "morgen" }).vonTag).toBeTruthy();
  });

  it("lässt kein Objekt ohne Felder durch", () => {
    expect(pruefeAnfrage(null, JETZT).ok).toBe(false);
    expect(pruefeAnfrage({}, JETZT).ok).toBe(false);
  });
});

describe("pruefeSperrzeit und Begründung", () => {
  it("Grund mindestens 3 Zeichen, Ende nach Beginn, höchstens 92 Tage", () => {
    expect(pruefeSperrzeit({ vonTag: "2026-11-10", vonUhr: "19:00", bisTag: "2026-11-10", bisUhr: "22:00", grund: "Dienstabend" }).ok).toBe(true);
    expect(pruefeSperrzeit({ vonTag: "2026-11-10", vonUhr: "19:00", bisTag: "2026-11-10", bisUhr: "22:00", grund: "ab" }).ok).toBe(false);
    expect(pruefeSperrzeit({ vonTag: "2026-11-10", vonUhr: "19:00", bisTag: "2026-11-10", bisUhr: "19:00", grund: "Wartung" }).ok).toBe(false);
    expect(pruefeSperrzeit({ vonTag: "2026-11-10", vonUhr: "19:00", bisTag: "2027-03-01", bisUhr: "19:00", grund: "Umbau" }).ok).toBe(false);
  });

  it("Begründung 5 bis 1000 Zeichen", () => {
    expect(begruendungSchema.safeParse("kurz").success).toBe(false);
    expect(begruendungSchema.safeParse("Dienstabend.").success).toBe(true);
    expect(begruendungSchema.safeParse("x".repeat(1001)).success).toBe(false);
  });
});

describe("Vertrags-PDF", () => {
  const pdf = Buffer.from("%PDF-1.7\nInhalt");

  it("nur application/pdf mit Magic Bytes", () => {
    expect(pruefePdf("v.pdf", "application/pdf", pdf)).toEqual({ ok: true, name: "v.pdf" });
    expect(pruefePdf("v.pdf", "text/html", pdf)).toMatchObject({ ok: false, status: 415 });
    expect(pruefePdf("v.pdf", "application/pdf", Buffer.from("<html>"))).toMatchObject({ ok: false, status: 415 });
    expect(pruefePdf("v.pdf", "application/pdf", Buffer.alloc(0))).toMatchObject({ ok: false, status: 400 });
    const gross = Buffer.concat([pdf, Buffer.alloc(VERTRAG_MAX_BYTES)]);
    expect(pruefePdf("v.pdf", "application/pdf", gross)).toMatchObject({ ok: false, status: 413 });
  });

  it("Dateiname ohne Pfad und Steuerzeichen, immer mit .pdf", () => {
    expect(sichererName("C:\\Users\\x\\Vertrag Wolff.PDF")).toBe("Vertrag Wolff.pdf");
    expect(sichererName("../../etc/passwd")).toBe("passwd.pdf");
    expect(sichererName("a\"b\u0007.pdf")).toBe("ab.pdf");
    expect(sichererName("")).toBe("Mietvertrag.pdf");
  });

  it("Content-Disposition ist immer attachment, mit ASCII-Rückfall", () => {
    expect(anhangKopf("Vertrag Müller.pdf")).toBe("attachment; filename=\"Vertrag Muller.pdf\"; filename*=UTF-8''Vertrag%20M%C3%BCller.pdf");
  });
});

describe("zeitraumText", () => {
  it("drei Formen: am Tag, über Mitternacht, mehrtägig", () => {
    expect(zeitraumText(zeitpunkt("2026-11-07", "18:00"), zeitpunkt("2026-11-07", "23:00"))).toBe("Sa., 7. Nov. 2026, 18:00–23:00 Uhr");
    expect(zeitraumText(zeitpunkt("2026-11-07", "19:00"), zeitpunkt("2026-11-08", "00:30"))).toBe("Sa., 7. Nov. 2026, 19:00–00:30 Uhr (bis in die Nacht)");
    expect(zeitraumText(zeitpunkt("2026-11-07", "19:00"), zeitpunkt("2026-11-08", "00:00"))).toBe("Sa., 7. Nov. 2026, 19:00–24:00 Uhr");
    expect(zeitraumText(zeitpunkt("2026-11-07", "10:00"), zeitpunkt("2026-11-09", "12:00"))).toBe("Sa., 7. Nov. 2026, 10:00 Uhr – Mo., 9. Nov. 2026, 12:00 Uhr");
  });
});
