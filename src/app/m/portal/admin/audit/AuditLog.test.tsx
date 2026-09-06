// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { fill, mount, submitForm, unmount } from "@/app/m/qr/_lib/test-dom";
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
it("invalid date preserves typed values, focuses explanation and never navigates",async()=>{
 await mount(<AuditLog view={ready} search={{}}/>);
 await fill('[aria-label="Von (UTC)"]',"2026-02-30");await submitForm("form");
 expect(router.push).not.toHaveBeenCalled();expect(document.activeElement?.id).toBe("audit-filter-error");
 expect((document.querySelector('[aria-label="Von (UTC)"]') as HTMLInputElement).value).toBe("2026-02-30");
});
it("changing a filter drops the old page cursor",async()=>{
 await mount(<AuditLog view={ready} search={{cursorTime:"12",cursorId:"00000000-0000-0000-0000-000000000000"}}/>);
 await fill('[aria-label="Personenkennung"]',"known-user");await submitForm("form");
 expect(router.push).toHaveBeenCalledWith("/admin/audit?actorId=known-user");
});
