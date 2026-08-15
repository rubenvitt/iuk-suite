# Profilseite und Sitzungswiderruf — Umsetzungsplan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eine Profilseite im Portal, die zeigt, als wer man der Suite gilt, und
auf der ein Knopf alle eigenen Sitzungen dieser Suite sofort ungültig macht.

**Architecture:** Weil die Suite `strategy: "jwt"` fährt, gibt es keine
Sitzungstabelle. Statt Sitzungen aufzuzählen, zieht eine **Widerrufs-Epoche** pro
Person eine Grenze: der `jwt`-Callback stempelt bei der Anmeldung
`token.angemeldetSeit` und gibt bei jeder Anfrage `null` zurück, sobald die in
SQLite hinterlegte Epoche jünger ist. `null` löscht das Sitzungs-Cookie — der
Widerruf wirkt damit auf Proxy, RSC, Server Actions und API-Routen gleichermaßen.

**Tech Stack:** Next.js 16 (App Router, RSC) · Auth.js v5 (`@auth/core` 0.41.3) ·
Drizzle + better-sqlite3 · Ant Design 6 · Vitest + Playwright

**Spec:** `docs/superpowers/specs/2026-08-14-konto-profil-design.md`

## Global Constraints

- **Zeiteinheiten:** `angemeldetSeit` und `widerrufen_ab` sind Unix-**Sekunden**
  (JWT-Konvention). `aktualisiert_am` ist epoch **Millisekunden** (Konvention der
  übrigen Module). Nie über die Einheitengrenze vergleichen.
- **Widerruf ist strikt:** ungültig genau dann, wenn `angemeldetSeit <
  widerrufen_ab`. Gleichstand gilt als **gültig**.
- **Fehlt `angemeldetSeit`, gilt `0`** — mit Epoche also widerrufen (fail closed).
- **Kein Zwischenspeicher** vor dem SQLite-Lesevorgang im `jwt`-Callback.
- **Der `sub` kommt immer aus `auth()`**, nie aus einem Formularfeld oder
  URL-Parameter (IDOR).
- **Server Components:** kein Compound-Zugriff auf antd (`Descriptions.Item`,
  `Typography.Title`, …) und **kein** `@ant-design/icons` — beides ist HTTP 500,
  das kein Gate findet (Fallen 1 und 7, `docs/design/README.md`).
- **Farbe:** `colorError === colorPrimary === #c8000f`. Der Widerrufsknopf ist
  `danger` mit `type="default"`, nie `type="primary"` (Falle 3).
- **Bediendichte:** kein `size` auf Bedienelementen setzen (Falle 4).
- Deutsche Bezeichner in neuem Code, wie im umgebenden `core`.

---

### Task 1: Widerrufsspeicher `core/konto`

**Files:**
- Create: `src/core/konto/_db/schema.ts`
- Create: `src/core/konto/_db/client.ts`
- Create: `src/core/konto/_db/drizzle.config.ts`
- Create: `src/core/konto/_db/migrations/` (generiert)
- Create: `src/core/konto/widerruf.ts`
- Create: `src/core/konto/widerruf.test.ts`
- Modify: `src/core/bootstrap.ts` (neue Liste `CORE_MIGRATIONS`, `migrateAllModules`)
- Modify: `src/core/bootstrap.test.ts` (Dreieck-Tests über beide Listen)
- Modify: `Dockerfile` (COPY-Zeile nach Zeile 55)

**Interfaces:**
- Consumes: `getModuleDb`, `moduleDbPath` aus `@/core/db`
- Produces:
  - `istWiderrufen(sub: string | undefined, angemeldetSeit: number | undefined): boolean`
  - `widerrufeAlleSitzungen(sub: string, jetztSekunden?: number): void`
  - `CORE_MIGRATIONS: { key: string; migrationsFolder: string }[]`

- [ ] **Step 1: Schema, Client und drizzle-Konfiguration anlegen**

`src/core/konto/_db/schema.ts`:

```ts
import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";

/**
 * DIE WIDERRUFS-EPOCHE — eine Zeile je Person, und sie entsteht erst beim
 * ersten Widerruf. Keine Zeile heisst „nichts widerrufen", nicht „unbekannt".
 *
 * Die Tabelle liegt in `core` und nicht im Portal, weil die Frage suiteweit
 * ist: `core/auth` muss sie beantworten koennen, ohne in die Interna eines
 * Moduls zu greifen (dieselbe Begruendung wie bei `core/directory`).
 */
export const sitzungWiderruf = sqliteTable("sitzung_widerruf", {
  // Der OIDC-`sub` aus dem ID-Token; beim Dev-Login `dev:<email>`.
  sub: text("sub").primaryKey(),
  // Unix-SEKUNDEN, nicht Millisekunden: verglichen wird gegen
  // `token.angemeldetSeit`, und JWT-Zeitangaben sind Sekunden. Eine
  // Millisekunden-Zahl hier wuerde jede Sitzung widerrufen, ohne dass ein Typ
  // etwas merkt.
  widerrufenAb: integer("widerrufen_ab").notNull(),
  // Epoch MILLISEKUNDEN, wie `created_at`/`updated_at` in den Modulen. Rein
  // fuer die Nachschau — nie fuer den Vergleich.
  aktualisiertAm: integer("aktualisiert_am", { mode: "timestamp_ms" }).notNull(),
});

export type SitzungWiderrufRow = typeof sitzungWiderruf.$inferSelect;
```

`src/core/konto/_db/client.ts`:

```ts
import { getModuleDb } from "@/core/db";
import * as schema from "./schema";

export const getDb = () => getModuleDb("konto", schema);
```

`src/core/konto/_db/drizzle.config.ts`:

```ts
import type { Config } from "drizzle-kit";

// Pfade sind repo-root-relativ (drizzle-kit löst sie gegen cwd auf), nicht
// relativ zu dieser Datei.
export default {
  schema: "./src/core/konto/_db/schema.ts",
  out: "./src/core/konto/_db/migrations",
  dialect: "sqlite",
  dbCredentials: { url: "./.data/konto.db" },
} satisfies Config;
```

- [ ] **Step 2: Migration erzeugen**

Run: `pnpm exec drizzle-kit generate --config=src/core/konto/_db/drizzle.config.ts`
Expected: eine `.sql`-Datei unter `src/core/konto/_db/migrations/` und ein
`meta/_journal.json`. Die erzeugte SQL kurz lesen: sie muss
`CREATE TABLE \`sitzung_widerruf\`` mit `sub` als PRIMARY KEY enthalten.

- [ ] **Step 3: `CORE_MIGRATIONS` in `bootstrap.ts` ergänzen**

In `src/core/bootstrap.ts` direkt nach `MODULE_MIGRATIONS` einfügen:

