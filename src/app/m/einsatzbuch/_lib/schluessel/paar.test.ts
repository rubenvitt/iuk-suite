import { describe, expect, it } from "vitest";
import { testDb } from "../testDb";
import { zufall } from "../kern/bytes";
import { importiereOeffentlich, schluesselIdVon } from "../kern/umschlag";
import { entschluesselePrivat, legePaarAn, PrivatUnlesbar, verschluesselePrivat } from "./paar";

const KEK = new Uint8Array(32).fill(7);
const ANDERER_KEK = new Uint8Array(32).fill(8);

describe("verschluesselePrivat / entschluesselePrivat", () => {
  it("Rundlauf: entschlüsselt liefert wieder den Klartext", async () => {
    const pkcs8 = zufall(64);
    const schluesselId = "aaaaaaaaaaaaaaaa";
    const gespeichert = await verschluesselePrivat(pkcs8, schluesselId, KEK);
    const klar = await entschluesselePrivat(gespeichert, schluesselId, KEK);
    expect(Array.from(klar)).toEqual(Array.from(pkcs8));
  });

  it("wirft PrivatUnlesbar bei anderer schluesselId als AAD", async () => {
    const pkcs8 = zufall(64);
    const gespeichert = await verschluesselePrivat(pkcs8, "aaaaaaaaaaaaaaaa", KEK);
    await expect(entschluesselePrivat(gespeichert, "bbbbbbbbbbbbbbbb", KEK)).rejects.toBeInstanceOf(PrivatUnlesbar);
  });

  it("wirft PrivatUnlesbar bei anderem KEK", async () => {
    const pkcs8 = zufall(64);
    const schluesselId = "aaaaaaaaaaaaaaaa";
    const gespeichert = await verschluesselePrivat(pkcs8, schluesselId, KEK);
    await expect(entschluesselePrivat(gespeichert, schluesselId, ANDERER_KEK)).rejects.toBeInstanceOf(PrivatUnlesbar);
  });

  it("hat das Format <iv base64>:<ct base64>", async () => {
    const gespeichert = await verschluesselePrivat(zufall(64), "aaaaaaaaaaaaaaaa", KEK);
    expect(gespeichert).toMatch(/^[A-Za-z0-9+/=]+:[A-Za-z0-9+/=]+$/);
  });
});

describe("legePaarAn", () => {
  it("erzeugt ohne `paar` ein frisches Paar mit passender schluesselId", async () => {
    const db = testDb();
    const angelegt = await legePaarAn(db, { art: "echt", rechnerId: null, kek: KEK, jetzt: new Date(0) });
    const erwartet = await schluesselIdVon(await importiereOeffentlich(angelegt.oeffentlich));
    expect(angelegt.schluesselId).toBe(erwartet);
  });

  it("ein zweites Paar mit art: echt wirft", async () => {
    const db = testDb();
    await legePaarAn(db, { art: "echt", rechnerId: null, kek: KEK, jetzt: new Date(0) });
    await expect(legePaarAn(db, { art: "echt", rechnerId: null, kek: KEK, jetzt: new Date(0) })).rejects.toThrow();
  });
});
