import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { migrierteTestDb, type TestDb } from "../../_db/testdb";
import { bzGeraete, bzKontrollen, lagerorte, users, newId } from "../../_db/schema";
import { lagerortOptionen, bzGeraeteUebersicht, bzGeraetDetail, bzGeraetByBarcode,
         bzLogbuchGesamt, bzAkkuKennzahlGesamt } from "./bz";
import { BZ_LOGBUCH_GRENZE } from "../grenzen";

const NOW = new Date("2026-06-15T10:00:00Z");
const vorTagen = (n: number) => new Date(NOW.getTime() - n * 86_400_000);
let t: TestDb;

beforeEach(() => {
  t = migrierteTestDb("lagerbuch-lp-bz-");
  // "handlager" existiert bereits nach der Migration (0003_handlager.sql,
  // `INSERT OR IGNORE` gegen 'handlager'/'Handlager'/'lager'/aktiv) — ein
  // zweiter Insert mit derselben ID verletzt UNIQUE. Nur die zusaetzlichen
  // Lagerorte werden hier angelegt.
  t.db.insert(lagerorte).values([
    { id: "rtw-1", name: "RTW 1", typ: "fahrzeug", kennung: "MS-1", aktiv: true },
    { id: "alt", name: "Altbestand", typ: "lager", kennung: null, aktiv: false },
  ]).run();
  t.db.insert(users).values(
    { id: "sub-1", name: "Anna Beispiel", email: "anna@example.test", lastLoginAt: NOW }).run();
  t.db.insert(bzGeraete).values([
    { id: "bz-1", name: "Accu-Chek A", barcode: "1234567890128", lagerortId: "rtw-1",
      streifenLot: "LOT-NEU", level1Label: "Level 1", level1Min: 40, level1Max: 60,
      level2Label: "Level 2", level2Min: 250, level2Max: 350, aktiv: true, createdAt: NOW },
    { id: "bz-nie", name: "Nie geprüft", barcode: null, lagerortId: "handlager",
      streifenLot: null, level1Label: null, level1Min: null, level1Max: null,
      level2Label: null, level2Min: null, level2Max: null, aktiv: true, createdAt: NOW },
  ]).run();
  // refSnapshot mit den DAMALS gueltigen Grenzen — heute stehen andere am Geraet.
  t.db.insert(bzKontrollen).values([
    { id: "k1", geraetId: "bz-1", ts: vorTagen(40), quelleTyp: "oidc", quelleId: "sub-1",
      level1Wert: 50, level1ImBereich: true, level2Wert: 300, level2ImBereich: true,
      kompresseVerfall: "2027-01", sticks: 40, lanzetten: 30, batterieGewechselt: true,
      kommentar: null, bestanden: true,
      refSnapshot: '{"streifenLot":"LOT-ALT","level1Label":"L1","level1Min":30,'
        + '"level1Max":70,"level2Label":"L2","level2Min":200,"level2Max":400}' },
    { id: "k2", geraetId: "bz-1", ts: vorTagen(10), quelleTyp: "token", quelleId: "111-111",
      level1Wert: 55, level1ImBereich: true, level2Wert: 310, level2ImBereich: true,
      kompresseVerfall: null, sticks: 20, lanzetten: 10, batterieGewechselt: true,
      kommentar: "ok", bestanden: true, refSnapshot: null },
  ]).run();
});
afterEach(() => t.schliessen());

describe("lagerortOptionen", () => {
  it("liefert nur AKTIVE Lagerorte, sortiert nach Typ und Name", () => {
    expect(lagerortOptionen(t.db).map((o) => o.id)).toEqual(["rtw-1", "handlager"]);
  });
});

