// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { migrierteTestDb, type TestDb } from "@/app/m/aufgaben/_db/testdb";
import { personen, aufgaben, type PersonRow } from "@/app/m/aufgaben/_db/schema";
import { registerAuditFunctions } from "./context";
import { queryAuditEvents } from "./storage";
let session: unknown;
let taskDb:TestDb;
let feedbackDb:ReturnType<typeof drizzle>;
vi.mock("@/core/auth",()=>({auth:async()=>session}));
vi.mock("@/app/m/aufgaben/_db/client",()=>({getDb:()=>taskDb.db}));
vi.mock("@/app/m/feedback/_db/client",()=>({getDb:()=>feedbackDb}));
vi.mock("next/navigation",()=>({notFound:()=>{throw Error("NEXT_HTTP_ERROR_FALLBACK;404");},useRouter:()=>({}),usePathname:()=>"/",useSearchParams:()=>new URLSearchParams()}));
import * as zugang from "@/app/m/aufgaben/_lib/zugang";
import DetailPage from "@/app/m/aufgaben/a/[id]/page";
import PlanPage from "@/app/m/aufgaben/plan/[personId]/page";
import FreigabenPage from "@/app/m/aufgaben/freigaben/page";
import RoutinenPage from "@/app/m/aufgaben/routinen/page";
import VerteilenPage from "@/app/m/aufgaben/verteilen/page";
import PersonenPage from "@/app/m/aufgaben/personen/page";
import VergleichPage from "@/app/m/feedback/(admin)/vergleich/page";
let dir:string;
let central:Database.Database;
let feedback:Database.Database;
let caller:PersonRow;
let other:PersonRow;
let taskId:string;
beforeEach(()=>{
 dir=mkdtempSync(join(tmpdir(),"audit-page-denial-"));vi.stubEnv("DATA_DIR",dir);
 vi.stubEnv("ADMIN_GROUP","dashboard-admins");vi.stubEnv("SUITE_ADMIN_GROUP_AUFGABEN","aufgaben_koordination");vi.stubEnv("SUITE_ADMIN_GROUP_FEEDBACK","da-feedback-admin");
 central=new Database(join(dir,"audit.db"));migrate(drizzle(central),{migrationsFolder:"src/core/audit/_db/migrations"});
 taskDb=migrierteTestDb();
 feedback=new Database(":memory:");registerAuditFunctions(feedback);feedbackDb=drizzle(feedback);migrate(feedbackDb,{migrationsFolder:"src/app/m/feedback/_db/migrations"});
 [caller,other]=["confirmed-caller","other-person"].map(sub=>taskDb.db.insert(personen).values({sub,name:sub,initialen:"AB",rolle:"auftrag",aktivVon:"2020-01-01"}).returning().get());
 taskId=taskDb.db.insert(aufgaben).values({titel:"Private task content",beschreibung:"Never in audit",erstellerId:other.id,prioritaet:"mittel",status:"eingegangen",faelligAm:"2030-01-01",dauerMinuten:60}).returning().get().id;
 session={user:{id:caller.sub,groups:[],fachgruppen:[]}};
});
afterEach(()=>{taskDb.schliessen();feedback.close();central.close();rmSync(dir,{recursive:true,force:true});vi.unstubAllEnvs();});
const cases=[
 ["task",()=>DetailPage({params:Promise.resolve({id:taskId})})],
 ["plan",()=>PlanPage({params:Promise.resolve({personId:other.id}),searchParams:Promise.resolve({})})],
 ["freigaben",()=>FreigabenPage()],
 ["routinen",()=>RoutinenPage({searchParams:Promise.resolve({})})],
 ["verteilen",()=>VerteilenPage({searchParams:Promise.resolve({})})],
 ["personen",()=>PersonenPage({searchParams:Promise.resolve({})})],
 ["vergleich",()=>VergleichPage()],
] as const;
it.each(cases.filter(([name])=>name!=="plan"))("actual %s page persists exactly one confirmed denial and preserves 404",async(name,call)=>{
 if(name==="freigaben") taskDb.sqlite.prepare("UPDATE personen SET rolle='bufdi' WHERE id=?").run(caller.id);
 if(name==="vergleich") session={user:{id:caller.sub,groups:["da-feedback-gl"],fachgruppen:["bereitschaft"]}};
 await expect(call()).rejects.toThrow("NEXT_HTTP_ERROR_FALLBACK;404");
 const events=queryAuditEvents().events;
 expect(events).toHaveLength(1);
 expect(events[0]).toMatchObject({module:name==="vergleich"?"feedback":"aufgaben",action:"access_denied",result:"denied",origin:"server",actor:{kind:"user",id:caller.sub}});
 expect(events[0].objectRef).toBeUndefined();
 expect(JSON.stringify(events)).not.toContain("Private task content");
});
it.each(cases)("allowed %s page stays quiet",async(name,call)=>{
 session={user:{id:caller.sub,groups:["aufgaben_koordination","da-feedback-admin"],fachgruppen:[]}};
 if(name==="routinen") taskDb.sqlite.prepare("UPDATE personen SET rolle='bufdi' WHERE id=?").run(caller.id);
 expect(await call()).toBeTruthy();expect(queryAuditEvents().events).toEqual([]);
});
it.each(["task","plan"])("ordinary absent %s object stays a quiet 404",async name=>{
 const call=name==="task"?()=>DetailPage({params:Promise.resolve({id:"absent"})}):()=>PlanPage({params:Promise.resolve({personId:"absent"}),searchParams:Promise.resolve({})});
 await expect(call()).rejects.toThrow("NEXT_HTTP_ERROR_FALLBACK;404");expect(queryAuditEvents().events).toEqual([]);
});

it("a registered Auftrag viewer can read another person's plan without an event",async()=>{
 expect(await PlanPage({params:Promise.resolve({personId:other.id}),searchParams:Promise.resolve({})})).toBeTruthy();
 expect(queryAuditEvents().events).toEqual([]);
});

it("synthetic predicate fault: defensive plan denial also persists one event and preserves 404",async()=>{
 const predicate=vi.spyOn(zugang,"darfPlanSehen").mockReturnValue(false);
 try {
  await expect(PlanPage({params:Promise.resolve({personId:other.id}),searchParams:Promise.resolve({})})).rejects.toThrow("NEXT_HTTP_ERROR_FALLBACK;404");
  expect(queryAuditEvents().events).toHaveLength(1);
  expect(queryAuditEvents().events[0]).toMatchObject({module:"aufgaben",action:"access_denied",actor:{kind:"user",id:caller.sub}});
 } finally { predicate.mockRestore(); }
});
