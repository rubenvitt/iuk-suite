# Entwurf B — „Der Tag": Oberflächen-Neuentwurf des Moduls `aufgaben`

**Stand 2026-08-15 · Konkurrenzentwurf B · kein Code geändert**

Alle Zahlen, Titel und Namen in diesem Dokument stammen aus `_lib/seedLokal.ts`. Als Bezugszeitpunkt
der Skizzen gilt durchgehend **Mittwoch, 12.08.2026, 09:14 Uhr** (Woche Mo 10.08.–Fr 14.08.). Das ist
kein willkürlicher Tag: `heute-3` fällt damit auf einen Sonntag, wodurch der Seed seinen beabsichtigten
Überbuchungsfall (Bendix, Montag, 9,17 Std.) zeigt **und** gleichzeitig den Härtefall „eine überfällige
Aufgabe liegt außerhalb der Fünftagewoche" (Aufgabe „Sanitätswache Stadtfest vorbereiten",
`planDatum` = So, 09.08.). Ein Sonntags-Bild steht in §3.5.

---

## 1. Die Leitidee in drei Sätzen

**Die Zeit ist die Ordnung, nicht die Liste.** Eine Aufgabe ist kein Datensatz mit einem Datumsfeld,
sondern ein Objekt, das an einer Stelle im Tag liegt — und wenn es noch keine Stelle hat, liegt es
trotzdem in der Zeit, nämlich an seiner **Frist**; „unverplant" ist eine Position auf derselben Achse,
keine Ausnahme von ihr.

**Über der Achse steht genau ein Satz, der sagt, was jetzt dran ist**, und dieser Satz kommt aus einer
reinen Funktion (`_lib/lage.ts`), nicht aus der Anordnung von vier Kacheln über vier Listen.

**Wer nicht in der Zeit arbeitet, bekommt keine Zeitachse**: der Auftraggeber sieht eine Strecke —
seine Aufträge, sortiert danach, was von *ihm* abhängt — und das ist die ehrliche Antwort darauf, dass
eine Zeitachse für ihn nichts erklärt.

---

## 2. Informationsarchitektur

### 2.1 Die Routen — keine kommt, keine entfällt

| Route | bleibt? | Was sich ändert |
|---|---|---|
| `/` | **bleibt** | Rollenabhängig wie bisher. Statt „KPI-Zeile + vier gestapelte Listen" jeweils **drei** Zonen: Führungskarte · Posteingang · Achse (bzw. Strecke). Die vier `Kachel`n entfallen (§2.3). |
| `/a/<id>` | **bleibt** | Frist-Marke in der Chip-Zeile; Aktionszone bekommt für die Koordination **„Anders zuweisen"** — den heute fehlenden Aufrufer von `umverteilenAction` (§6.1). |
| `/neu` | **bleibt** | unverändert bis auf die Frist-Marke in der Vorschau. |
| `/plan/<personId>` | **bleibt** | Bekommt seinen eigenen Auftrag zurück: **blättern und einplanen**. `WochenWaehler` lebt nur noch hier; `/` zeigt immer *diese* Woche. |
| `/routinen` | **bleibt** | unverändert. |
| `/freigaben` | **bleibt** | Wird zur **einzigen** Freigabefläche. Die Inline-`FreigabeZone` auf `/` (Koordination) entfällt, die auf `/` (Auftraggeber) bleibt — Begründung in §2.2. |
| `/verteilen` | **bleibt** | Muss bleiben: `/verteilen` trägt den 404-Riegel aus Spec §8.3 (e2e-Test 10) und ist die adressierbare Route. Sie zeigt dieselbe `VerteilenTabelle` wie `/`, **plus** die Tafel über alle Wochen (mit `WochenWaehler`). |
| `/personen` | **bleibt** | unverändert. |
| `/archiv` | **bleibt** | unverändert bis auf die Sortierung (§6.4). |

**Warum nichts umgehängt wird.** Der naheliegende Griff wäre gewesen, `/` für die BuFDi auf „Heute" zu
verkürzen und die Woche nach `/plan/<id>` zu schieben. Drei Gründe dagegen, in dieser Reihenfolge:

1. **Spec §8.1 legt die fünf Tagesspalten auf den BuFDi-Einstieg.** Das ist die engste Bindung, die es
   gibt; sie ohne Not zu verlassen kostet mehr, als sie einbringt.
2. **Es ist gar nicht nötig.** Die Suite hat genau einen Breakpoint, und beide Ausprägungen rendern
   ohnehin ins HTML: unter 767.98px *ist* `/` schon heute eine Tagesansicht (`.tagesListe` +
   `TagesWaehler`), darüber die Woche. „Der Tag" braucht keine eigene Route — er braucht eine
   Führungskarte darüber und eine Achse, die als Achse lesbar ist.
3. **e2e-Tests 32–34** messen die Umschaltung `[data-rolle="tagesliste"]` ⇄ `[data-rolle="wochengitter"]`
   **auf `/`** bei 390/820/1280px. Ein Umzug hätte drei Tests die Route gewechselt, ohne einen einzigen
   Nutzerzweck zu erfüllen, den die Medienabfrage nicht schon erfüllt.

**Was `/` und `/plan/<id>` künftig unterscheidet** (heute rendern beide dasselbe `Wochenplan`-Bild):
`/` ist **geführt und auf diese Woche festgenagelt** — Führungskarte, Posteingang, Achse, kein
`WochenWaehler`. `/plan/<id>` ist die **Planungsfläche**: `WochenWaehler`, die `EinplanenFormular`e,
fremde Pläne lesend. Das ist der Unterschied zwischen „was ist jetzt dran" und „ich setze mich hin und
plane".

### 2.2 Was von `/` verschwindet, und wohin es geht

Das ist die eigentliche Substanz dieses Entwurfs, deshalb einzeln — **jeder heutige Weg bekommt ein
Ziel benannt** (Prüffrage 1 aus `docs/design/README.md`):

| Heute auf `/` | Wohin |
|---|---|
| `Kachel` „Einzuplanen" → `#posteingang` | Der Posteingang steht direkt unter der Führungskarte, seine Zahl in der Kontextzeile und im `<h2>` („Posteingang (2)"). Ein Anker auf etwas, das eine Bildschirmhöhe tiefer sichtbar ist, war nie eine Navigation. |
| `Kachel` „Heute offen" → `/plan/<id>?woche=…` | Ist die Führungskarte selbst. |
| `Kachel` „Freigabe offen" → `#freigabe-offen` (BuFDi) | Der Zustands-Chip „Freigabe offen" steht auf der Achse an der Aufgabe. Zusätzlich nennt die Kontextzeile die Zahl. |
| `Kachel` „Zurückgewiesen" → `#zurueckgewiesen` | Der Chip `tonAchtung` steht auf der Achse bzw. im Posteingang; die Führungskarte hebt ihn hoch, wenn er die Lage ist. |
| Sektion `#freigabe` (Koordination) | `/freigaben`. Die Route existiert, trägt denselben Riegel (`darfFreigabenSehen`) und dieselbe Komponente. Ein Fußverweis „Freigaben (1)" bleibt und steht zusätzlich in der Führungskarte. |
| Sektion `#ueberfaellig` (Koordination) | **Entfällt ersatzlos — und das ist der Kern.** Eine überfällige Aufgabe ist entweder auf der Tafel sichtbar (mit Frist-Marke, §5) oder sie hat in dieser Woche keinen Platz und steht deshalb im Posteingang, dort **zuoberst**. Eine dritte Liste derselben Aufgaben war die Verdopplung, die den Bildschirm unlesbar machte. |
| Sektion `#zurueckgewiesen` (Koordination) | Dieselbe Antwort: Chip auf der Tafel oder Zeile im Posteingang. |

Die Anker `#posteingang` und `#freigabe` bleiben als DOM-Ids bestehen (e2e-Test 61 hängt an
`#posteingang`), auch wo keine Kachel mehr darauf zeigt.

### 2.3 Die KPI-Kacheln entfallen — mit offener Rechnung

`Kachel.tsx` verliert damit beide Aufrufer und wird zurückgebaut; `.kpi` und `.kpiLink` verschwinden aus
`aufgaben.module.css`. **`.kpiKanteAchtung` / `.kpiKanteOcker` / `.kpiKanteOk` bleiben** — sie tragen
künftig die Kante der Führungskarte und der markierten Zeile (§5).

**Der Einwand, den ich gelten lasse:** vier Zahlen auf einen Blick sind eine echte Leistung, und ich
nehme sie weg. Die Gegenrechnung: die Zahlen bleiben vollständig ablesbar — in der Kontextzeile des
`SeitenKopf`, die ohnehin Pflicht ist (§9.4 der Spec, und `SeitenKopf` **wirft** bei leerem `kontext`).
Was verschwindet, ist nicht die Information, sondern **vier Klickziele, die auf Anker derselben Seite
zeigten**, und die Rangfolge-Losigkeit: vier gleich große Zahlen nebeneinander sagen nicht, welche
gerade zählt. Genau das sagt die Führungskarte.

### 2.4 Folgen für `e2e/aufgaben.spec.ts`

Sechzig Tests, davon brechen nach heutiger Lesart **acht**. Kein neuer Test wird nötig, weil eine Route
kommt — es kommt keine.

