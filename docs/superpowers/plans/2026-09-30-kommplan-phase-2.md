# Kommunikationspläne — Lieferphase 2: Diagramm-Editor — Umsetzungsplan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Modul-Admins legen in der Planliste über „Neu" einen Plan an und bearbeiten ihn danach direkt im Diagramm: Auswahl mit Griffen, Flyin je Stelle, Planangaben und Verbindungen, Tastatur, gleitendes Layout, Autosave mit Versionsprüfung und Konflikthinweis, Rückgängig/Wiederholen. Die Zugangsgruppe sieht weiter nur den Betrachter.

**Architecture:** Alle Änderungen am Plandokument laufen über reine, validierende Operationen in `_lib/plan/` (Spec §6.6). Die Editor-Insel (`_ui/editor/`, `"use client"`) hält einen Client-Stapel von Dokumenten (Rückgängig) und eine Speicher-Warteschlange, die ~1 s nach der letzten Änderung eine Server Action mit `version` aufruft. Die Server Actions (`_actions/`) prüfen Host, Anmeldung und `isModuleAdmin` und schreiben mit einem atomaren `UPDATE … WHERE version = ?`. Das Audit bündelt Inhaltsänderungen über eine neue Tabelle `plan_bearbeitung` (eine Zeile je Plan und Person, höchstens ein neuer Eintrag je 15 Minuten). Zoom und Verschieben löst der Plan aus dem Betrachter in eine gemeinsame `Flaeche`, die beide Inseln nutzen.

**Tech Stack:** Next.js 16 (App Router, RSC, Server Actions), React 19 mit React Compiler, TypeScript, zod 4, Drizzle + better-sqlite3, antd 6, Vitest 4 (jsdom über `src/app/m/qr/_lib/test-dom.tsx`), Playwright.

**Spec:** `docs/superpowers/specs/2026-09-30-modul-kommunikationsplaene-design.md` (§6.1–6.4, §6.6, §9, §10, §11 Phase 2). Der Umsetzungsplan der Phase 1 (`docs/superpowers/plans/2026-09-30-kommplan-phase-1.md`) gilt samt seiner Abschnitte „Abweichungen von der Spec" und „Abweichungen bei der Umsetzung" weiter; wo dieser Plan davon abweicht, steht es unten ausdrücklich.

**Ticket:** DRK-500. Ticketnummer in jeden Commit-Body. ClickUp pflegt der Hauptlauf, nicht diese Umsetzung.

## Global Constraints

- Arbeitsverzeichnis ausschließlich `/Users/rubeen/dev/personal/drk/iuk-suite/.claude/worktrees/drk-363-8c5335`; nie `cd` ins Haupt-Repo. Nicht pushen. ClickUp nicht anfassen.
- Deutsche Texte mit echten Umlauten (`ä ö ü Ä Ö Ü ß`); Bezeichner, Datei- und Branchnamen ASCII (`~/.claude/CLAUDE.md`).
- `CLAUDE.md` gilt vollständig. Für diese Phase besonders: Falle 1 (kein antd-Compound in RSC — `Input.TextArea`, `Form.Item` usw. nur in Client-Inseln), 4 (kein `size` auf Bedienelementen; die FullShell gibt 44 px), 5 (eigenes CSS gegen antd nur mit einer Klasse mehr und Kommentar), 6 (Werte für Server Components nie aus `"use client"`-Modulen), 7 (keine `@ant-design/icons` in RSC; im Editor nur in Client-Inseln oder gar nicht), 9 (Server Actions direkt importieren, nie als Prop reichen), 10 (im e2e jede ausgelöste Anfrage per `page.waitForResponse` prüfen, Warmlauf vor dem ersten POST), 12 (`klickeWennRuhig`, `warteAufSpaltenaufteilung`), 13 (`flyinBreite()` für jede `Drawer`, Raster darin per `auto-fit`/`minmax`), 22 (`warteAufGestreamteInhalte` vor Zählungen), 23 (neue Prüfungen, die ein 404 erzeugen, gehören ins Layout oberhalb jeder `loading.tsx`; diese Phase legt keine `loading.tsx` an).
- Zugriffsschutz (`CLAUDE.md`): jede Server Action prüft Host, Anmeldung und `darfKommplanBearbeiten` (`isModuleAdmin`) selbst und löst die Plan-ID aus der Datenbank auf (IDOR). Oberfläche und Action wenden **dasselbe** Prädikat auf denselben Viewer an: der Knopf „Neu" und der Editor erscheinen nur bei `darfKommplanBearbeiten(viewer.groups)`.
- Server-Action-Dateien beginnen **auf Byte 0** mit `"use server";` (doppelte Anführungszeichen, kein Kopfkommentar davor) — `src/core/audit/coverage.test.ts` erkennt sie nur so. Jede exportierte Action steht in `src/core/audit/coverage-manifest.json`: schreibende als `{ "kind": "context", "via": "<Name>" }` mit `withAuditContext` im Rumpf, lesende als `{ "kind": "excluded", "reason": "…" }`. Typen und Schemata liegen in `_lib/`, nie in der Action-Datei (dort wäre jeder Export eine Action).
- Keine `revalidatePath`-Aufrufe aus dem Autosave: die Editor-Insel ist die Quelle der Wahrheit bis zum Neuladen. Der Editor wird aus den Props **einmal** gesät und über `key={plan.id}` an den Plan gebunden.
- React Compiler ist an (`next.config.ts`, `reactCompiler: true`), `react-hooks/set-state-in-effect` ist aktiv: kein `setState` im Effekt-Rumpf; Timer, Speicherläufe und Zustandswechsel gehören in Ereignis-Rückrufe (Vorbild `_ui/betrachter/Betrachter.tsx`, Kopfkommentar).
- Hell/Dunkel über `<html data-theme>` (Cookie `iuk-theme-pref`), nie `prefers-color-scheme`. Eigenes Markup nimmt `--kp-*`, nie `--ant-*` (Falle 2). Warnungen sind `type="warning"`, nie `type="error"` (Falle 3); Feldfehler als Text plus `aria-invalid`, nicht rot.
- Nie `timeZone` als Literal auf Modulebene; Uhrzeiten über `zeitFormat("de-DE", …)` aus `core/zeit`. `plan.datum` ist ein Kalendertag als Mitternacht UTC und wird mit `timeZone: "UTC"` im Aufruf formatiert bzw. als `YYYY-MM-DD` über `toISOString().slice(0, 10)` gelesen (Ausnahme aus `CLAUDE.md`).
- Tests, die dieser Plan an eine bestehende Testdatei „anhängt", bringen ihre Importe mit: diese in die **vorhandenen** Importzeilen derselben Module zusammenführen (keine zweite `import … from "./operationen"`-Zeile; `pnpm lint` meldet doppelte Importe).
- DOM-Tests nur über das Harness `src/app/m/qr/_lib/test-dom.tsx` (`mount`, `rerender`, `unmount`, `query`, `queryAll`, `fill`, `click`, `clickElement`, `queryPortal`, `clickPortal`, `existsPortal`), Kopfzeile `// @vitest-environment jsdom`.
- Kommentaranker in neuem Code nennen **Namen**, nie Zeilen (`pnpm anker:neu` bricht die CI). **Ankerschritt** für jede bestehende Datei, in die dieser Plan Zeilen einfügt oder aus der er Zeilen entfernt (`src/core/audit/catalog.ts`, `src/core/audit/coverage-manifest.json`, `src/app/m/kommplan/_db/schema.ts`, `src/app/m/kommplan/_lib/plan/schema.ts`, `src/app/m/kommplan/_lib/plan/operationen.ts`, `src/app/m/kommplan/_lib/zugang.ts`, `src/app/m/kommplan/_lib/plaene.ts`, `src/app/m/kommplan/_lib/zeichen/zeichen.ts`, `src/app/m/kommplan/_lib/zeichen/grundlagen.ts`, `src/app/m/kommplan/_lib/plan/kontakte.ts`, `src/app/m/kommplan/grenze.test.ts`, `src/app/m/kommplan/_ui/betrachter/Betrachter.tsx`, `src/app/m/kommplan/_ui/zeichnung/Karte.tsx`, `src/app/m/kommplan/_ui/zeichnung/Zeichnung.tsx`, `src/app/m/kommplan/_ui/zeichnung/Sechseck.tsx`, `src/app/m/kommplan/_ui/kommplan.css`, `src/app/m/kommplan/(intern)/page.tsx`, `src/app/m/kommplan/(intern)/p/[id]/page.tsx`, `src/app/m/kommplan/_lib/layout/eigenschaften.test.ts`, `e2e/gruppen.json`, `docs/superpowers/specs/2026-09-30-modul-kommunikationsplaene-design.md`): vor dem Commit `git grep -n "<dateiname>:[0-9]" -- src scripts e2e docs` und `pnpm anker:drift <datei>`. Ein Anker, der **vor** der Änderung zutraf und hinter der Änderungsstelle liegt, wird in derselben Zeile in die Namensform umgeschrieben. Nie eine Zahl nachziehen, nie eine Zeile dazu oder weg (Kommentaranker-Regel 4). Schon vorher veraltete Anker bleiben, wie sie sind. Stand der Planung (`git grep` am 30.09.2026): in keine dieser Dateien zeigt heute ein Zeilenanker — der Schritt ist trotzdem je Commit zu fahren, parallele Arbeit kann einen hinzufügen.
- Signierte Commits (`git commit -S`), Kopfzeile nach Conventional Commits: `feat(kommplan): …` für neue Funktion, `fix(kommplan): …`, `test(kommplan): …`, `refactor(kommplan): …`, `docs: …`. Body mit einer Zeile `DRK-500` und am Ende `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Last: andere Sessions laufen parallel. Vor jedem Urteil über einen roten Test `uptime` prüfen; bei Load > 10 die betroffene Datei einzeln fahren oder den CI-Weg (`pnpm e2e:gebaut` bzw. `E2E_VORGEBAUT=1`). Fremde Prozesse nie beenden. Kein `pnpm dev` offen lassen; ein von `next dev` umgeschriebenes `next-env.d.ts` mit `git checkout -- next-env.d.ts` zurücksetzen. `scripts/backup-sidecar.test.ts` ist auf macOS rot (DRK-501) — nicht dein Thema.
- Tore vor dem Abschluss: `pnpm typecheck` (Exit-Code prüfen) · `pnpm lint` · `pnpm vitest run` · `pnpm build` · `pnpm exec playwright test e2e/kommplan.spec.ts e2e/kommplan-editor.spec.ts`. **Jeder Commit besteht `pnpm typecheck`.** Aufgaben, die Routen oder Server Actions anlegen, fahren zusätzlich `pnpm build` (die RSC-Grenze und `"use server"`-Exporte prüft nur der Build).
- Next-Guides vor dem ersten Code, der die API benutzt, lesen: `node_modules/next/dist/docs/01-app/01-getting-started/07-mutating-data.md`, `…/02-guides/server-actions.md` (Abschnitt „Body size limit": 1 MB je Aufruf; Server Actions laufen im Client **nacheinander**), `…/03-api-reference/01-directives/use-server.md`, `…/03-api-reference/04-functions/use-router.md`. antd-6-APIs (`Drawer`, `Segmented`, `Select`, `AutoComplete`, `DatePicker`, `Switch`) im Zweifel über das antd-MCP (`ToolSearch` „antd", dann `antd_doc`/`antd_demo`).

## Entscheidungen dieser Phase (Abweichungen von Spec und Phase-1-Plan)

1. **Audit gebündelt statt je Autosave** (ersetzt Abweichung 7 des Phase-1-Plans, Vorgabe des Hauptlaufs): Die Spalten `inhalt`, `version`, `aktualisiert_am`, `aktualisiert_von` der Tabelle `plan` werden `unauditedColumns`; ihr Update-Trigger feuert nur noch für `id`, `titel`, `typ`, `anlass`, `datum`, `ist_vorlage`, `archiviert_am` — Anlegen, Archivieren (Phase 4) und jede Änderung der Planangaben bleiben also je eine Zeile. Inhaltsänderungen protokolliert die neue, auditierte Tabelle `plan_bearbeitung (plan_id, nutzer, seit)`, Primärschlüssel `(plan_id, nutzer)`: das erste Speichern einer Person an einem Plan legt die Zeile an (Audit `create`), ein Speichern **15 Minuten oder mehr** nach `seit` setzt `seit` neu (Audit `update`), alles dazwischen schreibt nichts. So gilt „höchstens eine Audit-Zeile je Person und Plan in einem 15-Minuten-Fenster" auch dann, wenn zwei Personen abwechselnd speichern — ein einzelnes Spaltenpaar am Plan hätte bei jedem Wechsel geschrieben. Migration `0001` (generiert, Trigger von Hand wie `lagerbuch/_db/migrations/0005_artikel_kategorie.sql`).
2. **Spec §10 „Einfügen verschiebt nichts links davon" ehrlich** (Vorgabe des Hauptlaufs): Die Zusage gilt nur innerhalb einer Ebene bzw. Busgruppe. Das `it.fails` in `_lib/layout/eigenschaften.test.ts` wird ein regulärer Test dessen, was gilt: die früheren Gruppen rücken **starr als Ganzes** (ein gemeinsames dx), kein y ändert sich, und die Elternstelle steht mittig über ihrer neuen Busspanne. Spec §10 bekommt den Satz, dass eine neue Kanalgruppe die Elternstelle neu zentriert.
3. **Planangaben (Titel, Art, Anlass, Datum) sind Spalten, keine Dokumentfelder** (§4.1): Sie werden im Flyin „Planangaben" mit „Übernehmen" gespeichert (eigene Action, je Übernahme eine Audit-Zeile), laufen aber durch **dieselbe** Speicher-Warteschlange wie der Inhalt, damit die Version nie auseinanderläuft. Sie sind nicht Teil von Rückgängig. Die Optionen `leerzeilen` und `vermerkVsNfD` liegen im Dokument (§4.2) und laufen über Rückgängig und Autosave; `qrAufDruck` und `schwarzweiss` bleiben Phase 5.
4. **Zeichen-Suche** (§6.4 „Suche über den Katalog-Index"): Das Rezept-Generat bleibt Server-only (Phase-1-Constraint). Die Planseite reicht dem Editor einen schlanken Index (`schluessel`, `titel`, `suchtext`, rund 20 KB) als Prop; die SVGs der gerade sichtbaren Treffer und neu gewählter Zeichen holt eine lesende Server Action `ladeZeichenAction` (höchstens 40 Schlüssel je Aufruf). „Zuletzt genutzt" merkt sich der Browser (`localStorage`, in `try/catch`, höchstens 8), ergänzt um die Zeichen, die der Plan schon benutzt.
5. **Griffe als HTML-Überlagerung über dem SVG**, nicht im SVG: sie behalten bei jedem Zoom 44 px Tapfläche (Falle 4, ARBEITSDICHTE) und sind echte `<button>`s mit Namen. Seitlich steht ein „+" mit dem Namen „Seitenstelle links von <Titel> anlegen" bzw. „… rechts …" (sichtbarer Text „+ Seitenstelle" wäre an einer Kartenkante zu breit); unten „+ Unterstelle", „+ Einheit" (die Einheitenspalte liegt direkt darunter) und „Bearbeiten". Ein Klick auf eine Karte wählt sie, ein zweiter Klick, ein Doppelklick, Enter oder „Bearbeiten" öffnen das Flyin.
6. **Seitenstellen tragen keine Unterstellen** (§4.2): an einer Seitenstelle fehlen die Griffe „+ Unterstelle" und „+ Seitenstelle"; `N` zeigt dort den Hinweis „Eine Seitenstelle trägt keine Unterstellen." und ändert nichts.
7. **Neue Unterstelle tritt dem Bus bei** (§5.2, bequem nach A1): sie übernimmt die Verbindung der in Anzeigereihenfolge letzten Unterstelle ihrer Elternstelle; ohne Geschwister hat sie keine Verbindung. Eine neue Seitenstelle hat keine Verbindung.
8. **Löschen entfernt den Teilbaum** samt Seitenstellen und Einheiten; Verbindungen bleiben stehen (unbenutzte werden in der Legende „Reserve"). Rückgängig statt Nachfrage (§6.3); der Hinweis nennt die Zahl der mitgelöschten Stellen und trägt einen Knopf „Rückgängig".
9. **Pfeiltasten** (§6.3 „Pfeile wandern durch den Baum"): ↑ zur Elternstelle, ↓ zur ersten sichtbaren Unterstelle, ←/→ zum Nachbarn in **Anzeigereihenfolge** der Geschwister (Busgruppen wie im Layout, `anzeigereihenfolge`), wobei jede Stelle von ihren Seitenstellen eingerahmt wird (`[…links, Stelle, …rechts]`). Das trägt auch über Kammreihen und gestapelte Seitenstellen, die keine gemeinsame y-Koordinate haben. Ohne Auswahl wählt die erste Pfeiltaste die erste Wurzel. Verschieben per Tastatur entfällt im Editor (Maus, Touch, Rad bleiben); `+`, `-`, `0` zoomen wie im Betrachter.
10. **Kanäle einer Stelle** (Phase-1-Abweichung 12, `Stelle.kanaele`) sind im Flyin unter „Verbindung" als Mehrfachauswahl bearbeitbar — sonst ließen sich Pläne wie OpenR im Editor nicht pflegen.
11. **Autosave** (§6.6): Die Warteschlange sendet ~1 s nach der letzten Änderung den **dann** aktuellen Stand, immer nur einen Aufruf gleichzeitig (Next reiht Server Actions ohnehin). Konflikt → Hinweis `type="warning"` mit „Neu laden" (lokalen Stand und Rückgängig-Stapel verwerfen, Serverstand übernehmen) oder „Meine Fassung behalten" (mit der Serverversion erneut senden, überschreibt). Solange ein Konflikt offen ist, wird nicht automatisch gespeichert. Ungespeicherte Änderungen halten das Schließen des Tabs per `beforeunload` auf.
12. **Drucken aus dem Editor** öffnet das Fenster synchron (`window.open("", "_blank")`, sonst greift der Popup-Blocker), wartet auf das Speichern und setzt dann die Adresse der Druckroute; misslingt das Speichern, schließt es das Fenster und zeigt den Hinweis.
13. **Telefon**: Die Gliederung (§6.5, einziger Bearbeitungsweg am Telefon) kommt in Phase 3. Bis dahin ist der Diagramm-Editor auch bei 390 px bedienbar (Flyin 92 vw, Griffe 44 px); der Umschalter zeigt „Gliederung" deaktiviert.
14. **Leerer Plan** nach „Neu": statt der Zeichnung steht „Dieser Plan hat noch keine Stellen." mit dem Knopf „Erste Stelle anlegen" (legt eine Wurzel an, wählt sie, öffnet das Flyin mit Fokus im Titel).
15. **Große Pläne**: Das Layout rechnet aus `useDeferredValue(inhalt)`, damit Tippen im Flyin auch an der großen Stab-Lage flüssig bleibt. Ein Plan an der Schemagrenze (500 Stellen) bleibt unter dem Aufruflimit von 1 MB (gemessen in Task 5, Step 1).

## Review Focus

1. **Der frisch angelegte, leere Plan** → keine Karte, keine Griffe, kein Absturz in Layout, Navigation oder Legende; „Erste Stelle anlegen" führt in den Normalfall. Gepinnt in `navigation.test.ts` (Task 8) und `Editor.test.tsx` (Task 14), e2e in Task 15 (`ersteStelle`).
2. **„Liste einfügen" mit über 60 Einheiten, zu langem Typ oder Rufnamen, Leerzeilen und Tabs** → die gültigen Zeilen werden nicht still gekürzt; die Liste wird abgewiesen, der Hinweis nennt die Zeile bzw. die Grenze, das Dokument bleibt unverändert. Gepinnt in `einfuegen.test.ts` und `einheiten.test.ts` (Task 4) und `StelleFlyin.test.tsx` (Task 12).
3. **Umhängen einer Stelle mit Unterstellen nach links/rechts, unter sich selbst oder unter einen eigenen Nachkommen** → abgewiesen mit Hinweis, Auswahl bietet solche Ziele gar nicht erst an. Gepinnt in `operationen.test.ts` (Task 3) und `StelleFlyin.test.tsx` (Task 12).
4. **Eine Verbindung, die nur als Kanal (`kanaele`) benutzt wird** → gilt als benutzt: nicht löschbar, nicht „Reserve". Gepinnt in `verbindungen.test.ts` (Task 3) und `PlanFlyin.test.tsx` (Task 13).
5. **Zwei Speicherwege gleichzeitig** (Planangaben übernehmen, während eine Inhaltsänderung wartet oder unterwegs ist) → kein falscher Konflikt, beide landen, die Version zählt genau zweimal hoch. Gepinnt in `speichern.test.ts` (Task 5) und `speicherer.test.ts` (Task 9).

---

## Dateistruktur

Im Folgenden steht `K` für `src/app/m/kommplan`.

```
K/
├── (intern)/
│   ├── page.tsx                      geändert: „Neu" nur für Bearbeitende
│   ├── NeuerPlan.tsx                 NEU "use client": Knopf + Drawer-Formular → Editor
│   └── p/[id]/page.tsx               geändert: Editor (Admin) oder Betrachter (Zugangsgruppe)
├── _actions/                         NEU
│   ├── plan.ts                       "use server": legePlanAnAction, speichereInhaltAction, speichereAngabenAction
│   └── zeichen.ts                    "use server": ladeZeichenAction (lesend)
├── _db/
│   ├── schema.ts                     geändert: planBearbeitung
│   └── migrations/0001_plan_bearbeitung.sql (+ meta/0001_snapshot.json, _journal.json)
├── _lib/
│   ├── angaben.ts                    NEU: Planangaben (zod), Kalendertag ↔ ms — beide Seiten
│   ├── ergebnis.ts                   NEU: Rückgabetypen der Actions — beide Seiten
│   ├── speichern.ts                  NEU (Server): legePlanAn, speichereInhalt, speichereAngaben, merkeBearbeitung
│   ├── plaene.ts                     geändert: GeladenerPlan trägt version und angaben
│   ├── zugang.ts                     geändert: requireKommplanBearbeitenAktion
│   ├── zeichen/zeichen.ts            geändert: zeichenIndex, symboleFuerSchluessel
│   └── plan/
│       ├── schema.ts                 geändert: LAENGE (Feldgrenzen als Konstanten)
│       ├── operationen.ts            geändert: Stellen einfügen/ändern/löschen/umhängen, Optionen
│       ├── verbindungen.ts           NEU: Nutzung, Reserve, anlegen/ändern/löschen, Kanäle
│       ├── einheiten.ts              NEU: Einheiten einfügen/ändern/löschen
│       └── einfuegen.ts              NEU: Parser „Liste einfügen" (Phase 3 ergänzt die Gliederung)
├── _ui/
│   ├── kommplan.css                  geändert: Editor, Griffe, Gleiten, reduzierte Bewegung
│   ├── betrachter/
│   │   ├── Flaeche.tsx               NEU "use client": Zoom, Verschieben, Pinch, Rad, Klick auf Karte
│   │   ├── Legende.tsx               NEU: Legende unter der Fläche (aus Betrachter herausgelöst)
│   │   ├── Umschalter.tsx            NEU: Einklapp-Umschalter (aus Betrachter herausgelöst)
│   │   └── Betrachter.tsx            geändert: nutzt Flaeche, Legende, Umschalter
│   ├── zeichnung/Zeichnung.tsx, Karte.tsx, Sechseck.tsx   geändert: Option „gleitend"; lage.ts NEU
│   └── editor/                       NEU
│       ├── verlauf.ts                Rückgängig/Wiederholen (rein)
│       ├── tasten.ts                 Tastenbefehle (rein)
│       ├── navigation.ts             Pfeiltasten im Baum (rein)
│       ├── suche.ts                  Zeichen-Suche über den Index (rein)
│       ├── zuletzt.ts                „zuletzt genutzt" (localStorage)
│       ├── ids.ts                    neue IDs im Dokument
│       ├── speicherer.ts             Autosave-Warteschlange (ohne React)
│       ├── aendere.ts                Typ der Änderungs-Rückrufe der Flyins
│       ├── Editor.tsx                "use client": Zustand, Auswahl, Tastatur, Speichern
│       ├── Kopfleiste.tsx            Titel, Umschalter, Rückgängig/Wiederholen, Drucken, Status
│       ├── Griffe.tsx                Überlagerung mit den Griffen der Auswahl
│       ├── StelleFlyin.tsx           Flyin einer Stelle (Drawer + StelleFormular)
│       ├── ZeichenWahl.tsx           Zeichen-Suche im Flyin
│       ├── KontaktZeilen.tsx         Kontakte im Flyin
│       ├── StellenLage.tsx           Untersteht/Lage (Umhängen)
│       ├── VerbindungWahl.tsx        Verbindung zur Elternstelle, Kanäle
│       ├── EinheitenListe.tsx        Einheiten im Flyin, „Liste einfügen"
│       └── PlanFlyin.tsx             Planangaben, Optionen, Verbindungen
e2e/kommplan-editor.spec.ts           NEU
```

Geändert außerhalb des Moduls: `src/core/audit/catalog.ts`, `src/core/audit/coverage-manifest.json`, `src/app/m/portal/admin/audit/labels.ts` (nur innerhalb der bestehenden kommplan-Zeile), `e2e/gruppen.json`, `docs/superpowers/specs/2026-09-30-modul-kommunikationsplaene-design.md` (§10), `src/app/m/portal/_lib/neuigkeiten/notizen/kommplan/2026-09-30-kommunikationsplaene-ansehen.ts` (nur Titel und Text).

---

### Task 1: Spec §10 ehrlich — die Einfüge-Eigenschaft sagt, was gilt

**Files:**
- Modify: `docs/superpowers/specs/2026-09-30-modul-kommunikationsplaene-design.md` (§10, Punkt „Eigenschaftstests")
- Modify: `K/_lib/layout/eigenschaften.test.ts` (Kommentarblock „OFFEN …" und `it.fails(…)` ersetzen)

**Interfaces:**
- Consumes: `zufallsPlan`, `zeichne`, `pruefeAlles`, `baueBaum`, `nachkommen`, `anzeigereihenfolge`, `OHNE_VERBINDUNG`, `fuegeStelleEin`, `fuegeVerbindungEin`, `kaemmt`, `umgebungFuer` (alle schon in der Testdatei importiert bzw. definiert).
- Produces: nichts für spätere Aufgaben.

Die Engine ändert sich nicht. Dieser Test hält das Verhalten fest, das der bisher als `it.fails` notierte Fall zeigt, und formuliert es als Zusage (Entscheidung 2).

- [ ] **Step 1: Den offenen Fall durch einen regulären Test ersetzen**

In `K/_lib/layout/eigenschaften.test.ts` den Kommentarblock, der mit `* OFFEN (Spec §10 „Einfügen einer Stelle verschiebt nichts links von ihr")` beginnt, samt dem folgenden `it.fails("Einfügen verschiebt über Gruppengrenzen nichts, was links steht (Seed 70, neue Gruppe) — offen", …)` vollständig ersetzen durch:

```ts
/**
 * Spec §10, wie es gilt (Umsetzungsplan Phase 2, Entscheidung 2): Einfügen verschiebt nichts links
 * der neuen Stelle INNERHALB ihrer Ebene und Busgruppe. Über Gruppengrenzen gilt das nicht: eine
 * NEUE Kanalgruppe unter s14 (Seed 70) zentriert s14 neu über seiner Busspanne, dadurch wächst die
 * linke Kontur der Gruppe von s14 unter s0, und das Gruppenpacken setzt diese Gruppe als GANZES
 * weiter rechts an — samt s12, das links der neuen Stelle steht. Zugesichert wird: kein y ändert
 * sich, die Zeichnung bleibt sauber (Eltern mittig über der Busspanne, keine Überlappung, keine
 * Kreuzung), die früheren Gruppen unter s0 bleiben untereinander starr, und die frühere Gruppe von
 * s14 rückt starr, also mit EINEM gemeinsamen dx.
 */
it("Seed 70, neue Kanalgruppe unter s14: Eltern neu zentriert, die Gruppe von s14 rückt starr als Ganzes", () => {
  const inhalt = zufallsPlan(70, { stellen: 25 });
  const kinder = baueBaum(inhalt).unter("s14");
  const neu = fuegeStelleEin(fuegeVerbindungEin(inhalt, { id: "vneu", art: "tmo", bezeichnung: "NEU" }),
    { id: "neu", titel: "N", eltern: "s14", verbindungId: "vneu", reihenfolge: Math.max(...kinder.map((k) => k.reihenfolge)) + 1 });
  // Vorbedingungen wie in den Fällen darüber: kein Kamm, gleiche Zeilen
  expect(kaemmt(inhalt, "bildschirm") || kaemmt(neu, "bildschirm")).toBe(false);
  expect(JSON.stringify(umgebungFuer(neu, "bildschirm").zeilen)).toBe(JSON.stringify(umgebungFuer(inhalt, "bildschirm").zeilen));

  const vorher = zeichne(inhalt, "bildschirm"), nachher = zeichne(neu, "bildschirm");
  expect(befundeVon(nachher, neu).map((b) => b.text), erklaere(70, neu, "nach dem Einfügen")).toEqual([]);
  const yVorher = new Map(vorher.karten.map((k) => [k.id, k.y]));
  for (const k of nachher.karten) if (k.id !== "neu") expect(k.y, `y von ${k.id}`).toBeCloseTo(yVorher.get(k.id)!, 6);

  const nachBaum = baueBaum(neu);
  const geschwister = anzeigereihenfolge(nachBaum.unter("s0"));
  const s14 = nachBaum.stelle("s14")!;
  const frueher = geschwister.slice(0, geschwister.findIndex((g) => g.id === "s14"));
  const gruppe = (g: Stelle) => g.verbindungId ?? OHNE_VERBINDUNG;
  const teilbaum = (gs: Stelle[]) => gs.flatMap((g) => [g.id, ...nachkommen(nachBaum, g.id).map((n) => n.id)]);
  const andere = teilbaum(frueher.filter((g) => gruppe(g) !== gruppe(s14)));
  const eigene = teilbaum(frueher.filter((g) => gruppe(g) === gruppe(s14)));
  expect(eigene, "s12 steht links der neuen Stelle in der Gruppe von s14").toContain("s12");
  expect(andere.length, "es gibt eine frühere Gruppe, gegen die die Gruppe von s14 rückt").toBeGreaterThan(0);

  const x = (z: Zeichnungsdaten, id: string) => z.karten.find((k) => k.id === id)!.x;
  const dx = (id: string) => x(nachher, id) - x(vorher, id);
  // frühere Gruppen untereinander starr
  if (andere.length > 1) expect(relativ(nachher, andere)).toEqual(relativ(vorher, andere));
  // die frühere Gruppe von s14 starr: EIN gemeinsames dx für alle ihre Karten
  for (const id of eigene) expect(dx(id), `dx von ${id}`).toBeCloseTo(dx(eigene[0]), 6);
  // und genau deshalb gilt die starke Fassung nicht: gegenüber den früheren Gruppen rückt sie
  expect(Math.abs(dx(eigene[0]) - dx(andere[0]))).toBeGreaterThan(1);
});
```

- [ ] **Step 2: Laufen lassen**

Run: `pnpm vitest run src/app/m/kommplan/_lib/layout/eigenschaften.test.ts -t "Seed 70"`
Expected: PASS. Schlägt eine der beiden Vorbedingungs-Zusagen (`toContain("s12")`, `andere.length > 0`) fehl, stimmt die Beschreibung des Falls im alten Kommentar nicht mehr: `alsGliederung(neu)` ausgeben, den Fall nachlesen und die Mengen an den tatsächlichen Baum anpassen — **nicht** die Zusagen zu starr/mittig/y abschwächen.

- [ ] **Step 3: Spec §10 anpassen**

In `docs/superpowers/specs/2026-09-30-modul-kommunikationsplaene-design.md`, §10, die Zeilen

```
  - Eigenschaftstests auf Zufallsbäumen: keine Überlappung, keine Kreuzung, Eltern mittig über der
    Busspanne, Einfügen einer Stelle verschiebt nichts links von ihr, Aufteilung deckt jede Stelle
    genau einmal ab.
```

ersetzen durch (gleiche Zeilenzahl ist hier nicht verlangt — die Spec trägt keine Zeilenanker; trotzdem vorher `git grep -n "modul-kommunikationsplaene-design.md:[0-9]"` prüfen):

```
  - Eigenschaftstests auf Zufallsbäumen: keine Überlappung, keine Kreuzung, Eltern mittig über der
    Busspanne, Einfügen einer Stelle verschiebt innerhalb ihrer Ebene und Busgruppe nichts links von
    ihr, Aufteilung deckt jede Stelle genau einmal ab. Über Gruppengrenzen gilt das nicht: eine neue
    Kanalgruppe zentriert die Elternstelle neu über ihrer Busspanne, und die frühere Gruppe rückt
    dabei als Ganzes; y-Koordinaten bleiben.
```

- [ ] **Step 4: Ganze Datei und Typecheck**

Run: `pnpm vitest run src/app/m/kommplan/_lib/layout/eigenschaften.test.ts && pnpm typecheck; echo "typecheck exit $?"`
Expected: PASS, kein `it.fails` mehr in der Datei (`grep -c "it.fails" src/app/m/kommplan/_lib/layout/eigenschaften.test.ts` → 0), typecheck exit 0.

- [ ] **Step 5: Commit**

```bash
git add docs/superpowers/specs/2026-09-30-modul-kommunikationsplaene-design.md src/app/m/kommplan/_lib/layout/eigenschaften.test.ts
git commit -S -m "test(kommplan): Einfüge-Eigenschaft über Gruppengrenzen ehrlich formuliert

Eine neue Kanalgruppe zentriert die Elternstelle neu; die frühere Gruppe
rückt starr als Ganzes. Spec §10 nennt das jetzt, das it.fails ist ein
regulärer Test dessen, was gilt.

DRK-500

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Feldgrenzen und Stellen-Operationen (einfügen, ändern, löschen, Optionen)

**Files:**
- Modify: `K/_lib/plan/schema.ts` (Konstanten `LAENGE`, `GRENZE`; Schema nutzt sie)
- Modify: `K/_lib/plan/operationen.ts`
- Test: `K/_lib/plan/operationen.test.ts`, `K/_lib/plan/schema.test.ts`

**Interfaces:**
- Consumes: `planInhaltSchema`, `PlanInhalt`, `Stelle`, `Lage`, `PlanOptionen` (schema.ts), `baueBaum`, `nachkommen` (baum.ts), `anzeigereihenfolge` (`_lib/layout/gruppen.ts`, importiert nur Typen aus `plan/` — kein Zyklus).
- Produces (alle rein, Eingabe unverändert, Ausgabe gültig oder `PlanFehler`):
  - `LAENGE = { titel: 200, leiter: 120, kontakt: 200, typ: 40, rufname: 80, bezeichnung: 60 } as const`
  - `GRENZE = { stellen: 500, verbindungen: 200, kontakte: 30, einheiten: 60, kanaele: 12 } as const`
  - `fuegeWurzelEin(inhalt: PlanInhalt, id: string): PlanInhalt`
  - `fuegeUnterstelleEin(inhalt: PlanInhalt, elternId: string, id: string): PlanInhalt`
  - `fuegeSeitenstelleEin(inhalt: PlanInhalt, elternId: string, seite: "links" | "rechts", id: string): PlanInhalt`
  - `type StellenAenderung = Partial<Pick<Stelle, "titel" | "leiter" | "hervorheben" | "zeichen" | "kontakte" | "kanaele" | "verbindungId">>`
  - `aendereStelle(inhalt: PlanInhalt, id: string, aenderung: StellenAenderung): PlanInhalt`
  - `loescheStelle(inhalt: PlanInhalt, id: string): { inhalt: PlanInhalt; entfernt: number }` (`entfernt` = Zahl der Stellen einschließlich der gelöschten selbst)
  - `setzeOptionen(inhalt: PlanInhalt, aenderung: Partial<Pick<PlanOptionen, "leerzeilen" | "vermerkVsNfD">>): PlanInhalt`
  - `stelleOder(inhalt: PlanInhalt, id: string): Stelle` (wirft `PlanFehler("Stelle … gibt es nicht")`)

- [ ] **Step 1: Failing tests**

An `K/_lib/plan/schema.test.ts` anhängen (innerhalb der Datei, eigener `describe`):

```ts
import { GRENZE, LAENGE } from "./schema";

describe("Feldgrenzen als Konstanten", () => {
  it("das Schema weist genau jenseits der Grenze ab", () => {
    const basis = { schema: 1, optionen: { leerzeilen: false, vermerkVsNfD: true, qrAufDruck: false, schwarzweiss: false }, verbindungen: [] };
    const stelle = (titel: string) => ({ id: "w", eltern: null, lage: "unter", reihenfolge: 0, zeichen: null, titel, leiter: null,
      hervorheben: false, verbindungId: null, kanaele: [], kontakte: [], einheiten: [] });
    expect(planInhaltSchema.safeParse({ ...basis, stellen: [stelle("x".repeat(LAENGE.titel))] }).success).toBe(true);
    expect(planInhaltSchema.safeParse({ ...basis, stellen: [stelle("x".repeat(LAENGE.titel + 1))] }).success).toBe(false);
    expect(GRENZE.einheiten).toBe(60);
  });
});
```

(`planInhaltSchema` ist in `schema.test.ts` bereits importiert; falls nicht, mit in den Import aufnehmen.)

An `K/_lib/plan/operationen.test.ts` anhängen:

```ts
import { baue } from "../beispiele/bau";
import {
  aendereStelle, fuegeSeitenstelleEin, fuegeUnterstelleEin, fuegeWurzelEin, loescheStelle, setzeOptionen, stelleOder,
} from "./operationen";

const V = [
  { id: "v1", art: "tmo" as const, bezeichnung: "R_UE_2" },
  { id: "v2", art: "tmo" as const, bezeichnung: "R_UE_3" },
];
const plan = () => baue({
  verbindungen: V,
  stellen: [
    { id: "el", titel: "EL" },
    { id: "a", titel: "EA 1", eltern: "el", verbindung: "v2" },
    { id: "b", titel: "EA 2", eltern: "el", verbindung: "v1" },
    { id: "b1", titel: "Trupp", eltern: "b" },
    { id: "bs", titel: "Seite", eltern: "b", lage: "rechts" },
    { id: "l", titel: "KatSL", eltern: "el", lage: "links" },
  ],
});

describe("Stellen einfügen", () => {
  it("die erste Wurzel eines leeren Plans: leerer Titel, keine Verbindung", () => {
    const p = fuegeWurzelEin(leererPlan(), "w");
    expect(p.stellen).toEqual([expect.objectContaining({ id: "w", eltern: null, lage: "unter", titel: "", verbindungId: null, reihenfolge: 0 })]);
    expect(fuegeWurzelEin(p, "w2").stellen[1].reihenfolge).toBe(1);
  });
  it("eine Unterstelle tritt dem Bus der in Anzeigereihenfolge letzten Unterstelle bei (Entscheidung 7)", () => {
    // Anzeigereihenfolge unter el: Gruppe v2 (a, kleinste reihenfolge 0), dann Gruppe v1 (b)
    const p = fuegeUnterstelleEin(plan(), "el", "neu");
    expect(stelleOder(p, "neu")).toMatchObject({ eltern: "el", lage: "unter", verbindungId: "v1", titel: "", reihenfolge: 2 });
  });
  it("ohne Geschwister hat die neue Unterstelle keine Verbindung", () => {
    expect(stelleOder(fuegeUnterstelleEin(plan(), "a", "neu"), "neu").verbindungId).toBeNull();
  });
  it("unter einer Seitenstelle gibt es keine Unterstelle und keine Seitenstelle", () => {
    expect(() => fuegeUnterstelleEin(plan(), "bs", "neu")).toThrow("Eine Seitenstelle trägt keine Unterstellen.");
    expect(() => fuegeSeitenstelleEin(plan(), "l", "rechts", "neu")).toThrow("Eine Seitenstelle trägt keine Seitenstellen.");
  });
  it("Seitenstellen links und rechts, ohne Verbindung, ans Ende ihrer Seite", () => {
    let p = fuegeSeitenstelleEin(plan(), "el", "links", "l2");
    p = fuegeSeitenstelleEin(p, "el", "rechts", "r1");
    expect(stelleOder(p, "l2")).toMatchObject({ eltern: "el", lage: "links", reihenfolge: 1, verbindungId: null });
    expect(stelleOder(p, "r1")).toMatchObject({ lage: "rechts", reihenfolge: 0 });
  });
  it("unbekannte Elternstelle und doppelte ID sind PlanFehler", () => {
    expect(() => fuegeUnterstelleEin(plan(), "gibt-es-nicht", "neu")).toThrow(PlanFehler);
    expect(() => fuegeUnterstelleEin(plan(), "el", "a")).toThrow("ID doppelt: a");
  });
});

describe("Stellen ändern und löschen", () => {
  it("ändert nur die genannten Felder; unbekannte Stelle ist ein PlanFehler", () => {
    const p = aendereStelle(plan(), "a", { titel: "EA Nord", leiter: "Jana", hervorheben: true });
    expect(stelleOder(p, "a")).toMatchObject({ titel: "EA Nord", leiter: "Jana", hervorheben: true, verbindungId: "v2" });
    expect(() => aendereStelle(plan(), "x", { titel: "?" })).toThrow("Stelle x gibt es nicht");
  });
  it("prüft die Invarianten: ein unbekannter Kanal oder ein zu langer Titel wird abgewiesen", () => {
    expect(() => aendereStelle(plan(), "a", { kanaele: ["fehlt"] })).toThrow("Kanal fehlt existiert nicht");
    expect(() => aendereStelle(plan(), "a", { titel: "x".repeat(LAENGE.titel + 1) })).toThrow(PlanFehler);
  });
  it("löscht den Teilbaum samt Seitenstellen; Verbindungen bleiben (Entscheidung 8)", () => {
    const { inhalt, entfernt } = loescheStelle(plan(), "b");
    expect(inhalt.stellen.map((s) => s.id).sort()).toEqual(["a", "el", "l"]);
    expect(entfernt).toBe(3);
    expect(inhalt.verbindungen.map((v) => v.id)).toEqual(["v1", "v2"]);
  });
  it("löscht die Wurzel samt allem", () => {
    expect(loescheStelle(plan(), "el")).toEqual({ inhalt: { ...plan(), stellen: [] }, entfernt: 6 });
  });
  it("Optionen: nur leerzeilen und vermerkVsNfD", () => {
    const p = setzeOptionen(plan(), { leerzeilen: true, vermerkVsNfD: false });
    expect(p.optionen).toEqual({ leerzeilen: true, vermerkVsNfD: false, qrAufDruck: false, schwarzweiss: false });
  });
  it("ist rein", () => {
    const vorher = plan();
    const kopie = structuredClone(vorher);
    fuegeUnterstelleEin(vorher, "el", "n1");
    aendereStelle(vorher, "a", { titel: "X" });
    loescheStelle(vorher, "b");
    expect(vorher).toEqual(kopie);
  });
});
```

Dazu `LAENGE` in den Import aus `./schema` aufnehmen (`import { LAENGE } from "./schema";`).

- [ ] **Step 2: Rot sehen**

Run: `pnpm vitest run src/app/m/kommplan/_lib/plan`
Expected: FAIL — `fuegeWurzelEin` u. a. sind nicht exportiert, `LAENGE`/`GRENZE` fehlen.

- [ ] **Step 3: Feldgrenzen in `schema.ts`**

Direkt unter `export type Lage = …;` einfügen:

```ts
/**
 * Feldgrenzen — dieselben Zahlen im Schema und an den Eingabefeldern des Editors (`maxLength`),
 * damit Tippen nie in einen Schemafehler läuft (Review Focus Phase 2, Punkt 2).
 */
export const LAENGE = { titel: 200, leiter: 120, kontakt: 200, typ: 40, rufname: 80, bezeichnung: 60 } as const;
export const GRENZE = { stellen: 500, verbindungen: 200, kontakte: 30, einheiten: 60, kanaele: 12 } as const;
```

und die Zahlen im Schema durch die Konstanten ersetzen (gleiche Werte, gleiche Zeilen):
`kontaktSchema`: `wert: z.string().max(LAENGE.kontakt)`; `einheitSchema`: `typ: z.string().max(LAENGE.typ), rufname: z.string().max(LAENGE.rufname)`; `stelleSchema`: `titel: z.string().max(LAENGE.titel)`, `leiter: z.string().max(LAENGE.leiter).nullable()`, `kanaele: z.array(id).max(GRENZE.kanaele).default([])`, `kontakte: z.array(kontaktSchema).max(GRENZE.kontakte)`, `einheiten: z.array(einheitSchema).max(GRENZE.einheiten)`; `verbindungSchema`: `bezeichnung: z.string().max(LAENGE.bezeichnung)`; `planInhaltSchema`: `stellen: z.array(stelleSchema).max(GRENZE.stellen)`, `verbindungen: z.array(verbindungSchema).max(GRENZE.verbindungen)`.

- [ ] **Step 4: Operationen in `operationen.ts`**

Kopfkommentar der Datei anpassen (gleiche Zeilenzahl): „Phase 1 braucht nur Einfügen (Seed, Beispiele, Tests); Umhängen, Löschen und das Gliederungs-Einfügen folgen in Phase 2 und 3 in dieser Datei." → „Phase 2 ergänzt Einfügen, Ändern, Löschen und Umhängen für den Editor; das Gliederungs-Einfügen folgt in Phase 3 in `einfuegen.ts`."

Importe erweitern:

```ts
import { anzeigereihenfolge } from "../layout/gruppen";
import { baueBaum, nachkommen } from "./baum";
import { planInhaltSchema, type Lage, type PlanInhalt, type PlanOptionen, type Stelle, type Verbindung } from "./schema";
```

Am Dateiende anhängen:

```ts
export function stelleOder(inhalt: PlanInhalt, id: string): Stelle {
  const s = inhalt.stellen.find((x) => x.id === id);
  if (!s) throw new PlanFehler(`Stelle ${id} gibt es nicht`);
  return s;
}

/** Eine neue, leere Stelle — der Titel kommt danach im Flyin (Spec §6.3: „sofort gesetzt"). */
function leer(id: string, eltern: string | null, lage: Lage, reihenfolge: number, verbindungId: string | null): Stelle {
  return {
    id, eltern, lage, reihenfolge, zeichen: null, titel: "", leiter: null, hervorheben: false,
    verbindungId, kanaele: [], kontakte: [], einheiten: [],
  };
}

export function fuegeWurzelEin(inhalt: PlanInhalt, id: string): PlanInhalt {
  return gueltig({ ...inhalt, stellen: [...inhalt.stellen, leer(id, null, "unter", naechsteReihenfolge(inhalt, null, "unter"), null)] });
}

/**
 * Entscheidung 7 (Phase 2): die neue Unterstelle tritt dem Bus der in ANZEIGEREIHENFOLGE letzten
 * Unterstelle bei — so steht sie rechts außen an einem vorhandenen Bus statt eine neue Gruppe zu
 * öffnen. `anzeigereihenfolge` ist dieselbe Funktion, nach der das Layout die Gruppen setzt.
 */
export function fuegeUnterstelleEin(inhalt: PlanInhalt, elternId: string, id: string): PlanInhalt {
  const eltern = stelleOder(inhalt, elternId);
  if (eltern.lage !== "unter") throw new PlanFehler("Eine Seitenstelle trägt keine Unterstellen.");
  const letzte = anzeigereihenfolge(baueBaum(inhalt).unter(elternId)).at(-1);
  const neu = leer(id, elternId, "unter", naechsteReihenfolge(inhalt, elternId, "unter"), letzte?.verbindungId ?? null);
  return gueltig({ ...inhalt, stellen: [...inhalt.stellen, neu] });
}

export function fuegeSeitenstelleEin(inhalt: PlanInhalt, elternId: string, seite: "links" | "rechts", id: string): PlanInhalt {
  const eltern = stelleOder(inhalt, elternId);
  if (eltern.lage !== "unter") throw new PlanFehler("Eine Seitenstelle trägt keine Seitenstellen.");
  return gueltig({ ...inhalt, stellen: [...inhalt.stellen, leer(id, elternId, seite, naechsteReihenfolge(inhalt, elternId, seite), null)] });
}

export type StellenAenderung = Partial<Pick<Stelle, "titel" | "leiter" | "hervorheben" | "zeichen" | "kontakte" | "kanaele" | "verbindungId">>;

export function aendereStelle(inhalt: PlanInhalt, id: string, aenderung: StellenAenderung): PlanInhalt {
  stelleOder(inhalt, id);
  return gueltig({ ...inhalt, stellen: inhalt.stellen.map((s) => (s.id === id ? { ...s, ...aenderung } : s)) });
}

/** Entscheidung 8: der ganze Teilbaum samt Seitenstellen; Verbindungen bleiben (unbenutzt = Reserve). */
export function loescheStelle(inhalt: PlanInhalt, id: string): { inhalt: PlanInhalt; entfernt: number } {
  stelleOder(inhalt, id);
  const weg = new Set([id, ...nachkommen(baueBaum(inhalt), id).map((s) => s.id)]);
  return { inhalt: gueltig({ ...inhalt, stellen: inhalt.stellen.filter((s) => !weg.has(s.id)) }), entfernt: weg.size };
}

export function setzeOptionen(inhalt: PlanInhalt, aenderung: Partial<Pick<PlanOptionen, "leerzeilen" | "vermerkVsNfD">>): PlanInhalt {
  return gueltig({ ...inhalt, optionen: { ...inhalt.optionen, ...aenderung } });
}
```

- [ ] **Step 5: Grün sehen**

Run: `pnpm vitest run src/app/m/kommplan && pnpm typecheck; echo "typecheck exit $?"`
Expected: PASS (auch `grenze.test.ts`: `_lib/plan` importiert nichts aus `next/*`), typecheck exit 0.

- [ ] **Step 6: Ankerschritt und Commit**

Ankerschritt für `schema.ts` und `operationen.ts` (Global Constraints). Dann:

```bash
git add src/app/m/kommplan/_lib/plan/schema.ts src/app/m/kommplan/_lib/plan/schema.test.ts src/app/m/kommplan/_lib/plan/operationen.ts src/app/m/kommplan/_lib/plan/operationen.test.ts
git commit -S -m "feat(kommplan): Stellen einfügen, ändern und löschen als reine Planoperationen

Unterstelle tritt dem Bus der letzten Unterstelle bei, Seitenstellen
tragen nichts, Löschen nimmt den Teilbaum mit; Feldgrenzen als
Konstanten für Schema und Eingabefelder.

DRK-500

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Umhängen, Verbindungen und Kanäle

**Files:**
- Modify: `K/_lib/plan/operationen.ts` (`moeglicheEltern`, `haengeUm`)
- Create: `K/_lib/plan/verbindungen.ts`
- Test: `K/_lib/plan/operationen.test.ts`, `K/_lib/plan/verbindungen.test.ts`

**Interfaces:**
- Consumes: `stelleOder`, `aendereStelle`, `naechsteReihenfolge`, `PlanFehler`, `gueltig` (Task 2; `gueltig` wird dafür exportiert), `baueBaum`, `nachkommen`, `tiefensuche` (baum.ts).
- Produces:
  - `moeglicheEltern(inhalt: PlanInhalt, id: string): Stelle[]` — alle Stellen mit `lage === "unter"`, ohne die Stelle selbst und ohne ihre Nachkommen, in Tiefensuche-Reihenfolge.
  - `haengeUm(inhalt: PlanInhalt, id: string, ziel: { eltern: string | null; lage: Lage }): PlanInhalt`
  - `verbindungen.ts`: `interface Nutzung { eltern: number; kanal: number }`; `verbindungsNutzung(inhalt: PlanInhalt): Map<string, Nutzung>` (jede Verbindung des Plans hat einen Eintrag); `istReserve(inhalt: PlanInhalt, id: string): boolean`; `legeVerbindungAn(inhalt: PlanInhalt, v: Verbindung): PlanInhalt`; `aendereVerbindung(inhalt: PlanInhalt, id: string, aenderung: Partial<Pick<Verbindung, "art" | "bezeichnung">>): PlanInhalt`; `loescheVerbindung(inhalt: PlanInhalt, id: string): PlanInhalt`; `findeVerbindung(inhalt: PlanInhalt, bezeichnung: string, art: VerbindungsArt): Verbindung | undefined` (Bezeichnung getrimmt, Groß-/Kleinschreibung egal).

- [ ] **Step 1: Failing tests**

An `K/_lib/plan/operationen.test.ts` anhängen:

```ts
import { haengeUm, moeglicheEltern } from "./operationen";

describe("Umhängen (Spec §6.4 „Untersteht / Lage")", () => {
  it("bietet keine Ziele an, die einen Zyklus bildeten, und keine Seitenstellen", () => {
    expect(moeglicheEltern(plan(), "b").map((s) => s.id)).toEqual(["el", "a"]);
    expect(moeglicheEltern(plan(), "a").map((s) => s.id)).toEqual(["el", "b", "b1"]);
  });
  it("hängt eine Stelle samt Teilbaum um und setzt sie ans Ende der neuen Geschwister", () => {
    const p = haengeUm(plan(), "b", { eltern: "a", lage: "unter" });
    expect(stelleOder(p, "b")).toMatchObject({ eltern: "a", lage: "unter", reihenfolge: 0, verbindungId: "v1" });
    expect(stelleOder(p, "b1").eltern).toBe("b");
  });
  it("unter sich selbst oder einen eigenen Nachkommen: abgewiesen", () => {
    expect(() => haengeUm(plan(), "b", { eltern: "b", lage: "unter" })).toThrow("Eine Stelle kann nicht unter sich selbst oder einer eigenen Unterstelle stehen.");
    expect(() => haengeUm(plan(), "b", { eltern: "b1", lage: "unter" })).toThrow("Eine Stelle kann nicht unter sich selbst oder einer eigenen Unterstelle stehen.");
  });
  it("eine Stelle mit Unter- oder Seitenstellen kann nicht seitlich stehen", () => {
    expect(() => haengeUm(plan(), "b", { eltern: "el", lage: "rechts" })).toThrow("Eine Stelle mit Unter- oder Seitenstellen kann nicht seitlich stehen.");
    const p = haengeUm(plan(), "a", { eltern: "el", lage: "rechts" });
    expect(stelleOder(p, "a")).toMatchObject({ eltern: "el", lage: "rechts" });
  });
  it("seitlich braucht eine Elternstelle; oberste Ebene heißt immer unter", () => {
    expect(() => haengeUm(plan(), "a", { eltern: null, lage: "links" })).toThrow("Eine Seitenstelle braucht eine Elternstelle.");
    const p = haengeUm(plan(), "a", { eltern: null, lage: "unter" });
    expect(stelleOder(p, "a")).toMatchObject({ eltern: null, lage: "unter", reihenfolge: 1 });
  });
  it("unter eine Seitenstelle: abgewiesen", () => {
    expect(() => haengeUm(plan(), "a", { eltern: "bs", lage: "unter" })).toThrow("Eine Seitenstelle trägt keine Unterstellen.");
  });
  it("gleiches Ziel wie bisher: unverändert, Reihenfolge bleibt", () => {
    const vorher = plan();
    expect(haengeUm(vorher, "a", { eltern: "el", lage: "unter" })).toBe(vorher);
  });
});
```

`K/_lib/plan/verbindungen.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { baue } from "../beispiele/bau";
import { PlanFehler } from "./operationen";
import { LAENGE } from "./schema";
import {
  aendereVerbindung, findeVerbindung, istReserve, legeVerbindungAn, loescheVerbindung, verbindungsNutzung,
} from "./verbindungen";

const plan = () => baue({
  verbindungen: [
    { id: "v1", art: "tmo", bezeichnung: "R_UE_2" },
    { id: "v2", art: "dmo", bezeichnung: "DMO 608" },
    { id: "v3", art: "tmo", bezeichnung: "K_UE_2" },
  ],
  stellen: [
    { id: "el", titel: "EL" },
    { id: "a", titel: "EA 1", eltern: "el", verbindung: "v1", kanaele: ["v2"] },
    { id: "b", titel: "EA 2", eltern: "el", verbindung: "v1" },
  ],
});

describe("Verbindungen des Plans", () => {
  it("zählt Nutzung als Weg zur Elternstelle und als Kanal getrennt", () => {
    expect(Object.fromEntries(verbindungsNutzung(plan()))).toEqual({
      v1: { eltern: 2, kanal: 0 }, v2: { eltern: 0, kanal: 1 }, v3: { eltern: 0, kanal: 0 },
    });
  });
  it("Reserve ist nur, was weder Weg noch Kanal ist (Review Focus 4)", () => {
    expect(["v1", "v2", "v3"].map((id) => istReserve(plan(), id))).toEqual([false, false, true]);
  });
  it("legt an, ändert Art und Bezeichnung; leere oder zu lange Bezeichnung wird abgewiesen", () => {
    let p = legeVerbindungAn(plan(), { id: "v4", art: "draht", bezeichnung: "  Standleitung " });
    expect(p.verbindungen.at(-1)).toEqual({ id: "v4", art: "draht", bezeichnung: "Standleitung" });
    p = aendereVerbindung(p, "v4", { art: "telefon", bezeichnung: "Amt" });
    expect(p.verbindungen.at(-1)).toEqual({ id: "v4", art: "telefon", bezeichnung: "Amt" });
    expect(() => legeVerbindungAn(plan(), { id: "v5", art: "tmo", bezeichnung: "   " })).toThrow("Die Verbindung braucht eine Bezeichnung.");
    expect(() => aendereVerbindung(plan(), "v1", { bezeichnung: "x".repeat(LAENGE.bezeichnung + 1) })).toThrow(PlanFehler);
    expect(() => aendereVerbindung(plan(), "fehlt", { art: "tmo" })).toThrow("Verbindung fehlt gibt es nicht");
  });
  it("löscht nur Unbenutztes — auch ein reiner Kanal ist benutzt", () => {
    expect(loescheVerbindung(plan(), "v3").verbindungen.map((v) => v.id)).toEqual(["v1", "v2"]);
    expect(() => loescheVerbindung(plan(), "v1")).toThrow("„R_UE_2“ wird noch benutzt und lässt sich nicht löschen.");
    expect(() => loescheVerbindung(plan(), "v2")).toThrow("„DMO 608“ wird noch benutzt und lässt sich nicht löschen.");
  });
  it("findet eine vorhandene Verbindung beim Neu-Eintippen wieder (gleiche Art, Bezeichnung ohne Rücksicht auf Groß/klein)", () => {
    expect(findeVerbindung(plan(), " r_ue_2 ", "tmo")?.id).toBe("v1");
    expect(findeVerbindung(plan(), "R_UE_2", "dmo")).toBeUndefined();
  });
});
```

- [ ] **Step 2: Rot sehen**

Run: `pnpm vitest run src/app/m/kommplan/_lib/plan`
Expected: FAIL — `haengeUm`, `moeglicheEltern` und `verbindungen.ts` fehlen.

- [ ] **Step 3: Implementieren**

In `operationen.ts` die Funktion `gueltig` exportieren (`export function gueltig(…)`), den Import aus `./baum` um `tiefensuche` erweitern und anhängen:

```ts
/** Ziele für „Untersteht": keine Seitenstelle (trägt nichts), nicht die Stelle selbst, keiner ihrer Nachkommen. */
export function moeglicheEltern(inhalt: PlanInhalt, id: string): Stelle[] {
  const baum = baueBaum(inhalt);
  const aus = new Set([id, ...nachkommen(baum, id).map((s) => s.id)]);
  return tiefensuche(baum).filter((s) => s.lage === "unter" && !aus.has(s.id));
}

export function haengeUm(inhalt: PlanInhalt, id: string, ziel: { eltern: string | null; lage: Lage }): PlanInhalt {
  const s = stelleOder(inhalt, id);
  if (s.eltern === ziel.eltern && s.lage === ziel.lage) return inhalt;
  if (ziel.eltern === null && ziel.lage !== "unter") throw new PlanFehler("Eine Seitenstelle braucht eine Elternstelle.");
  const baum = baueBaum(inhalt);
  if (ziel.eltern !== null) {
    const eltern = stelleOder(inhalt, ziel.eltern);
    if (ziel.eltern === id || nachkommen(baum, id).some((n) => n.id === ziel.eltern)) {
      throw new PlanFehler("Eine Stelle kann nicht unter sich selbst oder einer eigenen Unterstelle stehen.");
    }
    if (eltern.lage !== "unter") throw new PlanFehler("Eine Seitenstelle trägt keine Unterstellen.");
  }
  if (ziel.lage !== "unter" && nachkommen(baum, id).length > 0) {
    throw new PlanFehler("Eine Stelle mit Unter- oder Seitenstellen kann nicht seitlich stehen.");
  }
  const reihenfolge = naechsteReihenfolge(inhalt, ziel.eltern, ziel.lage);
  return gueltig({ ...inhalt, stellen: inhalt.stellen.map((x) => (x.id === id ? { ...x, eltern: ziel.eltern, lage: ziel.lage, reihenfolge } : x)) });
}
```

`K/_lib/plan/verbindungen.ts`:

```ts
import { gueltig, PlanFehler } from "./operationen";
import type { PlanInhalt, Verbindung, VerbindungsArt } from "./schema";

/**
 * Die Verbindungen EINES Plans (Spec §4.2, §6.4). „Reserve" ist in der Legende, was weder Weg zur
 * Elternstelle (`verbindungId`) noch Kanal einer Stelle (`kanaele`, Phase-1-Abweichung 12) ist —
 * dieselbe Regel wie `legende()` in `_lib/layout/zeichne.ts`.
 */
export interface Nutzung { eltern: number; kanal: number }

export function verbindungsNutzung(inhalt: PlanInhalt): Map<string, Nutzung> {
  const n = new Map(inhalt.verbindungen.map((v) => [v.id, { eltern: 0, kanal: 0 }]));
  for (const s of inhalt.stellen) {
    if (s.verbindungId !== null) n.get(s.verbindungId)!.eltern += 1;
    for (const k of s.kanaele) n.get(k)!.kanal += 1;
  }
  return n;
}

export function istReserve(inhalt: PlanInhalt, id: string): boolean {
  const n = verbindungsNutzung(inhalt).get(id);
  return n !== undefined && n.eltern === 0 && n.kanal === 0;
}

function verbindungOder(inhalt: PlanInhalt, id: string): Verbindung {
  const v = inhalt.verbindungen.find((x) => x.id === id);
  if (!v) throw new PlanFehler(`Verbindung ${id} gibt es nicht`);
  return v;
}

function bezeichnung(roh: string): string {
  const b = roh.trim();
  if (b === "") throw new PlanFehler("Die Verbindung braucht eine Bezeichnung.");
  return b;
}

export function legeVerbindungAn(inhalt: PlanInhalt, v: Verbindung): PlanInhalt {
  return gueltig({ ...inhalt, verbindungen: [...inhalt.verbindungen, { ...v, bezeichnung: bezeichnung(v.bezeichnung) }] });
}

export function aendereVerbindung(inhalt: PlanInhalt, id: string, aenderung: Partial<Pick<Verbindung, "art" | "bezeichnung">>): PlanInhalt {
  verbindungOder(inhalt, id);
  const neu = aenderung.bezeichnung === undefined ? aenderung : { ...aenderung, bezeichnung: bezeichnung(aenderung.bezeichnung) };
  return gueltig({ ...inhalt, verbindungen: inhalt.verbindungen.map((v) => (v.id === id ? { ...v, ...neu } : v)) });
}

export function loescheVerbindung(inhalt: PlanInhalt, id: string): PlanInhalt {
  const v = verbindungOder(inhalt, id);
  if (!istReserve(inhalt, id)) throw new PlanFehler(`„${v.bezeichnung}“ wird noch benutzt und lässt sich nicht löschen.`);
  return gueltig({ ...inhalt, verbindungen: inhalt.verbindungen.filter((x) => x.id !== id) });
}

export function findeVerbindung(inhalt: PlanInhalt, bez: string, art: VerbindungsArt): Verbindung | undefined {
  const b = bez.trim().toLocaleLowerCase("de");
  return inhalt.verbindungen.find((v) => v.art === art && v.bezeichnung.trim().toLocaleLowerCase("de") === b);
}
```

- [ ] **Step 4: Grün sehen**

Run: `pnpm vitest run src/app/m/kommplan && pnpm typecheck; echo "typecheck exit $?"`
Expected: PASS, exit 0.

- [ ] **Step 5: Ankerschritt und Commit**

```bash
git add src/app/m/kommplan/_lib/plan/operationen.ts src/app/m/kommplan/_lib/plan/operationen.test.ts src/app/m/kommplan/_lib/plan/verbindungen.ts src/app/m/kommplan/_lib/plan/verbindungen.test.ts
git commit -S -m "feat(kommplan): Umhängen ohne Zyklen und Verbindungen des Plans verwalten

Löschen nur, wenn weder Weg noch Kanal; Reserve ist, was keines von
beidem ist.

DRK-500

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Einheiten und „Liste einfügen"

**Files:**
- Create: `K/_lib/plan/einheiten.ts`, `K/_lib/plan/einfuegen.ts`
- Test: `K/_lib/plan/einheiten.test.ts`, `K/_lib/plan/einfuegen.test.ts`

**Interfaces:**
- Consumes: `gueltig`, `stelleOder`, `PlanFehler` (Task 2/3), `GRENZE`, `LAENGE`, `Einheit` (schema.ts).
- Produces:
  - `einfuegen.ts`: `interface ListenEinheit { typ: string; rufname: string }`; `leseEinheitenliste(text: string): { einheiten: ListenEinheit[]; fehler: string[] }` — je nicht leere Zeile: Tabs und Mehrfachleerzeichen werden ein Leerzeichen, erstes Wort = Typ, Rest = Rufname („RTW RK UE 40-83-5" → `RTW` / `RK UE 40-83-5`). Fehler nennen die Zeilennummer (1-basiert, gezählt über alle Zeilen der Eingabe).
  - `einheiten.ts`: `fuegeEinheitenEin(inhalt: PlanInhalt, stelleId: string, neu: Einheit[]): PlanInhalt` (wirft `PlanFehler("Höchstens 60 Einheiten je Stelle — hier wären es N.")`); `aendereEinheit(inhalt, stelleId, einheitId, aenderung: Partial<Pick<Einheit, "typ" | "rufname" | "zeichen">>): PlanInhalt`; `loescheEinheit(inhalt, stelleId, einheitId): PlanInhalt`.

- [ ] **Step 1: Failing tests**

`K/_lib/plan/einfuegen.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { leseEinheitenliste } from "./einfuegen";
import { LAENGE } from "./schema";

describe("Liste einfügen (Spec §6.4)", () => {
  it("erstes Wort ist der Typ, der Rest der Rufname; Leerzeilen, Tabs und Mehrfachleerzeichen stören nicht", () => {
    expect(leseEinheitenliste("RTW RK UE 40-83-5\n\n  KTW\tRK UE 40-92-1  \r\nELW1   RK  UE 40-10-1\n")).toEqual({
      einheiten: [
        { typ: "RTW", rufname: "RK UE 40-83-5" },
        { typ: "KTW", rufname: "RK UE 40-92-1" },
        { typ: "ELW1", rufname: "RK UE 40-10-1" },
      ],
      fehler: [],
    });
  });
  it("ein einzelnes Wort ist ein Typ ohne Rufnamen", () => {
    expect(leseEinheitenliste("MTW").einheiten).toEqual([{ typ: "MTW", rufname: "" }]);
  });
  it("zu lange Typen und Rufnamen werden als Fehler mit Zeilennummer gemeldet, nicht gekürzt (Review Focus 2)", () => {
    const r = leseEinheitenliste(`RTW RK 1\n\n${"T".repeat(LAENGE.typ + 1)} X\nKTW ${"R".repeat(LAENGE.rufname + 1)}`);
    expect(r.fehler).toEqual([
      `Zeile 3: Der Typ ist länger als ${LAENGE.typ} Zeichen.`,
      `Zeile 4: Der Rufname ist länger als ${LAENGE.rufname} Zeichen.`,
    ]);
    expect(r.einheiten).toEqual([{ typ: "RTW", rufname: "RK 1" }]);
  });
  it("leere Eingabe: nichts, kein Fehler", () => {
    expect(leseEinheitenliste("  \n\t\n")).toEqual({ einheiten: [], fehler: [] });
  });
});
```

`K/_lib/plan/einheiten.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { baue } from "../beispiele/bau";
import { aendereEinheit, fuegeEinheitenEin, loescheEinheit } from "./einheiten";
import { PlanFehler, stelleOder } from "./operationen";
import { GRENZE } from "./schema";

const plan = () => baue({ stellen: [{ id: "ea", titel: "EA", einheiten: ["RTW RK 1"] }] });
const einheit = (id: string, typ = "KTW", rufname = "RK 2") => ({ id, typ, rufname, zeichen: null });

describe("Einheiten einer Stelle", () => {
  it("fügt am Ende an, ändert und löscht", () => {
    let p = fuegeEinheitenEin(plan(), "ea", [einheit("n1"), einheit("n2", "MTW", "RK 3")]);
    expect(stelleOder(p, "ea").einheiten.map((e) => e.id)).toEqual(["ea-e1", "n1", "n2"]);
    p = aendereEinheit(p, "ea", "n1", { rufname: "RK 9" });
    expect(stelleOder(p, "ea").einheiten[1]).toEqual({ id: "n1", typ: "KTW", rufname: "RK 9", zeichen: null });
    p = loescheEinheit(p, "ea", "ea-e1");
    expect(stelleOder(p, "ea").einheiten.map((e) => e.id)).toEqual(["n1", "n2"]);
  });
  it("mehr als 60 Einheiten: die ganze Liste wird abgewiesen, das Dokument bleibt (Review Focus 2)", () => {
    const viele = Array.from({ length: GRENZE.einheiten }, (_, i) => einheit(`x${i}`));
    expect(() => fuegeEinheitenEin(plan(), "ea", viele)).toThrow(`Höchstens ${GRENZE.einheiten} Einheiten je Stelle — hier wären es ${GRENZE.einheiten + 1}.`);
  });
  it("unbekannte Einheit oder Stelle: PlanFehler", () => {
    expect(() => aendereEinheit(plan(), "ea", "fehlt", { typ: "X" })).toThrow("Einheit fehlt gibt es an dieser Stelle nicht");
    expect(() => loescheEinheit(plan(), "fehlt", "ea-e1")).toThrow(PlanFehler);
  });
});
```

- [ ] **Step 2: Rot sehen**

Run: `pnpm vitest run src/app/m/kommplan/_lib/plan`
Expected: FAIL — Module fehlen.

- [ ] **Step 3: Implementieren**

`K/_lib/plan/einfuegen.ts`:

```ts
import { LAENGE } from "./schema";

/**
 * EINFÜGE-PARSER (Spec §6.4, §10). Phase 2: „Liste einfügen" der Einheiten — je Zeile erstes Wort
 * = Typ, Rest = Rufname. Phase 3 ergänzt hier die mehrzeilige Gliederung.
 *
 * NICHTS WIRD STILL GEKÜRZT: eine zu lange Angabe ist ein Fehler mit Zeilennummer, und die Oberfläche
 * übernimmt eine Liste nur ohne Fehler (Review Focus Phase 2, Punkt 2).
 */
export interface ListenEinheit { typ: string; rufname: string }

export function leseEinheitenliste(text: string): { einheiten: ListenEinheit[]; fehler: string[] } {
  const einheiten: ListenEinheit[] = [];
  const fehler: string[] = [];
  text.split(/\r?\n/).forEach((roh, i) => {
    const zeile = roh.replace(/\s+/g, " ").trim();
    if (zeile === "") return;
    const [typ, ...rest] = zeile.split(" ");
    const rufname = rest.join(" ");
    if (typ.length > LAENGE.typ) fehler.push(`Zeile ${i + 1}: Der Typ ist länger als ${LAENGE.typ} Zeichen.`);
    else if (rufname.length > LAENGE.rufname) fehler.push(`Zeile ${i + 1}: Der Rufname ist länger als ${LAENGE.rufname} Zeichen.`);
    else einheiten.push({ typ, rufname });
  });
  return { einheiten, fehler };
}
```

`K/_lib/plan/einheiten.ts`:

```ts
import { gueltig, PlanFehler, stelleOder } from "./operationen";
import { GRENZE, type Einheit, type PlanInhalt, type Stelle } from "./schema";

function mitEinheiten(inhalt: PlanInhalt, stelleId: string, f: (e: Einheit[]) => Einheit[]): PlanInhalt {
  stelleOder(inhalt, stelleId);
  return gueltig({ ...inhalt, stellen: inhalt.stellen.map((s): Stelle => (s.id === stelleId ? { ...s, einheiten: f(s.einheiten) } : s)) });
}

function einheitOder(liste: Einheit[], id: string): Einheit {
  const e = liste.find((x) => x.id === id);
  if (!e) throw new PlanFehler(`Einheit ${id} gibt es an dieser Stelle nicht`);
  return e;
}

export function fuegeEinheitenEin(inhalt: PlanInhalt, stelleId: string, neu: Einheit[]): PlanInhalt {
  const zahl = stelleOder(inhalt, stelleId).einheiten.length + neu.length;
  if (zahl > GRENZE.einheiten) throw new PlanFehler(`Höchstens ${GRENZE.einheiten} Einheiten je Stelle — hier wären es ${zahl}.`);
  return mitEinheiten(inhalt, stelleId, (alt) => [...alt, ...neu]);
}

export function aendereEinheit(inhalt: PlanInhalt, stelleId: string, einheitId: string, aenderung: Partial<Pick<Einheit, "typ" | "rufname" | "zeichen">>): PlanInhalt {
  return mitEinheiten(inhalt, stelleId, (alt) => {
    einheitOder(alt, einheitId);
    return alt.map((e) => (e.id === einheitId ? { ...e, ...aenderung } : e));
  });
}

export function loescheEinheit(inhalt: PlanInhalt, stelleId: string, einheitId: string): PlanInhalt {
  return mitEinheiten(inhalt, stelleId, (alt) => {
    einheitOder(alt, einheitId);
    return alt.filter((e) => e.id !== einheitId);
  });
}
```

- [ ] **Step 4: Grün sehen**

Run: `pnpm vitest run src/app/m/kommplan && pnpm typecheck; echo "typecheck exit $?"`
Expected: PASS, exit 0.

- [ ] **Step 5: Commit**

```bash
git add src/app/m/kommplan/_lib/plan/einheiten.ts src/app/m/kommplan/_lib/plan/einheiten.test.ts src/app/m/kommplan/_lib/plan/einfuegen.ts src/app/m/kommplan/_lib/plan/einfuegen.test.ts
git commit -S -m "feat(kommplan): Einheiten je Stelle und Parser für „Liste einfügen“

Erstes Wort Typ, Rest Rufname; zu lange Angaben und mehr als 60
Einheiten werden mit Zeilennummer abgewiesen statt gekürzt.

DRK-500

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Datenbank und Speicherlogik — `plan_bearbeitung`, Versionsprüfung, gebündeltes Audit

**Files:**
- Modify: `K/_db/schema.ts` (Tabelle `planBearbeitung`, Kopfkommentar)
- Create (generiert, dann von Hand ergänzt): `K/_db/migrations/0001_plan_bearbeitung.sql`, `K/_db/migrations/meta/0001_snapshot.json`; Modify: `K/_db/migrations/meta/_journal.json`
- Modify: `src/core/audit/catalog.ts` (`plan.unauditedColumns`, neuer Eintrag `plan_bearbeitung`), `src/app/m/portal/admin/audit/labels.ts` (innerhalb der bestehenden kommplan-Zeile)
- Create: `K/_lib/angaben.ts`, `K/_lib/ergebnis.ts`, `K/_lib/speichern.ts`
- Modify: `K/_lib/plaene.ts` (`lies` exportieren, `GeladenerPlan` um `version` und `angaben`, `TYP` aus `angaben.ts`)
- Test: `K/_lib/speichern.test.ts`, `K/_lib/angaben.test.ts`, `K/_lib/plaene.test.ts`, `K/_db/schema.test.ts` (unverändert grün), `src/core/audit/catalog.test.ts` (unverändert grün)

**Interfaces:**
- Consumes: `testDb` (`_lib/testDb.ts`), `seedLokalKommplan`, `leererPlan`, `leseInhalt`, `LAENGE`.
- Produces:
  - `angaben.ts` (beide Seiten, kein `next/*`): `PLAN_TYPEN = ["kommunikationsplan", "fernmeldeskizze"] as const`; `type PlanTyp`; `TYP_NAME: Record<PlanTyp, string>`; `interface Planangaben { titel: string; typ: PlanTyp; anlass: string | null; datum: string | null /* YYYY-MM-DD */ }`; `angabenSchema` (zod, trimmt, leere Zeichenkette → `null`); `LAENGE_ANLASS = 120`; `tagZuMs(tag: string): number`; `msZuTag(ms: number | null): string | null`; `feldFehlerAus(e: z.ZodError): FeldFehler`.
  - `ergebnis.ts` (nur Typen): `type FeldFehler = Record<string, string>`; `interface Speicherstand { version: number; inhalt: PlanInhalt | null; angaben: Planangaben; aktualisiertAm: number; aktualisiertVon: string }`; `type SpeicherErgebnis = { ok: true; version: number; aktualisiertAm: number } | { ok: false; grund: "konflikt"; stand: Speicherstand } | { ok: false; grund: "weg" } | { ok: false; grund: "ungueltig"; fehler: string; feldFehler?: FeldFehler }`; `type AnlageErgebnis = { ok: true; id: string } | { ok: false; fehler: string; feldFehler: FeldFehler }`.
  - `speichern.ts` (Server): `BEARBEITUNGSFENSTER_MS = 15 * 60 * 1000`; `interface Bearbeiter { nutzer: string; name: string }`; `merkeBearbeitung(db, planId, nutzer, jetzt: number): void`; `legePlanAn(db: KommplanDb, eingabe: unknown, wer: Bearbeiter, jetzt: number): AnlageErgebnis`; `speichereInhalt(db, eingabe: { id: string; version: number; inhalt: unknown }, wer, jetzt): SpeicherErgebnis`; `speichereAngaben(db, eingabe: { id: string; version: number; angaben: unknown }, wer, jetzt): SpeicherErgebnis`.
  - `plaene.ts`: `lies(zeile: PlanZeile)` exportiert; `GeladenerPlan` zusätzlich `version: number; angaben: Planangaben`.

- [ ] **Step 1: Größe eines Plans an der Schemagrenze messen (Entscheidung 15)**

Run:
```bash
pnpm exec tsx -e 'import { zufallsPlan } from "./src/app/m/kommplan/_lib/layout/zufall"; const p = zufallsPlan(4711, { stellen: 500, form: "stab" }); console.log(JSON.stringify(p).length, "Byte");'
```
Expected: deutlich unter 1 000 000 Byte (Aufruflimit der Server Actions laut `node_modules/next/dist/docs/01-app/02-guides/server-actions.md`). Die Zahl in den Kopfkommentar von `speichern.ts` schreiben (Platzhalter `<gemessen>` unten ersetzen). Liegt sie über 500 000 Byte, **anhalten** und dem Hauptlauf melden — dann braucht `next.config.ts` `serverActions.bodySizeLimit`.

- [ ] **Step 2: Failing tests**

`K/_lib/angaben.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { angabenSchema, msZuTag, tagZuMs } from "./angaben";

describe("Planangaben", () => {
  it("trimmt, macht aus Leerem null und prüft den Kalendertag", () => {
    expect(angabenSchema.parse({ titel: "  Einsatz  ", typ: "fernmeldeskizze", anlass: "  ", datum: "" }))
      .toEqual({ titel: "Einsatz", typ: "fernmeldeskizze", anlass: null, datum: null });
    expect(angabenSchema.safeParse({ titel: " ", typ: "kommunikationsplan", anlass: null, datum: null }).success).toBe(false);
    expect(angabenSchema.safeParse({ titel: "X", typ: "kommunikationsplan", anlass: null, datum: "2026-02-30" }).success).toBe(false);
    expect(angabenSchema.safeParse({ titel: "X", typ: "andere", anlass: null, datum: null }).success).toBe(false);
  });
  it("Kalendertag ↔ Mitternacht UTC, unabhängig von der Suite-Zone", () => {
    expect(tagZuMs("2026-02-22")).toBe(Date.UTC(2026, 1, 22));
    expect(msZuTag(Date.UTC(2026, 1, 22))).toBe("2026-02-22");
    expect(msZuTag(null)).toBeNull();
  });
});
```

`K/_lib/speichern.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { eq, sql } from "drizzle-orm";
import { withAuditContext } from "@/core/audit/context";
import { plan } from "../_db/schema";
import { leererPlan, fuegeWurzelEin } from "./plan/operationen";
import { BEARBEITUNGSFENSTER_MS, legePlanAn, speichereAngaben, speichereInhalt } from "./speichern";
import { testDb, type TestDb } from "./testDb";

const JANA = { nutzer: "u-jana", name: "Jana Beispiel" };
const OLE = { nutzer: "u-ole", name: "Ole Beispiel" };
const T0 = Date.UTC(2026, 8, 30, 8, 0);
const ANGABEN = { titel: "Übung", typ: "kommunikationsplan", anlass: "Probe", datum: "2026-09-30" };

/** Audit-Zeilen der Tabellen plan und plan_bearbeitung, in Schreibreihenfolge. */
function audit(db: TestDb): string[] {
  return (db.all(sql`SELECT action, object_type, json_extract(actor, '$.id') AS wer FROM audit_outbox
    WHERE object_type IN ('plan', 'plan_bearbeitung') ORDER BY rowid`) as { action: string; object_type: string; wer: string | null }[])
    .map((r) => `${r.action} ${r.object_type}${r.wer ? ` ${r.wer}` : ""}`);
}
const als = <T,>(wer: typeof JANA, f: () => T) => withAuditContext({ actor: { kind: "user", id: wer.nutzer, name: wer.name } }, f);

function angelegt(db: TestDb): string {
  const r = als(JANA, () => legePlanAn(db, ANGABEN, JANA, T0));
  if (!r.ok) throw new Error(r.fehler);
  return r.id;
}

describe("Plan anlegen", () => {
  it("legt einen leeren Plan mit Version 1 an, geprüft und mit Audit-Zeile", () => {
    const db = testDb();
    const id = angelegt(db);
    const z = db.select().from(plan).where(eq(plan.id, id)).get()!;
    expect(z).toMatchObject({ titel: "Übung", typ: "kommunikationsplan", anlass: "Probe", version: 1, aktualisiertVon: "Jana Beispiel" });
    expect(z.datum?.getTime()).toBe(Date.UTC(2026, 8, 30));
    expect(JSON.parse(z.inhalt)).toEqual(leererPlan());
    expect(audit(db)).toEqual(["create plan u-jana"]);
  });
  it("meldet Feldfehler statt zu werfen", () => {
    const r = legePlanAn(testDb(), { ...ANGABEN, titel: "   " }, JANA, T0);
    expect(r).toEqual({ ok: false, fehler: "Bitte die markierten Felder prüfen.", feldFehler: { titel: "Bitte einen Titel eintragen." } });
  });
});

describe("Inhalt speichern mit Versionsprüfung", () => {
  it("zählt die Version hoch und setzt Stand und Bearbeiter", () => {
    const db = testDb();
    const id = angelegt(db);
    const r = als(OLE, () => speichereInhalt(db, { id, version: 1, inhalt: fuegeWurzelEin(leererPlan(), "w") }, OLE, T0 + 1000));
    expect(r).toEqual({ ok: true, version: 2, aktualisiertAm: T0 + 1000 });
    expect(db.select().from(plan).where(eq(plan.id, id)).get()).toMatchObject({ version: 2, aktualisiertVon: "Ole Beispiel" });
  });
  it("veraltete Version → Konflikt mit dem Serverstand; nichts geschrieben", () => {
    const db = testDb();
    const id = angelegt(db);
    als(JANA, () => speichereInhalt(db, { id, version: 1, inhalt: fuegeWurzelEin(leererPlan(), "w") }, JANA, T0 + 1));
    const r = als(OLE, () => speichereInhalt(db, { id, version: 1, inhalt: leererPlan() }, OLE, T0 + 2));
    expect(r).toMatchObject({ ok: false, grund: "konflikt", stand: { version: 2, aktualisiertVon: "Jana Beispiel", angaben: { titel: "Übung", datum: "2026-09-30" } } });
    expect(r.ok ? null : r.grund === "konflikt" ? r.stand.inhalt?.stellen.map((s) => s.id) : null).toEqual(["w"]);
  });
  it("ungültiger Inhalt und unbekannter oder archivierter Plan", () => {
    const db = testDb();
    const id = angelegt(db);
    expect(speichereInhalt(db, { id, version: 1, inhalt: { schema: 1 } }, JANA, T0)).toMatchObject({ ok: false, grund: "ungueltig" });
    expect(speichereInhalt(db, { id: "gibt-es-nicht", version: 1, inhalt: leererPlan() }, JANA, T0)).toEqual({ ok: false, grund: "weg" });
    db.update(plan).set({ archiviertAm: new Date(T0) }).where(eq(plan.id, id)).run();
    expect(speichereInhalt(db, { id, version: 1, inhalt: leererPlan() }, JANA, T0)).toEqual({ ok: false, grund: "weg" });
  });
});

describe("Audit gebündelt (Entscheidung 1)", () => {
  it("dieselbe Person binnen 15 Minuten: eine Zeile; danach eine neue", () => {
    const db = testDb();
    const id = angelegt(db);
    let v = 1;
    const speichere = (wer: typeof JANA, zeit: number, n: number) => {
      const r = als(wer, () => speichereInhalt(db, { id, version: v, inhalt: fuegeWurzelEin(leererPlan(), `w${n}`) }, wer, zeit));
      if (!r.ok) throw new Error(JSON.stringify(r));
      v = r.version;
    };
    speichere(JANA, T0 + 1_000, 1);
    speichere(JANA, T0 + 60_000, 2);
    speichere(JANA, T0 + BEARBEITUNGSFENSTER_MS, 3); // 15 min nach T0+1s: noch im Fenster
    expect(audit(db)).toEqual(["create plan u-jana", "create plan_bearbeitung u-jana"]);
    speichere(JANA, T0 + 1_000 + BEARBEITUNGSFENSTER_MS, 4); // genau 15 min nach Beginn: neues Fenster
    expect(audit(db)).toEqual(["create plan u-jana", "create plan_bearbeitung u-jana", "update plan_bearbeitung u-jana"]);
  });
  it("zwei Personen abwechselnd: je Person höchstens eine Zeile im Fenster", () => {
    const db = testDb();
    const id = angelegt(db);
    let v = 1;
    for (const [i, wer] of [JANA, OLE, JANA, OLE, JANA].entries()) {
      const r = als(wer, () => speichereInhalt(db, { id, version: v, inhalt: fuegeWurzelEin(leererPlan(), `w${i}`) }, wer, T0 + (i + 1) * 60_000));
      if (!r.ok) throw new Error(JSON.stringify(r));
      v = r.version;
    }
    expect(audit(db)).toEqual(["create plan u-jana", "create plan_bearbeitung u-jana", "create plan_bearbeitung u-ole"]);
  });
  it("Planangaben: jede Änderung eine eigene Zeile; unveränderte Angaben keine", () => {
    const db = testDb();
    const id = angelegt(db);
    const r1 = als(JANA, () => speichereAngaben(db, { id, version: 1, angaben: { ...ANGABEN, titel: "Übung Nord" } }, JANA, T0 + 1));
    expect(r1).toMatchObject({ ok: true, version: 2 });
    const r2 = als(JANA, () => speichereAngaben(db, { id, version: 2, angaben: { ...ANGABEN, titel: "Übung Nord" } }, JANA, T0 + 2));
    expect(r2).toMatchObject({ ok: true, version: 3 });
    expect(audit(db)).toEqual(["create plan u-jana", "update plan u-jana"]);
  });
  it("Angaben, dann Inhalt mit der neuen Version: kein falscher Konflikt (Review Focus 5)", () => {
    const db = testDb();
    const id = angelegt(db);
    const a = als(JANA, () => speichereAngaben(db, { id, version: 1, angaben: { ...ANGABEN, anlass: "Echt" } }, JANA, T0 + 1));
    expect(a).toMatchObject({ ok: true, version: 2 });
    const b = als(JANA, () => speichereInhalt(db, { id, version: 2, inhalt: fuegeWurzelEin(leererPlan(), "w") }, JANA, T0 + 2));
    expect(b).toMatchObject({ ok: true, version: 3 });
  });
  it("Angaben mit Feldfehler: nichts geschrieben", () => {
    const db = testDb();
    const id = angelegt(db);
    expect(speichereAngaben(db, { id, version: 1, angaben: { ...ANGABEN, datum: "30.09.2026" } }, JANA, T0))
      .toEqual({ ok: false, grund: "ungueltig", fehler: "Bitte die markierten Felder prüfen.", feldFehler: { datum: "Bitte ein Datum wählen." } });
    expect(db.select().from(plan).where(eq(plan.id, id)).get()?.version).toBe(1);
  });
});
```

In `K/_lib/plaene.test.ts` im Fall „lädt einen Plan samt geprüftem Inhalt …" nach `expect(p.fehler).toBeNull();` ergänzen:

```ts
    expect(p.version).toBe(1);
    expect(p.angaben).toEqual({ titel: p.titel, typ: "kommunikationsplan", anlass: "OpenR", datum: "2022-07-01" });
```

(`_lib/beispiele/openr20220701.ts` trägt `anlass: "OpenR"`, `datum: "2022-07-01"`.)

- [ ] **Step 3: Rot sehen**

Run: `pnpm vitest run src/app/m/kommplan/_lib/speichern.test.ts src/app/m/kommplan/_lib/angaben.test.ts src/app/m/kommplan/_lib/plaene.test.ts`
Expected: FAIL — Module fehlen, `version`/`angaben` fehlen.

- [ ] **Step 4: Tabelle im Schema**

In `K/_db/schema.ts` den Import um `primaryKey` erweitern (`import { check, index, integer, primaryKey, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";`), den Kommentar an `version` ersetzen durch `/** Optimistisches Sperren: jedes Speichern zählt hoch (`_lib/speichern.ts`). */` und hinter `plan` einfügen:

```ts
/**
 * GEBÜNDELTES AUDIT DER INHALTSÄNDERUNGEN (Umsetzungsplan Phase 2, Entscheidung 1). `plan.inhalt`,
 * `version` und `aktualisiert_*` stehen im Audit-Katalog als `unauditedColumns` — sonst schriebe
 * jedes Autosave eine Zeile. Stattdessen hält diese Tabelle je Plan und Person den Beginn des
 * laufenden 15-Minuten-Fensters: Anlegen und jedes Weiterspringen von `seit` sind je EINE
 * Audit-Zeile, alles dazwischen keine (`_lib/speichern.ts`, `merkeBearbeitung`).
 */
export const planBearbeitung = sqliteTable("plan_bearbeitung", {
  planId: text("plan_id").notNull().references(() => plan.id),
  /** Kennung der Person (`auditActor(viewer).id`), nicht der Anzeigename. */
  nutzer: text("nutzer").notNull(),
  seit: integer("seit", { mode: "timestamp_ms" }).notNull(),
}, (t) => [primaryKey({ columns: [t.planId, t.nutzer] })]);
```

- [ ] **Step 5: Migration erzeugen und die Trigger von Hand ergänzen**

Run: `pnpm exec drizzle-kit generate --config src/app/m/kommplan/_db/drizzle.config.ts --name plan_bearbeitung`
Expected: neue Dateien `K/_db/migrations/0001_plan_bearbeitung.sql` (nur `CREATE TABLE plan_bearbeitung …`), `meta/0001_snapshot.json`, Eintrag in `meta/_journal.json`. Enthält die SQL-Datei mehr als die neue Tabelle, **anhalten**: dann weicht das Schema vom Snapshot 0000 ab, und das ist erst zu klären.

Die SQL-Datei vorn um den Kopfkommentar und hinten um die Trigger ergänzen, sodass sie so aussieht (der `CREATE TABLE`-Block bleibt wörtlich, wie drizzle-kit ihn erzeugt hat):

```sql
-- DRK-500, Umsetzungsplan Phase 2, Entscheidung 1: gebündeltes Audit der Inhaltsänderungen.
--
-- HANDGESCHRIEBEN, NICHT GENERIERT (Vorbild lagerbuch/_db/migrations/0005_artikel_kategorie.sql):
-- `drizzle-kit generate` kennt die Audit-Trigger nicht. Es erzeugte nur die Tabelle.
--
-- 1. `audit_plan_update` wird neu gesetzt: sein WHEN zählt die Spalten einzeln auf und lässt jetzt
--    `inhalt`, `version`, `aktualisiert_am`, `aktualisiert_von` aus (im Katalog `core/audit/catalog.ts`
--    als `unauditedColumns` begründet). Titel, Art, Anlass, Datum, Vorlage und Archiv bleiben je
--    Änderung eine Audit-Zeile.
-- 2. `plan_bearbeitung` bekommt die drei üblichen Trigger. Ihr Verweis ist das Paar (Plan, Person)
--    wie bei `feedback.user_groups`.
<CREATE TABLE `plan_bearbeitung` … wie generiert>
--> statement-breakpoint
DROP TRIGGER audit_plan_update;
--> statement-breakpoint
CREATE TRIGGER audit_plan_update AFTER UPDATE ON "plan"
WHEN OLD."id" IS NOT NEW."id" OR OLD."titel" IS NOT NEW."titel" OR OLD."typ" IS NOT NEW."typ" OR OLD."anlass" IS NOT NEW."anlass" OR OLD."datum" IS NOT NEW."datum" OR OLD."ist_vorlage" IS NOT NEW."ist_vorlage" OR OLD."archiviert_am" IS NOT NEW."archiviert_am"
BEGIN
  INSERT INTO audit_outbox (id, occurred_at, module, action, object_type, object_ref, actor, result, origin, correlation_id)
  VALUES (suite_audit_id(), suite_audit_now(), 'kommplan', 'update', 'plan', suite_audit_reference(NEW.id), suite_audit_actor(), 'success', 'database', suite_audit_correlation());
END;
--> statement-breakpoint
CREATE TRIGGER audit_plan_bearbeitung_create AFTER INSERT ON "plan_bearbeitung"
BEGIN
  INSERT INTO audit_outbox (id, occurred_at, module, action, object_type, object_ref, actor, result, origin, correlation_id)
  VALUES (suite_audit_id(), suite_audit_now(), 'kommplan', 'create', 'plan_bearbeitung', suite_audit_reference(json_array(NEW.plan_id,NEW.nutzer)), suite_audit_actor(), 'success', 'database', suite_audit_correlation());
END;
--> statement-breakpoint
CREATE TRIGGER audit_plan_bearbeitung_update AFTER UPDATE ON "plan_bearbeitung"
WHEN OLD."plan_id" IS NOT NEW."plan_id" OR OLD."nutzer" IS NOT NEW."nutzer" OR OLD."seit" IS NOT NEW."seit"
BEGIN
  INSERT INTO audit_outbox (id, occurred_at, module, action, object_type, object_ref, actor, result, origin, correlation_id)
  VALUES (suite_audit_id(), suite_audit_now(), 'kommplan', 'update', 'plan_bearbeitung', suite_audit_reference(json_array(NEW.plan_id,NEW.nutzer)), suite_audit_actor(), 'success', 'database', suite_audit_correlation());
END;
--> statement-breakpoint
CREATE TRIGGER audit_plan_bearbeitung_delete AFTER DELETE ON "plan_bearbeitung"
BEGIN
  INSERT INTO audit_outbox (id, occurred_at, module, action, object_type, object_ref, actor, result, origin, correlation_id)
  VALUES (suite_audit_id(), suite_audit_now(), 'kommplan', 'delete', 'plan_bearbeitung', suite_audit_reference(json_array(OLD.plan_id,OLD.nutzer)), suite_audit_actor(), 'success', 'database', suite_audit_correlation());
END;
```

Vor dem `CREATE TABLE` steht **kein** `--> statement-breakpoint`; die Kommentarzeilen gehören zur ersten Anweisung (so auch `feedback/_db/migrations/0003_evenings_status.sql`).

- [ ] **Step 6: Katalog und Beschriftung**

In `src/core/audit/catalog.ts`, Block `"kommplan"`, den Eintrag `"plan"` ersetzen und dahinter `"plan_bearbeitung"` einfügen (Formatierung wie die Nachbarn):

```ts
    "plan": {
      "mode": "audited",
      "primaryKey": [
        "id"
      ],
      "unauditedColumns": {
        "columns": [
          "inhalt",
          "version",
          "aktualisiert_am",
          "aktualisiert_von"
        ],
        "reason": "Inhalt und Speichertakt des Editors (Autosave etwa jede Sekunde); gespeicherte Inhaltsänderungen stehen gebündelt in plan_bearbeitung, höchstens eine Zeile je Person, Plan und 15 Minuten."
      }
    },
    "plan_bearbeitung": {
      "mode": "audited",
      "primaryKey": [
        "plan_id",
        "nutzer"
      ]
    },
```

In `src/app/m/portal/admin/audit/labels.ts` in der Zeile, die mit ` plan:"Kommunikationsplan",` beginnt, direkt hinter `plan:"Kommunikationsplan",` einfügen: `plan_bearbeitung:"Bearbeitung eines Kommunikationsplans",` (keine neue Zeile).

- [ ] **Step 7: `angaben.ts`, `ergebnis.ts`, `speichern.ts`, `plaene.ts`**

`K/_lib/angaben.ts`:

```ts
import { z } from "zod";
import type { FeldFehler } from "./ergebnis";
import { LAENGE } from "./plan/schema";

/**
 * PLANANGABEN (Spec §4.1): Spalten der Tabelle `plan`, nicht Teil des Dokuments. Geprüft auf dem
 * Server (`speichern.ts`) und am Formular (`NeuerPlan`, `PlanFlyin`) mit demselben Schema. Kein
 * `next/*`, kein `"use client"` — beide Seiten lesen diese Datei (Falle 6).
 *
 * `datum` ist ein KALENDERTAG „YYYY-MM-DD", gespeichert als Mitternacht UTC. Umgerechnet wird
 * deshalb in UTC, nie in der Suite-Zone (Ausnahme in `CLAUDE.md`, „Zeitzone").
 */
export const PLAN_TYPEN = ["kommunikationsplan", "fernmeldeskizze"] as const;
export type PlanTyp = (typeof PLAN_TYPEN)[number];
export const TYP_NAME: Record<PlanTyp, string> = { kommunikationsplan: "Kommunikationsplan", fernmeldeskizze: "Fernmeldeskizze" };
export const LAENGE_ANLASS = 120;
export interface Planangaben { titel: string; typ: PlanTyp; anlass: string | null; datum: string | null }

export function tagZuMs(tag: string): number {
  return Date.UTC(Number(tag.slice(0, 4)), Number(tag.slice(5, 7)) - 1, Number(tag.slice(8, 10)));
}
export function msZuTag(ms: number | null): string | null {
  return ms === null ? null : new Date(ms).toISOString().slice(0, 10);
}
const leerZuNull = (v: unknown) => (typeof v === "string" ? (v.trim() === "" ? null : v.trim()) : v);

export const angabenSchema = z.object({
  titel: z.string().trim().min(1, "Bitte einen Titel eintragen.").max(LAENGE.titel, `Höchstens ${LAENGE.titel} Zeichen.`),
  typ: z.enum(PLAN_TYPEN, { error: "Bitte eine Art wählen." }),
  anlass: z.preprocess(leerZuNull, z.string().max(LAENGE_ANLASS, `Höchstens ${LAENGE_ANLASS} Zeichen.`).nullable()),
  datum: z.preprocess(leerZuNull, z.string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Bitte ein Datum wählen.")
    // Nur wohlgeformte Tage prüfen: zod 4 läuft nach einem gescheiterten `regex` weiter, und
    // `new Date(NaN).toISOString()` würfe — die Formatmeldung oben gewinnt (erste je Feld).
    .refine((t) => !/^\d{4}-\d{2}-\d{2}$/.test(t) || msZuTag(tagZuMs(t)) === t, "Diesen Tag gibt es nicht.")
    .nullable()),
}).strict();

/** Erster Fehler je Feld (Vorbild `einsatzbuch/_lib/actionErgebnis.ts`, `zodFehler`). */
export function feldFehlerAus(e: z.ZodError): FeldFehler {
  const karte: FeldFehler = {};
  for (const p of e.issues) {
    const feld = p.path.join(".") || "_";
    if (!(feld in karte)) karte[feld] = p.message;
  }
  return karte;
}
```

`K/_lib/ergebnis.ts`:

```ts
import type { Planangaben } from "./angaben";
import type { PlanInhalt } from "./plan/schema";

/**
 * Rückgabetypen der Server Actions (`_actions/`). Hier und nicht in der Action-Datei: in einer
 * `"use server"`-Datei wäre jeder Export eine Action (Kopfkommentar `einsatzbuch/_lib/actionErgebnis.ts`).
 * Zurückgegeben statt geworfen, weil Next Fehlermeldungen aus Actions im Produktionsbau ersetzt.
 */
export type FeldFehler = Record<string, string>;
export interface Speicherstand { version: number; inhalt: PlanInhalt | null; angaben: Planangaben; aktualisiertAm: number; aktualisiertVon: string }
export type SpeicherErgebnis =
  | { ok: true; version: number; aktualisiertAm: number }
  | { ok: false; grund: "konflikt"; stand: Speicherstand }
  | { ok: false; grund: "weg" }
  | { ok: false; grund: "ungueltig"; fehler: string; feldFehler?: FeldFehler };
export type AnlageErgebnis = { ok: true; id: string } | { ok: false; fehler: string; feldFehler: FeldFehler };
```

`K/_lib/speichern.ts`:

```ts
import { randomUUID } from "node:crypto";
import { and, eq, isNull, sql } from "drizzle-orm";
import type { KommplanDb } from "../_db/client";
import { plan, planBearbeitung } from "../_db/schema";
import { angabenSchema, feldFehlerAus, msZuTag, tagZuMs } from "./angaben";
import type { AnlageErgebnis, SpeicherErgebnis, Speicherstand } from "./ergebnis";
import { leererPlan } from "./plan/operationen";
import { leseInhalt } from "./plan/schema";
import { lies } from "./plaene";

/**
 * SPEICHERN (Spec §6.6) — nur Server. Die Actions in `_actions/plan.ts` prüfen Zugang und setzen
 * den Audit-Kontext; hier stehen Versionsprüfung und gebündeltes Audit, testbar ohne Next.
 *
 * VERSIONSPRÜFUNG ATOMAR: ein bedingtes `UPDATE … WHERE id = ? AND version = ? AND archiviert_am
 * IS NULL`; erst wenn es keine Zeile trifft, wird gelesen, WARUM (Konflikt oder weg). Ein vorheriges
 * SELECT mit anschließendem UPDATE ließe zwei gleichzeitige Speicherungen beide durch.
 *
 * GRÖSSE: ein Plan an der Schemagrenze (500 Stellen, Zufallsplan „stab", Seed 4711) ist <gemessen>
 * Byte JSON — unter dem Aufruflimit der Server Actions von 1 MB.
 */
export const BEARBEITUNGSFENSTER_MS = 15 * 60 * 1000;
export interface Bearbeiter { nutzer: string; name: string }
type Schreiber = Pick<KommplanDb, "select" | "insert" | "update">;

/** Entscheidung 1: höchstens EINE Audit-Zeile je Person und Plan in einem 15-Minuten-Fenster. */
export function merkeBearbeitung(db: Schreiber, planId: string, nutzer: string, jetzt: number): void {
  const wo = and(eq(planBearbeitung.planId, planId), eq(planBearbeitung.nutzer, nutzer));
  const z = db.select().from(planBearbeitung).where(wo).get();
  if (!z) db.insert(planBearbeitung).values({ planId, nutzer, seit: new Date(jetzt) }).run();
  else if (jetzt - z.seit.getTime() >= BEARBEITUNGSFENSTER_MS) db.update(planBearbeitung).set({ seit: new Date(jetzt) }).where(wo).run();
}

function stand(db: Schreiber, id: string): Speicherstand | null {
  const z = db.select().from(plan).where(eq(plan.id, id)).get();
  if (!z || z.archiviertAm !== null) return null;
  return {
    version: z.version, inhalt: lies(z).inhalt,
    angaben: { titel: z.titel, typ: z.typ, anlass: z.anlass, datum: msZuTag(z.datum?.getTime() ?? null) },
    aktualisiertAm: z.aktualisiertAm.getTime(), aktualisiertVon: z.aktualisiertVon,
  };
}

const FELDER = "Bitte die markierten Felder prüfen.";

export function legePlanAn(db: KommplanDb, eingabe: unknown, wer: Bearbeiter, jetzt: number): AnlageErgebnis {
  const a = angabenSchema.safeParse(eingabe);
  if (!a.success) return { ok: false, fehler: FELDER, feldFehler: feldFehlerAus(a.error) };
  const id = randomUUID();
  db.insert(plan).values({
    id, titel: a.data.titel, typ: a.data.typ, anlass: a.data.anlass,
    datum: a.data.datum === null ? null : new Date(tagZuMs(a.data.datum)),
    aktualisiertAm: new Date(jetzt), aktualisiertVon: wer.name, inhalt: JSON.stringify(leererPlan()),
  }).run();
  return { ok: true, id };
}

function bedingtesUpdate(db: KommplanDb, id: string, version: number, werte: Partial<typeof plan.$inferInsert>, jetzt: number, wer: Bearbeiter, nachErfolg: (tx: Schreiber) => void): SpeicherErgebnis {
  return db.transaction((tx) => {
    const r = tx.update(plan)
      .set({ ...werte, version: sql`${plan.version} + 1`, aktualisiertAm: new Date(jetzt), aktualisiertVon: wer.name })
      .where(and(eq(plan.id, id), eq(plan.version, version), isNull(plan.archiviertAm))).run();
    if (r.changes === 1) {
      nachErfolg(tx);
      return { ok: true as const, version: version + 1, aktualisiertAm: jetzt };
    }
    const s = stand(tx, id);
    return s ? { ok: false as const, grund: "konflikt" as const, stand: s } : { ok: false as const, grund: "weg" as const };
  });
}

export function speichereInhalt(db: KommplanDb, eingabe: { id: string; version: number; inhalt: unknown }, wer: Bearbeiter, jetzt: number): SpeicherErgebnis {
  const r = leseInhalt(eingabe.inhalt);
  if (!r.ok) return { ok: false, grund: "ungueltig", fehler: r.fehler };
  return bedingtesUpdate(db, eingabe.id, eingabe.version, { inhalt: JSON.stringify(r.inhalt) }, jetzt, wer,
    (tx) => merkeBearbeitung(tx, eingabe.id, wer.nutzer, jetzt));
}

/** Planangaben: je Änderung eine Audit-Zeile über den Trigger von `plan` (Entscheidung 1). */
export function speichereAngaben(db: KommplanDb, eingabe: { id: string; version: number; angaben: unknown }, wer: Bearbeiter, jetzt: number): SpeicherErgebnis {
  const a = angabenSchema.safeParse(eingabe.angaben);
  if (!a.success) return { ok: false, grund: "ungueltig", fehler: FELDER, feldFehler: feldFehlerAus(a.error) };
  return bedingtesUpdate(db, eingabe.id, eingabe.version, {
    titel: a.data.titel, typ: a.data.typ, anlass: a.data.anlass,
    datum: a.data.datum === null ? null : new Date(tagZuMs(a.data.datum)),
  }, jetzt, wer, () => {});
}
```

Falls `tx` im Typ nicht zu `Schreiber` passt (Drizzle-Transaktionstyp), `type Schreiber` auf `Pick<Parameters<Parameters<KommplanDb["transaction"]>[0]>[0], "select" | "insert" | "update">` umstellen — `KommplanDb` hat dieselben drei Methoden, beide Seiten erfüllen es dann. Nie `any`.

In `K/_lib/plaene.ts`: `function lies(` → `export function lies(`; `const TYP = …` durch `import { msZuTag, TYP_NAME, type Planangaben } from "./angaben";` ersetzen und `TYP[` → `TYP_NAME[`; `GeladenerPlan` um `version: number; angaben: Planangaben;` erweitern und in `ladePlan` setzen:

```ts
    version: z.version,
    angaben: { titel: z.titel, typ: z.typ, anlass: z.anlass, datum: msZuTag(z.datum?.getTime() ?? null) },
```

- [ ] **Step 8: Grün sehen**

Run: `pnpm vitest run src/app/m/kommplan src/core/audit && pnpm typecheck; echo "typecheck exit $?"`
Expected: PASS — auch `src/core/audit/catalog.test.ts` (Tabelle deklariert, Primärschlüssel `plan_id, nutzer`, WHEN von `plan` deckt genau die nicht ausgenommenen Spalten, `plan_bearbeitung` hat create/update/delete) und `K/_db/schema.test.ts`. typecheck exit 0.

- [ ] **Step 9: Ankerschritt und Commit**

Ankerschritt für `K/_db/schema.ts`, `src/core/audit/catalog.ts`, `K/_lib/plaene.ts`. Dann:

```bash
git add src/app/m/kommplan/_db src/app/m/kommplan/_lib/angaben.ts src/app/m/kommplan/_lib/angaben.test.ts src/app/m/kommplan/_lib/ergebnis.ts src/app/m/kommplan/_lib/speichern.ts src/app/m/kommplan/_lib/speichern.test.ts src/app/m/kommplan/_lib/plaene.ts src/app/m/kommplan/_lib/plaene.test.ts src/core/audit/catalog.ts src/app/m/portal/admin/audit/labels.ts
git commit -S -m "feat(kommplan): Speichern mit Versionsprüfung und gebündeltem Audit

Inhaltsänderungen schreiben höchstens eine Audit-Zeile je Person, Plan
und 15 Minuten (neue Tabelle plan_bearbeitung); Anlegen und
Planangaben bleiben je Änderung eine Zeile.

DRK-500

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Server Actions, Bearbeitungs-Riegel und Zeichen-Index

**Files:**
- Modify: `K/_lib/zugang.ts` (`requireKommplanBearbeitenAktion`, `bearbeiterAus`), `K/_lib/zugang.test.ts`
- Modify: `K/_lib/zeichen/grundlagen.ts` (Typ `ZeichenIndexEintrag`), `K/_lib/zeichen/zeichen.ts` (`zeichenIndex`, `symboleFuerSchluessel`), `K/_lib/zeichen/zeichen.test.ts`
- Create: `K/_actions/plan.ts`, `K/_actions/zeichen.ts`, `K/_actions/plan.test.ts`
- Modify: `src/core/audit/coverage-manifest.json`
- Modify: `K/grenze.test.ts` (`"use server"` als Grenze der transitiven Prüfung; neue geteilte Dateien)

**Interfaces:**
- Consumes: `legePlanAn`, `speichereInhalt`, `speichereAngaben`, `Bearbeiter` (Task 5), `darfKommplanBearbeiten`, `istKommplanHost`, `auditActor`, `auditDenied`, `auditLoginRequired`, `withAuditContext`.
- Produces:
  - `requireKommplanBearbeitenAktion(): Promise<Viewer>` — wirft `Error("Forbidden")` bei fremdem Host, ohne Anmeldung oder ohne `darfKommplanBearbeiten`, jeweils mit Audit-Zeile.
  - `bearbeiterAus(viewer: Viewer): Bearbeiter` — `nutzer` = `auditActor(viewer).id`, `name` = Name, sonst E-Mail, sonst Kennung.
  - `legePlanAnAction(eingabe: unknown): Promise<AnlageErgebnis>`; `speichereInhaltAction(eingabe: unknown): Promise<SpeicherErgebnis>`; `speichereAngabenAction(eingabe: unknown): Promise<SpeicherErgebnis>`; `ladeZeichenAction(schluessel: unknown): Promise<Record<string, Symbolquelle>>`.
  - `grundlagen.ts`: `interface ZeichenIndexEintrag { schluessel: string; titel: string; suchtext: string }`.
  - `zeichen.ts` (nur Server): `zeichenIndex(): ZeichenIndexEintrag[]` (nach Titel, `localeCompare(…, "de")`); `symboleFuerSchluessel(schluessel: readonly string[]): Record<string, Symbolquelle>`.

- [ ] **Step 1: Failing tests**

An `K/_lib/zugang.test.ts` anhängen (die Datei mockt `@/core/auth`, `@/core/audit/server` und `next/navigation` schon; zusätzlich `next/headers` am Dateikopf mocken):

```ts
// Am Dateikopf zu den anderen vi.mock-Aufrufen:
const kopf = vi.hoisted(() => ({ host: "kommplan.localtest.me" }));
vi.mock("next/headers", () => ({ headers: async () => new Headers({ host: kopf.host }) }));
// … und in den Import aus "./zugang" aufnehmen: bearbeiterAus, requireKommplanBearbeitenAktion

describe("Bearbeiten-Riegel für Server Actions", () => {
  beforeEach(() => { kopf.host = "kommplan.localtest.me"; audit.denied.mockReset(); audit.login.mockReset(); });
  it("Admin-Gruppe darf, Zugangsgruppe nicht, ohne Anmeldung nicht, fremder Host nicht — je mit Audit", async () => {
    zustand.user = { sub: "u1", name: "Jana", groups: ["iuk-kommplan-bearbeiten"] };
    await expect(requireKommplanBearbeitenAktion()).resolves.toMatchObject({ sub: "u1" });
    zustand.user = { sub: "u2", name: "Ole", groups: ["iuk-kommplan"] };
    await expect(requireKommplanBearbeitenAktion()).rejects.toThrow("Forbidden");
    expect(audit.denied).toHaveBeenCalledTimes(1);
    zustand.user = null;
    await expect(requireKommplanBearbeitenAktion()).rejects.toThrow("Forbidden");
    expect(audit.login).toHaveBeenCalledTimes(1);
    zustand.user = { sub: "u1", name: "Jana", groups: ["iuk-kommplan-bearbeiten"] };
    kopf.host = "feedback.localtest.me";
    await expect(requireKommplanBearbeitenAktion()).rejects.toThrow("Forbidden");
    expect(audit.denied).toHaveBeenCalledTimes(2);
  });
  it("Bearbeiter: Kennung aus dem Audit-Akteur, Name mit Rückfall", () => {
    expect(bearbeiterAus({ sub: "u1", name: " Jana ", groups: [] } as never)).toEqual({ nutzer: "u1", name: "Jana" });
    expect(bearbeiterAus({ id: "u2", email: "ole@x.de", groups: [] } as never)).toEqual({ nutzer: "u2", name: "ole@x.de" });
  });
});
```

(Falls `zugang.test.ts` den Host-Riegel `@/app/m/kommplan/_lib/host` nicht mockt: `istKommplanHost` liest über `moduleForHost` die Registry; `kommplan.localtest.me` ist dort der Standard-Host — kein Mock nötig.)

An `K/_lib/zeichen/zeichen.test.ts` anhängen:

```ts
import { symboleFuerSchluessel, zeichenIndex } from "./zeichen";

describe("Zeichen-Index für den Editor (Entscheidung 4)", () => {
  it("führt jedes Zeichen mit Titel und Suchtext, ohne SVG, klein genug für die Seite", () => {
    const index = zeichenIndex();
    expect(index.length).toBeGreaterThan(200);
    expect(index[0]).toEqual({ schluessel: expect.any(String), titel: expect.any(String), suchtext: expect.any(String) });
    expect(JSON.stringify(index).length).toBeLessThan(40_000);
    const titel = index.map((e) => e.titel);
    expect(titel).toEqual([...titel].sort((a, b) => a.localeCompare(b, "de")));
  });
  it("liefert SVG-Quellen nur für bekannte Schlüssel", () => {
    const k = zeichenIndex()[0].schluessel;
    expect(Object.keys(symboleFuerSchluessel([k, "gibt:es-nicht"]))).toEqual([k]);
  });
});
```

`K/_actions/plan.test.ts` (Vorbild `einsatzbuch/_actions/einstellungen.test.ts`: echte Datenbank unter `DATA_DIR`, Auth und Host gemockt):

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";
import { rmSync } from "node:fs";
import { migrateAllModules } from "@/core/bootstrap";

const DIR = "./.data/kommplan-actions-plan-test";
let gruppen: string[] | null = null;
vi.mock("@/core/auth", () => ({ auth: async () => (gruppen ? { user: { id: "u1", name: "Jana", groups: gruppen } } : null) }));
vi.mock("next/headers", () => ({ headers: async () => new Headers({ host: "kommplan.localtest.me" }) }));

beforeEach(() => {
  rmSync(DIR, { recursive: true, force: true });
  process.env.DATA_DIR = DIR;
  delete (globalThis as { __suiteDb?: unknown }).__suiteDb;
  migrateAllModules();
  gruppen = null;
});

const ANGABEN = { titel: "Übung", typ: "kommunikationsplan", anlass: "", datum: "2026-09-30" };

describe("Plan-Actions", () => {
  it("ohne Admin-Gruppe: Forbidden, auch mit Zugangsgruppe", async () => {
    const { legePlanAnAction, speichereInhaltAction } = await import("./plan");
    gruppen = ["iuk-kommplan"];
    await expect(legePlanAnAction(ANGABEN)).rejects.toThrow("Forbidden");
    await expect(speichereInhaltAction({ id: "x", version: 1, inhalt: {} })).rejects.toThrow("Forbidden");
  });
  it("anlegen, speichern, Konflikt — mit Audit-Akteur aus der Sitzung", async () => {
    gruppen = ["iuk-kommplan-bearbeiten"];
    const { legePlanAnAction, speichereAngabenAction, speichereInhaltAction } = await import("./plan");
    const neu = await legePlanAnAction(ANGABEN);
    if (!neu.ok) throw new Error(neu.fehler);
    const { leererPlan } = await import("../_lib/plan/operationen");
    expect(await speichereInhaltAction({ id: neu.id, version: 1, inhalt: leererPlan() })).toMatchObject({ ok: true, version: 2 });
    expect(await speichereInhaltAction({ id: neu.id, version: 1, inhalt: leererPlan() })).toMatchObject({ ok: false, grund: "konflikt" });
    expect(await speichereAngabenAction({ id: neu.id, version: 2, angaben: { ...ANGABEN, titel: "Neu" } })).toMatchObject({ ok: true, version: 3 });
    expect(await speichereInhaltAction({ id: 5, version: "x" })).toEqual({ ok: false, grund: "ungueltig", fehler: "Ungültige Anfrage." });
    const { getDb } = await import("../_db/client");
    const { sql } = await import("drizzle-orm");
    const akteure = getDb().all(sql`SELECT DISTINCT json_extract(actor, '$.id') AS id FROM audit_outbox WHERE object_type IN ('plan','plan_bearbeitung')`) as { id: string }[];
    expect(akteure).toEqual([{ id: "u1" }]);
  });
});
```

In `K/grenze.test.ts`, `describe("kommplan: der Riegel selbst", …)`, anhängen:

```ts
  it("eine Server-Action-Datei ist Grenze der transitiven Prüfung — erkannt wie in core/audit/coverage.test.ts", () => {
    expect(istServerAktion('"use server";\nimport { x } from "../_lib/zeichen/zeichen";')).toBe(true);
    expect(istServerAktion('// Kopf\n"use server";')).toBe(false);
    expect(istServerAktion("'use server';")).toBe(false);
  });
```

und in `describe("kommplan: Importgrenzen", …)` anhängen:

```ts
  it("Server Actions liegen nur unter _actions/ und beginnen auf Byte 0 mit der Direktive", () => {
    const aktionen = laufzeit.filter((p) => /["']use server["']/.test(ohneKommentare(quelltext(p)).split("\n").slice(0, 3).join("\n")));
    for (const p of aktionen) {
      expect(relative(MODUL, p).startsWith("_actions/"), p).toBe(true);
      expect(istServerAktion(quelltext(p)), p).toBe(true);
    }
  });
```

- [ ] **Step 2: Rot sehen**

Run: `pnpm vitest run src/app/m/kommplan/_lib/zugang.test.ts src/app/m/kommplan/_lib/zeichen/zeichen.test.ts src/app/m/kommplan/_actions src/app/m/kommplan/grenze.test.ts`
Expected: FAIL — Funktionen und Dateien fehlen, `istServerAktion` ist nicht definiert.

- [ ] **Step 3: Riegel und Bearbeiter in `zugang.ts`**

Importe ergänzen: `import { headers } from "next/headers";`, `import { istKommplanHost } from "./host";`, `import type { Bearbeiter } from "./speichern";` (reiner Typ-Import). Anhängen:

```ts
/**
 * Für Server Actions (Vorbild `einsatzbuch/_lib/zugang.ts`, `requireEinsatzbuchAktion`): Wurf statt
 * `notFound`, weil eine Action keine Seite ist. Host, Anmeldung und Bearbeiten-Recht — dasselbe
 * Prädikat wie der Knopf „Neu" und die Editor-Weiche der Planseite (docs/design/README.md,
 * „Führt kein Weg dorthin, wo die aufrufende Person nicht hindarf?").
 */
export async function requireKommplanBearbeitenAktion(): Promise<Viewer> {
  const kopf = await headers();
  const viewer = (await auth())?.user;
  if (!istKommplanHost(kopf)) { auditDenied("kommplan", auditActor(viewer)); throw new Error("Forbidden"); }
  if (!viewer) { auditLoginRequired("kommplan"); throw new Error("Forbidden"); }
  if (!darfKommplanBearbeiten(viewer.groups)) { auditDenied("kommplan", auditActor(viewer)); throw new Error("Forbidden"); }
  return viewer;
}

/** Kennung für `plan_bearbeitung.nutzer`, Anzeigename für `plan.aktualisiert_von` (gedruckter „Bearbeitung: …"). */
export function bearbeiterAus(viewer: Viewer): Bearbeiter {
  const akteur = auditActor(viewer);
  const nutzer = akteur.kind === "user" ? akteur.id : "unbekannt";
  return { nutzer, name: viewer.name?.trim() || viewer.email?.trim() || nutzer };
}
```

- [ ] **Step 4: Zeichen-Index**

In `K/_lib/zeichen/grundlagen.ts` hinter `export interface Symbolquelle …` einfügen:

```ts
/** Ein Eintrag des schlanken Zeichen-Index für die Suche im Editor — ohne SVG (Entscheidung 4, Phase 2). */
export interface ZeichenIndexEintrag { schluessel: string; titel: string; suchtext: string }
```

In `K/_lib/zeichen/zeichen.ts` den Import um `ZeichenIndexEintrag` erweitern (`import type { Symbolquelle, ZeichenIndexEintrag } from "./grundlagen";`), `symboleFuer` auf die neue Funktion stützen und anhängen:

```ts
export function symboleFuerSchluessel(schluessel: readonly string[]): Record<string, Symbolquelle> {
  return Object.fromEntries(
    [...new Set(schluessel)].sort().flatMap((k) => {
      const e = findeZeichen(k);
      return e ? [[k, { viewBox: e.viewBox, inhalt: e.inhalt }]] : [];
    }),
  );
}

/** Der Index für die Suche im Editor: rund 20 KB statt rund 220 KB, weil ohne SVG. */
export function zeichenIndex(): ZeichenIndexEintrag[] {
  return Object.keys(ZEICHEN)
    .map((k) => ({ schluessel: k, titel: ZEICHEN[k].titel, suchtext: ZEICHEN[k].suchtext }))
    .sort((a, b) => a.titel.localeCompare(b.titel, "de") || (a.schluessel < b.schluessel ? -1 : 1));
}
```

`symboleFuer` wird zu:

```ts
export function symboleFuer(inhalt: PlanInhalt): Record<string, Symbolquelle> {
  return symboleFuerSchluessel(inhalt.stellen.flatMap((s) => [s.zeichen, ...s.einheiten.map((e) => e.zeichen)]).filter((k): k is string => k !== null));
}
```

- [ ] **Step 5: Server Actions**

`K/_actions/plan.ts` — die erste Zeile ist die Direktive, **kein** Kommentar davor:

```ts
"use server";

import { z } from "zod";
import { auditActor, withAuditContext } from "@/core/audit/server";
import { getDb } from "../_db/client";
import type { AnlageErgebnis, SpeicherErgebnis } from "../_lib/ergebnis";
import { legePlanAn, speichereAngaben, speichereInhalt } from "../_lib/speichern";
import { bearbeiterAus, requireKommplanBearbeitenAktion } from "../_lib/zugang";

// Server Actions des Editors (Spec §6.6). Jede prüft selbst (eine Action ist per POST direkt
// erreichbar); die Plan-ID wird in `_lib/speichern.ts` gegen die Datenbank aufgelöst (IDOR).
// Kein revalidatePath: die Editor-Insel ist bis zum Neuladen die Quelle der Wahrheit.

const kopf = z.object({ id: z.string().min(1).max(64), version: z.number().int().min(1) });
const UNGUELTIG = { ok: false, grund: "ungueltig", fehler: "Ungültige Anfrage." } as const;

export async function legePlanAnAction(eingabe: unknown): Promise<AnlageErgebnis> {
  const viewer = await requireKommplanBearbeitenAktion();
  return withAuditContext({ actor: auditActor(viewer) }, async () => legePlanAn(getDb(), eingabe, bearbeiterAus(viewer), Date.now()));
}

export async function speichereInhaltAction(eingabe: unknown): Promise<SpeicherErgebnis> {
  const viewer = await requireKommplanBearbeitenAktion();
  return withAuditContext({ actor: auditActor(viewer) }, async () => {
    const k = kopf.extend({ inhalt: z.unknown() }).safeParse(eingabe);
    if (!k.success) return UNGUELTIG;
    return speichereInhalt(getDb(), k.data, bearbeiterAus(viewer), Date.now());
  });
}

export async function speichereAngabenAction(eingabe: unknown): Promise<SpeicherErgebnis> {
  const viewer = await requireKommplanBearbeitenAktion();
  return withAuditContext({ actor: auditActor(viewer) }, async () => {
    const k = kopf.extend({ angaben: z.unknown() }).safeParse(eingabe);
    if (!k.success) return UNGUELTIG;
    return speichereAngaben(getDb(), k.data, bearbeiterAus(viewer), Date.now());
  });
}
```

`K/_actions/zeichen.ts`:

```ts
"use server";

import { z } from "zod";
import type { Symbolquelle } from "../_lib/zeichen/grundlagen";
import { symboleFuerSchluessel } from "../_lib/zeichen/zeichen";
import { requireKommplanBearbeitenAktion } from "../_lib/zugang";

// Lesend: die SVGs der Suchtreffer und neu gewählter Zeichen (Entscheidung 4). Das Rezept-Generat
// bleibt so auf dem Server; eine Client-Insel importiert diese Datei nur als Aufrufverweis.
const eingabe = z.array(z.string().min(1).max(80)).max(40);

export async function ladeZeichenAction(schluessel: unknown): Promise<Record<string, Symbolquelle>> {
  await requireKommplanBearbeitenAktion();
  const r = eingabe.safeParse(schluessel);
  return r.success ? symboleFuerSchluessel(r.data) : {};
}
```

In `src/core/audit/coverage-manifest.json` in alphabetischer Nachbarschaft der übrigen `src/app/m/…/_actions/…`-Einträge ergänzen:

```json
  "src/app/m/kommplan/_actions/plan.ts#legePlanAnAction": { "kind": "context", "via": "legePlanAnAction" },
  "src/app/m/kommplan/_actions/plan.ts#speichereAngabenAction": { "kind": "context", "via": "speichereAngabenAction" },
  "src/app/m/kommplan/_actions/plan.ts#speichereInhaltAction": { "kind": "context", "via": "speichereInhaltAction" },
  "src/app/m/kommplan/_actions/zeichen.ts#ladeZeichenAction": { "kind": "excluded", "reason": "Liest nur Zeichen-SVGs aus dem eingecheckten Generat für die Suche im Editor; schreibt nichts." },
```

- [ ] **Step 6: Grenze in `grenze.test.ts`**

Hinter `const istClient = …` einfügen:

```ts
/**
 * Eine Server-Action-Datei ist für den Browser nur ein Aufrufverweis: was sie importiert, landet
 * NICHT im Bündel der Insel. Erkannt wird sie genau wie in `src/core/audit/coverage.test.ts`
 * (Direktive auf Byte 0, doppelte Anführungszeichen) — eine anders geschriebene Datei wäre dort
 * nicht im Manifest und hier keine Grenze; beides fällt dann auf.
 */
const istServerAktion = (q: string) => q.startsWith('"use server"');
```

In `erreichbar` nach `gesehen.add(datei);` einfügen: `if (datei !== start && istServerAktion(quelltext(datei))) continue; // Grenze: nur Aufrufverweis`. In „geteilte Ordner sind rein" die Liste um `"_lib/angaben.ts"`, `"_lib/ergebnis.ts"` erweitern.

- [ ] **Step 7: Grün sehen**

Run: `pnpm vitest run src/app/m/kommplan src/core/audit && pnpm typecheck; echo "typecheck exit $?"`
Expected: PASS (auch `coverage.test.ts` mit den vier neuen Einträgen), exit 0.

Run: `pnpm build`
Expected: Build grün; `"use server"`-Dateien exportieren nur async-Funktionen (sonst bricht der Build hier).

- [ ] **Step 8: Ankerschritt und Commit**

Ankerschritt für `zugang.ts`, `zeichen.ts`, `grundlagen.ts`, `coverage-manifest.json`, `grenze.test.ts`.

```bash
git add src/app/m/kommplan/_actions src/app/m/kommplan/_lib/zugang.ts src/app/m/kommplan/_lib/zugang.test.ts src/app/m/kommplan/_lib/zeichen src/app/m/kommplan/grenze.test.ts src/core/audit/coverage-manifest.json
git commit -S -m "feat(kommplan): Server Actions zum Anlegen und Speichern, Zeichen-Index für die Suche

Jede Action prüft Host, Anmeldung und Bearbeiten-Recht selbst; das
Rezept-Generat bleibt auf dem Server, der Editor bekommt einen Index
ohne SVG und lädt Treffer nach.

DRK-500

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Planliste — „Neu" für Bearbeitende, danach direkt in den Editor

**Files:**
- Create: `K/(intern)/NeuerPlan.tsx`, `K/(intern)/NeuerPlan.test.tsx`
- Modify: `K/(intern)/page.tsx`

**Interfaces:**
- Consumes: `legePlanAnAction` (Task 6, direkt importiert — Falle 9), `PLAN_TYPEN`, `TYP_NAME`, `LAENGE_ANLASS`, `type PlanTyp` (Task 5), `LAENGE` (Task 2), `darfKommplanBearbeiten`, `requireKommplanZugang` (liefert den Viewer), `flyinBreite`, `enterUebernimmtNurDasFeld`.
- Produces: `NeuerPlan()` (Knopf „Neu" + Drawer), `NeuerPlanFormular({ onAngelegt, onAbbrechen }: { onAngelegt: (id: string) => void; onAbbrechen: () => void })` — separat exportiert, damit der DOM-Test ohne Portal auskommt.

- [ ] **Step 1: Failing test**

`K/(intern)/NeuerPlan.test.tsx`:

```tsx
// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { click, existsPortal, fill, mount, query, submitForm, unmount } from "@/app/m/qr/_lib/test-dom";

const aktion = vi.hoisted(() => ({ legePlanAnAction: vi.fn() }));
vi.mock("../_actions/plan", () => aktion);
const router = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => router }));
import { NeuerPlan, NeuerPlanFormular } from "./NeuerPlan";

afterEach(() => { unmount(); aktion.legePlanAnAction.mockReset(); router.push.mockReset(); });

describe("Neuer Plan", () => {
  it("der Knopf öffnet das Flyin", async () => {
    await mount(<NeuerPlan />);
    await click("button[data-neu]");
    expect(existsPortal('form[aria-label="Neuer Plan"]')).toBe(true);
  });
  it("sendet Titel, Art, Anlass und Datum und meldet die neue ID", async () => {
    aktion.legePlanAnAction.mockResolvedValue({ ok: true, id: "p-neu" });
    const angelegt = vi.fn();
    await mount(<NeuerPlanFormular onAngelegt={angelegt} onAbbrechen={() => {}} />);
    await fill('input[name="titel"]', "Übung Nord");
    await fill('input[name="anlass"]', "Probe");
    await submitForm();
    await act(async () => {});
    expect(aktion.legePlanAnAction).toHaveBeenCalledWith({ titel: "Übung Nord", typ: "kommunikationsplan", anlass: "Probe", datum: null });
    expect(angelegt).toHaveBeenCalledWith("p-neu");
  });
  it("Feldfehler stehen am Feld, nicht rot, mit aria-invalid", async () => {
    aktion.legePlanAnAction.mockResolvedValue({ ok: false, fehler: "Bitte die markierten Felder prüfen.", feldFehler: { titel: "Bitte einen Titel eintragen." } });
    await mount(<NeuerPlanFormular onAngelegt={() => {}} onAbbrechen={() => {}} />);
    await submitForm();
    await act(async () => {});
    expect(query('input[name="titel"]').getAttribute("aria-invalid")).toBe("true");
    expect(document.body.textContent).toContain("Bitte einen Titel eintragen.");
    expect(document.querySelector(".ant-alert-error")).toBeNull();
  });
  it("ein Wurf (keine Verbindung, Recht entzogen) wird ein Hinweis, kein Absturz", async () => {
    aktion.legePlanAnAction.mockRejectedValue(new Error("Forbidden"));
    await mount(<NeuerPlanFormular onAngelegt={() => {}} onAbbrechen={() => {}} />);
    await fill('input[name="titel"]', "X");
    await submitForm();
    await act(async () => {});
    expect(document.body.textContent).toContain("Der Plan ließ sich nicht anlegen.");
  });
});
```

- [ ] **Step 2: Rot sehen**

Run: `pnpm vitest run "src/app/m/kommplan/(intern)/NeuerPlan.test.tsx"`
Expected: FAIL — Modul fehlt.

- [ ] **Step 3: Implementieren**

`K/(intern)/NeuerPlan.tsx`:

```tsx
"use client";

import { useId, useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import type { Dayjs } from "dayjs";
import { Alert, Button, DatePicker, Drawer, Input, Select, type InputRef } from "antd";
import { enterUebernimmtNurDasFeld } from "@/core/formular/enter";
import { flyinBreite } from "@/core/theme/flyin";
import { legePlanAnAction } from "../_actions/plan";
import { LAENGE_ANLASS, PLAN_TYPEN, TYP_NAME, type PlanTyp } from "../_lib/angaben";
import type { FeldFehler } from "../_lib/ergebnis";
import { LAENGE } from "../_lib/plan/schema";

/**
 * „Neu" in der Planliste (Spec §6.1): Titel, Art, Anlass, Datum — danach direkt in den Editor.
 * Eigenes `<form>` mit `useState`, kein antd-`Form` (Vorbild `einsatzbuch/_ui/stammdaten/
 * StammdatenFormular.tsx`); Feldfehler als Text am Feld (docs/design/feedback-admin.md 4.4).
 * Die Seite rendert diese Insel nur für `darfKommplanBearbeiten` — dasselbe Prädikat prüft die Action.
 */
export function NeuerPlan() {
  const router = useRouter();
  const [offen, setOffen] = useState(false);
  const titelRef = useRef<InputRef>(null);
  return (
    <>
      <Button type="primary" data-neu="" onClick={() => setOffen(true)}>Neu</Button>
      <Drawer open={offen} onClose={() => setOffen(false)} title="Neuer Plan" size={flyinBreite(480)} destroyOnHidden
        afterOpenChange={(auf) => { if (auf) titelRef.current?.focus(); }}>
        {offen ? <NeuerPlanFormular titelRef={titelRef} onAngelegt={(id) => router.push(`/p/${id}`)} onAbbrechen={() => setOffen(false)} /> : null}
      </Drawer>
    </>
  );
}

export function NeuerPlanFormular({ onAngelegt, onAbbrechen, titelRef }: {
  onAngelegt: (id: string) => void; onAbbrechen: () => void; titelRef?: React.Ref<InputRef>;
}) {
  const basis = useId();
  const [titel, setTitel] = useState("");
  const [typ, setTyp] = useState<PlanTyp>("kommunikationsplan");
  const [anlass, setAnlass] = useState("");
  const [datum, setDatum] = useState<Dayjs | null>(null);
  const [fehler, setFehler] = useState<string | null>(null);
  const [feldFehler, setFeldFehler] = useState<FeldFehler>({});
  const [laeuft, setLaeuft] = useState(false);

  function absenden(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (laeuft) return;
    setFehler(null); setFeldFehler({}); setLaeuft(true);
    void legePlanAnAction({ titel, typ, anlass, datum: datum ? datum.format("YYYY-MM-DD") : null })
      .then((r) => {
        if (r.ok) { onAngelegt(r.id); return; }
        setFehler(r.fehler); setFeldFehler(r.feldFehler); setLaeuft(false);
      })
      .catch(() => { setFehler("Der Plan ließ sich nicht anlegen. Prüfe die Verbindung und versuche es noch einmal."); setLaeuft(false); });
  }

  const feld = (name: keyof FeldFehler & string) => ({
    id: `${basis}-${name}`, "aria-invalid": feldFehler[name] ? true : undefined,
    "aria-describedby": feldFehler[name] ? `${basis}-${name}-fehler` : undefined,
  });
  const fehlerText = (name: string) => (feldFehler[name] ? <p id={`${basis}-${name}-fehler`} className="kp-feldfehler">{feldFehler[name]}</p> : null);

  return (
    <form aria-label="Neuer Plan" onSubmit={absenden} className="kp-formular">
      {fehler && Object.keys(feldFehler).length === 0 ? <Alert type="warning" showIcon message={fehler} /> : null}
      <label className="kp-feldname" htmlFor={`${basis}-titel`}>Titel</label>
      <Input ref={titelRef} name="titel" value={titel} maxLength={LAENGE.titel} onChange={(e) => setTitel(e.target.value)} {...feld("titel")} />
      {fehlerText("titel")}
      <label className="kp-feldname" htmlFor={`${basis}-typ`}>Art</label>
      <Select id={`${basis}-typ`} value={typ} onChange={setTyp} options={PLAN_TYPEN.map((t) => ({ value: t, label: TYP_NAME[t] }))} />
      <label className="kp-feldname" htmlFor={`${basis}-anlass`}>Anlass</label>
      <Input name="anlass" value={anlass} maxLength={LAENGE_ANLASS} onChange={(e) => setAnlass(e.target.value)} {...feld("anlass")} />
      {fehlerText("anlass")}
      <label className="kp-feldname" htmlFor={`${basis}-datum`}>Datum</label>
      <DatePicker id={`${basis}-datum`} value={datum} onChange={setDatum} format="DD.MM.YYYY" onKeyDown={enterUebernimmtNurDasFeld}
        status={feldFehler.datum ? "error" : undefined} />
      {fehlerText("datum")}
      <div className="kp-formular-knoepfe">
        <Button type="primary" htmlType="submit" loading={laeuft} disabled={laeuft}>Anlegen und bearbeiten</Button>
        <Button onClick={onAbbrechen}>Abbrechen</Button>
      </div>
    </form>
  );
}
```

In `K/_ui/kommplan.css` anhängen:

```css
/* Formulare in Flyins (NeuerPlan, PlanFlyin, StelleFlyin): Beschriftung über dem Feld, Feldfehler als
   gedämpfter Text, nie rot (Falle 3, docs/design/feedback-admin.md 4.4). Feldnamen tragen eine EIGENE
   Klasse statt `.kp-formular label`: antd rendert Checkbox, Radio-Knöpfe und Schalter selbst in
   `<label>`, und (0,1,1) schlüge deren Ein-Klassen-Regeln — versal-graue Radioknöpfe (Falle 5). */
.kp-formular { display: grid; gap: 8px; }
.kp-feldname { font-size: 12px; font-weight: 600; letter-spacing: .06em; text-transform: uppercase; color: var(--kp-gedaempft); margin-top: 8px; }
.kp-feldfehler { margin: 0; font-size: 12px; color: var(--kp-gedaempft); }
.kp-formular-knoepfe { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 16px; }
@media (max-width: 767.98px) { .kp-formular-knoepfe > * { flex: 1 1 100%; } }
```

und in beiden Variablenblöcken (`:root` und `:root[data-theme="dark"]`) je eine Variable ergänzen (hinter `--kp-rand`, gleiche Zeile): hell `--kp-gedaempft: #5b6573;`, dunkel `--kp-gedaempft: #a9b2bf;`.

In `K/(intern)/page.tsx`: `const viewer = await requireKommplanZugang();` statt des nackten `await …`, Import `darfKommplanBearbeiten` aus `../_lib/zugang` und `NeuerPlan` aus `./NeuerPlan`, dann am `Seitenkopf`: `aktionen={darfKommplanBearbeiten(viewer.groups) ? <NeuerPlan /> : undefined}` und die Beschreibung ersetzen durch `"Pläne und Fernmeldeskizzen deiner Einsätze. Öffne einen Plan, um ihn anzusehen, zu bearbeiten oder auf A4 zu drucken."`

- [ ] **Step 4: Grün sehen**

Run: `pnpm vitest run "src/app/m/kommplan/(intern)" && pnpm typecheck; echo "typecheck exit $?"`
Expected: PASS, exit 0. Scheitert `onChange={setTyp}` am Typ des antd-`Select` (Wert kann `PlanTyp` oder Optionsobjekt sein), `onChange={(v: PlanTyp) => setTyp(v)}` schreiben.

- [ ] **Step 5: Ankerschritt und Commit**

Ankerschritt für `(intern)/page.tsx` und `kommplan.css`.

```bash
git add "src/app/m/kommplan/(intern)/NeuerPlan.tsx" "src/app/m/kommplan/(intern)/NeuerPlan.test.tsx" "src/app/m/kommplan/(intern)/page.tsx" src/app/m/kommplan/_ui/kommplan.css
git commit -S -m "feat(kommplan): Neuer Plan aus der Planliste, danach direkt in den Editor

Nur für Bearbeitende sichtbar, dasselbe Recht prüft die Action;
Feldfehler stehen am Feld.

DRK-500

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Reine Editor-Bausteine — Verlauf, Tasten, Navigation, Suche, „zuletzt genutzt", IDs

**Files:**
- Create: `K/_ui/editor/verlauf.ts`, `tasten.ts`, `navigation.ts`, `suche.ts`, `zuletzt.ts`, `ids.ts`
- Test: je `K/_ui/editor/<name>.test.ts`

**Interfaces:**
- Consumes: `PlanInhalt`, `Stelle` (schema.ts), `baueSicht` (`_lib/layout/sicht.ts`), `anzeigereihenfolge` (`_lib/layout/gruppen.ts`), `ZeichenIndexEintrag` (grundlagen.ts, Typ).
- Produces (alle ohne React, ohne `"use client"`):
  - `verlauf.ts`: `interface Verlauf { vergangen: readonly PlanInhalt[]; jetzt: PlanInhalt; zukunft: readonly PlanInhalt[]; buendel: { schluessel: string; bis: number } | null }`; `VERLAUF_TIEFE = 200`; `BUENDEL_MS = 1500`; `neuerVerlauf(inhalt)`; `tue(v, neu, jetzt: number, schluessel?: string): Verlauf`; `rueckgaengig(v)`; `wiederholen(v)`; `kannRueckgaengig(v): boolean`; `kannWiederholen(v): boolean`.
  - `tasten.ts`: `interface Taste { key: string; ctrlKey: boolean; metaKey: boolean; shiftKey: boolean; altKey: boolean }`; `type Richtung = "hoch" | "runter" | "links" | "rechts"`; `type Befehl = { art: "rueckgaengig" } | { art: "wiederholen" } | { art: "wandere"; richtung: Richtung } | { art: "oeffnen" } | { art: "neueUnterstelle" } | { art: "loeschen" } | { art: "abwaehlen" }`; `globalerBefehl(t: Taste, imTextfeld: boolean): Befehl | null`; `flaechenBefehl(t: Taste): Befehl | null`; `istTextfeld(ziel: EventTarget | null): boolean`.
  - `navigation.ts`: `wandere(inhalt: PlanInhalt, eingeklappt: ReadonlySet<string>, von: string | null, richtung: Richtung): string | null`.
  - `suche.ts`: `sucheZeichen(index: readonly ZeichenIndexEintrag[], anfrage: string, max?: number): ZeichenIndexEintrag[]`.
  - `zuletzt.ts`: `ZULETZT_MAX = 8`; `leseZuletzt(): string[]`; `merkeZuletzt(schluessel: string): string[]`.
  - `ids.ts`: `neueId(inhalt: PlanInhalt, praefix: "s" | "e" | "v", zufall?: () => string): string`; `neueIds(inhalt: PlanInhalt, praefix: "s" | "e" | "v", anzahl: number, zufall?: () => string): string[]` (paarweise verschieden, für „Liste einfügen").

- [ ] **Step 1: Failing tests**

`K/_ui/editor/verlauf.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { fuegeWurzelEin, leererPlan } from "../../_lib/plan/operationen";
import { BUENDEL_MS, kannRueckgaengig, kannWiederholen, neuerVerlauf, rueckgaengig, tue, VERLAUF_TIEFE, wiederholen } from "./verlauf";

const a = leererPlan(), b = fuegeWurzelEin(a, "b"), c = fuegeWurzelEin(b, "c"), d = fuegeWurzelEin(c, "d");

describe("Rückgängig/Wiederholen (Spec §6.6: Client-Stapel von Dokumenten)", () => {
  it("rückgängig und wiederholen wandern über dieselben Objekte", () => {
    let v = tue(tue(neuerVerlauf(a), b, 0), c, 5000);
    v = rueckgaengig(v);
    expect(v.jetzt).toBe(b);
    v = rueckgaengig(v);
    expect(v.jetzt).toBe(a);
    expect(kannRueckgaengig(v)).toBe(false);
    expect(rueckgaengig(v)).toBe(v);
    v = wiederholen(v);
    expect(v.jetzt).toBe(b);
    expect(kannWiederholen(v)).toBe(true);
  });
  it("eine neue Änderung verwirft das Wiederholen", () => {
    const v = tue(rueckgaengig(tue(tue(neuerVerlauf(a), b, 0), c, 5000)), d, 9000);
    expect(v.jetzt).toBe(d);
    expect(kannWiederholen(v)).toBe(false);
    expect(rueckgaengig(v).jetzt).toBe(b);
  });
  it("gleicher Schlüssel innerhalb der Bündelzeit ist EIN Schritt (Tippen im Titel)", () => {
    let v = tue(neuerVerlauf(a), b, 0, "titel:s1");
    v = tue(v, c, BUENDEL_MS - 1, "titel:s1");
    v = tue(v, d, 2 * BUENDEL_MS - 2, "titel:s1"); // gleitend: jede Eingabe verlängert
    expect(rueckgaengig(v).jetzt).toBe(a);
    const getrennt = tue(tue(neuerVerlauf(a), b, 0, "titel:s1"), c, 10, "leiter:s1");
    expect(rueckgaengig(getrennt).jetzt).toBe(b);
    const spaeter = tue(tue(neuerVerlauf(a), b, 0, "titel:s1"), c, BUENDEL_MS + 1, "titel:s1");
    expect(rueckgaengig(spaeter).jetzt).toBe(b);
  });
  it("dasselbe Objekt ist keine Änderung; die Tiefe ist begrenzt", () => {
    const v = tue(neuerVerlauf(a), b, 0);
    expect(tue(v, b, 1)).toBe(v);
    let lang = neuerVerlauf(a);
    for (let i = 0; i < VERLAUF_TIEFE + 10; i++) lang = tue(lang, fuegeWurzelEin(a, `w${i}`), i * 10_000);
    expect(lang.vergangen).toHaveLength(VERLAUF_TIEFE);
  });
});
```

`K/_ui/editor/tasten.test.ts`:

```ts
// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { flaechenBefehl, globalerBefehl, istTextfeld, type Taste } from "./tasten";

const t = (key: string, mehr: Partial<Taste> = {}): Taste => ({ key, ctrlKey: false, metaKey: false, shiftKey: false, altKey: false, ...mehr });

describe("Tastenbefehle", () => {
  it("Strg/Cmd+Z, Shift+Strg/Cmd+Z und Strg+Y — nie in einem Textfeld", () => {
    expect(globalerBefehl(t("z", { ctrlKey: true }), false)).toEqual({ art: "rueckgaengig" });
    expect(globalerBefehl(t("z", { metaKey: true }), false)).toEqual({ art: "rueckgaengig" });
    expect(globalerBefehl(t("Z", { metaKey: true, shiftKey: true }), false)).toEqual({ art: "wiederholen" });
    expect(globalerBefehl(t("y", { ctrlKey: true }), false)).toEqual({ art: "wiederholen" });
    expect(globalerBefehl(t("z", { ctrlKey: true }), true)).toBeNull();
    expect(globalerBefehl(t("z"), false)).toBeNull();
  });
  it("auf der Fläche: Pfeile, Enter, N, Entf und Rücktaste, Escape — ohne Modifikator", () => {
    expect(flaechenBefehl(t("ArrowLeft"))).toEqual({ art: "wandere", richtung: "links" });
    expect(flaechenBefehl(t("ArrowDown"))).toEqual({ art: "wandere", richtung: "runter" });
    expect(flaechenBefehl(t("Enter"))).toEqual({ art: "oeffnen" });
    expect(flaechenBefehl(t("n"))).toEqual({ art: "neueUnterstelle" });
    expect(flaechenBefehl(t("N", { shiftKey: true }))).toEqual({ art: "neueUnterstelle" });
    expect(flaechenBefehl(t("Delete"))).toEqual({ art: "loeschen" });
    expect(flaechenBefehl(t("Backspace"))).toEqual({ art: "loeschen" });
    expect(flaechenBefehl(t("Escape"))).toEqual({ art: "abwaehlen" });
    expect(flaechenBefehl(t("n", { ctrlKey: true }))).toBeNull();
    expect(flaechenBefehl(t("+"))).toBeNull(); // Zoom bleibt Sache der Fläche
  });
  it("erkennt Textfelder, auch verschachtelt", () => {
    document.body.innerHTML = '<input id="i"><div contenteditable="true"><span id="s"></span></div><button id="b"></button>';
    expect(istTextfeld(document.getElementById("i"))).toBe(true);
    expect(istTextfeld(document.getElementById("s"))).toBe(true);
    expect(istTextfeld(document.getElementById("b"))).toBe(false);
    expect(istTextfeld(null)).toBe(false);
  });
});
```

`K/_ui/editor/navigation.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { baue } from "../../_lib/beispiele/bau";
import { leererPlan } from "../../_lib/plan/operationen";
import { wandere } from "./navigation";

const V = [{ id: "v1", art: "tmo" as const, bezeichnung: "R_UE_2" }, { id: "v2", art: "tmo" as const, bezeichnung: "R_UE_3" }];
const plan = baue({
  verbindungen: V,
  stellen: [
    { id: "el", titel: "EL" },
    { id: "l", titel: "KatSL", eltern: "el", lage: "links" },
    { id: "a", titel: "EA 1", eltern: "el", verbindung: "v2" },
    { id: "b", titel: "EA 2", eltern: "el", verbindung: "v1" },
    { id: "c", titel: "EA 3", eltern: "el", verbindung: "v2" },
    { id: "bs", titel: "Seite", eltern: "b", lage: "rechts" },
    { id: "b1", titel: "Trupp", eltern: "b" },
  ],
});
const keine = new Set<string>();

describe("Pfeiltasten im Baum (Entscheidung 9)", () => {
  it("ohne Auswahl: die erste Wurzel; leerer Plan: nichts (Review Focus 1)", () => {
    expect(wandere(plan, keine, null, "rechts")).toBe("el");
    expect(wandere(leererPlan(), keine, null, "runter")).toBeNull();
  });
  it("hoch zur Elternstelle, runter zur ersten Unterstelle in Anzeigereihenfolge", () => {
    // Gruppen unter el: v2 (a, c — kleinste reihenfolge 1) vor v1 (b)
    expect(wandere(plan, keine, "el", "runter")).toBe("a");
    expect(wandere(plan, keine, "b1", "hoch")).toBe("b");
    expect(wandere(plan, keine, "bs", "hoch")).toBe("b");
    expect(wandere(plan, keine, "el", "hoch")).toBe("el");
    expect(wandere(plan, keine, "bs", "runter")).toBe("bs");
  });
  it("links/rechts in Anzeigereihenfolge, Seitenstellen rahmen ihre Stelle ein, kein Umlauf", () => {
    expect(wandere(plan, keine, "a", "rechts")).toBe("c");
    expect(wandere(plan, keine, "c", "rechts")).toBe("b");
    expect(wandere(plan, keine, "b", "rechts")).toBe("bs");
    expect(wandere(plan, keine, "bs", "rechts")).toBe("bs");
    expect(wandere(plan, keine, "el", "links")).toBe("l");
    expect(wandere(plan, keine, "l", "rechts")).toBe("el");
  });
  it("über Kammreihen hinweg: der Nachbar ist das nächste Kind, nicht die nächste Karte derselben Höhe", () => {
    const kamm = baue({
      verbindungen: [V[0]],
      stellen: [{ id: "w", titel: "W" }, ...Array.from({ length: 14 }, (_, i) => ({ id: `k${i}`, titel: `Kind ${i}`, eltern: "w", verbindung: "v1" }))],
    });
    for (let i = 0; i < 13; i++) expect(wandere(kamm, keine, `k${i}`, "rechts")).toBe(`k${i + 1}`);
  });
  it("eingeklappt: runter bleibt stehen; eine versteckte Auswahl springt zur ersten Wurzel", () => {
    const zu = new Set(["b"]);
    expect(wandere(plan, zu, "b", "runter")).toBe("b");
    expect(wandere(plan, zu, "b1", "hoch")).toBe("el");
  });
});
```

`K/_ui/editor/suche.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { sucheZeichen } from "./suche";

const INDEX = [
  { schluessel: "rezept:D.1.4", titel: "Einsatzleitung im Einsatz", suchtext: "einsatzleitung d.1.4" },
  { schluessel: "zusatz:eal", titel: "Einsatzabschnittsleitung", suchtext: "eal abschnitt" },
  { schluessel: "rezept:C.1.1", titel: "Löschstaffel", suchtext: "löschstaffel c.1.1" },
  { schluessel: "rezept:X.9", titel: "Führungsstelle", suchtext: "stelle einsatz" },
];

describe("Zeichen-Suche", () => {
  it("alle Wörter müssen vorkommen; Titelanfang vor Titelmitte vor Suchtext", () => {
    expect(sucheZeichen(INDEX, "einsatz").map((e) => e.schluessel)).toEqual(["zusatz:eal", "rezept:D.1.4", "rezept:X.9"]);
    expect(sucheZeichen(INDEX, "LÖSCH").map((e) => e.schluessel)).toEqual(["rezept:C.1.1"]);
    expect(sucheZeichen(INDEX, "einsatz leitung").map((e) => e.schluessel)).toEqual(["zusatz:eal", "rezept:D.1.4"]);
    expect(sucheZeichen(INDEX, "d.1.4").map((e) => e.schluessel)).toEqual(["rezept:D.1.4"]);
  });
  it("leere Anfrage: nichts; höchstens max Treffer", () => {
    expect(sucheZeichen(INDEX, "   ")).toEqual([]);
    expect(sucheZeichen(INDEX, "e", 2)).toHaveLength(2);
  });
});
```

`K/_ui/editor/zuletzt.test.ts`:

```ts
// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { leseZuletzt, merkeZuletzt, ZULETZT_MAX } from "./zuletzt";

afterEach(() => { vi.restoreAllMocks(); window.localStorage.clear(); });

describe("zuletzt genutzte Zeichen", () => {
  it("neueste zuerst, ohne Doppel, höchstens acht", () => {
    for (let i = 0; i < 10; i++) merkeZuletzt(`z${i}`);
    merkeZuletzt("z5");
    expect(leseZuletzt()).toEqual(["z5", "z9", "z8", "z7", "z6", "z4", "z3", "z2"]);
    expect(leseZuletzt()).toHaveLength(ZULETZT_MAX);
  });
  it("kaputter oder gesperrter Speicher: leer, kein Wurf", () => {
    window.localStorage.setItem("kommplan:zeichen:zuletzt", "{kaputt");
    expect(leseZuletzt()).toEqual([]);
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => { throw new Error("SecurityError"); });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("QuotaExceeded"); });
    expect(leseZuletzt()).toEqual([]);
    expect(merkeZuletzt("x")).toEqual(["x"]);
  });
});
```

`K/_ui/editor/ids.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from "vitest";
import { baue } from "../../_lib/beispiele/bau";
import { neueId, neueIds } from "./ids";

afterEach(() => vi.restoreAllMocks());

describe("neue IDs", () => {
  it("weicht vergebenen IDs aus — Stellen, Einheiten und Verbindungen teilen einen Namensraum", () => {
    const p = baue({ verbindungen: [{ id: "v-aaaa", art: "tmo", bezeichnung: "X" }], stellen: [{ id: "s-aaaa", titel: "A", einheiten: ["RTW 1"] }] });
    const folge = ["aaaa", "aaaa", "bbbb"];
    expect(neueId(p, "s", () => folge.shift()!)).toBe("s-bbbb");
    expect(neueId(p, "v", () => "cccc")).toBe("v-cccc");
    expect(neueId(p, "e")).toMatch(/^e-[a-z0-9]{8}$/);
  });
  it("braucht keinen sicheren Kontext: ohne randomUUID (http auf *.localtest.me) geht es weiter", () => {
    vi.spyOn(crypto, "randomUUID").mockImplementation(() => { throw new TypeError("crypto.randomUUID is not a function"); });
    expect(neueId(baue({ stellen: [] }), "s")).toMatch(/^s-[a-z0-9]{8}$/);
  });
  it("mehrere auf einmal sind auch untereinander verschieden", () => {
    const p = baue({ stellen: [{ id: "w", titel: "W" }] });
    const folge = ["x", "x", "y", "z"];
    expect(neueIds(p, "e", 3, () => folge.shift()!)).toEqual(["e-x", "e-y", "e-z"]);
  });
});
```

- [ ] **Step 2: Rot sehen**

Run: `pnpm vitest run src/app/m/kommplan/_ui/editor`
Expected: FAIL — Module fehlen.

- [ ] **Step 3: Implementieren**

`K/_ui/editor/verlauf.ts`:

```ts
import type { PlanInhalt } from "../../_lib/plan/schema";

/**
 * RÜCKGÄNGIG/WIEDERHOLEN (Spec §6.6): ein Stapel von Dokumenten, gültig bis zum Neuladen. Weil jede
 * Planoperation ein NEUES Objekt liefert, ist „dasselbe Objekt" gleichbedeutend mit „keine
 * Änderung" — der Speicherer (`speicherer.ts`) nutzt dieselbe Gleichheit.
 *
 * BÜNDELN: Änderungen mit demselben Schlüssel (z. B. `titel:<stelle>`) innerhalb von `BUENDEL_MS`
 * seit der LETZTEN solchen Änderung sind ein Schritt — sonst wäre jeder Tastendruck im Titelfeld
 * ein eigener Rückgängig-Schritt.
 */
export interface Verlauf {
  vergangen: readonly PlanInhalt[];
  jetzt: PlanInhalt;
  zukunft: readonly PlanInhalt[];
  buendel: { schluessel: string; bis: number } | null;
}
export const VERLAUF_TIEFE = 200;
export const BUENDEL_MS = 1500;

export function neuerVerlauf(inhalt: PlanInhalt): Verlauf {
  return { vergangen: [], jetzt: inhalt, zukunft: [], buendel: null };
}

export function tue(v: Verlauf, neu: PlanInhalt, jetzt: number, schluessel?: string): Verlauf {
  if (neu === v.jetzt) return v;
  const buendel = schluessel === undefined ? null : { schluessel, bis: jetzt + BUENDEL_MS };
  const weiter = schluessel !== undefined && v.buendel?.schluessel === schluessel && jetzt <= v.buendel.bis && v.vergangen.length > 0;
  if (weiter) return { vergangen: v.vergangen, jetzt: neu, zukunft: [], buendel };
  return { vergangen: [...v.vergangen, v.jetzt].slice(-VERLAUF_TIEFE), jetzt: neu, zukunft: [], buendel };
}

export function rueckgaengig(v: Verlauf): Verlauf {
  if (v.vergangen.length === 0) return v;
  return { vergangen: v.vergangen.slice(0, -1), jetzt: v.vergangen[v.vergangen.length - 1], zukunft: [v.jetzt, ...v.zukunft], buendel: null };
}

export function wiederholen(v: Verlauf): Verlauf {
  if (v.zukunft.length === 0) return v;
  return { vergangen: [...v.vergangen, v.jetzt], jetzt: v.zukunft[0], zukunft: v.zukunft.slice(1), buendel: null };
}

export const kannRueckgaengig = (v: Verlauf) => v.vergangen.length > 0;
export const kannWiederholen = (v: Verlauf) => v.zukunft.length > 0;
```

`K/_ui/editor/tasten.ts`:

```ts
/**
 * TASTATUR DES EDITORS (Spec §6.3, §6.6) als reine Abbildung Taste → Befehl.
 * - Rückgängig/Wiederholen gelten global, aber NIE in einem Textfeld: dort gehört Strg+Z dem Feld.
 * - Die Flächenbefehle gelten nur, wenn die Zeichenfläche den Fokus hat (das Flyin ist ein Portal
 *   außerhalb der Fläche) — so löscht „Entf" im Titelfeld nie die Karte.
 * - Rücktaste zählt wie Entf: auf Mac-Tastaturen heißt „Entf" so.
 */
export interface Taste { key: string; ctrlKey: boolean; metaKey: boolean; shiftKey: boolean; altKey: boolean }
export type Richtung = "hoch" | "runter" | "links" | "rechts";
export type Befehl =
  | { art: "rueckgaengig" } | { art: "wiederholen" } | { art: "wandere"; richtung: Richtung }
  | { art: "oeffnen" } | { art: "neueUnterstelle" } | { art: "loeschen" } | { art: "abwaehlen" };

export function globalerBefehl(t: Taste, imTextfeld: boolean): Befehl | null {
  if (imTextfeld || t.altKey || !(t.ctrlKey || t.metaKey)) return null;
  const k = t.key.toLowerCase();
  if (k === "z") return t.shiftKey ? { art: "wiederholen" } : { art: "rueckgaengig" };
  if (k === "y" && !t.shiftKey) return { art: "wiederholen" };
  return null;
}

const PFEILE: Readonly<Record<string, Richtung>> = { ArrowUp: "hoch", ArrowDown: "runter", ArrowLeft: "links", ArrowRight: "rechts" };

export function flaechenBefehl(t: Taste): Befehl | null {
  if (t.ctrlKey || t.metaKey || t.altKey) return null;
  if (Object.prototype.hasOwnProperty.call(PFEILE, t.key)) return { art: "wandere", richtung: PFEILE[t.key] };
  if (t.key === "Enter") return { art: "oeffnen" };
  if (t.key === "n" || t.key === "N") return { art: "neueUnterstelle" };
  if (t.key === "Delete" || t.key === "Backspace") return { art: "loeschen" };
  if (t.key === "Escape") return { art: "abwaehlen" };
  return null;
}

export function istTextfeld(ziel: EventTarget | null): boolean {
  if (typeof Element === "undefined" || !(ziel instanceof Element)) return false;
  return ziel.closest('input, textarea, select, [contenteditable=""], [contenteditable="true"]') !== null;
}
```

`K/_ui/editor/navigation.ts`:

```ts
import { anzeigereihenfolge } from "../../_lib/layout/gruppen";
import { baueSicht } from "../../_lib/layout/sicht";
import type { PlanInhalt, Stelle } from "../../_lib/plan/schema";
import type { Richtung } from "./tasten";

/**
 * PFEILTASTEN (Entscheidung 9): ↑ Elternstelle, ↓ erste sichtbare Unterstelle, ←/→ Nachbar in der
 * ANZEIGEREIHENFOLGE der Geschwister (Busgruppen wie im Layout), jede Stelle von ihren Seitenstellen
 * eingerahmt. Nicht über Koordinaten: Kammreihen und gestapelte Seitenstellen teilen keine
 * y-Koordinate mit ihren Nachbarn. Kein Umlauf am Ende einer Reihe.
 */
export function wandere(inhalt: PlanInhalt, eingeklappt: ReadonlySet<string>, von: string | null, richtung: Richtung): string | null {
  const sicht = baueSicht(inhalt, { eingeklappt });
  const nachId = new Map(inhalt.stellen.map((s) => [s.id, s]));
  const s = von === null ? undefined : nachId.get(von);
  if (!s || !sicht.sichtbar.some((x) => x.id === s.id)) return sicht.wurzeln[0]?.id ?? null;
  if (richtung === "hoch") return s.eltern ?? s.id;
  if (richtung === "runter") return s.lage === "unter" ? (anzeigereihenfolge(sicht.kinder(s.id))[0]?.id ?? s.id) : s.id;
  const basis: Stelle = s.lage === "unter" ? s : nachId.get(s.eltern!)!;
  const geschwister = basis.eltern === null ? sicht.wurzeln : anzeigereihenfolge(sicht.kinder(basis.eltern));
  const reihe = geschwister.flatMap((g) => { const seite = sicht.seiten(g.id); return [...seite.links, g, ...seite.rechts]; });
  const i = reihe.findIndex((x) => x.id === s.id);
  return reihe[richtung === "links" ? i - 1 : i + 1]?.id ?? s.id;
}
```

`K/_ui/editor/suche.ts`:

```ts
import type { ZeichenIndexEintrag } from "../../_lib/zeichen/grundlagen";

const norm = (s: string) => s.toLocaleLowerCase("de").normalize("NFC");

/** Alle Wörter müssen in Titel oder Suchtext stehen; Titelanfang vor Titelmitte vor Suchtext, dann nach Titel. */
export function sucheZeichen(index: readonly ZeichenIndexEintrag[], anfrage: string, max = 24): ZeichenIndexEintrag[] {
  const woerter = norm(anfrage).split(/\s+/).filter(Boolean);
  if (woerter.length === 0) return [];
  const rang = (e: ZeichenIndexEintrag) => (norm(e.titel).startsWith(woerter[0]) ? 0 : norm(e.titel).includes(woerter[0]) ? 1 : 2);
  return index
    .filter((e) => { const t = `${norm(e.titel)} ${norm(e.suchtext)}`; return woerter.every((w) => t.includes(w)); })
    .sort((a, b) => rang(a) - rang(b) || a.titel.localeCompare(b.titel, "de") || (a.schluessel < b.schluessel ? -1 : 1))
    .slice(0, max);
}
```

`K/_ui/editor/zuletzt.ts`:

```ts
/**
 * „ZULETZT GENUTZT" (Spec §6.4) je Browser — eine Bequemlichkeit, kein Planinhalt. Jeder Zugriff in
 * `try/catch`: privates Fenster und gesperrte Seitendaten werfen, dann gilt die Liste nur für diese
 * Sitzung (bzw. ist leer).
 */
const SCHLUESSEL = "kommplan:zeichen:zuletzt";
export const ZULETZT_MAX = 8;

export function leseZuletzt(): string[] {
  try {
    const roh = window.localStorage.getItem(SCHLUESSEL);
    const wert: unknown = roh ? JSON.parse(roh) : [];
    return Array.isArray(wert) ? wert.filter((x): x is string => typeof x === "string").slice(0, ZULETZT_MAX) : [];
  } catch {
    return [];
  }
}

export function merkeZuletzt(schluessel: string): string[] {
  const neu = [schluessel, ...leseZuletzt().filter((k) => k !== schluessel)].slice(0, ZULETZT_MAX);
  try { window.localStorage.setItem(SCHLUESSEL, JSON.stringify(neu)); } catch { /* nur für diese Sitzung */ }
  return neu;
}
```

`K/_ui/editor/ids.ts`:

```ts
import type { PlanInhalt } from "../../_lib/plan/schema";

/**
 * Stellen, Einheiten und Verbindungen teilen einen ID-Namensraum (Kopfkommentar `_lib/plan/schema.ts`).
 *
 * ⚠️ NICHT `crypto.randomUUID()`: das gibt es nur in einem sicheren Kontext. Lokal und in der e2e
 * läuft die Suite über `http://kommplan.localtest.me:<port>` — Chromium hält nur `localhost`,
 * `*.localhost` und Loopback-IPs über http für vertrauenswürdig, `isSecureContext` ist dort `false`
 * und jedes Einfügen würfe. jsdom hat `randomUUID`, Vitest sähe das nie. `getRandomValues` gibt es
 * auch ohne sicheren Kontext.
 */
function vergeben(inhalt: PlanInhalt): Set<string> {
  return new Set([...inhalt.stellen.flatMap((s) => [s.id, ...s.einheiten.map((e) => e.id)]), ...inhalt.verbindungen.map((v) => v.id)]);
}

const ZEICHEN = "abcdefghijklmnopqrstuvwxyz0123456789";
const ZUFALL = () => Array.from(crypto.getRandomValues(new Uint8Array(8)), (b) => ZEICHEN[b % ZEICHEN.length]).join("");

export function neueIds(inhalt: PlanInhalt, praefix: "s" | "e" | "v", anzahl: number, zufall: () => string = ZUFALL): string[] {
  const belegt = vergeben(inhalt);
  const aus: string[] = [];
  while (aus.length < anzahl) {
    const id = `${praefix}-${zufall()}`;
    if (!belegt.has(id)) { belegt.add(id); aus.push(id); }
  }
  return aus;
}

export function neueId(inhalt: PlanInhalt, praefix: "s" | "e" | "v", zufall: () => string = ZUFALL): string {
  return neueIds(inhalt, praefix, 1, zufall)[0];
}
```

- [ ] **Step 4: Grün sehen**

Run: `pnpm vitest run src/app/m/kommplan/_ui/editor && pnpm typecheck; echo "typecheck exit $?"`
Expected: PASS, exit 0. Weicht in `navigation.test.ts` die Anzeigereihenfolge unter `el` ab (Gruppen sortieren laut Spec §5.2 nach der **kleinsten** `reihenfolge` ihrer Mitglieder: v2 hat a=1… prüfen, welche `reihenfolge` `baue` vergibt — die Seitenstelle `l` zählt unter `el|links`, nicht unter `el|unter`), die Erwartung an `anzeigereihenfolge` ausrichten, nie `wandere` an den Test.

- [ ] **Step 5: Commit**

```bash
git add src/app/m/kommplan/_ui/editor
git commit -S -m "feat(kommplan): Bausteine des Editors — Rückgängig-Stapel, Tasten, Pfeilnavigation, Zeichen-Suche

Reine Funktionen ohne React: Tippen im selben Feld bündelt zu einem
Schritt, Pfeile folgen der Anzeigereihenfolge auch über Kammreihen.

DRK-500

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: Speicherer — Autosave-Warteschlange mit Versionsprüfung und Konflikt

**Files:**
- Create: `K/_ui/editor/speicherer.ts`
- Test: `K/_ui/editor/speicherer.test.ts`

**Interfaces:**
- Consumes: `SpeicherErgebnis`, `Speicherstand` (Task 5), `Planangaben` (Task 5), `PlanInhalt`.
- Produces:
  - `WARTEZEIT_MS = 1000`
  - `type SpeicherStatus = "gespeichert" | "ungespeichert" | "speichert" | "fehler" | "konflikt"`
  - `interface SpeicherZustand { status: SpeicherStatus; version: number; konflikt: Speicherstand | null; zuletztGespeichert: number | null; fehler: string | null }`
  - `interface Senden { inhalt(e: { id: string; version: number; inhalt: PlanInhalt }): Promise<SpeicherErgebnis>; angaben(e: { id: string; version: number; angaben: Planangaben }): Promise<SpeicherErgebnis> }`
  - `class Speicherer` mit `constructor(o: { planId: string; version: number; inhalt: PlanInhalt; senden: Senden; melde: (z: SpeicherZustand) => void; warte?: number })`, `get zustand(): SpeicherZustand`, `aendere(inhalt: PlanInhalt): void`, `angaben(a: Planangaben): Promise<SpeicherErgebnis>`, `jetzt(): Promise<boolean>`, `behalteMeine(): Promise<void>`, `uebernimm(stand: Speicherstand): void`, `erneut(): Promise<void>`, `hatUngespeichertes(): boolean`.

Kein React: die Editor-Insel hält eine Instanz (`useState(() => new Speicherer(…))`) und ruft `aendere` aus ihren Ereignis-Rückrufen — nicht aus einem Effekt (`set-state-in-effect`).

- [ ] **Step 1: Failing tests**

`K/_ui/editor/speicherer.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Planangaben } from "../../_lib/angaben";
import type { SpeicherErgebnis, Speicherstand } from "../../_lib/ergebnis";
import { fuegeWurzelEin, leererPlan } from "../../_lib/plan/operationen";
import type { PlanInhalt } from "../../_lib/plan/schema";
import { Speicherer, WARTEZEIT_MS, type SpeicherZustand } from "./speicherer";

const ANGABEN: Planangaben = { titel: "Übung", typ: "kommunikationsplan", anlass: null, datum: null };
const a = leererPlan(), b = fuegeWurzelEin(a, "b"), c = fuegeWurzelEin(b, "c");

/** Ein Server mit echter Versionsprüfung; `haenge` hält den nächsten Aufruf fest, bis `los()`. */
function server(start = 1) {
  let version = start;
  const log: string[] = [];
  let sperre: Promise<void> | null = null;
  let loese = () => {};
  const stand = (): Speicherstand => ({ version, inhalt: c, angaben: ANGABEN, aktualisiertAm: 99, aktualisiertVon: "Ole" });
  const antworte = async (art: string, v: number): Promise<SpeicherErgebnis> => {
    log.push(`${art}@${v}`);
    if (sperre) await sperre;
    if (v !== version) return { ok: false, grund: "konflikt", stand: stand() };
    version += 1;
    return { ok: true, version, aktualisiertAm: version * 10 };
  };
  return {
    log, get version() { return version; }, set version(v: number) { version = v; },
    haenge() { sperre = new Promise((r) => { loese = () => { sperre = null; r(); }; }); },
    los() { loese(); },
    senden: { inhalt: vi.fn((e: { version: number }) => antworte("inhalt", e.version)), angaben: vi.fn((e: { version: number }) => antworte("angaben", e.version)) },
  };
}
function baueSpeicherer(s: ReturnType<typeof server>, inhalt: PlanInhalt = a) {
  const meldungen: SpeicherZustand[] = [];
  const sp = new Speicherer({ planId: "p", version: s.version, inhalt, senden: s.senden, melde: (z) => meldungen.push(z) });
  return { sp, meldungen };
}

beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => { vi.useRealTimers(); });

describe("Autosave (Spec §6.6)", () => {
  it("sendet etwa 1 s nach der LETZTEN Änderung genau einmal, mit dem dann aktuellen Stand", async () => {
    const s = server();
    const { sp } = baueSpeicherer(s);
    sp.aendere(b);
    await vi.advanceTimersByTimeAsync(WARTEZEIT_MS - 100);
    sp.aendere(c);
    expect(sp.zustand.status).toBe("ungespeichert");
    await vi.advanceTimersByTimeAsync(WARTEZEIT_MS - 1);
    expect(s.log).toEqual([]);
    await vi.advanceTimersByTimeAsync(1);
    expect(s.log).toEqual(["inhalt@1"]);
    expect(s.senden.inhalt).toHaveBeenLastCalledWith({ id: "p", version: 1, inhalt: c });
    expect(sp.zustand).toMatchObject({ status: "gespeichert", version: 2, zuletztGespeichert: 20 });
  });
  it("zurück auf den gespeicherten Stand (Rückgängig): nichts zu senden", async () => {
    const s = server();
    const { sp } = baueSpeicherer(s);
    sp.aendere(b);
    sp.aendere(a);
    expect(sp.zustand.status).toBe("gespeichert");
    await vi.advanceTimersByTimeAsync(5 * WARTEZEIT_MS);
    expect(s.log).toEqual([]);
  });
  it("Änderungen während eines laufenden Aufrufs folgen danach mit der neuen Version — immer nur ein Aufruf", async () => {
    const s = server();
    const { sp } = baueSpeicherer(s);
    s.haenge();
    sp.aendere(b);
    await vi.advanceTimersByTimeAsync(WARTEZEIT_MS);
    expect(sp.zustand.status).toBe("speichert");
    sp.aendere(c);
    await vi.advanceTimersByTimeAsync(WARTEZEIT_MS);
    expect(s.log).toEqual(["inhalt@1"]);
    s.los();
    await vi.advanceTimersByTimeAsync(WARTEZEIT_MS);
    expect(s.log).toEqual(["inhalt@1", "inhalt@2"]);
    expect(sp.zustand).toMatchObject({ status: "gespeichert", version: 3 });
  });
  it("Planangaben, während Inhalt wartet oder läuft: kein falscher Konflikt, Version zählt zweimal (Review Focus 5)", async () => {
    const s = server();
    const { sp } = baueSpeicherer(s);
    sp.aendere(b);
    const angaben = sp.angaben(ANGABEN);
    await vi.advanceTimersByTimeAsync(WARTEZEIT_MS);
    expect(await angaben).toMatchObject({ ok: true, version: 2 });
    expect(s.log).toEqual(["angaben@1", "inhalt@2"]);
    expect(sp.zustand).toMatchObject({ status: "gespeichert", version: 3 });
  });
  it("Konflikt: Hinweis mit Serverstand, danach kein automatisches Speichern mehr", async () => {
    const s = server();
    const { sp } = baueSpeicherer(s);
    s.version = 5; // jemand anderes hat gespeichert
    sp.aendere(b);
    await vi.advanceTimersByTimeAsync(WARTEZEIT_MS);
    expect(sp.zustand).toMatchObject({ status: "konflikt", konflikt: { version: 5, aktualisiertVon: "Ole" } });
    sp.aendere(c);
    await vi.advanceTimersByTimeAsync(5 * WARTEZEIT_MS);
    expect(s.log).toEqual(["inhalt@1"]);
  });
  it("„Meine Fassung behalten" sendet sofort mit der Serverversion und überschreibt", async () => {
    const s = server();
    const { sp } = baueSpeicherer(s);
    s.version = 5;
    sp.aendere(b);
    await vi.advanceTimersByTimeAsync(WARTEZEIT_MS);
    await sp.behalteMeine();
    expect(s.log).toEqual(["inhalt@1", "inhalt@5"]);
    expect(s.senden.inhalt).toHaveBeenLastCalledWith({ id: "p", version: 5, inhalt: b });
    expect(sp.zustand).toMatchObject({ status: "gespeichert", version: 6, konflikt: null });
  });
  it("„Meine Fassung behalten" sendet auch, wenn der Konflikt beim Übernehmen der Planangaben entstand", async () => {
    const s = server();
    const { sp } = baueSpeicherer(s);
    s.version = 5;
    expect(await sp.angaben(ANGABEN)).toMatchObject({ ok: false, grund: "konflikt" });
    await sp.behalteMeine();
    expect(s.log).toEqual(["angaben@1", "inhalt@5"]);
    expect(sp.zustand).toMatchObject({ status: "gespeichert", version: 6 });
  });
  it("„Neu laden": Serverstand übernehmen, nichts senden", async () => {
    const s = server();
    const { sp } = baueSpeicherer(s);
    s.version = 5;
    sp.aendere(b);
    await vi.advanceTimersByTimeAsync(WARTEZEIT_MS);
    sp.uebernimm(sp.zustand.konflikt!);
    expect(sp.zustand).toMatchObject({ status: "gespeichert", version: 5, konflikt: null });
    sp.aendere(c); // c ist der Serverstand → nichts zu tun
    await vi.advanceTimersByTimeAsync(WARTEZEIT_MS);
    expect(s.log).toEqual(["inhalt@1"]);
  });
  it("Wurf (Netz weg, Recht entzogen): Status fehler; die nächste Änderung oder „erneut" versucht es wieder", async () => {
    const s = server();
    const { sp } = baueSpeicherer(s);
    s.senden.inhalt.mockRejectedValueOnce(new Error("Forbidden"));
    sp.aendere(b);
    await vi.advanceTimersByTimeAsync(WARTEZEIT_MS);
    expect(sp.zustand).toMatchObject({ status: "fehler", fehler: "Nicht gespeichert — prüfe die Verbindung und ob du noch angemeldet bist." });
    expect(sp.hatUngespeichertes()).toBe(true);
    await sp.erneut();
    expect(sp.zustand).toMatchObject({ status: "gespeichert", version: 2, fehler: null });
  });
  it("vor dem Drucken: wartende Änderung sofort senden", async () => {
    const s = server();
    const { sp } = baueSpeicherer(s);
    sp.aendere(b);
    expect(await sp.jetzt()).toBe(true);
    expect(s.log).toEqual(["inhalt@1"]);
    s.version = 9;
    sp.aendere(c);
    expect(await sp.jetzt()).toBe(false);
  });
});
```

- [ ] **Step 2: Rot sehen**

Run: `pnpm vitest run src/app/m/kommplan/_ui/editor/speicherer.test.ts`
Expected: FAIL — Modul fehlt.

- [ ] **Step 3: Implementieren**

`K/_ui/editor/speicherer.ts`:

```ts
import type { Planangaben } from "../../_lib/angaben";
import type { SpeicherErgebnis, Speicherstand } from "../../_lib/ergebnis";
import type { PlanInhalt } from "../../_lib/plan/schema";

/**
 * AUTOSAVE (Spec §6.6, Entscheidung 11) — eine Warteschlange ohne React.
 *
 * - `aendere` startet die Wartezeit neu; gesendet wird der Stand, der BEIM SENDEN aktuell ist.
 * - Immer nur ein Aufruf zugleich (`kette`); Planangaben reihen sich ein. Dadurch gibt es genau EINE
 *   Version im Umlauf, und Angaben + Inhalt erzeugen nie einen falschen Konflikt.
 * - „Keine Änderung" heißt „dasselbe Objekt" (jede Planoperation liefert ein neues, `verlauf.ts`).
 * - Konflikt: kein automatisches Speichern mehr, bis „Neu laden" (`uebernimm`) oder „Meine Fassung
 *   behalten" (`behalteMeine`) entschieden ist.
 * - Timer über `globalThis.setTimeout` JE AUFRUF, nicht gemerkt: so greifen die Fake-Timer im Test.
 */
export const WARTEZEIT_MS = 1000;
export type SpeicherStatus = "gespeichert" | "ungespeichert" | "speichert" | "fehler" | "konflikt";
export interface SpeicherZustand { status: SpeicherStatus; version: number; konflikt: Speicherstand | null; zuletztGespeichert: number | null; fehler: string | null }
export interface Senden {
  inhalt(e: { id: string; version: number; inhalt: PlanInhalt }): Promise<SpeicherErgebnis>;
  angaben(e: { id: string; version: number; angaben: Planangaben }): Promise<SpeicherErgebnis>;
}

const NETZFEHLER = "Nicht gespeichert — prüfe die Verbindung und ob du noch angemeldet bist.";

export class Speicherer {
  private stand: SpeicherZustand;
  /** Was der Server zuletzt bestätigt hat; `null` = unbekannt, also immer senden („Meine Fassung behalten"). */
  private gespeichert: PlanInhalt | null;
  private aktuell: PlanInhalt;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private kette: Promise<unknown> = Promise.resolve();

  constructor(private readonly o: { planId: string; version: number; inhalt: PlanInhalt; senden: Senden; melde: (z: SpeicherZustand) => void; warte?: number }) {
    this.gespeichert = o.inhalt;
    this.aktuell = o.inhalt;
    this.stand = { status: "gespeichert", version: o.version, konflikt: null, zuletztGespeichert: null, fehler: null };
  }

  get zustand(): SpeicherZustand { return this.stand; }

  private setze(teil: Partial<SpeicherZustand>): void {
    this.stand = { ...this.stand, ...teil };
    this.o.melde(this.stand);
  }

  private planeSenden(): void {
    this.abbrechen();
    this.timer = globalThis.setTimeout(() => { this.timer = null; void this.sendeInhalt(); }, this.o.warte ?? WARTEZEIT_MS);
  }

  private abbrechen(): void {
    if (this.timer !== null) { globalThis.clearTimeout(this.timer); this.timer = null; }
  }

  private reihe<T>(auftrag: () => Promise<T>): Promise<T> {
    const p = this.kette.then(auftrag, auftrag);
    this.kette = p.catch(() => undefined);
    return p;
  }

  hatUngespeichertes(): boolean {
    return this.aktuell !== this.gespeichert || this.stand.status === "speichert";
  }

  aendere(inhalt: PlanInhalt): void {
    this.aktuell = inhalt;
    if (this.stand.status === "konflikt") return;
    if (inhalt === this.gespeichert) {
      this.abbrechen();
      if (this.stand.status === "ungespeichert") this.setze({ status: "gespeichert" });
      return;
    }
    if (this.stand.status !== "speichert") this.setze({ status: "ungespeichert", fehler: null });
    this.planeSenden();
  }

  private sendeInhalt(): Promise<void> {
    return this.reihe(async () => {
      if (this.stand.status === "konflikt") return;
      const senden = this.aktuell;
      if (senden === this.gespeichert) {
        if (this.timer === null && this.stand.status !== "fehler") this.setze({ status: "gespeichert" });
        return;
      }
      this.setze({ status: "speichert" });
      let r: SpeicherErgebnis;
      try {
        r = await this.o.senden.inhalt({ id: this.o.planId, version: this.stand.version, inhalt: senden });
      } catch {
        this.setze({ status: "fehler", fehler: NETZFEHLER });
        return;
      }
      this.verarbeite(r, () => { this.gespeichert = senden; });
    });
  }

  private verarbeite(r: SpeicherErgebnis, beiErfolg: () => void): void {
    if (r.ok) {
      beiErfolg();
      const offen = this.aktuell !== this.gespeichert;
      this.setze({ version: r.version, zuletztGespeichert: r.aktualisiertAm, fehler: null, status: offen ? "ungespeichert" : "gespeichert" });
      if (offen && this.timer === null) this.planeSenden();
      return;
    }
    if (r.grund === "konflikt") { this.abbrechen(); this.setze({ status: "konflikt", konflikt: r.stand }); return; }
    if (r.grund === "weg") { this.setze({ status: "fehler", fehler: "Diesen Plan gibt es nicht mehr, oder er wurde archiviert." }); return; }
    this.setze({ status: "fehler", fehler: r.fehler });
  }

  /** Planangaben: sofort, aber hinter einem laufenden Auftrag. Feldfehler gehen ans Formular, nicht in den Status. */
  angaben(a: Planangaben): Promise<SpeicherErgebnis> {
    return this.reihe(async () => {
      const r = await this.o.senden.angaben({ id: this.o.planId, version: this.stand.version, angaben: a });
      if (!r.ok && r.grund === "ungueltig") return r;
      this.verarbeite(r, () => {});
      return r;
    });
  }

  /** Vor dem Drucken (Entscheidung 12): Wartendes sofort senden; `true`, wenn danach alles gespeichert ist. */
  async jetzt(): Promise<boolean> {
    this.abbrechen();
    await this.sendeInhalt();
    await this.kette;
    return this.stand.status === "gespeichert";
  }

  async behalteMeine(): Promise<void> {
    const k = this.stand.konflikt;
    if (!k) return;
    this.gespeichert = null;
    this.setze({ status: "ungespeichert", konflikt: null, version: k.version });
    this.abbrechen();
    await this.sendeInhalt();
  }

  uebernimm(stand: Speicherstand): void {
    this.abbrechen();
    if (stand.inhalt !== null) { this.gespeichert = stand.inhalt; this.aktuell = stand.inhalt; }
    this.setze({ status: "gespeichert", konflikt: null, version: stand.version, fehler: null, zuletztGespeichert: stand.aktualisiertAm });
  }

  erneut(): Promise<void> {
    this.abbrechen();
    return this.sendeInhalt();
  }
}
```

`uebernimm` mit `stand.inhalt === null` (Serverstand unlesbar) übernimmt nur die Version; die Editor-Insel lädt in dem Fall die Seite neu (Task 14, `neuLaden`).

- [ ] **Step 4: Grün sehen**

Run: `pnpm vitest run src/app/m/kommplan/_ui/editor/speicherer.test.ts && pnpm typecheck; echo "typecheck exit $?"`
Expected: PASS, exit 0. Hängt ein Fall, weil ein Versprechen nie aufgelöst wird: `vi.advanceTimersByTimeAsync` löst auch Mikroaufgaben — prüfen, ob `s.los()` vor dem Weiterstellen gerufen wurde.

- [ ] **Step 5: Commit**

```bash
git add src/app/m/kommplan/_ui/editor/speicherer.ts src/app/m/kommplan/_ui/editor/speicherer.test.ts
git commit -S -m "feat(kommplan): Autosave-Warteschlange mit Versionsprüfung und Konfliktentscheidung

Ein Aufruf zugleich, Planangaben reihen sich ein; nach einem Konflikt
wird erst nach „Neu laden“ oder „Meine Fassung behalten“ wieder
gespeichert.

DRK-500

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 10: Gemeinsame Fläche und gleitendes Zeichnen (Betrachter umgebaut)

**Files:**
- Create: `K/_ui/betrachter/Flaeche.tsx`, `K/_ui/betrachter/Legende.tsx`, `K/_ui/betrachter/Umschalter.tsx`, `K/_ui/zeichnung/lage.ts`
- Modify: `K/_ui/betrachter/Betrachter.tsx`, `K/_ui/zeichnung/Zeichnung.tsx`, `K/_ui/zeichnung/Karte.tsx`, `K/_ui/zeichnung/Sechseck.tsx`, `K/_ui/kommplan.css`
- Test: `K/_ui/betrachter/Flaeche.test.tsx` (neu), `K/_ui/betrachter/Betrachter.test.tsx` (unverändert grün), `K/_ui/zeichnung/Zeichnung.test.tsx`, `K/_ui/kommplan-css.test.ts` (neu)

**Interfaces:**
- Consumes: alles, was `Betrachter.tsx` heute nutzt (`ansicht.ts`, `umschalter.ts`, `layout`, `legende`, `SymbolDefs`, `ZeichnungInhalt`).
- Produces:
  - `Flaeche(props)` (`"use client"`): `{ daten: Zeichnungsdaten; symbole: Symbolsatz; titel: string; schrift: string; bedienhinweis: string; leer: ReactNode; zusatz?: (k: KarteL) => ReactNode; ueberlagerung?: (a: Ansicht) => ReactNode; onTaste?: (e: KeyboardEvent<HTMLDivElement>) => boolean; onKarteKlick?: (id: string | null, doppelt: boolean) => void; gleitend?: boolean; linienSchluessel?: string; griff?: Ref<FlaecheGriff>; werkzeuge?: ReactNode }`
  - `interface FlaecheGriff { halte(): void; zeige(k: { x: number; y: number; breite: number; hoehe: number }, rand?: number): void }` (`rand` in Pixeln, Vorgabe 24)
  - `Legende({ eintraege }: { eintraege: LegendenEintrag[] })` — `null` ohne Einträge.
  - `Umschalter({ k, onUmschalten }: { k: KarteL; onUmschalten: (id: string) => void })` — `null`, wenn `!k.einklappbar`.
  - `lage(x: number, y: number, gleitend: boolean): { transform?: string; style?: CSSProperties; className?: string }`
  - `ZeichnungInhalt({ daten, zusatz, gleitend?, linienSchluessel? })`; `Karte`, `Einheit`, `Abzeichen`, `Sechseck` je mit `gleitend?: boolean`.

Die Selektoren, auf die Phase-1-Tests und e2e bauen, bleiben **wörtlich**: `.kp-betrachter`, `[data-ansicht]` (mit Attribut `transform`), `[data-umschalter]`, `[data-karte]`, `[data-abzeichen]`, `.kp-legende`, die Knopfnamen „Verkleinern", „Vergrößern", „Einpassen", „Alle ausklappen".

- [ ] **Step 1: Failing tests**

`K/_ui/betrachter/Flaeche.test.tsx`:

```tsx
// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { mount, query, unmount } from "@/app/m/qr/_lib/test-dom";
import { BEISPIELE } from "../../_lib/beispiele";
import { layout } from "../../_lib/layout/layout";
import { Flaeche } from "./Flaeche";

afterEach(() => unmount());
const daten = layout(BEISPIELE[0].inhalt, "bildschirm");
/** jsdom kennt kein PointerEvent: ein MouseEvent mit pointerId reicht Reacts onPointer*. */
function zeiger(el: Element, typ: string, x: number, y: number, zeit = 0): void {
  const e = new MouseEvent(typ, { bubbles: true, cancelable: true, clientX: x, clientY: y });
  Object.defineProperty(e, "pointerId", { value: 1 });
  Object.defineProperty(e, "timeStamp", { value: zeit });
  el.dispatchEvent(e);
}
const zeige = (mehr: Partial<Parameters<typeof Flaeche>[0]> = {}) =>
  mount(<Flaeche daten={daten} symbole={{}} titel="T" schrift="Arimo" bedienhinweis="Hinweis" leer={<p>leer</p>} {...mehr} />);

describe("Fläche", () => {
  it("ein Druck ohne Bewegung auf eine Karte ist ein Klick auf diese Karte; zweimal kurz hintereinander ein Doppelklick", async () => {
    const klick = vi.fn();
    await zeige({ onKarteKlick: klick });
    const karte = query('[data-karte="el"] rect');
    await act(async () => { zeiger(karte, "pointerdown", 50, 50, 1000); zeiger(karte, "pointerup", 51, 50, 1050); });
    await act(async () => { zeiger(karte, "pointerdown", 50, 50, 1200); zeiger(karte, "pointerup", 50, 50, 1250); });
    expect(klick.mock.calls).toEqual([["el", false], ["el", true]]);
  });
  it("Ziehen ist kein Klick; ein Klick daneben meldet null", async () => {
    const klick = vi.fn();
    await zeige({ onKarteKlick: klick });
    const flaeche = query(".kp-betrachter");
    await act(async () => { zeiger(query('[data-karte="el"] rect'), "pointerdown", 50, 50); zeiger(flaeche, "pointermove", 90, 50); zeiger(flaeche, "pointerup", 90, 50); });
    expect(klick).not.toHaveBeenCalled();
    await act(async () => { zeiger(flaeche, "pointerdown", 5, 5, 5000); zeiger(flaeche, "pointerup", 5, 5, 5010); });
    expect(klick).toHaveBeenCalledWith(null, false);
  });
  it("onTaste geht vor: wer true meldet, bekommt die Taste allein (keine Verschiebung)", async () => {
    await zeige({ onTaste: (e) => e.key === "ArrowLeft" });
    const vorher = query("[data-ansicht]").getAttribute("transform");
    await act(async () => { query(".kp-betrachter").dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowLeft", bubbles: true })); });
    expect(query("[data-ansicht]").getAttribute("transform")).toBe(vorher);
    await act(async () => { query(".kp-betrachter").dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true })); });
    expect(query("[data-ansicht]").getAttribute("transform")).not.toBe(vorher);
  });
  it("die Überlagerung bekommt die aktuelle Ansicht und liegt in der Fläche", async () => {
    await zeige({ ueberlagerung: (a) => <span data-test-ansicht={`${a.x},${a.y},${a.massstab}`} /> });
    expect(query(".kp-betrachter .kp-ueberlagerung [data-test-ansicht]").getAttribute("data-test-ansicht")).toBe("16,16,4");
  });
});
```

`K/_ui/kommplan-css.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

/**
 * Die REGEL steht da (Quelltext-Scan, docs/design/README.md „Tests für Responsives"); dass sie WIRKT,
 * prüft `e2e/kommplan-editor.spec.ts` mit `emulateMedia({ reducedMotion: "reduce" })`.
 */
const css = readFileSync("src/app/m/kommplan/_ui/kommplan.css", "utf8");

describe("kommplan.css", () => {
  it("Gleiten und Nachziehen haben einen Zweig für reduzierte Bewegung", () => {
    const zweig = /@media \(prefers-reduced-motion: reduce\) \{([\s\S]*?)\n\}/.exec(css)?.[1] ?? "";
    expect(zweig).toMatch(/\.kp-gleitet \{ transition: none; \}/);
    expect(zweig).toMatch(/\.kp-nachziehen \{ animation: none; \}/);
  });
  it("Farben für Hell und Dunkel über data-theme, nie über prefers-color-scheme", () => {
    expect(css).not.toMatch(/prefers-color-scheme/);
    expect(css).toMatch(/:root\[data-theme="dark"\]/);
  });
});
```

An `K/_ui/zeichnung/Zeichnung.test.tsx` anhängen (Import `ZeichnungInhalt` aus `./Zeichnung` ergänzen):

```tsx
describe("gleitend (Editor, Spec §6.3)", () => {
  const daten = zeichne(einsatz.inhalt, "bildschirm");
  it("ohne gleitend: Lage als SVG-Attribut, wie im Druck", () => {
    const html = renderToStaticMarkup(<svg><ZeichnungInhalt daten={daten} /></svg>);
    expect(html).toMatch(/<g transform="translate\([\d.]+ [\d.]+\)" data-karte=/);
    expect(html).not.toContain("kp-gleitet");
  });
  it("gleitend: Karten, Einheiten, Sechsecke und Abzeichen als CSS-Transform mit Klasse; Linien in einer Nachzieh-Gruppe", () => {
    const html = renderToStaticMarkup(<svg><ZeichnungInhalt daten={daten} gleitend linienSchluessel="3" /></svg>);
    expect(zaehle(html, 'class="kp-gleitet"')).toBe(daten.karten.length + daten.einheiten.length + daten.sechsecke.length + daten.abzeichen.length);
    expect(html).toMatch(/style="transform:translate\([\d.]+px, [\d.]+px\)"/);
    expect(zaehle(html, 'class="kp-nachziehen"')).toBe(1);
  });
});
```

- [ ] **Step 2: Rot sehen**

Run: `pnpm vitest run src/app/m/kommplan/_ui`
Expected: FAIL — `Flaeche` fehlt, `ZeichnungInhalt` kennt `gleitend` nicht, die CSS-Regeln fehlen. `Betrachter.test.tsx` ist noch grün.

- [ ] **Step 3: Lage und gleitende Zeichnung**

`K/_ui/zeichnung/lage.ts`:

```ts
import type { CSSProperties } from "react";

/**
 * LAGE EINES ELEMENTS IN DER ZEICHNUNG. Im Druck und im Betrachter ein SVG-Attribut (bleibt auch im
 * SVG-Export der Phase 5 gültig). Im Editor ein CSS-Transform mit Klasse `kp-gleitet`: nur eine
 * CSS-Eigenschaft kann per `transition` gleiten, das Attribut `transform` nicht. In SVG ist ein
 * CSS-`px` eine Nutzereinheit, hier also ein Layout-Millimeter.
 */
export function lage(x: number, y: number, gleitend: boolean): { transform?: string; style?: CSSProperties; className?: string } {
  return gleitend ? { style: { transform: `translate(${x}px, ${y}px)` }, className: "kp-gleitet" } : { transform: `translate(${x} ${y})` };
}
```

In `Karte.tsx`: `import { lage } from "./lage";`; `Karte`, `Einheit`, `Abzeichen` bekommen die Prop `gleitend = false` (`{ k, zusatz, gleitend = false }: { k: KarteL; zusatz?: …; gleitend?: boolean }` usw.) und ersetzen `transform={`translate(${k.x} ${k.y})`}` durch `{...lage(k.x, k.y, gleitend)}` (bei `Einheit` `e.x, e.y`, bei `Abzeichen` `a.x, a.y`). Ebenso `Sechseck` in `Sechseck.tsx` (`{...lage(s.x, s.y, gleitend)}`).

In `Zeichnung.tsx`:

```tsx
export function ZeichnungInhalt({ daten, zusatz, gleitend = false, linienSchluessel }: {
  daten: Zeichnungsdaten; zusatz?: (k: KarteL) => ReactNode; gleitend?: boolean; linienSchluessel?: string;
}) {
  return (
    <g>
      {/* Linien haben keine stabile Identität (Netz + Index): im Editor werden sie nach dem Gleiten
          neu eingeblendet — der Schlüssel wechselt nur bei strukturellen Änderungen (Editor.tsx). */}
      <g key={gleitend ? linienSchluessel : undefined} className={gleitend ? "kp-nachziehen" : undefined}
        fill="none" stroke={FARBE.tinte} strokeLinecap="square">
        {daten.linien.map((l, i) => (
          <line key={i} x1={l.x1} y1={l.y1} x2={l.x2} y2={l.y2} strokeWidth={l.duenn ? STRICH.duenn : STRICH.linie} data-netz={l.netz} />
        ))}
      </g>
      {daten.sechsecke.map((s, i) => <Sechseck key={`${s.netz}:${s.verbindungId}:${i}`} s={s} gleitend={gleitend} />)}
      {daten.karten.map((k) => <Karte key={k.id} k={k} zusatz={zusatz} gleitend={gleitend} />)}
      {daten.einheiten.map((e) => <Einheit key={e.id} e={e} gleitend={gleitend} />)}
      {daten.abzeichen.map((a) => <Abzeichen key={a.stelleId} a={a} gleitend={gleitend} />)}
    </g>
  );
}
```

(Der Sechseck-Schlüssel trägt Netz und Verbindung, damit ein Sechseck beim Einfügen an seiner Identität hängen bleibt und gleitet, statt von einem anderen Index übernommen zu werden.)

In `K/_ui/kommplan.css` anhängen:

```css
/*
 * Gleiten im Editor (Spec §6.3): Karten, Einheiten, Sechsecke und Abzeichen gleiten an die neue Lage
 * (`_ui/zeichnung/lage.ts`); die Linien werden danach neu eingeblendet. Ohne Bewegung bei
 * prefers-reduced-motion — hier ist die Medienabfrage richtig, sie ist keine Farbwahl.
 */
.kp-gleitet { transition: transform 220ms ease-out; }
.kp-nachziehen { animation: kp-einblenden 160ms ease-out 200ms both; }
@keyframes kp-einblenden { from { opacity: 0; } to { opacity: 1; } }
@media (prefers-reduced-motion: reduce) {
  .kp-gleitet { transition: none; }
  .kp-nachziehen { animation: none; }
}
```

- [ ] **Step 4: Fläche, Legende, Umschalter herauslösen**

`K/_ui/betrachter/Umschalter.tsx` — der `zusatz`-Rumpf aus `Betrachter.tsx` wörtlich als Komponente:

```tsx
import type { KarteL } from "../../_lib/layout/typen";
import { FARBE } from "../zeichnung/farben";
import { UMSCHALTER, umschalterLage } from "./umschalter";

/** Einklapp-Umschalter einer Karte (Spec §5.7) — Betrachter und Editor. Ohne eigene Direktive: nur Client-Inseln rendern ihn. */
export function Umschalter({ k, onUmschalten }: { k: KarteL; onUmschalten: (id: string) => void }) {
  if (!k.einklappbar) return null;
  const u = umschalterLage(k);
  return (
    <g role="button" tabIndex={0} data-umschalter={k.id} aria-expanded={!k.eingeklappt}
      aria-label={`${k.titelVoll === "" ? "(ohne Titel)" : k.titelVoll}: Unterstellen ${k.eingeklappt ? "ausklappen" : "einklappen"}`}
      style={{ cursor: "pointer" }}
      onClick={(e) => { e.stopPropagation(); onUmschalten(k.id); }}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); e.stopPropagation(); onUmschalten(k.id); } }}>
      <circle cx={u.cx} cy={u.cy} r={UMSCHALTER.griff} fill="transparent" />
      <circle cx={u.cx} cy={u.cy} r={u.r} fill={FARBE.papier} stroke={FARBE.tinte} strokeWidth={0.25} />
      <text x={u.cx} y={u.cy + UMSCHALTER.schrift * 0.35} fontSize={UMSCHALTER.schrift} textAnchor="middle" fill={FARBE.tinte}>{k.eingeklappt ? "+" : "−"}</text>
    </g>
  );
}
```

`K/_ui/betrachter/Legende.tsx` — die `<ul className="kp-legende">` aus `Betrachter.tsx` wörtlich, als `export function Legende({ eintraege }: { eintraege: LegendenEintrag[] })`, `null` bei leerer Liste (Importe `LEGENDEN_SYMBOL`, `LegendenSymbol`, Typ `LegendenEintrag` aus `_lib/layout/typen`).

`K/_ui/betrachter/Flaeche.tsx`:

```tsx
"use client";

import { useEffect, useImperativeHandle, useRef, useState, type KeyboardEvent, type PointerEvent, type ReactNode, type Ref } from "react";
import { Button } from "antd";
import type { KarteL, Zeichnungsdaten } from "../../_lib/layout/typen";
import { FARBE } from "../zeichnung/farben";
import { SymbolDefs, type Symbolsatz } from "../zeichnung/Symbole";
import { ZeichnungInhalt } from "../zeichnung/Zeichnung";
import { SCHRITT, einpassen, tasteZuAktion, untergrenze, verschiebe, zoome, type Ansicht } from "./ansicht";

/**
 * DIE ZEICHENFLÄCHE von Betrachter und Editor (Spec §5.7, §6.3): Zoom, Verschieben, Pinch, Rad,
 * Tastatur, dazu Klick auf eine Karte. Aus `Betrachter.tsx` herausgelöst; dessen Kopfkommentar gilt
 * weiter — insbesondere: kein setState im Effekt-Rumpf, die eingepasste Ansicht wird abgeleitet.
 *
 * KLICK: Pointer-Capture lenkt `pointerup`, `click` und `dblclick` auf die Fläche um, die Karte unter
 * dem Finger ginge verloren. Deshalb merkt sich `pointerdown` die Karte, und ein `pointerup` ohne
 * Bewegung über `KLICK_TOLERANZ` ist der Klick; zwei Klicks auf dieselbe Karte binnen `DOPPEL_MS`
 * sind ein Doppelklick.
 *
 * `griff.halte()` friert die eingepasste Ansicht als eigene ein: nach einer Bearbeitung soll nicht
 * das ganze Bild neu eingepasst springen, sondern nur die Karten gleiten.
 */
export interface FlaecheGriff {
  halte(): void;
  /** `rand`: Pixel Luft rundum — der Editor gibt mehr, damit auch die Griffe neben und unter der Karte im Bild sind. */
  zeige(k: { x: number; y: number; breite: number; hoehe: number }, rand?: number): void;
}
const KLICK_TOLERANZ = 5;
const DOPPEL_MS = 400;
const SICHTRAND = 24;

export function Flaeche({
  daten, symbole, titel, schrift, bedienhinweis, leer, zusatz, ueberlagerung, onTaste, onKarteKlick,
  gleitend = false, linienSchluessel, griff, werkzeuge,
}: {
  daten: Zeichnungsdaten; symbole: Symbolsatz; titel: string; schrift: string; bedienhinweis: string; leer: ReactNode;
  zusatz?: (k: KarteL) => ReactNode; ueberlagerung?: (a: Ansicht) => ReactNode;
  onTaste?: (e: KeyboardEvent<HTMLDivElement>) => boolean; onKarteKlick?: (id: string | null, doppelt: boolean) => void;
  gleitend?: boolean; linienSchluessel?: string; griff?: Ref<FlaecheGriff>; werkzeuge?: ReactNode;
}) {
  const flaeche = useRef<HTMLDivElement>(null);
  const [groesse, setGroesse] = useState({ b: 0, h: 0 });
  const [eigene, setEigene] = useState<Ansicht | null>(null);
  const zeiger = useRef(new Map<number, { x: number; y: number }>());
  const start = useRef<{ x: number; y: number; karte: string | null; bewegt: boolean } | null>(null);
  const letzterKlick = useRef<{ karte: string | null; zeit: number } | null>(null);

  const basis = einpassen(daten.breite, daten.hoehe, groesse.b, groesse.h);
  const a = eigene ?? basis;
  const basisRef = useRef(basis);
  const untergrenzeJetzt = untergrenze(basis);
  useEffect(() => { basisRef.current = basis; });

  useImperativeHandle(griff, () => ({
    halte: () => setEigene((alt) => alt ?? basisRef.current),
    zeige: (k, rand = SICHTRAND) => setEigene((alt) => {
      const jetzt = alt ?? basisRef.current;
      const el = flaeche.current;
      if (!el || el.clientWidth === 0) return jetzt;
      const m = jetzt.massstab, w = el.clientWidth, h = el.clientHeight;
      const l = jetzt.x + k.x * m, o = jetzt.y + k.y * m, r = l + k.breite * m, u = o + k.hoehe * m;
      const dx = l < rand ? rand - l : r > w - rand ? w - rand - r : 0;
      const dy = o < rand ? rand - o : u > h - rand ? h - rand - u : 0;
      return dx === 0 && dy === 0 ? jetzt : verschiebe(jetzt, dx, dy);
    }),
  }), []);

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
        return e.ctrlKey || e.metaKey
          ? zoome(jetzt, Math.exp(-e.deltaY / 300), e.clientX - r.left, e.clientY - r.top, untergrenze(basisRef.current))
          : verschiebe(jetzt, -e.deltaX, -e.deltaY);
      });
    };
    el.addEventListener("wheel", rad, { passive: false });
    return () => el.removeEventListener("wheel", rad);
  }, []);

  const aendere = (f: (x: Ansicht) => Ansicht) => setEigene((alt) => f(alt ?? basisRef.current));
  const zoomUmMitte = (faktor: number) => {
    const el = flaeche.current;
    aendere((x) => zoome(x, faktor, (el?.clientWidth ?? 0) / 2, (el?.clientHeight ?? 0) / 2, untergrenzeJetzt));
  };
  const ausgenommen = (ziel: EventTarget) => (ziel as Element).closest("[data-umschalter], [data-griff]") !== null;

  const unten = (e: PointerEvent<HTMLDivElement>) => {
    if (ausgenommen(e.target)) return; // Umschalter und Griffe beginnen kein Ziehen und keinen Klick
    e.currentTarget.setPointerCapture?.(e.pointerId);
    zeiger.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    start.current = zeiger.current.size === 1
      ? { x: e.clientX, y: e.clientY, karte: (e.target as Element).closest("[data-karte]")?.getAttribute("data-karte") ?? null, bewegt: false }
      : null; // zweiter Finger: kein Klick
  };
  const bewegt = (e: PointerEvent<HTMLDivElement>) => {
    const alt = zeiger.current.get(e.pointerId);
    if (!alt) return;
    if (start.current && Math.hypot(e.clientX - start.current.x, e.clientY - start.current.y) > KLICK_TOLERANZ) start.current.bewegt = true;
    const anderer = [...zeiger.current.entries()].find(([id]) => id !== e.pointerId)?.[1];
    if (anderer) {
      const vorher = Math.hypot(alt.x - anderer.x, alt.y - anderer.y);
      const jetzt = Math.hypot(e.clientX - anderer.x, e.clientY - anderer.y);
      const r = e.currentTarget.getBoundingClientRect();
      if (vorher > 0) aendere((x) => zoome(x, jetzt / vorher, (e.clientX + anderer.x) / 2 - r.left, (e.clientY + anderer.y) / 2 - r.top, untergrenzeJetzt));
    } else {
      aendere((x) => verschiebe(x, e.clientX - alt.x, e.clientY - alt.y));
    }
    zeiger.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
  };
  const los = (e: PointerEvent<HTMLDivElement>) => {
    zeiger.current.delete(e.pointerId);
    const s = start.current;
    start.current = null;
    if (!s || s.bewegt || e.type !== "pointerup" || !onKarteKlick) return;
    const l = letzterKlick.current;
    const doppelt = l !== null && s.karte !== null && l.karte === s.karte && e.timeStamp - l.zeit < DOPPEL_MS;
    letzterKlick.current = doppelt ? null : { karte: s.karte, zeit: e.timeStamp };
    onKarteKlick(s.karte, doppelt);
  };

  const taste = (e: KeyboardEvent<HTMLDivElement>) => {
    if (ausgenommen(e.target)) return;
    if (onTaste?.(e)) return;
    const aktion = tasteZuAktion(e.key);
    if (!aktion) return;
    e.preventDefault();
    if (aktion.art === "einpassen") setEigene(null);
    else if (aktion.art === "zoom") zoomUmMitte(aktion.faktor);
    else aendere((x) => verschiebe(x, aktion.dx, aktion.dy));
  };

  return (
    <div>
      <svg aria-hidden="true" width={0} height={0} style={{ position: "absolute" }}>
        <SymbolDefs symbole={symbole} />
      </svg>
      <div className="kp-werkzeuge">
        <Button onClick={() => zoomUmMitte(1 / SCHRITT)} aria-label="Verkleinern">−</Button>
        <Button onClick={() => zoomUmMitte(SCHRITT)} aria-label="Vergrößern">+</Button>
        <Button onClick={() => setEigene(null)}>Einpassen</Button>
        {werkzeuge}
      </div>
      <div ref={flaeche} className="kp-betrachter" tabIndex={0} role="group" aria-label={`${titel} — ${bedienhinweis}`}
        onPointerDown={unten} onPointerMove={bewegt} onPointerUp={los} onPointerCancel={los} onKeyDown={taste}>
        {daten.karten.length === 0 ? leer : (
          <svg role="img" aria-label={titel} style={{ fontFamily: schrift }}>
            <g data-ansicht="" transform={`translate(${a.x} ${a.y}) scale(${a.massstab})`}>
              <rect width={daten.breite} height={daten.hoehe} fill={FARBE.papier} />
              <ZeichnungInhalt daten={daten} zusatz={zusatz} gleitend={gleitend} linienSchluessel={linienSchluessel} />
            </g>
          </svg>
        )}
        {ueberlagerung && daten.karten.length > 0 ? <div className="kp-ueberlagerung">{ueberlagerung(a)}</div> : null}
      </div>
    </div>
  );
}
```

`K/_ui/betrachter/Betrachter.tsx` wird schlank; der Kopfkommentar bleibt (Absatz „KEIN setState IM EFFEKT-RUMPF" um „— umgesetzt in `Flaeche.tsx`" ergänzen), der Rumpf wird:

```tsx
export function Betrachter({ inhalt, symbole, titel, schrift }: { inhalt: PlanInhalt; symbole: Symbolsatz; titel: string; schrift: string }) {
  const [eingeklappt, setEingeklappt] = useState<ReadonlySet<string>>(() => new Set());
  const daten = useMemo(() => layout(inhalt, "bildschirm", { eingeklappt }), [inhalt, eingeklappt]);
  const eintraege = useMemo(() => legende(inhalt, baueSicht(inhalt)), [inhalt]);
  const umschalten = (id: string) => setEingeklappt((s) => {
    const neu = new Set(s);
    if (neu.has(id)) neu.delete(id); else neu.add(id);
    return neu;
  });
  return (
    <div>
      <Flaeche daten={daten} symbole={symbole} titel={titel} schrift={schrift}
        bedienhinweis="Pfeiltasten verschieben, Plus und Minus zoomen, 0 passt ein"
        zusatz={(k) => <Umschalter k={k} onUmschalten={umschalten} />}
        leer={<p style={{ padding: 16 }}>Dieser Plan hat noch keine Stellen.</p>}
        werkzeuge={eingeklappt.size > 0 ? <Button onClick={() => setEingeklappt(new Set())}>Alle ausklappen</Button> : null} />
      <Legende eintraege={eintraege} />
    </div>
  );
}
```

Überflüssige Importe entfernen (`pnpm lint` meldet sie).

In `K/_ui/kommplan.css` anhängen:

```css
/* Überlagerung der Fläche (Griffe des Editors): liegt über dem SVG, fängt selbst keine Zeiger. */
.kp-ueberlagerung { position: absolute; inset: 0; pointer-events: none; overflow: hidden; }
```

- [ ] **Step 5: Grün sehen**

Run: `pnpm vitest run src/app/m/kommplan && pnpm typecheck; echo "typecheck exit $?"`
Expected: PASS — insbesondere `Betrachter.test.tsx` **unverändert**, `Blatt.test.tsx` (Druck ohne `gleitend`), `grenze.test.ts` (`lage.ts` liegt in `_ui/zeichnung/`: kein `"use client"`, kein `next/*`), exit 0.

Run: `pnpm exec playwright test e2e/kommplan.spec.ts` (Phase-1-e2e: Betrachter, Einklappen, Zoom — Load vorher prüfen)
Expected: 6 passed.

- [ ] **Step 6: Ankerschritt und Commit**

Ankerschritt für `Betrachter.tsx`, `Zeichnung.tsx`, `Karte.tsx`, `Sechseck.tsx`, `kommplan.css`.

```bash
git add src/app/m/kommplan/_ui
git commit -S -m "refactor(kommplan): Zeichenfläche aus dem Betrachter gelöst, Zeichnung kann gleiten

Die Fläche meldet Klicks auf Karten trotz Pointer-Capture und hält die
Ansicht nach Bearbeitungen fest; im Editor gleiten Karten per CSS,
ohne Bewegung bei prefers-reduced-motion.

DRK-500

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 11: Flyin einer Stelle, Teil 1 — Titel, Leiter, Hervorheben, Zeichen, Kontakte, Löschen

**Files:**
- Create: `K/_ui/editor/aendere.ts`, `K/_ui/editor/StelleFlyin.tsx`, `K/_ui/editor/ZeichenWahl.tsx`, `K/_ui/editor/KontaktZeilen.tsx`
- Modify: `K/_lib/plan/kontakte.ts` (`KONTAKT_NAME`), `K/_ui/kommplan.css`
- Test: `K/_ui/editor/StelleFlyin.test.tsx`, `K/_lib/plan/kontakte.test.ts`

**Interfaces:**
- Consumes: `aendereStelle`, `StellenAenderung`, `LAENGE`, `GRENZE`, `KONTAKT_REIHENFOLGE` (Tasks 2, 3), `sucheZeichen`, `leseZuletzt`, `merkeZuletzt` (Task 8), `symbolId`, `Symbolsatz`, `ZeichenIndexEintrag`, `flyinBreite`.
- Produces:
  - `aendere.ts`: `type Aendere = (op: (p: PlanInhalt) => PlanInhalt, schluessel?: string) => string | null` — `null` heißt angewandt, sonst die Meldung des `PlanFehler` (die Editor-Insel zeigt sie zusätzlich oben an).
  - `kontakte.ts`: `KONTAKT_NAME: Record<KontaktArt, string>`.
  - `StelleFlyin(props: StelleFormularProps & { offen: boolean; onSchliessen: () => void })` (Drawer, `mask={false}`, `flyinBreite(520)`) und `StelleFormular(props: StelleFormularProps)` mit `interface StelleFormularProps { inhalt: PlanInhalt; stelleId: string; aendere: Aendere; symbole: Symbolsatz; zeichenIndex: readonly ZeichenIndexEintrag[]; ladeSymbole: (schluessel: string[]) => void; fokus: { ziel: "titel" | "einheit"; n: number }; titelRef: RefObject<InputRef | null>; onLoeschen: () => void }`.
  - `ZeichenWahl({ wert, index, symbole, ladeSymbole, planZeichen, onWahl })`; `KontaktZeilen({ kontakte, onAendere }: { kontakte: readonly Kontakt[]; onAendere: (neu: Kontakt[], schluessel?: string) => void })`.

- [ ] **Step 1: Failing tests**

An `K/_lib/plan/kontakte.test.ts` anhängen:

```ts
import { KONTAKT_NAME } from "./kontakte";
import { KONTAKT_ARTEN } from "./schema";

describe("Namen der Kontaktarten", () => {
  it("jede Art hat einen deutschen Namen", () => {
    expect(KONTAKT_ARTEN.map((a) => KONTAKT_NAME[a])).toEqual(["Funkrufname", "Digitalfunk", "Telefon", "Mobil", "Fax", "E-Mail", "Sonstiges"]);
  });
});
```

`K/_ui/editor/StelleFlyin.test.tsx`:

```tsx
// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { createRef, useState, type RefObject } from "react";
import type { InputRef } from "antd";
import { clickElement, fill, mount, query, queryAll, rerender, unmount } from "@/app/m/qr/_lib/test-dom";
import { baue } from "../../_lib/beispiele/bau";
import { PlanFehler } from "../../_lib/plan/operationen";
import type { PlanInhalt } from "../../_lib/plan/schema";
import type { Aendere } from "./aendere";
import { StelleFormular } from "./StelleFlyin";

const INDEX = [
  { schluessel: "rezept:C.1.1", titel: "Löschstaffel", suchtext: "löschstaffel c.1.1" },
  { schluessel: "zusatz:eal", titel: "Einsatzabschnittsleitung", suchtext: "eal" },
];
const START = baue({
  stellen: [
    { id: "el", titel: "EL" },
    { id: "a", titel: "EA 1", eltern: "el", kontakte: { email: "ea1@drk.de", funkrufname: "RK UE 40-00" } },
  ],
});

let stand: PlanInhalt = START;
const lade = vi.fn();
const loesche = vi.fn();
// Modulweit, nicht als Vorgabe im Parameter: ein neues Objekt je Rendern löste die Fokus-Effekte bei jeder Eingabe aus.
const FOKUS0 = { ziel: "titel" as const, n: 0 };
const REF0 = createRef<InputRef>();
function Rahmen({ fokus = FOKUS0, titelRef = REF0 }: { fokus?: { ziel: "titel" | "einheit"; n: number }; titelRef?: RefObject<InputRef | null> }) {
  const [inhalt, setInhalt] = useState(START);
  const aendere: Aendere = (op) => {
    try { const neu = op(inhalt); setInhalt(neu); stand = neu; return null; }
    catch (e) { if (e instanceof PlanFehler) return e.message; throw e; }
  };
  return <StelleFormular inhalt={inhalt} stelleId="a" aendere={aendere} symbole={{}} zeichenIndex={INDEX} ladeSymbole={lade}
    fokus={fokus} titelRef={titelRef} onLoeschen={loesche} />;
}
const stelle = () => stand.stellen.find((s) => s.id === "a")!;
const knopf = (text: string) => queryAll<HTMLButtonElement>("button").find((b) => b.textContent === text)!;

afterEach(() => { unmount(); stand = START; lade.mockReset(); loesche.mockReset(); window.localStorage.clear(); });

describe("Flyin einer Stelle (Spec §6.4)", () => {
  it("Titel und Leiter schreiben sofort ins Dokument; ein geleerter Leiter ist null", async () => {
    await mount(<Rahmen />);
    await fill('input[name="titel"]', "EA Nord");
    await fill('input[name="leiter"]', "Jana");
    expect(stelle()).toMatchObject({ titel: "EA Nord", leiter: "Jana" });
    await fill('input[name="leiter"]', "");
    expect(stelle().leiter).toBeNull();
    expect(query<HTMLInputElement>('input[name="titel"]').maxLength).toBe(200);
  });
  it("Hervorheben", async () => {
    await mount(<Rahmen />);
    await clickElement(query(".kp-hervorheben input"));
    expect(stelle().hervorheben).toBe(true);
  });
  it("Zeichen: Suche lädt die Symbole der Treffer nach, Wahl setzt das Zeichen und merkt es als zuletzt genutzt", async () => {
    await mount(<Rahmen />);
    await fill('input[aria-label="Zeichen suchen"]', "lösch");
    expect(lade).toHaveBeenLastCalledWith(["rezept:C.1.1"]);
    await clickElement(query('[data-zeichen="rezept:C.1.1"]'));
    expect(stelle().zeichen).toBe("rezept:C.1.1");
    expect(JSON.parse(window.localStorage.getItem("kommplan:zeichen:zuletzt")!)).toEqual(["rezept:C.1.1"]);
    await clickElement(knopf("Kein Zeichen"));
    expect(stelle().zeichen).toBeNull();
  });
  it("Kontakte stehen in fester Reihenfolge (◇ vor E-Mail), unabhängig von der Eingabe; hinzufügen, ändern, entfernen", async () => {
    await mount(<Rahmen />);
    const werte = () => queryAll<HTMLInputElement>("[data-kontakt-zeile] input.ant-input").map((i) => i.value);
    expect(werte()).toEqual(["RK UE 40-00", "ea1@drk.de"]);
    await clickElement(knopf("Kontakt hinzufügen"));
    expect(stelle().kontakte.at(-1)).toEqual({ art: "telefon", wert: "" });
    expect(werte()).toEqual(["RK UE 40-00", "", "ea1@drk.de"]); // Telefon steht zwischen Funkrufname und E-Mail
    const telefon = queryAll<HTMLInputElement>("[data-kontakt-zeile] input.ant-input")[1];
    await fill(`[data-kontakt-zeile="${telefon.closest("[data-kontakt-zeile]")!.getAttribute("data-kontakt-zeile")}"] input.ant-input`, "0581 1");
    expect(stelle().kontakte.find((k) => k.art === "telefon")?.wert).toBe("0581 1");
    await clickElement(query('button[aria-label="E-Mail entfernen"]'));
    expect(stelle().kontakte.map((k) => k.art).sort()).toEqual(["funkrufname", "telefon"]);
  });
  it("Löschen meldet sich beim Editor (Rückgängig statt Nachfrage)", async () => {
    await mount(<Rahmen />);
    await clickElement(knopf("Stelle löschen"));
    expect(loesche).toHaveBeenCalledTimes(1);
  });
  it("eine neue Fokusanfrage setzt den Fokus ins Titelfeld", async () => {
    const titelRef = createRef<InputRef>();
    await mount(<Rahmen titelRef={titelRef} fokus={{ ziel: "titel", n: 0 }} />);
    (document.activeElement as HTMLElement | null)?.blur();
    await rerender(<Rahmen titelRef={titelRef} fokus={{ ziel: "titel", n: 1 }} />);
    expect(document.activeElement).toBe(query('input[name="titel"]'));
  });
});
```

- [ ] **Step 2: Rot sehen**

Run: `pnpm vitest run src/app/m/kommplan/_ui/editor/StelleFlyin.test.tsx src/app/m/kommplan/_lib/plan/kontakte.test.ts`
Expected: FAIL — Module und `KONTAKT_NAME` fehlen.

- [ ] **Step 3: Implementieren**

In `K/_lib/plan/kontakte.ts` anhängen:

```ts
/** Anzeigenamen im Flyin (Spec §6.4 „Kontakte: Zeilen Art + Wert"). */
export const KONTAKT_NAME: Record<KontaktArt, string> = {
  funkrufname: "Funkrufname", digitalfunk: "Digitalfunk", telefon: "Telefon", mobil: "Mobil",
  fax: "Fax", email: "E-Mail", sonstiges: "Sonstiges",
};
```

`K/_ui/editor/aendere.ts`:

```ts
import type { PlanInhalt } from "../../_lib/plan/schema";

/**
 * Wie Flyins das Dokument ändern: sie reichen eine reine Operation (`_lib/plan/`) an die Editor-Insel.
 * `schluessel` bündelt Tippen im selben Feld zu einem Rückgängig-Schritt (`verlauf.ts`). Rückgabe:
 * `null` = angewandt, sonst die Meldung des `PlanFehler` — für den Hinweis am Formular.
 */
export type Aendere = (op: (p: PlanInhalt) => PlanInhalt, schluessel?: string) => string | null;
```

`K/_ui/editor/ZeichenWahl.tsx`:

```tsx
"use client";

import { useId, useMemo, useState } from "react";
import { Button, Input } from "antd";
import type { ZeichenIndexEintrag } from "../../_lib/zeichen/grundlagen";
import { symbolId, type Symbolsatz } from "../zeichnung/Symbole";
import { sucheZeichen } from "./suche";
import { leseZuletzt, merkeZuletzt } from "./zuletzt";

/**
 * ZEICHEN-SUCHE (Spec §6.4, Entscheidung 4): oben die zuletzt genutzten (dieser Browser) und die des
 * Plans, darunter die Treffer. Die SVGs kommen über `ladeSymbole` nach und stehen dann in den `<defs>`
 * der Fläche — die Vorschauen hier referenzieren sie per `<use>`.
 */
export function ZeichenWahl({ wert, index, symbole, ladeSymbole, planZeichen, onWahl }: {
  wert: string | null; index: readonly ZeichenIndexEintrag[]; symbole: Symbolsatz;
  ladeSymbole: (schluessel: string[]) => void; planZeichen: readonly string[]; onWahl: (k: string | null) => void;
}) {
  const basis = useId();
  const [anfrage, setAnfrage] = useState("");
  const [zuletzt, setZuletzt] = useState<string[]>(() => leseZuletzt());
  const titel = useMemo(() => new Map(index.map((e) => [e.schluessel, e.titel])), [index]);
  const treffer = sucheZeichen(index, anfrage);
  const vorschlaege = [...new Set([...zuletzt, ...planZeichen])].filter((k) => titel.has(k)).slice(0, 12);

  const suche = (text: string) => {
    setAnfrage(text);
    const neu = sucheZeichen(index, text).map((e) => e.schluessel).filter((k) => !symbole[k]);
    if (neu.length > 0) ladeSymbole(neu);
  };
  const waehle = (k: string | null) => {
    if (k !== null) setZuletzt(merkeZuletzt(k));
    setAnfrage("");
    onWahl(k);
  };
  const knopf = (k: string) => (
    <button type="button" key={k} className="kp-zeichen-knopf" data-zeichen={k} aria-pressed={wert === k} onClick={() => waehle(k)}>
      {symbole[k]
        ? <svg viewBox="0 0 10 10" width={36} height={36} aria-hidden="true"><use href={`#${symbolId(k)}`} width={10} height={10} /></svg>
        : <span className="kp-zeichen-platz" aria-hidden="true" />}
      <span>{titel.get(k)}</span>
    </button>
  );

  return (
    <div className="kp-zeichenwahl">
      <p className="kp-hilfe" id={`${basis}-jetzt`}>{wert ? `Gewählt: ${titel.get(wert) ?? wert}` : "Kein Zeichen gewählt — die Karte trägt dann nur den Titel."}</p>
      <Input aria-label="Zeichen suchen" aria-describedby={`${basis}-jetzt`} value={anfrage} onChange={(e) => suche(e.target.value)} placeholder="z. B. Einsatzleitung, Rettungswagen, D.1.4" allowClear />
      {anfrage.trim() === "" && vorschlaege.length > 0 ? (
        <><p className="kp-hilfe">Zuletzt genutzt</p><div className="kp-zeichen-raster">{vorschlaege.map(knopf)}</div></>
      ) : null}
      {anfrage.trim() !== "" ? (
        treffer.length > 0 ? <div className="kp-zeichen-raster" aria-live="polite">{treffer.map((e) => knopf(e.schluessel))}</div>
          : <p className="kp-hilfe" aria-live="polite">Kein Zeichen passt zu „{anfrage.trim()}“.</p>
      ) : null}
      {wert ? <Button onClick={() => waehle(null)}>Kein Zeichen</Button> : null}
    </div>
  );
}
```

`K/_ui/editor/KontaktZeilen.tsx`:

```tsx
"use client";

import { useState } from "react";
import { Button, Input, Select } from "antd";
import { KONTAKT_NAME, KONTAKT_REIHENFOLGE } from "../../_lib/plan/kontakte";
import { GRENZE, LAENGE, type Kontakt, type KontaktArt } from "../../_lib/plan/schema";

const ARTEN = KONTAKT_REIHENFOLGE.map((a) => ({ value: a, label: KONTAKT_NAME[a] }));

/**
 * KONTAKTE (Spec §4.2, §6.4): Zeilen Art + Wert, angezeigt in der FESTEN Reihenfolge der Vorlage —
 * dieselbe wie auf der Karte. Gespeichert wird in Eingabereihenfolge; `i` ist der Index dort.
 */
export function KontaktZeilen({ kontakte, onAendere }: { kontakte: readonly Kontakt[]; onAendere: (neu: Kontakt[], schluessel?: string) => void }) {
  const [neueArt, setNeueArt] = useState<KontaktArt>("telefon");
  const zeilen = KONTAKT_REIHENFOLGE.flatMap((art) => kontakte.map((k, i) => ({ k, i })).filter((x) => x.k.art === art));
  const setze = (i: number, teil: Partial<Kontakt>, schluessel?: string) => onAendere(kontakte.map((k, j) => (j === i ? { ...k, ...teil } : k)), schluessel);
  return (
    <fieldset className="kp-abschnitt">
      <legend>Kontakte</legend>
      {zeilen.length === 0 ? <p className="kp-hilfe">Noch keine Kontakte.</p> : null}
      {zeilen.map(({ k, i }) => (
        <div key={i} className="kp-zeile" data-kontakt-zeile={i}>
          <Select aria-label={`Art von ${KONTAKT_NAME[k.art]}`} value={k.art} onChange={(art: KontaktArt) => setze(i, { art })} options={ARTEN} />
          <Input aria-label={`${KONTAKT_NAME[k.art]}: Wert`} value={k.wert} maxLength={LAENGE.kontakt} onChange={(e) => setze(i, { wert: e.target.value }, `kontakt:${i}`)} />
          <Button aria-label={`${KONTAKT_NAME[k.art]} entfernen`} onClick={() => onAendere(kontakte.filter((_, j) => j !== i))}>Entfernen</Button>
        </div>
      ))}
      <div className="kp-zeile">
        <Select aria-label="Art des neuen Kontakts" value={neueArt} onChange={(a: KontaktArt) => setNeueArt(a)} options={ARTEN} />
        <Button onClick={() => onAendere([...kontakte, { art: neueArt, wert: "" }])} disabled={kontakte.length >= GRENZE.kontakte}>Kontakt hinzufügen</Button>
      </div>
    </fieldset>
  );
}
```

`K/_ui/editor/StelleFlyin.tsx`:

```tsx
"use client";

import { useEffect, useId, type RefObject } from "react";
import { Button, Checkbox, Drawer, Input, type InputRef } from "antd";
import { flyinBreite } from "@/core/theme/flyin";
import { aendereStelle, type StellenAenderung } from "../../_lib/plan/operationen";
import { LAENGE, type PlanInhalt } from "../../_lib/plan/schema";
import type { ZeichenIndexEintrag } from "../../_lib/zeichen/grundlagen";
import type { Symbolsatz } from "../zeichnung/Symbole";
import type { Aendere } from "./aendere";
import { KontaktZeilen } from "./KontaktZeilen";
import { ZeichenWahl } from "./ZeichenWahl";

export interface StelleFormularProps {
  inhalt: PlanInhalt; stelleId: string; aendere: Aendere; symbole: Symbolsatz;
  zeichenIndex: readonly ZeichenIndexEintrag[]; ladeSymbole: (schluessel: string[]) => void;
  fokus: { ziel: "titel" | "einheit"; n: number }; titelRef: RefObject<InputRef | null>; onLoeschen: () => void;
}

/**
 * DAS FLYIN EINER STELLE (Spec §6.2, §6.4): rechts, `flyinBreite()` (Falle 13), OHNE Maske — die
 * Zeichnung bleibt klickbar, ein Klick auf eine andere Karte wechselt die Stelle im offenen Flyin.
 * Jede Eingabe wirkt sofort auf das Dokument (Autosave, Rückgängig); es gibt kein „Speichern".
 */
export function StelleFlyin({ offen, onSchliessen, ...formular }: StelleFormularProps & { offen: boolean; onSchliessen: () => void }) {
  const s = formular.inhalt.stellen.find((x) => x.id === formular.stelleId);
  return (
    <Drawer open={offen} onClose={onSchliessen} mask={false} size={flyinBreite(520)} destroyOnHidden rootClassName="kp-flyin"
      title={s ? (s.titel.trim() || "Neue Stelle") : "Stelle"}
      afterOpenChange={(auf) => { if (auf && formular.fokus.ziel === "titel") formular.titelRef.current?.focus(); }}>
      {offen ? <StelleFormular {...formular} /> : null}
    </Drawer>
  );
}

export function StelleFormular(p: StelleFormularProps) {
  const { inhalt, stelleId, aendere, fokus, titelRef } = p;
  const basis = useId();
  // Fokusanfrage des Editors (neue Stelle, Enter): auch bei schon offenem Flyin, daher über `fokus.n`.
  useEffect(() => { if (fokus.ziel === "titel") titelRef.current?.focus(); }, [fokus, titelRef]);
  const s = inhalt.stellen.find((x) => x.id === stelleId);
  if (!s) return <p className="kp-hilfe">Diese Stelle gibt es nicht mehr.</p>;
  const setze = (teil: StellenAenderung, schluessel?: string) => aendere((q) => aendereStelle(q, s.id, teil), schluessel);
  const planZeichen = [...new Set(inhalt.stellen.map((x) => x.zeichen).filter((z): z is string => z !== null))];

  return (
    <div className="kp-formular" data-flyin-stelle={s.id}>
      <label className="kp-feldname" htmlFor={`${basis}-titel`}>Titel</label>
      <Input id={`${basis}-titel`} ref={titelRef} name="titel" value={s.titel} maxLength={LAENGE.titel}
        onChange={(e) => setze({ titel: e.target.value }, `titel:${s.id}`)} />
      <label className="kp-feldname" htmlFor={`${basis}-leiter`}>Leiter</label>
      <Input id={`${basis}-leiter`} name="leiter" value={s.leiter ?? ""} maxLength={LAENGE.leiter}
        onChange={(e) => setze({ leiter: e.target.value === "" ? null : e.target.value }, `leiter:${s.id}`)} />
      <Checkbox className="kp-hervorheben" checked={s.hervorheben} onChange={(e) => setze({ hervorheben: e.target.checked })}>Hervorheben</Checkbox>

      <fieldset className="kp-abschnitt">
        <legend>Zeichen</legend>
        <ZeichenWahl wert={s.zeichen} index={p.zeichenIndex} symbole={p.symbole} ladeSymbole={p.ladeSymbole}
          planZeichen={planZeichen} onWahl={(k) => setze({ zeichen: k })} />
      </fieldset>

      <KontaktZeilen kontakte={s.kontakte} onAendere={(neu, sch) => setze({ kontakte: neu }, sch ? `${sch}:${s.id}` : undefined)} />

      {/* TASK-12-EINFUEGESTELLE: Untersteht/Lage, Verbindung, Kanäle, Einheiten */}

      <div className="kp-formular-knoepfe">
        <Button danger onClick={p.onLoeschen}>Stelle löschen</Button>
      </div>
    </div>
  );
}
```

Der Kommentar `TASK-12-EINFUEGESTELLE` ist eine Markierung für Task 12 und verschwindet dort; `pnpm lint` stört er nicht.

In `K/_ui/kommplan.css` anhängen:

```css
/* Abschnitte im Flyin: ein Rahmen ohne Kasten, Zeilen mit Feld und Knopf nebeneinander, am Telefon untereinander. */
.kp-abschnitt { border: 0; border-top: 1px solid var(--kp-rand); margin: 16px 0 0; padding: 12px 0 0; display: grid; gap: 8px; }
.kp-abschnitt > legend { font-size: 12px; font-weight: 600; letter-spacing: .06em; text-transform: uppercase; color: var(--kp-gedaempft); padding: 0; }
.kp-hilfe { margin: 0; font-size: 13px; color: var(--kp-gedaempft); }
.kp-zeile { display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 8px; align-items: center; }
.kp-zeichen-raster { display: grid; grid-template-columns: repeat(auto-fill, minmax(140px, 1fr)); gap: 8px; }
.kp-zeichen-knopf {
  display: flex; align-items: center; gap: 8px; min-height: 44px; padding: 4px 8px; text-align: start;
  border: 1px solid var(--kp-rand); border-radius: 8px; background: var(--kp-flaeche); color: inherit; font: inherit; cursor: pointer;
}
.kp-zeichen-knopf[aria-pressed="true"] { border-color: var(--kp-auswahl); box-shadow: inset 0 0 0 1px var(--kp-auswahl); }
.kp-zeichen-knopf:focus-visible { outline: 2px solid var(--kp-auswahl); outline-offset: 2px; }
/* Zeichen sind Papier: weißer Grund auch im Dunkelmodus (wie die Legende). */
.kp-zeichen-knopf svg, .kp-zeichen-platz { flex: none; width: 36px; height: 36px; background: #ffffff; border-radius: 4px; }
```

und die Variable `--kp-auswahl` in beiden Variablenblöcken ergänzen (gleiche Zeile wie `--kp-gedaempft`): hell `--kp-auswahl: #1f5fbf;`, dunkel `--kp-auswahl: #7fb0ff;` (bewusst nicht Suite-Rot: Rot ist Primäraktion, Falle 3).

- [ ] **Step 4: Grün sehen**

Run: `pnpm vitest run src/app/m/kommplan && pnpm typecheck; echo "typecheck exit $?"`
Expected: PASS, exit 0. Findet der Kontakt-Test das Wertfeld nicht, weil antd das `<input>` anders schachtelt: den Greifer auf `[data-kontakt-zeile] input[aria-label$=": Wert"]` umstellen — nicht auf eine antd-Klasse eines anderen Bauteils.

- [ ] **Step 5: Ankerschritt und Commit**

Ankerschritt für `kontakte.ts` und `kommplan.css`.

```bash
git add src/app/m/kommplan/_ui/editor src/app/m/kommplan/_lib/plan/kontakte.ts src/app/m/kommplan/_lib/plan/kontakte.test.ts src/app/m/kommplan/_ui/kommplan.css
git commit -S -m "feat(kommplan): Flyin einer Stelle mit Titel, Leiter, Zeichen-Suche und Kontakten

Jede Eingabe wirkt sofort aufs Dokument; Kontakte stehen in der festen
Reihenfolge der Vorlage, zuletzt genutzte Zeichen oben.

DRK-500

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 12: Flyin einer Stelle, Teil 2 — Untersteht/Lage, Verbindung, Kanäle, Einheiten

**Files:**
- Create: `K/_ui/editor/StellenLage.tsx`, `K/_ui/editor/VerbindungWahl.tsx`, `K/_ui/editor/EinheitenListe.tsx`
- Modify: `K/_ui/editor/StelleFlyin.tsx` (Markierung `TASK-12-EINFUEGESTELLE` ersetzen)
- Test: `K/_ui/editor/StelleFlyin.test.tsx`

**Interfaces:**
- Consumes: `haengeUm`, `moeglicheEltern`, `aendereStelle` (Tasks 2, 3), `legeVerbindungAn`, `findeVerbindung` (Task 3), `fuegeEinheitenEin`, `aendereEinheit`, `loescheEinheit` (Task 4), `leseEinheitenliste` (Task 4), `neueId`, `neueIds` (Task 8), `ART_NAME`, `VERBINDUNGS_ARTEN`, `GRENZE`, `LAENGE`, `Aendere` (Task 11).
- Produces: `StellenLage({ inhalt, stelle, aendere })`, `VerbindungWahl({ inhalt, stelle, aendere })`, `EinheitenListe({ inhalt, stelle, aendere, fokus })` — je `stelle: Stelle`, `aendere: Aendere`, `fokus: { ziel: "titel" | "einheit"; n: number }`.

- [ ] **Step 1: Failing tests**

An `K/_ui/editor/StelleFlyin.test.tsx` anhängen. Der `Rahmen` bekommt dafür eine Prop `start` (Vorgabe `START`) und `stelleId` (Vorgabe `"a"`); `START` wird erweitert:

```tsx
// START ersetzen durch:
const START = baue({
  verbindungen: [{ id: "v1", art: "tmo", bezeichnung: "R_UE_2" }],
  stellen: [
    { id: "el", titel: "EL" },
    { id: "a", titel: "EA 1", eltern: "el", verbindung: "v1", kontakte: { email: "ea1@drk.de", funkrufname: "RK UE 40-00" }, einheiten: ["RTW RK 1"] },
    { id: "b", titel: "EA 2", eltern: "el" },
    { id: "b1", titel: "Trupp", eltern: "b" },
  ],
});
// Rahmen-Signatur: function Rahmen({ start = START, stelleId = "a", fokus = FOKUS0, titelRef = REF0 }: { start?: PlanInhalt; stelleId?: string; … })
// — useState(start), stelleId an StelleFormular durchreichen; `stelle()` liest weiter die Stelle "a".
```

```tsx
describe("Flyin einer Stelle, Teil 2", () => {
  const radio = (text: string) => queryAll<HTMLInputElement>('input[type="radio"]').find((r) => r.closest("label")?.textContent === text)!;
  it("Lage: seitlich geht nur ohne Unter- und Seitenstellen, oberste Ebene steht immer darunter (Review Focus 3)", async () => {
    await mount(<Rahmen stelleId="b" />);
    expect(radio("links daneben").disabled).toBe(true);
    expect(document.body.textContent).toContain("Eine Stelle mit Unter- oder Seitenstellen kann nicht seitlich stehen.");
    unmount();
    await mount(<Rahmen stelleId="a" />);
    await clickElement(radio("rechts daneben"));
    expect(stelle()).toMatchObject({ eltern: "el", lage: "rechts" });
    unmount();
    await mount(<Rahmen stelleId="el" />);
    expect(radio("links daneben").disabled).toBe(true);
    expect(document.body.textContent).toContain("Eine Stelle der obersten Ebene steht immer darunter.");
  });
  it("neue Verbindung eintippen: Bezeichnung + Art legt sie an und verbindet; eine gleichnamige wird wiederverwendet", async () => {
    await mount(<Rahmen />);
    await clickElement(knopf("Neue Verbindung"));
    await fill('input[aria-label="Bezeichnung der neuen Verbindung"]', "R_UE_3");
    await clickElement(knopf("Anlegen und verbinden"));
    const neu = stand.verbindungen.find((v) => v.bezeichnung === "R_UE_3")!;
    expect(neu.art).toBe("tmo");
    expect(stelle().verbindungId).toBe(neu.id);
    await clickElement(knopf("Neue Verbindung"));
    await fill('input[aria-label="Bezeichnung der neuen Verbindung"]', " r_ue_2 ");
    await clickElement(knopf("Anlegen und verbinden"));
    expect(stand.verbindungen).toHaveLength(2);
    expect(stelle().verbindungId).toBe("v1");
  });
  it("Einheiten: einzeln anlegen (Fokus im Typ), ändern, entfernen", async () => {
    await mount(<Rahmen />);
    await clickElement(knopf("+ Einheit"));
    expect(stelle().einheiten).toHaveLength(2);
    const typ = queryAll<HTMLInputElement>('input[aria-label$=": Typ"]').at(-1)!;
    expect(document.activeElement).toBe(typ);
    await fill(`input[aria-label="${typ.getAttribute("aria-label")}"]`, "KTW");
    expect(stelle().einheiten[1].typ).toBe("KTW");
    await clickElement(queryAll('button[aria-label$="entfernen"]').filter((b) => b.getAttribute("aria-label")!.startsWith("Einheit")).at(0)!);
    expect(stelle().einheiten.map((e) => e.typ)).toEqual(["KTW"]);
  });
  it("Liste einfügen: je Zeile erstes Wort Typ, Rest Rufname", async () => {
    await mount(<Rahmen />);
    await clickElement(knopf("Liste einfügen"));
    await fill('textarea[aria-label="Einheiten, je Zeile eine"]', "KTW RK UE 40-92-1\n\nMTW RK UE 40-17-1");
    await clickElement(knopf("Übernehmen"));
    expect(stelle().einheiten.map((e) => [e.typ, e.rufname])).toEqual([["RTW", "RK 1"], ["KTW", "RK UE 40-92-1"], ["MTW", "RK UE 40-17-1"]]);
    expect(queryAll("textarea")).toHaveLength(0);
  });
  it("Liste einfügen mit Fehlern oder über 60: nichts übernommen, Hinweis bleibt am Feld (Review Focus 2)", async () => {
    await mount(<Rahmen />);
    await clickElement(knopf("Liste einfügen"));
    await fill('textarea[aria-label="Einheiten, je Zeile eine"]', `KTW ${"R".repeat(81)}`);
    await clickElement(knopf("Übernehmen"));
    expect(document.body.textContent).toContain("Zeile 1: Der Rufname ist länger als 80 Zeichen.");
    expect(stelle().einheiten).toHaveLength(1);
    await fill('textarea[aria-label="Einheiten, je Zeile eine"]', Array.from({ length: 60 }, (_, i) => `RTW ${i}`).join("\n"));
    await clickElement(knopf("Übernehmen"));
    expect(document.body.textContent).toContain("Höchstens 60 Einheiten je Stelle — hier wären es 61.");
    expect(stelle().einheiten).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Rot sehen**

Run: `pnpm vitest run src/app/m/kommplan/_ui/editor/StelleFlyin.test.tsx`
Expected: FAIL — die neuen Abschnitte fehlen (die Tests aus Task 11 bleiben grün).

- [ ] **Step 3: Implementieren**

`K/_ui/editor/StellenLage.tsx`:

```tsx
"use client";

import { useId, useState } from "react";
import { Radio, Select } from "antd";
import { baueBaum, nachkommen } from "../../_lib/plan/baum";
import { haengeUm, moeglicheEltern } from "../../_lib/plan/operationen";
import type { Lage, PlanInhalt, Stelle } from "../../_lib/plan/schema";
import type { Aendere } from "./aendere";

const OBERSTE = "~oberste"; // „~" ist in IDs nicht erlaubt, kollidiert also nie

/** „Untersteht / Lage" (Spec §6.4): darüber läuft das Umhängen; Ziele, die einen Zyklus bildeten, stehen gar nicht erst zur Wahl. */
export function StellenLage({ inhalt, stelle, aendere }: { inhalt: PlanInhalt; stelle: Stelle; aendere: Aendere }) {
  const basis = useId();
  const [fehler, setFehler] = useState<string | null>(null);
  const hatNachkommen = nachkommen(baueBaum(inhalt), stelle.id).length > 0;
  const grund = stelle.eltern === null ? "Eine Stelle der obersten Ebene steht immer darunter."
    : hatNachkommen ? "Eine Stelle mit Unter- oder Seitenstellen kann nicht seitlich stehen." : null;
  const setze = (eltern: string | null, lage: Lage) => setFehler(aendere((p) => haengeUm(p, stelle.id, { eltern, lage })));
  return (
    <fieldset className="kp-abschnitt">
      <legend>Untersteht</legend>
      <label className="kp-feldname" htmlFor={`${basis}-eltern`}>Elternstelle</label>
      <Select id={`${basis}-eltern`} showSearch optionFilterProp="label" value={stelle.eltern ?? OBERSTE}
        onChange={(v: string) => setze(v === OBERSTE ? null : v, v === OBERSTE ? "unter" : stelle.lage)}
        options={[{ value: OBERSTE, label: "— oberste Ebene —" },
          ...moeglicheEltern(inhalt, stelle.id).map((x) => ({ value: x.id, label: x.titel.trim() || "(ohne Titel)" }))]} />
      <span id={`${basis}-lage`} className="kp-hilfe">Lage zur Elternstelle</span>
      <Radio.Group aria-labelledby={`${basis}-lage`} optionType="button" value={stelle.lage}
        onChange={(e) => setze(stelle.eltern, e.target.value as Lage)}
        options={[
          { value: "unter", label: "darunter" },
          { value: "links", label: "links daneben", disabled: grund !== null },
          { value: "rechts", label: "rechts daneben", disabled: grund !== null },
        ]} />
      {grund ? <p className="kp-hilfe">{grund}</p> : null}
      {fehler ? <p className="kp-feldfehler" role="status">{fehler}</p> : null}
    </fieldset>
  );
}
```

`K/_ui/editor/VerbindungWahl.tsx`:

```tsx
"use client";

import { useId, useState } from "react";
import { Button, Input, Select } from "antd";
import { aendereStelle } from "../../_lib/plan/operationen";
import { ART_NAME, GRENZE, LAENGE, VERBINDUNGS_ARTEN, type PlanInhalt, type Stelle, type VerbindungsArt } from "../../_lib/plan/schema";
import { findeVerbindung, legeVerbindungAn } from "../../_lib/plan/verbindungen";
import type { Aendere } from "./aendere";
import { neueId } from "./ids";

const KEINE = "~keine";

/**
 * „Verbindung zur Elternstelle" (Spec §6.4): vorhandene wählen oder neu eintippen (Bezeichnung + Art).
 * Neu eingetippt und gleichnamig vorhanden (gleiche Art) → die vorhandene wird genommen, keine Doppelung.
 * Dazu die Kanäle der Stelle ohne Gegenstelle (Phase-1-Abweichung 12, Entscheidung 10).
 */
export function VerbindungWahl({ inhalt, stelle, aendere }: { inhalt: PlanInhalt; stelle: Stelle; aendere: Aendere }) {
  const basis = useId();
  const [neu, setNeu] = useState(false);
  const [bezeichnung, setBezeichnung] = useState("");
  const [art, setArt] = useState<VerbindungsArt>("tmo");
  const [fehler, setFehler] = useState<string | null>(null);
  const optionen = inhalt.verbindungen.map((v) => ({ value: v.id, label: `${v.bezeichnung} · ${ART_NAME[v.art]}` }));

  const verbindeNeu = () => {
    const id = neueId(inhalt, "v");
    const f = aendere((p) => {
      const vorhanden = findeVerbindung(p, bezeichnung, art);
      const mit = vorhanden ? p : legeVerbindungAn(p, { id, art, bezeichnung });
      return aendereStelle(mit, stelle.id, { verbindungId: vorhanden?.id ?? id });
    });
    setFehler(f);
    if (f === null) { setNeu(false); setBezeichnung(""); }
  };

  return (
    <fieldset className="kp-abschnitt">
      <legend>Verbindung</legend>
      {stelle.eltern !== null ? (
        <>
          <label className="kp-feldname" htmlFor={`${basis}-weg`}>Zur Elternstelle</label>
          <div className="kp-zeile">
            <Select id={`${basis}-weg`} value={stelle.verbindungId ?? KEINE}
              onChange={(v: string) => setFehler(aendere((p) => aendereStelle(p, stelle.id, { verbindungId: v === KEINE ? null : v })))}
              options={[{ value: KEINE, label: "keine (dünne Linie)" }, ...optionen]} />
            <Button onClick={() => setNeu(true)} disabled={neu}>Neue Verbindung</Button>
          </div>
          {neu ? (
            <div className="kp-zeile">
              <Input aria-label="Bezeichnung der neuen Verbindung" value={bezeichnung} maxLength={LAENGE.bezeichnung} onChange={(e) => setBezeichnung(e.target.value)} placeholder="z. B. R_UE_2" />
              <Select aria-label="Art der neuen Verbindung" value={art} onChange={(a: VerbindungsArt) => setArt(a)} options={VERBINDUNGS_ARTEN.map((a) => ({ value: a, label: ART_NAME[a] }))} />
              <Button type="primary" onClick={verbindeNeu} disabled={bezeichnung.trim() === ""}>Anlegen und verbinden</Button>
            </div>
          ) : null}
        </>
      ) : <p className="kp-hilfe">Eine Stelle der obersten Ebene hat keine Elternstelle.</p>}
      <label className="kp-feldname" htmlFor={`${basis}-kanaele`}>Kanäle an dieser Stelle (ohne Gegenstelle)</label>
      <Select id={`${basis}-kanaele`} mode="multiple" value={stelle.kanaele} maxCount={GRENZE.kanaele} placeholder="keine"
        onChange={(k: string[]) => setFehler(aendere((p) => aendereStelle(p, stelle.id, { kanaele: k })))} options={optionen} />
      {fehler ? <p className="kp-feldfehler" role="status">{fehler}</p> : null}
    </fieldset>
  );
}
```

`K/_ui/editor/EinheitenListe.tsx`:

```tsx
"use client";

import { useEffect, useRef, useState } from "react";
import { Button, Input, type InputRef } from "antd";
import { aendereEinheit, fuegeEinheitenEin, loescheEinheit } from "../../_lib/plan/einheiten";
import { leseEinheitenliste } from "../../_lib/plan/einfuegen";
import { GRENZE, LAENGE, type PlanInhalt, type Stelle } from "../../_lib/plan/schema";
import type { Aendere } from "./aendere";
import { neueId, neueIds } from "./ids";

/**
 * EINHEITEN (Spec §6.4): einzeln oder „Liste einfügen" (je Zeile erstes Wort Typ, Rest Rufname).
 * Eine Liste mit Fehlern oder über der Grenze wird ganz abgewiesen, nie still gekürzt (Review Focus 2).
 */
export function EinheitenListe({ inhalt, stelle, aendere, fokus }: {
  inhalt: PlanInhalt; stelle: Stelle; aendere: Aendere; fokus: { ziel: "titel" | "einheit"; n: number };
}) {
  const [liste, setListe] = useState<string | null>(null);
  const [fehler, setFehler] = useState<string[]>([]);
  const [lokal, setLokal] = useState(0);
  const letzterTyp = useRef<InputRef>(null);
  // Zwei getrennte Anfragen: die des Editors („+ Einheit" am Griff) und die eigene („+ Einheit" hier).
  // Zusammengelegt stähle eine spätere Titel-Anfrage des Editors den Fokus, sobald `lokal > 0` ist.
  useEffect(() => { if (fokus.ziel === "einheit") letzterTyp.current?.focus(); }, [fokus]);
  useEffect(() => { if (lokal > 0) letzterTyp.current?.focus(); }, [lokal]);

  const neu = () => {
    const f = aendere((p) => fuegeEinheitenEin(p, stelle.id, [{ id: neueId(p, "e"), typ: "", rufname: "", zeichen: null }]));
    if (f === null) setLokal((n) => n + 1); else setFehler([f]);
  };
  const uebernimm = () => {
    const r = leseEinheitenliste(liste ?? "");
    if (r.fehler.length > 0) { setFehler(r.fehler); return; }
    const f = aendere((p) => {
      const ids = neueIds(p, "e", r.einheiten.length);
      return fuegeEinheitenEin(p, stelle.id, r.einheiten.map((e, i) => ({ id: ids[i], ...e, zeichen: null })));
    });
    if (f !== null) { setFehler([f]); return; }
    setListe(null); setFehler([]);
  };

  return (
    <fieldset className="kp-abschnitt">
      <legend>Einheiten</legend>
      {stelle.einheiten.length === 0 ? <p className="kp-hilfe">Noch keine Einheiten.</p> : null}
      {stelle.einheiten.map((e, i) => (
        <div key={e.id} className="kp-zeile" data-einheit-zeile={e.id}>
          <Input ref={i === stelle.einheiten.length - 1 ? letzterTyp : undefined} aria-label={`Einheit ${i + 1}: Typ`} value={e.typ} maxLength={LAENGE.typ}
            onChange={(x) => aendere((p) => aendereEinheit(p, stelle.id, e.id, { typ: x.target.value }), `einheit:${e.id}:typ`)} placeholder="z. B. RTW" />
          <Input aria-label={`Einheit ${i + 1}: Rufname`} value={e.rufname} maxLength={LAENGE.rufname}
            onChange={(x) => aendere((p) => aendereEinheit(p, stelle.id, e.id, { rufname: x.target.value }), `einheit:${e.id}:rufname`)} placeholder="z. B. RK UE 40-83-5" />
          <Button aria-label={`Einheit ${i + 1} entfernen`} onClick={() => aendere((p) => loescheEinheit(p, stelle.id, e.id))}>Entfernen</Button>
        </div>
      ))}
      <div className="kp-formular-knoepfe">
        <Button onClick={neu} disabled={stelle.einheiten.length >= GRENZE.einheiten}>+ Einheit</Button>
        <Button onClick={() => { setListe(liste === null ? "" : null); setFehler([]); }}>{liste === null ? "Liste einfügen" : "Liste schließen"}</Button>
      </div>
      {liste !== null ? (
        <>
          <Input.TextArea aria-label="Einheiten, je Zeile eine" value={liste} onChange={(e) => setListe(e.target.value)} autoSize={{ minRows: 4, maxRows: 12 }}
            placeholder={"RTW RK UE 40-83-5\nKTW RK UE 40-92-1"} />
          <div className="kp-formular-knoepfe"><Button type="primary" onClick={uebernimm} disabled={(liste ?? "").trim() === ""}>Übernehmen</Button></div>
        </>
      ) : null}
      {fehler.length > 0 ? <ul className="kp-feldfehler" role="status">{fehler.map((f) => <li key={f}>{f}</li>)}</ul> : null}
    </fieldset>
  );
}
```

In `StelleFlyin.tsx` die Markierung `{/* TASK-12-EINFUEGESTELLE: … */}` ersetzen durch:

```tsx
      <StellenLage inhalt={inhalt} stelle={s} aendere={aendere} />
      <VerbindungWahl inhalt={inhalt} stelle={s} aendere={aendere} />
      <EinheitenListe inhalt={inhalt} stelle={s} aendere={aendere} fokus={fokus} />
```

(Importe ergänzen.)

- [ ] **Step 4: Grün sehen**

Run: `pnpm vitest run src/app/m/kommplan && pnpm typecheck; echo "typecheck exit $?"`
Expected: PASS, exit 0. Der Test „Einheiten … entfernen" klickt die **erste** Entfernen-Schaltfläche einer Einheit (`Einheit 1 entfernen` = „RTW RK 1"); übrig bleibt die neue „KTW".

- [ ] **Step 5: Commit**

```bash
git add src/app/m/kommplan/_ui/editor
git commit -S -m "feat(kommplan): Umhängen, Verbindung, Kanäle und Einheiten im Flyin einer Stelle

Zyklen stehen nicht zur Wahl, eine neu eingetippte Verbindung wird
wiederverwendet, wenn es sie schon gibt; „Liste einfügen“ übernimmt nur
fehlerfreie Listen.

DRK-500

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 13: Plan-Flyin — Planangaben, Optionen, Verbindungen verwalten

**Files:**
- Create: `K/_ui/editor/PlanFlyin.tsx`
- Test: `K/_ui/editor/PlanFlyin.test.tsx`

**Interfaces:**
- Consumes: `angabenSchema`, `PLAN_TYPEN`, `TYP_NAME`, `LAENGE_ANLASS`, `tagZuMs`, `Planangaben` (Task 5), `SpeicherErgebnis`, `FeldFehler` (Task 5), `setzeOptionen` (Task 2), `verbindungsNutzung`, `istReserve`, `aendereVerbindung`, `loescheVerbindung`, `legeVerbindungAn` (Task 3), `neueId` (Task 8), `Aendere` (Task 11).
- Produces: `PlanFlyin({ offen, onSchliessen, ...props })` und `PlanFormular(props: PlanFormularProps)` mit `interface PlanFormularProps { angaben: Planangaben; inhalt: PlanInhalt; aendere: Aendere; speichereAngaben: (a: Planangaben) => Promise<SpeicherErgebnis> }`.

- [ ] **Step 1: Failing test**

`K/_ui/editor/PlanFlyin.test.tsx`:

```tsx
// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, useState } from "react";
import { clickElement, fill, mount, query, queryAll, unmount } from "@/app/m/qr/_lib/test-dom";
import type { Planangaben } from "../../_lib/angaben";
import { baue } from "../../_lib/beispiele/bau";
import { PlanFehler } from "../../_lib/plan/operationen";
import type { PlanInhalt } from "../../_lib/plan/schema";
import type { Aendere } from "./aendere";
import { PlanFormular } from "./PlanFlyin";

const START = baue({
  verbindungen: [
    { id: "v1", art: "tmo", bezeichnung: "R_UE_2" }, { id: "v2", art: "dmo", bezeichnung: "DMO 608" }, { id: "v3", art: "tmo", bezeichnung: "K_UE_2" },
  ],
  stellen: [{ id: "el", titel: "EL" }, { id: "a", titel: "EA", eltern: "el", verbindung: "v1", kanaele: ["v2"] }],
});
const ANGABEN: Planangaben = { titel: "Übung", typ: "kommunikationsplan", anlass: null, datum: "2026-09-30" };
let stand: PlanInhalt = START;
const speichere = vi.fn();
function Rahmen() {
  const [inhalt, setInhalt] = useState(START);
  const aendere: Aendere = (op) => {
    try { const neu = op(inhalt); setInhalt(neu); stand = neu; return null; }
    catch (e) { if (e instanceof PlanFehler) return e.message; throw e; }
  };
  return <PlanFormular angaben={ANGABEN} inhalt={inhalt} aendere={aendere} speichereAngaben={speichere} />;
}
const knopf = (text: string) => queryAll<HTMLButtonElement>("button").find((b) => b.textContent === text)!;
const zeile = (id: string) => query(`[data-verbindung-zeile="${id}"]`);
afterEach(() => { unmount(); stand = START; speichere.mockReset(); });

describe("Plan-Flyin", () => {
  it("Planangaben: Übernehmen sendet die Werte; Feldfehler stehen am Feld", async () => {
    speichere.mockResolvedValue({ ok: false, grund: "ungueltig", fehler: "Bitte die markierten Felder prüfen.", feldFehler: { titel: "Bitte einen Titel eintragen." } });
    await mount(<Rahmen />);
    await fill('input[name="titel"]', "  ");
    await fill('input[name="anlass"]', "Probe");
    await clickElement(knopf("Übernehmen"));
    await act(async () => {});
    expect(speichere).toHaveBeenCalledWith({ titel: "  ", typ: "kommunikationsplan", anlass: "Probe", datum: "2026-09-30" });
    expect(query('input[name="titel"]').getAttribute("aria-invalid")).toBe("true");
    expect(document.body.textContent).toContain("Bitte einen Titel eintragen.");
  });
  it("Optionen: Leerzeilen und VS-NfD-Vermerk schalten im Dokument", async () => {
    await mount(<Rahmen />);
    await clickElement(query('[data-option="leerzeilen"]'));
    await clickElement(query('[data-option="vermerkVsNfD"]'));
    expect(stand.optionen).toMatchObject({ leerzeilen: true, vermerkVsNfD: false });
  });
  it("Verbindungen: Nutzung ablesbar, Reserve als Chip, löschen nur unbenutzt — ein reiner Kanal ist benutzt (Review Focus 4)", async () => {
    await mount(<Rahmen />);
    expect(zeile("v1").textContent).toContain("Weg zu 1 Stelle");
    expect(zeile("v2").textContent).toContain("Kanal an 1 Stelle");
    expect(zeile("v3").querySelector(".kp-chip")?.textContent).toBe("Reserve");
    expect(zeile("v1").querySelector<HTMLButtonElement>('button[aria-label="Verbindung 1 (R_UE_2) löschen"]')!.disabled).toBe(true);
    expect(zeile("v2").querySelector<HTMLButtonElement>('button[aria-label="Verbindung 2 (DMO 608) löschen"]')!.disabled).toBe(true);
    await clickElement(zeile("v3").querySelector<HTMLButtonElement>('button[aria-label="Verbindung 3 (K_UE_2) löschen"]')!);
    expect(stand.verbindungen.map((v) => v.id)).toEqual(["v1", "v2"]);
  });
  it("umbenennen wirkt sofort; ein geleertes Feld ändert nichts und sagt warum", async () => {
    await mount(<Rahmen />);
    await fill('[data-verbindung-zeile="v1"] input[aria-label="Verbindung 1: Bezeichnung"]', "R_UE_9");
    expect(stand.verbindungen[0].bezeichnung).toBe("R_UE_9");
    await fill('[data-verbindung-zeile="v1"] input[aria-label="Verbindung 1: Bezeichnung"]', "  ");
    expect(stand.verbindungen[0].bezeichnung).toBe("R_UE_9");
    expect(zeile("v1").textContent).toContain("Die Verbindung braucht eine Bezeichnung.");
  });
  it("neue Verbindung anlegen — sie ist zunächst Reserve", async () => {
    await mount(<Rahmen />);
    await fill('input[aria-label="Bezeichnung der neuen Verbindung"]', "Standleitung");
    await clickElement(knopf("Verbindung anlegen"));
    expect(stand.verbindungen.at(-1)).toMatchObject({ bezeichnung: "Standleitung", art: "tmo" });
    expect(queryAll(".kp-chip").map((c) => c.textContent)).toEqual(["Reserve", "Reserve"]);
  });
});
```

- [ ] **Step 2: Rot sehen**

Run: `pnpm vitest run src/app/m/kommplan/_ui/editor/PlanFlyin.test.tsx`
Expected: FAIL — Modul fehlt.

- [ ] **Step 3: Implementieren**

`K/_ui/editor/PlanFlyin.tsx`:

```tsx
"use client";

import { useId, useState, type FormEvent } from "react";
import dayjs, { type Dayjs } from "dayjs";
import { Alert, Button, DatePicker, Drawer, Input, Select, Switch } from "antd";
import { enterUebernimmtNurDasFeld } from "@/core/formular/enter";
import { flyinBreite } from "@/core/theme/flyin";
import { LAENGE_ANLASS, PLAN_TYPEN, TYP_NAME, type Planangaben, type PlanTyp } from "../../_lib/angaben";
import type { FeldFehler, SpeicherErgebnis } from "../../_lib/ergebnis";
import { setzeOptionen } from "../../_lib/plan/operationen";
import { ART_NAME, LAENGE, VERBINDUNGS_ARTEN, type PlanInhalt, type VerbindungsArt } from "../../_lib/plan/schema";
import { aendereVerbindung, legeVerbindungAn, loescheVerbindung, verbindungsNutzung } from "../../_lib/plan/verbindungen";
import type { Aendere } from "./aendere";
import { neueId } from "./ids";

export interface PlanFormularProps { angaben: Planangaben; inhalt: PlanInhalt; aendere: Aendere; speichereAngaben: (a: Planangaben) => Promise<SpeicherErgebnis> }

/**
 * DAS FLYIN DES PLANS (Entscheidung 3): Planangaben sind Spalten und werden mit „Übernehmen"
 * gespeichert (eigene Audit-Zeile); Optionen und Verbindungen sind Dokument und wirken sofort.
 */
export function PlanFlyin({ offen, onSchliessen, ...p }: PlanFormularProps & { offen: boolean; onSchliessen: () => void }) {
  return (
    <Drawer open={offen} onClose={onSchliessen} mask={false} size={flyinBreite(560)} destroyOnHidden rootClassName="kp-flyin" title="Plan">
      {offen ? <PlanFormular {...p} /> : null}
    </Drawer>
  );
}

export function PlanFormular({ angaben, inhalt, aendere, speichereAngaben }: PlanFormularProps) {
  return (
    <div className="kp-formular">
      <Angaben angaben={angaben} speichereAngaben={speichereAngaben} />
      <fieldset className="kp-abschnitt">
        <legend>Optionen</legend>
        <label className="kp-schalter"><Switch data-option="leerzeilen" checked={inhalt.optionen.leerzeilen}
          onChange={(v) => aendere((q) => setzeOptionen(q, { leerzeilen: v }))} /> Leerzeilen für den Handeintrag</label>
        <label className="kp-schalter"><Switch data-option="vermerkVsNfD" checked={inhalt.optionen.vermerkVsNfD}
          onChange={(v) => aendere((q) => setzeOptionen(q, { vermerkVsNfD: v }))} /> Vermerk „VS – Nur für den Dienstgebrauch“</label>
      </fieldset>
      <Verbindungen inhalt={inhalt} aendere={aendere} />
    </div>
  );
}

function Angaben({ angaben, speichereAngaben }: Pick<PlanFormularProps, "angaben" | "speichereAngaben">) {
  const basis = useId();
  const [titel, setTitel] = useState(angaben.titel);
  const [typ, setTyp] = useState<PlanTyp>(angaben.typ);
  const [anlass, setAnlass] = useState(angaben.anlass ?? "");
  const [datum, setDatum] = useState<Dayjs | null>(angaben.datum ? dayjs(angaben.datum) : null);
  const [feldFehler, setFeldFehler] = useState<FeldFehler>({});
  const [meldung, setMeldung] = useState<string | null>(null);
  const [laeuft, setLaeuft] = useState(false);

  const absenden = (e?: FormEvent) => {
    e?.preventDefault();
    setLaeuft(true); setFeldFehler({}); setMeldung(null);
    void speichereAngaben({ titel, typ, anlass, datum: datum ? datum.format("YYYY-MM-DD") : null } as Planangaben)
      .then((r) => {
        if (r.ok) setMeldung("Übernommen.");
        else if (r.grund === "ungueltig") setFeldFehler(r.feldFehler ?? {});
        else if (r.grund === "konflikt") setMeldung("Nicht übernommen: der Plan wurde inzwischen geändert. Entscheide oben, welche Fassung gilt, dann noch einmal übernehmen.");
        else setMeldung("Diesen Plan gibt es nicht mehr, oder er wurde archiviert.");
      })
      .catch(() => setMeldung("Nicht übernommen — prüfe die Verbindung und ob du noch angemeldet bist."))
      .finally(() => setLaeuft(false));
  };
  const feld = (name: string) => ({ id: `${basis}-${name}`, "aria-invalid": feldFehler[name] ? true : undefined });
  const fehler = (name: string) => (feldFehler[name] ? <p className="kp-feldfehler">{feldFehler[name]}</p> : null);

  return (
    <form className="kp-formular" aria-label="Planangaben" onSubmit={absenden}>
      <label className="kp-feldname" htmlFor={`${basis}-titel`}>Titel</label>
      <Input name="titel" value={titel} maxLength={LAENGE.titel} onChange={(e) => setTitel(e.target.value)} {...feld("titel")} />
      {fehler("titel")}
      <label className="kp-feldname" htmlFor={`${basis}-typ`}>Art</label>
      <Select id={`${basis}-typ`} value={typ} onChange={(v: PlanTyp) => setTyp(v)} options={PLAN_TYPEN.map((t) => ({ value: t, label: TYP_NAME[t] }))} />
      <label className="kp-feldname" htmlFor={`${basis}-anlass`}>Anlass</label>
      <Input name="anlass" value={anlass} maxLength={LAENGE_ANLASS} onChange={(e) => setAnlass(e.target.value)} {...feld("anlass")} />
      {fehler("anlass")}
      <label className="kp-feldname" htmlFor={`${basis}-datum`}>Datum</label>
      <DatePicker id={`${basis}-datum`} value={datum} onChange={setDatum} format="DD.MM.YYYY" onKeyDown={enterUebernimmtNurDasFeld} status={feldFehler.datum ? "error" : undefined} />
      {fehler("datum")}
      {meldung ? <Alert type={meldung === "Übernommen." ? "success" : "warning"} showIcon message={meldung} /> : null}
      <div className="kp-formular-knoepfe"><Button type="primary" htmlType="submit" loading={laeuft} disabled={laeuft}>Übernehmen</Button></div>
    </form>
  );
}

function nutzungText(n: { eltern: number; kanal: number }): string {
  const teile = [
    n.eltern > 0 ? `Weg zu ${n.eltern} ${n.eltern === 1 ? "Stelle" : "Stellen"}` : null,
    n.kanal > 0 ? `Kanal an ${n.kanal} ${n.kanal === 1 ? "Stelle" : "Stellen"}` : null,
  ].filter(Boolean);
  return teile.join(" · ");
}

/** „Verbindungen des Plans verwalten": umbenennen, Art ändern, löschen nur unbenutzt; unbenutzt = Reserve (Legende). */
function Verbindungen({ inhalt, aendere }: Pick<PlanFormularProps, "inhalt" | "aendere">) {
  const [entwurf, setEntwurf] = useState<Record<string, string>>({});
  const [bezeichnung, setBezeichnung] = useState("");
  const [art, setArt] = useState<VerbindungsArt>("tmo");
  const [fehler, setFehler] = useState<string | null>(null);
  const nutzung = verbindungsNutzung(inhalt);
  const ARTEN = VERBINDUNGS_ARTEN.map((a) => ({ value: a, label: ART_NAME[a] }));

  const umbenennen = (id: string, wert: string) => {
    setEntwurf((e) => ({ ...e, [id]: wert }));
    if (wert.trim() !== "") aendere((p) => aendereVerbindung(p, id, { bezeichnung: wert }), `verbindung:${id}`);
  };
  const anlegen = () => {
    const f = aendere((p) => legeVerbindungAn(p, { id: neueId(p, "v"), art, bezeichnung }));
    setFehler(f);
    if (f === null) setBezeichnung("");
  };

  return (
    <fieldset className="kp-abschnitt">
      <legend>Verbindungen</legend>
      {inhalt.verbindungen.length === 0 ? <p className="kp-hilfe">Noch keine Verbindungen.</p> : null}
      {inhalt.verbindungen.map((v, i) => {
        const n = nutzung.get(v.id) ?? { eltern: 0, kanal: 0 };
        const reserve = n.eltern === 0 && n.kanal === 0;
        const wert = entwurf[v.id] ?? v.bezeichnung;
        return (
          <div key={v.id} className="kp-verbindung" data-verbindung-zeile={v.id}>
            <div className="kp-zeile">
              <Input aria-label={`Verbindung ${i + 1}: Bezeichnung`} value={wert} maxLength={LAENGE.bezeichnung}
                aria-invalid={wert.trim() === "" ? true : undefined}
                onChange={(e) => umbenennen(v.id, e.target.value)}
                onBlur={() => setEntwurf((e) => { const { [v.id]: _weg, ...rest } = e; return rest; })} />
              <Select aria-label={`Verbindung ${i + 1}: Art`} value={v.art} options={ARTEN}
                onChange={(a: VerbindungsArt) => aendere((p) => aendereVerbindung(p, v.id, { art: a }))} />
              <Button aria-label={`Verbindung ${i + 1} (${v.bezeichnung}) löschen`} disabled={!reserve} title={reserve ? undefined : "Wird noch benutzt"}
                onClick={() => setFehler(aendere((p) => loescheVerbindung(p, v.id)))}>Löschen</Button>
            </div>
            <p className="kp-hilfe">{reserve ? <span className="kp-chip">Reserve</span> : nutzungText(n)}</p>
            {wert.trim() === "" ? <p className="kp-feldfehler">Die Verbindung braucht eine Bezeichnung.</p> : null}
          </div>
        );
      })}
      <div className="kp-zeile">
        <Input aria-label="Bezeichnung der neuen Verbindung" value={bezeichnung} maxLength={LAENGE.bezeichnung} onChange={(e) => setBezeichnung(e.target.value)} placeholder="z. B. K_UE_2" />
        <Select aria-label="Art der neuen Verbindung" value={art} onChange={(a: VerbindungsArt) => setArt(a)} options={ARTEN} />
        <Button onClick={anlegen} disabled={bezeichnung.trim() === ""}>Verbindung anlegen</Button>
      </div>
      {fehler ? <p className="kp-feldfehler" role="status">{fehler}</p> : null}
    </fieldset>
  );
}
```

Das `as Planangaben` beim Senden ist nötig, weil `anlass` hier eine Zeichenkette ist (der Server macht aus leer `null`, `angabenSchema`); falls `pnpm lint` den unbenutzten Namen `_weg` meldet, stattdessen `const rest = { ...e }; delete rest[v.id]; return rest;`.

In `K/_ui/kommplan.css` anhängen:

```css
.kp-schalter { display: flex; align-items: center; gap: 8px; min-height: 44px; }
.kp-verbindung { display: grid; gap: 4px; padding-bottom: 8px; border-bottom: 1px dashed var(--kp-rand); }
```

- [ ] **Step 4: Grün sehen**

Run: `pnpm vitest run src/app/m/kommplan && pnpm typecheck; echo "typecheck exit $?"`
Expected: PASS, exit 0.

- [ ] **Step 5: Commit**

```bash
git add src/app/m/kommplan/_ui/editor/PlanFlyin.tsx src/app/m/kommplan/_ui/editor/PlanFlyin.test.tsx src/app/m/kommplan/_ui/kommplan.css
git commit -S -m "feat(kommplan): Planangaben, Optionen und Verbindungen des Plans im Flyin

Angaben werden mit „Übernehmen“ gespeichert, Optionen und Verbindungen
wirken sofort; gelöscht wird nur, was weder Weg noch Kanal ist.

DRK-500

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 14: Editor-Insel — Route, Kopfleiste, Auswahl, Griffe, Tastatur, Speichern, Drucken

**Files:**
- Create: `K/_ui/editor/Editor.tsx`, `K/_ui/editor/Kopfleiste.tsx`, `K/_ui/editor/Griffe.tsx`
- Modify: `K/(intern)/p/[id]/page.tsx`, `K/_ui/kommplan.css`
- Test: `K/_ui/editor/Editor.test.tsx`, `K/_ui/editor/Kopfleiste.test.ts`

**Interfaces:**
- Consumes: alles aus Tasks 2–13, dazu `speichereInhaltAction`, `speichereAngabenAction`, `ladeZeichenAction` (direkt importiert, Falle 9), `darfKommplanBearbeiten`, `zeichenIndex`, `symboleFuer`, `Seitenkopf`, `zeitFormat`, `kalendertag` (`_lib/rahmen.ts`).
- Produces:
  - `interface EditorPlan { id: string; version: number; angaben: Planangaben; inhalt: PlanInhalt; aktualisiertAm: number; aktualisiertVon: string }`
  - `Editor({ plan, symbole, zeichenIndex, schrift }: { plan: EditorPlan; symbole: Symbolsatz; zeichenIndex: ZeichenIndexEintrag[]; schrift: string })`
  - `Kopfleiste(props)`, `statusText(z: SpeicherZustand): string`
  - `Griffe({ karte, ansicht, seitenstelle, onUnterstelle, onSeitenstelle, onEinheit, onBearbeiten })`
  - Route `/p/[id]`: Editor für `darfKommplanBearbeiten(viewer.groups)` bei lesbarem Inhalt, sonst Betrachter wie bisher.

- [ ] **Step 1: Failing tests**

`K/_ui/editor/Kopfleiste.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { statusText } from "./Kopfleiste";

const basis = { version: 1, konflikt: null, zuletztGespeichert: null, fehler: null };

describe("Speicherstatus (Spec §6.2)", () => {
  it("benennt jeden Zustand in Worten, nie nur über Farbe", () => {
    expect(statusText({ ...basis, status: "gespeichert" })).toBe("Alle Änderungen gespeichert");
    expect(statusText({ ...basis, status: "gespeichert", zuletztGespeichert: Date.UTC(2026, 8, 30, 9, 5) })).toBe("Gespeichert um 11:05");
    expect(statusText({ ...basis, status: "ungespeichert" })).toBe("Änderungen noch nicht gespeichert");
    expect(statusText({ ...basis, status: "speichert" })).toBe("Speichert …");
    expect(statusText({ ...basis, status: "fehler", fehler: "Nicht gespeichert — prüfe die Verbindung und ob du noch angemeldet bist." }))
      .toBe("Nicht gespeichert — prüfe die Verbindung und ob du noch angemeldet bist.");
    expect(statusText({ ...basis, status: "konflikt" })).toBe("Nicht gespeichert — Konflikt");
  });
});
```

`K/_ui/editor/Editor.test.tsx`:

```tsx
// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { clickElement, exists, existsPortal, mount, query, queryAll, queryPortal, unmount } from "@/app/m/qr/_lib/test-dom";

const aktionen = vi.hoisted(() => ({ speichereInhaltAction: vi.fn(), speichereAngabenAction: vi.fn(), legePlanAnAction: vi.fn() }));
vi.mock("../../_actions/plan", () => aktionen);
const zeichen = vi.hoisted(() => ({ ladeZeichenAction: vi.fn(async () => ({})) }));
vi.mock("../../_actions/zeichen", () => zeichen);
import { baue } from "../../_lib/beispiele/bau";
import { leererPlan } from "../../_lib/plan/operationen";
import type { PlanInhalt } from "../../_lib/plan/schema";
import { Editor, type EditorPlan } from "./Editor";

const INHALT = baue({ stellen: [{ id: "el", titel: "EL" }, { id: "a", titel: "EA 1", eltern: "el" }, { id: "s", titel: "KatSL", eltern: "el", lage: "links" }] });
const plan = (inhalt: PlanInhalt = INHALT): EditorPlan => ({
  id: "p1", version: 1, inhalt, aktualisiertAm: Date.UTC(2026, 8, 30, 8), aktualisiertVon: "Jana",
  angaben: { titel: "Übung", typ: "kommunikationsplan", anlass: null, datum: null },
});
const zeige = (p = plan()) => mount(<Editor plan={p} symbole={{}} zeichenIndex={[]} schrift="Arimo" />);
const karten = () => queryAll("[data-karte]").map((k) => k.getAttribute("data-karte")!);
function zeiger(el: Element, typ: string, zeit: number) {
  const e = new MouseEvent(typ, { bubbles: true, cancelable: true, clientX: 10, clientY: 10 });
  Object.defineProperty(e, "pointerId", { value: 1 });
  Object.defineProperty(e, "timeStamp", { value: zeit });
  el.dispatchEvent(e);
}
let uhr = 0;
async function waehle(id: string) {
  uhr += 10_000; // weit auseinander: kein Doppelklick
  await act(async () => { const k = query(`[data-karte="${id}"] rect`); zeiger(k, "pointerdown", uhr); zeiger(k, "pointerup", uhr + 10); });
}
async function taste(key: string, mehr: KeyboardEventInit = {}, ziel?: Element) {
  await act(async () => { (ziel ?? query(".kp-betrachter")).dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true, ...mehr })); });
}
const knopf = (text: string) => [...document.querySelectorAll<HTMLButtonElement>("button")].find((b) => b.textContent === text)!;

beforeEach(() => {
  aktionen.speichereInhaltAction.mockImplementation(async (e: { version: number }) => ({ ok: true, version: e.version + 1, aktualisiertAm: Date.UTC(2026, 8, 30, 9) }));
});
afterEach(async () => { await unmount(); vi.useRealTimers(); vi.clearAllMocks(); vi.restoreAllMocks(); });

describe("Editor (Spec §6.2, §6.3)", () => {
  it("Klick wählt eine Karte und zeigt ihre Griffe; eine Seitenstelle hat nur „+ Einheit“ und „Bearbeiten“", async () => {
    await zeige();
    await waehle("a");
    expect(queryAll('[data-griffe="a"] [data-griff]').map((g) => g.getAttribute("data-griff"))).toEqual(["links", "rechts", "unter", "einheit", "bearbeiten"]);
    await waehle("s");
    expect(queryAll('[data-griffe="s"] [data-griff]').map((g) => g.getAttribute("data-griff"))).toEqual(["einheit", "bearbeiten"]);
  });
  it("„+ Unterstelle“: sofort gesetzt, ausgewählt, Flyin offen mit leerem Titel", async () => {
    await zeige();
    await waehle("a");
    await clickElement(query('[data-griff="unter"]'));
    const neu = karten().find((k) => !["el", "a", "s"].includes(k))!;
    expect(neu).toBeDefined();
    expect(exists(`[data-griffe="${neu}"]`)).toBe(true);
    expect(existsPortal(`[data-flyin-stelle="${neu}"]`)).toBe(true);
    expect(queryPortal<HTMLInputElement>('input[name="titel"]').value).toBe("");
  });
  it("Tastatur: ↓ wandert, N legt an, Entf löscht mit Rückgängig statt Nachfrage", async () => {
    await zeige();
    await waehle("el");
    await taste("ArrowDown");
    expect(exists('[data-griffe="a"]')).toBe(true);
    await taste("n");
    expect(karten()).toHaveLength(4);
    await taste("Delete");
    expect(karten()).toHaveLength(3);
    expect(document.body.textContent).toContain("„(ohne Titel)“ gelöscht.");
    await clickElement(knopf("Rückgängig"));
    expect(karten()).toHaveLength(4);
    await waehle("a");
    await taste("Backspace");
    expect(document.body.textContent).toContain("„EA 1“ gelöscht samt 1 weiterer Stelle.");
  });
  it("N an einer Seitenstelle: Hinweis, keine Änderung", async () => {
    await zeige();
    await waehle("s");
    await taste("n");
    expect(karten()).toHaveLength(3);
    expect(document.body.textContent).toContain("Eine Seitenstelle trägt keine Unterstellen.");
  });
  it("Strg/Cmd+Z und Umschalt+Strg/Cmd+Z außerhalb von Textfeldern; im Titelfeld gehört Strg+Z dem Feld", async () => {
    await zeige();
    await waehle("a");
    await clickElement(query('[data-griff="unter"]'));
    expect(karten()).toHaveLength(4);
    await taste("z", { ctrlKey: true }, document.body);
    expect(karten()).toHaveLength(3);
    await taste("Z", { metaKey: true, shiftKey: true }, document.body);
    expect(karten()).toHaveLength(4);
    await taste("z", { ctrlKey: true }, queryPortal('input[name="titel"]'));
    expect(karten()).toHaveLength(4);
  });
  it("Autosave etwa 1 s nach der letzten Änderung, mit Version; Status in Worten", async () => {
    vi.useFakeTimers();
    await zeige();
    await waehle("a");
    await clickElement(query('[data-griff="unter"]'));
    expect(query(".kp-speicherstatus").textContent).toBe("Änderungen noch nicht gespeichert");
    await act(async () => { await vi.advanceTimersByTimeAsync(999); });
    expect(aktionen.speichereInhaltAction).not.toHaveBeenCalled();
    await act(async () => { await vi.advanceTimersByTimeAsync(1); });
    expect(aktionen.speichereInhaltAction).toHaveBeenCalledWith(expect.objectContaining({ id: "p1", version: 1 }));
    expect(query(".kp-speicherstatus").textContent).toBe("Gespeichert um 11:00");
  });
  it("Konflikt: Hinweis mit „Neu laden“ — danach steht der Serverstand da, Rückgängig ist leer", async () => {
    vi.useFakeTimers();
    const fremd = baue({ stellen: [{ id: "x", titel: "Fremd" }] });
    aktionen.speichereInhaltAction.mockResolvedValue({ ok: false, grund: "konflikt",
      stand: { version: 7, inhalt: fremd, angaben: plan().angaben, aktualisiertAm: Date.UTC(2026, 8, 30, 9), aktualisiertVon: "Ole" } });
    await zeige();
    await waehle("a");
    await clickElement(query('[data-griff="unter"]'));
    await act(async () => { await vi.advanceTimersByTimeAsync(1000); });
    expect(document.body.textContent).toContain("Jemand anderes hat diesen Plan inzwischen geändert.");
    expect(document.body.textContent).toContain("von Ole");
    await clickElement(knopf("Neu laden"));
    expect(karten()).toEqual(["x"]);
    expect(knopf("Rückgängig").disabled).toBe(true);
  });
  it("Konflikt: „Meine Fassung behalten“ sendet mit der Serverversion", async () => {
    vi.useFakeTimers();
    aktionen.speichereInhaltAction
      .mockResolvedValueOnce({ ok: false, grund: "konflikt", stand: { version: 7, inhalt: INHALT, angaben: plan().angaben, aktualisiertAm: 0, aktualisiertVon: "Ole" } })
      .mockResolvedValueOnce({ ok: true, version: 8, aktualisiertAm: 0 });
    await zeige();
    await waehle("a");
    await clickElement(query('[data-griff="unter"]'));
    await act(async () => { await vi.advanceTimersByTimeAsync(1000); });
    await clickElement(knopf("Meine Fassung behalten"));
    await act(async () => {});
    expect(aktionen.speichereInhaltAction).toHaveBeenLastCalledWith(expect.objectContaining({ version: 7 }));
    expect(document.body.textContent).not.toContain("Jemand anderes hat diesen Plan inzwischen geändert.");
  });
  it("leerer Plan: kein Absturz, „Erste Stelle anlegen“ führt in den Normalfall (Review Focus 1)", async () => {
    await zeige(plan(leererPlan()));
    expect(document.body.textContent).toContain("Dieser Plan hat noch keine Stellen.");
    expect(queryAll("[data-griff]")).toHaveLength(0);
    await taste("ArrowRight");
    await clickElement(knopf("Erste Stelle anlegen"));
    expect(karten()).toHaveLength(1);
    expect(existsPortal("[data-flyin-stelle]")).toBe(true);
  });
  it("Drucken öffnet das Fenster sofort und setzt die Druckroute erst nach dem Speichern", async () => {
    const fenster = { location: { href: "" }, close: vi.fn() };
    vi.spyOn(window, "open").mockReturnValue(fenster as unknown as Window);
    await zeige();
    await waehle("a");
    await clickElement(query('[data-griff="unter"]'));
    await clickElement(knopf("Drucken"));
    // mehrere Mikroaufgaben (Warteschlange, Action, Auswertung): eine echte Runde der Ereignisschleife abwarten
    await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
    expect(window.open).toHaveBeenCalledWith("", "_blank");
    expect(aktionen.speichereInhaltAction).toHaveBeenCalledTimes(1);
    expect(fenster.location.href).toBe("/p/p1/druck/a4");
  });
});
```


- [ ] **Step 2: Rot sehen**

Run: `pnpm vitest run src/app/m/kommplan/_ui/editor/Editor.test.tsx src/app/m/kommplan/_ui/editor/Kopfleiste.test.ts`
Expected: FAIL — Module fehlen.

- [ ] **Step 3: Kopfleiste und Griffe**

`K/_ui/editor/Kopfleiste.tsx`:

```tsx
"use client";

import { Alert, Button, Segmented } from "antd";
import { Seitenkopf } from "@/core/shell/Seitenkopf";
import { zeitFormat } from "@/core/zeit";
import { TYP_NAME, tagZuMs, type Planangaben } from "../../_lib/angaben";
import { kalendertag } from "../../_lib/rahmen";
import type { SpeicherZustand } from "./speicherer";

// zeitFormat löst die Zone erst beim Formatieren auf — auf Modulebene erlaubt (CLAUDE.md, „Zeitzone").
const UHR = zeitFormat("de-DE", { hour: "2-digit", minute: "2-digit" });
const STAND = zeitFormat("de-DE", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });

/** Der Speicherstatus in Worten (docs/design/README.md: Bedeutung nie allein über Farbe). */
export function statusText(z: SpeicherZustand): string {
  switch (z.status) {
    case "gespeichert": return z.zuletztGespeichert === null ? "Alle Änderungen gespeichert" : `Gespeichert um ${UHR.format(z.zuletztGespeichert)}`;
    case "ungespeichert": return "Änderungen noch nicht gespeichert";
    case "speichert": return "Speichert …";
    case "fehler": return z.fehler ?? "Nicht gespeichert";
    case "konflikt": return "Nicht gespeichert — Konflikt";
  }
}

/**
 * KOPFLEISTE (Spec §6.2): Titel, Umschalter Diagramm | Gliederung (die Gliederung folgt mit Phase 3
 * und ist bis dahin deaktiviert, Entscheidung 13), Rückgängig/Wiederholen, Planangaben, Drucken,
 * Speicherstatus (`aria-live` genau hier, docs/design/feedback-admin.md 4.14). `Seitenkopf` trägt
 * weder eine Client-Direktive noch Server-Abhängigkeiten und darf deshalb auch hier rendern.
 */
export function Kopfleiste({ angaben, zustand, standSeit, kannRueck, kannWieder, onRueck, onWieder, onPlan, onDrucken, onNeuLaden, onBehalten, onErneut }: {
  angaben: Planangaben; zustand: SpeicherZustand; standSeit: number; kannRueck: boolean; kannWieder: boolean;
  onRueck: () => void; onWieder: () => void; onPlan: () => void; onDrucken: () => void;
  onNeuLaden: () => void; onBehalten: () => void; onErneut: () => void;
}) {
  const stand = zustand.zuletztGespeichert ?? standSeit;
  const beschreibung = [TYP_NAME[angaben.typ], angaben.anlass, angaben.datum ? kalendertag(tagZuMs(angaben.datum)) : null, `Stand ${STAND.format(stand)}`]
    .filter(Boolean).join(" · ");
  return (
    <>
      <Seitenkopf titel={angaben.titel} zurueck={{ titel: "Alle Pläne", href: "/" }} beschreibung={beschreibung}
        aktionen={
          <div className="kp-kopfwerkzeuge" role="toolbar" aria-label="Plan bearbeiten">
            <Segmented aria-label="Ansicht" value="diagramm"
              options={[{ value: "diagramm", label: "Diagramm" }, { value: "gliederung", label: "Gliederung", disabled: true }]} />
            <Button onClick={onRueck} disabled={!kannRueck}>Rückgängig</Button>
            <Button onClick={onWieder} disabled={!kannWieder}>Wiederholen</Button>
            <Button onClick={onPlan}>Planangaben</Button>
            <Button onClick={onDrucken}>Drucken</Button>
            <span className="kp-speicherstatus" role="status" aria-live="polite" data-status={zustand.status}>{statusText(zustand)}</span>
            {zustand.status === "fehler" ? <Button onClick={onErneut}>Erneut versuchen</Button> : null}
          </div>
        } />
      {zustand.konflikt ? (
        <Alert type="warning" showIcon className="kp-hinweis" message="Jemand anderes hat diesen Plan inzwischen geändert."
          description={`Gespeichert um ${UHR.format(zustand.konflikt.aktualisiertAm)} von ${zustand.konflikt.aktualisiertVon}. Deine letzten Änderungen sind noch nicht gespeichert.`}
          action={<div className="kp-formular-knoepfe"><Button onClick={onNeuLaden}>Neu laden</Button><Button type="primary" onClick={onBehalten}>Meine Fassung behalten</Button></div>} />
      ) : null}
    </>
  );
}
```

`K/_ui/editor/Griffe.tsx`:

```tsx
"use client";

import { Button } from "antd";
import type { KarteL } from "../../_lib/layout/typen";
import type { Ansicht } from "../betrachter/ansicht";

/**
 * GRIFFE DER AUSWAHL (Spec §6.3, Entscheidung 5): eine HTML-Überlagerung in Pixeln über dem SVG —
 * die Knöpfe behalten bei jedem Zoom ihre 44 px und sind echte Buttons mit Namen. Seitlich „+"
 * (Seitenstelle links/rechts), unten „+ Unterstelle", „+ Einheit", „Bearbeiten". Eine Seitenstelle
 * trägt nichts (§4.2): dort nur „+ Einheit" und „Bearbeiten".
 */
export function Griffe({ karte, ansicht, seitenstelle, onUnterstelle, onSeitenstelle, onEinheit, onBearbeiten }: {
  karte: KarteL; ansicht: Ansicht; seitenstelle: boolean;
  onUnterstelle: () => void; onSeitenstelle: (seite: "links" | "rechts") => void; onEinheit: () => void; onBearbeiten: () => void;
}) {
  const m = ansicht.massstab;
  const titel = karte.titelVoll === "" ? "(ohne Titel)" : karte.titelVoll;
  return (
    <div className="kp-griffe" data-griffe={karte.id}
      style={{ left: ansicht.x + karte.x * m, top: ansicht.y + karte.y * m, width: karte.breite * m, height: karte.hoehe * m }}>
      <div className="kp-auswahlrahmen" aria-hidden="true" />
      {seitenstelle ? null : (
        <>
          <Button data-griff="links" className="kp-griff-seite kp-griff-links" aria-label={`Seitenstelle links von ${titel} anlegen`} onClick={() => onSeitenstelle("links")}>+</Button>
          <Button data-griff="rechts" className="kp-griff-seite kp-griff-rechts" aria-label={`Seitenstelle rechts von ${titel} anlegen`} onClick={() => onSeitenstelle("rechts")}>+</Button>
        </>
      )}
      <div className="kp-griffleiste" role="toolbar" aria-label={`Auswahl: ${titel}`}>
        {seitenstelle ? null : <Button data-griff="unter" onClick={onUnterstelle}>+ Unterstelle</Button>}
        <Button data-griff="einheit" onClick={onEinheit}>+ Einheit</Button>
        <Button data-griff="bearbeiten" onClick={onBearbeiten}>Bearbeiten</Button>
      </div>
    </div>
  );
}
```

In `K/_ui/kommplan.css` anhängen:

```css
/*
 * Editor: Griffe über der Fläche. `.kp-griffe .kp-griff-seite` mit einer Klasse mehr, weil antds
 * `.ant-btn` (gleiche Spezifität, später geladen) `position: relative` setzt (Falle 5); keine Regel
 * gegen einen `.ant-*`-Namen (Falle 20).
 */
.kp-griffe { position: absolute; }
.kp-griffe button { pointer-events: auto; }
.kp-auswahlrahmen { position: absolute; inset: -4px; border: 2px solid var(--kp-auswahl); border-radius: 4px; pointer-events: none; }
.kp-griffe .kp-griff-seite { position: absolute; top: 50%; transform: translateY(-50%); }
.kp-griffe .kp-griff-links { right: calc(100% + 8px); }
.kp-griffe .kp-griff-rechts { left: calc(100% + 8px); }
.kp-griffleiste { position: absolute; top: calc(100% + 8px); left: 50%; transform: translateX(-50%); display: flex; gap: 8px; white-space: nowrap; }
.kp-leer { padding: 16px; display: grid; gap: 12px; justify-items: start; }
.kp-hinweis { margin-block-end: 8px; }
.kp-kopfwerkzeuge { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
.kp-speicherstatus { font-size: 13px; color: var(--kp-gedaempft); }
@media (max-width: 767.98px) { .kp-kopfwerkzeuge > * { flex: 1 1 auto; } }
```

- [ ] **Step 4: Die Editor-Insel**

`K/_ui/editor/Editor.tsx`:

```tsx
"use client";

import { useDeferredValue, useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { Alert, Button, type InputRef } from "antd";
import { speichereAngabenAction, speichereInhaltAction } from "../../_actions/plan";
import { ladeZeichenAction } from "../../_actions/zeichen";
import { angabenSchema, type Planangaben } from "../../_lib/angaben";
import type { SpeicherErgebnis } from "../../_lib/ergebnis";
import { layout } from "../../_lib/layout/layout";
import { baueSicht } from "../../_lib/layout/sicht";
import { legende } from "../../_lib/layout/zeichne";
import { fuegeEinheitenEin } from "../../_lib/plan/einheiten";
import { PlanFehler, fuegeSeitenstelleEin, fuegeUnterstelleEin, fuegeWurzelEin, loescheStelle } from "../../_lib/plan/operationen";
import type { PlanInhalt } from "../../_lib/plan/schema";
import type { ZeichenIndexEintrag } from "../../_lib/zeichen/grundlagen";
import { Flaeche, type FlaecheGriff } from "../betrachter/Flaeche";
import { Legende } from "../betrachter/Legende";
import { Umschalter } from "../betrachter/Umschalter";
import type { Symbolsatz } from "../zeichnung/Symbole";
import type { Aendere } from "./aendere";
import { Griffe } from "./Griffe";
import { neueId } from "./ids";
import { Kopfleiste } from "./Kopfleiste";
import { wandere } from "./navigation";
import { PlanFlyin } from "./PlanFlyin";
import { Speicherer, type SpeicherZustand } from "./speicherer";
import { StelleFlyin } from "./StelleFlyin";
import { flaechenBefehl, globalerBefehl, istTextfeld } from "./tasten";
import { kannRueckgaengig, kannWiederholen, neuerVerlauf, rueckgaengig, tue, wiederholen, type Verlauf } from "./verlauf";
import { leseZuletzt } from "./zuletzt";

export interface EditorPlan { id: string; version: number; angaben: Planangaben; inhalt: PlanInhalt; aktualisiertAm: number; aktualisiertVon: string }
interface Hinweis { text: string; rueckgaengig?: boolean }
const BEDIENHINWEIS = "Pfeiltasten wählen Stellen, Enter bearbeitet, N legt eine Unterstelle an, Entf löscht, Plus und Minus zoomen";
/** Luft um eine neu gezeigte Karte: Griffleiste 8 + 44 px darunter, seitliche „+" 8 + 44 px daneben, dazu 12 px. */
const GRIFF_RAND = 64;

/**
 * DER DIAGRAMM-EDITOR (Spec §6.2–6.4, §6.6). Die Insel ist bis zum Neuladen die Quelle der Wahrheit:
 * aus den Props einmal gesät, über `key={plan.id}` an den Plan gebunden, kein `revalidatePath`.
 *
 * - Jede Änderung ist eine reine Operation (`aendere`); `PlanFehler` wird ein Hinweis, kein Absturz.
 * - Rückgängig ist ein Stapel von Dokumenten (`verlauf.ts`); gespeichert wird über `speicherer.ts`,
 *   aufgerufen aus den Ereignis-Rückrufen, nie aus einem Effekt (`set-state-in-effect`).
 * - Das Layout rechnet aus `useDeferredValue` — Tippen bleibt auch an großen Plänen flüssig (Entscheidung 15).
 * - Linien blenden nur nach STRUKTURELLEN Änderungen neu ein (`linien`), nicht bei jedem Tastendruck.
 */
export function Editor({ plan, symbole: symboleStart, zeichenIndex, schrift }: {
  plan: EditorPlan; symbole: Symbolsatz; zeichenIndex: ZeichenIndexEintrag[]; schrift: string;
}) {
  const [verlauf, setVerlauf] = useState<Verlauf>(() => neuerVerlauf(plan.inhalt));
  const [angaben, setAngaben] = useState(plan.angaben);
  const [auswahl, setAuswahl] = useState<string | null>(null);
  const [flyin, setFlyin] = useState<"stelle" | "plan" | null>(null);
  const [fokus, setFokus] = useState<{ ziel: "titel" | "einheit"; n: number }>({ ziel: "titel", n: 0 });
  const [eingeklappt, setEingeklappt] = useState<ReadonlySet<string>>(() => new Set());
  const [hinweis, setHinweis] = useState<Hinweis | null>(null);
  const [symbole, setSymbole] = useState<Symbolsatz>(symboleStart);
  const [linien, setLinien] = useState(0);
  const [speicherZustand, setSpeicherZustand] = useState<SpeicherZustand>({ status: "gespeichert", version: plan.version, konflikt: null, zuletztGespeichert: null, fehler: null });
  const [speicherer] = useState(() => new Speicherer({
    planId: plan.id, version: plan.version, inhalt: plan.inhalt,
    senden: { inhalt: speichereInhaltAction, angaben: speichereAngabenAction }, melde: setSpeicherZustand,
  }));
  const flaeche = useRef<FlaecheGriff>(null);
  const titelRef = useRef<InputRef>(null);
  const zeigeNach = useRef<string | null>(null);
  const kuerzel = useRef({ rueck: () => {}, wieder: () => {} });
  /** Schlüssel, deren SVG schon unterwegs ist: Server Actions laufen nacheinander, eine Suchsalve stellte sich sonst vor das Autosave. */
  const unterwegs = useRef(new Set<string>());

  const inhalt = verlauf.jetzt;
  const zeichenStand = useDeferredValue(inhalt);
  const daten = useMemo(() => layout(zeichenStand, "bildschirm", { eingeklappt }), [zeichenStand, eingeklappt]);
  const eintraege = useMemo(() => legende(inhalt, baueSicht(inhalt)), [inhalt]);
  const gewaehlt = auswahl !== null && inhalt.stellen.some((s) => s.id === auswahl) ? auswahl : null;
  const stelle = gewaehlt === null ? undefined : inhalt.stellen.find((s) => s.id === gewaehlt);
  const auswahlKarte = gewaehlt === null ? undefined : daten.karten.find((k) => k.id === gewaehlt);

  function uebernimm(neu: Verlauf, strukturell: boolean) {
    if (neu === verlauf) return;
    flaeche.current?.halte();
    setVerlauf(neu);
    speicherer.aendere(neu.jetzt);
    if (strukturell) setLinien((n) => n + 1);
  }
  const aendere: Aendere = (op, schluessel) => {
    let neu: PlanInhalt;
    try { neu = op(verlauf.jetzt); } catch (e) {
      if (e instanceof PlanFehler) { setHinweis({ text: e.message }); return e.message; }
      throw e;
    }
    setHinweis(null);
    uebernimm(tue(verlauf, neu, Date.now(), schluessel), schluessel === undefined);
    return null;
  };

  function ladeSymbole(schluessel: string[]) {
    const fehlen = [...new Set(schluessel)].filter((k) => !symbole[k] && !unterwegs.current.has(k)).slice(0, 40);
    if (fehlen.length === 0) return;
    for (const k of fehlen) unterwegs.current.add(k);
    void ladeZeichenAction(fehlen)
      .then((neu) => setSymbole((alt) => ({ ...alt, ...neu })))
      .catch(() => { /* Vorschau fehlt, Wahl geht trotzdem */ })
      .finally(() => { for (const k of fehlen) unterwegs.current.delete(k); });
  }
  function oeffne(id: string, ziel: "titel" | "einheit" = "titel") {
    setAuswahl(id);
    setFlyin("stelle");
    setFokus((f) => ({ ziel, n: f.n + 1 }));
    ladeSymbole(leseZuletzt());
  }
  function lege(art: "unter" | "links" | "rechts" | "wurzel", eltern: string | null) {
    const id = neueId(inhalt, "s");
    const f = aendere((p) => art === "wurzel" ? fuegeWurzelEin(p, id)
      : art === "unter" ? fuegeUnterstelleEin(p, eltern!, id) : fuegeSeitenstelleEin(p, eltern!, art, id));
    if (f !== null) return;
    zeigeNach.current = id;
    oeffne(id);
  }
  function neueEinheit(stelleId: string) {
    if (aendere((p) => fuegeEinheitenEin(p, stelleId, [{ id: neueId(p, "e"), typ: "", rufname: "", zeichen: null }])) === null) oeffne(stelleId, "einheit");
  }
  function loesche(id: string) {
    const s = inhalt.stellen.find((x) => x.id === id);
    if (!s) return;
    let entfernt = 0;
    if (aendere((p) => { const r = loescheStelle(p, id); entfernt = r.entfernt; return r.inhalt; }) !== null) return;
    setAuswahl(s.eltern);
    setFlyin(null);
    const weitere = entfernt - 1;
    setHinweis({ rueckgaengig: true, text: `„${s.titel.trim() || "(ohne Titel)"}“ gelöscht${weitere > 0 ? ` samt ${weitere} ${weitere === 1 ? "weiterer Stelle" : "weiteren Stellen"}` : ""}.` });
  }
  function rueck() { if (kannRueckgaengig(verlauf)) { uebernimm(rueckgaengig(verlauf), true); setHinweis(null); } }
  function wieder() { if (kannWiederholen(verlauf)) { uebernimm(wiederholen(verlauf), true); setHinweis(null); } }
  useEffect(() => { kuerzel.current = { rueck, wieder }; });

  // Strg/Cmd+Z global, aber nie in einem Textfeld (dort gehört es dem Feld).
  useEffect(() => {
    const beiTaste = (e: globalThis.KeyboardEvent) => {
      const b = globalerBefehl(e, istTextfeld(e.target));
      if (!b) return;
      e.preventDefault();
      if (b.art === "rueckgaengig") kuerzel.current.rueck(); else kuerzel.current.wieder();
    };
    document.addEventListener("keydown", beiTaste);
    return () => document.removeEventListener("keydown", beiTaste);
  }, []);

  // Ungespeichertes hält das Schließen auf (Entscheidung 11).
  useEffect(() => {
    const warne = (e: BeforeUnloadEvent) => { if (speicherer.hatUngespeichertes()) e.preventDefault(); };
    window.addEventListener("beforeunload", warne);
    return () => window.removeEventListener("beforeunload", warne);
  }, [speicherer]);

  // Neue oder per Pfeil gewählte Karte in den sichtbaren Bereich holen, sobald das Layout sie kennt.
  useEffect(() => {
    const id = zeigeNach.current;
    if (id === null) return;
    const k = daten.karten.find((x) => x.id === id);
    if (k) { zeigeNach.current = null; flaeche.current?.zeige(k, GRIFF_RAND); }
  }, [daten, gewaehlt]);

  function taste(e: KeyboardEvent<HTMLDivElement>): boolean {
    const b = flaechenBefehl(e);
    if (!b) return false;
    e.preventDefault();
    if (b.art === "wandere") {
      const z = wandere(inhalt, eingeklappt, gewaehlt, b.richtung);
      if (z !== null) { setAuswahl(z); zeigeNach.current = z; }
    } else if (b.art === "oeffnen") { if (gewaehlt) oeffne(gewaehlt); }
    else if (b.art === "neueUnterstelle") {
      if (stelle && stelle.lage !== "unter") setHinweis({ text: "Eine Seitenstelle trägt keine Unterstellen." });
      else if (stelle) lege("unter", stelle.id);
    } else if (b.art === "loeschen") { if (gewaehlt) loesche(gewaehlt); }
    else if (b.art === "abwaehlen") { setAuswahl(null); setFlyin(null); }
    return true;
  }
  function klick(id: string | null, doppelt: boolean) {
    if (id === null) { setAuswahl(null); return; }
    if (doppelt || (id === gewaehlt && flyin === null)) oeffne(id); else setAuswahl(id);
  }
  function neuLaden() {
    const k = speicherZustand.konflikt;
    if (!k) return;
    if (k.inhalt === null) { window.location.reload(); return; }
    speicherer.uebernimm(k);
    setVerlauf(neuerVerlauf(k.inhalt));
    setAngaben(k.angaben);
    setAuswahl(null); setFlyin(null); setHinweis(null);
    setLinien((n) => n + 1);
  }
  async function speichereAngaben(a: Planangaben): Promise<SpeicherErgebnis> {
    const r = await speicherer.angaben(a);
    if (r.ok) setAngaben(angabenSchema.parse(a));
    return r;
  }
  async function drucken() {
    const ziel = `/p/${plan.id}/druck/a4`;
    const fenster = window.open("", "_blank"); // synchron im Klick, sonst greift der Popup-Blocker (Entscheidung 12)
    if (!(await speicherer.jetzt())) {
      fenster?.close();
      setHinweis({ text: "Vor dem Drucken ließ sich nicht speichern. Gedruckt wird immer der gespeicherte Stand — kläre erst den Hinweis oben." });
      return;
    }
    if (fenster) fenster.location.href = ziel; else window.location.assign(ziel);
  }
  const umschalten = (id: string) => setEingeklappt((s) => {
    const neu = new Set(s);
    if (neu.has(id)) neu.delete(id); else neu.add(id);
    return neu;
  });

  return (
    <div className="kp-editor">
      <Kopfleiste angaben={angaben} zustand={speicherZustand} standSeit={plan.aktualisiertAm}
        kannRueck={kannRueckgaengig(verlauf)} kannWieder={kannWiederholen(verlauf)} onRueck={rueck} onWieder={wieder}
        onPlan={() => setFlyin("plan")} onDrucken={() => void drucken()}
        onNeuLaden={neuLaden} onBehalten={() => void speicherer.behalteMeine()} onErneut={() => void speicherer.erneut()} />
      {hinweis ? (
        <Alert type="warning" showIcon closable onClose={() => setHinweis(null)} className="kp-hinweis" message={hinweis.text}
          action={hinweis.rueckgaengig ? <Button onClick={rueck}>Rückgängig</Button> : undefined} />
      ) : null}
      <Flaeche daten={daten} symbole={symbole} titel={angaben.titel} schrift={schrift} bedienhinweis={BEDIENHINWEIS}
        griff={flaeche} gleitend linienSchluessel={String(linien)}
        zusatz={(k) => <Umschalter k={k} onUmschalten={umschalten} />}
        onKarteKlick={klick} onTaste={taste}
        ueberlagerung={(a) => (auswahlKarte && stelle ? (
          <Griffe karte={auswahlKarte} ansicht={a} seitenstelle={stelle.lage !== "unter"}
            onUnterstelle={() => lege("unter", stelle.id)} onSeitenstelle={(seite) => lege(seite, stelle.id)}
            onEinheit={() => neueEinheit(stelle.id)} onBearbeiten={() => oeffne(stelle.id)} />
        ) : null)}
        leer={<div className="kp-leer"><p>Dieser Plan hat noch keine Stellen.</p><Button type="primary" onClick={() => lege("wurzel", null)}>Erste Stelle anlegen</Button></div>}
        werkzeuge={eingeklappt.size > 0 ? <Button onClick={() => setEingeklappt(new Set())}>Alle ausklappen</Button> : null} />
      <Legende eintraege={eintraege} />
      {gewaehlt !== null ? (
        <StelleFlyin offen={flyin === "stelle"} onSchliessen={() => setFlyin(null)} inhalt={inhalt} stelleId={gewaehlt} aendere={aendere}
          symbole={symbole} zeichenIndex={zeichenIndex} ladeSymbole={ladeSymbole} fokus={fokus} titelRef={titelRef}
          onLoeschen={() => loesche(gewaehlt)} />
      ) : null}
      <PlanFlyin offen={flyin === "plan"} onSchliessen={() => setFlyin(null)} angaben={angaben} inhalt={inhalt} aendere={aendere} speichereAngaben={speichereAngaben} />
    </div>
  );
}
```

Hinweise für die Umsetzung:
- Meldet `pnpm lint` (React Compiler) `let entfernt` in `loesche` als Mutation einer eingefangenen Variable, stattdessen `const r = { entfernt: 0 };` und `r.entfernt = …` schreiben.
- `flyin === "plan"`: das Plan-Flyin schließt ein offenes Stellen-Flyin (ein Wert, zwei Flyins nie zugleich).
- Das Flyin schließt nicht, wenn eine andere Karte gewählt wird: es zeigt dann diese Stelle (Spec §6.2 „bearbeitet wird im Flyin rechts").

- [ ] **Step 5: Die Weiche auf der Planseite**

`K/(intern)/p/[id]/page.tsx`:

```tsx
import { headers } from "next/headers";
import Link from "next/link";
import { Card } from "antd";
import { Seitenkopf } from "@/core/shell/Seitenkopf";
import { getDb } from "@/app/m/kommplan/_db/client";
import { requireKommplanHost } from "@/app/m/kommplan/_lib/host";
import { beschreibungFuer, ladePlanOder404 } from "@/app/m/kommplan/_lib/plaene";
import { symboleFuer, zeichenIndex } from "@/app/m/kommplan/_lib/zeichen/zeichen";
import { darfKommplanBearbeiten, requireKommplanZugang } from "@/app/m/kommplan/_lib/zugang";
import { Betrachter } from "@/app/m/kommplan/_ui/betrachter/Betrachter";
import { Editor } from "@/app/m/kommplan/_ui/editor/Editor";
import { Huelle } from "@/app/m/kommplan/_ui/Huelle";
import { ARIMO } from "@/app/m/kommplan/_ui/schrift";

export const dynamic = "force-dynamic";

/**
 * Editor für Bearbeitende (`isModuleAdmin`), Betrachter für die Zugangsgruppe (Spec §6.1) —
 * dasselbe Prädikat, das jede Server Action des Editors prüft. `key={plan.id}`: der Editor sät
 * seinen Zustand einmal aus den Props (Entscheidungen des Phase-2-Plans, Global Constraints).
 */
export default async function PlanAnsicht({ params }: { params: Promise<{ id: string }> }) {
  requireKommplanHost(await headers());
  const viewer = await requireKommplanZugang();
  const { id } = await params;
  const plan = ladePlanOder404(getDb(), id);
  if (plan.inhalt && darfKommplanBearbeiten(viewer.groups)) {
    return (
      <Huelle>
        <div className={ARIMO.className}>
          <Editor key={plan.id} symbole={symboleFuer(plan.inhalt)} zeichenIndex={zeichenIndex()} schrift={ARIMO.style.fontFamily}
            plan={{ id: plan.id, version: plan.version, angaben: plan.angaben, inhalt: plan.inhalt, aktualisiertAm: plan.aktualisiertAm, aktualisiertVon: plan.aktualisiertVon }} />
        </div>
      </Huelle>
    );
  }
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
        <Card>Dieser Plan lässt sich nicht lesen: der gespeicherte Inhalt ist beschädigt. Ansehen, Bearbeiten und Drucken gehen erst wieder, wenn die Daten repariert sind.</Card>
      )}
    </Huelle>
  );
}
```

(Der alte Satz „Die Bearbeitung kommt in einer späteren Ausbaustufe; bis dahin hilft der Betrieb." ist damit weg.)

- [ ] **Step 6: Grün sehen**

Run: `pnpm vitest run src/app/m/kommplan && pnpm typecheck; echo "typecheck exit $?"`
Expected: PASS, exit 0.

Run: `pnpm lint`
Expected: keine Befunde (insbesondere `react-hooks/set-state-in-effect`, React Compiler, unbenutzte Importe).

Run: `pnpm build`
Expected: grün. Der Build prüft die RSC-Grenze (Editor ist `"use client"`, die Seite reicht nur serialisierbare Props: Zahlen, Zeichenketten, das Dokument, der Index) und die `"use server"`-Dateien.

- [ ] **Step 7: Ankerschritt und Commit**

Ankerschritt für `(intern)/p/[id]/page.tsx` und `kommplan.css`.

```bash
git add src/app/m/kommplan/_ui/editor "src/app/m/kommplan/(intern)/p/[id]/page.tsx" src/app/m/kommplan/_ui/kommplan.css
git commit -S -m "feat(kommplan): Diagramm-Editor mit Griffen, Tastatur, Autosave und Konflikthinweis

Bearbeitende bekommen auf der Planseite den Editor, die Zugangsgruppe
weiter den Betrachter. Neue Stellen stehen sofort da, sind gewählt und
haben den Fokus im Titel; Entf löscht mit Rückgängig statt Nachfrage;
Drucken speichert vorher.

DRK-500

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 15: End-to-End — Anlegen, Bearbeiten, Tastatur, Konflikt, Gleiten, Drucken, Zugang

**Files:**
- Create: `e2e/kommplan-editor.spec.ts`
- Modify: `e2e/gruppen.json` (Eimer `eimer-2`)

**Interfaces:**
- Consumes: `devLogin`, `E2E_PORT`, `klickeWennRuhig`, `warteAufSpaltenaufteilung`, `warteAufGestreamteInhalte` (`e2e/fixtures.ts`); die Selektoren und Namen aus Tasks 7–14.
- Produces: nichts für spätere Aufgaben außer der Datei, die Task 16 um die Bildschirmfotos ergänzt.

**Kein Test verändert einen Plan aus dem Seed** (`e2e/kommplan.spec.ts` zählt Karten des Beispiels „Einsatz 22.02.2026"; die Datenbank teilen alle Dateien eines Eimers, docs/design/README.md „Ein e2e-Test darf seinen Zustand nicht vom Seed erben"). Jeder bearbeitende Test legt seinen Plan über „Neu" selbst an.

- [ ] **Step 1: Die Spec schreiben**

`e2e/kommplan-editor.spec.ts`:

```ts
import { expect, test, type Page, type Response } from "@playwright/test";
import { devLogin, E2E_PORT, klickeWennRuhig, warteAufGestreamteInhalte, warteAufSpaltenaufteilung } from "./fixtures";

/**
 * Kommunikationspläne, Phase 2: der Diagramm-Editor (Spec §6.1–6.4, §6.6). Jeder bearbeitende Test
 * legt seinen eigenen Plan an — die Seed-Pläne gehören `e2e/kommplan.spec.ts`. Jeder ausgelöste
 * Speicheraufruf wird per `waitForResponse` geprüft (Falle 10); der Speicheraufruf ist der POST einer
 * Server Action, dessen Rumpf `"version"` trägt.
 */
const HOST = "kommplan.localtest.me";
const url = (pfad: string) => `http://${HOST}:${E2E_PORT}${pfad}`;
const ADMIN = "iuk-kommplan-bearbeiten";
const EINSATZ = "beispiel-einsatz-2026-02-22";

const istSpeichern = (r: Response) =>
  r.request().method() === "POST" && r.request().headers()["next-action"] !== undefined && (r.request().postData() ?? "").includes('"version"');
const flyinTitel = (page: Page) => page.locator(".kp-flyin").getByLabel("Titel", { exact: true });
const karten = (page: Page) => page.locator(".kp-betrachter [data-karte]");

async function speichertNach(page: Page, tu: () => Promise<unknown>): Promise<void> {
  const antwort = page.waitForResponse(istSpeichern);
  await tu();
  expect((await antwort).status()).toBe(200);
  await expect(page.locator(".kp-speicherstatus")).toHaveText(/^Gespeichert um \d\d:\d\d$/);
}

async function neuerPlan(page: Page, titel: string): Promise<string> {
  await page.goto(url("/"));
  await warteAufSpaltenaufteilung(page);
  await klickeWennRuhig(page.getByRole("button", { name: "Neu", exact: true }));
  const formular = page.getByRole("form", { name: "Neuer Plan" });
  await formular.getByLabel("Titel").fill(titel);
  await formular.getByLabel("Anlass").fill("e2e");
  const antwort = page.waitForResponse((r) => r.request().method() === "POST" && r.request().headers()["next-action"] !== undefined);
  await klickeWennRuhig(formular.getByRole("button", { name: "Anlegen und bearbeiten" }));
  expect((await antwort).status()).toBe(200);
  await page.waitForURL(/\/p\/[0-9a-f-]{36}$/);
  await warteAufSpaltenaufteilung(page);
  return new URL(page.url()).pathname.split("/").pop()!;
}

async function ersteStelle(page: Page, titel: string): Promise<void> {
  await expect(page.getByText("Dieser Plan hat noch keine Stellen.")).toBeVisible();
  await klickeWennRuhig(page.getByRole("button", { name: "Erste Stelle anlegen" }));
  await expect(flyinTitel(page)).toBeFocused();
  await speichertNach(page, () => flyinTitel(page).fill(titel));
}

test("Zugangsgruppe: kein „Neu“, der Plan bleibt Betrachter ohne Griffe", async ({ page }) => {
  await devLogin(page, { host: HOST, groups: "iuk-kommplan", callbackPath: "/" });
  await page.goto(url("/"));
  await warteAufSpaltenaufteilung(page);
  await expect(page.getByRole("heading", { level: 1, name: "Kommunikationspläne" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Neu", exact: true })).toHaveCount(0);
  await page.goto(url(`/p/${EINSATZ}`));
  await warteAufSpaltenaufteilung(page);
  await expect(page.getByRole("button", { name: "Rückgängig" })).toHaveCount(0);
  await klickeWennRuhig(page.locator('.kp-betrachter [data-karte="el"]'));
  await expect(page.locator("[data-griff]")).toHaveCount(0);
});

test("anlegen → erste Stelle → Unter- und Seitenstelle per Griff → gespeichert → nach Neuladen noch da", async ({ page }) => {
  await devLogin(page, { host: HOST, groups: ADMIN, callbackPath: "/" });
  await neuerPlan(page, "e2e Anlegen");
  await expect(page.getByRole("heading", { level: 1, name: "e2e Anlegen" })).toBeVisible();
  await ersteStelle(page, "Einsatzleitung");

  await klickeWennRuhig(page.locator('[data-griff="unter"]'));
  await expect(karten(page)).toHaveCount(2);
  await expect(flyinTitel(page)).toBeFocused();
  await expect(flyinTitel(page)).toHaveValue("");
  await speichertNach(page, () => flyinTitel(page).fill("EA Nord"));

  await klickeWennRuhig(karten(page).filter({ hasText: "Einsatzleitung" }));
  await klickeWennRuhig(page.getByRole("button", { name: "Seitenstelle links von Einsatzleitung anlegen" }));
  await expect(karten(page)).toHaveCount(3);
  await speichertNach(page, () => flyinTitel(page).fill("KatSL"));
  await expect(page.getByRole("toolbar", { name: "Auswahl: KatSL" })).toBeVisible();
  await expect(page.locator('[data-griff="unter"], [data-griff="links"], [data-griff="rechts"]')).toHaveCount(0);

  await page.reload();
  await warteAufSpaltenaufteilung(page);
  await expect(karten(page)).toHaveCount(3);
  await expect(page.locator(".kp-betrachter")).toContainText("EA Nord");
  await expect(page.locator(".kp-speicherstatus")).toHaveText("Alle Änderungen gespeichert");
});

test("Tastatur: N legt an, Pfeile wandern, Entf löscht, Strg/Cmd+Z holt zurück", async ({ page }) => {
  await devLogin(page, { host: HOST, groups: ADMIN, callbackPath: "/" });
  await neuerPlan(page, "e2e Tastatur");
  await ersteStelle(page, "EL");
  await page.keyboard.press("Escape");
  await expect(flyinTitel(page)).toHaveCount(0);
  const flaeche = page.locator(".kp-betrachter");
  await flaeche.focus();
  await page.keyboard.press("n");
  await expect(karten(page)).toHaveCount(2);
  await expect(flyinTitel(page)).toBeFocused();
  await speichertNach(page, () => flyinTitel(page).fill("EA 1"));
  await page.keyboard.press("Escape");
  await flaeche.focus();
  await page.keyboard.press("ArrowUp");
  await expect(page.getByRole("toolbar", { name: "Auswahl: EL" })).toBeVisible();
  await page.keyboard.press("ArrowDown");
  await expect(page.getByRole("toolbar", { name: "Auswahl: EA 1" })).toBeVisible();
  await speichertNach(page, () => page.keyboard.press("Delete"));
  await expect(karten(page)).toHaveCount(1);
  await expect(page.getByText("„EA 1“ gelöscht.")).toBeVisible();
  await speichertNach(page, () => page.keyboard.press("ControlOrMeta+z"));
  await expect(karten(page)).toHaveCount(2);
  await speichertNach(page, () => page.keyboard.press("ControlOrMeta+Shift+z"));
  await expect(karten(page)).toHaveCount(1);
});

test("Flyin: Zeichen suchen, Verbindung eintippen, Einheiten als Liste — alles steht im Diagramm", async ({ page }) => {
  await devLogin(page, { host: HOST, groups: ADMIN, callbackPath: "/" });
  await neuerPlan(page, "e2e Flyin");
  await ersteStelle(page, "EL");
  await klickeWennRuhig(page.locator('[data-griff="unter"]'));
  await speichertNach(page, () => flyinTitel(page).fill("EA 1"));
  const flyin = page.locator(".kp-flyin");

  await flyin.getByLabel("Zeichen suchen").fill("d.1.4");
  await klickeWennRuhig(flyin.locator('[data-zeichen="rezept:D.1.4"]'));
  await expect(karten(page).filter({ hasText: "EA 1" }).locator('use[href="#kp-rezept-D-1-4"]')).toHaveCount(1);

  await klickeWennRuhig(flyin.getByRole("button", { name: "Neue Verbindung" }));
  await flyin.getByLabel("Bezeichnung der neuen Verbindung").fill("R_UE_2");
  await speichertNach(page, () => klickeWennRuhig(flyin.getByRole("button", { name: "Anlegen und verbinden" })));
  await expect(page.locator(".kp-betrachter [data-sechseck]")).toHaveCount(1);

  await klickeWennRuhig(flyin.getByRole("button", { name: "Liste einfügen" }));
  await flyin.getByLabel("Einheiten, je Zeile eine").fill("RTW RK UE 40-83-5\nKTW RK UE 40-92-1");
  await speichertNach(page, () => klickeWennRuhig(flyin.getByRole("button", { name: "Übernehmen" })));
  await expect(page.locator(".kp-betrachter [data-einheit]")).toHaveCount(2);
  await expect(page.getByRole("list", { name: "Legende" })).toContainText("Digitalfunk TMO");
});

test("Konflikt zwischen zwei Fenstern: Hinweis, „Neu laden“ zeigt die andere Fassung", async ({ page, context }) => {
  await devLogin(page, { host: HOST, groups: ADMIN, callbackPath: "/" });
  const id = await neuerPlan(page, "e2e Konflikt");
  await ersteStelle(page, "Fassung A");
  const zweite = await context.newPage();
  await zweite.goto(url(`/p/${id}`));
  await warteAufSpaltenaufteilung(zweite);
  await speichertNach(page, () => flyinTitel(page).fill("Fassung A2"));

  await klickeWennRuhig(karten(zweite).first());
  await klickeWennRuhig(zweite.locator('[data-griff="bearbeiten"]'));
  const antwort = zweite.waitForResponse(istSpeichern);
  await flyinTitel(zweite).fill("Fassung B");
  expect((await antwort).status()).toBe(200);
  await expect(zweite.getByText("Jemand anderes hat diesen Plan inzwischen geändert.")).toBeVisible();
  await expect(zweite.locator(".kp-speicherstatus")).toHaveText("Nicht gespeichert — Konflikt");
  await klickeWennRuhig(zweite.getByRole("button", { name: "Neu laden" }));
  await expect(zweite.locator(".kp-betrachter")).toContainText("Fassung A2");
  await expect(zweite.getByText("Jemand anderes hat diesen Plan inzwischen geändert.")).toHaveCount(0);
  await zweite.close();
});

test("Karten gleiten — ohne Bewegung bei prefers-reduced-motion", async ({ page }) => {
  await devLogin(page, { host: HOST, groups: ADMIN, callbackPath: "/" });
  await neuerPlan(page, "e2e Gleiten");
  await ersteStelle(page, "EL");
  const karte = karten(page).first();
  await expect.poll(() => karte.evaluate((el) => getComputedStyle(el).transitionDuration)).toBe("0.22s");
  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect.poll(() => karte.evaluate((el) => getComputedStyle(el).transitionDuration)).toBe("0s");
});

test("Drucken aus dem Editor zeigt den gerade getippten Stand", async ({ page, context }) => {
  await context.addInitScript(() => { window.print = () => {}; });
  await devLogin(page, { host: HOST, groups: ADMIN, callbackPath: "/" });
  await neuerPlan(page, "e2e Drucken");
  await ersteStelle(page, "EL");
  await flyinTitel(page).fill("Druckprobe"); // bewusst ohne auf das Autosave zu warten
  const neueSeite = context.waitForEvent("page");
  await klickeWennRuhig(page.getByRole("button", { name: "Drucken" }));
  const druck = await neueSeite;
  await druck.waitForURL(/\/druck\/a4$/);
  await warteAufGestreamteInhalte(druck);
  await expect(druck.locator("svg.kp-blatt")).toContainText("Druckprobe");
  await druck.close();
});
```

- [ ] **Step 2: In den Eimer eintragen**

In `e2e/gruppen.json`, Eimer `eimer-2`, `e2e/kommplan-editor.spec.ts` in die `specs`-Zeichenkette aufnehmen, in der Sortierung, die `scripts/e2e-gruppen.test.ts` verlangt (`localeCompare` — voraussichtlich direkt **vor** `e2e/kommplan.spec.ts`).

Run: `pnpm vitest run scripts/e2e-gruppen.test.ts`
Expected: PASS. Meldet der Test eine falsche Reihenfolge, die Stelle nach seiner Meldung verschieben.

- [ ] **Step 3: Laufen lassen**

Vorher `uptime` prüfen. Bei Load über 10 den CI-Weg nehmen: `pnpm build && E2E_VORGEBAUT=1 pnpm exec playwright test e2e/kommplan-editor.spec.ts e2e/kommplan.spec.ts`; sonst:

Run: `pnpm exec playwright test e2e/kommplan-editor.spec.ts e2e/kommplan.spec.ts`
Expected: alle grün (7 neue + 6 aus Phase 1). Danach `git status`: ein von `next dev` umgeschriebenes `next-env.d.ts` mit `git checkout -- next-env.d.ts` zurücksetzen; kein `pnpm dev` offen lassen.

Typische Ursachen, wenn etwas rot ist — **nicht** den Test aufweichen:
- `toBeFocused()` scheitert: die antd-Schublade zieht den Fokus beim Öffnen an sich. Prüfen (antd-MCP, `antd_doc Drawer`), ob die Schublade eine Fokus-Option hat (`autoFocus`/`focusable`), und sie so setzen, dass `afterOpenChange` das Titelfeld fokussiert; sonst den Fokus in `afterOpenChange` mit `requestAnimationFrame` nachziehen.
- Das Gleiten misst `0s` auch ohne Emulation: die Klasse `kp-gleitet` sitzt nicht am `[data-karte]`-Element (Task 10, `lage.ts`), oder eine antd-Regel überschreibt `transition` — dann Falle 5.
- Ein Klick trifft daneben: die Hülle bricht nach `load` um — `warteAufSpaltenaufteilung` vor dem ersten Klick jeder Seite (Falle 12).

- [ ] **Step 4: Commit**

```bash
git add e2e/kommplan-editor.spec.ts e2e/gruppen.json
git commit -S -m "test(kommplan): e2e für Anlegen, Griffe, Tastatur, Konflikt, Gleiten und Drucken im Editor

Jeder Test legt seinen Plan selbst an; die Zugangsgruppe sieht weder
„Neu“ noch Griffe.

DRK-500

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 16: Sichtprüfung — Bildschirmfotos hell und dunkel auf drei Breiten, Befunde beheben

**Files:**
- Modify: `e2e/kommplan-editor.spec.ts` (Test „Bildschirmfotos")
- Modify nach Befund: die betroffenen Dateien unter `K/_ui/`
- Modify: dieser Plan, Abschnitt „Abweichungen bei der Umsetzung" (am Ende anlegen)

**Interfaces:**
- Consumes: Tasks 7–15.
- Produces: Bildschirmfotos unter `/private/tmp/claude-501/-Users-rubeen-dev-personal-drk-iuk-suite--claude-worktrees-drk-363-8c5335/c55f577c-bed2-49bc-a649-13521bcc9266/scratchpad/phase2-shots/` (nicht im Repo).

Nie Dev-Server plus `curl`: die Fotos macht Playwright über `devLogin` (Projektmuster). Der Test misst dabei etwas Echtes (kein waagerechtes Überlaufen, Griffe im Bild), damit er in der CI nicht nur Fotos schießt.

- [ ] **Step 1: Den Fototest anhängen**

An `e2e/kommplan-editor.spec.ts` anhängen (Import `mkdirSync` aus `node:fs`):

```ts
/**
 * SICHTPRÜFUNG (Umsetzungsplan Phase 2, Task 16): hell und dunkel über das Cookie `iuk-theme-pref`
 * (nie `emulateMedia({ colorScheme })` — die Suite löst das Thema über `<html data-theme>` auf),
 * Desktop, Tablet, Telefon. Mit `KOMMPLAN_FOTOS=<ordner>` landen die Fotos dort, sonst im
 * Ausgabeordner des Laufs. Zugesichert wird zweierlei: kein waagerechtes Überlaufen der Seite und
 * die Griffe der Auswahl im sichtbaren Bereich.
 */
const BREITEN = [{ name: "desktop", width: 1440, height: 900 }, { name: "tablet", width: 1024, height: 768 }, { name: "telefon", width: 390, height: 844 }] as const;

test("Bildschirmfotos: Liste, Editor mit Auswahl, Flyins — hell und dunkel, drei Breiten", async ({ page, context }, testInfo) => {
  test.setTimeout(240_000);
  const ordner = process.env.KOMMPLAN_FOTOS ?? testInfo.outputPath("fotos");
  mkdirSync(ordner, { recursive: true });
  await devLogin(page, { host: HOST, groups: ADMIN, callbackPath: "/" });
  const leerId = await neuerPlan(page, "e2e Fotos leer");
  const foto = (name: string) => page.screenshot({ path: `${ordner}/${name}.png`, animations: "disabled" });
  const ohneUeberlauf = async () =>
    expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);

  for (const modus of ["light", "dark"] as const) {
    await context.addCookies([{ name: "iuk-theme-pref", value: modus, url: url("/") }]);
    for (const b of BREITEN) {
      await page.setViewportSize({ width: b.width, height: b.height });
      const n = `${b.name}-${modus}`;

      await page.goto(url("/"));
      await warteAufSpaltenaufteilung(page);
      await expect(page.locator("html")).toHaveAttribute("data-theme", modus);
      await ohneUeberlauf();
      await foto(`liste-${n}`);
      await klickeWennRuhig(page.getByRole("button", { name: "Neu", exact: true }));
      await expect(page.getByRole("form", { name: "Neuer Plan" })).toBeVisible();
      await foto(`neu-${n}`);

      await page.goto(url(`/p/${leerId}`));
      await warteAufSpaltenaufteilung(page);
      await foto(`leer-${n}`);

      // Seed-Plan nur ANSEHEN und auswählen, nie ändern (Task 15, Kopf)
      await page.goto(url("/p/beispiel-openr-2022-07-01"));
      await warteAufSpaltenaufteilung(page);
      await ohneUeberlauf();
      await foto(`editor-${n}`);
      // ea2: Unterstelle mit Geschwistern und Einheiten — zeigt alle Griffe (el wäre eine Seitenstelle)
      await klickeWennRuhig(page.locator('.kp-betrachter [data-karte="ea2"]'));
      const griffe = page.locator('[data-griffe="ea2"]');
      await expect(griffe).toBeVisible();
      await expect(page.getByRole("toolbar", { name: /^Auswahl:/ })).toBeInViewport();
      await foto(`auswahl-${n}`);
      await klickeWennRuhig(page.locator('[data-griff="bearbeiten"]'));
      await expect(flyinTitel(page)).toBeVisible();
      await ohneUeberlauf();
      await foto(`flyin-stelle-${n}`);
      await page.keyboard.press("Escape");
      await klickeWennRuhig(page.getByRole("button", { name: "Planangaben" }));
      await expect(page.getByRole("form", { name: "Planangaben" })).toBeVisible();
      await foto(`flyin-plan-${n}`);
    }
  }
});
```

(Im Seed-Plan „OpenR" ist `ea2` „EA 2 Bühne": Unterstelle von `fuekw`, mit Geschwistern, Kanälen und Einheiten — `_lib/beispiele/openr20220701.ts`.)

- [ ] **Step 2: Fotos erzeugen**

Load prüfen (`uptime`), dann:

```bash
mkdir -p /private/tmp/claude-501/-Users-rubeen-dev-personal-drk-iuk-suite--claude-worktrees-drk-363-8c5335/c55f577c-bed2-49bc-a649-13521bcc9266/scratchpad/phase2-shots
KOMMPLAN_FOTOS=/private/tmp/claude-501/-Users-rubeen-dev-personal-drk-iuk-suite--claude-worktrees-drk-363-8c5335/c55f577c-bed2-49bc-a649-13521bcc9266/scratchpad/phase2-shots pnpm exec playwright test e2e/kommplan-editor.spec.ts -g "Bildschirmfotos"
```

Expected: PASS, 42 PNG-Dateien (7 Ansichten × 3 Breiten × 2 Modi).

- [ ] **Step 3: Jede Aufnahme mit `Read` ansehen und gegen diese Liste prüfen**

Dazu die Referenzbilder der Excel-Vorlage (`…/scratchpad/referenz/*.png`) einmal öffnen: die Zeichnung selbst soll dort wie in Phase 1 aussehen, nur die Bedienung ist neu.

1. **Dunkel**: Kopfleiste, Speicherstatus, Flyin-Beschriftungen (`--kp-gedaempft`), Chips, Auswahlrahmen (`--kp-auswahl`) lesbar; die Zeichenfläche bleibt Papier (weiß), die Zeichen-Vorschauen im Flyin stehen auf Weiß.
2. **Griffe**: nicht abgeschnitten, 44 px hoch, überdecken Titel und Kontaktzeilen der gewählten Karte nicht; die seitlichen „+" stehen neben, nicht auf der Karte. Zusätzlich einmal von Hand: eine Unterstelle an der Stelle ganz rechts bzw. ganz unten anlegen — die Griffe der neuen Karte müssen ganz im Bild sein (`GRIFF_RAND` in `Editor.tsx`).
3. **Telefon 390**: Werkzeugleiste bricht um statt überzulaufen, Knöpfe mindestens 44 px, Flyin höchstens 92 vw mit sichtbarem Schließen-Knopf, Formularzeilen untereinander (`auto-fit`/`minmax`), keine waagerechte Rollleiste.
4. **Tablet 1024**: Kopfleiste und Status in höchstens zwei Zeilen; das Flyin verdeckt die gewählte Karte nicht vollständig (sonst `zeige()` beim Öffnen in den linken Bereich lenken).
5. **Leerer Plan**: Hinweis und „Erste Stelle anlegen" deutlich, keine leere graue Fläche ohne Aussage.
6. **Flyin Plan**: Verbindungen mit Nutzung bzw. Chip „Reserve", Löschen bei benutzten Verbindungen erkennbar deaktiviert.

Jeden Befund beheben (kleinste Änderung am CSS bzw. an der Komponente, mit Test wo möglich — Quelltext-Scan in `kommplan-css.test.ts` oder Zusicherung im Fototest), Fotos neu erzeugen und wieder ansehen, bis die Liste erfüllt ist.

- [ ] **Step 4: Befunde festhalten**

Am Ende dieses Plans einen Abschnitt `## Abweichungen bei der Umsetzung` anlegen (Tabelle wie im Phase-1-Plan: `| # | Aufgabe | Befund | Entscheidung |`) und je Befund eine Zeile eintragen. Gab es keinen, steht dort „Sichtprüfung ohne Befund (Datum, Anzahl Fotos)".

- [ ] **Step 5: Tore für die geänderten Dateien, Commit**

Run: `pnpm vitest run src/app/m/kommplan && pnpm typecheck; echo "typecheck exit $?" && pnpm lint && pnpm exec playwright test e2e/kommplan-editor.spec.ts`
Expected: grün, exit 0.

```bash
git add e2e/kommplan-editor.spec.ts src/app/m/kommplan/_ui docs/superpowers/plans/2026-09-30-kommplan-phase-2.md
git commit -S -m "test(kommplan): Sichtprüfung des Editors hell und dunkel auf drei Breiten

Der Fototest sichert kein waagerechtes Überlaufen und Griffe im Bild;
Befunde der Sichtprüfung stehen im Umsetzungsplan.

DRK-500

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

(Behebungen mit eigener fachlicher Wirkung gehen vorher als eigener Commit `fix(kommplan): …`.)

---

### Task 17: Release-Notiz nachziehen und alle Tore

**Files:**
- Modify: `src/app/m/portal/_lib/neuigkeiten/notizen/kommplan/2026-09-30-kommunikationsplaene-ansehen.ts` (nur `titel` und `inhalt`; Dateiname, `slug` und `datum` bleiben — es gibt am Ende EINE Notiz für das ganze Modul, Vorgabe des Hauptlaufs)

**Interfaces:**
- Consumes: alles.
- Produces: den abgeschlossenen Stand der Phase 2.

- [ ] **Step 1: Notiz anpassen**

`titel` und `inhalt` ersetzen durch (Du-Form, Wörter vom Bildschirm, kein Markdown, kein Werbewort, höchstens 320 Zeichen je Absatz, 640 gesamt, Titel höchstens 60 — `register.test.ts` prüft das):

```ts
  titel: "Kommunikationspläne ansehen, bearbeiten und drucken",
  inhalt: [
    absatz(
      "Unter „Kommunikationspläne“ siehst du Kommunikationspläne und Fernmeldeskizzen als Diagramm, das sich selbst anordnet. " +
        "Du kannst hineinzoomen, Stellen einklappen und jeden Plan über „Drucken“ auf A4 quer ausgeben oder als PDF sichern.",
    ),
    absatz(
      "Mit Bearbeitungsrecht legst du über „Neu“ einen Plan an und baust ihn im Diagramm auf: Stelle anklicken, dann „+ Unterstelle“, „+ Einheit“ oder „+“ für eine Seitenstelle. " +
        "Rechts trägst du Titel, Zeichen, Kontakte und Verbindungen ein. Jede Änderung speichert sich selbst und lässt sich rückgängig machen.",
    ),
  ],
```

Den Kopfkommentar der Datei (Zielgruppe) unverändert lassen.

- [ ] **Step 2: Notiz-Tests**

Run: `pnpm vitest run src/app/m/portal/_lib/neuigkeiten`
Expected: PASS. Ist ein Absatz zu lang, kürzen — nie die Grenze anfassen.

- [ ] **Step 3: Alle Tore**

Vorher `uptime`. Dann nacheinander, jeweils Exit-Code prüfen:

```bash
pnpm typecheck; echo "typecheck exit $?"
pnpm lint; echo "lint exit $?"
pnpm anker:neu; echo "anker exit $?"
pnpm vitest run; echo "vitest exit $?"
pnpm build; echo "build exit $?"
pnpm exec playwright test e2e/kommplan.spec.ts e2e/kommplan-editor.spec.ts; echo "e2e exit $?"
```

Expected: alles exit 0. Bekannt und nicht Teil dieser Arbeit: `scripts/backup-sidecar.test.ts` auf macOS (DRK-501); `pnpm vitest run` darf ausschließlich daran rot sein. Ein rotes e2e bei hoher Last einzeln bzw. über `pnpm e2e:gebaut` (CI-Weg) nachfahren, bevor es als Befund gilt. `next-env.d.ts` danach zurücksetzen, falls umgeschrieben.

- [ ] **Step 4: Commit**

```bash
git add src/app/m/portal/_lib/neuigkeiten/notizen/kommplan/2026-09-30-kommunikationsplaene-ansehen.ts
git commit -S -m "docs(kommplan): Release-Notiz beschreibt den Stand mit Diagramm-Editor

Eine Notiz für das ganze Modul; sie nennt jetzt Anlegen und Bearbeiten
im Diagramm.

DRK-500

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Abdeckung der Spec (Selbstprüfung)

| Spec / Vorgabe | Aufgabe |
|---|---|
| §6.1 Planliste „Neu" (Titel, Art, Anlass, Datum), danach in den Editor | 5, 6, 7 |
| §6.1 `/p/[id]` Editor (Admin) bzw. Betrachter (Zugangsgruppe); IDOR in jeder Action | 5, 6, 14, 15 |
| §6.2 Kopfleiste: Titel, Diagramm \| Gliederung (Gliederung deaktiviert), Rückgängig/Wiederholen, Drucken, Speicherstatus; Flyin rechts mit `flyinBreite()` | 11, 13, 14 |
| §6.3 Griffe „+ Unterstelle", „+ Seitenstelle", „+ Einheit"; sofort gesetzt, ausgewählt, Fokus im Titel | 2, 10, 14, 15 |
| §6.3 gleitende Animation, ohne bei `prefers-reduced-motion` | 10, 15 |
| §6.3 Tastatur: Pfeile, Enter, N, Entf mit Rückgängig | 8, 14, 15 |
| §6.4 Zeichen-Suche mit „zuletzt genutzt" | 6, 8, 11, 15 |
| §6.4 Titel, Leiter, Hervorheben; Kontakte in fester Reihenfolge | 11 |
| §6.4 Untersteht/Lage (Umhängen, keine Zyklen); Verbindung wählen oder neu tippen; Einheiten einzeln und „Liste einfügen" | 3, 4, 12, 15 |
| §6.4 „Aus Bibliothek" / „In Bibliothek übernehmen" | bewusst nicht (Phase 4) |
| Plan-Metadaten und Optionen `leerzeilen`, `vermerkVsNfD` | 5, 13 |
| Verbindungen verwalten: umbenennen, Art, löschen nur unbenutzt, unbenutzt = Reserve | 3, 13 |
| §6.6 Autosave ~1 s mit `version`, Konflikt „Neu laden" / „Meine Fassung behalten", Client-Stapel Rückgängig | 5, 8, 9, 14, 15 |
| §6.6 reine Operationen in `_lib/plan/` | 2, 3, 4 |
| §10 Einfüge-Eigenschaft ehrlich, Spec-Satz ergänzt | 1 |
| Hauptlauf (1): Audit gebündelt, 15 Minuten je Person und Plan | 5 |
| Hauptlauf (3): Release-Notiz beschreibt den Stand nach Phase 2 | 17 |
| e2e und Sichtprüfung (hell/dunkel, 1440×900, 1024×768, 390×844) | 15, 16 |

