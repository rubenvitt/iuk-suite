# Live-Quiz am Dienstabend — Design

- **Datum:** 2026-11-25
- **Status:** Entwurf
- **Modul:** `src/app/m/feedback` (sichtbarer Titel künftig „Dienstabend“)
- **Aufgabe:** Zunder IDA-410 — https://zunder.rubeen.dev/#/aufgabe/icgjszrho1y2fz59uwk95jqe
- **Anlass:** Vorbereitung des DA 26.11. (Notfallverfahren UAV). Dort läuft das Quiz noch auf Folien.

## 1. Worum es geht

Am Dienstabend sollen alle Teilnehmenden Quizfragen live auf dem eigenen Handy beantworten. Der Beamer zeigt die
Frage, einen QR-Code zum Mitmachen und, sobald die Frage geschlossen ist, die Ergebnisse. Das Quiz läuft
eingebettet in den Slidev-Foliensatz des Ausbilders und folgt dessen Klicker. Es ist für jeden Dienstabend
gedacht, nicht nur für UAV.

Warum nicht Quizfolien: Folien zeigen nicht, was die Gruppe weiß, und aktivieren nur die, die sich trauen.
Warum kein fremdes Werkzeug: Entscheidung des Gruppenführers (25.11.2026) — keine externen Dienste, das Quiz
gehört zum Dienstabend und damit in die Suite.

## 2. Entschieden (vom Gruppenführer)

1. **Eigenbau, keine externen Werkzeuge.** Die vorgeschlagene Probefahrt mit einem fertigen Werkzeug entfällt.
2. **Gehört zum Dienstabend**, also ins Modul `feedback`, an den Abend (`evenings`) gehängt — kein neues Modul,
   keine neue Datenbank.
3. **Zwei Modi, je Quiz wählbar:**
   - **Lagebild (anonym):** kein Name. Der Beamer zeigt je Frage die Verteilung und den Anteil richtiger Antworten.
   - **Wettbewerb:** Spitzname, Punkte, Rangliste zwischen den Fragen und am Ende.
4. **Server-Push**, kein Polling.
5. **Einbettung in Slidev.** Das Quiz ist **eine Folie**, und der Slidev-Klicker steuert es. Dafür gibt es eine
   kleine Vue-Komponente `<LiveQuiz>` zum Kopieren in den Foliensatz. Ohne sie läuft die Beamer-Ansicht auch
   allein im Browser, dann mit eigenen Knöpfen.
6. **Eigene, moderne Anmutung** für Beamer und Handy. Die Admin-Seiten bleiben im Suite-Stil.
7. **Umbenennen:** Nur der sichtbare Titel wird „Dienstabend“. Schlüssel, Pfade, Gruppen, Host-Variable und
   Datenbank bleiben `feedback`. Ein echtes Umbenennen ist eine eigene Aufgabe, denn gedruckte QR-Codes, SSO-Gruppen
   und `SUITE_HOST_FEEDBACK` hängen am Namen.
8. **Bauweg 1:** SSE über einen Route Handler, Verteilung im Prozess (siehe §4).

## 3. Ziele, Nicht-Ziele, Anti-Ziele

**Ziele**
- 40 Handys in einem Saal-WLAN antworten gleichzeitig. Der Beamer zeigt den Stand in unter einer Sekunde.
- Mitmachen dauert ab dem QR-Scan unter 10 Sekunden: kein Login, keine App, im Wettbewerb nur ein Spitzname.
- Ein Quiz wird einmal angelegt und an beliebig vielen Abenden wieder verwendet.
- Nach dem Abend gibt es eine Auswertung je Frage am Abend, neben dem Feedback.

**Nicht-Ziele (V1)**
- Bilder, Audio oder Video in Fragen. Freitext- und Schätzfragen.
- Teams, Fragen aus einem Pool zufällig gezogen, Joker.
- Mehrere Suite-Instanzen (horizontale Skalierung).
- Eine veröffentlichte Slidev-Erweiterung (npm). Die Komponente ist eine Datei zum Kopieren.

**Anti-Ziele** (wäre ein Fehlschlag, auch wenn es technisch funktioniert)
- Das Handy wird zur Pflicht oder ersetzt das laute Üben der Call-outs. Das Quiz übt das Wiedererkennen und
  ergänzt den Abend, es ersetzt keinen Teil davon.
- Ein Ausfall des Quiz reißt die übrige Suite mit, etwa durch hängende Verbindungen, Speicherwachstum oder
  blockierte Worker.
