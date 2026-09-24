# Einsatzbuch v2 — Stufe 1: geteilter Kern und Modulgerüst — Umsetzungsplan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Der geteilte Kern des Einsatzbuchs (Format, JCS, Kette, Umschlag, Export, Bericht, Testvektoren) liegt geprüft in der Suite, und das Modul `einsatzbuch` ist mit Registry, Host-Riegel, Gruppenzugang, eigener Datenbank und einer Übersichtsseite registriert.

**Architecture:** Der Kern unter `src/app/m/einsatzbuch/_lib/kern/` ist reines TypeScript auf WebCrypto, ohne `next`/`node:*`/Suite-Importe (ein Grenztest hält das). Das Modul folgt dem Muster von `uav`/`radio`: `requiresAuth: false` in der Registry, Host- und Gruppenriegel modul-intern in `_lib/`, eigene SQLite mit bislang nur `audit_outbox`.

**Tech Stack:** TypeScript 6, WebCrypto (ECDH P-256, HKDF-SHA256, AES-256-GCM, PBKDF2), Vitest 4, Next.js 16, Drizzle, Playwright.

**Spec:** `docs/superpowers/specs/2026-09-24-einsatzbuch-v2-design.md` (§2.1, §2.3, §3, §7, §9.1, §11 Stufe 1)

**Ticket:** DRK-471 (Status `in progress`). Ticketnummer in jeden Commit-Body.

## Global Constraints

- Deutsche Texte mit echten Umlauten; Bezeichner, Datei- und Branchnamen ASCII (`~/.claude/CLAUDE.md`).
- Kern: keine Importe außer relativen, `react`, `@/core/theme/tokens` — gilt auch für `testvektoren/erzeuge.ts` und `einsaetze.ts` (Tests dürfen `node:*`).
- Kryptografie ausschließlich über `globalThis.crypto.subtle`; Byte-Arrays sind `Uint8Array<ArrayBuffer>` (Typ `Bytes`), sonst lehnt TS 6 sie als `BufferSource` ab.
- Blockkopf trägt `umgebung: "echt" | "test"` (Spec §12, Test-Rechner); das Feld steht in Hash und AAD.
- Hash = SHA-256-Hex über `kanonisch({kopf, iv, daten, umschlag})`; Kopf ist AAD an Nutzdaten und Umschlag; HKDF-Info `einsatzbuch/v1/umschlag`, Salt leer; `schluesselId` = erste 16 Hex-Zeichen von SHA-256(SPKI).
- Export: `format: "einsatzbuch-export"`, `version: 2`, PBKDF2-SHA256 **600 000** Runden, Kennwort ≥ 10 Zeichen.
- Nie `timeZone` als Literal auf Modulebene; jede `Intl.DateTimeFormat` entsteht im Aufruf, die Zone kommt als Parameter (`CLAUDE.md`, „Zeitzone").
- Modul: `requiresAuth: false`, Zugangsgruppe `einsatzbuch-verwaltung` (überschreibbar per `SUITE_ACCESS_GROUP_EINSATZBUCH`), `adminGroups: []`, `showInSwitcher: false` bis Stufe 3. **Nur die Gruppe öffnet das Modul, nicht der Suite-Admin** (hier liegt ab Stufe 5 die Schlüsselfreigabe).
- Alle `notFound()`/`redirect()` in `_lib/*.ts`, nie direkt in `page.tsx`/`layout.tsx` — sonst verlangt `core/audit/coverage.test.ts` Manifest-Einträge und eine höhere Denial-Zahl.
- Signierte Commits (`git commit -S`), Conventional-Commit-Kopfzeile: `feat(einsatzbuch): …` für neue Funktion, `test`/`chore`/`docs` sonst. Zeile `DRK-471` im Body, am Ende `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Tore vor dem PR: `pnpm typecheck` · `pnpm lint` · `pnpm vitest run` · `pnpm build` · `pnpm exec playwright test e2e/einsatzbuch.spec.ts`. Kein offener `pnpm dev` während Playwright (Memory „Worktrees vergiften die Prüfungstore").

**Abweichung von Spec §11, Stufe 1:** Workspace-Eintrag (`pnpm-workspace.yaml`) und die Werkzeug-Ausschlüsse für `apps/**` (tsconfig, ESLint, Vitest, Docker) wandern nach **Stufe 4**. Ohne `apps/einsatzbuch/` lässt sich weder ihre Wirkung noch der Docker-Build dazu messen; ein Ausschluss für einen nicht existierenden Ordner wäre ungeprüft.

## Review Focus

1. **Notizen mit Umlauten, „typografischen" und geraden Anführungszeichen, Zeilenumbruch und Emoji** → derselbe Fingerabdruck in TS und Rust. Gepinnt durch den dritten Testeinsatz in `testvektoren/einsaetze.ts` (Task 5); Rust vergleicht in Stufe 4 byte-genau.
2. **Ein Einsatz über die Nacht der Zeitumstellung** (25.10. 01:30–03:30) → Dauer 180 min, nicht 120. Gepinnt in `zeit.test.ts` (Task 3).
3. **Eine Datei aus dem Prototyp (`version: 1`), ein beliebiges JSON oder eine Datei mit manipulierter Rundenzahl** → sauber abgelehnt, bevor nach dem Kennwort gefragt wird. Gepinnt in `export.test.ts` (Task 4).
4. **Ein Umschlag, der auf einen anderen Block umgehängt wird, ein veränderter Blockkopf oder ein Testblock, dessen `umgebung` auf `echt` umgeschrieben wurde** → Auspacken/Öffnen scheitert, die Kette bricht. Gepinnt in `block.test.ts` und `kette.test.ts` (Task 2).
5. **Ohne Anmeldung, ohne Gruppe, als Suite-Admin ohne Gruppe oder über einen fremden Suite-Host** → keine Übersicht (Login bzw. 404). Gepinnt in `zugang.test.ts`, `hostRiegel.test.ts` (Task 6) und `e2e/einsatzbuch.spec.ts` (Task 8).

---

## Dateistruktur

```
src/app/m/einsatzbuch/
├── _lib/
│   ├── kern/                     GETEILT mit der Desktop-App (Stufe 4)
│   │   ├── bytes.ts              Base64, Hex, UTF-8, SHA-256, Zufall; Typ Bytes
│   │   ├── kanonisch.ts          JCS (RFC 8785) für die Werte des Einsatzbuchs
│   │   ├── format.ts             Typen Einsatz, Blockkopf, Block, Umschlag, Export*; GENESIS
│   │   ├── kette.ts              blockHash, pruefeKette
│   │   ├── umschlag.ts           schluesselIdVon, import*, erzeugeSchluesselpaar, packeEin, packeAus
│   │   ├── block.ts              versiegele, oeffneBlock
│   │   ├── zeit.ts               wandzeitZuInstant, dauerMinuten, datumText, zeitpunktText, dauerText
│   │   ├── bericht.ts            bericht() → Berichtsdaten
│   │   ├── export.ts             verschluesseleExport, entschluesseleExport, istExportdatei, KennwortFalsch
│   │   ├── testhilfe.ts          beispielEinsatz, kopf (nur für Tests, aber ohne Node → darf im Kern liegen)
│   │   ├── grenze.test.ts        Importgrenze
│   │   ├── *.test.ts
│   │   └── testvektoren/
│   │       ├── einsaetze.ts      TESTEINSAETZE, TESTVERSIEGELT
│   │       ├── erzeuge.ts        erzeugeErwartung, neueEingaben
│   │       ├── eingaben.json     fester Zufall + TEST-Schlüssel (erzeugt)
│   │       ├── erwartet.json     Blöcke + Exportdatei (erzeugt)
│   │       └── testvektoren.test.ts
│   ├── host.ts                   istEinsatzbuchHost, requireEinsatzbuchHost, einsatzbuchHostOderNull
│   ├── hostRiegel.ts             hostAbweisung(req)
│   ├── zugang.ts                 hatEinsatzbuchZugang, requireEinsatzbuchZugang
│   └── seedLokal.ts              seedLokalEinsatzbuch
├── _db/ schema.ts · client.ts · drizzle.config.ts · migrations/
├── layout.tsx                    nur children
├── (verwaltung)/layout.tsx       Host + Zugang + FullShell
├── (verwaltung)/page.tsx         Übersicht
└── registry.test.ts
scripts/einsatzbuch-testvektoren.ts
e2e/einsatzbuch.spec.ts
```

Geändert: `src/core/registry.ts`, `src/core/shell/icons.ts`, `src/core/bootstrap.ts`, `Dockerfile`, `src/core/audit/types.ts`, `src/core/audit/catalog.ts`, `scripts/seed-lokal.ts`, `.env.example`, `e2e/gruppen.json`.

Im Folgenden steht `K` für `src/app/m/einsatzbuch/_lib/kern`.

---

### Task 1: Bytes und kanonisches JSON

**Files:**
- Create: `K/bytes.ts`, `K/kanonisch.ts`
- Test: `K/bytes.test.ts`, `K/kanonisch.test.ts`

**Interfaces:**
- Produces: `type Bytes = Uint8Array<ArrayBuffer>`; `utf8(text): Bytes`; `ausUtf8(bytes): string` (wirft bei ungültigem UTF-8); `zuBase64(bytes): string`; `ausBase64(text): Bytes` (wirft „Kein gültiges Base64"); `zuHex(bytes): string`; `sha256Hex(bytes): Promise<string>`; `zufall(n): Bytes`; `kanonisch(wert: unknown): string`.

- [ ] **Step 1: Tests schreiben**

`K/bytes.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { ausBase64, ausUtf8, sha256Hex, utf8, zuBase64, zuHex } from "./bytes";

describe("bytes", () => {
  it("Base64 hin und zurück, auch über 32 KiB", () => {
    const gross = new Uint8Array(70_000).map((_, i) => i % 251);
    expect(ausBase64(zuBase64(gross))).toEqual(gross);
    expect(zuBase64(new Uint8Array([0, 1, 2, 255]))).toBe("AAEC/w==");
  });
  it("ungültiges Base64 wird abgelehnt statt still verstümmelt", () => {
    expect(() => ausBase64("AAEC/w=")).toThrow("Kein gültiges Base64");
    expect(() => ausBase64("AA EC")).toThrow("Kein gültiges Base64");
  });
  it("SHA-256 kennt den Prüfwert aus FIPS 180-2", async () => {
    expect(await sha256Hex(utf8("abc"))).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  });
  it("UTF-8 mit Umlauten, ungültige Folgen werfen", () => {
    expect(ausUtf8(utf8("Übergabe „ok“"))).toBe("Übergabe „ok“");
    expect(() => ausUtf8(new Uint8Array([0xff]))).toThrow();
    expect(zuHex(new Uint8Array([0, 15, 255]))).toBe("000fff");
  });
});
```

`K/kanonisch.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { kanonisch } from "./kanonisch";

describe("kanonisch (RFC 8785 für die Werte des Einsatzbuchs)", () => {
  it("sortiert Schlüssel, lässt Leerraum weg, verschachtelt", () => {
    expect(kanonisch({ b: 1, a: [true, null, "x"], c: { z: "", y: -3 } })).toBe('{"a":[true,null,"x"],"b":1,"c":{"y":-3,"z":""}}');
  });
  it("sortiert Zahlschlüssel als Zeichenketten", () => {
    expect(kanonisch({ "10": 1, "2": 2, "1": 3 })).toBe('{"1":3,"10":1,"2":2}');
  });
  it("maskiert wie JSON.stringify: Anführungszeichen, Zeilenumbruch, Steuerzeichen; Umlaute und Emoji bleiben roh", () => {
    expect(kanonisch("ä\n\"x\u0001😀")).toBe('"ä\\n\\"x\\u0001😀"');
  });
  it("lehnt Brüche, undefined und einzelne Surrogate ab", () => {
    expect(() => kanonisch({ a: 1.5 })).toThrow("Nur ganze Zahlen");
    expect(() => kanonisch({ a: undefined })).toThrow("undefined");
    expect(() => kanonisch("\uD800")).toThrow("Surrogat");
    expect(() => kanonisch("a\uDC00")).toThrow("Surrogat");
  });
});
```

- [ ] **Step 2: Rot sehen**

Run: `pnpm vitest run src/app/m/einsatzbuch/_lib/kern/bytes.test.ts src/app/m/einsatzbuch/_lib/kern/kanonisch.test.ts`
Expected: FAIL — `Failed to resolve import "./bytes"` / `"./kanonisch"`.

- [ ] **Step 3: Umsetzen**

`K/bytes.ts`:
```ts
/** Bytefolgen, die WebCrypto ohne Umweg annimmt (`BufferSource` verlangt einen `ArrayBuffer`, keinen `SharedArrayBuffer`). */
export type Bytes = Uint8Array<ArrayBuffer>;

export function utf8(text: string): Bytes {
  return new TextEncoder().encode(text);
}

export function ausUtf8(bytes: Bytes): string {
  return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
}

export function zuBase64(bytes: Uint8Array): string {
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

export function ausBase64(text: string): Bytes {
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(text) || text.length % 4 !== 0) throw new Error("Kein gültiges Base64");
  const bin = atob(text);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export function zuHex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

export async function sha256Hex(bytes: Bytes): Promise<string> {
  return zuHex(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)));
}

export function zufall(laenge: number): Bytes {
  return crypto.getRandomValues(new Uint8Array(laenge));
}
```

`K/kanonisch.ts`:
```ts
/**
 * Kanonisches JSON nach RFC 8785 (JCS) für die Werte, die das Einsatzbuch kennt:
 * Objekte, Arrays, Zeichenketten, ganze Zahlen, Wahrheitswerte und `null`.
 * Brüche, `undefined` und einzelne Surrogate sind hier Fehler, keine Randfälle:
 * Der Fingerabdruck eines Blocks muss in TypeScript und Rust byte-gleich entstehen.
 */
