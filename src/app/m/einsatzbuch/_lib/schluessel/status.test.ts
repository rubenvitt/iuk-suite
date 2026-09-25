import { describe, expect, it } from "vitest";
import { testDb } from "../testDb";
import { zuBase64 } from "../kern/bytes";
import { ENTWICKLUNGS_KEK, KEK_VARIABLE } from "./kek";
import { legePaarAn } from "./paar";
import { schluesselStatus } from "./status";

const KEK = new Uint8Array(32).fill(7);
const KEK_B64 = zuBase64(KEK);
const ANDERER_KEK_B64 = zuBase64(new Uint8Array(32).fill(8));

describe("schluesselStatus", () => {
  it("kek: fehlt ohne Variable", async () => {
    const db = testDb();
    expect(await schluesselStatus(db, {})).toMatchObject({ kek: "fehlt" });
  });

  it("kek: ungueltig bei 'abc', bei 31 Byte und bei 33 Byte", async () => {
    const db = testDb();
    expect(await schluesselStatus(db, { [KEK_VARIABLE]: "abc" })).toMatchObject({ kek: "ungueltig" });
    expect(await schluesselStatus(db, { [KEK_VARIABLE]: zuBase64(new Uint8Array(31)) })).toMatchObject({ kek: "ungueltig" });
    expect(await schluesselStatus(db, { [KEK_VARIABLE]: zuBase64(new Uint8Array(33)) })).toMatchObject({ kek: "ungueltig" });
  });

  it("paar: fehlt ohne Paar", async () => {
    const db = testDb();
    expect(await schluesselStatus(db, { [KEK_VARIABLE]: KEK_B64 })).toMatchObject({ kek: "ok", paar: "fehlt", schluesselId: null });
  });

  it("paar: ok mit passendem KEK", async () => {
    const db = testDb();
    const angelegt = await legePaarAn(db, { art: "echt", rechnerId: null, kek: KEK, jetzt: new Date(0) });
    expect(await schluesselStatus(db, { [KEK_VARIABLE]: KEK_B64 })).toMatchObject({ kek: "ok", paar: "ok", schluesselId: angelegt.schluesselId });
  });

  it("paar: kek_passt_nicht mit anderem gültigem KEK", async () => {
    const db = testDb();
    const angelegt = await legePaarAn(db, { art: "echt", rechnerId: null, kek: KEK, jetzt: new Date(0) });
    expect(await schluesselStatus(db, { [KEK_VARIABLE]: ANDERER_KEK_B64 })).toMatchObject({ kek: "ok", paar: "kek_passt_nicht", schluesselId: angelegt.schluesselId });
  });

  it("paar: unbekannt bei fehlendem KEK und vorhandenem Paar", async () => {
    const db = testDb();
    const angelegt = await legePaarAn(db, { art: "echt", rechnerId: null, kek: KEK, jetzt: new Date(0) });
    expect(await schluesselStatus(db, {})).toMatchObject({ kek: "fehlt", paar: "unbekannt", schluesselId: angelegt.schluesselId });
  });

  it("entwicklungsKekInProduktion: nur mit Entwicklungs-KEK UND NODE_ENV=production", async () => {
    const db = testDb();
    expect(await schluesselStatus(db, { [KEK_VARIABLE]: ENTWICKLUNGS_KEK, NODE_ENV: "production" })).toMatchObject({ kek: "ok", entwicklungsKekInProduktion: true });
    expect(await schluesselStatus(db, { [KEK_VARIABLE]: ENTWICKLUNGS_KEK, NODE_ENV: "development" })).toMatchObject({ kek: "ok", entwicklungsKekInProduktion: false });
    expect(await schluesselStatus(db, { [KEK_VARIABLE]: ENTWICKLUNGS_KEK })).toMatchObject({ kek: "ok", entwicklungsKekInProduktion: false });
    expect(await schluesselStatus(db, { [KEK_VARIABLE]: KEK_B64, NODE_ENV: "production" })).toMatchObject({ kek: "ok", entwicklungsKekInProduktion: false });
    expect(await schluesselStatus(db, { NODE_ENV: "production" })).toMatchObject({ kek: "fehlt", entwicklungsKekInProduktion: false });
  });

  it("entwicklungsKekInProduktion gilt auch bei vorhandenem Paar (Leerraum um den Wert zählt nicht)", async () => {
    const db = testDb();
    const dev = new Uint8Array(Buffer.from(ENTWICKLUNGS_KEK, "base64"));
    await legePaarAn(db, { art: "echt", rechnerId: null, kek: dev, jetzt: new Date(0) });
    expect(await schluesselStatus(db, { [KEK_VARIABLE]: ` ${ENTWICKLUNGS_KEK}\n`, NODE_ENV: "production" })).toMatchObject({ kek: "ok", paar: "ok", entwicklungsKekInProduktion: true });
  });
});