- Im Lagebild entsteht doch ein Personenbezug, zum Beispiel über eine Kontokennung, Uhrzeiten je Person oder eine
  Verknüpfung mit dem Feedback-Bogen.
- Ein Foliensatz, der im Netz liegt, erlaubt Fremden, ein laufendes Quiz zu steuern.

## 4. Bauwege (Approaches)

| Weg | Kurz | Abwägung |
|---|---|---|
| **1. SSE im Feedback-Modul, Verteiler im Prozess** ✅ | Antworten per POST, Änderungen per `text/event-stream` aus einem Route Handler. Ein Verteiler im Prozess (Singleton auf `globalThis`) benachrichtigt alle offenen Ströme einer Runde. | Keine neue Abhängigkeit, kein zweiter Dienst. Gilt nur, solange die Suite als **ein** Prozess läuft (heute so). Für mehrere Instanzen müsste später ein Verteiler wie Redis davor. |
| 2. Eigener WebSocket-Dienst | Zweiter Prozess neben Next | Zweiter Betriebsweg (Proxy, Auth, Deploy) und größerer Blast Radius. Bei ≤ 40 Teilnehmenden kein spürbarer Gewinn. Verworfen. |
| 3. Eigenes Modul `quiz` | Eigene Datenbank | Sauber getrennt, aber der Gruppenführer ordnet das Quiz dem Dienstabend zu. Das Modul-Dreieck kostet, ohne Nutzen. Verworfen. |

Gewählt: **Weg 1**, vom Gruppenführer bestätigt am 25.11.2026.

## 5. Bausteine

### 5.1 Daten (Feedback-Datenbank, neue Migration)

Vorschlag, die Namen legt der Bauende fest:

- **`quizze`** — die Vorlage. `id`, `group_id` (FK `groups`), `titel`, `modus` (`lagebild` | `wettbewerb`),
  `fragen` (JSON, siehe unten), `moderation_secret` (zufällig, rotierbar), `created_at`, `updated_at`.
- **`quiz_runden`** — ein Durchlauf an einem Abend. `id`, `quiz_id`, `evening_id` (FK `evenings`),
  `beitritt_code` (kurz, eindeutig unter den offenen Runden), `modus` und `fragen` **als Schnappschuss** (wie
  `surveys.questions`: eine spätere Änderung der Vorlage verfälscht keine alte Auswertung), `schritt`
  (Ganzzahl, siehe §5.3), `schritt_seit` (Zeitpunkt), `beendet_at`, `created_at`.
- **`quiz_teilnahmen`** — `id`, `runde_id`, `spitzname` (nur im Wettbewerb, sonst NULL), `token_hash`
  (Hash eines zufälligen Cookie-Werts, verhindert doppelte Antworten).
- **`quiz_antworten`** — `teilnahme_id`, `frage_index`, `antwort` (JSON: Liste gewählter Optionsindizes),
  `richtig` (0/1), `punkte`, `antwortzeit_ms` (nur im Wettbewerb; im Lagebild NULL). PK (`teilnahme_id`,
  `frage_index`): eine Antwort je Person und Frage, **endgültig** (kein Ändern nach dem Absenden).

**Fragenformat (V1):** `{ text, typ: "einfach" | "mehrfach" | "wahrfalsch", optionen: string[2..6],
richtig: number[], zeit_s?: number, erklaerung?: string }`. `erklaerung` erscheint bei der Auflösung.

**Anonymität im Lagebild:** keine Kontokennung, kein Spitzname, keine Antwortzeit. `token_hash` gilt nur
innerhalb einer Runde und wird beim Beenden auf NULL gesetzt. Es gibt keine Verbindung zu `responses`
(Feedback-Bogen). Diese Zusage steht in der Handy-Ansicht und gehört, wie beim Abendzettel, an den Code, der sie
wahr macht.

**Wettbewerb:** Der Spitzname ist frei gewählt, wird gekürzt und auf Eindeutigkeit in der Runde geprüft. Ein
Bezug zum SSO-Konto entsteht nicht. Punkte: richtig = 1000 × (1 − 0,5 × Antwortzeit / Fragezeit), falsch = 0.
Bei Mehrfachauswahl zählt nur „alles richtig“. Das ist meine Wahl als Vorschlag, der Bauende darf sie vereinfachen.

