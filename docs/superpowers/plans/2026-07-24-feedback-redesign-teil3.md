# Redesign Modul `feedback` — Implementierungsplan, Teil 3: Admin („Die Lagekarte")

> **Für agentische Umsetzung:** ERFORDERLICHE UNTER-SKILL: `superpowers:subagent-driven-development`.

**Ziel:** Aus vier Sackgassen-Seiten mit sechs unerreichbaren Server-Actions eine Arbeitsseite machen —
das Gruppen-Cockpit —, auf der ein Ehrenamtlicher in 90 Sekunden Feedback startet, den QR zeigt und
später die Auswertung liest.

**Verbindlicher Entwurf:** `docs/design/feedback-admin.md`. Dort stehen alle exakten Werte, Zonen,
Zustände und Bauteile. **Dieser Plan wiederholt sie nicht** — jede Aufgabe nennt die bindenden
Abschnitte. Ergänzend für die geteilte Notenpalette:
`docs/design/feedback-oeffentliche-ansicht.md` Abschnitt 3.4.

**Voraussetzung:** Teil 1 (Tasks 1–6) und Teil 2 (Tasks 7–15) sind umgesetzt. Insbesondere existieren
`createAndStartSurvey`, `computeClosesAt(eveningDate, hours)`, `_lib/noten.ts` und `data-theme`.

## Globale Randbedingungen

- **Schulnote 1–6, invertiert.** Eine Ampel, die hohe Werte grün färbt, ist ein **Sachfehler**.
- **Farb-Klausel (verbindlich, Abschnitt 4.9):** `theme.ts` setzt `colorError === colorPrimary ===
  #c8000f`. Im Modul `feedback` erscheint `#c8000f` **niemals auf einer Datenfläche** — kein rotes
  `Tag`, kein roter `Progress`, kein roter Balken, kein `Alert type="error"`, kein `type="primary"
  danger`. Warnungen sind `type="warning"` oder Text plus 3px linke Kante.
- **Notenfarben** ausschließlich für Werte auf der Schulnotenskala — nie für Serien, Kategorien,
  Fortschritt oder Zustand. Rücklauf und Fortschritt sind **neutral/graphit**.
- **RSC-Falle (Abschnitt 4.13):** Compound-Zugriff auf antd in Server Components ergibt HTTP 500, den
  `pnpm build` **nicht** erkennt. Verbotene Liste dort vollständig.
- **`--ant-*`-Variablen nur in Props von antd-Komponenten** — nicht in eigenem Markup. antd deklariert
  sie auf seiner Scope-Klasse, nicht auf `:root`; eigenes Markup sieht sie nicht, und der Build merkt
  es nicht (die Haarlinie verschwindet still). Eigenes Markup nutzt `--fb-*`/`--note-*`
  (Abschnitt 4.10).
- **Bedienelement-Größe:** `size` im Cockpit **nicht** setzen — `controlHeight: 56` ist die
  Suite-Vorgabe und schon das richtige Maß (`controlHeightLG` wäre 72). Ausnahme: `size="small"`
  **innerhalb** der Verlaufstabelle.
- **Fristen** kommen ausschließlich aus `computeClosesAt(evening.date, hours)` — **nie** aus „jetzt +
  Stunden".
- Commit-Trailer an jedem Commit:
  `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>` und
  `Claude-Session: https://claude.ai/code/session_018YXgYUqxjcdmma3aiPFSaX`

---

### Task 16: Fünf Bestandsfehler, die der Entwurf aufgedeckt hat

Vor jeder Oberflächenarbeit: fünf Defekte im Bestand, die sonst grafisch fortgeschrieben würden. Alle
fünf wurden am Code verifiziert.

**Bindend:** Abschnitt 1.5 (die fünf Funde), 4.12 (`stars`), 4.15 (vollständige Liste der Änderungen
an Actions und Queries).

**Files:**
- Modify: `src/app/m/feedback/actions.ts`, `_db/queries.ts`, `_lib/aggregation.ts`,
  `_lib/seed.ts`
- Test: `actions.test.ts`, `queries.test.ts`, `aggregation.test.ts`

**Interfaces:**
- `DAStats` bekommt zwei Felder: `avgSchulnote: number | null` (mittelt **nur** `schulnote`-Fragen),
  `hasLegacyScale: boolean`. `overallAvg` bleibt **unverändert** (CSV-Kompatibilität).
