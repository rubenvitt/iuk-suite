import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { recordAuditEvent } from "@/core/audit/storage";
import { safeAuditReference } from "@/core/audit/context";
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
  recordAuditEvent({module,objectType,objectRef:"1",action:"update",result:"success",origin:"server"});
 const hash=safeAuditReference("1").slice(7);
 const response=await GET(new Request(`http://portal.localtest.me/admin/audit/data?module=feedback&objectType=groups&objectRefHash=${hash}`));
 expect(response.status).toBe(200);
 const view=await response.json();expect(view.page.events).toHaveLength(1);
 expect(view.page.events[0]).toMatchObject({module:"feedback",objectType:"groups",objectRef:"sha256:"+hash});
 const unfiltered=await GET(new Request("http://portal.localtest.me/admin/audit/data"));
 expect((await unfiltered.json()).page.events).toHaveLength(5);
});
