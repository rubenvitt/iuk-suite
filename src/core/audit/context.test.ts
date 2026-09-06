import { describe, expect, it, vi } from "vitest";
import Database from "better-sqlite3";
import { currentAuditContext, registerAuditFunctions, withAuditContext } from "./context";

describe("audit actor context",()=>{
  it("restores the parent after nested async scope and rejection",async()=>{
    await withAuditContext({actor:{kind:"user",id:"parent"}},async()=>{
      await expect(withAuditContext({actor:{kind:"anonymous"}},async()=>{await Promise.resolve();throw Error("nested");})).rejects.toThrow("nested");
      expect(currentAuditContext().actor).toEqual({kind:"user",id:"parent"});
    });
    expect(currentAuditContext().actor).toEqual({kind:"system"});
  });
  it("cached SQLite functions see context after module reload",async()=>{
    const db=new Database(":memory:");registerAuditFunctions(db);
    try {
      vi.resetModules(); const reloaded=await import("./context");
      reloaded.withAuditContext({actor:{kind:"user",id:"reloaded"}},()=>{
        expect(db.prepare("SELECT suite_audit_actor() actor").get()).toEqual({actor:JSON.stringify({kind:"user",id:"reloaded"})});
      });
    }finally{db.close();}
  });
  it("distinguishes a verified shared access from a known person",()=>{
    withAuditContext({actor:{kind:"access",id:"radio:code-record",name:"Ausleihe"}},()=>{
      expect(currentAuditContext().actor).toEqual({kind:"access",id:"radio:code-record",name:"Ausleihe"});
    });
  });
  it("snapshots trusted actor data without retaining arbitrary fields",()=>{
    const actor={kind:"user" as const,id:"alice",name:"Alice",token:"SECRET"};
    withAuditContext({actor},()=>{
      actor.id="bob";
      expect(currentAuditContext().actor).toEqual({kind:"user",id:"alice",name:"Alice"});
    });
    expect(()=>withAuditContext({actor:{kind:"system"},correlationId:"secret-token"},()=>{})).toThrow();
  });
});
