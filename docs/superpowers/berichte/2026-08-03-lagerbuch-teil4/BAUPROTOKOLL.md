# SDD ledger — plan: docs/superpowers/plans/2026-08-03-lagerbuch-modul-teil4.md

Branch: feat/lagerbuch-modul-teil4 (aus main @ b1254e5, in place — Betreiberentscheidung 05.08.2026)
Tasks: T62–T87 (26), 8 Wellen. Gates je Wellenende: pnpm typecheck · pnpm lint · pnpm vitest run · pnpm build

Setup: Branch angelegt, Baseline läuft.

Baseline vor T62: 220 Dateien / 3798 Tests grün. BASE = b1254e5.
Task 62: complete (commits b1254e5..83825cc, review clean — Spec ✅, Qualität freigegeben)
Task 62: minor (deferred): Mutationsprobe deckte 2 von >=4 bindenden Regeln ab (nie-werfen, kein toUpperCase ungetestet mutiert) — Tests selbst tragen, nur die berichtete Reichweite war weiter als belegt
Task 62: minor (deferred): Regex /\/g\/([^/?#]+)/ matcht "/g/" als Teilstring, nicht als verankertes Pfadsegment — plan-vorgegebener Code, wörtliche Übernahme war Pflicht
Task 62: minor (deferred): Tippfehler "Gaeraet" in barcode.ts:24
Task 62: offen für Abschluss/Übergabe: dass der Cutover-Import (§4.8) dieselbe Funktion ruft, ist aus diesem Diff nicht prüfbar — Auflage an Teil 5/6
Betreiberentscheidung 05.08.2026 (Übergabe Teil 3, Punkt 9): falte()-Nutzung in _lib/artikelFilter.ts RATIFIZIERT;
  Quelltext-Scan gehört zusätzlich in die T64-Erweiterung von _lib/bauform.test.ts. Bewusste Abweichung vom Planwortlaut.
Task 63: implementiert (commits 83825cc..c8329df), Review läuft.

=== VORAB-SCAN (preflight-scan.md): 51 Befunde, 9 bau-anhaltend. Betreiberentscheidungen 05.08.2026: ===
  R1 mechanische Defekte (~30): Umsetzer repariert nach benannter Regel + protokolliert; nie einen Plan-Begründungskommentar löschen
  R2 hohle Zusicherungen (12): tragend umschreiben, Beleg durch gefahrene Mutation
  B3 login-form.tsx:220 wird repariert (Befund 14) — eigener Zusatz-Task mit eigenem Review, vor Welle 5
  B2 Reihenfolge-Scan der Gate-Flächen wird gebaut (Befund 15) — T64 in Eigenschaftsform, T87 verschärft
  B1 falte()-Scan zusätzlich in T64 (Übergabe Teil 3 Punkt 9)
  Alle Regeln stehen in regeln-fuer-umsetzer.md; jede Dispatch verweist darauf.
  OFFEN, wenn Welle 4 kommt: Befund 5 — checkAbschluss gibt grund:"netz" serverseitig zurück, Global Constraint 12 verbietet das.
Task 63: Review — Spec ❌ (1 Important: fehlender Falle-66-Absatz im Top-Doc-Kommentar, nicht offengelegt), 1 Minor.
Task 63: minor (deferred): `use client` in Kommentaren durch Backticks ersetzt -> für projektweite Textsuche nach der Zeichenfolge nicht mehr auffindbar
Verfahrenshinweis: Subagenten sind nach Abschluss NICHT mehr per SendMessage erreichbar -> jede Fix-Runde ist ein frischer Umsetzer mit Brief- und Berichtspfad.
Jeder Reviewer-Dispatch braucht die Anweisung, den Bericht per Nachricht an "main" zu senden.
Task 63: fix round 1/5 (1 addressed, 0 open — Falle-66-Absatz nachgetragen; commits c8329df..1e65b73)
Task 63: complete (commits 83825cc..1e65b73, review clean)
Task 64: implementiert (commits 1e65b73..338a4ab). Review: Spec ✅, Qualität freigegeben, 3 Important + 8 Minor.
  Review-Bericht vollständig in task-64-review.md.
  I-1 antd-Scan deckt nur _ui/ ab (Constraint sagt "KEINE Datei dieses Plans")
  I-2 Testname "Budgetverbrauch liegt HINTER der Codepruefung" prüft Position, nicht Bedingtheit; Cookie-Glied ungedeckt
  I-3 Reihenfolge-Scan nimmt Erst-Vorkommen über die ganze Datei -> bei mehreren Actions je Datei bedeutungslos
Task 64: minor (deferred): --ant--TSX-Scan filtert .tsx, ein _ui/*.ts entkommt (plan-vorgegeben)
Task 64: minor (deferred): antd-Regex trifft nur "from \"antd\"" — import 'antd', await import(), require() entkommen (plan-vorgegeben)
Task 64: minor (deferred): bauform.test.ts:444-447 ohne Mengen-Untergrenze (einziger neuer Scan ohne)
Task 64: minor (deferred): bauform.test.ts:444 prüft nur das --lb--Präfix, nicht die Deklariertheit -> var(--lb-tinte2) wäre grün und still transparent
Task 64: minor (deferred): Feldschrift-Scan zählt Regeln ohne Schriftangabe mit; Untergrenze >=5 schwächer als sie aussieht
Task 64: minor (deferred): task-64-report.md R-E Punkt 1 ist selbst eine Fehlzählung (Brief hat 9 it(), nicht 8)
Task 64: minor (deferred): helfer.module.css .beenden/.rueckweg bei min-height 44px statt TAP=56 (plan-vorgegeben, kein Scan sieht es)
Task 64: minor (deferred): pnpm build im Task ausgelassen -> läuft im Wellen-Gate mit
Task 64: offen für Übergabe: die acht Ampel-Hexwerte und der Dunkelsatz haben heute KEINE Gegenquelle im Baum (AMPEL_HELL existiert nicht); erst _lib/ampel.test.ts (Teil 5, T100) kann sie halten. Die zwölf Neutralen sind vom Reviewer einzeln gegen core/theme/tokens.ts geprüft und zeichengleich.
Task 64: fix round 1/5 (3 addressed, 0 open — I-1/I-2/I-3; commits 338a4ab..9eba097)
Task 64: complete (commits 1e65b73..9eba097, review clean)
Task 64: minor (deferred): layout.tsx und abmelden/route.ts bleiben außerhalb des erweiterten antd-Scans (Ast-Liste war im Befund wörtlich vorgegeben) -> an T87
Task 64: minor (deferred): einloeseAbschnitt() behauptet nur über die ERSTE einlösende Funktion je Datei -> an T87
Task 64: minor (deferred): B2-Scan hängt am Namen redeemToken (T66) -> bei abweichendem Namen Namensliste nachziehen, nicht Scan löschen
Task 65: implementiert (commits 9eba097..e4a5bb2). Review: Spec ✅, Qualität freigegeben, 1 Important (plan-vorgegeben) + 1 Minor.
  Reviewer hat die Bytes UNABHÄNGIG gegen ../lagerbuch @ ca04eb1 gemessen: 385/1558/5458/3290 B, alle vier SHA-256 stimmen,
  Base64-Roundtrip zeichengleich, Gesamtlänge 13.748 Zeichen = die in E6 zugesicherte Zahl. Das SVG ist der 64x64-Block, nicht die 512er-Fassung.
  I-1: pwaIcons.test.ts:161-163 expect(QUELLE).toMatch(/\/_lib\//) prüft ein Literal, das der Test selbst gesetzt hat -> Fix-Runde 1
Task 65: minor (deferred): ohneKommentare() liegt jetzt als unverbundene Kopie an zwei Stellen (bauform.test.ts, pwaIcons.test.ts)
Task 65: offen für T87: die E6-Diskrepanz (Prüfquelle der Byte-Längen) bleibt im Plantext unbehoben
Task 65: fix round 1/5 (1 addressed, 0 open — existsSync statt Literal-Vergleich; commits e4a5bb2..bdb1b6e)
Task 65: complete (commits 9eba097..bdb1b6e, review clean)
=== WELLE 1 ABGESCHLOSSEN (T62-T65). Gate läuft. ===
GATE Welle 1 GRÜN: typecheck ok · lint 0 Fehler / 6 Vorbestands-Warnungen · vitest 223 Dateien / 3870 Tests · build ok.
  (pnpm build schreibt next-env.d.ts von der dev- auf die build-Variante um -> nach jedem Build zurücksetzen.)
Task 66: implementiert (commits bdb1b6e..e2075f7). Review: Spec ✅, Qualität "Nachbesserung nötig", 2 Important + 4 Minor.
  Review-Bericht vollständig in task-66-review.md.
  I-1 "Kärtchen bleibt nach dem ersten Scan einlösbar" von keiner Zusicherung getragen — Mutation if(t.lastUsedAt) return {ok:false} läuft 11/11 GRÜN
  I-2 Kommentar test:204-211 degradiert genau die Zusicherung, die den Normalisierungs-Rückfall (N-2) allein hält; Berichtsbehauptung 3 ist falsch
Task 66: minor (deferred): toBeInstanceOf(Date) trägt "wird geschrieben", nicht "die Jetzt-Zeit" — set(new Date(0)) bliebe grün
Task 66: minor (deferred): Schreibvorgang ist kein Compare-and-Set; cross-Prozess kann eine Sperrung zwischen .get() und .run() committen -> 12-h-Sitzung für ein gerade gesperrtes Kärtchen
Task 66: minor (deferred): cookieValue.length > 20 ist gegen jeden nicht-leeren Unsinn grün (Regel 4: nicht als zweite Absicherung lesen)
⚠️ PLANWIDERSPRUCH für T82: der plan-vorgegebene Kommentar "ein einmal eingelöster Code ist nicht mehr löschbar" (aus der Alt-App, loeschen.ts:89-99)
  widerspricht schema.ts:412-413 im NEUEN Modul: lastUsedAt ist "reines Anzeigefeld, OHNE Einfluss auf Gueltigkeit und (nach Entscheidung 8-F) auch ohne Einfluss auf Loeschbarkeit".
  Die Falle-16-Kostenaussage gehört vor T82 einmal gegen 8-F gestellt.
⚠️ AUFLAGE T73/T74/T82: ein `import { redeemToken as einloesen }` machte einloeseAbschnitt (bauform.test.ts:840) still null und den Reihenfolge-Scan über die Datei stumm.
Task 66: fix round 1/5 (2 addressed, 0 open — Doppel-Einlöse-Test + korrigierter Regel-4-Kommentar; commits e2075f7..ee3ba46)
Task 66: complete (commits bdb1b6e..ee3ba46, review clean)
Task 66: minor (deferred): Kommentar test:251-257 überzieht im ersten Satz (Allaussage), korrigiert sich in Satz 3-4 selbst
GATE Welle 2 GRÜN: typecheck ok · lint 0 Fehler / 6 Warnungen · vitest 224 Dateien / 3882 Tests · build siehe unten.
=== WELLE 3 (T67-T72) beginnt ===
Task 67: implementiert (commits ee3ba46..9ac2d6d), Review-Paket liegt als review-ee3ba46..9ac2d6d.diff.
  ⚠️ REVIEW NOCH NICHT GELAUFEN — Dispatch blockiert: der Harness kann keine iTerm2-Panes mehr anlegen
  ("Socket recv failed: Resource temporarily unavailable", dann "Connection closed by iTerm2").
  WIEDERAUFNAHME: Review zu T67 mit review-ee3ba46..9ac2d6d.diff dispatchen, dann T68-T72, Gate Welle 3.

=== WELLE 3 via Workflow wf_f2bab3b6-e07 (17 Agenten, 1.9M Token, 6.7 h) ===
Task 67: complete (commits ee3ba46..9a5352b, review clean nach 1 Fix-Runde(n); Erstreview specTreu=False, Nachbesserung noetig)
  Task 67: Erstbefund (Important) src/app/m/lagerbuch/_ui/Restzeit.test.tsx:107-123 (gegen src/app/m/lagerbuch/_ui/Restzeit.tsx:204 und :220) — Die 30-Minuten-Schwelle — die einzige Regel, derentwegen diese Insel existiert — ist von keiner Zusicherung festgenagelt. Der einzige Schwellentest macht zwei Aussagen: bei 35 min darf nicht gewarnt werden, bei 29 min mu
  Task 67: minor (deferred): Die sofortige erste Prüfung `pruefen();` (Restzeit.tsx:222, vor dem Intervall) ist von keinem Test getragen — löschbar, ohne dass einer der 8 Tests rot wird (Test 4 startet über der Schwelle, Test 3 kehrt wegen `if (warnt) return;` sofort zurück, übrige Fixtur
  Task 67: minor (deferred): Der clearInterval-Spion (Restzeit.test.tsx:130-135) prüft nur `toHaveBeenCalled()` — weder das Handle der Komponente noch, dass der Takt danach wirklich schweigt. Schärfer: nach dem Unmount Timer vorspulen und „kein weiterer Zustandswechsel" zusichern.
  Task 67: minor (deferred): `toContain("19:00")` (Restzeit.test.tsx:73) nagelt die Nicht-Warn-Form „bis 19:00" nicht fest; das führende „bis " könnte ersatzlos entfallen, ohne dass etwas rot wird.
  Task 67: minor (deferred): Der Test „warntInitial=false rendert den Hinweis NICHT" kann konstruktionsbedingt nicht zwischen „ehrt false" und „startet immer mit false" unterscheiden — nicht reparierbar und durch Test 3 gegengehalten (Regel 4 erfüllt). Nur notiert, damit es nicht als offe
  Task 67: minor (deferred): Ausdrücklich KEIN Befund: der `"use client"`-Scan (Restzeit.test.tsx:161) liest den Rohtext ohne ohneKommentare() — korrekt, weil es eine positive `toMatch`-Zusicherung mit Zeilenanker ist und ein Verhaltenstest nach CLAUDE.md Falle 6/7 für Vitest strukturell 
  Task 67: minor (deferred): Ausdrücklich KEIN Befund: die Schwäche von ohneKommentare() gegenüber nachgestellten //-Kommentaren — Zeichengleichheit zur Vorlage war angeordnet, und keiner der vier nachgestellten Kommentare in Restzeit.tsx enthält eine gesuchte Zeichenfolge.
  Task 67: minor (deferred): Ausdrücklich KEIN Befund: die 270 `window.getComputedStyle`-Meldungen im Gates-Log stammen durchweg aus @rc-component/table bzw. /portal (antd-Vorbestand); `grep Restzeit` auf das Gates-Log liefert null Treffer.
Task 68: complete (commits 9a5352b..8096d7b, review clean nach 0 Fix-Runde(n); Erstreview specTreu=True, Freigegeben)
  Task 68: minor (deferred): Stepper.test.tsx:184 — "beide Tasten tragen ein aria-label" ist die einzige Zusicherung der Datei, die keine Mutation allein rot macht: unter M11 fällt sie mit fünf weiteren (6 failed / 8 passed), und jeder dieser fünf prüft die Tasten ohnehin über MINUS/PLUS.
  Task 68: minor (deferred): Stepper.tsx:308 / :342 — `type="button"` ist von keiner Zusicherung und keinem Scan gedeckt. Der Code ist heute richtig; fällt das Attribut, wird jeder +/−-Klick zum submit des umschließenden Formulars, und die deklarierten Konsumenten (T78 _ui/Entnahme.tsx, T
  Task 68: minor (deferred): Stepper.tsx:324 — `aria-label` auf dem noText-<div> ist ein No-Op (Rolle `generic`, ARIA 1.2 verbietet es dort). Der Brief spricht von "den drei aria-label", faktisch wirken zwei; die Zahl bleibt als Textinhalt lesbar. Plan-vorgegeben, im Bericht als B1 offeng
  Task 68: minor (deferred): A7 — die Querschnittsregel "Zeichen immer neben Text" ist bewusst überschrieben (beide Tasten tragen nur ein Inline-<svg>). Der Testtitel des Briefs benennt den Fall wörtlich ("mit 56px ohne Text die einzige Benennung") und setzt aria-label als Ausgleich; die 
  Task 68: minor (deferred): `aria-hidden="true"` / `focusable="false"` an den beiden <svg> sind von keiner Zusicherung getragen; ein modulweiter Scan dafür existiert in _lib/bauform.test.ts nicht (gezielt gesucht). Heute stehen beide Attribute richtig da.
  Task 68: minor (deferred): Die Fokusdarstellung hängt am Nesting: die einzige Outline-Regel im Stylesheet ist `.rahmen button:focus-visible` (helfer.module.css:362-366), `.stepTaste` bringt keine eigene mit. Korrekt nur, solange T78/T79 den Stepper innerhalb von `.rahmen` montieren — Hi
  Task 68: minor (deferred): Die Vorgaben `min = 1` / `max = 999` sind von keinem Test fixiert (B3). Bewusst so, weil der Brief die Grenzen zur Aufrufersache erklärt; trägt kein Risiko, solange T78/T79 beide Props setzen.
  Task 68: minor (deferred): Rauschen im Torlauf ist Vorbestand: 270 `window.getComputedStyle`-Meldungen in gates.txt, sämtlich aus @rc-component/table und @rc-component/portal in Bestandstests — die Stacks gelesen, keine aus Stepper.test.tsx. Diesem Task nicht anzulasten; die Aussage "0 
  Task 68: minor (deferred): Die Commit-Nachricht von 8096d7b spricht von "15 Mutationsproben", die Tabelle führt 17 (M16/M17 wurden im Selbst-Review nachgezogen, ohne Codeänderung). Selbst offengelegt und folgenlos.
Task 69: complete (commits 8096d7b..ecc39a0, review clean nach 1 Fix-Runde(n); Erstreview specTreu=True, Nachbesserung noetig)
  Task 69: Erstbefund (Important) src/app/m/lagerbuch/_ui/rahmen.test.tsx:242-243 — Der Testkörper "rendert WEDER Kopf NOCH Tab-Leiste" sichert die Regel nur über Elementnamen zu (`exists("nav")`, `exists("header")`). Kopf und Tab-Leiste sind im Haus aber klassenbasiert definiert — `helfer.module.css:11
  Task 69: minor (deferred): Die `ohneKommentare()`-Kopie ist NICHT zeichengleich, der Bericht (A2) behauptet es aber: `rahmen.test.tsx:158-161` bricht `if (zu === -1) { imBlock = true; return zeile.slice(0, auf); }` auf vier Zeilen um, während Vorlage `bauform.test.ts:98` und alle vier B
  Task 69: minor (deferred): Zwei der elf Mutationen wurden aus dem falschen Grund rot: M7 (`.rahmen` entfernt) und M11 (`.streifen` entfernt) senken `genutzteKlassen()` von 9 auf 8, der Stylesheet-Test (`rahmen.test.tsx:331`) fällt also über den Vakuum-Riegel `toBeGreaterThanOrEqual(9)` 
  Task 69: minor (deferred): `.rueckweg` trägt `min-height: 44px` (`helfer.module.css:215`, T64, außerhalb des Diffs), das Tap-Maß des Plans ist 56px — und der Rückweg ist das einzige Bedienelement, das T69 auf einen Bildschirm bringt, auf dem öffentlichen Weg. Nicht gegen T69 gewertet: d
  Task 69: minor (deferred): `LeerZustand.tsx` dokumentiert seinen `.rahmen`-Vertrag nicht: `.karte`/`.leer` lösen `var(--lb-karte)`, `var(--lb-linie)`, `var(--lb-stahl)` auf, und der Fokusrahmen hängt an `.rahmen a:focus-visible` (`helfer.module.css:363-369`). Rendert einer der drei Kons
  Task 69: minor (deferred): `expect("weg" in ohneWeg).toBe(false)` (`rahmen.test.tsx:300`) ist zur Laufzeit tautologisch — das Objekt ist zwei Zeilen darüber ohne `weg` literal gebaut. Kein Befund, weil der Kommentar ehrlich `pnpm typecheck` als Träger benennt (M8 zeigt TS2578) und ein `
  Task 69: minor (deferred): Der Vakuum-Riegel `expect(genutzt.length).toBeGreaterThanOrEqual(9)` (`rahmen.test.tsx:331`) ist bei gemessen exakt 9 zugleich ein "genau diese neun Klassen"-Test: jede künftige, fachlich richtige Entnahme einer Klasse bricht ihn. Der Kommentar nennt ihn nur a
  Task 69: minor (deferred): `OeffentlicherRahmen` hat heute keinen Konsumenten (T81 steht aus) — plangemäß, aber wenn T81 fällt, fällt die Komponente mit.
Task 70: complete (commits ecc39a0..09242f7, review clean nach 0 Fix-Runde(n); Erstreview specTreu=True, Freigegeben)
  Task 70: minor (deferred): M-1 (HelferChip.test.tsx:213): Der Scan `not.toMatch(/s\[`/)` trifft nur die Backtick-Form. Ein Mutant, der das `Record<AmpelTon, string>` deklariert stehen laesst und trotzdem `${s.chip} ${s[ton]}` rendert, besteht ALLE 12 Tests — die Zusage 'ein fuenfter Ton
  Task 70: minor (deferred): M-2 (HelferChip.test.tsx:127): `expect(DEKLARIERT.size).toBeGreaterThanOrEqual(74)` ist keine Untergrenze, sondern der exakte Ist-Stand einer FREMDEN Datei (nachgerechnet: genau 74) — null Spielraum nach unten. Entfernt T64 oder ein spaeterer Task eine beliebi
  Task 70: minor (deferred): M-3 (HelferChip.tsx:290 / Test :192): 'children ist Pflicht' ist durch keine Zusicherung gedeckt — die Pflicht steht allein im Typ, und `ReactNode` laesst `null`/`false`/`""` zu, ein farbloser Chip ohne Text typecheckt also. Der Test `textContent).toBe("abgela
  Task 70: minor (deferred): M-4 (HelferChip.test.tsx:170): 'die vier Tonklassen sind PAARWEISE VERSCHIEDEN' haelt keinen Fall allein (M2 macht beide rot, M3 nur den Tontest). Vom Umsetzer offen deklariert, Regel 4 damit erfuellt; bleibt eine Redundanz.
  Task 70: minor (deferred): M-5 (HelferChip.test.tsx:219, :228): Zwei Scans sind schwaecher als ihr Titel — `import type \{[^}]*AmpelTon` pinnt die Herkunftsdatei nicht (ein Typimport aus irgendwo bestuende), und der antd-Scan haengt an doppelten Anfuehrungszeichen (repo-weit durch Prett
  Task 70: minor (deferred): M-6 (Bericht §A2): Die Behauptung, die `ohneKommentare()`-Kopie sei 'zeichengleich', stimmt nicht — `_lib/bauform.test.ts:98` ist einzeilig (`if (zu === -1) { imBlock = true; return zeile.slice(0, auf); }`), die Kopie dreizeilig. Automatisch geprueft: identisc
  Task 70: minor (deferred): M-7 (HelferChip.test.tsx:105-108): `schluessel()` haengt an Vitests Klassennamensform `_<schluessel>_<hash>`. Aendert sie sich, wird der Test laut rot (`keys.every(k => k !== null)`), nicht still — bewusst so, hier nur festgehalten.
  Task 70: minor (deferred): Nicht gegen T70 gewertet: T79 rendert laut Preflight :377-380 `<HelferChip ton={e.vorhanden ? "ok" : "grau"}>vorhanden</HelferChip>` mit identischem Text in beiden Zustaenden und nackten <button> ohne aria-pressed — Bedeutung allein ueber Farbe. Das ist ein De
  Task 70: minor (deferred): Nicht gegen T70 gewertet: `pnpm build` / ein echter Abruf wurde nicht gefahren, 'kein "use client" und trotzdem in Client-Inseln renderbar' ist damit statisch belegt. Nicht im Auftrag, korrekt als Bedenken 4 offengelegt.
Task 71: complete (commits 09242f7..71ca8df, review clean nach 0 Fix-Runde(n); Erstreview specTreu=True, Freigegeben)
  Task 71: minor (deferred): `_ui/ArtikelSuche.test.tsx:172` — der Umlaut-Test uebt keinen Umlaut. Titel: „faltet Umlaute so, wie `falte` sie faltet — „waerme"…" (mit ae-Umlaut); die Nadel "wärme" ist bereits klein und im Heuhaufen "Wärmedecke B-11" faltet `falte` nur W→w und B→b — das `ä
  Task 71: minor (deferred): `_ui/ArtikelSuche.test.tsx:202-204` — der Kommentar des Mock-Tests ueberclaimt: „Folgt die Liste ihr, laeuft JEDE Faltstelle der Komponente — Nadel wie Heuhaufen — ueber `_lib/suche.ts`." Der Schluss traegt nur fuer den Heuhaufen: faltete die Komponente die NA
  Task 71: minor (deferred): `_ui/ArtikelSuche.test.tsx:96` — Titel sagt „rendert JEDE Zeile mit Name, Fach, Bestand und Einheit", der Rumpf behauptet die vier Felder nur fuer `zeilen[0]`. Genau dieses Argument fuehrt der Bericht in A9 selbst an, um den Nachbartest (`/a/<id>`, `:106`) auf
  Task 71: minor (deferred): `_ui/ArtikelSuche.tsx:24` — der Kopfkommentar verweist auf `HelferListe.tsx:11`; diese Datei existiert in diesem Baum nicht (nur in der zu portierenden Alt-Anwendung). Der Bericht legt das in Bedenken 6 offen und laesst den Verweis regelkonform stehen (kein vo
  Task 71: minor (deferred): Berichtstreue, zwei Kleinigkeiten: (a) Der Bericht sagt „Nach JEDER Probe wurde die Datei zurueckgeschrieben und die Gleichheit geprueft (`RESTORED: True`)" — im Mutationslog steht `RESTORED: True` nur zweimal (nach M9 und M11), die Proben liefen in Stapeln. S
  Task 71: minor (deferred): Dubletten mit `_lib/bauform.test.ts`, bewusst behalten: der lokale `useSearchParams`/`router.push`-Scan (`:302`) und die `antd`-Haelfte von `:313` sind Kopien der modulweiten Scans (`bauform.test.ts:714`, `:661`). Die Regel-4-Begruendung des Berichts ist am Co
Task 72: complete (commits 71ca8df..4ae0e30, review clean nach 1 Fix-Runde(n); Erstreview specTreu=True, Nachbesserung noetig)
  Task 72: Erstbefund (Important) src/app/m/lagerbuch/_ui/BarcodeScanner.tsx:138 gegen BarcodeScanner.test.tsx:122-128 und die 20 Aufrufstellen (:203, 220, 233, 246, 269, 334, 344, 358, 371, 381, 394, 413, 439, 458, 480, 498, 515, 525, 554) — Der Kontextriegel `if (!window.isSecureContext || !navigator.mediaDevices)` wird von keinem Test getragen. Der Helfer `sichererKontext(an)` setzt BEIDE Eigenschaften aus EINEM Boolean, und jede der 20 Aufrufstellen — auc
  Task 72: Erstbefund (Important) src/app/m/lagerbuch/_ui/BarcodeScanner.tsx:81, 102-104, 106, 114, 143-145, 186, 224, 236 — gegen task-72-report.md:270 — Acht vom Plan als Begründung vorgeschriebene Kommentare sind gekürzt: sämtliche Herkunftsangaben in die Alt-Datei sind entfernt (`(:24)`, `(1:1, :42-44)`, `(:46)`, `(:55-57)`, `(1:1, :66-69)`, `(:101-102)`, `(:141-163)`,
  Task 72: Erstbefund (Important) src/app/m/lagerbuch/_ui/BarcodeScanner.tsx:199-214 — PLAN-VORGEGEBEN: Der Taschenlampenschalter trägt kein Textzeichen — das Inline-SVG ist das einzige Kind des `<button>`. Die für jede Datei dieses Plans bindende Vorgabe lautet „Zeichen sind lokale Inline-<svg> … mit aria
  Task 72: minor (deferred): Der Bericht zählt seine eigenen Mutationen falsch: §4 sagt „Alle zwölf" und §6 „Zwölf Regeln, zwölf gefahrene Mutationen" — die Tabelle (task-72-report.md:215-227) hat 13 Zeilen (M1–M11, M13, M14), mit dem abgebrochenen M12 sind 14 versucht.
  Task 72: minor (deferred): Der Bericht zählt die DOMException-Namen falsch: §A8 sagt „Sieben DOMException-Namen und ein einfacher Error ergeben acht Zusicherungen". Es sind SECHS Namen (NotAllowedError, SecurityError, NotFoundError, OverconstrainedError, NotReadableError, AbortError) + 
  Task 72: minor (deferred): Die Begründung, warum der antd-Scan nicht mutiert wurde, ist sachlich falsch (§4 letzter Absatz: „ein Import, der im Baum gar nicht auflösbar ist"). Für `verwaltung.module.css` stimmt das, für `antd` nicht: antd ist direkte Abhängigkeit dieses Repos, `import {
  Task 72: minor (deferred): Bedenken 2 des Berichts überzeichnet sich selbst. Beide T138-Hüllen (BzScanner, GeraetScanner, teil5.md:14251-14271 / :14316-14339) übergeben inline erzeugte Pfeile, halten aber KEINEN eigenen Zustand und rendern nie neu — die Identitäten bleiben über alle Eig
  Task 72: minor (deferred): `expect(fehler).toEqual([])` im Test „ein Geraet ohne switchTorch stuerzt beim Antippen NICHT ab" (:557-580) misst „nichts ist passiert" über die Kette React 19 → reportError → jsdom `error`-Ereignis am Fenster. M8 belegt, dass sie heute trägt; ändert sich der
  Task 72: minor (deferred): `err instanceof DOMException ? err.name : ""` (BarcodeScanner.tsx:84) hängt daran, dass das geworfene Objekt eine DOMException-Unterklasse ist; der Test konstruiert genau diese Form. OverconstrainedError ist nicht in allen Browsern eine DOMException-Unterklass
  Task 72: minor (deferred): A4 löst den Lint-Fehler syntaktisch, nicht sachlich: derselbe synchrone setState steht jetzt in einer async-Hülle, läuft bis zum ersten await unverändert synchron, und react-hooks/set-state-in-effect sieht ihn nur nicht mehr. Der Bericht ist darin transparent,
  Task 72: minor (deferred): Ordnungskopplung auf `ladungen`: der erste Test der Datei muss der erste bleiben. Er sichert das in seiner ersten Zeile ausdrücklich zu und wird bei einer Umsortierung laut rot. Offen benannt, akzeptabel.
  Task 72: minor (deferred): Checkliste für T100: die Scanner-Klassen verbrauchen genau --lb-karte, --lb-linie, --lb-tinte, --lb-papier, --lb-rot und --lb-ampel-rot-text. Alle sechs sind in helfer.module.css NUR unter `.rahmen` deklariert — `.modul` in verwaltung.module.css muss diesen Sa
  Task 72: minor (deferred): M12 (statischer WERT-Import) ist nicht mutierbar: Vitest bricht die ganze Datei ab, bevor der Scan läuft. Der Verstoß wird laut gefangen und zeigt auf die richtige Zeile. Offen benannt, akzeptabel.
  Task 72: minor (deferred): Nebenbefund der Prüfung: der modulweite Scan „keine _ui/*.tsx nennt --ant- in einem Inline-Style" (bauform.test.ts:575-586) stand bisher in Eigenschaftsform mit LEERER Menge („Zähne bekommt er ab Welle 3"). BarcodeScanner.tsx ist die erste _ui/*.tsx und gibt i
GATE Welle 3 GRÜN: typecheck ok · lint 0 Fehler / 6 Bestands-Warnungen · vitest 230 Dateien / 3979 Tests · build ok.
=== ZUSATZ-TASK B3 (login-form.tsx) + WELLE 4 (T73-T75) beginnen ===

=== ZUSATZ-TASK B3 + WELLE 4 via Workflow wf_83b6aa36-c13 (12 Agenten, 1.6M Token, 4.9 h) ===
Task B3: complete (commits 4ae0e30..1bee0ea, review clean nach 0 Fix-Runde(n); Erstreview specTreu=True, Freigegeben)
  Task B3: minor (deferred): CARRY-FORWARD, bindend für T77/T81 (kein Mangel an B3, aber die Bedingung, unter der B3 überhaupt etwas liefert): Der Verwaltungsknopf MUSS aus `verwaltungsZiel(kopf)` (`src/app/m/lagerbuch/_lib/zugang.ts:205-213`) gebaut werden, NICHT aus dem im Plan abgedruckten Literal `"/login?callbackUrl=https%
  Task B3: minor (deferred): `src/components/login-form.test.tsx:118` — Zusicherung 1 („relativer Pfad") erwartet die absolutierte Form `${ORIGIN}/verwaltung`. Eine spätere, verhaltensgleiche Fassung von `suiteRedirect`, die relative Ziele unverändert zurückgibt, färbte den Test rot, obwohl das Browser-Ziel identisch wäre. Bind
  Task B3: minor (deferred): Abdeckung: `src/core/auth/redirect.ts:52` (Protokoll-Downgrade) trägt KEINE der sieben Zusicherungen dieser Datei — die Mutationsprobe M7 färbt in `login-form.test.tsx` nichts rot. Gedeckt ist die Regel nur in `redirect.test.ts`. Eine achte Zusage („`https://` auf einen bekannten Suite-Host wird von
  Task B3: minor (deferred): `env: {}` ist client-/serverseitig asymmetrisch, aber KEINE vertane Wahl — wer es später „verbessern" will, muss das wissen: Next setzt im Client-Bundle nur `NEXT_PUBLIC_*` ein, `SUITE_HOST_<KEY>` ist für JEDE Client-Fassung unsichtbar. `env: {}` verliert also keine Fähigkeit, es verhindert allein, 
  Task B3: minor (deferred): Ungefahrene Randfälle, jeweils trivial und keiner sicherheitsrelevant: fehlender `?callbackUrl` (Default `"/"` → `${ORIGIN}/`) und Erhalt von Query/Fragment bei relativem Ziel.
  Task B3: minor (deferred): Zahlendreher im Bericht: §5 nennt `Tests 3986 passed (3986)`, §6 spricht von „der volle Lauf (3985 Tests)". Der Laufwert ist 3986.
  Task B3: minor (deferred): Bestätigt und weiterzugeben: `task-B3-brief.md` existiert im Verzeichnis nicht (Read schlug fehl) — Aussetzer der Brief-Erzeugung, der weitere Tasks derselben Welle treffen könnte. Das Vorgehen des Umsetzers (kein BLOCKED wegen einer fehlenden Commit-Message-Zeichenkette) war richtig.
  Task B3: minor (deferred): 25 Zeilen Begründungskommentar auf eine Sachzeile ist viel, passt aber zur Kommentar-Kultur des Repos (`registry.ts`, `zugang.ts`) und konserviert die Auflösung des scheinbaren Widerspruchs zu `core/auth/callbackUrl.ts`. Kein Handlungsbedarf.
Task 73: complete (commits 1bee0ea..c4e291c, review clean nach 0 Fix-Runde(n); Erstreview specTreu=True, Freigegeben)
  Task 73: minor (deferred): task-73-report.md:16-17 — Der Bericht behauptet, der Produktionscode sei dem Brief 'zeichengleich'; gemessen weicht der Kopf-Blockkommentar an zwei Stellen ab (Zusatz '`_actions/guards.test.ts:38-40`' und '(T77)'). Beide Zusätze sind rein additiv und korrekt (guards.test.ts:38-40 gelesen: dort steht
  Task 73: minor (deferred): gate.test.ts:276 — `expect(stand.cookies[0]?.opt.httpOnly).toBe(true)` bliebe für JEDES gate.ts grün, das `helferCookieOptionen(...)` mit irgendeinem Argument ruft. Das ist eine Zusage von `_lib/helferSitzung.ts` und gehört `helferSitzung.test.ts`, nicht diesem Task. Nicht falsch, aber nicht tragend
  Task 73: minor (deferred): gate.test.ts:275 — `expect(...maxAge as number).toBeGreaterThan(0)` ist unerreichbar rot: die Zeile davor sichert `toBe(helferGueltigkeitSekunden())` zu, und `helferSitzungStunden` hat `min: 1`. Sie kann nie feuern, ohne dass 274 vorher fällt.
  Task 73: minor (deferred): gate.test.ts:252 — `expect(getDb).toHaveBeenCalledTimes(1)` läuft nur auf dem Misserfolgspfad. Ein zweiter `getDb()` INNERHALB des Erfolgszweigs sähe kein Test dieser Datei, und der T64-Scan sieht Position, nicht Anzahl. Abdeckungsbreite, kein Defekt am heutigen Code.
  Task 73: minor (deferred): gate.test.ts:177-189 — Der Sperrpfad sichert nicht zu, dass er weder Cookie setzt noch umleitet. Die beiden `beforeEach`-Sammelarrays stehen bereit; zwei Zeilen (`expect(stand.cookies).toEqual([])`, `expect(stand.umleitungen).toEqual([])`) machten 'Schritt 2 endet den Weg' vollständig.
  Task 73: minor (deferred): gate.ts:530 und gate.ts:546 — der `?? undefined`-Zweig ist auf beiden Wegen tot: `GateGrund` ist `"code"|"gesperrt"|"abgelaufen"|"zuviele"`, `istGateGrund` trifft beide hier benutzten Literale, `gateMeldung` liefert nie `null`. Plan-vorgegeben und inert — deshalb Minor und nicht plan-vorgegebener Be
  Task 73: minor (deferred): Die Mutationstabelle mutiert nur das Argument der Cookie-Setzung (M6), nie die Setzung selbst. Ein ersatzloses Entfernen von `(await cookies()).set(...)` fiele über `toHaveLength(1)`/`toHaveLength(5)` offensichtlich auf, ist aber nicht belegt.
  Task 73: minor (deferred): pnpm lint meldet 6 Warnungen (0 Fehler), alle in Bestandsdateien ausserhalb von `_actions/` und vor 1bee0ea vorhanden. Der Bericht zählt alle sechs auf. Das ist Grundrauschen des Baumes, kein Rauschen dieses Tasks — hier nur vermerkt, damit es nicht erneut aufgerollt wird.
Task 74: complete (commits c4e291c..5307a87, review clean nach 1 Fix-Runde(n); Erstreview specTreu=True, Nachbesserung noetig)
  Task 74: Erstbefund (Important) src/app/m/lagerbuch/_actions/sitzung.test.ts:373-378 (Test ab :354), zusammen mit dem Mock in derselben Datei :107-109 — Die zentrale Loeschzusicherung von `beenden` prueft `name`, `opt.path`, `opt.maxAge` und `opt` — aber NICHT `art`. Der Mock zeichnet `delete: (name, opt) => push({art:"delete", name, opt})` die Optionen mit auf. Damit bl
  Task 74: minor (deferred): sitzung.test.ts:377 — `expect(stand.cookieOps[0]?.opt).toEqual(helferCookieOptionen(0))` sollte nach N-4 `toStrictEqual` sein; die Datei benutzt an der entscheidenden Stelle (:285) selbst `toStrictEqual` und begruendet es. Den Kern tragen ohnehin die Einzelpruefungen auf `path` und `maxAge` darueber
  Task 74: minor (deferred): sitzung.test.ts:293-294 — der Erfolgs-Cookie-Test prueft `httpOnly` und `path`, aber nicht `sameSite: "lax"` und `secure`. Beide kaemen mit einem `toStrictEqual`-Vergleich gegen `helferCookieOptionen(helferGueltigkeitSekunden())` gratis mit.
  Task 74: minor (deferred): sitzung.test.ts:403-409 — der Kommentar behauptet, die drei Zusicherungen prueften „GLEICHHEIT mit dem Normalfall, nicht dessen Inhalt"; tatsaechlich pruefen sie literale Inhalte (`"helfer_session"`, `["/"]`). Die Aussage ist richtig, ihre Beschreibung nicht — und ein falsch beschriebener Test ist d
  Task 74: minor (deferred): sitzung.test.ts:430-445 — `rumpfDerAction("erneuereSitzung")` liefert den Text bis DATEIENDE, also inklusive `beenden`. Fuer beide heutigen Scans harmlos, aber der Name verspricht mehr, als die Funktion haelt; ein `slice` bis zum naechsten `export` waere ehrlicher.
  Task 74: minor (deferred): Bericht Abschnitt 4 — die als Beleg genannten Dateien `scratchpad/mutationen.txt` und `scratchpad/mutate.py` existieren im Arbeitsbaum nicht (`find . -maxdepth 3`). Das ist eine Nachlesbarkeitsluecke, KEIN Zweifel an den Laeufen: die abgedruckte RED-Ausgabe nennt `sitzung.test.ts:128` fuer die Impor
  Task 74: minor (deferred): Bericht — die Abschnittsnummern springen von A12 auf A14 und dann zurueck auf A13; ausserdem ist `abmelden/route.ts` im Bericht ohne Pfad zitiert: die Datei liegt unter `src/app/m/lagerbuch/abmelden/route.ts:91`, nicht unter `helfer/abmelden/`. Der Praezedenzfall selbst ist verifiziert und stimmt.
Task 75: complete (commits 5307a87..d7ec72f, review clean nach 1 Fix-Runde(n); Erstreview specTreu=True, Nachbesserung noetig)
  Task 75: Erstbefund (Important) src/app/m/lagerbuch/_actions/check.ts:88 (dazu check.test.ts:694-695 und Bericht §2 A5) — Der vom Brief woertlich vorgeschriebene Riegel-Kommentar nennt `requireLagerbuchHost` nicht mehr — umgesetzt ist "Der Host-Riegel wird hier NICHT gerufen". Per grep nachgeprueft: der Bezeichner kommt in der ganzen Datei 
  Task 75: Erstbefund (Important) src/app/m/lagerbuch/_actions/check.test.ts:678-686 — Der Test `it("wertet den Riegel-Rueckgabewert AUS")` besteht ausschliesslich aus zwei Schreibweisen-Scans: `expect(q).toMatch(/const riegel = await requireHelferSchreibend\(db\);/)` und `expect(q).toMatch(/if \(!riegel\.
  Task 75: minor (deferred): check.ts:240-245 und check.test.ts:497-506 behaupten einen Schutz, der end-to-end nicht greift: beide zitieren `_lib/lesepfade/checks.ts:174` (`nenn === null`), aber Zeile :168 bildet `x.nennfuelldruckBar ?? f?.nennfuelldruckBar ?? null` — das geschriebene `null` faellt auf die Stammzeile zurueck, u
  Task 75: minor (deferred): Rollback ist nur fuer `buchungen` und `checks` zugesichert, nicht fuer `o2_messungen` — dabei ist die Messung der einzige Schreibpfad VOR Wurf 4 (Verfall). Der Bericht begruendet die Auslassung mit Regel 4; vertretbar, aber die Zusage bleibt ungedeckt.
  Task 75: minor (deferred): Keine Zusicherung auf die ZUSAMMENGESETZTE Reihenfolge aus §5.8: I4 prueft die Korrektur allein, "lagert die bestaetigte Menge um" nur die Rueckgabezaehler. Ein Fall "Fahrzeugbestand == istSumme + nachgefuellt nach beiden Schritten" fehlt.
  Task 75: minor (deferred): Mutationsabdeckung ohne gefahrene Probe: Wurf 1 (fremde Soll-Position), Wurf 2 (fremdes Geraet) und Wurf 4 (fremder Artikel) — nur Wurf 3 wurde mutiert (h) —, sowie die Kernaussage "pro ARTIKEL statt pro Position" (§5.7.1). Alle vier sind nach Durchsicht argumentativ geschlossen (jeweils faellt der 
  Task 75: minor (deferred): `bemerkung`, `recordedVorher` und `korrektur` im geschriebenen JSON sind ungetestet; der Feldnamen-Vertrag (§4.10, 1:1-Pflicht 2) wird nur fuer sollPositionId, geraetId, nachfuellGebucht, nennfuelldruckBar und artikelId gehalten.
  Task 75: minor (deferred): check.test.ts:197 und :215 pruefen den Riegeltext gegen `RIEGEL_TEXTE.sitzung`/`.gesperrt` statt gegen das Literal (der Brief druckte das Literal). Traegt weiterhin die Zuordnung Grund → Text; den Wortlaut traegt actionTypen.test.ts:44-52. Unschaedlich, aber schwaecher als abgedruckt.
  Task 75: minor (deferred): actionTypen.test.ts:24-26 — `expect(Object.keys(zuOrdnung).sort()).toEqual([…])` ist zur Laufzeit eine Tautologie (der Test baut das Objekt selbst). Der Traeger ist die Typannotation `Record<HelferGrund, true>`, die bei Wegfall UND bei Zugang eines Wertes `pnpm typecheck` bricht — korrekt so gebaut,
  Task 75: minor (deferred): Vier tautologische Zugaben neben tragenden Zusicherungen, alle unschaedlich: check.test.ts:233 (`not.toBe("netz")` nach `toBe("eingabe")`), :254 (`not.toMatch(/Verbindung/)` nach `toBe(<Literal>)`), :468 (`not.toBe("tk1")`), :531 (`not.toBe(0)` nach `toBe(null)`).
  Task 75: minor (deferred): Bericht §4 zitiert eine RED-Meldung (`Cannot find module`), die vom Brief abweicht (`Failed to resolve import`). Sachlich dasselbe.
  Task 75: minor (deferred): Geprueft und verworfen: `db?: DB` als zweiter Server-Action-Parameter ist kein Riegel-Bypass — ueber die RSC-Grenze sind nur Daten serialisierbar, ein untergeschobenes `db` haette kein `.select`/`.transaction` und endete in einem TypeError. Zudem plan-vorgegeben und deckungsgleich mit `_actions/gate
GATE Welle 4 GRÜN: typecheck ok · lint 0 Fehler / 6 Bestands-Warnungen · vitest 234 Dateien / 4066 Tests · build ok.
=== WELLE 5 (T76-T78) und WELLE 6 (T79-T80) beginnen ===

=== WELLEN 5+6 via Workflow wf_f5aa43a1-077 (18 Agenten, 2.4M Token, 4.8 h) ===
Task 76: complete (commits d7ec72f..4094d36, review clean nach 1 Fix-Runde(n); Erstreview specTreu=True, Nachbesserung noetig)
  Task 76: Erstbefund (Important) src/app/m/lagerbuch/_ui/HelferRahmen.tsx:498 (Diff-Zeile 498), gedeckt nur durch src/app/m/lagerbuch/_ui/HelferRahmen.test.tsx:258-287 — Die 30-Minuten-Warnschwelle `laeuftAb.getTime() - jetzt.getTime() <= 30 * 60_000` ist nicht zugesichert. Die beiden SSR-Tests fahren mit `+6 h` (F1) und `+10 min` (F2) und halten damit nur das VORZEIC
  Task 76: minor (deferred): `.beenden { min-height: 44px }` (src/app/m/lagerbuch/_ui/helfer.module.css:127-132) verfehlt die Querschnittsregel 'Tap-Mass 56px an jeder Flaeche'. Die Flaeche wird von T76 gerendert, die Regel steht aber in T64s bereits abgenommener Datei und NICHT im Diff; `.tab` direkt darunt
  Task 76: minor (deferred): Die Commit-Nachricht sagt 'twanzig Mutationen gefahren, alle gefangen'; tatsaechlich 21 gefahren, 20 gefangen (D3' ueberlebte und ist selbst der Befund). Im Bericht Abschnitt 4 offengelegt, Historie bewusst nicht umgeschrieben.
  Task 76: minor (deferred): `expect(genutzt.length).toBeGreaterThanOrEqual(10)` (HelferRahmen.test.tsx:393) sitzt exakt auf dem heutigen Bestand von 10 Klassen. Entfaellt spaeter eine Klasse legitim, wird der Test aus dem falschen Grund rot; ein Wert mit Luft (z. B. >= 6) hielte dieselbe Aussage.
  Task 76: minor (deferred): Die Dokumentreihenfolge `<nav>` NACH `<main>` ist nicht geprueft — der Test sichert nur, dass beide innerhalb von `.rahmen` liegen. Eine Tab-Leiste, die ueber den Inhalt rutscht, bliebe gruen.
  Task 76: minor (deferred): HelferRahmen.test.tsx:166 scannt `helfer.module.css` ROH statt ueber `ohneKommentare()`. Heute unschaedlich (geprueft: `.tab[aria-current="page"]` kommt nur auf :143 als Regel vor, der Kommentar :141-142 zitiert den Selektor nicht), aber es ist genau die Bauform aus Befund 1, nur
  Task 76: minor (deferred): HelferRahmen.test.tsx:351-353 (`expect("aktiv" in ohneAktiv).toBe(false)` u. a.) kann konstruktiv nie fehlschlagen; die Zusage 'Pflicht-Prop' traegt ausschliesslich `pnpm typecheck` ueber die drei `@ts-expect-error`-Direktiven. Ich habe geprueft, dass das Gate greift (tsconfig.js
Task 77: complete (commits 4094d36..ae07b6e, review clean nach 1 Fix-Runde(n); Erstreview specTreu=True, Nachbesserung noetig)
  Task 77: Erstbefund (Important) src/app/m/lagerbuch/_ui/Gate.tsx:442-444 (catch → NETZ_TEXT_GATE, definiert :435) — Das `catch` der Client-Hülle beantwortet JEDE Ausnahme des Server-Wegs mit „Keine Verbindung. Der Code wurde nicht geprüft — bitte erneut auf Weiter tippen." — nicht nur den Verbindungsabbruch, sonder
  Task 77: minor (deferred): `Gate.test.tsx:69-92` — die `ohneKommentare()`-Kopie ist NICHT zeichengleich (der Zweig `if (zu === -1) { … }` steht dreizeilig statt einzeilig wie in `_lib/bauform.test.ts`). N-5 verlangt „zeichengleich"; `pwaIcons.test.ts` und `tokenEinloesung.test.ts` sind es (geprüft), `Helfe
  Task 77: minor (deferred): `Gate.tsx:515` — `disabled={laeuft}` ist von keinem Test und keiner der 14 Mutationen gedeckt; entfernte man es, blieben alle 21 Tests grün. Am GEMEINSAMEN Rate-Limit-Eimer (§7.5.3, Falle 24: fünf Fehlversuche/Minute für alle hinter einem Uplink) kostet ein Doppeltipp einen von f
  Task 77: minor (deferred): `Gate.test.tsx:163` — `expect(aktion.mock.settledResults.map((r) => r.type)).toEqual(["rejected"])` ist nahezu tautologisch: der Test hat den Ausgang selbst per `mockRejectedValue` gesetzt, das Ergebnis kann nur `["rejected"]` oder `[]` sein. Faktisch sichert die Zeile nur „genau
  Task 77: minor (deferred): `Gate.tsx:435` — `NETZ_TEXT_GATE` ist der einzige `NETZ_TEXT_*`, der nicht in `_lib/actionTypen.ts` (`:90`, `:98`) steht, und `_lib/gateTexte.ts` behauptet im Kopf „DIE VIER SAETZE. Sie stehen hier und nirgends sonst". Wer die Gate-Wortwahl ändert, sucht dort und findet den fünft
  Task 77: minor (deferred): A-5 (Bericht §8, Bedenken 1): ohne JavaScript löst das Gate keinen Code mehr ein — mit der Client-Hülle rendert React kein `action`-Attribut mehr. Durch Befund 19 erzwungen (Hülle UND progressive enhancement gehen mit der bindenden Zwei-Parameter-Signatur aus `_actions/gate.ts:29
  Task 77: minor (deferred): `Gate.tsx:196-201` / `helfer.module.css:343-347` — der Verwaltungsknopf wird unterstrichen: `Gate.tsx:197` ist die ERSTE Verwendung von `.knopf` auf einem `<a>` (sonst nur `<button>`: `BarcodeScanner.tsx:253`, `Gate.tsx:173`), und `.knopf` setzt kein `text-decoration: none` — and
  Task 77: minor (deferred): Berichtsungenauigkeit: §5 zitiert `scratchpad/t77-voll.txt` (Start 07:43:52) als Volllauf-Beleg, `Gate.tsx` trägt aber Änderungszeit 07:51 — der zum Commit passende Lauf ist `t77-voll2.txt` (Start 07:52:20). Beide sind 236/4107 grün, der Beleg trägt also, aber die zitierte Datei 
Task 78: complete (commits ae07b6e..f2708ee, review clean nach 1 Fix-Runde(n); Erstreview specTreu=True, Nachbesserung noetig)
  Task 78: Erstbefund (Important) src/app/m/lagerbuch/_ui/Entnahme.tsx:152-157 (gegen _ui/helfer.module.css:227-230 und :186) — Die Rückmeldung des Buchungsvorgangs wird in `.chip` gerendert — eine Klasse mit `white-space: nowrap`, `font-size: 12px`, `border-radius: 99px`, `padding: 2.5px 9px` (helfer.module.css:227-230). Der 
  Task 78: minor (deferred): Entnahme.test.tsx:141-142 — die 18a-Falle steht in Zeile 0 noch: Fixture `ch-1` trägt `text: "bis 03/27"` (:105), und der Test sichert `expect(zeilen[0].textContent).toContain("03/27")`. Entfernte man `fmtVerfall` ersatzlos, bliebe diese Zeile grün — ebenso `not.toContain("2027-0
  Task 78: minor (deferred): Entnahme.test.tsx:87 — die als „DIE tragende Zeile" bezeichnete Zusicherung `expect(DEKLARIERT.has(rest[0])).toBe(true)` hat KEINE Mutation. M2 (`ton="ok"` hart verdrahtet) erzeugt eine gültige Klasse und scheitert an `toBe("gelb")` (:155) — beweist `ampelTon`, nicht den Styleshe
  Task 78: minor (deferred): Entnahme.tsx:152-157 — `role="status"` wird gemeinsam mit seinem Inhalt eingehängt (`{rueck && (…)}`) und bei jedem Absenden durch `setRueck(null)` (:60) wieder entfernt. Screenreader kündigen eine so erzeugte Live-Region unzuverlässig an. Kein Punkt dieses Plans verlangt die Ans
  Task 78: minor (deferred): Entnahme.tsx:74-79 — der `gebucht === 0`-Fall rendert in der Insel weiterhin einen GRÜNEN Chip: kommt `{ok:true, wert:{gebucht:0}}` herein — also genau das, was `_actions/buchung.ts` HEUTE liefert —, greift der Teilmengenzweig mit `art: "ok"`. Der eingecheckte, ratifizierte Komme
  Task 78: minor (deferred): Entnahme.tsx:167 dupliziert `darfErneuern` (`actionTypen.ts:111-113`) durch `=== "sitzung"`. Heute deckungsgleich, die Begründung (Gate-Weg ≠ Erneuerungsfeld) ist sachlich richtig; wird `darfErneuern` je erweitert, driftet die Insel still. Ein Verweis-Kommentar wäre billig.
  Task 78: minor (deferred): Entnahme.test.tsx:42-65 — die `ohneKommentare()`-Kopie ist nicht buchstäblich „zeichengleich" (N-5): Prettier hat den einzeiligen `if`-Block der Vorlage (`bauform.test.ts:98`) auf vier Zeilen umgebrochen. Nachgewiesen semantisch identisch (EXACT_EQUAL false / NORMALIZED_EQUAL tru
  Task 78: minor (deferred): Entnahme.tsx:96 und :169 benutzen `.rueckweg` mit `min-height: 44px` (helfer.module.css:211-216) gegen die 56px-Querschnittsregel. NICHT T78s Befund: `LeerZustand.tsx:51` benutzt dieselbe Klasse bereits im abgenommenen Bestand — der Posten gehört an T64 bzw. an ein Wellen-Review.
  Task 78: minor (deferred): Entnahme.test.tsx:251 bleibt bewusst vakuum-grün: `exists("[data-rolle='erneuern']")` kann in dieser Datei für keine Eingabe fehlschlagen. Der Bericht sagt das in A5 selbst; die tragende Zusicherung steht in :252 daneben.
  Task 78: minor (deferred): Entnahme.tsx:58 (`Math.min(menge, detail.bestand)`) ist ungedeckt — vom Bericht unter Bedenken 1 korrekt benannt, heute über den Stepper-Deckel unerreichbar. Kein Handlungsbedarf.
  Task 78: minor (deferred): `pnpm build` wurde nicht gefahren (Bericht, Bedenken 2). Für einen Insel-Task ohne Route-Anbindung folgenlos; Gate Stufe 5 der Welle schuldet ihn weiterhin, samt N-6 (`git checkout -- next-env.d.ts`).
Task 79: complete (commits f2708ee..d937adf, review clean nach 1 Fix-Runde(n); Erstreview specTreu=True, Nachbesserung noetig)
  Task 79: Erstbefund (Important) src/app/m/lagerbuch/_ui/CheckFlow.tsx:883-887 — Der Knappheits-Satz („Handlager reicht nicht für alle Positionen – es wird nur gebucht, was verfügbar ist.", 83 Zeichen) steht in einem `HelferChip`. `_ui/helfer.module.css` führt `.chip { padding: 2.
  Task 79: Erstbefund (Important) src/app/m/lagerbuch/_ui/CheckFlow.tsx:624-658 — Die fünf Auswahlknöpfe des Geräteschritts (`geraet-vorhanden`, `geraet-fehlt`, 3× `geraet-zustand`) tragen `type`, `aria-pressed`, `data-rolle`, `onClick` — und KEINE `className`. Weder `helfer.module
  Task 79: Erstbefund (Important) src/app/m/lagerbuch/_ui/CheckFlow.tsx:742 — `<div className={`${s.pruefKreis} ${st?.niedrig ? s.pruefKreisFehl : s.pruefKreisOk}`} />` — bei `nennfuelldruckBar === 0` ist `st === null`, der Ausdruck fällt auf `s.pruefKreisOk`, und das ist laut 
  Task 79: Erstbefund (Important) src/app/m/lagerbuch/_ui/CheckFlow.test.tsx:487-518 — Der einzige Geräteschritt-Test liest ausschließlich `aria-pressed`. Das Inline-`<svg>` `Haken` (`CheckFlow.tsx:115-127`, benutzt `:631`, `:641`, `:654`) — die sehende Hälfte der Befund-35-Reparatur — 
  Task 79: minor (deferred): `ohneKommentare()` ist gegenüber der Vorlage in `_lib/bauform.test.ts` NICHT zeichengleich, sondern prettier-umbrochen (`CheckFlow.test.tsx:35-58`, der `if (zu === -1) { … }`-Einzeiler auf drei Zeilen). Semantisch identisch und zeichengleich mit der Kopie in `_ui/Entnahme.test.ts
  Task 79: minor (deferred): Die Live-Vorschau-Zusicherung ist schwächer als sie aussieht (`CheckFlow.test.tsx:290-305`): eine einzige Position, und die läuft ab — auch ein konstantes `1` oder `soll.length` ergäbe „1 laufen ab". M16 fängt die realistische Mutation, aber eine zweite Position mit `2030-01` bei
  Task 79: minor (deferred): Der Testname „sendet die Nutzlast und zeigt die Kennzahlen" (`CheckFlow.test.tsx:603`) verspricht mehr als der Rumpf hält — geprüft werden nur die Kennzahlen; die Nutzlast prüfen die drei Tests im `describe` darüber.
  Task 79: minor (deferred): B1 des Berichts ist ein echter Posten und richtig eskaliert statt eigenmächtig repariert: die Knappheitswarnung ist über den Regelweg unerreichbar (der Greedy deckelt selbst an der Verfügbarkeit), und ihr Text liest sich, als beschriebe er den Automatikfall. Der Fall, in dem der 
  Task 79: minor (deferred): `fahrzeugBestand` ist tot (B3 des Berichts) — richtig gemeldet; die Prop steht so im vorgeschriebenen `CheckPos`-Vertrag des Briefs und wird von T85 gefüllt. Kein Befund.
  Task 79: minor (deferred): Die Abschlusszeile des Sauerstoffschritts (`CheckFlow.tsx:790`) nennt nicht bewertbare Flaschen gar nicht (`niedrig === 0 ? "N Flasche(n)" : "N niedrig"`); nur die Ergebniskarte tut es. Plan-1:1.
  Task 79: minor (deferred): Die `bemerkung` im Geräteschritt ist ungetestet (B4 des Berichts): der Nutzlast-Test sichert über `toStrictEqual` nur die Abwesenheit des Schlüssels. Zwei Zeilen wären es wert.
  Task 79: minor (deferred): Nachgerechnet und korrekt: 27 `it()`-Rümpfe im Plan gegen 40 in der Datei, 94 `expect`; die erwartete Nutzlast (`ist: 3`, `nachfuellMenge: 2`, `vorhanden: false`, `druckBar: 199`, `verfaelle: []`); der greedy Deckel `["2","0"]` und die Handeingabe `["2","3"]`; alle 31 benutzten C
Task 80: complete (commits d937adf..5eae8a6, review clean nach 0 Fix-Runde(n); Erstreview specTreu=True, Freigegeben)
  Task 80: minor (deferred): `ohneKommentare()` ist NICHT zeichengleich kopiert (`_ui/FahrzeugWahl.test.tsx:57-60` gegen `_lib/bauform.test.ts:98` und `_lib/pwaIcons.test.ts:33`): die Vorlage hat `if (zu === -1) { imBlock = true; return zeile.slice(0, auf); }` einzeilig, die Kopie bricht denselben Block auf 
  Task 80: minor (deferred): Tap-Maß 56px auf der Fahrzeugzeile nicht erfüllt: ~42,75px (`helfer.module.css:193-196` = `padding: 12px 14px`, kein `min-height`; 12 + 15px×1.25 + 12). Der Fall steht im eigenen Fixture (`MTW`, `kennung: null`). BEWUSST Minor statt Important: die Regel liegt in T64s Datei, die T
  Task 80: minor (deferred): Bei leerer Liste bleibt eine leere `.karte` stehen (umrandeter Kasten ohne Inhalt); Test 6 zementiert diese Form. Der Fall soll nie eintreten (T85 rendert `LeerZustand`), ein `fahrzeuge.length > 0 &&` um die Karte wäre die billige Versicherung gegen ein Versäumnis in T85.
  Task 80: minor (deferred): `expect(genutzt.length).toBeGreaterThanOrEqual(6)` (`FahrzeugWahl.test.tsx:203`) ist mit exakt 6 genutzten Klassen randscharf erfüllt — anders als der Schwesterriegel `>= 50` gegen tatsächlich 74. Jedes Entfernen einer Klasse macht künftig den Riegel statt der eigentlichen Zusage
  Task 80: minor (deferred): Kein `data-rolle` an der Fahrzeugzeile, während `ArtikelSuche.tsx:103`, `Entnahme.tsx:215` und `LeerZustand.tsx:45/48` es führen. Für Vitest reichen Klassen-/Elementselektoren; für T85 oder einen späteren Playwright-Lauf ist die CSS-Modul-Klasse ein Hash und kein Griff.
  Task 80: minor (deferred): Der Kopfkommentar nennt die T101-Zukunft des Zeichens nicht — `ArtikelSuche.tsx:113` trägt „Lokales Inline-SVG (E3); Teil 5, T101 hebt es nach `_ui/ikonen.tsx`.", `FahrzeugWahl.tsx` hat dasselbe SVG ohne diesen Hinweis.
  Task 80: minor (deferred): Drei schwache (nicht wirkungslose) Zusicherungen, vollständigkeitshalber genannt: `expect(kopf.contains(zeilen[0]!)).toBe(false)` trüge in fast jeder Baumform; `toMatch(/zeile/)` bzw. `/karte/` würden auch von `zeileHaupt`/`karteTitel` erfüllt (die Schärfe liefert erst Test 8, wa
GATE Wellen 5+6 GRÜN: typecheck ok · lint 0 Fehler / 6 Bestands-Warnungen · vitest 239 Dateien / 4175 Tests · build ok.
=== WELLE 7 (T81-T86) beginnt ===

=== WELLE 7, Teil 1 via Workflow wf_a98d704f-326 (7 Agenten) ===
Task 81: complete (commits 5eae8a6..c895bff, review clean nach 0 Fix-Runde(n); Erstreview specTreu=True, Freigegeben)
  Task 81: minor (deferred): Regel 4 — `src/app/m/lagerbuch/page.test.tsx`, "angemeldet OHNE Lagerbuch-Gruppe bleibt stehen und sieht BEIDE Karten": der Titel verspricht mehr als der Rumpf haelt (die Insel ist eine Attrappe, "beide Karten" wird nirgends geprueft), und die Link-Zusicherung ist wortgleich mit 
  Task 81: minor (deferred): `page.test.tsx`, "nennt NIE einen literalen Prod-Host": `expect(link).not.toContain("iuk-ue.de")` steht nach einem `toBe(...)` auf denselben String und kann konstruktiv keinen zusaetzlichen Fehlerfall fangen.
  Task 81: minor (deferred): `page.test.tsx`, "eine Person OHNE Sitzung ...": `expect(query("[data-rolle='gate']")).toBeTruthy()` ist als Zusicherung leer — `query` wirft bereits bei Nichttreffer (`src/app/m/qr/_lib/test-dom.tsx:116`). Getragen wird der Fall vom Wurf, nicht vom expect.
  Task 81: minor (deferred): `page.test.tsx`, "die Insel haengt INNERHALB von `.rahmen`": `Node.contains` ist auch fuer den Knoten selbst `true`; die Faelle trennt allein das vorangehende `className`-`toMatch`.
  Task 81: minor (deferred): Zwei fehlende Mutationsproben: (a) B-1 — verdrahteter Prod-Host statt `verwaltungsZiel(kopf)`, die bindendste Einzelregel dieses Tasks; (b) Wegfall von `OeffentlicherRahmen`. Beide Zusicherungen tragen nachweislich (im M7-Protokoll fallen genau sie mit), es fehlt nur die eigene P
  Task 81: minor (deferred): Bericht Abschnitt 4, M6: als "die beiden Sekundenzahl-Tests" beschrieben; das gelesene Protokoll `t81-mutationen.txt` zeigt als zweiten Fehlschlag "fragt die Schranke mit DEM Absenderschluessel" — "ist die Sperre inzwischen abgelaufen" bleibt gruen, weil `null` denselben Satz erz
  Task 81: minor (deferred): `pnpm build` wurde nicht gefahren (der Brief verlangt es in Schritt 5 nicht, `CLAUDE.md` fuehrt es unter den Toren). `page.tsx` ist die einzige `page.tsx` des Moduls, und ihr verengter `searchParams`-Typ wird erst vom Build gegen Nexts generierte PageProps gehalten. Risiko gering
  Task 81: minor (deferred): `?grund=gesperrt` und `?grund=abgelaufen` werden auf dieser Seite nicht gerendert — die Durchreichung ist nur fuer zwei der vier `GateGrund`-Werte belegt. Die Texte selbst sind in `_lib/gateTexte.ts` (Teil 2) gedeckt.
  Task 81: minor (deferred): Bauform-Scan "exportiert NUR `default` und `dynamic`": die plan-vorgegebene Regex `^export (?:const|async function|function) (\w+)` sieht `export { ... }`, `export type` und eingerueckte Exporte nicht. Fuer die heutige Datei folgenlos.
  Task 81: minor (deferred): Belegpfade im Bericht sind als `/private/tmp/.../scratchpad/` abgekuerzt. Ich habe `t81-gates.txt`, `t81-mutationen.txt` und `t81-vitest-all.txt` in dieser Sitzung gefunden und vollstaendig gelesen — ein spaeterer Leser kann das nicht. Regel 3 meint zitierbare Ausgaben; der volle
  Task 81: minor (deferred): Rauschen im Gesamtlauf (`window.getComputedStyle is not implemented`, ~30 Stackframes in `t81-vitest-all.txt`) stammt aus antd-Bestandstests (`@rc-component/table`, `@rc-component/portal`), nicht aus T81 — hier nur festgehalten, damit es niemand diesem Task zuschreibt.
Task 82: complete (commits c895bff..f3a7eea, review clean nach 1 Fix-Runde(n); Erstreview specTreu=True, Nachbesserung noetig)
  Task 82: Erstbefund (Important) src/app/m/lagerbuch/_lib/bauform.test.ts:854 — Um den T64-Reihenfolgescan (Betreiberentscheidung B2) fuer die neue Route zu oeffnen, wurde das Host-Muster global auf beide Formen geweitet: `/\b(?:requireLagerbuchHost|lagerbuchHostOderNull)\s*\(/`.
  Task 82: minor (deferred): route.test.ts:281 — `expect(cookie).toContain("Path=/")` traegt seine Regel nicht: @edge-runtime/cookies setzt `Path=/` als Vorgabe, wenn die Option fehlt (node_modules/next/dist/compiled/@edge-runtime/cookies/index.js:326-329). Entfernte man `path: "/"` aus `helferCookieOptionen
  Task 82: minor (deferred): route.test.ts:419-422 — der POSITIVE Host-Scan liest `ohneKommentare` statt der string-strippenden Variante, obwohl bauform.test.ts:105-115 fuer genau diesen Fall ausschreibt, warum ein positiver Scan `ohneKommentareUndZeichenketten` braucht; zusaetzlich fehlt `\s*\(`, so dass sc
  Task 82: minor (deferred): Die Mutationstabelle belegt den asymmetrischen Fall nicht, den der Querschnittstest ausdruecklich verspricht: M4 mutiert `antwort()`, den gemeinsamen Helfer, den alle Zweige durchlaufen. Der Test-Kommentar (route.test.ts:379-382) nennt aber „nur den Erfolgsweg relativ, Gate-Umlei
  Task 82: minor (deferred): route.ts:47 — toter Zweig: `antwort(suche ? `/?${suche}` : "/")`; `zumGate` wird nur mit "zuviele" oder "code" gerufen, `suche` ist nie leer.
  Task 82: minor (deferred): `Secure` und `SameSite=Lax` sind von keiner Zusicherung dieser Datei beruehrt (unter Vitest ist NODE_ENV != production). Gedeckt durch _lib/helferSitzung.test.ts:224,248-250.
  Task 82: minor (deferred): Kein Test fuer eine Anfrage ganz ohne `host`-Kopfzeile — Abdeckung, kein Defekt.
  Task 82: minor (deferred): route.test.ts:451-457 — der `x-forwarded-host`-Scan ist ein reiner Kommentar-Scan ohne Verhaltenszusage. Plan-vorgegeben, und ein Verhaltenstest ist fuer „ein Kommentar existiert" konstruktiv unmoeglich; faellt damit nicht unter das Verbot des Schreibweisen-Scans. Der Test schrei
  Task 82: minor (deferred): Kreuz-Task-Notiz, keine Beanstandung gegen T82: `_lib/schreibpfade/tokenEinloesung.ts:14-19` UND `_actions/gate.test.ts:143-145` tragen weiterhin die von `_db/schema.ts:412-413` widerlegte Behauptung („nicht mehr loeschbar, nur noch sperrbar"). T82 hat sie korrekt nicht uebernomm
  Task 82: minor (deferred): Bericht :13 sagt „130 Zeilen", die Datei hat 129.
Task 83: BLOCKED — _actions/buchung.ts (Teil 5, T114) fehlt. Auflage A2 des Plans ('wird vorgezogen und laeuft VOR Welle 7') wurde nie ausgefuehrt.
  Gemessen: typecheck repo-weit rot (TS2307, a/[artikelId]/page.tsx:17) UND vitest (1 Suite sammelt 0 Tests),
  weil vite:import-analysis an der unaufloesbaren Spezifiziererzeile scheitert, BEVOR eine vi.mock-Registrierung greift.
  Der T83-Commit dbef8ae liegt bereits auf dem Branch, ist aber unreviewt und nicht uebersetzbar.
ENTSCHEIDUNG 06.08.2026 (autonom): T114 wird vorgezogen, wie Auflage A2 es vorsieht — zusammen mit NUR der Typ-/Helferdatei
  _lib/actionErgebnis.ts aus T113. _actions/artikel.ts bleibt bei Teil 5: sie ist eine Verwaltungs-Action, zoege einen fremden
  Zweig in den Branch und verschoebe die Action-Arithmetik, die Teil 6 nachzaehlt. _lib/ zaehlt dort nicht mit.

=== WELLE 7, Teil 2 via Workflow wf_c26c83b0-36a (13 Agenten) ===
Task 113: complete (commits dbef8ae..6b48c8e, review clean nach 0 Fix-Runde(n); specTreu=True, Freigegeben)
  Task 113: minor (deferred): task-113-report.md:134-136 — die TS2578-Fundstellen von M6/M7/M8 sind veraltet: gedruckt (155,5)/(163,5)/(172,5), die @ts-expect-error-Direktiven stehen im eingecheckten Test bei 157/165/174 (Spalte 5 stimmt). TS2578 verankert an der Direktive, die drei Proben liefen also gegen e
  Task 113: minor (deferred): src/app/m/lagerbuch/_lib/actionErgebnis.test.ts:151 — der Blockkommentar sagt „DIE DREI ZUSICHERUNGEN DIESES BLOCKS“, der describe-Block hat aber vier it()-Körper, und der vierte beansprucht im eigenen Kommentar ebenfalls tsc als Träger (der Bericht spricht selbst von vier). Nach
  Task 113: minor (deferred): src/app/m/lagerbuch/_lib/actionErgebnis.test.ts:165,174 — der `ok: false`-Zweig wird nur NEGATIV geprüft (zwei @ts-expect-error-Proben); es gibt keine positive Konstruktion `{ ok: false, fehler: "…", feldFehler: { … } }`. Würde der Fehlerzweig mistypisiert (z.B. `feldFehler?: Fel
  Task 113: minor (deferred): src/app/m/lagerbuch/_lib/actionErgebnis.ts:41 — `feld in karte` trifft auch Prototyp-Schlüssel; ein Zod-Issue an einem Feld namens `toString`/`constructor`/`__proto__` würde still verworfen bzw. nicht als eigener Schlüssel abgelegt. Mit keinem Schema dieses Moduls erreichbar und 
  Task 113: minor (deferred): src/app/m/lagerbuch/_lib/actionErgebnis.ts:40 — `path.join(".")` wirft bei einem symbol-Pfadeintrag (zod v4 kann das über `z.record(z.symbol(), …)` erzeugen). Kein Verwender dieses Moduls benutzt Symbol-Schlüssel; vom Umsetzer selbst festgehalten.
  Task 113: minor (deferred): Vier von dreizehn Zusagen hängen an `pnpm typecheck`, nicht an Vitest (`describe("ActionErgebnis — was der Typ ZUSAGT")`, actionErgebnis.test.ts:156-211). Ihre Vitest-expects sind trivial wahr; wer nur `pnpm vitest run` fährt, sieht diese Zusagen nicht. Etablierte Modulform (_ui/
  Task 113: minor (deferred): task-113-report.md:257-261 — geteiltes Scratchpad überschrieben: der Umsetzer hat zu Beginn base-typecheck.txt, base-lint.txt, base-vitest.txt, red.txt, green.txt, lint1.txt, tc1.txt und vitest-all.txt früherer Tasks überschrieben. Betrifft nicht diesen Code, wohl aber die Nachvo
Task 114: complete (commits 6b48c8e..acc44b3, review clean nach 1 Fix-Runde(n); specTreu=True, Nachbesserung noetig)
  Task 114: Erstbefund (Important) src/app/m/lagerbuch/_actions/buchung.test.ts:230-232 (geprüfte Regel: src/app/m/lagerbuch/_actions/buchung.ts:607) — Die Zusicherung „Und NUR bei diesem Artikel" — `expect(…art-2…?.bestelltAt).toBeNull()` — kann konstruktiv nie fehlschlagen. `art-2` wird im `beforeEach` (:131-132) ohne `bestelltAt` eingefügt, und `_
  Task 114: minor (deferred): `buchung.ts:612,693` — `fehler: e.message` reicht rohe SQLite-Texte an die Oberfläche („UNIQUE constraint failed: …"). Für die beiden fachlichen Würfe (I5, Zielprüfung) richtig und getestet; für alles andere Framework-Innenleben in einem Nutzertext. Plan-abgedruckt, `actionErgebn
  Task 114: minor (deferred): `bucheEntnahme` kennt weder einen `leer`- noch einen „gekappt"-Fall: `gebucht: 0` und `gebucht < menge` sind beide `ok:true`. §3 verlangt dafür nichts, und `Entnahme.tsx:74-79` macht den Teilfall auf dem Helfer-Weg bereits sichtbar. Für `ArtikelDrawer` (T127) vormerken.
  Task 114: minor (deferred): Vier `darfErneuern(...)`-Zusicherungen (buchung.test.ts:386,401,419,436) prüfen `_lib/actionTypen.ts`, nicht `buchung.ts` — redundant zu T63, aber keine falsche Abdeckung (sie stehen neben einer echten `grund`-Zusicherung, nicht an deren Stelle). `expect(text.length).toBeGreaterT
  Task 114: minor (deferred): `db` als zweiter Parameter einer `"use server"`-Funktion ist vom Client erreichbar (eine zweite Nutzlast lässt sich mitsenden). Es fällt geschlossen aus — ein JSON-Objekt hat kein `.select`, und `requireLagerbuchHost` läuft innerhalb von `requireHelferSchreibend` ohnehin zuerst —
  Task 114: minor (deferred): Der `"eingabe"`-Satz steht als Literal in `buchung.ts:750`, während alle Geschwistertexte (`RIEGEL_TEXTE`, `leerText`, `NETZ_TEXT_*`) in `_lib/actionTypen.ts` liegen. `check.ts:115` hält es genauso mit einem eigenen Satz — kein Duplikat, aber zwei Texte ohne gemeinsame Heimat; ei
  Task 114: minor (deferred): Der Helfer-Weg wird nur mit EINER Charge gefahren; die FEFO-Reihenfolge samt Tiebreaker `createdAt → chargeId` ist Zusage von `fefoAbbuchung` (Teil 3, T54) und dort getestet. `buchung.ts` sortiert selbst nirgends — die Warnung aus der Teil-3-Übergabe greift hier korrekt nicht.
  Task 114: minor (deferred): Zwischenbefund des Umsetzers bestätigt nützlich: `src/docker-kontext.test.ts` zieht seinen Kontext aus `git ls-files` und wird bei jeder neuen, noch nicht gestagten Produktivdatei rot — mit einer Meldung, die fälschlich auf `.dockerignore` zeigt. Betrifft jeden Nachfolger dieser 
Task 83: complete (commits f3a7eea..dbef8ae, review clean nach 0 Fix-Runde(n); specTreu=True, Freigegeben) [Review nachgeholt]
  Task 83: minor (deferred): `ohneKommentare()` ist nicht zeichengleich zur Vorlage (page.test.tsx:30-53 vs. _lib/bauform.test.ts:84-104): T83 bricht `if (zu === -1) { imBlock = true; return zeile.slice(0, auf); }` auf drei Zeilen um (:44-47), waehrend Vorlage UND alle drei bestehenden Kopien (_lib/pwaIcons.
  Task 83: minor (deferred): Bericht §4, Ueberschrift "Mutationsproben — 14 gefahren, 14 rot" (task-83-report.md:200) stimmt nicht: die Tabelle hat 14 Zeilen, davon ist M3 GRUEN (:209, "28/28 GRUEN"). Richtig ist 13 rot, 1 gruen (M3, korrigiert durch M3'). Der Fliesstext :222-228 erklaert es korrekt; die Ueb
  Task 83: minor (deferred): page.test.tsx:241-247 ("das returnTo traegt den AEUSSEREN Pfad") ist vollstaendig subsumiert vom toEqual(["/?returnTo=%2Fa%2Fart-9"]) in :234. Regel 4: er haelt keinen Fall allein. Loeschen oder zuschneiden.
  Task 83: minor (deferred): page.test.tsx:296-303 ("nimmt NUR params entgegen — kein Zugang aus einer zweiten Quelle") traegt seinen Namen nicht; vom Umsetzer selbst als S2 benannt. Er faellt zwar durch, wenn die Seite den Zugang als Prop erwartete, ist aber gegenueber :275-293 ohne eigenen Beitrag. Umbenen
  Task 83: minor (deferred): page.test.tsx:485-487: in der Schleife [/RENDERN/, /verwaltung\/artikel/, /returnTo/] gegen den Rohtext treffen zwei der drei Muster den CODE (page.tsx:84 bzw. :91), nicht den Kopfkommentar — die Zusage "der Kopfkommentar traegt die drei Ausgaenge" wird von ihnen nicht getragen. 
  Task 83: minor (deferred): expect(getDb).toHaveBeenCalled() ohne Zaehlung (page.test.tsx:285). S3 des Berichts. Folgenlos, weil getDb() ein gecachtes Handle liefert.
  Task 83: minor (deferred): Das Sitzungsetikett ist ein nacktes Literal (page.tsx:96, `Zugang: Token ${zugang.code} · ${zugang.label}`) und kommt heute nur in dieser Datei vor. T84 und T85 bauen die beiden Helfer-Seiten und muessen es wortgleich wiederholen, sonst driftet die Rahmen-Beschriftung. Ein etiket
  Task 83: minor (deferred): Der Host-Riegel laeuft doppelt (page.tsx:66 und _lib/helferZugang.ts:111), also zwei await headers() pro Anfrage. Gewollt (A10) und von task-87-brief.md:53-55 als Abnahme verlangt; die Alternative waere eine Planentscheidung.
  Task 83: minor (deferred): Ein GESPERRTER Zugang landet ueber Ausgang 3 wortlos am Gate: helferZugangOderNull (_lib/helferZugang.ts:110-114, "LEITET NICHT UM UND LOESCHT NICHTS") kollabiert {ok:false, grund:"gesperrt"} zu null. Plan-vorgegeben — die Drei-Ausgaenge-Tabelle schreibt genau redirect("/?returnT
  Task 83: minor (deferred): Die Cordon-Behauptung im Kopfkommentar (page.tsx:55-57, "/a/<id> bleibt in der Cordon-Allowlist") ist von hier aus unpruefbar — in dieser Suite gibt es keine cordon.ts. Korrekte Herkunftsmarke, aber keine Zusage, die ein Test haelt (B4 des Berichts).
  Task 83: minor (deferred): pnpm build wurde nicht gefahren (B3 des Berichts) und ich habe ihn bewusst nicht nachgeholt: er schriebe next-env.d.ts und .next/ (N-6) und braeche das read-only-Mandat. typecheck deckt die Route-Props-Form ab, die Datei importiert weder antd noch @ant-design/icons. Bleibt dem We
Task 84: complete (commits acc44b3..817322c, review clean nach 0 Fix-Runde(n); specTreu=True, Freigegeben)
  Task 84: minor (deferred): M-1 — `src/app/m/lagerbuch/_lib/helferZugang.ts:118`: der Docblock von `requireHelferSitzung` sagt weiterhin "AUFRUFER: `helfer/layout.tsx`, SONST NIRGENDS (§2.8)", es sind jetzt zwei und mit T85 drei. Die Auflage zu Befund 38 ist erfuellt (Kommentar steht in `helfer/page.tsx:445
  Task 84: minor (deferred): M-2 — Mutationsluecke an der tragenden Regel: `expect(kopfRufe).toBe(1)` in `src/app/m/lagerbuch/helfer/page.test.tsx:355` (Seite) ist unmutiert. M1 setzt den Doppelaufruf nur ins LAYOUT zurueck, M3 geht in die Gegenrichtung (interner Riegel weg → Zaehler 0). Kein Lauf zeigt, das
  Task 84: minor (deferred): M-3 — unfalsifizierbare Zusicherung: `expect(exists("[data-testid='lb-tableiste']")).toBe(false)` in `page.test.tsx:301` kann in dieser Datei nie true werden, weil `_ui/HelferRahmen` durch eine Attrappe ersetzt ist, die ausschliesslich `data-rolle="rahmen"` ausgibt. Die Zeile dan
  Task 84: minor (deferred): M-4 — redundante Zusicherung: `expect(umleitungen).toEqual([])` in `page.test.tsx:280` ist von `rejects.toThrow("NEXT_NOT_FOUND")` bereits subsumiert — die `redirect`-Attrappe wirft `NEXT_REDIRECT:…`, ein Redirect haette den `toThrow` schon rot gemacht. Schadet nicht, traegt aber
  Task 84: minor (deferred): M-5 — A7 ist nicht ganz kostenlos, anders als der Bericht sagt ("Der Tausch kostet nichts an dieser Stelle"). Durch die `_lib/helferSitzung`-Attrappe laufen zwei Riegelzweige in dieser Datei nie an: `redirect("/")` bei fehlendem Cookie (`helferZugang.ts:139`) und `/abmelden?grund
  Task 84: minor (deferred): M-6 — `<div className={s.schirmKopf}>Artikel waehlen</div>` (`helfer/page.tsx:56`) ist keine Ueberschrift; `HelferRahmen` liefert `<main>` (`:118`), aber kein `<h1>`. Auf einem oeffentlichen, login-freien Weg hat die Seite damit keine Ueberschriftenstruktur. KEIN T84-Befund: gepr
  Task 84: minor (deferred): Nachgerechnet und BESTAETIGT: die Berichtszahl "14 `it`, 28 `expect`" stimmt (Layout-describe 6 Ruempfe mit 3/2/3/2/1/1 = 12, Seiten-describe 8 Ruempfe mit 3/3/1/1/4/1/2/1 = 16). Kein `it()` ohne `expect`, keine Schleife ueber einen Selektor, keine Zusicherung gegen eine selbst g
Task 85: complete (commits 817322c..bdb0e45, review clean nach 0 Fix-Runde(n); specTreu=True, Freigegeben)
  Task 85: minor (deferred): M13 ist mislabeled: der Mutant heisst `ansatzpunkt-kommentar-woanders`, verschiebt den Kommentar aber nicht, sondern ersetzt nur `tokens.scope_lagerort_id` im Block ueber `const gewaehlt` durch "einer Spalte". Da die Zeichenfolge sonst nirgends in der Datei steht, waere der naive
  Task 85: minor (deferred): page.test.tsx:510-511 prueft `data-warn` gegen `JSON.stringify(verfallSchwellen())`, also gegen dieselbe Funktion, die die Seite ruft. Das ist NICHT die verbotene "Zeichenkette aus demselben Literal" (beide Seiten rufen eine Funktion), und M15 zeigt gemessen, dass die Zusicherung
  Task 85: minor (deferred): Der Flaschen-Feldmengen-Test (page.test.tsx:484-485) ist heute wirkungslos: `_lib/lesepfade/o2.ts:142-145` liefert bereits exakt die vier Felder von `CheckFlasche`, das `.map()` in page.tsx:112-114 ist ein No-op. Der Umsetzer sagt es selbst (A9); die Sonde ist Absicherung gegen k
  Task 85: minor (deferred): Fuer "haengt den Inhalt INNERHALB des Rahmens" (page.test.tsx:535-542) gibt es keine eigene Mutation; der Test stirbt an M7/M14 nur mit, weil sich dort der ganze Render aendert. Eine Mutation "Rahmen und Inhalt als Geschwister" haette ihn allein getoetet. Die Zusicherung ist trot
  Task 85: minor (deferred): page.tsx:55 typisiert `searchParams` als `{ fz?: string }`; Next kann bei `?fz=a&fz=b` ein `string[]` liefern. Das Verhalten degradiert sicher (kein Treffer in `find` -> Wahl bzw. Einzelfall, kein Absturz, kein falsches Laden), und die schmale Form ist im Bestand etabliert (`m/qr
  Task 85: minor (deferred): `pnpm build` und ein echter Abruf fehlen (laut Brief sind die Gates typecheck/lint/vitest, die Abrufprobe steht in T87). "HTTP 200 auf /helfer/check" ist bis dahin nicht gemessen. Falle 6 ist fuer die sechs wertimportierten Module dagegen ausdruecklich gemessen, Falle 7 konstrukt
  Task 85: minor (deferred): Anmerkung zum Typsystem, kein Mangel dieses Tasks: der `.map()`-Callback in page.tsx:115-117 liefert ein Array statt eines Tupels, womit `Object.fromEntries` in die `Iterable<readonly any[]>`-Ueberladung faellt und `any` zurueckgibt. "typecheck exit 0" sagt ueber `verfall` also n
Task 86: complete (commits bdb0e45..88a5c52, review clean nach 0 Fix-Runde(n); specTreu=True, Freigegeben)
  Task 86: minor (deferred): `pwa.route.test.ts:542` — `expect(riegel).toMatch(/lagerbuchHostOderNull\s*\(/)` läuft über `ohneKommentare()`, nicht über `ohneKommentareUndZeichenketten()`: ein Textliteral erfüllte ihn. Die EINZIGE Zusicherung der Datei, die ohne ihre Regel grün bliebe. Kein Befund, weil der T
  Task 86: minor (deferred): `_lib/host.ts:52-67`: die §2.6-Tabellenzeile „manifest + vier Icon-Handler → lagerbuchHostOderNull" beschreibt nach dem Umbau einen transitiven Aufruf über `_lib/hostRiegel.ts`. Der Sache nach weiter wahr; wer §2.6-Treue per Grep über die fünf Dateien prüft, findet den Namen aber
  Task 86: minor (deferred): Bericht A8 enthält eine Regel-4-Behauptung ohne Probe: „`pngAntwort` könnte durch `new Response(base64)` ersetzt werden, und der Byte-Test von T65 bliebe grün" ist argumentiert, nicht gemessen. Strukturell plausibel (T65 liest die exportierte Konstante, dieser Test die Antwort), 
  Task 86: minor (deferred): Kein `hostRiegel.test.ts` für die neue geteilte Sicherheitszusage. Vertretbar — die drei Zeilen sind über zehn Verhaltenstests und den Nicht-werfend-Scan vollständig ausgeübt, und `bauform.test.ts` kennt keine Geschwister-Pflicht —, aber es ist die Stelle, an der ein künftiger Um
  Task 86: minor (deferred): Der Riegel-Block steht repo-weit weiterhin siebenmal: `t/[code]/route.ts` und `abmelden/route.ts` tragen die `if`-Form. Korrekt ausgeklammert (fremde Tasks) und im Bericht als Bedenken 1 offengelegt; bei `t/[code]/route.ts` ginge ohnehin kein `??`, weil danach fünf weitere Schrit
  Task 86: minor (deferred): `public/login-bg.jpg` hat denselben Falle-56-Fall wie die drei PNG hatten (auf dem lagerbuch-Host wird `/login-bg.jpg` nach `/m/lagerbuch/login-bg.jpg` umgeschrieben → 404). Außerhalb des Umfangs, aber real und heute ungeprüft — gehört als Posten weitergegeben.
  Task 86: minor (deferred): `pwa-icon.svg`-Bytemessung (`pwa.route.test.ts:481-482`) geht über `text()` + `Buffer.byteLength(…, "utf8")` statt über `arrayBuffer()`. Für gültiges UTF-8 verlustfrei und damit korrekt; `arrayBuffer()` wäre die direktere Form und näher an dem, was der Browser bekommt.
  Task 86: minor (deferred): Kein `charset` am `Content-Type` von Manifest (`application/manifest+json`) und SVG, obwohl der Manifest-Rumpf `·` und `ä` enthält. Unkritisch: die Manifest-Spezifikation dekodiert unbedingt als UTF-8, und die Alt-Anwendung machte es zeichengleich genauso.
  Task 86: minor (deferred): `description` weicht als einziger Wert inhaltlich vom Alt-Manifest ab („Bestand, Fahrzeuge, Geräte" statt `APP_TAGLINE` = „Materialverwaltung", von mir an `../lagerbuch/src/lib/config.ts:32` bestätigt), und `scope` hat gar kein Alt-Gegenstück. Beides ist brief-konform (die drei T
GATE Welle 7 GRÜN: typecheck ok · lint 0 Fehler / 6 Bestands-Warnungen · vitest 247 Dateien / 4343 Tests · build ok.
  Build listet unter /m/lagerbuch: (Wurzel) · a/[artikelId] · abmelden (Teil 2) · helfer · helfer/check · icon-192.png ·
  icon-512.png · icon-maskable-512.png · manifest.webmanifest · pwa-icon.svg · t/[code] = 11 Einträge, davon 10 aus diesem Plan.
=== WELLE 8 (T87) + ABSCHLUSS-REVIEW beginnen ===
Task 87: complete (commit 49a77c6 = HEAD von Welle 8; Review task-87-review.md, 1 Fix-Runde, danach freigegeben; specTreu=True, Freigegeben)
  ⚠️ ADJUDIKATION des einzigen Important-Befunds B-1 aus task-87-review.md (nachgeholt im Abschluss-Fix, 06.08.2026):
  B-1 IST WIDERLEGT. Die Behauptung "die Abschluss-Abnahme sagt fuenfzehn Neutrale, gemessen sind zwoelf" trifft nicht zu.
    BELEG 1: `src/app/m/lagerbuch/_lib/bauform.test.ts:473-477` definiert `NEUTRALE` als die ZWOELF Farbnamen
             PLUS `--lb-display`, `--lb-body`, `--lb-mono` = 15 Eintraege.
    BELEG 2: `bauform.test.ts:492` ("`.rahmen` traegt alle fuenfzehn Neutralen UND die acht Ampelwerte") sichert
             ALLE FUENFZEHN im KOERPER von `.rahmen` zu — der Scan laeuft gegen genau diese Liste.
    BELEG 3: `task-87-report.md:232` hat es in Fix-Runde 1 bereits so gemessen: 15 = 12 Farben + 3 Schriftstapel,
             23 Deklarationen unter `.rahmen` = 15 + 8. Nachgemessen im Abschluss-Fix und bestaetigt.
    URSACHE DES REVIEW-IRRTUMS: `helfer.module.css:34` sagt korrekt "Die zwoelf Neutralen" ueber die FARBGRUPPE;
             der Reviewer hat die Farbgruppe mit der Liste verwechselt, gegen die der Scan laeuft.
    DER VOM REVIEW VORGESCHRIEBENE FIX WIRD NICHT AUSGEFUEHRT. Er verlangt woertlich den Satz "die Zahl fuenfzehn
             ist falsch, es sind zwoelf" in der Uebergabe an Teil 5. Waere er ausgefuehrt worden, korrigierte T100
             eine der beiden Seiten — und beide Richtungen brechen etwas: die Liste zu kuerzen naehme den drei
             Schriftstapeln ihren Riegel (`_ui/BarcodeScanner.tsx` rendert laut E8/T138 AUCH unter `.modul`, wo ein
             fehlender Stapel still auf die Vorgabeschrift faellt); die Zahl im Plan zu aendern schuefe einen
             Widerspruch zu einer laufenden Zusicherung.
    In `docs/superpowers/plans/UEBERGABE-lagerbuch-teil4.md` §2 steht die Richtigstellung samt Warnung getrackt.
  Task 87: minor (deferred): Die Minor-Liste des T87-Reviews (§5) hat SECHS Eintraege, nicht vier, wie das
    Abschluss-Review annimmt (abschluss-review-spec.md:111-112) — Fix-Runde 1 hat ausschliesslich B-1 bearbeitet und
    keinen Minor geschlossen (task-87-report.md:469-478 sagt es selbst: "Geaendert wurde in dieser Runde ausschliesslich
    task-87-report.md"). Ich uebernehme deshalb ALLE SECHS und sage es:
  Task 87: minor (deferred): [T87-M1] Bericht §7 ("Testguete", task-87-report.md:347) sagt "auch der `NOCH_NICHT`-Zweig
    sichert die Nicht-Existenz ausdruecklich zu, statt still zurueckzukehren". Tut er nicht — `it.runIf` ueberspringt und
    sichert gar nichts zu, und der Kommentar im selben Commit (`bauform.test.ts:201-211`) argumentiert ausdruecklich,
    dass eine Nicht-Existenz-Zusicherung eine der drei verbotenen Formen waere. Der Bericht widerspricht seinem Code.
  Task 87: minor (deferred): [T87-M2] Die Abrufprobe lief gegen `d9a65b0`, nicht gegen HEAD `49a77c6`. Der Unterschied
    ist auf den `it.runIf`-Zweig einer Testdatei beschraenkt und ohne Laufzeitwirkung — korrekt offengelegt, aber es
    bleibt eine Messung an einem anderen Commit.
  Task 87: minor (deferred): [T87-M3] Herkunft der Abrufprobe: rsync-Kopie im Scratchpad, eigenes `pnpm install`,
    handgesetzter `node_modules/@swc`-Symlink, Port 3200. "Die Quellen sind byte-gleich mit dem Arbeitsbaum" ist
    behauptet, nicht per Pruefsumme belegt; der exakt getroffene Wert `200 1558` stuetzt es indirekt. Der
    Wiederholbarkeitshinweis gehoert ins Runbook.
  Task 87: minor (deferred): [T87-M4] Aufruf 5 der Abrufprobe besteht aus dem falschen Grund (307 in den Login, bevor
    der Host-Riegel ueberhaupt greift). In §8.2 offengelegt und auf R2 verwiesen — richtig behandelt, aber die Zeile in
    §4.2 liest sich fuer sich genommen staerker, als sie ist. R2 steht jetzt in docs/runbooks/lagerbuch-cutover.md §10.
  Task 87: minor (deferred): [T87-M5] Die T64-Auflage (Bericht §5) beantwortet die Frage nach T81 nicht, sondern leitet
    neu her, warum `page.tsx` draussen bleibt. Sachlich richtig (die Datei enthaelt kein `redeemToken`), aber der Brief
    hatte ausdruecklich nach den Unit-Tests von T73, T74, T81 und T82 gefragt.
  Task 87: minor (deferred): [T87-M6] Der Kopfkommentar von `_lib/bauform.test.ts:20` sagt weiterhin im Futur "Teil 4
    ergaenzt HIER den `usePathname`-Scan" — der steht laengst. Kosmetisch; der Absatz darunter ("STAND NACH TEIL 4,
    T87") beschreibt den Stand korrekt. NICHT im Abschluss-Fix repariert: Befund 1 schreibt "kein Codeeingriff" vor.

=== ABSCHLUSS-FIX-WELLE 06.08.2026 (neun Important-Befunde aus vier Abschluss-Reviews, EINE Runde) ===

ENTSCHEIDUNG 06.08.2026 (autonom, Form wie B4 und wie die T114-Vorziehung) — Befund 2, Haelfte 1:
  DIE FRAGE 44 GEGEN 56 FUER DIE FUENF GERAETEKNOEPFE IST ENTSCHIEDEN: **44 BLEIBT.**
  `_ui/CheckFlow.tsx:145-175` (`const TIPPZIEL`) haelt seit T79 fest, die Spannung zwischen der Begruendung des
  Reviews ("nicht sekundaer") und dem vorgeschriebenen Wert sei "als Bedenken GEMELDET, nicht hier stillschweigend
  aufgeloest". Im Ledger stand zu T79 keine solche Zeile — die Meldung ist zwischen Fix-Runde und Ledger
  verlorengegangen. Hiermit nachgeholt und geschlossen.
  BEGRUENDUNG: 44 ist deckungsgleich mit `.beenden` und `.rueckweg` (Hausminimum fuer sekundaere Bedienelemente,
  `helfer.module.css`) und im Abschluss-Review §3 als plankonform adjudiziert; die fuenf Knoepfe liegen in
  `.zeileMeta` (helfer.module.css:200) mit `gap: 7px` und `flex-wrap`, die Reihe ist also nicht zu dicht.
  ⚠️ EIN BETREIBER KANN DAS KIPPEN, und der Posten bleibt offen sichtbar: `core/theme/tokens.ts:33` begruendet das
  56er-Tapmass mit "Bedienung mit Handschuhen … eine Einsatzanforderung, keine Stilfrage", und ein Fehlgriff an
  diesen fuenf Knoepfen schreibt "fehlt" oder "Defekt" ins Journal. Wer auf 56 geht, aendert eine Querschnittsregel
  (`.chipKnopf` muesste dann von `min-height: 44` auf 56 und die Reihe neu umbrechen) — das gehoert dorthin
  entschieden, nicht in einen Umsetzer- oder Fix-Task. Als Bedenken des Abschluss-Fix-Berichts weitergegeben.

KOORDINATIONSPOSTEN BENANNT UND ZUGEWIESEN (Befund 2, Haelfte 2) — er existierte bis heute in KEINER Ledger-Zeile,
  in keiner Auflagentabelle des T87-Berichts und in keinem Uebergabepunkt, obwohl DREI Fix-Runden aus drei
  verschiedenen Wellen ihn einzeln und woertlich benannt haben ("die saubere Fassung ist eine eigene Klasse in
  `helfer.module.css`. Die Datei gehoert T64; das ist ein Koordinationsposten, kein Nebenbei-Edit aus einem
  Fix-Task heraus"): `_ui/CheckFlow.tsx:145-175` (TIPPZIEL → `.chipKnopf`), `_ui/CheckFlow.tsx:985-997`
  (→ `.warnhinweis`), `_ui/Entnahme.tsx:172-184` (→ `.rueckmeldung`).
  ZUGEWIESEN AN TEIL 5, T100 — der fasst `helfer.module.css` wegen der E8-Auflage (`_lib/ampel.test.ts` laeuft ueber
  `verwaltung.module.css` UND `helfer.module.css`) ohnehin an. Die drei Klassen wandern nach `_ui/helfer.module.css`,
  die drei Inline-Stile entfallen. Getrackt in `docs/superpowers/plans/UEBERGABE-lagerbuch-teil4.md` §6, mit der
  Tabelle der drei heutigen Deklarationssaetze.
  WARUM ES ZAEHLT, AUCH OHNE DIE TAP-FRAGE: die drei Inline-Stile sind Kopien derselben `.chip`-Korrektur. Aendert
  Teil 5 `.chip` (Padding, Radius, Zeilenhoehe, white-space), gehen sie auseinander — STILL, weil jsdom kein CSS
  auswertet und kein Tor dieses Projekts eine gerenderte Chipreihe misst.
  KEIN CODEEINGRIFF in dieser Welle: Befund 2 verlangt ausdruecklich "kein Codezwang, zwei Protokollzeilen".

Abschluss-Fix: Befund 3 behoben — `_ui/HelferChip.test.tsx:196` von `/s\[`/` auf `/\bs\[/`.
  Mutation `${s.chip} ${KLASSE[ton] ?? s[ton]}`: ALTE Fassung 12/12 GRUEN (Gegenprobe), NEUE Fassung 1 failed | 11
  passed, revert 12/12 gruen.
Abschluss-Fix: Befund 4 behoben — `_lib/bauform.test.ts` Traeger-Vertrag-Scan prueft jetzt Teilmenge gegen die
  deklarierten Namen aus `.rahmen`-Koerper + Dunkelzweig UND traegt einen Vakuum-Riegel `genutzt.size >= 10`
  (bewusst NICHT 20 = Ist-Stand). Mutation A (`color: var(--lb-tinte2)` in `.knopf`): alt 39 gruen, neu rot.
  Mutation B (alle `var(--lb-…)` → Literalfarbe): alt 39 gruen, neu rot ("expected 3 to be >= 10").
Abschluss-Fix: Befund 5 behoben — Untergrenzen in beiden modulweiten Scans. ⚠️ ABWEICHUNG vom verlangten Fix: der
  antd-Block bekommt 18 (er nimmt `page.tsx` dazu), der `useSearchParams`-Block 17 (er sammelt nur ueber die vier
  Aeste, ohne die Modulwurzel). Beide Zahlen gemessen, nicht geschaetzt. Der Router-Block brauchte zusaetzlich ein
  hochgezogenes `const dateien = AST.flatMap(...)` — er hatte gar keine Dateimengen-Variable. Mutation (Astliste auf
  nicht existierende Ordner umgebogen): alt 39 gruen, neu 2 failed. Die zwei ueberholten EIGENSCHAFTSFORM-Absaetze
  sind auf den Stand nach T87 gebracht.
Abschluss-Fix: Befund 6 behoben — RIEGEL 5 in `_actions/check.ts` hinter `const v = geparst.data`: die WURZEL-ID
  `fahrzeugId` wird jetzt wie die vier Kind-IDs gegen `lagerorte` aufgeloest, als RUECKGABEWERT (`grund: "eingabe"`,
  Betreiberentscheidung B4), nicht als Wurf — eine Stilllegung waehrend des Checks ist eine erwartbare Lage im Sinn
  von Falle 66. Vier neue Tests in `_actions/check.test.ts`. Gegenprobe (Riegel entfernt): 3 der 4 neuen Tests rot,
  ALLE 45 bestehenden gruen — die Luecke war real und ungedeckt. Die zwei ANSATZPUNKT-Kommentare (check.ts,
  helfer/check/page.tsx) sind rein ADDITIV um den Satz ergaenzt, dass Art- und Aktiv-Pruefung ZUSAETZLICH zur
  skizzierten Scope-Zeile gehoeren; kein Satz geloescht.
Abschluss-Fix: Befund 7 behoben — `docs/superpowers/plans/UEBERGABE-lagerbuch-teil4.md` angelegt (getrackt, Muster
  von Teil 2/3): T5-1…T5-5, T6-1…T6-4, die Vorzieh-Entscheidung, B4, der Koordinationsposten aus Befund 2 und
  `_lib/hostRiegel.ts` ohne Eigentuemer. R1-R3 zusaetzlich in `docs/runbooks/lagerbuch-cutover.md` — R1 als NEUER §7
  VOR dem Umschwenk-Schritt (der alte §7/§8 sind zu §8/§9 geworden, die eine Kreuzreferenz mitgezogen), R2 als §10,
  R3 als §11. Die `.gitignore` bleibt unveraendert.
Abschluss-Fix: Befund 8 behoben — `teil5.md` T113 traegt jetzt denselben Vorzieh-Vermerk wie T114: Kopf-Warnung,
  "Files" durchgestrichen, Schritt 3 als entfallen markiert, `_lib/actionErgebnis.ts` aus dem `git add`-Block. §6
  (:498) korrigiert auf 14 Action-Dateien / 40 Deklarationen, ALLE 40 mit `requireLagerbuchAdmin()` — nachgezaehlt:
  `_actions/buchung.ts` traegt drei Deklarationen (bucheZugang, bucheEntnahme, bucheEntnahmeHelfer), 15−1=14,
  43−3=40, und die Ausnahme "die dreiundvierzigste" entfaellt damit. H7 bleibt gueltig.
  ⚠️ OFFEN GELASSEN UND BENANNT: `teil5.md:4842`, `:5045`, `:5183` schreiben "42 der 43 Deklarationen" fort. Nicht
  mitgezogen (Plan-vorgeschriebene Begruendungstexte ausserhalb des Befundumfangs); als Folgeposten in §6 von
  teil5.md und in UEBERGABE-lagerbuch-teil4.md §4 vermerkt. Wer T151 baut, zaehlt neu.
Abschluss-Fix: Befund 9 behoben — die drei Stellen mit der von `_db/schema.ts:412-413` (Entscheidung 8-F)
  widerlegten Behauptung sind auf die heutige Rechtslage gestellt: `_lib/schreibpfade/tokenEinloesung.ts:14-19`,
  `tokenEinloesung.test.ts:141-144`, `_actions/gate.test.ts:144-145`. `lastUsedAt` beeinflusst weder Gueltigkeit
  noch Loeschbarkeit; der Schaden eines cross-origin-Redirects ist eine EINLOESUNG OHNE SITZUNG, kein verbranntes
  Kaertchen. `loeschen.ts:89-99` ist als ALT-APP-MARKE kenntlich gemacht. Die beiden Konstruktionsentscheidungen
  (relativer Location in `t/[code]/route.ts`, Host-Riegel VOR `redeemToken`) bleiben unveraendert — nur ihre
  Begruendung traegt jetzt. Damit ist der PLANWIDERSPRUCH aus Welle 2 (progress.md:69-71, "die
  Falle-16-Kostenaussage gehoert vor T82 einmal gegen 8-F gestellt") geschlossen; T82s Review hatte ihn korrekt als
  Kreuz-Task-Notiz weitergereicht (progress.md:266), und danach hat ihn niemand geschlossen.
Abschluss-Fix, Nachtrag: im Begruendungskommentar des antd-Scans stand "vier unter `helfer/`" — gemessen sind es
  DREI (`page.tsx`, `layout.tsx`, `check/page.tsx`); die Klammer summierte sich auf 19 und widersprach der
  Zusicherung zwei Zeilen darunter. Korrigiert und zur Zerlegung ausgeschrieben: 12 `_ui/*.tsx` + 3 `helfer/` +
  `a/[artikelId]/page.tsx` + `t/[code]/route.ts` + `page.tsx` = 18. Kommentar-Edit in einer `SELBST`-ausgenommenen
  Datei; nachgeprueft mit `pnpm vitest run …/bauform.test.ts` → 39 passed | 1 skipped.
  Gegengeprueft: kein Dokument ausserhalb von `docs/runbooks/lagerbuch-cutover.md` verweist auf dessen
  Abschnittsnummern (`grep -rn "lagerbuch-cutover" docs/ src/ e2e/` liefert zwei Treffer, beide ohne §-Angabe),
  die Umnummerierung §7→§8 / §8→§9 bricht also keine Kreuzreferenz.

=== WELLE 8 via Workflow wf_d2ff25b1-a1c (10 Agenten) ===
Task 87: complete (commits 88a5c52..49a77c6, review clean nach 1 Fix-Runde(n); Erstreview specTreu=False, Nachbesserung noetig)
  Task 87: Erstbefund (Important) .superpowers/sdd/2026-08-03-lagerbuch-modul-teil4/task-87-report.md:274 (§6.2, T5-3) gegen src/app/m/lagerbuch/_ui/helfer.module.css:34 — Der Abschluss-Abnahme-Punkt „_ui/helfer.module.css trägt alle fünfzehn Neutralen und alle acht --lb-ampel-* in beiden Modi" wurde nicht gemessen, sondern an T100 delegiert („der Nachweis fällt in T100

=== ABSCHLUSS-REVIEW über den ganzen Branch, vier Blickrichtungen ===
9 Critical/Important, 46 Minor. Eine Fix-Welle (c221107, 7528c40) -> 7 behoben, 2 offen.
  ABSCHLUSS (Important, spec) .superpowers/sdd/2026-08-03-lagerbuch-modul-teil4/progress.md:335 und task-87-review.md:71-113, gegen src/app/m/lagerbuch/_lib/bauform.test.ts:473-477 und :492
     T87 ist als einziger Task des Branches nicht mit einer `complete`-Zeile im Ledger geschlossen; sein Review liegt vor, ist aber nie adjudiziert. Dessen einziger Important-Befund B-1 behauptet, die Abschluss-Abnahme („alle fuenfzehn Neutralen") sei falsch, es seien zwoelf, und schreibt als Fix eine Be
  ABSCHLUSS (Important, spec) src/app/m/lagerbuch/_ui/CheckFlow.tsx:145-175 (TIPPZIEL, soll `.chipKnopf` sein) und :985-997 (soll `.warnhinweis` sein); src/app/m/lagerbuch/_ui/Entnahme.tsx:172-184 (soll `.rueckmeldung` sein) — gegen src/app/m/lagerbuch/_ui/helfer.module.css (T64, abgenommen) und progress.md (kein Eintrag)
     Drei Fix-Runden aus drei verschiedenen Wellen haben denselben Ausweg genommen: einen Inline-Stil, der `.chip` ueberschreibt, mit einem Kommentar, der woertlich sagt, die saubere Fassung sei eine eigene Klasse in `helfer.module.css` — „Die Datei gehoert T64; das ist ein Koordinationsposten, kein Nebe
  ABSCHLUSS (Important, testguete) src/app/m/lagerbuch/_ui/HelferChip.test.tsx:196
     Der Scan `expect(q).not.toMatch(/s\[`/)` steht unter dem Titel "… und KEINEN Index-Zugriff auf `s`", fängt aber ausschliesslich die Backtick-Form `s[`…`]`. Jeder andere Index-Zugriff läuft durch.
  ABSCHLUSS (Important, testguete) src/app/m/lagerbuch/_lib/bauform.test.ts:524-534
     Der Träger-Vertrag-Scan ("greift ausschliesslich auf `--lb-*` zurueck") prüft nur das Präfix der benutzten Variablen, nicht ihre Deklariertheit, und hat als einziger mengenbasierter Scan der Datei keinen Vakuum-Riegel.
  ABSCHLUSS (Important, testguete) src/app/m/lagerbuch/_lib/bauform.test.ts:752-764
     Der modulweite antd-/`@ant-design/icons`-Scan (und ebenso der `useSearchParams`/`router.push`-Scan bei `:809-820`) sammelt seine Dateimenge selbst ein und endet auf `expect(verstoesse).toEqual([])` — ohne Untergrenze auf `dateien`. Dazu sind beide Begründungsabsätze (`:744-746`, `:807-808`: "EIGENSC
  ABSCHLUSS (Important, zugang) src/app/m/lagerbuch/_actions/check.ts:118 (fehlender Riegel zwischen `const v = geparst.data;` und der Transaktion ab :131), gegen src/app/m/lagerbuch/helfer/check/page.tsx:62,78-80 und src/app/m/lagerbuch/_actions/buchung.ts:181-185
     `checkAbschluss` loest seine WURZEL-ID `fahrzeugId` als einzige nicht gegen die Datenbank auf. `CheckSchema` (check.ts:31) verlangt nur `z.string().min(1)`; danach wird der Wert ungeprueft benutzt als Filter der Soll-Positionen (:135), als `lagerortId` der Bestandskorrektur (:170), als `nachLagerort
  ABSCHLUSS (Important, kohaerenz) fehlende docs/superpowers/plans/UEBERGABE-lagerbuch-teil4.md (gegen vorhandene UEBERGABE-lagerbuch-teil2.md und -teil3.md); Inhalte in task-87-report.md:295-330
     Teil 2 und Teil 3 haben je eine getrackte Uebergabe-Datei unter docs/superpowers/plans/ hinterlassen — die etablierte Form, in der ein Plan seine Auflagen an die Nachfolger weitergibt. Teil 4 hat keine einzige Datei unter docs/ angefasst (git diff --stat b1254e5..HEAD -- docs/ ist leer), obwohl er m
  ABSCHLUSS (Important, kohaerenz) docs/superpowers/plans/2026-08-03-lagerbuch-modul-teil5.md:5217 (dazu :5384 und :5576) gegen src/app/m/lagerbuch/_lib/actionErgebnis.ts (Commit 6b48c8e)
     Beide vorgezogenen Teil-5-Dateien liegen eingecheckt auf dem Branch, aber nur EINE ist im Plan darauf vorbereitet. _actions/buchung.ts (T114) traegt einen ausdruecklichen Vorzieh-Vermerk (teil5.md:5630-5633: 'dieser Task darf vorgezogen werden und vor Welle 7 von Teil 4 laufen … Es gibt genau eine _
  ABSCHLUSS (Important, kohaerenz) src/app/m/lagerbuch/_lib/schreibpfade/tokenEinloesung.ts:14-19, tokenEinloesung.test.ts:141-144 und _actions/gate.test.ts:144-145 — gegen src/app/m/lagerbuch/_db/schema.ts:412-413 und tokenEinloesung.test.ts:154-186
     Drei eingecheckte Stellen tragen die Aussage 'Ein Code, der einmal eingeloest wurde, ist NICHT MEHR LOESCHBAR, sondern nur noch sperrbar (loeschen.ts:89-99). Ein cross-origin-Redirect verbrennt damit einen laminierten Gegenstand, ohne dass jemand eine Sitzung bekommen haette' (tokenEinloesung.ts:14-

  RESTBEFUNDE nach der Fix-Welle (beide reine Dokumentkorrekturen, kein Codeeingriff):
   - Important docs/superpowers/plans/2026-08-03-lagerbuch-modul-teil5.md:498-500 (korrigierte Kopfzeile) gegen :517, :518, :523, :526, die Tabellenzeilen 4-6 (`buchung.ts`) und :577, :582
   - Important docs/superpowers/plans/UEBERGABE-lagerbuch-teil4.md:202-206 (§8, Punkt 4)

  Zurückgestellte Minor-Befunde des Abschluss-Reviews (46) — vollständig in abschluss-review-*.md:
   minor: [spec] ADJUDIZIERT, damit es nicht neu aufgerollt wird: `.beenden`/`.rueckweg` mit min-height: 44px (helfer.module.css:131, :215) und `.zeile` mit ~42,75px (:193-196) sind PLANKONFORM. Global Constraint 19 lautet woertli
   minor: [spec] Neu erreichbar geworden, und kein Task-Review konnte die Kette sehen: `public/login-bg.jpg` liefert auf dem Lagerbuch-Host 404. B3 + T81 haben den Verwaltungsknopf erstmals funktionsfaehig gemacht (page.tsx:101 → 
   minor: [spec] Der antd-/Icons-Scan (bauform.test.ts:751-755) deckt weiterhin nur `_ui`, `helfer`, `a`, `t` und `page.tsx` — `layout.tsx`, `abmelden/route.ts`, die fuenf PWA-Handler und `_actions/` bleiben aussen vor. Die Ledger
   minor: [spec] `.knopf` (helfer.module.css:343-347) setzt kein `text-decoration: none`, waehrend `.rueckweg`, `.tab` und `.zeile` es tun. T77 notierte Gate.tsx:216 als erste Verwendung auf einem <a>; INZWISCHEN GIBT ES EINE ZWEI
   minor: [spec] `.pruefKreis` im Zaehlschritt (CheckFlow.tsx:552-554) ist zweiwertig und im OK-Fall textlos; die o2-Fassung derselben Datei (:809-813) wurde von T79s Review auf drei Stufen geschaerft, diese nicht. Constraint 21 (
   minor: [spec] `ohneKommentare()` liegt als nicht zeichengleiche Kopie in acht Testdateien (T65, T69, T70, T77, T78, T79, T80, T83 — acht einzelne Ledger-Zeilen, hier zu einer zusammengefasst). Alle Kopien sind nachweislich sema
   minor: [spec] `einloeseAbschnitt()` (bauform.test.ts:969-976) behauptet weiterhin nur ueber den Abschnitt um das ERSTE `redeemToken(` je Datei — die T64-Zeile „→ an T87". T87 hat den Schnitt gebaut (vom letzten `export` davor b
   minor: [spec] UEBERHOLT, nicht offen: der T78-Minor „der gebucht === 0-Fall rendert in der Insel weiterhin einen GRUENEN Chip — genau das, was _actions/buchung.ts HEUTE liefert" war gegen eine buchung.ts formuliert, die es in W
   minor: [spec] T82s Weitung des Host-Musters auf `requireLagerbuchHost|lagerbuchHostOderNull` ist von T87 ueberholt: bauform.test.ts:1074-1136 prueft die Riegelform jetzt JE FLAECHENART ueber den Baum (quellDateien() statt Namen
   minor: [spec] Alle uebrigen ~80 `minor (deferred)`-Zeilen bleiben Minor. Zwei Gruppen: (a) Testguete („Zusicherung koennte schaerfer sein", „Testname verspricht mehr als der Rumpf haelt", „Bericht zaehlt falsch", „Abdeckungsbre
   minor: [spec] T66s Hinweis, dass `redeemToken` kein Compare-and-Set ist (Fenster zwischen .get() und .run()), bleibt Minor: das Fenster ist Mikrosekunden, der Schaden begrenzt (eine 12-h-Sitzung fuer ein im selben Moment gesper
   minor: [testguete] `_lib/bauform.test.ts:716` — die Untergrenze `≥5` des Feldschrift-Scans zählt Regeln mit, die gar keine Schriftgrösse tragen. Nachgemessen: 7 Regeln gezählt, davon 5 mit px-Schriftgrösse (.codefeld, .stepWert
   minor: [testguete] `_lib/actionTypen.test.ts:41-47` — Kommentar-Zusage ohne die Deklaration, die ihre drei Geschwister tragen. Nachgemessen: `/["`]eingabe["`][\s\S]{0,400}safeParse/` trifft ausschliesslich im Kopfkommentar von 
   minor: [testguete] `_ui/Restzeit.test.tsx:176-181` — der Aufräum-Test misst nur, DASS `clearInterval` gerufen wurde. Mutation: in `Restzeit.tsx:55` `return () => clearInterval(takt)` → `clearInterval(0)` (oder eine Refactor-Fas
   minor: [testguete] `_ui/HelferChip.test.tsx:110` — `toBeGreaterThanOrEqual(74)` ist keine Untergrenze, sondern der exakte Ist-Stand einer FREMDEN Datei. Nachgerechnet: `helfer.module.css` deklariert heute genau 74 Klassen, nach
   minor: [testguete] `pwa.route.test.ts:249-250` — `expect(symbole.length).toBe(4)` kann konstruktiv nie fehlschlagen: das Array ist eine Zeile darüber als Literal gebaut. Der Branch verbietet diese Form selbst (Commit 49a77c6: "
   minor: [testguete] `_ui/ArtikelSuche.test.tsx:172-177` — der Umlaut-Test übt keinen Umlaut. Nadel "wärme" ist bereits klein, Heuhaufen "Wärmedecke B-11"; `falte` ist `toLowerCase()` und faltet nur W→w, das ä ist auf beiden Seit
   minor: [testguete] `_actions/gate.test.ts:258` / `_actions/sitzung.test.ts:299` — `toBeGreaterThan(0)` auf `maxAge` ist unerreichbar rot: die Zeile davor sichert `toBe(helferGueltigkeitSekunden())` zu, und `helferSitzungStunden
   minor: [testguete] `_actions/gate.test.ts:259` — `opt.httpOnly === true` bliebe für jedes `gate.ts` grün, das `helferCookieOptionen(...)` mit irgendeinem Argument ruft. Die Zusage gehört `helferSitzung.test.ts` und steht dort. 
   minor: [testguete] `_actions/gate.test.ts:174-187` — der Sperrpfad sichert nicht zu, dass er weder Cookie setzt noch umleitet. Die beiden beforeEach-Sammelarrays stehen bereit; zwei Zeilen (`expect(stand.cookies).toEqual([])`, 
   minor: [testguete] `_lib/barcode.ts:14` — `/\/g\/([^/?#]+)/` trifft `/g/` als Teilstring, nicht als verankertes Pfadsegment, und `barcode.test.ts` übt den Fall nicht (`https://alt.example/log/g/SN-1` → `SN-1`). Plan-vorgegebene
   minor: [testguete] Ledger-Triage, ausserhalb der Testgüte, aber vor dem Merge zu entscheiden: (a) `_ui/helfer.module.css:215` gibt `.beenden` und `.rueckweg` `min-height: 44px`, während das Tap-Mass des Plans 56px ist (`core/th
   minor: [zugang] M-1 — a/[artikelId]/page.tsx:66 ruft `requireLagerbuchHost(await headers())`, obwohl `helferZugangOderNull` (:70) ihn intern als erste Anweisung fuehrt (_lib/helferZugang.ts:111). Kosten: ein zweites `await head
   minor: [zugang] M-2 — bauform.test.ts:144-162 prueft nur das VORHANDENSEIN von `requireLagerbuchHost(`, nicht die Position als erste Anweisung (§2.6). Eine Weiche, die den Riegel hinter `await getDb()` schoebe, bliebe gruen. Fu
   minor: [zugang] M-3 — bauform.test.ts:367 akzeptiert `hostAbweisung(` als Erfuellung, ohne den `??`-Kurzschluss zu verlangen; fuer abmelden/route.ts (if-Form) haelt den niemand.
   minor: [zugang] M-4 — T87 IST abgeschlossen, es fehlt nur die Ledger-Zeile. Der einzige Important des T87-Reviews (B-1, "fuenfzehn Neutrale" nicht gemessen) ist dokumentarisch, nicht am Code; die Fix-Runde (task-87-fix1-logs, B
   minor: [zugang] M-5 — Vorbestand, nicht in diesem Diff: _lib/zugang.ts:250 baut `proto` aus `x-forwarded-proto` ohne Werteprüfung; der Wert landet ueber page.tsx:94/101 in einem callbackUrl. Ein exotisches Schema fiele nachgela
   minor: [zugang] M-6 — checkAbschluss schreibt bei vollstaendig leerer Nutzlast (alle vier Arrays leer) eine inhaltslose `checks`-Zeile. Faellt mit dem Fix zu B-1 weitgehend weg; eigenstaendig nur Datenhygiene.
   minor: [zugang] TRIAGE / durch T87 ERLEDIGT (Ledger fuehrt sie noch als offen): T64s "B2-Scan haengt am Namen redeemToken" und die T66-Auflage "ein `import { redeemToken as einloesen }` machte einloeseAbschnitt still null" sind
   minor: [zugang] TRIAGE / durch T87 ERLEDIGT: T82s "route.test.ts:419-422 liest ohneKommentare statt der string-strippenden Variante, `\s*\(` fehlt" und T86s "pwa.route.test.ts:542, die EINZIGE Zusicherung der Datei, die ohne ih
   minor: [zugang] TRIAGE / ABZUSTUFEN, nachgemessen: T66s "kein Compare-and-Set → 12-h-Sitzung fuer ein gerade gesperrtes Kaertchen" ist ueberzogen. `befund()` (_lib/helferZugang.ts:84-85) liest tokens.aktiv bei JEDER Anfrage neu
   minor: [zugang] TRIAGE / ABZUSTUFEN: T82s "route.test.ts:281 toContain(Path=/) traegt seine Regel nicht" ist sachlich richtig, aber folgenlos — `path` ist dort gedeckt, wo es hingehoert: helferSitzung.test.ts:228-232 (`expect(o
   minor: [zugang] TRIAGE / KORREKT ZURUECKGESTELLT: Kein E2E fuer "gesperrter Token wird an der Buchung abgewiesen" (§3.8.3) — der Code benennt es selbst (_lib/helferZugang.ts:150, check.ts:85-86) und verweist auf Teil 6, T171. N
   minor: [zugang] TRIAGE / GEPRUEFT UND HARMLOS: T114s "`db` als zweiter Parameter einer use-server-Funktion ist vom Client erreichbar" — ueber die RSC-Grenze kommen nur serialisierbare Daten an, ein untergeschobenes `db` haette 
   minor: [zugang] Ausfuehrlicher Bericht: /Users/rubeen/dev/personal/drk/iuk-suite/.superpowers/sdd/2026-08-03-lagerbuch-modul-teil4/abschluss-review-zugang.md — Read-only-Mandat gehalten: `git status --porcelain` vor und nach de
   minor: [kohaerenz] _ui/CheckFlow.tsx:57 — CheckPos.fahrzeugBestand ist tot. Maschinell ueber alle exportierten Typen der Produktivdateien des Branches geprueft: die EINZIGE Eigenschaft ohne jede Verwendung ausserhalb ihrer Dekl
   minor: [kohaerenz] _lib/hostRiegel.ts und _lib/actionErgebnis.test.ts stehen in KEINER Eigentuemertabelle (ueber alle drei Plaene gegrept: null Treffer). Beide sind sachlich richtig entstanden — hostRiegel.ts loest Befund 43 un
   minor: [kohaerenz] ohneKommentare() liegt in 24 Kopien — semantisch identisch (Whitespace-normalisierter Rumpfvergleich maschinell gefahren), also N-5-konform in der Sache; die von sechs Task-Reviews gemeldete 'nicht zeichengle
   minor: [kohaerenz] Der Host-Riegel steht noch zweimal inline (t/[code]/route.ts:38, abmelden/route.ts:51) statt ueber hostAbweisung(). Beide Auslassungen sind begruendet (bei t/[code] folgen fuenf weitere Schritte, abmelden ist
   minor: [kohaerenz] Kein hostRiegel.test.ts fuer die neue geteilte Sicherheitszusage. Vertretbar — die drei Zeilen sind ueber zehn Verhaltenstests ausgeuebt —, aber es ist die Stelle, an der ein kuenftiger Umbau leise durchginge
   minor: [kohaerenz] Die Fahrzeugzeile misst ~42,75px (helfer.module.css:193-196: padding 12px 14px, kein min-height) und liegt damit knapp unter WCAG 2.5.5 AA (44px). NICHT der Planverstoss, als den fuenf Task-Reviews ihn vertag
   minor: [kohaerenz] ZUR WEITERGABE, nicht zur Behebung: public/login-bg.jpg traegt denselben Falle-56-Fall wie die drei PNG ihn hatten (auf dem lagerbuch-Host wird /login-bg.jpg nach /m/lagerbuch/login-bg.jpg umgeschrieben, 404)
   minor: [kohaerenz] ENTKRAEFTET, gehoert geschlossen statt abgearbeitet: die Tap-Mass-Kette ueber T64/T69/T76/T78/T80 (.beenden 44px, .rueckweg 44px) beruht auf einem Zitierfehler. Die bindende Regel lautet 'Tap-Mass 56px an jed
   minor: [kohaerenz] ENTKRAEFTET: NETZ_TEXT_GATE (Gate.tsx:435) ausserhalb der NETZ_TEXT_*-Familie ist kein Widerspruch. Der Kopf von _lib/gateTexte.ts:1-2 beansprucht 'die VIER Gate-Texte an genau einer Stelle' — das sind die Ga
   minor: [kohaerenz] ERLEDIGT und verifiziert: Vorab-Befund 5 (grund:'netz' serverseitig gegen Global Constraint 12) ist durch B4 vollstaendig aufgeloest — HelferGrund traegt den fuenften Wert (_lib/actionTypen.ts:56), check.ts:1
   minor: [kohaerenz] Rund 70 weitere deferred Minors bleiben zu Recht Minor: Berichtshygiene (Zahlendreher, veraltete Zeilennummern, Mutationszaehlungen), tautologische Zugaben neben tragenden Zusicherungen, Abdeckungsbreite ohne

=== RESTBEFUNDE ABGESCHLOSSEN (wf_4305e7eb-536, Commit a95dbfd) ===
Beide Restbefunde BEHOBEN und unabhängig nachgeprüft (Arithmetik gegengerechnet: 43 Tabellenzeilen über 15 Dateien
minus 3 buchung.ts-Zeilen und 1 Datei = 40 in 14; 40-3 Dubletten = 37; 47-40 = 7 für Teil 4 = 4 bewacht + 3 Ausnahmen;
44 = 40+4; 18 Dateien = 14+4). Kein Eingriff unter src/.
parked — neuer Minor aus der Nachprüfung: der Folgeposten-Absatz in teil5.md §6 behauptet zählbar "drei Begründungstexte
  außerhalb dieses Abschnitts", tatsächlich sind es mindestens neun. Ruling: Dokumenttext, nicht load-bearing; die
  vollständige Liste steht in restbefunde-report.md und in den Bedenken des Umsetzers.
OFFEN für Teil 6 (aktenkundig, kein Handlungsbedarf in Teil 4): teil6.md:398-402 führt in §4.2 weiterhin
  Teil 5 = 15 Dateien / 43 Deklarationen und Teil 4 = 3 / 4. Die Summenzeile (18/47/44/3) bleibt richtig, nur die
  Aufteilung ist überholt — und §6 schickt den Leser ausdrücklich auf diese Tabelle als "verbindliche Herleitung".
OFFEN für Teil 5 (aktenkundig): sechs ausführbare Stellen in teil5.md außerhalb §6 melden beim Lauf die falsche
  Erwartung (15 Dateien / 43 Deklarationen statt 14 / 40) — sie laufen erst am Ende von Teil 5; wer T151 baut, zieht sie mit.

=== SCHLUSS-GATE ===
typecheck ok · lint 0 Fehler / 6 Bestands-Warnungen · vitest 247 Dateien / 4355 bestanden, 1 übersprungen · build ok.
47 Commits auf feat/lagerbuch-modul-teil4 (aus main @ b1254e5).
ALLE 26 PLAN-TASKS (T62-T87) ABGENOMMEN, dazu Zusatz-Task B3 und zwei vorgezogene aus Teil 5 (T113-Teil, T114).
