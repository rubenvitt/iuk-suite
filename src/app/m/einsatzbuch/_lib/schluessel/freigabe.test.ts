import { describe, expect, it } from "vitest";
import { testDb } from "../testDb";
import { zuBase64 } from "../kern/bytes";
import { versiegele } from "../kern/block";
import { beispielEinsatz, kopf } from "../kern/testhilfe";
import { importiereOeffentlich } from "../kern/umschlag";
import eingabenJson from "../kern/testvektoren/eingaben.json";
import erwartetJson from "../kern/testvektoren/erwartet.json";
import type { Block } from "../kern/format";
import { rechner } from "../../_db/schema";
import { legePaarAn } from "./paar";
import { packeAusFuer } from "./freigabe";

const KEK = zuBase64(new Uint8Array(32).fill(7));
const env = { EINSATZBUCH_SCHLUESSEL_KEK: KEK };
const eingaben = eingabenJson as unknown as { suite: { privat: JsonWebKey; oeffentlichSpki: string }; bloecke: { cek: string }[] };
const bloecke = (erwartetJson as unknown as { bloecke: Block[] }).bloecke;

async function vektorPaar() {
  const privat = await crypto.subtle.importKey("jwk", eingaben.suite.privat, { name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"]);
  const pkcs8 = new Uint8Array(await crypto.subtle.exportKey("pkcs8", privat));
  return { pkcs8, oeffentlich: eingaben.suite.oeffentlichSpki };
}

describe("packeAusFuer", () => {
  it("packt jeden Vektorblock mit dem echten Paar zum festen CEK aus", async () => {
    const db = testDb();
    await legePaarAn(db, { art: "echt", rechnerId: null, kek: new Uint8Array(32).fill(7), jetzt: new Date(0), paar: await vektorPaar() });
    for (const [i, b] of bloecke.entries()) {
      const f = await packeAusFuer(b.kopf.schluesselId, b.umschlag, b.kopf, { db, env });
      expect(f.ok && zuBase64(f.cek)).toBe(eingaben.bloecke[i].cek);
      expect(f.ok && f.art).toBe("echt");
    }
  });
  it("ohne KEK 503 kek_fehlt, mit kaputtem KEK 503 kek_ungueltig, mit anderem KEK 503 privat_unlesbar", async () => {
    const db = testDb();
    await legePaarAn(db, { art: "echt", rechnerId: null, kek: new Uint8Array(32).fill(7), jetzt: new Date(0), paar: await vektorPaar() });
    const b = bloecke[0];
    expect(await packeAusFuer(b.kopf.schluesselId, b.umschlag, b.kopf, { db, env: {} })).toMatchObject({ ok: false, status: 503, code: "kek_fehlt" });
    expect(await packeAusFuer(b.kopf.schluesselId, b.umschlag, b.kopf, { db, env: { EINSATZBUCH_SCHLUESSEL_KEK: "kurz" } })).toMatchObject({ ok: false, status: 503, code: "kek_ungueltig" });
    expect(await packeAusFuer(b.kopf.schluesselId, b.umschlag, b.kopf, { db, env: { EINSATZBUCH_SCHLUESSEL_KEK: zuBase64(new Uint8Array(32).fill(8)) } })).toMatchObject({ ok: false, status: 503, code: "privat_unlesbar" });
  });
  it("422: unbekannte ID, Kopf mit anderer ID, vertauschter Umschlag", async () => {
    const db = testDb();
    await legePaarAn(db, { art: "echt", rechnerId: null, kek: new Uint8Array(32).fill(7), jetzt: new Date(0), paar: await vektorPaar() });
    const [b1, b2] = bloecke;
    expect(await packeAusFuer("0000000000000000", b1.umschlag, b1.kopf, { db, env })).toMatchObject({ status: 422, code: "schluessel_unbekannt" });
    expect(await packeAusFuer(b1.kopf.schluesselId, b1.umschlag, { ...b1.kopf, schluesselId: "0000000000000000" }, { db, env })).toMatchObject({ status: 422, code: "schluessel_passt_nicht" });
    expect(await packeAusFuer(b1.kopf.schluesselId, b2.umschlag, b1.kopf, { db, env })).toMatchObject({ status: 422, code: "umschlag_ungueltig" });
  });
  it("Freigaberegel §12: echtes Paar nie für test, Test-Paar nie für echt", async () => {
    const db = testDb();
    await legePaarAn(db, { art: "echt", rechnerId: null, kek: new Uint8Array(32).fill(7), jetzt: new Date(0), paar: await vektorPaar() });
    const b = bloecke[0];
    const alsTest = { ...b.kopf, umgebung: "test" as const };
    expect(await packeAusFuer(b.kopf.schluesselId, b.umschlag, alsTest, { db, env })).toMatchObject({ status: 422, code: "umgebung_passt_nicht" });

    // Seit Stufe 5 verlangt die Konsistenzregel einen existierenden Test-Rechner (`schluesselpaar.rechner_id: kein Test-Rechner`).
    db.insert(rechner).values({ id: "r1", art: "test", name: "Testrechner", tokenHash: "token-r1", eingerichtetAm: new Date(0), eingerichtetVon: "Alice", eingerichtetVonSub: "sub-1" }).run();
    const test = await legePaarAn(db, { art: "test", rechnerId: "r1", kek: new Uint8Array(32).fill(7), jetzt: new Date(0) });
    const oeff = await importiereOeffentlich(test.oeffentlich);
    const tb = await versiegele(beispielEinsatz("T-2026-001"), kopf(1, "0".repeat(64), test.schluesselId, "test"), oeff);
    const ok = await packeAusFuer(test.schluesselId, tb.umschlag, tb.kopf, { db, env });
    expect(ok).toMatchObject({ ok: true, art: "test", rechnerId: "r1" });
    expect(await packeAusFuer(test.schluesselId, tb.umschlag, { ...tb.kopf, umgebung: "echt" }, { db, env })).toMatchObject({ status: 422, code: "umgebung_passt_nicht" });
  });
});
