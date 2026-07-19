# Modul `qr` — Implementation Plan, Teil 2 (UI, Admin, PWA, E2E)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.
>
> **Setzt Teil 1 voraus** (`2026-07-19-qr-module.md`, Tasks 1–6): Modul registriert, Payload-Encoding, QR-Erzeugung, DB-Schema, Slug, Validator. **Global Constraints und Entscheidungen aus Teil 1 gelten hier unverändert weiter** — insbesondere der QR-URL-Vertrag, der localStorage-Key, die Tap-Target-Größen und `timestamp_ms`.

---

## Task 7: Query-Layer für Presets

**Files:**
- Create: `src/app/m/qr/_lib/presets.ts`, `src/app/m/qr/_lib/seed.ts`
- Modify: `src/core/bootstrap.ts` (Seed registrieren)
- Test: `src/app/m/qr/_lib/presets.test.ts`

**Interfaces:**
- Consumes: `getDb()` aus `_db/client`, `presets`/`PresetRow` aus `_db/schema`, `slugify`/`uniqueSlug` aus `_lib/slug`
- Produces:
  - `listPresets(): Promise<Preset[]>`
  - `createPreset(input: Omit<Preset,"id"> & { id?: string }, userId: string): Promise<Preset>`
  - `updatePreset(id: string, input: Omit<Preset,"id">, userId: string): Promise<Preset | null>`
  - `deletePreset(id: string): Promise<boolean>`
  - `reorderPresets(ids: string[]): Promise<void>`
  - `seedQr(db): Promise<void>`

- [ ] **Step 1: Test schreiben**

`src/app/m/qr/_lib/presets.test.ts` — nach dem Muster von `portal/_lib/services.test.ts`: echte SQLite in isoliertem `DATA_DIR`, Code unter Test **dynamisch** importiert, damit er die gesetzte Env sieht:

```ts
import { describe, it, expect, beforeEach } from "vitest";
import { rmSync } from "node:fs";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import Database from "better-sqlite3";

const DIR = "./.data/qr-test";

beforeEach(() => {
  rmSync(DIR, { recursive: true, force: true });
  process.env.DATA_DIR = DIR;
  const sqlite = new Database(`${DIR}/qr.db`);
  migrate(drizzle(sqlite), { migrationsFolder: "src/app/m/qr/_db/migrations" });
  sqlite.close();
});

describe("presets", () => {
  it("legt ein Preset an und vergibt einen Slug aus dem Label", async () => {
    const { createPreset, listPresets } = await import("@/app/m/qr/_lib/presets");
    const p = await createPreset(
      { label: "Übung Größe", kind: "url", value: "https://drk.de" },
      "user-1",
    );
    expect(p.id).toBe("uebung-groesse");
    expect(await listPresets()).toHaveLength(1);
  });

  it("kollidierende Labels bekommen -2", async () => {
    const { createPreset } = await import("@/app/m/qr/_lib/presets");
    await createPreset({ label: "Test", kind: "url", value: "a" }, "u");
    const second = await createPreset({ label: "Test", kind: "url", value: "b" }, "u");
    expect(second.id).toBe("test-2");
  });

  it("value wird JSON-kodiert gespeichert und wieder geparst", async () => {
    const { createPreset, listPresets } = await import("@/app/m/qr/_lib/presets");
    await createPreset(
      { label: "W", kind: "wifi", value: { ssid: "S", password: "p", encryption: "WPA" } },
      "u",
    );
    const [p] = await listPresets();
    expect(p.kind).toBe("wifi");
    expect(p.value).toEqual({ ssid: "S", password: "p", encryption: "WPA" });
  });

  it("sortiert nach sort_order, dann label", async () => {
    const { createPreset, listPresets, reorderPresets } = await import("@/app/m/qr/_lib/presets");
    await createPreset({ label: "A", kind: "url", value: "a" }, "u");
    await createPreset({ label: "B", kind: "url", value: "b" }, "u");
    await reorderPresets(["b", "a"]);
    expect((await listPresets()).map((p) => p.id)).toEqual(["b", "a"]);
  });

  it("update ändert Werte und updated_by, id bleibt", async () => {
    const { createPreset, updatePreset } = await import("@/app/m/qr/_lib/presets");
    const p = await createPreset({ label: "Alt", kind: "url", value: "a" }, "u1");
    const updated = await updatePreset(p.id, { label: "Neu", kind: "url", value: "b" }, "u2");
    expect(updated?.id).toBe(p.id);
    expect(updated?.label).toBe("Neu");
  });

  it("update auf unbekannte id liefert null statt zu werfen", async () => {
    const { updatePreset } = await import("@/app/m/qr/_lib/presets");
    expect(await updatePreset("gibtsnicht", { label: "X", kind: "url", value: "a" }, "u")).toBeNull();
  });

  it("delete meldet, ob etwas gelöscht wurde", async () => {
    const { createPreset, deletePreset } = await import("@/app/m/qr/_lib/presets");
    const p = await createPreset({ label: "Weg", kind: "url", value: "a" }, "u");
    expect(await deletePreset(p.id)).toBe(true);
    expect(await deletePreset(p.id)).toBe(false);
  });
});
```

- [ ] **Step 2: Test laufen lassen, Fehlschlag bestätigen**

Run: `pnpm exec vitest run src/app/m/qr/_lib/presets.test.ts`
Expected: FAIL — Modul existiert nicht

- [ ] **Step 3: Implementieren**

`src/app/m/qr/_lib/presets.ts`:

