# Übergabe aus Teil 4 (der öffentliche Helfer-Weg) an die Teile 5 und 6

Entstanden am 06.08.2026 beim Bau von Teil 4 (`2026-08-03-lagerbuch-modul-teil4.md`, 26 Tasks plus
zwei vorgezogene aus Teil 5, jeder einzeln reviewt, dazu ein vierteiliges Abschluss-Review und eine
Fix-Welle). **Alles hier ist im Bau aufgelaufen und steht in keinem der sechs Plandokumente** —
deshalb dieses Blatt, wie schon `UEBERGABE-lagerbuch-teil2.md` und `UEBERGABE-lagerbuch-teil3.md`.

⚠️ **Warum es diese Datei geben MUSS:** die Auflagen unten existierten bis heute ausschließlich in
`.superpowers/sdd/2026-08-03-lagerbuch-modul-teil4/task-87-report.md`. Dieses Verzeichnis ist per
`.superpowers/sdd/.gitignore` (Inhalt `*`) **Scratch** — `git ls-files .superpowers/` liefert null
Dateien. Das ist workflow-konform und soll so bleiben; genau deshalb ist ein getracktes
Übergabe-Blatt der vorgesehene Weg. Wer Teil 5 oder den Cutover in einer frischen Sitzung auf
sauberem Arbeitsbaum beginnt, findet sonst **nichts** davon.

Wer Teil 5 oder Teil 6 beginnt, liest **alle drei** Übergaben. Die aus Teil 2 und Teil 3 gelten
unverändert weiter.

---

## 1. Die drei Runbook-Eingaben (R1–R3) — jetzt im Runbook, hier nur noch als Zeiger

Sie stehen seit dem Abschluss von Teil 4 in `docs/runbooks/lagerbuch-cutover.md`:

| # | Was | Wo |
|---|---|---|
| **R1** (teuerste, cutover-kritisch) | `APP_BASE_URL` und `SUITE_HOST_LAGERBUCH` müssen **zeichengleich** derselbe Host sein — `helferCookieOptionen()` setzt `path:"/"` **ohne** `domain`. Weicht der Host ab, endet **jede** laufende Feld-Sitzung, und kein Test sieht es. | Runbook §7, **vor** dem Umschwenk-Schritt |
| **R2** | Nachkontrolle von `/manifest.webmanifest` und `/icon-192.png` nach dem Umschwenken, plus Negativprobe gegen den Portal-Host. | Runbook §10 |
| **R3** | Generalprobe auf **einem** Gerät (PWA installieren, im Browser einlösen, Regaletikett mit der Systemkamera scannen). iOS führt für das Startbildschirm-Fenster eine eigene Speicherpartition. | Runbook §11 |

---

## 2. Was dieser Branch an Teil 5 auflegt (T5-1 … T5-5)

Wörtlich aus `task-87-report.md` §6.2.

| # | Auflage | Stand |
|---|---|---|
| **T5-1 (A2)** | `_actions/buchung.ts` (T114) und `_lib/actionErgebnis.ts` (T113) sind **vorgezogen und eingecheckt** (`d5b1cf1`, `6b48c8e`). Teil 5 legt sie **nicht** noch einmal an. | **erledigt** |
| **T5-2 (A1)** | `bucheEntnahmeHelfer` gibt `HelferErgebnis<{gebucht:number}>`, und `gebucht === 0` ist `{ok:false, grund:"leer", …}` — nicht „200, das lügt". | liegt bei T114; nicht Gegenstand der Abnahme von Teil 4 |
| **T5-3 (A3)** | `_lib/ampel.test.ts` (T100) muss **ohne jede Änderung** über `_ui/verwaltung.module.css` **und** `_ui/helfer.module.css` grün sein. | **Die Namen sind gezählt und in beiden Modi vollständig:** hell **15** Neutrale (12 Farben + die drei Schriftstapel `--lb-display`/`--lb-body`/`--lb-mono`) + **8** `--lb-ampel-*` = 23 Deklarationen unter `.rahmen`; dunkel **12 + 8** = die zwanzig **Farb**namen. Die drei Schriftstapel sind moduskonstant und im Dunkelzweig ausdrücklich ausgenommen (`bauform.test.ts`, `NEUTRALE.filter(…)`). **Grün** wird T100 **dort** bewiesen — `_lib/ampel.test.ts` und `_ui/verwaltung.module.css` existieren auf diesem Branch beide nicht. |
| **T5-4** | `_ui/ikonen.tsx` (T101) hebt die lokalen Inline-`<svg>` per **reinem Import-Tausch**; **kein** Test von Teil 4 sichert ein `d`-Attribut zu. Die Ausnahme „Zeichen ohne Text" bleibt der **Taschenlampenschalter** (N-7 der Umsetzerregeln), mit `aria-label` + `aria-pressed` am Knopf. | vorbereitet |
| **T5-5 (B4)** | `HelferGrund` trägt seit diesem Branch den fünften Wert `"eingabe"`; die Konsumenten in Teil 5 müssen ihn **anzeigen** können. `darfErneuern("eingabe") === false`. | additiv erledigt |

