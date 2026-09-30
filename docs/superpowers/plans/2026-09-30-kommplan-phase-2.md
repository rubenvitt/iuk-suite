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
- Keine `revalidatePath`-Aufrufe aus dem Autosave: die Editor-Insel ist die Quelle der Wahrheit bis zum Neuladen. Der Editor wird aus den Props **einmal** gesät und über `key={plan.id}` an den Plan gebunden. Weil Next bei Browser-Zurück/-Vor die Seite aus dem Client-Cache wiederverwendet (`node_modules/next/dist/docs/01-app/04-glossary.md`, „Client Cache": „reused during browser back/forward navigation"; `next.config.ts` hat kein `cacheComponents`), können diese Props veraltet sein: der Editor fragt deshalb beim Montieren den Serverstand ab (Entscheidung 21).
- React Compiler ist an (`next.config.ts`, `reactCompiler: true`), `react-hooks/set-state-in-effect` ist aktiv: kein `setState` im Effekt-Rumpf; Timer, Speicherläufe und Zustandswechsel gehören in Ereignis-Rückrufe (Vorbild `_ui/betrachter/Betrachter.tsx`, Kopfkommentar).
- Hell/Dunkel über `<html data-theme>` (Cookie `iuk-theme-pref`), nie `prefers-color-scheme`. Eigenes Markup nimmt `--kp-*`, nie `--ant-*` (Falle 2). Warnungen sind `type="warning"`, nie `type="error"` (Falle 3); Feldfehler als Text plus `aria-invalid`, nicht rot.
- Nie `timeZone` als Literal auf Modulebene; Uhrzeiten über `zeitFormat("de-DE", …)` aus `core/zeit`. `plan.datum` ist ein Kalendertag als Mitternacht UTC und wird mit `timeZone: "UTC"` im Aufruf formatiert bzw. als `YYYY-MM-DD` über `toISOString().slice(0, 10)` gelesen (Ausnahme aus `CLAUDE.md`).
- Tests, die dieser Plan an eine bestehende Testdatei „anhängt", bringen ihre Importe mit: diese in die **vorhandenen** Importzeilen derselben Module zusammenführen (keine zweite `import … from "./operationen"`-Zeile; `pnpm lint` meldet doppelte Importe).
- DOM-Tests nur über das Harness `src/app/m/qr/_lib/test-dom.tsx` (`mount`, `rerender`, `unmount`, `query`, `queryAll`, `fill`, `click`, `clickElement`, `queryPortal`, `clickPortal`, `existsPortal`), Kopfzeile `// @vitest-environment jsdom`.
- Kommentaranker in neuem Code nennen **Namen**, nie Zeilen (`pnpm anker:neu` bricht die CI). **Ankerschritt** für jede bestehende Datei, in die dieser Plan Zeilen einfügt oder aus der er Zeilen entfernt (`src/core/audit/catalog.ts`, `src/core/audit/coverage-manifest.json`, `src/app/m/kommplan/_db/schema.ts`, `src/app/m/kommplan/_lib/plan/schema.ts`, `src/app/m/kommplan/_lib/plan/operationen.ts`, `src/app/m/kommplan/_lib/zugang.ts`, `src/app/m/kommplan/_lib/plaene.ts`, `src/app/m/kommplan/_lib/zeichen/zeichen.ts`, `src/app/m/kommplan/_lib/zeichen/grundlagen.ts`, `src/app/m/kommplan/_lib/plan/kontakte.ts`, `src/app/m/kommplan/grenze.test.ts`, `src/app/m/kommplan/_ui/betrachter/Betrachter.tsx`, `src/app/m/kommplan/_ui/betrachter/ansicht.ts`, `src/app/m/kommplan/_ui/zeichnung/Karte.tsx`, `src/app/m/kommplan/_ui/zeichnung/Zeichnung.tsx`, `src/app/m/kommplan/_ui/zeichnung/Sechseck.tsx`, `src/app/m/kommplan/_ui/kommplan.css`, `src/app/m/kommplan/(intern)/page.tsx`, `src/app/m/kommplan/(intern)/p/[id]/page.tsx`, `src/app/m/kommplan/_lib/layout/eigenschaften.test.ts`, `e2e/gruppen.json`, `docs/superpowers/specs/2026-09-30-modul-kommunikationsplaene-design.md`): vor dem Commit `git grep -n "<dateiname>:[0-9]" -- src scripts e2e docs` und `pnpm anker:drift <datei>`. Ein Anker, der **vor** der Änderung zutraf und hinter der Änderungsstelle liegt, wird in derselben Zeile in die Namensform umgeschrieben. Nie eine Zahl nachziehen, nie eine Zeile dazu oder weg (Kommentaranker-Regel 4). Schon vorher veraltete Anker bleiben, wie sie sind. Stand der Planung (`git grep` am 30.09.2026): in keine dieser Dateien zeigt heute ein Zeilenanker — der Schritt ist trotzdem je Commit zu fahren, parallele Arbeit kann einen hinzufügen.
- Signierte Commits (`git commit -S`), Kopfzeile nach Conventional Commits: `feat(kommplan): …` für neue Funktion, `fix(kommplan): …`, `test(kommplan): …`, `refactor(kommplan): …`, `docs: …`. Body mit einer Zeile `DRK-500` und am Ende `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Last: andere Sessions laufen parallel. Vor jedem Urteil über einen roten Test `uptime` prüfen; bei Load > 10 die betroffene Datei einzeln fahren oder den CI-Weg (`pnpm e2e:gebaut` bzw. `E2E_VORGEBAUT=1`). Fremde Prozesse nie beenden. Kein `pnpm dev` offen lassen; ein von `next dev` umgeschriebenes `next-env.d.ts` mit `git checkout -- next-env.d.ts` zurücksetzen. `scripts/backup-sidecar.test.ts` ist auf macOS rot (DRK-501) — nicht dein Thema.
- Tore vor dem Abschluss: `pnpm typecheck` (Exit-Code prüfen) · `pnpm lint` · `pnpm vitest run` · `pnpm build` · `pnpm exec playwright test e2e/kommplan.spec.ts e2e/kommplan-editor.spec.ts`. **Jeder Commit besteht `pnpm typecheck`.** Aufgaben, die Routen oder Server Actions anlegen, fahren zusätzlich `pnpm build` (die RSC-Grenze und `"use server"`-Exporte prüft nur der Build).
- Next-Guides vor dem ersten Code, der die API benutzt, lesen: `node_modules/next/dist/docs/01-app/01-getting-started/07-mutating-data.md`, `…/02-guides/server-actions.md` (Abschnitt „Body size limit": 1 MB je Aufruf; Server Actions laufen im Client **nacheinander**), `…/03-api-reference/01-directives/use-server.md`, `…/03-api-reference/04-functions/use-router.md`. antd-6-APIs (`Drawer`, `Segmented`, `Select`, `AutoComplete`, `DatePicker`, `Switch`, `Tooltip`) im Zweifel über das antd-MCP (`ToolSearch` „antd", dann `antd_doc`/`antd_demo`). Abgekündigte Props nie benutzen (installiert ist antd 6.6.4): `Alert` bekommt `title=` statt `message=` und `closable={{ onClose }}` statt `closable onClose=` (`node_modules/antd/es/alert/Alert.d.ts`, `@deprecated`; Vorbild `src/app/m/portal/admin/audit/AuditLog.tsx`).

## Entscheidungen dieser Phase (Abweichungen von Spec und Phase-1-Plan)

1. **Audit gebündelt statt je Autosave** (ersetzt Abweichung 7 des Phase-1-Plans, Vorgabe des Hauptlaufs): Die Spalten `inhalt`, `version`, `aktualisiert_am`, `aktualisiert_von` der Tabelle `plan` werden `unauditedColumns`; ihr Update-Trigger feuert nur noch für `id`, `titel`, `typ`, `anlass`, `datum`, `ist_vorlage`, `archiviert_am` — Anlegen, Archivieren (Phase 4) und jede Änderung der Planangaben bleiben also je eine Zeile. Inhaltsänderungen protokolliert die neue, auditierte Tabelle `plan_bearbeitung (plan_id, nutzer, seit)`, Primärschlüssel `(plan_id, nutzer)`: das erste Speichern einer Person an einem Plan legt die Zeile an (Audit `create`), ein Speichern **15 Minuten oder mehr** nach `seit` setzt `seit` neu (Audit `update`), alles dazwischen schreibt nichts. So gilt „höchstens eine Audit-Zeile je Person und Plan in einem 15-Minuten-Fenster" auch dann, wenn zwei Personen abwechselnd speichern — ein einzelnes Spaltenpaar am Plan hätte bei jedem Wechsel geschrieben. Migration `0001` (generiert, Trigger von Hand wie `lagerbuch/_db/migrations/0005_artikel_kategorie.sql`).
2. **Spec §10 „Einfügen verschiebt nichts links davon" ehrlich** (Vorgabe des Hauptlaufs, nach Kritik geschärft): Der Hauptlauf ging davon aus, die Zusage gelte „nur innerhalb einer Ebene/Gruppe". Nachgerechnet gilt auch das **absolut nicht**: die Elternstelle steht mittig über ihrer Busspanne, eine neue Stelle am Ende verschiebt deshalb auch die früheren Geschwister derselben Gruppe (selbst nachgerechnet per `tsx` nach dem Muster von `einfuegung()`, Variante „ende", Seeds 1–80: 67 wirksame Fälle, in 6 davon rücken die früheren Geschwister der eigenen Gruppe um −27 bis −48 mm). Zugesichert ist nur, was die Tests über `relativ(…)` prüfen, und nur **unter ihrer Vorbedingung** (kein Kamm vorher wie nachher, gleiche Zeilenhöhen und Ebenenlücken — eine Gruppe mehr darf die Lücke wachsen lassen, dann rückt zu Recht alles darunter): **kein y ändert sich**; die früheren Geschwister in der Busgruppe der neuen Stelle und die früheren Gruppen ihrer Ebene bleiben **je untereinander starr**; eine Gruppe als Ganzes darf rücken. Die Vorgabe „ehrlich auf das formulieren, was gilt" hat Vorrang vor ihrer Einschränkung — Spec §10 bekommt diesen Wortlaut (ohne „verschiebt nichts links", auch nicht eingeschränkt) samt dem Satz, dass eine neue Kanalgruppe die Elternstelle neu zentriert. Das `it.fails` wird ein regulärer Test des Seed-70-Falls.
3. **Planangaben (Titel, Art, Anlass, Datum) sind Spalten, keine Dokumentfelder** (§4.1): Sie speichern sich wie alles andere **selbst** — beim Verlassen eines Textfelds, mit Enter und sofort bei Art und Datum; ein Schließen des Flyins verlässt das Feld und speichert damit ebenfalls. Kein „Übernehmen" (nach Kritik: sonst gingen Angaben beim Schließen still verloren, während die Kopfleiste „gespeichert" meldet). Unveränderte Angaben werden nie gesendet. Sie laufen durch **dieselbe** Speicher-Warteschlange wie der Inhalt (eigene Action, je Speichern eine Audit-Zeile über den Trigger von `plan`), damit die Version nie auseinanderläuft. Sie sind nicht Teil von Rückgängig. Die Optionen `leerzeilen` und `vermerkVsNfD` liegen im Dokument (§4.2) und laufen über Rückgängig und Autosave; `qrAufDruck` und `schwarzweiss` bleiben Phase 5.
4. **Zeichen-Suche** (§6.4 „Suche über den Katalog-Index"): Das Rezept-Generat bleibt Server-only (Phase-1-Constraint). Die Planseite reicht dem Editor einen schlanken Index (`schluessel`, `titel`, `suchtext`, rund 20 KB) als Prop; die SVGs der gerade sichtbaren Treffer und neu gewählter Zeichen holt eine lesende Server Action `ladeZeichenAction` (höchstens 40 Schlüssel je Aufruf). „Zuletzt genutzt" merkt sich der Browser (`localStorage`, in `try/catch`, höchstens 8), ergänzt um die Zeichen, die der Plan schon benutzt.
5. **Griffe als HTML-Überlagerung über dem SVG**, nicht im SVG: sie behalten bei jedem Zoom 44 px Tapfläche (Falle 4, ARBEITSDICHTE) und sind echte `<button>`s mit Namen. Seitlich steht ein „+" mit dem Namen „Seitenstelle links von <Titel> anlegen" bzw. „… rechts …" (sichtbarer Text „+ Seitenstelle" wäre an einer Kartenkante zu breit). Damit Sehende das „+" nicht als „noch eine Stelle am selben Bus" lesen (Kritik), trägt es zusätzlich ein antd-`Tooltip` „Seitenstelle links anlegen — waagerecht, ohne Bus" (zeigt sich bei Zeigen **und** Fokus) und neben dem „+" ein kleines Inline-SVG einer waagerechten Anbindung. Unten die Griffleiste „+ Unterstelle", „+ Einheit" (die Einheitenspalte liegt direkt darunter) und „Bearbeiten"; sie steht auf Höhe der Überlagerung, nicht der Karte, wird per CSS-`clamp()` im Bild gehalten (links und rechts 8 px Rand) und bricht bei schmaler Fläche um (`flex-wrap`). Ein Klick auf eine Karte wählt sie, ein zweiter Klick, ein Doppelklick, Enter, F2 oder „Bearbeiten" öffnen das Flyin.
6. **Seitenstellen tragen keine Unterstellen** (§4.2): an einer Seitenstelle fehlen die Griffe „+ Unterstelle" und „+ Seitenstelle"; `N` zeigt dort den Hinweis „Eine Seitenstelle trägt keine Unterstellen." und ändert nichts.
7. **Neue Unterstelle tritt dem Bus bei** (§5.2, bequem nach A1): sie übernimmt die Verbindung der in Anzeigereihenfolge letzten Unterstelle ihrer Elternstelle; ohne Geschwister hat sie keine Verbindung. Eine neue Seitenstelle hat keine Verbindung.
8. **Löschen entfernt den Teilbaum** samt Seitenstellen und Einheiten; Verbindungen bleiben stehen (unbenutzte werden in der Legende „Reserve", dieselbe Regel wie `legende()`: die `verbindungId` einer Wurzel ist kein Weg). Rückgängig statt Nachfrage (§6.3); der Hinweis nennt die Zahl der mitgelöschten Stellen und trägt einen Knopf „Rückgängig". Danach hat die Fläche den Fokus (Entscheidung 17).
9. **Pfeiltasten** (§6.3 „Pfeile wandern durch den Baum"): ↑ zur Elternstelle, ↓ zur ersten sichtbaren Unterstelle, ←/→ zum Nachbarn in **Anzeigereihenfolge** der Geschwister (Busgruppen wie im Layout, `anzeigereihenfolge`), wobei jede Stelle von ihren Seitenstellen eingerahmt wird (`[…links, Stelle, …rechts]`). Das trägt auch über Kammreihen und gestapelte Seitenstellen, die keine gemeinsame y-Koordinate haben. Ohne Auswahl wählt die erste Pfeiltaste die erste Wurzel. Verschieben per Tastatur entfällt im Editor (Maus, Touch, Rad bleiben); `+`, `-`, `0` zoomen wie im Betrachter. Andere druckbare Tasten tun auf der Fläche nichts — „Tippen bearbeitet den Titel" wie in Excel ist bewusst **nicht** umgesetzt: §6.3 legt `N` als Befehl fest, und dann legte jedes Wort mit N („Notunterkunft") eine Unterstelle an, während jeder andere Anfangsbuchstabe den Titel bearbeitete. Stattdessen wirkt F2 wie Enter, und der Bedienhinweis steht sichtbar als kurze Zeile unter der Fläche (nicht nur im `aria-label`).
10. **Kanäle einer Stelle** (Phase-1-Abweichung 12, `Stelle.kanaele`) sind im Flyin unter „Verbindung" als Mehrfachauswahl bearbeitbar — sonst ließen sich Pläne wie OpenR im Editor nicht pflegen.
11. **Autosave** (§6.6): Die Warteschlange sendet ~1 s nach der letzten Änderung den **dann** aktuellen Stand, immer nur einen Aufruf gleichzeitig (Next reiht Server Actions ohnehin). Konflikt → Hinweis `type="warning"` mit „Neu laden" (lokalen Stand und Rückgängig-Stapel verwerfen, Serverstand übernehmen) oder „Meine Fassung behalten" (mit der Serverversion erneut senden, überschreibt). Solange ein Konflikt offen ist, wird nicht automatisch gespeichert. „Meine Fassung behalten" betrifft nur den Inhalt: die Planangaben der anderen Fassung werden übernommen (der Hinweis sagt das), sonst überschriebe ein späteres Speichern der Angaben sie still. Ungespeicherte Änderungen (auch ein Angaben-Feld, das noch nicht verlassen wurde) halten das Schließen des Tabs per `beforeunload` auf. Nach einem Netzfehler (nicht bei Konflikt oder „weg") versucht der Speicherer es selbst wieder: nach 5 s, 15 s, 30 s, dann jede Minute, und sofort beim Ereignis `online`; „Erneut versuchen" bleibt.
12. **Drucken aus dem Editor** öffnet das Fenster synchron (`window.open("", "_blank")`, sonst greift der Popup-Blocker), wartet auf das Speichern und setzt dann die Adresse der Druckroute; misslingt das Speichern, schließt es das Fenster und zeigt den Hinweis.
13. **Telefon**: Die Gliederung (§6.5, laut Spec **der einzige Bearbeitungsweg am Telefon**) kommt in Phase 3. Bis dahin taugt der Diagramm-Editor bei 390 px nur für **kleine Korrekturen** (Titel, Kontakt, eine Einheit): jedes Anlegen öffnet ein Flyin von 92 vw, das die Zeichnung verdeckt. Aufgebaut wird ein Plan am Tablet oder Desktop bzw. ab Phase 3 in der Gliederung. Eine untere Schublade am Telefon wäre Vorgriff auf §6.5 und entfällt. Der Umschalter zeigt „Gliederung" deaktiviert.
14. **Leerer Plan** nach „Neu": statt der Zeichnung steht „Dieser Plan hat noch keine Stellen." mit dem Knopf „Erste Stelle anlegen" (legt eine Wurzel an, wählt sie, öffnet das Flyin mit Fokus im Titel).
15. **Große Pläne**: Das Layout rechnet aus `useDeferredValue(inhalt)`, damit Tippen im Flyin auch an der großen Stab-Lage flüssig bleibt. **Größe**: Das Schema erlaubt nach seinen Feldgrenzen Dokumente von rund 9 MB (500 Stellen × rund 19 KB); Server Actions nehmen höchstens 1 MB an (`…/02-guides/server-actions.md`, „Body size limit"), und ein abgelehnter Aufruf sähe im Speicherer aus wie ein Netzfehler — eine Sackgasse. Deshalb bekommt das Schema eine **Gesamtgrenze** `GRENZE.bytes = 800_000` (UTF-8 des JSON, 200 KB Luft für die Kodierung des Aufrufs): jede Operation, die den Plan darüber wachsen ließe, ist ein `PlanFehler` mit eigener Meldung („Der Plan ist zu groß …") und wird gar nicht erst angewandt; der Server prüft dieselbe Grenze. Kosten: ein `JSON.stringify` + `TextEncoder` je Operation, bei der großen Stab-Lage (rund 25 KB) unter 1 ms, bei 800 KB wenige ms — neben dem vollen `safeParse`, das `gueltig` ohnehin macht. Gemessen in Task 2, Step 1.
16. **Kontakte als feste Zeilen je Art** (nach Kritik, Spec §6.4 „Reihenfolge fest"): Das Flyin zeigt immer ein Wertfeld je `KontaktArt` in der Reihenfolge der Karte (Funkrufname, Digitalfunk, Telefon, Mobil, Fax, E-Mail, Sonstiges). Leer heißt „kein Kontakt dieser Art": Tippen in ein leeres Feld legt den Eintrag an, Leeren des einzigen Eintrags einer Art entfernt ihn. „Weiterer <Art>" legt eine zweite Zeile derselben Art an (Fokus hinein), die einen eigenen „Entfernen"-Knopf hat. Das Datenmodell §4.2 bleibt; die Karte lässt leere Werte ohnehin weg (`kontaktZeilen`). Ein Kontakt kostet damit Tippen plus Tab statt vier Handgriffe.
17. **Fokus kehrt auf die Fläche zurück** (§6.3, Tastaturschleife): nach dem Schließen eines Flyins (Esc, X), nach „Stelle löschen"/Entf und nach „Erste Stelle anlegen" hat die Zeichenfläche den Fokus (`FlaecheGriff.fokus()`), sonst täten N, Pfeile, Enter und Entf nichts. **Enter im Titelfeld** heißt „fertig": Flyin zu, Fokus auf die Fläche, Auswahl bleibt. Die Schleife lautet damit N → Titel → Enter → N … bzw. ↑ N für die nächste Nachbarstelle.
18. **Ansicht bleibt eingepasst, bis die Nutzerin selbst zoomt oder verschiebt** (nach Kritik; ersetzt das Einfrieren per `halte()`): Solange die Ansicht „eingepasst" ist, passt sie sich jedem neuen Layout an, im Editor gedeckelt auf den Maßstab `EDITOR_MASSSTAB = 4` px/mm (sonst füllte eine einzelne Karte die Fläche mit Maßstab 16), und gleitet dabei wie die Karten (ohne bei reduzierter Bewegung). Erst Zoom, Verschieben, Rad oder Pinch machen sie zur eigenen Ansicht; „Einpassen" und `0` kehren zurück. Ist ein Flyin offen, rechnet die Fläche mit dem **freien** Bereich links davon (`flyinGrund`), beim Einpassen wie bei `zeige()` — eine neue Karte am rechten Rand landet so nie unter dem Flyin. Eingepasst hält die Fläche seitlich und unten Platz für die Griffe (`platzSeite`/`platzUnten` = `GRIFF_RAND`), sodass `zeige()` eine eingepasste Ansicht nie verschieben muss und sie eingepasst bleibt; `data-eingepasst` an der Fläche macht das im e2e prüfbar.
19. **Hinweise ohne Umbruch des Flusses**: Hinweise des Editors (Löschen mit „Rückgängig", `PlanFehler`, Speicherfehler mit „Erneut versuchen") liegen als Überlagerung unten mittig in der Fläche (`meldung`-Platz der `Flaeche`, auch beim leeren Plan sichtbar) und schließen erst per X, durch den nächsten Hinweis oder die nächste strukturelle Änderung — nicht beim Tippen. Der Speicherstatus hat kurze Texte in einem Platz fester Mindestbreite (`min-width: 18ch; white-space: nowrap`): „Gespeichert", „Gespeichert 11:05", „Ungespeichert", „Speichert …", „Nicht gespeichert", „Konflikt"; die lange Fehlermeldung steht im Hinweis. So springt die Fläche beim Autosave nicht.
20. **Druck-Knopf heißt überall „Drucken (A4 quer)"** — im Editor wie im Betrachter, damit die Release-Notiz einen Namen nennen kann. Der Knopf der Planangaben heißt „Plan und Verbindungen" (Reserve, Leerzeilen und VS-NfD-Vermerk stecken dort); zusätzlich öffnet „Verbindungen bearbeiten" unter der Legende dasselbe Flyin am Abschnitt „Verbindungen".
21. **Veralteter Stand nach Browser-Zurück**: Der Editor ruft beim Montieren die lesende Action `ladeStandAction(id)` und übernimmt das Ergebnis im `.then` (nicht im Effekt-Rumpf): ist die Serverversion neuer und lokal noch nichts geändert, gilt still der Serverstand; wurde lokal schon geändert, öffnet sich der Konflikthinweis. Ohne das zeigte der Editor nach „Alle Pläne" → Zurück den alten Stand, und „Meine Fassung behalten" überschriebe die eigenen neueren Speicherungen.

## Review Focus

1. **Der frisch angelegte, leere Plan** → keine Karte, keine Griffe, kein Absturz in Layout, Navigation oder Legende; „Erste Stelle anlegen" führt in den Normalfall. Gepinnt in `navigation.test.ts` (Task 8) und `Editor.test.tsx` (Task 14), e2e in Task 15 (`ersteStelle`).
2. **„Liste einfügen" mit über 60 Einheiten, zu langem Typ oder Rufnamen, Leerzeilen und Tabs** → die gültigen Zeilen werden nicht still gekürzt; die Liste wird abgewiesen, der Hinweis nennt die Zeile bzw. die Grenze, das Dokument bleibt unverändert. Gepinnt in `einfuegen.test.ts` und `einheiten.test.ts` (Task 4) und `StelleFlyin.test.tsx` (Task 12).
3. **Umhängen einer Stelle mit Unterstellen nach links/rechts, unter sich selbst oder unter einen eigenen Nachkommen** → abgewiesen mit Hinweis, Auswahl bietet solche Ziele gar nicht erst an. Gepinnt in `operationen.test.ts` (Task 3) und `StelleFlyin.test.tsx` (Task 12).
4. **Eine Verbindung, die nur als Kanal (`kanaele`) benutzt wird** → gilt als benutzt: nicht löschbar, nicht „Reserve". Umgekehrt ist die `verbindungId` einer **Wurzel** kein Weg: dieselbe Regel wie `legende()`, sonst zeigte die Legende „Reserve X" und das Plan-Flyin sperrte das Löschen. Gepinnt in `verbindungen.test.ts` (Task 3) und `PlanFlyin.test.tsx` (Task 13).
5. **Zwei Speicherwege gleichzeitig** (Planangaben speichern, während eine Inhaltsänderung wartet oder unterwegs ist) → kein falscher Konflikt, beide landen, die Version zählt genau zweimal hoch. Gepinnt in `speichern.test.ts` (Task 5) und `speicherer.test.ts` (Task 9).
6. **Ein Seed-Plan wird nur angesehen, nie geschrieben** — auch nicht durch die neuen Selbst-Speicher-Wege (Angaben beim Verlassen, Kontaktfelder): unveränderte Werte werden nie gesendet. Gepinnt in `PlanFlyin.test.tsx` (Task 13) und im Fototest (Task 16: null Speicheraufrufe am Seed-Plan).
7. **Wechsel der Auswahl bei offenem Flyin** → kein Zustand der vorigen Stelle wandert mit (offene „Liste einfügen", Entwurf einer neuen Verbindung, Fehlermeldungen, Zeichen-Suche), und keine Fokusanfrage der vorigen Stelle zieht den Fokus in die neue (Anfragen nennen ihre Stelle). Gepinnt in `StelleFlyin.test.tsx` (Task 12).

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
│   ├── plan.ts                       "use server": legePlanAnAction, speichereInhaltAction, speichereAngabenAction, ladeStandAction (lesend)
│   └── zeichen.ts                    "use server": ladeZeichenAction (lesend)
├── _db/
│   ├── schema.ts                     geändert: planBearbeitung
│   └── migrations/0001_plan_bearbeitung.sql (+ meta/0001_snapshot.json, _journal.json)
├── _lib/
│   ├── angaben.ts                    NEU: Planangaben (zod), Kalendertag ↔ ms — beide Seiten
│   ├── ergebnis.ts                   NEU: Rückgabetypen der Actions — beide Seiten
│   ├── speichern.ts                  NEU (Server): legePlanAn, speichereInhalt, speichereAngaben, ladeStand, merkeBearbeitung
│   ├── plaene.ts                     geändert: GeladenerPlan trägt version und angaben
│   ├── zugang.ts                     geändert: requireKommplanBearbeitenAktion
│   ├── zeichen/zeichen.ts            geändert: zeichenIndex, symboleFuerSchluessel
│   └── plan/
│       ├── schema.ts                 geändert: LAENGE, GRENZE (Feldgrenzen als Konstanten, Gesamtgrenze in Byte)
│       ├── operationen.ts            geändert: Stellen einfügen/ändern/löschen/umhängen, Optionen
│       ├── kontakte.ts               geändert: KONTAKT_NAME, setzeKontakt (feste Zeile je Art)
│       ├── verbindungen.ts           NEU: Nutzung, Reserve, anlegen/ändern/löschen, Kanäle
│       ├── einheiten.ts              NEU: Einheiten einfügen/ändern/löschen
│       └── einfuegen.ts              NEU: Parser „Liste einfügen" (Phase 3 ergänzt die Gliederung)
├── _ui/
│   ├── kommplan.css                  geändert: Editor, Griffe, Gleiten, reduzierte Bewegung
│   ├── betrachter/
│   │   ├── Flaeche.tsx               NEU "use client": Zoom, Verschieben, Pinch, Rad, Klick auf Karte, eingepasste Ansicht, Meldungsplatz
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
│       ├── KontaktZeilen.tsx         Kontakte im Flyin (ein festes Feld je Art)
│       ├── StellenLage.tsx           Untersteht/Lage (Umhängen)
│       ├── VerbindungWahl.tsx        Verbindung zur Elternstelle, Kanäle
│       ├── EinheitenListe.tsx        Einheiten im Flyin, „Liste einfügen"
│       └── PlanFlyin.tsx             Planangaben, Optionen, Verbindungen
e2e/kommplan-editor.spec.ts           NEU
```