| Test | Was bricht | Anpassung |
|---|---|---|
| **8** „Verteilung … zeigt „Verbandskästen im Fahrzeugpark prüfen"" | nichts | Der Posteingang bleibt auf `/` (Koordination) sichtbar und ungeklappt — bewusste Randbedingung dieses Entwurfs. |
| **32–34** Umschaltung 390/820/1280 | nichts an der Route | `/` (Alina) rendert weiterhin beide Ausprägungen mit `data-rolle`, und dort steht genau **eine** Achse. Auf `/` der Koordination stehen künftig **drei** je Wert — deshalb bekommt jede Tafelachse zusätzlich `data-person="<id>"` und eine eigene `<section>` mit Überschrift (§3.3). Neue Zusicherungen auf der Tafel adressieren darüber, nie über `data-rolle` allein. |
| **35–58** kein waagerechtes Scrollen | nichts, aber die Deckung wird **zu klein** | `UEBERLAUF_SEITEN` deckt `/` für drei BuFDis, `/verteilen`, `/personen`, `/archiv` — **nicht** `/` der Koordination. Mit der Tafel dort ist genau das die neue Risikofläche. **Neu aufzunehmen: `/` als rike/KOORDINATION** (+4 Fälle, 24 → 28). |
| **60** Tastaturbedienung, Fokus über `outline` | nichts, **wenn** man es weiß | Die Führungskarte und die Frist-Marke dürfen ihren Fokus **nicht** als `box-shadow` bauen. Der bestehende Fokus-Block in `aufgaben.module.css` deckt `a`/`button`; `.fuehrung` wird als eigene Zeile ergänzt. Zusätzlich: die Karte darf die Tab-Kette bis zum zweiten `li`-Rangknopf nicht über 150 Stopps treiben — sie fügt maximal drei hinzu. |
| **61** voller Durchlauf, `#posteingang li` → `/^Annehmen:/` | **bricht, aus zwei unabhängigen Gründen** | (a) Der Posteingang ist künftig **nach Frist sortiert** (§4.2); die in Schritt 1 erzeugte Aufgabe liegt 14–21 Tage in der Zukunft und rutscht ans Ende. (b) Unter `ohnePlatzInWoche` (§4.1) enthält der Posteingang künftig auch Aufgaben **mit** `planDatum` außerhalb der Woche — die tragen kein `vorschlagOffen` und damit **gar keinen** „Annehmen"-Knopf; `#posteingang li`.first() könnte also auf einer Zeile landen, die nur „Anders einplanen" hat. Der eine Fix deckt beides: statt über den Zeilencontainer direkt `page.getByRole("button", { name: /^Annehmen:/ })`. Der Test verliert dabei eine Positionsannahme, die er ohnehin nie begründet hat. |
| **6** `/plan/<fremd>` ohne jede Aktion | nichts | `/plan/<id>` bleibt in Aufbau und Riegel unverändert. Der Fußzeilen-Link „Zeitplan von …" auf `/` (BuFDi) **bleibt wörtlich erhalten** — Test 6 findet sein Ziel darüber. |
| **13** „Meine Aufträge" → Link „Aufgabe einstellen" mit `href="/neu"` | nichts | Der Knopf bleibt exakt dort, wo er ist (`SeitenKopf`-`aktionen`), und bleibt der einzige Primärknopf dieser Fläche (§6.5). |
| **14** „keine Weg zum Verteilen" für `auftrag` | **Gefahr** | Die Führungskarte des Auftraggebers darf **keinen** Verweis mit dem Substring `verteilen` tragen — auch nicht „Noch nicht verteilt" als *Link*. Der Text bleibt Text. Ausdrücklich festgehalten, weil dieser Test jedes `<a href>` der ganzen Seite scannt. |
| **20** `/a/<id>`: `getByRole("definition")` mit „Malte" | nichts | Der Metablock bleibt `<dl>`/`<dd>`. Kein Umbau auf Karten. |
| **28/29/30/31** Ziehen | nichts | `data-rolle="wochengitter"`, `data-tag`, `data-aufgabe-id` und die `<li>`-Struktur bleiben unverändert; die Reihenfolge bleibt **DOM-Reihenfolge**, nie CSS `order`. |
| **59** Dunkelmodus `--auf-tinte` | nichts | **Es kommt keine neue `--auf-*`-Variable dazu und keine bestehende ändert ihren Wert** (§5.4). |
| — | neu | **Ein neuer Test** ist fällig: „die Führungskarte nennt genau eine Handlung und diese ist der einzige `type=primary` der Seite" — als Vitest über die Lage-Funktion (Struktur) und als e2e über `.ant-btn-primary` `toHaveCount(<=1)`. Er prüft **Struktur, nie eine Uhrzeit** (§3.1). |

