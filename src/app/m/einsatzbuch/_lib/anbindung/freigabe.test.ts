import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { freigabe, rechner } from "../../_db/schema";
import { ausBase64, zuBase64, zufall } from "../kern/bytes";
import type { Blockkopf } from "../kern/format";
import { kopf } from "../kern/testhilfe";
import { importiereOeffentlich, packeEin } from "../kern/umschlag";
import { ENTWICKLUNGS_KEK } from "../schluessel/kek";
import { legePaarAn } from "../schluessel/paar";
import { testDb, type TestDb } from "../testDb";
import { bereichsText, gibFrei, type FreigabeAnfrage } from "./freigabe";
import { loescheTestRechner, widerrufe } from "./rechner";
import { erzeugeSitzung, sitzungAus, type SitzungZeile } from "./sitzung";
import { freigabeAntwort } from "./vertrag";

const JETZT = new Date("2026-09-25T08:00:00Z");
const env = { EINSATZBUCH_SCHLUESSEL_KEK: ENTWICKLUNGS_KEK };
const kek = ausBase64(ENTWICKLUNGS_KEK);
const PREV = "0".repeat(64);

type Paar = { schluesselId: string; oeffentlich: string };

function legeRechnerAn(db: TestDb, id: string, art: "echt" | "test", name: string) {
  db.insert(rechner).values({ id, art, name, tokenHash: `hash-${id}`, eingerichtetAm: JETZT, eingerichtetVon: "Jana Albers", eingerichtetVonSub: "sub-1" }).run();
}

/** Echtes Paar, echter Rechner `re`, zwei Test-Rechner `r1`/`r2` mit je eigenem Test-Paar. */
async function aufbau() {
  const db = testDb();
  const echt = await legePaarAn(db, { art: "echt", rechnerId: null, kek, jetzt: JETZT });
  legeRechnerAn(db, "re", "echt", "Einsatzleitung");
  legeRechnerAn(db, "r1", "test", "Übungsrechner 1");
  legeRechnerAn(db, "r2", "test", "Übungsrechner 2");
  const t1 = await legePaarAn(db, { art: "test", rechnerId: "r1", kek, jetzt: JETZT });
  const t2 = await legePaarAn(db, { art: "test", rechnerId: "r2", kek, jetzt: JETZT });
  return { db, echt, t1, t2 };
}

function sitzungMit(db: TestDb, rechnerId: string | null): SitzungZeile {
  const { token } = erzeugeSitzung(db, { sub: "sub-1", name: "Jana Albers", rechnerId, einrichtung: null, jetzt: JETZT });
  const s = sitzungAus(db, token, JETZT);
  if (!s) throw new Error("Sitzung fehlt");
  return s;
}

async function posten(paar: Paar, block: number, umgebung: Blockkopf["umgebung"]) {
  const cek = zufall(32);
  const k = kopf(block, PREV, paar.schluesselId, umgebung);
  return { eintrag: { kopf: k, umschlag: await packeEin(cek, k, await importiereOeffentlich(paar.oeffentlich)) }, cek: zuBase64(cek) };
}

async function anfrage(paar: Paar, bloecke: number[], umgebung: Blockkopf["umgebung"]) {
  const p = await Promise.all(bloecke.map((b) => posten(paar, b, umgebung)));
  return { anfrage: p.map((x) => x.eintrag) as FreigabeAnfrage, erwartet: p.map((x, i) => ({ block: bloecke[i], cek: x.cek })) };
}

const freigaben = (db: TestDb) => db.select().from(freigabe).all();
const auditFreigaben = (db: TestDb) =>
  db.all(sql`SELECT action, actor FROM audit_outbox WHERE object_type = 'freigabe'`) as { action: string; actor: string }[];

