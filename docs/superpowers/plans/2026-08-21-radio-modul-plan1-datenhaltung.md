# Planteil 1 von 5 · Die Datenhaltung des Moduls `radio` — Umsetzungsplan (Spec 1, Kapitel 2)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development
> (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:** `src/app/m/radio/_db/` entsteht — sechs Tabellen, zwei Migrationen, das
Registrierungs-Dreieck und der lokale Seed. Danach existiert `radio.db`, und die **drei
Leerstellen ⬜ L1, ⬜ L3 und ⬜ L4 sind ablesbar**, an denen seit dem 2026-08-19 dreizehn Aufgaben
des Import-Wegs (B5–B17) und zwei des Cutover-Wegs (C9, C15) stillstehen.

**Architecture:** Der Plan hat **zwei Hälften mit einer scharfen Grenze.** Aufgaben **M1–M3** sind
**ein Block mit genau einem Tor**: vier Tests im Bestand koppeln Schemaverzeichnis,
`MODULE_MIGRATIONS`, `Dockerfile`-`COPY` und `SEED_MODULE` aneinander, und zwischen dem Anlegen der
Schemadatei und der letzten Verdrahtung **kann kein Tor grün sein**. Rot dazwischen ist der Zweck,
nicht der Fehler. Aufgaben **M4–M6** sind einzeln abgeschlossen: der Quelltext-Scan gegen den
Löschweg, die Retention-Rechnung, und die Abnahme von Hand, die die drei ⬜ abliest. Innerhalb einer
Aufgabe gilt die TDD-Folge: fehlschlagender Test → **Fehlschlag sehen** → minimale Umsetzung → grün.

**Tech Stack:** Next.js 16.3.0 · TypeScript · drizzle-orm 0.45.2 · drizzle-kit 0.31.10 ·
better-sqlite3 13.0.2 · nanoid 6.0.1 · Vitest (installiert: **4.1.10**, Sperrdatei) · SQLite · `tsx`

**Spec:** `docs/superpowers/specs/2026-08-17-radio-modul-design.md` — **Kapitel 2** (Zeilen 778–1978)
ist der Auftrag; **Kapitel A** (die 15 Entscheidungen) und **Kapitel B** (B1–B19) sind
mitverbindlich und **stechen jeden abweichenden Kapiteltext**.

**Leitplan:** `2026-08-21-radio-modul-leitplan.md` — dort stehen die Nahtstellen **NS-M1 bis NS-M8**,
die Stufenfolge und die eine begründete Abweichung von ihr.

---

## ⚠️ Fünf Dinge, die diesen Plan von einem gewöhnlichen Umsetzungsplan unterscheiden

**1. Drei Stellen der Spec-Prosa sind von Kapitel B überholt, und wer sie baut, baut falsch.**
§2.4 sagt „`label` ist das Anzeigefeld" — es heißt **`bezeichnung`** (B6). §2.4 sagt in einem eigenen
Absatz mit drei ausgeschriebenen Gründen „**`loans` bekommt KEINE Spalte für den Zugangsweg. Weder
`zugangscode_id` noch ein `quelle`-Feld**" — **`zugangscode_id` kommt** (B6). §2.9.3 sagt „`radio`
hat keine modul-eigene Boot-Prüfung" — sie hat eine, und sie gehört Kapitel 7 (B8). Alle drei sind
gültiges Drizzle, gültiges SQL und **paritätsgrün**; kein Tor sieht sie. Verbindlich ist Kapitel B.

**2. Dieser Plan fasst `scripts/import/` NICHT an.** §2.2.4 und §2.2.5 der Spec schreiben
`msZuDatum`, `tagInBerlin`, die fünf `toNeues*`-Mapper und den Fixture-Testsatz aus — **dieselben
Funktionen sind der Gegenstand von Spec 2, Kapitel 1**, und ihre Quellseite ist am 2026-08-20
**gebaut** (B1–B4, Commits `a309f12` … `07b5f41`, 17 Tests grün). Wer §2.2.4 als Bauauftrag liest,
baut B5–B7 zum zweiten Mal und in einer zweiten Form. Die Richtung ist umgekehrt: **dieser Plan
liefert, was B5 braucht** (Naht NS-M2, NS-M3).

**3. Der Retention-**Takt** gehört nicht hierher, die Retention-**Rechnung** schon.** Entschieden in
B5: Kapitel 2 besitzt `retentionGrenze` und `raeumeLeihhistorie`; **Registrierung, Verzögerung,
Abschalter und Takt** besitzt Kapitel 7 §7.3.5 — und beide Kapitel schreiben denselben
`startBackgroundWork()`-Rumpf aus. Gebaut wären zwei Timer in einer Datei und zwei Läufe je Takt.
⚠️ **Folge:** einer der drei Tests, ohne die Kapitel 2 keinen Schutz hat
(`starteRadioHintergrund loescht beim Start NICHTS`), entsteht in **Planteil 5**, nicht hier. Bis
dahin ist die Regressionssperre gegen den zurückgebauten Sofort-Purge nicht gebaut. Das ist bewusst.

**4. Vor Planteil 2 entsteht keine Fläche — und ein Test hält das fest.** Keine `page.tsx`, keine
`_actions/*.ts`, kein `route.ts`, keine `layout.tsx` unter `src/app/m/radio/`. Der Host-Riegel steht
erst in Planteil 2; eine Seite ohne ihn ist von **jedem** Suite-Host erreichbar (Falle 61), und
`pnpm typecheck`, `pnpm lint` und `pnpm build` sind dabei alle drei grün. Aufgabe **M4** baut den
Quelltext-Scan, der es fängt.

**5. Der partielle Index ist der einzige Riegel einer Invariante — und sein Fehlen ist grün.**
`loans_device_active_uidx` erzwingt „höchstens eine aktive Ausleihe je Gerät". `drizzle-kit` kann
partielle Indizes **nicht** emittieren, also entsteht er von Hand. Wird er vergessen, erfüllen die
Altdaten die Invariante trotzdem, der Import ist grün, und sichtbar wird es erst beim zweiten
Ausleihen desselben Geräts. ⚠️ Und die **Textsuche** auf ihn schlägt fehl, nicht der Index: gemessen
für B1–B4 ergibt `instr(sql,'WHERE returned_at IS NULL')` auf `sqlite_master.sql` **`0`**, weil die
DDL Backticks trägt. **Die Strukturprobe trägt:**
`select name, partial, "unique" from pragma_index_list('loans')`.

---

## Global Constraints

* **Kommandos, alle mit `rtk` präfixt, auch in Ketten mit `&&`:** `rtk pnpm typecheck` ·
  `rtk pnpm lint` · `rtk pnpm vitest run` · `rtk pnpm exec drizzle-kit generate --config <pfad>` ·
  `rtk pnpm seed:lokal` · `rtk git …`

* ⚠️ **Das Tor ist gemessen und es ist nicht „voller vitest run grün".** Der volle
  `rtk pnpm vitest run` ist in diesem Repo **vorbestehend rot**: am 2026-08-20 gemessen
  **170 Fehlschläge in 9 Dateien** (`m/feedback`, `m/files`, `m/qr`, `components/providers`); die
  Gegenprobe **ohne** die vier B1–B4-Dateien ergibt **171 in 10 Dateien**, also einen **mehr**.
  Leitbild: `TypeError: Cannot read properties of undefined (reading 'clear')` auf
  `localStorage.clear()` — diese Tests laufen in der `node`-Umgebung statt in jsdom.
  **Als Tor je Aufgabe gilt deshalb:** `rtk pnpm typecheck` **0 Fehler** · `rtk pnpm lint`
  **0 Fehler** · **die eigenen Testdateien der Aufgabe grün** · **kein neuer Fehlschlag** in einer
  Datei, die der Diff nicht anfasst. Behauptet jemand, seine Änderung habe die Suite rot gemacht:
  **Beiseitelege-Gegenprobe** (eigene Dateien temporär verschieben, voll laufen lassen,
  zurücklegen), nicht der Zählwert allein.

* **Nach jeder Aufgabe** das Tor grün, dann committen — **Ausnahme: der Block M1–M3**, er hat genau
  ein Tor nach M3 und **einen** gemeinsamen Commit (Naht NS-M4). Ein Torlauf, der nicht gelaufen
  ist, ist kein grüner Torlauf.

* **`pnpm build` und Playwright werden von diesem Plan nicht berührt** — er legt keine Route und
  keine Seite an. Sie laufen einmal vor dem Merge.

* **Zeit ist Unix-SEKUNDEN im Ziel und epoch-MILLISEKUNDEN in der Quelle.** **Keine** Zeitspalte
  trägt `mode: "timestamp_ms"`. Die eine Ausnahme ist `devices.last_updated_at` — sie ist **TEXT**
  `YYYY-MM-DD` und keine Zeitspalte (§2.2.3). Die schärfste Formulierung im Haus:
  `src/app/m/lagerbuch/_db/schema.ts:11-16`.

* **Kein `"use client"` in einer Datei unter `_db/`, und auch nicht in `_lib/boot.ts`** — Falle 6.

* **Migrationen sind append-only.** Der Hash jeder Datei steht in `__drizzle_migrations`; eine neu
  erzeugte bestehende Datei lässt bereits migrierte Datenbanken in eine **Absturzschleife** laufen.
  Das hat in radio-admin **einmal die Produktion lahmgelegt** (`radio-admin/CLAUDE.md`, Abschnitt
  „Datenbank-Migrationen — APPEND-ONLY (kritisch)"). Der von `drizzle-kit` gewürfelte Name der
  `0000` wird **nicht** umbenannt.

* **Die SQL-Spaltennamen der fünf Alt-Tabellen bleiben zeichengleich zur Quelle** (`issi`,
  `loanable`, `snapshot_call_sign`), die TypeScript-Bezeichner ebenfalls (`snapshotCallSign`) —
  61 zuzuordnende Spalten, jede Umbenennung eine Verwechslungsgelegenheit, die kein Gate sieht
  (`docs/radio-portierung-analyse.md:743-747`). **`zugangscodes` ist deutsch benannt** — keine
  Quelle bindet sie.

* **`getModuleDb()` wird in Tests NICHT benutzt.** Sein Cache ist per Modulschlüssel gekeyt, nicht
  per `DATA_DIR` (`src/core/db/index.ts:26-35`). Tests bauen ihre DB selbst und migrieren sie —
  Hausform `src/app/m/lagerbuch/_db/migrations.test.ts:29-37` und `_db/testdb.ts:17-45`.

* **Deutsch, mit korrekten Umlauten, in Prosa und Kommentaren.** In TypeScript-Bezeichnern und in
  Testnamen **keine** Umlaute. **Niemals** in einem zitierten Wert oder einem Grep-Anker.

* **Belegpflicht.** Jede Behauptung in einem Kommentar nennt `datei:zeile`. Wo ein Wert erst der Bau
  hergibt, steht eine **benannte Leerstelle** (⬜), nie eine plausibel aussehende Erfindung.

* **Kein Worktree unter `.claude/worktrees/`** (251 Fremdfehlschläge, `vitest.config.ts:8-34`),
  **kein `pnpm build` vor einem Testlauf, den man ernst nimmt** (52 Fehlschläge, ebenda), **kein
  `pnpm dev` parallel zur Testsuite**.

* **Commits müssen signiert sein** (main-Ruleset), sonst blockiert der Merge trotz grüner CI.

* ⚠️ **Nicht `git add .`, nicht `-A`.** Im Arbeitsbaum liegen die unverfolgten Planungsdokumente
  dieses Wegs und `.idea/`. Namentlich stagen, mit `rtk git show --stat HEAD` nachsehen.

---

## Die Sperrtafel

**Keine Sperre.** Dieser Planteil wartet auf nichts — kein Bau, kein Server, kein Betreiber.
Das ist sein Zweck: er ist die Zäsur selbst.

| Vorbedingung | Stand |
|---|---|
| `src/app/m/radio/` existiert **nicht** | ✅ abgelesen 2026-08-21: `ls src/app/m` führt `alpha aufgaben beta feedback files gamma kioskdemo lagerbuch portal qr` — **kein `radio`**. ⚠️ Nur sechs davon haben ein `_db/` und stehen in `MODULE_MIGRATIONS`; `alpha`, `beta`, `gamma` und `kioskdemo` haben keins, und der Kopplungstest verlangt von ihnen deshalb nichts |
| `nanoid` ist Abhängigkeit | ✅ `package.json:32` (`nanoid ^6.0.1`), benutzt in `src/app/m/portal/_db/schema.ts:2` und `src/app/m/aufgaben/_db/schema.ts:2` |
| `drizzle-kit` ist devDependency | ✅ `package.json` (`drizzle-kit ^0.31.10`) |
| B1–B4 sind gebaut | ✅ `scripts/import/radio.ts` und `radio.test.ts` stehen, 17 Tests grün, HEAD `07b5f41` |

**Zwei Leerstellen, die dieser Plan selbst erzeugt und abliest** — sie sind **Ablesungen**, keine
Entscheidungen:

| ⬜ | Was | Wo abgelesen |
|---|---|---|
| **M-L1** | Der von `drizzle-kit` **gewürfelte** Name der generierten `0000_<name>.sql` | Aufgabe **M2**, Schritt 3 |
| **M-L2** | `select count(*) from __drizzle_migrations` in der erzeugten `radio.db` (= ⬜ **L4** der Cutover-Sperrtafel) | Aufgabe **M6**, Schritt 4 |

⚠️ **C.1 ist vorentschieden, nicht vom Betreiber bestätigt** („dauerhaft und sperrbar"). Fällt sie
später anders aus, ist das eine **additive** Migration `0002`, kein Umbau — die Spec sagt das selbst:
„Ein Wechsel auf ‚Sitzung je Scan' ändert **eine** Stelle im Schema und **eine** im Gate."

---

## Was dieser Plan anlegt und ändert

**Neu:**

```
src/app/m/radio/_db/schema.ts                        M1
src/app/m/radio/_db/client.ts                        M1
src/app/m/radio/_db/drizzle.config.ts                M1
src/app/m/radio/_db/migrations/0000_<gewuerfelt>.sql M2  (drizzle-kit)
src/app/m/radio/_db/migrations/0001_loans_aktiv_uidx.sql  M2  (von Hand)
src/app/m/radio/_db/migrations/meta/                  M2  (drizzle-kit + eine Handzeile)
src/app/m/radio/_db/migrations.test.ts               M2  (4 Tests)
src/app/m/radio/_db/append.test.ts                   M4  (2 Quelltext-Scans)
src/app/m/radio/_lib/seedLokal.ts                    M3
src/app/m/radio/_lib/boot.ts                         M5  (nur die Retention-Rechnung)
src/app/m/radio/_lib/boot.test.ts                    M5  (5 Faelle)
```

**Geändert:**

```
src/core/bootstrap.ts     M3  (eine MODULE_MIGRATIONS-Zeile + Kommentar; KEIN Schema-Import)
Dockerfile                M3  (eine COPY-Zeile hinter :56)
scripts/seed-lokal.ts     M3  (zwei Importe + eine SEED_MODULE-Zeile)
```

⛔ **Nicht angefasst:** `scripts/import/**` (Naht NS-M2) · `vitest.config.ts` · `src/core/registry.ts`
(das ist Planteil 2) · `seedAllModules()` in `bootstrap.ts` (Naht NS-M7) · alles unter
`src/app/m/radio/` außer `_db/` und `_lib/`.

---

## Aufgabe M1: Das Zielschema, der Verbindungsöffner, die drizzle-Konfiguration

⚠️ **Beginn des Blocks M1–M3.** Nach dieser Aufgabe ist `rtk pnpm vitest run src/core/bootstrap.test.ts`
**rot** — das ist ihr Zweck, nicht ihr Fehler (Naht NS-M4). **Kein Commit** vor M3.

**Files:**
- Create: `src/app/m/radio/_db/schema.ts`
- Create: `src/app/m/radio/_db/client.ts`
- Create: `src/app/m/radio/_db/drizzle.config.ts`

**Interfaces:**
- Consumes: nichts.
- Produces: `devices`, `softwareVersions`, `users`, `deviceEvents`, `loans`, `zugangscodes` ·
  die **zehn** Typaliase `NeuesGeraet`/`Geraet`, `NeueSoftwareVersion`/`SoftwareVersion`,
  `NeuerBenutzer`/`Benutzer`, `NeuesGeraeteEreignis`/`GeraeteEreignis`, `NeueLeihe`/`Leihe`
  (= ⬜ **L1**) · `getDb()` und `type DB` aus `client.ts`.

- [ ] **Schritt 1: Den roten Zustand zuerst sehen — er kommt von selbst**

Lauf **vor** jeder Änderung, damit der Ausgangsstand belegt ist:

```
rtk pnpm vitest run src/core/bootstrap.test.ts scripts/seed-lokal.test.ts
```

Erwartet: **grün**. Notiere die Fallzahl. Nach Schritt 2 ist derselbe Lauf **rot** mit
`jedes Modul mit _db/ steht in MODULE_MIGRATIONS` — das ist die Kopplung aus
`src/core/bootstrap.test.ts:90-97`, und sie ist der Grund für den Block.

- [ ] **Schritt 2: `schema.ts` schreiben**

Die sechs Tabellen stehen in Spec 1 §2.5.1–§2.5.6 **als Code** und werden von dort übernommen. Zwei
benannte Abweichungen von der Reihenfolge und der Prosa der Spec, beide unten im Code kommentiert:
`zugangscodes` steht **vor** `loans` (der Verweis `() => zugangscodes.id` ist ein Thunk und
funktionierte auch umgekehrt, aber die Deklaration vor der Benutzung liest sich richtig und hält
`no-use-before-define` fern), und die Anzeigespalte heißt **`bezeichnung`** (B6, nicht `label`).

```ts
// src/app/m/radio/_db/schema.ts
// KEIN "use client" (Falle 6): diese Datei wird ausschliesslich serverseitig gelesen.
//
// DIE SQL-SPALTENNAMEN SIND ZEICHENGLEICH ZUR QUELLE, und die TypeScript-Bezeichner
// bleiben ebenfalls die der Quelle (`snapshotCallSign`, `issi`, `loanable`), obwohl die
// juengeren Suite-Module deutsch benennen: der Importer ordnet 61 Spalten zu, und jede
// Umbenennung ist eine Verwechslungsgelegenheit, die kein Gate sieht
// (docs/radio-portierung-analyse.md:743-747 listet die vier verwechselbaren Paare).
// Die NEUE Tabelle `zugangscodes` ist deutsch benannt — sie hat keine Quelle, die sie bindet.
//
// IDs: bestehende Primaerschluessel wandern zeichengleich (cuid2 aus
// radio-admin/server/src/db/id.ts). Fuer NEUE Zeilen erzeugt die Suite `nanoid()` —
// Praezedenz: src/app/m/portal/_db/schema.ts:2 und src/app/m/aufgaben/_db/schema.ts:2.
// Beide Kennungsraeume koexistieren als Primaerschluessel derselben Tabelle; dieselbe
// Begruendung traegt in src/app/m/lagerbuch/_db/schema.ts:428-430.
import { sqliteTable, text, integer, index } from "drizzle-orm/sqlite-core";
import { nanoid } from "nanoid";

export const devices = sqliteTable("devices", {
  id: text("id").primaryKey().$defaultFn(nanoid),
  rufname: text("rufname"),
  issi: text("issi").notNull().unique(),
  // TEI = die im Geraet gebrannte Hardware-Identitaet, im Gegensatz zur umprogrammierbaren
  // issi. Optional und AUSDRUECKLICH NICHT unique: Geraete ohne erfasste TEI sind der
  // Normalfall (radio-admin/server/src/db/schema.ts:8-11). Ein `unique()` hier bricht den
  // Import beim zweiten NULL-freien Duplikat und ist fachlich falsch.
  tei: text("tei"),
  serialNumber: text("serial_number"),
  deviceType: text("device_type"),
  status: text("status"),
  location: text("location"),
  assignedTo: text("assigned_to"),
  softwareVersion: text("software_version"),
  // KALENDERDATUM `YYYY-MM-DD`, kein Zeitstempel (§2.2.3). Die Quelle fuehrt hier
  // epoch-ms mit DREI widerspruechlichen Zeitzonen-Semantiken (CSV-Import: UTC-Mitternacht ·
  // Formular: lokale Mitternacht · Update-Karte: echte Uhrzeit); der Import kuerzt in
  // Europe/Berlin, weil das fuer alle drei richtig ist und eine UTC-Kuerzung nur fuer einen.
  // Wer einen DatePicker an einen `number` bindet, hat den Zeitzonenkonflikt zurueckgeholt.
  lastUpdatedAt: text("last_updated_at"),
  notes: text("notes"),
  // Kundenstammdaten, alle nullable.
  hiorgId: text("hiorg_id"),
  opta: text("opta"),
  funktion: text("funktion"),
  hersteller: text("hersteller"),
  bedieneinheit: text("bedieneinheit"),
  // Klartext, komma-verbundene Teilmenge von DEVICE_MODES, z. B. "TMO,DMO". KEINE
  // Normalisierung beim Import — der Wert wird an einer Stelle gelesen und gesplittet.
  deviceModes: text("device_modes"),
  alamosIntegrated: integer("alamos_integrated", { mode: "boolean" }),
  // STAMMDATUM. Entscheidet, ob das Geraet ausleihbar ist, und war in radio-admin nie in
  // UPDATER_EDITABLE_FIELDS (radio-admin/server/src/db/schema.ts:30-32).
  // ⚠️ `alamos_integrated` und `loanable` sind zwei 0/1-Integer, die sich verwechseln
  // lassen, ohne dass es auffaellt. Der Mapper liest sie namentlich, nie positionell.
  loanable: integer("loanable", { mode: "boolean" }),
  // APPEND-ONLY Update-Anmerkung, getrennt von `notes`: der Update-Weg haengt an, er
  // ueberschreibt nie (radio-admin/server/src/db/schema.ts:33-36). ⚠️ Genau diese Spalte
  // walzt ein `onConflictDoUpdate` beim Zweitimport platt (§2.8.4).
  updateNote: text("update_note"),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
  // OIDC-`sub`, OHNE FK auf users.sub (§2.3).
  createdBy: text("created_by"),
  updatedBy: text("updated_by"),
});

export const softwareVersions = sqliteTable("software_versions", {
  id: text("id").primaryKey().$defaultFn(nanoid),
  value: text("value").notNull().unique(),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  /**
   * TOTE SPALTE, WANDERT TROTZDEM. Geschrieben an zwei Stellen
   * (radio-admin/server/src/repos/softwareVersionRepo.ts:39, :53), in KEINER Projektion
   * selektiert (`listSoftwareVersions` :141-148, `getTargetVersion` :65). Es gibt also
   * Werte, und eine weggelassene Spalte macht einen vorhandenen Wert unwiederbringlich —
   * der Import hat keinen zweiten Versuch (dieselbe Begruendung wie
   * src/app/m/lagerbuch/_db/schema.ts:386-395). Es wird KEIN Leser gebaut.
   */
  createdBy: text("created_by"),
  // Reine Anzeigereihenfolge. Leitet den Ziel-Stand AUSDRUECKLICH NICHT ab: eine neu
  // erfasste Version, die oben landet, wird nie automatisch Ziel
  // (radio-admin/server/src/db/schema.ts:48-51).
  sortOrder: integer("sort_order").notNull().default(0),
  // Der Update-Stand eines Geraets ist BERECHNET, nicht gespeichert, und haengt allein an
  // dieser Marke. Genau EINE Zeile darf sie tragen — und es gibt KEINEN DB-Constraint dafuer
  // (§2.6, bewusst: ein partieller Index verwandelte das Setzen der Marke von einer
  // Zweischritt-Transaktion in einen Konflikt und braeche den bestehenden Schreibweg).
  // Der Leser `getTargetVersion` hat kein ORDER BY
  // (radio-admin/server/src/repos/softwareVersionRepo.ts:63-70): bei zwei Marken entscheidet
  // die Reihenfolge, in der SQLite zufaellig liefert, ueber den angezeigten Stand JEDES
  // Geraets. Ersatz ist Abfrage 2 aus §2.8.3, und sie ist BLOCKIEREND.
  isTarget: integer("is_target", { mode: "boolean" }).notNull().default(false),
});

/**
 * Reine Nachschlagetabelle fuer die ANZEIGE: sechs Auditspalten speichern die stabile
 * OIDC-Identitaet `sub` (devices.created_by/updated_by, device_events.changed_by,
 * software_versions.created_by), und ohne diese Tabelle rendert jede Auditzeile und jedes
 * Geraeteereignis eine nackte UUID.
 *
 * `sub` IST der Primaerschluessel und wird ROH gefuehrt — radio-admin schreibt ihn schon
 * roh (radio-admin/server/src/db/schema.ts:79). Der Praefix `pocketid:` ist ein Artefakt des
 * KIOSK (radio-inventar/apps/backend/src/modules/admin/auth/pocket-id.service.ts:134) und
 * kommt hier nie an.
 *
 * KEINE Zuordnungstabelle alt_sub → neu_sub: die Pocket-ID-Instanz fuehrt
 * `subject_types_supported: ["public"]` (gemessen, src/app/m/lagerbuch/_db/schema.ts:431-432),
 * der `sub` ist also ueber beide OIDC-Clients identisch.
 *
 * ⚠️ `select count(*) from users` ist KEINE Personenzahl und gehoert in keine Oberflaeche,
 * die eine Personenzahl anzeigen will.
 */
export const users = sqliteTable("users", {
  sub: text("sub").primaryKey(),
  name: text("name").notNull(),
  lastSeenAt: integer("last_seen_at", { mode: "timestamp" }).notNull(),
});

export const deviceEvents = sqliteTable(
  "device_events",
  {
    id: text("id").primaryKey().$defaultFn(nanoid),
    // DER EINZIGE FK AUF EINE AUSMUSTERBARE TABELLE, und er MUSS ein Cascade-FK bleiben
    // (radio-admin/server/src/db/schema.ts:88-90). `foreign_keys = ON` ist gesetzt
    // (src/core/db/index.ts:19) — ein Ereignis-Insert vor dem passenden Geraet bricht hart
    // ab, und damit ist die Einfuegereihenfolge des Importers (§2.8.2) Pflicht, nicht Stil.
    deviceId: text("device_id")
      .notNull()
      .references(() => devices.id, { onDelete: "cascade" }),
    field: text("field").notNull(),
    oldValue: text("old_value"),
    newValue: text("new_value"),
    changedBy: text("changed_by"),
    changedAt: integer("changed_at", { mode: "timestamp" }).notNull(),
    // Drizzle-Enum OHNE DB-CHECK — in SQL steht nur `text NOT NULL`. Die Datenbank
    // akzeptiert JEDEN String; ein fuenfter Wert passiert Datenbank und Typpruefung
    // unbeanstandet und bricht erst in einem erschoepfenden Switch der Oberflaeche.
    // Der Importer prueft (§2.2.4), die DB tut es nicht.
    source: text("source", {
      enum: ["manual", "csv-import", "create", "update-note"],
    }).notNull(),
  },
  (t) => [index("device_events_device_id_idx").on(t.deviceId)],
);

/**
 * Der dauerhafte, sperrbare Ausleih-Zugang (Entscheidung 6). Vorbild in Bauform und
 * Begruendung: src/app/m/lagerbuch/_db/schema.ts:376-415.
 *
 * NICHT LOESCHBAR — und der Grund ist kein Ordnungsargument: ein geloeschter Code kann an
 * ein spaeter ausgestelltes Kaertchen zurueckfallen, und danach erscheinen HISTORISCHE
 * Zeilen unter dem neuen Label. Durchgesetzt durch Abwesenheit jedes Loeschwegs plus den
 * Quelltext-Scan in _db/append.test.ts (§2.4).
 *
 * ⚠️ STEHT VOR `loans`, abweichend von der Reihenfolge in §2.5: `loans.zugangscodeId`
 * verweist auf `zugangscodes.id`. Der Verweis ist ein Thunk und funktionierte auch
 * umgekehrt — die Deklaration vor der Benutzung liest sich richtig und haelt
 * `no-use-before-define` fern. Am Schema aendert die Reihenfolge nichts.
 */
export const zugangscodes = sqliteTable("zugangscodes", {
  // Steckt im Sitzungs-Cookie JEDER laufenden Ausleih-Sitzung — nicht neu vergeben.
  // Der Riegel schlaegt bei jedem Aufruf hierueber nach, nicht ueber `code`; nur so muss
  // das Klartext-Geheimnis nicht im Cookie stehen
  // (src/app/m/lagerbuch/_lib/helferZugang.ts:29-31 ist die Bauform).
  id: text("id").primaryKey().$defaultFn(nanoid),
  // ZUGLEICH QR-Nutzlast UND Gate-Eingabe. Zeichengleich gespeichert, nie normalisiert,
  // nie umkodiert — gedruckte Kaertchen sind sonst ungueltig. KEIN `COLLATE NOCASE`:
  // eine unempfindliche Eingabe normalisiert die EINGABE, nicht die Spalte.
  // Laenge und Alphabet entscheidet Kapitel 3 (§3.2.1: 28 Zeichen Crockford-Base32 in
  // sieben Vierergruppen, Bindestrich TEIL des Werts); das Schema schreibt kein Format vor.
  code: text("code").notNull().unique(),
  // Der Anzeigename in der Verwaltung — der Code allein sagt niemandem etwas
  // ("Aufsteller Fahrzeughalle", nicht "418-207").
  // ⚠️ HEISST `bezeichnung`, NICHT `label` (B6): der Name traegt in Kapitel 3 Schema,
  // Action-Signatur `erstelleCode(bezeichnung)`, Laufzeittyp `AusleihZugang` und die Zusage
  // an Kapitel 5. `label` stand in §2.4 an EINER Stelle und ist ueberholt.
  bezeichnung: text("bezeichnung").notNull(),
  // DER EINZIGE WIDERRUF, DEN ES GIBT. Ein Import oder ein Seed, der alles als aktiv
  // anlegt, reaktiviert still jeden gesperrten Code — und zwar genau die, die gesperrt
  // wurden, weil ein Kaertchen verschwunden ist.
  aktiv: integer("aktiv", { mode: "boolean" }).notNull().default(true),
  // Nur von der Sperr-Action geschrieben. Sie existieren, WEIL die Zeile dauerhaft in der
  // Liste steht und erklaeren muss, warum sie tot ist; `aktiv = false` allein verlangte vom
  // Betreiber, sich das zu merken.
  gesperrtAm: integer("gesperrt_am", { mode: "timestamp" }),
  gesperrtVon: text("gesperrt_von"),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  // OIDC-`sub` des ausstellenden radio-admins (Entscheidung 7). Reines Auditfeld.
  createdBy: text("created_by").notNull(),
  // NULL = "nie eingeloest". REINE ANZEIGE, ohne Einfluss auf Gueltigkeit
  // (src/app/m/lagerbuch/_db/schema.ts:412-414).
  lastUsedAt: integer("last_used_at", { mode: "timestamp" }),
});
// KEIN Index auf `aktiv`. Die Verwaltungsliste ist die einzige Abfrage ueber diese Spalte,
// und die Tabelle liegt in der Groessenordnung "Zahl der Aufsteller" — ein Index kostet
// hier mehr Schreibarbeit als er an Lesezeit einspart. Der Riegel liest ueber den PK.

/**
 * Ausleihen. `returned_at IS NULL` heisst "aktive Leihe".
 *
 * `device_id` ist ABSICHTLICH KEIN Fremdschluessel (§2.3, Wortlaut der Quelle in
 * radio-admin/server/src/db/schema.ts:106-110). Die historische Richtigkeit traegt der
 * unveraenderliche Anzeige-Schnappschuss, der beim Ausleihen kopiert wird, nicht ein
 * lebender Join. Ein zusaetzlicher FK waere gueltiges Drizzle, gueltiges SQL und
 * PARITAETSGRUEN; der Schaden entstuende Monate spaeter, bei der ersten Geraeteausmusterung.
 *
 * `borrower_name` ist personenbezogen und der DSGVO-Grund der Retention (§2.7).
 */
export const loans = sqliteTable(
  "loans",
  {
    id: text("id").primaryKey().$defaultFn(nanoid),
    deviceId: text("device_id").notNull(),
    snapshotCallSign: text("snapshot_call_sign").notNull(),
    snapshotSerialNumber: text("snapshot_serial_number"),
    snapshotDeviceType: text("snapshot_device_type"),
    borrowerName: text("borrower_name").notNull(),
    borrowedAt: integer("borrowed_at", { mode: "timestamp" }).notNull(),
    returnedAt: integer("returned_at", { mode: "timestamp" }),
    returnNote: text("return_note"),
    // Die HERKUNFT des Zugangs, nicht die Identitaet der Person (der Vorgang bleibt anonym,
    // §3.5.4): "diese Leihe entstand ueber den Aufsteller im Funkraum". NULL fuer jede
    // importierte Alt-Leihe und fuer jede Leihe ueber den Suite-Weg.
    // ⚠️ Der EINZIGE Fremdschluessel dieser Tabelle, und er ist KEIN Gegenbeispiel zu
    // `device_id`: dort zeigte er auf eine Tabelle, aus der AUSGEMUSTERT wird; aus
    // `zugangscodes` wird NIE geloescht (§3.2.4), der Zeiger kann konstruktiv nicht ins
    // Leere fallen. Ohne ihn ist das Loeschverbot eine Regel ohne Schaden — "beides oder
    // nichts" (§3.2.4 Punkt 3). Nachgetragen in B6; §2.4 verneint die Spalte noch und ist
    // damit ueberholt.
    zugangscodeId: text("zugangscode_id").references(() => zugangscodes.id),
    createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
  },
  (t) => [
    index("loans_device_id_idx").on(t.deviceId),
    index("loans_borrowed_at_idx").on(t.borrowedAt),
    index("loans_returned_at_idx").on(t.returnedAt),
    // Der PARTIELLE Unique-Index `loans_device_active_uidx` steht hier NICHT und kann hier
    // nicht stehen: drizzle-kit emittiert keine partiellen Indizes (§2.6). Er liegt von
    // Hand in migrations/0001_loans_aktiv_uidx.sql und ist dem Drizzle-Schema UNSICHTBAR.
  ],
);

/*
 * DIE ZEHN TYPALIASE. Sie sind ⬜ L1 des Import-Wegs: ohne sie kompiliert keine
 * Mapper-Signatur von scripts/import/radio.ts (Aufgaben B5, B6, B7, B9, B14, B15, B16 in
 * docs/superpowers/plans/2026-08-18-plan1-radio-import.md).
 *
 * Hausform: `typeof <tabelle>.$inferInsert` / `$inferSelect`
 * (src/app/m/qr/_db/schema.ts:32-33, src/app/m/aufgaben/_db/schema.ts:334-339).
 *
 * `zugangscodes` bekommt seine Aliase mit Kapitel 3, seinem ersten Verbraucher — hier
 * waeren sie toter Code.
 */
export type NeuesGeraet = typeof devices.$inferInsert;
export type Geraet = typeof devices.$inferSelect;
export type NeueSoftwareVersion = typeof softwareVersions.$inferInsert;
export type SoftwareVersion = typeof softwareVersions.$inferSelect;
export type NeuerBenutzer = typeof users.$inferInsert;
export type Benutzer = typeof users.$inferSelect;
export type NeuesGeraeteEreignis = typeof deviceEvents.$inferInsert;
export type GeraeteEreignis = typeof deviceEvents.$inferSelect;
export type NeueLeihe = typeof loans.$inferInsert;
export type Leihe = typeof loans.$inferSelect;
```

- [ ] **Schritt 3: `client.ts` schreiben**

```ts
// src/app/m/radio/_db/client.ts
// KEIN "use client" (Falle 6): diese Datei wird ausschliesslich serverseitig gelesen.
//
// KEIN EIGENER OPENER, anders als src/app/m/lagerbuch/_db/client.ts:1-45. Jener braucht
// einen, weil er die SQLite-Funktion `lb_falte` registrieren muss — lagerbuch faltet die
// Suche in SQL. Die Suche des Kiosk faltet in JAVASCRIPT
// (radio-inventar/apps/frontend/src/lib/device-filter.ts:24-31: NFD + Diakritika-Entfernung
// + ss), und der Geraetebestand ist klein genug, dass sie das weiter tun kann.
//
// ⚠️ WIRD DIE SUCHE IN SQL GEZOGEN (LIKE gegen eine gefaltete Spalte oder gegen eine
// SQLite-Funktion), kippt diese Entscheidung und `radio` braucht einen eigenen Opener nach
// lagerbuch-Muster — dann faellt ausserdem der Ausschluss aus `seedAllModules()` (§2.9)
// mit einer ZWEITEN Begruendung zusammen: `getModuleDb` kennte die Funktion nicht.
//
// Die vier Pragmas (journal_mode = WAL, foreign_keys = ON, busy_timeout = 5000,
// synchronous = NORMAL) setzt `openModuleDatabase` (src/core/db/index.ts:12-22).
// `foreign_keys = ON` ist SCHARF — der eine FK auf eine ausmusterbare Tabelle
// (device_events.device_id) wird durchgesetzt.
import { getModuleDb } from "@/core/db";
import * as schema from "./schema";

export function getDb() {
  return getModuleDb("radio", schema);
}

export type DB = ReturnType<typeof getDb>;
```

- [ ] **Schritt 4: `drizzle.config.ts` schreiben**

Zeichengleich zur Hausform `src/app/m/aufgaben/_db/drizzle.config.ts`, nur mit `radio` in den drei
Pfaden:

```ts
// src/app/m/radio/_db/drizzle.config.ts
// Pfade repo-root-relativ (drizzle-kit loest gegen cwd auf), nicht relativ zu dieser Datei.
import type { Config } from "drizzle-kit";

export default {
  schema: "./src/app/m/radio/_db/schema.ts",
  out: "./src/app/m/radio/_db/migrations",
  dialect: "sqlite",
  dbCredentials: { url: "./.data/radio.db" },
} satisfies Config;
```

- [ ] **Schritt 5: Den erwarteten roten Zustand belegen**

```
rtk pnpm typecheck
rtk pnpm vitest run src/core/bootstrap.test.ts scripts/seed-lokal.test.ts
```

Erwartet: `typecheck` **grün** (die Schemadatei kompiliert für sich), und der Testlauf **rot** mit
`jedes Modul mit _db/ steht in MODULE_MIGRATIONS`. Zitiere die rote Ausgabe im Bericht — sie ist der
Beleg für Naht NS-M4 und die Rechtfertigung dafür, dass hier **nicht** committet wird.

⛔ **Kein Commit.** Weiter mit M2.

---

## Aufgabe M2: Die zwei Migrationen — eine generiert, eine von Hand

⚠️ **Mitte des Blocks M1–M3.** Weiter rot, weiter kein Commit.

**Files:**
- Create (durch `drizzle-kit`): `src/app/m/radio/_db/migrations/0000_<gewuerfelt>.sql`,
  `migrations/meta/_journal.json`, `migrations/meta/0000_snapshot.json`
- Create (von Hand): `src/app/m/radio/_db/migrations/0001_loans_aktiv_uidx.sql`
- Modify (eine Handzeile): `src/app/m/radio/_db/migrations/meta/_journal.json`
- Create: `src/app/m/radio/_db/migrations.test.ts`

**Interfaces:**
- Consumes: `schema.ts` und `drizzle.config.ts` aus M1.
- Produces: ein migrierbares Verzeichnis mit **zwei** Journaleinträgen · den Index
  `loans_device_active_uidx`.

- [ ] **Schritt 1: Den Test zuerst schreiben — er ist gegen ein Verzeichnis gerichtet, das es noch nicht gibt**

```ts
// src/app/m/radio/_db/migrations.test.ts
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import Database from "better-sqlite3";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import * as schema from "./schema";
import { loans } from "./schema";

const ORDNER = "src/app/m/radio/_db/migrations";

/**
 * DER PARTIELLE UNIQUE-INDEX IST DER EINZIGE RIEGEL DER INVARIANTE "hoechstens EINE
 * aktive Ausleihe je Geraet", und sein Fehlen ist GRUEN: die Altdaten erfuellen die
 * Invariante, der Import faellt nicht auf, und sichtbar wird es erst beim zweiten
 * Ausleihen desselben Geraets. `pnpm typecheck` und `pnpm build` fassen Migrationen nicht
 * an (§2.6, Folge (a)).
 *
 * GEGEN EINE TEMPORAERE DATEI-DB, NICHT :memory: — nur der Dateiweg belegt, dass
 * `migrate()` auf einer frisch angelegten Datei durchlaeuft, und genau das tut der Boot
 * (Hausform: src/app/m/lagerbuch/_db/testdb.ts:19-24).
 *
 * `foreign_keys = ON` ist eine VERBINDUNGS-Eigenschaft und in SQLite standardmaessig AUS.
 * Ohne diese Zeile waeren die FK-Zusagen dieses Schemas gruen, ohne zu gelten
 * (src/app/m/lagerbuch/_db/migrations.test.ts:32-34).
 */
let tmp: string;
let sqlite: Database.Database;
let db: ReturnType<typeof drizzle<typeof schema>>;

beforeAll(() => {
  tmp = mkdtempSync(join(tmpdir(), "radio-migrations-"));
  sqlite = new Database(join(tmp, "radio.db"));
  sqlite.pragma("foreign_keys = ON");
  migrate(drizzle(sqlite), { migrationsFolder: ORDNER });
  db = drizzle(sqlite, { schema });
});

afterAll(() => {
  sqlite.close();
  rmSync(tmp, { recursive: true, force: true });
});

/** Eine Leihe, die nur in den Feldern abweicht, die der Test braucht. */
function leihe(werte: Partial<typeof loans.$inferInsert>): typeof loans.$inferInsert {
  return {
    id: `l-${Math.random().toString(36).slice(2, 10)}`,
    deviceId: "g-1",
    snapshotCallSign: "Muehlheim 1/83",
    borrowerName: "Seed Person",
    borrowedAt: new Date("2026-01-01T10:00:00Z"),
    createdAt: new Date("2026-01-01T10:00:00Z"),
    updatedAt: new Date("2026-01-01T10:00:00Z"),
    ...werte,
  };
}

describe("radio-Migrationen: der partielle Unique-Index auf loans", () => {
  it("zwei aktive Leihen auf dasselbe Geraet werden abgewiesen", () => {
    db.insert(loans).values(leihe({ deviceId: "g-abweisung", returnedAt: null })).run();
    expect(() =>
      db.insert(loans).values(leihe({ deviceId: "g-abweisung", returnedAt: null })).run(),
    ).toThrow(/UNIQUE constraint failed/);
  });

  it("eine zurueckgegebene und eine aktive Leihe auf dasselbe Geraet sind erlaubt", () => {
    // DIE PARTIALITAET SELBST. Ohne diesen Fall waere ein GEWOEHNLICHER Unique-Index
    // ebenfalls "gruen" — und der sperrte die Historie.
    db.insert(loans)
      .values(leihe({ deviceId: "g-gemischt", returnedAt: new Date("2026-02-01T10:00:00Z") }))
      .run();
    expect(() =>
      db.insert(loans).values(leihe({ deviceId: "g-gemischt", returnedAt: null })).run(),
    ).not.toThrow();
  });

  it("zwei zurueckgegebene Leihen auf dasselbe Geraet sind erlaubt", () => {
    // Der Index sperrt die Historie nicht — das ist die Voraussetzung dafuer, dass der
    // Importer die abgeschlossene Leihhistorie im Bulk schreiben kann (§2.6, Folge (b)).
    db.insert(loans)
      .values(leihe({ deviceId: "g-historie", returnedAt: new Date("2026-02-01T10:00:00Z") }))
      .run();
    expect(() =>
      db
        .insert(loans)
        .values(leihe({ deviceId: "g-historie", returnedAt: new Date("2026-03-01T10:00:00Z") }))
        .run(),
    ).not.toThrow();
  });

  it("loans_device_active_uidx existiert als partieller Unique-Index", () => {
    /*
     * STRUKTURPROBE, KEINE TEXTSUCHE — und der Unterschied ist gemessen (B1-B4,
     * docs/superpowers/plans/2026-08-18-plan1-radio-import.md, Abschnitt "Was dieser Plan
     * GEMESSEN hat"): die DDL schreibt den Index mit Backticks, und
     * `instr(sql,'WHERE returned_at IS NULL')` auf sqlite_master.sql ergibt 0. Ein Test,
     * der den Indextext greppt, ist deshalb rot gegen eine KORREKTE Migration.
     *
     * Dieser Fall prueft die Zeile direkt, damit ein kuenftiges `drizzle-kit generate` sie
     * nicht still verlieren kann — es sieht partielle Indizes nicht und emittiert sie nicht.
     */
    const zeilen = sqlite
      .prepare(`select name, "unique", partial from pragma_index_list('loans')`)
      .all() as { name: string; unique: number; partial: number }[];
    const treffer = zeilen.find((z) => z.name === "loans_device_active_uidx");
    expect(treffer, "loans_device_active_uidx fehlt in pragma_index_list('loans')").toBeDefined();
    expect(treffer).toEqual({ name: "loans_device_active_uidx", unique: 1, partial: 1 });
  });
});
```

- [ ] **Schritt 2: Den Fehlschlag sehen**

```
rtk pnpm vitest run src/app/m/radio/_db/migrations.test.ts
```

Erwartet: **rot**, auf Suite-Ebene, weil `migrationsFolder` nicht existiert. Zitiere die Ausgabe.

- [ ] **Schritt 3: Die `0000` generieren — und ⬜ M-L1 ablesen**

```
rtk pnpm exec drizzle-kit generate --config src/app/m/radio/_db/drizzle.config.ts
```

Hausform, belegt in `docs/superpowers/plans/2026-08-13-modul-aufgaben.md` (dieselbe Zeile für
`aufgaben`). Danach:

```
rtk ls src/app/m/radio/_db/migrations
```

⬜ **M-L1 ablesen und im Bericht protokollieren:** den gewürfelten Namen `0000_<name>.sql`.
⛔ **Nicht umbenennen** — der Name steht im Journal und sein Hash in `__drizzle_migrations`.

Prüfe die erzeugte Datei auf **sechs** `CREATE TABLE` und **sieben** Indizes (die vier
Tabellenausdruck-Indizes `device_events_device_id_idx`, `loans_device_id_idx`,
`loans_borrowed_at_idx`, `loans_returned_at_idx` und die drei `unique`-Indizes
`devices_issi_unique`, `software_versions_value_unique`, `zugangscodes_code_unique`):

```
rtk grep -c "CREATE TABLE" src/app/m/radio/_db/migrations/0000_*.sql
rtk grep -n "CREATE.*INDEX" src/app/m/radio/_db/migrations/0000_*.sql
```

⚠️ Steht dort ein `loans_device_active_uidx`, ist etwas grundlegend anders als gemessen — dann
**anhalten und melden**, nicht weiterbauen: `drizzle-kit` kann partielle Indizes nicht emittieren,
und ein *nicht*-partieller Index dieses Namens sperrte die Historie.

- [ ] **Schritt 4: Die `0001` von Hand schreiben**

```sql
-- src/app/m/radio/_db/migrations/0001_loans_aktiv_uidx.sql
-- Partieller Unique-Index: hoechstens EINE aktive Leihe (returned_at IS NULL) je Geraet.
-- Von Hand, weil drizzle-kit partielle Indizes nicht emittieren kann. Er ist dem
-- Drizzle-Schema UNSICHTBAR — kuenftige `drizzle-kit generate`-Laeufe sehen ihn nicht und
-- entfernen ihn nicht. Diese Datei NICHT neu erzeugen: ihr Hash steht in
-- `__drizzle_migrations`, und ein geaenderter Hash laesst bereits migrierte Datenbanken in
-- eine Absturzschleife laufen.
--
-- Zeichengleich zur Quelle: radio-admin/server/drizzle/0003_kind_spot.sql, letzte Zeile.
-- Die Backticks bleiben stehen — sie sind der Grund, warum eine Textsuche auf
-- 'WHERE returned_at IS NULL' in sqlite_master.sql 0 ergibt (gemessen) und die Probe in
-- migrations.test.ts ueber pragma_index_list geht.
CREATE UNIQUE INDEX `loans_device_active_uidx` ON `loans` (`device_id`) WHERE `returned_at` IS NULL;
```

- [ ] **Schritt 5: Den Journaleintrag von Hand nachtragen**

⚠️ **Ohne diesen Schritt wendet `migrate()` die `0001` NIE an** — der Migrator liest
`meta/_journal.json`, nicht das Verzeichnis. `drizzle-kit` hat nur die `0000` eingetragen.

Hausform im Bestand: `src/app/m/aufgaben/_db/migrations/meta/_journal.json`, Eintrag `idx: 2`
(`0002_koordination_wird_auftrag`) ist von Hand nachgetragen — erkennbar am runden, getippten
`"when": 1786900000000`.

Lies den vorhandenen Eintrag und hänge einen zweiten an; `when` muss **größer** sein als das der
`0000` (nimm dessen Wert und runde nach oben, so wie der `aufgaben`-Präzedenzfall es tut):

```
rtk read src/app/m/radio/_db/migrations/meta/_journal.json
```

Das Ergebnis trägt zwei Einträge und sieht so aus (`<when-0000>` und `<name>` aus dem Lauf in
Schritt 3, `<when-0001>` ein runder Wert darüber):

```json
{
  "version": "7",
  "dialect": "sqlite",
  "entries": [
    {
      "idx": 0,
      "version": "6",
      "when": <when-0000>,
      "tag": "0000_<name>",
      "breakpoints": true
    },
    {
      "idx": 1,
      "version": "6",
      "when": <when-0001>,
      "tag": "0001_loans_aktiv_uidx",
      "breakpoints": true
    }
  ]
}
```

- [ ] **Schritt 6: Die vier Tests grün sehen**

```
rtk pnpm vitest run src/app/m/radio/_db/migrations.test.ts
```

Erwartet: **4 passed**. Wird `loans_device_active_uidx existiert als partieller Unique-Index` rot,
fehlt der Journaleintrag aus Schritt 5 — nicht die Datei aus Schritt 4.

⛔ **Kein Commit.** Weiter mit M3.

---

## Aufgabe M3: Das Registrierungs-Dreieck und der lokale Seed — das eine Tor des Blocks

⚠️ **Ende des Blocks M1–M3.** Hier läuft das Tor, hier fällt **ein** Commit über alle Dateien von
M1, M2 und M3.

**Files:**
- Create: `src/app/m/radio/_lib/seedLokal.ts`
- Modify: `src/core/bootstrap.ts` (`MODULE_MIGRATIONS`, hinter `aufgaben`)
- Modify: `Dockerfile` (eine `COPY`-Zeile hinter `:56`)
- Modify: `scripts/seed-lokal.ts` (zwei Importe, eine `SEED_MODULE`-Zeile)

**Interfaces:**
- Consumes: `schema.ts` (alle sechs Tabellen), `migrations/` aus M2.
- Produces: `seedLokalRadio(db: DB): void` · den Modulschlüssel `"radio"` in `MODULE_MIGRATIONS` und
  in `SEED_MODULE`.

- [ ] **Schritt 1: Den Seed schreiben**

Inhalt wörtlich nach §2.9.4 — „gerade so viel, dass jede Fläche ohne Handarbeit sichtbar ist".
**Idempotent pro Entität** (nicht ein gemeinsames Gate: ein abgebrochener Lauf ergänzt sich beim
nächsten Aufruf selbst) und **rein additiv**.

⚠️ Zwei Importfallen, beide im Code unten schon richtig: `DB` kommt aus `../_db/client`, **nicht**
aus `../_db/schema` — und es wird **kein** `eq` aus `drizzle-orm` importiert, weil die Idempotenz
über `onConflictDoNothing()` läuft und nicht über Vorab-Abfragen. Ein unbenutzter Import ist eine
Lint-Warnung.

```ts
// src/app/m/radio/_lib/seedLokal.ts
// KEIN "use client" (Falle 6).
//
// ANREICHERUNG NUR FUER DIE LOKALE ARBEIT — bewusst NICHT am Boot-Pfad.
// `shouldSeed()` (src/core/bootstrap.ts) ist wahr bei `SUITE_SEED=1`, und das ist der
// GENERALPROBEN-Schalter. Fuer `radio` ist der Ausschluss schaerfer als fuer die anderen
// Module: eine geseedete Zeile in `zugangscodes` ist ein gueltiger ANONYMER
// SCHREIBZUGANG — jemand kann damit ohne Anmeldung Geraete ausleihen und zurueckgeben.
// Diese Datei laeuft ausschliesslich ueber scripts/seed-lokal.ts.
//
// IDEMPOTENT PRO ENTITAET und REIN ADDITIV: jede Zeile traegt eine STABILE id und wird mit
// `onConflictDoNothing()` geschrieben. `$defaultFn(nanoid)` gaebe bei jedem Lauf eine neue
// id und damit eine Dublette.
import type { DB } from "../_db/client";
import { devices, loans, softwareVersions, users, zugangscodes } from "../_db/schema";

/** Der `sub`, den das Dev-Login praegt: `dev:${email}` (src/core/auth/config.ts:63).
 *  Zeichengleich zum Praezedenzfall src/app/m/lagerbuch/_lib/seedLokal.ts:114. */
const SEED_SUB = "dev:demo@localtest.me";

/** Ein fester Tag als Ausgangspunkt, damit die Zeilen zwischen zwei Laeufen gleich
 *  aussehen; die Leih-Zeitpunkte haengen relativ daran. */
const JETZT = new Date();
const TAGE = (n: number) => new Date(JETZT.getTime() - n * 24 * 60 * 60 * 1000);
/** `YYYY-MM-DD`, wie `devices.last_updated_at` es fuehrt (§2.2.3) — eine Zeichenkette,
 *  kein Zeitstempel.
 *
 *  ⚠️ DIES IST EINE UTC-KUERZUNG, UND SIE IST HIER ABSICHTLICH: es sind Anzeigewerte fuer
 *  lokale Demodaten, kein Importpfad. Der IMPORT kuerzt in Europe/Berlin (`tagInBerlin`,
 *  scripts/import/radio.ts) — weil eine UTC-Kuerzung nur fuer EINEN der drei Schreibwege
 *  der Quelle richtig ist und fuer die anderen zwei den Tag zurueckschiebt (§2.2.3).
 *  Wer diese Zeile in Produktionscode oder in eine Server Action kopiert, holt genau den
 *  Zeitzonenkonflikt zurueck, den die TEXT-Spalte abschafft. */
const TAG = (d: Date) => d.toISOString().slice(0, 10);

/*
 * ZWEI CODES IN DER KANONISCHEN FORM AUS §3.2.1: 28 Zeichen Crockford-Base32
 * (Alphabet "0123456789ABCDEFGHJKMNPQRSTVWXYZ" — ohne I, L, O, U) in sieben
 * Vierergruppen, Bindestrich TEIL des gespeicherten Werts.
 * Der erste ist das Beispiel der Spec selbst (§3.2.1).
 * ⚠️ Der ERZEUGER (`erzeugeCode`) und die Eingabenormalisierung (`normalisiereCode`)
 * entstehen in Kapitel 3 / Planteil 3. Wenn er steht, sind diese zwei Literale einmal
 * gegen `normalisiereCode` zu pruefen — die Spalte selbst schreibt kein Format vor.
 */
const CODE_AKTIV = "A3F7-K92M-QRTV-5X8Y-B6HN-2DPZ-J4KW";
const CODE_GESPERRT = "7QK2-M4XN-B9HV-3ZTD-5PJW-6RSG-8YFA";

export function seedLokalRadio(db: DB): void {
  // --- Eine users-Zeile, damit die sechs Auditspalten einen Namen aufloesen ---
  db.insert(users)
    .values({ sub: SEED_SUB, name: "Demo Person", lastSeenAt: TAGE(0) })
    .onConflictDoNothing()
    .run();

  // --- Drei Softwareversionen, GENAU EINE mit isTarget ---
  // Zwei Marken machen den angezeigten Update-Stand JEDES Geraets davon abhaengig, welche
  // Zeile SQLite zufaellig zuerst liefert (§2.6, `getTargetVersion` ohne ORDER BY).
  db.insert(softwareVersions)
    .values([
      { id: "sv-1", value: "1.4.2", sortOrder: 0, isTarget: false,
        createdAt: TAGE(120), createdBy: SEED_SUB },
      { id: "sv-2", value: "1.5.0", sortOrder: 1, isTarget: true,
        createdAt: TAGE(60), createdBy: SEED_SUB },
      { id: "sv-3", value: "1.5.1-rc1", sortOrder: 2, isTarget: false,
        createdAt: TAGE(10), createdBy: SEED_SUB },
    ])
    .onConflictDoNothing()
    .run();

  // --- Acht Geraete: ausleihbar/nicht, mit/ohne tei, eines mit updateNote,
  //     eines mit einem Rufnamen MIT UMLAUT. Ohne Umlaut-Testdaten sieht kein Test,
  //     dass die Suchfaltung fehlt
  //     (radio-inventar/apps/frontend/src/lib/device-filter.ts:24-31). ---
  db.insert(devices)
    .values([
      { id: "g-1", rufname: "Mühlheim 1/83", issi: "1000001", tei: "7000001",
        serialNumber: "SN-0001", deviceType: "Handfunk", status: "einsatzbereit",
        location: "Funkraum", softwareVersion: "1.5.0", lastUpdatedAt: TAG(TAGE(30)),
        hiorgId: "HO-001", opta: "OPTA-001", deviceModes: "TMO,DMO",
        alamosIntegrated: true, loanable: true,
        createdAt: TAGE(300), updatedAt: TAGE(30), createdBy: SEED_SUB, updatedBy: SEED_SUB },
      { id: "g-2", rufname: "Mühlheim 1/84", issi: "1000002", tei: null,
        serialNumber: "SN-0002", deviceType: "Handfunk", status: "einsatzbereit",
        location: "Funkraum", softwareVersion: "1.5.0", lastUpdatedAt: TAG(TAGE(30)),
        deviceModes: "TMO", alamosIntegrated: false, loanable: true,
        createdAt: TAGE(300), updatedAt: TAGE(30), createdBy: SEED_SUB, updatedBy: SEED_SUB },
      { id: "g-3", rufname: "Fahrzeug 11/1", issi: "1000003", tei: "7000003",
        serialNumber: "SN-0003", deviceType: "Fahrzeugfunk", status: "einsatzbereit",
        location: "Fahrzeughalle", softwareVersion: "1.4.2", lastUpdatedAt: TAG(TAGE(90)),
        deviceModes: "TMO,DMO", alamosIntegrated: true, loanable: false,
        createdAt: TAGE(280), updatedAt: TAGE(90), createdBy: SEED_SUB, updatedBy: SEED_SUB },
      { id: "g-4", rufname: "Fahrzeug 11/2", issi: "1000004", tei: null,
        serialNumber: "SN-0004", deviceType: "Fahrzeugfunk", status: "in Reparatur",
        location: "Werkstatt", softwareVersion: "1.4.2", lastUpdatedAt: TAG(TAGE(200)),
        notes: "Antenne defekt", alamosIntegrated: false, loanable: false,
        createdAt: TAGE(260), updatedAt: TAGE(20), createdBy: SEED_SUB, updatedBy: SEED_SUB },
      { id: "g-5", rufname: "Reserve 1", issi: "1000005", tei: "7000005",
        serialNumber: "SN-0005", deviceType: "Handfunk", status: "einsatzbereit",
        location: "Lager", softwareVersion: "1.4.2", lastUpdatedAt: TAG(TAGE(150)),
        // APPEND-ONLY Update-Anmerkung, getrennt von `notes`: der Update-Weg haengt an, er
        // ueberschreibt nie. Genau diese Spalte walzt ein `onConflictDoUpdate` beim
        // Zweitimport platt (§2.8.4) — deshalb steht sie im Seed.
        updateNote: "2026-06-01 auf 1.4.2 gebracht",
        alamosIntegrated: false, loanable: true,
        createdAt: TAGE(250), updatedAt: TAGE(150), createdBy: SEED_SUB, updatedBy: SEED_SUB },
      { id: "g-6", rufname: "Reserve 2", issi: "1000006", tei: null,
        serialNumber: "SN-0006", deviceType: "Handfunk", status: "einsatzbereit",
        location: "Lager", alamosIntegrated: false, loanable: true,
        createdAt: TAGE(240), updatedAt: TAGE(240), createdBy: SEED_SUB, updatedBy: SEED_SUB },
      { id: "g-7", rufname: "Übung 3/1", issi: "1000007", tei: "7000007",
        serialNumber: "SN-0007", deviceType: "Handfunk", status: "ausgemustert",
        location: "Lager", alamosIntegrated: false, loanable: false,
        createdAt: TAGE(700), updatedAt: TAGE(400), createdBy: SEED_SUB, updatedBy: SEED_SUB },
      { id: "g-8", rufname: null, issi: "1000008", tei: null,
        serialNumber: "SN-0008", deviceType: "Handfunk", status: "einsatzbereit",
        location: "Funkraum", alamosIntegrated: false, loanable: true,
        createdAt: TAGE(30), updatedAt: TAGE(30), createdBy: SEED_SUB, updatedBy: SEED_SUB },
    ])
    .onConflictDoNothing()
    .run();

  // --- Zwei zugangscodes: einer aktiv, einer gesperrt MIT gesperrtAm/gesperrtVon.
  //     Die Verwaltungsliste muss beide Zustaende zeigen koennen. ---
  db.insert(zugangscodes)
    .values([
      { id: "zc-1", code: CODE_AKTIV, bezeichnung: "Aufsteller Funkraum", aktiv: true,
        createdAt: TAGE(45), createdBy: SEED_SUB, lastUsedAt: TAGE(2) },
      { id: "zc-2", code: CODE_GESPERRT, bezeichnung: "Aufsteller Fahrzeughalle (Kaertchen weg)",
        aktiv: false, gesperrtAm: TAGE(7), gesperrtVon: SEED_SUB,
        createdAt: TAGE(90), createdBy: SEED_SUB, lastUsedAt: TAGE(30) },
    ])
    .onConflictDoNothing()
    .run();

  // --- Je eine aktive und drei zurueckgegebene Leihen. EINE davon mit `returnedAt`
  //     AELTER ALS ZWEI MONATE, damit der Retention-Lauf lokal ueberhaupt etwas zu tun
  //     hat (§2.9.4). `zugangscodeId` bleibt NULL fuer jede Leihe ueber den Suite-Weg;
  //     eine zeigt auf zc-1, damit die Herkunftsanzeige einen Fall hat. ---
  db.insert(loans)
    .values([
      { id: "l-aktiv", deviceId: "g-1", snapshotCallSign: "Mühlheim 1/83",
        snapshotSerialNumber: "SN-0001", snapshotDeviceType: "Handfunk",
        borrowerName: "Aktive Person", borrowedAt: TAGE(1), returnedAt: null,
        zugangscodeId: "zc-1", createdAt: TAGE(1), updatedAt: TAGE(1) },
      { id: "l-zurueck-1", deviceId: "g-2", snapshotCallSign: "Mühlheim 1/84",
        snapshotSerialNumber: "SN-0002", snapshotDeviceType: "Handfunk",
        borrowerName: "Kurz Zurueck", borrowedAt: TAGE(10), returnedAt: TAGE(9),
        returnNote: "alles in Ordnung", createdAt: TAGE(10), updatedAt: TAGE(9) },
      { id: "l-zurueck-2", deviceId: "g-5", snapshotCallSign: "Reserve 1",
        snapshotSerialNumber: "SN-0005", snapshotDeviceType: "Handfunk",
        borrowerName: "Mittel Zurueck", borrowedAt: TAGE(40), returnedAt: TAGE(38),
        createdAt: TAGE(40), updatedAt: TAGE(38) },
      // ⚠️ AELTER ALS ZWEI MONATE: der einzige Retention-Kandidat des Seeds.
      { id: "l-zurueck-alt", deviceId: "g-6", snapshotCallSign: "Reserve 2",
        snapshotSerialNumber: "SN-0006", snapshotDeviceType: "Handfunk",
        borrowerName: "Lange Her", borrowedAt: TAGE(200), returnedAt: TAGE(190),
        createdAt: TAGE(200), updatedAt: TAGE(190) },
    ])
    .onConflictDoNothing()
    .run();

  // Das Protokoll nennt den erzeugten Code im KLARTEXT — wie bei den uebrigen Modulen,
  // das ist der Zweck des Skripts (§2.9.4, CLAUDE.md "Lokale Demodaten").
  console.info(`  radio: Ausleih-Code (aktiv):    ${CODE_AKTIV}`);
  console.info(`  radio: Ausleih-Code (gesperrt): ${CODE_GESPERRT}`);
}
```

- [ ] **Schritt 2: Ecke 2 — `MODULE_MIGRATIONS` in `src/core/bootstrap.ts`**

Hinter der `aufgaben`-Zeile einfügen, **mit** dem Kommentar (§2.9.2) — er ist der Grund, warum
`seedAllModules()` **keine** `radio`-Zeile bekommt und `bootstrap.ts` **keinen** `radio`-Schema-Import:

```ts
  // radio: bewusst OHNE Schema-Import und OHNE Seed in `seedAllModules()`. Der
  // Schema-Import waere toter Code (`migrateAllModules()` migriert schema-frei), und der
  // Seed-Ausschluss hat denselben harten Grund wie bei `files`: `shouldSeed()` ist bei
  // `SUITE_SEED=1` auch in der GENERALPROBE wahr, und eine geseedete Zeile in
  // `zugangscodes` ist ein gueltiger ANONYMER SCHREIBZUGANG — jemand kann damit ohne
  // Anmeldung Geraete ausleihen und zurueckgeben. Das lokale Seed-Skript deckt den
  // Entwicklungsbetrieb vollstaendig ab.
  { key: "radio", migrationsFolder: "src/app/m/radio/_db/migrations" },
```

⛔ **`startBackgroundWork()` bleibt unverändert.** `starteRadioHintergrund()` gehört Kapitel 7 /
Planteil 5 (Naht NS-M1), und `radioBootFehler()` ebenso (B8). Wer hier eine Zeile einträgt, verweist
auf eine Funktion, die es nicht gibt.

- [ ] **Schritt 3: Ecke 3 — die `COPY`-Zeile im `Dockerfile`**

Hinter `Dockerfile:56` (der `aufgaben`-Zeile):

```dockerfile
COPY --from=builder --chown=nextjs:nodejs /app/src/app/m/radio/_db/migrations ./src/app/m/radio/_db/migrations
```

Fehlt sie, **läuft es lokal und bricht im Container** — und zwar erst beim Boot des Prod-Images,
also dort, wo es am teuersten ist.

- [ ] **Schritt 4: Den Seed verdrahten — `scripts/seed-lokal.ts`**

Zwei Importe (zu den übrigen Modul-Importen) und eine `SEED_MODULE`-Zeile hinter `aufgaben`:

```ts
import * as radioSchema from "@/app/m/radio/_db/schema";
import { seedLokalRadio } from "@/app/m/radio/_lib/seedLokal";
```

```ts
  { key: "radio", lauf: () => seedLokalRadio(getModuleDb("radio", radioSchema)) },
```

⚠️ `getModuleDb("radio", radioSchema)` ist zeichengleich zu §2.9.4. Es ist dasselbe Objekt, das
`getDb()` aus `_db/client.ts` liefert (gleicher Cache-Schlüssel, `src/core/db/index.ts:26-35`) — die
Spec schreibt hier die `getModuleDb`-Form, und dabei bleibt es.

- [ ] **Schritt 5: Das eine Tor des Blocks**

```
rtk pnpm typecheck && rtk pnpm lint
rtk pnpm vitest run src/core/bootstrap.test.ts scripts/seed-lokal.test.ts src/app/m/radio/_db/migrations.test.ts
```

Erwartet: `typecheck` **0 Fehler** · `lint` **0 Fehler** · alle drei Testdateien **grün**. Die zwei
Kopplungstests aus Schritt 1 von M1 sind damit geschlossen.

Und der Beleg, dass nichts anderes rot geworden ist — die eigenen Dateien sind neu, also darf sich
außerhalb nichts bewegt haben:

```
rtk pnpm vitest run src/core scripts
```

Erwartet: keine neuen Fehlschläge gegenüber dem Ausgangsstand aus M1 Schritt 1.

- [ ] **Schritt 6: Der eine Commit des Blocks**

```bash
rtk git add src/app/m/radio/_db/schema.ts src/app/m/radio/_db/client.ts \
  src/app/m/radio/_db/drizzle.config.ts src/app/m/radio/_db/migrations \
  src/app/m/radio/_db/migrations.test.ts src/app/m/radio/_lib/seedLokal.ts \
  src/core/bootstrap.ts Dockerfile scripts/seed-lokal.ts
rtk git commit -m "feat(radio): das Zielschema, die zwei Migrationen und das Registrierungsdreieck"
rtk git show --stat HEAD
```

⚠️ Prüfe in der Ausgabe, dass **genau** diese Dateien drin sind — die unverfolgten
Planungsdokumente und `.idea/` gehören **nicht** dazu.

---

## Aufgabe M4: Der Quelltext-Scan — kein Löschweg, und keine Fläche vor Planteil 2

**Files:**
- Create: `src/app/m/radio/_db/append.test.ts`

**Interfaces:**
- Consumes: nur das Verzeichnis `src/app/m/radio/`.
- Produces: nichts an Code — zwei Riegel.

- [ ] **Schritt 1: Den Test schreiben**

```ts
// src/app/m/radio/_db/append.test.ts
import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const WURZEL = "src/app/m/radio";

/** Alle `.ts`/`.tsx`-Dateien unter `src/app/m/radio`, rekursiv. Dieselbe Bauform, mit der
 *  src/core/shell/icons.test.ts:54-63 den Quellbaum abgeht. */
function sammleQuellen(verzeichnis: string, treffer: string[] = []): string[] {
  for (const eintrag of readdirSync(verzeichnis)) {
    const pfad = join(verzeichnis, eintrag);
    if (statSync(pfad).isDirectory()) {
      if (eintrag === "migrations") continue; // SQL und Snapshots, kein TypeScript
      sammleQuellen(pfad, treffer);
    } else if (eintrag.endsWith(".ts") || eintrag.endsWith(".tsx")) {
      treffer.push(pfad);
    }
  }
  return treffer;
}

describe("radio: zugangscodes sind nicht loeschbar", () => {
  it("kein Loeschweg auf zugangscodes", () => {
    /*
     * "NICHT LOESCHBAR" BRAUCHT EINEN MECHANISMUS, KEINEN SATZ. radio-admin hat null
     * Trigger, und lagerbuch erzwingt es ebenfalls nicht in SQL. Die Durchsetzung ist
     * dreiteilig (§2.4): es gibt keinen Loeschweg, DIESER Scan haelt das fest, und der
     * Grund steht als Kommentar in der Spalte selbst.
     *
     * DER SCHADEN, den er verhindert: ein geloeschter Code kann an ein spaeter
     * ausgestelltes Kaertchen zurueckfallen, und danach erscheinen HISTORISCHE Journal-
     * und Verwaltungszeilen unter dem neuen Label. Der Import hat keinen zweiten Versuch.
     *
     * ⚠️ ER HAENGT AM TABELLENNAMEN. Hiesse die Tabelle anders als `zugangscodes`, waere
     * dieser Test STILL GRUEN — er suchte nach einer Zeichenkette, die nirgends steht
     * (Spec 1 B6 nennt genau das als Grund, warum der Name gesetzt ist).
     *
     * Er faengt die naheliegende Verdrahtung, nicht jede denkbare. Das ist bekannt und
     * akzeptiert — dasselbe Mittel und dieselbe Einschraenkung wie in
     * scripts/seed-lokal.test.ts:56.
     */
    const treffer = sammleQuellen(WURZEL)
      .filter((p) => !p.endsWith("append.test.ts"))
      .filter((p) => /delete\(\s*zugangscodes\s*\)/.test(readFileSync(p, "utf8")));
    expect(treffer, `Loeschweg auf zugangscodes gefunden in: ${treffer.join(", ")}`).toEqual([]);
  });
});

describe("radio: vor dem Host-Riegel entsteht keine Flaeche", () => {
  it("kein page/layout/route/_actions unter src/app/m/radio", () => {
    /*
     * DER HOST-RIEGEL STEHT ERST IN PLANTEIL 2 (Spec 1 Kapitel 1, `_lib/host.ts`). Bis
     * dahin waere JEDE Flaeche dieses Moduls von JEDEM Suite-Host erreichbar — Falle 61,
     * und `pnpm typecheck`, `pnpm lint` und `pnpm build` sind dabei alle drei gruen. Das
     * ist die Gegenauflage zu der Entscheidung, Kapitel 2 VOR Kapitel 1 zu bauen
     * (2026-08-21-radio-modul-leitplan.md, Abschnitt "Die Abweichung").
     *
     * ⚠️ DIESER FALL IST ZUM LOESCHEN BESTIMMT. Planteil 2 legt Seiten an; wer ihn dann
     * rot findet, entfernt ihn MIT der Aufgabe, die den Riegel baut — nicht vorher, und
     * nicht "weil er stoert". Er ist ein Termin, kein Verbot.
     */
    const flaechen = sammleQuellen(WURZEL).filter((p) => {
      const name = p.split("/").pop() ?? "";
      return (
        name === "page.tsx" ||
        name === "layout.tsx" ||
        name === "route.ts" ||
        p.includes("/_actions/")
      );
    });
    expect(
      flaechen,
      `Flaeche vor dem Host-Riegel: ${flaechen.join(", ")} — siehe Planteil 2`,
    ).toEqual([]);
  });
});
```

- [ ] **Schritt 2: Beide Fälle rot sehen — mit einer Sonde, die zurückgenommen wird**

Ein Test, der gegen einen sauberen Baum sofort grün ist, ist unbewiesen. Stelle den Fehlschlag her:

```
printf 'import { zugangscodes } from "../_db/schema";\nexport const weg = (db: unknown) => (db as { delete: (t: unknown) => unknown }).delete(zugangscodes);\n' > src/app/m/radio/_lib/sonde.ts
mkdir -p src/app/m/radio/_actions && printf 'export const sonde = 1;\n' > src/app/m/radio/_actions/sonde.ts
rtk pnpm vitest run src/app/m/radio/_db/append.test.ts
```

Erwartet: **2 failed**, mit den Sondendateien in den Meldungen. Zitiere sie. Dann restlos zurück:

```
rm src/app/m/radio/_lib/sonde.ts && rm -r src/app/m/radio/_actions
rtk git status --porcelain src/app/m/radio
```

Erwartet: **leer**.

- [ ] **Schritt 3: Grün sehen**

```
rtk pnpm vitest run src/app/m/radio/_db/append.test.ts
```

Erwartet: **2 passed**.

- [ ] **Schritt 4: Tor und Commit**

```
rtk pnpm typecheck && rtk pnpm lint
```

```bash
rtk git add src/app/m/radio/_db/append.test.ts
rtk git commit -m "test(radio): kein Loeschweg auf zugangscodes, und keine Flaeche vor dem Host-Riegel"
rtk git show --stat HEAD
```

---

## Aufgabe M5: Die Retention-Rechnung — `retentionGrenze` und `raeumeLeihhistorie`

⚠️ **Nur die Rechnung, nicht der Takt** (Naht NS-M1, entschieden in Spec 1 B5).
`starteRadioHintergrund()`, `stoppeRadioHintergrund()`, die drei `RADIO_HISTORIE_*`-Variablen und
`radioBootFehler()` gehören **Kapitel 7 / Planteil 5** und werden **in derselben Datei** ergänzt.
Zwei Rümpfe wären zwei Timer und zwei Läufe je Takt.

**Files:**
- Create: `src/app/m/radio/_lib/boot.ts`
- Create: `src/app/m/radio/_lib/boot.test.ts`

**Interfaces:**
- Consumes: `loans` aus `_db/schema`, `type DB` aus `_db/client`.
- Produces: `RETENTION_MONATE_VORGABE = 2` · `retentionGrenze(jetzt?: Date, monate?: number): Date` ·
  `raeumeLeihhistorie(db: DB, jetzt?: Date, monate?: number): number`.

- [ ] **Schritt 1: Die fünf Tests zuerst schreiben**

```ts
// src/app/m/radio/_lib/boot.test.ts
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import Database from "better-sqlite3";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import * as schema from "../_db/schema";
import { loans } from "../_db/schema";
import { retentionGrenze, raeumeLeihhistorie } from "./boot";

/**
 * EINE DATEI, DREI BESCHREIBENDE ORTE, KEINE ZEILE DOPPELT (Spec 1 B5): hier stehen die
 * REINEN Faelle ueber `retentionGrenze` und die DB-Faelle ueber `raeumeLeihhistorie`
 * (§8.2.5 / §2.7.3). Die fuenf TAKT-Faelle mit `vi.useFakeTimers()` (§2.7.2) und die
 * Boot-Pruefungen (§7.3.7) kommen mit Planteil 5 in DIESE Datei — nicht in eine zweite.
 * Es gibt KEIN `_lib/retention.test.ts`.
 */
let tmp: string;
let sqlite: Database.Database;
let db: ReturnType<typeof drizzle<typeof schema>>;

const JETZT = new Date("2026-08-17T12:00:00Z");

beforeAll(() => {
  tmp = mkdtempSync(join(tmpdir(), "radio-boot-"));
  sqlite = new Database(join(tmp, "radio.db"));
  sqlite.pragma("foreign_keys = ON");
  migrate(drizzle(sqlite), { migrationsFolder: "src/app/m/radio/_db/migrations" });
  db = drizzle(sqlite, { schema });
});

afterAll(() => {
  sqlite.close();
  rmSync(tmp, { recursive: true, force: true });
});

beforeEach(() => {
  sqlite.prepare("delete from loans").run();
});

/** Eine Leihe, die nur in den Feldern abweicht, die der Fall braucht. Sekundengenaue
 *  Zeiten: `mode: "timestamp"` speichert Sekunden, Millisekunden gingen verloren. */
function leihe(werte: Partial<typeof loans.$inferInsert>): typeof loans.$inferInsert {
  return {
    id: `l-${Object.values(werte).join("-")}`,
    deviceId: "g-1",
    snapshotCallSign: "Muehlheim 1/83",
    borrowerName: "Seed Person",
    borrowedAt: new Date("2026-01-01T10:00:00Z"),
    createdAt: new Date("2026-01-01T10:00:00Z"),
    updatedAt: new Date("2026-01-01T10:00:00Z"),
    ...werte,
  };
}

const tag = (d: Date) => d.toISOString().slice(0, 10);

describe("retentionGrenze — rein", () => {
  it("retentionGrenze auf 2026-08-17 ergibt 2026-06-17", () => {
    expect(tag(retentionGrenze(JETZT))).toBe("2026-06-17");
  });

  it("retentionGrenze auf 2026-04-30 ergibt 2026-03-02 — die Monatsende-Verschiebung der Quelle wird uebernommen", () => {
    /*
     * UEBERNOMMENES VERHALTEN, KEIN FEHLER. `setUTCMonth(getUTCMonth() - 2)` auf dem
     * 30. April ergibt "30. Februar" und normalisiert auf den 2. Maerz — der Cutoff wandert
     * an solchen Tagen bis zu zwei Tage NACH VORN und loescht ein wenig mehr, als die
     * Richtlinie woertlich sagt. Die Quelle rechnet zeichengleich so
     * (radio-admin/server/src/services/retentionService.ts:17-21), und Paritaet ist hier
     * das staerkere Argument als arithmetische Eleganz: eine korrigierte Monatsarithmetik
     * liesse im Ziel Zeilen stehen, die die Alt-App geloescht haette, und die Abweichung
     * fiele niemandem auf. Dieser Fall haelt die Entscheidung fest, damit sie nicht als
     * Fehler "repariert" wird.
     */
    expect(tag(retentionGrenze(new Date("2026-04-30T00:00:00Z")))).toBe("2026-03-02");
  });
});

describe("raeumeLeihhistorie — gegen die migrierte Datenbank", () => {
  it("eine am Cutoff-Tag zurueckgegebene Leihe bleibt", () => {
    // Die Grenze selbst ist AUSGESCHLOSSEN: `lt(returnedAt, grenze)`.
    db.insert(loans).values(leihe({ deviceId: "g-grenze", returnedAt: retentionGrenze(JETZT) })).run();
    expect(raeumeLeihhistorie(db, JETZT)).toBe(0);
    expect(db.select().from(loans).all()).toHaveLength(1);
  });

  it("eine einen Tag vor dem Cutoff zurueckgegebene Leihe geht", () => {
    const einenTagFrueher = new Date(retentionGrenze(JETZT).getTime() - 24 * 60 * 60 * 1000);
    db.insert(loans).values(leihe({ deviceId: "g-alt", returnedAt: einenTagFrueher })).run();
    expect(raeumeLeihhistorie(db, JETZT)).toBe(1);
    expect(db.select().from(loans).all()).toHaveLength(0);
  });

  it("eine AKTIVE Leihe bleibt, egal wie alt ihr borrowed_at ist", () => {
    /*
     * `returned_at IS NULL` ist keine Zeit und faellt nie unter einen Cutoff — auch nicht
     * bei einer jahrealten aktiven Leihe. Verhalten der Quelle
     * (radio-admin/server/src/repos/loanRepo.ts:191-196). Ein "aufraeumen, was zu lange
     * draussen ist" gibt es nicht und darf hier nicht entstehen: eine verschwundene aktive
     * Leihe ist der Verlust der Information, WER ein Geraet hat.
     */
    db.insert(loans)
      .values(
        leihe({
          deviceId: "g-uralt",
          borrowedAt: new Date("2019-01-01T10:00:00Z"),
          returnedAt: null,
        }),
      )
      .run();
    expect(raeumeLeihhistorie(db, JETZT)).toBe(0);
    expect(db.select().from(loans).all()).toHaveLength(1);
  });
});
```

- [ ] **Schritt 2: Den Fehlschlag sehen**

```
rtk pnpm vitest run src/app/m/radio/_lib/boot.test.ts
```

Erwartet: **rot** auf Suite-Ebene — `./boot` existiert nicht. Zitiere die Ausgabe.

- [ ] **Schritt 3: `boot.ts` schreiben**

```ts
// src/app/m/radio/_lib/boot.ts
// KEIN "use client" (Falle 6).
//
// ⚠️ DIESE DATEI TRAEGT AM ENDE ZWEI EXPORTGRUPPEN AUS ZWEI PLANTEILEN, und die
// Reihenfolge ist Pflicht (Spec 1 B8):
//   * Kapitel 2 (HIER): `retentionGrenze`, `raeumeLeihhistorie` — die Rechnung.
//   * Kapitel 7 (Planteil 5): `radioBootFehler()`, das VOR den Migrationen laeuft und
//     keine Tabelle liest, und `starteRadioHintergrund()`/`stoppeRadioHintergrund()`
//     samt RADIO_HISTORIE_MONATE/_PURGE/_ERSTLAUF_MINUTEN, die DANACH laufen und die
//     Tabelle brauchen.
// Zwei Ruempfe fuer denselben Takt waeren zwei Timer in einer Datei und zwei Laeufe je
// Takt — deshalb steht der Takt hier NICHT, auch nicht "vorlaeufig".
import { and, isNotNull, lt } from "drizzle-orm";
import type { DB } from "../_db/client";
import { loans } from "../_db/schema";

/** Vorbelegung von `RADIO_HISTORIE_MONATE` (§7.4.1). Der Takt und die Umgebungsvariable
 *  liegen in Planteil 5 — dieselbe Datei, aber nicht dieser Abschnitt.
 *
 *  Uebernommen wird die Regel `HISTORY_RETENTION_MONTHS = 2`
 *  (radio-admin/server/src/services/retentionService.ts:9). Der Grund steht dort im
 *  Kommentar und ist der einzige, der zaehlt: `borrower_name` ist personenbezogen, und das
 *  Loeschen ist eine ausdrueckliche geplante Richtlinie, keine Nebenwirkung davon, dass
 *  jemand die Historie liest. */
export const RETENTION_MONATE_VORGABE = 2;

/**
 * Der Cutoff als DATE, nicht als Millisekundenzahl (§2.7.4). Rein und testbar.
 *
 * WARUM `Date` UND NICHT `number`: die eigentliche Gefahr ist ein falscher Cutoff, und er
 * hat zwei Gestalten — die Einheit und das Vorzeichen. Eine `Date`-Grenze kann keinen
 * Faktor 1000 tragen, weil Drizzle die Umrechnung fuer `mode: "timestamp"` selbst besorgt.
 * Spec 1 B16 hat aus genau diesem Grund eine `number`-Fassung gestrichen: "eine Zahl ist
 * in eine `mode: \"timestamp\"`-Spalte nicht einfuegbar — das haette erst der erste echte
 * Insert gezeigt, nie der Mapper-Test."
 *
 * `monate` kommt aus `RADIO_HISTORIE_MONATE` (Planteil 5) — der Aufrufer reicht ihn durch,
 * diese Funktion liest KEINE Umgebung.
 */
export function retentionGrenze(jetzt: Date = new Date(), monate = RETENTION_MONATE_VORGABE): Date {
  const d = new Date(jetzt.getTime());
  d.setUTCMonth(d.getUTCMonth() - monate);
  return d;
}

/**
 * Ein Lauf. Gibt die Zahl geloeschter Zeilen zurueck. WIRFT NICHT.
 *
 * ZU OFT IST HARMLOS: der Cutoff ist zeitbasiert und der DELETE idempotent; zwei Laeufe in
 * einer Minute loeschen dieselbe leere Menge. Die Kosten sind ein indizierter DELETE ueber
 * `loans_returned_at_idx`.
 *
 * NIE IST EINE RICHTLINIEN-ABWEICHUNG, KEIN FUNKTIONSAUSFALL: `borrower_name` sammelt sich
 * ueber die Zwei-Monats-Richtlinie hinaus an, nichts bricht. Feststellbar mit
 * `SELECT COUNT(*) FROM loans WHERE returned_at IS NOT NULL
 *  AND returned_at < unixepoch('now','-2 months');` — sie gehoert als wiederkehrende
 * Pruefung ins Runbook (Zusage an Spec 2), weil ein stehengebliebener Timer sich nicht von
 * selbst meldet.
 *
 * AKTIVE LEIHEN BLEIBEN, IMMER: `isNotNull(returnedAt)` ist die halbe Zusage von §2.7.4.
 */
export function raeumeLeihhistorie(db: DB, jetzt?: Date, monate?: number): number {
  const grenze = retentionGrenze(jetzt, monate);
  const ergebnis = db
    .delete(loans)
    .where(and(isNotNull(loans.returnedAt), lt(loans.returnedAt, grenze)))
    .run();
  return ergebnis.changes;
}
```

- [ ] **Schritt 4: Grün sehen**

```
rtk pnpm vitest run src/app/m/radio/_lib/boot.test.ts
```

Erwartet: **5 passed**.

- [ ] **Schritt 5: Die Mutationsprobe auf den einen Ausdruck, der still falsch sein kann**

Der Vorzeichenfehler ist die benannte Gefahr (§2.7.3). Stelle sicher, dass ein Test ihn sieht:
ändere in `boot.ts` `d.getUTCMonth() - monate` **probeweise** zu `d.getUTCMonth() + monate`, lauf
die Datei, und **nimm die Änderung zurück**:

```
rtk pnpm vitest run src/app/m/radio/_lib/boot.test.ts
rtk git diff --stat src/app/m/radio/_lib/boot.ts
```

Erwartet: mutiert **rot** in mindestens den zwei reinen Fällen; nach der Rücknahme ist
`git diff` **leer**. Zitiere beides.

- [ ] **Schritt 6: Tor und Commit**

```
rtk pnpm typecheck && rtk pnpm lint
```

```bash
rtk git add src/app/m/radio/_lib/boot.ts src/app/m/radio/_lib/boot.test.ts
rtk git commit -m "feat(radio): die Retention-Rechnung — retentionGrenze und raeumeLeihhistorie"
rtk git show --stat HEAD
```

---

## Aufgabe M6: Abnahme von Hand — und die drei ⬜, die den Import-Weg entsperren

Kein neuer Code. Diese Aufgabe **liest ab** und **protokolliert**, was dreizehn Aufgaben des
Import-Wegs seit dem 2026-08-19 blockiert.

**Files:**
- Create: `docs/superpowers/berichte/2026-08-21-radio-datenhaltung-ablesungen.md`

**Interfaces:**
- Consumes: alles aus M1–M5.
- Produces: ⬜ **L1**, ⬜ **L3**, ⬜ **L4** und ⬜ **M-L2** als protokollierte Werte.

- [ ] **Schritt 1: Den Seed fahren**

```
rtk pnpm seed:lokal radio
```

`scripts/seed-lokal.ts:98` ruft `migrateAllModules()` **vor** dem Seed — der Lauf legt `.data/radio.db`
also selbst an und migriert sie. Erwartet in der Ausgabe: die zwei `console.info`-Zeilen mit den
Ausleih-Codes im Klartext.

⚠️ Läuft der Befehl in `no configuration file provided` oder einen Pfadfehler: er **muss aus dem
Repo-Wurzelverzeichnis** kommen (`scripts/seed-lokal.ts:27`).

- [ ] **Schritt 2: Die Datenbank von Hand nachsehen**

```
rtk proxy sqlite3 .data/radio.db ".tables"
rtk proxy sqlite3 .data/radio.db "select count(*) from devices; select count(*) from software_versions; select count(*) from users; select count(*) from loans; select count(*) from zugangscodes; select count(*) from device_events;"
```

Erwartet: sechs Tabellen plus `__drizzle_migrations`; **8** devices, **3** software_versions,
**1** users, **4** loans, **2** zugangscodes, **0** device_events.

Und der Riegel, der sonst nur im Test steht:

```
rtk proxy sqlite3 .data/radio.db "select name, \"unique\", partial from pragma_index_list('loans');"
```

Erwartet: `loans_device_active_uidx|1|1` in der Liste.

- [ ] **Schritt 3: Die Idempotenz von Hand prüfen**

```
rtk pnpm seed:lokal radio
rtk proxy sqlite3 .data/radio.db "select count(*) from devices; select count(*) from loans;"
```

Erwartet: **unverändert** 8 und 4. Ein zweiter Lauf, der Dubletten anlegt, ist ein Fehlschlag
dieser Aufgabe, nicht eine Beobachtung.

- [ ] **Schritt 4: ⬜ M-L2 und ⬜ L4 ablesen**

```
rtk proxy sqlite3 .data/radio.db "select count(*) from __drizzle_migrations;"
rtk read src/app/m/radio/_db/migrations/meta/_journal.json
```

Die zwei Zahlen müssen **gleich** sein (erwartet: **2**). Weichen sie ab, ist eine Migration nicht
angewendet worden — dann ist der Journaleintrag aus M2 Schritt 5 zu prüfen, **nicht** die Zahl
zu notieren.

- [ ] **Schritt 5: Den Bericht schreiben**

`docs/superpowers/berichte/2026-08-21-radio-datenhaltung-ablesungen.md`, mit genau diesen
Abschnitten:

1. **⬜ L1 — die zehn Typaliase.** Ihre Namen, wortwörtlich aus `_db/schema.ts` kopiert, mit
   Zeilennummer. Dazu der Satz, welche Aufgaben sie entsperren (B5, B6, B7, B9, B14, B15, B16).
2. **⬜ L3 — die vollständigen Spaltenlisten** der vier übrigen Paritätssichten, abgelesen aus
   `pragma_table_info` **und** gegen `_db/schema.ts` gehalten: `users` **3**, `software_versions`
   **6**, `device_events` **8**, `loans` **12**. ⚠️ Für jede Spalte die Angabe, ob sie
   `mode: "timestamp"` trägt (also durch `sekunden()` muss) — und die **eine** Ausnahme
   `devices.last_updated_at`, die **TEXT** ist und **unumgerechnet** bleibt.
3. **⬜ L4 / M-L2** — die Zahl aus Schritt 4, mit dem Journal daneben.
4. **⬜ M-L1** — der gewürfelte Name der `0000`.
5. **Was nicht abgelesen werden konnte**, falls etwas. Eine benannte Leerstelle bleibt eine
   benannte Leerstelle.

- [ ] **Schritt 6: Tor und Commit**

```
rtk pnpm typecheck && rtk pnpm lint
rtk pnpm vitest run src/app/m/radio src/core/bootstrap.test.ts scripts/seed-lokal.test.ts
```

Erwartet: alles grün — **12 Fälle** aus diesem Planteil (5 Migrationen + 2 Scans + 5 Retention) plus
die Bestandsfälle.

```bash
rtk git add docs/superpowers/berichte/2026-08-21-radio-datenhaltung-ablesungen.md
rtk git commit -m "docs(radio): die Ablesungen der Datenhaltung — L1, L3, L4 und der Name der 0000"
```

⚠️ `.data/radio.db` ist git-ignoriert (`.gitignore:3`) und gehört **nicht** in den Commit.

---

## Nachträge — was der Bau von M1–M6 an den Dokumenten gefunden hat

Fünf Funde vom 2026-08-21. Sie betreffen **die Plandokumente**, nicht den gebauten Code — der ist
grün und gegengeprüft. Wer sie nicht einträgt, läuft beim nächsten Durchgang erneut hinein.

| # | Fund | Wo er hingehört |
|---|---|---|
| **NT-M1** | ⛔ **M3 Schritt 1 widerspricht M3 Schritt 4.** Der vorgegebene Code schreibt `export function seedLokalRadio(db: DB): void` mit `console.info`-Ausgabe; die in Schritt 4 vorgegebene `SEED_MODULE`-Zeile verlangt aber `SeedModul.lauf: () => Promise<string[]>` (`scripts/seed-lokal.ts:51-54`). Wörtlich umgesetzt wäre das ein `typecheck`-Fehler an der Zeile, die derselbe Plan vorgibt. Alle sechs Geschwister-Seeds sind `async ... Promise<string[]>` | **Nachtrag am Plan**, M3 Schritt 1. Gebaut wurde die Hausform (`async`, Rückgabe der Protokollzeilen, die zwei Codes im Klartext darin) — die Entscheidung steht, sie gehört nur ins Dokument |
| **NT-M2** | ⚠️ **Offen — Entscheidung an Ruben, keine erledigte Sache.** Der Kommentar „Ein fester Tag als Ausgangspunkt, damit die Zeilen zwischen zwei Läufen gleich aussehen" steht über `const JETZT = new Date()` — also über dem Ausführungszeitpunkt, nicht über einem festen Tag. Die Gleichheit zwischen zwei Läufen kommt allein von den stabilen ids plus `onConflictDoNothing()`. Folge: nach einem **abgebrochenen** Lauf hängen die nachgezogenen Zeilen an einer anderen Zeitbasis als die bereits geschriebenen. Wortlaut ist planvorgegeben | **Entscheidung an Ruben, dann Nachtrag am Plan**, M3 Schritt 1. Zwei Wege: `JETZT` auf ein Datumsliteral festnageln (dann trägt der Kommentar), oder den Kommentar auf die tatsächliche Begründung umschreiben (dann bleibt der Zeitversatz nach Abbruch). Schaden ist auf lokale Demodaten begrenzt |
| **NT-M3** | **M4 Schritt 2 verlangt `rtk git status --porcelain src/app/m/radio` = leer nach der Rücknahme der Sonden** — in der vom Plan selbst vorgegebenen Reihenfolge (Test in Schritt 1, Commit erst in Schritt 4) ist das unerfüllbar: `_db/append.test.ts` ist zu diesem Zeitpunkt noch unverfolgt und erscheint als `??`. Der Beleg, den der Schritt haben will, ist „leer **bis auf die eigene, noch unverfolgte Testdatei**" | **Nachtrag am Plan**, M4 Schritt 2. Der Implementer hat es richtig gelesen und den Beleg entsprechend geführt |
| **NT-M4** | ⛔ **Die eiserne Regel benennt den falschen Mechanismus.** Der Plan schreibt: „Der **Hash** jeder Datei steht in `__drizzle_migrations`; eine neu erzeugte bestehende Datei lässt bereits migrierte Datenbanken in eine Absturzschleife laufen." Der Hash steht dort, aber der SQLite-Migrator **vergleicht ihn nie** (`node_modules/drizzle-orm/sqlite-core/dialect.js:653-670`, selbst verifiziert). Das Tor ist **allein `when`**. Verdeckte Folgen: eine **in place editierte** `.sql` wird still **ignoriert** (gleiches `when`), nicht zur Absturzschleife; eine neu erzeugte mit **größerem** `when` führt DDL erneut aus (der gemeinte Fall); ein **kleineres** `when` lässt die Migration **still ausfallen** — die Klasse, die die heutige Formulierung gar nicht abdeckt | **Nachtrag am Plan**, Global Constraints. Die Regel ist in ihrer Wirkung richtig, ihre Begründung gehört auf `when` umgeschrieben und um den Satz ergänzt: „ein handgetragenes `when` liegt **nie** in der Zukunft und **immer** über dem vorhergehenden." Dieser Satz hätte Important 1 verhindert |
| **NT-M5** | ⛔ **M2 Schritt 5 nennt den falschen Präzedenzfall.** Der Plan sagt: „`when` muss **größer** sein als das der `0000` (nimm dessen Wert und **runde nach oben**, so wie der `aufgaben`-Präzedenzfall es tut)." Bei `aufgaben` lag der gerundete Wert `1786900000000` **114 Stunden in der Vergangenheit**, weil die `0002` dort lange nach den anderen nachgetragen wurde. „Nach oben runden" von einer **frisch generierten** `0000` landet zwangsläufig in der **Zukunft** — genau der Defekt aus Important 1. Die tragfähige Hausform ist `lagerbuch`: **+1000 ms** (vier Einträge in `…220142 -> …221142 -> …222142 -> …223142`) | **Nachtrag am Plan**, M2 Schritt 5. Die Anweisung gehört auf „`0000`-Wert **+ 1000 ms**" umgeschrieben, mit `lagerbuch` als Präzedenzfall statt `aufgaben` |
| **NT-M6** | **`migrations.test.ts` trägt seit dem Abschlussreview einen **fünften** Fall.** Er prüft das Journal selbst: die `when`-Werte sind streng steigend, und das letzte liegt **nicht in der Zukunft** (`migrations.test.ts:112-137`). Er entstand als Behebung von NT-M5 und ist der einzige Riegel gegen eine Fehlerklasse, die **kein** anderes Tor dieses Planteils sehen kann — beide Testdateien legen eine **frische** Datenbank an, und dort ist `lastDbMigration` `undefined` | **Nachtrag am Plan.** Nachgezogen ist **M6 Schritt 6** (jetzt **12 Fälle**: 5 Migrationen + 2 Scans + 5 Retention). **M2 Schritt 6 sagt weiterhin „4 passed“ — absichtlich:** der Aufgabentext beschreibt den *Auftrag*, nicht den heutigen Bestand, und die Aufgabentexte bleiben unangetastet. Wer `migrations.test.ts` heute öffnet und fünf Fälle findet, liest hier, woher der fünfte kommt |

---

## Was dieser Plan bewusst NICHT umsetzt

| Was | Wo es hingehört | Warum nicht hier |
|---|---|---|
| `scripts/import/radio.ts` — Mapper, Paritätssichten, Fixture | **Spec 2**, `2026-08-18-plan1-radio-import.md` (B5–B17) | Naht NS-M2. B1–B4 sind gebaut; §2.2.4 der Spec beschreibt **dieselbe** Datei, nicht eine zweite |
| `starteRadioHintergrund()`, der Timer, `RADIO_HISTORIE_*`, der Abschalter | **Planteil 5** (Kapitel 7 §7.3.5) | Naht NS-M1, entschieden in B5. Zwei Rümpfe wären zwei Timer |
| `radioBootFehler()` und die Zeile in `assertHostConfig()` | **Planteil 5** (Kapitel 7 §7.3.1–§7.3.4) | B8. „Ohne die Zeile laufen alle Prüfungen **nie**, die Tests dazu sind grün und `pnpm build` auch" |
| Die Registry-Zeile, `_lib/host.ts`, die Routenkarte | **Planteil 2** (Kapitel 1) | Die Reihenfolge-Abweichung des Leitplans, mit der Gegenauflage aus M4 |
| Alles über `zugangscodes` außer der Tabelle: Erzeuger, Gate, Sitzung, Sperr-Action | **Planteil 3** (Kapitel 3) | Zusage 3 von §2.11: „Länge und Alphabet entscheidet Kapitel 3; das Schema schreibt kein Format vor" |
| Ein Index auf `loans.zugangscode_id` | nirgends | Der Verzicht ist **gerechnet**: die einzige Leserichtung ist ein Lookup über den PK der Codetabelle. Ein Index trüge nur eine Abfrage, die keine Fläche stellt |
| Ein zweiter partieller Index gegen „genau eine `is_target`-Zeile" | nirgends | §2.6 ausdrücklich: er „würde das Setzen der Marke von einer Zweischritt-Transaktion in einen Konflikt verwandeln und den bestehenden Schreibweg brechen". Ersatz ist Abfrage 2 aus §2.8.3, **blockierend**, im Runbook |
| Ein Append-only-Trigger auf `device_events` | nirgends | „Die Quelle hat keinen, und einer im Ziel wäre eine Verhaltensänderung, die dem Import den `INSERT OR IGNORE`-Weg erschwert" |
| `api_tokens` | nirgends | Entscheidung 13. Ersatz ist ein `SELECT`-Auszug ins Cutover-Protokoll (Zusage an Spec 2) |

---

## Zusagen dieses Planteils an die anderen

| # | Zusage | an |
|---|---|---|
| 1 | Die **zehn** Typaliase heißen `NeuesGeraet`/`Geraet`, `NeueSoftwareVersion`/`SoftwareVersion`, `NeuerBenutzer`/`Benutzer`, `NeuesGeraeteEreignis`/`GeraeteEreignis`, `NeueLeihe`/`Leihe` und werden aus `src/app/m/radio/_db/schema.ts` exportiert | **B5–B17** (Spec 2, Plan 1 und 2) |
| 2 | `loans` hat **12** Spalten. Die zwölfte ist `zugangscodeId` — nullable, ohne Index, `REFERENCES zugangscodes(id)` ohne `ON DELETE`. Beim Import bleibt sie für **alle** Alt-Leihen `NULL` | **B13** (`paritaetsSichtLeihe`, 12 Spalten) · Planteil 3 |
| 3 | `devices.lastUpdatedAt` ist **`string \| null`** im Format `YYYY-MM-DD` — **keine** Zeitspalte, keine Umrechnung durch `sekunden()` | **B5**, **B9** · Planteil 4 (Formular und CSV-Export arbeiten mit der Zeichenkette) |
| 4 | Alle übrigen Zeitspalten sind `integer(mode: "timestamp")` = **Sekunden**. Keine trägt `timestamp_ms` | **B5–B13** |
| 5 | `device_events.source` ist ein Drizzle-Enum **ohne** DB-CHECK: die Datenbank akzeptiert jeden String. Die Prüfung leistet allein der Mapper | **B6** |
| 6 | `loans_device_active_uidx` existiert, ist **partiell** und **unique**, und ist über `pragma_index_list('loans')` prüfbar — **nicht** über eine Textsuche in `sqlite_master` | **B15** (Fall B bricht an ihm) · **C13** |
| 7 | `radio.db` entsteht durch `migrateAllModules()` und trägt nach diesem Planteil **zwei** Migrationszeilen | **C9**, **C15** |
| 8 | Die Anzeigespalte heißt `bezeichnung`, nicht `label`. Der Tabellenname ist `zugangscodes` und trägt einen Quelltext-Scan, der bei Abweichung **still grün** wäre | Planteil 3 · Planteil 4 |
| 9 | `retentionGrenze` und `raeumeLeihhistorie` stehen in `_lib/boot.ts` und rechnen mit `Date`. Der **Takt** ist nicht gebaut — `starteRadioHintergrund()` fehlt noch | **Planteil 5** |
| 10 | `seedAllModules()` hat **keine** `radio`-Zeile und `bootstrap.ts` **keinen** `radio`-Schema-Import. Wer eine einträgt, macht in einer Generalprobe einen anonymen Schreibzugang | Planteil 3 · Planteil 5 |
| 11 | Es gibt **keine** Fläche unter `src/app/m/radio/` — und `_db/append.test.ts` hält das fest, bis Planteil 2 den Host-Riegel baut. **Dieser Testfall ist mit Planteil 2 zu entfernen** | **Planteil 2** |

---

## Selbstprüfung gegen den Entwurf

| Frage | Antwort |
|---|---|
| Ist jede Sektion von Kapitel 2 einer Aufgabe zugeordnet? | §2.1 → M1 (client.ts) · §2.2.3 → M1 (TEXT-Spalte) · §2.2.4/§2.2.5 → **Spec 2, gebaut** (NS-M2) · §2.4 → M1 + M4 · §2.5 → M1 · §2.6 → M2 · §2.7.1/§2.7.3/§2.7.4 → M5 · §2.7.2 (Takt) → **Planteil 5** (NS-M1) · §2.8 → **Spec 2** · §2.9.1/§2.9.2/§2.9.4 → M2 + M3 · §2.9.3 (`startBackgroundWork`) → **Planteil 5** · §2.10 → nichts zu bauen · §2.11 → die Zusagentabelle oben |
| Steht in diesem Plan ein Platzhalter oder ein erfundener Wert? | Nein. Die zwei ⬜ (M-L1, M-L2) sind **Ablesungen** mit benanntem Ablesepunkt. Die zwei Seed-Codes folgen der in §3.2.1 **entschiedenen** kanonischen Form; der erste ist das Beispiel der Spec selbst, und M3 vermerkt, dass sie gegen `normalisiereCode` zu prüfen sind, sobald Planteil 3 ihn baut |
| Passen die Typen und Namen der späteren Schritte zu den früheren? | `DB` kommt in M3 und M5 aus `../_db/client`, definiert in M1. `loans` und die vier anderen Tabellen kommen aus `../_db/schema`. `retentionGrenze`/`raeumeLeihhistorie` werden in M5 definiert und **nirgends** vorher benutzt. `seedLokalRadio(db: DB)` wird in M3 definiert und in derselben Aufgabe verdrahtet |
| Hat jede Aufgabe einen eigenen Testzyklus? | Vier von sechs. **M1 und M2 haben keinen eigenen grünen Torlauf** — begründet in Naht NS-M4 und in den Aufgaben selbst ausgeschrieben: die vier Kopplungstests des Bestands lassen zwischen „Schemadatei angelegt" und „Seed verdrahtet" keinen grünen Zustand zu. M2 hat einen eigenen **Testsatz** (4 Fälle), nur kein eigenes Tor. M6 hat keinen neuen Test — es ist eine Ablesung |
| Wird irgendwo eine Zusicherung gebaut, welche die Bauform nicht halten kann? | Nein, und zwei Stellen sind ausdrücklich davor bewahrt: der Index wird über `pragma_index_list` geprüft und **nicht** über eine Textsuche (gemessen: `instr(...)` = 0), und der Retention-Takt wird **nicht** getestet, weil er hier nicht existiert. Der Präzedenzfall ist vernarbt: die `lagerbuch`-Spec verlangte ein `cookies().delete()` in einer Server Component, wo es **wirft** |
| Was ist nach diesem Planteil messbar besser? | **B5–B17 sind ausführbar** (13 Aufgaben), **C9 und C15** ebenso, und `radio.db` existiert mit einem lokalen Bestand, gegen den man arbeiten kann. Was **nicht** besser ist: es gibt weiterhin keine Fläche, keinen Host-Riegel, keinen Takt und keine Generalprobe |