const EINZELNES_SURROGAT = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/;

export function kanonisch(wert: unknown): string {
  if (wert === null) return "null";
  if (typeof wert === "boolean") return wert ? "true" : "false";
  if (typeof wert === "number") {
    if (!Number.isSafeInteger(wert)) throw new Error(`Nur ganze Zahlen erlaubt: ${wert}`);
    return String(wert);
  }
  if (typeof wert === "string") {
    if (EINZELNES_SURROGAT.test(wert)) throw new Error("Zeichenkette enthält ein einzelnes Surrogat");
    return JSON.stringify(wert);
  }
  if (Array.isArray(wert)) return `[${wert.map(kanonisch).join(",")}]`;
  if (typeof wert === "object") {
    const eintraege = Object.entries(wert as Record<string, unknown>);
    for (const [k, v] of eintraege) if (v === undefined) throw new Error(`Feld ${k} ist undefined`);
    eintraege.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${eintraege.map(([k, v]) => `${kanonisch(k)}:${kanonisch(v)}`).join(",")}}`;
  }
  throw new Error(`Nicht darstellbar: ${typeof wert}`);
}
```

- [ ] **Step 4: Grün sehen**

Run: wie Step 2. Expected: PASS, 8 Tests.

- [ ] **Step 5: Commit**

```bash
git add src/app/m/einsatzbuch/_lib/kern/bytes.ts src/app/m/einsatzbuch/_lib/kern/kanonisch.ts src/app/m/einsatzbuch/_lib/kern/bytes.test.ts src/app/m/einsatzbuch/_lib/kern/kanonisch.test.ts
git commit -S -m "feat(einsatzbuch): Bytes und kanonisches JSON für den geteilten Kern" -m "Grundlage für Fingerabdrücke, die TypeScript und Rust byte-gleich bilden." -m "DRK-471" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Blockformat — Format, Kette, Umschlag, Versiegeln

**Files:**
- Create: `K/format.ts`, `K/kette.ts`, `K/umschlag.ts`, `K/block.ts`, `K/testhilfe.ts`
- Test: `K/kette.test.ts`, `K/block.test.ts`

**Interfaces:**
- Consumes: Task 1 (`Bytes`, `utf8`, `ausUtf8`, `zuBase64`, `ausBase64`, `sha256Hex`, `zufall`, `kanonisch`).
- Produces:
  - `format.ts`: `GENESIS` (64 × „0"), `type Umgebung = "echt" | "test"`, `FahrzeugStand`, `PersonStand`, `Einsatz`, `Blockkopf`, `Umschlag`, `Block`, `Exportkopf`, `Exportinhalt`, `Exportdatei` (Felder siehe Code).
  - `kette.ts`: `blockHash(block: Pick<Block,"kopf"|"iv"|"daten"|"umschlag">): Promise<string>`; `type Kettenergebnis = {ok:true; vollstaendig:boolean} | {ok:false; block:number; grund:string}`; `pruefeKette(bloecke: readonly Block[]): Promise<Kettenergebnis>`.
  - `umschlag.ts`: `schluesselIdVon(oeffentlich: CryptoKey): Promise<string>`; `importiereOeffentlich(spkiBase64): Promise<CryptoKey>`; `importierePrivat(pkcs8Base64): Promise<CryptoKey>`; `erzeugeSchluesselpaar(): Promise<CryptoKeyPair>`; `interface Umschlagzufall { ephemer: CryptoKeyPair; iv: Bytes }`; `packeEin(cek, kopf, suiteOeffentlich, z?): Promise<Umschlag>`; `packeAus(umschlag, kopf, suitePrivat): Promise<Bytes>`.
  - `block.ts`: `interface Blockzufall { cek: Bytes; iv: Bytes; umschlag: Umschlagzufall }`; `versiegele(einsatz, kopf, suiteOeffentlich, z?): Promise<Block>`; `oeffneBlock(block, cek): Promise<Einsatz>`.
  - `testhilfe.ts`: `beispielEinsatz(nummer?): Einsatz`; `kopf(block, prev, schluesselId, umgebung = "echt"): Blockkopf`; re-export `GENESIS`.

- [ ] **Step 1: Format und Testhilfe anlegen** (reine Typen und Testdaten, kein Verhalten)

`K/format.ts`:
```ts
/**
 * Das Datenformat des Einsatzbuchs (Spec §3). Diese Typen sind der Vertrag zwischen der
 * Desktop-App (Rust versiegelt) und der Suite (Reader, Schlüsselfreigabe). Wer hier ein
 * Feld ändert, ändert den Fingerabdruck jedes künftigen Blocks — und muss die
 * Testvektoren neu erzeugen, die Rust byte-genau nachbaut.
 */
export const GENESIS = "0".repeat(64);

export interface FahrzeugStand { id: string; typ: string; kennung: string; ruf: string; standort: string }
export interface PersonStand { id: string; name: string; quali: string; ov: string; fahrzeugId: string | null }

export interface Einsatz {
  v: 1;
  nummer: string;
  stichwort: string;
  beginnDatum: string;
  beginnZeit: string;
  endeDatum: string | null;
  endeZeit: string | null;
  strasse: string;
  ort: string;
  objekt: string;
  fahrzeuge: FahrzeugStand[];
  personal: PersonStand[];
  vorOrt: number;
  transport: number;
  notizen: string;
}

export type Umgebung = "echt" | "test";

export interface Blockkopf {
  v: 1;
  block: number;
  prev: string;
  versiegelt: string;
  schluesselId: string;
  /** Test-Rechner versiegeln immer `"test"` (Spec §12). Steht in Hash und AAD, lässt sich also nicht still entfernen. */
  umgebung: Umgebung;
}

export interface Umschlag { epk: string; iv: string; ct: string }

export interface Block {
  kopf: Blockkopf;
  iv: string;
  daten: string;
  umschlag: Umschlag;
  hash: string;
}

export interface Exportkopf {
  erstellt: string;
  umfang: "alle" | "einzeln";
  von: number;
  bis: number;
  anzahl: number;
  quelle: string;
}

export interface Exportinhalt {
  bloecke: Block[];
  /** Blocknummer (als Zeichenkette, JSON kennt keine Zahlschlüssel) → CEK in Base64. */
  schluessel: Record<string, string>;
  exportiertVon: string;
  quelle: string;
  anker: { block: number; hash: string; gemeldetAm: string } | null;
}

export interface Exportdatei {
  format: "einsatzbuch-export";
  version: 2;
  kopf: Exportkopf;
  kdf: { name: "PBKDF2"; hash: "SHA-256"; iterationen: number; salt: string };
  chiffre: { name: "AES-GCM"; laenge: 256; iv: string };
  daten: string;
}
```

`K/testhilfe.ts`:
```ts
import { GENESIS, type Blockkopf, type Einsatz } from "./format";

/** Ein vollständiger Einsatz für Tests — Umlaute, Anführungszeichen und Zeilenumbruch mit Absicht. */
export function beispielEinsatz(nummer = "2026-047"): Einsatz {
  return {
    v: 1, nummer, stichwort: "MANV 10",
    beginnDatum: "2026-09-23", beginnZeit: "18:42", endeDatum: "2026-09-23", endeZeit: "21:05",
    strasse: "B4, Abfahrt Uelzen-Nord", ort: "29525 Uelzen", objekt: "VU Reisebus / Pkw",
    fahrzeuge: [{ id: "11-83-1", typ: "RTW", kennung: "11-83-1", ruf: "Rotkreuz Uelzen 11-83-1", standort: "Uelzen" }],
    personal: [
      { id: "p4", name: "Dierks, Malte", quali: "NotSan", ov: "Uelzen", fahrzeugId: "11-83-1" },
      { id: "p9", name: "Isermann, Paula", quali: "SanH", ov: "Ebstorf", fahrzeugId: null },
    ],
    vorOrt: 7, transport: 3,
    notizen: "Übergabe an OrgL RD um 19:05 Uhr.\n„Behandlungsplatz\" am GW-San.",
  };
}

export function kopf(block: number, prev: string, schluesselId: string, umgebung: Blockkopf["umgebung"] = "echt"): Blockkopf {
  return { v: 1, block, prev, versiegelt: "2026-09-23T21:08:00+02:00", schluesselId, umgebung };
}

export { GENESIS };
```

- [ ] **Step 2: Tests schreiben**

`K/block.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { oeffneBlock, versiegele } from "./block";
import { beispielEinsatz, GENESIS, kopf } from "./testhilfe";
import { erzeugeSchluesselpaar, packeAus, schluesselIdVon } from "./umschlag";

describe("Versiegeln, Einpacken, Auspacken, Öffnen", () => {
  it("Rundlauf: der Suite-Schlüssel packt den CEK aus, der CEK öffnet den Einsatz", async () => {
    const paar = await erzeugeSchluesselpaar();
    const k = kopf(1, GENESIS, await schluesselIdVon(paar.publicKey));
    const block = await versiegele(beispielEinsatz(), k, paar.publicKey);
    const cek = await packeAus(block.umschlag, block.kopf, paar.privateKey);
    expect(await oeffneBlock(block, cek)).toEqual(beispielEinsatz());
  });
  it("ein Umschlag lässt sich nicht auf einen anderen Block umhängen", async () => {
    const paar = await erzeugeSchluesselpaar();
    const sid = await schluesselIdVon(paar.publicKey);
    const a = await versiegele(beispielEinsatz(), kopf(1, GENESIS, sid), paar.publicKey);
    await expect(packeAus(a.umschlag, { ...a.kopf, block: 2 }, paar.privateKey)).rejects.toThrow();
  });
  it("ein fremder privater Schlüssel packt nichts aus", async () => {
    const paar = await erzeugeSchluesselpaar();
    const fremd = await erzeugeSchluesselpaar();
    const b = await versiegele(beispielEinsatz(), kopf(1, GENESIS, await schluesselIdVon(paar.publicKey)), paar.publicKey);
    await expect(packeAus(b.umschlag, b.kopf, fremd.privateKey)).rejects.toThrow();
  });
  it("ein veränderter Kopf öffnet den Block nicht", async () => {
    const paar = await erzeugeSchluesselpaar();
    const b = await versiegele(beispielEinsatz(), kopf(1, GENESIS, await schluesselIdVon(paar.publicKey)), paar.publicKey);
    const cek = await packeAus(b.umschlag, b.kopf, paar.privateKey);
    await expect(oeffneBlock({ ...b, kopf: { ...b.kopf, block: 9 } }, cek)).rejects.toThrow();
  });
  it("versiegeln verweigert eine schluesselId, die nicht zum Schlüssel gehört", async () => {
    const paar = await erzeugeSchluesselpaar();
    await expect(versiegele(beispielEinsatz(), kopf(1, GENESIS, "0000000000000000"), paar.publicKey)).rejects.toThrow("schluesselId");
  });
  it("die Umgebung lässt sich nicht still von test auf echt umschreiben", async () => {
    const paar = await erzeugeSchluesselpaar();
    const b = await versiegele(beispielEinsatz(), kopf(1, GENESIS, await schluesselIdVon(paar.publicKey), "test"), paar.publicKey);
    const cek = await packeAus(b.umschlag, b.kopf, paar.privateKey);
    const umgeschrieben = { ...b, kopf: { ...b.kopf, umgebung: "echt" as const } };
    await expect(packeAus(umgeschrieben.umschlag, umgeschrieben.kopf, paar.privateKey)).rejects.toThrow();
    await expect(oeffneBlock(umgeschrieben, cek)).rejects.toThrow();
  });
  it("jeder Block bekommt frischen Zufall: gleicher Einsatz, anderes Chiffrat", async () => {
    const paar = await erzeugeSchluesselpaar();
    const k = kopf(1, GENESIS, await schluesselIdVon(paar.publicKey));
    const [a, b] = await Promise.all([versiegele(beispielEinsatz(), k, paar.publicKey), versiegele(beispielEinsatz(), k, paar.publicKey)]);
    expect(a.daten).not.toBe(b.daten);
    expect(a.umschlag.epk).not.toBe(b.umschlag.epk);
  });
});
```

`K/kette.test.ts`:
```ts
import { beforeAll, describe, expect, it } from "vitest";
import { versiegele } from "./block";
import type { Block } from "./format";
import { blockHash, pruefeKette } from "./kette";
import { beispielEinsatz, GENESIS, kopf } from "./testhilfe";
import { erzeugeSchluesselpaar, schluesselIdVon } from "./umschlag";

let b1: Block, b2: Block, b3: Block, luecke: Block;
beforeAll(async () => {
  const paar = await erzeugeSchluesselpaar();
  const sid = await schluesselIdVon(paar.publicKey);
  b1 = await versiegele(beispielEinsatz("2026-047"), kopf(1, GENESIS, sid), paar.publicKey);
  b2 = await versiegele(beispielEinsatz("2026-048"), kopf(2, b1.hash, sid), paar.publicKey);
  b3 = await versiegele(beispielEinsatz("2026-049"), kopf(3, b2.hash, sid), paar.publicKey);
  luecke = await versiegele(beispielEinsatz("2026-050"), kopf(4, b1.hash, sid), paar.publicKey);
});

describe("pruefeKette", () => {
  it("eine lückenlose Kette ab Block 1 ist intakt und vollständig", async () => {
    expect(await pruefeKette([b1, b2, b3])).toEqual({ ok: true, vollstaendig: true });
  });
  it("ein Ausschnitt ohne Block 1 ist intakt, aber nicht vollständig", async () => {
    expect(await pruefeKette([b2, b3])).toEqual({ ok: true, vollstaendig: false });
  });
  it("eine leere Kette ist intakt, aber nicht vollständig", async () => {
    expect(await pruefeKette([])).toEqual({ ok: true, vollstaendig: false });
  });
  it("ein veränderter Kopf fällt am Fingerabdruck auf", async () => {
    const verfaelscht = { ...b2, kopf: { ...b2.kopf, versiegelt: "2026-09-23T21:09:00+02:00" } };
    expect(await pruefeKette([b1, verfaelscht, b3])).toEqual({ ok: false, block: 2, grund: "Inhalt passt nicht zum Fingerabdruck" });
  });
  it("ein verändertes Chiffrat fällt am Fingerabdruck auf", async () => {
    const verfaelscht = { ...b2, daten: b3.daten };
    expect(await pruefeKette([b1, verfaelscht, b3])).toMatchObject({ ok: false, block: 2 });
  });
  it("ein fehlender Block bricht die Kette beim Nachfolger", async () => {
    expect(await pruefeKette([b1, b3])).toEqual({ ok: false, block: 3, grund: "Vorgänger fehlt oder wurde verändert" });
  });
  it("eine Nummernlücke bei passendem Vorgänger fällt auf", async () => {
    expect(await pruefeKette([b1, luecke])).toEqual({ ok: false, block: 4, grund: "Lücke in der Reihenfolge" });
  });
  it("Block 1 muss auf den Anfang der Kette zeigen", async () => {
    const paar = await erzeugeSchluesselpaar();
    const falsch = await versiegele(beispielEinsatz(), kopf(1, "f".repeat(64), await schluesselIdVon(paar.publicKey)), paar.publicKey);
    expect(await pruefeKette([falsch])).toEqual({ ok: false, block: 1, grund: "Anfang der Kette stimmt nicht" });
  });
  it("eine umgeschriebene Umgebung fällt am Fingerabdruck auf", async () => {
    const verfaelscht = { ...b2, kopf: { ...b2.kopf, umgebung: "test" as const } };
    expect(await pruefeKette([b1, verfaelscht, b3])).toEqual({ ok: false, block: 2, grund: "Inhalt passt nicht zum Fingerabdruck" });
  });
  it("blockHash ignoriert ein mitgeliefertes hash-Feld", async () => {
    expect(await blockHash(b1)).toBe(b1.hash);
  });
});
```

- [ ] **Step 3: Rot sehen**

Run: `pnpm vitest run src/app/m/einsatzbuch/_lib/kern/block.test.ts src/app/m/einsatzbuch/_lib/kern/kette.test.ts`
Expected: FAIL — `Failed to resolve import "./block"`.

- [ ] **Step 4: Umsetzen**

`K/kette.ts`:
```ts
import { sha256Hex, utf8 } from "./bytes";
import { GENESIS, type Block } from "./format";
import { kanonisch } from "./kanonisch";

/** SHA-256 über das kanonische JSON von Kopf, IV, Chiffrat und Umschlag — nie über Klartext (Spec §3.2). */
export async function blockHash(block: Pick<Block, "kopf" | "iv" | "daten" | "umschlag">): Promise<string> {
  const { kopf, iv, daten, umschlag } = block;
  return sha256Hex(utf8(kanonisch({ kopf, iv, daten, umschlag })));
}

export type Kettenergebnis =
  | { ok: true; vollstaendig: boolean }
  | { ok: false; block: number; grund: string };

/**
 * Prüft Reihenfolge und Fingerabdrücke. Die Gründe sind wörtlich die der Vorlage
 * (`docs/design/einsatzbuch-v2/vorlage/einsatzbuch-kern.js`, `pruefeKette`), weil die
 * Oberfläche sie so anzeigt. `vollstaendig` heißt: die Kette beginnt bei Block 1.
 */
export async function pruefeKette(bloecke: readonly Block[]): Promise<Kettenergebnis> {
  for (let i = 0; i < bloecke.length; i++) {
    const b = bloecke[i];
    const vorher = bloecke[i - 1];
    if ((await blockHash(b)) !== b.hash) return { ok: false, block: b.kopf.block, grund: "Inhalt passt nicht zum Fingerabdruck" };
    if (vorher && b.kopf.prev !== vorher.hash) return { ok: false, block: b.kopf.block, grund: "Vorgänger fehlt oder wurde verändert" };
    if (!vorher && b.kopf.block === 1 && b.kopf.prev !== GENESIS) return { ok: false, block: 1, grund: "Anfang der Kette stimmt nicht" };
    if (vorher && b.kopf.block !== vorher.kopf.block + 1) return { ok: false, block: b.kopf.block, grund: "Lücke in der Reihenfolge" };
  }
  return { ok: true, vollstaendig: bloecke.length > 0 && bloecke[0].kopf.block === 1 };
}
```

`K/umschlag.ts`:
```ts
import { ausBase64, sha256Hex, utf8, zuBase64, zufall, type Bytes } from "./bytes";
import type { Blockkopf, Umschlag } from "./format";
import { kanonisch } from "./kanonisch";

const KURVE = { name: "ECDH", namedCurve: "P-256" } as const;
const INFO = utf8("einsatzbuch/v1/umschlag");

/** Die ersten 16 Hex-Zeichen von SHA-256 über den öffentlichen Schlüssel (SPKI-DER). */
export async function schluesselIdVon(oeffentlich: CryptoKey): Promise<string> {
  const spki = new Uint8Array(await crypto.subtle.exportKey("spki", oeffentlich));
  return (await sha256Hex(spki)).slice(0, 16);
}

export function importiereOeffentlich(spkiBase64: string): Promise<CryptoKey> {
  return crypto.subtle.importKey("spki", ausBase64(spkiBase64), KURVE, true, []);
}

export function importierePrivat(pkcs8Base64: string): Promise<CryptoKey> {
  return crypto.subtle.importKey("pkcs8", ausBase64(pkcs8Base64), KURVE, false, ["deriveBits"]);
}

export function erzeugeSchluesselpaar(): Promise<CryptoKeyPair> {
  return crypto.subtle.generateKey(KURVE, true, ["deriveBits"]);
}

/** ECDH-ES: geteiltes Geheimnis → HKDF-SHA256 (Salt leer, Info fest) → AES-256-GCM-Schlüssel. */
async function kek(privat: CryptoKey, oeffentlich: CryptoKey): Promise<CryptoKey> {
  const geteilt = new Uint8Array(await crypto.subtle.deriveBits({ name: "ECDH", public: oeffentlich }, privat, 256));
  const basis = await crypto.subtle.importKey("raw", geteilt, "HKDF", false, ["deriveKey"]);
  return crypto.subtle.deriveKey(
    { name: "HKDF", hash: "SHA-256", salt: new Uint8Array(0), info: INFO },
    basis, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"],
  );
}

export interface Umschlagzufall { ephemer: CryptoKeyPair; iv: Bytes }

/** Packt den CEK eines Blocks für den öffentlichen Schlüssel der Suite ein. Der Kopf ist AAD. */
export async function packeEin(cek: Bytes, kopf: Blockkopf, suiteOeffentlich: CryptoKey, z?: Umschlagzufall): Promise<Umschlag> {
  const ephemer = z?.ephemer ?? (await erzeugeSchluesselpaar());
  const iv = z?.iv ?? zufall(12);
  const schluessel = await kek(ephemer.privateKey, suiteOeffentlich);
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv, additionalData: utf8(kanonisch(kopf)) }, schluessel, cek));
  const epk = new Uint8Array(await crypto.subtle.exportKey("raw", ephemer.publicKey));
  return { epk: zuBase64(epk), iv: zuBase64(iv), ct: zuBase64(ct) };
}