Und die drei Vitest-Dateien, die fallen: `Kachel.test.tsx` (Komponente entfällt),
`EinstiegKoordination.test.tsx` (die Zusicherung „alle vier Kacheln tragen ein Ziel" verliert ihren
Gegenstand und wird durch „die Führungskarte trägt genau eine Handlung" ersetzt),
`VerteilenDialog.test.tsx:148/152` (§5.5 — Schreibweise).

---

## 3. Je Rolle die Hauptfläche

### 3.0 Die Führungskarte — eine Bauform für alle drei Rollen

Über jeder Einstiegsfläche steht **eine** Karte mit **zwei** Zeilen:

- **DER GRUND** — warum diese Karte gerade das zeigt. Kommt aus `_lib/lage.ts`, siehe §3.1.
- **ALS NÄCHSTES** — was die Achse als Nächstes hergibt. Immer da, auch wenn der Grund dringend ist.

Die Trennung ist der Punkt: ohne sie regiert eine überfällige Aufgabe die Karte den ganzen Tag und der
Plan verschwindet dahinter. Mit ihr sagt die Karte um 07:30 *und* um 16:00 etwas anderes, ohne dass die
Dringlichkeit verlorengeht.

Bauform: eigenes Markup (`.fuehrung`), 1px `--auf-linie`, Fläche `--auf-papier`, `border-radius: 8px`,
`padding: 16px`, `border-inline-start: 4px solid transparent` — die Farbe setzt eine der bestehenden
`.kpiKante*`-Klassen, **und nur wenn es einen Befund gibt** (dieselbe Regel wie heute bei `Kachel`:
„eine Kachel ohne Befund bekommt keine Kante"). Kicker „JETZT" in `SCHRIFT.kicker`, rechts „STAND 09:14"
in `SCHRIFT.mono`. Kein `Card`, kein `Alert` — ein `Alert type="error"` wäre Suite-Rot auf einer
Datenfläche (Falle 3).

### 3.1 `_lib/lage.ts` — der Zustands-Selektor, den es heute nicht gibt

Eine reine Funktion, kein `"use client"`, kein `new Date()`. Sie ist die dritte Lücke aus dem Befund.

```
lageBufdi(aufgaben, routinen, person, heute, jetztMinuten) -> Lage
lageKoordination(alleAufgaben, bufdis, heute, jetztMinuten) -> Lage
lageAuftrag(meineAuftraege, freigabeZeilen, heute) -> Lage
```

`Lage` ist eine unterschiedene Union mit `art`, dem betroffenen Datensatz und **höchstens einer**
Handlung. Die Rangfolge für `lageBufdi`, erster Treffer gewinnt:

| # | `art` | Bedingung | Handlung |
|---|---|---|---|
| 1 | `ueberfaellig` | `istUeberfaellig`, davon die mit der ältesten `faelligAm` | die Vorwärtsaktion ihres Zustands |
| 2 | `laeuft` | `status === "in_arbeit"` und `planDatum === heute` | „Fertig melden" |
| 3 | `jetzt_im_plan` | letzter Eintrag der heutigen `tagesOrdnung` mit `minuten <= jetztMinuten`, nicht abgeschlossen | „Bearbeitung starten" |
| 4 | `naechster_eintrag` | erster Eintrag mit `minuten > jetztMinuten` | keine (eine Routine hat keine) |
| 5 | `posteingang` | `ohnePlatzInWoche`, älteste `faelligAm` | „Annehmen: …" falls `vorschlagOffen` |
| 6 | `kein_arbeitstag` | `wochentagVon(heute) === null` | keine |
| 7 | `tag_leer` | sonst | keine |

`ALS NÄCHSTES` wird unabhängig davon aus Regel 3/4/5/6 gebildet. Für `lageKoordination`:
`ueberfaellig` → `posteingang` → `freigabe` → `ruhig`. Für `lageAuftrag`: `freigabe` →
`zurueckgewiesen` → `ueberfaellig` → `nicht_verteilt` → `ruhig`.

**Der `jetzt`-Vertrag — ausdrücklich, weil er neu ist.** Das Modul reicht `heute: string` als Argument
durch und ruft `new Date()` ausschließlich in `page.tsx` (`isoTag(new Date())`); `Wochenplan.tsx` sagt
das in seinem Kopfkommentar und ein Test mit fester Uhr hängt daran. Minutengenauigkeit macht das nicht
kaputt, wenn sie denselben Weg nimmt:

- `_lib/datum.ts` bekommt **`minutenJetzt(zeitpunkt: Date): number`** (Minuten seit Mitternacht in
  `Europe/Berlin`, über dieselbe `Intl`-Strecke wie `fmtZeitpunkt`) und
  **`naechsterArbeitstag(iso: string): string`**. Beide rein, beide ohne `Date.now()`.
- `page.tsx` ruft `new Date()` **einmal** und gibt `heute` *und* `jetztMinuten` weiter — genau ein
  neuer Parameter auf demselben Pfad.
- Die Karte trägt sichtbar „STAND 09:14" und **frischt sich nie selbst auf**: kein Intervall, kein
  Polling, kein Hintergrund-POST (e2e-Test 31 lauscht darauf und würde rot).
- **e2e prüft die Karte nur strukturell**: dass sie existiert, dass sie genau eine Handlung nennt, dass
  sie den einzigen `type="primary"` der Seite trägt. **Nie** eine Uhrzeit, nie einen bestimmten
  `art`-Zweig — ein solcher Test wäre nur zwischen bestimmten Stunden grün. Die Rangfolge oben gehört
  Vitest, erschöpfend, mit fester Uhr.

### 3.2 BuFDi — Alina, `/`

**360px** (Mi, 12.08., 09:14):

```
Aufgaben                                              ← Brotkrume 12
Meine Woche                                           ← <h1> 24/600 SCHRIFT.titel
Mi, 12.08. · Stand 09:14 · 2 Aufgaben, 6 von 39 Std.  ← Kontextzeile 12, gedämpft
verplant · 1 überfällig · 2 im Posteingang

▌ JETZT                                     09:14     ← .fuehrung + .kpiKanteAchtung
▌ ┌──────────────────────────┐
▌ │ ⚠ Überfällig seit 2 Tagen│                        ← Frist-Marke, .chip .tonAchtung
▌ └──────────────────────────┘
▌ Standwache Blutspendetermin                         ← <h2> 20/600, Link auf /a/<id>
▌ Verteilt · Mittel · 4 Std. · von Malte
▌ Eingeplant Mo, 10.08.
▌ ┌────────────────────────────────────────┐
▌ │        Bearbeitung starten             │          ← DER Primärknopf, 44px, 100 %
▌ └────────────────────────────────────────┘
▌ Öffnen · Auf heute schieben                         ← zwei Textlinks, keine Knöpfe
▌ ────────────────────────────────────────
▌ ALS NÄCHSTES
▌ Heute steht nichts mehr im Plan.
▌ 2 Aufgaben haben in dieser Woche keinen Platz.

POSTEINGANG (2)                                       ← <h2> 20/600
┌──────────────────────────────────────────┐
│ Zeltlager-Inventar dokumentieren         │
│ ⏱ Morgen fällig                          │          ← Frist-Marke, .chip .tonGrau
│ Verteilt · Niedrig · 1,5 Std. · Malte    │
│ ┌──────────────────────────────────────┐ │
│ │   Annehmen: Do, 13.08., 09:00        │ │          ← Sekundär, 100 % (§9.6)
│ └──────────────────────────────────────┘ │
│ ┌──────────────────────────────────────┐ │
│ │   Anders einplanen                   │ │
│ └──────────────────────────────────────┘ │
├──────────────────────────────────────────┤
│ Fahrzeugerstausstattung fotografisch     │
│ dokumentieren                            │
│ Frist: Mo, 17.08.                        │          ← keine Marke, nackter Text
│ Verteilt · Mittel · 20 Min. ·            │
│ Nachweis: Bild                           │
│ ┌──────────────────────────────────────┐ │
│ │   Anders einplanen                   │ │
│ └──────────────────────────────────────┘ │
└──────────────────────────────────────────┘

┌ Tag ─────────────────────────────────────┐          ← TagesWaehler, echte Radiogruppe
│ ( )Mo ( )Di (•)Mi ( )Do ( )Fr            │            unverändert übernommen
└──────────────────────────────────────────┘

MI, 12.08.                                            ← .tagKopf
0,25 / 7,8 Std.                                       ← .budget, mono, tabular
┌──────────────────────────────────────────┐
│ 08:00 │ ↻ Frühbesprechung        15 Min. │          ← .ankerSpur │ Routine
│ ──────┴───── jetzt 09:14 ─────────────── │          ← Jetzt-Linie, nur heute
│       Nichts mehr eingeplant.            │
└──────────────────────────────────────────┘

Woche planen und blättern                             ← /plan/<eigene id>
Routinen verwalten
Zeitplan von Bendix
Zeitplan von Carla
```

**Desktop (1280px)** — dieselben Daten, dieselbe Reihenfolge, andere Ausprägung:

```
Aufgaben
Meine Woche
Mi, 12.08. · Stand 09:14 · 2 Aufgaben, 6 von 39 Std. verplant · 1 überfällig · 2 im Posteingang
────────────────────────────────────────────────────────────────────────────────────────────
▌ JETZT                                                                        STAND 09:14
▌ ⚠ Überfällig seit 2 Tagen                       │ ALS NÄCHSTES
▌ Standwache Blutspendetermin                     │ Heute steht nichts mehr im Plan.
▌ Verteilt · Mittel · 4 Std. · von Malte          │ 2 Aufgaben haben in dieser
▌ Eingeplant Mo, 10.08.                           │ Woche keinen Platz.
▌ [ Bearbeitung starten ]  Öffnen · Auf heute schieben
────────────────────────────────────────────────────────────────────────────────────────────
POSTEINGANG (2)
 ⏱ Morgen fällig    Zeltlager-Inventar dokumentieren       Verteilt · Niedrig · 1,5 Std.
                                        [ Annehmen: Do, 13.08., 09:00 ] [ Anders einplanen ]
 Frist: Mo, 17.08.  Fahrzeugerstausstattung fotografisch dokumentieren
                    Verteilt · Mittel · 20 Min. · Nachweis: Bild        [ Anders einplanen ]
────────────────────────────────────────────────────────────────────────────────────────────
 MO, 10.08.       DI, 11.08.       MI, 12.08. ▸    DO, 13.08.       FR, 14.08.
 4,25 / 7,8 Std.  1 / 7,8 Std.     0,25 / 7,8      0,25 / 7,8       0,25 / 7,8
┌──────────────┐ ┌──────────────┐ ┌─────────────┐ ┌──────────────┐ ┌──────────────┐
│08:00│↻ Früh- │ │08:00│↻ Früh- │ │08:00│↻ Früh-│ │08:00│↻ Früh- │ │08:00│↻ Früh- │
│     │ bespr. │ │     │ bespr. │ │     │ bespr.│ │     │ bespr. │ │     │ bespr. │
│▌⠿ Standwache │ │ ⠿ Fahrzeug-  │ │─ jetzt 09:14│ │              │ │              │
│  Blutspende- │ │   check RTW 3│ │             │ │ Nichts       │ │ Nichts       │
│  termin      │ │ Zurückgewie- │ │ Nichts mehr │ │ eingeplant.  │ │ eingeplant.  │
│  ⚠ 2 Tage    │ │   sen        │ │ eingeplant. │ │              │ │              │
│  [Auf] [Ab]  │ │ ⏱ Morgen     │ │             │ │              │ │              │
│              │ │   fällig     │ │             │ │              │ │              │
│              │ │ [Auf] [Ab]   │ │             │ │              │ │              │
└──────────────┘ └──────────────┘ └─────────────┘ └──────────────┘ └──────────────┘
```

Beachte: **`▌` links an der Standwache-Zeile** ist die 4px-Kante in `--auf-achtung-text` — die einzige
Farbe auf der ganzen Datenfläche, und sie sitzt an einer Zeile, nicht auf ihr (§5).

### 3.3 Koordination — Rike, `/` („Die Tafel")

Der Grundgedanke: **die Koordination sieht dreimal dieselbe Achse und verteilt hinein.** Und zwar
buchstäblich dieselbe — die Tafel ist `Wochenplan` dreimal untereinander, je einmal für Alina, Bendix
und Carla. Das ist keine Sparsamkeit, sondern die Zusicherung, dass die Koordination genau das Bild
sieht, das die BuFDi sieht: dieselbe Ankerregel, dieselbe Budgetzeile, dieselbe Frist-Marke, dieselbe
Mobilumschaltung. Ein eigenes Matrixraster hätte einen zweiten Satz von allem gebraucht — und
`Wochenplan` ist bereits `"use client"`-frei und in `ZiehBereich` eingefasst.

**Der Preis dieser Wiederverwendung, ausgeschrieben, weil er sonst als Selektor-Kollision zurückkommt.**
`ZiehBereich` setzt `data-rolle="wochengitter"` und `Wochenplan` setzt `data-rolle="tagesliste"` — beide
**fest**. Dreimal gestapelt heißt: auf `/` der Koordination stehen künftig **drei** Elemente mit jedem
der beiden Werte. Damit hört `data-rolle` auf, eine Identität zu sein, und wird eine Klasse. Das ist
kein Grund gegen die Bauform, aber es verlangt eine Entscheidung, und sie lautet:

> Jede der drei Achsen steht in einem eigenen `<section aria-labelledby="tafel-<personId>">` mit einem
> `<h3 id="tafel-<personId>">` „ALINA · 6 / 39 Std." (`SCHRIFT.kicker`). Die Tafel reicht zusätzlich
> **`data-person="<personId>"`** an `ZiehBereich` und an die `.tagesListe` durch — ein zweites,
> unterscheidendes Attribut neben dem unveränderten `data-rolle`.

Damit gilt: **`data-rolle` allein adressiert nur noch dort eindeutig, wo genau eine Achse steht**
(`/`-BuFDi, `/plan/<id>`) — und genau dort messen die e2e-Tests 28–34 heute. Jede neue Zusicherung auf
der Tafel adressiert über `[data-person="…"]` oder über die Überschrift, nie über `data-rolle` allein.
`ZiehBereich` braucht dafür eine durchgereichte Prop, keinen zweiten Zustand; `data-person` ist zudem
das Attribut, an dem der Zug zwischen zwei Personenachsen (`umverteilenAction`, §6.6) sein Ziel erkennt
— es entsteht also ohnehin, nicht nur für Tests.

**Desktop (1280px):**

```
Aufgaben
Verteilung
Mi, 12.08. · Stand 09:14 · 1 zu verteilen · 1 wartet auf Freigabe · 4 überfällig
────────────────────────────────────────────────────────────────────────────────────────────
▌ JETZT                                                                        STAND 09:14
▌ ⚠ 4 überfällige Aufgaben — die älteste seit 3 Tagen
▌ Sanitätswache Stadtfest vorbereiten · Bendix · In Bearbeitung · Prüfer Tomke
▌ Sie hat in dieser Woche keinen Platz — sie liegt auf So, 09.08.
▌ [ Verbandskästen im Fahrzeugpark prüfen verteilen ]   Freigaben (1) · Personen · Archiv
▌ ────────────────────────────────────────
▌ ALS NÄCHSTES  Bendix ist am Montag mit 9,17 von 7,8 Std. überbucht.
────────────────────────────────────────────────────────────────────────────────────────────
POSTEINGANG (1)                                        Tabelle, sortiert nach Frist
 TITEL                          AUFTRAGGEBER  PRIORITÄT  FRIST           DAUER    NACHWEIS
 Verbandskästen im Fahrzeug-    Malte         Mittel     Frist:          1 Std.   —   [Verteilen]
 park prüfen                                             Sa, 22.08.
────────────────────────────────────────────────────────────────────────────────────────────
DIE TAFEL · Mo, 10.08. – Fr, 14.08.

ALINA · 6 / 39 Std.
 MO, 10.08.      DI, 11.08.      MI, 12.08. ▸   DO, 13.08.     FR, 14.08.
 4,25 / 7,8      1 / 7,8         0,25 / 7,8     0,25 / 7,8     0,25 / 7,8
┌─────────────┐ ┌─────────────┐ ┌────────────┐ ┌────────────┐ ┌────────────┐
│08:00│↻Früh… │ │08:00│↻Früh… │ │08:00│↻Früh…│ │08:00│↻Früh…│ │08:00│↻Früh…│
│▌⠿ Standwache│ │ ⠿ Fahrzeug- │ │─jetzt 09:14│ │            │ │            │
│  Blutspende │ │   check RTW3│ │            │ │ Nichts     │ │ Nichts     │
│  ⚠ 2 Tage   │ │ Zurückgew.  │ │ Nichts     │ │ eingeplant │ │ eingeplant │
└─────────────┘ └─────────────┘ └────────────┘ └────────────┘ └────────────┘

BENDIX · 11,67 / 39 Std.
 MO, 10.08.      DI, 11.08.      MI, 12.08. ▸   DO, 13.08.     FR, 14.08.
▌9,17 / 7,8      1,75 / 7,8      0 / 7,8        0,75 / 7,8     0 / 7,8
 — überbucht
┌─────────────┐ ┌─────────────┐ ┌────────────┐ ┌────────────┐ ┌────────────┐
│▌⠿ Material- │ │ ⠿ Eigene    │ │            │ │16:00│↻Sport│ │            │
│  transport  │ │   Fortbild. │ │ Nichts     │ │            │ │ Nichts     │
│  Kreisverb. │ │ Abgeschl.   │ │ eingeplant │ │ Nichts     │ │ eingeplant │
│  ⚠ 2 Tage   │ │16:00│↻Sport │ │            │ │ sonst      │ │            │
│▌⠿ Nachbereit│ │             │ │            │ │            │ │            │
│  Material…  │ │             │ │            │ │            │ │            │
│  ⚠ 2 Tage   │ │             │ │            │ │            │ │            │
└─────────────┘ └─────────────┘ └────────────┘ └────────────┘ └────────────┘

CARLA · 3,5 / 39 Std.
 MO, 10.08.      DI, 11.08.      MI, 12.08. ▸   DO, 13.08.     FR, 14.08.
 0,83 / 7,8      0 / 7,8         2,33 / 7,8     0 / 7,8        0,33 / 7,8
┌─────────────┐ ┌─────────────┐ ┌────────────┐ ┌────────────┐ ┌────────────┐
│08:00│↻Nacht-│ │             │ │08:00│↻Nacht│ │            │ │08:00│↻Nacht│
│     │ berei.│ │ Nichts      │ │─jetzt 09:14│ │ Nichts     │ │     │ berei│
│ ⠿ Blutdruck-│ │ eingeplant  │ │ ⠿ Erste-   │ │ eingeplant │ │            │
│   messgeräte│ │             │ │   Hilfe-   │ │            │ │            │
│   In Bearb. │ │             │ │   Kurs     │ │            │ │            │
└─────────────┘ └─────────────┘ │   Freigabe │ └────────────┘ └────────────┘
                                │   offen    │
                                └────────────┘
```

**360px — die ehrliche Antwort auf „mehrere Personen auf 360px".** Man zeigt **nicht** mehrere Personen
über die Woche. Man zeigt **einen Tag über mehrere Personen**: der Tag ist die Konstante, die Person ist
der Stapel. Der bestehende `TagesWaehler` (eine echte Radiogruppe, ein Tabstop, Pfeiltasten) steht
**einmal** oben und schaltet alle drei Achsen gleichzeitig — dieselbe `?tag=`-Mechanik, kein zweiter
Selektor.

```
Aufgaben
Verteilung
Mi, 12.08. · Stand 09:14 · 1 zu verteilen ·
1 wartet auf Freigabe · 4 überfällig

▌ JETZT                             09:14
▌ ┌────────────────────────────┐
▌ │ ⚠ 4 überfällige Aufgaben   │
▌ └────────────────────────────┘
▌ Die älteste seit 3 Tagen:
▌ Sanitätswache Stadtfest vorbereiten
▌ Bendix · In Bearbeitung · Prüfer Tomke
▌ Sie liegt auf So, 09.08. — außerhalb
▌ dieser Woche.
▌ ┌────────────────────────────────────┐
▌ │  Verbandskästen … verteilen        │
▌ └────────────────────────────────────┘
▌ Freigaben (1) · Personen · Archiv
▌ ──────────────────────────────────────
▌ ALS NÄCHSTES
▌ Bendix ist am Montag mit 9,17 von
▌ 7,8 Std. überbucht.

POSTEINGANG (1)
┌──────────────────────────────────────┐
│ Verbandskästen im Fahrzeugpark prüfen│
│ Frist: Sa, 22.08.                    │
│ Malte · Mittel · 1 Std. · kein       │
│ Nachweis nötig                       │
│ ┌──────────────────────────────────┐ │
│ │   Verteilen                      │ │
│ └──────────────────────────────────┘ │
└──────────────────────────────────────┘

┌ Tag ─────────────────────────────────┐
│ ( )Mo ( )Di (•)Mi ( )Do ( )Fr        │
└──────────────────────────────────────┘

DIE TAFEL · Mi, 12.08.

ALINA · heute 0,25 / 7,8 Std.
┌──────────────────────────────────────┐
│ 08:00 │ ↻ Frühbesprechung    15 Min. │
│ ──────┴──── jetzt 09:14 ──────────── │
│       Nichts mehr eingeplant.        │
└──────────────────────────────────────┘

BENDIX · heute 0 / 7,8 Std.
┌──────────────────────────────────────┐
│       Nichts eingeplant.             │
└──────────────────────────────────────┘

CARLA · heute 2,33 / 7,8 Std.
┌──────────────────────────────────────┐
│ 08:00 │ ↻ Nachtbereitschaft- 20 Min. │
│       │   Übergabe                   │
│ ──────┴──── jetzt 09:14 ──────────── │
│ 08:00 │ Erste-Hilfe-Kurs Nachbe-     │
│       │ reitung · Freigabe offen     │
│       │ 2 Std. · Frist: Fr, 14.08.   │
└──────────────────────────────────────┘

Freigaben (1) · Personenverwaltung · Archiv
Ganze Woche und andere Wochen  → /verteilen
```

Bei drei Personen und einem Tag ist der Bildschirm **einmal scrollbar**, nicht viermal — das ist das
konkrete Maß, an dem der Entwurf sich messen lassen muss.

**Auf `/verteilen`** steht dieselbe `VerteilenTabelle` plus die Tafel **mit `WochenWaehler`** — dort
plant man voraus, auf `/` sieht man diese Woche. Der 404-Riegel (`darfVerteilen`) bleibt unangetastet.

### 3.4 Auftraggeber — Malte, `/` („Die Strecke")

**Er hat mit einer Zeitachse nichts zu tun, und das sage ich hier laut.** Malte stellt eine Aufgabe ein
und gibt sie später frei. Dazwischen liegt Arbeit, die andere planen. Eine Wochenachse würde ihm fünf
Spalten zeigen, in denen fremde Personen fremde Blöcke haben — Information, aus der er keine einzige
Handlung ableiten kann, und die ihn zudem genau zu dem verführt, gegen das Spec §8.3 geschrieben ist
(„Tomke und Malte pfuschen immer wieder rein").

Seine Achse ist deshalb **keine Zeitachse, sondern eine Abhängigkeitsachse**: seine Aufträge, sortiert
danach, wie nah sie an *seiner* Hand liegen. Sechs Ränge, ausgeschrieben:

1. **Wartet auf deine Freigabe** — das Einzige, was er tun *muss*
2. **Zurückgewiesen** — er hat zurückgewiesen, es liegt wieder beim BuFDi
3. **Überfällig** — seine Frist ist verstrichen
4. **Noch nicht verteilt** — liegt bei der Koordination
5. **Läuft** — verteilt oder in Bearbeitung
6. **Abgeschlossen**

**360px:**

```
Aufgaben
Meine Aufträge
8 Aufträge, 7 offen, nichts wartet auf
deine Freigabe.
┌────────────────────────────────────┐
│      Aufgabe einstellen            │        ← Primärknopf, aus SeitenKopf,
└────────────────────────────────────┘          unverändert (e2e-Test 13)

  JETZT                       09:14            ← ohne Kante: kein Befund
  Nichts wartet auf deine Freigabe.
  1 Auftrag ist zurückgewiesen und liegt
  wieder bei Alina.
  3 deiner Aufträge sind überfällig.
  ──────────────────────────────────
  ALS NÄCHSTES
  Fahrzeugcheck Rettungswagen 3 —
  du hast am Montag zurückgewiesen.

EIGENE AUFTRÄGE
┌────────────────────────────────────┐
│ ZURÜCKGEWIESEN                     │        ← Rang-Überschrift, SCHRIFT.kicker
│ Fahrzeugcheck Rettungswagen 3      │
│ ⏱ Morgen fällig                    │
│ Zurückgewiesen · Mittel · 45 Min.  │
│ Empfänger: Alina                   │
├────────────────────────────────────┤
│ ÜBERFÄLLIG                         │
│ Standwache Blutspendetermin        │
│ ⚠ Überfällig seit 2 Tagen          │
│ Verteilt · Mittel · 4 Std.         │
│ Empfänger: Alina                   │
│ ·································· │
│ Materialtransport Kreisverband     │
│ ⚠ Überfällig seit 2 Tagen          │
│ Verteilt · Mittel · 5 Std.         │
│ Empfänger: Bendix                  │
│ ·································· │
│ Nachbereitung Materialtransport    │
│ ⚠ Überfällig seit 2 Tagen          │
│ Verteilt · Niedrig · 4,17 Std.     │
│ Empfänger: Bendix                  │
├────────────────────────────────────┤
│ NOCH NICHT VERTEILT                │        ← Text, NIE ein Link (e2e-Test 14)
│ Verbandskästen im Fahrzeugpark     │
│ prüfen                             │
│ Frist: Sa, 22.08.                  │
│ Zu verteilen · Mittel · 1 Std.     │
├────────────────────────────────────┤
│ LÄUFT                              │
│ Zeltlager-Inventar dokumentieren   │
│ ⏱ Morgen fällig                    │
│ Verteilt · Niedrig · 1,5 Std.      │
│ Empfänger: Alina                   │
│ ·································· │
│ Fahrzeugerstausstattung foto-      │
│ grafisch dokumentieren             │
│ Frist: Mo, 17.08.                  │
│ Verteilt · Mittel · 20 Min.        │
│ Empfänger: Alina · Nachweis: Bild  │
├────────────────────────────────────┤
│ ABGESCHLOSSEN                      │
│ Depotbestand Winterausstattung     │
│ dokumentieren                      │
│ Abgeschlossen · Niedrig · 1,5 Std. │
│ Empfänger: Dörte                   │
└────────────────────────────────────┘

Alles Abgeschlossene im Archiv
```

**Desktop (1280px)** — dieselbe Rangfolge, aber die Ränge stehen als Spaltenköpfe einer zweispaltigen
Anordnung nebeneinander? **Nein.** Genau hier wäre die Versuchung, eine Kanban-Optik zu bauen; sie ist
falsch, weil die Ränge **ungleich groß** sind (heute: 0 / 1 / 3 / 1 / 2 / 1) und Spalten mit einer und
mit fünf Zeilen nebeneinander eine Rangfolge behaupten, die es horizontal nicht gibt. Der Desktop
bekommt dieselbe eine Spalte, nur breiter, mit dem Rang links im Bund:

```
Aufgaben
Meine Aufträge                                                    [ Aufgabe einstellen ]
8 Aufträge, 7 offen, nichts wartet auf deine Freigabe.
──────────────────────────────────────────────────────────────────────────────────────
  JETZT                                                                  STAND 09:14
  Nichts wartet auf deine Freigabe.        │ ALS NÄCHSTES
  1 Auftrag ist zurückgewiesen und liegt   │ Fahrzeugcheck Rettungswagen 3 —
  wieder bei Alina.                        │ du hast am Montag zurückgewiesen.
  3 deiner Aufträge sind überfällig.       │
──────────────────────────────────────────────────────────────────────────────────────
EIGENE AUFTRÄGE
 ZURÜCKGEWIESEN │ Fahrzeugcheck Rettungswagen 3   ⏱ Morgen fällig
                │ Zurückgewiesen · Mittel · 45 Min. · Empfänger: Alina
────────────────┼─────────────────────────────────────────────────────────────────────
 ÜBERFÄLLIG     │ Standwache Blutspendetermin      ⚠ Überfällig seit 2 Tagen
                │ Verteilt · Mittel · 4 Std. · Empfänger: Alina
                │ Materialtransport Kreisverband   ⚠ Überfällig seit 2 Tagen
                │ Verteilt · Mittel · 5 Std. · Empfänger: Bendix
                │ Nachbereitung Materialtransport  ⚠ Überfällig seit 2 Tagen
                │ Verteilt · Niedrig · 4,17 Std. · Empfänger: Bendix
────────────────┼─────────────────────────────────────────────────────────────────────
 NOCH NICHT     │ Verbandskästen im Fahrzeugpark prüfen    Frist: Sa, 22.08.
 VERTEILT       │ Zu verteilen · Mittel · 1 Std.
────────────────┼─────────────────────────────────────────────────────────────────────
 LÄUFT          │ Zeltlager-Inventar dokumentieren         ⏱ Morgen fällig
                │ Verteilt · Niedrig · 1,5 Std. · Empfänger: Alina
                │ Fahrzeugerstausstattung fotografisch dokumentieren
                │ Frist: Mo, 17.08. · Verteilt · Mittel · 20 Min. · Alina · Nachweis: Bild
────────────────┼─────────────────────────────────────────────────────────────────────
 ABGESCHLOSSEN  │ Depotbestand Winterausstattung dokumentieren
                │ Abgeschlossen · Niedrig · 1,5 Std. · Empfänger: Dörte
```

Die beiden Ausprägungen sind hier **dieselbe DOM-Struktur** — der Rang ist ein `<h3>` in
`SCHRIFT.kicker`, das unter 767.98px über der Gruppe steht und darüber links daneben. Das kostet keine
zweite Medienabfrage: `.strecke` ist ein Grid mit `grid-template-columns: 160px 1fr` in der Basis und
`1fr` im bestehenden 767.98px-Block. Zwei Zeilen im einzigen Medienblock.

**Ein leerer Rang wird weggelassen** — „Wartet auf deine Freigabe" erscheint bei Malte gar nicht, weil
er leer ist. Bei Tomke stünde er zuoberst mit „Erste-Hilfe-Kurs Nachbereitung · Carla · Freigabe offen"
und dort läge dann auch die Handlung der Führungskarte.

### 3.5 Was die Fläche um 07:30, um 16:00 und am Sonntag zeigt

Alle vier Bilder sind derselbe Bauplan; nur `lageBufdi` liefert einen anderen Zweig. Alina, dieselbe
Woche:

| Zeitpunkt | DER GRUND | ALS NÄCHSTES | Handlung |
|---|---|---|---|
| **Mi 07:30** | ⚠ Überfällig seit 2 Tagen · Standwache Blutspendetermin | „In 30 Minuten: 08:00 Frühbesprechung (Routine, 15 Min.)" | Bearbeitung starten |
| **Mi 09:14** | dieselbe | „Heute steht nichts mehr im Plan. 2 Aufgaben haben in dieser Woche keinen Platz." | Bearbeitung starten |
| **Mi 16:00** | dieselbe | „Der Tag ist durch. Morgen: Zeltlager-Inventar dokumentieren, vorgeschlagen für 09:00." | **Annehmen: Do, 13.08., 09:00** — die Handlung wandert, weil der Grund keine Handlung *für heute* mehr hat |
| **So 16.08.** | „Wochenende — kein Arbeitstag." (kein Befund, keine Kante) | „Nächster Arbeitstag: Mo, 17.08. Nichts eingeplant, 2 Aufgaben im Posteingang." | keine. Die Seite hat dann **keinen** Primärknopf, und das ist richtig. |
| **So mit Überfälligem** | ⚠ Überfällig seit 6 Tagen · Standwache Blutspendetermin | „Wochenende. Nächster Arbeitstag: Mo, 17.08." | Öffnen (Textlink) — **kein** Primärknopf am Wochenende |

**Die Wochenendfalle, ausgeschrieben, weil sie live ist.** `montagDerWoche` ordnet den Sonntag der
Woche **davor** zu (der `-6`-Zweig), und `ausgewaehlterTag` fällt dann auf `tage[0]` zurück. Am
Sa, 15.08. und So, 16.08.2026 zeigt `/` deshalb die Woche **Mo 10.08.–Fr 14.08.** — die *abgelaufene*.
Nachgerechnet, nicht vermutet:

```
2026-08-14 (Fr) -> Montag 2026-08-10   Mo 10.08 … Fr 14.08
2026-08-15 (Sa) -> Montag 2026-08-10   Mo 10.08 … Fr 14.08
2026-08-16 (So) -> Montag 2026-08-10   Mo 10.08 … Fr 14.08
2026-08-17 (Mo) -> Montag 2026-08-17   Mo 17.08 … Fr 21.08
```

Zwei Wege, und ich wähle den zweiten:

1. **`montagDerWoche` am Wochenende vorwärts rollen.** Verworfen. Die Funktion ist
   Kalenderarithmetik und heute korrekt; sie speist `wochenTage`, `rangGrenzen`, jede Budgetsumme und
   `datum.test.ts`. Ein „am Wochenende meint man die nächste Woche" wäre eine **fachliche** Regel in
   einer **kalendarischen** Funktion, und sie würde still auch die Rückwärtsnavigation
   (`?woche=<-7>`) verbiegen.
2. **Die Achse bleibt ehrlich, die Karte sagt es.** Der `.tagKopf`-Bereich bekommt oben die Zeile
   „Abgeschlossene Woche" (nur wenn `tage[4] < heute`), die Karte trägt Regel 6
   (`kein_arbeitstag`), und `ALS NÄCHSTES` nennt `naechsterArbeitstag(heute)` samt einem Link
   `/plan/<id>?woche=2026-08-17` — „Nächste Woche planen". Eine neue reine Funktion, null Änderung an
   getestetem Verhalten.

---

## 4. Wo der Posteingang lebt

**Aufgaben ohne Termin haben sehr wohl einen Platz in der Zeit — ihre Frist.** Das ist die
Kernbehauptung dieses Entwurfs, und sie hat drei Konsequenzen.

### 4.1 „Ohne Termin" wird neu definiert

Heute heißt der Posteingang der BuFDi `wartetAufEinplanung(a)` = `status === "verteilt" && planDatum
=== null`. Das lässt eine ganze Klasse durchfallen: eine Aufgabe **mit** `planDatum`, das **außerhalb
der angezeigten Woche** liegt. Im Seed ist das „Sanitätswache Stadtfest vorbereiten" — `planDatum`
So, 09.08., seit drei Tagen überfällig, **in keiner einzigen Spalte des Wochengitters sichtbar**, weil
das Gitter Mo–Fr ist. Sie existiert heute auf Bendix' Einstiegsseite schlicht nicht.

Neue reine Funktion in `_lib/anzeige.ts`, neben den bestehenden:

```
ohnePlatzInWoche(a, tage) =
  a.status !== "abgeschlossen" &&
  (a.planDatum === null || !tage.includes(a.planDatum))
```

`wartetAufEinplanung` **bleibt unverändert bestehen** — es ist das Prädikat, an dem die
„Annehmen"-Aktion hängt (`vorschlagOffen` setzt darauf auf), und es hat einen anderen Zweck. Der
Posteingang zeigt `ohnePlatzInWoche`; die „Annehmen"-Taste erscheint innerhalb davon nur bei
`vorschlagOffen`. Zwei Prädikate, zwei Fragen, keine dritte Fassung.

**`tage` ist immer die laufende Woche, nie die angezeigte.** `ohnePlatzInWoche` nimmt `tage` als
Argument, und damit stellt sich sofort die Frage, welche Woche gemeint ist, sobald `/verteilen` einen
`WochenWaehler` bekommt (§2.1). Antwort: **`wochenTage(montagDerWoche(heute))`, festverdrahtet — nicht
die geblätterte Woche.** Der Posteingang ist eine Arbeitsvorratsliste, kein Ausschnitt: blätterte man
zwei Wochen vor, würde plötzlich alles, was in *dieser* Woche liegt, als „ohne Platz" auftauchen, und
die Zahl im `<h2>` änderte sich beim Blättern, ohne dass sich irgendetwas an den Daten geändert hätte.
Die Tafel darunter blättert, der Posteingang nicht — und das ist auch die richtige Bedeutung: „diese
Aufgabe hat in der Woche, in der wir gerade leben, keinen Platz."

### 4.2 Der Posteingang ist selbst eine Achse — eine gröbere

Er wird **nach Frist aufsteigend sortiert, überfällig zuerst**. Keine Fachüberschriften, keine
aufklappbaren Gruppen — die Frist-Marke (§5) an jeder Zeile macht die Staffelung sichtbar, und die
Sortierung macht sie ablesbar. Vier Stufen ergeben sich von selbst:

| Stufe | Bedingung | Marke | im Seed (Mi, 12.08.) |
|---|---|---|---|
| überfällig | `istUeberfaellig` | ⚠ Überfällig seit N Tagen | Sanitätswache Stadtfest vorbereiten (Bendix, 3 T) |
| heute | `faelligAm === heute` | ⏱ Heute fällig | – |
| morgen / diese Woche | `faelligAm` in `tage` | ⏱ Morgen fällig / ⏱ Fr, 14.08. fällig | Zeltlager-Inventar dokumentieren (Alina, Do) |
| später | sonst | Frist: Mo, 17.08. (nackter Text) | Fahrzeugerstausstattung (Alina); Verbandskästen (Koordination) |

### 4.3 Seine Stellung auf der Fläche: **vor** der Achse, nicht daneben, nicht darunter

Der Posteingang steht **zwischen Führungskarte und Achse**. Er ist der Vorrat, aus dem in die Achse
hinein verteilt wird, also gehört er in Leserichtung davor. Auf dem Desktop ist er zugleich die
Ziehquelle: eine Posteingangszeile lässt sich in eine Tagesspalte ziehen (§6.6), was auf `/` (BuFDi)
`einplanenAction` auslöst und auf der Tafel `verteilenAction` bzw. `umverteilenAction`.

**Und wenn er leer ist, ist die Zone weg.** Kein „Posteingang leer" als eigene Überschrift plus Satz auf
der BuFDi-Fläche — die `<h2>`-Zeile und der Kasten verschwinden vollständig, und die Führungskarte sagt
in `ALS NÄCHSTES` „Alles eingeplant." Das ist die Regel „Leerzustand = die Zone weglassen".

**Eine benannte Ausnahme:** auf der Koordinationsfläche bleibt der Satz **„Posteingang leer — alles
verteilt"** samt `data-testid="posteingang-leer"` stehen. Grund: der Posteingang *ist* die Arbeit dieser
Rolle. Eine Fläche, deren Hauptzone spurlos verschwindet, liest sich als Ladefehler — und Spec §9.8
schreibt genau diesen Satz vor. Die Ausnahme ist damit nicht Inkonsequenz, sondern die Anwendung
derselben Regel auf eine Zone, deren Abwesenheit eine Aussage ist.

---

## 5. Die eine Darstellung für Dringlichkeit

Heute drei Formen (`AufgabenListe.tsx:86`, `FreigabeZone.tsx:151`, `VerteilenDialog.tsx:110`) und im
Wochenplan **keine**. Künftig **eine Komponente**, `_ui/Frist.tsx` — gebaut wie `Chip.tsx`: **kein
`"use client"`**, kein Compound-Zugriff, Zeichen ausschließlich aus `_ui/ikonen.tsx`. Das ist Pflicht,
weil zwei ihrer Aufrufer Client-Inseln sind und einer eine Server Component.

```
<Frist aufgabe={a} heute={heute} />
```

### 5.1 Die drei Ausprägungen und die vier Kanäle

| Ausprägung | Wort | Form | Position | Farbe |
|---|---|---|---|---|
| **überfällig** | „Überfällig seit 3 Tagen" (nie nur „Überfällig" — die Zahl ist die Information) | Pille (`.chip`) **und** 4px Kante am Zeilenanfang | erste Zeile ihrer Zone, in jeder Zone | `--auf-achtung-text` auf `--auf-achtung-flaeche` |
| **heute / diese Woche fällig** | „Heute fällig" · „Morgen fällig" · „Fr, 14.08. fällig" | Pille (`.chip`), **keine** Kante | nach den überfälligen | **keine** — `.tonGrau` |
| **später** | „Frist: Mo, 17.08." | **keine** Pille, nackter Text in `--auf-stahl` | zuletzt | keine |

**Die vier Kanäle, benannt:**

1. **Wort** — jede Stufe trägt einen vollständigen Satzteil, nie ein Symbol allein. Die Tageszahl bei
   „seit N Tagen" ist der Unterschied zwischen einer Warnung und einer Information.
2. **Form** — Pille / keine Pille (zwei Stufen) plus Kante / keine Kante (zwei Stufen) ergeben drei
   unterscheidbare Erscheinungen ohne jede Farbe. In Graustufen bleibt die Rangfolge erhalten, weil
   die Pillenflächen `#f6e3e0` → `#e7eaec` → keine monoton heller werden.
3. **Position** — überfällig sortiert überall zuoberst: im Posteingang, in der Strecke des
   Auftraggebers, in jeder `AufgabenListe`, in `FreigabeZone`. Innerhalb einer Tagesspalte **nicht** —
   dort regiert `planRang` (die Person hat sich etwas dabei gedacht), aber die Zeile trägt die Kante.
4. **Farbe** — genau **einmal** im ganzen Vokabular vergeben, für „überfällig", und zwar
   `--auf-achtung-text` (`#8c0d16` hell / `#f0a39c` dunkel). Das ist die getrennte Ampelfarbe, **nicht**
   Suite-Rot; sie liegt bereits in `aufgaben.module.css` und ist mit AA gemessen.

Bewusst **kein** Ocker für „heute fällig": `--auf-ocker-*` trägt bereits den Zustand `freigabe_offen`,
und in derselben Zeile stünden Zustands-Chip und Frist-Marke nebeneinander — genau die Verwechselbarkeit,
gegen die Spec §9.1 die Prioritätsskala formfarbig gebaut hat.

### 5.2 Die fünf Orte, an denen sie erscheint

| Ort | heute | künftig |
|---|---|---|
| `AufgabenListe.tsx` | „⚠ Überfällig", nacktes `<span>`, hinter Frist und Dauer | `<Frist>` **anstelle** des heutigen `Frist: …`-Texts, also an der Datumsstelle |
| `FreigabeZone.tsx` | „⚠ Überfällig" in der Chip-Kopfzeile, ohne Datumsnähe | `<Frist>` in der **Metazeile**, direkt an der Frist |
| `VerteilenDialog.tsx` (`VerteilenTabelle`) | `" · überfällig"` als String hinter dem Datum | `<Frist>` als Inhalt der Spalte „Frist" |
| **`Wochenplan.tsx` — die Lücke** | **nichts** | `<Frist>` in der `EintragZeile`, aber **nur bei `art === "aufgabe"`** und **nur** wenn überfällig oder heute/diese Woche fällig; „später" bleibt weg, sonst trüge jede Zelle ein Datum, das nichts sagt |
| `a/[id]/page.tsx` | nur `<dd>Frist: …` im Metablock | `<Frist>` zusätzlich in der Chip-Zeile, neben `StatusChip`/`PrioritaetChip` |

Dazu, ohne eigene Zeile: die Führungskarte zeigt dieselbe Komponente, unverändert.

### 5.3 Die Kante — eine Leiter mit zwei Werten und einer Regel

Es gibt künftig zwei Kantenbreiten, und die Regel dafür wird hier festgeschrieben, damit sie nicht in
zwei Runden auseinanderläuft:

- **4px** = die Startkante einer **Fläche** (Führungskarte, überfällige Zeile). Übernommen von `.kpi`.
- **3px** = die Startkante eines **Textlaufs** (`.budgetUeberbucht`, unverändert). Ein Textlauf ist keine
  Fläche; 4px an einer 12px-Monozeile liest sich als Marke statt als Betonung.

### 5.4 Keine neue Variable, keine neue Messung

Der Dringlichkeitskanal kommt **vollständig aus dem vorhandenen Vokabular**: `--auf-achtung-text` /
`--auf-achtung-flaeche` (überfällig), `--auf-grau-text` / `--auf-grau-flaeche` (fällig), `--auf-stahl`
(später). Damit schuldet dieser Entwurf **null** neue AA-Messungen, **null** neue Dunkelwerte und
**null** Änderung an `--auf-tinte` — an dem hängt e2e-Test 59 mit exakten Hexwerten.

Und die Zeichen kommen aus `_ui/ikonen.tsx`, ohne Ergänzung: `warnung` (überfällig), `uhr` (fällig),
`kalender` (später, falls überhaupt gesetzt).

### 5.5 Der eine Test, der bricht

`VerteilenDialog.test.tsx:148/152` sichert die **Kleinschreibung** „überfällig" zu (weil dort heute
`" · überfällig"` an das Datum geklebt ist), `AufgabenListe.test.tsx:52/63` die **Großschreibung**
„Überfällig". Die vereinheitlichte Marke schreibt groß („Überfällig seit 3 Tagen") und besteht damit
`AufgabenListe.test.tsx` unverändert; die beiden Zeilen in `VerteilenDialog.test.tsx` ziehen nach. Das
ist der gesamte Preis der Vereinheitlichung, und er ist zwei Zeilen groß.

