---
name: zunder
description: Arbeit mit den Aufgaben dieses Projekts in Zunder (Projekt „IDA" im Bereich „DRK Bereitschaft") — Aufgabe lesen und reservieren, Status setzen, Entscheidungen und Ergebnisse festhalten, offene Funde als neue Aufgabe anlegen. Verwende diesen Skill, sobald eine Aufgabe einen Zunder-Link, eine Zunder-UUID (oder ihre ersten 8 Hex-Zeichen) oder eine alte DRK-Nummer nennt, sobald ein Auftrag mit „DEV …" beginnt, und immer wenn während der Entwicklung ein Aufgabenstand nachzuziehen ist.
---

# Zunder-Aufgaben in diesem Projekt

Das Board ist das **Projekt „IDA" (`faf4cc4e-98a6-53ae-8322-64426b8cdac1`)** im Bereich
**„DRK Bereitschaft" (`f22114c8-7f6d-5b51-8696-0cca72f2e9b9`)**, ein Dev-Projekt mit Repo
`rubenvitt/iuk-suite`. Weboberfläche: `https://zunder.rubeen.dev`. Bis zum 12.10.2026 lag das Board
in ClickUp (Liste „I&K Suite"); die Aufgaben wurden mit ihrer internen ClickUp-ID importiert.

## Zuerst: die Werkzeuge sind nicht geladen

Die `mcp__claude_ai_Zunder__*`-Werkzeuge sind **deferred** — sie stehen mit Namen im Prompt, aber
ohne Schema. Ein direkter Aufruf endet in `InputValidationError`. Erst holen:

```
ToolSearch  query: "select:mcp__claude_ai_Zunder__get_task,mcp__claude_ai_Zunder__claim_task,mcp__claude_ai_Zunder__update_task,mcp__claude_ai_Zunder__release_task,mcp__claude_ai_Zunder__create_task,mcp__claude_ai_Zunder__filter_tasks,mcp__claude_ai_Zunder__search"
```

## Status (zentral, nur hier pflegen)

| Code | Anzeige | Bedeutung in diesem Projekt |
| --- | --- | --- |
| `open` | Offen | frisch, unangefasst (Standard) |
| `in_progress` | In Arbeit | wird gerade gebaut |
| `review` | Review | offen im PR, wartet auf Merge |
| `blocked` | Blockiert | wartet auf etwas oder jemanden |
| `done` | Erledigt | auf `main` und ausgeliefert |
| `dropped` | Verworfen | bewusst nicht gemacht |

Werkzeuge erwarten und liefern immer den **Code**, nie die Anzeige. Typen: `aufgabe` (Standard),
`bug`, `feature`.

## Aufgaben finden und adressieren

* **Neue Aufgaben** haben eine UUID. Link: `https://zunder.rubeen.dev/#/aufgabe/<uuid>`. Alle
  Werkzeuge nehmen sie als `task_id`.
* **Importierte Aufgaben** nehmen zusätzlich ihre **interne ClickUp-ID** (`86cb0q9v9`, das Stück
  hinter `app.clickup.com/t/`) als `clickup_id`. Link: `https://zunder.rubeen.dev/#/clickup/<id>`.
* ⚠️ **Die alten Nummern `DRK-<n>` kennt Zunder nicht** — weder `get_task` noch `search` finden
  sie. Eine `DRK-<n>` löst du über die interne ID aus einem alten ClickUp-Link auf oder per
  `search` nach Wörtern aus dem Titel. Alte `DRK-<n>`-Verweise in Commits, Plänen und Kommentaren
  bleiben historisch gültig und werden nicht umgeschrieben.

## Aufgabe lesen

```
get_task  task_id: "<uuid>"
```

`get_task` liefert immer alle Felder: Beschreibung (User Story, Akzeptanzkriterien, Abschnitt
**„Offene Fragen"**), `plan`, `branch`, `pr_url`, Unteraufgaben und Fortschritt. Lies die
Beschreibung, bevor du baust — wer nur den Titel kennt, baut gegen den Titel.

## Die drei Momente, an denen Zunder angefasst wird

**Nicht am Ende alles auf einmal.** Ein Board, das erst beim Schließen erfährt, was passiert ist, ist
für jeden außer dem Schreibenden wertlos — und genau das ist die Regel, die dieser Skill trägt.

**1. Beim Start** — `claim_task` (Agentenname, z. B. `claude-code@<rechner>`; schlägt fehl, wenn ein
anderer Agent die Aufgabe hält), dann `update_task` mit `status: "in_progress"` und `branch`. Wer
auf die Aufgabe schaut, während gebaut wird, soll sehen, dass sie läuft und wo. Ein Plan aus dem
Dev-Modus gehört in `plan`.

**2. Bei jeder Entscheidung, die die Aufgabe offen gelassen hat.** Der Abschnitt „Offene Fragen"
existiert, weil die Gesprächsnotiz sie nicht beantwortet hat. Eine still getroffene Annahme ist der
teuerste Ausgang: sie fällt erst bei der Abnahme auf. Zunder hat **keine Kommentare** — die
Entscheidung kommt **mit ihrer Begründung** in die Beschreibung, solange Widerspruch noch billig ist:
erst `get_task` lesen, dann `update_task` mit `description` = bisherige Beschreibung + Abschnitt
`## Notizen`, ein Eintrag je Anlass mit Datum (`**12.10.2026** — …`). Nie die Beschreibung ohne
vorheriges Lesen schreiben, sonst ist sie weg. Nicht in den PR — dorthin schaut niemand vom Board aus.

**3. Beim Abschluss** — `review` plus `pr_url`, sobald der PR offen ist. `done` **erst nach dem
Merge**, nie beim Push: der Stand auf `main` ist der Beweis, ein grüner Branch ist eine Behauptung.
Danach `release_task`.

Wer was wann geändert hat, zeichnet Zunder selbst auf (`get_task_history`) — dafür braucht es keinen
Eintrag.

## Was in einen Notizen-Eintrag gehört

Der Leser ist **das Team**, nicht der Anwender und nicht der nächste Agent.

* **Deutsch, Du-Form, Präsens** — wie der Rest des Projekts.
* **Ergebnis und Entscheidung, keine Nacherzählung des Diffs.** Die Technik trägt `pr_url`.
* **Was gemessen wurde, mit der Zahl** — „bei 1280×720 ragt der Knopf 1000 px unter die Kante" ist
  ein Befund, „responsiv verbessert" ist keiner.
* **Keine Dateinamen, keine Funktionsnamen.** Wer sie braucht, klickt den PR.
* **Ein Eintrag je Anlass**, nicht ein Protokoll je Arbeitsschritt.

## Funde, die nicht zum Auftrag gehören → neue Aufgabe, kein TODO

Das Projekt hält das seit Langem so (`docs/superpowers/plans/…`: „kein Bauwert in diesem Fenster,
Eigentümer ClickUp-Board" — heute das Zunder-Projekt IDA). Ein benannter offener Posten wird eine
**Aufgabe im Projekt IDA**, nicht ein Kommentar im Quelltext und nicht eine stille Ausweitung des
laufenden PRs:

```
create_task  title: "…"  type: "bug" | "feature" | "aufgabe"  description: "…"
             location: {"kind": "project", "id": "faf4cc4e-98a6-53ae-8322-64426b8cdac1"}
```

Verweise in der neuen Aufgabe auf die Aufgabe, aus der der Fund stammt (Zunder-Link), und erwähne den
Fund in den Notizen der laufenden Aufgabe — sonst findet ihn niemand wieder. Teilschritte einer
Aufgabe legt `decompose_task` als Unteraufgaben an.

## Drei Orte, drei Leser — nicht dasselbe dreimal

Am Ende einer Aufgabe stellt sich dieselbe Frage dreimal, und die Antworten sind unabhängig:

| Ort | Leser | Frage |
| --- | --- | --- |
| **Zunder-Notizen** | das Team | Was ist der Stand, und was wurde entschieden? |
| **Release Notes** (`portal/_lib/neuigkeiten`) | die Anwender | Was ist für mich jetzt anders? Meist: **keine Notiz** — die Regeln stehen in `CLAUDE.md` |
| **Falle in `CLAUDE.md`** | der nächste Agent | Was hat einen halben Tag gekostet, das kein Tor findet? |

Ein Fund gehört fast immer in **genau einen** davon.

## Commit, PR und Branch

Der Aufgabenverweis steht im **Commit-Body** und im **PR-Body**, nicht in der Kopfzeile:

```
Zunder: https://zunder.rubeen.dev/#/aufgabe/<uuid>
```

Die Kopfzeile trägt den Conventional-Commit-Typ — und der ist hier keine Stilfrage, sondern die
Versionsnummer: `feat` springt Minor, alles andere Patch (`docs/runbooks/versionierung.md`).

Branchnamen tragen die **ersten 8 Hex-Zeichen der UUID** statt einer Nummer, z. B.
`claude/afab2599-zielwahl`. Ältere Branches heißen `claude/drk-<n>-…` — die bleiben, wie sie sind.

## Agenten

Recherche und Parallelarbeit dürfen an Agenten gehen. **Die Schreibzugriffe auf Zunder bleiben beim
Hauptlauf.** Zwei Agenten, die beide „Status nachziehen" im Auftrag haben, überschreiben sich
gegenseitig die Beschreibung und erzeugen widersprüchliche Statuswechsel — und keiner von beiden
weiß das vom anderen.

## Kleingedrucktes

* **Nie löschen.** `delete_task` ist über MCP und Oberfläche nicht rückgängig zu machen. Was nicht
  gemacht wird, bekommt `status: "dropped"`.
* `filter_tasks` blendet erledigte und verworfene Aufgaben 3 Tage nach der Statusänderung aus —
  `include_closed: true` zeigt sie. `search` findet sie immer. Mehr als `limit` Treffer holt man mit
  `offset` (das Ergebnis nennt `next_offset`).
* Tags, Prioritäten und Zuständige gibt es nicht.
* Zunder enthält neben dem Projekt IDA auch andere Bereiche und Projekte. Ohne ausdrücklichen Auftrag
  wird dort nichts geschrieben.
