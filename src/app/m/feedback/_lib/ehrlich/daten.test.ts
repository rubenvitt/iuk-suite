import { describe, it, expect, beforeEach } from "vitest";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { registerAuditFunctions } from "@/core/audit/context";
import * as schema from "../../_db/schema";
import { abholcodeHash, neuerAbholcode, normiereAbholcode } from "./abholcode";
import {
  erneuereKastenSecret, istKastenSecret, kastenSecret, legeMitteilungAn, legeNotizAn, listeMitteilungen, loescheAbgelaufene,
  loeschGrenze, setzeStatus, ungemeldete, vermerkeGemeldet, zuLesen, type EhrlichDb,
} from "./daten";
import { feedbackSofortmeldungen } from "../faelligkeiten";

let sqlite: Database.Database;
let db: EhrlichDb;
beforeEach(() => {
  sqlite = new Database(":memory:");
  registerAuditFunctions(sqlite);
  db = drizzle(sqlite, { schema });
  migrate(db, { migrationsFolder: "src/app/m/feedback/_db/migrations" });
});

const einwurf = { thema: null, text: "Text", antwortweg: "keine" as const, name: null, kontakt: null };

describe("Abholcode", () => {
  it("normt Schreibweisen auf dieselbe Form", () => {
    expect(normiereAbholcode(" möwe 1234 falke ")).toBe("MOEWE-1234-FALKE");
    expect(abholcodeHash("moewe-1234-falke")).toBe(abholcodeHash("MOEWE 1234 FALKE"));
  });
  it("hat die gedruckte Form", () => {
    expect(neuerAbholcode()).toMatch(/^[A-Z]+-[1-9]\d{3}-[A-Z]+$/);
  });
  it("würfelt bei einer Kollision neu", () => {
    const folge = [0, 0, 0, 0, 0, 0, 1, 1, 1];
    let i = 0;
    const zufall = () => folge[Math.min(i++, folge.length - 1)];
    const a = legeMitteilungAn(db, { ...einwurf, antwortweg: "code" }, "2026-11-03", zufall);
    const b = legeMitteilungAn(db, { ...einwurf, antwortweg: "code" }, "2026-11-03", zufall);
    expect(a.code).not.toBe(b.code);
  });
});

describe("Kasten", () => {
  it("legt das Secret einmal an, vergleicht ohne anzulegen und erneuert es", () => {
    expect(istKastenSecret(db, "")).toBe(false);
    expect(sqlite.prepare("SELECT count(*) n FROM ehrlich_kasten").get()).toEqual({ n: 0 });
    const alt = kastenSecret(db);
    expect(kastenSecret(db)).toBe(alt);
    expect(istKastenSecret(db, alt)).toBe(true);
    const neu = erneuereKastenSecret(db);
    expect(neu).not.toBe(alt);
    expect(istKastenSecret(db, alt)).toBe(false);
  });
});

describe("Liste und Zähler", () => {
  it("zählt neue Mitteilungen und offene Rückfragen", () => {
    legeMitteilungAn(db, einwurf, "2026-11-01");
    const b = legeMitteilungAn(db, einwurf, "2026-11-02");
    legeNotizAn(db, b.id, "Erika Mustermann", "gelesen", "2026-11-02");
    expect(listeMitteilungen(db).map((z) => z.tag)).toEqual(["2026-11-02", "2026-11-01"]);
    expect(zuLesen(db)).toBe(1);
  });
});

describe("Löschfrist", () => {
  it("rechnet zwölf Monate zurück, auch am Monatsende", () => {
    expect(loeschGrenze("2026-11-03")).toBe("2025-11-03");
    expect(loeschGrenze("2028-02-29")).toBe("2027-02-28");
  });
  it("löscht nur Erledigtes, das älter als die Frist ist — samt Notizen", () => {
    const alt = legeMitteilungAn(db, einwurf, "2025-01-01");
    const jung = legeMitteilungAn(db, einwurf, "2025-01-01");
    const offen = legeMitteilungAn(db, einwurf, "2024-01-01");
    setzeStatus(db, alt.id, "erledigt", "2025-11-02");
    setzeStatus(db, jung.id, "erledigt", "2025-11-04");
    legeNotizAn(db, alt.id, "Erika Mustermann", "x", "2025-11-02");
    expect(loescheAbgelaufene(db, "2026-11-03")).toBe(1);
    expect(listeMitteilungen(db).map((z) => z.id).sort()).toEqual([jung.id, offen.id].sort());
    expect(sqlite.prepare("SELECT count(*) n FROM ehrlich_notizen").get()).toEqual({ n: 0 });
  });
  it("setzt den Erledigt-Tag beim Wiederöffnen zurück", () => {
    const m = legeMitteilungAn(db, einwurf, "2025-01-01");
    setzeStatus(db, m.id, "erledigt", "2025-01-02");
    setzeStatus(db, m.id, "bearbeitung", "2026-11-03");
    expect(loescheAbgelaufene(db, "2026-11-03")).toBe(0);
  });
});

describe("Sofort-Push", () => {
  it("meldet neue Mitteilungen ohne Inhalt und nur einmal", () => {
    legeMitteilungAn(db, { ...einwurf, thema: "Miteinander", text: "Geheim" }, "2026-11-03");
    // Am Einwurftag selbst nichts, am Folgetag erst ab 8 Uhr (Suite-Zone): der Push verrät keine Uhrzeit.
    expect(feedbackSofortmeldungen(new Date("2026-11-02T23:00:00Z"), db, Date.parse("2026-11-03T22:00:00Z"))).toEqual([]);
    expect(feedbackSofortmeldungen(new Date("2026-11-03T06:00:00Z"), db, Date.parse("2026-11-04T06:00:00Z"))).toEqual([]);
    const meldungen = feedbackSofortmeldungen(new Date("2026-11-03T07:00:00Z"), db, Date.parse("2026-11-04T07:00:00Z"));
    expect(meldungen).toHaveLength(1);
    expect(JSON.stringify(meldungen)).not.toMatch(/Geheim|Miteinander/);
    vermerkeGemeldet(db, meldungen.map((m) => m.id));
    expect(ungemeldete(db, "2026-11-01")).toEqual([]);
  });
});
