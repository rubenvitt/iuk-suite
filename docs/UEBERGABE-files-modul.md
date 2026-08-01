# Übergabe — Modul `files` (Phase 4), Stand 2026-08-01 (nach Welle 6a)

Du übernimmst den Bau des Moduls `files` in der iuk-suite. **41 von 51 Tasks sind fertig und
committet, 10 stehen aus.** Dieses Dokument sagt dir, was du zuerst liest, was schon entschieden ist,
wie hier gearbeitet wird, und welche Fallen die bisherigen Wellen Zeit gekostet haben.

Branch: **`feat/files-modul`** (acht Commits, alle Gates grün).

---

## 1. Was du liest, bevor du irgendetwas anfasst

In dieser Reihenfolge — jedes Dokument setzt das vorige voraus:

| Datei | Warum |
|---|---|
| `CLAUDE.md` (Repo-Wurzel) | Die **sechs Fallen, die `pnpm build` nicht findet**. Jede kostet einen halben Tag. |
| `docs/design/README.md` | Verbindliche Querschnittsregeln: 768px als einziger Breakpoint, 44px-Trefferflächen, die Prüffragen für jede Ansicht, die `core`-Regel. |
| `docs/superpowers/specs/2026-07-30-files-modul-design.md` | **Die Spec.** Verbindlich. 13 Abschnitte. |
| `docs/superpowers/plans/2026-07-30-files-modul.md` | **Der Task-Plan.** Dein Arbeitsauftrag steht dort, Task für Task, mit Dateilisten und Abnahmekriterien. |
| `docs/files-portierung-analyse.md` | 2383 Zeilen geprüfte Faktenbasis über die beiden Alt-Apps. Nachschlagewerk, nicht Pflichtlektüre am Stück. |

Die Alt-Apps liegen daneben: `../easy-filesharing` (Freigaben, heute S3/MinIO) und `../drop`
(Upload-Inbox). **Sie sind die Quelle der Wahrheit über heutiges Verhalten** — die Analyse zitiert sie
mit Zeilennummern, aber prüfe im Zweifel selbst nach.

---

## 2. Was entschieden ist und nicht neu verhandelt wird

Vom Betreiber am 30.07. festgelegt:

1. **Ein Modul, zwei Hosts.** `SUITE_HOST_FILES` ist eine Liste, die Reihenfolge trägt Bedeutung:
   **Index 0 = `share.iuk-ue.de` = Rolle „verwaltung", Index 1 = `drop.iuk-ue.de` = Rolle „inbox".**
   Nicht zwei Module.
2. **Storage-Pfad ohne Dateiname:** `<DATA_DIR>/files/<shareId>/<fileId>`. Der Client liefert keinen
   Pfadanteil, also kann er keinen einschmuggeln — die Traversal-Klasse ist strukturell weg, nicht
   per Guard.
3. **AV asynchron.** Der Scan läuft nach der Upload-Antwort. **Der Empfänger wartet:** der Share-Link
   entsteht sofort und ist sofort weitergebbar; wer zu früh abruft, sieht „wird geprüft" und die Seite
   aktualisiert sich selbst. Der Download bleibt bis `clean` gesperrt.
4. **Posteingang-Ansicht im Browser** (Liste mit Hinweis, Kategorie, Zeit, Größe, AV-Status, Download,
   Löschen). Keine Sidecar-`.txt`, kein SSH-Abholweg mehr.
5. **Zugriff: genau EINE Stufe.** Wer in der Modulgruppe ist, darf alles — auch fremde Freigaben und
   das Audit-Log. **Keine Ownership-Prüfung zwischen Mitgliedern.** Der Suite-Admin bekommt **keine**
   Abkürzung (wie in `feedback` seit 28.07.). Folge: `shares.created_by` ist reine Anzeige.
6. **Passwortschutz serverseitig** (signiertes, share-gebundenes HttpOnly-Cookie nach Verify), plus
   Rate-Limit auf `/verify`.

Für alle übrigen Entscheidungen gilt die **Empfehlung der Analyse**, sofern sie keiner der obigen
widerspricht.

**Betriebswerte werden nie erfunden.** Wo eine Zahl nur der Server kennt, ist sie eine
Runbook-Eingabe; der Boot bricht mit Name und Einheit ab, statt einen Platzhalter zu benutzen. Das ist
Absicht und kein fehlender Default.

