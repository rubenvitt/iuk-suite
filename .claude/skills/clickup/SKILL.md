---
name: clickup
description: Arbeit mit den ClickUp-Tickets dieses Projekts (Board „I&K Suite", IDs DRK-…) — Ticket lesen, Status setzen, Entscheidungen und Ergebnisse kommentieren, offene Funde als neues Ticket anlegen. Verwende diesen Skill, sobald eine Aufgabe eine DRK-Nummer nennt, sobald ein Auftrag mit „DEV …" beginnt, und immer wenn während der Entwicklung ein Ticketstand nachzuziehen ist.
---

# ClickUp-Tickets in diesem Projekt

Das Board ist **Liste „I&K Suite" (`901524923921`)** im Space **„DRK Bereitschaft" (`901510125552`)**.
Tickets heißen `DRK-<n>`; diese Custom-ID nimmt **jedes** ClickUp-Werkzeug direkt entgegen, eine
Übersetzung in die interne ID (`123zgec2eub`) ist nie nötig.

## Zuerst: die Werkzeuge sind nicht geladen

Die `mcp__ClickUp__*`-Werkzeuge sind **deferred** — sie stehen mit Namen im Prompt, aber ohne Schema.
Ein direkter Aufruf endet in `InputValidationError`, nicht in einer Fehlermeldung, die das erklärt.
Erst holen:

```
ToolSearch  query: "select:mcp__ClickUp__clickup_get_task,mcp__ClickUp__clickup_update_task,mcp__ClickUp__clickup_create_comment"
```

## Ticket lesen — `include: ["description"]` ist Pflicht

`clickup_get_task` liefert ohne `include` eine **Kurzfassung**: Titel, Status, Liste — und die
Beschreibung nur als Zähler. Genau darin stehen aber User Story, Akzeptanzkriterien und der
Abschnitt **„Offene Fragen"**. Wer ohne `include` liest, baut gegen den Titel.

```
clickup_get_task  task_id: "DRK-295"  include: ["description"]  expand_statuses: true
```

`expand_statuses: true` liefert die gültigen Statusnamen der Liste. Setz sie **wörtlich** — die
Schreibweise ist gemischt und lässt sich nicht raten:

| | |
| --- | --- |
| `Open` | frisch, unangefasst |
| `in progress` | wird gerade gebaut (klein geschrieben) |
| `review` | offen im PR, wartet auf Merge (klein geschrieben) |
| `Closed` | auf `main` und ausgeliefert |

## Die drei Momente, an denen ClickUp angefasst wird

**Nicht am Ende alles auf einmal.** Ein Board, das erst beim Schließen erfährt, was passiert ist, ist
für jeden außer dem Schreibenden wertlos — und genau das ist die Regel, die dieser Skill trägt.

**1. Beim Start** — `in progress`, plus ein Kommentar mit dem Branchnamen. Zwei Sätze reichen. Wer
auf das Ticket schaut, während gebaut wird, soll sehen, dass es läuft und wo.

**2. Bei jeder Entscheidung, die das Ticket offen gelassen hat.** Der Abschnitt „Offene Fragen"
existiert, weil die Gesprächsnotiz sie nicht beantwortet hat. Eine still getroffene Annahme ist der
teuerste Ausgang: sie fällt erst bei der Abnahme auf. Schreib die Entscheidung **mit ihrer
Begründung** als Kommentar, solange Widerspruch noch billig ist — nicht in den PR, dorthin schaut
niemand vom Board aus.

**3. Beim Abschluss** — `review`, sobald der PR offen ist, mit dem PR-Link. `Closed` **erst nach dem
Merge**, nie beim Push: der Stand auf `main` ist der Beweis, ein grüner Branch ist eine Behauptung.

## Was in einen Kommentar gehört

Der Leser ist **das Team** (Ruben, Florian), nicht der Anwender und nicht der nächste Agent.

* **Deutsch, Du-Form, Präsens** — wie der Rest des Projekts.
* **Ergebnis und Entscheidung, keine Nacherzählung des Diffs.** Die Technik trägt der PR-Link.
* **Was gemessen wurde, mit der Zahl** — „bei 1280×720 ragt der Knopf 1000 px unter die Kante" ist
  ein Befund, „responsiv verbessert" ist keiner.
* **Keine Dateinamen, keine Funktionsnamen.** Wer sie braucht, klickt den PR.
* **Ein Kommentar je Anlass**, nicht ein Protokoll je Arbeitsschritt.

## Funde, die nicht zum Auftrag gehören → neues Ticket, kein TODO

Das Projekt hält das seit Langem so (`docs/superpowers/plans/…`: „kein Bauwert in diesem Fenster,
Eigentümer ClickUp-Board"). Ein benannter offener Posten wird ein **Ticket in derselben Liste**, nicht
ein Kommentar im Quelltext und nicht eine stille Ausweitung des laufenden PRs:

```
clickup_create_task  list_id: "901524923921"  name: "…"  markdown_description: "…"
```

Verweise im neuen Ticket auf das Ticket, aus dem der Fund stammt, und erwähne den Fund im Kommentar
des laufenden Tickets — sonst findet ihn niemand wieder.

## Drei Orte, drei Leser — nicht dasselbe dreimal

Am Ende einer Aufgabe stellt sich dieselbe Frage dreimal, und die Antworten sind unabhängig:

| Ort | Leser | Frage |
| --- | --- | --- |
| **ClickUp-Kommentar** | das Team | Was ist der Stand, und was wurde entschieden? |
| **Release Notes** (`portal/_lib/neuigkeiten`) | die Anwender | Was ist für mich jetzt anders? Meist: **keine Notiz** — die Regeln stehen in `CLAUDE.md` |
| **Falle in `CLAUDE.md`** | der nächste Agent | Was hat einen halben Tag gekostet, das kein Tor findet? |

Ein Fund gehört fast immer in **genau einen** davon.

## Commit und PR

Die Ticketnummer steht im **Commit-Body**, nicht in der Kopfzeile („Die Gesprächsnotiz aus DRK-296
lautet …"). Die Kopfzeile trägt den Conventional-Commit-Typ — und der ist hier keine Stilfrage,
sondern die Versionsnummer: `feat` springt Minor, alles andere Patch (`docs/runbooks/versionierung.md`).

## Agenten

Recherche und Parallelarbeit dürfen an Agenten gehen. **Die Schreibzugriffe auf ClickUp bleiben beim
Hauptlauf.** Zwei Agenten, die beide „Status nachziehen" im Auftrag haben, erzeugen doppelte
Kommentare und widersprüchliche Statuswechsel — und keiner von beiden weiß das vom anderen.

## Kleingedrucktes

* `clickup_create_task_comment` ist **abgekündigt**. Der Nachfolger ist `clickup_create_comment` und
  nimmt `entity_id` statt `task_id`.
* `clickup_search` sucht Text über den ganzen Workspace; nach Feldwerten (Status, Tag, Liste) filtert
  `clickup_filter_tasks`. Beide sind **paginiert** — solange `next_cursor` bzw. `has_more` gesetzt
  ist, ist die Antwort unvollständig.
* Der Workspace enthält neben dem DRK-Board auch private Listen (Space „Rubeen"). Ohne ausdrücklichen
  Auftrag wird dort nichts geschrieben.
