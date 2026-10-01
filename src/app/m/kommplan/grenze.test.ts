import { describe, expect, it } from "vitest";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";

/**
 * DIE IMPORTGRENZEN DES MODULS — alle strukturell, keine davon sieht `pnpm build` rechtzeitig.
 *
 * 1. `@einsatzzeichen/*` sind devDependencies und brechen jeden Server-Import im Build (Befund M1
 *    der Zeichen-Spec 2026-09-02), auch als Seiteneffekt- oder dynamischer Import und auch in einer
 *    SSR-gerenderten Client-Insel (M2). Nur das Generatorskript und Tests dürfen sie laden.
 * 2. Das große Rezept-Generat (rund 220 KB) gehört dem Server. Der Betrachter bekommt nur die
 *    Symbole seines Plans als Prop. Geprüft wird TRANSITIV: eine Client-Insel, die einen
 *    `_lib`-Helfer zieht, der seinerseits `zeichen/zeichen` zieht, trüge das Generat still ins
 *    Bündel — weder build noch typecheck melden das.
 * 3. Layout, Planmodell und Zeichnung laufen auf Server UND Client: kein "use client" (Falle 6),
 *    kein `next/*`, kein `node:*`.
 * 4. Die Layout-Engine ist deterministisch: kein Zufall, keine Uhr.
 *
 * Direktive und Importformen erkennt dieser Test wie `core/shell/icons.test.ts`
 * (`ohneKommentare`, `traegtClientDirektive`, `importSpezifizierer`) — dort steht die Messung,
 * warum Kommentar-Abzug, beide Anführungszeichen und vier Importformen nötig sind.
 */
const MODUL = "src/app/m/kommplan";

function dateien(ordner: string): string[] {
  if (!existsSync(ordner)) return [];
  return readdirSync(ordner).flatMap((name) => {
    const pfad = join(ordner, name);
    return statSync(pfad).isDirectory() ? dateien(pfad) : [pfad];
  });
}
const quelltext = (pfad: string) => readFileSync(pfad, "utf8");
const istTest = (pfad: string) => /\.test\.tsx?$/.test(pfad);
const laufzeit = dateien(MODUL).filter((p) => /\.tsx?$/.test(p) && !istTest(p));

