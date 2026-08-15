# Modul `aufgaben` — Aufgabenverteilung und Zeitplanung für BuFDis

**Stand:** 2026-08-13, zuletzt nachgetragen 2026-08-15 · **Status:** Umsetzung abgeschlossen (Aufgabe 21)

## 1. Das Problem, in den Worten des Auftraggebers

Der Ortsverein hat ab dem kommenden Dienstjahr **drei** BuFDis statt einer. Damit wird die
Aufgabenverteilung unübersichtlich, und zwei Beteiligte (Tomke, Malte) verteilen faktisch mit,
ohne die Gesamtlage zu kennen — Aufgaben werden doppelt vergeben, andere fallen durch. Rike
koordiniert, hat aber keinen Ort, an dem die eingehenden Aufträge zusammenlaufen.

Vier Anforderungen, die daraus folgen:

1. Auftraggeber (Malte, Tomke, Rike) stellen Aufgaben **mit Erklärung und Priorität** ein.
2. Rike verteilt sie auf die drei BuFDis und bringt sie in deren Zeitplan.
3. BuFDis gestalten ihren Zeitplan **vorab selbst**, um sich Zeit für Routinearbeiten freizuhalten.
4. Fremd gestellte Aufgaben können mit einer Flagge versehen werden, die den BuFDi zur
   **Dokumentation** der fertigen Arbeit zwingt, und ihre Erledigung muss vom Vorgesetzten
   **bestätigt** werden. Selbst gestellte Aufgaben nicht.

Ein Klickdummy als eigenständige HTML-Datei lag zu Beginn dieses Entwurfs unter
`bufdi-koordination-klickdummy.html` (Wurzel des Repositories). Er war **Referenz für den
Funktionsumfang, nicht für die Gestaltung** — sein Design gehörte nicht zur Suite. Er war planmäßig
zum Abschluss der Umsetzung zu löschen; bei Aufgabe 21 (dem Abschluss) war er bereits fort — weder
im Worktree noch im Haupt-Repository —, sodass dort nichts mehr zu löschen war.

## 2. Getroffene Entscheidungen

Fünf Fragen waren fachlich offen; alle fünf sind entschieden.

| Frage | Entscheidung | Begründung |
|---|---|---|
| Wer legt den Zeitpunkt fest? | Rike **schlägt vor**, der BuFDi bestätigt oder plant anders | Anforderung 3 gibt dem BuFDi die Gestaltungshoheit; Rike braucht trotzdem einen Weg, Dringlichkeit auszudrücken |
| Bauform des Zeitplans | **Tagesspalten** mit Reihenfolge, Dauer und Tagesbudget; einzelne Einträge dürfen eine **feste Uhrzeit** tragen | Robust gegen die Realität, mobil ohne zweiten Bildschirm; feste Uhrzeiten bleiben möglich, wo sie real sind (Routinen, Termine) |
| Freigabebefugnis | Der **Ersteller**, plus **Rike als Vertretung** | Zurechnung bleibt beim Auftraggeber, aber nichts bleibt liegen, wenn er zwei Wochen im Urlaub ist |
| Nachweisformen v1 | **Text und Bild**. Video vertagt | Der große Sprung ist „überhaupt Dateien annehmen"; Video ist danach vor allem eine Speicher- und Backup-Frage, also eine Betriebsentscheidung |
| Sichtbarkeit | BuFDis sehen die Zeitpläne der anderen **lesend**; Nachweise nur Verfasser, Rike und der jeweilige Auftraggeber | Vertretungsabsprachen ohne Rike als Nadelöhr, aber Leistungsnachweise sind kein Aushang |

Dazu drei Entscheidungen zum Bauweg:

- **Es entsteht die Anwendung, kein Klickdummy** (Betreiberentscheid 2026-08-13). Ein erster
  Bauabschnitt mit fest verdrahteten Daten und einem Demo-Rollenwechsler ist gestrichen: Rollen
  kommen von Anfang an aus der Sitzung. Der zu Entwurfsbeginn vorhandene
  `bufdi-koordination-klickdummy.html` blieb Referenz für den **Funktionsumfang**, bis er planmäßig
  entfernt wurde (s. §1).
- **Drag & Drop ist gewünscht und im Umfang** — aber es ist nie der einzige Weg. Mit der Tastatur ist
  Ziehen nicht bedienbar und auf dem Handy nicht zuverlässig, also ist die Knopf- und
  Formularstrecke ohnehin Pflicht; Ziehen ist eine Schicht darüber mit denselben Server-Actions und
  wird nach ihr gebaut.
