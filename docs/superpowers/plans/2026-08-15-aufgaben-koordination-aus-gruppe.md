# Koordinationsrolle aus der Auth-Gruppe — Umsetzungsplan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development
> (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:** Die Koordinationsrolle des Moduls `aufgaben` kommt aus der Pocket-ID-Gruppe
(`canAdminModule("aufgaben")`) statt aus `personen.rolle`; `bufdi`/`auftrag` bleiben in der
Modultabelle und werden weiterhin von der Koordination vergeben.

**Architecture:** Ein neuer Typ `Akteur = { person: PersonRow; istKoordination: boolean }` wird an
genau einer Stelle aufgelöst (`akteurFuerSeite` in `_lib/zugang.ts`) und ersetzt `PersonRow` in
allen Zugriffsprädikaten und ihrer Aufruferkaskade. Der Umbau läuft in zwei Hälften: erst der
reine Refactor bei **unverändertem Verhalten** (Aufgabe 1), dann der Quellenwechsel (Aufgabe 2).
Danach schrumpft `ROLLEN` auf zwei Werte.

**Tech Stack:** Next.js 16 (App Router, RSC) · Drizzle + better-sqlite3 · Auth.js v5 (Pocket ID) ·
Vitest + Playwright · Ant Design 6

**Spec:** `docs/superpowers/specs/2026-08-15-aufgaben-koordination-aus-gruppe-design.md`

## Global Constraints

- **Kommandos:** `pnpm typecheck` · `pnpm lint` · `pnpm vitest run` · `pnpm build` ·
  `pnpm exec playwright test`. Alle mit `rtk` präfixen (`rtk pnpm vitest run`).
- **Kein laufender `pnpm dev`, während die e2e-Suite läuft** — er legt sie lahm.
- **Kein Worktree unter `.claude/worktrees/`** — das Verzeichnis liegt im Repo und vergiftet die
  Prüfungstore. Auf dem Branch `aufgaben-koordination-aus-gruppe` im Hauptverzeichnis arbeiten.
- **Commits müssen signiert sein** (main-Ruleset), sonst blockiert der Merge trotz grüner CI.
- **`_lib/zugang.ts` bleibt frei von `"use client"` und `@ant-design/icons`** (Fallen 6 und 7 in
  `CLAUDE.md`). Es importiert bereits `@/core/auth` und läuft ausschließlich serverseitig.
- **Kein Prädikat wandert in eine Client-Insel.** `AktionsZone.tsx` und `PersonenTabelle.tsx`
  bekommen fertig berechnete, serialisierbare Werte — diese Aufteilung bleibt unverändert.
- **Deutschsprachige Bezeichner und Kommentare**, wie im ganzen Modul.
- Nach jeder Aufgabe: `rtk pnpm typecheck && rtk pnpm lint && rtk pnpm vitest run` grün, dann
  committen.

---

### Task 1: `Akteur` einführen — reiner Refactor, Verhalten unverändert

**Files:**
- Modify: `src/app/m/aufgaben/_lib/zugang.ts`
- Modify: `src/app/m/aufgaben/_db/queries.ts` (`freigabenFuer:257`, `freigabeDaten:304`)
- Modify: `src/app/m/aufgaben/_lib/lebenszyklus.ts` (`TABELLE[].wer:83`, `uebergang:165`,
  `pruefeEinstellen:222`)
- Modify: `src/app/m/aufgaben/_lib/aktionsOptionen.ts` (`aktionsOptionen:53`)
- Modify: `src/app/m/aufgaben/_lib/nav.ts` (`aufgabenNav:38`)
- Modify: die Aufrufer — `page.tsx`, `layout.tsx`, `neu/page.tsx`, `verteilen/page.tsx`,
  `freigaben/page.tsx`, `personen/page.tsx`, `archiv/page.tsx`, `a/[id]/page.tsx`,
  `a/[id]/nachweis/[nachweisId]/route.ts`, `actions.ts`, `_ui/EinstiegKoordination.tsx`,
  `_ui/EinstiegAuftrag.tsx`, `_ui/AufgabeFormular.tsx`, `_ui/NachweisBild.tsx`,
  `_ui/VerteilenDialog.tsx`
- Test: `src/app/m/aufgaben/_lib/zugang.test.ts` und die bestehenden Tests der obigen Dateien

**Interfaces:**
- Produces:
  ```ts
  export type Akteur = { person: PersonRow; istKoordination: boolean };
  export async function akteurFuerSeite(db: DB): Promise<Akteur | null>;
  export async function akteurFuerSession(db: DB): Promise<Akteur>;   // wirft notFound()
  ```
  Alle Prädikate nehmen `a: Akteur` an erster Stelle statt `p: PersonRow`:
  ```ts
  darfVerteilen(a: Akteur, heute: string): boolean
  darfEinstellenFuerAndere(a: Akteur, heute: string): boolean
  darfPersonenVerwalten(a: Akteur, heute: string): boolean
  darfRoutinenVerwalten(a: Akteur, heute: string): boolean
  darfPlanAendern(a: Akteur, zielPersonId: string, heute: string): boolean
  darfFreigeben(a: Akteur, auf: AufgabeRow, heute: string): boolean
  darfPlanSehen(a: Akteur, zielPersonId: string): boolean
  darfNachweisSehen(a: Akteur, auf: AufgabeRow): boolean
  darfNachweisHochladen(a: Akteur, auf: AufgabeRow, heute: string): boolean
  darfAufgabeSehen(a: Akteur, auf: AufgabeRow): boolean
  darfFreigabenSehen(a: Akteur, heute: string): boolean
  istVertretungsfreigabe(a: Akteur, auf: AufgabeRow): boolean
  istAktiv(p: PersonRow, heute: string): boolean            // UNVERÄNDERT — reine Zeilenfrage
  freigabenFuer(db: DB, a: Akteur, heute: string): AufgabeRow[]
  freigabeDaten(db: DB, a: Akteur, heute: string): FreigabeDaten
  uebergang(auf: AufgabeRow, aktion: Aktion, a: Akteur, heute: string): UebergangErgebnis
  aktionsOptionen(auf: AufgabeRow, a: Akteur, heute: string): AktionsOptionen
  aufgabenNav(a: Akteur, heute: string): SuiteNavItem[]
  ```
  `TABELLE[].wer` wird zu `(a: Akteur, auf: AufgabeRow, heute: string) => boolean`.
- Consumes: nichts (erste Aufgabe).

**In dieser Aufgabe wechselt die Quelle NOCH NICHT.** `akteurFuerSeite` setzt
`istKoordination: person.rolle === "koordination"`. Jeder bestehende Test muss unverändert grün
bleiben — genau das ist der Beweis, dass der Refactor verhaltensneutral war.

- [ ] **Schritt 1: `Akteur` und die beiden Auflöser schreiben**

In `_lib/zugang.ts`, direkt unter `personFuerSeite`:

```ts
/**
 * WER HANDELT — die Personenzeile UND die Frage, ob sie koordiniert.
 *
 * Die beiden Hälften haben verschiedene Quellen (Aufgabe 2: die Zeile aus `personen`, die
 * Koordination aus der Auth-Gruppe) und werden an GENAU DIESER STELLE zusammengesetzt. Jedes
 * Prädikat dieser Datei bekommt das fertige Ergebnis; keines fragt selbst nach Gruppen.
 */
export type Akteur = { person: PersonRow; istKoordination: boolean };

export async function akteurFuerSeite(db: DB): Promise<Akteur | null> {
  const person = await personFuerSeite(db);
  if (!person) return null;
  // AUFGABE 1: noch aus der Zeile. Aufgabe 2 ersetzt genau diese eine Zeile.
  return { person, istKoordination: person.rolle === "koordination" };
}

export async function akteurFuerSession(db: DB): Promise<Akteur> {
  const akteur = await akteurFuerSeite(db);
  if (!akteur) notFound();
  return akteur;
}
```

- [ ] **Schritt 2: Die zwölf Prädikate auf `Akteur` umstellen**

Mechanisch: `p: PersonRow` → `a: Akteur`, `p.rolle === "koordination"` → `a.istKoordination`,
jeder andere `p.`-Zugriff → `a.person.`. `istAktiv(a.person, heute)`.

`istAktiv` selbst bleibt `(p: PersonRow, heute)` — es ist eine reine Frage an die Zeile und wird
auch von `personen/page.tsx:48` und `_db/queries.ts` direkt gerufen.

Die Kopfkommentare mitziehen: wo heute `rolle === "koordination"` steht, steht künftig „die
Koordinationsgruppe"; die fachlichen Begründungen (Vier-Augen-Prinzip in `darfFreigeben`,
Sicht-/Handlungsgrenze im Dateikopf) bleiben wörtlich erhalten.

