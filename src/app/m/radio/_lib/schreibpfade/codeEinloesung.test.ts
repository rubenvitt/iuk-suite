// src/app/m/radio/_lib/schreibpfade/codeEinloesung.test.ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import Database from "better-sqlite3";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { eq } from "drizzle-orm";
import * as schema from "../../_db/schema";
import { zugangscodes } from "../../_db/schema";
import { loeseCodeEin } from "./codeEinloesung";
import { verifyAusleihSitzung } from "../ausleihSitzung";

/**
 * DER SCHREIBPFAD DER EINLOESUNG (Spec 1 §3.3.2, Zeilen 2309-2332; Testauftrag §3.8,
 * Zeilen 3100-3102).
 *
 * ⚠️ EIGENE DATEI-DB, NICHT `getModuleDb()` (KONTEXT.md:95-97): dessen Cache ist per
 * MODULSCHLUESSEL gekeyt, nicht per `DATA_DIR` (`src/core/db/index.ts:31-35`) — ein Test,
 * der ihn benutzt, bekaeme die Datenbank des vorigen Tests. Vorbild:
 * `src/app/m/radio/_db/migrations.test.ts:29-37`.
 *
 * ⚠️ `foreign_keys = ON` ist eine VERBINDUNGS-Eigenschaft und in SQLite standardmaessig
 * AUS. Ohne die Zeile waeren die FK-Zusagen dieses Schemas gruen, ohne zu gelten.
 */
const GEHEIMNIS = "radio-test-geheimnis-mindestens-32-zeichen-lang";
const UMGEBUNG = { ...process.env };

let tmp: string;
let sqlite: Database.Database;
let db: ReturnType<typeof drizzle<typeof schema>>;

beforeEach(() => {
  process.env = { ...UMGEBUNG, RADIO_AUSLEIH_SITZUNG_SECRET: GEHEIMNIS };
  tmp = mkdtempSync(join(tmpdir(), "radio-einloesung-"));
  sqlite = new Database(join(tmp, "radio.db"));
  sqlite.pragma("foreign_keys = ON");
  migrate(drizzle(sqlite), { migrationsFolder: "src/app/m/radio/_db/migrations" });
  db = drizzle(sqlite, { schema });
});

afterEach(() => {
  sqlite.close();
  rmSync(tmp, { recursive: true, force: true });
  process.env = { ...UMGEBUNG };
});

const CODE = "A3F7-K92M-QRTV-5X8Y-B6HN-2DPZ-J4KW";

async function legeCodeAn(werte: Partial<typeof zugangscodes.$inferInsert> = {}) {
  const zeile = {
    id: "zc-1",
    code: CODE,
    bezeichnung: "Aufsteller Fahrzeughalle",
    aktiv: true,
    createdAt: new Date(),
    createdBy: "sub-admin",
    ...werte,
  };
  await db.insert(zugangscodes).values(zeile);
  return zeile;
}

describe("radio-Codeeinloesung: der Treffer", () => {
  it("loest einen aktiven Code ein und liefert ein pruefbares Cookie", async () => {
    await legeCodeAn();
    const e = await loeseCodeEin(CODE, db as never);
    expect(e.ok).toBe(true);
    if (!e.ok) return;
    expect(e.codeId).toBe("zc-1");
    // Das Cookie traegt DIESELBE codeId — die Sitzung zeigt auf die Zeile, nicht auf den
    // Klartext-Code (Spec:2503-2506).
    const s = await verifyAusleihSitzung(e.cookieValue);
    expect(s?.codeId).toBe("zc-1");
  });

  it("schreibt last_used_at — nur beim Treffer", async () => {
    await legeCodeAn();
    await loeseCodeEin(CODE, db as never);
    const [zeile] = await db.select().from(zugangscodes).where(eq(zugangscodes.id, "zc-1"));
    expect(zeile?.lastUsedAt, "last_used_at wurde nicht geschrieben").toBeInstanceOf(Date);
  });

  it("bleibt nach der Einloesung einloesbar", async () => {
    /*
     * ⛔ DER FALL, DER EINEN GEDRUCKTEN AUFSTELLER RETTET (Spec:2328-2330, Testauftrag
     * Spec:3098). Es gibt kein `eingeloestAm`, kein Verbrennen. Der Grund ist physisch:
     * der Code steht auf PAPIER im Funkraum, und nacheinander scannen ihn viele Menschen.
     * Ein „einmal einloesbar"-Verhalten machte den Aufsteller nach dem ersten Scan wertlos
     * — und der Fehler faellt erst im Betrieb auf, weil er beim ersten Scan aussieht wie
     * ein Erfolg.
     *
     * ⚠️ Ausdruecklich DREI Einloesungen, nicht zwei: eine Fassung, die den Code beim
     * ZWEITEN Mal entwertet, bestuende einen Zwei-Fall-Test.
     */
    await legeCodeAn();
    for (let i = 0; i < 3; i++) {
      const e = await loeseCodeEin(CODE, db as never);
      expect(e.ok, `Einloesung ${i + 1} scheiterte`).toBe(true);
    }
  });
});