```ts
import { eq, asc, sql } from "drizzle-orm";
import { getDb } from "@/app/m/qr/_db/client";
import { presets, type PresetRow } from "@/app/m/qr/_db/schema";
import { slugify, uniqueSlug } from "./slug";
import type { Preset } from "./types";

type PresetInput = Omit<Preset, "id"> & { id?: string };

/** DB-Zeile -> Domänentyp. `value` ist in der Spalte JSON-kodiert, auch bei
 *  kind='url' — dieses Encoding stammt aus easy-qr und bleibt erhalten. */
function toPreset(row: PresetRow): Preset {
  return {
    id: row.id,
    label: row.label,
    icon: row.icon ?? undefined,
    kind: row.kind,
    value: JSON.parse(row.value),
  } as Preset;
}

export async function listPresets(): Promise<Preset[]> {
  const rows = getDb()
    .select()
    .from(presets)
    .orderBy(asc(presets.sortOrder), asc(presets.label))
    .all();
  return rows.map(toPreset);
}

export async function createPreset(input: PresetInput, userId: string): Promise<Preset> {
  const db = getDb();
  const taken = (id: string) =>
    db.select({ one: sql`1` }).from(presets).where(eq(presets.id, id)).get() !== undefined;
  const id = input.id ?? uniqueSlug(taken, slugify(input.label));

  const max = db.select({ m: sql<number>`coalesce(max(sort_order), -1)` }).from(presets).get();
  const now = new Date();

  db.insert(presets)
    .values({
      id,
      label: input.label,
      icon: input.icon ?? null,
      kind: input.kind,
      value: JSON.stringify(input.value),
      sortOrder: (max?.m ?? -1) + 1,
      createdAt: now,
      updatedAt: now,
      createdBy: userId,
      updatedBy: userId,
    })
    .run();

  return { ...input, id } as Preset;
}

export async function updatePreset(
  id: string,
  input: Omit<Preset, "id">,
  userId: string,
): Promise<Preset | null> {
  const db = getDb();
  const existing = db.select().from(presets).where(eq(presets.id, id)).get();
  if (!existing) return null;

  db.update(presets)
    .set({
      label: input.label,
      icon: input.icon ?? null,
      kind: input.kind,
      value: JSON.stringify(input.value),
      updatedAt: new Date(),
      updatedBy: userId,
    })
    .where(eq(presets.id, id))
    .run();

  return { ...input, id } as Preset;
}

export async function deletePreset(id: string): Promise<boolean> {
  const res = getDb().delete(presets).where(eq(presets.id, id)).run();
  return res.changes > 0;
}

/** Die Position im Array wird zum sort_order-Index — wie in easy-qr, und in
 *  einer Transaktion, damit keine Zwischenzustände sichtbar werden. */
export async function reorderPresets(ids: string[]): Promise<void> {
  const db = getDb();
  db.transaction((tx) => {
    ids.forEach((id, index) => {
      tx.update(presets).set({ sortOrder: index }).where(eq(presets.id, id)).run();
    });
  });
}
```

- [ ] **Step 4: Seed anlegen und registrieren**

`src/app/m/qr/_lib/seed.ts` — entspricht `easy-qr/migrations/0002_seed_demo_preset.sql`:

```ts
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { presets } from "@/app/m/qr/_db/schema";
import * as schema from "@/app/m/qr/_db/schema";

export async function seedQr(db: BetterSQLite3Database<typeof schema>): Promise<void> {
  const now = new Date();
  db.insert(presets)
    .values({
      id: "demo-url",
      label: "Beispiel-Link",
      icon: "🔗",
      kind: "url",
      value: JSON.stringify("https://www.drk.de"),
      sortOrder: 0,
      createdAt: now,
      updatedAt: now,
      createdBy: "system",
      updatedBy: "system",
    })
    .onConflictDoNothing()
    .run();
}
```

In `src/core/bootstrap.ts`: Import ergänzen und in `seedAllModules()` aufrufen:

```ts
import * as qrSchema from "@/app/m/qr/_db/schema";
import { seedQr } from "@/app/m/qr/_lib/seed";
// …
export async function seedAllModules(): Promise<void> {
  await seedPortal(getModuleDb("portal", portalSchema));
  await seedQr(getModuleDb("qr", qrSchema));
}
```

- [ ] **Step 5: Tests laufen lassen**

Run: `pnpm exec vitest run src/app/m/qr/_lib/presets.test.ts && pnpm typecheck`
Expected: PASS, 7 Tests

- [ ] **Step 6: Commit**

```bash
git add src/app/m/qr/_lib src/core/bootstrap.ts
git commit -m "feat(qr): Preset-Query-Layer + Seed"
```

---

## Task 8: QR-Anzeige-Komponente

**Files:**
- Create: `src/app/m/qr/QrDisplay.tsx`
- Test: über Task 13 (E2E mit echter Dekodierung) — eine Unit-Test-Attrappe für Canvas/Fullscreen wäre teurer als aussagekräftig

**Interfaces:**
- Consumes: `payloadToSvg` aus `_lib/qr`
- Produces: `<QrDisplay text={string} label={string} />`

- [ ] **Step 1: Implementieren**

`src/app/m/qr/QrDisplay.tsx`:

