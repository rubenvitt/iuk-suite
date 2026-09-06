import { afterEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { openModuleDatabase } from "@/core/db";
import { withAuditContext } from "./context";
import { queryAuditEvents, recordAuditEvent } from "./storage";
import { transferAuditEvents, transferAuditSource } from "./transfer";
import { auditCutoff, auditRetentionDays, purgeAuditEvents } from "./retention";
import type Database from "better-sqlite3";

const dirs: string[] = [];
const connections: Database.Database[] = [];
function fixture() {
  const dir = mkdtempSync(join(tmpdir(), "audit-test-")); dirs.push(dir);
  vi.stubEnv("DATA_DIR", dir);
  const source = openModuleDatabase(join(dir, "portal.db")); connections.push(source);
  migrate(drizzle(source), { migrationsFolder: "src/app/m/portal/_db/migrations" });
  const central = openModuleDatabase(join(dir, "audit.db")); connections.push(central);
  migrate(drizzle(central), { migrationsFolder: "src/core/audit/_db/migrations" });
  return {source, central};
}
function change(db: Database.Database, key="test") {
  db.prepare("INSERT INTO portal_einstellungen (schluessel, wert) VALUES (?, ?)").run(key, "SECRET_VALUE");
}
afterEach(() => { connections.splice(0).forEach(db=> {if(db.open) db.close();}); dirs.splice(0).forEach(dir=>rmSync(dir,{recursive:true,force:true})); vi.unstubAllEnvs(); });

describe("transactional audit", () => {
  it("commits an outbox row and does not persist field values", () => {
    const {source} = fixture(); change(source);
    const rows = source.prepare("SELECT * FROM audit_outbox").all();
    expect(rows).toHaveLength(1); expect(JSON.stringify(rows)).not.toContain("SECRET_VALUE");
    expect(transferAuditEvents()).toMatchObject({transferred:1, pending:0, failures:[]});
    expect(queryAuditEvents().events[0]).toMatchObject({module:"portal", action:"create",actor:{kind:"system"}});
  });
  it("ignores no-op updates and preserves create/update/delete events after object removal",()=>{
    const {source}=fixture();change(source);
    source.exec("UPDATE portal_einstellungen SET wert = wert WHERE schluessel='test'");
    expect(source.prepare("SELECT count(*) n FROM audit_outbox").get()).toEqual({n:1});
    source.exec("UPDATE portal_einstellungen SET wert = 'new' WHERE schluessel='test'");
    source.exec("DELETE FROM portal_einstellungen WHERE schluessel='test'");
    transferAuditEvents();
    expect(queryAuditEvents().events.map(e=>e.action).sort()).toEqual(["create","delete","update"]);
  });
  it("rolls back both business mutation and event",()=>{
    const {source}=fixture(); expect(()=>source.transaction(()=>{change(source);throw Error("rollback");})()).toThrow("rollback");
    expect(source.prepare("SELECT count(*) n FROM audit_outbox").get()).toEqual({n:0});
  });
  it("an outbox failure rejects the business write",()=>{
    const {source}=fixture(); source.exec("CREATE TRIGGER fail_audit BEFORE INSERT ON audit_outbox BEGIN SELECT RAISE(ABORT, 'audit unavailable'); END");
    expect(()=>change(source)).toThrow("audit unavailable");
    expect(source.prepare("SELECT count(*) n FROM portal_einstellungen WHERE schluessel='test'").get()).toEqual({n:0});
  });
  it("retains source on central failure and survives retry after central commit",()=>{
    const {source,central}=fixture(); change(source);
    central.exec("CREATE TRIGGER fail_central BEFORE INSERT ON audit_events BEGIN SELECT RAISE(ABORT, 'unavailable'); END");
    expect(transferAuditEvents()).toMatchObject({failures:["portal"],pending:1});
    central.exec("DROP TRIGGER fail_central");
    source.exec("CREATE TRIGGER fail_ack BEFORE DELETE ON audit_outbox BEGIN SELECT RAISE(ABORT, 'restart'); END");
    expect(()=>transferAuditSource(source,central)).toThrow("restart");
    expect(central.prepare("SELECT count(*) n FROM audit_events").get()).toEqual({n:1});
    source.exec("DROP TRIGGER fail_ack");
    expect(transferAuditEvents()).toMatchObject({pending:0,failures:[]});
    expect(queryAuditEvents().events).toHaveLength(1);
  });
  it("keeps simultaneous async actors isolated",async()=>{
    fixture();
    await Promise.all(["alice","bob"].map(id=>withAuditContext({actor:{kind:"user",id}},async()=>{
      await new Promise(resolve=>setTimeout(resolve,id==="alice"?10:1));
      recordAuditEvent({module:"portal",action:"export",objectType:id,result:"success",origin:"server"});
    })));
    expect(queryAuditEvents().events.map(e=>[e.objectType,e.actor])).toEqual(expect.arrayContaining([["alice",{kind:"user",id:"alice"}],["bob",{kind:"user",id:"bob"}]]));
  });
  it("filters with parameters and paginates equal timestamps without duplicates",()=>{
    const {central}=fixture();
    for(let i=0;i<5;i++) recordAuditEvent({module:"qr",action:"export",objectType:"preset",objectRef:"secret-url",result:"success",origin:"browser"});
    central.exec("UPDATE audit_events SET occurred_at = " + Date.now());
    const a=queryAuditEvents({module:"qr",limit:2}); const b=queryAuditEvents({module:"qr",limit:2,cursor:a.nextCursor}); const c=queryAuditEvents({module:"qr",limit:2,cursor:b.nextCursor});
    expect(new Set([...a.events,...b.events,...c.events].map(e=>e.id)).size).toBe(5);
    expect(c.nextCursor).toBeUndefined();
    expect(queryAuditEvents({actorId:"x' OR 1=1 --"}).events).toHaveLength(0);
    expect(()=>queryAuditEvents({limit:101})).toThrow();
    expect(JSON.stringify(a.events)).not.toContain("secret-url");
    expect(queryAuditEvents({module:"qr",objectRef:"secret-url"}).events).toHaveLength(5);
    expect(queryAuditEvents({objectRef:"different"}).events).toHaveLength(0);
  });
  it("applies retention to reads, transfer and physical purge",()=>{
    const {source,central}=fixture();change(source);
    source.exec("UPDATE audit_outbox SET occurred_at = 1");
    expect(transferAuditEvents()).toMatchObject({expired:1,pending:0});
    recordAuditEvent({module:"konto",action:"sign_in",objectType:"session",result:"success",origin:"server"});
    central.exec("UPDATE audit_events SET occurred_at = 1");
    expect(queryAuditEvents().events).toEqual([]); expect(purgeAuditEvents()).toBe(1);
    expect(auditRetentionDays()).toBe(90); expect(auditCutoff(10000000000)).toBe(10000000000-90*86400000);
    vi.stubEnv("SUITE_AUDIT_AUFBEWAHRUNG_TAGE","0"); expect(auditRetentionDays).toThrow();
  });
});