/** Gegenstück in der Suite. Wirft, wenn Umschlag und Kopf nicht zusammengehören. */
export async function packeAus(umschlag: Umschlag, kopf: Blockkopf, suitePrivat: CryptoKey): Promise<Bytes> {
  const epk = await crypto.subtle.importKey("raw", ausBase64(umschlag.epk), KURVE, false, []);
  const schluessel = await kek(suitePrivat, epk);
  return new Uint8Array(await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: ausBase64(umschlag.iv), additionalData: utf8(kanonisch(kopf)) },
    schluessel, ausBase64(umschlag.ct),
  ));
}
```

`K/block.ts`:
```ts
import { ausBase64, ausUtf8, utf8, zuBase64, zufall, type Bytes } from "./bytes";
import type { Block, Blockkopf, Einsatz } from "./format";
import { kanonisch } from "./kanonisch";
import { blockHash } from "./kette";
import { packeEin, schluesselIdVon, type Umschlagzufall } from "./umschlag";

export interface Blockzufall { cek: Bytes; iv: Bytes; umschlag: Umschlagzufall }

async function aesSchluessel(cek: Bytes): Promise<CryptoKey> {
  if (cek.length !== 32) throw new Error("CEK muss 32 Byte lang sein");
  return crypto.subtle.importKey("raw", cek, "AES-GCM", false, ["encrypt", "decrypt"]);
}

/**
 * Versiegelt einen Einsatz. Im Betrieb tut das die Desktop-App in Rust; diese Fassung
 * erzeugt die Testvektoren und Testdaten der Suite. Ohne `z` zieht sie frischen Zufall.
 */
export async function versiegele(einsatz: Einsatz, kopf: Blockkopf, suiteOeffentlich: CryptoKey, z?: Blockzufall): Promise<Block> {
  if (kopf.schluesselId !== (await schluesselIdVon(suiteOeffentlich))) throw new Error("schluesselId passt nicht zum Schlüssel");
  const cek = z?.cek ?? zufall(32);
  const iv = z?.iv ?? zufall(12);
  const daten = new Uint8Array(await crypto.subtle.encrypt(
    { name: "AES-GCM", iv, additionalData: utf8(kanonisch(kopf)) }, await aesSchluessel(cek), utf8(kanonisch(einsatz)),
  ));
  const umschlag = await packeEin(cek, kopf, suiteOeffentlich, z?.umschlag);
  const ohneHash = { kopf, iv: zuBase64(iv), daten: zuBase64(daten), umschlag };
  return { ...ohneHash, hash: await blockHash(ohneHash) };
}

/** Entschlüsselt einen Block mit seinem CEK. Wirft bei falschem Schlüssel oder verändertem Kopf. */
export async function oeffneBlock(block: Block, cek: Bytes): Promise<Einsatz> {
  const klar = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: ausBase64(block.iv), additionalData: utf8(kanonisch(block.kopf)) },
    await aesSchluessel(cek), ausBase64(block.daten),
  );
  return JSON.parse(ausUtf8(new Uint8Array(klar))) as Einsatz;
}
```

- [ ] **Step 5: Grün sehen**

Run: wie Step 3. Expected: PASS, 17 Tests.

- [ ] **Step 6: Commit**

```bash
git add src/app/m/einsatzbuch/_lib/kern/{format,testhilfe,kette,umschlag,block,kette.test,block.test}.ts
git commit -S -m "feat(einsatzbuch): Blockformat mit Umschlag für den Suite-Schlüssel und Kettenprüfung" -m "Jeder Einsatz wird mit eigenem Schlüssel verschlüsselt, der für den öffentlichen Schlüssel der Suite eingepackt wird. Der Fingerabdruck deckt das Chiffrat ab, damit die Kette auch ohne Schlüssel prüfbar ist." -m "DRK-471" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Zeitrechnung und Berichtsmodell

**Files:**
- Create: `K/zeit.ts`, `K/bericht.ts`
- Test: `K/zeit.test.ts`, `K/bericht.test.ts`

