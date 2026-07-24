# Design: Redesign Modul `feedback` — Prozess, Vollständigkeit, Oberfläche

**Status:** ergänzt und überschreibt in Teilen `2026-07-24-feedback-modul-design.md` (die Port-Spec).
Alles dort Entschiedene gilt weiter, außer wo dieses Dokument ausdrücklich abweicht.

## Auftrag

Der Auftraggeber hat den fertigen Port lokal benutzt und drei Dinge beanstandet:

1. Die Oberfläche ist „hässlich".
2. Es fehlt Funktionalität aus dem Original, „dementsprechend nicht wirklich benutzbar".
3. Der Prozess soll entschlackt werden — wörtlich: *„Umfrage erstellen und dann aktivieren? unnötig. es
   wird immer eine Umfrage erstellt, die dann irgendwann aktiv ist (von mir aus direkt) und wenn die
   umfrage durch ist wird meist erst die nächste erstellt (alles im Kontext EINER Gruppe)"*

Dazu: *„Wo ist der QR-Code Generator (sehe da ein shared QR Modul)"* und der Wunsch nach schönen
öffentlichen Ansichten — *„nicht einsatzrelevant und braucht keine riesigen touch targets. klar,
mobile first"*.

## Befund

Die Ursache ist nicht Gestaltung, sondern Unfertigkeit: **portiert wurden die Server-Actions, nicht
die Screens.** Sechs von acht Actions und drei Seiten haben keinen Einstiegspunkt in der Oberfläche —
Secret neu erzeugen, Gruppe bearbeiten, Abend bearbeiten, Gruppe löschen, Abend löschen, Trend,
Vergleich. Sie existieren nur per URL-Eingabe oder gar nicht.

Die drei blockierenden Befunde:

- **Der Teilen-Pfad fehlt vollständig** — der Daseinsgrund des Werkzeugs. Die `qr.png`-Route
  funktioniert, wird aber von keiner Seite verlinkt; das Gruppendetail zeigt stattdessen den Rohtoken
  `demo–demo1` ohne Host und Protokoll. Zwischen „Umfrage läuft" und „Gruppe kann scannen" liegt keine
  Brücke.
- **Die Skala ist als Datensatz nicht interpretierbar.** Der Fragentyp heißt in den Daten korrekt
  `schulnote` (1 = sehr gut … 6 = ungenügend), gerendert wird er als sechs graue Sterne — und sechs
  Sterne lesen sich universell als Bestnote. Wer nicht liest, bewertet das Gegenteil, und hinterher
  ist nicht unterscheidbar, welche Antworten invertiert gemeint waren.
- **Keine Pflichtfeldprüfung.** Eine vollständig leere Absendung wird als vollwertige Rückmeldung
  gespeichert und verfälscht Rücklaufquote und Durchschnitte.

Hinzu kommt: während des Dienstabends — der einzigen Zeit, in der die Umfrage läuft — sieht der
Gruppenleiter null Rückmeldungen, weil die Auswertung erst nach manuellem Schließen erreichbar ist.
Und ohne Oberfläche für die Zuordnung Gruppenleiter→Gruppe sieht in Produktion überhaupt nur ein
Voll-Admin etwas.

## Entscheidungen

Vom Auftraggeber entschieden:

| # | Frage | Wahl |
|---|---|---|
| A | Bewertungsskala | **Schulnote 1–6, farbige Antippfelder** (1 grün … 6 rot). Vergleichbarkeit mit Altdaten schlägt Handy-Intuition. |
| B | Zuordnung Gruppenleiter→Gruppe | **Beide Wege**: Attribut aus Pocket ID *und* Zuordnung im Werkzeug über ein Verzeichnis, das sich beim Login füllt. |

Selbst entschieden (mit Begründung, weil sie den Entwurf tragen):