const ohneKommentare = (q: string) => q.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
const istClient = (q: string) => /^\s*["']use client["']/.test(ohneKommentare(q));
/**
 * Eine Server-Action-Datei ist für den Browser nur ein Aufrufverweis: was sie importiert, landet
 * NICHT im Bündel der Insel. Erkannt wird sie genau wie in `src/core/audit/coverage.test.ts`
 * (Direktive auf Byte 0, doppelte Anführungszeichen) — eine anders geschriebene Datei wäre dort
 * nicht im Manifest und hier keine Grenze; beides fällt dann auf.
 */
const istServerAktion = (q: string) => q.startsWith('"use server"');
/**
 * Alle LAUFZEIT-Spezifizierer: `from "…"`, `import "…"`, `import("…")`, `require("…")`.
 * Reine Typ-Importe (`import type …`, `export type … from`) fallen weg — sie verschwinden beim
 * Übersetzen, und ohne den Abzug wäre `import type { Symbolsatz }` im Betrachter ein Fehlalarm.
 */
function spezifizierer(q: string): string[] {
  const ohneTypen = ohneKommentare(q).replace(/^\s*(?:import|export)\s+type\b[^;]*;/gm, "");
  return [...ohneTypen.matchAll(/(?:\bfrom|\bimport|\brequire)\s*\(?\s*["']([^"']+)["']/g)].map((m) => m[1]);
}
/** Relativ oder `@/…` → Datei im Repo; alles andere (Pakete) → null. */
function aufloesen(von: string, s: string): string | null {
  const basis = s.startsWith("@/") ? join("src", s.slice(2)) : s.startsWith(".") ? join(dirname(von), s) : null;
  if (basis === null) return null;
  for (const k of [basis, `${basis}.ts`, `${basis}.tsx`, join(basis, "index.ts"), join(basis, "index.tsx")]) {
    if (existsSync(k) && statSync(k).isFile()) return k;
  }
  return null;
}
/** Alles, was eine Datei zur Laufzeit zieht — transitiv, innerhalb des Moduls. */
function erreichbar(start: string): Set<string> {
  const gesehen = new Set<string>();
  const offen = [start];
  while (offen.length > 0) {
    const datei = offen.pop()!;
    if (gesehen.has(datei)) continue;
    gesehen.add(datei);
    if (datei !== start && istServerAktion(quelltext(datei))) continue; // Grenze: nur Aufrufverweis
    if (!/\.tsx?$/.test(datei)) continue; // JSON hat keine Importe
    for (const s of spezifizierer(quelltext(datei))) {
      const ziel = aufloesen(datei, s);
      if (ziel !== null && ziel.startsWith(MODUL)) offen.push(ziel);
    }
  }
  return gesehen;
}

describe("kommplan: der Riegel selbst", () => {
  it("sieht Seiteneffekt-, dynamische und require-Importe, aber keine reinen Typ-Importe", () => {
    expect(spezifizierer('import "@einsatzzeichen/core";')).toEqual(["@einsatzzeichen/core"]);
    expect(spezifizierer('const m = await import("@einsatzzeichen/catalog");')).toEqual(["@einsatzzeichen/catalog"]);
    expect(spezifizierer("const m = require('@einsatzzeichen/schema');")).toEqual(["@einsatzzeichen/schema"]);
    expect(spezifizierer('import type {\n  A,\n  B,\n} from "./zeichen/zeichen";\nimport { c } from "./c";')).toEqual(["./c"]);
  });
  it("erkennt die Direktive auch mit Kopfkommentar und einfachen Anführungszeichen", () => {
    expect(istClient("/* Kopf */\n'use client';\nexport {}")).toBe(true);
    expect(istClient('// Kopf\n"use client";')).toBe(true);
    expect(istClient('export const x = "use client";')).toBe(false);
  });  it("eine Server-Action-Datei ist Grenze der transitiven Prüfung — erkannt wie in core/audit/coverage.test.ts", () => {
    expect(istServerAktion('"use server";\nimport { x } from "../_lib/zeichen/zeichen";')).toBe(true);
    expect(istServerAktion('// Kopf\n"use server";')).toBe(false);
    expect(istServerAktion("'use server';")).toBe(false);
  });
});

describe("kommplan: Importgrenzen", () => {
  it("keine Laufzeitdatei importiert @einsatzzeichen, in keiner Form", () => {
    const verstoesse = laufzeit.filter((p) => spezifizierer(quelltext(p)).some((s) => s.startsWith("@einsatzzeichen/")));
    expect(verstoesse).toEqual([]);
  });

  it("nur _lib/zeichen/zeichen.ts liest das Rezept-Generat", () => {
    const leser = laufzeit.filter((p) => spezifizierer(quelltext(p)).some((s) => s.endsWith("zeichen.generiert.json")));
    expect(leser.map((p) => relative(MODUL, p))).toEqual(
      leser.length === 0 ? [] : ["_lib/zeichen/zeichen.ts"],
    );
  });

  it("keine Client-Insel erreicht zeichen.ts oder das Rezept-Generat, auch nicht über Umwege", () => {
    const verboten = [join(MODUL, "_lib/zeichen/zeichen.ts"), join(MODUL, "_lib/zeichen/zeichen.generiert.json")];
    for (const p of laufzeit.filter((x) => istClient(quelltext(x)))) {
      const treffer = [...erreichbar(p)].filter((d) => verboten.includes(d));
      expect(treffer, `${relative(MODUL, p)} zieht ${treffer.join(", ")}`).toEqual([]);
    }
  });

  it("geteilte Ordner sind rein: kein use client, kein next/*, kein node:*, kein react-dom", () => {
    const geteilt = laufzeit.filter((p) =>
      ["_lib/layout/", "_lib/plan/", "_lib/beispiele/", "_ui/zeichnung/", "_lib/angaben.ts", "_lib/ergebnis.ts", "_lib/editorAnsicht.ts", "_lib/logo/", "_lib/bibliothek/", "_lib/tagesfassung.ts", "_lib/herkunft.ts"].some((o) => relative(MODUL, p).startsWith(o)),
    );
    for (const p of geteilt) {
      const q = quelltext(p);
      expect(istClient(q), p).toBe(false);
      expect(spezifizierer(q).filter((s) => /^(next\/|node:|react-dom)/.test(s)), p).toEqual([]);
    }
  });

  it("die Layout-Engine kennt weder Zufall noch Uhr", () => {
    const layout = laufzeit.filter((p) => relative(MODUL, p).startsWith("_lib/layout/") && !p.endsWith("zufall.ts"));
    for (const p of layout) expect(/Math\.random|Date\.now|new Date\b/.test(ohneKommentare(quelltext(p))), p).toBe(false);
  });
  it("Server Actions liegen nur unter _actions/ und beginnen auf Byte 0 mit der Direktive", () => {
    const aktionen = laufzeit.filter((p) => /["']use server["']/.test(ohneKommentare(quelltext(p)).split("\n").slice(0, 3).join("\n")));
    for (const p of aktionen) {
      expect(relative(MODUL, p).startsWith("_actions/"), p).toBe(true);
      expect(istServerAktion(quelltext(p)), p).toBe(true);
    }
  });
});
