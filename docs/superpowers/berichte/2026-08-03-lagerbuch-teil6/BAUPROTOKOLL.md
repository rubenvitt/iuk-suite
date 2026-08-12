# SDD ledger — plan: docs/superpowers/plans/2026-08-03-lagerbuch-modul-teil6.md

Worktree: /Users/rubeen/dev/personal/drk/iuk-suite-lagerbuch-teil6
Branch: feat/lagerbuch-modul-teil6 (aus main @ 9bf928d, enthält Teil 1–5)
Tasks: T153–T176 (24 Stück, 7 Wellen)

⚠️ Bash im Sandbox verwirft Schreibzugriffe außerhalb von iuk-suite/ — dieser Worktree
wurde mit dangerouslyDisableSandbox angelegt. Bei Dispatch daran denken.

Vorbedingungen geprüft (10.08.2026):
- Teil 5 ist Vorfahre von main; Teil 4 per Squash in main (Commits 01b2499, 1475044, 4c4fc2d)
- `_lib/barcode.ts#normalisiereBarcode` existiert (Consumes von T164)
- 18 Action-Dateien mit "use server" unter `_actions/` (Plan §4.1 erwartet 18) ✓
- `e2e/lagerbuch-helfer.spec.ts` existiert NICHT → J2 gilt, T171 legt sie an
- `verwaltung/(druck)/`, `error.tsx`, `g/[code]/` existieren nicht → korrekt

Vorab-Scan (vorab-scan.md): 11 bau-anhaltend (A1–A11), 27 kosmetisch, 22 stimmig.
Betreiberentscheidungen 10.08.2026 (A1, A8, A11) + acht Koordinator-Rulings:
siehe entscheidungen.md — die Datei geht ÜBER dem Plantext und bindet jeden Brief.

Task 153: fix round 1/5 (1 addressed, 0 open — Selbstbezug-Scan auf ohneKommentare(); commits fb378c5..1b60b95)
Task 153: complete (commits 9bf928d..1b60b95, review clean)
Task 154: complete (commits 1b60b95..2aa1cbb, review clean)
Task 155: complete (commits 2aa1cbb..226f95f, review clean)
Task 156: minor (deferred): Commit 223100c ist isoliert gruen, auf der vollen Suite rot
  (Brief-Artefakt: Schritt 5 committet vor dem vollen Lauf). Vor dem PR die beiden
  Commits 223100c+e3d1e9d quetschen, damit git bisect keinen falsch-roten Punkt findet.
Task 156: fix round 1/5 (2 addressed, 0 open — lokalesDatum() durch ISO-Idiom ersetzt,
  Fehllesung des format.test.ts-Vertrags im Bericht korrigiert; commits e3d1e9d..0c9f470)
Task 156: complete (commits 226f95f..0c9f470, review clean)
Task 157: complete (commits 0c9f470..7eb2272, review clean)
Task 158: complete (commits 7eb2272..860f7a8, review clean)
=== WELLE 1 ABGESCHLOSSEN (T153-T158) === Gate bei T158 auf HEAD 860f7a8:
    typecheck + lint + vitest (325 Dateien/5606 Tests) + build alle gruen.
Task 159: minor (deferred): _db/etiketten.test.ts:181 "erzeugt in diesem Fall gar keinen QR"
  behauptet nur rejects.toThrow() — die Aussage des Namens traegt kein Assert. Entweder
  qrSvg bespitzeln (expect(qrSvg).not.toHaveBeenCalled()) oder ersatzlos streichen, da :169
  ihn abdeckt. Brief-Mangel, nicht Umsetzerfehler.
Task 159: complete (commits 860f7a8..45e4868, review clean)
HINWEIS fuer alle folgenden Tasks (aus T160): docker-kontext.test.ts meldet ungestagete
  NEUE Dateien als "per .dockerignore ausgeschlossen". Die Meldung ist irrefuehrend — der
  Test baut seinen Kontext aus `git ls-files`. Abhilfe ist `git add`, NIEMALS .dockerignore
  editieren.
Task 160: minor (deferred) x4:
  a) tokens.test.ts:561 "vergibt einen gesperrten Code nicht neu" — Name verspricht mehr als
     der Koerper prueft; :292 deckt die Eigenschaft bereits zur Laufzeit. Streichen oder ehrlich
     benennen ("die Kollisionsabfrage filtert nicht auf aktiv").
  b) tokens.test.ts:505/:521 — Doppeldeckung zu :325 und :195; nur die Quelltexthaelften sind neu.
  c) Drei neue Negativ-Scans laufen ueber den Rohtext (loeschen.test.ts:825, tokens.test.ts:496,
     :621) ohne Begruendung. Bei :825 ist Rohtext sogar staerker (faengt auch auskommentiertes
     delete(tokens)) — Halbsatz ergaenzen, sonst stellt der naechste Leser sie "vereinheitlichend" um.
  d) TokenTable.tsx:185 <Flex gap={8}> umschliesst nach dem Entfernen des LoeschButton nur noch
     ein Kind. Optional; Entfernen koennte die vertikale Ausrichtung verschieben.
Task 160: complete (commits 45e4868..329812b, review clean)
=== WELLE 2 ABGESCHLOSSEN (T159-T160) === Gate bei T160 auf HEAD 329812b:
    typecheck + lint + vitest (327 Dateien/5637 Tests) + build alle gruen.
OFFEN aus T160: Runbook R34 (Ankuendigungspflicht) — Verwaltende finden den Loeschknopf fuer
    Zugangs-Codes nach dem Deployment nicht mehr; der Weg heisst jetzt "Sperren". Gehoert in T176.
Task 161: minor (deferred): Commit-Nachricht ede793c sagt "Drei Testfaelle ... entfallen
  ersatzlos" — es waren zwei (A4 wurde auf ohneKommentare umgestellt, nicht entfernt).
  Ausserdem "der exakte Brief-sed" fuer einen nie ausgefuehrten Befehl. Nur beim naechsten
  ohnehin faelligen Anfassen korrigieren, kein Amend.
Task 161: fix round 1/5 (2 addressed, 0 open — Riegel-Scan ueber ohneKommentare + Klammer
  geschaerft (war fuer (arbeit) vollstaendig blind, Kommentar auf layout.tsx:12); umformulierter
  Kommentar auf Brief-Prosa zurueckgesetzt, Negativpaar als Duplikat von bauform.test.ts:181/:201
  gestrichen; commits ede793c..bc6328e)
Task 161: complete (commits 329812b..bc6328e, review clean)
RULING A12 nachgetragen (vom T161-Umsetzer gefunden, vor dem Bau eskaliert): der Brief-Scan
  "helfer.module.css ohne jede Media Query" widerspricht bauform.test.ts:612-623, das die
  prefers-reduced-motion-Zeile ausdruecklich VERLANGT. Entfaellt; enge Fassung liegt in
  bauform.test.ts:651-656. Steht in entscheidungen.md.
Task 162: fix round 1/5 (2 addressed, 1 open — QR-Bindung ueber getAttribute("d") gepinnt,
  Fundortvermerk zu icons.test.ts praezisiert; Weg-zurueck-Link im Leerzustand als Code da,
  Test fehlte; commits 3776ac6..09201e2)
Task 162: fix round 2/5 (1 addressed, 0 open — Leer-Zweig-Link ueber Quelltext-Scan gepinnt,
  Bedingung UND Link gemeinsam gegen die Vakuum-Gruen-Falle; commits 09201e2..4a06cd9)
Task 162: minor (deferred): EtikettenBogen.test.tsx:249-251 — der Kommentar sagt "zwischen der
  Leer-Bedingung und der schliessenden )}", tatsaechlich ist es die ERSTEN )} danach. Ein
  Halbsatz wuerde es schliessen. Versagensrichtung ist laut (spurios rot), nicht still.
Task 162: minor (deferred): der Weg-zurueck-Link ist per Quelltext-Scan gepinnt, nicht am
  gerenderten Markup. Der echte Abruf gehoert T167/T175.
Task 162: complete (commits bc6328e..4a06cd9, review clean)
BETREIBERENTSCHEIDUNG 10.08.2026: Der Leerzustand des Etikettenbogens bekommt einen benannten
  Weg zurueck. Global Constraint schlaegt §8.4 "Was NICHT geaendert wird", weil die eigene
  Druck-Route-Gruppe neu ist und die Sackgasse mit ihr (DruckRahmen hat keine Navigation).
KOORDINATOR-COMMIT 1d99df2: der von `next dev` erzeugte Agentenblock in CLAUDE.md wurde einmalig
  aufgenommen, damit der Arbeitsbaum in den folgenden Tasks sauber bleibt. Kein inhaltlicher Eingriff.
Task 163: minor (deferred) x4 — drei davon aus dem Briefcode GEERBT, nicht eingefuehrt:
  a) fehler.module.css:18-31 — .seite setzt KEINEN Seitengrund. layout.tsx:28 gibt children
     unveraendert zurueck, die Grenze rendert auf dem nackten body. Im Hellmodus steht die
     weisse .karte (#ffffff) auf weissem UA-Grund und liest sich nur ueber ihren 1px-Rahmen.
     Hausmuster not-found.module.css:30/68 setzt dafuer --nf-grund: #eef0f1 / #000000.
     ⚠️ T175 Schritt 4+5 sieht das im echten Abruf — Zeiger dorthin mitgeben.
  b) fehler.module.css:57 — Rot bleibt im Dunkelmodus #c8000f; not-found.module.css:74 hebt
     denselben Ton auf #ef404c (3,5:1 auf Schwarz). Dekorative Kante ohne Bedeutungslast,
     deshalb kein Constraint-Bruch, aber Abweichung vom Hausmuster.
  c) error.test.tsx:126 — der loading.tsx-Abwesenheitsriegel liest readdirSync(__dirname),
     also NICHT rekursiv. Eine loading.tsx unter verwaltung/ oder helfer/ liefe durch, obwohl
     die Vorgabe "in keiner Route" lautet. Heute kein Verstoss (per find bestaetigt).
  d) Berichtsluecke: fehler.module.css:33 nutzt :root[data-theme="dark"] statt des im Brief
     abgedruckten :global(html[...]). Die Aenderung ist RICHTIG, steht aber in keinem
     Abschnitt des Reports, obwohl zwei andere Abweichungen begruendet sind.
Task 163: complete (commits 4a06cd9..246f558, review clean)
=== WELLE-3-GATE: PLAYWRIGHT AUSGESETZT (Umgebung, nicht Code) — 10.08.2026 ===
  Betreiber ist im Zug mit schlechtem Internet. `next/font/google` laedt die Schriften beim
  Start des Dev-Servers; ohne Netz loesen die Font-Module nicht auf, JEDE Seite antwortet 500,
  jeder Test laeuft 1,5 min in den Timeout.
  Bilanz des Laufs: 0 gruen / 68 rot, quer ueber ALLE Module — auch e2e/keystone.spec.ts und
  e2e/feedback.spec.ts, die dieser Branch nie angefasst hat. Fehlermeldung im WebServer-Log:
  "module-not-found" auf [next]/internal/font/google/newsreader_*.
  → Kein Befund gegen den Branch. Der Playwright-Gate-Lauf ist NACHZUHOLEN, sobald Netz da ist,
    und zwar EINMAL fuer Welle 3+4 zusammen, nicht pro Task.
  → Log: scratchpad/pw-welle3.log
  ⚠️ `pnpm build` haengt an derselben Quelle (next/font/google) und ist damit ebenfalls
    unzuverlaessig, solange das Netz schlecht ist.