```tsx
"use client";

import { useEffect, useRef, useState } from "react";
import { payloadToSvg } from "@/app/m/qr/_lib/qr";

/**
 * Anzeige plus die vier Einsatz-Funktionen aus easy-qr: Vollbild, Invertieren
 * per Long-Press (600 ms), PNG-Download (1024×1024), Teilen.
 *
 * Invertieren ist reines CSS `filter: invert(1)` — manche Scanner tun sich mit
 * dunklen Displays leichter. Long-Press statt Button, damit die Oberfläche im
 * Einsatz nicht mit Knöpfen zugestellt ist.
 */
export function QrDisplay({ text, label }: { text: string; label: string }) {
  const [svg, setSvg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [inverted, setInverted] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);
  const pressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let cancelled = false;
    setError(null);
    payloadToSvg(text)
      .then((s) => {
        if (!cancelled) setSvg(s);
      })
      .catch((e: Error) => {
        if (!cancelled) setError(e.message);
      });
    return () => {
      cancelled = true;
    };
  }, [text]);

  const startPress = () => {
    pressTimer.current = setTimeout(() => setInverted((v) => !v), 600);
  };
  const endPress = () => {
    if (pressTimer.current) clearTimeout(pressTimer.current);
  };

  async function downloadPng() {
    if (!svg) return;
    const blob = new Blob([svg], { type: "image/svg+xml" });
    const url = URL.createObjectURL(blob);
    try {
      const img = new Image();
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = () => reject(new Error("SVG konnte nicht geladen werden"));
        img.src = url;
      });
      const canvas = document.createElement("canvas");
      canvas.width = 1024;
      canvas.height = 1024;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, 1024, 1024);
      ctx.drawImage(img, 0, 0, 1024, 1024);
      canvas.toBlob((png) => {
        if (!png) return;
        const a = document.createElement("a");
        a.href = URL.createObjectURL(png);
        a.download = `${label || "qr"}.png`;
        a.click();
        URL.revokeObjectURL(a.href);
      }, "image/png");
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  async function share() {
    // Teilt bewusst den Payload-TEXT, nicht das Bild — so kann der Empfänger
    // den Inhalt direkt nutzen (Link öffnen, Nummer wählen).
    if (navigator.share) await navigator.share({ title: label, text });
  }

  function toggleFullscreen() {
    const el = boxRef.current;
    if (!el) return;
    if (document.fullscreenElement) void document.exitFullscreen();
    else void el.requestFullscreen?.();
  }

  if (error) {
    return (
      <p data-testid="qr-error" className="text-[var(--color-rot)]">
        {error}
      </p>
    );
  }

  return (
    <div className="flex flex-col items-center gap-4">
      <div
        ref={boxRef}
        data-testid="qr-display"
        className="w-full max-w-md bg-white p-4"
        style={inverted ? { filter: "invert(1)" } : undefined}
        onPointerDown={startPress}
        onPointerUp={endPress}
        onPointerLeave={endPress}
        onDoubleClick={toggleFullscreen}
        dangerouslySetInnerHTML={svg ? { __html: svg } : undefined}
      />
      <div className="flex flex-wrap justify-center gap-3">
        <button
          type="button"
          onClick={downloadPng}
          className="min-h-[var(--tap)] rounded border px-4"
        >
          PNG speichern
        </button>
        <button
          type="button"
          onClick={share}
          className="min-h-[var(--tap)] rounded border px-4"
        >
          Teilen
        </button>
        <button
          type="button"
          onClick={toggleFullscreen}
          className="min-h-[var(--tap)] rounded border px-4"
        >
          Vollbild
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `pnpm typecheck && pnpm lint`
Expected: keine Fehler

- [ ] **Step 3: Commit**

```bash
git add src/app/m/qr/QrDisplay.tsx
git commit -m "feat(qr): QR-Anzeige mit Vollbild, Invertieren, PNG-Export, Teilen"
```

---

## Task 9: QR-Ansicht `/qr` — der URL-Vertrag

**Files:**
- Create: `src/app/m/qr/qr/page.tsx`
- Test: E2E in Task 13

**Interfaces:**
- Consumes: `QrDisplay`, `payloadToQrString`, `QrKind`
- Produces: Route `/qr?data=<payload>&label=<text>&kind=<kind>`

> ⚠️ **Dieser URL-Vertrag ist 1:1 zu erhalten** — Nutzer haben solche Links gebookmarkt und geteilt.
>
> ⚠️ **Next-Falle:** `useSearchParams()` in einer Client Component braucht eine `<Suspense>`-Grenze, sonst schlägt der Build mit `missing-suspense-with-csr-bailout` fehl. Hier stattdessen über die Server-Component-Prop `searchParams` gelesen — in Next 16 ist die ein Promise.

- [ ] **Step 1: Implementieren**

`src/app/m/qr/qr/page.tsx`:

```tsx
import { QrDisplay } from "@/app/m/qr/QrDisplay";
import { payloadToQrString } from "@/app/m/qr/_lib/payload";
import type { QrKind, QrPayload } from "@/app/m/qr/_lib/types";

const KINDS: ReadonlyArray<QrKind> = ["url", "wifi", "tel", "vcard", "text"];

export default async function QrViewPage({
  searchParams,
}: {
  searchParams: Promise<{ data?: string; label?: string; kind?: string }>;
}) {
  const { data, label, kind } = await searchParams;

  if (!data) {
    return <p data-testid="qr-missing">Kein Inhalt übergeben.</p>;
  }

  // `data` trägt bei strukturierten Kinds JSON, bei url/tel/text den rohen Wert
  // — genau wie die Links, die heute im Umlauf sind.
  let payload: QrPayload;
  const safeKind = (KINDS.includes(kind as QrKind) ? kind : "text") as QrKind;
  if (safeKind === "wifi" || safeKind === "vcard") {
    try {
      payload = { kind: safeKind, value: JSON.parse(data) } as QrPayload;
    } catch {
      return <p data-testid="qr-error">Inhalt konnte nicht gelesen werden.</p>;
    }
  } else {
    payload = { kind: safeKind, value: data } as QrPayload;
  }

  return (
    <div className="flex flex-col items-center gap-4" data-testid="qr-view">
      {label ? <h1 className="text-lg font-bold">{label}</h1> : null}
      <QrDisplay text={payloadToQrString(payload)} label={label ?? "qr"} />
    </div>
  );
}
```

- [ ] **Step 2: Manuell prüfen**

Run: `pnpm dev`, dann `http://qr.localtest.me:3000/qr?data=https%3A%2F%2Fdrk.de&label=Test&kind=url`
Expected: QR-Code sichtbar, Überschrift „Test"