**Interfaces:**
- Consumes: `Einsatz`, `Block` (Task 2); `beispielEinsatz`, `GENESIS` aus `testhilfe.ts`.
- Produces: `wandzeitZuInstant(datum, zeit, zeitzone): number`; `dauerMinuten(e, zeitzone): number | null`; `datumText(iso): string`; `zeitpunktText(isoMitOffset, zeitzone): string`; `dauerText(minuten): string`; `interface Berichtsdaten` (Felder siehe Code, darunter `test: boolean` für das „TESTDATEN"-Kennzeichen); `bericht(block, einsatz, extra: {pruefung; quelle; erzeugt; zeitzone}): Berichtsdaten`. Stufe 3 (Reader) und Stufe 6 (App) rendern das Berichtsblatt aus `Berichtsdaten`.

- [ ] **Step 1: Tests schreiben**

`K/zeit.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { datumText, dauerMinuten, dauerText, wandzeitZuInstant, zeitpunktText } from "./zeit";

const Z = "Europe/Berlin";
const einsatz = (bd: string, bz: string, ed: string | null, ez: string | null) =>
  ({ beginnDatum: bd, beginnZeit: bz, endeDatum: ed, endeZeit: ez });

describe("zeit", () => {
  it("rechnet Wanduhrzeit in der Suite-Zone in einen Zeitpunkt um (Sommer und Winter)", () => {
    expect(new Date(wandzeitZuInstant("2026-09-23", "18:42", Z)).toISOString()).toBe("2026-09-23T16:42:00.000Z");
    expect(new Date(wandzeitZuInstant("2026-01-10", "08:00", Z)).toISOString()).toBe("2026-01-10T07:00:00.000Z");
  });
  it("zählt die Dauer über die Zeitumstellung richtig", () => {
    expect(dauerMinuten(einsatz("2026-10-25", "01:30", "2026-10-25", "03:30"), Z)).toBe(180);
    expect(dauerMinuten(einsatz("2026-03-29", "01:30", "2026-03-29", "03:30"), Z)).toBe(60);
    expect(dauerMinuten(einsatz("2026-09-23", "18:42", "2026-09-23", "21:05"), Z)).toBe(143);
  });
  it("offenes Ende ergibt null, Ende vor Beginn eine negative Zahl", () => {
    expect(dauerMinuten(einsatz("2026-09-23", "18:42", null, null), Z)).toBeNull();
    expect(dauerMinuten(einsatz("2026-09-23", "18:42", "2026-09-23", "18:00"), Z)).toBe(-42);
  });
  it("schreibt Datum, Zeitpunkt und Dauer wie die Vorlage", () => {
    expect(datumText("2026-08-22")).toBe("22.8.2026");
    expect(zeitpunktText("2026-09-23T19:08:00.000Z", Z)).toBe("23.9.2026, 21:08 Uhr");
    expect(zeitpunktText("2026-01-05T06:03:00Z", Z)).toBe("5.1.2026, 07:03 Uhr");
    expect(zeitpunktText("2026-09-23T19:08:00Z", "UTC")).toBe("23.9.2026, 19:08 Uhr");
    expect(dauerText(143)).toBe("2 h 23 min");
    expect(dauerText(5)).toBe("0 h 05 min");
  });
});
```

`K/bericht.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { bericht } from "./bericht";
import type { Block } from "./format";
import { beispielEinsatz, GENESIS } from "./testhilfe";

const block: Block = {
  kopf: { v: 1, block: 7, prev: GENESIS, versiegelt: "2026-09-23T19:08:00Z", schluesselId: "0123456789abcdef", umgebung: "echt" },
  iv: "", daten: "", umschlag: { epk: "", iv: "", ct: "" }, hash: "a".repeat(64),
};
const extra = { pruefung: "Kette intakt", quelle: "Einsatzbuch Reader", erzeugt: "24.9.2026, 10:00 Uhr", zeitzone: "Europe/Berlin" };

describe("bericht", () => {
  it("füllt das Berichtsblatt aus Block und Einsatz", () => {
    const b = bericht(block, beispielEinsatz(), extra);
    expect(b).toMatchObject({
      nummer: "2026-047", block: 7, stichwort: "MANV 10", ort: "B4, Abfahrt Uelzen-Nord, 29525 Uelzen",
      beginn: "23.9.2026, 18:42 Uhr", ende: "23.9.2026, 21:05 Uhr", dauer: "2 h 23 min",
      vorOrt: 7, transport: 3, gesamt: 10, versiegelt: "23.9.2026, 21:08 Uhr", hash: "a".repeat(64), prev: GENESIS,
    });
    expect(b.fahrzeuge).toEqual([{ typ: "RTW", ruf: "Rotkreuz Uelzen 11-83-1", besatzung: "1" }]);
    expect(b.personal).toEqual([
      { name: "Dierks, Malte", quali: "NotSan", fahrzeug: "RTW 11-83-1" },
      { name: "Isermann, Paula", quali: "SanH", fahrzeug: "—" },
    ]);
  });
  it("leere Felder werden zu Gedankenstrichen, offenes Ende zu „nicht angegeben“", () => {
    const e = { ...beispielEinsatz(), strasse: "", ort: "", objekt: "", endeDatum: null, endeZeit: null, fahrzeuge: [], personal: [] };
    expect(bericht(block, e, extra)).toMatchObject({ ort: "—", objekt: "—", ende: "nicht angegeben", dauer: "—", fahrzeuge: [], personal: [] });
  });
  it("ein Ende vor dem Beginn ergibt keine negative Dauer im Blatt", () => {
    expect(bericht(block, { ...beispielEinsatz(), endeZeit: "18:00" }, extra).dauer).toBe("—");
  });
  it("markiert Testblöcke", () => {
    expect(bericht(block, beispielEinsatz(), extra).test).toBe(false);
    expect(bericht({ ...block, kopf: { ...block.kopf, umgebung: "test" } }, beispielEinsatz(), extra).test).toBe(true);
  });
  it("ein Fahrzeug ohne zugeordnete Besatzung zeigt „—“", () => {
    const e = { ...beispielEinsatz(), personal: [] };
    expect(bericht(block, e, extra).fahrzeuge[0].besatzung).toBe("—");
  });
});
```

- [ ] **Step 2: Rot sehen**

Run: `pnpm vitest run src/app/m/einsatzbuch/_lib/kern/zeit.test.ts src/app/m/einsatzbuch/_lib/kern/bericht.test.ts`
Expected: FAIL — `Failed to resolve import "./zeit"`.

- [ ] **Step 3: Umsetzen**

`K/zeit.ts`:
```ts
import type { Einsatz } from "./format";

/**
 * Zeitrechnung ohne `core/zeit` (der Kern läuft auch in der Desktop-App). Die Zone kommt
 * als Parameter, jedes `Intl.DateTimeFormat` entsteht im Aufruf — nie auf Modulebene,
 * sonst friert die Zone beim Import ein (`CLAUDE.md`, „Zeitzone").
 */
function versatzMinuten(instant: number, zeitzone: string): number {
  const teile = new Intl.DateTimeFormat("en-US", {
    timeZone: zeitzone, hourCycle: "h23",
    year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit",
  }).formatToParts(new Date(instant));
  const t = Object.fromEntries(teile.map((p) => [p.type, p.value]));
  const alsUtc = Date.UTC(+t.year, +t.month - 1, +t.day, +t.hour, +t.minute, +t.second);
  return Math.round((alsUtc - instant) / 60000);
}

/** Wanduhrzeit („2026-10-25", „02:30") in `zeitzone` → Millisekunden seit 1970. Zwei Durchgänge fangen die Umstellungsnacht. */
export function wandzeitZuInstant(datum: string, zeit: string, zeitzone: string): number {
  const [j, mo, t] = datum.split("-").map(Number);
  const [h, mi] = zeit.split(":").map(Number);
  const naiv = Date.UTC(j, mo - 1, t, h, mi);
  const erster = naiv - versatzMinuten(naiv, zeitzone) * 60000;
  return naiv - versatzMinuten(erster, zeitzone) * 60000;
}

/** Minuten zwischen Beginn und Ende, `null` solange das Ende fehlt. Negativ, wenn das Ende vor dem Beginn liegt. */
export function dauerMinuten(
  e: Pick<Einsatz, "beginnDatum" | "beginnZeit" | "endeDatum" | "endeZeit">,
  zeitzone: string,
): number | null {
  if (!e.beginnDatum || !e.beginnZeit || !e.endeDatum || !e.endeZeit) return null;
  const ms = wandzeitZuInstant(e.endeDatum, e.endeZeit, zeitzone) - wandzeitZuInstant(e.beginnDatum, e.beginnZeit, zeitzone);
  return Math.round(ms / 60000);
}

/** „2026-08-22" → „22.8.2026" (Schreibweise der Vorlage). */
export function datumText(iso: string): string {
  const [j, m, t] = iso.split("-");
  return `${+t}.${+m}.${j}`;
}

/** Zeitpunkt mit Offset → „22.8.2026, 04:43 Uhr" in `zeitzone`. */
export function zeitpunktText(isoMitOffset: string, zeitzone: string): string {
  const teile = new Intl.DateTimeFormat("de-DE", {
    timeZone: zeitzone, hourCycle: "h23",
    year: "numeric", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit",
  }).formatToParts(new Date(isoMitOffset));
  const t = Object.fromEntries(teile.map((p) => [p.type, p.value]));
  return `${t.day}.${t.month}.${t.year}, ${t.hour}:${t.minute} Uhr`;
}

/** 143 → „2 h 23 min". */
export function dauerText(minuten: number): string {
  return `${Math.floor(minuten / 60)} h ${String(minuten % 60).padStart(2, "0")} min`;
}
```

`K/bericht.ts`:
```ts
import type { Block, Einsatz } from "./format";
import { datumText, dauerMinuten, dauerText, zeitpunktText } from "./zeit";

export interface Berichtsdaten {
  /** Spec §12: Das Berichtsblatt trägt dann „TESTDATEN" im Kopf. */
  test: boolean;
  nummer: string;
  block: number;
  stichwort: string;
  ort: string;
  objekt: string;
  beginn: string;
  ende: string;
  dauer: string;
  vorOrt: number;
  transport: number;
  gesamt: number;
  fahrzeuge: { typ: string; ruf: string; besatzung: string }[];
  personal: { name: string; quali: string; fahrzeug: string }[];
  notizen: string;
  hash: string;
  prev: string;
  versiegelt: string;
  pruefung: string;
  quelle: string;
  erzeugt: string;
}

/**
 * Das Modell für das Berichtsblatt (`Einsatzbericht.dc.html`). Rein: Zeitzone und
 * „erzeugt" kommen vom Aufrufer, damit Tests nicht an der Uhr hängen.
 */
export function bericht(
  block: Block, e: Einsatz,
  extra: { pruefung: string; quelle: string; erzeugt: string; zeitzone: string },
): Berichtsdaten {
  const minuten = dauerMinuten(e, extra.zeitzone);
  const fahrzeuge = e.fahrzeuge.map((f) => {
    const n = e.personal.filter((p) => p.fahrzeugId === f.id).length;
    return { typ: f.typ, ruf: f.ruf, besatzung: n > 0 ? String(n) : "—" };
  });
  const personal = e.personal.map((p) => {
    const f = e.fahrzeuge.find((x) => x.id === p.fahrzeugId);
    return { name: p.name, quali: p.quali, fahrzeug: f ? `${f.typ} ${f.kennung}` : "—" };
  });
  return {
    test: block.kopf.umgebung === "test",
    nummer: e.nummer,
    block: block.kopf.block,
    stichwort: e.stichwort,
    ort: [e.strasse, e.ort].filter(Boolean).join(", ") || "—",
    objekt: e.objekt || "—",
    beginn: `${datumText(e.beginnDatum)}, ${e.beginnZeit} Uhr`,
    ende: e.endeDatum && e.endeZeit ? `${datumText(e.endeDatum)}, ${e.endeZeit} Uhr` : "nicht angegeben",
    dauer: minuten === null || minuten < 0 ? "—" : dauerText(minuten),
    vorOrt: e.vorOrt,
    transport: e.transport,
    gesamt: e.vorOrt + e.transport,
    fahrzeuge,
    personal,
    notizen: e.notizen,
    hash: block.hash,
    prev: block.kopf.prev,
    versiegelt: zeitpunktText(block.kopf.versiegelt, extra.zeitzone),
    pruefung: extra.pruefung,
    quelle: extra.quelle,
    erzeugt: extra.erzeugt,
  };
}
```

- [ ] **Step 4: Grün sehen**

Run: wie Step 2. Expected: PASS, 9 Tests. (Die Zonen-Erwartungen setzen die ICU-Zonendaten von Node 26 voraus; CI nutzt dieselbe Node-Version.)

- [ ] **Step 5: Commit**

```bash
git add src/app/m/einsatzbuch/_lib/kern/{zeit,bericht,zeit.test,bericht.test}.ts
git commit -S -m "feat(einsatzbuch): Zeitrechnung in der Suite-Zone und Berichtsmodell" -m "Die Dauer eines Einsatzes stimmt auch über die Nacht der Zeitumstellung." -m "DRK-471" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Kennwortgeschützter Export

**Files:**
- Create: `K/export.ts`
- Test: `K/export.test.ts`

**Interfaces:**
- Consumes: Task 1, `Exportdatei`/`Exportinhalt`/`Exportkopf` (Task 2), `versiegele`, `packeAus` (Task 2).
- Produces: `EXPORT_ITERATIONEN = 600_000`; `KENNWORT_MINDESTLAENGE = 10`; `class KennwortFalsch extends Error` (Text „Das Kennwort passt nicht. Die Datei bleibt verschlüsselt."); `verschluesseleExport(inhalt, kennwort, kopf, z?: {salt; iv}): Promise<Exportdatei>`; `entschluesseleExport(datei, kennwort): Promise<Exportinhalt>`; `istExportdatei(x: unknown): x is Exportdatei`.

- [ ] **Step 1: Test schreiben**

`K/export.test.ts`:
```ts
import { beforeAll, describe, expect, it } from "vitest";
import { versiegele } from "./block";
import { zuBase64 } from "./bytes";
import { entschluesseleExport, istExportdatei, KennwortFalsch, verschluesseleExport } from "./export";
import type { Exportdatei, Exportinhalt, Exportkopf } from "./format";
import { beispielEinsatz, GENESIS, kopf } from "./testhilfe";
import { erzeugeSchluesselpaar, packeAus, schluesselIdVon } from "./umschlag";

const KOPF: Exportkopf = { erstellt: "2026-09-24T10:00:00+02:00", umfang: "einzeln", von: 1, bis: 1, anzahl: 1, quelle: "DRK-Bereitschaft Uelzen" };
let inhalt: Exportinhalt;
let datei: Exportdatei;
beforeAll(async () => {
  const paar = await erzeugeSchluesselpaar();
  const b = await versiegele(beispielEinsatz(), kopf(1, GENESIS, await schluesselIdVon(paar.publicKey)), paar.publicKey);
  const cek = await packeAus(b.umschlag, b.kopf, paar.privateKey);
  inhalt = { bloecke: [b], schluessel: { "1": zuBase64(cek) }, exportiertVon: "Ruben Vitt", quelle: KOPF.quelle, anker: null };
  datei = await verschluesseleExport(inhalt, "richtiges-kennwort", KOPF);
});

describe("Export", () => {
  it("Rundlauf mit dem richtigen Kennwort", async () => {
    expect(await entschluesseleExport(datei, "richtiges-kennwort")).toEqual(inhalt);
    expect(datei.kdf.iterationen).toBe(600_000);
  });
  it("falsches Kennwort → KennwortFalsch mit dem Text der Vorlage", async () => {
    const fehler = await entschluesseleExport(datei, "falsches-kennwort").catch((e: unknown) => e);
    expect(fehler).toBeInstanceOf(KennwortFalsch);
    expect((fehler as Error).message).toBe("Das Kennwort passt nicht. Die Datei bleibt verschlüsselt.");
  });
  it("ein veränderter Kopf (AAD) öffnet nicht", async () => {
    await expect(entschluesseleExport({ ...datei, kopf: { ...datei.kopf, anzahl: 2 } }, "richtiges-kennwort")).rejects.toBeInstanceOf(KennwortFalsch);
  });
  it("zu kurzes Kennwort wird schon beim Verschlüsseln abgelehnt", async () => {
    await expect(verschluesseleExport(inhalt, "kurz", KOPF)).rejects.toThrow("mindestens 10 Zeichen");
  });
  it("istExportdatei erkennt die eigene Hülle und lehnt Fremdes ab", () => {
    expect(istExportdatei(datei)).toBe(true);
    expect(istExportdatei(JSON.parse(JSON.stringify(datei)))).toBe(true);
    expect(istExportdatei({ ...datei, version: 1 })).toBe(false);          // Format der Vorlage
    expect(istExportdatei({ ...datei, kdf: { ...datei.kdf, iterationen: 1 } })).toBe(false);
    expect(istExportdatei({ ...datei, kopf: { ...datei.kopf, umfang: "teil" } })).toBe(false);
    expect(istExportdatei(null)).toBe(false);
    expect(istExportdatei([])).toBe(false);
    expect(istExportdatei({ format: "einsatzbuch-export" })).toBe(false);
  });
});
```

- [ ] **Step 2: Rot sehen**

Run: `pnpm vitest run src/app/m/einsatzbuch/_lib/kern/export.test.ts`
Expected: FAIL — `Failed to resolve import "./export"`.

- [ ] **Step 3: Umsetzen**

`K/export.ts`:
```ts
import { ausBase64, ausUtf8, utf8, zuBase64, zufall, type Bytes } from "./bytes";
import type { Exportdatei, Exportinhalt, Exportkopf } from "./format";
import { kanonisch } from "./kanonisch";

export const EXPORT_ITERATIONEN = 600_000;
export const KENNWORT_MINDESTLAENGE = 10;

export class KennwortFalsch extends Error {
  constructor() { super("Das Kennwort passt nicht. Die Datei bleibt verschlüsselt."); }
}

async function kennwortSchluessel(kennwort: string, salt: Bytes, iterationen: number): Promise<CryptoKey> {
  const basis = await crypto.subtle.importKey("raw", utf8(kennwort), "PBKDF2", false, ["deriveKey"]);
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", hash: "SHA-256", salt, iterations: iterationen },
    basis, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"],
  );
}

