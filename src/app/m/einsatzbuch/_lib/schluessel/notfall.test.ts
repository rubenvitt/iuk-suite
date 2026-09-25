import { describe, expect, it } from "vitest";
import { utf8 } from "../kern/bytes";
import { KennwortFalsch } from "../kern/export";
import { erzeugeSchluesselpaar } from "../kern/umschlag";
import { erzeugeNotfalldatei, istNotfalldatei, notfallDruckseite, notfallText, oeffneNotfalldatei } from "./notfall";

async function paar() {
  const p = await erzeugeSchluesselpaar();
  const pkcs8 = new Uint8Array(await crypto.subtle.exportKey("pkcs8", p.privateKey));
  const spki = new Uint8Array(await crypto.subtle.exportKey("spki", p.publicKey));
  return { pkcs8, spki };
}
const KW = "ein-langes-notfallkennwort";

describe("Notfall-Sicherung", () => {
  it("Rundlauf, und die Datei nennt 600 000 Runden", async () => {
    const { pkcs8, spki } = await paar();
    const { zuBase64, sha256Hex } = await import("../kern/bytes");
    const kopf = { schluesselId: (await sha256Hex(spki)).slice(0, 16), oeffentlich: zuBase64(spki), erstellt: "2026-09-24T10:00:00+02:00" };
    const d = await erzeugeNotfalldatei(pkcs8, kopf, KW);
    expect(d.kdf.iterationen).toBe(600000);
    expect(istNotfalldatei(JSON.parse(JSON.stringify(d)))).toBe(true);
    expect(await oeffneNotfalldatei(d, KW)).toEqual(pkcs8);
  });
  it("falsches Kennwort → KennwortFalsch; kurzes Kennwort wird beim Erzeugen abgelehnt", async () => {
    const { pkcs8, spki } = await paar();
    const { zuBase64, sha256Hex } = await import("../kern/bytes");
    const kopf = { schluesselId: (await sha256Hex(spki)).slice(0, 16), oeffentlich: zuBase64(spki), erstellt: "2026-09-24T10:00:00+02:00" };
    const d = await erzeugeNotfalldatei(pkcs8, kopf, KW);
    await expect(oeffneNotfalldatei(d, "falsches-kennwort-123")).rejects.toBeInstanceOf(KennwortFalsch);
    await expect(erzeugeNotfalldatei(pkcs8, kopf, "zu-kurz")).rejects.toThrow("mindestens 16 Zeichen");
  });
  it("ein fremder öffentlicher Schlüssel im Kopf fällt beim Öffnen auf", async () => {
    const a = await paar(); const b = await paar();
    const { zuBase64, sha256Hex } = await import("../kern/bytes");
    const kopf = { schluesselId: (await sha256Hex(b.spki)).slice(0, 16), oeffentlich: zuBase64(b.spki), erstellt: "2026-09-24T10:00:00+02:00" };
    const d = await erzeugeNotfalldatei(a.pkcs8, kopf, KW);
    await expect(oeffneNotfalldatei(d, KW)).rejects.toThrow("passt nicht zum öffentlichen Schlüssel");
  });
  it("QR-Nutzlast bleibt unter 1273 Byte (QR Level H), die Druckseite trägt QR und Kennung", async () => {
    const { pkcs8, spki } = await paar();
    const { zuBase64, sha256Hex } = await import("../kern/bytes");
    const kopf = { schluesselId: (await sha256Hex(spki)).slice(0, 16), oeffentlich: zuBase64(spki), erstellt: "2026-09-24T10:00:00+02:00" };
    const d = await erzeugeNotfalldatei(pkcs8, kopf, KW);
    expect(utf8(notfallText(d)).length).toBeLessThan(1273);
    const html = await notfallDruckseite(d);
    expect(html).toContain("<svg");
    expect(html).toContain(kopf.schluesselId);
  });
});
