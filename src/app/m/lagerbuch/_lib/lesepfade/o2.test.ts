import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { migrierteTestDb, type TestDb } from "../../_db/testdb";
import { lagerorte, o2Flaschen, o2Messungen, users } from "../../_db/schema";
import { o2FlaschenUebersicht, o2FlascheDetail,
         o2FlaschenFuerLagerort, lagerorteFuerFlaschen } from "./o2";

const NOW = new Date("2026-06-15T10:00:00Z");
const frueher = new Date("2026-06-01T10:00:00Z");
let t: TestDb;

beforeEach(() => {
  t = migrierteTestDb("lagerbuch-lp-o2-");
  t.db.insert(lagerorte).values([
    { id: "rtw-1", name: "RTW 1", typ: "fahrzeug", kennung: "MS-1", aktiv: true },
    { id: "alt", name: "Altbestand", typ: "lager", kennung: null, aktiv: false },
  ]).run();
  t.db.insert(users).values(
    { id: "sub-1", name: "Anna Beispiel", email: null, lastLoginAt: NOW }).run();
  t.db.insert(o2Flaschen).values([
    { id: "f-200", name: "O2 klein", lagerortId: "rtw-1", groesseLiter: 2,
      nennfuelldruckBar: 200, aktiv: true, createdAt: NOW },
    { id: "f-300", name: "O2 gross", lagerortId: "rtw-1", groesseLiter: 10,
      nennfuelldruckBar: 300, aktiv: true, createdAt: NOW },
    { id: "f-ohne", name: "O2 ohne Messung", lagerortId: "rtw-1", groesseLiter: null,
      nennfuelldruckBar: 200, aktiv: true, createdAt: NOW },
    { id: "f-aus", name: "O2 ausgemustert", lagerortId: "rtw-1", groesseLiter: null,
      nennfuelldruckBar: 200, aktiv: false, createdAt: NOW },
  ]).run();
  t.db.insert(o2Messungen).values([
    { id: "m-alt", flascheId: "f-200", ts: frueher, druckBar: 30,
      quelleTyp: "oidc", quelleId: "sub-1", kommentar: null },
    { id: "m-neu", flascheId: "f-200", ts: NOW, druckBar: 180,
      quelleTyp: "oidc", quelleId: "sub-1", kommentar: "nachgefüllt" },
    { id: "m-check", flascheId: "f-300", ts: NOW, druckBar: 150,
      quelleTyp: "token", quelleId: "111-111", kommentar: "Fahrzeug-Check check:abc" },
  ]).run();
});
afterEach(() => t.schliessen());