| # | Frage | Wahl | Warum |
|---|---|---|---|
| C | Wann schließt eine Umfrage automatisch? | Ende des lokalen Kalendertags von `evenings.date` **+ `closeAfterHours`** (Standard 48 h) | Einziger Anker, der Vorab-Anlegen *und* „direkt aktiv" überlebt. Beim bisherigen Anker (Aktivierungszeit) würde eine am Dienstag für Samstag angelegte Umfrage schon am Donnerstag schließen — die Entschlackung bricht die Frist sonst still. Für Teilnehmer erklärbar: „zwei Tage nach dem Abend". |
| D | Neue Umfrage starten, während eine läuft? | **Primär gesperrt**, daneben ein zweistufiger Ausweg „Laufende beenden & neue starten" | Entspricht „erst wenn die vorige durch ist", ohne dass ein vergessener Vorabend den heutigen blockiert. |
| E | Pflichtfragen | **Alle 8 Bewertungsfragen Pflicht**, Freitexte freiwillig | Original-Verhalten. Nur vollständige Sätze machen Trend und Gruppenvergleich vergleichbar; bei Teil-Pflicht müssten Diagramme mit je Frage unterschiedlicher Basiszahl umgehen. |
| F | Sammel-Link für mehrere Gruppen | **Endgültig streichen** | Im Original halb gebaut und nie nutzbar (Secret serverseitig ungeprüft, kein Erzeugungs-UI). Es können folglich keine gedruckten Exemplare im Umlauf sein. Jede Gruppe hat ihren eigenen Aushang. |
| G | Ort des Nutzerverzeichnisses | Tabelle in der **feedback-Modul-DB**, gefüllt beim Betreten des Moduls — nicht in `core` und nicht am Login | Ein Login-Upsert in `core/auth` wäre ein suite-weiter Schreibvorgang bei jeder Anmeldung; läge die Tabelle in `core`, entstünde eine neue DB samt Registrierungs-Dreieck. Schreibt `core` dagegen in eine Modul-DB, invertiert das die Abhängigkeit. Der Modul-lokale Weg vermeidet alle drei Probleme und erfasst genau die Personen, die relevant sind: wer das Modul betritt, ist zuordenbar. |

## Prozess: Anlegen **ist** Starten

„Dienstabend anlegen", „Umfrage erstellen" und „Aktivieren" fallen zu **einem** Vorgang zusammen. Die
Dienstabend-Detailseite verschwindet als eigener Screen.

**Klicks im Hauptablauf:**

