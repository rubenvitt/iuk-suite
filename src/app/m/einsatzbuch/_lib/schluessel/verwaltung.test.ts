import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { testDb } from "../testDb";
import { mitLaenge, zuBase64, zufall } from "../kern/bytes";
import { versiegele } from "../kern/block";
import type { Blockkopf, Einsatz } from "../kern/format";
import { erzeugeSchluesselpaar, importiereOeffentlich } from "../kern/umschlag";
import { packeAusFuer } from "./freigabe";
import { AnderesPaarVorhanden, EchtesPaarVorhanden, erzeugeEchtesPaar, stelleEchtesPaarWiederHer } from "./verwaltung";

const KEK = new Uint8Array(32).fill(7);
const ANDERER_KEK = new Uint8Array(32).fill(9);
const KENNWORT = "ein-langes-notfallkennwort";

const zaehler = (db: ReturnType<typeof testDb>, tabelle: string): number =>
  (db.all(sql.raw(`SELECT count(*) AS n FROM ${tabelle}`)) as { n: number }[])[0].n;

const EINSATZ: Einsatz = {
  v: 1,
  nummer: "2026-001",
  stichwort: "Probe",
  beginnDatum: "2026-09-24",
  beginnZeit: "10:00",
  endeDatum: null,
  endeZeit: null,
  strasse: "Teststraße 1",
  ort: "Uelzen",
  objekt: "",
  fahrzeuge: [],
  personal: [],
  vorOrt: 0,
  transport: 0,
  notizen: "",
};

describe("erzeugeEchtesPaar", () => {
  it("legt genau eine Zeile an, deren schluesselId der Notfalldatei entspricht; ein zweiter Aufruf wirft ohne neue Zeile", async () => {
    const db = testDb();
    const { schluesselId, notfall } = await erzeugeEchtesPaar(db, { kek: KEK, kennwort: KENNWORT, jetzt: new Date(0) });
    expect(notfall.kopf.schluesselId).toBe(schluesselId);
    expect(zaehler(db, "schluesselpaar")).toBe(1);
    const paareVorher = zaehler(db, "schluesselpaar");
    const auditVorher = zaehler(db, "audit_outbox");
    await expect(erzeugeEchtesPaar(db, { kek: KEK, kennwort: KENNWORT, jetzt: new Date(0) })).rejects.toBeInstanceOf(EchtesPaarVorhanden);
    expect(zaehler(db, "schluesselpaar")).toBe(paareVorher);
    expect(zaehler(db, "audit_outbox")).toBe(auditVorher);
  });
});

describe("stelleEchtesPaarWiederHer", () => {
  it("legt das Paar in einer leeren DB mit neuem KEK an, und packeAusFuer packt danach einen echt-Block zum selben CEK aus", async () => {
    const quelle = testDb();
    const { notfall } = await erzeugeEchtesPaar(quelle, { kek: KEK, kennwort: KENNWORT, jetzt: new Date(0) });

    const ziel = testDb();
    const r = await stelleEchtesPaarWiederHer(ziel, { kek: ANDERER_KEK, notfall, kennwort: KENNWORT });
    expect(r).toEqual({ schluesselId: notfall.kopf.schluesselId, ersetzt: false });
    expect(zaehler(ziel, "schluesselpaar")).toBe(1);

    const cek = zufall(32);
    const kopf: Blockkopf = { v: 1, block: 1, prev: "0".repeat(64), versiegelt: "2026-09-24T10:00:00+02:00", schluesselId: notfall.kopf.schluesselId, umgebung: "echt" };
    const suiteOeffentlich = await importiereOeffentlich(notfall.kopf.oeffentlich);
    const block = await versiegele(EINSATZ, kopf, suiteOeffentlich, {
      cek,
      iv: mitLaenge(zufall(12), 12, "iv"),
      umschlag: { ephemer: await erzeugeSchluesselpaar(), iv: mitLaenge(zufall(12), 12, "iv") },
    });

    const ausgepackt = await packeAusFuer(notfall.kopf.schluesselId, block.umschlag, block.kopf, { db: ziel, env: { EINSATZBUCH_SCHLUESSEL_KEK: zuBase64(ANDERER_KEK) } });
    expect(ausgepackt).toEqual({ ok: true, cek, art: "echt", rechnerId: null });
  });

  it("ersetzt privatVerschluesselt bei gleicher schluesselId (ersetzt: true)", async () => {
    const db = testDb();
    const { notfall } = await erzeugeEchtesPaar(db, { kek: KEK, kennwort: KENNWORT, jetzt: new Date(0) });
    const r = await stelleEchtesPaarWiederHer(db, { kek: ANDERER_KEK, notfall, kennwort: KENNWORT });
    expect(r).toEqual({ schluesselId: notfall.kopf.schluesselId, ersetzt: true });
    expect(zaehler(db, "schluesselpaar")).toBe(1);

    // Leere, ungültige Hülle: `packeAusFuer` scheitert am Umschlag, nicht am privaten
    // Schlüssel — das beweist, dass er sich mit dem NEUEN KEK entschlüsseln lässt.
    const kopf: Blockkopf = { v: 1, block: 1, prev: "0".repeat(64), versiegelt: notfall.kopf.erstellt, schluesselId: notfall.kopf.schluesselId, umgebung: "echt" };
    const leererUmschlag = { epk: "", iv: "", ct: "" };
    const mitNeuemKek = await packeAusFuer(notfall.kopf.schluesselId, leererUmschlag, kopf, { db, env: { EINSATZBUCH_SCHLUESSEL_KEK: zuBase64(ANDERER_KEK) } });
    expect(mitNeuemKek).toMatchObject({ ok: false, code: "umschlag_ungueltig" });

    // Mit dem alten KEK lässt sich der (neu abgelegte) private Schlüssel nicht mehr lesen.
    const mitAltemKek = await packeAusFuer(notfall.kopf.schluesselId, leererUmschlag, kopf, { db, env: { EINSATZBUCH_SCHLUESSEL_KEK: zuBase64(KEK) } });
    expect(mitAltemKek).toMatchObject({ ok: false, code: "privat_unlesbar" });
  });

  it("bei anderer schluesselId wirft AnderesPaarVorhanden", async () => {
    const db = testDb();
    await erzeugeEchtesPaar(db, { kek: KEK, kennwort: KENNWORT, jetzt: new Date(0) });

    const fremdeQuelle = testDb();
    const { notfall: fremdeNotfall } = await erzeugeEchtesPaar(fremdeQuelle, { kek: KEK, kennwort: KENNWORT, jetzt: new Date(0) });

    await expect(stelleEchtesPaarWiederHer(db, { kek: KEK, notfall: fremdeNotfall, kennwort: KENNWORT })).rejects.toBeInstanceOf(AnderesPaarVorhanden);
    expect(zaehler(db, "schluesselpaar")).toBe(1);
  });
});