export async function verschluesseleExport(
  inhalt: Exportinhalt, kennwort: string, kopf: Exportkopf, z?: { salt: Bytes; iv: Bytes },
): Promise<Exportdatei> {
  if (kennwort.length < KENNWORT_MINDESTLAENGE) throw new Error(`Kennwort braucht mindestens ${KENNWORT_MINDESTLAENGE} Zeichen`);
  const salt = z?.salt ?? zufall(16);
  const iv = z?.iv ?? zufall(12);
  const schluessel = await kennwortSchluessel(kennwort, salt, EXPORT_ITERATIONEN);
  const daten = new Uint8Array(await crypto.subtle.encrypt(
    { name: "AES-GCM", iv, additionalData: utf8(kanonisch(kopf)) }, schluessel, utf8(kanonisch(inhalt)),
  ));
  return {
    format: "einsatzbuch-export", version: 2, kopf,
    kdf: { name: "PBKDF2", hash: "SHA-256", iterationen: EXPORT_ITERATIONEN, salt: zuBase64(salt) },
    chiffre: { name: "AES-GCM", laenge: 256, iv: zuBase64(iv) },
    daten: zuBase64(daten),
  };
}

/** Wirft `KennwortFalsch`, wenn Kennwort oder Kopf nicht passen — beides ist für AES-GCM derselbe Fehler. */
export async function entschluesseleExport(datei: Exportdatei, kennwort: string): Promise<Exportinhalt> {
  const schluessel = await kennwortSchluessel(kennwort, ausBase64(datei.kdf.salt), datei.kdf.iterationen);
  let klar: ArrayBuffer;
  try {
    klar = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: ausBase64(datei.chiffre.iv), additionalData: utf8(kanonisch(datei.kopf)) },
      schluessel, ausBase64(datei.daten),
    );
  } catch {
    throw new KennwortFalsch();
  }
  return JSON.parse(ausUtf8(new Uint8Array(klar))) as Exportinhalt;
}

const istObjekt = (x: unknown): x is Record<string, unknown> => typeof x === "object" && x !== null && !Array.isArray(x);

/** Formprüfung der äußeren Hülle, bevor nach dem Kennwort gefragt wird. Lehnt das Format der Vorlage (`version: 1`) ab. */
export function istExportdatei(x: unknown): x is Exportdatei {
  if (!istObjekt(x) || x.format !== "einsatzbuch-export" || x.version !== 2) return false;
  const { kopf, kdf, chiffre, daten } = x;
  return istObjekt(kopf) && typeof kopf.erstellt === "string" && (kopf.umfang === "alle" || kopf.umfang === "einzeln")
    && Number.isSafeInteger(kopf.von) && Number.isSafeInteger(kopf.bis) && Number.isSafeInteger(kopf.anzahl) && typeof kopf.quelle === "string"
    && istObjekt(kdf) && kdf.name === "PBKDF2" && kdf.hash === "SHA-256"
    && Number.isSafeInteger(kdf.iterationen) && (kdf.iterationen as number) >= 100_000 && (kdf.iterationen as number) <= 10_000_000
    && typeof kdf.salt === "string"
    && istObjekt(chiffre) && chiffre.name === "AES-GCM" && chiffre.laenge === 256 && typeof chiffre.iv === "string"
    && typeof daten === "string";
}
```

- [ ] **Step 4: Grün sehen**

Run: wie Step 2. Expected: PASS, 5 Tests (PBKDF2 mit 600 000 Runden braucht je Aufruf rund 60 ms).

- [ ] **Step 5: Commit**

```bash
git add src/app/m/einsatzbuch/_lib/kern/{export,export.test}.ts
git commit -S -m "feat(einsatzbuch): kennwortgeschützter Export mit den Originalblöcken" -m "Der Export trägt die unveränderten Blöcke samt Einzelschlüsseln, damit der Reader dieselben Fingerabdrücke prüft wie der Rechner." -m "DRK-471" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Testvektoren und Grenztest

**Files:**
- Create: `K/testvektoren/einsaetze.ts`, `K/testvektoren/erzeuge.ts`, `scripts/einsatzbuch-testvektoren.ts`
- Create (erzeugt): `K/testvektoren/eingaben.json`, `K/testvektoren/erwartet.json`
- Test: `K/testvektoren/testvektoren.test.ts`, `K/grenze.test.ts`

**Interfaces:**
- Consumes: Tasks 1–4.
- Produces: `TESTEINSAETZE: Einsatz[]`, `TESTVERSIEGELT: string[]`; `interface Testeingaben`, `interface Testerwartung { schluesselId; bloecke: Block[]; export: Exportdatei }`; `erzeugeErwartung(e): Promise<Testerwartung>`; `neueEingaben(einsaetze, versiegelt): Promise<Testeingaben>`. **Stufe 3** öffnet `erwartet.json → export` im Reader-E2E (Kennwort `testvektor-kennwort`); **Stufe 4** liest `eingaben.json` in Rust (Schlüssel als JWK: `d`, `x`, `y` base64url) und vergleicht mit `erwartet.json → bloecke`.

- [ ] **Step 1: Testeinsätze und Erzeuger anlegen**

`K/testvektoren/einsaetze.ts`:
```ts
import type { Einsatz } from "../format";

/**
 * Drei Einsätze aus der Vorlage (`Einsatzbuch v2.dc.html`, `SEEDS`), als Schnappschuss
 * umgeschrieben. Mit Absicht dabei: Umlaute, „typografische" und gerade Anführungszeichen,
 * Zeilenumbruch, leeres Objekt, offenes Ende, Person ohne Fahrzeug.
 */
export const TESTEINSAETZE: Einsatz[] = [
  {
    v: 1, nummer: "2026-041", stichwort: "RD 2",
    beginnDatum: "2026-08-22", beginnZeit: "03:12", endeDatum: "2026-08-22", endeZeit: "04:40",
    strasse: "Lindenstraße 8", ort: "29525 Uelzen", objekt: "",
    fahrzeuge: [{ id: "11-83-1", typ: "RTW", kennung: "11-83-1", ruf: "Rotkreuz Uelzen 11-83-1", standort: "Uelzen" }],
    personal: [
      { id: "p4", name: "Dierks, Malte", quali: "NotSan", ov: "Uelzen", fahrzeugId: "11-83-1" },
      { id: "p8", name: "Hansen, Ole", quali: "RS", ov: "Uelzen", fahrzeugId: "11-83-1" },
    ],
    vorOrt: 0, transport: 1, notizen: "",
  },
  {
    v: 1, nummer: "2026-042", stichwort: "SanD",
    beginnDatum: "2026-08-29", beginnZeit: "13:00", endeDatum: null, endeZeit: null,
    strasse: "Am Sportzentrum", ort: "29549 Bad Bevensen", objekt: "Stadtfest, ca. 2.500 Besucher",
    fahrzeuge: [{ id: "12-19-1", typ: "MTF", kennung: "12-19-1", ruf: "Rotkreuz Bad Bevensen 12-19-1", standort: "Bad Bevensen" }],
    personal: [{ id: "p11", name: "Kruse, Marie", quali: "SanH", ov: "Bad Bevensen", fahrzeugId: null }],
    vorOrt: 11, transport: 2, notizen: "Zwei Transporte durch den Regel-RD übernommen.",
  },
  {
    v: 1, nummer: "2026-043", stichwort: "MANV 10",
    beginnDatum: "2026-09-23", beginnZeit: "18:42", endeDatum: "2026-09-23", endeZeit: "21:05",
    strasse: "B4, Abfahrt Uelzen-Nord", ort: "29525 Uelzen", objekt: "VU Reisebus / Pkw",
    fahrzeuge: [
      { id: "11-11-1", typ: "ELW 1", kennung: "11-11-1", ruf: "Rotkreuz Uelzen 11-11-1", standort: "Uelzen" },
      { id: "11-64-1", typ: "GW-San", kennung: "11-64-1", ruf: "Rotkreuz Uelzen 11-64-1", standort: "Uelzen" },
    ],
    personal: [
      { id: "p1", name: "Albers, Jana", quali: "ZF", ov: "Uelzen", fahrzeugId: "11-11-1" },
      { id: "p13", name: "Meyer, Hanna", quali: "BtH", ov: "Rosche", fahrzeugId: "11-64-1" },
    ],
    vorOrt: 7, transport: 3,
    notizen: "Übergabe an OrgL RD um 19:05 Uhr.\n„Behandlungsplatz\" am GW-San aufgebaut. 😀",
  },
];

export const TESTVERSIEGELT = ["2026-08-22T04:43:00+02:00", "2026-08-29T19:33:00+02:00", "2026-09-23T21:08:00+02:00"];
```

`K/testvektoren/erzeuge.ts`:
```ts
import { versiegele } from "../block";
import { ausBase64, zuBase64, zufall } from "../bytes";
import { verschluesseleExport } from "../export";
import { GENESIS, type Block, type Einsatz, type Exportdatei, type Exportkopf } from "../format";
import { schluesselIdVon } from "../umschlag";

/**
 * TESTVEKTOREN — der Format-Vertrag zwischen TypeScript (Suite, Reader) und Rust
 * (Desktop-App, versiegelt). `eingaben.json` hält jeden Zufall fest; aus ihr entsteht
 * `erwartet.json` deterministisch. Die Rust-Seite (Stufe 4) baut dieselben Blöcke aus
 * derselben Eingabe und vergleicht byte-genau. Neu erzeugen:
 * `pnpm exec tsx scripts/einsatzbuch-testvektoren.ts` (mit `--neu` auch neue Schlüssel).
 */
export interface Testschluessel { privat: JsonWebKey; oeffentlichSpki: string }

export interface Testeingaben {
  zeitzone: string;
  suite: Testschluessel;
  einsaetze: Einsatz[];
  bloecke: { versiegelt: string; cek: string; iv: string; umschlag: { ephemer: JsonWebKey; iv: string } }[];
  export: { kennwort: string; salt: string; iv: string; kopf: Exportkopf; exportiertVon: string; quelle: string };
}

export interface Testerwartung { schluesselId: string; bloecke: Block[]; export: Exportdatei }

const KURVE = { name: "ECDH", namedCurve: "P-256" } as const;

async function paarAusJwk(privat: JsonWebKey): Promise<CryptoKeyPair> {
  const { d: _d, key_ops: _o, ...oeffentlich } = privat;
  return {
    privateKey: await crypto.subtle.importKey("jwk", privat, KURVE, true, ["deriveBits"]),
    publicKey: await crypto.subtle.importKey("jwk", oeffentlich, KURVE, true, []),
  };
}

export async function erzeugeErwartung(e: Testeingaben): Promise<Testerwartung> {
  const suite = await paarAusJwk(e.suite.privat);
  const schluesselId = await schluesselIdVon(suite.publicKey);
  const bloecke: Block[] = [];
  for (let i = 0; i < e.einsaetze.length; i++) {
    const z = e.bloecke[i];
    const kopf = { v: 1 as const, block: i + 1, prev: bloecke[i - 1]?.hash ?? GENESIS, versiegelt: z.versiegelt, schluesselId, umgebung: "echt" as const };
    bloecke.push(await versiegele(e.einsaetze[i], kopf, suite.publicKey, {
      cek: ausBase64(z.cek), iv: ausBase64(z.iv),
      umschlag: { ephemer: await paarAusJwk(z.umschlag.ephemer), iv: ausBase64(z.umschlag.iv) },
    }));
  }
  const schluessel = Object.fromEntries(e.bloecke.map((z, i) => [String(i + 1), z.cek]));
  const exportdatei = await verschluesseleExport(
    { bloecke, schluessel, exportiertVon: e.export.exportiertVon, quelle: e.export.quelle, anker: { block: bloecke.length, hash: bloecke[bloecke.length - 1].hash, gemeldetAm: e.export.kopf.erstellt } },
    e.export.kennwort, e.export.kopf,
    { salt: ausBase64(e.export.salt), iv: ausBase64(e.export.iv) },
  );
  return { schluesselId, bloecke, export: exportdatei };
}

async function neuesPaar(): Promise<JsonWebKey> {
  const p = await crypto.subtle.generateKey(KURVE, true, ["deriveBits"]);
  return crypto.subtle.exportKey("jwk", p.privateKey);
}

/** Neue Schlüssel und Nonces um feste Einsätze. Nur bei einem bewussten Formatwechsel aufrufen. */
export async function neueEingaben(einsaetze: Einsatz[], versiegelt: string[]): Promise<Testeingaben> {
  const suitePrivat = await neuesPaar();
  const spki = new Uint8Array(await crypto.subtle.exportKey("spki", (await paarAusJwk(suitePrivat)).publicKey));
  const bloecke = [];
  for (let i = 0; i < einsaetze.length; i++) {
    bloecke.push({ versiegelt: versiegelt[i], cek: zuBase64(zufall(32)), iv: zuBase64(zufall(12)), umschlag: { ephemer: await neuesPaar(), iv: zuBase64(zufall(12)) } });
  }
  return {
    zeitzone: "Europe/Berlin",
    suite: { privat: suitePrivat, oeffentlichSpki: zuBase64(spki) },
    einsaetze, bloecke,
    export: {
      kennwort: "testvektor-kennwort", salt: zuBase64(zufall(16)), iv: zuBase64(zufall(12)),
      kopf: { erstellt: "2026-09-24T10:00:00+02:00", umfang: "alle", von: 1, bis: einsaetze.length, anzahl: einsaetze.length, quelle: "DRK-Bereitschaft Uelzen" },
      exportiertVon: "Testvektor", quelle: "DRK-Bereitschaft Uelzen",
    },
  };
}
```

