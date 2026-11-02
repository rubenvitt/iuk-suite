import { describe, expect, it } from "vitest";
import { DRUCK_PARAM, druckHref, eingabeAusParam } from "./druckLink";
import { rechne, type Eingabe } from "./rechner";

const param = (e: Eingabe) => new URL(druckHref(e), "http://x").searchParams.get(DRUCK_PARAM) ?? undefined;
const roh = (x: unknown) => btoa(JSON.stringify(x)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

describe("druckLink", () => {
  it("bringt jeden Weg unverändert durch den Link, auch Umlaute in Raumnamen", () => {
    const eingaben: Eingabe[] = [
      { weg: "personen", trennung: true, personen: { maenner: 50, frauen: 50 } },
      { weg: "flaeche", trennung: false, flaeche: { gesamt_m2: 812.5 } },
      { weg: "raeume", trennung: true, raeume: [{ bezeichnung: "Großer Saal „Süd“", laenge_m: 15, breite_m: 13.5, abzuege: [{ laenge_m: 4, breite_m: 2.5 }], belegung: "frauen" }] },
      { weg: "zelte", trennung: false, zelte: { gesamt: { "SG 20": 1, "SG 30": 0, "SG 40": 2, "SG 50": 3 } } },
    ];
    for (const e of eingaben) {
      const zurueck = eingabeAusParam(param(e));
      expect(zurueck).not.toBeNull();
      expect(rechne(zurueck!)).toEqual(rechne(e));
    }
    expect(eingabeAusParam(param(eingaben[2]))?.raeume?.[0].bezeichnung).toBe("Großer Saal „Süd“");
  });

  it("liefert null für fehlende, kaputte oder fremde Parameter", () => {
    expect(eingabeAusParam(undefined)).toBeNull();
    expect(eingabeAusParam(["a", "b"])).toBeNull();
    expect(eingabeAusParam("%%%")).toBeNull();
    expect(eingabeAusParam(roh([1, 2]))).toBeNull();
    expect(eingabeAusParam(roh({ weg: "keller" }))).toBeNull();
  });

  it("nimmt nur bekannte Felder und kappt Mengen", () => {
    const e = eingabeAusParam(roh({
      weg: "raeume",
      trennung: "ja",
      raeume: Array.from({ length: 250 }, () => ({ bezeichnung: "x".repeat(100), laenge_m: -3, breite_m: "7", belegung: "kinder", fremd: 1 })),
    }))!;
    expect(e.trennung).toBe(false);
    expect(e.raeume).toHaveLength(200);
    expect(e.raeume![0]).toEqual({ bezeichnung: "x".repeat(80), laenge_m: 0, breite_m: 0, abzuege: [] });
  });
});
