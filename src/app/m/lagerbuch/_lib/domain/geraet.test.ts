import { describe, it, expect } from "vitest";
import { datumFaelligkeit, mtkFaelligkeit, objektAblauf, geraetFaelligkeit,
         MTK_WARN_TAGE, OBJEKT_ABLAUF_WARN_TAGE } from "./geraet";
import { ausZivilzeit } from "../zeit";

/** 15. Juni 2026, 14:37 Ortszeit — bewusst NICHT Mitternacht, damit die
 *  Rundung gegen den TAGESANFANG geprueft wird und nicht gegen `now`. */
const NOW = ausZivilzeit(2026, 6, 15, 14, 37, 0, 0);

describe("datumFaelligkeit — parseTag ist streng", () => {
  it("weist ueberrollende Kalendertage ab", () => {
    // `new Date(2026, 1, 31)` waere der 3. Maerz — ein Tippfehler im MTK-Datum
    // machte das Geraet still zwei Tage spaeter faellig als gedacht.
    const f = datumFaelligkeit("2026-02-31", NOW, 30);
    expect(f.keinDatum).toBe(true);
    expect(f.faelligAm).toBeNull();
  });

  it("weist jedes andere Format ab", () => {
    for (const roh of ["15.06.2026", "2026-6-15", "2026-06", "morgen", "", "2026-13-01"]) {
      expect(datumFaelligkeit(roh, NOW, 30).keinDatum).toBe(true);
    }
  });

  it("weist null ab", () => {
    expect(datumFaelligkeit(null, NOW, 30).keinDatum).toBe(true);
  });

  it("nimmt einen echten Kalendertag an", () => {
    expect(datumFaelligkeit("2026-02-28", NOW, 30).keinDatum).toBe(false);
    expect(datumFaelligkeit("2028-02-29", NOW, 30).keinDatum).toBe(false);  // Schaltjahr
  });
});

describe("datumFaelligkeit — kein Datum ist GRUEN und NICHT ueberfaellig", () => {
  it("liefert die Kombination, die eine Anzeige leicht falsch liest", () => {
    /**
     * `ampel: "gruen"` UND `ueberfaellig: false` UND `keinDatum: true`. Die
     * Oberflaeche zeigt das GRAU, nicht gruen und nicht rot (§5.10) — damit ein
     * frisch angelegtes Geraet ohne gepflegtes Datum keinen Fehlalarm ausloest.
     * Der Ton kommt aus `_lib/format.ts#geraetFaelligChip`, nicht von hier.
     */
    expect(datumFaelligkeit(null, NOW, 30)).toEqual({
      faelligAm: null, tageBisFaellig: null, ampel: "gruen",
      ueberfaellig: false, keinDatum: true,
    });
  });
});

describe("datumFaelligkeit — die Tage zaehlen gegen den TAGESANFANG", () => {
  it("heute = 0, auch um 14:37", () => {
    // Gegen `now` gerechnet waere es −0,6 Tage → gerundet 1 oder 0, je nach
    // Rundungsart. Gegen den Tagesanfang ist es eindeutig 0.
    const f = datumFaelligkeit("2026-06-15", NOW, 30);
    expect(f.tageBisFaellig).toBe(0);
    expect(f.ueberfaellig).toBe(false);
    expect(f.ampel).toBe("gelb");   // 0 <= warnTage, inklusive heute
  });

  it("gestern = −1 und UEBERFAELLIG", () => {
    const f = datumFaelligkeit("2026-06-14", NOW, 30);
    expect(f.tageBisFaellig).toBe(-1);
    expect(f.ueberfaellig).toBe(true);
    expect(f.ampel).toBe("rot");
  });

  it("morgen = 1", () => {
    expect(datumFaelligkeit("2026-06-16", NOW, 30).tageBisFaellig).toBe(1);
  });

  it("ueberlebt einen Zeitumstellungstag", () => {
    /**
     * 29.03.2026 ist der Umstellungstag auf Sommerzeit (23 Stunden). Eine
     * Millisekunden-Division gegen einen lokalen Mitternachtswert liefert dort
     * 0,958 Tage; `Math.round` rettet das, `Math.floor` nicht. Der Fall steht hier,
     * weil er in jeder Zone anders aussieht — und unter Entscheidung 26 (b) gar
     * nicht mehr von der Prozess-TZ abhaengt.
     */
    const vorher = ausZivilzeit(2026, 3, 28, 12, 0, 0, 0);
    expect(datumFaelligkeit("2026-03-29", vorher, 30).tageBisFaellig).toBe(1);
    expect(datumFaelligkeit("2026-03-30", vorher, 30).tageBisFaellig).toBe(2);
  });
});

describe("datumFaelligkeit — die Ampelkanten", () => {
  it("genau warnTage entfernt ist GELB (inklusive)", () => {
    expect(datumFaelligkeit("2026-07-15", NOW, 30).ampel).toBe("gelb");  // 30 Tage
  });

  it("warnTage + 1 ist GRUEN", () => {
    expect(datumFaelligkeit("2026-07-16", NOW, 30).ampel).toBe("gruen"); // 31 Tage
  });
});

describe("die zwei Warnfenster sind KONSTANTEN, keine Env", () => {
  it("tragen 30 Tage und ihre Einheit im Namen", () => {
    // §10.3: sie waren nie Env; sie jetzt konfigurierbar zu machen waere eine
    // Neuerung, die niemand beauftragt hat.
    expect(MTK_WARN_TAGE).toBe(30);
    expect(OBJEKT_ABLAUF_WARN_TAGE).toBe(30);
  });

  it("mtkFaelligkeit und objektAblauf setzen sie ein", () => {
    expect(mtkFaelligkeit("2026-07-15", NOW).ampel).toBe("gelb");
    expect(objektAblauf("2026-07-16", NOW).ampel).toBe("gruen");
  });
});

describe("geraetFaelligkeit — die Typ-Weiche", () => {
  it("medizin liest mtkFaellig, objekt liest ablaufdatum", () => {
    const g = { mtkFaellig: "2026-06-20", ablaufdatum: "2027-01-01" };
    expect(geraetFaelligkeit({ typ: "medizin", ...g }, NOW).tageBisFaellig).toBe(5);
    expect(geraetFaelligkeit({ typ: "objekt", ...g }, NOW).tageBisFaellig).toBe(200);
  });

  it("liest das FREMDE Feld nicht, auch wenn es gesetzt ist", () => {
    // Die Typ-Trennung ist eine SCHREIB-Invariante (`geraete.ts:39-42` haelt
    // typ-fremde Felder auf null) — aber ein Altdatensatz kann beides tragen.
    // Diese Zeile haelt fest, dass die Leseseite trotzdem eindeutig ist.
    expect(geraetFaelligkeit(
      { typ: "objekt", mtkFaellig: "2020-01-01", ablaufdatum: "2027-01-01" }, NOW,
    ).ueberfaellig).toBe(false);
  });

  it("ein Objekt ohne Ablaufdatum ist keinDatum, nicht ueberfaellig", () => {
    expect(geraetFaelligkeit(
      { typ: "objekt", mtkFaellig: null, ablaufdatum: null }, NOW,
    )).toEqual({
      faelligAm: null, tageBisFaellig: null, ampel: "gruen",
      ueberfaellig: false, keinDatum: true,
    });
  });
});