### ⚠️ Zur Zahl **fünfzehn** in T5-3 — sie ist RICHTIG

Das Task-Review von T87 behauptete, es seien zwölf. **Widerlegt und im Ledger adjudiziert:**
`_lib/bauform.test.ts` definiert `NEUTRALE` als die zwölf Farbnamen **plus** `--lb-display`,
`--lb-body`, `--lb-mono`, und der `.rahmen`-Scan sichert alle fünfzehn im **Körper** von `.rahmen`
zu. `helfer.module.css:34` („Die zwoelf Neutralen") beschriftet nur die **Farbgruppe**, nicht die
Liste, gegen die der Scan läuft.

**Ändere weder die Liste noch die Zahl.** Die Liste zu kürzen nähme den drei Schriftstapeln ihren
Riegel — und `_ui/BarcodeScanner.tsx` rendert laut E8/T138 **auch** unter `.modul`, wo ein fehlender
Stapel still auf die Vorgabeschrift fällt.

---

## 3. Was dieser Branch an Teil 6 auflegt (T6-1 … T6-4)

Wörtlich aus `task-87-report.md` §6.1.

| # | Auflage | Warum sie sonst ausfällt |
|---|---|---|
| **T6-1** | **Wer `g/[code]/page.tsx` baut (T164, dort J3), überführt sie aus `NOCH_NICHT` in `PFLICHT`** in `_lib/bauform.test.ts` — drei Zeilen. | E9 verweist für die Weiterführung auf „§6", und §6.3 führt sie unter seinen vier namentlich zugewiesenen Auflagen **nicht**. Ohne Zuständigen ist die `NOCH_NICHT`-Schleife ein Dauer-No-op. Die Zuständigkeit steht jetzt **im Kommentar an der Stelle selbst**. |
| **T6-2** | **`e2e/lagerbuch-helfer.spec.ts` bleibt T171s Datei** — Teil 4 hat sie nicht angelegt und **behauptet nichts über den Mehrhost-Fall**. | Falle 16 unter zwei Hosts und Falle 63 unter dem Rewrite sind in Vitest strukturell nicht darstellbar. T87 hat die **Form** des 303 und die **Prop-Durchreichung auf einem Host** gemessen — mehr nicht. |
| **T6-3** | Wer eine **vierte Gate-Fläche** baut, trägt sie in `GATE_FLAECHEN` ein, und wer sie als Route Handler baut, nimmt sie in `HOST_FORM` auf. | Der Reihenfolge-Scan ist eine feste Dreierliste, kein Sammler; seit T87 ist sie zusätzlich eine **Existenzpflicht** — ein Eintrag ohne Datei ist rot, nicht mehr still grün. |
| **T6-4** | Die Routenzahl **14** in Teil 6 §2.1 ist **nicht belegt**; gemessen sind **11**. Wer sie fortschreibt, zählt neu. | Doppelzählung. Gemessen unter `/m/lagerbuch`: (Wurzel) · `a/[artikelId]` · `abmelden` · `helfer` · `helfer/check` · `icon-192.png` · `icon-512.png` · `icon-maskable-512.png` · `manifest.webmanifest` · `pwa-icon.svg` · `t/[code]` = 11. |

---

## 4. Die Vorzieh-Entscheidung im Wortlaut

**06.08.2026, autonom getroffen**, nachdem T83 BLOCKED lief: `_actions/buchung.ts` (Teil 5, T114)
fehlte, obwohl Auflage A2 des Plans sie ausdrücklich vorzieht („wird vorgezogen und läuft VOR
Welle 7"). Gemessen war `typecheck` repo-weit rot (TS2307) **und** Vitest sammelte in einer Suite
null Tests, weil `vite:import-analysis` an der unauflösbaren Spezifiziererzeile scheiterte, **bevor**
eine `vi.mock`-Registrierung greifen konnte.

**Entschieden:** T114 wird vorgezogen, wie A2 es vorsieht — zusammen mit **nur** der Typ-/Helferdatei
`_lib/actionErgebnis.ts` aus T113. **`_actions/artikel.ts` bleibt bei Teil 5:** sie ist eine
Verwaltungs-Action, zöge einen fremden Zweig in den Branch und verschöbe die Action-Arithmetik, die
Teil 6 nachzählt. `_lib/` zählt dort nicht mit.

**Folge im Plan von Teil 5, im Abschluss von Teil 4 nachgetragen:**

- T113 trägt jetzt denselben Vorzieh-Vermerk wie T114 (vorher trug ihn nur T114 — genau diese
  Asymmetrie hat T83 blockiert). `_lib/actionErgebnis.ts` ist im „Files"-Block durchgestrichen,
  Schritt 3 als entfallen markiert, der `git add`-Block bereinigt.
- §6 von `teil5.md` korrigiert: **14 Action-Dateien / 40 Deklarationen** (vorher 15/43), **alle 40**
  mit `requireLagerbuchAdmin()`. `_actions/buchung.ts` trägt drei Deklarationen (`bucheZugang`,
  `bucheEntnahme`, `bucheEntnahmeHelfer`) und ist vorgezogen. **Festlegung H7 bleibt gültig:** die
  Datei gehört vollständig Teil 5; es gibt genau **eine** `_actions/buchung.ts`.
- ⚠️ **Offener Folgeposten:** die Kommentare bei `teil5.md:4842`, `:5045` und `:5183` schreiben die
  alte Zahl fort („42 der 43 Deklarationen"). Bewusst nicht mitgezogen (Plan-vorgeschriebene
  Begründungstexte außerhalb des Befundumfangs). **Wer T151 baut, zählt neu.**

---

## 5. Betreiberentscheidung B4 — der fünfte `HelferGrund`

Getroffen am 06.08.2026 unter dem Autonomie-Auftrag, weil `checkAbschluss` im `safeParse`-Fehlerzweig
`grund: "netz"` **serverseitig** zurückgab. Global Constraint 12 verbietet das wörtlich („`"netz"`
entsteht NIE serverseitig. Es ist der Grund, den der Client im `catch` selbst setzt."), und T63 hat
es mechanisch zementiert.

**`HelferGrund` bekommt einen fünften Wert `"eingabe"`.** Additiv, in `_lib/actionTypen.ts`:

- `export type HelferGrund = SperrGrund | "leer" | "netz" | "eingabe";`
- **`darfErneuern("eingabe")` ist `false`** — eine unvollständige Nutzlast wird nicht dadurch
  vollständig, dass jemand die Sitzung erneuert.

Warum nicht die Alternativen: ein **Wurf** verletzt Falle 66 (der Produktions-Deserialisierer baut
daraus einen festen englischen Satz mit `digest`, der Text erreicht niemanden); `"leer"` bedeutet
`gebucht === 0` und wäre fachlich falsch; `"netz"` verletzt Constraint 12.

⚠️ Diese Änderung fasst `_lib/actionTypen.ts` an, die laut Eigentümertabelle **T63** gehört. Das ist
bewusst und ausdrücklich erlaubt; sie ist rein additiv, und T63 ist abgenommen. **Die vier
Konsumenten** (`_actions/check.ts`, `_ui/Entnahme.tsx`, `_ui/CheckFlow.tsx`, Teil 5 T114) müssen den
neuen Wert **anzeigen** können — der `text` des Ergebnisses trägt die Botschaft, der `grund` steuert
nur das Erneuerungsfeld.

Seit dem Abschluss-Fix hat `"eingabe"` einen **zweiten** Erzeuger in derselben Action: der Riegel,
der die Wurzel-ID `fahrzeugId` gegen `lagerorte` auflöst (siehe Punkt 7).

---

## 6. ⚠️ KOORDINATIONSPOSTEN an Teil 5, T100 — drei Inline-Stile nach `helfer.module.css`

**Das ist die Auflage, die es bis zum Abschluss-Review nicht in ein Dokument geschafft hat**, obwohl
drei Fix-Runden aus drei verschiedenen Wellen sie einzeln und wörtlich benannt haben. Jeder der drei
Kommentare sagt: „die saubere Fassung ist eine eigene Klasse in `helfer.module.css`. Die Datei
gehört T64; das ist ein Koordinationsposten, kein Nebenbei-Edit aus einem Fix-Task heraus." **Den
Koordinationsposten gab es nicht** — er stand in keiner Ledger-Zeile, in keiner Auflagentabelle und
in keinem Übergabepunkt. Hier ist er.

| Klasse | Ersetzt den Inline-Stil in | Was er heute tut |
|---|---|---|
| `.chipKnopf` | `_ui/CheckFlow.tsx` (`const TIPPZIEL`) | `background:none; border:0; padding:6px 0; min-height:44px; display:inline-flex; align-items:center` |
| `.warnhinweis` | `_ui/CheckFlow.tsx` (Handlager-Warnung, `${s.chip} ${s.gelb}`) | `white-space:normal; display:block; border-radius:10px; padding:8px 10px; font-size:13px` |
| `.rueckmeldung` | `_ui/Entnahme.tsx` (Buchungs-Rückmeldung, `${s.chip} ${s.ok\|s.rot}`) | dasselbe plus `margin-top:10px` |

**Naheliegender Einlöser ist T100:** der fasst `helfer.module.css` wegen der E8-Auflage
(`_lib/ampel.test.ts` läuft über `verwaltung.module.css` **und** `helfer.module.css`) ohnehin an.

**Warum es zählt — und zwar auch ohne die Tap-Frage:** die drei Inline-Stile sind **Kopien derselben
`.chip`-Korrektur**. Ändert Teil 5 `.chip` (Padding, Radius, Zeilenhöhe, `white-space`), gehen sie
auseinander — **still**, weil jsdom kein CSS auswertet und **kein Tor dieses Projekts eine
gerenderte Chipreihe misst**.

**Die 44/56-Frage ist entschieden: 44 bleibt** (siehe Ledger, 06.08.2026). Der Kommentar in
`CheckFlow.tsx` hielt fest, die Spannung sei „als Bedenken GEMELDET, nicht hier stillschweigend
aufgelöst" — die Meldung ist zwischen Fix-Runde und Ledger verlorengegangen. Nachgeholt: der Wert
ist deckungsgleich mit `.beenden`/`.rueckweg` (Hausminimum für sekundäre Bedienelemente) und im §3
des Abschluss-Reviews als plankonform adjudiziert. Die fünf Geräteknöpfe liegen in `.zeileMeta`
(`helfer.module.css:200`) mit `gap:7px` und `flex-wrap` — die Reihe ist nicht zu dicht.

⚠️ **Ein Betreiber kann das kippen.** `core/theme/tokens.ts:33` begründet das 56er-Tapmaß mit
„Bedienung mit Handschuhen … eine Einsatzanforderung, keine Stilfrage", und ein Fehlgriff an diesen
fünf Knöpfen schreibt „fehlt" oder „Defekt" ins Journal. Wer auf 56 geht, ändert damit eine
Querschnittsregel — das gehört dorthin entschieden, nicht in einen Umsetzer-Task.

---

## 7. `_lib/hostRiegel.ts` hat keinen Eigentümer

Die Datei ist in T86 aus dem siebenfach wiederholten Riegel-Block herausgezogen worden und steht in
**keiner** Eigentümertabelle der sechs Pläne. Zwei Folgen:

- Es gibt **keine** `hostRiegel.test.ts`. Vertretbar — die drei Zeilen sind über zehn
  Verhaltenstests und den Nicht-werfend-Scan vollständig ausgeübt, und `bauform.test.ts` kennt keine
  Geschwister-Pflicht —, aber es ist die Stelle, an der ein künftiger Umbau ohne Netz steht.
- Die §2.6-Tabellenzeile „manifest + vier Icon-Handler → `lagerbuchHostOderNull`" beschreibt nach dem
  Umbau einen **transitiven** Aufruf über `_lib/hostRiegel.ts`. Der Sache nach weiter wahr; wer
  §2.6-Treue per Grep über die fünf Dateien prüft, findet den Namen dort nicht mehr.
- Der Riegel-Block steht repo-weit weiterhin **siebenmal**: `t/[code]/route.ts` und
  `abmelden/route.ts` tragen die `if`-Form. Bei `t/[code]/route.ts` ginge ohnehin kein `??`.

---

## 8. Nachgetragen im Abschluss-Fix (06.08.2026) — was am Code geändert wurde

Vier Stellen, alle klein, alle mit gefahrener Mutation belegt:

1. **`_actions/check.ts` — Riegel 5.** `checkAbschluss` löste seine **Wurzel**-ID `fahrzeugId` als
   einzige nicht gegen die Datenbank auf, während alle **vier** Kind-IDs mit einem Wurf geprüft
   werden. Jetzt: `if (!fz || fz.typ !== "fahrzeug" || !fz.aktiv) return {ok:false, grund:"eingabe", …}`
   — **Rückgabewert, kein Wurf**, weil eine Stilllegung während des Checks eine erwartbare Lage im
   Sinn von Falle 66 ist. **Für Teil 5 heißt das:** die Fahrzeug-Verwaltung (die einzige Stelle mit
   `update(lagerorte)` — im Produktivcode heute repo-weit **null** Treffer, nur die Tests des neuen
   Riegels legen ein Fahrzeug still) kann ein Fahrzeug stilllegen, ohne dass eine
   laufende Check-Sitzung stillen Schaden anrichtet.
2. **`_lib/schreibpfade/tokenEinloesung.ts`, `tokenEinloesung.test.ts`, `_actions/gate.test.ts`** —
   die aus der Alt-Anwendung übernommene Behauptung „ein einmal eingelöster Code ist nicht mehr
   löschbar, nur noch sperrbar (`loeschen.ts:89-99`)" steht `_db/schema.ts:412-413` (Entscheidung
   **8-F**) entgegen und ist korrigiert. **Der Schaden eines cross-origin-Redirects ist eine
   Einlösung OHNE Sitzung**, kein verbranntes Kärtchen. ⚠️ **Die beiden Konstruktionsentscheidungen
   bleiben unverändert richtig** — relativer `Location` in `t/[code]/route.ts` (§7.2.3) und der
   Host-Riegel **vor** `redeemToken`. Nur ihre Begründung trägt jetzt.
3. **`_ui/HelferChip.test.tsx`** — der Bauform-Scan hieß „KEINEN Index-Zugriff auf `s`", fing aber
   nur die Backtick-Form. `\bs\[` deckt jetzt beide.
4. **`_lib/bauform.test.ts`** — drei mengenbasierte Scans hatten keinen Vakuum-Riegel bzw. prüften
   nur das Präfix statt der Deklariertheit. Untergrenzen: antd-Scan ≥ **18** Dateien,
   `useSearchParams`-Scan ≥ **17** (dieselbe Menge ohne `page.tsx`), Träger-Vertrag ≥ **10**
   benutzte Variablen plus Teilmengenprüfung gegen die tatsächlich deklarierten Namen.
   ⚠️ **Nur der Träger-Vertrag steht bewusst unter dem Ist-Stand** — `≥ 10` bei gemessenen **20**
   benutzten Variablen. `helfer.module.css` gehört T64 und darf wachsen **und schrumpfen**; dort wäre
   eine Grenze auf dem Ist-Stand eine Stolperdrahtleine.
   ⚠️ **Die beiden Dateizahl-Grenzen sitzen dagegen EXAKT auf dem Ist-Stand** — gemessen **18** bzw.
   **17** Dateien, kein Spielraum. Das ist hier vertretbar, aber nur aus einem Grund: die Menge unter
   `_ui/`, `helfer/`, `a/` und `t/` **wächst** in Teil 5 und 6 und schrumpft nicht. Und die Zahl ist
   **kein Zähler, sondern ein Vakuum-Riegel**: sie fängt allein den Fall, dass die Astliste von der
   Platte abreißt und der Scan leer-grün über **null** Dateien meldet. **Wer eine Datei aus einem der
   vier Äste entfernt oder verschiebt** — oder einen Ausschluss in `quellDateien()` ergänzt —, **zieht
   die Zahl bewusst nach**; der rote Test ist dann die richtige Meldung und kein Fehlalarm. Wer sie
   ohne diesen Anlass absenkt, nimmt dem Scan seinen Riegel.

---

## 9. Was Teil 4 ausdrücklich **nicht** belegt

Der Mehrhost-Fall von Falle 16, `aria-current` unter dem Rewrite (Falle 63), das Verhalten hinter
einer echten Anmeldung, und alles, was **zwei Hosts gleichzeitig** braucht. Das ist Teil 6, T171.
Die Abnahme von Teil 4 hat **einen** Server auf **einem** Port gesehen.