```ts
/**
 * Datenbanken, die `core` selbst führt — nicht ein Modul.
 *
 * WARUM EINE ZWEITE LISTE UND KEIN EINTRAG IN `MODULE_MIGRATIONS`:
 * `scripts/seed-lokal.test.ts` verlangt für JEDEN Eintrag dort einen lokalen
 * Seed. Für eine Widerrufstabelle gibt es keinen sinnvollen — eine geseedete
 * Zeile sperrte den Dev-Nutzer aus. Statt die Zusage „jedes Modul mit eigener
 * Datenbank hat einen Seed" aufzuweichen, bekommt `core` eine eigene Liste.
 *
 * Das Dreieck gilt trotzdem: Migrationsordner, Eintrag hier, COPY-Zeile im
 * Dockerfile. `bootstrap.test.ts` prüft beide Listen.
 */
export const CORE_MIGRATIONS: { key: string; migrationsFolder: string }[] = [
  { key: "konto", migrationsFolder: "src/core/konto/_db/migrations" },
];
```

Und `migrateAllModules()` über beide laufen lassen:

```ts
export function migrateAllModules(): void {
  for (const m of [...MODULE_MIGRATIONS, ...CORE_MIGRATIONS]) {
    const sqlite = openModuleDatabase(moduleDbPath(m.key));
    migrate(drizzle(sqlite), { migrationsFolder: m.migrationsFolder });
    sqlite.close();
  }
}
```

- [ ] **Step 4: Dreieck-Tests auf beide Listen erweitern**

In `src/core/bootstrap.test.ts` den Import um `CORE_MIGRATIONS` ergänzen und die
beiden letzten Tests des Blocks „Modul-Registrierung ist vollständig" über
`ALLE_MIGRATIONEN` laufen lassen. Oberhalb von `describe` einfügen:

```ts
// Beide Listen: das Dreieck (Ordner, Eintrag, COPY) gilt fuer eine core-DB
// genauso. Ohne diese Zeile fiele die COPY-Zeile fuer `konto` lautlos unter den
// Tisch und das Prod-Image braeche erst beim Boot.
const ALLE_MIGRATIONEN = [...MODULE_MIGRATIONS, ...CORE_MIGRATIONS];
```

