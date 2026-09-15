# Lagerbuch — Schränke als Lagerorte, Chargen sichtbar verteilt (DRK-297)

**Datum:** 2026-09-15 · **Branch:** `claude/drk-297-66f1b6` · **Basis:** `main` (96d3f681) ·
**Ticket:** DRK-297 unter Epic DRK-292

Die Gesprächsnotiz lautete: „verschiedene Chargen an verschiedenen Orten; ‚Schrank 3'; weiterer
Vermerk mit ‚LvD angerufen werden muss'". Das Ticket war ausdrücklich nicht umsetzungsreif; die
offenen Fragen sind in dieser Sitzung mit dem Betreiber geklärt (Kommentare auf DRK-297).

Kernsatz des Betreibers: **„Wir haben zwei Schränke für Helfer im Handlager — und die haben ihre
eigenen Fächer. Dann gibt es daneben noch einen Schrank, der nur zugänglich für GF ist. Es kann
auch vorkommen, dass Items aus der einen Charge an mehreren Orten liegen — und ja, auch im
Fahrzeug."**

## Stand vor dieser Änderung

* `lagerorte` kennt genau **eine** Zeile vom Typ `lager`: den Handlager (`HANDLAGER_ID =
  "handlager"`). Alle anderen Zeilen sind Fahrzeuge. Angelegt werden Lagerorte ausschließlich über
  `_actions/fahrzeuge.ts`; für ein zweites Lager gibt es keine Fläche.
* Der Handlager ist **normativ** (§5.2.1): Artikelliste, Detail-Bestandszahl, Mindestbestand,
  Bestellvorschlag, Verfallsliste, Aussondern, Inventur und die vier KPI-Kacheln rechnen ihn, und
  zwar über `eq(lagerortId, HANDLAGER_ID)`. Rund 24 Fundstellen außerhalb der Tests.
* `buchungen` trägt `charge_id` **und** `lagerort_id`, beide `NOT NULL`. Die Verteilung einer Charge
  über Orte ist also **in den Daten bereits vollständig vorhanden** — sie wird nur nirgends gezeigt.
* `artikel.fach` ist ein Freitext **je Artikel** und wird in der Praxis als grobe Gruppe benutzt
  („Verbandmaterial", „Hygiene"). Er kann nicht ausdrücken, dass zwei Chargen desselben Artikels an
  zwei Plätzen liegen — und ist seit DRK-294 ohnehin neben `kategorie` getreten.
* Einen Zugangshinweis gibt es an keinem Ort des Schemas.

### Zwei Messungen, die den Zuschnitt bestimmen

Beide an einer migrierten Testdatenbank gemessen, nicht geschätzt.

**M1 — eine Charge im Fahrzeug ist in der Oberfläche unsichtbar.** Artikel mit Charge `H-1`
(5 Pkg., Handlager) und Charge `R-9` (7 Pkg., RTW 1). `artikelDetail` liefert `bestand: 5` und für
`R-9` `rest: 0`; `getDetail` filtert danach `rest > 0` und entfernt die Zeile ganz. **Angezeigt:
Bestand 5, eine Charge. Tatsächlich vorhanden: 12 Pkg. in zwei Chargen.**

**M2 — der Abbuchungskern greift ins Leere, sobald Bestand außerhalb der Wurzel liegt.** 12 Stück
auf einem Lagerort `schrank-1`, `fefoAbbuchung(tx, { menge: 3, lagerortId: HANDLAGER_ID })`
liefert **`gebucht: 0`, `teile: []` — ohne Fehler.** `restJeChargeFuerArtikel` filtert mit
`eq(lagerortId, "handlager")`, findet nichts, `fefoVerteilung` filtert alle `rest: 0` weg.

M2 ist der Grund, warum der FEFO-Kern in dieses Ticket gehört und nicht in ein Folgeticket: sobald
die Zugangsauswahl existiert, entsteht Bestand außerhalb der Wurzel, und jede Entnahme,
Nachfüllung und Aussonderung meldete still „0 gebucht".

## Betreiberentscheidungen

**E1 — Schränke werden echte Lagerorte.** Es wird auf Schrankebene gebucht, mit eigenen Mengen.
Verworfen wurde die billigere Variante „Ortsangabe je Charge ohne Mengen": sie hätte Bestand, FEFO
und Inventur unangetastet gelassen, aber der Ort wäre gepflegte Information, die beim Umräumen
still veraltet.