- [ ] **Schritt 3: Die Kaskade nachziehen**

`rtk pnpm typecheck` zeigt jede Stelle. `queries.ts`, `lebenszyklus.ts`, `aktionsOptionen.ts`,
`nav.ts`, dann die Seiten und `actions.ts`. Seiten rufen `akteurFuerSeite` statt `personFuerSeite`,
Actions `akteurFuerSession` statt `personFuerSession`.

`_ui`-Komponenten, die heute `person: PersonRow` als Prop nehmen und **nur anzeigen**
(`PersonenTabelle`, `AufgabenListe`), behalten `PersonRow` — sie stellen keine Rechtefrage.
`EinstiegKoordination`/`EinstiegAuftrag`/`EinstiegBufdi` bekommen `akteur: Akteur`, weil sie
Prädikate rufen.

- [ ] **Schritt 4: Bestehende Tests anpassen — ohne ihre Zusagen zu ändern**

`zugang.test.ts` (24.6K), `lebenszyklus.test.ts` (20.9K), `aktionsOptionen.test.ts`,
`nav.test.ts`, `queries.test.ts` und die Seiten-Tests bauen heute `PersonRow`-Fixtures. Ein Helfer
je Testdatei:

```ts
function akteur(p: PersonRow): Akteur {
  return { person: p, istKoordination: p.rolle === "koordination" };
}
```

