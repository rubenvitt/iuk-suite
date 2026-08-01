# Übergabe — Modul `files` (Phase 4), Stand 2026-08-01

Du übernimmst den Bau des Moduls `files` in der iuk-suite. **25 von 51 Tasks sind fertig und
committet, 26 stehen aus.** Dieses Dokument sagt dir, was du zuerst liest, was schon entschieden ist,
wie hier gearbeitet wird, und welche Fallen die bisherigen Wellen Zeit gekostet haben.

Branch: **`feat/files-modul`** (fünf Commits, alle Gates grün).

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
| **5** | T26, T27, T28, T29, T30, T31, T32, T33, T51, T34, T49 (11) | Byte-Wege und Actions: Chunk-Upload, Verify, QR-Routen, Zugangslinks, Download, Vorschau, ZIP | ja |
| **6a** | T35, T37, T38, T39, T50 (5) | Oberflächen I: `/shares/neu`, Shares-Actions, `/u/<token>`, `/zugangslinks`, Budget/Wettlauf | ja |
| **6b** | T36 (1) | Freigaben-Übersicht (hängt an T37) | ja |
| **7** | T40, T41, T42, T43 (4) | Oberflächen II: `/s/<id>` mit Passwort-Gate, Detailseite, Bearbeiten, `/posteingang` | ja |
| **8a** | T44, T45, T46, T48 (4) | Host-Abnahme, AV-Wiederholung, Aufräum-Timer, Mobil-Abnahme | ja |
| **8b** | T47 (1) | fail-closed-Abnahme über alle fünf Lesewege (hängt an T45) | ja |

Danach ist **Spec 1 fertig**. Spec 2 (Import beider Quellen, Generalprobe, zwei Cutover) ist ein
eigener Zyklus und **nicht** dein Auftrag.

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
vitest     135 Dateien, 2223 Tests, alle grün
build      grün, /m/files und /m/files/u in der Routentabelle
```

Fünf Commits auf `feat/files-modul`, nichts gepusht. Der letzte Lauf endete am **Spend-Limit der
Organisation** — 15 von 50 Agenten starben daran, die betroffenen Nachbesserungen habe ich von Hand
erledigt und per Mutation belegt. Wenn dir dasselbe passiert: die Review-Befunde stehen im Ergebnis
jedes Wellenlaufs unter `review_befunde`, du kannst sie ohne Agenten abarbeiten.
