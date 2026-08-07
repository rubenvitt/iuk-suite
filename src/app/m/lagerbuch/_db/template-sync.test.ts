import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { eq } from "drizzle-orm";
import { migrierteTestDb, type TestDb } from "./testdb";
import { artikel, fahrzeugTemplates, lagerorte, lagerortVerfall, sollPositionen,
         templatePositionen } from "./schema";
import { syncFahrzeugTemplate } from "../_lib/schreibpfade/templateSync";

const NOW = new Date("2026-06-15T10:00:00Z");
let t: TestDb;

beforeEach(() => {
  t = migrierteTestDb("lagerbuch-tplsync-");
  t.db.insert(fahrzeugTemplates).values(
    { id: "tpl", name: "RTW-Vorlage", aktiv: true, createdAt: NOW }).run();
  t.db.insert(lagerorte).values([
    { id: "rtw-1", name: "RTW 1", typ: "fahrzeug", kennung: null,
      aktiv: true, templateId: "tpl" },
    { id: "rtw-frei", name: "RTW ohne Vorlage", typ: "fahrzeug", kennung: null,
      aktiv: true, templateId: null },
  ]).run();
  t.db.insert(artikel).values([
    { id: "a1", name: "A", einheit: "Stk.", fach: "A1",
      mindestbestand: 0, aktiv: true, createdAt: NOW },
    { id: "a2", name: "B", einheit: "Stk.", fach: "A2",
      mindestbestand: 0, aktiv: true, createdAt: NOW },
  ]).run();
});
afterEach(() => t.schliessen());

const soll = () => t.db.select().from(sollPositionen).all();

function verfallAnlegen(id: string, artikelId = "a1") {
  t.db.insert(lagerortVerfall).values({
    id,
    lagerortId: "rtw-1",
    artikelId,
    verfall: "2026-09",
    erfasstAt: NOW,
    quelleTyp: "oidc",
    quelleId: "u-admin",
  }).run();
}

describe("Regel 1 — anlegen", () => {
  it("materialisiert jede Vorlagen-Position ohne verknuepfte Zeile", () => {
    // §5.7.2: der Check-Flow liest AUSSCHLIESSLICH soll_positionen. Eine live
    // berechnete Vorlage waere fuer ihn unsichtbar.
    t.db.insert(templatePositionen).values([
      { id: "tp1", templateId: "tpl", fachLabel: "Fach 1", sort: 0, artikelId: "a1", soll: 4 },
      { id: "tp2", templateId: "tpl", fachLabel: "Fach 2", sort: 1, artikelId: "a2", soll: 2 },
    ]).run();
    expect(syncFahrzeugTemplate(t.db, "rtw-1")).toEqual(
      { hinzugefuegt: 2, aktualisiert: 0, uebersprungen: 0, entfernt: 0, losgeloest: 0 });
    expect(soll()).toHaveLength(2);
    // .find(), nicht soll()[0]: ein SELECT ohne ORDER BY schuldet keine
    // Reihenfolge — sich auf Einfuegereihenfolge zu verlassen waere genau die
    // zufaellige Uebereinstimmung, vor der die Lehren aus T30/T46/… warnen.
    expect(soll().find((r) => r.templatePositionId === "tp1")).toMatchObject(
      { ueberschrieben: false, entfernt: false, soll: 4 });
  });

  it("ist idempotent — ein zweiter Lauf OHNE Aenderung dazwischen aendert nichts", () => {
    t.db.insert(templatePositionen).values(
      { id: "tp1", templateId: "tpl", fachLabel: "F", sort: 0, artikelId: "a1", soll: 4 }).run();
    syncFahrzeugTemplate(t.db, "rtw-1");
    expect(syncFahrzeugTemplate(t.db, "rtw-1")).toEqual(
      { hinzugefuegt: 0, aktualisiert: 0, uebersprungen: 0, entfernt: 0, losgeloest: 0 });
    expect(soll()).toHaveLength(1);
  });

  it("laesst eine NACH dem ersten Sync von Hand geaenderte Zeile beim zweiten Sync in Ruhe", () => {
    // Der Fall, den ein Test ueber nur EINEN Sync nicht sehen kann: die Zeile
    // entsteht ERST durch Regel 1, wird dann von Hand ueberschrieben (wie eine
    // Bestueckung, die nach dem Materialisieren angepasst wurde), und die
    // Vorlage aendert sich DANACH ebenfalls — der zweite Sync darf die
    // Hand-Aenderung trotzdem nicht ueberschreiben.
    t.db.insert(templatePositionen).values(
      { id: "tp1", templateId: "tpl", fachLabel: "F", sort: 0, artikelId: "a1", soll: 4 }).run();
    expect(syncFahrzeugTemplate(t.db, "rtw-1").hinzugefuegt).toBe(1);
    const id = soll()[0].id;
    t.db.update(sollPositionen).set({ soll: 99, ueberschrieben: true })
      .where(eq(sollPositionen.id, id)).run();
    t.db.update(templatePositionen).set({ soll: 8 })
      .where(eq(templatePositionen.id, "tp1")).run();

    expect(syncFahrzeugTemplate(t.db, "rtw-1")).toEqual(
      { hinzugefuegt: 0, aktualisiert: 0, uebersprungen: 1, entfernt: 0, losgeloest: 0 });
    expect(soll()).toHaveLength(1);
    expect(soll()[0]).toMatchObject({ id, soll: 99, ueberschrieben: true });
  });

  it("tut fuer ein Fahrzeug OHNE Vorlage gar nichts", () => {
    expect(syncFahrzeugTemplate(t.db, "rtw-frei")).toEqual(
      { hinzugefuegt: 0, aktualisiert: 0, uebersprungen: 0, entfernt: 0, losgeloest: 0 });
  });
});