**Löschen:** Wird ein Abend gelöscht, verschwinden seine Runden mit (CASCADE). Wird eine Quizvorlage gelöscht,
bleiben vergangene Runden bestehen (`quiz_id` SET NULL) — die Auswertung des Abends lebt vom Schnappschuss.

### 5.2 Ansichten und Wege

Alle öffentlichen Wege liegen unter dem Feedback-Host. `requiresAuth: false` gilt schon, der Zugang wird
modulintern geprüft.

| Weg | Wer | Was |
|---|---|---|
| Admin: Quiz-Verwaltung je Gruppe (unter `groups/[groupId]`) | Gruppenleitung | Quiz anlegen, bearbeiten, Fragen ordnen, Modus wählen. Kopiert den Slidev-Schnipsel und die Beamer-Adresse, rotiert das Moderations-Secret. antd, Suite-Chrome (`docs/design/feedback-admin.md`). |
| Admin: Auswertung einer Runde (beim Abend) | Gruppenleitung | Je Frage Verteilung und Anteil richtig. Im Wettbewerb die Endrangliste. |
| Öffentlich: Beamer `…/quiz/beamer/<moderation_secret>` | Beamer / Slidev-iframe | Lobby mit QR und Beitrittscode, Frage, Ergebnis, Rangliste, Schluss. Darf steuern. |
| Öffentlich: Handy `…/quiz/<beitritt_code>` (QR) | Teilnehmende | Beitreten (Spitzname im Wettbewerb), Antwortknöpfe, „Antwort ist da“, eigenes Ergebnis nach der Auflösung. |
| Öffentlich: SSE-Strom je Runde | Beamer + Handys | Zustandsereignisse (§5.4). |
| Öffentlich: POST Antwort / Beitritt / Steuerung | Handy bzw. Beamer | Steuerung nur mit gültigem Moderations-Secret. |

Beamer und Handy sind **öffentliche Ansichten** im Sinne von `docs/design/README.md`: eigene CSS-Module, **kein
antd**, eigene Variablen (Falle 2). Die Anmutung ist eigenständig und modern: große Schrift, auf 8 m lesbar,
kräftige Antwortfarben mit Form (▲ ● ■ ◆), damit die Farbe nicht allein trägt. Ruhige Übergänge, Hell und
Dunkel über `data-theme`. Rot bleibt Fehler/Marke (Falle 3) — „falsch“ wird nicht rot auf eine Fläche gelegt.
Der Gestaltungsentwurf ist Sache des Bauenden, mit `frontend-design`. Er braucht vor dem Bau eine Freigabe
durch den Gruppenführer (Mockups).

### 5.3 Ablauf: Schritte statt Befehle

Eine Runde ist eine Folge von **Schritten**. Der Server rechnet aus `schritt` und den Fragen den Zustand aus:

```
0            Lobby (QR, Code, Zahl der Beigetretenen)
je Frage i:  Frage offen  →  Frage geschlossen/Auflösung  →  (Wettbewerb: Zwischenrangliste)
letzter      Schluss (Lagebild: Gesamtbild, Wettbewerb: Siegerpodest)
```

Gesteuert wird mit **„gehe zu Schritt n“** (absolut), nicht mit „weiter“. Damit ist die Steuerung idempotent:
Ein doppelter Klick, ein Neuladen oder Zurückblättern in Slidev bringt immer denselben Zustand. Zurück ist
erlaubt, eine schon geschlossene Frage öffnet sich dadurch aber **nicht** wieder (Antworten bleiben, wie sie
sind).

**Zeitlimit (Festlegung des Designs):** Eine Frage mit `zeit_s` schließt der Server selbst nach Ablauf. Die
Ansicht zeigt dann „Zeit um“ und die Zahl der Antworten, aber **noch nicht die Lösung**. Die Auflösung kommt erst
mit dem nächsten Klick, denn der Ausbilder bestimmt das Tempo und will vielleicht erst nachfragen. „Offen“ und
„Zeit um“ sind *ein* Schritt. Die Ansicht innerhalb dieses Schritts errechnet sich eindeutig aus `schritt`,
`schritt_seit` und `zeit_s`, die Zustandsrechnung bleibt also eine reine Funktion (Schritt, Zeit) → Ansicht.
„Gehe zu Schritt n“ bleibt idempotent.