- [ ] **Step 3: Commit**

```bash
git add src/app/m/qr/qr
git commit -m "feat(qr): QR-Ansicht mit erhaltenem URL-Vertrag ?data&label&kind"
```

---

## Task 10: Verlauf, Startseite und Eingabe-Formulare

**Files:**
- Create: `src/app/m/qr/_lib/history.ts`, `src/app/m/qr/PresetGrid.tsx`, `src/app/m/qr/UrlInput.tsx`
- Modify: `src/app/m/qr/page.tsx`
- Create: `src/app/m/qr/wifi/page.tsx`, `tel/page.tsx`, `contact/page.tsx`
- Test: `src/app/m/qr/_lib/history.test.ts`

**Interfaces:**
- Produces: `HISTORY_KEY = "qr-generator:history:v1"`, `HISTORY_LIMIT = 20`, `loadHistory()`, `addEntry(e)`, `clearHistory()`

> ⚠️ Der localStorage-Key ist **1:1 zu erhalten** — sonst ist der Verlauf jedes Nutzers weg.

- [ ] **Step 1: Test für den Verlauf**

`src/app/m/qr/_lib/history.test.ts`:

```ts
import { describe, it, expect, beforeEach } from "vitest";

// jsdom-Umgebung für localStorage
// @vitest-environment jsdom
import { loadHistory, addEntry, clearHistory, HISTORY_KEY, HISTORY_LIMIT } from "@/app/m/qr/_lib/history";

const entry = (id: string) => ({
  id,
  label: `L${id}`,
  payload: { kind: "url" as const, value: "https://x" },
  createdAt: Number(id),
});

beforeEach(() => {
  localStorage.clear();
});

describe("history", () => {
  it("startet leer", () => {
    expect(loadHistory()).toEqual([]);
  });
  it("neueste zuerst", () => {
    addEntry(entry("1"));
    addEntry(entry("2"));
    expect(loadHistory().map((e) => e.id)).toEqual(["2", "1"]);
  });
  it("deckelt bei HISTORY_LIMIT", () => {
    for (let i = 0; i < HISTORY_LIMIT + 5; i++) addEntry(entry(String(i)));
    expect(loadHistory()).toHaveLength(HISTORY_LIMIT);
  });
  it("kaputtes JSON liefert eine leere Liste statt zu werfen", () => {
    localStorage.setItem(HISTORY_KEY, "{kein json");
    expect(loadHistory()).toEqual([]);
  });
  it("Einträge mit falschem Schema werden verworfen", () => {
    localStorage.setItem(HISTORY_KEY, JSON.stringify([{ id: 1 }]));
    expect(loadHistory()).toEqual([]);
  });
  it("clearHistory leert", () => {
    addEntry(entry("1"));
    clearHistory();
    expect(loadHistory()).toEqual([]);
  });
});
```

Hinweis: `vitest.config.ts` nutzt `environment: "node"`. Diese Datei braucht jsdom — die Direktive `// @vitest-environment jsdom` **muss in der ersten Zeile stehen**, also über den Imports. Falls das mit dem Import-Block kollidiert, stattdessen in `vitest.config.ts` eine `environmentMatchGlobs`-Regel für `**/history.test.ts` ergänzen.

- [ ] **Step 2: Test laufen lassen, Fehlschlag bestätigen**

Run: `pnpm exec vitest run src/app/m/qr/_lib/history.test.ts`
Expected: FAIL

- [ ] **Step 3: Verlauf implementieren**

`src/app/m/qr/_lib/history.ts` — 1:1 aus `easy-qr/src/lib/history.ts` übernehmen (inklusive des Memory-Fallbacks für Browser mit gesperrtem localStorage, z. B. privater Modus), nur die Import-Pfade auf `./types` anpassen.

- [ ] **Step 4: Startseite mit Presets, Eingabe, Kacheln, Verlauf**

`src/app/m/qr/page.tsx` — Presets sind **nur eingeloggt** sichtbar (entschieden, wie heute):

```tsx
import Link from "next/link";
import { auth } from "@/core/auth";
import { listPresets } from "@/app/m/qr/_lib/presets";
import { PresetGrid } from "@/app/m/qr/PresetGrid";
import { UrlInput } from "@/app/m/qr/UrlInput";

export default async function QrHomePage() {
  const session = await auth();
  // Anonym: keine Presets. Das Modul ist requiresAuth: false, session ist dann
  // schlicht null — kein Fehler, nur weniger Inhalt.
  const presets = session?.user ? await listPresets() : [];

  return (
    <div className="flex flex-col gap-6" data-testid="qr-home">
      <UrlInput />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {[
          { href: "/wifi", label: "WLAN" },
          { href: "/tel", label: "Telefon" },
          { href: "/contact", label: "Kontakt" },
        ].map((k) => (
          <Link
            key={k.href}
            href={k.href}
            className="flex min-h-[var(--tap-xl)] items-center justify-center rounded border"
          >
            {k.label}
          </Link>
        ))}
      </div>

      {session?.user ? (
        <PresetGrid presets={presets} />
      ) : (
        <p data-testid="qr-login-hint" className="text-[var(--color-stahl)]">
          Anmelden, um persönliche Schnellzugriffe zu sehen.
        </p>
      )}
    </div>
  );
}
```

