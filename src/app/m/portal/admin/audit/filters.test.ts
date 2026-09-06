import { expect, it } from "vitest";
import { parseAuditFilters } from "./filters";
import { auditTime, OBJECT_LABELS } from "./labels";
import { AUDIT_TABLES } from "@/core/audit/catalog";
it.each(["2026-03-29","2026-10-25"])("UTC day is exactly 24 hours across DST transition %s", day=>{
 const result=parseAuditFilters({from:day,to:day});expect(result.to!-result.from!+1).toBe(86400000);
 expect(auditTime(result.from!)).toContain("00:00:00 UTC");
});
it.each([{from:"2026-02-30"},{from:"2026-09-07",to:"2026-09-06"},{from:"junk"},{actorId:"a".repeat(513)},{objectRef:"secret"},{objectRefHash:"secret"},{module:["qr","files"]},{cursorTime:"1"}])("rejects invalid filters %j", value=>expect(()=>parseAuditFilters(value)).toThrow());
it("names all audited objects and distinct fixed delivery types",()=>{
 for(const tables of Object.values(AUDIT_TABLES)) for(const [table,decision] of Object.entries(tables)) if(decision.mode!=="excluded") expect(OBJECT_LABELS[table],table).toBeTruthy();
 const types=["share_file","share_archive","inbox_file","inbox_archive","group_export","evening_export","checklist_collection","device_collection","participant_export","participant_collection","proof_file"];
 expect(new Set(types.map(t=>OBJECT_LABELS[t])).size).toBe(types.length);
});