---

## 6. Die übrigen Flächen

### 6.1 `/a/<id>` — die Aufgabe

Bleibt in Aufbau und Riegel, wie sie ist: `SeitenKopf` · Chip-Zeile · Beschreibung ungekürzt ·
`<dl>`-Metablock (bleibt `<dl>`/`<dd>`, e2e-Test 20 hängt an `role=definition`) · `#nachweis` ·
`#aktion` · `#verlauf`. Drei Änderungen:

1. **`<Frist>` in der Chip-Zeile**, neben Zustand und Priorität — der Ort, an dem man die Dringlichkeit
   sucht, ist oben, nicht im Metablock in der Mitte.
2. **„Anders zuweisen" in der Aktionszone, sichtbar nur für die Koordination und nur im Zustand
   `verteilt`.** Das ist der heute fehlende Aufrufer von `umverteilenAction` — eine Action ohne Weg in
   der Oberfläche ist kein Feature (Prüffrage 1). Sie öffnet dasselbe `VerteilenModal` wie die Tafel.
   **Das Prädikat ist nicht gewählt, sondern nachgelesen:** die Übergangstabelle führt
   `{ von: "verteilt", aktion: "umverteilen", nach: "verteilt", wer: darfVerteilen, planLoeschen: true }`
   (`_lib/lebenszyklus.ts`) — also **wörtlich dasselbe** `darfVerteilen`, das `/verteilen` gatet und das
   auch `verteilen` trägt. Zwei Folgen für die Oberfläche: der Knopf erscheint **nur** bei
   `status === "verteilt"` (aus `in_arbeit` gibt es kein Umverteilen, und die Oberfläche darf keines
   anbieten), und weil `planLoeschen: true` gilt, muss der Knopftext das sagen — „Anders zuweisen (der
   Zeitplan wird dabei geleert)". `aktionsOptionen()` rechnet die Sichtbarkeit serverseitig aus wie bei
   jeder anderen Aktion der Zone.
