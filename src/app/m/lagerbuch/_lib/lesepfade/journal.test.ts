import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { migrierteTestDb, type TestDb } from "../../_db/testdb";
import { artikel, buchungen, chargen, newId } from "../../_db/schema";
import { journalEintraege } from "./journal";
import { JOURNAL_GRENZE } from "../grenzen";
import { HANDLAGER_ID } from "../konstanten";

const T = (iso: string) => new Date(iso);
let t: TestDb;

function buche(p: { ts: Date; typ?: "zugang" | "entnahme" | "korrektur" | "umlagerung";
                    menge?: number; kommentar?: string | null; referenz?: string | null;
                    artikelId?: string; id?: string }) {
  t.db.insert(buchungen).values({
    id: p.id ?? newId(), ts: p.ts, typ: p.typ ?? "zugang",
    artikelId: p.artikelId ?? "a1", chargeId: "c1", lagerortId: HANDLAGER_ID,
    menge: p.menge ?? 1, quelleTyp: "system", quelleId: "system",
    referenz: p.referenz ?? null, kommentar: p.kommentar ?? null,
  }).run();
}

beforeEach(() => {
  t = migrierteTestDb("lagerbuch-lp-journal-");
  t.db.insert(artikel).values([
    { id: "a1", name: "Verbandpäckchen", einheit: "Stk.", fach: "A1",
      mindestbestand: 0, aktiv: true, createdAt: T("2026-01-01T00:00:00Z") },
    { id: "a2", name: "NaCl", einheit: "Fl.", fach: "B2",
      mindestbestand: 0, aktiv: true, createdAt: T("2026-01-01T00:00:00Z") },
  ]).run();
  t.db.insert(chargen).values(
    { id: "c1", artikelId: "a1", chargenNr: "CH", verfall: "2030-01",
      createdAt: T("2026-01-01T00:00:00Z") }).run();
});
afterEach(() => t.schliessen());

describe("journalEintraege — der Deckel ist BEOBACHTBAR (§5.14.3)", () => {
  it("GRENZE Zeilen -> mehrVorhanden false", () => {
    for (let i = 0; i < JOURNAL_GRENZE; i++) buche({ ts: T("2026-06-01T10:00:00Z") });
    const e = journalEintraege(t.db);
    expect(e.zeilen).toHaveLength(JOURNAL_GRENZE);
    expect(e.mehrVorhanden).toBe(false);
  });

  it("GRENZE + 1 Zeilen -> mehrVorhanden true, geliefert werden GRENZE", () => {
    /**
     * ⚠️ DIE MUTATION, DIE DAS FAENGT (§5.19.3): `GRENZE + 1` auf `GRENZE`
     * zuruecksetzen. Heute schreibt `journal/page.tsx:32` „Zeigt die neuesten 100
     * Treffer" UNBEDINGT — auch wenn drei Zeilen zurueckkommen —, und es gibt im
     * gesamten Modul KEINEN Weg herauszufinden, ob eine Grenze zugeschlagen hat.
     */
    for (let i = 0; i < JOURNAL_GRENZE + 1; i++) buche({ ts: T("2026-06-01T10:00:00Z") });
    const e = journalEintraege(t.db);
    expect(e.zeilen).toHaveLength(JOURNAL_GRENZE);
    expect(e.mehrVorhanden).toBe(true);
  });

  it("respektiert eine kleinere Grenze aus dem Filter", () => {
    for (let i = 0; i < 5; i++) buche({ ts: T("2026-06-01T10:00:00Z") });
    expect(journalEintraege(t.db, { grenze: 3 }).zeilen).toHaveLength(3);
    expect(journalEintraege(t.db, { grenze: 3 }).mehrVorhanden).toBe(true);
  });
});