Dann in `it("jeder Migrations-Ordner existiert und hat ein Journal")` und
`it("jeder Migrations-Ordner wird ins Prod-Image kopiert")` jeweils
`for (const m of MODULE_MIGRATIONS)` durch `for (const m of ALLE_MIGRATIONEN)`
ersetzen. Der erste Test („jedes Modul mit `_db/` steht in MODULE_MIGRATIONS")
bleibt unverändert — er scannt `src/app/m` und geht core nichts an.

- [ ] **Step 5: COPY-Zeile im Dockerfile**

Nach Zeile 55 (`… lagerbuch/_db/migrations`) einfügen:

```dockerfile
COPY --from=builder --chown=nextjs:nodejs /app/src/core/konto/_db/migrations ./src/core/konto/_db/migrations
```

- [ ] **Step 6: Den fehlschlagenden Test schreiben**

`src/core/konto/widerruf.test.ts`:

```ts
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { rmSync } from "node:fs";
import { migrateAllModules } from "@/core/bootstrap";
import { istWiderrufen, widerrufeAlleSitzungen } from "@/core/konto/widerruf";

const TEST_DATA_DIR = "./.data/konto-widerruf-test";

// Wie in `qr/_db/migrations.test.ts`: aufraeumen und migrieren gehoert in
// beforeAll, weil `getModuleDb` die Verbindung global cacht — ein Loeschen
// zwischen den Tests liesze sie auf eine geloeschte Datei zeigen. Deshalb je
// Test ein eigener `sub`.
beforeAll(() => {
  rmSync(TEST_DATA_DIR, { recursive: true, force: true });
  process.env.DATA_DIR = TEST_DATA_DIR;
  migrateAllModules();
});

afterAll(() => {
  rmSync(TEST_DATA_DIR, { recursive: true, force: true });
});

describe("Widerrufs-Epoche", () => {
  it("ohne Zeile ist nichts widerrufen", () => {
    expect(istWiderrufen("sub-unbekannt", 1_000)).toBe(false);
  });

  it("widerruft, was vor der Epoche angemeldet wurde", () => {
    widerrufeAlleSitzungen("sub-alt", 5_000);
    expect(istWiderrufen("sub-alt", 4_999)).toBe(true);
  });

  it("laesst gelten, was nach der Epoche angemeldet wurde", () => {
    widerrufeAlleSitzungen("sub-neu", 5_000);
    expect(istWiderrufen("sub-neu", 5_001)).toBe(false);
  });

  /*
   * DER GRENZFALL, UND WARUM ER SO HERUM ENTSCHIEDEN IST.
   *
   * Wer den Knopf drueckt, meldet sich unmittelbar danach neu an — in
   * derselben Sekunde, wenn es schnell geht. Wuerde Gleichstand als
   * widerrufen gelten, waere die frische Anmeldung sofort wieder tot und die
   * Person kaeme in eine Schleife. Der Preis ist ein Fenster von unter einer
   * Sekunde, in dem eine alte Sitzung ueberlebt.
   */
  it("laesst Gleichstand gelten", () => {
    widerrufeAlleSitzungen("sub-gleich", 5_000);
    expect(istWiderrufen("sub-gleich", 5_000)).toBe(false);
  });

  it("ohne angemeldetSeit gilt 0 — mit Epoche also widerrufen", () => {
    widerrufeAlleSitzungen("sub-ohne", 5_000);
    expect(istWiderrufen("sub-ohne", undefined)).toBe(true);
  });

  it("ohne sub wird nichts widerrufen", () => {
    expect(istWiderrufen(undefined, 1)).toBe(false);
  });

  it("ein zweiter Widerruf schiebt die Grenze weiter", () => {
    widerrufeAlleSitzungen("sub-zweimal", 5_000);
    widerrufeAlleSitzungen("sub-zweimal", 9_000);
    expect(istWiderrufen("sub-zweimal", 6_000)).toBe(true);
  });

  it("nimmt ohne Zeitangabe die Gegenwart", () => {
    const vorher = Math.floor(Date.now() / 1000);
    widerrufeAlleSitzungen("sub-jetzt");
    expect(istWiderrufen("sub-jetzt", vorher - 1)).toBe(true);
    expect(istWiderrufen("sub-jetzt", vorher + 60)).toBe(false);
  });
});
```

- [ ] **Step 7: Test laufen lassen, Fehlschlag prüfen**

Run: `pnpm vitest run src/core/konto/widerruf.test.ts`
Expected: FAIL — `Failed to resolve import "@/core/konto/widerruf"`.

- [ ] **Step 8: `widerruf.ts` schreiben**

```ts
import { eq } from "drizzle-orm";

import { getDb } from "@/core/konto/_db/client";
import { sitzungWiderruf } from "@/core/konto/_db/schema";

/**
 * „Ist diese Sitzung widerrufen?" — die Frage, die der `jwt`-Callback bei JEDER
 * Anfrage stellt.
 *
 * Ein `SELECT` ueber den Primaerschluessel, better-sqlite3, synchron: im
 * einstelligen Mikrosekundenbereich. BEWUSST OHNE ZWISCHENSPEICHER — er braechte
 * hier nichts Messbares und traete die Zusage „gilt sofort" wieder los, sobald
 * es je einen zweiten Prozess gibt.
 *
 * Ohne `sub` gibt es nichts zu vergleichen: dann `false`. Fail-closed waere hier
 * falsch — es wuerde jede Sitzung ohne Kennung abschieszen, statt die eine
 * widerrufene zu treffen.
 */
export function istWiderrufen(
  sub: string | undefined,
  angemeldetSeit: number | undefined,
): boolean {
  if (!sub) return false;

  const zeile = getDb()
    .select({ widerrufenAb: sitzungWiderruf.widerrufenAb })
    .from(sitzungWiderruf)
    .where(eq(sitzungWiderruf.sub, sub))
    .get();

  if (!zeile) return false;

  // Fehlendes `angemeldetSeit` gilt als 0 — Bestandstokens tragen das Feld
  // nicht und sind nach einem Widerruf tot. Gleichstand gilt als gueltig, siehe
  // den Grenzfall in `widerruf.test.ts`.
  return (angemeldetSeit ?? 0) < zeile.widerrufenAb;
}

/**
 * Zieht die Grenze neu. `jetztSekunden` ist nur fuer Tests da; im Betrieb
 * gewinnt immer die Gegenwart.
 */
export function widerrufeAlleSitzungen(sub: string, jetztSekunden?: number): void {
  const ab = jetztSekunden ?? Math.floor(Date.now() / 1000);
  getDb()
    .insert(sitzungWiderruf)
    .values({ sub, widerrufenAb: ab, aktualisiertAm: new Date() })
    .onConflictDoUpdate({
      target: sitzungWiderruf.sub,
      set: { widerrufenAb: ab, aktualisiertAm: new Date() },
    })
    .run();
}
```

- [ ] **Step 9: Tests laufen lassen**

Run: `pnpm vitest run src/core/konto/widerruf.test.ts src/core/bootstrap.test.ts scripts/seed-lokal.test.ts`
Expected: PASS. Läuft `seed-lokal.test.ts` rot, ist `konto` versehentlich in
`MODULE_MIGRATIONS` gelandet statt in `CORE_MIGRATIONS`.

- [ ] **Step 10: Commit**

```bash
git add src/core/konto src/core/bootstrap.ts src/core/bootstrap.test.ts Dockerfile
git commit -m "Widerrufs-Epoche als eigene core-Datenbank"
```

---

### Task 2: Der `jwt`-Callback verwirft widerrufene Tokens

**Files:**
- Modify: `src/types/next-auth.d.ts`
- Modify: `src/core/auth/config.ts:105-160` (Callback `jwt`, Callback `session`)
- Modify: `src/core/auth/config.test.ts`

**Interfaces:**
- Consumes: `istWiderrufen` aus Task 1
- Produces: `token.angemeldetSeit?: number`, `session.angemeldetSeit?: number`

- [ ] **Step 1: Typen erweitern**

In `src/types/next-auth.d.ts` im `Session`-Interface neben `error?: string`:

```ts
    /**
     * Unix-SEKUNDEN der Anmeldung, aus `token.angemeldetSeit`. Die Profilseite
     * zeigt sie als „angemeldet seit".
     */
    angemeldetSeit?: number;
```

Und im `JWT`-Interface:

```ts
    /**
     * Unix-SEKUNDEN der Anmeldung. Grundlage des Sitzungswiderrufs
     * (`core/konto/widerruf.ts`).
     *
     * NICHT durch `iat` ersetzbar, auch wenn das dasselbe zu sein scheint:
     * Auth.js signiert das Token bei JEDER Antwort neu
     * (`@auth/core/lib/actions/session.js:40`) und setzt `iat` dabei auf die
     * Gegenwart. Ein Widerruf waere nach genau einer Anfrage wieder ueberholt —
     * und kein Gate sieht das, weil in einem Unit-Test niemand ein zweites Mal
     * encodiert.
     */
    angemeldetSeit?: number;
```

- [ ] **Step 2: Die fehlschlagenden Tests schreiben**

An `src/core/auth/config.test.ts` anhängen. Der Widerrufsspeicher wird gemockt —
dieser Test gehört dem Callback, nicht SQLite (dafür gibt es Task 1):

```ts
/**
 * DER SITZUNGSWIDERRUF AM CALLBACK.
 *
 * Gemockt wird `core/konto/widerruf`, nicht die Datenbank: hier zaehlt allein,
 * WAS der Callback aus einer Antwort macht. Dass die Epoche richtig gelesen
 * wird, besitzt `core/konto/widerruf.test.ts`.
 */
describe("authConfig — Sitzungswiderruf", () => {
  beforeEach(() => {
    widerrufenMock.mockReset();
    widerrufenMock.mockReturnValue(false);
  });

  it("stempelt den Anmeldezeitpunkt bei der Anmeldung", async () => {
    const vorher = Math.floor(Date.now() / 1000);
    const token = await jwtCallback(anfrage)({
      token: { sub: "s-1" },
      account: { provider: "pocket-id", type: "oidc", providerAccountId: "s-1" },
    } as never);
    expect(token).not.toBeNull();
    expect((token as { angemeldetSeit?: number }).angemeldetSeit).toBeGreaterThanOrEqual(vorher);
  });

  it("schreibt den Anmeldezeitpunkt bei Folgeaufrufen NICHT neu", async () => {
    // Der Kern des Ganzen: wuerde der Stempel bei jedem Aufruf neu gesetzt,
    // waere jeder Widerruf nach einer Anfrage wirkungslos.
    const token = await jwtCallback(anfrage)({
      token: { sub: "s-2", angemeldetSeit: 1_000 },
    } as never);
    expect((token as { angemeldetSeit?: number }).angemeldetSeit).toBe(1_000);
  });

  it("gibt null zurueck, wenn die Sitzung widerrufen ist", async () => {
    widerrufenMock.mockReturnValue(true);
    const token = await jwtCallback(anfrage)({
      token: { sub: "s-3", angemeldetSeit: 1_000 },
    } as never);
    expect(token).toBeNull();
  });

  it("fragt den Widerruf mit sub und Anmeldezeitpunkt", async () => {
    await jwtCallback(anfrage)({ token: { sub: "s-4", angemeldetSeit: 1_000 } } as never);
    expect(widerrufenMock).toHaveBeenCalledWith("s-4", 1_000);
  });

  it("frischt ein widerrufenes Token gar nicht erst auf", async () => {
    /*
     * Reihenfolge ist hier Sicherheit, nicht Sparsamkeit: `tokenAuffrischen`
     * rotiert bei Pocket ID das Refresh-Token. Fuer eine Sitzung, die gerade
     * stirbt, waere das ein verschenkter Umlauf — und im schlimmsten Fall eine
     * Rotation, deren Ergebnis niemand mehr entgegennimmt.
     */
    widerrufenMock.mockReturnValue(true);
    await jwtCallback(anfrage)({ token: { sub: "s-5", angemeldetSeit: 1 } } as never);
    expect(auffrischenMock).not.toHaveBeenCalled();
  });
});
```

Dazu **oben** in der Datei, zu den bestehenden `vi.hoisted`/`vi.mock`-Zeilen:

```ts
const { widerrufenMock } = vi.hoisted(() => ({ widerrufenMock: vi.fn() }));
vi.mock("@/core/konto/widerruf", () => ({ istWiderrufen: widerrufenMock }));
```

- [ ] **Step 3: Tests laufen lassen, Fehlschlag prüfen**

Run: `pnpm vitest run src/core/auth/config.test.ts`
Expected: FAIL — `angemeldetSeit` ist `undefined`, `token` ist nie `null`.

- [ ] **Step 4: Den Callback ändern**

In `src/core/auth/config.ts` den Import ergänzen:

```ts
import { istWiderrufen } from "@/core/konto/widerruf";
```

Im `jwt`-Callback direkt **nach** dem `if (account) { … }`-Block einfügen:

```ts
        /*
         * DER ANMELDEZEITPUNKT — nur bei der Anmeldung, nie danach.
         *
         * Dieselbe Bedingung wie beim `sub` weiter unten: `account` bzw. `user`
         * liegen ausschliesslich beim Anmelden an. Jeder spaetere Aufruf traegt
         * den Wert unveraendert weiter, `tokenAuffrischen` fasst ihn nicht an.
         *
         * Warum nicht `token.iat`: siehe `src/types/next-auth.d.ts`. Kurz —
         * Auth.js setzt `iat` bei jeder Antwort neu, der Widerruf waere nach
         * einer Anfrage ueberholt, und kein Gate sieht es.
         */
        if (account || user) {
          token.angemeldetSeit = Math.floor(Date.now() / 1000);
        }
```

Und unmittelbar **vor** dem abschließenden `return tokenAuffrischen(…)`:

```ts
        /*
         * DER SITZUNGSWIDERRUF. `null` ist der von Auth.js vorgesehene Weg
         * (`@auth/core/index.d.ts:331` — `Awaitable<JWT | null>`), und er wirkt
         * serverseitig: `lib/actions/session.js:34-51` loescht bei `null` das
         * Sitzungs-Cookie, statt es neu zu setzen. Damit ist die Sitzung auf
         * ALLEN Wegen tot — Proxy, RSC, Server Action, API-Route.
         *
         * Ein `token.error` waere nur ein Hinweis an den Browser. Schlimmer:
         * `components/providers.tsx` beantwortet `RefreshTokenError` mit einem
         * STILLEN Neu-Login; diesen Weg wiederzuverwenden hiesze, die
         * widerrufene Person sofort wieder anzumelden.
         *
         * VOR `tokenAuffrischen`, nicht danach: fuer eine sterbende Sitzung das
         * Refresh-Token bei Pocket ID zu rotieren, bringt niemandem etwas.
         */
        if (istWiderrufen(token.sub, token.angemeldetSeit)) return null;

        return tokenAuffrischen(token, { darfSchreiben: request !== undefined });
```

Im `session`-Callback vor dem `return session;` ergänzen:

```ts
        if (typeof token.angemeldetSeit === "number") {
          session.angemeldetSeit = token.angemeldetSeit;
        }
```

- [ ] **Step 5: Tests laufen lassen**

Run: `pnpm vitest run src/core/auth/config.test.ts src/proxy.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/core/auth/config.ts src/core/auth/config.test.ts src/types/next-auth.d.ts
git commit -m "jwt-Callback verwirft widerrufene Sitzungen"
```

---

### Task 3: Der Proxy-Pfad trägt SQLite — echter Abruf

Das Risiko aus der Spec, und es wird **vor** der Oberfläche ausgeräumt: Next 16
fährt `proxy.ts` auf der Node-Laufzeit, aber das native `better-sqlite3` muss
auch tatsächlich ankommen. Kein Unit-Test kann das zeigen.

**Files:** keine — dieser Task ist eine Messung.

- [ ] **Step 1: Sicherstellen, dass kein fremder Dev-Server läuft**

Run: `pgrep -fl "next dev"`
Läuft einer, zuerst `ps -eo pid,ppid,lstart,command | grep "playwright test"` lesen:
hängt er an einem **laufenden** Playwright-Prozess, gehört er einer fremden
Sitzung — dann nicht beenden, sondern warten.

- [ ] **Step 2: Einen Playwright-Wegwerf-Test schreiben**

`e2e/konto-widerruf.spec.ts` (wächst in Task 6 weiter, hier nur die Naht):

```ts
import { test, expect } from "@playwright/test";
import { devLogin } from "./fixtures";

test("die Sitzung ueberlebt eine Navigation — der Widerrufs-Lesevorgang im Proxy traegt", async ({
  page,
}) => {
  await devLogin(page, { host: "portal.localtest.me" });
  await page.goto("http://portal.localtest.me:3100/");
  await expect(page).not.toHaveURL(/\/login/);
  await expect(page.getByTestId("suite-header")).toBeVisible();
});
```

- [ ] **Step 3: Laufen lassen**

Run: `pnpm exec playwright test e2e/konto-widerruf.spec.ts`
Expected: PASS. Schlägt er mit einem Modul-Ladefehler zu `better-sqlite3` fehl,
gilt der in der Spec ausgeschriebene Rückfall — **und er wird gemeldet, nicht
still genommen.**

- [ ] **Step 4: Commit**

```bash
git add e2e/konto-widerruf.spec.ts
git commit -m "E2E: Widerrufs-Lesevorgang im Proxy traegt"
```

---

### Task 4: Server Action und Profilseite

**Files:**
- Create: `src/app/m/portal/profil/page.tsx`
- Create: `src/app/m/portal/profil/actions.ts`
- Create: `src/app/m/portal/profil/actions.test.ts`
- Create: `src/app/m/portal/_ui/ProfilAnsicht.tsx`
- Create: `src/app/m/portal/_ui/ProfilAnsicht.test.tsx`
- Create: `src/app/m/portal/profil/page.test.tsx`

**Interfaces:**
- Consumes: `widerrufeAlleSitzungen` (Task 1), `session.angemeldetSeit` (Task 2)
- Produces:
  - `alleSitzungenAbmelden(): Promise<void>` (Server Action)
  - `ProfilAnsicht({ name, email, kennung, gruppen, fachgruppen, angemeldetSeit, abmelden })`

- [ ] **Step 1: Den fehlschlagenden Test für die Action schreiben**

`src/app/m/portal/profil/actions.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

const { authMock, widerrufeMock } = vi.hoisted(() => ({
  authMock: vi.fn(),
  widerrufeMock: vi.fn(),
}));

vi.mock("@/core/auth", () => ({ auth: authMock }));
vi.mock("@/core/konto/widerruf", () => ({ widerrufeAlleSitzungen: widerrufeMock }));

import { alleSitzungenAbmelden } from "@/app/m/portal/profil/actions";

beforeEach(() => {
  authMock.mockReset();
  widerrufeMock.mockReset();
});

describe("alleSitzungenAbmelden", () => {
  it("widerruft fuer den sub aus der Sitzung", async () => {
    authMock.mockResolvedValue({ user: { id: "sub-42" } });
    await alleSitzungenAbmelden();
    expect(widerrufeMock).toHaveBeenCalledWith("sub-42");
  });

  it("schreibt ohne Sitzung nichts", async () => {
    /*
     * Der `sub` kommt aus `auth()` und NIE aus einem Parameter — sonst waere
     * der Knopf ein Werkzeug, mit dem man fremde Sitzungen abschieszt (IDOR).
     * Dass die Funktion gar keinen Parameter nimmt, ist der halbe Beweis;
     * dieser Test ist die andere Haelfte.
     */
    authMock.mockResolvedValue(null);
    await alleSitzungenAbmelden();
    expect(widerrufeMock).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Laufen lassen, Fehlschlag prüfen**

Run: `pnpm vitest run src/app/m/portal/profil/actions.test.ts`
Expected: FAIL — Modul nicht auflösbar.

- [ ] **Step 3: Die Action schreiben**

`src/app/m/portal/profil/actions.ts`:

```ts
"use server";

import { auth } from "@/core/auth";
import { widerrufeAlleSitzungen } from "@/core/konto/widerruf";

/**
 * Macht alle Sitzungen DIESER Suite fuer die angemeldete Person ungueltig.
 *
 * OHNE PARAMETER, und das ist die Zusage: der `sub` kommt aus `auth()`. Ein
 * entgegengenommener Parameter waere eine fremde Sitzung, die man abschieszen
 * kann — dieselbe Regel, die `assertGroupAccess` im Modul `feedback` durchsetzt.
 *
 * Das eigene Geraet meldet der Aufrufer danach selbst ab (`signOut` in
 * `ProfilAnsicht`): serverseitig ist die Sitzung zwar schon tot, aber der
 * Browser hielte sonst bis zur naechsten Anfrage ein Cookie, das nichts mehr
 * oeffnet — und die Sitzung beim Identitaetsanbieter liefe weiter.
 */
export async function alleSitzungenAbmelden(): Promise<void> {
  const session = await auth();
  const sub = session?.user?.id;
  if (!sub) return;
  widerrufeAlleSitzungen(sub);
}
```

- [ ] **Step 4: Laufen lassen**

Run: `pnpm vitest run src/app/m/portal/profil/actions.test.ts`
Expected: PASS.

- [ ] **Step 5: Den fehlschlagenden Test für die Client-Insel schreiben**

`src/app/m/portal/_ui/ProfilAnsicht.test.tsx`:

```tsx
// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";

const { signOutMock } = vi.hoisted(() => ({ signOutMock: vi.fn() }));
vi.mock("next-auth/react", () => ({ signOut: signOutMock }));

import { mount, unmount, query, exists, click, clickPortal } from "@/app/m/qr/_lib/test-dom";
import { ProfilAnsicht } from "@/app/m/portal/_ui/ProfilAnsicht";

const BASIS = {
  name: "Ruben Vitt",
  email: "ruben@example.org",
  kennung: "sub-42",
  gruppen: ["iuk"],
  fachgruppen: ["fuehrung"],
  angemeldetSeit: 1_755_000_000,
};

afterEach(async () => {
  await unmount();
  signOutMock.mockClear();
});

describe("ProfilAnsicht", () => {
  it("zeigt Name, E-Mail, Kennung, Gruppen und Fachgruppen", async () => {
    await mount(<ProfilAnsicht {...BASIS} abmelden={vi.fn()} />);
    const text = query("body").textContent ?? "";
    expect(text).toContain("Ruben Vitt");
    expect(text).toContain("ruben@example.org");
    expect(text).toContain("sub-42");
    expect(text).toContain("iuk");
    expect(text).toContain("fuehrung");
  });

  it("schreibt leere Mengen aus, statt eine Luecke zu lassen", async () => {
    // Eine leere Zeile liest sich wie ein Ladefehler. „Keine" ist eine Aussage.
    await mount(<ProfilAnsicht {...BASIS} gruppen={[]} fachgruppen={[]} abmelden={vi.fn()} />);
    expect(query('[data-testid="profil-gruppen"]').textContent).toContain("Keine");
  });

  it("meldet nicht ab, solange nicht bestaetigt wurde", async () => {
    const abmelden = vi.fn().mockResolvedValue(undefined);
    await mount(<ProfilAnsicht {...BASIS} abmelden={abmelden} />);
    await click('[data-testid="alle-abmelden"]');
    expect(abmelden).not.toHaveBeenCalled();
  });

  it("ruft nach der Bestaetigung die Action und danach signOut", async () => {
    const abmelden = vi.fn().mockResolvedValue(undefined);
    await mount(<ProfilAnsicht {...BASIS} abmelden={abmelden} />);
    await click('[data-testid="alle-abmelden"]');
    await clickPortal('[data-testid="alle-abmelden-ja"]');
    expect(abmelden).toHaveBeenCalledTimes(1);
    expect(signOutMock).toHaveBeenCalledWith({ callbackUrl: "/api/auth/oidc-signout" });
  });

  it("nennt die Grenze des Knopfes beim Namen", async () => {
    // „Beendet alle Sitzungen dieser Suite" — nicht „meldet dich ueberall ab".
    // Die Sitzung beim Identitaetsanbieter bleibt auf fremden Geraeten bestehen.
    await mount(<ProfilAnsicht {...BASIS} abmelden={vi.fn()} />);
    expect(query('[data-testid="alle-abmelden-hinweis"]').textContent).toContain(
      "Sitzungen dieser Suite",
    );
    expect(exists('[data-testid="alle-abmelden"]')).toBe(true);
  });
});
```

- [ ] **Step 6: Laufen lassen, Fehlschlag prüfen**

Run: `pnpm vitest run src/app/m/portal/_ui/ProfilAnsicht.test.tsx`
Expected: FAIL — Modul nicht auflösbar.

- [ ] **Step 7: Die Client-Insel schreiben**

`src/app/m/portal/_ui/ProfilAnsicht.tsx`:

```tsx
"use client";

import { useState } from "react";
import { Button, Card, Modal, Space, Tag, Typography } from "antd";
import { signOut } from "next-auth/react";

import { SPACE } from "@/core/theme/tokens";

const { Text } = Typography;

function Zeile({ titel, children }: { titel: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBlockEnd: SPACE.md }}>
      <Text type="secondary">{titel}</Text>
      <div>{children}</div>
    </div>
  );
}

