# Gerätewartung: Entnehmen, Zurücklegen, Prüfanleitung, endgültig löschen — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Kisten und Geräte der Gerätewartung bekommen eine Prüfanleitung, lassen sich am Telefon entnehmen und zurücklegen (mit Check nach Benutzung), das Durchzählen rechnet mit „unterwegs“, und unbenutzte ausgemusterte Akten lassen sich endgültig löschen.

**Architecture:** Zwei neue Tabellen (`entnahme`, `entnahme_position`) und eine Spalte (`geraet.pruefanleitung`) im Modul `wartung`. Die fachlichen Regeln stehen in einer neuen Datei `_lib/ausleihe.ts` neben `_lib/schreiben.ts`; `pruefungAbschliessen` und `inhaltSpeichern` lesen den Unterwegs-Stand von dort. Telefon-Seiten unter `(geraet)/g/[id]/entnehmen` und `…/zuruecklegen`, Rechte über Vorgänge der Stufe „zugang“, Löschen über Stufe „verwalter“, MCP in `_mcp/werkzeuge.ts`.

**Tech Stack:** Next.js 16 (App Router), Ant Design 6, drizzle + better-sqlite3, zod, Vitest.

**Spec:** `docs/superpowers/specs/2026-11-08-wartung-ausleihe-design.md`

## Global Constraints

- Branch `ida-372-wartung-ausleihe`. Jeder Commit-Body endet mit `Zunder: https://zunder.rubeen.dev/#/aufgabe/f14j8bp7svvp7lgalqo39hpi` und den Attributionszeilen der Session.
- Commit-Präfix: `feat(wartung): …` für sichtbare Funktion, sonst `fix`/`refactor`/`test`/`docs` (Versionsnummer folgt dem Präfix).
- Zeitspalten in Millisekunden (`Kontext.jetzt` = `Date.now()`), Kalendertage `JJJJ-MM-TT`.
- Erwartbare Ablehnungen werfen `Abgelehnt` mit einem Satz für den Bildschirm (`_lib/schreiben.ts`).
- Oberflächentexte deutsch mit echten Umlauten, Bezeichner ASCII (Domänenwörter deutsch wie im Modul).
- Neue Tabellen und jede geänderte Tabelle brauchen Audit-Trigger in derselben Migration und einen Eintrag in `src/core/audit/catalog.ts` (`core/audit/catalog.test.ts` prüft beides).
- Kommentaranker nennen Namen, keine Zeilen (`pnpm anker:neu` ist ein Tor).
- `pruefart` und `eintrag` bleiben unverändert.
- MCP liefert beim Unterwegs-Stand **keine Namen**.
- Ohne Anmeldung zeigt `/g/[id]` „Unterwegs: … seit …“ ohne Name und Zweck.
- Nie `.claude/workflows/files-welle.mjs` stagen (lokale Änderung des Nutzers).
- Prüfbefehle: `pnpm typecheck` (Exit-Code prüfen), `pnpm lint`, `pnpm vitest run src/app/m/wartung src/core/audit`, am Ende zusätzlich `pnpm vitest run` und `pnpm build`.

## Review Focus

1. **Doppelt gesendet** (Netz bricht ab, Telefon schickt erneut): eine Entnahme mit derselben `sendung` steht nur einmal da; eine Rückgabe, deren erwartete Offen-Menge nicht mehr stimmt, wird abgelehnt statt doppelt gezählt. → Tests in Task 2.
2. **Zwei Leute gleichzeitig**: mehr entnehmen als `soll − unterwegs` wird abgelehnt; Durchzählen mit veraltetem Unterwegs-Stand wird als veraltet abgelehnt. → Tests in Task 2 und Task 3.
3. **Inhaltsliste ändern, während etwas draußen ist**: Position löschen oder Soll unter Unterwegs senken wird abgelehnt, Umbenennen geht und die Entnahme behält den alten Text. → Test in Task 2.
4. **Ausmustern oder Löschen mit offener Entnahme bzw. Verlauf**: abgelehnt mit Grund. → Tests in Task 2 und Task 5.
5. **Anonymer Besucher** sieht keine Namen und keinen Zweck. → Test in Task 4 (`unterwegsText`).

---

### Task 1: Schema, Migration, Prüfanleitung