---

## 3. Wie hier gearbeitet wird

**TDD, und der Test muss zuerst rot gewesen sein.** Ein Test, der von Anfang an grün ist, prüft
nichts.

**Falsifiziere jeden Test per Mutation**, bevor du ihn für fertig hältst: kippe eine Konstante,
entferne einen Guard, ignoriere einen Parameter — wird er rot? Wenn nicht, besitzt er seine Aussage
nicht. Das ist in diesem Projekt kein Ritual: **jeder einzelne der bisher gefundenen schweren Fehler
kam aus einer Mutationsprobe, nicht aus einem roten Gate.**

**Gates am Ende jeder Welle:** `pnpm typecheck` · `pnpm lint` (Fehler blockieren, Warnungen nicht) ·
`pnpm vitest run` · `pnpm build` · bei UI-Arbeit `pnpm exec playwright test`. Dazu die Projektregel:
**jede angefasste Route muss tatsächlich abgerufen worden sein** (`pnpm dev` + curl oder e2e) — die
antd-RSC-Falle liefert HTTP 500, das kein Build sieht.

**Miss die Gates selbst.** Verlass dich nicht auf die Selbstauskunft eines Subagenten. Zwei belegte
Fälle: ein Agent meldete „Playwright 63 passed", tatsächlich waren es 62 + 1 Fehlschlag; ein anderer
meldete alles grün, während `pnpm typecheck` an einem fehlenden Export rot war.

### Der Wellen-Workflow

Das Script liegt in **`.claude/workflows/files-welle.mjs`**. Es baut eine oder mehrere Wellen
sequenziell: je Task ein Umsetzer, dahinter ein unabhängiger Reviewer (der die Mutationsprobe selbst
ausführt), dann Nachbesserung, dann das Wellen-Gate. Bei rotem Gate bricht es ab, statt auf rotem
Fundament weiterzubauen.

```
Workflow({scriptPath: ".claude/workflows/files-welle.mjs",
          args: {"wellen": [{"nummer": 5, "tasks": ["T26","T27"], "playwright": true}]}})
```

⚠️ **`args` kommt in dieser Umgebung als String an, nicht als Objekt.** Das Script parst das selbst
und hat **keine Task-Defaults** — eine vergessene Liste bricht ab. Grund: ein Lauf hat einmal still
Welle 1 wiederholt, weil `args.tasks` `undefined` war und die Defaults griffen. 18 Agenten arbeiteten
an bereits committeten Tasks.

**Tasks innerhalb einer Welle haben disjunkte Dateilisten** — deshalb laufen sie parallel. Fass als
Task-Agent **nur die Dateien deines Tasks** an; brauchst du eine fremde, melde sie, statt sie zu
ändern.

**Commits:** einer pro Welle, auf `feat/files-modul`. Task-Agenten committen nicht (paralleles `git
add` im selben Arbeitsbaum kollidiert).

---

## 4. Was als Nächstes ansteht

| Welle | Tasks | Inhalt | Playwright |
|---|---|---|---|
| ~~5~~ | ~~T26–T34, T51, T49 (11)~~ | **fertig, committet** (`54b52ec`) — Byte-Wege und Actions | — |
| ~~6a~~ | ~~T35, T37, T38, T39, T50 (5)~~ | **fertig, committet** (`ca4b847`) — Oberflächen I, samt zwei Nahtschlüssen | — |
| **6b** | T36 (1) | Freigaben-Übersicht (hängt an T37) | ja |
| **7** | T40, T41, T42, T43 (4) | Oberflächen II: `/s/<id>` mit Passwort-Gate, Detailseite, Bearbeiten, `/posteingang` | ja |
| **8a** | T44, T45, T46, T48 (4) | Host-Abnahme, AV-Wiederholung, Aufräum-Timer, Mobil-Abnahme | ja |
| **8b** | T47 (1) | fail-closed-Abnahme über alle fünf Lesewege (hängt an T45) | ja |

Danach ist **Spec 1 fertig**. Spec 2 (Import beider Quellen, Generalprobe, zwei Cutover) ist ein
eigener Zyklus und **nicht** dein Auftrag.

### Was Welle 5 den folgenden Wellen schuldet