| Schritt | vorher | nachher |
|---|---|---|
| Bis „sammelt Feedback" | 5 | **2** (Gruppe öffnen → „Feedback starten"); bei genau einer Gruppe **1** |
| QR/Link teilen | **nicht möglich** | **0** — QR und Link stehen auf der Seite, auf der man landet |
| Umfrage beenden | 1 (zwingend, sonst kein Zugang zur Auswertung) | 0 (Frist läuft ab; „jetzt beenden" bleibt optional) |
| Bis zur Auswertung | 7 | **3** — Zwischenstand vorher schon im Cockpit |

### Lebenszyklus: Feld behalten, Semantik verengen — keine Migration

- `surveys.status` und der CHECK `IN ('draft','active','closed','archived')` bleiben **unverändert**.
  Der Verzicht auf `draft` heißt nur: dieser Wert wird nie mehr *geschrieben*. Es entsteht **keine
  Migration**.
- Geschrieben werden künftig nur `active` (beim Anlegen) und `closed` (Frist abgelaufen oder manuell
  beendet). `nextStatusOnAccess`, `computeClosesAt` und `isExpired` bleiben inhaltlich gültig; nur der
  Anker von `closesAt` ändert sich (Entscheidung C).
- `draft` bleibt **lesbar** für Altbestand und Import: solche Umfragen erscheinen im Verlauf als
  „Entwurf (Altbestand)" mit genau einem Button „Jetzt starten" — kein Waisenzustand ohne Ausweg. Das
  ist beabsichtigt und deckt `scripts/import/feedback.ts` ab, das `status ?? "draft"` schreibt.
- `archived` verliert die Oberflächen-Aktion. Geprüft: keine Aggregation filtert nach Status, das
  Archivieren war Zeremonie ohne Wirkung. Der Wert bleibt tolerant lesbar. Entsteht später der Bedarf
  „Abend aus Trend und Vergleich ausschließen", ist `archived` die dafür vorgesehene Umdeutung — dann
  muss die Aggregation filtern, nicht das Feld wandern.
- Ein *neuer* Statuswert (etwa `geplant`) ist ausdrücklich vermieden: SQLite kann einen CHECK nicht
  droppen, Drizzle würde die Tabelle neu bauen und umkopieren.

### Die kritische Invariante

„Höchstens eine aktive Umfrage je Gruppe" wird heute in `activateSurvey` erzwungen, das
Geschwister-Umfragen derselben Gruppe mitschließt. Wenn Anlegen künftig direkt `active` schreibt,
**muss diese Durchsetzung in den neuen Anlege-Pfad wandern** — `createAndStartSurvey`, eine
Transaktion, die zuerst alle aktiven Umfragen der Gruppe schließt und dann die neue einfügt.

Das ist die riskanteste Änderung des Umbaus: bei zwei aktiven Umfragen ruft `activeSurveyForGroup`
`.get()` auf ein nicht eindeutiges Ergebnis auf, und die öffentliche Route liefert eine **beliebige**
der beiden aus — der QR an der Wand zeigt dann auf die falsche Erhebung. Ein DB-seitiger Riegel ist
nicht möglich: ein partieller Unique-Index bräuchte `group_id` auf `surveys`, das dort nicht existiert
(es hängt an `evenings`). Die Durchsetzung bleibt daher in der Transaktion und bekommt eine **eigene
Aufgabe mit eigenem Test**: zwei aufeinanderfolgende Starts für dieselbe Gruppe → genau eine aktiv,
die erste `closed`.

Weitere Datenfolge: wird das Datum eines laufenden Dienstabends nachträglich korrigiert, muss
`closesAt` neu berechnet werden, sonst zeigt die Frist auf den alten Anker.

## Informationsarchitektur — 5 interne Screens statt 9

1. **Einstieg `/m/feedback`** — bei genau einer Gruppe sofortige Weiterleitung ins Cockpit. Bei
   mehreren: Karten je Gruppe mit dem Zustand *auf* der Karte („läuft — 12 von 20", „nichts aktiv,
   letzter Abend 12.03."). Admins sehen zusätzlich „Neue Gruppe" und „Gruppenvergleich".
2. **Gruppen-Cockpit `/m/feedback/groups/{id}`** — die einzige Arbeitsseite, fünf Zonen:
   - **Teilnahme** (immer sichtbar): QR **eingebettet**, darunter die vollständige Klartext-URL mit
     Kopier-Knopf, „PNG herunterladen", „Aushang drucken". Kernaussage im Text: *dieser Code ist
     dauerhaft gültig, einmal drucken reicht für alle künftigen Dienstabende.*
   - **Läuft gerade**: Datum + Thema, Rücklaufzähler („12 von 20"), „schließt automatisch am TT.MM.
     um hh:mm", Live-Zwischenauswertung ab der ersten Antwort, Knopf „Feedback jetzt beenden"
     (neutral, nicht als Gefahr markiert — es ist ein geplanter Schritt).
   - **Neuer Dienstabend**: *ein* Formular — Datum (auf heute vorbelegt), Thema, Teilnehmerzahl
     (optional, nachtragbar). Primärknopf **„Feedback starten"**. Ein Klick erzeugt Abend + Umfrage +
     `active` + `closesAt` in einer Transaktion und lädt dieselbe Seite neu, jetzt mit QR und Zähler
     oben. Läuft schon eine Umfrage, ist der Block eingeklappt und der Knopf trägt die Zweistufigkeit
     aus Entscheidung D.
   - **Verlauf**: Tabelle vergangener Abende — Datum, Thema, Rücklauf, Ø Gesamt mit Ampelfarbe, Link
     „Auswertung"; Kopf mit Mini-Trendlinie und Links „Trend" + „CSV (alle Abende)"; Zeilenaktionen
     bearbeiten/löschen.
   - **Einstellungen** (aufklappbar, keine eigene Route): Gruppenname, Standard-Schließfrist,
     Zuordnung der Gruppenleiter, „Neues Secret erzeugen" mit der Warnung *„Bestehende QR-Codes und
     Aushänge werden ungültig"*, „Gruppe löschen" (Admin).
3. **Auswertung** `…/evenings/{eid}/auswertung` — Rücklauf, Ø Gesamt als Ampel, Balken je
   Bewertungsfrage, Freitexte, KI-Prompt als aufklappbarer Abschnitt (die separate `prompt`-Route
   entfällt als Screen), CSV des Abends.
4. **Trend** `…/groups/{id}/trend` — Zeitraumfilter, Linien je Frage + Ø Gesamt, Tabelle, CSV.
5. **Vergleich** `/m/feedback/vergleich` — Admin, aus dem Einstieg verlinkt.

**Navigation:** Breadcrumb auf jeder Unterseite (im Modul bisher nirgends vorhanden), Modultitel im
Header klickbar. Jede Seite braucht einen Weg zurück, der nicht der Browser-Knopf ist.

**Rückkanal:** Server-Actions melden Fachfehler über `useActionState` **am Feld**, nicht über eine
technische Fehlerseite. Ein `error.tsx` fängt den Rest. Die `revalidatePath`-Ziele werden korrigiert —
sie zeigen heute auf `/m/feedback/admin`, eine Route, die es wegen der Klammer-Route-Group nie gab.

## Die Skala: Schulnote 1–6

- **Sechs einzeln antippbare Felder** je Frage, Ziffer immer sichtbar.
- **Invertierte Polarität** ist der Kern: 1 = sehr gut, 6 = ungenügend. Jede Metapher, die „mehr =
  besser" suggeriert, ist ausgeschlossen — Sterne, Herzen, füllende Balken, aufsteigende Schieber.
- **Farbsemantik** grün (1) → gelb/orange → rot (6). Die Farbe gehört der Bewertung; die Seite selbst
  tritt deshalb nicht flächig grün oder rot auf. Konfliktbehandlung: DRK-Rot ist die Hausfarbe und
  ausgerechnet die Farbe der Note 6 — die Auflösung dieses Konflikts ist Teil der visuellen
  Spezifikation der öffentlichen Ansicht.
- **Barrierefreiheit:** die Note ist nie allein über Farbe erkennbar (Ziffer + Textbedeutung immer
  vorhanden). Rot-Grün-Blindheit trifft genau diese Achse.
- **Pflicht** (Entscheidung E), client- *und* serverseitig geprüft. Die Führung zu Lücken darf sich
  nicht wie eine Prüfung anfühlen.
- Der Wertebereich wird serverseitig weiter auf `1..ratingScale` begrenzt (bestehendes Verhalten aus
  `coerceAnswer`, bleibt).
- Dieselbe Farbskala trägt die Ampel für den Gesamtdurchschnitt in Auswertung und Verlauf — eine
  Definition, zwei Verwendungen.

## Zugriff und Zuordnung

Zwei Quellen, als **Vereinigungsmenge**:

1. **Attribut aus Pocket ID** — ein konfigurierbarer Claim (analog zum bestehenden
   `POCKET_ID_GROUPS_CLAIM`) enthält die Fachgruppen-Slugs, für die die Person Gruppenleitung ist.
   Verbindungsschlüssel ist `groups.slug` — kein neues Konzept nötig.
2. **Zuordnung im Werkzeug** — `user_groups`, gepflegt in den Einstellungen der Gruppe über eine
   Namensliste aus dem Nutzerverzeichnis.

`memberGroupIdsFor` ist damit **keine Abfrage mehr, sondern eine Sicherheitsgrenze** — es speist
`assertGroupAccess`, die einzige echte Verbesserung des Ports gegenüber dem Original (dort war die
Guard definiert, aber an keine Route montiert; jeder Gruppenleiter konnte fremde Gruppen per URL
öffnen). Verbindliche Anforderungen:

- Der Claim wird mit derselben Strenge gelesen wie `parseGroups`: **nur Arrays**, keine
  String-Koerzion, kein Zerlegen von Trennzeichen.
- Fehlender oder leerer Claim ergibt die **leere Menge** und degradiert auf `user_groups` allein —
  **niemals** auf „alle Gruppen".
- Slug-Vergleich **exakt und Groß-/Kleinschreibung beachtend** gegen `groups.slug`.
- Negativtests je Zweig: Claim nennt einen nicht existierenden Slug; Claim fehlt ganz; Claim ist
  vorhanden, aber leer; `user_groups` leer und Claim leer → keine Gruppe sichtbar.
- **Betriebliche Voraussetzung:** Der Claim ist so vertrauenswürdig wie der bestehende
  `groups`-Claim — beide stammen aus dem signierten ID-Token. Das Attribut darf in Pocket ID **nicht
  durch die Nutzer selbst editierbar** sein, sonst vergibt sich jeder seine Gruppenleitung.

### Nutzerverzeichnis

Neue Tabelle in der feedback-Modul-DB: Kennung (`sub`, Primärschlüssel), Name, E-Mail, zuletzt
gesehen. Gefüllt per idempotentem Upsert beim Betreten des Moduls, nachdem die Authentifizierung
gegriffen hat (Entscheidung G). Wer noch keiner Gruppe zugeordnet ist, sieht keine Gruppe — ist danach
aber zuordenbar, weil sein Besuch ihn ins Verzeichnis eingetragen hat. Das ist der Weg, auf dem eine
neue Gruppenleitung ohne Datenbankzugriff in Betrieb geht.

## QR-Code und Aushang

Der Token hängt an der **Gruppe** (`/f/{slug}-{secret}`), und die öffentliche Route löst immer die
*gerade aktive* Umfrage dieser Gruppe auf. Der QR ist damit ein **permanentes Druckstück je Gruppe** —
einmal drucken, gültig über alle künftigen Dienstabende. Das ist auch die Antwort auf „wo ist der
QR-Code Generator": ein QR *pro Umfrage* wäre ohne Schemaänderung nicht darstellbar und wäre der
schlechtere Entwurf.

Das gemeinsame `qr`-Modul ist eine eigene Oberfläche auf eigener Subdomain und als Ganzes nicht
nutzbar — `buildQrUrl()` liefert einen relativen Pfad, der gegen den feedback-Host aufgelöst würde.
Wiederverwendbar ist genau **eine** Funktion: `payloadToSvg` (serverseitig lauffähig, ohne DB- und
Auth-Bindung). Sie wandert nach `src/core/qr/` — dem Muster von `src/core/charts/` folgend, statt
`feedback` quer in ein anderes Modul importieren zu lassen. Cockpit-Vorschau und `qr.png`-Download
laufen danach über **dieselben** Optionen; die heute drei divergierenden QR-Konfigurationen im Repo
fallen auf eine zusammen.

**Neu:** Druckansicht `…/groups/{id}/aushang` — A4, `@media print`, großer QR, Gruppenname, Frage
„Wie war der Dienstabend?". Gab es weder in der Go-App noch in der Suite.

## Öffentliche Ansichten

Mobile-first, normale Touch-Dimensionen (ausdrücklich **kein** Kiosk-Härtegrad — das Formular ist
nicht einsatzrelevant). Zu gestalten sind vier Zustände derselben Route, nicht nur das Formular:
Formular, „zurzeit läuft keine Umfrage", „diese Umfrage ist beendet", Danke-Seite.

Verbindlich unabhängig von der Gestaltung:

- **Kontext oben:** um welchen Dienstabend geht es (Datum, Thema), für welche Gruppe. Heute steht dort
  nur der Gruppenname.
- **Anonymitätszusage unmittelbar vor dem Absenden.** Bei rund 15 Personen, die über ihren eigenen
  Gruppenleiter urteilen, entscheidet dieser Satz über Ehrlichkeit oder Gefälligkeit.
- **Freitexte:** 500 Zeichen Obergrenze, sichtbar aber nicht drohend.
- **Danke-Seite:** Weg „noch jemand am selben Gerät? erneut ausfüllen". Handys werden herumgegeben;
  die heutige 24-Stunden-Cookie-Sperre schließt die zweite Person aus.
- Die 14 Fragen sind inhaltlich gesetzt. Gruppieren, staffeln, Überschriften formulieren: erlaubt.
  Streichen: nicht.

Die vollständige visuelle Spezifikation (Screenflow, Typo-Skala, Farben inklusive Dunkelmodus,
Abstände, Bewegung, Skalen-Interaktion, Freitext-Behandlung, Ladeverhalten) entstammt einem eigenen
Entwurfsverfahren mit drei unabhängigen Konkurrenzentwürfen und dreifacher Bewertung (Handwerk,
Abschlussrate, Machbarkeit) und wird als Abschnitt „Visuelle Spezifikation" ergänzt.

## Vorarbeit: Diagramm-Bausteine

`core/charts/BarChart.tsx` und `LineChart.tsx` kodieren `#c8000f` fest statt des Theme-Tokens und
behandeln den Dunkelmodus für Achsen und Gitter nicht. `feedback` wird nach dem Umbau das
diagrammlastigste Modul (Zwischenauswertung, Trend, Vergleich) und erbt sonst unsichtbare Achsen auf
dunklem Grund. Diese Bereinigung läuft **vor** den diagrammnutzenden Aufgaben. Zusätzlich: Leerzustand
„noch keine Rückmeldungen" statt eines leeren Achsenkreuzes.

## Was ebenfalls geschlossen wird

Aus der Lückenliste, ohne eigene Erklärung offensichtlich: Dienstabend-Liste mit Statusanzeige,
Rücklauf- und Teilnehmerzahl · Anzeige des Auto-Schließ-Zeitpunkts · Secret neu erzeugen · Gruppe und
Dienstabend bearbeiten und löschen · Trend mit Zeitraumfilter und Serien je Frage · Vergleich mit
Einstiegspunkt · **aggregierter CSV-Export je Gruppe** (eine Zeile je Dienstabend, Ø je Frage — ein
anderes Artefakt als der bestehende Rohdaten-Export je Abend, der bleibt) · gestaltete öffentliche
Endzustände · Fehlerrückmeldung in Admin-Formularen. Alle CSV-Ausgaben behalten die
Formel-Neutralisierung.

## Ausdrücklich nicht gebaut

- **Radar-Diagramm je Abend** — Zierde; die Ein-Blick-Aussage liefert die Ampel billiger.
- **Sammel-Link `/f/alle-…`** — Entscheidung F. Im Port ohnehin nicht vorhanden.
- **Eigene Zusatzfragen je Gruppe** — gab es im Original nicht; der offensichtliche nächste Wunsch,
  aber nicht dieser Auftrag.
- **`archived` als Bedienschritt** — siehe Lebenszyklus.
- **`single_choice`/`multi_choice`, `config`-Tabelle** — bereits in der Port-Spec gestrichen.
- **Umrechnung von Altdaten** — die Skala bleibt 1–6, es gibt keinen Bruch zu heilen.

## Bestand, der nicht angetastet wird

`_db/queries.ts` (außer den benannten Erweiterungen), `aggregation`, `csv`, `prompt`, `token`,
`access`, `ratelimit` — geprüft, getestet, und nicht Gegenstand der Beanstandung. Der Umbau
konzentriert sich auf `(admin)/**`, die Lebenszyklus-Semantik, die öffentlichen Ansichten, die
Zuordnung und die QR-Sichtbarkeit. „Oberflächen-Umbau" darf nicht zur Neuschreibung der Datenschicht
werden.

## Tests und Altbestand im Gleichschritt

`_lib/lifecycle.test.ts`, `e2e/feedback.spec.ts` und `scripts/import/parity.ts` kodieren den alten
Ablauf draft→active. Sie werden in **derselben** Aufgabe umgeschrieben, die das jeweilige Verhalten
ändert — nicht in einem Aufräumdurchgang am Ende. `lifecycle.test.ts` ist der Frühindikator dafür, ob
die neue Semantik in sich stimmt.

## Geteiltes Design-Wissen

Auftrag des Auftraggebers: *„wenn dabei designkonzepte rauskommen, die auch für andere module relevant
sind, finde einen ort dafür, damit du auch später darauf zugreifen kannst"*.

- **`docs/design/`** — die verbindlichen Vorgaben, geschrieben aus dem, was der gewählte Entwurf
  tatsächlich festlegt: Design-Tokens, Typo-Skala, Muster für Admin- und für öffentliche Ansichten
  (Seitenkopf, Karten, Leerzustände, Statusanzeige), die Schulnoten-Skala, Diagramm-Theming, und die
  RSC/antd-Fallen.
- **`src/core/`** — nur was ein zweites Modul belegbar braucht: `payloadToSvg`, die bereinigten
  Diagramm-Wrapper, und die Bausteine, die im Umbau nachweislich zweimal auftreten. Kein Framework für
  einen Nutzer.
- Verweis aus `iuk-suite/CLAUDE.md`, damit auch ein frischer Subagent den Ort findet.

## Umsetzungsfallen (verbindlich)

- In Server-Komponenten sind `Card`, `Statistic`, `Result`, `Progress`, `Table`, `Tag` sicher;
  `Descriptions.Item`, `Typography.Title`, `Form.Item`, `List.Item` sind es **nicht** — der
  Compound-Zugriff auf ein `"use client"`-Modul ergibt HTTP 500, den `pnpm build` nicht erkennt.
  Interaktive Cockpit-Zonen (Kopier-Knopf, Formular mit `useActionState`) sind Client-Kinder, die
  Seite selbst bleibt RSC.
- `antd` `Space` nimmt `orientation`, nicht `direction`. `List` ist abgekündigt — `Table` verwenden.
- `evenings.date` liegt als Mitternacht UTC vor. Die Fristberechnung aus Entscheidung C muss über den
  **lokalen** Tagesabschluss laufen, sonst liegt die Frist zwei Stunden daneben.

## Gates

`pnpm typecheck` fehlerfrei · `pnpm lint` ohne Fehler · Unit-Tests grün (Bestand 485 + neue) ·
`pnpm build` grün · E2E grün, erweitert um: Start in einem Klick, QR und Link sichtbar, Pflichtfeld
greift, Schulnote wird richtig gespeichert, Gruppenleiter sieht fremde Gruppe nicht.