**Wann eine Runde entsteht (Festlegung des Designs):** Das bloße Laden der Beamer-Adresse legt **keine** Runde an.
Slidev rendert Nachbarfolien vorab, und ein Laden darf nichts schreiben (vgl. `evenings/[eveningId]/page.tsx`,
Entscheidung 3). Die Runde entsteht mit **Schritt 0 (Lobby)**, und den sendet nur, wer die Folie wirklich zeigt:
- In Slidev schickt `<LiveQuiz>` Schritt 0 erst, wenn ihre Folie die aktuelle ist (Slidev-Navigation: aktuelle
  Seite = eigene Seite), nicht beim Vorab-Rendern. Klick 0 = Lobby, Klick 1 = erste Frage. Es gibt keine
  zusätzliche Startfolie.
- Allein im Browser zeigt die Beamer-Ansicht vor Schritt 0 nur den Quiztitel und einen Knopf „Lobby öffnen“.

Die Runde hängt am heutigen Abend der Gruppe. Gibt es heute keinen, legt sie ihn an wie „Umfrage starten“ und
hält sich an die bestehende Tagesregel: ein Abend je Gruppe und Tag, Kalendertag in der Suite-Zone (`core/zeit`).
Eine noch offene Runde desselben Quiz von heute wird wieder aufgenommen, nicht verdoppelt. Das gilt auch nach
Neuladen und Zurückblättern.

**Wann eine Runde endet (Festlegung des Designs):** Der Schluss-Schritt beendet die Runde **nicht** endgültig.
Zurückblättern zeigt wieder die Rangliste bzw. die letzte Auflösung. Endgültig beendet (`beendet_at` gesetzt,
`token_hash` auf NULL, Beitrittscode ungültig) wird eine Runde
- über einen Knopf „Quiz beenden“ in der Admin-Oberfläche oder auf dem Beamer im Schluss-Schritt, oder
- automatisch am Ende des Kalendertags (Suite-Zone) bzw. 6 Stunden nach dem letzten Schritt, je nachdem, was
  früher kommt.

Das automatische Ende braucht keinen Hintergrunddienst. Es wird bei jedem Zugriff auf Quizwege nachgeholt (wie
der Auto-Close in `f/[slugSecret]/page.tsx`) und zusätzlich beim Start des Servers. So hält das Lagebild sein
Anonymitätsversprechen spätestens am Folgetag. Ein Klick in einer beendeten Runde legt eine **neue** Runde an,
und auf dem Beamer steht dann ein Hinweis darauf.

### 5.4 Server-Push

- Route Handler mit `ReadableStream` und `Content-Type: text/event-stream`, `Cache-Control: no-cache`,
  `X-Accel-Buffering: no`. Herzschlag alle 15 s. Aufräumen bei `request.signal` abort. Vor dem Bau das passende
  Kapitel in `node_modules/next/dist/docs/` lesen (Next 16).
- Ereignis = vollständiger Zustand der Ansicht (keine Deltas). Der Client ersetzt einfach. Antwortzähler werden
  serverseitig gebündelt, höchstens etwa 5 Pushes pro Sekunde je Runde.
- Getrennte Sichten: Handys bekommen **nie** die richtige Lösung vor der Auflösung und nie fremde Spitznamen
  außerhalb der Rangliste.
- Verteiler: Singleton auf `globalThis` (übersteht HMR in `next dev`). Je Runde eine Abonnentenliste. Eine
  Obergrenze an Verbindungen je Runde (z. B. 200) schützt den Prozess.
- Wiederverbinden: `EventSource` verbindet selbst neu. Das erste Ereignis nach dem Verbinden ist immer der volle
  Zustand.
- Prüfen, dass der Reverse Proxy vor der Suite SSE nicht puffert. Das gehört ins Runbook, falls Konfiguration nötig ist.

### 5.5 Slidev-Komponente

Eine Datei `LiveQuiz.vue` im Repo (Ort: Bauender, z. B. `docs/slidev/`), mit kurzer Anleitung, zum Kopieren
nach `components/` des Foliensatzes.

```md
---
clicks: 40
---
<LiveQuiz src="https://<feedback-host>/…/quiz/beamer/<secret>" />
```

- Die Komponente bettet die Beamer-Adresse als iframe ein (volle Folie). Sie beobachtet die Klickzahl der Folie
  (`$clicks` bzw. `useSlideContext`) und schickt `postMessage({ typ: "iuk-quiz", schritt: n })` an das iframe.
- Die Beamer-Ansicht nimmt Nachrichten nur im iframe an und setzt sie in „gehe zu Schritt n“ um (§5.3). Das Secret
  steckt in ihrer eigenen URL. Wer die Folie einbettet, hat es also ohnehin.