**Files:**
- Modify: `src/app/m/wartung/_db/schema.ts` (Tabelle `geraet`, neue Tabellen nach `inhalt`)
- Create: `src/app/m/wartung/_db/migrations/0007_ausleihe.sql` (+ `meta/0007_snapshot.json`, `meta/_journal.json` via drizzle-kit)
- Modify: `src/core/audit/catalog.ts` (Block `"wartung"`)
- Modify: `src/app/m/wartung/_lib/eingabe.ts` (`geraetEingabe`), `_lib/typen.ts` (`GeraetZeile`), `_lib/daten.ts` (`ladeGeraete`/`ladeGeraet` liefern das Feld)
- Modify: `src/app/m/wartung/_ui/GeraetFormular.tsx` (Feld neben „Hinweise“)
- Test: `src/app/m/wartung/_lib/schreiben.test.ts`

**Interfaces:**
- Produces:
  - `geraet.pruefanleitung: text NOT NULL DEFAULT ''`
  - Tabelle `entnahme`: `id` text PK (= Sendungs-ID vom Telefon), `geraet_id` FK cascade, `nutzer` text NOT NULL, `wer` text NOT NULL DEFAULT '', `zweck` text NOT NULL DEFAULT '', `ganz` integer boolean NOT NULL, `entnommen_am` integer NOT NULL, `zurueck_am` integer NULL, `zurueck_wer` text NULL; Index `entnahme_offen_idx` auf (`geraet_id`, `zurueck_am`).
  - Tabelle `entnahme_position`: `id` text PK, `entnahme_id` FK cascade, `inhalt_id` FK `ON DELETE SET NULL`, `text` text NOT NULL, `menge` integer NOT NULL CHECK ≥ 1, `zurueck` integer NOT NULL DEFAULT 0 CHECK `zurueck >= 0 AND zurueck <= menge`, `fehlt` integer boolean NOT NULL DEFAULT false; Index auf `entnahme_id` und auf `inhalt_id`.
  - drizzle-Exports `entnahme`, `entnahmePosition`.
  - `GeraetEingabe.pruefanleitung: string` (zod `frei(NOTIZ_MAX).default("")`), `GeraetZeile.pruefanleitung: string`.

- [ ] **Step 1: Failing test** in `schreiben.test.ts`, `describe("Prüfanleitung (IDA-372)")`:
  `it("speichert die Prüfanleitung am Gerät und liest sie zurück")` — `geraetAnlegen` mit `pruefanleitung: "Kabel auf Knicke ansehen.\nAlles zählen."`, dann `expect(ladeGeraet(db, id, HEUTE)!.pruefanleitung).toBe("Kabel auf Knicke ansehen.\nAlles zählen.")`.
- [ ] **Step 2:** `pnpm vitest run src/app/m/wartung/_lib/schreiben.test.ts` → FAIL (Typfehler/undefined).
- [ ] **Step 3:** Schema ergänzen, dann `pnpm exec drizzle-kit generate --config src/app/m/wartung/_db/drizzle.config.ts --name ausleihe`. In die erzeugte SQL von Hand (Muster `0005_materialkisten.sql`): Kopfkommentar „IDA-372: …“, `ON DELETE SET NULL` bei `inhalt_id` prüfen, `DROP TRIGGER audit_geraet_update` + Neuanlage mit allen Spalten inkl. `pruefanleitung`, je neue Tabelle `audit_<tabelle>_create/_update/_delete` (UPDATE-Trigger mit OR über alle Spalten). In `catalog.ts` beide Tabellen `mode: "audited"`, `primaryKey: ["id"]`. Eingabe, Typ, Laden, Formularfeld („Prüfanleitung“, mehrzeilig, Hilfetext „Wie man diese Kiste bzw. dieses Gerät durchgeht. Steht beim Durchzählen und beim Zurücklegen.“). Alle Stellen, die `GeraetEingabe` bauen (Tests, `_mcp/werkzeuge.ts` `wartung_geraet_anlegen`/`_aendern`, `seedLokal.ts`), kompilieren lassen — MCP-Parameter selbst kommen in Task 6.
- [ ] **Step 4:** `pnpm vitest run src/app/m/wartung src/core/audit` → PASS; `pnpm typecheck` → Exit 0.
- [ ] **Step 5: Commit** `feat(wartung): Prüfanleitung je Gerät und Tabellen für Entnahmen`