Diese Punkte sind **keine** Befunde, sondern Nähte: Welle 5 hat sie bewusst nicht geschlossen, weil
sie fremde Dateien betreffen. Wer den genannten Task baut, schließt sie mit.

> **Stand nach 6a:** die vier T35-Punkte sind eingelöst (die Insel schickt `datei.type` am
> `?ende=1`-Chunk, `UploadInsel.tsx:242-256`), T50 ist gebaut, und die beiden zuvor offenen
> Nahtschlüsse (PNG-Download, leeres Share-Verzeichnis) sind in `ca4b847` mit drin. **Offen bleiben
> die Punkte an T39/T40/T21/T15/T44** — sie stehen unten unverändert.

**An T35 (`/shares/neu`, `UploadInsel`) — ERLEDIGT in 6a, hier als Beleg:**

- **Der `?ende=1`-Chunk MUSS `datei.type` als `Content-Type` mitschicken.** T27 nimmt die
  Client-Deklaration von dort entgegen; die Spec benennt keinen Träger, T27 hat den idiomatischen
  gewählt. Fehlt der Kopf, werden **`.txt` und die drei Office-Formate abgelehnt** — für `text/plain`
  gibt es keine Signatur, die Deklaration ist dort das einzige Positivsignal, für ZIP-Container ist
  sie die Verfeinerung. Signaturformate (PNG/JPEG/PDF) gehen auch ohne durch: **die Lücke fällt genau
  bei den vier Typen auf, die niemand zuerst testet.**
- Statuscodes, die T27 gewählt hat und auf die die Insel antworten muss: **415** MIME-Prüfung
  gescheitert, **409** Zeile bereits vollständig (samt `erwartetesOffsetBytes`), **400** `ab` ist kein
  Byte-Offset, **413** AV-Grenze, **507** kein Platz (Inbox-Weg, Zeile bleibt zur Wiederaufnahme).
- `anlegenAction` ruft `revalidatePath("/m/files")` **mitten im Ablauf**, vor dem Byte-Upload. Das
  steht in keiner Zusage und kein Test besitzt es (`next/cache` ist gemockt).
- `PASSWORT_MIN_ZEICHEN` (heute 8) liegt **weiterhin** modulprivat in `(verwaltung)/actions.ts`.
  T35 hat die Doppelung vermieden, indem das Formular die Zahl gar nicht anzeigt — die Meldung kommt
  vom Server. Wer sie **vorab** anzeigen will (naheliegend an T42, `/shares/[id]/bearbeiten`), muss
  sie zuerst nach `_lib/grenzen.ts` heben: eine `"use server"`-Datei darf nur asynchrone Funktionen
  exportieren, eine abgeschriebene 8 driftet.
- T35 schließt außerdem die **zwei Riegel aus §7** mit.

**An T39 (`/zugangslinks`):** die Spec widerspricht sich **innerhalb derselben Tabellenzelle**
(`…-design.md:925`): „die ersten 8 Zeichen im Klartext, für die Liste (`dz-` plus vier
Geheimzeichen)" — `dz-` plus vier sind **sieben**. T30 hat gebaut, was der Code verlangt; wer die
Liste baut, entscheidet die Zahl und korrigiert die Spec-Zeile mit.

**An T40 (`/s/<id>`), VOR dem Bau:** `api/preview/[id]/route.ts` exportiert heute `VORSCHAU_TYPEN`,
`TEXT_TYPEN` und `vorschauZustand` — Nicht-Handler-Exporte in einer `route.ts`. Sie gehören nach
`_lib/vorschau.ts`, bevor T40 sie liest.

**An T21 (`_lib/zip.ts`), zwei Schnitte:**

- `dispositionKopfzeile(name, ascii)` verdrahtet `attachment` fest, obwohl ihr eigener Kommentar T51
  als Aufrufer nennt. Für den Vorschau-Weg ist `attachment` das Gegenteil der Absicht. Nötig ist ein
  dritter Parameter `art: "attachment" | "inline"` mit Vorbelegung `attachment` (T33/T34 bleiben
  unberührt). Solange antwortet `/api/preview/<id>` mit nacktem `Content-Disposition: inline` **ohne
  `filename`**.
- `planeArchiv(kandidaten, nichtGefundeneIds)` trägt bei den beiden Aufrufern **zwei Bedeutungen**:
  T49 übergibt echte IDs, T34 übergibt **Dateinamen**. `ZipAusschluss.id` hält bei T34 also einen
  Namen. Heute liest niemand `.id` — der nächste Verbraucher bekäme beide Bedeutungen still
  vermischt.