**Keine Zusage eines bestehenden Tests darf sich ändern** — nur die Aufrufform.

- [ ] **Schritt 5: Tore und Commit**

```bash
rtk pnpm typecheck && rtk pnpm lint && rtk pnpm vitest run
rtk git add -A && rtk git commit -m "refactor(aufgaben): die Zugriffspraedikate fragen einen Akteur statt eine Personenzeile"
```

Erwartung: **alle** Vitest-Tests grün, keine Zusage geändert.

---

### Task 2: Die Quelle wechseln — die Gruppe entscheidet

**Files:**
- Modify: `src/app/m/aufgaben/_lib/zugang.ts` (`akteurFuerSeite`)
- Test: `src/app/m/aufgaben/_lib/zugang.test.ts`

**Interfaces:**
- Consumes: `Akteur`, `akteurFuerSeite` aus Task 1.
- Produces: keine Signaturänderung — nur die Herkunft von `istKoordination`.

- [ ] **Schritt 1: Den fehlschlagenden Test schreiben**

In `zugang.test.ts`:

```ts
describe("akteurFuerSeite — die Koordination kommt aus der Gruppe, nicht aus der Zeile", () => {
  it("eine auftrag-Zeile MIT Koordinationsgruppe koordiniert", async () => {
    // Sitzung mit groups: ["iuk-aufgaben-koordination"], personen-Zeile rolle: "auftrag"
    const a = await akteurFuerSeite(db);
    expect(a?.istKoordination).toBe(true);
  });

  it("eine koordination-Zeile OHNE Gruppe koordiniert NICHT", async () => {
    // Sitzung ohne Gruppen, personen-Zeile rolle: "koordination"
    const a = await akteurFuerSeite(db);
    expect(a?.istKoordination).toBe(false);
  });

  it("der Suite-Admin koordiniert — der Notausgang aus personen/page.tsx gilt jetzt modulweit", async () => {
    // Sitzung mit groups: ["dashboard-admins"]
    const a = await akteurFuerSeite(db);
    expect(a?.istKoordination).toBe(true);
  });
});
```

`@/core/auth`s `auth()` wird dafür gemockt (`vi.mock`), wie es die bestehenden Tests dieser Datei
für `personFuerSeite` bereits tun — dort nachsehen und dasselbe Muster verwenden.

- [ ] **Schritt 2: Lauf zur Bestätigung des Fehlschlags**

