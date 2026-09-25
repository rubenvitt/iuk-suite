import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { z } from "zod";
import { rechner } from "../../_db/schema";
import eingabenJson from "../kern/testvektoren/eingaben.json";
import { ausBase64 } from "../kern/bytes";
import { ENTWICKLUNGS_KEK } from "../schluessel/kek";
import { legePaarAn } from "../schluessel/paar";
import { testDb } from "../testDb";
import { gibFrei } from "./freigabe";
import { erzeugeSitzung, sitzungAus } from "./sitzung";
import {
  ankerAnfrage, einrichtenAnfrage, einrichtenAntwort, fehler, fehlerKoerper, freigabeAnfrage, freigabeAntwort,
  kettenankerAntwort, sicherungAnfrage, stammdatenpaketSchema, tauschAnfrage, tauschAntwort,
} from "./vertrag";

const ORDNER = join(__dirname, "vertrag");
const SCHEMA: Record<string, z.ZodType> = {
  "tausch.json": tauschAntwort,
  "einrichten.json": einrichtenAntwort,
  "stammdaten.json": stammdatenpaketSchema,
  "freigeben-anfrage.json": freigabeAnfrage,
  "freigeben.json": freigabeAntwort,
  "fehler-echt-vorhanden.json": fehlerKoerper,
  "anker-lesen.json": kettenankerAntwort,
};
const lies = (datei: string): unknown => JSON.parse(readFileSync(join(ORDNER, datei), "utf8"));

/** Hängt an jedes Objekt der Fixture (auch verschachtelt) ein unbekanntes Feld und liefert jede Variante. */
function mitFremdemFeld(x: unknown): unknown[] {
  if (Array.isArray(x)) return x.flatMap((v, i) => mitFremdemFeld(v).map((w) => x.map((u, j) => (i === j ? w : u))));
  if (!x || typeof x !== "object") return [];
  const o = x as Record<string, unknown>;
  return [
    { ...o, unbekannt: 1 },
    ...Object.entries(o).flatMap(([k, v]) => mitFremdemFeld(v).map((w) => ({ ...o, [k]: w }))),
  ];
}