**An T15 (`_db/queries.ts`):** alle `share_files`-Zeilen einer Freigabe entstehen in einem Aufruf und
tragen denselben `createdAt`. `ladeInhalt` sortiert `asc(createdAt), asc(id)` — bei Gleichstand
entscheidet die nanoid, und die Reihenfolge auf `/s/<id>`, der Detailseite und im ZIP ist **zufällig
statt die vom Nutzer gewählte**. Behebbar über eine Ordnungsspalte oder eine andere Sortierung.

**An T44 (Host-Abnahme):** der Docblock von `api/inbox/[id]/route.ts:26-30` behauptet,
`requireFilesAccess()` werfe und Next übersetze das in eine 404. Für den **eingeloggten** ohne Zugang
stimmt das; der **anonyme** wird in den Login umgeleitet (gemessen: 307). Fünf Handler bauen
außerdem dieselbe Rollensperr-404 nach (`rolleOderNull(req.headers) !== "verwaltung"`) — ab jetzt ist
die `core`-Regel „zweiter, heute belegbarer Nutznießer" für einen gemeinsamen Helfer erfüllt.

**An T50:** der `POST`-Altweg auf `/api/u/<token>/upload` antwortet heute **405**. Das ist richtig —
er gehört T50, nicht T31.

### Und was Welle 6a schuldet

**An T46 (Aufräum-Timer) — derselbe Defekt auf dem ZWEITEN Löschweg:** `shareLoeschenAction` entfernt
seit 6a das leere Share-Verzeichnis mit (`loescheShareVerzeichnis` in `_lib/storage.ts`). Der
Aufräumlauf tut das **nicht**: `planeAufraeumen` liefert `loeschen.shareIds` für abgelaufene
Freigaben, deren Blobs stehen **nicht** in `loeschen.parts` (das entsteht nur aus `einzelneDateien`;
die Dateien sterbender Shares zählen bloß als `mitgerissene`). Wer diese Liste ausführt, muss je
Eintrag `loescheShareVerzeichnis(shareId)` rufen — sonst wächst die gemeldete Waisenzahl über den
Ablaufweg genauso weiter wie vorher über den Löschweg.

**An T40/T41 (Welle 7):** `/shares/neu` verlinkt nach dem Upload bewusst nur auf `/`, weil
`/s/<id>` (T40) und `/shares/<id>` (T41) noch nicht existieren; ein Quelltext-Scan in
`UploadInsel.test.tsx` hält das fest, damit der Link später **bewusst** ergänzt wird. Ebenso trägt
`_ui/SharesUebersicht.tsx` noch den Kommentar, `/shares/neu` führe in ein `notFound()` — seit T35
falsch.

**Ein Werkzeugbefund für jede weitere Welle:** Next 16 lässt pro Verzeichnis nur **einen**
`next dev` zu. Solange ein Agent einen hält, kann `playwright.config.ts` seinen `next dev -p 3100`
nicht starten (`Another next dev server is already running`) — **die e2e-Tore mehrerer Wellen können
nicht parallel laufen.** Und `pkill -f fake-clamd` trifft auch den Fake-Scanner fremder Läufe: das
sieht dort wie ein unerklärlicher fail-closed-Lauf aus. Nur per PID beenden.

---

## 5. Fallen, die schon Zeit gekostet haben

**Aus dem Modul selbst:**

- **Ein Wert-Import aus einem `"use client"`-Modul in eine Server Component** ergibt eine
  Client-Referenz statt des Werts → HTTP 500, und weder Build noch Typecheck noch Vitest finden es
  (unter Vitest ist `"use client"` ein wirkungsloser String). Passiert mit der Icon-Map; deshalb liegt
  sie jetzt in `core/shell/icons.ts` **ohne** `"use client"`. `_lib/av.ts` importiert `node:net` — ein
  `"use client"`-Import von dort zöge das ins Client-Bundle.
- **Ein Icon-Name muss Schlüssel der `ICONS`-Map sein**, nicht bloß ein existierender
  `@ant-design/icons`-Name. Sonst fällt der Eintrag **still** auf `AppstoreOutlined` zurück.
  `SuiteNav.test.tsx` prüft das jetzt gegen die echte Registry.