---

### Task 2: Entnehmen, Zurücklegen, Sperren (fachliche Regeln)

**Files:**
- Create: `src/app/m/wartung/_lib/ausleihe.ts`
- Modify: `src/app/m/wartung/_lib/schreiben.ts` (`Kontext` exportieren, `geraetAktiv`, `inhaltSpeichern`)
- Modify: `src/app/m/wartung/_lib/eingabe.ts` (zwei Schemas)
- Test: `src/app/m/wartung/_lib/ausleihe.test.ts` (Muster `kisten.test.ts`, `testDb()`)

**Interfaces:**
- Consumes: Tabellen aus Task 1; `Abgelehnt`, `neueId`, `aktivesGeraet` (in `schreiben.ts` exportieren), `mangel`-Regeln wie in `pruefungAbschliessen`.
- Produces (in `ausleihe.ts`):
  ```ts
  export interface OffeneEntnahme {
    id: string; wer: string; nutzer: string; zweck: string; ganz: boolean; seit: number;
    positionen: { id: string; inhaltId: string | null; text: string; menge: number; zurueck: number; offen: number }[];
  }
  export interface Unterwegs {
    ganz: OffeneEntnahme | null;          // offene ganze Entnahme, sonst null
    jePosition: Map<string, number>;      // inhaltId → unterwegs (bei ganz: jeweils soll)
    entnahmen: OffeneEntnahme[];          // alle offenen, älteste zuerst
  }
  export function unterwegsStand(db: Pick<WartungDb, "select">, geraetId: string): Unterwegs;
  export function hatOffeneEntnahme(db: Pick<WartungDb, "select">, geraetId: string): boolean;
  export function entnehmen(db: WartungDb, geraetId: string, e: EntnahmeEingabe, k: Kontext & { nutzer: string }): void;
  export function zuruecklegen(db: WartungDb, geraetId: string, r: RueckgabeEingabe, k: Kontext): { maengel: number };
  /** Schließt eine ganze Entnahme; nur aus pruefungAbschliessen (Task 3) und für Geräte ohne Inhaltsliste. */
  export function ganzeSchliessen(tx: WartungSchreiber, geraetId: string, entnahmeId: string, k: Kontext): void;
  ```
- Produces (in `eingabe.ts`):
  ```ts
  export const entnahmeEingabe = z.object({
    sendung: idSchema, ganz: z.boolean(), zweck: frei(KURZ_MAX).default(""),
    positionen: z.array(z.object({ inhaltId: idSchema, menge: z.number().int().min(1).max(SOLL_MAX) })).max(INHALT_MAX),
  });
  export const rueckgabeEingabe = z.object({
    entnahmeId: idSchema,
    // je Position: was jetzt zurückkommt, ob der Rest fehlt, und die Offen-Menge, die auf dem Bildschirm stand
    positionen: z.array(z.object({ positionId: idSchema, zurueck: z.number().int().min(0).max(SOLL_MAX), fehlt: z.boolean(), offen: z.number().int().min(1) })).max(INHALT_MAX),
  });
  ```

Regeln (aus Spec 6.2–6.4), alle als `Abgelehnt`:
- `entnehmen`: Gerät aktiv; gleiche `sendung` schon da (gleiches Gerät) → still nichts tun; fremdes Gerät → `UNGUELTIG`. `ganz` nur ohne offene Entnahme; Teil-Entnahme nur ohne offene ganze und nur an einer Kiste; `ganz === false` braucht ≥ 1 Position; Positionen müssen zur Kiste gehören; je Position `menge ≤ soll − unterwegs` („Es sind nur noch n da.“). Gerät ohne Inhaltsliste: nur `ganz`. Speichert `text` der Position zum Zeitpunkt.
- `zuruecklegen`: Entnahme offen und vom Gerät; nicht `ganz` an einer Kiste (die läuft übers Durchzählen, Task 3); Gerät ohne Inhaltsliste → `ganzeSchliessen`. Je Antwort: `offen` muss `menge − zurueck` entsprechen, sonst „Das wurde inzwischen schon zurückgelegt. Bitte die Seite neu laden.“; `zurueck ≤ offen`. `zurueck` erhöhen; ist die Position danach vollständig, offenen Fehlt-Mangel dieser `inhaltId` beheben (mit `eintrag` „Wieder vollständig“ wie in `pruefungAbschliessen`). `fehlt === true` mit Rest > 0: `fehlt` setzen und Fehlt-Mangel melden, falls für die `inhaltId` keiner offen ist — `einsatzbereit: true`, Text `Fehlt: <text> (<rest> von <menge> nicht zurück)`, plus `eintrag` Typ `mangel` wie `mangelMelden`. Entnahme schließen (`zurueck_am`, `zurueck_wer`), wenn jede Position vollständig oder `fehlt` ist.
- `geraetAktiv(…, false)` mit offener Entnahme → „Erst zurücklegen: Es ist noch etwas unterwegs.“
- `inhaltSpeichern`: Position mit Unterwegs > 0 entfernen → „<text> ist gerade unterwegs und kann nicht von der Liste.“; `soll` unter Unterwegs → „<text>: Es sind gerade n unterwegs.“