Geändert außerhalb des Moduls: `src/core/audit/catalog.ts`, `src/core/audit/coverage-manifest.json`, `src/app/m/portal/admin/audit/labels.ts` (nur innerhalb der bestehenden kommplan-Zeile), `e2e/gruppen.json`, `docs/superpowers/specs/2026-09-30-modul-kommunikationsplaene-design.md` (§10), `src/app/m/portal/_lib/neuigkeiten/notizen/kommplan/2026-09-30-kommunikationsplaene-ansehen.ts` (nur Titel und Text, im Commit von Task 14).

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
 * Spec §10, wie es gilt (Umsetzungsplan Phase 2, Entscheidung 2) — unter der Vorbedingung von
 * `einfuegung()` (kein Kamm vorher wie nachher, gleiche Zeilen): Einfügen ändert kein y; die
 * früheren Geschwister in der Busgruppe der neuen Stelle und die früheren Gruppen ihrer Ebene
 * bleiben je UNTEREINANDER starr (gleiche relative Lage, `describe.each` oben). Absolut rückt dabei
 * durchaus etwas, das links steht: die Elternstelle steht mittig über ihrer Busspanne. Hier der
 * Fall über Gruppengrenzen: eine NEUE Kanalgruppe unter s14 (Seed 70) zentriert s14 neu, dadurch
 * wächst die linke Kontur der Gruppe von s14 unter s0, und das Gruppenpacken setzt diese Gruppe als
 * GANZES weiter rechts an — samt s12, das links der neuen Stelle steht. Zugesichert wird: kein y
 * ändert sich, die Zeichnung bleibt sauber (Eltern mittig über der Busspanne, keine Überlappung,
 * keine Kreuzung), die früheren Gruppen unter s0 bleiben untereinander starr, und die frühere
 * Gruppe von s14 rückt starr, also mit EINEM gemeinsamen dx.
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
    Busspanne, Aufteilung deckt jede Stelle genau einmal ab. Einfügen einer Stelle ändert — solange
    dadurch keine Gruppe als Kamm umbricht und Zeilenhöhen und Ebenenlücken gleich bleiben — kein
    y; die früheren Geschwister in ihrer Busgruppe und die früheren Gruppen ihrer Ebene bleiben
    jeweils untereinander starr (gleiche relative Lage). Als Ganzes kann eine Gruppe rücken, weil
    die Elternstelle mittig über ihrer Busspanne steht — eine neue Kanalgruppe zentriert die
    Elternstelle neu, und deren Gruppe rückt gegen die früheren Gruppen. Bricht eine Gruppe als
    Kamm um oder wächst eine Lücke, ordnet sich zu Recht mehr neu.
```

Der Satz „verschiebt nichts links von ihr" verschwindet ganz, auch eingeschränkt (Entscheidung 2: selbst innerhalb einer Busgruppe rücken frühere Geschwister absolut, nachgerechnet in 6 von 29 wirksamen Fällen der Variante „ende").

- [ ] **Step 4: Ganze Datei und Typecheck**

Run: `pnpm vitest run src/app/m/kommplan/_lib/layout/eigenschaften.test.ts && pnpm typecheck; echo "typecheck exit $?"`
Expected: PASS, kein `it.fails` mehr in der Datei (`grep -c "it.fails" src/app/m/kommplan/_lib/layout/eigenschaften.test.ts` → 0), typecheck exit 0.

- [ ] **Step 5: Commit**

```bash
git add docs/superpowers/specs/2026-09-30-modul-kommunikationsplaene-design.md src/app/m/kommplan/_lib/layout/eigenschaften.test.ts
git commit -S -m "test(kommplan): Einfüge-Eigenschaft ehrlich formuliert

Zugesichert ist — ohne Kamm und bei gleichen Zeilen — Starrheit der
früheren Geschwister und Gruppen untereinander und kein geändertes y,
nicht „nichts links rückt“: eine neue Kanalgruppe zentriert die
Elternstelle neu, deren Gruppe rückt als Ganzes. Spec §10 sagt das
jetzt; das it.fails ist ein regulärer Test.

DRK-500

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Feldgrenzen und Stellen-Operationen (einfügen, ändern, löschen, Optionen)

**Files:**
- Modify: `K/_lib/plan/schema.ts` (Konstanten `LAENGE`, `GRENZE`; Schema nutzt sie; Gesamtgrenze in Byte, Entscheidung 15)
- Modify: `K/_lib/plan/operationen.ts`
- Test: `K/_lib/plan/operationen.test.ts`, `K/_lib/plan/schema.test.ts`

**Interfaces:**
- Consumes: `planInhaltSchema`, `PlanInhalt`, `Stelle`, `Lage`, `PlanOptionen` (schema.ts), `baueBaum`, `nachkommen` (baum.ts), `anzeigereihenfolge` (`_lib/layout/gruppen.ts`, importiert nur Typen aus `plan/` — kein Zyklus).
- Produces (alle rein, Eingabe unverändert, Ausgabe gültig oder `PlanFehler`):
  - `LAENGE = { titel: 200, leiter: 120, kontakt: 200, typ: 40, rufname: 80, bezeichnung: 60 } as const`
  - `GRENZE = { stellen: 500, verbindungen: 200, kontakte: 30, einheiten: 60, kanaele: 12, bytes: 800_000 } as const`
  - `ZU_GROSS = "Der Plan ist zu groß zum Speichern. Teile ihn auf mehrere Pläne auf."` (Meldung der Gesamtgrenze; bewusst anders als der Netzfehler des Speicherers)
  - `inhaltBytes(inhalt: unknown): number` — UTF-8-Länge von `JSON.stringify(inhalt)`
  - `fuegeWurzelEin(inhalt: PlanInhalt, id: string): PlanInhalt`
  - `fuegeUnterstelleEin(inhalt: PlanInhalt, elternId: string, id: string): PlanInhalt`
  - `fuegeSeitenstelleEin(inhalt: PlanInhalt, elternId: string, seite: "links" | "rechts", id: string): PlanInhalt`
  - `type StellenAenderung = Partial<Pick<Stelle, "titel" | "leiter" | "hervorheben" | "zeichen" | "kontakte" | "kanaele" | "verbindungId">>`
  - `aendereStelle(inhalt: PlanInhalt, id: string, aenderung: StellenAenderung): PlanInhalt`
  - `loescheStelle(inhalt: PlanInhalt, id: string): { inhalt: PlanInhalt; entfernt: number }` (`entfernt` = Zahl der Stellen einschließlich der gelöschten selbst)
  - `setzeOptionen(inhalt: PlanInhalt, aenderung: Partial<Pick<PlanOptionen, "leerzeilen" | "vermerkVsNfD">>): PlanInhalt`
  - `stelleOder(inhalt: PlanInhalt, id: string): Stelle` (wirft `PlanFehler("Stelle … gibt es nicht")`)

- [ ] **Step 0: Größe messen (Entscheidung 15)**

Nur lesend, im Scratchpad. Gemessen wird dreierlei: der ungünstigste Plan nach den Feldgrenzen, die große Stab-Lage und der größte Seed-Plan. `zufallsPlan(…, { form: "stab" })` ist dafür **kein** Maß: `stellen` ist dort nur eine Obergrenze, der Plan hat bei Seed 4711 nur 75 Stellen (rund 40 KB).

```bash
pnpm exec tsx -e '
import { BEISPIELE } from "./src/app/m/kommplan/_lib/beispiele";
import { zufallsPlan } from "./src/app/m/kommplan/_lib/layout/zufall";
const b = (x: unknown) => new TextEncoder().encode(JSON.stringify(x)).length;
const ae = (n: number) => "Ä".repeat(n); // Umlaute: 2 Byte je Zeichen in UTF-8
const stelle = (i: number) => ({ id: `s-${String(i).padStart(8, "0")}`, eltern: i === 0 ? null : "s-00000000", lage: "unter", reihenfolge: i,
  zeichen: "rezept:D.1.4", titel: ae(200), leiter: ae(120), hervorheben: false, verbindungId: null,
  kanaele: Array.from({ length: 12 }, (_, k) => `v-${String(k).padStart(8, "0")}`),
  kontakte: Array.from({ length: 30 }, () => ({ art: "sonstiges", wert: ae(200) })),
  einheiten: Array.from({ length: 60 }, (_, k) => ({ id: `e-${i}-${k}`, typ: ae(40), rufname: ae(80), zeichen: "rezept:D.1.4" })) });
const worst = { schema: 1, optionen: { leerzeilen: true, vermerkVsNfD: true, qrAufDruck: false, schwarzweiss: false },
  verbindungen: Array.from({ length: 200 }, (_, k) => ({ id: `v-${String(k).padStart(8, "0")}`, art: "tmo", bezeichnung: ae(60) })),
  stellen: Array.from({ length: 500 }, (_, i) => stelle(i)) };
console.log("ungünstigster Plan", b(worst), "Byte; je Stelle", Math.round(b(stelle(1)) / 1000), "KB");
console.log("Stab-Lage 4711", b(zufallsPlan(4711, { stellen: 500, form: "stab" })), "Byte");
for (const x of BEISPIELE) console.log(x.id, b(x.inhalt), "Byte");'
```

Expected: ungünstigster Plan weit über 1 000 000 Byte (erwartet rund 18 MB mit Umlauten, rund 9 MB ohne), Stab-Lage und Seed-Pläne im Bereich weniger zehn KB. Die Zahlen in den Kopfkommentar von `speichern.ts` (Task 5, Platzhalter `<gemessen …>`) übernehmen. Liegt ein **Seed-Plan** über `GRENZE.bytes`, anhalten und melden — dann ist die Grenze falsch gewählt.

- [ ] **Step 1: Failing tests**

An `K/_lib/plan/schema.test.ts` anhängen (innerhalb der Datei, eigener `describe`):

```ts
import { GRENZE, inhaltBytes, LAENGE, ZU_GROSS } from "./schema";

describe("Feldgrenzen als Konstanten", () => {
  const basis = { schema: 1, optionen: { leerzeilen: false, vermerkVsNfD: true, qrAufDruck: false, schwarzweiss: false }, verbindungen: [] };
  const stelle = (id: string, titel: string, mehr: object = {}) => ({ id, eltern: null, lage: "unter", reihenfolge: 0, zeichen: null, titel, leiter: null,
    hervorheben: false, verbindungId: null, kanaele: [], kontakte: [], einheiten: [], ...mehr });
  it("das Schema weist genau jenseits der Grenze ab", () => {
    expect(planInhaltSchema.safeParse({ ...basis, stellen: [stelle("w", "x".repeat(LAENGE.titel))] }).success).toBe(true);
    expect(planInhaltSchema.safeParse({ ...basis, stellen: [stelle("w", "x".repeat(LAENGE.titel + 1))] }).success).toBe(false);
    expect(GRENZE.einheiten).toBe(60);
  });
  it("Gesamtgrenze in Byte (Entscheidung 15): ein Plan über 800 000 Byte ist ungültig, mit eigener Meldung", () => {
    // 60 Stellen mit je 30 vollen Kontakten aus Umlauten: rund 60 × 30 × 400 Byte ≈ 720 KB, dazu Einheiten → über der Grenze
    const voll = (i: number) => stelle(`s${i}`, "T", {
      reihenfolge: i,
      kontakte: Array.from({ length: GRENZE.kontakte }, () => ({ art: "sonstiges", wert: "Ä".repeat(LAENGE.kontakt) })),
      einheiten: Array.from({ length: 20 }, (_, k) => ({ id: `s${i}e${k}`, typ: "RTW", rufname: "Ü".repeat(LAENGE.rufname), zeichen: null })),
    });
    const gross = { ...basis, stellen: Array.from({ length: 60 }, (_, i) => voll(i)) };
    expect(inhaltBytes(gross)).toBeGreaterThan(GRENZE.bytes);
    const r = planInhaltSchema.safeParse(gross);
    expect(r.success).toBe(false);
    expect(r.error?.issues.map((i) => i.message)).toContain(ZU_GROSS);
    const klein = { ...gross, stellen: gross.stellen.slice(0, 10) };
    expect(planInhaltSchema.safeParse(klein).success).toBe(true);
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
/**
 * `bytes`: GESAMTGRENZE des Dokuments (Umsetzungsplan Phase 2, Entscheidung 15). Nach den Feldgrenzen
 * allein wären rund 9 MB möglich, eine Server Action nimmt aber höchstens 1 MB an — und ein
 * abgelehnter Aufruf sähe im Editor aus wie ein Netzfehler. 800 000 Byte UTF-8 lassen Luft für die
 * Kodierung des Aufrufs. Kosten: ein `JSON.stringify` je Prüfung, neben dem vollen `safeParse`.
 */
export const GRENZE = { stellen: 500, verbindungen: 200, kontakte: 30, einheiten: 60, kanaele: 12, bytes: 800_000 } as const;
export const ZU_GROSS = "Der Plan ist zu groß zum Speichern. Teile ihn auf mehrere Pläne auf.";
export const inhaltBytes = (inhalt: unknown): number => new TextEncoder().encode(JSON.stringify(inhalt)).length;
```

Hinter `pruefeInvarianten` die Größenprüfung einfügen und am Ende von `planInhaltSchema` anhängen (`….superRefine(pruefeInvarianten).superRefine(pruefeGroesse)`):

```ts
function pruefeGroesse(p: unknown, ctx: z.RefinementCtx): void {
  if (inhaltBytes(p) > GRENZE.bytes) ctx.addIssue({ code: "custom", path: [], message: ZU_GROSS });
}
```

Die Grenze gilt damit überall, wo das Schema gilt: in jeder Operation (`gueltig`), beim Speichern auf dem Server und beim Laden (`leseInhalt`) — kein heutiger Plan liegt auch nur in der Nähe (Step 0).