describe("Regel 2 — ueberschrieben und entfernt bleiben UNANGETASTET", () => {
  it("laesst eine ueberschriebene Zeile in Ruhe", () => {
    t.db.insert(templatePositionen).values(
      { id: "tp1", templateId: "tpl", fachLabel: "F", sort: 0, artikelId: "a1", soll: 4 }).run();
    t.db.insert(sollPositionen).values(
      { id: "sp1", fahrzeugId: "rtw-1", fachLabel: "Eigenes Fach", sort: 9,
        artikelId: "a1", soll: 99, templatePositionId: "tp1",
        ueberschrieben: true, entfernt: false }).run();
    expect(syncFahrzeugTemplate(t.db, "rtw-1").uebersprungen).toBe(1);
    expect(soll()[0]).toMatchObject({ id: "sp1", soll: 99, fachLabel: "Eigenes Fach" });
  });

  it("legt eine als GRABSTEIN markierte Position NICHT wieder an", () => {
    /**
     * ⚠️ EIN GRABSTEIN IST KEIN SOFT-DELETE. Er verhindert, dass der Sync die
     * Vorlagen-Position WIEDER ANLEGT. Wer `entfernt` missversteht und die Zeilen
     * VOR dem Sync wegfiltert, legt sie beim naechsten Sync wieder an (Teil 1, T7).
     */
    t.db.insert(templatePositionen).values(
      { id: "tp1", templateId: "tpl", fachLabel: "F", sort: 0, artikelId: "a1", soll: 4 }).run();
    t.db.insert(sollPositionen).values(
      { id: "sp1", fahrzeugId: "rtw-1", fachLabel: "F", sort: 0, artikelId: "a1", soll: 4,
        templatePositionId: "tp1", ueberschrieben: false, entfernt: true }).run();
    expect(syncFahrzeugTemplate(t.db, "rtw-1")).toEqual(
      { hinzugefuegt: 0, aktualisiert: 0, uebersprungen: 1, entfernt: 0, losgeloest: 0 });
    expect(soll()).toHaveLength(1);
    expect(soll()[0].entfernt).toBe(true);
  });
});