- `listEvenings` bekommt ein `ORDER BY date DESC`.

- [ ] **Schritt 1: Tests schreiben, die scheitern**

- **Frist-Defekt:** `activateSurveyAction` (Altbestands-Entwurf starten) übergibt heute `now` als
  `eveningDate` — die Frist hängt damit am Klickzeitpunkt statt am Abenddatum. Test: Entwurf für einen
  Abend vor drei Tagen starten → `closesAt` richtet sich nach dem **Abenddatum**, nicht nach jetzt.
  Dasselbe für `seed.ts`.
- **`revalidatePath` erreicht das Cockpit nicht:** heute werden `/m/feedback` und
  `/m/feedback/admin` revalidiert — letztere Route existiert wegen der Klammer-Route-Group **nie**,
  und die Cockpit-Route `/m/feedback/groups/{id}` steht in keiner Liste. Test: nach `startFeedback`
  wird ein Pfad revalidiert, der das Cockpit einschließt (`revalidatePath("/m/feedback", "layout")`).
- **`listEvenings` ohne Sortierung:** Abende in umgekehrter Einfügereihenfolge anlegen (ein
  nachgetragener älterer Abend) → die Rückgabe ist nach Datum absteigend, nicht nach rowid.
- **Gemischte Skalen (der stille Rechenfehler):** ein Fragebogen mit `schulnote`- **und**
  `stars`-Fragen → `avgSchulnote` mittelt **nur** die `schulnote`-Fragen, `hasLegacyScale` ist `true`.
  Ein reiner `stars`-Fragebogen → `avgSchulnote` ist `null` (es gibt keinen Schulnoten-Durchschnitt),
  `overallAvg` bleibt wie bisher.
- **`activateSurvey`-Alt-Test härten:** er prüft die Invariante heute nur über
  `activeSurveyForGroup().survey.id` und würde zwei aktive Zeilen **nicht** erkennen. Auf `COUNT(*)`
  umstellen.
- **Restkanal im CSV-Export schließen** (Fund aus dem Review von Task 8): Die Spalte „Zeitstempel" gibt
  `submittedAt` unverändert aus. Für **importierte** Antworten ist der Wert weiterhin sekundengenau
  (der Importer schreibt direkt, nicht über `insertResponse`) — wer die Spalte in Excel sortiert, stellt
  für historische Abende die Eingangsreihenfolge wieder her und hebt die Durchmischung im Export
  wieder auf. Die Datenbank bleibt unangetastet (Import-Parität!), aber die **Ausgabe** normalisiert
  die Spalte auf das Abenddatum. Test: Export eines importierten Abends mit sekundengenauen
  Zeitstempeln → alle Zeilen tragen dasselbe Datum, die Zeilenordnung entspricht der durchmischten
  Leseordnung.
- **Derselbe Host-Defekt in der QR-Route** (Nebenbefund aus der Nacharbeit N1, **hohe Wirkung**): Die
  Route `f/[slugSecret]/qr.png/route.ts` baut die kodierte URL aus `req.headers.get("host")` und
  berücksichtigt `x-forwarded-host` **nicht** (`x-forwarded-proto` liest sie immerhin). Schreibt der
  Reverse-Proxy den Host auf die Upstream-Adresse um, **kodiert der QR-Code eine unerreichbare
  Adresse** — und zwar in ein Druckstück, das an der Wand hängt. Fix: dieselbe Vorrangregel wie in
  `src/core/routing.ts` verwenden (die dort nach N1 vorhandene Funktion **wiederverwenden**, keine
  zweite Auflösung schreiben). Test: mit `x-forwarded-host` gesetzt kodiert der QR den öffentlichen
  Host, nicht die interne Adresse.
- **Modul-README anlegen** (offene Auflage aus Abschnitt 3.9 der öffentlichen Spezifikation): Es muss
  dokumentiert stehen, dass die IP ausschließlich für die Ratenbegrenzung in einer flüchtigen
  In-Memory-Struktur verwendet wird und **nie** an der Antwort gespeichert wird — sonst ist der Satz
  „keine Geräte- oder IP-Kennung" im Anonymitätssiegel eine unbelegte Behauptung. Kommt später ein
  persistenter Limiter mit IP-Spalte, muss der Siegeltext geändert werden und nicht stillschweigend
  seine Bedeutung.

