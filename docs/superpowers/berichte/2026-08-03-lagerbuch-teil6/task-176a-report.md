# Task 176a — Abnahme des Lagerbuch-Vorhabens, Schritte 1 bis 4

Branch `feat/lagerbuch-abnahme`, Worktree `iuk-suite-lagerbuch-teil6`.
Umfang: Schritt 1 (Gates), Schritt 2 (§12.5), Schritt 3 (§11.5), Schritt 4 (Abnahmecheckliste).
**Nicht** in diesem Umfang: Schritt 5 (Runbook-Zeilen), Schritt 6 (Übergabetabelle Spec 2),
Schritt 7 (Abschluss-Commit).

---

## Schritt 1 — Die fünf Gates

Ausgangsstand: `7cea8e4` (`chore(lagerbuch): Nachtrag zum Abrufprotokoll …`), Arbeitsbaum sauber.
Vor dem Playwright-Lauf geprüft: **kein** `next dev`/`pnpm dev` läuft (`ps aux | grep -E "next dev|pnpm dev"`
→ leer). Der Lauf ist **einmal** und vollständig gefahren.

| # | Gate | Kommando | Ergebnis |
|---|---|---|---|
| 1 | typecheck | `rtk pnpm typecheck` | **EXIT 0** — `TypeScript: No errors found` |
| 2 | lint | `rtk pnpm lint` | **EXIT 0** — `✖ 5 problems (0 errors, 5 warnings)` |
| 3 | vitest | `rtk pnpm vitest run` | **EXIT 0** — `Test Files 337 passed (337)` · `Tests 5781 passed (5781)` · 33.46s |
| 4 | build | `rtk pnpm build` | **EXIT 0** |
| 5 | playwright | `rtk pnpm exec playwright test` | *(siehe unten)* |

**Die fünf Lint-Warnungen** (blockieren laut Vorgabe nicht, hier namentlich, damit niemand sie für neu hält):

- `e2e/fixtures.ts:1:16` — `'expect' is defined but never used`
- `src/app/m/lagerbuch/_lib/boot.test.ts:60:46` und `:80:42` — `'_weg' is assigned a value but never used`
- `src/app/m/lagerbuch/_lib/grenzen.test.ts:469:46` — `'_weg' is assigned a value but never used`
- `src/app/m/lagerbuch/_lib/lesepfade/artikel.ts:102:54` — `'_now' is assigned a value but never used`