3. **Genau ein `type="primary"`**: die vorwärts führende Aktion des Zustands (starten → fertig melden →
   freigeben). Zurückweisen, Zurücksetzen, Zurückziehen und „Anders zuweisen" sind Sekundärknöpfe. Heute
   trägt die Zone mehrere gleichrangige.

### 6.2 `/personen`

Unverändert. Sie ist die eine Fläche dieses Moduls, die keine Zeitaussage hat und keine braucht.
`PersonenTabelle` bleibt eine antd-`Table` mit `role=row`/`role=cell` (e2e-Test 63 hängt daran), das
native `<select>` für die Rolle bleibt nativ (Test 63 nutzt `selectOption`), und die Kontextzeile behält
ihr Format „N Personen im Modul, davon M aktiv." **wörtlich** (Test 62 prüft es per Regex).

Eine Ergänzung, die die Tafel nötig macht: die Spalte „Soll-Zeit" bekommt die **Wochenauslastung dieser
Woche** dazu (`6 / 39 Std.`), damit die Personenliste und die Tafel dieselbe Zahl zeigen — gerechnet aus
`tagesBudget`, nicht neu.

### 6.3 `/neu`

Unverändert bis auf zwei Kleinigkeiten: das Fristfeld bekommt unter sich eine Vorschau der Marke, die
diese Aufgabe tragen wird („Diese Aufgabe erscheint als: ⏱ Morgen fällig"), und der Absendeknopf bleibt
der einzige Primärknopf. Das Label „Für mich selbst einstellen" bleibt wörtlich (e2e-Test 15/16), die
Feld-Ids `#af-*` bleiben, und `#af-nachweisart` bleibt bedingungslos gerendert in seiner heutigen
Reihenfolge — Test 61 füllt hart in dieser Folge.

### 6.4 `/archiv`

Bleibt. Die Liste sortiert künftig **nach Abschlussdatum absteigend** statt nach der heutigen Ordnung —
ein Archiv ist die einzige Fläche des Moduls, deren Achse **rückwärts** läuft, und das darf man sehen.
Die Frist-Marke erscheint hier **nicht**: eine abgeschlossene Aufgabe ist per Definition nie überfällig
(`istUeberfaellig` schließt `abgeschlossen` aus), eine Marke „Frist: …" wäre reines Rauschen. Der native
`<select>`-Filter bleibt nativ und serverseitig (e2e-Test 23), h1 bleibt „Archiv".

### 6.5 Genau ein Primärknopf je Fläche — die vollständige Aufstellung

| Fläche | Primärknopf |
|---|---|
| `/` BuFDi | die eine Handlung der Führungskarte — oder **keiner**, wenn die Lage keine hat (Wochenende, reiner Routineneintrag) |
| `/` Koordination | „<Titel> verteilen" der obersten Posteingangszeile aus der Führungskarte; die Tabellenzeilen tragen Sekundärknöpfe |
| `/` Auftraggeber | „Aufgabe einstellen" im `SeitenKopf` — unverändert, e2e-Test 13 |
| `/a/<id>` | die vorwärts führende Zustandsaktion |
| `/neu` | „Aufgabe einstellen" |
| `/plan/<id>` eigen | **keiner** — eine Planungsfläche mit n gleichrangigen Zeilenaktionen |
| `/plan/<id>` fremd | keiner (lesend) |
| `/personen` | „Person anlegen" |
| `/routinen` | „Routine anlegen" |
| `/freigaben` | **keiner** — n gleichrangige Karten; „Freigeben" und „Zurückweisen" sind gleichrangig, und eine davon zur Primäraktion zu erklären wäre eine Empfehlung, die die Oberfläche nicht abgeben darf |
| `/verteilen` | „Verteilen" der obersten Zeile |
| `/archiv` | keiner |

**Eine Stelle, an der die heutige Fassung dieser Regel widerspricht, und die deshalb mitgeht:**
`EinstiegBufdi.tsx`s `posteingangAktionen` rendert „Annehmen: …" als `<Button type="primary">`.
**Dieses `type="primary"` fällt weg** — der Annehmen-Knopf wird sekundär, weil der Primärknopf der
Seite bei der Führungskarte liegt (und dort, wo die Lage *ist* „nimm den Vorschlag an", trägt die Karte
denselben Knopf, dann als einzigen primären). Ausdrücklich hier notiert, weil **kein Gate es fängt**:
e2e-Test 61 klickt den Knopf über seinen Text (`/^Annehmen:/`), nicht über seinen Typ, und `pnpm build`
sieht so etwas ohnehin nie. Der oben in §2.4 vorgeschlagene neue Test („höchstens ein `.ant-btn-primary`
je Fläche") ist genau der Riegel dafür.

### 6.6 Ziehen — und wie es ohne Ziehen geht

`ZiehBereich` bleibt, wie es ist, und bekommt zwei Ziele dazu:

- **Posteingangszeile → Tagesspalte** = `einplanenAction` (BuFDi) bzw. `verteilenAction` (Tafel).
- **Zeile aus Person A → Spalte von Person B** (nur auf der Tafel, erkannt über das `data-person` aus
  §3.3) = `umverteilenAction`. **Nur ziehbar im Zustand `verteilt`** — die Übergangstabelle kennt
  `umverteilen` ausschließlich von dort (§6.1). Eine `in_arbeit`-Zeile bekommt über eine Personengrenze
  hinweg gar keinen Ziehgriff, statt einen Zug anzubieten, den der Server danach ablehnt. Innerhalb
  *einer* Person bleibt sie ziehbar wie heute (e2e-Test 30).

**Falle 11 ist hier scharf.** `locator.dragTo()` löst kein zuverlässiges `dragstart` aus — im Modul
`aufgaben` bei Aufgabe 20 gemessen, der Zug lief in den vollen 90-Sekunden-Timeout. Deshalb:

- Der e2e-Test dafür benutzt `page.mouse.move` / `down` / mehrfach `move` mit Pausen / `up`, wie die
  bestehenden Tests 28–31.
- **Jede Ziehgeste hat einen tastaturbedienbaren Zwilling, und zwar einen, der schon existiert**:
  Reihenfolge → `RangKnoepfe` („Auf"/„Ab", e2e-Test 60 fährt sie mit Tab und Enter ab); Tag wechseln →
  `EinplanenFormular` auf `/plan/<id>`; Person wechseln → „Anders zuweisen" auf `/a/<id>` (§6.1).
  Ziehen ist ab 768px **Zucker auf denselben Actions**, nie der einzige Weg — genau die Zusage, die
  Spec §8.5 schon macht.
- Der Ziehgriff bleibt ein eigenes Textzeichen (`⠿`) mit eigener Bounding-Box neben dem Titel-Link,
  `aria-hidden`, nicht fokussierbar. Kein `opacity: 0`, kein `::before` — beides würde Test 28 rot
  machen, ohne dass man sähe, warum.

---

## 7. Was ich bewusst weggelassen habe

**Ein metrisches Wochengitter Tag × Uhrzeit.** Die naheliegendste Lesart von „Zeitachse", und sie ist
falsch — aus zwei Gründen, die beide messbar sind. Erstens sagt Spec §9.6 es ausdrücklich: das Gitter
hätte auf 390px einen zweiten, eigenen Bildschirm gebraucht, und „genau ein Breakpoint" ist keine
Empfehlung, sondern ein Test (`aufgaben-css.test.ts` verlangt **exakt eine** `@media`-Regel). Zweitens,
und schwerer: **im Seed trägt keine einzige der zwölf Aufgaben eine `planUhrzeit`.** Sämtliche Anker
kommen aus drei Routinen, von denen eine keine Uhrzeit hat. Ein Raster von 08:00 bis 17:00 wäre also zu
über neunzig Prozent leer — das „leere Achsenkreuz", das `docs/design/README.md` ausdrücklich verbietet.
Die Achse dieses Entwurfs ist deshalb **ordinal**: eine Folge verankerter Blöcke, in der die
vorhandene `tagesOrdnung`-Regel (Anker zeigt seine Zeit, Nachfolger erbt sie und zeigt keine)
unverändert weitergilt. Sie ist als Achse lesbar, ohne eine Genauigkeit zu behaupten, die die Daten
nicht haben.

**Eine Kanban-Optik für den Auftraggeber.** Begründet in §3.4: ungleich große Ränge nebeneinander
behaupten eine horizontale Rangfolge, die es nicht gibt.

**Die vier KPI-Kacheln.** Begründet in §2.3, samt dem Einwand, den ich gelten lasse.

**Jede Animation.** Nicht aus Askese: `aufgaben.module.css` darf **genau eine** `@media`-Regel tragen,
und `prefers-reduced-motion: reduce` wäre die zweite. Wer im Modul `aufgaben` eine `transition`
einführt, schuldet die Reduce-Ausnahme und bricht damit zwangsläufig den Riegel — die Abwägung gehörte
dann neu geführt, nicht stillschweigend nachgetragen. Spec §9.4 verbietet ohnehin ausdrücklich die
Aufbau-Choreografie der Tagesspalten und den Zähl-Effekt auf den Kacheln.

**Eine Selbstauffrischung der Führungskarte.** Kein Intervall, kein `router.refresh()`-Takt, kein
Websocket. Die Karte trägt „STAND 09:14" und ist damit ehrlich; ein Hintergrund-POST würde e2e-Test 31
rot machen, und ein Takt wäre die erste Stelle im Modul, an der eine Uhr im Client lebt.

**Ein eigenes Matrixraster für die Tafel.** Es wäre ein zweiter Satz von Tagesspalte, Budgetzeile,
Ankerspur und Mobilumschaltung gewesen — genau die dritte Fassung, gegen die die `core`-Regel steht.
Die Tafel ist dreimal `Wochenplan`.

**Ein Überfälligkeits-Bildschirm.** Er war die dritte Liste derselben Aufgaben. Wer überfällig ist,
steht auf der Tafel mit Kante oder im Posteingang zuoberst.

**Eine Abwesenheitsdarstellung** (Urlaub, Krankheit). Steht in Spec §13 als bewusster Streichposten;
ein abwesender BuFDi hat einen leeren Plan, und das bleibt so. Ich erwähne es, weil eine Zeitachse die
Frage zwangsläufig aufwirft: eine leere Spalte und eine abwesende Person sehen gleich aus. Das ist eine
**erkannte, nicht gelöste** Schwäche dieser Grundform, und sie gehört benannt statt kaschiert.

**Eine Mehrwochensicht auf der Tafel.** `/verteilen` bekommt den `WochenWaehler`; eine Monatsübersicht
bleibt gestrichen (Spec §13).

---

## 8. Die sieben Prüffragen aus `docs/design/README.md`

**1. Hat jede Action einen Weg in der Oberfläche?**
Heute **nein**: von zwanzig exportierten Server-Actions in `actions.ts` hat **`umverteilenAction`
keinen einzigen Aufrufer in der Oberfläche** — sie existiert nur in `actions.test.ts`. Dieser Entwurf
gibt ihr zwei: „Anders zuweisen" in der Aktionszone von `/a/<id>` (§6.1, Prädikat `darfVerteilen`) und
den Zug zwischen zwei Personenachsen auf der Tafel (§6.6). Die übrigen neunzehn behalten ihre
bestehenden Aufrufer unverändert; kein Knopf entfällt, weil kein Formular umgebaut wird.

**2. Führt kein Weg dorthin, wo die aufrufende Person nicht hindarf?**
Jeder Verweis wird mit **demselben Prädikat aus derselben Quelle** gegatet wie sein Ziel:
„Freigaben (1)" ↔ `darfFreigabenSehen`; „Anders zuweisen" und die Tafel-Ziehziele ↔ `darfVerteilen`;
„Routinen verwalten" ↔ `darfRoutinenVerwalten` (nicht `darfPlanAendern`, obwohl beide für eine aktive
BuFDi heute denselben Wert liefern — der Verweis folgt dem Riegel der Zielseite, nicht einer zufällig
gleichwertigen Bedingung); „Woche planen und blättern" ↔ `darfPlanSehen` (heute unbedingt `true`, aber
benannt); „Personenverwaltung" ↔ `darfPersonenVerwalten`. Die Gegenprobe ist scharf und wird von
e2e-Test 14 bewacht: die Auftraggeberfläche darf **kein** `<a href>` mit dem Substring `verteilen`
tragen, auch nicht ausgeblendet — deshalb ist der Rang „Noch nicht verteilt" in §3.4 ausdrücklich Text
und kein Link.