- [ ] **Step 1: Failing tests** in `ausleihe.test.ts` (Kiste mit Inhalt „Patchkabel 10 m“ soll 4, „Blitzschutz“ soll 2; `K = { jetzt, heute, wer: "Helfer A", nutzer: "sub-a" }`):
  - `entnimmt Teile und zeigt sie als unterwegs` — 2 × Patchkabel → `unterwegsStand(...).jePosition.get(patch)` = 2, `entnahmen[0].wer` = "Helfer A", `zweck` wie eingegeben.
  - `dieselbe Sendung zweimal steht nur einmal da` — zweimal `entnehmen` mit gleicher `sendung` → `entnahmen.length` = 1.
  - `mehr als da ist wird abgelehnt` — 3 + 2 Patchkabel → zweiter Aufruf wirft `Abgelehnt` /nur noch 1/.
  - `ganze Kiste schließt weitere Entnahmen aus` — ganz, dann Teil → `Abgelehnt`; umgekehrt Teil, dann ganz → `Abgelehnt`; bei ganz ist `jePosition.get(patch)` = 4.
  - `Teil-Rückgabe mit Nachreichen` — 2 entnommen, `zurueck: 1, fehlt: false` → unterwegs 1, Entnahme offen; danach `zurueck: 1` → unterwegs 0, Entnahme geschlossen (`entnahmen.length` = 0).
  - `veraltete Rückgabe wird abgelehnt` — zweimal dieselbe Rückgabe mit `offen: 2` → zweiter wirft `Abgelehnt` /schon zurückgelegt/.
  - `Rest als fehlend wird ein einsatzbereiter Fehlt-Mangel` — 2 entnommen, `zurueck: 1, fehlt: true` → ein offener `mangel` mit `fehlt = true`, `inhaltId = patch`, `einsatzbereit = true`; Entnahme geschlossen; `ungepushteAusfaelle(db, 0)` leer.
  - `vollständige Rückgabe behebt einen alten Fehlt-Mangel` — offener Fehlt-Mangel an Patch vorher angelegt, dann 1 entnommen, 1 zurück → Mangel `behobenAm` gesetzt.
  - `Ausmustern mit offener Entnahme wird abgelehnt` — `geraetAktiv(db, id, false, …)` wirft `Abgelehnt` /Erst zurücklegen/.
  - `Inhaltsliste: unterwegs schützt Position und Soll` — Position löschen → `Abgelehnt`; Soll 4 → 1 bei 2 unterwegs → `Abgelehnt`; Umbenennen geht, `entnahmen[0].positionen[0].text` bleibt alter Text.
  - `Gerät ohne Inhaltsliste: ganz entnehmen und zurücklegen` — Stromerzeuger aus Startbestand, `ganz: true, positionen: []` → offen; `zuruecklegen(…, { entnahmeId, positionen: [] })` → geschlossen.
- [ ] **Step 2:** `pnpm vitest run src/app/m/wartung/_lib/ausleihe.test.ts` → FAIL.
- [ ] **Step 3:** `ausleihe.ts` und die Änderungen in `schreiben.ts` / `eingabe.ts` umsetzen, jede schreibende Funktion in `db.transaction`.
- [ ] **Step 4:** `pnpm vitest run src/app/m/wartung` → PASS; `pnpm typecheck` → 0.
- [ ] **Step 5: Commit** `feat(wartung): Entnehmen und Zurücklegen mit Fehlt-Mängeln und Sperren`