- **Zeitstempel sind Unix-SEKUNDEN** (`mode: "timestamp"`), nicht Millisekunden wie in `qr`. Ein
  Faktor-1000-Fehler wäre paritätsgrün.
- **Die Einheit gehört in den NAMEN**, nicht in einen Kommentar. Es gibt vier Größenlimits an vier
  Orten in drei Einheiten, mit zwei trügerischen Paaren: beide „500" unterscheiden sich um den Faktor
  1,048576 (MiB gegen MB), beide „100" um 4.857.600 Byte (clamd 100 MiB gegen Cloudflare 100 MB).
- **Drei Kappungsebenen für Uploads**, jede mit anderem Symptom: Server Actions 1 MB (HTTP 413),
  Next-Proxy 10 MiB (**still, kein Fehler**), Cloudflare Free 100 MB (Fehler vom Edge, **kein
  Container-Log**). Chunked umgeht alle drei.

**Aus dem Werkzeug:**

- **Sicherungskopien gehören ins Session-Scratchpad, NIEMALS nach `/tmp`.** In Welle 5 haben zwei
  Agenten unabhängig `/tmp/route.orig.ts` benutzt — bei elf gleichzeitigen Agenten ist der Name
  besetzt. Zweimal landete danach der Inhalt einer **fremden** Route in der eigenen Datei, und beide
  Male ist das **typecheck- und lint-grün**, solange beide Dateien für sich übersetzen. Aufgefallen
  ist es nur, weil die Tests der eigenen Route **reihenweise** fielen — und genau das ist auch die
  Prüfung, die der Koordinator vor dem Wellen-Commit schuldet: `pnpm vitest run` über die betroffenen
  Routenverzeichnisse. Ein `grep -n "^export async function"` über alle neuen Routen kostet zehn
  Sekunden und findet den **ganzen** Tausch (falsche Handler unter dem Pfad), aber eben nur den; eine
  teilweise überschriebene Datei sieht nur der Testlauf.
- **`git checkout -- <datei>` nimmt eine Mutationsprobe NICHT zurück** — es stellt HEAD her und
  löscht damit die eigene, noch uncommittete Arbeit. In Welle 6a hat sich ein Agent so seine fertige
  Implementierung gelöscht; bei einer **neuen** Datei hätte der Befehl gar nichts wiederhergestellt.
  Vor der ersten Mutation einmal ins Scratchpad sichern, von dort zurückspielen, mit `diff` belegen.
- **Playwright nicht laufen lassen, während du Dateien editierst.** HMR zieht die Änderung mitten in
  den Lauf und erzeugt Fehlschläge, die nicht reproduzierbar sind (einmal passiert, eine Stunde
  Sucherei).
- **`rtk pnpm …` kann an einem corepack-Deps-Check scheitern**, obwohl das Kommando selbst in Ordnung
  ist. Dann direkt `pnpm …` benutzen.
- **`pnpm build` legt unter `.next/standalone/src/` eine vollständige Kopie des Quellbaums ab**,
  Testdateien inbegriffen. `vitest.config.ts` schließt `**/.next/**` deshalb aus — wer den Eintrag
  entfernt, misst plötzlich doppelt.

---

## 6. Was du nicht anfasst

**Uncommittete Arbeit des Betreibers**, die über alle fünf Commits hinweg unangetastet geblieben ist:

- `src/app/not-found.tsx`, `.test.tsx`, `.module.css` (neu, untracked)
- `src/app/m/feedback/(admin)/layout.tsx` und `layout.test.tsx` (geändert)

Nicht committen, nicht „aufräumen", nicht in einen Wellen-Commit ziehen. Die Aufteilung ist seine
Entscheidung.

---

## 7. Zwei Riegel, die heute niemand prüfen kann

Beide sind gebaut, beide Mutationen bleiben grün, weil hinter den Layouts noch keine Seite steht. Die
Offenlegung samt Mutation steht am Ende von `e2e/files-hosts.spec.ts`:

1. **`(oeffentlich-share)/layout.tsx`** — `requireRolle("verwaltung")` → `"inbox"` gedreht macht
   `/s/<id>` auf dem Verwaltungs-Host zu 404 und auf der Inbox-Domain erreichbar. Also **gedruckte
   Freigabe-Links kaputt**. Fällt an **T35**.