describe("bzGeraeteUebersicht", () => {
  it("nennt die letzte Kontrolle und die Faelligkeit", () => {
    const z = bzGeraeteUebersicht(t.db, NOW).find((x) => x.id === "bz-1")!;
    expect(z.letzteKontrolle?.getTime()).toBe(vorTagen(10).getTime());
    expect(z.letztesBestanden).toBe(true);
    expect(z.faelligkeit.nieGeprueft).toBe(false);
    expect(z.lagerortName).toBe("RTW 1");
  });

  it("ein nie geprueftes Geraet ist ROT mit ueberfaellig FALSE", () => {
    // Die Falle aus §5.11 — die Anzeige muss `nieGeprueft` eigenstaendig
    // behandeln, sonst steht „nicht ueberfaellig" neben einer roten Ampel.
    const z = bzGeraeteUebersicht(t.db, NOW).find((x) => x.id === "bz-nie")!;
    expect(z.letzteKontrolle).toBeNull();
    expect(z.faelligkeit).toMatchObject({ ampel: "rot", ueberfaellig: false, nieGeprueft: true });
  });

  it("sortiert AKTIV vor inaktiv, dann nach Name", () => {
    // Reine Einfuegereihenfolge (rowid) waere hier KEIN Beleg: bz-1/bz-nie
    // stehen schon in Namensreihenfolge in der DB, ein neu angehaengtes
    // "AAA Ausgemustert" bliebe wegen der Einfuegereihenfolge ohnehin am Ende
    // — ein ersatzlos entferntes `.sort(...)` waere dabei UNBEMERKT gruen
    // geblieben (nachgeprueft). Deshalb zwei zusaetzliche Geraete, die die
    // Einfuegereihenfolge GEGEN die Sollreihenfolge stellen:
    //  - "0 Allererstes" (AKTIV) muesste alphabetisch VOR bz-1 stehen, wird
    //    aber NACH bz-1/bz-nie eingefuegt — nur die Sortierung bringt es nach
    //    vorn (schlaegt sowohl "keine Sortierung" als auch "nur nach aktiv,
    //    kein Namens-Tiebreaker" fehl).
    //  - "1 Fast Erstes" (INAKTIV) muesste alphabetisch weit vorn stehen,
    //    gehoert aber wegen `aktiv: false` ans Ende — schlaegt "nur nach Name,
    //    ohne aktiv-Vorrang" fehl.
    t.db.insert(bzGeraete).values([
      { id: "bz-frueh", name: "0 Allererstes", barcode: null, lagerortId: "rtw-1",
        streifenLot: null, level1Label: null, level1Min: null, level1Max: null,
        level2Label: null, level2Min: null, level2Max: null, aktiv: true, createdAt: NOW },
      { id: "bz-alt", name: "1 Fast Erstes", barcode: null, lagerortId: "alt",
        streifenLot: null, level1Label: null, level1Min: null, level1Max: null,
        level2Label: null, level2Min: null, level2Max: null, aktiv: false, createdAt: NOW },
    ]).run();
    expect(bzGeraeteUebersicht(t.db, NOW).map((z) => z.id))
      .toEqual(["bz-frueh", "bz-1", "bz-nie", "bz-alt"]);
  });
});

describe("bzGeraetDetail — refSnapshot wird SICHTBAR (§5.11)", () => {
  it("zeigt je Logbuchzeile die DAMALS gueltigen Grenzen, nicht die heutigen", () => {
    /**
     * Nachgeprueft: `grep -rn refSnapshot src/` liefert ausserhalb von Tests nur
     * die SCHREIBstelle und die Spaltendefinition. Die Zusage „nachweisfester
     * Snapshot der Referenzbereiche zum Messzeitpunkt" existiert als DATUM, nicht
     * als AUSSAGE. Ohne diese Anzeige liest man eine alte Kontrolle gegen einen
     * NEUEN Referenzbereich — die Fehlaussage, die ein Nachweis nicht machen darf.
     */
    const d = bzGeraetDetail(t.db, "bz-1", NOW)!;
    const alt = d.logbuch.find((z) => z.id === "k1")!;
    expect(alt.refDamals).toMatchObject({
      streifenLot: "LOT-ALT", level1Min: 30, level1Max: 70, level2Min: 200, level2Max: 400,
    });
    // Am Geraet stehen HEUTE 40..60 bzw. 250..350.
    expect(d.geraet.level1Min).toBe(40);
  });

  it("liefert refDamals: null, wenn kein Snapshot da ist", () => {
    expect(bzGeraetDetail(t.db, "bz-1", NOW)!.logbuch.find((z) => z.id === "k2")!.refDamals)
      .toBeNull();
  });

  it("stuerzt bei KAPUTTEM refSnapshot nicht ab", () => {
    t.db.insert(bzKontrollen).values({
      id: "k3", geraetId: "bz-1", ts: vorTagen(1), quelleTyp: "system", quelleId: "s",
      level1Wert: null, level1ImBereich: null, level2Wert: null, level2ImBereich: null,
      kompresseVerfall: null, sticks: 0, lanzetten: 0, batterieGewechselt: false,
      kommentar: null, bestanden: false, refSnapshot: "{kaputt",
    }).run();
    expect(bzGeraetDetail(t.db, "bz-1", NOW)!.logbuch.find((z) => z.id === "k3")!.refDamals)
      .toBeNull();
  });

  it("loest die Quelle auf: Klarname bzw. Token-Rohwert", () => {
    const d = bzGeraetDetail(t.db, "bz-1", NOW)!;
    expect(d.logbuch.find((z) => z.id === "k1")!.wer).toBe("Anna Beispiel");
    // Kein Token mit diesem Code angelegt → Rueckfall auf die rohe Kennung
    // (`quelleAufloeser`, Teil 1 T13).
    expect(d.logbuch.find((z) => z.id === "k2")!.wer).toBe("111-111");
  });

  it("sortiert das Logbuch absteigend und rechnet den Akku", () => {
    const d = bzGeraetDetail(t.db, "bz-1", NOW)!;
    expect(d.logbuch.map((z) => z.id)).toEqual(["k2", "k1"]);
    expect(d.akku).toEqual({ tageDurchschnitt: 30, anzahlWechsel: 2, anzahlIntervalle: 1 });
  });

  it("liefert null fuer eine unbekannte ID", () => {
    expect(bzGeraetDetail(t.db, "x", NOW)).toBeNull();
  });
});