=== WELLE-3-GATE NACHGEHOLT (Netz wieder da) — HEAD 4bf96d1 ===
  pnpm build: EXIT 0 ✅
  pnpm vitest run: 331 Dateien / 5696 Tests ✅ · typecheck ✅ · lint 0 Fehler ✅
  pnpm exec playwright test: 109 gruen / 5 rot — ALLE FUENF in e2e/files-mobil.spec.ts
    mit `net::ERR_INTERNET_DISCONNECTED`. Nachgeprueft und als UMGEBUNG eingestuft:
      - der Branch fasst ausserhalb von src/app/m/lagerbuch NUR CLAUDE.md an (git diff --stat)
      - dieselben Tests waren im selben Lauf bei 834px und 390px gruen, nur der zuletzt
        laufende 1280px-Block fiel aus
      - im Wiederholungslauf faellt ein ANDERER Test aus (390x844 statt 1280x720), 14/15 gruen
        → wanderndes Fehlerbild = Flakiness, keine Regression
      - saemtliche lagerbuch-Specs sind gruen, inkl. e2e/lagerbuch-verwaltung.spec.ts
  ⚠️ Vor dem Merge einmal mit stabilem Netz wiederholen (T176 bzw. Abschlussreview).
Task 164: fix round 1/5 (3 Important + 2 Minor addressed, 0 open — Lesepfad-Mocks schreiben ihr
  Argument mit und pinnen den NORMALISIERTEN Wert fuer BEIDE Pfade (Falle 29 jetzt verhaltens-
  statt textgebunden); nav-Zusicherung zweiteilig (ohneKommentareUndZeichenketten + Laufzeit
  gegen LAGERBUCH_NAV mit 15 Eintraegen); SeitenKopf statt nacktem <h1>; commits 4bf96d1..f787344)
Task 164: minor (deferred): die BENUTZUNG von SeitenKopf ist von keinem Test gepinnt —
  page.test.tsx:155-160 prueft nur document.body.textContent, ein Rueckbau auf nacktes <h1>/<p>
  bliebe gruen. War nicht Teil der Forderung.
Task 164: complete (commits 246f558..f787344, review clean)
=== WELLE 3 ABGESCHLOSSEN (T161-T164) ===
  ⚠️ Das Gate (build + Playwright) lief auf 4bf96d1, NICHT auf f787344 — der Fix danach hat
    page.tsx angefasst (SeitenKopf statt <h1>). Vitest/typecheck/lint sind auf f787344 gruen.
    Fallen 1/7 sind durch direktes Lesen von SeitenKopf.tsx/schrift.ts geprueft (nur type-Importe,
    kein antd, kein Icon) plus 23 bestehende Konsumenten. build+Playwright laufen mit dem
    Welle-4-Gate erneut.
Task 165: fix round 1/5 (2 Important + 2 Minor addressed, 0 open — Pending-Zustand als
  Verhaltenszusicherung (manuell aufloesbares Promise) statt Quelltext-Scan; Fehlertext auf
  <Alert type="warning" showIcon={false}> nach Modulmuster; afterEach mit doUnmock+resetModules;
  disabled bleibt begruendet an zeilen.length (Brief-Zitat + Tooltip); commits 022514f..49a7350)
Task 165: complete (commits f787344..49a7350, review clean)
Task 166: minor (deferred): BestellListe.test.tsx:281-294 "meldet einen echten Fehlschlag
  wortgleich" fehlt die negative Vorabzusicherung, die sein Erfolgs-Zwilling hat. Er bliebe
  gruen, wenn jemand setFehler("Kopieren fehlgeschlagen") eifrig direkt in kopieren() setzte
  statt im .catch()-Zweig. Behebung: eine Zeile
  expect(document.body.textContent).not.toContain("Kopieren fehlgeschlagen"); vor dem ablehnen().
Task 166: complete (commits 49a7350..4d2208b, review clean)
=== WELLE 4 ABGESCHLOSSEN (T165-T166) ===
=== WELLE-4-GATE auf 4d2208b ===
  pnpm build: EXIT 0 ✅ · vitest 331/5709 ✅ · typecheck ✅ · lint 0 Fehler ✅
  playwright: 113 gruen / 1 rot — e2e/feedback.spec.ts:588 ("25 % Ruecklauf" nicht sichtbar).
  Als VORBESTEHEND eingestuft, nicht als Regression:
    - allein laufen gelassen: 14/14 gruen → Zustandsabhaengigkeit zwischen Specs, kein Defekt
      der Zusicherung selbst
    - dieser Branch fasst KEINE Datei unter e2e/ an; die Spec-Menge und damit die
      Lauf-Reihenfolge ist zeichengleich zu main → derselbe Fehlschlag tritt auf main auf
    - ausserhalb von src/app/m/lagerbuch ist nur CLAUDE.md beruehrt
  ⚠️ Ab T167 legt dieser Plan FUENF neue e2e-Dateien an. Damit aendert sich die Lauf-Reihenfolge,
    und dieser Fehlschlag kann sich verschieben. Er bleibt trotzdem fremd — beim Abschlussreview
    gegen main gegenpruefen, nicht diesem Plan zuschreiben.
RULING A14 nachgetragen (Fund aus T167, dem ersten echten emulateMedia-Lauf):
  EtikettenBogen.tsx:80 trug style={{display:"flex"}} auf demselben Element wie lb-nichtDrucken.
  Ein Inline-Style schlaegt jede externe Regel ohne !important — @media print erreichte das
  Element strukturell NIE, die Bedienleiste waere MITGEDRUCKT worden, auf gekauftem Material.
  Entschieden: die Druckregel bekommt !important (behebt die KLASSE, nicht die Instanz — antd
  setzt Inline-Styles reichlich, und der Fehler ist still bis zum Papier). Inline-Style bleibt.
  Ausgefuehrt vom T167-Umsetzer in druck.css (T161s Datei, bewusste Grenzueberschreitung mit
  Fundortkommentar); druck.test.ts-Zusicherung MITGEZOGEN auf !important, nicht verbogen.
Task 167: fix round 1/5 (1 Important + 1 Minor addressed, 0 open — die Kaestchen-Zusicherung war
  MASKIERT (Element unter verstecktem Vorfahren ist immer hidden), prueft jetzt nth(1) auf einer
  weiterhin gewaehlten Kachel mit eigener Vorbedingung; Host-Zeile prueft den vollen
  LAGERBUCH_HOST statt nur "http"; Gegenprobe gefahren; commits 8db41ea..17f0b2b)
Task 167: complete (commits 4d2208b..17f0b2b, review clean)
BEOBACHTUNG fuer das Abschlussreview: T167 meldete einen Flake in ArtikelTable.test.tsx unter
  Volllast. Fuenf isolierte Laeufe: 31/31 gruen, jedes Mal. Nicht reproduzierbar, nicht zugeordnet.
Task 168: fix round 1/5 (1 Critical + 1 Important + 1 Minor addressed, 0 open):
  - Testfall 2 prueft jetzt die EXAKTE Exportmenge ueber data-export-zeilen (T165s Haken) statt
    "weniger Zeilen als vorher" — die alte Fassung bestand genau im Zustand, den sie ausschliessen
    sollte (Suche ohne Treffer senkt die Zeilenzahl erst recht). Gegenprobe gefahren.
  - Der Testname "liefert nur die Kopfzeile" ist jetzt gedeckt (data-export-zeilen === ""); der
    Fundort-Verweis auf _lib/bestandExport.test.ts ging ins Leere (dort gibt es KEINEN Fall mit
    leerer Eingabe) und ist im Bericht korrigiert.
  - vorher-Zaehlung mit harter Untergrenze.
  (commits a211a3c..acb2f7a)
Task 168: complete (commits 17f0b2b..acb2f7a, review clean)
LEHRE, dritte Instanz in diesem Plan: einen Fundort-Verweis NACHLESEN, nicht annehmen.
  T162: core/shell/icons.test.ts steigt bei "use client" aus. T164: bauform.test.ts deckt g/ nicht
  ab. T168: bestandExport.test.ts hat keinen Fall mit leerer Eingabe. Jedes Mal haette ein
  Streichen-statt-Reparieren eine Zusicherung ersatzlos beseitigt.
Task 169: fix round 1/5 (2 Important + Minors addressed, 0 open):
  - Eigen-Host-Nachweis laeuft jetzt je Eintrag in der Schleife (15/15 statt 3/15), nach dem
    Vorbild files-hosts.spec.ts:437. Umstellung page.goto -> page.request geprueft: kein
    defensiver Effekt, dasselbe Redirect-Verhalten, Idiom aus files-hosts.spec.ts:490.
    Testzahl 19 -> 18: der separate Gegenrichtungstest ging IN die Schleife auf, kein Verlust.
  - Datenwirkungs-Zusicherungen jetzt differenziell gegen den im Test selbst gelesenen
    Ausgangswert (vorher gegen Seed-NULL). --repeat-each=2 verifiziert.
  - Begruendung fuer den nicht gefahrenen Mutationslauf auf die ECHTEN Fundorte korrigiert
    (host.test.ts:66-71 zur Laufzeit, bauform.test.ts:270-282/335/993 statisch) statt auf eine
    Kommentar-Tabelle. Vierte Instanz der Fundort-Lehre.
  (commits 2a21148..d448a55)
Task 169: minor (deferred): Zeilenzitat "tokenEinloesung.ts:70" in einem neuen Kommentar sollte
  :72 heissen. Trivial.
Task 169: complete (commits acb2f7a..d448a55, review clean)
BETREIBERENTSCHEIDUNG 11.08.2026 (Fund aus T170): antds inneres .ant-select-input in der
  Sortierung auf /verwaltung/artikel bleibt bei 14px, unter der 16px-Grenze (iOS zoomt beim
  Fokussieren). VORBESTEHEND, nicht von diesem Branch verursacht.
  Entschieden: NICHT hier beheben. Der Test schliesst den einen Selektor begruendet aus, mit
  Messung im Kommentar und Verweis auf globals.css:59-69.
  Gruende: (a) die Behebung laege in src/app/globals.css und wirkte suiteweit auf portal, qr,
  feedback und files — genau die stille Suite-Entscheidung, die §1.5 ablehnt; (b) der Plan sagt
  "Keine core-Datei wird in diesem Plan angefasst"; (c) der Bestand hat die Frage schon
  beantwortet: globals.css:59-69 schreibt aus, dass das innere input unsichtbar ist und die
  Schriftgroesse nicht traegt — die Ausnahme zielt bewusst auf den sichtbaren div; (d) gemessen:
  das Feld ist readonly mit leerem Wert und zeigt nie sichtbaren Text.
  → OFFENER POSTEN fuers ClickUp-Board (I&K Suite, 901524923921). Noch NICHT angelegt.