describe("radio-Codeeinloesung: der Nicht-Treffer ist EINE Form", () => {
  it("unbekannt und gesperrt liefern dieselbe Form", async () => {
    /*
     * ⛔ Spec:2330-2332: „Der Nicht-Treffer ist EINE einzige Form — ‚unbekannt‘ und
     * ‚gesperrt‘ sind von aussen nicht unterscheidbar." Sonst entsteht ein ORAKEL:
     * jemand mit einer Liste von Kandidaten koennte herausfinden, welche Codes je
     * vergeben waren, ohne einen gueltigen zu besitzen.
     *
     * ⛔ `toEqual` AUF DAS GANZE OBJEKT, nicht nur auf `ok`. Ein zusaetzliches Feld
     * (`grund: "gesperrt"`) waere genau das Orakel und bestuende ein `expect(e.ok).toBe(false)`.
     */
    await legeCodeAn({ id: "zc-gesperrt", code: CODE, aktiv: false });
    const gesperrt = await loeseCodeEin(CODE, db as never);
    const unbekannt = await loeseCodeEin("ZZZZ-ZZZZ-ZZZZ-ZZZZ-ZZZZ-ZZZZ-ZZZZ", db as never);
    expect(gesperrt).toEqual({ ok: false });
    expect(unbekannt).toEqual({ ok: false });
    expect(gesperrt).toEqual(unbekannt);
  });

  it("ein gesperrter Code schreibt kein last_used_at", async () => {
    /*
     * „Aktivitaet, die es nicht gibt" (Testauftrag Spec:3099). Ein `last_used_at` auf
     * einem gesperrten Code liesse die Verwaltungsliste behaupten, der gesperrte
     * Aufsteller sei gerade benutzt worden — und das ist die eine Information, an der die
     * Leitung erkennt, ob ein verschwundenes Kaertchen noch im Umlauf ist.
     */
    await legeCodeAn({ aktiv: false });
    await loeseCodeEin(CODE, db as never);
    const [zeile] = await db.select().from(zugangscodes).where(eq(zugangscodes.id, "zc-1"));
    expect(zeile?.lastUsedAt).toBeNull();
  });

  it("normalisiert NICHT selbst — ein unnormalisierter Code trifft nicht", async () => {
    /*
     * ⛔ Spec:2318-2322: „Der BEREITS NORMALISIERTE Code. Diese Funktion normalisiert
     * NICHT." Das ist keine Bequemlichkeit, sondern die Voraussetzung des Reihenfolge-
     * Scans in A9: `loeseCodeEin(normalisiereCode(x), db)` erschiene TEXTLICH als
     * „Einloesung vor Normalisieren" (Bestand `tokenEinloesung.ts:50-55`).
     *
     * ⚠️ DIESER FALL SICHERT EINE EIGENSCHAFT ZU, DIE MAN NICHT „WILL" — er haelt eine
     * bewusste Arbeitsteilung fest. Wer ihn spaeter rot findet und `normalisiereCode` in
     * diese Funktion zieht, macht den Reihenfolge-Scan blind.
     *
     * ⚠️ SEINE SONDE IST EINE EINFUEGUNG, KEINE ENTFERNUNG — es gibt hier keine „eine
     * tragende Zeile", die man streichen koennte. Rot wird er, wenn man
     * `code = normalisiereCode(code)` in `codeEinloesung.ts` VORANSTELLT. Gemessen:
     * `normalisiereCode("a3f7k92mqrtv5x8yb6hn2dpzj4kw")` liefert genau `CODE` zurueck
     * (`_lib/code.ts:140-148` — `toUpperCase`, dann `gruppiere` bei genau 28 Zeichen).
     */
    await legeCodeAn();
    const e = await loeseCodeEin(CODE.replace(/-/g, "").toLowerCase(), db as never);
    expect(e).toEqual({ ok: false });
  });

  it.each([["leer", ""], ["Muell", "?!"], ["500 Zeichen", "x".repeat(500)]])(
    "wirft nicht bei %s",
    async (_n, roh) => {
      // Der Wert kommt aus einer URL. Ein Wurf hier waere HTTP 500 im Route Handler.
      await legeCodeAn();
      await expect(loeseCodeEin(roh, db as never)).resolves.toEqual({ ok: false });
    },
  );
});