describe("bzGeraetByBarcode", () => {
  it("findet BYTE-EXAKT", () => {
    expect(bzGeraetByBarcode(t.db, "1234567890128")).toEqual({ id: "bz-1" });
    expect(bzGeraetByBarcode(t.db, " 1234567890128")).toBeNull();
    expect(bzGeraetByBarcode(t.db, "1234567890129")).toBeNull();
  });
});

describe("bzLogbuchGesamt — der Deckel wird beobachtbar", () => {
  it("liefert mehrVorhanden bei BZ_LOGBUCH_GRENZE + 1", () => {
    for (let i = 0; i < BZ_LOGBUCH_GRENZE; i++) {
      t.db.insert(bzKontrollen).values({
        id: `m${i}`, geraetId: "bz-1", ts: vorTagen(1), quelleTyp: "system", quelleId: "s",
        level1Wert: null, level1ImBereich: null, level2Wert: null, level2ImBereich: null,
        kompresseVerfall: null, sticks: 0, lanzetten: 0, batterieGewechselt: false,
        kommentar: null, bestanden: false, refSnapshot: null,
      }).run();
    }
    const l = bzLogbuchGesamt(t.db);
    expect(l.zeilen).toHaveLength(BZ_LOGBUCH_GRENZE);
    expect(l.mehrVorhanden).toBe(true);
    expect(l.zeilen[0].geraetName).toBe("Accu-Chek A");
  });

  it("sortiert GERAETEUEBERGREIFEND absteigend nach ts", () => {
    // k1/k2 gehoeren beide zu bz-1 — eine Zeile eines ANDEREN Geraets mit dem
    // juengsten Zeitstempel ist der einzige Beleg dafuer, dass sortiert (statt
    // zufaellig durch Einfuegereihenfolge getroffen) UND korrekt der `geraetId`
    // zugeordnet wird. Ohne diesen Fall waere `zeilen[0].geraetName` immer
    // "Accu-Chek A", ganz gleich ob absteigend oder aufsteigend sortiert wird.
    t.db.insert(bzKontrollen).values({
      id: "k-neu", geraetId: "bz-nie", ts: NOW, quelleTyp: "system", quelleId: "s",
      level1Wert: null, level1ImBereich: null, level2Wert: null, level2ImBereich: null,
      kompresseVerfall: null, sticks: 0, lanzetten: 0, batterieGewechselt: false,
      kommentar: null, bestanden: false, refSnapshot: null,
    }).run();
    const l = bzLogbuchGesamt(t.db);
    expect(l.zeilen[0].geraetName).toBe("Nie geprüft");
    expect(l.zeilen[0].id).toBe("k-neu");
  });
});

describe("bzAkkuKennzahlGesamt — nur GERAETEINTERNE Intervalle", () => {
  it("klebt die Zeitreihen verschiedener Geraete NICHT aneinander", () => {
    /**
     * `src/db/bz.ts:137-161`. Ein `akkuLebensdauer(alleTs)` ueber alle Geraete auf
     * einmal waere die naheliegende Vereinfachung und FALSCH: es entstuende ein
     * Intervall zwischen dem letzten Wechsel des einen und dem ersten des anderen
     * Geraets.
     */
    t.db.insert(bzKontrollen).values([
      { id: "n1", geraetId: "bz-nie", ts: vorTagen(200), quelleTyp: "system", quelleId: "s",
        level1Wert: 1, level1ImBereich: null, level2Wert: null, level2ImBereich: null,
        kompresseVerfall: null, sticks: 0, lanzetten: 0, batterieGewechselt: true,
        kommentar: null, bestanden: true, refSnapshot: null },
      { id: "n2", geraetId: "bz-nie", ts: vorTagen(100), quelleTyp: "system", quelleId: "s",
        level1Wert: 1, level1ImBereich: null, level2Wert: null, level2ImBereich: null,
        kompresseVerfall: null, sticks: 0, lanzetten: 0, batterieGewechselt: true,
        kommentar: null, bestanden: true, refSnapshot: null },
    ]).run();
    // bz-1: EIN Intervall von 30 Tagen. bz-nie: EIN Intervall von 100 Tagen.
    // Mittel = 65. Ueber alle Zeitstempel geklebt waeren es drei Intervalle.
    expect(bzAkkuKennzahlGesamt(t.db)).toEqual({
      tageDurchschnitt: 65, anzahlWechsel: 4, anzahlIntervalle: 2,
    });
  });
});