KORREKTUR zur Betreiberentscheidung vom 11.08.2026 (aus dem T170-Review):
  Mein Begruendungspunkt (c) — "der Bestand hat die Frage schon beantwortet, globals.css:59-69" —
  TRAEGT NICHT. Die Klasse `.ant-select-selector` wird von antd 6.5.3 gar nicht mehr gerendert:
  grep ueber node_modules/antd/es/ findet `select-selector` NUR in color-picker/style/input.js;
  @rc-component/select@1.8.2 rendert stattdessen SelectInput mit -input/-content/-placeholder.
  Die gemessenen 14px stammen aus antd/es/select/style/select-input.js:206-217
  (`.ant-select-input { font-size: inherit }` erbt --ant-select-font-size = token.fontSize = 14).
  DIE ENTSCHEIDUNG BLEIBT — sie steht auf (a) suiteweite Wirkung, (b) "keine core-Datei in diesem
  Plan", (d) readonly-Feld ohne sichtbaren Text. Nur (c) faellt weg.
ZWEITER OFFENER POSTEN fuers ClickUp-Board (aus dem T170-Review, NEU):
  `:root .ant-select-selector { font-size: 16px }` in globals.css:70 ist eine TOTE REGEL — die
  Klasse wird nicht mehr gerendert. Und src/core/theme/feldschrift.test.ts:51-59 riegelt sie als
  "die einzige Stelle, die das braucht" ab, bewacht also eine Regel ohne Wirkung. Suiteweit,
  gehoert NICHT in diesen Plan.
Task 170: fix round 1/5 (1 Critical + 2 Important + 1 Minor addressed, 0 open):
  - seitenspezifische Anker statt suite-header (Shell-Ebene, auf JEDER Arbeitsseite): lb-excel,
    Textanker "Kritische Artikel" (verifiziert: genau ein Treffer, (arbeit)/page.tsx:127),
    lb-basis. Vorher konnte der Artikel-Test nicht belegen, dass er die breiteste Tabelle misst.
  - harte Sichtbarkeitsanker vor der 16px-/44px-Messung (vorher bestand eine 404- oder
    Anmeldeseite jede Zusicherung).
  - Kommentar zitiert jetzt select-input.js:206-225; Ausschluss-Logik textidentisch unveraendert.
  (commits 779232f..4e25550)
Task 170: complete (commits d448a55..4e25550, review clean)
Task 170: A10 umgesetzt — e2e/seed-lagerbuch.ts:179 Artikelname auf 35 Zeichen verlaengert,
  28-Zeichen-Grenze im Test UNVERAENDERT. Alle Fundstellen des alten Namens nachgefahren.
RULING A15 nachgetragen (Fund aus T171, fuenfte Instanz der Fundort-Lehre):
  Der Brief verwies fuer "roher Code im title" auf _db/quelle.ts:20,23 — die Stelle handelt von
  der Aufloesung quelleId->Label und sagt ueber ein title-Attribut NICHTS. Der echte Beleg steht
  in der eingefrorenen Alt-Anwendung: verwaltung/(admin)/journal/page.tsx:62 traegt
  title={j.quelleId}. Damit 1:1-Pflicht — und der Port hatte sie VERLOREN.
  Warum es traegt: _db/quelle.ts:9-11 schreibt aus, dass die rohe ID nachweisfest in der DB
  bleibt und nur die Anzeige aufgeloest wird. Das title ist die EINZIGE Stelle in der Oberflaeche,
  an der die rohe Kennung wieder sichtbar wird. Ohne sie steht im Journal nicht, WELCHER Code eine
  Buchung erzeugt hat. Nach 8-F (Codes bleiben fuer immer belegt) ist das die Auskunft, die den
  Bestand pruefbar macht.
  Umgesetzt minimal+additiv vom T171-Umsetzer: JournalAnzeigeZeile.quelleId, Durchreichung,
  Chip mit optionalem title. 58 Chip-Aufrufstellen, genau EINE uebergibt title. Die zweite
  Journal-Darstellung (Dashboard "Letzte Buchungen") bewusst NICHT angefasst — in der
  Alt-Anwendung (verwaltung/(admin)/page.tsx:89-107) erscheint dort gar keine Quelle. Verifiziert.
Task 171: minor (deferred) x2:
  a) lagerbuch-helfer.spec.ts:238-244 — der Falle-60-Test prueft die ANZEIGE (die kritische
     Haelfte) und die Ziel-URL, aber nicht Status 303 und nicht den Location-Wert des
     Fehlerzweigs. Beide Zweige laufen durch dieselbe antwort()-Hilfe, der Erfolgszweig nagelt
     303 fest — deshalb Minor.
  b) :215 — toMatch(/^\//) laesst ein protokoll-relatives //fremder-host/pfad durch. Heute nicht
     erreichbar. Behebung: /^\/(?!\/)/
Task 171: complete (commits 4e25550..6beffdc, review clean)
=== WELLE 5 ABGESCHLOSSEN (T167-T171) — alle fuenf E2E-Dateien stehen ===
  Drei echte Produktdefekte gefunden, die kein anderes Gate gesehen haette:
    T167 -> A14 (Inline-Style schlug die Druckregel, Bedienleiste waere mitgedruckt worden)
    T170 -> .ant-select-input bei 14px (vorbestehend, suiteweit, Board-Posten)
    T171 -> A15 (Token-Provenienz im Journal beim Port verloren)
=== WELLE-5-GATE auf 6beffdc: VOLL GRUEN ===
  pnpm build: EXIT 0 ✅ · pnpm exec playwright test: 168 passed, 0 failed (6.0m) ✅
  ⚠️ Auch e2e/feedback.spec.ts und e2e/files-mobil.spec.ts sind gruen — die frueheren
  Fehlschlaege (Welle-3- und Welle-4-Gate) sind damit endgueltig als UMGEBUNG bestaetigt
  (schlechtes Netz im Zug bzw. Flakiness), nicht als Regression dieses Branches.
Task 172: complete (commits 6beffdc..f3639d7, review clean)
  Zahlen unabhaengig vom Pruefer nachgezaehlt und datei-genau bestaetigt: 18 Dateien,
  47 Deklarationen, 44 Namen, 3 Ausnahmen, loeschen.ts=3, tokens.ts=2. §4 stimmt.
  Tragender Befund bestaetigt: bei "export von verfallSetzen entfernt" bleiben ALLE VIER
  Zusicherungen des Teil-2-Blocks gruen — genau die Luecke, wegen der es T172 gibt.
  A1/A7/A11/B10 alle vier einzeln geprueft und eingeloest.
Task 172: minor (deferred) x4 — ⚠️ DREI DAVON BINDEN T176, weil die Abnahmecheckliste an genau
  diesen Formulierungen entlanglaeuft:
  a) guards.test.ts:276 — Selbstverweis "(siehe Kopf, :25)" ist durch die eigenen 19
     eingeschobenen Kopfzeilen VERALTET; der Satz steht jetzt auf :26. Der Bericht behauptet
     zudem, bauform.test.ts:74 sei "der einzige verbliebene Zeilenverweis" — das ist FALSCH.
     T176 darf dieser Berichtsaussage nicht vertrauen. Fix: Namensform statt Zeilennummer.
  b) guards.test.ts:269 — Verweis "_lib/bauform.test.ts:66-78" zeigt auf die falsche Stelle;
     der zitierte Satz steht dort auf :95-96. VORBESTAND, nicht von T172 verursacht.
  c) guards.test.ts:205 — Zusicherungsname "guards.test.ts ist die 19. Datei des Ordners" ist
     genau die Formulierung, die A7 VERBIETET (der Ordner hat 37). Die Zusicherung selbst ist
     korrekt. Fix: umbenennen in "hat 18 Action-Dateien plus guards.test.ts".
  d) guards.test.ts:284 — toHaveLength(3) auf die Typ-Exporte von detail.ts nagelt eine Zahl
     fest, die keine Invariante deckelt; ein legitimer vierter Typ faerbt sie rot. Brief-Vorgabe.
     Die tragende Haelfte daneben ist ohnehin differenziell.
Task 173: complete (commits f3639d7..47d4b7a, review clean, keine Befunde)
  A8 beide Haelften eingeloest: der Bestandsblock (Teil 4, T87) wurde EDITIERT statt verdoppelt,
  "g/[code]/page.tsx" von NOCH_NICHT nach PFLICHT, it.runIf entfernt — die Zusicherung laeuft
  jetzt unbedingt. Der usePathname-Scan wurde NICHT angelegt (existiert doppelt).
  Mutation gefahren: Datei umbenannt -> 3 echte Fehlschlaege (nicht "skipped"), zurueckgebaut.
  Kopfkommentar bewusst ZEILENNEUTRAL umformuliert, damit extern zitierte Anker (:74, :98)
  stabil bleiben — die Lehre aus T172s veraltetem Selbstverweis angewandt.
Task 173: minor (deferred): g/[code]/page.test.tsx:292 (Eigentum T164) zitiert die jetzt
  entfernte NOCH_NICHT-Schleife als Fundort. Nachgelesen: zeigt ins Leere, inhaltlich aber
  weiterhin gedeckt — jetzt sogar staerker ueber PFLICHT. Keine Testluecke, nur veraltete Prosa.
  Siebte Instanz der Fundort-Klasse. ⚠️ T176 nicht darauf verlassen.

=== LAUF HIER BEENDET (Betreiber, 11.08.2026) — 22 von 24 Tasks ===
Endstand: HEAD 47d4b7a, 35 Commits ab 9bf928d, Arbeitsbaum sauber.
Verifiziert auf dem Endstand: vitest 331 Dateien / 5719 Tests gruen, typecheck sauber,
lint 0 Fehler (5 vorbestehende Warnungen). build + playwright zuletzt voll gruen auf 6beffdc
(168 Tests) — T172/T173 danach haben NUR Testdateien angefasst, build ist unberuehrt.

OFFEN — wer hier weitermacht, faengt bei T174 an:
  T174  Abgleich der sieben Zusicherungen aus §12.1 (Brief liegt bereit)
  T175  Abrufliste: 36 Routen echt abrufen (Brief muss noch erzeugt werden)
        ⚠️ Braucht die zwei benannten Mutationen aus B25 — der Plan liefert sie nicht.
  T176  Abnahme des ganzen Vorhabens (Brief muss noch erzeugt werden)
        ⚠️ Bindet: die drei Minor-Formulierungen aus T172 (a/c), R34 (Ankuendigungspflicht
        Token-Loeschung), und die deferred-minor-Liste unten.
NICHT gelaufen: das Abschlussreview ueber den ganzen Branch (superpowers:requesting-code-review).
Das Workspace-Verzeichnis bleibt bestehen — es ist die Wiederaufnahme-Karte.

CLICKUP-POSTEN ANGELEGT 11.08.2026 (Liste "I&K Suite", 901524923921):
  1. .ant-select-input bleibt bei 14px (unter der iOS-Zoomgrenze). Vorbestehend, suiteweit.
  2. globals.css:70 ist eine TOTE REGEL (.ant-select-selector wird von antd 6.5.3 nicht mehr
     gerendert), und core/theme/feldschrift.test.ts:51-59 bewacht sie als "die einzige Stelle,
     die das braucht" — ein Test, der eine wirkungslose Regel schuetzt.
  → 1. = https://app.clickup.com/t/86cb3jjc3 (DRK-191, low) — .ant-select-input bei 14px
  → 2. = https://app.clickup.com/t/86cb3jjbf (normal) — globals.css:70 tote Regel + Waechtertest
  Beide verweisen aufeinander: die Frage "welche Klasse traegt die Schriftgroesse heute?" loest
  beide. Erste zu klaerende Frage in DRK-191: zoomt iOS bei einem readonly-Feld ohne sichtbaren
  Text ueberhaupt? Faellt die Antwort "nein", ist der Posten erledigt.