describe("o2FlaschenUebersicht", () => {
  it("nimmt als aktuellen Druck die JUENGSTE Messung", () => {
    // Kein denormalisiertes Feld — damit ist eine falsche Messung DURCH EINE NEUE
    // korrigierbar, ohne die alte anzufassen (§5.12).
    const z = o2FlaschenUebersicht(t.db).find((x) => x.id === "f-200")!;
    expect(z.letzterDruck).toBe(180);
    expect(z.letzteMessung?.getTime()).toBe(NOW.getTime());
    expect(z.status).toMatchObject({ prozent: 90, ampel: "gruen", niedrig: false });
  });

  it("rechnet gegen den EIGENEN Nennfuelldruck der Flasche", () => {
    // 150 von 300 = 50 % → gruen. Mit einem ?? 200 waeren es 75 %.
    expect(o2FlaschenUebersicht(t.db).find((x) => x.id === "f-300")!.status)
      .toMatchObject({ prozent: 50, ampel: "gruen" });
  });

  it("liefert bei KEINER Messung status null, nicht 0 %", () => {
    /**
     * §5.12, Eigenschaft 4: die Oberflaeche zeigt „keine Messung", nicht eine
     * leere rote Ampel. Ein `o2Status(0, nenn)` ergaebe 0 % / rot und behauptete
     * eine Aussage, die niemand gemacht hat.
     */
    const z = o2FlaschenUebersicht(t.db).find((x) => x.id === "f-ohne")!;
    expect(z.letzterDruck).toBeNull();
    expect(z.letzteMessung).toBeNull();
    expect(z.status).toBeNull();
  });

  it("sortiert aktive nach vorn, dann alphabetisch", () => {
    expect(o2FlaschenUebersicht(t.db).map((z) => z.id))
      .toEqual(["f-300", "f-200", "f-ohne", "f-aus"]);
  });

  it("nimmt bei GLEICHEM ts die Messung mit der groesseren id (id-Tiebreaker, §5.14.4)", () => {
    // Zwei Messungen derselben Flasche in DERSELBEN Sekunde — realistisch bei
    // einer Sammel-Pruefsitzung. `ts` allein entscheidet dann nicht mehr, wer
    // „die letzte" ist; das muss dieselbe Richtung sein wie ueberall sonst im
    // Modul: orderBy(desc(ts), desc(id)) — bei Gleichstand gewinnt die
    // lexikographisch GROESSERE id. Ohne Tiebreaker gewinnt hier die zuerst
    // eingefuegte Zeile (Einfuegereihenfolge), und der Test faellt durch.
    t.db.insert(o2Messungen).values([
      { id: "m-tb-a", flascheId: "f-ohne", ts: NOW, druckBar: 50,
        quelleTyp: "oidc", quelleId: "sub-1", kommentar: null },
      { id: "m-tb-b", flascheId: "f-ohne", ts: NOW, druckBar: 190,
        quelleTyp: "oidc", quelleId: "sub-1", kommentar: null },
    ]).run();
    const z = o2FlaschenUebersicht(t.db).find((x) => x.id === "f-ohne")!;
    expect(z.letzterDruck).toBe(190);
  });
});

describe("o2FlascheDetail — die Herkunft der Messung ist SICHTBAR (§5.8.1)", () => {
  it("kennzeichnet eine check-stammende Messung", () => {
    /**
     * VERBINDLICH: „Die Herkunft einer Messung ist in jeder Anzeige sichtbar."
     * Die Angabe ist heute schon da (`quelleTyp`), sie wird nur nirgends gezeigt.
     * Damit ist der Falle-8-Befund („durchgeklickt sieht aus wie geprueft") nicht
     * beseitigt, aber LESBAR — die ehrliche Stufe, solange Variante (c) Backlog
     * ist.
     */
    const d = o2FlascheDetail(t.db, "f-300")!;
    expect(d.verlauf[0].ausCheck).toBe(true);
    expect(d.verlauf[0].wer).toBe("111-111");
  });

  it("kennzeichnet eine manuell erfasste Messung NICHT als check-stammend", () => {
    const d = o2FlascheDetail(t.db, "f-200")!;
    expect(d.verlauf[0].ausCheck).toBe(false);
    expect(d.verlauf[0].wer).toBe("Anna Beispiel");
  });

  it("`ausCheck` haengt am quelleTyp, nicht am Kommentartext", () => {
    // Ein Text-startsWith braeche, sobald jemand die Meldung umformuliert.
    t.db.insert(o2Messungen).values({
      id: "m-x", flascheId: "f-ohne", ts: NOW, druckBar: 100,
      quelleTyp: "token", quelleId: "222-222", kommentar: null,
    }).run();
    expect(o2FlascheDetail(t.db, "f-ohne")!.verlauf[0].ausCheck).toBe(true);
  });

  it("sortiert den Verlauf absteigend und nennt den Status der juengsten Messung", () => {
    const d = o2FlascheDetail(t.db, "f-200")!;
    expect(d.verlauf.map((m) => m.id)).toEqual(["m-neu", "m-alt"]);
    expect(d.status?.prozent).toBe(90);
    expect(d.lagerortName).toBe("RTW 1");
  });

  it("liefert null fuer eine unbekannte ID", () => {
    expect(o2FlascheDetail(t.db, "x")).toBeNull();
  });

  it("waehlt bei GLEICHEM ts dieselbe Messung wie die Uebersicht (id-Tiebreaker, §5.14.4)", () => {
    // Dieselbe Lücke wie bei T51 (bz.ts): ohne id-Tiebreaker koennten Uebersicht
    // und Detail bei zwei Messungen in derselben Sekunde verschiedene Datensaetze
    // als „die letzte" behandeln.
    t.db.insert(o2Messungen).values([
      { id: "m-tb-a", flascheId: "f-ohne", ts: NOW, druckBar: 50,
        quelleTyp: "oidc", quelleId: "sub-1", kommentar: null },
      { id: "m-tb-b", flascheId: "f-ohne", ts: NOW, druckBar: 190,
        quelleTyp: "oidc", quelleId: "sub-1", kommentar: null },
    ]).run();
    const d = o2FlascheDetail(t.db, "f-ohne")!;
    expect(d.verlauf[0].id).toBe("m-tb-b");
    expect(d.verlauf[0].druckBar).toBe(190);
  });
});