function Etiketten({ werte }: { werte: string[] }) {
  if (werte.length === 0) return <Text>Keine</Text>;
  return (
    <Space size={4} wrap>
      {werte.map((w) => (
        <Tag key={w}>{w}</Tag>
      ))}
    </Space>
  );
}

/**
 * Die Client-Insel der Profilseite.
 *
 * WARUM UEBERHAUPT EINE INSEL: `Typography.Text` und `Space` sind
 * Compound-Zugriffe bzw. Kinder davon; in einer Server Component ergeben sie
 * `undefined` und HTTP 500 (Falle 1). Die Seite darueber holt nur die Sitzung.
 *
 * `abmelden` kommt als Prop herein statt hier importiert zu werden: eine Server
 * Action laesst sich so im Test durch eine Attrappe ersetzen, ohne den
 * `"use server"`-Rand mitzuziehen.
 */
export function ProfilAnsicht({
  name,
  email,
  kennung,
  gruppen,
  fachgruppen,
  angemeldetSeit,
  abmelden,
}: {
  name: string | null;
  email: string | null;
  kennung: string | null;
  gruppen: string[];
  fachgruppen: string[];
  angemeldetSeit: number | null;
  abmelden: () => Promise<void>;
}) {
  const [fragt, setFragt] = useState(false);
  const [laeuft, setLaeuft] = useState(false);

  async function bestaetigt() {
    setLaeuft(true);
    try {
      await abmelden();
      // Erst danach das eigene Geraet — sonst waere die Seite weg, bevor der
      // Widerruf geschrieben ist. Ueber `oidc-signout`, damit auch die Sitzung
      // beim Identitaetsanbieter endet (siehe die Begruendung in
      // `app/api/auth/oidc-signout/route.ts`).
      await signOut({ callbackUrl: "/api/auth/oidc-signout" });
    } finally {
      setLaeuft(false);
      setFragt(false);
    }
  }

  return (
    <Space direction="vertical" size="large" style={{ display: "flex" }}>
      <Card title="Angaben aus der Anmeldung">
        <Zeile titel="Name">{name ?? "Unbekannt"}</Zeile>
        <Zeile titel="E-Mail">{email ?? "Keine hinterlegt"}</Zeile>
        <Zeile titel="Gruppen">
          <span data-testid="profil-gruppen">
            <Etiketten werte={gruppen} />
          </span>
        </Zeile>
        <Zeile titel="Fachgruppen">
          <span data-testid="profil-fachgruppen">
            <Etiketten werte={fachgruppen} />
          </span>
        </Zeile>
        <Zeile titel="Kennung">
          <Text code>{kennung ?? "—"}</Text>
        </Zeile>
        <Zeile titel="Angemeldet seit">
          {angemeldetSeit
            ? new Date(angemeldetSeit * 1000).toLocaleString("de-DE")
            : "Unbekannt"}
        </Zeile>
        <Text type="secondary">
          Name, E-Mail und Gruppen werden zentral verwaltet und lassen sich hier nicht ändern.
        </Text>
      </Card>

      <Card title="Sitzungen">
        <p data-testid="alle-abmelden-hinweis">
          Beendet alle Sitzungen dieser Suite — auf diesem Gerät und auf allen anderen. Du
          musst dich danach überall neu anmelden.
        </p>
        {/*
         * `danger` OHNE `type="primary"`: in dieser Suite ist
         * `colorError === colorPrimary === #c8000f` (Falle 3). Eine rote Flaeche
         * laese sich hier als die empfohlene Handlung, statt als die
         * folgenschwere. Kein `size` — die Dichte kommt aus `FullShell`
         * (Falle 4).
         */}
        <Button danger data-testid="alle-abmelden" onClick={() => setFragt(true)}>
          Von allen Geräten abmelden
        </Button>
      </Card>

      <Modal
        open={fragt}
        title="Von allen Geräten abmelden?"
        onCancel={() => setFragt(false)}
        onOk={bestaetigt}
        confirmLoading={laeuft}
        okText="Ja, alle abmelden"
        cancelText="Abbrechen"
        okButtonProps={{ danger: true, "data-testid": "alle-abmelden-ja" }}
      >
        Alle bestehenden Sitzungen werden sofort ungültig. Das lässt sich nicht rückgängig
        machen.
      </Modal>
    </Space>
  );
}
```

Vor dem Schreiben `src/core/theme/tokens.ts` lesen und prüfen, dass `SPACE.md`
existiert; wenn nicht, die dort vorhandene Stufe verwenden.

- [ ] **Step 8: Laufen lassen**

Run: `pnpm vitest run src/app/m/portal/_ui/ProfilAnsicht.test.tsx`
Expected: PASS.

- [ ] **Step 9: Den fehlschlagenden Test für die Seite schreiben**

`src/app/m/portal/profil/page.test.tsx` — dieselbe leichte Bauform wie
`portal/page.test.tsx`: der Elementbaum wird verglichen, nicht gemountet.

```tsx
import { describe, it, expect, vi, beforeEach } from "vitest";
import { isValidElement, type ReactElement } from "react";