describe("Regel 3 — angleichen, aber nur bei echtem Unterschied", () => {
  it("schreibt, wenn sich soll, fachLabel, sort oder artikelId unterscheiden — dieselbe Zeile", () => {
    t.db.insert(templatePositionen).values(
      { id: "tp1", templateId: "tpl", fachLabel: "Neu", sort: 5, artikelId: "a2", soll: 7 }).run();
    t.db.insert(sollPositionen).values(
      { id: "sp1", fahrzeugId: "rtw-1", fachLabel: "Alt", sort: 0, artikelId: "a1", soll: 4,
        templatePositionId: "tp1", ueberschrieben: false, entfernt: false }).run();
    verfallAnlegen("verfall-alter-artikel");
    expect(syncFahrzeugTemplate(t.db, "rtw-1").aktualisiert).toBe(1);
    // Identitaet, nicht nur Werte: das muss ein UPDATE der bestehenden Zeile
    // sein, kein DELETE+INSERT — sonst waere `checks.ergebnis`, das
    // `soll_positionen.id` referenziert, gegen eine neue Zeile verwaist.
    expect(soll()).toHaveLength(1);
    expect(soll()[0]).toMatchObject(
      { id: "sp1", fachLabel: "Neu", sort: 5, artikelId: "a2", soll: 7 });
    expect(t.db.select().from(lagerortVerfall).all()).toEqual([]);
  });

  it("schreibt NICHT, wenn alles gleich ist", () => {
    t.db.insert(templatePositionen).values(
      { id: "tp1", templateId: "tpl", fachLabel: "F", sort: 0, artikelId: "a1", soll: 4 }).run();
    t.db.insert(sollPositionen).values(
      { id: "sp1", fahrzeugId: "rtw-1", fachLabel: "F", sort: 0, artikelId: "a1", soll: 4,
        templatePositionId: "tp1", ueberschrieben: false, entfernt: false }).run();
    expect(syncFahrzeugTemplate(t.db, "rtw-1").aktualisiert).toBe(0);
  });

  it("behaelt beide Verfaelle, wenn zwei Positionen ihre Artikel tauschen", () => {
    t.db.insert(templatePositionen).values([
      { id: "tp1", templateId: "tpl", fachLabel: "F1", sort: 0, artikelId: "a2", soll: 4 },
      { id: "tp2", templateId: "tpl", fachLabel: "F2", sort: 1, artikelId: "a1", soll: 2 },
    ]).run();
    t.db.insert(sollPositionen).values([
      { id: "sp1", fahrzeugId: "rtw-1", fachLabel: "F1", sort: 0, artikelId: "a1", soll: 4,
        templatePositionId: "tp1", ueberschrieben: false, entfernt: false },
      { id: "sp2", fahrzeugId: "rtw-1", fachLabel: "F2", sort: 1, artikelId: "a2", soll: 2,
        templatePositionId: "tp2", ueberschrieben: false, entfernt: false },
    ]).run();
    verfallAnlegen("verfall-a1", "a1");
    verfallAnlegen("verfall-a2", "a2");

    expect(syncFahrzeugTemplate(t.db, "rtw-1").aktualisiert).toBe(2);

    expect(soll().map((row) => row.artikelId).sort()).toEqual(["a1", "a2"]);
    expect(t.db.select().from(lagerortVerfall).all().map((row) => row.artikelId).sort())
      .toEqual(["a1", "a2"]);
  });
});