> **Wichtig für ein anonymes Modul:** Es gibt keinen automatischen Login-Redirect. Der Hinweis oben braucht daher einen sichtbaren Login-Einstieg — die `FullShell` hat einen, die `MinimalShell` nicht. Ergänze im Hinweis einen Link:
> `<Link href={\`/login?callbackUrl=${encodeURIComponent("/")}\`}>Anmelden</Link>`

`src/app/m/qr/PresetGrid.tsx` (Client, weil es beim Tippen in den Verlauf schreibt und navigiert):

```tsx
"use client";

import { useRouter } from "next/navigation";
import { addEntry } from "@/app/m/qr/_lib/history";
import type { Preset } from "@/app/m/qr/_lib/types";

export function PresetGrid({ presets }: { presets: Preset[] }) {
  const router = useRouter();
  if (presets.length === 0) return null;

  function open(p: Preset) {
    const data = typeof p.value === "string" ? p.value : JSON.stringify(p.value);
    addEntry({ id: crypto.randomUUID(), label: p.label, payload: p, createdAt: Date.now() });
    router.push(
      `/qr?data=${encodeURIComponent(data)}&label=${encodeURIComponent(p.label)}&kind=${p.kind}`,
    );
  }

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3" data-testid="preset-grid">
      {presets.map((p) => (
        <button
          key={p.id}
          type="button"
          onClick={() => open(p)}
          className="flex min-h-32 flex-col items-center justify-center rounded border p-2"
        >
          <span className="text-3xl">{p.icon ?? p.label.charAt(0).toUpperCase()}</span>
          <span>{p.label}</span>
        </button>
      ))}
    </div>
  );
}
```

`src/app/m/qr/UrlInput.tsx` — mit der Längenwarnung ab `QR_MAX_LENGTH`:

```tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { QR_MAX_LENGTH } from "@/app/m/qr/_lib/qr";

export function UrlInput() {
  const [value, setValue] = useState("");
  const router = useRouter();
  const tooLong = value.length > QR_MAX_LENGTH;

  return (
    <form
      className="flex flex-col gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        if (!value || tooLong) return;
        router.push(`/qr?data=${encodeURIComponent(value)}&kind=url`);
      }}
    >
      <label htmlFor="url">Link oder Text</label>
      <input
        id="url"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        className="min-h-[var(--tap)] rounded border px-3"
      />
      {tooLong ? (
        <p data-testid="too-long" className="text-[var(--color-rot)]">
          Zu lang für einen QR-Code (max. {QR_MAX_LENGTH} Zeichen).
        </p>
      ) : null}
      <button type="submit" className="min-h-[var(--tap)] rounded border">
        QR-Code erzeugen
      </button>
    </form>
  );
}
```

- [ ] **Step 5: Die drei Formulare**

`wifi/page.tsx`, `tel/page.tsx`, `contact/page.tsx` sind Client Components nach demselben Muster: Felder sammeln, beim Absenden nach `/qr?data=…&kind=…` navigieren. Für `wifi` und `vcard` wird `data` **JSON-kodiert** (`encodeURIComponent(JSON.stringify(value))`), für `tel` roh — passend zum Leser aus Task 9. Felder:
- **wifi:** `ssid` (Pflicht), `password`, `encryption` (Radio: WPA/WEP/nopass), `hidden` (Checkbox)
- **tel:** `number` (Pflicht)
- **contact:** `name` (Pflicht), `tel`, `email`, `org`

Alle Eingaben mit `min-h-[var(--tap)]`, alle Submit-Buttons mit `min-h-[var(--tap-xl)]`.

- [ ] **Step 6: Tests und Gates**