describe("journalEintraege — die Sortierung ist TOTAL (§5.14.4)", () => {
  it("sortiert ts absteigend und bei Gleichstand id absteigend", () => {
    /**
     * `buchungen.ts` speichert UNIX-SEKUNDEN. Ein Check-Abschluss schreibt
     * Abgleich, Umlagerung und Messungen in einem Rutsch — ALLE teilen denselben
     * Sekundenwert. Ohne Tiebreaker entscheidet die Datenbank, welche Zeile oben
     * steht, und eine zweite identische Anfrage kann eine andere Reihenfolge
     * liefern.
     */
    // EINFUEGEREIHENFOLGE ABSICHTLICH NICHT ALPHABETISCH (T30-Lehre): faelt die
    // Einfuegereihenfolge mit der id-absteigenden Sollreihenfolge zusammen, besteht
    // auch eine Implementierung OHNE echten id-Tiebreaker den Test — SQLite bedient
    // ein blosses `ORDER BY ts DESC` ueber `idx_buchungen_ts` und bricht Gleichstand
    // dabei intern nach ROWID (= Einfuegereihenfolge) auf, nicht nach `id`.
    const gleich = T("2026-06-01T10:00:00Z");
    buche({ ts: gleich, id: "id-ccc" });
    buche({ ts: gleich, id: "id-aaa" });
    buche({ ts: gleich, id: "id-bbb" });
    expect(journalEintraege(t.db).zeilen.map((z) => z.id))
      .toEqual(["id-ccc", "id-bbb", "id-aaa"]);
  });

  it("liefert bei zwei identischen Anfragen DIESELBE Reihenfolge", () => {
    const gleich = T("2026-06-01T10:00:00Z");
    for (const id of ["a", "b", "c", "d", "e"]) buche({ ts: gleich, id: `id-${id}` });
    expect(journalEintraege(t.db).zeilen.map((z) => z.id))
      .toEqual(journalEintraege(t.db).zeilen.map((z) => z.id));
  });

  it("reicht `referenz` durch — sie ist die EINZIGE kausale Klammer", () => {
    // Der Tiebreaker liefert eine TOTALE Ordnung, keine KAUSALE: `buchungen.id`
    // ist ein nanoid() und nicht zeitlich geordnet. Wer die tatsaechliche
    // Reihenfolge braucht, liest `referenz` und `typ`.
    buche({ ts: T("2026-06-01T10:00:00Z"), referenz: "check:abc" });
    expect(journalEintraege(t.db).zeilen[0].referenz).toBe("check:abc");
  });
});

describe("journalEintraege — die Filter greifen VOR dem Limit", () => {
  it("filtert nach Typ", () => {
    buche({ ts: T("2026-06-01T10:00:00Z"), typ: "zugang" });
    buche({ ts: T("2026-06-01T11:00:00Z"), typ: "entnahme", menge: -1 });
    expect(journalEintraege(t.db, { typ: "entnahme" }).zeilen).toHaveLength(1);
  });

  it("filtert INKLUSIV nach von/bis", () => {
    buche({ ts: T("2026-06-01T00:00:00Z") });
    buche({ ts: T("2026-06-15T12:00:00Z") });
    buche({ ts: T("2026-06-30T23:59:59Z") });
    const e = journalEintraege(t.db, {
      von: T("2026-06-01T00:00:00Z"), bis: T("2026-06-30T23:59:59Z"),
    });
    expect(e.zeilen).toHaveLength(3);
  });

  it("sucht ueber die GANZE Historie, nicht nur im Limit-Fenster", () => {
    // `queries.ts:82-85`: die WHERE-Bedingungen greifen VOR dem LIMIT. Sonst
    // durchsuchte die Suche nur die neuesten 100 Zeilen — und faende bei einem
    // wachsenden Journal immer weniger.
    for (let i = 0; i < JOURNAL_GRENZE + 20; i++) {
      buche({ ts: new Date(T("2026-06-01T10:00:00Z").getTime() + i * 60_000) });
    }
    buche({ ts: T("2020-01-01T00:00:00Z"), kommentar: "uraltnadel" });
    const e = journalEintraege(t.db, { q: "uraltnadel" });
    expect(e.zeilen).toHaveLength(1);
    expect(e.mehrVorhanden).toBe(false);
  });
});

describe("journalEintraege — die aufgeloeste Quelle und der Artikelname", () => {
  it("nennt den Artikelnamen", () => {
    buche({ ts: T("2026-06-01T10:00:00Z") });
    expect(journalEintraege(t.db).zeilen[0].artikelName).toBe("Verbandpäckchen");
  });
  it("faellt bei unbekanntem Artikel auf '–' zurueck", () => {
    // Im echten Betrieb ist eine verwaiste Zeile durch den FK auf `artikel.id`
    // ausgeschlossen (kein Loeschpfad existiert in Teil 3) — der Fallback bleibt
    // trotzdem Vertrag (`namen.get(...) ?? "–"`), und ohne die FK-Pruefung kurz
    // abzuschalten ist er in einer migrierten Test-DB nicht erzeugbar.
    t.sqlite.pragma("foreign_keys = OFF");
    buche({ ts: T("2026-06-01T10:00:00Z"), artikelId: "unbekannt" });
    t.sqlite.pragma("foreign_keys = ON");
    expect(journalEintraege(t.db).zeilen[0].artikelName).toBe("–");
  });
  it("loest quelleTyp 'system' auf 'System' auf", () => {
    buche({ ts: T("2026-06-01T10:00:00Z") });
    expect(journalEintraege(t.db).zeilen[0].quelleName).toBe("System");
  });
});
