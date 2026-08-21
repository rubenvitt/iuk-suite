# Plan 2 von 5 · Paritaet, Feldstichproben und die Abfragen vor dem Import — Umsetzungsplan (Spec 2, Kapitel 2)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Die Pruefungen, die zwischen dem Import und dem Umschwenk des Routers stehen, sind
ausfuehrbar niedergeschrieben: fuenf Paritaetssichten, die **jede** Spalte des Zielschemas fuehren und
deren Vollstaendigkeit ein Test mechanisch belegt · dreizehn Abfragen gegen die Alt-Datenbank mit
Erwartung, Ergebniszeile und Entscheidungsregel je Fall · Feldstichproben, die den blinden Fleck der
Paritaet schliessen · die Gegenzaehlungen nach dem Import. Nach diesem Planteil kann eine Pruefende
sagen, **welche** Zusage geprueft ist und welche allein auf einem Unit-Test ruht.

**Architecture:** Der Planteil zerfaellt in **zwei Haelften, die in zwei verschiedene Plandokumente
wandern** und deshalb hier sauber getrennt stehen.

* **Teil A — CODE (→ Bau-Plan).** Vier fehlende Paritaetssichten (`software_versions` 6 Spalten ·
  `users` 3 · `device_events` 8 · `loans` 12) und ein **Vollstaendigkeitstest**, der die Spaltenliste
  nicht abschreibt, sondern aus dem Drizzle-Schema liest. Reihenfolge ist tragend: der Test **zuerst**
  (Aufgabe 1), dann die vier Sichten (Aufgaben 2–5). Eine abgeschriebene Spaltenliste haette denselben
  blinden Fleck wie die Sicht, die sie pruefen soll.
* **Teil B — RUNBOOK (→ Runbook-Plan).** Der Leseapparat auf beiden Armen (§L), die dreizehn
  Vorabfragen A1–A13 (§V), die Feldstichproben (§S), die Gegenzaehlungen nach dem Import (§Z).
  Adressat ist `docs/runbooks/radio-cutover.md`.

**Tech Stack:** Next.js 16 (App Router, RSC) · Drizzle ORM 0.45.2 + better-sqlite3 13 · Vitest 4.1.5
(`environment: "node"`) · `tsx` fuer die Import-Skripte · `sqlite3` in einem Wegwerf-`alpine`-Container
fuer alle Ablesungen am Ziel.

**Spec:** `docs/superpowers/specs/2026-08-18-radio-cutover-design.md`, Kapitel 2 (Zeilen 1578–2271),
Rahmen (1–561), Anhaenge (4880–4914).

