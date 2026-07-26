# Redesign Modul `feedback` — Implementierungsplan, Teil 1: Fundament

> **Für agentische Umsetzung:** ERFORDERLICHE UNTER-SKILL: `superpowers:subagent-driven-development`.
> Schritte sind als Checkboxen (`- [ ]`) geführt.

**Ziel:** Die Grundlagen legen, auf denen der Oberflächen-Umbau aufsetzt — bereinigte
Diagramm-Bausteine, ein geteilter QR-Baustein, der neue Fristanker, die Ein-aktive-Invariante im
Anlege-Pfad, und die Zuordnung Gruppenleiter→Gruppe aus zwei Quellen.

**Architektur:** Reine Logik und Datenschicht zuerst, Oberfläche in Teil 2. Jede Aufgabe endet
testbar. Keine Aufgabe hier verändert einen Screen, außer wo eine Signatur das erzwingt.

**Tech-Stack:** Next.js 16 (App Router, RSC), Drizzle + better-sqlite3, Ant Design 6, Recharts,
Vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-07-24-feedback-redesign-design.md` — verbindlich. Die
Entscheidungen A–G dort sind nicht neu zu verhandeln.

## Globale Randbedingungen

- **Skala:** Schulnote 1–6, invertiert (1 = sehr gut, 6 = ungenügend). Keine „mehr = besser"-Metapher.
- **Statuswerte:** nur `active` und `closed` werden geschrieben. `draft` bleibt **lesbar**
  (Altbestand/Import), `archived` bleibt tolerant lesbar. **Keine** Schema-Migration an `surveys`.
- **`memberGroupIdsFor` ist eine Sicherheitsgrenze.** Fehlender Claim → leere Menge → nur
  `user_groups`. Niemals „alle Gruppen".
- **RSC/antd-Falle:** `Descriptions.Item`, `Typography.Title`, `Form.Item`, `List.Item` in einer Server
  Component ergeben HTTP 500, den `pnpm build` nicht erkennt. `Card`, `Statistic`, `Result`,
  `Progress`, `Table`, `Tag` sind sicher. `Space` nimmt `orientation`, nicht `direction`. `List` ist
  abgekündigt → `Table`.
- **`evenings.date` ist Mitternacht UTC.** Fristberechnung läuft über den *lokalen* Tagesabschluss
  (Europe/Berlin), sonst liegt die Frist zwei Stunden daneben.
- **Nicht antasten:** `aggregation`, `csv`, `prompt`, `token`, `access`, `ratelimit` — außer wo eine
  Aufgabe es ausdrücklich verlangt.
- Commit-Trailer an jedem Commit:
  `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>` und
  `Claude-Session: https://claude.ai/code/session_018YXgYUqxjcdmma3aiPFSaX`

---

### Task 1: Diagramm-Bausteine bereinigen

`core/charts` kodiert `#c8000f` fest und behandelt den Dunkelmodus für Achsen und Gitter nicht.
`feedback` wird das diagrammlastigste Modul — das muss **vor** allen diagrammnutzenden Aufgaben stehen.

**Files:**
- Modify: `src/core/charts/BarChart.tsx`, `src/core/charts/LineChart.tsx`
- Test: `src/core/charts/charts.test.tsx` (neu)

**Interfaces:**
- Consumes: `src/core/theme/theme.ts` (bestehende Design-Tokens)
- Produces: unveränderte Props-Signaturen von `BarChart`/`LineChart`, zusätzlich optional
  `emptyText?: string`. Farbe und Achsenfarben kommen aus dem Theme, nicht aus Literalen.

- [ ] **Schritt 1: Test schreiben, der scheitert**

Prüfe drei Dinge: (a) kein Farbliteral `#c8000f` mehr im Modul, (b) bei leerem Datenarray wird ein
Hinweistext gerendert statt eines leeren Achsenkreuzes, (c) Achsen- und Gitterfarbe stammen aus dem
Theme-Token, nicht aus einer festen Zeichenkette. (a) lässt sich als Quelltext-Assertion prüfen
(Datei einlesen, auf das Literal prüfen) — das ist hier legitim, weil genau die Hartkodierung der
Defekt ist.