**3. Ist der Zustand ablesbar, ohne zu klicken? Und der nächste Schritt benannt?**
Das ist die Frage, für die dieser Entwurf gebaut ist. Der Zustand steht dreifach: in der Kontextzeile
(alle Zahlen), in der Führungskarte (welche davon *jetzt* zählt) und auf der Achse (wo es liegt). Der
nächste Schritt steht als **ein** Primärknopf mit ausgeschriebenem Ziel — „Annehmen: Do, 13.08., 09:00",
nicht „Annehmen". Und wenn es keinen nächsten Schritt gibt, steht das als Satz da („Wochenende — kein
Arbeitstag.") statt als leerer Bereich.

**4. Führt jede Seite zurück?**
`SeitenKopf` bleibt auf **jeder** Seite unverändert, mit der Brotkrume, deren erster Eintrag „Aufgaben"
auf `/` verlinkt. Die Führungskarte tritt **unter** den Seitenkopf, nie an seine Stelle. Zusätzlich
führt jede neue Verbindung in beide Richtungen: `/` → `/plan/<id>` („Woche planen und blättern"),
`/plan/<id>` → `/` über die Brotkrume; `/` (Koordination) → `/verteilen` („Ganze Woche und andere
Wochen") und zurück; `/` → `/freigaben` und zurück.

**5. Kommen Fehler aus Server-Actions am Feld an?**
Ja, unverändert — alle Formulare bleiben auf `useActionState` mit `fieldErrors` und `aria-describedby`
(`EinplanenFormular`, `AufgabeFormular`, `RoutineFormular`, `PersonenFormular`). Der einzige Ladezustand
im ganzen Entwurf ist `isPending` daraus; kein Skeleton, kein Spinner, keine optimistische Zeile. Die
Führungskarte **hat kein eigenes Formular** — ihre Handlung ist ein `<form action={…}>` mit versteckten
Feldern, genau wie das heutige „Annehmen", und schlägt sie fehl, landet der Fehler auf der Zielfläche
(`/a/<id>` bzw. `/plan/<id>`), nie auf einer technischen Fehlerseite. Destruktive Aktionen bleiben
bestätigungspflichtig (`Popconfirm` beim Zurückziehen und Beenden, `Modal` mit Pflichtbegründung beim
Zurückweisen).

**6. Gibt es Leerzustände — auch für Diagramme?**
Ausgeschrieben, je Zone: Posteingang leer → **Zone weg** (BuFDi) bzw. „Posteingang leer — alles
verteilt" (Koordination, §4.3, mit Begründung für die Ausnahme). Tag leer → „Nichts eingeplant." in der
Spalte, weil eine leere Spalte sonst wie ein Ladefehler aussieht. Woche leer → die Kontextzeile sagt
„0 Aufgaben, 0 von 39 Std. verplant", nie eine leere Zeile — `SeitenKopf` **wirft**, wenn man es
versucht. Führungskarte ohne Befund → „Nichts liegt an." ohne Kante und ohne Primärknopf. Rang leer
(Auftraggeber) → Rang weg. Freigabe leer → „Keine Freigabe offen." Routinen leer → Satz plus
Anlege-Knopf, unverändert.
**Das „leere Achsenkreuz" ist bei einer Zeitachse der eigentliche Prüfstein**, und es ist der Grund für
die zentrale Formentscheidung dieses Entwurfs (§7): eine ordinale Achse hat keine leeren Rasterzellen,
weil sie kein Raster hat. Eine Tagesspalte ohne Einträge ist eine Karte mit einem Satz darin, kein
Gitter mit neun leeren Stunden.

**7. Zeigt die Liste, was sie zeigen soll — Status, Menge, Datum — oder nur einen Link?**
Jede Zeile in jedem Kontext trägt vier Angaben in fester Reihenfolge: **Titel** (Link auf `/a/<id>`) ·
**Frist-Marke** · **Zustand + Priorität** als Chips · **Menge** (`fmtDauer`) und, wo sie eine fremde
Person betrifft, deren **Name**. Konkret nachgezählt an einer Zeile aus dem Seed:
„Standwache Blutspendetermin · ⚠ Überfällig seit 2 Tagen · Verteilt · Mittel · 4 Std. · von Malte ·
eingeplant Mo, 10.08." Die einzige Stelle, an der bewusst weniger steht, ist die Tagesspalte im
Wochengitter: dort entfällt die Frist-Marke der Stufe „später" (§5.2), weil ein Datum, das nichts sagt,
in einer 180px breiten Spalte teurer ist als es wert ist.

---

## Anhang: die Bindungen, gegen die dieser Entwurf geprüft wurde

- **`aufgaben-css.test.ts`** — genau eine `@media`-Regel auf `max-width: 767.98px`; jede `--auf-*` in
  Hell **und** Dunkel; 16 gemessene AA-Kontraste ≥ 4.5 auf literalen `#rrggbb`-Werten; alle
  `padding*`/`gap` in px auf 4/8/12/16/24/32 (Ausnahmen nur `.chip`, `.ohneAnker`, `.backlink`); kein
  `#c8000f`, kein `!important`, kein `var(--ant-*)`, kein `.ant-table-thead`, kein
  `prefers-color-scheme`, kein `data-theme="auto"`, kein ersatzloses `outline: none`.
  → Dieser Entwurf fügt **keine** Variable, **keine** Medienabfrage und **keine** Farbe hinzu; neue
  Klassen (`.fuehrung`, `.strecke`, `.jetztLinie`) bleiben auf der `SPACE`-Leiter (16/12/8/4).
- **`SeitenKopf.test.tsx`** — modulweit kein `Typography`, kein `@ant-design/icons`, kein
  `size="large"|"small"`, kein `useBreakpoint`; `SeitenKopf` bleibt hookfrei, synchron, `<h1>`/`<p>`,
  `.ant-breadcrumb a`, wirft bei leerem `kontext`.
  → Alle Überschriften nativ mit `SCHRIFT.*`, alle Zeichen aus `_ui/ikonen.tsx`, kein `size` irgendwo,
  Umschaltung ausschließlich per CSS.
- **Falle 9** — Tabellen mit `render`-Funktionen bleiben in ihren `"use client"`-Inseln
  (`VerteilenTabelle`, `PersonenTabelle`, `RoutinenTabelle`). `<Frist>` ist bewusst **RSC-fähig**, damit
  `AufgabenListe` (Server Component) es weiter direkt benutzen kann.
- **Falle 11** — jede Ziehgeste hat einen Tastaturzwilling (§6.6); e2e nutzt
  `page.mouse.move/down/up`.
- **Falle 3** — die einzige Farbe auf einer Datenfläche ist `--auf-achtung-text`; Suite-Rot bleibt auf
  Chrome und Primärknöpfen.