**Herkunft dieses Planteils:** Spec 1 (`docs/superpowers/specs/2026-08-17-radio-modul-design.md`) ist
**nicht gebaut** — `src/app/m/radio/` existiert nicht, `scripts/import/radio.ts` existiert nicht
(im Repo geprueft; Spec 2:111, Spec 1:928). Jede Aufgabe von Teil A traegt deshalb eine Zeile
**Wartet auf:** mit der Nummer aus der ⬜/E/U/C-Tabelle des Rahmens. Teil B ist heute vollstaendig
schreibbar; nur die Ergebnisspalten bleiben leer, und das ist die Hausform
(`docs/runbooks/files-cutover.md:57-58`: „Betriebswerte werden nicht erfunden").

---

## Global Constraints

- **Kommandos:** `pnpm typecheck` · `pnpm lint` · `pnpm vitest run` · `pnpm build`. Alle mit `rtk`
  praefixen (`rtk pnpm vitest run`).
- **Nach jeder Aufgabe:** `rtk pnpm typecheck && rtk pnpm lint && rtk pnpm vitest run` gruen, dann
  committen. Ein Torlauf, der nicht gelaufen ist, ist kein gruener Torlauf.
- **`pnpm test` sammelt `scripts/import/**` MIT.** Gemessen; der Kommentar `vitest.config.ts:4-5`
  („so `pnpm test` only collects the unit tests under src/") ist irrefuehrend, `vitest.config.ts:35`
  setzt **nur** `exclude`. Ein neues `scripts/import/radio-paritaet.test.ts` laeuft ohne jede
  Konfigurationsaenderung.
- **Kein Worktree unter `.claude/worktrees/`** — das Verzeichnis liegt im Repo und vergiftet die
  Pruefungstore (`vitest.config.ts:8-34`, 251 Fremdfehlschlaege gemessen). Und **kein `pnpm build`
  vor einem Testlauf**, den man ernst nimmt: `.next/standalone/src/` ist eine vollstaendige Kopie des
  Quellbaums **inklusive Testdateien** und migriert parallel dieselben `.data/`-Pfade (52
  Fehlschlaege, ebenda).
- **ZEIT IST UNIX-SEKUNDEN.** Jede Zeitspalte des Ziels traegt `{ mode: "timestamp" }`, **niemals**
  `timestamp_ms`. Der Kopfkommentar `src/app/m/lagerbuch/_db/schema.ts:11-16` schreibt es aus und
  nennt den wahrscheinlichsten Weg in den Fehler: ein Copy-Paste aus `m/qr/_db/schema.ts:19-20`. Der
  Fehler waere **paritaetsgruen** und wuerde die Leihhistorie loeschen (Spec 2, Randbedingung 3).
  Aufgabe 1 baut den mechanischen Riegel dagegen.
- **`getModuleDb()` wird in Tests NICHT benutzt.** Der globale Cache ist per Modulschluessel gekeyt,
  nicht per `DATA_DIR` (`src/core/db/index.ts:27-36`); zwischen zwei Tests kaeme ein stale Handle auf
  die alte Datei zurueck. Die Begruendung steht ausgeschrieben in `scripts/import/portal.test.ts:23-25`.
- **Belegpflicht.** Jede Behauptung in einem Kommentar oder einer Runbook-Zeile nennt `datei:zeile`.
  Wo eine Zahl, ein Name oder eine Ausgabe erst der Bau oder der Server hergibt, steht eine **benannte
  Leerstelle**, nie eine plausibel aussehende Erfindung. Der Praezedenzfall ist vernarbt: die
  `lagerbuch`-Spec verlangte ein `cookies().delete()` in einer Server Component, wo es **wirft**.
- **Deutsch, mit Umlauten**, in Prosa und in Runbook-Zeilen. In Quelltext-Kommentaren gilt die
  juengere Hausform (`docs/superpowers/plans/2026-08-15-aufgaben-koordination-aus-gruppe.md`):
  Umlaute transliteriert, damit kein Encoding-Unterschied durch die Tore laeuft.

---

## Wovon dieser Planteil abhaengt — die Leerstellen, je Aufgabe verankert

**Sie steht vorn, nicht in einer Fussnote.** Jede Zeile ist eine **Ablesung**, keine Entscheidung.

| ⬜ / N | Was genau abzulesen ist | Quelle | Blockiert |
|---|---|---|---|
| **L1** | Die zehn Typaliase, die `src/app/m/radio/_db/schema.ts` exportiert. Spec 1 §2.2.4 belegt **zwei** (`NeuesGeraet`, `Geraet`); §8.2.1 **verwendet** vier weitere insert-seitig (`NeueSoftwareVersion`, `NeuerBenutzer`, `NeuesGeraeteEreignis`, `NeueLeihe`); die **vier select-seitigen** (`SoftwareVersion`, `Benutzer`, `GeraeteEreignis`, `Leihe`) stehen **nirgends** | Bau (Schemadatei) | Aufgaben 2–5 (Signaturen) |
| ~~N2~~ ⛔ **aufgeloest — keine Leerstelle** | Die **Export-Namen der fuenf Tabellenobjekte** in `schema.ts`. Die fruehere Begruendung („die Quellnamen, aber als Export nirgends gesetzt") ist gemessen falsch: **Spec 1 §2.5 schreibt alle fuenf woertlich als `export const` aus** — `devices` (`2026-08-17-radio-modul-design.md:1206`), `softwareVersions` (`:1254`), `users` (`:1298`), `deviceEvents` (`:1311`), `loans` (`:1349`). Es ist nichts abzulesen, und keine Nummer zu fuehren | Beleg: Spec 1 §2.5 — **nicht** offen | nichts mehr (Aufgabe 1 haengt nur noch an ⬜ L1 und daran, **dass die Datei gebaut ist**) |
| **L3** | Namen und **vollstaendige** Spaltenlisten der vier uebrigen Paritaetssichten. ⚠️ Die **Namen** stehen in Spec 2 §1.5.2 (Z. 1150–1156) als **Aufrufstellen** — `paritaetsSichtBenutzer`, `paritaetsSichtSoftwareVersion`, `paritaetsSichtGeraeteEreignis`, `paritaetsSichtLeihe`; als **Export** sind sie ungeschrieben | Bau | Aufgaben 2–5 |
| **L4** | `select count(*) from __drizzle_migrations;` in `radio.db` gegen die Zahl der Eintraege in `src/app/m/radio/_db/migrations/meta/_journal.json` | Bau | Aufgabe 11 (§Z) |
| **L5** ⚠️ **hier eingeschraenkt** | **Nur noch der SOLLWERT von `revision`** in `/api/health/radio`. Die **Feldnamen sind heute lesbar** und werden in Aufgabe 11 ausgeschrieben: `module` = Modulschluessel, `status: "ok"` = DB-Zugriff ueber `SELECT 1`, `revision` = Commit (`src/core/health/index.ts:4-15`, `src/app/api/health/[modul]/route.ts:23-26`) | Server / §4.2 Nr. 1 | Aufgabe 11 (§Z) |
| **N1** *(neu)* | **Haelt der regulaere Stack `radio.db` nach dem Boot dauerhaft offen?** Begruendung fuer die neue Nummer: §2.2.2 und W5 Residuum 2 begruenden das Verbot von `immutable=1` im Fenster mit „Migrationen, Health, Boot-Haken" — zwei der drei Wege **schliessen** ihr Handle nachweislich (`src/core/bootstrap.ts:103` `sqlite.close()`, `src/core/health/index.ts:13-15` `db?.close()` im `finally`), der dritte ist ungebaut (`src/app/m/radio/` existiert nicht). Die Entscheidung bleibt, ihr Grund wird als **konservative Wahl** beschriftet | Bau (radio-Boot-Haken) | Aufgabe 6 (§L), zusaetzlich §4.5 Schritt 4 Handgriff 3 mit **anderer** Konsequenz |
| **E2** | Echter Volume-Name von `radio-admin` (`docker volume ls \| grep -i radio-data` — compose praefixt mit dem Projektnamen) | Server | Aufgaben 7–10 (Quellarm) |
| **`$VOL_SUITE`** | Echter Volume-Name der Suite (`docker volume ls \| grep -i suite`; in Prod `suite_data`, `compose.yaml:221-223`) | Server | Aufgaben 6, 9, 10, 11 (Zielarm) |
| **`<freeze_iso>`** | Der in §4.5 Schritt 1 protokollierte Freeze-Zeitpunkt (ISO, UTC) | Fenster (Kapitel 4) | Aufgabe 11, und Abfrage R in Kapitel 5 |
| **U7** | Lief `radio-admin` in Prod je mit `AUTH_DEV_BYPASS`? — wird von **A9** beantwortet und ist nach dem geloeschten Volume nicht mehr stellbar | Abfrage A9 | Aufgabe 8 (Protokollpflicht) |
| **C.1 / C.3** | Bauform und Umlauf des Ausleih-Codes | Betreiber | **nicht** dieser Planteil. `zugangscodes` ist nicht Teil des Imports; Kapitel 2 beruehrt sie nur als Nullprobe (§2.2.3) |

⚠️ **C.6 / B4 (Updater-Rechtestufe) ist fachlich blockierend und bewusst geparkt.** Kapitel 2 haengt
nicht daran: keine Abfrage, keine Sicht und keine Stichprobe dieses Planteils liest eine Rolle.

---

# Teil A — CODE (wandert in den **Bau**-Plan)

Fuenf Aufgaben. Ort: `scripts/import/radio.ts` (die fuenf `paritaetsSicht*`-Exporte plus den lokalen
Helfer `sekunden`) und die **neue** Datei `scripts/import/radio-paritaet.test.ts`.

⚠️ **Warum eine zweite Testdatei und nicht `radio.test.ts`:** Spec 1 §2.2.5 setzt fuer
`scripts/import/radio.test.ts` **elf verbindliche Testnamen**, und W8 stuft genau diesen Fehlertyp als
tragend ein — eine Wortzahl neben einer laengeren Liste. Ein zwoelfter Block in derselben Datei
wuerde die Zahl „elf" unbrauchbar machen und zwei Planteilen dieselbe Datei geben. Vorbild fuer die
Trennung: `scripts/import/feedback.ts` + `feedback-time.ts` mit je eigener Testdatei. **Diese
Abweichung ist benannt und begruendet, nicht still.**

---

### Aufgabe 1: Der Vollstaendigkeitstest der Paritaetssichten — er kommt zuerst

**Warum zuerst:** Spec 2 §2.1.4 sagt ueber eine Sicht, der eine Spalte fehlt: „**und das sieht kein
Test**". Dieser Test sieht es. Wer die vier Sichten zuerst von Hand schreibt und den Test danach,
schreibt die Spaltenliste zweimal ab — und ein zweites Abschreiben hat denselben blinden Fleck wie
das erste.

**Wartet auf:** Spec 1 §2.5 — `src/app/m/radio/_db/schema.ts` mit den fuenf Tabellenobjekten
(§2.5.1–2.5.5, namentlich) und den zehn Typaliasen (⬜ **L1**). Ohne die Datei laesst sich der Import in Schritt 1
nicht aufloesen; **der Test ist ab dem Tag ausfuehrbar, an dem sie existiert**, auch wenn die vier
Sichten noch fehlen — dann ist er rot, und genau das ist sein Zweck.

**Dateien:**
- Anlegen: `scripts/import/radio-paritaet.test.ts`
- Test: `scripts/import/radio-paritaet.test.ts` (diese Datei **ist** der Test)

**Schnittstellen:**
- Verbraucht: `getTableColumns` aus `drizzle-orm` (vorhanden, `package.json:30`, `drizzle-orm ^0.45.2`) ·
  die fuenf Tabellenobjekte aus `@/app/m/radio/_db/schema` (Spec 1 §2.5, namentlich) · die fuenf Exporte
  `paritaetsSichtGeraet`, `paritaetsSichtSoftwareVersion`, `paritaetsSichtBenutzer`,
  `paritaetsSichtGeraeteEreignis`, `paritaetsSichtLeihe` aus `./radio` (⬜ L3; nur
  `paritaetsSichtGeraet` ist von Spec 1 §2.2.4 ausgeschrieben).
- Liefert: **sechs Zusicherungsgruppen** — (a) Spaltenvollstaendigkeit je Sicht, (b) jede
  `timestamp`-Spalte verlaesst die Sicht als Sekundenzahl, (c) `null` bleibt `null`,
  (d) keine Zeitspalte ist `mode: "timestamp_ms"`, (e) `devices.last_updated_at` ist TEXT und laeuft
  unumgerechnet durch, (f) die Spaltenzahlen 25 / 6 / 3 / 8 / 12.

**Die gemessenen Tatsachen, auf denen dieser Test steht** (mit drizzle-orm 0.45.2 gegen ein
nachgebautes `sqliteTable` ausgefuehrt, nicht hergeleitet):

| Ausdruck | Ergebnis |
|---|---|
| `getTableColumns(t)[k].columnType` bei `text(...)` | `"SQLiteText"` |
| … bei `integer(..., { mode: "boolean" })` | `"SQLiteBoolean"` |
| … bei `integer(...)` ohne Modus | `"SQLiteInteger"` |
| … bei `integer(..., { mode: "timestamp" })` **und** bei `{ mode: "timestamp_ms" }` | **beide** `"SQLiteTimestamp"` — `columnType` allein unterscheidet sie **nicht** |
| `col.mapToDriverValue(new Date(1_000_000_000_000))` bei `timestamp` | `1000000000` |
| … bei `timestamp_ms` | `1000000000000` |

⚠️ **Die vierte Zeile ist der Grund, warum (d) ueber `mapToDriverValue` geht und nicht ueber
`columnType`.** Ein `timestamp_ms` im Zielschema waere der Faktor-1000-Fehler in seiner leisesten
Form: paritaetsgruen, weil beide Arme durch dieselbe Sicht laufen.

- [ ] **Schritt 1: Die Testdatei anlegen — sie ist zunaechst rot**

```ts
// scripts/import/radio-paritaet.test.ts
//
// Spec 2 §2.1.4: "Fehlt eine Spalte in einer Sicht, ist die Paritaet fuer sie blind,
// UND DAS SIEHT KEIN TEST." Dieser Test sieht es.
//
// Die Spaltenliste wird NICHT abgeschrieben, sondern aus dem Drizzle-Schema gelesen
// (getTableColumns). Eine abgeschriebene Liste haette denselben blinden Fleck wie die
// Sicht, die sie pruefen soll.
//
// Gemessen mit drizzle-orm 0.45.2 (package.json:30):
//   columnType === "SQLiteText"      -> text(...)
//   columnType === "SQLiteBoolean"   -> integer(..., { mode: "boolean" })
//   columnType === "SQLiteInteger"   -> integer(...) ohne Modus
//   columnType === "SQLiteTimestamp" -> mode:"timestamp" ODER mode:"timestamp_ms"
//        ^ deshalb pruefen wir die EINHEIT ueber mapToDriverValue, nicht ueber columnType:
//          mapToDriverValue(new Date(1_000_000_000_000)) === 1_000_000_000     bei "timestamp"
//                                                        === 1_000_000_000_000 bei "timestamp_ms"
import { describe, it, expect } from "vitest";
import { getTableColumns } from "drizzle-orm";
import * as schema from "@/app/m/radio/_db/schema";
import {
  paritaetsSichtGeraet,
  paritaetsSichtSoftwareVersion,
  paritaetsSichtBenutzer,
  paritaetsSichtGeraeteEreignis,
  paritaetsSichtLeihe,
} from "./radio";

type Spalte = {
  name: string;
  columnType: string;
  mapToDriverValue: (v: unknown) => unknown;
};
type SpaltenListe = Record<string, Spalte>;

function spalten(tabelle: unknown): SpaltenListe {
  return getTableColumns(
    tabelle as Parameters<typeof getTableColumns>[0],
  ) as unknown as SpaltenListe;
}

/**
 * Eine Zeile mit EINEM Wert je Spalte. Die Zeitstempel sind paarweise verschieden —
 * dieselbe Regel, die portal.ts:73-76 den Fixtures auferlegt: gleiche Werte bestehen
 * jede Vertauschung.
 */
function vollzeile(sp: SpaltenListe): Record<string, unknown> {
  const zeile: Record<string, unknown> = {};
  let n = 0;
  for (const [feld, spalte] of Object.entries(sp)) {
    switch (spalte.columnType) {
      case "SQLiteTimestamp":
        // 2025-01-01T00:00:00Z plus n Sekunden — je Spalte ein anderer Wert.
        zeile[feld] = new Date(1_735_689_600_000 + n * 1000);
        n += 1;
        break;
      case "SQLiteBoolean":
        zeile[feld] = true;
        break;
      case "SQLiteInteger":
        zeile[feld] = 7;
        break;
      default:
        zeile[feld] = `wert-${feld}`;
    }
  }
  return zeile;
}

const SICHTEN = [
  { name: "devices", tabelle: schema.devices, sicht: paritaetsSichtGeraet, spaltenzahl: 25 },
  { name: "software_versions", tabelle: schema.softwareVersions, sicht: paritaetsSichtSoftwareVersion, spaltenzahl: 6 },
  { name: "users", tabelle: schema.users, sicht: paritaetsSichtBenutzer, spaltenzahl: 3 },
  { name: "device_events", tabelle: schema.deviceEvents, sicht: paritaetsSichtGeraeteEreignis, spaltenzahl: 8 },
  { name: "loans", tabelle: schema.loans, sicht: paritaetsSichtLeihe, spaltenzahl: 12 },
] as const;

describe("Die fuenf Paritaetssichten decken das Zielschema vollstaendig ab (Spec 2 §2.1.4)", () => {
  for (const { name, tabelle, sicht, spaltenzahl } of SICHTEN) {
    it(`${name}: die Sicht fuehrt JEDE Spalte der Zieltabelle — keine mehr, keine weniger`, () => {
      const sp = spalten(tabelle);
      const aus = sicht(vollzeile(sp) as never) as Record<string, unknown>;
      expect(Object.keys(aus).sort()).toEqual(Object.keys(sp).sort());
    });

    it(`${name}: die Zieltabelle hat ${spaltenzahl} Spalten`, () => {
      expect(Object.keys(spalten(tabelle)).length).toBe(spaltenzahl);
    });

    it(`${name}: jede timestamp-Spalte verlaesst die Sicht als Unix-SEKUNDEN, nie als Date`, () => {
      const sp = spalten(tabelle);
      const roh = vollzeile(sp);
      const aus = sicht(roh as never) as Record<string, unknown>;
      for (const [feld, spalte] of Object.entries(sp)) {
        if (spalte.columnType !== "SQLiteTimestamp") continue;
        const erwartet = Math.floor((roh[feld] as Date).getTime() / 1000);
        expect(aus[feld], `${name}.${feld}`).toBe(erwartet);
      }
    });

    it(`${name}: null in einer timestamp-Spalte bleibt null — nicht 0 und nicht 1970`, () => {
      const sp = spalten(tabelle);
      const roh = vollzeile(sp);
      for (const [feld, spalte] of Object.entries(sp)) {
        if (spalte.columnType === "SQLiteTimestamp") roh[feld] = null;
      }
      const aus = sicht(roh as never) as Record<string, unknown>;
      for (const [feld, spalte] of Object.entries(sp)) {
        if (spalte.columnType !== "SQLiteTimestamp") continue;
        expect(aus[feld], `${name}.${feld}`).toBeNull();
      }
    });
  }
});

describe("Das Zielschema haelt die Zeiteinheit der Suite ein", () => {
  it("KEINE radio-Zeitspalte ist mode:'timestamp_ms' — der Faktor-1000-Fehler waere paritaetsgruen", () => {
    // src/app/m/lagerbuch/_db/schema.ts:11-16 nennt den wahrscheinlichsten Weg dorthin:
    // ein Copy-Paste aus m/qr/_db/schema.ts:19-20.
    const probe = new Date(1_000_000_000_000); // 2001-09-09T01:46:40Z
    for (const { name, tabelle } of SICHTEN) {
      for (const [feld, spalte] of Object.entries(spalten(tabelle))) {
        if (spalte.columnType !== "SQLiteTimestamp") continue;
        expect(spalte.mapToDriverValue(probe), `${name}.${feld}`).toBe(1_000_000_000);
      }
    }
  });

  it("devices.last_updated_at ist TEXT und laeuft UNUMGERECHNET durch die Sicht", () => {
    // Spec 1 §2.2.3: Kalendertag YYYY-MM-DD in Europe/Berlin, kein Zeitstempel.
    const sp = spalten(schema.devices);
    expect(sp.lastUpdatedAt.columnType).toBe("SQLiteText");
    const roh = vollzeile(sp);
    roh.lastUpdatedAt = "2025-03-02";
    const aus = paritaetsSichtGeraet(roh as never) as Record<string, unknown>;
    expect(aus.lastUpdatedAt).toBe("2025-03-02");
  });
});
```

- [ ] **Schritt 2: Lauf zur Bestaetigung des Fehlschlags**

```bash
rtk pnpm vitest run scripts/import/radio-paritaet.test.ts
```

Erwartung: **rot**, mit `Failed to resolve import "./radio"` bzw.
`No "paritaetsSichtBenutzer" export is defined`. Ist er statt dessen **gruen**, ist etwas anderes
importiert worden als gedacht — nicht weitermachen, den Importpfad pruefen.

- [ ] **Schritt 3: Die vier Select-Aliase ablesen, die fuenf Tabellen-Exporte gegenlesen (⬜ L1)**

Die gebaute `src/app/m/radio/_db/schema.ts` oeffnen und **beide** Listen woertlich ins
Aufgabenprotokoll schreiben:

```bash
rtk grep -n 'export const\|export type' src/app/m/radio/_db/schema.ts
```

Erwartung: fuenf Tabellenobjekte (`devices`, `softwareVersions`, `users`, `deviceEvents`, `loans` —
Spec 1 §2.5.1–2.5.5, `:1206` / `:1254` / `:1298` / `:1311` / `:1349`), dazu `zugangscodes` (§2.5.6,
`:1394`) als **sechster** Export, der keines der fuenf Tabellenobjekte ist, und zehn Typaliase.
Weicht ein Name ab, wird **der Test** angepasst, nicht das Schema — und die Abweichung geht in den
Bericht dieses Planteils: die **Aliase**, weil ⬜ L1 sie als offen fuehrt; die **fuenf
Tabellennamen**, weil Spec 1 §2.5 sie woertlich festschreibt und eine Abweichung dort ein
**Bau**-Fehler ist, keine Ablesung.

- [ ] **Schritt 4: Commit**

```bash
rtk pnpm typecheck && rtk pnpm lint
rtk git add scripts/import/radio-paritaet.test.ts
rtk git commit -m "test(radio): Vollstaendigkeitstest der fuenf Paritaetssichten, aus dem Schema gelesen"
```

⚠️ `rtk pnpm vitest run` ist an dieser Stelle **rot und soll es sein**. Der Commit haelt den roten
Test fest; Aufgaben 2–5 machen ihn Tabelle fuer Tabelle gruen. Wer hier die Tore erzwingen will,
schreibt die vier Sichten blind — genau die Reihenfolge, die dieser Planteil vermeidet.

---

### Aufgabe 2: `paritaetsSichtBenutzer` — `users`, 3 Spalten

**Wartet auf:** Spec 1 §2.5.3 — `src/app/m/radio/_db/schema.ts`, Tabelle `users`, und die Typaliase
`NeuerBenutzer` / `Benutzer` (⬜ **L1**; `NeuerBenutzer` ist in Spec 1 §8.2.1 als Signaturbestandteil
genannt, `Benutzer` **nirgends**).

**Dateien:**
- Aendern: `scripts/import/radio.ts` (ein neuer Export; der lokale Helfer `sekunden` steht dort
  bereits aus Spec 1 §2.2.4)
- Test: `scripts/import/radio-paritaet.test.ts` (aus Aufgabe 1, unveraendert)

**Schnittstellen:**
- Verbraucht: `NeuerBenutzer | Benutzer` aus `@/app/m/radio/_db/schema` (⬜ L1) · den lokalen Helfer
  `const sekunden = (d: Date | null) => (d ? Math.floor(d.getTime() / 1000) : null);`
  (Spec 1 §2.2.4, zeichengleich `tsSeconds` aus `scripts/import/portal.ts:69-71`)
- Liefert: `export function paritaetsSichtBenutzer(r: NeuerBenutzer | Benutzer): { sub: string; name: string; lastSeenAt: number | null }`

**Die drei Quellspalten, nachgesehen** an `radio-admin@265abd5`,
`server/src/db/schema.ts:78-82`: `sub` (PK, text) · `name` (text, notNull) · `last_seen_at` (integer,
notNull, epoch-ms).

- [ ] **Schritt 1: Lauf zur Bestaetigung des Fehlschlags — nur fuer `users`**

```bash
rtk pnpm vitest run scripts/import/radio-paritaet.test.ts -t users
```

Erwartung: rot, `No "paritaetsSichtBenutzer" export is defined`.

- [ ] **Schritt 2: Die Sicht schreiben**

In `scripts/import/radio.ts`, neben `paritaetsSichtGeraet`:

```ts
/**
 * Paritaetssicht `users` — ALLE DREI Spalten namentlich, keine Auswahl.
 * `portal.ts:78-81` ist das Vorbild: eine Sicht, die nur eine Teilmenge fuehrt,
 * zertifiziert auch nur diese Teilmenge — und der Rest der Zeile ist paritaetsblind.
 *
 * `lastSeenAt` ist im Ziel `{ mode: "timestamp" }` (Spec 1 §2.5.3) und laeuft deshalb
 * durch `sekunden()`; ohne diese Normalisierung scheitert ein zeichengleicher Import
 * allein an Sub-Sekunden (portal.ts:66-71).
 */
export function paritaetsSichtBenutzer(r: NeuerBenutzer | Benutzer) {
  return {
    sub: r.sub,
    name: r.name,
    lastSeenAt: sekunden(r.lastSeenAt),
  };
}
```

- [ ] **Schritt 3: Test gruen fuer `users`**

```bash
rtk pnpm vitest run scripts/import/radio-paritaet.test.ts -t users
```

Erwartung: **vier gruene Faelle** fuer `users` (Vollstaendigkeit · Spaltenzahl 3 · Sekunden ·
`null` bleibt `null`). Die uebrigen vier Tabellen bleiben rot.

- [ ] **Schritt 4: Tore und Commit**

```bash
rtk pnpm typecheck && rtk pnpm lint
rtk git add scripts/import/radio.ts
rtk git commit -m "feat(radio-import): Paritaetssicht users mit allen drei Spalten"
```

---

### Aufgabe 3: `paritaetsSichtSoftwareVersion` — `software_versions`, 6 Spalten

**Wartet auf:** Spec 1 §2.5.2 — Tabelle `softwareVersions`, Typaliase `NeueSoftwareVersion` /
`SoftwareVersion` (⬜ **L1**).

**Dateien:**
- Aendern: `scripts/import/radio.ts` (ein neuer Export)
- Test: `scripts/import/radio-paritaet.test.ts`

**Schnittstellen:**
- Verbraucht: `NeueSoftwareVersion | SoftwareVersion` (⬜ L1) · `sekunden`
- Liefert: `export function paritaetsSichtSoftwareVersion(r: NeueSoftwareVersion | SoftwareVersion): { id: string; value: string; createdAt: number | null; createdBy: string | null; sortOrder: number; isTarget: boolean }`

**Die sechs Quellspalten, nachgesehen** an `radio-admin@265abd5`,
`server/src/db/schema.ts:43-57`: `id` (PK) · `value` (notNull, unique) · `created_at` (notNull,
epoch-ms) · `created_by` (nullable) · `sort_order` (notNull, **default 0**) · `is_target`
(`{ mode: "boolean" }`, notNull, **default false**).

⚠️ **Diese Tabelle traegt die schaerfste fachliche Invariante des ganzen Imports.** `is_target`
markiert genau **eine** Zeile; der Update-Stand jedes Geraets ist daraus **berechnet, nicht
gespeichert** (`schema.ts:53-56`). Es gibt dafuer keinen DB-Constraint — kein partieller Unique, kein
Trigger, kein CHECK; die Invariante lebt allein in einer Anwendungstransaktion
(`server/src/repos/softwareVersionRepo.ts:77-89`), und der Leser `getTargetVersion` (`:63-71`) nimmt
`.limit(1).get()` **ohne `ORDER BY`**. **Kippt diese eine Zeile, kippt der Status jedes Geraets, und
keine Paritaet sieht es.** Deshalb ist sie Pflicht-Stichprobe (Aufgabe 9, Regel 4) und Gegenzaehlung
(Aufgabe 11), nicht nur eine Sichtzeile.

- [ ] **Schritt 1: Lauf zur Bestaetigung des Fehlschlags**

```bash
rtk pnpm vitest run scripts/import/radio-paritaet.test.ts -t software_versions
```

Erwartung: rot, `No "paritaetsSichtSoftwareVersion" export is defined`.

- [ ] **Schritt 2: Die Sicht schreiben**

```ts
/**
 * Paritaetssicht `software_versions` — alle SECHS Spalten.
 *
 * INSERT-DEFAULTS WERDEN NORMALISIERT, NICHT WEGGELASSEN. Auf dem Quellarm kommt die
 * Zeile aus `toNeueSoftwareVersion(...)` und traegt fuer `sortOrder`/`isTarget`
 * moeglicherweise `undefined`; auf dem Zielarm hat SQLite den DEFAULT eingesetzt und
 * liefert `0` bzw. `false`. Ohne `??` haetten die zwei Arme verschiedene Hashes und
 * die Paritaet waere ROT OHNE FEHLER. `portal.ts:79-80` macht es genauso.
 *
 * ⚠️ `canon()` in parity.ts:16-28 unterscheidet ein explizites `undefined`
 * ({__undefined:true}) von einem fehlenden Feld — ein weggelassenes `?? 0` ist also
 * kein harmloser Zufall, sondern ein garantierter Hash-Unterschied.
 */
export function paritaetsSichtSoftwareVersion(r: NeueSoftwareVersion | SoftwareVersion) {
  return {
    id: r.id,
    value: r.value,
    createdAt: sekunden(r.createdAt),
    createdBy: r.createdBy ?? null,
    sortOrder: r.sortOrder ?? 0,
    isTarget: r.isTarget ?? false,
  };
}
```

- [ ] **Schritt 3: Test gruen fuer `software_versions`**

```bash
rtk pnpm vitest run scripts/import/radio-paritaet.test.ts -t software_versions
```

Erwartung: vier gruene Faelle (Vollstaendigkeit · Spaltenzahl 6 · Sekunden fuer `createdAt` ·
`null` bleibt `null`).

- [ ] **Schritt 4: Tore und Commit**

```bash
rtk pnpm typecheck && rtk pnpm lint
rtk git add scripts/import/radio.ts
rtk git commit -m "feat(radio-import): Paritaetssicht software_versions, Insert-Defaults normalisiert"
```

---

### Aufgabe 4: `paritaetsSichtGeraeteEreignis` — `device_events`, 8 Spalten

**Wartet auf:** Spec 1 §2.5.4 — Tabelle `deviceEvents`, Typaliase `NeuesGeraeteEreignis` /
`GeraeteEreignis` (⬜ **L1**).

**Dateien:**
- Aendern: `scripts/import/radio.ts` (ein neuer Export)
- Test: `scripts/import/radio-paritaet.test.ts`

**Schnittstellen:**
- Verbraucht: `NeuesGeraeteEreignis | GeraeteEreignis` (⬜ L1) · `sekunden`
- Liefert: `export function paritaetsSichtGeraeteEreignis(r: NeuesGeraeteEreignis | GeraeteEreignis): { id: string; deviceId: string; field: string; oldValue: string | null; newValue: string | null; changedBy: string | null; changedAt: number | null; source: string }`

**Die acht Quellspalten, nachgesehen** an `radio-admin@265abd5`,
`server/src/db/schema.ts:84-99`: `id` (PK) · `device_id` (notNull, **FK → `devices.id` ON DELETE
CASCADE**, `:88-90`) · `field` (notNull) · `old_value` · `new_value` · `changed_by` · `changed_at`
(notNull, epoch-ms) · `source` (notNull, Drizzle-Enum `manual | csv-import | create | update-note`,
`:96` — **ohne DB-CHECK**).

⚠️ **`source` steht als Enum nur im Quelltext.** In SQL ist die Spalte `` `source` text NOT NULL ``,
und die Datenbank akzeptiert **jeden** String. Das ist der Grund fuer Abfrage **A5** (Aufgabe 8) und
fuer Spec 1s Testnamen `toNeuesGeraeteEreignis wirft bei source="importiert"`. Die Sicht **prueft
nichts** — sie reicht den Wert durch; das Tor ist der Mapper.

- [ ] **Schritt 1: Lauf zur Bestaetigung des Fehlschlags**

```bash
rtk pnpm vitest run scripts/import/radio-paritaet.test.ts -t device_events
```

Erwartung: rot, `No "paritaetsSichtGeraeteEreignis" export is defined`.

- [ ] **Schritt 2: Die Sicht schreiben**

```ts
/**
 * Paritaetssicht `device_events` — alle ACHT Spalten.
 *
 * `source` wird DURCHGEREICHT, nicht validiert: die Spalte ist in SQL
 * `text NOT NULL` und die DB akzeptiert jeden String (radio-admin@265abd5
 * server/src/db/schema.ts:96, das Enum steht nur im TS-Typ). Das Tor gegen einen
 * fuenften Wert ist `toNeuesGeraeteEreignis` (es WIRFT) und die Vorabfrage A5,
 * nicht diese Sicht.
 *
 * `device_events` ist ein JOURNAL. Der Importer schreibt sie mit
 * `onConflictDoNothing` (Spec 1 §2.8.4, Beleg docs/runbooks/lagerbuch-cutover.md:409),
 * nicht mit einem Upsert — die Sicht aendert daran nichts, aber wer sie liest,
 * soll es wissen.
 */
export function paritaetsSichtGeraeteEreignis(r: NeuesGeraeteEreignis | GeraeteEreignis) {
  return {
    id: r.id,
    deviceId: r.deviceId,
    field: r.field,
    oldValue: r.oldValue ?? null,
    newValue: r.newValue ?? null,
    changedBy: r.changedBy ?? null,
    changedAt: sekunden(r.changedAt),
    source: r.source,
  };
}
```

- [ ] **Schritt 3: Test gruen fuer `device_events`**

```bash
rtk pnpm vitest run scripts/import/radio-paritaet.test.ts -t device_events
```

Erwartung: vier gruene Faelle (Vollstaendigkeit · Spaltenzahl 8 · Sekunden fuer `changedAt` ·
`null` bleibt `null`).

- [ ] **Schritt 4: Tore und Commit**

```bash
rtk pnpm typecheck && rtk pnpm lint
rtk git add scripts/import/radio.ts
rtk git commit -m "feat(radio-import): Paritaetssicht device_events mit allen acht Spalten"
```

---

### Aufgabe 5: `paritaetsSichtLeihe` — `loans`, 12 Spalten (11 aus der Quelle, eine neu)

**Wartet auf:** Spec 1 §2.5.5 — Tabelle `loans`, Typaliase `NeueLeihe` / `Leihe` (⬜ **L1**), und die
Zielspalte `zugangscodeId` (FK → `zugangscodes.id`, B6 — in der Quelle **nicht vorhanden**).

**Dateien:**
- Aendern: `scripts/import/radio.ts` (ein neuer Export)
- Test: `scripts/import/radio-paritaet.test.ts`

**Schnittstellen:**
- Verbraucht: `NeueLeihe | Leihe` (⬜ L1) · `sekunden`
- Liefert: `export function paritaetsSichtLeihe(r: NeueLeihe | Leihe): { id: string; deviceId: string; snapshotCallSign: string; snapshotSerialNumber: string | null; snapshotDeviceType: string | null; borrowerName: string; borrowedAt: number | null; returnedAt: number | null; returnNote: string | null; zugangscodeId: string | null; createdAt: number | null; updatedAt: number | null }`

**Die elf Quellspalten, nachgesehen** an `radio-admin@265abd5`,
`server/src/db/schema.ts:117-137`: `id` · `device_id` (notNull, **kein FK**, `:121` — der
Doc-Kommentar `:106-110` begruendet es woertlich) · `snapshot_call_sign` (notNull) ·
`snapshot_serial_number` · `snapshot_device_type` · `borrower_name` (notNull) · `borrowed_at`
(notNull, epoch-ms) · `returned_at` (nullable, epoch-ms) · `return_note` · `created_at` (notNull) ·
`updated_at` (notNull). **Die zwoelfte, `zugangscode_id`, ist neu im Ziel.**

⚠️ **`snapshotCallSign` und `borrowerName` sind das Verwechslungspaar dieser Tabelle** (Analyse Kap. 4
Pflicht 4). Beide sind `text NOT NULL`, beide tragen einen Namen, und eine Vertauschung ist
**paritaetsgruen**, weil sie auf beiden Armen wirkt. Das Tor ist Spec 1s Testname
`toNeueLeihe: snapshot_call_sign und borrower_name werden nicht vertauscht` plus die Feldstichprobe
aus Aufgabe 9.

- [ ] **Schritt 1: Lauf zur Bestaetigung des Fehlschlags**

```bash
rtk pnpm vitest run scripts/import/radio-paritaet.test.ts -t loans
```

Erwartung: rot, `No "paritaetsSichtLeihe" export is defined`.

- [ ] **Schritt 2: Die Sicht schreiben**

```ts
/**
 * Paritaetssicht `loans` — ZWOELF Felder: die elf Quellspalten plus `zugangscodeId`.
 *
 * `zugangscodeId` hat in der Quelle KEIN Gegenstueck (B6). Sie steht trotzdem in der
 * Sicht, weil die Sicht die ZIELTABELLE zertifiziert, nicht die Quelle: auf dem
 * Quellarm liefert der Mapper `null`, auf dem Zielarm steht `null`, solange niemand
 * ueber die Suite ausgeliehen hat. Ein Wert != null zwischen Import und Pruefung ist
 * im Fenster ein ALARM, kein Datenbefund (Spec 2 §2.2.3) — die dazugehoerige
 * Gegenzaehlung steht in §Z.
 *
 * `returnedAt` ist die einzige nullable Zeitspalte dieser Tabelle. Sie ist zugleich
 * die Spalte, die der Faktor-1000-Fehler zerstoert: Sekunden statt Millisekunden legt
 * jedes `returned_at` ins Jahr 1970, und der Retention-Purge loescht die komplette
 * abgeschlossene Leihhistorie (Spec 2, Randbedingung 3). Aktive Leihen
 * (`returned_at IS NULL`) ueberleben — deshalb sieht der Kiosk danach "richtig" aus.
 */
export function paritaetsSichtLeihe(r: NeueLeihe | Leihe) {
  return {
    id: r.id,
    deviceId: r.deviceId,
    snapshotCallSign: r.snapshotCallSign,
    snapshotSerialNumber: r.snapshotSerialNumber ?? null,
    snapshotDeviceType: r.snapshotDeviceType ?? null,
    borrowerName: r.borrowerName,
    borrowedAt: sekunden(r.borrowedAt),
    returnedAt: sekunden(r.returnedAt ?? null),
    returnNote: r.returnNote ?? null,
    zugangscodeId: r.zugangscodeId ?? null,
    createdAt: sekunden(r.createdAt),
    updatedAt: sekunden(r.updatedAt),
  };
}
```

- [ ] **Schritt 3: Der vollstaendige Lauf — jetzt muessen ALLE Faelle gruen sein**

```bash
rtk pnpm vitest run scripts/import/radio-paritaet.test.ts
```

Erwartung: **vier Faelle je Tabelle plus die zwei Schemazusicherungen** (`timestamp_ms` und
`devices.last_updated_at`) — mit den fuenf Tabellen aus Aufgabe 1 also 22. **Die Ableitung gilt, nicht
die Zahl:** wer einen sechsten Fall je Tabelle ergaenzt, korrigiert diesen Satz, statt an ihm zu
zweifeln. (W8, an der eigenen Zeile angewandt.) Ist die `timestamp_ms`-Zusicherung rot, ist der
Faktor-1000-Fehler **im Schema** und **nicht** im Mapper: dann wird `src/app/m/radio/_db/schema.ts`
korrigiert und eine neue Migration geschrieben — die vorhandene wird **nicht** umgeschrieben
(Migrationen sind append-only, Spec 1 §2.9; ein neu erzeugtes `0000` fuehrt zur Absturzschleife und
hat in `radio-admin` einmal die Produktion lahmgelegt).

- [ ] **Schritt 4: Tore und Commit**

```bash
rtk pnpm typecheck && rtk pnpm lint && rtk pnpm vitest run
rtk git add scripts/import/radio.ts
rtk git commit -m "feat(radio-import): Paritaetssicht loans mit zwoelf Feldern, zugangscodeId inbegriffen"
```

---

# Teil B — RUNBOOK (wandert in den **Runbook**-Plan)

Sechs Aufgaben. Adressat ist `docs/runbooks/radio-cutover.md`, Gattung und Vorbild
`docs/runbooks/files-cutover.md` (Vollform) und `docs/runbooks/feedback-cutover.md` (Import + Paritaet
+ Standby in einem Fluss).

⚠️ **Eigentumsgrenze, damit zwei Planteile nicht dieselbe Datei schreiben.** Kapitel 2 besitzt genau
vier Abschnitte des Runbooks: **§L** (der Leseapparat), **§V** (die dreizehn Vorabfragen), **§S** (die
Feldstichproben), **§Z** (die Gegenzaehlungen). Kopf, Grundlagenzeile, `## ⚠️`-Kopfabschnitt, §0
(Eingaben) und der Ablauf gehoeren dem **Kapitel-4**-Planteil. Legt eine Aufgabe von Teil B die Datei
an, weil Kapitel 4 noch nicht gelaufen ist, schreibt sie **nur** die Grundlagenzeile und ihren eigenen
Abschnitt — nichts sonst.

---

### Aufgabe 6: §L — der Leseapparat auf beiden Armen, mit lauf-abhaengiger Lesart

**Warum eine eigene Aufgabe:** jede Abfrage der Aufgaben 7–11 laeuft ueber einen dieser zwei Befehle.
Steht der Befehl in fuenf Abschnitten fuenfmal leicht anders da, entsteht die Fassung, die um 23 Uhr
falsch abgeschrieben wird. Er steht **einmal** hier und wird zurueckzitiert
(`lagerbuch-cutover.md:365-366` macht es genauso: „Der vollstaendige Wortlaut jeder Zeile steht in
§16.2 — dort und nur dort, damit es eine Fassung gibt und nicht zwei").

**Wartet auf:** nichts aus dem Bau. **E2** (Volume-Name `radio-admin`) ist eine Server-Ablesung und
bleibt als leere Zeile stehen. **`$VOL_SUITE` wird hier NICHT abgelesen** — §L.2 zitiert die
Protokollzeile aus §4.5 Schritt 4 Handgriff 1 zurueck; im ganzen Runbook wird der Name an genau
**zwei** Stellen gesetzt (§4.5 Schritt 4 Handgriff 1 und §5.2), und §L ist keine davon.
⬜ **N1** wird hier **gesetzt**, nicht aufgeloest.

**Dateien:**
- Anlegen bzw. Aendern: `docs/runbooks/radio-cutover.md` — neuer Abschnitt `## §L`
- Test: keiner — dieser Abschnitt ist Prosa und Befehle. Die Pruefung ist Schritt 4.

**Schnittstellen:**
- Verbraucht: `docker`, das `alpine`-Image, `sqlite3` aus `apk`. **Nicht** `docker volume ls` — den
  Volume-Namen liest §4.5 Schritt 4 Handgriff 1 ab, §L zitiert ihn nur zurueck.
- Liefert: die zwei benannten Lesebefehle **Quellarm** (`sqlite3 radio-admin-snapshot.sqlite '<SQL>'`)
  und **Zielarm** (`echo "<SQL>" | docker run --rm -i -v "$VOL_SUITE":/data alpine sh -c '…'`), die
  Protokollzeile `E2`, den **Rueckzitat**-Kasten fuer `$VOL_SUITE` (Bytes und Kennung aus `ls -ln`,
  der Name aus §4.5 Schritt 4 Handgriff 1), und die Lauf-Tabelle mit **je Zeile ihrem Mount**.

- [ ] **Schritt 1: Den Abschnitt anlegen — Kopfteil und die zwei Arme**

````markdown
## §L — Wie auf beiden Armen gelesen wird

**Dieser Abschnitt steht vor allen Abfragen und wird von §V, §S und §Z zurueckzitiert.** Es gibt
genau zwei Lesebefehle. Wer einen dritten baut, hat einen Befehl gebaut, den niemand gegengelesen hat.

**Die zwei Arme sind asymmetrisch, und das ist der Kern dieses Cutovers** (Spec §2.2.2):

| Arm | Wie gelesen wird | Warum nicht anders |
|---|---|---|
| **Quelle** | `sqlite3 radio-admin-snapshot.sqlite '<SELECT>'` gegen die **Snapshot-Kopie**, nie gegen den laufenden Stack. Zusaetzlich **darf** die Alt-Oberflaeche als zweite Meinung dienen: sie laeuft bis zum Umschwenk unter `radio.iuk-ue.de` | Der Alt-Kiosk ist bis zum Umschwenk der Betrieb |
| **Ziel** | ausschliesslich `sqlite3` in einem Container **ohne Traefik-Labels** | ⚠️ Der Zielarm hat **keine** Adresse. „Seite aufmachen und hinsehen" ist auf dem Zielarm **keine** verfuegbare Pruefung |

⚠️ **Eine Ausnahme von der zweiten Meinung, und sie ist benannt:** fuer `devices.last_updated_at` ist
die Alt-Anwendung **kein** Schiedsrichter, sondern eine Muenze — der CSV-Export formatiert den
**UTC**-Tag (`radio-admin@265abd5 server/src/routes/export.ts:49-51`,
`new Date(value).toISOString().slice(0,10)`), die Detailansicht den **lokalen** Tag
(`client/src/utils/format.ts:4` `toLocaleString('de-DE')`,
`client/src/features/devices/DeviceEditForm.tsx:41` `dayjs(device.lastUpdatedAt)`). Die zwei Flaechen
widersprechen sich bei genau den Zeilen, die §S auswaehlt. Der Sollwert steht in §S, nicht hier.

### §L.1 — Der Quellarm

Der Auszug entsteht **einmal je Lauf** mit `.backup`, ⛔ **ohne `docker compose stop`**:

```bash
docker volume ls | grep -i radio-data     # ⚠️ compose praefixt mit dem Projektnamen
VOL=<die Zeile aus dem Befehl oben>       # → Eingabe E2, ins Protokoll
docker run --rm -v "$VOL":/d -v "$PWD":/out alpine \
  sh -c 'apk add --no-cache sqlite >/dev/null 2>&1;
         sqlite3 /d/data.sqlite ".backup /out/radio-admin-snapshot.sqlite"'
```

> Echter radio-admin-Volumename (**E2**): ____________________ ·
> Snapshot-Kopie liegt unter: ____________________ · gezogen am ____________

⚠️ **Warum `.backup` und nicht `cp`:** `radio-admin` laeuft im WAL-Modus
(`radio-admin@265abd5 server/src/db/index.ts:28`). Eine WAL-Datenbank besteht aus **drei** Dateien,
und ein `cp` verliert den Schwanz aller committeten Transaktionen — **paritaetsgruen**, weil eine
abgeschnittene Quelle mit sich selbst vollkommen einig ist. `.backup` ist die Hausform
(`scripts/backup.sh:41-43` sichert jede `*.db` genau so und bricht ohne `*.db` sogar **hart** ab,
`:32-35`).

⚠️ **Warum KEIN Stopp:** `.backup` arbeitet gegen die laufende Datenbank — genau dafuer ist es da.
Ein Stopp waere unnoetig, und der **Neustart danach** loescht Historie:
`radio-admin/server/src/index.ts:35` ruft `startRetentionSchedule`, `retentionService.ts:47` purgt
**sofort**, erst `:48` setzt den Tagestimer, und der Cutoff haengt an der Wanduhr (`:9`, `:19`). Der
Purge meldet dabei **Erfolg** (`retentionService.ts:41`, `[retention] purged N expired loan(s)`).
Der Freeze ist ein Schritt des **Fensters**, nicht der Generalprobe.

Alle Abfragen in §V, §S und §Z laufen auf diesem Arm als:

```bash
sqlite3 radio-admin-snapshot.sqlite '<SQL>'
```

### §L.2 — Der Zielarm

```bash
# ⛔ $VOL_SUITE wird HIER NICHT GESETZT. Diese Befehle gehoeren dem FENSTERLAUF. Die
# GENERALPROBE liest gar nicht das Volume, sondern den Bind-Pfad $GP/data (§L.3, Zeile
# „Generalprobe") und braucht $VOL_SUITE ueberhaupt nicht.
# Im Runbook wird der Name an genau ZWEI Stellen abgelesen — §4.5 Schritt 4 Handgriff 1
# (im Fenster) und §5.2 (die Abbau-Sitzung Wochen spaeter, in einer neuen Shell). Dieser
# Abschnitt erbt die Protokollzeile SEINES Laufs und zitiert sie zurueck. Eine dritte
# Ablesung waere eine dritte Gelegenheit, ein ANDERES Volume zu erwischen — und compose
# praefixt deklarierte Volumes mit dem Projektnamen: ein erfundener oder abweichender
# Name legt ein NEUES, LEERES Volume an, und `sqlite3` liefert dann null Zeilen OHNE
# Fehler.
# ⚠️ IM FENSTER gilt: liegt die Protokollzeile aus §4.5 Schritt 4 Handgriff 1 nicht vor
# dir, hier NICHT weiterlesen und den Namen NICHT neu ablesen, sondern dorthin zurueck.
# In der GENERALPROBE gilt diese Zeile nicht — dort gilt §L.3.

# Gegenprobe, bevor eine einzige Zahl geglaubt wird: eine `0` ist ZUERST ein Volume-Fehler.
docker run --rm -v "$VOL_SUITE":/data alpine ls -ln /data

# Kein `-p`, KEINE Traefik-Labels, kein Netz-Alias, kein `--network` auf das Proxy-Netz.
# Dieser Container BOOTET NICHT — er ist alpine plus sqlite3 und nichts sonst.
# Ein Aufruf je Abfrage, SQL ueber stdin — so muss nichts durch zwei Shell-Ebenen gequotet werden:
echo "select count(*) from devices;" | docker run --rm -i \
  -v "$VOL_SUITE":/data alpine \
  sh -c 'apk add --no-cache sqlite >/dev/null 2>&1; sqlite3 -readonly -header -column /data/radio.db'
```

> Suite-Volumename (**$VOL_SUITE**, **nur im Fenster**): **zurueckzitiert aus §4.5 Schritt 4
> Handgriff 1** — hier wird nichts abgelesen und nichts eingetragen. In der **Generalprobe** entfaellt
> die Zeile: dort gilt §L.3, Zeile „Generalprobe", mit dem Bind-Pfad `$GP/data` ·
> `ls -ln /data` zeigt `radio.db` mit ________ Bytes, Kennung ________ · abgelesen am ____________

⚠️ **Ein leeres Ergebnis ist hier ein Verdacht, kein Befund.** `openModuleDatabase` legt das
Verzeichnis per `mkdirSync(dir, {recursive:true})` an (`src/core/db/index.ts:12-22`), better-sqlite3
die Datei — **ein vertipptes `DATA_DIR` oder ein falscher Volume-Name ergibt eine nagelneue, leere
`radio.db`, und jede Abfrage antwortet `0`, nicht „Datei fehlt".** Deshalb steht die
`ls -ln`-Gegenprobe oben und nicht in einer Fussnote.

⛔ **`sqlite3` auf dem HOST gegen `"$DATA_DIR/radio.db"` ist in diesem Lauf verboten.** Den Pfad gibt
es auf dem Host **nicht**: `DATA_DIR=/data` ist ein **Container**-Wert (`compose.yaml:79`, unter
`environment:`, das ueber `env_file` gewinnt), die Datei liegt im benannten Volume
(`compose.yaml:99`, `:221-223`). Der Befehl bricht dann mit `unable to open database file` ab — laut,
aber ein verbrannter Schritt.
````

- [ ] **Schritt 2: Die Lauf-Tabelle anhaengen — je Zeile ihr Mount**

Direkt unter §L.2. ⚠️ **Diese Tabelle ist gegenueber Spec §2.2.2 korrigiert:** dort dehnt die
Zeile „Generalprobe" den `$VOL_SUITE`-Befehl auf einen Lauf aus, dessen Ziel-DB gar nicht im Volume
liegt. Der Widerspruch ist in der Spec selbst belegt — §1.8 Glied (4) sagt fuer die Generalprobe
`sqlite3 -readonly "$DATA_DIR/radio.db"` **auf dem HOST**, „dort ist DATA_DIR ein Bind-Pfad
(`$GP/data`, §3.1.2)". Und §3.2.1 verbietet der Generalprobe die Zeichenkette `suite_data`
ausdruecklich.

````markdown
### §L.3 — Die Lesart haengt vom Lauf ab, und der Mount steht je Zeile dabei

⚠️ **`:ro` und `-readonly` sind nicht Kosmetik — aber sie haben einen Preis, der benannt sein muss:**
SQLite im WAL-Modus braucht zum **Lesen** eine beschreibbare `-shm`-Datei. Auf einem `:ro`-Mount
scheitert der Befehl mit „unable to open database file" oder „attempt to write a readonly database",
**obwohl die Datenbank in Ordnung ist**. Wer das fuer einen Datenbefund haelt, sucht am falschen Ort.

| Lauf | Ziel-DB liegt | Mount | Lesart |
|---|---|---|---|
| **Generalprobe** | im **Bind-Pfad** `$GP/data` (§3.1.2), **nicht** im Volume | `-v "$GP/data":/data:ro` — oder schlicht ohne Container: `sqlite3 -readonly "$DATA_DIR/radio.db"` auf dem Host, wie §1.8 Glied (4) | `file:/data/radio.db?immutable=1` zulaessig: kein anderer Prozess haengt an der Datei |
| **Fenster** (nach §4.5 Schritt 7) | im Volume `$VOL_SUITE` | `-v "$VOL_SUITE":/data`, **ohne** `:ro` | `sqlite3 -readonly`. ⛔ **Kein `immutable=1`** |

⛔ **Der Textriegel aus §3.2.1 gilt fuer die Generalprobe und nur fuer sie:** „die `docker run`-Zeile
**der Generalprobe** enthaelt die Zeichenkette `suite_data` nicht." Im Fenster ist genau dieses Volume
das Pruefobjekt. **Der Riegel wird immer mit seinem Geltungsbereich zitiert, nie ohne** — ein
`suite_data` in der Generalprobe ist ein Zeichen Unterschied und schreibt in die Produktion.

⬜ **N1 — warum im Fenster kein `immutable=1` steht, und wie fest der Grund ist.** Die
**Entscheidung** steht: kein `immutable=1`, Mount ohne `:ro`. Der **Grund** ist eine konservative
Wahl, keine Messung. Belegbar ist heute nur, dass zwei der drei genannten Wege ihr Handle wieder
schliessen: `migrateAllModules()` ruft `sqlite.close()` (`src/core/bootstrap.ts:103`), und
`checkModuleHealth` schliesst im `finally` (`src/core/health/index.ts:13-15`). Der dritte Weg — ein
radio-Boot-Haken, der das Handle haelt — **existiert nicht und ist deshalb nicht pruefbar**
(`src/app/m/radio/` ist im Repo nicht vorhanden). Abzulesen nach dem Bau: **haelt der regulaere
Stack `radio.db` nach dem Boot dauerhaft offen?** Die Antwort aendert hier nichts (die konservative
Form bleibt richtig), aber sie aendert die Bewertung von §4.5 Schritt 4 Handgriff 3, wo `radio.db`
im laufenden Betrieb **ersetzt** wird.

> ⬜ N1 abgelesen am ____________ · Antwort: ☐ ja, ein Boot-Haken haelt sie offen ☐ nein
> · Beleg (`datei:zeile`): ____________________
````

- [ ] **Schritt 3: Die drei Rueckzitierzeilen setzen**

In §V, §S und §Z bekommt der jeweils erste Absatz die Zeile:

```markdown
**Quellarm: der Befehl aus §L.1. Zielarm: der Befehl aus §L.2, mit der Lesart aus §L.3.**
Wer hier einen eigenen Befehl baut, baut den, den niemand gegengelesen hat.
```

(Sie wird in den Aufgaben 7–11 mitgeschrieben; dieser Schritt legt nur den Wortlaut fest.)

- [ ] **Schritt 4: Gegenlesen — die drei Fallen, die dieser Abschnitt fangen soll**

Den Abschnitt laut gegen diese drei Fragen lesen und je eine Antwort danebenschreiben:

1. Steht **je Lauf** ein Mount da, oder erbt eine Zeile stillschweigend den anderen? *(Erwartung: je
   Lauf ein Mount, ausgeschrieben.)*
2. Steht die `ls -ln`-Gegenprobe **vor** der ersten Zaehlung? *(Erwartung: ja. Eine `0` ist zuerst ein
   Volume-Fehler.)*
3. Ist irgendwo `sqlite3 -readonly "$DATA_DIR/radio.db"` **ohne** die Einschraenkung „nur in der
   Generalprobe, dort ist es ein Bind-Pfad" stehen geblieben? *(Erwartung: nein.)*

Gezaehlt wird die **BEFEHLSFORM**, nicht die Zeichenkette `DATA_DIR/radio.db`: den verbotenen Pfad
zitieren mehrere Runbook-Absaetze im **WARNTEXT** (schon §L.2s ⛔-Absatz, ab §C weitere), und eine
Suche auf die blosse Zeichenkette zaehlt diese Warnungen mit — sie misst dann die Zahl der
Warnhinweise, nicht die Zahl der ausfuehrbaren Zeilen. Die Suchform ist deshalb **zeichengleich** zu
den beiden Toren in `2026-08-18-plan4-radio-cutover.md` (Aufgabe 7, §C Schritt 4–5; und Aufgabe 10, §F+§G+§H) — **eine
Form, eine Erwartung, drei Planteile**:

```bash
rtk grep -n 'sqlite3 -readonly "\$DATA_DIR' docs/runbooks/radio-cutover.md
```

Erwartung: **genau EIN** Treffer, und er ist namentlich bekannt — die Zeile **Generalprobe** der
Lauf-Tabelle in **§L.3**, wo `DATA_DIR` ein **Bind-Pfad** (`$GP/data`, §3.1.2, wie §1.8 Glied (4))
ist und die Form deshalb **erlaubt und ausdruecklich vorgeschrieben** ist.

⚠️ **§L.2 verbietet dieselbe Form fuer den Host — aber im Fliesstext**, im Satz „`sqlite3` auf dem
HOST gegen …", **nicht in der Befehlsform.** Das ⛔ zaehlt hier deshalb **nicht** mit, obwohl §L an
zwei Stellen ueber diese Form spricht.

⚠️ **Ein ZWEITER Treffer ist der Fund, den dieser Schritt sucht** — eine Fenster- oder Abbau-Zeile,
die den Host-Pfad ausfuehrt. **Ein Treffer ist richtig; „keine Ausgabe" waere die falsche Erwartung**
und wuerde beim ersten Lauf als Defekt gelesen. (Genau der Fehlertyp, den W8 benennt und den §V
Schritt 4 an der eigenen Liste prueft: eine Zahl im Kopf, die dem Rumpf widerspricht.)

- [ ] **Schritt 5: Commit**

```bash
rtk git add docs/runbooks/radio-cutover.md
rtk git commit -m "docs(radio-cutover): §L — die zwei Lesebefehle, je Lauf mit eigenem Mount"
```

---

### Aufgabe 7: §V — die dreizehn Vorabfragen A1–A13, als Tabelle mit Ergebnisspalte

**Wartet auf:** nichts aus dem Bau. **E2** aus §L.1.

**Dateien:**
- Aendern: `docs/runbooks/radio-cutover.md` — neuer Abschnitt `## §V`
- Test: keiner. Die Pruefung ist Schritt 4 (Zaehlprobe gegen W11).

**Schnittstellen:**
- Verbraucht: §L.1 (Quellarm-Befehl), die Snapshot-Kopie `radio-admin-snapshot.sqlite`.
- Liefert: dreizehn nummerierte Runbook-Zeilen A1–A13 mit **Befehl · Erwartet · Ergebnis**, die
  ⛔/protokollpflichtig-Einteilung aus W11, und **sechs Sollwerte** aus A1, auf die §Z zurueckzeigt.

- [ ] **Schritt 1: Kopf und Einordnung schreiben**

````markdown
## §V — Die dreizehn Abfragen gegen die Alt-Datenbank, VOR dem Import

**Quellarm: der Befehl aus §L.1.** Alle dreizehn laufen gegen die **Snapshot-Kopie**, nie gegen einen
laufenden Stack.

**Diese Liste ist ein Superset.** Spec 1 §9.4.1 ist „vollstaendig und woertlich in das
Cutover-Runbook zu uebernehmen — nicht zusammenfassen, nicht verlinken", und „wo Spec 2 von dieser
Liste abweicht, ist es ein Fehler in Spec 2". **A1–A9 sind die acht Abfragen aus §9.4.1** in ihrer
Reihenfolge und mit ihrem SQL; **A10** ist der Spannen-Riegel aus §2.8.3 Nr. 6; **A11–A13** sind
Ergaenzungen und als solche markiert.

⛔ **Kein Befund wird im Cutover-Fenster zum ersten Mal gesehen.** Alle dreizehn laufen in der
**Generalprobe** gegen die Snapshot-Kopie **und** im echten Fenster ein zweites Mal. Der Unterschied
ist nicht die Abfrage, sondern der Preis: in der Generalprobe eine halbe Stunde, im Echtlauf ein
Abbruch um 23 Uhr — und weil es **kein Parallelfenster** gibt (Randbedingung 1), ist der Abbruch dort
teuer.

⚠️ **Eine Bereinigung der Klasse 🧹 wird im Echtlauf WIEDERHOLT, nicht vererbt.** Sie fand in einer
Kopie statt, die es im Fenster nicht mehr gibt.

**Acht sind blockierend, fuenf sind protokollpflichtig** (Spec W11 — die Einteilung steht dort einmal
und wird hier nicht neu hergeleitet):

| ⛔ blockierend | Protokollpflichtig, nicht blockierend |
|---|---|
| A2 · A3 · A4 · A5 · A6 · A7 · A10 · A11 | A1 (sie **setzt** die Sollwerte) · A8 · A9 · A12 · A13 |

Mit zwei Verschaerfungen: **A12 im Fall `AKTIV`** ist dem Betreiber vorzulegen, und **A13** wird ⛔,
wenn dieselbe Zeile zusaetzlich in A10 auffaellt.
````

- [ ] **Schritt 2: A1 bis A7 ausschreiben**

````markdown
### A1 — Zeilenzahlen je Tabelle · **setzt die Sollwerte**, nicht blockierend

```sql
select 'devices',           count(*) from devices
union all select 'software_versions', count(*) from software_versions
union all select 'api_tokens',        count(*) from api_tokens
union all select 'users',             count(*) from users
union all select 'device_events',     count(*) from device_events
union all select 'loans',             count(*) from loans;
```

**Kein Erwartungswert im Text** — es sind sechs Protokollzeilen. **Fuenf** davon sind
Paritaets-Sollwerte; `api_tokens` ist eine reine **Protokollzeile** fuer den Abbau: die Tabelle
existiert im Ziel **nicht** (Entscheidung 13, B16, W4). Die Textausgabe dazu ist Abfrage **T** in §5.2.2.

> devices ________ · software_versions ________ · api_tokens ________ · users ________ ·
> device_events ________ · loans ________ · abgelesen am ____________

⛔ Fehlt eine der sechs Tabellen („no such table"), ist der Snapshot **vorbaselinig** — genau der
Zustand der lokalen `radio-admin/data/data.sqlite` (Randbedingung 8, `.tables` zeigt dort nur
`__drizzle_migrations`, `device_events`, `devices`, `software_versions`; `loans`, `api_tokens` und
`users` **fehlen ganz**). Dann ist die falsche Datei kopiert worden: **Abbruch und neuer Auszug.**

⛔ Weicht eine Zahl von dem ab, was die Alt-Oberflaeche zeigt: **WAL nicht mitgenommen** — `.backup`
benutzen, nicht `cp` (§L.1).

### A2 — genau ein Update-Ziel ⛔ **blockierend**

```sql
select count(*) from software_versions where is_target = 1;
```

**MUSS genau `1` sein.** > Ergebnis: ________

Der Update-Stand ist **berechnet, nicht gespeichert** (`radio-admin@265abd5
server/src/db/schema.ts:53-56`), und es gibt keinen DB-Constraint dafuer: kein partieller Unique, kein
Trigger, kein CHECK. Die Invariante lebt allein in einer Anwendungstransaktion
(`server/src/repos/softwareVersionRepo.ts:77-89`), und der Leser `getTargetVersion` (`:63-71`) nimmt
`.limit(1).get()` **ohne `ORDER BY`**. Bei `0` oder `2` kippt der angezeigte Update-Status **jedes**
Geraets, und **keine Paritaet sieht es**.

**Befund ≠ 1:** 🧹 **bereinigen, protokolliert.** Der Betreiber benennt die Zielversion, dann
`update software_versions set is_target = 0;` und `= 1` fuer die eine — **in der Snapshot-Kopie**,
nie in der laufenden Alt-Datenbank. Das ausgefuehrte SQL geht woertlich ins Protokoll.
Mechanisch moeglich, weil der Zielzustand fachlich eindeutig **eine** Version ist.

> Bereinigt? ☐ nein ☐ ja, ausgefuehrtes SQL: ____________________ · Zielversion laut Betreiber: ________

### A3 — Waisen in `device_events` ⛔ **blockierend**

```sql
select count(*) from device_events e
  left join devices d on d.id = e.device_id
 where d.id is null;
```

**MUSS `0` sein.** > Ergebnis: ________

`foreign_keys = ON` gilt auf **beiden** Seiten (`radio-admin@265abd5 server/src/db/index.ts:28`,
`src/core/db/index.ts:19`), und `device_events.device_id → devices.id ON DELETE CASCADE` ist die
einzige `FOREIGN KEY`-Zeile aller fuenf Alt-Migrationen (`server/src/db/schema.ts:88-90`).

**Befund > 0:** 🧹 **bereinigen, protokolliert**, in der Kopie:
`delete from device_events where device_id not in (select id from devices);`, Anzahl ins Protokoll.
Ohne Bereinigung bricht der Import **hart** ab — laut, aber ein verbrannter Schritt im Fenster.

> Bereinigt? ☐ nein ☐ ja, ________ Zeilen geloescht

### A4 — zwei aktive Leihen auf einem Geraet ⛔ **blockierend**

```sql
select device_id, count(*) from loans
 where returned_at is null group by device_id having count(*) > 1;
```

**MUSS leer sein.** > Ergebnis: ________ Zeilen

Sonst laesst sich `loans_device_active_uidx` im Ziel nicht anlegen — der **partielle** Unique-Index
`ON loans (device_id) WHERE returned_at IS NULL`, den `drizzle-kit` nicht emittieren kann und der in
`radio-admin@265abd5 server/drizzle/0003_kind_spot.sql` handgeschrieben am Ende steht.

**Befund nicht leer:** ⛔ **abbrechen bzw. Betreiberentscheid — und deshalb in der GENERALPROBE
finden.** Welche der zwei Leihen die echte ist, ist eine **fachliche** Frage ueber ein Geraet im
Umlauf, kein mechanischer Fix. ⚠️ Wer den Index daraufhin „weglaesst", hat die Invariante **still**
abgeschafft — und der Bestand erfuellt sie ja, also merkt es niemand, bis der Kiosk ein Geraet
zweimal ausleiht.

### A5 — der `source`-Wertesatz ⛔ **blockierend**

```sql
select distinct source from device_events;
```

**Ergebnis MUSS eine Teilmenge von `{manual, csv-import, create, update-note}` sein.**
Aequivalent, in der Form aus Spec 1 §9.4.1 (**MUSS leer sein**):

```sql
select distinct source from device_events
 where source not in ('manual','csv-import','create','update-note');
```

> Gefundene Werte, woertlich: ____________________

Das Enum steht **nur im Quelltext** (`server/src/db/schema.ts:96`); in SQL ist die Spalte
`` `source` text NOT NULL `` und die DB akzeptiert **jeden** String. `toNeuesGeraeteEreignis` **wirft**
bei allem anderen. **Pruefen, nicht annehmen.**

**Befund unbekannter Wert:** ⛔ **abbrechen / eskalieren.** Den bekannten Wertesatz zu erweitern ist
eine **Aenderung an Spec 1** (§2.2.4 plus der erschoepfende Switch der Oberflaeche), keine
Fensterentscheidung. Mit „Wert schnell in den Mapper aufnehmen" bricht die Oberflaeche spaeter an
einem nicht erschoepften Switch.

### A6 — die Groessenordnung der Zeitstempel ⛔ **blockierend**

```sql
select min(created_at), max(created_at), length(cast(max(created_at) as text)) from devices;
```

**DREIZEHNSTELLIG = Millisekunden.** > min ________ · max ________ · Stellen ________

**Befund zehnstellig:** ⛔ **Cutover ABSAGEN, nicht anpassen.** Dann ist die gesamte Import-Annahme
falsch.

### A7 — Trigger und Views in der Prod-Datenbank ⛔ **blockierend**

```sql
select type, name, sql from sqlite_master where type in ('trigger','view');
```

**MUSS leer sein.** > Ergebnis: ________ Zeilen

Der Grep-Beleg „null Trigger, null CHECKs" gilt fuer den **Quelltext**, nicht fuer die laufende
Datenbank (`docs/radio-portierung-analyse.md:2038-2040`). **Ein Treffer ist Fachlogik, die kein Repo
kennt** — sie muss gelesen und bewertet werden, bevor irgendetwas importiert wird. Wandert ihre
Wirkung nicht mit, vermisst sie niemand: das Ziel ist konsistent, nur anders.
````

- [ ] **Schritt 3: A8 bis A13 ausschreiben**

````markdown
### A8 — die Retention-**Vorhersage** · protokollpflichtig

```sql
select count(*) from loans
 where returned_at is not null
   and returned_at < (strftime('%s','now','-2 months') * 1000);
```

> Ergebnis: ________ Zeilen · gezaehlt am ____________ · **Beschriftung im Protokoll: VORHERSAGE**

⚠️ **Der Faktor 1000 steht hier absichtlich im SQL:** die Alt-Spalte ist Millisekunden,
`strftime('%s')` liefert Sekunden. Wer ihn weglaesst, zaehlt **alle** zurueckgegebenen Leihen und
haelt das fuer eine bestaetigte Schaetzung.

Diese Zahl ersetzt die Betreiber-**Schaetzung** „< 100" (`docs/radio-portierung-analyse.md:1774`)
durch eine **Zaehlung**. Sie wird im echten Fenster **erneut** gezaehlt, weil ihr Cutoff mit `now`
wandert.

⛔ **Sie ist NICHT Abfrage R.** A8 ist eine Vorhersage („wie viele Zeilen nimmt der erste Purge?"),
R ist ein Vergleich Quelle↔Ziel mit `<freeze_iso>` in **beiden** Armen. Wer sie verwechselt,
vergleicht zwei `now`-Auswertungen, die Minuten auseinanderliegen — und eine Leihe genau auf der
Zwei-Monats-Grenze wechselt in diesen Minuten die Seite. Die Erwartung „dieselbe Zahl wie vorhin" ist
dann **rot ohne Fehler**, und der vorgeschriebene Handgriff daneben lautet „Import verwerfen,
`radio.db` loeschen, Mapper korrigieren".

**Befund deutlich ueber der Schaetzung:** ✅ **mitnehmen — es ist keine Abweichung, sondern die
Zaehlung.** Wer sie als „zu hoch" behandelt und die Retention abschaltet, schaltet die
DSGVO-Begruendung fuer `borrower_name` ab.

### A9 — `dev-user` in den Auditspalten · protokollpflichtig, **beantwortet U7**

```sql
select sub from users;
select distinct created_by from devices;
```

> `sub`-Werte: ____________________ · `created_by`-Werte: ____________________

Ein `dev-user` unter den Auditspalten heisst: `AUTH_DEV_BYPASS` war irgendwann aktiv, und die
Zuordnung von Journalzeilen zu Personen ist an diesen Stellen keine.

**Befund `dev-user`:** ✅ **mitnehmen und im Ziel tolerieren.** Eine Zuschreibungsluecke ist kein
Datenfehler; ein „bereinigter" Audit-Eintrag waere eine **Faelschung**. Nicht protokolliert wirkt es
spaeter wie ein Importfehler.

⛔ **Nach dem geloeschten Volume ist diese Frage nicht mehr stellbar.** Sie wird in §5.2.2 wiederholt.

### A10 — der Spannen-Riegel ueber alle **zehn** Zeitstempelspalten ⛔ **blockierend**

`msZuDatum` **wirft** bei jedem Wert ausserhalb `[1e12, 4e12]`. Also muss der Riegel **vor** dem
Fenster feuern, nicht darin — und A6 sieht nur die Spanne **einer** Spalte.

**Beschriftung im Runbook: „zehn Spalten in epoch-Millisekunden (neun Zeitstempel +
`devices.last_updated_at`)"**, nicht „elf" (W8 — dieselbe Abfrage fuehrt seit jeher zehn Summanden,
nur die Prosa daneben zaehlte falsch).

```sql
SELECT
  (SELECT COUNT(*) FROM devices  WHERE created_at      NOT BETWEEN 1000000000000 AND 4000000000000)
+ (SELECT COUNT(*) FROM devices  WHERE updated_at      NOT BETWEEN 1000000000000 AND 4000000000000)
+ (SELECT COUNT(*) FROM devices  WHERE last_updated_at IS NOT NULL
                                   AND last_updated_at NOT BETWEEN 1000000000000 AND 4000000000000)
+ (SELECT COUNT(*) FROM device_events     WHERE changed_at   NOT BETWEEN 1000000000000 AND 4000000000000)
+ (SELECT COUNT(*) FROM software_versions WHERE created_at   NOT BETWEEN 1000000000000 AND 4000000000000)
+ (SELECT COUNT(*) FROM users             WHERE last_seen_at NOT BETWEEN 1000000000000 AND 4000000000000)
+ (SELECT COUNT(*) FROM loans   WHERE borrowed_at NOT BETWEEN 1000000000000 AND 4000000000000)
+ (SELECT COUNT(*) FROM loans   WHERE created_at  NOT BETWEEN 1000000000000 AND 4000000000000)
+ (SELECT COUNT(*) FROM loans   WHERE updated_at  NOT BETWEEN 1000000000000 AND 4000000000000)
+ (SELECT COUNT(*) FROM loans   WHERE returned_at IS NOT NULL
                                 AND returned_at  NOT BETWEEN 1000000000000 AND 4000000000000)
  AS unplausible_zeitstempel;
```

**MUSS `0` ergeben.** > Ergebnis: ________

**Befund ≠ 0:** ⛔ **abbrechen**, dann **denselben Ausdruck spaltenweise** nachfahren — sonst weiss
man nur „irgendwo eine". Erst danach der Entscheid: Einzelzeile in der Kopie bereinigen
(protokolliert) oder absagen.

> Spaltenweise nachgefahren? ☐ ja · betroffene Spalte(n): ____________________ · betroffene `id`(s): ____________________

### A11 — `typeof()` je Zeitstempelspalte ⛛ **Ergaenzung**, ⛔ **blockierend**

SQLite erzwingt Spaltentypen nicht — die Deklaration `integer` ist eine **Affinitaet**, kein
Constraint. **A11 und A10 pruefen disjunkte Fehlerklassen:** A10 die **Groessenordnung**, A11 die
**Speicherklasse**.

| Speicherklasse | sieht A10? | warum |
|---|---|---|
| `'real'` (z. B. `1.771e12`) | ⛔ **nein** | Der Wert liegt **in** der Spanne, A10 ist gruen. `Number.isInteger` ist `false`, `msZuDatum` wirft. **Dafuer ist A11 gebaut** |
| `'null'` in einer NOT-NULL-Spalte | ⛔ **nein** | `NULL NOT BETWEEN …` ergibt `NULL`, nicht `1` — die Zeile wird von A10 **nicht** gezaehlt |
| `'text'`, nicht numerisch | ja | Speicherklassenordnung: TEXT > INTEGER. A10 meldet aber nur „irgendwo eine"; A11 nennt Spalte **und** Klasse |
| `'text'`, numerisch (`'1771000000000'`) | entfaellt | Integer-Affinitaet wandelt beim Schreiben in `'integer'` um |

```sql
select 'devices.created_at',            typeof(created_at),      count(*) from devices            group by 2
union all select 'devices.updated_at',           typeof(updated_at),      count(*) from devices            group by 2
union all select 'devices.last_updated_at',      typeof(last_updated_at), count(*) from devices            group by 2
union all select 'device_events.changed_at',     typeof(changed_at),      count(*) from device_events      group by 2
union all select 'software_versions.created_at', typeof(created_at),      count(*) from software_versions  group by 2
union all select 'users.last_seen_at',           typeof(last_seen_at),    count(*) from users              group by 2
union all select 'loans.borrowed_at',            typeof(borrowed_at),     count(*) from loans              group by 2
union all select 'loans.returned_at',            typeof(returned_at),     count(*) from loans              group by 2
union all select 'loans.created_at',             typeof(created_at),      count(*) from loans              group by 2
union all select 'loans.updated_at',             typeof(updated_at),      count(*) from loans              group by 2
order by 1, 2;
```

**Erwartetes Ergebnis, ausgeschrieben — sonst wird diese Abfrage jedes Mal „findet etwas" und jedes
Mal durchgewunken:**

* **Zehn Beschriftungsgruppen in der Ausgabe.** ⚠️ Jedes Glied hat ein `group by 2` — eine **leere
  Tabelle liefert gar keine Zeile**, nicht `count = 0`. **Weniger als zehn Beschriftungen ist selbst
  ein Befund** und **vor** dem Lesen der Klassen gegen A1 abzugleichen.
* `'integer'` fuer alle zehn Spalten.
* **`'null'` ist zusaetzlich erwartet und richtig** fuer die **zwei** nullable Spalten
  `devices.last_updated_at` und `loans.returned_at`. ⚠️ `'null'` bei einer der **acht**
  NOT-NULL-Spalten ist dagegen ein Befund: ⛔ **abbrechen / eskalieren** — ein toleranter Mapper macht
  daraus 1970, und der Purge loescht die Zeile.
* **`'text'` oder `'real'` ist immer ein Befund**: ⛔ **abbrechen**, Einzelzeile nach Sichtpruefung in
  der Kopie bereinigen (`cast`), protokolliert. `'real'` ist der leise Fall: **A10 ist dafuer gruen.**

> Beschriftungsgruppen gezaehlt: ________ (Erwartung 10) · Abweichende Klassen: ____________________

### A12 — Leihen ohne Geraet ⛛ **Ergaenzung**, protokollpflichtig

```sql
select case when l.returned_at is null then 'AKTIV' else 'abgeschlossen' end as art,
       count(*)
  from loans l left join devices d on d.id = l.device_id
 where d.id is null
 group by 1;
```

> abgeschlossen: ________ · AKTIV: ________

`loans.device_id` traegt **absichtlich keinen** Fremdschluessel, und der Quelltext begruendet es
woertlich (`server/src/db/schema.ts:106-110`): zurueckgegebene Leihen sind Historie und muessen eine
spaetere Geraeteloeschung ueberleben; die historische Richtigkeit traegt der unveraenderliche
`snapshot_*`-Dreisatz, nicht ein lebender Join. Im Ziel bleibt es so. **Eine Waise ist hier legal —
auf beiden Seiten.**

Die Gabel:

* **`abgeschlossen` > 0** → ✅ **mitnehmen und im Ziel tolerieren.** Protokollzeile, keine
  Bereinigung. ⚠️ Und ausdruecklich: **keinen FK „der Ordnung wegen" nachziehen** — mit `CASCADE`
  loescht die erste Ausmusterung die Historie, mit `RESTRICT` blockiert jede alte Rueckgabe das
  Ausmustern, und beides ist gueltiges Drizzle, gueltiges SQL und **paritaetsgruen**.
* **`AKTIV` > 0** → ⚠️ **mitnehmen, als benannter Restposten protokollieren, und dem Betreiber
  VORLEGEN.** Eine aktive Leihe auf einem nicht existierenden Geraet ist im Betrieb **nicht
  zurueckgebbar**: die Rueckgabe geht ueber den Geraetebestand.

> Dem Betreiber vorgelegt am ____________ · Entscheid: ____________________

### A13 — `returned_at` vor `borrowed_at` ⛛ **Ergaenzung**, protokollpflichtig

```sql
select count(*) from loans
 where returned_at is not null and returned_at < borrowed_at;
```

> Ergebnis: ________

Diese Abfrage findet, was A10 und A11 **nicht** finden koennen: eine **zeilenweise Vertauschung** der
zwei Zeitstempel ist groessenordnungsrichtig, speicherklassenrichtig und damit unter A10 wie A11 gruen.
Serverseitig ist die Reihenfolge nirgends geschuetzt — `radio-admin@265abd5 shared/src/schemas.ts:29`,
`:61`, `:87` typisieren `z.number().int().nullable()` ohne `min`/`max`, kein CHECK, kein Trigger.

Die Gabel:

* **Zahl > 0, und keine dieser Zeilen faellt in A10 auf** → ✅ **mitnehmen und tolerieren**, Zahl ins
  Protokoll. Das Zielschema verlangt die Ordnung ebenso wenig, eine „Korrektur" waere eine erfundene
  Fachentscheidung ueber fremde Daten, und die betroffene Leihe ist abgeschlossen.
* **Dieselbe Zeile faellt zusaetzlich in A10 auf** → ⛔. Dann ist es kein Datenfehler von 2024, sondern
  ein Hinweis darauf, dass **der Snapshot beschaedigt** ist. Neuer Auszug, dann A1 und A10 erneut.

> `id`s der Treffer: ____________________ · davon in A10 aufgefallen: ____________________
````

- [ ] **Schritt 4: Die Zaehlprobe gegen W11 — der Fehlertyp, den W8 beim Namen nennt**

```bash
rtk grep -c '^### A' docs/runbooks/radio-cutover.md
rtk grep -n '⛔ \*\*blockierend\*\*' docs/runbooks/radio-cutover.md | wc -l
```

Erwartung: **13** Ueberschriften und **8** blockierende Marken. Stimmt eine Zahl nicht mit dem Kopf
von §V ueberein, wird **der Kopf** korrigiert und nicht die Liste — „eine Pruefliste, deren Kopf eine
andere Zahl nennt als ihr Rumpf, wird unter Zeitdruck gekuerzt" (W8).

Zusaetzlich: die Zahl **zehn** in A10 und A11 gegen die Summanden zaehlen.

```bash
rtk grep -c 'NOT BETWEEN 1000000000000' docs/runbooks/radio-cutover.md
```

Erwartung: **10**.

- [ ] **Schritt 5: Commit**

```bash
rtk git add docs/runbooks/radio-cutover.md
rtk git commit -m "docs(radio-cutover): §V — A1 bis A13 mit Erwartung, Ergebniszeile und Entscheidungsregel"
```

---

### Aufgabe 8: §S.1 — die Zeilenauswahl und die drei symmetrischen Abfragen

**Warum eine eigene Aufgabe:** die Auswahl entscheidet, ob die Stichprobe etwas beweist. Eine Zeile,
deren Felder alle `NULL` sind, ist unter **jedem** Zuordnungsfehler gruen; eine Zeile, in der zwei
verwechselbare Spalten denselben Wert tragen, besteht **jede** Vertauschung.

**Wartet auf:** nichts aus dem Bau.

**Dateien:**
- Aendern: `docs/runbooks/radio-cutover.md` — neuer Abschnitt `## §S`, Unterabschnitt `### §S.1`
- Test: keiner. Die Pruefung ist Schritt 3.

**Schnittstellen:**
- Verbraucht: §L.1 und §L.2.
- Liefert: die vier Auswahlregeln, die fuenf Paar-Auswahl-SQLs, **drei** symmetrische
  Zielarm-Abfragen (statt zwei) und die Nullprobe auf `loans.zugangscode_id`.

- [ ] **Schritt 1: Regeln 1 bis 4 schreiben**

````markdown
## §S — Die Feldstichproben

**Quellarm: der Befehl aus §L.1. Zielarm: der Befehl aus §L.2, mit der Lesart aus §L.3.**
Wer hier einen eigenen Befehl baut, baut den, den niemand gegengelesen hat.

**Warum es diesen Abschnitt gibt.** Die Paritaet vergleicht **Multimengen von Zeilen-Hashes**
(`scripts/import/parity.ts:43-56`, die `ok`-Bedingung samt `source.length === target.length` in
`:50`). Beide Arme laufen durch **dieselbe** Sicht und damit durch **denselben** Mapper — die rohe
Alt-Ganzzahl betritt den Vergleich nie. Was die Paritaet deshalb **strukturell nicht sehen kann**:

| Fehlerklasse | sieht die Paritaet? |
|---|---|
| Zeile fehlt / zu viel | **ja** (`parity.ts:50`) |
| Wert auf dem Schreibweg veraendert | **ja** |
| **Faktor 1000** (ms als Sekunden gelesen) | ⛔ **nein** — ein Fehler in `msZuDatum` wirkt auf beiden Armen |
| **Zwei Spalten vertauscht** (`issi`↔`tei`) | ⛔ **nein** — der Mapper vertauscht sie beidseitig |
| Spalte gar nicht in der Sicht | ⛔ **nein** — sie geht in keinen Hash ein |
| Fachliche Invariante verletzt (`is_target` zweimal) | ⛔ **nein** — 1:1 uebernommen ist 1:1 gruen |

⚠️ **Ein roter Paritaetscheck heisst NICHT „es ist nichts passiert."** `scripts/import/portal.ts:105-107`
sagt es woertlich: die Paritaet laeuft **nach** dem Schreibvorgang. Der Rueckweg nach einem roten Check
ist die **geloeschte, leere Ziel-DB** und ein neuer Lauf, nicht ein zweiter Versuch auf denselben
Bestand. Der Schritt heisst **„`radio.db` loeschen, dann importieren"**, nicht „importieren".

### §S.1 — Welche Zeile man waehlt, und warum nicht die naechste

**Regel 1 — die Zeile mit den meisten gesetzten Feldern.**

```sql
select id,
       (case when tei             is not null then 1 else 0 end)
     + (case when serial_number   is not null then 1 else 0 end)
     + (case when hiorg_id        is not null then 1 else 0 end)
     + (case when opta            is not null then 1 else 0 end)
     + (case when funktion        is not null then 1 else 0 end)
     + (case when bedieneinheit   is not null then 1 else 0 end)
     + (case when hersteller      is not null then 1 else 0 end)
     + (case when device_modes    is not null then 1 else 0 end)
     + (case when update_note     is not null then 1 else 0 end)
     + (case when notes           is not null then 1 else 0 end)
     + (case when last_updated_at is not null then 1 else 0 end) as gesetzt
  from devices
 order by gesetzt desc, created_at asc
 limit 3;
```

> gewaehlte `id`: ____________________ · `gesetzt` = ________

**Regel 2 — dazu die aelteste Zeile.**

```sql
select id, created_at from devices order by created_at asc limit 1;
```

Sie ist **nicht** redundant zu Regel 1: `tei` kam erst mit Migration `0004`, `update_note` mit
`0001`. Die aelteste Zeile ist die einzige, die den **Backfill- und NULL-Weg** durchlaeuft, den
juengere Zeilen immer gefuellt haben.

> gewaehlte `id`: ____________________

**Regel 3 — je verwechselbarem Paar eine Zeile, in der die Glieder VERSCHIEDEN sind.** Es sind
**fuenf** Paare bzw. Tripel, nicht vier (W8):

| # | Paar / Tripel | Auswahl-SQL | gewaehlte `id` |
|---|---|---|---|
| 1 | `issi` ↔ `tei` | `select id, issi, tei from devices where tei is not null and tei <> issi limit 1;` | ________ |
| 2 | `created_at` ↔ `updated_at` ↔ `last_updated_at` | `select id, created_at, updated_at, last_updated_at from devices where updated_at <> created_at and last_updated_at is not null limit 1;` | ________ |
| 3 | `snapshot_call_sign` ↔ `borrower_name` | `select id, snapshot_call_sign, borrower_name from loans where borrower_name <> snapshot_call_sign limit 1;` | ________ |
| 4 | `alamos_integrated` ↔ `loanable` | `select id, alamos_integrated, loanable from devices where alamos_integrated <> loanable limit 1;` | ________ |
| 5 | `serial_number` ↔ `hiorg_id` ↔ `opta` | `select id, serial_number, hiorg_id, opta from devices where serial_number is not null and hiorg_id is not null and opta is not null and serial_number <> hiorg_id and hiorg_id <> opta limit 1;` | ________ |

⚠️ **Liefert eine dieser Abfragen keine Zeile, ist das ein Protokolleintrag, kein Freibrief.** „Kein
Geraet hat `alamos_integrated <> loanable`" heisst: die Vertauschung dieser zwei 0/1-Ganzzahlen ist an
den Produktionsdaten **nicht pruefbar**, und das Tor bleibt allein der Unit-Test. Das muss dastehen,
sonst haelt jemand spaeter eine ungepruefte Zusage fuer geprueft.

> Ohne Treffer geblieben: Paar Nr. ________ · notiert am ____________

**Regel 4 — je Tabelle mindestens eine Zeile, und diese hier zwingend:**

| Tabelle | Pflicht-Stichprobe | Grund |
|---|---|---|
| `devices` | Regel-1-Zeile + aelteste Zeile + die fuenf Paar-Zeilen | 25 Spalten, alle Verwechslungspaare liegen hier |
| `software_versions` | **die Zeile mit `is_target = 1`**, zwingend | Der Update-Stand ist berechnet, nicht gespeichert (`server/src/db/schema.ts:53-56`). Kippt diese eine Zeile, kippt der Status **jedes** Geraets |
| `users` | die Zeile mit dem groessten `last_seen_at` **und** eine mit dem kleinsten | 3 Spalten; `sub` ist PK und steht in sechs Auditspalten — ein veraendertes `sub` entkoppelt das Journal von Personen |
| `device_events` | **eine Zeile je vorkommendem `source`-Wert** (`select source, min(id) from device_events group by source;`) | `source` ist ein TS-Enum **ohne** DB-CHECK (`schema.ts:96`) |
| `loans` | eine **abgeschlossene** (`returned_at is not null`) **und** eine **aktive** (`returned_at is null`) | Die zwei Faelle verhalten sich unter dem Faktor-1000-Fehler **gegensaetzlich** (§S.3) |
````

- [ ] **Schritt 2: Die drei symmetrischen Zielarm-Abfragen schreiben — es sind DREI, nicht zwei**

````markdown
### §S.2 — Der Zielarm braucht keine uebersetzte Spaltenliste

**Die SQL-Spaltennamen sind auf beiden Armen zeichengleich.** Spec 1 §2.5.1–§2.5.5 deklariert sie mit
denselben snake_case-Zeichenketten wie die Quelle (`text("snapshot_call_sign")`,
`integer("borrowed_at", { mode: "timestamp" })`). **Dieselbe Abfrage laeuft auf beiden Armen.**

⚠️ **Warum das ausdruecklich dastehen muss:** eine Spaltenliste von Hand nach camelCase zu uebersetzen
ist selbst eine Vertauschungsgelegenheit — in genau der Pruefung, die Vertauschungen fangen soll. Wer
auf dem Zielarm `snapshotCallSign` schreibt, bekommt „no such column" (laut, harmlos); wer zwei Namen
dabei vertauscht, bekommt eine **gruene Stichprobe** (still, teuer).

```sql
-- (1) identisch auf BEIDEN Armen — Paare 1, 4 und 5:
select id, issi, tei, serial_number, hiorg_id, opta, alamos_integrated, loanable
  from devices where id = '<id>';

-- (2) identisch auf BEIDEN Armen — Paar 3:
select id, device_id, snapshot_call_sign, snapshot_serial_number, snapshot_device_type,
       borrower_name, borrowed_at, returned_at, return_note, created_at, updated_at
  from loans where id = '<id>';

-- (3) DIESELBE SPALTENLISTE auf beiden Armen, aber ASYMMETRISCH IN DEN EINHEITEN — Paar 2:
select id, created_at, updated_at, last_updated_at
  from devices where id = '<id>';
```

⚠️ **Abfrage (3) ist die Ausnahme, und sie ist benannt.** Die zwei zuvor genannten symmetrischen
Abfragen enthalten die Glieder des zweiten Tripels **nicht** — Abfrage (1) fuehrt keine Zeitspalte,
Abfrage (2) keine `devices`-Spalte. Ohne (3) haette das Tripel
`created_at ↔ updated_at ↔ last_updated_at` **keinen** Zielarm-Handgriff, obwohl Regel 3 fuer jedes
Paar eine Produktionsbestaetigung verlangt. Die Asymmetrie:

| Spalte | Quelle | Ziel | Protokollform |
|---|---|---|---|
| `created_at` | epoch-**ms** | Unix-**Sekunden** | `rechnung = quelle_ms / 1000 == ziel_s` |
| `updated_at` | epoch-**ms** | Unix-**Sekunden** | `rechnung = quelle_ms / 1000 == ziel_s` |
| `last_updated_at` | epoch-**ms** | **TEXT** `YYYY-MM-DD` | Sollwertregel aus §S.4 — **keine** Rechnung |

**Genau zwei Spalten weichen von der Symmetrie ab, und beide sind benannt:**

* `devices.last_updated_at` — Typ geaendert (`integer` ms → TEXT `YYYY-MM-DD`), §S.4.
* `loans.zugangscode_id` — im Ziel **neu** (B6) und in der Quelle nicht vorhanden. Eigene
  Protokollzeile, **nur auf dem Zielarm**:

```sql
select count(*) from loans where zugangscode_id is not null;
```

**MUSS `0` sein.** > Ergebnis: ________

⛔ Ein Wert ≠ NULL hiesse, dass zwischen Import und Pruefung schon **ueber die Suite** ausgeliehen
wurde — im Fenster ein **Alarm**, kein Datenbefund.
````

- [ ] **Schritt 3: Gegenlesen — die Zahl fuenf und die Zahl drei**

```bash
# (a) Die DREI symmetrischen Abfragen in §S.2 — der Fund, wegen dessen dieser Schritt existiert.
rtk grep -cE 'identisch auf BEIDEN Armen|DIESELBE SPALTENLISTE auf beiden Armen' \
  docs/runbooks/radio-cutover.md

# (b) Die FUENF Paare in §S.1 Regel 3 — die erste Spalte der Tabelle ist 1 bis 5 durchnummeriert.
rtk grep -cE '^\| [1-5] \| `' docs/runbooks/radio-cutover.md
```

Erwartung: **(a) 3** und **(b) 5**. Stehen in §S.2 nur zwei Abfragen, fehlt der Zielarm-Handgriff
fuer **Paar 2** (`created_at ↔ updated_at ↔ last_updated_at`) — Abfrage (1) fuehrt keine Zeitspalte,
Abfrage (2) keine `devices`-Spalte, und dann hat das Tripel im ganzen Runbook keine
Produktionsbestaetigung.

⚠️ Schlaegt (b) mit `0` fehl, liegt es an der Tabellenform und nicht an der Zahl: die fuenf Zeilen
werden dann von Hand gezaehlt und die Zahl danebengeschrieben. **Ein Zaehlbefehl, der nichts findet,
ist kein Beleg fuer „fuenf".**

- [ ] **Schritt 4: Commit**

```bash
rtk git add docs/runbooks/radio-cutover.md
rtk git commit -m "docs(radio-cutover): §S.1/§S.2 — Zeilenauswahl und DREI symmetrische Zielarm-Abfragen"
```

---

### Aufgabe 9: §S.3 — die Zeitstempel-Stichprobe, mit berichtigter Lesart

**Warum eine eigene Aufgabe:** der Faktor-1000-Fehler ist die einzige Fehlerklasse dieses Ports, die
**paritaetsgruen ist UND Daten loescht**. Diese Stichprobe ist das Tor.

**Wartet auf:** nichts aus dem Bau.

**Dateien:**
- Aendern: `docs/runbooks/radio-cutover.md` — Unterabschnitt `### §S.3`
- Test: keiner. Die Pruefung ist Schritt 3 (gemessene Gegenprobe mit `sqlite3`).

**Schnittstellen:**
- Verbraucht: §L.1, §L.2, die Alt-Oberflaeche unter `radio.iuk-ue.de` (bis zum Umschwenk).
- Liefert: die zwei Werte (juengste und aelteste abgeschlossene Leihe), die **vier** Angaben der
  Retention-Kontrollgruppe, und die berichtigte Erwartung fuer `gelesen_als_s`.

⚠️ **Diese Aufgabe berichtigt eine Erwartung aus Spec §2.3.1/§2.3.2.** Die Spec schreibt dort:
„`gelesen_als_s` muss **1970** zeigen". **Das kann sie nicht.** Der Quellwert ist epoch-Millisekunden
(dreizehnstellig, ~1.74e12); als Sekunden gelesen liegt er im Jahr ~57000, ausserhalb des
SQLite-Kalenderbereichs, und `datetime(...)` gibt deshalb **NULL** zurueck — also eine **leere Zelle**.
Gemessen mit sqlite3 3.54:

| Ausdruck | Ergebnis |
|---|---|
| `datetime(1741100000000/1000,'unixepoch')` | `2025-03-04 14:53:20` |
| `datetime(1741100000000,'unixepoch')` | **NULL** (leere Zelle) |
| `datetime(1741100,'unixepoch')` | `1970-01-21 03:38:20` |

Die 1970-Lesart entsteht erst bei einem **Sekunden**wert — und das ist der **Ziel**wert nach einem
Faktor-1000-Fehler, nicht der Quellwert. Die Spec weiss das an anderer Stelle selbst: §5.2.2
Abfrage Z begruendet ihre obere Grenze `> 4000000000` ausdruecklich mit „rohe Millisekunden, die
ungeteilt in einer Sekundenspalte landen (Jahr 57000)". **Die 1970-Erwartung gehoert an den
ZIELARM, und dort steht sie schon** (Abfrage Z, untere Grenze `< 946684800`).

- [ ] **Schritt 1: Wert 1 und Wert 2 schreiben, mit der berichtigten Erwartung**

````markdown
### §S.3 — Die Zeitstempel-Stichprobe

⚠️ **Der Fehlgriff, der diese Stichprobe wertlos macht:** die Zeile, die ein Mensch in der
Alt-Oberflaeche zuerst sieht, ist eine **AKTIVE** Leihe — und deren `returned_at` ist `NULL`. `NULL`
ist auf beiden Armen `NULL`, unter jeder Lesart, bei jedem Faktor. Eine Stichprobe auf einer aktiven
Leihe ist **vakuoes** und prueft ausgerechnet das Feld nicht, das der Fehler zerstoert. Dass aktive
Leihen den Purge ueberleben, verstaerkt den Irrtum: nach dem Loeschlauf sieht der Kiosk „richtig" aus,
weil das, was er anzeigt, das Ueberlebende ist.

⛔ **Verbindlich: die Zeitstempel-Stichprobe kommt aus `returned_at IS NOT NULL`.** Die aktive Leihe
wird zusaetzlich gezogen (§S.1 Regel 4), aber fuer `borrowed_at` und `created_at`.

#### Wert 1 — der diskriminierende: die JUENGSTE abgeschlossene Leihe

```sql
-- QUELLE (Snapshot-Kopie)
select id, borrowed_at, returned_at,
       datetime(returned_at/1000, 'unixepoch') as gelesen_als_ms,
       datetime(returned_at,      'unixepoch') as gelesen_als_s
  from loans
 where returned_at is not null
 order by returned_at desc
 limit 1;
```

**Beide Lesarten stehen absichtlich nebeneinander in derselben Ausgabe.** Die Erwartung, ausgeschrieben:

| Spalte | Erwartung | Was eine Abweichung heisst |
|---|---|---|
| `gelesen_als_ms` | ein Datum **aus der Betriebszeit von `radio-admin`** | Liegt es weit davor oder danach, ist die Quelle beschaedigt — Abgleich mit A6 |
| `gelesen_als_s` | ⚠️ **LEER / NULL** — der rohe Millisekundenwert liegt ausserhalb des SQLite-Kalenderbereichs (Jahr ~57000). **Eine leere Zelle ist hier das ERWARTETE Ergebnis, nicht ein kaputte Abfrage** | ⛔ Ein **nicht** leeres `gelesen_als_s` heisst: der Quellwert ist **kein** Millisekundenwert. Dann ist die Grundannahme des ganzen Imports falsch, und der Cutover wird **abgesagt, nicht angepasst** (dieselbe Konsequenz wie bei A6) |

⛔ **Die alte Formulierung „`gelesen_als_s` muss 1970 zeigen" ist gestrichen.** Sie beschreibt den
**Zielwert** nach einem Faktor-1000-Fehler, und dafuer gibt es Abfrage Z in §5.2.2 (untere Grenze
`< 946684800`). Wer die 1970-Erwartung hier stehen laesst, bekommt eine leere Zelle vorgesetzt, liest
sie um 23 Uhr als „Abfrage kaputt" und streicht die Spalte — dann ist die Stichprobe auf **eine**
Lesart reduziert.

```sql
-- ZIEL: derselbe Datensatz, roh.
select id, borrowed_at, returned_at,
       datetime(returned_at, 'unixepoch') as gelesen_als_s
  from loans where id = '<id aus dem Quellarm>';
```

Auf dem **Zielarm** gilt die umgekehrte Erwartung: `gelesen_als_s` **ist gefuellt** und zeigt dasselbe
Datum wie `gelesen_als_ms` im Quellarm.

```
loans/returned_at  id=<id>
  quelle_ms  = ________            gelesen_als_ms = ________ (Betriebszeit)
                                   gelesen_als_s  = ________ (ERWARTET: leer)
  ziel_s     = ________            gelesen_als_s  = ________ (ERWARTET: dasselbe Datum)
  rechnung   = quelle_ms / 1000 == ziel_s   →  ☐ ok  ☐ ABWEICHUNG
  Jahr im Ziel = ________          ⛔ 1970 heisst: Faktor-1000-Fehler, ABBRUCH
```

**Warum die juengste und nicht irgendeine:** sie ist die eine Zeile, die der Retention-Purge
**garantiert nicht** anfassen darf. Faellt sie nach dem ersten Purge-Lauf weg, ist bewiesen, dass
nicht die Retention geloescht hat, sondern der Faktor.

#### Wert 2 — der, bei dem die ms-Lesart plausibel aussieht und trotzdem falsch sein kann

```sql
-- QUELLE: die AELTESTE abgeschlossene Leihe.
select id, returned_at,
       datetime(returned_at/1000, 'unixepoch') as gelesen_als_ms,
       datetime(returned_at,      'unixepoch') as gelesen_als_s
  from loans where returned_at is not null
 order by returned_at asc limit 1;
```

Ein einziger Wert genuegt nicht, denn nicht jeder Fehler landet in 1970. `msZuDatum` laesst **jeden**
Wert in `[1e12, 4e12]` durch (`MS_MIN` = 2001-09-09, `MS_MAX` = 2096-10-02). Der Riegel ist absichtlich
weit — und deshalb blind gegen Werte, die **innerhalb** der Spanne falsch sind: ein Wert knapp ueber
`MS_MIN` ergibt als ms gelesen ~2001, passiert A10, ist **nicht** 1970 und ist fuer `radio-admin`
fachlich **unmoeglich**. Dieselbe Doppeldeutigkeit traegt `users.last_seen_at`.

⚠️ `gelesen_als_s` ist auch hier **leer**, aus demselben Grund wie bei Wert 1. Sie steht dabei, weil
ein **gefuelltes** `gelesen_als_s` derselbe Alarm ist.

**Der Vergleich, der Wert 2 pruefbar macht, ist nicht die Lesart, sondern die Alt-Anwendung.** Fuer
diesen einen Datensatz wird die Leihe in der Alt-Oberflaeche unter `radio.iuk-ue.de` aufgeschlagen und
das dort angezeigte Rueckgabedatum ins Protokoll geschrieben — das ist der einzige Arm dieses Cutovers,
der ueberhaupt eine Oberflaeche hat.

> Wert 2 · `id`: ____________________ · Alt-Oberflaeche zeigt: ____________________ ·
> `gelesen_als_ms`: ____________________ · gleich? ☐ ja ☐ nein

**Wert 1 beweist die Groessenordnung ohne Fremdquelle, Wert 2 beweist den Wert gegen die Fremdquelle.**
Wer nur einen von beiden nimmt, hat eine der zwei Fehlerformen ungeprueft.
````

- [ ] **Schritt 2: Die vier Angaben der Retention-Kontrollgruppe schreiben**

````markdown
#### Die Kontrollgruppe fuer den Retention-Purge — vier Angaben, VOR dem Umschwenk

Der erste Purge-Lauf liegt **1440 Minuten** nach dem Boot (`RADIO_HISTORIE_ERSTLAUF_MINUTEN`, B5 —
bewusst so lang, dass Verifikation, Stichprobe und „Router zurueck" noch ins Fenster passen). Danach
hat `loans` weniger Zeilen. Um „planmaessig geloescht" von „Faktor-1000-Fehler" **nach** dem
Umschwenk noch unterscheiden zu koennen, muessen diese vier Angaben vorher im Protokoll stehen:

| # | Angabe | Befehl | Ergebnis |
|---|---|---|---|
| 1 | abgeschlossene Leihen gesamt | `select count(*) from loans where returned_at is not null;` | ________ |
| 2 | die Retention-Zahl **A8**, beschriftet als **VORHERSAGE** | §V, A8 | ________ |
| 3 | `id` **und rohes** `returned_at` der **juengsten** abgeschlossenen Leihe | §S.3, Wert 1 | ________ |
| 4 | `id` und rohes `returned_at` der **aeltesten** abgeschlossenen Leihe | §S.3, Wert 2 | ________ |

**Mit diesen vier Angaben ist die Nachkontrolle eine Subtraktion:**

* verlorene Zeilen **==** Retention-Zahl → **planmaessig**.
* Zeile 3 fehlt → ⛔ **Faktor-1000**, weil die juengste abgeschlossene Leihe unter keinem korrekten
  Cutoff loeschbar ist.
* `count == 0` → ⛔ **alles geloescht**, sofortiger Rueckweg „Router zurueck".

**Ohne die vier Zeilen ist dieselbe Beobachtung nicht deutbar.**

⚠️ Die Retention-Zahl der Generalprobe **veraltet um die Laenge der Freeze plus die des Fensters** —
ihr Cutoff wandert mit `now`. Sie wird im echten Fenster **erneut** gezaehlt. **Fuer den Vergleich
Quelle↔Ziel gilt dagegen `<freeze_iso>` in beiden Armen** (Abfrage R, §5.2.2).
````

- [ ] **Schritt 3: Die Lesart gegenmessen, statt sie zu glauben**

```bash
sqlite3 :memory: "
select 'ms-lesart', datetime(1741100000000/1000,'unixepoch');
select 'roh-als-s', ifnull(datetime(1741100000000,'unixepoch'),'<LEER>');
select 'sek-als-s', datetime(1741100,'unixepoch');"
```

Erwartung, zeichengleich: `2025-03-04 14:53:20` · `<LEER>` · `1970-01-21 03:38:20`. Kommt beim
zweiten etwas anderes heraus, ist die sqlite3-Version anders und die Erwartungstabelle in §S.3 wird
**gegen die gemessene Ausgabe** berichtigt, nicht gegen das Gedaechtnis. Die benutzte Version gehoert
ins Protokoll (`sqlite3 --version`).

> sqlite3-Version im Fenster: ____________________

- [ ] **Schritt 4: Commit**

```bash
rtk git add docs/runbooks/radio-cutover.md
rtk git commit -m "docs(radio-cutover): §S.3 — Zeitstempel-Stichprobe, gelesen_als_s ist LEER und nicht 1970"
```

---

### Aufgabe 10: §S.4 — `devices.last_updated_at`, der Sonderfall mit ausgeschriebenem Sollwert

**Warum eine eigene Aufgabe:** es ist die **einzige** Spalte des ganzen Imports mit einem
**Typwechsel** (`integer` epoch-ms → TEXT `YYYY-MM-DD`), und sie ist die einzige, fuer die die
Alt-Anwendung **kein** Schiedsrichter ist.

**Wartet auf:** nichts aus dem Bau. Die Zusicherung, die die **Zone** traegt, ist ein Unit-Test
(Spec 1 §2.2.5, die drei `tagInBerlin`-Faelle) und nicht diese Stichprobe.

**Dateien:**
- Aendern: `docs/runbooks/radio-cutover.md` — Unterabschnitt `### §S.4`
- Test: keiner. Die Pruefung ist Schritt 3.

**Schnittstellen:**
- Verbraucht: §L.1, §L.2.
- Liefert: den **ausgeschriebenen Sollwert** (Berliner Kalendertag) samt Umschaltregel, den
  Kandidatenfilter und die Protokollzeile mit der **Uhrzeit**.

⚠️ **Diese Aufgabe schreibt einen Sollwert aus, den Spec §2.2.1 offen laesst.** Dort stehen zwei
Kandidatentage (`utc_tag`, `utc_tag_plus1`) mit der Anweisung, „den Zielwert gegen sie zu stellen" —
aber **nirgends steht, welcher der Sollwert ist**. Er ist jedoch determiniert: Spec 1 §2.2.3 setzt den
**Berliner** Kalendertag, mit ausgeschriebener Begruendung („Eine Berlin-Kuerzung ist fuer **alle
drei** Schreibwege richtig"). Ohne diese Regel besteht ein Mapper mit
`new Date(ms).toISOString().slice(0,10)` die Produktionsstichprobe, weil `utc_tag` einer der zwei
akzeptierten Kandidaten ist — **genau der Mapper, den Spec 1 verwirft.**

- [ ] **Schritt 1: Den Sonderfall mit Sollwert schreiben**

````markdown
### §S.4 — `devices.last_updated_at`: die einzige Spalte mit Typwechsel

Quelle ist epoch-**ms** (`radio-admin@265abd5 server/src/db/schema.ts:18`), Ziel ist TEXT
`YYYY-MM-DD` **in `Europe/Berlin`** (Spec 1 §2.2.3, ueber `tagInBerlin`; die Zone steht **in der
Funktion**, nicht in `TZ`).

**⛔ Der Sollwert ist der BERLINER Kalendertag.** `utc_tag` und `utc_tag_plus1` sind ein
**Plausibilitaetsrahmen**, keine Alternativen — `sqlite3` kennt `Europe/Berlin` nicht, und `'+1 hour'`
ist ueber die Sommerzeitgrenze falsch, der erwartete Wert ist also **nicht** per SQL berechenbar.
Die Regel, ausgeschrieben:

| `uhrzeit_utc` der Quellzeile | Sollwert |
|---|---|
| **≥ 22:00** in der **Sommerzeit** (CEST = UTC+2) | `utc_tag_plus1` |
| **≥ 23:00** in der **Winterzeit** (CET = UTC+1) | `utc_tag_plus1` |
| sonst | `utc_tag` |

```sql
-- QUELLE: die zwei moeglichen Kalendertage, nebeneinander.
select id, last_updated_at,
       date(last_updated_at/1000, 'unixepoch')            as utc_tag,
       date(last_updated_at/1000, 'unixepoch', '+1 day')  as utc_tag_plus1,
       time(last_updated_at/1000, 'unixepoch')            as uhrzeit_utc
  from devices where id = '<id>';
```

```sql
-- ZIEL: derselbe Datensatz, der Wert ist TEXT und wird ZEICHENGLEICH verglichen.
select id, last_updated_at from devices where id = '<id>';
```

> `id`: ____________________ · `uhrzeit_utc`: ________ · Jahreszeit: ☐ Sommer ☐ Winter ·
> `utc_tag`: ________ · `utc_tag_plus1`: ________ · **Sollwert nach Regel**: ________ ·
> **Zielwert**: ________ · gleich? ☐ ja ☐ nein

⛔ **Die Alt-Anwendung ist fuer DIESE Spalte keine zulaessige zweite Meinung.** Sie zeigt denselben
Wert je Flaeche verschieden: der CSV-Export formatiert den **UTC**-Tag
(`server/src/routes/export.ts:49-51`, `new Date(value).toISOString().slice(0,10)`, Kommentar `:42`
„UTC `YYYY-MM-DD`"), die Detailansicht und das Bearbeitungsformular den **lokalen** Tag
(`client/src/utils/format.ts:4` `toLocaleString('de-DE')`,
`client/src/features/devices/DeviceEditForm.tsx:41` `dayjs(device.lastUpdatedAt)`, `:61`
`values.lastUpdatedAt.valueOf()`). Die zwei Flaechen widersprechen sich bei **genau den Zeilen**, die
der Filter unten auswaehlt. Wer die Detailansicht oeffnet, bekommt den Berliner Tag; wer den
CSV-Export zieht, den UTC-Tag. **Das ist kein Schiedsrichter, das ist eine Muenze.**

#### Der Kandidatenfilter — und was seine Leere bedeutet

```sql
-- Die einzige diskriminierende Zeile: 22:00 UTC oder spaeter (Formular-Weg).
select id, last_updated_at, time(last_updated_at/1000,'unixepoch') as uhrzeit_utc
  from devices
 where last_updated_at is not null
   and last_updated_at % 86400000 >= 79200000
 limit 1;
```

⚠️ **Findet dieser Filter keine Zeile, ist `tagInBerlin` an den Produktionsdaten NICHT pruefbar**, und
die Zusage ruht allein auf den drei `tagInBerlin`-Unit-Tests (Spec 1 §2.2.5:
Formular-Mitternacht `2026-08-16T22:00:00Z → 2026-08-17` · CSV-Weg `2026-08-17T00:00:00Z →
2026-08-17` · `Date.now()`-Weg `2026-08-17T14:35:00Z → 2026-08-17`). **Das ist eine Protokollzeile,
kein gruener Haken.**

> Filter fand: ☐ eine Zeile, `id` ____________________ ☐ **keine Zeile — Zusage ruht auf den Unit-Tests**

**Warum die Uhrzeit und nicht nur der Tag ins Protokoll gehoert:** welcher der drei Alt-Schreibwege
eine Zeile geschrieben hat, steht **nirgends in den Daten** — die Uhrzeit ist der einzige Indikator
(22:00/23:00 = Formular, 00:00 = CSV, sonst Update-Karte). Und der Filter ist ein
**Kandidaten**filter: im Winter liegt lokale Mitternacht bei 23:00 UTC.

#### Was diese Stichprobe NICHT beweist

Die **Formatprobe** in Abfrage Z (§5.2.2, zehnte Zeile:
`last_updated_at not glob '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'`) sagt, dass die Spalte die
**Form** `YYYY-MM-DD` hat. Sie sagt **nichts ueber die Zone**. Umgekehrt sagt diese Stichprobe etwas
ueber die Zone, aber nur fuer **eine** Zeile. **Die Zone in der Breite traegt allein der Unit-Test.**
Beide Stellen verweisen aufeinander, damit niemand die eine fuer die andere haelt.
````

- [ ] **Schritt 2: Die Rueckverweise setzen**

In §S.3 (Aufgabe 9) und in der Zeile zu Abfrage Z: je einen Satz, der auf §S.4 zeigt, und in §S.4 je
einen zurueck. Die drei Stellen sind:

1. §S.2, Abfrage (3), Zeile `last_updated_at` → „Sollwertregel aus §S.4".
2. §S.4, Absatz „Was diese Stichprobe NICHT beweist" → Abfrage Z, zehnte Zeile.
3. §L, Ausnahmeabsatz zur zweiten Meinung → „Der Sollwert steht in §S.4".

- [ ] **Schritt 3: Die Regel gegenrechnen, statt sie zu glauben**

```bash
sqlite3 :memory: "
-- 2025-08-16T22:00:00Z, Sommerzeit: Berliner Tag ist der 17.
select 'sommer 22:00Z',
       date(1755381600, 'unixepoch')           as utc_tag,
       date(1755381600, 'unixepoch', '+1 day') as utc_tag_plus1,
       time(1755381600, 'unixepoch')           as uhrzeit_utc;
-- 2025-01-16T22:30:00Z, Winterzeit: Berliner Tag ist noch der 16.
select 'winter 22:30Z',
       date(1737066600, 'unixepoch')           as utc_tag,
       date(1737066600, 'unixepoch', '+1 day') as utc_tag_plus1,
       time(1737066600, 'unixepoch')           as uhrzeit_utc;"
```

Erwartung: erste Zeile `utc_tag = 2025-08-16`, `utc_tag_plus1 = 2025-08-17`, Uhrzeit `22:00:00` →
nach der Regel ist der **Sollwert `2025-08-17`**. Zweite Zeile Uhrzeit `22:30:00` in der Winterzeit →
Regel greift **nicht** (Schwelle 23:00), **Sollwert `2025-01-16`**. Weicht die Rechnung ab, wird die
Tabelle in §S.4 gegen die Ausgabe berichtigt.

- [ ] **Schritt 4: Commit**

```bash
rtk git add docs/runbooks/radio-cutover.md
rtk git commit -m "docs(radio-cutover): §S.4 — Sollwert von last_updated_at ist der Berliner Kalendertag"
```

---

### Aufgabe 11: §Z — die Gegenzaehlungen nach dem Import, bevor irgendetwas umgeschwenkt wird

**Wartet auf:** ⬜ **L4** (`__drizzle_migrations` gegen `_journal.json`) und ⬜ **L5** —
**eingeschraenkt auf den SOLLWERT von `revision`**; die drei Feldnamen sind heute lesbar und werden
hier ausgeschrieben. Dazu ⬜ **L13**, **eingeschraenkt auf den Loopback-Port des
Fenster-Pruefcontainers** — er steht nur im **Fenster**-Arm von §Z.6; der Generalprobe-Arm ist mit
`3999` aus §P.8 ausgeschrieben und wartet auf nichts.

**Dateien:**
- Aendern: `docs/runbooks/radio-cutover.md` — neuer Abschnitt `## §Z`
- Test: keiner. Die Pruefung ist Schritt 4 (Zaehlprobe „fuenf, nicht sechs").

**Schnittstellen:**
- Verbraucht: die sechs Sollwerte aus §V/A1 · die Erwartungen aus A2/A3/A4 · §L.2 · `<freeze_iso>`.
- Liefert: die **fuenf** Zielzaehlungen, die drei Ziel-Invarianten, die Nullprobe auf
  `zugangscode_id`, die Index-Probe auf `loans_device_active_uidx`, die vier Kontrollgruppen-Angaben
  im Ziel, und die zwei Ablesungen L4/L5.

- [ ] **Schritt 1: Den Abschnitt schreiben**

````markdown
## §Z — Die Gegenzaehlungen nach dem Import

**Zielarm: der Befehl aus §L.2, mit der Lesart aus §L.3. Kein Browser, keine Domain.**

Muster `docs/runbooks/lagerbuch-cutover.md:452`, `:544` — **dieselbe Zahl vorher und nachher.**

### §Z.1 — Fuenf Zeilenzahlen, nicht sechs

```sql
-- FUENF Sollwerte gegen A1. `api_tokens` fehlt hier ABSICHTLICH — die Tabelle
-- existiert im Ziel nicht (Entscheidung 13, B16, W4); wer sie mitschreibt, bekommt
-- "Error: no such table: api_tokens" und haelt es fuer einen Fehler.
select 'devices',           count(*) from devices
union all select 'software_versions', count(*) from software_versions
union all select 'users',             count(*) from users
union all select 'device_events',     count(*) from device_events
union all select 'loans',             count(*) from loans;
```

**Erwartung: fuenf Paare gleich — PAARWEISE, nicht in der Summe.**

| Tabelle | Quelle (A1) | Ziel | gleich? |
|---|---|---|---|
| `devices` | ________ | ________ | ☐ |
| `software_versions` | ________ | ________ | ☐ |
| `users` | ________ | ________ | ☐ |
| `device_events` | ________ | ________ | ☐ |
| `loans` | ________ | ________ | ☐ |

⛔ **Eine Abweichung heisst: entweder ist der Import unvollstaendig, oder die Datei ist eine frisch
angelegte, leere `radio.db`.** `openModuleDatabase` legt Verzeichnis und Datei bei Bedarf an
(`src/core/db/index.ts:12-22`) — `/api/health/radio` waere dabei **gruen**. Deshalb steht die
`ls -ln`-Gegenprobe aus §L.2 davor.

### §Z.2 — Die drei Invarianten, jetzt im ZIEL

```sql
select count(*) from software_versions where is_target = 1;
select count(*) from device_events e left join devices d on d.id = e.device_id where d.id is null;
select device_id, count(*) from loans where returned_at is null group by device_id having count(*) > 1;
```

Erwartung wie **A2 / A3 / A4**: `1` · `0` · leer.

> is_target: ________ · Waisen: ________ · doppelt aktive Leihen: ________ Zeilen

### §Z.3 — Die Spalte ohne Quelle MUSS leer sein

```sql
select count(*) from loans where zugangscode_id is not null;
```

**MUSS `0` sein.** > Ergebnis: ________
⛔ Ein Wert ≠ 0 heisst, dass ueber die Suite schon ausgeliehen wurde — im Fenster ein **Alarm**.

### §Z.4 — Der partielle Index MUSS da sein

```sql
select name, sql from sqlite_master
 where type = 'index' and name = 'loans_device_active_uidx';
```

> Ergebnis, woertlich: ____________________

⚠️ **Diese Probe ist nicht redundant.** `drizzle-kit` erzeugt partielle Indizes **nicht**, und
`radio-admin@265abd5 server/drizzle/0003_kind_spot.sql` sagt es selbst: „it is invisible to the drizzle
schema, so future `drizzle-kit generate` runs neither see nor drop it". **Fehlt er, ist alles gruen** —
Build, Typecheck, Paritaet, jede Zaehlung oben — **und die Invariante „hoechstens eine aktive Leihe je
Geraet" ist weg.** Sichtbar wird es erst, wenn der Kiosk ein Geraet zum zweiten Mal ausleiht.

### §Z.5 — Die vier Angaben der Retention-Kontrollgruppe, im Ziel

```sql
select count(*) from loans where returned_at is not null;
select id, returned_at, datetime(returned_at,'unixepoch') from loans
 where returned_at is not null order by returned_at desc limit 1;
select id, returned_at, datetime(returned_at,'unixepoch') from loans
 where returned_at is not null order by returned_at asc  limit 1;
```

> gesamt: ________ · juengste `id`/`returned_at`/Datum: ____________________ ·
> aelteste `id`/`returned_at`/Datum: ____________________

⛔ **Ein Datum im Jahr 1970 in einer dieser Zeilen ist der Faktor-1000-Fehler, bewiesen.** Die
**spaltengenaue** Fassung derselben Probe ist **Abfrage Z** (§5.2.2) — sie sagt, **welche** Spalte
betroffen ist, und sie wird auch hier gefahren.

### §Z.6 — Die zwei Ablesungen, die erst der Bau bzw. der Server liefert

**⬜ L4 — die Migrationen sind vollstaendig gefahren.** Muster `lagerbuch-cutover.md:72`.

```sql
select count(*) from __drizzle_migrations;
```

Gegen die Zahl der Eintraege in `src/app/m/radio/_db/migrations/meta/_journal.json`:

```bash
rtk grep -c '"idx"' src/app/m/radio/_db/migrations/meta/_journal.json
```

> `__drizzle_migrations`: ________ · Eintraege im Journal: ________ · gleich? ☐ ja ☐ nein

Die Zahl ist heute nicht nennbar, weil das Verzeichnis nicht existiert (im Repo geprueft).

**L5 — der Healthcheck. Die Feldnamen stehen hier, sie sind KEINE Leerstelle mehr.**

⚠️ **Die Adresse haengt vom Lauf ab — dieselbe Bauform wie die Lauf-Tabelle §L.3.** §Z laeuft, wie
die Stichproben, **zweimal, nicht einmal** (Spec 2 §2.2.4 Nr. 1 und Nr. 2), und die zwei Laeufe
fragen **verschiedene Pruefcontainer auf verschiedenen Ports**. Eine Adresse fuer beide waere in
einem der beiden Laeufe falsch.

| Lauf | Gefragt wird | Befehl |
|---|---|---|
| **Generalprobe** | der ephemere Pruefcontainer aus **§P.8** (`-p 127.0.0.1:3999:3000`) | `curl -si http://127.0.0.1:3999/api/health/radio \| tail -1` |
| **Fenster** | der Pruefcontainer aus **§C Schritt 8** (`-p 127.0.0.1:<L13-Port>:3000`) | `curl -si http://127.0.0.1:<L13-Port>/api/health/radio \| tail -1` |

⛔ **`<L13-Port>` in der Generalprobe und `3999` im Fenster sind beide falsch.** `3999` steht in §P.8
ausgeschrieben. ⬜ **L13** ist der Loopback-Port des **Fenster**-Pruefcontainers und **eine Wahl,
keine Ablesung**: er steht in **§A Nr. 12** und wird von dort abgeschrieben, nicht hier gesetzt.

Die Antwort ist `Response.json({ ...result, revision })` (`src/app/api/health/[modul]/route.ts:23-26`)
mit `result` aus `checkModuleHealth` (`src/core/health/index.ts:4-15`). Die drei Felder:

| Feld | Bedeutung | Beleg |
|---|---|---|
| `module` | der Modulschluessel, hier `"radio"` | `src/core/health/index.ts:10` |
| `status` | `"ok"` **erst nach** `openModuleDatabase(...)` **und** `db.prepare("SELECT 1").get()` | `src/core/health/index.ts:8-9` |
| `revision` | der Commit-SHA des laufenden Stands | `src/app/api/health/[modul]/route.ts:24` |

⬜ **Was hier offen bleibt, ist allein der SOLLWERT von `revision`** — er steht in der Protokollzeile
aus §4.2 Nr. 1 und wird von dort abgeschrieben, nicht geraten.

> `module`: ________ · `status`: ________ · `revision`: ____________________ ·
> Sollwert aus §4.2 Nr. 1: ____________________ · gleich? ☐ ja ☐ nein

⛔ **NIE `/api/health`.** `src/app/api/health/route.ts` liefert konstant `{status:"ok"}` **ohne Modul
und ohne Datenbank**. Und Health beweist ohnehin weniger als sein Name: `SELECT 1` auf einer Datei,
die bei Bedarf **neu angelegt** wird. **Deshalb steht die zaehlende Pruefung §Z.1 NEBEN dem
Healthcheck, nicht an seiner Stelle.**
````

- [ ] **Schritt 2: Die Uebergabezeile an Kapitel 4 und 5 setzen**

Am Ende von §Z:

````markdown
### §Z.7 — Was aus diesem Abschnitt weiterverwendet wird

| Protokollzeile aus §Z | Wird gelesen in |
|---|---|
| Die fuenf Paare aus §Z.1 | §5.2.2 **Abfrage A** — dort als **Abbau-Sperre**: ohne fuenf gleiche Paare wird kein Volume geloescht |
| `is_target = 1` aus §Z.2 | §5.2 als Ziel-Gegenprobe zu A2 |
| Die vier Angaben aus §Z.5 | §5.2.2 **Abfrage Z** (spaltengenau) und die Nachkontrolle nach dem ersten Purge |
| `$VOL_SUITE` aus **§4.5 Schritt 4 Handgriff 1** (§L.2 setzt ihn nicht, es zitiert ihn zurueck) | §L.2, §V, §S, §Z und §5.2.2 Abfragen R und Z — **innerhalb des Fensterlaufs dieselbe Protokollzeile, keine zweite Ablesung**. §5.2 liest den Namen Wochen spaeter in einer neuen Shell **erneut** ab; er wird dann gegen diese Zeile **gegengelesen** |
| `<freeze_iso>` aus §4.5 Schritt 1 | §5.2.2 **Abfrage R**, in **beiden** Armen |

⛔ **`$VOL_SUITE` wird einmal je LAUF abgelesen und innerhalb dieses Laufs mehrfach gelesen — nicht
einmal im ganzen Dokument.** Der Fensterlauf liest ihn **einmal**, in §4.5 Schritt 4 Handgriff 1;
jede weitere Stelle desselben Laufs (§L.2, §V, §S, §Z) zitiert diese Protokollzeile zurueck. Wer
**innerhalb des Fensters** ein zweites Mal abliest, kann eine andere Datei erwischen als die, ueber
die §Z.1 geurteilt hat.

⚠️ **§5.2 ist kein Verstoss dagegen, sondern die Ausnahme mit Grund:** die Abbau-Sitzung laeuft
fruehestens vierzehn Tage spaeter in einer **neuen Shell**, in der die Zuweisung von damals laengst
weg ist; eine ungesetzte Variable laese ein leeres Volume, und dessen Nullen saehen aus wie ein
Datenbefund. §5.2 liest deshalb **erneut** ab und liest das Ergebnis gegen die Protokollzeile
aus §4.5 Schritt 4 Handgriff 1 **gegen** — zwei verschiedene Namen sind dort ein **Stopp-Punkt**.
Damit gibt es im Runbook genau **zwei** Setzstellen fuer `$VOL_SUITE`, und genau das zaehlt das Tor
in §C Schritt 4.
````

- [ ] **Schritt 3: Die Zaehlprobe „fuenf, nicht sechs"**

```bash
rtk grep -n 'from api_tokens' docs/runbooks/radio-cutover.md
```

Erwartung: **genau ein** Treffer, und er steht in **§V/A1** (Quellarm). §Z.1 **nennt** `api_tokens`
im SQL-Kommentar, fuehrt aber kein `from api_tokens` — der Kommentar loest den Treffer also nicht aus.
Steht `api_tokens` als Tabelle irgendwo in §Z, bricht die Zaehlung im Fenster mit
`Error: no such table: api_tokens` ab — in der Generalprobe eine Korrektur, im Fenster ein
**verbrannter Schritt**.

- [ ] **Schritt 4: Commit**

```bash
rtk git add docs/runbooks/radio-cutover.md
rtk git commit -m "docs(radio-cutover): §Z — fuenf Gegenzaehlungen, Index-Probe, L4 und der eingeschraenkte L5"
```

---

## Was dieser Planteil zusagt — und was ausdruecklich NICHT ihm gehoert

### Zusagen nach aussen (Namen, Signaturen, Dateien)

| Gegenstand | Zusage |
|---|---|
| `scripts/import/radio.ts` | Dieser Planteil fuegt **genau fuenf Exporte** hinzu: `paritaetsSichtBenutzer`, `paritaetsSichtSoftwareVersion`, `paritaetsSichtGeraeteEreignis`, `paritaetsSichtLeihe` — und er **benutzt** `paritaetsSichtGeraet` (Spec 1 §2.2.4) und den lokalen Helfer `sekunden`, ohne sie zu schreiben. **Alles Uebrige in dieser Datei gehoert dem Kapitel-1-Planteil.** |
| `scripts/import/radio-paritaet.test.ts` | **Neu, und ausschliesslich** diesem Planteil. Kapitel 1 besitzt `scripts/import/radio.test.ts` mit den elf verbindlichen Testnamen aus Spec 1 §2.2.5 — die Zahl „elf" bleibt dadurch stimmig. |
| Rueckgabeformen | `paritaetsSichtBenutzer` → `{ sub, name, lastSeenAt }` · `paritaetsSichtSoftwareVersion` → `{ id, value, createdAt, createdBy, sortOrder, isTarget }` · `paritaetsSichtGeraeteEreignis` → `{ id, deviceId, field, oldValue, newValue, changedBy, changedAt, source }` · `paritaetsSichtLeihe` → `{ id, deviceId, snapshotCallSign, snapshotSerialNumber, snapshotDeviceType, borrowerName, borrowedAt, returnedAt, returnNote, zugangscodeId, createdAt, updatedAt }`. Alle Zeitfelder sind `number | null` (Sekunden), `lastUpdatedAt` ist `string | null`. |
| `docs/runbooks/radio-cutover.md` | Dieser Planteil besitzt **§L, §V, §S, §Z**. Kopf, Grundlagenzeile, ⚠️-Kopfabschnitt, §0 und der Ablauf gehoeren Kapitel 4. |
| Die Zaehlungen | **Fuenf** Tabellen im Zielarm, **sechs** im Quellarm. `api_tokens` erscheint genau einmal: in §V/A1. |
| Die Leseform des Zielarms | Die `docker run`-Form aus §L.2 gegen `$VOL_SUITE` ist die **verbindliche** Form fuer **jede** SQLite-Ablesung am Ziel im Fenster — auch fuer §5.2.2 Abfrage **A**, die sie heute nicht benutzt (sie liest `sqlite3 -readonly "$DATA_DIR/radio.db"` auf dem Host, einen Pfad, den es dort nicht gibt). **Das ist eine Zusage nach aussen, keine stille Korrektur in fremdem Kapitel.** |
| Das Zeitfundament | Die Zeitfunktionen `msZuDatum`, `msZuDatumOptional`, `tagInBerlin` und `MS_MIN`/`MS_MAX` gehoeren dem **Kapitel-1**-Planteil. Dieser Planteil setzt sie voraus und schreibt sie nicht. |

### Was ausdruecklich NICHT Teil dieses Planteils ist

| Gegenstand | Warum nicht | Wo es hingehoert |
|---|---|---|
| `getaggteQuellzeilen` / `getaggteZielzeilen` / der eine `checkParity`-Aufruf | Sie sind die **Rahmenfunktion** des Importers, nicht die Sichten | Kapitel 1, §1.5.2 |
| Die Mapper `toNeuesGeraet`, `toNeueSoftwareVersion`, `toNeuenBenutzer`, `toNeuesGeraeteEreignis`, `toNeueLeihe` | Sie erzeugen die Zeilen, die die Sichten lesen | Kapitel 1, §1.4 |
| Die elf verbindlichen Testnamen aus Spec 1 §2.2.5 | Sie testen die **Mapper**, nicht die Sichten | Kapitel 1, §1.3.4 |
| Der Snapshot-**Befehl** und der Freeze | §L.1 **zitiert** ihn, weil ohne ihn keine Abfrage laeuft; erzeugt wird er anderswo | Kapitel 1 §1.1 (Form) · Kapitel 4 §4.5 Schritt 1–2 (Ausfuehrung) |
| Die Abfragen **A, T, R, Z, P1–P6** und die Archivprobe | Sie laufen **vor dem Abbau**, Wochen spaeter, und sind Abbau-Sperren | Kapitel 5, §5.2 |
| `zugangscodes` als Tabelle | Nicht Teil des Imports (Spec 1 §2.8.2 Punkt 5). Kapitel 2 beruehrt sie **nur** als Nullprobe (§S.2, §Z.3) | Kapitel 4, §4.8 |
| C.6 / B4 (Updater-Rechtestufe) | Fachlich blockierend, bewusst geparkt — **keine** Abfrage und keine Sicht dieses Planteils liest eine Rolle | Betreiber |

---

## Selbstpruefung gegen Kapitel 2 der Spec

| Abschnitt der Spec | Aufgabe |
|---|---|
| §2.1.1 Der Mechanismus, in Zeilen | 8 (Kopf von §S) |
| §2.1.2 Der blinde Fleck | 8 (Tabelle im Kopf von §S) |
| §2.1.3 Zwei Ablaufregeln | 8 (rote Paritaet = geloeschte Ziel-DB) · 7 (Abfragen laufen **vor** dem Import) |
| §2.1.4 Die fuenf Paritaetssichten | **1, 2, 3, 4, 5** |
| §2.2.1 Roh gegen roh | 8 (Protokollform) · 10 (`last_updated_at`) |
| §2.2.2 Die zwei Arme | **6** |
| §2.2.3 Welche Zeile man waehlt | **8** |
| §2.2.4 Zweimal, nicht einmal | 7 (Kopf von §V) · 8 (die `id`s der Generalprobe sind Protokoll, keine Eingabe) |
| §2.3.1–§2.3.3 Die Zeitstempel-Stichprobe | **9** |
| §2.3.4 Die Kontrollgruppe | 9 (Quellarm) · 11 (§Z.5, Zielarm) |
| §2.4.1–§2.4.9 A1–A13 | **7** |
| §2.5 Was passiert, wenn eine Abfrage etwas findet | 7 — die Entscheidung steht **je Abfrage**, nicht in einer Sammeltabelle am Ende. Grund: unter Zeitdruck wird die Entscheidungsregel dort gelesen, wo der Befund entsteht |
| §2.6 Die Gegenzaehlungen | **11** |

**Bewusst nicht abgedeckt:** §2.4s Snapshot-Erzeugung (nur zitiert, Kapitel 1/4) · die Alt-Oberflaeche
als Pruefflaeche jenseits von §S.3 Wert 2 · `zugangscodes` als Tabelle.

**Namensgleichheit ueber alle Aufgaben** — in jeder Aufgabe zeichengleich geschrieben:
`paritaetsSichtGeraet` · `paritaetsSichtSoftwareVersion` · `paritaetsSichtBenutzer` ·
`paritaetsSichtGeraeteEreignis` · `paritaetsSichtLeihe` · `sekunden` · `$VOL_SUITE` ·
`radio-admin-snapshot.sqlite` · `<freeze_iso>` · `loans_device_active_uidx`.

---

## Was aus der Re-Kritik eingearbeitet ist

| Fund | Wo er in diesem Plan landet |
|---|---|
| `gelesen_als_s` zeigt **NULL**, nicht 1970 (§2.3.1/§2.3.2) | **Aufgabe 9**, Erwartungstabelle + Schritt 3 misst es nach. Die 1970-Erwartung ist an den Zielarm verwiesen (Abfrage Z, `< 946684800`) |
| `devices.last_updated_at` hat keinen Sollwert (§2.2.1) | **Aufgabe 10**, Sollwertregel ausgeschrieben + Ausschluss der Alt-Anwendung als zweite Meinung, mit beiden Fundstellen |
| §2.2.2s Lauf-Tabelle schickt die Generalprobe an `$VOL_SUITE` | **Aufgabe 6**, §L.3 nennt je Lauf den **Mount**; §3.2.1-Riegel mit Geltungsbereich zitiert |
| §2.2.3 „Der Zielarm braucht keine eigene Abfrage" deckt Paar 2 nicht | **Aufgabe 8**, Schritt 2: **drei** symmetrische Abfragen statt zwei, Asymmetrie benannt |
| W5 Residuum 2 begruendet `immutable=1`-Verbot als Messung | **Aufgabe 6**, ⬜ **N1** neu vergeben; Entscheidung bleibt, Grund als konservative Wahl beschriftet |
| ⬜ L5 ist zur Haelfte schon beantwortet | **Aufgabe 11**, §Z.6: Feldnamen ausgeschrieben, L5 auf den **Sollwert von `revision`** eingeschraenkt |
| §5.2.2 Abfrage A liest einen Host-Pfad, den es nicht gibt | **Zusage nach aussen** (Tabelle oben), nicht stille Korrektur in Kapitel 5 |
| W8 („eine Pruefliste, deren Kopf eine andere Zahl nennt als ihr Rumpf") | **Aufgabe 7 Schritt 4**, **Aufgabe 8 Schritt 3** und **Aufgabe 11 Schritt 3** sind Zaehlproben mit ausgeschriebenem Erwartungswert; **Aufgabe 5 Schritt 3** nennt die Ableitung vor der Zahl |

**Verworfen, mit Gegenbeleg** — damit ein spaeterer Durchgang ihn nicht erneut als Fund fuehrt:

| Fund | Warum er Kapitel 2 nicht trifft |
|---|---|
| „Blanke §-Verweise zeigen ohne das Praefix `Spec 1` in Spec 1 hinein" (elf Fundstellen: Z. 2679, 2800, 2862, 2864, 2865, 2891, 2907, 2923, 2958, 3257, 4020) | **Keine** dieser elf Zeilen liegt in **1578–2271**. Kapitel 2 haelt die Disziplin durchgehend ein und schreibt `Spec 1 §…`; dieser Planteil uebernimmt die Form. Der Fund ist echt, aber er gehoert Kapitel 3, 4 und 5 |
| „§5.2.2 Abfrage A liest `sqlite3 -readonly \"$DATA_DIR/radio.db\"` auf dem Host" (dreimal gemeldet) | Der Fund ist echt und im Repo bestaetigt (`compose.yaml:79`, `:99`, `:221-223`). Er gehoert aber **Kapitel 5**. Dieser Planteil korrigiert kein fremdes Kapitel, sondern gibt die **Form** als Zusage nach aussen (§L.2) — eine stille Korrektur in fremdem Kapitel waere genau die Art Aenderung, die beim Zusammenfuehren niemand mehr findet |