describe("Regel 4 — Waisen", () => {
  // ⚠️ ABWEICHUNG VOM BRIEF: `soll_positionen.template_position_id` traegt
  // `ON DELETE no action` (migrations/0000_dear_magneto.sql:180) — ein blankes
  // `DELETE FROM template_positionen`, waehrend noch eine `soll_positionen`-Zeile
  // darauf zeigt, verletzt die FK sofort (foreign_keys=ON, testdb.ts). Der Brief
  // rief `delete(templatePositionen)` und danach GETRENNT `syncFahrzeugTemplate`
  // auf — das laeuft gegen eine echte, FK-scharfe DB nie durch.
  //
  // EIN Weg, eine echte Loeschung FK-vertraeglich zu ueberstehen: Loeschung und
  // Heilung (=Sync) in DERSELBEN Transaktion, mit `defer_foreign_keys=ON`, damit
  // die Pruefung erst beim Commit greift — die Transaktion committet nur, wenn
  // der Sync die dangling Referenz vorher aufgeloest hat. Das ist zugleich der
  // Beleg, warum Regel 4 gebraucht wird: sie macht eine Vorlagen-Loeschung erst
  // FK-vertraeglich. (Der ANDERE Weg zu einer verwaisten Zeile braucht keine
  // Loeschung: wechselt `lagerorte.templateId` auf eine andere Vorlage, zeigen
  // alte `templatePositionId`-Werte auf Positionen, die die Tabelle `tpById`
  // dieses Laufs nicht mehr enthaelt, obwohl die Zeile in `template_positionen`
  // unveraendert fortbesteht — kein FK-Konflikt, gleicher Regel-4-Zweig.)
  it("loest eine UEBERSCHRIEBENE Waise und behaelt sie als manuelle Zeile", () => {
    t.db.insert(sollPositionen).values(
      { id: "sp1", fahrzeugId: "rtw-1", fachLabel: "F", sort: 0, artikelId: "a1", soll: 4,
        templatePositionId: null, ueberschrieben: false, entfernt: false }).run();
    // Verknuepfung auf eine Vorlagen-Position setzen, die gleich geloescht wird.
    t.db.insert(templatePositionen).values(
      { id: "tp-weg", templateId: "tpl", fachLabel: "X", sort: 0,
        artikelId: "a1", soll: 1 }).run();
    t.db.update(sollPositionen)
      .set({ templatePositionId: "tp-weg", ueberschrieben: true })
      .where(eq(sollPositionen.id, "sp1")).run();

    t.sqlite.pragma("defer_foreign_keys = ON");
    const ergebnis = t.db.transaction((tx) => {
      tx.delete(templatePositionen).where(eq(templatePositionen.id, "tp-weg")).run();
      return syncFahrzeugTemplate(tx, "rtw-1");
    });

    expect(ergebnis.losgeloest).toBe(1);
    expect(soll()[0]).toMatchObject(
      { id: "sp1", templatePositionId: null, ueberschrieben: false, soll: 4 });
  });

  it("LOESCHT eine nicht ueberschriebene Waise", () => {
    t.db.insert(templatePositionen).values(
      { id: "tp-weg", templateId: "tpl", fachLabel: "X", sort: 0,
        artikelId: "a1", soll: 1 }).run();
    t.db.insert(sollPositionen).values(
      { id: "sp1", fahrzeugId: "rtw-1", fachLabel: "F", sort: 0, artikelId: "a1", soll: 4,
        templatePositionId: "tp-weg", ueberschrieben: false, entfernt: false }).run();
    verfallAnlegen("verfall-waise");

    t.sqlite.pragma("defer_foreign_keys = ON");
    const ergebnis = t.db.transaction((tx) => {
      tx.delete(templatePositionen).where(eq(templatePositionen.id, "tp-weg")).run();
      return syncFahrzeugTemplate(tx, "rtw-1");
    });

    expect(ergebnis.entfernt).toBe(1);
    expect(soll()).toHaveLength(0);
    expect(t.db.select().from(lagerortVerfall).all()).toEqual([]);
  });

  it("behaelt den Verfall einer Waise bei einer zweiten aktiven Sollposition", () => {
    t.db.insert(templatePositionen).values(
      { id: "tp-weg", templateId: "tpl", fachLabel: "X", sort: 0,
        artikelId: "a1", soll: 1 }).run();
    t.db.insert(sollPositionen).values([
      { id: "sp1", fahrzeugId: "rtw-1", fachLabel: "F", sort: 0, artikelId: "a1", soll: 4,
        templatePositionId: "tp-weg", ueberschrieben: false, entfernt: false },
      { id: "sp2", fahrzeugId: "rtw-1", fachLabel: "G", sort: 1, artikelId: "a1", soll: 2,
        templatePositionId: null, ueberschrieben: false, entfernt: false },
    ]).run();
    verfallAnlegen("verfall-bleibt");

    t.sqlite.pragma("defer_foreign_keys = ON");
    t.db.transaction((tx) => {
      tx.delete(templatePositionen).where(eq(templatePositionen.id, "tp-weg")).run();
      syncFahrzeugTemplate(tx, "rtw-1");
    });

    expect(soll()).toHaveLength(1);
    expect(t.db.select().from(lagerortVerfall).all()).toHaveLength(1);
  });

  it("laesst MANUELLE Zeilen (templatePositionId null) unberuehrt", () => {
    t.db.insert(sollPositionen).values(
      { id: "sp-manuell", fahrzeugId: "rtw-1", fachLabel: "Eigen", sort: 0,
        artikelId: "a1", soll: 3, templatePositionId: null,
        ueberschrieben: false, entfernt: false }).run();
    expect(syncFahrzeugTemplate(t.db, "rtw-1")).toEqual(
      { hinzugefuegt: 0, aktualisiert: 0, uebersprungen: 0, entfernt: 0, losgeloest: 0 });
    expect(soll()).toHaveLength(1);
  });
});