`rtk pnpm vitest run src/app/m/aufgaben/_lib/zugang.test.ts`
Erwartung: die ersten beiden Fälle schlagen fehl (`istKoordination` folgt noch der Zeile).

- [ ] **Schritt 3: Die eine Zeile ersetzen**

```ts
import { canAdminModule } from "@/core/auth/guards";

export async function akteurFuerSeite(db: DB): Promise<Akteur | null> {
  const person = await personFuerSeite(db);
  if (!person) return null;
  return { person, istKoordination: await canAdminModule("aufgaben") };
}
```

Den Kommentar aus Task 1 durch die Begründung ersetzen: die Gruppe ist die Quelle; der
Suite-Admin kommt über `isModuleAdmin` mit durch und das ist gewollt (Rückweg bei
fehlkonfiguriertem `SUITE_ADMIN_GROUP_AUFGABEN`); `personen/page.tsx:94` tat dasselbe seit dem
2026-08-14 für eine einzelne Route.

- [ ] **Schritt 4: Tests grün**

`rtk pnpm vitest run` — alle drei neuen Fälle treffen. Bestehende Tests, die eine
`rolle: "koordination"`-Zeile bauen und Koordinationsverhalten erwarten, müssen jetzt zusätzlich
die Gruppe stellen; das ist eine echte Verhaltensänderung und gehört so angepasst.

- [ ] **Schritt 5: `personen/page.tsx` vereinfachen**

Der Notausgang (`canAdminModule` vor `personFuerSeite`, Zeilen 88-97) bleibt **bestehen** — er
löst weiterhin den Fall „Koordination ohne `personen`-Zeile", den Task 4 erst danach durch die
JIT-Zeile entschärft. Nur der Kommentar wird nachgezogen: er ist nicht mehr die Ausnahme, sondern
dieselbe Regel wie im ganzen Modul.

- [ ] **Schritt 6: Commit**

```bash
rtk pnpm typecheck && rtk pnpm lint && rtk pnpm vitest run
rtk git add -A && rtk git commit -m "feat(aufgaben): die Koordinationsrolle kommt aus der Auth-Gruppe"
```

---

### Task 3: `ROLLEN` schrumpft auf zwei Werte

**Files:**
- Modify: `src/app/m/aufgaben/_db/schema.ts:27` (`ROLLEN`)
- Create: `src/app/m/aufgaben/_db/migrations/0002_<name>.sql` + `meta/0002_snapshot.json` +
  `meta/_journal.json`
- Modify: `src/app/m/aufgaben/_db/queries.ts:40` (`ROLLEN_RANG`)
- Modify: `src/app/m/aufgaben/_lib/anzeige.ts:71` (`ROLLE_TEXT`)
- Modify: `src/app/m/aufgaben/_lib/eingabe.ts:54` (`istGueltigeRolle`)
- Modify: `src/app/m/aufgaben/page.tsx` (`aufgabenInhalt`)
- Modify: `src/app/m/aufgaben/_ui/PersonenFormular.tsx` (Rollenauswahl)
- Test: `src/app/m/aufgaben/_db/queries.test.ts`, `_lib/eingabe.test.ts`, `page.test.tsx`,
  `_db/migrations.test.ts`

**Interfaces:**
- Consumes: `Akteur` aus Task 1/2.
- Produces: `ROLLEN = ["auftrag", "bufdi"] as const`; `type Rolle = "auftrag" | "bufdi"`.

- [ ] **Schritt 1: Der Riegeltest für `bufdis()` — zuerst, weil er das Kernrisiko hält**

In `queries.test.ts`:

```ts
it("bufdis() enthaelt nie eine Person, die ueber die Gruppe koordiniert", () => {
  // Rike: rolle "auftrag", aktiv, koordiniert per Gruppe
  legePerson("rike", "auftrag");
  expect(bufdis(db, HEUTE).map((p) => p.sub)).not.toContain("rike");
});
```

Begründung im Test festhalten: `verteilDaten` speist die Verteillisten aus `bufdis()`, damit die
Koordination nicht in ihrer eigenen Zielliste steht — daran hängt die Betreiberentscheidung vom
2026-08-13 (`darfFreigeben`, Vier-Augen-Prinzip).

- [ ] **Schritt 2: `ROLLEN` schrumpfen**