---

### Task 3: Durchzählen mit Unterwegs, Rückgabe der ganzen Kiste

**Files:**
- Modify: `src/app/m/wartung/_lib/schreiben.ts` (`pruefungAbschliessen`, `pruefpunkte`)
- Modify: `src/app/m/wartung/_lib/eingabe.ts` (`pruefungEingabe`)
- Modify: `src/app/m/wartung/_lib/telefon.ts` (`ladeAmGeraet` liefert `unterwegs`)
- Modify: `src/app/m/wartung/_ui/telefon/PruefungAmGeraet.tsx`, `(geraet)/g/[id]/pruefung/page.tsx`, `(geraet)/g/[id]/pruefung/senden/route.ts`
- Test: `src/app/m/wartung/_lib/kisten.test.ts`

**Interfaces:**
- Consumes: `unterwegsStand`, `ganzeSchliessen` (Task 2).
- Produces:
  - `pruefungEingabe.antworten[].unterwegs?: number` (int ≥ 0, nur Kiste; fehlt = 0) und `pruefungEingabe.rueckgabe?: string` (`idSchema`, Entnahme-ID einer offenen ganzen Entnahme).
  - `AmGeraet.unterwegs: Unterwegs` und `AmGeraet.pruefanleitung` über `g.pruefanleitung`.

Regeln: Bei einer Kiste gilt als „ok“ je Position: `soll − unterwegs` sind da. Weicht `x.unterwegs ?? 0` vom aktuellen `jePosition` ab → bestehende Meldung „Die Inhaltsliste hat sich geändert. Bitte neu durchzählen.“ Offene ganze Entnahme ohne passendes `rueckgabe` → „Die Kiste ist unterwegs seit <TT.MM.>. Durchzählen geht, wenn sie zurück ist.“ Mit `rueckgabe` = ID der offenen ganzen Entnahme: gezählt wird gegen den vollen Soll (unterwegs 0), danach `ganzeSchliessen` in derselben Transaktion; der `eintrag` Typ `pruefung` mit der internen Prüfart entsteht wie immer (setzt die Frist). `rueckgabe` mit anderer/geschlossener ID → `UNGUELTIG`-Satz. Fehlt-Mängel aus einer normalen Zählung bleiben wie heute.

- [ ] **Step 1: Failing tests** in `kisten.test.ts`, `describe("Durchzählen mit Unterwegs (IDA-372)")`:
  - `2 Patchkabel unterwegs, alles andere da: in Ordnung ohne Mangel` — Antwort Patch `ok: true, unterwegs: 2`, Ergebnis `ok` → `maengel` = 0, kein offener Mangel.
  - `veralteter Unterwegs-Stand wird abgelehnt` — Antwort `unterwegs: 0`, obwohl 2 unterwegs → `Abgelehnt` /neu durchzählen/.
  - `ganze Kiste unterwegs sperrt das Durchzählen` → `Abgelehnt` /unterwegs seit/.
  - `Rückgabe der ganzen Kiste zählt als Prüfung` — ganz entnommen, `pruefungAbschliessen` mit `rueckgabe: <id>`, alles ok → `unterwegsStand(...).ganz` = null; jüngster `eintrag` Typ `pruefung` mit `pruefartId` der internen Prüfart (Quartal aus `START`) am Tag `HEUTE`.
- [ ] **Step 2:** `pnpm vitest run src/app/m/wartung/_lib/kisten.test.ts` → FAIL.
- [ ] **Step 3:** Umsetzen; `PruefungAmGeraet` zeigt je Position „davon n unterwegs“ und schickt `unterwegs` mit; Seite `pruefung` nimmt `?rueckgabe=<id>` an (nur wenn sie zur offenen ganzen Entnahme passt, sonst ignorieren), zeigt dann Titel „Kiste zurücklegen“ und die Prüfanleitung über der Liste. Die Prüfanleitung steht auch beim normalen Durchzählen über der Liste (leer = nichts).
- [ ] **Step 4:** `pnpm vitest run src/app/m/wartung` → PASS; `pnpm typecheck` → 0.
- [ ] **Step 5: Commit** `feat(wartung): Durchzählen rechnet mit Unterwegs, ganze Kiste zurücklegen zählt als Prüfung`

