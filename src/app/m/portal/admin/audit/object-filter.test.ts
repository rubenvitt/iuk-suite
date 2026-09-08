import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { recordAuditEvent } from "@/core/audit/storage";
import { safeAuditReference, withAuditContext } from "@/core/audit/context";
vi.mock("@/core/auth",()=>({auth:async()=>({user:{id:"confirmed-admin",groups:["dashboard-admins"]}})}));
import { GET } from "./data/route";
let dir:string;
beforeEach(()=>{
 dir=mkdtempSync(join(tmpdir(),"audit-object-handler-"));vi.stubEnv("DATA_DIR",dir);vi.stubEnv("ADMIN_GROUP","dashboard-admins");
 const db=new Database(join(dir,"audit.db"));try{migrate(drizzle(db),{migrationsFolder:"src/core/audit/_db/migrations"});}finally{db.close();}
});
afterEach(()=>{rmSync(dir,{recursive:true,force:true});vi.unstubAllEnvs();});
it("direct handler returns only the selected module and object type for colliding IDs",async()=>{
 for(const [module,objectType] of [["feedback","groups"],["feedback","evenings"],["feedback","surveys"],["feedback","group_export"],["qr","groups"]] as const)
  withAuditContext({actor:{kind:"user",id:"reader"}},()=>recordAuditEvent({module,objectType,objectRef:"1",action:"update",result:"success",origin:"server"}));
 const hash=safeAuditReference("1").slice(7);
 const response=await GET(new Request(`http://portal.localtest.me/admin/audit/data?module=feedback&objectType=groups&objectRefHash=${hash}`));
 expect(response.status).toBe(200);
 const view=await response.json();expect(view.page.events).toHaveLength(1);
 expect(view.page.events[0]).toMatchObject({module:"feedback",objectType:"groups",objectRef:"sha256:"+hash});
 const unfiltered=await GET(new Request("http://portal.localtest.me/admin/audit/data"));
 expect((await unfiltered.json()).page.events).toHaveLength(5);
});

it("hides only system actors by default and can include them explicitly",async()=>{
 for(const actor of [{kind:"system"},{kind:"anonymous"},{kind:"access",id:"link"},{kind:"user",id:"reader",name:"System"}] as const)
  withAuditContext({actor},()=>recordAuditEvent({module:"qr",objectType:"qr_png",action:"export",result:"success",origin:"server"}));
 const response=await GET(new Request("http://portal.localtest.me/admin/audit/data"));
 expect(response.status).toBe(200);
 const view=await response.json();
 expect(view.page.events.map((event:{actor:{kind:string}})=>event.actor.kind).sort()).toEqual(["access","anonymous","user"]);
 expect(view.filtered).toBe(true);
 const all=await GET(new Request("http://portal.localtest.me/admin/audit/data?includeSystem=1"));
 expect(all.status).toBe(200);
 const allView=await all.json();
 expect(allView.page.events).toHaveLength(4);
 expect(allView.filtered).toBe(false);
});

it("filters system entries before applying the page limit and cursor",async()=>{
 for(const actor of [{kind:"user",id:"reader"},{kind:"system"}] as const)
  for(let i=0;i<51;i++) withAuditContext({actor},()=>recordAuditEvent({module:"qr",objectType:"qr_png",action:"export",result:"success",origin:"server"}));
 const first=await (await GET(new Request("http://portal.localtest.me/admin/audit/data"))).json();
 expect(first.page.events).toHaveLength(50);
 expect(first.page.events.every((event:{actor:{kind:string}})=>event.actor.kind==="user")).toBe(true);
 const cursor=first.page.nextCursor;
 const second=await (await GET(new Request(`http://portal.localtest.me/admin/audit/data?cursorTime=${cursor.occurredAt}&cursorId=${cursor.id}`))).json();
 expect(second.page.events).toHaveLength(1);
 expect(second.page.events[0].actor.kind).toBe("user");
 expect(new Set([...first.page.events,...second.page.events].map(event=>event.id)).size).toBe(51);
 expect(second.page.nextCursor).toBeUndefined();
});
