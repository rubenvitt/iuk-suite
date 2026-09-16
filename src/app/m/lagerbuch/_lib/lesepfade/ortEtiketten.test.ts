import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { migrierteTestDb, type TestDb } from "../../_db/testdb";
import { lagerorte } from "../../_db/schema";
import { HANDLAGER_ID } from "../konstanten";
import { etikettOrte, etikettOrt } from "./ortEtiketten";

/**
 * DRK-312 — welche Orte eine QR-Karte bekommen.
 *
 * Die Fixture stellt GENAU DIE FAELLE her, die die Menge sonst still falsch
 * machen: ein zweites Lager, ein Schrank unter dem Handlager, ein
 * stillgelegtes Fahrzeug, eine Tasche, eine Einheit ohne zugeordnete Art. Der
 * Handlager selbst kommt aus Migration 0003 und wird NUR benutzt.
 */
let t: TestDb;

beforeEach(() => {
  t = migrierteTestDb("lagerbuch-lp-ortetiketten-");
  /*
   * Einfuegereihenfolge bewusst GEGEN die erwartete Sortierung (Handlager
   * zuerst, dann alphabetisch): faellt beides zufaellig zusammen, bliebe eine
   * fehlende Sortierung unbemerkt. „Ärztetasche" steht dabei nicht aus Laune
   * da — ohne einen Umlaut am Wortanfang ist `localeCompare(…, "de")` gegen
   * ein blosses `<` nicht zu unterscheiden.
   */
  t.db.insert(lagerorte).values([
    { id: "zzz-mtw", name: "ZZZ MTW", typ: "fahrzeug", kennung: "MS-9",
      aktiv: true, einheitenart: "fahrzeug" },
    { id: "keller", name: "Lager Keller", typ: "lager", kennung: null, aktiv: true },
    { id: "schrank-1", name: "Schrank 1", typ: "lager", kennung: null,
      aktiv: true, parentId: HANDLAGER_ID, sortierung: 10 },
    { id: "alt-elw", name: "ELW alt", typ: "fahrzeug", kennung: "MS-8",
      aktiv: false, einheitenart: "fahrzeug" },
    { id: "tasche-san", name: "Ärztetasche", typ: "fahrzeug", kennung: null,
      aktiv: true, einheitenart: "tasche" },
    { id: "rucksack", name: "Rucksack Betreuung", typ: "fahrzeug", kennung: null,
      aktiv: true, einheitenart: null },
  ]).run();
});

afterEach(() => t.schliessen());

describe("etikettOrte", () => {
  it("nimmt den Handlager und jede aktive Einheit — in dieser Reihenfolge", () => {
    expect(etikettOrte(t.db).map((o) => o.id))
      .toEqual([HANDLAGER_ID, "tasche-san", "rucksack", "zzz-mtw"]);
  });

  /**
   * ⚠️ DER TEUERSTE FEHLER DIESER MENGE WAERE EIN ZWEITES LAGER. Ein
   * `parent_id IS NULL` — die Definition von „eigenstaendig" im Schema — faengt
   * „Lager Keller" mit, und fuer den gibt es im Helfer-Ast keinen Kontext:
   * `/helfer` zeigt den Bestand des HANDLAGERS. Das Etikett fuehrte an einen
   * fremden Bestand, und genau das merkt niemand am Bildschirm.
   */
  it("nimmt KEIN zweites Lager", () => {
    expect(etikettOrte(t.db).map((o) => o.id)).not.toContain("keller");
  });

  /** Ein Schrank ist kein Ort, an dem man einsteigt — und hat kein eigenes Ziel. */
  it("nimmt keinen Schrank", () => {
    expect(etikettOrte(t.db).map((o) => o.id)).not.toContain("schrank-1");
  });

  /**
   * Ein stillgelegtes Fahrzeug ist kein Buchungsziel mehr
   * (`istAktivesFahrzeug`); sein Etikett fuehrte in eine Fahrzeugwahl ohne
   * dieses Fahrzeug.
   */
  it("nimmt keine stillgelegte Einheit", () => {
    expect(etikettOrte(t.db).map((o) => o.id)).not.toContain("alt-elw");
  });

  /**
   * ⚠️ OHNE `kennung` UND `einheitenart` WAEREN ZWEI GLEICHNAMIGE TASCHEN AUF
   * PAPIER NICHT ZU UNTERSCHEIDEN. `lagerorte.name` traegt fuer Einheiten
   * keinen Eindeutigkeitsschluessel — `idx_lagerorte_name_je_parent` steht
   * unter `parent_id IS NOT NULL` und deckt nur die Schraenke.
   */
  it("reicht Kennung und Art durch, damit die Karte eine Beizeile bauen kann", () => {
    const orte = new Map(etikettOrte(t.db).map((o) => [o.id, o]));
    expect(orte.get("zzz-mtw")).toMatchObject({ kennung: "MS-9", einheitenart: "fahrzeug" });
    expect(orte.get("tasche-san")).toMatchObject({ kennung: null, einheitenart: "tasche" });
    // Der Zwischenstand aus Migration 0010 — `null` heisst „noch nicht
    // zugeordnet", nicht „keins von beidem", und wird NICHT geraten.
    expect(orte.get("rucksack")).toMatchObject({ einheitenart: null });
    // Fuer ein Lager ist die Frage gegenstandslos, nicht offen.
    expect(orte.get(HANDLAGER_ID)).toMatchObject({ typ: "lager", einheitenart: null });
  });
});

describe("etikettOrt", () => {
  it("findet ein Etikettenziel", () => {
    expect(etikettOrt(t.db, "zzz-mtw")).toMatchObject({ id: "zzz-mtw", typ: "fahrzeug" });
    expect(etikettOrt(t.db, HANDLAGER_ID)).toMatchObject({ id: HANDLAGER_ID, typ: "lager" });
  });

  /**
   * DIE DREI `null`-FAELLE, und keiner davon ist ein Fehler: eine unbekannte
   * Id, ein stillgelegtes Fahrzeug (das laminierte Kaertchen haengt noch dran)
   * und ein Ort, fuer den es nie ein Etikett gab.
   */
  it.each([
    ["eine unbekannte Id", "gibt-es-nicht"],
    ["ein stillgelegtes Fahrzeug", "alt-elw"],
    ["einen Schrank", "schrank-1"],
    ["ein zweites Lager", "keller"],
  ])("gibt null fuer %s", (_was, id) => {
    expect(etikettOrt(t.db, id)).toBeNull();
  });

  /**
   * DIE EIGENTLICHE ZUSAGE: Bogen und Weiche sehen DIESELBE Menge. Laufen sie
   * auseinander, wird ein Etikett gedruckt, dessen Adresse die Weiche nicht
   * kennt — oder eine Adresse antwortet, zu der es kein Etikett gibt.
   */
  it("findet genau die Orte, die der Bogen druckt — und keinen mehr", () => {
    for (const o of etikettOrte(t.db)) {
      expect(etikettOrt(t.db, o.id), o.id).not.toBeNull();
    }
    const alle = t.db.select().from(lagerorte).all();
    const gedruckt = new Set(etikettOrte(t.db).map((o) => o.id));
    for (const o of alle.filter((z) => !gedruckt.has(z.id))) {
      expect(etikettOrt(t.db, o.id), o.id).toBeNull();
    }
  });
});
