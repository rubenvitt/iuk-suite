import { expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import ts from "typescript";
import manifest from "./coverage-manifest.json";
function files(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap(e => e.isDirectory() ? files(join(dir, e.name)) : [join(dir, e.name)]);
}
it("classifies every callable server action and HTTP handler, including new exports", () => {
  const actual: string[] = [];
  for (const path of files("src/app").filter(p => p.endsWith(".ts") && !p.includes(".test."))) {
    const source = readFileSync(path, "utf8");
    const action = source.startsWith('"use server"');
    if (!action && !path.endsWith("/route.ts")) continue;
    const ast = ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true);
    for (const statement of ast.statements) {
      if (!ts.isVariableStatement(statement) || !statement.modifiers?.some(m => m.kind === ts.SyntaxKind.ExportKeyword)) continue;
      for (const declaration of statement.declarationList.declarations) {
        const names = ts.isObjectBindingPattern(declaration.name) ? declaration.name.elements.map(e => e.name.getText(ast)) : [declaration.name.getText(ast)];
        for (const name of names) {
          if (!action && !["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"].includes(name)) continue;
          const key = `${path}#${name}`;
          actual.push(key);
          const entry = (manifest as Record<string, { kind: string; reason?: string }>)[key];
          expect(entry, key).toBeDefined();
          expect(entry.reason, key).toBeTruthy();
        }
      }
    }
    const declarations = ast.statements.filter(ts.isFunctionDeclaration);
    for (const fn of declarations) {
      if (!fn.body || !fn.name || !fn.modifiers?.some(m => m.kind === ts.SyntaxKind.ExportKeyword)) continue;
      if (!action && !["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"].includes(fn.name.text)) continue;
      const key = `${path}#${fn.name.text}`;
      actual.push(key);
      const entry = (manifest as Record<string, { kind: string; via?: string; reason?: string }>)[key];
      expect(entry, key).toBeDefined();
      if (entry.kind === "context") {
        const target = declarations.find(d => d.name?.text === entry.via);
        expect(target?.body?.getText(ast), key).toMatch(/withAuditContext|auditDelivery/);
        if (entry.via !== fn.name.text) expect(fn.body.getText(ast), key).toContain(`${entry.via}(`);
      } else if (entry.kind === "explicit-only") {
        expect(fn.body.getText(ast), key).toContain("auditEvent(");
      } else expect(entry.reason, key).toBeTruthy();
    }
  }
  expect(actual.sort()).toEqual(Object.keys(manifest).sort());
});
it("keeps detached worker entries isolated from request identities", () => {
  for (const [path, name] of [
    ["src/app/m/files/_lib/av.ts", "starteAvArbeiter"],
    ["src/app/m/files/_lib/av.ts", "reiheAvEin"],
    ["src/app/m/files/_lib/boot.ts", "taktLauf"],
    ["src/app/m/aufgaben/_lib/scan.ts", "starteAufgabenScanArbeiter"],
  ]) {
    const source = readFileSync(path, "utf8");
    const ast = ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true);
    const fn = ast.statements.filter(ts.isFunctionDeclaration).find(f => f.name?.text === name);
    expect(fn?.body?.getText(ast)).toMatch(/withAuditContext\(\{ actor: \{ kind: "system" \}/);
  }
});


it("keeps local masked denials covered independently of successful-read exclusions", () => {
  const expected = [
    "src/app/m/radio/admin/(arbeit)/import/hochladen/route.ts#POST",
    "src/app/m/aufgaben/a/[id]/nachweis/hochladen/route.ts#POST",
    "src/app/m/aufgaben/a/[id]/nachweis/[nachweisId]/route.ts#GET",
  ];
  const entries = Object.entries(manifest) as [string, { denial?: { via: string; reason: string } }][];
  expect(entries.filter(([, entry]) => entry.denial).map(([key]) => key).sort()).toEqual(expected.sort());
  for (const [key, entry] of entries) {
    if (!entry.denial) continue;
    const path = key.split("#")[0];
    const ast = ts.createSourceFile(path, readFileSync(path, "utf8"), ts.ScriptTarget.Latest, true);
    const fn = ast.statements.filter(ts.isFunctionDeclaration).find(f => f.name?.text === entry.denial?.via);
    expect(fn?.body?.getText(ast), key).toContain("auditDenied(");
    expect(entry.denial.reason, key).toBeTruthy();
  }
});

it("declares a fixed object type and resolved reference for every delivery boundary", () => {
  const entries = manifest as Record<string, { delivery?: { objectType: string; reference: string } }>;
  const actual: string[] = [];
  for (const path of files("src/app").filter(p => p.endsWith("/route.ts"))) {
    const source = readFileSync(path, "utf8");
    if (!source.includes("return auditDelivery(")) continue;
    const key = `${path}#GET`;
    actual.push(key);
    const target = entries[key]?.delivery;
    expect(target, key).toBeDefined();
    expect(source, key).toContain(`"${target!.objectType}"`);
    expect(source, key).toContain(`target(${target!.reference});`);
  }
  expect(actual.sort()).toEqual(Object.keys(entries).filter(key => entries[key].delivery).sort());
  expect(actual).toHaveLength(11);
});