**E2 — Der GF-Schrank steuert keine Sichtbarkeit.** Jeder sieht, dass dort Material liegt, und
liest den Hinweis „Zugang über LvD". Der Schutz ist die Tür, nicht die Software. Begründung des
Betreibers übernommen: ein für Helfer ausgeblendeter Bestand zeigte eine Zahl, die nicht der
Realität entspricht, und niemand könnte erklären, wo der Rest geblieben ist.

**E3 — Der Zugangshinweis hängt am Lagerort**, nicht an Charge oder Artikel, und wird auf einer
neuen Seite „Verwaltung → Lagerorte" gepflegt.

**E4 — Sichtbar in Verwaltung und Helferansicht.** Auch dort, wo jemand mit dem Telefon vor dem
Regal steht (`/m/lagerbuch/a/[artikelId]`), denn das ist der Fall aus der User Story.

**E5 — Bei gleichem Verfall entscheidet eine gepflegte Reihenfolge je Schrank**, welchen Ort eine
Entnahme zuerst anfasst. Der GF-Schrank steht hinten: wer nicht anrufen muss, soll nicht anrufen.
Das Verfallsdatum bleibt unverändert das erste Kriterium.

**E6 — LvD**, nicht LuD. Der Vermerk auf dem Foto meint den Leiter vom Dienst.

## Modell — Hierarchie über `lagerorte.parentId`

Der Handlager bleibt die Wurzel (`parent_id IS NULL`), die Schränke werden seine Kinder. „Handlager"
heißt ab dann **„die Wurzel und ihre Schränke"**.

```
handlager (lager, parent=null)          ← Wurzel, bleibt HANDLAGER_ID
├── schrank-1   (lager, parent=handlager, sortierung 10)
├── schrank-2   (lager, parent=handlager, sortierung 20)
└── schrank-gf  (lager, parent=handlager, sortierung 90, zugangshinweis)
rtw-1 (fahrzeug, parent=null)           ← unverändert
```

**Warum Hierarchie und nicht flach.** Die Alternative — Schränke als gleichrangige Zeilen vom Typ
`lager`, „Handlager" als per Typ ermittelte Menge — spart die Selbstreferenz und verliert dafür
zwei Dinge. Erstens gäbe es keinen Ort mehr, an dem die **bestehenden Buchungen richtig liegen**:
sie lägen auf einem Handlager, das plötzlich ein Geschwister seiner eigenen Schränke wäre. Mit
Hierarchie bedeuten sie schlicht „im Handlager, Schrank noch nicht zugeordnet" — **kein Backfill,
keine geratene Zuordnung von Altdaten**. Zweitens wäre ein zweites Lager (Gerätehaus) später nicht
gruppierbar.

Die Wurzel bleibt damit zugleich der ehrliche Auffangort für alles, was niemand einsortiert hat.

### Migration

Rein additiv, drei Spalten auf `lagerorte`:

| Spalte | Typ | Bedeutung |
| --- | --- | --- |
| `parent_id` | `text`, nullable, FK → `lagerorte.id` | `null` = eigenständiger Ort (Handlager, Fahrzeug) |
| `zugangshinweis` | `text`, nullable | Freitext, `null` heißt „kein Hinweis" — nie ein Leerstring |
| `sortierung` | `integer`, `NOT NULL DEFAULT 0` | Reihenfolge innerhalb des Elternorts (E5) |

Dazu ein Index `idx_lagerorte_parent` auf `parent_id`.

**Kein Backfill.** Alle bestehenden Zeilen bekommen `parent_id = NULL` und `sortierung = 0`; die
Bedeutung jeder bestehenden Buchung ändert sich nicht.

⚠️ **Der Fremdschlüssel zeigt auf dieselbe Tabelle.** `lagerorte` hat bereits einen rückwärts
zeigenden FK auf `fahrzeug_templates` (`schema.ts`), der die Einfügereihenfolge des Imports
bestimmt. Die Selbstreferenz kommt hinzu: ein Import muss Elternzeilen vor Kindzeilen schreiben.
Für den heutigen Bestand ist das folgenlos (nur Wurzeln), für `seedLokal` nicht.

### Der Begriff in Code

Eine neue reine Funktion plus ein Lesepfad, damit „Handlager" an genau einer Stelle definiert ist:

* `_lib/domain/orte.ts` — `teilbaum(orte, wurzelId): string[]`, rein, ohne Datenbank, testbar ohne
  Rendern. Liefert Wurzel **plus** Kinder, sortiert nach `sortierung`, dann `id`.