---

### Task 4: Telefon — Entnehmen, Zurücklegen, Hinweis „unterwegs“

**Files:**
- Modify: `src/app/m/wartung/_lib/vorgaenge.ts` (Stufe „zugang“; `kontext()` bekommt `nutzer`)
- Modify: `src/app/m/wartung/_actions/telefon.ts`
- Create: `src/app/m/wartung/_lib/unterwegsText.ts`
- Create: `src/app/m/wartung/(geraet)/g/[id]/entnehmen/page.tsx`, `src/app/m/wartung/(geraet)/g/[id]/zuruecklegen/page.tsx`
- Create: `src/app/m/wartung/_ui/telefon/EntnehmenAmGeraet.tsx`, `src/app/m/wartung/_ui/telefon/ZuruecklegenAmGeraet.tsx`
- Modify: `src/app/m/wartung/(geraet)/g/[id]/page.tsx` (Steckbrief)
- Test: `src/app/m/wartung/_lib/unterwegsText.test.ts`, `src/app/m/wartung/_ui/telefon/entwurf.test.tsx` (DOM-Harness `src/app/m/qr/_lib/test-dom.tsx`)

**Interfaces:**
- Consumes: `entnehmen`, `zuruecklegen`, `ganzeSchliessen`, `unterwegsStand`, `entnahmeEingabe`, `rueckgabeEingabe` (Task 2); `AmGeraet.unterwegs` (Task 3); `nutzerAus` aus `_lib/zugang.ts`.
- Produces:
  - `entnehmenVorgang(z: Akteur, geraetId: unknown, eingabe: unknown): Promise<Ergebnis>`, `zuruecklegenVorgang(z: Akteur, geraetId: unknown, eingabe: unknown): Promise<Ergebnis>` — Stufe „zugang“, jeder Angemeldete mit Modulzugang, auch für fremde Entnahmen.
  - `entnehmenAction(geraetId: string, eingabe: unknown)`, `zuruecklegenAction(geraetId: string, eingabe: unknown)` in `_actions/telefon.ts` (Muster `stundenEintragenAction`).
  - `unterwegsText(u: Unterwegs, mitNamen: boolean): string | null` — `null` ohne offene Entnahme; sonst z. B. `"Unterwegs: 2 × Patchkabel 10 m, 1 × Blitzschutz – seit 07.11., Übung Stadtfest, Helfer A"`; ganz: `"Ganze Kiste unterwegs – seit 07.11., …"`; mehrere Entnahmen mit „ · “ getrennt. Datum über `zeitFormat`/`zeitzone()` (nie Zone als Literal). `mitNamen === false`: ohne Zweck und Name.

Seiten:
- Steckbrief: Karte „Unterwegs“ oben (nach Kopf), Text aus `unterwegsText(u, zugang)`. Mit Zugang die Knöpfe „Entnehmen“ (`/g/[id]/entnehmen`, nicht bei offener ganzer Entnahme) und „Zurücklegen“ (nur mit offener Entnahme). Ganze Kiste offen → „Zurücklegen“ führt auf `/g/[id]/pruefung?rueckgabe=<id>`.
- `entnehmen`: Riegel `geraetOder404(params, "entnehmen")`. Kiste: Inhaltsliste mit Zähler je Position (0 bis `soll − unterwegs`), Knopf „Ganze Kiste mitnehmen“, Feld „Wofür? (optional)“, Hinweis „Kurz ansehen, ob alles heil ist.“; Gerät: nur „Mitnehmen“ mit Zweck. `sendung` einmal je Seitenaufruf ziehen (Muster `PruefungAmGeraet`). Nach Erfolg zurück auf den Steckbrief.
- `zuruecklegen`: Prüfanleitung oben, darunter je offener Teil-Entnahme (Kopf: Zweck, wer, seit) die Positionen mit Zähler „wieder da“ (Default = offen) und Umschalter „Rest: noch draußen / fehlt“ (Default noch draußen); `offen` mitschicken. „Mangel melden“ verlinkt `/g/[id]/mangel`. Gerät ohne Inhaltsliste: „In Ordnung“ und „Mangel melden“.