- Offener Punkt für den Bauenden: Slidev braucht die Klickzahl vorab (`clicks:` im Frontmatter). Die Komponente
  soll nach dem Schluss-Schritt die restlichen Klicks überspringen (`useNav().next…`), damit der Ausbilder nicht
  durch leere Klicks muss. Welche API die aktuelle Slidev-Version dafür hat, prüft der Bauende.
- Der Fokus darf nicht im iframe hängen bleiben, sonst fängt das iframe die Pfeiltasten ab und Slidev blättert
  nicht mehr. Das iframe ist nicht fokussierbar (`tabindex="-1"`, `pointer-events` nur auf den eigenen Knöpfen).

### 5.6 Sicherheit

- **Moderations-Secret** ≥ 128 bit, in der Admin-Oberfläche rotierbar. Die Admin-Seite warnt: „Wer die Adresse
  kennt, kann das Quiz steuern. Foliensätze mit dieser Adresse nicht öffentlich ablegen.“
- **Beitrittscode** ist kurz (für Abtippen) und gilt nur, solange die Runde läuft. Danach antwortet die
  Handy-Adresse mit „Quiz ist beendet“.
- Rate-Limit auf Beitritt und Antwort je Token und Runde. Antworten nach dem Schließen weist der Server ab
  (maßgeblich ist die Serverzeit).
- Spitznamen werden gekürzt und nur als Text gerendert. Ein Filter für anstößige Namen ist nicht V1, aber die
  Gruppenleitung kann einen Spitznamen in der laufenden Runde vom Beamer nehmen (Bauender: wenn billig).
- Admin-Zugriff über `assertGroupAccess` mit der echten `group_id` aus der Datenbank (IDOR, `CLAUDE.md`).
- Einbetten: Die Suite setzt heute keine `frame-ancestors`. Wird das irgendwann suiteweit eingeführt, braucht die
  Beamer-Route eine Ausnahme. Ein Test hält fest, dass sie einbettbar bleibt.

### 5.7 Titel „Dienstabend“

`registry.ts`: `title: "Dienstabend"` für `feedback`. Vorher `docs/design/wortliste.md` prüfen und dort ergänzen.
Danach nach sichtbaren Stellen suchen, die „Feedback“ als Modulnamen meinen, und nicht den Bogen. Der Bogen heißt
weiter Feedback.

## 6. Tests und Nachweise

- Vitest: Zustandsrechnung aus Schritten (Lobby, Frage, Auflösung, Rangliste, Rückwärts, Ablauf der Zeit),
  Punkte, Sichtentrennung (Handy sieht keine Lösung), Anonymität im Lagebild (keine Zeit, kein Name, Token nach
  Ende NULL), Verteiler (An- und Abmelden, Obergrenze), Migration.
- e2e (Playwright): ein Beamer- und drei Handy-Kontexte, Beitritt per Code, Antworten, Ergebnis kommt ohne Neuladen
  an. Zusätzlich: Beamer im iframe einer Testseite, mit `postMessage` gesteuert. Fallen 10, 12 und 22 beachten.
  Gegen `next start` (`pnpm e2e:gebaut`), weil Puffern im gebauten Stand anders sein kann.
- Lasttest einmalig per Skript: 40 simulierte Teilnehmende, Push-Latenz < 1 s. Die Zahl kommt in die Zunder-Notizen.

## 7. Auslieferung

- Neue Migration im bestehenden Feedback-Verzeichnis. Das Dreieck steht schon (Verzeichnis, `MODULE_MIGRATIONS`,
  `COPY` im Dockerfile).
- `pnpm seed:lokal feedback` bekommt ein Beispielquiz (UAV-Notfallverfahren, 5 Fragen).
- Release Notes: **ja**, neues Feature. Eine Notiz für „Feedback“ bzw. „Dienstabend“ zum Live-Quiz und eine für den
  neuen Modultitel, weil man sonst vergeblich nach „Feedback“ sucht.
- Commit-Typ `feat(feedback): …`.

## 8. Dem Bauenden überlassen

Tabellen- und Routennamen. Aufteilung in Teil-PRs (Vorschlag: 1. Daten + Zustandsrechnung + Verteiler, 2. Handy +
Beamer + SSE, 3. Admin + Auswertung, 4. Slidev-Komponente + Titel + Release Notes). Ob Bündelung und Herzschlag
genau wie oben laufen. Die Gestaltung im Rahmen von §5.2 (nach Mockup-Freigabe). Die Länge des Beitrittscodes.