* `_lib/lesepfade/orte.ts` — `handlagerOrte(db): string[]` und `ortStamm(db)` (Name, Hinweis,
  Sortierung je Ort, für die Anzeige).

**Eine Ebene, nicht beliebig tief.** Schränke haben Kinder nicht nötig; die Fächer innerhalb eines
Schranks bleiben `artikel.fach`. Wer später Tiefe braucht, erweitert `teilbaum` — die Signatur
trägt das schon. Die Verwaltung erlaubt vorerst nur Kinder der Wurzel; ein Schrank kann kein
Elternteil sein.

## A — Aggregate: von einer ID auf eine Menge

Alle Handlager-Prädikate laufen durch vier Funktionen in `_lib/lesepfade/bestand.ts`. Sie bekommen
statt `lagerortId: string` einen **Bereich** `orte: string[]` (`inArray`), und die reinen Funktionen
in `_lib/domain/bestand.ts` ziehen gleich — sie sind die Spezifikation, gegen die jedes Aggregat
seinen Differenztest schuldet (§5.2.4).

| Funktion | heute | künftig |
| --- | --- | --- |
| `bestandJeArtikel` | `eq(lagerortId, X)` | `inArray(lagerortId, orte)` |
| `restJeCharge` | `eq(lagerortId, X)` | `inArray(lagerortId, orte)` |
| `restJeChargeFuerArtikel` | `eq(artikelId, A) ∧ eq(lagerortId, X)` | `eq(artikelId, A) ∧ inArray(lagerortId, orte)` |
| `bestandJeArtikelUndLagerort` | alle Orte, gruppiert | unverändert |

Neu daneben, für die Anzeige:

* `restJeChargeUndOrt(db, artikelId): Map<chargeId, Map<lagerortId, number>>` — **eine** Abfrage,
  `GROUP BY charge_id, lagerort_id`. Dasselbe Muster wie `bestandJeArtikelUndLagerort`; die
  Schachtelung ist Vertrag: außen die Charge, innen der Ort.

⚠️ **`inArray` mit leerer Liste.** Drizzle erzeugt daraus `WHERE false` — richtig, aber der Fall
darf gar nicht entstehen: `handlagerOrte` liefert mindestens die Wurzel. Ein Aufrufer, der eine
leere Liste durchreicht, bekäme lautlos überall 0. `orte.test.ts` hält fest, dass die Wurzel immer
enthalten ist.

⚠️ **Fahrzeuge bleiben einzeln.** `bestandJeArtikel(db, [fahrzeugId])` ist der Normalfall für einen
Fahrzeugbestand — ein Fahrzeug ist keine Wurzel mit Kindern. Wer aus Symmetrie `teilbaum` auch dort
anwendet, ändert nichts; wer `handlagerOrte` dort anwendet, rechnet Handlager-Bestand aufs Fahrzeug.

### Was sich dadurch **nicht** ändert

Mindestbestand, Bestellvorschlag, KPI-Kacheln, Inventurzeilen und die Artikelliste rechnen
weiterhin „den Handlager" — jetzt eben als Wurzel plus Schränke. Eine Buchung auf der Wurzel und
eine im Schrank fallen in dieselbe Summe. **Das ist die Naht, an der Inventur und Umlagerung
unangetastet bleiben können.**

### Was sich sichtbar ändert

Die **Verfallsliste** (`_lib/lesepfade/verfall.ts`) und **Aussondern** hängen an
`restJeCharge(db, HANDLAGER_ID)`. Nach der Umstellung erscheint eine abgelaufene Charge aus dem
GF-Schrank **erstmals** in der Verfallsliste. Das ist fachlich richtig und trotzdem eine
Verhaltensänderung an einer bestehenden Fläche — sie gehört in die Abnahme, nicht in eine Fußnote.

## B — Der FEFO-Abbuchungskern

Der Kern ist die Stelle aus Messung M2 und die einzige, an der dieses Ticket in den Schreibweg
greift.

**`ChargeRest` und `FefoTeil` bekommen je einen Lagerort.** Eine Charge kann in zwei Schränken
liegen; die Verteilung muss deshalb `(Charge, Ort, Menge)` liefern, nicht `(Charge, Menge)`.

```ts
type ChargeRest = { chargeId; verfall; rest; createdAt; lagerortId; ortSortierung };
type FefoTeil   = { chargeId; menge; vonLagerortId };
```

**Die Sortierung bekommt einen vierten Rang** (E5), hinter den drei bestehenden:

1. `verfall` — FEFO selbst, unverändert erstes Kriterium
2. `createdAt` — gleicher Verfall ⇒ ältere Charge zuerst
3. `chargeId` — Determinismus bei sekundengleicher Anlage
4. **`ortSortierung`, dann `lagerortId`** — dieselbe Charge an zwei Orten: der bequemer erreichbare
   zuerst

`fefoAbbuchung` nimmt statt `lagerortId?: string` ein `orte: string[]` und schreibt je Teil eine
Buchung **auf dessen eigenen Ort**, nicht auf die Wurzel.

⚠️ **Die gefährlichste Zeile des Umbaus steht in `umlagerung.ts`.** Das Ziel-Leg wird strikt aus
`teile[]` gebucht (Invariante I3, Netto Null) — es muss den Ziel-Ort nehmen, **niemals
`teil.vonLagerortId`**. Sonst schriebe eine Umlagerung Handlager → RTW die Gutschrift in den
Schrank zurück, aus dem sie kam: netto null, Bestand unverändert, kein Fehler, und das Fahrzeug
bleibt leer. Genau deshalb heißt das Feld `vonLagerortId` und nicht `lagerortId`.

⚠️ **Der Aufruf mit einem einzelnen Fahrzeug bleibt wie er ist**, nur als einelementige Liste.
Das Fahrzeug-Scoping gegen Phantombestand (`domain/bestand.ts`) bleibt damit unangetastet.

## C — Verwaltung → Lagerorte

Neue Seite unter `/m/lagerbuch/verwaltung/lagerorte`, nach dem Vorbild der Fahrzeugverwaltung.

* **Liste:** Wurzel mit ihren Schränken, Name, Kennung, Zugangshinweis, Reihenfolge, Status.
* **Anlegen/Bearbeiten:** Name (Pflicht), Zugangshinweis (Freitext, optional), Reihenfolge (Zahl),
  aktiv. Elternort ist heute immer der Handlager.
* **Stilllegen statt löschen**, wo Buchungen hängen — dieselbe Logik wie `pruefeArtikel`
  (`_actions/loeschen.ts`), erweitert um die Frage „hat dieser Ort Buchungen?" und „hat er Kinder?".

⚠️ **Zwei bestehende Riegel im Löschpfad sind zu prüfen, nicht blind zu übernehmen.**
`_actions/loeschen.ts:95` und `:313` vergleichen auf die nackte `HANDLAGER_ID` und schützen damit
die Wurzel — das bleibt richtig. Ein Schrank ist dagegen stilllegbar und, solange leer, löschbar.
Die ElementArt heißt im Löschpfad historisch `"fahrzeug"` und meint jeden Lagerort; sie wird
**nicht** umbenannt (sie steht in Aufrufern), aber der Entwurf hält fest, dass sie das tut.

⚠️ **Ein stillgelegter Schrank mit Bestand ist kein Randfall, sondern der Normalfall beim
Umräumen.** Bestand an einem inaktiven Ort zählt weiter zum Handlager und wird weiter entnommen —
alles andere ließe Material verschwinden. Inaktiv heißt allein: taucht in der Zugangsauswahl nicht
mehr auf.

## D — Zugang bekommt eine Schrankauswahl

Ohne sie kann nie etwas in einem Schrank landen und die neue Fläche bliebe leer.

Im Zugang-Formular des `ArtikelDrawer` ein Pflichtfeld **„Wohin"** mit den aktiven Handlager-Orten.
Die Wurzel steht als ausdrückliche Option „Handlager (ohne Schrank)" darin — sie ist der ehrliche
Wert für „weiß ich nicht", und sie ist genau das, was alle Altbuchungen bedeuten.

Vorbelegt ist die Wurzel, solange kein Schrank existiert; sobald Schränke existieren, ist das Feld
eine bewusste Wahl ohne Vorbelegung. Kein „zuletzt benutzt" — das rät, und ein geratener Ort ist
schlechter als eine Frage.

Serverseitig prüft `bucheZugang` wie `bucheEntnahme` heute schon: **existiert der Ort, gehört er
zum Handlager-Teilbaum, ist er aktiv?** Drei Bedingungen, ein Satz — sonst entschiede der
Fremdschlüssel und meldete „FOREIGN KEY constraint failed".

## E — Anzeige

### Chargentabelle im Artikeldetail (`_ui/ArtikelDrawer.tsx`)

Eine Zeile **je Charge**, nicht je (Charge, Ort) — sonst kollidiert `rowKey="id"` und antd verhält
sich still falsch. Neue Spalte **„Liegt in"**:

```
Schrank 1: 5 · GF-Schrank: 2 ⓘ · RTW 1: 7
```

Der Hinweis am Ort erscheint als Chip/Tooltip am betreffenden Ort. Die Spalte **Rest** heißt
künftig **„Rest gesamt"** und summiert über alle Orte — heute zeigt sie Handlager und liest sich
als Gesamtbestand.

⚠️ **Der Filter `rest > 0` in `_actions/detail.ts` muss auf die Summe über alle Orte gehen**, nicht
auf den Handlager. Genau dieser Filter ist Messung M1: er entfernt heute jede Charge, die
vollständig im Fahrzeug liegt.

### Helferansicht (`/m/lagerbuch/a/[artikelId]`)

Dieselbe Verteilung, aber **der Zugangshinweis steht vorn** und nicht in einem Tooltip: das ist die
Ansicht für jemanden, der vor dem Regal steht und das Material nicht findet.

⚠️ **Die Helferansicht ist eine Server Component.** Sie bekommt nur die fertige, serialisierbare
Projektion — keine `render`-Funktion über die RSC-Grenze (Falle 9), kein Icon-Import (Falle 7), und
die Bediendichte ist 44 px (`ARBEITSDICHTE`), weil sie auf dem Telefon rendert.

### Unverändert

Artikelliste, KPI-Kacheln, Bestellvorschlag, Inventur und Fahrzeug-Check zeigen dieselben Zahlen
wie vorher — der Teilbaum summiert, was vorher die Wurzel allein war.

## Tests

* `_lib/domain/orte.test.ts` — `teilbaum` rein, ohne Datenbank: Wurzel immer enthalten,
  Sortierung stabil, unbekannte Wurzel ⇒ leer.
* `_db/aggregate.test.ts` **erweitern, nicht ersetzen.** Die Datei fährt heute ausdrücklich
  dieselbe `chargeId` an drei Lagerorten, weil ein weggelassenes Lagerort-Prädikat sonst grün
  bliebe. Dazu kommt: **dieselbe Charge in zwei Schränken plus einem Fahrzeug** — nur so fällt auf,
  wenn ein Bereich versehentlich das Fahrzeug einschließt.
* `_lib/domain/fefo.test.ts` — der vierte Sortierrang: gleiche Charge in zwei Schränken, die
  Entnahme greift zuerst in den mit kleinerer `sortierung`; bei gleicher `sortierung` entscheidet
  die `lagerortId`, damit die Reihenfolge nicht eine Laune der Datenbank ist.
* **Ein Test gegen Messung M2:** Bestand ausschließlich im Schrank, Entnahme über den Handlager —
  gebucht wird die volle Menge, nicht 0.
* **Ein Test gegen die Umlagerungsfalle:** Handlager (Bestand im Schrank) → RTW. Die Gutschrift
  landet am RTW, der Schrank sinkt, netto null.
* e2e (`e2e/lagerbuch-*.spec.ts`): Schrank anlegen, Zugang hinein buchen, Verteilung im
  Artikeldetail und in der Helferansicht sehen, Zugangshinweis lesen. **Echter Abruf**, weil weder
  `build` noch Vitest die RSC-Grenze und keine Layoutbox sehen.

## Nicht in diesem Ticket

Je ein eigenes Ticket im Board, verlinkt auf DRK-297:

1. **Inventur auf (Charge, Schrank) zählen.** Heute zählt sie je Charge über den Handlager; mit
   Schränken ist „12 Stück" eine Summe über Orte, die beim Zählen vor dem Regal nicht hilft. Das
   ist eine eigene Bedienfläche, keine Prädikatsänderung.
2. **Umlagerung Schrank → Schrank.** Der Kern kann es nach diesem Umbau; es fehlt die Bedienung.
3. **Aussondern gezielt je Schrank.** Heute sondert es über den Handlager aus; welcher Schrank die
   abgelaufene Charge trägt, steht dann zwar da, wird aber nicht abgefragt.

## Release-Notiz

**Eine** Notiz, ein Absatz, im selben Commit wie die Änderung. Sie fällt unter „etwas geht, das
vorher nicht ging" und unter „ein Weg ändert sich" (neue Seite in der Verwaltung). Der
Zugangshinweis gehört hinein, weil man sonst vor einem verschlossenen Schrank steht. Die drei
Folgetickets bekommen keine Notiz — sie ändern für Anwender heute nichts.