- [ ] **Step 1: Failing tests:**
  - `unterwegsText.test.ts`: `zeigt Teile mit Name und Zweck`, `ganze Kiste`, `ohne Anmeldung ohne Name und Zweck` (Ergebnis enthält weder „Helfer A“ noch „Stadtfest“), `nichts unterwegs → null`.
  - `entwurf.test.tsx`: `ZuruecklegenAmGeraet setzt „wieder da“ auf die offene Menge und schickt offen mit` (Render mit einer Entnahme 2 × Patchkabel, Absenden mit gemockter Action, erwartet `{ zurueck: 2, fehlt: false, offen: 2 }`).
- [ ] **Step 2:** `pnpm vitest run src/app/m/wartung/_lib/unterwegsText.test.ts src/app/m/wartung/_ui/telefon/entwurf.test.tsx` → FAIL.
- [ ] **Step 3:** Umsetzen.
- [ ] **Step 4:** Tests → PASS; `pnpm typecheck` → 0; `pnpm lint` → 0.
- [ ] **Step 5: Commit** `feat(wartung): Entnehmen und Zurücklegen am Telefon`

---

### Task 5: Verwaltung — Akte, Unterwegs-Übersicht, endgültig löschen

**Files:**
- Modify: `src/app/m/wartung/_lib/schreiben.ts` (neu `geraetLoeschen`)
- Modify: `src/app/m/wartung/_lib/vorgaenge.ts` (Stufe „verwalter“), `src/app/m/wartung/_actions/verwaltung.ts`
- Modify: `src/app/m/wartung/_lib/daten.ts` (`GeraeteFilter.unterwegs?: boolean`, `GeraetZeile.unterwegs: boolean`), `_lib/typen.ts`
- Modify: `src/app/m/wartung/_ui/GeraetAkte.tsx`, `src/app/m/wartung/_ui/GeraeteListe.tsx`, `(verwaltung)/geraete/page.tsx`
- Test: `src/app/m/wartung/_lib/schreiben.test.ts`

**Interfaces:**
- Consumes: `hatOffeneEntnahme`, `unterwegsStand` (Task 2), `unterwegsText` (Task 4), `entferneUnterlage(id, typ)` aus `_lib/unterlagen.ts`.
- Produces:
  - `geraetLoeschen(db: WartungDb, id: string): { unterlagen: { id: string; typ: "pdf" | "bild" }[] }` — nur ausgemustert („Nur ausgemusterte Akten lassen sich endgültig löschen.“), ohne `eintrag`, `mangel`, `entnahme` („Diese Akte hat einen Verlauf. Bitte ausgemustert lassen.“); löscht Gerät (Cascade räumt Inhalt, Prüfplan-Abweichungen, Unterlagen-Zeilen) und gibt die Unterlagen zurück, deren Dateien der Vorgang danach mit `entferneUnterlage` wegräumt.
  - `geraetLoeschenVorgang(z: Akteur, id: unknown): Promise<Ergebnis>` — `eigenesGeraet(rechte, id)` (Verwalter der Gruppe).
  - `darfEndgueltigLoeschen(db, id): boolean` in `daten.ts` für die Sichtbarkeit des Knopfs.

UI: Akte zeigt Prüfanleitung (lesend, Bearbeiten im Formular aus Task 1), Karte „Unterwegs“ mit `unterwegsText(u, true)`, Abschnitt „Entnahmen“ (letzte 20, auch geschlossene: seit, zurück am, wer, Zweck, Positionen), Knopf „Akte endgültig löschen“ (danger, mit `Popconfirm` „Die Akte und ihre Unterlagen sind danach weg.“) nur wenn `darfEndgueltigLoeschen`; nach Erfolg auf `/m/wartung/geraete`. Geräteliste: Filter „Unterwegs“.

- [ ] **Step 1: Failing tests** in `schreiben.test.ts`, `describe("Endgültig löschen (IDA-372)")`:
  - `löscht eine ausgemusterte Akte ohne Verlauf samt Inhalt und Unterlagen` — Kiste mit Inhalt + `unterlageAnlegen`, ausmustern, `geraetLoeschen` → Rückgabe nennt die Unterlage; `geraet`, `inhalt`, `unterlage` für die ID leer.
  - `aktive Akte wird abgelehnt` → `Abgelehnt` /Nur ausgemusterte/.
  - `Akte mit Verlauf wird abgelehnt` — `stundenEintragen` vorher → `Abgelehnt` /hat einen Verlauf/.
  - `danach lässt sich die Art löschen` — einzige Akte einer neuen Art löschen, dann `artLoeschen` wirft nicht.
