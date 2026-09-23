import { expect, it } from "vitest";
import { parseAuditFilters } from "./filters";
import { auditTime, OBJECT_LABELS } from "./labels";
import { AUDIT_TABLES } from "@/core/audit/catalog";
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
it.each([["2026-03-29",23,"MEZ"],["2026-10-25",25,"MESZ"],["2026-07-15",24,"MESZ"]] as const)("a day is the wall-clock day of the suite zone across DST transition %s", (day,hours,kuerzel)=>{
 const result=parseAuditFilters({from:day,to:day});expect(result.to!-result.from!+1).toBe(hours*3600000);
 expect(auditTime(result.from!)).toBe(`${day.split("-").reverse().join(".")}, 00:00:00 ${kuerzel}`);
});
it("follows the suite zone setting", async ()=>{
 const { setzeAktiveZeitzone, STANDARD_ZEITZONE } = await import("@/core/zeit");
 try { setzeAktiveZeitzone("UTC"); const result=parseAuditFilters({from:"2026-03-29"}); expect(result.from).toBe(Date.parse("2026-03-29T00:00:00Z")); expect(auditTime(result.from!)).toBe("29.03.2026, 00:00:00 UTC"); }
 finally { setzeAktiveZeitzone(STANDARD_ZEITZONE); }
});
it.each([{from:"2026-02-30"},{from:"2026-09-07",to:"2026-09-06"},{from:"junk"},{actorId:"a".repeat(513)},{objectRef:"secret"},{objectRefHash:"secret"},{module:["qr","files"]},{cursorTime:"1"}])("rejects invalid filters %j", value=>expect(()=>parseAuditFilters(value)).toThrow());
it.each(["true","false","all",["1","0"]])("rejects invalid system selection %j",includeSystem=>expect(()=>parseAuditFilters({includeSystem})).toThrow());
it("names all audited objects and distinct fixed delivery types",()=>{
 for(const tables of Object.values(AUDIT_TABLES)) for(const [table,decision] of Object.entries(tables)) if(decision.mode!=="excluded") expect(OBJECT_LABELS[table],table).toBeTruthy();
 const types=["share_file","share_archive","inbox_file","inbox_archive","group_export","evening_export","checklist_collection","device_collection","participant_export","participant_collection","proof_file"];
 expect(new Set(types.map(t=>OBJECT_LABELS[t])).size).toBe(types.length);
});
/**
 * ⚠️ EINE ABWEISUNG TRAEGT IHREN OBJEKTTYP ALS LITERAL AM AUFRUF, nicht in
 * `AUDIT_TABLES` — die Zusicherung darueber kann sie deshalb strukturell nicht
 * sehen. Genau diese Luecke hat zugeschlagen (DRK-406, in der Durchsicht
 * gefunden): `auditDenied(..., "bereich")` kam neu dazu, ein Label fehlte, und
 * im Protokoll stand fuer jede dieser Zeilen „Weiteres Objekt" — der
 * Rueckfall aus `objectLabel`. Das ist still: es gibt keinen Fehler, nur eine
 * Auskunft, die nichts sagt.
 *
 * Der Scan liest die Typen deshalb aus dem QUELLTEXT statt aus einer hier
 * gepflegten Liste. Eine Liste waere dieselbe Luecke noch einmal — wer den
 * naechsten Aufruf schreibt, denkt an sie genauso wenig wie an das Label.
 */
it("benennt jeden Objekttyp, mit dem irgendwo eine Abweisung protokolliert wird",()=>{
 // `git ls-files` statt `readdirSync` — dieselbe Begruendung wie in
 // `core/kommentaranker.test.ts`: ein Lauf ueber das Dateisystem sammelt in
 // einem benutzten Arbeitsbaum Berichte und Artefakte mit ein.
 const dateien=execFileSync("git",["ls-files","src"],{encoding:"utf8"}).split("\n")
  .filter(d=>/\.tsx?$/.test(d)&&!d.includes(".test."));
 const gefunden=new Map<string,string>();
 for(const datei of dateien){
  for(const treffer of readFileSync(datei,"utf8").matchAll(/auditDenied\(([^;]*?)\)\s*;/g)){
   const args=treffer[1].split(/,(?![^(]*\))/).map(a=>a.trim());
   if(args.length>=3&&args[2].startsWith('"')) gefunden.set(args[2].slice(1,-1),datei);
  }
 }
 expect(gefunden.size,"kein einziger Aufruf gefunden — der Scan greift ins Leere").toBeGreaterThan(0);
 for(const [typ,datei] of gefunden) expect(OBJECT_LABELS[typ],`${typ} (${datei})`).toBeTruthy();
});