`scripts/einsatzbuch-testvektoren.ts`:
```ts
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { TESTEINSAETZE, TESTVERSIEGELT } from "@/app/m/einsatzbuch/_lib/kern/testvektoren/einsaetze";
import { erzeugeErwartung, neueEingaben, type Testeingaben } from "@/app/m/einsatzbuch/_lib/kern/testvektoren/erzeuge";

/**
 * Schreibt die Testvektoren des Einsatzbuchs neu (Spec §9.1).
 *   pnpm exec tsx scripts/einsatzbuch-testvektoren.ts        → erwartet.json aus eingaben.json
 *   pnpm exec tsx scripts/einsatzbuch-testvektoren.ts --neu  → auch neue Schlüssel und Nonces
 * `--neu` nur bei einem bewussten Formatwechsel: Die Rust-Seite vergleicht gegen genau diese Dateien.
 * Der private Schlüssel in `eingaben.json` ist ein TESTSCHLÜSSEL und schützt nichts.
 */
const ordner = path.join(process.cwd(), "src/app/m/einsatzbuch/_lib/kern/testvektoren");
const neu = process.argv.includes("--neu");

async function main() {
  const eingaben: Testeingaben = neu
    ? await neueEingaben(TESTEINSAETZE, TESTVERSIEGELT)
    : JSON.parse(readFileSync(path.join(ordner, "eingaben.json"), "utf8"));
  if (neu) writeFileSync(path.join(ordner, "eingaben.json"), JSON.stringify(eingaben, null, 2) + "\n");
  writeFileSync(path.join(ordner, "erwartet.json"), JSON.stringify(await erzeugeErwartung(eingaben), null, 2) + "\n");
  console.log(`Testvektoren geschrieben${neu ? " (neue Schlüssel)" : ""}: ${ordner}`);
}

main().catch((fehler) => { console.error(fehler); process.exit(1); });
```

- [ ] **Step 2: Vektoren erzeugen und Determinismus nachweisen**

Run: `pnpm exec tsx scripts/einsatzbuch-testvektoren.ts --neu && shasum src/app/m/einsatzbuch/_lib/kern/testvektoren/erwartet.json && pnpm exec tsx scripts/einsatzbuch-testvektoren.ts && shasum src/app/m/einsatzbuch/_lib/kern/testvektoren/erwartet.json`
Expected: zweimal dieselbe Prüfsumme.

- [ ] **Step 3: Tests schreiben**

`K/testvektoren/testvektoren.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { oeffneBlock } from "../block";
import { ausBase64 } from "../bytes";
import { entschluesseleExport, istExportdatei } from "../export";
import { pruefeKette } from "../kette";
import { importiereOeffentlich, packeAus, schluesselIdVon } from "../umschlag";
import eingabenJson from "./eingaben.json";
import erwartetJson from "./erwartet.json";
import { TESTEINSAETZE } from "./einsaetze";
import { erzeugeErwartung, type Testeingaben, type Testerwartung } from "./erzeuge";

const eingaben = eingabenJson as unknown as Testeingaben;
const erwartet = erwartetJson as unknown as Testerwartung;

describe("Testvektoren (Format-Vertrag mit der Desktop-App)", () => {
  it("die Eingaben erzeugen byte-genau die eingecheckte Erwartung", async () => {
    expect(await erzeugeErwartung(eingaben)).toEqual(erwartet);
  });
  it("die Einsätze der Eingabe sind die aus einsaetze.ts", () => {
    expect(eingaben.einsaetze).toEqual(TESTEINSAETZE);
  });
  it("alle Vektorblöcke sind echt (ein Testblock wäre ein eigener Vektor)", () => {
    expect(erwartet.bloecke.map((b) => b.kopf.umgebung)).toEqual(["echt", "echt", "echt"]);
  });
  it("die Kette der Vektoren ist intakt und vollständig", async () => {
    expect(await pruefeKette(erwartet.bloecke)).toEqual({ ok: true, vollstaendig: true });
  });
  it("die schluesselId gehört zum öffentlichen Schlüssel der Eingabe", async () => {
    expect(await schluesselIdVon(await importiereOeffentlich(eingaben.suite.oeffentlichSpki))).toBe(erwartet.schluesselId);
  });
  it("der Suite-Schlüssel packt jeden CEK aus, und jeder CEK öffnet seinen Einsatz", async () => {
    const privat = await crypto.subtle.importKey("jwk", eingaben.suite.privat, { name: "ECDH", namedCurve: "P-256" }, false, ["deriveBits"]);
    for (const [i, block] of erwartet.bloecke.entries()) {
      const cek = await packeAus(block.umschlag, block.kopf, privat);
      expect(cek).toEqual(ausBase64(eingaben.bloecke[i].cek));
      expect(await oeffneBlock(block, cek)).toEqual(eingaben.einsaetze[i]);
    }
  });
  it("die Exportdatei öffnet mit dem Kennwort und trägt die Originalblöcke", async () => {
    expect(istExportdatei(erwartet.export)).toBe(true);
    const inhalt = await entschluesseleExport(erwartet.export, eingaben.export.kennwort);
    expect(inhalt.bloecke).toEqual(erwartet.bloecke);
    expect(await pruefeKette(inhalt.bloecke)).toEqual({ ok: true, vollstaendig: true });
    for (const block of inhalt.bloecke) {
      expect(await oeffneBlock(block, ausBase64(inhalt.schluessel[String(block.kopf.block)]))).toEqual(eingaben.einsaetze[block.kopf.block - 1]);
    }
  });
});
```

`K/grenze.test.ts`:
```ts
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * DER KERN LÄUFT AUCH IN DER DESKTOP-APP (Vite + Tauri, kein Next, kein Node).
 * Ein Import aus `next`, `node:*` oder der Suite kompiliert dort nicht — und die Suite-
 * Tore merken es nicht, weil sie die App nicht bauen. Tests dürfen Node benutzen.
 * Einzige Ausnahme: `@/core/theme/tokens` (reine Konstanten, Spec §2.1).
 */
const ERLAUBT_AUS_SUITE = new Set(["@/core/theme/tokens"]);

function dateien(ordner: string): string[] {
  return readdirSync(ordner).filter((n) => n !== "node_modules").flatMap((n) => {
    const p = path.join(ordner, n);
    return statSync(p).isDirectory() ? dateien(p) : [p];
  });
}

describe("Grenze des geteilten Kerns", () => {
  const quellen = dateien(__dirname).filter((p) => /\.(ts|tsx)$/.test(p) && !/\.test\.tsx?$/.test(p));

  it("findet Quelldateien", () => expect(quellen.length).toBeGreaterThan(5));

  it.each(quellen.map((p) => [path.relative(__dirname, p), p]))("%s importiert nur Erlaubtes", (_name, datei) => {
    const quelltext = readFileSync(datei, "utf8");
    const ziele = [...quelltext.matchAll(/(?:from|import)\s*\(?\s*["']([^"']+)["']/g)].map((m) => m[1]);
    const verboten = ziele.filter((z) => {
      if (z.startsWith(".")) return false;
      if (ERLAUBT_AUS_SUITE.has(z)) return false;
      if (z === "react" || z.startsWith("react/")) return false;
      return true;
    });
    expect(verboten).toEqual([]);
  });
});
```

- [ ] **Step 4: Grün sehen, dann Gegenprobe**

Run: `pnpm vitest run src/app/m/einsatzbuch/_lib/kern`
Expected: PASS (alle Kern-Tests; der Grenztest mit einer Zeile je Quelldatei).

Gegenprobe: `printf 'import { notFound } from "next/navigation";\nexport const x = notFound;\n' > src/app/m/einsatzbuch/_lib/kern/boese.ts && pnpm vitest run src/app/m/einsatzbuch/_lib/kern/grenze.test.ts; rm src/app/m/einsatzbuch/_lib/kern/boese.ts`
Expected: FAIL genau für `boese.ts`, danach Datei entfernt.

- [ ] **Step 5: Typecheck**

Run: `pnpm typecheck`
Expected: Exit 0 (die JSON-Importe laufen über `resolveJsonModule`).

- [ ] **Step 6: Commit**

```bash
git add src/app/m/einsatzbuch/_lib/kern/testvektoren src/app/m/einsatzbuch/_lib/kern/grenze.test.ts scripts/einsatzbuch-testvektoren.ts
git commit -S -m "test(einsatzbuch): Testvektoren als Format-Vertrag und Importgrenze des Kerns" -m "Feste Eingaben erzeugen byte-genau dieselben Blöcke und dieselbe Exportdatei; die Desktop-App vergleicht in Rust gegen dieselben Dateien. Der Schlüssel darin ist ein Testschlüssel." -m "DRK-471" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Registry, Host-Riegel und Gruppenzugang

**Files:**
- Modify: `src/core/registry.ts` (Eintrag nach `uav`, vor den Wegwerf-Modulen `alpha`), `src/core/shell/icons.ts`
- Create: `src/app/m/einsatzbuch/_lib/host.ts`, `src/app/m/einsatzbuch/_lib/hostRiegel.ts`, `src/app/m/einsatzbuch/_lib/zugang.ts`
- Test: `src/app/m/einsatzbuch/registry.test.ts`, `src/app/m/einsatzbuch/_lib/hostRiegel.test.ts`, `src/app/m/einsatzbuch/_lib/zugang.test.ts`

**Interfaces:**
- Produces: `istEinsatzbuchHost(headers): boolean`; `requireEinsatzbuchHost(headers): void` (wirft `notFound`); `einsatzbuchHostOderNull(headers): "einsatzbuch" | null`; `hostAbweisung(req: Request): Response | null` (Stufe 5 ruft es als erste Anweisung jedes Handlers); `hatEinsatzbuchZugang(groups, env?): boolean`; `requireEinsatzbuchZugang(): Promise<Session["user"]>` (Login-Umleitung bzw. `notFound`, jeweils mit Audit-Zeile).

- [ ] **Step 1: Tests schreiben**

`src/app/m/einsatzbuch/registry.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { canAccess, getModule, moduleForHost, requiredGroupsFor } from "@/core/registry";

describe("Registry-Eintrag einsatzbuch", () => {
  it("ist anonym routbar, trägt die Zugangsgruppe und bleibt bis zum Reader aus dem Umschalter", () => {
    const m = getModule("einsatzbuch");
    expect(m).toMatchObject({
      title: "Einsatzbuch", icon: "BookOutlined", shell: "full", requiresAuth: false,
      requiredGroups: ["einsatzbuch-verwaltung"], adminGroups: [], prodHosts: [],
      showInSwitcher: false, switcherGroupSources: ["access"],
    });
  });
  it("wird über SUITE_HOST_EINSATZBUCH und den Dev-Host gefunden", () => {
    expect(moduleForHost("einsatzbuch.iuk-ue.de", { SUITE_HOST_EINSATZBUCH: "einsatzbuch.iuk-ue.de" })?.key).toBe("einsatzbuch");
    expect(moduleForHost("einsatzbuch.localtest.me", {})?.key).toBe("einsatzbuch");
    expect(canAccess(getModule("einsatzbuch"), null)).toBe(true);
  });
  it("SUITE_ACCESS_GROUP_EINSATZBUCH ersetzt die Vorgabegruppe", () => {
    expect(requiredGroupsFor(getModule("einsatzbuch"), { SUITE_ACCESS_GROUP_EINSATZBUCH: "eb-leitung" })).toEqual(["eb-leitung"]);
  });
});
```

`src/app/m/einsatzbuch/_lib/hostRiegel.test.ts`:
```ts
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Wie `uav/_lib/hostRiegel.test.ts`: `notFound()` wirft in Next einen internen Fehler,
// hier genügt ein erkennbarer Wurf.
vi.mock("next/navigation", () => ({
  notFound: () => { throw new Error("NEXT_NOT_FOUND"); },
}));