Run: `pnpm exec vitest run src/app/m/qr && pnpm typecheck && pnpm lint`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add src/app/m/qr
git commit -m "feat(qr): Startseite, Presets-Grid, Eingabeformulare, Verlauf"
```

---

## Task 11: Admin-Bereich

**Files:**
- Create: `src/app/m/qr/actions.ts`, `src/app/m/qr/admin/page.tsx`, `src/app/m/qr/admin/preset-form.tsx`
- Test: `src/app/m/qr/actions.test.ts`

**Interfaces:**
- Consumes: `requireModuleAdmin`, `moduleAdminPageOrNotFound` aus `@/core/auth/guards`; `validatePresetInput`; Query-Layer aus Task 7
- Produces: `createPresetAction`, `updatePresetAction`, `deletePresetAction`, `reorderPresetsAction`

> Die Guards kommen aus `core` — **nicht** neu implementieren. `qr` hat `adminGroups: ["drk-qr-admin"]`; der Suite-Admin (`ADMIN_GROUP`) darf zusätzlich immer.

- [ ] **Step 1: Autorisierungstest schreiben**

`src/app/m/qr/actions.test.ts` — nach dem Muster von `portal/actions.test.ts`; der Beweis ist „wurde der Schreiber aufgerufen?", unabhängig von SQLite:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/core/auth", () => ({ auth: vi.fn() }));
vi.mock("@/app/m/qr/_lib/presets", () => ({
  createPreset: vi.fn().mockResolvedValue({ id: "p1" }),
  updatePreset: vi.fn().mockResolvedValue({ id: "p1" }),
  deletePreset: vi.fn().mockResolvedValue(true),
  reorderPresets: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { auth } from "@/core/auth";
import { createPreset, deletePreset } from "@/app/m/qr/_lib/presets";
import { createPresetAction, deletePresetAction } from "@/app/m/qr/actions";

const authMock = vi.mocked(auth);

function fd(entries: Record<string, string>): FormData {
  const f = new FormData();
  for (const [k, v] of Object.entries(entries)) f.set(k, v);
  return f;
}

beforeEach(() => {
  authMock.mockReset();
  vi.mocked(createPreset).mockClear();
  vi.mocked(deletePreset).mockClear();
});

describe("qr admin actions: Autorisierungsgrenze", () => {
  it("anonym darf nicht anlegen", async () => {
    authMock.mockResolvedValue(null as never);
    await expect(
      createPresetAction(fd({ label: "L", kind: "url", value: "https://x" })),
    ).rejects.toThrow("Forbidden");
    expect(createPreset).not.toHaveBeenCalled();
  });

  it("eingeloggt ohne Gruppe darf nicht löschen", async () => {
    authMock.mockResolvedValue({ user: { groups: [] } } as never);
    await expect(deletePresetAction(fd({ id: "p1" }))).rejects.toThrow("Forbidden");
    expect(deletePreset).not.toHaveBeenCalled();
  });

  it("drk-qr-user allein genügt nicht", async () => {
    authMock.mockResolvedValue({ user: { groups: ["drk-qr-user"] } } as never);
    await expect(deletePresetAction(fd({ id: "p1" }))).rejects.toThrow("Forbidden");
    expect(deletePreset).not.toHaveBeenCalled();
  });

  it("drk-qr-admin darf anlegen", async () => {
    authMock.mockResolvedValue({ user: { groups: ["drk-qr-admin"], id: "u1" } } as never);
    await createPresetAction(fd({ label: "L", kind: "url", value: "https://x" }));
    expect(createPreset).toHaveBeenCalledTimes(1);
  });

  it("Suite-Admin darf auch ohne QR-Gruppe", async () => {
    authMock.mockResolvedValue({ user: { groups: ["dashboard-admins"], id: "u1" } } as never);
    await createPresetAction(fd({ label: "L", kind: "url", value: "https://x" }));
    expect(createPreset).toHaveBeenCalledTimes(1);
  });

  it("ungültige Eingabe wird abgelehnt, ohne zu schreiben", async () => {
    authMock.mockResolvedValue({ user: { groups: ["drk-qr-admin"], id: "u1" } } as never);
    await expect(createPresetAction(fd({ label: "", kind: "url", value: "x" }))).rejects.toThrow();
    expect(createPreset).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Test laufen lassen, Fehlschlag bestätigen**

Run: `pnpm exec vitest run src/app/m/qr/actions.test.ts`
Expected: FAIL

- [ ] **Step 3: Actions implementieren**

`src/app/m/qr/actions.ts`:

```ts
"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/core/auth";
import { requireModuleAdmin } from "@/core/auth/guards";
import { validatePresetInput } from "@/app/m/qr/_lib/validator";
import {
  createPreset,
  updatePreset,
  deletePreset,
  reorderPresets,
} from "@/app/m/qr/_lib/presets";

/** Guard zuerst, Validierung danach — es soll nichts geschrieben werden, bevor
 *  die Berechtigung feststeht. */
async function adminUserId(): Promise<string> {
  await requireModuleAdmin("qr");
  const session = await auth();
  return session?.user?.id ?? "unbekannt";
}

function parse(formData: FormData) {
  const raw = String(formData.get("value") ?? "");
  const kind = String(formData.get("kind") ?? "");
  // wifi/vcard kommen als JSON aus dem Formular, alles andere roh.
  const value = kind === "wifi" || kind === "vcard" ? JSON.parse(raw) : raw;
  const result = validatePresetInput({
    label: formData.get("label"),
    icon: formData.get("icon") || undefined,
    kind,
    value,
    id: formData.get("id") || undefined,
  });
  if (!result.ok) throw new Error(result.error);
  return result.value;
}

export async function createPresetAction(formData: FormData) {
  const userId = await adminUserId();
  await createPreset(parse(formData), userId);
  revalidatePath("/m/qr");
  revalidatePath("/m/qr/admin");
}

export async function updatePresetAction(formData: FormData) {
  const userId = await adminUserId();
  const id = String(formData.get("id"));
  const { id: _ignored, ...rest } = parse(formData);
  await updatePreset(id, rest, userId);
  revalidatePath("/m/qr");
  revalidatePath("/m/qr/admin");
}

export async function deletePresetAction(formData: FormData) {
  await requireModuleAdmin("qr");
  await deletePreset(String(formData.get("id")));
  revalidatePath("/m/qr");
  revalidatePath("/m/qr/admin");
}

export async function reorderPresetsAction(ids: string[]) {
  await requireModuleAdmin("qr");
  await reorderPresets(ids);
  revalidatePath("/m/qr");
  revalidatePath("/m/qr/admin");
}
```

> `revalidatePath` nimmt den **internen** Pfad (`/m/qr`), nicht den externen — wie im Portal.

- [ ] **Step 4: Admin-Seite**

`src/app/m/qr/admin/page.tsx`:

```tsx
import { moduleAdminPageOrNotFound } from "@/core/auth/guards";
import { listPresets } from "@/app/m/qr/_lib/presets";
import { PresetForm } from "@/app/m/qr/admin/preset-form";
import { deletePresetAction } from "@/app/m/qr/actions";