- [ ] **Schritt 2: Test laufen lassen, Fehlschlag bestätigen**

`pnpm vitest run src/core/charts/charts.test.tsx` — erwartet: FAIL.

- [ ] **Schritt 3: Umsetzen**

Farbe aus dem Theme beziehen. Achsen-, Gitter- und Beschriftungsfarbe je Modus ableiten (die Suite hat
einen Theme-Umschalter — der Dunkelmodus darf keine unsichtbaren Achsen ergeben). Leerzustand: liegt
kein Datenpunkt vor, statt des Diagramms einen ruhigen Hinweis rendern („Noch keine Rückmeldungen").

- [ ] **Schritt 4: Tests laufen lassen**

`pnpm vitest run src/core/charts` — erwartet: PASS. Zusätzlich `pnpm typecheck`.

- [ ] **Schritt 5: Commit**

`fix(charts): Theme-Farben statt Literal, Dunkelmodus-Achsen, Leerzustand`

---

### Task 2: QR-Baustein nach `src/core/qr/`

Heute existieren **drei** divergierende QR-Konfigurationen im Repo (`payloadToSvg` mit H/margin 4,
die `qr.png`-Route mit M/margin 2/512px, dazu das qr-Modul selbst). `feedback` darf nicht quer in
`m/qr` importieren — dem Muster von `src/core/charts/` folgen.

**Files:**
- Create: `src/core/qr/index.ts`, `src/core/qr/qr.test.ts`
- Modify: `src/app/m/qr/_lib/qr.ts` (delegiert an den core-Baustein, Verhalten unverändert),
  `src/app/m/feedback/f/[slugSecret]/qr.png/route.ts` (nutzt den core-Baustein)

**Interfaces:**
- Produces:
  - `qrSvg(text: string): Promise<string>` — SVG, serverseitig, ohne DB-/Auth-Bindung
  - `qrPng(text: string, opts?: { width?: number }): Promise<Uint8Array>`
  - `QR_OPTIONS` — die *eine* gemeinsame Konfiguration (Fehlerkorrektur, Rand)
- Consumes: `qrcode` (bereits Abhängigkeit)

- [ ] **Schritt 1: Test schreiben, der scheitert**

`qrSvg` liefert ein `<svg`-Dokument; leerer Text wirft; überlange Eingabe wirft (die bestehende
Kapazitätsprüfung aus `m/qr/_lib/qr.ts` bleibt erhalten); `qrPng` liefert Bytes mit PNG-Signatur;
SVG und PNG desselben Textes verwenden dieselbe Fehlerkorrekturstufe.

- [ ] **Schritt 2: Fehlschlag bestätigen**

`pnpm vitest run src/core/qr` — erwartet: FAIL (Modul fehlt).

- [ ] **Schritt 3: Umsetzen**

Baustein anlegen. `m/qr/_lib/qr.ts` so umbauen, dass `payloadToSvg` an `qrSvg` delegiert — **die
bestehenden Tests des qr-Moduls müssen unverändert grün bleiben**, das ist die Regressionssicherung.
Die `qr.png`-Route auf `qrPng` umstellen und dabei die Host-Ermittlung über den `Host`-Header
**unverändert** lassen (der Kommentar dort erklärt, warum `req.url` nach dem Host-Rewrite nicht
taugt — diese Erkenntnis darf nicht verloren gehen).

- [ ] **Schritt 4: Tests laufen lassen**

`pnpm vitest run src/core/qr src/app/m/qr` — erwartet: PASS, inklusive aller Alt-Tests des qr-Moduls.

- [ ] **Schritt 5: Commit**

`refactor(qr): gemeinsamen QR-Baustein nach core, eine Konfiguration statt drei`

---

### Task 3: Fristanker auf den Abend-Tag umstellen

Heute: `closesAt = activatedAt + closeAfterHours`. Sobald Anlegen = Starten ist, schließt eine am
Dienstag für Samstag angelegte Umfrage schon am Donnerstag. Neuer Anker: **Ende des lokalen
Kalendertags von `evenings.date` + `closeAfterHours`** (Entscheidung C).

**Files:**
- Modify: `src/app/m/feedback/_lib/lifecycle.ts`
- Test: `src/app/m/feedback/_lib/lifecycle.test.ts` (umschreiben, nicht ergänzen)

**Interfaces:**
- Produces: `computeClosesAt(eveningDate: Date, closeAfterHours: number): Date` — **geänderte
  Semantik des ersten Parameters** (vorher Aktivierungszeit, jetzt Abenddatum). Zeitzone
  Europe/Berlin.
- Bleibt unverändert: `isExpired`, `nextStatusOnAccess`.

- [ ] **Schritt 1: Tests schreiben, die scheitern**

Fälle, die alle abgedeckt sein müssen:
- Abend am 24.07., Frist 48 h → schließt am 27.07. um 00:00 lokal (Ende des 24. + 48 h).
- Abend heute, Frist 0 → schließt zum lokalen Tagesende.
- **Sommerzeit-Grenze:** Abend am Tag vor der Umstellung — die Frist darf nicht um eine Stunde
  verrutschen. Mindestens ein Fall über die Märzumstellung, einer über die Oktoberumstellung.
- **`date` als Mitternacht UTC:** ein Abenddatum, das in UTC schon am Vortag liegt, muss dennoch dem
  richtigen lokalen Kalendertag zugerechnet werden.
- Vorab-Anlegen: Abend in 4 Tagen → Frist liegt nach dem Abend, nicht vor ihm. Das ist der Fall, der
  den alten Anker widerlegt.

- [ ] **Schritt 2: Fehlschlag bestätigen**

`pnpm vitest run src/app/m/feedback/_lib/lifecycle.test.ts` — erwartet: FAIL.

- [ ] **Schritt 3: Umsetzen**

Umstellen. Die Zeitzone gehört an *eine* Stelle als Konstante, nicht verstreut. Keine zusätzliche
Abhängigkeit aufnehmen, wenn `Intl` reicht.

- [ ] **Schritt 4: Tests laufen lassen**

`pnpm vitest run src/app/m/feedback/_lib` — erwartet: PASS. Danach `pnpm typecheck`, um jede
Aufrufstelle der geänderten Signatur zu finden.

- [ ] **Schritt 5: Commit**

`feat(feedback): Frist hängt am Abend-Tag statt an der Aktivierungszeit`

---

### Task 4: `createAndStartSurvey` — Anlegen ist Starten

**Die riskanteste Änderung des Umbaus.** Bei zwei aktiven Umfragen einer Gruppe ruft
`activeSurveyForGroup` `.get()` auf ein nicht eindeutiges Ergebnis auf, und die öffentliche Route
liefert eine **beliebige** der beiden aus — der gedruckte QR zeigt dann auf die falsche Erhebung. Ein
DB-seitiger Riegel ist unmöglich (`surveys` hat kein `group_id`, es hängt an `evenings`), die
Durchsetzung bleibt in der Transaktion.

**Files:**
- Modify: `src/app/m/feedback/_db/queries.ts`
- Test: `src/app/m/feedback/_db/queries.test.ts`

**Interfaces:**
- Produces:
  `createAndStartSurvey(db: DB, input: { groupId: number; date: Date; topic: string | null; notes: string | null; participants: number | null; closeAfterHours: number; now: Date }): { eveningId: number; surveyId: number }`
  — **eine** Transaktion: Abend anlegen, alle aktiven Umfragen derselben Gruppe schließen, neue Umfrage
  mit `status: "active"`, `activatedAt: now`, `closesAt` aus Task 3, Fragen-Schnappschuss einfügen.
- Bleibt: `activateSurvey` (für „Entwurf (Altbestand) → jetzt starten"), `activeSurveyForGroup`.
- Consumes: `computeClosesAt` (Task 3), `QUESTIONS` aus `_lib/questions.ts` für den Schnappschuss.

- [ ] **Schritt 1: Tests schreiben, die scheitern**

Verbindlich abzudecken:
- Ein Aufruf → Abend + Umfrage existieren, Status `active`, `closesAt` gesetzt, Fragen-Schnappschuss
  nicht leer.
- **Invariante:** zwei aufeinanderfolgende Starts für **dieselbe** Gruppe → genau **eine** aktive
  Umfrage; die erste ist `closed` mit gesetztem `closedAt`.
- **Isolation:** ein Start in Gruppe A schließt **keine** aktive Umfrage in Gruppe B. (Die
  bestehende Schleife in `activateSurvey` ist der Vorlage-Code — dieser Test sichert, dass die
  Portierung die Gruppengrenze nicht verliert.)
- **Rollback:** schlägt das Einfügen der Umfrage fehl, darf kein Abend zurückbleiben (Transaktion).
- Ein `draft` aus Altbestand in derselben Gruppe wird **nicht** angetastet (nur `active` wird
  geschlossen).

- [ ] **Schritt 2: Fehlschlag bestätigen**

`pnpm vitest run src/app/m/feedback/_db/queries.test.ts` — erwartet: FAIL.

- [ ] **Schritt 3: Umsetzen**

Transaktion schreiben. Die Reihenfolge ist wesentlich: erst Geschwister schließen, dann die neue
einfügen — andernfalls schließt die Schleife die gerade erzeugte Umfrage mit.

- [ ] **Schritt 4: Tests laufen lassen**

`pnpm vitest run src/app/m/feedback/_db` — erwartet: PASS.

- [ ] **Schritt 5: Commit**

`feat(feedback): Anlegen und Starten in einer Transaktion, eine aktive Umfrage je Gruppe`

---

### Task 5: Zuordnung aus zwei Quellen + Nutzerverzeichnis

Ohne diese Aufgabe sieht in Produktion **kein** Gruppenleiter eine Gruppe. Zwei Quellen als
Vereinigungsmenge (Entscheidung B): Attribut aus Pocket ID **und** Zuordnung im Werkzeug.

**Files:**
- Create: `src/core/auth/fachgruppen.ts` + Test
- Modify: `src/app/m/feedback/_db/schema.ts` (Verzeichnis-Tabelle), `_db/queries.ts`,
  `_db/migrations/` (neue Migration), `_lib/viewer.ts`
- Test: `src/app/m/feedback/_db/queries.test.ts`, `src/app/m/feedback/_lib/access.test.ts`

**Interfaces:**
- Produces:
  - `parseFachgruppen(source: Record<string, unknown>, claim?: string): string[]` — Standard-Claim aus
    `POCKET_ID_FACHGRUPPEN_CLAIM`, Rückfall `"fachgruppen"`. **Nur Arrays** werden akzeptiert.
  - `memberGroupIdsFor(db: DB, sub: string, fachgruppenSlugs: string[]): number[]` — **erweiterte
    Signatur**, Vereinigung aus `user_groups` und exaktem Slug-Treffer.
  - `upsertKnownUser(db: DB, u: { userId: string; name: string | null; email: string | null; seenAt: Date }): void`
  - `listKnownUsers(db: DB): Array<{ userId: string; name: string | null; email: string | null }>`
  - `setGroupMembers(db: DB, groupId: number, userIds: string[]): void`
- Verzeichnis-Tabelle: Kennung (`sub`) als Primärschlüssel, Name, E-Mail, zuletzt gesehen.

- [ ] **Schritt 1: Tests schreiben, die scheitern**

**Sicherheitsgrenze — je Zweig ein Negativfall, das ist der Kern dieser Aufgabe:**
- Claim fehlt ganz → nur `user_groups`, **nicht** alle Gruppen.
- Claim ist leeres Array → nur `user_groups`.
- Claim ist eine Zeichenkette statt eines Arrays (`"sanitaet"`) → leere Menge, **keine**
  Koerzion, **kein** Zerlegen an Trennzeichen.
- Claim nennt einen nicht existierenden Slug → keine Zuordnung.
- Claim nennt einen Slug mit abweichender Groß-/Kleinschreibung → **kein** Treffer (exakter
  Vergleich).
- `user_groups` leer **und** Claim leer → keine Gruppe sichtbar.
- Vereinigung: Person ist über `user_groups` in Gruppe A und über Claim in Gruppe B → beide sichtbar,
  jede genau einmal (keine Duplikate).

Verzeichnis: Upsert ist idempotent (zweimal derselbe `sub` → ein Datensatz, `seenAt` aktualisiert);
`setGroupMembers` ersetzt die Zuordnung vollständig (Entfernen funktioniert, nicht nur Hinzufügen).

- [ ] **Schritt 2: Fehlschlag bestätigen**

`pnpm vitest run src/core/auth src/app/m/feedback/_db src/app/m/feedback/_lib/access.test.ts` —
erwartet: FAIL.

- [ ] **Schritt 3: Umsetzen**

`parseFachgruppen` **strikt** nach dem Muster von `parseGroups` (dort ist die Array-Prüfung schon
richtig gelöst — dasselbe Vorgehen, kein neues). Migration mit `pnpm drizzle-kit generate` für die
feedback-Modul-DB erzeugen; die Registrierungs-Kopplung ändert sich **nicht**, weil die DB des Moduls
schon existiert.

- [ ] **Schritt 4: Tests laufen lassen**

`pnpm vitest run src/core/auth src/app/m/feedback` — erwartet: PASS. Zusätzlich `pnpm typecheck` (die
geänderte `memberGroupIdsFor`-Signatur hat mehrere Aufrufstellen).

- [ ] **Schritt 5: Migration prüfen**

`pnpm vitest run src/app/m/feedback/_db/migrations.test.ts` — die Migration muss auf einer frischen DB
und auf einer bestehenden DB durchlaufen.

- [ ] **Schritt 6: Commit**

`feat(feedback): Gruppenzuordnung aus SSO-Attribut und Werkzeug, Nutzerverzeichnis`

---

### Task 6: Verzeichnis beim Betreten des Moduls füllen

Trägt den angemeldeten Nutzer ins Verzeichnis ein, damit er zuordenbar wird (Entscheidung G: nicht am
Login, nicht in `core` — Modul-lokal).

**Files:**
- Modify: `src/app/m/feedback/(admin)/layout.tsx`
- Test: `src/app/m/feedback/(admin)/layout.test.tsx` (neu)

**Interfaces:**
- Consumes: `upsertKnownUser` (Task 5), `viewerFromSession`, `auth()`

- [ ] **Schritt 1: Tests schreiben, die scheitern**

- Angemeldeter Nutzer betritt das Modul → Datensatz im Verzeichnis mit `sub`, Name, E-Mail.
- Zweiter Aufruf → weiterhin **ein** Datensatz (idempotent).
- Nicht angemeldet → **kein** Schreibvorgang, Weiterleitung zum Login bleibt wie bisher.
- Der bestehende Auth-Riegel des Layouts bleibt wirksam: angemeldet, aber ohne Berechtigung → 404
  (Regressionstest — dieser Riegel wurde erst nachträglich eingebaut und darf nicht verloren gehen).

- [ ] **Schritt 2: Fehlschlag bestätigen**

`pnpm vitest run src/app/m/feedback/\(admin\)/layout.test.tsx` — erwartet: FAIL.

- [ ] **Schritt 3: Umsetzen**

Upsert **nach** der Auth-Prüfung. Das Layout bleibt eine Server Component und importiert **kein**
antd (der bestehende Zustand ist hier korrekt und soll so bleiben).

- [ ] **Schritt 4: Tests laufen lassen**

`pnpm vitest run src/app/m/feedback` — erwartet: PASS.

- [ ] **Schritt 5: Commit**

`feat(feedback): Besucher des Moduls landen im Nutzerverzeichnis`

---

**Teil 2** (Oberfläche: Cockpit, Schulnoten-Skala, öffentliche Ansichten, Aushang, Navigation,
aggregierter CSV-Export, Trend/Vergleich-Anbindung, E2E) folgt in
`2026-07-24-feedback-redesign-teil2.md` und setzt die hier festgelegten Signaturen voraus.