```ts
/** Die zwei Rollen der Modultabelle (Spec §4, Nachtrag 2026-08-15). Die KOORDINATION steht
 *  nicht mehr darunter — sie kommt aus der Auth-Gruppe (`_lib/zugang.ts`, `akteurFuerSeite`). */
export const ROLLEN = ["auftrag", "bufdi"] as const;
```

`ROLLEN_RANG` wird `{ auftrag: 0, bufdi: 1 }`, `ROLLE_TEXT` verliert seinen dritten Eintrag.

- [ ] **Schritt 3: Die Migration**

`0002_*.sql` — ein reines Daten-`UPDATE`, denn `text("rolle", { enum })` erzeugt in SQLite **kein**
`CHECK` (`0000_heavy_bloodstrike.sql:62` ist schlicht `` `rolle` text NOT NULL ``):

```sql
UPDATE personen SET rolle = 'auftrag' WHERE rolle = 'koordination';
```

Snapshot und `_journal.json`-Eintrag nach der Konvention der vorhandenen `0000`/`0001` ergänzen.
`migrations.test.ts` prüft die Kette — dort einen Fall ergänzen, der eine `koordination`-Zeile vor
der Migration setzt und danach `auftrag` erwartet.

- [ ] **Schritt 4: Die Einstiegsverzweigung**

`page.tsx`s `aufgabenInhalt` nimmt künftig `akteur: Akteur` und verzweigt:

```ts
if (akteur.istKoordination) return <EinstiegKoordination … />;
switch (akteur.person.rolle) {
  case "bufdi":   return <EinstiegBufdi … />;
  case "auftrag": return <EinstiegAuftrag … />;
  default: {
    const unerreichbar: never = akteur.person.rolle;
    throw new Error(`Unbekannte Rolle "${unerreichbar as string}".`);
  }
}
```

Der `never`-Guard bleibt — er bewacht jetzt die zwei Datenbankrollen. `page.test.tsx` bekommt einen
Fall „Koordinationsgruppe schlägt die Datenbankrolle" (`auftrag`-Zeile + Gruppe →
`EinstiegKoordination`).

- [ ] **Schritt 5: Tore und Commit**

```bash
rtk pnpm typecheck && rtk pnpm lint && rtk pnpm vitest run
rtk git add -A && rtk git commit -m "feat(aufgaben)!: die Modultabelle kennt nur noch auftrag und bufdi"
```

---

### Task 4: Die JIT-Zeile für die Koordination

**Files:**
- Modify: `src/app/m/aufgaben/_lib/zugang.ts` (`akteurFuerSeite`)
- Test: `src/app/m/aufgaben/_lib/zugang.test.ts`

**Interfaces:**
- Consumes: `Akteur`, `akteurFuerSeite`, `ROLLEN` aus Tasks 1-3.
- Produces: `akteurFuerSeite` liefert für eine Person mit Koordinationsgruppe **nie** `null`.

- [ ] **Schritt 1: Der fehlschlagende Test**

```ts
describe("akteurFuerSeite — die Koordination bekommt ihre Zeile beim ersten Aufruf", () => {
  it("legt eine Zeile an, wenn die Gruppe da ist und keine Zeile existiert", async () => {
    const a = await akteurFuerSeite(db);           // Sitzung: Koordinationsgruppe, keine Zeile
    expect(a?.person.sub).toBe("dev:rike@localtest.me");
    expect(a?.person.rolle).toBe("auftrag");
    expect(a?.istKoordination).toBe(true);
  });

  it("ist idempotent — zweimal aufgerufen bleibt es eine Zeile", async () => {
    await akteurFuerSeite(db);
    await akteurFuerSeite(db);
    expect(allePersonen(db).filter((p) => p.sub === "dev:rike@localtest.me")).toHaveLength(1);
  });

  it("legt KEINE Zeile an, wenn die Gruppe fehlt", async () => {
    expect(await akteurFuerSeite(db)).toBeNull();
    expect(allePersonen(db)).toHaveLength(0);
  });
});
```

- [ ] **Schritt 2: Lauf zur Bestätigung des Fehlschlags**

`rtk pnpm vitest run src/app/m/aufgaben/_lib/zugang.test.ts`

- [ ] **Schritt 3: Anlegen**

