import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { eq, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import type { BereitgestellterHelfer } from "@/app/m/helfer/_lib/bereitstellung";
import { openModuleDatabase } from "@/core/db";
import * as schema from "../../_db/schema";
import { person, qualifikation } from "../../_db/schema";
import { testDb } from "../testDb";
import { NichtGefunden, QualiFehler, SchonVergeben, listePersonal, speicherePerson, stammdatenVersion } from "./daten";
import { planeGegenBestand } from "./helferAbgleich";
import { entferneQualifikation, listeQualifikationen, speichereQualifikation } from "./qualifikationen";
import { leseQualiRegeln, schreibeQualiRegeln } from "./qualiZuordnung";

const id = (db: ReturnType<typeof testDb>, kurz: string) => listeQualifikationen(db).find((q) => q.kurz === kurz)!.id;
const helfer = (qualifikationen: BereitgestellterHelfer["qualifikationen"]): BereitgestellterHelfer =>
  ({ id: "1", vorname: "Jana", nachname: "Albers", qualifikationen, demo: false });

describe("Qualifikationen (IDA-282)", () => {
  it("legt an, eine doppelte Kurzform ist ein Feldfehler", () => {
    const db = testDb();
    const neu = speichereQualifikation(db, null, { kurz: "BtH", lang: "Betreuungshelfer", rang: 6 });
    expect(listeQualifikationen(db).map((q) => q.kurz)).toEqual(["NotSan", "RettAss", "RS", "SiK", "SanH", "BtH"]);
    expect(() => speichereQualifikation(db, null, { kurz: "BtH", lang: "x", rang: 7 })).toThrow(SchonVergeben);
    expect(() => speichereQualifikation(db, neu.id, { kurz: "RS", lang: "x", rang: 7 })).toThrow("Diese Kurzform gibt es schon.");
    expect(() => speichereQualifikation(db, "gibt-es-nicht", { kurz: "X", lang: "x", rang: 7 })).toThrow(NichtGefunden);
  });

  it("eine neue Kurzform zieht Personal und HiOrg-Zuordnung mit und zählt den Stammdatenstand hoch", () => {
    const db = testDb();
    const p = speicherePerson(db, null, { name: "Voß, Anke", quali: "SiK", aktiv: false });
    schreibeQualiRegeln(db, [{ hiorg: "Fachdienst Sanität", kurz: "SiK" }, { hiorg: "Sanitäter", kurz: null }]);
    const vorher = stammdatenVersion(db);
    speichereQualifikation(db, "sik", { kurz: "San-KatS", lang: "Sanitäter im Katastrophenschutz", rang: 4 });
    expect(listePersonal(db).find((x) => x.id === p.id)?.quali).toBe("San-KatS");
    expect(leseQualiRegeln(db)).toEqual([{ hiorg: "Fachdienst Sanität", kurz: "San-KatS" }, { hiorg: "Sanitäter", kurz: null }]);
    expect(stammdatenVersion(db)).toBeGreaterThan(vorher);
  });

  it("die eingebaute HiOrg-Zuordnung folgt der umbenannten Qualifikation, der Rang kommt aus der Tabelle", () => {
    const db = testDb();
    speichereQualifikation(db, "sik", { kurz: "San-KatS", lang: "Sanitäter im Katastrophenschutz", rang: 4 });
    const plan = planeGegenBestand(db, { stand: null, helfer: [helfer([{ name: "Sanitäter", kurz: "San" }])] });
    expect(plan.zeilen[0].quali).toBe("San-KatS");
    // SanH über SiK gestellt: bei beiden gewinnt nun SanH.
    speichereQualifikation(db, "sanh", { kurz: "SanH", lang: "Sanitätshelfer", rang: 1 });
    const beide = planeGegenBestand(db, { stand: null, helfer: [helfer([{ name: "Sanitäter", kurz: "San" }, { name: "Sanitätshelfer", kurz: "SH" }])] });
    expect(beide.zeilen[0].quali).toBe("SanH");
    expect(beide.auswahl.map((q) => q.kurz)).toEqual(["NotSan", "SanH", "RettAss", "RS", "San-KatS"]);
  });

  it("eine neue Qualifikation hat keine eingebaute Zuordnung, ist aber per Regel wählbar", () => {
    const db = testDb();
    speichereQualifikation(db, null, { kurz: "BtH", lang: "Betreuungshelfer", rang: 6 });
    const ohne = planeGegenBestand(db, { stand: null, helfer: [helfer([{ name: "Betreuungshelfer", kurz: "BtH" }])] });
    expect(ohne.zeilen[0].klasse).toBe("ohne_quali");
    schreibeQualiRegeln(db, [{ hiorg: "Betreuungshelfer", kurz: "BtH" }]);
    expect(planeGegenBestand(db, { stand: null, helfer: [helfer([{ name: "Betreuungshelfer", kurz: "BtH" }])] }).zeilen[0].quali).toBe("BtH");
    expect(() => schreibeQualiRegeln(db, [{ hiorg: "Betreuungshelfer", kurz: "Unbekannt" }])).toThrow(QualiFehler);
  });

  it("entfernt nur, was niemand trägt — auch deaktiviertes Personal zählt — und nimmt die Regeln mit", () => {
    const db = testDb();
    const p = speicherePerson(db, null, { name: "Voß, Anke", quali: "RS", aktiv: false });
    schreibeQualiRegeln(db, [{ hiorg: "Fachdienst", kurz: "RS" }]);
    expect(() => entferneQualifikation(db, "rs")).toThrow("Eine Person trägt „RS“, auch deaktivierte zählen. Bitte erst umstellen, dann entfernen.");
    expect(listeQualifikationen(db)).toHaveLength(5);
    speicherePerson(db, p.id, { name: "Voß, Anke", quali: "SanH", aktiv: false });
    entferneQualifikation(db, id(db, "RS"));
    expect(listeQualifikationen(db).map((q) => q.kurz)).toEqual(["NotSan", "RettAss", "SiK", "SanH"]);
    expect(leseQualiRegeln(db)).toEqual([]);
    expect(() => entferneQualifikation(db, "rs")).toThrow(NichtGefunden);
    // Eine HiOrg-Qualifikation, die eingebaut auf RS ging, findet jetzt keine Zuordnung mehr.
    expect(planeGegenBestand(db, { stand: null, helfer: [helfer([{ name: "Rettungssanitäter", kurz: "RS" }])] }).zeilen[0].klasse).toBe("ohne_quali");
  });

  it("Änderungen landen in der Audit-Outbox", () => {
    const db = testDb();
    const zeilen = () => (db.all(sql`SELECT action FROM audit_outbox WHERE object_type = 'qualifikation'`) as { action: string }[]).map((z) => z.action);
    const vorher = zeilen(); // die fünf aus der Migration
    const neu = speichereQualifikation(db, null, { kurz: "BtH", lang: "Betreuungshelfer", rang: 6 });
    speichereQualifikation(db, neu.id, { kurz: "BtH", lang: "Betreuungshelferin", rang: 6 });
    entferneQualifikation(db, neu.id);
    expect(zeilen().slice(vorher.length)).toEqual(["create", "update", "delete"]);
  });
});

describe("Migration 0004_qualifikationen", () => {
  it("übernimmt ein Kürzel am Personal, das keine der fünf ist, als eigene Qualifikation hinter ihnen", () => {
    const ordner = "src/app/m/einsatzbuch/_db/migrations";
    const bis3 = mkdtempSync(join(tmpdir(), "einsatzbuch-mig-"));
    try {
      cpSync(ordner, bis3, { recursive: true });
      const journal = JSON.parse(readFileSync(join(bis3, "meta/_journal.json"), "utf8")) as { entries: { tag: string }[] };
      journal.entries = journal.entries.filter((e) => e.tag < "0004");
      writeFileSync(join(bis3, "meta/_journal.json"), JSON.stringify(journal));
      const db = drizzle(openModuleDatabase(":memory:"), { schema });
      migrate(db, { migrationsFolder: bis3 });
      db.insert(person).values([
        { id: "p1", name: "Albers, Jana", quali: "ZF", aktiv: true },
        { id: "p2", name: "Meyer, Hanna", quali: "SanH", aktiv: true },
        { id: "p3", name: "Kruse, Marie", quali: "ZF", aktiv: false },
      ]).run();
      migrate(db, { migrationsFolder: ordner });
      expect(listeQualifikationen(db).map(({ kurz, lang, rang }) => ({ kurz, lang, rang })).slice(5)).toEqual([{ kurz: "ZF", lang: "ZF", rang: 6 }]);
      expect(db.select().from(qualifikation).where(eq(qualifikation.kurz, "SanH")).get()?.id).toBe("sanh");
    } finally {
      rmSync(bis3, { recursive: true, force: true });
    }
  });
});