import { istEinsatzbuchHost, requireEinsatzbuchHost } from "./host";
import { hostAbweisung } from "./hostRiegel";

const alt = process.env.SUITE_HOST_EINSATZBUCH;
beforeEach(() => { process.env.SUITE_HOST_EINSATZBUCH = "einsatzbuch.iuk-ue.de"; });
afterEach(() => { if (alt === undefined) delete process.env.SUITE_HOST_EINSATZBUCH; else process.env.SUITE_HOST_EINSATZBUCH = alt; });

const req = (host: string) => new Request("http://x/m/einsatzbuch/api/stammdaten", { headers: { host } });

describe("einsatzbuch-Host-Riegel", () => {
  it("Prod-Host und Dev-Host sind eigen", () => {
    expect(istEinsatzbuchHost(new Headers({ host: "einsatzbuch.iuk-ue.de" }))).toBe(true);
    expect(istEinsatzbuchHost(new Headers({ host: "einsatzbuch.localtest.me:3000" }))).toBe(true);
  });
  it("fremder Suite-Host → 404 als Text, nicht HTML", () => {
    const r = hostAbweisung(req("feedback.localtest.me"));
    expect(r?.status).toBe(404);
    expect(r?.headers.get("content-type")).not.toContain("text/html");
  });
  it("eigener Host → null", () => expect(hostAbweisung(req("einsatzbuch.iuk-ue.de"))).toBeNull());
  it("x-forwarded-host gewinnt", () => {
    expect(hostAbweisung(new Request("http://x/", { headers: { host: "localhost:3000", "x-forwarded-host": "einsatzbuch.iuk-ue.de" } }))).toBeNull();
  });
  it("requireEinsatzbuchHost wirft auf fremdem Host notFound, nicht 403", () => {
    expect(() => requireEinsatzbuchHost(new Headers({ host: "einsatzbuch.localtest.me:3000" }))).not.toThrow();
    expect(() => requireEinsatzbuchHost(new Headers({ host: "feedback.localtest.me" }))).toThrow("NEXT_NOT_FOUND");
  });
});
```

`src/app/m/einsatzbuch/_lib/zugang.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { hatEinsatzbuchZugang } from "./zugang";

describe("hatEinsatzbuchZugang", () => {
  it("die Zugangsgruppe öffnet das Modul", () => {
    expect(hatEinsatzbuchZugang(["einsatzbuch-verwaltung"], {})).toBe(true);
  });
  it("ohne Gruppe, anonym oder mit leerer Liste: kein Zugang", () => {
    expect(hatEinsatzbuchZugang(["andere"], {})).toBe(false);
    expect(hatEinsatzbuchZugang(null, {})).toBe(false);
    expect(hatEinsatzbuchZugang([], {})).toBe(false);
  });
  it("der Suite-Admin allein öffnet das Modul NICHT (hier liegt die Schlüsselfreigabe)", () => {
    expect(hatEinsatzbuchZugang(["dashboard-admins"], {})).toBe(false);
    expect(hatEinsatzbuchZugang(["chef"], { ADMIN_GROUP: "chef" })).toBe(false);
  });
  it("SUITE_ACCESS_GROUP_EINSATZBUCH ersetzt die Vorgabe", () => {
    expect(hatEinsatzbuchZugang(["eb-leitung"], { SUITE_ACCESS_GROUP_EINSATZBUCH: "eb-leitung" })).toBe(true);
    expect(hatEinsatzbuchZugang(["einsatzbuch-verwaltung"], { SUITE_ACCESS_GROUP_EINSATZBUCH: "eb-leitung" })).toBe(false);
  });
});
```

- [ ] **Step 2: Rot sehen**

Run: `pnpm vitest run src/app/m/einsatzbuch/registry.test.ts src/app/m/einsatzbuch/_lib`
Expected: FAIL — `Unknown module: einsatzbuch` und `Failed to resolve import "./host"`.

- [ ] **Step 3: Registry-Eintrag und Icon**

In `src/core/registry.ts` direkt nach dem `uav`-Eintrag einfügen:
```ts
  // einsatzbuch: Einsatzbuch v2 (docs/superpowers/specs/2026-09-24-einsatzbuch-v2-design.md).
  // requiresAuth: false wie radio und uav — die Geräte-Schnittstellen der Desktop-App tragen
  // eigene Tokens (Stufe 5). Den Seitenzugang setzt `_lib/zugang.ts` durch, und zwar NUR über
  // die Zugangsgruppe, nicht über den Suite-Admin: hier liegt die Freigabe der Einsatz-Schlüssel.
  // Den Host hält `_lib/host.ts`. showInSwitcher bleibt aus, bis der Reader steht (Stufe 3).
  { key: "einsatzbuch", title: "Einsatzbuch", icon: "BookOutlined", shell: "full",
    requiresAuth: false, requiredGroups: ["einsatzbuch-verwaltung"], adminGroups: [],
    prodHosts: [], showInSwitcher: false, switcherGroupSources: ["access"] },
```

In `src/core/shell/icons.ts` `BookOutlined` in den Import aus `"@ant-design/icons"` und in das Objekt `ICONS` aufnehmen (alphabetisch bzw. in der Reihenfolge der Nachbarn, wie die Datei es hält).

- [ ] **Step 4: Host, Riegel, Zugang**

`src/app/m/einsatzbuch/_lib/host.ts`:
```ts
import { notFound } from "next/navigation";
import { moduleForHost } from "@/core/registry";
import { resolveHost } from "@/core/routing";

/**
 * Der Host-Riegel des Moduls. `decideRoute` bedient `/m/einsatzbuch/*` auf JEDEM Host, der
 * die Suite erreicht, und `canAccess` steigt bei `requiresAuth: false` sofort aus — ohne
 * diesen Riegel wäre das Modul über jeden Suite-Host erreichbar (Vorbild `uav/_lib/host.ts`).
 */
export function istEinsatzbuchHost(headers: Headers): boolean {
  return moduleForHost(resolveHost(headers))?.key === "einsatzbuch";
}

/** Für Layouts und Seiten, als erste Anweisung. notFound statt 403: die Existenz des Pfads bleibt verborgen. */
export function requireEinsatzbuchHost(headers: Headers): void {
  if (!istEinsatzbuchHost(headers)) notFound();
}

export function einsatzbuchHostOderNull(headers: Headers): "einsatzbuch" | null {
  return istEinsatzbuchHost(headers) ? "einsatzbuch" : null;
}
```

`src/app/m/einsatzbuch/_lib/hostRiegel.ts`:
```ts
import { einsatzbuchHostOderNull } from "./host";

/** Für Route Handler: erste Anweisung, `const ab = hostAbweisung(req); if (ab) return ab;`. */
export function hostAbweisung(req: Request): Response | null {
  return einsatzbuchHostOderNull(new Headers(req.headers))
    ? null
    : new Response("Not found", { status: 404 });
}
```

`src/app/m/einsatzbuch/_lib/zugang.ts`:
```ts
import { notFound, redirect } from "next/navigation";
import { auditActor, auditDenied, auditLoginRequired } from "@/core/audit/server";
import { auth } from "@/core/auth";
import { hasAnyGroup } from "@/core/groups";
import { getModule, requiredGroupsFor } from "@/core/registry";

type EnvLike = Record<string, string | undefined>;

/**
 * Zugang zum Einsatzbuch — NUR über die Zugangsgruppe (`requiredGroupsFor`, also mit
 * `SUITE_ACCESS_GROUP_EINSATZBUCH`). Der Suite-Admin kommt bewusst nicht mit: ab Stufe 5
 * gibt dieses Modul die Schlüssel versiegelter Einsätze frei (Spec §2.3).
 */
export function hatEinsatzbuchZugang(groups: readonly string[] | null | undefined, env: EnvLike = process.env): boolean {
  return hasAnyGroup(groups, requiredGroupsFor(getModule("einsatzbuch"), env));
}

/**
 * Riegel für Layout UND jede Seite (eine Route Group ist keine Sicherheitsgrenze).
 * Ohne Sitzung → Login, ohne Gruppe → 404; beides mit Audit-Zeile. Die Aufrufe von
 * `redirect`/`notFound` bleiben hier, damit Seiten keinen Eintrag im
 * Abdeckungsmanifest von `core/audit` brauchen.
 */
export async function requireEinsatzbuchZugang() {
  const session = await auth();
  const viewer = session?.user;
  if (!viewer) {
    auditLoginRequired("einsatzbuch");
    redirect(`/login?callbackUrl=${encodeURIComponent("/m/einsatzbuch")}`);
  }
  if (!hatEinsatzbuchZugang(viewer.groups)) {
    auditDenied("einsatzbuch", auditActor(viewer));
    notFound();
  }
  return viewer;
}
```

`auditLoginRequired("einsatzbuch")` typecheckt erst nach Task 7 (`AUDIT_MODULES`). Deshalb in diesem Task nur die Vitest-Läufe, der Typecheck folgt in Task 7.

- [ ] **Step 5: Grün sehen**

Run: `pnpm vitest run src/app/m/einsatzbuch src/core/shell/AppUmschalter.test.tsx src/core/registry.test.ts src/core/auth/devGroups.test.ts`
Expected: PASS. `registry.test.ts` bleibt grün, weil `showInSwitcher: false` die anonyme Umschalterliste `["qr","radio"]` nicht berührt.

- [ ] **Step 6: Commit**

```bash
git add src/core/registry.ts src/core/shell/icons.ts src/app/m/einsatzbuch/registry.test.ts src/app/m/einsatzbuch/_lib/{host,hostRiegel,zugang,hostRiegel.test,zugang.test}.ts
git commit -S -m "feat(einsatzbuch): Modul registrieren, Host-Riegel und Zugang nur über die Gruppe" -m "Die neue Pocket-ID-Gruppe einsatzbuch-verwaltung öffnet das Modul; der Suite-Admin allein nicht, weil hier später die Schlüssel versiegelter Einsätze freigegeben werden." -m "DRK-471" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Datenbank-Dreieck, Audit-Katalog, Seed, Env

**Files:**
- Create: `src/app/m/einsatzbuch/_db/schema.ts`, `src/app/m/einsatzbuch/_db/client.ts`, `src/app/m/einsatzbuch/_db/drizzle.config.ts`, `src/app/m/einsatzbuch/_db/migrations/*` (erzeugt), `src/app/m/einsatzbuch/_lib/seedLokal.ts`
- Modify: `src/core/bootstrap.ts` (`MODULE_MIGRATIONS`), `Dockerfile` (Runner-Stage, neben den anderen Migrations-`COPY`s), `src/core/audit/types.ts` (`AUDIT_MODULES`), `src/core/audit/catalog.ts` (`AUDIT_TABLES`), `scripts/seed-lokal.ts` (`SEED_MODULE` + Importe), `.env.example`
- Test: bestehende `src/core/bootstrap.test.ts`, `scripts/seed-lokal.test.ts`, `src/core/audit/catalog.test.ts`

**Interfaces:**
- Produces: `getDb()` / `type EinsatzbuchDb` aus `_db/client.ts`; `seedLokalEinsatzbuch(db: EinsatzbuchDb): Promise<string[]>`. Stufe 2 legt die Tabellen aus Spec §5.1 in dieses Schema und füllt den Seed.

- [ ] **Step 1: Rot sehen — die bestehenden Wächter kennen das Modul noch nicht**