```ts
export async function akteurFuerSeite(db: DB): Promise<Akteur | null> {
  const istKoordination = await canAdminModule("aufgaben");
  const person = await personFuerSeite(db);
  if (person) return { person, istKoordination };
  if (!istKoordination) return null;
  return { person: legeKoordinationAn(db, await auth()), istKoordination: true };
}
```

`legeKoordinationAn` (privat in derselben Datei): `sub` aus `session.user.id`, `name` aus
`session.user.name` ?? `session.user.email` ?? `sub`, `initialen` aus dem Namen abgeleitet,
`rolle: "auftrag"`, `sollMinutenTag` per Vorgabe, `aktivVon` = heute, `aktivBis: null`.
`INSERT … ON CONFLICT DO NOTHING` gegen `uniqueIndex("personen_sub_idx")`, danach die Zeile lesen.

Der Kommentar muss zwei Dinge begründen: **warum** die Zeile nötig ist (`erstellerId`/`prueferId`
zeigen auf eine `personen.id`), und **warum** ein Schreibvorgang beim Seitenaufbau hier vertretbar
ist (idempotentes `INSERT` gegen lokale SQLite; die Alternative ließe `/` weiter „nicht
eingetragen" zeigen — genau das Symptom, das der Entwurf beseitigt).

- [ ] **Schritt 4: `istAktiv` gilt für die Koordination nicht mehr**

Alle Prädikate, die `a.istKoordination` **oder** eine Rollenbedingung prüfen, dürfen die
Koordination nicht zusätzlich an `istAktiv(a.person, heute)` messen — die Gruppenmitgliedschaft
trägt sie. Konkret in `darfVerteilen`, `darfEinstellenFuerAndere`, `darfPersonenVerwalten`,
`darfFreigeben`, `darfFreigabenSehen`:

```ts
export function darfVerteilen(a: Akteur, heute: string): boolean {
  return a.istKoordination;
}
export function darfEinstellenFuerAndere(a: Akteur, heute: string): boolean {
  return a.istKoordination || (a.person.rolle === "auftrag" && istAktiv(a.person, heute));
}
```

Für `bufdi`/`auftrag` bleibt `istAktiv` unverändert. Test: eine Koordinationsperson mit
`aktivBis` in der Vergangenheit darf weiterhin verteilen.

- [ ] **Schritt 5: Tore und Commit**

```bash
rtk pnpm typecheck && rtk pnpm lint && rtk pnpm vitest run
rtk git add -A && rtk git commit -m "feat(aufgaben): die Koordination bekommt ihre Personenzeile beim ersten Aufruf"
```

---

### Task 5: Verzeichnis-Autofill im Personenformular

**Files:**
- Modify: `src/app/m/aufgaben/_ui/PersonenFormular.tsx`
- Modify: `src/app/m/aufgaben/actions.ts` (neue Such-Action)
- Test: `src/app/m/aufgaben/_ui/PersonenFormular.test.tsx`, `actions.test.ts`

**Interfaces:**
- Consumes: `getDirectory`, `DirectoryPerson`, `DirectoryResult` aus `@/core/directory`.
- Produces:
  ```ts
  export async function personenSucheAction(q: string): Promise<DirectoryResult>;
  ```

**Vorbild wörtlich übernehmen:** `src/app/m/feedback/actions.ts:316` (`getDirectory().search(q, …)`,
in `ohneAusfall` gekapselt) und `src/app/m/feedback/_ui/Zuordnung.tsx` (die Client-Insel mit dem
Suchfeld). Nicht neu erfinden.

- [ ] **Schritt 1: Der fehlschlagende Test für die Action**

```ts
it("personenSucheAction gibt Treffer aus dem Verzeichnis zurueck", async () => { … });
it("personenSucheAction verlangt die Koordinationsrolle", async () => { … });  // sonst Forbidden
it("ohne POCKET_ID_API_KEY liefert sie status 'unconfigured' statt zu werfen", async () => { … });
```

- [ ] **Schritt 2: Die Action schreiben**

`requireModuleAdmin("aufgaben")` (`core/auth/guards.ts`) zuerst — eine Suche über alle SSO-Konten
darf nicht offenstehen. Danach `getDirectory().search(q, 20)`.

- [ ] **Schritt 3: Das Formular umbauen**

Das `sub`-Textfeld wird zu einer Suche mit Trefferliste; ein Treffer belegt `sub`, `name` und die
abgeleiteten `initialen` vor. `rolle`, `sollMinutenTag` und der Zeitraum bleiben Eingabe der
Koordination.

**Der Rückfallweg bleibt bestehen:** bei `status: "unconfigured"` (kein `POCKET_ID_API_KEY`)
erscheint das heutige Textfeld samt seinem Hinweis, dass die betroffene Person ihren `sub` auf der
Erklärseite sieht. `core/directory` wirft nie — jeder Ausfall ist ein `status`.

Die Rollenauswahl kennt nur noch `auftrag` und `bufdi` (aus Task 3).

- [ ] **Schritt 4: Tore und Commit**

```bash
rtk pnpm typecheck && rtk pnpm lint && rtk pnpm vitest run
rtk git add -A && rtk git commit -m "feat(aufgaben): die Personenanlage sucht die Kennung im Verzeichnis"
```

---

### Task 6: Seed, e2e, Konfiguration und die Dokumentnachträge

**Files:**
- Modify: `src/app/m/aufgaben/_lib/seedLokal.ts:82` (Rike)
- Modify: `e2e/aufgaben.spec.ts` (1501 Zeilen)
- Modify: `.env.example`, `.env.local`
- Modify: `src/core/registry.ts:140-143` (Kommentar)
- Modify: `docs/superpowers/specs/2026-08-13-modul-aufgaben-design.md` (§4-Nachtrag)
- Modify: `docs/runbooks/` (Gruppen-Voraussetzungen)

**Interfaces:**
- Consumes: alles aus Tasks 1-5.

- [ ] **Schritt 1: Seed**

Rike bekommt `rolle: "auftrag"`. Das Protokoll von `pnpm seed:lokal aufgaben` muss ausgeben, mit
welchen Gruppen man sich anmelden muss, um zu koordinieren — der bisherige Kommentar in
`schema.ts:94` („genau darüber wechselt man lokal die Rolle") bekommt seine zweite Hälfte.

**Der Seed bleibt optional und bleibt vom Boot-Pfad getrennt** (s. Abschnitt „Abnahme: der leere
Start"). Er ist ab jetzt der Weg zu einem *gefüllten* Modul, nicht die Voraussetzung für den
Erstzugang — sein Kopfkommentar sagt das heute noch anders und muss nachgezogen werden.

- [ ] **Schritt 2: e2e**

Jede Sitzung, die heute über Rikes `koordination`-Zeile auf eine Koordinationsfläche kommt,
braucht die Koordinationsgruppe im Dev-Login (`?groups=`). Der bestehende
`const GRUPPE = "iuk-aufgaben-nutzer"` (`e2e/aufgaben.spec.ts:6`) bekommt ein Gegenstück
`const KOORDINATION = "iuk-aufgaben-koordination"`.

**Ein neuer Test, den es heute nicht geben kann:**

```ts
test("Koordinationsgruppe ohne personen-Zeile landet auf der Verteilung, nicht auf der Erklaerseite", …)
```

Er ist der eigentliche Beweis des ganzen Umbaus.

Falle 10 beachten: ein e2e-Test, der eine Anfrage auslöst, prüft ihre **Antwort**
(`page.waitForResponse`), nicht nur eine spätere Zustandsänderung.

- [ ] **Schritt 3: Konfiguration**

`.env.example` und `.env.local`:

```
SUITE_ACCESS_GROUP_AUFGABEN=aufgaben_nutzer
SUITE_ADMIN_GROUP_AUFGABEN=aufgaben_koordination
```

Der bestehende Absatz zu `SUITE_ADMIN_GROUP_AUFGABEN` in `.env.example:290` sagt heute, die
Variable gate die Personenverwaltung. Er muss sagen, dass sie die **gesamte Koordinationsrolle**
trägt, dass ein Tippfehler jede Koordination aussperrt und dass der Rückweg die Suite-Admin-Gruppe
ist. Die Registry-Literale bleiben unverändert (e2e hängt daran).

- [ ] **Schritt 4: Die beiden widersprechenden Stellen nachziehen**

`src/core/registry.ts:140-143` sagt heute das Gegenteil des gebauten Zustands. Neu formulieren:
`bufdi`/`auftrag` stehen in der Modultabelle (Begründung Jahresrotation bleibt), die Koordination
kommt aus `adminGroups`.

`docs/superpowers/specs/2026-08-13-modul-aufgaben-design.md` §4 bekommt einen **datierten
Nachtrag**, kein stilles Überschreiben.

- [ ] **Schritt 5: Runbook**

Beide Pocket-ID-Gruppen müssen existieren **und Mitglieder haben**, bevor das Modul produktiv
erreichbar ist. Heute haben beide 0 Mitglieder — das Modul ist für niemanden erreichbar,
unabhängig vom Namensthema.

- [ ] **Schritt 6: Die vollständigen Tore**

```bash
rtk pnpm typecheck && rtk pnpm lint && rtk pnpm vitest run && rtk pnpm build
# KEIN laufender pnpm dev:
rtk pnpm exec playwright test
```

- [ ] **Schritt 7: Commit**

```bash
rtk git add -A && rtk git commit -m "feat(aufgaben): Seed, e2e und Konfiguration ziehen auf die Gruppenrolle nach"
```

---

## Abnahme: der leere Start — das eigentliche Kriterium

**Der Seed ist für den Erstzugang nicht mehr nötig. Das ist die Zusage dieses Umbaus, nicht ein
Nebeneffekt** (Betreiberentscheidung 2026-08-15, im Gespräch zum Entwurf).

Abnahmepfad, von Hand gegen eine **leere** `.data/aufgaben.db` zu gehen, ohne `pnpm seed:lokal`:

1. `.data/aufgaben.db` löschen (oder eine frische Umgebung nehmen). `pnpm dev`.
2. Am Dev-Login die Koordinationsgruppe anhaken. Sie steht dort als Häkchen zur Auswahl, weil
   `devGroupChoices` (`core/auth/devGroups.ts`) über `adminGroupsFor`/`requiredGroupsFor` liest —
   also auch den per `SUITE_ADMIN_GROUP_AUFGABEN` gesetzten Namen, nicht nur das Registry-Literal.
3. `/` **muss** die Verteilung zeigen, nicht die Erklärseite „noch nicht eingetragen". Die
   Personenzeile ist zu diesem Zeitpunkt gerade erst von `akteurFuerSeite` angelegt worden
   (Aufgabe 4).
4. Über `/personen` einen BuFDi anlegen — dessen `sub` (`dev:<email>`) steht auf der Erklärseite,
   die er selbst bei seinem ersten Anmeldeversuch sieht, oder er wird ab Aufgabe 5 im Verzeichnis
   gesucht.
5. Aufgabe einstellen, verteilen, freigeben — der volle Rundlauf, ohne dass je ein Seed lief.

**Der Seed bleibt bestehen und bleibt optional** — er ist der Weg zu einem *gefüllten* Modul für
Testfahrten, nicht die Voraussetzung für den Erstzugang. Er wird **nicht** an den Boot-Pfad
gehängt: `scripts/seed-lokal.test.ts:56` verbietet die Namen `seedLokal`/`seed-lokal` in
`bootstrap.ts` und `instrumentation.ts`, und der Grund steht in `CLAUDE.md` — `shouldSeed()` ist
auch bei `SUITE_SEED=1` (Generalprobe) wahr, der Boot-Seed wäre also nicht lokal-only.

Punkt 3 ist zusätzlich der e2e-Test aus Aufgabe 6, Schritt 2.

## Selbstprüfung gegen den Entwurf

| Abschnitt des Entwurfs | Aufgabe |
|---|---|
| 1 — Der `Akteur` | 1, 2 |
| 2 — `ROLLEN` schrumpft, Migration, `bufdis()`-Riegel | 3 |
| 3 — Einstieg verzweigt auf die Gruppe | 3 |
| 4 — JIT-Zeile | 4 |
| 5 — `istAktiv` gilt für die Koordination nicht mehr | 4 |
| 6 — Verzeichnis-Autofill | 5 |
| Konfiguration | 6 |
| Tests (Vitest, e2e, Seed) | in jeder Aufgabe, Bündelung in 6 |
| Nachzuziehende Dokumente | 6 |
