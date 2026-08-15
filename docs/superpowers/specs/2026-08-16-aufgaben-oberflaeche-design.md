# Entwurfs-Spec: die Oberfläche des Moduls `aufgaben`

**Stand:** 2026-08-16 · **Gegenstand:** die drei Einstiege, die Routen, der Zustands-Selektor und die
eine Darstellung für Dringlichkeit · **verbindlich für die Umsetzung.**

Diese Spec baut auf **Entwurf A („Der nächste Schritt")** auf, der die perspektivendiverse Jury mit
4:0 gewonnen hat. Sie ist kein Protokoll dieses Entwurfs, sondern seine korrigierte Fassung: jede
von der Jury benannte Schwäche ist behoben oder ausdrücklich als Grenze stehen gelassen, jeder
tödliche Einwand ist beantwortet (§9), und jede Idee aus dem unterlegenen Entwurf B ist geprüft
(§1.3).

**Verhältnis zu den bestehenden Dokumenten.** `docs/superpowers/specs/2026-08-13-modul-aufgaben-design.md`
(im Folgenden **Modulspec**) bleibt in Kraft für Datenmodell, Zustandsmodell, Zugriffsschutz und
Routenumfang. Diese Spec ersetzt aus der Modulspec **ausschließlich** die Bauform der drei Einstiege
(§8.1/§8.2 dort, die KPI-Zeile) — die Aufhebung ist in §1.4 ausgeschrieben und begründet.
`docs/design/README.md` und die elf Fallen aus `CLAUDE.md` gelten unverändert und ohne Ausnahme.

---

## 1. Das Problem — und was diese Spec daran ändert

### 1.1 Der Drei-Punkte-Befund

Die heutige Oberfläche ist **regelkonform und trotzdem schlecht**. Sie besteht jedes Tor: eine
Medienabfrage, Hell/Dunkel-Paarigkeit, gemessener AA-Kontrast, kein `Typography`, kein
`@ant-design/icons`, kein `size`, Abstände auf der SPACE-Leiter. Und sie beantwortet trotzdem die
falsche Frage. Drei Befunde:

1. **Keine Führungskarte.** Alle drei Einstiege bestehen aus einer KPI-Zeile über gestapelten
   Listen. Das beantwortet „was gibt es", nicht „was ist jetzt dran". Vier gleich große Zahlen
   nebeneinander sagen nicht, welche gerade zählt.
2. **„Überfällig" hat drei Darstellungsformen — und im Wochenplan gar keine.** Nachgezählt:
   `AufgabenListe.tsx` und `FreigabeZone.tsx` rendern ein nacktes `<span>` mit Warnzeichen und dem
   Wort; `VerteilenDialog.tsx` klebt `" · überfällig"` klein hinter das Datum; `EinstiegKoordination.tsx`
   hat als einzige Stelle Farbe (KPI-Kachel, `ton="achtung"`); `Wochenplan.tsx` — der Bildschirm für
   „was tue ich heute" — zeigt es **nicht**.
3. **Kein Zustands-Selektor als reine Funktion vor dem Rendern.** Die JSX verzweigt selbst über den
   Bestand. Damit gibt es keine Stelle, an der man erschöpfend prüfen könnte, was die Seite in
   welcher Lage zeigt.

### 1.2 Was diese Spec daran ändert

| Befund | Mittel | Der Riegel, der es hält |
|---|---|---|
| (1) keine Führung | **Eine Führungskarte** je Einstieg, immer da, an erster Stelle, mit **höchstens einem** Primärknopf, der **immer** die Zustandsaktion des Anlasses ist, den die Karte nennt (§3.4, §4.2) | e2e je Rolle: `[data-rolle="fuehrung"]` ist das erste Kind von `[data-testid="aufgaben-flaeche"]`, und darin steht höchstens ein `.ant-btn-primary` (§11) |
| (2) drei Darstellungen | **Eine Komponente** `_ui/Frist.tsx`, sechs Aufrufstellen (§6.2), vier Kanäle mit Farbe zuletzt (§6) | Quelltext-Scan: das Wort „überfällig" darf in `src/app/m/aufgaben/**` nur in `_ui/Frist.tsx` und `_lib/anzeige.ts` stehen — über `.ts` **und** `.tsx` (§6.6) |
| (3) kein Selektor | **`_lib/lage.ts`** — eine reine Funktion, drei Rangleitern, totale Ordnung, kein Auffangzweig (§4) | `_lib/lage.test.ts` erschöpfend: jede Sprosse jeder Leiter, Leerfall, Gleichstand, Wochenende, ausgeschiedene Person (§11) |

### 1.3 Was aus dem unterlegenen Entwurf B übernommen wird — und was nicht

Die Jury hat vier Übernahmelisten geliefert. Jeder Punkt ist geprüft; wo er nicht trägt, steht der
Grund in einem Satz.

| Idee aus B | Urteil | Begründung |
|---|---|---|
| **`ohnePlatzInWoche`** — eine Aufgabe mit `planDatum` außerhalb der Mo–Fr-Woche steht in keiner Spalte | **übernommen, aber umgebaut und weiter gefasst** | Der Befund ist echt und nachgeprüft (`seedLokal.ts:532-537` sagt es wörtlich). B's Fassung ist defekt: sie schiebt eine bewusst auf nächste Woche geplante Aufgabe dauerhaft in den *Posteingang* mit dem Etikett „hat keinen Platz" — wer vorausplant, füllt seinen eigenen Posteingang. Hier wird daraus **kein Anlass und keine Zone**, sondern eine **Fußzeile der Achse** (§3.4, Regel V): „1 Aufgabe liegt außerhalb dieser Woche: Sanitätswache Stadtfest vorbereiten · Fr, 14.08. →". Der überfällige Fall ist ohnehin schon Rang 1 der BuFDi-Leiter. **Das Prädikat heißt hier `ohnePlatzInDerAchse` und fasst einen zweiten Fall mit** (§4.5): eine Aufgabe **ohne** `planDatum`, die auch in keinen Anlass fällt (`in_arbeit` oder `freigabe_offen` ohne Termin). Ohne diese Erweiterung hätte die BuFDi-Fläche ein Loch, und die Partitionszusage aus §4.1 wäre nicht prüfbar. |
| **Wochenendbehandlung** — `montagDerWoche` ordnet Sa/So der Woche davor zu, `/` zeigt am Wochenende die **abgelaufene** Woche | **übernommen** | Nachgerechnet, nicht vermutet: der `-6`-Zweig in `_lib/datum.ts:55-60` stimmt. Übernommen werden B's Mittel: `naechsterArbeitstag(iso)` als neue reine Funktion, die Zeile „Abgeschlossene Woche" über der Achse (nur wenn `tage[4] < heute`), und die Sprosse `kein_arbeitstag`. **Nicht** übernommen wird B's Zusatzregel „am Wochenende gar kein Primärknopf" — Begründung in §4.2. |
| **„ALS NÄCHSTES" als eigene Karten-Zeile** | **übernommen — als Satz ohne eigenen Knopf** | Die Information („was kommt danach") ist wertvoll; der zweite Handlungsort ist der Defekt, an dem B gescheitert ist. Die Zeile steht in der Karte, der Primärknopf bleibt an den führenden Anlass gebunden (§3.4, Regel P). |
| **Knopftext „Anders zuweisen (der Zeitplan wird dabei geleert)"** samt nachgelesenem Prädikat | **übernommen** | `_lib/lebenszyklus.ts:116-122` führt `{ von: "verteilt", aktion: "umverteilen", nach: "verteilt", wer: darfVerteilen, planLoeschen: true }`. Zwei Folgen, beide übernommen: der Knopf erscheint **nur** bei `status === "verteilt"`, und sein Text nennt die Folge. Das repariert zugleich A's eigenen Fehler (§4.2, Koordination Rang 5). |
| **`EinstiegBufdi.tsx:255` ist heute schon `type="primary"`** | **übernommen, mit zwei verschiedenen Gründen** | Nachgesehen, stimmt. Und es ist nicht die einzige Stelle: `EinstiegAuftrag.tsx:72` rendert „Aufgabe einstellen" ebenfalls als `type="primary"`. **Beide werden zu Standardknöpfen** (§11) — aber **nicht aus demselben Grund**, und das Zusammenlegen wäre falsch: `EinstiegBufdi.tsx:255` steht in der Posteingang-Zone, also **innerhalb** von `data-testid="aufgaben-flaeche"`; ohne die Demotion wäre der neue Zählriegel am ersten Tag rot, und kein bestehendes Tor sagte warum (e2e-Test 61 klickt „Annehmen" über seinen Text, Test 13 prüft `href`, nicht den Typ). `EinstiegAuftrag.tsx:72` steht dagegen im `aktionen`-Prop des `SeitenKopf`, also **außerhalb** des Wrappers (§3.3 legt ihn ausdrücklich darunter) — **der Zählriegel könnte diesen Knopf gar nicht rot machen.** Er wird demotiert, weil „höchstens ein Primärknopf" für die **ganze Seite** gilt und die Skizzen in §5.2/§5.3 „Aufgabe einstellen" bereits als Textknopf im Seitenkopf führen. Beide Tests bleiben grün. |
| **`.ant-btn-primary`-Zählriegel** | **übernommen** | Er ist die einzige Stelle, an der „genau ein Primärknopf pro Seite" überhaupt rot werden kann. Gemessen wird in `[data-testid="aufgaben-flaeche"]`, nicht in `main` — die Suite-Shell bringt eigene Bedienelemente mit. |
| **Führungskarte als eigenes Markup, kein `Card`, kein `Alert`** | **übernommen** | Das entfernt A's einzige Falle-5-Exposition vollständig: `.fuehrung { padding: 24px }` und `.ant-card-body` sind beide (0,1,0), antds Stylesheet lädt später und gewinnt durch Dokumentreihenfolge — still, und kein Gate sieht es. Ohne antd-Komponente gibt es keinen Gegenspieler. Ein `Alert type="error"` wäre zusätzlich Suite-Rot auf einer Datenfläche (Falle 3). |
| **Kantenleiter: 4px = Fläche, 3px = Textlauf** | **übernommen, kollabiert auf einen Wert** | Die Regel wird festgeschrieben (§6.4), hat aber nach dem Wegfall der KPI-Kacheln nur noch den 3px-Zweig: `.kpi` war der einzige 4px-Träger, und die Führungskarte bekommt **keine** farbige Kante. Die Regel bleibt trotzdem stehen, damit eine künftige Fläche nicht 3px nimmt. |
| **`data-person="<id>"` plus `<section aria-labelledby>` je Person** | **übernommen** | Sobald „Die Woche der drei" je Person mehr als eine Zahl zeigt, ist das die Adressierung, die `data-rolle` allein nicht leisten kann. Kostet nichts und macht die Zone bedienbar für Screenreader. |
| **`/` der Koordination in `UEBERLAUF_SEITEN`** | **übernommen** | Nachgezählt: `e2e/aufgaben.spec.ts:1156-1173` führt sechs Seiten, `/` als rike ist **nicht** dabei. Diese Spec baut dort eine neue Zone; die Fläche ist damit die eine neue Risikofläche und gehört gedeckt. |
| **Die Tafel (dreimal `Wochenplan`) — auf `/verteilen` statt auf `/`** | **nicht übernommen** | `/verteilen` ist der **Stapelplatz** (§4.4) und muss die leichteste Seite des Moduls bleiben; drei gestapelte Wochenachsen machen sie zur schwersten. Und sie machten `data-rolle` von einer Identität zu einer Klasse — ein Preis, den B selbst ausschreibt. Was Rike vor der Entscheidung braucht, ist die **Zahl**, und die trägt „Die Woche der drei" auf `/`; die Feinverteilung entscheidet sie im Modal, das die Auslastung nach jeder Zuweisung neu rechnet. |
| **Zug „Posteingangszeile → Tagesspalte einer Person" (verteilen und einplanen in einer Geste)** | **nicht übernommen** | Falle 11 macht die e2e-Deckung teuer (schrittweise Maus statt `dragTo()`), die Geste gilt erst ab 768px, und sie umgeht genau das Modal, das die Auslastung neu rechnet — die Beschleunigung kauft man mit einer blinden Entscheidung. Steht in §8 mit dieser Begründung. |
| **Minutengenaue Karte (`jetztMinuten`, „STAND 09:14")** | **nicht übernommen** | Drei unabhängige Gründe: keine einzige Seed-Aufgabe trägt eine `planUhrzeit` (das Feld existiert im Demo-Typ nicht), die Ränge liefen also fast nur auf Routinen; eine uhrzeitabhängige Kontextzeile ist ein Test, der zwischen zwei Läufen kippt, ohne dass sich Daten geändert hätten (`SeitenKopf` garantiert diesen String als nicht-leer, e2e prüft ihn anderswo wörtlich); und die Seite hat keinen Aktualisierungstakt, wäre also nach fünf Minuten Standzeit falsch. |
| **`/personen` bekommt die Wochenauslastung** | **nicht übernommen** | `/personen` verwaltet Zeiträume und Rollen, nicht Auslastung. Eine zweite Anzeigestelle für dieselbe Zahl ist eine zweite Pflegestelle ohne belegten Bedarf — und `/personen` ist im Überlauf-Sweep bereits die engste Tabelle. |

### 1.4 Was diese Spec an der Modulspec ausdrücklich aufhebt

**Modulspec §8.1 und §8.2 schreiben die KPI-Zeile aus vier Kacheln vor** („eine Kachel mit `0`
bleibt stehen und wird nicht klickbar"). Diese Spec streicht sie, und das ist ein Widerspruch zu
einem bindenden Absatz — er wird hier benannt, nicht verschwiegen:

- **Der Befund ist später und trifft genau diese Bauform.** Befund (1) lautet wörtlich: KPI-Kacheln
  plus gestapelte Listen beantworten „was gibt es", nicht „was ist jetzt dran".
- **Die Information geht nicht verloren.** Modulspec §9.4 verlangt ohnehin eine **Kontextzeile** je
  Einstieg, und `SeitenKopf` **wirft** bei leerem `kontext`. Die Zahlen der gestrichenen Kacheln
  stehen dort — **einschließlich der Nullen**, für die §8.1 die stehenbleibende 0-Kachel erfunden
  hatte. **Die Null wird als Wort geschrieben, nicht als Ziffer** („nichts überfällig", nie
  „0 überfällig"): die Zusage ist, dass die Kennzahl *dasteht*, nicht dass sie eine Ziffer trägt,
  und eine Reihe aus „0 X · 0 Y · 0 Z" liest sich als Defekt statt als Entwarnung. Welche Kennzahlen
  in welcher Reihenfolge je Rolle erscheinen, schreibt **§3.5** als Formatvorlage aus — ohne die ist
  die Zusage dieses Absatzes nicht belegbar.
- **Was verschwindet, sind vier Klickziele auf Anker derselben Seite** und die Rangfolge-Losigkeit.

Mit der KPI-Zeile entfallen: `_ui/Kachel.tsx`, `Kachel.test.tsx` und die Klassen `.kpi`, `.kpiLink`,
`.kpiKanteAchtung`, `.kpiKanteOcker`, `.kpiKanteOk`. `Kachel` hat außerhalb der beiden Einstiege
keinen Aufrufer (geprüft). Die drei Kantenklassen werden **nicht** weiterverwendet — die
Führungskarte trägt keine farbige Kante (§6.4) —, also sind sie tote Regeln und gehen mit.

Alles andere der Modulspec bleibt: der Routenumfang (§8), die Aktionszone (§8.4), das Einplanen als
Formular (§8.5), das ganze Darstellungskapitel (§9), die Leerzustandssätze (§9.8).

---

## 2. Die Leitidee, in drei Sätzen

**Jeder Einstieg beginnt mit einer Führungskarte, die die eine Sache benennt, die diese Person jetzt
tun soll — samt der Aktion, die sie tut, und der Knopf gehört immer zu dem, was über ihm steht.**

**Was in der Karte steht, entscheidet eine reine Funktion vor dem Rendern** (`_lib/lage.ts`, Vorbild
`feedback/_lib/cockpit.ts`): eine Rangleiter je Rolle, die den Bestand in genau einen führenden
Anlass und eine geordnete Restmenge zerlegt — die JSX verzweigt nicht mehr, sie stellt dar.

**Alles unterhalb der Karte ist Vorrat, nach demselben Rang geordnet, gedeckelt und mit Zahl — und
Dringlichkeit hat genau eine Darstellung** (Wort mit Zahl, Form, Position, Farbe zuletzt), die auch
dort gilt, wo sie heute fehlt: im Wochenplan.

---

## 3. Informationsarchitektur

### 3.1 Die Routen: vorher / nachher

Der Auftrag legte nahe, `/verteilen` und `/freigaben` zu streichen, weil sie Kopien von Zonen des
Einstiegs sind. **Die Doppelung ist real, die Streichrichtung ist falsch** — belegt am Code:
`verteilen/page.tsx` rendert `VerteilenTabelle` aus `verteilDaten(db, heute)`, und
`EinstiegKoordination.tsx` rendert **dieselbe Komponente aus derselben Ladefunktion**; für
`/freigaben` und `FreigabeZone` gilt dasselbe. Es sind keine zwei Fassungen, die auseinanderlaufen
könnten — es ist **eine Fassung an zwei Orten**. Was entfällt, ist die Kopie im Einstieg, nicht die
Route.

| Route | vorher | nachher | Begründung |
|---|---|---|---|
| `/` | KPI-Zeile + vier gestapelte Listen, rollenabhängig | **Führungskarte · Fläche der Rolle · gedeckelte Zonen in Rangfolge · Fuß** | Der ganze Gegenstand dieser Spec. Route, `data-testid="aufgaben-content"` und die Titel der drei Rollen bleiben wörtlich. |
| `/a/<id>` | Titel · Chips · Erklärung · Meta · Nachweis · Verlauf · Aktionszone | **gleich, drei Änderungen** (§7) | Der einzige Ort mit Verlauf und Nachweis. `<dl>`/`<dd>` bleibt (e2e hängt an `role=definition`). |
| `/neu` | Formular | **unverändert** | Alle `#af-*`-Ids bleiben — der e2e-Rundlauf füllt sie hart in dieser Folge. |
| `/plan/<personId>` | Wochenplan, eigener änderbar | **unverändert**, plus `<Frist>` je Eintrag | Der fremde Plan bleibt völlig aktionsfrei. |
| `/routinen` | Routinenverwaltung | **unverändert** | |
| `/freigaben` | Warteschlange, „meine" / „in Vertretung" getrennt | **bleibt**, wird das Ziel der Führungskarte bei n > 1 | Die Route trägt die 404-Gegenprobe für BuFDi und ist der einzige Ort, der „meine" von „in Vertretung" trennt. Ohne Route gäbe es die Prüfung nicht mehr — eine Abwesenheit kann man nicht auf 404 prüfen. |
| `/verteilen` | Posteingang-Tabelle | **bleibt**, wird der benannte **Stapelplatz** (§4.4) | Trägt die im Quelltext als „DIE KERNZUSAGE DER GESAMTEN AUFGABE" ausgewiesene 404-Gegenprobe (`e2e/aufgaben.spec.ts:273`). Und sie ist die einzige Seite mit echter `Table` im Überlauf-Sweep. |
| `/personen` | Tabelle, Verzeichnissuche | **unverändert** | Die sauberste Fläche des Moduls. Kontextzeile behält ihr Format wörtlich (e2e prüft per Regex). |
| `/archiv` | Liste mit Prioritätsfilter | **unveränderte Anordnung, neue Zeilenkomponente** | Benutzt künftig `AufgabenZeile` (**neu**, §3.6) und damit `<Frist>` — dort immer neutral, weil `istUeberfaellig` `abgeschlossen` ausschließt. |
| — | — | **keine neue Route** | Insbesondere keine `/heute` und keine `/ueberfaellig`: „überfällig" ist keine Sammlung, sondern eine Eigenschaft. |

**Keine Route kommt, keine geht.** Damit ändert sich **keine 200/404-Zusage** — der teuerste Teil
von `e2e/aufgaben.spec.ts` (1822 Zeilen) bleibt unangetastet.

### 3.2 Was von den Einstiegen verschwindet — und wohin es geht

| Heute auf `/` | Wohin |
|---|---|
| vier `Kachel`n mit Ankerzielen derselben Seite | Kontextzeile des `SeitenKopf` (die Zahlen, inkl. der Nullen) + Führungskarte (die Rangfolge) |
| `FreigabeZone` als volle Zone (Koordination und Auftraggeber) | Karte bei n = 1 · Zone „Freigabe offen (N)" mit Deckel bei n > 1 · `/freigaben` als vollständige Fläche |
| `VerteilenTabelle` als volle Zone (Koordination) | Karte bei n = 1 (Modal direkt in der Karte) · Zone „Zu verteilen (N)" mit Deckel bei n > 1 · `/verteilen` als Stapelplatz |
| Sektion „Überfällige Aufgaben" (Koordination) | Sprosse der Leiter (Rang 5a/5b) **und** zwei Zonen — „Überfällig, noch nicht begonnen (N)" und „Überfällig, in Bearbeitung (N)" (§3.5; getrennte Überschriften, weil beide gleichzeitig stehen können). Sie bleiben, weil sie der einzige Ort sind, an dem `umverteilenAction` einen Zeilenweg bekommt |
| Sektion „Zurückgewiesen" (Koordination) | Sprosse (Rang 6) und Zone „Zurückgewiesen (N)", nach derselben Regel |

**Die DOM-Ids `#posteingang` und `#freigabe` behalten ihre Schreibweise — aber nicht ihre
garantierte Anwesenheit.** Die naheliegende Zusage „die Id bleibt bestehen" wäre falsch und
widerspräche Regel R3 (§3.4): eine Zone mit n = 1 entsteht gar nicht, weil die Karte die Aufgabe
schon nennt, und §10 Prüffrage 6 nennt das ausdrücklich strukturell. Ihre Anwesenheit ist damit
**datenabhängig und darf von keinem Test vorausgesetzt werden.** Jede e2e-Zusicherung greift
deshalb auf das **Bedienelement** zu (`getByRole`), nie auf den Zonencontainer — genau daran hängen
die zwei Fixes in §3.3, und das Übersehen dieser Regel ist der Grund, warum die zweite Fundstelle
bei `:1790` zunächst nicht in der Liste stand.

### 3.3 Folgen für `e2e/aufgaben.spec.ts`

| Stelle | Wirkung | Was zu tun ist |
|---|---|---|
| `:45`, `:56`, `:63` Modulwurzel / Erklärseite / Middleware | unberührt | — |
| `:113` „Meine Woche", `:215` „Verteilung", `:329` „Meine Aufträge" (`h1`) | unberührt — `SeitenKopf` bleibt Form und Titel | — |
| `:236` `getByText("Verbandskästen im Fahrzeugpark prüfen")` auf `/` | **bleibt grün**: im Seed ist genau **eine** Aufgabe `eingegangen`, also n = 1, und die Karte nennt bei n = 1 den Titel | Die Zeile wird fragil (eine zweite `eingegangene` Aufgabe im Seed ließe die Karte eine Zahl zeigen). Deshalb zusätzlich eine Zusicherung auf `[data-rolle="fuehrung"]` und ein Kommentar, der die Abhängigkeit benennt. |
| `:273` **Kernzusage** `auftrag` → `/verteilen` = 404 | **unberührt** | — |
| `:363` „Meine Aufträge enthält keinen Weg zum Verteilen" (scannt jedes `href`) | **bleibt grün und wird schärfer** | Festgehalten als Regel: die Führungskarte des Auftraggebers trägt **keinen** Verweis mit dem Teilstring `verteilen` — auch „Noch nicht verteilt" bleibt Text, nie Link. |
| `:380` `/neu` mit `#af-*`-Ids | unberührt | — |
| `:469` `bufdi` → `/freigaben` = 404 | unberührt | — |
| **Zwei** Stellen mit `#posteingang li` → `/^Annehmen:/`: `:1483-1485` (Test `:1414`, „der volle Durchlauf", Schritt 3) **und** `:1790-1793` (Test `:1701`, „Leerer Start: der volle Rundlauf ohne Seed-Vorleistung", Schritt 5) | **beide brechen** — aus zwei unabhängigen Gründen: (a) die Zone kann durch Regel R3 entfallen, wenn die Aufgabe in der Karte steht; (b) die Zone ist gedeckelt und nach Frist sortiert, die frisch erzeugte Aufgabe liegt 14–21 Tage in der Zukunft und rutscht ans Ende. Bei `:1790` trägt schon (a) allein: die frisch angelegte Person hat nach Schritt 4 **genau eine** wartende Aufgabe, also n = 1, also nennt die Karte sie und R3 löscht die Zone; `expect(posteingangZeile).toHaveCount(1)` in `:1791` würde 0. | **Ein** Fix, **zweimal angewendet**: `page.getByRole("button", { name: /^Annehmen:/ })` statt des Zugriffs über den Zeilencontainer. Die Begründung ist an beiden Stellen identisch und wird **einmal** geschrieben (hier) und an der zweiten Stelle referenziert. Der Test verliert eine Positionsannahme, die er nie begründet hat. **Ausdrücklich abgelehnt** ist die Alternative, `#posteingang` eine benannte Ausnahme von R3 zu geben: eine Zone, die eine Aufgabe wiederholt, die schon in der Karte steht, ist genau der Befund, gegen den diese Spec geschrieben ist. |
| Tests 28–31 Ziehen (`data-rolle="wochengitter"`, `data-tag`, `data-aufgabe-id`, DOM-Reihenfolge) | unberührt | Die Achse ändert ihre Struktur nicht. |
| Tests 32–34 Umschaltung 390/820/1280 (`tagesliste` ⇄ `wochengitter`) | unberührt | `/` der BuFDi trägt weiterhin genau **eine** Achse. „Die Woche der drei" ist **keine** Achse, sondern eine Zahlen-Zone (§5.2) — `data-rolle` bleibt damit eine Identität. |
| Test 59 Dunkelmodus, exakter `--auf-tinte`-Hexwert | unberührt | **Keine bestehende `--auf-*`-Variable ändert ihren Wert, und es kommt keine neue dazu** (§6.5). |
| Test 60 Tastaturbedienung, Fokus über `outline` | unberührt, **wenn man es weiß** | Die Führungskarte darf ihren Fokus nicht als `box-shadow` bauen; der bestehende Fokus-Block deckt `a`/`button` und wird um `.fuehrung a` nicht erweitert, weil die Karte selbst nicht fokussierbar ist. Sie fügt der Tab-Kette höchstens drei Stopps hinzu. |
| Test 62 `/personen`-Kontextzeile per Regex | unberührt | Die Kontextzeile dieser Seite behält ihr Format wörtlich. |
| Überlauf-Sweep (`UEBERLAUF_SEITEN` × 390/768/820/1280 = 24 Fälle) | **Deckung wird zu klein** | Die Liste führt heute `/` für die drei BuFDis, `/verteilen`, `/personen`, `/archiv` — **nicht** `/` der Koordination und **nicht** `/` des Auftraggebers. Beide Einstiege werden hier neu gebaut und beide fehlen; neu aufgenommen werden **`/` als rike** und **`/` als malte**: 8 Seiten × 4 Breiten = **32 Fälle**. Zu 360px siehe §9, Fall S4 — die naheliegende fünfte Breite wird **nicht** global aufgenommen, sondern gezielt. |
| — | **neu** | Drei Tests (Alina, Rike, Malte): `[data-rolle="fuehrung"]` ist das **erste Kind** von `[data-testid="aufgaben-flaeche"]`, und darin steht **höchstens ein** `.ant-btn-primary`. |

**Warum ein neuer Wrapper `data-testid="aufgaben-flaeche"` nötig ist.** Die naheliegende Zusicherung
„die Führungskarte ist das erste Element in `[data-testid="aufgaben-content"]`" wäre **falsch**:
`page.tsx:81` legt diesen Wrapper um den ganzen Einstieg, der `SeitenKopf` steht darin. Ein Test,
der etwas anderes misst als sein Name sagt, gehört in dieselbe Familie wie die Fallen 10 und 11.
Also bekommt der Inhalt **unter** dem `SeitenKopf` einen eigenen Wrapper; `aufgaben-content` bleibt
unverändert, weil e2e-Tests daran hängen. Der Primärknopf-Zähler misst denselben Wrapper — dadurch
kann ein Primärknopf der Suite-Shell die Zusage weder falsch-rot machen noch dazu zwingen, sie auf
„höchstens zwei" abzuschwächen.

**Die Belegungen der Führungskarte gehören nicht ins e2e.** Sie sind ein reiner Selektor über
Datenzeilen und werden in `_lib/lage.test.ts` erschöpfend geprüft. e2e prüft nur die drei Aussagen,
die ein Selektor-Test strukturell nicht treffen kann: die Karte ist da, sie steht an erster Stelle,
sie trägt höchstens einen Primärknopf.

### 3.4 Der Aufbau, der für alle drei Einstiege gilt

```
1  Seitenkopf              Brotkrume (12) · <h1> 24/600 + Textknoepfe · Kontextzeile (12, gedaempft)
─── data-testid="aufgaben-flaeche" ──────────────────────────────────────────────────────────
2  FUEHRUNGSKARTE          genau eine, immer da, data-rolle="fuehrung",
                           der einzige Primaerknopf der Flaeche
3  Die Flaeche der Rolle   BuFDi -> die Woche · Koordination -> „Die Woche der drei"
                           Auftrag -> „Eigene Auftraege"      immer da, auch leer
4  Die uebrigen Anlaesse   als Zonen, in Rangfolge, je mit Zahl in der Ueberschrift, gedeckelt
5  Fuss                    Querverweise als Textlinks
```

**Sechs Regeln legen den Aufbau vollständig fest.**

- **R1 — Die Karte zeigt `anlaesse[0]`.** Ist die Liste leer, zeigt sie die Belegung **Ruhe**. Es
  gibt keinen dritten Fall und keinen zweiten Rückgabeweg.
- **R2 — Die Fläche der Rolle steht immer, auch leer.** Leer bedeutet **ein ausgeschriebener Satz**
  statt einer Tabelle; die Sätze existieren bereits („Posteingang leer — alles verteilt", „Nichts
  eingeplant.", Modulspec §9.8).
- **R3 — Zonen sind alle Anlässe ab Position 2 in `anlaesse`, plus der Anlass auf Position 1 genau
  dann, wenn er mehr als eine Aufgabe trägt** — und ohne die Anlässe, die bereits die Fläche der
  Rolle sind. **„Position" ist hier nicht „Rang".** Das Wort **Rang** meint in dieser Spec
  ausschließlich die Sprosse der Leiter (§4.2, in §3.5 als R1…R6 geführt); die **Position** ist der
  Platz in der nach Rang gefilterten und sortierten Liste `anlaesse`, und die beiden fallen fast nie
  zusammen: Rikes Karte trägt Leiter-**Rang 3** und steht auf **Position 1**, weil die Ränge 1 und 2
  bei ihr leer sind. Die Verwechslung wäre teuer, weil `lage.test.ts` genau diese Regel prüft.
  Daraus folgt: bei n = 1 nennt
  die Karte die Aufgabe und **keine Zone wiederholt sie**; bei n > 1 nennt die Karte die Zahl und
  **keine Aufgabe ist bevorzugt**. Eine **leere Zone ist strukturell ausgeschlossen**, nicht
  verboten.

  **Welche Anlässe „bereits die Fläche der Rolle" sind, ist keine Auslegungsfrage, sondern eine
  Tabelle.** Der Maßstab: ausgenommen ist ein Anlass genau dann, wenn **jede** seiner Zeilen auf der
  Fläche der Rolle mit Titel, Zustand und Frist vollständig dasteht — dann wäre die Zone eine
  wortwörtliche Wiederholung zwei Bildschirmzentimeter tiefer.

  | Rolle | ausgenommene Anlässe | warum, und woran die Ausnahme hängt |
  |---|---|---|
  | **BuFDi** | Rang 3 `in_arbeit` · Rang 4 `kein_arbeitstag` · Rang 5 `heuteOffen` | Rang 4 ist kein Bestand, sondern eine Aussage über den Tag — es gibt nichts zu listen. Rang 3 und 5 stehen vollständig in der Wochenachse, **und diese Aussage hängt an Regel V**: eine `in_arbeit`-Aufgabe ohne Platz in der Achse (kein `planDatum`, oder eines außerhalb `tage`) fängt die Achsen-Fußzeile über `ohnePlatzInDerAchse` (§4.5). Wer die Fußzeile schmaler fasst, muss diese Ausnahme mit zurücknehmen — sonst entsteht genau das Loch, das §4.1 zu schließen hat. Zonen bekommen also: Rang 1 (überfällig), Rang 2 (zurückgewiesen), Rang 6 (`wartetAufEinplanung` → `#posteingang`). |
  | **Koordination** | **keiner** | „Die Woche der drei" zeigt **Zahlen je Person**, keine Aufgabenzeilen. Es gibt dort nichts, was eine Zone wiederholen könnte; alle sechs Sprossen können eine Zone bilden. |
  | **Auftrag** | **alle** | „Eigene Aufträge" zeigt **jede** eigene Zeile, ungedeckelt (Regel D unten). Jede Zone wäre eine vollständige Wiederholung. **Für diese Rolle existiert Ebene 4 nicht** — das ist kein toter Zweig, sondern die richtige Antwort auf eine Fläche, die ihren Bestand ohnehin ganz zeigt. Die Skizze §5.3 zeigt deshalb keine Zone; hier steht der Satz dazu. |
- **D — Ein Deckel setzt einen Ausgang voraus.** Eine **Zone** (Ebene 4) **mit Sammelziel** zeigt
  höchstens **fünf** Zeilen und schließt mit „… und 47 weitere → /verteilen" (bzw. `/freigaben`,
  `/plan/<eigene>`) ab. Das ist die Antwort auf „60 offene Aufgaben": ohne Deckel schöbe der Vorrat
  die Übersicht aus dem Bild, für die die Seite gebaut ist. Fünf, weil das die Zeilenzahl ist, die
  auf 360px noch über der Falzkante einer Zone steht.

  **Eine Zone ohne Sammelziel wird nicht gedeckelt**, sie ist vollständig. Der Grund ist die
  Abwägung, nicht die Bequemlichkeit: ein Deckel braucht ein **Sammelziel** — eine Fläche, die
  *alle* Zeilen zeigt —, und Einzelverweise auf `/a/<id>` sind keins. §3.1 verbietet ausdrücklich,
  für „überfällig" oder „zurückgewiesen" eine Route zu erfinden („überfällig ist keine Sammlung,
  sondern eine Eigenschaft"). Bliebe der Deckel trotzdem stehen, wären ab der sechsten Zeile
  Aufgaben **nur noch über `/a/<id>` erreichbar, das man erst kennen muss** — wortwörtlich der
  Defekt, den Fall S1 schließt. Zwischen „zu lang" und „unauffindbar" ist zu lang das kleinere Übel;
  die Lastsorge aus Fall S3 trifft ohnehin nur den Posteingang, und der **hat** ein Sammelziel.

  **Die Fläche der Rolle (Ebene 3) ist aus demselben Grund ausgenommen**, und das ist keine
  Inkonsequenz: eine Zone ist ein *Vorrat*, aus dem heraus man an einen anderen Ort geht. „Eigene
  Aufträge", „Die Woche der drei" und die Wochenachse sind kein Vorrat, sondern die Fläche selbst.
  Maltes acht Aufträge stehen vollständig auf `/` — `/archiv` zeigt nur die abgeschlossenen und wäre
  für die offenen ein Deckel ins Leere.

  **Die vollständige Zuordnung Anlass → Zonenüberschrift → Deckelziel** steht in §3.5; ohne sie ist
  weder `ANLASS_TEXT: Record<AnlassArt, …>` noch Schritt 1 aus §11.4 schreibbar, weil ein `Record`
  jeden Schlüssel verlangt.
- **P — Der Primärknopf gehört immer zu dem, was über ihm steht.** Die Karte nennt genau einen
  Anlass, und die Primäraktion ist **die Zustandsaktion dieses Anlasses** — nie die eines anderen.
  Gibt es für diese Person mit dieser Aufgabe in diesem Zustand keine Zustandsaktion, gibt es
  **keinen Primärknopf**; die Karte trägt dann nur Textknöpfe, und die Abwesenheit ist die Auskunft.
  „Genau ein Primärknopf pro Seite" ist damit als *höchstens einer* gelesen — ein roter Knopf ohne
  Zustandswechsel wäre eine Behauptung.
- **V — Die Achse sagt, wenn sie unvollständig ist.** Trägt eine Person Aufgaben, die in keiner der
  fünf Tagesspalten stehen können (`ohnePlatzInDerAchse`, §4.5 — `planDatum` außerhalb der Woche
  **oder** gar kein `planDatum` bei `in_arbeit`/`freigabe_offen`), schließt die Achse mit einer
  Fußzeile ab: „1 Aufgabe liegt außerhalb dieser Woche: <Titel> · <Plandatum> →"; für den
  terminlosen Fall steht statt des Datums **„ohne Termin"**. Diese Fußzeile ist der Ort, an dem die
  Restmenge der BuFDi-Leiter sichtbar wird (§4.1) — sie ist damit nicht Kosmetik, sondern der
  Beleg für die Partitionszusage. Und liegt die gezeigte Woche ganz in der
  Vergangenheit (`tage[4] < heute`, der Wochenendfall), steht über der Achse „Abgeschlossene Woche".
  Das ist **keine Zone** — es ist ein Vorbehalt auf der Achse selbst, und deshalb fällt es nicht
  unter R3 und nicht unter „Leerzustand = die Zone weglassen".

**Die Führungskarte ist der eine benannte Verstoß gegen „Leerzustand = die Zone weglassen".** Sie
ist keine Zone, sondern die Führung der Seite. „Nichts ist dringend" ist eine Aussage, keine Leere —
und für eine Koordinatorin die wertvollste, die die Seite treffen kann. Ließe man sie im Ruhefall
weg, sprängen alle darunterliegenden Flächen um eine Kartenhöhe nach oben, und der Ort, an dem man
morgens hinsieht, wäre mal da und mal nicht.

**Wie die Karte laut wird, ohne Farbe zu verbrauchen.** Keine Tönung, keine farbige Kante. Das Modul
gibt Farbe bereits für sechs Zustandstöne und drei Prioritätsgewichte aus; ein siebter Ton „hier ist
die Führung" wäre eine Bedeutung zu viel auf einem vollen Kanal. Die Karte ist an **drei
nicht-farbigen Merkmalen** erkennbar: sie ist die einzige Fläche mit 24px Innenpolster (die
Tagesspalten haben 12), sie trägt als einzige einen Kicker in Versalien plus eine Überschrift in
`SCHRIFT.unterTitel`, und sie trägt als einzige einen Primärknopf.

### 3.5 Die vollständige Beschriftungstabelle — jeder `AnlassArt` ein Schlüssel

`ANLASS_TEXT` ist ein `Record<AnlassArt, …>` und verlangt damit **jeden** Schlüssel. Die Liste der
Schlüssel unten ist **abschließend**; jeder Eintrag hat **vier** Felder.

- **Kicker** — steht in der Karte, Versalien (§3.4). Hier ausgeschrieben.
- **Zonenüberschrift** — Ebene 4. Hier ausgeschrieben. „—" heißt: dieser Anlass bildet **nie** eine
  Zone (R3-Ausnahme aus §3.4).
- **Deckelziel** — der Fuß der Zone. Hier ausgeschrieben. „kein Ziel" heißt: die Zone ist
  **ungedeckelt** und vollständig (Regel D).
- **Satz** — die Prosa für den Kartenkörper und für die Zeile „ALS NÄCHSTES". Sie steht **nicht**
  hier, sondern in der Spalte „Die Karte zeigt" der drei Leitertabellen in §4.2, je Anlass in beiden
  Ausprägungen (n = 1 und n > 1). Die Aufteilung ist Absicht — der Satz gehört neben die Sprosse,
  die ihn erzeugt, und eine zweite Abschrift hier liefe von ihr weg —, aber sie muss beim Bau
  **zusammengezogen** werden: `ANLASS_TEXT[art].satz` kommt aus §4.2, die drei übrigen Felder aus
  der Tabelle unten. Wer nur diese Tabelle liest, bekommt drei von vier Feldern.

**Ein Beispiel, damit die Zusammenführung nicht geraten wird.** `koordFreigabeOffen`: Kicker
„WARTET AUF FREIGABE" · Zonenüberschrift „Freigabe offen (N)" `id="freigabe"` · Deckelziel
`/freigaben` (nur bei `darfFreigabenSehen`) · Satz aus §4.2, Koordination Rang 4 — n=1: „X hat
„Titel" fertig gemeldet.", n>1: „N Aufgaben warten auf Freigabe (M in Vertretung)."

| `AnlassArt` | Kicker in der Karte | Zonenüberschrift | Deckelziel |
|---|---|---|---|
| **Koordination** | | | |
| `koordOhneTraeger` (R1) | ZUGEWIESEN AN EINE NICHT MEHR AKTIVE PERSON | „Ohne aktiven Träger (N)" | **kein Ziel** — ungedeckelt |
| `koordPosteingangUeberfaellig` (R2) | POSTEINGANG · ÜBERFÄLLIG | „Überfällig im Posteingang (N)" | `/verteilen` |
| `koordPosteingang` (R3) | POSTEINGANG · NOCH NIEMANDEM ZUGEWIESEN | „Zu verteilen (N)" `id="posteingang"` | `/verteilen` |
| `koordFreigabeOffen` (R4) | WARTET AUF FREIGABE | „Freigabe offen (N)" `id="freigabe"` | `/freigaben`, **nur bei** `darfFreigabenSehen(akteur, heute)`; sonst kein Ziel |
| `koordUeberfaelligVerteilt` (R5a) | ÜBERFÄLLIG · NOCH NICHT BEGONNEN | „Überfällig, noch nicht begonnen (N)" | **kein Ziel** — ungedeckelt |
| `koordUeberfaelligInArbeit` (R5b) | ÜBERFÄLLIG · IN BEARBEITUNG | „Überfällig, in Bearbeitung (N)" | **kein Ziel** — ungedeckelt |
| `koordZurueckgewiesen` (R6) | ZURÜCKGEWIESEN | „Zurückgewiesen (N)" | **kein Ziel** — ungedeckelt |
| `koordRuhe` | NICHTS LIEGT AN | — | — |
| **BuFDi** | | | |
| `bufdiUeberfaellig` (R1) | ÜBERFÄLLIG | „Überfällig (N)" | **kein Ziel** — ungedeckelt |
| `bufdiZurueckgewiesen` (R2) | ZURÜCKGEWIESEN VON <Prüfer> | „Zurückgewiesen (N)" | **kein Ziel** — ungedeckelt |
| `bufdiInArbeit` (R3) | IN BEARBEITUNG | — (Achse) | — |
| `bufdiKeinArbeitstag` (R4) | WOCHENENDE | — | — |
| `bufdiHeuteOffen` (R5) | HEUTE | — (Achse) | — |
| `bufdiWartetAufEinplanung` (R6) | EINZUPLANEN | „Einzuplanen (N)" `id="posteingang"` | `/plan/<eigene>` |
| `bufdiRuhe` | NICHTS MEHR OFFEN | — | — |
| **Auftrag** | | | |
| `auftragFreigabe` (R1) | WARTET AUF DEINE FREIGABE | — („Eigene Aufträge") | — |
| `auftragUeberfaellig` (R2) | ÜBERFÄLLIG | — („Eigene Aufträge") | — |
| `auftragUnverteilt` (R3) | NOCH NICHT VERTEILT | — („Eigene Aufträge") | — |
| `auftragRuhe` | ALLES LÄUFT | — | — |
| **Die drei Negativsätze** — eigene Schlüssel, kein Sonderfall im Typ (§4.2) | | | |
| `koordNegativ` | — (nie Karte) | — | — · Satz: „Sonst liegt nichts an." |
| `bufdiNegativ` | — (nie Karte) | — | — · Satz: „Sonst ist für heute nichts offen." |
| `auftragNegativ` | — (nie Karte) | — | — · Satz: „Nichts wartet auf deine Freigabe." |

Zwei Anmerkungen, weil sie sonst beim Bau neu erfunden werden. **Erstens** tragen Rang 2 und Rang 3
der Koordination bzw. 5a und 5b **verschiedene** Zonenüberschriften, obwohl beide Paare fachlich
benachbart sind: sie können **gleichzeitig** Zonen sein (eine führt, die andere nicht), und zwei
Zonen mit derselben Überschrift auf einer Seite wären ein Anzeigefehler, den kein Riegel fände.
**Zweitens** ist das Deckelziel von `koordFreigabeOffen` an `darfFreigabenSehen` gebunden und nicht
an die Zone: ein Auftraggeber, der nicht Koordination ist, bekommt auf `/freigaben` 404
(`zugang.ts:534-536`, `freigaben/page.tsx:55`) — ein Deckel dorthin wäre ein Knopf auf eine
404-Seite.

**Die Kontextzeile — Format je Rolle, verbindlich.** `SeitenKopf` wirft bei leerem `kontext`, die
Zeile ist also Pflicht; sie trägt die Zahlen der gestrichenen KPI-Kacheln (§1.4). Trennzeichen ist
durchgehend „ · ", die Reihenfolge ist fest, und **eine Kennzahl mit dem Wert 0 wird als Wort
geschrieben** („nichts …"), nie als Ziffer.

| Rolle | Formatvorlage | Beispiel (Seed, Mo 17.08.) |
|---|---|---|
| **BuFDi** | `KW <n> · <a> eingeplant · <x> von <y> Std. · <b> im Posteingang · <c> überfällig` | „KW 34 · 2 Aufgaben eingeplant · 6 von 39 Std. · 2 im Posteingang · nichts überfällig" |
| **Koordination** | `<a> zu verteilen · <b> wartet auf Freigabe · <c> überfällig · <d> zurückgewiesen` | „1 zu verteilen · 1 wartet auf Freigabe (in Vertretung) · 1 überfällig · 1 zurückgewiesen" |
| **Auftrag** | `<a> Aufträge · <b> offen · <c> unverteilt · <d> wartet auf deine Freigabe` | „8 Aufträge · 7 offen · 1 unverteilt · nichts wartet auf deine Freigabe" |

Der Klammerzusatz „(in Vertretung)" tritt bei der Koordination genau dann hinzu, wenn **alle**
gezählten Freigaben in Vertretung sind — er ist eine Präzisierung derselben Zahl, keine zweite.
`ohneAktivenTraeger` steht **nicht** in der Kontextzeile: der Fall ist Rang 1 und damit entweder die
Karte oder eine ungedeckelte Zone, also ohnehin an der auffälligsten Stelle der Seite; eine fünfte
Zahl für einen Fall, der im Regelbetrieb null ist, verdünnte die vier, die täglich zählen.
Am Wochenende tritt bei der BuFDi „(abgeschlossen)" an die KW-Marke (§5.4).

### 3.6 `_ui/AufgabenZeile.tsx` ist **neu** — und was mit `AufgabenListe.tsx` geschieht

Die Komponente existiert heute **nicht**; `grep -rn "AufgabenZeile" src/ e2e/` liefert null Treffer.
Heute trägt `_ui/AufgabenListe.tsx` diese Rolle für `archiv/page.tsx`, `Wochenplan.tsx` und die drei
Einstiege. Wo diese Spec `AufgabenZeile` im Präsens nennt (§3.1, §5.3, §6.2, §7, §10 Prüffrage 7),
ist **die neue Komponente** gemeint, angelegt in §11.4 Schritt 4.

- **`AufgabenZeile.tsx` ist eine Extraktion**, kein Neubau: der `<li>`-Rumpf aus `AufgabenListe.tsx`
  wandert unverändert in eine eigene Datei und bekommt die feste Reihenfolge aus §10 Prüffrage 7.
  Props, ausschließlich serialisierbar: `aufgabe` (die Zeile), `heute` (für `<Frist>`),
  `rollenZusatz` (**genau eine** vorformatierte Angabe als String oder `null`, gebildet in der
  aufrufenden Server Component — nie eine Funktion, siehe Falle 9), `href` (Vorgabe `/a/<id>`).
- **`AufgabenListe.tsx` bleibt** und wird zur reinen Hülle: `<ul class="zeilenListe">` plus Leertext,
  je Eintrag ein `AufgabenZeile`. Die fünf heutigen Aufrufer wandern **nicht** — sie rufen weiterhin
  `AufgabenListe`, das intern die neue Zeile benutzt. Damit ändert sich für `/archiv` die Anordnung
  nicht, nur die Zeilenkomponente (§3.1).
- **`AufgabenListe.test.tsx` bleibt bestehen und grün** (Großschreibung, die `li`-Zusagen aus
  `:140-142` und `:153-164`) und ist damit zugleich die Gegenprobe, dass die Extraktion nichts
  verloren hat. **Zusätzlich** kommt `_ui/AufgabenZeile.test.tsx` (§11.1) — die alte Datei deckt die
  Zeilenreihenfolge und die neue Kartenform unter 768px nicht ab.

---

## 4. Der Zustands-Selektor als reine Funktion

### 4.1 Bauform und Verträge

`_lib/lage.ts` — ohne `"use client"`, ohne Schreibzugriff, ohne `new Date()`. Vorbild ist
`feedback/_lib/cockpit.ts`; vier Bauregeln gelten wörtlich:

1. **Eine Stelle entscheidet, was die Seite zeigt.** Nicht die JSX.
2. **Nichts wird geschrieben.** „Überfällig" wird gerechnet (`istUeberfaellig`), nie persistiert.
3. **Der führende Anlass ist ein Ausdruck ohne Auffangzweig:** `anlaesse[0] ?? RUHE`. Ein zweiter
   Rückgabeweg existiert nicht, also ist Totalität strukturell und nicht erhofft.
4. **Die Leiter ordnet überschneidungsfrei — aber sie ordnet nicht alles ein.** Jede Aufgabe fällt
   in **höchstens eine** Sprosse: die erste, die passt. Der überschneidungsfreie Teil ist der
   wichtige — ohne ihn zählte eine überfällige, in Arbeit befindliche Aufgabe zweimal, und die
   Zahlen in Karte, Zone und Kontextzeile liefen auseinander. **„Genau eine" wäre dagegen falsch**,
   und der Fehler wäre teuer: der in §11.1 bestellte Test müsste rot sein. Gegenbeispiele aus den
   heutigen Prädikaten (`_lib/anzeige.ts:156-191`, nachgelesen): eine BuFDi-Aufgabe mit Status
   `freigabe_offen` trifft keine der sechs Sprossen; eine `verteilt`-Aufgabe mit `planDatum` =
   Mittwoch ist weder `heuteOffen` noch `wartetAufEinplanung`; jede `abgeschlossene` Aufgabe fällt
   ohnehin durch. Die Oberfläche fällt dabei nicht in ein Loch (`anlaesse[0] ?? RUHE` ist total),
   aber diese Zeilen erschienen in **keiner** Zone, weil Zonen nach R3 ausschließlich aus Anlässen
   entstehen. **Deshalb ist die Restmenge unten ausgeschrieben und nicht implizit.**

**Die Restmenge je Rolle — wo steht, was in keine Sprosse fällt.** Die Aufzählung ist
**abschließend**; nur so ist die Zusage in §11.1 überhaupt prüfbar.

| Rolle | fällt in keine Sprosse | wo es trotzdem steht |
|---|---|---|
| **BuFDi** | `verteilt`/`in_arbeit`/`freigabe_offen` mit `planDatum` in `tage`, nicht überfällig und nicht heute | in ihrer **Tagesspalte** der Wochenachse — mit Titel, Zustand, Dauer und `<Frist>` |
| | `in_arbeit`/`freigabe_offen` **ohne** `planDatum`, und alles mit `planDatum` außerhalb `tage` | in der **Achsen-Fußzeile** (Regel V, `ohnePlatzInDerAchse`) — mit Titel und Datum bzw. „ohne Termin" |
| | `abgeschlossen` | in der Tagesspalte, wenn eingeplant (`tagesOrdnung` zählt alle Zustände); sonst `/archiv` |
| **Koordination** | alles, was nicht überfällig, nicht `eingegangen`, nicht `freigabe_offen`, nicht `zurueckgewiesen` und bei einer aktiven Person liegt | als **Zahl je Person** in „Die Woche der drei" (`<n> Aufgaben`), und über „Zeitplan ansehen" → `/plan/<id>` mit jeder Zeile |
| | `freigabe_offen`, für das `darfFreigeben` falsch ist (Vier-Augen-Ausschlüsse) | ebenso — die Zahl je Person; `/freigaben` zeigt es bewusst nicht, weil sie es nicht freigeben darf |
| | `abgeschlossen` | `/archiv` |
| **Auftrag** | **alles außer den drei Sprossen**, `abgeschlossen` eingeschlossen | in „Eigene Aufträge" — der Fläche der Rolle, **ungedeckelt und vollständig** (Regel D). Deshalb hat diese Rolle keine Zonen (§3.4, R3-Ausnahmetabelle). |

Damit lautet die Zusage, die `lage.test.ts` prüft: **jede Aufgabe fällt in höchstens eine Sprosse,
und jede nicht eingeordnete Zeile ist auf der Fläche der Rolle sichtbar** — die zweite Hälfte
prüfbar, weil die Restmenge oben eine geschlossene Aufzählung ist.

Dazu **eine fünfte Regel, die aus dem Riegel für Befund (2) folgt: der Selektor liefert Daten, keine
Sätze.** `Lage` trägt `art`, Zeilen und Zahlen — nie einen formatierten Text. Die Beschriftung liegt
in `_lib/anzeige.ts` als `ANLASS_TEXT: Record<AnlassArt, …>` und `FRIST_TEXT`, in derselben Reihe wie
`STATUS_TEXT`, `PRIORITAET_TEXT`, `ROLLE_TEXT` und `EREIGNIS_TEXT`. Zwei Gründe, beide belegbar: die
Zonenüberschriften stünden sonst in drei Einstiegen dreimal (heute genau der Zustand), und der
Quelltext-Scan aus §6.6 muss ein einziges Ziel haben — stünde die Überfällig-Prosa im Selektor,
hätte der Scan zwei Ausnahmen statt einer und fänge die vierte Fassung nicht mehr.

**`lage.ts` ist server-only, und das ist keine Stilfrage.** Sie ruft `aktionsOptionen`, das über
`_lib/lebenszyklus.ts` → `_lib/zugang.ts` → `@/core/auth` (next-auth) hängt; ein Import dieser Datei
in eine Client-Insel zöge denselben serverseitigen Code ins Bundle, den der Kopfkommentar von
`aktionsOptionen.ts` schon einmal ausschreibt. `lage()` läuft in `page.tsx` (Server Component), und
die Führungskarte bekommt ausschließlich das **reine, serialisierbare** Ergebnis — nie den Selektor
selbst und nie eine Funktion daraus (Falle 9). Das gilt auch nach der Erweiterung von
`aktionsOptionen` um `umverteilen` (§7 Nr. 3).

**Signatur und Rückgabe (Struktur, kein Code):** `lage(db, akteur, heute, tage)` liefert
`{ ansicht, fuehrung, alsNaechstes, zonen, achsenVorbehalt, kontext }`. `fuehrung` und jede Zone
sind ein `Anlass` mit `art`, den nach einer **totalen Ordnung** sortierten Zeilen und der Angabe, ob
genau eine Zeile enthalten ist. **`alsNaechstes` ist `Anlass | null`** — dieselbe Struktur wie
`fuehrung`, damit die Zeile keine zweite Ableitung braucht; die Regel, welcher Anlass das ist,
steht in §4.2 und ist für alle drei Rollen dieselbe. `null` heißt: die Zeile entfällt (Ruhefall).

**Der Negativsatz ist deshalb ein eigener `AnlassArt`-Schlüssel und kein dritter Typzustand**
(`koordNegativ`, `bufdiNegativ`, `auftragNegativ`, §3.5). Sonst hätte das Feld drei Ausprägungen —
Anlass, Satz, nichts — bei zwei darstellbaren, und die Zusage aus §11.1 mischte eine Struktur mit
einem String. Ein Anlass mit null Zeilen ist hier zulässig **und nur hier**: er bildet nie eine
Zone (R3 kennt nur nicht-leere Anlässe) und steht nie in `anlaesse`. `ansicht` wird **genauso** bestimmt wie in `page.tsx` heute:
`akteur.istKoordination ? "koordination" : akteur.person.rolle`. Damit kann die Leiter nicht von der
gerenderten Komponente abweichen. Der theoretisch mögliche Fall „`bufdi` **und**
Koordinationsgruppe" fällt auf `koordination` — eine Zeile, benannt, weil sie sonst beim nächsten
Lesen als Fehler gemeldet wird.

**Die totale Ordnung innerhalb jeder Sprosse:** `faelligAm` aufsteigend → `prioritaet`
(hoch < mittel < niedrig) → `erstelltAm` aufsteigend → `id`. Zwei Aufgaben können danach nicht
gleichrangig sein; ein „unentschieden" existiert nicht, und die Karte muss nie raten. Ein
`.get()`-Stil-Zufall wie in `feedback`s `activeSurveyForGroup` ist damit strukturell ausgeschlossen.

**Was diese Ordnung nicht behauptet:** dass zwei Aufgaben mit derselben Frist unterschiedlich
dringend seien. Sie ist eine **Reproduzierbarkeitsordnung**, keine Dringlichkeitsaussage. Deshalb
zeigt die Karte bei n > 1 die **Zahl** und das durch `faelligAm` eindeutig bestimmte Extrem, nicht
„die eine" — und `/verteilen` sortiert trotzdem nach derselben Ordnung, weil eine Liste eine
Reihenfolge braucht und eine zufällige die schlechtere ist. Der scheinbare Widerspruch löst sich
daran auf, dass eine **Liste** eine Reihenfolge zeigt und eine **Karte** eine Auswahl trifft.

### 4.2 Die drei Rangleitern

Durchgehend gilt:

- **n = 1** → die Karte nennt **die Aufgabe** (Titel als `<h2>`, plus Chips und `<Frist>`), und
  **keine Zone wiederholt sie**.
- **n > 1** → die Karte nennt **die Zahl** und das Extrem als Datum, **keine Aufgabe ist bevorzugt**,
  und die Zone darunter listet bis zu fünf.
- Die Primäraktion ist **immer** die Zustandsaktion des genannten Anlasses (Regel P).
- **Formulare mit Eingabefeld stehen nie in der Karte.** Ein `<form action>` mit ausschließlich
  versteckten Feldern ist kein Formular in diesem Sinne — es kann keinen Feldfehler haben.
- Zusätzlich trägt jede Karte die Zeile **„ALS NÄCHSTES"**: ein Satz, kein Knopf.

**Die Ableitungsregel für „ALS NÄCHSTES" ist für alle drei Rollen dieselbe — `anlaesse[1]`.** Das
ist der zweite Anlass derselben Leiter, als Satz aus `ANLASS_TEXT` (§3.5), nie eine zweite
Rechnung. Drei Folgen, alle drei nachgeprüft an den Skizzen in §5:

- **BuFDi:** Alinas `anlaesse[1]` ist Rang 5 (`heuteOffen`) → „Heute: Standwache Blutspendetermin ·
  4 Std. · Frist heute". Damit ist die Zusage „kommt aus derselben `tagesOrdnung`, die auch die
  Tagesspalte ordnet" eingelöst, **ohne** eine eigene Ableitung: die Zeilen des Anlasses `heuteOffen`
  **sind** die heutigen `tagesOrdnung`-Einträge, und Karte und Spalte können nicht auseinanderlaufen.
- **Der Wochenendsatz hat genau einen Ort — und es sind nicht zwei.** „Wochenende. Nächster
  Arbeitstag: Mo, 24.08." ist der `ANLASS_TEXT` von `bufdiKeinArbeitstag`. Er steht im
  **Kartenkörper**, wenn dieser Anlass führt (Rang 4), und in der **ALS-NÄCHSTES-Zeile**, wenn er
  `anlaesse[1]` ist — derselbe String aus derselben Quelle, nicht zwei Fassungen. Genau das ist der
  Sonntagsfall in §5.4: Bendix' Rang 1 (überfällig) führt, `kein_arbeitstag` ist der zweite Anlass.
- **Leere Restmenge** (`anlaesse` hat nur einen Eintrag) → der **Negativsatz der Rolle**. Er ist ein
  **eigener `AnlassArt`-Schlüssel mit null Zeilen** (`koordNegativ` / `bufdiNegativ` /
  `auftragNegativ`, §3.5), damit `alsNaechstes` ein `Anlass | null` bleibt und nicht Struktur und
  String mischt: Koordination „Sonst liegt nichts an." · BuFDi „Sonst ist für heute nichts offen." ·
  Auftrag „Nichts wartet auf deine Freigabe." (Maltes Fall in §5.3 — der Satz verneint Rang 1 seiner
  Leiter, die einzige Sprosse, an der er handeln könnte).
- **Im Ruhefall entfällt die Zeile.** Ist `anlaesse` leer, gibt es kein „danach"; `alsNaechstes` ist
  `null`, und ein Satz wäre die Wiederholung des Kartenkörpers, der die Lage bereits ausschreibt.

#### Koordination

| Rang | Fall | Die Karte zeigt | Primäraktion | Sekundär |
|---|---|---|---|---|
| 1 | **`ohneAktivenTraeger`** — zugewiesen an eine Person, deren `aktivBis` verstrichen ist (Status `verteilt`, `in_arbeit` oder `freigabe_offen`) | n=1: Titel · „Zugewiesen an <Name>, die nicht mehr aktiv ist" · Zustand · Frist. n>1: „N Aufgaben liegen bei Personen, die nicht mehr aktiv sind." | `verteilt` → **Anders zuweisen (der Zeitplan wird dabei geleert)**; sonst **kein Primärknopf** (§9, Fall S1) | Aufgabe ansehen · Personenverwaltung |
| 2 | `eingegangen` **und** `istUeberfaellig` | n=1: Titel · „Überfällig seit N Tagen" · Auftraggeber · Priorität. n>1: „N Aufgaben sind überfällig und noch niemandem zugewiesen — die älteste seit M Tagen." | **Verteilen** (n=1: Modal, aus der Karte geöffnet; n>1: → `/verteilen`) | Alle im Posteingang |
| 3 | `eingegangen`, Frist offen | n=1: Titel · Beschreibung · Auftraggeber · Frist · Dauer · Nachweispflicht. n>1: „N Aufgaben warten auf Verteilung — die älteste liegt seit M Tagen." | **Verteilen** | Alle im Posteingang → `/verteilen` |
| 4 | `freigabe_offen` und `darfFreigeben` | n=1: „X hat „Titel" fertig gemeldet." + Nachweis-Kurzform + ggf. „in Vertretung für Y". n>1: „N Aufgaben warten auf Freigabe (M in Vertretung)." | n=1: **Freigeben**; n>1: **Freigaben ansehen** → `/freigaben` | Zurückweisen (Modal, Pflichtbegründung) · Nachweis ansehen |
| 5a | `istUeberfaellig`, zugewiesen, **Status `verteilt`** | n=1: Titel · „Überfällig seit N Tagen" · „bei X, Zu erledigen". n>1: „N Aufgaben sind überfällig." | **Anders zuweisen (der Zeitplan wird dabei geleert)** — Modal, aus der Karte geöffnet | Zeitplan von X |
| 5b | `istUeberfaellig`, zugewiesen, **Status `in_arbeit` oder `freigabe_offen`** | wie 5a, mit dem tatsächlichen Zustand | **kein Primärknopf** | Aufgabe ansehen · Zeitplan von X |
| 6 | `zurueckgewiesen` | n=1: Titel · die Begründung **wörtlich** · „bei X seit N Tagen". n>1: „N Aufgaben wurden zurückgewiesen." | **Aufgabe ansehen** → `/a/<id>` (Textknopf, kein Primärknopf) | Zeitplan von X |
| — | sonst | **Ruhe:** „Nichts liegt an: Posteingang leer, keine Freigabe offen, nichts überfällig." | **Aufgabe einstellen** → `/neu` | Archiv |

**Die Aufspaltung von Rang 5 ist keine Feinheit, sondern die Korrektur eines echten Fehlers im
Siegerentwurf.** Dort stand „In Bearbeitung" neben `[ Umverteilen ]`. `_lib/lebenszyklus.ts` kennt
`umverteilen` **ausschließlich** aus `verteilt`; der Knopf wäre einer gewesen, den der Server danach
ablehnt — und damit ein Verstoß gegen die eigene Prüffrage 2 („ein Knopf, den die Action ablehnen
würde, kann gar nicht entstehen"). Dass 5b ohne Primärknopf bleibt, ist die ehrliche Auskunft: für
eine in Arbeit befindliche Aufgabe hat die Koordination heute keine Zustandsaktion. Ob
`zuruecksetzen` auch der Koordination offenstehen soll, ist eine **Fachfrage an die Modulspec §5**,
keine Frage dieser Oberflächen-Spec — sie wird hier benannt und nicht nebenbei entschieden.

**Und der Weg für `umverteilenAction` ist im Seed erreichbar**, ohne den Seed anzufassen:
„Materialtransport Kreisverband" ist `verteilt` mit `faelligAm = Montag` — ab Dienstag also
überfällig und umverteilbar. Am Montag selbst ist die einzige überfällige Aufgabe
(„Sanitätswache Stadtfest vorbereiten") `in_arbeit`, also Fall 5b; dort bleibt `/a/<id>` der Weg.

#### BuFDi

| Rang | Fall | Die Karte zeigt | Primäraktion | Sekundär |
|---|---|---|---|---|
| 1 | mir zugewiesen **und** `istUeberfaellig` | n=1: Titel · „Überfällig seit N Tagen" · Dauer · Priorität. n>1: „N Aufgaben sind überfällig — die älteste seit M Tagen." | die Zustandsaktion aus `aktionsOptionen`: `verteilt` → **Bearbeitung starten** · `in_arbeit` **ohne** `nachweisPflicht` → **Fertig melden** · `in_arbeit` **mit** `nachweisPflicht` → **Nachweis hinterlegen und fertig melden** → `/a/<id>` · `zurueckgewiesen` → **Bearbeitung wieder aufnehmen** · `freigabe_offen` → **kein Primärknopf** | Auf heute legen · Aufgabe ansehen |
| 2 | `zurueckgewiesen` | n=1: Titel · **die Begründung wörtlich** (das ist der ganze Wert einer Zurückweisung) · Prüfer · Datum. n>1: „N Aufgaben kamen zurück." | **Bearbeitung wieder aufnehmen** | Aufgabe ansehen |
| 3 | `in_arbeit` | Titel · Dauer · „seit <Tag> in Bearbeitung" | ohne Nachweispflicht: **Fertig melden**; mit Nachweispflicht: **Nachweis hinterlegen und fertig melden** → `/a/<id>` | Auf morgen schieben · Zurücksetzen |
| 4 | **`kein_arbeitstag`** — `wochentagVon(heute) === null` | „Wochenende. Nächster Arbeitstag: Mo, 17.08." | **kein Primärknopf** | Woche planen → `/plan/<eigene>` |
| 5 | `heuteOffen` und `verteilt` | „Als Nächstes heute: <Titel>" · Dauer · Priorität · Frist | **Bearbeitung starten** | Anders einplanen → `/plan/<eigene>#einplanen-<id>` |
| 6 | `wartetAufEinplanung` | n=1 mit Vorschlag: „X schlägt Do, 20.08., 09:00 vor für „Titel"." n=1 ohne: Titel · Frist · Dauer. n>1: „N Aufgaben warten auf einen Termin — die früheste Frist ist …" | n=1 mit Vorschlag: **Annehmen: Do, 20.08., 09:00**; sonst **Einplanen** → `/plan/<eigene>` | Anders einplanen |
| — | sonst | **Ruhe:** „Für heute ist nichts mehr offen." + wenn morgen etwas liegt: „Morgen: <Titel> · <Dauer>."; sonst „Diese Woche ist alles eingeplant." | **Woche planen** → `/plan/<eigene>` | Routinen verwalten — **nur bei `darfRoutinenVerwalten(akteur, heute)`** |

**`kein_arbeitstag` steht auf Rang 4, nicht auf Rang 1 — und das ist ein bewusster Unterschied zum
unterlegenen Entwurf.** Dort galt: am Wochenende gar kein Primärknopf. Hier gilt: die Ränge 1 bis 3
behalten ihre Zustandsaktion auch am Sonntag. Grund: eine legitime Zustandsaktion zu verstecken,
weil Sonntag ist, wäre eine Behauptung über die Arbeitszeit dieser Person, die das Modul nicht
kennt — Abwesenheiten sind Streichposten der Modulspec §13. Was das Wochenende ändert, ist die
Aussage über den **Plan**: die Ränge 4 bis 6 sprechen alle über „heute", und heute gibt es keinen
Arbeitstag. Also verdrängt `kein_arbeitstag` genau diese drei und keinen darüber.

**„Auf heute legen" und „Auf morgen schieben" sind keine leeren Knöpfe.** Sie rufen
`einplanenAction` über ein `<form action>` mit **versteckten** Feldern (Tag = `heute` bzw.
`naechsterArbeitstag(heute)`, keine Uhrzeit, Dauer unverändert). Das ist kein Formular mit
Eingabefeld und verletzt Regel P nicht. Das **freie** Einplanen (Tag, Uhrzeit, Dauer — Modulspec
§8.5) bleibt, wo es hingehört: auf `/plan/<eigene>`, wo ein Feldfehler an seinem Feld ankommen kann.
Im Siegerentwurf standen diese beiden Knöpfe ohne belegte Action; das ist hiermit geschlossen.

**Und sie hängen an `darfPlanAendern(akteur, akteur.person.id, heute)` — ausgeschrieben, weil
`aktionsOptionen` sie nicht deckt.** Nachgezählt prüft `aktionsOptionen` sieben Übergänge plus
`nachweisHochladen`; **`einplanen` ist nicht dabei** (`aktionsOptionen.ts:43-51`). Die strukturelle
Zusage aus §10 Prüffrage 2 trägt für die Zustandsaktionen der Ränge 1/2/3, aber ausgerechnet **nicht**
für die drei Aktionen, die diese Spec neu in die Karte holt: „Annehmen" (Rang 6), „Auf heute legen"
und „Auf morgen schieben". Ihr Riegel ist `darfPlanAendern` (`lebenszyklus.ts:132`/`:142`), und der
enthält `istAktiv`. Ohne den ausgeschriebenen Aufruf bekäme eine **ausgeschiedene** BuFDi — die ihren
Einstieg weiterhin erreicht, denn `page.tsx:39-49` verzweigt nur über `rolle` — diese Knöpfe
angeboten und liefe in einen Wurf (`einplanenAction` wirft bei `!ergebnis.erlaubt`, `actions.ts:475`;
`einplanenAnnehmenAction` zusätzlich bei `!ok`, `actions.ts:554-561`), also auf die technische
Fehlerseite. Dasselbe gilt für den Fußzeilen-Verweis „Routinen verwalten": er hängt an
`darfRoutinenVerwalten(akteur, heute)` (`rolle === "bufdi"` **und** `istAktiv`, `zugang.ts:346-348`),
weil `/routinen` sonst `notFound()` wirft (`routinen/page.tsx:107`) — die heutige Oberfläche gatet
ihn genau deshalb schon (`EinstiegBufdi.tsx:212`, Kommentar „DASSELBE PRAEDIKAT WIE /routinen
SELBST"), und beim Neubau der Einstiege ist der stille Wegfall die wahrscheinliche Fassung.

**Routinen sind nie die Führung.** Sie haben laut Modulspec §6 keinen Status, keinen Nachweis und
keine Aktion — eine Karte „Als Nächstes: Frühbesprechung" hätte keinen Knopf. Sie erscheinen in der
Tagesspalte und in der Zeile „ALS NÄCHSTES", nie in der Leiter.

#### Auftraggeber

| Rang | Fall | Die Karte zeigt | Primäraktion | Sekundär |
|---|---|---|---|---|
| 1 | die Zeilen aus **`freigabeDaten(db, akteur, heute).meine`** — nicht „ich bin Prüfer" | n=1: „X hat „Titel" fertig gemeldet." + Nachweistext bzw. „Bildnachweis liegt vor". n>1: „N Aufgaben warten auf deine Freigabe." | n=1: **Freigeben**; n>1: **Freigaben ansehen** → `/freigaben`, **nur bei `darfFreigabenSehen(akteur, heute)`** | Zurückweisen (Modal) · Nachweis und Verlauf ansehen |
| 2 | meine Aufträge, `istUeberfaellig` | n=1: Titel · „Überfällig seit N Tagen" · „bei X, In Bearbeitung". n>1: „N deiner Aufträge sind überfällig." | **kein Primärknopf** | Aufgabe ansehen · Zeitplan von X |
| 3 | meine Aufträge, `eingegangen` | n=1: Titel · Beschreibung · „Noch niemandem zugewiesen." · Frist. n>1: „N deiner Aufträge sind noch nicht verteilt." | **kein Primärknopf** | Aufgabe ansehen · Zurückziehen (`Popconfirm`) — **nur wenn `uebergang(a, "zurueckziehen", akteur, heute).erlaubt`** |
| — | sonst | **Ruhe:** „Alle deine Aufträge laufen, nichts wartet auf dich." | **Aufgabe einstellen** → `/neu` | Archiv |

**Rang 2 und 3 tragen keinen Primärknopf, und das ist die Kernzusage der Modulspec §8.3 in
Bildform.** Malte darf mit einem überfälligen Auftrag bei Bendix nichts tun — die Übergangstabelle
kennt für ihn dort keine Aktion. Für Rang 3 wäre `zurueckziehen` zwar eine echte Aktion, aber eine
**destruktive**; ein destruktiver Knopf als Primäraktion einer Führungskarte lädt zum Wegdrücken
einer Aufgabe ein, die nur auf Verteilung wartet. Er bleibt sekundär mit `Popconfirm`. Malte
erfährt, dass sein Auftrag liegt, sieht den Verlauf einen Klick entfernt und findet **keinen Hebel,
ihn selbst zu verteilen** — genau die Beschwerde, aus der das Modul entstand.

**Warum diese Leiter Prädikate nennt und keine Rollenbeziehungen.** „Ich bin Prüfer" ist **schwächer**
als `darfFreigeben` (`zugang.ts:384-389` verlangt zusätzlich `!istSelbst`, `person.id !==
zugewiesenAn` und `istAktiv`), und „meine Aufträge, `eingegangen`" ist schwächer als der
`zurueckziehen`-Zweig von `uebergang()` (`lebenszyklus.ts:185-193`: `ersteller && istAktiv` **oder**
`darfVerteilen`). Ein **ausgeschiedener** Auftraggeber erreicht seinen Einstieg weiterhin
(`page.tsx:50-51` prüft `istAktiv` nicht; `zugang.ts` sieht diesen Zustand ausdrücklich vor) und
bekäme mit der schwächeren Formulierung „Freigeben" und „Zurückziehen" angeboten, die `uebergang()`
danach ablehnt — sowie bei n > 1 „Freigaben ansehen → /freigaben", das für ihn 404 ist
(`darfFreigabenSehen`, `zugang.ts:534-536`; `freigaben/page.tsx:55`). **Kein Prädikat ändert sich
dabei** — die Leiter nennt nur das, das ohnehin gilt. Das ist dieselbe Regel, die §10 Prüffrage 2
für alle drei Leitern behauptet; hier ist sie eingelöst statt vorausgesetzt.

### 4.3 „Nichts dringend" und „zehn gleich dringend"

| Fall | Die Karte zeigt | Aktion |
|---|---|---|
| **Nichts dringend** (keine Sprosse trifft) | die Ruhe-Belegung der jeweiligen Rolle: ein ausgeschriebener Satz, der die Lage benennt („Nichts liegt an: Posteingang leer, keine Freigabe offen, nichts überfällig.") | die eine sinnvolle nächste Handlung dieser Rolle: **Aufgabe einstellen** (Koordination, Auftrag) bzw. **Woche planen** (BuFDi) |
| **Genau eines dringend** (n = 1) | die Aufgabe: Titel als `<h2>`, Chips, `<Frist>`, der rollenspezifische Zusatz | die Zustandsaktion dieser Aufgabe. Keine Zone wiederholt sie (R3). |
| **Zehn gleich dringend** (n > 1, gleiche Frist) | die **Zahl** und das Extrem: „10 Aufgaben warten auf Verteilung — die älteste liegt seit 6 Tagen." **Keine Aufgabe wird herausgegriffen.** | der Knopf führt auf die Fläche, die n verarbeitet (`/verteilen`, `/freigaben`, `/plan/<eigene>`). Darunter die Zone mit den ersten fünf und „… und 5 weitere →". |
| **Zehn dringend, aber unterschiedlich** | dasselbe: Zahl + Extrem | dasselbe. Die Karte greift auch dann keine heraus — nicht weil die Ordnung fehlte (sie ist total), sondern weil eine Karte, die aus zehn eines herausgreift, neun verdeckt. Die **Zahl** verdeckt nichts. |
| **Aufgaben ohne Platz in dieser Woche** | erscheinen **nicht** in der Karte, wenn sie nicht überfällig sind — sie sind kein Anlass, sondern eine Planungstatsache. Die Achse trägt den Vorbehalt (Regel V). | — |

### 4.4 Zehn Aufgaben am Stück verteilen — `/verteilen` ist der Stapelplatz

Die Führungskarte auf `/` sagt „10 Aufgaben warten auf Verteilung — die älteste liegt seit 6 Tagen"
und der Primärknopf führt dorthin. Auf `/verteilen` gilt:

- Die Tabelle ist nach **Frist aufsteigend, dann Priorität** sortiert (heute:
  Einfügereihenfolge) — dieselbe totale Ordnung wie überall, keine zweite Sortierregel.
- Ein Klick auf „Verteilen" öffnet das Modal, ein Klick im Modal schließt es und die Zeile
  verschwindet: **drei Antipper je Aufgabe**, die Zeilen darüber bleiben stehen, die Scrollposition
  also auch. Das ist der bestehende Ablauf; er war nur nicht als Stapelweg benannt.
- Das Modal zeigt die **Wochenauslastung aller drei** und rechnet sie nach jeder Verteilung neu.
- `/verteilen` bleibt eine **reine Tabelle** — keine Führungskarte, keine Achse, keine Zonen. Das ist
  der Grund, warum die Tafel aus Entwurf B hier nicht landet (§1.3).

### 4.5 Die Prädikate, die neu dazukommen

Alle rein, alle in `_lib/anzeige.ts` neben den bestehenden, alle mit `heute`/`tage` als Argument —
nie mit `new Date()`.

| Prädikat | Bedeutung | Warum es gebraucht wird |
|---|---|---|
| `ohneAktivenTraeger(a, aktiveIds)` | Status ∈ {`verteilt`, `in_arbeit`, `freigabe_offen`}, `zugewiesenAn` gesetzt, aber nicht in der Menge der aktiven Personen | Der tödlichste Fall des Skeptikers (§9, S1). Der Ladepfad trägt: `EinstiegKoordination` liest `alleAufgaben(db)` **ungefiltert**, das Prädikat ist also nicht blind für genau die Zeilen, die es finden soll. `bufdis()` bleibt unangetastet. **Im lokalen Seed gibt es diesen Fall nicht** — Dörtes einzige Aufgabe ist `abgeschlossen`, und das Prädikat schließt `abgeschlossen` aus. Er ist deshalb **nur in `lage.test.ts` mit Fixturen belegbar**, und das bleibt so: eine geseedete offene Aufgabe bei einer ausgeschiedenen Person verzerrte gleichzeitig die Auslastungszahlen, „Die Woche der drei" und jeden `bufdis()`-Fall auf allen anderen Flächen. Ausdrücklich benannt, weil die Spec für `umverteilenAction` einen im Seed erreichbaren Weg fordert und hier bewusst keinen liefert. |
| `ohnePlatzInDerAchse(a, tage)` | Status ≠ `abgeschlossen`, und **entweder** `planDatum` gesetzt und nicht in `tage`, **oder** `planDatum === null` bei Status `in_arbeit`/`freigabe_offen` | Regel V, die Fußzeile der Achse. **Der Name ist bewusst weiter als „ausserhalbDerWoche"**: der zweite Zweig ist die Zeile ohne jeden Termin, und „außerhalb der Woche" wäre über sie eine Falschaussage. Der zweite Zweig ist zugleich der Träger der Restmenge aus §4.1 und der R3-Ausnahme für BuFDi-Rang 3 (§3.4) — wer ihn wegnimmt, öffnet beide Löcher wieder. `verteilt` ohne `planDatum` steht **nicht** darin: das ist `wartetAufEinplanung` und damit ein eigener Anlass (Rang 6). **`tage` ist immer die laufende Woche**, nie die geblätterte — sonst änderte sich die Zahl beim Blättern, ohne dass sich an den Daten etwas geändert hätte. |
| `naechsterArbeitstag(iso)` | der nächste Tag mit `wochentagVon(…) !== null` | Wochenende, Rang 4 der BuFDi-Leiter, und die versteckten Felder von „Auf morgen schieben". `montagDerWoche` bleibt unangetastet: sie ist Kalenderarithmetik und heute korrekt; eine fachliche Regel „am Wochenende meint man die nächste Woche" darin würde still auch die Rückwärtsnavigation verbiegen. |

`istUeberfaellig`, `wartetAufEinplanung`, `vorschlagOffen`, `heuteOffen` und `tagesBudget` bleiben
**wörtlich unverändert**. Insbesondere wird `wartetAufEinplanung` nicht durch ein weiter gefasstes
Prädikat ersetzt — daran hängt die „Annehmen"-Aktion über `vorschlagOffen`, und zwei Fragen brauchen
zwei Prädikate.

---

## 5. Die Flächen je Rolle

**Bezugszeitpunkt aller Skizzen: Montag, 17.08.2026, KW 34** (Mo 17.08. – Fr 21.08.), Daten aus
`pnpm seed:lokal aufgaben`. Zahlen formatiert wie `fmtDauer`/`fmtStunden` es tun (nachlaufende
Nullen fallen weg: `fmtStunden(468) = "7,8"`, `fmtDauer(45) = "45 Min."`). Der Sonntagsfall steht in
§5.4 — er ist an diesem Wochenende real gewesen.

**Eine Regel für die Liegezeit im Kicker, weil sie sonst lügt:** „seit N Tagen" erscheint **erst ab
einem vollen Tag**. Verlaufszeilen und `erstelltAm` entstehen im Seed alle im selben Durchlauf, also
ist jede Liegezeit dort null — ein Kicker „SEIT HEUTE" oder „SEIT GESTERN" wäre in einer frisch
geseedeten Umgebung schlicht falsch. Die Skizzen unten zeigen deshalb den Kicker **ohne** Liegezeit;
im Betrieb tritt „· SEIT 3 TAGEN" dazu, sobald es zutrifft. Dieselbe Regel gilt für die
Zeilenzusätze („Alina · seit 3 Tagen"). `<Frist>` ist davon **nicht** betroffen: „Überfällig seit N
Tagen" rechnet auf `faelligAm`, das der Seed relativ setzt und das deshalb echte Abstände trägt.

Nachgerechnet, nicht übernommen: `tagesBudget` zählt **alle** Zustände, auch `abgeschlossen`
(„‚verplant' ist eine Aussage über den Tag, nicht über den Arbeitsvorrat", `_lib/anzeige.ts:244-247`)
— darauf beruhen Bendix' 11,67 Std. Und `sollMinutenTag` ist 468 = 7,8 Std., die Woche also 39 Std.

### 5.1 BuFDi — „Meine Woche" (Alina)

Alinas Lage: Standwache Blutspendetermin (verteilt, Frist heute, 4 Std., Mo eingeplant) ·
Fahrzeugcheck Rettungswagen 3 (zurückgewiesen von Malte: „Bitte Reifendruck nachtragen.", Frist Di,
45 Min., Di eingeplant) · Zeltlager-Inventar dokumentieren (verteilt, Frist Do, 1,5 Std., Vorschlag
Do 09:00) · Fahrzeugerstausstattung fotografisch dokumentieren (verteilt, Frist Sa 22.08., 20 Min.,
Nachweis Bild) · Routine „Frühbesprechung" Mo–Fr 08:00, 15 Min.
Wochenlast: Mo 4,25 · Di 1 · Mi/Do/Fr je 0,25 = **6 von 39 Std.**
Führender Anlass: **Rang 2, zurückgewiesen** (Rang 1 leer — die Standwache ist heute fällig, nicht
überfällig).

#### Desktop (≥ 768px)

```
┌──────────────────────────────────────────────────────────────────────────────────┐
│ Aufgaben                                                                         │
│ Meine Woche                                    ‹ KW 33    KW 34    KW 35 ›       │
│ KW 34 · 2 Aufgaben eingeplant · 6 von 39 Std. · 2 im Posteingang ·               │
│ nichts überfällig                                                                │
└──────────────────────────────────────────────────────────────────────────────────┘
─ data-testid="aufgaben-flaeche" ──────────────────────────────────────────────────
┌─ data-rolle="fuehrung" ────────── eigenes Markup, padding 24, kein antd-Card ────┐
│ ZURÜCKGEWIESEN VON MALTE                                    Kicker 12/600/versal │
│ Fahrzeugcheck Rettungswagen 3                                  <h2> 20/600       │
│ „Bitte Reifendruck nachtragen."                                Text 14           │
│ Zurückgewiesen   Mittel   Frist: Di, 18.08.   45 Min.   Di, 18.08. eingeplant    │
│                                                                                  │
│ [ Bearbeitung wieder aufnehmen ]   Aufgabe ansehen                               │
│   ^ der einzige Primärknopf          ^ Textknopf → /a/<id>                       │
│ ──────────────────────────────────────────────────────────────────────────────   │
│ ALS NÄCHSTES   Heute: Standwache Blutspendetermin · 4 Std. · Frist heute         │
│                (ein Satz, kein Knopf)                                            │
└──────────────────────────────────────────────────────────────────────────────────┘

Diese Woche                                                        <h2> 20/600
┌ MO 17.08. ──────┬ DI 18.08. ──────┬ MI 19.08. ──┬ DO 20.08. ──┬ FR 21.08. ──┐
│ 4,25 / 7,8 Std. │ 1 / 7,8 Std.    │ 0,25 / 7,8  │ 0,25 / 7,8  │ 0,25 / 7,8  │
├─────────────────┼─────────────────┼─────────────┼─────────────┼─────────────┤
│ 08:00│↻ Früh-   │ 08:00│↻ Früh-   │ 08:00│↻ Früh│ 08:00│↻ Früh│ 08:00│↻ Früh│
│      │  bespr.  │      │  bespr.  │      │      │      │      │      │      │
│  ─   │ Standwache│  ─  │ Fahrzeug-│             │             │             │
│      │ Blutspende│     │ check RW3│ Nichts      │ Nichts      │ Nichts      │
│      │ -termin   │     │ Zurück-  │ eingeplant. │ eingeplant. │ eingeplant. │
│      │ Verteilt  │     │ gewiesen │             │             │             │
│      │ Mittel    │     │ Mittel   │             │             │             │
│      │ 4 Std.    │     │ 45 Min.  │             │             │             │
│      │ Frist heute│    │ Frist:   │             │             │             │
│      │ [▲][▼] ⠿ │     │ Di,18.08.│             │             │             │
│      │           │     │ [▲][▼] ⠿│             │             │             │
└──────┴───────────┴─────┴──────────┴─────────────┴─────────────┴─────────────┘
   data-rolle="wochengitter"  ·  ⠿ = Ziehgriff  ·  ↻ = Routine, ohne Aktionen
   (Regel V: keine Fußzeile — Alina hat nichts außerhalb dieser Woche)

Einzuplanen (2)                                       <section id="posteingang">
  Zeltlager-Inventar dokumentieren       Verteilt  Niedrig  Frist: Do, 20.08.
  1,5 Std. · Malte schlägt Do, 20.08., 09:00 vor
  [ Annehmen: Do, 20.08., 09:00 ]  [ Anders einplanen ]      ← Standardknöpfe

  Fahrzeugerstausstattung fotografisch dokumentieren
                                         Verteilt  Mittel   Frist: Sa, 22.08.
  20 Min. · Nachweis: Bild
  [ Einplanen ]

Routinen verwalten  ·  Zeitplan von Bendix  ·  Zeitplan von Carla
   ^ nur bei darfRoutinenVerwalten(akteur, heute) — sonst faellt der Verweis weg,
     nicht die Zeile (§4.2)
```

Was hier **nicht** mehr steht: die vier KPI-Kacheln, eine Zone „Freigabe offen" (Alina hat keine),
eine Zone „Zurückgewiesen" (ihr einziger Fall **ist** die Karte, Regel R3).

#### < 768px (Skizze bei 360px, der schmalste gemessene Fall) — eine eigene Form, nicht dieselbe schmaler

```
┌──────────────────────────────────────┐
│ Aufgaben                             │
│ Meine Woche                          │
│ ‹ KW 33   KW 34   KW 35 ›            │
│ KW 34 · 2 Aufgaben · 6 von 39 Std. · │
│ 2 im Posteingang · nichts überfällig  │
└──────────────────────────────────────┘
┌─ fuehrung ───────────── padding 16 ─┐
│ ZURÜCKGEWIESEN VON MALTE            │
│ Fahrzeugcheck                       │
│ Rettungswagen 3            (h2, 20) │
│                                     │
│ „Bitte Reifendruck nachtragen."     │
│                                     │
│ Zurückgewiesen   Mittel             │
│ Frist: Di, 18.08.  ·  45 Min.       │
│                                     │
│ ┌─────────────────────────────────┐ │
│ │ Bearbeitung wieder aufnehmen    │ │ ← Block, 44px, voller Breite
│ └─────────────────────────────────┘ │
│ ┌─────────────────────────────────┐ │
│ │ Aufgabe ansehen                 │ │ ← Block, 44px, darunter
│ └─────────────────────────────────┘ │
│ ─────────────────────────────────── │
│ ALS NÄCHSTES                        │
│ Heute: Standwache Blutspendetermin  │
│ 4 Std. · Frist heute                │
└─────────────────────────────────────┘

Diese Woche
( Mo )( Di )( Mi )( Do )( Fr )   ← <fieldset>, echte Radios, ein Tabstop,
 ▔▔▔▔                              Pfeiltasten · data-rolle="tagesliste"
┌ MONTAG, 17.08. ─────────────────────┐
│ 4,25 / 7,8 Std.                     │
│ 08:00 │ ↻ Frühbesprechung  15 Min.  │
│ ───── │                             │
│   ─   │ Standwache Blutspendetermin │
│       │ Verteilt   Mittel           │
│       │ Frist heute · 4 Std.        │
│       │ [ ▲ ]  [ ▼ ]                │
└─────────────────────────────────────┘

Einzuplanen (2)
┌─────────────────────────────────────┐
│ Zeltlager-Inventar dokumentieren    │
│ Verteilt   Niedrig                  │
│ Frist: Do, 20.08. · 1,5 Std.        │
│ Malte schlägt Do, 20.08., 09:00 vor │
│ ┌─────────────────────────────────┐ │
│ │ Annehmen: Do, 20.08., 09:00     │ │ ← 44px, voller Breite
│ └─────────────────────────────────┘ │
│ ┌─────────────────────────────────┐ │
│ │ Anders einplanen                │ │
│ └─────────────────────────────────┘ │
├─────────────────────────────────────┤
│ Fahrzeugerstausstattung …           │
└─────────────────────────────────────┘

Routinen verwalten
Zeitplan von Bendix
Zeitplan von Carla
```

**Jede Kartenaktion ist auf 360px ein voller 44px-Block untereinander — nie ein Textlink in der
Karte.** Das ist die Antwort auf „Handschuhe, im Gehen, Telefon in einer Hand" und zugleich die
Suite-Regel („Handlungsknöpfe unter 768px sind volle Breite und stehen untereinander"). Die Regel
wird von der bestehenden Medienregel `.modul .knopfzeile > * { width: 100% }` schon getragen; eine
`.fuehrung`-spezialisierte Zweitfassung wäre der Anfang der Spezifitätsspirale aus Falle 5.

### 5.2 Koordination — „Verteilung" (Rike)

Rikes Lage: **1** `eingegangen` („Verbandskästen im Fahrzeugpark prüfen", von Malte, Frist Do
27.08.) · **1** Freigabe in Vertretung („Erste-Hilfe-Kurs Nachbereitung", Carla, Prüfer ist Tomke) ·
**1** überfällig („Sanitätswache Stadtfest vorbereiten", bei Bendix, `in_arbeit`, seit 3 Tagen) ·
**1** zurückgewiesen (Fahrzeugcheck RW 3, bei Alina).
Führender Anlass: **Rang 3, Posteingang** (Rang 1 und 2 leer).

**Ihre Fläche der Rolle ist nicht der Posteingang, sondern „Die Woche der drei".** Der Posteingang
steht als gedeckelte Zone darunter und in voller Breite auf `/verteilen`; die Auslastungszahlen
stehen sonst **nirgends auf einem Einstieg** — sie existieren heute nur *innerhalb* des
Verteilen-Dialogs. Das ist der genaue Grund, nicht mehr: die Zahl existiert, sie steht nur nicht
dort, wo man sie **vor** der Entscheidung sieht, ein Modal überhaupt zu öffnen.

Es entsteht dabei **keine zweite Rechnung.** `wochenAuslastungFuerBufdis(db, bufdis, tage)` summiert
`tagesBudget` über die fünf Tage — Routinen eingeschlossen. Das ist die inhaltlich richtige Zahl:
Carlas „Nachtbereitschaft-Übergabe" (3 × 20 Min.) und Alinas „Frühbesprechung" (5 × 15 Min.) sind
belegte Zeit, und eine Auslastung, die sie unterschlüge, böte Rike Kapazität an, die es nicht gibt.

#### Desktop

```
┌──────────────────────────────────────────────────────────────────────────────────┐
│ Aufgaben                                                                         │
│ Verteilung                                              Aufgabe einstellen       │
│ 1 zu verteilen · 1 wartet auf Freigabe (in Vertretung) · 1 überfällig ·          │
│ 1 zurückgewiesen                                                                 │
└──────────────────────────────────────────────────────────────────────────────────┘
─ data-testid="aufgaben-flaeche" ──────────────────────────────────────────────────
┌─ data-rolle="fuehrung" ──────────────────────────────── padding 24 ─────────────┐
│ POSTEINGANG · NOCH NIEMANDEM ZUGEWIESEN                                          │
│ Verbandskästen im Fahrzeugpark prüfen                                            │
│ Bestand und Verfallsdaten in allen Einsatzfahrzeugen kontrollieren.              │
│ Zu verteilen  Mittel  Von Malte  Frist: Do, 27.08.  1 Std.  ohne Nachweis        │
│                                                                                  │
│ [ Verteilen ]   Alle im Posteingang                                              │
│   ^ Client-Insel: derselbe VerteilenModal wie auf /verteilen                      │
│ ──────────────────────────────────────────────────────────────────────────────   │
│ ALS NÄCHSTES   1 Aufgabe wartet auf deine Freigabe (in Vertretung).              │
│                ^ anlaesse[1] = Rang 4, NICHT der ueberfaellige Rang 5b (§4.2)     │
└──────────────────────────────────────────────────────────────────────────────────┘

Die Woche der drei                                            KW 34 · Mo–Fr
┌ ALINA ───────────────┬ BENDIX ──────────────┬ CARLA ───────────────┐
│   6 / 39 Std.        │ 11,67 / 39 Std.      │  3,5 / 39 Std.       │
│  2 Aufgaben          │  3 Aufgaben          │  2 Aufgaben          │
│                      │ ▌ Mo überbucht:      │                      │
│  kein Tag überbucht  │ ▌ 9,17 / 7,8 Std.    │  kein Tag überbucht  │
│                      │ 1 außerhalb dieser   │                      │
│                      │ Woche (Fr, 14.08.)   │                      │
│  Zeitplan ansehen    │  Zeitplan ansehen    │  Zeitplan ansehen    │
└──────────────────────┴──────────────────────┴──────────────────────┘
 .lageGitter — auto-fit, KEINE eigene Medienabfrage
 je Person: <section aria-labelledby="lage-<id>" data-person="<id>"> mit <h3>

Freigabe offen (1)                                            Alle Freigaben ›
  Erste-Hilfe-Kurs Nachbereitung        Freigabe offen  Mittel  Frist: Mi, 19.08.
  Carla · in Vertretung für Tomke · Nachweis (Text) liegt vor

Überfällig, in Bearbeitung (1)
▌ Sanitätswache Stadtfest vorbereiten   In Bearbeitung  Hoch
▌ Bendix · Überfällig seit 3 Tagen · 3 Std. · eingeplant Fr, 14.08.
  Aufgabe ansehen   Zeitplan von Bendix
  ^ kein „Anders zuweisen": die Aufgabe ist `in_arbeit` (Fall 5b)

Zurückgewiesen (1)
  Fahrzeugcheck Rettungswagen 3         Zurückgewiesen  Mittel  Frist: Di, 18.08.
  Alina · „Bitte Reifendruck nachtragen."

Personenverwaltung  ·  Archiv
```

#### < 768px (Skizze bei 360px, der schmalste gemessene Fall)

```
┌──────────────────────────────────────┐
│ Aufgaben                             │
│ Verteilung                           │
│ Aufgabe einstellen                   │ ← Textknopf rutscht unter <h1>
│ 1 zu verteilen · 1 wartet auf        │
│ Freigabe (in Vertretung) ·           │
│ 1 überfällig · 1 zurückgewiesen      │
└──────────────────────────────────────┘
┌─ fuehrung ───────────── padding 16 ─┐
│ POSTEINGANG ·                       │
│ NOCH NIEMANDEM ZUGEWIESEN           │
│ Verbandskästen im                   │
│ Fahrzeugpark prüfen        (h2, 20) │
│                                     │
│ Bestand und Verfallsdaten in allen  │
│ Einsatzfahrzeugen kontrollieren.    │
│                                     │
│ Zu verteilen   Mittel               │
│ Von Malte · Frist: Do, 27.08.       │
│ 1 Std. · ohne Nachweis              │
│                                     │
│ ┌─────────────────────────────────┐ │
│ │ Verteilen                       │ │
│ └─────────────────────────────────┘ │
│ ┌─────────────────────────────────┐ │
│ │ Alle im Posteingang             │ │
│ └─────────────────────────────────┘ │
│ ─────────────────────────────────── │
│ ALS NÄCHSTES                        │
│ 1 Aufgabe wartet auf deine Freigabe │
│ (in Vertretung).                    │
└─────────────────────────────────────┘

Die Woche der drei · KW 34
┌─────────────────────────────────────┐
│ ALINA             6 / 39 Std.       │
│ 2 Aufgaben · kein Tag überbucht     │
│ Zeitplan ansehen                    │
├─────────────────────────────────────┤
│ BENDIX        11,67 / 39 Std.       │
│ 3 Aufgaben                          │
│ ▌ Mo überbucht: 9,17 / 7,8 Std.     │
│ 1 außerhalb dieser Woche (Fr,14.08.)│
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
│ Frist: Mi, 19.08.                   │
│ Carla · in Vertretung für Tomke     │
│ Nachweis (Text) liegt vor           │
└─────────────────────────────────────┘

Überfällig, in Bearbeitung (1)
┌─────────────────────────────────────┐
│ Sanitätswache Stadtfest vorbereiten │
│ In Bearbeitung   Hoch               │
│ ▌ Überfällig seit 3 Tagen           │
│ Bendix · 3 Std. · Fr, 14.08.        │
│ ┌─────────────────────────────────┐ │
│ │ Aufgabe ansehen                 │ │
│ └─────────────────────────────────┘ │
└─────────────────────────────────────┘

Zurückgewiesen (1)  …

Personenverwaltung
Archiv
```

**Auf 360px bleibt „Die Woche der drei" vollständig** — eine Zeile je Person mit **Wochenwert**,
Aufgabenzahl, Überbuchungshinweis und Außerhalb-Hinweis. Das kostet **keine** Medienabfrage:
`grid-template-columns: repeat(auto-fit, minmax(min(180px, 100%), 1fr))` liefert bei 360px eine
Spalte — dieselbe Formel, die `.wochenGitter` schon benutzt. Wer unterwegs zuweisen soll, braucht
die Wochenlast; eine Ansicht, die auf dem Telefon nur einen Tag zeigt, ist bei „gleichrangigem
Telefon und Rechner" ein Rollenausfall, kein Komfortverlust.

### 5.3 Auftraggeber — „Meine Aufträge" (Malte)

Maltes Bestand: 8 eigene Aufträge, davon 1 unverteilt („Verbandskästen"), 1 zurückgewiesen, 1
abgeschlossen (Depotbestand, bei der ausgeschiedenen Dörte), der Rest verteilt. Prüfer ist er für 7;
`freigabe_offen` hat er **keine** — die eine offene Freigabe hat Tomke als Prüfer.
Führender Anlass: **Rang 3, liegt im Posteingang**.

#### Desktop

```
┌──────────────────────────────────────────────────────────────────────────────────┐
│ Aufgaben                                                                         │
│ Meine Aufträge                                          Aufgabe einstellen       │
│ 8 Aufträge · 7 offen · 1 unverteilt · nichts wartet auf deine Freigabe           │
└──────────────────────────────────────────────────────────────────────────────────┘
─ data-testid="aufgaben-flaeche" ──────────────────────────────────────────────────
┌─ data-rolle="fuehrung" ──────────────────────────────── padding 24 ─────────────┐
│ NOCH NICHT VERTEILT                                                              │
│ Verbandskästen im Fahrzeugpark prüfen                                            │
│ Noch niemandem zugewiesen.                                                       │
│ Zu verteilen  Mittel  Frist: Do, 27.08.  1 Std.                                  │
│                                                                                  │
│  Aufgabe ansehen     Zurückziehen                                                │
│  ^ Textknopf → /a/<id>   ^ Textknopf + Popconfirm                                │
│                                                                                  │
│  KEIN PRIMÄRKNOPF — Malte hat für diesen Zustand keine Zustandsaktion,           │
│  und das IST die Auskunft: verteilen darf hier nur die Koordination.             │
│ ──────────────────────────────────────────────────────────────────────────────   │
│ ALS NÄCHSTES   Nichts wartet auf deine Freigabe.                                 │
└──────────────────────────────────────────────────────────────────────────────────┘

Eigene Aufträge (8)                                          Archiv ansehen ›
  Verbandskästen im Fahrzeugpark prüfen  Zu verteilen  Mittel  Frist: Do, 27.08.
  1 Std. · Noch nicht verteilt
  Fahrzeugcheck Rettungswagen 3          Zurückgewiesen Mittel Frist: Di, 18.08.
  45 Min. · Empfänger: Alina · „Bitte Reifendruck nachtragen."
  Standwache Blutspendetermin            Verteilt      Mittel  Frist heute
  4 Std. · Empfänger: Alina
  Materialtransport Kreisverband         Verteilt      Mittel  Frist heute
  5 Std. · Empfänger: Bendix
  Nachbereitung Materialtransport        Verteilt      Niedrig Frist heute
  4,17 Std. · Empfänger: Bendix
  Zeltlager-Inventar dokumentieren       Verteilt      Niedrig Frist: Do, 20.08.
  1,5 Std. · Empfänger: Alina
  Fahrzeugerstausstattung fotografisch dokumentieren
                                         Verteilt      Mittel  Frist: Sa, 22.08.
  20 Min. · Empfänger: Alina · Nachweis: Bild
  Depotbestand Winterausstattung dokumentieren
                                         Abgeschlossen Niedrig
  1,5 Std. · Empfänger: Dörte
  ^ alle acht, ohne Deckel — die Flaeche der Rolle ist von Regel D ausgenommen (§3.4)

Archiv
```

**Kein Wort und kein `href` mit dem Teilstring `verteilen`** — „Noch nicht verteilt" ist Text, nie
Link. Das ist die andere Hälfte der Kernzusage aus Modulspec §8.3, und e2e sucht aktiv danach.

Hätte Malte eine offene Freigabe, wäre sie **Rang 1** und damit die Karte:

```
┌─ fuehrung ──────────────────────────────────────────────────────────────────────┐
│ WARTET AUF DEINE FREIGABE                                                       │
│ Erste-Hilfe-Kurs Nachbereitung                                                  │
│ Carla hat fertig gemeldet. Nachweis (Text) liegt vor:                           │
│ „Kurs durchgeführt, 8 Teilnehmende, Feedback positiv."                          │
│ Freigabe offen  Mittel   Frist: Mi, 19.08.   2 Std.                             │
│                                                                                 │
│ [ Freigeben ]   Zurückweisen   Nachweis und Verlauf ansehen                     │
│                 ^ Modal mit Pflicht-Begründung (useActionState)                 │
└─────────────────────────────────────────────────────────────────────────────────┘
```

#### < 768px (Skizze bei 360px, der schmalste gemessene Fall)

```
┌──────────────────────────────────────┐
│ Aufgaben                             │
│ Meine Aufträge                       │
│ Aufgabe einstellen                   │
│ 8 Aufträge · 7 offen · 1 unverteilt  │
│ · nichts wartet auf deine Freigabe   │
└──────────────────────────────────────┘
┌─ fuehrung ───────────── padding 16 ─┐
│ NOCH NICHT VERTEILT                 │
│ Verbandskästen im                   │
│ Fahrzeugpark prüfen        (h2, 20) │
│                                     │
│ Noch niemandem zugewiesen.          │
│                                     │
│ Zu verteilen   Mittel               │
│ Frist: Do, 27.08. · 1 Std.          │
│                                     │
│ ┌─────────────────────────────────┐ │
│ │ Aufgabe ansehen                 │ │ ← Standardknopf
│ └─────────────────────────────────┘ │
│ ┌─────────────────────────────────┐ │
│ │ Zurückziehen                    │ │ ← Standardknopf + Popconfirm
│ └─────────────────────────────────┘ │
│ ─────────────────────────────────── │
│ ALS NÄCHSTES                        │
│ Nichts wartet auf deine Freigabe.   │
└─────────────────────────────────────┘

Eigene Aufträge (8)
┌─────────────────────────────────────┐
│ Verbandskästen im Fahrzeugpark      │
│ prüfen                              │
│ Zu verteilen   Mittel               │
│ Frist: Do, 27.08. · 1 Std.          │
│ Noch nicht verteilt                 │
├─────────────────────────────────────┤
│ Fahrzeugcheck Rettungswagen 3       │
│ Zurückgewiesen   Mittel             │
│ Frist: Di, 18.08. · 45 Min.         │
│ Empfänger: Alina                    │
│ „Bitte Reifendruck nachtragen."     │
├─────────────────────────────────────┤
│ … (sechs weitere Karten, ohne       │
│    Deckel — §3.4, Regel D)          │
└─────────────────────────────────────┘

Archiv
```

**Die Zeilenform auf 360px ist eine andere als auf dem Desktop, nicht dieselbe umgebrochen:** auf dem
Desktop zwei Zeilen (Titel + Chips oben, Meta unten), auf 360px vier Blöcke mit Trennlinie — eine
Karte je Auftrag, damit die Chips nicht zwischen Titel und Frist eingekeilt umbrechen. Beide
Ausprägungen kommen aus **einer** Komponente (`_ui/AufgabenZeile.tsx` — **neu**, angelegt in §11.4
Schritt 4, Props und Verhältnis zu `AufgabenListe.tsx` in §3.6); der Unterschied ist ein einziges
`flex-direction: column` in der bestehenden Medienabfrage.

**Und diese Fläche hat bewusst keine Zone.** „Eigene Aufträge (8)" zeigt jede Zeile dieser Rolle,
ungedeckelt; jede Zone wäre eine wortwörtliche Wiederholung zwei Bildschirmzentimeter tiefer. Für
den Auftraggeber existiert Ebene 4 des Aufbaus deshalb nicht — ausgeschrieben in §3.4, R3.

### 5.4 Das Sonntagsbild — der Fall, der diese Spec ausgelöst hat

Derselbe Seed (angelegt am Mo 17.08.), aufgerufen am **Sonntag, 23.08.2026**. `montagDerWoche`
ordnet den Sonntag der Woche **davor** zu (der `-6`-Zweig in `_lib/datum.ts:55-60`, nachgerechnet:
23.08. → Montag 17.08.). `/` zeigt also Mo 17.08. – Fr 21.08. — die **abgelaufene** Woche, heute
wortlos. So sieht es künftig aus (Bendix):

```
┌──────────────────────────────────────┐
│ Aufgaben                             │
│ Meine Woche                          │
│ KW 34 (abgeschlossen) · 2 Aufgaben   │
│ eingeplant · 11,67 von 39 Std. ·     │
│ nichts im Posteingang · 1 überfällig │
│ ^ Reihenfolge und Nullwort nach §3.5 │
└──────────────────────────────────────┘
┌─ fuehrung ───────────── padding 16 ─┐
│ ÜBERFÄLLIG                          │
│ Sanitätswache Stadtfest             │
│ vorbereiten                (h2, 20) │
│ ▌ Überfällig seit 9 Tagen           │
│ In Bearbeitung  Hoch  3 Std.        │
│ ┌─────────────────────────────────┐ │
│ │ Fertig melden                   │ │ ← Rang 1 behält seine Aktion
│ └─────────────────────────────────┘ │   auch am Sonntag (§4.2)
│ ─────────────────────────────────── │
│ ALS NÄCHSTES                        │
│ Wochenende. Nächster Arbeitstag:    │
│ Mo, 24.08.                          │
│ ^ anlaesse[1] = Rang 4; DERSELBE    │
│   ANLASS_TEXT, den Rang 4 als       │
│   Kartenkoerper traegt, wenn er     │
│   fuehrt — kein zweiter Ort (§4.2)  │
└─────────────────────────────────────┘

ABGESCHLOSSENE WOCHE          ← Regel V, nur wenn tage[4] < heute
                                (tage[4] = Fr 21.08. < So 23.08.)
Diese Woche (KW 34)
( Mo )( Di )( Mi )( Do )( Fr )
…
1 Aufgabe liegt außerhalb dieser Woche:
Sanitätswache Stadtfest vorbereiten · Fr, 14.08.  →
```

Nachgerechnet, damit die Skizze nicht raten muss: `faelligAm` der Sanitätswache ist Fr 14.08.
(Seed-Anlage minus 3 Tage) — von dort bis So 23.08. sind **9 Tage**. Ihr `planDatum` ist ebenfalls
Fr 14.08. und liegt damit außerhalb von `tage` = [17.08. … 21.08.] → Regel V, zweiter Teil.
`naechsterArbeitstag(23.08.)` ist Mo 24.08.

Ist am Sonntag **nichts** überfällig, trifft Rang 4 (`kein_arbeitstag`): die Karte sagt „Wochenende.
Nächster Arbeitstag: Mo, 24.08. Nichts eingeplant, 2 Aufgaben im Posteingang." und trägt **keinen**
Primärknopf. `montagDerWoche` bleibt unangetastet.

---

## 6. Die eine Darstellung für Dringlichkeit

### 6.1 Der Befund und die Bedingung

`istUeberfaellig(a, heute)` ist bereits **eine** Funktion (`_lib/anzeige.ts:165`) — die Bedingung
ist nicht das Problem, die Darstellung ist es. Sie bleibt wörtlich unverändert.

### 6.2 Die eine Form: `_ui/Frist.tsx`

Eine Server-Komponente, gebaut wie `Chip.tsx`: **kein `"use client"`** (zwei Aufrufer sind
Client-Inseln, **vier** sind Server Components), kein Compound-Zugriff, Zeichen ausschließlich aus
`_ui/ikonen.tsx` (`warnung` existiert dort). Drei Ausprägungen, sonst nichts:

| Lage | Ausgabe | Klasse |
|---|---|---|
| `istUeberfaellig` | „⚠ Überfällig seit 3 Tagen" (Singular: „seit 1 Tag") | `.fristUeberfaellig` |
| `faelligAm === heute`, nicht abgeschlossen | „Frist heute" | `.fristHeute` |
| sonst | „Frist: Do, 20.08." | `.frist` |

**Sechs Aufrufstellen mit derselben Ausgabe:** `AufgabenZeile` (und darüber jede Liste),
`FreigabeZone`, `VerteilenTabelle`, **`Wochenplan`** (die heutige Lücke), der Metablock von
`a/[id]/page.tsx` und — **die sechste, in der ersten Fassung dieser Spec nicht mitgezählt** — die
**Führungskarte**: §4.2 schreibt für n = 1 durchgehend „Titel als `<h2>`, plus Chips und `<Frist>`"
vor, und die Skizzen in §5.1/§5.4 zeigen die Kante („▌ Überfällig seit 9 Tagen"). Die Aufteilung
lautet damit: `FreigabeZone` und `VerteilenTabelle` sind Client-Inseln (`"use client"` in Zeile 1),
`Wochenplan`, `AufgabenZeile`, `a/[id]/page.tsx` **und `Fuehrungskarte`** sind Server Components
(§6.7). Im Wochenplan erscheint sie nur bei `art === "aufgabe"` — eine Routine hat keine
Frist. `/archiv` benutzt dieselbe Komponente und zeigt dort **nie** „überfällig", weil
`istUeberfaellig` `abgeschlossen` ausschließt; dass derselbe Aufruf dort schweigt, ist der Beleg,
dass die Bedingung nur an einer Stelle steht.

### 6.3 Die vier Kanäle, Farbe zuletzt

1. **Wort** — „Überfällig seit N Tagen", ausgeschrieben, **immer mit der Zahl**. Nie ein nacktes
   „Überfällig" (das sagt nicht, ob es gestern oder im Mai war), nie ein kleingeschriebenes Suffix,
   nie nur ein Datum. Die Zahl ist der einzige Kanal, der auch in einer Screenreader-Ausgabe die
   **Schwere** trägt.
2. **Form** — `border-inline-start: 3px` + `padding-inline-start: 8px`, also die Startkante eines
   **Textlaufs**. **Nie eine Pille, nie eine Fläche.** Eine Pille wäre formgleich mit dem
   Zustands-Chip, der in derselben Zeile steht — und genau die Verwechselbarkeit, gegen die Modulspec
   §9.1 die Prioritätsskala formfarbig gebaut hat.
3. **Position** — Überfälliges steht **oben**: in der Leiter ist es Rang 1 (BuFDi), Rang 2/5
   (Koordination) bzw. Rang 2 (Auftrag); in jeder Liste und in der Verteilen-Tabelle sortiert
   `faelligAm` aufsteigend. **Eine Ausnahme, benannt:** in der Tagesspalte des Wochenplans wird
   *nicht* umsortiert — dort ordnet `plan_rang`, und das ist die Reihenfolge, die die Person selbst
   gewählt hat. Eine zweite, automatische Ordnung darüber wäre ein Eingriff in ihre Planung; die
   Zeile trägt trotzdem die Kante.
4. **Farbe** — `--auf-achtung-text` (`#8c0d16` hell / `#f0a39c` dunkel), auf der Kante und auf dem
   Wort. **Nie eine Fläche, insbesondere nicht `--auf-achtung-flaeche`**: die ist die Fläche des
   `zurueckgewiesen`-Chips (`aufgaben.module.css:150-153`, Kopfkommentar Zeile 49: „`achtung` ist die
   Ampel-ROT-TEXTFARBE für `zurueckgewiesen`"), und ein überfälliges Etwas, das aussieht wie ein
   zurückgewiesenes Etwas, ist schlimmer als gar keine Farbe. Und **nie** Suite-Rot `#c8000f` — im
   Modul-CSS ohnehin per Test verboten.

Das Warnzeichen bleibt als fünftes, **nicht zählendes** Element: `aria-hidden`, ohne eigene Aussage,
es macht die Zeile nur auffindbar.

### 6.4 Die Kantenleiter

| Breite | Bedeutung | Heutige Träger |
|---|---|---|
| **4px** | Startkante einer **Fläche** | **keiner** — `.kpi` war der einzige und entfällt (§1.4). Die Regel bleibt stehen, damit eine künftige Fläche nicht 3px nimmt. |
| **3px** | Startkante eines **Textlaufs** | `.budgetUeberbucht` (`--auf-tinte`, neutral — Menge ist keine Statusfarbe, Modulspec §9.3) · `.fristUeberfaellig` (`--auf-achtung-text`) |

`.fristUeberfaellig` und `.budgetUeberbucht` sind damit **geometrisch gleich** und unterscheiden sich
in Farbe und Wort. Das ist Absicht und keine Nachlässigkeit: die Form heißt „hier stimmt eine Zahl
nicht", und **die Bedeutung kommt nie aus der Kante allein**, sondern immer aus dem Wort daneben —
„9,17 / 7,8 Std. — überbucht" gegen „Überfällig seit 3 Tagen". Zwei Formen für zwei Arten von „zu
viel" wären eine Formsprache zu viel; die Suite-Regel „Bedeutung nie allein über Farbe" verlangt das
Wort ohnehin. Beide können in derselben Tagesspalte stehen (eine überfällige Aufgabe an einem
überbuchten Tag), und genau dort trägt der Unterschied.

### 6.5 Was das CSS bekommt

**Keine neue `--auf-*`-Variable, kein geänderter Wert.** Die Führungskarte nimmt dieselbe Fläche wie
die Tagesspalte (`background: var(--auf-papier)`, `border: 1px solid var(--auf-linie)`,
`border-radius: 8px`) und unterscheidet sich durch **Raum, Typografie und Position** — nicht durch
Farbe. Eine zweite Kartenfläche wäre eine zweite Bedeutung auf einem Kanal, der schon sechs
Zustandstöne und drei Prioritätsgewichte trägt. Damit bleibt e2e-Test 59 (exakter `--auf-tinte`-Hexwert
im Dunkelmodus) unberührt, und die Paarigkeitsprüfung sieht nichts Neues.

Neu im **Basisblock** (die eine Medienabfrage bleibt eine):

```
.fuehrung          { background: var(--auf-papier); border: 1px solid var(--auf-linie);
                     border-radius: 8px; padding: 24px; }   /* SPACE.xl */
.fuehrungKicker    { font-family: var(--font-display); font-size: 12px; font-weight: 600;
                     letter-spacing: 0.04em; text-transform: uppercase;
                     color: var(--auf-stahl); }
.frist             { white-space: nowrap; }
.fristHeute        { font-weight: 600; color: var(--auf-tinte); white-space: nowrap; }
.fristUeberfaellig { border-inline-start: 3px solid var(--auf-achtung-text);
                     padding-inline-start: 8px;             /* SPACE.sm */
                     color: var(--auf-achtung-text); font-weight: 700; }
.lageGitter        { display: grid; gap: 12px;              /* SPACE.md */
                     grid-template-columns: repeat(auto-fit, minmax(min(180px, 100%), 1fr)); }
.zeilenListe > li  { display: flex; gap: 12px; flex-wrap: wrap; }
```

In die bestehende Medienabfrage kommen **genau zwei** Regeln — diese Liste ist abschließend, weil
ein Riegel die Zahl der Medienabfragen zählt und Unschärfe über ihren Inhalt genau der falsche Ort
dafür ist:

```
@media (max-width: 767.98px) {
  .fuehrung         { padding: 16px; }              /* SPACE.lg — 24 sind auf 360px zu viel Rand */
  .zeilenListe > li { flex-direction: column; }     /* die Kartenform der Zeilen, §5.3 */
}
```

**Alle „360px"-Skizzen in §5 zeigen den Zustand genau dieser einen Medienabfrage.** 360 ist die
Messbreite aus §9/S4, **keine Schaltschwelle**: es gibt im Modul genau eine Medienabfrage
(`aufgaben.module.css:444`, `max-width: 767.98px`), und `aufgaben-css.test.ts:40-49` zählt sie und
verlangt exakt die Werteliste `["767.98"]`. Die Skizzen gelten damit unverändert auch bei 390px und
767px. Eine zweite `@media`-Regel wäre ein Bruch dieser Zusage und ist in §8 ausdrücklich abgelehnt.

`.lageGitter` braucht **keine** — `auto-fit` erledigt es. Die Knöpfe der Karte brauchen **keine** —
sie stehen in `.knopfzeile`, und die bestehende Regel `.modul .knopfzeile > * { width: 100% }` greift
schon; eine `.fuehrung`-spezialisierte Zweitfassung wäre nicht nur überflüssig, sondern der Anfang
der Spezifitätsspirale aus Falle 5 (und CSS-Prüfung 17 sucht genau diesen Selektor).

**Keine Bewegung, und das ist strukturell.** Der CSS-Test verlangt **genau eine** Medienabfrage;
eine `@media (prefers-reduced-motion: reduce)`-Ausnahme wäre eine zweite. Wer eine Animation ergänzt,
bricht damit sichtbar eine Zusage und muss die Abwägung neu führen — besser als ein Kommentar, der
bittet.

**Die eine neue Kontrastmessung.** `--auf-achtung-text` steht künftig als sichtbarer Text auf der
Inhaltsfläche, und die ist heute die einzige farbtragende Stelle des Entwurfs — und die einzige
ungemessene. `tonPaare()` findet sie nicht, weil sie hier ohne ihre `-flaeche`-Hälfte auftritt.
Also eine Zeile nach dem Muster der bestehenden Prüfungen:

| Messung | hell | dunkel | Schwelle |
|---|---|---|---|
| `--auf-achtung-text` auf `--auf-papier` | **8.41** | **9.39** | 4.5 |

Ausgerechnet, nicht geschätzt. Die abweichenden Trägerflächen sind beide günstiger — auf der
weißen Zellenfläche der `VerteilenTabelle` steigt der Hellwert auf 9.61 —, also bleibt diese Messung
der ungünstigste Fall. Dieselbe Begründung, die der bestehende Kommentar bei `--auf-stahl` schon
führt.

### 6.6 Wie die Einheitlichkeit erzwungen wird

Zwei Riegel, weil einer allein nicht trägt:

- **`Frist.test.tsx`** prüft die drei Ausprägungen und die Singular-/Pluralgrenze bei einem Tag.
- **Ein Quelltext-Scan** in derselben Datei, nach dem Muster der vier modulweiten Verbote in
  `SeitenKopf.test.tsx` und mit demselben Helfer `testQuellscan.ts`: **das Wort „überfällig" (in
  jeder Groß-/Kleinschreibung) darf in `src/app/m/aufgaben/**` nur in `_ui/Frist.tsx` und
  `_lib/anzeige.ts` vorkommen** — Testdateien ausgenommen, weil sie über die Regel schreiben.

  **Der Scan liest jede Datei durch `ohneKommentare(quelle)`** — genau wie `SeitenKopf.test.tsx:105`
  und `:111` es tun. Ohne diesen Satz ist ein wörtlich nach dieser Spec gebauter Scan über den
  Rohtext **am ersten Tag rot**, und zwar auf einer Datei, die §11.3 ausdrücklich als unberührt
  zusagt: `_lib/seedLokal.ts:63` („und lauter überfällige Aufgaben") und `:343`
  („// Überfällig: faelligAm in der Vergangenheit") tragen das Wort in **Kommentaren**, und
  `alleQuellDateien` (`testQuellscan.ts:21-33`) nimmt jede `.ts`/`.tsx` unter der Wurzel und schließt
  nur `*.test.*` aus — `_lib/` ist eingeschlossen. Die Meldung zeigte dann auf den Seed statt auf die
  Darstellung. **`seedLokal.ts` wird deshalb ausdrücklich keine dritte Ausnahme**: Kommentare sind
  kein Anzeigetext, und eine Ausnahmeliste, die Dateien statt Rollen nennt, wächst mit jedem
  Kommentar. Beide Zeilennummern stehen zusätzlich in §11.4 Schritt 2, damit sie beim Bau des Scans
  nicht als vergessene Ausnahme neu erfunden werden.

  **Der Scan greift über `.ts` und `.tsx`**, und das ist der Unterschied zum Siegerentwurf: dort
  griff er nur über `.tsx`, während die neue Überfällig-Prosa in `lage.ts` lag und ihm damit entkam
  — ein Riegel, der genau das durchlässt, wogegen er geschrieben ist. Deshalb auch die Regel aus
  §4.1: **der Selektor liefert Daten, keine Sätze.** Zwei erlaubte Orte, beide einmalig: `Frist.tsx`
  rendert die Form, `anzeige.ts` hält die Texte (`ANLASS_TEXT`, `FRIST_TEXT`).

  Was der Scan **nicht** kann: eine Fassung fangen, die nur die Kante ohne Wort setzt. Genannt,
  nicht verschwiegen — der `Frist.test.tsx`-Fall „jede Ausprägung trägt ihr Wort" ist die
  Gegenmaßnahme dafür.

### 6.7 Die Naht der Führungskarte: Server Component, Aktionen als Inseln

Für `_ui/Frist.tsx` legt §6.2 die Lage ausdrücklich fest; **für die Führungskarte fehlte sie** — und
sie ist der Ort, an dem gleich **vier** der elf Fallen aus `CLAUDE.md` zusammentreffen. Die
Entscheidung wird deshalb hier getroffen, mit demselben Begründungssatz, den §6.2 für `Frist.tsx`
führt:

- **`_ui/Fuehrungskarte.tsx` trägt kein `"use client"`.** Sie ist Server Component, weil sie
  `<Frist>`, Chips, `<h2>` und die feldlosen `<form action>` rendert und ihre Daten direkt aus
  `lage()` bekommt, das seinerseits server-only ist (§4.1).
- **Jede Aktion mit einem Funktions-Prop steht in einer eigenen, direkt importierten Client-Insel.**
  Namentlich: das `Popconfirm` für „Zurückziehen", der `VerteilenModal` und das
  Zurückweisen-Modal. Ein `Popconfirm` braucht `onConfirm`, also eine **Funktion als Prop** — aus
  einer Server Component heraus ist das exakt Falle 9 („Functions cannot be passed directly to Client
  Components"). Vorbild ist die einzige `Popconfirm`-Stelle des Moduls: `_ui/AktionsZone.tsx` (Import
  Zeile 4, Verwendung `:206-216`), und diese Datei trägt in Zeile 1 `"use client"`.
- **Keine `columns[].render`-Funktion** entsteht in dieser Datei (Falle 9), und **kein Icon-Import
  über den nackten Spezifizierer `@ant-design/icons`** (Falle 7) — Zeichen kommen aus
  `_ui/ikonen.tsx` wie überall im Modul.
- **Server Actions dürfen als einzige über die Grenze — aber direkt importiert**, nie als Prop
  durchgereicht.

**Kein Tor außer Playwright sieht einen Fehlgriff hier:** `typecheck`, `lint`, `build` und Vitest
bleiben alle grün, nur ein echter Abruf zeigt den HTTP 500. Damit die Entscheidung nicht in einer
späteren Runde still kippt, erweitert §11.1 den Quelltext-Scan von `Fuehrungskarte.test.tsx` (heute
`Card`/`Alert`, §9/S5) um **`"use client"`**.

---

## 7. Die übrigen Flächen

**`/a/<id>` — Aufgabendetail.** Aufbau bleibt (Titel · Chip-Zeile · Erklärung · `<dl>`-Metablock ·
Nachweis · Verlauf · Aktionszone). Drei Änderungen:
1. Die Chip-Zeile bekommt eine **feste Reihenfolge**: Zustand · Priorität · `<Frist>` ·
   Nachweispflicht. Heute steht die Frist im Metablock und die Chips oben — die wichtigste Zahl der
   Seite steht damit je nach Ansicht an unterschiedlichen Orten.
2. **Genau ein Primärknopf.** `AktionsZone.tsx` rendert heute jedes erlaubte `optionen.*` als
   eigenes Formular, mehrere davon mit `type="primary"`. Neu: eine feste Vorrangliste
   (`freigeben` › `nachweisHochladen` › `fertig` › `starten` › `wiederaufnehmen` › `zuruecksetzen` ›
   `umverteilen`); der erste erlaubte Eintrag ist `type="primary"`, alle übrigen sind
   Standardknöpfe. Das ist eine Sortierung plus ein Flag, kein Umbau.

   **Zwei Einträge stehen bewusst anders, als die erste Fassung sie hatte.** `nachweisHochladen`
   steht **vor** `fertig`: `uebergang()` erlaubt `in_arbeit`×`fertig` unabhängig von der
   Nachweispflicht (`lebenszyklus.ts:145-158`), die Ablehnung entsteht erst in `fertigMeldenAction`
   als Feldfehler (`actions.ts:647-668`) — ohne die Umsortierung wäre für eine nachweispflichtige
   `in_arbeit`-Aufgabe „Fertig melden" der Primärknopf, während der tatsächlich nötige erste Schritt
   ein Standardknopf ist. Dieselbe Verzweigung trägt Rang 1 und Rang 3 der BuFDi-Leiter (§4.2).
   Und **`zurueckziehen` ist aus der Liste heraus**: es ist grundsätzlich **sekundär, mit
   `Popconfirm`** — dieselbe Begründung, die §4.2 für den Auftraggeber Rang 3 schon führt („ein
   destruktiver Knopf als Primäraktion lädt zum Wegdrücken einer Aufgabe ein, die nur auf Verteilung
   wartet"). Stünde es in der Liste, wäre es für eine `eingegangen`-Aufgabe der **einzige** erlaubte
   Eintrag — keine der übrigen Aktionen hat in `TABELLE` (`lebenszyklus.ts:108-162`) eine Zeile aus
   `eingegangen` — und damit ausgerechnet die löschende Aktion der Primärknopf: dieselbe Aufgabe im
   selben Zustand, zwei Antworten auf zwei Seiten dieser Spec. So trägt eine `eingegangen`-Aufgabe
   auf `/a/<id>` **keinen** Primärknopf, was Regel P ausdrücklich zulässt.
3. **„Anders zuweisen (der Zeitplan wird dabei geleert)"** für die Koordination, sichtbar nur bei
   `status === "verteilt"` — der heute fehlende Aufrufer von `umverteilenAction`, mit dem aus
   `_lib/lebenszyklus.ts` nachgelesenen Prädikat und der nachgelesenen Folge (`planLoeschen: true`)
   im Knopftext.

   **Dafür bekommt `AktionsOptionen` ein achtes Feld `umverteilen`, ermittelt über dieselbe
   `uebergang()`-Schleife wie die sieben bestehenden** (`GEPRUEFTE_AKTIONEN`,
   `aktionsOptionen.ts:43-51`). Nachgesehen fehlt das Feld heute, und `GEPRUEFTE_AKTIONEN` fragt es
   nicht ab — ohne die Erweiterung wäre die naheliegende Umsetzung eine in der Oberfläche
   nachgebaute Bedingung (`status === "verteilt" && istKoordination`), also genau das, was der
   Kopfkommentar von `aktionsOptionen.ts` verbietet („NICHT eine nachgebaute Fassung der
   Uebergangstabelle") und was `lebenszyklus.ts` für `darfFreigeben` schon einmal als Fehlerquelle
   ausschreibt. Mit der Erweiterung ist „kein Umbau" auch wahr; `_lib/aktionsOptionen.test.ts` und
   `_ui/AktionsZone.test.tsx` stehen dafür in §11.1.

**`/personen`.** Unverändert. Sie ist heute die sauberste Fläche des Moduls; die Kontextzeile behält
ihr Format wörtlich.

**`/neu`.** Unverändert, einschließlich aller `#af-*`-Ids und der Reihenfolge Nachweisschalter →
Formwahl. **Eine Ergänzung:** unter dem Feld „Frist" eine Metazeile, die das gewählte Datum in
derselben Sprache zurückgibt, in der `<Frist>` es später zeigt („Do, 27.08. — in 10 Tagen"). Das ist
der einzige Ort, an dem Fristen entstehen.

**`/archiv`.** Unveränderte **Anordnung**; der bestehende Prioritätsfilter bleibt. Die Zeilen
benutzen künftig `AufgabenZeile` (**neu**, §3.6) und damit `<Frist>` — dort immer neutral.

**`/plan/<personId>`.** Aufbau bleibt. Zwei Änderungen: `<Frist>` an jedem Eintrag (die zweite
Stelle, an der Überfälligkeit heute unsichtbar ist), und **keine Führungskarte** — ein Plan ist eine
Fläche, keine Führung; eine Karte darüber überschriebe die eine Frage der Seite mit einer anderen.
Der fremde Plan bleibt völlig aktionsfrei.

**`/routinen`.** Unverändert.

---

## 8. Was bewusst NICHT gebaut wird

| Weggelassen | Warum |
|---|---|
| **Mehrfachauswahl im Posteingang** („10 anhaken, an Alina verteilen") | Verteilen ist eine Einzelfallentscheidung: wer hat Zeit, wer kann das. Eine Stapelzuweisung an **eine** Person würde gegen **veraltete** Auslastungszahlen gerechnet — nach der ersten Zuweisung stimmt die Zahl im Dialog nicht mehr. Der sequenzielle Weg mit neu gerechneter Auslastung ist nicht langsamer, sondern richtiger (§4.4). |
| **Ziehen über Personengrenzen** (Posteingangszeile → Tagesspalte einer anderen Person) | Falle 11 macht die e2e-Deckung teuer (schrittweise Maus statt `dragTo()`), die Geste gilt erst ab 768px und wäre damit kein gleichrangiger Weg auf dem Telefon, und sie umgeht das Modal, das die Auslastung neu rechnet. Der tastaturbedienbare Zwilling („Anders zuweisen" auf `/a/<id>`) existiert und bleibt der Weg. |
| **Uhrzeitabhängige Inhalte** (Vormittag/Nachmittag, „STAND 09:14", eine Jetzt-Linie) | Die Seite rendert serverseitig in einem Zug und hat keinen Aktualisierungstakt; eine Karte, die sich nach der Uhr ändert, wäre nach fünf Minuten Standzeit falsch, ohne dass etwas geschehen wäre. **Fortschritt ist die ehrlichere Kopplung:** die Karte rückt vor, weil die Person arbeitet. Dazu: keine Seed-Aufgabe trägt eine `planUhrzeit`, und eine uhrzeitabhängige Kontextzeile wäre ein Test, der zwischen zwei Läufen kippt. |
| **KPI-Kacheln** (`Kachel.tsx`, `.kpi*`) | Befund (1) nennt genau diese Bauform als den Defekt. Aufhebung von Modulspec §8.1/§8.2 begründet in §1.4. |
| **Tönung oder farbige Kante der Führungskarte** | Farbe ist im Modul für sechs Zustandstöne und drei Prioritätsstufen vergeben. Ein siebter Ton „das ist die Führung" wäre eine Bedeutung zu viel auf einem vollen Kanal. Raum (24px), Typografie (Kicker + 20/600) und Position tun es. |
| **Ein zweiter Kartenhintergrund (`--auf-karte`)** | Eine Variable, die gemessen, aber nicht dort gerendert wird, wo gemessen wurde, ist die stille Bauart von Falle 2. Und eine, die beides tut, kostet drei zusätzliche Messungen für einen Effekt, den Raum und Typografie schon liefern. |
| **Jede Bewegung** — Aufbau der Tagesspalten, Zählanimation, Übergänge | Modulspec §9.4 verbietet die ersten beiden ausdrücklich, und der CSS-Test verbietet den Rest indirekt: eine `prefers-reduced-motion`-Ausnahme wäre eine zweite Medienabfrage. |
| **Ein Zähler-Abzeichen in der Suite-Navigation** („Freigaben ⑵") | Es müsste bei jedem Seitenaufruf jedes Moduls gezählt werden, in der Shell, quer zur Modulgrenze. Der `core`-Maßstab ist ein zweiter, heute belegbarer Nutznießer — es gibt keinen. |
| **Ein Schnellformular „Aufgabe in einem Feld anlegen" auf dem Einstieg** | `/neu` verlangt Titel, Erklärung, Priorität, Frist, Dauer und optional Nachweispflicht — jedes Feld hat einen Grund. Ein Kurzformular wäre ein zweiter Weg zu derselben Action mit schlechteren Daten, und die Erklärung ist genau das, was der Auftraggeber liefern soll. |
| **Sortier- und Filterknöpfe auf dem Einstieg** | Die Rangleiter **ist** die Sortierung. Ein Filter erlaubte, die Führung wegzublenden — die eine Sache, die die Seite verhindern soll. Filter bleiben, wo sie hingehören: im Archiv. |
| **Ein neuer Breakpoint für 360px** | 360px ist keine eigene Klasse, sondern der schmale Rand derselben. Der Suite-Breakpoint ist 767.98px; ein zweiter wäre ein Modul, das bei einer anderen Breite schaltet als die Shell — genau der Defekt, den `feedback.css` bis 2026-07-27 hatte. |
| **Ein Skeleton, ein Spinner, eine `loading.tsx`** | Vorgabe. Der einzige Ladezustand ist `isPending` aus `useActionState`: Knopf `loading` + `disabled`, Beschriftung unverändert. |
| **Abwesenheiten, wiederkehrende Aufgaben, Zeiterfassung, Mehrwochenplanung, Video-Nachweis, E-Mail** | Bereits in Modulspec §13 gestrichen; diese Spec holt nichts davon zurück. |

---

## 9. Die harten Fälle — jeder tödliche Einwand mit der Antwort dieser Spec

### 9.1 Einwände gegen den Siegerentwurf, die diese Spec lösen muss

| # | Der Einwand | Die Antwort dieser Spec |
|---|---|---|
| **S1** | **Eine Person fällt aus, acht Aufgaben müssen neu verteilt werden — beide Entwürfe werden blind.** `bufdis()` ist `aktivePersonen(db, heute).filter(rolle === "bufdi")` (`_db/queries.ts:89-91`): sobald `aktivBis` gesetzt ist, verschwindet die Spalte aus jeder Achse. Die offenen Aufgaben stehen in keinem Posteingang (Status `verteilt`/`in_arbeit`, nicht `eingegangen`), also nirgends — auffindbar nur über `/a/<id>`, das man erst kennen muss. | **Gelöst, ohne den Riegel anzufassen.** `ohneAktivenTraeger` ist **Rang 1** der Koordinationsleiter (§4.2) und zusätzlich die oberste Zone — „Ohne aktiven Träger (N)", **ungedeckelt** (§3.4, Regel D: ein Deckel setzt ein Sammelziel voraus, und §3.1 verbietet, dafür eine Route zu erfinden). Das ist die Stelle, an der die Deckelregel und dieser Fall aufeinandertreffen: mit Deckel wären von den acht Aufgaben drei **nur über `/a/<id>` erreichbar, das man erst kennen muss** — wortwörtlich der Defekt, den S1 schließen soll. Die Zone ist deshalb lang statt gekappt, und das ist die getroffene Abwägung, keine Auslassung. Der Ladepfad trägt: `EinstiegKoordination` liest `alleAufgaben(db)` **ungefiltert** (`_db/queries.ts:259`), das Prädikat ist also nicht blind für genau die Zeilen, die es finden soll — nachgeprüft, weil ein Prädikat über `bufdis()` genau das gewesen wäre. `bufdis()` selbst bleibt wörtlich, weil es die Verteilziele bestimmt und eine ausgeschiedene Person **kein** Verteilziel ist. **Die benannte Grenze:** ist die Aufgabe `in_arbeit`, hat die Koordination heute keine Zustandsaktion (`umverteilen` gibt es nur aus `verteilt`, `zuruecksetzen` nur für die zugewiesene Person). Die Karte nennt die Aufgabe ohne Primärknopf und führt auf `/a/<id>`. Ob `zuruecksetzen` der Koordination offenstehen soll, ist eine Fachfrage an Modulspec §5 und wird hier nicht nebenbei entschieden. |
| **S2** | **Am Wochenende zeigt `/` die abgelaufene Woche, wortlos — und „Sanitätswache Stadtfest vorbereiten" (planDatum außerhalb Mo–Fr) steht in keiner Spalte.** Man sieht Sonntagabend eine volle, grüne Woche und glaubt, man sei durch. | **Gelöst, zweiteilig.** (a) Regel V: liegt `tage[4] < heute`, steht über der Achse „Abgeschlossene Woche"; die Karte kennt die Sprosse `kein_arbeitstag` und `naechsterArbeitstag(heute)`. (b) Regel V, zweiter Teil: die Achse schließt mit „N Aufgaben liegen außerhalb dieser Woche: <Titel> · <Plandatum> →" ab — über `ohnePlatzInDerAchse` (§4.5), das zusätzlich die **terminlose** Zeile fängt („ohne Termin" statt eines Datums) und damit auch die Restmenge aus §4.1 trägt. `montagDerWoche` bleibt unangetastet — sie ist Kalenderarithmetik und heute korrekt. Der überfällige Fall ist zusätzlich schon Rang 1 der Leiter. §5.4 zeigt das Bild. |
| **S3** | **Bei 60 offenen Aufgaben kappt nichts.** Regel R3 setzte die Posteingang-Zone ungekürzt auf `/` — 60 Zeilen unter der Fläche der Rolle, und genau bei der Last, für die man eine Übersicht baut, ist die Übersicht nicht mehr erreichbar. | **Gelöst durch Regel D** (§3.4): eine Zone **mit Sammelziel** zeigt höchstens fünf Zeilen und schließt mit „… und 47 weitere → /verteilen". Der Posteingang ist genau so eine Zone — die Lastsorge dieses Falls trifft ihn und keine andere. Die Karte sagt die Zahl, der Primärknopf führt auf den Stapelplatz, und `/verteilen` bleibt eine reine Tabelle mit stabiler Scrollposition und drei Antippern je Aufgabe (§4.4). **Zonen ohne Sammelziel bleiben ungedeckelt** (S1); die Regel ist damit nicht „jede Zone", sondern „jede Zone, aus der ein Ausgang führt". |
| **S4** | **Eine Aufgabe ohne Frist — und 360px wird von keinem Tor gemessen.** Die totale Ordnung und `<Frist>` ruhen beide auf `faelligAm`; wird die Spalte je optional, kippt die Ordnung geräuschlos. Und der Überlauf-Sweep fährt 390/768/820/1280, nie 360. | **Beides benannt, eines gelöst, eines gedeckt.** (a) `faellig_am` ist `notNull` (`_db/schema.ts:158`) — diese Spec macht die Zusage explizit und hängt einen Riegel daran: ein Quelltext-Scan hält fest, dass die Spalte `notNull` bleibt, sodass ein künftiges „Frist optional" **laut** bricht statt still. Die Ordnung selbst bekommt keinen Auffangzweig, weil ein Auffangzweig für einen unmöglichen Fall die Prüfung des möglichen verhindert. (b) 360px: zuerst kommen `/` als **rike** und `/` als **malte** in `UEBERLAUF_SEITEN` — beide Einstiege werden hier neu gebaut, beide fehlen heute in der Liste (24 → **32** Fälle). Eine fünfte Breite **global** aufzunehmen wird **abgelehnt**, und zwar mit der Begründung, die die Datei selbst schon führt (`e2e/aufgaben.spec.ts:1190-1193`: „die Laufzeit dieses Sweeps wächst multiplikativ über Seiten × Breiten", weshalb dort bereits `/routinen` und `/freigaben` ausgenommen und stattdessen von Hand gemessen sind). Zwischen 360 und 390 schaltet nichts — der Modul-Breakpoint liegt bei 767.98, die Shell-Seitenleiste bei 768; 360px prüft ausschließlich, ob ein unteilbarer String 30px weniger verträgt. Deshalb **gezielt**: die drei Einstiege (Alina, Rike, Malte) laufen zusätzlich bei 360×740, weil ihre schmale Form neu ist; die übrigen fünf Zeilen bleiben bei den vier bestehenden Breiten. Ergebnis: 32 + 3 = **35 Fälle**, und die Ausnahme steht im selben Stil wie die bestehende im Testkopf. |
| **S5** | **`.fuehrung { padding: 24px }` verliert gegen `.ant-card-body`** — beide (0,1,0), antds Stylesheet kommt später, Falle 5, still, und kein Gate sieht es (`typecheck`, `build`, Vitest und der CSS-Scan bleiben alle grün). | **Strukturell ausgeschlossen:** die Führungskarte ist **eigenes Markup**, kein antd-`Card` und kein `Alert` (§1.3, §6.5). Ohne antd-Komponente gibt es keinen Gegenspieler und keine Kollision. Damit die Entscheidung nicht in einer späteren Runde verlorengeht, scannt `Fuehrungskarte.test.tsx` den Quelltext dieser einen Datei auf `Card` und `Alert`. |
| **S6** | Rang „überfällig, zugewiesen" zeigte „In Bearbeitung" neben `[ Umverteilen ]`, obwohl `umverteilen` nur aus `verteilt` existiert — ein Knopf, den der Server ablehnt, und damit ein Verstoß gegen die eigene Prüffrage 2. | **Gelöst durch die Aufspaltung in Rang 5a/5b** (§4.2), mit dem nachgelesenen Prädikat und der nachgelesenen Folge im Knopftext. Der im Seed erreichbare Fall ist „Materialtransport Kreisverband" ab Dienstag. |
| **S7** | Die zugesagte e2e-Zusicherung „`[data-rolle="fuehrung"]` ist das **erste** Element in `[data-testid="aufgaben-content"]`" ist **falsch**: `page.tsx:81` legt diesen Wrapper um den ganzen Einstieg, der `SeitenKopf` steht darin. Ein Test, der etwas anderes misst als sein Name sagt. | **Gelöst durch einen eigenen Wrapper** `data-testid="aufgaben-flaeche"` **unter** dem `SeitenKopf` (§3.3). `aufgaben-content` bleibt unverändert, weil bestehende Tests daran hängen. Der Primärknopf-Zähler misst denselben Wrapper. |
| **S8** | Der Quelltext-Scan gegen „überfällig" griff nur über `**/*.tsx`, während die neue Prosa in `lage.ts` läge — der Riegel ließe genau das durch, wogegen er geschrieben ist. | **Gelöst:** der Scan greift über `.ts` **und** `.tsx`, mit **zwei** benannten Orten (`_ui/Frist.tsx` für die Form, `_lib/anzeige.ts` für die Texte), und der Selektor liefert Daten statt Sätze (§4.1, §6.6). |
| **S9** | Zwei bestehende Verstöße gegen „genau ein Primärknopf", die kein Gate sieht: `EinstiegBufdi.tsx:255` („Annehmen") und `EinstiegAuftrag.tsx:72` („Aufgabe einstellen") sind heute `type="primary"`. | **Beide werden zu Standardknöpfen** (§1.3, §11) — **aus zwei verschiedenen Gründen.** `EinstiegBufdi.tsx:255` steht in der Posteingang-Zone, also **innerhalb** von `data-testid="aufgaben-flaeche"`: ohne die Demotion wäre der neue Zählriegel am ersten Tag rot, und keine Fehlermeldung sagte warum (e2e-Test 61 klickt „Annehmen" über seinen Text, Test 13 prüft `href`). `EinstiegAuftrag.tsx:72` steht im `aktionen`-Prop des `SeitenKopf` und damit **außerhalb** des Wrappers, den §3.3 ausdrücklich darunter legt — **der Zählriegel fände ihn gar nicht.** Er wird demotiert, weil „höchstens ein Primärknopf" für die ganze Seite gilt und die Skizzen §5.2/§5.3 „Aufgabe einstellen" bereits als Textknopf führen. Wer die Begründung zusammenlegt, hält beim Prüfen entweder den Riegel oder den Wrapper für falsch platziert. Beide Tests bleiben grün. |
| **S10** | Die Begründung für „Die Woche der drei" war zu scharf formuliert („erst wenn die Entscheidung schon halb gefallen ist") — die Auslastung steht im Verteilen-Dialog bereits **vor** der Personenwahl, und `queries.ts` lädt sie auf dem Einstiegspfad ohnehin. | **Korrigiert** (§5.2): die Zone existiert, weil die Zahl **vor** der Entscheidung sichtbar sein muss, ein Modal überhaupt zu öffnen — nicht, weil sie sonst nirgends existierte. Die Zone ist trotzdem richtig, aber aus dem richtigen Grund. |

### 9.2 Fehlerklassen, die auf dieser Fläche strukturell nicht auftreten können

Die Jury hat fünf tödliche Einwände gegen den unterlegenen Entwurf erhoben. Sie sind hier nicht
gegenstandslos, weil B verloren hat, sondern weil diese Spec so gebaut ist, dass die
**Fehlerklasse** nicht entstehen kann. Das ist der Prüfstein, an dem sich die Bauform bewährt.

| Fehlerklasse | Warum sie hier nicht entstehen kann |
|---|---|
| **Die Karte erklärt Aufgabe X und ihr einziger Knopf startet Aufgabe Y.** (Bei B durchgehend auf der Koordinationsfläche und beim BuFDi ab 16:00 — B nennt es selbst „die Handlung wandert".) | **Regel P** (§3.4): die Karte nennt genau einen Anlass, und die Primäraktion ist die Zustandsaktion **dieses** Anlasses. Es gibt keinen „Grund"-Teil und keinen „als Nächstes"-Teil mit je eigener Handlung — die Zeile „ALS NÄCHSTES" ist ein **Satz ohne Knopf**. Und wo der Anlass keine Zustandsaktion hat, gibt es **keinen** Primärknopf statt eines Rückfalls auf die nächste Sprosse. Der Rückfall ist es, der bei B die falsche Handlung erzeugt. |
| **Die Frist-Marke sieht aus wie ein Zustands-Chip.** (Bei B: „⚠ Überfällig seit 2 Tagen" und „Zurückgewiesen" sind dieselbe Pille in `--auf-achtung-*`; „Morgen fällig" und „Verteilt" dieselbe graue.) | **Kanal 2** (§6.3): die Frist-Marke ist **nie eine Pille und nie eine Fläche**. Sie ist eine 3px-Startkante plus Wort. Sie berührt **keine** `-flaeche`-Variable — nachprüfbar an einer einzigen Regel im CSS. Damit kann sie mit keinem Chip formgleich werden, egal welche Farbe sie trägt. |
| **Die Wochenlast ist auf dem Telefon nicht da.** (Bei B zeigt die Tafel auf 360px einen Tag je Person.) | **§5.2:** „Die Woche der drei" ist auf 360px **eine Zeile je Person mit dem Wochenwert**, nicht drei schmale Spalten und nicht ein Tag. Das kostet keine Medienabfrage (`auto-fit`). Bei gleichrangigem Telefon und Rechner ist eine fehlende Wochenlast ein Rollenausfall, kein Komfortverlust. |
| **Bei Last kippt die eigene Leistung** — eine ungekappte Tabelle zwischen Karte und Übersicht schiebt die Übersicht aus dem Bild. | **Regel D** (§3.4): jede Zone **mit einem Sammelziel** hat einen Deckel von fünf Zeilen und einen benannten Ausgang; Zonen ohne Sammelziel bleiben vollständig, weil ein Deckel ohne Ausgang Zeilen unauffindbar machte (S1). Die volle Tabelle steht auf `/verteilen`, der reinen Stapelfläche. Fall S3 oben ist dieselbe Fehlerklasse in ihrer milderen Ausprägung — und sie ist mit derselben Regel geschlossen. |
| **Eine uhrzeitabhängige Kontextzeile ist ein Test, der zwischen zwei Läufen kippt.** | **§8:** es gibt keine uhrzeitabhängigen Inhalte. Der Selektor kennt `heute` als ISO-Tag und keine Uhr; `new Date()` wird ausschließlich in `page.tsx` gerufen. Die Karte rückt vor, weil die Person arbeitet — nicht, weil die Uhr weiterläuft. |

---

## 10. Die sieben Prüffragen aus `docs/design/README.md`

### 1. Hat jede Action einen Weg in der Oberfläche?

Nach dieser Spec ja — heute **nicht**: `umverteilenAction` ist definiert, in `actions.test.ts`
geprüft und hat **keinen einzigen Aufrufer** in `_ui/` oder in einer Seite (nachgezählt; die
einzigen Nennungen außerhalb von `actions.ts` und den Tests stehen in Kommentaren). Eine Action ohne
Aufrufer ist kein Feature.

| Action | Weg |
|---|---|
| `aufgabeEinstellenAction` | `/neu` (Nav · Seitenkopf-Textknopf · Ruhe-Karte aller drei Rollen) |
| `verteilenAction` | Führungskarte Koordination Rang 2/3 (Modal, aus der Karte geöffnet) · Zone „Zu verteilen" je Zeile · `/verteilen` je Zeile |
| **`umverteilenAction`** | **neu:** Führungskarte Koordination Rang 1 und 5a („Anders zuweisen (der Zeitplan wird dabei geleert)") · Zone „Überfällig" je Zeile bei `verteilt` · `AktionsZone` auf `/a/<id>` |
| `zurueckziehenAction` | Führungskarte Auftrag Rang 3 (sekundär, `Popconfirm`) · `AktionsZone` |
| `startenAction` | Führungskarte BuFDi Rang 1/5 · `AktionsZone` |
| `zuruecksetzenAction` | Führungskarte BuFDi Rang 3 (sekundär) · `AktionsZone` |
| `wiederaufnehmenAction` | Führungskarte BuFDi Rang 1/2 · `AktionsZone` |
| `einplanenAction` | **Führungskarte BuFDi „Auf heute legen" / „Auf morgen schieben"** (`<form action>` mit versteckten Feldern) · „Anders einplanen" → `/plan/<eigene>` · Zone „Einzuplanen" · Ziehen |
| `einplanenAnnehmenAction` | Führungskarte BuFDi Rang 6 („Annehmen: …") · Zone „Einzuplanen" |
| `fertigMeldenAction` | Führungskarte BuFDi Rang 1/3 (ohne Nachweispflicht) · `AktionsZone` |
| `freigebenAction` | Führungskarte Auftrag Rang 1 / Koordination Rang 4 · `/freigaben` · `AktionsZone` |
| `zurueckweisenAction` | dieselben drei, als Sekundäraktion mit Pflicht-Begründung |
| `routineAnlegen/Aendern/RuhenAction` | `/routinen` |
| `rangVerschiebenAction` | Auf/Ab-Knöpfe in jeder Tagesspalte (Wochengitter **und** Tagesliste) |
| `personenSucheAction` · `personAnlegen/Aendern/BeendenAction` | `/personen` |

### 2. Führt kein Weg dorthin, wo die Person nicht hindarf?

Ja, und zwar **strukturell statt geprüft: jede Sprosse der Leiter ist über dasselbe Prädikat
definiert, das die Action durchsetzt.** Rang „verteilen" existiert nur bei `darfVerteilen(akteur,
heute)`; Rang „freigabe" speist sich aus `freigabeDaten(db, akteur, heute)`, das serverseitig über
`darfFreigeben` filtert (samt beider Ausschlüsse aus Modulspec §7); die BuFDi-Zustandsaktionen
kommen aus `aktionsOptionen(a, akteur, heute)`, das `uebergang()` je Aktion ruft. Ein Knopf, den die
Action ablehnen würde, kann in der Karte nicht entstehen, weil die Karte gar nicht wüsste, dass es
ihn gibt — die Aufspaltung von Rang 5 (§4.2) ist genau diese Regel auf einen Fall angewendet, der
sie fast verletzt hätte.

**Drei Präzisierungen, weil `aktionsOptionen` nicht alles deckt, was die Karte trägt.** Erstens
prüft es heute sieben Übergänge plus `nachweisHochladen`; **`einplanen` ist nicht dabei**
(`aktionsOptionen.ts:43-51`). Die drei Plan-Aktionen der Karte („Annehmen", „Auf heute legen", „Auf
morgen schieben") hängen deshalb ausgeschrieben an `darfPlanAendern(akteur, akteur.person.id,
heute)` (§4.2) — ohne diesen Satz behauptete die Prüffrage eine Deckung, die es nicht gibt, und eine
ausgeschiedene BuFDi liefe in einen `throw`. Zweitens bekommt `AktionsOptionen` das Feld
`umverteilen` über dieselbe `uebergang()`-Schleife (§7 Nr. 3), damit „Anders zuweisen" nicht als
nachgebaute Bedingung entsteht. Drittens nennt die Auftraggeber-Leiter ihre Prädikate wörtlich
(`freigabeDaten(…).meine`, `darfFreigabenSehen`, der `zurueckziehen`-Zweig aus `uebergang()`) statt
Rollenbeziehungen (§4.2) — Rollenbeziehungen sind an drei Stellen **schwächer** als die Prädikate,
die die Action durchsetzt.

Die Gegenprobe bleibt e2e und bleibt unverändert: `auftrag` → `/verteilen` = 404 **und** „kein
Verweis auf verteilen im Markup" (aktiv über alle `href` gescannt); `bufdi` → `/freigaben` = 404;
`bufdi` → `/personen` = 404.

### 3. Ist der Zustand ablesbar, ohne zu klicken — und der nächste Schritt benannt?

Das ist der ganze Entwurf. Drei Ebenen, absichtlich redundant in der *Zusammenfassung*, nie in den
*Rohdaten*:

- **Kontextzeile** (12px): die Zahlen inklusive Nullen — die Lage in einem Satz.
- **Führungskarte**: der eine nächste Schritt, wörtlich benannt, mit dem Knopf, der ihn tut, plus
  die Zeile „ALS NÄCHSTES" als Satz.
- **Zonen**: der Vorrat, jede mit Zahl in der Überschrift und einem Deckel.

Und je Zeile: Zustands-Chip mit ausgeschriebenem Wort, Prioritäts-Chip mit ausgeschriebenem Wort,
`<Frist>` mit ausgeschriebener Überfälligkeit **samt Zahl** — kein Zustand nur als Farbe.

### 4. Führt jede Seite zurück?

Ja. `SeitenKopf` erzwingt die Brotkrume als Pflichtprop; der erste Eintrag ist auf jeder Unterseite
`{ label: "Aufgaben", href: "/" }`, der Einstieg trägt `[{ label: "Aufgaben" }]` ohne `href` — er
**ist** das Ziel. Zusätzlich führt die Modulnavigation aus `_lib/nav.ts` von jeder Seite auf jede
erlaubte andere. Weil keine Route entfällt, entfällt auch kein Navigationseintrag; „Verteilen" und
„Freigaben" bleiben in der Suite-Kopfzeile, und die Koordination kommt von `/personen` aus nicht nur
über den Einstieg zum Posteingang zurück.

### 5. Kommen Fehler aus Server-Actions am Feld an?

Ja — und daraus wird eine **Regel für die Führungskarte**: *sie trägt kein Eingabefeld im eigenen
Fluss.* Alles, was ein Feld ausfüllen lässt, führt entweder auf die Fläche, die den Feldfehler am
Feld anzeigen kann, **oder in ein Modal** — und ein Modal ist eine **eigene Ebene mit eigener
`useActionState`-Fehleranzeige** und deshalb erlaubt. Ohne diese Präzisierung widerspräche die Regel
ihrer eigenen Tabelle unten (Verteilen und Zurückweisen sind Modale mit Pflichtfeldern), und ob der
Verteilen-Knopf in der Karte überhaupt stehen darf, hinge an einer Auslegung. In §4.2 heißt es
entsprechend **„Modal, aus der Karte geöffnet"**, nicht „Modal in der Karte".

**Die Client/Server-Lage dieser Naht ist in §6.7 entschieden** und gehört hierher, weil sie genau
diese Tabelle betrifft: `Fuehrungskarte.tsx` ist Server Component ohne `"use client"`, und jede
Aktion mit Funktions-Prop — `Popconfirm` für „Zurückziehen", `VerteilenModal`, Zurückweisen-Modal —
steht in einer eigenen, direkt importierten Client-Insel nach dem Muster von `AktionsZone.tsx`.

| Aktion in der Karte | Form | Fehlerweg |
|---|---|---|
| Bearbeitung starten · zurücksetzen · wieder aufnehmen · Annehmen · Freigeben · Auf heute legen · Auf morgen schieben | natives `<form action={…}>`, ausschließlich versteckte Felder | kann keinen Feldfehler haben; eine Zugriffsverletzung bleibt `throw` |
| **Fertig melden mit Nachweispflicht** | **nicht in der Karte** — Knopf „Nachweis hinterlegen und fertig melden" → `/a/<id>` | dort `useActionState`, Fehler an `nachweisText` **und** an `nachweis` (Bild); beide Schlüssel werden gerendert |
| Fertig melden ohne Nachweispflicht | `<form>` in der Karte | kein Feld, kein Feldfehler |
| Zurückweisen | Modal aus `FreigabeZone`, `useActionState` | Begründung ist Pflicht, Fehler am Textfeld |
| Verteilen · Anders zuweisen | Modal aus `VerteilenDialog`, `useActionState` — eigene Ebene, **aus** der Karte geöffnet | Fehler an `zielId` / `vorschlagDatum` |
| **Freies Einplanen** (Tag, Uhrzeit, Dauer — Modulspec §8.5) | **nicht in der Karte** — „Anders einplanen" → `/plan/<eigene>#einplanen-<id>` | dort `EinplanenFormular` mit `useActionState` |

Kein neues Formularmuster: es bleiben `useActionState` + `FormState` aus `_lib/formState.ts` und
native `<form action>` für die feldlosen Übergänge. `revalidatePath` nur im Erfolgsfall.

### 6. Gibt es Leerzustände?

Ja, und die meisten kann es gar nicht mehr geben: **eine leere Zone ist strukturell ausgeschlossen**,
weil `zonen` nur nicht-leere Anlässe enthält (R3). Was bleibt, ist ausgeschrieben:

| Ort | Text |
|---|---|
| Führungskarte, Koordination | „Nichts liegt an: Posteingang leer, keine Freigabe offen, nichts überfällig." |
| Führungskarte, BuFDi | „Für heute ist nichts mehr offen." + „Morgen: <Titel> · <Dauer>." bzw. „Diese Woche ist alles eingeplant." |
| Führungskarte, BuFDi am Wochenende | „Wochenende. Nächster Arbeitstag: Mo, 17.08." (+ was dort liegt) |
| Führungskarte, Auftrag | „Alle deine Aufträge laufen, nichts wartet auf dich." |
| Fläche Koordination, keine BuFDi aktiv | „Es ist noch keine BuFDi eingetragen." + Link `/personen` |
| Fläche BuFDi, leerer Tag | „Nichts eingeplant." (bestehend) |
| Fläche Auftrag, keine Aufträge | „Noch keine eigenen Aufträge." (bestehend) |
| `/verteilen`, `/freigaben`, `/archiv` | „Posteingang leer — alles verteilt", „Keine Freigabe offen", Archiv-Leertext (alle bestehend, Modulspec §9.8) |

Kein Platzhalter, keine Illustration, kein zweiter Startaufruf: der eine Knopf steht in der Karte
darüber. Ein Diagramm gibt es im Modul nicht — die Auslastung ist eine Zahl mit einem Nenner
(„6 / 39 Std."), kein Achsenkreuz, das leer kaputt aussähe.

### 7. Zeigt die Liste, was sie zeigen soll — oder nur einen Link?

Eine Zeilenform für das ganze Modul, `_ui/AufgabenZeile.tsx` (**neu**, Extraktion aus
`AufgabenListe.tsx` — §3.6), feste Reihenfolge:

```
Titel (Link auf /a/<id>)   [Zustand]  [Priorität]   <Frist>   Dauer   ‹Rollenzusatz›
```

Der Rollenzusatz ist der einzige variable Teil und immer **eine** Angabe: BuFDi → Zeitvorschlag bzw.
Plantag · Koordination → Zugewiesener · Auftrag → „Empfänger: X" bzw. „Noch nicht verteilt" ·
Freigabe → „Nachweis (Text) liegt vor" · zurückgewiesen → die Begründung wörtlich.

Damit trägt jede Zeile Status, Menge (Dauer) und Datum (Frist) — die drei Angaben, die die
Prüffrage verlangt — und der Titel ist nie das Einzige, was dasteht. Der einzige Ort ohne Link auf
`/a/<id>` bleibt die Tagesspalte für Routinen: eine Routine hat keine Detailseite, weil sie kein
Aufgabendatensatz ist (Modulspec §6).

---

## 11. Testfolgen

### 11.1 Vitest

| Datei | Änderung |
|---|---|
| **`_lib/lage.test.ts`** | **neu.** Erschöpfend: jede Sprosse jeder der drei Leitern, der Leerfall je Rolle, der Gleichstandsfall (zehn gleiche Fristen → die Karte nennt Zahl und Extrem, nicht eine Aufgabe), der Wochenendfall (`kein_arbeitstag` verdrängt Rang 5/6, nicht Rang 1–3), `ohneAktivenTraeger`, `ohnePlatzInDerAchse`, und die Partitionszusage in ihrer **belegbaren** Form: **jede Aufgabe fällt in höchstens eine Sprosse, und jede nicht eingeordnete Zeile ist auf der Fläche der Rolle sichtbar** — prüfbar gegen die geschlossene Restmengen-Aufzählung aus §4.1 (Achse ∪ Achsen-Fußzeile ∪ „Die Woche der drei" ∪ „Eigene Aufträge" ∪ `/archiv`). „Genau eine Sprosse" wäre **falsch** und der Test müsste rot sein (§4.1 nennt die Gegenbeispiele). Dazu: **jeder nicht-leere Anlass erscheint entweder in der Karte oder als Zone oder ist in §3.4 als R3-Ausnahme benannt — nie keins, nie beides.** Und `alsNaechstes === anlaesse[1] ?? <NegativAnlass der Rolle>`, im Ruhefall `null` — beide Zweige liefern einen `Anlass`, keinen String (§4.1, §4.2). Feste `heute`-Argumente, keine Systemuhr. |
| **`_ui/Frist.test.tsx`** | **neu.** Die drei Ausprägungen, die Singular-/Pluralgrenze bei einem Tag, und der Quelltext-Scan aus §6.6 über `.ts` **und** `.tsx` mit den zwei erlaubten Orten — samt Gegenprobe-Fixturen, die belegen, dass der Scan die verbotene Form tatsächlich sieht (Muster `SeitenKopf.test.tsx`). |
| **`_ui/Fuehrungskarte.test.tsx`** | **neu.** Höchstens ein `type="primary"` je Belegung; für jede Sprosse ohne Zustandsaktion **kein** Primärknopf; Quelltext-Scan dieser einen Datei auf `Card`, `Alert` **und `"use client"`** (§9/S5 und §6.7) — die Client/Server-Entscheidung ist sonst die eine, die still kippen kann, weil kein Tor außer Playwright sie sieht. |
| **`_ui/AufgabenZeile.test.tsx`** | **neu.** Die feste Reihenfolge aus §10 Prüffrage 7 (Titel-Link auf `/a/<id>` · Zustand · Priorität · `<Frist>` · Dauer · **genau ein** Rollenzusatz), der Fall `rollenZusatz === null`, und der Beleg, dass die bestehenden `li`-Zusagen aus `AufgabenListe.test.tsx:140-142` und `:153-164` die Extraktion überleben. Die Datei trägt die Zeilenform des ganzen Moduls und eine neue Klasse `.zeilenListe > li` — ohne eigenen Test hinge sie an einer Prüfung, die nur die Schreibweise deckt. |
| **`_lib/aktionsOptionen.test.ts`** | **ergänzt:** das neue Feld `umverteilen` (§7 Nr. 3) über dieselbe `uebergang()`-Schleife — erlaubt genau aus `verteilt` und genau für `darfVerteilen`, sonst falsch. |
| **`_ui/AktionsZone.test.tsx`** | **ergänzt:** die feste Vorrangliste (`freigeben` › `nachweisHochladen` › `fertig` › …) trägt **höchstens einen** `type="primary"`; eine nachweispflichtige `in_arbeit`-Aufgabe zeigt „Nachweis hinterlegen" als Primärknopf, nicht „Fertig melden"; eine `eingegangen`-Aufgabe zeigt **keinen** Primärknopf, und „Zurückziehen" bleibt sekundär mit `Popconfirm`. |
| **`_ui/aufgaben-css.test.ts`** | **eine** neue Kontrastzeile (`--auf-achtung-text` auf `--auf-papier`, hell und dunkel, §6.5). Aussage 1 („genau eine Medienabfrage") bleibt grün, weil die zwei neuen Regeln in den bestehenden Block gehen. Aussage 2 (Paarigkeit) sieht nichts Neues, weil keine Variable dazukommt. Aussage 6 (SPACE-Leiter) bleibt grün: alle neuen Werte sind 8/12/16/24. |
| **`_db/schema.test.ts`** | **neu oder ergänzt:** ein Riegel, der `faellig_am` als `notNull` festhält — die totale Ordnung und `<Frist>` ruhen darauf (§9, S4). |
| `_ui/EinstiegKoordination.test.tsx`, `_ui/EinstiegBufdi.test.tsx` | Die Kachel-Fälle („0-Kacheln bleiben stehen", „jede Kachel mit Zahl > 0 trägt ein Ziel") entfallen mit den Kacheln. An ihre Stelle tritt die stärkere Zusage aus `lage.test.ts`. |
| `_ui/Kachel.test.tsx` | **entfällt** mit `_ui/Kachel.tsx` (§1.4). |
| `_ui/VerteilenDialog.test.tsx` | Zwei Zeilen: die Kleinschreibung „überfällig" wird zur vereinheitlichten Großschreibung „Überfällig seit N Tagen". |
| `_ui/AufgabenListe.test.tsx` | **bleibt grün und bleibt bestehen** — sie sichert die Großschreibung **und** ist die Gegenprobe, dass die Extraktion nach `AufgabenZeile.tsx` (§3.6) nichts verloren hat. `AufgabenListe.tsx` bleibt als Hülle, die fünf heutigen Aufrufer wandern nicht. |
| `_ui/SeitenKopf.test.tsx` | **unverändert.** Die vier modulweiten Verbote gelten weiter und werden von nichts in dieser Spec berührt: kein `Typography`, kein `@ant-design/icons`, kein `size`, kein `Grid.useBreakpoint`. |
| `src/proxy.test.ts`, `scripts/seed-lokal.test.ts`, `core/bootstrap.test.ts` | **unberührt.** Diese Spec ändert keine Route, kein Registry, kein Migrationsverzeichnis und keinen Seed. |

### 11.2 e2e (`e2e/aufgaben.spec.ts`)

| Test | Änderung |
|---|---|
| `:1483-1485` — Test `:1414`, „der volle Durchlauf", Schritt 3 | `page.getByRole("button", { name: /^Annehmen:/ })` statt Zugriff über `#posteingang li` — ein Fix für zwei unabhängige Bruchursachen (§3.3). |
| `:1790-1793` — Test `:1701`, „Leerer Start: der volle Rundlauf ohne Seed-Vorleistung", Schritt 5 | **Dieselbe Stelle ein zweites Mal**, in der ersten Fassung dieser Spec übersehen: **derselbe Fix**, Begründung identisch und **nur einmal geschrieben** (§3.3). Hier trägt schon R3 allein — die frisch angelegte Person hat genau eine wartende Aufgabe, die Karte nennt sie, die Zone entfällt, und `expect(posteingangZeile).toHaveCount(1)` in `:1791` würde 0. Ohne diesen Eintrag würde der Test unangekündigt rot, und weil er nicht in der Liste stünde, suchte man die Ursache zuerst am neuen Personenanlege-Pfad. |
| `:236` „Verbandskästen" auf `/` | bleibt grün; zusätzlich eine Zusicherung auf `[data-rolle="fuehrung"]` und ein Kommentar, der die Seed-Abhängigkeit (genau eine `eingegangene` Aufgabe) benennt. |
| Überlauf-Sweep | `/` als **rike** und `/` als **malte** neu in `UEBERLAUF_SEITEN` (6 → 8 Zeilen, 24 → 32 Fälle); die drei Einstiege zusätzlich bei **360×740** (32 → 35), mit einer Begründung im Kopfkommentar im Stil der dort bereits stehenden Ausnahme für `/routinen`/`/freigaben`. |
| **neu**, drei Tests (Alina, Rike, Malte) | `[data-rolle="fuehrung"]` ist das erste Kind von `[data-testid="aufgaben-flaeche"]`, und darin steht **höchstens ein** `.ant-btn-primary`. |
| **unangetastet** | `:45`/`:56`/`:63` · die `h1`-Titel `:113`/`:215`/`:329` · **`:273` die Kernzusage** (`auftrag` → `/verteilen` = 404) · `:363` („kein Weg zum Verteilen", scannt jedes `href`) · `:380` (`#af-*`-Ids) · `:469` (`bufdi` → `/freigaben` = 404) · Tests 28–31 (Ziehen) · Tests 32–34 (mobile Umschaltung) · Test 59 (Dunkelmodus, exakter `--auf-tinte`-Hexwert) · Test 60 (Tastatur, `outline`) · Test 62 (`/personen`-Kontextzeile per Regex) · Test 63 (`PersonenTabelle`, natives `<select>`). |

**Was e2e ausdrücklich nicht prüft:** die Belegungen der Führungskarte. Sie sind ein reiner Selektor
über Datenzeilen und gehören `lage.test.ts`. Und der Wochenendfall gehört ebenfalls dorthin — ein
e2e-Test, dessen Ergebnis vom Wochentag des Laufs abhängt, wäre genau der Test, der zwischen zwei
Läufen kippt, ohne dass sich Daten geändert hätten.

### 11.3 Fachliche Zusagen, die unangetastet bleiben

Diese Spec ändert **Oberfläche**, nicht Fachlogik. Namentlich unberührt:

- **Das Vier-Augen-Prinzip.** Prüfer und Ausführende sind getrennt; `freigabeDaten(db, akteur,
  heute)` filtert **serverseitig** auf genau die Menge, für die `darfFreigeben` wahr wäre — samt
  beider Ausschlüsse aus Modulspec §7. Oberfläche und Riegel sagen an dieser Stelle dasselbe. Die
  Führungskarte speist sich aus derselben Ladefunktion und kann die Menge nicht erweitern.
- **Der `bufdis()`-Riegel.** `aktivePersonen(db, heute).filter(rolle === "bufdi")` bleibt wörtlich.
  Eine ausgeschiedene Person ist **kein** Verteilziel, und das soll so bleiben. Der Fall S1 wird
  **oberhalb** dieses Riegels gelöst (über `alleAufgaben` und `ohneAktivenTraeger`), nicht durch
  Aufweichen.
- **Die Zugriffsprädikate.** `darfVerteilen`, `darfFreigeben`, `darfFreigabenSehen`,
  `darfPlanSehen`, `darfPlanAendern`, `darfRoutinenVerwalten`, `darfEinstellenFuerAndere` — keins
  ändert sich, keins bekommt einen zweiten Aufrufer mit anderer Quelle. Die Rangleiter benutzt
  **dieselben** Funktionen auf **denselben** Akteur.
- **Die Übergangstabelle** in `_lib/lebenszyklus.ts`. Unverändert, insbesondere
  `umverteilen` ausschließlich aus `verteilt` mit `planLoeschen: true` — die Oberfläche passt sich
  an sie an, nicht umgekehrt. Die eine Frage, die dabei aufgeworfen wird (darf die Koordination eine
  `in_arbeit`-Aufgabe zurücksetzen?), ist als **offener Punkt an Modulspec §5** benannt und hier
  nicht entschieden.
- **`istUeberfaellig`** und die übrigen Ableitungen in `_lib/anzeige.ts`. Die Bedingung war nie das
  Problem; nur die Darstellung wird vereinheitlicht.
- **Das Modul-Dreieck** (Migrationsverzeichnis, `MODULE_MIGRATIONS`, `COPY` im `Dockerfile`) und der
  lokale Seed. Keine Datenbankänderung, keine Migration, keine Seed-Zeile.

### 11.4 Reihenfolge einer Umsetzung

Die Reihenfolge entscheidet, ob die Tore zwischendurch grün bleiben:

1. `_lib/lage.ts` + `_lib/lage.test.ts`, `ANLASS_TEXT`/`FRIST_TEXT` in `_lib/anzeige.ts`, die drei
   neuen Prädikate. Reiner Selektor plus Beschriftung, keine Oberfläche, erschöpfend prüfbar ohne
   jedes Rendern.
2. `_ui/Frist.tsx` + Test + Quelltext-Scan, und die **sechs** Aufrufstellen umgestellt (§6.2). **Erst
   nach Schritt 1**, weil der Scan sonst gegen die heutigen Überschriften in
   `EinstiegKoordination.tsx` ausschlägt. **Und der Scan läuft über `ohneKommentare(quelle)`**
   (§6.6): `_lib/seedLokal.ts:63` und `:343` tragen das Wort in Kommentaren und sind **keine**
   dritte Ausnahme — wer den Scan über den Rohtext baut, hat ihn am ersten Tag rot, auf einer Datei,
   die §11.3 als unberührt zusagt. Ab hier ist Befund (2) erledigt, unabhängig vom Rest.
3. Die beiden bestehenden `type="primary"` demotiert (`EinstiegBufdi.tsx:255`,
   `EinstiegAuftrag.tsx:72`) — **vor** dem Zählriegel, sonst ist er am ersten Tag rot.
4. `_ui/Fuehrungskarte.tsx` + `_ui/AufgabenZeile.tsx` (**beide neu**, §3.6 und §6.7), dann die drei
   Einstiege darauf umgebaut, inklusive `data-testid="aufgaben-flaeche"` und Regel D.
   **Die Naht in einem Satz:** `Fuehrungskarte.tsx` ohne `"use client"`; `Popconfirm`,
   `VerteilenModal` und Zurückweisen-Modal als eigene, direkt importierte Client-Inseln nach dem
   Muster von `AktionsZone.tsx:1`/`:206-216`; keine `columns[].render`-Funktion; kein Icon über den
   nackten Spezifizierer. `AufgabenZeile.tsx` ist die Extraktion des `<li>`-Rumpfs aus
   `AufgabenListe.tsx`, das als Hülle bestehen bleibt — die fünf heutigen Aufrufer wandern nicht.
5. CSS und Testerweiterung (eine Kontrastzeile, zwei Regeln in der bestehenden Medienabfrage), die
   KPI-Kacheln und ihre Klassen entfernt.
6. `umverteilenAction` verdrahtet: Karte Rang 1 und 5a, Zone „Überfällig", `AktionsZone`.
7. Voller Lauf: `pnpm typecheck` · `pnpm lint` · `pnpm vitest run` · `pnpm build` ·
   `pnpm exec playwright test`. Der letzte ist **Pflicht**, weil drei Aussagen dieser Spec von
   keinem anderen Tor gesehen werden: HTTP 200 (die antd-Compound-, Icon- und Client-Wert-Fallen
   bestehen alle drei anderen), die mobile Umschaltung, und „höchstens ein Primärknopf".

---

## 12. Gegenlesen und Nachbesserung

Diese Spec hat drei Gegenleser durchlaufen (**Umsetzbarkeit**, **Riegel**, **Fachlichkeit**). Jeder
Einwand steht hier mit dem, was aus ihm wurde — auch die, die bewusst nicht umgesetzt sind.
Überschneidende Einwände bleiben **getrennte Zeilen mit Querverweis**: zwei Gegenleser, die
dieselbe Stelle finden, sind zwei Belege, und das Zusammenlegen verliert einen davon.

### 12.1 Blockierende Einwände — alle drei behoben

| ID | Stelle | Was daraus wurde |
|---|---|---|
| **U-1** | §4.1 Bauregel 4 („genau eine Sprosse") gegen §11.1 | **Behoben.** Regel 4 lautet jetzt **„höchstens eine Sprosse"**, mit den drei Gegenbeispielen im Text. Neu dazu: die **Restmengen-Tabelle** in §4.1 (je Rolle, geschlossene Aufzählung) und die umformulierte Testzusage in §11.1 („höchstens eine Sprosse, und jede nicht eingeordnete Zeile ist auf der Fläche der Rolle sichtbar"). Damit ist der bestellte Test schreibbar statt strukturell rot. |
| **U-2** | §3.4 Regel D und `ANLASS_TEXT` gegen §3.1 | **Behoben.** Neuer **§3.5** mit der vollständigen Tabelle `AnlassArt → Kicker → Zonenüberschrift → Deckelziel`, eine Zeile je Sprosse aller drei Leitern plus Ruhe — ein `Record<AnlassArt, …>` ist damit schreibbar. Regel D ist präzisiert zu **„ein Deckel setzt ein Sammelziel voraus"**: Zonen ohne Sammelziel (`ohneAktivenTraeger`, „Überfällig", „Zurückgewiesen") sind **ungedeckelt**, mit der Abwägung ausgeschrieben. §9/S1, §9/S3 und §9.2 sind mitgezogen. |
| **U-3** | §4.2 „ALS NÄCHSTES" ohne Ableitungsregel | **Behoben.** Eine Regel für alle drei Rollen: **`anlaesse[1]`**, als Satz aus `ANLASS_TEXT`; leere Restmenge → der benannte Negativsatz der Rolle; Ruhefall → die Zeile **entfällt** (`alsNaechstes: Anlass \| null`, typisiert in §4.1). Der Doppelort des Wochenendsatzes löst sich damit auf: es ist **derselbe** `ANLASS_TEXT` von `bufdiKeinArbeitstag`, im Kartenkörper wenn er führt, in der Zeile wenn er zweiter ist. Rikes Skizze (§5.2, beide Breiten) war die einzige, die der Regel widersprach, und ist korrigiert. |

### 12.2 Wichtige Einwände

| ID | Stelle | Was daraus wurde |
|---|---|---|
| **U-4** | `AufgabenZeile` als Bestand behandelt | **Behoben.** Neuer **§3.6**: die Komponente ist **neu** (Extraktion des `<li>`-Rumpfs), mit Props, dem Schicksal von `AufgabenListe.tsx` (bleibt als Hülle, Aufrufer wandern nicht) und `AufgabenListe.test.tsx` (bleibt als Gegenprobe). §3.1 und §7 sagen für `/archiv` jetzt „unveränderte Anordnung, neue Zeilenkomponente"; §10 Prüffrage 7 nennt sie als neu; §11.1 bekommt `_ui/AufgabenZeile.test.tsx`. |
| **U-5** | Client/Server-Lage der Führungskarte offen | **Behoben.** Neuer **§6.7**: `Fuehrungskarte.tsx` **ohne `"use client"`**, Modale und `Popconfirm` als direkt importierte Client-Inseln nach dem Muster `AktionsZone.tsx`, keine `columns[].render`, kein nackter Icon-Spezifizierer — mit demselben Begründungssatz, den §6.2 für `Frist.tsx` führt. §10 Prüffrage 5 und §11.4 Schritt 4 verweisen darauf. **Derselbe Befund wie R-3.** |
| **U-6** | Kontextzeile ohne Format, Nullen widersprüchlich | **Behoben.** §3.5 schreibt je Rolle eine **Formatvorlage** aus (Kennzahlen, Reihenfolge, Trennzeichen „ · ") und legt **eine** Nullschreibweise fest: **„nichts X", nie „0 X"**. §1.4 ist nachgezogen und begründet, warum die Zusage „einschließlich der Nullen" damit belegt ist; die Sonntagsskizze §5.4 folgt dem Format. `ohneAktivenTraeger` steht bewusst **nicht** in der Zeile — begründet in §3.5. |
| **U-7** | R3, „welcher Anlass ist bereits die Fläche der Rolle" | **Behoben.** §3.4 bekommt eine **Ausnahmetabelle je Rolle** mit dem Maßstab davor: BuFDi → Rang 3/4/5 (und die Abhängigkeit von Regel V ist mitgeschrieben) · Koordination → **keine** Ausnahme, weil „Die Woche der drei" nur Zahlen zeigt · Auftrag → **alle**, Ebene 4 existiert für diese Rolle nicht. §5.3 sagt das jetzt auch im Fließtext. |
| **R-1** | §6.6, Scan gegen „überfällig" | **Behoben.** §6.6 hält fest, dass der Scan jede Datei durch **`ohneKommentare(quelle)`** liest (Muster `SeitenKopf.test.tsx:105`/`:111`), und nennt `_lib/seedLokal.ts:63`/`:343` namentlich — **ausdrücklich nicht** als dritte Ausnahme, mit Begründung. §11.4 Schritt 2 nennt beide Zeilen neben `EinstiegKoordination.tsx`. **Deckungsgleich mit F-8.** |
| **R-2** | zweite `#posteingang li`-Stelle bei `:1790` | **Behoben.** §3.3 und §11.2 führen jetzt **beide** Stellen (`:1483-1485` in Test `:1414` und `:1790-1793` in Test `:1701`), mit derselben, **einmal** geschriebenen Begründung und einem Querverweis statt einer Wiederholung. Für `:1790` ist zusätzlich vermerkt, dass dort R3 allein trägt (n = 1 nach Schritt 4). |
| **R-3** | Führungskarte: `Popconfirm` mit Funktions-Prop, Falle 9 | **Behoben — dieselbe Änderung wie U-5** (§6.7). Zusätzlich aus diesem Einwand übernommen: `Fuehrungskarte.test.tsx` scannt den Quelltext neben `Card`/`Alert` auch auf **`"use client"`** (§11.1), damit die Entscheidung nicht in einer späteren Runde still kippt. |
| **F-1** | Regel D, zielfreie Zonen | **Behoben — dieselbe Änderung wie U-2**, und zwar nach dem hier vorgeschlagenen Weg: die Ausnahme wird auf zielfreie Zonen **ausgedehnt** (kein Deckel, weil kein Ausgang existiert), statt einen Deckel ins Leere laufen zu lassen. Die Grenze ist in §9/S1 mitgezogen: Rikes acht Aufgaben stehen dort vollständig. |
| **F-2** | BuFDi Rang 1 ohne Nachweispflicht-Verzweigung; §7 Nr. 2 | **Behoben.** Rang 1 verzweigt jetzt wie Rang 3 (`nachweisPflicht` → „Nachweis hinterlegen und fertig melden" → `/a/<id>`), und der Durchfall `freigabe_offen` ist als **kein Primärknopf** benannt. In §7 Nr. 2 steht `nachweisHochladen` **vor** `fertig`, mit der nachgelesenen Begründung (`lebenszyklus.ts:145-158` gegen `actions.ts:647-668`). |
| **F-3** | `aktionsOptionen` deckt `einplanen` nicht | **Behoben — ohne `aktionsOptionen` zu erweitern.** §4.2 schreibt aus, dass Rang 6 und die beiden Verschiebeknöpfe an **`darfPlanAendern(akteur, akteur.person.id, heute)`** hängen (mit `istAktiv`), samt der Fundstellen für den Wurf (`actions.ts:475`, `:554-561`). §10 Prüffrage 2 behauptet keine Deckung mehr, sondern nennt die Lücke und ihren Riegel. |
| **F-4** | `umverteilen` fehlt in `AktionsOptionen` | **Behoben.** §7 Nr. 3 schreibt das achte Feld über dieselbe `uebergang()`-Schleife aus, mit dem Verbot aus dem Kopfkommentar von `aktionsOptionen.ts` als Begründung; `_lib/aktionsOptionen.test.ts` und `_ui/AktionsZone.test.tsx` stehen jetzt in §11.1. Damit ist „kein Umbau" auch wahr. |
| **F-5** | Auftraggeber-Leiter nennt Rollenbeziehungen statt Prädikate | **Behoben.** Rang 1 ist „die Zeilen aus `freigabeDaten(db, akteur, heute).meine`", der n>1-Knopf hängt an `darfFreigabenSehen`, Rang 3 an dem `zurueckziehen`-Zweig aus `uebergang()`. Ein Absatz darunter belegt, an welchen drei Stellen die Rollenbeziehung schwächer war und was ein ausgeschiedener Auftraggeber sonst angeboten bekäme. **Kein Prädikat ändert sich.** |
| **F-6** | „Routinen verwalten" ungegatet | **Behoben.** §4.2 (Ruhe-Zeile) und die Fußzeile in §5.1 nennen `darfRoutinenVerwalten(akteur, heute)` als Bedingung, mit Verweis auf `routinen/page.tsx:107`, `zugang.ts:346-348` und die heutige Gatung in `EinstiegBufdi.tsx:212`. |
| **F-7** | `zurueckziehen` als Primärknopf bei `eingegangen` | **Behoben.** `zurueckziehen` ist aus der Vorrangliste in §7 Nr. 2 **entfernt** und grundsätzlich sekundär mit `Popconfirm` — mit derselben Begründung, die §4.2 für den Auftraggeber Rang 3 schon führt. Eine `eingegangen`-Aufgabe trägt auf `/a/<id>` damit **keinen** Primärknopf, was Regel P zulässt. |

### 12.3 Kleine Einwände

| ID | Stelle | Was daraus wurde |
|---|---|---|
| **U-8** | §10 Prüffrage 5 gegen die eigene Tabelle | **Behoben.** Die Regel lautet jetzt „**kein Eingabefeld im eigenen Fluss**; ein Modal ist eine eigene Ebene mit eigener `useActionState`-Fehleranzeige und deshalb erlaubt". „Modal in der Karte" ist an allen drei Fundstellen durch **„Modal, aus der Karte geöffnet"** ersetzt. |
| **R-4** | `AufgabenZeile` im Präsens, kein Test | **Behoben — dieselbe Änderung wie U-4** (§3.6 plus `_ui/AufgabenZeile.test.tsx` in §11.1, einschließlich der `li`-Zusagen aus `AufgabenListe.test.tsx:140-142`/`:153-164` als Gegenprobe). |
| **R-5** | „#posteingang und #freigabe bleiben bestehen" | **Behoben.** Der Absatz in §3.2 sagt jetzt: die Ids behalten ihre **Schreibweise**, ihre **Anwesenheit ist nach R3 datenabhängig** und darf von keinem Test vorausgesetzt werden; jede e2e-Zusicherung greift über `getByRole` auf das Bedienelement zu. Der Satz nennt selbst, dass die alte Fassung der Grund für das Übersehen von `:1790` war. |
| **R-6** | §6.2 zählt fünf Aufrufstellen | **Behoben.** Es sind **sechs**: die Führungskarte ist ergänzt, und die Server/Client-Aufteilung ist auf „zwei Inseln, vier Server Components" korrigiert — womit dieselbe Zeile die Naht aus §6.7 mitträgt. |
| **R-7** | S9-Begründung für `EinstiegAuftrag.tsx:72` | **Behoben.** §1.3 und §9/S9 trennen die beiden Gründe: `EinstiegBufdi.tsx:255` steht **innerhalb** von `aufgaben-flaeche` (der Zählriegel fände ihn), `EinstiegAuftrag.tsx:72` steht im `aktionen`-Prop des `SeitenKopf` und damit **außerhalb** (der Riegel fände ihn nicht) — er wird demotiert, weil die Regel für die ganze Seite gilt. |
| **R-8** | „360px"-Überschriften gegen §8 | **Behoben.** Die drei Überschriften lauten jetzt „**< 768px (Skizze bei 360px, der schmalste gemessene Fall)**", und §6.5 hält fest: alle 360px-Skizzen zeigen den Zustand **der einen bestehenden Medienabfrage**; 360 ist die Messbreite aus §9/S4, keine Schaltschwelle (`aufgaben-css.test.ts:40-49` verlangt exakt `["767.98"]`). |
| **F-8** | `_lib/seedLokal.ts` im Scan | **Behoben — dieselbe Änderung wie R-1.** Gewählt ist die erste der beiden vorgeschlagenen Varianten in verschärfter Form: der Scan liest durch `ohneKommentare()`, und `seedLokal.ts` wird **ausdrücklich keine** Ausnahme — eine Ausnahmeliste, die Dateien statt Rollen nennt, wüchse mit jedem Kommentar. §11.3 („keine Seed-Zeile") bleibt damit wahr. |

### 12.4 Was diese Runde zusätzlich geändert hat

Zwei Folgeänderungen, die kein Gegenleser bestellt hat, ohne die aber ein behobener Einwand
unvollständig geblieben wäre — beide sind hier benannt, damit sie beim nächsten Lesen nicht als
unbelegt auffallen:

- **§3.5 ist die Quelle für drei der vier `ANLASS_TEXT`-Felder, nicht für alle vier.** Das vierte,
  der **Satz**, steht in der Spalte „Die Karte zeigt" der Leitertabellen in §4.2 — dort, wo die
  Sprosse ihn erzeugt. §3.5 sagt das jetzt ausdrücklich, mit einem durchgerechneten Beispiel
  (`koordFreigabeOffen`), damit U-2 nicht eine Ebene tiefer wiederkehrt.
- **Der Negativsatz der ALS-NÄCHSTES-Zeile ist ein eigener `AnlassArt`-Schlüssel** je Rolle
  (`koordNegativ`/`bufdiNegativ`/`auftragNegativ`), damit `alsNaechstes` beim Typ `Anlass | null`
  bleibt. Ohne diesen Schritt hätte U-3 drei Ausprägungen bei zwei darstellbaren erzeugt und die
  Testzusage in §11.1 Struktur mit String gemischt.
- **„Rang" und „Position" sind in §3.4 getrennt.** Regel R3 spricht jetzt von der **Position in
  `anlaesse`**, die Ausnahmetabelle und §3.5 ausschließlich vom **Leiter-Rang**. Beide Begriffe
  standen zuvor als „Rang" nebeneinander in derselben Regel, und genau sie prüft `lage.test.ts`.
- **`ausserhalbDerWoche` heißt jetzt `ohnePlatzInDerAchse`** und fasst die **terminlose** Zeile mit
  (§4.5). Ohne diese Erweiterung wäre die Restmenge der BuFDi-Leiter (U-1) keine geschlossene
  Aufzählung und die R3-Ausnahme für Rang 3 (U-7) falsch. Der Name musste mitwandern, weil
  „außerhalb der Woche" über eine Zeile ohne `planDatum` eine Falschaussage ist. Drei Stellen
  tragen ihn: §1.3, §4.5 und §9/S2.
- **`lage.ts` ist ausdrücklich server-only** (§4.1), mit derselben Begründung, die der Kopfkommentar
  von `aktionsOptionen.ts` schon führt. Ohne diesen Satz lüde die Erweiterung um `umverteilen`
  (F-4) dazu ein, den Selektor in eine Client-Insel zu ziehen — und damit `@/core/auth` ins Bundle.
