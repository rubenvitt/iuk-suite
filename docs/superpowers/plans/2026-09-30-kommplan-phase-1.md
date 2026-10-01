# Kommunikationspläne — Lieferphase 1: Modulrahmen, Layout-Engine, Betrachter, Druck — Umsetzungsplan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Das Modul `kommplan` steht mit Registry, Zugang, eigener Datenbank (alle Tabellen aus Spec §4.1), Zeichen-Generat, einer vollständigen, deterministischen Layout-Engine (Spec §5), einem nur lesenden Betrachter mit Zoom/Verschieben/Einklappen, einer Planliste, der Druckroute A4 quer, Beispielplänen im lokalen Seed und einer Release-Notiz.

**Architecture:** Ein Plan ist ein JSON-Dokument (zod, `schema: 1`). `layout(inhalt, ziel)` in `_lib/layout/` ist eine reine, synchrone Funktion, die Server (Druck) und Client (Betrachter) teilen: Textmessung mit Arimo-Metriken → Kartenmaße (samt Kanal-Sechsecken und Einheitenspalte) → Teilbäume mit Skyline-Konturen (Reingold-Tilford, gierig von links) → Busgruppen je Verbindung mit eigenem Stiel → Seitenstellen → Kamm-Umbruch nach Breite über die ganze Kinderreihe einer Stelle → Papiermaßstab und Aufteilung per Ebenenschnitt. Ein reiner SVG-Renderer (`_ui/zeichnung/`, ohne `"use client"`) zeichnet das Ergebnis; Zeichen stehen je einmal als `<symbol>` in `<defs>`. Die `@einsatzzeichen`-Pakete sind nur `devDependencies`: ein Skript erzeugt zwei eingecheckte JSON-Generate (Rezept-SVGs nur für den Server, Metriken und Piktogramme für beide Seiten).

**Tech Stack:** Next.js 16 (App Router, RSC), React 19, TypeScript 6, zod 4, Drizzle + better-sqlite3, antd 6, Vitest 4, Playwright, `@einsatzzeichen/catalog` 1.5.0 / `core` 3.0.0 / `schema` 3.0.0 (dev).

**Spec:** `docs/superpowers/specs/2026-09-30-modul-kommunikationsplaene-design.md` (§3, §4, §5 vollständig, §5.7, §7, §8.1 nur A4, §9, §10, §11 Phase 1)

**Ticket:** DRK-500. Ticketnummer in jeden Commit-Body. ClickUp pflegt der Hauptlauf, nicht diese Umsetzung.

## Global Constraints

- Arbeitsverzeichnis ausschließlich `/Users/rubeen/dev/personal/drk/iuk-suite/.claude/worktrees/drk-363-8c5335`; nie `cd` ins Haupt-Repo. Nicht pushen.
- Deutsche Texte mit echten Umlauten; Bezeichner, Datei- und Branchnamen ASCII (`~/.claude/CLAUDE.md`).
- `CLAUDE.md` gilt vollständig: Fallen 1–23, Dreieck, Zeitzone, Kommentaranker, Release Notes, Tests. Besonders: Falle 1 (kein antd-Compound in RSC), 6 (Werte für Server Components nie aus `"use client"`), 7 (keine `@ant-design/icons` in RSC), 9 (keine `render`-Funktionen über die RSC-Grenze), 12 (`klickeWennRuhig`/`warteAufSpaltenaufteilung` in der e2e, die Seiten stehen in der FullShell), 14/17 (Listen über `Kartentabelle` aus `core/tabelle`, Spaltentitel als Zeichenkette), 18 (`@page` mit ausgeschriebenen Kantenlängen, benannt, `page:` am gemeinsamen Vorfahren), 21 (`NODE_ENV` wird eingebacken), 22 (`warteAufGestreamteInhalte` vor Zählungen), 23 (Host, Zugang **und** das objektbezogene 404 eines Plans im `layout.tsx` oberhalb jeder `loading.tsx`: `(intern)/layout.tsx` und `(intern)/p/[id]/layout.tsx`).
- `docs/design/README.md` gilt für jede Oberfläche: eine Liste von Datensätzen ist eine `Kartentabelle` (`aria-label`, `rowKey`, `leer`), Chips tragen Fläche und Text als Paar (nie antds `Tag`-Vorgabe), eigenes Markup nimmt `--kp-*`/`--iuk-*`, nie `--ant-*`.
- Vor dem ersten Code, der eine Next-API benutzt, den passenden Guide unter `node_modules/next/dist/docs/` lesen (mindestens `01-app/03-api-reference/02-components/font.md` für `next/font/local`, dazu die Guides zu Route Groups, dynamischen Segmenten und `params` als `Promise`).
- `@einsatzzeichen/*` sind **nur** `devDependencies` (im Workspace-Root: `pnpm add -D -w …`). Keine Laufzeitdatei unter `src/app/m/kommplan` importiert sie, in keiner Form (`from`, Seiteneffekt-`import "…"`, `import(…)`, `require`; Befund M1: Build bricht). Ausschließlich `scripts/kommplan-zeichen-generat.ts` und `*.test.ts` dürfen es. `src/app/m/kommplan/grenze.test.ts` hält das.
- `_lib/zeichen/zeichen.generiert.json` (Rezept-SVGs, rund 220 KB) wird nur von `_lib/zeichen/zeichen.ts` gelesen, und keine Client-Insel erreicht diese Datei — auch nicht über einen `_lib`-Helfer dazwischen (`grenze.test.ts` verfolgt die Importe transitiv). Der Betrachter bekommt nur die Symbole, die sein Plan benutzt, als Prop.
- Alle Maße der Layout-Engine sind **Layout-Millimeter bei Maßstab 1**, Schriftgrößen in pt (1 pt = 25,4/72 mm). Kleinste Schrift in der Zeichnung ist 8 pt, Mindestschrift auf Papier 6 pt → Mindestmaßstab 0,75.
- Die Layout-Engine ist rein und synchron: kein `Date`, kein `Math.random`, kein DOM, keine Zeitzone. Gleiche Daten → gleiches Bild, unabhängig von der Reihenfolge des Arrays `stellen` (sortiert wird nach `reihenfolge`, dann `id`).
- Alle `notFound()`/`redirect()` stehen in `_lib/*.ts`, nie in `page.tsx`/`layout.tsx` (sonst verlangt `core/audit/coverage`-Manifest Einträge).
- Kommentaranker in neuem Code nennen **Namen**, nie Zeilen (`pnpm anker:neu` bricht die CI). **Jede Datei, in die dieser Plan Zeilen einfügt** (`src/core/registry.ts`, `src/core/bootstrap.ts`, `src/core/shell/icons.ts`, `src/core/audit/types.ts`, `src/core/audit/catalog.ts`, `src/app/m/portal/admin/audit/labels.ts`, `scripts/seed-lokal.ts`, `playwright.config.ts`, `Dockerfile`, `.env.example`, `src/app/m/portal/_lib/neuigkeiten/register.ts`), bekommt vor ihrem Commit den **Ankerschritt**: `git grep -n "<dateiname>:[0-9]" -- src scripts e2e` sowie `pnpm anker:drift <datei>`; jeder Anker, der **vor** der Einfügung zutraf und hinter der Einfügestelle liegt, wird in derselben Zeile in die Namensform umgeschrieben (`bootstrap.ts`, `assertHostConfig`). Nie eine Zahl nachziehen (zählt für `anker:neu` als neu), nie eine Zeile dazu oder weg (Kommentaranker-Regel 4). Schon vorher veraltete Anker bleiben, wie sie sind — sie sind nicht Teil dieser Arbeit. Stand der Planung: in `registry.ts` trifft hinter der Einfügestelle keiner mehr zu; in `bootstrap.ts` treffen sechs zu (Task 18, Step 4).
- Nie `timeZone` als Literal auf Modulebene. „Stand" über `zeitFormat("de-DE", …)` aus `core/zeit`; `plan.datum` ist ein Kalendertag (Mitternacht UTC) und wird im Funktionsaufruf mit `timeZone: "UTC"` formatiert (die Ausnahme aus `CLAUDE.md`).
- Signierte Commits (`git commit -S`), Kopfzeile `feat(kommplan): …` für neue Funktion, sonst `test`/`chore`/`docs`. Body mit Zeile `DRK-500` und am Ende `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Last: andere Sessions laufen parallel. Vor dem Urteil über einen roten Test `uptime` prüfen; bei Load > 10 die betroffene Datei einzeln fahren. Fremde Prozesse nie beenden. Kein `pnpm dev` offen lassen.
- Tore vor dem Abschluss: `pnpm typecheck` · `pnpm lint` · `pnpm vitest run` · `pnpm build` · `pnpm exec playwright test e2e/kommplan.spec.ts`. Jede Aufgabe, die Routen anlegt, fährt zusätzlich `pnpm build` (Routenbaum-Konflikte sieht nur der Build). **Jeder Commit besteht `pnpm typecheck`** — keine Aufgabe verschiebt einen roten Typecheck auf eine spätere.

## Abweichungen von der Spec (bewusst, hier entschieden)

1. **Zwei Generate statt einem** (§7): `zeichen.generiert.json` (alle Rezepte mit SVG, nur Server) und `grundlagen.generiert.json` (Arimo-Metriken, Kommunikations- und Kontaktpiktogramme, klein, Server und Client). Grund: der Betrachter rechnet das Layout im Browser und braucht die Metriken, aber nicht rund 220 KB Rezept-SVGs (Befund M5; gemessen mit catalog 1.5.0/core 3.0.0: 222 KB für 232 Hauptrezepte).
2. **Zusatzzeichen** (§7 „alle Rezepte"): Das Generat trägt zusätzlich vier Zeichen `zusatz:eal`, `zusatz:ea`, `zusatz:stab`, `zusatz:oel`, komponiert aus dem Katalog (`kind: "formation"`, `organization: "fuehrung-leitung"`, Mittenbeschriftung). Der Katalog kennt „EAL" nur als „Einsatzabschnittsleitung **Nord**" (D.1.5) und „Stab" nur als THW-Zeichen (E.1.21); die Vorlagen brauchen beide ohne Zusatz. Die Leitstelle (LtS) hat keine Entsprechung und bleibt ohne Zeichen (§7, letzter Punkt).
3. **Kontaktpiktogramme** (§7): Digitalfunk (`comms.handheld-radio-terminal`) und Fax (`comms.fax-transmission`) kommen aus dem Katalog; Funkrufname (Raute wie in der Vorlage), Telefon, Mobil, E-Mail und Sonstiges sind fünf kleine, im Generatorskript festgeschriebene SVGs, weil der Katalog dafür nichts hat.
4. **Mehrere Seitenstellen auf derselben Seite** (§5.3 sagt nur „links oder rechts"): sie stapeln sich untereinander an einer senkrechten Schiene 3 mm neben der Elternstelle; jede hat ihren eigenen Zweig mit eigenem Sechseck.
5. **Stiel je Gruppe mit gestaffelten Knicken** (§5.2): jede Busgruppe hat einen eigenen Stiel, der an der Kartenunterkante beginnt. Liegt das Sechseck der Gruppe nicht unter ihrem Ansatzpunkt, knickt der Stiel waagerecht ab; äußere Gruppen knicken höher als innere. Hat die Karte Einheiten, laufen die Stiele in einer Gasse links neben der Einheitenspalte (wie in der Vorlage OpenR bei EA 1). Diese Regel schließt Kreuzungen aus (Beweisskizze in Task 9).
6. **Die Hülle (`Shell`) sitzt in den Seiten, nicht im Layout**: die Druckroute `/p/[id]/druck/a4` darf keine Hülle haben und teilt sich das Segment `p/[id]` mit dem Betrachter. Ein gemeinsames Layout `(intern)/layout.tsx` hält nur Host- und Zugangsriegel, `(intern)/p/[id]/layout.tsx` dazu das 404 des Plans (Falle 23).
7. **Audit** (in dieser Migration festgelegt, damit Phase 2 und 5 keine Migration umbauen): `plan` wird vollständig auditiert — jede gespeicherte Änderung, also auch jedes Autosave in Phase 2, ist eine Audit-Zeile (No-op-Updates unterdrückt das Trigger-Prädikat). `freigabe.zuletzt_abgerufen` und `freigabe.abrufe` sind `unauditedColumns` (reine Abrufzähler; Ausstellen und Widerrufen bleiben auditiert).
8. **Host-Riegel** (nicht in der Spec): wie `einsatzbuch` liefert das Modul nur auf seinem eigenen Host (`kommplan.localtest.me`, `SUITE_HOST_KOMMPLAN`) aus; ein fremder Suite-Host bekommt 404.
9. **`plan_freigabe` statt `freigabe`** (§4.1): die Audit-Oberfläche benennt Objekte allein über den Tabellennamen (`OBJECT_LABELS`), und `freigabe` heißt dort schon „Schlüsselfreigabe (Einsatzbuch)". Spalten wie in der Spec.
10. **Einfüge-Eigenschaft präzisiert** (§10 „Einfügen einer Stelle verschiebt nichts links von ihr"): weil jede Elternstelle mittig über ihrer Busspanne steht, bewegt eine Einfügung die Vorfahren. Zugesichert wird: kein vorhandenes y ändert sich, und je Ebene behalten die Teilbäume der früheren Geschwister ihre Lage zueinander — solange weder vorher noch nachher irgendwo ein Kamm umbricht (ein Kamm verteilt die Breite der ganzen Kinderreihe neu, das ist gewollt; Task 11).
11. **Route `/m/kommplan/p/[id]` statt `/m/kommplan/[id]`** (§6.1): Auf dem eigenen Host schreibt `core/routing.ts` jeden Pfad außerhalb von `PASSTHROUGH` nach `/m/kommplan/<pfad>` um. Ein dynamisches Segment direkt unter der Modulwurzel finge `/robots.txt`, `/apple-touch-icon.png`, `/manifest.webmanifest` usw. ab: anonyme Abrufe liefen in den Zugangsriegel, würden zum Login umgeleitet und schrieben je Abruf eine `login_required`-Auditzeile. Außerdem teilten sich Plan-IDs den Namensraum mit den späteren statischen Segmenten `bibliothek` und `t` (§6.1). Mit dem Präfix `p/` (Vorbild `aufgaben/a/[id]`, `lagerbuch/a/[artikelId]`) gilt: `/p/[id]`, `/p/[id]/druck/a4`, später `/p/[id]/druck/a3`; `bibliothek` und `t/[token]` bleiben wie in der Spec. Kein anderes Modul hat heute ein dynamisches Segment direkt unter `/m/<key>`.
12. **Kanäle einer Stelle** (§4.2, neues Feld `Stelle.kanaele: string[]`, Vorgabe `[]`): Die Vorlage OpenR hängt unter EA 1 „DMO 608" und „R_UE_2", unter EA 2 „DMO 609" und „R_UE_2", unter EA 3/4 „R_UE_2" — Kanäle, die die Stelle für ihre Fahrzeuge **benutzt**, ohne Gegenstelle. Das Spec-Modell kennt nur `verbindungId` (Weg zur Elternstelle) und nannte alles andere „Reserve"; ein Ausdruck „Reserve DMO 608" wäre fachlich falsch. `kanaele` sind Verbindungs-IDs; das Layout zeichnet sie als Sechsecke in der Gasse unter der Karte, über den Einheiten (wie die Vorlage), an einer eigenen senkrechten Linie (Netz `<stelle>#kanal`) ohne Bus. „Reserve" heißt in der Legende nur noch eine Verbindung, die weder als `verbindungId` noch als Kanal vorkommt. Es ist ein JSON-Feld, keine Migration.
13. **Kamm präzisiert** (§5.5 „Überschreitet die Kinderreihe einer Stelle ein Breitenbudget …"): (a) gemessen wird die **Breite** (Zeilenblock je Kind: Karte samt Einheitenblock und Seitenstapeln), nicht die Kinderzahl; (b) das Budget gilt für die **ganze Kinderreihe** einer Stelle, über alle Busgruppen; (c) jede Gruppe kämmt unter ihrem eigenen Bus („unter demselben Bus"), die Gruppen stehen weiter nebeneinander; reicht das nicht, schrumpft deterministisch die breiteste Gruppe weiter; (d) es kämmen nur Gruppen, deren Kinder keine sichtbaren Unterstellen haben — eine Kammreihe unter Teilbäumen stünde auf der Höhe fremder Enkel (§5.2 „jede Baumtiefe ist eine Zeile"). Die Regel bleibt lokal (nur Kinderreihe und Budget), also keine globale Optimierung.
14. **Aufteilung präzisiert** (§5.6 „Blatt 1 zeigt die oberen Ebenen … gierig nach Teilbaumgröße"): geschnitten wird **von der tiefsten Ebene her** — das größte D, bei dem das Blatt passt, gewinnt; innerhalb der Ebene gierig nach Teilbaumgröße. So hält Blatt 1 die oberen Ebenen, statt direkt unter der Wurzel zu schneiden. Blattnummern folgen der **Lesereihenfolge** (Tiefensuche in Anzeigereihenfolge, zweiter Durchlauf), also steigen die Verweisnummern auf einem Blatt von links nach rechts. Hat ein Blatt ohne Anker mehrere Wurzeln, sind die Wurzeln selbst Kandidaten (eigenes Blatt ohne Anker).
15. **Leerer Titel** (§2 Handeintrag): eine Karte ohne Titel druckt eine leere Titelzeile mit Mindestkopfhöhe; der Platzhalter „(ohne Titel)" erscheint nur im Tooltip (`<title>`) und in Bildschirmbeschriftungen, nie auf dem Papier.

## Review Focus

1. **Titel und Kontaktwerte ohne Leerzeichen** (E-Mail-Adressen, „Bereitstellungsraumkoordination") und **Zeichen außerhalb des Arimo-Subsets** (Emoji, CJK) → Umbruch an `-`, `/`, `@`, `.`, `_` oder hart, höchstens drei Titelzeilen mit „…", voller Text im Tooltip, kein Wurf; unbekannte Zeichen werden mit der Breite von U+FFFD geschätzt. Gepinnt in `text.test.ts` (Task 2) und `karte.test.ts` (Task 5).
2. **Eine Stelle mit 30 Einheiten, drei Seitenstellen auf einer Seite, zwölf Kindern an einer Verbindung, mehreren Verbindungen mit je wenigen Kindern oder breiten Kindern (zwei Einheitenspalten, Seitenstellen)** → zwei Einheitenspalten, Seitenstapel, Kamm nach Breite über die ganze Kinderreihe; nichts überlappt, nichts kreuzt, alles ist angebunden, die Zeile wird höher, das Papier skaliert oder teilt auf. Gepinnt in `gruppen.test.ts` (Task 7), `teilbaum.test.ts` (Task 9), `eigenschaften.test.ts` (Task 11) und `papier.test.ts` (Task 12).
3. **Leerer Plan, Plan nur mit Reservekanälen, mehrere Wurzeln** → Betrachter und Druck stürzen nicht ab; der Druck liefert genau ein Blatt mit Hinweis und Legende. Gepinnt in `zeichne.test.ts` (Task 10), `papier.test.ts` (Task 12), `Blatt.test.tsx` (Task 14), `Betrachter.test.tsx` (Task 20).
4. **Ein gespeicherter Inhalt, der das Schema verletzt** (beschädigtes JSON, Zyklus, verwaiste `eltern`) → Liste und Planseite zeigen „nicht lesbar" bzw. „Dieser Plan lässt sich nicht lesen", kein HTTP 500. Gepinnt in `plaene.test.ts` (Task 19).
5. **Gleiche `reihenfolge`-Werte oder ein umsortiertes Array `stellen`** → identisches Bild. Gepinnt in `eigenschaften.test.ts` (Task 11).

---

## Dateistruktur

```
src/app/m/kommplan/
├── layout.tsx                         nur children (die Token-Ansicht aus Phase 5 braucht keinen Riegel)
├── registry.test.ts
├── grenze.test.ts                     Importgrenzen (@einsatzzeichen, Generat, "use client", next/*)
├── (intern)/
│   ├── layout.tsx                     Host- und Zugangsriegel, OHNE Hülle
│   ├── page.tsx                       Planliste (mit Hülle)
│   ├── PlanTabelle.tsx                "use client", Kartentabelle
│   └── p/[id]/                        Präfix p/ (Abweichung 11)
│       ├── layout.tsx                 Riegel + Plan laden → 404 oberhalb jeder loading.tsx (Falle 23)
│       ├── page.tsx                   Betrachter (mit Hülle)
│       └── druck/a4/
│           ├── page.tsx               Druckroute A4 quer (ohne Hülle)
│           ├── Drucken.tsx            "use client": fonts.ready → print()
│           └── druck.css              @page kommplan-a4, page: am gemeinsamen Vorfahren
├── _db/ schema.ts · client.ts · drizzle.config.ts · schema.test.ts · migrations/
├── _fonts/ Arimo-Variable.ttf · Arimo-Bold.ttf · Arimo-OFL.txt      (vom Generator kopiert)
├── _lib/
│   ├── host.ts · zugang.ts · testDb.ts · plaene.ts · rahmen.ts · seedLokal.ts   (+ Tests)
│   ├── plan/      schema.ts · kontakte.ts · baum.ts · operationen.ts  (+ Tests)
│   ├── beispiele/ bau.ts · einsatz20260222.ts · openr20220701.ts · label.ts
│   │              · fernmeldeskizzeStab.ts · grosseStabslage.ts · index.ts (+ Test)
│   ├── zeichen/   zeichen.generiert.json · grundlagen.generiert.json
│   │              · zeichen.ts (nur Server) · grundlagen.ts · generat.test.ts
│   └── layout/    masse.ts · text.ts · typen.ts · karte.ts · sechseck.ts · kontur.ts
│                  · gruppen.ts · sicht.ts · zeilen.ts · sammler.ts · seiten.ts
│                  · teilbaum.ts · zeichne.ts · papier.ts · layout.ts (Fassade)
│                  · pruefung.ts · zufall.ts · __golden__/*.json · *.test.ts
└── _ui/
    ├── Huelle.tsx                     Shell variant full
    ├── schrift.ts                     next/font/local (Arimo)
    ├── kommplan.css                   Modulvariablen --kp-*
    ├── zeichnung/ farben.ts · Symbole.tsx · Text.tsx · Karte.tsx · Sechseck.tsx
    │              · Zeichnung.tsx · Blatt.tsx · (+ Tests)
    └── betrachter/ ansicht.ts (+ Test) · Betrachter.tsx ("use client") · Betrachter.test.tsx
scripts/kommplan-zeichen-generat.ts
scripts/kommplan-vorschau.ts
e2e/kommplan.spec.ts
src/app/m/portal/_lib/neuigkeiten/notizen/kommplan/2026-09-30-kommunikationsplaene-ansehen.ts
```

Geändert: `package.json`, `pnpm-lock.yaml`, `src/core/registry.ts`, `src/core/shell/icons.ts`, `src/core/bootstrap.ts`, `Dockerfile`, `src/core/audit/types.ts`, `src/core/audit/catalog.ts`, `src/app/m/portal/admin/audit/labels.ts`, `scripts/seed-lokal.ts`, `.env.example`, `playwright.config.ts`, `e2e/gruppen.json`, `src/app/m/portal/_lib/neuigkeiten/register.ts`; nur Kommentaranker (Namensform, gleiche Zeilenzahl): `src/core/bootstrap.test.ts`, `src/app/m/radio/_lib/boot.ts`.

Im Folgenden steht `K` für `src/app/m/kommplan`.

## Maße (aus den Referenzbildern abgeleitet)

Die Referenz-PNGs sind A4 quer mit 150 dpi (1754 × 1240 px, 5,906 px/mm). Gemessen in der Vorlage „Einsatz 22.02.2026": Kartenbreite 205 px = 34,7 mm, Kontaktzeile 21 px = 3,6 mm, Kopf 40 px = 6,8 mm, Einheitenkasten 170 × 15 px = 28,8 × 2,5 mm im Takt 30 px = 5,1 mm, Sechseck 155 × 28 px = 26 × 4,7 mm, Kartenabstand in der Reihe 89 px = 15 mm, Ebenenabstand Kartenunterkante → nächste Kartenoberkante 92 px = 15,6 mm. Die Vorlage setzt ihre Schrift bei etwa 6 pt. Die Engine rechnet bei Maßstab 1 mit 8 pt als kleinster Schrift, also ≈ 4/3 der Vorlage; auf A4 landen die Vorlagenpläne damit bei Maßstab ≈ 0,82–0,85 — dieselbe Anmutung wie heute, und Luft bis zur Mindestschrift 6 pt (Maßstab 0,75).

| Größe | Wert (Layout-mm bzw. pt) |
|---|---|
| Kartenbreite | 46 |
| Kopf: Mindesthöhe / Innenrand | 12 / 1,2 |
| Zeichen im Kopf | 10 × 10 bei (1,2 · 1,2) |
| Titel | 9,5 pt fett, Zeilenhöhe 1,15, x = 12,5 (ohne Zeichen 1,2), max. 3 Zeilen |
| Leiter | 8 pt, unter dem Titel |
| Kontaktzeile | 4,5 hoch (zweizeilig 7,7), Piktogrammspalte 8, Wert 8 pt ab x = 9,5, max. 2 Zeilen |
| Einheitenkasten | 40 × 4,2, Takt 5,5, 2,5 unter der Karte, Einzug ≥ 6, ab 10 Einheiten zwei Spalten (Abstand 2) |
| Abzeichen „+n Stellen" | 22 × 4,5, 1,5 unter dem Block, 8 pt |
| Sechseck | Höhe 6, Spitze 3, Piktogramm 7 × 4, Beschriftung 8 pt fett, Breite 26 … 44 |
| Stiel | erster Knick 2 unter der Zeilenunterkante, Knicktakt 1,5, 1,5 bis zum Sechseck, Sechseck → Bus 2, Bus → Karte 4 |
| Ebenenlücke | 15,5 + max(0, J − 1) · 1,5 (J = größte Gruppenzahl − 1 der Ebene) |
| Kanal-Sechsecke | in der Gasse unter der Karte, erstes 2,5 unter der Kartenunterkante, Takt 7,5; Einheiten beginnen 2,5 unter dem letzten |
| Abstände | Geschwister 8, Gruppen 12, Wurzeln 16, Kammreihen 8, Kammrücken 3 links, Seitenschiene 3, Seitenluft 3, Seitenstapel 4 |
| Mindestabstände (Prüfung und Packen) | Kästen verschiedener Stellen 2 (auch senkrecht: Konturen gelten schon bei weniger als 2 mm Höhenabstand als überlappend), parallele Linien verschiedener Netze 0,75 |
| Papier A4 quer | 297 × 210; Rand links/rechts 10, oben/unten 8; Kopf 14; Fuß 7; Legendenzeile 5 (+2) |
| Kamm-Budget | Reihenbreite (Papierbreite − 20) / 0,75 → A4: 369,3; A3 und Bildschirm: 533,3 (Layout-mm, über die ganze Kinderreihe einer Stelle) |

---

### Task 1: Arbeitskopie, Paketstand und Zeichen-Generat

**Files:**
- Modify: `package.json`, `pnpm-lock.yaml` (devDependencies)
- Create: `scripts/kommplan-zeichen-generat.ts`, `K/_lib/zeichen/zeichen.generiert.json` (erzeugt), `K/_lib/zeichen/grundlagen.generiert.json` (erzeugt), `K/_fonts/Arimo-Variable.ttf`, `K/_fonts/Arimo-Bold.ttf`, `K/_fonts/Arimo-OFL.txt` (kopiert), `K/_lib/zeichen/generat.test.ts`, `K/grenze.test.ts`

**Interfaces:**
- Produces: `zeichen.generiert.json` = `{ stand: Stand; zeichen: Record<string, { titel: string; suchtext: string; viewBox: string; inhalt: string }> }` mit Schlüsseln `rezept:<Abschnitt>` (alle Hauptrezepte) und `zusatz:eal|ea|stab|oel`. `grundlagen.generiert.json` = `{ stand: Stand; metrik: { einheitenProEm: number; aufstieg: number; abstieg: number; ersatz: number; normal: Schnitt; fett: Schnitt }; piktogramme: Record<string, { viewBox: string; inhalt: string }> }` mit `Schnitt = { vorschub: Record<string, number>; unterschneidung: Record<string, Record<string, number>> }` (Schriftgrößen-Einheiten, Schlüssel = Codepoint dezimal) und `Stand = { catalog; core; schema; catalogCore; catalogSchema }` (Versionsstrings). Piktogrammschlüssel: `comms.voice-radio-tmo`, `comms.voice-radio-dmo`, `comms.voice-radio`, `comms.cable-construction`, `comms.telephone-exchange`, `comms.fax-transmission`, `comms.data-transmission`, `comms.handheld-radio-terminal`, `kontakt.funkrufname`, `kontakt.telefon`, `kontakt.mobil`, `kontakt.email`, `kontakt.sonstiges`.

- [ ] **Step 1: Arbeitskopie vorbereiten**

Der Worktree hat kein `node_modules`.

Run: `uptime && pnpm install`
Expected: Exit 0. Dann die Pakete exakt gepinnt als Entwicklungsabhängigkeit:

Run: `pnpm add -D -w --save-exact @einsatzzeichen/catalog@1.5.0 @einsatzzeichen/core@3.0.0 @einsatzzeichen/schema@3.0.0`
Expected: `package.json` (Root) führt die drei unter `devDependencies` ohne `^`. Das `-w` ist Pflicht: das Repo ist seit 0b7733d4 ein pnpm-Workspace (`pnpm-workspace.yaml`, `packages: ["apps/*"]`), und ohne `-w` bricht pnpm mit `ERR_PNPM_ADDING_TO_ROOT` ab (frühere Pläne mit nacktem `pnpm add` stammen aus der Zeit davor). `catalog` 1.5.0 bringt seine eigenen `core`/`schema` 1.5.0 verschachtelt mit — das ist bekannt und wird im Generat vermerkt.

Danach die Next-Guides lesen, die diese Phase braucht: `node_modules/next/dist/docs/01-app/03-api-reference/02-components/font.md` (Abschnitt `next/font/local`, `src`, `variable`, `display`) und `node_modules/next/dist/docs/01-app/01-getting-started/` zu Layouts/Route Groups/dynamischen Segmenten.

- [ ] **Step 2: Die Grenztests schreiben**

`K/grenze.test.ts`:
```ts
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
      ["_lib/layout/", "_lib/plan/", "_lib/beispiele/", "_ui/zeichnung/"].some((o) => relative(MODUL, p).startsWith(o)),
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
});
```

(Gegenprobe beim ersten Grünlauf von Task 20: in `Betrachter.tsx` vorübergehend `import { symboleFuer } from "../../_lib/zeichen/zeichen";` ergänzen → der dritte Fall wird rot und nennt die Datei; wieder entfernen.)

`K/_lib/zeichen/generat.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ARIMO_TEXT_METRICS, RECIPES, TEXT_FONT_BOLD_SHA256, TEXT_FONT_SHA256 } from "@einsatzzeichen/catalog";
import zeichen from "./zeichen.generiert.json";
import grundlagen from "./grundlagen.generiert.json";

const ORDNER = "src/app/m/kommplan/_lib/zeichen";
const sha = (pfad: string) => createHash("sha256").update(readFileSync(pfad)).digest("hex");

describe("kommplan-Generat", () => {
  it("entspricht dem installierten Paketstand (neu erzeugt, byteweise verglichen)", () => {
    // Schreibt in einen Wegwerfordner, NIE in die eingecheckte Datei: ein Wächter, der die
    // Abweichung selbst wegschreibt, wäre genau einmal rot (Vorbild: der alte zeichen-Generator).
    const ziel = mkdtempSync(join(tmpdir(), "kommplan-generat-"));
    try {
      execFileSync("pnpm", ["exec", "tsx", "scripts/kommplan-zeichen-generat.ts", ziel], { stdio: "pipe" });
      for (const datei of ["zeichen.generiert.json", "grundlagen.generiert.json"]) {
        expect(
          readFileSync(join(ziel, datei), "utf8") === readFileSync(join(ORDNER, datei), "utf8"),
          `${datei} ist veraltet — pnpm exec tsx scripts/kommplan-zeichen-generat.ts`,
        ).toBe(true);
      }
    } finally {
      rmSync(ziel, { recursive: true, force: true });
    }
  }, 120_000);

  it("vermerkt fünf aufgelöste Paketversionen, in beiden Dateien gleich", () => {
    expect(zeichen.stand).toEqual(grundlagen.stand);
    for (const v of Object.values(zeichen.stand)) expect(v).toMatch(/^\d+\.\d+\.\d+/);
    expect(Object.keys(zeichen.stand).sort()).toEqual(["catalog", "catalogCore", "catalogSchema", "core", "schema"]);
  });

  it("trägt jedes Hauptrezept und die vier Zusatzzeichen", () => {
    const haupt = Object.keys(RECIPES).filter((k) => !k.includes("#"));
    const schluessel = Object.keys(zeichen.zeichen);
    expect(schluessel.length).toBe(haupt.length + 4);
    for (const k of haupt) expect(schluessel).toContain(`rezept:${k}`);
    for (const k of ["zusatz:eal", "zusatz:ea", "zusatz:stab", "zusatz:oel"]) expect(schluessel).toContain(k);
    const eintrag = (k: string) => (zeichen.zeichen as Record<string, { inhalt: string }>)[k].inhalt;
    expect(eintrag("rezept:D.1.4")).toContain(">EL<");
    expect(eintrag("zusatz:eal")).toContain(">EAL<");
    expect(eintrag("zusatz:eal")).not.toContain("Nord");
  });

  it("jede SVG-ID ist über beide Generate eindeutig (Befund M11)", () => {
    const alle = [
      ...Object.values(zeichen.zeichen as Record<string, { inhalt: string }>),
      ...Object.values(grundlagen.piktogramme as Record<string, { inhalt: string }>),
    ].flatMap((e) => [...e.inhalt.matchAll(/\bid="([^"]+)"/g)].map((m) => m[1]));
    expect(new Set(alle).size).toBe(alle.length);
  });

  it("kein Symbol trägt font-family, title oder desc — die Schrift erbt es vom <svg>", () => {
    for (const e of [
      ...Object.values(zeichen.zeichen as Record<string, { inhalt: string }>),
      ...Object.values(grundlagen.piktogramme as Record<string, { inhalt: string }>),
    ]) {
      expect(e.inhalt).not.toMatch(/font-family|<title|<desc/);
    }
  });

  it("die kopierten Schriften sind die des Katalogs", () => {
    expect(sha("src/app/m/kommplan/_fonts/Arimo-Variable.ttf")).toBe(TEXT_FONT_SHA256);
    expect(sha("src/app/m/kommplan/_fonts/Arimo-Bold.ttf")).toBe(TEXT_FONT_BOLD_SHA256);
  });

  it("die Vorschübe stimmen mit ARIMO_TEXT_METRICS überein (normal und fett)", () => {
    const upem = grundlagen.metrik.einheitenProEm;
    const normal = grundlagen.metrik.normal.vorschub as Record<string, number>;
    const fett = grundlagen.metrik.fett.vorschub as Record<string, number>;
    for (let cp = 32; cp < 0x250; cp++) {
      const erwartet = ARIMO_TEXT_METRICS.advanceEm(cp);
      if (erwartet === undefined) { expect(normal[String(cp)]).toBeUndefined(); continue; }
      expect(normal[String(cp)] / upem).toBeCloseTo(erwartet, 12);
      expect(fett[String(cp)] / upem).toBeCloseTo(ARIMO_TEXT_METRICS.bold!.advanceEm(cp)!, 12);
    }
  });
});
```

(`ARIMO_TEXT_METRICS.bold` ist im Katalog gesetzt; ist der Typ dort optional, bleibt das `!` stehen.)

- [ ] **Step 3: Rot sehen**

Run: `pnpm vitest run src/app/m/kommplan`
Expected: `grenze.test.ts` PASS (es gibt noch nichts zu verletzen); `generat.test.ts` FAIL mit `Failed to resolve import "./zeichen.generiert.json"`.

- [ ] **Step 4: Generator schreiben**

`scripts/kommplan-zeichen-generat.ts`:
```ts
/**
 * Erzeugt die zwei eingecheckten Generate des Moduls kommplan und kopiert Arimo.
 *
 * WARUM EINGECHECKT: eine frische Arbeitskopie muss ohne Vorlauf `typecheck` und `vitest` bestehen,
 * und `@einsatzzeichen/*` sind devDependencies — der Server-Graph darf sie nie laden (Befund M1:
 * `catalog/dist/src/fonts.js` ruft `fileURLToPath(new URL(…))` auf Modulebene). Drift fängt
 * `_lib/zeichen/generat.test.ts`: er erzeugt neu in einen Wegwerfordner und vergleicht byteweise.
 *
 * WARUM ZWEI DATEIEN: `zeichen.generiert.json` (alle Rezepte als fertiges SVG) liest nur der Server;
 * `grundlagen.generiert.json` (Arimo-Metriken, Piktogramme) braucht auch der Browser, weil der
 * Betrachter das Layout selbst rechnet.
 *
 * KEIN DATUM IM GENERAT: sonst wäre der Drift-Vergleich am nächsten Tag rot.
 *
 * Lauf: pnpm exec tsx scripts/kommplan-zeichen-generat.ts [zielordner]
 */
import { copyFileSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import {
  ALL_PICTOGRAMS,
  RECIPES,
  TEXT_FONT_BOLD_PATH,
  TEXT_FONT_PATH,
  composeFromCatalog,
} from "@einsatzzeichen/catalog";
import { renderSvg } from "@einsatzzeichen/core";

const STANDARD_ZIEL = "src/app/m/kommplan/_lib/zeichen";
const FONT_ZIEL = "src/app/m/kommplan/_fonts";
const ZIEL = process.argv[2] ?? STANDARD_ZIEL;
const istProbelauf = process.argv[2] !== undefined;

export class GeneratFehler extends Error {
  constructor(nachricht: string) {
    super(`kommplan-Generat: ${nachricht}. Paketstand prüfen und den Generator anpassen.`);
    this.name = "GeneratFehler";
  }
}

type Anforderer = ReturnType<typeof createRequire>;
const hier: Anforderer = createRequire(import.meta.url);

/** Paketwurzel aus dem Einstiegspunkt — `package.json` ist über `exports` nicht erreichbar. */
function wurzel(einstieg: string, endung: RegExp): string {
  const w = einstieg.replace(endung, "");
  if (w === einstieg) throw new GeneratFehler(`Einstiegspunkt liegt unerwartet unter ${einstieg}`);
  return w;
}
const katalogEinstieg = hier.resolve("@einsatzzeichen/catalog");
const KATALOG = wurzel(katalogEinstieg, /dist[/\\]src[/\\]index\.js$/);
const ausKatalog: Anforderer = createRequire(katalogEinstieg);
const kern = (von: Anforderer, name: string) => wurzel(von.resolve(name), /dist[/\\]index\.js$/);
const version = (w: string) => (JSON.parse(readFileSync(join(w, "package.json"), "utf8")) as { version: string }).version;

const STAND = {
  catalog: version(KATALOG),
  catalogCore: version(kern(ausKatalog, "@einsatzzeichen/core")),
  catalogSchema: version(kern(ausKatalog, "@einsatzzeichen/schema")),
  core: version(kern(hier, "@einsatzzeichen/core")),
  schema: version(kern(hier, "@einsatzzeichen/schema")),
};

type Symbol = { viewBox: string; inhalt: string };
const runde = (v: number) => Math.round(v * 1000) / 1000;

/** Äußeres <svg> abnehmen, title/desc und font-family entfernen (die Schrift erbt vom Plan-<svg>). */
function zerlege(svg: string, schluessel: string): Symbol {
  const kopf = /^<svg\b[^>]*\bviewBox="([^"]+)"[^>]*>/.exec(svg);
  if (!kopf || !svg.endsWith("</svg>")) throw new GeneratFehler(`${schluessel}: SVG ohne erwartete Hülle`);
  const inhalt = svg
    .slice(kopf[0].length, -"</svg>".length)
    .replace(/<title\b[^>]*>[\s\S]*?<\/title>/g, "")
    .replace(/<desc\b[^>]*>[\s\S]*?<\/desc>/g, "")
    .replace(/\sfont-family="[^"]*"/g, "");
  return { viewBox: kopf[1], inhalt };
}
const praefix = (roh: string) => `kpz-${roh.replace(/[^A-Za-z0-9]/g, "-")}`;
type Spec = Parameters<typeof composeFromCatalog>[0];
type Zeichnung = Parameters<typeof renderSvg>[0];

// 1. Rezepte (ohne #alternative) und Zusatzzeichen.
const zeichen: Record<string, Symbol & { titel: string; suchtext: string }> = {};
for (const [abschnitt, rezept] of Object.entries(RECIPES)) {
  if (abschnitt.includes("#")) continue;
  const schluessel = `rezept:${abschnitt}`;
  // Katalog 1.5.0 zeichnet mit seinem verschachtelten core 1.5.0, gerendert wird mit core 3.0.0 (Wurzel):
  // zur Laufzeit geprüft (Planungssitzung), die Typen der zwei Major-Stände passen nicht zusammen.
  const zeichnung = composeFromCatalog(rezept.spec as Spec, rezept.title) as unknown as Zeichnung;
  const svg = renderSvg(zeichnung, { size: 64, idPrefix: praefix(abschnitt) });
  zeichen[schluessel] = {
    titel: rezept.title,
    suchtext: `${rezept.title} ${abschnitt}`.toLocaleLowerCase("de-DE"),
    ...zerlege(svg, schluessel),
  };
}
const ZUSATZ = [
  { schluessel: "zusatz:eal", titel: "Einsatzabschnittsleitung", text: "EAL" },
  { schluessel: "zusatz:ea", titel: "Einsatzabschnitt", text: "EA" },
  { schluessel: "zusatz:stab", titel: "Stab", text: "Stab" },
  { schluessel: "zusatz:oel", titel: "Örtliche Einsatzleitung", text: "ÖEL" },
] as const;
for (const z of ZUSATZ) {
  const spec = { kind: "formation", organization: "fuehrung-leitung", labels: { center: z.text } } as unknown as Spec;
  const svg = renderSvg(composeFromCatalog(spec, z.titel) as unknown as Zeichnung, { size: 64, idPrefix: praefix(z.schluessel) });
  zeichen[z.schluessel] = { titel: z.titel, suchtext: `${z.titel} ${z.text}`.toLocaleLowerCase("de-DE"), ...zerlege(svg, z.schluessel) };
}

// 2. Piktogramme: Katalog auf seine Box zugeschnitten, dazu fünf eigene für die Kontaktarten.
const KATALOG_PIKTOGRAMME = [
  "comms.voice-radio-tmo", "comms.voice-radio-dmo", "comms.voice-radio", "comms.cable-construction",
  "comms.telephone-exchange", "comms.fax-transmission", "comms.data-transmission", "comms.handheld-radio-terminal",
] as const;
const piktogramme: Record<string, Symbol> = {};
for (const id of KATALOG_PIKTOGRAMME) {
  const p = ALL_PICTOGRAMS.find((x) => x.id === id && x.variant === "primary");
  if (!p) throw new GeneratFehler(`Piktogramm ${id} fehlt im Katalog`);
  const svg = renderSvg({ viewBox: p.viewBox, children: p.primitives } as unknown as Zeichnung, { size: 32, idPrefix: praefix(id) });
  const roh = zerlege(svg, id);
  const f = Number(roh.viewBox.split(/\s+/)[2]) / p.viewBox.width;
  if (!Number.isFinite(f) || f <= 0) throw new GeneratFehler(`${id}: unerwartete viewBox ${roh.viewBox}`);
  piktogramme[id] = {
    viewBox: [p.box.xMm, p.box.yMm, p.box.widthMm, p.box.heightMm].map((v) => runde(v * f)).join(" "),
    inhalt: roh.inhalt,
  };
}
const S = 'stroke="#000" stroke-width="1.5" fill="none"';
const EIGENE: Record<string, string> = {
  // Die Raute der Excel-Vorlage: Kontur mit gefüllter Spitze.
  "kontakt.funkrufname": `<path d="M12 3 21 12 12 21 3 12Z" ${S}/><path d="M12 3 16.5 7.5H7.5Z" fill="#000"/>`,
  "kontakt.telefon": `<path d="M7 4C5.5 4 4 5.5 4 7c0 7 6 13 13 13 1.5 0 3-1.5 3-3l-3.5-2.5-2.5 2c-2.5-1-5.5-4-6.5-6.5l2-2.5Z" ${S} stroke-linejoin="round"/>`,
  "kontakt.mobil": `<rect x="7" y="2.5" width="10" height="19" rx="1.5" ${S}/><path d="M10 18.5h4" ${S}/>`,
  "kontakt.email": `<rect x="3" y="5.5" width="18" height="13" rx="1" ${S}/><path d="M3.5 6.5 12 13l8.5-6.5" ${S}/>`,
  "kontakt.sonstiges": `<circle cx="6" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="18" cy="12" r="1.6"/>`,
};
for (const [id, inhalt] of Object.entries(EIGENE)) piktogramme[id] = { viewBox: "0 0 24 24", inhalt };

// 3. Arimo-Metriken aus den JSON-Assets des Katalogs (dieselbe Quelle wie ARIMO_TEXT_METRICS).
type MetrikDatei = {
  unitsPerEm: number; ascender: number; descender: number; notdefAdvance: number;
  advances: Record<string, number>; kerning: Record<string, Record<string, number>>;
};
const lies = (datei: string) => JSON.parse(readFileSync(join(KATALOG, "dist/assets", datei), "utf8")) as MetrikDatei;
const normal = lies("arimo-metrics.json");
const fett = lies("arimo-bold-metrics.json");
if (normal.unitsPerEm !== fett.unitsPerEm) throw new GeneratFehler("normal und fett haben verschiedene unitsPerEm");
const sortiert = <T,>(o: Record<string, T>) => Object.fromEntries(Object.keys(o).sort((a, b) => Number(a) - Number(b)).map((k) => [k, o[k]]));
const metrik = {
  einheitenProEm: normal.unitsPerEm,
  aufstieg: normal.ascender,
  abstieg: -normal.descender,
  ersatz: normal.advances["65533"] ?? normal.notdefAdvance,
  normal: { vorschub: sortiert(normal.advances), unterschneidung: sortiert(normal.kerning) },
  fett: { vorschub: sortiert(fett.advances), unterschneidung: sortiert(fett.kerning) },
};

// 4. Schreiben — sortiert, ohne Datum, atomar (Zwischendatei im selben Ordner, dann rename).
const nachSchluessel = <T,>(o: Record<string, T>) => Object.fromEntries(Object.keys(o).sort().map((k) => [k, o[k]]));
function schreibe(datei: string, wert: unknown): void {
  const pfad = join(ZIEL, datei);
  writeFileSync(`${pfad}.tmp`, `${JSON.stringify(wert)}\n`, "utf8");
  renameSync(`${pfad}.tmp`, pfad);
}
mkdirSync(ZIEL, { recursive: true });
schreibe("zeichen.generiert.json", { stand: STAND, zeichen: nachSchluessel(zeichen) });
schreibe("grundlagen.generiert.json", { stand: STAND, metrik, piktogramme: nachSchluessel(piktogramme) });

// 5. Arimo kopieren — nur im kanonischen Lauf, ein Probelauf fasst den Arbeitsbaum nicht an.
if (!istProbelauf) {
  mkdirSync(FONT_ZIEL, { recursive: true });
  copyFileSync(TEXT_FONT_PATH, join(FONT_ZIEL, "Arimo-Variable.ttf"));
  copyFileSync(TEXT_FONT_BOLD_PATH, join(FONT_ZIEL, "Arimo-Bold.ttf"));
  copyFileSync(join(KATALOG, "dist/assets/Arimo-OFL.txt"), join(FONT_ZIEL, "Arimo-OFL.txt"));
}
console.log(`${ZIEL}: ${Object.keys(zeichen).length} Zeichen, ${Object.keys(piktogramme).length} Piktogramme, Stand ${JSON.stringify(STAND)}`);
```

Hinweis: `Arimo-Variable.ttf` statt `Arimo[wght].ttf` — eckige Klammern im Dateinamen sind in `next/font/local`-Pfaden ein unnötiges Risiko. `.ttf` liegt nicht in Git LFS (`.gitattributes` führt nur Bildformate).

- [ ] **Step 5: Generat erzeugen und ansehen**

Run: `pnpm exec tsx scripts/kommplan-zeichen-generat.ts`
Expected: eine Zeile `src/app/m/kommplan/_lib/zeichen: 236 Zeichen, 13 Piktogramme, Stand {"catalog":"1.5.0","catalogCore":"1.5.0","catalogSchema":"1.5.0","core":"3.0.0","schema":"3.0.0"}` (die Zahl 236 = 232 Hauptrezepte + 4; weicht sie ab, zählt der Test gegen `RECIPES` und nicht gegen diese Zahl). Wirft der Lauf einen `CompositionError` für ein Zusatzzeichen, das Zeichen aus `ZUSATZ` entfernen und in der Abweichungsliste oben nachtragen, nicht den Text kürzen.

Run: `ls -la src/app/m/kommplan/_lib/zeichen src/app/m/kommplan/_fonts`
Expected: `zeichen.generiert.json` ≈ 200–260 KB (Probelauf der Planung mit derselben Zerlegung: 222 KB für die 232 Hauptrezepte, dazu die vier Zusatzzeichen), `grundlagen.generiert.json` ≈ 20–60 KB (Metriken und 13 Piktogramme; der Probelauf ohne die fünf eigenen Piktogramme: 20 KB), drei Schriftdateien. Weicht die Größe stark ab, zuerst prüfen, ob `<title>`/`<desc>`/`font-family` wirklich entfernt sind — nicht die Erwartung verschieben.

- [ ] **Step 6: Grün sehen**

Run: `pnpm vitest run src/app/m/kommplan && pnpm typecheck`
Expected: PASS; Typecheck Exit 0 (auch `scripts/` wird geprüft).

- [ ] **Step 7: Commit**

```bash
git add package.json pnpm-lock.yaml scripts/kommplan-zeichen-generat.ts src/app/m/kommplan/_lib/zeichen src/app/m/kommplan/_fonts src/app/m/kommplan/grenze.test.ts
git commit -S -m "feat(kommplan): Zeichen-Generat mit Arimo-Metriken und Piktogrammen" -m "Alle Rezepte aus @einsatzzeichen/catalog 1.5.0 als fertige Symbole, vier Zusatzzeichen (EAL, EA, Stab, ÖEL), die Kommunikations- und Kontaktpiktogramme und die Arimo-Metriken. Die Pakete bleiben devDependencies; ein Drift-Test erzeugt neu und vergleicht byteweise." -m "DRK-500" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Grundlagen-Zugriff, Maße und Textmessung

**Files:**
- Create: `K/_lib/zeichen/grundlagen.ts`, `K/_lib/layout/masse.ts`, `K/_lib/layout/text.ts`
- Test: `K/_lib/layout/text.test.ts`, `K/_lib/layout/masse.test.ts`

**Interfaces:**
- Consumes: `grundlagen.generiert.json` (Task 1).
- Produces:
  - `grundlagen.ts`: `METRIK` (Typ `Metrik`), `PIKTOGRAMME: Readonly<Record<string, Symbolquelle>>` mit `Symbolquelle = { viewBox: string; inhalt: string }`, `KONTAKT_PIKTOGRAMM` (Schlüssel = die sieben Kontaktarten), `VERBINDUNG_PIKTOGRAMM` (Schlüssel = die acht Verbindungsarten). Dass die Schlüssel genau zu `KONTAKT_ARTEN`/`VERBINDUNGS_ARTEN` passen, prüft Task 3.
  - `masse.ts`: `PT_IN_MM`, `SCHRIFT`, `ZEILENFAKTOR`, `MINDESTSCHRIFT_PT`, `KLEINSTE_SCHRIFT_PT`, `MIN_MASSSTAB`, `KARTE`, `EINHEIT`, `KANAL`, `ABZEICHEN`, `SECHSECK`, `STIEL`, `ABSTAND`, `MINDEST`, `PAPIER`, `BLATT`, `zeilenhoehe(pt)`, `lueckeFuer(j)`.
  - `text.ts`: `textBreite(text: string, pt: number, fett?: boolean): number` (mm), `grundlinie(oben: number, hoehe: number, pt: number): number`, `umbrechen(text: string, maxBreite: number, pt: number, fett: boolean, maxZeilen: number): { zeilen: string[]; gekuerzt: boolean }`, `kuerze(text: string, maxBreite: number, pt: number, fett: boolean): { text: string; gekuerzt: boolean }`.

- [ ] **Step 1: Failing tests**

`K/_lib/layout/masse.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { KLEINSTE_SCHRIFT_PT, MIN_MASSSTAB, SCHRIFT, lueckeFuer, zeilenhoehe } from "./masse";

describe("Maße", () => {
  it("die kleinste Schrift der Zeichnung ist 8 pt, also Mindestmaßstab 0,75", () => {
    expect(KLEINSTE_SCHRIFT_PT).toBe(Math.min(...Object.values(SCHRIFT)));
    expect(KLEINSTE_SCHRIFT_PT).toBe(8);
    expect(MIN_MASSSTAB).toBeCloseTo(0.75, 10);
  });
  it("Zeilenhöhe = Schriftgröße in mm × 1,15", () => {
    expect(zeilenhoehe(8)).toBeCloseTo(8 * (25.4 / 72) * 1.15, 10);
  });
  it("Ebenenlücke: 15,5 mm, je weiterem Knick 1,5 mm mehr", () => {
    expect(lueckeFuer(0)).toBeCloseTo(15.5, 10);
    expect(lueckeFuer(1)).toBeCloseTo(15.5, 10);
    expect(lueckeFuer(3)).toBeCloseTo(18.5, 10);
  });
});
```

`K/_lib/layout/text.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { ARIMO_TEXT_METRICS } from "@einsatzzeichen/catalog";
import { PT_IN_MM } from "./masse";
import { grundlinie, kuerze, textBreite, umbrechen } from "./text";

/** Unabhängige Referenz über das Paket selbst (nur im Test erlaubt). */
function referenz(text: string, pt: number, fett = false): number {
  const m = fett ? ARIMO_TEXT_METRICS.bold! : ARIMO_TEXT_METRICS;
  const cps = [...text].map((c) => c.codePointAt(0)!);
  let em = 0;
  cps.forEach((cp, i) => {
    em += m.advanceEm(cp) ?? 0;
    // `kerningEm` ist in der Schnittstelle (core 1.5.0, verschachtelt im Katalog) OPTIONAL —
    // ohne `?.` bricht `pnpm typecheck` mit TS2722, während Vitest grün bleibt.
    if (i > 0) em += m.kerningEm?.(cps[i - 1], cp) ?? 0;
  });
  return em * pt * PT_IN_MM;
}

describe("textBreite", () => {
  it.each(["Leitstelle Uelzen", "RK UE 40-05-1", "fel@landkreis-uelzen.de", "ÖEL Fußstreife", "AV Tê"])(
    "%s misst wie ARIMO_TEXT_METRICS (normal und fett)",
    (t) => {
      expect(textBreite(t, 8)).toBeCloseTo(referenz(t, 8), 9);
      expect(textBreite(t, 9.5, true)).toBeCloseTo(referenz(t, 9.5, true), 9);
    },
  );
  it("wächst linear mit der Schriftgröße", () => {
    expect(textBreite("Stab", 16)).toBeCloseTo(2 * textBreite("Stab", 8), 9);
  });
  it("leerer Text ist 0 breit", () => expect(textBreite("", 8)).toBe(0));
  it("Zeichen außerhalb des Subsets (Emoji, CJK) werfen nicht und bekommen eine Breite > 0", () => {
    expect(textBreite("🚑", 8)).toBeGreaterThan(0);
    expect(textBreite("救护车", 8)).toBeGreaterThan(0);
  });
});

describe("umbrechen", () => {
  it("bricht an Wortgrenzen", () => {
    const r = umbrechen("EA 2 Notunterkunft 2. Sternschule", 32, 9.5, true, 3);
    expect(r.zeilen.length).toBeGreaterThan(1);
    expect(r.zeilen.join(" ")).toBe("EA 2 Notunterkunft 2. Sternschule");
    for (const z of r.zeilen) expect(textBreite(z, 9.5, true)).toBeLessThanOrEqual(32 + 1e-9);
    expect(r.gekuerzt).toBe(false);
  });
  it("bricht ein überlanges Wort bevorzugt nach - / @ . _", () => {
    // bei 22 mm passt „fel@landkreis-uel"; die letzte Bruchstelle darin ist der Bindestrich
    const r = umbrechen("fel@landkreis-uelzen.de", 22, 8, false, 2);
    expect(r.zeilen).toEqual(["fel@landkreis-", "uelzen.de"]);
  });
  it("bricht ein Wort ohne Bruchstelle hart und verliert kein Zeichen", () => {
    const r = umbrechen("Bereitstellungsraumkoordinationsstelle", 20, 9.5, true, 10);
    expect(r.zeilen.length).toBeGreaterThan(1);
    for (const z of r.zeilen) expect(textBreite(z, 9.5, true)).toBeLessThanOrEqual(20 + 1e-9);
    expect(r.zeilen.join("")).toBe("Bereitstellungsraumkoordinationsstelle");
    expect(r.gekuerzt).toBe(false);
  });
  it("kürzt nach maxZeilen mit … und meldet es", () => {
    const r = umbrechen("eins zwei drei vier fünf sechs sieben acht neun zehn elf zwölf", 15, 9.5, true, 3);
    expect(r.zeilen).toHaveLength(3);
    expect(r.zeilen[2].endsWith("…")).toBe(true);
    expect(textBreite(r.zeilen[2], 9.5, true)).toBeLessThanOrEqual(15 + 1e-9);
    expect(r.gekuerzt).toBe(true);
  });
  it("leerer Text ergibt eine leere Zeile", () => {
    expect(umbrechen("", 30, 8, false, 2)).toEqual({ zeilen: [""], gekuerzt: false });
  });
  it("mehrfache Leerzeichen und Zeilenumbrüche werden zu einem Leerzeichen", () => {
    expect(umbrechen("  A \n  B  ", 30, 8, false, 2).zeilen).toEqual(["A B"]);
  });
});

describe("kuerze / grundlinie", () => {
  it("lässt passenden Text unverändert", () => expect(kuerze("RTW", 40, 8, false)).toEqual({ text: "RTW", gekuerzt: false }));
  it("kürzt mit … auf die Breite", () => {
    const r = kuerze("KTW RK UE 41-92-12 mit sehr langem Anhang", 20, 8, false);
    expect(r.gekuerzt).toBe(true);
    expect(r.text.endsWith("…")).toBe(true);
    expect(textBreite(r.text, 8)).toBeLessThanOrEqual(20 + 1e-9);
  });
  it("die Grundlinie liegt innerhalb der Zeile und unterhalb der Mitte", () => {
    const y = grundlinie(10, 4.5, 8);
    expect(y).toBeGreaterThan(12.25);
    expect(y).toBeLessThan(14.5);
  });
});
```

- [ ] **Step 2: Rot sehen**

Run: `pnpm vitest run src/app/m/kommplan/_lib/layout`
Expected: FAIL — `Failed to resolve import "./masse"`/`"./text"`.

- [ ] **Step 3: Implementieren**

`K/_lib/zeichen/grundlagen.ts`:
```ts
import roh from "./grundlagen.generiert.json";

/**
 * Das kleine, geteilte Generat: Arimo-Metriken und Piktogramme. Server UND Browser laden es
 * (der Betrachter rechnet das Layout selbst). Das große Rezept-Generat liegt in `zeichen.ts`
 * und gehört allein dem Server (`grenze.test.ts`).
 */
export interface Schnitt {
  readonly vorschub: Readonly<Record<string, number>>;
  readonly unterschneidung: Readonly<Record<string, Readonly<Record<string, number>>>>;
}
export interface Metrik {
  readonly einheitenProEm: number;
  readonly aufstieg: number;
  readonly abstieg: number;
  readonly ersatz: number;
  readonly normal: Schnitt;
  readonly fett: Schnitt;
}
export interface Symbolquelle { readonly viewBox: string; readonly inhalt: string }

export const METRIK: Metrik = roh.metrik as Metrik;
export const PIKTOGRAMME: Readonly<Record<string, Symbolquelle>> = roh.piktogramme as Record<string, Symbolquelle>;

/** Kontaktart → Piktogramm (Spec §7). Reihenfolge der Arten: `plan/kontakte.ts`. */
export const KONTAKT_PIKTOGRAMM = {
  funkrufname: "kontakt.funkrufname",
  digitalfunk: "comms.handheld-radio-terminal",
  telefon: "kontakt.telefon",
  mobil: "kontakt.mobil",
  fax: "comms.fax-transmission",
  email: "kontakt.email",
  sonstiges: "kontakt.sonstiges",
} as const satisfies Record<string, string>;

/** Verbindungsart → Piktogramm im Sechseck. */
export const VERBINDUNG_PIKTOGRAMM = {
  tmo: "comms.voice-radio-tmo",
  dmo: "comms.voice-radio-dmo",
  analogfunk: "comms.voice-radio",
  draht: "comms.cable-construction",
  telefon: "comms.telephone-exchange",
  mobil: "kontakt.mobil",
  fax: "comms.fax-transmission",
  daten: "comms.data-transmission",
} as const satisfies Record<string, string>;
```

`K/_lib/layout/masse.ts`:
```ts
/**
 * ALLE MASSE DER LAYOUT-ENGINE — Layout-Millimeter bei Maßstab 1, Schrift in pt.
 *
 * Abgeleitet aus den Referenzbildern der Excel-Vorlage (A4 quer, 150 dpi) und um 4/3
 * vergrößert: die Vorlage setzt ihre Schrift bei etwa 6 pt, die Engine rechnet mit 8 pt als
 * kleinster Schrift. Auf A4 landen die Vorlagenpläne so bei Maßstab ≈ 0,82 — dieselbe
 * Anmutung wie heute und Luft bis zur Mindestschrift. Herleitung: Umsetzungsplan Phase 1,
 * Abschnitt „Maße".
 */
export const PT_IN_MM = 25.4 / 72;
export const ZEILENFAKTOR = 1.15;
export const SCHRIFT = { titel: 9.5, leiter: 8, kontakt: 8, einheit: 8, sechseck: 8, abzeichen: 8, verweis: 8 } as const;
export const MINDESTSCHRIFT_PT = 6;
export const KLEINSTE_SCHRIFT_PT = Math.min(...Object.values(SCHRIFT));
/** Kleiner darf eine Zeichnung auf Papier nicht werden, sonst unterschreitet Text 6 pt. */
export const MIN_MASSSTAB = MINDESTSCHRIFT_PT / KLEINSTE_SCHRIFT_PT;

export const KARTE = {
  breite: 46, rand: 1.2, zeichen: 10, titelX: 12.5, innenRechts: 1.5,
  kopfMin: 12, titelZeilenMax: 3,
  kontaktHoehe: 4.5, piktoSpalte: 8, piktoGroesse: 3.6, wertX: 9.5, kontaktZeilenMax: 2,
} as const;
export const EINHEIT = { abstandOben: 2.5, hoehe: 4.2, takt: 5.5, breite: 40, einzugMin: 6, zweiSpaltenAb: 10, spaltenAbstand: 2, zeichen: 3.6 } as const;
/** Kanal-Sechsecke einer Stelle (Abweichung 12): untereinander in der Gasse, über den Einheiten. */
export const KANAL = { takt: 7.5 } as const;
export const ABZEICHEN = { breite: 22, hoehe: 4.5, abstand: 1.5 } as const;
export const SECHSECK = { hoehe: 6, spitze: 3, piktoBreite: 7, piktoHoehe: 4, innen: 1.5, minBreite: 26, maxBreite: 44, fase: 1.5 } as const;
export const STIEL = {
  ersterKnick: 2, knickTakt: 1.5, zuSechseck: 1.5, sechseckZuBus: 2, busZuKarte: 4,
  gasseStart: 1.5, gasseTakt: 1.5,
} as const;
export const ABSTAND = {
  geschwister: 8, gruppen: 12, wurzeln: 16, kammReihe: 8, kammEinzug: 3,
  seiteSchiene: 3, seiteLuft: 3, seiteOhneSechseck: 6, seitenStapel: 4,
} as const;
/**
 * Was die Geometrieprüfung (`pruefung.ts`) mindestens verlangt — und was das Packen deshalb
 * einhält (`kontur.ts`, `LUFT_Y`): Kästen verschiedener Stellen 2 mm, parallele Linien
 * verschiedener Netze 0,75 mm.
 */
export const MINDEST = { kasten: 2, linie: 0.75 } as const;
export const PAPIER = { "a4-quer": { breite: 297, hoehe: 210 }, "a3-quer": { breite: 420, hoehe: 297 } } as const;
export const BLATT = { randX: 10, randOben: 8, randUnten: 8, kopf: 14, fuss: 7, legendeZeile: 5, legendeRand: 2 } as const;

export function zeilenhoehe(pt: number): number {
  return pt * PT_IN_MM * ZEILENFAKTOR;
}

/**
 * Höhe zwischen Zeilenunterkante und Kartenoberkante der nächsten Ebene. `j` = größte Zahl von
 * Knicken, die ein Stiel dieser Ebene braucht (Gruppenzahl − 1). Aufbau: erster Knick, weitere
 * Knicke im Takt, Luft bis zum Sechseck, Sechseck, Luft bis zum Bus, Bus bis Karte.
 */
export function lueckeFuer(j: number): number {
  return STIEL.ersterKnick + Math.max(0, j - 1) * STIEL.knickTakt + STIEL.zuSechseck
    + SECHSECK.hoehe + STIEL.sechseckZuBus + STIEL.busZuKarte;
}
```

`K/_lib/layout/text.ts`:
```ts
import { METRIK, type Schnitt } from "../zeichen/grundlagen";
import { PT_IN_MM } from "./masse";

/**
 * Textmessung ohne DOM: Server und Browser rechnen dieselben Breiten (Spec §5.1). Gerendert
 * wird in Arimo — dieselbe Schrift, aus der die Vorschübe stammen.
 */
const AUSLASSUNG = "…";
const BRUCHSTELLEN = new Set(["-", "/", "@", ".", "_"]);

function vorschub(s: Schnitt, cp: number): number {
  return s.vorschub[String(cp)] ?? METRIK.ersatz;
}

export function textBreite(text: string, pt: number, fett = false): number {
  const s = fett ? METRIK.fett : METRIK.normal;
  let summe = 0;
  let vorher: number | null = null;
  for (const zeichen of text) {
    const cp = zeichen.codePointAt(0)!;
    summe += vorschub(s, cp);
    if (vorher !== null) summe += s.unterschneidung[String(vorher)]?.[String(cp)] ?? 0;
    vorher = cp;
  }
  return (summe / METRIK.einheitenProEm) * pt * PT_IN_MM;
}

/** y der Grundlinie, wenn eine Zeile der Höhe `hoehe` bei `oben` beginnt (senkrecht zentriert). */
export function grundlinie(oben: number, hoehe: number, pt: number): number {
  const groesse = pt * PT_IN_MM;
  const auf = METRIK.aufstieg / METRIK.einheitenProEm;
  const ab = METRIK.abstieg / METRIK.einheitenProEm;
  return oben + (hoehe - (auf + ab) * groesse) / 2 + auf * groesse;
}

export function kuerze(text: string, maxBreite: number, pt: number, fett: boolean): { text: string; gekuerzt: boolean } {
  if (textBreite(text, pt, fett) <= maxBreite) return { text, gekuerzt: false };
  const zeichen = [...text];
  while (zeichen.length > 0 && textBreite(zeichen.join("").trimEnd() + AUSLASSUNG, pt, fett) > maxBreite) zeichen.pop();
  return { text: zeichen.join("").trimEnd() + AUSLASSUNG, gekuerzt: true };
}

/** Längstes Präfix von `wort`, das passt — bevorzugt bis einschließlich der letzten Bruchstelle. */
function teileWort(wort: string, maxBreite: number, pt: number, fett: boolean): [string, string] {
  const zeichen = [...wort];
  let passt = 0;
  while (passt < zeichen.length && textBreite(zeichen.slice(0, passt + 1).join(""), pt, fett) <= maxBreite) passt++;
  if (passt === 0) passt = 1; // ein einzelnes Zeichen passt immer „irgendwie" — nie endlos schleifen
  let schnitt = passt;
  for (let i = passt - 1; i > 0; i--) {
    if (BRUCHSTELLEN.has(zeichen[i - 1])) { schnitt = i; break; }
  }
  return [zeichen.slice(0, schnitt).join(""), zeichen.slice(schnitt).join("")];
}

export function umbrechen(
  text: string, maxBreite: number, pt: number, fett: boolean, maxZeilen: number,
): { zeilen: string[]; gekuerzt: boolean } {
  const woerter = text.split(/\s+/).filter((w) => w.length > 0);
  if (woerter.length === 0) return { zeilen: [""], gekuerzt: false };
  const zeilen: string[] = [];
  let aktuell = "";
  const warteschlange = [...woerter];
  while (warteschlange.length > 0) {
    const wort = warteschlange.shift()!;
    const versuch = aktuell === "" ? wort : `${aktuell} ${wort}`;
    if (textBreite(versuch, pt, fett) <= maxBreite) { aktuell = versuch; continue; }
    if (aktuell !== "") { zeilen.push(aktuell); aktuell = ""; warteschlange.unshift(wort); continue; }
    const [kopf, rest] = teileWort(wort, maxBreite, pt, fett);
    zeilen.push(kopf);
    if (rest) warteschlange.unshift(rest);
  }
  if (aktuell !== "") zeilen.push(aktuell);
  if (zeilen.length <= maxZeilen) return { zeilen, gekuerzt: false };
  const behalten = zeilen.slice(0, maxZeilen);
  const letzte = `${behalten[maxZeilen - 1]} ${zeilen.slice(maxZeilen).join(" ")}`;
  behalten[maxZeilen - 1] = kuerze(letzte, maxBreite, pt, fett).text;
  return { zeilen: behalten, gekuerzt: true };
}
```

- [ ] **Step 4: Grün sehen**

Run: `pnpm vitest run src/app/m/kommplan/_lib/layout src/app/m/kommplan/grenze.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/app/m/kommplan/_lib/zeichen/grundlagen.ts src/app/m/kommplan/_lib/layout/masse.ts src/app/m/kommplan/_lib/layout/text.ts src/app/m/kommplan/_lib/layout/masse.test.ts src/app/m/kommplan/_lib/layout/text.test.ts
git commit -S -m "feat(kommplan): Maße und Textmessung mit Arimo-Metriken" -m "Breiten, Umbruch an Bruchstellen, Kürzung mit Auslassungszeichen und Grundlinie — ohne DOM, damit Server und Browser dasselbe rechnen." -m "DRK-500" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Planschema, Invarianten und Kontaktreihenfolge

**Files:**
- Create: `K/_lib/plan/schema.ts`, `K/_lib/plan/kontakte.ts`
- Test: `K/_lib/plan/schema.test.ts`, `K/_lib/plan/kontakte.test.ts`

**Interfaces:**
- Consumes: `KONTAKT_PIKTOGRAMM`, `VERBINDUNG_PIKTOGRAMM` (Task 2) — nur im Test.
- Produces: `KONTAKT_ARTEN`, `VERBINDUNGS_ARTEN`, `LAGEN` (readonly Tupel); Typen `KontaktArt`, `VerbindungsArt`, `Lage`, `Kontakt`, `Einheit`, `Stelle`, `Verbindung`, `PlanOptionen`, `PlanInhalt`; `planInhaltSchema` (zod, mit `superRefine`); `leseInhalt(roh: unknown): { ok: true; inhalt: PlanInhalt } | { ok: false; fehler: string }`; `KONTAKT_REIHENFOLGE`, `kontaktZeilen(kontakte: readonly Kontakt[], leerzeilen: boolean): { art: KontaktArt; wert: string }[]`, `ART_NAME: Record<VerbindungsArt, string>`.

- [ ] **Step 1: Failing tests**

`K/_lib/plan/schema.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { KONTAKT_PIKTOGRAMM, VERBINDUNG_PIKTOGRAMM } from "../zeichen/grundlagen";
import { KONTAKT_ARTEN, VERBINDUNGS_ARTEN, leseInhalt, planInhaltSchema, type PlanInhalt, type Stelle } from "./schema";

const stelle = (id: string, eltern: string | null, rest: Partial<Stelle> = {}): Stelle => ({
  id, eltern, lage: "unter", reihenfolge: 0, zeichen: null, titel: id, leiter: null, hervorheben: false,
  verbindungId: null, kanaele: [], kontakte: [], einheiten: [], ...rest,
});
const plan = (stellen: Stelle[], verbindungen: PlanInhalt["verbindungen"] = []): unknown => ({
  schema: 1,
  optionen: { leerzeilen: false, vermerkVsNfD: true, qrAufDruck: false, schwarzweiss: false },
  stellen, verbindungen,
});
const fehler = (roh: unknown) => {
  const r = planInhaltSchema.safeParse(roh);
  return r.success ? [] : r.error.issues.map((i) => i.message);
};

describe("planInhaltSchema", () => {
  it("nimmt einen gültigen Baum mit Seitenstelle und Verbindung an", () => {
    expect(fehler(plan(
      [stelle("a", null), stelle("b", "a", { verbindungId: "v1" }), stelle("c", "a", { lage: "links" })],
      [{ id: "v1", art: "tmo", bezeichnung: "R_UE_2" }],
    ))).toEqual([]);
  });
  it("nimmt einen leeren Plan und mehrere Wurzeln an", () => {
    expect(fehler(plan([]))).toEqual([]);
    expect(fehler(plan([stelle("a", null), stelle("b", null)]))).toEqual([]);
  });
  it("doppelte IDs — auch zwischen Stelle, Einheit und Verbindung", () => {
    expect(fehler(plan([stelle("a", null), stelle("a", null)]))).toContain("ID doppelt: a");
    expect(fehler(plan([stelle("a", null, { einheiten: [{ id: "v1", typ: "RTW", rufname: "", zeichen: null }] })],
      [{ id: "v1", art: "tmo", bezeichnung: "x" }]))).toContain("ID doppelt: v1");
  });
  it("eltern zeigt auf eine fehlende Stelle", () => {
    expect(fehler(plan([stelle("b", "fehlt")]))).toContain("Elternstelle fehlt existiert nicht");
  });
  it("Zyklus", () => {
    expect(fehler(plan([stelle("a", "b"), stelle("b", "a")])).some((m) => m.startsWith("Zyklus"))).toBe(true);
  });
  it("Seitenstelle ohne Eltern und Seitenstelle mit Kindern", () => {
    expect(fehler(plan([stelle("a", null, { lage: "rechts" })]))).toContain("Eine Seitenstelle braucht eine Elternstelle");
    expect(fehler(plan([stelle("a", null), stelle("s", "a", { lage: "links" }), stelle("k", "s")])))
      .toContain("Seitenstelle s kann keine Stellen tragen");
  });
  it("verbindungId zeigt auf eine fehlende Verbindung", () => {
    expect(fehler(plan([stelle("a", null, { verbindungId: "vx" })]))).toContain("Verbindung vx existiert nicht");
  });
  it("Kanäle: nur vorhandene Verbindungen, keiner doppelt; fehlt das Feld, gilt []", () => {
    const v = [{ id: "v1", art: "dmo" as const, bezeichnung: "DMO 608" }];
    expect(fehler(plan([stelle("a", null, { kanaele: ["v1"] })], v))).toEqual([]);
    expect(fehler(plan([stelle("a", null, { kanaele: ["vx"] })], v))).toContain("Kanal vx existiert nicht");
    expect(fehler(plan([stelle("a", null, { kanaele: ["v1", "v1"] })], v))).toContain("Kanal v1 doppelt an a");
    const ohneFeld = { ...stelle("a", null) } as Partial<Stelle>;
    delete ohneFeld.kanaele;
    const r = planInhaltSchema.safeParse(plan([ohneFeld as Stelle]));
    expect(r.success && r.data.stellen[0].kanaele).toEqual([]);
  });
  it("lehnt falsche Schemaversion, fremde Felder und unbekannte Arten ab", () => {
    expect(fehler({ ...(plan([]) as object), schema: 2 })).not.toEqual([]);
    expect(fehler(plan([stelle("a", null, { kontakte: [{ art: "brieftaube" as never, wert: "x" }] })]))).not.toEqual([]);
  });
});

describe("leseInhalt", () => {
  it("liefert den Inhalt oder eine Fehlermeldung, wirft nie", () => {
    expect(leseInhalt(plan([stelle("a", null)])).ok).toBe(true);
    const kaputt = leseInhalt({ irgendwas: true });
    expect(kaputt.ok).toBe(false);
    expect(leseInhalt(null).ok).toBe(false);
  });
});

describe("Arten und Piktogramme passen zusammen", () => {
  it("jede Kontakt- und Verbindungsart hat ein Piktogramm, keine mehr", () => {
    expect(Object.keys(KONTAKT_PIKTOGRAMM).sort()).toEqual([...KONTAKT_ARTEN].sort());
    expect(Object.keys(VERBINDUNG_PIKTOGRAMM).sort()).toEqual([...VERBINDUNGS_ARTEN].sort());
  });
});
```

`K/_lib/plan/kontakte.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { KONTAKT_REIHENFOLGE, kontaktZeilen } from "./kontakte";

describe("kontaktZeilen", () => {
  it("feste Reihenfolge wie in der Vorlage, unabhängig von der Eingabe", () => {
    expect(kontaktZeilen([{ art: "email", wert: "a@b" }, { art: "funkrufname", wert: "RK UE 40-00" }], false))
      .toEqual([{ art: "funkrufname", wert: "RK UE 40-00" }, { art: "email", wert: "a@b" }]);
  });
  it("mehrere Werte derselben Art behalten ihre Eingabereihenfolge", () => {
    expect(kontaktZeilen([{ art: "telefon", wert: "1" }, { art: "telefon", wert: "2" }], false).map((z) => z.wert)).toEqual(["1", "2"]);
  });
  it("mit Leerzeilen: je Art eine Zeile (außer Sonstiges), leere Werte bleiben leer", () => {
    const z = kontaktZeilen([{ art: "telefon", wert: "0581 / 82 266" }], true);
    expect(z.map((x) => x.art)).toEqual(["funkrufname", "digitalfunk", "telefon", "mobil", "fax", "email"]);
    expect(z[2].wert).toBe("0581 / 82 266");
    expect(z[0].wert).toBe("");
  });
  it("leere und nur aus Leerzeichen bestehende Werte zählen nicht als belegt", () => {
    expect(kontaktZeilen([{ art: "fax", wert: "   " }], false)).toEqual([]);
  });
  it("Sonstiges steht zuletzt", () => expect(KONTAKT_REIHENFOLGE.at(-1)).toBe("sonstiges"));
});
```

- [ ] **Step 2: Rot sehen**

Run: `pnpm vitest run src/app/m/kommplan/_lib/plan`
Expected: FAIL — `Failed to resolve import "./schema"`.

- [ ] **Step 3: Implementieren**

`K/_lib/plan/schema.ts`:
```ts
import { z } from "zod";

/**
 * DAS PLANDOKUMENT (Spec §4.2) — ein Plan ist EIN JSON-Dokument. Die Invarianten prüft
 * `superRefine` beim Speichern und beim Lesen; eine verletzte Invariante ist nie ein HTTP 500,
 * sondern `leseInhalt(...).ok === false`.
 *
 * EIN NAMENSRAUM FÜR ALLE IDs: Stellen, Einheiten und Verbindungen teilen sich die Eindeutigkeit.
 * Das hält Verweise (Einklappen, Auswahl, Rückgängig) eindeutig, ohne einen Typ mitzuführen.
 */
export const KONTAKT_ARTEN = ["funkrufname", "digitalfunk", "telefon", "mobil", "fax", "email", "sonstiges"] as const;
export const VERBINDUNGS_ARTEN = ["tmo", "dmo", "analogfunk", "draht", "telefon", "mobil", "fax", "daten"] as const;
export const LAGEN = ["unter", "links", "rechts"] as const;
export type KontaktArt = (typeof KONTAKT_ARTEN)[number];
export type VerbindungsArt = (typeof VERBINDUNGS_ARTEN)[number];
export type Lage = (typeof LAGEN)[number];

const id = z.string().min(1).max(64).regex(/^[A-Za-z0-9_-]+$/);
const zeichenSchluessel = z.string().min(1).max(80).nullable();

export const kontaktSchema = z.object({ art: z.enum(KONTAKT_ARTEN), wert: z.string().max(200) }).strict();
export const einheitSchema = z.object({ id, typ: z.string().max(40), rufname: z.string().max(80), zeichen: zeichenSchluessel }).strict();
export const stelleSchema = z.object({
  id,
  eltern: id.nullable(),
  lage: z.enum(LAGEN),
  reihenfolge: z.number(),
  zeichen: zeichenSchluessel,
  titel: z.string().max(200),
  leiter: z.string().max(120).nullable(),
  hervorheben: z.boolean(),
  verbindungId: id.nullable(),
  /** Kanäle, die die Stelle benutzt, ohne Gegenstelle (Abweichung 12) — Sechsecke unter der Karte. */
  kanaele: z.array(id).max(12).default([]),
  kontakte: z.array(kontaktSchema).max(30),
  einheiten: z.array(einheitSchema).max(60),
}).strict();
export const verbindungSchema = z.object({ id, art: z.enum(VERBINDUNGS_ARTEN), bezeichnung: z.string().max(60) }).strict();
export const optionenSchema = z.object({
  leerzeilen: z.boolean(), vermerkVsNfD: z.boolean(), qrAufDruck: z.boolean(), schwarzweiss: z.boolean(),
}).strict();

type Roh = {
  stellen: z.infer<typeof stelleSchema>[];
  verbindungen: z.infer<typeof verbindungSchema>[];
};

function pruefeInvarianten(p: Roh, ctx: z.RefinementCtx): void {
  const melde = (path: (string | number)[], message: string) => ctx.addIssue({ code: "custom", path, message });
  const ids = new Set<string>();
  const merke = (wert: string, path: (string | number)[]) => {
    if (ids.has(wert)) melde(path, `ID doppelt: ${wert}`);
    ids.add(wert);
  };
  p.stellen.forEach((s, i) => {
    merke(s.id, ["stellen", i, "id"]);
    s.einheiten.forEach((e, j) => merke(e.id, ["stellen", i, "einheiten", j, "id"]));
  });
  p.verbindungen.forEach((v, i) => merke(v.id, ["verbindungen", i, "id"]));

  const stellen = new Map(p.stellen.map((s) => [s.id, s]));
  const verbindungen = new Set(p.verbindungen.map((v) => v.id));
  p.stellen.forEach((s, i) => {
    if (s.eltern !== null && !stellen.has(s.eltern)) melde(["stellen", i, "eltern"], `Elternstelle ${s.eltern} existiert nicht`);
    if (s.lage !== "unter" && s.eltern === null) melde(["stellen", i, "lage"], "Eine Seitenstelle braucht eine Elternstelle");
    const eltern = s.eltern === null ? undefined : stellen.get(s.eltern);
    if (eltern && eltern.lage !== "unter") melde(["stellen", i, "eltern"], `Seitenstelle ${eltern.id} kann keine Stellen tragen`);
    if (s.verbindungId !== null && !verbindungen.has(s.verbindungId)) {
      melde(["stellen", i, "verbindungId"], `Verbindung ${s.verbindungId} existiert nicht`);
    }
    const kanaele = new Set<string>();
    s.kanaele.forEach((k, j) => {
      if (!verbindungen.has(k)) melde(["stellen", i, "kanaele", j], `Kanal ${k} existiert nicht`);
      if (kanaele.has(k)) melde(["stellen", i, "kanaele", j], `Kanal ${k} doppelt an ${s.id}`);
      kanaele.add(k);
    });
  });
  for (const s of p.stellen) {
    const gesehen = new Set<string>([s.id]);
    let eltern = s.eltern === null ? undefined : stellen.get(s.eltern);
    while (eltern) {
      if (gesehen.has(eltern.id)) { melde(["stellen"], `Zyklus über ${s.id}`); break; }
      gesehen.add(eltern.id);
      eltern = eltern.eltern === null ? undefined : stellen.get(eltern.eltern);
    }
  }
}

export const planInhaltSchema = z.object({
  schema: z.literal(1),
  optionen: optionenSchema,
  stellen: z.array(stelleSchema).max(500),
  verbindungen: z.array(verbindungSchema).max(200),
}).strict().superRefine(pruefeInvarianten);

export type Kontakt = z.infer<typeof kontaktSchema>;
export type Einheit = z.infer<typeof einheitSchema>;
export type Stelle = z.infer<typeof stelleSchema>;
export type Verbindung = z.infer<typeof verbindungSchema>;
export type PlanOptionen = z.infer<typeof optionenSchema>;
export type PlanInhalt = z.infer<typeof planInhaltSchema>;

export function leseInhalt(roh: unknown): { ok: true; inhalt: PlanInhalt } | { ok: false; fehler: string } {
  const r = planInhaltSchema.safeParse(roh);
  return r.success ? { ok: true, inhalt: r.data } : { ok: false, fehler: r.error.issues.map((i) => i.message).join("; ") };
}

/** Anzeigenamen der Verbindungsarten (Legende, Phase 2: Auswahl im Flyin). */
export const ART_NAME: Record<VerbindungsArt, string> = {
  tmo: "Digitalfunk TMO", dmo: "Digitalfunk DMO", analogfunk: "Analogfunk", draht: "Draht",
  telefon: "Telefon", mobil: "Mobilfunk", fax: "Fax", daten: "Datenverbindung",
};
```

`K/_lib/plan/kontakte.ts`:
```ts
import { KONTAKT_ARTEN, type Kontakt, type KontaktArt } from "./schema";

/** Die Zeilenfolge der Excel-Vorlage: ◇, Digitalfunk, Telefon, Handy, Fax, PC — Sonstiges zuletzt. */
export const KONTAKT_REIHENFOLGE: readonly KontaktArt[] = KONTAKT_ARTEN;

/**
 * Die Kontaktzeilen einer Karte in fester Reihenfolge (Spec §4.2). Mit `leerzeilen` bekommt jede
 * Art außer „Sonstiges" eine Zeile, auch ohne Wert — dort wird im Einsatz von Hand eingetragen.
 */
export function kontaktZeilen(kontakte: readonly Kontakt[], leerzeilen: boolean): { art: KontaktArt; wert: string }[] {
  const zeilen: { art: KontaktArt; wert: string }[] = [];
  for (const art of KONTAKT_REIHENFOLGE) {
    const werte = kontakte.filter((k) => k.art === art).map((k) => k.wert.trim()).filter((w) => w !== "");
    if (werte.length > 0) for (const wert of werte) zeilen.push({ art, wert });
    else if (leerzeilen && art !== "sonstiges") zeilen.push({ art, wert: "" });
  }
  return zeilen;
}
```

- [ ] **Step 4: Grün sehen**

Run: `pnpm vitest run src/app/m/kommplan/_lib/plan && pnpm typecheck`
Expected: PASS; Exit 0.

- [ ] **Step 5: Commit**

```bash
git add src/app/m/kommplan/_lib/plan
git commit -S -m "feat(kommplan): Planschema mit Invarianten und fester Kontaktreihenfolge" -m "Ein Plan ist ein JSON-Dokument; IDs eindeutig über Stellen, Einheiten und Verbindungen, kein Zyklus, Seitenstellen ohne Kinder, Verweise nur auf Vorhandenes." -m "DRK-500" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Baum, reine Planoperationen und Plan-Baukasten

**Files:**
- Create: `K/_lib/plan/baum.ts`, `K/_lib/plan/operationen.ts`, `K/_lib/beispiele/bau.ts`
- Test: `K/_lib/plan/baum.test.ts`, `K/_lib/plan/operationen.test.ts`, `K/_lib/beispiele/bau.test.ts`

**Interfaces:**
- Consumes: `Stelle`, `PlanInhalt`, `Verbindung`, `planInhaltSchema` (Task 3).
- Produces:
  - `baum.ts`: `ordne<T extends { reihenfolge: number; id: string }>(liste: readonly T[]): T[]`; `interface Baum { stelle(id: string): Stelle | undefined; wurzeln: Stelle[]; unter(id: string): Stelle[]; seiten(id: string): { links: Stelle[]; rechts: Stelle[] } }`; `baueBaum(inhalt: PlanInhalt): Baum`; `nachkommen(baum: Baum, id: string): Stelle[]` (alle Unter- und Seitenstellen darunter, ohne die Stelle selbst); `versteckteAnzahl(baum: Baum, id: string): number` (was Einklappen verbirgt: alle Unterstellen-Nachkommen samt deren Seitenstellen, nicht die eigenen Seitenstellen); `teilbaumGroesse(baum: Baum, id: string): number` (1 + `nachkommen`); `tiefensuche(baum: Baum): Stelle[]` (Stelle, dann Seitenstellen links, rechts, dann Unterstellen — alle `ordne`t).
  - `operationen.ts`: `class PlanFehler extends Error`; `leererPlan(): PlanInhalt`; `type NeueStelle = Partial<Omit<Stelle, "id" | "titel">> & { id: string; titel: string }`; `fuegeStelleEin(inhalt: PlanInhalt, neu: NeueStelle): PlanInhalt`; `fuegeVerbindungEin(inhalt: PlanInhalt, v: Verbindung): PlanInhalt`; `naechsteReihenfolge(inhalt: PlanInhalt, eltern: string | null, lage: Lage): number`.
  - `bau.ts`: `type StelleEingabe = { id: string; titel: string; eltern?: string | null; lage?: Lage; zeichen?: string | null; leiter?: string | null; hervorheben?: boolean; verbindung?: string | null; kanaele?: string[]; kontakte?: Partial<Record<KontaktArt, string | string[]>>; einheiten?: (string | readonly [typ: string, rufname: string])[] }`; `baue(eingabe: { optionen?: Partial<PlanOptionen>; verbindungen?: Verbindung[]; stellen: StelleEingabe[] }): PlanInhalt` (Reihenfolge = Position unter den Geschwistern gleicher Lage in Eingabereihenfolge; Einheit als String: erstes Wort = Typ, Rest = Rufname — dieselbe Regel wie „Liste einfügen" in Phase 3; Einheiten-IDs `<stelle>-e<n>`; Ergebnis läuft durch `planInhaltSchema.parse`).

- [ ] **Step 1: Failing tests**

`K/_lib/plan/baum.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { baue } from "../beispiele/bau";
import { baueBaum, nachkommen, ordne, teilbaumGroesse, tiefensuche, versteckteAnzahl } from "./baum";

const inhalt = baue({
  stellen: [
    { id: "w", titel: "Wurzel" },
    { id: "b", titel: "B", eltern: "w" },
    { id: "a", titel: "A", eltern: "w" },
    { id: "l", titel: "L", eltern: "w", lage: "links" },
    { id: "b1", titel: "B1", eltern: "b" },
    { id: "b1s", titel: "B1s", eltern: "b1", lage: "rechts" },
  ],
});

describe("Baum", () => {
  it("ordnet nach reihenfolge, bei Gleichstand nach id", () => {
    expect(ordne([{ id: "z", reihenfolge: 1 }, { id: "a", reihenfolge: 1 }, { id: "m", reihenfolge: 0 }]).map((x) => x.id))
      .toEqual(["m", "a", "z"]);
  });
  it("trennt Unter- und Seitenstellen", () => {
    const b = baueBaum(inhalt);
    expect(b.wurzeln.map((s) => s.id)).toEqual(["w"]);
    expect(b.unter("w").map((s) => s.id)).toEqual(["b", "a"]);
    expect(b.seiten("w").links.map((s) => s.id)).toEqual(["l"]);
    expect(b.seiten("b1").rechts.map((s) => s.id)).toEqual(["b1s"]);
    expect(b.unter("unbekannt")).toEqual([]);
  });
  it("zählt Nachkommen, Teilbaumgröße und was Einklappen verbirgt", () => {
    const b = baueBaum(inhalt);
    expect(nachkommen(b, "w").map((s) => s.id).sort()).toEqual(["a", "b", "b1", "b1s", "l"]);
    expect(teilbaumGroesse(b, "b")).toBe(3);
    expect(versteckteAnzahl(b, "w")).toBe(4); // b, a, b1, b1s — nicht die eigene Seitenstelle l
  });
  it("Tiefensuche: Stelle, Seiten links/rechts, dann Unterstellen", () => {
    expect(tiefensuche(baueBaum(inhalt)).map((s) => s.id)).toEqual(["w", "l", "b", "b1", "b1s", "a"]);
  });
});
```

`K/_lib/plan/operationen.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { PlanFehler, fuegeStelleEin, fuegeVerbindungEin, leererPlan, naechsteReihenfolge } from "./operationen";

describe("Planoperationen", () => {
  it("leerer Plan ist gültig und hat VS-NfD an", () => {
    expect(leererPlan()).toMatchObject({ schema: 1, stellen: [], verbindungen: [], optionen: { vermerkVsNfD: true, leerzeilen: false } });
  });
  it("fügt eine Stelle mit Vorgaben ein und hängt sie ans Ende der Geschwister", () => {
    let p = fuegeStelleEin(leererPlan(), { id: "w", titel: "Wurzel" });
    p = fuegeStelleEin(p, { id: "a", titel: "A", eltern: "w" });
    p = fuegeStelleEin(p, { id: "b", titel: "B", eltern: "w" });
    expect(p.stellen.map((s) => [s.id, s.reihenfolge])).toEqual([["w", 0], ["a", 0], ["b", 1]]);
    expect(p.stellen[1]).toMatchObject({ lage: "unter", zeichen: null, kanaele: [], kontakte: [], einheiten: [], hervorheben: false });
    expect(naechsteReihenfolge(p, "w", "unter")).toBe(2);
    expect(naechsteReihenfolge(p, "w", "links")).toBe(0);
  });
  it("ist rein: die Eingabe bleibt unverändert", () => {
    const p = leererPlan();
    fuegeStelleEin(p, { id: "w", titel: "W" });
    expect(p.stellen).toEqual([]);
  });
  it("wirft PlanFehler bei verletzter Invariante", () => {
    expect(() => fuegeStelleEin(leererPlan(), { id: "x", titel: "X", eltern: "fehlt" })).toThrow(PlanFehler);
    const p = fuegeStelleEin(leererPlan(), { id: "w", titel: "W" });
    expect(() => fuegeStelleEin(p, { id: "w", titel: "doppelt" })).toThrow("ID doppelt: w");
  });
  it("fügt eine Verbindung ein", () => {
    const p = fuegeVerbindungEin(leererPlan(), { id: "v", art: "tmo", bezeichnung: "R_UE_1" });
    expect(p.verbindungen).toEqual([{ id: "v", art: "tmo", bezeichnung: "R_UE_1" }]);
  });
});
```

`K/_lib/beispiele/bau.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { baue } from "./bau";

describe("baue", () => {
  it("setzt Reihenfolge je Geschwistergruppe und Lage in Eingabereihenfolge", () => {
    const p = baue({ stellen: [
      { id: "w", titel: "W" }, { id: "x", titel: "X", eltern: "w" }, { id: "s", titel: "S", eltern: "w", lage: "links" },
      { id: "y", titel: "Y", eltern: "w" },
    ] });
    expect(Object.fromEntries(p.stellen.map((s) => [s.id, s.reihenfolge]))).toEqual({ w: 0, x: 0, s: 0, y: 1 });
  });
  it("Kontakte aus einem Record, Einheiten aus Text (erstes Wort = Typ) oder Paar, Kanäle durchgereicht", () => {
    const p = baue({
      verbindungen: [{ id: "v", art: "tmo", bezeichnung: "R_UE_2" }, { id: "k", art: "dmo", bezeichnung: "DMO 608" }],
      stellen: [{
        id: "ea", titel: "EA", verbindung: "v", kanaele: ["k"],
        kontakte: { telefon: ["1", "2"], digitalfunk: "RK UE 40-05-1" },
        einheiten: ["RTW RK UE 40-83-5", ["Foodtruck", ""]],
      }],
    });
    const ea = p.stellen[0];
    expect(ea.verbindungId).toBe("v");
    expect(ea.kanaele).toEqual(["k"]);
    expect(ea.kontakte).toEqual([
      { art: "digitalfunk", wert: "RK UE 40-05-1" }, { art: "telefon", wert: "1" }, { art: "telefon", wert: "2" },
    ]);
    expect(ea.einheiten).toEqual([
      { id: "ea-e1", typ: "RTW", rufname: "RK UE 40-83-5", zeichen: null },
      { id: "ea-e2", typ: "Foodtruck", rufname: "", zeichen: null },
    ]);
  });
  it("wirft bei ungültigem Ergebnis", () => {
    expect(() => baue({ stellen: [{ id: "a", titel: "A", eltern: "fehlt" }] })).toThrow();
  });
});
```

- [ ] **Step 2: Rot sehen**

Run: `pnpm vitest run src/app/m/kommplan/_lib/plan src/app/m/kommplan/_lib/beispiele`
Expected: FAIL — fehlende Module `./baum`, `./operationen`, `./bau`.

- [ ] **Step 3: Implementieren**

`K/_lib/plan/baum.ts`:
```ts
import type { PlanInhalt, Stelle } from "./schema";

/** Gleiche Daten → gleiches Bild: sortiert wird nie nach Array-Position, sondern nach reihenfolge, dann id. */
export function ordne<T extends { reihenfolge: number; id: string }>(liste: readonly T[]): T[] {
  return [...liste].sort((a, b) => a.reihenfolge - b.reihenfolge || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

export interface Baum {
  stelle(id: string): Stelle | undefined;
  wurzeln: Stelle[];
  unter(id: string): Stelle[];
  seiten(id: string): { links: Stelle[]; rechts: Stelle[] };
}

export function baueBaum(inhalt: PlanInhalt): Baum {
  const nachId = new Map(inhalt.stellen.map((s) => [s.id, s]));
  const unter = new Map<string, Stelle[]>();
  const links = new Map<string, Stelle[]>();
  const rechts = new Map<string, Stelle[]>();
  const wurzeln: Stelle[] = [];
  for (const s of inhalt.stellen) {
    if (s.eltern === null) { wurzeln.push(s); continue; }
    const ziel = s.lage === "unter" ? unter : s.lage === "links" ? links : rechts;
    ziel.set(s.eltern, [...(ziel.get(s.eltern) ?? []), s]);
  }
  const geordnet = (m: Map<string, Stelle[]>) => new Map([...m].map(([k, v]) => [k, ordne(v)]));
  const u = geordnet(unter), l = geordnet(links), r = geordnet(rechts);
  return {
    stelle: (id) => nachId.get(id),
    wurzeln: ordne(wurzeln),
    unter: (id) => u.get(id) ?? [],
    seiten: (id) => ({ links: l.get(id) ?? [], rechts: r.get(id) ?? [] }),
  };
}

export function nachkommen(baum: Baum, id: string): Stelle[] {
  const seiten = baum.seiten(id);
  return [...seiten.links, ...seiten.rechts, ...baum.unter(id).flatMap((k) => [k, ...nachkommen(baum, k.id)])];
}

export function versteckteAnzahl(baum: Baum, id: string): number {
  return baum.unter(id).reduce((n, k) => n + 1 + nachkommen(baum, k.id).length, 0);
}

export function teilbaumGroesse(baum: Baum, id: string): number {
  return 1 + nachkommen(baum, id).length;
}

export function tiefensuche(baum: Baum): Stelle[] {
  const aus: Stelle[] = [];
  const besuche = (s: Stelle) => {
    aus.push(s);
    const seiten = baum.seiten(s.id);
    aus.push(...seiten.links, ...seiten.rechts);
    baum.unter(s.id).forEach(besuche);
  };
  baum.wurzeln.forEach(besuche);
  return aus;
}
```

`K/_lib/plan/operationen.ts`:
```ts
import { planInhaltSchema, type Lage, type PlanInhalt, type Stelle, type Verbindung } from "./schema";

/**
 * Reine Planoperationen (Spec §6.6): Eingabe bleibt unverändert, Ausgabe ist gültig oder die
 * Operation wirft `PlanFehler`. Phase 1 braucht nur Einfügen (Seed, Beispiele, Tests); Umhängen,
 * Löschen und das Gliederungs-Einfügen folgen in Phase 2 und 3 in dieser Datei.
 */
export class PlanFehler extends Error {
  constructor(nachricht: string) { super(nachricht); this.name = "PlanFehler"; }
}

export function leererPlan(): PlanInhalt {
  return {
    schema: 1,
    optionen: { leerzeilen: false, vermerkVsNfD: true, qrAufDruck: false, schwarzweiss: false },
    stellen: [],
    verbindungen: [],
  };
}

function gueltig(roh: PlanInhalt): PlanInhalt {
  const r = planInhaltSchema.safeParse(roh);
  if (!r.success) throw new PlanFehler(r.error.issues.map((i) => i.message).join("; "));
  return r.data;
}

export function naechsteReihenfolge(inhalt: PlanInhalt, eltern: string | null, lage: Lage): number {
  const geschwister = inhalt.stellen.filter((s) => s.eltern === eltern && s.lage === lage);
  return geschwister.length === 0 ? 0 : Math.max(...geschwister.map((s) => s.reihenfolge)) + 1;
}

export type NeueStelle = Partial<Omit<Stelle, "id" | "titel">> & { id: string; titel: string };

export function fuegeStelleEin(inhalt: PlanInhalt, neu: NeueStelle): PlanInhalt {
  const eltern = neu.eltern ?? null;
  const lage = neu.lage ?? "unter";
  const stelle: Stelle = {
    id: neu.id, eltern, lage,
    reihenfolge: neu.reihenfolge ?? naechsteReihenfolge(inhalt, eltern, lage),
    zeichen: neu.zeichen ?? null, titel: neu.titel, leiter: neu.leiter ?? null,
    hervorheben: neu.hervorheben ?? false, verbindungId: neu.verbindungId ?? null,
    kanaele: neu.kanaele ?? [], kontakte: neu.kontakte ?? [], einheiten: neu.einheiten ?? [],
  };
  return gueltig({ ...inhalt, stellen: [...inhalt.stellen, stelle] });
}

export function fuegeVerbindungEin(inhalt: PlanInhalt, v: Verbindung): PlanInhalt {
  return gueltig({ ...inhalt, verbindungen: [...inhalt.verbindungen, v] });
}
```

`K/_lib/beispiele/bau.ts`:
```ts
import { KONTAKT_REIHENFOLGE } from "../plan/kontakte";
import {
  planInhaltSchema, type Einheit, type Kontakt, type KontaktArt, type Lage, type PlanInhalt, type PlanOptionen,
  type Stelle, type Verbindung,
} from "../plan/schema";

/**
 * Ein kleiner Baukasten für Beispielpläne, Seed und Tests — lesbarer als rohe PlanInhalt-Literale.
 * Die Reihenfolge ergibt sich aus der Eingabereihenfolge unter Geschwistern derselben Lage.
 */
export type EinheitEingabe = string | readonly [typ: string, rufname: string];
export type StelleEingabe = {
  id: string; titel: string; eltern?: string | null; lage?: Lage; zeichen?: string | null; leiter?: string | null;
  hervorheben?: boolean; verbindung?: string | null; kanaele?: string[];
  kontakte?: Partial<Record<KontaktArt, string | string[]>>;
  einheiten?: EinheitEingabe[];
};

function einheitAus(stelleId: string, e: EinheitEingabe, i: number): Einheit {
  if (typeof e === "string") {
    const [typ = "", ...rest] = e.trim().split(/\s+/);
    return { id: `${stelleId}-e${i + 1}`, typ, rufname: rest.join(" "), zeichen: null };
  }
  return { id: `${stelleId}-e${i + 1}`, typ: e[0], rufname: e[1], zeichen: null };
}

export function baue(eingabe: { optionen?: Partial<PlanOptionen>; verbindungen?: Verbindung[]; stellen: StelleEingabe[] }): PlanInhalt {
  const zaehler = new Map<string, number>();
  const stellen: Stelle[] = eingabe.stellen.map((e) => {
    const eltern = e.eltern ?? null;
    const lage = e.lage ?? "unter";
    const schluessel = `${eltern ?? ""}|${lage}`;
    const reihenfolge = zaehler.get(schluessel) ?? 0;
    zaehler.set(schluessel, reihenfolge + 1);
    const kontakte: Kontakt[] = KONTAKT_REIHENFOLGE.flatMap((art) => {
      const w = e.kontakte?.[art];
      return w === undefined ? [] : (Array.isArray(w) ? w : [w]).map((wert) => ({ art, wert }));
    });
    return {
      id: e.id, eltern, lage, reihenfolge, zeichen: e.zeichen ?? null, titel: e.titel, leiter: e.leiter ?? null,
      hervorheben: e.hervorheben ?? false, verbindungId: e.verbindung ?? null, kanaele: e.kanaele ?? [], kontakte,
      einheiten: (e.einheiten ?? []).map((x, i) => einheitAus(e.id, x, i)),
    };
  });
  return planInhaltSchema.parse({
    schema: 1,
    optionen: { leerzeilen: false, vermerkVsNfD: true, qrAufDruck: false, schwarzweiss: false, ...eingabe.optionen },
    stellen,
    verbindungen: eingabe.verbindungen ?? [],
  });
}
```

- [ ] **Step 4: Grün sehen**

Run: `pnpm vitest run src/app/m/kommplan && pnpm typecheck`
Expected: PASS; Exit 0.

- [ ] **Step 5: Commit**

```bash
git add src/app/m/kommplan/_lib/plan src/app/m/kommplan/_lib/beispiele/bau.ts src/app/m/kommplan/_lib/beispiele/bau.test.ts
git commit -S -m "feat(kommplan): Baumsicht, reine Einfügeoperationen und Plan-Baukasten" -m "DRK-500" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Ausgabetypen, Kartenmaß und Sechseckmaß

**Files:**
- Create: `K/_lib/layout/typen.ts`, `K/_lib/layout/karte.ts`, `K/_lib/layout/sechseck.ts`
- Test: `K/_lib/layout/karte.test.ts`, `K/_lib/layout/sechseck.test.ts`

**Interfaces:**
- Consumes: `masse.ts`, `text.ts` (Task 2), `kontaktZeilen`, `Stelle`, `Verbindung` (Task 3).
- Produces (`typen.ts`, die gemeinsame Sprache aller weiteren Aufgaben):
```ts
export type Ziel = "bildschirm" | "a4-quer" | "a3-quer";
export type Papierformat = Exclude<Ziel, "bildschirm">;
export type Darstellung = "normal" | "anker" | { verweisAufBlatt: number };
/** Text relativ zu seinem Träger (Karte, Einheitenkasten, Sechseck, Abzeichen); y = Grundlinie. */
export interface TextZeile { text: string; x: number; y: number; groesse: number; fett: boolean; anker: "start" | "mitte" | "ende" }
export interface KontaktZeileL { art: KontaktArt; y: number; hoehe: number; zeilen: TextZeile[] }
export interface KarteL {
  id: string; x: number; y: number; breite: number; hoehe: number; kopfHoehe: number;
  art: "normal" | "anker" | "verweis"; hervorheben: boolean; zeichen: string | null;
  titel: TextZeile[]; titelVoll: string; gekuerzt: boolean; leiter: TextZeile | null;
  kontakte: KontaktZeileL[]; verweis: TextZeile | null; einklappbar: boolean; eingeklappt: boolean;
}
export interface EinheitL { id: string; stelleId: string; x: number; y: number; breite: number; hoehe: number; text: TextZeile; voll: string; zeichen: string | null }
export interface Strecke { netz: string; x1: number; y1: number; x2: number; y2: number; duenn: boolean }
export type SechseckForm = "funk" | "leitung" | "mobil";
export interface SechseckL { netz: string; verbindungId: string; art: VerbindungsArt; form: SechseckForm; x: number; y: number; breite: number; hoehe: number; beschriftung: TextZeile; voll: string; piktogramm: string }
export interface AbzeichenL { stelleId: string; x: number; y: number; breite: number; hoehe: number; text: TextZeile }
export interface Spanne { stelleId: string; links: number; rechts: number }
export interface LegendenEintrag { art: VerbindungsArt; text: string; reserve: boolean }
export interface Elemente { karten: KarteL[]; einheiten: EinheitL[]; linien: Strecke[]; sechsecke: SechseckL[]; abzeichen: AbzeichenL[]; spannen: Spanne[] }
export interface Zeichnungsdaten extends Elemente { breite: number; hoehe: number; legende: LegendenEintrag[] }
export interface Blatt {
  nummer: number; von: number; wurzelId: string | null; ankerId: string | null;
  zeichnung: Zeichnungsdaten; massstab: number; ursprung: { x: number; y: number };
  legendeZeilen: LegendenEintrag[][]; unterMindestschrift: boolean;
}
export interface Layout extends Zeichnungsdaten { seiten: Blatt[] }
export interface LayoutOptionen {
  eingeklappt?: ReadonlySet<string>;
  darstellung?: ReadonlyMap<string, Darstellung>;
  blatt?: { wurzelId: string; ankerId: string | null };
}
export function leereElemente(): Elemente;
export function verschiebeElemente(e: Elemente, dx: number, dy: number): Elemente;
```
  Absolute Koordinaten (Layout-mm, oben links = 0/0) tragen `KarteL.x/y`, `EinheitL.x/y`, `SechseckL.x/y`, `AbzeichenL.x/y`, `Strecke`, `Spanne`; alle `TextZeile` sind relativ zum Träger. `KarteL.titelVoll` ist der getrimmte Titel und darf leer sein (Abweichung 15) — den Platzhalter „(ohne Titel)" setzt nur, wer ihn am Bildschirm zeigt.
- Produces (`karte.ts`): `interface KartenEingabe { stelle: Stelle; leerzeilen: boolean; darstellung: Darstellung; versteckt: number; anzahlGruppen: number; kanaele: Verbindung[] /* aufgelöst, in Stellenreihenfolge */ }`; `interface KartenMass { breite; hoehe; kopfHoehe; art; titel; titelVoll; gekuerzt; leiter; kontakte; verweis; einheiten: Omit<EinheitL, "stelleId">[] /* relativ zur Kartenecke */; abzeichen: Omit<AbzeichenL, "stelleId"> | null /* relativ */; kanalSechsecke: { verbindung: Verbindung; mass: SechseckMass; x: number; y: number }[] /* relativ */; kanalLinien: { x1: number; y1: number; x2: number; y2: number }[] /* relativ, Netz <stelle>#kanal */; blockBreite: number; blockHoehe: number; gasse: number[] }`; `kartenMass(e: KartenEingabe): KartenMass`.
- Produces (`sechseck.ts`): `sechseckForm(art: VerbindungsArt): SechseckForm`; `interface SechseckMass { breite: number; hoehe: number; form: SechseckForm; beschriftung: TextZeile; voll: string; piktogramm: string }`; `sechseckMass(v: Verbindung): SechseckMass`.

- [ ] **Step 1: Failing tests**

`K/_lib/layout/karte.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import type { Stelle, Verbindung } from "../plan/schema";
import { kartenMass, type KartenEingabe } from "./karte";
import { EINHEIT, KANAL, KARTE, SECHSECK, STIEL } from "./masse";
import { textBreite } from "./text";

const stelle = (rest: Partial<Stelle> = {}): Stelle => ({
  id: "s", eltern: null, lage: "unter", reihenfolge: 0, zeichen: "rezept:D.1.4", titel: "Einsatzleitung",
  leiter: null, hervorheben: false, verbindungId: null, kanaele: [], kontakte: [], einheiten: [], ...rest,
});
const mass = (s: Partial<Stelle> = {}, e: Partial<Omit<KartenEingabe, "stelle">> = {}) =>
  kartenMass({ stelle: stelle(s), leerzeilen: false, darstellung: "normal", versteckt: 0, anzahlGruppen: 0, kanaele: [], ...e });
const DMO: Verbindung = { id: "dmo-608", art: "dmo", bezeichnung: "DMO 608" };
const TMO: Verbindung = { id: "r-ue-2", art: "tmo", bezeichnung: "R_UE_2" };
const einheiten = (n: number) => Array.from({ length: n }, (_, i) => ({ id: `e${i}`, typ: "RTW", rufname: `RK UE 40-83-${i}`, zeichen: null }));

describe("kartenMass", () => {
  it("feste Breite, Kopf mindestens 12 mm, ohne Kontakte nur der Kopf", () => {
    const m = mass();
    expect(m.breite).toBe(KARTE.breite);
    expect(m.kopfHoehe).toBe(KARTE.kopfMin);
    expect(m.hoehe).toBe(m.kopfHoehe);
    expect(m.blockHoehe).toBe(m.hoehe);
    expect(m.titel[0].x).toBe(KARTE.titelX);
  });
  it("ohne Zeichen beginnt der Titel am Innenrand", () => expect(mass({ zeichen: null }).titel[0].x).toBe(KARTE.rand));
  it("mit Leerzeilen: sechs Kontaktzeilen à 4,5 mm", () => {
    const m = mass({}, { leerzeilen: true });
    expect(m.kontakte).toHaveLength(6);
    expect(m.hoehe).toBeCloseTo(KARTE.kopfMin + 6 * KARTE.kontaktHoehe, 9);
  });
  it("ein langer Titel bricht auf höchstens drei Zeilen, der volle Text bleibt erhalten", () => {
    const lang = "Technische Einsatzleitung Bereitstellungsraum Nord mit Patientenablage und Transportorganisation";
    const m = mass({ titel: lang });
    expect(m.titel).toHaveLength(3);
    expect(m.gekuerzt).toBe(true);
    expect(m.titelVoll).toBe(lang);
    for (const z of m.titel) expect(textBreite(z.text, z.groesse, true)).toBeLessThanOrEqual(KARTE.breite - KARTE.titelX - KARTE.innenRechts + 1e-9);
    expect(m.kopfHoehe).toBeGreaterThan(KARTE.kopfMin);
  });
  it("eine lange E-Mail-Adresse macht ihre Zeile zweizeilig", () => {
    const m = mass({ kontakte: [{ art: "email", wert: "max.mustermann@drk-kreisverband-uelzen.de" }] });
    expect(m.kontakte[0].zeilen).toHaveLength(2);
    expect(m.kontakte[0].hoehe).toBeGreaterThan(KARTE.kontaktHoehe);
  });
  it("Emoji und CJK im Titel werfen nicht", () => {
    expect(() => mass({ titel: "🚑 救护车 Einsatz" })).not.toThrow();
  });
  it.each(["", "   "])("leerer Titel %j: keine Titelzeile, Mindestkopf, kein Platzhalter auf dem Papier", (titel) => {
    const m = mass({ titel });
    expect(m.titel).toEqual([]);
    expect(m.titelVoll).toBe("");
    expect(m.kopfHoehe).toBe(KARTE.kopfMin);
    expect(JSON.stringify(m)).not.toContain("ohne Titel");
  });
  it("neun Einheiten: eine Spalte im Takt 5,5 mm; zehn: zwei Spalten, Block breiter als die Karte", () => {
    const neun = mass({ einheiten: einheiten(9) });
    expect(new Set(neun.einheiten.map((e) => e.x)).size).toBe(1);
    expect(neun.einheiten[1].y - neun.einheiten[0].y).toBeCloseTo(EINHEIT.takt, 9);
    expect(neun.blockBreite).toBe(KARTE.breite);
    const zehn = mass({ einheiten: einheiten(10) });
    expect(new Set(zehn.einheiten.map((e) => e.x)).size).toBe(2);
    expect(zehn.blockBreite).toBeCloseTo(EINHEIT.einzugMin + 2 * EINHEIT.breite + EINHEIT.spaltenAbstand, 9);
  });
  it("dreißig Einheiten: zwei Spalten à 15, der Block wächst nach unten", () => {
    const m = mass({ einheiten: einheiten(30) });
    expect(m.blockHoehe).toBeCloseTo(m.hoehe + EINHEIT.abstandOben + 14 * EINHEIT.takt + EINHEIT.hoehe, 9);
  });
  it("mit Einheiten und Kindern: Stiele laufen in einer Gasse links neben der Einheitenspalte", () => {
    const m = mass({ einheiten: einheiten(3) }, { anzahlGruppen: 2 });
    expect(m.gasse).toEqual([1.5, 3]);
    expect(Math.min(...m.einheiten.map((e) => e.x))).toBeGreaterThan(Math.max(...m.gasse));
    expect(mass({ einheiten: einheiten(3) }, { anzahlGruppen: 4 }).einheiten[0].x).toBeCloseTo(8.5, 9);
    expect(mass({}, { anzahlGruppen: 2 }).gasse).toEqual([]);
  });
  it("Kanäle: Sechsecke untereinander in der Gasse unter der Karte, an einer eigenen Linie, Einheiten darunter", () => {
    const m = mass({ einheiten: einheiten(2) }, { kanaele: [DMO, TMO], anzahlGruppen: 1 });
    expect(m.kanalSechsecke.map((h) => h.verbindung.id)).toEqual(["dmo-608", "r-ue-2"]);
    expect(m.kanalSechsecke[0].y).toBeCloseTo(m.hoehe + EINHEIT.abstandOben, 9);
    expect(m.kanalSechsecke[1].y - m.kanalSechsecke[0].y).toBeCloseTo(KANAL.takt, 9);
    // Stiel-Gasse (eine Gruppe) links, die Kanallinie rechts daneben, die Sechsecke rechts davon
    const kanalX = STIEL.gasseStart + STIEL.gasseTakt;
    expect(m.gasse).toEqual([STIEL.gasseStart]);
    expect(m.kanalLinien[0]).toEqual({ x1: kanalX, y1: m.hoehe, x2: kanalX, y2: m.kanalSechsecke[1].y + SECHSECK.hoehe / 2 });
    for (const [i, h] of m.kanalSechsecke.entries()) {
      expect(m.kanalLinien[i + 1]).toEqual({ x1: kanalX, y1: h.y + SECHSECK.hoehe / 2, x2: h.x, y2: h.y + SECHSECK.hoehe / 2 });
      expect(h.x).toBeGreaterThan(kanalX);
    }
    expect(m.einheiten[0].y).toBeCloseTo(m.kanalSechsecke[1].y + SECHSECK.hoehe + EINHEIT.abstandOben, 9);
    expect(m.blockBreite).toBeGreaterThanOrEqual(Math.max(...m.kanalSechsecke.map((h) => h.x + h.mass.breite)));
    expect(m.blockHoehe).toBeGreaterThan(m.einheiten[1].y);
  });
  it("Kanäle ohne Einheiten und ohne Kinder: die Gasse beginnt bei 1,5 mm", () => {
    const m = mass({}, { kanaele: [TMO] });
    expect(m.gasse).toEqual([]);
    expect(m.kanalLinien[0].x1).toBe(STIEL.gasseStart);
    expect(m.blockHoehe).toBeCloseTo(m.hoehe + EINHEIT.abstandOben + SECHSECK.hoehe, 9);
  });
  it("Anker zeigt nur den Kopf; Verweis zeigt „→ Blatt n\"", () => {
    const anker = mass({ einheiten: einheiten(3), kontakte: [{ art: "telefon", wert: "1" }] }, { darstellung: "anker" });
    expect(anker.art).toBe("anker");
    expect(anker.kontakte).toEqual([]);
    expect(anker.einheiten).toEqual([]);
    expect(mass({}, { darstellung: "anker", kanaele: [TMO] }).kanalSechsecke).toEqual([]);
    const verweis = mass({}, { darstellung: { verweisAufBlatt: 3 } });
    expect(verweis.verweis?.text).toBe("→ Blatt 3");
  });
  it("eingeklappt: Abzeichen unter dem Block", () => {
    const m = mass({}, { versteckt: 5 });
    expect(m.abzeichen?.text.text).toBe("+5 Stellen");
    expect(m.blockHoehe).toBeGreaterThan(m.hoehe);
    expect(mass({}, { versteckt: 1 }).abzeichen?.text.text).toBe("+1 Stelle");
  });
});
```

`K/_lib/layout/sechseck.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { SCHRIFT, SECHSECK } from "./masse";
import { sechseckForm, sechseckMass } from "./sechseck";
import { textBreite } from "./text";

describe("Sechseck", () => {
  it("Breite zwischen 26 und 44 mm, wächst mit der Beschriftung", () => {
    const kurz = sechseckMass({ id: "v", art: "tmo", bezeichnung: "R_UE_2" });
    const lang = sechseckMass({ id: "v", art: "tmo", bezeichnung: "BOS_NI_RES_09" });
    expect(kurz.breite).toBeGreaterThanOrEqual(SECHSECK.minBreite);
    expect(lang.breite).toBeGreaterThan(kurz.breite);
    expect(lang.breite).toBeLessThanOrEqual(SECHSECK.maxBreite);
  });
  it("eine überlange Bezeichnung wird mit … gekürzt und passt hinein", () => {
    const s = sechseckMass({ id: "v", art: "dmo", bezeichnung: "Stabsfunk Kreisverwaltung Uelzen Ausweichkanal" });
    expect(s.breite).toBe(SECHSECK.maxBreite);
    expect(s.beschriftung.text.endsWith("…")).toBe(true);
    expect(textBreite(s.beschriftung.text, SCHRIFT.sechseck, true)).toBeLessThan(SECHSECK.maxBreite - 16 + 1e-9);
    expect(s.voll).toBe("Stabsfunk Kreisverwaltung Uelzen Ausweichkanal");
  });
  it("Form je Art: Funk, Leitung, Mobil", () => {
    expect(["tmo", "dmo", "analogfunk"].map((a) => sechseckForm(a as never))).toEqual(["funk", "funk", "funk"]);
    expect(["draht", "telefon", "fax", "daten"].map((a) => sechseckForm(a as never))).toEqual(["leitung", "leitung", "leitung", "leitung"]);
    expect(sechseckForm("mobil")).toBe("mobil");
  });
  it("trägt das Piktogramm seiner Art", () => {
    expect(sechseckMass({ id: "v", art: "draht", bezeichnung: "" }).piktogramm).toBe("comms.cable-construction");
  });
});
```

- [ ] **Step 2: Rot sehen**

Run: `pnpm vitest run src/app/m/kommplan/_lib/layout`
Expected: FAIL — `./karte`, `./sechseck` fehlen.

- [ ] **Step 3: Implementieren**

`K/_lib/layout/typen.ts`: die Typen aus „Interfaces" oben wörtlich, dazu:
```ts
import type { KontaktArt, VerbindungsArt } from "../plan/schema";
// … Typen wie oben …

export function leereElemente(): Elemente {
  return { karten: [], einheiten: [], linien: [], sechsecke: [], abzeichen: [], spannen: [] };
}

export function verschiebeElemente(e: Elemente, dx: number, dy: number): Elemente {
  return {
    karten: e.karten.map((k) => ({ ...k, x: k.x + dx, y: k.y + dy })),
    einheiten: e.einheiten.map((x) => ({ ...x, x: x.x + dx, y: x.y + dy })),
    linien: e.linien.map((l) => ({ ...l, x1: l.x1 + dx, x2: l.x2 + dx, y1: l.y1 + dy, y2: l.y2 + dy })),
    sechsecke: e.sechsecke.map((s) => ({ ...s, x: s.x + dx, y: s.y + dy })),
    abzeichen: e.abzeichen.map((a) => ({ ...a, x: a.x + dx, y: a.y + dy })),
    spannen: e.spannen.map((s) => ({ ...s, links: s.links + dx, rechts: s.rechts + dx })),
  };
}
```

`K/_lib/layout/karte.ts`:
```ts
import { kontaktZeilen } from "../plan/kontakte";
import type { Stelle, Verbindung } from "../plan/schema";
import { ABZEICHEN, EINHEIT, KANAL, KARTE, SCHRIFT, SECHSECK, STIEL, zeilenhoehe } from "./masse";
import { sechseckMass, type SechseckMass } from "./sechseck";
import { grundlinie, kuerze, umbrechen } from "./text";
import type { AbzeichenL, Darstellung, EinheitL, KarteL, KontaktZeileL, TextZeile } from "./typen";

export interface KartenEingabe {
  stelle: Stelle; leerzeilen: boolean; darstellung: Darstellung; versteckt: number; anzahlGruppen: number;
  /** Die Kanäle der Stelle, aufgelöst (unbekannte fallen beim Aufrufer weg). */
  kanaele: Verbindung[];
}
export interface KartenMass {
  breite: number; hoehe: number; kopfHoehe: number; art: KarteL["art"];
  titel: TextZeile[]; titelVoll: string; gekuerzt: boolean; leiter: TextZeile | null;
  kontakte: KontaktZeileL[]; verweis: TextZeile | null;
  einheiten: Omit<EinheitL, "stelleId">[];
  abzeichen: Omit<AbzeichenL, "stelleId"> | null;
  kanalSechsecke: { verbindung: Verbindung; mass: SechseckMass; x: number; y: number }[];
  kanalLinien: { x1: number; y1: number; x2: number; y2: number }[];
  blockBreite: number; blockHoehe: number; gasse: number[];
}

const zeile = (text: string, x: number, y: number, groesse: number, fett: boolean, anker: TextZeile["anker"] = "start"): TextZeile =>
  ({ text, x, y, groesse, fett, anker });

/**
 * Das Maß einer Karte (Spec §5.1): feste Breite, nur die Höhe wächst. Block = Karte + Kanal-Sechsecke
 * + Einheitenspalte (+ Abzeichen), er ist das, was in der Zeile Platz belegt. `gasse` sind die
 * x-Positionen der Stiele, wenn Kanäle oder Einheiten die Kartenmitte darunter belegen; die
 * Kanallinie läuft im Platz rechts neben dem letzten Stiel, die Sechsecke und Einheiten beginnen
 * rechts davon (`einzug`). Stiele links, Kanallinie in der Mitte, Kästen rechts: nichts kreuzt.
 */
export function kartenMass(e: KartenEingabe): KartenMass {
  const { stelle } = e;
  const art: KarteL["art"] = e.darstellung === "normal" ? "normal" : e.darstellung === "anker" ? "anker" : "verweis";
  const titelX = stelle.zeichen !== null ? KARTE.titelX : KARTE.rand;
  const titelBreite = KARTE.breite - titelX - KARTE.innenRechts;
  const lhT = zeilenhoehe(SCHRIFT.titel), lhL = zeilenhoehe(SCHRIFT.leiter), lhK = zeilenhoehe(SCHRIFT.kontakt);

  // Ein leerer Titel ist ein Handeintrag-Feld (Spec §2): keine Titelzeile, Mindestkopf, kein Platzhalter.
  const titelVoll = stelle.titel.trim();
  const umbruch = titelVoll === ""
    ? { zeilen: [] as string[], gekuerzt: false }
    : umbrechen(titelVoll, titelBreite, SCHRIFT.titel, true, KARTE.titelZeilenMax);
  const leiterRoh = art === "normal" ? stelle.leiter?.trim() ?? "" : "";
  const leiterText = leiterRoh === "" ? null : kuerze(leiterRoh, titelBreite, SCHRIFT.leiter, false).text;
  const textHoehe = umbruch.zeilen.length * lhT + (leiterText ? lhL : 0);
  const kopfHoehe = Math.max(KARTE.kopfMin, textHoehe + 2 * KARTE.rand);
  let y = (kopfHoehe - textHoehe) / 2;
  const titel = umbruch.zeilen.map((text) => { const z = zeile(text, titelX, grundlinie(y, lhT, SCHRIFT.titel), SCHRIFT.titel, true); y += lhT; return z; });
  const leiter = leiterText ? zeile(leiterText, titelX, grundlinie(y, lhL, SCHRIFT.leiter), SCHRIFT.leiter, false) : null;

  let hoehe = kopfHoehe;
  const kontakte: KontaktZeileL[] = [];
  let verweis: TextZeile | null = null;
  if (art === "normal") {
    const wertBreite = KARTE.breite - KARTE.wertX - KARTE.innenRechts;
    for (const k of kontaktZeilen(stelle.kontakte, e.leerzeilen)) {
      const u = umbrechen(k.wert, wertBreite, SCHRIFT.kontakt, false, KARTE.kontaktZeilenMax);
      const zh = Math.max(KARTE.kontaktHoehe, u.zeilen.length * lhK + KARTE.rand);
      let ty = hoehe + (zh - u.zeilen.length * lhK) / 2;
      const zeilen = u.zeilen.map((text) => { const z = zeile(text, KARTE.wertX, grundlinie(ty, lhK, SCHRIFT.kontakt), SCHRIFT.kontakt, false); ty += lhK; return z; });
      kontakte.push({ art: k.art, y: hoehe, hoehe: zh, zeilen });
      hoehe += zh;
    }
  } else if (art === "verweis" && typeof e.darstellung === "object") {
    verweis = zeile(`→ Blatt ${e.darstellung.verweisAufBlatt}`, KARTE.rand, grundlinie(hoehe, KARTE.kontaktHoehe, SCHRIFT.verweis), SCHRIFT.verweis, true);
    hoehe += KARTE.kontaktHoehe;
  }

  const einheiten: Omit<EinheitL, "stelleId">[] = [];
  const gasse: number[] = [];
  const kanalSechsecke: KartenMass["kanalSechsecke"] = [];
  const kanalLinien: KartenMass["kanalLinien"] = [];
  const kanaele = art === "normal" ? e.kanaele : [];
  let blockBreite: number = KARTE.breite;
  let blockHoehe = hoehe;
  let einzug: number = EINHEIT.einzugMin;
  let unterbau = hoehe; // Unterkante dessen, was bisher unter der Karte steht
  if (art === "normal" && (stelle.einheiten.length > 0 || kanaele.length > 0)) {
    for (let i = 0; i < e.anzahlGruppen; i++) gasse.push(STIEL.gasseStart + i * STIEL.gasseTakt);
    const plaetze = e.anzahlGruppen + (kanaele.length > 0 ? 1 : 0);
    einzug = Math.max(EINHEIT.einzugMin, STIEL.gasseStart + plaetze * STIEL.gasseTakt + 1);
  }
  if (kanaele.length > 0) {
    const kanalX = STIEL.gasseStart + e.anzahlGruppen * STIEL.gasseTakt;
    kanaele.forEach((v, i) => {
      const y = hoehe + EINHEIT.abstandOben + i * KANAL.takt;
      const mass = sechseckMass(v);
      kanalSechsecke.push({ verbindung: v, mass, x: einzug, y });
      kanalLinien.push({ x1: kanalX, y1: y + SECHSECK.hoehe / 2, x2: einzug, y2: y + SECHSECK.hoehe / 2 });
      blockBreite = Math.max(blockBreite, einzug + mass.breite);
    });
    const letzte = kanalSechsecke[kanalSechsecke.length - 1];
    kanalLinien.unshift({ x1: kanalX, y1: hoehe, x2: kanalX, y2: letzte.y + SECHSECK.hoehe / 2 });
    unterbau = letzte.y + SECHSECK.hoehe;
    blockHoehe = unterbau;
  }
  if (art === "normal" && stelle.einheiten.length > 0) {
    const n = stelle.einheiten.length;
    const spalten = n >= EINHEIT.zweiSpaltenAb ? 2 : 1;
    const proSpalte = Math.ceil(n / spalten);
    stelle.einheiten.forEach((eh, i) => {
      const spalte = Math.floor(i / proSpalte);
      const x = einzug + spalte * (EINHEIT.breite + EINHEIT.spaltenAbstand);
      const ey = unterbau + EINHEIT.abstandOben + (i % proSpalte) * EINHEIT.takt;
      const voll = `${eh.typ} ${eh.rufname}`.trim();
      const zeichenPlatz = eh.zeichen ? EINHEIT.zeichen + KARTE.rand : 0;
      const innen = EINHEIT.breite - 2 * KARTE.rand - zeichenPlatz;
      const text = kuerze(voll, innen, SCHRIFT.einheit, false).text;
      const tx = KARTE.rand + zeichenPlatz + innen / 2;
      einheiten.push({ id: eh.id, x, y: ey, breite: EINHEIT.breite, hoehe: EINHEIT.hoehe, voll, zeichen: eh.zeichen,
        text: zeile(text, tx, grundlinie(0, EINHEIT.hoehe, SCHRIFT.einheit), SCHRIFT.einheit, false, "mitte") });
    });
    blockBreite = Math.max(blockBreite, einzug + spalten * EINHEIT.breite + (spalten - 1) * EINHEIT.spaltenAbstand);
    blockHoehe = unterbau + EINHEIT.abstandOben + (proSpalte - 1) * EINHEIT.takt + EINHEIT.hoehe;
  }

  let abzeichen: Omit<AbzeichenL, "stelleId"> | null = null;
  if (e.versteckt > 0) {
    const ay = blockHoehe + ABZEICHEN.abstand;
    abzeichen = {
      x: (KARTE.breite - ABZEICHEN.breite) / 2, y: ay, breite: ABZEICHEN.breite, hoehe: ABZEICHEN.hoehe,
      text: zeile(e.versteckt === 1 ? "+1 Stelle" : `+${e.versteckt} Stellen`, ABZEICHEN.breite / 2,
        grundlinie(0, ABZEICHEN.hoehe, SCHRIFT.abzeichen), SCHRIFT.abzeichen, true, "mitte"),
    };
    blockHoehe = ay + ABZEICHEN.hoehe;
  }

  return { breite: KARTE.breite, hoehe, kopfHoehe, art, titel, titelVoll, gekuerzt: umbruch.gekuerzt, leiter,
    kontakte, verweis, einheiten, abzeichen, kanalSechsecke, kanalLinien, blockBreite, blockHoehe, gasse };
}
```

`K/_lib/layout/sechseck.ts`:
```ts
import { VERBINDUNG_PIKTOGRAMM } from "../zeichen/grundlagen";
import type { Verbindung, VerbindungsArt } from "../plan/schema";
import { SCHRIFT, SECHSECK } from "./masse";
import { grundlinie, kuerze, textBreite } from "./text";
import type { SechseckForm, TextZeile } from "./typen";

/** Spec §5.2: die Form trägt die Verbindungsart — Funk spitz, Leitung gefast, Mobil spitz und gestrichelt. */
export function sechseckForm(art: VerbindungsArt): SechseckForm {
  if (art === "tmo" || art === "dmo" || art === "analogfunk") return "funk";
  return art === "mobil" ? "mobil" : "leitung";
}

export interface SechseckMass { breite: number; hoehe: number; form: SechseckForm; beschriftung: TextZeile; voll: string; piktogramm: string }

/** Feste Anteile: Spitze links, Piktogramm, Luft beidseits der Beschriftung, Spitze rechts. */
const FEST = SECHSECK.spitze + SECHSECK.piktoBreite + 2 * SECHSECK.innen + SECHSECK.spitze;

export function sechseckMass(v: Verbindung): SechseckMass {
  const voll = v.bezeichnung.trim();
  const text = kuerze(voll, SECHSECK.maxBreite - FEST, SCHRIFT.sechseck, true).text;
  const breite = Math.min(SECHSECK.maxBreite, Math.max(SECHSECK.minBreite, FEST + textBreite(text, SCHRIFT.sechseck, true)));
  const anfang = SECHSECK.spitze + SECHSECK.piktoBreite + SECHSECK.innen;
  const ende = breite - SECHSECK.spitze - SECHSECK.innen;
  return {
    breite, hoehe: SECHSECK.hoehe, form: sechseckForm(v.art), voll,
    piktogramm: VERBINDUNG_PIKTOGRAMM[v.art],
    beschriftung: { text, x: (anfang + ende) / 2, y: grundlinie(0, SECHSECK.hoehe, SCHRIFT.sechseck), groesse: SCHRIFT.sechseck, fett: true, anker: "mitte" },
  };
}
```

- [ ] **Step 4: Grün sehen**

Run: `pnpm vitest run src/app/m/kommplan/_lib/layout && pnpm typecheck`
Expected: PASS; Exit 0.

- [ ] **Step 5: Commit**

```bash
git add src/app/m/kommplan/_lib/layout/typen.ts src/app/m/kommplan/_lib/layout/karte.ts src/app/m/kommplan/_lib/layout/sechseck.ts src/app/m/kommplan/_lib/layout/karte.test.ts src/app/m/kommplan/_lib/layout/sechseck.test.ts
git commit -S -m "feat(kommplan): Kartenmaß mit Kontaktzeilen, Einheitenspalte und Sechseckmaß" -m "DRK-500" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Skyline-Konturen

**Files:**
- Create: `K/_lib/layout/kontur.ts`
- Test: `K/_lib/layout/kontur.test.ts`

**Interfaces:**
- Produces: `interface Stufe { y0: number; y1: number; x: number }`; `interface Kontur { links: readonly Stufe[]; rechts: readonly Stufe[] }` (beide nach `y0` sortiert, überlappungsfrei; `links` = kleinstes x je Höhe, `rechts` = größtes); `LEER: Kontur`; `LINIEN_LUFT = 0.5`; `LUFT_Y = MINDEST.kasten` (2 mm); `rechteck(x, y, b, h): Kontur`; `strecke(x1, y1, x2, y2): Kontur` (Linie als Band ±0,25 mm, damit auch waagerechte Linien Platz belegen); `vereinige(a, b): Kontur`; `verschiebe(k, dx, dy): Kontur`; `abstand(links: Kontur, rechts: Kontur, luecke: number): number` (kleinstes dx, um das `rechts` verschoben werden muss, damit es überall, wo sich beide in der Höhe überlappen **oder weniger als `LUFT_Y` auseinanderliegen**, `luecke` rechts von `links` liegt; `-Infinity`, wenn es solche Höhen nicht gibt); `nebeneinander(links, rechts, luecke): number` (wie `abstand`, sonst rechts neben das Ganze); `minX(k)`, `maxX(k)`, `istLeer(k)`.

Warum `LUFT_Y`: die Geometrieprüfung verlangt 2 mm zwischen Kästen verschiedener Stellen, auch senkrecht (Task 11). Zählte das Packen nur echte Höhenüberlappung, dürfte ein Teilbaum 0,3 mm unter einen fremden Kasten rutschen — die Prüfung meldete dann, was das Packen selbst gebaut hat.

Warum Skyline statt Konturen je Ebene: Einheitenspalten, Seitenstapel und Kammreihen machen Teilbäume unterschiedlich hoch; eine Kontur je Baumtiefe sähe die Einheitenspalte des Nachbarn nicht. Die Skyline ist eine Stufenfunktion über y — Packen ist ein linearer Durchlauf.

- [ ] **Step 1: Failing test**

`K/_lib/layout/kontur.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { LEER, abstand, istLeer, maxX, minX, nebeneinander, rechteck, strecke, vereinige, verschiebe } from "./kontur";

describe("Kontur", () => {
  it("Rechteck: links = x, rechts = x + b; Höhe 0 ist leer", () => {
    const k = rechteck(2, 0, 10, 5);
    expect(k.links).toEqual([{ y0: 0, y1: 5, x: 2 }]);
    expect(k.rechts).toEqual([{ y0: 0, y1: 5, x: 12 }]);
    expect(istLeer(rechteck(0, 0, 5, 0))).toBe(true);
  });
  it("waagerechte Strecke belegt ein Band von 0,5 mm", () => {
    const k = strecke(0, 10, 20, 10);
    expect(k.links[0]).toMatchObject({ y0: 9.75, y1: 10.25 });
    expect(maxX(k)).toBeCloseTo(20.25, 9);
  });
  it("Vereinigung ist die Stufenfunktion aus min/max", () => {
    const k = vereinige(rechteck(0, 0, 10, 10), rechteck(5, 5, 20, 10));
    expect(k.links).toEqual([{ y0: 0, y1: 10, x: 0 }, { y0: 10, y1: 15, x: 5 }]);
    expect(k.rechts).toEqual([{ y0: 0, y1: 5, x: 10 }, { y0: 5, y1: 15, x: 25 }]);
  });
  it("Vereinigung mit LEER ändert nichts; benachbarte gleiche Stufen verschmelzen", () => {
    const a = rechteck(0, 0, 10, 10);
    expect(vereinige(a, LEER)).toEqual(a);
    expect(vereinige(rechteck(0, 0, 10, 5), rechteck(0, 5, 10, 5)).links).toEqual([{ y0: 0, y1: 10, x: 0 }]);
  });
  it("Abstand: nur wo sich die Höhen überlappen", () => {
    const links = vereinige(rechteck(0, 0, 10, 10), rechteck(0, 20, 50, 10));
    const rechts = rechteck(0, 0, 10, 10);
    expect(abstand(links, rechts, 8)).toBe(18);
    expect(abstand(links, rechteck(0, 20, 10, 5), 8)).toBe(58);
    expect(abstand(links, rechteck(0, 12, 10, 5), 8)).toBe(-Infinity);
  });
  it("ein schmaler, tiefer Teilbaum schiebt sich unter einen breiten, flachen", () => {
    const breitFlach = rechteck(0, 0, 100, 10);
    const schmalTief = vereinige(rechteck(0, 0, 10, 10), rechteck(-40, 30, 10, 10));
    expect(abstand(breitFlach, schmalTief, 8)).toBe(108);
  });
  it("Berührung und weniger als 2 mm Höhenabstand zählen wie Überlappung, ab 2 mm nicht", () => {
    expect(abstand(rechteck(0, 0, 10, 10), rechteck(0, 10, 10, 10), 8)).toBe(18);
    expect(abstand(rechteck(0, 0, 10, 10), rechteck(0, 11.5, 10, 10), 8)).toBe(18);
    expect(abstand(rechteck(0, 0, 10, 10), rechteck(0, 12, 10, 10), 8)).toBe(-Infinity);
  });
  it("nebeneinander ohne Überlappung: rechts neben alles", () => {
    expect(nebeneinander(rechteck(0, 0, 10, 10), rechteck(5, 50, 10, 10), 8)).toBe(13);
  });
  it("Verschieben verschiebt beide Seiten", () => {
    const k = verschiebe(rechteck(0, 0, 10, 10), 5, 3);
    expect(minX(k)).toBe(5);
    expect(maxX(k)).toBe(15);
    expect(k.links[0]).toMatchObject({ y0: 3, y1: 13 });
  });
});
```

- [ ] **Step 2: Rot sehen**

Run: `pnpm vitest run src/app/m/kommplan/_lib/layout/kontur.test.ts`
Expected: FAIL — `./kontur` fehlt.

- [ ] **Step 3: Implementieren**

`K/_lib/layout/kontur.ts`:
```ts
import { MINDEST } from "./masse";

/**
 * SKYLINE-KONTUREN für das Packen von Teilbäumen (Reingold-Tilford mit gierigem Links-Packen).
 * Eine Kontur ist links wie rechts eine Stufenfunktion über y; Vereinigen und Verschieben sind
 * lineare Durchläufe. Koordinaten werden auf 1e-6 gerundet, damit Fließkomma-Reste keine
 * Splitterstufen erzeugen.
 */
export interface Stufe { y0: number; y1: number; x: number }
export interface Kontur { readonly links: readonly Stufe[]; readonly rechts: readonly Stufe[] }

const EPS = 1e-6;
const rund = (v: number) => Math.round(v * 1e6) / 1e6;
export const LEER: Kontur = { links: [], rechts: [] };
export const LINIEN_LUFT = 0.5;
/** Höhenabstand, unter dem zwei Stufen als überlappend gelten (Mindestabstand der Prüfung, Task 11). */
export const LUFT_Y = MINDEST.kasten;

export function istLeer(k: Kontur): boolean {
  return k.links.length === 0;
}

export function rechteck(x: number, y: number, b: number, h: number): Kontur {
  if (!(h > EPS)) return LEER;
  const y0 = rund(y), y1 = rund(y + h);
  return { links: [{ y0, y1, x: rund(x) }], rechts: [{ y0, y1, x: rund(x + b) }] };
}

export function strecke(x1: number, y1: number, x2: number, y2: number): Kontur {
  const h = LINIEN_LUFT / 2;
  return rechteck(Math.min(x1, x2) - h, Math.min(y1, y2) - h, Math.abs(x2 - x1) + LINIEN_LUFT, Math.abs(y2 - y1) + LINIEN_LUFT);
}

function verschmelze(a: readonly Stufe[], b: readonly Stufe[], waehle: (p: number, q: number) => number): Stufe[] {
  if (a.length === 0) return [...b];
  if (b.length === 0) return [...a];
  const punkte = [...new Set([...a, ...b].flatMap((s) => [s.y0, s.y1]))].sort((p, q) => p - q);
  const aus: Stufe[] = [];
  let i = 0, j = 0;
  for (let k = 0; k < punkte.length - 1; k++) {
    const y0 = punkte[k], y1 = punkte[k + 1], mitte = (y0 + y1) / 2;
    while (i < a.length && a[i].y1 <= mitte) i++;
    while (j < b.length && b[j].y1 <= mitte) j++;
    const va = i < a.length && a[i].y0 <= mitte ? a[i].x : undefined;
    const vb = j < b.length && b[j].y0 <= mitte ? b[j].x : undefined;
    const v = va === undefined ? vb : vb === undefined ? va : waehle(va, vb);
    if (v === undefined) continue;
    const letzte = aus[aus.length - 1];
    if (letzte && Math.abs(letzte.y1 - y0) < EPS && Math.abs(letzte.x - v) < EPS) letzte.y1 = y1;
    else aus.push({ y0, y1, x: v });
  }
  return aus;
}

export function vereinige(a: Kontur, b: Kontur): Kontur {
  return { links: verschmelze(a.links, b.links, Math.min), rechts: verschmelze(a.rechts, b.rechts, Math.max) };
}

export function verschiebe(k: Kontur, dx: number, dy: number): Kontur {
  const f = (s: Stufe) => ({ y0: rund(s.y0 + dy), y1: rund(s.y1 + dy), x: rund(s.x + dx) });
  return { links: k.links.map(f), rechts: k.rechts.map(f) };
}

/**
 * Paarweise statt im Reißverschluss: mit `LUFT_Y` zählen auch Stufen, die sich NICHT überlappen,
 * und die überspringt ein Reißverschluss-Durchlauf. Konturen haben Dutzende Stufen, nicht Tausende.
 */
export function abstand(links: Kontur, rechts: Kontur, luecke: number): number {
  let bedarf = -Infinity;
  for (const a of links.rechts) for (const b of rechts.links) {
    const ueber = Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0);
    if (ueber > EPS - LUFT_Y) bedarf = Math.max(bedarf, a.x - b.x + luecke);
  }
  return bedarf;
}

export const minX = (k: Kontur) => Math.min(...k.links.map((s) => s.x));
export const maxX = (k: Kontur) => Math.max(...k.rechts.map((s) => s.x));

export function nebeneinander(links: Kontur, rechts: Kontur, luecke: number): number {
  const d = abstand(links, rechts, luecke);
  return d === -Infinity ? maxX(links) + luecke - minX(rechts) : d;
}
```

- [ ] **Step 4: Grün sehen**

Run: `pnpm vitest run src/app/m/kommplan/_lib/layout/kontur.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/app/m/kommplan/_lib/layout/kontur.ts src/app/m/kommplan/_lib/layout/kontur.test.ts
git commit -S -m "feat(kommplan): Skyline-Konturen zum Packen von Teilbäumen" -m "DRK-500" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Busgruppen, Kamm-Umbruch und Sicht

**Files:**
- Create: `K/_lib/layout/gruppen.ts`, `K/_lib/layout/sicht.ts`
- Test: `K/_lib/layout/gruppen.test.ts`, `K/_lib/layout/sicht.test.ts`

**Interfaces:**
- Consumes: `baueBaum`, `versteckteAnzahl` (Task 4), `Darstellung`, `LayoutOptionen`, `Ziel` (Task 5), `LINIEN_LUFT` (Task 6), `masse.ts`.
- Produces:
  - `gruppen.ts`: `OHNE_VERBINDUNG = "~"` (kein gültiges ID-Zeichen, kollidiert also nie); `interface Gruppe { schluessel: string; verbindungId: string | null; kinder: Stelle[]; reihen: Stelle[][] }`; `budgetFuer(ziel: Ziel): number` (Reihenbreite in Layout-mm); `reihenBreite<T>(reihe, breite): number`; `reihenNachBreite<T>(kinder: readonly T[], breite: (k: T) => number, grenze: number): T[][]` (gierig, jede Reihe mindestens ein Kind); `gruppenBreite<T>(reihen, breite): number` (breiteste Reihe, beim Kamm plus Rücken und Linienluft); `bildeGruppen(kinder: readonly Stelle[], breite: (s: Stelle) => number, budget: number, kammfaehig: (s: Stelle) => boolean): Gruppe[]` (Eingabe bereits `ordne`t; Gruppen nach dem ersten Vorkommen = kleinster `reihenfolge`; Kamm nach Abweichung 13); `gruppenAnzahl(kinder: readonly Stelle[]): number`; `anzeigereihenfolge(kinder: readonly Stelle[]): Stelle[]` (flach, Gruppe für Gruppe).
  - `sicht.ts`: `interface Sicht { wurzeln: Stelle[]; sichtbar: Stelle[]; kinder(id): Stelle[]; seiten(id): { links: Stelle[]; rechts: Stelle[] }; darstellung(id): Darstellung; versteckt(id): number; eingeklappt(id): boolean; einklappbar(id): boolean; verbindung(id: string | null): Verbindung | null; tiefe(id): number }`; `baueSicht(inhalt: PlanInhalt, optionen?: LayoutOptionen): Sicht`.

Regeln der Sicht: Eingeklappt (nur wirksam, wenn die Stelle Unterstellen hat) → keine Kinder, `versteckt` = `versteckteAnzahl`; die eigenen Seitenstellen bleiben. Verweis (`{ verweisAufBlatt }`) → weder Kinder noch Seitenstellen. Mit `blatt: { wurzelId, ankerId }` ist die einzige Wurzel der Anker (Darstellung `anker`, keine Seitenstellen, genau ein Kind: `wurzelId`) bzw. ohne Anker `wurzelId` selbst.

- [ ] **Step 1: Failing tests**

`K/_lib/layout/gruppen.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { baue } from "../beispiele/bau";
import { baueBaum } from "../plan/baum";
import type { Stelle } from "../plan/schema";
import {
  anzeigereihenfolge, bildeGruppen, budgetFuer, gruppenAnzahl, gruppenBreite, reihenNachBreite,
} from "./gruppen";
import { LINIEN_LUFT } from "./kontur";
import { ABSTAND } from "./masse";

const V = ["v1", "v2", "v3"].map((id) => ({ id, art: "tmo" as const, bezeichnung: id }));
const plan = baue({
  verbindungen: [{ id: "v2", art: "tmo", bezeichnung: "R_UE_2" }, { id: "v3", art: "tmo", bezeichnung: "R_UE_3" }],
  stellen: [
    { id: "el", titel: "EL" },
    { id: "a", titel: "A", eltern: "el", verbindung: "v2" },
    { id: "b", titel: "B", eltern: "el", verbindung: "v3" },
    { id: "c", titel: "C", eltern: "el", verbindung: "v2" },
    { id: "d", titel: "D", eltern: "el" },
  ],
});
const kinder = baueBaum(plan).unter("el");
/** n Kinder einer Wurzel; `verbindung(i)` legt die Gruppe fest. */
function reihe(n: number, verbindung: (i: number) => string): Stelle[] {
  const p = baue({ verbindungen: V, stellen: [
    { id: "w", titel: "W" },
    ...Array.from({ length: n }, (_, i) => ({ id: `k${i}`, titel: `K${i}`, eltern: "w", verbindung: verbindung(i) })),
  ] });
  return baueBaum(p).unter("w");
}
const B46 = () => 46;
const immer = () => true;

describe("Busgruppen", () => {
  it("Geschwister mit derselben Verbindung stehen zusammen; Gruppen nach kleinster reihenfolge", () => {
    const g = bildeGruppen(kinder, B46, Infinity, immer);
    expect(g.map((x) => [x.verbindungId, x.kinder.map((k) => k.id)])).toEqual([["v2", ["a", "c"]], ["v3", ["b"]], [null, ["d"]]]);
    expect(g.every((x) => x.reihen.length === 1)).toBe(true);
    expect(gruppenAnzahl(kinder)).toBe(3);
    expect(anzeigereihenfolge(kinder).map((k) => k.id)).toEqual(["a", "c", "b", "d"]);
  });
});

describe("Kamm nach Breite über die ganze Kinderreihe (Spec §5.5, Abweichung 13)", () => {
  it("Reihen gierig nach Breite; ein zu breites Kind steht allein, nie gar keins", () => {
    expect(reihenNachBreite(Array.from({ length: 13 }, (_, i) => i), B46, 316).map((r) => r.length)).toEqual([6, 6, 1]);
    expect(reihenNachBreite([100, 30, 30], (x) => x, 90)).toEqual([[100], [30, 30]]);
    expect(reihenNachBreite([], B46, 100)).toEqual([]);
  });
  it("Budget: A4 quer 369,3 mm, A3 quer und Bildschirm 533,3 mm", () => {
    expect(budgetFuer("a4-quer")).toBeCloseTo(277 / 0.75, 9);
    expect(budgetFuer("a3-quer")).toBeCloseTo(400 / 0.75, 9);
    expect(budgetFuer("bildschirm")).toBe(budgetFuer("a3-quer"));
  });
  it("eine Gruppe bricht erst um, wenn ihre Reihe das Budget sprengt — dann mit Kammrücken", () => {
    const acht = reihe(8, () => "v1");
    expect(bildeGruppen(acht, B46, 8 * 46 + 7 * 8, immer)[0].reihen.map((r) => r.length)).toEqual([8]);
    const g = bildeGruppen(acht, B46, 320, immer)[0];
    expect(g.reihen.map((r) => r.length)).toEqual([6, 2]);
    expect(gruppenBreite(g.reihen, B46)).toBeCloseTo(6 * 46 + 5 * 8 + ABSTAND.kammEinzug + LINIEN_LUFT / 2, 9);
  });
  it("das Budget gilt für ALLE Gruppen einer Stelle: drei Gruppen à fünf Kinder auf A4 kämmen jede", () => {
    const g = bildeGruppen(reihe(15, (i) => V[Math.floor(i / 5)].id), B46, budgetFuer("a4-quer"), immer);
    expect(g.map((x) => x.reihen.map((r) => r.length))).toEqual([[2, 2, 1], [2, 2, 1], [2, 2, 1]]);
    const summe = g.reduce((s, x) => s + gruppenBreite(x.reihen, B46), 0) + 2 * ABSTAND.gruppen;
    expect(summe).toBeLessThanOrEqual(budgetFuer("a4-quer"));
  });
  it("breite Kinder zählen mit ihrem Zeilenblock: sechs à 88 mm (zwei Einheitenspalten) und eines à 208 mm (Seitenstellen)", () => {
    const breite = (s: Stelle) => (s.id === "k6" ? 208 : 88);
    const g = bildeGruppen(reihe(7, () => "v1"), breite, budgetFuer("a4-quer"), immer)[0];
    expect(g.reihen.map((r) => r.length)).toEqual([3, 3, 1]);
    expect(gruppenBreite(g.reihen, breite)).toBeLessThanOrEqual(budgetFuer("a4-quer"));
  });
  it("eine Gruppe, in der ein Kind eigene Unterstellen zeigt, kämmt nie", () => {
    expect(bildeGruppen(reihe(8, () => "v1"), B46, 100, (s) => s.id !== "k3")[0].reihen).toHaveLength(1);
  });
  it("endet, auch wenn nichts mehr schrumpfen kann (jedes Kind allein breiter als das Budget)", () => {
    expect(bildeGruppen(reihe(8, () => "v1"), () => 500, 100, immer)[0].reihen.map((r) => r.length)).toEqual([1, 1, 1, 1, 1, 1, 1, 1]);
  });
});
```

`K/_lib/layout/sicht.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { baue } from "../beispiele/bau";
import { baueSicht } from "./sicht";

const plan = baue({
  verbindungen: [{ id: "v", art: "tmo", bezeichnung: "R_UE_1" }],
  stellen: [
    { id: "w", titel: "W" },
    { id: "s", titel: "S", eltern: "w", lage: "rechts", verbindung: "v" },
    { id: "a", titel: "A", eltern: "w" },
    { id: "a1", titel: "A1", eltern: "a" },
    { id: "a1s", titel: "A1s", eltern: "a1", lage: "links" },
    { id: "b", titel: "B", eltern: "w" },
  ],
});

describe("Sicht", () => {
  it("ohne Optionen ist alles sichtbar", () => {
    const s = baueSicht(plan);
    expect(s.sichtbar.map((x) => x.id)).toEqual(["w", "s", "a", "a1", "a1s", "b"]);
    expect(s.tiefe("a1")).toBe(2);
    expect(s.einklappbar("a")).toBe(true);
    expect(s.einklappbar("b")).toBe(false);
    expect(s.verbindung("v")?.bezeichnung).toBe("R_UE_1");
    expect(s.verbindung(null)).toBeNull();
  });
  it("eingeklappt: Kinder weg, Abzeichenzahl, eigene Seitenstellen bleiben", () => {
    const s = baueSicht(plan, { eingeklappt: new Set(["w", "b"]) });
    expect(s.kinder("w")).toEqual([]);
    expect(s.versteckt("w")).toBe(4);
    expect(s.seiten("w").rechts.map((x) => x.id)).toEqual(["s"]);
    expect(s.eingeklappt("b")).toBe(false); // ohne Unterstellen wirkungslos
    expect(s.sichtbar.map((x) => x.id)).toEqual(["w", "s"]);
  });
  it("Verweis: weder Kinder noch Seitenstellen", () => {
    const s = baueSicht(plan, { darstellung: new Map([["a1", { verweisAufBlatt: 2 }]]) });
    expect(s.kinder("a1")).toEqual([]);
    expect(s.seiten("a1").links).toEqual([]);
    expect(s.darstellung("a1")).toEqual({ verweisAufBlatt: 2 });
  });
  it("Blatt mit Anker: Anker ist einzige Wurzel mit genau einem Kind", () => {
    const s = baueSicht(plan, { blatt: { wurzelId: "a", ankerId: "w" } });
    expect(s.wurzeln.map((x) => x.id)).toEqual(["w"]);
    expect(s.darstellung("w")).toBe("anker");
    expect(s.kinder("w").map((x) => x.id)).toEqual(["a"]);
    expect(s.seiten("w")).toEqual({ links: [], rechts: [] });
    expect(s.sichtbar.map((x) => x.id)).toEqual(["w", "a", "a1", "a1s"]);
    expect(s.einklappbar("w")).toBe(false);
  });
  it("Blatt ohne Anker (Wurzelblatt eines Teilbaums einer Wurzel)", () => {
    expect(baueSicht(plan, { blatt: { wurzelId: "w", ankerId: null } }).wurzeln.map((x) => x.id)).toEqual(["w"]);
  });
});
```

- [ ] **Step 2: Rot sehen**

Run: `pnpm vitest run src/app/m/kommplan/_lib/layout/gruppen.test.ts src/app/m/kommplan/_lib/layout/sicht.test.ts`
Expected: FAIL — Module fehlen.

- [ ] **Step 3: Implementieren**

`K/_lib/layout/gruppen.ts`:
```ts
import type { Stelle } from "../plan/schema";
import { LINIEN_LUFT } from "./kontur";
import { ABSTAND, BLATT, MIN_MASSSTAB, PAPIER } from "./masse";
import type { Ziel } from "./typen";

/** Schlüssel der Gruppe „ohne Verbindung" — `~` ist in IDs nicht erlaubt, kollidiert also nie. */
export const OHNE_VERBINDUNG = "~";

export interface Gruppe { schluessel: string; verbindungId: string | null; kinder: Stelle[]; reihen: Stelle[][] }

const EPS = 1e-6;
/** Die neue Grenze einer schrumpfenden Gruppe liegt so weit unter ihrer heute breitesten Reihe. */
const SCHRITT = 1e-3;

/**
 * Spec §5.5: das Breitenbudget einer Kinderreihe folgt aus dem Zielformat bei Mindestmaßstab;
 * der Bildschirm nimmt das Budget von A3.
 */
export function budgetFuer(ziel: Ziel): number {
  const format = ziel === "bildschirm" ? "a3-quer" : ziel;
  return (PAPIER[format].breite - 2 * BLATT.randX) / MIN_MASSSTAB;
}

export function reihenBreite<T>(reihe: readonly T[], breite: (k: T) => number): number {
  return reihe.reduce((s, k) => s + breite(k), 0) + Math.max(0, reihe.length - 1) * ABSTAND.geschwister;
}

/** Gierig nach Breite: eine neue Reihe, sobald `grenze` überschritten wäre; jede Reihe trägt mindestens ein Kind. */
export function reihenNachBreite<T>(kinder: readonly T[], breite: (k: T) => number, grenze: number): T[][] {
  const reihen: T[][] = [];
  let aktuell: T[] = [];
  let b = 0;
  for (const k of kinder) {
    const w = breite(k);
    const mit = aktuell.length === 0 ? w : b + ABSTAND.geschwister + w;
    if (aktuell.length > 0 && mit > grenze + EPS) { reihen.push(aktuell); aktuell = [k]; b = w; }
    else { aktuell.push(k); b = mit; }
  }
  if (aktuell.length > 0) reihen.push(aktuell);
  return reihen;
}

/** Breite einer Gruppe: ihre breiteste Reihe; bricht sie um, dazu der Kammrücken links samt Linienluft. */
export function gruppenBreite<T>(reihen: readonly (readonly T[])[], breite: (k: T) => number): number {
  const max = Math.max(0, ...reihen.map((r) => reihenBreite(r, breite)));
  return reihen.length > 1 ? max + ABSTAND.kammEinzug + LINIEN_LUFT / 2 : max;
}

function teile(kinder: readonly Stelle[]): Omit<Gruppe, "reihen">[] {
  const nachSchluessel = new Map<string, Stelle[]>();
  for (const k of kinder) {
    const s = k.verbindungId ?? OHNE_VERBINDUNG;
    nachSchluessel.set(s, [...(nachSchluessel.get(s) ?? []), k]);
  }
  return [...nachSchluessel].map(([schluessel, ks]) => ({
    schluessel, verbindungId: schluessel === OHNE_VERBINDUNG ? null : schluessel, kinder: ks,
  }));
}

/**
 * DER KAMM (Spec §5.5, Abweichung 13) — über die GANZE Kinderreihe einer Stelle, gemessen in Breite.
 *
 * 1. Jede Gruppe steht einreihig; passen alle Gruppen samt Gruppenabständen ins Budget, fertig.
 * 2. Sonst schrumpft die breiteste kämmbare Gruppe (Gleichstand → die frühere): ihre neue Grenze
 *    liegt knapp unter ihrer heute breitesten Reihe, und ihre Kinder brechen gierig nach Breite um.
 *    Das wiederholt sich, bis alles passt oder keine Gruppe mehr schrumpfen kann.
 *
 * Jede Gruppe bleibt zusammenhängend unter IHREM Bus („unter demselben Bus") und steht neben den
 * anderen — so bleibt der Stielbeweis aus Task 9 gültig. Eine Gruppe über mehrere Reihen VERSCHIEDENER
 * Gruppen zu verteilen hieße, Stiele durch fremde Reihen zu führen.
 *
 * Kämmbar ist eine Gruppe nur, wenn keines ihrer Kinder sichtbare Unterstellen hat (`kammfaehig`):
 * eine Kammreihe unter Teilbäumen stünde auf der Höhe fremder Enkel (§5.2). Eingeklappte Kinder und
 * Verweiskarten zählen als Blätter — die Sicht entscheidet, also wird nach jedem Schnitt neu gerechnet.
 *
 * ENDLICH: ein Schritt macht die breiteste Reihe der gewählten Gruppe echt schmaler — ein einzelnes
 * Kind, das allein breiter ist als die Grenze, steht allein und war vorher Teil einer breiteren
 * Reihe. Ist die breiteste Reihe schon ein einzelnes Kind, ist die Gruppe fest. Die möglichen
 * Reihenbreiten sind endlich. DETERMINISTISCH: nur Kinderfolge, Breiten und Budget gehen ein.
 */
export function bildeGruppen(
  kinder: readonly Stelle[], breite: (s: Stelle) => number, budget: number, kammfaehig: (s: Stelle) => boolean,
): Gruppe[] {
  const roh = teile(kinder);
  const reihen: Stelle[][][] = roh.map((g) => [g.kinder]);
  const fest = roh.map((g) => g.kinder.length < 2 || !g.kinder.every(kammfaehig));
  const gesamt = () =>
    reihen.reduce((s, r) => s + gruppenBreite(r, breite), 0) + Math.max(0, roh.length - 1) * ABSTAND.gruppen;
  while (gesamt() > budget + EPS) {
    let wahl = -1;
    for (let i = 0; i < roh.length; i++) {
      if (fest[i]) continue;
      if (wahl < 0 || gruppenBreite(reihen[i], breite) > gruppenBreite(reihen[wahl], breite) + EPS) wahl = i;
    }
    if (wahl < 0) break;
    const breiteste = Math.max(...reihen[wahl].map((r) => reihenBreite(r, breite)));
    if (reihen[wahl].some((r) => r.length === 1 && reihenBreite(r, breite) >= breiteste - EPS)) { fest[wahl] = true; continue; }
    reihen[wahl] = reihenNachBreite(roh[wahl].kinder, breite, breiteste - SCHRITT);
  }
  return roh.map((g, i) => ({ ...g, reihen: reihen[i] }));
}

export function gruppenAnzahl(kinder: readonly Stelle[]): number {
  return new Set(kinder.map((k) => k.verbindungId ?? OHNE_VERBINDUNG)).size;
}

export function anzeigereihenfolge(kinder: readonly Stelle[]): Stelle[] {
  return teile(kinder).flatMap((g) => g.kinder);
}
```

`K/_lib/layout/sicht.ts`:
```ts
import { baueBaum, versteckteAnzahl } from "../plan/baum";
import type { PlanInhalt, Stelle, Verbindung } from "../plan/schema";
import type { Darstellung, LayoutOptionen } from "./typen";

/**
 * Was von einem Plan gerade zu sehen ist: Einklappen (Ansichtszustand, Spec §5.7), Verweiskarten
 * und Anker eines Druckblatts (Spec §5.6). Die Layout-Engine liest den Plan nur durch diese Sicht.
 */
export interface Sicht {
  wurzeln: Stelle[];
  sichtbar: Stelle[];
  kinder(id: string): Stelle[];
  seiten(id: string): { links: Stelle[]; rechts: Stelle[] };
  darstellung(id: string): Darstellung;
  versteckt(id: string): number;
  eingeklappt(id: string): boolean;
  einklappbar(id: string): boolean;
  verbindung(id: string | null): Verbindung | null;
  tiefe(id: string): number;
}

const KEINE = { links: [] as Stelle[], rechts: [] as Stelle[] };

export function baueSicht(inhalt: PlanInhalt, optionen: LayoutOptionen = {}): Sicht {
  const baum = baueBaum(inhalt);
  const verbindungen = new Map(inhalt.verbindungen.map((v) => [v.id, v]));
  const ankerId = optionen.blatt?.ankerId ?? null;
  const blattWurzel = optionen.blatt ? baum.stelle(optionen.blatt.wurzelId) : undefined;
  if (optionen.blatt && !blattWurzel) throw new Error(`Blattwurzel ${optionen.blatt.wurzelId} fehlt`);

  const darstellung = (id: string): Darstellung => (id === ankerId ? "anker" : optionen.darstellung?.get(id) ?? "normal");
  const istVerweis = (id: string) => typeof darstellung(id) === "object";
  const zu = (id: string) => optionen.eingeklappt?.has(id) === true && baum.unter(id).length > 0 && darstellung(id) === "normal";
  const kinder = (id: string): Stelle[] => {
    if (id === ankerId && blattWurzel) return [blattWurzel];
    if (istVerweis(id) || zu(id) || darstellung(id) === "anker") return [];
    return baum.unter(id);
  };
  const seiten = (id: string) => (id === ankerId || istVerweis(id) ? KEINE : baum.seiten(id));

  const wurzeln = optionen.blatt ? [baum.stelle(ankerId ?? optionen.blatt.wurzelId)!] : baum.wurzeln;
  const sichtbar: Stelle[] = [];
  const tiefen = new Map<string, number>();
  const besuche = (s: Stelle, t: number) => {
    sichtbar.push(s); tiefen.set(s.id, t);
    const sei = seiten(s.id);
    for (const x of [...sei.links, ...sei.rechts]) { sichtbar.push(x); tiefen.set(x.id, t); }
    for (const k of kinder(s.id)) besuche(k, t + 1);
  };
  wurzeln.forEach((w) => besuche(w, 0));

  return {
    wurzeln, sichtbar, kinder, seiten, darstellung,
    versteckt: (id) => (zu(id) ? versteckteAnzahl(baum, id) : 0),
    eingeklappt: zu,
    einklappbar: (id) => id !== ankerId && darstellung(id) === "normal" && baum.unter(id).length > 0,
    verbindung: (id) => (id === null ? null : verbindungen.get(id) ?? null),
    tiefe: (id) => tiefen.get(id) ?? 0,
  };
}
```

(Tiefe einer Seitenstelle = Tiefe ihrer Elternstelle — sie steht in derselben Zeile.)

- [ ] **Step 4: Grün sehen**

Run: `pnpm vitest run src/app/m/kommplan/_lib/layout`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/app/m/kommplan/_lib/layout/gruppen.ts src/app/m/kommplan/_lib/layout/sicht.ts src/app/m/kommplan/_lib/layout/gruppen.test.ts src/app/m/kommplan/_lib/layout/sicht.test.ts
git commit -S -m "feat(kommplan): Busgruppen je Verbindung, Kamm-Budget und Sicht mit Einklappen" -m "DRK-500" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Sammler und Seitenstellen

**Files:**
- Create: `K/_lib/layout/sammler.ts`, `K/_lib/layout/seiten.ts`
- Test: `K/_lib/layout/seiten.test.ts`

**Interfaces:**
- Consumes: `kontur.ts` (Task 6), `KartenMass` (Task 5), `SechseckMass`/`sechseckMass` (Task 5), `Sicht`, `Gruppe` (Task 7), `typen.ts`.
- Produces:
  - `sammler.ts`: `interface Teilbaum { kontur: Kontur; unten: number; elemente: Elemente; mitte: number }` (lokale Koordinaten: Wurzelkarte oben links = 0/0; `mitte` = x der Kartenmitte); `class Sammler` mit `belege(x, y, b, h)`, `karte(stelle, mass, x, y, zustand: { einklappbar: boolean; eingeklappt: boolean })` (zeichnet auch die Kanal-Sechsecke und -Linien der Karte, Netz `<stelle>#kanal`), `linie(netz, x1, y1, x2, y2, duenn)`, `sechseck(netz, verbindung, mass, x, y)`, `spanne(stelleId, links, rechts)`, `uebernimm(t: Teilbaum, dx, dy)`, `fertig(mitte, mindestUnten): Teilbaum`. Jede Methode, die zeichnet, belegt zugleich Platz in der Kontur.
  - `seiten.ts`: `interface Umgebung { sicht: Sicht; masse(s: Stelle): KartenMass; zeilen: Zeilen; budget: number; gruppen(s: Stelle): Gruppe[] }` (Typ `Zeilen` aus Task 9 — in diesem Task als `import type` nach vorn deklariert, siehe Step 3; `Gruppe` aus Task 7); `seitenAbstand(sechsecke: (SechseckMass | null)[]): number`; `seitenBreite(stellen: Stelle[], u: Pick<Umgebung, "sicht" | "masse">): number` (wie weit ein Seitenstapel über die Elternkarte bzw. ihren Block hinausragt; 0 ohne Seitenstellen); `stapelOben(eltern: KartenMass, erste: KartenMass): number`; `stapelHoehe(eltern: KartenMass, masse: KartenMass[]): number`; `setzeSeiten(s: Sammler, eltern: Stelle, m: KartenMass, seite: "links" | "rechts", stellen: Stelle[], u: Pick<Umgebung, "sicht" | "masse">): void`.

Geometrie (Spec §5.3 und Abweichung 4): die erste Seitenstelle sitzt so, dass ihre Kopfmitte auf der Kopfmitte der Elternstelle liegt (nie über der Zeilenoberkante); weitere stapeln sich darunter im Abstand 4. Links liegt der rechte **Block**rand bei `−seitenAbstand`, rechts der linke Kartenrand bei `Elternblockbreite + seitenAbstand` (ein zweispaltiger Einheitenblock der Elternstelle ragt nach rechts). Die Schiene liegt 3 mm außerhalb der Elternkarte (rechts: außerhalb des Elternblocks), jeder Zweig läuft waagerecht auf Kopfmitte der Seitenstelle, das Sechseck sitzt mittig zwischen Schiene und Kartenkante. Der erste Zweig beginnt an der Kante der Elternkarte. Netz: `<eltern><links` bzw. `<eltern><rechts`.

- [ ] **Step 1: Failing test**

`K/_lib/layout/seiten.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { baue, type StelleEingabe } from "../beispiele/bau";
import { kartenMass } from "./karte";
import { ABSTAND, KARTE } from "./masse";
import { Sammler } from "./sammler";
import { sechseckMass } from "./sechseck";
import { seitenAbstand, seitenBreite, setzeSeiten, stapelHoehe } from "./seiten";
import { baueSicht } from "./sicht";

function lege(stellen: StelleEingabe[], seite: "links" | "rechts") {
  const inhalt = baue({ verbindungen: [{ id: "v", art: "draht", bezeichnung: "Standleitung" }], stellen });
  const sicht = baueSicht(inhalt);
  const masse = (s: (typeof inhalt.stellen)[number]) =>
    kartenMass({ stelle: s, leerzeilen: false, darstellung: "normal", versteckt: 0, anzahlGruppen: 0, kanaele: [] });
  const eltern = sicht.wurzeln[0];
  const m = masse(eltern);
  const s = new Sammler();
  s.karte(eltern, m, 0, 0, { einklappbar: false, eingeklappt: false });
  const liste = sicht.seiten(eltern.id)[seite];
  setzeSeiten(s, eltern, m, seite, liste, { sicht, masse });
  return { s, m, liste, masse, sicht };
}

describe("Seitenstellen", () => {
  it("eine Seitenstelle links: Kopfmitte auf Kopfmitte, waagerechte Linie mit Sechseck", () => {
    const { s, m } = lege([{ id: "stab", titel: "Stab" }, { id: "katsl", titel: "KatSL", eltern: "stab", lage: "links", verbindung: "v" }], "links");
    const k = s.elemente.karten.find((x) => x.id === "katsl")!;
    expect(k.y + k.kopfHoehe / 2).toBeCloseTo(m.kopfHoehe / 2, 9);
    expect(k.x + k.breite).toBeCloseTo(-seitenAbstand([sechseckMass({ id: "v", art: "draht", bezeichnung: "Standleitung" })]), 9);
    const linie = s.elemente.linien.find((l) => l.y1 === l.y2)!;
    expect(linie).toMatchObject({ x1: 0, x2: k.x + k.breite, netz: "stab<links", duenn: false });
    const hex = s.elemente.sechsecke[0];
    expect(hex.y + hex.hoehe / 2).toBeCloseTo(linie.y1, 9);
    expect(hex.x).toBeGreaterThan(k.x + k.breite);
    expect(hex.x + hex.breite).toBeLessThan(-ABSTAND.seiteSchiene);
  });
  it("seitenBreite: wie weit der Stapel über die Elternstelle hinausragt", () => {
    const { s, liste, masse, sicht } = lege([{ id: "stab", titel: "Stab" }, { id: "katsl", titel: "KatSL", eltern: "stab", lage: "links", verbindung: "v" }], "links");
    const k = s.elemente.karten.find((x) => x.id === "katsl")!;
    expect(seitenBreite(liste, { sicht, masse })).toBeCloseTo(-k.x, 9);
    expect(seitenBreite([], { sicht, masse })).toBe(0);
  });
  it("ohne Verbindung: dünne Linie, kein Sechseck", () => {
    const { s } = lege([{ id: "a", titel: "A" }, { id: "b", titel: "B", eltern: "a", lage: "rechts" }], "rechts");
    expect(s.elemente.sechsecke).toEqual([]);
    expect(s.elemente.linien.every((l) => l.duenn)).toBe(true);
  });
  it("rechts neben einem zweispaltigen Einheitenblock", () => {
    const einheiten = Array.from({ length: 12 }, (_, i) => `RTW ${i}`);
    const { s, m } = lege([{ id: "a", titel: "A", einheiten }, { id: "b", titel: "B", eltern: "a", lage: "rechts", verbindung: "v" }], "rechts");
    expect(m.blockBreite).toBeGreaterThan(KARTE.breite);
    const k = s.elemente.karten.find((x) => x.id === "b")!;
    expect(k.x).toBeGreaterThanOrEqual(m.blockBreite + ABSTAND.seiteSchiene);
  });
  it("drei Seitenstellen links stapeln sich an einer Schiene", () => {
    const { s, m, liste, masse } = lege([
      { id: "a", titel: "A" },
      { id: "s1", titel: "S1", eltern: "a", lage: "links", verbindung: "v", einheiten: ["KdoW 40-10-1"] },
      { id: "s2", titel: "S2", eltern: "a", lage: "links" },
      { id: "s3", titel: "S3", eltern: "a", lage: "links", verbindung: "v" },
    ], "links");
    const karten = ["s1", "s2", "s3"].map((id) => s.elemente.karten.find((k) => k.id === id)!);
    for (let i = 1; i < 3; i++) expect(karten[i].y).toBeGreaterThanOrEqual(karten[i - 1].y + masse(liste[i - 1]).blockHoehe + ABSTAND.seitenStapel - 1e-9);
    const schiene = s.elemente.linien.find((l) => l.x1 === l.x2)!;
    expect(schiene.x1).toBe(-ABSTAND.seiteSchiene);
    expect(schiene.y1).toBeCloseTo(karten[0].y + karten[0].kopfHoehe / 2, 9);
    expect(schiene.y2).toBeCloseTo(karten[2].y + karten[2].kopfHoehe / 2, 9);
    expect(s.unten).toBeCloseTo(stapelHoehe(m, liste.map(masse)), 9);
  });
});
```

- [ ] **Step 2: Rot sehen**

Run: `pnpm vitest run src/app/m/kommplan/_lib/layout/seiten.test.ts`
Expected: FAIL — `./sammler`, `./seiten` fehlen.

- [ ] **Step 3: Implementieren**

`K/_lib/layout/sammler.ts`:
```ts
import type { Stelle, Verbindung } from "../plan/schema";
import type { KartenMass } from "./karte";
import { LEER, rechteck, strecke, vereinige, verschiebe, type Kontur } from "./kontur";
import type { SechseckMass } from "./sechseck";
import { leereElemente, verschiebeElemente, type Elemente } from "./typen";

export interface Teilbaum { kontur: Kontur; unten: number; elemente: Elemente; mitte: number }

/**
 * Sammelt gezeichnete Elemente UND belegt ihren Platz in der Kontur — in EINEM Aufruf. Ein Element,
 * das gezeichnet, aber nicht belegt wird, wäre die Einladung an den Nachbarn, darüber zu packen.
 */
export class Sammler {
  elemente: Elemente = leereElemente();
  kontur: Kontur = LEER;
  unten = 0;

  belege(x: number, y: number, b: number, h: number): void {
    this.kontur = vereinige(this.kontur, rechteck(x, y, b, h));
    this.unten = Math.max(this.unten, y + h);
  }

  karte(stelle: Stelle, m: KartenMass, x: number, y: number, zustand: { einklappbar: boolean; eingeklappt: boolean }): void {
    this.elemente.karten.push({
      id: stelle.id, x, y, breite: m.breite, hoehe: m.hoehe, kopfHoehe: m.kopfHoehe, art: m.art,
      hervorheben: stelle.hervorheben, zeichen: stelle.zeichen, titel: m.titel, titelVoll: m.titelVoll,
      gekuerzt: m.gekuerzt, leiter: m.leiter, kontakte: m.kontakte, verweis: m.verweis, ...zustand,
    });
    for (const e of m.einheiten) this.elemente.einheiten.push({ ...e, stelleId: stelle.id, x: x + e.x, y: y + e.y });
    if (m.abzeichen) this.elemente.abzeichen.push({ ...m.abzeichen, stelleId: stelle.id, x: x + m.abzeichen.x, y: y + m.abzeichen.y });
    // Kanäle (Abweichung 12): eigenes Netz ohne Bus; Linien und Sechsecke liegen im Block.
    const kanalNetz = `${stelle.id}#kanal`;
    for (const l of m.kanalLinien) this.linie(kanalNetz, x + l.x1, y + l.y1, x + l.x2, y + l.y2, false);
    for (const h of m.kanalSechsecke) this.sechseck(kanalNetz, h.verbindung, h.mass, x + h.x, y + h.y);
    this.belege(x, y, m.blockBreite, m.blockHoehe);
  }

  linie(netz: string, x1: number, y1: number, x2: number, y2: number, duenn: boolean): void {
    if (Math.abs(x1 - x2) < 1e-9 && Math.abs(y1 - y2) < 1e-9) return;
    this.elemente.linien.push({ netz, x1, y1, x2, y2, duenn });
    this.kontur = vereinige(this.kontur, strecke(x1, y1, x2, y2));
    this.unten = Math.max(this.unten, y1, y2);
  }

  sechseck(netz: string, v: Verbindung, m: SechseckMass, x: number, y: number): void {
    this.elemente.sechsecke.push({
      netz, verbindungId: v.id, art: v.art, form: m.form, x, y, breite: m.breite, hoehe: m.hoehe,
      beschriftung: m.beschriftung, voll: m.voll, piktogramm: m.piktogramm,
    });
    this.belege(x, y, m.breite, m.hoehe);
  }

  spanne(stelleId: string, links: number, rechts: number): void {
    this.elemente.spannen.push({ stelleId, links, rechts });
  }

  uebernimm(t: Teilbaum, dx: number, dy: number): void {
    const e = verschiebeElemente(t.elemente, dx, dy);
    this.elemente.karten.push(...e.karten);
    this.elemente.einheiten.push(...e.einheiten);
    this.elemente.linien.push(...e.linien);
    this.elemente.sechsecke.push(...e.sechsecke);
    this.elemente.abzeichen.push(...e.abzeichen);
    this.elemente.spannen.push(...e.spannen);
    this.kontur = vereinige(this.kontur, verschiebe(t.kontur, dx, dy));
    this.unten = Math.max(this.unten, t.unten + dy);
  }

  fertig(mitte: number, mindestUnten: number): Teilbaum {
    return { kontur: this.kontur, unten: Math.max(this.unten, mindestUnten), elemente: this.elemente, mitte };
  }
}
```

`K/_lib/layout/seiten.ts`:
```ts
import type { Stelle, Verbindung } from "../plan/schema";
import type { Gruppe } from "./gruppen";
import type { KartenMass } from "./karte";
import { ABSTAND, SECHSECK } from "./masse";
import type { Sammler } from "./sammler";
import { sechseckMass, type SechseckMass } from "./sechseck";
import type { Sicht } from "./sicht";
import type { Zeilen } from "./zeilen";

/** Alles, was das Teilbaum-Layout über den Plan wissen muss; gebaut von `umgebungFuer` (Task 9). */
export interface Umgebung {
  sicht: Sicht;
  masse(s: Stelle): KartenMass;
  zeilen: Zeilen;
  /** Kamm-Budget des Ziels (Layout-mm, `budgetFuer`). */
  budget: number;
  /** Die Busgruppen der sichtbaren Kinder samt Kammreihen (`bildeGruppen`), je Stelle einmal gerechnet. */
  gruppen(s: Stelle): Gruppe[];
}

export function seitenAbstand(sechsecke: (SechseckMass | null)[]): number {
  const breitestes = Math.max(0, ...sechsecke.map((s) => s?.breite ?? 0));
  return ABSTAND.seiteSchiene + 2 * ABSTAND.seiteLuft + Math.max(breitestes, ABSTAND.seiteOhneSechseck);
}

function sechseckeDer(stellen: Stelle[], u: Pick<Umgebung, "sicht">): ({ v: Verbindung; m: SechseckMass } | null)[] {
  return stellen.map((st) => {
    const v = u.sicht.verbindung(st.verbindungId);
    return v ? { v, m: sechseckMass(v) } : null;
  });
}

/** Wie weit ein Seitenstapel über die Elternkarte (links) bzw. ihren Block (rechts) hinausragt — Teil des Zeilenblocks im Kamm-Budget. */
export function seitenBreite(stellen: Stelle[], u: Pick<Umgebung, "sicht" | "masse">): number {
  if (stellen.length === 0) return 0;
  return seitenAbstand(sechseckeDer(stellen, u).map((x) => x?.m ?? null)) + Math.max(...stellen.map((st) => u.masse(st).blockBreite));
}

/** Die erste Seitenstelle so tief, dass ihre Kopfmitte auf der Kopfmitte der Elternstelle liegt — nie über der Zeile. */
export function stapelOben(eltern: KartenMass, erste: KartenMass): number {
  return Math.max(0, eltern.kopfHoehe / 2 - erste.kopfHoehe / 2);
}

export function stapelHoehe(eltern: KartenMass, masse: KartenMass[]): number {
  if (masse.length === 0) return 0;
  return stapelOben(eltern, masse[0]) + masse.reduce((h, m) => h + m.blockHoehe, 0) + (masse.length - 1) * ABSTAND.seitenStapel;
}

export function setzeSeiten(
  s: Sammler, eltern: Stelle, m: KartenMass, seite: "links" | "rechts", stellen: Stelle[],
  u: Pick<Umgebung, "sicht" | "masse">,
): void {
  if (stellen.length === 0) return;
  const netz = `${eltern.id}<${seite}`;
  const masse = stellen.map((st) => u.masse(st));
  const sechsecke = sechseckeDer(stellen, u);
  const abstand = seitenAbstand(sechsecke.map((x) => x?.m ?? null));
  const links = seite === "links";
  const schieneX = links ? -ABSTAND.seiteSchiene : m.blockBreite + ABSTAND.seiteSchiene;
  const zweige: number[] = [];
  let oben = stapelOben(m, masse[0]);
  stellen.forEach((st, i) => {
    const sm = masse[i];
    const kx = links ? -abstand - sm.blockBreite : m.blockBreite + abstand;
    s.karte(st, sm, kx, oben, { einklappbar: false, eingeklappt: false });
    const y = oben + sm.kopfHoehe / 2;
    zweige.push(y);
    const kante = links ? kx + sm.breite : kx;
    const von = i === 0 ? (links ? 0 : m.breite) : schieneX;
    const hex = sechsecke[i];
    s.linie(netz, von, y, kante, y, hex === null);
    if (hex) s.sechseck(netz, hex.v, hex.m, (schieneX + kante) / 2 - hex.m.breite / 2, y - SECHSECK.hoehe / 2);
    oben += sm.blockHoehe + ABSTAND.seitenStapel;
  });
  if (zweige.length > 1) s.linie(netz, schieneX, zweige[0], schieneX, zweige[zweige.length - 1], sechsecke.every((x) => x === null));
}
```

`seiten.ts` importiert `Zeilen` nur als Typ; lege für diesen Task eine vorläufige `K/_lib/layout/zeilen.ts` mit genau diesem Inhalt an, Task 9 ergänzt die Funktion:
```ts
/** Zeilenhöhe und Lücke darunter je Baumtiefe (global, damit alle Karten einer Zeile oben bündig stehen). */
export interface Zeilen { hoehe: number[]; luecke: number[] }
```

- [ ] **Step 4: Grün sehen**

Run: `pnpm vitest run src/app/m/kommplan/_lib/layout && pnpm typecheck`
Expected: PASS; Exit 0.

- [ ] **Step 5: Commit**

```bash
git add src/app/m/kommplan/_lib/layout/sammler.ts src/app/m/kommplan/_lib/layout/seiten.ts src/app/m/kommplan/_lib/layout/zeilen.ts src/app/m/kommplan/_lib/layout/seiten.test.ts
git commit -S -m "feat(kommplan): Seitenstellen auf Kopfhöhe, gestapelt an einer Schiene" -m "DRK-500" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: Zeilen und Teilbaum-Layout (Reingold-Tilford, Busse, Stiele, Kamm)

**Files:**
- Modify: `K/_lib/layout/zeilen.ts` (Funktion ergänzen)
- Create: `K/_lib/layout/teilbaum.ts`
- Test: `K/_lib/layout/teilbaum.test.ts`

**Interfaces:**
- Consumes: alles aus Task 5–8.
- Produces:
  - `zeilen.ts`: `berechneZeilen(sicht: Sicht, masse: (s: Stelle) => KartenMass): Zeilen` — `hoehe[t]` = größter Zeilenblock der Tiefe t (Kartenblock oder Seitenstapel), `luecke[t]` = `lueckeFuer(größte Gruppenzahl − 1 der Tiefe t)`.
  - `teilbaum.ts`: `umgebungFuer(inhalt: PlanInhalt, ziel: Ziel, optionen?: LayoutOptionen, budget?: number): Umgebung` (Sicht, gecachte Kartenmaße mit `anzahlGruppen = gruppenAnzahl(sicht.kinder(id))` und aufgelösten `kanaele`, Zeilen, `budget` = `budgetFuer(ziel)` sofern nicht übergeben, gecachte `gruppen(stelle)` = `bildeGruppen(sicht.kinder(id), zeilenblockBreite, budget, k => sicht.kinder(k.id).length === 0)`); `zeilenblockBreite(s: Stelle, u): number` (Seitenstapel links + Block + Seitenstapel rechts); `packe(konturen: readonly Kontur[], luecke: number): number[]`; `setzeTeilbaum(stelle: Stelle, tiefe: number, u: Umgebung): Teilbaum`. Netznamen: Gruppe `<eltern>><schluessel>` (Schlüssel = `verbindungId` oder `~`), Seite `<eltern><links|rechts`, Kanäle `<stelle>#kanal`.

Der Algorithmus je Stelle P in Tiefe t (lokale Koordinaten, P oben links = 0/0):
1. Karte, Einheiten, Abzeichen, Seitenstellen links/rechts (Task 8).
2. Keine sichtbaren Kinder → fertig; `unten` mindestens `zeilen.hoehe[t]`.
3. Kinderzone oben = `zeilen.hoehe[t] + zeilen.luecke[t]`. Gruppen samt Kammreihen aus `u.gruppen(P)` (Task 7: Budget über die ganze Kinderreihe, nach Breite, nur Blattkinder kämmen). Je Gruppe: je Reihe die Kind-Teilbäume gierig von links packen (Lücke 8); Reihe r+1 beginnt 8 mm unter der tiefsten Kante von Reihe r (Kammkinder sind Blätter, die Kante ist also ihr Zeilenblock). Bus 4 mm über jeder Reihe (Reihe 0: der Bus; weitere: Zweige am Kammrücken 3 mm links der Gruppe), Abwurf je Kind. Sechseck 2 mm über dem Bus in der Mitte der Busspanne, Linie vom Sechseck zum Bus, und eine freie Bahn von der Zeilenunterkante bis zum Sechseck wird belegt.
4. Gruppen gierig von links packen (Lücke 12). Busspanne = linkes Ende der ersten bis rechtes Ende der letzten Gruppe; P mittig darüber (Spec §5.2).
5. Stiele: Ansatz `a_i` gleichmäßig über die Kartenunterkante (`breite·(i+1)/(k+1)`) bzw. mit Einheiten in der Gasse (`m.gasse`); Ziel `c_i` = Mitte der Busspanne der Gruppe. `c_i = a_i` → gerade; sonst Knick auf `zeilen.hoehe[t] + 2 + Rang·1,5`, Rang zählt von außen (links ab der kleinsten Gruppe, rechts ab der größten).

**Warum die Stiele kreuzungsfrei sind** (für den Code-Kommentar und die Prüfung): `a` und `c` sind streng steigend (Gruppen sind von links gepackt, Ansätze gleichmäßig verteilt). Für i < j: (1) beide links (`c < a`): die Knicke `[c_i, a_i]` und `[c_j, a_j]` können überlappen; i ist außen und knickt höher, also endet der Stiel von j (bei `a_j > a_i`) unterhalb des Knicks von i nicht auf ihm, und der Abstieg von i (bei `c_i < c_j`) liegt links des Knicks von j. (2) beide rechts: spiegelbildlich. (3) i links, j rechts: `[c_i, a_i]` und `[a_j, c_j]` sind getrennt, weil `a_i < a_j`. (4) i rechts, j links: `[a_i, c_i]` endet bei `c_i < c_j`, also vor `[c_j, a_j]`. Alle Knicke liegen über den Sechsecken (`lueckeFuer`), Sechsecke und Busse verschiedener Gruppen trennt das Gruppenpacken. **Mehrreihige Gruppen neben anderen Gruppen** (Abweichung 13): der Kammrücken einer Gruppe liegt 3 mm links ihrer eigenen Inhalte und ist Teil ihrer Kontur; die Reihenbusse laufen vom Rücken nach rechts nur über die eigene Gruppe. Das Gruppenpacken hält 12 mm zwischen den Konturen, also schneidet kein Rücken, Reihenbus oder Abwurf einen fremden Bus, Stiel oder Kasten; der Stiel jeder Gruppe endet am Sechseck über ihrer ersten Reihe, oberhalb aller Reihen — für die Stiele ist eine mehrreihige Gruppe dasselbe wie eine einreihige. **Kanäle** (Abweichung 12): die Stiele laufen in der Gasse links der Kanallinie, die Kanalzweige nach rechts; die Knicke liegen unter der Zeilenunterkante, also unter jedem Kanal-Sechseck.

- [ ] **Step 1: Failing test**

`K/_lib/layout/teilbaum.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { baue, type StelleEingabe } from "../beispiele/bau";
import type { Verbindung } from "../plan/schema";
import { budgetFuer } from "./gruppen";
import { maxX, minX } from "./kontur";
import { ABSTAND, EINHEIT, KARTE, STIEL } from "./masse";
import { setzeTeilbaum, umgebungFuer } from "./teilbaum";
import type { KarteL, Ziel } from "./typen";

const V: Verbindung[] = [
  { id: "v2", art: "tmo", bezeichnung: "R_UE_2" },
  { id: "v3", art: "tmo", bezeichnung: "R_UE_3" },
  { id: "v4", art: "dmo", bezeichnung: "DMO 608" },
];
function setze(stellen: StelleEingabe[], budget?: number, ziel: Ziel = "bildschirm") {
  const u = umgebungFuer(baue({ verbindungen: V, stellen }), ziel, {}, budget);
  const t = setzeTeilbaum(u.sicht.wurzeln[0], 0, u);
  const karte = (id: string) => t.elemente.karten.find((k) => k.id === id)!;
  return { t, u, karte };
}
const mitte = (k: KarteL) => k.x + k.breite / 2;
const kinder = (eltern: string, n: number, verbindung?: string): StelleEingabe[] =>
  Array.from({ length: n }, (_, i) => ({ id: `${eltern}${i}`, titel: `K${i}`, eltern, verbindung }));

describe("Teilbaum", () => {
  it("Elternstelle mittig über der Busspanne; Kinder oben bündig im Abstand 8", () => {
    const { t, u, karte } = setze([{ id: "r", titel: "R" }, ...kinder("r", 3, "v2")]);
    const sp = t.elemente.spannen.find((s) => s.stelleId === "r")!;
    expect(mitte(karte("r"))).toBeCloseTo((sp.links + sp.rechts) / 2, 9);
    const ks = ["r0", "r1", "r2"].map(karte);
    expect(new Set(ks.map((k) => k.y)).size).toBe(1);
    expect(ks[0].y).toBeCloseTo(u.zeilen.hoehe[0] + u.zeilen.luecke[0], 9);
    expect(ks[1].x - ks[0].x).toBeCloseTo(KARTE.breite + ABSTAND.geschwister, 9);
  });

  it("zwei Verbindungen: zwei Sechsecke, zwei Netze, getrennte Busse, eigene Stiele ab der Kartenunterkante", () => {
    const { t, karte } = setze([{ id: "el", titel: "EL" }, ...kinder("el", 3, "v2"), { id: "d", titel: "D", eltern: "el", verbindung: "v3" }]);
    expect(t.elemente.sechsecke.map((s) => s.beschriftung.text).sort()).toEqual(["R_UE_2", "R_UE_3"]);
    expect(karte("d").x - (karte("el2").x + KARTE.breite)).toBeGreaterThanOrEqual(ABSTAND.gruppen - 1e-9);
    const el = karte("el");
    for (const netz of ["el>v2", "el>v3"]) {
      const linien = t.elemente.linien.filter((l) => l.netz === netz);
      expect(linien.some((l) => l.x1 === l.x2 && l.y1 === el.hoehe && l.x1 > el.x && l.x1 < el.x + el.breite), netz).toBe(true);
    }
    const busY = karte("el0").y - STIEL.busZuKarte;
    const busse = t.elemente.linien.filter((l) => l.y1 === l.y2 && Math.abs(l.y1 - busY) < 1e-9 && l.x1 !== l.x2);
    expect(busse.map((b) => b.netz)).toEqual(["el>v2"]); // v3 hat nur ein Kind: kein waagerechter Bus
  });

  it("Kinder ohne Verbindung: dünne Linie, kein Sechseck", () => {
    const { t } = setze([{ id: "r", titel: "R" }, ...kinder("r", 2)]);
    expect(t.elemente.sechsecke).toEqual([]);
    expect(t.elemente.linien.every((l) => l.duenn)).toBe(true);
  });

  it("Kamm: 8 Kinder, Budget 320 mm (6 × 46 + 5 × 8 = 316) → zwei Reihen unter demselben Bus, Rücken links", () => {
    const { t, karte } = setze([{ id: "r", titel: "R" }, ...kinder("r", 8, "v2")], 320);
    const reihe0 = [0, 1, 2, 3, 4, 5].map((i) => karte(`r${i}`));
    const reihe1 = [6, 7].map((i) => karte(`r${i}`));
    expect(new Set(reihe0.map((k) => k.y)).size).toBe(1);
    expect(reihe1[0].y).toBeCloseTo(reihe1[1].y, 9);
    expect(reihe1[0].y).toBeGreaterThanOrEqual(reihe0[0].y + reihe0[0].hoehe + ABSTAND.kammReihe - 1e-9);
    expect(reihe1[0].x).toBeCloseTo(reihe0[0].x, 9);
    const ruecken = t.elemente.linien.find((l) => l.netz === "r>v2" && l.x1 === l.x2 && l.x1 < reihe0[0].x)!;
    expect(ruecken.x1).toBeCloseTo(reihe0[0].x - ABSTAND.kammEinzug, 9);
    expect(ruecken.y2).toBeCloseTo(reihe1[0].y - STIEL.busZuKarte, 9);
  });

  it("das Budget gilt für die ganze Kinderreihe: drei Verbindungen à fünf Kinder auf A4 kämmen alle", () => {
    const stellen: StelleEingabe[] = [{ id: "r", titel: "R" },
      ...["v2", "v3", "v4"].flatMap((v) => kinder(`r-${v}-`, 5, v).map((k) => ({ ...k, eltern: "r" })))];
    const { t, u, karte } = setze(stellen, undefined, "a4-quer");
    expect(u.gruppen(u.sicht.wurzeln[0]).map((g) => g.reihen.length)).toEqual([3, 3, 3]);
    const r = karte("r");
    const breite = maxX(t.kontur) - minX(t.kontur);
    expect(breite).toBeLessThanOrEqual(budgetFuer("a4-quer"));
    expect(breite).toBeGreaterThan(r.breite);
  });

  it("Kinder mit eigenen Unterstellen kämmen nicht — auch wenn die Reihe das Budget sprengt", () => {
    const stellen: StelleEingabe[] = [{ id: "r", titel: "R" }];
    for (let i = 0; i < 12; i++) {
      stellen.push({ id: `eal${i}`, titel: `EAL ${i}`, eltern: "r", verbindung: "v2" });
      for (let e = 0; e < 3; e++) stellen.push({ id: `ea-${i}-${e}`, titel: `EA ${e}`, eltern: `eal${i}`, verbindung: "v4" });
    }
    const { u } = setze(stellen);
    expect(u.gruppen(u.sicht.wurzeln[0]).map((g) => g.reihen.length)).toEqual([1]);
  });

  it("Einheiten und Kinder: der Stiel läuft in der Gasse links neben der Einheitenspalte", () => {
    const { t, karte } = setze([{ id: "r", titel: "R", einheiten: ["RTW 1", "RTW 2"] }, ...kinder("r", 2, "v2")]);
    const r = karte("r");
    const stiel = t.elemente.linien.find((l) => l.netz === "r>v2" && l.x1 === l.x2 && l.y1 === r.hoehe)!;
    expect(stiel.x1).toBeCloseTo(STIEL.gasseStart, 9);
    const ersteEinheit = t.elemente.einheiten.find((e) => e.stelleId === "r")!;
    expect(stiel.x1).toBeLessThan(ersteEinheit.x);
    expect(stiel.y2).toBeGreaterThanOrEqual(ersteEinheit.y + EINHEIT.hoehe);
  });

  it("Kanäle und Kinder: Stiel links in der Gasse, Kanallinie rechts daneben, Sechsecke im Block", () => {
    const { t, karte } = setze([
      { id: "r", titel: "R", kanaele: ["v4", "v3"], einheiten: ["RTW 1"] }, ...kinder("r", 2, "v2"),
    ]);
    const r = karte("r");
    const stiel = t.elemente.linien.find((l) => l.netz === "r>v2" && l.x1 === l.x2 && l.y1 === r.hoehe)!;
    const kanal = t.elemente.linien.find((l) => l.netz === "r#kanal" && l.x1 === l.x2)!;
    expect(stiel.x1).toBeLessThan(kanal.x1);
    expect(t.elemente.sechsecke.filter((s) => s.netz === "r#kanal").map((s) => s.verbindungId)).toEqual(["v4", "v3"]);
    const ersteEinheit = t.elemente.einheiten.find((e) => e.stelleId === "r")!;
    expect(ersteEinheit.y).toBeGreaterThan(Math.max(...t.elemente.sechsecke.filter((s) => s.netz === "r#kanal").map((s) => s.y)));
  });

  it("ein schmaler, tiefer Nachbar rückt an die Karte heran, nicht an die breite Ebene darunter", () => {
    const { karte } = setze([
      { id: "r", titel: "R" }, { id: "a", titel: "A", eltern: "r" }, { id: "a1", titel: "A1", eltern: "a" },
      ...kinder("a1", 6), { id: "b", titel: "B", eltern: "r" },
    ]);
    expect(karte("b").x - karte("a").x).toBeCloseTo(KARTE.breite + ABSTAND.geschwister, 9);
  });

  it("die Einheitenspalte belegt Platz: ein Nachbar rückt nicht hinein", () => {
    const zwoelf = Array.from({ length: 12 }, (_, i) => `RTW ${i}`);
    const { karte } = setze([{ id: "r", titel: "R" }, { id: "a", titel: "A", eltern: "r", einheiten: zwoelf }, { id: "b", titel: "B", eltern: "r" }]);
    expect(karte("b").x - karte("a").x).toBeCloseTo(EINHEIT.einzugMin + 2 * EINHEIT.breite + EINHEIT.spaltenAbstand + ABSTAND.geschwister, 9);
  });

  it("alle Karten einer Tiefe stehen oben bündig, auch über Teilbäume hinweg", () => {
    const neun = Array.from({ length: 9 }, (_, i) => `KTW ${i}`);
    const { karte } = setze([
      { id: "r", titel: "R" }, { id: "a", titel: "A", eltern: "r", einheiten: neun }, { id: "a1", titel: "A1", eltern: "a" },
      { id: "b", titel: "B", eltern: "r" }, { id: "b1", titel: "B1", eltern: "b" },
    ]);
    expect(karte("a1").y).toBeCloseTo(karte("b1").y, 9);
  });
});
```

- [ ] **Step 2: Rot sehen**

Run: `pnpm vitest run src/app/m/kommplan/_lib/layout/teilbaum.test.ts`
Expected: FAIL — `./teilbaum` fehlt.

- [ ] **Step 3: Implementieren**

`K/_lib/layout/zeilen.ts` (ersetzt die vorläufige Fassung):
```ts
import type { Stelle } from "../plan/schema";
import { gruppenAnzahl } from "./gruppen";
import type { KartenMass } from "./karte";
import { lueckeFuer } from "./masse";
import { stapelHoehe } from "./seiten";
import type { Sicht } from "./sicht";

/** Zeilenhöhe und Lücke darunter je Baumtiefe (global, damit alle Karten einer Zeile oben bündig stehen). */
export interface Zeilen { hoehe: number[]; luecke: number[] }

export function berechneZeilen(sicht: Sicht, masse: (s: Stelle) => KartenMass): Zeilen {
  const hoehe: number[] = [];
  const knicke: number[] = [];
  for (const st of sicht.sichtbar) {
    if (st.lage !== "unter" && sicht.darstellung(st.id) !== "anker") continue; // Seitenstellen zählen über ihren Stapel
    const t = sicht.tiefe(st.id);
    const m = masse(st);
    const seiten = sicht.seiten(st.id);
    const block = Math.max(m.blockHoehe, stapelHoehe(m, seiten.links.map(masse)), stapelHoehe(m, seiten.rechts.map(masse)));
    hoehe[t] = Math.max(hoehe[t] ?? 0, block);
    const kinder = sicht.kinder(st.id);
    if (kinder.length > 0) knicke[t] = Math.max(knicke[t] ?? 0, gruppenAnzahl(kinder) - 1);
  }
  for (let t = 0; t < hoehe.length; t++) hoehe[t] = hoehe[t] ?? 0;
  return { hoehe, luecke: hoehe.map((_, t) => lueckeFuer(knicke[t] ?? 0)) };
}
```

`K/_lib/layout/teilbaum.ts`:
```ts
import type { PlanInhalt, Stelle, Verbindung } from "../plan/schema";
import { bildeGruppen, budgetFuer, gruppenAnzahl, type Gruppe } from "./gruppen";
import { kartenMass, type KartenMass } from "./karte";
import { LEER, istLeer, minX, nebeneinander, vereinige, verschiebe, type Kontur } from "./kontur";
import { ABSTAND, SECHSECK, STIEL } from "./masse";
import { Sammler, type Teilbaum } from "./sammler";
import { sechseckMass } from "./sechseck";
import { seitenBreite, setzeSeiten, type Umgebung } from "./seiten";
import { baueSicht } from "./sicht";
import type { LayoutOptionen, Ziel } from "./typen";
import { berechneZeilen } from "./zeilen";

const EPS = 1e-6;

/** Der Zeilenblock eines Kindes im Kamm-Budget: Seitenstapel links + Karten-/Einheitenblock + Seitenstapel rechts. */
export function zeilenblockBreite(st: Stelle, u: Pick<Umgebung, "sicht" | "masse">): number {
  const seiten = u.sicht.seiten(st.id);
  return seitenBreite(seiten.links, u) + u.masse(st).blockBreite + seitenBreite(seiten.rechts, u);
}

export function umgebungFuer(inhalt: PlanInhalt, ziel: Ziel, optionen: LayoutOptionen = {}, budget = budgetFuer(ziel)): Umgebung {
  const sicht = baueSicht(inhalt, optionen);
  const cache = new Map<string, KartenMass>();
  const masse = (st: Stelle): KartenMass => {
    let m = cache.get(st.id);
    if (!m) {
      m = kartenMass({
        stelle: st, leerzeilen: inhalt.optionen.leerzeilen, darstellung: sicht.darstellung(st.id),
        versteckt: sicht.versteckt(st.id), anzahlGruppen: gruppenAnzahl(sicht.kinder(st.id)),
        kanaele: st.kanaele.map((id) => sicht.verbindung(id)).filter((v): v is Verbindung => v !== null),
      });
      cache.set(st.id, m);
    }
    return m;
  };
  const gruppenCache = new Map<string, Gruppe[]>();
  const gruppen = (st: Stelle): Gruppe[] => {
    let g = gruppenCache.get(st.id);
    if (!g) {
      g = bildeGruppen(sicht.kinder(st.id), (k) => zeilenblockBreite(k, { sicht, masse }), budget, (k) => sicht.kinder(k.id).length === 0);
      gruppenCache.set(st.id, g);
    }
    return g;
  };
  return { sicht, masse, zeilen: berechneZeilen(sicht, masse), budget, gruppen };
}

/** Gierig von links: jedes Teil so weit links wie seine Kontur es neben den bisherigen erlaubt. */
export function packe(konturen: readonly Kontur[], luecke: number): number[] {
  let zone: Kontur = LEER;
  return konturen.map((k) => {
    const dx = istLeer(zone) ? -minX(k) : nebeneinander(zone, k, luecke);
    zone = vereinige(zone, verschiebe(k, dx, 0));
    return dx;
  });
}

interface GesetzteGruppe { gruppe: Gruppe; teil: Teilbaum; busL: number; busR: number; mitte: number }

/** Eine Busgruppe in ihrem eigenen Rahmen: y = 0 ist die Kartenoberkante ihrer ersten Reihe. */
function setzeGruppe(g: Gruppe, eltern: Stelle, tiefe: number, u: Umgebung): GesetzteGruppe {
  const s = new Sammler();
  const netz = `${eltern.id}>${g.schluessel}`;
  const verbindung = u.sicht.verbindung(g.verbindungId);
  const duenn = verbindung === null;
  const reihenOben: number[] = [];
  const mitten: number[][] = [];
  let oben = 0;
  for (const reihe of g.reihen) {
    const teile = reihe.map((k) => setzeTeilbaum(k, tiefe + 1, u));
    const xs = packe(teile.map((t) => t.kontur), ABSTAND.geschwister);
    teile.forEach((t, i) => s.uebernimm(t, xs[i], oben));
    reihenOben.push(oben);
    mitten.push(teile.map((t, i) => xs[i] + t.mitte));
    oben += Math.max(...teile.map((t) => t.unten)) + ABSTAND.kammReihe;
  }
  const kamm = g.reihen.length > 1;
  const ruecken = kamm ? minX(s.kontur) - ABSTAND.kammEinzug : 0;
  mitten.forEach((ms, r) => {
    const y = reihenOben[r] - STIEL.busZuKarte;
    const links = kamm ? ruecken : Math.min(...ms);
    const rechts = Math.max(...ms);
    if (rechts > links + EPS) s.linie(netz, links, y, rechts, y, duenn);
    for (const x of ms) s.linie(netz, x, y, x, reihenOben[r], duenn);
  });
  const busY = -STIEL.busZuKarte;
  if (kamm) s.linie(netz, ruecken, busY, ruecken, reihenOben[reihenOben.length - 1] - STIEL.busZuKarte, duenn);
  const busL = kamm ? ruecken : Math.min(...mitten[0]);
  const busR = Math.max(...mitten[0]);
  const mitte = (busL + busR) / 2;
  const luecke = u.zeilen.luecke[tiefe];
  if (verbindung) {
    const hm = sechseckMass(verbindung);
    const hexOben = busY - STIEL.sechseckZuBus - SECHSECK.hoehe;
    s.sechseck(netz, verbindung, hm, mitte - hm.breite / 2, hexOben);
    s.linie(netz, mitte, hexOben + SECHSECK.hoehe, mitte, busY, false);
    s.belege(mitte - 0.25, -luecke, 0.5, luecke + hexOben); // freie Bahn für den Stiel bis zum Sechseck
  } else {
    s.belege(mitte - 0.25, -luecke, 0.5, luecke + busY);
  }
  return { gruppe: g, teil: s.fertig(mitte, 0), busL, busR, mitte };
}

/**
 * DIE STIELE (Spec §5.2, Abweichung 5 im Umsetzungsplan): jede Gruppe einen eigenen, ab der
 * Kartenunterkante. Kreuzungsfrei, weil Ansatz a und Ziel c streng steigen und äußere Gruppen
 * höher knicken — Fallunterscheidung im Umsetzungsplan Phase 1, Task 9.
 */
function verlegeStiele(
  s: Sammler, stelle: Stelle, m: KartenMass, gruppen: { schluessel: string; mitVerbindung: boolean; c: number }[],
  zeilenUnten: number, kinderOben: number,
): void {
  const k = gruppen.length;
  const a = m.gasse.length === k ? m.gasse : gruppen.map((_, i) => (m.breite * (i + 1)) / (k + 1));
  const indizes = gruppen.map((_, i) => i);
  const links = indizes.filter((i) => gruppen[i].c < a[i] - EPS);
  const rechts = indizes.filter((i) => gruppen[i].c > a[i] + EPS);
  const rang = new Map<number, number>();
  links.forEach((i, r) => rang.set(i, r));
  [...rechts].reverse().forEach((i, r) => rang.set(i, r));
  const busY = kinderOben - STIEL.busZuKarte;
  const hexOben = busY - STIEL.sechseckZuBus - SECHSECK.hoehe;
  gruppen.forEach((g, i) => {
    const netz = `${stelle.id}>${g.schluessel}`;
    const duenn = !g.mitVerbindung;
    const ende = g.mitVerbindung ? hexOben : busY;
    const r = rang.get(i);
    if (r === undefined) { s.linie(netz, a[i], m.hoehe, a[i], ende, duenn); return; }
    const knick = zeilenUnten + STIEL.ersterKnick + r * STIEL.knickTakt;
    s.linie(netz, a[i], m.hoehe, a[i], knick, duenn);
    s.linie(netz, a[i], knick, g.c, knick, duenn);
    s.linie(netz, g.c, knick, g.c, ende, duenn);
  });
}

export function setzeTeilbaum(stelle: Stelle, tiefe: number, u: Umgebung): Teilbaum {
  const m = u.masse(stelle);
  const s = new Sammler();
  s.karte(stelle, m, 0, 0, { einklappbar: u.sicht.einklappbar(stelle.id), eingeklappt: u.sicht.eingeklappt(stelle.id) });
  const seiten = u.sicht.seiten(stelle.id);
  setzeSeiten(s, stelle, m, "links", seiten.links, u);
  setzeSeiten(s, stelle, m, "rechts", seiten.rechts, u);
  const zeilenUnten = u.zeilen.hoehe[tiefe];
  const kinder = u.sicht.kinder(stelle.id);
  if (kinder.length === 0) return s.fertig(m.breite / 2, zeilenUnten);

  const kinderOben = zeilenUnten + u.zeilen.luecke[tiefe];
  const gruppen = u.gruppen(stelle).map((g) => setzeGruppe(g, stelle, tiefe, u));
  const versatz = packe(gruppen.map((g) => g.teil.kontur), ABSTAND.gruppen);
  const spanneL = gruppen[0].busL + versatz[0];
  const spanneR = gruppen[gruppen.length - 1].busR + versatz[gruppen.length - 1];
  const dx = m.breite / 2 - (spanneL + spanneR) / 2;
  gruppen.forEach((g, i) => s.uebernimm(g.teil, versatz[i] + dx, kinderOben));
  s.spanne(stelle.id, spanneL + dx, spanneR + dx);
  verlegeStiele(
    s, stelle, m,
    gruppen.map((g, i) => ({ schluessel: g.gruppe.schluessel, mitVerbindung: g.gruppe.verbindungId !== null, c: g.mitte + versatz[i] + dx })),
    zeilenUnten, kinderOben,
  );
  return s.fertig(m.breite / 2, zeilenUnten);
}
```

`zeilen.ts` importiert `stapelHoehe` aus `seiten.ts`, `seiten.ts` importiert `Zeilen` nur als Typ — kein Laufzeitzyklus.

- [ ] **Step 4: Grün sehen**

Run: `pnpm vitest run src/app/m/kommplan/_lib/layout && pnpm typecheck`
Expected: PASS; Exit 0. Schlägt „ein schmaler, tiefer Nachbar" fehl, zuerst prüfen, ob die belegte „freie Bahn" einer Gruppe (`belege` über der Sechseckhöhe) die Zeile der Elternkarte überdeckt — sie beginnt bei `−luecke`, also genau an der Zeilenunterkante, nicht darüber.

- [ ] **Step 5: Commit**

```bash
git add src/app/m/kommplan/_lib/layout/zeilen.ts src/app/m/kommplan/_lib/layout/teilbaum.ts src/app/m/kommplan/_lib/layout/teilbaum.test.ts
git commit -S -m "feat(kommplan): Teilbaum-Layout mit Busgruppen, eigenen Stielen und Kamm" -m "Reingold-Tilford mit Skyline-Konturen, gierig von links: schmale, tiefe Teilbäume rücken zusammen, die Elternstelle steht mittig über ihrer Busspanne, und gestaffelte Knicke schließen Kreuzungen aus." -m "DRK-500" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 10: Ganze Zeichnung, Wurzeln nebeneinander, Legende

**Files:**
- Create: `K/_lib/layout/zeichne.ts`
- Test: `K/_lib/layout/zeichne.test.ts`

**Interfaces:**
- Consumes: `umgebungFuer`, `setzeTeilbaum`, `packe` (Task 9), `Sammler` (Task 8), `ART_NAME`, `VERBINDUNGS_ARTEN` (Task 3).
- Produces: `zeichne(inhalt: PlanInhalt, ziel: Ziel, optionen?: LayoutOptionen): Zeichnungsdaten` (normiert: kleinstes x und y = 0; leerer Plan → `breite = hoehe = 0`); `legende(inhalt: PlanInhalt, sicht: Sicht): LegendenEintrag[]` — erst die Arten der **gezeichneten** Verbindungen (die Verbindung jeder sichtbaren Stelle außer den Wurzeln der Sicht, dazu die Kanäle jeder sichtbaren normalen Karte) in der Reihenfolge von `VERBINDUNGS_ARTEN` mit `ART_NAME`, dann jede Verbindung, die im **ganzen** Plan weder `verbindungId` noch Kanal einer Stelle ist, als `Reserve <Bezeichnung>` (Spec §4.2, §5.6, Abweichung 12).

- [ ] **Step 1: Failing test**

`K/_lib/layout/zeichne.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { baue } from "../beispiele/bau";
import { leererPlan } from "../plan/operationen";
import { ABSTAND } from "./masse";
import { zeichne } from "./zeichne";

const V = [
  { id: "r1", art: "tmo" as const, bezeichnung: "R_UE_1" },
  { id: "d", art: "draht" as const, bezeichnung: "Standleitung" },
  { id: "k2", art: "tmo" as const, bezeichnung: "K_UE_2" },
];

describe("zeichne", () => {
  it("leerer Plan: nichts, Breite und Höhe 0, keine Legende", () => {
    expect(zeichne(leererPlan(), "bildschirm")).toMatchObject({ breite: 0, hoehe: 0, karten: [], linien: [], legende: [] });
  });
  it("jede sichtbare Stelle genau einmal als Karte, normiert auf 0/0", () => {
    const p = baue({ verbindungen: V, stellen: [
      { id: "lts", titel: "Leitstelle" }, { id: "el", titel: "EL", eltern: "lts", verbindung: "r1" },
      { id: "s", titel: "S", eltern: "el", lage: "links", verbindung: "d" },
    ] });
    const z = zeichne(p, "bildschirm");
    expect(z.karten.map((k) => k.id).sort()).toEqual(["el", "lts", "s"]);
    const xs = [...z.karten.map((k) => k.x), ...z.linien.flatMap((l) => [l.x1, l.x2]), ...z.sechsecke.map((s) => s.x)];
    expect(Math.min(...xs)).toBeGreaterThanOrEqual(0);
    expect(Math.min(...xs)).toBeLessThan(1);
    expect(Math.min(...z.karten.map((k) => k.y))).toBe(0);
    expect(Math.max(...z.karten.map((k) => k.x + k.breite))).toBeLessThanOrEqual(z.breite + 1e-9);
  });
  it("mehrere Wurzeln stehen nebeneinander, oben bündig, mit 16 mm Abstand", () => {
    const z = zeichne(baue({ stellen: [{ id: "a", titel: "A" }, { id: "b", titel: "B" }] }), "bildschirm");
    const [a, b] = ["a", "b"].map((id) => z.karten.find((k) => k.id === id)!);
    expect(a.y).toBe(b.y);
    expect(b.x - (a.x + a.breite)).toBeCloseTo(ABSTAND.wurzeln, 6);
  });
  it("Legende: gezeichnete Arten in fester Reihenfolge, dann Reserve", () => {
    const p = baue({ verbindungen: V, stellen: [
      { id: "lts", titel: "L" }, { id: "el", titel: "EL", eltern: "lts", verbindung: "r1" },
      { id: "s", titel: "S", eltern: "el", lage: "links", verbindung: "d" },
    ] });
    expect(zeichne(p, "bildschirm").legende).toEqual([
      { art: "tmo", text: "Digitalfunk TMO", reserve: false },
      { art: "draht", text: "Draht", reserve: false },
      { art: "tmo", text: "Reserve K_UE_2", reserve: true },
    ]);
  });
  it("ein benutzter Kanal ist keine Reserve, seine Art steht in der Legende", () => {
    const p = baue({ verbindungen: [...V, { id: "dmo", art: "dmo", bezeichnung: "DMO 608" }], stellen: [
      { id: "lts", titel: "L" }, { id: "ea", titel: "EA", eltern: "lts", verbindung: "r1", kanaele: ["dmo", "k2"] },
    ] });
    expect(zeichne(p, "bildschirm").legende).toEqual([
      { art: "tmo", text: "Digitalfunk TMO", reserve: false },
      { art: "dmo", text: "Digitalfunk DMO", reserve: false },
      { art: "draht", text: "Reserve Standleitung", reserve: true },
    ]);
  });
  it("Plan nur mit Reservekanälen: Legende nur Reserve", () => {
    const p = baue({ verbindungen: [V[2]], stellen: [{ id: "a", titel: "A" }] });
    expect(zeichne(p, "a4-quer").legende).toEqual([{ art: "tmo", text: "Reserve K_UE_2", reserve: true }]);
  });
  it("Einklappen: Kinder verschwinden, das Abzeichen zählt sie", () => {
    const p = baue({ stellen: [{ id: "w", titel: "W" }, { id: "a", titel: "A", eltern: "w" }, { id: "b", titel: "B", eltern: "a" }] });
    const z = zeichne(p, "bildschirm", { eingeklappt: new Set(["w"]) });
    expect(z.karten.map((k) => k.id)).toEqual(["w"]);
    expect(z.abzeichen[0].text.text).toBe("+2 Stellen");
    expect(z.karten[0]).toMatchObject({ einklappbar: true, eingeklappt: true });
  });
});
```

- [ ] **Step 2: Rot sehen**

Run: `pnpm vitest run src/app/m/kommplan/_lib/layout/zeichne.test.ts`
Expected: FAIL — `./zeichne` fehlt.

- [ ] **Step 3: Implementieren**

`K/_lib/layout/zeichne.ts`:
```ts
import { ART_NAME, VERBINDUNGS_ARTEN, type PlanInhalt, type VerbindungsArt } from "../plan/schema";
import { istLeer, maxX, minX } from "./kontur";
import { ABSTAND } from "./masse";
import { Sammler } from "./sammler";
import type { Sicht } from "./sicht";
import { packe, setzeTeilbaum, umgebungFuer } from "./teilbaum";
import { verschiebeElemente, type LayoutOptionen, type LegendenEintrag, type Zeichnungsdaten, type Ziel } from "./typen";

export function legende(inhalt: PlanInhalt, sicht: Sicht): LegendenEintrag[] {
  const wurzeln = new Set(sicht.wurzeln.map((w) => w.id));
  const gezeichnet = new Set<VerbindungsArt>();
  for (const s of sicht.sichtbar) {
    const v = wurzeln.has(s.id) ? null : sicht.verbindung(s.verbindungId);
    if (v) gezeichnet.add(v.art);
    if (sicht.darstellung(s.id) !== "normal") continue; // Anker und Verweise zeigen keine Kanäle
    for (const k of s.kanaele) {
      const kanal = sicht.verbindung(k);
      if (kanal) gezeichnet.add(kanal.art);
    }
  }
  // „Reserve" = weder Weg zur Elternstelle noch Kanal irgendeiner Stelle (Abweichung 12).
  const benutzt = new Set(inhalt.stellen.flatMap((s) => [s.verbindungId, ...s.kanaele]).filter((x): x is string => x !== null));
  return [
    ...VERBINDUNGS_ARTEN.filter((a) => gezeichnet.has(a)).map((art) => ({ art, text: ART_NAME[art], reserve: false })),
    ...inhalt.verbindungen.filter((v) => !benutzt.has(v.id)).map((v) => ({ art: v.art, text: `Reserve ${v.bezeichnung}`, reserve: true })),
  ];
}

/** Die ganze Zeichnung einer Sicht: Wurzeln gierig nebeneinander, dann auf 0/0 normiert. */
export function zeichne(inhalt: PlanInhalt, ziel: Ziel, optionen: LayoutOptionen = {}): Zeichnungsdaten {
  const u = umgebungFuer(inhalt, ziel, optionen);
  const teile = u.sicht.wurzeln.map((w) => setzeTeilbaum(w, 0, u));
  const s = new Sammler();
  const xs = packe(teile.map((t) => t.kontur), ABSTAND.wurzeln);
  teile.forEach((t, i) => s.uebernimm(t, xs[i], 0));
  if (istLeer(s.kontur)) return { ...s.elemente, breite: 0, hoehe: 0, legende: legende(inhalt, u.sicht) };
  const links = minX(s.kontur);
  const oben = Math.min(0, ...s.kontur.links.map((st) => st.y0));
  return {
    ...verschiebeElemente(s.elemente, -links, -oben),
    breite: maxX(s.kontur) - links,
    hoehe: s.unten - oben,
    legende: legende(inhalt, u.sicht),
  };
}
```

- [ ] **Step 4: Grün sehen**

Run: `pnpm vitest run src/app/m/kommplan/_lib/layout`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/app/m/kommplan/_lib/layout/zeichne.ts src/app/m/kommplan/_lib/layout/zeichne.test.ts
git commit -S -m "feat(kommplan): ganze Zeichnung mit Wurzeln nebeneinander und Legende samt Reserve" -m "DRK-500" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 11: Geometrieprüfung, Zufallspläne und Eigenschaftstests

**Files:**
- Create: `K/_lib/layout/pruefung.ts`, `K/_lib/layout/zufall.ts`
- Test: `K/_lib/layout/pruefung.test.ts`, `K/_lib/layout/eigenschaften.test.ts`

**Interfaces:**
- Consumes: `zeichne` (Task 10), `baue` (Task 4), `fuegeStelleEin`, `baueBaum`, `nachkommen` (Task 4), `anzeigereihenfolge` (Task 7), `umgebungFuer` (Task 9), `MINDEST` (Task 2).
- Produces:
  - `pruefung.ts`: `interface Befund { art: "ueberlappung" | "abstand" | "kreuzung" | "naehe" | "durchstich" | "kante" | "schraeg" | "mitte" | "verbindung"; text: string }`; `besitzerVon(netz: string): string`; `pruefeZeichnung(z: Zeichnungsdaten): Befund[]` — die **negative** Hälfte: Kästen (Karten, Einheiten, Sechsecke, Abzeichen) derselben Stelle überlappen nicht, Kästen verschiedener Stellen halten `MINDEST.kasten` (2 mm, auch schräg); Strecken verschiedener Netze berühren sich nicht und liegen parallel nicht näher als `MINDEST.linie` (0,75 mm); keine Strecke durchsticht einen Kasten — Ausnahme nur für eine **waagerechte** Strecke desselben Netzes genau durch die Mitte ihres Sechsecks; keine Strecke läuft auf der Kante eines Kastens entlang (außer ihres eigenen Sechsecks; ein Ende, das die Kante trifft, ist in Ordnung); jede Strecke ist waagerecht oder senkrecht; Toleranz 0,01 mm. `pruefeMitte(z)` (jede Elternstelle mittig über ihrer Spanne). `pruefeVerbindungen(z: Zeichnungsdaten, inhalt: PlanInhalt): Befund[]` — die **positive** Hälfte: jede gezeichnete Unterstelle, deren Elternstelle gezeichnet ist, hat einen senkrechten Abwurf eines Netzes `<eltern>>…`, der auf der Mitte ihrer Kartenoberkante endet; jede gezeichnete Seitenstelle einen waagerechten Zweig `<eltern><links|rechts>`, der auf Kopfmitte an ihrer Kartenkante endet; jedes Sechseck hängt an einer Linie seines Netzes (Mitte oben/unten, Spitze links/rechts oder eine waagerechte Linie durch seine Mitte); jedes Netz ist zusammenhängend (Sechsecke verbinden, was an ihnen hängt) und beginnt an der Karte seines Besitzers (Unterkante für `>` und `#kanal`, linke/rechte Kante für `<links`/`<rechts`). Alle drei benutzen die Eigenschafts-, Beispiel-, Aufteilungstests und das Vorschau-Skript (Task 15).
  - `zufall.ts`: `mulberry32(seed: number): () => number`; `zufallsPlan(seed: number, o: { stellen: number; mehrereWurzeln?: boolean; leerzeilen?: boolean; form?: "frei" | "stab" }): PlanInhalt` (`frei`: Zufallsrekursivbaum wie bisher, jetzt auch mit leeren Titeln und Kanälen; `stab`: Stab mit Seitenstellen → TEL → 3–14 EAL an 1–2 Verbindungen → je 0–12 EA an einer Verbindung, Seitenstellen auch an EA, selten Unterstellen an EA — die Form der großen Stab-Lage, in der Kämme entstehen); `mische<T>(liste: readonly T[], seed: number): T[]` (Fisher-Yates); `alsGliederung(inhalt: PlanInhalt): string` (eingerückter Baum für Fehlermeldungen, damit ein roter Seed ohne Shrinking nachvollziehbar bleibt).

**Warum eigener Zufall statt fast-check:** fast-check brächte Shrinking, aber auch eine neue Abhängigkeit und einen zweiten Zufallsbegriff neben dem deterministischen Seed, den Golden- und Vorschau-Skript ohnehin brauchen. Ein fester Seed-Bereich mit `alsGliederung` in der Fehlermeldung macht jeden Fehlschlag reproduzierbar (`zufallsPlan(seed, …)` im Vorschau-Skript öffnen); das genügt für eine reine Funktion ohne Zustand.

**Die Einfüge-Eigenschaft, präzise** (Spec §10 „Einfügen verschiebt nichts links von ihr"): Mit Zentrieren über der Busspanne bewegt jede Einfügung die Vorfahren; ein absoluter Vergleich wäre falsch. Das gierige Links-Packen garantiert dagegen: Für jede Stelle C auf der Kette neu → Elternstelle → … → Wurzel behalten alle Karten in den Teilbäumen der **früheren Geschwister von C** (Anzeigereihenfolge: Gruppe für Gruppe, Kammreihe für Kammreihe) ihre Lage **zueinander**, und keine vorhandene Karte ändert ihr y. Voraussetzung, die der Test herstellt: die neue Stelle ist minimal (keine Kontakte, keine Einheiten), wird letzte Unterstelle ihrer Elternstelle und tritt der Verbindung des bisher letzten Kindes bei (sonst entstünde eine neue Gruppe mit neuem Knick, und die Ebenenlücke wüchse zu Recht); und **weder vorher noch nachher kämmt irgendeine Gruppe** — ein Kamm verteilt das Budget der ganzen Kinderreihe neu (Abweichung 13), eine zusätzliche Stelle darf dort also auch frühere Gruppen umbrechen.
Über Ebenen hinweg gilt die Aussage **nicht**: eine zentrierende Vorfahrin kann ihre früheren Geschwister gegen die Kinder eines Nachbarn verschieben — das ist Absicht (Spec: „jede Elternstelle steht mittig").

- [ ] **Step 1: Failing tests**

`K/_lib/layout/pruefung.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { baue } from "../beispiele/bau";
import { leereElemente, type Zeichnungsdaten } from "./typen";
import { pruefeMitte, pruefeVerbindungen, pruefeZeichnung } from "./pruefung";
import { zeichne } from "./zeichne";

const leer = (): Zeichnungsdaten => ({ ...leereElemente(), breite: 100, hoehe: 100, legende: [] });
const karte = (id: string, x: number, y: number) => ({
  id, x, y, breite: 46, hoehe: 12, kopfHoehe: 12, art: "normal" as const, hervorheben: false, zeichen: null,
  titel: [], titelVoll: id, gekuerzt: false, leiter: null, kontakte: [], verweis: null, einklappbar: false, eingeklappt: false,
});
const linie = (netz: string, x1: number, y1: number, x2: number, y2: number) => ({ netz, x1, y1, x2, y2, duenn: false });
const sechseck = (netz: string, x: number, y: number) => ({
  netz, verbindungId: "v", art: "tmo" as const, form: "funk" as const, x, y, breite: 26, hoehe: 6,
  beschriftung: { text: "", x: 0, y: 0, groesse: 8, fett: true, anker: "mitte" as const }, voll: "", piktogramm: "comms.voice-radio-tmo",
});
const arten = (z: Zeichnungsdaten) => pruefeZeichnung(z).map((b) => b.art);

describe("pruefeZeichnung — Kästen", () => {
  it("findet überlappende Karten", () => {
    expect(arten({ ...leer(), karten: [karte("a", 0, 0), karte("b", 40, 5)] })).toEqual(["ueberlappung"]);
  });
  it("Karten verschiedener Stellen, die sich berühren oder weniger als 2 mm Luft haben, sind ein Befund", () => {
    expect(arten({ ...leer(), karten: [karte("a", 0, 0), karte("b", 46, 0)] })).toEqual(["abstand"]);
    expect(arten({ ...leer(), karten: [karte("a", 0, 0), karte("b", 47.5, 0)] })).toEqual(["abstand"]);
    expect(arten({ ...leer(), karten: [karte("a", 0, 0), karte("b", 0, 13)] })).toEqual(["abstand"]);
    expect(arten({ ...leer(), karten: [karte("a", 0, 0), karte("b", 48, 0)] })).toEqual([]);
  });
  it("Kästen derselben Stelle dürfen dicht liegen, nur nicht überlappen", () => {
    const einheit = { id: "e", stelleId: "a", x: 6, y: 13.3, breite: 40, hoehe: 4.2, voll: "RTW", zeichen: null,
      text: { text: "RTW", x: 20, y: 3, groesse: 8, fett: false, anker: "mitte" as const } };
    expect(arten({ ...leer(), karten: [karte("a", 0, 0)], einheiten: [einheit] })).toEqual([]);
    expect(arten({ ...leer(), karten: [karte("a", 0, 0)], einheiten: [{ ...einheit, y: 10 }] })).toEqual(["ueberlappung"]);
  });
});

describe("pruefeZeichnung — Linien", () => {
  it("findet Kreuzungen verschiedener Netze, nicht innerhalb eines Netzes", () => {
    const z = { ...leer(), linien: [linie("a", 0, 5, 10, 5), linie("b", 5, 0, 5, 10), linie("a", 5, 5, 5, 20)] };
    expect(pruefeZeichnung(z).filter((b) => b.art === "kreuzung")).toHaveLength(2);
  });
  it("parallele Linien verschiedener Netze brauchen 0,75 mm", () => {
    expect(arten({ ...leer(), linien: [linie("a", 0, 5, 10, 5), linie("b", 0, 5.5, 10, 5.5)] })).toEqual(["naehe"]);
    expect(arten({ ...leer(), linien: [linie("a", 3, 0, 3, 10), linie("b", 3.5, 2, 3.5, 20)] })).toEqual(["naehe"]);
    expect(arten({ ...leer(), linien: [linie("a", 0, 5, 10, 5), linie("b", 0, 6, 10, 6)] })).toEqual([]);
  });
  it("findet eine Linie durch eine Karte, aber nicht bis an ihre Kante", () => {
    const k = karte("a", 0, 10);
    expect(arten({ ...leer(), karten: [k], linien: [linie("n", 20, 0, 20, 10)] })).toEqual([]);
    expect(arten({ ...leer(), karten: [k], linien: [linie("n", 20, 0, 20, 15)] })).toEqual(["durchstich"]);
  });
  it("eine Linie, die auf der Kante eines Kastens entlangläuft, ist ein Befund", () => {
    expect(arten({ ...leer(), karten: [karte("a", 0, 10)], linien: [linie("n", 5, 10, 30, 10)] })).toEqual(["kante"]);
    expect(arten({ ...leer(), karten: [karte("a", 0, 10)], linien: [linie("n", 46, 12, 46, 30)] })).toEqual(["kante"]);
  });
  it("ein Sechseck lässt nur den waagerechten Zweig seines Netzes durch seine Mitte", () => {
    const h = sechseck("p<links", 10, 0);
    expect(arten({ ...leer(), sechsecke: [h], linien: [linie("p<links", 0, 3, 40, 3)] })).toEqual([]);
    expect(arten({ ...leer(), sechsecke: [h], linien: [linie("p<links", 0, 2, 40, 2)] })).toEqual(["durchstich"]);
    expect(arten({ ...leer(), sechsecke: [h], linien: [linie("p<links", 20, -5, 20, 10)] })).toEqual(["durchstich"]);
    expect(arten({ ...leer(), sechsecke: [h], linien: [linie("q<links", 0, 3, 40, 3)] })).toEqual(["durchstich"]);
  });
  it("schräge Linien sind ein Befund", () => {
    expect(arten({ ...leer(), linien: [linie("n", 0, 0, 5, 5)] })).toEqual(["schraeg"]);
  });
});

describe("pruefeMitte", () => {
  it("meldet eine Elternstelle neben ihrer Spanne", () => {
    const z = { ...leer(), karten: [karte("p", 0, 0)], spannen: [{ stelleId: "p", links: 10, rechts: 50 }] };
    expect(pruefeMitte(z)).toHaveLength(1);
    expect(pruefeMitte({ ...z, spannen: [{ stelleId: "p", links: 0, rechts: 46 }] })).toEqual([]);
  });
});

/**
 * DIE POSITIVE HÄLFTE: eine Zeichnung mit weniger Linien hat für `pruefeZeichnung` weniger
 * Befunde. Jede Mutation hier nimmt der echten Engine-Ausgabe etwas weg und muss rot werden.
 */
describe("pruefeVerbindungen", () => {
  const p = baue({
    verbindungen: [
      { id: "v", art: "tmo", bezeichnung: "R_UE_2" }, { id: "d", art: "draht", bezeichnung: "Standleitung" },
      { id: "k", art: "dmo", bezeichnung: "DMO 608" },
    ],
    stellen: [
      { id: "w", titel: "W", kanaele: ["k"] },
      { id: "a", titel: "A", eltern: "w", verbindung: "v" }, { id: "b", titel: "B", eltern: "w", verbindung: "v" },
      { id: "s", titel: "S", eltern: "w", lage: "rechts", verbindung: "d" },
    ],
  });
  const z = zeichne(p, "bildschirm");
  const k = (id: string) => z.karten.find((x) => x.id === id)!;

  it("die vollständige Zeichnung der Engine ist angebunden", () => {
    expect(pruefeVerbindungen(z, p)).toEqual([]);
  });
  it("ohne Linien ist nichts angebunden", () => {
    expect(pruefeVerbindungen({ ...z, linien: [] }, p).length).toBeGreaterThanOrEqual(4);
  });
  it("fehlt ein Abwurf, nennt der Befund die Karte", () => {
    const a = k("a");
    const ohne = z.linien.filter((l) => !(l.netz === "w>v" && l.x1 === l.x2 && Math.abs(l.y2 - a.y) < 1e-6 && Math.abs(l.x1 - (a.x + a.breite / 2)) < 1e-6));
    expect(ohne).toHaveLength(z.linien.length - 1);
    expect(pruefeVerbindungen({ ...z, linien: ohne }, p).map((b) => b.text)).toContain("a hängt an keinem Bus von w");
  });
  it("fehlt das Stielstück an der Karte, beginnt das Netz nicht an seiner Stelle", () => {
    const w = k("w");
    const ohne = z.linien.filter((l) => !(l.netz === "w>v" && Math.abs(Math.min(l.y1, l.y2) - (w.y + w.hoehe)) < 1e-6));
    expect(pruefeVerbindungen({ ...z, linien: ohne }, p).some((b) => b.text.startsWith("Netz w>v"))).toBe(true);
  });
  it("ein Sechseck neben seiner Linie und eine Seitenstelle ohne Zweig sind Befunde", () => {
    const verschoben = z.sechsecke.map((h) => (h.netz === "w<rechts" ? { ...h, y: h.y + 3 } : h));
    expect(pruefeVerbindungen({ ...z, sechsecke: verschoben }, p).map((b) => b.art)).toContain("verbindung");
    const ohneZweig = z.linien.filter((l) => l.netz !== "w<rechts");
    expect(pruefeVerbindungen({ ...z, linien: ohneZweig }, p).map((b) => b.text)).toContain("s hängt an keinem Zweig von w");
  });
  it("ein Kanal-Sechseck ohne seine Linie ist ein Befund", () => {
    expect(pruefeVerbindungen({ ...z, linien: z.linien.filter((l) => l.netz !== "w#kanal") }, p).length).toBeGreaterThan(0);
  });
});
```

`K/_lib/layout/eigenschaften.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { baue } from "../beispiele/bau";
import { baueBaum, nachkommen } from "../plan/baum";
import { fuegeStelleEin } from "../plan/operationen";
import type { PlanInhalt } from "../plan/schema";
import { anzeigereihenfolge } from "./gruppen";
import { pruefeMitte, pruefeVerbindungen, pruefeZeichnung } from "./pruefung";
import { umgebungFuer } from "./teilbaum";
import type { Zeichnungsdaten, Ziel } from "./typen";
import { zeichne } from "./zeichne";
import { alsGliederung, mische, mulberry32, zufallsPlan } from "./zufall";

const SEEDS = Array.from({ length: 150 }, (_, i) => i + 1);
const STAB_SEEDS = Array.from({ length: 60 }, (_, i) => 1000 + i);
const erklaere = (seed: number, inhalt: PlanInhalt, text: string) => `Seed ${seed}: ${text}\n${alsGliederung(inhalt)}`;
const befundeVon = (z: Zeichnungsdaten, inhalt: PlanInhalt) =>
  [...pruefeZeichnung(z), ...pruefeMitte(z), ...pruefeVerbindungen(z, inhalt)];
/** Bricht irgendwo in diesem Plan eine Gruppe als Kamm um? */
function kaemmt(inhalt: PlanInhalt, ziel: Ziel): boolean {
  const u = umgebungFuer(inhalt, ziel);
  return u.sicht.sichtbar.some((s) => u.gruppen(s).some((g) => g.reihen.length > 1));
}

describe.each(["bildschirm", "a4-quer"] as const)("Zufallsbäume (%s)", (ziel) => {
  it.each(SEEDS)("Seed %i: keine Überlappung, keine Kreuzung, alles angebunden, Eltern mittig", (seed) => {
    const inhalt = zufallsPlan(seed, { stellen: 5 + (seed % 36), mehrereWurzeln: seed % 7 === 0 });
    const z = zeichne(inhalt, ziel);
    const befunde = befundeVon(z, inhalt);
    expect(befunde, erklaere(seed, inhalt, befunde.map((b) => b.text).join("; "))).toEqual([]);
    expect(z.karten.map((k) => k.id).sort()).toEqual(inhalt.stellen.map((s) => s.id).sort());
  });
});

/**
 * STAB-FÖRMIGE PLÄNE: der freie Generator hängt jede Stelle an eine zufällige Trägerin — flache
 * Grade, fast nie ein Kamm. Hier entstehen breite Ebenen mit Seitenstellen an Kammkindern, zwei
 * Kammgruppen nebeneinander, Kamm unter einer Karte mit Einheiten (Gasse) — die Fälle der großen
 * Stab-Lage. Dass sie wirklich kämmen, zählt der letzte Fall.
 */
describe.each(["bildschirm", "a4-quer"] as const)("Stab-förmige Zufallspläne (%s)", (ziel) => {
  it.each(STAB_SEEDS)("Seed %i: sauber und angebunden", (seed) => {
    const inhalt = zufallsPlan(seed, { stellen: 120, form: "stab" });
    const z = zeichne(inhalt, ziel);
    const befunde = befundeVon(z, inhalt);
    expect(befunde, erklaere(seed, inhalt, befunde.map((b) => b.text).join("; "))).toEqual([]);
  });
  it("mindestens ein Drittel der Stab-Seeds kämmt irgendwo — sonst prüfen die Fälle darüber keinen Kamm", () => {
    const mitKamm = STAB_SEEDS.filter((seed) => kaemmt(zufallsPlan(seed, { stellen: 120, form: "stab" }), ziel));
    expect(mitKamm.length).toBeGreaterThanOrEqual(STAB_SEEDS.length / 3);
  });
});

describe("Gleiche Daten, gleiches Bild", () => {
  it.each(SEEDS.slice(0, 60))("Seed %i: ein umsortiertes stellen-Array ändert nichts", (seed) => {
    const inhalt = zufallsPlan(seed, { stellen: 20 });
    expect(zeichne({ ...inhalt, stellen: mische(inhalt.stellen, seed) }, "bildschirm")).toEqual(zeichne(inhalt, "bildschirm"));
  });
  it.each(SEEDS.slice(0, 30))("Seed %i: gleiche reihenfolge-Werte entscheidet die id, nicht die Array-Position", (seed) => {
    const inhalt = zufallsPlan(seed, { stellen: 15 });
    const gleich = { ...inhalt, stellen: inhalt.stellen.map((s) => ({ ...s, reihenfolge: 0 })) };
    expect(zeichne({ ...gleich, stellen: mische(gleich.stellen, seed + 1) }, "bildschirm")).toEqual(zeichne(gleich, "bildschirm"));
  });
});

/** Karten-Lage relativ zur ersten Karte der Menge. */
function relativ(z: Zeichnungsdaten, ids: string[]): Record<string, [number, number]> {
  const lage = new Map(z.karten.map((k) => [k.id, [k.x, k.y] as [number, number]]));
  const [x0, y0] = lage.get(ids[0])!;
  return Object.fromEntries(ids.map((id) => { const [x, y] = lage.get(id)!; return [id, [Math.round((x - x0) * 1e6) / 1e6, Math.round((y - y0) * 1e6) / 1e6]]; }));
}

describe("Einfügen verschiebt nichts, was links steht", () => {
  it.each(SEEDS.slice(0, 80))("Seed %i", (seed) => {
    const inhalt = zufallsPlan(seed, { stellen: 25 });
    const baum = baueBaum(inhalt);
    const traeger = inhalt.stellen.filter((s) => s.lage === "unter");
    const p = traeger[Math.floor(mulberry32(seed + 1000)() * traeger.length)];
    const bisher = anzeigereihenfolge(baum.unter(p.id));
    const letzte = bisher.at(-1);
    const neu = fuegeStelleEin(inhalt, {
      id: "neu", titel: "N", eltern: p.id, verbindungId: letzte?.verbindungId ?? null,
      reihenfolge: bisher.length === 0 ? 0 : Math.max(...bisher.map((s) => s.reihenfolge)) + 1,
    });
    // Vorbedingung (Abweichung 10): kein Kamm, weder vorher noch nachher — ein Kamm verteilt die
    // Breite der ganzen Kinderreihe neu, auch für frühere Gruppen. Das ist gewollt, kein Befund.
    if (kaemmt(inhalt, "bildschirm") || kaemmt(neu, "bildschirm")) return;
    const vorher = zeichne(inhalt, "bildschirm");
    const nachher = zeichne(neu, "bildschirm");
    // keine vorhandene Karte ändert ihr y
    const yVorher = new Map(vorher.karten.map((k) => [k.id, k.y]));
    for (const k of nachher.karten) if (k.id !== "neu") expect(k.y, erklaere(seed, inhalt, `y von ${k.id}`)).toBeCloseTo(yVorher.get(k.id)!, 6);
    // je Ebene: die Teilbäume der früheren Geschwister behalten ihre Lage zueinander
    const nachBaum = baueBaum(neu);
    let c = nachBaum.stelle("neu")!;
    while (true) {
      const geschwister = c.eltern === null ? nachBaum.wurzeln : anzeigereihenfolge(nachBaum.unter(c.eltern));
      const frueher = geschwister.slice(0, geschwister.findIndex((g) => g.id === c.id));
      const ids = frueher.flatMap((g) => [g.id, ...nachkommen(nachBaum, g.id).map((n) => n.id)]);
      if (ids.length > 1) expect(relativ(nachher, ids), erklaere(seed, inhalt, `Ebene über ${c.id}`)).toEqual(relativ(vorher, ids));
      if (c.eltern === null) break;
      c = nachBaum.stelle(c.eltern)!;
    }
  });
});

describe("Grenzfälle", () => {
  const V = [
    { id: "v", art: "tmo" as const, bezeichnung: "R_UE_2" }, { id: "w2", art: "tmo" as const, bezeichnung: "R_UE_3" },
    { id: "x", art: "tmo" as const, bezeichnung: "R_UE_4" }, { id: "d", art: "draht" as const, bezeichnung: "Standleitung" },
  ];
  const kinder = (eltern: string, n: number, verbindung: string, rest: object = {}) =>
    Array.from({ length: n }, (_, i) => ({ id: `${eltern}-${verbindung}-${i}`, titel: `EA ${i}`, eltern, verbindung, ...rest }));
  function sauber(inhalt: PlanInhalt): void {
    for (const ziel of ["bildschirm", "a4-quer"] as const) {
      const befunde = befundeVon(zeichne(inhalt, ziel), inhalt);
      expect(befunde.map((b) => b.text), ziel).toEqual([]);
    }
  }

  it("30 Einheiten, drei Seitenstellen links und zwölf Kinder an einer Verbindung — sauber auf Bildschirm und A4", () => {
    sauber(baue({
      verbindungen: V,
      stellen: [
        { id: "w", titel: "Stab", einheiten: Array.from({ length: 30 }, (_, i) => `ELW ${i}`) },
        ...[1, 2, 3].map((i) => ({ id: `l${i}`, titel: `Links ${i}`, eltern: "w", lage: "links" as const, verbindung: "d" })),
        ...kinder("w", 12, "v", { einheiten: ["RTW 1"] }),
      ],
    }));
  });
  it("Kamm mit Seitenstellen an Kammkindern, auch links am ersten Kind einer Reihe", () => {
    const k = kinder("w", 14, "v");
    const seiten = [0, 3, 5, 6, 7, 12].map((i) => ({ id: `s${i}`, titel: "Seite", eltern: k[i].id, lage: (i % 2 === 0 ? "links" : "rechts") as "links" | "rechts", verbindung: "d" }));
    const inhalt = baue({ verbindungen: V, stellen: [{ id: "w", titel: "W" }, ...k, ...seiten] });
    expect(umgebungFuer(inhalt, "a4-quer").gruppen(baueBaum(inhalt).wurzeln[0])[0].reihen.length).toBeGreaterThan(1);
    sauber(inhalt);
  });
  it("zwei Kammgruppen nebeneinander unter einer Karte mit Einheiten und Kanal (Gasse)", () => {
    const inhalt = baue({ verbindungen: V, stellen: [
      { id: "w", titel: "W", einheiten: ["ELW 1", "ELW 2"], kanaele: ["x"] }, ...kinder("w", 9, "v"), ...kinder("w", 9, "w2"),
    ] });
    const u = umgebungFuer(inhalt, "a4-quer");
    expect(u.gruppen(u.sicht.wurzeln[0]).map((g) => g.reihen.length > 1)).toEqual([true, true]);
    sauber(inhalt);
  });
  it("drei Verbindungen à fünf Blattkinder: das Budget gilt für die ganze Reihe", () => {
    const inhalt = baue({ verbindungen: V, stellen: [{ id: "w", titel: "W" }, ...kinder("w", 5, "v"), ...kinder("w", 5, "w2"), ...kinder("w", 5, "x")] });
    const u = umgebungFuer(inhalt, "a4-quer");
    expect(u.gruppen(u.sicht.wurzeln[0]).every((g) => g.reihen.length > 1)).toBe(true);
    sauber(inhalt);
  });
  it("sechs Kinder mit je zwölf Einheiten und eines mit zwei Seitenstellen: Kamm nach Breite", () => {
    const zwoelf = Array.from({ length: 12 }, (_, i) => `RTW ${i}`);
    const inhalt = baue({ verbindungen: V, stellen: [
      { id: "w", titel: "W" }, ...kinder("w", 6, "v", { einheiten: zwoelf }),
      { id: "breit", titel: "Breit", eltern: "w", verbindung: "v" },
      { id: "bl", titel: "L", eltern: "breit", lage: "links", verbindung: "d" },
      { id: "br", titel: "R", eltern: "breit", lage: "rechts", verbindung: "d" },
    ] });
    expect(umgebungFuer(inhalt, "a4-quer").gruppen(baueBaum(inhalt).wurzeln[0])[0].reihen.length).toBeGreaterThan(1);
    sauber(inhalt);
  });
  it("Kinder mit eigenen Unterstellen kämmen nicht; die Zeichnung bleibt sauber", () => {
    const stellen: Parameters<typeof baue>[0]["stellen"] = [{ id: "w", titel: "W" }];
    for (let i = 0; i < 12; i++) stellen.push({ id: `eal${i}`, titel: `EAL ${i}`, eltern: "w", verbindung: "v" }, ...kinder(`eal${i}`, 3, "x"));
    const inhalt = baue({ verbindungen: V, stellen });
    expect(umgebungFuer(inhalt, "bildschirm").gruppen(baueBaum(inhalt).wurzeln[0])[0].reihen).toHaveLength(1);
    sauber(inhalt);
  });
});
```

- [ ] **Step 2: Rot sehen**

Run: `pnpm vitest run src/app/m/kommplan/_lib/layout/pruefung.test.ts src/app/m/kommplan/_lib/layout/eigenschaften.test.ts`
Expected: FAIL — `./pruefung`, `./zufall` fehlen.

- [ ] **Step 3: Implementieren**

`K/_lib/layout/pruefung.ts`:
```ts
import { baueBaum } from "../plan/baum";
import type { PlanInhalt } from "../plan/schema";
import { MINDEST } from "./masse";
import type { KarteL, SechseckL, Strecke, Zeichnungsdaten } from "./typen";

/**
 * Geometrische Zusicherungen an eine fertige Zeichnung (Spec §10), in zwei Hälften:
 *
 * - `pruefeZeichnung` ist NEGATIV: nichts überlappt, nichts kreuzt, nichts kommt sich zu nahe.
 *   Eine Zeichnung mit weniger Linien hat hier weniger Befunde — und eine ohne Linien keine.
 * - `pruefeVerbindungen` ist POSITIV: was verbunden sein muss, ist es. Erst beide zusammen sagen
 *   „sauber UND vollständig".
 *
 * Genutzt von den Eigenschafts-, Beispiel- und Aufteilungstests und dem Vorschau-Skript — ein
 * Befund dort ist derselbe wie im Test. Die Mindestabstände hält das Packen selbst ein
 * (`kontur.ts`, `LUFT_Y`), sonst meldete die Prüfung, was die Engine gebaut hat.
 */
export interface Befund {
  art: "ueberlappung" | "abstand" | "kreuzung" | "naehe" | "durchstich" | "kante" | "schraeg" | "mitte" | "verbindung";
  text: string;
}
interface Kasten { name: string; besitzer: string; x: number; y: number; b: number; h: number; sechseck?: SechseckL }

const TOL = 0.01;

/** Wem ein Netz gehört: der Stelle vor `>` (Gruppe), `<` (Seite) oder `#` (Kanäle) — keines davon ist ein ID-Zeichen. */
export const besitzerVon = (netz: string) => netz.split(/[<>#]/)[0];

function kaesten(z: Zeichnungsdaten): Kasten[] {
  return [
    ...z.karten.map((k) => ({ name: `Karte ${k.id}`, besitzer: k.id, x: k.x, y: k.y, b: k.breite, h: k.hoehe })),
    ...z.einheiten.map((e) => ({ name: `Einheit ${e.id}`, besitzer: e.stelleId, x: e.x, y: e.y, b: e.breite, h: e.hoehe })),
    ...z.sechsecke.map((s) => ({ name: `Sechseck ${s.netz}/${s.verbindungId}`, besitzer: besitzerVon(s.netz), x: s.x, y: s.y, b: s.breite, h: s.hoehe, sechseck: s })),
    ...z.abzeichen.map((a) => ({ name: `Abzeichen ${a.stelleId}`, besitzer: a.stelleId, x: a.x, y: a.y, b: a.breite, h: a.hoehe })),
  ];
}

const ueberlappen = (a: Kasten, b: Kasten) =>
  a.x + TOL < b.x + b.b && b.x + TOL < a.x + a.b && a.y + TOL < b.y + b.h && b.y + TOL < a.y + a.h;
/** Kleinster Abstand zweier achsenparalleler Rechtecke; 0, wenn sie sich berühren oder überlappen. */
function kastenAbstand(a: Kasten, b: Kasten): number {
  const dx = Math.max(0, b.x - (a.x + a.b), a.x - (b.x + b.b));
  const dy = Math.max(0, b.y - (a.y + a.h), a.y - (b.y + b.h));
  return Math.hypot(dx, dy);
}

const waagerecht = (l: Strecke) => Math.abs(l.y1 - l.y2) < TOL;
const senkrecht = (l: Strecke) => Math.abs(l.x1 - l.x2) < TOL;
const bereich = (a: number, b: number): [number, number] => (a < b ? [a, b] : [b, a]);

/** Berühren oder kreuzen sich zwei achsenparallele Strecken (T-Stoß und Überdeckung eingeschlossen)? */
function beruehren(p: Strecke, q: Strecke): boolean {
  const [px0, px1] = bereich(p.x1, p.x2), [py0, py1] = bereich(p.y1, p.y2);
  const [qx0, qx1] = bereich(q.x1, q.x2), [qy0, qy1] = bereich(q.y1, q.y2);
  if (waagerecht(p) && waagerecht(q)) return Math.abs(p.y1 - q.y1) < TOL && Math.min(px1, qx1) - Math.max(px0, qx0) > -TOL;
  if (senkrecht(p) && senkrecht(q)) return Math.abs(p.x1 - q.x1) < TOL && Math.min(py1, qy1) - Math.max(py0, qy0) > -TOL;
  const [h, v] = waagerecht(p) ? [p, q] : [q, p];
  const [hx0, hx1] = bereich(h.x1, h.x2), [vy0, vy1] = bereich(v.y1, v.y2);
  return v.x1 >= hx0 - TOL && v.x1 <= hx1 + TOL && h.y1 >= vy0 - TOL && h.y1 <= vy1 + TOL;
}

/** Zwei parallele Strecken, die sich (fast) überdecken und näher als `MINDEST.linie` liegen. */
function zuNah(p: Strecke, q: Strecke): boolean {
  const d = MINDEST.linie - TOL;
  if (waagerecht(p) && waagerecht(q)) {
    const [px0, px1] = bereich(p.x1, p.x2), [qx0, qx1] = bereich(q.x1, q.x2);
    return Math.abs(p.y1 - q.y1) < d && Math.min(px1, qx1) - Math.max(px0, qx0) > -d;
  }
  if (senkrecht(p) && senkrecht(q)) {
    const [py0, py1] = bereich(p.y1, p.y2), [qy0, qy1] = bereich(q.y1, q.y2);
    return Math.abs(p.x1 - q.x1) < d && Math.min(py1, qy1) - Math.max(py0, qy0) > -d;
  }
  return false;
}

function durchsticht(l: Strecke, k: Kasten): boolean {
  const [x0, x1] = bereich(l.x1, l.x2), [y0, y1] = bereich(l.y1, l.y2);
  const innenX = (x: number) => x > k.x + TOL && x < k.x + k.b - TOL;
  const innenY = (y: number) => y > k.y + TOL && y < k.y + k.h - TOL;
  if (waagerecht(l)) return innenY(l.y1) && Math.min(x1, k.x + k.b - TOL) > Math.max(x0, k.x + TOL);
  return innenX(l.x1) && Math.min(y1, k.y + k.h - TOL) > Math.max(y0, k.y + TOL);
}

/** Läuft die Strecke ein Stück AUF einer Kante des Kastens? Ein Ende, das die Kante nur trifft, zählt nicht. */
function aufKante(l: Strecke, k: Kasten): boolean {
  if (waagerecht(l)) {
    const [x0, x1] = bereich(l.x1, l.x2);
    const aufY = Math.abs(l.y1 - k.y) < TOL || Math.abs(l.y1 - (k.y + k.h)) < TOL;
    return aufY && Math.min(x1, k.x + k.b) - Math.max(x0, k.x) > TOL;
  }
  if (senkrecht(l)) {
    const [y0, y1] = bereich(l.y1, l.y2);
    const aufX = Math.abs(l.x1 - k.x) < TOL || Math.abs(l.x1 - (k.x + k.b)) < TOL;
    return aufX && Math.min(y1, k.y + k.h) - Math.max(y0, k.y) > TOL;
  }
  return false;
}

/** Die einzige Ausnahme vom Durchstich: der waagerechte Zweig desselben Netzes genau durch die Mitte seines Sechsecks. */
const traegtSechseck = (l: Strecke, k: Kasten) =>
  k.sechseck !== undefined && k.sechseck.netz === l.netz && waagerecht(l) && Math.abs(l.y1 - (k.y + k.h / 2)) < TOL;

export function pruefeZeichnung(z: Zeichnungsdaten): Befund[] {
  const befunde: Befund[] = [];
  const ks = kaesten(z);
  for (let i = 0; i < ks.length; i++) for (let j = i + 1; j < ks.length; j++) {
    const [a, b] = [ks[i], ks[j]];
    if (ueberlappen(a, b)) befunde.push({ art: "ueberlappung", text: `${a.name} überlappt ${b.name}` });
    else if (a.besitzer !== b.besitzer && kastenAbstand(a, b) < MINDEST.kasten - TOL) {
      befunde.push({ art: "abstand", text: `${a.name} liegt ${kastenAbstand(a, b).toFixed(2)} mm neben ${b.name}` });
    }
  }
  const linien = z.linien;
  for (const l of linien) if (!waagerecht(l) && !senkrecht(l)) befunde.push({ art: "schraeg", text: `Linie in ${l.netz} ist schräg` });
  for (let i = 0; i < linien.length; i++) for (let j = i + 1; j < linien.length; j++) {
    const [p, q] = [linien[i], linien[j]];
    if (p.netz === q.netz) continue;
    if (beruehren(p, q)) befunde.push({ art: "kreuzung", text: `${p.netz} kreuzt ${q.netz}` });
    else if (zuNah(p, q)) befunde.push({ art: "naehe", text: `${p.netz} läuft zu nah an ${q.netz}` });
  }
  for (const l of linien) for (const k of ks) {
    if (!waagerecht(l) && !senkrecht(l)) continue;
    if (traegtSechseck(l, k)) continue;
    if (durchsticht(l, k)) befunde.push({ art: "durchstich", text: `${l.netz} läuft durch ${k.name}` });
    else if (!(k.sechseck && k.sechseck.netz === l.netz) && aufKante(l, k)) befunde.push({ art: "kante", text: `${l.netz} läuft auf der Kante von ${k.name}` });
  }
  return befunde;
}

export function pruefeMitte(z: Zeichnungsdaten): Befund[] {
  return z.spannen.flatMap((s) => {
    const k = z.karten.find((x) => x.id === s.stelleId);
    if (!k) return [{ art: "mitte" as const, text: `Spanne ohne Karte: ${s.stelleId}` }];
    const abweichung = k.x + k.breite / 2 - (s.links + s.rechts) / 2;
    return Math.abs(abweichung) > 1e-6 ? [{ art: "mitte" as const, text: `${s.stelleId} steht ${abweichung.toFixed(3)} mm neben der Mitte` }] : [];
  });
}

const gleich = (a: number, b: number) => Math.abs(a - b) < TOL;
const endetIn = (l: Strecke, x: number, y: number) => (gleich(l.x1, x) && gleich(l.y1, y)) || (gleich(l.x2, x) && gleich(l.y2, y));

/** Hängt das Sechseck an dieser Linie seines Netzes? Mitte oben/unten (Gruppe), Spitze links/rechts (Kanal), Zweig durch die Mitte (Seite). */
function haengtAn(h: SechseckL, l: Strecke): boolean {
  const cx = h.x + h.breite / 2, cy = h.y + h.hoehe / 2;
  const punkte: [number, number][] = [[cx, h.y], [cx, h.y + h.hoehe], [h.x, cy], [h.x + h.breite, cy]];
  if (punkte.some(([x, y]) => endetIn(l, x, y))) return true;
  const [x0, x1] = bereich(l.x1, l.x2);
  return waagerecht(l) && gleich(l.y1, cy) && x0 < h.x + TOL && x1 > h.x + h.breite - TOL;
}

/** Beginnt das Netz an der Karte seines Besitzers? Gruppen und Kanäle an der Unterkante, Seitenzweige an der Seitenkante. */
function anKante(p: KarteL, netz: string, x: number, y: number): boolean {
  const imKopf = y > p.y - TOL && y < p.y + p.hoehe + TOL;
  if (netz.endsWith("<links")) return gleich(x, p.x) && imKopf;
  if (netz.endsWith("<rechts")) return gleich(x, p.x + p.breite) && imKopf;
  return gleich(y, p.y + p.hoehe) && x > p.x + TOL && x < p.x + p.breite - TOL;
}

export function pruefeVerbindungen(z: Zeichnungsdaten, inhalt: PlanInhalt): Befund[] {
  const befunde: Befund[] = [];
  const melde = (text: string) => befunde.push({ art: "verbindung", text });
  const baum = baueBaum(inhalt);
  const karte = new Map(z.karten.map((k) => [k.id, k]));
  const imNetz = (n: string) => z.linien.filter((l) => l.netz === n);

  // 1. Jede gezeichnete Stelle, deren Elternstelle auch gezeichnet ist, hängt an ihr.
  for (const k of z.karten) {
    const s = baum.stelle(k.id);
    if (!s || s.eltern === null || !karte.has(s.eltern)) continue;
    if (s.lage === "unter") {
      const x = k.x + k.breite / 2;
      if (!z.linien.some((l) => l.netz.startsWith(`${s.eltern}>`) && senkrecht(l) && endetIn(l, x, k.y))) {
        melde(`${k.id} hängt an keinem Bus von ${s.eltern}`);
      }
    } else {
      const x = s.lage === "links" ? k.x + k.breite : k.x;
      if (!imNetz(`${s.eltern}<${s.lage}`).some((l) => waagerecht(l) && endetIn(l, x, k.y + k.kopfHoehe / 2))) {
        melde(`${k.id} hängt an keinem Zweig von ${s.eltern}`);
      }
    }
  }
  // 2. Jedes Sechseck hängt an einer Linie seines Netzes.
  for (const h of z.sechsecke) {
    if (!imNetz(h.netz).some((l) => haengtAn(h, l))) melde(`Sechseck ${h.verbindungId} in ${h.netz} hängt an keiner Linie`);
  }
  // 3. Jedes Netz ist EIN Stück (Sechsecke verbinden, was an ihnen hängt) und beginnt an seiner Stelle.
  for (const n of new Set(z.linien.map((l) => l.netz))) {
    const linien = imNetz(n);
    const hexe = z.sechsecke.filter((h) => h.netz === n);
    const eltern = [...linien, ...hexe].map((_, i) => i);
    const wurzel = (i: number): number => (eltern[i] === i ? i : (eltern[i] = wurzel(eltern[i])));
    const vereine = (a: number, b: number) => { eltern[wurzel(a)] = wurzel(b); };
    for (let i = 0; i < linien.length; i++) for (let j = i + 1; j < linien.length; j++) if (beruehren(linien[i], linien[j])) vereine(i, j);
    hexe.forEach((h, j) => linien.forEach((l, i) => { if (haengtAn(h, l)) vereine(i, linien.length + j); }));
    const teile = new Set(eltern.map((_, i) => wurzel(i))).size;
    if (teile > 1) melde(`Netz ${n} zerfällt in ${teile} Teile`);
    const p = karte.get(besitzerVon(n));
    if (!p) { melde(`Netz ${n} ohne Karte ${besitzerVon(n)}`); continue; }
    if (!linien.some((l) => anKante(p, n, l.x1, l.y1) || anKante(p, n, l.x2, l.y2))) melde(`Netz ${n} beginnt nicht an ${p.id}`);
  }
  return befunde;
}
```

`K/_lib/layout/zufall.ts`:
```ts
import { baue, type StelleEingabe } from "../beispiele/bau";
import { baueBaum } from "../plan/baum";
import { KONTAKT_ARTEN, type KontaktArt, type PlanInhalt, type Verbindung } from "../plan/schema";

/** Deterministischer Zufall für Eigenschaftstests und das Vorschau-Skript — nie in der Engine selbst. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function mische<T>(liste: readonly T[], seed: number): T[] {
  const r = mulberry32(seed);
  const aus = [...liste];
  for (let i = aus.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [aus[i], aus[j]] = [aus[j], aus[i]];
  }
  return aus;
}

const WOERTER = [
  "EA", "Behandlungsplatz", "Nord", "Bereitstellungsraum", "RK", "UE", "40-05-1", "Sanitätsdienst",
  "Führung", "Logistik", "&", "Technik", "Bereitstellungsraumkoordinationsstelle", "Fußstreife", "ÖEL", "2.",
];
const VERBINDUNGEN: Verbindung[] = [
  { id: "v1", art: "tmo", bezeichnung: "R_UE_1" }, { id: "v2", art: "tmo", bezeichnung: "R_UE_2" },
  { id: "v3", art: "dmo", bezeichnung: "DMO 608" }, { id: "v4", art: "draht", bezeichnung: "Standleitung" },
  { id: "v5", art: "tmo", bezeichnung: "BOS_NI_RES_09" }, { id: "v6", art: "mobil", bezeichnung: "Handy" },
];

type Wahl = <T>(xs: readonly T[]) => T;

function titel(r: () => number, wahl: Wahl): string {
  // Leere Titel gibt es: Vorlagen lassen Zeilen für den Handeintrag frei (Abweichung 15).
  if (r() < 0.05) return wahl(["", "   "]);
  return Array.from({ length: 1 + Math.floor(r() * 5) }, () => wahl(WOERTER)).join(" ");
}
function kanaele(r: () => number, wahl: Wahl): string[] {
  if (r() >= 0.15) return [];
  const erster = wahl(VERBINDUNGEN).id;
  const zweiter = wahl(VERBINDUNGEN).id;
  return r() < 0.3 && zweiter !== erster ? [erster, zweiter] : [erster];
}
function einheiten(r: () => number, n: number): string[] {
  return Array.from({ length: n }, (_, j) => `${r() < 0.5 ? "RTW" : "KTW"} RK UE 40-83-${j}`);
}

/** Zufallsrekursivbaum: jede Stelle an eine zufällige Trägerin — flache Grade, viele Formen. */
function freieStellen(r: () => number, wahl: Wahl, o: { stellen: number; mehrereWurzeln?: boolean }): StelleEingabe[] {
  const stellen: StelleEingabe[] = [];
  const traeger: string[] = [];
  for (let i = 0; i < o.stellen; i++) {
    const id = `s${i}`;
    const wurzel = traeger.length === 0 || (o.mehrereWurzeln === true && r() < 0.05);
    const z = r();
    const lage = wurzel ? "unter" : z < 0.1 ? "links" : z < 0.2 ? "rechts" : "unter";
    const kontakte: Partial<Record<KontaktArt, string>> = {};
    const dichte = r();
    for (const art of KONTAKT_ARTEN) if (r() < dichte) kontakte[art] = art === "email" ? "max.mustermann@drk-kreisverband-uelzen.de" : "0581 / 82 266";
    stellen.push({
      id, lage,
      eltern: wurzel ? null : wahl(traeger),
      titel: titel(r, wahl),
      zeichen: r() < 0.6 ? wahl(["rezept:D.1.4", "zusatz:eal", "zusatz:ea"]) : null,
      verbindung: r() < 0.85 ? wahl(VERBINDUNGEN).id : null,
      kanaele: kanaele(r, wahl),
      leiter: r() < 0.2 ? "Max Mustermann" : null,
      hervorheben: r() < 0.1,
      kontakte,
      einheiten: einheiten(r, r() < 0.6 ? 0 : Math.floor(r() * 13)),
    });
    if (lage === "unter") traeger.push(id);
  }
  return stellen;
}

/**
 * Die Form der großen Stab-Lage: Stab mit Seitenstellen → TEL → 3–14 EAL an einer oder zwei
 * Verbindungen → je 0–12 EA, fast alle an EINER Verbindung (daraus werden Kämme), mit Seitenstellen
 * auch an EA und selten eigenen Unterstellen (dann kämmt die Gruppe nicht, Abweichung 13).
 */
function stabStellen(r: () => number, wahl: Wahl, o: { stellen: number }): StelleEingabe[] {
  const stellen: StelleEingabe[] = [
    { id: "stab", titel: "Stab", zeichen: "zusatz:stab" },
    { id: "katsl", titel: "KatSL", eltern: "stab", lage: "links", verbindung: "v4" },
    { id: "lts", titel: "Leitstelle", eltern: "stab", lage: "rechts", verbindung: "v1" },
    { id: "tel", titel: "TEL", eltern: "stab", verbindung: "v3", einheiten: einheiten(r, Math.floor(r() * 4)) },
  ];
  const ealVerbindungen = r() < 0.5 ? ["v2"] : ["v2", "v5"];
  const eals = 3 + Math.floor(r() * 12);
  for (let a = 0; a < eals && stellen.length < o.stellen; a++) {
    const eal = `eal${a}`;
    stellen.push({ id: eal, titel: titel(r, wahl), zeichen: "zusatz:eal", eltern: "tel", verbindung: wahl(ealVerbindungen), kanaele: kanaele(r, wahl) });
    const eaVerbindung = wahl(["v3", "v6", "v2"]);
    const n = Math.floor(r() * 13);
    for (let e = 0; e < n && stellen.length < o.stellen; e++) {
      const ea = `${eal}-${e}`;
      stellen.push({
        id: ea, titel: titel(r, wahl), zeichen: "zusatz:ea", eltern: eal,
        verbindung: r() < 0.9 ? eaVerbindung : wahl(VERBINDUNGEN).id,
        kontakte: r() < 0.5 ? { digitalfunk: `RK UE 4${a % 10}-${10 + e}-1` } : {},
        einheiten: einheiten(r, Math.floor(r() * 13)),
      });
      if (r() < 0.15) stellen.push({ id: `${ea}-s`, titel: "Seite", eltern: ea, lage: r() < 0.5 ? "links" : "rechts", verbindung: r() < 0.5 ? "v4" : null });
      if (r() < 0.05) {
        const u = 1 + Math.floor(r() * 3);
        for (let x = 0; x < u; x++) stellen.push({ id: `${ea}-u${x}`, titel: `U ${x}`, eltern: ea, verbindung: "v6" });
      }
    }
  }
  return stellen;
}

export function zufallsPlan(
  seed: number, o: { stellen: number; mehrereWurzeln?: boolean; leerzeilen?: boolean; form?: "frei" | "stab" },
): PlanInhalt {
  const r = mulberry32(seed);
  const wahl: Wahl = (xs) => xs[Math.floor(r() * xs.length)];
  const stellen = o.form === "stab" ? stabStellen(r, wahl, o) : freieStellen(r, wahl, o);
  return baue({ optionen: { leerzeilen: o.leerzeilen ?? r() < 0.3 }, verbindungen: VERBINDUNGEN, stellen });
}

export function alsGliederung(inhalt: PlanInhalt): string {
  const baum = baueBaum(inhalt);
  const zeilen: string[] = [];
  const zeige = (id: string, tiefe: number) => {
    const s = baum.stelle(id)!;
    const kanal = s.kanaele.length > 0 ? ` ⬡${s.kanaele.join(",")}` : "";
    zeilen.push(`${"  ".repeat(tiefe)}- ${s.id} [${s.lage}] (${s.verbindungId ?? "–"})${kanal} ${JSON.stringify(s.titel)} · ${s.kontakte.length}K ${s.einheiten.length}E`);
    const seiten = baum.seiten(id);
    for (const x of [...seiten.links, ...seiten.rechts]) zeilen.push(`${"  ".repeat(tiefe + 1)}- ${x.id} [${x.lage}] (${x.verbindungId ?? "–"}) ${JSON.stringify(x.titel)}`);
    for (const k of baum.unter(id)) zeige(k.id, tiefe + 1);
  };
  baum.wurzeln.forEach((w) => zeige(w.id, 0));
  return zeilen.join("\n");
}
```

- [ ] **Step 4: Grün sehen — und rote Seeds ernst nehmen**

Run: `uptime && pnpm vitest run src/app/m/kommplan/_lib/layout`
Expected: PASS. Ist ein Seed rot, ist das ein Befund an der Engine, nicht am Test: die Gliederung aus der Meldung mit `zufallsPlan(<seed>, …)` im Vorschau-Skript (Task 15, `--zufall <seed> <stellen> [stab]`) rendern, die Ursache in `teilbaum.ts`/`seiten.ts`/`karte.ts` beheben, den Seed als eigenen, benannten Regressionsfall in `teilbaum.test.ts` festhalten. Toleranzen und `MINDEST` nicht lockern. Wird „mindestens ein Drittel der Stab-Seeds kämmt" rot, ist der Generator zu zahm (Kinderzahl je EAL, Anteil der Unterstellen) — den Generator nachschärfen, nicht die Schwelle senken.

- [ ] **Step 5: Commit**

```bash
git add src/app/m/kommplan/_lib/layout/pruefung.ts src/app/m/kommplan/_lib/layout/zufall.ts src/app/m/kommplan/_lib/layout/pruefung.test.ts src/app/m/kommplan/_lib/layout/eigenschaften.test.ts
git commit -S -m "test(kommplan): Eigenschaftstests auf Zufallsbäumen mit Geometrieprüfung" -m "Keine Überlappung, keine Kreuzung, Mindestabstände, alles angebunden, Eltern mittig, gleiches Bild bei umsortierten Daten, Einfügen verschiebt die früheren Geschwister nicht gegeneinander — über 150 freie und 60 stab-förmige Seeds (mit Kämmen) auf Bildschirm und A4." -m "DRK-500" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 12: Papier — Maßstab, Legendenzeilen, Aufteilung per Ebenenschnitt; die Fassade `layout()`

**Files:**
- Create: `K/_lib/layout/papier.ts`, `K/_lib/layout/layout.ts`
- Test: `K/_lib/layout/papier.test.ts`

**Interfaces:**
- Consumes: `zeichne` (Task 10), `baueSicht`, `anzeigereihenfolge` (Task 7), `baueBaum`, `teilbaumGroesse` (Task 4), `textBreite` (Task 2).
- Produces:
  - `papier.ts`: `LEGENDE = { symbolBreite: 9, symbolLuft: 1.5, eintragLuft: 6, schrift: 8 }` (auf dem Blatt, unskaliert); `legendenZeilen(legende: LegendenEintrag[], breite: number): LegendenEintrag[][]`; `zeichenflaeche(format: Papierformat, legendeZeilen: number): { x: number; y: number; breite: number; hoehe: number }`; `massstabFuer(z: Zeichnungsdaten, flaeche: { breite: number; hoehe: number }): number` (≤ 1; leer → 1); `lesereihenfolge(sicht: Sicht): string[]`; `teileAuf(inhalt: PlanInhalt, format: Papierformat): Blatt[]`.
  - `layout.ts`: `layout(inhalt: PlanInhalt, ziel: Ziel, optionen?: LayoutOptionen): Layout` — die Signatur aus Spec §5: `{ karten, linien, sechsecke, einheiten, …, seiten }`; `seiten` ist für `bildschirm` leer.

Aufteilung (Spec §5.6, Abweichung 14) — zwei Durchläufe:

1. **Schneiden** (je Blatt, rekursiv): passt das Blatt (Maßstab ≥ 0,75), gibt es nichts zu tun. Sonst sind Kandidaten die sichtbaren, normalen Unterstellen mit sichtbaren Kindern — außer der Blattwurzel und dem Kind des Ankers; zeigt ein Blatt ohne Anker mehrere Wurzeln, auch die Wurzeln selbst (Tiefe 0). Geschnitten wird **von der tiefsten Kandidatenebene D her**: auf der Ebene D werden, aufbauend auf „alle tieferen Ebenen geschnitten", Kandidaten gierig nach Teilbaumgröße (Gleichstand → früher in der Lesereihenfolge) zu Verweiskarten, bis das Blatt passt. Passt es auch mit der ganzen Ebene D nicht, gilt Ebene D als geschnitten und es geht eine Ebene höher. So gewinnt das **größte D, bei dem das Blatt passt**, und Blatt 1 behält die oberen Ebenen. Schnitte, die in einem anderen Schnitt liegen, fallen weg (ihr Teilbaum steht auf dessen Blatt). Jeder verbleibende Schnitt wird ein Auftrag `{ wurzelId, ankerId: Elternstelle }` (bei einer Wurzel `ankerId: null`) und rekursiv gleich behandelt. Passt ein Blatt selbst mit allen Schnitten nicht, bleibt es `unterMindestschrift`. Beim Messen tragen Verweiskarten einen Platzhalter — die Nummer ändert keine Geometrie.
2. **Nummerieren**: Blatt 1 ist der ganze Plan; die Blätter folgen in **Tiefensuche**, auf jedem Blatt die Schnitte in Lesereihenfolge (Tiefensuche, Kinder in Anzeigereihenfolge). Dann wird jedes Blatt mit den echten Nummern gezeichnet — die Verweisnummern eines Blatts steigen von links nach rechts.

Beides ist deterministisch: nur Plan, Format und die festen Reihenfolgen gehen ein.

- [ ] **Step 1: Failing test**

`K/_lib/layout/papier.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { baue, type StelleEingabe } from "../beispiele/bau";
import { leererPlan } from "../plan/operationen";
import { layout } from "./layout";
import { BLATT, MIN_MASSSTAB, PAPIER } from "./masse";
import { legendenZeilen, massstabFuer, teileAuf, zeichenflaeche } from "./papier";

function grosserPlan() {
  const stellen: StelleEingabe[] = [{ id: "w", titel: "Stab" }];
  for (let i = 0; i < 5; i++) {
    stellen.push({ id: `a${i}`, titel: `EAL ${i}`, eltern: "w", verbindung: "v" });
    for (let j = 0; j < 8; j++) stellen.push({ id: `a${i}-${j}`, titel: `EA ${i}.${j}`, eltern: `a${i}`, einheiten: ["RTW 1", "RTW 2", "KTW 3", "KTW 4", "MTW 5"] });
  }
  return baue({ verbindungen: [{ id: "v", art: "tmo", bezeichnung: "R_UE_2" }], stellen });
}
const normaleKarten = (blaetter: ReturnType<typeof teileAuf>) =>
  blaetter.flatMap((b) => b.zeichnung.karten.filter((k) => k.art === "normal").map((k) => k.id));

describe("Papier", () => {
  it("Zeichenfläche A4 quer: Ränder, Kopf, Fuß, Legende", () => {
    expect(zeichenflaeche("a4-quer", 0)).toEqual({ x: 10, y: 22, breite: 277, hoehe: 210 - 22 - 8 - 7 });
    expect(zeichenflaeche("a4-quer", 2).hoehe).toBeCloseTo(210 - 22 - 8 - 7 - (2 * BLATT.legendeZeile + BLATT.legendeRand), 9);
  });
  it("Legende bricht in Zeilen um", () => {
    const viele = Array.from({ length: 30 }, (_, i) => ({ art: "tmo" as const, text: `Reserve K_UE_${i}`, reserve: true }));
    expect(legendenZeilen(viele, 277).length).toBeGreaterThan(1);
    expect(legendenZeilen([], 277)).toEqual([]);
  });
  it("Maßstab: nie größer als 1, leer = 1", () => {
    expect(massstabFuer({ breite: 0, hoehe: 0 } as never, { breite: 277, hoehe: 150 })).toBe(1);
    expect(massstabFuer({ breite: 100, hoehe: 50 } as never, { breite: 277, hoehe: 150 })).toBe(1);
    expect(massstabFuer({ breite: 554, hoehe: 50 } as never, { breite: 277, hoehe: 150 })).toBe(0.5);
  });
  it("leerer Plan: genau ein Blatt", () => {
    const b = teileAuf(leererPlan(), "a4-quer");
    expect(b).toHaveLength(1);
    expect(b[0]).toMatchObject({ nummer: 1, von: 1, massstab: 1, unterMindestschrift: false });
  });
  it("ein kleiner Plan passt auf ein Blatt, waagerecht mittig", () => {
    const b = teileAuf(baue({ stellen: [{ id: "a", titel: "A" }, { id: "b", titel: "B", eltern: "a" }] }), "a4-quer");
    expect(b).toHaveLength(1);
    expect(b[0].ursprung.x + (b[0].zeichnung.breite * b[0].massstab) / 2).toBeCloseTo(PAPIER["a4-quer"].breite / 2, 6);
  });
  it("ein zu großer Plan teilt gierig auf: Verweiskarten, Anker, jede Stelle genau einmal", () => {
    const inhalt = grosserPlan();
    const b = teileAuf(inhalt, "a4-quer");
    expect(b.map((x) => x.nummer)).toEqual([1, 2, 3, 4, 5, 6]);
    for (const blatt of b) {
      expect(blatt.von).toBe(6);
      expect(blatt.massstab).toBeGreaterThanOrEqual(MIN_MASSSTAB);
    }
    const verweise = b[0].zeichnung.karten.filter((k) => k.art === "verweis");
    expect(verweise.map((k) => k.verweis?.text)).toEqual(["→ Blatt 2", "→ Blatt 3", "→ Blatt 4", "→ Blatt 5", "→ Blatt 6"]);
    expect(b[1].zeichnung.karten.find((k) => k.id === "w")?.art).toBe("anker");
    expect(normaleKarten(b).sort()).toEqual(inhalt.stellen.map((s) => s.id).sort());
    expect(teileAuf(inhalt, "a4-quer")).toEqual(b);
  });
  it("unteilbar: ein Blatt unter Mindestschrift, kein Endlosversuch", () => {
    const sechzig = Array.from({ length: 60 }, (_, i) => `RTW ${i}`);
    const inhalt = baue({ stellen: [
      { id: "w", titel: "W", einheiten: sechzig },
      ...[1, 2, 3].map((i) => ({ id: `l${i}`, titel: `L${i}`, eltern: "w", lage: "links" as const, einheiten: sechzig })),
    ] });
    const b = teileAuf(inhalt, "a4-quer");
    expect(b).toHaveLength(1);
    expect(b[0].unterMindestschrift).toBe(true);
  });
  it("Blatt 1 behält die oberen Ebenen: LtS → EL → fünf EAL → je acht EA", () => {
    const stellen: StelleEingabe[] = [{ id: "lts", titel: "Leitstelle" }, { id: "el", titel: "EL", eltern: "lts", verbindung: "v" }];
    for (let a = 0; a < 5; a++) {
      stellen.push({ id: `eal-${a}`, titel: `EAL ${a}`, eltern: "el", verbindung: "v" });
      for (let e = 0; e < 8; e++) stellen.push({ id: `ea-${a}-${e}`, titel: `EA ${a}.${e}`, eltern: `eal-${a}`, einheiten: ["RTW 1", "KTW 2", "MTW 3"] });
    }
    const b = teileAuf(baue({ verbindungen: [{ id: "v", art: "tmo", bezeichnung: "R_UE_2" }], stellen }), "a4-quer");
    const erstes = b[0].zeichnung.karten;
    expect(erstes.find((k) => k.id === "el")?.art).toBe("normal"); // früher: EL als Verweis, Blatt 1 fast leer
    for (let a = 0; a < 5; a++) expect(erstes.some((k) => k.id === `eal-${a}`), `eal-${a} auf Blatt 1`).toBe(true);
    expect(erstes.some((k) => k.art === "verweis")).toBe(true);
    for (const blatt of b) expect(blatt.massstab).toBeGreaterThanOrEqual(MIN_MASSSTAB);
  });
  it("Verweisnummern steigen von links nach rechts, auch bei ungleich großen Teilbäumen", () => {
    const stellen: StelleEingabe[] = [{ id: "w", titel: "W" }];
    [2, 11, 5, 8].forEach((n, i) => {
      stellen.push({ id: `c${i}`, titel: `C${i}`, eltern: "w", verbindung: "v" });
      for (let e = 0; e < n; e++) stellen.push({ id: `c${i}-${e}`, titel: `EA ${e}`, eltern: `c${i}`, einheiten: ["RTW 1", "KTW 2", "MTW 3", "ELW 4"] });
    });
    const b = teileAuf(baue({ verbindungen: [{ id: "v", art: "tmo", bezeichnung: "R_UE_2" }], stellen }), "a4-quer");
    const verweise = b[0].zeichnung.karten.filter((k) => k.art === "verweis").sort((p, q) => p.x - q.x);
    expect(verweise.length).toBeGreaterThanOrEqual(2);
    expect(new Set(verweise.map((k) => k.y)).size).toBe(1);
    const nummern = verweise.map((k) => Number(k.verweis!.text.replace("→ Blatt ", "")));
    expect(nummern).toEqual([...nummern].sort((p, q) => p - q));
    verweise.forEach((k, i) => expect(b[nummern[i] - 1].wurzelId).toBe(k.id));
  });
  it("mehrere Wurzeln, die zusammen nicht passen: eine Wurzel bekommt ein eigenes Blatt ohne Anker", () => {
    const stellen: StelleEingabe[] = ["a", "b"].flatMap((w) => [
      { id: w, titel: w.toUpperCase() },
      ...Array.from({ length: 5 }, (_, i) => ({ id: `${w}${i}`, titel: `K${i}`, eltern: w, verbindung: "v" })),
    ]);
    const inhalt = baue({ verbindungen: [{ id: "v", art: "tmo", bezeichnung: "R_UE_2" }], stellen });
    const b = teileAuf(inhalt, "a4-quer");
    expect(b.length).toBeGreaterThanOrEqual(2);
    for (const blatt of b) expect(blatt.massstab).toBeGreaterThanOrEqual(MIN_MASSSTAB);
    expect(b.some((blatt) => blatt.wurzelId !== null && blatt.ankerId === null)).toBe(true);
    expect(normaleKarten(b).sort()).toEqual(inhalt.stellen.map((s) => s.id).sort());
  });
  it("breite Kinderreihen passen durch den Kamm auf EIN Blatt (drei Verbindungen à fünf; sechs breite Kinder und eines mit zwei Seitenstellen)", () => {
    const V = [{ id: "v", art: "tmo" as const, bezeichnung: "R_UE_2" }, { id: "w2", art: "tmo" as const, bezeichnung: "R_UE_3" },
      { id: "x", art: "tmo" as const, bezeichnung: "R_UE_4" }, { id: "d", art: "draht" as const, bezeichnung: "Standleitung" }];
    const blatt = (n: number, v: string, rest: object = {}) =>
      Array.from({ length: n }, (_, i) => ({ id: `${v}-${i}`, titel: `EA ${i}`, eltern: "w", verbindung: v, ...rest }));
    const drei = baue({ verbindungen: V, stellen: [{ id: "w", titel: "W" }, ...blatt(5, "v"), ...blatt(5, "w2"), ...blatt(5, "x")] });
    const zwoelf = Array.from({ length: 12 }, (_, i) => `RTW ${i}`);
    const breit = baue({ verbindungen: V, stellen: [
      { id: "w", titel: "W" }, ...blatt(6, "v", { einheiten: zwoelf }),
      { id: "breit", titel: "Breit", eltern: "w", verbindung: "v" },
      { id: "bl", titel: "L", eltern: "breit", lage: "links", verbindung: "d" },
      { id: "br", titel: "R", eltern: "breit", lage: "rechts", verbindung: "d" },
    ] });
    for (const inhalt of [drei, breit]) {
      const b = teileAuf(inhalt, "a4-quer");
      expect(b).toHaveLength(1);
      expect(b[0].massstab).toBeGreaterThanOrEqual(MIN_MASSSTAB);
    }
  });
  it("layout(): Bildschirm ohne Seiten, Papier mit", () => {
    const inhalt = grosserPlan();
    expect(layout(inhalt, "bildschirm").seiten).toEqual([]);
    expect(layout(inhalt, "a4-quer").seiten).toHaveLength(6);
  });
});
```

- [ ] **Step 2: Rot sehen**

Run: `pnpm vitest run src/app/m/kommplan/_lib/layout/papier.test.ts`
Expected: FAIL — `./papier`, `./layout` fehlen.

- [ ] **Step 3: Implementieren**

`K/_lib/layout/papier.ts`:
```ts
import { baueBaum, teilbaumGroesse, type Baum } from "../plan/baum";
import type { PlanInhalt, Stelle } from "../plan/schema";
import { anzeigereihenfolge } from "./gruppen";
import { BLATT, MIN_MASSSTAB, PAPIER } from "./masse";
import { baueSicht, type Sicht } from "./sicht";
import { textBreite } from "./text";
import type { Blatt, Darstellung, LayoutOptionen, LegendenEintrag, Papierformat, Zeichnungsdaten } from "./typen";
import { zeichne } from "./zeichne";

/** Die Legende steht unskaliert auf dem Blatt (8 pt), wie Kopf und Fuß. */
export const LEGENDE = { symbolBreite: 9, symbolLuft: 1.5, eintragLuft: 6, schrift: 8 } as const;

export function legendenZeilen(legende: LegendenEintrag[], breite: number): LegendenEintrag[][] {
  const zeilen: LegendenEintrag[][] = [];
  let aktuell: LegendenEintrag[] = [];
  let x = 0;
  for (const e of legende) {
    const b = LEGENDE.symbolBreite + LEGENDE.symbolLuft + textBreite(e.text, LEGENDE.schrift, false);
    if (aktuell.length > 0 && x + b > breite) { zeilen.push(aktuell); aktuell = []; x = 0; }
    aktuell.push(e);
    x += b + LEGENDE.eintragLuft;
  }
  if (aktuell.length > 0) zeilen.push(aktuell);
  return zeilen;
}

export function zeichenflaeche(format: Papierformat, legendeZeilen: number) {
  const p = PAPIER[format];
  const legende = legendeZeilen === 0 ? 0 : legendeZeilen * BLATT.legendeZeile + BLATT.legendeRand;
  const y = BLATT.randOben + BLATT.kopf;
  return { x: BLATT.randX, y, breite: p.breite - 2 * BLATT.randX, hoehe: p.hoehe - y - BLATT.randUnten - BLATT.fuss - legende };
}

export function massstabFuer(z: Pick<Zeichnungsdaten, "breite" | "hoehe">, flaeche: { breite: number; hoehe: number }): number {
  if (z.breite === 0 || z.hoehe === 0) return 1;
  return Math.min(1, flaeche.breite / z.breite, flaeche.hoehe / z.hoehe);
}

type Auftrag = NonNullable<LayoutOptionen["blatt"]>;

function blattAus(nummer: number, format: Papierformat, z: Zeichnungsdaten, auftrag: Auftrag | undefined): Blatt {
  const zeilen = legendenZeilen(z.legende, PAPIER[format].breite - 2 * BLATT.randX);
  const f = zeichenflaeche(format, zeilen.length);
  const massstab = massstabFuer(z, f);
  return {
    nummer, von: 0, wurzelId: auftrag?.wurzelId ?? null, ankerId: auftrag?.ankerId ?? null,
    zeichnung: z, massstab, legendeZeilen: zeilen, unterMindestschrift: massstab < MIN_MASSSTAB - 1e-9,
    ursprung: { x: f.x + (f.breite - z.breite * massstab) / 2, y: f.y },
  };
}

/** Lesereihenfolge eines Blatts: Tiefensuche, Kinder in Anzeigereihenfolge (Gruppe für Gruppe, Reihe für Reihe). */
export function lesereihenfolge(sicht: Sicht): string[] {
  const aus: string[] = [];
  const besuche = (s: Stelle) => {
    aus.push(s.id);
    for (const k of anzeigereihenfolge(sicht.kinder(s.id))) besuche(k);
  };
  sicht.wurzeln.forEach(besuche);
  return aus;
}

/**
 * Wer auf diesem Blatt zur Verweiskarte werden darf, nach Tiefe: sichtbar, normal, eine Unterstelle
 * mit sichtbaren Kindern, weder Blattwurzel noch Kind des Ankers. Zeigt ein Blatt ohne Anker
 * mehrere Wurzeln, sind auch die Wurzeln Kandidaten (Tiefe 0) — sonst ließen sich zwei
 * nebeneinander zu breite Bäume nie auf zwei Blätter verteilen.
 */
function kandidaten(sicht: Sicht, auftrag: Auftrag | undefined): Map<number, Stelle[]> {
  const mehrereWurzeln = auftrag === undefined && sicht.wurzeln.length > 1;
  const geschuetzt = new Set<string>(mehrereWurzeln ? [] : sicht.wurzeln.map((w) => w.id));
  for (const w of sicht.wurzeln) if (sicht.darstellung(w.id) === "anker") for (const k of sicht.kinder(w.id)) geschuetzt.add(k.id);
  const nachTiefe = new Map<number, Stelle[]>();
  for (const s of sicht.sichtbar) {
    if (geschuetzt.has(s.id) || s.lage !== "unter" || sicht.darstellung(s.id) !== "normal") continue;
    if (s.eltern !== null && sicht.kinder(s.id).length === 0) continue;
    const t = sicht.tiefe(s.id);
    nachTiefe.set(t, [...(nachTiefe.get(t) ?? []), s]);
  }
  return nachTiefe;
}

interface Schnittplan { auftrag: Auftrag | undefined; schnitte: string[]; unter: Schnittplan[] }

/** Beim Messen steht auf jeder Verweiskarte „Blatt 0": die Nummer ändert keine Geometrie (feste Breite, eine Zeile fester Höhe). */
const PLATZHALTER: Darstellung = { verweisAufBlatt: 0 };

function passt(inhalt: PlanInhalt, format: Papierformat, auftrag: Auftrag | undefined, schnitte: ReadonlySet<string>): boolean {
  const darstellung = new Map<string, Darstellung>([...schnitte].map((id) => [id, PLATZHALTER]));
  return !blattAus(0, format, zeichne(inhalt, format, { blatt: auftrag, darstellung }), auftrag).unterMindestschrift;
}

/**
 * DURCHLAUF 1: der Schnittplan eines Blatts, rekursiv (Abweichung 14). Von der tiefsten
 * Kandidatenebene her: jede Ebene baut auf „alles Tiefere geschnitten" auf und schneidet gierig
 * nach Teilbaumgröße, bis das Blatt passt. Das größte D, bei dem es passt, gewinnt — Blatt 1
 * behält die oberen Ebenen. Jede Probe zeichnet neu, weil ein Schnitt die Sicht ändert (eine
 * Verweiskarte ist ein Blatt, ihre Elterngruppe kann danach kämmen).
 */
function schneide(inhalt: PlanInhalt, format: Papierformat, baum: Baum, auftrag: Auftrag | undefined): Schnittplan {
  if (passt(inhalt, format, auftrag, new Set())) return { auftrag, schnitte: [], unter: [] };
  const sicht = baueSicht(inhalt, { blatt: auftrag });
  const rang = new Map(lesereihenfolge(sicht).map((id, i) => [id, i]));
  const nachTiefe = kandidaten(sicht, auftrag);
  let basis = new Set<string>();
  let gewaehlt: Set<string> | null = null;
  for (const t of [...nachTiefe.keys()].sort((a, b) => b - a)) {
    const ebene = [...nachTiefe.get(t)!].sort((a, b) =>
      teilbaumGroesse(baum, b.id) - teilbaumGroesse(baum, a.id) || rang.get(a.id)! - rang.get(b.id)!);
    const s = new Set(basis);
    for (const k of ebene) {
      s.add(k.id);
      if (passt(inhalt, format, auftrag, s)) { gewaehlt = s; break; }
    }
    if (gewaehlt) break;
    basis = s;
  }
  const alle = gewaehlt ?? basis;
  const innen = (id: string) => {
    for (let e = baum.stelle(id)?.eltern ?? null; e !== null; e = baum.stelle(e)?.eltern ?? null) if (alle.has(e)) return true;
    return false;
  };
  const schnitte = [...alle].filter((id) => !innen(id)).sort((a, b) => rang.get(a)! - rang.get(b)!);
  return {
    auftrag, schnitte,
    unter: schnitte.map((id) => schneide(inhalt, format, baum, { wurzelId: id, ankerId: baum.stelle(id)!.eltern })),
  };
}

/** DURCHLAUF 2: Blätter in Tiefensuche nummerieren, dann jedes Blatt mit den echten Verweisnummern zeichnen. */
export function teileAuf(inhalt: PlanInhalt, format: Papierformat): Blatt[] {
  const baum = baueBaum(inhalt);
  const reihe: Schnittplan[] = [];
  const sammle = (p: Schnittplan) => { reihe.push(p); p.unter.forEach(sammle); };
  sammle(schneide(inhalt, format, baum, undefined));
  const nummer = new Map(reihe.map((p, i) => [p, i + 1]));
  const blaetter = reihe.map((p, i) => {
    const darstellung = new Map<string, Darstellung>(p.schnitte.map((id, j) => [id, { verweisAufBlatt: nummer.get(p.unter[j])! }]));
    return blattAus(i + 1, format, zeichne(inhalt, format, { blatt: p.auftrag, darstellung }), p.auftrag);
  });
  return blaetter.map((b) => ({ ...b, von: blaetter.length }));
}
```

`K/_lib/layout/layout.ts`:
```ts
import type { PlanInhalt } from "../plan/schema";
import { teileAuf } from "./papier";
import type { Layout, LayoutOptionen, Ziel } from "./typen";
import { zeichne } from "./zeichne";

/**
 * `layout(inhalt, ziel)` aus Spec §5 — rein und synchron, geteilt von Server (Druck) und Browser
 * (Betrachter). Die oberen Felder sind die ganze Zeichnung mit dem Kamm-Budget des Ziels; `seiten`
 * trägt für Papier die aufgeteilten Blätter.
 */
export function layout(inhalt: PlanInhalt, ziel: Ziel, optionen: LayoutOptionen = {}): Layout {
  return { ...zeichne(inhalt, ziel, optionen), seiten: ziel === "bildschirm" ? [] : teileAuf(inhalt, ziel) };
}
```

- [ ] **Step 4: Grün sehen**

Run: `pnpm vitest run src/app/m/kommplan/_lib/layout && pnpm typecheck`
Expected: PASS; Exit 0.

- [ ] **Step 5: Aufteilungs-Eigenschaft ergänzen**

In `K/_lib/layout/eigenschaften.test.ts` anhängen (Import `teileAuf` aus `./papier`, `MIN_MASSSTAB` aus `./masse`):
```ts
describe("Aufteilung deckt jede Stelle genau einmal ab, jedes Blatt sauber und angebunden", () => {
  const faelle = [
    ...SEEDS.slice(0, 40).map((seed) => [seed, zufallsPlan(seed, { stellen: 30 + (seed % 50), mehrereWurzeln: seed % 5 === 0 })] as const),
    ...STAB_SEEDS.slice(0, 20).map((seed) => [seed, zufallsPlan(seed, { stellen: 120, form: "stab" })] as const),
  ];
  it.each(faelle)("Seed %i", (seed, inhalt) => {
    const blaetter = teileAuf(inhalt, "a4-quer");
    const normal = blaetter.flatMap((b) => b.zeichnung.karten.filter((k) => k.art === "normal").map((k) => k.id));
    expect(normal.sort(), erklaere(seed, inhalt, "Abdeckung")).toEqual(inhalt.stellen.map((s) => s.id).sort());
    for (const b of blaetter) {
      expect(befundeVon(b.zeichnung, inhalt).map((x) => x.text), erklaere(seed, inhalt, `Blatt ${b.nummer}`)).toEqual([]);
      if (!b.unterMindestschrift) expect(b.massstab).toBeGreaterThanOrEqual(MIN_MASSSTAB);
      // Verweisnummern steigen in Lesereihenfolge und zeigen auf das Blatt ihres Teilbaums
      const verweise = b.zeichnung.karten.filter((k) => k.verweis !== null);
      for (const k of verweise) expect(blaetter[Number(k.verweis!.text.replace("→ Blatt ", "")) - 1].wurzelId).toBe(k.id);
    }
  });
});
```

Run: `pnpm vitest run src/app/m/kommplan/_lib/layout/eigenschaften.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/app/m/kommplan/_lib/layout/papier.ts src/app/m/kommplan/_lib/layout/layout.ts src/app/m/kommplan/_lib/layout/papier.test.ts src/app/m/kommplan/_lib/layout/eigenschaften.test.ts
git commit -S -m "feat(kommplan): Papiermaßstab bis 6 pt und Aufteilung per Ebenenschnitt" -m "Geschnitten wird von der tiefsten Ebene her, damit Blatt 1 die oberen Ebenen behält; große Teilbäume stehen dort als Verweiskarte und bekommen ein eigenes Blatt mit ihrer Elternstelle als grauem Anker. Die Blattnummern folgen der Lesereihenfolge, mehrere zu breite Wurzeln verteilen sich auf eigene Blätter." -m "DRK-500" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 13: Beispielpläne (Nachbau der Excel-Vorlagen) und Abnahme „passt auf A4"

**Files:**
- Create: `K/_lib/beispiele/einsatz20260222.ts`, `K/_lib/beispiele/openr20220701.ts`, `K/_lib/beispiele/label.ts`, `K/_lib/beispiele/fernmeldeskizzeStab.ts`, `K/_lib/beispiele/grosseStabslage.ts`, `K/_lib/beispiele/index.ts`
- Test: `K/_lib/beispiele/beispiele.test.ts`

**Interfaces:**
- Consumes: `baue` (Task 4), `teileAuf` (Task 12), `zeichne` (Task 10), `pruefeZeichnung`, `pruefeMitte` (Task 11).
- Produces: `interface Beispiel { id: string; titel: string; typ: "kommunikationsplan" | "fernmeldeskizze"; anlass: string | null; datum: string | null /* YYYY-MM-DD */; istVorlage: boolean; stand: string /* ISO-Zeitpunkt */; bearbeiter: string; inhalt: PlanInhalt }`; `BEISPIELE: readonly Beispiel[]` in der Reihenfolge Einsatz, OpenR, Label, Fernmeldeskizze Stab, große Stab-Lage. Seed (Task 18), Golden-Tests (Task 16), Vorschau (Task 15) und e2e (Task 22) benutzen genau diese Daten.

Die Inhalte stammen aus den Referenzbildern (`scratchpad/referenz/*.png` der Planungssitzung; die Excel-Vorlage „Vorlage Fernmeldeskizze.xls"). **Personen werden anonymisiert** (Max Mustermann, `0170 0000000`, `max.mustermann@example.org`); die öffentlichen Rufnummern und Adressen der Leitstelle bleiben. Wo die Vorlage ein Zeichen zeigt, das der Katalog nicht kennt (LtS, „ELW 2 DRK"), bleibt `zeichen: null` (Spec §7).

- [ ] **Step 1: Failing test**

`K/_lib/beispiele/beispiele.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import zeichen from "../zeichen/zeichen.generiert.json";
import { MIN_MASSSTAB } from "../layout/masse";
import { teileAuf } from "../layout/papier";
import { pruefeMitte, pruefeVerbindungen, pruefeZeichnung } from "../layout/pruefung";
import { zeichne } from "../layout/zeichne";
import { BEISPIELE } from "./index";

const nach = (id: string) => BEISPIELE.find((b) => b.id === id)!;

describe("Beispielpläne", () => {
  it("fünf Beispiele mit eindeutigen IDs und gültigen Daten", () => {
    expect(BEISPIELE.map((b) => b.id)).toEqual([
      "beispiel-einsatz-2026-02-22", "beispiel-openr-2022-07-01", "vorlage-kommunikationsplan-label",
      "vorlage-fernmeldeskizze-stab", "beispiel-grosse-stabslage",
    ]);
    for (const b of BEISPIELE) {
      if (b.datum !== null) expect(b.datum).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(Number.isNaN(Date.parse(b.stand))).toBe(false);
    }
  });
  it("jeder verwendete Zeichenschlüssel steht im Generat", () => {
    const bekannt = new Set(Object.keys(zeichen.zeichen));
    for (const b of BEISPIELE) for (const s of b.inhalt.stellen) if (s.zeichen) expect(bekannt.has(s.zeichen), `${b.id}: ${s.zeichen}`).toBe(true);
  });
  it.each(BEISPIELE.map((b) => [b.id]))("%s: sauber und angebunden auf Bildschirm und A4, jedes Blatt ebenso", (id) => {
    const inhalt = nach(id).inhalt;
    for (const ziel of ["bildschirm", "a4-quer"] as const) {
      const z = zeichne(inhalt, ziel);
      expect([...pruefeZeichnung(z), ...pruefeMitte(z), ...pruefeVerbindungen(z, inhalt)].map((b) => b.text), ziel).toEqual([]);
    }
    for (const blatt of teileAuf(inhalt, "a4-quer")) {
      const z = blatt.zeichnung;
      expect([...pruefeZeichnung(z), ...pruefeMitte(z), ...pruefeVerbindungen(z, inhalt)].map((b) => b.text), `Blatt ${blatt.nummer}`).toEqual([]);
    }
  });
  /*
   * DIE ABNAHME: was die Excel-Vorlage heute auf EIN Blatt bringt, muss auch hier auf eines passen,
   * bei mindestens 6 pt. Ein Aufteilen wäre ein Rückschritt gegenüber der Vorlage.
   */
  it.each([["beispiel-einsatz-2026-02-22"], ["beispiel-openr-2022-07-01"], ["vorlage-kommunikationsplan-label"], ["vorlage-fernmeldeskizze-stab"]])(
    "%s passt auf ein Blatt A4 quer bei mindestens 6 pt",
    (id) => {
      const blaetter = teileAuf(nach(id).inhalt, "a4-quer");
      expect(blaetter).toHaveLength(1);
      expect(blaetter[0].massstab).toBeGreaterThanOrEqual(MIN_MASSSTAB);
    },
  );
  it("die große Stab-Lage teilt auf, jedes Blatt lesbar, jede Stelle genau einmal", () => {
    const b = nach("beispiel-grosse-stabslage");
    const blaetter = teileAuf(b.inhalt, "a4-quer");
    expect(blaetter.length).toBeGreaterThanOrEqual(2);
    for (const bl of blaetter) expect(bl.massstab).toBeGreaterThanOrEqual(MIN_MASSSTAB);
    const normal = blaetter.flatMap((bl) => bl.zeichnung.karten.filter((k) => k.art === "normal").map((k) => k.id));
    expect(normal.sort()).toEqual(b.inhalt.stellen.map((s) => s.id).sort());
    expect(zeichne(b.inhalt, "a4-quer").karten.some((k) => k.id.startsWith("ea-4-"))).toBe(true);
  });
  it("große Stab-Lage, Blatt 1: Stab, KatSL, Leitstelle und TEL als Karten, die Abschnitte als Karte oder Verweis in steigender Folge", () => {
    const [erstes] = teileAuf(nach("beispiel-grosse-stabslage").inhalt, "a4-quer");
    const art = (id: string) => erstes.zeichnung.karten.find((k) => k.id === id)?.art;
    for (const id of ["stab", "katsl", "lts", "tel"]) expect(art(id), id).toBe("normal"); // früher: TEL als Verweis, Blatt 1 fast leer
    for (let a = 1; a <= 4; a++) expect(["normal", "verweis"]).toContain(art(`eal-${a}`));
    const verweise = erstes.zeichnung.karten.filter((k) => k.art === "verweis").sort((p, q) => p.x - q.x);
    expect(verweise.length).toBeGreaterThan(0);
    const nummern = verweise.map((k) => Number(k.verweis!.text.replace("→ Blatt ", "")));
    expect(nummern).toEqual([...nummern].sort((p, q) => p - q));
  });
});
```

- [ ] **Step 2: Rot sehen**

Run: `pnpm vitest run src/app/m/kommplan/_lib/beispiele`
Expected: FAIL — `./index` fehlt.

- [ ] **Step 3: Beispiele schreiben**

`K/_lib/beispiele/einsatz20260222.ts`:
```ts
import { baue } from "./bau";
import type { Beispiel } from "./index";

/** Nachbau „Kommunikationsplan Einsatz 22.02.2026" (Excel-Vorlage, Blatt „Einsatz"). */
const LTS_KONTAKTE = {
  digitalfunk: "Leitstelle", telefon: "0581 / 82 266", mobil: "0581 / 19222", fax: "0581 / 82 284", email: "fel@landkreis-uelzen.de",
};
export { LTS_KONTAKTE };

export const EINSATZ_20260222: Beispiel = {
  id: "beispiel-einsatz-2026-02-22",
  titel: "Kommunikationsplan Einsatz 22.02.2026",
  typ: "kommunikationsplan", anlass: "Einsatz", datum: "2026-02-22", istVorlage: false,
  stand: "2026-02-16T09:00:00.000Z", bearbeiter: "BL BVS",
  inhalt: baue({
    optionen: { leerzeilen: true },
    verbindungen: [
      { id: "r-ue-1", art: "tmo", bezeichnung: "R_UE_1" },
      { id: "r-ue-2", art: "tmo", bezeichnung: "R_UE_2" },
      { id: "r-ue-3", art: "tmo", bezeichnung: "R_UE_3" },
      { id: "k-ue-2", art: "tmo", bezeichnung: "K_UE_2" },
    ],
    stellen: [
      { id: "lts", titel: "Leitstelle Uelzen", kontakte: LTS_KONTAKTE },
      { id: "el", titel: "Einsatzleitung", zeichen: "rezept:D.1.4", eltern: "lts", verbindung: "r-ue-1",
        kontakte: { digitalfunk: "RK UE 40-00 Wache", telefon: "0581 9032293" } },
      { id: "ea1", titel: "EA 1 Notunterkunft 1. HEG", zeichen: "zusatz:eal", eltern: "el", verbindung: "r-ue-2",
        kontakte: { digitalfunk: "RK UE 40-05-1", telefon: "EA NuK 1." },
        einheiten: ["MTW RK UE 40-17-3", "MTW RK UE 40-17-1", ["Foodtruck", ""], ["GW-Ver", "RK UE 40-74-1"], "RTW RK UE 40-83-3", ["NEA", "60 KVA"]] },
      { id: "ea2", titel: "EA 2 Notunterkunft 2. Sternschule", zeichen: "zusatz:eal", eltern: "el", verbindung: "r-ue-2",
        kontakte: { digitalfunk: "RK LG", telefon: "EA NuK 2." },
        einheiten: ["MTW RK UE 40-17-2", "RTW RK UE 40-83-4", ["Kühlanhänger", ""]] },
      { id: "ea3", titel: "EA 3 Evakuierung Rosenmauer", zeichen: "zusatz:eal", eltern: "el", verbindung: "r-ue-2",
        kontakte: { digitalfunk: "RK UE 40-12-1", telefon: "40-12-1" } },
      { id: "ea5", titel: "EA 5 Transport", zeichen: "zusatz:eal", eltern: "el", verbindung: "r-ue-3",
        kontakte: { digitalfunk: "RK UE 40-00" },
        einheiten: [
          "RTW RK UE 40-83-5", "RTW RK UE 40-83-6", "KTW RK UE 40-92-1", "KTW RK UE 40-92-2", "KTW RK UE 41-92-8",
          "KTW RK UE 41-92-9", "KTW RK UE 41-92-10", "KTW RK UE 41-92-11", "KTW RK UE 41-92-12",
        ] },
    ],
  }),
};
```

`K/_lib/beispiele/openr20220701.ts`:
```ts
import { baue } from "./bau";
import { LTS_KONTAKTE } from "./einsatz20260222";
import type { Beispiel } from "./index";

/**
 * Nachbau „Kommunikationsplan OpenR 01.07.2022". Unter EA 1 hängen „DMO 608" und „R_UE_2", unter
 * EA 2 „DMO 609" und „R_UE_2", unter EA 3 und EA 4 „R_UE_2": Kanäle, die der Abschnitt für seine
 * Fahrzeuge BENUTZT, ohne Gegenstelle — als `kanaele` (Abweichung 12), nicht als Reserve. Reserve
 * ist allein UE_K_1, das in der Vorlage lose steht.
 */
export const OPENR_20220701: Beispiel = {
  id: "beispiel-openr-2022-07-01",
  titel: "Kommunikationsplan OpenR 01.07.2022",
  typ: "kommunikationsplan", anlass: "OpenR", datum: "2022-07-01", istVorlage: false,
  stand: "2022-06-28T10:00:00.000Z", bearbeiter: "KBL DRK Kreisverband Uelzen e. V.",
  inhalt: baue({
    optionen: { leerzeilen: true },
    verbindungen: [
      { id: "r-ue-1", art: "tmo", bezeichnung: "R_UE_1" },
      { id: "bos-res-09", art: "tmo", bezeichnung: "BOS_NI_RES_09" },
      { id: "r-ue-2", art: "tmo", bezeichnung: "R_UE_2" },
      { id: "r-ue-3", art: "tmo", bezeichnung: "R_UE_3" },
      { id: "ue-k-1", art: "tmo", bezeichnung: "UE_K_1" },
      { id: "dmo-608", art: "dmo", bezeichnung: "DMO 608" },
      { id: "dmo-609", art: "dmo", bezeichnung: "DMO 609" },
    ],
    stellen: [
      { id: "lts", titel: "Leitstelle Uelzen", kontakte: LTS_KONTAKTE },
      { id: "fuekw", titel: "FüKW", eltern: "lts", verbindung: "r-ue-1",
        kontakte: { digitalfunk: "RK UE 40-12-1", telefon: "0580 4999 9790", email: "elw@drk-uelzen.de" } },
      { id: "el", titel: "Einsatzleiter", zeichen: "rezept:D.1.4", leiter: "Max Mustermann", eltern: "fuekw", lage: "links", verbindung: "bos-res-09",
        kontakte: { digitalfunk: "RK UE 97-03", telefon: "0581 0000000", mobil: "0170 0000000", email: "max.mustermann@example.org" },
        einheiten: ["KdoW 40-10-1"] },
      { id: "ea1", titel: "EA 1 Behandlungsplatz", zeichen: "zusatz:eal", eltern: "fuekw", verbindung: "bos-res-09",
        kanaele: ["dmo-608", "r-ue-2"], kontakte: { digitalfunk: "RK UE 40-05-1" },
        einheiten: [["WLF", "40-66-1 AB MANV"], "GW-San 40-96-1", "MTW 40-17-1", ["AB", "Alles"], ["AB", "Sanitätsstation"], "KdoW 40-10-2"] },
      { id: "ea2", titel: "EA 2 Bühne", zeichen: "zusatz:eal", eltern: "fuekw", verbindung: "bos-res-09",
        kanaele: ["dmo-609", "r-ue-2"], kontakte: { funkrufname: "Lüneburg", digitalfunk: "RK LG 45-11-1" },
        einheiten: ["ELW RK LG 45-11-1", ["GW Betreuung", "RK LG 45-74-10"], "MTW RK LG 45-17-12"] },
      { id: "ea3", titel: "EA 3 Verpflegung", zeichen: "zusatz:eal", eltern: "fuekw", verbindung: "bos-res-09",
        kanaele: ["r-ue-2"], kontakte: { digitalfunk: "RK UE 40-05-2" },
        einheiten: [["GW Verpflegung", "40-74-1"], ["GW Betreuung", "40-74-2"], "MTW 44-17-1", ["Foodtruck", ""], ["Kühlanhänger", ""]] },
      { id: "ea4", titel: "EA 4 Logistik & Technik", zeichen: "zusatz:eal", eltern: "fuekw", verbindung: "bos-res-09",
        kanaele: ["r-ue-2"], kontakte: { digitalfunk: "RK UE 40-05-3" },
        einheiten: ["MTW 40-17-2", ["NEA", "60 KVA"], ["Teleskoplader", ""]] },
      { id: "rettungsmittel", titel: "Rettungsmittel", zeichen: "zusatz:ea", eltern: "fuekw", verbindung: "r-ue-2",
        einheiten: ["NEF 41-82-2", "RTW 40-83-2", "RTW 40-83-3", "RTW 40-83-4", "RTW 40-83-5", "RTW 40-83-6"] },
      { id: "fussstreife", titel: "Fußstreife", zeichen: "zusatz:ea", eltern: "fuekw", verbindung: "r-ue-3",
        einheiten: [
          ["Fußstreife", "1 (EA 1)"], ["Fußstreife", "2 (EA 1)"], ["Fußstreife", "3 (EA 1)"],
          ["Fußstreife", "4 (EA 2) Lüneburg"], ["Fußstreife", "5 (EA 2) Lüneburg"],
        ] },
    ],
  }),
};
```

`K/_lib/beispiele/label.ts`:
```ts
import { baue } from "./bau";
import { LTS_KONTAKTE } from "./einsatz20260222";
import type { Beispiel } from "./index";

/** Nachbau „Kommunikationsplan Label" — die Vorlage, aus der Tagespläne entstehen. */
export const LABEL: Beispiel = {
  id: "vorlage-kommunikationsplan-label",
  titel: "Kommunikationsplan Label",
  typ: "kommunikationsplan", anlass: "Label", datum: null, istVorlage: true,
  stand: "2026-09-01T08:00:00.000Z", bearbeiter: "DRK Kreisverband Uelzen e. V. · Der Kreisbereitschaftsleiter",
  inhalt: baue({
    optionen: { leerzeilen: true },
    verbindungen: [{ id: "r-ue-1", art: "tmo", bezeichnung: "R_UE_1" }, { id: "r-ue-2", art: "tmo", bezeichnung: "R_UE_2" }],
    stellen: [
      { id: "lts", titel: "Leitstelle Uelzen", kontakte: LTS_KONTAKTE },
      { id: "el", titel: "Einsatzleiter", leiter: "Max Mustermann", zeichen: "rezept:D.1.4", eltern: "lts", verbindung: "r-ue-1" },
      { id: "patientenablage", titel: "Patientenablage", zeichen: "zusatz:eal", eltern: "el", verbindung: "r-ue-2" },
      { id: "transport", titel: "Transportorganisation", zeichen: "zusatz:eal", eltern: "el", verbindung: "r-ue-2" },
      { id: "bereitstellungsraum", titel: "Bereitstellungsraum", zeichen: "zusatz:eal", eltern: "el", verbindung: "r-ue-2",
        hervorheben: true, kontakte: { digitalfunk: "RK UE 40-92-1" } },
    ],
  }),
};
```

`K/_lib/beispiele/fernmeldeskizzeStab.ts`:
```ts
import { baue } from "./bau";
import type { Beispiel } from "./index";

/**
 * Nachbau „Fernmeldeskizze" auf Stabsebene: KatSL links über Draht, Leitstelle rechts über Funk,
 * darunter der Stabsbus (DMO). Die Vorlage lässt den Bus offen; zwei Einsatzabschnitte füllen ihn.
 */
export const FERNMELDESKIZZE_STAB: Beispiel = {
  id: "vorlage-fernmeldeskizze-stab",
  titel: "Fernmeldeskizze",
  typ: "fernmeldeskizze", anlass: null, datum: null, istVorlage: true,
  stand: "2026-09-30T09:56:00.000Z", bearbeiter: "Kat-Stab",
  inhalt: baue({
    optionen: { leerzeilen: true },
    verbindungen: [
      { id: "standleitung", art: "draht", bezeichnung: "Standleitung" },
      { id: "r-ue-1", art: "tmo", bezeichnung: "R_UE_1" },
      { id: "stabsfunk", art: "dmo", bezeichnung: "Stabsfunk DMO" },
    ],
    stellen: [
      { id: "stab", titel: "Stab", zeichen: "zusatz:stab" },
      { id: "katsl", titel: "PD", zeichen: "rezept:D.1.2", eltern: "stab", lage: "links", verbindung: "standleitung" },
      { id: "lts", titel: "Leitstelle", eltern: "stab", lage: "rechts", verbindung: "r-ue-1" },
      { id: "ea-nord", titel: "Einsatzabschnitt Nord", zeichen: "zusatz:eal", eltern: "stab", verbindung: "stabsfunk" },
      { id: "ea-sued", titel: "Einsatzabschnitt Süd", zeichen: "zusatz:eal", eltern: "stab", verbindung: "stabsfunk" },
    ],
  }),
};
```

`K/_lib/beispiele/grosseStabslage.ts`:
```ts
import type { Verbindung } from "../plan/schema";
import { baue, type StelleEingabe } from "./bau";
import type { Beispiel } from "./index";

/**
 * Eine große Stab-Lage (Kat-Fall, Spec A4): Stab mit KatSL und Leitstelle, TEL, vier
 * Einsatzabschnittsleitungen mit 6, 8, 10 und 12 Abschnitten (Kamm ab 7) und je 2–8 Fahrzeugen.
 * Deterministisch erzeugt — dieselbe Lage in jedem Lauf. Auf A4 muss sie aufteilen.
 */
function erzeuge(): Beispiel["inhalt"] {
  const verbindungen: Verbindung[] = [
    { id: "standleitung", art: "draht", bezeichnung: "Standleitung" },
    { id: "r-ue-1", art: "tmo", bezeichnung: "R_UE_1" },
    { id: "stabsfunk", art: "dmo", bezeichnung: "Stabsfunk DMO" },
    ...[2, 3, 4, 5].map((n) => ({ id: `r-ue-${n}`, art: "tmo" as const, bezeichnung: `R_UE_${n}` })),
    ...[1, 2, 3, 4].map((n) => ({ id: `dmo-${600 + n}`, art: "dmo" as const, bezeichnung: `DMO ${600 + n}` })),
    { id: "k-ue-2", art: "tmo", bezeichnung: "K_UE_2" },
  ];
  const stellen: StelleEingabe[] = [
    { id: "stab", titel: "Stab", zeichen: "zusatz:stab", kontakte: { telefon: "0581 / 82-0", fax: "0581 / 82-1" } },
    { id: "katsl", titel: "Katastrophenschutzleitung", zeichen: "rezept:D.1.2", eltern: "stab", lage: "links", verbindung: "standleitung" },
    { id: "lts", titel: "Leitstelle Uelzen", eltern: "stab", lage: "rechts", verbindung: "r-ue-1" },
    { id: "tel", titel: "Technische Einsatzleitung", zeichen: "rezept:D.1.7", eltern: "stab", verbindung: "stabsfunk",
      kontakte: { funkrufname: "TEL Uelzen", digitalfunk: "RK UE 40-12-1" } },
  ];
  for (let a = 1; a <= 4; a++) {
    stellen.push({ id: `eal-${a}`, titel: `Einsatzabschnitt ${a}`, zeichen: "zusatz:eal", eltern: "tel", verbindung: `r-ue-${a + 1}`,
      kontakte: { digitalfunk: `RK UE 40-0${a}-1` } });
    for (let e = 1; e <= 4 + 2 * a; e++) {
      const anzahl = 2 + ((a * 7 + e * 3) % 7);
      stellen.push({
        id: `ea-${a}-${e}`, titel: `EA ${a}.${e}`, zeichen: "zusatz:ea", eltern: `eal-${a}`, verbindung: `dmo-${600 + a}`,
        kontakte: { digitalfunk: `RK UE 4${a}-${10 + e}-1` },
        einheiten: Array.from({ length: anzahl }, (_, i) => `${i % 2 === 0 ? "RTW" : "KTW"} RK UE 4${a}-8${e % 10}-${i + 1}`),
      });
    }
  }
  return baue({ verbindungen, stellen });
}

export const GROSSE_STABSLAGE: Beispiel = {
  id: "beispiel-grosse-stabslage",
  titel: "Fernmeldeskizze Kat-Fall (Beispiel)",
  typ: "fernmeldeskizze", anlass: "Übung Kat-Fall", datum: "2026-09-12", istVorlage: false,
  stand: "2026-09-12T07:30:00.000Z", bearbeiter: "Kat-Stab S 6",
  inhalt: erzeuge(),
};
```

`K/_lib/beispiele/index.ts`:
```ts
import type { PlanInhalt } from "../plan/schema";
import { EINSATZ_20260222 } from "./einsatz20260222";
import { FERNMELDESKIZZE_STAB } from "./fernmeldeskizzeStab";
import { GROSSE_STABSLAGE } from "./grosseStabslage";
import { LABEL } from "./label";
import { OPENR_20220701 } from "./openr20220701";

export interface Beispiel {
  id: string; titel: string; typ: "kommunikationsplan" | "fernmeldeskizze";
  anlass: string | null; datum: string | null; istVorlage: boolean;
  stand: string; bearbeiter: string; inhalt: PlanInhalt;
}

/** Die Beispielpläne — Seed, Golden-Tests, Vorschau und e2e lesen genau diese Liste. */
export const BEISPIELE: readonly Beispiel[] = [EINSATZ_20260222, OPENR_20220701, LABEL, FERNMELDESKIZZE_STAB, GROSSE_STABSLAGE];
```

(Die Module importieren `Beispiel` nur als Typ aus `./index`; zur Laufzeit gibt es keinen Zyklus.)

- [ ] **Step 4: Grün sehen — oder die Maße nachziehen**

Run: `uptime && pnpm vitest run src/app/m/kommplan/_lib/beispiele`
Expected: PASS.

Schlägt die Abnahme „passt auf ein Blatt" fehl, ist das eine Aussage über die Maße aus Task 2, nicht über die Beispiele. Erlaubte Stellschrauben in `masse.ts`, in dieser Reihenfolge und jeweils mit erneutem Lauf aller Layout-Tests: `EINHEIT.takt` bis 5,0; `KANAL.takt` bis 7,0; `KARTE.kontaktHoehe` bis 4,3; `ABSTAND.geschwister` bis 6; `ABSTAND.gruppen` bis 10. (Abschätzung der Planung für OpenR mit den Kanal-Sechsecken: ≈ 206 von 215 Layout-mm Höhe und ≈ 324 von 369 mm Breite bei Maßstab 0,75 — knapp, aber innerhalb.) `MINDEST` gehört nicht zu den Stellschrauben. **Nie** eine Schrift unter 8 pt oder `MIN_MASSSTAB` ändern. Passt OpenR danach immer noch nicht, **anhalten** und dem Hauptlauf melden (Maße, gemessener Maßstab je Achse) — das ist eine Entscheidung über Lesbarkeit gegen Blattzahl, keine Implementierungsfrage.

- [ ] **Step 5: Commit**

```bash
git add src/app/m/kommplan/_lib/beispiele
git commit -S -m "feat(kommplan): Beispielpläne als Nachbau der Excel-Vorlagen" -m "Einsatz 22.02.2026, OpenR 01.07.2022, Label, Fernmeldeskizze Stab und eine große Stab-Lage. Die Vorlagenpläne passen wie in Excel auf ein Blatt A4 quer bei mindestens 6 pt; die Stab-Lage teilt auf." -m "DRK-500" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 14: SVG-Renderer (rein darstellend, Server und Client)

**Files:**
- Create: `K/_ui/zeichnung/farben.ts`, `K/_ui/zeichnung/Symbole.tsx`, `K/_ui/zeichnung/Text.tsx`, `K/_ui/zeichnung/Karte.tsx`, `K/_ui/zeichnung/Sechseck.tsx`, `K/_ui/zeichnung/Zeichnung.tsx`, `K/_ui/zeichnung/Blatt.tsx`
- Test: `K/_ui/zeichnung/Zeichnung.test.tsx`, `K/_ui/zeichnung/Blatt.test.tsx`

**Interfaces:**
- Consumes: `Zeichnungsdaten`, `Blatt`, `KarteL`, … (Task 5), `PIKTOGRAMME`, `KONTAKT_PIKTOGRAMM`, `Symbolquelle` (Task 2), `KARTE`, `EINHEIT`, `SECHSECK`, `BLATT`, `PAPIER`, `PT_IN_MM` (Task 2), `LEGENDE`, `zeichenflaeche` (Task 12).
- Produces:
  - `farben.ts`: `FARBE = { tinte: "#000000", papier: "#ffffff", anker: "#8c8c8c", hervor: "#ffe3b3", abzeichen: "#f0f0f0", marke: "#c8000f" }`, `STRICH = { karte: 0.25, linie: 0.3, duenn: 0.15, hervor: 0.6 }`. Papier kennt keinen Dunkelmodus: die Zeichnung ist in beiden Modi weiß (Vorbild `feedback/(print)/druck.css`, `.fb-aushang`).
  - `Symbole.tsx`: `type Symbolsatz = Readonly<Record<string, Symbolquelle>>`; `symbolId(schluessel: string): string` (`kp-` + Schlüssel, Nicht-ID-Zeichen → `-`); `SymbolDefs({ symbole }: { symbole: Symbolsatz })` — `<defs>` mit jedem übergebenen Zeichen und allen `PIKTOGRAMME` genau einmal als `<symbol>`.
  - `Text.tsx`: `Text({ z, farbe? })`.
  - `Karte.tsx`: `Karte({ k, zusatz? })`, `Einheit({ e })`, `Abzeichen({ a })` — je `<g transform="translate(…)" data-karte|data-einheit|data-abzeichen>` mit `<title>` (voller Text).
  - `Sechseck.tsx`: `sechseckPunkte(form, breite, hoehe): string`, `Sechseck({ s })`.
  - `Zeichnung.tsx`: `ZeichnungInhalt({ daten, zusatz? })` (nur `<g>`; Linien → Sechsecke → Karten → Einheiten → Abzeichen); `Zeichnung({ daten, symbole, titel, schrift?, kopfStil?, zusatz?, mitDefs? })` (eigenes `<svg>` in mm).
  - `Blatt.tsx`: `interface Rahmen { titel: string; untertitel: string | null; stand: string; bearbeiter: string; vermerkVsNfD: boolean; organisation: string }`; `Blattansicht({ blatt, rahmen, symbole, schrift?, kopfStil?, mitDefs? })` — `<svg class="kp-blatt" data-blatt={nummer} width="297mm" height="210mm" viewBox="0 0 297 210">` mit Kopf, Zeichnung (`translate(ursprung) scale(massstab)`), Legende und Fuß.
- Kein `"use client"`, kein `next/*`, keine antd-Komponente, keine `@ant-design/icons` (Fallen 1, 6, 7; `grenze.test.ts`). `zusatz` ist eine Funktion und darf deshalb nur aus einer Client-Insel übergeben werden (Falle 9) — die Server-Seiten übergeben ihn nie.

- [ ] **Step 1: Failing tests**

`K/_ui/zeichnung/Zeichnung.test.tsx`:
```tsx
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { BEISPIELE } from "../../_lib/beispiele";
import { zeichne } from "../../_lib/layout/zeichne";
import { PIKTOGRAMME } from "../../_lib/zeichen/grundlagen";
import zeichen from "../../_lib/zeichen/zeichen.generiert.json";
import { FARBE } from "./farben";
import { symbolId } from "./Symbole";
import { Zeichnung } from "./Zeichnung";

const alle = zeichen.zeichen as Record<string, { viewBox: string; inhalt: string }>;
const einsatz = BEISPIELE[0];
const symbole = Object.fromEntries(
  [...new Set(einsatz.inhalt.stellen.map((s) => s.zeichen).filter((z): z is string => z !== null))].map((k) => [k, alle[k]]),
);
const zaehle = (html: string, teil: string) => html.split(teil).length - 1;

describe("Zeichnung", () => {
  const daten = zeichne(einsatz.inhalt, "bildschirm");
  const html = renderToStaticMarkup(<Zeichnung daten={daten} symbole={symbole} titel={einsatz.titel} schrift="Arimo" />);

  it("jede Karte, Einheit, Linie und jedes Sechseck erscheint", () => {
    expect(zaehle(html, "data-karte=")).toBe(daten.karten.length);
    expect(zaehle(html, "data-einheit=")).toBe(daten.einheiten.length);
    expect(zaehle(html, "<line")).toBeGreaterThanOrEqual(daten.linien.length);
    expect(zaehle(html, "data-sechseck=")).toBe(daten.sechsecke.length);
  });
  it("jedes Symbol steht genau einmal in defs und wird per use referenziert (M11)", () => {
    expect(zaehle(html, `id="${symbolId("zusatz:eal")}"`)).toBe(1);
    expect(zaehle(html, `href="#${symbolId("zusatz:eal")}"`)).toBe(4);
    for (const k of Object.keys(PIKTOGRAMME)) expect(zaehle(html, `id="${symbolId(k)}"`)).toBe(1);
  });
  it("die Schrift kommt vom Wurzel-svg, die Größe in mm", () => {
    expect(html).toMatch(/<svg[^>]*style="font-family:Arimo/);
    expect(html).toMatch(/width="[\d.]+mm"/);
  });
  it("hervorgehobene und Anker-Karten tragen ihre Farben", () => {
    const label = BEISPIELE.find((b) => b.id === "vorlage-kommunikationsplan-label")!;
    const h = renderToStaticMarkup(<Zeichnung daten={zeichne(label.inhalt, "bildschirm")} symbole={{}} titel="x" />);
    expect(h).toContain(FARBE.hervor);
  });
  it("gekürzte Titel und Einheiten tragen den vollen Text als title", () => {
    expect(html).toContain("<title>KTW RK UE 41-92-12</title>");
    expect(html).toContain("<title>EA 2 Notunterkunft 2. Sternschule</title>");
  });
});
```

`K/_ui/zeichnung/Blatt.test.tsx`:
```tsx
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { BEISPIELE } from "../../_lib/beispiele";
import { teileAuf } from "../../_lib/layout/papier";
import { leererPlan } from "../../_lib/plan/operationen";
import { Blattansicht, type Rahmen } from "./Blatt";

const rahmen: Rahmen = {
  titel: "Kommunikationsplan Label", untertitel: "Label", stand: "Stand: 30.09.2026, 11:56",
  bearbeiter: "Bearbeitung: Kreisbereitschaftsleiter", vermerkVsNfD: true, organisation: "Deutsches Rotes Kreuz",
};

describe("Blattansicht", () => {
  it("A4 quer mit Kopf, Legende, Fuß und Blattzähler", () => {
    const [blatt] = teileAuf(BEISPIELE[2].inhalt, "a4-quer");
    const html = renderToStaticMarkup(<Blattansicht blatt={blatt} rahmen={rahmen} symbole={{}} />);
    expect(html).toMatch(/<svg[^>]*class="kp-blatt"[^>]*>/);
    expect(html).toContain('width="297mm"');
    expect(html).toContain('height="210mm"');
    expect(html).toContain('data-blatt="1"');
    for (const t of ["Kommunikationsplan Label", "VS – nur für den Dienstgebrauch", "Stand: 30.09.2026, 11:56", "Blatt 1 von 1", "Digitalfunk TMO", "Deutsches Rotes Kreuz"]) {
      expect(html).toContain(t);
    }
    expect(html).toMatch(/transform="translate\([\d.]+ [\d.]+\) scale\([\d.]+\)"/);
  });
  it("ohne VS-NfD-Vermerk steht er nicht da", () => {
    const [blatt] = teileAuf(BEISPIELE[2].inhalt, "a4-quer");
    expect(renderToStaticMarkup(<Blattansicht blatt={blatt} rahmen={{ ...rahmen, vermerkVsNfD: false }} symbole={{}} />))
      .not.toContain("nur für den Dienstgebrauch");
  });
  it("leerer Plan: ein Blatt mit Hinweis statt einer leeren Fläche", () => {
    const [blatt] = teileAuf(leererPlan(), "a4-quer");
    expect(renderToStaticMarkup(<Blattansicht blatt={blatt} rahmen={rahmen} symbole={{}} />)).toContain("Dieser Plan hat noch keine Stellen.");
  });
  it("mitDefs={false} lässt die Symbole weg (die Druckseite liefert sie einmal für alle Blätter)", () => {
    const [blatt] = teileAuf(BEISPIELE[0].inhalt, "a4-quer");
    expect(renderToStaticMarkup(<Blattansicht blatt={blatt} rahmen={rahmen} symbole={{}} mitDefs={false} />)).not.toContain("<symbol");
  });
});
```

- [ ] **Step 2: Rot sehen**

Run: `pnpm vitest run src/app/m/kommplan/_ui/zeichnung`
Expected: FAIL — Module fehlen.

- [ ] **Step 3: Implementieren**

`K/_ui/zeichnung/farben.ts`:
```ts
/**
 * Die Farben des Plans. Papier kennt keinen Dunkelmodus: die Zeichnung ist auch am Bildschirm
 * weiß, damit Ansicht und Ausdruck gleich aussehen (Spec A3). Suite-Rot nur als Marke im Kopf,
 * nie als Fläche (Falle 3): „hervorheben" ist ein warmes Hellorange.
 */
export const FARBE = { tinte: "#000000", papier: "#ffffff", anker: "#8c8c8c", hervor: "#ffe3b3", abzeichen: "#f0f0f0", marke: "#c8000f" } as const;
export const STRICH = { karte: 0.25, linie: 0.3, duenn: 0.15, hervor: 0.6 } as const;
```

`K/_ui/zeichnung/Symbole.tsx`:
```tsx
import { PIKTOGRAMME, type Symbolquelle } from "../../_lib/zeichen/grundlagen";

export type Symbolsatz = Readonly<Record<string, Symbolquelle>>;

export function symbolId(schluessel: string): string {
  return `kp-${schluessel.replace(/[^A-Za-z0-9_-]/g, "-")}`;
}

/**
 * Jedes Zeichen EINMAL als <symbol>, referenziert per <use> — löst Befund M11 (doppelte IDs) ohne
 * Präfix je Instanz. Der Inhalt stammt aus dem eingecheckten Generat, nicht aus Nutzereingaben.
 */
export function SymbolDefs({ symbole }: { symbole: Symbolsatz }) {
  const alle = { ...symbole, ...PIKTOGRAMME };
  return (
    <defs>
      {Object.keys(alle).sort().map((k) => (
        <symbol key={k} id={symbolId(k)} viewBox={alle[k].viewBox} dangerouslySetInnerHTML={{ __html: alle[k].inhalt }} />
      ))}
    </defs>
  );
}
```

`K/_ui/zeichnung/Text.tsx`:
```tsx
import { PT_IN_MM } from "../../_lib/layout/masse";
import type { TextZeile } from "../../_lib/layout/typen";
import { FARBE } from "./farben";

const ANKER = { start: "start", mitte: "middle", ende: "end" } as const;

export function Text({ z, farbe = FARBE.tinte }: { z: TextZeile; farbe?: string }) {
  return (
    <text x={z.x} y={z.y} fontSize={z.groesse * PT_IN_MM} fontWeight={z.fett ? 700 : 400} textAnchor={ANKER[z.anker]} fill={farbe}>
      {z.text}
    </text>
  );
}
```

`K/_ui/zeichnung/Karte.tsx`:
```tsx
import type { ReactNode } from "react";
import { EINHEIT, KARTE } from "../../_lib/layout/masse";
import type { AbzeichenL, EinheitL, KarteL } from "../../_lib/layout/typen";
import { KONTAKT_PIKTOGRAMM } from "../../_lib/zeichen/grundlagen";
import { FARBE, STRICH } from "./farben";
import { symbolId } from "./Symbole";
import { Text } from "./Text";

export function Karte({ k, zusatz }: { k: KarteL; zusatz?: (k: KarteL) => ReactNode }) {
  const tinte = k.art === "anker" ? FARBE.anker : FARBE.tinte;
  const rahmen = k.hervorheben ? STRICH.hervor : STRICH.karte;
  const trenner = (y: number, key?: number) => <line key={key} x1={0} y1={y} x2={k.breite} y2={y} stroke={tinte} strokeWidth={STRICH.karte} />;
  return (
    <g transform={`translate(${k.x} ${k.y})`} data-karte={k.id} data-art={k.art}>
      {/* Nur Tooltip, nie gedruckt: der Platzhalter steht nicht auf dem Papier (Abweichung 15). */}
      <title>{k.titelVoll === "" ? "(ohne Titel)" : k.titelVoll}</title>
      <rect width={k.breite} height={k.hoehe} fill={FARBE.papier} stroke={tinte} strokeWidth={rahmen} />
      {k.hervorheben ? <rect x={rahmen / 2} y={rahmen / 2} width={k.breite - rahmen} height={k.kopfHoehe - rahmen} fill={FARBE.hervor} /> : null}
      {k.zeichen ? (
        <use href={`#${symbolId(k.zeichen)}`} x={KARTE.rand} y={KARTE.rand} width={KARTE.zeichen} height={KARTE.zeichen} opacity={k.art === "anker" ? 0.45 : 1} />
      ) : null}
      {k.titel.map((z, i) => <Text key={i} z={z} farbe={tinte} />)}
      {k.leiter ? <Text z={k.leiter} farbe={tinte} /> : null}
      {k.kontakte.length > 0 || k.verweis ? trenner(k.kopfHoehe) : null}
      {k.kontakte.length > 0 ? (
        <line x1={KARTE.piktoSpalte} y1={k.kopfHoehe} x2={KARTE.piktoSpalte} y2={k.hoehe} stroke={tinte} strokeWidth={STRICH.karte} />
      ) : null}
      {k.kontakte.map((z, i) => (
        <g key={i} data-kontakt={z.art}>
          {i > 0 ? trenner(z.y) : null}
          <use
            href={`#${symbolId(KONTAKT_PIKTOGRAMM[z.art])}`}
            x={(KARTE.piktoSpalte - KARTE.piktoGroesse) / 2} y={z.y + (z.hoehe - KARTE.piktoGroesse) / 2}
            width={KARTE.piktoGroesse} height={KARTE.piktoGroesse}
          />
          {z.zeilen.map((t, j) => <Text key={j} z={t} farbe={tinte} />)}
        </g>
      ))}
      {k.verweis ? <Text z={k.verweis} farbe={tinte} /> : null}
      {zusatz?.(k)}
    </g>
  );
}

export function Einheit({ e }: { e: EinheitL }) {
  return (
    <g transform={`translate(${e.x} ${e.y})`} data-einheit={e.id}>
      <title>{e.voll}</title>
      <rect width={e.breite} height={e.hoehe} fill={FARBE.papier} stroke={FARBE.tinte} strokeWidth={STRICH.karte} />
      {e.zeichen ? <use href={`#${symbolId(e.zeichen)}`} x={KARTE.rand} y={(e.hoehe - EINHEIT.zeichen) / 2} width={EINHEIT.zeichen} height={EINHEIT.zeichen} /> : null}
      <Text z={e.text} />
    </g>
  );
}

export function Abzeichen({ a }: { a: AbzeichenL }) {
  return (
    <g transform={`translate(${a.x} ${a.y})`} data-abzeichen={a.stelleId}>
      <rect width={a.breite} height={a.hoehe} rx={a.hoehe / 2} fill={FARBE.abzeichen} stroke={FARBE.tinte} strokeWidth={STRICH.karte} />
      <Text z={a.text} />
    </g>
  );
}
```

`K/_ui/zeichnung/Sechseck.tsx`:
```tsx
import { SECHSECK } from "../../_lib/layout/masse";
import type { SechseckForm, SechseckL } from "../../_lib/layout/typen";
import { FARBE, STRICH } from "./farben";
import { symbolId } from "./Symbole";
import { Text } from "./Text";

export function sechseckPunkte(form: SechseckForm, b: number, h: number): string {
  if (form === "leitung") {
    const f = SECHSECK.fase;
    return `${f},0 ${b - f},0 ${b},${f} ${b},${h - f} ${b - f},${h} ${f},${h} 0,${h - f} 0,${f}`;
  }
  const s = SECHSECK.spitze;
  return `0,${h / 2} ${s},0 ${b - s},0 ${b},${h / 2} ${b - s},${h} ${s},${h}`;
}

export function Sechseck({ s }: { s: SechseckL }) {
  return (
    <g transform={`translate(${s.x} ${s.y})`} data-sechseck={s.verbindungId}>
      <title>{s.voll}</title>
      <polygon
        points={sechseckPunkte(s.form, s.breite, s.hoehe)} fill={FARBE.papier} stroke={FARBE.tinte}
        strokeWidth={STRICH.linie} strokeDasharray={s.form === "mobil" ? "1 0.6" : undefined}
      />
      <use href={`#${symbolId(s.piktogramm)}`} x={SECHSECK.spitze} y={(s.hoehe - SECHSECK.piktoHoehe) / 2} width={SECHSECK.piktoBreite} height={SECHSECK.piktoHoehe} />
      <Text z={s.beschriftung} />
    </g>
  );
}
```

`K/_ui/zeichnung/Zeichnung.tsx`:
```tsx
import type { ReactNode } from "react";
import type { KarteL, Zeichnungsdaten } from "../../_lib/layout/typen";
import { FARBE, STRICH } from "./farben";
import { Abzeichen, Einheit, Karte } from "./Karte";
import { Sechseck } from "./Sechseck";
import { SymbolDefs, type Symbolsatz } from "./Symbole";

export function ZeichnungInhalt({ daten, zusatz }: { daten: Zeichnungsdaten; zusatz?: (k: KarteL) => ReactNode }) {
  return (
    <g>
      <g fill="none" stroke={FARBE.tinte} strokeLinecap="square">
        {daten.linien.map((l, i) => (
          <line key={i} x1={l.x1} y1={l.y1} x2={l.x2} y2={l.y2} strokeWidth={l.duenn ? STRICH.duenn : STRICH.linie} data-netz={l.netz} />
        ))}
      </g>
      {daten.sechsecke.map((s, i) => <Sechseck key={i} s={s} />)}
      {daten.karten.map((k) => <Karte key={k.id} k={k} zusatz={zusatz} />)}
      {daten.einheiten.map((e) => <Einheit key={e.id} e={e} />)}
      {daten.abzeichen.map((a) => <Abzeichen key={a.stelleId} a={a} />)}
    </g>
  );
}

export function Zeichnung({
  daten, symbole, titel, schrift, kopfStil, zusatz, mitDefs = true,
}: {
  daten: Zeichnungsdaten; symbole: Symbolsatz; titel: string; schrift?: string; kopfStil?: string;
  zusatz?: (k: KarteL) => ReactNode; mitDefs?: boolean;
}) {
  const b = Math.max(daten.breite, 1), h = Math.max(daten.hoehe, 1);
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox={`0 0 ${b} ${h}`} width={`${b}mm`} height={`${h}mm`} role="img" aria-label={titel}
      style={{ fontFamily: schrift, background: FARBE.papier }}>
      {kopfStil ? <style>{kopfStil}</style> : null}
      {mitDefs ? <SymbolDefs symbole={symbole} /> : null}
      <ZeichnungInhalt daten={daten} zusatz={zusatz} />
    </svg>
  );
}
```

`K/_ui/zeichnung/Blatt.tsx`:
```tsx
import { BLATT, PAPIER, PT_IN_MM, SECHSECK } from "../../_lib/layout/masse";
import { LEGENDE, zeichenflaeche } from "../../_lib/layout/papier";
import { sechseckForm } from "../../_lib/layout/sechseck";
import { textBreite } from "../../_lib/layout/text";
import type { Blatt } from "../../_lib/layout/typen";
import { VERBINDUNG_PIKTOGRAMM } from "../../_lib/zeichen/grundlagen";
import { FARBE, STRICH } from "./farben";
import { sechseckPunkte } from "./Sechseck";
import { SymbolDefs, symbolId, type Symbolsatz } from "./Symbole";
import { ZeichnungInhalt } from "./Zeichnung";

/** Die vom Aufrufer formatierten Rahmentexte — der Renderer kennt weder Uhr noch Zeitzone. */
export interface Rahmen { titel: string; untertitel: string | null; stand: string; bearbeiter: string; vermerkVsNfD: boolean; organisation: string }

const pt = (p: number) => p * PT_IN_MM;

export function Blattansicht({ blatt, rahmen, symbole, schrift, kopfStil, mitDefs = true }: {
  blatt: Blatt; rahmen: Rahmen; symbole: Symbolsatz; schrift?: string; kopfStil?: string; mitDefs?: boolean;
}) {
  const p = PAPIER["a4-quer"];
  const f = zeichenflaeche("a4-quer", blatt.legendeZeilen.length);
  const rechts = p.breite - BLATT.randX;
  const kopfY = BLATT.randOben;
  const fussY = p.hoehe - BLATT.randUnten - 2;
  const legendeOben = f.y + f.hoehe + BLATT.legendeRand / 2;
  const leer = blatt.zeichnung.karten.length === 0;
  return (
    <svg xmlns="http://www.w3.org/2000/svg" className="kp-blatt" data-blatt={blatt.nummer} width={`${p.breite}mm`} height={`${p.hoehe}mm`}
      viewBox={`0 0 ${p.breite} ${p.hoehe}`} role="img" aria-label={`${rahmen.titel}, Blatt ${blatt.nummer} von ${blatt.von}`}
      style={{ fontFamily: schrift, background: FARBE.papier }}>
      {kopfStil ? <style>{kopfStil}</style> : null}
      {mitDefs ? <SymbolDefs symbole={symbole} /> : null}
      {/* Kopf */}
      <text x={BLATT.randX} y={kopfY + 6} fontSize={pt(14)} fontWeight={700}>{rahmen.titel}</text>
      {rahmen.untertitel ? <text x={BLATT.randX} y={kopfY + 11.5} fontSize={pt(9)}>{rahmen.untertitel}</text> : null}
      <text x={rechts - 9} y={kopfY + 6} fontSize={pt(9)} fontWeight={700} textAnchor="end">{rahmen.organisation}</text>
      <g aria-hidden="true" fill={FARBE.marke}>
        <rect x={rechts - 6} y={kopfY + 3} width={6} height={2} />
        <rect x={rechts - 4} y={kopfY + 1} width={2} height={6} />
      </g>
      <line x1={BLATT.randX} y1={kopfY + BLATT.kopf - 1} x2={rechts} y2={kopfY + BLATT.kopf - 1} stroke={FARBE.tinte} strokeWidth={STRICH.duenn} />
      {/* Zeichnung */}
      {leer ? (
        <text x={p.breite / 2} y={f.y + f.hoehe / 2} fontSize={pt(12)} textAnchor="middle">Dieser Plan hat noch keine Stellen.</text>
      ) : (
        <g transform={`translate(${blatt.ursprung.x} ${blatt.ursprung.y}) scale(${blatt.massstab})`}>
          <ZeichnungInhalt daten={blatt.zeichnung} />
        </g>
      )}
      {/* Legende */}
      {blatt.legendeZeilen.map((zeile, zi) => {
        let x = BLATT.randX;
        const y = legendeOben + zi * BLATT.legendeZeile;
        return (
          <g key={zi} data-legende-zeile={zi}>
            {zeile.map((e, ei) => {
              const hx = x;
              x += LEGENDE.symbolBreite + LEGENDE.symbolLuft + textBreite(e.text, LEGENDE.schrift, false) + LEGENDE.eintragLuft;
              return (
                <g key={ei} transform={`translate(${hx} ${y})`}>
                  <polygon points={sechseckPunkte(sechseckForm(e.art), LEGENDE.symbolBreite, 3.5)} fill={FARBE.papier} stroke={FARBE.tinte}
                    strokeWidth={STRICH.duenn} strokeDasharray={sechseckForm(e.art) === "mobil" ? "1 0.6" : undefined} />
                  <use href={`#${symbolId(VERBINDUNG_PIKTOGRAMM[e.art])}`} x={SECHSECK.spitze / 2 + 0.5} y={0.5} width={LEGENDE.symbolBreite - SECHSECK.spitze - 1} height={2.5} />
                  <text x={LEGENDE.symbolBreite + LEGENDE.symbolLuft} y={2.9} fontSize={pt(LEGENDE.schrift)}>{e.text}</text>
                </g>
              );
            })}
          </g>
        );
      })}
      {/* Fuß */}
      {rahmen.vermerkVsNfD ? <text x={BLATT.randX} y={fussY} fontSize={pt(8)}>VS – nur für den Dienstgebrauch</text> : null}
      <text x={p.breite / 2} y={fussY} fontSize={pt(8)} textAnchor="middle">
        {`${rahmen.stand} · ${rahmen.bearbeiter}${blatt.unterMindestschrift ? " · Schrift unter 6 pt" : ""}`}
      </text>
      <text x={rechts} y={fussY} fontSize={pt(8)} textAnchor="end">{`Blatt ${blatt.nummer} von ${blatt.von}`}</text>
    </svg>
  );
}
```

(Die Legende nutzt dieselben Formen wie die Sechsecke, damit Form und Art zusammen gelesen werden.)

- [ ] **Step 4: Grün sehen**

Run: `pnpm vitest run src/app/m/kommplan && pnpm typecheck && pnpm lint`
Expected: PASS; Exit 0. `grenze.test.ts` bestätigt, dass `_ui/zeichnung` weder `"use client"` noch `next/*` trägt.

- [ ] **Step 5: Commit**

```bash
git add src/app/m/kommplan/_ui/zeichnung
git commit -S -m "feat(kommplan): SVG-Renderer für Zeichnung und Druckblatt" -m "Rein darstellend und ohne use client, damit Server (Druck) und Client (Betrachter) dasselbe zeichnen. Jedes Zeichen steht einmal in defs und wird per use referenziert." -m "DRK-500" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 15: Zeichen-Zugriff (Server), Rahmentexte und Vorschau-Skript mit Sichtprüfung

**Files:**
- Create: `K/_lib/zeichen/zeichen.ts`, `K/_lib/rahmen.ts`, `scripts/kommplan-vorschau.ts`
- Test: `K/_lib/zeichen/zeichen.test.ts`, `K/_lib/rahmen.test.ts`

**Interfaces:**
- Consumes: Generat (Task 1), `layout` (Task 12), `pruefeZeichnung`/`pruefeMitte`/`zufallsPlan` (Task 11), `BEISPIELE` (Task 13), `Zeichnung`, `Blattansicht`, `Rahmen` (Task 14), `zeitFormat` aus `@/core/zeit`.
- Produces:
  - `zeichen.ts` (**nur Server**): `findeZeichen(schluessel: string): { titel: string; suchtext: string; viewBox: string; inhalt: string } | null`; `symboleFuer(inhalt: PlanInhalt): Record<string, Symbolquelle>` (nur die Zeichen, die Stellen und Einheiten des Plans benutzen; unbekannte Schlüssel fallen weg → Karte ohne Zeichen, Spec §7); `ZEICHEN_STAND`.
  - `rahmen.ts`: `kalendertag(ms: number | null): string | null` (UTC, Ausnahme aus `CLAUDE.md`); `rahmenFuer(p: { titel: string; anlass: string | null; datum: number | null; aktualisiertAm: number; aktualisiertVon: string; vermerkVsNfD: boolean }): Rahmen`.
  - `scripts/kommplan-vorschau.ts`: CLI, schreibt `.data/kommplan-vorschau/` (nicht eingecheckt; PNG läge sonst in Git LFS).

- [ ] **Step 1: Failing tests**

`K/_lib/zeichen/zeichen.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { BEISPIELE } from "../beispiele";
import { baue } from "../beispiele/bau";
import { findeZeichen, symboleFuer } from "./zeichen";

describe("Zeichen-Zugriff", () => {
  it("findet ein Rezept und ein Zusatzzeichen, liefert null für Unbekanntes", () => {
    expect(findeZeichen("rezept:D.1.4")?.titel).toBe("Einsatzleitung im Einsatz");
    expect(findeZeichen("zusatz:eal")?.inhalt).toContain("EAL");
    expect(findeZeichen("gibt-es-nicht")).toBeNull();
  });
  it("symboleFuer liefert genau die benutzten Zeichen", () => {
    expect(Object.keys(symboleFuer(BEISPIELE[0].inhalt)).sort()).toEqual(["rezept:D.1.4", "zusatz:eal"]);
    const unbekannt = baue({ stellen: [{ id: "a", titel: "A", zeichen: "rezept:ZZZ" }] });
    expect(symboleFuer(unbekannt)).toEqual({});
  });
});
```

`K/_lib/rahmen.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { kalendertag, rahmenFuer } from "./rahmen";

describe("Rahmentexte", () => {
  it("Kalendertag in UTC, unabhängig von der Suite-Zone", () => {
    expect(kalendertag(Date.UTC(2026, 1, 22))).toBe("22.02.2026");
    expect(kalendertag(null)).toBeNull();
  });
  it("Stand in der Suite-Zone (Vorgabe Europe/Berlin)", () => {
    const r = rahmenFuer({ titel: "T", anlass: "Einsatz", datum: Date.UTC(2026, 1, 22), aktualisiertAm: Date.UTC(2026, 8, 30, 9, 56), aktualisiertVon: "BL BVS", vermerkVsNfD: true });
    expect(r).toEqual({
      titel: "T", untertitel: "Einsatz · 22.02.2026", stand: "Stand: 30.09.2026, 11:56", bearbeiter: "Bearbeitung: BL BVS",
      vermerkVsNfD: true, organisation: "Deutsches Rotes Kreuz",
    });
  });
  it("ohne Anlass und Datum kein Untertitel", () => {
    expect(rahmenFuer({ titel: "T", anlass: null, datum: null, aktualisiertAm: 0, aktualisiertVon: "x", vermerkVsNfD: false }).untertitel).toBeNull();
  });
});
```

- [ ] **Step 2: Rot sehen**

Run: `pnpm vitest run src/app/m/kommplan/_lib/zeichen/zeichen.test.ts src/app/m/kommplan/_lib/rahmen.test.ts`
Expected: FAIL — Module fehlen.

- [ ] **Step 3: Implementieren**

`K/_lib/zeichen/zeichen.ts`:
```ts
import type { PlanInhalt } from "../plan/schema";
import type { Symbolquelle } from "./grundlagen";
import roh from "./zeichen.generiert.json";

/**
 * NUR SERVER. Das Rezept-Generat ist groß (alle Zeichen als fertiges SVG); ein Client-Import zöge es
 * in jedes Bündel. Der Betrachter bekommt `symboleFuer(plan)` als Prop (`grenze.test.ts` hält das).
 */
interface Eintrag extends Symbolquelle { titel: string; suchtext: string }
const ZEICHEN = roh.zeichen as unknown as Readonly<Record<string, Eintrag>>;
export const ZEICHEN_STAND = roh.stand;

export function findeZeichen(schluessel: string): Eintrag | null {
  return Object.prototype.hasOwnProperty.call(ZEICHEN, schluessel) ? ZEICHEN[schluessel] : null;
}

export function symboleFuer(inhalt: PlanInhalt): Record<string, Symbolquelle> {
  const schluessel = new Set<string>();
  for (const s of inhalt.stellen) {
    if (s.zeichen) schluessel.add(s.zeichen);
    for (const e of s.einheiten) if (e.zeichen) schluessel.add(e.zeichen);
  }
  return Object.fromEntries(
    [...schluessel].sort().flatMap((k) => {
      const e = findeZeichen(k);
      return e ? [[k, { viewBox: e.viewBox, inhalt: e.inhalt }]] : [];
    }),
  );
}
```

`K/_lib/rahmen.ts`:
```ts
import { zeitFormat } from "@/core/zeit";
import type { Rahmen } from "../_ui/zeichnung/Blatt";

// zeitFormat löst die Zone erst beim Formatieren auf — auf Modulebene erlaubt (CLAUDE.md, „Zeitzone").
const STAND = zeitFormat("de-DE", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });

/** `plan.datum` ist ein Kalendertag, gespeichert als Mitternacht UTC — deshalb hier `timeZone: "UTC"`. */
export function kalendertag(ms: number | null): string | null {
  if (ms === null) return null;
  return new Intl.DateTimeFormat("de-DE", { timeZone: "UTC", day: "2-digit", month: "2-digit", year: "numeric" }).format(ms);
}

export function rahmenFuer(p: {
  titel: string; anlass: string | null; datum: number | null; aktualisiertAm: number; aktualisiertVon: string; vermerkVsNfD: boolean;
}): Rahmen {
  const teile = [p.anlass?.trim() || null, kalendertag(p.datum)].filter((t): t is string => t !== null);
  return {
    titel: p.titel,
    untertitel: teile.length > 0 ? teile.join(" · ") : null,
    stand: `Stand: ${STAND.format(p.aktualisiertAm)}`,
    bearbeiter: `Bearbeitung: ${p.aktualisiertVon}`,
    vermerkVsNfD: p.vermerkVsNfD,
    organisation: "Deutsches Rotes Kreuz",
  };
}
```

`scripts/kommplan-vorschau.ts`:
```ts
/**
 * Rendert die Beispielpläne (und auf Wunsch einen Zufallsplan) als SVG und PNG, damit man die
 * Layout-Engine ANSIEHT, bevor Golden-Dateien eingefroren werden.
 *
 * Lauf: pnpm exec tsx scripts/kommplan-vorschau.ts [zielordner] [--zufall <seed> <stellen>]
 * Ausgabe (Vorgabe .data/kommplan-vorschau/, nicht eingecheckt):
 *   <id>-bildschirm.svg|png · <id>-a4-<n>.svg|png · bericht.txt (Maßstab je Blatt, Befunde)
 *
 * Die Schrift steckt als data:-URI in jeder SVG-Datei: ein Rasterer ohne Arimo würde sonst mit
 * einer Ersatzschrift andere Breiten zeichnen, als die Engine gemessen hat. Gerastert wird mit
 * Chromium aus @playwright/test, nicht mit sharp/librsvg (die Arimo nicht zuverlässig finden).
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { chromium } from "@playwright/test";
import { BEISPIELE, type Beispiel } from "../src/app/m/kommplan/_lib/beispiele";
import { layout } from "../src/app/m/kommplan/_lib/layout/layout";
import { pruefeMitte, pruefeVerbindungen, pruefeZeichnung } from "../src/app/m/kommplan/_lib/layout/pruefung";
import { zufallsPlan } from "../src/app/m/kommplan/_lib/layout/zufall";
import { rahmenFuer } from "../src/app/m/kommplan/_lib/rahmen";
import { symboleFuer } from "../src/app/m/kommplan/_lib/zeichen/zeichen";
import { Blattansicht } from "../src/app/m/kommplan/_ui/zeichnung/Blatt";
import { Zeichnung } from "../src/app/m/kommplan/_ui/zeichnung/Zeichnung";

const args = process.argv.slice(2);
// --zufall <seed> <stellen> [stab]: ein roter Seed aus eigenschaften.test.ts zum Ansehen.
const zufallIndex = args.indexOf("--zufall");
const ZIEL = args[0] && !args[0].startsWith("--") ? args[0] : ".data/kommplan-vorschau";
const schrift = readFileSync("src/app/m/kommplan/_fonts/Arimo-Variable.ttf").toString("base64");
const STIL = `@font-face{font-family:"Arimo";src:url(data:font/ttf;base64,${schrift}) format("truetype");font-weight:400 700}`;

const beispiele: Beispiel[] = [...BEISPIELE];
if (zufallIndex >= 0) {
  const seed = Number(args[zufallIndex + 1]), stellen = Number(args[zufallIndex + 2] ?? 25);
  const form = args[zufallIndex + 3] === "stab" ? "stab" : "frei";
  beispiele.push({ id: `zufall-${form}-${seed}`, titel: `Zufallsplan ${seed} (${form})`, typ: "kommunikationsplan", anlass: null, datum: null,
    istVorlage: false, stand: "2026-01-01T00:00:00.000Z", bearbeiter: "Vorschau", inhalt: zufallsPlan(seed, { stellen, form }) });
}

mkdirSync(ZIEL, { recursive: true });
const bericht: string[] = [];
const dateien: string[] = [];
for (const b of beispiele) {
  const symbole = symboleFuer(b.inhalt);
  const l = layout(b.inhalt, "a4-quer");
  const befunde = [...pruefeZeichnung(l), ...pruefeMitte(l), ...pruefeVerbindungen(l, b.inhalt)];
  bericht.push(`${b.id}: ${l.karten.length} Karten, ${l.breite.toFixed(1)} × ${l.hoehe.toFixed(1)} mm, ${befunde.length} Befunde`);
  for (const f of befunde) bericht.push(`  ! ${f.text}`);
  const bildschirm = renderToStaticMarkup(createElement(Zeichnung, { daten: layout(b.inhalt, "bildschirm"), symbole, titel: b.titel, schrift: "Arimo", kopfStil: STIL }));
  writeFileSync(join(ZIEL, `${b.id}-bildschirm.svg`), bildschirm);
  dateien.push(`${b.id}-bildschirm`);
  const rahmen = rahmenFuer({ titel: b.titel, anlass: b.anlass, datum: b.datum ? Date.parse(`${b.datum}T00:00:00Z`) : null,
    aktualisiertAm: Date.parse(b.stand), aktualisiertVon: b.bearbeiter, vermerkVsNfD: b.inhalt.optionen.vermerkVsNfD });
  for (const blatt of l.seiten) {
    bericht.push(`  Blatt ${blatt.nummer}/${blatt.von}: Maßstab ${blatt.massstab.toFixed(3)}${blatt.unterMindestschrift ? " (unter 6 pt!)" : ""}`);
    const blattBefunde = [...pruefeZeichnung(blatt.zeichnung), ...pruefeMitte(blatt.zeichnung), ...pruefeVerbindungen(blatt.zeichnung, b.inhalt)];
    for (const f of blattBefunde) bericht.push(`    ! ${f.text}`);
    const svg = renderToStaticMarkup(createElement(Blattansicht, { blatt, rahmen, symbole, schrift: "Arimo", kopfStil: STIL }));
    writeFileSync(join(ZIEL, `${b.id}-a4-${blatt.nummer}.svg`), svg);
    dateien.push(`${b.id}-a4-${blatt.nummer}`);
  }
}
writeFileSync(join(ZIEL, "bericht.txt"), `${bericht.join("\n")}\n`);
console.log(bericht.join("\n"));

/** Kein Top-Level-await: das Root-Paket ist kein ESM-Paket, tsx lädt .ts-Skripte hier als CommonJS. */
async function rastere(): Promise<void> {
  try {
    const browser = await chromium.launch({ args: ["--proxy-server=direct://"] });
    const page = await browser.newPage({ deviceScaleFactor: 1754 / 1123 });
    for (const name of dateien) {
      const svg = readFileSync(join(ZIEL, `${name}.svg`), "utf8");
      await page.setContent(`<!doctype html><html><body style="margin:0;background:#fff">${svg}</body></html>`, { waitUntil: "load" });
      await page.evaluate(() => document.fonts.ready.then(() => true));
      await page.locator("svg").first().screenshot({ path: join(ZIEL, `${name}.png`) });
    }
    await browser.close();
    console.log(`PNG: ${dateien.length} Dateien in ${ZIEL}`);
  } catch (fehler) {
    console.warn(`PNG übersprungen (${(fehler as Error).message.split("\n")[0]}) — die SVG-Dateien lassen sich im Browser öffnen.`);
  }
}
void rastere();
```

- [ ] **Step 4: Grün sehen und Vorschau erzeugen**

Run: `pnpm vitest run src/app/m/kommplan && pnpm typecheck`
Expected: PASS; Exit 0.

Run: `pnpm exec tsx scripts/kommplan-vorschau.ts`
Expected: Bericht ohne Zeile mit `!`; je Beispiel „Blatt n/m: Maßstab …"; Einsatz, OpenR, Label, Fernmeldeskizze je ein Blatt mit Maßstab ≥ 0,750; große Stab-Lage mehrere Blätter; danach `PNG: … Dateien`.

- [ ] **Step 5: Sichtprüfung gegen die Vorlage (Pflicht vor Task 16)**

Mit dem Read-Werkzeug nebeneinander ansehen:
- `.data/kommplan-vorschau/beispiel-einsatz-2026-02-22-a4-1.png` ↔ Referenz `…/scratchpad/referenz/einsatz-2026-02-22.png`
- `.data/kommplan-vorschau/beispiel-openr-2022-07-01-a4-1.png` ↔ `…/referenz/openr-2022-07-01.png`
- `.data/kommplan-vorschau/vorlage-kommunikationsplan-label-a4-1.png` ↔ `…/referenz/kommunikationsplan-label.png`
- `.data/kommplan-vorschau/vorlage-fernmeldeskizze-stab-a4-1.png` ↔ `…/referenz/fernmeldeskizze-stab.png`
- alle Blätter `beispiel-grosse-stabslage-a4-*.png`

(Referenzordner der Planungssitzung: `/private/tmp/claude-501/-Users-rubeen-dev-personal-drk-iuk-suite--claude-worktrees-drk-363-8c5335/c55f577c-bed2-49bc-a649-13521bcc9266/scratchpad/referenz/`. Fehlt er, gilt allein die Liste unten.)

Abhaken, sonst zurück in die Engine (nie den Golden-Test anpassen, um ein falsches Bild festzuschreiben):
- Einsatz: Leitstelle oben, R_UE_1-Sechseck auf ihrem Stiel, EL mittig darunter; **zwei getrennte Busse** — R_UE_2 über EA 1–3, R_UE_3 mit eigenem Stiel zu EA 5 rechts; Fahrzeuge als Spalte unter den EAs, EA 5 mit neun Kästen untereinander; Legende „Digitalfunk TMO" und „Reserve K_UE_2"; ein Blatt.
- OpenR: EL links neben FüKW **auf Kopfhöhe**, BOS_NI_RES_09-Sechseck auf der Verbindung, KdoW unter EL; unter FüKW drei Gruppen mit je eigenem Stiel (BOS_NI_RES_09 → EA 1–4, R_UE_2 → Rettungsmittel, R_UE_3 → Fußstreife); unter EA 1 die Sechsecke „DMO 608" und „R_UE_2", unter EA 2 „DMO 609" und „R_UE_2", unter EA 3/4 „R_UE_2" — an einer Linie links in der Gasse, über den Fahrzeugen, wie in der Vorlage; Legende „Digitalfunk TMO", „Digitalfunk DMO", „Reserve UE_K_1"; keine Linie kreuzt eine andere.
- Label: drei EAL-Karten nebeneinander, „Bereitstellungsraum" farbig hervorgehoben.
- Fernmeldeskizze: KatSL links mit gefaster Leitungsform, Leitstelle rechts mit spitzer Funkform, Stabsbus darunter.
- Große Stab-Lage: Blatt 1 zeigt Stab mit KatSL und Leitstelle, darunter **TEL als volle Karte** und die Abschnitte (als Karte oder Verweiskarte „→ Blatt n", Nummern von links nach rechts steigend); Folgeblätter beginnen mit der grau gezeichneten Elternstelle; Kamm (mehrere Reihen unter einem Bus) bei den großen Abschnitten, Kammreihen auf eigener Höhe, nicht auf der Höhe fremder Karten.
- Überall: jede Karte hängt sichtbar an ihrer Elternstelle (kein loser Abwurf, kein Sechseck neben seiner Linie); zwischen Karten verschiedener Stellen mindestens 2 mm Luft.
- Überall: Schrift Arimo, kein Text läuft aus seiner Karte, nichts abgeschnitten, Zeichen sitzen im Kartenkopf, Piktogramme in Kontaktzeilen und Sechsecken sichtbar.

Befunde als Liste im Commit-Body festhalten (oder „Sichtprüfung ohne Befund").

- [ ] **Step 6: Commit**

```bash
git add src/app/m/kommplan/_lib/zeichen/zeichen.ts src/app/m/kommplan/_lib/zeichen/zeichen.test.ts src/app/m/kommplan/_lib/rahmen.ts src/app/m/kommplan/_lib/rahmen.test.ts scripts/kommplan-vorschau.ts
git commit -S -m "feat(kommplan): Vorschau-Skript für Beispielpläne als SVG und PNG" -m "Rendert jedes Beispiel für Bildschirm und A4 mit eingebetteter Arimo und schreibt einen Bericht mit Maßstab je Blatt und Geometriebefunden. Sichtprüfung gegen die Excel-Vorlagen: ohne Befund (oder die Befundliste aus Step 5 hier ausschreiben)." -m "DRK-500" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 16: Golden-Tests auf die Beispielpläne

**Files:**
- Create: `K/_lib/layout/vorlagen.test.ts`, `K/_lib/layout/golden.test.ts`, `K/_lib/layout/__golden__/*.json` (vom Test geschrieben)

**Interfaces:**
- Consumes: `BEISPIELE`, `zeichne`, `teileAuf`, `ABSTAND`, `EINHEIT`.

Zwei Arten: `vorlagen.test.ts` hält **Aussagen aus den Referenzbildern** fest, die nicht von der eigenen Implementierung stammen; `golden.test.ts` friert die Koordinaten ein, damit jede spätere Änderung am Bild bewusst geschieht (`pnpm vitest run -u src/app/m/kommplan/_lib/layout/golden.test.ts` nach geprüfter Absicht). Die Golden-Dateien entstehen **erst nach** der Sichtprüfung in Task 15.

- [ ] **Step 1: Tests schreiben**

`K/_lib/layout/vorlagen.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { BEISPIELE } from "../beispiele";
import { ABSTAND, EINHEIT } from "./masse";
import { teileAuf } from "./papier";
import type { KarteL, Zeichnungsdaten } from "./typen";
import { zeichne } from "./zeichne";

const plan = (id: string) => BEISPIELE.find((b) => b.id === id)!.inhalt;
const k = (z: Zeichnungsdaten, id: string) => z.karten.find((x) => x.id === id)!;
const mitte = (x: KarteL) => x.x + x.breite / 2;

describe("Einsatz 22.02.2026 wie in der Vorlage", () => {
  const z = zeichne(plan("beispiel-einsatz-2026-02-22"), "a4-quer");
  it("Leitstelle über EL, beide auf einer senkrechten Achse; EL mittig über ihren Abschnitten", () => {
    expect(k(z, "lts").y).toBeLessThan(k(z, "el").y);
    expect(mitte(k(z, "lts"))).toBeCloseTo(mitte(k(z, "el")), 6);
    const sp = z.spannen.find((s) => s.stelleId === "el")!;
    expect(mitte(k(z, "el"))).toBeCloseTo((sp.links + sp.rechts) / 2, 6);
  });
  it("R_UE_2 und R_UE_3 sind getrennte Busse mit eigenem Sechseck; EA 5 steht rechts daneben", () => {
    const hex = (netz: string) => z.sechsecke.find((s) => s.netz === netz)!;
    expect(hex("el>r-ue-2").beschriftung.text).toBe("R_UE_2");
    expect(hex("el>r-ue-3").beschriftung.text).toBe("R_UE_3");
    expect(hex("el>r-ue-3").x).toBeGreaterThan(hex("el>r-ue-2").x);
    expect(k(z, "ea5").x).toBeGreaterThanOrEqual(k(z, "ea3").x + k(z, "ea3").breite + ABSTAND.gruppen - 1e-6);
  });
  it("EA 5: neun Fahrzeuge als eine Spalte", () => {
    const e = z.einheiten.filter((x) => x.stelleId === "ea5");
    expect(e).toHaveLength(9);
    expect(new Set(e.map((x) => x.x)).size).toBe(1);
    for (let i = 1; i < e.length; i++) expect(e[i].y - e[i - 1].y).toBeCloseTo(EINHEIT.takt, 6);
  });
  it("Reserve K_UE_2 steht in der Legende", () => {
    expect(z.legende).toContainEqual({ art: "tmo", text: "Reserve K_UE_2", reserve: true });
  });
});

describe("OpenR 01.07.2022 wie in der Vorlage", () => {
  const z = zeichne(plan("beispiel-openr-2022-07-01"), "a4-quer");
  it("EL steht links neben FüKW auf Kopfhöhe, verbunden über BOS_NI_RES_09", () => {
    const el = k(z, "el"), fk = k(z, "fuekw");
    expect(el.x + el.breite).toBeLessThan(fk.x);
    const linie = z.linien.find((l) => l.netz === "fuekw<links" && l.y1 === l.y2)!;
    expect(linie.y1).toBeGreaterThan(fk.y);
    expect(linie.y1).toBeLessThan(fk.y + fk.kopfHoehe);
    expect(linie.y1).toBeLessThan(el.y + el.kopfHoehe);
    expect(z.sechsecke.find((s) => s.netz === "fuekw<links")?.beschriftung.text).toBe("BOS_NI_RES_09");
    expect(z.einheiten.find((e) => e.stelleId === "el")?.text.text).toBe("KdoW 40-10-1");
  });
  it("drei Gruppen unter FüKW, jede mit eigenem Stiel ab der Kartenunterkante", () => {
    const fk = k(z, "fuekw");
    for (const netz of ["fuekw>bos-res-09", "fuekw>r-ue-2", "fuekw>r-ue-3"]) {
      expect(z.linien.some((l) => l.netz === netz && l.x1 === l.x2 && Math.abs(l.y1 - (fk.y + fk.hoehe)) < 1e-6), netz).toBe(true);
    }
  });
  it("die Kanäle der Abschnitte hängen als Sechsecke unter ihnen; Reserve ist nur der lose Kanal", () => {
    const kanaele = (id: string) => z.sechsecke.filter((s) => s.netz === `${id}#kanal`).map((s) => s.beschriftung.text);
    expect(kanaele("ea1")).toEqual(["DMO 608", "R_UE_2"]);
    expect(kanaele("ea2")).toEqual(["DMO 609", "R_UE_2"]);
    expect(kanaele("ea3")).toEqual(["R_UE_2"]);
    expect(kanaele("ea4")).toEqual(["R_UE_2"]);
    const ea1 = k(z, "ea1");
    for (const s of z.sechsecke.filter((x) => x.netz === "ea1#kanal")) {
      expect(s.y).toBeGreaterThan(ea1.y + ea1.hoehe);
      expect(s.y).toBeLessThan(Math.min(...z.einheiten.filter((e) => e.stelleId === "ea1").map((e) => e.y)));
    }
    expect(z.legende.filter((e) => e.reserve).map((e) => e.text)).toEqual(["Reserve UE_K_1"]);
    expect(z.legende.some((e) => e.text === "Digitalfunk DMO" && !e.reserve)).toBe(true);
  });
});

describe("Label und Fernmeldeskizze", () => {
  it("Label: drei EAL oben bündig, Bereitstellungsraum hervorgehoben", () => {
    const z = zeichne(plan("vorlage-kommunikationsplan-label"), "a4-quer");
    expect(new Set(["patientenablage", "transport", "bereitstellungsraum"].map((id) => k(z, id).y)).size).toBe(1);
    expect(k(z, "bereitstellungsraum").hervorheben).toBe(true);
  });
  it("Fernmeldeskizze: KatSL links in Leitungsform, Leitstelle rechts in Funkform", () => {
    const z = zeichne(plan("vorlage-fernmeldeskizze-stab"), "a4-quer");
    expect(k(z, "katsl").x).toBeLessThan(k(z, "stab").x);
    expect(k(z, "lts").x).toBeGreaterThan(k(z, "stab").x + k(z, "stab").breite);
    expect(z.sechsecke.find((s) => s.netz === "stab<links")?.form).toBe("leitung");
    expect(z.sechsecke.find((s) => s.netz === "stab<rechts")?.form).toBe("funk");
  });
});

describe("Große Stab-Lage", () => {
  it("Blatt 1 mit Verweiskarten, Folgeblätter mit Anker; der größte Abschnitt bricht als Kamm um", () => {
    const b = teileAuf(plan("beispiel-grosse-stabslage"), "a4-quer");
    expect(b[0].zeichnung.karten.some((x) => x.art === "verweis")).toBe(true);
    for (const blatt of b.slice(1)) expect(blatt.zeichnung.karten[0].art).toBe("anker");
    const mitEal4 = b.find((blatt) => blatt.zeichnung.karten.some((x) => x.id === "ea-4-1" && x.art === "normal"))!;
    const ys = new Set(mitEal4.zeichnung.karten.filter((x) => x.id.startsWith("ea-4-")).map((x) => x.y));
    expect(ys.size).toBeGreaterThanOrEqual(2);
  });
});
```

`K/_lib/layout/golden.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { BEISPIELE } from "../beispiele";
import { teileAuf } from "./papier";
import { zeichne } from "./zeichne";

/** Auf 0,01 mm gerundet: Fließkomma-Rauschen ist kein Befund, eine verschobene Karte schon. */
const runde = (wert: unknown): unknown =>
  JSON.parse(JSON.stringify(wert, (_, v) => (typeof v === "number" ? Math.round(v * 100) / 100 : v)));

describe("Golden: Koordinaten der Beispielpläne", () => {
  it.each(BEISPIELE.map((b) => [b.id, b] as const))("%s", async (id, b) => {
    const z = zeichne(b.inhalt, "bildschirm");
    const kompakt = {
      breite: z.breite, hoehe: z.hoehe,
      karten: z.karten.map((k) => [k.id, k.art, k.x, k.y, k.breite, k.hoehe]),
      einheiten: z.einheiten.map((e) => [e.id, e.x, e.y]),
      sechsecke: z.sechsecke.map((s) => [s.netz, s.x, s.y, s.breite]),
      linien: z.linien.map((l) => [l.netz, l.x1, l.y1, l.x2, l.y2, l.duenn]),
      a4: teileAuf(b.inhalt, "a4-quer").map((bl) => ({
        nummer: bl.nummer, massstab: bl.massstab, ursprung: bl.ursprung,
        karten: bl.zeichnung.karten.map((k) => [k.id, k.art, k.x, k.y]),
      })),
    };
    await expect(`${JSON.stringify(runde(kompakt), null, 1)}\n`).toMatchFileSnapshot(`__golden__/${id}.json`);
  });
});
```

- [ ] **Step 2: Vorlagen-Aussagen laufen lassen**

Run: `pnpm vitest run src/app/m/kommplan/_lib/layout/vorlagen.test.ts`
Expected: PASS. Ein Rot hier ist ein Befund an der Engine (dieselbe Regel wie in Task 11).

- [ ] **Step 3: Golden-Dateien erzeugen — nach bestandener Sichtprüfung**

Run: `pnpm vitest run src/app/m/kommplan/_lib/layout/golden.test.ts`
Expected: PASS, fünf neue Dateien unter `__golden__/`. (Unter `CI=true` schreibt Vitest keine fehlenden Snapshots — dort ist ein fehlendes Golden rot, wie gewollt.)

Run: `pnpm vitest run src/app/m/kommplan/_lib/layout/golden.test.ts` (zweiter Lauf)
Expected: PASS ohne Änderung an den Dateien (`git status` zeigt sie nur als neu).

- [ ] **Step 4: Commit**

```bash
git add src/app/m/kommplan/_lib/layout/vorlagen.test.ts src/app/m/kommplan/_lib/layout/golden.test.ts src/app/m/kommplan/_lib/layout/__golden__
git commit -S -m "test(kommplan): Aussagen aus den Excel-Vorlagen und Golden-Koordinaten" -m "Die Golden-Dateien sind nach der Sichtprüfung der Vorschau entstanden; eine Änderung daran ist eine bewusste Änderung am Bild." -m "DRK-500" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 17: Modulrahmen — Registry, Icon, Host-Riegel

**Files:**
- Modify: `src/core/registry.ts` (Eintrag nach `einsatzbuch`, vor `alpha`), `src/core/shell/icons.ts`, `.env.example`
- Create: `K/_lib/host.ts`, `K/layout.tsx`
- Test: `K/registry.test.ts`, `K/_lib/host.test.ts`

**Interfaces:**
- Produces: `istKommplanHost(headers: Headers): boolean`; `requireKommplanHost(headers: Headers): void` (wirft `notFound`).

**Reihenfolge Task 17 → 18, damit jeder Commit alle Tore besteht:** `_lib/zugang.ts` ruft `auditLoginRequired("kommplan")`/`auditDenied("kommplan", …)`, und `"kommplan"` ist erst ab Task 18 ein `AuditModule` — ein Commit mit `zugang.ts` hier bestünde `pnpm typecheck` nicht. `AUDIT_MODULES` lässt sich auch nicht hierher vorziehen: `catalog.ts` verlangt über `satisfies Record<AuditModule, …>` einen `AUDIT_TABLES`-Eintrag, `catalog.test.ts` dazu die Migration, und `labels.ts` (`MODULE_LABELS` über `getModule(key).title`) braucht den Registry-Eintrag aus diesem Task. Deshalb steht `zugang.ts` samt Test am Ende von Task 18.

- [ ] **Step 1: Failing tests**

`K/registry.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { ICONS } from "@/core/shell/icons";
import { canAccess, getModule, moduleForHost, requiredGroupsFor, visibleSwitcherModules } from "@/core/registry";
import { adminGroupsFor } from "@/core/groups";

describe("Registry-Eintrag kommplan", () => {
  it("anonym routbar (Token-Ansicht in Phase 5), mit Zugangs- und Admin-Gruppe", () => {
    expect(getModule("kommplan")).toMatchObject({
      title: "Kommunikationspläne", icon: "ApartmentOutlined", shell: "full", requiresAuth: false,
      requiredGroups: ["iuk-kommplan"], adminGroups: ["iuk-kommplan-bearbeiten"], prodHosts: [],
      showInSwitcher: true, switcherGroupSources: ["access", "admin"],
    });
    expect(ICONS.ApartmentOutlined).toBeDefined();
  });
  it("Dev-Host und SUITE_HOST_KOMMPLAN", () => {
    expect(moduleForHost("kommplan.localtest.me", {})?.key).toBe("kommplan");
    expect(moduleForHost("plaene.iuk-ue.de", { SUITE_HOST_KOMMPLAN: "plaene.iuk-ue.de" })?.key).toBe("kommplan");
    expect(canAccess(getModule("kommplan"), null)).toBe(true);
  });
  it("Gruppen per Umgebung überschreibbar", () => {
    expect(requiredGroupsFor(getModule("kommplan"), { SUITE_ACCESS_GROUP_KOMMPLAN: "plaene" })).toEqual(["plaene"]);
    expect(adminGroupsFor(getModule("kommplan"), { SUITE_ADMIN_GROUP_KOMMPLAN: "plaene-admin" })).toEqual(["plaene-admin"]);
  });
  it("im Umschalter nur für Zugangs- oder Admin-Gruppe", () => {
    const keys = (g: string[] | null) => visibleSwitcherModules(g, {}).map((m) => m.key);
    expect(keys(null)).not.toContain("kommplan");
    expect(keys(["andere"])).not.toContain("kommplan");
    expect(keys(["iuk-kommplan"])).toContain("kommplan");
    expect(keys(["iuk-kommplan-bearbeiten"])).toContain("kommplan");
  });
});
```

`K/_lib/host.test.ts`:
```ts
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ notFound: () => { throw new Error("NEXT_NOT_FOUND"); } }));
import { istKommplanHost, requireKommplanHost } from "./host";

describe("kommplan-Host-Riegel", () => {
  it("eigener Dev-Host ja, fremder Suite-Host nein, x-forwarded-host gewinnt", () => {
    expect(istKommplanHost(new Headers({ host: "kommplan.localtest.me:3000" }))).toBe(true);
    expect(istKommplanHost(new Headers({ host: "feedback.localtest.me" }))).toBe(false);
    expect(istKommplanHost(new Headers({ host: "localhost:3000", "x-forwarded-host": "kommplan.localtest.me" }))).toBe(true);
  });
  it("fremder Host → notFound, nicht 403", () => {
    expect(() => requireKommplanHost(new Headers({ host: "feedback.localtest.me" }))).toThrow("NEXT_NOT_FOUND");
    expect(() => requireKommplanHost(new Headers({ host: "kommplan.localtest.me" }))).not.toThrow();
  });
});
```

- [ ] **Step 2: Rot sehen**

Run: `pnpm vitest run src/app/m/kommplan/registry.test.ts src/app/m/kommplan/_lib/host.test.ts`
Expected: FAIL — `Unknown module: kommplan`, `./host` fehlt.

- [ ] **Step 3: Registry, Icon, Riegel**

`src/core/registry.ts`, direkt nach dem `einsatzbuch`-Eintrag (so wenige Zeilen wie möglich; danach der Ankerschritt aus den Global Constraints — Stand der Planung: hinter der Einfügestelle trifft heute kein Anker mehr zu, alle zeigen schon auf verschobene Zeilen und bleiben, wie sie sind):
```ts
  // kommplan: Kommunikationspläne (Spec 2026-09-30). requiresAuth:false für die Token-Ansicht (Phase 5); Zugang und Host in _lib/.
  { key: "kommplan", title: "Kommunikationspläne", icon: "ApartmentOutlined", shell: "full",
    requiresAuth: false, requiredGroups: ["iuk-kommplan"], adminGroups: ["iuk-kommplan-bearbeiten"],
    prodHosts: [], showInSwitcher: true, switcherGroupSources: ["access", "admin"] },
```

`src/core/shell/icons.ts`: `ApartmentOutlined` in den Import aus `"@ant-design/icons"` (alphabetisch, vor `AppstoreOutlined`) und als letzte Zeile in die Map `ICONS` aufnehmen.

`K/_lib/host.ts`:
```ts
import { notFound } from "next/navigation";
import { moduleForHost } from "@/core/registry";
import { resolveHost } from "@/core/routing";

/**
 * Der Host-Riegel (Vorbild `einsatzbuch/_lib/host.ts`): `decideRoute` bedient `/m/kommplan/*` auf
 * jedem Suite-Host, und `canAccess` steigt bei `requiresAuth: false` sofort aus. Ohne diesen Riegel
 * wäre das Modul über jeden Host erreichbar.
 */
export function istKommplanHost(headers: Headers): boolean {
  return moduleForHost(resolveHost(headers))?.key === "kommplan";
}

/** Für Layouts und Seiten, als erste Anweisung. notFound statt 403: die Existenz des Pfads bleibt verborgen. */
export function requireKommplanHost(headers: Headers): void {
  if (!istKommplanHost(headers)) notFound();
}
```

`K/layout.tsx`:
```tsx
/** Kein Riegel hier: die Token-Ansicht (Phase 5, `t/[token]`) ist anonym. Die Arbeitsrouten riegelt `(intern)/layout.tsx`. */
export default function KommplanLayout({ children }: { children: React.ReactNode }) {
  return children;
}
```

`.env.example`: im Host-Block nach `# SUITE_HOST_EINSATZBUCH=` die Zeile `# SUITE_HOST_KOMMPLAN=`; bei den Gruppenbeispielen nach dem einsatzbuch-Absatz:
```
# kommplan: Ansehen und Drucken der Kommunikationspläne; Bearbeiten über die Admin-Gruppe
# (der Suite-Admin darf beides). NIE leer gesetzt stehen lassen: validateGroupConfig bricht den Boot ab.
# SUITE_ACCESS_GROUP_KOMMPLAN=iuk-kommplan
# SUITE_ADMIN_GROUP_KOMMPLAN=iuk-kommplan-bearbeiten
```

- [ ] **Step 4: Grün sehen**

Run: `pnpm vitest run src/app/m/kommplan src/core/shell src/core/registry.test.ts src/core/auth src/core/favicon && pnpm typecheck`
Expected: PASS; Typecheck Exit 0. `AppUmschalter.test.tsx` prüft, dass jedes Registry-Icon in `ICONS` steht.

Ankerschritt (Global Constraints) für `src/core/registry.ts`, `src/core/shell/icons.ts` und `.env.example`: `git grep -n "registry.ts:[0-9]\|icons.ts:[0-9]\|env.example:[0-9]" -- src scripts e2e` und `pnpm anker:drift src/core/registry.ts`. Nur Anker, die **vor** dieser Änderung zutrafen und hinter der Einfügestelle liegen, werden in derselben Zeile zur Namensform; alle anderen bleiben.

- [ ] **Step 5: Commit**

```bash
git add src/core/registry.ts src/core/shell/icons.ts .env.example src/app/m/kommplan/layout.tsx src/app/m/kommplan/registry.test.ts src/app/m/kommplan/_lib/host.ts src/app/m/kommplan/_lib/host.test.ts
git commit -S -m "feat(kommplan): Modul registrieren und Host-Riegel" -m "Registry-Eintrag mit Zugangsgruppe iuk-kommplan und Admin-Gruppe iuk-kommplan-bearbeiten, beide per SUITE_ACCESS_GROUP_KOMMPLAN/SUITE_ADMIN_GROUP_KOMMPLAN überschreibbar; das Modul liefert nur auf seinem eigenen Host aus." -m "DRK-500" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 18: Datenbank-Dreieck, alle Tabellen, Audit-Katalog, lokaler Seed

**Files:**
- Create: `K/_db/schema.ts`, `K/_db/client.ts`, `K/_db/drizzle.config.ts`, `K/_db/migrations/0000_plaene.sql` (erzeugt + Trigger von Hand), `K/_db/migrations/meta/*` (erzeugt), `K/_lib/testDb.ts`, `K/_lib/seedLokal.ts`, `K/_lib/zugang.ts` (aus Task 17 hierher verlegt)
- Modify: `src/core/bootstrap.ts` (`MODULE_MIGRATIONS`), `Dockerfile` (Runner-Stage, nach der einsatzbuch-Zeile), `src/core/audit/types.ts` (`AUDIT_MODULES`), `src/core/audit/catalog.ts` (`AUDIT_TABLES`), `src/app/m/portal/admin/audit/labels.ts` (`OBJECT_LABELS`), `scripts/seed-lokal.ts`
- Test: `K/_db/schema.test.ts`, `K/_lib/seedLokal.test.ts`, `K/_lib/zugang.test.ts`; bestehend `src/core/bootstrap.test.ts`, `scripts/seed-lokal.test.ts`, `src/core/audit/catalog.test.ts`

**Interfaces:**
- Produces: Tabellen `plan`, `bib_stelle`, `bib_einheit`, `bib_verbindung`, `plan_freigabe` (Drizzle: `plan`, `bibStelle`, `bibEinheit`, `bibVerbindung`, `planFreigabe`; Typen `PlanZeile`, `NeuePlanZeile`); `getDb()`, `type KommplanDb`; `testDb()`; `seedLokalKommplan(db: KommplanDb): Promise<string[]>`; aus `_lib/zugang.ts`: `hatKommplanZugang(groups: readonly string[] | null | undefined, env?): boolean` (Zugangsgruppe **oder** Modul-Admin über `isModuleAdmin`, also auch der Suite-Admin); `darfKommplanBearbeiten(groups, env?): boolean` (nur `isModuleAdmin`; Phase 2 nutzt es); `type Viewer = Session["user"]`; `requireKommplanZugang(): Promise<Viewer>` (ohne Sitzung → Login mit Audit, ohne Zugang → 404 mit Audit).

**Abweichung 9 (hier entschieden): `plan_freigabe` statt `freigabe`.** Die Audit-Oberfläche benennt Objekte über den Tabellennamen allein (`OBJECT_LABELS` in `portal/admin/audit/labels.ts`), und `freigabe` heißt dort schon „Schlüsselfreigabe (Einsatzbuch)". Die Spalten bleiben die aus Spec §4.1.

Audit-Entscheidungen (Abweichung 7): alle fünf Tabellen `audited`; `plan_freigabe` mit `unauditedColumns: zuletzt_abgerufen, abrufe`.

- [ ] **Step 1: Failing tests**

`K/_db/schema.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { eq, sql } from "drizzle-orm";
import { testDb } from "../_lib/testDb";
import { bibVerbindung, plan, planFreigabe } from "./schema";

const PLAN = {
  id: "p1", titel: "Plan", typ: "kommunikationsplan" as const, anlass: null, datum: null,
  aktualisiertAm: new Date(0), aktualisiertVon: "Alice", inhalt: '{"schema":1}',
};
const outbox = (db: ReturnType<typeof testDb>) =>
  db.all(sql`SELECT action, object_type FROM audit_outbox ORDER BY rowid`) as { action: string; object_type: string }[];

describe("kommplan-Datenbank", () => {
  it("Plan mit Vorgaben: Version 1, keine Vorlage, nicht archiviert", () => {
    const db = testDb();
    db.insert(plan).values(PLAN).run();
    expect(db.select().from(plan).get()).toMatchObject({ version: 1, istVorlage: false, archiviertAm: null });
  });
  it("inhalt muss gültiges JSON sein, typ eine der zwei Arten", () => {
    const db = testDb();
    expect(() => db.insert(plan).values({ ...PLAN, inhalt: "{kaputt" }).run()).toThrow();
    expect(() => db.insert(plan).values({ ...PLAN, id: "p2", typ: "skizze" as never }).run()).toThrow();
  });
  it("Anlegen und echte Änderung landen im Audit, ein No-op-Update nicht", () => {
    const db = testDb();
    db.insert(plan).values(PLAN).run();
    db.update(plan).set({ titel: "Plan" }).where(eq(plan.id, "p1")).run();
    db.update(plan).set({ titel: "Neu", version: 2 }).where(eq(plan.id, "p1")).run();
    expect(outbox(db)).toEqual([{ action: "create", object_type: "plan" }, { action: "update", object_type: "plan" }]);
  });
  it("Freigabe: Token eindeutig, Plan muss existieren, Abrufzähler sind nicht auditiert", () => {
    const db = testDb();
    db.insert(plan).values(PLAN).run();
    const f = { id: "f1", planId: "p1", token: "abc", erstelltAm: new Date(0), erstelltVon: "Alice" };
    db.insert(planFreigabe).values(f).run();
    expect(() => db.insert(planFreigabe).values({ ...f, id: "f2" }).run()).toThrow();
    expect(() => db.insert(planFreigabe).values({ ...f, id: "f3", token: "xyz", planId: "fehlt" }).run()).toThrow();
    const vorher = outbox(db).length;
    db.update(planFreigabe).set({ abrufe: 1, zuletztAbgerufen: new Date(1) }).where(eq(planFreigabe.id, "f1")).run();
    expect(outbox(db).length).toBe(vorher);
    db.update(planFreigabe).set({ widerrufenAm: new Date(2) }).where(eq(planFreigabe.id, "f1")).run();
    expect(outbox(db).at(-1)).toEqual({ action: "update", object_type: "plan_freigabe" });
  });
  it("Bibliothek: Verbindungsart geprüft", () => {
    const db = testDb();
    db.insert(bibVerbindung).values({ id: "v", art: "tmo", bezeichnung: "R_UE_1" }).run();
    expect(() => db.insert(bibVerbindung).values({ id: "w", art: "brieftaube" as never, bezeichnung: "x" }).run()).toThrow();
  });
});
```

`K/_lib/seedLokal.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { eq, sql } from "drizzle-orm";
import { plan } from "../_db/schema";
import { BEISPIELE } from "./beispiele";
import { leseInhalt } from "./plan/schema";
import { seedLokalKommplan } from "./seedLokal";
import { testDb } from "./testDb";

describe("seedLokalKommplan", () => {
  it("legt die Beispielpläne an; der zweite Lauf ändert nichts", async () => {
    const db = testDb();
    await seedLokalKommplan(db);
    const anzahl = () => (db.all(sql`SELECT count(*) AS n FROM plan`) as { n: number }[])[0].n;
    expect(anzahl()).toBe(BEISPIELE.length);
    const zeilen = await seedLokalKommplan(db);
    expect(anzahl()).toBe(BEISPIELE.length);
    expect(zeilen.join("\n")).toContain("0 Pläne angelegt");
  });
  it("jeder geseedete Inhalt ist ein gültiger Plan; Vorlagen sind als Vorlage markiert", async () => {
    const db = testDb();
    await seedLokalKommplan(db);
    for (const b of BEISPIELE) {
      const z = db.select().from(plan).where(eq(plan.id, b.id)).get()!;
      expect(leseInhalt(JSON.parse(z.inhalt)).ok).toBe(true);
      expect(z.istVorlage).toBe(b.istVorlage);
    }
  });
  it("additiv: eine lokal geänderte Zeile bleibt, wie sie ist", async () => {
    const db = testDb();
    await seedLokalKommplan(db);
    db.update(plan).set({ titel: "lokal" }).where(eq(plan.id, BEISPIELE[0].id)).run();
    await seedLokalKommplan(db);
    expect(db.select().from(plan).where(eq(plan.id, BEISPIELE[0].id)).get()!.titel).toBe("lokal");
  });
});
```

- [ ] **Step 2: Rot sehen, dann Schema, Client, Konfiguration**

Run: `pnpm vitest run src/app/m/kommplan/_db src/app/m/kommplan/_lib/seedLokal.test.ts`
Expected: FAIL — `../_lib/testDb`, `./schema`, `./seedLokal` fehlen. Sobald `schema.ts` steht, meldet zusätzlich `src/core/bootstrap.test.ts` „jedes Modul mit _db/ steht in MODULE_MIGRATIONS" rot, bis Step 4 erledigt ist.

`K/_db/schema.ts`:
```ts
import { sql } from "drizzle-orm";
import { check, index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

/**
 * Datenbank des Moduls kommplan (Spec §4.1) — alle Tabellen schon in Phase 1, damit spätere Phasen
 * keine Migration umbauen. Oberfläche für Bibliothek und Freigaben folgt in Phase 4 und 5.
 * `plan_freigabe` statt `freigabe`: die Audit-Oberfläche benennt Objekte nur über den
 * Tabellennamen, und `freigabe` gehört dort dem Einsatzbuch.
 */
export { auditOutbox } from "@/core/audit/_db/schema";

export const plan = sqliteTable("plan", {
  id: text("id").primaryKey(),
  titel: text("titel").notNull(),
  typ: text("typ", { enum: ["kommunikationsplan", "fernmeldeskizze"] }).notNull(),
  anlass: text("anlass"),
  /** Kalendertag als Mitternacht UTC. */
  datum: integer("datum", { mode: "timestamp_ms" }),
  istVorlage: integer("ist_vorlage", { mode: "boolean" }).notNull().default(false),
  archiviertAm: integer("archiviert_am", { mode: "timestamp_ms" }),
  /** Optimistisches Sperren (Phase 2, Autosave). */
  version: integer("version").notNull().default(1),
  /** Der gedruckte „Stand". */
  aktualisiertAm: integer("aktualisiert_am", { mode: "timestamp_ms" }).notNull(),
  aktualisiertVon: text("aktualisiert_von").notNull(),
  /** PlanInhalt als JSON (`_lib/plan/schema.ts`). */
  inhalt: text("inhalt").notNull(),
}, (t) => [
  check("plan_typ_check", sql`${t.typ} IN ('kommunikationsplan','fernmeldeskizze')`),
  check("plan_inhalt_json", sql`json_valid(${t.inhalt})`),
  check("plan_version_positiv", sql`${t.version} >= 1`),
  index("plan_liste_idx").on(t.archiviertAm, t.aktualisiertAm),
]);

export const bibStelle = sqliteTable("bib_stelle", {
  id: text("id").primaryKey(),
  titel: text("titel").notNull(),
  zeichen: text("zeichen"),
  leiter: text("leiter"),
  kontakte: text("kontakte").notNull().default("[]"),
  notiz: text("notiz"),
}, (t) => [check("bib_stelle_kontakte_json", sql`json_valid(${t.kontakte})`)]);

export const bibEinheit = sqliteTable("bib_einheit", {
  id: text("id").primaryKey(),
  typ: text("typ").notNull(),
  rufname: text("rufname").notNull(),
  zeichen: text("zeichen"),
  notiz: text("notiz"),
});

export const bibVerbindung = sqliteTable("bib_verbindung", {
  id: text("id").primaryKey(),
  art: text("art").notNull(),
  bezeichnung: text("bezeichnung").notNull(),
  notiz: text("notiz"),
}, (t) => [check("bib_verbindung_art_check", sql`${t.art} IN ('tmo','dmo','analogfunk','draht','telefon','mobil','fax','daten')`)]);

export const planFreigabe = sqliteTable("plan_freigabe", {
  id: text("id").primaryKey(),
  planId: text("plan_id").notNull().references(() => plan.id),
  /** Klartext (Spec §8.2): der Link muss sich jederzeit wieder kopieren lassen. */
  token: text("token").notNull(),
  notiz: text("notiz"),
  /** null = unbegrenzt. */
  ablauf: integer("ablauf", { mode: "timestamp_ms" }),
  widerrufenAm: integer("widerrufen_am", { mode: "timestamp_ms" }),
  erstelltAm: integer("erstellt_am", { mode: "timestamp_ms" }).notNull(),
  erstelltVon: text("erstellt_von").notNull(),
  zuletztAbgerufen: integer("zuletzt_abgerufen", { mode: "timestamp_ms" }),
  abrufe: integer("abrufe").notNull().default(0),
}, (t) => [uniqueIndex("plan_freigabe_token_idx").on(t.token), index("plan_freigabe_plan_idx").on(t.planId)]);

export type PlanZeile = typeof plan.$inferSelect;
export type NeuePlanZeile = typeof plan.$inferInsert;
```

`K/_db/client.ts`:
```ts
import { getModuleDb } from "@/core/db";
import * as schema from "./schema";

export const getDb = () => getModuleDb("kommplan", schema);
export type KommplanDb = ReturnType<typeof getDb>;
```

`K/_db/drizzle.config.ts`:
```ts
import type { Config } from "drizzle-kit";

// Pfade sind repo-root-relativ (drizzle-kit löst sie gegen cwd auf), nicht relativ zu dieser Datei.
export default {
  schema: "./src/app/m/kommplan/_db/schema.ts",
  out: "./src/app/m/kommplan/_db/migrations",
  dialect: "sqlite",
  dbCredentials: { url: "./.data/kommplan.db" },
} satisfies Config;
```

`K/_lib/testDb.ts`:
```ts
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { openModuleDatabase } from "@/core/db";
import * as schema from "../_db/schema";

/** Frische In-Memory-DB mit den echten Migrationen (inklusive Audit-Trigger). */
export function testDb() {
  const db = drizzle(openModuleDatabase(":memory:"), { schema });
  migrate(db, { migrationsFolder: "src/app/m/kommplan/_db/migrations" });
  return db;
}
export type TestDb = ReturnType<typeof testDb>;
```

- [ ] **Step 3: Migration erzeugen und Trigger anhängen**

Run: `pnpm exec drizzle-kit generate --config src/app/m/kommplan/_db/drizzle.config.ts --name plaene`
Expected: `src/app/m/kommplan/_db/migrations/0000_plaene.sql` mit `CREATE TABLE` für `audit_outbox`, `plan`, `bib_stelle`, `bib_einheit`, `bib_verbindung`, `plan_freigabe` samt Indizes und Checks; dazu `meta/_journal.json` und `meta/0000_snapshot.json`. Den `audit_outbox`-Teil gegen `src/app/m/einsatzbuch/_db/migrations/0000_audit_outbox.sql` abgleichen.

Ans Ende von `0000_plaene.sql` anhängen (Trigger kennt drizzle-kit nicht; die Form ist die aus `einsatzbuch/_db/migrations/0001_stammdaten_schluessel.sql`, `catalog.test.ts` prüft die WHEN-Spaltenliste exakt):
```sql
--> statement-breakpoint
CREATE TRIGGER audit_plan_create AFTER INSERT ON "plan"
BEGIN
  INSERT INTO audit_outbox (id, occurred_at, module, action, object_type, object_ref, actor, result, origin, correlation_id)
  VALUES (suite_audit_id(), suite_audit_now(), 'kommplan', 'create', 'plan', suite_audit_reference(NEW.id), suite_audit_actor(), 'success', 'database', suite_audit_correlation());
END;
--> statement-breakpoint
CREATE TRIGGER audit_plan_update AFTER UPDATE ON "plan"
WHEN OLD."id" IS NOT NEW."id" OR OLD."titel" IS NOT NEW."titel" OR OLD."typ" IS NOT NEW."typ" OR OLD."anlass" IS NOT NEW."anlass" OR OLD."datum" IS NOT NEW."datum" OR OLD."ist_vorlage" IS NOT NEW."ist_vorlage" OR OLD."archiviert_am" IS NOT NEW."archiviert_am" OR OLD."version" IS NOT NEW."version" OR OLD."aktualisiert_am" IS NOT NEW."aktualisiert_am" OR OLD."aktualisiert_von" IS NOT NEW."aktualisiert_von" OR OLD."inhalt" IS NOT NEW."inhalt"
BEGIN
  INSERT INTO audit_outbox (id, occurred_at, module, action, object_type, object_ref, actor, result, origin, correlation_id)
  VALUES (suite_audit_id(), suite_audit_now(), 'kommplan', 'update', 'plan', suite_audit_reference(NEW.id), suite_audit_actor(), 'success', 'database', suite_audit_correlation());
END;
--> statement-breakpoint
CREATE TRIGGER audit_plan_delete AFTER DELETE ON "plan"
BEGIN
  INSERT INTO audit_outbox (id, occurred_at, module, action, object_type, object_ref, actor, result, origin, correlation_id)
  VALUES (suite_audit_id(), suite_audit_now(), 'kommplan', 'delete', 'plan', suite_audit_reference(OLD.id), suite_audit_actor(), 'success', 'database', suite_audit_correlation());
END;
--> statement-breakpoint
CREATE TRIGGER audit_bib_stelle_create AFTER INSERT ON "bib_stelle"
BEGIN
  INSERT INTO audit_outbox (id, occurred_at, module, action, object_type, object_ref, actor, result, origin, correlation_id)
  VALUES (suite_audit_id(), suite_audit_now(), 'kommplan', 'create', 'bib_stelle', suite_audit_reference(NEW.id), suite_audit_actor(), 'success', 'database', suite_audit_correlation());
END;
--> statement-breakpoint
CREATE TRIGGER audit_bib_stelle_update AFTER UPDATE ON "bib_stelle"
WHEN OLD."id" IS NOT NEW."id" OR OLD."titel" IS NOT NEW."titel" OR OLD."zeichen" IS NOT NEW."zeichen" OR OLD."leiter" IS NOT NEW."leiter" OR OLD."kontakte" IS NOT NEW."kontakte" OR OLD."notiz" IS NOT NEW."notiz"
BEGIN
  INSERT INTO audit_outbox (id, occurred_at, module, action, object_type, object_ref, actor, result, origin, correlation_id)
  VALUES (suite_audit_id(), suite_audit_now(), 'kommplan', 'update', 'bib_stelle', suite_audit_reference(NEW.id), suite_audit_actor(), 'success', 'database', suite_audit_correlation());
END;
--> statement-breakpoint
CREATE TRIGGER audit_bib_stelle_delete AFTER DELETE ON "bib_stelle"
BEGIN
  INSERT INTO audit_outbox (id, occurred_at, module, action, object_type, object_ref, actor, result, origin, correlation_id)
  VALUES (suite_audit_id(), suite_audit_now(), 'kommplan', 'delete', 'bib_stelle', suite_audit_reference(OLD.id), suite_audit_actor(), 'success', 'database', suite_audit_correlation());
END;
--> statement-breakpoint
CREATE TRIGGER audit_bib_einheit_create AFTER INSERT ON "bib_einheit"
BEGIN
  INSERT INTO audit_outbox (id, occurred_at, module, action, object_type, object_ref, actor, result, origin, correlation_id)
  VALUES (suite_audit_id(), suite_audit_now(), 'kommplan', 'create', 'bib_einheit', suite_audit_reference(NEW.id), suite_audit_actor(), 'success', 'database', suite_audit_correlation());
END;
--> statement-breakpoint
CREATE TRIGGER audit_bib_einheit_update AFTER UPDATE ON "bib_einheit"
WHEN OLD."id" IS NOT NEW."id" OR OLD."typ" IS NOT NEW."typ" OR OLD."rufname" IS NOT NEW."rufname" OR OLD."zeichen" IS NOT NEW."zeichen" OR OLD."notiz" IS NOT NEW."notiz"
BEGIN
  INSERT INTO audit_outbox (id, occurred_at, module, action, object_type, object_ref, actor, result, origin, correlation_id)
  VALUES (suite_audit_id(), suite_audit_now(), 'kommplan', 'update', 'bib_einheit', suite_audit_reference(NEW.id), suite_audit_actor(), 'success', 'database', suite_audit_correlation());
END;
--> statement-breakpoint
CREATE TRIGGER audit_bib_einheit_delete AFTER DELETE ON "bib_einheit"
BEGIN
  INSERT INTO audit_outbox (id, occurred_at, module, action, object_type, object_ref, actor, result, origin, correlation_id)
  VALUES (suite_audit_id(), suite_audit_now(), 'kommplan', 'delete', 'bib_einheit', suite_audit_reference(OLD.id), suite_audit_actor(), 'success', 'database', suite_audit_correlation());
END;
--> statement-breakpoint
CREATE TRIGGER audit_bib_verbindung_create AFTER INSERT ON "bib_verbindung"
BEGIN
  INSERT INTO audit_outbox (id, occurred_at, module, action, object_type, object_ref, actor, result, origin, correlation_id)
  VALUES (suite_audit_id(), suite_audit_now(), 'kommplan', 'create', 'bib_verbindung', suite_audit_reference(NEW.id), suite_audit_actor(), 'success', 'database', suite_audit_correlation());
END;
--> statement-breakpoint
CREATE TRIGGER audit_bib_verbindung_update AFTER UPDATE ON "bib_verbindung"
WHEN OLD."id" IS NOT NEW."id" OR OLD."art" IS NOT NEW."art" OR OLD."bezeichnung" IS NOT NEW."bezeichnung" OR OLD."notiz" IS NOT NEW."notiz"
BEGIN
  INSERT INTO audit_outbox (id, occurred_at, module, action, object_type, object_ref, actor, result, origin, correlation_id)
  VALUES (suite_audit_id(), suite_audit_now(), 'kommplan', 'update', 'bib_verbindung', suite_audit_reference(NEW.id), suite_audit_actor(), 'success', 'database', suite_audit_correlation());
END;
--> statement-breakpoint
CREATE TRIGGER audit_bib_verbindung_delete AFTER DELETE ON "bib_verbindung"
BEGIN
  INSERT INTO audit_outbox (id, occurred_at, module, action, object_type, object_ref, actor, result, origin, correlation_id)
  VALUES (suite_audit_id(), suite_audit_now(), 'kommplan', 'delete', 'bib_verbindung', suite_audit_reference(OLD.id), suite_audit_actor(), 'success', 'database', suite_audit_correlation());
END;
--> statement-breakpoint
CREATE TRIGGER audit_plan_freigabe_create AFTER INSERT ON "plan_freigabe"
BEGIN
  INSERT INTO audit_outbox (id, occurred_at, module, action, object_type, object_ref, actor, result, origin, correlation_id)
  VALUES (suite_audit_id(), suite_audit_now(), 'kommplan', 'create', 'plan_freigabe', suite_audit_reference(NEW.id), suite_audit_actor(), 'success', 'database', suite_audit_correlation());
END;
--> statement-breakpoint
CREATE TRIGGER audit_plan_freigabe_update AFTER UPDATE ON "plan_freigabe"
WHEN OLD."id" IS NOT NEW."id" OR OLD."plan_id" IS NOT NEW."plan_id" OR OLD."token" IS NOT NEW."token" OR OLD."notiz" IS NOT NEW."notiz" OR OLD."ablauf" IS NOT NEW."ablauf" OR OLD."widerrufen_am" IS NOT NEW."widerrufen_am" OR OLD."erstellt_am" IS NOT NEW."erstellt_am" OR OLD."erstellt_von" IS NOT NEW."erstellt_von"
BEGIN
  INSERT INTO audit_outbox (id, occurred_at, module, action, object_type, object_ref, actor, result, origin, correlation_id)
  VALUES (suite_audit_id(), suite_audit_now(), 'kommplan', 'update', 'plan_freigabe', suite_audit_reference(NEW.id), suite_audit_actor(), 'success', 'database', suite_audit_correlation());
END;
--> statement-breakpoint
CREATE TRIGGER audit_plan_freigabe_delete AFTER DELETE ON "plan_freigabe"
BEGIN
  INSERT INTO audit_outbox (id, occurred_at, module, action, object_type, object_ref, actor, result, origin, correlation_id)
  VALUES (suite_audit_id(), suite_audit_now(), 'kommplan', 'delete', 'plan_freigabe', suite_audit_reference(OLD.id), suite_audit_actor(), 'success', 'database', suite_audit_correlation());
END;
```

- [ ] **Step 4: Dreieck, Audit-Katalog, Labels**

`src/core/bootstrap.ts`, `MODULE_MIGRATIONS`, nach `einsatzbuch`:
```ts
  // kommplan: OHNE Boot-Seed — die Beispielpläne sind Entwicklungsdaten; das lokale Seed-Skript deckt Dev ab.
  { key: "kommplan", migrationsFolder: "src/app/m/kommplan/_db/migrations" },
```
(Das Wort „seedLokal" darf in `bootstrap.ts` nicht vorkommen — `scripts/seed-lokal.test.ts` scannt die Datei.)

**Ankerschritt `src/core/bootstrap.ts`** (Global Constraints): der Eintrag schiebt alles ab heutiger Zeile 69 um zwei Zeilen. Heute zutreffend und danach falsch — in derselben Zeile in die Namensform umschreiben, keine Zahl nachziehen, keine Zeile dazu:
- `src/core/bootstrap.test.ts`, Kopfkommentar „Planteil 5 dazu …": `` `src/core/bootstrap.ts:15` und `:103` `` → `` `src/core/bootstrap.ts:15` und `assertHostConfig` `` (`:15` liegt vor der Einfügung und bleibt).
- `src/core/bootstrap.test.ts`, „`` `src/core/bootstrap.ts:103` und an `:138`. ``" → „`` `bootstrap.ts`, `assertHostConfig` und `shouldSeed`. ``".
- `src/core/bootstrap.test.ts`, „`` gerufen `:138`; ``" → „`` gerufen in `shouldSeed`; ``".
- `src/core/bootstrap.test.ts`, „`` `src/core/bootstrap.ts:103` und `:138` je als Blockkommentar ``" → „`` `assertHostConfig` und `shouldSeed` je als Blockkommentar ``".
- `src/core/bootstrap.test.ts`, „`` auf `src/core/bootstrap.ts:125-133`. ``" → „`` auf `migrateAllModules` in `bootstrap.ts`. ``".
- `src/app/m/radio/_lib/boot.ts`, „`` (`src/core/bootstrap.ts:105-107`) ``" → „`` (die `errors`-Liste in `assertHostConfig`) ``".

Vorher mit `git grep -n "bootstrap.ts:[0-9]" -- src scripts e2e` und `pnpm anker:drift src/core/bootstrap.ts` gegenprüfen, ob seit der Planung weitere zutreffende Anker dazugekommen sind; die schon veralteten (z. B. `:114`, `:90-103`, `:49-56`) bleiben. Dasselbe für `Dockerfile` (die Anker `:25`, `:36`, `:38-39` liegen vor der Einfügung), `src/core/audit/types.ts`, `src/core/audit/catalog.ts`, `src/app/m/portal/admin/audit/labels.ts` und `scripts/seed-lokal.ts`. Die Zeilenzahl jeder so bearbeiteten Datei bleibt gleich (Kommentaranker-Regel 4).

`Dockerfile`, Runner-Stage, nach der einsatzbuch-Zeile:
```
COPY --from=builder --chown=nextjs:nodejs /app/src/app/m/kommplan/_db/migrations ./src/app/m/kommplan/_db/migrations
```

`src/core/audit/types.ts`: `"kommplan"` in `AUDIT_MODULES` vor `"konto"`.

`src/core/audit/catalog.ts`, `AUDIT_TABLES`, nach dem `"einsatzbuch"`-Block:
```ts
  "kommplan": {
    "plan": { "mode": "audited", "primaryKey": ["id"] },
    "bib_stelle": { "mode": "audited", "primaryKey": ["id"] },
    "bib_einheit": { "mode": "audited", "primaryKey": ["id"] },
    "bib_verbindung": { "mode": "audited", "primaryKey": ["id"] },
    "plan_freigabe": {
      "mode": "audited",
      "primaryKey": ["id"],
      "unauditedColumns": {
        "columns": ["zuletzt_abgerufen", "abrufe"],
        "reason": "Abrufzähler des Token-Links; Ausstellen, Ändern und Widerrufen bleiben auditiert."
      }
    }
  },
```

`src/app/m/portal/admin/audit/labels.ts`, in `OBJECT_LABELS` eine Zeile nach den einsatzbuch-Einträgen:
```ts
 plan:"Kommunikationsplan",bib_stelle:"Stelle (Planbibliothek)",bib_einheit:"Einheit (Planbibliothek)",bib_verbindung:"Verbindung (Planbibliothek)",plan_freigabe:"Freigabelink eines Plans",
```

- [ ] **Step 5: Zugang — jetzt, da `kommplan` ein `AuditModule` ist**

(Aus Task 17 hierher verlegt, siehe dort „Reihenfolge Task 17 → 18".) Erst den Test, rot sehen (`pnpm vitest run src/app/m/kommplan/_lib/zugang.test.ts` → `./zugang` fehlt), dann die Datei.

`K/_lib/zugang.test.ts`:
```ts
import { beforeEach, describe, expect, it, vi } from "vitest";

const zustand: { user: { sub: string; name: string; groups: string[] } | null } = { user: null };
vi.mock("@/core/auth", () => ({ auth: async () => (zustand.user ? { user: zustand.user } : null) }));
const audit = vi.hoisted(() => ({ denied: vi.fn(), login: vi.fn() }));
vi.mock("@/core/audit/server", async (orig) => ({
  ...(await orig<typeof import("@/core/audit/server")>()),
  auditDenied: audit.denied, auditLoginRequired: audit.login,
}));
vi.mock("next/navigation", () => ({
  notFound: () => { throw new Error("NEXT_NOT_FOUND"); },
  redirect: (z: string) => { throw new Error(`NEXT_REDIRECT ${z}`); },
}));
import { darfKommplanBearbeiten, hatKommplanZugang, requireKommplanZugang } from "./zugang";

describe("Zugang zu kommplan", () => {
  it("Zugangsgruppe, Admin-Gruppe und Suite-Admin öffnen; andere nicht", () => {
    expect(hatKommplanZugang(["iuk-kommplan"], {})).toBe(true);
    expect(hatKommplanZugang(["iuk-kommplan-bearbeiten"], {})).toBe(true);
    expect(hatKommplanZugang(["dashboard-admins"], {})).toBe(true);
    expect(hatKommplanZugang(["andere"], {})).toBe(false);
    expect(hatKommplanZugang(null, {})).toBe(false);
    expect(hatKommplanZugang([], {})).toBe(false);
  });
  it("Bearbeiten nur für Admin-Gruppe und Suite-Admin", () => {
    expect(darfKommplanBearbeiten(["iuk-kommplan"], {})).toBe(false);
    expect(darfKommplanBearbeiten(["iuk-kommplan-bearbeiten"], {})).toBe(true);
    expect(darfKommplanBearbeiten(["dashboard-admins"], {})).toBe(true);
  });
  it("SUITE_ACCESS_GROUP_KOMMPLAN ersetzt die Vorgabe", () => {
    expect(hatKommplanZugang(["plaene"], { SUITE_ACCESS_GROUP_KOMMPLAN: "plaene" })).toBe(true);
    expect(hatKommplanZugang(["iuk-kommplan"], { SUITE_ACCESS_GROUP_KOMMPLAN: "plaene" })).toBe(false);
  });
});

describe("requireKommplanZugang", () => {
  beforeEach(() => { zustand.user = null; audit.denied.mockClear(); audit.login.mockClear(); });
  it("ohne Sitzung → Login mit Audit; ohne Gruppe → 404 mit Audit; mit Gruppe → Viewer", async () => {
    await expect(requireKommplanZugang()).rejects.toThrow("NEXT_REDIRECT /login?callbackUrl=%2Fm%2Fkommplan");
    expect(audit.login).toHaveBeenCalledWith("kommplan");
    zustand.user = { sub: "s1", name: "Jana", groups: ["andere"] };
    await expect(requireKommplanZugang()).rejects.toThrow("NEXT_NOT_FOUND");
    expect(audit.denied).toHaveBeenCalledTimes(1);
    zustand.user = { sub: "s2", name: "Kai", groups: ["iuk-kommplan"] };
    await expect(requireKommplanZugang()).resolves.toMatchObject({ sub: "s2" });
  });
});
```

`K/_lib/zugang.ts`:
```ts
import { notFound, redirect } from "next/navigation";
import type { Session } from "next-auth";
import { auditActor, auditDenied, auditLoginRequired } from "@/core/audit/server";
import { auth } from "@/core/auth";
import { hasAnyGroup, isModuleAdmin } from "@/core/groups";
import { getModule, requiredGroupsFor } from "@/core/registry";

export type Viewer = Session["user"];
type EnvLike = Record<string, string | undefined>;

/**
 * Ansehen und Drucken: die Zugangsgruppe (`SUITE_ACCESS_GROUP_KOMMPLAN`) ODER wer das Modul
 * administriert (`isModuleAdmin`, also auch der Suite-Admin — anders als im Einsatzbuch liegt hier
 * nichts, was der Betrieb nicht sehen dürfte).
 */
export function hatKommplanZugang(groups: readonly string[] | null | undefined, env: EnvLike = process.env): boolean {
  const mod = getModule("kommplan");
  return hasAnyGroup(groups, requiredGroupsFor(mod, env)) || isModuleAdmin(mod, groups ? [...groups] : null, env);
}

/** Pläne bearbeiten, Bibliothek pflegen, Links ausstellen (ab Phase 2). */
export function darfKommplanBearbeiten(groups: readonly string[] | null | undefined, env: EnvLike = process.env): boolean {
  return isModuleAdmin(getModule("kommplan"), groups ? [...groups] : null, env);
}

/**
 * Riegel für das Layout der Arbeitsrouten UND jede Seite darunter (eine Route Group ist keine
 * Sicherheitsgrenze). `redirect`/`notFound` bleiben hier, damit Seiten keinen Eintrag im
 * Abdeckungsmanifest von `core/audit` brauchen.
 */
export async function requireKommplanZugang(): Promise<Viewer> {
  const viewer = (await auth())?.user;
  if (!viewer) {
    auditLoginRequired("kommplan");
    redirect(`/login?callbackUrl=${encodeURIComponent("/m/kommplan")}`);
  }
  if (!hatKommplanZugang(viewer.groups)) {
    auditDenied("kommplan", auditActor(viewer));
    notFound();
  }
  return viewer;
}
```

- [ ] **Step 6: Seed**

`K/_lib/seedLokal.ts`:
```ts
import type { KommplanDb } from "../_db/client";
import { bibEinheit, bibStelle, bibVerbindung, plan } from "../_db/schema";
import { BEISPIELE } from "./beispiele";

/**
 * Lokale Demodaten — bewusst NICHT am Boot (`bootstrap.ts`, Eintrag kommplan). Idempotent pro
 * Entität über feste IDs und `onConflictDoNothing`, additiv (ändert nichts Vorhandenes).
 */
export async function seedLokalKommplan(db: KommplanDb): Promise<string[]> {
  const zaehle = (r: { changes: number }[]) => r.reduce((n, x) => n + x.changes, 0);
  const plaene = zaehle(BEISPIELE.map((b) => db.insert(plan).values({
    id: b.id, titel: b.titel, typ: b.typ, anlass: b.anlass,
    datum: b.datum === null ? null : new Date(`${b.datum}T00:00:00.000Z`),
    istVorlage: b.istVorlage, aktualisiertAm: new Date(b.stand), aktualisiertVon: b.bearbeiter,
    inhalt: JSON.stringify(b.inhalt),
  }).onConflictDoNothing().run()));
  const stellen = zaehle([db.insert(bibStelle).values({
    id: "bib-lts-uelzen", titel: "Leitstelle Uelzen",
    kontakte: JSON.stringify([{ art: "telefon", wert: "0581 / 82 266" }, { art: "fax", wert: "0581 / 82 284" }, { art: "email", wert: "fel@landkreis-uelzen.de" }]),
  }).onConflictDoNothing().run()]);
  const einheiten = zaehle(["RTW|RK UE 40-83-5", "KTW|RK UE 40-92-1", "MTW|RK UE 40-17-1"].map((x, i) => {
    const [typ, rufname] = x.split("|");
    return db.insert(bibEinheit).values({ id: `bib-einheit-${i + 1}`, typ, rufname }).onConflictDoNothing().run();
  }));
  const verbindungen = zaehle(["R_UE_1", "R_UE_2", "R_UE_3"].map((bezeichnung, i) =>
    db.insert(bibVerbindung).values({ id: `bib-verbindung-${i + 1}`, art: "tmo", bezeichnung }).onConflictDoNothing().run()));
  return [`kommplan: ${plaene} Pläne angelegt, Bibliothek ${stellen} Stellen, ${einheiten} Einheiten, ${verbindungen} Verbindungen`];
}
```

`scripts/seed-lokal.ts`: Importe
```ts
import * as kommplanSchema from "@/app/m/kommplan/_db/schema";
import { seedLokalKommplan } from "@/app/m/kommplan/_lib/seedLokal";
```
und in `SEED_MODULE` nach `einsatzbuch`:
```ts
  { key: "kommplan", lauf: () => seedLokalKommplan(getModuleDb("kommplan", kommplanSchema)) },
```

- [ ] **Step 7: Grün sehen**

Run: `pnpm vitest run src/app/m/kommplan src/core/bootstrap.test.ts scripts/seed-lokal.test.ts src/core/audit src/app/m/portal/admin/audit src/core/kommentaranker.test.ts && pnpm typecheck && pnpm anker:neu`
Expected: PASS; Typecheck Exit 0 (auch `auditLoginRequired("kommplan")`/`auditDenied("kommplan", …)` in `_lib/zugang.ts`); `anker:neu` meldet keinen neuen Zeilenanker (die umgeschriebenen sind Namensanker).

Run: `pnpm seed:lokal kommplan && sqlite3 .data/kommplan.db "select id, typ, ist_vorlage from plan"`
Expected: fünf Zeilen, die zwei Vorlagen mit `ist_vorlage = 1`.

- [ ] **Step 8: Commit**

```bash
git add src/app/m/kommplan/_db src/app/m/kommplan/_lib/testDb.ts src/app/m/kommplan/_lib/seedLokal.ts src/app/m/kommplan/_lib/seedLokal.test.ts src/app/m/kommplan/_lib/zugang.ts src/app/m/kommplan/_lib/zugang.test.ts src/core/bootstrap.ts src/core/bootstrap.test.ts src/app/m/radio/_lib/boot.ts Dockerfile src/core/audit/types.ts src/core/audit/catalog.ts src/app/m/portal/admin/audit/labels.ts scripts/seed-lokal.ts
git commit -S -m "feat(kommplan): eigene Datenbank mit allen Tabellen, Audit, Zugang und lokalem Seed" -m "Plan, Bibliothek und Freigabelinks stehen schon in Phase 1 in der Migration; der Seed legt die Beispielpläne an. Die Freigabetabelle heißt plan_freigabe, weil die Audit-Oberfläche freigabe schon dem Einsatzbuch zuordnet. Zugangsgruppe iuk-kommplan zum Ansehen und Drucken, iuk-kommplan-bearbeiten (und der Suite-Admin) zum Bearbeiten. Zeilenanker auf bootstrap.ts in die Namensform umgeschrieben." -m "DRK-500" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 19: Planliste hinter Host- und Zugangsriegel

**Files:**
- Create: `K/_lib/plaene.ts`, `K/_ui/Huelle.tsx`, `K/_ui/kommplan.css`, `K/(intern)/layout.tsx`, `K/(intern)/page.tsx`, `K/(intern)/PlanTabelle.tsx`
- Test: `K/_lib/plaene.test.ts`, `K/(intern)/PlanTabelle.test.tsx`

**Interfaces:**
- Consumes: `getDb`, `plan` (Task 18), `leseInhalt` (Task 3), `kalendertag` (Task 15), `requireKommplanHost` (Task 17), `requireKommplanZugang` (Task 18), `Shell`, `Seitenkopf`, `Kartentabelle`, `nachText` (`core/tabelle`).
- Produces:
  - `plaene.ts` (Server): `interface Listenzeile { id: string; titel: string; typ: string; datum: string | null; stand: string; vorlage: boolean; lesbar: boolean }` (nur serialisierbare Werte, Falle 9); `listePlaene(db: KommplanDb): Listenzeile[]` (nicht archiviert, neueste zuerst, dann id); `interface GeladenerPlan { id: string; titel: string; typ: "kommunikationsplan" | "fernmeldeskizze"; anlass: string | null; datum: number | null; aktualisiertAm: number; aktualisiertVon: string; inhalt: PlanInhalt | null; fehler: string | null }`; `ladePlan(db, id): GeladenerPlan | null` (unbekannt oder archiviert → null; beschädigter Inhalt → `inhalt: null` mit `fehler`, nie ein Wurf); `ladePlanOder404(db, id): GeladenerPlan` (wirft `notFound`); `beschreibungFuer(p: GeladenerPlan): string`.
  - `Huelle({ children })` (Server): `<Shell variant="full" moduleKey="kommplan">`.
  - Route `/m/kommplan` (eigener Host: `/`).

Die Plan-ID kommt aus der URL, wird aber immer gegen die Datenbank aufgelöst; ein archivierter Plan ist ein 404 (Spec §6.1, §8.3).

- [ ] **Step 1: Failing tests**

`K/_lib/plaene.test.ts`:
```ts
import { describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";

vi.mock("next/navigation", () => ({ notFound: () => { throw new Error("NEXT_NOT_FOUND"); } }));
import { plan } from "../_db/schema";
import { BEISPIELE } from "./beispiele";
import { beschreibungFuer, ladePlan, ladePlanOder404, listePlaene } from "./plaene";
import { seedLokalKommplan } from "./seedLokal";
import { testDb } from "./testDb";

async function mitBeispielen() {
  const db = testDb();
  await seedLokalKommplan(db);
  return db;
}

describe("Planliste und Laden", () => {
  it("listet nicht archivierte Pläne, neueste zuerst, mit lesbaren Texten", async () => {
    const db = await mitBeispielen();
    const liste = listePlaene(db);
    expect(liste).toHaveLength(BEISPIELE.length);
    expect(liste[0].id).toBe("vorlage-fernmeldeskizze-stab");
    const einsatz = liste.find((z) => z.id === "beispiel-einsatz-2026-02-22")!;
    expect(einsatz).toMatchObject({ typ: "Kommunikationsplan", datum: "22.02.2026", vorlage: false, lesbar: true });
    db.update(plan).set({ archiviertAm: new Date() }).where(eq(plan.id, einsatz.id)).run();
    expect(listePlaene(db).map((z) => z.id)).not.toContain(einsatz.id);
  });
  it("lädt einen Plan samt geprüftem Inhalt; unbekannt und archiviert → null", async () => {
    const db = await mitBeispielen();
    const p = ladePlan(db, "beispiel-openr-2022-07-01")!;
    expect(p.inhalt?.stellen.length).toBeGreaterThan(5);
    expect(p.fehler).toBeNull();
    expect(beschreibungFuer(p)).toContain("OpenR · 01.07.2022");
    expect(ladePlan(db, "gibt-es-nicht")).toBeNull();
    db.update(plan).set({ archiviertAm: new Date() }).where(eq(plan.id, p.id)).run();
    expect(ladePlan(db, p.id)).toBeNull();
    expect(() => ladePlanOder404(db, p.id)).toThrow("NEXT_NOT_FOUND");
  });
  it("ein beschädigter Inhalt wirft nicht: Liste markiert ihn, Laden liefert den Fehler", async () => {
    const db = await mitBeispielen();
    db.update(plan).set({ inhalt: JSON.stringify({ schema: 1, optionen: {}, stellen: [{ id: "a" }], verbindungen: [] }) })
      .where(eq(plan.id, "vorlage-kommunikationsplan-label")).run();
    expect(listePlaene(db).find((z) => z.id === "vorlage-kommunikationsplan-label")?.lesbar).toBe(false);
    const p = ladePlan(db, "vorlage-kommunikationsplan-label")!;
    expect(p.inhalt).toBeNull();
    expect(p.fehler).not.toBeNull();
  });
});
```

`K/(intern)/PlanTabelle.test.tsx`:
```tsx
// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { mount, queryAll, unmount } from "@/app/m/qr/_lib/test-dom";
import { PlanTabelle } from "./PlanTabelle";

afterEach(() => unmount());

const ZEILEN = [
  { id: "p1", titel: "Einsatz", typ: "Kommunikationsplan", datum: "22.02.2026", stand: "16.02.2026, 10:00", vorlage: false, lesbar: true },
  { id: "p2", titel: "Label", typ: "Kommunikationsplan", datum: null, stand: "01.09.2026, 10:00", vorlage: true, lesbar: false },
];

/**
 * Kartentabelle rendert Tabelle UND Karten ins DOM (docs/design/README.md, „Mobil"): Tabellenzeilen
 * tragen `data-row-key`, Karten `data-karte-key`. Deshalb wird je Darstellung geprüft, nicht über alle `a`.
 */
describe("PlanTabelle", () => {
  it("verlinkt jeden Plan auf seine Ansicht unter /p/<id> — in der Tabelle und auf den Karten", async () => {
    await mount(<PlanTabelle zeilen={ZEILEN} />);
    expect(queryAll<HTMLAnchorElement>("tr[data-row-key] a").map((a) => a.getAttribute("href"))).toEqual(["/p/p1", "/p/p2"]);
    expect(queryAll("li[data-karte-key]").map((li) => li.getAttribute("data-karte-key"))).toEqual(["p1", "p2"]);
    expect(queryAll<HTMLAnchorElement>("li[data-karte-key] a").map((a) => a.getAttribute("href"))).toEqual(["/p/p1", "/p/p2"]);
  });
  it("Kennzeichen als eigene Chips (Fläche und Text), nie als antd-Tag; fehlendes Datum als —", async () => {
    await mount(<PlanTabelle zeilen={ZEILEN} />);
    expect(queryAll("tr[data-row-key] .ant-tag, li[data-karte-key] .ant-tag")).toEqual([]);
    const chips = queryAll("tr[data-row-key] .kp-chip").map((c) => c.textContent);
    expect(chips).toEqual(["Vorlage", "nicht lesbar"]);
    expect(document.body.textContent).toContain("—");
  });
  it("ohne Pläne steht der Leertext, keine leere Tabelle", async () => {
    await mount(<PlanTabelle zeilen={[]} />);
    expect(document.body.textContent).toContain("Noch keine Pläne.");
  });
});
```

- [ ] **Step 2: Rot sehen**

Run: `pnpm vitest run src/app/m/kommplan/_lib/plaene.test.ts "src/app/m/kommplan/(intern)/PlanTabelle.test.tsx"`
Expected: FAIL — Module fehlen.

- [ ] **Step 3: Implementieren**

`K/_lib/plaene.ts`:
```ts
import { notFound } from "next/navigation";
import { desc, eq, isNull } from "drizzle-orm";
import { zeitFormat } from "@/core/zeit";
import type { KommplanDb } from "../_db/client";
import { plan, type PlanZeile } from "../_db/schema";
import { leseInhalt, type PlanInhalt } from "./plan/schema";
import { kalendertag } from "./rahmen";

const STAND = zeitFormat("de-DE", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
const TYP = { kommunikationsplan: "Kommunikationsplan", fernmeldeskizze: "Fernmeldeskizze" } as const;

export interface Listenzeile { id: string; titel: string; typ: string; datum: string | null; stand: string; vorlage: boolean; lesbar: boolean }
export interface GeladenerPlan {
  id: string; titel: string; typ: PlanZeile["typ"]; anlass: string | null; datum: number | null;
  aktualisiertAm: number; aktualisiertVon: string; inhalt: PlanInhalt | null; fehler: string | null;
}

function lies(zeile: PlanZeile): { inhalt: PlanInhalt | null; fehler: string | null } {
  let roh: unknown;
  try { roh = JSON.parse(zeile.inhalt); } catch { return { inhalt: null, fehler: "Der gespeicherte Inhalt ist kein JSON." }; }
  const r = leseInhalt(roh);
  return r.ok ? { inhalt: r.inhalt, fehler: null } : { inhalt: null, fehler: r.fehler };
}

export function listePlaene(db: KommplanDb): Listenzeile[] {
  return db.select().from(plan).where(isNull(plan.archiviertAm)).orderBy(desc(plan.aktualisiertAm), plan.id).all().map((z) => ({
    id: z.id, titel: z.titel, typ: TYP[z.typ],
    datum: kalendertag(z.datum?.getTime() ?? null), stand: STAND.format(z.aktualisiertAm),
    vorlage: z.istVorlage, lesbar: lies(z).inhalt !== null,
  }));
}

export function ladePlan(db: KommplanDb, id: string): GeladenerPlan | null {
  const z = db.select().from(plan).where(eq(plan.id, id)).get();
  if (!z || z.archiviertAm !== null) return null;
  return {
    id: z.id, titel: z.titel, typ: z.typ, anlass: z.anlass, datum: z.datum?.getTime() ?? null,
    aktualisiertAm: z.aktualisiertAm.getTime(), aktualisiertVon: z.aktualisiertVon, ...lies(z),
  };
}

/** Plan-ID aus der URL, aufgelöst gegen die Datenbank; unbekannt oder archiviert → 404 (notFound bleibt in _lib). */
export function ladePlanOder404(db: KommplanDb, id: string): GeladenerPlan {
  const p = ladePlan(db, id);
  if (!p) notFound();
  return p;
}

export function beschreibungFuer(p: GeladenerPlan): string {
  return [TYP[p.typ], p.anlass, kalendertag(p.datum), `Stand ${STAND.format(p.aktualisiertAm)}`].filter(Boolean).join(" · ");
}
```

`K/_ui/kommplan.css`:
```css
/*
 * Modulvariablen (Falle 2: --ant-* sind nicht global). Die Zeichenfläche selbst bleibt weiß
 * (Papier), nur ihr Umfeld folgt Hell/Dunkel über <html data-theme>.
 */
:root {
  --kp-flaeche: #eef0f3; --kp-rand: #d0d5dc;
  --kp-chip-flaeche: #eef1f5; --kp-chip-text: #2b3440;
  --kp-hinweis-flaeche: #fdf1dc; --kp-hinweis-text: #6b4200;
}
:root[data-theme="dark"] {
  --kp-flaeche: #1d2026; --kp-rand: #3a404a;
  --kp-chip-flaeche: #2a303a; --kp-chip-text: #d6dce5;
  --kp-hinweis-flaeche: #3d2f14; --kp-hinweis-text: #f3cf8e;
}

/*
 * Chips: Fläche UND Text als Paar, nie antds Tag-Vorgabe (docs/design/README.md, Farbvokabular).
 * „nicht lesbar" in Bernstein, nicht in Rot (Falle 3: Rot ist die Primärfarbe); die Bedeutung
 * trägt der Text.
 */
.kp-chips { display: inline-flex; flex-wrap: wrap; gap: 4px; }
.kp-chip {
  display: inline-block; padding: 0 8px; border-radius: 10px; font-size: 12px; line-height: 20px;
  background: var(--kp-chip-flaeche); color: var(--kp-chip-text);
}
.kp-chip-hinweis { background: var(--kp-hinweis-flaeche); color: var(--kp-hinweis-text); }

.kp-betrachter {
  position: relative;
  height: calc(100dvh - 240px);
  min-height: 360px;
  overflow: hidden;
  touch-action: none;
  background: var(--kp-flaeche);
  border: 1px solid var(--kp-rand);
  border-radius: 8px;
  outline-offset: 2px;
}
.kp-betrachter svg { display: block; width: 100%; height: 100%; cursor: grab; }
.kp-werkzeuge { display: flex; flex-wrap: wrap; gap: 8px; margin-block-end: 8px; }
```

`K/_ui/Huelle.tsx`:
```tsx
import { Shell } from "@/core/shell/Shell";
import "./kommplan.css";

/** Die Suite-Hülle für Liste und Betrachter; die Druckroute hat bewusst keine (Abweichung 6). */
export function Huelle({ children }: { children: React.ReactNode }) {
  return <Shell variant="full" moduleKey="kommplan">{children}</Shell>;
}
```

`K/(intern)/layout.tsx`:
```tsx
import { headers } from "next/headers";
import { requireKommplanHost } from "../_lib/host";
import { requireKommplanZugang } from "../_lib/zugang";

/**
 * Host und Zugang OBERHALB jeder künftigen loading.tsx (Falle 23) — sonst wäre ein notFound() ein
 * HTTP 200. Das objektbezogene 404 eines Plans (unbekannt, archiviert) hält `p/[id]/layout.tsx`
 * aus demselben Grund. Ohne Hülle, weil die Druckroute darunter keine haben darf; Liste und
 * Betrachter setzen sie selbst (`_ui/Huelle.tsx`). Jede Seite ruft die Riegel noch einmal — Layouts
 * und Seiten rendern parallel, ein Layout ist kein Vorab-Riegel.
 */
export default async function KommplanInternLayout({ children }: { children: React.ReactNode }) {
  requireKommplanHost(await headers());
  await requireKommplanZugang();
  return children;
}
```

`K/(intern)/PlanTabelle.tsx`:
```tsx
"use client";

import Link from "next/link";
import type { TableProps } from "antd";
import { Kartentabelle, nachText } from "@/core/tabelle";
import type { Listenzeile } from "../_lib/plaene";

/**
 * Client-Insel, weil die Spalten render-Funktionen tragen (Falle 9); Titel als Zeichenketten (Falle 17).
 * `Kartentabelle` statt nackter `Datentabelle`: unter 768px dieselben Spalten als Karten, samt Leiste
 * für Sortierung (docs/design/README.md, „Mobil", DRK-451). Sie steht auf dem Telefon nicht breit
 * da, braucht also kein `scroll`. Links auf `/p/<id>` (Abweichung 11).
 */
export function PlanTabelle({ zeilen }: { zeilen: Listenzeile[] }) {
  const spalten: NonNullable<TableProps<Listenzeile>["columns"]> = [
    { key: "titel", title: "Titel", dataIndex: "titel", sorter: nachText<Listenzeile>((z) => z.titel),
      render: (_: unknown, z: Listenzeile) => <Link href={`/p/${z.id}`}>{z.titel}</Link> },
    { key: "kennzeichen", title: "Kennzeichen", render: (_: unknown, z: Listenzeile) => (
      <span className="kp-chips">
        {z.vorlage ? <span className="kp-chip">Vorlage</span> : null}
        {z.lesbar ? null : <span className="kp-chip kp-chip-hinweis">nicht lesbar</span>}
      </span>
    ) },
    { key: "typ", title: "Art", dataIndex: "typ" },
    { key: "datum", title: "Datum", dataIndex: "datum", render: (d: string | null) => d ?? "—" },
    { key: "stand", title: "Stand", dataIndex: "stand" },
  ];
  return (
    <Kartentabelle<Listenzeile>
      aria-label="Pläne"
      rowKey="id"
      dataSource={zeilen}
      columns={spalten}
      leer={{ nichts: "Noch keine Pläne." }}
      karte={{ titel: "titel", kennzeichen: ["kennzeichen"] }}
    />
  );
}
```

`K/(intern)/page.tsx`:
```tsx
import { headers } from "next/headers";
import { Seitenkopf } from "@/core/shell/Seitenkopf";
import { getDb } from "../_db/client";
import { requireKommplanHost } from "../_lib/host";
import { listePlaene } from "../_lib/plaene";
import { requireKommplanZugang } from "../_lib/zugang";
import { Huelle } from "../_ui/Huelle";
import { PlanTabelle } from "./PlanTabelle";

export const dynamic = "force-dynamic";

export default async function Planliste() {
  requireKommplanHost(await headers());
  await requireKommplanZugang();
  const zeilen = listePlaene(getDb());
  return (
    <Huelle>
      <Seitenkopf titel="Kommunikationspläne" beschreibung="Pläne und Fernmeldeskizzen deiner Einsätze. Öffne einen Plan, um ihn anzusehen oder auf A4 zu drucken." />
      {/* Den Leerzustand trägt die Kartentabelle selbst (`leer`). */}
      <PlanTabelle zeilen={zeilen} />
    </Huelle>
  );
}
```

- [ ] **Step 4: Grün sehen und bauen**

Run: `pnpm vitest run src/app/m/kommplan && pnpm typecheck && pnpm lint`
Expected: PASS; Exit 0.

Run: `uptime && pnpm build`
Expected: Exit 0; die Route `/m/kommplan` erscheint in der Routenliste. Ein Fehler „Collecting page data … path argument" hieße, dass doch etwas `@einsatzzeichen` lädt (Befund M1) — `grenze.test.ts` hätte das melden müssen.

- [ ] **Step 5: Commit**

```bash
git add "src/app/m/kommplan/(intern)" src/app/m/kommplan/_lib/plaene.ts src/app/m/kommplan/_lib/plaene.test.ts src/app/m/kommplan/_ui/Huelle.tsx src/app/m/kommplan/_ui/kommplan.css
git commit -S -m "feat(kommplan): Planliste hinter Host- und Zugangsriegel" -m "Ein beschädigter Planinhalt ist kein Absturz, sondern als nicht lesbar markiert." -m "DRK-500" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 20: Betrachter mit Zoom, Verschieben und Einklappen

**Files:**
- Create: `K/_ui/betrachter/ansicht.ts`, `K/_ui/betrachter/Betrachter.tsx`, `K/_ui/schrift.ts`, `K/(intern)/p/[id]/layout.tsx`, `K/(intern)/p/[id]/page.tsx`
- Test: `K/_ui/betrachter/ansicht.test.ts`, `K/_ui/betrachter/Betrachter.test.tsx`

**Interfaces:**
- Consumes: `layout` (Task 12), `ZeichnungInhalt`, `SymbolDefs`, `FARBE`, `Symbolsatz` (Task 14), `ladePlanOder404`, `beschreibungFuer` (Task 19), `symboleFuer` (Task 15).
- Produces:
  - `ansicht.ts` (rein): `interface Ansicht { massstab: number /* px je mm */; x: number; y: number /* px */ }`; `GRENZEN = { min: 0.4, max: 16 }`; `SCHRITT = 1.25`; `PAN = 48`; `einpassen(breiteMm, hoeheMm, viewportB, viewportH, rand = 16): Ansicht`; `zoome(a, faktor, px, py): Ansicht` (Punkt unter dem Zeiger bleibt stehen; geklemmt); `verschiebe(a, dx, dy): Ansicht`; `type Aktion`; `tasteZuAktion(taste: string): Aktion | null` (`+`/`=` vergrößern, `-` verkleinern, `0` einpassen, Pfeile verschieben).
  - `Betrachter({ inhalt, symbole, titel, schrift })` (`"use client"`): rechnet `layout(inhalt, "bildschirm", { eingeklappt })` selbst; Werkzeugleiste „Verkleinern", „Vergrößern", „Einpassen", „Alle ausklappen"; Rad (mit Strg/⌘ zoomen, sonst verschieben), Ziehen mit Maus/Finger, Zwei-Finger-Zoom, Tastatur auf der fokussierbaren Fläche; je einklappbarer Karte ein Umschalter (`role="button"`, `data-umschalter`, Enter/Leertaste). Eingeklappt ist Ansichtszustand, nicht Planinhalt (Spec §5.7).
  - `schrift.ts`: `ARIMO` (`next/font/local`, `display: "block"`).
  - Route `/p/[id]` (Abweichung 11) mit `(intern)/p/[id]/layout.tsx`: Riegel, dann `ladePlanOder404` — das 404 eines unbekannten oder archivierten Plans fällt oberhalb jeder künftigen `loading.tsx` unter `p/[id]` (Falle 23), für Betrachter **und** Druck.

- [ ] **Step 1: Failing tests**

`K/_ui/betrachter/ansicht.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { GRENZEN, einpassen, tasteZuAktion, verschiebe, zoome } from "./ansicht";

describe("Ansicht", () => {
  it("einpassen: ganze Zeichnung sichtbar, waagerecht mittig", () => {
    const a = einpassen(200, 100, 1000, 600);
    expect(a.massstab).toBeCloseTo(Math.min(968 / 200, 568 / 100), 9);
    expect(a.x + 200 * a.massstab / 2).toBeCloseTo(500, 9);
  });
  it("einpassen ohne Maße (jsdom, leerer Plan) liefert einen festen Anfang", () => {
    expect(einpassen(0, 0, 0, 0)).toEqual({ massstab: 4, x: 16, y: 16 });
  });
  it("zoomen hält den Punkt unter dem Zeiger fest und klemmt", () => {
    const a = { massstab: 2, x: 10, y: 20 };
    const b = zoome(a, 2, 110, 120);
    expect((110 - b.x) / b.massstab).toBeCloseTo((110 - a.x) / a.massstab, 9);
    expect(zoome(a, 1000, 0, 0).massstab).toBe(GRENZEN.max);
    expect(zoome(a, 0.0001, 0, 0).massstab).toBe(GRENZEN.min);
  });
  it("verschieben und Tasten", () => {
    expect(verschiebe({ massstab: 1, x: 0, y: 0 }, 5, -3)).toEqual({ massstab: 1, x: 5, y: -3 });
    expect(tasteZuAktion("+")).toEqual({ art: "zoom", faktor: 1.25 });
    expect(tasteZuAktion("0")).toEqual({ art: "einpassen" });
    expect(tasteZuAktion("ArrowRight")).toEqual({ art: "verschiebe", dx: -48, dy: 0 });
    expect(tasteZuAktion("x")).toBeNull();
  });
});
```

`K/_ui/betrachter/Betrachter.test.tsx`:
```tsx
// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { act } from "react";
import { click, mount, query, queryAll, unmount } from "@/app/m/qr/_lib/test-dom";
import { BEISPIELE } from "../../_lib/beispiele";
import { leererPlan } from "../../_lib/plan/operationen";
import { Betrachter } from "./Betrachter";

afterEach(() => unmount());
const einsatz = BEISPIELE[0];

describe("Betrachter", () => {
  it("zeigt alle Karten; Einklappen der EL lässt nur Leitstelle und EL stehen, mit Abzeichen", async () => {
    await mount(<Betrachter inhalt={einsatz.inhalt} symbole={{}} titel={einsatz.titel} schrift="Arimo" />);
    expect(queryAll("[data-karte]")).toHaveLength(6);
    await click('[data-umschalter="el"]');
    expect(queryAll("[data-karte]").map((k) => k.getAttribute("data-karte"))).toEqual(["lts", "el"]);
    expect(query("[data-abzeichen]").textContent).toBe("+4 Stellen");
    expect(query('[data-umschalter="el"]').getAttribute("aria-expanded")).toBe("false");
    await click('[data-umschalter="el"]');
    expect(queryAll("[data-karte]")).toHaveLength(6);
  });
  it("Tastatur: + vergrößert", async () => {
    await mount(<Betrachter inhalt={einsatz.inhalt} symbole={{}} titel={einsatz.titel} schrift="Arimo" />);
    const vorher = query("[data-ansicht]").getAttribute("transform");
    await act(async () => { query(".kp-betrachter").dispatchEvent(new KeyboardEvent("keydown", { key: "+", bubbles: true })); });
    expect(query("[data-ansicht]").getAttribute("transform")).not.toBe(vorher);
  });
  it("leerer Plan: ein Hinweis statt einer leeren Fläche", async () => {
    await mount(<Betrachter inhalt={leererPlan()} symbole={{}} titel="leer" schrift="Arimo" />);
    expect(document.body.textContent).toContain("Dieser Plan hat noch keine Stellen.");
  });
});
```

- [ ] **Step 2: Rot sehen**

Run: `pnpm vitest run src/app/m/kommplan/_ui/betrachter`
Expected: FAIL — Module fehlen.

- [ ] **Step 3: Implementieren**

`K/_ui/betrachter/ansicht.ts`:
```ts
/** Zoom und Verschieben als reine Funktionen — der Betrachter hält nur den Zustand. */
export interface Ansicht { massstab: number; x: number; y: number }
export const GRENZEN = { min: 0.4, max: 16 } as const;
export const SCHRITT = 1.25;
export const PAN = 48;

const klemme = (m: number) => Math.min(GRENZEN.max, Math.max(GRENZEN.min, m));

export function einpassen(breiteMm: number, hoeheMm: number, vb: number, vh: number, rand = 16): Ansicht {
  if (breiteMm <= 0 || hoeheMm <= 0 || vb <= 0 || vh <= 0) return { massstab: 4, x: rand, y: rand };
  const m = klemme(Math.min((vb - 2 * rand) / breiteMm, (vh - 2 * rand) / hoeheMm));
  return { massstab: m, x: (vb - breiteMm * m) / 2, y: rand };
}

export function zoome(a: Ansicht, faktor: number, px: number, py: number): Ansicht {
  const m = klemme(a.massstab * faktor);
  const f = m / a.massstab;
  return { massstab: m, x: px - (px - a.x) * f, y: py - (py - a.y) * f };
}

export function verschiebe(a: Ansicht, dx: number, dy: number): Ansicht {
  return { ...a, x: a.x + dx, y: a.y + dy };
}

export type Aktion = { art: "zoom"; faktor: number } | { art: "verschiebe"; dx: number; dy: number } | { art: "einpassen" };

export function tasteZuAktion(taste: string): Aktion | null {
  switch (taste) {
    case "+": case "=": return { art: "zoom", faktor: SCHRITT };
    case "-": return { art: "zoom", faktor: 1 / SCHRITT };
    case "0": return { art: "einpassen" };
    case "ArrowLeft": return { art: "verschiebe", dx: PAN, dy: 0 };
    case "ArrowRight": return { art: "verschiebe", dx: -PAN, dy: 0 };
    case "ArrowUp": return { art: "verschiebe", dx: 0, dy: PAN };
    case "ArrowDown": return { art: "verschiebe", dx: 0, dy: -PAN };
    default: return null;
  }
}
```

`K/_ui/schrift.ts`:
```ts
import localFont from "next/font/local";

/**
 * Arimo — dieselbe Datei wie im Katalog (`generat.test.ts` prüft die SHA). `display: "block"`:
 * die Karten sind mit Arimo-Metriken gesetzt, ein kurz eingeblendeter Ersatzschnitt liefe aus ihnen
 * heraus. Die Zeichnung erbt die Familie vom <svg> (`style.fontFamily`), die Symbole tragen keine.
 */
export const ARIMO = localFont({
  src: [{ path: "../_fonts/Arimo-Variable.ttf", weight: "400 700", style: "normal" }],
  display: "block",
  fallback: ["Arial", "sans-serif"],
});
```

`K/_ui/betrachter/Betrachter.tsx`:
```tsx
"use client";

import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { Button } from "antd";
import { layout } from "../../_lib/layout/layout";
import type { KarteL } from "../../_lib/layout/typen";
import type { PlanInhalt } from "../../_lib/plan/schema";
import { FARBE } from "../zeichnung/farben";
import { SymbolDefs, type Symbolsatz } from "../zeichnung/Symbole";
import { ZeichnungInhalt } from "../zeichnung/Zeichnung";
import { SCHRITT, einpassen, tasteZuAktion, verschiebe, zoome, type Ansicht } from "./ansicht";

/**
 * Der Betrachter (Spec §5.7): dasselbe Layout wie der Druck, mit Zoom, Verschieben und Einklappen.
 * Rechnet das Layout im Browser — `layout()` ist rein und teilt Metriken mit dem Server.
 *
 * KEIN setState IM EFFEKT-RUMPF (`react-hooks/set-state-in-effect` ist aktiv, Vorbild
 * `core/tabelle/useEntprellt.ts`): die eingepasste Ansicht wird beim Rendern aus der gemessenen
 * Flächengröße ABGELEITET; eigener Zustand entsteht erst, wenn jemand zoomt oder verschiebt.
 * „Einpassen" heißt: eigenen Zustand verwerfen. Gemessen wird per ResizeObserver-Rückruf.
 */
export function Betrachter({ inhalt, symbole, titel, schrift }: { inhalt: PlanInhalt; symbole: Symbolsatz; titel: string; schrift: string }) {
  const [eingeklappt, setEingeklappt] = useState<ReadonlySet<string>>(() => new Set());
  const daten = useMemo(() => layout(inhalt, "bildschirm", { eingeklappt }), [inhalt, eingeklappt]);
  const flaeche = useRef<HTMLDivElement>(null);
  const [groesse, setGroesse] = useState({ b: 0, h: 0 });
  const [eigene, setEigene] = useState<Ansicht | null>(null);
  const zeiger = useRef(new Map<number, { x: number; y: number }>());

  const basis = einpassen(daten.breite, daten.hoehe, groesse.b, groesse.h);
  const a = eigene ?? basis;
  const basisRef = useRef(basis);
  useEffect(() => { basisRef.current = basis; });

  useEffect(() => {
    const el = flaeche.current;
    if (!el || typeof ResizeObserver === "undefined") return; // jsdom kennt keinen ResizeObserver
    const beobachter = new ResizeObserver(([e]) => setGroesse({ b: e.contentRect.width, h: e.contentRect.height }));
    beobachter.observe(el);
    return () => beobachter.disconnect();
  }, []);

  // Rad als nicht-passiver Listener, sonst verschiebt der Browser die Seite statt den Plan.
  useEffect(() => {
    const el = flaeche.current;
    if (!el) return;
    const rad = (e: WheelEvent) => {
      e.preventDefault();
      const r = el.getBoundingClientRect();
      setEigene((alt) => {
        const jetzt = alt ?? basisRef.current;
        return e.ctrlKey || e.metaKey ? zoome(jetzt, Math.exp(-e.deltaY / 300), e.clientX - r.left, e.clientY - r.top) : verschiebe(jetzt, -e.deltaX, -e.deltaY);
      });
    };
    el.addEventListener("wheel", rad, { passive: false });
    return () => el.removeEventListener("wheel", rad);
  }, []);

  const aendere = (f: (x: Ansicht) => Ansicht) => setEigene((alt) => f(alt ?? basisRef.current));
  const zoomUmMitte = (faktor: number) => {
    const el = flaeche.current;
    aendere((x) => zoome(x, faktor, (el?.clientWidth ?? 0) / 2, (el?.clientHeight ?? 0) / 2));
  };

  const unten = (e: PointerEvent<HTMLDivElement>) => {
    if ((e.target as Element).closest("[data-umschalter]")) return; // Klick auf einen Umschalter ist kein Ziehen
    e.currentTarget.setPointerCapture?.(e.pointerId);
    zeiger.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
  };
  const bewegt = (e: PointerEvent<HTMLDivElement>) => {
    const alt = zeiger.current.get(e.pointerId);
    if (!alt) return;
    const anderer = [...zeiger.current.entries()].find(([id]) => id !== e.pointerId)?.[1];
    if (anderer) {
      const vorher = Math.hypot(alt.x - anderer.x, alt.y - anderer.y);
      const jetzt = Math.hypot(e.clientX - anderer.x, e.clientY - anderer.y);
      const r = e.currentTarget.getBoundingClientRect();
      if (vorher > 0) aendere((x) => zoome(x, jetzt / vorher, (e.clientX + anderer.x) / 2 - r.left, (e.clientY + anderer.y) / 2 - r.top));
    } else {
      aendere((x) => verschiebe(x, e.clientX - alt.x, e.clientY - alt.y));
    }
    zeiger.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
  };
  const los = (e: PointerEvent<HTMLDivElement>) => { zeiger.current.delete(e.pointerId); };

  const taste = (e: KeyboardEvent<HTMLDivElement>) => {
    if ((e.target as Element).closest("[data-umschalter]")) return;
    const aktion = tasteZuAktion(e.key);
    if (!aktion) return;
    e.preventDefault();
    if (aktion.art === "einpassen") setEigene(null);
    else if (aktion.art === "zoom") zoomUmMitte(aktion.faktor);
    else aendere((x) => verschiebe(x, aktion.dx, aktion.dy));
  };

  const umschalten = (id: string) => setEingeklappt((s) => {
    const neu = new Set(s);
    if (neu.has(id)) neu.delete(id); else neu.add(id);
    return neu;
  });
  const zusatz = (k: KarteL) => !k.einklappbar ? null : (
    <g role="button" tabIndex={0} data-umschalter={k.id} aria-expanded={!k.eingeklappt}
      aria-label={`${k.titelVoll === "" ? "(ohne Titel)" : k.titelVoll}: Unterstellen ${k.eingeklappt ? "ausklappen" : "einklappen"}`}
      style={{ cursor: "pointer" }}
      onClick={(e) => { e.stopPropagation(); umschalten(k.id); }}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); e.stopPropagation(); umschalten(k.id); } }}>
      <circle cx={k.breite / 2} cy={k.hoehe} r={2.2} fill={FARBE.papier} stroke={FARBE.tinte} strokeWidth={0.25} />
      <text x={k.breite / 2} y={k.hoehe + 1.1} fontSize={3.2} textAnchor="middle" fill={FARBE.tinte}>{k.eingeklappt ? "+" : "−"}</text>
    </g>
  );

  return (
    <div>
      <div className="kp-werkzeuge">
        <Button onClick={() => zoomUmMitte(1 / SCHRITT)} aria-label="Verkleinern">−</Button>
        <Button onClick={() => zoomUmMitte(SCHRITT)} aria-label="Vergrößern">+</Button>
        <Button onClick={() => setEigene(null)}>Einpassen</Button>
        {eingeklappt.size > 0 ? <Button onClick={() => setEingeklappt(new Set())}>Alle ausklappen</Button> : null}
      </div>
      <div ref={flaeche} className="kp-betrachter" tabIndex={0} role="group"
        aria-label={`${titel} — Pfeiltasten verschieben, Plus und Minus zoomen, 0 passt ein`}
        onPointerDown={unten} onPointerMove={bewegt} onPointerUp={los} onPointerCancel={los} onKeyDown={taste}>
        {daten.karten.length === 0 ? (
          <p style={{ padding: 16 }}>Dieser Plan hat noch keine Stellen.</p>
        ) : (
          <svg role="img" aria-label={titel} style={{ fontFamily: schrift }}>
            <SymbolDefs symbole={symbole} />
            <g data-ansicht="" transform={`translate(${a.x} ${a.y}) scale(${a.massstab})`}>
              <rect width={daten.breite} height={daten.hoehe} fill={FARBE.papier} />
              <ZeichnungInhalt daten={daten} zusatz={zusatz} />
            </g>
          </svg>
        )}
      </div>
    </div>
  );
}
```

Vor dem Schreiben `pnpm lint` einmal auf eine leere Fassung der Datei laufen lassen und die aktiven `react-hooks/*`-Regeln lesen; meldet `react-hooks/refs` das Schreiben von `basisRef.current` im Effekt, `basisRef` durch `useEffectEvent` ersetzen (React 19.2), nicht die Regel abschalten.

`K/(intern)/p/[id]/layout.tsx`:
```tsx
import { headers } from "next/headers";
import { getDb } from "@/app/m/kommplan/_db/client";
import { requireKommplanHost } from "@/app/m/kommplan/_lib/host";
import { ladePlanOder404 } from "@/app/m/kommplan/_lib/plaene";
import { requireKommplanZugang } from "@/app/m/kommplan/_lib/zugang";

/**
 * FALLE 23 FÜR DAS OBJEKT (Vorbild `feedback/(admin)/groups/[groupId]/(cockpit)/layout.tsx`): ein
 * unbekannter oder archivierter Plan ist hier ein echter 404 — oberhalb jeder künftigen
 * `loading.tsx` unter `p/[id]` (Editor, Autosave ab Phase 2). Stünde `ladePlanOder404` nur in den
 * Seiten, lieferte die erste Ladegrenze darüber still HTTP 200 (feedback DRK-424, lagerbuch DRK-480).
 *
 * Die Riegel stehen VOR dem Laden, weil Layouts und Seiten parallel rendern: ohne sie könnte ein
 * anonymer Abruf am 404 statt am Login erkennen, ob es einen Plan gibt. Die Seiten darunter
 * prüfen trotzdem selbst und laden den Plan für ihre Daten erneut.
 *
 * ⚠️ DAS LAYOUT LÄUFT AUCH BEIM VORABLADEN (Links aus der Planliste): hier steht nur Lesendes.
 * `notFound()`/`redirect()` bleiben in `_lib` (kein Eintrag im Abdeckungsmanifest von `core/audit`).
 */
export default async function PlanSchutz({ children, params }: { children: React.ReactNode; params: Promise<{ id: string }> }) {
  requireKommplanHost(await headers());
  await requireKommplanZugang();
  ladePlanOder404(getDb(), (await params).id);
  return children;
}
```

`K/(intern)/p/[id]/page.tsx`:
```tsx
import { headers } from "next/headers";
import Link from "next/link";
import { Card } from "antd";
import { Seitenkopf } from "@/core/shell/Seitenkopf";
import { getDb } from "@/app/m/kommplan/_db/client";
import { requireKommplanHost } from "@/app/m/kommplan/_lib/host";
import { beschreibungFuer, ladePlanOder404 } from "@/app/m/kommplan/_lib/plaene";
import { symboleFuer } from "@/app/m/kommplan/_lib/zeichen/zeichen";
import { requireKommplanZugang } from "@/app/m/kommplan/_lib/zugang";
import { Betrachter } from "@/app/m/kommplan/_ui/betrachter/Betrachter";
import { Huelle } from "@/app/m/kommplan/_ui/Huelle";
import { ARIMO } from "@/app/m/kommplan/_ui/schrift";

export const dynamic = "force-dynamic";

export default async function PlanAnsicht({ params }: { params: Promise<{ id: string }> }) {
  requireKommplanHost(await headers());
  await requireKommplanZugang();
  const { id } = await params;
  const plan = ladePlanOder404(getDb(), id);
  return (
    <Huelle>
      <Seitenkopf
        titel={plan.titel}
        zurueck={{ titel: "Alle Pläne", href: "/" }}
        beschreibung={beschreibungFuer(plan)}
        aktionen={plan.inhalt ? <Link href={`/p/${plan.id}/druck/a4`} target="_blank">Drucken (A4 quer)</Link> : undefined}
      />
      {plan.inhalt ? (
        <div className={ARIMO.className}>
          <Betrachter inhalt={plan.inhalt} symbole={symboleFuer(plan.inhalt)} titel={plan.titel} schrift={ARIMO.style.fontFamily} />
        </div>
      ) : (
        <Card>Dieser Plan lässt sich nicht lesen. Die Bearbeitung kommt in einer späteren Ausbaustufe; bis dahin hilft der Betrieb.</Card>
      )}
    </Huelle>
  );
}
```

- [ ] **Step 4: Grün sehen und bauen**

Run: `pnpm vitest run src/app/m/kommplan && pnpm typecheck && pnpm lint`
Expected: PASS; Exit 0.

Run: `uptime && pnpm build`
Expected: Exit 0, Route `/m/kommplan/p/[id]` gelistet. `next/font/local` meldet einen falschen Pfad hier und nicht später.

- [ ] **Step 5: Commit**

```bash
git add src/app/m/kommplan/_ui/betrachter src/app/m/kommplan/_ui/schrift.ts "src/app/m/kommplan/(intern)/p/[id]/layout.tsx" "src/app/m/kommplan/(intern)/p/[id]/page.tsx"
git commit -S -m "feat(kommplan): Betrachter mit Zoom, Verschieben und Einklappen" -m "Dasselbe Layout wie der Druck, im Browser gerechnet. Maus, Finger und Tastatur; Einklappen ist Ansichtszustand und ändert den Plan nicht." -m "DRK-500" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 21: Druckroute A4 quer

**Files:**
- Create: `K/(intern)/p/[id]/druck/a4/page.tsx`, `K/(intern)/p/[id]/druck/a4/Drucken.tsx`, `K/(intern)/p/[id]/druck/a4/druck.css`
- Test: `K/(intern)/p/[id]/druck/a4/Drucken.test.tsx`

**Interfaces:**
- Consumes: `teileAuf` (Task 12), `Blattansicht`, `SymbolDefs` (Task 14), `rahmenFuer` (Task 15), `symboleFuer` (Task 15), `ladePlanOder404` (Task 19), `ARIMO` (Task 20).
- Produces: Route `/p/[id]/druck/a4` — je Blatt ein `<svg class="kp-blatt">` in 297 × 210 mm mit benannter `@page kommplan-a4` (Falle 18; `page:` am gemeinsamen Vorfahren `main.kp-druck`), die Symbole einmal in einem unsichtbaren `<svg class="kp-symbole">`; `window.print()` erst nach `document.fonts.ready` (Vorbild `feedback/(print)/aushang`, dort wartet es auf ein Bild).

- [ ] **Step 1: Failing test**

`K/(intern)/p/[id]/druck/a4/Drucken.test.tsx`:
```tsx
// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { mount, unmount } from "@/app/m/qr/_lib/test-dom";
import { Drucken } from "./Drucken";

afterEach(() => { unmount(); vi.restoreAllMocks(); });

describe("Drucken", () => {
  it("ruft print() erst, wenn die Schriften geladen sind", async () => {
    let freigeben: () => void = () => {};
    const bereit = new Promise<void>((r) => { freigeben = r; });
    Object.defineProperty(document, "fonts", { value: { ready: bereit }, configurable: true });
    const druck = vi.spyOn(window, "print").mockImplementation(() => {});
    await mount(<Drucken />);
    expect(druck).not.toHaveBeenCalled();
    await act(async () => { freigeben(); await bereit; });
    expect(druck).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Rot sehen**

Run: `pnpm vitest run "src/app/m/kommplan/(intern)/p/[id]/druck"`
Expected: FAIL — `./Drucken` fehlt.

- [ ] **Step 3: Implementieren**

`K/(intern)/p/[id]/druck/a4/Drucken.tsx`:
```tsx
"use client";

import { useEffect } from "react";
import { Button } from "antd";

/**
 * Druckanstoß wie beim Aushang (`feedback/(print)/aushang/[groupId]/Drucken.tsx`): beim Öffnen
 * drucken, dazu ein Knopf, falls der Dialog abgebrochen wurde. Gewartet wird auf die Schrift:
 * die Karten sind mit Arimo-Metriken gesetzt, ein Ersatzschnitt liefe aus ihnen heraus.
 */
export function Drucken() {
  useEffect(() => {
    let abgebrochen = false;
    void document.fonts.ready.then(() => { if (!abgebrochen) window.print(); });
    return () => { abgebrochen = true; };
  }, []);
  return (
    <div className="noprint kp-druck-knopf">
      <Button onClick={() => window.print()}>Drucken</Button>
    </div>
  );
}
```

`K/(intern)/p/[id]/druck/a4/druck.css`:
```css
/*
 * Falle 18: benannte @page mit ausgeschriebenen Kantenlängen. A3 quer wird eine EIGENE Route
 * (Phase 5) — gemischte Seitengrößen in einem Dokument verwirft Chromium ganz.
 * Papier kennt keinen Dunkelmodus: Blätter und Umfeld sind hell, unabhängig von data-theme.
 */
@page kommplan-a4 {
  size: 297mm 210mm;
  margin: 0;
}

/*
 * ⚠️ `page: kommplan-a4` SITZT AM GEMEINSAMEN VORFAHREN, nicht an jedem Blatt (Vorbild
 * `lagerbuch/verwaltung/(druck)/druck.css`, `.lb-ortbogen`): das ist die Zusage, dass ALLES
 * Gedruckte dieser Seite auf derselben Seitengröße liegt — auch der Zweig „Dieser Plan lässt sich
 * nicht lesen." und alles, was Phase 5 ergänzt. Gleichwertigkeit „am Element / am Vorfahren" ist
 * dort nur für Block-divs gemessen, nicht für ein ersetztes <svg>. Die Blätter tragen nur den Umbruch.
 */
.kp-druck { page: kommplan-a4; background: #e9ebee; color: #000; padding-block: 16px; }
.kp-druck .kp-blatt { display: block; margin: 0 auto 16px; background: #fff; break-after: page; box-shadow: 0 1px 4px rgba(0, 0, 0, 0.25); }
.kp-druck .kp-blatt:last-of-type { break-after: auto; }
.kp-druck .kp-symbole { position: absolute; width: 0; height: 0; overflow: hidden; }
.kp-druck .kp-druck-knopf { text-align: center; margin-block-end: 16px; }

@media print {
  body { background: #fff; margin: 0; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .kp-druck { background: #fff; padding: 0; }
  .kp-druck .kp-blatt { margin: 0; box-shadow: none; }
  .kp-druck .noprint { display: none; }
}
```

`K/(intern)/p/[id]/druck/a4/page.tsx`:
```tsx
import "./druck.css";
import { headers } from "next/headers";
import { getDb } from "@/app/m/kommplan/_db/client";
import { requireKommplanHost } from "@/app/m/kommplan/_lib/host";
import { teileAuf } from "@/app/m/kommplan/_lib/layout/papier";
import { ladePlanOder404 } from "@/app/m/kommplan/_lib/plaene";
import { rahmenFuer } from "@/app/m/kommplan/_lib/rahmen";
import { symboleFuer } from "@/app/m/kommplan/_lib/zeichen/zeichen";
import { requireKommplanZugang } from "@/app/m/kommplan/_lib/zugang";
import { ARIMO } from "@/app/m/kommplan/_ui/schrift";
import { Blattansicht } from "@/app/m/kommplan/_ui/zeichnung/Blatt";
import { SymbolDefs } from "@/app/m/kommplan/_ui/zeichnung/Symbole";
import { Drucken } from "./Drucken";

export const dynamic = "force-dynamic";

/**
 * DRUCK A4 QUER (Spec §8.1): jedes Blatt als Vektor-SVG in Originalgröße; „Als PDF sichern" im
 * Druckdialog liefert das PDF. Keine Hülle (sie druckte sonst mit, Abweichung 6); Host, Zugang und
 * das 404 des Plans prüfen `(intern)/layout.tsx`, `(intern)/p/[id]/layout.tsx` UND diese Seite.
 */
export default async function DruckA4({ params }: { params: Promise<{ id: string }> }) {
  requireKommplanHost(await headers());
  await requireKommplanZugang();
  const { id } = await params;
  const plan = ladePlanOder404(getDb(), id);
  if (!plan.inhalt) return <main className="kp-druck"><p>Dieser Plan lässt sich nicht lesen.</p></main>;
  const blaetter = teileAuf(plan.inhalt, "a4-quer");
  const symbole = symboleFuer(plan.inhalt);
  const rahmen = rahmenFuer({
    titel: plan.titel, anlass: plan.anlass, datum: plan.datum, aktualisiertAm: plan.aktualisiertAm,
    aktualisiertVon: plan.aktualisiertVon, vermerkVsNfD: plan.inhalt.optionen.vermerkVsNfD,
  });
  return (
    <main className={`kp-druck ${ARIMO.className}`}>
      <Drucken />
      <svg className="kp-symbole" width="0" height="0" aria-hidden="true" focusable="false">
        <SymbolDefs symbole={symbole} />
      </svg>
      {blaetter.map((b) => (
        <Blattansicht key={b.nummer} blatt={b} rahmen={rahmen} symbole={symbole} schrift={ARIMO.style.fontFamily} mitDefs={false} />
      ))}
    </main>
  );
}
```

- [ ] **Step 4: Grün sehen und bauen**

Run: `pnpm vitest run src/app/m/kommplan && pnpm typecheck && pnpm lint`
Expected: PASS; Exit 0.

Run: `uptime && pnpm build`
Expected: Exit 0; `/m/kommplan/p/[id]/druck/a4` gelistet. Meldet Next einen Konflikt zwischen `p/[id]/page.tsx` und `p/[id]/druck/a4/page.tsx`, ist die Route-Group-Struktur falsch (beide liegen unter `(intern)/p/[id]/` — es gibt nur EIN `[id]`).

- [ ] **Step 5: Commit**

```bash
git add "src/app/m/kommplan/(intern)/p/[id]/druck"
git commit -S -m "feat(kommplan): Druckroute A4 quer mit Vektorblättern" -m "Jedes Blatt in Originalgröße mit Kopf, Legende, Fuß und Blattzähler; gedruckt wird erst, wenn Arimo geladen ist." -m "DRK-500" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 22: End-to-End — Zugang, Betrachter, Druck

**Files:**
- Create: `e2e/kommplan.spec.ts`
- Modify: `playwright.config.ts` (Seed vor `next dev`), `e2e/gruppen.json`

**Interfaces:**
- Consumes: `devLogin`, `E2E_PORT`, `klickeWennRuhig`, `warteAufGestreamteInhalte`, `warteAufSpaltenaufteilung` (`e2e/fixtures.ts`); die Seed-IDs aus Task 13/18; `pdf-lib` (bereits Abhängigkeit).

**Falle 12 in beiden Hälften:** Liste und Betrachter stehen in der FullShell (`Huelle`). Die Hülle bricht nach `load` um (Leiste neben statt über dem Inhalt), und der Betrachter passt sich per ResizeObserver neu ein, solange niemand gezoomt hat. Deshalb: vor jeder Messung `warteAufSpaltenaufteilung`, vor jedem Klick `klickeWennRuhig`, und die Zoom-Zusicherung misst den **Faktor** (nachher = vorher × 1,25) gegen eine **ruhige** Ausgangslage — ein bloßes „anders als vorher" wäre schon durch die Einpassung grün. Den Umschalter vor dem Zoomen bedienen: in der eingepassten Fläche liegt er sicher innerhalb von `overflow: hidden`.

Spec §10 nennt für e2e „anlegen → Stelle hinzufügen → Gliederung einfügen" — das gehört zu Phase 2/3. Phase 1 prüft, was sie liefert: Zugang, Liste, Betrachter, Druck (Seitenzahl, kein leeres Blatt), 404 ohne Gruppe.

- [ ] **Step 1: Seed in den e2e-Server und Spec in eine Gruppe**

`playwright.config.ts`: im `command` des Suite-Servers nach `pnpm exec tsx scripts/seed-lokal.ts uav && ` einfügen: `pnpm exec tsx scripts/seed-lokal.ts kommplan && ` — und über dem bestehenden Kommentarblock einen Absatz ergänzen:
```ts
      /*
       * `scripts/seed-lokal.ts kommplan` (Kommunikationspläne, Phase 1): dasselbe Muster wie `uav` —
       * kein Boot-Seed, also legt erst diese Zeile die Beispielpläne an, die `e2e/kommplan.spec.ts`
       * über ihre festen IDs öffnet.
       */
```

`e2e/gruppen.json`: in `"eimer-2"` an `specs` ` e2e/kommplan.spec.ts` anhängen.

- [ ] **Step 2: Spec schreiben**

`e2e/kommplan.spec.ts`:
```ts
import { expect, test, type Page } from "@playwright/test";
import { PDFDocument } from "pdf-lib";
import { devLogin, E2E_PORT, klickeWennRuhig, warteAufGestreamteInhalte, warteAufSpaltenaufteilung } from "./fixtures";

/**
 * Kommunikationspläne, Phase 1: Zugang, Liste, Betrachter, Druck. Gemessen wird am echten Abruf,
 * weil die Fallen 1, 6, 7, 18 und 23 nur dort sichtbar werden. Die Pläne legt der Seed an
 * (`playwright.config.ts`, `scripts/seed-lokal.ts kommplan`). Pläne liegen unter `/p/<id>`
 * (Abweichung 11 im Umsetzungsplan).
 */
const HOST = "kommplan.localtest.me";
const url = (pfad: string) => `http://${HOST}:${E2E_PORT}${pfad}`;
const EINSATZ = "beispiel-einsatz-2026-02-22";
const STABSLAGE = "beispiel-grosse-stabslage";
const SCHRITT = 1.25; // `_ui/betrachter/ansicht.ts`, SCHRITT

const massstab = (transform: string | null) => Number(/scale\(([-\d.e]+)\)/.exec(transform ?? "")?.[1] ?? Number.NaN);

/**
 * Die Ausgangslage des Betrachters, sobald sie steht: zwei gleiche Werte hintereinander. Vorher
 * ändert sich das transform schon durch Hydration, Einpassung und den Umbruch der Hülle.
 */
async function ruhigeAnsicht(page: Page): Promise<string> {
  let letzte = "";
  await expect.poll(async () => {
    const jetzt = (await page.locator("[data-ansicht]").getAttribute("transform")) ?? "";
    const ruhig = jetzt !== "" && jetzt === letzte;
    letzte = jetzt;
    return ruhig;
  }, { intervals: [150], message: "Die Ansicht des Betrachters kommt nicht zur Ruhe" }).toBe(true);
  return letzte;
}

test("mit der Zugangsgruppe: Liste, Plan, Einklappen und Zoom", async ({ page }) => {
  await devLogin(page, { host: HOST, groups: "iuk-kommplan", callbackPath: "/" });
  const liste = await page.goto(url("/"));
  expect(liste?.status()).toBe(200);
  await warteAufSpaltenaufteilung(page);
  await expect(page.getByRole("heading", { level: 1, name: "Kommunikationspläne" })).toBeVisible();
  // getByRole sieht nur die sichtbare Darstellung (Tabelle ODER Karten, docs/design/README.md „Mobil").
  await expect(page.getByRole("link", { name: "Kommunikationsplan Einsatz 22.02.2026" })).toBeVisible();

  const plan = await page.goto(url(`/p/${EINSATZ}`));
  expect(plan?.status()).toBe(200);
  await warteAufSpaltenaufteilung(page);
  await expect(page.locator(".kp-betrachter [data-karte]")).toHaveCount(6);

  // Einklappen zuerst — vor dem Zoomen liegt der Umschalter sicher in der eingepassten Fläche.
  await klickeWennRuhig(page.locator('[data-umschalter="el"]'));
  await expect(page.locator(".kp-betrachter [data-karte]")).toHaveCount(2);
  await expect(page.locator("[data-abzeichen]")).toHaveText("+4 Stellen");
  await klickeWennRuhig(page.getByRole("button", { name: "Alle ausklappen" }));
  await expect(page.locator(".kp-betrachter [data-karte]")).toHaveCount(6);

  const vorher = massstab(await ruhigeAnsicht(page));
  expect(vorher).toBeGreaterThan(0);
  await klickeWennRuhig(page.getByRole("button", { name: "Vergrößern" }));
  await expect.poll(async () => massstab(await page.locator("[data-ansicht]").getAttribute("transform")))
    .toBeCloseTo(vorher * SCHRITT, 6);
});

test("Druck A4: ein Blatt für den Einsatz, mehrere für die Stab-Lage, keines leer, Druck nach der Schrift", async ({ page }) => {
  await page.addInitScript(() => {
    const w = window as unknown as { __gedruckt: number };
    w.__gedruckt = 0;
    window.print = () => { w.__gedruckt += 1; };
  });
  await devLogin(page, { host: HOST, groups: "iuk-kommplan", callbackPath: "/" });

  const einsatz = await page.goto(url(`/p/${EINSATZ}/druck/a4`));
  expect(einsatz?.status()).toBe(200);
  await warteAufGestreamteInhalte(page);
  await expect(page.locator("svg.kp-blatt")).toHaveCount(1);
  await expect(page.locator("svg.kp-blatt [data-karte]")).toHaveCount(6);
  await expect(page.locator("svg.kp-blatt").first()).toContainText("Blatt 1 von 1");
  await expect.poll(() => page.evaluate(() => (window as unknown as { __gedruckt: number }).__gedruckt)).toBe(1);
  const pdfEinsatz = await PDFDocument.load(await page.pdf({ preferCSSPageSize: true }));
  expect(pdfEinsatz.getPageCount()).toBe(1);
  expect(pdfEinsatz.getPage(0).getSize().width).toBeGreaterThan(pdfEinsatz.getPage(0).getSize().height); // quer

  const gross = await page.goto(url(`/p/${STABSLAGE}/druck/a4`));
  expect(gross?.status()).toBe(200);
  await warteAufGestreamteInhalte(page);
  const blaetter = page.locator("svg.kp-blatt");
  const anzahl = await blaetter.count();
  expect(anzahl).toBeGreaterThanOrEqual(2);
  for (const blatt of await blaetter.all()) expect(await blatt.locator("[data-karte]").count()).toBeGreaterThan(0);
  const pdfGross = await PDFDocument.load(await page.pdf({ preferCSSPageSize: true }));
  expect(pdfGross.getPageCount()).toBe(anzahl);
  for (const seite of pdfGross.getPages()) expect(seite.getSize().width).toBeGreaterThan(seite.getSize().height);
});

test("ohne Anmeldung geht es zum Login; Pfade außerhalb von p/ laufen nicht in den Riegel", async ({ page }) => {
  await page.goto(url("/"));
  await expect(page).toHaveURL(/\/login/);
  // Abweichung 11: /robots.txt u. ä. werden auf /m/kommplan/robots.txt umgeschrieben. Ohne
  // dynamisches Segment unter der Modulwurzel ist das ein schlichter 404 — kein Login-Umweg,
  // keine login_required-Auditzeile je Crawler-Abruf.
  const robots = await page.goto(url("/robots.txt"));
  expect(robots?.status()).toBe(404);
  expect(page.url()).not.toMatch(/\/login/);
});

test("ohne Gruppe: 404 auf Liste, Plan und Druck", async ({ page }) => {
  await devLogin(page, { host: HOST, groups: "andere", callbackPath: "/login" });
  for (const pfad of ["/", `/p/${EINSATZ}`, `/p/${EINSATZ}/druck/a4`]) {
    expect((await page.goto(url(pfad)))?.status(), pfad).toBe(404);
  }
});

test("unbekannter Plan: 404 auf Betrachter und Druck; fremder Suite-Host: 404", async ({ page }) => {
  await devLogin(page, { host: HOST, groups: "iuk-kommplan", callbackPath: "/" });
  for (const pfad of ["/p/gibt-es-nicht", "/p/gibt-es-nicht/druck/a4"]) {
    expect((await page.goto(url(pfad)))?.status(), pfad).toBe(404);
  }
  await devLogin(page, { host: "feedback.localtest.me", groups: "iuk-kommplan", callbackPath: "/login" });
  expect((await page.goto(`http://feedback.localtest.me:${E2E_PORT}/m/kommplan`))?.status()).toBe(404);
});
```

- [ ] **Step 3: Laufen lassen**

Vorher prüfen, dass kein fremder `pnpm dev` den E2E-Port dieser Arbeitskopie hält (`e2e/helpers/ports.ts`; eine „FREMDE Arbeitskopie" nicht beenden) und die Last ansehen.

Run: `uptime && pnpm vitest run scripts/e2e-gruppen.test.ts && pnpm exec playwright test e2e/kommplan.spec.ts`
Expected: PASS, 5 Tests. Schlägt der erste mit HTTP 500 fehl, zuerst Fallen 1, 6, 7 prüfen (antd-Compound, Werte aus `"use client"`, Icons in RSC). Zählt der Druck mehr PDF-Seiten als Blätter, ist `break-after`/`@page` falsch (Falle 18) — nicht die Erwartung ändern. Liefert ein unbekannter Plan 200 statt 404, fehlt `p/[id]/layout.tsx` oder eine `loading.tsx` liegt darüber (Falle 23). Wird der Zoom-Fall nur in der CI rot, zuerst prüfen, ob wirklich jeder Klick über `klickeWennRuhig` läuft (Falle 12).

Ankerschritt (Global Constraints) für `playwright.config.ts`: `git grep -n "playwright.config.ts:[0-9]" -- src scripts e2e`.

- [ ] **Step 4: Commit**

```bash
git add e2e/kommplan.spec.ts e2e/gruppen.json playwright.config.ts
git commit -S -m "test(kommplan): e2e für Zugang, Betrachter und Druck A4" -m "Zoom misst den Faktor gegen eine ruhige Ausgangslage, Klicks warten auf die umgebrochene Hülle. Seitenzahl des PDF gleich der Blattzahl, jedes Blatt quer und nicht leer, Druckdialog erst nach der Schrift; ohne Gruppe, auf fremdem Host und für unbekannte Pläne 404 — auch auf der Druckroute; /robots.txt ohne Login-Umweg." -m "DRK-500" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 23: Release-Notiz und alle Tore

**Files:**
- Create: `src/app/m/portal/_lib/neuigkeiten/notizen/kommplan/2026-09-30-kommunikationsplaene-ansehen.ts`
- Modify: `src/app/m/portal/_lib/neuigkeiten/register.ts`

**Interfaces:**
- Consumes: `absatz`, `Releasenotiz` (`portal/_lib/neuigkeiten/typen`).

Pflicht, weil ein neues Modul ein neues Feature ist (`CLAUDE.md`, „Release Notes"): ein Absatz, Du-Form, Wege mit den Wörtern vom Bildschirm, kein Datei-/Ticketname, keine Werbewörter, kein Markdown. `datum` ist der Rollout-Tag — steht er beim Merge fest und weicht ab, Dateiname und `datum` im selben Commit nachziehen.

- [ ] **Step 1: Notiz schreiben**

`src/app/m/portal/_lib/neuigkeiten/notizen/kommplan/2026-09-30-kommunikationsplaene-ansehen.ts`:
```ts
// Stilregeln für Notizen: CLAUDE.md, Abschnitt „Release Notes".
// Zielgruppe: Zugangs- und Admin-Gruppe der Kommunikationspläne (switcherGroupSources: ["access", "admin"]).
import { absatz, type Releasenotiz } from "@/app/m/portal/_lib/neuigkeiten/typen";

const notiz: Releasenotiz = {
  modul: "kommplan",
  slug: "kommunikationsplaene-ansehen",
  datum: "2026-09-30",
  titel: "Kommunikationspläne ansehen und drucken",
  inhalt: [
    absatz(
      "Unter „Kommunikationspläne“ findest du die Pläne und Fernmeldeskizzen deiner Einsätze als Diagramm, das sich selbst anordnet. " +
        "Du kannst hineinzoomen, Stellen einklappen und jeden Plan über „Drucken (A4 quer)“ ausgeben oder als PDF sichern.",
    ),
  ],
};

export default notiz;
```

`src/app/m/portal/_lib/neuigkeiten/register.ts`: Import
```ts
import kommunikationsplaeneAnsehen from "@/app/m/portal/_lib/neuigkeiten/notizen/kommplan/2026-09-30-kommunikationsplaene-ansehen";
```
nach den einsatzbuch-Importen, und `kommunikationsplaeneAnsehen,` als letzte Zeile in `NOTIZEN`. Danach der Ankerschritt (Global Constraints): `git grep -n "register.ts:[0-9]" -- src scripts e2e`.

- [ ] **Step 2: Notiztest**

Run: `pnpm vitest run src/app/m/portal/_lib/neuigkeiten`
Expected: PASS (Register vollständig, Titel ≤ 60, Block ≤ 320 Zeichen, kein Werbewort, kein Markdown, erster Block ein Absatz).

- [ ] **Step 3: Alle Tore**

Nacheinander, jeweils Exit-Code prüfen (nicht die Ausgabe greppen); bei Load > 10 einzelne rote Dateien allein wiederholen, bevor ein Urteil fällt:

Run: `uptime && pnpm typecheck && pnpm lint && pnpm anker:neu`
Expected: Exit 0. `anker:neu` meldet keinen neuen Zeilenanker (in neuem Code stehen nur Namensanker).

Run: `pnpm vitest run`
Expected: PASS. Rot in `src/lfs-medien.test.ts` → LFS-Objekte fehlen im Worktree (`git lfs pull`), kein Befund dieser Arbeit. Rot im zip-Route-Test nur lokal auf macOS/Node 24 → bekannt, kein Befund.

Run: `pnpm build`
Expected: Exit 0; Routen `/m/kommplan`, `/m/kommplan/p/[id]`, `/m/kommplan/p/[id]/druck/a4` — und **kein** dynamisches Segment direkt unter `/m/kommplan` (Abweichung 11).

Run: `pnpm exec playwright test e2e/kommplan.spec.ts`
Expected: PASS. Danach prüfen, dass kein `next dev` aus diesem Lauf offen bleibt.

- [ ] **Step 4: Commit**

```bash
git add src/app/m/portal/_lib/neuigkeiten/notizen/kommplan src/app/m/portal/_lib/neuigkeiten/register.ts
git commit -S -m "feat(kommplan): Release-Notiz Kommunikationspläne" -m "DRK-500" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

Nicht pushen; den Stand an den Hauptlauf melden (ClickUp pflegt der Hauptlauf).

---

## Abdeckung der Spec (Selbstprüfung)

| Spec | Aufgabe |
|---|---|
| §3 Modulrahmen, Dreieck, Registry, Icon, Gruppen, `_lib/zugang.ts`, Audit | 17, 18 |
| §4.1 Tabellen (alle) | 18 (`freigabe` als `plan_freigabe`, Abweichung 9) |
| §4.2 Planinhalt, Invarianten, Kontaktreihenfolge; `kanaele` (Abweichung 12) | 3, 5, 10, 13 |
| §5.1 Karte, Arimo-Metriken ohne DOM | 2, 5 |
| §5.2 Ebenen, Busse je Verbindung, Stiele, Reingold-Tilford, keine Kreuzung | 6, 7, 9, 11 |
| §5.3 Seitenstellen | 8 |
| §5.4 Einheiten, zwei Spalten ab 10 | 5, 9 |
| §5.5 Kamm (nach Breite, über die ganze Kinderreihe, Abweichung 13) | 7, 9, 11 |
| §5.6 Papier: 6 pt, Aufteilung per Ebenenschnitt, Nummern in Lesereihenfolge (Abweichung 14), Kopf/Fuß/Legende | 12, 14, 21 |
| §5.7 Bildschirm: Zoom, Verschieben, Einklappen | 7, 20 |
| §6.6 reine Operationen (nur Einfügen in Phase 1) | 4 |
| §7 Zeichen-Generat, `<symbol>`/`<use>`, Versions- und SHA-Test, Arimo | 1, 14, 20 |
| §6.1 Routen (`p/[id]` statt `[id]`, Abweichung 11) | 19, 20, 21, 22 |
| §8.1 Druck A4 (A3, SVG-Export, Schwarzweiß: Phase 5) | 21 |
| §9 Aufteilung im Modul | Dateistruktur |
| §10 Tests: Operationen, Golden, Eigenschaften, Generat, DOM, e2e (Phase-1-Teil) | 3–16, 19–22 |
| §11 Phase 1: Seed, Release-Notiz | 18, 23 |

## Kritik eingearbeitet/verworfen

Zweite Fassung nach dem Review vom 30.09.2026. Jeder Befund ist am Code bzw. am Paketstand nachgeprüft; keiner war widerlegt. Zwei sind bewusst nur teilweise übernommen (Begründung in der Zeile).

| # | Befund | Prüfung | Entscheidung |
|---|---|---|---|
| 1 | `kerningEm` ist optional → TS2722 in `text.test.ts` | `catalog/node_modules/@einsatzzeichen/core/dist/text-metrics.d.ts`: `kerningEm?(…)`; `ARIMO_TEXT_METRICS: TextMetrics` aus core 1.5.0 | eingearbeitet: `m.kerningEm?.(…) ?? 0` (Task 2) |
| 2 | Planliste als nackte `Datentabelle` mit antd-`Tag` | `docs/design/README.md` „Mobil" (DRK-451) und Farbvokabular; Vorbild `portal/admin/service-table.tsx` | eingearbeitet: `Kartentabelle` mit `aria-label`, `rowKey`, `leer`, `karte`; Chips `.kp-chip` mit Fläche/Text-Paar; leerer `Card`-Zweig entfällt; Test je Darstellung (`tr[data-row-key]`, `li[data-karte-key]`) (Task 19) |
| 3 | `pnpm add` im Workspace-Root ohne `-w` | `pnpm-workspace.yaml` führt `packages: ["apps/*"]` | eingearbeitet: `pnpm add -D -w --save-exact …` (Task 1, Global Constraints) |
| 4 | Erwartete Generatgröße falsch | eigener Probelauf mit derselben Zerlegung: 232 Rezepte, 222 215 Byte | eingearbeitet: „≈ 200–260 KB" / „≈ 20–60 KB", „rund 220 KB" in Abweichung 1, Kopfkommentar `grenze.test.ts`, Global Constraints |
| 5 | `/m/kommplan/[id]` fängt `/robots.txt` u. ä. ab | `core/routing.ts`: `PASSTHROUGH` ohne `robots.txt`, Rewrite nach `/m/${mod.key}${rest}`; kein anderes Modul hat `[…]` direkt unter `/m/<key>` | eingearbeitet als **Abweichung 11**: Präfix `p/[id]` (Vorbild `aufgaben/a/[id]`); alle Pfade, Links, `git add`, Build-Erwartungen, e2e; e2e prüft `/robots.txt` anonym → 404 ohne Login-Umweg |
| 6 | `zugang.ts` in Task 17 besteht `typecheck` erst nach Task 18 | `auditLoginRequired(module: AuditModule)`; `AUDIT_MODULES` ohne `kommplan`; `catalog.ts` mit `satisfies Record<AuditModule, …>`; kein weiterer Test koppelt Registry und `AUDIT_MODULES` (`git grep`) | eingearbeitet: `zugang.ts` samt Test ans Ende von Task 18 (neuer Step 5); Task 17 fährt `pnpm typecheck`; Global Constraint „jeder Commit besteht typecheck" |
| 7 | e2e-Zoom misst die Einpassung statt des Klicks; Falle 12 | `Betrachter.tsx` leitet die Ansicht per ResizeObserver ab; `klickeWennRuhig`/`warteAufSpaltenaufteilung` in `e2e/fixtures.ts` | eingearbeitet: `warteAufSpaltenaufteilung`, `klickeWennRuhig` für jeden Klick, ruhige Ausgangslage per `expect.poll`, Zusicherung nachher = vorher × 1,25; Umschalter vor dem Zoomen (Task 22) |
| 8 | Einfügen in `bootstrap.ts` verschiebt zutreffende Anker; weder Nachziehen noch Stehenlassen regelkonform | heute zutreffend: `bootstrap.ts:103` (`assertHostConfig`), `:105-107` (`errors`), `:125-133` (`migrateAllModules`), `:138` (`shouldSeed`); Fundstellen `bootstrap.test.ts` (5×) und `radio/_lib/boot.ts` | eingearbeitet: Ankerschritt als Global Constraint für jede Datei mit Einfügung; in Task 18 die sechs Anker einzeln in Namensform, Zeilenzahl gleich, `pnpm anker:neu` im Grün-Schritt |
| 9 | Falle 23 nur für Host/Gruppe, nicht für das 404 des Plans | `ladePlanOder404` stand nur in den Seiten; e2e prüfte 404 nur am Betrachter | eingearbeitet: `(intern)/p/[id]/layout.tsx` mit `ladePlanOder404` für Betrachter **und** Druck; zusätzlich die Riegel davor, weil Layouts und Seiten parallel rendern (sonst verriete ein 404 statt Login anonym, ob es den Plan gibt); e2e prüft auch `/p/gibt-es-nicht/druck/a4` |
| 10 | `grenze.test.ts` lückenhaft (Direktive, Importformen, transitiv) | `core/shell/icons.test.ts` (`ohneKommentare`, `traegtClientDirektive`, vier Importformen); die alte Regex sah nur `from "…"` | eingearbeitet: Direktive mit Kommentar-Abzug und beiden Anführungszeichen, vier Importformen, reine Typ-Importe ausgenommen, transitive Verfolgung von jeder Client-Insel; Selbsttest der Hilfsfunktionen und eine Gegenprobe in Task 20 |
| 11 | `page:` am `<svg>` statt am gemeinsamen Vorfahren | `docs/design/fallen.md` Nr. 18; `lagerbuch/…/druck.css`, `.lb-ortbogen` | eingearbeitet: `page: kommplan-a4` an `.kp-druck`, Blätter nur `break-after`; e2e prüft jede PDF-Seite quer (Task 21, 22) |
| 12 | Aufteilung schneidet immer direkt unter der Wurzel | große Stab-Lage: TEL einziges `unter`-Kind → Blatt 1 = Stab + Verweis; ebenso alle drei Kommunikationsplan-Vorlagen | eingearbeitet als **Abweichung 14**: Ebenenschnitt von der tiefsten Ebene her, gierig innerhalb der Ebene, innere Schnitte fallen weg; Tests „LtS → EL → 5 EAL → je 8 EA" und „Stab-Lage: TEL auf Blatt 1 als Karte" (Task 12, 13) |
| 13 | Kamm-Budget je Busgruppe statt je Kinderreihe | Spec §5.5 „Kinderreihe einer Stelle"; Sackgasse bei drei Gruppen à fünf Blattkindern nachgerechnet (810 mm) | **teilweise**: Budget über alle Gruppen einer Stelle übernommen (breiteste kämmbare Gruppe schrumpft deterministisch, bis die Reihe passt; Terminierung begründet). **Nicht** übernommen: Gruppen über gemeinsame Kammreihen verteilen und nur eine allein zu breite Gruppe teilen — die Stiele späterer Gruppen müssten durch fremde Reihen, kreuzungsfrei nur mit Rücken auf beiden Seiten und ab drei Gruppen in unteren Reihen gar nicht; Spec §5.5 verlangt ausdrücklich „unter demselben Bus". Der Stielbeweis ist für mehrreihige Gruppen neben anderen nachgezogen (Task 7, 9) |
| 14 | Budget rechnet 46 mm je Kind statt der Blockbreite | zwei Einheitenspalten 88 mm, Seitenstapel 81 mm je Seite nachgerechnet | eingearbeitet: Umbruch nach Breite des Zeilenblocks (`zeilenblockBreite` = Seitenstapel + Block + Seitenstapel); Test „sechs à 88 mm und eines à 208 mm" → Reihen 3/3/1, ein Blatt ≥ 0,75 (Task 7, 9, 12) |
| 15 | Kanäle unter EA 1/2 als „Reserve" nachgebaut | Referenzbild OpenR: DMO 608/609 und R_UE_2 als Sechsecke in der Gasse unter den Abschnitten | eingearbeitet als **Abweichung 12**: `Stelle.kanaele` (JSON-Feld, Vorgabe `[]`, Invarianten), Sechsecke in der Gasse über den Einheiten, Netz `<stelle>#kanal`; „Reserve" nur ohne jede Verwendung; OpenR-Nachbau und `vorlagen.test.ts` angepasst (Task 3, 4, 5, 8, 10, 13, 16) |
| 16 | Geometrieprüfung rein negativ | mit `linien: []` keine Befunde | eingearbeitet: `pruefeVerbindungen(z, inhalt)` (Abwürfe, Seitenzweige, Sechsecke an ihrer Linie, Netze zusammenhängend und an ihrer Karte) samt Mutationstests; in Eigenschafts-, Beispiel-, Aufteilungstests und Vorschau (Task 11–13, 15) |
| 17 | Kein Test erzeugt nachweislich einen Kamm | freier Generator: Zufallsrekursivbaum, flache Grade | eingearbeitet: Generator-Modus `stab`, 60 Seeds je Ziel, eigener Fall „mindestens ein Drittel kämmt"; feste Fälle: Seitenstellen an Kammkindern, zwei Kammgruppen nebeneinander unter Karte mit Einheiten und Kanal, drei Gruppen à fünf, breite Kinder, Kammkinder mit Unterstellen (Task 11) |
| 18 | Blattnummern in Schnittreihenfolge | große Stab-Lage: „→ Blatt 6, 5, 4, 3" von links nach rechts nachvollzogen | eingearbeitet: zweiter Durchlauf nummeriert in Tiefensuche, Schnitte in Lesereihenfolge; Test mit Teilbäumen 2/11/5/8 (die alte Fassung wäre dort rot) (Task 12) |
| 19 | Mehrere Wurzeln nie auf eigene Blätter | alle Wurzeln geschützt, Auftrag mit `ankerId: null` nie erzeugt | eingearbeitet: auf einem Blatt ohne Anker mit mehreren Wurzeln sind die Wurzeln Kandidaten (Tiefe 0); Test zwei Wurzeln à ~260 mm (Task 12) |
| 20 | Prüfung zu nachsichtig (Berühren, Kante, Mindestabstand, Sechseck-Ausnahme) | `ueberlappen`/`durchsticht` streng, Ausnahme `k.netz === l.netz` für jede Strecke des Netzes | eingearbeitet: 2 mm zwischen Kästen verschiedener Stellen, 0,75 mm zwischen parallelen Linien verschiedener Netze, Linie auf fremder Kante ist ein Befund, Sechseck-Ausnahme nur für den waagerechten Zweig durch seine Mitte (gewählt statt eines Netzes je Seitenzweig — der Zweig hängt an einer Schiene). Damit das Packen die 2 mm selbst einhält, zählt `kontur.abstand` Stufen mit weniger als 2 mm Höhenabstand als überlappend (`LUFT_Y`, Task 6) — sonst meldete die Prüfung, was die Engine baut |
| 21 | Leerer Titel ungetestet, Platzhalter druckt | `titelVoll = … "(ohne Titel)"` lief in `umbrechen` und damit aufs Papier | eingearbeitet als **Abweichung 15**: leere Titelzeile mit Mindestkopf; Platzhalter nur in `<title>` und `aria-label`; Test mit `""` und `"   "`, Generator erzeugt leere Titel (Task 5, 11, 14, 20) |
| 22 | Kammkinder mit Teilbäumen landen auf Enkelhöhe; Rücken an der ganzen Kontur | `oben += max(t.unten) + 8`, `ruecken = minX(s.kontur) − 3` | eingearbeitet (erste Alternative): nur Gruppen aus Blattkindern kämmen (`kammfaehig` über die Sicht, auch Verweise und Eingeklappte zählen als Blatt). Damit besteht die Kontur einer Kammgruppe nur aus Zeilenblöcken, der Rücken richtet sich also von selbst an ihnen aus. Test „12 EAL mit je 3 EA auf dem Bildschirm → eine Reihe" (Task 7, 9, 11) |

## Abweichungen bei der Umsetzung

Was sich erst am laufenden Code zeigte. Jede Zeile nennt die Aufgabe, in der die Entscheidung fiel.

| # | Aufgabe | Befund | Entscheidung |
|---|---|---|---|
| U1 | 5 | `sechseckMass` kürzt die Beschriftung auf `maxBreite − FEST`; die gekürzte Zeile bleibt je nach Zeichenbreite ein paar Zehntel darunter, das Sechseck also schmaler als 44 mm (Test erwartet genau `maxBreite`) | gekürzt heißt „braucht die ganze Breite": das Sechseck steht dann auf `maxBreite` |
| U2 | 15 | Sichtprüfung: die frei komponierten Zusatzzeichen (`labels.center`) setzt der Katalog 1.5.0 **weiß auf Gelb** und ohne den Balken „im Einsatz" — neben dem EL-Zeichen kaum lesbar | Zusatzzeichen entstehen aus dem gerenderten Rezept D.1.4 („Einsatzleitung im Einsatz"), nur das Kürzel wird getauscht (Schriftgröße schrumpft, falls es breiter als EL ist); der Generator bricht ab, wenn D.1.4 das Kürzel nicht genau einmal trägt. `generat.test.ts` sichert „kein weißes Kürzel" |
| U3 | 15 | Sichtprüfung: Einzelwörter wie „Transportorganisation" oder „Bereitstellungsraum" brachen in 9,5 pt mitten im Wort („Transportorganisati / on") | Die Titelschrift schrumpft in halben Punkten bis 8 pt, wenn ein Wort sonst nicht in die Zeile passt (`KARTE.titelMin`, `titelStufe`); die kleinste Schrift der Zeichnung bleibt 8 pt, `MIN_MASSSTAB` unverändert |
| U4 | 15 | Was selbst bei 8 pt nicht passt („Katastrophenschutzleitung"), brach hart ohne Trennzeichen | `umbrechen(…, trennstrich)`: bei Titeln endet ein harter Bruch auf „-"; Kontaktwerte (Rufnummern) trennen weiter ohne Strich, dort wäre ein Strich eine falsche Ziffernfolge |
| U5 | 15 | Sichtprüfung: die unterste Einheit stand 1 mm über der Legendenzeile | `BLATT.legendeRand` 2 → 4 mm (2 mm Luft über der Legende); OpenR bleibt mit Maßstab 0,782 auf einem Blatt |
| U6 | 19–21 | Unter Dauerlast (Load 60–70) brauchte `pnpm build` rund 15 Minuten | Tasks 19, 20 und 21 teilen sich einen Build über den gemeinsamen Endstand (Routen `/m/kommplan`, `/m/kommplan/p/[id]`, `/m/kommplan/p/[id]/druck/a4`, kein dynamisches Segment direkt unter der Modulwurzel); jeder Einzelcommit besteht typecheck, lint und vitest |
| U7 | 22 | Der zweite `devLogin` auf `feedback.localtest.me` im Fall „unbekannter Plan" fand kein Formular: mit der noch gültigen Sitzung zeigt `/login` dort ein 404 | Der Fall „fremder Suite-Host" steht als eigener Test mit frischer Sitzung (Vorbild `einsatzbuch.spec.ts`); die e2e lief gegen den gebauten Stand (`E2E_VORGEBAUT=1`, wie die CI), 6 Tests grün |
