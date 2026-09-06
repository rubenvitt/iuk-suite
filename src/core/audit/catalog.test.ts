import { describe, expect, it } from "vitest";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { getTableName, is } from "drizzle-orm";
import { SQLiteTable } from "drizzle-orm/sqlite-core";
import { AUDIT_SOURCES, AUDIT_TABLES, auditMigrationsFolder, type AuditTableDecision } from "./catalog";
import { registerAuditFunctions, withAuditContext } from "./context";

describe("explicit audit coverage inventory", () => {
  for (const sourceKey of AUDIT_SOURCES) it(`${sourceKey}: every migrated and declared table has a deliberate decision`, async () => {
    const db = new Database(":memory:");
    try {
      // Migration creation itself must remain usable by plain SQLite. SQL functions
      // are deliberately registered only after every migration completed.
      migrate(drizzle(db), { migrationsFolder: auditMigrationsFolder(sourceKey) });
      registerAuditFunctions(db);
      const tables = (db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as {name:string}[]).map(t=>t.name).filter(n=>!n.startsWith("sqlite_")&&!n.startsWith("__")&&n!=="audit_outbox");
      const decisions: Record<string, AuditTableDecision> = AUDIT_TABLES[sourceKey];
      expect(tables.sort()).toEqual(Object.keys(decisions).sort());
      const schema = sourceKey === "konto" ? await import("../konto/_db/schema") : await import(`../../app/m/${sourceKey}/_db/schema.ts`);
      const declared = Object.values(schema).filter((t): t is SQLiteTable => is(t, SQLiteTable)).map(getTableName).filter(n=>n!=="audit_outbox");
      expect(declared.sort()).toEqual(tables.sort());
      for (const [table, decision] of Object.entries(decisions)) {
        const triggers = db.prepare("SELECT name FROM sqlite_master WHERE type='trigger' AND tbl_name=? AND name GLOB 'audit_*'").all(table) as {name:string}[];
        if (decision.mode === "excluded") { expect(triggers).toHaveLength(0); expect(decision.reason.length).toBeGreaterThan(20); }
        else {
          expect(triggers.map(t=>t.name).sort()).toEqual(["create","update","delete"].map(a=>`audit_${table}_${a}`).sort());
          const pk = (db.prepare(`PRAGMA table_info('${table}')`).all() as {name:string;pk:number}[]).filter(c=>c.pk).sort((a,b)=>a.pk-b.pk).map(c=>c.name);
          expect([...decision.primaryKey]).toEqual(pk);
        }
      }
    } finally { db.close(); }
  });
  it("anonymous feedback carries neither contents nor inherited identity/correlation/reference", () => {
    const db = new Database(":memory:"); registerAuditFunctions(db);
    try {
      migrate(drizzle(db), { migrationsFolder: auditMigrationsFolder("feedback") });
      db.exec("INSERT INTO groups(id,name,slug,secret,created_at) VALUES(1,'Group','slug','BEARER',1); INSERT INTO evenings(id,group_id,date,created_at) VALUES(1,1,1,1); INSERT INTO surveys(id,evening_id,created_at) VALUES(1,1,1)");
      withAuditContext({actor:{kind:"user",id:"alice",name:"Alice"},correlationId:"00000000-0000-4000-8000-000000000000"},()=>{
        db.exec(`INSERT INTO responses(id,survey_id,answers,submitted_at) VALUES(1,1,'SECRET FEEDBACK',1)`);
        db.exec(`UPDATE responses SET answers='CHANGED SECRET' WHERE id=1`);
        db.exec("DELETE FROM responses WHERE id=1");
      });
      const rows = db.prepare("SELECT * FROM audit_outbox WHERE object_type='responses'").all() as {actor:string;object_ref:null;correlation_id:null}[];
      expect(rows).toHaveLength(3);
      for (const row of rows) { expect(JSON.parse(row.actor)).toEqual({kind:"anonymous"}); expect(row.object_ref).toBeNull(); expect(row.correlation_id).toBeNull(); }
      expect(JSON.stringify(db.prepare("SELECT * FROM audit_outbox").all())).not.toMatch(/SECRET|BEARER|alice|Alice/);
    } finally { db.close(); }
  });
});