Run: `pnpm vitest run src/core/bootstrap.test.ts scripts/seed-lokal.test.ts src/core/audit/catalog.test.ts`
Expected: grün, weil noch kein `_db/` existiert. Dann zuerst `schema.ts` anlegen (Step 2) und erneut laufen lassen → FAIL in `bootstrap.test.ts` („Modul-Registrierung ist vollständig": `einsatzbuch` fehlt in `MODULE_MIGRATIONS`).

- [ ] **Step 2: Schema, Client, Drizzle-Konfiguration**

`src/app/m/einsatzbuch/_db/schema.ts`:
```ts
/**
 * Datenbank des Moduls einsatzbuch. Stufe 1 trägt nur die Audit-Outbox; Stammdaten,
 * Schlüsselpaar, Rechner, Anker, Einmalcodes und Sitzungen folgen mit Stufe 2 und 5
 * (Spec §5.1). Die Einsätze selbst liegen NIE hier, sondern auf dem Einsatzbuch-Rechner.
 */
export { auditOutbox } from "@/core/audit/_db/schema";
```

`src/app/m/einsatzbuch/_db/client.ts`:
```ts
import { getModuleDb } from "@/core/db";
import * as schema from "./schema";

export const getDb = () => getModuleDb("einsatzbuch", schema);
export type EinsatzbuchDb = ReturnType<typeof getDb>;
```

`src/app/m/einsatzbuch/_db/drizzle.config.ts`:
```ts
import type { Config } from "drizzle-kit";

// Pfade sind repo-root-relativ (drizzle-kit löst sie gegen cwd auf), nicht
// relativ zu dieser Datei.
export default {
  schema: "./src/app/m/einsatzbuch/_db/schema.ts",
  out: "./src/app/m/einsatzbuch/_db/migrations",
  dialect: "sqlite",
  dbCredentials: { url: "./.data/einsatzbuch.db" },
} satisfies Config;
```

- [ ] **Step 3: Migration erzeugen**

Run: `pnpm exec drizzle-kit generate --config src/app/m/einsatzbuch/_db/drizzle.config.ts --name audit_outbox`
Expected: `src/app/m/einsatzbuch/_db/migrations/0000_audit_outbox.sql` mit `CREATE TABLE audit_outbox (…)`, `CREATE INDEX audit_outbox_occurred_idx …` und dem `CHECK (json_valid(actor))`; dazu `meta/_journal.json` und `meta/0000_snapshot.json`. Inhalt gegen `src/app/m/uav/_db/migrations/0001_audit_outbox.sql` (erste 15 Zeilen) abgleichen. Keine Trigger — es gibt noch keine auditierte Tabelle.

- [ ] **Step 4: Dreieck, Audit, Seed, Env**

`src/core/bootstrap.ts`, `MODULE_MIGRATIONS`, nach `uav`:
```ts
  // einsatzbuch: OHNE Boot-Seed — ab Stufe 2 liegt hier das Schlüsselpaar der Einsätze, und
  // ein Seed in einer Generalprobe (SUITE_SEED=1) legte ein bekanntes Test-Paar an. Das lokale
  // Seed-Skript deckt Dev ab.
  { key: "einsatzbuch", migrationsFolder: "src/app/m/einsatzbuch/_db/migrations" },
```
(Das Wort „seedLokal" darf in `bootstrap.ts` nicht vorkommen — `scripts/seed-lokal.test.ts` prüft den Quelltext.)

`Dockerfile`, Runner-Stage, nach der `uav`-Zeile:
```
COPY --from=builder --chown=nextjs:nodejs /app/src/app/m/einsatzbuch/_db/migrations ./src/app/m/einsatzbuch/_db/migrations
```

`src/core/audit/types.ts`: `"einsatzbuch"` in `AUDIT_MODULES` aufnehmen (vor `"konto"`):
```ts
export const AUDIT_MODULES = ["portal", "qr", "feedback", "files", "lagerbuch", "aufgaben", "radio", "uav", "einsatzbuch", "konto"] as const;
```

`src/core/audit/catalog.ts`, `AUDIT_TABLES`, nach dem `"uav"`-Block:
```ts
  "einsatzbuch": {},
```

`src/app/m/einsatzbuch/_lib/seedLokal.ts`:
```ts
import type { EinsatzbuchDb } from "../_db/client";

/**
 * Lokale Demodaten — bewusst NICHT am Boot (siehe `MODULE_MIGRATIONS`, Eintrag einsatzbuch).
 * Stufe 1 hat noch keine Tabellen außer der Audit-Outbox; Stufe 2 füllt hier Fahrzeuge,
 * Personal und Alarmstichworte aus der Vorlage und legt ein Entwicklungs-Schlüsselpaar an.
 */
export async function seedLokalEinsatzbuch(_db: EinsatzbuchDb): Promise<string[]> {
  return ["einsatzbuch: keine Tabellen mit Demodaten (Stammdaten folgen mit Stufe 2)"];
}
```

`scripts/seed-lokal.ts`: bei den Importen
```ts
import * as einsatzbuchSchema from "@/app/m/einsatzbuch/_db/schema";
import { seedLokalEinsatzbuch } from "@/app/m/einsatzbuch/_lib/seedLokal";
```
und in `SEED_MODULE` nach `uav`:
```ts
  { key: "einsatzbuch", lauf: () => seedLokalEinsatzbuch(getModuleDb("einsatzbuch", einsatzbuchSchema)) },
```

`.env.example`: im Host-Block nach `# SUITE_HOST_UAV=` die Zeile `# SUITE_HOST_EINSATZBUCH=`; bei den Gruppenbeispielen (nach dem uav-Absatz):
```
# einsatzbuch: Zugang zu Stammdaten, Rechner, Reader und (ab Stufe 5) zur Schlüsselfreigabe.
# Nur diese Gruppe — der Suite-Admin allein kommt nicht hinein. NIE leer gesetzt stehen
# lassen: validateGroupConfig bricht den Boot dann ab.
# SUITE_ACCESS_GROUP_EINSATZBUCH=einsatzbuch-verwaltung
```

- [ ] **Step 5: Grün sehen**

Run: `pnpm vitest run src/core/bootstrap.test.ts scripts/seed-lokal.test.ts src/core/audit src/app/m/einsatzbuch && pnpm typecheck`
Expected: PASS; Typecheck Exit 0 (jetzt auch `auditLoginRequired("einsatzbuch")` aus Task 6).

- [ ] **Step 6: Seed lokal ausprobieren**

Run: `pnpm seed:lokal einsatzbuch`
Expected: Ausgabe enthält „einsatzbuch: keine Tabellen mit Demodaten …"; `.data/einsatzbuch.db` existiert und hat die Tabelle `audit_outbox` (`sqlite3 .data/einsatzbuch.db ".tables"` → `__drizzle_migrations  audit_outbox`).

- [ ] **Step 7: Commit**

```bash
git add src/app/m/einsatzbuch/_db src/app/m/einsatzbuch/_lib/seedLokal.ts src/core/bootstrap.ts Dockerfile src/core/audit/types.ts src/core/audit/catalog.ts scripts/seed-lokal.ts .env.example
git commit -S -m "feat(einsatzbuch): eigene Datenbank mit Audit-Outbox, Migration im Container, lokaler Seed" -m "Das Dreieck aus Migrationsordner, MODULE_MIGRATIONS und COPY-Zeile ist geschlossen. Einsätze liegen nie in dieser Datenbank." -m "DRK-471" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Übersichtsseite, E2E und Tore

**Files:**
- Create: `src/app/m/einsatzbuch/layout.tsx`, `src/app/m/einsatzbuch/(verwaltung)/layout.tsx`, `src/app/m/einsatzbuch/(verwaltung)/page.tsx`, `e2e/einsatzbuch.spec.ts`
- Modify: `e2e/gruppen.json` (Gruppe `suite-verwaltung`)

**Interfaces:**
- Consumes: `requireEinsatzbuchHost` (Task 6), `requireEinsatzbuchZugang` (Task 6), `Shell` (`@/core/shell/Shell`), `Seitenkopf` (`@/core/shell/Seitenkopf`), `devLogin`, `E2E_PORT` (`e2e/fixtures.ts`).
- Produces: Route `/m/einsatzbuch` (auf dem eigenen Host `/`). Stufe 2 hängt Stammdaten und Einstellungen als Geschwister unter `(verwaltung)/` ein und ergänzt `_lib/nav.ts`.

- [ ] **Step 1: E2E schreiben**

`e2e/einsatzbuch.spec.ts`:
```ts
import { expect, test } from "@playwright/test";
import { devLogin, E2E_PORT } from "./fixtures";

/**
 * Stufe 1 des Einsatzbuchs: das Modul ist registriert, nur die Zugangsgruppe kommt
 * hinein, und ein fremder Suite-Host liefert es nicht aus. Die Seite selbst ist bewusst
 * schmal — gemessen wird, dass sie OHNE HTTP 500 rendert (Fallen 1, 6, 7 sieht nur ein
 * echter Abruf).
 */
const HOST = "einsatzbuch.localtest.me";
const url = (pfad: string) => `http://${HOST}:${E2E_PORT}${pfad}`;

test("mit der Gruppe öffnet sich die Übersicht in der Suite-Hülle", async ({ page }) => {
  await devLogin(page, { host: HOST, groups: "einsatzbuch-verwaltung", callbackPath: "/" });
  const antwort = await page.goto(url("/"));
  expect(antwort?.status()).toBe(200);
  await expect(page.getByRole("heading", { level: 1, name: "Einsatzbuch" })).toBeVisible();
  await expect(page.getByTestId("suite-header")).toHaveCount(1);
});

test("ohne die Gruppe antwortet das Modul mit 404 — auch dem Suite-Admin", async ({ page }) => {
  await devLogin(page, { host: HOST, groups: "dashboard-admins", callbackPath: "/login" });
  const antwort = await page.goto(url("/"));
  expect(antwort?.status()).toBe(404);
});

test("ohne Anmeldung geht es zum Login", async ({ page }) => {
  await page.goto(url("/"));
  await expect(page).toHaveURL(/\/login/);
});

test("ein fremder Suite-Host liefert das Modul nicht aus", async ({ page }) => {
  await devLogin(page, { host: "feedback.localtest.me", groups: "einsatzbuch-verwaltung", callbackPath: "/login" });
  const antwort = await page.goto(`http://feedback.localtest.me:${E2E_PORT}/m/einsatzbuch`);
  expect(antwort?.status()).toBe(404);
});
```

In `e2e/gruppen.json` in der Gruppe `"suite-verwaltung"` an `specs` ` e2e/einsatzbuch.spec.ts` anhängen.

- [ ] **Step 2: Rot sehen**

Run: `pnpm exec playwright test e2e/einsatzbuch.spec.ts`
Expected: FAIL — Test 1 erhält 404 (es gibt noch keine Seite). Vorher prüfen, dass kein fremder `pnpm dev` den E2E-Port hält.

- [ ] **Step 3: Layouts und Seite**

`src/app/m/einsatzbuch/layout.tsx`:
```tsx
export default function EinsatzbuchLayout({ children }: { children: React.ReactNode }) {
  return children;
}
```

`src/app/m/einsatzbuch/(verwaltung)/layout.tsx`:
```tsx
import { headers } from "next/headers";
import { Shell } from "@/core/shell/Shell";
import { requireEinsatzbuchHost } from "../_lib/host";
import { requireEinsatzbuchZugang } from "../_lib/zugang";

/**
 * Verwaltung des Einsatzbuchs: Host zuerst, dann Gruppe (beide Riegel werfen in `_lib/`).
 * Jede Seite darunter ruft die Riegel noch einmal — eine Route Group ist keine
 * Sicherheitsgrenze. Die Navigation kommt mit Stufe 2 (`_lib/nav.ts`).
 */
export default async function EinsatzbuchVerwaltungLayout({ children }: { children: React.ReactNode }) {
  requireEinsatzbuchHost(await headers());
  await requireEinsatzbuchZugang();
  return (
    <Shell variant="full" moduleKey="einsatzbuch">
      {children}
    </Shell>
  );
}
```

`src/app/m/einsatzbuch/(verwaltung)/page.tsx`:
```tsx
import { headers } from "next/headers";
import { Seitenkopf } from "@/core/shell/Seitenkopf";
import { requireEinsatzbuchHost } from "../_lib/host";
import { requireEinsatzbuchZugang } from "../_lib/zugang";

export default async function EinsatzbuchUebersicht() {
  requireEinsatzbuchHost(await headers());
  await requireEinsatzbuchZugang();
  return (
    <Seitenkopf
      titel="Einsatzbuch"
      beschreibung="Hier pflegst du bald Fahrzeuge, Personal und Alarmstichworte für den Einsatzbuch-Rechner und öffnest exportierte Einsatzdateien."
    />
  );
}
```

- [ ] **Step 4: Grün sehen**

Run: `pnpm exec playwright test e2e/einsatzbuch.spec.ts`
Expected: PASS, 4 Tests. Schlägt Test 1 mit HTTP 500 fehl, zuerst Fallen 1, 6, 7 in `CLAUDE.md` prüfen (die Seite nutzt nur `Seitenkopf` und `Shell`, beides Server-sicher).

- [ ] **Step 5: Alle Tore**

Run nacheinander, jeweils Exit-Code prüfen:
`pnpm typecheck` · `pnpm lint` · `pnpm vitest run` · `pnpm build` · `pnpm exec playwright test e2e/einsatzbuch.spec.ts`
Expected: alle grün. Ist `src/lfs-medien.test.ts` rot, lief `git lfs pull` im Worktree nicht — kein Befund dieser Änderung (`CLAUDE.md`, Cloud-Hinweis).

- [ ] **Step 6: Commit, Push, PR, Ticket**

```bash
git add src/app/m/einsatzbuch/layout.tsx "src/app/m/einsatzbuch/(verwaltung)" e2e/einsatzbuch.spec.ts e2e/gruppen.json
git commit -S -m "feat(einsatzbuch): Übersichtsseite hinter Host- und Gruppenriegel" -m "Nur die Zugangsgruppe sieht das Modul; ohne Anmeldung geht es zum Login, über einen fremden Suite-Host gibt es 404." -m "DRK-471" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
git push -u origin claude/einsatzbuch-v2-tauri-2471b2
gh pr create --title "feat(einsatzbuch): Stufe 1 — geteilter Kern und Modulgerüst" --body-file <(printf '%s\n' "Stufe 1 von 7 des Einsatzbuchs v2 (DRK-471, Spec docs/superpowers/specs/2026-09-24-einsatzbuch-v2-design.md)." "" "- Geteilter Kern: Blockformat mit Umschlag für den Suite-Schlüssel, Kettenprüfung, kennwortgeschützter Export, Berichtsmodell, Zeitrechnung in der Suite-Zone" "- Testvektoren als Format-Vertrag mit der Desktop-App (Stufe 4 vergleicht in Rust byte-genau)" "- Modul einsatzbuch: Registry, Host-Riegel, Zugang nur über die Gruppe einsatzbuch-verwaltung, eigene Datenbank, Übersichtsseite" "" "Workspace und Werkzeug-Ausschlüsse für apps/ folgen mit Stufe 4, sobald es die App gibt." "" "🤖 Generated with [Claude Code](https://claude.com/claude-code)")
```
Danach DRK-471 auf `review` setzen und einen Kommentar mit dem PR-Link schreiben (Skill `clickup`). `Closed` erst nach dem Merge der **letzten** Stufe.
