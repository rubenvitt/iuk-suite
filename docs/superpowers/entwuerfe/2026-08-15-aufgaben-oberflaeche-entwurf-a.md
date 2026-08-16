# Entwurf A — „Der nächste Schritt": Oberflächen-Neuentwurf des Moduls `aufgaben`

**Stand:** 2026-08-15 · **Gegenstand:** die drei Einstiege, die Routen und die eine Darstellung für
Dringlichkeit · **Kein Code geändert.**

---

## 1. Die Leitidee in drei Sätzen

Jeder Einstieg beginnt mit **einer Führungskarte**, die die eine Sache benennt, die diese Person
jetzt tun soll — samt der Aktion, die sie tut.

Was in der Karte steht, entscheidet **eine reine Funktion vor dem Rendern** (`_lib/lage.ts`, Vorbild
`feedback/_lib/cockpit.ts`): eine Rangleiter je Rolle, die den Bestand in genau einen führenden
Anlass und eine geordnete Restmenge zerlegt — die JSX verzweigt nicht mehr, sie stellt dar.

Alles unterhalb der Karte ist **Vorrat**, nach demselben Rang geordnet, und **Dringlichkeit hat
genau eine Darstellung** — Wort, Form, Position, Farbe zuletzt —, die auch dort gilt, wo sie heute
fehlt: im Wochenplan.

---

## 2. Informationsarchitektur

### 2.1 Der Befund zur Doppelung — und die Richtung, in der er aufzulösen ist

Der Auftrag schlägt vor, `/verteilen` und `/freigaben` als eigene Seiten entfallen zu lassen, weil
sie Kopien von Zonen des Einstiegs sind. **Die Doppelung ist real, die Streichrichtung ist falsch.**
Belegt am Code:

- `verteilen/page.tsx` rendert `VerteilenTabelle` aus `verteilDaten(db, heute)`;
  `EinstiegKoordination.tsx` rendert **dieselbe Komponente aus derselben Ladefunktion**.
- `freigaben/page.tsx` rendert `FreigabeZone` aus `freigabeDaten(db, akteur, heute)`;
  `EinstiegAuftrag.tsx` und `EinstiegKoordination.tsx` rendern **dieselbe Komponente aus derselben
  Ladefunktion**.

Es sind also keine zwei Fassungen, die auseinanderlaufen könnten — es ist **eine Fassung an zwei
Orten**. Wer die Route streicht, verliert:

1. **Die Kernzusage des Moduls samt ihrem Test.** `e2e/aufgaben.spec.ts:273` ist im Quelltext als
   „DIE KERNZUSAGE DER GESAMTEN AUFGABE" ausgewiesen: eine `auftrag`-Person bekommt auf
   `/verteilen` **404**. Das ist die Antwort auf die ursprüngliche Beschwerde („Malte und Tomke
   pfuschen rein"). Ohne Route gibt es diese Prüfung nicht mehr — die Zusage bliebe, aber nur noch
   als Abwesenheit eines Links, und eine Abwesenheit kann man nicht auf 404 prüfen.
   Gleiches für `/freigaben` und `e2e/aufgaben.spec.ts:469` (BuFDi → 404).
2. **Zwei Navigationseinträge.** `_lib/nav.ts` führt „Verteilen" (bei `darfVerteilen`) und
   „Freigaben" (bei `darfFreigabenSehen`) in der Suite-Kopfzeile. Sie sind heute schon von jeder
   Modulseite aus erreichbar; ohne Route müssten beide entfallen, und die Koordination käme von
   `/personen` aus nur noch über den Einstieg zum Posteingang zurück.
3. **Den Ort für Stapelarbeit** — siehe §4.4.

**Was entfällt, ist die Kopie im Einstieg, nicht die Route.** Der Einstieg trägt ab jetzt die
Führung und die Lage; die volle Arbeitsfläche steht auf ihrer eigenen, adressierbaren, gegateten
Route. Damit hat jede Fläche genau eine Aufgabe, und die Doppelung ist weg — in der Richtung, die
nichts kostet.

### 2.2 Die Routen

| Route | bleibt? | Begründung |
|---|---|---|
| `/` | **bleibt**, neu gebaut | Führungskarte + Lage + Vorrat; nicht mehr KPI-Zeile + vier Listen |
| `/a/<id>` | **bleibt**, unverändert im Aufbau | Der einzige Ort mit Verlauf und Nachweis; §6 nennt drei kleine Änderungen |
| `/neu` | **bleibt**, unverändert | Das Formular, das der Grund für das Modul ist |
| `/plan/<personId>` | **bleibt** | Eigener Plan änderbar, fremde lesend — `darfPlanSehen` ist für alle wahr, `darfPlanAendern` nur für die Person selbst |
| `/routinen` | **bleibt** | `darfRoutinenVerwalten` (nur `bufdi`) |
| `/freigaben` | **bleibt** | Gate + 404-Gegenprobe (BuFDi); der einzige Ort, der „meine" von „in Vertretung" trennt; das Ziel der Führungskarte, wenn mehr als eine Freigabe offen ist |
| `/verteilen` | **bleibt** | Gate + 404-Gegenprobe (`auftrag`); der **Stapelplatz** (§4.4); die einzige Seite mit echter `Table` im Überlauf-Sweep |
| `/personen` | **bleibt**, unverändert | |
| `/archiv` | **bleibt**, unverändert im Aufbau | |
| — | **keine neue Route** | Insbesondere keine `/heute` und keine `/ueberfaellig`: „überfällig" ist keine Sammlung, sondern eine Eigenschaft, und sie erscheint ab jetzt als Zone auf **jedem** Einstieg (heute nur auf dem der Koordination) |

### 2.3 Was das für `e2e/aufgaben.spec.ts` bedeutet

**Keine einzige Route verschwindet — also ändert sich keine 200/404-Zusage.** Das ist der teuerste
Teil der Datei (1822 Zeilen) und er bleibt unangetastet. Konkret:

| Stelle | Wirkung | Was zu tun ist |
|---|---|---|
| `:45`, `:56`, `:63` Modulwurzel/Erklärseite/Middleware | unberührt | — |
| `:113` „Meine Woche", `:215` „Verteilung", `:329` „Meine Aufträge" (`h1`) | unberührt — der `SeitenKopf` bleibt Form und Titel | — |
| `:236` `getByText("Verbandskästen im Fahrzeugpark prüfen")` auf `/` | **bleibt grün**: im Seed ist genau **eine** Aufgabe `eingegangen`, also `n = 1`, und die Führungskarte nennt bei `n = 1` den Titel (§4.2). | Nichts — aber die Zeile wird **fragil**: bekommt der Seed eine zweite `eingegangene` Aufgabe, zeigt die Karte eine Zahl statt des Titels. Der Test bekommt deshalb einen Kommentar und, sicherer, eine zweite Assertion auf `data-rolle="fuehrung"`. |
| `:363` „Meine Aufträge enthält keinen Weg zum Verteilen" | **bleibt grün und wird schärfer**: der Einstieg von `auftrag` verliert die `FreigabeZone` und gewinnt nichts, was auf `verteilen` zeigt | — |
| `:380` `/neu` mit `#af-*`-Ids | unberührt | Die Ids bleiben |
| `:1414` Der volle Durchlauf, Schritt 3 | **Hier ist etwas zu tun, und zwar zwingend.** Der Test sucht `#posteingang li` mit dem neuen Titel und darin den Knopf `/^Annehmen:/`. `id="posteingang"` behält der Entwurf wörtlich (die Zone heißt in der Überschrift „Einzuplanen (2)"), **aber R3 kann die Zone löschen**: hat Carla in diesem Moment genau *eine* einzuplanende Aufgabe und ist „einzuplanen" ihr höchster Anlass, steht die Aufgabe in der **Karte** und die Zone entfällt. Dass der Test heute trotzdem grün liefe, wäre Zufall — Carla trägt zu diesem Zeitpunkt „Blutdruckmessgeräte kalibrieren" als `in_arbeit`, also Rang 3, und „einzuplanen" fällt auf Rang 5 mit n≥1. **Genau die Sorte Abhängigkeit, die diese Datei anderswo selbst als Zeitbombe bezeichnet.** | Schritt 3 des Rundlaufs greift auf `[data-rolle="fuehrung"]` **oder** `#posteingang` zu — konkret: `page.locator('[data-rolle="fuehrung"], #posteingang').filter({ hasText: titel }).getByRole("button", { name: /^Annehmen:/ })`. Damit ist der Test unabhängig davon, welche Sprosse führt. Die Alternative — `#posteingang` eine benannte Ausnahme von R3 geben — ist ausdrücklich **abgelehnt**: eine Zone, die eine Aufgabe wiederholt, die schon in der Karte steht, ist genau der Befund, gegen den dieser Entwurf geschrieben ist. |
| `data-testid="verteilen-<id>"` auf `/verteilen` | unberührt | — |
| `:1084` Umschaltung bei 390/768/820/1280 | hängt an `data-rolle="wochengitter"` / `data-rolle="tagesliste"` — **bleiben** | Nichts |
| `:1201` Überlauf-Sweep | Seitenliste unverändert; `/` wird **schmaler bebaut** als heute (keine vierspaltige KPI-Zeile), das Risiko sinkt | Nichts |
| `:1243` Dunkelmodus `--auf-tinte` | unberührt | — |
| **Neu** | Eine Zusage je Rolle: `[data-rolle="fuehrung"]` ist das **erste** Element in `[data-testid="aufgaben-content"]`, und **dasselbe Element** enthält höchstens einen `.ant-btn-primary`. Die Messung ist ausdrücklich auf `aufgaben-content` eingegrenzt, **nicht** auf `main`: die Suite-Shell bringt eigene Bedienelemente mit, und ein Primärknopf der Kopfzeile machte die Zusage entweder falsch-rot oder — schlimmer — zwänge dazu, sie auf „höchstens zwei" abzuschwächen. Das ist die einzige Stelle, an der „genau ein Primärknopf pro Seite" überhaupt rot werden kann. | 3 kurze Tests (Alina, Rike, Malte) |

**Die Belegungen der Führungskarte gehören nicht ins e2e.** Sie sind ein reiner Selektor über
Datenzeilen; sie werden in `_lib/lage.test.ts` **erschöpfend** geprüft (jede Sprosse jeder Leiter,
plus Leerfall, plus Gleichstand). e2e prüft nur, dass die Karte da ist, an erster Stelle steht und
genau einen Primärknopf trägt — die drei Aussagen, die ein Selektor-Test strukturell nicht treffen
kann.

Vitest-Kollateral, ehrlich benannt: `EinstiegKoordination.test.tsx` und `EinstiegBufdi.test.tsx`
prüfen heute die KPI-Kacheln („0-Kacheln bleiben stehen", „jede Kachel mit Zahl > 0 trägt ein
Ziel"). Mit den Kacheln entfallen diese Fälle; an ihre Stelle tritt die stärkere Zusage aus
`lage.test.ts` („jeder nicht-leere Anlass erscheint entweder in der Karte oder als Zone — nie
keins, nie beides"). `Kachel.tsx`, `Kachel.test.tsx` und die Klassen `.kpi`, `.kpiLink`,
`.kpiKanteAchtung|Ocker|Ok` entfallen mit; `Kachel` hat außerhalb der beiden Einstiege keinen
Aufrufer (geprüft).

---

## 3. Die drei Einstiege

### 3.0 Das Gerüst, das für alle drei gilt

```
1  Seitenkopf          Brotkrume (12) · <h1> 24/600 + Textknöpfe · Kontextzeile (12, gedämpft)
2  FÜHRUNGSKARTE       genau eine, immer da, data-rolle="fuehrung", der einzige Primärknopf
3  Die Fläche der Rolle immer da:  BuFDi → die Woche · Koordination → „Die Woche der drei"
                                   Auftrag → „Eigene Aufträge"
4  Die übrigen Anlässe  als Zonen, in Rangfolge, jeweils mit Zahl in der Überschrift.
                        Ein leerer Anlass existiert nicht → eine leere Zone kann nicht entstehen.
5  Fuß                  Querverweise, Textlinks
```

**Drei Regeln, die den Aufbau vollständig festlegen** (sie sind der ganze Unterschied zu heute):

- **R1** — Die Führungskarte zeigt `anlaesse[0]`; ist die Liste leer, zeigt sie die Belegung
  **Ruhe**. Es gibt keinen dritten Fall.
- **R2** — Die Fläche der Rolle steht immer, auch leer; leer bedeutet **ein ausgeschriebener Satz**
  statt einer Tabelle (die Sätze existieren bereits: „Posteingang leer — alles verteilt",
  „Nichts eingeplant.").
- **R3** — Als Zonen erscheinen alle Anlässe ab Rang 2, **plus Rang 1 genau dann, wenn er mehr als
  eine Aufgabe trägt** — und ohne den Anlass, der bereits die Fläche der Rolle ist. Daraus folgt:
  bei `n = 1` nennt die Karte die Aufgabe und **keine Zone wiederholt sie**; bei `n > 1` nennt die
  Karte die Zahl und **keine Aufgabe ist bevorzugt**. Die Doppelung, an der der heutige Einstieg
  krankt, ist strukturell ausgeschlossen.

**Die Führungskarte ist der eine benannte Verstoß gegen „Leerzustand = die Zone weglassen".**
Begründung: sie ist keine Zone, sondern die Führung der Seite. „Nichts ist dringend" ist eine
Aussage, keine Leere — und für eine Koordinatorin ist es die wertvollste Aussage, die die Seite
treffen kann. Ließe man die Karte im Ruhefall weg, sprängen alle darunterliegenden Flächen um eine
Kartenhöhe nach oben, und der Ort, an dem man morgens hinsieht, wäre mal da und mal nicht.

**Wie die Karte laut wird, ohne Farbe zu verbrauchen.** Keine Tönung. Das Modul gibt Farbe bereits
für sechs Zustandstöne und drei Prioritätsgewichte aus; ein siebter Ton, der „hier ist die Führung"
bedeutet, wäre eine Bedeutung zu viel auf demselben Kanal. Die Karte ist stattdessen erkennbar an
**drei nicht-farbigen Merkmalen**: sie ist die einzige Fläche mit 24px Innenpolster (alle anderen
haben 12), sie trägt als einzige einen Kicker in Versalien plus eine Überschrift in
`SCHRIFT.unterTitel` (20/600 Display), und sie trägt als einzige einen Primärknopf. Raum,
Typografie, Position — Farbe wird gespart, wo sie fachlich gebraucht wird.

**Kontextzeile statt KPI-Zeile.** Spec §9.4 verlangt ohnehin eine Kontextzeile je Einstieg; sie
trägt ab jetzt die vier Zahlen, die heute vier Kacheln tragen — **einschließlich der Nullen**, die
sonst mit ihrer Zone verschwänden. Damit ist die KPI-Zeile keine zweite Antwort mehr auf dieselbe
Frage, sondern schlicht überflüssig.

---

### 3.1 BuFDi — „Meine Woche" (Alina, Montag 24.08., KW 35)

Alle Zahlen aus `pnpm seed:lokal aufgaben`, formatiert wie `fmtDauer`/`fmtStunden` es tun (nachlaufende
Nullen fallen weg: `fmtStunden(468) = "7,8"`, `fmtDauer(45) = "45 Min."`). Alinas Woche:
Mo 4,25 · Di 1 · Mi/Do/Fr je 0,25 Std. (Routine „Frühbesprechung", Mo–Fr 08:00, 15 Min.)
= **6 von 39 Std.**, 2 Aufgaben eingeplant.
Führender Anlass: **zurückgewiesen** (Rang 2) — „Fahrzeugcheck Rettungswagen 3", von Malte mit
„Bitte Reifendruck nachtragen." zurückgewiesen.

#### Desktop (≥ 768px, Inhaltsfläche ≈ 1040px)

```
┌──────────────────────────────────────────────────────────────────────────────────┐
│ Aufgaben                                                                      12 │
│ Meine Woche                                    ‹ KW 34    KW 35    KW 36 ›   24 │
│ KW 35 · 2 Aufgaben eingeplant · 6 von 39 Std. · nichts überfällig             12 │
└──────────────────────────────────────────────────────────────────────────────────┘
┌─ data-rolle="fuehrung" ─────────────────────────────── Card, padding 24 ────────┐
│ ZURÜCKGEWIESEN VON MALTE · VOR 2 TAGEN                       kicker 12/600/vers │
│ Fahrzeugcheck Rettungswagen 3                                   unterTitel 20/6 │
│ „Bitte Reifendruck nachtragen."                                        text 14 │
│ Zurückgewiesen  Mittel   Frist: Di, 25.08.   45 Min.   Di, 25.08. eingeplant    │
│                                                                                 │
│ [ Bearbeitung wieder aufnehmen ]   Aufgabe ansehen                              │
│   ^ der einzige Primärknopf der Seite       ^ Textknopf → /a/<id>              │
└─────────────────────────────────────────────────────────────────────────────────┘

Diese Woche                                                     <h2> unterTitel 20
┌ MO 24.08. ──────┬ DI 25.08. ──────┬ MI 26.08. ──┬ DO 27.08. ──┬ FR 28.08. ──┐
│ 4,25 / 7,8 Std. │ 1 / 7,8 Std.    │ 0,25 / 7,8  │ 0,25 / 7,8  │ 0,25 / 7,8  │
├─────────────────┼─────────────────┼─────────────┼─────────────┼─────────────┤
│ 08:00│↻ Früh-   │ 08:00│↻ Früh-   │ 08:00│↻ Früh│ 08:00│↻ Früh│ 08:00│↻ Früh│
│      │  bespr.  │      │  bespr.  │      │      │      │      │      │      │
│  ─   │ Standwache│  ─  │ Fahrzeug-│             │             │             │
│      │ Blutspende│     │ check RW3│ Nichts      │ Nichts      │ Nichts      │
│      │ -termin   │     │          │ eingeplant. │ eingeplant. │ eingeplant. │
│      │ Verteilt  │     │ Zurück-  │             │             │             │
│      │ Mittel    │     │ gewiesen │             │             │             │
│      │ 4 Std.    │     │ 45 Min.  │             │             │             │
│      │ Frist heute│    │ Frist:   │             │             │             │
│      │ [▲][▼] ⠿ │     │ Di,25.08.│             │             │             │
│      │           │     │ [▲][▼] ⠿│             │             │             │
└──────┴───────────┴─────┴──────────┴─────────────┴─────────────┴─────────────┘
   data-rolle="wochengitter"   ·  ⠿ = Ziehgriff  ·  ↻ = Routine, ohne Aktionen

Einzuplanen (2)                                                <section id="posteingang">
  Zeltlager-Inventar dokumentieren            Verteilt  Niedrig  Frist: Do, 27.08.
  1,5 Std. · Malte schlägt Do, 27.08., 09:00 vor
  [ Annehmen: Do, 27.08., 09:00 ]  [ Anders einplanen ]

  Fahrzeugerstausstattung fotografisch dokumentieren
                                              Verteilt  Mittel  Frist: Sa, 29.08.
  20 Min. · Nachweis: Bild
  [ Einplanen ]

Routinen verwalten  ·  Zeitplan von Bendix  ·  Zeitplan von Carla
```

Was hier **nicht** mehr steht: die vier KPI-Kacheln, die Zone „Freigabe offen" (Alina hat keine —
und wenn sie eine hätte, stünde sie als Zone „Freigabe offen (1)" zwischen Woche und Einzuplanen),
die Zone „Zurückgewiesen" (ihr einziger Fall ist die Führungskarte, R3).

#### 360px — eine eigene Form, nicht dieselbe schmaler

Die Grundform auf dem Telefon ist **ein Tag auf einmal**. Das Wochengitter ist nicht da (CSS,
`display: none`); an seiner Stelle steht eine echte Radiogruppe Mo–Fr und **eine** Tagesspalte.

```
┌──────────────────────────────────────┐
│ Aufgaben                             │
│ Meine Woche                          │
│ ‹ KW 34   KW 35   KW 36 ›            │
│ KW 35 · 2 Aufgaben · 6 von 39 Std. · │
│ nichts überfällig                    │
└──────────────────────────────────────┘
┌─ fuehrung ───────────── padding 24 ─┐
│ ZURÜCKGEWIESEN VON MALTE            │
│ VOR 2 TAGEN                         │
│ Fahrzeugcheck                       │
│ Rettungswagen 3            (h2, 20) │
│                                     │
│ „Bitte Reifendruck nachtragen."     │
│                                     │
│ Zurückgewiesen   Mittel             │
│ Frist: Di, 25.08.  ·  45 Min.       │
│                                     │
│ ┌─────────────────────────────────┐ │
│ │ Bearbeitung wieder aufnehmen    │ │  ← block, 44px
│ └─────────────────────────────────┘ │
│ ┌─────────────────────────────────┐ │
│ │ Aufgabe ansehen                 │ │  ← block, 44px, darunter
│ └─────────────────────────────────┘ │
└─────────────────────────────────────┘

Diese Woche
( Mo )( Di )( Mi )( Do )( Fr )   ← <fieldset>, echte Radios,
 ▔▔▔▔                              ein Tabstop, Pfeiltasten
                                   data-rolle="tagesliste"
┌ MONTAG, 24.08. ─────────────────────┐
│ 4,25 / 7,8 Std.                     │
│                                     │
│ 08:00 │ ↻ Frühbesprechung           │
│       │   15 Min.                   │
│ ───── │                             │
│   ─   │ Standwache Blutspendetermin │
│       │ Verteilt   Mittel           │
│       │ Frist heute · 4 Std.        │
│       │ [ ▲ ] [ ▼ ]                 │
└─────────────────────────────────────┘

Einzuplanen (2)
┌─────────────────────────────────────┐
│ Zeltlager-Inventar dokumentieren    │
│ Verteilt   Niedrig                  │
│ Frist: Do, 27.08. · 1,5 Std.        │
│ Malte schlägt Do, 27.08., 09:00 vor │
│ ┌─────────────────────────────────┐ │
│ │ Annehmen: Do, 27.08., 09:00     │ │
│ └─────────────────────────────────┘ │
│ ┌─────────────────────────────────┐ │
│ │ Anders einplanen                │ │
│ └─────────────────────────────────┘ │
└─────────────────────────────────────┘
  … (zweite Zeile analog)

Routinen verwalten
Zeitplan von Bendix
Zeitplan von Carla
```

Die **einzige** Medienabfrage bleibt `@media (max-width: 767.98px)` und bekommt genau drei neue
Zeilen (`.lageGitter`, `.fuehrung`-Knopfzeile, Fußlinks untereinander) — siehe §5.4. Beide
Ausprägungen der Woche rendern ins HTML; CSS blendet eine aus.

#### Was ein BuFDi um 7:30 sieht und was um 16:00

**Der Unterschied ist nicht die Uhrzeit, sondern was dazwischen passiert ist.** Der Selektor kennt
`heute` als ISO-Tag, keine Uhr — und das ist eine Entscheidung, keine Auslassung: die Seite rendert
serverseitig in einem Zug und aktualisiert sich nicht; eine Karte, die um 7:29 etwas anderes sagte
als um 7:31, müsste dafür einen Aktualisierungstakt haben, den dieses Modul bewusst nicht hat. Die
Karte rückt vor, weil Alina arbeitet — das ist die ehrlichere Kopplung, und sie ist die einzige,
die ohne Neuladen stimmt.

Alinas Montag, ein Durchlauf durch die Leiter:

| Zeitpunkt | Was geschehen ist | Sprosse | Die Karte sagt | Primäraktion |
|---|---|---|---|---|
| 7:30 | nichts | 2 zurückgewiesen | „Fahrzeugcheck Rettungswagen 3 — „Bitte Reifendruck nachtragen."" | Bearbeitung wieder aufnehmen |
| 8:05 | wieder aufgenommen → `in_arbeit` | 3 in Arbeit | „Fahrzeugcheck Rettungswagen 3 · 45 Min. · seit heute in Bearbeitung" | Fertig melden |
| 9:10 | fertig gemeldet → `freigabe_offen` (Prüfer Malte); verlässt Alinas Leiter | 4 heute | „Als Nächstes heute: Standwache Blutspendetermin · 4 Std. · Frist heute" | Bearbeitung starten |
| 9:15–15:40 | Standwache in Arbeit | 3 in Arbeit | „Standwache Blutspendetermin · 4 Std." | Fertig melden |
| 16:00 | Standwache abgeschlossen; heute liegt nichts mehr | 5 einzuplanen | „2 Aufgaben warten auf einen Termin — die früheste Frist ist Do, 27.08." | Einplanen |
| 16:20 | beide eingeplant | Ruhe | „Für heute ist nichts mehr offen. Morgen: Fahrzeugcheck Rettungswagen 3 · 45 Min." | Woche planen |

Hätte Alina um 16:00 **nichts** getan, stünde dieselbe Karte wie um 7:30. Das ist richtig so: die
Karte ist keine Uhr, sie ist ein Stand.

Zwei Feinheiten, die dabei tragen:
- **Routinen sind nie die Führung.** Sie haben laut Spec §6 keinen Status, keinen Nachweis und keine
  Aktion — eine Karte „Als Nächstes: Frühbesprechung" hätte keinen Knopf. Sie erscheinen in der
  Tagesspalte, nicht in der Leiter.
- **„Als Nächstes heute" ist der erste *Aufgaben*-Eintrag aus `tagesOrdnung`**, nicht der erste
  Eintrag überhaupt — dieselbe Funktion, die auch die Spalte ordnet, damit Karte und Spalte nicht
  auseinanderlaufen können.

---

### 3.2 Koordination — „Verteilung" (Rike, Montag 24.08.)

Rikes Lage im Seed: **1** Aufgabe `eingegangen` („Verbandskästen im Fahrzeugpark prüfen", von
Malte, Frist Do 03.09.) · **1** Freigabe in Vertretung (Erste-Hilfe-Kurs Nachbereitung, Prüfer ist
Tomke) · **1** überfällig („Sanitätswache Stadtfest vorbereiten", bei Bendix, seit 3 Tagen) · **1**
zurückgewiesen (Fahrzeugcheck RW 3, bei Alina).

Führender Anlass: **Posteingang** (Rang 2; Rang 1 „überfällig **und** unverteilt" ist leer).

**Ihre Fläche der Rolle ist nicht der Posteingang, sondern „Die Woche der drei".** Das ist der
Kern der Umstellung: die Posteingang-Tabelle steht auf `/verteilen`, wo sie hingehört; auf dem
Einstieg steht, was Rike **sonst nirgends** sieht und für jede Verteilentscheidung braucht — wer wie
voll ist. Diese Zahlen existieren heute nur **innerhalb des Verteilen-Dialogs**
(`wochenAuslastungFuerBufdis`), also erst, wenn die Entscheidung schon halb gefallen ist.

**Es entsteht dabei keine zweite Rechnung.** `wochenAuslastungFuerBufdis(db, bufdis, tage)` summiert
`tagesBudget` über die fünf Tage — **Routinen eingeschlossen** (nachgeprüft, `queries.ts:111–124`).
Das ist die inhaltlich richtige Zahl und keine Selbstverständlichkeit: Carlas
„Nachtbereitschaft-Übergabe" (3 × 20 Min.) und Alinas „Frühbesprechung" (5 × 15 Min.) sind belegte
Zeit, und eine Auslastung, die sie unterschlüge, böte Rike Kapazität an, die es nicht gibt. Die
Zahlen oben (Alina 6 · Bendix 11,67 · Carla 3,5 Std.) sind mit Routinen gerechnet.

#### Desktop

```
┌──────────────────────────────────────────────────────────────────────────────────┐
│ Aufgaben                                                                         │
│ Verteilung                                              Aufgabe einstellen       │
│ 1 zu verteilen · 1 wartet auf Freigabe (in Vertretung) · 1 überfällig ·          │
│ 1 zurückgewiesen                                                                 │
└──────────────────────────────────────────────────────────────────────────────────┘
┌─ data-rolle="fuehrung" ──────────────────────────────── padding 24 ─────────────┐
│ POSTEINGANG · LIEGT SEIT 2 TAGEN                                                │
│ Verbandskästen im Fahrzeugpark prüfen                                           │
│ Bestand und Verfallsdaten in allen Einsatzfahrzeugen kontrollieren.             │
│ Zu verteilen  Mittel   Von Malte   Frist: Do, 03.09.   1 Std.   ohne Nachweis│
│                                                                                 │
│ [ Verteilen ]   Alle im Posteingang                                             │
│   ^ Client-Insel: derselbe VerteilenModal wie auf /verteilen                     │
└─────────────────────────────────────────────────────────────────────────────────┘

Die Woche der drei                                            KW 35 · Mo–Fr
┌ ALINA ───────────────┬ BENDIX ──────────────┬ CARLA ───────────────┐
│   6 / 39 Std.        │ 11,67 / 39 Std.      │  3,5 / 39 Std.       │
│  2 Aufgaben          │  3 Aufgaben          │  2 Aufgaben          │
│                      │ ▌ Mo überbucht:      │                      │
│  kein Tag überbucht  │ ▌ 9,17 / 7,8 Std.    │  kein Tag überbucht  │
│                      │                      │                      │
│  Zeitplan ansehen    │  Zeitplan ansehen    │  Zeitplan ansehen    │
└──────────────────────┴──────────────────────┴──────────────────────┘
   .lageGitter — auto-fit, kein Breakpoint nötig

Freigabe offen (1)                                            Alle Freigaben ›
  Erste-Hilfe-Kurs Nachbereitung        Freigabe offen  Mittel  Frist: Mi, 26.08.
  Carla · in Vertretung für Tomke · Nachweis (Text) liegt vor

Überfällig (1)
▌ Sanitätswache Stadtfest vorbereiten   In Bearbeitung  Hoch
▌ Bendix · Überfällig seit 3 Tagen · 3 Std.
  [ Umverteilen ]   Zeitplan von Bendix

Zurückgewiesen (1)
  Fahrzeugcheck Rettungswagen 3         Zurückgewiesen  Mittel  Frist: Di, 25.08.
  Alina · „Bitte Reifendruck nachtragen." · seit 2 Tagen

Personenverwaltung  ·  Archiv
```

Die Zone „Überfällig" ist der Ort, an dem **`umverteilenAction` endlich einen Weg in die Oberfläche
bekommt** — siehe §8, Prüffrage 1.

#### 360px

```
┌──────────────────────────────────────┐
│ Aufgaben                             │
│ Verteilung                           │
│ Aufgabe einstellen                   │  ← Textknopf rutscht unter <h1>
│ 1 zu verteilen · 1 wartet auf        │
│ Freigabe (in Vertretung) ·           │
│ 1 überfällig · 1 zurückgewiesen      │
└──────────────────────────────────────┘
┌─ fuehrung ───────────── padding 24 ─┐
│ POSTEINGANG · LIEGT SEIT 2 TAGEN    │
│ Verbandskästen im                   │
│ Fahrzeugpark prüfen        (h2, 20) │
│                                     │
│ Bestand und Verfallsdaten in allen  │
│ Einsatzfahrzeugen kontrollieren.    │
│                                     │
│ Zu verteilen   Mittel               │
│ Von Malte · Frist: Do, 03.09.       │
│ 1 Std. · ohne Nachweis           │
│                                     │
│ ┌─────────────────────────────────┐ │
│ │ Verteilen                       │ │
│ └─────────────────────────────────┘ │
│ ┌─────────────────────────────────┐ │
│ │ Alle im Posteingang             │ │
│ └─────────────────────────────────┘ │
└─────────────────────────────────────┘

Die Woche der drei · KW 35
┌─────────────────────────────────────┐
│ ALINA             6 / 39 Std.       │
│ 2 Aufgaben · kein Tag überbucht     │
│ Zeitplan ansehen                    │
├─────────────────────────────────────┤
│ BENDIX        11,67 / 39 Std.       │
│ 3 Aufgaben                          │
│ ▌ Mo überbucht: 9,17 / 7,8 Std.     │
│ Zeitplan ansehen                    │
├─────────────────────────────────────┤
│ CARLA           3,5 / 39 Std.       │
│ 2 Aufgaben · kein Tag überbucht     │
│ Zeitplan ansehen                    │
└─────────────────────────────────────┘

Freigabe offen (1)          Alle Freigaben ›
┌─────────────────────────────────────┐
│ Erste-Hilfe-Kurs Nachbereitung      │
│ Freigabe offen   Mittel             │
│ Frist: Mi, 26.08.                   │
│ Carla · in Vertretung für Tomke     │
│ Nachweis (Text) liegt vor           │
└─────────────────────────────────────┘

Überfällig (1)
┌─────────────────────────────────────┐
│ Sanitätswache Stadtfest vorbereiten │
│ In Bearbeitung   Hoch               │
│ ▌ Überfällig seit 3 Tagen           │
│ Bendix · 3 Std.                  │
│ ┌─────────────────────────────────┐ │
│ │ Umverteilen                     │ │
│ └─────────────────────────────────┘ │
└─────────────────────────────────────┘

Zurückgewiesen (1)  …

Personenverwaltung
Archiv
```

Auf 360px ist „Die Woche der drei" **eine Zeile je Person**, nicht drei schmale Spalten — und das
kostet **keine** Medienabfrage: `grid-template-columns: repeat(auto-fit, minmax(min(180px, 100%),
1fr))` liefert bei 360px eine Spalte, dieselbe Formel, die `.wochenGitter` schon benutzt.

---

### 3.3 Auftraggeber — „Meine Aufträge" (Malte, Montag 24.08.)

Maltes Lage im Seed: er ist Prüfer für vier Aufgaben; `freigabe_offen` ist bei ihm keine — die eine
offene Freigabe („Erste-Hilfe-Kurs Nachbereitung") hat **Tomke** als Prüfer. Malte hat: **1**
überfällig unter seinen Aufträgen? Nein — „Sanitätswache Stadtfest vorbereiten" ist von **Tomke**.
Maltes eigener Bestand: „Verbandskästen" (`eingegangen`, seit 2 Tagen), „Zeltlager-Inventar"
(verteilt), „Fahrzeugerstausstattung" (verteilt), „Fahrzeugcheck RW 3" (zurückgewiesen),
„Standwache" (verteilt), „Materialtransport" + „Nachbereitung" (verteilt), „Depotbestand"
(abgeschlossen).

Führender Anlass: **Rang 3 — liegt im Posteingang**. Das ist genau die Auskunft, für die dieses
Modul gebaut wurde: Malte sieht, dass sein Auftrag liegt, **und findet keinen Weg, ihn selbst zu
verteilen.**

#### Desktop

```
┌──────────────────────────────────────────────────────────────────────────────────┐
│ Aufgaben                                                                         │
│ Meine Aufträge                                          Aufgabe einstellen       │
│ 8 Aufträge · 7 offen · 1 unverteilt · nichts wartet auf deine Freigabe           │
└──────────────────────────────────────────────────────────────────────────────────┘
┌─ data-rolle="fuehrung" ──────────────────────────────── padding 24 ─────────────┐
│ NOCH NICHT VERTEILT · SEIT 2 TAGEN                                              │
│ Verbandskästen im Fahrzeugpark prüfen                                           │
│ Rike hat den Auftrag noch niemandem zugewiesen.                                 │
│ Zu verteilen  Mittel   Frist: Do, 03.09.   1 Std.                               │
│                                                                                 │
│  Aufgabe ansehen     Zurückziehen                                               │
│  ^ Textknopf → /a/<id>   ^ Textknopf + Popconfirm                               │
│                                                                                 │
│  KEIN PRIMÄRKNOPF — Malte hat für diesen Zustand keine Zustandsaktion, und      │
│  das ist die Auskunft: verteilen darf hier nur die Koordination.                │
└─────────────────────────────────────────────────────────────────────────────────┘

Eigene Aufträge (8)                                          Archiv ansehen ›
  Verbandskästen im Fahrzeugpark prüfen  Zu verteilen  Mittel  Frist: Do, 03.09.
  1 Std. · Noch nicht verteilt

  Fahrzeugcheck Rettungswagen 3          Zurückgewiesen Mittel  Frist: Di, 25.08.
  45 Min. · Empfänger: Alina · „Bitte Reifendruck nachtragen."

  Standwache Blutspendetermin            Verteilt      Mittel  Frist heute
  4 Std. · Empfänger: Alina

  Materialtransport Kreisverband         Verteilt      Mittel  Frist heute
  5 Std. · Empfänger: Bendix
  … (vier weitere)

Personenverwaltung entfällt · Archiv
```

Zone „Freigabe offen" fehlt, weil Malte keine hat. Hätte er eine, wäre sie **Rang 1** und damit die
Führungskarte:

```
┌─ fuehrung ──────────────────────────────────────────────────────────────────────┐
│ WARTET AUF DEINE FREIGABE · SEIT GESTERN                                        │
│ Erste-Hilfe-Kurs Nachbereitung                                                  │
│ Carla hat fertig gemeldet. Nachweis (Text) liegt vor:                           │
│ „Kurs durchgeführt, 8 Teilnehmende, Feedback positiv."                          │
│ Freigabe offen  Mittel   Frist: Mi, 26.08.   2 Std.                          │
│                                                                                 │
│ [ Freigeben ]   Zurückweisen   Nachweis und Verlauf ansehen                     │
│                 ^ öffnet das Modal mit Pflicht-Begründung (useActionState)      │
└─────────────────────────────────────────────────────────────────────────────────┘
```

#### 360px

```
┌──────────────────────────────────────┐
│ Aufgaben                             │
│ Meine Aufträge                       │
│ Aufgabe einstellen                   │
│ 8 Aufträge · 7 offen · 1 unverteilt  │
│ · nichts wartet auf deine Freigabe   │
└──────────────────────────────────────┘
┌─ fuehrung ───────────── padding 24 ─┐
│ NOCH NICHT VERTEILT · SEIT 2 TAGEN  │
│ Verbandskästen im                   │
│ Fahrzeugpark prüfen        (h2, 20) │
│                                     │
│ Rike hat den Auftrag noch niemandem │
│ zugewiesen.                         │
│                                     │
│ Zu verteilen   Mittel               │
│ Frist: Do, 03.09. · 1 Std.          │
│                                     │
│ ┌─────────────────────────────────┐ │
│ │ Aufgabe ansehen                 │ │  ← Standardknopf
│ └─────────────────────────────────┘ │
│ ┌─────────────────────────────────┐ │
│ │ Zurückziehen                    │ │  ← Standardknopf + Popconfirm
│ └─────────────────────────────────┘ │
│                                     │
│ kein Primärknopf — es gibt für      │
│ Malte hier keine Zustandsaktion     │
└─────────────────────────────────────┘

Eigene Aufträge (8)
┌─────────────────────────────────────┐
│ Verbandskästen im Fahrzeugpark      │
│ prüfen                              │
│ Zu verteilen   Mittel               │
│ Frist: Do, 03.09. · 1 Std.       │
│ Noch nicht verteilt                 │
├─────────────────────────────────────┤
│ Fahrzeugcheck Rettungswagen 3       │
│ Zurückgewiesen   Mittel             │
│ Frist: Di, 25.08. · 45 Min.       │
│ Empfänger: Alina                    │
│ „Bitte Reifendruck nachtragen."     │
├─────────────────────────────────────┤
│ …                                   │
└─────────────────────────────────────┘

Archiv
```

**Die Zeilenform auf 360px ist eine andere als auf dem Desktop, nicht dieselbe umgebrochen:** auf
dem Desktop steht die Zeile in zwei Zeilen (Titel + Chips oben, Meta unten), auf 360px in vier
Blöcken mit Trennlinie dazwischen — eine Karte je Auftrag, damit die Chips nicht zwischen Titel und
Frist eingekeilt umbrechen. Beide Ausprägungen kommen aus **einer** Komponente
(`_ui/AufgabenZeile.tsx`); nur die Anordnung ist Flex mit `flex-wrap` und einem einzigen
`flex-direction: column` in der bestehenden Medienabfrage.

---

## 4. Der Zustands-Selektor

### 4.1 Bauform

`_lib/lage.ts` — ohne `"use client"`, ohne Datenbankschreibzugriff, rein und erschöpfend testbar.
Vorbild ist `feedback/_lib/cockpit.ts`; die vier Bauregeln von dort gelten hier wörtlich:

1. **Eine Stelle entscheidet, was die Seite zeigt.** Nicht die JSX.
2. **Nichts wird geschrieben.** „Überfällig" wird gerechnet (`istUeberfaellig`), nicht persistiert.
3. **Der führende Anlass ist ein Ausdruck ohne Auffangzweig:** `anlaesse[0] ?? RUHE`. Ein zweiter
   Rückgabeweg existiert nicht, also ist Totalität strukturell und nicht erhofft.
4. **Die Leiter partitioniert.** Jede Aufgabe fällt in **genau eine** Sprosse — die erste, die
   passt. Ohne diese Regel zählte eine überfällige, in Arbeit befindliche Aufgabe zweimal, und die
   Zahlen in Karte, Zone und Kontextzeile liefen auseinander.

```ts
export type AnlassArt =
  | "ueberfaellig_unverteilt" | "ueberfaellig" | "zurueckgewiesen" | "in_arbeit"
  | "heute" | "freigabe" | "verteilen" | "einplanen" | "liegt_unverteilt" | "ruhe";

export interface Anlass {
  art: AnlassArt;
  /** nach Frist, dann Priorität, dann erstelltAm, dann id — eine TOTALE Ordnung. */
  aufgaben: readonly AufgabeRow[];
  /** genau dann gesetzt, wenn `aufgaben.length === 1`. */
  eine: AufgabeRow | null;
}

export interface Lage {
  ansicht: "koordination" | "bufdi" | "auftrag";
  fuehrung: Anlass;              // = anlaesse[0] ?? RUHE
  zonen: readonly Anlass[];      // Regel R3 aus §3.0
  kontext: string;               // die Kontextzeile, inkl. der Nullen
}

export function lage(db: DB, akteur: Akteur, heute: string, tage: readonly string[]): Lage;
```

Die **Beschriftung** der Anlässe liegt nicht hier, sondern als `ANLASS_TEXT: Record<AnlassArt,
string>` in `_lib/anzeige.ts` — in derselben Reihe wie `STATUS_TEXT`, `PRIORITAET_TEXT`,
`ROLLE_TEXT` und `EREIGNIS_TEXT`. Der Selektor entscheidet, **welcher** Anlass führt; die
Beschriftungsdatei entscheidet, **wie er heißt**. Zwei Gründe, und beide sind belegbar: die
Zonenüberschriften stünden sonst in drei Einstiegen dreimal (heute genau der Zustand), und der
Quelltext-Scan aus §5.3 verbietet das Wort „überfällig" in `.tsx` — eine Überschrift „Überfällig (1)"
im JSX wäre ein Verstoß gegen den eigenen Riegel.

`ansicht` wird **genauso** bestimmt wie in `page.tsx` heute:
`akteur.istKoordination ? "koordination" : akteur.person.rolle`. Damit kann die Leiter nicht von der
gerenderten Komponente abweichen. Der theoretisch mögliche Fall „`bufdi` **und** Koordinationsgruppe"
fällt auf `koordination` — eine Zeile, benannt, weil sie sonst beim nächsten Lesen als Fehler
gemeldet wird: die Verteilsicht ist die weitere, und `verteilDaten` speist sich ohnehin aus
`bufdis()`, in denen die Koordination nicht stehen soll (Spec §4, Nachtrag).

### 4.2 Was die Karte in jedem Fall zeigt

Durchgehend gilt:
- **`n = 1`** → die Karte nennt **die Aufgabe** (Titel als `<h2>`, plus Chips und `<Frist>`), und
  **keine Zone wiederholt sie**.
- **`n > 1`** → die Karte nennt **die Zahl** und den Ältesten/Dringlichsten als Datum, **keine
  Aufgabe ist bevorzugt**, und die Zone darunter listet alle `n`.
- Die Primäraktion ist **immer** die Zustandsaktion — und **nur** sie. Formulare mit Eingabefeld
  stehen **nie** in der Karte; sie führt dann auf die Fläche, die den Feldfehler am Feld anzeigen
  kann (§8, Prüffrage 5).
- **Gibt es keine Zustandsaktion, gibt es keinen Primärknopf** — und das ist die Auskunft, nicht
  eine Lücke. „Genau ein Primärknopf pro Seite, und der ist die Zustandsaktion" liest dieser Entwurf
  als *höchstens* einen: wo diese Person mit dieser Aufgabe in diesem Zustand nichts tun **darf**,
  wäre ein roter Knopf eine Behauptung. Die Karte trägt dann nur Textknöpfe. Betroffen sind genau
  zwei Sprossen — Auftraggeber Rang 2 und 3 —, und dort ist die Abwesenheit des Knopfes die
  eigentliche Botschaft (siehe unten).

#### Koordination

| Rang | Fall | Inhalt der Karte | Primäraktion | Sekundär |
|---|---|---|---|---|
| 1 | `eingegangen` **und** `istUeberfaellig` | n=1: Titel · „Überfällig seit N Tagen" · Auftraggeber · Priorität. n>1: „N Aufgaben sind überfällig und noch niemandem zugewiesen — die älteste seit M Tagen." | **Verteilen** (n=1: Modal in der Karte; n>1: → `/verteilen`) | Alle im Posteingang |
| 2 | `eingegangen`, Frist offen | n=1: Titel · Beschreibung · Auftraggeber · Frist · Dauer · Nachweispflicht. n>1: „N Aufgaben warten auf Verteilung — die älteste liegt seit M Tagen." | **Verteilen** | Alle im Posteingang → `/verteilen` |
| 3 | `freigabe_offen`, `darfFreigeben` | n=1: „X hat „Titel" fertig gemeldet." + Nachweis-Kurzform + ggf. „in Vertretung für Y". n>1: „N Aufgaben warten auf Freigabe (M in Vertretung)." | n=1: **Freigeben**; n>1: **Freigaben ansehen** → `/freigaben` | Zurückweisen (Modal) · Nachweis ansehen |
| 4 | `istUeberfaellig`, bereits zugewiesen | n=1: Titel · „Überfällig seit N Tagen" · „bei X, In Bearbeitung". n>1: „N Aufgaben sind überfällig." | **Umverteilen** (Modal in der Karte) | Zeitplan von X |
| 5 | `zurueckgewiesen` | n=1: Titel · die Begründung **wörtlich** · „bei X seit N Tagen". n>1: „N Aufgaben wurden zurückgewiesen." | **Aufgabe ansehen** → `/a/<id>` | Zeitplan von X |
| — | sonst | **Ruhe:** „Nichts liegt an: Posteingang leer, keine Freigabe offen, nichts überfällig." | **Aufgabe einstellen** → `/neu` | Archiv |

#### BuFDi

| Rang | Fall | Inhalt der Karte | Primäraktion | Sekundär |
|---|---|---|---|---|
| 1 | mir zugewiesen **und** `istUeberfaellig` | n=1: Titel · „Überfällig seit N Tagen" · Dauer · Priorität. n>1: „N Aufgaben sind überfällig — die älteste seit M Tagen." | die Zustandsaktion aus `aktionsOptionen`: `verteilt` → **Bearbeitung starten** · `in_arbeit` → **Fertig melden** · `zurueckgewiesen` → **Bearbeitung wieder aufnehmen** | Auf heute legen · Ansehen |
| 2 | `zurueckgewiesen` | n=1: Titel · **die Begründung wörtlich** (das ist der ganze Wert einer Zurückweisung) · Prüfer · Datum. n>1: „N Aufgaben kamen zurück." | **Bearbeitung wieder aufnehmen** | Aufgabe ansehen |
| 3 | `in_arbeit` | Titel · Dauer · „seit <Tag> in Bearbeitung" | ohne Nachweispflicht: **Fertig melden**; mit Nachweispflicht: **Nachweis hinterlegen und fertig melden** → `/a/<id>` | Auf morgen schieben · Zurücksetzen |
| 4 | `heuteOffen` und `verteilt` | „Als Nächstes heute:" + der erste **Aufgaben**-Eintrag aus `tagesOrdnung` · Dauer · Priorität · Frist | **Bearbeitung starten** | Anders einplanen → `/plan/<eigene>#einplanen-<id>` |
| 5 | `wartetAufEinplanung` | n=1 mit Vorschlag: „X schlägt Do, 27.08., 09:00 vor für „Titel"." n=1 ohne Vorschlag: Titel · Frist · Dauer. n>1: „N Aufgaben warten auf einen Termin — die früheste Frist ist …" | n=1 mit Vorschlag: **Annehmen: Do, 27.08., 09:00**; sonst **Einplanen** (→ `#posteingang` bzw. `/plan/<eigene>`) | Anders einplanen |
| — | sonst | **Ruhe:** „Für heute ist nichts mehr offen." + wenn morgen etwas liegt: „Morgen: <Titel> · <Dauer>."; sonst „Diese Woche ist alles eingeplant." | **Woche planen** → `/plan/<eigene>` | Routinen verwalten |

#### Auftraggeber

| Rang | Fall | Inhalt der Karte | Primäraktion | Sekundär |
|---|---|---|---|---|
| 1 | `freigabe_offen`, ich bin Prüfer | n=1: „X hat „Titel" fertig gemeldet." + Nachweistext bzw. „Bildnachweis liegt vor". n>1: „N Aufgaben warten auf deine Freigabe." | n=1: **Freigeben**; n>1: **Freigaben ansehen** → `/freigaben` | Zurückweisen (Modal) · Nachweis und Verlauf ansehen |
| 2 | meine Aufträge, `istUeberfaellig` | n=1: Titel · „Überfällig seit N Tagen" · „bei X, In Bearbeitung". n>1: „N deiner Aufträge sind überfällig." | **kein Primärknopf** | Aufgabe ansehen · Zeitplan von X |
| 3 | meine Aufträge, `eingegangen` | n=1: Titel · Beschreibung · „Rike hat den Auftrag noch niemandem zugewiesen." · Frist. n>1: „N deiner Aufträge sind noch nicht verteilt." | **kein Primärknopf** | Aufgabe ansehen · Zurückziehen (Popconfirm) |
| — | sonst | **Ruhe:** „Alle deine Aufträge laufen, nichts wartet auf dich." | **Aufgabe einstellen** → `/neu` | Archiv |

**Rang 2 und 3 des Auftraggebers tragen keinen Primärknopf, und das ist eine Entscheidung, keine
Auslassung.** Malte darf mit einem überfälligen Auftrag bei Bendix nichts tun — die
Übergangstabelle kennt für ihn dort keine Aktion. Ein `type="primary"`-Knopf „Aufgabe ansehen" wäre
ein roter Knopf ohne Zustandswechsel und damit genau die Verwechslung, gegen die die Regel
geschrieben ist. Für Rang 3 wäre `Zurückziehen` zwar eine echte Aktion der Tabelle
(`eingegangen` → gelöscht, Ersteller darf), aber eine **destruktive** — und ein destruktiver Knopf
als Primäraktion einer Führungskarte lädt zum Wegdrücken einer Aufgabe ein, die nur auf Verteilung
wartet. Er bleibt sekundär, mit `Popconfirm`.

**Was bleibt, ist die Auskunft — und sie ist die Kernzusage aus Spec §8.3 in Bildform.** Malte
erfährt, dass sein Auftrag liegt, sieht den Verlauf einen Klick entfernt, und findet **keinen
Hebel, ihn selbst zu verteilen**. Genau das war die Beschwerde, aus der das Modul entstand.

### 4.3 Zehn Dinge gleich dringend

Zwei getrennte Fragen, und beide sind beantwortet:

**Die Auswahl.** Die Sortierung innerhalb einer Sprosse ist eine **totale Ordnung**:
`faelligAm` aufsteigend → `prioritaet` (hoch < mittel < niedrig) → `erstelltAm` aufsteigend → `id`.
Zwei Aufgaben können danach nicht gleichrangig sein; ein „unentschieden" existiert nicht, und die
Karte muss nie raten. (`.get()`-Stil-Zufall wie in `feedback`s `activeSurveyForGroup` ist damit
strukturell ausgeschlossen.)

**Die Darstellung.** Bei `n > 1` **zeigt die Karte trotzdem keine einzelne Aufgabe.** Sie zeigt die
Zahl, das Extrem („die älteste seit 6 Tagen") und einen Knopf auf die Fläche, die `n` verarbeitet.
Grund: eine Karte, die aus zehn gleich dringenden Dingen eines herausgreift, behauptet eine
Reihenfolge, die die Person nicht getroffen hat — und verdeckt neun. Die Zahl behauptet nichts.

### 4.4 Zehn Aufgaben am Stück verteilen

Hier zahlt sich die Entscheidung aus §2.1 aus: `/verteilen` **ist** der Stapelplatz.

Die Führungskarte auf `/` sagt „10 Aufgaben warten auf Verteilung — die älteste liegt seit 6 Tagen"
und der Primärknopf führt dorthin. Auf `/verteilen` gilt:

- Die Tabelle ist nach **Frist aufsteigend, dann Priorität** sortiert (heute: Einfügereihenfolge).
  Überfälliges steht damit oben, ohne dass irgendwo eine zweite Sortierregel entsteht.
- Ein Klick auf „Verteilen" öffnet das Modal, ein Klick auf „Verteilen" im Modal schließt es und die
  Zeile verschwindet — drei Antippen je Aufgabe, und die Zeilen darüber bleiben stehen, die
  Scrollposition also auch. Das ist der bestehende Ablauf; er ist gut, er war nur nicht als
  Stapelweg benannt.
- Das Modal zeigt die **Wochenauslastung aller drei** und rechnet sie nach jeder Verteilung neu —
  das ist der eigentliche Grund, warum Stapelarbeit hier sequenziell sein muss (siehe §7).

**Ausdrücklich nicht gebaut: Mehrfachauswahl mit Kontrollkästchen und „an Alina verteilen".**
Begründung in §7.

---

## 5. Die eine Darstellung für Dringlichkeit

### 5.1 Der Befund

`istUeberfaellig(a, heute)` ist bereits **eine** Funktion (`_lib/anzeige.ts:165`) — die Bedingung
ist nicht das Problem. Die **Darstellung** ist es, in vier Ausprägungen:

| Ort | heute |
|---|---|
| `AufgabenListe.tsx` | nacktes `<span>` ohne Klasse: Warnzeichen + „Überfällig" |
| `FreigabeZone.tsx` | byte-identisch dasselbe, an anderer Stelle der Zeile |
| `VerteilenDialog.tsx` | `" · überfällig"` — **klein**, kein Zeichen, Suffix hinter dem Datum |
| `EinstiegKoordination.tsx` | KPI-Kachel mit `ton="achtung"` — die **einzige** Stelle mit Farbe |
| `Wochenplan.tsx` | **gar nicht** — auf dem Bildschirm für „was tue ich heute" |

### 5.2 Die eine Form: `_ui/Frist.tsx`

Eine Server-Komponente, drei Ausprägungen, sonst nichts:

```tsx
<Frist faelligAm={a.faelligAm} status={a.status} heute={heute} />
```

| Lage | Ausgabe | Form |
|---|---|---|
| `istUeberfaellig` | „⚠ Überfällig seit 3 Tagen" (Singular: „seit 1 Tag") | `.fristUeberfaellig` |
| `faelligAm === heute`, nicht abgeschlossen | „Frist heute" | `.fristHeute` (600, Tinte) |
| sonst | „Frist: Do, 27.08." | `.frist` (SCHRIFT.neben, `--auf-stahl`) |

**Die vier Kanäle, Farbe zuletzt:**

1. **Wort** — „Überfällig seit N Tagen", ausgeschrieben, **immer mit der Zahl**. Nie ein nacktes
   „Überfällig" (das sagt nicht, ob es gestern oder im Mai war), nie ein kleingeschriebenes Suffix,
   nie nur ein Datum. Die Zahl ist der einzige Kanal, der auch in einer Screenreader-Ausgabe die
   *Schwere* trägt.
2. **Form** — `border-inline-start: 3px` + `padding-inline-start: 8px`. Dieselbe Form, die
   `.budgetUeberbucht` schon für die überbuchte Tagesspalte benutzt. Das ist Absicht: die Form
   heißt „hier stimmt eine Zahl nicht", das **Wort** sagt, welche. Zwei Formen für zwei Arten von
   „zu viel" wären eine Formsprache zu viel.
3. **Position** — Überfälliges steht **oben**: in `_lib/lage.ts` ist es Rang 1 (BuFDi, Koordination)
   bzw. Rang 2 (Auftrag); in jeder Liste sortiert `faelligAm` aufsteigend; in der
   Verteilen-Tabelle ebenso. **Eine Ausnahme, benannt:** in der Tagesspalte des Wochenplans wird
   *nicht* umsortiert — dort ordnet `plan_rang`, und das ist die Reihenfolge, die die Person selbst
   gewählt hat. Eine zweite, automatische Ordnung darüber wäre ein Eingriff in ihre Planung.
4. **Farbe** — `--auf-achtung-text` (`#8c0d16` hell / `#f0a39c` dunkel), auf der Kante und auf dem
   Wort. **Nie eine Fläche.** Insbesondere **nicht** `--auf-achtung-flaeche`: die ist die Fläche des
   `zurueckgewiesen`-Chips, und ein überfälliges Etwas, das aussieht wie ein zurückgewiesenes
   Etwas, ist schlimmer als gar keine Farbe. Und **nie** Suite-Rot `#c8000f` — es ist im
   Modul-CSS ohnehin per Test verboten.

Das Warnzeichen (`<Ikone name="warnung" />`) bleibt als fünftes, **nicht zählendes** Element: es ist
`aria-hidden` und trägt keine eigene Aussage, es macht die Zeile nur auffindbar.

### 5.3 Wie die Einheitlichkeit erzwungen wird

Zwei Riegel, weil einer allein nicht trägt:

- **`Frist.test.tsx`** prüft die drei Ausprägungen und die Singular-/Pluralgrenze bei einem Tag.
- **Ein Quelltext-Scan** in derselben Datei, nach dem Muster der vier modulweiten Verbote in
  `SeitenKopf.test.tsx` und mit demselben Helfer `testQuellscan.ts`: **das Wort „überfällig" (in
  jeder Groß-/Kleinschreibung) darf in `src/app/m/aufgaben/**/*.tsx` nur in `Frist.tsx` vorkommen.**
  Das fängt exakt die drei divergierenden Fassungen, die es heute gibt, und man kann es nicht
  versehentlich umgehen — wer eine vierte baut, schreibt das Wort. (Was der Scan *nicht* kann:
  eine Fassung fangen, die nur die Kante ohne Wort setzt. Genannt, nicht verschwiegen.)

  **Der Scan schlüge sonst gegen den eigenen Entwurf aus**, und das ist der Grund für die eine
  Ergänzung daneben: die Zonenüberschrift heißt „Überfällig (1)", und heute steht in
  `EinstiegKoordination.tsx` „Überfällige Aufgaben" bzw. „Keine überfälligen Aufgaben" — alles
  `.tsx`. Die Zonentitel wandern deshalb nach `_lib/anzeige.ts` als
  `ANLASS_TEXT: Record<AnlassArt, string>`, genau in die Reihe von `STATUS_TEXT`, `PRIORITAET_TEXT`
  und `EREIGNIS_TEXT`. Das ist eine `.ts`-Datei, der `.tsx`-Scan bleibt also sauber — und die
  Überschriften stehen an **einer** Stelle statt verstreut in drei Einstiegen. Die Scanregel lautet
  vollständig: **„überfällig" in `.tsx` nur in `Frist.tsx`; die Zonentitel kommen aus
  `ANLASS_TEXT`.**

Damit sind es **fünf** Aufrufstellen mit derselben Ausgabe: `AufgabenZeile` (und darüber jede
Liste), `FreigabeZone`, `VerteilenTabelle`, **`Wochenplan`** (die heutige Lücke) und
`a/[id]/page.tsx`s Metablock. `/archiv` benutzt dieselbe Komponente und zeigt dort nie
„überfällig" — weil `istUeberfaellig` `abgeschlossen` ausschließt. Dass derselbe Aufruf dort
schweigt, ist der Beleg, dass die Bedingung nur an einer Stelle steht.

### 5.4 Was das CSS bekommt

Neu in `aufgaben.module.css`, alles im Basisblock (die **eine** Medienabfrage bleibt eine):

```css
.frist            { white-space: nowrap; }
.fristHeute       { font-weight: 600; color: var(--auf-tinte); white-space: nowrap; }
.fristUeberfaellig{ border-inline-start: 3px solid var(--auf-achtung-text);
                    padding-inline-start: 8px;      /* SPACE.sm */
                    color: var(--auf-achtung-text);
                    font-weight: 700; }
.fuehrung         { padding: 24px;                  /* SPACE.xl — die einzige 24er-Fläche */
                    background: var(--auf-karte); } /* siehe unten: gemessen wird, was rendert */
.lageGitter       { display: grid; gap: 12px;       /* SPACE.md */
                    grid-template-columns: repeat(auto-fit, minmax(min(180px, 100%), 1fr)); }
```

Neue Variablen (paarig, sonst schlägt die Paarigkeitsprüfung fehl):
`--auf-karte: #ffffff` hell / `#191c1f` dunkel.

**Und die Führungskarte bekommt ihren Hintergrund tatsächlich von dieser Variablen** — das ist keine
Kosmetik, sondern die Bedingung dafür, dass die Kontrastmessung etwas aussagt. Eine Variable, die
nur als Testfixtur existiert, während antds `Card` seine Fläche aus **antds eigenen** Tokens nimmt,
misst ein Paar, das nirgends zusammen gerendert wird — genau die stille Bauart von Falle 2. Entweder
die Karte trägt `background: var(--auf-karte)`, oder `--auf-karte` entfällt und die Messung
beschränkt sich auf `--auf-papier`. Dieser Entwurf wählt das Erste, weil die Karte ohnehin eine
eigene Fläche ist.

Der CSS-Test bekommt **zwei** Zeilen mehr, nach dem Muster der bestehenden Prüfungen 23/24:
`--auf-achtung-text` auf `--auf-papier` ≥ 4.5 und auf `--auf-karte` ≥ 4.5, **hell und dunkel**.
Ohne sie wäre die einzige farbtragende Stelle des Entwurfs die einzige ungemessene.

In die bestehende Medienabfrage kommen **zwei** Regeln:
`.fuehrung { padding: 16px }` (die 24 sind auf 360px zu viel Rand — 16 ist SPACE.lg) und
`.zeilenListe > li { flex-direction: column }` für die Kartenform der Zeilen aus §3.3.
`.lageGitter` braucht keine (auto-fit erledigt es). **Und die Knöpfe der Karte brauchen ebenfalls
keine:** sie stehen in `.knopfzeile`, und die bestehende Regel `.modul .knopfzeile > *
{ width: 100% }` greift schon. Eine `.fuehrung`-spezialisierte Zweitfassung wäre nicht nur
überflüssig — CSS-Prüfung 17 sucht **genau diesen Selektor**, und eine zweite, engere Regel daneben
wäre der Anfang der Spezifitätsspirale, gegen die Falle 5 geschrieben ist.

**Keine Bewegung, und das ist jetzt strukturell.** Der CSS-Test verlangt **genau eine**
Medienabfrage; eine `@media (prefers-reduced-motion: reduce)`-Ausnahme wäre eine zweite. Wer eine
Animation ergänzen will, bricht damit sichtbar eine Zusage und muss die Abwägung neu führen — das
ist besser als ein Kommentar, der bittet.

---

## 6. Die übrigen Flächen

### `/a/<id>` — Aufgabendetail
Aufbau bleibt (Titel · Chip-Zeile · Erklärung · Metablock · Nachweis · Verlauf · Aktionszone). Drei
Änderungen:
1. Die Chip-Zeile hat eine **feste Reihenfolge**: Zustand · Priorität · `<Frist>` · Nachweispflicht.
   Heute steht die Frist im Metablock und die Chips oben; damit steht die wichtigste Zahl der Seite
   zweimal an unterschiedlichen Orten je nach Ansicht.
2. **Genau ein Primärknopf.** `AktionsZone.tsx` rendert heute jedes `optionen.*=== true` als
   eigenes Formular, und mehrere davon mit `type="primary"` (`starten`, `zuruecksetzen`,
   `wiederaufnehmen`, `fertig`, `freigeben`). Neu: eine feste Vorrangliste
   (`freigeben` › `fertig` › `starten` › `wiederaufnehmen` › `zuruecksetzen` › `zurueckziehen`);
   der erste erlaubte Eintrag ist `type="primary"`, **alle übrigen sind Standardknöpfe**.
   Das ist eine Sortierung plus ein Flag, kein Umbau.
3. Die Aktionszone bekommt eine Kicker-Zeile „WAS JETZT ZU TUN IST" — derselbe Satzbau wie die
   Führungskarte, damit die Detailseite als deren Fortsetzung gelesen wird. Der bestehende Satz
   „Für diese Aufgabe ist derzeit keine Aktion möglich." bleibt der Leerfall.

### `/personen` — Personenverwaltung
Unverändert. Sie ist heute die sauberste Fläche des Moduls (Tabelle mit Rolle, Zeitraum, Aktionen;
`Popconfirm` beim Beenden; Verzeichnissuche mit Feldfehlern). Kein Grund, sie anzufassen.

### `/neu` — Aufgabe einstellen
Unverändert, einschließlich aller `#af-*`-Ids (der e2e-Rundlauf hängt daran) und der Reihenfolge
Nachweisschalter → Formwahl. **Eine Ergänzung:** unter dem Feld „Frist" eine Metazeile, die das
gewählte Datum in Worten zurückgibt („Do, 03.09. — in 10 Tagen"). Das ist der einzige Ort, an dem
Fristen entstehen; wenn sie hier schon in derselben Sprache erscheinen wie später in `<Frist>`,
entsteht der Zusammenhang zwischen Eingabe und Anzeige, den man sonst raten muss.

### `/archiv`
Unverändert im Aufbau. Die Zeilen benutzen `AufgabenZeile` und damit `<Frist>` — dort immer in der
neutralen Ausprägung (siehe §5.3). Der bestehende Prioritätsfilter (Client-Insel, serverseitig
filternd) bleibt.

### `/plan/<personId>` — Zeitplan
Aufbau bleibt. Zwei Änderungen:
1. `<Frist>` an jedem Eintrag — es ist die zweite Stelle nach dem Einstieg, an der Überfälligkeit
   heute unsichtbar ist.
2. **Keine Führungskarte.** Ein Plan ist keine Führung, sondern eine Fläche; eine Karte darüber
   würde die eine Frage der Seite („wie sieht meine Woche aus") mit einer anderen überschreiben.
   Der fremde Plan bleibt wie heute völlig aktionsfrei (`e2e:142` prüft das).

### `/routinen`
Unverändert.

---

## 7. Was bewusst weggelassen ist

| Weggelassen | Warum |
|---|---|
| **Mehrfachauswahl im Posteingang** („10 anhaken, an Alina verteilen") | Verteilen ist eine Einzelfallentscheidung: wer hat Zeit, wer kann das. Eine Stapelzuweisung an **eine** Person ist genau die Entscheidung, die Rike nicht blind treffen soll — und sie würde gegen **veraltete** Auslastungszahlen gerechnet: nach der ersten Zuweisung stimmt die Wochenauslastung im Dialog nicht mehr. Der sequenzielle Weg mit neu gerechneter Auslastung ist hier nicht langsamer, sondern richtiger. |
| **Uhrzeitabhängige Inhalte** (Vormittag/Nachmittag) | Die Seite rendert serverseitig in einem Zug und hat keinen Aktualisierungstakt. Eine Karte, die sich nach der Uhr ändert, wäre nach fünf Minuten Standzeit falsch, ohne dass etwas geschehen wäre. Fortschritt ist die ehrlichere Kopplung (§3.1). |
| **KPI-Kacheln** (`Kachel.tsx`, `.kpi*`) | **Befund 1 des Auftrags nennt genau diese Bauform als den Defekt**: „KPI-Kacheln plus vier gestapelte Listen — sie beantworten ‚was gibt es', nicht ‚was ist jetzt dran'." Die Kacheln stehen damit gegen Spec §8.1/§8.2, die sie vorschreiben — und der Befund gewinnt, weil er später ist und weil §9.4 die **Kontextzeile** ohnehin verlangt: die vier Zahlen haben dort einen Platz, **einschließlich der Nullen**, für die §8.1 die stehenbleibende 0-Kachel erfunden hatte. Zwei Antworten auf eine Frage sind die Krankheit, nicht die Kur. |
| **Tönung der Führungskarte** | Farbe ist im Modul für sechs Zustandstöne und drei Prioritätsstufen vergeben. Ein siebter Ton „das ist die Führung" wäre eine Bedeutung zu viel auf einem schon vollen Kanal. Raum (24px), Typografie (Kicker + 20/600) und Position tun es. |
| **Jede Bewegung** — Aufbau der Tagesspalten, Zählanimation der Zahlen, Übergänge | Spec §9.4 verbietet die ersten beiden ausdrücklich, und der CSS-Test verbietet den Rest indirekt: eine `prefers-reduced-motion`-Ausnahme wäre eine zweite Medienabfrage. |
| **Ein Zähler-Abzeichen in der Suite-Navigation** („Freigaben ⑵") | Es müsste bei **jedem** Seitenaufruf jedes Moduls gezählt werden, in der Shell, quer zur Modulgrenze. Der `core`-Maßstab ist ein zweiter, heute belegbarer Nutznießer — es gibt keinen. |
| **Ein Schnellformular „Aufgabe in einem Feld anlegen" auf dem Einstieg** | `/neu` verlangt Titel, Erklärung, Priorität, Frist, Dauer und optional Nachweispflicht — und jedes dieser Felder hat einen Grund. Ein Kurzformular wäre ein zweiter Weg zu derselben Action mit schlechteren Daten, und die Erklärung ist genau das, was der Auftraggeber laut §1 liefern soll. |
| **Sortier- und Filterknöpfe auf dem Einstieg** | Die Rangleiter **ist** die Sortierung. Ein Filter erlaubte, die Führung wegzublenden — die eine Sache, die die Seite verhindern soll. Filter bleiben, wo sie hingehören: im Archiv. |
| **Abwesenheiten, wiederkehrende Aufgaben, Zeiterfassung, Mehrwochenplanung, Video-Nachweis, E-Mail** | Bereits in Spec §13 gestrichen; dieser Entwurf holt nichts davon zurück. |
| **Ein neuer Breakpoint für 360px** | 360px ist keine eigene Klasse, sondern der schmale Rand derselben. Der Suite-Breakpoint ist 767.98px, und ein zweiter wäre ein Modul, das bei einer anderen Breite schaltet als die Shell — genau der Defekt, den `feedback.css` bis 2026-07-27 hatte. |
| **Ein Skeleton, ein Spinner, eine `loading.tsx`** | Vorgabe. Der einzige Ladezustand ist `isPending` aus `useActionState`: Knopf `loading` + `disabled`, Beschriftung unverändert. |

---

## 8. Die sieben Prüffragen aus `docs/design/README.md`

### 1. Hat jede Action einen Weg in der Oberfläche?

Nach diesem Entwurf ja — heute **nicht**. `umverteilenAction` (`actions.ts:313`) ist definiert, in
`actions.test.ts` geprüft und hat **keinen einzigen Aufrufer in `_ui/` oder in einer Seite**
(nachgezählt: die einzigen Nennungen außerhalb von `actions.ts` und den Tests stehen in
Kommentaren). Das ist derselbe Befund wie beim `feedback`-Port („sechs von acht Server-Actions ohne
Einstiegspunkt") — eine Action ohne Aufrufer ist kein Feature.

| Action | Weg |
|---|---|
| `aufgabeEinstellenAction` | `/neu` (Nav · Seitenkopf-Textknopf · Ruhe-Karte aller drei Rollen) |
| `verteilenAction` | Führungskarte Koordination Rang 1/2 · `/verteilen` je Zeile |
| **`umverteilenAction`** | **neu:** Führungskarte Koordination Rang 4 („Umverteilen") · Zone „Überfällig" je Zeile · `AktionsZone` auf `/a/<id>` für die Koordination |
| `zurueckziehenAction` | Führungskarte Auftrag Rang 3 (sekundär, `Popconfirm`) · `AktionsZone` |
| `startenAction` | Führungskarte BuFDi Rang 1/4 · `AktionsZone` |
| `zuruecksetzenAction` | Führungskarte BuFDi Rang 3 (sekundär) · `AktionsZone` |
| `wiederaufnehmenAction` | Führungskarte BuFDi Rang 1/2 · `AktionsZone` |
| `einplanenAction` | Führungskarte BuFDi „Anders einplanen" · Zone „Einzuplanen" · `/plan/<eigene>` · Ziehen |
| `einplanenAnnehmenAction` | Führungskarte BuFDi Rang 5 („Annehmen: …") · Zone „Einzuplanen" |
| `fertigMeldenAction` | Führungskarte BuFDi Rang 3 (ohne Nachweispflicht) · `AktionsZone` |
| `freigebenAction` | Führungskarte Auftrag/Koordination Rang 1/3 · `/freigaben` · `AktionsZone` |
| `zurueckweisenAction` | dieselben drei, als Sekundäraktion mit Pflicht-Begründung |
| `routineAnlegen/Aendern/RuhenAction` | `/routinen` |
| `rangVerschiebenAction` | Auf/Ab-Knöpfe in jeder Tagesspalte (Wochengitter **und** Tagesliste) |
| `personenSucheAction` · `personAnlegen/Aendern/BeendenAction` | `/personen` |

### 2. Führt kein Weg dorthin, wo die Person nicht hindarf?

Ja, und zwar strukturell statt geprüft: **jede Sprosse der Leiter ist über dasselbe Prädikat
definiert, das die Action durchsetzt.** Rang „verteilen" existiert nur, wenn `darfVerteilen(akteur,
heute)`; Rang „freigabe" speist sich aus `freigabeDaten(db, akteur, heute)`, das über `darfFreigeben`
filtert (samt beider Ausschlüsse aus Spec §7); die BuFDi-Zustandsaktionen kommen aus
`aktionsOptionen(a, akteur, heute)`, das `uebergang()` je Aktion ruft. Ein Knopf, den die Action
ablehnen würde, kann in der Karte nicht entstehen, weil die Karte gar nicht wüsste, dass es ihn
gibt.

Die Gegenprobe bleibt e2e: `auftrag` → `/verteilen` = 404 und „kein Verweis auf verteilen im
Markup" (`:363`, sucht aktiv per `evaluateAll` über alle `href`); `bufdi` → `/freigaben` = 404;
`bufdi` → `/personen` = 404.

### 3. Ist der Zustand ablesbar, ohne zu klicken — und der nächste Schritt benannt?

Das ist der ganze Entwurf. Drei Ebenen, absichtlich redundant in der *Zusammenfassung*, nie in den
*Rohdaten*:
- **Kontextzeile** (12px): die vier Zahlen inklusive Nullen — die Lage in einem Satz.
- **Führungskarte**: der eine nächste Schritt, wörtlich benannt, mit dem Knopf, der ihn tut.
- **Zonen**: der Vorrat, jede mit Zahl in der Überschrift.

Und je Zeile: Zustands-Chip mit ausgeschriebenem Wort (`STATUS_TEXT`), Prioritäts-Chip mit
ausgeschriebenem Wort, `<Frist>` mit ausgeschriebener Überfälligkeit — kein Zustand nur als Farbe.

### 4. Führt jede Seite zurück?

Ja. `SeitenKopf` erzwingt die Brotkrume als Pflichtprop, und der erste Eintrag ist auf jeder
Unterseite `{ label: "Aufgaben", href: "/" }`. Der Einstieg selbst trägt `[{ label: "Aufgaben" }]`
ohne `href` — er **ist** das Ziel. Zusätzlich führt die Modulnavigation aus `_lib/nav.ts` von jeder
Seite auf jede erlaubte andere, und die Führungskarte ist von jeder Unterseite aus einen Klick
entfernt. Der `<Frist>`-Umbau ändert daran nichts.

### 5. Kommen Fehler aus Server-Actions am Feld an?

Ja — und der Entwurf macht daraus eine **Regel für die Führungskarte**: *sie trägt nur Aktionen ohne
Eingabefeld.* Alles, was ein Feld ausfüllen lässt, führt auf die Fläche, die den Feldfehler anzeigen
kann.

| Aktion in der Karte | Form | Fehlerweg |
|---|---|---|
| Bearbeitung starten · zurücksetzen · wieder aufnehmen · Annehmen · Freigeben | natives `<form action={…}>`, ein verstecktes Feld, kein Eingabefeld | kann keinen Feldfehler haben; Zugriffsverletzung bleibt `throw` |
| **Fertig melden mit Nachweispflicht** | **nicht in der Karte** — Knopf „Nachweis hinterlegen und fertig melden" → `/a/<id>` | dort `useActionState`, Fehler an `nachweisText` **und** an `nachweis` (Bild); beide Schlüssel werden gerendert |
| Fertig melden ohne Nachweispflicht | `<form>` in der Karte | kein Feld, kein Feldfehler |
| Zurückweisen | `Popconfirm`/Modal aus `FreigabeZone`, `useActionState` | Begründung ist Pflicht, Fehler am Textfeld |
| Verteilen · Umverteilen | Modal aus `VerteilenDialog`, `useActionState` | Fehler an `zielId`/`vorschlagDatum` |

Kein neues Formularmuster: es bleiben `useActionState` + `FormState` aus `_lib/formState.ts` und
native `<form action>` für die feldlosen Übergänge. `revalidatePath` nur im Erfolgsfall.

### 6. Gibt es Leerzustände?

Ja, und die meisten kann es gar nicht mehr geben: **eine leere Zone ist strukturell ausgeschlossen**,
weil `zonen` nur nicht-leere Anlässe enthält (R3). Was bleibt, ist ausgeschrieben:

| Ort | Text |
|---|---|
| Führungskarte, Koordination | „Nichts liegt an: Posteingang leer, keine Freigabe offen, nichts überfällig." |
| Führungskarte, BuFDi | „Für heute ist nichts mehr offen." + „Morgen: <Titel> · <Dauer>." bzw. „Diese Woche ist alles eingeplant." |
| Führungskarte, Auftrag | „Alle deine Aufträge laufen, nichts wartet auf dich." |
| Fläche Koordination, keine BuFDis aktiv | „Es ist noch keine BuFDi eingetragen." + Link `/personen` |
| Fläche BuFDi, leerer Tag | „Nichts eingeplant." (bestehend) |
| Fläche Auftrag, keine Aufträge | „Noch keine eigenen Aufträge." (bestehend) |
| `/verteilen`, `/freigaben`, `/archiv` | „Posteingang leer — alles verteilt", „Keine Freigabe offen", Archiv-Leertext (alle bestehend) |

Kein Platzhalter, keine Illustration, kein zweiter Startaufruf: der eine Knopf steht in der Karte
darüber. Ein Diagramm gibt es im Modul nicht — die Auslastung ist eine Zahl mit einem Nenner
(„6 / 39 Std."), kein Achsenkreuz, das leer kaputt aussähe.

### 7. Zeigt die Liste, was sie zeigen soll — oder nur einen Link?

Eine Zeilenform für das ganze Modul, `_ui/AufgabenZeile.tsx`, feste Reihenfolge:

```
Titel (Link auf /a/<id>)   [Zustand]  [Priorität]   <Frist>   Dauer   ‹Rollenzusatz›
```

Der Rollenzusatz ist der einzige variable Teil und immer **eine** Angabe:
BuFDi → Zeitvorschlag bzw. Plantag · Koordination → Zugewiesener · Auftrag → „Empfänger: X" bzw.
„Noch nicht verteilt" · Freigabe → „Nachweis (Text) liegt vor" · zurückgewiesen → die Begründung
wörtlich.

Damit trägt jede Zeile Status, Menge (Dauer) und Datum (Frist) — die drei Angaben, die die Prüffrage
verlangt — und der Titel ist nie das Einzige, was dasteht. Der einzige Ort ohne Link auf `/a/<id>`
bleibt die Tagesspalte des Wochenplans für Routinen: eine Routine hat keine Detailseite, weil sie
kein Aufgabendatensatz ist (Spec §6).

---

## 9. Reihenfolge einer Umsetzung, falls dieser Entwurf gewinnt

Nicht Teil der Entwurfsfrage, aber die Reihenfolge entscheidet, ob die Tore grün bleiben:

1. `_lib/lage.ts` + `_lib/lage.test.ts` und `ANLASS_TEXT` in `_lib/anzeige.ts` — reiner Selektor
   plus Beschriftung, keine Oberfläche. Erschöpfend prüfbar ohne jedes Rendern.
2. `_ui/Frist.tsx` + Test + Quelltext-Scan, und die fünf Aufrufstellen umgestellt. Erst **nach**
   Schritt 1, weil der Scan sonst gegen die heutigen Überschriften in `EinstiegKoordination.tsx`
   ausschlägt. Ab hier ist der Befund „drei Darstellungen" erledigt, unabhängig vom Rest.
3. `_ui/Fuehrungskarte.tsx` + `_ui/AufgabenZeile.tsx`, dann die drei Einstiege darauf umgebaut.
4. CSS und Testerweiterung (zwei Kontrastzeilen, drei Regeln in der bestehenden Medienabfrage).
5. `umverteilenAction` verdrahten.
6. Voller Lauf: `pnpm typecheck` · `pnpm lint` · `pnpm vitest run` · `pnpm build` ·
   `pnpm exec playwright test` — der letzte ist Pflicht, weil drei Aussagen dieses Entwurfs
   (HTTP 200, mobile Umschaltung, „genau ein Primärknopf") von keinem anderen Tor gesehen werden.
