# Abschluss-Review Teil 4 — Blickrichtung Spec-Treue und Constraint-Verstöße über den ganzen Branch

**Branch:** `feat/lagerbuch-modul-teil4` · **Base** `b1254e5` · **Head** `49a77c6` (T87)
**Paket:** `review-b1254e5..49a77c6.diff` (44 Commits, 63 Dateien, +16.056/−31)
**Read-only:** Arbeitsbaum, Index, HEAD und Branch unverändert (`git status --short` leer, vor und
nach dem Lauf). `pnpm build` bewusst NICHT gefahren (N-6 schriebe `next-env.d.ts` um).
**Nachgefahren:** `pnpm vitest run` → **247 Dateien, 4351 bestanden, 1 übersprungen (4352)**, exit 0.
Der eine Skip ist der `it.runIf`-Zweig für `g/[code]/page.tsx` (Teil 6, T164) und gewollt.

---

## 1. Was gut gemacht ist

**Der mechanische Block ist über alle 63 Dateien vollständig sauber.** Das ist kein
Nicht-Ergebnis, sondern das Ergebnis: 26 Global Constraints, quer über acht Wellen und 27 Tasks
gebaut, halten als Ganzes. Einzeln nachgemessen, jeweils über die vollständige Dateiliste des
Diffs:

| Constraint | Prüfung | Ergebnis |
|---|---|---|
| 1, 2 (`antd`, `@ant-design/icons`, `lucide-react`) | `xargs grep -nE` über alle 63 Dateien | **null** Importzeilen; jeder Treffer ist Kommentar oder Verbots-Regex in einer Testdatei. Einzige echte antd-Zeile: `src/components/login-form.tsx:8` — Suite-Bestand, nicht dieser Ast |
| 17 (`--ant-*`) | dito | **null** Vorkommen außerhalb von Kommentaren/Scans |
| 13, 14 (`usePathname`/`useSearchParams`/`router.push`/`router.replace`) | dito | **null** im Produktionscode des Moduls |
| „kein `"use client"` unter `_lib/`" | dito | **null**; alle sechs `_lib/`-Wertedateien tragen den Satz „KEIN \"use client\"" als Begründung |
| 6 (äußere Pfade) | alle 10 `href=` + alle `redirect(` + alle `Location` | ausnahmslos äußer: `/helfer`, `/helfer/check`, `/a/<id>`, `/helfer/check?fz=`, `/`, `/?returnTo=`, `/login?callbackUrl=` |
| 7 (innere Pfade) | alle 11 `revalidatePath` | ausnahmslos `/m/lagerbuch/…` |
| 8 (`/t/<code>`) | `t/[code]/route.ts:128` | `new NextResponse(null, {status:303, headers:{Location: pfad}})`, kein `NextResponse.redirect`, `pfad` in jedem Zweig relativ |
| 9, 10 (Rückgabewert statt Wurf) | `_actions/*.ts` | jede erwartbare Lage ist Rückgabewert; die vier Zugehörigkeitswürfe in `check.ts` stehen, `requireLagerbuchHost` wirft nur in `gate.ts:49` und `sitzung.ts:55` |
| 11 (`try/catch` im Client) | alle drei Client-Inseln mit Action-Aufruf | `Gate.tsx:116/119`, `Entnahme.tsx:62/83`, `CheckFlow.tsx:273/295` und `:309/318` — **vier** Aufrufe, **vier** `catch` |
| 12 (`"netz"` nie serverseitig) | alle Vorkommen | nur `CheckFlow.tsx:301`, `Entnahme.tsx:88` (beide im `catch`) und die Typdefinition. Der `safeParse`-Zweig serverseitig ist `"eingabe"` (B4), in `check.ts:108-115` **und** `buchung.ts:259-269` gleich gelöst |
| 23 (Riegelreihenfolge) | `gate.ts`, `sitzung.ts`, `t/[code]/route.ts` Zeile für Zeile verglichen | identische Reihenfolge: Host → `gateGesperrt` (ohne DB) → `normalisiereCode` → `redeemToken(code, getDb())` → Erfolg Cookie ohne `gateFehlversuchBuchen` → Misserfolg `gateFehlversuchBuchen` + `grund=code` |
| 25 (`requireHelferSchreibend` ausgewertet) | `check.ts:92-93`, `buchung.ts:247-253` | beide `const riegel = await …; if (!riegel.ok) return …` |
| 19 (Tap 56px an jeder ±-Fläche) | `helfer.module.css:241-250` | `.stepTaste` 56×56, `.stepWert`/`.stepAnzeige` `min-width:56px; height:56px`, keine `sm`-Variante |
| 18 (Eingabefelder ≥ 16px, auch `font:`) | alle sechs `<input>` des Moduls gegen ihre Regel | `.codefeld` `font: 700 24px/1` · `.stepWert` `font: 700 20px/1` · `.verfallZeile input` 18px · `.feld`/`.suchfeld` 16px. Der `<input type="month">` (`CheckFlow.tsx:580`) hat keine eigene Klasse und liegt korrekt in `.verfallZeile` (`:571`) |
| 20 (`tabular-nums`) | `helfer.module.css` | auf `.stepWert` (:244), `.bestandsZahl` (:219), `.mengenChip` (:223) — dazu zwei freiwillige (`.codefeld` :180, `.stepAnzeige` :249) |
| 16 (null Media Queries) | `helfer.module.css` | genau eine, `prefers-reduced-motion` (:324) — die im Plan (`:1299-1304`, `:1536`) ausdrücklich ausgenommene, mit Riegel in `bauform.test.ts:578-583` und `:612-617` |
| 3, 4, 5, 26 | `viewport`-Export, `notFound(`, Service Worker, `<Shell>` | **null** Treffer im Produktionscode; `notFound` kommt ausschließlich in Begründungskommentaren vor |