- [ ] **Step 2:** → FAIL. **Step 3:** umsetzen. **Step 4:** `pnpm vitest run src/app/m/wartung` → PASS, `pnpm typecheck`, `pnpm lint` → 0.
- [ ] **Step 5: Commit** `feat(wartung): Akte endgültig löschen, Unterwegs in der Verwaltung`

---

### Task 6: MCP

**Files:**
- Modify: `src/app/m/wartung/_mcp/werkzeuge.ts`
- Test: `src/app/m/wartung/_mcp/werkzeuge.test.ts`

**Interfaces:**
- Consumes: `geraetLoeschenVorgang` (Task 5), `unterwegsStand` (Task 2), `pruefungEingabe.antworten[].unterwegs` (Task 3).
- Produces:
  - `wartung_geraet_anlegen` / `wartung_geraet_aendern`: optionaler Parameter `pruefanleitung` (Text, `NOTIZ_MAX`); `aendern` ohne Angabe behält den alten Wert.
  - `wartung_geraet`: `pruefanleitung` und `unterwegs: { ganz: boolean; seit: string /* JJJJ-MM-TT */; zweck: string; positionen: { inhalt_id: string | null; text: string; offen: number }[] }[]` — keine Felder `wer`/`nutzer`. Bei Inhaltspositionen zusätzlich `unterwegs: number`.
  - `wartung_geraete`: je Gerät `unterwegs: boolean`.
  - `wartung_pruefung_abschliessen`: je Antwort optional `unterwegs` (Beschreibung: „bei Kisten: wie viele laut wartung_geraet gerade unterwegs sind“).
  - Neu `wartung_geraet_loeschen` (`geraet_id`, Stufe „verwalter“, `annotations` wie die anderen schreibenden, Beschreibung: „Löscht eine ausgemusterte Akte ohne Verlauf endgültig, samt Inhalt und Unterlagen. Mit Verlauf bleibt sie ausgemustert.“).

- [ ] **Step 1: Failing tests** in `werkzeuge.test.ts` (Muster der bestehenden Werkzeug-Tests): `wartung_geraet liefert unterwegs ohne Namen` (JSON der Antwort enthält nicht den Anzeigenamen des Entnehmenden), `wartung_geraet_aendern setzt die Prüfanleitung`, `wartung_geraet_loeschen löscht eine unbenutzte ausgemusterte Akte`, `wartung_geraet_loeschen lehnt eine Akte mit Verlauf ab`.
- [ ] **Step 2:** → FAIL. **Step 3:** umsetzen. **Step 4:** `pnpm vitest run src/app/m/wartung/_mcp` → PASS, `pnpm typecheck` → 0.
- [ ] **Step 5: Commit** `feat(wartung): MCP für Prüfanleitung, Unterwegs und endgültiges Löschen`

---

### Task 7: Release Note, Gesamtprüfung

**Files:**
- Create: `src/app/m/portal/_lib/neuigkeiten/notizen/wartung/2026-11-08-entnehmen.ts` (Muster `2026-11-06-pruefarten.ts`)
- Modify: `src/app/m/portal/_lib/neuigkeiten/register.ts`, `docs/release-notes.md`

- [ ] **Step 1:** Notiz, Du-Form, ohne Datei-/Ticketnamen, ein Absatz mit ein bis drei Sätzen, z. B.: „Am QR-Code einer Kiste kannst du jetzt Material entnehmen und zurücklegen: einzelne Teile oder die ganze Kiste. Beim Zurücklegen gehst du die Prüfanleitung der Kiste durch, und was nicht zurückkommt, wird als fehlend gemeldet. Ausgemusterte Akten ohne Verlauf lassen sich unter Geräte endgültig löschen.“
- [ ] **Step 2:** `pnpm vitest run` → PASS (inkl. `register.test.ts`, `core/audit/catalog.test.ts`, `kommentaranker.test.ts`); `pnpm typecheck`, `pnpm lint` → 0; `pnpm anker:neu` → keine neuen Zeilenanker; `pnpm build` → erfolgreich.
- [ ] **Step 3: Commit** `docs(wartung): Neuigkeit Entnehmen und Zurücklegen`