Dann die Zahlen im Schema durch die Konstanten ersetzen (gleiche Werte, gleiche Zeilen):
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
Konstanten für Schema und Eingabefelder, dazu eine Gesamtgrenze von
800 000 Byte unter dem Aufruflimit der Server Actions.

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
  - `haengeUm(inhalt: PlanInhalt, id: string, ziel: { eltern: string | null; lage: Lage }): PlanInhalt` (auf die oberste Ebene: `verbindungId` wird `null`)
  - `verbindungen.ts`: `interface Nutzung { eltern: number; kanal: number }`; `verbindungsNutzung(inhalt: PlanInhalt): Map<string, Nutzung>` (jede Verbindung des Plans hat einen Eintrag; die `verbindungId` einer Wurzel zählt nicht, wie in `legende()`); `istReserve(inhalt: PlanInhalt, id: string): boolean`; `legeVerbindungAn(inhalt: PlanInhalt, v: Verbindung): PlanInhalt`; `aendereVerbindung(inhalt: PlanInhalt, id: string, aenderung: Partial<Pick<Verbindung, "art" | "bezeichnung">>): PlanInhalt`; `loescheVerbindung(inhalt: PlanInhalt, id: string): PlanInhalt`; `findeVerbindung(inhalt: PlanInhalt, bezeichnung: string, art: VerbindungsArt): Verbindung | undefined` (Bezeichnung getrimmt, Groß-/Kleinschreibung egal).

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
  it("seitlich braucht eine Elternstelle; oberste Ebene heißt immer unter und hat keinen Weg nach oben", () => {
    expect(() => haengeUm(plan(), "a", { eltern: null, lage: "links" })).toThrow("Eine Seitenstelle braucht eine Elternstelle.");
    const p = haengeUm(plan(), "a", { eltern: null, lage: "unter" });
    // Die verbindungId einer Wurzel ist kein Weg (legende()); stehen bliebe sie als unsichtbare Nutzung.
    expect(stelleOder(p, "a")).toMatchObject({ eltern: null, lage: "unter", reihenfolge: 1, verbindungId: null });
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
  it("die verbindungId einer Wurzel ist kein Weg — Reserve und löschbar wie in legende() (Review Focus 4)", () => {
    const mitWurzelweg = baue({
      verbindungen: [{ id: "v9", art: "tmo", bezeichnung: "K_UE_9" }],
      stellen: [{ id: "w", titel: "Wurzel", verbindung: "v9" }],
    });
    expect(verbindungsNutzung(mitWurzelweg).get("v9")).toEqual({ eltern: 0, kanal: 0 });
    expect(istReserve(mitWurzelweg, "v9")).toBe(true);
    const ohne = loescheVerbindung(mitWurzelweg, "v9");
    expect(ohne.verbindungen).toEqual([]);
    expect(ohne.stellen[0].verbindungId).toBeNull(); // sonst verletzte der Rest die Invariante „Verbindung existiert"
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
  // Oberste Ebene: kein Weg nach oben — eine stehengebliebene verbindungId zählte sonst als Nutzung (Review Focus 4).
  const verbindungId = ziel.eltern === null ? null : s.verbindungId;
  return gueltig({ ...inhalt, stellen: inhalt.stellen.map((x) => (x.id === id ? { ...x, eltern: ziel.eltern, lage: ziel.lage, reihenfolge, verbindungId } : x)) });
}
```

`K/_lib/plan/verbindungen.ts`:

```ts
import { gueltig, PlanFehler } from "./operationen";
import type { PlanInhalt, Verbindung, VerbindungsArt } from "./schema";

/**
 * Die Verbindungen EINES Plans (Spec §4.2, §6.4). „Reserve" ist in der Legende, was weder Weg zur
 * Elternstelle (`verbindungId` einer Stelle MIT Elternstelle) noch Kanal einer Stelle (`kanaele`,
 * Phase-1-Abweichung 12) ist — dieselbe Regel wie `legende()` in `_lib/layout/zeichne.ts`, die die
 * `verbindungId` einer Wurzel ausdrücklich nicht als Weg zählt.
 */
export interface Nutzung { eltern: number; kanal: number }

export function verbindungsNutzung(inhalt: PlanInhalt): Map<string, Nutzung> {
  const n = new Map(inhalt.verbindungen.map((v) => [v.id, { eltern: 0, kanal: 0 }]));
  for (const s of inhalt.stellen) {
    if (s.eltern !== null && s.verbindungId !== null) n.get(s.verbindungId)!.eltern += 1;
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
  // Eine Wurzel darf die Verbindung noch tragen (kein Weg, s. oben) — dort wird sie mit gelöscht.
  return gueltig({
    ...inhalt,
    verbindungen: inhalt.verbindungen.filter((x) => x.id !== id),
    stellen: inhalt.stellen.map((s) => (s.verbindungId === id ? { ...s, verbindungId: null } : s)),
  });
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
  - `speichern.ts` (Server): `BEARBEITUNGSFENSTER_MS = 15 * 60 * 1000`; `interface Bearbeiter { nutzer: string; name: string }`; `merkeBearbeitung(db, planId, nutzer, jetzt: number): void`; `legePlanAn(db: KommplanDb, eingabe: unknown, wer: Bearbeiter, jetzt: number): AnlageErgebnis`; `speichereInhalt(db, eingabe: { id: string; version: number; inhalt: unknown }, wer, jetzt): SpeicherErgebnis`; `speichereAngaben(db, eingabe: { id: string; version: number; angaben: unknown }, wer, jetzt): SpeicherErgebnis`; `ladeStand(db, id: string): Speicherstand | null` (`null` = unbekannt oder archiviert; Entscheidung 21).
  - `plaene.ts`: `lies(zeile: PlanZeile)` exportiert; `GeladenerPlan` zusätzlich `version: number; angaben: Planangaben`.

- [ ] **Step 1: (entfällt — die Größe ist in Task 2, Step 0 gemessen und über `GRENZE.bytes` gedeckelt)**

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
import { BEARBEITUNGSFENSTER_MS, ladeStand, legePlanAn, speichereAngaben, speichereInhalt } from "./speichern";
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
  it("ladeStand liest Version, Inhalt und Angaben; unbekannt oder archiviert ist null (Entscheidung 21)", () => {
    const db = testDb();
    const id = angelegt(db);
    als(JANA, () => speichereInhalt(db, { id, version: 1, inhalt: fuegeWurzelEin(leererPlan(), "w") }, JANA, T0 + 1));
    expect(ladeStand(db, id)).toMatchObject({ version: 2, aktualisiertVon: "Jana Beispiel", angaben: { titel: "Übung" } });
    expect(ladeStand(db, "gibt-es-nicht")).toBeNull();
    db.update(plan).set({ archiviertAm: new Date(T0) }).where(eq(plan.id, id)).run();
    expect(ladeStand(db, id)).toBeNull();
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
 * GRÖSSE: nach den Feldgrenzen allein wäre ein Plan <gemessen: ungünstigster Plan> Byte groß, weit
 * über dem Aufruflimit der Server Actions von 1 MB; die große Stab-Lage hat <gemessen> Byte. Die
 * Gesamtgrenze `GRENZE.bytes` im Schema (`plan/schema.ts`) hält jedes gültige Dokument darunter —
 * `leseInhalt` weist Größeres hier genauso ab wie jede Operation im Editor.
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

/** Der Serverstand eines Plans — für den Konflikt und für die Prüfung beim Montieren des Editors (Entscheidung 21). */
export function ladeStand(db: Schreiber, id: string): Speicherstand | null {
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
    const s = ladeStand(tx, id);
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

Run: `pnpm vitest run src/app/m/kommplan src/core/audit src/app/m/portal/admin/audit/filters.test.ts && pnpm typecheck; echo "typecheck exit $?"`
Expected: PASS — auch `filters.test.ts` („names all audited objects": die neue Beschriftung `plan_bearbeitung` ist da, ein Tippfehler im Schlüssel fiele hier auf), `src/core/audit/catalog.test.ts` (Tabelle deklariert, Primärschlüssel `plan_id, nutzer`, WHEN von `plan` deckt genau die nicht ausgenommenen Spalten, `plan_bearbeitung` hat create/update/delete) und `K/_db/schema.test.ts`. typecheck exit 0.

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
  - `legePlanAnAction(eingabe: unknown): Promise<AnlageErgebnis>`; `speichereInhaltAction(eingabe: unknown): Promise<SpeicherErgebnis>`; `speichereAngabenAction(eingabe: unknown): Promise<SpeicherErgebnis>`; `ladeStandAction(id: unknown): Promise<Speicherstand | null>` (lesend, Entscheidung 21); `ladeZeichenAction(schluessel: unknown): Promise<Record<string, Symbolquelle>>`.
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
    const { ladeStandAction } = await import("./plan");
    await expect(ladeStandAction("x")).rejects.toThrow("Forbidden");
  });
  it("ladeStandAction liefert den Serverstand, unbekannt oder ungültig ist null", async () => {
    gruppen = ["iuk-kommplan-bearbeiten"];
    const { ladeStandAction, legePlanAnAction } = await import("./plan");
    const neu = await legePlanAnAction(ANGABEN);
    if (!neu.ok) throw new Error(neu.fehler);
    expect(await ladeStandAction(neu.id)).toMatchObject({ version: 1, angaben: { titel: "Übung" } });
    expect(await ladeStandAction("gibt-es-nicht")).toBeNull();
    expect(await ladeStandAction({ id: 5 })).toBeNull();
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
import type { AnlageErgebnis, SpeicherErgebnis, Speicherstand } from "../_lib/ergebnis";
import { ladeStand, legePlanAn, speichereAngaben, speichereInhalt } from "../_lib/speichern";
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

/** Lesend (Entscheidung 21): der Editor prüft beim Montieren, ob seine Props veraltet sind (Browser-Zurück). */
export async function ladeStandAction(id: unknown): Promise<Speicherstand | null> {
  await requireKommplanBearbeitenAktion();
  const r = kopf.shape.id.safeParse(id);
  return r.success ? ladeStand(getDb(), r.data) : null;
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
  "src/app/m/kommplan/_actions/plan.ts#ladeStandAction": { "kind": "excluded", "reason": "Liest nur Version, Inhalt und Angaben eines Plans, damit der Editor nach Browser-Zurück keinen veralteten Stand zeigt; schreibt nichts." },
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
Expected: PASS (auch `coverage.test.ts` mit den fünf neuen Einträgen), exit 0.

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
  it("auch das Datum: aria-invalid und aria-describedby zeigen auf den Fehlertext", async () => {
    aktion.legePlanAnAction.mockResolvedValue({ ok: false, fehler: "Bitte die markierten Felder prüfen.", feldFehler: { datum: "Diesen Tag gibt es nicht." } });
    await mount(<NeuerPlanFormular onAngelegt={() => {}} onAbbrechen={() => {}} />);
    await fill('input[name="titel"]', "X");
    await submitForm();
    await act(async () => {});
    // antd legt die id des DatePicker auf das <input>; der Greifer geht über die Beschriftung, nicht über eine antd-Klasse
    const datum = query<HTMLInputElement>(`#${CSS.escape(query("label[for$='-datum']").getAttribute("for")!)}`);
    expect(datum.getAttribute("aria-invalid")).toBe("true");
    expect(document.getElementById(datum.getAttribute("aria-describedby")!)?.textContent).toBe("Diesen Tag gibt es nicht.");
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
      {fehler && Object.keys(feldFehler).length === 0 ? <Alert type="warning" showIcon title={fehler} /> : null}
      <label className="kp-feldname" htmlFor={`${basis}-titel`}>Titel</label>
      <Input ref={titelRef} name="titel" value={titel} maxLength={LAENGE.titel} onChange={(e) => setTitel(e.target.value)} {...feld("titel")} />
      {fehlerText("titel")}
      <label className="kp-feldname" htmlFor={`${basis}-typ`}>Art</label>
      <Select id={`${basis}-typ`} value={typ} onChange={setTyp} options={PLAN_TYPEN.map((t) => ({ value: t, label: TYP_NAME[t] }))} />
      <label className="kp-feldname" htmlFor={`${basis}-anlass`}>Anlass</label>
      <Input name="anlass" value={anlass} maxLength={LAENGE_ANLASS} onChange={(e) => setAnlass(e.target.value)} {...feld("anlass")} />
      {fehlerText("anlass")}
      <label className="kp-feldname" htmlFor={`${basis}-datum`}>Datum</label>
      {/* feld() auch hier: aria-invalid UND aria-describedby auf den Fehlertext (docs/design/feedback-admin.md 4.4) */}
      <DatePicker {...feld("datum")} value={datum} onChange={setDatum} format="DD.MM.YYYY" onKeyDown={enterUebernimmtNurDasFeld}
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
   `<label>`, und (0,1,1) schlüge deren Ein-Klassen-Regeln — versal-graue Radioknöpfe (Falle 5).
   Die Knopfreihe bricht am KASTEN um (`auto-fit`/`minmax`), nicht am Fenster: ein Flyin ist auch
   auf breitem Schirm schmal (Falle 13). */
.kp-formular { display: grid; gap: 8px; }
.kp-feldname { font-size: 12px; font-weight: 600; letter-spacing: .06em; text-transform: uppercase; color: var(--kp-gedaempft); margin-top: 8px; }
.kp-feldfehler { margin: 0; font-size: 12px; color: var(--kp-gedaempft); }
.kp-formular-knoepfe { display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: 8px; margin-top: 16px; }
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
    expect(flaechenBefehl(t("F2"))).toEqual({ art: "oeffnen" }); // wie in Excel (Entscheidung 9)
    expect(flaechenBefehl(t("a"))).toBeNull(); // Tippen bearbeitet NICHT den Titel (Entscheidung 9)
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
 * - Andere druckbare Tasten bewusst ohne Wirkung (Entscheidung 9): §6.3 legt N als Befehl fest,
 *   „Tippen bearbeitet den Titel" machte N zur einzigen Ausnahme. F2 öffnet wie Enter.
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
  if (t.key === "Enter" || t.key === "F2") return { art: "oeffnen" };
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
  - `WARTEZEIT_MS = 1000`; `WIEDERHOLUNG_MS = [5_000, 15_000, 30_000, 60_000] as const` (danach jede Minute; Entscheidung 11)
  - `type SpeicherStatus = "gespeichert" | "ungespeichert" | "speichert" | "fehler" | "konflikt"`
  - `interface SpeicherZustand { status: SpeicherStatus; version: number; konflikt: Speicherstand | null; zuletztGespeichert: number | null; fehler: string | null }`
  - `interface Senden { inhalt(e: { id: string; version: number; inhalt: PlanInhalt }): Promise<SpeicherErgebnis>; angaben(e: { id: string; version: number; angaben: Planangaben }): Promise<SpeicherErgebnis> }`
  - `class Speicherer` mit `constructor(o: { planId: string; version: number; inhalt: PlanInhalt; senden: Senden; melde: (z: SpeicherZustand) => void; warte?: number })`, `get zustand(): SpeicherZustand`, `aendere(inhalt: PlanInhalt): void`, `angaben(a: Planangaben): Promise<SpeicherErgebnis>`, `jetzt(): Promise<boolean>`, `behalteMeine(): Promise<void>`, `uebernimm(stand: Speicherstand): void`, `erneut(): Promise<void>`, `hatUngespeichertes(): boolean`, `pruefeStand(stand: Speicherstand): "aktuell" | "uebernommen" | "konflikt"` (Entscheidung 21: Serverstand beim Montieren).

Kein React: die Editor-Insel hält eine Instanz (`useState(() => new Speicherer(…))`) und ruft `aendere` aus ihren Ereignis-Rückrufen — nicht aus einem Effekt (`set-state-in-effect`).

- [ ] **Step 1: Failing tests**

`K/_ui/editor/speicherer.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Planangaben } from "../../_lib/angaben";
import type { SpeicherErgebnis, Speicherstand } from "../../_lib/ergebnis";
import { fuegeWurzelEin, leererPlan } from "../../_lib/plan/operationen";
import type { PlanInhalt } from "../../_lib/plan/schema";
import { Speicherer, WARTEZEIT_MS, WIEDERHOLUNG_MS, type SpeicherZustand } from "./speicherer";

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
  it("„Meine Fassung behalten" sendet auch, wenn der Konflikt beim Speichern der Planangaben entstand", async () => {
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
  it("nach einem Wurf versucht er es selbst wieder: 5 s, 15 s, 30 s, dann jede Minute (Entscheidung 11)", async () => {
    const s = server();
    const { sp } = baueSpeicherer(s);
    s.senden.inhalt.mockRejectedValueOnce(new Error("offline")).mockRejectedValueOnce(new Error("offline")).mockRejectedValueOnce(new Error("offline"));
    sp.aendere(b);
    await vi.advanceTimersByTimeAsync(WARTEZEIT_MS);
    expect(s.senden.inhalt).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(WIEDERHOLUNG_MS[0] - 1);
    expect(s.senden.inhalt).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(s.senden.inhalt).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(WIEDERHOLUNG_MS[1]);
    expect(s.senden.inhalt).toHaveBeenCalledTimes(3);
    await vi.advanceTimersByTimeAsync(WIEDERHOLUNG_MS[2]);
    expect(s.senden.inhalt).toHaveBeenCalledTimes(4);
    expect(sp.zustand).toMatchObject({ status: "gespeichert", version: 2 });
    await vi.advanceTimersByTimeAsync(10 * 60_000);
    expect(s.senden.inhalt).toHaveBeenCalledTimes(4); // nach Erfolg kein weiterer Versuch
  });
  it("bei Konflikt und „weg“ kein Wiederholen", async () => {
    const s = server();
    const { sp } = baueSpeicherer(s);
    s.version = 5;
    sp.aendere(b);
    await vi.advanceTimersByTimeAsync(WARTEZEIT_MS + 10 * 60_000);
    expect(s.log).toEqual(["inhalt@1"]);
  });
  it("Serverstand beim Montieren (Entscheidung 21): gleich → aktuell; neuer und lokal nichts geändert → still übernommen; sonst Konflikt", () => {
    const s = server();
    const stand = (version: number): Speicherstand => ({ version, inhalt: c, angaben: ANGABEN, aktualisiertAm: 99, aktualisiertVon: "Jana" });
    expect(baueSpeicherer(s).sp.pruefeStand(stand(1))).toBe("aktuell");
    const still = baueSpeicherer(s).sp;
    expect(still.pruefeStand(stand(4))).toBe("uebernommen");
    expect(still.zustand).toMatchObject({ status: "gespeichert", version: 4, konflikt: null });
    const geaendert = baueSpeicherer(s).sp;
    geaendert.aendere(b);
    expect(geaendert.pruefeStand(stand(4))).toBe("konflikt");
    expect(geaendert.zustand).toMatchObject({ status: "konflikt", konflikt: { version: 4 } });
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
 * - Nach einem WURF (Netz weg, Sitzung abgelaufen) versucht er es selbst wieder, mit wachsendem
 *   Abstand (`WIEDERHOLUNG_MS`); Konflikt und „weg" wiederholen nie — dort entscheidet ein Mensch.
 */
export const WARTEZEIT_MS = 1000;
export const WIEDERHOLUNG_MS = [5_000, 15_000, 30_000, 60_000] as const;
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
  private versuche = 0;

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

  private planeSenden(warte: number = this.o.warte ?? WARTEZEIT_MS): void {
    this.abbrechen();
    this.timer = globalThis.setTimeout(() => { this.timer = null; void this.sendeInhalt(); }, warte);
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
        this.planeSenden(WIEDERHOLUNG_MS[Math.min(this.versuche, WIEDERHOLUNG_MS.length - 1)]);
        this.versuche += 1;
        return;
      }
      this.versuche = 0;
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

  /** „Erneut versuchen" und das Fensterereignis `online` (Editor): sofort, der Rückzug beginnt von vorn. */
  erneut(): Promise<void> {
    this.abbrechen();
    this.versuche = 0;
    return this.sendeInhalt();
  }

  /**
   * Entscheidung 21: Serverstand beim Montieren. Next zeigt nach Browser-Zurück die Seite aus dem
   * Client-Cache, die Props können also veraltet sein. Lokal unverändert → still übernehmen; lokal
   * schon geändert → derselbe Konflikt wie beim Speichern.
   */
  pruefeStand(s: Speicherstand): "aktuell" | "uebernommen" | "konflikt" {
    if (s.version <= this.stand.version) return "aktuell";
    if (!this.hatUngespeichertes() && this.stand.status !== "konflikt") { this.uebernimm(s); return "uebernommen"; }
    this.abbrechen();
    this.setze({ status: "konflikt", konflikt: s });
    return "konflikt";
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
gespeichert, nach einem Netzfehler von selbst mit wachsendem Abstand.

DRK-500

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 10: Gemeinsame Fläche und gleitendes Zeichnen (Betrachter umgebaut)

**Files:**
- Create: `K/_ui/betrachter/Flaeche.tsx`, `K/_ui/betrachter/Legende.tsx`, `K/_ui/betrachter/Umschalter.tsx`, `K/_ui/zeichnung/lage.ts`
- Modify: `K/_ui/betrachter/Betrachter.tsx`, `K/_ui/betrachter/ansicht.ts` (`einpassen` mit Optionen), `K/_ui/zeichnung/Zeichnung.tsx`, `K/_ui/zeichnung/Karte.tsx`, `K/_ui/zeichnung/Sechseck.tsx`, `K/_ui/kommplan.css`
- Test: `K/_ui/betrachter/Flaeche.test.tsx` (neu), `K/_ui/betrachter/ansicht.test.ts`, `K/_ui/betrachter/Betrachter.test.tsx` (unverändert grün), `K/_ui/zeichnung/Zeichnung.test.tsx`, `K/_ui/kommplan-css.test.ts` (neu)

**Interfaces:**
- Consumes: alles, was `Betrachter.tsx` heute nutzt (`ansicht.ts`, `umschalter.ts`, `layout`, `legende`, `SymbolDefs`, `ZeichnungInhalt`), `FLYIN_MAX_ANTEIL_PROZENT` (`@/core/theme/flyin`).
- Produces:
  - `einpassen(breiteMm, hoeheMm, vb, vh, o?: { rand?: number; seite?: number; unten?: number; max?: number })` — `rand` (Vorgabe 16) oben; `seite` (Vorgabe `rand`) links und rechts; `unten` (Vorgabe `rand`) Platz unter der Zeichnung; `max` (Vorgabe `GRENZEN.max`) Deckel des Maßstabs. Ohne Optionen genau das bisherige Verhalten.
  - `Flaeche(props)` (`"use client"`): `{ daten: Zeichnungsdaten; symbole: Symbolsatz; titel: string; schrift: string; bedienhinweis: string; leer: ReactNode; zusatz?: (k: KarteL) => ReactNode; ueberlagerung?: (a: Ansicht, flaeche: { breite: number; hoehe: number }) => ReactNode; meldung?: ReactNode; onTaste?: (e: KeyboardEvent<HTMLDivElement>) => boolean; onKarteKlick?: (id: string | null, doppelt: boolean) => void; gleitend?: boolean; linienSchluessel?: string; griff?: Ref<FlaecheGriff>; werkzeuge?: ReactNode; maxMassstab?: number; platzSeite?: number; platzUnten?: number; flyinGrund?: number | null }`
    - `maxMassstab`: Deckel der eingepassten Ansicht (Editor: `EDITOR_MASSSTAB = 4`, Entscheidung 18); `platzSeite`/`platzUnten`: Pixel links/rechts bzw. unter der Zeichnung beim Einpassen (Editor: `GRIFF_RAND` — Platz für die seitlichen „+" der Randkarten und die Griffleiste der untersten Karte; so liegen die Griffe jeder Karte schon eingepasst im Bild, und `zeige()` muss eine eingepasste Ansicht nie verschieben, Entscheidung 18); die Fläche trägt `data-eingepasst="true"|"false"` (für den e2e); `flyinGrund`: Grundbreite eines offenen Flyins ohne Maske (`520`) oder `null` — die Fläche rechnet daraus mit `FLYIN_MAX_ANTEIL_PROZENT` dieselbe `min(…)`-Breite wie `flyinBreite()` und zieht den verdeckten Teil ihrer eigenen Breite ab, beim Einpassen wie bei `zeige()`.
    - `meldung`: Hinweis unten mittig IN der Fläche (Entscheidung 19), auch beim leeren Plan.
  - `interface FlaecheGriff { fokus(): void; zeige(k: { x: number; y: number; breite: number; hoehe: number }, rand?: { oben: number; seite: number; unten: number }): void }` (`rand` in Pixeln, Vorgabe je 24; oben braucht der Editor nur 16 — über einer Karte steht kein Griff). `halte()` entfällt (Entscheidung 18).
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
  it("die Meldung steht in der Fläche — auch wenn der Plan leer ist (Entscheidung 19)", async () => {
    await mount(<Flaeche daten={layout(leererPlan(), "bildschirm")} symbole={{}} titel="T" schrift="Arimo" bedienhinweis="Hinweis"
      leer={<p>leer</p>} meldung={<span data-test-meldung="" />} />);
    expect(exists(".kp-betrachter [data-test-meldung]")).toBe(true);
  });
  it("fokus() setzt den Fokus auf die Fläche (Entscheidung 17)", async () => {
    const griff = createRef<FlaecheGriff>();
    await zeige({ griff });
    (document.activeElement as HTMLElement | null)?.blur();
    await act(async () => { griff.current!.fokus(); });
    expect(document.activeElement).toBe(query(".kp-betrachter"));
  });
  it("gleitend: die Ansicht trägt zusätzlich einen CSS-Transform; das Attribut bleibt (Phase-1-Tests lesen es)", async () => {
    await zeige({ gleitend: true });
    const g = query("[data-ansicht]");
    expect(g.getAttribute("transform")).toBe("translate(16 16) scale(4)");
    expect(g.style.transform).toBe("translate(16px, 16px) scale(4)");
    expect(g.getAttribute("class")).toBe("kp-gleitet"); // eingepasst = automatisch → gleitet
    // Normalisiert jsdom (cssstyle) den Wert anders, auf toContain("translate(16px") ausweichen — nie die Zusage streichen.
  });
});
```

Die Importe des Tests entsprechend ergänzen (`createRef` aus `react`, `exists` aus dem Harness, `leererPlan` aus `../../_lib/plan/operationen`, Typ `FlaecheGriff` aus `./Flaeche`).

An `K/_ui/betrachter/ansicht.test.ts` anhängen:

```ts
describe("einpassen mit Optionen (Entscheidung 18)", () => {
  it("ohne Optionen wie bisher; max deckelt den Maßstab, unten hält Platz frei", () => {
    expect(einpassen(200, 100, 1000, 600)).toEqual(einpassen(200, 100, 1000, 600, {}));
    const eine = einpassen(46, 20, 1000, 600, { max: 4 }); // eine einzelne Karte
    expect(eine.massstab).toBe(4);
    expect(eine.x).toBeCloseTo((1000 - 46 * 4) / 2, 6);
    const hoch = einpassen(100, 500, 1000, 600, { unten: 80 });
    expect(hoch.massstab).toBeCloseTo((600 - 16 - 80) / 500, 6);
    const breit = einpassen(1000, 100, 1000, 600, { seite: 84 });
    expect(breit.massstab).toBeCloseTo((1000 - 2 * 84) / 1000, 6);
    expect(breit.x).toBeCloseTo(84, 6);
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
Expected: FAIL — `Flaeche` fehlt, `ZeichnungInhalt` kennt `gleitend` nicht, die CSS-Regeln fehlen, `einpassen` kennt keine Optionen. `Betrachter.test.tsx` ist noch grün.

`einpassen` in `ansicht.ts` (Signatur ändern, Kommentar ergänzen: „`max` deckelt — der Editor will eine einzelne Karte nicht mit Maßstab 16 sehen; `unten` hält Platz für die Griffleiste der untersten Karte"):

```ts
export function einpassen(breiteMm: number, hoeheMm: number, vb: number, vh: number, o: { rand?: number; seite?: number; unten?: number; max?: number } = {}): Ansicht {
  const rand = o.rand ?? 16, seite = o.seite ?? rand, unten = o.unten ?? rand, max = o.max ?? GRENZEN.max;
  if (breiteMm <= 0 || hoeheMm <= 0 || vb <= 0 || vh <= 0) return { massstab: 4, x: rand, y: rand };
  const m = Math.min(max, Math.max(1e-3, Math.min((vb - 2 * seite) / breiteMm, (vh - rand - unten) / hoeheMm)));
  return { massstab: m, x: (vb - breiteMm * m) / 2, y: rand };
}
```

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
  // Sechseck-Schlüssel: Netz + Verbindung, dazu das n-te Vorkommen JE PAAR — nicht der globale Index,
  // sonst verschöbe ein neues Sechseck davor die Schlüssel aller späteren, die dann neu eingehängt
  // würden und sprängen statt zu gleiten. Das Paar ist fast immer eindeutig (`sammler.ts`: Kanäle
  // tragen das Netz `<stelle>#kanal`).
  const vorkommen = new Map<string, number>();
  const sechseckSchluessel = daten.sechsecke.map((s) => {
    const paar = `${s.netz}:${s.verbindungId}`;
    const n = vorkommen.get(paar) ?? 0;
    vorkommen.set(paar, n + 1);
    return `${paar}:${n}`;
  });
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
      {daten.sechsecke.map((s, i) => <Sechseck key={sechseckSchluessel[i]} s={s} gleitend={gleitend} />)}
      {daten.karten.map((k) => <Karte key={k.id} k={k} zusatz={zusatz} gleitend={gleitend} />)}
      {daten.einheiten.map((e) => <Einheit key={e.id} e={e} gleitend={gleitend} />)}
      {daten.abzeichen.map((a) => <Abzeichen key={a.stelleId} a={a} gleitend={gleitend} />)}
    </g>
  );
}
```

(Der Sechseck-Schlüssel hängt am Paar Netz + Verbindung, nicht am globalen Index — nur so bleibt ein Sechseck beim Einfügen an seiner Identität hängen und gleitet.)

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
import { FLYIN_MAX_ANTEIL_PROZENT } from "@/core/theme/flyin";
import type { KarteL, Zeichnungsdaten } from "../../_lib/layout/typen";
import { FARBE } from "../zeichnung/farben";
import { SymbolDefs, type Symbolsatz } from "../zeichnung/Symbole";
import { ZeichnungInhalt } from "../zeichnung/Zeichnung";
import { GRENZEN, SCHRITT, einpassen, tasteZuAktion, untergrenze, verschiebe, zoome, type Ansicht } from "./ansicht";

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
 * EINGEPASST BLEIBT EINGEPASST (Umsetzungsplan Phase 2, Entscheidung 18): `eigene === null` heißt
 * „eingepasst", und die Ansicht folgt jedem neuen Layout — gedeckelt auf `maxMassstab`, mit
 * `platzUnten` für die Griffleiste und ohne den Teil, den ein offenes Flyin verdeckt (`flyinGrund`,
 * dieselbe `min(…)`-Regel wie `flyinBreite()`). Erst Zoom, Verschieben, Rad oder Pinch der Nutzerin
 * machen eine eigene Ansicht daraus (`auto: false`); `zeige()` verschiebt automatisch (`auto: true`).
 * Automatische Wechsel gleiten im Editor (`kp-gleitet` am `[data-ansicht]`), eigene nie — sonst
 * hinkte die Zeichnung beim Ziehen dem Finger hinterher.
 */
export interface FlaecheGriff {
  /** Fokus auf die Fläche (Entscheidung 17): nach Flyin-Schließen, Löschen, „Erste Stelle anlegen". */
  fokus(): void;
  /** `rand`: Pixel Luft oben, seitlich und unten — der Editor gibt seitlich und unten mehr, damit auch die Griffe im Bild sind. */
  zeige(k: { x: number; y: number; breite: number; hoehe: number }, rand?: { oben: number; seite: number; unten: number }): void;
}
const KLICK_TOLERANZ = 5;
const DOPPEL_MS = 400;
const SICHTRAND = { oben: 24, seite: 24, unten: 24 };

export function Flaeche({
  daten, symbole, titel, schrift, bedienhinweis, leer, zusatz, ueberlagerung, meldung, onTaste, onKarteKlick,
  gleitend = false, linienSchluessel, griff, werkzeuge, maxMassstab = GRENZEN.max, platzSeite, platzUnten, flyinGrund = null,
}: {
  daten: Zeichnungsdaten; symbole: Symbolsatz; titel: string; schrift: string; bedienhinweis: string; leer: ReactNode;
  zusatz?: (k: KarteL) => ReactNode; ueberlagerung?: (a: Ansicht, flaeche: { breite: number; hoehe: number }) => ReactNode;
  meldung?: ReactNode;
  onTaste?: (e: KeyboardEvent<HTMLDivElement>) => boolean; onKarteKlick?: (id: string | null, doppelt: boolean) => void;
  gleitend?: boolean; linienSchluessel?: string; griff?: Ref<FlaecheGriff>; werkzeuge?: ReactNode;
  maxMassstab?: number; platzSeite?: number; platzUnten?: number; flyinGrund?: number | null;
}) {
  const flaeche = useRef<HTMLDivElement>(null);
  // Größe, linke Kante und Fensterbreite aus dem ResizeObserver-Rückruf (kein Messen im Rendern).
  const [groesse, setGroesse] = useState({ b: 0, h: 0, links: 0, fenster: 0 });
  const [eigene, setEigene] = useState<{ a: Ansicht; auto: boolean } | null>(null);
  const zeiger = useRef(new Map<number, { x: number; y: number }>());
  const start = useRef<{ x: number; y: number; karte: string | null; bewegt: boolean } | null>(null);
  const letzterKlick = useRef<{ karte: string | null; zeit: number } | null>(null);

  // Vom Flyin verdeckter Teil der Fläche, rechts (0 ohne Flyin oder ohne Messung).
  const flyinPx = flyinGrund === null || groesse.fenster === 0 ? 0 : Math.min(flyinGrund, groesse.fenster * FLYIN_MAX_ANTEIL_PROZENT / 100);
  const verdeckt = flyinPx === 0 ? 0 : Math.max(0, Math.min(groesse.b, groesse.links + groesse.b - (groesse.fenster - flyinPx)));
  const basis = einpassen(daten.breite, daten.hoehe, groesse.b - verdeckt, groesse.h, { max: maxMassstab, seite: platzSeite, unten: platzUnten });
  const a = eigene?.a ?? basis;
  const automatisch = eigene === null || eigene.auto;
  const lage = useRef({ basis, verdeckt });
  const untergrenzeJetzt = untergrenze(basis);
  useEffect(() => { lage.current = { basis, verdeckt }; });

  useImperativeHandle(griff, () => ({
    fokus: () => flaeche.current?.focus({ preventScroll: true }),
    zeige: (k, rand = SICHTRAND) => setEigene((alt) => {
      const jetzt = alt?.a ?? lage.current.basis;
      const el = flaeche.current;
      if (!el || el.clientWidth === 0) return alt;
      const m = jetzt.massstab, w = el.clientWidth - lage.current.verdeckt, h = el.clientHeight;
      const l = jetzt.x + k.x * m, o = jetzt.y + k.y * m, r = l + k.breite * m, u = o + k.hoehe * m;
      const dx = l < rand.seite ? rand.seite - l : r > w - rand.seite ? w - rand.seite - r : 0;
      const dy = o < rand.oben ? rand.oben - o : u > h - rand.unten ? h - rand.unten - u : 0;
      if (dx === 0 && dy === 0) return alt;
      return { a: verschiebe(jetzt, dx, dy), auto: true };
    }),
  }), []);

  useEffect(() => {
    const el = flaeche.current;
    if (!el || typeof ResizeObserver === "undefined") return; // jsdom kennt keinen ResizeObserver
    const beobachter = new ResizeObserver(([e]) => setGroesse({
      b: e.contentRect.width, h: e.contentRect.height, links: el.getBoundingClientRect().left, fenster: window.innerWidth,
    }));
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
        const jetzt = alt?.a ?? lage.current.basis;
        return {
          a: e.ctrlKey || e.metaKey
            ? zoome(jetzt, Math.exp(-e.deltaY / 300), e.clientX - r.left, e.clientY - r.top, untergrenze(lage.current.basis))
            : verschiebe(jetzt, -e.deltaX, -e.deltaY),
          auto: false,
        };
      });
    };
    el.addEventListener("wheel", rad, { passive: false });
    return () => el.removeEventListener("wheel", rad);
  }, []);

  /** Eigene Ansicht der Nutzerin (Zoom, Verschieben): gleitet nie. */
  const aendere = (f: (x: Ansicht) => Ansicht) => setEigene((alt) => ({ a: f(alt?.a ?? lage.current.basis), auto: false }));
  const zoomUmMitte = (faktor: number) => {
    const el = flaeche.current;
    aendere((x) => zoome(x, faktor, (el?.clientWidth ?? 0) / 2, (el?.clientHeight ?? 0) / 2, untergrenzeJetzt));
  };
  const ausgenommen = (ziel: EventTarget) => (ziel as Element).closest("[data-umschalter], [data-griff], [data-meldung]") !== null;

  const unten = (e: PointerEvent<HTMLDivElement>) => {
    if (ausgenommen(e.target)) return; // Umschalter, Griffe und Meldung beginnen kein Ziehen und keinen Klick
    e.currentTarget.setPointerCapture?.(e.pointerId);
    zeiger.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    start.current = zeiger.current.size === 1
      ? { x: e.clientX, y: e.clientY, karte: (e.target as Element).closest("[data-karte]")?.getAttribute("data-karte") ?? null, bewegt: false }
      : null; // zweiter Finger: kein Klick
  };
  const bewegt = (e: PointerEvent<HTMLDivElement>) => {
    const alt = zeiger.current.get(e.pointerId);
    if (!alt) return;
    const s = start.current;
    const warKlick = s !== null && !s.bewegt;
    if (s && Math.hypot(e.clientX - s.x, e.clientY - s.y) > KLICK_TOLERANZ) s.bewegt = true;
    const anderer = [...zeiger.current.entries()].find(([id]) => id !== e.pointerId)?.[1];
    if (anderer) {
      const vorher = Math.hypot(alt.x - anderer.x, alt.y - anderer.y);
      const jetzt = Math.hypot(e.clientX - anderer.x, e.clientY - anderer.y);
      const r = e.currentTarget.getBoundingClientRect();
      if (vorher > 0) aendere((x) => zoome(x, jetzt / vorher, (e.clientX + anderer.x) / 2 - r.left, (e.clientY + anderer.y) / 2 - r.top, untergrenzeJetzt));
    } else if (s === null || s.bewegt) {
      // Unter KLICK_TOLERANZ ist es noch ein Klick: die Ansicht bleibt (eingepasst bleibt eingepasst,
      // Entscheidung 18). Beim Überschreiten zählt die GANZE Strecke ab dem Druck — verschoben wird
      // also genau um die Zeigerbewegung (Betrachter.test.tsx, „um genau die Zeigerbewegung").
      const von = warKlick ? s! : alt;
      aendere((x) => verschiebe(x, e.clientX - von.x, e.clientY - von.y));
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

  const transform = `translate(${a.x} ${a.y}) scale(${a.massstab})`;
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
        data-eingepasst={eigene === null ? "true" : "false"}
        onPointerDown={unten} onPointerMove={bewegt} onPointerUp={los} onPointerCancel={los} onKeyDown={taste}>
        {daten.karten.length === 0 ? leer : (
          <svg role="img" aria-label={titel} style={{ fontFamily: schrift }}>
            {/* Das Attribut bleibt (Phase-1-Tests und e2e lesen es); im Editor setzt der CSS-Transform
                denselben Wert, damit automatische Wechsel per `transition` gleiten können. */}
            <g data-ansicht="" transform={transform}
              style={gleitend ? { transform: `translate(${a.x}px, ${a.y}px) scale(${a.massstab})` } : undefined}
              className={gleitend && automatisch ? "kp-gleitet" : undefined}>
              <rect width={daten.breite} height={daten.hoehe} fill={FARBE.papier} />
              <ZeichnungInhalt daten={daten} zusatz={zusatz} gleitend={gleitend} linienSchluessel={linienSchluessel} />
            </g>
          </svg>
        )}
        {ueberlagerung && daten.karten.length > 0
          ? <div className="kp-ueberlagerung">{ueberlagerung(a, { breite: groesse.b - verdeckt, hoehe: groesse.h })}</div>
          : null}
        {meldung ? <div className="kp-meldungsplatz" data-meldung="">{meldung}</div> : null}
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
/* Hinweise des Editors IN der Fläche, unten mittig (Entscheidung 19): kein Umbruch des Flusses,
   die Fläche springt nicht, wenn ein Hinweis kommt oder geht. Nur der Hinweis selbst fängt Zeiger. */
.kp-meldungsplatz { position: absolute; left: 50%; bottom: 12px; transform: translateX(-50%); width: min(560px, calc(100% - 24px)); pointer-events: none; }
.kp-meldungsplatz > * { pointer-events: auto; }
```

Die bisherige Sonderzeile `gleitet` der Ansicht braucht keine eigene Regel: `[data-ansicht]` trägt im Editor dieselbe Klasse `kp-gleitet` wie die Karten und damit auch deren Zweig für reduzierte Bewegung.

- [ ] **Step 5: Grün sehen**

Run: `pnpm vitest run src/app/m/kommplan && pnpm typecheck; echo "typecheck exit $?"`
Expected: PASS — insbesondere `Betrachter.test.tsx` **unverändert**, `Blatt.test.tsx` (Druck ohne `gleitend`), `grenze.test.ts` (`lage.ts` liegt in `_ui/zeichnung/`: kein `"use client"`, kein `next/*`), exit 0.

Run: `pnpm exec playwright test e2e/kommplan.spec.ts` (Phase-1-e2e: Betrachter, Einklappen, Zoom — Load vorher prüfen)
Expected: 6 passed.

- [ ] **Step 6: Ankerschritt und Commit**

Ankerschritt für `Betrachter.tsx`, `ansicht.ts`, `Zeichnung.tsx`, `Karte.tsx`, `Sechseck.tsx`, `kommplan.css`.

```bash
git add src/app/m/kommplan/_ui
git commit -S -m "refactor(kommplan): Zeichenfläche aus dem Betrachter gelöst, Zeichnung kann gleiten

Die Fläche meldet Klicks auf Karten trotz Pointer-Capture und bleibt
eingepasst, bis selbst gezoomt wird; im Editor gleiten Karten per CSS,
ohne Bewegung bei prefers-reduced-motion.

DRK-500

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 11: Flyin einer Stelle, Teil 1 — Titel, Leiter, Hervorheben, Zeichen, Kontakte, Löschen

**Files:**
- Create: `K/_ui/editor/aendere.ts`, `K/_ui/editor/StelleFlyin.tsx`, `K/_ui/editor/ZeichenWahl.tsx`, `K/_ui/editor/KontaktZeilen.tsx`
- Modify: `K/_lib/plan/kontakte.ts` (`KONTAKT_NAME`, feste Zeilen je Art), `K/_ui/kommplan.css`
- Test: `K/_ui/editor/StelleFlyin.test.tsx`, `K/_lib/plan/kontakte.test.ts`

**Interfaces:**
- Consumes: `aendereStelle`, `StellenAenderung`, `LAENGE`, `GRENZE`, `KONTAKT_REIHENFOLGE` (Tasks 2, 3), `sucheZeichen`, `leseZuletzt`, `merkeZuletzt` (Task 8), `symbolId`, `Symbolsatz`, `ZeichenIndexEintrag`, `flyinBreite`.
- Produces:
  - `aendere.ts`: `type Aendere = (op: (p: PlanInhalt) => PlanInhalt, schluessel?: string) => string | null` — `null` heißt angewandt, sonst die Meldung des `PlanFehler` (die Editor-Insel zeigt sie zusätzlich als Hinweis in der Fläche).
  - `kontakte.ts` (rein, Entscheidung 16): `KONTAKT_NAME: Record<KontaktArt, string>`; `interface KontaktFeld { art: KontaktArt; n: number; wert: string; vorhanden: boolean }` (`n` = n-tes Vorkommen dieser Art); `kontaktFelder(kontakte): KontaktFeld[]` (je Art mindestens ein Feld, Reihenfolge der Karte); `setzeKontakt(kontakte, art, n, wert): Kontakt[]`; `weitererKontakt(kontakte, art): Kontakt[]`; `entferneKontakt(kontakte, art, n): Kontakt[]`.
  - `StelleFlyin(props: StelleFormularProps & { offen: boolean; onSchliessen: () => void; nachSchliessen: () => void })` (Drawer, `mask={false}`, `flyinBreite(STELLE_FLYIN_GRUND)`, `STELLE_FLYIN_GRUND = 520` exportiert — die Fläche rechnet mit derselben Zahl, Entscheidung 18) und `StelleFormular(props: StelleFormularProps)` mit `interface StelleFormularProps { inhalt: PlanInhalt; stelleId: string; aendere: Aendere; symbole: Symbolsatz; zeichenIndex: readonly ZeichenIndexEintrag[]; ladeSymbole: (schluessel: string[]) => void; fokus: { ziel: "titel" | "einheit"; stelle: string | null; n: number }; titelRef: RefObject<InputRef | null>; onLoeschen: () => void; onFertig: () => void }` (`onFertig`: Enter im Titelfeld, Entscheidung 17).
  - `ZeichenWahl({ wert, index, symbole, ladeSymbole, planZeichen, onWahl })` (Enter wählt den ersten Treffer, ↓ springt ins Raster); `KontaktZeilen({ kontakte, onAendere }: { kontakte: readonly Kontakt[]; onAendere: (neu: Kontakt[], schluessel?: string) => void })`.

- [ ] **Step 1: Failing tests**

An `K/_lib/plan/kontakte.test.ts` anhängen:

```ts
import { entferneKontakt, KONTAKT_NAME, kontaktFelder, setzeKontakt, weitererKontakt } from "./kontakte";
import { KONTAKT_ARTEN } from "./schema";

describe("Namen der Kontaktarten", () => {
  it("jede Art hat einen deutschen Namen", () => {
    expect(KONTAKT_ARTEN.map((a) => KONTAKT_NAME[a])).toEqual(["Funkrufname", "Digitalfunk", "Telefon", "Mobil", "Fax", "E-Mail", "Sonstiges"]);
  });
});

describe("Kontakte als feste Zeilen je Art (Entscheidung 16)", () => {
  const k = [{ art: "email" as const, wert: "ea1@drk.de" }, { art: "funkrufname" as const, wert: "RK UE 40-00" }];
  it("je Art mindestens ein Feld, in der Reihenfolge der Karte; Doppelte als weitere Felder derselben Art", () => {
    expect(kontaktFelder(k).map((f) => `${f.art}:${f.n}=${f.wert}`)).toEqual([
      "funkrufname:0=RK UE 40-00", "digitalfunk:0=", "telefon:0=", "mobil:0=", "fax:0=", "email:0=ea1@drk.de", "sonstiges:0=",
    ]);
    const doppelt = weitererKontakt(k, "email");
    expect(kontaktFelder(doppelt).filter((f) => f.art === "email").map((f) => [f.n, f.wert, f.vorhanden])).toEqual([[0, "ea1@drk.de", true], [1, "", true]]);
    // ohne Eintrag dieser Art gibt es schon ein (leeres) Feld: nichts anzulegen
    expect(weitererKontakt(k, "telefon")).toBe(k);
  });
  it("Tippen in ein leeres Feld legt an, Leeren des einzigen Eintrags entfernt, sonst wird ersetzt", () => {
    expect(setzeKontakt(k, "telefon", 0, "0581 1")).toEqual([...k, { art: "telefon", wert: "0581 1" }]);
    expect(setzeKontakt(k, "telefon", 0, "")).toBe(k); // leeres Feld bleibt leer: keine Änderung
    expect(setzeKontakt(k, "email", 0, "")).toEqual([k[1]]);
    expect(setzeKontakt(k, "email", 0, "neu@drk.de")).toEqual([{ art: "email", wert: "neu@drk.de" }, k[1]]);
    // bei Doppelten wird ein geleertes Feld nicht entfernt (sonst rutschte das nächste in dieses Feld)
    const doppelt = [...k, { art: "email" as const, wert: "zwei@drk.de" }];
    expect(setzeKontakt(doppelt, "email", 0, "")).toEqual([{ art: "email", wert: "" }, k[1], doppelt[2]]);
    expect(entferneKontakt(doppelt, "email", 1)).toEqual(k);
  });
});
```

`K/_ui/editor/StelleFlyin.test.tsx`:

```tsx
// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, createRef, useState, type RefObject } from "react";
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
const fertig = vi.fn();
// Modulweit, nicht als Vorgabe im Parameter: ein neues Objekt je Rendern löste die Fokus-Effekte bei jeder Eingabe aus.
const FOKUS0 = { ziel: "titel" as const, stelle: "a", n: 0 };
const REF0 = createRef<InputRef>();
function Rahmen({ fokus = FOKUS0, titelRef = REF0 }: { fokus?: { ziel: "titel" | "einheit"; stelle: string | null; n: number }; titelRef?: RefObject<InputRef | null> }) {
  const [inhalt, setInhalt] = useState(START);
  const aendere: Aendere = (op) => {
    try { const neu = op(inhalt); setInhalt(neu); stand = neu; return null; }
    catch (e) { if (e instanceof PlanFehler) return e.message; throw e; }
  };
  return <StelleFormular inhalt={inhalt} stelleId="a" aendere={aendere} symbole={{}} zeichenIndex={INDEX} ladeSymbole={lade}
    fokus={fokus} titelRef={titelRef} onLoeschen={loesche} onFertig={fertig} />;
}
const stelle = () => stand.stellen.find((s) => s.id === "a")!;
const knopf = (text: string) => queryAll<HTMLButtonElement>("button").find((b) => b.textContent === text)!;
async function druecke(el: Element, key: string) {
  await act(async () => { el.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true })); });
}

afterEach(() => { unmount(); stand = START; lade.mockReset(); loesche.mockReset(); fertig.mockReset(); window.localStorage.clear(); });

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
  it("Zeichen: Enter im Suchfeld wählt den ersten Treffer, ↓ springt ins Raster", async () => {
    await mount(<Rahmen />);
    await fill('input[aria-label="Zeichen suchen"]', "e");
    await druecke(query('input[aria-label="Zeichen suchen"]'), "ArrowDown");
    expect(document.activeElement).toBe(queryAll("[data-zeichen]")[0]);
    await fill('input[aria-label="Zeichen suchen"]', "lösch");
    await druecke(query('input[aria-label="Zeichen suchen"]'), "Enter");
    expect(stelle().zeichen).toBe("rezept:C.1.1");
  });
  it("Enter im Titelfeld heißt „fertig“ (Entscheidung 17)", async () => {
    await mount(<Rahmen />);
    await druecke(query('input[name="titel"]'), "Enter");
    expect(fertig).toHaveBeenCalledTimes(1);
  });
  it("Kontakte: ein festes Feld je Art in der Reihenfolge der Karte — Tippen legt an, Leeren entfernt (Entscheidung 16)", async () => {
    await mount(<Rahmen />);
    const felder = () => queryAll<HTMLInputElement>("[data-kontakt] input");
    const namen = () => queryAll("[data-kontakt] .kp-feldname").map((l) => l.textContent);
    expect(namen()).toEqual(["Funkrufname", "Digitalfunk", "Telefon", "Mobil", "Fax", "E-Mail", "Sonstiges"]);
    expect(felder().map((i) => i.value)).toEqual(["RK UE 40-00", "", "", "", "", "ea1@drk.de", ""]);
    // DOM-Reihenfolge = Tab-Reihenfolge: ein Kontakt kostet Tippen plus Tab, keine Auswahl, kein Knopf
    await fill('[data-kontakt="telefon:0"] input', "0581 1");
    expect(stelle().kontakte).toContainEqual({ art: "telefon", wert: "0581 1" });
    await fill('[data-kontakt="email:0"] input', "");
    expect(stelle().kontakte.map((k) => k.art).sort()).toEqual(["funkrufname", "telefon"]);
    expect(felder()).toHaveLength(7); // das E-Mail-Feld bleibt stehen, jetzt leer
  });
  it("Kontakte: „Weiterer Kontakt“ legt eine zweite Zeile derselben Art an (Fokus hinein), sie hat „Entfernen“", async () => {
    await mount(<Rahmen />);
    await clickElement(knopf("Weiterer Kontakt")); // Art vorbelegt: Telefon; noch keins da → nur Fokus ins leere Feld
    expect(document.activeElement).toBe(query('[data-kontakt="telefon:0"] input'));
    expect(stelle().kontakte.some((k) => k.art === "telefon")).toBe(false);
    await fill('[data-kontakt="telefon:0"] input', "0581 1");
    await clickElement(knopf("Weiterer Kontakt"));
    expect(document.activeElement).toBe(query('[data-kontakt="telefon:1"] input'));
    await fill('[data-kontakt="telefon:1"] input', "0581 2");
    expect(stelle().kontakte.filter((k) => k.art === "telefon").map((k) => k.wert)).toEqual(["0581 1", "0581 2"]);
    await clickElement(query('button[aria-label="Telefon 2 entfernen"]'));
    expect(stelle().kontakte.filter((k) => k.art === "telefon").map((k) => k.wert)).toEqual(["0581 1"]);
  });
  it("Löschen meldet sich beim Editor (Rückgängig statt Nachfrage)", async () => {
    await mount(<Rahmen />);
    await clickElement(knopf("Stelle löschen"));
    expect(loesche).toHaveBeenCalledTimes(1);
  });
  it("eine neue Fokusanfrage setzt den Fokus ins Titelfeld", async () => {
    const titelRef = createRef<InputRef>();
    await mount(<Rahmen titelRef={titelRef} fokus={{ ziel: "titel", stelle: "a", n: 0 }} />);
    (document.activeElement as HTMLElement | null)?.blur();
    await rerender(<Rahmen titelRef={titelRef} fokus={{ ziel: "titel", stelle: "a", n: 1 }} />);
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

/**
 * FESTE ZEILEN JE ART im Flyin (Umsetzungsplan Phase 2, Entscheidung 16) — wie die Excel-Karte eine
 * Zeile je Art hat. Ein Feld ist (Art, n): das n-te Vorkommen dieser Art im Array. Jede Art hat
 * mindestens ein Feld; ohne Eintrag ist es leer (`vorhanden: false`). Das Datenmodell (§4.2) bleibt:
 * ein leeres Feld IST „kein Kontakt dieser Art", die Karte lässt leere Werte ohnehin weg.
 */
export interface KontaktFeld { art: KontaktArt; n: number; wert: string; vorhanden: boolean }

const stellenDerArt = (kontakte: readonly Kontakt[], art: KontaktArt) =>
  kontakte.flatMap((k, i) => (k.art === art ? [i] : []));

export function kontaktFelder(kontakte: readonly Kontakt[]): KontaktFeld[] {
  return KONTAKT_REIHENFOLGE.flatMap((art) => {
    const eigene = kontakte.filter((k) => k.art === art);
    return eigene.length === 0
      ? [{ art, n: 0, wert: "", vorhanden: false }]
      : eigene.map((k, n) => ({ art, n, wert: k.wert, vorhanden: true }));
  });
}

/**
 * Tippen in ein leeres Feld legt an; Leeren des EINZIGEN Eintrags einer Art entfernt ihn (das Feld
 * bleibt als leeres stehen, der Fokus also auch). Bei Doppelten bleibt ein geleerter Eintrag als
 * leerer stehen — sonst rutschte der nächste in dieses Feld, mitten beim Tippen.
 */
export function setzeKontakt(kontakte: readonly Kontakt[], art: KontaktArt, n: number, wert: string): Kontakt[] {
  const idx = stellenDerArt(kontakte, art);
  if (n >= idx.length) return wert === "" ? (kontakte as Kontakt[]) : [...kontakte, { art, wert }];
  if (wert === "" && idx.length === 1) return kontakte.filter((_, i) => i !== idx[0]);
  return kontakte.map((k, i) => (i === idx[n] ? { ...k, wert } : k));
}

/** „Weiterer Kontakt": nur wenn es von der Art schon einen gibt — sonst ist das leere Feld schon da. */
export function weitererKontakt(kontakte: readonly Kontakt[], art: KontaktArt): Kontakt[] {
  return stellenDerArt(kontakte, art).length === 0 ? (kontakte as Kontakt[]) : [...kontakte, { art, wert: "" }];
}

export function entferneKontakt(kontakte: readonly Kontakt[], art: KontaktArt, n: number): Kontakt[] {
  const i = stellenDerArt(kontakte, art)[n];
  return i === undefined ? (kontakte as Kontakt[]) : kontakte.filter((_, j) => j !== i);
}
```

(Die Rückgabe desselben Objekts bei „nichts zu tun" ist Absicht: `tue()` in `verlauf.ts` und der Speicherer werten „dasselbe Objekt" als „keine Änderung". Der Aufrufer reicht es über `aendereStelle`; dort entsteht zwar ein neues Dokument — deshalb prüft `KontaktZeilen` vorher `neu === kontakte` und ruft dann gar nicht erst `onAendere`.)

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

import { useId, useMemo, useRef, useState } from "react";
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
  const raster = useRef<HTMLDivElement>(null);
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
      {/* Enter wählt den ersten Treffer (leere Anfrage: den ersten Vorschlag), ↓ springt ins Raster (Kritik: sonst Tab für Tab). */}
      <Input aria-label="Zeichen suchen" aria-describedby={`${basis}-jetzt`} value={anfrage} onChange={(e) => suche(e.target.value)} placeholder="z. B. Einsatzleitung, Rettungswagen, D.1.4" allowClear
        onPressEnter={(e) => { e.preventDefault(); const erster = anfrage.trim() === "" ? vorschlaege[0] : treffer[0]?.schluessel; if (erster) waehle(erster); }}
        onKeyDown={(e) => { if (e.key === "ArrowDown") { e.preventDefault(); raster.current?.querySelector<HTMLButtonElement>("[data-zeichen]")?.focus(); } }} />
      {anfrage.trim() === "" && vorschlaege.length > 0 ? (
        <><p className="kp-hilfe">Zuletzt genutzt</p><div className="kp-zeichen-raster" ref={raster}>{vorschlaege.map(knopf)}</div></>
      ) : null}
      {anfrage.trim() !== "" ? (
        treffer.length > 0 ? <div className="kp-zeichen-raster" ref={raster} aria-live="polite">{treffer.map((e) => knopf(e.schluessel))}</div>
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

import { useEffect, useId, useRef, useState } from "react";
import { Button, Input, Select, type InputRef } from "antd";
import { entferneKontakt, KONTAKT_NAME, KONTAKT_REIHENFOLGE, kontaktFelder, setzeKontakt, weitererKontakt } from "../../_lib/plan/kontakte";
import { GRENZE, LAENGE, type Kontakt, type KontaktArt } from "../../_lib/plan/schema";

const ARTEN = KONTAKT_REIHENFOLGE.map((a) => ({ value: a, label: KONTAKT_NAME[a] }));

/**
 * KONTAKTE (Spec §4.2, §6.4; Umsetzungsplan Phase 2, Entscheidung 16): ein festes Feld je Art in der
 * Reihenfolge der Karte — Tippen plus Tab statt „Art wählen, hinzufügen, hineinklicken". Leer heißt
 * „kein Kontakt dieser Art" (`setzeKontakt`). Doppelte über „Weiterer Kontakt" am Ende, damit die
 * Tab-Folge durch die sieben Felder nicht von Knöpfen unterbrochen wird.
 *
 * SCHLÜSSEL: React-`key` und Rückgängig-Bündel hängen an (Art, n), nie am Array-Index — sonst verlöre
 * ein Feld beim Leeren und Neutippen den Fokus, und Tippen zerfiele in mehrere Rückgängig-Schritte.
 */
export function KontaktZeilen({ kontakte, onAendere }: { kontakte: readonly Kontakt[]; onAendere: (neu: Kontakt[], schluessel?: string) => void }) {
  const basis = useId();
  const [weitereArt, setWeitereArt] = useState<KontaktArt>("telefon");
  const [fokusAuf, setFokusAuf] = useState<{ feld: string; n: number } | null>(null);
  const felderRef = useRef(new Map<string, InputRef | null>());
  // Fokus nach „Weiterer Kontakt" — nur Fokus, kein setState (set-state-in-effect).
  useEffect(() => { if (fokusAuf) felderRef.current.get(fokusAuf.feld)?.focus(); }, [fokusAuf]);
  const felder = kontaktFelder(kontakte);
  const voll = kontakte.length >= GRENZE.kontakte;
  const aendere = (neu: Kontakt[], schluessel?: string) => { if (neu !== kontakte) onAendere(neu, schluessel); };

  return (
    <fieldset className="kp-abschnitt">
      <legend>Kontakte</legend>
      {felder.map((f) => {
        const feld = `${f.art}:${f.n}`;
        const name = f.n === 0 ? KONTAKT_NAME[f.art] : `${KONTAKT_NAME[f.art]} ${f.n + 1}`;
        return (
          <div key={feld} className="kp-kontakt" data-kontakt={feld}>
            <label className="kp-feldname" htmlFor={`${basis}-${feld}`}>{name}</label>
            <div className="kp-zeile">
              <Input id={`${basis}-${feld}`} ref={(el) => { felderRef.current.set(feld, el); }} value={f.wert} maxLength={LAENGE.kontakt}
                disabled={!f.vorhanden && voll}
                onChange={(e) => aendere(setzeKontakt(kontakte, f.art, f.n, e.target.value), `kontakt:${feld}`)} />
              {f.n > 0 ? <Button aria-label={`${name} entfernen`} onClick={() => aendere(entferneKontakt(kontakte, f.art, f.n))}>Entfernen</Button> : null}
            </div>
          </div>
        );
      })}
      <div className="kp-zeile">
        <Select aria-label="Art des weiteren Kontakts" value={weitereArt} onChange={(a: KontaktArt) => setWeitereArt(a)} options={ARTEN} />
        <Button disabled={voll} onClick={() => {
          const n = kontakte.filter((k) => k.art === weitereArt).length;
          aendere(weitererKontakt(kontakte, weitereArt));
          setFokusAuf((alt) => ({ feld: `${weitereArt}:${Math.max(0, n)}`, n: (alt?.n ?? 0) + 1 }));
        }}>Weiterer Kontakt</Button>
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
  fokus: { ziel: "titel" | "einheit"; stelle: string | null; n: number }; titelRef: RefObject<InputRef | null>; onLoeschen: () => void;
  /** Enter im Titelfeld: „fertig" — der Editor schließt das Flyin und gibt der Fläche den Fokus (Entscheidung 17). */
  onFertig: () => void;
}

/** Grundbreite des Flyins; die Fläche rechnet mit derselben Zahl den verdeckten Teil heraus (Entscheidung 18). */
export const STELLE_FLYIN_GRUND = 520;

/**
 * DAS FLYIN EINER STELLE (Spec §6.2, §6.4): rechts, `flyinBreite()` (Falle 13), OHNE Maske — die
 * Zeichnung bleibt klickbar, ein Klick auf eine andere Karte wechselt die Stelle im offenen Flyin.
 * Jede Eingabe wirkt sofort auf das Dokument (Autosave, Rückgängig); es gibt kein „Speichern".
 * `nachSchliessen` läuft NACH der Schließ-Animation: erst dann gibt der Editor der Fläche den Fokus,
 * sonst holte eine Fokus-Rückgabe der Schublade ihn danach wieder weg.
 */
export function StelleFlyin({ offen, onSchliessen, nachSchliessen, ...formular }: StelleFormularProps & { offen: boolean; onSchliessen: () => void; nachSchliessen: () => void }) {
  const s = formular.inhalt.stellen.find((x) => x.id === formular.stelleId);
  return (
    <Drawer open={offen} onClose={onSchliessen} mask={false} size={flyinBreite(STELLE_FLYIN_GRUND)} destroyOnHidden rootClassName="kp-flyin"
      title={s ? (s.titel.trim() || "Neue Stelle") : "Stelle"}
      afterOpenChange={(auf) => { if (auf && formular.fokus.ziel === "titel" && formular.fokus.stelle === formular.stelleId) formular.titelRef.current?.focus(); else if (!auf) nachSchliessen(); }}>
      {offen ? <StelleFormular {...formular} /> : null}
    </Drawer>
  );
}

export function StelleFormular(p: StelleFormularProps) {
  const { inhalt, stelleId, aendere, fokus, titelRef } = p;
  const basis = useId();
  // Fokusanfrage des Editors (neue Stelle, Enter): auch bei schon offenem Flyin, daher über `fokus.n`.
  // Sie nennt ihre Stelle: eine alte Anfrage gilt nach einem Wechsel der Auswahl nicht für die neue.
  useEffect(() => { if (fokus.ziel === "titel" && fokus.stelle === stelleId) titelRef.current?.focus(); }, [fokus, titelRef, stelleId]);
  const s = inhalt.stellen.find((x) => x.id === stelleId);
  if (!s) return <p className="kp-hilfe">Diese Stelle gibt es nicht mehr.</p>;
  const setze = (teil: StellenAenderung, schluessel?: string) => aendere((q) => aendereStelle(q, s.id, teil), schluessel);
  const planZeichen = [...new Set(inhalt.stellen.map((x) => x.zeichen).filter((z): z is string => z !== null))];

  return (
    <div className="kp-formular" data-flyin-stelle={s.id}>
      <label className="kp-feldname" htmlFor={`${basis}-titel`}>Titel</label>
      <Input id={`${basis}-titel`} ref={titelRef} name="titel" value={s.titel} maxLength={LAENGE.titel}
        onChange={(e) => setze({ titel: e.target.value }, `titel:${s.id}`)}
        onPressEnter={(e) => { e.preventDefault(); p.onFertig(); }} />
      <label className="kp-feldname" htmlFor={`${basis}-leiter`}>Leiter</label>
      <Input id={`${basis}-leiter`} name="leiter" value={s.leiter ?? ""} maxLength={LAENGE.leiter}
        onChange={(e) => setze({ leiter: e.target.value === "" ? null : e.target.value }, `leiter:${s.id}`)} />
      <Checkbox className="kp-hervorheben" checked={s.hervorheben} onChange={(e) => setze({ hervorheben: e.target.checked })}>Hervorheben</Checkbox>

      {/* key={s.id} an den Abschnitten mit eigenem Zustand: das Flyin bleibt beim Wechsel der Auswahl
          dieselbe Instanz — ohne key wanderten Suchanfrage, offene Listen und Fehlermeldungen zur
          nächsten Stelle mit (Review Focus 7). NICHT das ganze Formular keyen: dessen Fokus-Effekt
          zöge sonst bei jeder Pfeiltasten-Auswahl den Fokus ins Titelfeld. */}
      <fieldset className="kp-abschnitt">
        <legend>Zeichen</legend>
        <ZeichenWahl key={s.id} wert={s.zeichen} index={p.zeichenIndex} symbole={p.symbole} ladeSymbole={p.ladeSymbole}
          planZeichen={planZeichen} onWahl={(k) => setze({ zeichen: k })} />
      </fieldset>

      <KontaktZeilen key={s.id} kontakte={s.kontakte} onAendere={(neu, sch) => setze({ kontakte: neu }, sch ? `${sch}:${s.id}` : undefined)} />

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
.kp-kontakt { display: grid; gap: 4px; }
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
Expected: PASS, exit 0. Findet der Kontakt-Test das Feld nicht, weil antd das `<input>` anders schachtelt: den Greifer über die Beschriftung führen (`label[for]` → `#id`) — nie über eine antd-Klasse.

- [ ] **Step 5: Ankerschritt und Commit**

Ankerschritt für `kontakte.ts` und `kommplan.css`.

```bash
git add src/app/m/kommplan/_ui/editor src/app/m/kommplan/_lib/plan/kontakte.ts src/app/m/kommplan/_lib/plan/kontakte.test.ts src/app/m/kommplan/_ui/kommplan.css
git commit -S -m "feat(kommplan): Flyin einer Stelle mit Titel, Leiter, Zeichen-Suche und Kontakten

Jede Eingabe wirkt sofort aufs Dokument; Kontakte haben ein festes Feld
je Art in der Reihenfolge der Karte, zuletzt genutzte Zeichen oben,
Enter im Titel heißt fertig.

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
- Produces: `StellenLage({ inhalt, stelle, aendere })`, `VerbindungWahl({ inhalt, stelle, aendere })`, `EinheitenListe({ inhalt, stelle, aendere, fokus })` — je `stelle: Stelle`, `aendere: Aendere`, `fokus: { ziel: "titel" | "einheit"; stelle: string | null; n: number }`.

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
  it("neue Verbindung per Tastatur: Fokus im Feld, Enter legt an; die Art ist die zuletzt angelegte", async () => {
    await mount(<Rahmen />);
    await clickElement(knopf("Neue Verbindung"));
    const feld = query<HTMLInputElement>('input[aria-label="Bezeichnung der neuen Verbindung"]');
    expect(document.activeElement).toBe(feld);
    await fill('input[aria-label="Bezeichnung der neuen Verbindung"]', "R_UE_4");
    await druecke(feld, "Enter");
    expect(stand.verbindungen.at(-1)).toMatchObject({ bezeichnung: "R_UE_4", art: "tmo" }); // wie v1, die letzte
    expect(stelle().verbindungId).toBe(stand.verbindungen.at(-1)!.id);
  });
  it("Wechsel der Stelle bei offenem Flyin: offene Liste, Entwurf und Fehler der vorigen Stelle sind weg (Review Focus 7)", async () => {
    await mount(<Rahmen stelleId="a" />);
    await clickElement(knopf("Liste einfügen"));
    await fill('textarea[aria-label="Einheiten, je Zeile eine"]', `KTW ${"R".repeat(81)}`);
    await clickElement(knopf("Übernehmen"));
    expect(document.body.textContent).toContain("Zeile 1: Der Rufname ist länger als 80 Zeichen.");
    await clickElement(knopf("Neue Verbindung"));
    await rerender(<Rahmen stelleId="b" />);
    expect(queryAll("textarea")).toHaveLength(0);
    expect(document.body.textContent).not.toContain("Zeile 1: Der Rufname");
    expect(queryAll('input[aria-label="Bezeichnung der neuen Verbindung"]')).toHaveLength(0);
  });
  it("eine „+ Einheit“-Anfrage für a zieht nach dem Wechsel zu b den Fokus nicht in b's Typ-Feld", async () => {
    const mitEinheit = baue({ stellen: [{ id: "el", titel: "EL" }, { id: "a", titel: "A", eltern: "el", einheiten: ["RTW 1"] }, { id: "b", titel: "B", eltern: "el", einheiten: ["KTW 2"] }] });
    const anfrage = { ziel: "einheit" as const, stelle: "a", n: 1 };
    await mount(<Rahmen start={mitEinheit} stelleId="a" fokus={anfrage} />);
    expect(document.activeElement).toBe(query('input[aria-label="Einheit 1: Typ"]'));
    (document.activeElement as HTMLElement).blur();
    await rerender(<Rahmen start={mitEinheit} stelleId="b" fokus={anfrage} />);
    expect(document.activeElement).not.toBe(query('input[aria-label="Einheit 1: Typ"]'));
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
  it("Liste einfügen per Tastatur: Fokus in der Textarea, Strg/Cmd+Enter übernimmt, danach Fokus auf „Liste einfügen“", async () => {
    await mount(<Rahmen />);
    await clickElement(knopf("Liste einfügen"));
    const ta = query<HTMLTextAreaElement>('textarea[aria-label="Einheiten, je Zeile eine"]');
    expect(document.activeElement).toBe(ta);
    await fill('textarea[aria-label="Einheiten, je Zeile eine"]', "KTW RK 2");
    await act(async () => { ta.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", ctrlKey: true, bubbles: true, cancelable: true })); });
    expect(stelle().einheiten.map((e) => e.typ)).toEqual(["RTW", "KTW"]);
    expect(document.activeElement).toBe(knopf("Liste einfügen"));
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
  // Vorbelegt mit der Art der zuletzt angelegten Verbindung: in einem Plan sind es meist dieselben (Kritik).
  const [art, setArt] = useState<VerbindungsArt>(() => inhalt.verbindungen.at(-1)?.art ?? "tmo");
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
              {/* autoFocus + Enter: „neu eintippen" (§6.4) ist ein Feld, keine Klickstrecke (Kritik) */}
              <Input autoFocus aria-label="Bezeichnung der neuen Verbindung" value={bezeichnung} maxLength={LAENGE.bezeichnung} onChange={(e) => setBezeichnung(e.target.value)} placeholder="z. B. R_UE_2"
                onPressEnter={(e) => { e.preventDefault(); if (bezeichnung.trim() !== "") verbindeNeu(); }} />
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
  inhalt: PlanInhalt; stelle: Stelle; aendere: Aendere; fokus: { ziel: "titel" | "einheit"; stelle: string | null; n: number };
}) {
  const [liste, setListe] = useState<string | null>(null);
  const [fehler, setFehler] = useState<string[]>([]);
  const [lokal, setLokal] = useState(0);
  const letzterTyp = useRef<InputRef>(null);
  const listeKnopf = useRef<HTMLButtonElement>(null);
  // Zwei getrennte Anfragen: die des Editors („+ Einheit" am Griff) und die eigene („+ Einheit" hier).
  // Zusammengelegt stähle eine spätere Titel-Anfrage des Editors den Fokus, sobald `lokal > 0` ist.
  // Nur für DIESE Stelle: der Abschnitt ist per key an die Stelle gebunden und montiert beim Wechsel
  // der Auswahl neu — eine noch stehende „+ Einheit"-Anfrage der vorigen Stelle zöge sonst den Fokus
  // in das Typ-Feld der neuen (und bräche die Tastaturschleife, Entscheidung 17).
  useEffect(() => { if (fokus.ziel === "einheit" && fokus.stelle === stelle.id) letzterTyp.current?.focus(); }, [fokus, stelle.id]);
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
    listeKnopf.current?.focus(); // der Fokus ginge mit der Textarea sonst verloren
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
        <Button ref={listeKnopf} onClick={() => { setListe(liste === null ? "" : null); setFehler([]); }}>{liste === null ? "Liste einfügen" : "Liste schließen"}</Button>
      </div>
      {liste !== null ? (
        <>
          {/* autoFocus: direkt einfügen können; Strg/Cmd+Enter übernimmt (Kritik) */}
          <Input.TextArea autoFocus aria-label="Einheiten, je Zeile eine" aria-keyshortcuts="Control+Enter Meta+Enter" value={liste}
            onChange={(e) => setListe(e.target.value)} autoSize={{ minRows: 4, maxRows: 12 }}
            onKeyDown={(e) => { if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); uebernimm(); } }}
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
      <StellenLage key={s.id} inhalt={inhalt} stelle={s} aendere={aendere} />
      <VerbindungWahl key={s.id} inhalt={inhalt} stelle={s} aendere={aendere} />
      <EinheitenListe key={s.id} inhalt={inhalt} stelle={s} aendere={aendere} fokus={fokus} />
```

(Importe ergänzen. `key={s.id}` wie bei Zeichen und Kontakten: lokaler Zustand gehört zur Stelle, nicht zur Flyin-Instanz — Review Focus 7.)

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
- Produces:
  - `PLAN_FLYIN_GRUND = 560` (die Fläche rechnet mit derselben Zahl, Entscheidung 18).
  - `PlanFlyin({ offen, onSchliessen, nachSchliessen, abschnitt, ...props })` — `abschnitt: "angaben" | "verbindungen"` (Entscheidung 20: „Verbindungen bearbeiten" öffnet am Abschnitt Verbindungen).
  - `PlanFormular(props: PlanFormularProps)` mit `interface PlanFormularProps { angaben: Planangaben; inhalt: PlanInhalt; aendere: Aendere; speichereAngaben: (a: Planangaben) => Promise<SpeicherErgebnis>; onEntwurf: (offen: boolean) => void }` — `onEntwurf(true)`, sobald ein Angaben-Feld vom gespeicherten Stand abweicht, `false` nach dem Speichern (der Editor hält damit `beforeunload` auf, Entscheidung 11).

Planangaben speichern sich selbst (Entscheidung 3): Textfelder beim Verlassen und mit Enter, Art und Datum sofort bei der Wahl. Unverändertes wird nie gesendet (Review Focus 6). Schließt das Flyin, während ein Feld den Fokus hat, verlässt der Fokus das Feld (der Editor setzt ihn auf die Fläche, Entscheidung 17) — damit wird gespeichert, bevor das Formular verschwindet.

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
const entwurf = vi.fn();
function Rahmen() {
  const [inhalt, setInhalt] = useState(START);
  const aendere: Aendere = (op) => {
    try { const neu = op(inhalt); setInhalt(neu); stand = neu; return null; }
    catch (e) { if (e instanceof PlanFehler) return e.message; throw e; }
  };
  return <PlanFormular angaben={ANGABEN} inhalt={inhalt} aendere={aendere} speichereAngaben={speichere} onEntwurf={entwurf} />;
}
const knopf = (text: string) => queryAll<HTMLButtonElement>("button").find((b) => b.textContent === text)!;
const zeile = (id: string) => query(`[data-verbindung-zeile="${id}"]`);
/** Feld betreten, Wert setzen, Feld verlassen — so, wie der Browser es tut. */
async function tippeUndVerlasse(selector: string, wert: string) {
  const el = query<HTMLInputElement>(selector);
  await act(async () => { el.focus(); });
  await fill(selector, wert);
  await act(async () => { el.blur(); });
  await act(async () => {});
}
async function druecke(el: Element, key: string) {
  await act(async () => { el.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true })); });
  await act(async () => {});
}
afterEach(() => { unmount(); stand = START; speichere.mockReset(); entwurf.mockReset(); });

describe("Plan-Flyin", () => {
  it("Planangaben speichern sich beim Verlassen des Felds — kein „Übernehmen“ (Entscheidung 3)", async () => {
    speichere.mockResolvedValue({ ok: true, version: 2, aktualisiertAm: 1 });
    await mount(<Rahmen />);
    expect(queryAll("button").some((b) => b.textContent === "Übernehmen")).toBe(false);
    await tippeUndVerlasse('input[name="anlass"]', "Probe");
    expect(speichere).toHaveBeenCalledWith({ titel: "Übung", typ: "kommunikationsplan", anlass: "Probe", datum: "2026-09-30" });
    expect(entwurf).toHaveBeenCalledWith(true);
    expect(entwurf).toHaveBeenLastCalledWith(false);
  });
  it("Enter im Textfeld speichert ebenfalls", async () => {
    speichere.mockResolvedValue({ ok: true, version: 2, aktualisiertAm: 1 });
    await mount(<Rahmen />);
    await fill('input[name="titel"]', "Übung Nord");
    await druecke(query('input[name="titel"]'), "Enter");
    expect(speichere).toHaveBeenCalledWith(expect.objectContaining({ titel: "Übung Nord" }));
  });
  it("Unverändertes wird nie gesendet — auch nicht beim Verlassen (Review Focus 6: Seed-Pläne bleiben unberührt)", async () => {
    await mount(<Rahmen />);
    await tippeUndVerlasse('input[name="titel"]', "Übung");
    await tippeUndVerlasse('input[name="anlass"]', "  ");
    expect(speichere).not.toHaveBeenCalled();
  });
  it("Feldfehler stehen am Feld: aria-invalid und aria-describedby zeigen auf den Text", async () => {
    speichere.mockResolvedValue({ ok: false, grund: "ungueltig", fehler: "Bitte die markierten Felder prüfen.", feldFehler: { titel: "Bitte einen Titel eintragen." } });
    await mount(<Rahmen />);
    await tippeUndVerlasse('input[name="titel"]', "  ");
    const titel = query('input[name="titel"]');
    expect(titel.getAttribute("aria-invalid")).toBe("true");
    expect(document.getElementById(titel.getAttribute("aria-describedby")!)?.textContent).toBe("Bitte einen Titel eintragen.");
    expect(entwurf).not.toHaveBeenLastCalledWith(false); // der Entwurf ist nicht gespeichert
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
  it("neue Verbindung anlegen — per Knopf oder Enter; sie ist zunächst Reserve", async () => {
    await mount(<Rahmen />);
    await fill('input[aria-label="Bezeichnung der neuen Verbindung"]', "Standleitung");
    await clickElement(knopf("Verbindung anlegen"));
    expect(stand.verbindungen.at(-1)).toMatchObject({ bezeichnung: "Standleitung", art: "tmo" });
    await fill('input[aria-label="Bezeichnung der neuen Verbindung"]', "Reserve 2");
    await druecke(query('input[aria-label="Bezeichnung der neuen Verbindung"]'), "Enter");
    expect(stand.verbindungen.at(-1)).toMatchObject({ bezeichnung: "Reserve 2" });
    expect(queryAll(".kp-chip").map((c) => c.textContent)).toEqual(["Reserve", "Reserve", "Reserve"]);
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

import { useId, useRef, useState } from "react";
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

export const PLAN_FLYIN_GRUND = 560;
export interface PlanFormularProps {
  angaben: Planangaben; inhalt: PlanInhalt; aendere: Aendere;
  speichereAngaben: (a: Planangaben) => Promise<SpeicherErgebnis>; onEntwurf: (offen: boolean) => void;
}

/**
 * DAS FLYIN DES PLANS (Entscheidungen 3, 20): Planangaben sind Spalten und speichern sich selbst —
 * beim Verlassen eines Textfelds, mit Enter, bei Art und Datum sofort (eigene Action, je Speichern
 * eine Audit-Zeile); Optionen und Verbindungen sind Dokument und wirken sofort. Ohne Maske wie das
 * Flyin der Stelle; `nachSchliessen` läuft nach der Schließ-Animation (Fokus auf die Fläche).
 */
export function PlanFlyin({ offen, onSchliessen, nachSchliessen, abschnitt, ...p }: PlanFormularProps & {
  offen: boolean; onSchliessen: () => void; nachSchliessen: () => void; abschnitt: "angaben" | "verbindungen";
}) {
  return (
    <Drawer open={offen} onClose={onSchliessen} mask={false} size={flyinBreite(PLAN_FLYIN_GRUND)} destroyOnHidden rootClassName="kp-flyin"
      title="Plan und Verbindungen"
      afterOpenChange={(auf) => {
        if (!auf) { nachSchliessen(); return; }
        if (abschnitt === "verbindungen") document.querySelector('[data-abschnitt="verbindungen"]')?.scrollIntoView({ block: "start" });
      }}>
      {offen ? <PlanFormular {...p} /> : null}
    </Drawer>
  );
}

export function PlanFormular({ angaben, inhalt, aendere, speichereAngaben, onEntwurf }: PlanFormularProps) {
  return (
    <div className="kp-formular">
      <Angaben angaben={angaben} speichereAngaben={speichereAngaben} onEntwurf={onEntwurf} />
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

interface Entwurf { titel: string; typ: PlanTyp; anlass: string; datum: string | null }
/** Wie `angabenSchema` vergleicht: getrimmt, leerer Anlass = null. So wird Unverändertes nie gesendet (Review Focus 6). */
const gleich = (a: Entwurf, b: Planangaben) =>
  a.titel.trim() === b.titel && a.typ === b.typ && (a.anlass.trim() || null) === b.anlass && a.datum === b.datum;

function Angaben({ angaben, speichereAngaben, onEntwurf }: Pick<PlanFormularProps, "angaben" | "speichereAngaben" | "onEntwurf">) {
  const basis = useId();
  const [titel, setTitel] = useState(angaben.titel);
  const [typ, setTyp] = useState<PlanTyp>(angaben.typ);
  const [anlass, setAnlass] = useState(angaben.anlass ?? "");
  const [datum, setDatum] = useState<Dayjs | null>(angaben.datum ? dayjs(angaben.datum) : null);
  const [feldFehler, setFeldFehler] = useState<FeldFehler>({});
  const [meldung, setMeldung] = useState<string | null>(null);
  /** Zuletzt gespeicherter Stand — gesät aus den Props; der Editor keyt diese Komponente neu, wenn die Angaben von außen kommen. */
  const gespeichert = useRef(angaben);
  const entwurf = (): Entwurf => ({ titel, typ, anlass, datum: datum ? datum.format("YYYY-MM-DD") : null });

  const sende = (e: Entwurf) => {
    if (gleich(e, gespeichert.current)) { setFeldFehler({}); onEntwurf(false); return; }
    setMeldung(null);
    void speichereAngaben(e as unknown as Planangaben) // der Server trimmt und macht aus leerem Anlass null (`angabenSchema`)
      .then((r) => {
        if (r.ok) { gespeichert.current = { titel: e.titel.trim(), typ: e.typ, anlass: e.anlass.trim() || null, datum: e.datum }; setFeldFehler({}); onEntwurf(false); }
        else if (r.grund === "ungueltig") setFeldFehler(r.feldFehler ?? {});
        else if (r.grund === "konflikt") setMeldung("Nicht gespeichert: der Plan wurde inzwischen geändert. Entscheide oben, welche Fassung gilt.");
        else setMeldung("Diesen Plan gibt es nicht mehr, oder er wurde archiviert.");
      })
      .catch(() => setMeldung("Nicht gespeichert — prüfe die Verbindung und ob du noch angemeldet bist."));
  };
  const geaendert = () => onEntwurf(true);
  // Dasselbe Paar wie in `NeuerPlan` (docs/design/feedback-admin.md 4.4): aria-invalid UND aria-describedby.
  const feld = (name: string) => ({
    id: `${basis}-${name}`, "aria-invalid": feldFehler[name] ? true : undefined,
    "aria-describedby": feldFehler[name] ? `${basis}-${name}-fehler` : undefined,
  });
  const fehlerText = (name: string) => (feldFehler[name] ? <p id={`${basis}-${name}-fehler`} className="kp-feldfehler">{feldFehler[name]}</p> : null);

  return (
    <fieldset className="kp-abschnitt" aria-label="Planangaben">
      <legend>Planangaben</legend>
      <label className="kp-feldname" htmlFor={`${basis}-titel`}>Titel</label>
      <Input name="titel" value={titel} maxLength={LAENGE.titel} {...feld("titel")}
        onChange={(e) => { setTitel(e.target.value); geaendert(); }} onBlur={() => sende(entwurf())}
        onPressEnter={(e) => { e.preventDefault(); sende(entwurf()); }} />
      {fehlerText("titel")}
      <label className="kp-feldname" htmlFor={`${basis}-typ`}>Art</label>
      <Select id={`${basis}-typ`} value={typ} options={PLAN_TYPEN.map((t) => ({ value: t, label: TYP_NAME[t] }))}
        onChange={(v: PlanTyp) => { setTyp(v); sende({ ...entwurf(), typ: v }); }} />
      <label className="kp-feldname" htmlFor={`${basis}-anlass`}>Anlass</label>
      <Input name="anlass" value={anlass} maxLength={LAENGE_ANLASS} {...feld("anlass")}
        onChange={(e) => { setAnlass(e.target.value); geaendert(); }} onBlur={() => sende(entwurf())}
        onPressEnter={(e) => { e.preventDefault(); sende(entwurf()); }} />
      {fehlerText("anlass")}
      <label className="kp-feldname" htmlFor={`${basis}-datum`}>Datum</label>
      <DatePicker {...feld("datum")} value={datum} format="DD.MM.YYYY" onKeyDown={enterUebernimmtNurDasFeld}
        status={feldFehler.datum ? "error" : undefined}
        onChange={(d: Dayjs | null) => { setDatum(d); sende({ ...entwurf(), datum: d ? d.format("YYYY-MM-DD") : null }); }} />
      {fehlerText("datum")}
      {meldung ? <Alert type="warning" showIcon title={meldung} /> : null}
    </fieldset>
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
  const [art, setArt] = useState<VerbindungsArt>(() => inhalt.verbindungen.at(-1)?.art ?? "tmo");
  const [fehler, setFehler] = useState<string | null>(null);
  const nutzung = verbindungsNutzung(inhalt);
  const ARTEN = VERBINDUNGS_ARTEN.map((a) => ({ value: a, label: ART_NAME[a] }));

  const umbenennen = (id: string, wert: string) => {
    setEntwurf((e) => ({ ...e, [id]: wert }));
    if (wert.trim() !== "") aendere((p) => aendereVerbindung(p, id, { bezeichnung: wert }), `verbindung:${id}`);
  };
  const anlegen = () => {
    if (bezeichnung.trim() === "") return;
    const f = aendere((p) => legeVerbindungAn(p, { id: neueId(p, "v"), art, bezeichnung }));
    setFehler(f);
    if (f === null) setBezeichnung("");
  };

  return (
    <fieldset className="kp-abschnitt" data-abschnitt="verbindungen">
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
        <Input aria-label="Bezeichnung der neuen Verbindung" value={bezeichnung} maxLength={LAENGE.bezeichnung} onChange={(e) => setBezeichnung(e.target.value)} placeholder="z. B. K_UE_2"
          onPressEnter={(e) => { e.preventDefault(); anlegen(); }} />
        <Select aria-label="Art der neuen Verbindung" value={art} onChange={(a: VerbindungsArt) => setArt(a)} options={ARTEN} />
        <Button onClick={anlegen} disabled={bezeichnung.trim() === ""}>Verbindung anlegen</Button>
      </div>
      {fehler ? <p className="kp-feldfehler" role="status">{fehler}</p> : null}
    </fieldset>
  );
}
```

Das `as unknown as Planangaben` beim Senden ist nötig, weil `anlass` hier eine Zeichenkette ist (der Server macht aus leer `null`, `angabenSchema`). Falls `pnpm lint` den unbenutzten Namen `_weg` meldet, stattdessen `const rest = { ...e }; delete rest[v.id]; return rest;`. Das Ref `gespeichert` wird nur in Ereignis- und Versprechens-Rückrufen geschrieben, nie im Rendern (React Compiler).

In `K/_ui/kommplan.css` anhängen:

```css
.kp-schalter { display: flex; align-items: center; gap: 8px; min-height: 44px; }
.kp-verbindung { display: grid; gap: 4px; padding-bottom: 8px; border-bottom: 1px dashed var(--kp-rand); }
```

- [ ] **Step 4: Grün sehen**

Run: `pnpm vitest run src/app/m/kommplan && pnpm typecheck; echo "typecheck exit $?"`
Expected: PASS, exit 0. Scheitert `tippeUndVerlasse`, weil jsdom beim `blur()` kein `focusout` schickt, das React als `onBlur` liest: zusätzlich `el.dispatchEvent(new FocusEvent("focusout", { bubbles: true }))` im selben `act` — nicht die Zusage „speichert beim Verlassen" aufgeben.

- [ ] **Step 5: Commit**

```bash
git add src/app/m/kommplan/_ui/editor/PlanFlyin.tsx src/app/m/kommplan/_ui/editor/PlanFlyin.test.tsx src/app/m/kommplan/_ui/kommplan.css
git commit -S -m "feat(kommplan): Planangaben, Optionen und Verbindungen des Plans im Flyin

Angaben speichern sich beim Verlassen des Felds selbst, Unverändertes
wird nie gesendet; Optionen und Verbindungen wirken sofort, gelöscht
wird nur, was weder Weg noch Kanal ist.

DRK-500

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 14: Editor-Insel — Route, Kopfleiste, Auswahl, Griffe, Tastatur, Speichern, Drucken

**Files:**
- Create: `K/_ui/editor/Editor.tsx`, `K/_ui/editor/Kopfleiste.tsx`, `K/_ui/editor/Griffe.tsx`
- Modify: `K/(intern)/p/[id]/page.tsx`, `K/_ui/kommplan.css`, `src/app/m/portal/_lib/neuigkeiten/notizen/kommplan/2026-09-30-kommunikationsplaene-ansehen.ts` (nur `titel` und `inhalt`, Step 7)
- Test: `K/_ui/editor/Editor.test.tsx`, `K/_ui/editor/Kopfleiste.test.ts`

**Interfaces:**
- Consumes: alles aus Tasks 2–13, dazu `speichereInhaltAction`, `speichereAngabenAction`, `ladeStandAction`, `ladeZeichenAction` (direkt importiert, Falle 9), `darfKommplanBearbeiten`, `zeichenIndex`, `symboleFuer`, `Seitenkopf`, `zeitFormat`, `kalendertag` (`_lib/rahmen.ts`), `STELLE_FLYIN_GRUND` (Task 11), `PLAN_FLYIN_GRUND` (Task 13), `baueBaum`.
- Produces:
  - `interface EditorPlan { id: string; version: number; angaben: Planangaben; inhalt: PlanInhalt; aktualisiertAm: number; aktualisiertVon: string }`
  - `Editor({ plan, symbole, zeichenIndex, schrift }: { plan: EditorPlan; symbole: Symbolsatz; zeichenIndex: ZeichenIndexEintrag[]; schrift: string })`
  - `Kopfleiste(props)`, `statusText(z: SpeicherZustand): string` (kurze Texte, Entscheidung 19)
  - `Griffe({ karte, ansicht, flaeche, seitenstelle, onUnterstelle, onSeitenstelle, onEinheit, onBearbeiten })` — `flaeche: { breite: number; hoehe: number }` (freie Breite der Überlagerung, für das Klemmen der Griffleiste)
  - `EDITOR_MASSSTAB = 4`, `GRIFF_RAND = { oben: 16, seite: 84, unten: 120 }` (in `Editor.tsx`)
  - Route `/p/[id]`: Editor für `darfKommplanBearbeiten(viewer.groups)` bei lesbarem Inhalt, sonst Betrachter wie bisher.

- [ ] **Step 1: Failing tests**

`K/_ui/editor/Kopfleiste.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { statusText } from "./Kopfleiste";

const basis = { version: 1, konflikt: null, zuletztGespeichert: null, fehler: null };

describe("Speicherstatus (Spec §6.2, Entscheidung 19)", () => {
  it("benennt jeden Zustand in Worten, nie nur über Farbe — kurz, damit die Werkzeugleiste nicht umbricht", () => {
    expect(statusText({ ...basis, status: "gespeichert" })).toBe("Gespeichert");
    expect(statusText({ ...basis, status: "gespeichert", zuletztGespeichert: Date.UTC(2026, 8, 30, 9, 5) })).toBe("Gespeichert 11:05");
    expect(statusText({ ...basis, status: "ungespeichert" })).toBe("Ungespeichert");
    expect(statusText({ ...basis, status: "speichert" })).toBe("Speichert …");
    expect(statusText({ ...basis, status: "fehler", fehler: "Nicht gespeichert — prüfe die Verbindung und ob du noch angemeldet bist." })).toBe("Nicht gespeichert");
    expect(statusText({ ...basis, status: "konflikt" })).toBe("Konflikt");
  });
  it("kein Text ist länger als der feste Platz (18 Zeichen, CSS `.kp-speicherstatus`)", () => {
    for (const status of ["gespeichert", "ungespeichert", "speichert", "fehler", "konflikt"] as const) {
      expect(statusText({ ...basis, status, zuletztGespeichert: Date.UTC(2026, 8, 30, 9, 5) }).length).toBeLessThanOrEqual(18);
    }
  });
});
```

`K/_ui/editor/Editor.test.tsx`:

```tsx
// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { clickElement, exists, existsPortal, mount, query, queryAll, queryPortal, unmount } from "@/app/m/qr/_lib/test-dom";

const aktionen = vi.hoisted(() => ({
  speichereInhaltAction: vi.fn(), speichereAngabenAction: vi.fn(), legePlanAnAction: vi.fn(), ladeStandAction: vi.fn(),
}));
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
const zeige = async (p = plan()) => { await mount(<Editor plan={p} symbole={{}} zeichenIndex={[]} schrift="Arimo" />); await act(async () => {}); };
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
  await act(async () => { (ziel ?? document.activeElement ?? query(".kp-betrachter")).dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true, ...mehr })); });
}
const knopf = (text: string) => [...document.querySelectorAll<HTMLButtonElement>("button")].find((b) => b.textContent === text)!;
const flaecheFokussiert = () => document.activeElement === query(".kp-betrachter");
/** Wie `fill` aus dem Harness, aber für ein Element im Portal (Flyin): `fill` sucht nur im Wirt. */
async function schreibe(el: HTMLInputElement, wert: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
  await act(async () => { setter.call(el, wert); el.dispatchEvent(new Event("input", { bubbles: true })); });
}

beforeEach(() => {
  aktionen.speichereInhaltAction.mockImplementation(async (e: { version: number }) => ({ ok: true, version: e.version + 1, aktualisiertAm: Date.UTC(2026, 8, 30, 9) }));
  aktionen.speichereAngabenAction.mockImplementation(async (e: { version: number }) => ({ ok: true, version: e.version + 1, aktualisiertAm: Date.UTC(2026, 8, 30, 9) }));
  aktionen.ladeStandAction.mockResolvedValue(null);
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
  it("Tastaturschleife ohne Maus: N → Titel → Enter → N (Entscheidung 17)", async () => {
    await zeige();
    await waehle("el");
    query<HTMLElement>(".kp-betrachter").focus();
    await taste("n");
    expect(karten()).toHaveLength(4);
    expect(document.activeElement).toBe(queryPortal('input[name="titel"]'));
    await schreibe(queryPortal<HTMLInputElement>('input[name="titel"]'), "EA 2");
    await taste("Enter", {}, queryPortal('input[name="titel"]'));
    expect(flaecheFokussiert()).toBe(true);
    expect(existsPortal("[data-flyin-stelle]")).toBe(false);
    await taste("ArrowUp");
    await taste("n");
    expect(karten()).toHaveLength(5);
  });
  it("Tastatur: ↓ wandert, Entf löscht mit Rückgängig statt Nachfrage; danach hat die Fläche den Fokus", async () => {
    await zeige();
    await waehle("el");
    query<HTMLElement>(".kp-betrachter").focus();
    await taste("ArrowDown");
    expect(exists('[data-griffe="a"]')).toBe(true);
    await taste("Delete");
    expect(karten()).toHaveLength(2);
    expect(query(".kp-betrachter [data-meldung]").textContent).toContain("„EA 1“ gelöscht.");
    expect(flaecheFokussiert()).toBe(true);
    await clickElement(knopf("Rückgängig"));
    expect(karten()).toHaveLength(3);
  });
  it("F2 öffnet wie Enter; andere Buchstaben tun nichts (Entscheidung 9)", async () => {
    await zeige();
    await waehle("a");
    query<HTMLElement>(".kp-betrachter").focus();
    await taste("x");
    expect(existsPortal("[data-flyin-stelle]")).toBe(false);
    await taste("F2");
    expect(existsPortal('[data-flyin-stelle="a"]')).toBe(true);
  });
  it("N an einer Seitenstelle: Hinweis, keine Änderung", async () => {
    await zeige();
    await waehle("s");
    query<HTMLElement>(".kp-betrachter").focus();
    await taste("n");
    expect(karten()).toHaveLength(3);
    expect(document.body.textContent).toContain("Eine Seitenstelle trägt keine Unterstellen.");
  });
  it("N unter einer eingeklappten Stelle klappt sie auf: die neue Karte steht da und hat Griffe", async () => {
    await zeige();
    await clickElement(query('[data-umschalter="el"]'));
    expect(karten()).not.toContain("a");
    await waehle("el");
    query<HTMLElement>(".kp-betrachter").focus();
    await taste("n");
    const neu = karten().find((k) => !["el", "a", "s"].includes(k))!;
    expect(neu).toBeDefined();
    expect(exists(`[data-griffe="${neu}"]`)).toBe(true);
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
  it("Autosave etwa 1 s nach der letzten Änderung, mit Version; Status kurz und in Worten", async () => {
    vi.useFakeTimers();
    await zeige();
    await waehle("a");
    await clickElement(query('[data-griff="unter"]'));
    expect(query(".kp-speicherstatus").textContent).toBe("Ungespeichert");
    await act(async () => { await vi.advanceTimersByTimeAsync(999); });
    expect(aktionen.speichereInhaltAction).not.toHaveBeenCalled();
    await act(async () => { await vi.advanceTimersByTimeAsync(1); });
    expect(aktionen.speichereInhaltAction).toHaveBeenCalledWith(expect.objectContaining({ id: "p1", version: 1 }));
    expect(query(".kp-speicherstatus").textContent).toBe("Gespeichert 11:00");
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
  it("Konflikt: „Meine Fassung behalten“ sendet mit der Serverversion und übernimmt die Planangaben der anderen Fassung", async () => {
    vi.useFakeTimers();
    const fremdeAngaben = { ...plan().angaben, titel: "Fremdtitel" };
    aktionen.speichereInhaltAction
      .mockResolvedValueOnce({ ok: false, grund: "konflikt", stand: { version: 7, inhalt: INHALT, angaben: fremdeAngaben, aktualisiertAm: 0, aktualisiertVon: "Ole" } })
      .mockResolvedValueOnce({ ok: true, version: 8, aktualisiertAm: 0 });
    await zeige();
    await waehle("a");
    await clickElement(query('[data-griff="unter"]'));
    await act(async () => { await vi.advanceTimersByTimeAsync(1000); });
    await clickElement(knopf("Meine Fassung behalten"));
    await act(async () => {});
    expect(aktionen.speichereInhaltAction).toHaveBeenLastCalledWith(expect.objectContaining({ version: 7 }));
    expect(document.body.textContent).not.toContain("Jemand anderes hat diesen Plan inzwischen geändert.");
    expect(query("h1").textContent).toBe("Fremdtitel");
  });
  it("Browser-Zurück: ist der Serverstand beim Montieren neuer, gilt er still (Entscheidung 21)", async () => {
    const neuer = baue({ stellen: [{ id: "el", titel: "EL neu" }] });
    aktionen.ladeStandAction.mockResolvedValue({ version: 5, inhalt: neuer, angaben: { ...plan().angaben, titel: "Neuer Titel" }, aktualisiertAm: 0, aktualisiertVon: "Jana" });
    await zeige();
    expect(aktionen.ladeStandAction).toHaveBeenCalledWith("p1");
    expect(karten()).toEqual(["el"]);
    expect(query("h1").textContent).toBe("Neuer Titel");
    expect(document.body.textContent).not.toContain("Jemand anderes");
  });
  it("Planangaben: Titel ändern und das Flyin schließen — gesendet, bevor das Formular verschwindet (Entscheidung 3)", async () => {
    await zeige();
    await clickElement(knopf("Plan und Verbindungen"));
    const titel = queryPortal<HTMLInputElement>('fieldset[aria-label="Planangaben"] input[name="titel"]');
    await act(async () => { titel.focus(); });
    await schreibe(titel, "Übung Süd");
    // Schließen-Knopf der Schublade: Name je nach antd-Sprachpaket
    await clickElement(queryPortal('.kp-flyin button[aria-label="Close"], .kp-flyin button[aria-label="Schließen"]'));
    await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
    expect(aktionen.speichereAngabenAction).toHaveBeenCalledWith(expect.objectContaining({ angaben: expect.objectContaining({ titel: "Übung Süd" }) }));
    expect(query("h1").textContent).toBe("Übung Süd");
    expect(flaecheFokussiert()).toBe(true);
  });
  it("leerer Plan: kein Absturz, „Erste Stelle anlegen“ führt in den Normalfall (Review Focus 1)", async () => {
    await zeige(plan(leererPlan()));
    expect(document.body.textContent).toContain("Dieser Plan hat noch keine Stellen.");
    expect(queryAll("[data-griff]")).toHaveLength(0);
    await taste("ArrowRight", {}, query(".kp-betrachter"));
    await clickElement(knopf("Erste Stelle anlegen"));
    expect(karten()).toHaveLength(1);
    expect(existsPortal("[data-flyin-stelle]")).toBe(true);
  });
  it("die letzte Stelle löschen: der Hinweis mit „Rückgängig“ steht auch im leeren Plan (Entscheidung 19)", async () => {
    await zeige(plan(leererPlan()));
    await clickElement(knopf("Erste Stelle anlegen"));
    await taste("Enter", {}, queryPortal('input[name="titel"]'));
    await taste("Delete", {}, query(".kp-betrachter"));
    expect(karten()).toHaveLength(0);
    expect(query(".kp-betrachter [data-meldung]").textContent).toContain("gelöscht");
    await clickElement(knopf("Rückgängig"));
    expect(karten()).toHaveLength(1);
  });
  it("Drucken öffnet das Fenster sofort und setzt die Druckroute erst nach dem Speichern", async () => {
    const fenster = { location: { href: "" }, close: vi.fn() };
    vi.spyOn(window, "open").mockReturnValue(fenster as unknown as Window);
    await zeige();
    await waehle("a");
    await clickElement(query('[data-griff="unter"]'));
    await clickElement(knopf("Drucken (A4 quer)"));
    // mehrere Mikroaufgaben (Warteschlange, Action, Auswertung): eine echte Runde der Ereignisschleife abwarten
    await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
    expect(window.open).toHaveBeenCalledWith("", "_blank");
    expect(aktionen.speichereInhaltAction).toHaveBeenCalledTimes(1);
    expect(fenster.location.href).toBe("/p/p1/druck/a4");
  });
});
```

(`schreibe` ist `fill` für Portal-Inhalt: das Harness sucht nur im Wirt, das Flyin hängt an `document.body`. Kein zweites Harness — nur ein Hilfsschritt in dieser Testdatei.)

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

/**
 * Der Speicherstatus in Worten (docs/design/README.md: Bedeutung nie allein über Farbe) — KURZ und in
 * einem Platz fester Mindestbreite (Entscheidung 19): wechselnd lange Texte im Sekundentakt ließen
 * die umbrechende Werkzeugleiste und damit die Fläche springen. Die lange Fehlermeldung steht im
 * Hinweis in der Fläche.
 */
export function statusText(z: SpeicherZustand): string {
  switch (z.status) {
    case "gespeichert": return z.zuletztGespeichert === null ? "Gespeichert" : `Gespeichert ${UHR.format(z.zuletztGespeichert)}`;
    case "ungespeichert": return "Ungespeichert";
    case "speichert": return "Speichert …";
    case "fehler": return "Nicht gespeichert";
    case "konflikt": return "Konflikt";
  }
}

/**
 * KOPFLEISTE (Spec §6.2): Titel, Umschalter Diagramm | Gliederung (die Gliederung folgt mit Phase 3
 * und ist bis dahin deaktiviert, Entscheidung 13), Rückgängig/Wiederholen, „Plan und Verbindungen",
 * „Drucken (A4 quer)" (derselbe Name wie im Betrachter, Entscheidung 20), Speicherstatus (`aria-live`
 * genau hier, docs/design/feedback-admin.md 4.14). `Seitenkopf` trägt weder eine Client-Direktive
 * noch Server-Abhängigkeiten und darf deshalb auch hier rendern. Der Konflikthinweis bleibt im
 * Fluss: er ist ein Zustand, der eine Entscheidung verlangt, kein vorübergehender Hinweis.
 */
export function Kopfleiste({ angaben, zustand, standSeit, kannRueck, kannWieder, onRueck, onWieder, onPlan, onDrucken, onNeuLaden, onBehalten }: {
  angaben: Planangaben; zustand: SpeicherZustand; standSeit: number; kannRueck: boolean; kannWieder: boolean;
  onRueck: () => void; onWieder: () => void; onPlan: () => void; onDrucken: () => void;
  onNeuLaden: () => void; onBehalten: () => void;
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
            <Button onClick={onPlan}>Plan und Verbindungen</Button>
            <Button onClick={onDrucken}>Drucken (A4 quer)</Button>
            <span className="kp-speicherstatus" role="status" aria-live="polite" data-status={zustand.status}>{statusText(zustand)}</span>
          </div>
        } />
      {zustand.konflikt ? (
        <Alert type="warning" showIcon className="kp-hinweis" title="Jemand anderes hat diesen Plan inzwischen geändert."
          description={`Gespeichert um ${UHR.format(zustand.konflikt.aktualisiertAm)} von ${zustand.konflikt.aktualisiertVon}. Deine letzten Änderungen am Diagramm sind noch nicht gespeichert. „Meine Fassung behalten“ überschreibt das Diagramm; die Planangaben der anderen Fassung bleiben.`}
          action={<div className="kp-formular-knoepfe"><Button onClick={onNeuLaden}>Neu laden</Button><Button type="primary" onClick={onBehalten}>Meine Fassung behalten</Button></div>} />
      ) : null}
    </>
  );
}
```

`K/_ui/editor/Griffe.tsx`:

```tsx
"use client";

import { Button, Tooltip } from "antd";
import type { KarteL } from "../../_lib/layout/typen";
import type { Ansicht } from "../betrachter/ansicht";

/** Eine waagerechte Anbindung mit Kästchen — zeigt Sehenden, dass „+" hier eine SEITENstelle ist, keine Stelle am Bus (Kritik). */
function SeitenSymbol({ seite }: { seite: "links" | "rechts" }) {
  return (
    <svg aria-hidden="true" width={16} height={12} viewBox="0 0 16 12" style={seite === "links" ? { transform: "scaleX(-1)" } : undefined}>
      <line x1={0} y1={6} x2={8} y2={6} stroke="currentColor" strokeWidth={1.5} />
      <rect x={8.75} y={2.75} width={6.5} height={6.5} fill="none" stroke="currentColor" strokeWidth={1.5} />
    </svg>
  );
}

/**
 * GRIFFE DER AUSWAHL (Spec §6.3, Entscheidung 5): eine HTML-Überlagerung in Pixeln über dem SVG —
 * die Knöpfe behalten bei jedem Zoom ihre 44 px und sind echte Buttons mit Namen. Seitlich „+"
 * (Seitenstelle links/rechts, mit Tooltip bei Zeigen und Fokus und Symbol), unten die Griffleiste
 * „+ Unterstelle", „+ Einheit", „Bearbeiten". Eine Seitenstelle trägt nichts (§4.2): dort nur
 * „+ Einheit" und „Bearbeiten".
 *
 * DIE GRIFFLEISTE steht in Koordinaten der Überlagerung, nicht der Karte, und wird per `clamp()` im
 * `translateX` im Bild gehalten: `-50%` (mittig) zwischen „linke Kante ≥ 8 px" und „rechte Kante ≤
 * Breite − 8 px"; Prozent im `translate` beziehen sich auf die Leiste selbst, gemessen wird also nichts.
 * Ist die Leiste breiter als die Fläche, gewinnt der linke Anschlag, und sie bricht um (`flex-wrap`).
 */
export function Griffe({ karte, ansicht, flaeche, seitenstelle, onUnterstelle, onSeitenstelle, onEinheit, onBearbeiten }: {
  karte: KarteL; ansicht: Ansicht; flaeche: { breite: number; hoehe: number }; seitenstelle: boolean;
  onUnterstelle: () => void; onSeitenstelle: (seite: "links" | "rechts") => void; onEinheit: () => void; onBearbeiten: () => void;
}) {
  const m = ansicht.massstab;
  const links = ansicht.x + karte.x * m, oben = ansicht.y + karte.y * m, breite = karte.breite * m, hoehe = karte.hoehe * m;
  const mitte = links + breite / 2;
  const titel = karte.titelVoll === "" ? "(ohne Titel)" : karte.titelVoll;
  const seitlich = (seite: "links" | "rechts") => (
    <Tooltip title={`Seitenstelle ${seite} anlegen — waagerecht, ohne Bus`} trigger={["hover", "focus"]}>
      <Button data-griff={seite} className={`kp-griff-seite kp-griff-${seite}`} aria-label={`Seitenstelle ${seite} von ${titel} anlegen`}
        onClick={() => onSeitenstelle(seite)}>
        {seite === "links" ? <><span aria-hidden="true">+</span><SeitenSymbol seite="links" /></> : <><SeitenSymbol seite="rechts" /><span aria-hidden="true">+</span></>}
      </Button>
    </Tooltip>
  );
  return (
    <div className="kp-griffe" data-griffe={karte.id}>
      <div className="kp-griffe-karte" style={{ left: links, top: oben, width: breite, height: hoehe }}>
        <div className="kp-auswahlrahmen" aria-hidden="true" />
        {seitenstelle ? null : <>{seitlich("links")}{seitlich("rechts")}</>}
      </div>
      <div className="kp-griffleiste" role="toolbar" aria-label={`Auswahl: ${titel}`}
        style={{
          left: mitte, top: oben + hoehe + 8, maxWidth: Math.max(0, flaeche.breite - 16),
          transform: `translateX(clamp(${8 - mitte}px, -50%, calc(${flaeche.breite - mitte - 8}px - 100%)))`,
        }}>
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
 * gegen einen `.ant-*`-Namen (Falle 20). Die Griffleiste bricht um statt überzulaufen (Kritik).
 */
.kp-griffe { position: absolute; inset: 0; }
.kp-griffe-karte { position: absolute; }
.kp-griffe button { pointer-events: auto; }
.kp-auswahlrahmen { position: absolute; inset: -4px; border: 2px solid var(--kp-auswahl); border-radius: 4px; pointer-events: none; }
.kp-griffe .kp-griff-seite { position: absolute; top: 50%; transform: translateY(-50%); gap: 4px; }
.kp-griffe .kp-griff-links { right: calc(100% + 8px); }
.kp-griffe .kp-griff-rechts { left: calc(100% + 8px); }
.kp-griffleiste { position: absolute; display: flex; flex-wrap: wrap; justify-content: center; gap: 8px; width: max-content; }
.kp-leer { padding: 16px; display: grid; gap: 12px; justify-items: start; }
.kp-hinweis { margin-block-end: 8px; }
.kp-kopfwerkzeuge { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
/* Fester Platz für den Status (Entscheidung 19): die Leiste bricht beim Autosave nicht um. */
.kp-speicherstatus { font-size: 13px; color: var(--kp-gedaempft); min-width: 18ch; white-space: nowrap; }
.kp-bedienhinweis { margin-block: 8px 0; }
@media (max-width: 767.98px) { .kp-kopfwerkzeuge > * { flex: 1 1 auto; } }
```

(Das `@media` in der letzten Zeile misst zu Recht das Fenster: die Kopfleiste steht im Seitenfluss, nicht in einem Flyin — Falle 13 betrifft sie nicht.)

- [ ] **Step 4: Die Editor-Insel**

`K/_ui/editor/Editor.tsx`:

```tsx
"use client";

import { useDeferredValue, useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { Alert, Button, type InputRef } from "antd";
import { ladeStandAction, speichereAngabenAction, speichereInhaltAction } from "../../_actions/plan";
import { ladeZeichenAction } from "../../_actions/zeichen";
import { angabenSchema, type Planangaben } from "../../_lib/angaben";
import type { SpeicherErgebnis, Speicherstand } from "../../_lib/ergebnis";
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
import { PLAN_FLYIN_GRUND, PlanFlyin } from "./PlanFlyin";
import { Speicherer, type SpeicherZustand } from "./speicherer";
import { STELLE_FLYIN_GRUND, StelleFlyin } from "./StelleFlyin";
import { flaechenBefehl, globalerBefehl, istTextfeld } from "./tasten";
import { kannRueckgaengig, kannWiederholen, neuerVerlauf, rueckgaengig, tue, wiederholen, type Verlauf } from "./verlauf";
import { leseZuletzt } from "./zuletzt";

export interface EditorPlan { id: string; version: number; angaben: Planangaben; inhalt: PlanInhalt; aktualisiertAm: number; aktualisiertVon: string }
interface Hinweis { text: string; rueckgaengig?: boolean }
const BEDIENHINWEIS = "Pfeiltasten wählen Stellen, Enter oder F2 bearbeitet, N legt eine Unterstelle an, Entf löscht, Plus und Minus zoomen";
/** Sichtbar unter der Fläche (Entscheidung 9) — dieselben Befehle wie im `aria-label`, knapper. */
const BEDIENZEILE = "Pfeile wählen · Enter oder F2 bearbeitet · N neue Unterstelle · Entf löscht · Strg/Cmd+Z nimmt zurück";
/** Deckel der eingepassten Ansicht (Entscheidung 18): eine einzelne Karte nicht mit Maßstab 16. */
export const EDITOR_MASSSTAB = 4;
/**
 * Luft um eine gezeigte Karte: oben nur der übliche Rand (über einer Karte steht kein Griff); seitlich
 * 8 px + „+"-Knopf mit Symbol (rund 64 px) + 12 px; unten 8 px + Griffleiste, am Telefon zweizeilig
 * (2 × 44 + 8) + 16 px. Dieselben Zahlen gibt der Editor der Fläche fürs Einpassen (`platzSeite`,
 * `platzUnten`): eingepasst liegen die Griffe jeder Karte schon im Bild, `zeige()` verschiebt dann
 * nichts, und die Ansicht bleibt eingepasst (Entscheidung 18).
 */
export const GRIFF_RAND = { oben: 16, seite: 84, unten: 120 };

/** Die Vorfahren einer Stelle (ohne sie selbst) — zum Aufklappen, damit eine bearbeitete Stelle sichtbar bleibt. */
function vorfahren(p: PlanInhalt, id: string | null): string[] {
  const nachId = new Map(p.stellen.map((s) => [s.id, s]));
  const aus: string[] = [];
  let x = id === null ? undefined : nachId.get(id);
  while (x && x.eltern !== null) { aus.push(x.eltern); x = nachId.get(x.eltern); }
  return aus;
}

/**
 * DER DIAGRAMM-EDITOR (Spec §6.2–6.4, §6.6). Die Insel ist bis zum Neuladen die Quelle der Wahrheit:
 * aus den Props einmal gesät, über `key={plan.id}` an den Plan gebunden, kein `revalidatePath`. Beim
 * Montieren prüft sie den Serverstand (Entscheidung 21: nach Browser-Zurück sind die Props alt).
 *
 * - Jede Änderung ist eine reine Operation (`aendere`); `PlanFehler` wird ein Hinweis, kein Absturz.
 * - Rückgängig ist ein Stapel von Dokumenten (`verlauf.ts`); gespeichert wird über `speicherer.ts`,
 *   aufgerufen aus den Ereignis-Rückrufen, nie aus einem Effekt (`set-state-in-effect`).
 * - Das Layout rechnet aus `useDeferredValue` — Tippen bleibt auch an großen Plänen flüssig (Entscheidung 15).
 * - Linien blenden nur nach STRUKTURELLEN Änderungen neu ein (`linien`), nicht bei jedem Tastendruck.
 * - Hinweise stehen IN der Fläche und schließen nur bei X, beim nächsten Hinweis oder bei der nächsten
 *   strukturellen Änderung, nicht beim Tippen (Entscheidung 19).
 * - Nach Flyin-Schließen, Löschen und Rückgängig per Knopf hat die Fläche den Fokus (Entscheidung 17).
 * - Eine bearbeitete oder neue Stelle wird nie von einer eingeklappten Vorfahrin verdeckt: die
 *   Vorfahren werden aufgeklappt (ein Ansichtszustand, kein Rückgängig-Schritt).
 */
export function Editor({ plan, symbole: symboleStart, zeichenIndex, schrift }: {
  plan: EditorPlan; symbole: Symbolsatz; zeichenIndex: ZeichenIndexEintrag[]; schrift: string;
}) {
  const [verlauf, setVerlauf] = useState<Verlauf>(() => neuerVerlauf(plan.inhalt));
  const [angaben, setAngaben] = useState(plan.angaben);
  /** Zählt hoch, wenn Angaben VON AUSSEN kommen (Neu laden, Meine Fassung behalten, Serverstand) — keyt das Angaben-Formular neu. */
  const [angabenFremd, setAngabenFremd] = useState(0);
  const [auswahl, setAuswahl] = useState<string | null>(null);
  const [flyin, setFlyin] = useState<"stelle" | "plan" | null>(null);
  const [planAbschnitt, setPlanAbschnitt] = useState<"angaben" | "verbindungen">("angaben");
  const [fokus, setFokus] = useState<{ ziel: "titel" | "einheit"; stelle: string | null; n: number }>({ ziel: "titel", stelle: null, n: 0 });
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
  const flyinJetzt = useRef(flyin);
  const angabenEntwurf = useRef(false);
  const kuerzel = useRef({ rueck: () => {}, wieder: () => {}, pruefeStand: (_s: Speicherstand) => {} });
  /** Schlüssel, deren SVG schon unterwegs ist: Server Actions laufen nacheinander, eine Suchsalve stellte sich sonst vor das Autosave. */
  const unterwegs = useRef(new Set<string>());

  const inhalt = verlauf.jetzt;
  const zeichenStand = useDeferredValue(inhalt);
  const daten = useMemo(() => layout(zeichenStand, "bildschirm", { eingeklappt }), [zeichenStand, eingeklappt]);
  const eintraege = useMemo(() => legende(inhalt, baueSicht(inhalt)), [inhalt]);
  const gewaehlt = auswahl !== null && inhalt.stellen.some((s) => s.id === auswahl) ? auswahl : null;
  const stelle = gewaehlt === null ? undefined : inhalt.stellen.find((s) => s.id === gewaehlt);
  const auswahlKarte = gewaehlt === null ? undefined : daten.karten.find((k) => k.id === gewaehlt);

  function klappeAuf(ids: string[]) {
    setEingeklappt((s) => {
      if (!ids.some((id) => s.has(id))) return s;
      const neu = new Set(s);
      for (const id of ids) neu.delete(id);
      return neu;
    });
  }
  function uebernimm(neu: Verlauf, strukturell: boolean) {
    if (neu === verlauf) return;
    setVerlauf(neu);
    speicherer.aendere(neu.jetzt);
    if (strukturell) { setLinien((n) => n + 1); setHinweis(null); }
  }
  const aendere: Aendere = (op, schluessel) => {
    let neu: PlanInhalt;
    try { neu = op(verlauf.jetzt); } catch (e) {
      if (e instanceof PlanFehler) { setHinweis({ text: e.message }); return e.message; }
      throw e;
    }
    uebernimm(tue(verlauf, neu, Date.now(), schluessel), schluessel === undefined);
    // z. B. nach dem Umhängen unter eine eingeklappte Stelle: die gewählte bleibt sichtbar
    if (gewaehlt !== null) klappeAuf(vorfahren(neu, gewaehlt));
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
    setFokus((f) => ({ ziel, stelle: id, n: f.n + 1 }));
    zeigeNach.current = id; // die Karte aus dem Bereich unter dem Flyin holen (Entscheidung 18)
    ladeSymbole(leseZuletzt());
  }
  function schliesseFlyin() {
    setFlyin(null);
    flaeche.current?.fokus(); // verlässt ein Angaben-Feld → es speichert (Entscheidung 3)
  }
  function lege(art: "unter" | "links" | "rechts" | "wurzel", eltern: string | null) {
    const id = neueId(inhalt, "s");
    const f = aendere((p) => art === "wurzel" ? fuegeWurzelEin(p, id)
      : art === "unter" ? fuegeUnterstelleEin(p, eltern!, id) : fuegeSeitenstelleEin(p, eltern!, art, id));
    if (f !== null) return;
    if (eltern !== null) klappeAuf([eltern, ...vorfahren(inhalt, eltern)]);
    oeffne(id);
  }
  function neueEinheit(stelleId: string) {
    if (aendere((p) => fuegeEinheitenEin(p, stelleId, [{ id: neueId(p, "e"), typ: "", rufname: "", zeichen: null }])) === null) oeffne(stelleId, "einheit");
  }
  function loesche(id: string) {
    const s = inhalt.stellen.find((x) => x.id === id);
    if (!s) return;
    const r = { entfernt: 0 };
    if (aendere((p) => { const x = loescheStelle(p, id); r.entfernt = x.entfernt; return x.inhalt; }) !== null) return;
    setAuswahl(s.eltern);
    setFlyin(null);
    flaeche.current?.fokus();
    const weitere = r.entfernt - 1;
    setHinweis({ rueckgaengig: true, text: `„${s.titel.trim() || "(ohne Titel)"}“ gelöscht${weitere > 0 ? ` samt ${weitere} ${weitere === 1 ? "weiterer Stelle" : "weiteren Stellen"}` : ""}.` });
  }
  function rueck() { if (kannRueckgaengig(verlauf)) uebernimm(rueckgaengig(verlauf), true); }
  function wieder() { if (kannWiederholen(verlauf)) uebernimm(wiederholen(verlauf), true); }
  function perKnopf(f: () => void) { f(); flaeche.current?.fokus(); }
  function pruefeStand(s: Speicherstand) {
    if (speicherer.pruefeStand(s) !== "uebernommen") return;
    if (s.inhalt === null) { window.location.reload(); return; }
    setVerlauf(neuerVerlauf(s.inhalt));
    setAngaben(s.angaben); setAngabenFremd((n) => n + 1);
    setLinien((n) => n + 1);
  }
  useEffect(() => { kuerzel.current = { rueck, wieder, pruefeStand }; flyinJetzt.current = flyin; });

  // Entscheidung 21: Serverstand beim Montieren — übernommen im `.then`, nie im Effekt-Rumpf.
  useEffect(() => {
    let aktiv = true;
    void ladeStandAction(plan.id).then((s) => { if (aktiv && s) kuerzel.current.pruefeStand(s); }).catch(() => { /* dann zeigt es das nächste Speichern */ });
    return () => { aktiv = false; };
  }, [plan.id]);

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

  // Ungespeichertes (auch ein Angaben-Feld, das noch nicht verlassen wurde) hält das Schließen auf (Entscheidung 11);
  // wieder online → sofort erneut senden.
  useEffect(() => {
    const warne = (e: BeforeUnloadEvent) => { if (speicherer.hatUngespeichertes() || angabenEntwurf.current) e.preventDefault(); };
    const online = () => { if (speicherer.zustand.status === "fehler") void speicherer.erneut(); };
    window.addEventListener("beforeunload", warne);
    window.addEventListener("online", online);
    return () => { window.removeEventListener("beforeunload", warne); window.removeEventListener("online", online); };
  }, [speicherer]);

  // Neue, per Pfeil gewählte oder im Flyin geöffnete Karte in den freien Bereich holen, sobald das Layout sie kennt.
  useEffect(() => {
    const id = zeigeNach.current;
    if (id === null) return;
    const k = daten.karten.find((x) => x.id === id);
    if (k) { zeigeNach.current = null; flaeche.current?.zeige(k, GRIFF_RAND); }
  }, [daten, gewaehlt, flyin]);

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
    if (doppelt || (id === gewaehlt && flyin === null)) oeffne(id);
    else { setAuswahl(id); zeigeNach.current = id; } // jede Auswahl: Karte samt Griffen ins Bild (eingepasst: nichts zu tun)
  }
  function neuLaden() {
    const k = speicherZustand.konflikt;
    if (!k) return;
    if (k.inhalt === null) { window.location.reload(); return; }
    speicherer.uebernimm(k);
    setVerlauf(neuerVerlauf(k.inhalt));
    setAngaben(k.angaben); setAngabenFremd((n) => n + 1);
    setAuswahl(null); setFlyin(null); setHinweis(null);
    setLinien((n) => n + 1);
  }
  function behalten() {
    const k = speicherZustand.konflikt;
    if (!k) return;
    // Die Angaben sind nicht Teil „meiner Fassung": die der anderen gelten, sonst überschriebe ein späteres Speichern sie still.
    setAngaben(k.angaben); setAngabenFremd((n) => n + 1);
    void speicherer.behalteMeine();
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
      setHinweis({ text: "Vor dem Drucken ließ sich nicht speichern. Gedruckt wird immer der gespeicherte Stand — kläre erst den Hinweis." });
      return;
    }
    if (fenster) fenster.location.href = ziel; else window.location.assign(ziel);
  }
  const umschalten = (id: string) => setEingeklappt((s) => {
    const neu = new Set(s);
    if (neu.has(id)) neu.delete(id); else neu.add(id);
    return neu;
  });
  const oeffnePlan = (abschnitt: "angaben" | "verbindungen") => { setPlanAbschnitt(abschnitt); setFlyin("plan"); };
  const nachSchliessen = () => { if (flyinJetzt.current === null) flaeche.current?.fokus(); };

  const meldung = hinweis ? (
    <Alert type="warning" showIcon title={hinweis.text} closable={{ onClose: () => setHinweis(null) }}
      action={hinweis.rueckgaengig ? <Button onClick={() => perKnopf(rueck)}>Rückgängig</Button> : undefined} />
  ) : speicherZustand.status === "fehler" && speicherZustand.fehler ? (
    <Alert type="warning" showIcon title={speicherZustand.fehler}
      action={<Button onClick={() => void speicherer.erneut()}>Erneut versuchen</Button>} />
  ) : null;

  return (
    <div className="kp-editor">
      <Kopfleiste angaben={angaben} zustand={speicherZustand} standSeit={plan.aktualisiertAm}
        kannRueck={kannRueckgaengig(verlauf)} kannWieder={kannWiederholen(verlauf)}
        onRueck={() => perKnopf(rueck)} onWieder={() => perKnopf(wieder)}
        onPlan={() => oeffnePlan("angaben")} onDrucken={() => void drucken()}
        onNeuLaden={neuLaden} onBehalten={behalten} />
      <Flaeche daten={daten} symbole={symbole} titel={angaben.titel} schrift={schrift} bedienhinweis={BEDIENHINWEIS}
        griff={flaeche} gleitend linienSchluessel={String(linien)} maxMassstab={EDITOR_MASSSTAB} platzSeite={GRIFF_RAND.seite} platzUnten={GRIFF_RAND.unten}
        flyinGrund={flyin === "stelle" ? STELLE_FLYIN_GRUND : flyin === "plan" ? PLAN_FLYIN_GRUND : null}
        zusatz={(k) => <Umschalter k={k} onUmschalten={umschalten} />}
        onKarteKlick={klick} onTaste={taste} meldung={meldung}
        ueberlagerung={(a, f) => (auswahlKarte && stelle ? (
          <Griffe karte={auswahlKarte} ansicht={a} flaeche={f} seitenstelle={stelle.lage !== "unter"}
            onUnterstelle={() => lege("unter", stelle.id)} onSeitenstelle={(seite) => lege(seite, stelle.id)}
            onEinheit={() => neueEinheit(stelle.id)} onBearbeiten={() => oeffne(stelle.id)} />
        ) : null)}
        leer={<div className="kp-leer"><p>Dieser Plan hat noch keine Stellen.</p><Button type="primary" onClick={() => lege("wurzel", null)}>Erste Stelle anlegen</Button></div>}
        werkzeuge={eingeklappt.size > 0 ? <Button onClick={() => setEingeklappt(new Set())}>Alle ausklappen</Button> : null} />
      <p className="kp-hilfe kp-bedienhinweis">{BEDIENZEILE}</p>
      <Legende eintraege={eintraege} />
      <Button onClick={() => oeffnePlan("verbindungen")}>Verbindungen bearbeiten</Button>
      {gewaehlt !== null ? (
        <StelleFlyin offen={flyin === "stelle"} onSchliessen={schliesseFlyin} nachSchliessen={nachSchliessen} inhalt={inhalt} stelleId={gewaehlt} aendere={aendere}
          symbole={symbole} zeichenIndex={zeichenIndex} ladeSymbole={ladeSymbole} fokus={fokus} titelRef={titelRef}
          onLoeschen={() => loesche(gewaehlt)} onFertig={schliesseFlyin} />
      ) : null}
      <PlanFlyin key={angabenFremd} offen={flyin === "plan"} onSchliessen={schliesseFlyin} nachSchliessen={nachSchliessen} abschnitt={planAbschnitt}
        angaben={angaben} inhalt={inhalt} aendere={aendere} speichereAngaben={speichereAngaben}
        onEntwurf={(offen) => { angabenEntwurf.current = offen; }} />
    </div>
  );
}
```

Hinweise für die Umsetzung:
- `flyin === "plan"`: das Plan-Flyin schließt ein offenes Stellen-Flyin (ein Wert, zwei Flyins nie zugleich).
- Das Flyin schließt nicht, wenn eine andere Karte gewählt wird: es zeigt dann diese Stelle (Spec §6.2 „bearbeitet wird im Flyin rechts"); die Abschnitte mit eigenem Zustand sind per `key={s.id}` an die Stelle gebunden (Task 11/12).
- Bei jedem Wechsel der Auswahl (Klick, Pfeil) und beim Öffnen holt `zeigeNach` die Karte samt Griffen in den freien Bereich (`flyinGrund`, Entscheidung 18); in der eingepassten Ansicht ist das dank `platzSeite`/`platzUnten` ein Nichts-Tun, sie bleibt eingepasst.
- `PlanFlyin key={angabenFremd}`: das Angaben-Formular sät sich aus den Props; nur bei Angaben VON AUSSEN neu montieren, nie nach dem eigenen Speichern (sonst verlöre das nächste Feld beim Tab den Fokus).
- Fängt die antd-Schublade beim Schließen den Fokus selbst ab und gibt ihn danach an den Auslöser zurück, gewinnt trotzdem die Fläche: `nachSchliessen` läuft über `afterOpenChange(false)` NACH der Animation.

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
 * seinen Zustand einmal aus den Props und prüft beim Montieren den Serverstand (Umsetzungsplan
 * Phase 2, Entscheidung 21 — Browser-Zurück zeigt diese Seite aus dem Client-Cache).
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
Expected: keine Befunde (insbesondere `react-hooks/set-state-in-effect`, React Compiler, unbenutzte Importe). Meldet der Compiler den Parameter `_s` im Vorgabewert von `kuerzel`, den Typ als `useRef<{ …; pruefeStand: (s: Speicherstand) => void }>(…)` ausschreiben.

Run: `pnpm build`
Expected: grün. Der Build prüft die RSC-Grenze (Editor ist `"use client"`, die Seite reicht nur serialisierbare Props: Zahlen, Zeichenketten, das Dokument, der Index) und die `"use server"`-Dateien.

- [ ] **Step 7: Release-Notiz im selben Commit (CLAUDE.md, „Release Notes")**

Mit diesem Commit kann man Pläne anlegen und bearbeiten — also steht die Notiz hier, nicht in einem eigenen Commit am Ende (Vorgabe des Hauptlaufs: EINE Notiz für das ganze Modul, sie beschreibt ehrlich den Stand nach Phase 2). Zwischenstände vor diesem Commit gehen nicht aus: das Modul wird nach allen Phasen zusammen ausgerollt.

In `src/app/m/portal/_lib/neuigkeiten/notizen/kommplan/2026-09-30-kommunikationsplaene-ansehen.ts` nur `titel` und `inhalt` ersetzen (Dateiname, `slug`, `datum` und Kopfkommentar bleiben):

```ts
  titel: "Kommunikationspläne ansehen, bearbeiten und drucken",
  inhalt: [
    absatz(
      "Unter „Kommunikationspläne“ siehst du Pläne und Fernmeldeskizzen als Diagramm und druckst sie über „Drucken (A4 quer)“. " +
        "Mit Bearbeitungsrecht legst du über „Neu“ einen Plan an und baust ihn mit „+ Unterstelle“, „+ Einheit“ und dem seitlichen „+“ auf. " +
        "Alles speichert sich selbst, „Rückgängig“ holt Schritte zurück.",
    ),
  ],
```

Gezählt (`node -e`, 30.09.2026): 314 von 320 Zeichen im Absatz, drei Sätze, Titel 51 von 60. Jeder Name steht so am Bildschirm — „Drucken (A4 quer)" im Betrachter wie im Editor (Entscheidung 20), „Neu", „+ Unterstelle", „+ Einheit", das seitliche „+", „Rückgängig".

Run: `pnpm vitest run src/app/m/portal/_lib/neuigkeiten`
Expected: PASS. Ist der Absatz zu lang, kürzen — nie die Grenze anfassen.

- [ ] **Step 8: Ankerschritt und Commit**

Ankerschritt für `(intern)/p/[id]/page.tsx` und `kommplan.css`.

```bash
git add src/app/m/kommplan/_ui/editor "src/app/m/kommplan/(intern)/p/[id]/page.tsx" src/app/m/kommplan/_ui/kommplan.css src/app/m/portal/_lib/neuigkeiten/notizen/kommplan/2026-09-30-kommunikationsplaene-ansehen.ts
git commit -S -m "feat(kommplan): Diagramm-Editor mit Griffen, Tastatur, Autosave und Konflikthinweis

Bearbeitende bekommen auf der Planseite den Editor, die Zugangsgruppe
weiter den Betrachter. Neue Stellen stehen sofort da, sind gewählt und
haben den Fokus im Titel; Enter heißt fertig, Entf löscht mit
Rückgängig statt Nachfrage; Drucken speichert vorher. Die Release-Notiz
beschreibt jetzt Anlegen und Bearbeiten.

DRK-500

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 15: End-to-End — Anlegen, Bearbeiten, Tastatur, Konflikt, Zurück, Gleiten, Flyin-Lage, Drucken, Zugang

**Files:**
- Create: `e2e/kommplan-editor.spec.ts`
- Modify: `e2e/gruppen.json` (Eimer nach gemessener Testzeit, Step 2)

**Interfaces:**
- Consumes: `devLogin`, `E2E_PORT`, `klickeWennRuhig`, `warteAufSpaltenaufteilung`, `warteAufGestreamteInhalte` (`e2e/fixtures.ts`); die Selektoren und Namen aus Tasks 7–14.
- Produces: nichts für spätere Aufgaben außer der Datei, die Task 16 um die Bildschirmfotos ergänzt.

**Kein Test verändert einen Plan aus dem Seed** (`e2e/kommplan.spec.ts` zählt Karten des Beispiels „Einsatz 22.02.2026"; die Datenbank teilen alle Dateien eines Eimers, docs/design/README.md „Ein e2e-Test darf seinen Zustand nicht vom Seed erben"). Jeder bearbeitende Test legt seinen Plan über „Neu" selbst an. `e2e/kommplan.spec.ts` zählt keine Zeilen der Planliste (nachgesehen: nur Karten der Seed-Pläne und ein Link per Name) — neue Pläne im selben Eimer stören es also nicht.

- [ ] **Step 1: Die Spec schreiben**

`e2e/kommplan-editor.spec.ts`:

```ts
import { expect, test, type Page, type Response } from "@playwright/test";
import { devLogin, E2E_PORT, klickeWennRuhig, warteAufGestreamteInhalte, warteAufSpaltenaufteilung } from "./fixtures";

/**
 * Kommunikationspläne, Phase 2: der Diagramm-Editor (Spec §6.1–6.4, §6.6). Jeder bearbeitende Test
 * legt seinen eigenen Plan an — die Seed-Pläne gehören `e2e/kommplan.spec.ts`. Jeder ausgelöste
 * Aufruf einer Server Action wird per `waitForResponse` geprüft (Falle 10): Speichern trägt
 * `"version"` im Rumpf, die Standabfrage beim Montieren des Editors (Entscheidung 21) trägt weder
 * `"version"` noch `"titel"`, die Zeichen-Nachladung trägt Zeichenschlüssel.
 */
const HOST = "kommplan.localtest.me";
const url = (pfad: string) => `http://${HOST}:${E2E_PORT}${pfad}`;
const ADMIN = "iuk-kommplan-bearbeiten";
const EINSATZ = "beispiel-einsatz-2026-02-22";

const istAktion = (r: Response) => r.request().method() === "POST" && r.request().headers()["next-action"] !== undefined;
const rumpf = (r: Response) => r.request().postData() ?? "";
const istSpeichern = (r: Response) => istAktion(r) && rumpf(r).includes('"version"');
const istStandAbfrage = (r: Response) => istAktion(r) && !rumpf(r).includes('"version"') && !rumpf(r).includes('"titel"') && !rumpf(r).includes(":");
const flyinTitel = (page: Page) => page.locator(".kp-flyin").getByLabel("Titel", { exact: true });
const karten = (page: Page) => page.locator(".kp-betrachter [data-karte]");

async function speichertNach(page: Page, tu: () => Promise<unknown>): Promise<void> {
  const antwort = page.waitForResponse(istSpeichern);
  await tu();
  expect((await antwort).status()).toBe(200);
  await expect(page.locator(".kp-speicherstatus")).toHaveText(/^Gespeichert \d\d:\d\d$/);
}

/** Navigation in den Editor: die Standabfrage beim Montieren ist eine ausgelöste Anfrage (Falle 10). */
async function oeffneEditor(page: Page, navigiere: () => Promise<unknown>): Promise<void> {
  const stand = page.waitForResponse(istStandAbfrage);
  await navigiere();
  expect((await stand).status()).toBe(200);
  await warteAufSpaltenaufteilung(page);
}

async function neuerPlan(page: Page, titel: string): Promise<string> {
  await page.goto(url("/"));
  await warteAufSpaltenaufteilung(page);
  await klickeWennRuhig(page.getByRole("button", { name: "Neu", exact: true }));
  const formular = page.getByRole("form", { name: "Neuer Plan" });
  await formular.getByLabel("Titel").fill(titel);
  await formular.getByLabel("Anlass").fill("e2e");
  const anlage = page.waitForResponse((r) => istAktion(r) && rumpf(r).includes('"titel"'));
  await oeffneEditor(page, async () => {
    await klickeWennRuhig(formular.getByRole("button", { name: "Anlegen und bearbeiten" }));
    expect((await anlage).status()).toBe(200);
    await page.waitForURL(/\/p\/[0-9a-f-]{36}$/);
  });
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

  await oeffneEditor(page, () => page.reload());
  await expect(karten(page)).toHaveCount(3);
  await expect(page.locator(".kp-betrachter")).toContainText("EA Nord");
  await expect(page.locator(".kp-speicherstatus")).toHaveText("Gespeichert");
});

test("Tastatur ohne Maus: N → Titel → Enter → N, Pfeile, Entf, Strg/Cmd+Z (Entscheidung 17)", async ({ page }) => {
  await devLogin(page, { host: HOST, groups: ADMIN, callbackPath: "/" });
  await neuerPlan(page, "e2e Tastatur");
  await ersteStelle(page, "EL");
  const flaeche = page.locator(".kp-betrachter");
  await page.keyboard.press("Enter"); // „fertig" im Titelfeld
  await expect(flyinTitel(page)).toHaveCount(0);
  await expect(flaeche).toBeFocused();
  await page.keyboard.press("n");
  await expect(karten(page)).toHaveCount(2);
  await expect(flyinTitel(page)).toBeFocused();
  await speichertNach(page, () => flyinTitel(page).fill("EA 1"));
  await page.keyboard.press("Escape");
  await expect(flaeche).toBeFocused(); // kein flaeche.focus() von Hand: das Schließen gibt ihn zurück
  await page.keyboard.press("ArrowUp");
  await expect(page.getByRole("toolbar", { name: "Auswahl: EL" })).toBeVisible();
  await page.keyboard.press("ArrowDown");
  await expect(page.getByRole("toolbar", { name: "Auswahl: EA 1" })).toBeVisible();
  await speichertNach(page, () => page.keyboard.press("Delete"));
  await expect(karten(page)).toHaveCount(1);
  await expect(page.locator(".kp-betrachter [data-meldung]")).toContainText("„EA 1“ gelöscht.");
  await expect(flaeche).toBeFocused();
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

  // Falle 10: die Suche lädt Symbole nach (eigener POST), die Wahl speichert (noch einer) — beide einzeln prüfen
  const symbole = page.waitForResponse((r) => istAktion(r) && rumpf(r).includes("rezept:D.1.4") && !rumpf(r).includes('"version"'));
  await flyin.getByLabel("Zeichen suchen").fill("d.1.4");
  expect((await symbole).status()).toBe(200);
  await speichertNach(page, () => klickeWennRuhig(flyin.locator('[data-zeichen="rezept:D.1.4"]')));
  await expect(karten(page).filter({ hasText: "EA 1" }).locator('use[href="#kp-rezept-D-1-4"]')).toHaveCount(1);

  await klickeWennRuhig(flyin.getByRole("button", { name: "Neue Verbindung" }));
  await expect(flyin.getByLabel("Bezeichnung der neuen Verbindung")).toBeFocused();
  await flyin.getByLabel("Bezeichnung der neuen Verbindung").fill("R_UE_2");
  await speichertNach(page, () => page.keyboard.press("Enter"));
  await expect(page.locator(".kp-betrachter [data-sechseck]")).toHaveCount(1);

  await klickeWennRuhig(flyin.getByRole("button", { name: "Liste einfügen" }));
  await expect(flyin.getByLabel("Einheiten, je Zeile eine")).toBeFocused();
  await flyin.getByLabel("Einheiten, je Zeile eine").fill("RTW RK UE 40-83-5\nKTW RK UE 40-92-1");
  await speichertNach(page, () => page.keyboard.press("ControlOrMeta+Enter"));
  await expect(page.locator(".kp-betrachter [data-einheit]")).toHaveCount(2);
  await expect(page.getByRole("list", { name: "Legende" })).toContainText("Digitalfunk TMO");
});

test("Konflikt zwischen zwei Fenstern: Hinweis, „Neu laden“ zeigt die andere Fassung", async ({ page, context }) => {
  await devLogin(page, { host: HOST, groups: ADMIN, callbackPath: "/" });
  const id = await neuerPlan(page, "e2e Konflikt");
  await ersteStelle(page, "Fassung A");
  const zweite = await context.newPage();
  await oeffneEditor(zweite, () => zweite.goto(url(`/p/${id}`)));
  await speichertNach(page, () => flyinTitel(page).fill("Fassung A2"));

  await klickeWennRuhig(karten(zweite).first());
  await klickeWennRuhig(zweite.locator('[data-griff="bearbeiten"]'));
  const antwort = zweite.waitForResponse(istSpeichern);
  await flyinTitel(zweite).fill("Fassung B");
  expect((await antwort).status()).toBe(200);
  await expect(zweite.getByText("Jemand anderes hat diesen Plan inzwischen geändert.")).toBeVisible();
  await expect(zweite.locator(".kp-speicherstatus")).toHaveText("Konflikt");
  await klickeWennRuhig(zweite.getByRole("button", { name: "Neu laden" }));
  await expect(zweite.locator(".kp-betrachter")).toContainText("Fassung A2");
  await expect(zweite.getByText("Jemand anderes hat diesen Plan inzwischen geändert.")).toHaveCount(0);
  await zweite.close();
});

test("Browser-Zurück: der Editor zeigt den gespeicherten Stand, die nächste Änderung speichert ohne Konflikt (Entscheidung 21)", async ({ page }) => {
  await devLogin(page, { host: HOST, groups: ADMIN, callbackPath: "/" });
  await neuerPlan(page, "e2e Zurück");
  await ersteStelle(page, "Vorher");
  await speichertNach(page, () => flyinTitel(page).fill("Nachher"));
  await page.keyboard.press("Escape");
  await klickeWennRuhig(page.getByRole("link", { name: /Alle Pläne/ }));
  await page.waitForURL(url("/"));
  await oeffneEditor(page, () => page.goBack());
  await expect(page.locator(".kp-betrachter")).toContainText("Nachher");
  await klickeWennRuhig(karten(page).first());
  await klickeWennRuhig(page.locator('[data-griff="bearbeiten"]'));
  await speichertNach(page, () => flyinTitel(page).fill("Danach"));
  await expect(page.getByText("Jemand anderes hat diesen Plan inzwischen geändert.")).toHaveCount(0);
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

test("Tablet: neue Karten liegen nie unter dem Flyin, fünf Stellen passen eingepasst ins Bild (Entscheidung 18)", async ({ page }) => {
  await page.setViewportSize({ width: 1024, height: 768 });
  await page.emulateMedia({ reducedMotion: "reduce" }); // Lagen messen ohne laufende Übergänge
  await devLogin(page, { host: HOST, groups: ADMIN, callbackPath: "/" });
  await neuerPlan(page, "e2e Flyinlage");
  await ersteStelle(page, "EL");
  for (const titel of ["EA 1", "EA 2", "EA 3", "EA 4"]) {
    await page.keyboard.press("Enter"); // fertig → Fläche
    if (titel !== "EA 1") await page.keyboard.press("ArrowUp"); // zurück zur EL
    await page.keyboard.press("n");
    await speichertNach(page, () => flyinTitel(page).fill(titel));
    // die neue Karte steht rechts außen am Bus — und trotzdem links vom Flyin
    const karte = (await page.locator("[data-griffe] .kp-griffe-karte").boundingBox())!;
    const flyin = (await page.locator("[data-flyin-stelle]").boundingBox())!;
    expect(karte.x + karte.width, `${titel} unter dem Flyin`).toBeLessThanOrEqual(flyin.x);
    // und die Ansicht ist dabei eingepasst geblieben (Kritik: kein Einfrieren beim ersten Anlegen)
    await expect(page.locator(".kp-betrachter")).toHaveAttribute("data-eingepasst", "true");
  }
  await page.keyboard.press("Escape");
  const rahmen = (await page.locator(".kp-betrachter").boundingBox())!;
  for (const k of await karten(page).all()) {
    const b = (await k.boundingBox())!;
    expect(b.x).toBeGreaterThanOrEqual(rahmen.x);
    expect(b.x + b.width).toBeLessThanOrEqual(rahmen.x + rahmen.width);
    expect(b.y + b.height).toBeLessThanOrEqual(rahmen.y + rahmen.height);
  }
});

test("Drucken aus dem Editor zeigt den gerade getippten Stand", async ({ page, context }) => {
  await context.addInitScript(() => { window.print = () => {}; });
  await devLogin(page, { host: HOST, groups: ADMIN, callbackPath: "/" });
  await neuerPlan(page, "e2e Drucken");
  await ersteStelle(page, "EL");
  await flyinTitel(page).fill("Druckprobe"); // bewusst ohne auf das Autosave zu warten
  const gespeichert = page.waitForResponse(istSpeichern); // Drucken speichert vorher (Entscheidung 12)
  const neueSeite = context.waitForEvent("page");
  await klickeWennRuhig(page.getByRole("button", { name: "Drucken (A4 quer)" }));
  expect((await gespeichert).status()).toBe(200);
  const druck = await neueSeite;
  await druck.waitForURL(/\/druck\/a4$/);
  await warteAufGestreamteInhalte(druck);
  await expect(druck.locator("svg.kp-blatt")).toContainText("Druckprobe");
  await druck.close();
});
```

(`istStandAbfrage` schließt über `":"` die Zeichen-Nachladung aus: deren Rumpf trägt Schlüssel wie `rezept:D.1.4`, die Standabfrage nur die Plan-ID, eine UUID bzw. einen Seed-Namen ohne Doppelpunkt.)

- [ ] **Step 2: In einen Eimer eintragen — nach Testzeit**

`scripts/e2e-gruppen.test.ts` (Kopfkommentar) verlangt: eine neue Spec kommt in den Eimer mit der **kleinsten Testzeit im letzten grünen Lauf** — nicht nach Modul, nicht nach Name. Eine Reihenfolge innerhalb der Liste prüft der Test nicht (Playwright fährt die Dateien eines Eimers ohnehin nach Namen). Weil dieser Zweig noch nicht auf `main` liegt, gibt es für die neuen Specs keinen grünen Lauf; deshalb so messen:
1. Testzeit je Eimer im letzten grünen `main`-Lauf: `gh run list --workflow ci.yml --branch main --status success --limit 1`, dann `gh run view <id> --log` und je Eimer die Spanne der Playwright-Ausgabe (erste bis letzte Zeile des `list`-Reporters) ablesen — nicht die Jobdauer, die enthält die Einrichtung.
2. Die Zeit von `e2e/kommplan.spec.ts` (Phase 1, steht in `eimer-2`, fehlt auf `main` noch) und von `e2e/kommplan-editor.spec.ts` lokal über den CI-Weg messen: `pnpm build && E2E_VORGEBAUT=1 pnpm exec playwright test e2e/kommplan.spec.ts e2e/kommplan-editor.spec.ts --reporter=list` (bei Load > 10 später wiederholen; die Fotos aus Task 16 laufen in der CI nicht mit).
3. `kommplan.spec.ts` zu `eimer-2` rechnen, dann die neue Spec in den Eimer mit der kleinsten Summe eintragen (ans Ende der `specs`-Zeichenkette). Zahlen und Wahl in den Commit-Body schreiben.

Run: `pnpm vitest run scripts/e2e-gruppen.test.ts`
Expected: PASS (jede Spec in genau einem Eimer).

- [ ] **Step 3: Laufen lassen**

Vorher `uptime` prüfen. Bei Load über 10 den CI-Weg nehmen: `pnpm build && E2E_VORGEBAUT=1 pnpm exec playwright test e2e/kommplan-editor.spec.ts e2e/kommplan.spec.ts`; sonst:

Run: `pnpm exec playwright test e2e/kommplan-editor.spec.ts e2e/kommplan.spec.ts`
Expected: alle grün (9 neue + 6 aus Phase 1). Danach `git status`: ein von `next dev` umgeschriebenes `next-env.d.ts` mit `git checkout -- next-env.d.ts` zurücksetzen; kein `pnpm dev` offen lassen.

Typische Ursachen, wenn etwas rot ist — **nicht** den Test aufweichen:
- `toBeFocused()` scheitert: die antd-Schublade zieht den Fokus beim Öffnen an sich oder gibt ihn beim Schließen an den Auslöser zurück. Prüfen (antd-MCP, `antd_doc Drawer`), ob die Schublade eine Fokus-Option hat (`autoFocus`/`focusable`), und sie so setzen, dass `afterOpenChange` das Titelfeld bzw. `nachSchliessen` die Fläche fokussiert; sonst den Fokus dort mit `requestAnimationFrame` nachziehen.
- Das Gleiten misst `0s` auch ohne Emulation: die Klasse `kp-gleitet` sitzt nicht am `[data-karte]`-Element (Task 10, `lage.ts`), oder eine antd-Regel überschreibt `transition` — dann Falle 5.
- Die Flyin-Lage scheitert: `flyinGrund` kommt nicht an der Fläche an, oder die Fläche kennt ihre linke Kante bzw. die Fensterbreite nicht (ResizeObserver-Rückruf, Task 10).
- Ein Klick trifft daneben: die Hülle bricht nach `load` um — `warteAufSpaltenaufteilung` vor dem ersten Klick jeder Seite (Falle 12).

- [ ] **Step 4: Commit**

```bash
git add e2e/kommplan-editor.spec.ts e2e/gruppen.json
git commit -S -m "test(kommplan): e2e für Anlegen, Griffe, Tastatur, Konflikt, Zurück, Flyin-Lage und Drucken

Jeder Test legt seinen Plan selbst an; die Zugangsgruppe sieht weder
„Neu“ noch Griffe. Eimer nach gemessener Testzeit: <Zahlen und Wahl>.

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

An `e2e/kommplan-editor.spec.ts` anhängen (Import `mkdirSync` aus `node:fs`, Typ `Locator` aus `@playwright/test`):

```ts
/**
 * SICHTPRÜFUNG (Umsetzungsplan Phase 2, Task 16): hell und dunkel über das Cookie `iuk-theme-pref`
 * (nie `emulateMedia({ colorScheme })` — die Suite löst das Thema über `<html data-theme>` auf).
 * Mit `KOMMPLAN_FOTOS=<ordner>` fährt er alle drei Breiten und legt 42 Fotos ab; OHNE (also in der
 * CI) fährt er nur die Telefonbreite in beiden Modi, schießt keine Fotos und sichert nur zu — so
 * bleibt der auf rund 170 s ausbalancierte Eimer (scripts/e2e-gruppen.test.ts) nicht hängen.
 * Zugesichert wird: kein waagerechtes Überlaufen; die Griffe der gewählten Karte GANZ im Bild und
 * ganz in der Fläche — auch an der äußersten linken und rechten Karte; und am Seed-Plan kein
 * einziger Speicheraufruf (Review Focus 6: Ansehen und Flyins öffnen schreibt nichts).
 */
const BREITEN = [{ name: "desktop", width: 1440, height: 900 }, { name: "tablet", width: 1024, height: 768 }, { name: "telefon", width: 390, height: 844 }] as const;
const FOTOS = process.env.KOMMPLAN_FOTOS;

async function ganzInDerFlaeche(page: Page, el: Locator, was: string): Promise<void> {
  await expect(el, was).toBeInViewport({ ratio: 1 });
  const rahmen = (await page.locator(".kp-betrachter").boundingBox())!;
  const b = (await el.boundingBox())!;
  expect(b.x, `${was}: links`).toBeGreaterThanOrEqual(rahmen.x);
  expect(b.x + b.width, `${was}: rechts`).toBeLessThanOrEqual(rahmen.x + rahmen.width);
  expect(b.y + b.height, `${was}: unten`).toBeLessThanOrEqual(rahmen.y + rahmen.height);
}

test("Bildschirmfotos: Liste, Editor mit Auswahl, Flyins — hell und dunkel, drei Breiten", async ({ page, context }, testInfo) => {
  test.setTimeout(FOTOS ? 240_000 : 90_000);
  const ordner = FOTOS ?? testInfo.outputPath("fotos");
  if (FOTOS) mkdirSync(ordner, { recursive: true });
  await page.emulateMedia({ reducedMotion: "reduce" }); // Lagen ohne laufende Übergänge messen
  await devLogin(page, { host: HOST, groups: ADMIN, callbackPath: "/" });
  const leerId = await neuerPlan(page, "e2e Fotos leer");
  const foto = async (name: string) => { if (FOTOS) await page.screenshot({ path: `${ordner}/${name}.png`, animations: "disabled" }); };
  const ohneUeberlauf = async () =>
    expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
  const breiten = FOTOS ? BREITEN : [BREITEN[2]];

  for (const modus of ["light", "dark"] as const) {
    await context.addCookies([{ name: "iuk-theme-pref", value: modus, url: url("/") }]);
    for (const b of breiten) {
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

      await oeffneEditor(page, () => page.goto(url(`/p/${leerId}`)));
      await foto(`leer-${n}`);

      // Seed-Plan nur ANSEHEN und auswählen, nie ändern (Task 15, Kopf) — jeder Speicheraufruf wäre ein Befund
      const speicherungen: string[] = [];
      const zaehle = (r: Response) => { if (istSpeichern(r)) speicherungen.push(r.url()); };
      page.on("response", zaehle);
      await oeffneEditor(page, () => page.goto(url("/p/beispiel-openr-2022-07-01")));
      await ohneUeberlauf();
      await foto(`editor-${n}`);
      // ea2: Unterstelle mit Geschwistern und Einheiten — zeigt alle Griffe (el wäre eine Seitenstelle)
      await klickeWennRuhig(page.locator('.kp-betrachter [data-karte="ea2"]'));
      await expect(page.locator('[data-griffe="ea2"]')).toBeVisible();
      await ganzInDerFlaeche(page, page.getByRole("toolbar", { name: /^Auswahl:/ }), "Griffleiste ea2");
      await foto(`auswahl-${n}`);
      // die äußerste linke und rechte Karte: ihre Griffe (Leiste und seitliche „+") ganz im Bild (Kritik)
      const lagen = await page.locator(".kp-betrachter [data-karte]").evaluateAll((els) =>
        els.map((e) => ({ id: e.getAttribute("data-karte")!, x: e.getBoundingClientRect().x })));
      const aussen = [lagen.reduce((a, c) => (c.x < a.x ? c : a)).id, lagen.reduce((a, c) => (c.x > a.x ? c : a)).id];
      for (const id of aussen) {
        await page.keyboard.press("0"); // eingepasst: auch die äußeren Karten sind im Bild und klickbar
        await klickeWennRuhig(page.locator(`.kp-betrachter [data-karte="${id}"]`));
        for (const g of await page.locator(`[data-griffe="${id}"] [data-griff]`).all()) {
          await ganzInDerFlaeche(page, g, `Griff ${await g.getAttribute("data-griff")} an ${id}`);
        }
      }
      await klickeWennRuhig(page.locator('.kp-betrachter [data-karte="ea2"]'));
      await klickeWennRuhig(page.locator('[data-griff="bearbeiten"]'));
      await expect(flyinTitel(page)).toBeVisible();
      await ohneUeberlauf();
      await foto(`flyin-stelle-${n}`);
      await page.keyboard.press("Escape");
      await klickeWennRuhig(page.getByRole("button", { name: "Plan und Verbindungen" }));
      await expect(page.locator('fieldset[aria-label="Planangaben"]')).toBeVisible();
      await foto(`flyin-plan-${n}`);
      await page.keyboard.press("Escape");
      page.off("response", zaehle);
      expect(speicherungen, "am Seed-Plan wurde gespeichert").toEqual([]);
    }
  }
});
```

(Im Seed-Plan „OpenR" ist `ea2` „EA 2 Bühne": Unterstelle von `fuekw`, mit Geschwistern, Kanälen und Einheiten — `_lib/beispiele/openr20220701.ts`. Die Tastenfolge „0" setzt die Ansicht zurück auf eingepasst, falls ein vorheriger Klick sie verschoben hat.)

- [ ] **Step 2: Fotos erzeugen**

Load prüfen (`uptime`), dann:

```bash
mkdir -p /private/tmp/claude-501/-Users-rubeen-dev-personal-drk-iuk-suite--claude-worktrees-drk-363-8c5335/c55f577c-bed2-49bc-a649-13521bcc9266/scratchpad/phase2-shots
KOMMPLAN_FOTOS=/private/tmp/claude-501/-Users-rubeen-dev-personal-drk-iuk-suite--claude-worktrees-drk-363-8c5335/c55f577c-bed2-49bc-a649-13521bcc9266/scratchpad/phase2-shots pnpm exec playwright test e2e/kommplan-editor.spec.ts -g "Bildschirmfotos"
```

Expected: PASS, 42 PNG-Dateien (7 Ansichten × 3 Breiten × 2 Modi). Ohne `KOMMPLAN_FOTOS` (CI) läuft derselbe Test nur mit den Zusicherungen an der Telefonbreite.

- [ ] **Step 3: Jede Aufnahme mit `Read` ansehen und gegen diese Liste prüfen**

Dazu die Referenzbilder der Excel-Vorlage (`…/scratchpad/referenz/*.png`) einmal öffnen: die Zeichnung selbst soll dort wie in Phase 1 aussehen, nur die Bedienung ist neu.

1. **Dunkel**: Kopfleiste, Speicherstatus, Flyin-Beschriftungen (`--kp-gedaempft`), Chips, Auswahlrahmen (`--kp-auswahl`) lesbar; die Zeichenfläche bleibt Papier (weiß), die Zeichen-Vorschauen im Flyin stehen auf Weiß.
2. **Griffe**: nicht abgeschnitten (zugesichert für ea2 und die äußersten Karten), 44 px hoch, überdecken Titel und Kontaktzeilen der gewählten Karte nicht; die seitlichen „+" mit Symbol stehen neben, nicht auf der Karte, ihr Tooltip erscheint bei Fokus. Zusätzlich einmal von Hand: eine Unterstelle an der Stelle ganz rechts bzw. ganz unten anlegen — die Griffe der neuen Karte müssen ganz im Bild sein (`GRIFF_RAND` in `Editor.tsx`).
3. **Telefon 390**: Werkzeugleiste bricht um statt überzulaufen, der Speicherstatus hat seinen festen Platz (die Fläche springt beim Autosave nicht), Knöpfe mindestens 44 px, Flyin höchstens 92 vw mit sichtbarem Schließen-Knopf, Formularzeilen untereinander (`auto-fit`/`minmax`), keine waagerechte Rollleiste. Erwartet und kein Befund: das Flyin verdeckt die Zeichnung fast ganz (Entscheidung 13 — am Telefon nur kleine Korrekturen).
4. **Tablet 1024**: Kopfleiste und Status in höchstens zwei Zeilen; das Flyin verdeckt die gewählte Karte nicht (zugesichert im e2e „Tablet: neue Karten liegen nie unter dem Flyin", Task 15).
5. **Leerer Plan**: Hinweis und „Erste Stelle anlegen" deutlich, keine leere graue Fläche ohne Aussage.
6. **Flyin Plan**: Planangaben ohne „Übernehmen"-Knopf, Verbindungen mit Nutzung bzw. Chip „Reserve", Löschen bei benutzten Verbindungen erkennbar deaktiviert.
7. **Hinweise**: ein Hinweis (etwa nach Entf) liegt unten mittig IN der Fläche und verschiebt sie nicht; die Bedienzeile unter der Fläche ist lesbar.

Jeden Befund beheben (kleinste Änderung am CSS bzw. an der Komponente, mit Test wo möglich — Quelltext-Scan in `kommplan-css.test.ts` oder Zusicherung im Fototest), Fotos neu erzeugen und wieder ansehen, bis die Liste erfüllt ist.

- [ ] **Step 4: Befunde festhalten**

Am Ende dieses Plans einen Abschnitt `## Abweichungen bei der Umsetzung` anlegen (Tabelle wie im Phase-1-Plan: `| # | Aufgabe | Befund | Entscheidung |`) und je Befund eine Zeile eintragen. Gab es keinen, steht dort „Sichtprüfung ohne Befund (Datum, Anzahl Fotos)".

- [ ] **Step 5: Tore für die geänderten Dateien, Commit**

Run: `pnpm vitest run src/app/m/kommplan && pnpm typecheck; echo "typecheck exit $?" && pnpm lint && pnpm exec playwright test e2e/kommplan-editor.spec.ts`
Expected: grün, exit 0.

```bash
git add e2e/kommplan-editor.spec.ts src/app/m/kommplan/_ui docs/superpowers/plans/2026-09-30-kommplan-phase-2.md
git commit -S -m "test(kommplan): Sichtprüfung des Editors hell und dunkel auf drei Breiten

Der Fototest sichert kein waagerechtes Überlaufen, Griffe ganz im Bild
auch an den Randkarten und keinen Speicheraufruf am Seed-Plan; in der
CI nur an der Telefonbreite, Fotos nur mit KOMMPLAN_FOTOS.

DRK-500

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

(Behebungen mit eigener fachlicher Wirkung gehen vorher als eigener Commit `fix(kommplan): …`.)

---

### Task 17: Alle Tore

**Files:** keine neuen Änderungen — die Release-Notiz ist schon im Commit von Task 14 angepasst (CLAUDE.md: „im selben Commit"; Vorgabe des Hauptlaufs: EINE Notiz für das ganze Modul).

**Interfaces:**
- Consumes: alles.
- Produces: den abgeschlossenen Stand der Phase 2.

- [ ] **Step 1: Notiz gegenlesen**

`src/app/m/portal/_lib/neuigkeiten/notizen/kommplan/2026-09-30-kommunikationsplaene-ansehen.ts` gegen den fertigen Stand prüfen: ein Absatz, höchstens drei Sätze, jeder genannte Name steht so am Bildschirm (nach der Sichtprüfung aus Task 16 nachsehen, ob ein Knopf umbenannt wurde). Stimmt etwas nicht mehr, die Notiz in einem `fix(kommplan): …`-Commit nachziehen.

- [ ] **Step 2: Alle Tore**

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

---

## Abdeckung der Spec (Selbstprüfung)

| Spec / Vorgabe | Aufgabe |
|---|---|
| §6.1 Planliste „Neu" (Titel, Art, Anlass, Datum), danach in den Editor | 5, 6, 7 |
| §6.1 `/p/[id]` Editor (Admin) bzw. Betrachter (Zugangsgruppe); IDOR in jeder Action | 5, 6, 14, 15 |
| §6.2 Kopfleiste: Titel, Diagramm \| Gliederung (Gliederung deaktiviert), Rückgängig/Wiederholen, „Drucken (A4 quer)", Speicherstatus (kurz, fester Platz); Flyin rechts mit `flyinBreite()` | 11, 13, 14 |
| §6.3 Griffe „+ Unterstelle", „+ Seitenstelle", „+ Einheit"; sofort gesetzt, ausgewählt, Fokus im Titel | 2, 10, 14, 15 |
| §6.3 gleitende Animation, ohne bei `prefers-reduced-motion` | 10, 15 |
| §6.3 Tastatur: Pfeile, Enter (auch F2), N, Entf mit Rückgängig; Fokus kehrt auf die Fläche zurück, Enter im Titel = fertig | 8, 10, 11, 14, 15 |
| §6.4 Zeichen-Suche mit „zuletzt genutzt" | 6, 8, 11, 15 |
| §6.4 Titel, Leiter, Hervorheben; Kontakte in fester Reihenfolge (ein Feld je Art) | 11 |
| §6.4 Untersteht/Lage (Umhängen, keine Zyklen); Verbindung wählen oder neu tippen; Einheiten einzeln und „Liste einfügen" | 3, 4, 12, 15 |
| §6.4 „Aus Bibliothek" / „In Bibliothek übernehmen" | bewusst nicht (Phase 4) |
| Plan-Metadaten (speichern sich selbst) und Optionen `leerzeilen`, `vermerkVsNfD` | 5, 13, 14 |
| Verbindungen verwalten: umbenennen, Art, löschen nur unbenutzt, unbenutzt = Reserve | 3, 13 |
| §6.6 Autosave ~1 s mit `version`, Konflikt „Neu laden" / „Meine Fassung behalten", Client-Stapel Rückgängig | 5, 8, 9, 14, 15 |
| §6.6 reine Operationen in `_lib/plan/` | 2, 3, 4 |
| §10 Einfüge-Eigenschaft ehrlich: Starrheit und kein geändertes y (ohne Kamm, gleiche Zeilen) statt „nichts links rückt"; Spec-Wortlaut ersetzt | 1 |
| Hauptlauf (1): Audit gebündelt, 15 Minuten je Person und Plan | 5 |
| Hauptlauf (3): Release-Notiz beschreibt den Stand nach Phase 2, im Commit der Funktion | 14 (gegengelesen in 17) |
| Größe: Gesamtgrenze unter dem Aufruflimit der Server Actions | 2, 5 |
| Ansicht bleibt eingepasst, Flyin verdeckt keine neue Karte, Griffe ganz im Bild | 10, 14, 15, 16 |
| Veralteter Stand nach Browser-Zurück | 5, 6, 9, 14, 15 |
| Seed-Pläne werden durch Ansehen nie geschrieben (Review Focus 6) | 13, 16 |
| e2e und Sichtprüfung (hell/dunkel, 1440×900, 1024×768, 390×844) | 15, 16 |

## Kritik eingearbeitet/verworfen

Kritik zum Planstand vom 30.09.2026, 35 Befunde in der gelieferten Reihenfolge. Jeder Befund ist am Code nachgeprüft (Belege in der Kritik bzw. nachgesehen: `_lib/layout/zufall.ts` `stabStellen`, `_lib/layout/zeichne.ts` `legende()`, `node_modules/antd/es/alert/Alert.d.ts`, `node_modules/next/dist/docs/01-app/04-glossary.md` „Client Cache", `scripts/e2e-gruppen.test.ts`, `e2e/gruppen.json`, `src/app/m/portal/admin/audit/filters.test.ts`, `_ui/betrachter/ansicht.ts` `einpassen`, `src/app/m/portal/_lib/neuigkeiten/register.test.ts`). Doppelte Befunde: 1/13, 2/11, 5/15, 12/22, 19/26 (teilweise).

| # | Befund (kurz) | Ergebnis | Wo | Begründung |
|---|---|---|---|---|
| 1 | Spec-§10-Satz „verschiebt innerhalb … nichts links" widerlegt | übernommen | Entscheidung 2, Task 1 | Selbst nachgerechnet (6 Fälle, −27 bis −48 mm). Tests prüfen nur Starrheit über `relativ()` und nur unter ihrer Vorbedingung (kein Kamm, gleiche Zeilen) — beides steht jetzt im Wortlaut. Spec-Wortlaut, Testkommentar und Commit sagen jetzt, was gilt. Die Einschränkung „innerhalb einer Ebene/Gruppe" aus der Vorgabe des Hauptlaufs trägt ebenfalls nicht — sein Ziel „ehrlich formulieren" hat Vorrang, das steht in Entscheidung 2. |
| 2 | Größenmessung misst keine 500 Stellen; 1-MB-Sackgasse | übernommen | Entscheidung 15, Task 2 (Step 0, `GRENZE.bytes`), Task 5 | `zufallsPlan(…, "stab")` hat 75 Stellen. Statt `bodySizeLimit` eine Gesamtgrenze im Schema: jede Operation, die zu groß würde, ist ein `PlanFehler` mit eigener Meldung und wird gar nicht erst angewandt — so entsteht nie ein unspeicherbarer Stand. |
| 3 | Zustand der Flyin-Abschnitte wandert zur nächsten Stelle | übernommen | Task 11, Task 12, Review Focus 7 | `key={s.id}` an ZeichenWahl, KontaktZeilen, StellenLage, VerbindungWahl, EinheitenListe, nicht am ganzen Formular; Test „Wechsel der Stelle". Folgeproblem des Keyens (Durchsicht): eine stehende „+ Einheit"-Anfrage zöge beim Neumontieren den Fokus in die neue Stelle — Fokusanfragen nennen deshalb ihre Stelle; eigener DOM-Test. |
| 4 | Release-Notiz: zwei Absätze, eigener Commit, „speichert sich selbst" falsch, „Drucken" | übernommen | Task 14 Step 7, Entscheidung 20, Task 17 | Ein Absatz, drei Sätze, 314 Zeichen (gezählt), im Commit der Funktion. „Drucken (A4 quer)" heißt jetzt auch der Editor-Knopf; „speichert sich selbst" stimmt, weil auch die Angaben sich selbst speichern (Befund 23). |
| 5 | `Alert.message` abgekündigt | übernommen | Global Constraints, Tasks 7, 13, 14 | Überall `title=`. |
| 6 | Sechseck-Schlüssel mit globalem Index | übernommen | Task 10 | n-tes Vorkommen je Paar Netz + Verbindung. |
| 7 | Eimerwahl nach Modul/Sortierung; Fototest im CI-Eimer | übernommen | Task 15 Step 2, Task 16 | Eimer nach gemessener Testzeit (Messweg beschrieben, weil der Zweig noch keinen grünen Lauf hat); Fototest in der CI nur Telefon, ohne Fotos. `kommplan.spec.ts` zählt keine Listenzeilen — ein gemeinsamer Eimer wäre also auch sicher. |
| 8 | `filters.test.ts` nicht im Grün-Lauf | übernommen | Task 5 Step 8 | — |
| 9 | Veralteter Stand nach Browser-Zurück | übernommen | Entscheidung 21, Tasks 5, 6, 9, 14, 15 | `ladeStandAction` beim Montieren, Übernahme im `.then`; still bei unverändertem Stand, sonst Konflikt. e2e „Browser-Zurück". |
| 10 | Wurzel-`verbindungId` zählt als Weg | übernommen, erweitert | Task 3, Review Focus 4 | Wie `legende()`; `haengeUm` auf die oberste Ebene setzt `verbindungId: null`. Zusätzlich (nicht in der Kritik): `loescheVerbindung` löst die Verbindung auch von einer Wurzel, sonst verletzte das Löschen der „Reserve" die Invariante „Verbindung existiert". |
| 11 | = 2 | übernommen | wie 2 | Doppelt. |
| 12 | Flyin verdeckt die neue Karte | übernommen | Entscheidung 18, Tasks 10, 11, 13, 14, 15 | Die Fläche kennt die Grundbreite des offenen Flyins (`flyinGrund`, dieselbe `min(…)`-Regel wie `flyinBreite()`, keine `.ant-*`-Messung) und rechnet beim Einpassen und in `zeige()` mit dem freien Bereich. e2e „Tablet: neue Karten liegen nie unter dem Flyin". |
| 13 | = 1 | übernommen | wie 1 | Doppelt; `dx === 0` für „ende" gilt nicht und wird nicht zugesichert. |
| 14 | „Meine Fassung behalten" lässt alte Angaben stehen | übernommen | Entscheidung 11, Task 14 | `behalten()` übernimmt die Angaben der anderen Fassung, der Hinweistext sagt es; Editor-Test mit „Fremdtitel". |
| 15 | `message=` und `closable onClose` abgekündigt | übernommen | wie 5 | `closable={{ onClose }}`. |
| 16 | `@media` in `.kp-formular-knoepfe` (Falle 13) | übernommen | Task 7 | `auto-fit`/`minmax(160px, 1fr)`. Das `@media` der Kopfwerkzeuge bleibt: die Kopfleiste steht im Seitenfluss, nicht im Flyin. |
| 17 | Zwei Anfragen im Flyin-e2e ungeprüft | übernommen | Task 15 | Symbol-Nachladung und Zeichenwahl je mit `waitForResponse`; dazu die Standabfrage jeder Editor-Navigation (`oeffneEditor`). |
| 18 | `aria-describedby` fehlt (Datum, Plan-Flyin) | übernommen | Tasks 7, 13 | Dasselbe `feld()`/`fehlerText()`-Paar; DOM-Tests. |
| 19 | `toBeInViewport()` ohne `ratio` | übernommen | Task 16 | `ratio: 1` plus Kasten-in-der-Fläche. |
| 20 | Kontakteingabe: vier Handgriffe je Kontakt | übernommen | Entscheidung 16, Task 11 | Ein festes Feld je Art; Doppelte über „Weiterer Kontakt" am Ende, damit die Tab-Folge frei bleibt; Schlüssel (Art, n). |
| 21 | Tastaturschleife bricht nach dem Flyin ab | übernommen | Entscheidung 17, Tasks 10, 11, 14, 15 | `FlaecheGriff.fokus()`, Enter im Titel = fertig, `nachSchliessen` nach der Animation; e2e ohne `flaeche.focus()` von Hand. |
| 22 | = 12 | übernommen | wie 12 | Doppelt. |
| 23 | Planangaben gehen beim Schließen verloren | übernommen | Entscheidung 3, Task 13, Task 14 | Kein „Übernehmen" mehr: speichern beim Verlassen, mit Enter, bei Art/Datum sofort; Schließen verlässt das Feld; `beforeunload` kennt den Entwurf. |
| 24 | Ansicht friert beim ersten Anlegen ein | übernommen | Entscheidung 18, Task 10, Task 15 | Modus „eingepasst" statt `halte()`, gedeckelt auf Maßstab 4, gleitet bei automatischen Wechseln; eingepasst mit Platz für die Griffe, damit `zeige()` sie nicht doch verschiebt; e2e prüft `data-eingepasst`. |
| 25 | Neue Stelle unter eingeklappter verschwindet | übernommen | Task 14 | Vorfahren werden aufgeklappt (in `lege` und nach jedem `aendere` für die gewählte Stelle); Editor-Test. |
| 26 | Griffleiste an Randkarten abgeschnitten | übernommen | Entscheidung 5, Task 14, Task 16 | Leiste in Überlagerungs-Koordinaten, per `clamp()` im Bild, `flex-wrap`; `GRIFF_RAND` seitlich und unten; Fototest an den äußersten Karten. |
| 27 | Seitliches „+" mehrdeutig | teilweise | Entscheidung 5, Task 14 | Übernommen: Tooltip (Zeigen und Fokus) und Symbol einer waagerechten Anbindung. Verworfen: „+ Nachbarstelle"/Umschalt+N — über §6.3 hinaus, das Geschwister-Anlegen per Enter kommt mit der Gliederung (§6.5, Phase 3), und ein vierter Knopf verbreiterte gerade die Leiste, die Befund 26 im Bild halten muss. |
| 28 | Hinweis und Status lassen die Fläche springen | übernommen | Entscheidung 19, Tasks 10, 14 | Hinweise als Überlagerung in der Fläche, Status kurz mit fester Mindestbreite; der Konflikthinweis bleibt im Fluss (Zustand mit Entscheidung, kein Durchgangshinweis). |
| 29 | Neue Verbindung braucht drei Klicks | teilweise | Task 12, Task 13 | Übernommen: Autofokus, Enter legt an, Art mit der zuletzt angelegten vorbelegt — ein Klick plus Tippen plus Enter. Verworfen: Kombifeld mit „… als TMO anlegen" — es versteckte die Artwahl in einem Optionstext, und §6.4 verlangt „Bezeichnung + Art". |
| 30 | Tippen auf der Fläche = Titel bearbeiten | teilweise | Entscheidung 9, Tasks 8, 14 | Übernommen: F2 wie Enter, sichtbare Bedienzeile. Verworfen: Tippen = Titel — §6.3 legt `N` als Befehl fest; dann legte jedes Wort mit N eine Unterstelle an, jedes andere bearbeitete den Titel. |
| 31 | Telefon-Zusage zu stark | teilweise | Entscheidung 13, Task 16 | Übernommen: Zusage ehrlich („nur kleine Korrekturen"). Verworfen: untere Schublade am Telefon und ein Aufbau-Durchgang im Fototest — §6.5 macht die Gliederung (Phase 3) zum Telefonweg; ein Durchgang prüfte, was nicht zugesagt ist. |
| 32 | Enter im Zeichen-Suchfeld wählt nichts | übernommen | Task 11 | Enter = erster Treffer bzw. erster Vorschlag, ↓ ins Raster. |
| 33 | Textarea ohne Fokus | übernommen | Task 12 | Autofokus, Strg/Cmd+Enter, danach Fokus auf „Liste einfügen". |
| 34 | Kein Wiederholen nach Netzfehler | übernommen | Entscheidung 11, Task 9, Task 14 | 5 s, 15 s, 30 s, dann jede Minute, dazu `online`; nie bei Konflikt oder „weg". |
| 35 | „Planangaben" verbirgt Reserve und Optionen | übernommen | Entscheidung 20, Tasks 13, 14 | Knopf „Plan und Verbindungen", dazu „Verbindungen bearbeiten" unter der Legende (öffnet am Abschnitt). |

Außerhalb der Befunde ergänzt (Durchsicht): Review Focus 6 — die neuen Selbst-Speicher-Wege dürfen einen Seed-Plan nie schreiben; gepinnt im Plan-Flyin-Test („Unverändertes wird nie gesendet") und im Fototest (null Speicheraufrufe am OpenR-Plan).

## Abweichungen bei der Umsetzung

Was sich erst am laufenden Code zeigte. Jede Zeile nennt die Aufgabe, in der die Entscheidung fiel.

| # | Aufgabe | Befund | Entscheidung |
|---|---|---|---|
| U1 | 3, 9, 11–15 | Mehrere Testtitel im Plan schließen „…" mit einem ASCII-Anführungszeichen mitten in einer Zeichenkette — Parserfehler | schließendes `“` gesetzt; die Aussagen der Tests sind unverändert |
| U2 | 7, 10–13 | `afterEach(() => { unmount(); … })` ohne `await`: das nachlaufende Aufräumen des Harness entfernt den Wirt des nächsten Tests (leerer `body`) | `afterEach(async () => { await unmount(); … })`, ebenso `await unmount()` mitten im Test |
| U3 | 10 | `_ui/betrachter/Umschalter.tsx` kollidiert auf macOS (Groß-/Kleinschreibung) mit dem vorhandenen `umschalter.ts` | Datei `EinklappKnopf.tsx`, Export bleibt `Umschalter` |
| U4 | 11 | TypeScript leitet in `kontaktFelder` die beiden Zweige (`vorhanden: true`/`false`) getrennt ab | Rückgabetyp `KontaktFeld[]` am `flatMap`-Rückruf |
| U5 | 12 | `KontaktZeilen`, `StellenLage`, `VerbindungWahl`, `EinheitenListe` sind Geschwister und trugen alle `key={s.id}` — doppelte Schlüssel, der Entwurf einer neuen Verbindung blieb beim Wechsel der Stelle stehen (Review Focus 7) | Schlüssel je Abschnitt mit Präfix (`lage:${s.id}` …) |
| U6 | 13 | `const { [v.id]: _weg, ...rest }` meldet `pnpm lint` | Rückfall aus dem Plan: Kopie und `delete` |
| U7 | 14 | `react-hooks/purity` hält `aendere` für Render-Code und verbietet `Date.now()`; `@next/next/no-location-assign-…` meldet den Rückfall `window.location.assign` beim Drucken | `new Date().getTime()` (Vorbild `lagerbuch/_ui/HelferRahmen.tsx`); bei gesperrtem Popup `window.open(ziel, "_self")` |
| U8 | 15 | Pointer-Capture der Fläche lenkte den Klick auf „Erste Stelle anlegen" an die Fläche um — im Browser tat der Knopf nichts (jsdom retargetet nicht, die DOM-Tests sahen es nie) | Knöpfe, Links und Eingaben in der Fläche fangen den Zeiger nicht (`Flaeche.tsx`, `ausgenommen`); eigener DOM-Test; eigener `fix`-Commit |
| U9 | 15 | Tablet-e2e: nach dem Anlegen war die Ansicht nicht mehr eingepasst — `zeige()` verschob, obwohl die eingepasste Ansicht die Griffe schon zeigt (Gleitkommarest an der Randkarte bzw. `clientWidth` gegen `contentRect`, nicht einzeln belegt) | Entscheidung 18 durch Bauart: eingepasst tut `zeige()` nichts; die Verschiebung ist die reine Funktion `nachziehen()` (`ansicht.ts`) mit 1-px-Toleranz und eigenem Test |
| U10 | 15 | Das Flyin ohne Maske lag über der rechtsbündigen Kopfleiste (Rückgängig, Drucken, Speicherstatus) und über „Neu laden"/„Meine Fassung behalten" — die e2e für Konflikt und Drucken kamen nicht an die Knöpfe | Ab 768 px hält `.kp-editor[data-flyin]` die Flyin-Breite als `padding-inline-end` frei (`--kp-flyin-breite` aus `flyinBreite()`); `flyinGrund` der Fläche bleibt als Sicherung und wird dadurch ≈ 0. Am Telefon unverändert (Entscheidung 13) |
| U11 | 15 | Eimer nach Testzeit: letzter grüner `main`-Lauf 36558907117, Spanne je Eimer 168/166/175/170/386/164/163/162 s; `kommplan.spec.ts` lokal 9 s (eimer-2 → 175 s), `kommplan-editor.spec.ts` lokal 60 s | `kommplan-editor.spec.ts` in eimer-8 (162 s). Gemessen vor dem Telefon-Zweig des Fototests (Task 16) und dem e2e aus U16 — zusammen rund 20 s mehr; eimer-8 bleibt der kleinste Eimer |
| U12 | 16 | Sichtprüfung: `.kp-betrachter svg { width: 100%; height: 100% }` traf auch das Symbol im seitlichen „+" — Plus und Symbol standen untereinander | Regel nur für `.kp-betrachter > svg`; Inhalt des Griffs in `.kp-griff-inhalt` (inline-flex) |
| U13 | 16 | Sichtprüfung: lange Zeichentitel („Einsatzabschnittsleitung") liefen im Flyin über den Knopfrand | `overflow-wrap: anywhere; hyphens: auto` am Titel im Zeichenknopf |
| U14 | 16 | Fototest: am Telefon decken die Griffe der gewählten Karte Nachbarkarten ab, der Klick auf die äußere Karte traf den Griff; das Foto „neu" entstand mitten in der Einblendung der Schublade | vor dem Klick auf die äußere Karte abwählen (Esc) — ein echter Bedienweg; vor dem Foto `toBeInViewport({ ratio: 1 })`. Zusätzlich ein Foto „hinweis" (Hinweis nach Entf im leeren Plan, Punkt 7 der Prüfliste) — 48 statt 42 Fotos |
| U15 | 17 | Volle Vitest-Suite unter Last: der Autosave-Timer überlebte den Abbau des Editors und sendete danach — im Test traf der Nachzügler den nächsten Fall („Drucken", 2 statt 1 Aufruf); in der App speicherte das Verlassen über „Alle Pläne" erst eine Sekunde später | Beim Abbau sendet der Editor Wartendes sofort (`speicherer.jetzt()` im Aufräumen eines Effekts); eigener DOM-Test |
| U16 | 17 | Folge von U10: `zeige()` zog den vom Flyin verdeckten Teil doppelt ab (der Wert aus dem Rendern hinkte dem Resize nach, den das Freihalten auslöst) — bei eigener Ansicht (gezoomt) rutschte die Karte beim Öffnen rund 500 px zu weit nach links | `zeige()` misst den verdeckten Teil live (`verdeckterTeil` in `ansicht.ts`, reine Funktion mit Test); e2e „gezoomt: Enter holt die Karte an den freien Rand" (vorher rot mit 502 px) |
| U17 | Review | Planangaben verglichen mit dem zuletzt BESTÄTIGTEN Stand: ein Zurücksetzen auf den alten Wert, solange das erste Speichern lief, galt als „unverändert“ — der Server behielt den verworfenen Wert (ebenso Art und Datum) | Vergleich mit dem zuletzt GESENDETEN Stand; ein misslungenes Senden wird vergessen; den Entwurf beendet nur die Antwort auf die neueste Sendung ohne neuere Eingabe |
| U18 | Review | Verschwand die gewählte Stelle (Klick ins Leere, Rückgängig, still übernommener Serverstand), blieb `flyin` auf „stelle“ — die nächste Auswahl per Pfeil oder Einfachklick öffnete das Flyin | Eine Prüfung an der Stelle, an der ein neuer Stand übernommen wird (`pruefeAuswahl`), dazu `klick(null)` |
| U19 | Review | „Rückgängig“ im Lösch-Hinweis nahm den obersten Schritt zurück — nach Tippen das Tippen | Der Knopf steht nur, solange der Stand direkt nach dem Löschen der jetzige ist (Objektgleichheit, wie `verlauf.ts`) |
| U20 | Review | Speicherer blieb in „fehler“, wenn der Stand auf den gespeicherten zurückging — Drucken verweigert; eine verlorene Antwort nach angekommenem Speichern meldete Konflikt mit der eigenen Fassung | „fehler“ löst sich, wenn nichts mehr offen ist (nicht bei „weg“); Konflikt mit Version genau +1 und inhaltsgleichem Stand gilt als gespeichert |
| U21 | Review | N während der Schließanimation: rc-drawer fokussierte beim Öffnen seinen Container NACH dem Fokus-Effekt des Formulars, rund 530 ms gingen Tasten verloren (gebauter Stand) | `autoFocus={false}` am Flyin der Stelle; e2e „Schleife … in Tippgeschwindigkeit“ ohne `toBeFocused` (vorher rot, gebaut) |
| U22 | Review | Die Fläche war `calc(100dvh - 240px)` hoch (Betrachter, Phase 1); über dem Editor steht mehr — am Tablet, am Telefon und bei offenem Flyin (Kopfleiste bricht um, U10) lag ihr Ende samt Hinweisen unter dem Bildrand | Die Höhe rechnet mit dem gemessenen Abstand der Fläche vom Dokumentanfang (`--kp-flaeche-oben`, `ResizeObserver`); ein neuer Hinweis wird zusätzlich per `scrollIntoView({ block: "nearest" })` ins Bild geholt. Hingenommen: die Oberkante springt beim Öffnen des Flyins um die umgebrochene Kopfleiste (Folge von U10) |
| U23 | Review | Handlungsknöpfe der Kopfleiste standen unter 768 px nebeneinander (docs/design/README.md, Mobil) | Einspaltig in voller Breite; der klassenlose Aktionsbehälter des Seitenkopfs nimmt per `:has()` die Zeile. Am Telefon reicht die Fläche dadurch unter den Bildrand — dafür U22 (`scrollIntoView`) |
| U24 | Review | Auswahlrahmen im Dunkelmodus #7fb0ff auf weißem Papier, 2,2:1 | Eigene, themenunabhängige Farbe `--kp-auswahl-papier` (#1f5fbf) mit weißem Außenring; Kontrasttest in `kommplan-css.test.ts` |
| U25 | Review | Der ganze Editor lag im Arimo-Container: Rückweg, Beschreibung, Status, Leertext in der Zeichenschrift | Die Klasse nur noch an der Legende (wie im Betrachter); die Zeichnung setzt ihre Familie am `<svg>` selbst |
| U26 | Review | Konflikthinweis am Telefon: Knöpfe als `action` neben dem Text, Wörter mitten getrennt | Knöpfe in der Beschreibung unter dem Text (`kp-formular-knoepfe`) |
| U27 | Review | Zeichen-Suche: das Platzhalter-Beispiel „Rettungswagen“ fand nichts (Katalog: „RTW“) | Langformen für KTW, NKTW, RTW, NEF, NAW in `suche.ts`; Beispiele als Konstante, Test verlangt je einen Treffer |
| U28 | Review | Esc nach „+ Unterstelle“/„+ Einheit“ ohne Eingabe hinterließ leere Kästen in Zeichnung und Druck | Esc/X verwirft ein unberührtes, per Griff angelegtes Element ohne Wiederholen-Schritt (`verwirf`); Enter („fertig“) behält es. Der Fototest drückt deshalb Enter statt Esc |

Sichtprüfung am 30.09.2026, 48 Fotos (8 Ansichten × 3 Breiten × 2 Modi) nach U12–U14 erneut angesehen: ohne weiteren Befund. Bewusst hingenommen: die Griffleiste und die seitlichen „+" liegen über Nachbarkarten und Einheiten (Überlagerung, Entscheidung 5); am Telefon ist die Zeichnung bei offenem Flyin fast ganz verdeckt (Entscheidung 13).
