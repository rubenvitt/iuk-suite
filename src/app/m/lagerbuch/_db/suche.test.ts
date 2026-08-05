import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { migrierteTestDb, type TestDb } from "./testdb";
import { artikel, buchungen, chargen, newId } from "./schema";
import { journalEintraege } from "../_lib/lesepfade/journal";
import { falte } from "../_lib/suche";
import { HANDLAGER_ID } from "../_lib/konstanten";

/**
 * DER DIFFERENZTEST AUS §5.13.2.
 *
 * Die Journalsuche laeuft ueber ZWEI Haelften: der Artikelname in JavaScript
 * (`toLowerCase`, unicode-faehig), der Kommentar in SQL (`LIKE`, faltet NUR A–Z).
 * Gemessen gegen better-sqlite3 12.11.1 laufen sie genau dann auseinander, wenn
 * der Begriff einen NICHT-ASCII-Buchstaben enthaelt, dessen Gross-/Kleinschreibung
 * vom gespeicherten Text abweicht. `PÄCKCHEN` findet den Artikel und VERLIERT
 * JEDEN KOMMENTAR, der `Päckchen` normal schreibt — ohne Rueckmeldung, die Seite
 * zeigt einfach weniger Zeilen.
 *
 * Die Heilung ist die registrierte SQL-Funktion `lb_falte` (Teil 1, T12), die
 * DIESELBE `falte` benutzt wie die JS-Haelfte.
 *
 * ⚠️ DIESE DATEI LAEUFT GEGEN EINE ECHTE VERBINDUNG — `lb_falte` existiert nur
 * dort. Ein Mock traege die Aussage nicht.
 */
const NOW = new Date("2026-06-01T10:00:00Z");
let t: TestDb;

beforeEach(() => {
  t = migrierteTestDb("lagerbuch-suche-");
  t.db.insert(artikel).values([
    { id: "a-paeck", name: "Verbandpäckchen", einheit: "Stk.", fach: "A1",
      mindestbestand: 0, aktiv: true, createdAt: NOW },
    { id: "a-strasse", name: "Straßenkarte", einheit: "Stk.", fach: "B2",
      mindestbestand: 0, aktiv: true, createdAt: NOW },
  ]).run();
  t.db.insert(chargen).values([
    { id: "c1", artikelId: "a-paeck", chargenNr: "CH", verfall: "2030-01", createdAt: NOW },
    { id: "c2", artikelId: "a-strasse", chargenNr: "CH2", verfall: "2030-01", createdAt: NOW },
  ]).run();
  const b = (artikelId: string, chargeId: string, kommentar: string | null) => ({
    id: newId(), ts: NOW, typ: "zugang" as const, artikelId, chargeId,
    lagerortId: HANDLAGER_ID, menge: 1, quelleTyp: "system" as const,
    quelleId: "system", referenz: null, kommentar,
  });
  t.db.insert(buchungen).values([
    b("a-paeck", "c1", "Nachschub Päckchen geliefert"),
    b("a-paeck", "c1", "NACHSCHUB PÄCKCHEN"),
    b("a-strasse", "c2", "Straße nachbestellt"),
    b("a-paeck", "c1", null),
  ]).run();
});
afterEach(() => t.schliessen());

/** Die JS-Haelfte, ausgeschrieben — sie ist die Referenz, gegen die die
 *  SQL-Haelfte gehalten wird. */
function jsTrifft(text: string | null, begriff: string): boolean {
  if (text === null) return false;
  return falte(text).includes(falte(begriff));
}

describe("lb_falte — die SQL-Haelfte faltet wie die JS-Haelfte", () => {
  it("SELECT lb_falte('Ä') liefert 'ä'", () => {
    // Die Grundzusage. Ohne sie ist alles Weitere gegenstandslos.
    const r = t.sqlite.prepare("select lb_falte(?) as f").get("Ä") as { f: string };
    expect(r.f).toBe("ä");
  });

  it("liefert null fuer null — ein Kommentar darf fehlen", () => {
    const r = t.sqlite.prepare("select lb_falte(?) as f").get(null) as { f: string | null };
    expect(r.f).toBeNull();
  });
});