describe("gibFrei", () => {
  it("Test-Sitzung und eigene Test-Köpfe: die CEKs sind die eingepackten", async () => {
    const { db, t1 } = await aufbau();
    const { anfrage: a, erwartet } = await anfrage(t1, [1, 2, 3], "test");
    const e = await gibFrei(db, sitzungMit(db, "r1"), a, { jetzt: JETZT, env });
    expect(e).toEqual({ ok: true, schluessel: erwartet });
    expect(freigabeAntwort.safeParse(e.ok && e.schluessel).success).toBe(true);
  });

  it("echte Sitzung und echte Köpfe: gibt frei", async () => {
    const { db, echt } = await aufbau();
    const { anfrage: a, erwartet } = await anfrage(echt, [7], "echt");
    expect(await gibFrei(db, sitzungMit(db, "re"), a, { jetzt: JETZT, env })).toEqual({ ok: true, schluessel: erwartet });
  });

  it("Erfolg schreibt genau eine freigabe-Zeile und eine Audit-Zeile mit dem Akteur der Person", async () => {
    const { db, t1 } = await aufbau();
    const { anfrage: a } = await anfrage(t1, [3, 1, 2], "test");
    expect((await gibFrei(db, sitzungMit(db, "r1"), a, { jetzt: JETZT, env })).ok).toBe(true);
    expect(freigaben(db)).toEqual([{
      id: expect.any(String), zeitpunkt: JETZT, sub: "sub-1", name: "Jana Albers", art: "test",
      rechnerId: "r1", rechnerName: "Übungsrechner 1", bloecke: "1–3", anzahl: 3,
    }]);
    const audit = auditFreigaben(db);
    expect(audit).toHaveLength(1);
    expect(audit[0].action).toBe("create");
    expect(JSON.parse(audit[0].actor)).toEqual({ kind: "user", id: "sub-1", name: "Jana Albers" });
  });

  it("die freigabe-Zeile überlebt das Löschen ihres Test-Rechners (Entscheidung 4)", async () => {
    const { db, t1 } = await aufbau();
    const { anfrage: a } = await anfrage(t1, [1], "test");
    expect((await gibFrei(db, sitzungMit(db, "r1"), a, { jetzt: JETZT, env })).ok).toBe(true);
    const zeile = freigaben(db);
    expect(loescheTestRechner(db, "r1")).toBe("geloescht");
    expect(freigaben(db)).toEqual(zeile);
    expect(zeile[0]).toMatchObject({ rechnerId: "r1", rechnerName: "Übungsrechner 1" });
  });

  it("fremdes Test-Paar: 422 fremder_rechner, die Meldung nennt beide Rechner", async () => {
    const { db, t2 } = await aufbau();
    const { anfrage: a } = await anfrage(t2, [1], "test");
    const e = await gibFrei(db, sitzungMit(db, "r1"), a, { jetzt: JETZT, env });
    expect(e).toMatchObject({ ok: false, status: 422, code: "fremder_rechner" });
    expect(!e.ok && e.message).toContain("r1");
    expect(!e.ok && e.message).toContain("r2");
  });

  it("Umgebung gemischt: 422 umgebung_gemischt", async () => {
    const { db, t1 } = await aufbau();
    const test = await anfrage(t1, [1], "test");
    const echt = await anfrage(t1, [2], "echt");
    expect(await gibFrei(db, sitzungMit(db, "r1"), [...test.anfrage, ...echt.anfrage], { jetzt: JETZT, env }))
      .toMatchObject({ ok: false, status: 422, code: "umgebung_gemischt" });
  });

  it("echter Kopf auf Test-Sitzung und Test-Kopf auf echter Sitzung: 422 art_passt_nicht", async () => {
    const { db, echt, t1 } = await aufbau();
    const e = await anfrage(echt, [1], "echt");
    expect(await gibFrei(db, sitzungMit(db, "r1"), e.anfrage, { jetzt: JETZT, env })).toMatchObject({ ok: false, status: 422, code: "art_passt_nicht" });
    const t = await anfrage(t1, [1], "test");
    expect(await gibFrei(db, sitzungMit(db, "re"), t.anfrage, { jetzt: JETZT, env })).toMatchObject({ ok: false, status: 422, code: "art_passt_nicht" });
  });

  it("fremde schluesselId: 422 schluessel_unbekannt, die Meldung nennt die ID", async () => {
    const { db } = await aufbau();
    const fremd = await legePaarAn(testDb(), { art: "echt", rechnerId: null, kek, jetzt: JETZT });
    const { anfrage: a } = await anfrage(fremd, [1], "test");
    const e = await gibFrei(db, sitzungMit(db, "r1"), a, { jetzt: JETZT, env });
    expect(e).toMatchObject({ ok: false, status: 422, code: "schluessel_unbekannt" });
    expect(!e.ok && e.message).toContain(fremd.schluesselId);
  });

  it("Ablehnungen aus packeAusFuer kommen durch: Umgebung passt nicht zum Paar, vertauschter Umschlag", async () => {
    const { db, t1 } = await aufbau();
    const { anfrage: a } = await anfrage(t1, [1], "echt");
    expect(await gibFrei(db, sitzungMit(db, "r1"), a, { jetzt: JETZT, env })).toMatchObject({ ok: false, status: 422, code: "umgebung_passt_nicht" });
    const b = await anfrage(t1, [1, 2], "test");
    const vertauscht = [{ ...b.anfrage[0], umschlag: b.anfrage[1].umschlag }];
    expect(await gibFrei(db, sitzungMit(db, "r1"), vertauscht, { jetzt: JETZT, env })).toMatchObject({ ok: false, status: 422, code: "umschlag_ungueltig" });
  });

  it("kein Teilergebnis: ein schlechter Eintrag verwirft die ganze Anfrage, es gibt keine Zeile", async () => {
    const { db, t1, t2 } = await aufbau();
    const gut = await anfrage(t1, [1, 2], "test");
    const schlecht = await anfrage(t2, [3], "test");
    const e = await gibFrei(db, sitzungMit(db, "r1"), [...gut.anfrage, ...schlecht.anfrage], { jetzt: JETZT, env });
    expect(e).toMatchObject({ ok: false, status: 422, code: "fremder_rechner" });
    expect(e).not.toHaveProperty("schluessel");
    expect(freigaben(db)).toEqual([]);
    expect(auditFreigaben(db)).toEqual([]);
  });

  it("200 Einträge gehen, 201 sind 413 zu_viele", async () => {
    const { db, t1 } = await aufbau();
    const nummern = Array.from({ length: 200 }, (_, i) => i + 1);
    const { anfrage: a, erwartet } = await anfrage(t1, nummern, "test");
    const s = sitzungMit(db, "r1");
    expect(await gibFrei(db, s, a, { jetzt: JETZT, env })).toEqual({ ok: true, schluessel: erwartet });
    expect(freigaben(db)[0]).toMatchObject({ bloecke: "1–200", anzahl: 200 });
    expect(await gibFrei(db, s, [...a, a[0]], { jetzt: JETZT, env })).toMatchObject({ ok: false, status: 413, code: "zu_viele" });
    expect(freigaben(db)).toHaveLength(1);
  });

  it("Sitzung ohne Rechner: 403 sitzung_ohne_rechner", async () => {
    const { db, t1 } = await aufbau();
    const { anfrage: a } = await anfrage(t1, [1], "test");
    expect(await gibFrei(db, sitzungMit(db, null), a, { jetzt: JETZT, env })).toMatchObject({ ok: false, status: 403, code: "sitzung_ohne_rechner" });
  });

  it("Sitzungsrechner nach sitzungAus widerrufen: die ältere SitzungZeile gibt nichts mehr frei (403), keine Zeile", async () => {
    const { db, echt, t1 } = await aufbau();
    const test = sitzungMit(db, "r1");
    const echte = sitzungMit(db, "re");
    const { anfrage: at } = await anfrage(t1, [1], "test");
    const { anfrage: ae } = await anfrage(echt, [1], "echt");
    expect(widerrufe(db, "r1", JETZT)).toBe(true);
    expect(widerrufe(db, "re", JETZT)).toBe(true);
    expect(await gibFrei(db, test, at, { jetzt: JETZT, env })).toMatchObject({ ok: false, status: 403, code: "sitzung_ohne_rechner" });
    expect(await gibFrei(db, echte, ae, { jetzt: JETZT, env })).toMatchObject({ ok: false, status: 403, code: "sitzung_ohne_rechner" });
    expect(freigaben(db)).toEqual([]);
  });

  it("Sitzungsrechner nach sitzungAus gelöscht: die ältere SitzungZeile gibt nichts mehr frei (403)", async () => {
    const { db, t1 } = await aufbau();
    const s = sitzungMit(db, "r1");
    const { anfrage: a } = await anfrage(t1, [1], "test");
    expect(loescheTestRechner(db, "r1")).toBe("geloescht");
    expect(await gibFrei(db, s, a, { jetzt: JETZT, env })).toMatchObject({ ok: false, status: 403, code: "sitzung_ohne_rechner" });
    expect(freigaben(db)).toEqual([]);
  });

  it("ohne KEK: 503 kek_fehlt, keine Zeile", async () => {
    const { db, t1 } = await aufbau();
    const { anfrage: a } = await anfrage(t1, [1], "test");
    expect(await gibFrei(db, sitzungMit(db, "r1"), a, { jetzt: JETZT, env: {} })).toMatchObject({ ok: false, status: 503, code: "kek_fehlt" });
    expect(await gibFrei(db, sitzungMit(db, "r1"), a, { jetzt: JETZT, env: { EINSATZBUCH_SCHLUESSEL_KEK: "kurz" } })).toMatchObject({ ok: false, status: 503, code: "kek_ungueltig" });
    expect(freigaben(db)).toEqual([]);
  });
});

describe("bereichsText", () => {
  it("fasst Läufe zu Bereichen mit Halbgeviertstrich zusammen", () => {
    expect(bereichsText([1, 2, 3, 5, 7, 8])).toBe("1–3, 5, 7–8");
    expect(bereichsText([5])).toBe("5");
    expect(bereichsText([])).toBe("");
  });
  it("sortiert und entfernt Doppelte", () => {
    expect(bereichsText([8, 3, 1, 2, 2, 7])).toBe("1–3, 7–8");
    expect(bereichsText([10, 9, 11, 1])).toBe("1, 9–11");
  });
});
