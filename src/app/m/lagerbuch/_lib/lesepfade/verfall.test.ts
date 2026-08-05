import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { migrierteTestDb, type TestDb } from "../../_db/testdb";
import { artikel, buchungen, chargen, lagerorte, lagerortVerfall, newId } from "../../_db/schema";
import { verfallListe, lagerortVerfallListe, verfallFuerLagerort } from "./verfall";
import { HANDLAGER_ID } from "../konstanten";

/**
 * DIE VERFALLSSCHWELLEN WERDEN AUSDRUECKLICH GEPINNT.
 *
 * Der Pfad ruft `verfallSchwellen()` ohne Argument, liest also `process.env` —
 * und dieser Test behauptet konkrete Ampelwerte. Ein Entwickler mit
 * `LAGERBUCH_VERFALL_ROT_TAGE=7` in seiner Shell bekaeme sonst eine rote Datei
 * mit einer Meldung, die nichts erklaert. Teil 2 hat die Regel in
 * `grenzen.test.ts` aufgeschrieben: „Der Test darf nicht davon abhaengen, was in
 * der Entwicklerumgebung zufaellig gesetzt ist."
 *
 * `vi.stubEnv`/`vi.unstubAllEnvs` ist das etablierte Muster des Repos fuer genau
 * diesen Fall (`core/bootstrap.test.ts`, `devLogin.test.ts`) — `process.env.X = …`
 * scheitert an Nexts `readonly`-Augmentierung.
 *
 * ⚠️ NICHT „vereinfachen". Ohne den Pin ist die Datei rennabhaengig gruen.
 */
function pinneSchwellen(): void {
  vi.stubEnv("LAGERBUCH_VERFALL_ROT_TAGE", "31");
  vi.stubEnv("LAGERBUCH_VERFALL_GELB_TAGE", "56");
}

const NOW = new Date("2026-06-15T10:00:00Z");
let t: TestDb;

beforeEach(() => {
  pinneSchwellen();
  t = migrierteTestDb("lagerbuch-lp-verfall-");
  t.db.insert(lagerorte).values([
    { id: "rtw-1", name: "RTW 1", typ: "fahrzeug", kennung: "MS-1", aktiv: true },
    { id: "rtw-2", name: "ELW", typ: "fahrzeug", kennung: "MS-2", aktiv: true },
  ]).run();
  t.db.insert(artikel).values([
    { id: "a1", name: "Verband", einheit: "Stk.", fach: "A1",
      mindestbestand: 0, aktiv: true, createdAt: NOW },
    { id: "a2", name: "NaCl", einheit: "Fl.", fach: "B2",
      mindestbestand: 0, aktiv: true, createdAt: NOW },
  ]).run();
  // Verfallsdaten gegen NOW=2026-06-15 UND die gepinnten Schwellen (31/56 Tage)
  // NACHGERECHNET (nicht aus dem Brief abgeschrieben — der Brief nannte hier
  // "2026-07"/"2026-08", was tatsaechlich gelb/gruen ergibt statt rot/gelb;
  // T45-Lehre: eine Ampel-Erwartung im Brief war rechnerisch falsch).
  //   "2026-06" → ~16 Tage bis Monatsende → rot   (<= 31)
  //   "2026-07" → ~47 Tage bis Monatsende → gelb  (> 31, <= 56)
  //   "2029-01" → weit in der Zukunft     → gruen (> 56)
  // EINFUEGEREIHENFOLGE ABSICHTLICH NICHT ALPHABETISCH/SOLL-REIHENFOLGE (T30/T46-Lehre):
  // `db.select().from(chargen).all()` liefert ohne ORDER BY die Einfuegereihenfolge
  // (SQLite-rowid) — faellt sie zufaellig mit der erwarteten Sortierung zusammen,
  // bliebe ein geloeschtes `.sort()` in `verfallListe` unbemerkt gruen.
  t.db.insert(chargen).values([
    { id: "c-gelb", artikelId: "a1", chargenNr: "GELB", verfall: "2026-07", createdAt: NOW },
    { id: "c-gruen", artikelId: "a1", chargenNr: "GRUEN", verfall: "2029-01", createdAt: NOW },
    { id: "c-pseudo", artikelId: "a2", chargenNr: "Korrektur", verfall: "2099-12", createdAt: NOW },
    { id: "c-alt", artikelId: "a1", chargenNr: "ALT", verfall: "2020-01", createdAt: NOW },
    { id: "c-nurfzg", artikelId: "a2", chargenNr: "FZG", verfall: "2020-01", createdAt: NOW },
    { id: "c-rot", artikelId: "a1", chargenNr: "ROT", verfall: "2026-06", createdAt: NOW },
  ]).run();
  const b = (artikelId: string, chargeId: string, lagerortId: string, menge: number) => ({
    id: newId(), ts: NOW, typ: "zugang" as const, artikelId, chargeId, lagerortId, menge,
    quelleTyp: "system" as const, quelleId: "t", referenz: null, kommentar: null,
  });
  t.db.insert(buchungen).values([
    b("a1", "c-alt", HANDLAGER_ID, 3),
    b("a1", "c-rot", HANDLAGER_ID, 5),
    b("a1", "c-gelb", HANDLAGER_ID, 2),
    b("a1", "c-gruen", HANDLAGER_ID, 9),
    b("a2", "c-nurfzg", "rtw-1", 4),          // NUR im Fahrzeug
    b("a2", "c-pseudo", HANDLAGER_ID, 7),
  ]).run();
  t.db.insert(lagerortVerfall).values([
    { id: newId(), lagerortId: "rtw-1", artikelId: "a1", verfall: "2026-06",
      erfasstAt: NOW, quelleTyp: "token", quelleId: "111-111" },
    { id: newId(), lagerortId: "rtw-2", artikelId: "a1", verfall: "2026-06",
      erfasstAt: NOW, quelleTyp: "token", quelleId: "111-111" },
    { id: newId(), lagerortId: "rtw-1", artikelId: "a2", verfall: "2029-01",
      erfasstAt: NOW, quelleTyp: "oidc", quelleId: "sub-1" },
  ]).run();
});
afterEach(() => {
  t.schliessen();
  vi.unstubAllEnvs();
});