describe("o2FlaschenFuerLagerort — nur AKTIVE, mit Vorschlagswert", () => {
  it("liefert je Flasche Nennfuelldruck und letzten Druck", () => {
    const l = o2FlaschenFuerLagerort(t.db, "rtw-1");
    expect(l.map((f) => f.id)).toEqual(["f-300", "f-200", "f-ohne"]);
    expect(l.find((f) => f.id === "f-200")!.letzterDruck).toBe(180);
    expect(l.find((f) => f.id === "f-ohne")!.letzterDruck).toBeNull();
  });
  it("blendet inaktive Flaschen aus", () => {
    expect(o2FlaschenFuerLagerort(t.db, "rtw-1").some((f) => f.id === "f-aus")).toBe(false);
  });
});

describe("lagerorteFuerFlaschen", () => {
  it("liefert nur aktive Lagerorte, alphabetisch", () => {
    // ⚠️ Der Brief nennt hier nur "rtw-1" — rechnerisch falsch: `handlager` ist
    // KEIN Testdatum, sondern eine Migrationszeile (0003_handlager.sql,
    // `INSERT OR IGNORE`, aktiv=1) und existiert deshalb in JEDER frisch
    // migrierten Test-DB. "alt" bleibt zu Recht draussen (aktiv=false).
    // "Handlager" < "RTW 1" alphabetisch.
    expect(lagerorteFuerFlaschen(t.db)).toEqual([
      { id: "handlager", name: "Handlager" },
      { id: "rtw-1", name: "RTW 1" },
    ]);
  });
});

describe("Leser — die drei quelleAufloeser-freien Leser laufen INNERHALB einer Transaktion (H11)", () => {
  it("liest korrekt, waehrend die Transaktion noch offen ist", () => {
    /**
     * ⚠️ H11 GILT AUF FUNKTIONS-, NICHT AUF DATEIEBENE. `DB` nimmt hier nur
     * `o2FlascheDetail`, weil NUR sie `quelleAufloeser(db: DB)` ruft; die
     * uebrigen drei nehmen `Leser`. Das ist keine Kosmetik: `o2FlaschenFuerLagerort`
     * beliefert zusammen mit `geraeteFuerLagerort(db: Leser)` DIESELBE
     * Fahrzeug-Check-Maske, und §5.6.3 zeigt, dass die Maske innerhalb der
     * Check-Transaktion gelesen wird (Teil 4). Ein `DB` allein durch
     * Dateizugehoerigkeit blockierte dort und liefe auf den Cast hinaus, den H11
     * verbietet.
     *
     * Der Typecheck belegt nur, dass eine Transaktion als Parameter ANGENOMMEN
     * wird — nicht, dass `.all()`/`.get()` darin zur Laufzeit funktionieren.
     * Vorbild: `_db/aggregate.test.ts` und `verfall.test.ts`.
     */
    t.db.transaction((tx) => {
      expect(o2FlaschenUebersicht(tx).find((x) => x.id === "f-200")!.letzterDruck).toBe(180);
      // alphabetisch nach NAME: „O2 gross" < „O2 klein" < „O2 ohne Messung".
      expect(o2FlaschenFuerLagerort(tx, "rtw-1").map((f) => f.id))
        .toEqual(["f-300", "f-200", "f-ohne"]);
      expect(lagerorteFuerFlaschen(tx).map((l) => l.id)).toContain("rtw-1");
    });
  });
});