vi.mock("@/core/auth", () => ({ auth: vi.fn() }));

import { auth } from "@/core/auth";
import ProfilPage from "@/app/m/portal/profil/page";
import { ProfilAnsicht } from "@/app/m/portal/_ui/ProfilAnsicht";
import { Seitenkopf } from "@/core/shell/Seitenkopf";

const authMock = vi.mocked(auth);

function flatten(node: unknown, out: ReactElement[] = []): ReactElement[] {
  if (Array.isArray(node)) {
    for (const child of node) flatten(child, out);
    return out;
  }
  if (isValidElement(node)) {
    out.push(node);
    flatten((node.props as { children?: unknown }).children, out);
  }
  return out;
}

beforeEach(() => {
  authMock.mockReset();
});

describe("Profilseite", () => {
  it("reicht die Angaben der Sitzung an die Insel durch", async () => {
    authMock.mockResolvedValue({
      user: {
        id: "sub-42",
        name: "Ruben Vitt",
        email: "ruben@example.org",
        groups: ["iuk"],
        fachgruppen: ["fuehrung"],
        isAdmin: false,
      },
      angemeldetSeit: 1_755_000_000,
      expires: "",
    } as never);

    const baum = flatten(await ProfilPage());
    expect(baum.some((el) => el.type === Seitenkopf)).toBe(true);
    const insel = baum.find((el) => el.type === ProfilAnsicht);
    expect(insel).toBeDefined();
    expect(insel!.props).toMatchObject({
      name: "Ruben Vitt",
      email: "ruben@example.org",
      kennung: "sub-42",
      gruppen: ["iuk"],
      fachgruppen: ["fuehrung"],
      angemeldetSeit: 1_755_000_000,
    });
  });

  it("leitet ohne Sitzung auf den Login", async () => {
    // Die Seite haengt zwar hinter `decideRoute`, aber eine Seite, die sich auf
    // eine Sitzung verlaesst, muss ihr Fehlen selbst beantworten — sonst ist
    // der Ausfall ein Renderfehler statt einer Umleitung.
    authMock.mockResolvedValue(null);
    await expect(ProfilPage()).rejects.toThrow();
  });
});
```

- [ ] **Step 10: Laufen lassen, Fehlschlag prüfen**

Run: `pnpm vitest run src/app/m/portal/profil/page.test.tsx`
Expected: FAIL — Modul nicht auflösbar.

- [ ] **Step 11: Die Seite schreiben**

`src/app/m/portal/profil/page.tsx`:

```tsx
import { redirect } from "next/navigation";