describe("die fuenf Zaehler sind die Bedienrueckmeldung", () => {
  it("zaehlt alle vier Regeln in EINEM Lauf getrennt", () => {
    t.db.insert(templatePositionen).values([
      { id: "tp-neu", templateId: "tpl", fachLabel: "N", sort: 0, artikelId: "a1", soll: 1 },
      { id: "tp-gleich", templateId: "tpl", fachLabel: "G", sort: 1, artikelId: "a1", soll: 2 },
      { id: "tp-anders", templateId: "tpl", fachLabel: "A-neu", sort: 2, artikelId: "a1", soll: 3 },
      { id: "tp-ueber", templateId: "tpl", fachLabel: "U", sort: 3, artikelId: "a1", soll: 4 },
      { id: "tp-tot", templateId: "tpl", fachLabel: "T", sort: 4, artikelId: "a1", soll: 5 },
    ]).run();
    t.db.insert(sollPositionen).values([
      { id: "s-gleich", fahrzeugId: "rtw-1", fachLabel: "G", sort: 1, artikelId: "a1", soll: 2,
        templatePositionId: "tp-gleich", ueberschrieben: false, entfernt: false },
      { id: "s-anders", fahrzeugId: "rtw-1", fachLabel: "A-alt", sort: 2, artikelId: "a1", soll: 9,
        templatePositionId: "tp-anders", ueberschrieben: false, entfernt: false },
      { id: "s-ueber", fahrzeugId: "rtw-1", fachLabel: "U", sort: 3, artikelId: "a1", soll: 99,
        templatePositionId: "tp-ueber", ueberschrieben: true, entfernt: false },
      { id: "s-tot", fahrzeugId: "rtw-1", fachLabel: "T", sort: 4, artikelId: "a1", soll: 5,
        templatePositionId: "tp-tot", ueberschrieben: false, entfernt: false },
    ]).run();
    // ⚠️ ABWEICHUNG VOM BRIEF: siehe Kommentar in "Regel 4 — Waisen". Die
    // Loeschung von `tp-tot`, waehrend `s-tot` noch darauf zeigt, braucht
    // `defer_foreign_keys` und muss in derselben Transaktion wie der heilende
    // Sync laufen, sonst verletzt das blanke DELETE die FK sofort.
    t.sqlite.pragma("defer_foreign_keys = ON");
    const ergebnis = t.db.transaction((tx) => {
      tx.delete(templatePositionen).where(eq(templatePositionen.id, "tp-tot")).run();
      return syncFahrzeugTemplate(tx, "rtw-1");
    });

    expect(ergebnis).toEqual(
      { hinzugefuegt: 1, aktualisiert: 1, uebersprungen: 1, entfernt: 1, losgeloest: 0 });
  });
});