- [ ] **Schritt 2: Fehlschlag bestätigen** · **Schritt 3: Umsetzen** · **Schritt 4: Tests**

`pnpm vitest run src/app/m/feedback` + `pnpm typecheck` — erwartet: PASS. Die CSV-Tests müssen
unverändert grün bleiben (`overallAvg` ist bewusst nicht angetastet).

- [ ] **Schritt 5: Commit**

`fix(feedback): Frist am Abenddatum, Cockpit-Revalidierung, Sortierung, getrennter Schulnoten-Mittelwert`

---

### Task 17: Bauteile — Typo-Rollen, CSS-Variablen, Notenanzeigen

Die wiederkehrenden Anzeigen an einer Stelle, damit sie nicht siebenmal frei erfunden werden.

**Bindend:** Abschnitte 4.7 (Typo-Skala als Datei), 4.8 (Abstände, Radien, Bewegung), 4.10
(`--fb-*`-Variablen), 4.11 (Ampel: exakte Farbwerte, Schwellen, alle Bauteile), 4.12 (`stars` als
neutrale Pille), 4.14 (Barrierefreiheit).

**Files:**
- Create: `src/app/m/feedback/_ui/typo.ts`, `_ui/feedback.css`, `_ui/Noten.tsx` (Pille, Spur,
  Legende, Plakette) + Tests
- Modify: `(admin)/layout.tsx` (importiert `feedback.css`)

**Interfaces:**
- `T` — fertige `CSSProperties`-Objekte je Rolle (`kicker`, `meta`, `body`, `h2`, …). Keine
  Ad-hoc-Schriftgröße irgendwo sonst im Modul.
- `Notenpille({ note, scale })` — Ziffer **und** Wort **und** Farbe. Bei `scale === 5` neutrale Pille
  mit „Ø x,y von 5" und dem Zusatz „Altbestand-Skala" (Abschnitt 4.12).
- `Notenspur({ verteilung })` — sechs Zellen, Säulenhöhe = Anzahl. **Nur** wo eine echte Verteilung
  existiert, nie für einen Mittelwert.

- [ ] **Schritt 1: Tests schreiben, die scheitern**

- Die Notenpille trägt **immer** Ziffer und Wort, nicht nur Farbe (Barrierefreiheit: Farbe ist die
  verzichtbare Schicht).
- `ampelStufe`-Schwellen an den Grenzwerten (nutzt `_lib/noten.ts` aus Task 10 — **keine zweite**
  Schwellendefinition anlegen).
- Eine `stars`-Note (Skala 5) wird **neutral** dargestellt, **nicht** auf die Sechser-Rampe abgetastet,
  und trägt den Altbestands-Hinweis.
- Tönungen tragen **keinen** Text (die Notenfarbe auf ihrer eigenen Tönung erreicht nur ~2:1) —
  textführende Notenflächen sind vollgesättigt.
- Quelltext-Assertion: in `_ui/**` kommt `#c8000f` **nicht** vor (Farb-Klausel), und `--ant-*` wird
  nicht in eigenem Markup verwendet.

- [ ] **Schritt 2: Fehlschlag bestätigen** · **Schritt 3: Umsetzen** · **Schritt 4: Tests**

`pnpm vitest run src/app/m/feedback` + `pnpm lint`.

- [ ] **Schritt 5: Commit**

`feat(feedback): Typo-Rollen, CSS-Variablen und Notenanzeigen als Bauteile`

---

### Task 18: Zustands-Selektor und Lagekarte — „Feedback starten" in einem Klick

Das Herz des Cockpits: **eine** Stelle entscheidet vor dem Rendern, welche der fünf Belegungen gilt;
die Lagekarte zeigt genau eine davon. Damit fällt „Umfrage erstellen" + „Aktivieren" auf einen Klick
zusammen.

**Wichtig:** `createAndStartSurvey` **existiert bereits** (transaktional, getestet, Task 4) und hat
noch keinen Aufrufer. `startFeedbackAction` ist deshalb ein Zehnzeiler — **nicht** das Rezept
`insertEvening` → `insertSurvey` → `activateSurvey` nachbauen, das die getestete Transaktion
duplizieren würde.