import { auth } from "@/core/auth";
import { Seitenkopf } from "@/core/shell/Seitenkopf";
import { ProfilAnsicht } from "@/app/m/portal/_ui/ProfilAnsicht";
import { alleSitzungenAbmelden } from "@/app/m/portal/profil/actions";

/**
 * Server Component: sie loest die Sitzung auf und reicht fertige Werte durch.
 * Kein `@ant-design/icons` und kein Compound-Zugriff auf antd — beides waere
 * HTTP 500 schon beim Import bzw. beim Rendern (Fallen 1 und 7).
 */
export default async function ProfilPage() {
  const session = await auth();
  if (!session?.user) redirect("/login?callbackUrl=%2Fprofil");

  return (
    <>
      <Seitenkopf
        titel="Profil"
        beschreibung="Wer du für diese Suite bist — und wie du dich überall abmeldest."
        zurueck={{ titel: "Apps & Dienste", href: "/" }}
      />
      <ProfilAnsicht
        name={session.user.name ?? null}
        email={session.user.email ?? null}
        kennung={session.user.id ?? null}
        gruppen={session.user.groups ?? []}
        fachgruppen={session.user.fachgruppen ?? []}
        angemeldetSeit={session.angemeldetSeit ?? null}
        abmelden={alleSitzungenAbmelden}
      />
    </>
  );
}
```

- [ ] **Step 12: Laufen lassen**

Run: `pnpm vitest run src/app/m/portal`
Expected: PASS.

- [ ] **Step 13: Commit**

```bash
git add src/app/m/portal/profil src/app/m/portal/_ui/ProfilAnsicht.tsx src/app/m/portal/_ui/ProfilAnsicht.test.tsx
git commit -m "Profilseite mit Sitzungswiderruf"
```

---

### Task 5: Der Weg zur Seite — Eintrag im Nutzermenü

**Files:**
- Modify: `src/core/shell/SuiteNav.tsx:225-300`
- Modify: `src/core/shell/SuiteNav.test.tsx:55-57` (Helfer `zeichne`)
- Modify: `src/core/shell/SuiteHeader.tsx`
- Modify: `src/core/shell/SuiteHeader.test.tsx`

**Interfaces:**
- Consumes: `moduleUrl("portal")` aus `@/core/shell/moduleUrl`
- Produces: `SuiteNav`-Prop `profilHref: string | null`

- [ ] **Step 1: Den fehlschlagenden Test schreiben**

In `src/core/shell/SuiteNav.test.tsx` den Helfer um den neuen Prop ergänzen:

```tsx
async function zeichne(props: Partial<Parameters<typeof SuiteNav>[0]> = {}) {
  await mount(
    <SuiteNav
      nav={[]}
      userName="Ruben Vitt"
      angemeldet
      profilHref="http://portal.localtest.me:3000"
      {...props}
    />,
  );
}
```

Und im `describe("SuiteNav — angemeldet")` anhängen:

```tsx
  it("fuehrt aus dem Nutzermenue aufs Profil", async () => {
    await zeichne();
    await oeffneNutzermenue();
    const link = queryPortal<HTMLAnchorElement>('[data-testid="profil-link"]');
    expect(link.getAttribute("href")).toBe("http://portal.localtest.me:3000/profil");
  });

  it("laeszt den Eintrag weg, wenn es kein Portal-Ziel gibt", async () => {
    // `moduleUrl` liefert in Prod `null`, solange keine Domain aufs Portal
    // zeigt. Ein Eintrag ohne Ziel waere ein toter Link — dieselbe Regel wie
    // beim Modultitel in `SuiteHeader`.
    await zeichne({ profilHref: null });
    await oeffneNutzermenue();
    expect(existsPortal('[data-testid="profil-link"]')).toBe(false);
  });
