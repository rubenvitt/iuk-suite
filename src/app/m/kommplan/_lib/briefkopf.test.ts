import { describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { entferneLogo, kopfFuerZeichnung, ladeBriefkopf, LOGO_MELDUNG, setzeOrganisation, speichereLogo } from "./briefkopf";
import { LOGO_FEHLER } from "./logo/logoTyp";
import { testDb } from "./testDb";

const WER = { nutzer: "u1", name: "Jana" };
const T = Date.UTC(2026, 9, 1, 8, 0);
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);
const SVG = new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 2 1" onload="x()"><rect width="2" height="1"/><script>alert(1)</script></svg>');
const sauber = async () => ({ art: "clean" as const });
const audit = (db: ReturnType<typeof testDb>) =>
  (db.all(sql`SELECT action FROM audit_outbox WHERE object_type = 'briefkopf' ORDER BY rowid`) as { action: string }[]).map((z) => z.action);

describe("Briefkopf (Spec §4.4)", () => {
  it("ohne Eintrag ist der Kopf leer — kein Name, kein Logo, kein Ersatz", () => {
    const db = testDb();
    expect(ladeBriefkopf(db)).toEqual({ organisation: null, logo: null, aktualisiertAm: null, aktualisiertVon: null });
    expect(kopfFuerZeichnung(db)).toEqual({ organisation: null, logo: null });
  });
  it("Organisation: getrimmt; leer wird null; über 120 Zeichen und fremde Felder abgewiesen", () => {
    const db = testDb();
    expect(setzeOrganisation(db, { organisation: "  Kreisverband Muster  " }, WER, T)).toEqual({ ok: true });
    expect(ladeBriefkopf(db)).toMatchObject({ organisation: "Kreisverband Muster", aktualisiertVon: "Jana", aktualisiertAm: T });
    expect(setzeOrganisation(db, { organisation: "   " }, WER, T)).toEqual({ ok: true });
    expect(ladeBriefkopf(db).organisation).toBeNull();
    expect(setzeOrganisation(db, { organisation: "x".repeat(121) }, WER, T)).toEqual({ ok: false, fehler: "Höchstens 120 Zeichen." });
    expect(setzeOrganisation(db, { organisation: "A", logo: "x" }, WER, T).ok).toBe(false);
  });
  it("PNG: gescannt, gespeichert, im Kopf als data:-URI", async () => {
    const db = testDb();
    const gescannt: Uint8Array[] = [];
    expect(await speichereLogo(db, PNG, WER, T, async (b) => { gescannt.push(b); return { art: "clean" }; })).toEqual({ ok: true, typ: "image/png" });
    expect(gescannt).toEqual([PNG]);
    expect(ladeBriefkopf(db).logo).toEqual({ typ: "image/png", bytes: PNG.length });
    expect(kopfFuerZeichnung(db).logo).toEqual({ href: `data:image/png;base64,${Buffer.from(PNG).toString("base64")}` });
  });
  it("SVG: gescannt wird die hochgeladene Datei, gespeichert die bereinigte", async () => {
    const db = testDb();
    const gescannt: Uint8Array[] = [];
    expect(await speichereLogo(db, SVG, WER, T, async (b) => { gescannt.push(b); return { art: "clean" }; })).toEqual({ ok: true, typ: "image/svg+xml" });
    expect(gescannt).toEqual([SVG]);
    const gespeichert = Buffer.from(kopfFuerZeichnung(db).logo!.href.split(",")[1], "base64").toString("utf8");
    expect(gespeichert).toContain("<rect");
    expect(gespeichert).not.toMatch(/script|onload/);
  });
  it("ein SVG unter 1 MB, das durch die Bereinigung darüber wächst (&quot;), wird abgelehnt (Review Phase 4)", async () => {
    const db = testDb();
    const kopf = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1 1"><rect width="1" height="1" class=\'';
    const fuss = "'/></svg>";
    const quoten = 1024 * 1024 - kopf.length - fuss.length; // genau 1 MB vor der Bereinigung; jedes " wird zu &quot;
    const svg = new TextEncoder().encode(kopf + '"'.repeat(quoten) + fuss);
    expect(svg.length).toBe(1024 * 1024);
    expect(await speichereLogo(db, svg, WER, T, sauber)).toEqual({ ok: false, fehler: LOGO_MELDUNG.grossNachBereinigung });
    expect(ladeBriefkopf(db).logo).toBeNull();
  });
  it("Befund und Scanfehler lehnen ab — nichts gespeichert (fail-closed)", async () => {
    const db = testDb();
    expect(await speichereLogo(db, PNG, WER, T, async () => ({ art: "infected", signatur: "Eicar" }))).toEqual({ ok: false, fehler: LOGO_MELDUNG.befund });
    expect(await speichereLogo(db, PNG, WER, T, async () => ({ art: "error", grund: "ECONNREFUSED" }))).toEqual({ ok: false, fehler: LOGO_MELDUNG.pruefung });
    expect(ladeBriefkopf(db).logo).toBeNull();
  });
  it("falscher Typ wird nicht einmal gescannt; ein SVG mit DOCTYPE wird abgelehnt", async () => {
    const db = testDb();
    let scans = 0;
    const zaehle = async () => { scans += 1; return { art: "clean" as const }; };
    expect(await speichereLogo(db, new TextEncoder().encode("GIF89a"), WER, T, zaehle)).toEqual({ ok: false, fehler: LOGO_FEHLER.typ });
    expect(scans).toBe(0);
    const r = await speichereLogo(db, new TextEncoder().encode('<!DOCTYPE svg><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1 1"><rect width="1" height="1"/></svg>'), WER, T, zaehle);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.fehler.startsWith("Das SVG lässt sich nicht sicher übernehmen: ")).toBe(true);
    expect(ladeBriefkopf(db).logo).toBeNull();
  });
  it("Hochladen, Ersetzen, Entfernen: je eine Audit-Zeile; Entfernen lässt die Organisation stehen", async () => {
    const db = testDb();
    setzeOrganisation(db, { organisation: "Muster" }, WER, T);
    await speichereLogo(db, PNG, WER, T + 1, sauber);
    await speichereLogo(db, SVG, WER, T + 2, sauber);
    expect(entferneLogo(db, WER, T + 3)).toEqual({ ok: true });
    expect(kopfFuerZeichnung(db)).toEqual({ organisation: "Muster", logo: null });
    expect(audit(db)).toEqual(["create", "update", "update", "update"]);
  });
});