Das entspricht dem im Ledger festgehaltenen Endstand („lint 0 Fehler, 5 vorbestehende Warnungen").

**Vitest gegen den Ledger-Endstand:** der Ledger (Zeile 312) notiert für `47d4b7a` *331 Dateien / 5719 Tests*.
Gemessen sind es jetzt **337 Dateien / 5781 Tests** — die Differenz (+6 Dateien, +62 Tests) ist durch
T174/T175 erklärt und geht in die **richtige** Richtung. Keine Zahl ist gesunken.

---

## Schritt 2 — Was aus den 13 Alt-Specs geworden ist (§12.5)

Quelle der Alt-Aussagen: `/Users/rubeen/dev/personal/drk/lagerbuch/e2e/*.spec.ts` (`ca04eb1`, eingefroren,
nichts geändert). Vorgehen nach Brief-Lehre 2: **erst alle 13 Alt-Specs zeilenweise gelesen**, die Aussagen
notiert, **danach** die Nachfolger gesucht — nicht umgekehrt.

Geprüft wurde **nicht die Existenz** der genannten Nachfolgerdatei, sondern ob sie die **Aussage** trägt
(§12.3 Regel 3).

### Der tragende Befund (F-1): `e2e/lagerbuch-verwaltung.spec.ts` trägt sieben Zeilen nicht

Die §12.5-Tabelle nennt `e2e/lagerbuch-verwaltung.spec.ts` (Teil 5, T150) als Nachfolger für **sieben**
der 13 Zeilen (bz-scan, geraete, inventur, loeschen, suche-filter, verfall, verwaltung-flow). Die sieben
Alt-Specs umfassen zusammen ~19 KB.

**Gemessen** (`e2e/lagerbuch-verwaltung.spec.ts`, 116 Zeilen, vollständig gelesen): die Datei enthält
genau zwei `describe`-Blöcke —

1. `"lagerbuch — Modulnavigation"` (:10–93), sechs Tests, ausschließlich `aria-current`, `overflow-x`,
   Tastaturscroll und der 390px-Drawer;
2. `"lagerbuch — Journalsuche schreibt die literale URL (§12.1 Punkt 3)"` (:104–115), **ein** Test —
   von T174 nachgetragen.

Von den sieben Alt-Specs trägt sie damit **eine halbe Zeile** (suche-filter, Journal-Hälfte).

**Ursache:** exakt dieselbe Naht, die T174 für §12.1 Punkt 3 gefunden hat. T150 (Teil 5) hatte laut
seinem eigenen Auftrag **nur Modulnavigation** im Scope; Teil 6 hat die Datei nie beansprucht (§11 des
Plans schreibt ausdrücklich: „`e2e/lagerbuch-verwaltung.spec.ts` gehört Teil 5 (T150), nicht diesem
Plan"). Die §12.5-Tabelle wurde beim Planschreiben gefüllt, **bevor** T150 seinen Zuschnitt bekam, und
danach nie gegen die gebaute Datei gehalten. Der Brief sagte „Rechne damit, dass das Muster mehr als
einmal vorkommt" — es kommt **siebenmal** vor.

**Was der Befund NICHT ist:** eine Testlücke. In allen sieben Fällen ist die fachliche Aussage
getragen — nur eben von Dateien, die die Tabelle nicht nennt. Die Zeilen sind unten je einzeln belegt.
Der Befund ist eine **Tabellendrift**, und nach W1 wird die Tabelle in Richtung der Messung nachgezogen.

### Die 13 Zeilen einzeln

| ☑ | Alt-Spec | Aussage (Alt-Fundstelle) | Trägt der benannte Nachfolger sie? | Beleg |
|---|---|---|---|---|
| ☑ | `bestand-export.spec.ts` | `:18` Dateinamensform `bestand-YYYY-MM-DD.xlsx`; `:20-24` ZIP-Magic `PK` | **JA, 1:1** | `e2e/lagerbuch-bestand-export.spec.ts:38` „liefert eine echte .xlsx mit datiertem Namen" — die Regex ist zeichengleich übernommen und im Quelltext als „1:1 aus lagerbuch/e2e/bestand-export.spec.ts:18" ausgewiesen; die PK-Prüfung ebenso („1:1 aus :20-24"). Zwei zusätzliche Tests (`:78`, `:127`) sichern die Exportmenge über `data-export-zeilen`. **Die benannte Lücke wandert mit und bleibt Lücke:** geprüft ist die *Form* des Namens, nie der *Wert* (Browserzeit); der Wert ist in `_lib/bestandExport.test.ts` gegen ein festes Datum genagelt. Das ist §13 der Spec, **akzeptiert**, kein Befund. |
| ☑ | `bz-scan.spec.ts` | Gerät mit Barcode anlegen · Scan → Fundstelle · Kontrolle erfassen · unbekannter Barcode → klare Meldung statt Navigation · Logbuch zeigt **Klarnamen** statt roher Kennung | **NEIN** (F-1) — getragen von fünf ungenannten Dateien | `verwaltung/(arbeit)/bz/scan/BzScanner.test.tsx:105` „ruft ausschließlich die BZ-Action auf und gibt deren Treffer weiter", `:118` „bildet ok mit wert null auf null ab" (= unbekannter Barcode), `:132` „wirft bei einem Actionfehler, statt Unbekanntheit zu behaupten" — **schärfer als die Alt-Spec**, sie trennt „Code unbekannt" von „Lesevorgang gescheitert". Kontrolle erfassen: `bz/[id]/kontrolle/KontrolleForm.test.tsx:259` „meldet bestanden und setzt alle Eingaben auf ihre sichtbaren Defaults zurück". Klarname: `bz/[id]/BzLogbuchTabelle.test.tsx:95` bindet Spalte 6 an den aufgelösten Namen (`"E2E Helfer"`), und `_db/quelle.test.ts:15` „loest oidc → users.name auf" / `:37` „faellt bei unbekannter Kennung auf die ROHE ID zurueck". |
| ☑ | `check.spec.ts` | Code einlösen → `/helfer/check` → Ist unter Soll · Verfall melden → „N laufen ab" · abschließen → „Check abgeschlossen" · Admin sieht den Check | **JA** | `e2e/lagerbuch-helfer.spec.ts:395` „ein im Check gemeldeter Verfall steht danach in `checks.ergebnis`" — fährt Token → `/helfer/check` → Verfall → Weiter → Weiter → Abschließen → `Check abgeschlossen`, und vergleicht die Check-ID **gegen den Stand vor dem Lauf** (macht daraus eine Aussage über diesen Lauf statt über den Datenbestand). Live-Vorschau „N laufen ab": `_ui/CheckFlow.test.tsx:322` „die Live-Vorschau zaehlt ablaufende Artikel mit". Abschlusskennzahlen: `CheckFlow.test.tsx:790` „sendet die Nutzlast und zeigt die Kennzahlen". Nutzlast: `_lib/checkNutzlast.test.ts`. Admin-Sicht: `verwaltung/(arbeit)/checks/page.test.tsx`. `/abschließen/i` trifft heute genau einen Knopf — bestätigt: der Abschluss sitzt laut `CheckFlow.test.tsx:212` „der Commit sitzt im LETZTEN Schritt — und NUR dort". |
| ☑ | `etiketten.spec.ts` | Etikettenseite rendert · QR-Träger sichtbar · Drucken-Knopf | **JA, mit dem angekündigten Trägerwechsel** | `e2e/lagerbuch-etiketten.spec.ts:34` „zeigt Kacheln mit eingesetztem SVG, nicht mit `<img>`" — genau die in der Tabelle angekündigte Ablösung `<img src="data:image/png">` → `<svg>`. Dazu sieben weitere Tests derselben Datei (Host über dem Bogen, Auswahl/Keine, Druckmaskierung, Dunkelmodus, beide Riegel). `EtikettenBogen.test.tsx` (T162) und `_db/etiketten.test.ts` (T159, **dekodiert** den QR) tragen die Datenhälfte. |
| ☑ | `gate.spec.ts` | Login-freie Startseite zeigt Marke „LAGERBUCH", Untertitel „Materialverwaltung", Organisation und die **zwei** Einstiegskarten | **NEIN** — die Aussage steht nicht in `e2e/lagerbuch-helfer.spec.ts` | `e2e/lagerbuch-helfer.spec.ts` prüft am Gate nur Zugang/Sperre/`aria-current` (`:368` „markiert auf dem Gate gar nichts"), **keine** Marken- oder Kartenzusicherung. Getragen wird die Aussage von `_ui/Gate.test.tsx:345` „liest die Markennamen aus `_lib/marke.ts`, nicht aus Env-Variablen (§10.2)" und `:305` „die Karte BLEIBT — sie ist der einzige sichtbare Verwaltungseinstieg", sowie `page.test.tsx:177` „angemeldet OHNE Lagerbuch-Gruppe bleibt stehen und sieht **BEIDE** Karten". Der Zuschnitt folgt wie angekündigt §3.6.6/§3.9 (die Verwaltungskarte ist jetzt ein Link aufs Suite-`/login`, `Gate.test.tsx:269`, statt eines Demo-Login-Knopfs, `:318`). |
| ☑ | `geraete.spec.ts` | **Geteilt.** `:66` (`button "Defekt"`, Eingabeseite) stirbt am Umbau auf `Radio.Group` — soll nicht überleben. `:80` (**persistiertes** Literal „Defekt" im Check-Detail) soll überleben. `combobox "Standort"` bricht am handgesetzten `role`. | **NEIN** für die überlebende Hälfte (F-1) | Die überlebende Hälfte ist getragen und sogar **härter** als vorher: `_lib/konstanten.test.ts:35` `expect(ZUSTAENDE).toEqual(["In Ordnung","Gebrauchsspuren","Defekt"])` und `:36` `expect(ZUSTAND_DEFEKT).toBe("Defekt")` — mit dem ausgeschriebenen Grund „Historische ergebnis-JSONs tragen sie bereits; ‚Defekt' ist der Vertrag" (`:33`). Gerendert: `verwaltung/(arbeit)/checks/[id]/page.test.tsx:316` `{ ton: "rot", zeichen: null, text: "Defekt" }`. Auswertung: `_lib/domain/check.test.ts:96` „`geraeteAuffaellig` zaehlt !vorhanden ODER zustand === 'Defekt'". Die Eingabeseite ist wie angekündigt gefallen und durch `_ui/CheckFlow.test.tsx:588` ersetzt („die Auswahl steht NICHT allein auf der Farbe — Haken UND `aria-pressed` tragen sie"). |
| ☑ | `helfer-flow.spec.ts` | Code einlösen → Entnahme → Journal zeigt **Token-Provenienz**; gesperrter Token wird abgewiesen (`:56` erwartet wörtlich `/server-side exception/` — **der Absturz ist dort die erwartete Ausgabe**) | **JA — und die Absturzzeile ist korrekt NICHT übernommen** | `e2e/lagerbuch-helfer.spec.ts:120` „Gate → Helfer → Entnahme → Journal mit Token-Provenienz" trägt die erste Hälfte im echten Browser. Die zweite Hälfte ist **fachlich umgeschrieben**, wie die Tabelle verlangt: `:239` „weist eine schreibende Aktion mit deutschem Text ab" (statt `/server-side exception/`) und `:270` „schickt einen gesperrten Zugang ueber `/abmelden` ans Gate". Die serverseitige Hälfte („Sperren wirkt sofort") liegt wie zugesagt in `_lib/helferZugang.test.ts` und **bleibt**. Damit ist weder der Ausfall konserviert noch die Zusage verloren — beide Fehler, vor denen die Tabelle warnt, sind vermieden. |
| ☑ | `inventur.spec.ts` | Inventur korrigiert auf den gezählten Ist-Wert → „Inventur gebucht" → Journal zeigt „Korrektur"; Bestellung: markieren toggelt den Chip „bestellt" (`:28` `exact:true` trennt ihn von der Fußnote) | **NEIN** (F-1) — getragen von drei ungenannten Dateien | Inventurweg: `verwaltung/(arbeit)/inventur/InventurForm.test.tsx:153` „erlaubt 0 bis 9999 und zeigt Abweichungen mit ASCII-Vorzeichen im Text", `:195` „behält Werte bis zum Resolve, sperrt Doppelklicks und leert erst bei Erfolg", plus `positionenAus — Lost-Update-Riegel` (`:113`). Journalbuchung: `_actions/inventur.test.ts:256` „bucht die Abweichung per FEFO negativ mit typ korrektur". Chip-Trennung: `verwaltung/(arbeit)/bestellung/BestellListe.test.tsx:181` „‚bestellt' (exact) trifft nur den datumslosen Chip, nie ‚bestellt seit …'" — von T174 (`ac81f8f`) nachgezogen und damit **exakt** die Aussage aus `:28-29`. Der defensive Übersprung `:26` (`if (await firstToggle.count())`) ist wie in §12.3 Regel 5 gefordert weggefallen. |
| ☑ | `loeschen.spec.ts` | Artikel **ohne** Historie: Tippbestätigung nötig, Knopf bis zum exakten Namen gesperrt, dann Zeile weg. Artikel **mit** Historie: Löschen gesperrt („Nachweis zerstören"), stattdessen Deaktivieren. | **DOM-Hälfte JA, E2E-Hälfte NEIN** (F-1) | `_ui/LoeschDialog.test.tsx` trägt die Aussage vollständig und deutlich schärfer als die Alt-Spec: `:195` „der Loeschknopf bleibt gesperrt, solange der Name nicht exakt stimmt", `:98` „zeigt den Grund und bietet Deaktivieren an, wenn nicht loeschbar", `:118` „der Loeschknopf ist bei ‚nicht loeschbar' **gar nicht vorhanden**", `:80` „ruft `pruefen` BEIM OEFFNEN, vor jeder Handlung", `:154` „meldet den Grund NICHT als `Alert type=error`". Die zehn Selektorkopplungen der Alt-Spec (4× `.drawer`, 2× `.modalbox`, 4× `tr.click`) sind wie angekündigt alle gefallen. **Die in der Tabelle zusätzlich genannte E2E-Hälfte existiert nicht** — sie ist die einzige Zeile, bei der ein *zweiter* benannter Nachfolger schlicht leer ist. |
| ☑ | `suche-filter.spec.ts` | (a) Artikel-Suche filtert **client-seitig**; (b) Journal-Suche grenzt **server-seitig über URL-State** ein, literal `?q=Verband` | **Journal-Hälfte JA, Artikel-Hälfte anderswo** | (b) ✅ **im benannten Nachfolger und literal gepinnt**: `e2e/lagerbuch-verwaltung.spec.ts:113` `await expect(page).toHaveURL(/[?&]q=Verband/)` — Zeichenfolge gegen die Alt-Spec `:30` geprüft, **identisch**. Der Kopfkommentar `:96-102` weist den Ursprung aus und benennt den T174-Befund („dieser Nachfolger fehlte bislang komplett"). Die DOM-Hälfte davon: `journal/JournalFilter.test.tsx` (T147). `_ui/filter.test.tsx` (T109) trägt wie in der Tabelle vermerkt nur die `useUrlFilter`-Mechanik. (a) ist **nicht** in den drei genannten Dateien, sondern in `_ui/ArtikelSuche.test.tsx:122-219` (13 Tests: Name, **Fach**, ein Heuhaufen, Umlautfaltung, Trimmen, Leereingabe) und `_lib/artikelFilter.test.ts`. Die Rollen-Gegenprobe aus §12.3 Regel 2 ist gefahren: `ArtikelSuche.test.tsx:262` „das Suchfeld ist benannt und traegt `type=\"search\"`". |
| ☑ | `verfall.spec.ts` | Abgelaufene Charge aussondern → verschwindet aus der Warnliste → Journal zeigt Korrekturbuchung mit **Grund** und **negativem Delta** (`-3`). `/× aussondern/` hängt am typografischen `×`. | **NEIN** (F-1) — getragen von drei ungenannten Dateien | `verwaltung/(arbeit)/verfall/AussondernRow.test.tsx:96` „bucht mit einem Kommentar, der die Charge nennt" (= der Grund), `:86` „fragt vor dem Aussondern per Popconfirm, nicht per Modal" (die typografische `×`-Kopplung ist damit gefallen), `:109` „der Knopf traegt ein `aria-label` mit der Charge" (**der Rollen-Ersatzanker** für `/× aussondern/`). Negatives Delta: `_actions/aussondern.test.ts:132` „schreibt genau **eine negative** korrektur fuer den Handlager-Rest", `:176` „schliesst Bestand derselben Charge in einem Fahrzeug aus". Ablehnung einer noch gültigen Charge: `:193`. Vorzeichen im Journal: `_lib/journalZeile.test.ts:5` „eine Entnahme ist NEGATIV und traegt ein Minus", `:51` „das Vorzeichen ist **ASCII**, kein typografisches Minus". |
| ☑ | `verwaltung-flow.spec.ts` | Artikel anlegen → Zugang mit neuer Charge → Entnahme → Journal zeigt die Entnahme mit negativem Delta. `:48-50` begründet, warum `.first()` bewusst vermieden wurde (Sekundenauflösung der `ts`-Spalte). | **`journalZeile` JA, Flow-Hälfte anderswo** (F-1) | `_lib/journalZeile.test.ts` ist benannt und trägt (siehe Zeile verfall). Die Flow-Hälfte: `_ui/ArtikelDrawer.test.tsx:420` „bindet den DatePicker an Form und sendet bei `NEUE_CHARGE` nur `neueCharge` mit `YYYY-MM`", `:399` „sendet bei einer Bestandscharge nur `chargeId` und laedt den sichtbaren Bestand neu", `:488` „sendet das ausgewaehlte Fahrzeug mit Menge und Kommentar", `:368`/`:457` (Formsperre während laufender Buchung). **Der volle Rundlauf bis ins Journal existiert im echten Browser** — nur auf dem Helferweg statt dem Verwaltungsweg: `e2e/lagerbuch-helfer.spec.ts:120` „Gate → Helfer → Entnahme → Journal mit Token-Provenienz". Die Sekundenauflösungs-Begründung ist damit gegenstandslos geworden, nicht übergangen: die DOM-Fassung vergleicht Nutzlasten statt Tabellenzeilen. |
| ☑ | `verwaltung.spec.ts` | **(a)** Demo-Login erreicht die Verwaltungs-Shell („Übersicht", „Angemeldet als"); **(b)** Direktaufruf → literale URL `/\?returnTo=%2Fverwaltung%2Fartikel$/` → **fällt**; **(c)** angemeldete Verwaltung landet vom Gate aus nicht wieder auf der Startseite | **(b) fällt korrekt; (a)+(c) getragen, aber nicht vom benannten Nachfolger** | (b) ✅ **korrekt gefallen** — die literale URL hat nach dem Port kein Ziel mehr; die reine `returnTo`-Logik ist wie zugesagt in `_lib/returnTo.test.ts` gegatet: `:5` „laesst lokale Pfade durch", `:12` „weist alles ab, was nicht mit genau EINEM Schraegstrich beginnt", `:19` protokoll-relativ, `:25` `/\`, `:31` Doppelpunkt/Schemata, `:42` Tab/LF/CR — **Open-Redirect vollständig**. (c) ist `page.test.tsx:153` „Schritt 2: ein Admin wird umgeleitet — mit `returnTo`, und VOR der Schranke" — genau die Aussage „landet nicht wieder auf der Startseite". (a) ist in `e2e/lagerbuch-hosts.spec.ts` **nicht als eigene Zusicherung** vorhanden, wird dort aber in jedem `devLogin(..., callbackPath: "/verwaltung")` als Vorbedingung durchlaufen; die Shell selbst ist in `verwaltung/(arbeit)/page.test.tsx` und `_ui/VerwaltungsRahmen.test.tsx` gegatet. `e2e/lagerbuch-hosts.spec.ts:262` „gibt einem Konto ohne Lagerbuch-Gruppe 404 statt 403" ist die von der Tabelle gemeinte Zusicherung dieser Datei. |

**Ergebnis Schritt 2: 13 von 13 Aussagen sind getragen.** Keine Alt-Aussage ist verloren gegangen, und
keine ist durch einen grünen Nachfolger ersetzt worden, der etwas anderes prüft (§12.3 Regel 3 gehalten —
stichprobenartig an `bz-scan` `:118` vs. `:132`, an `helfer-flow` `:56` und an `geraete` `:66` vs. `:80`
je einzeln nachgelesen).

**Aber: 8 von 13 Zeilen nennen den falschen oder einen unvollständigen Nachfolger.** Das ist Befund F-1
und wird nach W1 durch Nachziehen der Plantabelle in Richtung der Messung behoben (siehe „Funde").

---

## Schritt 3 — Die 40 Fehlerzustände aus §11.5 auf Abdeckung prüfen

**Dieser Schritt baut nichts.** Er stellt fest, dass jeder Zustand einen **Ort** hat. Ein Ort ist
`Datei#Symbol:Zeile` bzw. `Datei` + **exakter Testname** — „Teil 4" ist kein Ort und steht deshalb
nirgends in dieser Spalte.

Vorgehen: drei parallele Suchläufe über den Modulbaum, deren Ergebnisse ich anschließend an den
Stellen selbst nachgelesen habe, die die Abnahme trägt — namentlich Zustand **8**, **16**, **27**,
**36** und **40**. (Zustand 27 hat diese Gegenprüfung gerechtfertigt: dort war die Meldung korrekt,
und sie ist der einzige echte Fund dieses Schritts.)

| # | Zustand | Ort — Implementierung | Ort — Test |
|---|---|---|---|
| 1 | Gate: Code nicht erkannt | `_lib/gateTexte.ts#TEXTE.code:67` · `_actions/gate.ts#einloesenAmGate:38` | `_actions/gate.test.ts` „bucht GENAU EINEN Fehlversuch, gibt den `code`-Text zurueck — und wirft NICHT" :329 · `page.test.tsx` „`?grund=code` wird zum fertigen Satz" :273 |
| 2 | Gate: Budget erschöpft | `_lib/gateSchranke.ts#gateFehlversuchBuchen:147` (Zweig :151), Eimer `proAbsender:26` · Text `gateTexte.ts#TEXTE.zuviele:80` | `_lib/gateSchranke.test.ts` „weist den 6. Fehlversuch desselben Absenders ab" :79 · „trifft NUR diesen Absender" :91 |
| 3 | Gate: modulweite Bremse | `_lib/gateSchranke.ts` `gateMinute:42`/`gateStunde:52`, Zweige :154/:157 | `_lib/gateSchranke.test.ts` „greifen auch bei jedem Versuch von einem ANDEREN Absenderschluessel" :123 · „liefert die GROESSTE der drei Restzeiten" :158 |
| 4 | `/t/<code>` ungültig | `t/[code]/route.ts#GET` Misserfolgszweig :86-89 · `#zumGate:47-50` | `t/[code]/route.test.ts` „bucht den Fehlversuch und leitet mit `?grund=code` aufs Gate" :330 · E2E `lagerbuch-helfer.spec.ts` „leitet einen ungueltigen Code mit sichtbarem Grund ans Gate" :217 |
| 5 | `/t/<code>` gültig | `t/[code]/route.ts#GET:91-96`, `#antwort:128` | `t/[code]/route.test.ts` „antwortet 303 mit RELATIVEM Location und setzt das Cookie auf DIESER Antwort" :259 · E2E `lagerbuch-helfer.spec.ts` :182 |
| 6 | Sitzung abgelaufen | `_lib/helferZugang.ts#requireHelferSchreibend:170` → `RIEGEL_TEXTE.sitzung` (`_lib/actionTypen.ts:87`) → `_ui/Entnahme.tsx:71,160-168` | `_lib/helferZugang.test.ts` „liefert grund 'sitzung' bei abgelaufener oder fehlender Sitzung" :246 · `_ui/Entnahme.test.tsx` „`sitzung` zeigt den Text und schickt zum Gate — ohne die Menge zu verwerfen" :290 |
| 7 | Code gesperrt | `_lib/helferZugang.ts:85` → `RIEGEL_TEXTE.gesperrt` (`actionTypen.ts:88`); **ohne** Gate-Link | `_ui/Entnahme.test.tsx` „`gesperrt` zeigt den Text und KEINEN Weg zurueck aufs Gate" :266 · E2E `lagerbuch-helfer.spec.ts` „weist eine schreibende Aktion mit deutschem Text ab" :239 |
| **8** | **„Entnahme gebucht: 0"** | `_actions/buchung.ts#bucheEntnahmeHelfer:307-311` → `{ok:false, grund:"leer", text: leerText(name)}` · Render `_ui/Entnahme.tsx:146` bindet `s.rot` an `art === "fehler"` | `_actions/buchung.test.ts` „leeres Handlager ist ein FEHLER mit dem Artikelnamen — kein gruener Haken auf 0" :407 · **`_ui/Entnahme.test.tsx` „`leer` rendert die FEHLERform, NICHT den gruenen Chip" :238** |
| 9 | Teilweise gebucht | `_ui/Entnahme.tsx:75-82` | `_ui/Entnahme.test.tsx` „TEILMENGE: sagt ‚3 von 5 gebucht' — heute steht dort nur die kleinere Zahl" :217 |
| 10 | Netz weg | `_ui/Entnahme.tsx:84-90` (`NETZ_TEXT_BUCHUNG`) · `_ui/CheckFlow.tsx:233,251` | `_ui/Entnahme.test.tsx` „ein GEWORFENER Fehler wird gefangen…" :332 · `_ui/CheckFlow.test.tsx` „ein geworfener Fehler zeigt den deutschen Netztext, NICHT `e.message`" :1134 |
| 11 | Die deutschen Meldungstexte als **Rückgabewert** | Form: `_lib/actionErgebnis.ts#ActionErgebnis:25`, `#ActionAusgang:39`; Texte literal in den 18 Action-Dateien | `_lib/actionErgebnis.test.ts` „verlangt im Fehlerzweig einen `fehler`-Text" :162 — **siehe Befund F-3 zur Zahl „22"** |
| 12 | Fremdes Objekt in der Check-Nutzlast (Wurf) | `_actions/check.ts#checkAbschluss` vier Würfe :196, :241, :255, :298 · Grenze `error.tsx#LagerbuchFehlergrenze:39` | `_actions/check.test.ts` describe „checkAbschluss — die vier Wuerfe bleiben Wuerfe (§7.3, Riegelfall)" :311 mit :312/:319/:326/:333 und „ein Wurf laesst die Transaktion VOLLSTAENDIG zuruecklaufen" :340 |
| 13 | Löschen abgelehnt (Historie) | `_actions/loeschen.ts#verknuepftGrund:57`, Zählpfade :74/:83/:113/:122/:161/:171/:189 | `_actions/loeschen.test.ts` „blockiert ein BZ-Geraet mit Kontrolle" :502 · `_ui/LoeschDialog.test.tsx` „zeigt den Grund und bietet Deaktivieren an, wenn nicht loeschbar" :98 |
| 14 | Löschen scheitert am Fremdschlüssel | `_actions/loeschen.ts#FESTER_LOESCHFEHLER:43-44` → `catch` in `#loescheElement:278-280` | `_actions/loeschen.test.ts` „rollt Verfall-Cleanup bei einem spaeten Delete-Fehler zurueck und verbirgt SQLite-Text" :631 · „faengt auch einen verbliebenen scopeLagerortId-Fremdschluessel freundlich ab" :655 |
| **15** | `/g/<code>` Barcode unbekannt — **200, gestaltet** | `g/[code]/page.tsx#GeraetDeepLink:91-117` (Kommentar „§11.5, ZUSTAND 15" ab :82) · Texte `_lib/zustandTexte.ts:40-44` | `g/[code]/page.test.tsx` „ruft NICHT notFound" :143 · „nennt den gescannten Code im Klartext" :148 · „bietet beide Wege zurueck" :164 |
| **16** | Verwaltungs-Detailseite, unbekannte ID — **Suite-404, bewusst nicht gestaltet** (7 Stellen) | (1) `checks/[id]/page.tsx:180` · (2) `vorlagen/[id]/page.tsx:18` · (3) `sauerstoff/[id]/page.tsx:35` · (4) `geraete/[id]/page.tsx#geraetSeitenInhalt:17` · (5) `bz/[id]/kontrolle/page.tsx#kontrolleSeiteInhalt:39` · (6) `fahrzeuge/[id]/page.tsx:71` · (7) `bz/[id]/page.tsx:95` — je `notFound()` | (1) `checks/[id]/page.test.tsx:454` (Quelltext-Regex) · (2) `vorlagen/[id]/page.test.tsx` „…liefert für unbekannte IDs 404" :197 · (3) `sauerstoff/[id]/page.test.tsx` :312 · (4) `geraete/[id]/GeraetForm.test.tsx` „nimmt für unbekannte IDs den echten notFound-Weg" :452 · (5) `bz/[id]/kontrolle/KontrolleForm.test.tsx` „liefert für eine unbekannte Geräte-ID den Next-404-Weg" :433 · (6) `fahrzeuge/[id]/page.test.tsx` :308 · (7) `bz/[id]/page.test.tsx` :381 |
| 17 | `/a/<id>` unbekannt | `a/[artikelId]/page.tsx#ArtikelDeepLink:114-121` (`LeerZustand`, **kein** `notFound`) | `a/[artikelId]/page.test.tsx` „gestalteter Zustand mit Rueckweg, KEIN wortloser Sprung und KEIN notFound()" :370 |
| 18 | `/a/<id>` ohne Sitzung | `a/[artikelId]/page.tsx:83-91` | `a/[artikelId]/page.test.tsx` „Ausgang 3 — weder noch: Gate MIT returnTo…" :232 · „das `returnTo` traegt den AEUSSEREN Pfad" :241 |
| 19 | Angemeldet ohne Lagerbuch-Gruppe → 404 **+ Logzeile** | `_lib/zugang.ts#meldeFehlendeGruppe:137-146` (`console.warn` :140), Dedup-Set :135 | `_lib/zugang.test.ts` „meldet die fehlende Gruppe EINMAL JE PERSON, nicht je Anfrage" :393 — prüft `toContain("lagerbuch_nutzer")`, `not.toContain("sub-2")`, `not.toContain("Bert")` · E2E `lagerbuch-hosts.spec.ts` :262 |
| 20 | Nicht angemeldet, Verwaltungspfad | `_lib/zugang.ts#requireLagerbuchAdmin:254` → `redirect("/login?callbackUrl=…")` | `_lib/zugang.test.ts` „leitet OHNE Sitzung auf /login — mit callbackUrl auf den ANGEFRAGTEN Host" :359 · E2E `lagerbuch-etiketten.spec.ts` „antwortet auch ohne jede Sitzung nicht mit dem Bogen" :167 |
| 21 | Modulpfad auf fremdem Suite-Host | `_lib/host.ts#requireLagerbuchHost` · `#lagerbuchHostOderNull` | `_lib/host.test.ts` „wirft auf fremdem Host — notFound(), KEIN 403" :66 · E2E `lagerbuch-hosts.spec.ts` :142 (15 Pfade) und „traegt alle fuenfzehn Einstiege" :118 |
| 22 | Server-Action-Riegel wirft → Modul-Grenze | Riegel `_actions/gate.ts:49`, `_actions/sitzung.ts:55` · Grenze `error.tsx#LagerbuchFehlergrenze:39-70` | `_actions/gate.test.ts` „auf fremdem Host: notFound(), und NICHTS davor ist gelaufen" :134 · `error.test.tsx` :43/:74. **Die Naht selbst ist Abrufpunkt (T175 Schritt 5), von `error.tsx:31-37` selbst als „PRUEFPUNKT, KEINE BEHAUPTUNG" ausgewiesen** |
| 23 | Unerwarteter Wurf im Render | `error.tsx#LagerbuchFehlergrenze:39` · Texte `_lib/zustandTexte.ts:20-32` · realer Werfer `_db/etiketten.ts:21` | `error.test.tsx` „rendert den Text ohne Technik" :43 · „zeigt keinen Stack und keine digest-Kennung" :74 · „traegt use client in Zeile 1" :112 |
| 24 | Journal-/Checks-Grenze hat gegriffen | `_lib/grenzen.ts:226/:229/:231/:241` · Erkennung `limit(GRENZE+1)` in `lesepfade/journal.ts:83`, `checks.ts:41,54-58` · Text `journalFilterLogik.ts#deckelText:80-84` | `journalFilterLogik.test.ts` „nennt den Deckel nur, wenn die Plus-eins-Zeile ihn belegt" :117 · `lesepfade/checks.test.ts` „macht den Deckel BEOBACHTBAR — CHECK_GRENZE + 1" :94 · „meldet bei EXAKT CHECK_GRENZE Zeilen mehrVorhanden FALSE" :108 |
| 25 | `von`/`bis` unlesbar | `_lib/format.ts#zeitraumAus:140-150`, `HINWEIS_UNGUELTIG:127`, `HINWEIS_LEER:149` | `_lib/format.test.ts` „unparsbar: die Grenze FAELLT WEG und ein Hinweis erscheint" :133 · „von > bis: BEIDE bleiben, und der Hinweis sagt warum" :152 · `ChecksFilter.test.tsx` „zeigt verworfene Datumsgrenzen als gekanteten Text und nicht als Fehler-Alert" :105 |
| 26 | Altes `checks.ergebnis`-Format (V1) | `_lib/checkErgebnis.ts#parseCheckErgebnis:148-171` (V1-Zweig :156-158) · `_lib/domain/check.ts:94` `altFormat:true` · Anzeige `checks/[id]/page.tsx:120` | `_lib/checkErgebnis.test.ts` describe „parseCheckErgebnis — das ALTE Format (V1)" :4 · `_lib/domain/check.test.ts` „setzt altFormat: true — die Detailseite SAGT es" :43 · `checks/[id]/page.test.tsx` :373 |
| **27** | **`checks.ergebnis` unlesbar** | **Hälfte 1 vorhanden:** `_lib/checkErgebnis.ts#parseCheckErgebnis` → `leer()` :127-129, Rückgaben :149/:154/:161. **Hälfte 2 — KEIN ORT** | Hälfte 1: `_lib/checkErgebnis.test.ts` describe „parseCheckErgebnis — jeder Lesefehler wird ein LEERES V2" :95 · `_lib/domain/check.test.ts` „liefert bei kaputtem JSON Nullen statt eines Wurfs" :206. **Für die Kennzeichnung: kein Test — siehe Befund F-2** |
| 28 | Gelöschtes Objekt im Snapshot | `_lib/lesepfade/checks.ts#checkDetail` :139/:150/:209 „(gelöschter Artikel)", :163 „(gelöschtes Gerät)", :184/:191 „(gelöschte Flasche)" | `_lib/lesepfade/checks.test.ts` describe „checkDetail — tolerant gegen geloeschte Bezugsobjekte" :310, „ueberbrueckt Artikel, Geraet und Soll-Position" :311 · „liefert null statt 200, wenn Snapshot UND Stamm fehlen" :188 |
| 29 | Flasche ohne Messung | `_lib/lesepfade/o2.ts#o2FlaschenUebersicht:102` (`status: … : null`), `#o2FlascheDetail:141` · Anzeige `SauerstoffListe.tsx:113` „keine Messung" | `_lib/lesepfade/o2.test.ts` „liefert bei KEINER Messung status null, nicht 0 %" :58 · `SauerstoffListe.test.tsx` „zeigt status:null exakt als keine Messung, nie als 0 Prozent oder rot" :170 |
| 30 | Nennfülldruck unbekannt | `_lib/lesepfade/checks.ts:175` und :181-186 (`prozent:null, ampel:null`) · Anzeige `checks/[id]/page.tsx:83` | `_lib/lesepfade/checks.test.ts` „liefert null statt 200, wenn Snapshot UND Stamm fehlen" :188 · `_ui/CheckFlow.test.tsx` „OHNE Nennfuelldruck ist der Fuellstand NICHT BEWERTBAR, nicht „niedrig"" :690 |
| 31 | BZ nie geprüft | `_lib/domain/bz.ts#bzFaelligkeit:40-46` → `ampel:"rot"`, `ueberfaellig:false`, `nieGeprueft:true` · `bzAnzeige.ts#faelligText:23` | `_lib/domain/bz.test.ts` describe „bzFaelligkeit — NIE GEPRUEFT ist die Falle" :8 / „liefert rot MIT ueberfaellig: false" :9 · `bzAnzeige.test.ts` :35-52 |
| 32 | Gerät ohne Datum | `_lib/domain/geraet.ts#parseTag:40-46`, `#datumFaelligkeit` · `_lib/format.ts#geraetFaelligChip:78-89` (bei `objekt` → `null`) | `_lib/format.test.ts` „medizin ohne Datum -> grauer Chip 'kein MTK-Datum'" :70 · „objekt ohne Datum -> null (KEIN Chip)" :75 · `_lib/domain/geraet.test.ts` :36 |
| 33 | Nachfüllen, Handlager leer | `_lib/schreibpfade/umlagerung.ts` (Ziel-Leg strikt aus `teile[]`) · `_ui/CheckFlow.tsx:293-295` (Chip) und :317-330 | `_ui/CheckFlow.test.tsx` „sagt AUSDRUECKLICH, wenn weniger gebucht wurde als bestaetigt (NEU)" :850 · „sendet die Nutzlast und zeigt die Kennzahlen" :790 (Chip „2 fehlt weiterhin" :823) · `umlagerung.test.ts` „schreibt bei LEERER Quelle GAR KEINE Zeile" :79 |
| 34 | Aussondern abgelehnt | `_actions/aussondern.ts:48-49`, :66 („…im **Handlager**"), :46 · Anzeige `AussondernRow.tsx` `Alert type="warning"` | `_actions/aussondern.test.ts` „lehnt eine noch gueltige Charge ohne Schreiben oder Revalidierung ab" :193 · „lehnt eine Charge ohne positiven Handlager-Rest trotz Fahrzeugbestand ab" :215 |
| 35 | Kein Fahrzeug / nichts zu prüfen | `helfer/check/page.tsx:88-99` (`LeerZustand`) · `_ui/CheckFlow.tsx:261` | `helfer/check/page.test.tsx` „kein Fahrzeug angelegt: LeerZustand mit Rueckweg, KEIN CheckFlow" :305 · `_ui/CheckFlow.test.tsx` „Fahrzeug OHNE ALLES zeigt den LeerZustand — mit benanntem Rueckweg" :202 |
| **36** | Kamera verweigert — **vier unterscheidbare Zustände** | Alle in `_ui/BarcodeScanner.tsx`: (1) **kein sicherer Kontext** `#KEIN_SICHERER_KONTEXT:33-35`, Prüfung **vor** dem dynamischen Import :140-143 · (2) **abgelehnt** `#kameraText:49-52` (`NotAllowedError`/`SecurityError`) · (3) **keine Kamera** :53-55 (`NotFoundError`/`OverconstrainedError`) · (4) **belegt** :56-58 (`NotReadableError`/`AbortError`). Selbst nachgelesen und bestätigt. | `_ui/BarcodeScanner.test.tsx` describe „BarcodeScanner — vier Kamerazustaende statt einem (§7.6.3)" :273 mit (1) :274 + Arm-Isolation :301/:318 · (2) :332/:340 · (3) :348/:354 · (4) :360/:368. Dazu ein **fünfter, absichtlicher** Auffangzweig :376 „ein unbekannter Fehler behauptet NICHT, der Zugriff sei abgelehnt worden" |
| 37 | Leerzustände (Buchung · Gerät · Check · Bestellvorschlag) **+ Kacheln** | Buchung `journal/page.tsx:88` + `LetzteBuchungenTable.tsx:44-46` · Gerät `GeraeteListe.tsx:139-142` · Check `checks/page.tsx:139` · Bestellvorschlag `BestellListe.tsx:234` · Kacheln `verwaltung/(arbeit)/page.tsx:92-125` | Buchung: `journal/page.test.tsx` :278 + `JournalTable.test.tsx` „zeigt den vom Server gewaehlten Leertext" :125 + `LetzteBuchungenTable.test.tsx` :127 · Gerät: `GeraeteListe.test.tsx` „unterscheidet ungefilterten und gefilterten Leertext samt X-von-Y" :309 · Check: `ChecksTabelle.test.tsx` :118 · Kacheln: `verwaltung/(arbeit)/page.test.tsx` „zeigt im leeren Zustand fünf Kacheln…" :219. **Bestellvorschlag-Leertext: kein Test — siehe Befund F-4** |
| 38 | Etikettenbogen ohne Domain | `_db/etiketten.ts:58` `throw new EtikettenBasisFehlt()`, Klasse :23-28 · Text `_lib/zustandTexte.ts#etikettenDomainFehlt:54-60` · Auffang `etiketten/page.tsx:47-56` | `_db/etiketten.test.ts` „wirft EtikettenBasisFehlt, wenn moduleUrl null liefert" :167 (Name gepinnt :178) · `_lib/zustandTexte.test.ts` „nennt in der Domain-Meldung den Variablennamen und die Folge" :70. **Renderzweig ohne Verhaltenstest — siehe Befund F-4** |
| 39 | Zwischenablage ohne secure context | `BestellListe.tsx#kopieren:66-78` (Prüfung auf **Vorhandensein**, Begründung :60-64) · Rückfall-Modal :238-253 | `BestellListe.test.tsx` „zeigt ohne secure context den Text zum Markieren statt einer Fehlermeldung" :435 — stubbt `navigator` ohne `clipboard`, prüft Abwesenheit von „Kopieren fehlgeschlagen" und die **Zeichengleichheit** des Textarea-Inhalts |
| **40** | Auflöser findet die Kennung nicht — **benannter Defektzustand §4.13 (i), protokolliert** | Rückfall auf die rohe ID: `_db/quelle.ts#quelleAufloeser:44-45`. **Die Logzeile liegt NICHT dort, sondern in `_lib/konto.ts#meldeNamenlos:49-60`** (`console.warn` **mit** der Kennung — Absicht, :41-45), dedupliziert über `namenlosGemeldet:47`, einmal je Person je Prozess. Selbst nachgelesen und bestätigt. | `_db/quelle.test.ts` describe „merkeNutzer — die Gegenprobe zum Defektzustand (§4.13 i)" :90 → **„MELDET den Defektzustand sichtbar — mit der Kennung, und nur einmal je Person" :156** · „BEIM INSERT gilt die Regel NICHT — und das ist der Defektzustand mit Ansage" :131 · UI-Seite: „DER BENANNTE DEFEKTZUSTAND: name UND email null → die rohe Kennung" :55 |

### Die zwei Zeilen, die sich gegenseitig prüfen — beide Seiten stehen, mit ihrer Begründung

**Zustand 16** (Verwaltungs-Detailseite → **Suite-404**, sieben Stellen, bewusst **nicht** gestaltet)
gegen **Zustand 15 und 17** (`/g/<code>` und `/a/<id>` → **HTTP 200 mit gestaltetem Zustand**).
Dieselbe Frage, gegenläufige Antwort, und der Unterschied ist begründet:

- Bei 15/17 steht ein Mensch **mit einem gescannten Gegenstand in der Hand** am Regal. Ein 404 nähme
  ihm die Auskunft, ohne die er nicht weiterkommt. Belegt: `g/[code]/page.test.tsx` „**ruft NICHT
  notFound**" :143 und `a/[artikelId]/page.test.tsx` „gestalteter Zustand mit Rueckweg, KEIN wortloser
  Sprung und **KEIN notFound()**" :370.
- Bei 16 ist es eine **Verwaltende, die einem veralteten Link gefolgt** ist. Ein gestalteter Zustand
  verriete dort die **Existenz von Admin-Routen** an jeden, der sie durchprobiert. Belegt durch die
  sieben `notFound()`-Aufrufe oben — und dadurch, dass das Modul **kein** `not-found.tsx` anlegt:
  `error.test.tsx` „legt weder not-found.tsx noch loading.tsx noch global-error.tsx an" :123.

Beide Seiten stehen **in ihrer heutigen, gegenläufigen Form**. Ich habe nichts vereinheitlicht; die
Begründung steht hier in den Zeilen selbst und nicht nur als Fußnote, damit sie beim nächsten
Durchgang nicht als Inkonsistenz „repariert" wird.

**Ergebnis Schritt 3: 40 von 40 Zuständen haben einen Ort.** Ein Zustand — **27** — hat seinen Ort
nur zur Hälfte (der Parser fängt den Lesefehler, die geforderte **Kennzeichnung** existiert nicht).
Das ist Befund **F-2** und der einzige echte Fund dieses Schritts. Es wurde hier **nichts nachgebaut**.

---

## Schritt 4 — Die Abnahmecheckliste über alle sechs Teile

Jede Zeile mit Beleg. Wo die Checkliste „abgehakt in Teil N" nahelegt, ist stattdessen die **Sache**
geprüft (Brief-Lehre 1). Zahlen sind **unabhängig vom Zusicherungstext** von der Dateiablage
abgezählt.

### Teil 1 — Gerüst und Datenmodell (T1–T14)

| ☑ | Zeile | Beleg |
|---|---|---|
| ☑ | 14 Tasks eingecheckt; das **Dreieck** steht | (1) Migrationsverzeichnis `src/app/m/lagerbuch/_db/migrations` existiert; (2) `src/core/bootstrap.ts:35` — `{ key: "lagerbuch", migrationsFolder: "src/app/m/lagerbuch/_db/migrations" }` in `MODULE_MIGRATIONS`; (3) `Dockerfile:55` — `COPY --from=builder … /app/src/app/m/lagerbuch/_db/migrations ./src/app/m/lagerbuch/_db/migrations`. **Alle drei gemessen, nicht angenommen.** Die Gegenprobe (auskommentierte `COPY`-Zeile → roter `bootstrap.test.ts`) ist Teil 1s Protokoll; ich habe sie **nicht erneut gefahren** (sie erforderte eine Mutation am `Dockerfile`) — siehe Bedenken B-3. |
| ☑ | Schema-Diff gegen die Alt-Anwendung abschließend und protokolliert | Getragen von `_db/migrations.test.ts` und `_db/schema.ts`; die vier Migrationen liegen im Verzeichnis. **Der Diff selbst ist ein Protokolldokument aus Teil 1 und liegt nicht im Code** — ich habe seine Existenz nicht als Datei belegen können und hake ihn deshalb **auf die Struktur** ab, nicht auf das Protokoll. Siehe Bedenken B-3. |
| ☑ | `_db/append-only.test.ts` behauptet **vier** Trigger, die `o2`-Gegenprobe und `INSERT OR REPLACE` | Vier Trigger in zwei Paaren: describe „buchungen — das Journal (0001, woertlich aus der Alt-App)" :49 mit „blockiert UPDATE" :54 / „blockiert DELETE" :59, und describe „bz_kontrollen — der Medizinprodukte-Nachweis (0002, neu mit S2)" :73 mit :78 / :83. **Gegenprobe:** describe „o2_messungen — die BEWUSSTE Gegenprobe zu Entscheidung 5 (c)" :89 mit „erlaubt UPDATE" :102 und „erlaubt DELETE" :107 — beweist, dass die Trigger gezielt sind und nicht global. **`INSERT OR REPLACE`:** describe „INSERT OR REPLACE — die gemessene Tatsache, nicht die Beschwerde" :125. Dazu :64 „blockiert auch eine sqlite3-Sitzung von Hand — es ist kein Konventionsschutz". |
| ☑ | Registry-Eintrag exakt, insbesondere `requiresAuth: false` und `prodHosts: []` | `src/core/registry.ts` — `{ key: "lagerbuch", title: "Lagerbuch", icon: "ContainerOutlined", shell: "full", requiresAuth: false, requiredGroups: [], adminGroups: ["lagerbuch_nutzer"], prodHosts: [], showInSwitcher: true, switcherGroupSources: ["admin"] }`. **Beide geforderten Werte zeichengleich gelesen.** |

### Teil 2 — Zugang (T15–T27)

| ☑ | Zeile | Beleg |
|---|---|---|
| ☑ | `_lib/zugang.ts` ist der **eine** Riegel; die fünf Namen kommen unter `m/lagerbuch/` **nicht** vor | Scan über `src/app/m/lagerbuch/**` nach `isModuleAdmin`, `requireModuleAdmin`, `moduleAdminPageOrNotFound`, `canAdminModule`, `session.user.isAdmin`: **drei Treffer, alle in Kommentaren, die die Abwesenheit begründen** — `_lib/zugang.ts:79` („BEWUSST NICHT `isModuleAdmin` aus `core/groups`"), `:106` („`session.user.isAdmin` kommt in diesem Modul NIRGENDS vor"), `verwaltung/(druck)/layout.tsx:36`. Kein Aufruf. Repo-weit gegatet durch `_lib/bauform.test.ts` describe „kein session.user.isAdmin im Modul" :167 und „keine Suite-Admin-Abkuerzung im Modul" :186. |
| ☑ | `helferSitzung.ts` setzt **kein** `domain` | `_lib/helferSitzung.ts:106` — „KEIN `domain`. Das ist die eine Zeile, an der beim Port am meisten haengt." :124 nennt Falle 19. **Keine `domain:`-Zuweisung im Cookie-Aufbau.** E2E-Gegenprobe: `e2e/lagerbuch-helfer.spec.ts:182` „antwortet 303 mit relativem Location und **setzt das Cookie ohne Domain**". |
| ☑ | `absenderAus` liest `cf-connecting-ip` oder den Sammelschlüssel, **niemals** `x-forwarded-for` | `_lib/absender.ts:49` — `headers.get("cf-connecting-ip")?.trim()`. `x-forwarded-for` erscheint **nur** im Kopfkommentar `:5` („WARUM `x-forwarded-for` HIER GAR NICHT VORKOMMT — in keiner Richtung"), nie im Code. Repo-weit gegatet: `_lib/bauform.test.ts` describe „kein x-forwarded-for im Modul" :207. |
| ☑ | `_actions/guards.test.ts` steht seit dem ersten Commit in der Eigenschaftsform | Der Aufbau ist im Kopf ausgeschrieben (:18-31): „ERST DIE EIGENSCHAFT, DANN DIE ZAEHLUNG. Der erste describe-Block toleriert ein fehlendes oder leeres `_actions/` und war damit am ersten Tag gruen. Ein Scan, der `toHaveLength(44)` von Anfang an behauptet, waere am ersten Tag rot gewesen und **abgeschaltet statt repariert** worden." Die Eigenschaft: describe „_actions/ — jede exportierte Action ist bewacht" :219. Die Zählung kam erst mit T172: describe „Zaehlung (§2.1 a)" :368. |

### Teil 3 — Fachlogik und Grenzen (T28–T61)

| ☑ | Zeile | Beleg |
|---|---|---|
| ☑ | `_lib/boot.ts` ist in `assertHostConfig()` **eingehängt** | **Der Haken existiert und ist gemessen:** `src/core/bootstrap.ts:14` importiert `lagerbuchBootFehler`, und `assertHostConfig()` (:49) ruft ihn bei `:57` als `...(await lagerbuchBootFehler())`. ⚠️ **Die Warnung der Checkliste („für diese Naht gibt es kein Kopplungsnetz") ist überholt:** `src/core/bootstrap.test.ts:394-406` prüft für **beide** Haken (`filesBootFehler`, `lagerbuchBootFehler`) je die Anwesenheit, das `await` und den Spread — `:400` schreibt aus, dass ein `lagerbuchBootFehler();` ohne `await` und ohne Spread wirkungslos wäre. Diese Zeile ist damit **stärker abgehakt, als die Checkliste erwartet** (Befund **F-5**, Richtung Messung). |
| ☑ | `playwright.config.ts` trägt Host, Sitzungsgeheimnis, Admin-Gruppe, Seed-Schritt und den **zweiten Host** | `playwright.config.ts:172` spreizt `...LAGERBUCH_ENV` ein; `e2e/helpers/lagerbuch.ts:63-77` definiert `SUITE_HOST_LAGERBUCH` (:67), `SUITE_ADMIN_GROUP_LAGERBUCH` (:68), `LAGERBUCH_HELFER_SITZUNG_SECRET` (:71, mit den vier Bedingungen aus Boot-Prüfung 4 ausgeschrieben), dazu die Verfalls- und Schrankenwerte. **Seed-Schritt:** `playwright.config.ts:83` — `rm -rf ./.data/e2e && pnpm exec tsx e2e/seed-lagerbuch.ts && next dev -p 3100`. **Zweiter Host:** `use.baseURL` ist `portal.localtest.me:3100` (:39) neben `LAGERBUCH_HOST` — genau die Zwei-Host-Lage, die `e2e/lagerbuch-hosts.spec.ts:142` für 15 Pfade ausnutzt. |
| ☑ | `BESTELL_FAKTOR` kommt im ganzen Modul **nicht** vor; der Vorschlag ist die Lückenformel | Scan über `src/app/m/lagerbuch/**`: **zwei Treffer, beide Kommentare, die die Streichung festhalten** — `_lib/domain/vorschlag.ts:21` („KEIN Puffer — `BESTELL_FAKTOR` ist ersatzlos gestrichen") und `_lib/domain/vorschlag.test.ts:49`. Keine Verwendung. |
| ☑ | Kein globaler `env`-/`TZ`-Block in `vitest.config.ts` | Gelesen: `vitest.config.ts` trägt `environment: "node"` (:7) und einen `server.deps`-Block; **kein `env:`-Objekt und kein `TZ`**. Die einzigen Treffer auf „env" sind Kommentare über `next-auth/lib/env.js` (:45, :49). |

### Teil 4 — Helfer-Weg (T62–T87)

⚠️ Die Warn-Zeile der Checkliste („Zuerst: existiert der Plan mit Tasks? — am 04.08.2026: nein") ist
**erledigt**: Teil 4 ist gebaut und als PR #29 gemergt. Die Zeilen sind normal prüfbar.

| ☑ | Zeile | Beleg |
|---|---|---|
| ☑ | Gate, `/t/<code>`, `/abmelden`, `/a/<id>`, `/helfer`, `/helfer/check`, die fünf PWA-Handler | Dateien vorhanden und je mit eigenem Test: `page.tsx` + `page.test.tsx`, `t/[code]/route.ts` + `route.test.ts`, `a/[artikelId]/page.tsx` + `page.test.tsx`, `helfer/page.tsx` + `page.test.tsx`, `helfer/check/page.tsx` + `page.test.tsx`, die PWA-Handler gebündelt in `pwa.route.test.ts`. `/abmelden` als Route-Handler, belegt durch `e2e/lagerbuch-helfer.spec.ts:270` „schickt einen gesperrten Zugang ueber `/abmelden` ans Gate". **Gegenprobe über die Route-Liste:** `pnpm build` listet die Modulrouten, und `e2e/lagerbuch-hosts.spec.ts:118` „traegt alle fuenfzehn Einstiege" zählt sie hart ab. |
| ☑ | `_lib/barcode.ts#normalisiereBarcode` — Consumes von T164 | `_lib/barcode.ts` vorhanden, `_lib/barcode.test.ts` daneben; konsumiert von `g/[code]/page.tsx` (T164), belegt durch `g/[code]/page.test.tsx` „nennt den gescannten Code im Klartext" :148. |
| ☑ | `_ui/helfer.module.css` trägt die acht Ampel-Hexwerte **zeichengleich** zu `_lib/ampel.ts` | **Gemessen, nicht geglaubt:** alle 16 Hexwerte aus `_lib/ampel.ts` (4 Töne × 2 Rollen × hell/dunkel) kommen in `_ui/helfer.module.css` vor; kein Wert aus `ampel.ts` fehlt. Gegatet durch `_lib/ampel.test.ts:135-160` — parametrisiert **je Datei, je Ton, je Rolle**, getrennt für `hell:` (:138) und `dunkel:` (:151), jeweils `traegt ${paar[rolle]}`. Dazu `_lib/bauform.test.ts:466` „`.rahmen` traegt alle fuenfzehn Neutralen UND die acht Ampelwerte" — **im Körper von `.rahmen`**, nicht irgendwo, weil `_ui/BarcodeScanner.tsx` auch unter `.modul` rendert. Und `ampel.test.ts:82` „kein Ton traegt `#c8000f` — Rot ist Marke und Primaeraktion, nie Statusfarbe" (Falle 3). |
| ☑ | `_lib/pwaIcons.ts` hält die Bytes mit den geprüften Längen (1558 · 5458 · 3290) | `_lib/pwaIcons.test.ts:47-51` — `{ name: "icon-192.png", …, bytes: 1558 }`, `{ "icon-512.png", …, 5458 }`, `{ "icon-maskable-512.png", …, 3290 }`, und `:97` `expect(puffer.byteLength).toBe(1558)`. **Alle drei Zahlen zeichengleich zur Checkliste.** |

### Teil 5 — Verwaltung (T100–T152)

| ☑ | Zeile | Beleg |
|---|---|---|
| ☑ | Alle **23** Arbeitsseiten antworten mit **200** | **Zahl unabhängig abgezählt:** `find 'verwaltung/(arbeit)' -name page.tsx` → **23**. Dass sie mit 200 antworten, ist das Abrufprotokoll aus **T175** (36 Routen echt abgerufen, Commit `652b157` + Nachtrag `7cea8e4`). ⚠️ Ich habe die 23 **nicht erneut abgerufen** — der Playwright-Lauf deckt sie nur teilweise. Das ist eine Übernahme aus T175, und T175 hat sie **zeilenweise** protokolliert (anders als Teil 5, dessen Protokoll nur aggregiert war — genau die Lehre aus dem Brief). |
| ☑ | `.modulnav` hat `overflow-x: auto`; `scrollWidth === clientWidth` bei 1280×720 mit fünfzehn Einträgen | `e2e/lagerbuch-verwaltung.spec.ts:44` „fünfzehn Einträge schieben die Seite bei Desktop-Überlauf nicht seitwärts" — `expect(nav.locator("a")).toHaveCount(15)` (:49) und `expect(masse.scroll).toBe(masse.client)` (:55) bei 1280×720. **Der zweite Messpunkt bei 900px** (:60-67) beweist die eigentliche `overflow-x`-Kopplung unter **realem** Überlauf — bei 1280px passen die Links knapp hinein, die Zusicherung allein wäre dort schwach. Dazu :70 „der Container scrollt beim Fokussieren zum letzten Link". **Im Playwright-Lauf dieser Sitzung grün.** |
| ☑ | `_ui/ikonen.test.ts` findet **36** Namen und keinen `@ant-design/icons`-/`lucide-react`-Import unter `m/lagerbuch/` | `_ui/ikonen.test.ts:390` „fuehrt genau 36 Namen" → `expect(Object.keys(PFADE)).toHaveLength(36)` (:391). Der Import-Scan (:179-182) fängt `@ant-design/icons`, `@ant-design/icons/*`, `lucide-react`, `lucide-react/*` — **inklusive Tiefen-Import**, und die Gegenproben :428/:429 decken Side-Effect-Import und **dynamischen** Import ab. Das ist Falle 7 aus `CLAUDE.md`, modulweit verriegelt. |
| ☑ | Kein `Alert type="error"`, kein `size="large"`, kein `e.message` unter `verwaltung/` | **Direkt gescannt.** `type="error"`: ein Treffer, `artikel/ArtikelTable.tsx:258` — **Kommentar**, der `type="warning"` begründet. `size="large"`: ein Treffer, `(druck)/etiketten/EtikettenBogen.tsx:30` — **Kommentar** („`size="large"` waere 72px (Falle 4)"). `e.message`: vier Treffer, **alle Kommentare**, die die Abwesenheit begründen (`ArtikelTable.tsx:163`, `fahrzeuge/[id]/VerfallEditor.tsx:61`, `fahrzeuge/[id]/SollEditor.tsx:118`, `vorlagen/[id]/TemplatePosEditor.tsx:100`). **Kein einziger Code-Treffer. Zeile hält.** |
| ☑ | Die Tabelle Action → Seite → Bedienelement ist abgehakt, samt `sollPositionWiederherstellen` und `deaktiviereElement` | Getragen von `_actions/guards.test.ts` describe „Zaehlung (§2.1 a)" — die `SOLL`-Tabelle bindet **je Datei** die Deklarationszahl (`:418` „hat je Datei genau so viele Deklarationen wie die Sollliste sagt"), und `:462` „nennt die drei Ausnahmen namentlich und in ihren Dateien". Die beiden Kandidaten „Action ohne Weg" sind über `templates.ts: 11` bzw. `loeschen.ts: 3` in der Sollliste erfasst. |
| ☑ | ⚠️ Die Zeile „32 Deklarationen in 14 Dateien" trifft **NICHT** zu — abgehakt als **43 Deklarationen in 15 Dateien** | **Unabhängig nachgerechnet aus der `SOLL`-Tabelle** (`guards.test.ts:378-397`): Summe über alle 18 Dateien = **47**. Ohne die drei Helferweg-Dateien (`gate.ts` 1, `sitzung.ts` 2, `check.ts` 1 = 4) bleiben **43 Deklarationen in 15 Dateien** — zeichengleich zur Vorgabe. `guards.test.ts:346-350` hält den Rechenfehler beider Vorgängerpläne namentlich fest („Teil 5 §6 nennt ‚14 Dateien mit 32 Actions' und Teil 4 E10 ‚4 Dateien mit 5 Exporten' — **BEIDE RECHNEN FALSCH**"). **Keine Zahl abgesenkt.** |

### Teil 6 — Artefakte, Ausgaben, Abnahme (T153–T176)

| ☑ | Zeile | Beleg |
|---|---|---|
| ⚠️ | Alle **24** Tasks eingecheckt, jeder mit eigenem Commit | **Ehrlich: 23 eingecheckt, T176 = dieser Task, und er läuft.** T153–T173 stehen im Ledger als abgeschlossen (35 Commits ab `9bf928d` bis `47d4b7a`), T174 (`9acea7e` + `7c05014` + `494cc69` + `ac81f8f` + `f5b41a6`) und T175 (`652b157` + `6326006` + `129f0cc` + `7cea8e4`) in dieser Sitzung. Die Zeile kann von mir **nicht vollständig** abgehakt werden — sie gehört der zweiten Hälfte. |
| ☑ | `_db/etiketten.test.ts` **dekodiert** den QR und vergleicht gegen den aus `SUITE_HOST_LAGERBUCH` aufgelösten Host; Gegenprobe (`/a/` → `/A/`) | `_db/etiketten.test.ts` dekodiert (nicht nur „enthält") und pinnt `EtikettenBasisFehlt` namentlich (:167/:178). Commit `45e4868` („Etikettendaten mit QR aus core/qr — und ein Test, der **dekodiert**"). |
| ☑ | `verwaltung/(druck)/layout.tsx` ruft `requireLagerbuchHost` **und** `requireLagerbuchAdmin`; ohne Gruppe **dieselbe** Antwort wie `/verwaltung/artikel` (**404**, nicht 403) | **Beide Riegel gelesen:** Imports :3/:4, Aufrufe `requireLagerbuchHost(kopf);` :50 und `await requireLagerbuchAdmin();` :51 — in dieser Reihenfolge. Die Gleichheit der Antwort ist E2E belegt: `e2e/lagerbuch-etiketten.spec.ts:146` „antwortet ohne Lagerbuch-Gruppe **genau wie eine Arbeitsseite**" und `:167` „antwortet auch ohne jede Sitzung nicht mit dem Bogen". Dazu `e2e/lagerbuch-hosts.spec.ts:262` „gibt einem Konto ohne Lagerbuch-Gruppe **404 statt 403**". **Im Playwright-Lauf dieser Sitzung grün.** |
| ☑ | Es gibt **kein** `verwaltung/(arbeit)/etiketten/` und **kein** `verwaltung/layout.tsx` | Beide Pfade geprüft: `ls` → `No such file or directory` für **beide**. |
| ☑ | `druck.test.ts` findet **genau ein** `@media print` und **kein** `body *`; der Glob liest `**/*.css` | `(druck)/etiketten/druck.test.ts:113` „traegt einen @media print-Block", `:148` „**enthaelt NIRGENDS `body *` — in keiner CSS-Datei des Moduls**" (der Glob-Umfang steht im Testnamen selbst), `:107` `@page` mit dem Seitenrand aus `etikettMasse`, `:128` „versteckt `.lb-nichtDrucken` im Druck — mit `!important` gegen Inline-Styles", `:161` Farbsparrechnung, `:175` „nagelt Papier auf `#fff` und Schrift auf `#000`", `:181` keine `--ant-`-Variable (Falle 2). |
| ☑ | `e2e/lagerbuch-etiketten.spec.ts` fährt `page.emulateMedia({ media: "print" })`; Gegenprobe gefahren | `e2e/lagerbuch-etiketten.spec.ts:87` `await page.emulateMedia({ media: "print" })` und **:101** `await page.emulateMedia({ media: "screen" })` — die Rückschaltung ist die Gegenprobe: ohne sie wäre der Test auch grün, wenn das Element **immer** versteckt wäre. Zusätzlich `:115` „dieselbe Kopfzeile ist auf einer Arbeitsseite sehr wohl da". |
| ☑ | `_actions/guards.test.ts` zählt **47 = 44 + 3** in **18** Dateien und **19** Verzeichniseinträgen; drei Gegenproben | `:435` „zaehlt 47 Deklarationen, obwohl es nur 44 verschiedene Namen gibt" → `toHaveLength(47)` (:437) **und** `new Set(namen).size` = 44 (:438). `:450` „bewacht 44 und listet genau 3 Ausnahmen" → `toHaveLength(3)` (:458) und `funde.length - ausnahmen.length === 44` (:459). `:462` nennt die drei namentlich. `:522` „verteilt die 44 Riegel auf **42** requireLagerbuchAdmin und **2** requireHelferSchreibend". **Unabhängig abgezählt:** `_actions/` hat **37** Verzeichniseinträge = **18** Action-Dateien + **19** Testdateien; die Zusicherung bindet korrekt an `Object.keys(SOLL).toHaveLength(18)` (:413) plus die Existenz von `guards.test.ts` (:415) — **nicht** an `readdirSync(...).toHaveLength(19)`, was Ruling A7 verbietet. |
| ☑ | `_lib/bauform.test.ts` verlangt die **Existenz** aller drei Weichen-Dateien | `_lib/bauform.test.ts:221` describe „Teil 4, T87 — die Weichen-Dateien **existieren UND** tragen ein PRAEDIKAT, keinen Riegel", parametrisiert bei `:278`. T173 (`47d4b7a`) hat `it.runIf` entfernt und `g/[code]/page.tsx` von `NOCH_NICHT` auf `PFLICHT` gezogen — die Zusicherung läuft **unbedingt**. |
| ☑ | `error.tsx` existiert; `not-found.tsx`, `loading.tsx`, `global-error.tsx` existieren **nicht** | `error.test.tsx:123` „legt weder not-found.tsx noch loading.tsx noch global-error.tsx an" — eine Zusicherung, die die **Abwesenheit** aller drei prüft. `error.tsx` selbst gegatet durch `error.test.tsx:43`, `:74`, `:88` (kein Icon-Paket), `:105` (kein antd), `:112` (`use client` in Zeile 1). |
| ☑ | Die Abrufliste aus §7 ist abgehakt, inkl. vier Farbmodus-Abrufe, Print-Abruf, Riegel-Abruf, werfende Route | **T175**, Commits `652b157` („36 Routen echt abgerufen, vier Farbmodus-Abrufe, ein Wurf") und `7cea8e4` („Nachtrag zum Abrufprotokoll — Zeilenzahl, zwei Merkmale, der Riegel"). Übernahme aus T175; ich habe die 36 Abrufe **nicht wiederholt**. |
| ☑ | §12.1-Tabelle abgehakt · §12.5-Tabelle abgehakt · §11.5-Verteilungstabelle abgehakt — jeder der 40 Zustände hat einen Ort | §12.1: **T174** (`9acea7e`, sieben Aussagen, sieben benannte Nachfolger). §12.5: **Schritt 2 dieses Berichts** — 13/13 Aussagen getragen, 8 Zeilen mit korrigiertem Nachfolger (F-1). §11.5: **Schritt 3 dieses Berichts** — 40/40 haben einen Ort, einer davon nur zur Hälfte (F-2). |

---

## Funde, Einordnung, was daraus wurde

| # | Fund | Einordnung | Was daraus wurde |
|---|---|---|---|
| **F-1** | Die §12.5-Tabelle nennt `e2e/lagerbuch-verwaltung.spec.ts` als Nachfolger für **sieben** Zeilen; die Datei trägt davon **eine halbe**. Acht der 13 Zeilen nennen einen falschen oder unvollständigen Nachfolger. | **Tabellendrift, keine Testlücke.** Alle 13 Aussagen sind getragen — von ungenannten Dateien. Dieselbe Naht wie T174s Befund, siebenmal. | **Plantabelle in Richtung der Messung nachgezogen** (W1): Schritt 2 dieses Berichts nennt je Zeile den **gemessenen** Träger mit Testnamen und Zeilennummer. Kein Test geschrieben, keine Datei unter `e2e/` angelegt. |
| **F-2** | **Zustand 27** (`checks.ergebnis` unlesbar): der Parser fängt den Lesefehler, aber die von der Spec geforderte **Kennzeichnung „Ergebnis unlesbar"** existiert nicht — weder Implementierung noch Test. | **Echte Lücke.** Selbst nachgelesen: `parseCheckErgebnis` gibt bei jedem Lesefehler `leer()` zurück (`checkErgebnis.ts:127-129`), **ohne Diskriminator** — „kaputtes JSON" ist von „legitim leerem V2" nicht unterscheidbar. Die Detailseite zeigt damit genau das von der Spec ausgeschlossene **„0 Positionen"**. Spec `…-design.md:10332` verlangt die Kennzeichnung, `:5619` verlangt dafür `Alert type="warning"` auf `/verwaltung/checks/[id]`. | **NICHT gefixt — W1-Ausnahme „Fachentscheidung".** Die Behebung braucht ein neues Feld durch `parseCheckErgebnis` → `CheckSummen` → `checkDetail` → Seite plus ein UI-Element, und die Entscheidung „was zählt als unlesbar / was sieht die Verwaltende" ist fachlich. Teil-5-Gebiet (T136). **Als Bedenken B-1 gemeldet.** |
| **F-3** | Die §11.5-Zeile 11 spricht von **„22 deutschen Meldungstexten"**. Eine Datei, die 22 Texte definiert, gibt es nicht; die Zahl steht nur in zwei Kommentaren, und **beide beschreiben die Alt-Anwendung** (`_lib/actionTypen.ts:21` „Die 22 deutschen Texte in `lagerbuch/src/actions/*`"). Gemessen: **35 literale `fehler: "`-Stellen in 14 Action-Dateien**. | **Stale Zahl, kein fehlender Ort.** Der Zustand *hat* einen Ort: die **Form** ist verbindlich gegatet (`_lib/actionErgebnis.ts#ActionErgebnis:25`, `#ActionAusgang:39`, Test `actionErgebnis.test.ts:162` „verlangt im Fehlerzweig einen `fehler`-Text"), und §11.5 verlangt die Texte „**als Rückgabewert**" — genau das ist gesichert, nicht ihre Anzahl. | **Verdikt: Ort vorhanden, Zahl veraltet.** Die „22" ist eine Alt-App-Zahl und sollte in Richtung der Messung („die deutschen Meldungstexte als Rückgabewert, Form gegatet") nachgezogen werden, statt eine Anzahl festzunageln, die keine Invariante deckelt. **Als Bedenken B-2 an die zweite Hälfte übergeben.** Nicht gefixt: der Planwortlaut gehört nicht in diesen Bericht, und eine `toHaveLength(22)` wäre genau die Art Zusicherung, die Ruling A7 verbietet. |
| **F-4** | Drei kleinere Nachweislücken: (a) der **Leertext des Bestellvorschlags** (`BestellListe.tsx:234`) hat keinen Test; (b) der **`EtikettenBasisFehlt`-Renderzweig** (`etiketten/page.tsx:47-56`) hat nur Wurf- und Texttests, keinen Renderingtest (die Datei sagt selbst, warum: async Server Component, nicht mountbar); (c) die **Fußnote** „Das Handlager hatte nicht genug…" (`CheckFlow.tsx:325-330`) ist ungetestet, nur der Chip daneben. | **Alle drei: der Zustand hat einen Ort, die Anzeige einen ungetesteten Rand.** Keiner der drei kippt eine §11.5-Zeile. | **Nicht gefixt** — Tests für (a) und (c) wären neue Zusicherungen in fremden Teil-5-Dateien und damit Bau, nicht Abnahme; (b) ist strukturell (RSC). **Als Bedenken B-4 übergeben.** |
| **F-5** | Die Teil-3-Checklistenzeile warnt: „für diese Naht [`boot.ts` → `assertHostConfig()`] gibt es **kein Kopplungsnetz**". | **Überholt, in die gute Richtung.** `src/core/bootstrap.test.ts:394-406` prüft den Haken heute für **beide** Module inklusive `await` und Spread. | **Zeile in Richtung der Messung nachgezogen** in Schritt 4 dieses Berichts. Kein Code geändert. |
| **F-6** | **T172-Minor (a):** `guards.test.ts:276` verwies mit „(siehe Kopf, `:25`)" auf eine Zeile, die durch die eigenen 19 eingeschobenen Kopfzeilen auf `:26` gewandert war. | Veralteter Zeilenanker. | **GEFIXT**, Namensform statt Zeilennummer: „(siehe **Kopfkommentar**)". Line-count-neutral. |
| **F-7** | **T172-Minor (b):** `guards.test.ts:269` verwies auf `_lib/bauform.test.ts:66-78`; der zitierte Satz („Ein Scan darf falsch-positiv sein und laut, nie falsch-negativ und still") steht dort auf **:95-96**. Nachgelesen und bestätigt — **Vorbestand, nicht von T172 verursacht.** | Falscher Zeilenanker. | **GEFIXT**, Namensform: „`_lib/bauform.test.ts` **für `ohneKommentare`** selbst formuliert". Line-count-neutral. |
| **F-8** | **T172-Minor (c):** der Zusicherungsname `guards.test.ts:408` lautete „hat 18 Action-Dateien; `guards.test.ts` ist **die 19. Datei des Ordners**" — **genau die Formulierung, die Ruling A7 verbietet** (der Ordner hat 37 Einträge). Die Zusicherung selbst ist korrekt. | Irreführender Name; bei Rotlauf liest ein Prüfer die falsche Ursache. | **GEFIXT:** umbenannt in „hat 18 Action-Dateien **plus** `guards.test.ts`". Zusätzlich die Fehlermeldung `${SELBST} ist die 19.` → `${SELBST} liegt daneben.` — sie trug dieselbe verbotene Ordinalzahl und wäre bei Rotlauf **das Erste**, was jemand liest. |
| **F-9** | **Die Klasse hinter (a)/(b):** T172s Bericht behauptet, `bauform.test.ts:74` sei „der einzige verbliebene Zeilenverweis". **Das ist falsch.** Gemessen: **~50 `datei:zeile`-Verweise** in Kommentaren unter `m/lagerbuch/`. Drei davon zeigen auf `guards.test.ts:265-267` (aus `_lib/tokenForm.ts:7`, `_lib/tokenForm.test.ts:86`, `_actions/tokens.ts:29`) und waren **bereits um ~7 Zeilen veraltet** — der zitierte `export const`-Satz steht auf :272-274. | **Klasse, nicht Einzelfall** — achte Instanz der Fundort-Klasse dieser Sitzung. | **Die drei `guards.test.ts:265-267`-Anker GEFIXT** (Namensform: „der Bauform-Scan in `_actions/guards.test.ts` — Zusicherung ‚kennt an einem Zeilenanfang mit `export` NUR die eine Action-Bauform und Typ-Exporte'"). **Die übrigen ~47 NICHT gefixt** — das wäre Umbau statt Fix. **Als Bedenken B-5 übergeben.** ⚠️ `bauform.test.ts:74` selbst ist nachgelesen und **korrekt**. |
| **D1** | **Zurückgezogener Fund.** Ein Suchlauf meldete `_actions/buchung.ts:130` und `:211` (`fehler: e instanceof Error ? e.message : "…"`) als Verstoß gegen §11.5 Zeile 11 („Nie `e.message`"), mit der Begründung, unter diesen Transaktionen liege kein deutsch werfender Produzent. | **Der Fund war falsch, und ich habe ihn empirisch widerlegt, bevor er in den Bericht kam.** Ich hatte den Fix bereits geschrieben (Ternär entfernt, fester deutscher Satz) und einen Trigger-Test dazu — **vier bestehende Tests wurden rot**. Ursache: `buchung.ts:105` (`"Charge gehört nicht zu diesem Artikel"`) und `:190` (`"Ziel ist kein gültiges, aktives Fahrzeug"`) werfen **deutsche** Sätze **innerhalb** der Transaktion, und der `catch` ist der dafür vorgesehene Kanal. `buchung.ts:99-101` schreibt das aus: „DER WURF IST HIER RICHTIG (§7.3, Riegelfall): er rollt die Transaktion zurueck; der `catch` unten macht daraus den Rueckgabewert." | **Vollständig zurückgebaut** (`rtk git checkout --` auf beide Dateien; `git status` sauber). Kein Commit. **Der Restrisiko-Anteil bleibt und ist echt:** derselbe `catch` kann **auch** einen echten SQLite-Fehler durchreichen, weil `e.message` eigene Würfe nicht von Treiberfehlern trennt. Eine saubere Trennung (Sentinel-Fehlertyp) ist ein Entwurfseingriff in Teil-3/5-Gebiet. **Als Bedenken B-6 gemeldet, nicht gefixt.** |

### Geänderte Dateien

| Datei | Änderung | Fund |
|---|---|---|
| `src/app/m/lagerbuch/_actions/guards.test.ts` | drei Kommentar-/Namensfixes, alle line-count-neutral | F-6, F-7, F-8 |
| `src/app/m/lagerbuch/_lib/tokenForm.ts` | Zeilenanker → Namensform (nur Kommentar) | F-9 |
| `src/app/m/lagerbuch/_lib/tokenForm.test.ts` | Zeilenanker → Namensform (nur Kommentar) | F-9 |
| `src/app/m/lagerbuch/_actions/tokens.ts` | Zeilenanker → Namensform (nur Kommentar) | F-9 |

**Keine Datei unter `e2e/` oder `src/app/m/lagerbuch/_actions/` angelegt** (T172 zählt beide hart ab —
`_actions/` steht unverändert bei 37 Einträgen / 18 Action-Dateien).

### Kommandos und Ausgaben nach den Fixes

```
rtk pnpm typecheck   → EXIT 0 · TypeScript: No errors found
rtk pnpm lint        → EXIT 0 · ✖ 5 problems (0 errors, 5 warnings)   [dieselben fünf wie vorher]
rtk pnpm vitest run  → EXIT 0 · Test Files 337 passed (337) · Tests 5781 passed (5781)
rtk pnpm build       → EXIT 0
```

**Playwright wurde nach den Fixes bewusst NICHT erneut gefahren**, und das ist begründet: alle vier
Änderungen sind **reine Kommentar- bzw. Zusicherungsnamen-Änderungen**; keine ändert eine Codezeile,
ein Modul-Export oder gerendertes Markup. `build` ist danach trotzdem gelaufen (EXIT 0), weil zwei der
vier Dateien Produktionsdateien sind. Der maßgebliche Lauf bleibt der von `7cea8e4`:
**169 passed (6.0m), 0 failed** — und `--list` bestätigt danach unverändert `Total: 169 tests in 17 files`.

---

## Selbstreview

**Vollständigkeit.** 13/13 Alt-Spec-Zeilen, 40/40 Zustände, alle Checklistenzeilen aller sechs Teile,
fünf Gates mit Zahlen. Eine Zeile ist **bewusst nicht** grün: Teil 6 „alle 24 Tasks eingecheckt" —
T176 ist dieser Task, und ihn selbst abzuhaken wäre genau das Häkchen ohne Sache.

**Ehrlichkeit.** Jede Zeile trägt Datei + Testname oder Datei + Zeilennummer. Wo ich etwas **nicht**
selbst gemessen habe, steht es dort: die 23×200 und die 36 Abrufe sind **Übernahmen aus T175** (das
sie im Gegensatz zu Teil 5 zeilenweise protokolliert hat), und die `Dockerfile`-Gegenprobe sowie das
Schema-Diff-Protokoll aus Teil 1 habe ich nicht reproduziert (B-3). Nirgends steht „abgehakt in
Teil N" als Beleg.

**Disziplin.** Festgestellt und gefixt, nicht umgebaut: vier Dateien, alle Änderungen
Kommentar/Zusicherungsname, drei davon line-count-neutral aus einem konkreten Grund (drei fremde
Dateien ankern in `guards.test.ts`). **Keine Zahl abgesenkt** — im Gegenteil: 47/44/3, 18, 19, 29, 36,
23, 43/15 und die drei PWA-Byte-Längen sind unabhängig von der Zusicherungsschrift aus der
Dateiablage nachgezählt und **stimmen alle**. Die ~47 übrigen Zeilenanker habe ich **nicht** angefasst.

**Der Beinahe-Fehler, den ich melde, weil er lehrreich ist:** ich hätte mit D1 fast eine Regression in
gemergten Code geschrieben — ein plausibel klingender Suchbefund, der genau in die Richtung zeigte,
die W1 zu fixen verlangt. Gefangen hat ihn nur, dass ich den Fix **vor** dem Commit gegen die
bestehende Suite gefahren habe. Vier rote Tests, sofort zurückgebaut.

### Bedenken

- **B-1 (blockierend für „Spec 1 abgenommen"): Zustand 27 hat keinen vollständigen Ort.** Die
  geforderte Kennzeichnung „Ergebnis unlesbar" fehlt; die Detailseite zeigt stattdessen das
  ausdrücklich ausgeschlossene „0 Positionen". Fachentscheidung + Mehr-Schichten-Eingriff → nicht
  von mir gefixt. **Betreiberentscheidung nötig:** nachbauen (Teil-5-Nachzügler) oder als benannte
  Abweichung ins Runbook.
- **B-2: die „22 deutschen Meldungstexte" in §11.5 Zeile 11 sind eine Alt-App-Zahl.** Gemessen sind
  es 35 Stellen in 14 Dateien. Der Zustand ist über die **Form** gegatet; die Zahl sollte aus dem
  Plan verschwinden, nicht als `toHaveLength(22)` festgenagelt werden (Ruling A7).
- **B-3: zwei Teil-1-Zeilen sind Protokoll-Übernahmen, keine Messungen von mir** — die
  `COPY`-Gegenprobe und der Schema-Diff. Beide erforderten eine Mutation bzw. ein Dokument außerhalb
  des Codes. Struktur ist geprüft, Protokoll nicht reproduziert.
- **B-4: drei ungetestete Anzeigeränder** (Bestellvorschlag-Leertext, `EtikettenBasisFehlt`-Render,
  CheckFlow-Fußnote). Kippt keine §11.5-Zeile, gehört aufs Board.
- **B-5: ~47 veraltete `datei:zeile`-Kommentaranker unter `m/lagerbuch/`.** T172s Bericht behauptet,
  es gebe nur einen — das ist falsch. Eigener Board-Posten; sie einzeln nachzuziehen ist Umbau.
- **B-6: `_actions/buchung.ts:130/:211` können neben eigenen deutschen Würfen auch rohen
  SQLite-Text durchreichen.** Kein Verstoß (der Kanal ist dokumentiert und gewollt), aber ein
  benannter Rand. Saubere Trennung = Sentinel-Fehlertyp, Entwurfseingriff.

---

## Was die zweite Hälfte (Schritte 5–7) von hier erbt

1. **B-1 muss vor „Spec 1 abgenommen" entschieden sein.** Zustand 27 ist der einzige §11.5-Zustand
   ohne vollständigen Ort. Der Abschluss-Commit sollte nicht sagen „jeder der 40 Zustände hat einen
   Ort", ohne ihn zu nennen — vorgeschlagene Formulierung: „40 von 40 Zuständen haben einen Ort;
   Zustand 27 nur zur Hälfte (Parser ja, Kennzeichnung nein) — benannt und ins Runbook übergeben."
2. **Die §12.5-Aussage im Abschluss-Commit stimmt weiterhin** („eine übernommen, elf umgeschrieben,
   eine geteilt") — **aber acht der 13 Zeilen nannten den falschen Nachfolger.** Wenn der
   Abschluss-Commit die Tabelle als „abgehakt" führt, sollte er auf die korrigierten Träger in
   diesem Bericht verweisen.
3. **Ins Runbook, nicht in Code** (zusätzlich zu R30–R36):
   - **B-1** als Betriebshinweis: ein Check mit unlesbarem `ergebnis` erscheint heute als „0
     Positionen" und nicht als Fehler. Wer nach dem Cutover eine Check-Zeile mit lauter Nullen sieht,
     sucht sonst einen Datenfehler, wo ein Anzeigezustand fehlt.
   - **F-9/B-5** und **B-4** als Board-Posten (nicht Runbook — sie haben keine Cutover-Wirkung).
4. **Der Abschluss-Commit-Entwurf im Plan trägt noch die Zeile** „⚠️ Offen, solange Teil 4 keine
   Tasks traegt: der ganze Helfer-Weg." — **die ist erledigt** (Teil 4 gebaut und als PR #29
   gemergt) und muss vor dem Commit gestrichen werden, sonst behauptet der Abnahme-Commit eine
   Lücke, die es nicht gibt.
5. **Die Gate-Zahlen für den Abschluss-Commit:** typecheck 0 Fehler · lint 0 Fehler / 5 Warnungen ·
   vitest 337 Dateien, 5781 Tests · build EXIT 0 · playwright **169 passed, 0 failed (6.0m)**.

---

## Statusmeldung

- **Status:** DONE_WITH_CONCERNS
- **Commits:**
  - `a479606` test(lagerbuch): drei T172-Minor aufgeloest — Namensform statt Zeilennummer
  - `3203484` docs(lagerbuch): drei Fundort-Anker auf guards.test.ts entkoppelt
  - `04a4438` chore(lagerbuch): Abnahme Schritte 1-4 — drei Tabellen geprueft, sechs Funde (Protokoll, `--allow-empty`)
- **Gates:** alle fünf grün — typecheck 0 Fehler · lint 0 Fehler/5 Warnungen · vitest 337 Dateien, 5781 Tests · build EXIT 0 · playwright **169 passed, 0 failed (6.0m)**, einmal gefahren.
- **Tabellen:** 13/13 Alt-Spec-Aussagen getragen (aber **8 Zeilen nannten den falschen Nachfolger**) · 40/40 Zustände haben einen Ort (**einer nur zur Hälfte**) · Checkliste aller sechs Teile belegt, **eine Zeile bewusst nicht grün** (Teil 6 „alle 24 Tasks" — T176 ist dieser Task) · **6 Funde**, 4 gefixt, 1 als Fachentscheidung gemeldet, 1 zurückgezogen.
- **Bedenken:** **B-1 blockiert „Spec 1 abgenommen"** — Zustand 27 (`checks.ergebnis` unlesbar) hat keine Kennzeichnung, die Detailseite zeigt das ausgeschlossene „0 Positionen"; Fachentscheidung nötig. Dazu B-2 bis B-6 (siehe oben).
- **Bericht:** `/Users/rubeen/dev/personal/drk/iuk-suite-lagerbuch-teil6/.superpowers/sdd/2026-08-03-lagerbuch-modul-teil6/task-176a-report.md`

---

## Nachtrag zum Selbstreview (zwei Präzisierungen)

**(1) Zustand 8 — meine Formulierung im Protokoll-Commit ist zu stark.**
Der Commit `04a4438` schreibt „Der gruene Chip gehoerte der Alt-Anwendung". Das ruht auf einer
Abwesenheits-Suche (`grep -rn HelferEntnahme src/ e2e/` findet nur Kommentare) — das belegt, dass die
**alte Komponente** hier nicht liegt, aber nichts über den heutigen Renderpfad. **Was ich selbst
geprüft habe, ist stärker und sagt etwas anderes:** `_ui/Entnahme.test.tsx:238` ist ein
ausdrücklicher **Regressionstest**, dessen Kommentar die Alt-Fundstelle wörtlich zitiert
(„`HelferEntnahme.tsx:26-27`, `:55` `chip chip-ok`. Ein 200, das luegt, ist der teuerste Zustand der
Tabelle") und der die **Fehlerform** festnagelt. Die genaue Aussage lautet also: *Zustand 8 ist durch
einen benannten Regressionstest gedeckt, der die Fehlerform pinnt* — **nicht** *der Zustand gab es
hier nie*. Der Unterschied zählt: wer Letzteres liest, schließt, die Zeile habe nie Abdeckung
gebraucht. Die §11.5-Tabelle oben trägt bereits die richtige Fassung.

**(2) B-1 — die zwei Spec-Zeilen wörtlich, damit niemand meine Zusammenfassung adjudizieren muss.**

`docs/superpowers/specs/2026-08-03-lagerbuch-modul-design.md:10332`:

> | 27 | `checks.ergebnis` unlesbar | 200 | `parseCheckErgebnis` liefert einen leeren V2-Wert; die Zeile wird als „Ergebnis unlesbar" gekennzeichnet statt als „0 Positionen" | Modul |

`…:5619`:

> | 9 | `/verwaltung/checks/[id]` | Ein abgeschlossener Check im Detail: Abgleich, Nachfüllung, Geräte, Sauerstoff, Verfall. ⚠️ Die Seite **schreibt aus**, dass die Verfall-Ampel gegen **heute** gerechnet ist und nicht gegen den Check-Zeitpunkt (§5.6.3) | `Card` · `Table` · Chip statt `Tag` (§6.6.3) · `Alert type="warning"` für „Ergebnis unlesbar"/`altFormat` — **nie** `type="error"` (§6.6.5) | **RSC**, ohne Insel |

Gemessener Zustand dagegen: `parseCheckErgebnis` liefert bei jedem Lesefehler `leer()`
(`_lib/checkErgebnis.ts:127-129`, Rückgaben :149/:154/:161) — **ohne Diskriminator**. `altFormat` ist
im Fehlerfall `false`. Die Kennzeichnung „Ergebnis unlesbar" existiert im ganzen Modul nicht
(Volltextsuche: kein Treffer). Die Seite zeigt damit „0 Positionen" — den von `:10332` ausdrücklich
ausgeschlossenen Zustand.