```

`queryPortal` und `existsPortal` stehen bereits im Import-Block der Datei; fehlt
eines, ergänzen.

- [ ] **Step 2: Laufen lassen, Fehlschlag prüfen**

Run: `pnpm vitest run src/core/shell/SuiteNav.test.tsx`
Expected: FAIL — TypeScript kennt `profilHref` nicht, der Eintrag fehlt.

- [ ] **Step 3: `SuiteNav` erweitern**

Signatur um `profilHref: string | null` ergänzen. Oberhalb von `abmeldenEintrag`
einfügen:

```tsx
  /*
   * DER WEG AUFS PROFIL — und warum er auf einen ANDEREN Host zeigen darf.
   *
   * Die Profilseite existiert genau einmal, im Portal. Das Sitzungs-Cookie gilt
   * ueber alle Modul-Hosts (`core/auth/cookies.ts`), eine Kopie je Modul waere
   * fuenf Kopien derselben Seite. Der Preis ist ein Hostwechsel; deshalb ein
   * echtes `<a>` und kein `next/link` — ueber eine Domaingrenze hinweg gibt es
   * nichts clientseitig zu navigieren.
   *
   * Kein Ziel, kein Eintrag: `moduleUrl` liefert in Prod `null`, solange keine
   * Domain aufs Portal zeigt. Ein toter Link ist schlimmer als kein Link.
   */
  const profilEintrag = profilHref
    ? [
        {
          key: "profil",
          label: (
            <a data-testid="profil-link" href={`${profilHref}/profil`}>
              Profil
            </a>
          ),
        },
      ]
    : [];
```

Und die beiden Menülisten darunter darauf umstellen:

```tsx
  const nutzerEintraege: MenuProps["items"] = userName
    ? [
        {
          key: "nutzer",
          type: "group",
          label: <span data-testid="nutzername">{userName}</span>,
          children: [...profilEintrag, abmeldenEintrag],
        },
      ]
    : [...profilEintrag, abmeldenEintrag];
```

Kein Icon am Eintrag: `@ant-design/icons` ist hier zwar erlaubt (die Datei trägt
`"use client"`), aber der bestehende `LogoutOutlined` steht für die eine
folgenschwere Handlung — ein zweites Zeichen daneben nimmt ihm die Betonung.

- [ ] **Step 4: `SuiteHeader` den Prop durchreichen**

In `src/core/shell/SuiteHeader.tsx` die `SuiteNav`-Zeile ersetzen durch:

```tsx
        <SuiteNav
          nav={nav}
          userName={session?.user?.name ?? null}
          angemeldet={angemeldet}
          profilHref={angemeldet ? moduleUrl("portal") : null}
        />
