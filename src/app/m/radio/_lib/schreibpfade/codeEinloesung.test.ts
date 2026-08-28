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
 * DER SCHREIBPFAD DER EINLOESUNG (Spec 1 §3.3.2, Zeilen 2309-2336; Testauftrag §3.8,
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
// Ein ZWEITER, ebenfalls gueltiger Aufsteller. Absichtlich NICHT der Muellwert
// "ZZZZ-..." aus dem Unbekannt-Fall: derselbe Text einmal als gueltige Zeile und einmal
// als nie vergebener Code waere eine Falle fuer den naechsten Leser.
// ⚠️ JEDES ZEICHEN STEHT IN `CODE_ALPHABET` (`_lib/code.ts:53`) — Crockford-Base32 OHNE
// I, L, O, U (`_lib/code.ts:47`). Ein Fixture-Code, den der Erzeuger des Moduls nie
// ausgeben koennte, waere eine Erfindung mit gueltigem Aussehen.
const ZWEITER_CODE = "B4G8-M03N-RSVW-6Y9Z-C7JP-3EQA-K5MX";

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
    const e = await loeseCodeEin(CODE, db);
    expect(e.ok).toBe(true);
    if (!e.ok) return;
    expect(e.codeId).toBe("zc-1");
    // Das Cookie traegt DIESELBE codeId — die Sitzung zeigt auf die Zeile, nicht auf den
    // Klartext-Code (Spec:2503-2506).
    const s = await verifyAusleihSitzung(e.cookieValue);
    expect(s?.codeId).toBe("zc-1");
  });

  it("schreibt last_used_at — nur beim Treffer", async () => {
    /*
     * ⛔ ZWEI ZEILEN, UND DAS IST DIE HALBE ZUSAGE. „Nur beim Treffer" heisst auch „nur
     * auf der GETROFFENEN Zeile": ein `UPDATE` ohne `WHERE` stempelte bei jeder
     * Einloesung ALLE Aufsteller. Das ist derselbe Schaden, den `codeEinloesung.ts:66-69`
     * fuer den gesperrten Code ausschreibt — nur traefe er dann die uebrigen, und die
     * Verwaltungsliste zeigte flaechendeckend Aktivitaet, die es nicht gibt.
     *
     * ⚠️ MIT NUR EINER FIXTURE-ZEILE IST DIESER FALL BLIND: gemessen in der Fix-Runde 1
     * zu A6 — `.where(eq(zugangscodes.id, zeile.id))` ersatzlos entfernt liess alle neun
     * Faelle gruen.
     */
    await legeCodeAn();
    await legeCodeAn({ id: "zc-2", code: ZWEITER_CODE });
    await loeseCodeEin(CODE, db);
    const [zeile] = await db.select().from(zugangscodes).where(eq(zugangscodes.id, "zc-1"));
    expect(zeile?.lastUsedAt, "last_used_at wurde nicht geschrieben").toBeInstanceOf(Date);
    const [fremde] = await db.select().from(zugangscodes).where(eq(zugangscodes.id, "zc-2"));
    expect(fremde?.lastUsedAt, "ein fremder Aufsteller wurde mitgestempelt").toBeNull();
  });

  it("stempelt last_used_at auch ueber einen vorhandenen Wert", async () => {
    /*
     * ⛔ NICHT NUR BEIM ERSTEN MAL. Eine Fassung, die den Stempel nur setzt, solange er
     * NULL ist, bestuende jeden Fall, der bloss „irgendein Datum" prueft — und die
     * Verwaltungsliste zeigte dauerhaft den Tag der Inbetriebnahme statt des letzten
     * Scans. Damit faellt genau die Information weg, an der die Leitung erkennt, ob ein
     * verschwundenes Kaertchen noch im Umlauf ist (`_db/schema.ts:190-192`).
     * Gemessen in der Fix-Runde 1 zu A6: ohne diesen Fall blieben alle neun gruen.
     *
     * ⚠️ DER NAME SAGT „ueber einen vorhandenen Wert", NICHT „bei jeder Einloesung": der
     * Fall loest EINMAL ein, gegen eine Zeile, die schon einen Stempel traegt. Das ist
     * genau die Eigenschaft, die der Sonde standhaelt — ein Name, der mehr verspraeche
     * als die Zusicherung prueft, ist in diesem Repo schon einmal teuer geworden.
     *
     * ⚠️ GEMESSEN WIRD GEGEN EINEN GESETZTEN ALTWERT, NICHT GEGEN DIE UHR. Die Spalte
     * ist `mode: "timestamp"` und damit sekundengenau (`_db/schema.ts:192`); zwei
     * Einloesungen in derselben Sekunde lieferten denselben Wert, und ein
     * `toBeGreaterThan` waere launisch. Der Altwert ist von jedem „jetzt" verschieden.
     *
     * ⚠️ `toBeInstanceOf(Date)` steht VOR dem Vergleich und ist nicht schmueckend: auf
     * einer NULL-Zeile ergaebe `zeile?.lastUsedAt?.getTime()` `undefined`, und das
     * bestuende das `not.toBe` leer.
     */
    const VERALTET = new Date("2020-01-01T00:00:00.000Z");
    await legeCodeAn({ lastUsedAt: VERALTET });
    await loeseCodeEin(CODE, db);
    const [zeile] = await db.select().from(zugangscodes).where(eq(zugangscodes.id, "zc-1"));
    expect(zeile?.lastUsedAt).toBeInstanceOf(Date);
    expect(
      zeile?.lastUsedAt?.getTime(),
      "der Stempel blieb auf dem Altwert stehen",
    ).not.toBe(VERALTET.getTime());
  });

  it("bleibt nach der Einloesung einloesbar", async () => {
    /*
     * ⛔ DER FALL, DER EINEN GEDRUCKTEN AUFSTELLER RETTET (Spec:2328-2330, Testauftrag
     * Spec:3100). Es gibt kein `eingeloestAm`, kein Verbrennen. Der Grund ist physisch:
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
      const e = await loeseCodeEin(CODE, db);
      expect(e.ok, `Einloesung ${i + 1} scheiterte`).toBe(true);
    }
  });
});

describe("radio-Codeeinloesung: der Nicht-Treffer ist EINE Form", () => {
  it("unbekannt und gesperrt liefern dieselbe Form", async () => {
    /*
     * ⛔ Spec:2334-2336: „Der Nicht-Treffer ist EINE einzige Form — ‚unbekannt‘ und
     * ‚gesperrt‘ sind von aussen nicht unterscheidbar." Sonst entsteht ein ORAKEL:
     * jemand mit einer Liste von Kandidaten koennte herausfinden, welche Codes je
     * vergeben waren, ohne einen gueltigen zu besitzen.
     *
     * ⛔ `toStrictEqual` AUF DAS GANZE OBJEKT, nicht nur auf `ok`. Ein zusaetzliches Feld
     * (`grund: "gesperrt"`) waere genau das Orakel und bestuende ein `expect(e.ok).toBe(false)`.
     *
     * ⚠️ UND ES MUSS `toStrictEqual` SEIN, NICHT `toEqual`: `toEqual` uebergeht
     * Eigenschaften mit dem Wert `undefined`. Ein Zweig, der fuer „gesperrt"
     * `{ ok: false, grund: undefined }` zurueckgaebe, waere ueber `"grund" in e` von
     * aussen unterscheidbar — also das Orakel — und bliebe unter `toEqual` gruen.
     * Gemessen in der Fix-Runde 1 zu A6, an dieser Datei mit ihren zehn Faellen:
     * 10 von 10 gruen mit `toEqual`, 1 rot mit `toStrictEqual`.
     */
    await legeCodeAn({ id: "zc-gesperrt", code: CODE, aktiv: false });
    const gesperrt = await loeseCodeEin(CODE, db);
    const unbekannt = await loeseCodeEin("ZZZZ-ZZZZ-ZZZZ-ZZZZ-ZZZZ-ZZZZ-ZZZZ", db);
    expect(gesperrt).toStrictEqual({ ok: false });
    expect(unbekannt).toStrictEqual({ ok: false });
    expect(gesperrt).toStrictEqual(unbekannt);
  });

  it("ein gesperrter Code schreibt kein last_used_at", async () => {
    /*
     * „Aktivitaet, die es nicht gibt" (Testauftrag Spec:3101). Ein `last_used_at` auf
     * einem gesperrten Code liesse die Verwaltungsliste behaupten, der gesperrte
     * Aufsteller sei gerade benutzt worden — und das ist die eine Information, an der die
     * Leitung erkennt, ob ein verschwundenes Kaertchen noch im Umlauf ist.
     */
    await legeCodeAn({ aktiv: false });
    await loeseCodeEin(CODE, db);
    const [zeile] = await db.select().from(zugangscodes).where(eq(zugangscodes.id, "zc-1"));
    expect(zeile?.lastUsedAt).toBeNull();
  });

  it("normalisiert NICHT selbst — ein unnormalisierter Code trifft nicht", async () => {
    /*
     * ⛔ Spec:2316: „Der BEREITS NORMALISIERTE Code. Diese Funktion normalisiert
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
    const e = await loeseCodeEin(CODE.replace(/-/g, "").toLowerCase(), db);
    expect(e).toStrictEqual({ ok: false });
  });

  it.each([["leer", ""], ["Muell", "?!"], ["500 Zeichen", "x".repeat(500)]])(
    "wirft nicht bei %s",
    async (_n, roh) => {
      // Der Wert kommt aus einer URL. Ein Wurf hier waere HTTP 500 im Route Handler.
      await legeCodeAn();
      await expect(loeseCodeEin(roh, db)).resolves.toStrictEqual({ ok: false });
    },
  );
});