describe("PÄCKCHEN in Grossschreibung — der Fall, der heute bricht", () => {
  it("findet BEIDE Kommentare UND den Artikel", () => {
    const zeilen = journalEintraege(t.db, { q: "PÄCKCHEN" }).zeilen;
    // Drei Zeilen des Artikels „Verbandpäckchen" (Namenstreffer) — davon zwei mit
    // Kommentar. Ohne lb_falte faende die SQL-Haelfte KEINEN der beiden.
    expect(zeilen).toHaveLength(3);
  });

  it("findet einen Kommentar-Treffer AUCH wenn der Artikelname NICHT trifft", () => {
    /**
     * DER EIGENTLICHE BEWEIS FUER journalEintraege SELBST: die drei a-paeck-Zeilen
     * oben werden AUCH ueber den Artikelnamen gefunden (`Verbandpäckchen` matcht
     * `PÄCKCHEN`) — ein Test, der nur ihre Anzahl zaehlt, bliebe GRUEN, selbst
     * wenn die Kommentarhaelfte `lb_falte` verlöre. Diese Zeile haengt am Artikel
     * `Straßenkarte`, dessen NAME `PÄCKCHEN` nicht trifft — nur `lb_falte(kommentar)`
     * kann sie finden. Ohne `lb_falte` (rohe Spalte) faltet SQLite's LIKE das `Ä`
     * NICHT zu `ä` (nur ASCII wird gefaltet), und die Zeile verschwindet lautlos.
     */
    t.db.insert(buchungen).values({
      id: newId(), ts: NOW, typ: "zugang", artikelId: "a-strasse", chargeId: "c2",
      lagerortId: HANDLAGER_ID, menge: 1, quelleTyp: "system", quelleId: "system",
      referenz: null, kommentar: "SONDERBESTELLUNG PÄCKCHEN",
    }).run();
    const zeilen = journalEintraege(t.db, { q: "PÄCKCHEN" }).zeilen;
    expect(zeilen.some((z) => z.kommentar === "SONDERBESTELLUNG PÄCKCHEN")).toBe(true);
  });

  it("die SQL-Haelfte trifft GENAU dieselben Kommentare wie die JS-Haelfte", () => {
    /**
     * DER EIGENTLICHE DIFFERENZTEST: fuer JEDEN Kommentar im Korpus muss die
     * Trefferentscheidung beider Haelften uebereinstimmen. Geprueft ueber einen
     * Artikel, den der NAME nicht trifft — sonst verdeckte der Namenstreffer die
     * Kommentar-Haelfte.
     */
    for (const begriff of ["PÄCKCHEN", "päckchen", "Päckchen", "nachschub", "NACHSCHUB"]) {
      const perSql = t.sqlite
        .prepare("select kommentar from buchungen where lb_falte(kommentar) like ? escape '\\'")
        .all(`%${falte(begriff).replace(/[\\%_]/g, (c) => `\\${c}`)}%`)
        .map((r) => (r as { kommentar: string }).kommentar);
      const perJs = (t.db.select().from(buchungen).all())
        .filter((b) => jsTrifft(b.kommentar, begriff))
        .map((b) => b.kommentar!);
      expect(perSql.sort(), `Begriff ${begriff}`).toEqual(perJs.sort());
    }
  });
});

describe("die Gegenprobe: ss/ß wird ausdruecklich NICHT geheilt", () => {
  it("STRASSE findet 'Straße' in KEINER der beiden Haelften", () => {
    /**
     * §5.13.2, §5.20: gemessen ist `'Straße' LIKE '%STRASSE%'` → 0, und
     * `"STRASSE".toLowerCase()` ist `"strasse"`, was in `"straße"` nicht vorkommt.
     * Das ist KEINE Divergenz zwischen den Haelften, sondern eine GEMEINSAME
     * Luecke — und sie bleibt: eine Normalisierung, die ß auf ss faltet, erzeugt
     * Treffer, die niemand gesucht hat („Massen"/„Maßen").
     */
    expect(journalEintraege(t.db, { q: "STRASSE" }).zeilen).toHaveLength(0);
    expect(jsTrifft("Straße nachbestellt", "STRASSE")).toBe(false);
  });

  it("STRASSE findet auch den ARTIKELNAMEN nicht — beide Haelften gleich blind", () => {
    expect(jsTrifft("Straßenkarte", "STRASSE")).toBe(false);
  });

  it("'Straße' in Kleinschreibung findet beide Seiten", () => {
    expect(journalEintraege(t.db, { q: "straße" }).zeilen.length).toBeGreaterThan(0);
  });
});

describe("LIKE-Sonderzeichen werden woertlich behandelt", () => {
  it("'%' findet nicht jeden Kommentar", () => {
    // `queries.ts:99`: ohne Escapen matcht „5%" jeden Kommentar mit einer 5.
    t.db.insert(buchungen).values({
      id: newId(), ts: NOW, typ: "zugang", artikelId: "a-paeck", chargeId: "c1",
      lagerortId: HANDLAGER_ID, menge: 1, quelleTyp: "system", quelleId: "system",
      referenz: null, kommentar: "Rabatt 5% erhalten",
    }).run();
    expect(journalEintraege(t.db, { q: "5%" }).zeilen).toHaveLength(1);
    expect(journalEintraege(t.db, { q: "%" }).zeilen).toHaveLength(1);
  });

  it("'_' ist kein Platzhalter", () => {
    t.db.insert(buchungen).values({
      id: newId(), ts: NOW, typ: "zugang", artikelId: "a-paeck", chargeId: "c1",
      lagerortId: HANDLAGER_ID, menge: 1, quelleTyp: "system", quelleId: "system",
      referenz: null, kommentar: "Los_42",
    }).run();
    expect(journalEintraege(t.db, { q: "Los_42" }).zeilen).toHaveLength(1);
    expect(journalEintraege(t.db, { q: "Los.42" }).zeilen).toHaveLength(0);
  });
});