describe("verfallListe — Handlager-Rest, gruen ausgeblendet", () => {
  it("zeigt nur Chargen mit HANDLAGER-Rest > 0 und Ampel != gruen", () => {
    expect(verfallListe(t.db, NOW).map((e) => e.chargeId)).toEqual(["c-alt", "c-rot", "c-gelb"]);
  });

  it("laesst eine abgelaufene Charge WEG, die nur im Fahrzeug liegt", () => {
    /**
     * `queries.ts:192-194`: sonst erschiene sie hier, und der Aussondern-Knopf —
     * der ausschliesslich den HANDLAGER-Rest bucht — wuerde reproduzierbar
     * fehlschlagen.
     */
    expect(verfallListe(t.db, NOW).some((e) => e.chargeId === "c-nurfzg")).toBe(false);
  });

  it("laesst die Pseudo-Charge weg (2099-12 ist gruen)", () => {
    expect(verfallListe(t.db, NOW).some((e) => e.chargeId === "c-pseudo")).toBe(false);
  });

  it("sortiert in DREI Raengen: abgelaufen, rot, gelb — dann nach Verfall", () => {
    // Einfuegereihenfolge der Chargen (oben) weicht bewusst von dieser
    // Erwartung ab, damit ein geloeschtes `.sort()` NICHT zufaellig gruen bliebe.
    const l = verfallListe(t.db, NOW);
    expect(l.map((e) => e.chargeId)).toEqual(["c-alt", "c-rot", "c-gelb"]);
    expect(l[0].abgelaufen).toBe(true);
    expect(l[1].ampel).toBe("rot");
    expect(l[2].ampel).toBe("gelb");
  });

  it("traegt den Chip-Text und die Artikelangaben", () => {
    const e = verfallListe(t.db, NOW)[0];
    expect(e.text).toBe("abgelaufen");
    expect(e.artikelName).toBe("Verband");
    expect(e.einheit).toBe("Stk.");
    expect(e.fach).toBe("A1");
    expect(e.rest).toBe(3);
  });
});

describe("lagerortVerfallListe — vier Raenge, drittes Kriterium Lagerortname", () => {
  it("zeigt per Vorgabe ALLE Meldungen, auch gruene", () => {
    expect(lagerortVerfallListe(t.db, {}, NOW)).toHaveLength(3);
  });

  it("nurWarnend blendet gruen aus", () => {
    expect(lagerortVerfallListe(t.db, { nurWarnend: true }, NOW)).toHaveLength(2);
  });

  it("filtert auf einen Lagerort", () => {
    expect(lagerortVerfallListe(t.db, { lagerortId: "rtw-2" }, NOW)).toHaveLength(1);
  });

  it("sortiert bei gleichem Rang und gleichem Verfall nach LAGERORTNAME", () => {
    // rtw-1 heisst „RTW 1", rtw-2 heisst „ELW" — alphabetisch steht ELW vorn.
    const l = lagerortVerfallListe(t.db, { nurWarnend: true }, NOW);
    expect(l.map((z) => z.lagerortName)).toEqual(["ELW", "RTW 1"]);
  });

  it("traegt Kennung, Artikelangaben und erfasstAt", () => {
    const z = lagerortVerfallListe(t.db, { lagerortId: "rtw-1", nurWarnend: true }, NOW)[0];
    expect(z.lagerortKennung).toBe("MS-1");
    expect(z.artikelName).toBe("Verband");
    expect(z.erfasstAt.getTime()).toBe(NOW.getTime());
    expect(z.text).toBe("läuft 06/26 ab");
  });
});

describe("verfallFuerLagerort — je Artikel HOECHSTENS einer", () => {
  it("liefert eine Map, geschluesselt nach artikelId", () => {
    const m = verfallFuerLagerort(t.db, "rtw-1", NOW);
    expect([...m.keys()].sort()).toEqual(["a1", "a2"]);
    expect(m.get("a1")?.verfall).toBe("2026-06");
    expect(m.get("a1")?.ampel).toBe("rot");
    expect(m.get("a2")?.ampel).toBe("gruen");
  });

  it("liefert fuer einen Lagerort ohne Meldung eine LEERE Map", () => {
    expect(verfallFuerLagerort(t.db, "gibtsnicht", NOW).size).toBe(0);
  });

  /**
   * H11: `verfallFuerLagerort` nimmt `Leser`, nicht `DB`, WEIL `checkAbschluss`
   * (Teil 4) es NACH dem Schreiben INNERHALB derselben Transaktion ruft (§5.6.3).
   * Ohne diesen Test prueft nichts als der Typ, dass das auch tatsaechlich laeuft.
   */
  it("laeuft INNERHALB einer Transaktion (H11, §5.6.3)", () => {
    const m = t.db.transaction((tx) => verfallFuerLagerort(tx, "rtw-1", NOW));
    expect(m.get("a1")?.ampel).toBe("rot");
  });
});
