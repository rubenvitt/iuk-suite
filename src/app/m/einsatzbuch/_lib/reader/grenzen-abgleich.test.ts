/**
 * Abgleich der Längengrenzen: Was die Desktop-App beim Versiegeln zulässt, muss der Reader der
 * Suite beim Öffnen annehmen — sonst entsteht ein Block, der sich versiegeln, aber nie mehr lesen
 * lässt. Die App-Dateien liegen unter `apps/**`, außerhalb der Suite-tsconfig; sie werden deshalb
 * als Text gelesen und die Zahlen per Regex herausgezogen. Maßstab ist `einsatzSchema` bzw.
 * `exportinhaltSchema` in `pruefung.ts`. Wer eine der Dateien umbaut, sieht hier Rot statt einer
 * still auseinanderlaufenden Grenze.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { z } from "zod";
import { fahrzeugEingabe, personEingabe, stichwortEingabe } from "../stammdaten/schemas";
import { einsatzSchema, exportinhaltSchema } from "./pruefung";

const APP = join(process.cwd(), "apps", "einsatzbuch");
const lies = (pfad: string) => readFileSync(join(APP, pfad), "utf8");
const zahl = (s: string) => Number(s.replaceAll("_", ""));

/** Höchstlänge eines `z.string().max(n)` (zod 4: `.maxLength`). */
function textMax(s: z.ZodType): number {
  const n = (s as unknown as { maxLength: number | null }).maxLength;
  if (typeof n !== "number") throw new Error("Schema ohne Längengrenze");
  return n;
}
/** Höchstzahl eines `z.array(…).max(n)`; zod 4 führt sie als Prüfung `max_length` im `def`. */
function arrayMax(s: z.ZodType): number {
  const checks = (s as unknown as { _zod: { def: { checks?: { _zod: { def: { check: string; maximum?: number } } }[] } } })._zod.def.checks ?? [];
  const n = checks.map((c) => c._zod.def).find((d) => d.check === "max_length")?.maximum;
  if (typeof n !== "number") throw new Error("Array ohne Obergrenze");
  return n;
}

const E = einsatzSchema.shape;
const FZ = E.fahrzeuge.element.shape;
const PS = E.personal.element.shape;

/** Reader-Grenze je Einsatzfeld (Klartextfelder und Listen), wie die App-Dateien sie benennen. */
const EINSATZFELD: Record<string, () => number> = {
  nummer: () => textMax(E.nummer),
  stichwort: () => textMax(E.stichwort),
  strasse: () => textMax(E.strasse),
  ort: () => textMax(E.ort),
  objekt: () => textMax(E.objekt),
  notizen: () => textMax(E.notizen),
  fahrzeuge: () => arrayMax(E.fahrzeuge),
  personal: () => arrayMax(E.personal),
};

/** Jede Konstante in `grenzen.rs` und ihr Gegenstück im Reader. Eine neue Konstante muss hier hinein. */
const RUST: Record<string, () => number> = {
  STICHWORT: EINSATZFELD.stichwort,
  STRASSE: EINSATZFELD.strasse,
  ORT: EINSATZFELD.ort,
  OBJEKT: EINSATZFELD.objekt,
  NOTIZEN: EINSATZFELD.notizen,
  NUMMER: EINSATZFELD.nummer,
  FAHRZEUGE: EINSATZFELD.fahrzeuge,
  PERSONAL: EINSATZFELD.personal,
  FAHRZEUG_ID: () => textMax(FZ.id),
  FAHRZEUG_TYP: () => textMax(FZ.typ),
  FAHRZEUG_KENNUNG: () => textMax(FZ.kennung),
  FAHRZEUG_RUF: () => textMax(FZ.ruf),
  FAHRZEUG_STANDORT: () => textMax(FZ.standort),
  PERSON_ID: () => textMax(PS.id),
  PERSON_NAME: () => textMax(PS.name),
  PERSON_QUALI: () => textMax(PS.quali),
  PERSON_OV: () => textMax(PS.ov),
  BLOECKE: () => arrayMax(exportinhaltSchema.shape.bloecke),
};

/** Ganzzahltypen, die Rust für eine Grenze erlaubt; jede `pub const` mit einem davon ist eine Grenze. */
const GANZZAHL = "(?:u8|u16|u32|u64|u128|usize|i8|i16|i32|i64|i128|isize)";
/** Ein Zahlliteral wie in Rust (`20_000`, auch mit Typsuffix `10_000u64`), sonst `undefined`. */
function literal(wert: string): number | undefined {
  const m = new RegExp(`^([\\d_]+)${GANZZAHL}?$`).exec(wert.trim());
  return m ? zahl(m[1]) : undefined;
}

describe("grenzen.rs (Rust-Kern) gegen den Reader", () => {
  const text = lies("src-tauri/kern/src/grenzen.rs");
  const gefunden = new Map([...text.matchAll(new RegExp(`^pub const ([A-Z0-9_]+): ${GANZZAHL} = ([^;]+);`, "gm"))].map((m) => [m[1], m[2]]));
  const alleKonstanten = [...text.matchAll(/^pub const ([A-Za-z0-9_]+)\s*:/gm)].map((m) => m[1]);

  // Mindestbestand: diese Grenzen müssen da sein, auch wenn jemand die Datei umbaut.
  for (const name of Object.keys(RUST)) {
    it(`${name} ist in grenzen.rs vorhanden`, () => {
      expect(gefunden.has(name), `Grenze ${name} nicht gefunden — Datei umgebaut?`).toBe(true);
    });
  }
  // Jede gefundene Grenze, auch eine neue, wird gegen den Reader verglichen.
  for (const [name, wert] of gefunden) {
    it(`${name} gleicht der Reader-Grenze`, () => {
      const reader = RUST[name];
      expect(reader, `Grenze ${name} in grenzen.rs hat kein Gegenstück im Reader — in RUST (grenzen-abgleich.test.ts) zuordnen`).toBeDefined();
      const n = literal(wert);
      expect(n, `Grenze ${name} = ${wert} ist kein Zahlliteral — der Abgleich kann sie nicht lesen`).toBeDefined();
      expect(n).toBe(reader());
    });
  }
  it("jede pub const in grenzen.rs hat einen Ganzzahltyp", () => {
    expect(alleKonstanten.filter((n) => !gefunden.has(n)), "pub const ohne Ganzzahltyp — kann keine Längengrenze sein, oder der Abgleich übersieht sie").toEqual([]);
  });
});