**Bindend:** Abschnitte 2.1 (Seitengerüst), 2.2 (Zustands-Selektor), 2.3 (Lagekarte + StartFormular,
inkl. der Tabelle der fünf Belegungen), 2.7 (Slot „Letzter Abend"), 4.4 (Fehler am Feld), 4.5
(Ladezustände).

**Files:**
- Create: `src/app/m/feedback/_lib/cockpit.ts` (Selektor), `_ui/Lagekarte.tsx`,
  `_ui/StartFormular.tsx` + Tests
- Modify: `(admin)/groups/[groupId]/page.tsx`, `actions.ts` (`startFeedbackAction`,
  `beendeFeedbackAction`)

**Interfaces:**
- `cockpitZustand(...)` → eine Belegung aus A–E gemäß Abschnitt 2.2. **Kein** sechster Fall; der
  Selektor ist total.
- `startFeedbackAction(groupId, formData)` → nutzt `createAndStartSurvey`.

- [ ] **Schritt 1: Tests schreiben, die scheitern**

- Der Selektor deckt alle fünf Belegungen ab, je ein Test: Erststart (keine Abende), ruhend (Abende da,
  nichts läuft), läuft mit 0 Antworten, läuft mit Antworten, Altbestands-Entwurf vorhanden.
- Der Selektor ist **total**: keine Eingabekombination führt zu „keine Belegung".
- **Ein Klick genügt:** `startFeedbackAction` erzeugt Abend **und** aktive Umfrage **und** Frist —
  danach ist `activeSurveyForGroup` gesetzt. Kein zweiter Aufruf nötig.
- `startFeedbackAction` ruft `createAndStartSurvey` auf (die Invariante liegt dort). Test: bei
  laufender Umfrage derselben Gruppe ist danach genau **eine** aktiv.
- Die Frist stammt aus `computeClosesAt(evening.date, hours)` — Test mit einem Abend in der Zukunft:
  die Frist liegt **nach** dem Abend.
- Fehlerfall am Feld: fehlendes Datum → Fehlermeldung erscheint am Feld (`useActionState`), **nicht**
  als technische Fehlerseite, und die Eingaben bleiben stehen.
- Die Lagekarte zeigt in Belegung „läuft" den Rücklauf und den Schließzeitpunkt; der Knopf „Feedback
  jetzt beenden" ist **nicht** als Gefahr markiert (es ist ein geplanter Schritt).

- [ ] **Schritt 2: Fehlschlag bestätigen** · **Schritt 3: Umsetzen** · **Schritt 4: Tests**

`pnpm vitest run src/app/m/feedback` + `pnpm typecheck` + `pnpm build` (der Build deckt RSC-Fehler
nicht auf — deshalb zusätzlich die Compound-Liste aus 4.13 gegen den Diff prüfen).

- [ ] **Schritt 5: Commit**

`feat(feedback): Gruppen-Cockpit mit Zustands-Selektor, Feedback starten in einem Klick`

**Abgrenzung zum Zwischenstand (§2.3), damit nichts durchs Raster fällt.** Hier entstehen der Block
„ZWISCHENSTAND — NOCH NICHT ENDGÜLTIG", der Schwankungs-Hinweis bei 1–2 Rückmeldungen
(`laufend.responseCount`) und die **gezählten** Freitexte (Summe über `DAStats.texts`, gerechnet in
`page.tsx` mit dem dort schon importierten `computeDAStats` — keine zweite Aggregationsstelle).
**Notenlegende und die acht kompakten Notenspuren nicht**: sie brauchen eine Verteilung je Frage, die
`computeDAStats` nicht liefert. Diese Funktion (`verteilungJeFrage`) ist **Task 22** zugeordnet, weil
§3.2 dieselbe Datenlage für die Auswertungsseite braucht. Die Überschrift des Blocks erscheint bis
dahin nur, wenn Inhalt darunter steht — ein beschriftetes leeres Fach ist schlimmer als kein Fach
(§4.3).

---

### Task 19: Teilnahme-Zone und Aushang — der QR wird sichtbar

Der Daseinsgrund des Werkzeugs, der bisher komplett fehlte: heute steht auf der Gruppenseite nur der
Rohtoken `demo–demo1` ohne Host und Protokoll, und die funktionierende `qr.png`-Route ist von keiner
Seite verlinkt.

**Bindend:** Abschnitte 2.4 (Teilnahme-Zone mit zwei Client-Inseln), 3.5 (Aushang-Druckansicht).

**Files:**
- Create: `_ui/Teilnahme.tsx`, `_ui/KopierZeile.tsx`, `_ui/QrGross.tsx`,
  `(admin)/groups/[groupId]/aushang/page.tsx` (+ Druck-Layout) + Tests

**Interfaces:**
- Consumes: `qrSvg` aus `src/core/qr` (Task 2) für die eingebettete Vorschau; die `qr.png`-Route bleibt
  für den Download.

- [ ] **Schritt 1: Tests schreiben, die scheitern**

- Die Zone zeigt die **vollständige** Teilnahme-URL mit Protokoll und Host — nicht den Rohtoken. Der
  Host stammt aus dem `Host`-Header (`headers()`), **nicht** aus `req.url`: nach dem Host-Rewrite
  zeigt `req.url` auf die interne Adresse. (Die `qr.png`-Route löst das bereits korrekt und dokumentiert
  den Grund — dieselbe Lösung, nicht eine zweite erfinden.)
- Der QR ist **eingebettet** sichtbar, nicht nur als Download-Link.
- Kopier-Knopf kopiert die vollständige URL.
- Die Zone ist **auch sichtbar, wenn keine Umfrage läuft** — mit dem Hinweis, dass der Code dauerhaft
  gültig ist und einmal drucken für alle künftigen Dienstabende reicht.
- Aushang: A4, `@media print`, großer QR, Gruppenname. Enthält **keine** Suite-Navigation im Druck.
- Die Druckansicht ist ohne Anmeldung **nicht** erreichbar (sie zeigt das Secret).

- [ ] **Schritt 2: Fehlschlag bestätigen** · **Schritt 3: Umsetzen** · **Schritt 4: Tests**

- [ ] **Schritt 5: Commit**

`feat(feedback): QR und Teilnahme-Link im Cockpit, Aushang zum Ausdrucken`

---

### Task 20: Verlauf, Notenverlauf und aggregierter Gruppen-Export

**Bindend:** Abschnitte 2.5 (Verlauf), 3.3 (Trend), 5.3 (`core/charts` bleibt unangetastet —
Notendiagramme sind modul-lokal, weil alle vier Aufrufer im Modul liegen und `core/charts` weder
`reversed` noch farbige Punkte je Wert kennt).

**Files:**
- Create: `_ui/Verlauf.tsx`, `_ui/NotenVerlauf.tsx` (recharts direkt, modul-lokal),
  `(admin)/groups/[groupId]/export.csv/route.ts` (aggregiert je Gruppe) + Tests

**Interfaces:**
- Der Gruppen-Export ist ein **anderes Artefakt** als der bestehende Abend-Export: eine Zeile je
  Dienstabend, Ø je Frage. Der Abend-Export (Rohzeilen je Antwort) bleibt unverändert.

- [ ] **Schritt 1: Tests schreiben, die scheitern**

- Der Verlauf sortiert selbst nach Datum absteigend (verlässt sich **nicht** auf die DB-Ordnung).
- Jede Zeile trägt Rücklauf und die Notenpille für `avgSchulnote` (nicht `overallAvg`).
- Zeilen mit `hasLegacyScale` tragen die Fußnote „enthält Altbestands-Fragen (Skala 1–5) — nicht in den
  Durchschnitt gerechnet".
- Altbestands-Entwürfe erscheinen als „Entwurf (Altbestand)" mit Knopf „Jetzt starten".
- Das Notendiagramm hat eine **invertierte** Achse (Note 1 oben) — ein Diagramm, in dem eine 6 höher
  steht als eine 1, ist ein Sachfehler.
- Gruppen-CSV: eine Zeile je Abend, Ø je Frage, Formel-Neutralisierung greift (bestehendes
  `neutralizeFormula` **wiederverwenden**, nicht neu schreiben).
- Leerer Verlauf → Leerzustand statt leerer Tabelle.

- [ ] **Schritt 2–4** wie gehabt · [ ] **Schritt 5: Commit**

`feat(feedback): Verlauf mit Notenpille, invertierter Notenverlauf, Gruppen-CSV`

---

### Task 21: Einstellungen — die sechs unerreichbaren Actions bekommen eine Oberfläche

`updateGroupAction`, `regenerateSecretAction`, `deleteGroupAction`, `updateEveningAction`,
`deleteEveningAction` und die Zuordnung existieren, haben aber **keinen Aufrufer**. Ohne diese Aufgabe
bleibt jede Korrektur ein Datenbankeingriff.

**Bindend:** Abschnitte 2.6 (Einstellungen-Zone), 4.6 (Bestätigung destruktiver Aktionen).

**Files:**
- Create: `_ui/EinstellungenPanel.tsx`, `_ui/Zuordnung.tsx` + Tests
- Modify: `actions.ts` (Action für die Zuordnung, nutzt `setGroupMembers` aus Task 5)

- [ ] **Schritt 1: Tests schreiben, die scheitern**

- Gruppenname und Standard-Schließfrist sind änderbar; Fehler erscheinen am Feld.
- Teilnehmerzahl eines Abends ist **nachtragbar** (sie ist der Nenner jeder Rücklaufquote und wird oft
  erst am Abend bekannt). Wird das **Datum** eines laufenden Abends geändert, wird `closesAt` **neu
  berechnet** — sonst zeigt die Frist auf den alten Anker.
- „Neues Secret erzeugen" verlangt eine Bestätigung und nennt die Folge wörtlich: bestehende QR-Codes
  und Aushänge werden ungültig.
- Löschen verlangt Bestätigung. Die Bestätigungsdialoge verletzen die Farb-Klausel nicht (kein
  `type="primary" danger` auf einer Datenfläche — Gefahrendialoge dürfen Rot am Rand/okButton tragen,
  siehe 4.9).
- Die Zuordnung listet Personen aus dem Nutzerverzeichnis (Task 5) mit Namen; Entfernen funktioniert,
  nicht nur Hinzufügen.
- **Berechtigung:** ein Gruppenleiter kann sich **nicht** selbst weitere Gruppen zuordnen — die
  Zuordnung ist Admin-Sache. Negativtest.

- [ ] **Schritt 2–4** wie gehabt · [ ] **Schritt 5: Commit**

`feat(feedback): Einstellungen der Gruppe — bearbeiten, Secret, Zuordnung, löschen`

---

### Task 22: Einstieg, Navigation und die drei angebundenen Auswertungsseiten

Heute ist jede Unterseite eine Sackgasse, und `trend`/`vergleich`/`prompt` sind per URL-Eingabe
erreichbar oder gar nicht.

**Bindend:** Abschnitte 3.1 (Einstieg), 3.2 (Auswertung), 3.3 (Trend), 3.4 (Vergleich), 4.1
(Navigation und Breadcrumbs), 4.2 (Seitenkopf-Muster), 4.3 (Leerzustände), 5.1 Punkt 1
(`FullShell`-Modultitel wird ein Link — betrifft **alle** Module mit `shell: "full"`).

**Files:**
- Modify: `(admin)/page.tsx` (Einstieg), `…/auswertung/page.tsx`, `…/trend/page.tsx`,
  `vergleich/page.tsx`, `src/core/shell/FullShell.tsx`
- Modify: `_lib/aggregation.ts` (`verteilungJeFrage` ergänzen) + `_lib/aggregation.test.ts` — die
  **ausdrücklich erlaubte Ausnahme** von „aggregation nicht antasten": rein additiv, `computeDAStats`,
  `overallAvg`, `avgSchulnote`, CSV- und Prompt-Pfad bleiben Zeichen für Zeichen unverändert
- Modify: `_ui/Lagekarte.tsx` (Notenlegende + acht kompakte Notenspuren in den Zwischenstand)
- Delete: `…/prompt/page.tsx` (wird aufklappbarer Abschnitt der Auswertung)
- Test: entsprechende Tests + `FullShell`-Test

**Interfaces:**
- `verteilungJeFrage(questions, answers)` → je Bewertungsfrage
  `{ id, text, verteilung: number[] /* Länge 6 */, count }`. **Index 0 = Note 1**, damit der Wert ohne
  Umrechnung in `NotenspurProps.verteilung` (`_ui/Noten.tsx:169`) passt. `stars`-Fragen (Alt-Skala
  1–5) werden **nicht** auf die Sechser-Rampe abgetastet (§4.12) — sie tragen die bestehende Fußnote.

**Warum diese Funktion hier hängt (nicht optional):** §3.2 Punkt 2 (Auswertung) und §2.3
(Zwischenstand der Lagekarte) brauchen **dieselbe** Datenlage — acht Verteilungen, sechs Zellen je
Frage. Task 18 hat vom Zwischenstand nur geliefert, was ohne diese Funktion baubar war (Schwankungs-
Hinweis bei 1–2 Rückmeldungen, gezählte Freitexte); die **Notenlegende und die acht Notenspuren
fehlen dort weiterhin** und werden hier fertiggestellt. Ohne diese Zuordnung bleibt §2.3 dauerhaft
unerfüllt, ohne dass es noch jemand merkt. Der Merkposten steht zusätzlich als Kommentar am
Zwischenstand-Block in `_ui/Lagekarte.tsx`.

- [ ] **Schritt 1: Tests schreiben, die scheitern**

- `verteilungJeFrage`: eine Frage mit 6×Note 1 und 6×Note 5 ergibt **zwei** Säulen (Index 0 und 4),
  **nicht** eine bei 3,0 — genau die Aussage, die ein Mittelwertbalken verschweigt. Dazu: leere
  Antwortmenge → sechs Nullen (keine `null`-Sonderform), unbeantwortete Frage zählt nicht mit,
  Werte außerhalb 1–6 landen in keiner Zelle.
- Die Auswertung zeigt Notenlegende **einmal** und acht Spuren im identischen Sechs-Spalten-Raster;
  der `BarChart` ist auf dieser Seite **weg** (§3.2 Punkt 2).
- Die Lagekarte trägt im Zwischenstand dieselben Spuren in `groesse="kompakt"` — und weiterhin die
  Überschrift „ZWISCHENSTAND — NOCH NICHT ENDGÜLTIG" sowie den Schwankungs-Hinweis aus Task 18.
- **Genau eine Gruppe** → Weiterleitung direkt ins Cockpit (0 Klicks).
- **Mehrere Gruppen** → Karten mit Zustand *auf* der Karte („läuft — 12 von 20" / „nichts aktiv,
  letzter Abend …").
- Trend und Vergleich sind **verlinkt** (kein URL-Wissen nötig); der Vergleich nur für Admins.
- Breadcrumb auf jeder Unterseite; der Modultitel im Header ist ein Link (Regressionstest für die
  anderen `shell: "full"`-Module, `data-testid` bleibt auf dem `<strong>`).
- Der Header bricht auf schmalen Fenstern **nicht** über den Titel.
- Der KI-Prompt ist Teil der Auswertung; die alte `prompt`-Route ist entfernt.
- Ein Gruppenleiter sieht im Einstieg **nur** seine Gruppen (Negativtest — die Ownership-Guard ist die
  einzige echte Verbesserung des Ports gegenüber dem Original und darf nicht verloren gehen).

- [ ] **Schritt 2–4** wie gehabt · [ ] **Schritt 5: Commit**

`feat(feedback): Einstieg mit Zustandskarten, Notenspuren aus der Verteilung, Trend und Vergleich
angebunden`

---

### Task 23: E2E des Admin-Ablaufs und Abschluss-Gate

**Bindend:** Abschnitt 4.16 (welche E2E-Erwartungen brechen und welche bewahrt werden).

**Files:**
- Modify: `e2e/feedback.spec.ts`

- [ ] **Schritt 1: Szenarien schreiben**

- **Der Hauptablauf in zwei Klicks:** Gruppe öffnen → „Feedback starten" → QR und Link sind sichtbar.
- Rücklauf erscheint im Cockpit, nachdem eine Abgabe erfolgt ist (Zwischenauswertung ohne Schließen).
- „Feedback jetzt beenden" → Auswertung erreichbar.
- Gruppenleiter sieht fremde Gruppe nicht (auch nicht per direkter URL).
- Aushang-Druckansicht rendert.
- Einstellungen: Teilnehmerzahl nachtragen, Secret neu erzeugen (mit Bestätigung).
- Mobil (390px): Cockpit bleibt bedienbar, „Feedback starten" erreichbar.

- [ ] **Schritt 2: Laufen lassen**

`pnpm exec playwright test` — alle grün.

- [ ] **Schritt 3: Abschluss-Gate**

`pnpm typecheck` · `pnpm lint` · `pnpm vitest run` · `pnpm build` — alle grün, keine Verringerung der
Testzahl gegenüber dem Stand vor Teil 3.

- [ ] **Schritt 4: Commit**

`test(feedback): E2E des Admin-Ablaufs, Hauptablauf in zwei Klicks`