Dazu zwei Kreuzprüfungen, die kein Task-Review fahren konnte und die **sauber** ausgehen:

- **Variablenschluss `--lb-*`:** 23 Namen deklariert (12 Farben + 8 Ampel + 3 Schriftstapel unter
  `.rahmen`, dieselben 20 Farben im Dunkelzweig), 17 in der CSS benutzt, **null** benutzt-aber-nicht-
  deklariert. Auch die vier Inline-`var(--lb-…)` in `CheckFlow.tsx` und `Entnahme.tsx` lösen auf.
  Die von T64 als Minor notierte Lücke („der Scan prüft nur das Präfix, nicht die Deklariertheit")
  ist heute leer. `_lib/pwaIcons.ts:51` nennt `var(--lb-rot)` nur im Kommentar — die SVG-Datei
  selbst trägt feste Hexwerte, wie E7 es verlangt.
- **Inline-SVG-Attribute:** alle **elf** `<svg>` des Moduls tragen `aria-hidden="true"` **und**
  `focusable="false"` (T68 hatte notiert, dass es dafür keinen modulweiten Scan gibt — die Praxis
  hält trotzdem, ausnahmslos).

Weiter gut gelöst und ausdrücklich **kein** Befund:

1. **B-1 ist eingelöst.** `page.tsx:93` baut den Verwaltungsknopf aus `verwaltungsZiel(kopf)`
   (`_lib/zugang.ts:205-213`), nicht aus dem im Plan abgedruckten Prod-Host-Literal. Genau die
   Bedingung, unter der der B3-Zusatz-Task überhaupt etwas liefert.
2. **Der `"leer"`-Pfad ist über die Wellengrenze hinweg geschlossen.** T78 (Welle 5) notierte, die
   Insel zeige für `{ok:true,{gebucht:0}}` einen grünen Chip — gebaut gegen eine `buchung.ts`, die
   es damals nicht gab. `buchung.ts:311` (T114, in Welle 7 vorgezogen) liefert für diesen Fall
   `{ok:false, grund:"leer", text: leerText(name)}`; `Entnahme.tsx:64-70` zeigt ihn als Fehler. Der
   Teilmengenfall (`0 < gebucht < menge`) hat in `Entnahme.tsx:74-79` einen eigenen Satz. Der
   T78-Minor ist damit **überholt**, nicht offen.
3. **Das Sitzungsetikett ist über alle drei Seiten wortgleich** (`helfer/page.tsx:53`,
   `helfer/check/page.tsx:60`, `a/[artikelId]/page.tsx:96`): `` `Zugang: Token ${zugang.code} · ${zugang.label}` ``.
   Die von T83 befürchtete Drift ist nicht eingetreten.
4. **Die Zusagen an Teil 6, T171 stehen am Markup, nicht im Kommentar** (die N-8-Falle):
   `HelferRahmen.tsx:130` trägt `data-testid="lb-tableiste"` und `aria-label="Helfer-Bereiche"` am
   `<nav>`, `:134`/`:145` das `aria-current`.
5. **Die Manifest-Icons und die Route-Verzeichnisse decken sich exakt** — vier `src`-Einträge, vier
   Handler-Ordner, kein fünfter, kein toter.
6. **T87 hat die zwei Verschärfungen sauber eingelöst** (E9-Weiche auf Existenzpflicht für genau
   zwei der drei Dateien, `g/` bewusst per `it.runIf` schlafend mit benanntem Einlöser T164; B2 auf
   `flaechen()` statt auf `existsSync`, wodurch auch der stille zweite Ausgang „Fläche verliert ihr
   `redeemToken(`" gefangen wird) und **darüber hinaus** den Route-Handler-Scan vom Listen- auf den
   Baumbetrieb gehoben — womit `abmelden/route.ts` erstmals gedeckt ist.

---

## 2. Befunde

### I-1 (Important) — Das Review zu T87 ist im Ledger nicht geschlossen, und sein einziger Important-Befund ist sachlich widerlegt; wer ihn ausführt, trägt eine falsche Zahl in die Übergabe

**Fundstelle:** `.superpowers/sdd/2026-08-03-lagerbuch-modul-teil4/task-87-review.md:71-113`
gegen `src/app/m/lagerbuch/_lib/bauform.test.ts:473-477` und `:492`
sowie `.superpowers/sdd/2026-08-03-lagerbuch-modul-teil4/progress.md:335` (letzte Zeile)

**Befund.** `progress.md` endet mit `=== WELLE 8 (T87) + ABSCHLUSS-REVIEW beginnen ===`. Für T87
fehlt — als einzigem Task des Branches — die `complete`-Zeile; das Review liegt vor, sein Urteil ist
aber nie adjudiziert worden.

Sein Important-Befund B-1 behauptet, die Abschluss-Abnahme („alle **fünfzehn** Neutralen") sei
falsch, es seien **zwölf**, und verlangt als Fix eine Berichtszeile mit genau diesem Wortlaut. Die
Zahl fünfzehn ist aber richtig: `bauform.test.ts:473-477` definiert `NEUTRALE` als die zwölf
Farbnamen **plus** `--lb-display`, `--lb-body`, `--lb-mono`, und `:492` sichert alle fünfzehn im
Körper von `.rahmen` zu — mit gefahrenem Beleg im T87-Bericht (`task-87-report.md:232`, „15 — 12
Farben (Z. 36–47) + die drei Schriftstapel (Z. 64–66)"). Der Reviewer hat die Farbgruppe
**unter sich** gezählt (`helfer.module.css:34` sagt korrekt „Die zwoelf Neutralen" über die Farben)
und sie mit der Liste verwechselt, gegen die der Scan läuft. Nachgemessen: 23 Deklarationen unter
`.rahmen` = 15 + 8.

**Warum das trägt (der Mechanismus).** Führt jemand den vorgeschriebenen Fix aus, steht in der
Übergabe an Teil 5 der Satz „die Zahl fünfzehn ist falsch, es sind zwölf". Der nächste Umsetzer
(T100, `_lib/ampel.test.ts`) liest die Übergabe, findet die Zahl fünfzehn in `bauform.test.ts:473`
und „korrigiert" die eine oder die andere Seite — beide Richtungen brechen etwas: die Liste zu
kürzen nimmt den drei Schriftstapeln ihren Riegel (und `_ui/BarcodeScanner.tsx` rendert laut E8/T138
auch unter `.modul`, wo ein fehlender Stapel still auf die Vorgabeschrift fällt), die Zahl im Plan
zu ändern schafft einen Widerspruch zur laufenden Zusicherung. Das ist genau die Sorte
weitergereichter Falschaussage, gegen die die Bestandsaufnahme gebaut ist.

**Fix.** Kein Codeeingriff. Vor dem Merge in `progress.md`: T87 als `complete` eintragen **und**
festhalten, dass B-1 des T87-Reviews geprüft und **widerlegt** ist, mit dem Beleg
(`bauform.test.ts:473-477` und `:492`, `task-87-report.md:232`). Die vier übrigen Minors des
T87-Reviews (§5, alle protokollarisch) mit in die Minor-Liste dieses Branches.

---

### I-2 (Important) — Drei Inline-Stile in zwei Dateien vertreten drei benannte, aber niemandem zugewiesene CSS-Klassen — und einer davon trägt eine ausdrücklich OFFENE Betreiberfrage (44px gegen 56px)

**Fundstellen:**
- `src/app/m/lagerbuch/_ui/Entnahme.tsx:172-184` (soll `.rueckmeldung` sein)
- `src/app/m/lagerbuch/_ui/CheckFlow.tsx:985-997` (soll `.warnhinweis` sein)
- `src/app/m/lagerbuch/_ui/CheckFlow.tsx:145-175` (soll `.chipKnopf` sein; `TIPPZIEL`, `minHeight: 44`)

gegen `src/app/m/lagerbuch/_ui/helfer.module.css` (T64, abgenommen) und `progress.md` (kein Eintrag)

**Befund.** Drei Fix-Runden aus drei verschiedenen Wellen haben denselben Ausweg genommen: einen
Inline-Stil, der `.chip` überschreibt, mit einem Kommentar, der wörtlich sagt, die saubere Fassung
sei eine eigene Klasse in `helfer.module.css` — „Die Datei gehoert T64; das ist ein
**Koordinationsposten**, kein Nebenbei-Edit aus einem Fix-Task heraus." Dreimal richtig eskaliert,
dreimal am selben Ort gelandet: **es gibt den Koordinationsposten nicht.** Er steht in keiner
Ledger-Zeile, in keiner Auflagentabelle des T87-Berichts und in keinem Übergabepunkt an Teil 5. Kein
Task-Review konnte das sehen — jedes sah genau eine der drei Stellen und durfte sie einzeln als
korrekt eskaliert abhaken.

Die schärfere Hälfte steckt in `CheckFlow.tsx:145-151`. Der Kommentar hält fest:

> „⚠️ 44 UND NICHT 56, und das ist nicht meine Entscheidung: der Review schreibt `minHeight: 44`
> woertlich vor. […] Die Spannung zwischen der Begruendung des Reviews („nicht sekundaer") und dem
> vorgeschriebenen Wert ist **als Bedenken gemeldet**, nicht hier stillschweigend aufgeloest."

Gemeldet wurde es — angekommen ist es nirgends. Im Ledger steht zu T79 keine Zeile dazu.

**Warum das trägt — und was ausdrücklich NICHT der Befund ist.** Nicht die Zahl 44 ist das
Problem: 44px ist im Gegenteil deckungsgleich mit `.beenden` und `.rueckweg`
(`helfer.module.css:131`, `:215`), und die habe ich in §3 als plankonform adjudiziert. Auch die
Reihe selbst ist nicht zu dicht — die fünf Knöpfe liegen in `.zeileMeta`
(`CheckFlow.tsx:664` / `helfer.module.css:200`) mit `gap: 7px` und `flex-wrap: wrap`, also mit
Abstand.

**Der Befund ist die fehlende Entscheidung.** Ein Umsetzer hat eine Regelkollision erkannt, sie
nicht eigenmächtig aufgelöst — genau richtig nach Regel 5 — und sie gemeldet. Die Meldung ist
zwischen Fix-Runde und Ledger verlorengegangen. Damit bleibt im Baum eine Bedienfläche stehen, deren
eigener Kopfkommentar sagt, dass ihre Maßgabe ungeklärt ist, und die Folge eines Fehlgriffs benennt
er selbst: „ein Fehlgriff schreibt „fehlt" oder „Defekt" ins Journal" — mit Handschuhen, im
Fahrzeug, auf einem Telefon (`core/theme/tokens.ts:33`: „Bedienung mit Handschuhen … eine
Einsatzanforderung, keine Stilfrage"). Ob das die 56px verlangt oder nicht, ist eine
Spec-Entscheidung; **dass sie fällt und protokolliert wird**, ist der Punkt.

**Der zweite, langsame Mechanismus** braucht die Tap-Frage gar nicht: die drei Inline-Stile sind
Kopien derselben `.chip`-Korrektur. Ändert Teil 5 `.chip` (Padding, Radius, Zeilenhöhe, `white-space`),
gehen sie auseinander — und zwar **still**, weil jsdom kein CSS auswertet und kein Tor dieses
Projekts eine gerenderte Chipreihe misst. Genau diese Stille ist der Grund, warum der Plan CSS
überhaupt in Quelltext-Scans riegelt.

**Fix (vor dem Merge, ohne Codezwang).** Zwei Zeilen Entscheidung, dann eine Zeile Protokoll:
1. Die Frage **44 gegen 56** für die fünf Geräteknöpfe entscheiden (sie ist eine
   Spec-/Betreiberfrage, kein Umsetzerposten) und die Entscheidung in `progress.md` festhalten.
2. Den Koordinationsposten benennen und zuweisen: `.rueckmeldung`, `.warnhinweis` und `.chipKnopf`
   wandern nach `_ui/helfer.module.css`; die drei Inline-Stile entfallen. Naheliegender Einlöser ist
   Teil 5, T100 — der fasst `helfer.module.css` ohnehin an (E8-Auflage: `_lib/ampel.test.ts` läuft
   über `verwaltung.module.css` **und** `helfer.module.css`).

Wird beides nicht getan, verlässt der Branch den Bau mit drei Stellen, die ihre eigene saubere
Fassung namentlich beschreiben, und mit einer eskalierten Frage, die nie beantwortet wurde.

---

## 3. Triage der `minor (deferred)`-Zeilen des Ledgers

Rund 100 Zeilen. Maßstab: **hochstufen nur, wenn (a) es heute falsch ist oder eine tragende Zusage
heute hohl ist, UND (b) den Merge kein benannter Eigentümer überlebt.** Alles, was einem lebenden
Nachfolger (Teil 5/6, T100, T101, T114, T127, T164, T171) zugewiesen ist, bleibt Minor — dort ist
die Weitergabe der Mechanismus.

**Hochgestuft: zwei** — beide oben (I-1: Ledger/T87; I-2: Koordinationsposten `.rueckmeldung` /
`.warnhinweis` / `.chipKnopf` samt der offenen 44-gegen-56-Frage).

**Geprüft und ausdrücklich NICHT hochgestuft — mit Begründung, damit es nicht neu aufgerollt wird:**

| Ledger-Zeile | Warum sie Minor bleibt |
|---|---|
| `.beenden` / `.rueckweg` `min-height: 44px` (T64, T69, T76, T78, T80 — fünfmal notiert, jedes Mal „gehört an T64 bzw. an ein Wellen-Review") | **Adjudiziert: plankonform.** Global Constraint 19 lautet wörtlich „Tap-Maß 56px an jeder **±-Fläche**", nicht an jeder Fläche; der Plan druckt für beide Klassen selbst `min-height: 44px` (`teil4.md:1643`, `:1727`). Der Scan `bauform.test.ts:551-559` prüft folgerichtig nur `.stepTaste`. Kein Verstoß |
| `.zeile` ≈ 42,75px ohne `min-height` (T80) | dieselbe Begründung; zusätzlich ist die Zeile plan-1:1 |
| `ohneKommentare()`-Kopien nicht zeichengleich (T65, T69, T70, T77, T78, T79, T80, T83 — **acht** Zeilen) | Zu **einer** Zeile zusammengefasst: alle Kopien sind semantisch identisch (Prettier bricht den Einzeiler um), alle Reviews haben es einzeln nachgeprüft. N-5 verlangt „zeichengleich", Prettier verhindert es. Posten für Teil 5: `ohneKommentare` einmal exportieren statt achtmal kopieren |
| `antd`-Scan deckt `layout.tsx`, `abmelden/route.ts`, die fünf PWA-Handler und `_actions/` nicht (T64, „→ an T87") | **T87 hat es nicht getan** — die Ast-Liste in `bauform.test.ts:751-755` ist unverändert `_ui`, `helfer`, `a`, `t`, `page.tsx`. Bleibt trotzdem Minor: Falle 7 (`@ant-design/icons`) ist repo-weit von `src/core/shell/icons.test.ts` gedeckt (ein Route Handler kann kein `"use client"` tragen und fiele dort auf), und die ungedeckten Dateien gehören sämtlich Teil 1/2, nicht „diesem Plan". Restrisiko: nacktes `antd` in `layout.tsx` (Falle 1). Als Posten weitergeben |
| `einloeseAbschnitt()` behauptet nur über die erste einlösende Funktion je Datei (T64, „→ an T87") | T87 hat den Schnitt gebaut (`bauform.test.ts:969-976`: vom letzten `export` vor dem `redeemToken(` bis zum nächsten danach) und die Restschwäche im Kommentar offengelegt. Heute gegenstandslos: jede der drei Flächen hat genau **eine** einlösende Funktion (nachgezählt) |
| `.knopf` auf einem `<a>` wird unterstrichen (T77, `Gate.tsx:216`) | **Zweite Fundstelle dazugekommen, die T77 nicht sehen konnte:** `CheckFlow.tsx:439` (`<Link className={s.knopf …}>`). `.knopf` (`helfer.module.css:343-347`) setzt kein `text-decoration: none`, `.rueckweg`/`.tab`/`.zeile` schon. Rein optisch, kein Verhaltensbruch → Minor, aber zwei Zeilen im Stylesheet lösen beide Stellen |
| `public/login-bg.jpg` 404 auf dem Lagerbuch-Host (T86, „gehört als Posten weitergegeben") | **Neu erreichbar geworden, und kein Review konnte das sehen:** B3 + T81 haben den Verwaltungsknopf erstmals funktionsfähig gemacht (`page.tsx:101` → `/login?callbackUrl=…`), `/login` steht in `core/routing.ts:12` auf der PASSTHROUGH-Liste, `/login-bg.jpg` **nicht** — der Proxy-Matcher (`src/proxy.ts:103`) greift, `decideRoute` schreibt auf `/m/lagerbuch/login-bg.jpg` um, 404. Folge: die Anmeldeseite erscheint auf dem Lagerbuch-Host ohne Hintergrundbild. Rein kosmetisch → Minor, aber jetzt auf einem **begangenen** Weg |
| `.pruefKreis` im Zählschritt ist zweiwertig und im OK-Fall textlos (`CheckFlow.tsx:552-554`) | T79s Review hat die **o2**-Fassung (`:809-813`) auf drei Stufen geschärft, die Zählschritt-Fassung nicht. Constraint 21 („jeder Status trägt zusätzlich Text") ist im OK-Fall formal verletzt. Kein Betriebsschaden: der handlungsrelevante Fall (Lücke) trägt immer den Chip „nachfüllen N" daneben; plan-1:1 (`teil4.md:8354`) |
| Alle Zeilen der Form „Zusicherung könnte schärfer sein", „Bericht zählt falsch", „Testname verspricht mehr als der Rumpf hält", „Abdeckungsbreite" | Minor. Sie beschreiben Testgüte, nicht heutiges Fehlverhalten; jede ist im jeweiligen Task-Review belegt und keine trägt eine Regel allein |
| Zeilen mit lebendem Eigentümer (T100 Ampel-Hexwerte, T101 Ikonenhebung, T127 `ArtikelDrawer`, T164 `g/[code]`, T171 E2E, Teil 5 `.modul`-Variablensatz, Cutover-Import §4.8) | Minor — die Weitergabe **ist** der Mechanismus, und alle sind im Code oder im T87-Bericht namentlich verankert |
| T66: `redeemToken` ist kein Compare-and-Set (cross-Prozess-Fenster zwischen `.get()` und `.run()`) | Bleibt Minor: das Fenster ist Mikrosekunden, der Schaden begrenzt (eine 12-h-Sitzung für ein im selben Moment gesperrtes Kärtchen), die Behebung wäre eine Schema-/Transaktionsentscheidung und kein Fix-Task |
| T82: Host-Muster global auf `requireLagerbuchHost|lagerbuchHostOderNull` geweitet | Von T87 überholt: `bauform.test.ts:1074-1136` prüft die Form jetzt **je Flächenart** über den Baum (`quellDateien()` statt Namensliste), plus `hostAbweisung`-Kette (`:1138-1149`) |

---

## 4. Was ich gesucht und NICHT gefunden habe

Damit es niemand ein zweites Mal sucht:

- **Kein** Widerspruch zwischen den drei Gate-Flächen — Reihenfolge, Sperrquelle, Normalisierung und
  Budgetverbrauch sind zeichengleich in derselben Reihenfolge angeordnet.
- **Kein** verschluckter `redirect()`. `Gate.tsx:116-121` fängt zwar jede Ausnahme, aber
  `einloesenAmGate` beendet den Erfolgspfad mit `redirect()`, und Next transportiert den in der
  Antwort statt als Ablehnung; das `?? {}` ist der Erfolgspfad, nicht Defensive
  (`Gate.tsx:102-110`, mit gemessenem Präzedenzfall).
- **Kein** Verlust des Erneuerungsfelds bei einem Tippfehler im Erneuerungscode:
  `CheckFlow.tsx:306-321` schreibt den Misserfolg in `erneuerungsFehler` und lässt `fehler.grund`
  (`"sitzung"`) unangetastet — der `darfErneuern`-Zweig bleibt offen. Der Verdacht, dass
  `sitzung.ts:91` mit `grund: "gesperrt"` das Feld schließt, trägt nicht.
- **Keine** undeklarierte `--lb-*`-Variable und **kein** Konsument außerhalb von `.rahmen`:
  `HelferRahmen.tsx:71` und `OeffentlicherRahmen.tsx:26` sind die einzigen zwei Träger, und alle
  vier Seiten des Moduls gehen durch einen von beiden.
- **Keine** Verschiebung der Action-Arithmetik durch das Vorziehen von T114:
  `_actions/guards.test.ts` ist zählungsfrei (Eigenschaftsform), kennt `requireHelferSchreibend` als
  gültigen Riegel und hat genau drei Ausnahmen; `task-87-report.md:213` und `:225` weisen die drei
  `buchung.ts`-Deklarationen korrekt Teil 5 zu.

---

## 5. Urteil

**Spec-treu: ja.** Alle 26 Global Constraints halten über den ganzen Branch, mechanisch nachgemessen.
Die zwei Verschärfungen, die dieser Plan sich selbst schuldete (E9, B2), sind eingelöst; die
Betreiberentscheidungen B1, B3, B4 und B-1 sind im Code sichtbar und nicht bloß behauptet.

**Qualität: Nachbesserung nötig** — aber ausschließlich am Protokoll, nicht am Code. Zwei Posten
vor dem Merge, beide ohne Codezwang:

1. T87 im Ledger schließen und B-1 des T87-Reviews als widerlegt vermerken (I-1).
2. Die offene 44-gegen-56-Frage entscheiden und den dreifach benannten Koordinationsposten
   `.rueckmeldung` / `.warnhinweis` / `.chipKnopf` einem Nachfolger zuweisen (I-2).