describe("formular.ts (Oberfläche der App) gegen den Reader", () => {
  const text = lies("src/logik/formular.ts");
  const block = /export const HOECHSTLAENGE = \{([^}]*)\}/.exec(text)?.[1];
  const gefunden = new Map([...(block ?? "").matchAll(/(\w+): ([\d_]+)/g)].map((m) => [m[1], zahl(m[2])]));

  it("HOECHSTLAENGE ist vorhanden", () => {
    expect(block, "Grenze HOECHSTLAENGE nicht gefunden — Datei umgebaut?").toBeDefined();
  });
  // Mindestbestand: diese Felder begrenzt das Formular heute.
  for (const feld of ["strasse", "ort", "objekt", "notizen"]) {
    it(`HOECHSTLAENGE.${feld} ist vorhanden`, () => {
      expect(gefunden.has(feld), `Grenze HOECHSTLAENGE.${feld} nicht gefunden — Datei umgebaut?`).toBe(true);
    });
  }
  for (const [feld, wert] of gefunden) {
    it(`HOECHSTLAENGE.${feld} gleicht der Reader-Grenze`, () => {
      expect(EINSATZFELD[feld], `HOECHSTLAENGE.${feld} ist kein Einsatzfeld mit Reader-Grenze — in EINSATZFELD (grenzen-abgleich.test.ts) zuordnen`).toBeDefined();
      expect(wert).toBe(EINSATZFELD[feld]());
    });
  }
});

describe("e2e/stub.ts (Nachbau des Rust-Befehls) gegen den Reader", () => {
  const text = lies("e2e/stub.ts");
  const laengen = new Map([...text.matchAll(/\["[^"]+", e\.(\w+)(?:\.trim\(\))?, ([\d_]+)\]/g)].map((m) => [m[1], zahl(m[2])]));
  const listen = new Map([...text.matchAll(/e\.(\w+)\.length > ([\d_]+)/g)].map((m) => [m[1], zahl(m[2])]));

  // Mindestbestand: diese Prüfungen baut der Stub heute nach.
  for (const feld of ["stichwort", "strasse", "ort", "objekt", "notizen"]) {
    it(`Längenprüfung ${feld} ist vorhanden`, () => {
      expect(laengen.has(feld), `Grenze ${feld} nicht gefunden — Datei umgebaut?`).toBe(true);
    });
  }
  for (const feld of ["fahrzeuge", "personal"]) {
    it(`Anzahlprüfung ${feld} ist vorhanden`, () => {
      expect(listen.has(feld), `Grenze ${feld} nicht gefunden — Datei umgebaut?`).toBe(true);
    });
  }
  for (const [art, gefunden] of [["Länge", laengen], ["Anzahl", listen]] as const) {
    for (const [feld, wert] of gefunden) {
      it(`${art} ${feld} gleicht der Reader-Grenze`, () => {
        expect(EINSATZFELD[feld], `${art} ${feld} im Stub ist kein Einsatzfeld mit Reader-Grenze — in EINSATZFELD (grenzen-abgleich.test.ts) zuordnen`).toBeDefined();
        expect(wert).toBe(EINSATZFELD[feld]());
      });
    }
  }
});

describe("Pflege-Schemas der Suite bleiben unter den Reader-Grenzen", () => {
  // Jedes Feld der Pflege ist entweder einer Reader-Grenze zugeordnet oder ausdrücklich ausgenommen:
  // `gruppe` wandert nicht in den Einsatz (nur das Stichwort selbst), `aktiv`/`reihenfolge` sind keine Texte.
  const PFLEGE: [string, z.ZodObject, Record<string, (() => number) | null>][] = [
    ["fahrzeugEingabe", fahrzeugEingabe, { typ: () => textMax(FZ.typ), kennung: () => textMax(FZ.kennung), ruf: () => textMax(FZ.ruf), standort: () => textMax(FZ.standort), aktiv: null }],
    ["personEingabe", personEingabe, { name: () => textMax(PS.name), quali: () => textMax(PS.quali), ov: () => textMax(PS.ov), aktiv: null }],
    ["stichwortEingabe", stichwortEingabe, { name: EINSATZFELD.stichwort, gruppe: null, reihenfolge: null, aktiv: null }],
  ];
  for (const [name, schema, zuordnung] of PFLEGE) {
    it(`${name}: jedes Feld ist zugeordnet oder ausgenommen`, () => {
      expect(Object.keys(schema.shape).sort()).toEqual(Object.keys(zuordnung).sort());
    });
    for (const [feld, reader] of Object.entries(zuordnung)) {
      if (!reader) continue;
      it(`${name}.${feld} erreicht höchstens die Reader-Grenze`, () => {
        expect(textMax(schema.shape[feld] as z.ZodType)).toBeLessThanOrEqual(reader());
      });
    }
  }
});
