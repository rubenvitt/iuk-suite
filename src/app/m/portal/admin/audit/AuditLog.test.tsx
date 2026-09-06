// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { clickElement, fill, mount, submitForm, unmount } from "@/app/m/qr/_lib/test-dom";
const router = vi.hoisted(()=>({ push:vi.fn(), refresh:vi.fn() }));
vi.mock("next/navigation",()=>({useRouter:()=>router,usePathname:()=>"/admin/audit"}));
import { AuditLog } from "./AuditLog";
import type { AuditView } from "./read";
afterEach(unmount);
beforeEach(()=>vi.clearAllMocks());
const ready:AuditView={state:"ready",page:{events:[]},filtered:false,pending:0,transferFailed:false};
it.each([
 [ready,"Noch keine Ereignisse","Frühere Vorgänge werden nicht nachträglich rekonstruiert"],
 [{...ready,filtered:true},"Keine passenden Einträge","Ändere die Filter"],
 [{...ready,pending:12},"Ereignisse werden noch übernommen","12 Ereignisse"],
 [{...ready,transferFailed:true},"Ereignisübernahme gestört","unvollständig"],
 [{state:"unavailable",message:"Speicher prüfen"},"Audit-Log nicht verfügbar","Speicher prüfen"],
])("shows honest empty, no-results, pending and failure states %#",async(view,title,detail)=>{
 await mount(<AuditLog view={view as AuditView} search={{}}/>);
 expect(document.body.textContent).toContain(title);expect(document.body.textContent).toContain(detail);
 if((view as AuditView).state==="unavailable") expect(document.body.textContent).not.toContain("Noch keine Ereignisse");
});
it("invalid date preserves typed values, focuses the associated invalid field and never navigates",async()=>{
 await mount(<AuditLog view={ready} search={{}}/>);
 await fill('[aria-label="Von (UTC)"]',"2026-02-30");await submitForm("form");
 expect(router.push).not.toHaveBeenCalled();expect(document.activeElement?.getAttribute("aria-label")).toBe("Von (UTC)");
 expect(document.activeElement?.getAttribute("aria-invalid")).toBe("true");
 expect(document.activeElement?.getAttribute("aria-describedby")).toBe("audit-filter-error");
 expect(document.getElementById("audit-filter-error")?.textContent).toContain("Von (UTC)");
 expect((document.querySelector('[aria-label="Von (UTC)"]') as HTMLInputElement).value).toBe("2026-02-30");
});
it("changing a filter drops the old page cursor",async()=>{
 await mount(<AuditLog view={ready} search={{cursorTime:"12",cursorId:"00000000-0000-0000-0000-000000000000"}}/>);
 await fill('[aria-label="Personenkennung"]',"known-user");await submitForm("form");
 expect(router.push).toHaveBeenCalledWith("/admin/audit?actorId=known-user");
});

it("reset clears dirty inputs and validation errors even when the committed URL is already empty",async()=>{
 await mount(<AuditLog view={ready} search={{}}/>);
 await fill('[aria-label="Personenkennung"]',"uncommitted-person");
 await fill('[aria-label="Von (UTC)"]',"2026-02-30");await submitForm("form");
 expect(document.getElementById("audit-filter-error")).not.toBeNull();
 const reset=Array.from(document.querySelectorAll("button")).find(button=>button.textContent==="Filter zurücksetzen")!;
 await clickElement(reset);
 expect((document.querySelector('[aria-label="Personenkennung"]') as HTMLInputElement).value).toBe("");
 expect((document.querySelector('[aria-label="Von (UTC)"]') as HTMLInputElement).value).toBe("");
 expect(document.getElementById("audit-filter-error")).toBeNull();
 expect(router.push).toHaveBeenCalledWith("/admin/audit");
});

import type { AuditEvent } from "@/core/audit/types";
const event:AuditEvent={id:"00000000-0000-0000-0000-000000000001",occurredAt:Date.now(),module:"feedback",action:"download",objectType:"groups",objectRef:"sha256:"+"a".repeat(64),actor:{kind:"user",id:"reader"},result:"success",origin:"server"};
async function openDetails(value:AuditEvent) {
 await mount(<AuditLog view={{state:"ready",page:{events:[value]},filtered:true,pending:0,transferFailed:false}} search={{module:"qr",cursorTime:"1",cursorId:event.id}}/>);
 await clickElement(document.querySelector('button[aria-label^="Details:"]')!);
 return document.querySelector('[role="dialog"]')!;
}
it.each(["download","export"] as const)("server %s explains only successful prepared responses",async action=>{
 for(const result of ["success","denied","failure"] as const) {
  const dialog=await openDetails({...event,action,result});
  const text=dialog.textContent!;
  expect(text.includes("Der Server hat die Datei zur Auslieferung bereitgestellt.")).toBe(result==="success");
  expect(text).toContain(result==="success"?"Empfang auf dem Gerät":result==="denied"?"Der Server hat die Auslieferung verweigert.":"Bei der Auslieferung ist ein Fehler aufgetreten.");
  expect(text).not.toContain("Der Browser meldet");
  await unmount();
 }
});
it("browser provenance remains separate",async()=>{
 const dialog=await openDetails({...event,action:"export",origin:"browser"});
 expect(dialog.textContent).toContain("Der Browser meldet");
 expect(dialog.textContent).not.toContain("Der Server hat die Datei");
});
it("detail filter replaces conflicting module and clears cursor with exact object scope",async()=>{
 const dialog=await openDetails(event);
 await clickElement(Array.from(dialog.querySelectorAll("button")).find(b=>b.textContent==="Nur dieses Objekt")!);
 const query=new URL(router.push.mock.calls.at(-1)![0],"http://example.org").searchParams;
 expect(Object.fromEntries(query)).toEqual({module:"feedback",objectType:"groups",objectRefHash:"a".repeat(64)});
});
it("removing an object scope drops module, type and hash together and clears cursor",async()=>{
 await mount(<AuditLog view={ready} search={{module:"feedback",objectType:"groups",objectRefHash:"a".repeat(64),actorId:"reader",cursorTime:"1",cursorId:event.id}}/>);
 expect(document.body.textContent).toContain("Objekttyp");
 await clickElement(Array.from(document.querySelectorAll("button")).find(b=>b.textContent==="Objektfilter entfernen")!);
 await submitForm("form");
 expect(router.push).toHaveBeenLastCalledWith("/admin/audit?actorId=reader");
});
it.each([["to","Bis einschließlich (UTC)","2026-02-30"],["to","Bis einschließlich (UTC)","2026-01-01"]])("associates %s date and range errors",async(key,label,value)=>{
 await mount(<AuditLog view={ready} search={{from:"2026-09-01"}}/>);
 await fill(`[aria-label="${label}"]`,value);await submitForm("form");
 expect(document.activeElement?.getAttribute("aria-label")).toBe(label);
 expect(document.activeElement?.getAttribute("aria-invalid")).toBe("true");
 expect(document.activeElement?.getAttribute("aria-describedby")).toBe("audit-filter-error");
 expect(document.getElementById("audit-filter-error")?.textContent).toContain(label);
});