- **Nur das clamd-*Protokoll* geht nach `core`, nicht die Warteschlange.** Das Spec sagte zunächst
  „Upload und Virenscan nach `src/core/upload` heben und `files` mitziehen". Am 2026-08-13 gemessen
  ist das **nicht eine Sache, sondern zwei**: `files/_lib/av.ts` hat 728 Zeilen, davon sind Zeile
  35–262 das generische clamd-Protokoll (die vier Bauregeln „settelt immer, genau einmal, wirft nie
  asynchron") und Zeile 264–728 eine Warteschlange, die **die Datenbank von `files` ist** —
  `AvTabelle = "share_files" | "inbox_files"`, die Aufträge sind die Zeilen mit
  `av_status = 'scanning'`, ein Arbeiter je Container.

  Die Suite hat **eine SQLite pro Modul**. Ein geteilter Arbeiter müsste also mehrere Datenbanken
  öffnen und eine Auftragsreihenfolge über sie führen — das ist eine neue Architektur, keine
  Verschiebung, und sie fasst `_lib/boot.ts`, `instrumentation.ts` und den prozessweiten Netzhaken an.
  Deshalb: `core/av/scanner.ts` bekommt `scanne(pfad, konfig)` samt Antwortauswertung,
  `istFreigegeben` und Netzhaken — **die Konfiguration als Argument**, damit `FILES_AV_*` unangetastet
  bleibt. Die Warteschlange bleibt bei jedem Modul; `aufgaben` bekommt eine kleine über seine **eine**
  Tabelle. `files` ändert sich an einer Aufrufstelle. Der `core`-Maßstab ist damit erfüllt (zwei heute
  belegbare Nutznießer des Protokolls), ohne dass jemand einen datenbankübergreifenden Arbeiter
  erfindet.

## 3. Registrierung als Modul

Ein eigenes Modul, keine Erweiterung: nichts in `portal`, `feedback`, `files` oder `lagerbuch` ist
ein Aufgabenwerkzeug.

| Feld | Wert |
|---|---|
| `key` | `aufgaben` |
| `title` | `Aufgaben` |
| `icon` | `ScheduleOutlined` |
| `shell` | `full` |
| `requiresAuth` | `true` |
| `requiredGroups` | `["iuk-aufgaben-nutzer"]` |
| `adminGroups` | `["iuk-aufgaben-koordination"]` |
| `prodHosts` | `[]` (Domain kommt aus `SUITE_HOST_AUFGABEN`) |
| `showInSwitcher` | zunächst `false`, seit Aufgabe 16 (Abschnitt E) `true` (ein halbfertiges Modul gehört nicht in die Navigation aller Nutzer) |
| `switcherGroupSources` | `["access"]` |

**`requiresAuth: true` ist hier richtig**, obwohl vier bestehende Module ausdrücklich das Gegenteil
festschreiben. Deren Begründung ist jeweils ein **anonymer Teilpfad** (`/f/…`, `/s/…`, `/t/…`, der
QR-Generator). Dieses Modul hat keinen — jede Ansicht setzt eine bekannte Person voraus. Ein
übernommenes `false` würde den generischen Middleware-Riegel abschalten und die Durchsetzung
komplett ins Modul verlagern, ohne dass irgendetwas dadurch möglich würde.

**Die Gruppe `iuk-aufgaben-nutzer` muss in Pocket ID angelegt werden, bevor das Modul produktiv
erreichbar ist** — eine nicht existierende Gruppe in `requiredGroups` sperrt jeden aus, den
Betreiber eingeschlossen. Lokal ist das **kein** Problem: `.env.local` setzt `AUTH_DEV_LOGIN=true`,
und der Dev-Login nimmt Gruppen als freies Eingabefeld an (`core/auth/config.ts`, Provider
`dev-login`) — die Entwicklung braucht also keine Pocket-ID-Arbeit. Zusätzlich sind beide
Gruppen per Env überschreibbar (`SUITE_ACCESS_GROUP_AUFGABEN`, `SUITE_ADMIN_GROUP_AUFGABEN`), was
einer Instanz mit anders benannten SSO-Gruppen den Weg offen hält.

**`ScheduleOutlined` muss in die `ICONS`-Map in `core/shell/icons.ts`.** Fehlt es dort, fällt der
Registry-Eintrag **still** auf `AppstoreOutlined` zurück — „Aufgaben" wäre dann in Kopfzeile und
Drawer jeder Suite-Seite nicht vom „Portal" zu unterscheiden. Kein Fehler, kein Log. `SuiteNav.test.tsx`
prüft die Map gegen die Registry und wird die fehlende Zeile melden.

## 4. Rollen — aus der Datenbank, nicht aus dem JWT

Drei Rollen: `koordination` (Rike), `auftrag` (Malte, Tomke), `bufdi` (die drei BuFDis).

Die Pocket-ID-Gruppe `iuk-aufgaben-nutzer` gatet **nur den Zugang zum Modul überhaupt**. Welche
Rolle eine Person hat, steht in der Modultabelle `person` und wird bei jedem Zugriff serverseitig
aus der Datenbank aufgelöst. Zwei Gründe, und beide sind zwingend:

1. **BuFDis rotieren jährlich.** Eine Rolle in Pocket-ID-Gruppen muss dort jeden Sommer gepflegt
   werden, von jemandem mit Pocket-ID-Zugang. Die Personenverwaltung im Modul kann Rike selbst
   bedienen.
2. **An der Rolle hängt die Freigabebefugnis.** Gruppen im JWT sind nur so frisch wie der letzte
   Token-Refresh — heute bis zu eine Stunde alt (Access-Token-Lebensdauer von Pocket ID). Für eine
   Befugnis, die eine Leistungsdokumentation abschließt, ist ein Verzugsfenster von einer Stunde die
   falsche Grundlage. Die Suite-Regel sagt genau das: wo eine Stunde zu lang ist, muss die
   Berechtigung serverseitig aus der Datenbank kommen.

Die Tabelle `person` pflegt, wer in `iuk-aufgaben-koordination` ist — plus der Suite-Admin
(`isModuleAdmin` aus `core/groups`, **nicht** `session.user.isAdmin`, das ist suiteweit).

**Nachtrag vom 2026-08-15 — wo der Suite-Admin-Zugang sitzt, und warum dort** (Betreiberentscheidung
2026-08-14). Der Zugang ist ein **Notausgang** und löst zwei benannte Lagen: in einer frischen
Produktionsdatenbank gibt es sonst keinen Weg zur allerersten `person`-Zeile (das Modul wird nicht
geseedet, und die Personenverwaltung setzt eine aktive Koordinationsperson voraus), und setzt die
einzige Koordinationsperson versehentlich ihr eigenes `aktiv_bis`, sperrt sie damit auch den
Betreiber aus.

Der Riegel dafür sitzt **auf der Route und in den Actions, nicht im Prädikat**:
`darfPersonenVerwalten` muss **synchron und rein** bleiben, weil `_lib/lebenszyklus.ts` und jeder
bestehende Aufrufer diese Signatur teilen — eine `isModuleAdmin`-Klausel *dort* machte das Prädikat
asynchron oder verlangte einen `groups`-Parameter, den keiner der Aufrufer mitführt. Wer den
Suite-Admin-Fall später „aufräumend" ins Prädikat zieht, macht genau diesen Fehler.

**Beide Seiten, nicht nur die Seite.** `/personen` prüft `canAdminModule("aufgaben")` vor jeder
Personen-Zeilen-Frage; **dieselbe Oder-Klausel steht in den schreibenden Actions**
(`personAnlegenAction`/`personAendernAction`/`personBeendenAction`, gebündelt an einer Stelle). Der
Zwischenzustand — Formular sichtbar, Absenden abgewiesen — war bis zum Abschlussreview real und ist
genau kein Zugang: er ließ beide oben benannten Lagen unverändert bestehen.

**Personen tragen `aktiv_von` und `aktiv_bis`.** Ein ausgeschiedener BuFDi verschwindet aus
Verteillisten und Zeitplan-Navigation; seine Aufgaben, Nachweise und Verlaufszeilen bleiben lesbar.
Ohne dieses Feld ist der Jahreswechsel eine Löschaktion, und die Dokumentation des vergangenen
Jahres ist genau das, was das Modul herstellen soll.

## 5. Zustandsmodell

Sechs Zustände. Ein siebter wird abgeleitet, nicht gespeichert.

| Zustand | Bedeutung | Wer bewegt weiter |
|---|---|---|
| `eingegangen` | eingestellt, niemandem zugewiesen | Koordination |
| `verteilt` | einem BuFDi zugewiesen, noch nicht begonnen | zugewiesener BuFDi |
| `in_arbeit` | Bearbeitung läuft | zugewiesener BuFDi |
| `freigabe_offen` | fertig gemeldet, Nachweis liegt vor | Prüfer oder Koordination (Vertretung) |
| `abgeschlossen` | bestätigt — Endzustand | — |
| `zurueckgewiesen` | Freigabe verweigert, mit Begründung | zugewiesener BuFDi |

Die Werte in dieser Spalte sind die **Datenbankwerte** und tragen deshalb keine Umlaute
(`zurueckgewiesen`, angezeigt als „Zurückgewiesen"). Die Beschriftung liegt in einer Map in `_lib/`,
in **einem** Modul ohne `"use client"` — sie wird von Server Components gelesen.

### 5.1 Der abgeleitete Zustand: „Zeitvorschlag offen"

Rike kann beim Verteilen Tag und optional Uhrzeit **vorschlagen**. Das sind zwei Felder auf der
Aufgabe (`vorschlag_datum`, `vorschlag_uhrzeit`), kein eigener Status. Die Anzeige leitet ab:

```
status = "verteilt" AND plan_datum IS NULL AND vorschlag_datum IS NOT NULL
  → "Vorschlag: Do, 09:00 — annehmen oder anders einplanen"
```

Nimmt der BuFDi an oder plant er selbst, wird `plan_datum` gesetzt und der Vorschlag ist verbraucht
(die Vorschlagsfelder bleiben stehen; der Verlauf hält fest, ob angenommen oder abgewichen wurde).
Ein eigener Status hierfür würde jeden Filter, jede Zählung und jede KPI-Kachel im Modul um einen
Fall erweitern, ohne mehr auszusagen.

### 5.2 Übergangstabelle

Diese Tabelle ist normativ und wird von Vitest **erschöpfend** geprüft — jeder Übergang, der hier
nicht steht, muss von der Server-Action abgelehnt werden.

| von | Aktion | nach | wer darf |
|---|---|---|---|
| — | einstellen, fremd | `eingegangen` | `auftrag`, `koordination` |
| — | einstellen, für sich selbst | `verteilt` (an sich) | jede Rolle, für sich |
| `eingegangen` | verteilen | `verteilt` | `koordination` |
| `eingegangen` | zurückziehen (löscht die Aufgabe) | — | Ersteller, `koordination` |
| `verteilt` | umverteilen | `verteilt` | `koordination` |
| `verteilt` | einplanen / verschieben (`plan_datum`) | `verteilt` | zugewiesener BuFDi |
| `verteilt` | Bearbeitung starten | `in_arbeit` | zugewiesener BuFDi |
| `in_arbeit` | einplanen / verschieben (`plan_datum`) | `in_arbeit` | zugewiesener BuFDi |
| `in_arbeit` | zurücksetzen | `verteilt` | zugewiesener BuFDi |
| `in_arbeit` | fertig melden, **Fremdaufgabe** | `freigabe_offen` | zugewiesener BuFDi |
| `in_arbeit` | fertig melden, **Selbstaufgabe** | `abgeschlossen` | zugewiesener BuFDi |
| `freigabe_offen` | freigeben | `abgeschlossen` | Prüfer, `koordination` |
| `freigabe_offen` | zurückweisen (Begründung **Pflicht**) | `zurückgewiesen` | Prüfer, `koordination` |
| `zurueckgewiesen` | Bearbeitung wieder aufnehmen | `in_arbeit` | zugewiesener BuFDi |

**Umverteilen löscht die Planung.** Wird eine Aufgabe einer anderen Person zugewiesen, werden
`plan_datum`, `plan_uhrzeit` und `plan_rang` geleert — ein Zeitplaneintrag gehört zu einer Person,
nicht zu einer Aufgabe. Sonst erscheint die Aufgabe im Tag des neuen BuFDi an einer Stelle, die er
nicht gewählt hat, und belegt dort Budget. Ein neuer Zeitvorschlag darf im selben Zug gesetzt werden.

**Nachtrag vom 2026-08-13 — `in_arbeit` ist verschiebbar.** Die Zeile `in_arbeit` +
einplanen/verschieben stand ursprünglich nicht hier. Der Widerspruch fiel bei der Umsetzung auf:
`_lib/tagesplan.ts` zeigt Aufgaben in Arbeit regulär in der Tagesspalte — richtig, denn woran man
gerade arbeitet, gehört in den Tag —, und ohne diese Zeile hätte das Ziehen einer sichtbaren
`in_arbeit`-Aufgabe einen Wurf auf die technische Fehlerseite ausgelöst. Fachlich ist die Ergänzung
das Naheliegende: wer eine angefangene Aufgabe heute nicht schafft, schiebt sie auf morgen, ohne sie
erst zurücksetzen zu müssen. Betreiberentscheidung nach Vorlage der drei Möglichkeiten.

Drei weitere Festlegungen, die in der Tabelle stecken und leicht übersehen werden:

- **Selbst gestellte Aufgaben nehmen die Kurzstrecke.** Kein Posteingang, kein Prüfer, keine
  Freigabe — direkt `verteilt` → `in_arbeit` → `abgeschlossen`. Genau die Anforderung.
- **`ist_selbst` wird gespeichert, nicht gerechnet.** Fachlich folgt es aus
  `ersteller_id = zugewiesen_an`, aber eine spätere Umverteilung würde den Charakter der Aufgabe
  sonst still ändern — aus einer freigabefreien Selbstaufgabe würde rückwirkend eine
  freigabepflichtige Fremdaufgabe.
- **Zurückziehen geht nur aus `eingegangen`**, und dann löscht es die Aufgabe samt Verlauf. Sobald
  jemand zugewiesen ist, hat die Aufgabe eine Geschichte, die Dokumentationswert hat; sie wird dann
  über den normalen Weg beendet oder umverteilt. Das erspart einen siebten Zustand
  (`zurückgezogen`), der in jeder Liste und jedem Filter mitgeschleppt werden müsste.

### 5.3 Nachweispflicht

Zwei Felder auf der Aufgabe: `nachweis_pflicht` (Schalter) und `nachweis_art` (`text` | `bild`).
Steht die Pflicht, lehnt die Server-Action `fertig melden` **ohne passenden Nachweis ab** — nicht
nur das Formular. Ein Formular ist eine Bequemlichkeit, keine Regel.

`nachweis_art = "bild"` verlangt eine Datei und erlaubt zusätzlich Text; `"text"` verlangt Text und
erlaubt zusätzlich eine Datei. Die Pflicht ist also eine Untergrenze, keine Beschränkung.

## 6. Datenmodell

Eine eigene SQLite unter `src/app/m/aufgaben/_db/`, wie bei jedem Modul. Sechs Tabellen.

### `person`
`id` · `sub` (Pocket-ID-Subject, unique) · `name` · `initialen` ·
`rolle` (`koordination` | `auftrag` | `bufdi`) · `soll_minuten_tag` (Vorgabe 468 = 7,8 Std.) ·
`aktiv_von` · `aktiv_bis` (nullable) · `erstellt_am`

**`farbe` gibt es nicht, und das ist entschieden, nicht vergessen** (Pre-Flight vor Aufgabe 2). Der
Entwurf führte die Spalte; sie widerspricht §9.4 („Farbe gehört nicht zur Rolle") — eine Person
bekommt im Modul keine eigene Farbe zugeteilt, sonst entsteht neben der Statusfarbigkeit eine zweite,
konkurrierende Farbsprache.

### `aufgabe`
`id` · `titel` · `beschreibung` · `prioritaet` (`hoch` | `mittel` | `niedrig`) ·
`ersteller_id` → `person` · `zugewiesen_an` → `person` (nullable) · `status` ·
`faellig_am` (Datum) · `faellig_uhrzeit` (nullable) · `dauer_minuten` ·
`nachweis_pflicht` · `nachweis_art` · `pruefer_id` → `person` (nullable bei Selbstaufgaben) ·
`ist_selbst` · `plan_datum` (nullable) · `plan_uhrzeit` (nullable) ·
`plan_rang` (Reihenfolge innerhalb des Tages) · `vorschlag_datum` (nullable) ·
`vorschlag_uhrzeit` (nullable) · `erstellt_am` · `aktualisiert_am`

Indizes: `(zugewiesen_an, plan_datum)` für die Zeitplan-Abfrage, `(status)` für die
Arbeitsvorratslisten, `(faellig_am)` für die Überfälligkeitsliste.

### `routine`
`id` · `person_id` → `person` · `titel` · `wochentage` (Bitmaske Mo–Fr) ·
`uhrzeit` (nullable) · `dauer_minuten` · `aktiv` · `erstellt_am`

**Eine Routine ist kein Aufgabendatensatz.** Sie ist ein wiederkehrender Zeitblock, der beim Lesen
in den Tag eingerechnet wird und Budget belegt — sie hat keinen Status, keinen Nachweis und keine
Freigabe. Wer eine Routine dokumentieren will, legt dafür eine selbst gestellte Aufgabe an.
Andernfalls entstehen bei fünf Routinen × drei Personen über ein Dienstjahr rund 3.000
Datensätze, die niemand liest, und jede Liste im Modul braucht einen Filter dagegen.

### `nachweis`
`id` · `aufgabe_id` → `aufgabe` · `art` (`text` | `bild`) · `text` (nullable) ·
`datei_id` → `datei` (nullable) · `erstellt_von` → `person` · `erstellt_am`

### `datei`
`id` · `aufgabe_id` · `dateiname` · `mime` · `groesse` ·
`scan_status` (`offen` | `sauber` | `befund` | `fehler`) · `erstellt_am`

**`scan_status` hat vier Werte, nicht drei, und der vierte ist der wichtigste** (Pre-Flight vor
Aufgabe 2): `fehler` trennt „der Scan lief schief" von „der Scan hat etwas gefunden" — fachlich zwei
verschiedene Lagen, die man in einer Oberfläche verschieden erklärt. Ausgeliefert wird in **beiden**
nicht: `istFreigegeben` (`_lib/scan.ts`) ist die einzige Fassung dieser Bedingung und gibt
ausschließlich für `"sauber"` wahr zurück. Genau daran hängt Fail-closed — ein `!== "befund"` an
irgendeiner Stelle lieferte einen fehlgeschlagenen Scan aus.

**`pfad` gibt es nicht, und das ist entschieden, nicht vergessen** (Pre-Flight vor Aufgabe 2, dort
ausdrücklich mit der Auflage, es „nicht still" zu tun). Der Ablagepfad wird aus `id` **abgeleitet**
(`_lib/ablage.ts`s `nachweisPfad`), statt gespeichert: ein absoluter Pfad in der Datenbank ist beim
ersten Umzug des Datenverzeichnisses falsch, und zwar still — die Zeile stimmt noch, die Datei ist
weg. Der `dateiname` bleibt als **Anzeigename** erhalten und geht bewusst in keinen Pfad und in
keinen HTTP-Kopf ein.

### `verlauf`
`id` · `aufgabe_id` → `aufgabe` · `ereignis` · `akteur_id` → `person` · `notiz` (nullable) · `ts`

Index: `(aufgabe_id, ts)`.

**Der Verlauf ist eine Tabelle, kein Textfeld auf der Aufgabe.** Jeder Übergang schreibt eine Zeile
mit Akteur, Zeitstempel und Ereignis; eine Vertretungsfreigabe schreibt sie als solche
(„Freigegeben von Rike in Vertretung für Malte"). Das ist die Leistungsdokumentation, die der
gesamte Freigabemechanismus eigentlich herstellen soll — ohne sie hat man am Ende des Dienstjahres
sechs Häkchen und keine Geschichte.

## 7. Zugriffsschutz

`_lib/zugang.ts` hält die Prädikate. **Alle Seiten und alle Server-Actions rufen dieselben** — das
ist die Bedingung dafür, dass Oberfläche und Riegel nicht auseinanderlaufen.

Die Tabelle ist **vollständig gegen `_lib/zugang.ts` gezogen** (Stand 2026-08-15) — sie führt **alle**
Exporte dieser Datei, nicht eine Auswahl (bewusst ohne Anzahl: eine gepflegte Zahl an dieser Stelle
liefe beim nächsten Prädikat wieder auseinander). Alle Handlungsprädikate tragen `heute` als ISO-Tagesstring und
prüfen `istAktiv` **jedes für sich**; die Sichtprädikate tragen es nicht und prüfen es nicht (eine
ausgeschiedene Person liest ihre Geschichte weiter, s. u.).

| Funktion | Aussage |
|---|---|
| `personFuerSeite(db)` | **für Seiten:** Sitzung → `person`-Zeile **oder `null`**. Ohne Sitzung → `notFound()`; ohne `person`-Zeile → `null`, damit die Seite die Erklärseite rendern kann (Nachtrag 2026-08-14 unten) |
| `subFuerSitzung()` | der Pocket-ID-`sub` der Sitzung, isoliert — der Ausgang aus der Erklärseite: die Person kann ihn sonst nirgends nachschlagen |
| `personFuerSession(db)` | **für Server-Actions:** wie oben, aber keine `person`-Zeile → `notFound()`. Eine Schreiboperation ohne zurechenbare Zeile darf nicht stattfinden |
| `istAktiv(person, heute)` | `aktiv_von` erreicht **und** `aktiv_bis` leer oder **heute oder später** (`aktiv_bis` schließt ein) |
| `darfVerteilen(person, heute)` | `rolle === "koordination"` und aktiv |
| `darfEinstellenFuerAndere(person, heute)` | `rolle === "auftrag"` oder `"koordination"`, und aktiv. Für **sich selbst** darf jede Rolle einstellen — das ist kein Prädikat, sondern der Normalfall |
| `darfPersonenVerwalten(person, heute)` | `rolle === "koordination"` und aktiv. **Der Suite-Admin kommt zusätzlich hinein — der Riegel dafür sitzt auf der Route und in den Actions, nicht in diesem Prädikat** (§4, Nachtrag dort) |
| `darfRoutinenVerwalten(person, heute)` | `rolle === "bufdi"` und aktiv (§8 nennt `/routinen` rollengebunden) |
| `darfPlanAendern(person, zielPersonId, heute)` | `person.id === zielPersonId` und aktiv. **Auch die Koordination ändert keine fremden Pläne** — sie schlägt vor (`vorschlag_datum`), sie setzt nicht |
| `darfFreigeben(person, aufgabe, heute)` | **`false` bei `ist_selbst`**, **`false` bei `person.id === aufgabe.zugewiesen_an`**, sonst `person.id === aufgabe.pruefer_id` **oder** `rolle === "koordination"`, und aktiv (beide Ausschlüsse: Nachtrag unten) |
| `darfPlanSehen(person, zielPersonId)` | **für alle wahr.** Jeder BuFDi sieht jeden BuFDi-Plan lesend, `koordination`/`auftrag` ohnehin alle. Kein `istAktiv` |
| `darfNachweisSehen(person, aufgabe)` | Verfasser (= aktuell Zugewiesener), `koordination`, `person.id === aufgabe.ersteller_id`, oder der eingetragene Prüfer (`person.id === aufgabe.pruefer_id`, Nachtrag unten). Kein `istAktiv` |
| `darfNachweisHochladen(person, aufgabe, heute)` | `person.id === aufgabe.zugewiesen_an` und aktiv. **Ohne die Zustandsbedingung `in_arbeit`** — die steht daneben (§5.2, `_lib/lebenszyklus.ts`), nicht in diesem Prädikat |
| `darfAufgabeSehen(person, aufgabe)` | `koordination` **oder** `bufdi` (Spiegelbild zu `darfPlanSehen`), sonst Ersteller, Zugewiesener oder Prüfer. `auftrag` bleibt damit enger als `bufdi`. Kein `istAktiv` |
| `darfFreigabenSehen(person, heute)` | `rolle === "auftrag"` oder `"koordination"`, und aktiv (Gate für `/freigaben`). Trifft heute denselben Ausdruck wie `darfEinstellenFuerAndere` und ist trotzdem **kein Alias** darauf — es sind zwei Fragen |
| `istVertretungsfreigabe(person, aufgabe)` | `rolle === "koordination"`, **nicht** der eingetragene Prüfer, und `pruefer_id` gesetzt — die Bedingung für die Verlaufszeile „in Vertretung für …" |

**Nachtrag vom 2026-08-15 — `darfFreigeben` trägt zwei Ausschlüsse, und beide sind sicherheits-
tragend.** Die Tabelle nannte bis hierher nur den Rumpf („Prüfer oder Koordination") und
dokumentierte damit **zwei Riegel weg**, die zwei Reviews eigens gefunden und geschlossen haben:

1. **`ist_selbst` → `false`, auch für die Koordination.** Selbstaufgaben haben gar keine
   Freigabestufe (§5.2: `in_arbeit` → `abgeschlossen`). Ohne die Klausel stimmten `pruefer_id === null`
   und `rolle === "koordination"` je für sich, und die Koordination bekäme einen Freigabeknopf für
   eine Aufgabe, die keine Freigabe kennt.
2. **`person.id === aufgabe.zugewiesen_an` → `false` (Betreiberentscheidung 2026-08-13).** Die
   Koordination verteilt, sie arbeitet nicht mit. Ohne diese Klausel gibt es einen **begehbaren
   Selbstfreigabe-Pfad**: fremd eingestellte Aufgabe an sich selbst verteilen (`ist_selbst` bleibt
   dabei `false`, weil `ersteller_id !== zugewiesen_an`) und am Ende die eigene Arbeit freigeben —
   das Vier-Augen-Prinzip fiele für genau diesen Fall aus. Daran hängt auch, dass Verteillisten sich
   aus den BuFDis speisen und nicht aus allen aktiven Personen.

Wer `darfFreigeben` gegen die alte Tabellenzeile „vereinfacht", öffnet den Pfad wieder — deshalb
steht die Klausel jetzt hier und nicht nur im Code-Kommentar.

**Nachtrag vom 2026-08-15 — es gibt bewusst kein `requireAufgabenAccess()`.** Die Tabelle führte
einen solchen Backstop, den `layout.tsx` rufen solle. Er wurde im Pre-Flight vor Aufgabe 4 geprüft
und **absichtlich nicht gebaut**, aus drei Gründen: der Gruppenriegel gehört der Middleware
(`core/routing.ts`, `src/proxy.ts`), ein Layout-Backstop deckte ausgerechnet den **Route-Handler**-Fall
nicht ab (Layouts laufen dort nicht), und der modul-interne Riegel ist `personFuerSession()` bzw.
`personFuerSeite()` an jeder einzelnen Stelle. Ohne diesen Absatz wird das Fehlen beim nächsten Lesen
erneut als Mangel gemeldet — und der Backstop gebaut, den Aufgabe 4 begründet nicht gebaut hat.

**Nachtrag vom 2026-08-15 — `darfNachweisSehen` deckt auch den eingetragenen Prüfer ab.** Die Tabelle
oben nannte ihn nicht, obwohl der Code es seit Aufgabe 16 längst tut. Der Grund: `freigabeDaten`
filtert über `darfFreigeben` (das den Prüfer einschließt), ein Prüfer sah den Nachweis auf
`/freigaben` also **schon vorher** — und hätte ihn auf `/a/<id>` verweigert bekommen, **während die
Freigabe-Knöpfe für dieselbe Person sichtbar blieben**. Die Klausel trägt dabei **bewusst kein
`istAktiv`** (Betreiberentscheidung 2026-08-14): Handlungsprädikate prüfen es, Sichtprädikate nicht,
und eine benannte Prüferin gehört zur Geschichte dieser Aufgabe. Ohne diesen Satz wird die Kante beim
nächsten Lesen erneut als Mangel gemeldet.

Zwei Regeln, die dabei nicht verhandelbar sind:

- **Die Zugehörigkeit kommt aus der Aufgabe in der Datenbank, nie aus einem URL-Parameter.** Sonst
  ist `/m/aufgaben/a/17` ein IDOR. Vorbild: `assertGroupAccess` im Modul `feedback`.
- **Eine ausgeschiedene Person behält lesenden Zugang zur eigenen Geschichte.** `personFuerSession()`
  findet ihre Zeile weiterhin; `istAktiv()` ist falsch, und daraus folgt: keine neuen Aufgaben, kein
  Einplanen, kein Freigeben, nicht in Verteillisten, nicht in der Plan-Navigation — aber die eigenen
  abgeschlossenen Aufgaben, Nachweise und Verlaufszeilen bleiben abrufbar. Ein ehemaliger BuFDi soll
  seine Dokumentation noch einsehen können; ihn auszuschließen wäre die unfreundliche Auslegung
  desselben Feldes.
- **Kein Eintrag in `person` ergibt `notFound()`, nicht 403.** Mehrere Riegel der Suite werfen
  absichtlich 404, damit die Existenz einer Seite nicht verraten wird. Umgekehrt darf kein
  Navigationseintrag und kein Knopf auf eine Seite zeigen, die für die klickende Person 404 ist —
  weil Oberfläche und Riegel dieselben Funktionen aufrufen, ist das strukturell ausgeschlossen.

  **Nachtrag vom 2026-08-14 — eine Ausnahme, und nur diese eine.** Wer die **Zugangsgruppe des
  Moduls hat**, aber keine `person`-Zeile, bekommt statt 404 eine **Erklärseite**: „Du bist noch
  nicht im Modul eingetragen — wende dich an die Koordination." Der Fall wurde bei der Umsetzung
  sichtbar: ein neuer BuFDi steht in Pocket ID bereits in `iuk-aufgaben-nutzer`, ist aber im Modul
  noch nicht angelegt, und ein 404 gibt ihm nichts, womit er weiterkäme. Die Begründung für 404 —
  die Existenz einer Seite nicht verraten — trägt hier nicht: die Person **hat** den Modulzugang,
  es gibt vor ihr nichts zu verbergen.

  **Alles andere bleibt 404**, und das ist die Grenze der Ausnahme: eine unbekannte Aufgaben- oder
  Personen-Id in der URL (`/a/<id>`, `/plan/<personId>`) ergibt weiterhin `notFound()`, denn dort
  geht es um Objekte, die es geben könnte oder nicht. Und wer die Zugangsgruppe **nicht** hat,
  scheitert unverändert am Middleware-Riegel mit 403.

## 8. Bildschirme

Routen unter `/m/aufgaben`:

| Route | Zweck | Für wen |
|---|---|---|
| `/` | rollenabhängiger Einstieg | alle |
| `/a/<id>` | Aufgabendetail mit Verlauf, Nachweis, Aktionszone | alle mit Sichtrecht |
| `/neu` | Aufgabe einstellen | `auftrag`, `koordination`; BuFDis für sich selbst |
| `/plan/<personId>` | Zeitplan einer Person (eigener änderbar, fremde lesend) | alle |
| `/routinen` | eigene Routinen verwalten | `bufdi` |
| `/freigaben` | Freigabe-Warteschlange | `auftrag`, `koordination` |
| `/verteilen` | Posteingang und Verteilung | `koordination` |
| `/personen` | Personenverwaltung | `koordination` |
| `/archiv` | abgeschlossene Aufgaben, filterbar | alle, gefiltert auf Sichtrecht |

**Der Einstieg ist rollenabhängig**, nicht ein Dashboard für alle mit ausgegrauten Teilen. Jede
Fassung antwortet auf „was muss ich jetzt tun?", nicht auf „was gibt es alles?".

### 8.1 BuFDi — „Meine Woche"

Kopf mit Wochenwähler (aktuelle Woche, vor und zurück). Darunter eine KPI-Zeile aus vier Kacheln —
4px Kante links, sonst neutral, nach dem Vokabular aus `lagerbuch/_ui/verwaltung.module.css`:
*Einzuplanen · Heute offen · Freigabe offen · Zurückgewiesen*. Jede Kachel verlinkt die gefilterte
Liste; eine Kachel mit `0` bleibt stehen und wird nicht klickbar.

Dann ein **Posteingang-Streifen**: was verteilt und noch in keinem Tag liegt, je Zeile mit dem
Zeitvorschlag und den Aktionen „Annehmen" / „Anders einplanen".

Dann die fünf **Tagesspalten** Mo–Fr. Je Spalte: der Wochentag mit Datum, das Tagesbudget
(„2,75 / 7,8 Std.", tabellarische Ziffern), und die Einträge in Reihenfolge. Feste Uhrzeiten stehen
in einer eigenen Spur links am Eintrag und verankern ihn; freie Einträge ordnen sich davor und
dahinter ein. Routineblöcke sind sichtbar als solche markiert und tragen keine Aktionen.

Fuß: „Routinen verwalten" und die Zeitpläne der beiden anderen BuFDis.

### 8.2 Koordination (Rike) — „Verteilung"

KPI-Zeile: *Zu verteilen · Freigabe offen · Überfällig · Zurückgewiesen*.

**„Überfällig" heißt** `faellig_am < heute AND status <> "abgeschlossen"` — die Frist zählt, nicht
der Zeitplan. Eine Aufgabe, die für morgen eingeplant ist, aber heute fällig war, ist überfällig;
eine, die niemand eingeplant hat und deren Frist in der Zukunft liegt, ist es nicht. Dieselbe
Definition gilt für die Überfälligkeitsliste und für die KPI-Kachel — sie steht als eine Funktion in
`_lib/`, nicht zweimal als SQL-Fragment.

Darunter der **Posteingang als Tabelle**: Titel, Auftraggeber, Priorität, Frist, Dauerschätzung,
Nachweispflicht — und je Zeile die Aktion „Verteilen". Der Verteilen-Dialog verlangt genau eine
Person, erlaubt optional Tag und Uhrzeit als Vorschlag, und zeigt daneben die **Wochenauslastung
aller drei BuFDis**, damit der Vorschlag nicht ins Leere geht.

Darunter die **Freigabe-Warteschlange**, sichtbar getrennt in „meine" und „in Vertretung".

Fuß: Personenverwaltung, Archiv, Überfälligkeitsliste.

### 8.3 Auftraggeber (Malte, Tomke) — „Meine Aufträge"

Oben der Knopf, der der Grund für das ganze Modul ist: **„Aufgabe einstellen"**. Das Formular
verlangt Titel, Erklärung, Priorität, Frist und Dauerschätzung; Nachweispflicht ist ein Schalter
mit Formwahl.

Darunter die eigenen Aufträge mit Zustand und Empfänger, und die eigene Freigabe-Warteschlange.

**Diese Ansicht enthält keine Verteil-Aktion.** Das ist die Antwort auf „Tomke und Malte pfuschen
immer wieder rein": der Weg zum Verteilen existiert in ihrer Oberfläche nicht, und `/verteilen`
antwortet ihnen mit 404. Beides prüft dasselbe Prädikat aus derselben Quelle.

### 8.4 Aufgabendetail `/a/<id>`

Titel, Chip-Zeile (Zustand, Priorität, Nachweispflicht), die Erklärung des Auftraggebers
ungekürzt, ein Metablock (Auftraggeber, Zugewiesen, Frist, Dauerschätzung, Prüfer), der
Nachweisbereich, und der Verlauf als Journal.

Die Aktionszone unten trägt **nur, was diese Person mit dieser Aufgabe in diesem Zustand tun darf**
— beim BuFDi „Bearbeitung starten" bzw. „Fertig melden", beim Prüfer „Freigeben" oder „Zurückweisen".
Zurückweisen ist bestätigungspflichtig und verlangt Text: eine Zurückweisung ohne Begründung ist für
den BuFDi wertlos.

### 8.5 Einplanen per Formular — die Grundlage unter dem Ziehen

Eine Aufgabe in einen Tag legen ist ein kleines Formular: Tag, optional Uhrzeit, Dauerschätzung.
Die Reihenfolge innerhalb des Tages regeln Auf-/Ab-Knöpfe auf `plan_rang`. Das ist mit der Tastatur
bedienbar, funktioniert auf dem Handy, und ist die Grundlage, auf der Abschnitt G (Ziehen) aufsetzt.

## 9. Darstellung

### 9.1 Priorität — eine Hue, drei Gewichte

Priorität ist eine **Rangskala**, also muss die Helligkeit monoton laufen (Suite-Regel:
„Luminanz monoton führen"). Und sie darf nicht mit der Zustandsampel verwechselbar sein, weil beide
Chips in derselben Zeile stehen. Deshalb eine einzige Akzent-Hue und drei Gewichtsstufen:

| Stufe | Form |
|---|---|
| Hoch | gefüllter Chip, Rostbraun auf heller Rostfläche |
| Mittel | Kontur-Chip, Stahl |
| Niedrig | nur Text, gedämpft |

**„Hoch" ist ausdrücklich nicht Suite-Rot.** `colorError === colorPrimary === #c8000f` — ein rotes
Prioritäts-Chip liest sich als Primärknopf. Und jede Stufe trägt **immer das Wort**; Farbe ist die
verzichtbare letzte Schicht.

### 9.2 Zustands-Chips — Fläche und Text als Paar

Nachgebaut nach dem Vokabular aus `lagerbuch/_ui/verwaltung.module.css`, mit eigenen Variablen
(`--auf-*`), nie mit antds `Tag`-Vorgabe:

| Zustand | Rolle |
|---|---|
| `eingegangen` | grau |
| `verteilt` | grau, mit Vorschlagszusatz im Text |
| `in_arbeit` | stahlblau |
| `freigabe_offen` | ocker |
| `abgeschlossen` | grün |
| `zurückgewiesen` | Ampel-Rot-**Text**farbe, nicht Markenrot |

**Die vollständige Palette wird in Abschnitt B festgelegt**, weil dort die Farben zum ersten Mal
erscheinen — nicht später, sonst tragen die ersten Bildschirme provisorische Werte, die niemand mehr
anfasst.
Sie wird mit **gemessenem** AA-Kontrast geliefert, nicht mit geschätztem, und jeder Wert braucht ein
geprüftes Gegenstück für den Dunkelmodus. Letzteres ist der größte versteckte Posten bei jeder
Übernahme aus `lagerbuch`, dessen Palette durchgehend hell ist.

### 9.3 Auslastung — neutral, nie Statusfarbe

Auslastungsbalken und Tagesbudgets sind neutral/graphit. Menge ist keine Statusfarbe (Suite-Regel:
drei getrennte Farbrollen). Ein **überbuchter Tag** bekommt eine Kante plus Text
(„8,5 von 7,8 Std. — überbucht"), keinen roten Balken.

### 9.4 Übernommene Muster — kein dritter Satz von irgendetwas

Drei Dinge sind in der Suite bereits entschieden und werden **übernommen, nicht neu erfunden**. Der
Maßstab dahinter ist die `core`-Regel: eine dritte Fassung derselben Sache ist genau der Fehler, gegen
den sie geschrieben ist.

**Schrift: `core/theme/schrift.ts`, direkt.** Diese Datei existiert schon und ist bereits das
Ergebnis einer eingetretenen Verdopplung — `feedback/_ui/typo.ts` (`T`) und
`lagerbuch/_lib/schrift.ts` (`SCHRIFT`) sind beide nur noch Adapter darüber. `aufgaben` legt **keinen
dritten Adapter** an, sondern liest die Rollen direkt; ein Adapter wäre erst gerechtfertigt, wenn das
Modul eine eigene Benennung bräuchte, und es braucht keine. Alle Werte liegen auf antds Leiter
(12/14/16/20/24/30) — **keine neue Größe**, der Charakter kommt aus Familie, Versalien, Gewicht und
Ziffernstellung. Farbe gehört nicht zur Rolle: sie wird am Verwendungsort über `--auf-*` dazugesetzt.

**Seitenkopf: das Muster aus `feedback` (§4.2 in `docs/design/feedback-admin.md`).** Flach, keine
Karte, `margin-bottom: 24`, drei Zeilen — Breadcrumb (12) · `<h1>` 24/600 mit den Textknöpfen der
Seite rechts in derselben Zeile (`justify-content: space-between; align-items: flex-end; flex-wrap:
wrap`) · eine Kontextzeile in 12/gedämpft. Auf 390px bleibt `<h1>` bei 24 mit `text-wrap: balance`,
die Knöpfe rutschen darunter, die Kontextzeile bleibt. Überschriften sind **natives
`<h1>`/`<h2>`/`<h3>`** mit den Rollen aus `schrift.ts` — **`Typography` kommt im ganzen Modul nicht
vor**, auch nicht in Client-Komponenten. Das ist eine Regel, die man nicht pro Datei prüfen muss, und
sie schließt Falle 1 (`Typography.Title` in RSC) strukturell aus statt sie zu umgehen.

Die Kontextzeile je Einstieg: BuFDi „Diese Woche: 5 Aufgaben, 12,5 von 39 Std. verplant" ·
Koordination „3 zu verteilen · 2 warten auf Freigabe" · Auftraggeber „4 Aufträge offen, 1 wartet auf
deine Freigabe". Leer jeweils mit einem eigenen Satz, nie eine leere Zeile.

**Abstände, Radien, Bewegung, Fokus: die Disziplin aus `feedback` §4.8.** Abstände ausschließlich aus
`SPACE` in `core/theme/tokens.ts` (4/8/12/16/24/32). Radien: drei Werte, keine weiteren. Bewegung
sparsam und `prefers-reduced-motion: reduce` behandelt — insbesondere **keine Aufbau-Choreografie der
Tagesspalten und kein Zähl-Effekt auf den KPI-Kacheln**. Fokus: antds Ring für antd-Komponenten, für
eigenes Interaktives (Tageskarten, Zeilenlinks) `:focus-visible { outline: 2px solid …;
outline-offset: 2px }`, nie `outline: none` ohne Ersatz.

### 9.5 Eigene Variablen und Dunkelmodus

Eigenes Markup nutzt `--auf-*`, **nie `--ant-*`**: antd deklariert seine Variablen auf seiner
Scope-Klasse, nicht auf `:root`, und eigenes Markup außerhalb eines antd-Komponentenbaums sieht sie
nicht — still, die Linie verschwindet einfach.

Dunkelmodus wird über `:root[data-theme="dark"] .modul` selektiert, **nicht** über
`prefers-color-scheme`: der Umschalter der Suite hat drei Zustände, und eine Medienabfrage bricht
den Fall „System dunkel, Umschalter hell".

Schriftfamilien nur über die drei Suite-Rollen (`--font-display`, `--font-body`, `--font-mono`), nie
eine Familie direkt genannt — `core/theme/schriftstapel.test.ts` prüft Deklaration und Registrierung,
aber **eine unaufgelöste CSS-Variable meldet sich nie**. Stundenzahlen und Budgets bekommen
`font-variant-numeric: tabular-nums`.

Bedienelemente setzen **kein `size`** — `controlHeight: 56` ist bereits das richtige Touchmaß,
`size="large"` wäre 72px. Ausnahme: `size="small"` innerhalb von Tabellenzeilen.

Spaltenköpfe einer antd-`Table` bekommen ihre Typo-Rolle über `columns[].title`, nie über eine
CSS-Regel gegen `.ant-table-thead th` — das kostete sonst eine Spezifitätserhöhung *und* eine
Kopplung an einen antd-internen Klassennamen, die ein Major still bricht.

Wo eigenes CSS trotzdem auf einer antd-Komponente sitzt: eine Klasse mehr voranstellen, **nie
`!important`**, nie mehr als nötig — und die Erhöhung kommentieren, sonst entfernt sie die nächste
Aufräumrunde als vermeintlichen Ballast.

### 9.6 Mobil — 768px, ein Breakpoint

Die Tagesspalten werden bei 390px **einspaltig**, mit einer echten Radiogruppe Mo–Fr als
Tageswähler darüber (ein Tabstop, Pfeiltasten wählen nativ — keine Knopfreihe).

**Beide Ausprägungen rendern ins HTML, CSS blendet eine aus.** Kein `Grid.useBreakpoint` — es ist
in Server Components ohnehin verboten und zeigt beim ersten Render die falsche Variante.
Breakpoint 768px, in `max-width`-Abfragen als **767.98px** geschrieben, sonst gelten bei exakt
768px beide Seiten und die Reihenfolge im Stylesheet entscheidet.

Handlungsknöpfe unter 768px: volle Breite, untereinander. Eingabefelder nie unter 16px (Zoom ist
suiteweit gesperrt).

Genau deshalb war „Tagesspalten" die richtige Grundform: das Wochengitter Tag × Uhrzeit hätte hier
einen zweiten, eigenen Bildschirm gebraucht.

### 9.7 RSC-Grenze

Alle Seiten sind **Server Components**, die die Daten serverseitig lesen und die Berechtigung aus
der Datenbank auflösen. Client-Inseln sind:

- die Tagesspalten (Verschieben, Reihenfolge)
- alle Formulare — `Form.Item` und `Input.TextArea` sind Compound-Zugriffe und in RSC verboten
- der Nachweis-Upload
- der Tageswähler
- die Filter der Listen

**Icons stehen ausschließlich in Client-Inseln oder als eigenes Inline-SVG.** `@ant-design/icons`
in einer Server Component ergibt HTTP 500 **beim Import, nicht beim Rendern**, und `"use client"`
auf dem Icon-Modul behebt das nicht, sondern macht es still (HTTP 200 mit leerer Map und dem
falschen Icon). `src/core/shell/icons.test.ts` riegelt das repo-weit ab.

Ebenso: **Werte, die eine Server Component liest, liegen in einem Modul ohne `"use client"`** —
hier `_lib/`. Eine Konstante aus einem Client-Modul kommt als Client-Referenz an, nicht als Wert;
TypeScript ist zufrieden, `build` findet nichts, und Vitest kann es strukturell nicht sehen.

### 9.8 Leerzustände

Ausgeschrieben, für jede Liste einen: „Posteingang leer — alles verteilt" · „Noch keine Routinen
angelegt" mit Anlege-Knopf · „Keine Freigabe offen" · „Keine überfälligen Aufgaben" · und für einen
leeren Tag in der Spalte, weil eine leere Spalte sonst wie ein Ladefehler aussieht.

### 9.9 Fehler aus Server-Actions

Kommen über `useActionState` **am Feld** an, nicht auf einer technischen Fehlerseite mit
Datenverlust. Destruktive Aktionen (Zurückziehen, Zurückweisen, Person deaktivieren) sind
bestätigungspflichtig.

## 10. Tests — wer welche Aussage besitzt

Drei Aussagen kann **nur ein echter Browser** treffen, und alle drei sind in dieser Suite schon
teuer gewesen: dass eine Seite überhaupt HTTP 200 liefert (die antd-Compound-, Icon- und
Client-Wert-Fallen bestehen `typecheck`, `pnpm build` **und** Vitest), dass die Tagesspalten mobil
umschalten, und dass sie es auf dem Desktop *nicht* tun.

**Vitest besitzt:**

- die Übergangstabelle aus §5.2, **erschöpfend** — jeder nicht aufgeführte Übergang wird abgelehnt
- die Berechtigungsmatrix Rolle × Aufgabe × Aktion aus §7
- die Budgetrechnung (Aufgaben plus Routinen, Überbuchung)
- die Routine-Einrechnung in den Tag (Wochentagsmaske, feste Uhrzeit, inaktive Routine)
- die Ableitung „Zeitvorschlag offen" aus §5.1
- die Nachweispflicht: `fertig melden` ohne Nachweis wird abgelehnt
- einen Quelltext-Scan, dass die Umschalt-Selektoren `767.98px` tragen

**Playwright besitzt:**

- einen Abruf **jeder** neuen Route auf HTTP 200
- die Umschaltung bei 390×844, 1280×720 **und 820px**. Die Mitte ist kein Luxus: die Suite hatte
  dort zweimal Defekte, die an beiden Enden unsichtbar waren
- den vollen Durchlauf über drei Rollen: Malte stellt ein → Rike verteilt mit Zeitvorschlag →
  Alina nimmt an, arbeitet, meldet mit Bildnachweis fertig → Malte gibt frei
- die Gegenprobe: Malte ruft `/m/aufgaben/verteilen` direkt auf und bekommt **404**
- den Selbstaufgaben-Weg: keine Freigabe, direkt abgeschlossen

**Jeder e2e-Test stellt seinen Zustand selbst her**, idempotent oder über eigens angelegte Daten.
Die Playwright-Datenbank ist über alle Dateien geteilt (`workers: 1`, Pfadreihenfolge) — ein Test,
der Zustand vom Seed erbt, ist entweder allein grün oder in der Suite grün, nie beides.

**`pnpm seed:lokal aufgaben` ist Pflicht**, nicht Komfort: `scripts/seed-lokal.test.ts` verlangt für
jedes Modul aus `MODULE_MIGRATIONS` einen Seed (`_lib/seedLokal.ts`). Additiv und idempotent, und
**nicht** am Boot-Pfad verdrahtet.

Vollständiger Lauf vor jedem Abschluss: `pnpm typecheck` · `pnpm lint` · `pnpm vitest run` ·
`pnpm build` · `pnpm exec playwright test`.

## 11. Das Dreieck und die vierte Zeile

Das Modul hat von Anfang an eine Datenbank (Abschnitt A). Es braucht deshalb **drei**
zusammenpassende Einträge, und zwar sofort:

1. `src/app/m/aufgaben/_db/migrations/`
2. die Zeile in `MODULE_MIGRATIONS` in `core/bootstrap.ts`
3. die `COPY`-Zeile im `Dockerfile`

Fehlt die dritte, läuft es lokal und bricht im Container.

Dazu, in derselben ersten Runde:

- `ScheduleOutlined` in die `ICONS`-Map in `core/shell/icons.ts` (§3).
- Drei dokumentierte Zeilen in `.env.example`: `SUITE_HOST_AUFGABEN`,
  `SUITE_ACCESS_GROUP_AUFGABEN`, `SUITE_ADMIN_GROUP_AUFGABEN`. Jedes bestehende Modul ist so
  überschreibbar und dort dokumentiert; ein Variablenname, den nur die Registry kennt, ist für den
  Betreiber nicht auffindbar. **Und die Semantik ist nicht symmetrisch**: eine leer gesetzte
  `SUITE_HOST_*` heißt „keine Prod-Hosts" (damit lässt sich ein Cutover ohne Rebuild zurücknehmen),
  eine leer gesetzte `SUITE_ACCESS_GROUP_*` ist dagegen wirkungslos oder bricht den Boot ab — bei
  `requiresAuth: true` wäre die leere Liste eine stille Öffnung für alle Eingeloggten. Der Kommentar
  in `.env.example` muss diesen Unterschied nennen.
- **Keine Zeile in `.env.local` nötig:** `moduleForHost` löst `aufgaben.localtest.me` über die
  eingebaute Wildcard-Konvention auf, auch ohne `SUITE_HOST_AUFGABEN`. Die Zeile in `.env.example`
  ist Dokumentation für den Produktionsbetrieb, kein Entwicklungsschritt.

## 12. Gliederung der Umsetzung

**Ein Plan über das ganze Modul** (Betreiberentscheid 2026-08-13). Die Abschnitte unten sind seine
Gliederung, keine getrennten Vorhaben mit eigenen Abnahmen.

| # | Inhalt | Ergebnis |
|---|---|---|
| A | **Fundament.** Registry, ICONS-Zeile, `.env.example`, Datenbank samt Dreieck (§11), Schema, `person`, Zugang aus der Sitzung (§7), `seedLokal` | Das Modul antwortet und kennt seine Personen |
| B | **Bausteine.** Farbvokabular in hell und dunkel, Zeichenquelle, Chip, Kachel, Seitenkopf, Aufgabenliste, Wochenplan mit Mobilumschaltung | Die Oberfläche trägt die Suite-Regeln |
| C | **Lebenszyklus.** Alle Server-Actions der Übergangstabelle (§5.2), Verlauf, Freigabe samt Vertretung, Textnachweis, `useActionState` am Feld | Anforderungen 1, 2 und 4 (schriftlich) erfüllt |
| D | **Zeitplan.** Tagesspalten, Einplanen und Verschieben per Formular und Auf/Ab, Routinen, Tagesbudget, fremde Pläne lesend | Anforderung 3 erfüllt |
| E | **Seiten.** Die neun Routen aus §8, drei rollenabhängige Einstiege, Archiv, Überfälligkeitsliste | Jede Action hat einen Weg in der Oberfläche |
| F | **Bildnachweis.** `core/av/scanner.ts` (Protokoll, siehe §2), `files` an einer Aufrufstelle umstellen, modul-eigene Warteschlange, Upload mit MIME- und Größenprüfung | Anforderung 4 vollständig erfüllt |
| G | **Drag & Drop.** Ziehen zwischen Tagen und innerhalb eines Tages, ab 768px, auf denselben Actions wie D. Die Knopfstrecke bleibt | Gewünschter Komfort |

**Ein Vorbehalt, benannt statt verschwiegen:** die späteren Abschnitte eines langen Plans veralten,
während die früheren gebaut werden — F fasst zudem ein laufendes Modul an. Der Betreiber hat den
Umfang am 2026-08-13 nach diesem Hinweis bestätigt. Praktische Folge für die Umsetzung: **F und G
werden erst geschrieben, wenn A–E stehen**, und wer sie dann anfasst, prüft ihre Annahmen gegen den
dann geltenden Code, statt sie für gesetzt zu nehmen.

## 13. Streichposten und offene Punkte

**Es gibt keinen Demo-Rollenwechsler, und das ist kein Verzicht, sondern der bessere Weg.** Lokal
wechselt man die Rolle, indem man sich mit einer anderen Adresse am Dev-Login anmeldet: dessen
`sub` ist `dev:<email>` (`core/auth/config.ts`), und `seedLokal` legt für jede Demo-Person eine
`person`-Zeile mit genau diesem `sub` an. Damit läuft die Rollenauflösung im Entwicklungsbetrieb
durch **dieselbe** Strecke wie in Produktion — ein Umschalter wäre eine zweite, und genau die hätte
den Echtbetrieb erreichen können.

**Musste vor dem Echtbetrieb verschwinden, und ist es:** `bufdi-koordination-klickdummy.html` in der
Repository-Wurzel — Referenz für den Funktionsumfang, nicht für die Gestaltung. Bei Aufgabe 21 (dem
Abschluss der Umsetzung) war die Datei bereits weder im Worktree noch im Haupt-Repository vorhanden
(s. §1).

**Bewusst nicht in dieser Fassung:**

- **Video als Nachweisform.** Vertagt, weil die Kosten im Speicher und im Backup liegen, nicht in
  der Oberfläche — eine Betriebsentscheidung. Die Upload-Strecke aus Abschnitt F kann es später
  ohne Umbau annehmen; es braucht dann nur ein höheres Limit und eine geklärte Speicherplanung.
- **Benachrichtigungen per E-Mail oder Push.** Abschnitt E bringt die Überfälligkeitsliste in der Anwendung. Eine
  Mailstrecke ist ein eigenes Vorhaben mit eigener Infrastrukturfrage.
- **Abwesenheiten und Urlaub.** Ein abwesender BuFDi hat heute einfach einen leeren Zeitplan. Ein
  eigenes Abwesenheitsmodell würde die Budgetrechnung, die Verteilansicht und die
  Überfälligkeitsliste gleichzeitig anfassen.
- **Wiederkehrende Aufgaben** (im Unterschied zu Routinen, die nur Zeit belegen).
- **Zeiterfassung** — Ist gegen Soll. Das Modul plant, es stempelt nicht.
- **Mehrwochenplanung.** Der Wochenwähler geht vor und zurück; eine Monats- oder Quartalsansicht
  gibt es nicht.