2. **`(verwaltung)/layout.tsx`** — `requireFilesAccess()` entfernt öffnet die gesamte Verwaltung
   jedem angemeldeten Suite-Nutzer (das Modul ist `requiresAuth: false`, die Middleware gatet hier
   nicht). Fällt an **T35 oder T44**.

**Wenn du diese Tasks baust, schließt du die beiden Lücken mit.**

---

## 8. Offene Punkte, die nicht dir gehören

**Runbook-Eingaben** (der Integrations-Agent erhebt sie in Spec 2, nicht du): der Produktionsdump von
`easy-filesharing` samt `typeof()`-Messung, die real gesetzten `MAX_FILE_SIZE` / `MAX_EXPIRY_DAYS` /
`ALLOWED_MIME` / `RATE_LIMIT_PER_MIN` / `AV_*`, die clamd-Grenze im Sidecar, ob Cloudflare bei 100 MB
kappt, welche `start_period` clamd am Zielhost braucht, und ob clamd (uid 100) die von uid 1001
geschriebenen Blobs lesen kann.

**Betreiberfragen, die den Bau nicht blockieren:** ob nackte `/api/download/…`-Links im Umlauf sind
(bei ja gilt statt E4 (b) die Variante (c)), wie lange der Posteingang Dateien hält, ob die
Druckgröße der Aushänge mitwachsen soll.

---

## 9. Lokal starten

In `.env.local` ergänzen (fehlt dort noch):

```
SUITE_HOST_FILES=files.localtest.me,drop.localtest.me
FILES_MAX_DATEI_BYTES=12582912
FILES_AV_MAX_BYTES=12582912
FILES_MAX_ABLAUF_TAGE=7
```

Die drei Zahlen sind Pflicht, sobald ein Host gesetzt ist — sonst bricht der Boot ab (Absicht).
12 MiB ist kein Zufallswert: der Boot verlangt `FILES_CHUNK_BYTES` (4 MiB) `< FILES_MAX_DATEI_BYTES
<= FILES_AV_MAX_BYTES`, und ein Test braucht eine Datei über 10 MiB. Fake-Scanner: `pnpm dev:av`.

Stand heute liefern `/m/files` und `/m/files/u` bereits Antworten; die Verwaltungsseiten entstehen in
Welle 6.

---

## 10. Zustand am Übergabepunkt

```
typecheck  0 Fehler
lint       0 Fehler, 2 Warnungen (beide vorbestehend und fremd)
vitest     147 Dateien, 2581 Tests, alle grün
build      grün, alle zehn neuen Routen in der Routentabelle
playwright 69 passed
```

**Vom Koordinator selbst gemessen, nicht aus der Selbstauskunft der Agenten übernommen.** Dazu: alle
zehn Routen auf beiden Hosts abgerufen (`pnpm dev:av` + `next dev`), jede zusätzlich mit einer nicht
exportierten Methode gesondet — 405 beweist, dass das Modul aufgelöst und der Host-Rewrite gefeuert
hat, wo ein blankes 404 mehrdeutig wäre. **Kein einziges HTTP 500.**

Sechs Commits auf `feat/files-modul`, nichts gepusht.

Welle 5 lief mit 30 Agenten ohne Ausfall durch (der vorige Lauf hatte 15 von 50 am **Spend-Limit der
Organisation** verloren). Sieben der elf Tasks brauchten eine Nachbesserung, und **jeder einzelne
schwere Befund kam wieder aus einer Mutationsprobe, nicht aus einem roten Gate** — unter anderem war
die Client-Deklaration des MIME-Typs in keinem Test tragend, und `archiver` trägt Fehler eines
angehängten Quellstroms strukturell **nicht** nach `archiv.on("error")` weiter
(`archiver-utils@5.0.2/index.js:86` hängt jeden Strom über `pipe()` an). Beide ZIP-Wege horchen
deshalb jetzt am Quellstrom selbst.

Wenn dir das Spend-Limit trifft: die Review-Befunde stehen im Ergebnis jedes Wellenlaufs unter
`review_befunde`, du kannst sie ohne Agenten abarbeiten. Und **prüfe nach jedem Lauf
`umgesetzt.length` gegen die Task-Liste** — das Script filtert tote Agenten still weg, und ein nie
gebauter Task färbt kein Gate rot.