=== WIEDERAUFNAHME (Betreiber, 11.08.2026) — Branch feat/lagerbuch-abnahme aus main @ f668007 ===
Teil 6 ist als PR #39 in main (47d4b7a ist Vorfahr von main). T174-T176 und das Abschlussreview
laufen auf einem NEUEN Branch feat/lagerbuch-abnahme, im selben Worktree
(/Users/rubeen/dev/personal/drk/iuk-suite-lagerbuch-teil6), damit node_modules und .env.local stehen.
main bringt zusaetzlich PR #33 (pnpm seed:lokal) mit — das ist der Seed-Weg fuer T175.
Zwei Betreiberentscheidungen dieser Wiederaufnahme:
  W1: Abnahme-Funde werden ALLE sofort gefixt, auch kosmetische — nicht nur bau-anhaltende.
  W2: Das Ergebnis geht als PR gegen main.
Teil-5-Abnahmeprotokoll (T151, fuer T175 Schritt 2 und 4 zu uebernehmen): Commit 190707b
"chore(lagerbuch): Teil 5 vollstaendig abnehmen" — Protokoll steht in der Commit-Nachricht,
zusaetzlich verdichtet in docs/runbooks/lagerbuch-cutover.md §12.
Task 174: DONE_WITH_CONCERNS (commits f5b41a6..9acea7e, 5 Stueck) — Task-Review laeuft.
  Drei Funde, alle per W1 sofort gefixt:
  1. Aussage 3, DOM-Fundort falsch: die Debounce-/committedQ-Zusicherung lebt in
     verwaltung/(arbeit)/journal/JournalFilter.test.tsx (T147), NICHT in _ui/filter.test.tsx
     (T109 traegt nur die useUrlFilter-Schreibmechanik). Beide Plantabellen (§8 und §12.5)
     zitierten dieselbe falsche Datei. Gefixt: f5b41a6, nachgetragen 7c05014.
  2. Aussage 3, E2E-Haelfte fehlte KOMPLETT — kein Nachfolger in irgendeiner e2e/*.spec.ts,
     obwohl §12.5 die literale ?q=-URL als "einzigen Beleg fuer den URL-Vertrag" fuehrt.
     T150s eigener Scope (Teil-5-Plan) nennt _lib/nav.ts/.modulnav, nicht die Journalsuche.
     Per W1 gebaut in e2e/lagerbuch-verwaltung.spec.ts (494cc69), echt gefahren:
     pnpm build + playwright lagerbuch-verwaltung.spec.ts 7/7.
  3. Aussage 5: Chip "bestellt" gegen "bestellt seit <Datum>" exakt getrennt, plus der
     Rueckfall-Zweig ohne Datum (ac81f8f), BestellListe.test.tsx 21/21.
  ⚠️ CONCERN mit Planwirkung: Fund 2 ist ein Muster, nicht ein Einzelfall — "im Plan
  versprochen, keinem Task zugeordnet". T176 bekommt dafuer einen eigenen Schritt: die
  13 Alt-Spec-Zeilen werden nicht nur auf EXISTENZ des Nachfolgers geprueft, sondern
  darauf, dass er die Aussage traegt.
  Der veraltete Verweis in task-176-brief.md ist behoben (Brief aus dem korrigierten Plan
  neu erzeugt) — Koordinator-Buchhaltung, kein Task-Fix.
Task 174: Review clean — Spec ✅, keine Critical/Important. Task-Qualitaet: Angenommen.
  Der Reviewer hat die zwei heiklen Behauptungen selbst nachgeprueft, nicht nur gelesen:
  der neue DOM-Test traegt exakt die Trennungsaussage von getByText({exact:true}) (Chip
  rendert ohne zeichen-Prop reinen Text, Chip.tsx:61-65), und der neue E2E fuehrt
  toHaveURL(/[?&]q=Verband/) — dieselbe Regex wie suche-filter.spec.ts:30, also die
  literale URL und nicht die Filterwirkung.
Task 174: minor (deferred): task-174-report.md zitiert devLogin als aus e2e/helpers/lagerbuch.ts;
  tatsaechlich kommt es aus e2e/fixtures. Nur der Berichtstext, kein Code — A9 ist gewahrt
  (der neue Test kopiert das in der Datei etablierte Muster). Bericht ist Kladde, wird am Ende
  geloescht; nicht dispatchwuerdig.
Task 174: ⚠️-Posten des Reviews vom Koordinator aufgeloest (Greps selbst gefahren):
  A4 kein Hexwert im journal-Ordner — die DOM-Haelfte haengt an CSS-Modul-Klassen
  (s.jdelta/s.jminus, JournalTable.test.tsx:109,120), das Vorzeichen im Text liegt in
  journalZeile.test.ts. Entscheidung 30 bleibt unentschieden, wie verlangt.
  A1 zaehleAblaufende 6 Treffer · A2 chargenNr 1 Treffer · A6 disabled 4 Treffer ·
  A7 ".lb-etikettQr > svg" mit toHaveLength(3) plus dekodierter viewBox. Kein Fund.
Task 174: complete (commits f5b41a6..9acea7e, review clean)
Task 175: DONE (commits 9acea7e..652b157: 6326006 W1-Fix + 652b157 Protokoll) — Review laeuft.
  Das Protokoll steht als 328-Zeilen-Rumpf in 652b157, nicht in einer Datei (Planvorgabe).
  Gates nach dem Fix: tsc sauber, lint 0 Fehler/5 vorbestehende Warnungen, vitest 5781 gruen,
  build 0 Fehler, git status leer. Beide B25-Mutationen belegt und zurueckgebaut, Wurf-Route
  geloescht, page.tsx-Zaehlung wieder 29.
  ⚠️ KOORDINATORFEHLER, vom Umsetzenden gefangen: mein Dispatch verwies fuer die 23
  Arbeitsseiten auf 190707b und Runbook §12 als "Protokoll zum Uebernehmen". Beide Quellen
  enthalten KEIN Zeilenprotokoll — 190707b sagt aggregiert "23 Verwaltungsrouten liefern 200",
  §12 behandelt in Prosa nur die drei Dunkelmodus-Seiten. Eine Uebernahme haette 23 Zeilen
  erfunden. Er hat stattdessen alle 31 Zeilen und alle vier Farbmodus-Abrufe SELBST gefahren.
  Lehre fuer T176: §7.1 fuehrt 23 Zeilen als "Verifiziert in: Teil 5, T151/2" — die Belegkette
  dort ist duenner als die Tabelle nahelegt. Gilt sinngemaess fuer jede "verifiziert in Teil N"-
  Spalte, die T176 abhakt.
  Fund 5 (gefixt, 6326006): seedLokal.ts:714 bestritt die Existenz von /g/<code> — richtig
  unter Teil 4, seit T164 falsch. Ein Satz, der eine Route BESTREITET, ist schlimmer als ein
  fehlender: wer lokal prueft, laesst sie aus, und /g/ ist der Weg des gescannten Typenschilds.
  Kein Gate sah es (Fliesstext in einem Array). Neuer Test ist an die SEED-DATEN gebunden,
  nicht an den Wortlaut; gegen die alte Fassung rot gefahren.
Task 175: minor (deferred) x3 — Plantabelle §7.1 driftet gegen die Implementierung, bewusst
  NICHT im Code gefixt (jeder Fix waere Fach- oder Textentscheidung an Teil-4/5-Zeilen):
  a) /g/<bekannt> antwortet 307, nicht 303 — redirect() in einer Server Component ergibt in
     Next 16 einen 307; Location relativ (das ist das Merkmal, und es haelt). Fuer GET
     verhaltensgleich. Die Plantabelle ist die ungenauere Quelle.
  b) /a/<unbekannt>: Plan "Dieses Etikett gehoert zu keinem Artikel mehr", Implementierung
     "Dieses Etikett kennt kein Artikel" + Hinweissatz. Substanz von 8-C haelt.
  c) bz/<id>/kontrolle: Plan-Label "Verfallsmonat", Implementierung "Kompressen-Verfall"
     mit picker="month". Substanz haelt.
  → ENTSCHEIDUNG Koordinator: die Plantabelle wird nachgezogen (Doku, kein Verhalten), in
    einer Fix-Runde nach dem T175-Review. W1 verlangt den Fix, und die Richtung ist die
    umgekehrte: nicht der Code folgt der Tabelle, die Tabelle folgt dem gemessenen Code.
Task 175: minor (deferred): Brief-Schritt 5 ist als Kommando unbrauchbar — der curl|grep findet
  die zwei error.tsx-Texte nie, weil die Modul-Grenze clientseitig rendert. Die Aussage stimmt,
  nur ist der Browser das einzige Messgeraet. Wer den Befehl unbesehen faehrt und "nicht
  gefunden" liest, zieht den falschen Schluss. Betrifft den Plan, nicht den Code.
Task 175: Lehre fuer jede kuenftige Merkmalspruefung: das Gate liefert inputMode="numeric" in
  React-Schreibweise; ein grep auf die HTML-Kleinschreibung liefert 0 Treffer und meldet still
  "Merkmal fehlt". HTML-Attributnamen sind ASCII-case-insensitiv, der Parser normalisiert —
  im DOM steht getAttribute("inputmode")==="numeric". Also den DOM fragen oder case-insensitiv
  greppen, nie den Rohtext der Antwort.
Task 175: fix round 1/5 (6 addressed, 0 open — Zeilenzahl, Riegel-Beleg, zwei abgeschwaechte
  Merkmale, §7.1-Drift, ungesicherte Etiketten-Zeile, umgehbare Wortlaut-Haelfte;
  commits 129f0cc..7cea8e4). Re-Review: keine neuen Schaeden, keine Beobachtungen ausserhalb.
  Fund 3 wurde NACHGEMESSEN, nicht umformuliert: vier unterscheidbare Textgruppen aus sieben
  DOMException-Ursachen, gegen _ui/BarcodeScanner.tsx:32-63 verifiziert (der Quellcode traegt
  selbst "§7.6.3 — vier Zustaende statt einem"), dauerhafte Deckung in BarcodeScanner.test.tsx
  :273-383. Fund 2: der Riegel-Beleg ist echte Isolation — e2e/lagerbuch-hosts.spec.ts
  describe("Host-Riegel"), innerer Pfad auf realem Fremd-Host, canAccess kurzschliesst ueber
  requiresAuth:false, einziger verbleibender Filter ist requireLagerbuchHost.
  Der Nachtrag-Commit 7cea8e4 korrigiert das Protokoll, ohne 652b157 umzuschreiben.
Task 175: complete (commits 9acea7e..7cea8e4, review clean)
Task 175: NEUER POSTEN FUER T176 (vom Umsetzenden gefunden, bewusst nicht selbst eingetragen):
  Die Kamerawege sind nur ueber HTTPS pruefbar — ohne sicheren Kontext kein getUserMedia,
  /verwaltung/geraete/scan und /verwaltung/bz/scan zeigen ueber http:// ausschliesslich
  KEIN_SICHERER_KONTEXT samt manuellem Feld. Kein Defekt, im Code ausgeschrieben
  (_ui/BarcodeScanner.tsx, §3.5.2 kennt es). Was FEHLT ist die Betriebsfolge:
  docs/runbooks/lagerbuch-cutover.md hat keine Zeile dazu (grep auf isSecureContext/
  "sicherer Kontext"/Kamera → 0 Treffer). Wer die Generalprobe ueber eine IP oder http://
  faehrt, haelt die Scan-Seiten fuer kaputt ODER fuer geprueft — beides falsch.
  → gehoert in die Runbook-Uebergabe von T176 (Schritt 5).

=== T176 wird in ZWEI Dispatches gefahren (Koordinatorentscheidung) ===
Grund: der Task traegt sieben Schritte, darunter drei Tabellen (13 Alt-Specs, 40 Fehlerzustaende,
Abnahmecheckliste ueber sechs Teile) UND das Schreiben der Runbook-Uebergabe. Als ein Dispatch
ist das die Groesse, an der ein Umsetzender die zweite Haelfte verduennt.
  T176-A: Schritte 1-4 (fuenf Gates, die drei Tabellen) — reine Feststellung, erzeugt Funde.
  T176-B: Schritte 5-7 (R30-R36 + §10 ins Runbook, die drei T172-Minors, Abschluss-Commit).
B darf erst laufen, wenn A abgenommen und seine Funde behoben sind — der Abschluss-Commit sagt
"Spec 1 abgenommen", und das darf er nicht vor der Abnahme sagen.
Task 176-A: Review — Spec ✅, Task-Qualitaet Angenommen. Ein Important, ein Minor.
  Der Reviewer hat unabhaengig nachgezaehlt und bestaetigt: 37 _actions/-Eintraege (A7 trifft
  wortgenau), 23 page.tsx, 36 Ikonen, SOLL-Summe 47, 43 = 47-4, 15 = 18-3 — keine Zahl abgesenkt.
  Die vier guards.test.ts-Hunks sind line-count-neutral (@@ -259,28 +259,28 @@ und
  @@ -398,28 +398,28 @@ im Diff nachgezaehlt). F-9s Drift auf die Zeile bestaetigt (der
  zitierte Satz steht auf :272-274, nicht :265-267; bauform.test.ts auf :95-96, nicht :66-78).
  D1-Rueckzug an der Quelle nachvollzogen: buchung.ts:99-101 dokumentiert den catch als
  vorgesehenen Kanal, :105/:187 werfen deutsche Saetze in der Transaktion → Rueckzug war richtig.
  F-2/B-1 an der Quelle bestaetigt: checkErgebnis.ts:149/154/161 liefern leer() ohne
  Diskriminator, "unlesbar" hat modulweit keinen Treffer, die Detailseite zeigt "0 Positionen".
  Der Bericht verduennt sich ueber die Laenge NICHT — "abgehakt in Teil N" kommt nur als Zitat
  der verbotenen Formulierung vor, nie als eigener Beleg.
Task 176-A: parked — Important (plan-mandated): W1 sagt "jeder Fix ein eigener Commit"; a479606
  buendelt F-6+F-7+F-8 in einem Commit statt in drei. Ruling: der Code steht.
  Begruendung: alle drei sind Kommentar-/Namensfixes in DERSELBEN Datei (guards.test.ts), alle
  line-count-neutral, und die Commit-Nachricht benennt alle drei einzeln. Der genannte Nachteil
  (gezielter Revert nur von F-8) ist praktisch wertlos bei einer Kommentaraenderung, und die
  Behebung waere ein Rewrite bereits gereviewter Historie auf diesem Branch — das Risiko ist
  groesser als der Gewinn. W1s Zweck ist Nachvollziehbarkeit, und die ist durch die
  Commit-Nachricht plus Bericht gegeben. Der Fund bleibt sichtbar fuer das Abschlussreview.
Task 176-A: minor (deferred): der Bericht beziffert e2e/lagerbuch-verwaltung.spec.ts mit
  "116 Zeilen", gemessen 115. Aendert nichts an F-1. Berichtstext, wird am Ende geloescht.
Task 176-A: complete (commits 7cea8e4..04a4438, review clean, 1 parked)
CLICKUP-POSTEN ANGELEGT 11.08.2026 (Liste "I&K Suite", 901524923921) — fuer die
"Offene Posten"-Tabelle des Runbooks in T176-B:
  DRK-192 = https://app.clickup.com/t/86cb3y71b (normal) — ~47 veraltete datei:zeile-
    Kommentaranker unter m/lagerbuch/. Achte Instanz der Fundort-Klasse. Enthaelt die
    Warnung, dass T172s Bericht "nur einer" behauptet und das falsch ist.
  DRK-193 = https://app.clickup.com/t/86cb3y74v (normal) — buchung.ts:130/:211 reichen im
    catch auch rohen SQLite-Text durch. KEIN Verstoss (der Kanal ist gewollt und
    dokumentiert), aber ein benannter Rand; Behebung = Sentinel-Fehlertyp, Entwurfseingriff.
    Traegt die Warnung aus D1: wer die Zeilen ohne Suite-Lauf anfasst, bricht vier Tests.
  86cb3y7db (low) — drei ungetestete Anzeigeraender (Bestellvorschlag-Leertext,
    EtikettenBasisFehlt-Render (strukturell, async RSC), CheckFlow-Fussnote).
  86cb3y7h0 (low) — die zwei Teil-1-Nachweise, die Protokoll-Uebernahmen sind statt
    Messungen (COPY-Gegenprobe des Dreiecks, Schema-Diff). Verweist auf 86cb0q9ut, weil
    der Waechter selbst als zu schwach bekannt ist.
Nicht auf das Board, sondern nach T176-B:
  - die HTTPS/Kamera-Zeile ins Runbook (Fund aus T175s Fix-Runde)
  - B-1/Zustand 27 als Betriebshinweis ins Runbook, ZUSAETZLICH zum Nachbau (der laeuft)
  - B-2: die "22 deutschen Meldungstexte" in §11.5 Zeile 11 in Richtung der Messung
    nachziehen (35 Stellen in 14 Dateien; die Form ist gegatet, nicht die Anzahl —
    eine toHaveLength(22) waere genau die von A7 verbotene Art Zusicherung)

=== T176a1 — Zustand 27 nachgebaut (Betreiberentscheidung, nicht im Plan) ===
Der Betreiber hat am 11.08.2026 entschieden: Zustand 27 wird NACHGEBAUT, nicht als Abweichung
benannt. Commits 04a4438..443ddb0 (6 Stueck): Parser (a4cb945), Lesepfad (748e63c), Seite
(5b90e9f), Bericht+Kommentar (45cb27c), next-env.d.ts-Rueckbau (923df99), echter Render (443ddb0).
Gates: typecheck gruen, lint 0 Fehler/5 vorbestehende Warnungen, vitest 337/5798 (+9),
build ✓, playwright lagerbuch-verwaltung.spec.ts 9 passed (Nicht-Vakuitaet gemessen),
uebrige lagerbuch-Specs 54 passed. Task-Review laeuft.

⚠️ KOORDINATORFEHLER NR. 2, vom Umsetzenden per Rueckfrage gefangen — die wichtigste Zeile
dieses Nachbaus: meine Festlegung "unlesbar = jeder Lesefehler, den parseCheckErgebnis heute
mit leer() beantwortet" zog `ergebnis IS NULL` mit ein. Das ist aber ein von §4.4 VORGESEHENER
Zustand (offener Check, completed_at IS NULL; seedLokal.ts:523-526 erzeugt ihn bewusst).
Waere sie woertlich umgesetzt worden, haette JEDER offene Check "Ergebnis unlesbar" gezeigt —
aus einer Luege waeren zwei geworden. Korrigiert: unlesbar sind catch (kein JSON),
daten===null||typeof daten!=="object" (falsche Form) und roh==="" (geschrieben, aber leer);
roh===null bleibt wie heute. Eine eigene Zusicherung nagelt "IS NULL ist NICHT unlesbar" fest.
LEHRE: `!roh` ist eine Bedingung, die mehr bedeutet als ihr Name sagt — dieselbe Klasse wie
die acht Fundort-Funde. Wer eine Falsy-Pruefung als Fehlerzweig liest, erbt alle ihre Faelle.

⚠️ FLAKINESS, unaufgeloest: ein einzelner vitest-Lauf meldete 2 failed, fuenf weitere gruen,
NAMEN NICHT ERFASST. Vermutlich Gleichzeitigkeit mit dem parallelen Review auf demselben
Checkout. Konsequenz: Reviewern ist ab jetzt jeder Suite-Lauf verboten, und T176-B MUSS alle
fuenf Gates ohne Parallelbetrieb erneut fahren — der Nachbau hat Produktivcode geaendert,
NACHDEM T176-A seine Gates gefahren hatte. Der Abschluss-Commit darf "Spec 1 abgenommen"
nicht auf T176-As Zahlen stuetzen.

CLICKUP-POSTEN 2. Welle (11.08.2026):
  DRK-196 = https://app.clickup.com/t/86cb403fu (normal) — offener Check erscheint als Check
    mit "0 Positionen". Heute harmlos (das Modul erzeugt sie nie), nach dem Cutover nicht:
    der Datenimport aus der Alt-Anwendung kann sie mitbringen.
  86cb403u5 (low) — /verwaltung/checks/[id] ist E2E nur punktuell gedeckt: der neue Zustand
    ja, der Rest der Seite (Abgleich, Nachfuellung, Geraete, Sauerstoff, Verfall, Kacheln)
    nicht. Begruendung im Posten: RSC ohne Insel, wo build/typecheck/vitest strukturell
    blind sind.

=== T176-B: was der Auftrag tragen MUSS (Sammelstelle, vor dem Dispatch) ===
1. Alle fuenf Gates ERNEUT, ohne Parallelbetrieb (siehe Flakiness oben). Zahlen in den
   Abschluss-Commit, NICHT die von T176-A.
2. Schritt 5: R30-R36 woertlich ins Cutover-Runbook (R30 Probebogen, R31 Reihenfolge
   einfrieren, R32 nachdruckbare != haengende Etiketten, R33 zwei Knopfbeschriftungen,
   R34 Token nur noch sperrbar, R35 APP_BASE_URL streichen, R36 Manifest-Gegentest).
3. Schritt 6: §10 (Uebergabe an Spec 2) als EIGENER Abschnitt ins Runbook, nicht als Verweis.
4. ZUSAETZLICH ins Runbook, aus dieser Sitzung:
   a) die HTTPS/Kamera-Zeile (ohne sicheren Kontext kein getUserMedia; /verwaltung/geraete/scan
      und /verwaltung/bz/scan zeigen ueber http:// nur KEIN_SICHERER_KONTEXT samt manuellem
      Feld — wer die Generalprobe ueber IP oder http:// faehrt, haelt sie fuer kaputt ODER
      fuer geprueft, beides falsch)
   b) Zustand 27 als Betriebshinweis: der Fall ist jetzt GEBAUT (Meldung "Ergebnis unlesbar"),
      und ein OFFENER Check zeigt weiterhin "0 Positionen" (DRK-196)
   c) die sechs neuen Board-Posten in die "Offene Posten"-Tabelle: DRK-192, DRK-193,
      86cb3y7db, 86cb3y7h0, DRK-196, 86cb403u5
5. B-2: die "22 deutschen Meldungstexte" in §11.5 Zeile 11 in Richtung der Messung nachziehen
   (35 Stellen in 14 Dateien; die FORM ist gegatet, nicht die Anzahl — toHaveLength(22) waere
   genau die von A7 verbotene Art Zusicherung).
6. Der Abschluss-Commit-Entwurf im Plan traegt noch "⚠️ Offen, solange Teil 4 keine Tasks
   traegt: der ganze Helfer-Weg" — ERLEDIGT (Teil 4 = PR #29), muss vor dem Commit weg,
   sonst behauptet der Abnahme-Commit eine Luecke, die es nicht gibt.
7. Der Abschluss-Commit muss ehrlich formulieren, was T176-A gefunden hat: 13/13 Aussagen
   getragen, aber acht Zeilen nannten den falschen Nachfolger; 40/40 Zustaende haben einen
   Ort — und Zustand 27 hat ihn jetzt VOLL, weil er gebaut wurde.
8. Teil 6 "alle 24 Tasks eingecheckt" darf T176-B abhaken, weil B der letzte ist — aber mit
   dem Vermerk, dass T176 in zwei Dispatches lief.
T176a1: Review — Spec ✅ (alle neun Festlegungen an der Sache belegt), Task-Qualitaet Angenommen,
  keine Critical, keine Important, sechs Minor. Verdikt: review-z27-verdikt.md.
  Die tragende Antwort: eine Rueckkehr zu `!roh` wuerde an ZWEI Stellen rot
  (checkErgebnis.test.ts:109 via toEqual, das die Zusatzeigenschaft nicht durchlaesst, und die
  benannte Zusicherung :249-260). "Warnt zu oft" ist auf drei Schichten ausgeschlossen:
  page.test.tsx:428 (0 Alerts auf BASIS), lesepfade/checks.test.ts:388 (legitim leer -> false),
  :396 (offener Check -> false), :401 (Altformat -> false), plus ~12 bestehende Seitentests.
  Der E2E prueft die GERENDERTE Fassung (ant-alert-warning / not ant-alert-error) und schliesst
  den 500 explizit aus (status()===200 plus "server-side exception"-Ausschluss).
  Additivitaet unabhaengig geprueft: alle vier Aufrufstellen lesen nur Felder, LEERES_ERGEBNIS
  hat repo-weit keinen Fremdkonsumenten, Vorgabewert bedeutet "lesbar" (harmlose Richtung).
  ⚠️ PRAEZISIERUNG zu meiner Festlegung 4: es sind ZWEI Ebenen, und nur eine ist additiv.
  Parsergrenze checkErgebnis.ts:115 `unlesbar?: true` optional; das Leser-DTO
  lesepfade/checks.ts:116 `unlesbar: boolean` ist ERFORDERLICH und hat eine Aufrufstelle
  gekostet (page.test.tsx:16 BASIS, Bruch zur UEBERSETZUNGSZEIT, TS2741). Der Reviewer haelt
  die Asymmetrie fuer die richtige und ich stimme zu: optional dort, wo es viele Aufrufer gibt;
  erforderlich dort, wo es genau EINEN Erzeuger gibt (checkDetail()) — ein erforderliches Feld
  kann keinen falschen Vorgabewert tragen, und der Preis war laut statt still.
  Der Reviewer hat die TDD-Belege inhaltlich gegengeprobt: die roten Zahlen passen je Schicht
  zum Zusicherungsstil der Schicht (Schicht 1 nur 3 Fehlschlaege wegen toBeFalsy, Schicht 2
  alle sechs wegen toBe(false)/toBe(true), Summe 23 = 15 alt + 8 neu). Starke Indizienlage
  fuer "rot war wirklich vorher" — beweisen kann er es nicht, und er sagt das.
T176a1: fix round 1 dispatched — fuenf der sechs Minor:
  1. E2E-Gegenprobentest heisst "0 Positionen", Fixture traegt eine -> dritte Seed-Zeile mit
     gueltigem leerem V2 (bevorzugt) oder umbenennen.
  2. ⚠️ KOORDINATORENTSCHEIDUNG: die Check-UEBERSICHT kennzeichnet die Zeile jetzt auch.
     Begruendung: §11.5:10332 sagt woertlich "die ZEILE wird als 'Ergebnis unlesbar'
     gekennzeichnet statt als '0 Positionen'" — eine Tabellenzeile trifft das Wort mindestens
     so gut wie die Detailseite, und :5619 verortet nur den ALERT auf der Detailseite, verbietet
     die Kennzeichnung in der Uebersicht nicht. Der Betreiber hat den Zustand ausdruecklich
     NACHBAUEN lassen, weil ein 200 das luegt teuer ist; die Uebersicht ist die Suchflaeche.
     Form: ChecksTabelle.tsx zeigt in der Spalte "Positionen" das Wort `unlesbar` statt der Zahl.
     Kein Rot, kein Symbol (§6.6.5), plus Gegenprobe "lesbar mit 0 zeigt weiterhin 0".
  3. vier weitere Leertexte der Detailtabellen nachziehen (dieselbe Logik wie nachfuellLeertext).
  4. Zaehlfehler im Bericht (8 statt 7 Parser-Tests, 17 statt 16 neu).
  5. roh == null statt roh === null, damit ein kuenftiges Laufzeit-undefined nicht still
     "unlesbar" produziert.
  Fund 6 (roter Lauf ohne Namen) erledigt: Gleichzeitigkeit, begruendet — kein Vitest-Test
  importiert e2e/seed-lagerbuch.ts. Lehre: `2>&1 | tee` haette die Namen kostenlos mitgenommen;
  diese Runde faehrt mit erfasster Ausgabe.
T176a1: fix round 1/5 (5 addressed, 0 open; commit 407075e). Re-Review: keine neuen Schaeden,
  keine Beobachtungen ausserhalb. Die drei Pruefungen, die zaehlten:
  - Die vier Leertexte bleiben fuer LESBARE Checks byte-identisch: leertext(vorgabe) =
    unlesbarLeertext ?? vorgabe, und unlesbarLeertext ist nur bei check.unlesbar gesetzt.
    Die vier Originalliterale stehen unveraendert als vorgabe-Argument im Quelltext.
  - KEIN zweiter Herleitungsweg fuer unlesbar: CheckSummen.unlesbar (domain/check.ts:327) ist
    die einzige Quelle, checkDetail bezieht es daraus, CheckSummen hat repo-weit keinen
    zweiten Konsumenten. V1 setzt explizit unlesbar:false, die Mutual-Exclusion zu altFormat
    bleibt durch den unveraenderten Test abgesichert.
  - Das Flag ueberquert die Client-Grenze NICHT: checks/page.tsx uebersetzt feldweise (kein
    Spread) in CheckAnzeigeZeile, testbelegt via istRekursivJsonSicher — ueber die RSC/Client-
    Naht geht nur Text. ChecksTabelle.tsx ist vom Fix gar nicht beruehrt (kein Chip, kein Rot).
  Die Uebersichtskennzeichnung ist E2E belegt (toHaveCount(1) auf einem nach "unlesbar"
  gefilterten getByRole("row"), schlaegt bei 0 Treffern fehl) plus Gegenprobe auf eine
  "vollstaendig"-Zeile. Playwright 11 passed: kaputt · leer · gefuellt · Uebersichtszeile.
T176a1: complete (commits 04a4438..407075e, review clean)

=== T176-B — Schritte 5, 6, 7 (letzter Dispatch von Teil 6) ===
Commit 133e6ba "chore(lagerbuch): Spec 1 abgenommen — sechs Teile, 164 Tasks"
  (2 Dateien, +178/-6; danach ein Amend fuer die §14-Korrektur, siehe unten).
GATES, dieser Lauf, ohne Parallelbetrieb, alle mit tee erfasst (11.08.2026):
  typecheck gruen · lint 0 Fehler/5 vorbestehende Warnungen · vitest 337 Dateien
  5806 Tests · build gruen · playwright 173 Tests VOLLE Suite (6,1 min). Alle Exit 0.
  Nicht T176-As Zahlen (5798 / Teilsuite). Keine Zahl abgesenkt.
  ⚠️ Die T176a1-Flakiness (2 failed ohne Namen) hat sich NICHT reproduziert. Ein
  parallelbetriebsfreier Vollauf stuetzt die Vermutung "Gleichzeitigkeit", beweist
  sie aber nicht. Bleibt offen.
Alle acht Auftragspunkte umgesetzt:
  1. Gates erneut ✅ (oben) · 2. R30-R36 woertlich → Runbook §16.2 ✅
  3. §10 mit allen drei Untertabellen → Runbook §16.1-16.3 ✅
  4. (a) HTTPS/Kamera → §13 · (b) Zustand 27 + offener Check → §14 · (c) sechs
     Board-Posten → "Offene Posten" (jetzt 8 Zeilen) ✅
  5. B-2 ✅ · 6. Teil-4-Zeile gestrichen ✅ · 7. drei Ehrlichkeitsstellen im Commit ✅
  8. "alle 24 Tasks eingecheckt" abgehakt, mit Zwei-Dispatch-Vermerk ✅
WOERTLICHKEIT MASCHINELL BELEGT: diff Plan §10 (7489-7534) gegen Runbook §16 ergibt
  NUR die zwei renummerierten Unterueberschriften. Jede Tabellenzeile zeichengleich.
ENTSCHEIDUNG, die in keinem Plan stand: R30/R31 aus §10.2 uebernommen, NICHT aus §2.3.
  §2.3 traegt eine aeltere, kuerzere Fassung — ihrem R30 fehlt der margin-Rueckfall samt
  "Level H bleibt", ihrem R31 der Vorbehalt zu Betreiberfrage 9. §2.3 blieb unangetastet
  (historischer Abschnitt); der Unterschied ist in Planschritt 5 benannt.
  Ausserdem: es sind SIEBEN R-Zeilen, der Planschritt nennt vier — im Plan korrigiert.
ZWEI FUNDE UEBER DEN AUFTRAG HINAUS, beide im Commit-Entwurf des Plans:
  - "100 Tasks" ist falsch. Gezaehlt (grep '^### Task' je Plan): 14+13+34+26+53+24
    = 164. Betreff traegt jetzt 164.
  - "T62-T85" fuer Teil 4 ist falsch; Teil 4 traegt T62-T87 (26 Tasks). Im Commit
    korrigiert.
B-2 SELBST NACHGEMESSEN (nicht aus dem Brief uebernommen): 35 literale `fehler: "`-
  Stellen in 14 PRODUKTIV-Action-Dateien. ⚠️ Derselbe Ausdruck OHNE Testausschluss
  zaehlt 89 in 25 Dateien — diese Zahl steht mit in der korrigierten Planzeile, sonst
  bekommt der naechste Nachmesser eine dritte Zahl. Die "22" ist GESTRICHEN, nicht
  ersetzt; die zwei Kommentare, die sie noch nennen (actionTypen.ts:21,
  error.test.tsx:48), schreiben ihren Alt-App-Bezug selbst hin. Kein toHaveLength —
  gegatet ist die FORM (actionErgebnis.test.ts:162), nicht die Anzahl (A7).
CHECKBOXEN: nachgeprueft, `grep -c '\- \[x\]'` im Plan = 0. T176-A hakte KEINE Box im
  Plan an, sondern protokollierte in Bericht und Ledger. Gleich gehandhabt — keine
  einzelne angehakte Box, die inkonsistent waere.
⚠️ EIGENER FEHLER, im Selbstreview gefangen und per Amend behoben: §14 stand zuerst mit
  ZWEI gleichrangigen Abfragen (`ergebnis is null` UND `completed_at is null`) und dem
  Satz "ist beides 0, erledigt". Falsch — checkErgebnis.ts:200 macht ALLEIN
  `ergebnis IS NULL` zur Anzeige "0 Positionen" (`roh === null` → leer() ohne
  Kennzeichen, unabhaengig von completed_at). Eine importierte Zeile mit ergebnis NULL
  und gesetztem completed_at waere unter der falschen Haelfte abgelegt worden. Jetzt:
  EINE massgebliche Abfrage, die zweite ausdruecklich zum Einordnen statt zum Abhaken,
  und `offen = 0` als eigener Datenbefund markiert. LEHRE (dieselbe Klasse wie `!roh`
  bei Zustand 27): eine Zusatzbedingung, die "meistens mitlaeuft", ist im Import genau
  die, die nicht mitlaeuft.
BEDENKEN, die stehen bleiben:
  - §15 (Handgriffe) und §16.2 (Wortlaut) tragen dieselben sieben R-Zeilen in zwei
    Fassungen. Absicht (Zeitdruck: Handlung zuerst), aber pflegeanfaellig; §15 sagt
    ausdruecklich, dass der Wortlaut "dort und nur dort" in §16.2 steht.
  - Das Dokument ist laut eigenem Kopf NOCH NICHT das Cutover-Runbook. §16 muss beim
    Schreiben des echten Runbooks (Muster files-cutover.md) UEBERNOMMEN werden — wer
    es dort vergisst, verliert die Uebergabe an Spec 2 vollstaendig.
Bericht: task-176b-report.md.
T176-B: complete (commit 133e6ba, alle fuenf Gates gruen)
=== TEIL 6 ABGESCHLOSSEN — 24/24 Tasks. T176 lief in zwei Dispatches (A: Schritte 1-4,
    B: Schritte 5-7), dazwischen der Zustand-27-Nachbau. ===
Task 176-B: fix round 1/5 (4 addressed, 0 open; commit fe49511, frischer Umsetzender fix-176b).
  Re-Review: keine neuen Schaeden. §16 traegt jetzt einen eigenen Warnblock direkt unter der
  Ueberschrift ("vollstaendig und woertlich uebernehmen — nicht zusammenfassen, nicht nur
  verlinken") UND der irrefuehrende Satz ist entschaerft: "das KUENFTIGE Cutover-Runbook
  (nicht dieses Vorlauf-Dokument) wird unter Zeitdruck gelesen". §11 verweist jetzt beidseitig
  auf §13. §11.5 Zeile 11 traegt die gemessene Zahl in der ZELLE.
  ⚠️ NEUNTE INSTANZ DER FUNDORT-KLASSE, und diesmal hatten SIE ALLE DREI sie durchgeschrieben:
  die aeltere R30/R31-Fassung steht in §2.4, nicht in §2.3 — das Review, der Vorgaenger und ich
  haben denselben vorbestehenden Falschverweis des Plans uebernommen. Der Umsetzende hat ihn
  gefunden und die zwei Rueckverweise (:7459, :7466) mitkorrigiert. Vom Re-Reviewer an der
  Sache bestaetigt: :111 ist §2.3 (Betreiberfragen), :127 ist §2.4 (was der Plan dem Runbook
  schuldet, mit der Vierzeilen-Fassung). Kein Falschverweis-durch-Falschverweis-Ersatz.
Task 176-B: complete (commits 407075e..fe49511, review clean)
Task 176-B: minor (deferred) x2 aus dem Re-Review, fuer die Triage des Abschlussreviews:
  a) Plan-Zeile 118 traegt denselben Fehlertyp mit umgekehrtem Vorzeichen: ein SELBSTverweis
     "siehe §2.3" innerhalb von §2.3; gemeint ist §2.2 (:87). Bewusst nicht angefasst — ein
     Vorbeigehen-Fix haette das Risiko getragen, genau das vermiedene Muster zu wiederholen.
     Vom Re-Reviewer geteilt.
  b) Der neue §16-Warnblock verallgemeinert "§1-§15" pauschal als "gemessene Einzeltatsache
     aus dem Bau"; §6 und §15 sind eher Handlungslisten. Schwaecht die Kernaussage nicht ab.

=== ABSCHLUSSREVIEWS DISPATCHED (zwei, beide lesend, beide auf dem staerksten Modell) ===
Aufteilung, weil ein Reviewer an 356 KB + 140 KB ertrinkt und weil es zwei verschiedene Fragen
sind:
  final-teil6   — 9bf928d..47d4b7a (35 Commits, 356 KB). DAS Review, das PR #39 ausgelassen hat.
                  Auftrag: das Ganze, das 22 Task-Reviews strukturell nicht sehen konnten —
                  zwei Wahrheiten fuer denselben Wert, Lecks in der Schichtentrennung, ob die
                  byte-genauen 1:1-Vertraege wirklich gehalten werden, ob ein Test sie haelt
                  oder nur behauptet, Sicherheit/Datenwirkung (Klartext-Codes auf Papier).
  final-abnahme — f668007..fe49511 (21 Commits, 140 KB). Auftrag: den Commit "Spec 1
                  abgenommen" SATZ FUER SATZ gegen das pruefen, was belegt ist — eine unbelegte
                  Zeile darin ist als Critical eingestuft. Dazu: ist der einzige
                  Produktivcode-Eingriff sicher, sind die Fixes an gemergtem Code minimal
                  geblieben (W1 draengt zum Ueberfixen), ist das Runbook unter Zeitdruck
                  brauchbar.
Beide triagieren die deferred/parked-Zeilen dieses Ledgers und duerfen meinen Rulings
widersprechen — ausdruecklich Teil ihres Auftrags.

=== ABSCHLUSSREVIEW "ABNAHME" (f668007..fe49511) — Merge-faehig MIT KORREKTUREN ===
1 Critical, 1 Important, 5 Minor. Satz-fuer-Satz ueber 133e6ba: 24 belegt, 3 teilweise, 1 unbelegt.
Bericht: final-review-abnahme.md

⚠️⚠️ C1 — ZEITKRITISCH, BLOCKIERT DAS LOESCHEN DES WORKSPACE:
133e6ba sagt "§12.5 ... die Tabelle ist korrigiert". IST SIE NICHT. Im Plan §12.5 (:7318-7332)
ist genau EINE Zeile nachgezogen (:7329 suche-filter). Sechs zeigen unveraendert auf
e2e/lagerbuch-verwaltung.spec.ts (T150): :7321 bz-scan · :7325 geraete · :7327 inventur ·
:7328 loeschen · :7330 verfall · :7331 verwaltung-flow. Diese Datei traegt am HEAD 11 Tests
(6 Modulnavigation, 1x ?q=, 4x z27) — KEINER ist Nachfolger dieser sechs Alt-Specs.
Die korrigierte Zuordnung existiert NUR in task-176a-report.md, und .superpowers/sdd/ ist
gitignoriert (git ls-files .superpowers = 0). Wurzel: 04a4438 traegt den sich selbst
widersprechenden Satz "die Plantabelle ist nachgezogen (W1): DER BERICHT nennt je Zeile den
gemessenen Traeger" — 133e6ba hat die guenstigere Haelfte geerbt.
→ Der Vorzeigefund dieser Abnahme (eine Tabelle nennt einen Nachfolger, der die Aussage nicht
  traegt) ueberlebt sie im verfolgten Bestand, und der Commit sagt, er sei behoben.
→ BEHEBUNG VOR DEM LOESCHEN DES BERICHTS: die sechs gemessenen Traeger aus task-176a-report.md
  in die §12.5-Tabelle schreiben. KEIN rm -rf des Workspace, solange das nicht passiert ist.

I2 — die Check-UEBERSICHT zeigt fuer eine unlesbare Zeile weiter den gruenen Chip "vollstaendig":
checks/page.tsx:28-79, kaputtes ergebnis → alle Zaehler 0 → kein Chip gepusht → chips.length===0
→ {text:"vollstaendig", ton:"ok"}. Dieselbe Zeile sagt seit 407075e "unlesbar" in der
Positionen-Spalte UND gruen "vollstaendig". Das "200 das luegt" ist dort halbiert, nicht
beseitigt. Vorbestehend, und der Commit behauptet nichts ueber die Ergebnis-Spalte — deshalb
Important, nicht Critical. ZWEI FOLGEN:
  - e2e/lagerbuch-verwaltung.spec.ts:199-203 ist VAKUOES, aus dem Grund, den ihr eigener
    Kommentar bestreitet: der Filter auf "vollstaendig" trifft die KAPUTTE Zeile mit, weil die
    beide Woerter traegt. Waere auch gruen, wenn e2e-check-unlesbar die einzige Zeile waere.
  - Runbook :186-187 ("sie sagen es auf der Oberflaeche selbst") ist auf der Uebersicht halb wahr.
  → Verhaeltnismaessig: Board-Posten + §14-Satz ehrlich machen + Gegenprobe an eine BENANNTE
    lesbare Zeile haengen (Testkorrektur). Chip NICHT jetzt aendern, mit DRK-196 zusammen planen.

Minor: M3 "einzige Verhalten" → "einzige ANZEIGEverhalten" (seedLokal.ts:712-718 aus T175 aendert
auch Produktivcode-Ausgabe) · M4 "gestrichen statt ersetzt" ist nach fe49511 ueberholt, richtig
ist "kein Anzahl-Gate gebaut" · M5 Runbook §13:138 stellt die Messung vor den Handgriff, §14/§15
machen es richtig · M6 Plan §7.1 traegt weiter "Verifiziert in: Teil 5, T151/2" fuer ~20 Zeilen —
T175s eigene Lehre protokolliert und nicht angewandt · M7 guards.test.ts:487 toHaveLength(3) auf
die Typ-Exporte von detail.ts ist noch die von A7 verbotene Bauform, die DERSELBE Abnahme-Commit
fuer §11.5 als verboten zitiert (:458 "genau 3 Ausnahmen" ist legitim, dort deckelt die 3 die
Invariante 47=44+3).

Triage des Abschlussreviews:
  VOR DEM MERGE: C1 · T176-B a (Selbstverweis Zeile 118; das Vorbeigehen-Argument entfaellt,
    weil C1 ohnehin eine Planaenderung erzwingt) · der ⚠️-Satz aus M6 an §7.1.
  GEGENSTANDSLOS: T156 (beide Commits sind ueber PR #39 in main, ein Squash hiesse gemergte
    Historie umschreiben) · T161, T174, T176-A minor, T176-B b (Berichts-/Historientexte) ·
    T175 a/b/c und T172 a/b/c erledigt.
  AUFS BOARD: T159 · T160 a-d (c am wertvollsten) · T162 x2 · T163 x4 · T164 · T166 · T171 x2 ·
    T172 d MIT VORRANG (= M7) · T169 und T173 in DRK-192 einsortieren statt eigene Posten ·
    T175 Brief-Schritt 5 (Fund im PLAN: der curl|grep findet die error.tsx-Texte nie).
  MEIN PARKED-RULING (a479606 buendelt F-6/F-7/F-8) AUSDRUECKLICH BESTAETIGT, kein Widerspruch.
Die zwei Koordinator-Fehlanweisungen: Nr. 2 vollstaendig durchgezogen und an drei Schichten
geprueft ("vorbildlichste Stelle des Bereichs"); Nr. 1 durchgezogen, Rest = M6.

⚠️ LEHRE DES REVIEWS, ueber den Branch hinaus: "Der Beleg lebt im gitignorierten Bericht, die
Behauptung im Commit." Wenn eine Abnahme Messungen erzeugt, auf die sich spaeter jemand berufen
soll, gehoeren sie in ein VERFOLGTES Artefakt — Plan, Runbook, oder ein --allow-empty-Rumpf, der
die Zeilen wirklich aufzaehlt. Sonst muss die naechste Abnahme den Fund neu machen.

=== ABSCHLUSSREVIEW TEIL 6 (9bf928d..47d4b7a) — Merge-faehig MIT KORREKTUREN ===
0 Critical, 5 Important, 13 Minor, vollstaendige Triage. Bericht: final-review-teil6.md
Urteil woertlich: "Das ist unter den saubersten Portierungen, die ich gesehen habe."
⚠️ Der Reviewer stellt klar: "Mit Korrekturen" heisst NICHT "nachbessern, dann mergen" (PR #39
ist gemergt), sondern: der Merge war vertretbar, kein Fund rechtfertigt einen Revert — aber I1
und I2 gehoeren VOR DEN CUTOVER, nicht aufs Board. Keiner der fuenf ist nach der Messung mehr
als ein halber Tag.
I1 Etikettenbogen ohne Obergrenze + QR-Nutzlast zweimal in derselben Antwort (Client-Insel
   bekommt fertige SVG-Strings als Props → HTML UND Flight-Payload). Gemessen 2901 Byte/SVG:
   300 ≈ 1,7 MB · 800 ≈ 4,4 MB · 2000 ≈ 11,1 MB je Aufruf. 1:1 geerbt, KEIN Regressionsfehler.
   Neu: geteilter Suite-Container (Spike trifft portal/files/feedback/qr mit) und unbekannte
   Artikelzahl nach dem Import. Irrweg ausdruecklich ausgeschlossen: serverseitig rendern und
   als children in die Insel reichen behebt die Doppelung NICHT (Element-Beschreibungen landen
   ebenfalls im Flight-Payload).
I2 Gedruckte QR-MODULGROESSE −29 %, ohne Entscheidung: alt Level M/margin 1, neu H/margin 4 bei
   zeichengleich 20x20mm. Gemessen 0,571 → 0,408 mm (Artikel-URL), 0,645 → 0,444 (Token-URL).
   Der Plan nennt nur `margin` als Rueckfall — reicht nicht: margin 4→1 bei H = 0,465 mm, immer
   noch unter alt. R30 braucht ZWEI Stellraeder mit Rangfolge.
I3 e2e/lagerbuch-helfer.spec.ts:403-405 schreibt undeklariert in lagerort_verfall, ohne
   Aufraeumen; Wert innerhalb der Warnschwelle. seed-lagerbuch.ts:50-62 fuehrt
   E2E_VERFALL_FERN ausdruecklich ein, um genau das zu vermeiden.
I4 Tapmass-Messung enger als die Zusage (nur button, nur Hoehe; Vorbild misst 5 Selektoren und
   beide Kanten). Durch faellt die Icon-only-Zeilenaktion, fuer die §7.7.2 existiert.
I5 Fuenf geaenderte Dateien fehlen in §5 (Eigentuemertabelle), die sich "mechanisch pruefbar"
   nennt und die Spec 2 ERBT. Begruendungen stehen nur im gitignorierten Ledger.
Hochstufungen des Reviews von "Board" auf "vor dem Cutover": T171 b (toMatch(/^\//) laesst
  //fremder-host durch = offene Weiterleitung in einer Zusicherung; Fix /^\/(?!\/)/) und
  T163 c (loading.tsx-Riegel liest ein Verzeichnis statt eines Baums; Muster steht in
  druck.test.ts:63-70 fertig da). Beide Einzeiler. Begruendung: ein Riegel, der einen Bruchteil
  seiner Aussage deckt, TAEUSCHT DECKUNG VOR.
DRK-196 hochgestuft: keine Board-Sache, sondern eine IMPORTPRUEFUNG (offene Checks in der
  Alt-DB zaehlen und nach dem Import gegenpruefen).
Mein parked-Ruling (a479606 buendelt drei Fixes) auch von diesem Review bestaetigt.

=== ⚠️ CLICKUP RATE LIMIT — die restlichen Board-Posten konnten NICHT angelegt werden ===
Nach sechs Posten (DRK-192, DRK-193, 86cb3y7db, 86cb3y7h0, DRK-196, 86cb403u5) meldet ClickUp
"Rate limit exceeded, wait 1006 minutes" (~17 h). Die folgenden Posten sind damit offen und
gehoeren, weil dieser Ledger geloescht wird, IN DIE PR-BESCHREIBUNG — das ist das dauerhafte
Artefakt (und genau die Lehre des anderen Abschlussreviews: der Beleg darf nicht im
gitignorierten Bericht leben):
  A) Etikettenbogen ohne Obergrenze (I1) — high, Text stand fertig, Herleitung in
     final-review-teil6.md Fund I1.
  B) Sammelposten Testqualitaet, neun Stellen: etiketten.test.ts:181 · BestellListe.test.tsx
     :454-467 · etiketten.spec.ts:128-134 (Dunkelmodus ohne Gegenprobe) · etiketten.spec.ts:98
     (toBeHidden besteht auch bei fehlendem Element) · SeitenKopf-Benutzung ungepinnt ·
     Falle 60 ohne 303/Location · helfer.spec.ts:131 lose Teilstringprobe + :165/:257/:299/:319
     kein finally · mobil.spec.ts:102/107/144 innerWidth statt clientWidth · mobil.spec.ts
     :248/267 .ant-select-input als Klassenfilter.
  C) T160 a-d (Name, Doppeldeckung, Rohtext-Scans, <Flex>) — (c) am wertvollsten: ohne Halbsatz
     stellt der naechste Leser die Rohtext-Scans "vereinheitlichend" um und SCHWAECHT sie.
  D) Darstellung: T163 a (.seite ohne Seitengrund, Abweichung vom Hausmuster
     not-found.module.css:30/68) · T163 b (Rot im Dunkelmodus, dekorativ) · T162 a (Kommentar
     ungenau, laute Versagensrichtung).
  E) Plan-Defekt T175 Brief-Schritt 5: der curl|grep findet die error.tsx-Texte NIE, weil die
     Modul-Grenze clientseitig rendert. Wer ihn unbesehen faehrt, liest "nicht gefunden" und
     zieht den falschen Schluss. Halbsatz in Plan §7.3.
  F) Textheimat: M5 ("Zurueck zur Uebersicht" zweimal als Literal, waehrend _lib/zustandTexte.ts
     genau fuer diese Seite existiert) · M6 (EXCEL_BLATTNAME/EXCEL_FEHLERTEXT sind Anzeigetexte
     in einem Spalten-Modul).
  G) M8 — leerer Bestellvorschlag: BestellListe.tsx:213-226 hat ZWEI Knoepfe ohne disabled,
     waehrend der Excel-Knopf derselben Welle den Riegel hat (ArtikelTable.tsx:246). CSV laedt
     dann nur die Kopfzeile, "Liste kopieren" meldet Erfolg fuer einen leeren String. Die
     Alt-Anwendung konnte den Zustand nicht erreichen. Drei Knoepfe, zwei Regeln.
  H) M7 — 40 byte-identische Kopien von ohneKommentare() unter m/lagerbuch/ (Konvention K-4,
     aelter als Teil 6, KEIN Fund gegen Teil 6). Zahl fuer Spec 2: ein Parserfehler ist ein
     Fehler an 40 Stellen.
  I) In DRK-192 EINSORTIEREN statt eigene Posten (dieselbe Fundort-Klasse): T169 (:70 statt
     :72), T173 (g/[code]/page.test.tsx:292), T172 b (bauform.test.ts:66-78 → :95-96),
     T176-B a (Selbstverweis Plan-Zeile 118).

=== FIX-WELLE (fe49511..23143f7, 10 Commits) — alle zehn Punkte plus Flackern-Fix ===
Gates nach dem Fix, ohne Parallelbetrieb: typecheck gruen · lint 0 Fehler/5 vorbestehende
Warnungen · vitest 337 Dateien/5806 Tests, gruen in 4/4 Wiederholungen UNTER LAST · build
EXIT 0 · playwright 173/173 (voller Lauf). Die geweitete 44x44-Tapmassmessung zeigte KEINEN
neuen Fehlschlag.
Flackern aufgeklaert: toFile haengt hinter einem ECHTEN await import("write-excel-file/browser"),
das vi.resetModules() je Test neu aufloest; warteAuf pollte mit festem Budget (30x setTimeout(0)),
was unter Last (337 Dateien im Thread-Pool) nicht reichte. Fix e2ea094: die drei Tests warten auf
ein VERSPRECHEN statt auf ein Pollbudget, begrenzt durch Vitests Test-Timeout. Keine Zusicherung
geschwaecht, kein skip, kein retry.
⚠️ EHRLICH GEBLIEBEN: der Flake war auf dieser Maschine NICHT reproduzierbar — 0/12 vorher
(5 idle, 7 unter synthetischer 12-Kern-Last), 0/4 nachher. Die Diagnose stuetzt sich auf das Log
(/tmp/fixwelle-vitest.log:1496-1528: bare Timeout-Meldung, kein Hinweis auf einen nicht
gegriffenen Mock) plus Codeanalyse, NICHT auf eigene Reproduktion. Das ist als Grenze benannt
und nicht als Beweis verkauft.

⚠️⚠️ KOORDINATORFEHLER NR. 3 — MEINER, und diesmal ein Prozessfehler statt einer Fehlanweisung:
Ich habe fix-flake dispatcht mit dem Satz "Nichts laeuft parallel" und der Annahme, der Bericht
fehle — BEIDES war falsch. fix-final-2 war noch am Leben und hat um 01:14:06 ec6ae9d in denselben
Arbeitsbaum committet, waehrend fix-flake seine Vor-Messungen fuhr; und der Bericht existierte
bereits vollstaendig (465 Zeilen). Damit habe ich genau die Regel gebrochen, die ich acht Mal
gegenueber anderen durchgesetzt habe: NIE ZWEI UMSETZENDE PARALLEL AUF EINEM ARBEITSBAUM.
Folgenlos geblieben (ec6ae9d war docs-only, kein Konflikt, fix-flakes uncommittete Testaenderung
blieb unberuehrt), und beide Agenten haben es selbstaendig gemerkt und dokumentiert — fix-final-2
als Fund F0 in seinem Bericht, fix-flake in seiner Rueckmeldung.
URSACHE: ich habe aus "Agent geht nach jedem Zug idle" auf "Agent ist tot" geschlossen, ohne es
zu pruefen. Der Idle-Zustand in dieser Sitzung bedeutet NICHT beendet. Wer das verwechselt,
dispatcht Doppelarbeit.
LEHRE: vor jedem Ersatz-Dispatch den Vorgaenger ausdruecklich stilllegen und die Stilllegung
BESTAETIGEN lassen — nicht aus Symptomen schliessen. (Bei fix-final habe ich es richtig gemacht,
bei fix-final-2 nicht.)