```

`moduleUrl` ist dort bereits importiert.

- [ ] **Step 5: Laufen lassen**

Run: `pnpm vitest run src/core/shell`
Expected: PASS. Schlägt `SuiteHeader.test.tsx` fehl, weil es die `SuiteNav`-Props
prüft, den erwarteten Prop dort ergänzen.

- [ ] **Step 6: Commit**

```bash
git add src/core/shell
git commit -m "Profil-Eintrag im Nutzermenue"
```

---

### Task 6: E2E — der Widerruf wirkt auf einem zweiten Gerät

**Files:**
- Modify: `e2e/konto-widerruf.spec.ts` (aus Task 3)

**Interfaces:**
- Consumes: `devLogin` aus `e2e/fixtures`

- [ ] **Step 1: Den Test schreiben**

An `e2e/konto-widerruf.spec.ts` anhängen:

```ts
test("der Widerruf sperrt eine zweite, unabhaengige Sitzung aus", async ({ browser }) => {
  /*
   * ZWEI BROWSER-KONTEXTE, NICHT ZWEI TABS: nur getrennte Kontexte haben
   * getrennte Cookie-Speicher und sind damit wirklich „zwei Geraete". In einem
   * zweiten Tab teilte man dasselbe Cookie, und der Test bewiese nichts.
   *
   * DIESER TEST IST DER EINZIGE, DER DIE NAHT WIRKLICH SIEHT. Der Widerruf
   * greift im `jwt`-Callback auf dem Proxy-Pfad; Vitest kann dort nicht
   * hinsehen (kein Server, kein echtes Cookie), und `pnpm build` erst recht
   * nicht.
   */
  const geraetA = await browser.newContext();
  const geraetB = await browser.newContext();
  const seiteA = await geraetA.newPage();
  const seiteB = await geraetB.newPage();

  const email = "widerruf@localtest.me";
  await devLogin(seiteA, { host: "portal.localtest.me", email });
  await devLogin(seiteB, { host: "portal.localtest.me", email });

  // Vorbedingung: B ist wirklich angemeldet, sonst misst der Test nichts.
  await seiteB.goto("http://portal.localtest.me:3100/");
  await expect(seiteB).not.toHaveURL(/\/login/);

  await seiteA.goto("http://portal.localtest.me:3100/profil");
  await seiteA.getByTestId("alle-abmelden").click();
  await seiteA.getByTestId("alle-abmelden-ja").click();

  // B navigiert und landet beim Login — ohne dass B irgendetwas getan haette.
  await seiteB.goto("http://portal.localtest.me:3100/");
  await expect(seiteB).toHaveURL(/\/login/);

  await geraetA.close();
  await geraetB.close();
});

test("nach dem Widerruf traegt eine frische Anmeldung wieder", async ({ page }) => {
  // Sonst waere der Knopf eine Falle: einmal gedrueckt, nie wieder hinein.
  const email = "widerruf-neu@localtest.me";
  await devLogin(page, { host: "portal.localtest.me", email });
  await page.goto("http://portal.localtest.me:3100/profil");
  await page.getByTestId("alle-abmelden").click();
  await page.getByTestId("alle-abmelden-ja").click();

  await devLogin(page, { host: "portal.localtest.me", email });
  await page.goto("http://portal.localtest.me:3100/");
  await expect(page).not.toHaveURL(/\/login/);
});
```

- [ ] **Step 2: Laufen lassen**

Run: `pnpm exec playwright test e2e/konto-widerruf.spec.ts`
Expected: PASS. Vorher wieder `pgrep -fl "next dev"` prüfen (siehe Task 3).

- [ ] **Step 3: Commit**

```bash
git add e2e/konto-widerruf.spec.ts
git commit -m "E2E: Widerruf sperrt das zweite Geraet aus"
```

---

### Task 7: Tore und Dokumentation

**Files:**
- Modify: `CLAUDE.md` (Abschnitt „Ein neues Modul registrieren — das Dreieck")
- Modify: `.env.example` — **nur** falls eine neue Variable entstanden ist (sie ist es nicht; dann entfällt der Schritt)

- [ ] **Step 1: Alle Tore laufen lassen**

```bash
pnpm typecheck
pnpm lint
pnpm vitest run
pnpm build
```

Expected: alle grün. `pnpm vitest run` **nach** `pnpm build` erneut laufen zu
lassen ist nicht nötig — `vitest.config.ts` schließt `**/.next/**` aus.

- [ ] **Step 2: `CLAUDE.md` um die zweite Migrationsliste ergänzen**

Im Abschnitt „Ein neues Modul registrieren — das Dreieck" nach dem bestehenden
Absatz anfügen:

```markdown
Datenbanken, die `core` selbst führt, stehen in **`CORE_MIGRATIONS`** statt in
`MODULE_MIGRATIONS` (heute: `konto`, der Sitzungswiderruf). Das Dreieck gilt dort
unverändert; die zweite Liste existiert, weil `scripts/seed-lokal.test.ts` für
jeden Eintrag in `MODULE_MIGRATIONS` einen lokalen Seed verlangt — und eine
geseedete Widerrufszeile sperrte den Dev-Nutzer aus.
```

- [ ] **Step 3: Playwright vollständig laufen lassen**

Run: `pnpm exec playwright test`
Expected: PASS. Vorher `pgrep -fl "next dev"` prüfen.

- [ ] **Step 4: Commit und PR**

```bash
git add CLAUDE.md
git commit -m "CLAUDE.md: CORE_MIGRATIONS neben MODULE_MIGRATIONS"
git push -u origin worktree-konto-profil
gh pr create --base main --title "Profilseite mit Widerruf aller Sitzungen" --body "…"
```

Der PR-Text nennt: was der Knopf tut, dass der Rollout **keinen** Zwangs-Logout
auslöst, und die Restlücke bei der Pocket-ID-Sitzung auf fremden Geräten.

---

## Selbstprüfung des Plans

- **Spec-Abdeckung:** Mechanik → Task 2. Persistenz und `CORE_MIGRATIONS` →
  Task 1. Seite, Action, Fallen 1/3/4/7 → Task 4. Navigation → Task 5. Tests →
  Tasks 1, 2, 4, 5, 6. Risiko `better-sqlite3` im Proxy → Task 3, vor der
  Oberfläche. Restlücke Pocket ID → als Text auf der Seite (Task 4, Step 7) und
  im PR (Task 7).
- **Nicht abgedeckt und bewusst so:** Geräteliste, editierbare Stammdaten,
  suiteweiter Not-Widerruf, IdP-seitiger Widerruf — alle vier stehen in der Spec
  unter „ausdrücklich nicht Teil".
- **Namensgleichheit:** `istWiderrufen` / `widerrufeAlleSitzungen` /
  `alleSitzungenAbmelden` / `angemeldetSeit` / `profilHref` /
  `CORE_MIGRATIONS` — in allen Tasks identisch geschrieben.