describe("Fixtures unter vertrag/", () => {
  it("jede Datei hat ein Schema, und jedes Schema hat seine Datei", () => {
    expect(readdirSync(ORDNER).sort()).toEqual(Object.keys(SCHEMA).sort());
  });

  for (const [datei, schema] of Object.entries(SCHEMA)) {
    it(`${datei} parst mit ihrem Schema`, () => {
      const r = schema.safeParse(lies(datei));
      expect(r.error?.issues ?? []).toEqual([]);
      // Das Schema darf nichts umformen (kein trim, kein Default): Rust liest die Datei so, wie sie ist.
      expect(r.data).toEqual(lies(datei));
    });
    it(`${datei}: ein unbekanntes Feld auf jeder Ebene wird abgelehnt (wie deny_unknown_fields)`, () => {
      const varianten = mitFremdemFeld(lies(datei));
      expect(varianten.length).toBeGreaterThan(0);
      for (const v of varianten) expect(schema.safeParse(v).success, JSON.stringify(v)).toBe(false);
    });
  }

  it("freigeben-anfrage.json und freigeben.json gehören zusammen: gibFrei über das Paar der Testvektoren liefert genau die Antwort", async () => {
    const eingaben = eingabenJson as unknown as { suite: { privat: JsonWebKey; oeffentlichSpki: string } };
    const privat = await crypto.subtle.importKey("jwk", eingaben.suite.privat, { name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"]);
    const pkcs8 = new Uint8Array(await crypto.subtle.exportKey("pkcs8", privat));
    const db = testDb();
    const jetzt = new Date("2026-09-25T08:00:00Z");
    await legePaarAn(db, { art: "echt", rechnerId: null, kek: ausBase64(ENTWICKLUNGS_KEK), jetzt, paar: { pkcs8, oeffentlich: eingaben.suite.oeffentlichSpki } });
    db.insert(rechner).values({ id: "re", art: "echt", name: "Einsatzleitung", tokenHash: "hash-re", eingerichtetAm: jetzt, eingerichtetVon: "Jana Albers", eingerichtetVonSub: "sub-1" }).run();
    const { token } = erzeugeSitzung(db, { sub: "sub-1", name: "Jana Albers", rechnerId: "re", einrichtung: null, jetzt });
    const s = sitzungAus(db, token, jetzt);
    if (!s) throw new Error("Sitzung fehlt");
    const anfrage = freigabeAnfrage.parse(lies("freigeben-anfrage.json"));
    expect(await gibFrei(db, s, anfrage, { jetzt, env: { EINSATZBUCH_SCHLUESSEL_KEK: ENTWICKLUNGS_KEK } })).toEqual({ ok: true, schluessel: lies("freigeben.json") });
  });

  it("einrichten.json trägt den öffentlichen Schlüssel der Testvektoren und dessen ID", () => {
    const e = einrichtenAntwort.parse(lies("einrichten.json"));
    const eingaben = eingabenJson as unknown as { suite: { oeffentlichSpki: string } };
    expect(e.oeffentlichSpki).toBe(eingaben.suite.oeffentlichSpki);
    expect(e.paket).toEqual(lies("stammdaten.json"));
  });
});

describe("Anfrageschemas", () => {
  const token = "SsR_pWfukpmnu7lamRqzBCfs1-3YeHOJCBy7pH8hkAk";
  it("tauschAnfrage: Code mit 43 Zeichen, Verifier 43–128 Zeichen aus dem PKCE-Alphabet", () => {
    expect(tauschAnfrage.safeParse({ code: token, verifier: "a".repeat(43) }).success).toBe(true);
    expect(tauschAnfrage.safeParse({ code: token, verifier: "a.b~c-d_" + "e".repeat(120) }).success).toBe(true);
    expect(tauschAnfrage.safeParse({ code: token, verifier: "a".repeat(42) }).success).toBe(false);
    expect(tauschAnfrage.safeParse({ code: token, verifier: "a".repeat(129) }).success).toBe(false);
    expect(tauschAnfrage.safeParse({ code: token, verifier: "a".repeat(42) + "+" }).success).toBe(false);
    expect(tauschAnfrage.safeParse({ code: token.slice(1), verifier: "a".repeat(43) }).success).toBe(false);
  });
  it("einrichtenAnfrage: art echt|test, Name getrimmt 1–60 Zeichen", () => {
    expect(einrichtenAnfrage.parse({ art: "test", name: "  Übungsrechner " })).toEqual({ art: "test", name: "Übungsrechner" });
    expect(einrichtenAnfrage.safeParse({ art: "test", name: "   " }).success).toBe(false);
    expect(einrichtenAnfrage.safeParse({ art: "test", name: "x".repeat(61) }).success).toBe(false);
    expect(einrichtenAnfrage.safeParse({ art: "probe", name: "x" }).success).toBe(false);
  });
  it("ankerAnfrage: Block 1…10000, Hash hex64", () => {
    expect(ankerAnfrage.safeParse({ block: 1, hash: "a".repeat(64) }).success).toBe(true);
    expect(ankerAnfrage.safeParse({ block: 10_000, hash: "a".repeat(64) }).success).toBe(true);
    expect(ankerAnfrage.safeParse({ block: 0, hash: "a".repeat(64) }).success).toBe(false);
    expect(ankerAnfrage.safeParse({ block: 10_001, hash: "a".repeat(64) }).success).toBe(false);
    expect(ankerAnfrage.safeParse({ block: 1.5, hash: "a".repeat(64) }).success).toBe(false);
    expect(ankerAnfrage.safeParse({ block: 1, hash: "A".repeat(64) }).success).toBe(false);
  });
  it("kettenankerAntwort: anker mit block ≥ 1 und Hash hex64, oder null", () => {
    expect(kettenankerAntwort.safeParse({ anker: { block: 7, hash: "a".repeat(64) } }).success).toBe(true);
    expect(kettenankerAntwort.safeParse({ anker: null }).success).toBe(true);
    expect(kettenankerAntwort.safeParse({ anker: { block: 0, hash: "a".repeat(64) } }).success).toBe(false);
    expect(kettenankerAntwort.safeParse({ anker: { block: 10_001, hash: "a".repeat(64) } }).success).toBe(true);
    expect(kettenankerAntwort.safeParse({ anker: { block: 7, hash: "A".repeat(64) } }).success).toBe(false);
    expect(kettenankerAntwort.safeParse({}).success).toBe(false);
  });

  it("sicherungAnfrage: Zeitpunkt mit Offset", () => {
    expect(sicherungAnfrage.safeParse({ erstellt: "2026-09-25T10:00:00+02:00" }).success).toBe(true);
    expect(sicherungAnfrage.safeParse({ erstellt: "2026-09-25T10:00:00" }).success).toBe(false);
    expect(sicherungAnfrage.safeParse({ erstellt: "2026-02-30T10:00:00+01:00" }).success).toBe(false);
  });
  it("freigabeAnfrage: mindestens ein Eintrag; die Obergrenze 200 prüft gibFrei (413 statt 400)", () => {
    const eintrag = (lies("freigeben-anfrage.json") as unknown[])[0];
    expect(freigabeAnfrage.safeParse([]).success).toBe(false);
    expect(freigabeAnfrage.safeParse(Array.from({ length: 201 }, () => eintrag)).success).toBe(true);
  });
});

describe("fehler", () => {
  it("antwortet { error: { code, message } } mit Status", async () => {
    const r = fehler(401, "sitzung_ungueltig", "Die Sitzung gilt nicht mehr.");
    expect(r.status).toBe(401);
    expect(r.headers.get("content-type")).toMatch(/^application\/json/);
    expect(await r.json()).toEqual({ error: { code: "sitzung_ungueltig", message: "Die Sitzung gilt nicht mehr." } });
  });
  it("legt Zusatzfelder auf die oberste Ebene; sie überschreiben error nie", async () => {
    const r = fehler(409, "anker_abweichung", "Anker weicht ab.", { erwartet: "a".repeat(64), error: "kaputt" });
    const k = await r.json();
    expect(k).toEqual({ error: { code: "anker_abweichung", message: "Anker weicht ab." }, erwartet: "a".repeat(64) });
    expect(fehlerKoerper.safeParse(k).success).toBe(true);
  });
});