export default async function QrAdminPage() {
  // 404 statt 403: ein 403 verriete, dass es diese Route gibt.
  await moduleAdminPageOrNotFound("qr");
  const presets = await listPresets();

  return (
    <div className="flex flex-col gap-8" data-testid="qr-admin">
      <h1 className="text-xl font-bold">Presets verwalten</h1>
      <ul className="flex flex-col gap-2">
        {presets.map((p) => (
          <li key={p.id} className="flex items-center justify-between rounded border p-2">
            <span>
              {p.icon} {p.label} <code className="text-[var(--color-stahl)]">{p.id}</code>
            </span>
            <form action={deletePresetAction}>
              <input type="hidden" name="id" value={p.id} />
              <button type="submit" className="min-h-[var(--tap)] px-3">
                Löschen
              </button>
            </form>
          </li>
        ))}
      </ul>
      <PresetForm />
    </div>
  );
}
```

`src/app/m/qr/admin/preset-form.tsx`: Formular mit `label`, `icon`, `kind` (Select) und kind-abhängigen Feldern; beim Absenden wird `value` für wifi/vcard als JSON in ein Hidden-Field geschrieben. `action={createPresetAction}`.

> Beim **Bearbeiten** bleibt `kind` gesperrt — wie in easy-qr, weil ein Wechsel den `value` bedeutungslos machen würde.

- [ ] **Step 5: Tests und Gates**

Run: `pnpm exec vitest run src/app/m/qr && pnpm typecheck && pnpm lint`
Expected: PASS, 6 Autorisierungstests grün

- [ ] **Step 6: Falsifizieren**

Entferne testweise `await requireModuleAdmin("qr")` aus `deletePresetAction`.
Run: `pnpm exec vitest run src/app/m/qr/actions.test.ts`
Expected: FAIL bei den Nicht-Admin-Fällen. Danach zurückändern und erneut laufen lassen — grün.

- [ ] **Step 7: Commit**

```bash
git add src/app/m/qr
git commit -m "feat(qr): Admin-Bereich mit geteilten core-Guards (drk-qr-admin)"
```

---

## Task 12: PWA

**Files:**
- Create: `src/app/m/qr/manifest.webmanifest/route.ts`, `sw.js/route.ts`, `pwa-icon.svg/route.ts`, `RegisterSW.tsx`
- Modify: `src/app/m/qr/layout.tsx`, `playwright.pwa.config.ts`

**Interfaces:**
- Produces: `/manifest.webmanifest`, `/sw.js`, `/pwa-icon.svg` auf dem QR-Host

> Muster und Begründung: `docs/spikes/2026-07-19-qr-offline-pwa.md`. Die drei Route Handler liegen **unter dem Modul**, nicht in `public/` — `public/` würde auf allen Hosts ausgeliefert.

- [ ] **Step 1: Die drei Route Handler und RegisterSW**

Aus `src/app/m/beta/` übernehmen, dabei ersetzen: Modul-Key `beta` → `qr`, Titel → „QR-Codes", Cache-Name → `qr-pwa-v1`.

- [ ] **Step 2: Admin-Bereich aus dem Cache ausschließen**

⚠️ **Der Spike-SW ist network-first auf Navigationen und cached die Antwort.** In `beta` egal, hier nicht: so landete die authentifizierte Admin-Seite im Cache und wäre nach dem Logout noch abrufbar. Im `fetch`-Handler von `sw.js/route.ts` vor dem Navigations-Zweig einfügen:

```js
  // Alles Authentifizierte und alle Mutationen bleiben ungecacht — sonst wäre
  // die Admin-Seite nach dem Logout weiter aus dem Cache abrufbar.
  if (url.pathname.startsWith("/admin") || url.pathname.startsWith("/api/")) {
    event.respondWith(fetch(req));
    return;
  }
```

- [ ] **Step 3: Layout ergänzen**

```tsx
export const metadata: Metadata = { manifest: "/manifest.webmanifest" };
```
und `<RegisterSW />` als erstes Kind in der Shell.

- [ ] **Step 4: PWA-Config erweitern**

In `playwright.pwa.config.ts` das `ORIGINS`-Array um `http://qr.localtest.me:3101` ergänzen.

- [ ] **Step 5: Commit**

```bash
git add src/app/m/qr playwright.pwa.config.ts
git commit -m "feat(qr): domain-scoped PWA, Admin-Bereich vom Caching ausgenommen"
```

---

## Task 13: E2E

**Files:**
- Create: `e2e/qr.spec.ts`, `e2e/helpers/decode-qr.ts`
- Modify: `package.json` (devDependencies `jsqr`, `sharp`)

> Das Dekodier-Muster stammt aus `easy-qr/tests/e2e/helpers/decode-qr.ts` und ist der Grund, warum diese Tests etwas wert sind: sie prüfen nicht, ob ein `<svg>` da ist, sondern **lesen den QR-Code zurück**.

- [ ] **Step 1: Abhängigkeiten**

```bash
pnpm add -D jsqr sharp
```

- [ ] **Step 2: Dekodier-Helfer**

`e2e/helpers/decode-qr.ts`: SVG-String → `sharp(Buffer.from(svg)).resize(512,512).raw()` → `jsqr(data, 512, 512)` → dekodierter Text.

- [ ] **Step 3: Tests schreiben**

`e2e/qr.spec.ts`:

```ts
import { test, expect } from "@playwright/test";
import { devLogin } from "./fixtures";
import { decodeQr } from "./helpers/decode-qr";

const QR = "http://qr.localtest.me:3100";

test("anonym: URL eingeben erzeugt einen lesbaren QR-Code", async ({ page }) => {
  await page.goto(`${QR}/`);
  await page.getByLabel("Link oder Text").fill("https://drk.de");
  await page.getByRole("button", { name: /erzeugen/i }).click();
  const svg = await page.getByTestId("qr-display").innerHTML();
  expect(await decodeQr(svg)).toBe("https://drk.de");
});

test("anonym: WLAN-Formular erzeugt den korrekten WIFI:-String", async ({ page }) => {
  await page.goto(`${QR}/wifi`);
  await page.getByLabel("SSID").fill("DRK-Test");
  await page.getByLabel("Passwort").fill("geheim");
  await page.getByRole("button", { name: /erzeugen/i }).click();
  const svg = await page.getByTestId("qr-display").innerHTML();
  expect(await decodeQr(svg)).toBe("WIFI:T:WPA;S:DRK-Test;P:geheim;H:false;;");
});

test("anonym sieht keine Presets, sondern den Anmelde-Hinweis", async ({ page }) => {
  await page.goto(`${QR}/`);
  await expect(page.getByTestId("qr-login-hint")).toBeVisible();
  await expect(page.getByTestId("preset-grid")).toHaveCount(0);
});

test("eingeloggt sieht das Preset-Grid mit dem Seed-Preset", async ({ page }) => {
  await devLogin(page, { host: "qr.localtest.me", groups: "" });
  await page.goto(`${QR}/`);
  await expect(page.getByTestId("preset-grid")).toBeVisible();
  await expect(page.getByText("Beispiel-Link")).toBeVisible();
});

test("Admin-Route ist ohne die Gruppe nicht vorhanden (404, nicht 403)", async ({ page }) => {
  await devLogin(page, { host: "qr.localtest.me", groups: "drk-qr-user" });
  const res = await page.goto(`${QR}/admin`);
  expect(res?.status()).toBe(404);
});

test("drk-qr-admin kann ein Preset anlegen", async ({ page }) => {
  await devLogin(page, { host: "qr.localtest.me", groups: "drk-qr-admin", callbackPath: "/admin" });
  await expect(page.getByTestId("qr-admin")).toBeVisible();
  await page.getByLabel("label").fill("Neues Preset");
  await page.getByLabel("value").fill("https://neu.example");
  await page.getByRole("button", { name: /anlegen/i }).click();
  await expect(page.getByText("Neues Preset")).toBeVisible();
});

test("der QR-URL-Vertrag funktioniert direkt", async ({ page }) => {
  // Dieser Link-Aufbau ist im Umlauf (gebookmarkt, geteilt) — er muss halten.
  await page.goto(`${QR}/qr?data=${encodeURIComponent("https://drk.de")}&label=Test&kind=url`);
  const svg = await page.getByTestId("qr-display").innerHTML();
  expect(await decodeQr(svg)).toBe("https://drk.de");
});
```

- [ ] **Step 4: Offline-Test in der PWA-Suite**

In `e2e/pwa-spike.spec.ts` (oder einer neuen `e2e/qr-pwa.spec.ts`, die von `playwright.pwa.config.ts` erfasst wird) ergänzen — **gegen den Prod-Build**, und mit echter Interaktion, nicht nur „Seite lädt":

```ts
test("QR-Erzeugung funktioniert offline", async ({ page, context }) => {
  await page.goto("http://qr.localtest.me:3101/");
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload();

  await context.setOffline(true);
  await page.reload();
  await page.getByLabel("Link oder Text").fill("https://offline.example");
  await page.getByRole("button", { name: /erzeugen/i }).click();
  await expect(page.getByTestId("qr-display")).toBeVisible();
  await context.setOffline(false);
});

test("Admin-Seite landet nicht im SW-Cache", async ({ page, context }) => {
  await page.goto("http://qr.localtest.me:3101/");
  await page.evaluate(() => navigator.serviceWorker.ready);
  const cached = await page.evaluate(async () => {
    const cache = await caches.open("qr-pwa-v1");
    return (await cache.keys()).map((r) => new URL(r.url).pathname);
  });
  expect(cached.some((p) => p.startsWith("/admin"))).toBe(false);
});
```

- [ ] **Step 5: Alle Gates**

Run: `pnpm typecheck && pnpm lint && pnpm test && pnpm e2e && pnpm e2e:pwa`
Expected: alles grün

- [ ] **Step 6: Commit**

```bash
git add e2e package.json pnpm-lock.yaml
git commit -m "feat(qr): E2E mit echter QR-Dekodierung, Offline-Interaktion und Cache-Prüfung"
```

---

## Danach: was noch offen bleibt

Dieser Plan endet bei einem lokal vollständig funktionierenden Modul. **Nicht enthalten** und Gegenstand eines Folgeplans:

- **Import** der bestehenden `easy-qr`-SQLite nach `qr.db` mit Paritätscheck, nach dem Muster `scripts/import/portal.ts`. Zu beachten laut Analyse: `value` ist doppelt JSON-kodiert, Zeitstempel sind Millisekunden, IDs sind Slugs und müssen 1:1 bleiben; `users`/`sessions` wandern **nicht** mit.
- **Cutover**: `SUITE_HOST_QR` und `SUITE_TRAEFIK_RULE` in die `.env`, alten Stack vom Router nehmen, dann verifizieren, dass unter der Domain wirklich `qr` antwortet (Runbook `suite-update-webfinger.md`, Teil C).
- **Rückbau der Wegwerf-Module** (alpha/beta/gamma/kioskdemo), sobald `qr` deren Rolle in den Keystone-E2E übernimmt. Damit erledigt sich auch der kosmetische Manifest-Fund vom 19.07.2026.
