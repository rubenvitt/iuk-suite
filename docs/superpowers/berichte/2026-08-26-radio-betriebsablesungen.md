# Radio-Betrieb — die Ablesungen (Aufgabe G7)

Planteil 5 von 5, Aufgabe G7. Diese Datei ist **kein Bericht über einen Bau**, sondern das
**verfolgte Gefäß** für drei Werte, die erst der laufende Server, der erste Deploy und ein echtes
Gerät hergeben — ⬜ **G-L5**, ⬜ **G-L6**, ⬜ **G-L7**. **Spec 2 (Cutover-Runbook) füllt sie.**
In dieser Aufgabe entstand **kein Modul-Code**; der einzige Quelltext ist ein
Abwesenheitsfall samt seinem Wurzelanker (`src/app/m/radio/_lib/keine-pwa.test.ts:433-459`).

⛔ **Warum diese Datei hier liegt und nicht im SDD-Arbeitsordner:** `.gitignore:17` ignoriert
`.superpowers/`. Abnahme-Messungen, die dort stehen, sind nach dem Merge weg — die Gedächtnisnotiz
„Beleg nicht in der Kladde" hält genau diesen Fehler fest, und `.superpowers/sdd/planteil5/progress.md`
führt ihn als Ruling **R-G2-1**. Alles, was Spec 2 später braucht, gehört deshalb in `docs/`.

⛔ **Die eiserne Regel gilt für jede Zeile unten: wo ein Wert erst der Server hergibt, steht eine
benannte Leerstelle — niemals eine plausibel aussehende Erfindung.** Eine erfundene Antwortstruktur
in einem Runbook ist die teuerste Sorte Lüge: sie wird am Cutover-Abend gegen die echte gehalten,
und wer sie einmal geglaubt hat, glaubt sie auch, wenn sie abweicht.

⚠️ Der Dateiname trägt den **2026-08-26** (das Plandatum von Planteil 5); **gebaut wurde sie am
2026-08-27**. Der Name bleibt, weil `briefs/G7.md` und der Plan ihn wörtlich vorschreiben.

---

## 1. Die drei Leerstellen

⬜ **Alle drei sind unausgefüllt.** Wer eine füllt, trägt **Datum, Werkzeug und den Wortlaut**
ein — nicht die Zusammenfassung.

### ⬜ G-L5 (= L5) — welches Feld der Antwort trägt den Modulnamen, welches belegt den DB-Zugriff

| | |
|---|---|
| **Wann** | vor **Cut 19**, am **laufenden Container** |
| **Handgriff** | `curl -s -H "Host: radio.iuk-ue.de" http://127.0.0.1:3000/api/health/radio` |
| **Einzutragen** | der **Rumpf wörtlich**, plus der Statuscode (`curl -s -o /dev/null -w '%{http_code}'`) |

**Erwartet, abgeleitet aus dem Quelltext — nicht abgelesen:**

* `checkModuleHealth` liefert `{ status: "ok", module: key }` (`src/core/health/index.ts:10`),
  im Fehlerzweig `{ status: "error", module: key, error }` (`:12`). Die Funktion ist
  modul-agnostisch (`src/core/health/index.ts:1-16`).
* `revision` kommt **nicht** von dort, sondern erst aus dem Handler
  (`src/app/api/health/[modul]/route.ts:23-26`).
* Der Statuscode ist **200** bei `status === "ok"`, sonst **503** (ebendort `:25`).

⛔ **Der Rumpf im Betrieb ist damit NICHT abgelesen, und die Aufteilung der Felder ist eine
Ableitung aus zwei Dateien, keine Messung.** Das ist der ganze Grund, warum G-L5 offen bleibt.

⬜ **Abgelesener Rumpf:** *(leer — Spec 2 trägt ein)*
⬜ **Abgelesener Statuscode:** *(leer)*
⬜ **Datum / Werkzeugversion / Container-Revision:** *(leer)*

⚠️ **Die Falle beim Ablesen, damit sie niemand baut:** `/api/health` und `/api/health/radio` sind
**hostunabhängig** erreichbar — `src/core/routing.ts:12` führt `/api/health` in `PASSTHROUGH`.
`/api/health/radio` antwortet also auch auf `iuk-ue.de`. **Trotzdem ist der radio-Host abzufragen**,
denn nur das prüft den Router mit (§7.2.1, `Spec:5791-5796`).

### ⬜ G-L6 (= L11) — was `radio.iuk-ue.de/manifest.webmanifest` **tatsächlich** liefert

| | |
|---|---|
| **Wann** | **erster Deploy** |
| **Handgriff** | `curl -si https://radio.iuk-ue.de/manifest.webmanifest` |
| **Einzutragen** | **Statuscode und Rumpf wörtlich** — Portal-Fallback, 404 oder etwas Drittes |

⛔ **Hier steht bewusst KEINE Erwartung.** Ein geratener Wert wäre genau die Zusage, die V8/R36 aus
Spec 2 verbietet, und `briefs/KOPF.md:414` sagt es wörtlich: „keine — ein geratener Wert wäre genau
die Zusage, die V8/R36 verbietet".

**Was das Repo dazu schon beweist, und was nicht:** `radio` bewirbt **kategorisch keine PWA** —
belegt durch den fünften Quelltext-Scan (`src/app/m/radio/_lib/keine-pwa.test.ts`, Fall
`radio bewirbt keine PWA` und Fall `es gibt kein manifest.webmanifest-Verzeichnis unter radio`).
⚠️ **Das ist die Bauform-Hälfte.** Was der Server unter dem Pfad antwortet, entscheidet der Router
und der Portal-Fallback — nicht das Modul. Deshalb bleibt G-L6 offen.

⬜ **Abgelesener Statuscode:** *(leer)*
⬜ **Abgelesene Kopfzeilen und Rumpf:** *(leer)*
⬜ **Datum:** *(leer)*

### ⬜ G-L7 (= L12) — der Ablesepunkt in den Entwicklerwerkzeugen nach dem Abräumen

| | |
|---|---|
| **Wann** | §4.7.2 **Hälfte 2**, an einem **echten Gerät** — „`curl` hat keinen Service Worker" |
| **Handgriff** | DevTools → **Application** → **Service Workers** und **Cache Storage**, nach einmaligem Neuladen des Geräts, das den Alt-Kiosk kannte |
| **Einzutragen** | die Beschreibung des Screenshots **plus zwei Listen**: die registrierten Worker und die Cache-Namen |

⬜ **Registrierte Service Worker nach dem Abräumen:** *(leer)*
⬜ **Cache-Namen nach dem Abräumen:** *(leer)*
⬜ **Gerät / Browser / Datum:** *(leer)*

⚠️ **Was man erwarten darf und was nicht** (`Spec:5577`, `:5679-5684`): kein dauerhaft veraltetes HTML
(Navigationen sind network-first, `Spec:5565`), **aber** der erste Seitenaufruf nach dem Umschwenk kann noch vom
alten Worker bedient werden — Worst Case **eine** veraltete Seitenansicht je Gerät, danach ist der
Origin frei. ⛔ **Wer mehr verspricht, verspricht etwas Ungemessenes.**

---

## 2. Die zwei Runbook-Zusagen, ausgeschrieben

Sie wandern nach Spec 2. Sie stehen **hier**, damit sie einen Ort haben, der **älter** ist als das
Runbook — und einen verfolgten.

### 2.1 Der Monitor fragt `https://radio.iuk-ue.de/api/health/radio` ab. **Nie `/api/health`.**

⛔ **Der Grund ist keine Vorliebe.** `src/app/api/health/route.ts` ist **drei Zeilen** und liefert
konstant `{ status: "ok", timestamp }` — **kein Modul, kein Parameter, keine Datenbank**. Nach dem
Cutover antwortet `radio.iuk-ue.de/api/health` also weiter `ok`, **ohne über `radio` irgendetwas zu
sagen** (§7.2.1, `Spec:5779-5783`; Analyse-Falle 29, `docs/radio-portierung-analyse.md:1675-1683`, dort `:1677-1683`).

⛔ **200 heißt „das Modul ist im Image", 503 heißt „falsches Image".** `checkModuleHealth` ruft
`getModule(key)` als **erstes**, und `getModule` wirft bei unbekanntem Key — der Kommentar im
Quelltext sagt es selbst (`src/core/health/index.ts:7`: „throws on unknown; not yet opened, so
nothing to close"). Bis der Registry-Eintrag existiert, antwortet `/api/health/radio` also **503**.
Heute **steht er** (`src/core/registry.ts:197-199`, `key: "radio"`), also ist die Prüfung ab jetzt
eine Aussage über das **Image**, nicht über den Plan (§7.2.4, `Spec:5838-5849`).

**Der Handgriff vor dem Umschwenk:**

```bash
curl -s -o /dev/null -w '%{http_code}\n' https://iuk-ue.de/api/health/radio
```

⚠️ **Und die Zusage an den Monitor lautet trotzdem auf den radio-Host.** Beide Routen sind
hostunabhängig (`src/core/routing.ts:12`, `PASSTHROUGH`) — `/api/health/radio` antwortet auch auf
`iuk-ue.de`. Für einen Monitor ist das bequem; für den Cutover ist es wichtig, dass er **den
radio-Host** abfragt, **weil nur das den Router mitprüft**.

⚠️ **`revision` liest der Rollout aus dieser Antwort**, und aus keiner anderen: die parameterfreie
Route kann Next **prerendern**, dort stünde dann der Bauzeit-Wert `unbekannt` in einer Antwort, die
zur Laufzeit nie wieder entsteht. Der Handler schreibt diese Begründung selbst aus
(`src/app/api/health/[modul]/route.ts:7-22`).

### 2.2 Health ist grün gegen eine frisch angelegte, **leere** `radio.db`

⛔ **Analyse-Falle 29, und sie ist der Grund für den ganzen Abschnitt.** `checkModuleHealth` tut
genau drei Dinge (`src/core/health/index.ts:7-9`): `getModule(key)`,
`openModuleDatabase(moduleDbPath(key))`, `SELECT 1`. **`openModuleDatabase` legt das Verzeichnis bei
Bedarf neu an, und better-sqlite3 legt die Datei an, wenn sie fehlt.** Ein vertipptes `DATA_DIR`
oder ein nicht gemountetes Volume ergibt damit eine **nagelneue, leere `radio.db`, auf der
`SELECT 1` klaglos gelingt — health grün, null Geräte**
(`docs/radio-portierung-analyse.md:1685-1696`).

⛔ **Der Gegenzug ist kein zweiter Endpunkt, sondern ein Runbook-Schritt.** Ein zählender
HTTP-Endpunkt wäre ein unauthentifizierter Zähler über den Gerätebestand — nicht schlimm, aber auch
nicht nötig, weil die Freigabe nach dem Cutover ohnehin ein Mensch mit `sqlite3` erteilt
(§7.2.3, `Spec:5822-5824`).

⛔ **DIE FREIGABE BRAUCHT DIE ZÄHLUNG, NIE `status: "ok"`.**

#### Die verbindliche Liste: **fünf** Paritäts-Sollwerte, **nicht sechs**

⛔ **Die Zählreihe „sechs" beschreibt die QUELLseite, und der Weg vom Beschreiben zum Anweisen war
der Fehler.** `Spec:5828-5829` sagt beschreibend „die erste liefert **sechs** Zahlen" — die Reihe der
**Analyse** (`docs/radio-portierung-analyse.md:752-753`) — und reicht die Entscheidung ausdrücklich
weiter: `Spec:5830`, „**die verbindliche Liste fuehrt das Import-Kapitel**". Plan und Briefe machten
daraus eine Anweisung; sie sind am 2026-08-27 auf **fünf** berichtigt (Ruling **R-G7**).

⛔ **Gegen das **Ziel** gefahren scheitert diese Abfrage.** `api_tokens` existiert im Suite-Schema
**nicht** — gemessen: `grep -n "sqliteTable(" src/app/m/radio/_db/schema.ts` liefert `devices`,
`software_versions`, `users`, `device_events`, `zugangscodes`, `loans` und **kein** `api_tokens`.
Die Spec selbst löst den Widerspruch auf, in §6.5 (`Spec:5361-5370`), wörtlich:

> „`api_tokens` darf **nicht** in den Paritaetscheck: ein Paritaetscheck vergleicht `SELECT COUNT(*)`
> auf **beiden** Seiten, und auf der Zielseite gibt es die Tabelle nicht — die Abfrage scheitert
> nicht mit ‚ungleich', sondern mit `no such table`, also mit einem Abbruch mitten im Cutover, zu
> dem Schritt und Uhrzeit im Runbook stehen. … Aus sechs Paritaets-Sollwerten werden damit
> **fuenf**: `devices`, `software_versions`, `users`, `device_events`, `loans`."

Dasselbe steht ein drittes Mal, aus einem unabhängigen Lauf:
`docs/superpowers/berichte/2026-08-21-radio-import-abnahme.md:181-182` — „`api_tokens` steht in
dieser Abfrage NICHT … Wer sie mitschreibt, bekommt `no such table: api_tokens` und hält es für
einen Fehler."

**Verbindlich für das Runbook:**

| | Tabelle | Quelle | Ziel | verglichen |
|---|---|---|---|---|
| 1 | `devices` | ✅ | ✅ | **ja** |
| 2 | `software_versions` | ✅ | ✅ | **ja** |
| 3 | `users` | ✅ | ✅ | **ja** |
| 4 | `device_events` | ✅ | ✅ | **ja** |
| 5 | `loans` | ✅ | ✅ | **ja** |
| — | `api_tokens` | ✅ | ⛔ **existiert nicht** | **nein** — reine **Protokollzeile** auf der Quelle (§2.10 / Entscheidung 13) |
| — | `zugangscodes` | ⛔ existiert nicht | ✅ | **nein** — nicht Teil des Imports (`Spec:1675-1680`); der erste Satz Codes entsteht **in der Suite** |

⚠️ **`api_tokens` fällt nicht weg, sondern wechselt die Rolle:** die Zeilenzahl der **Quell**tabelle
wird beim Snapshot **protokolliert** („so viele Tokens waren zum Freeze aktiv"), damit die Löschung
nachvollziehbar ist — **aber nicht verglichen** (`Spec:5366-5370`).

#### Der Handgriff, und **warum ohne `-readonly`** (NT8)

⛔ **`sqlite3 -readonly` scheitert gegen eine frisch importierte `radio.db`.** Sie liegt im
**WAL-Modus** und trägt noch **kein `-shm`**, und ein Readonly-Handle darf das Shared-Memory-File
nicht anlegen. Die Meldung lautet
`Parse error in 3rd command line argument: unable to open database file (14)` — **sie sieht wie ein
Importfehler aus und ist keiner**
(NT8, `docs/superpowers/plans/2026-08-18-radio-ausfuehrungsplan.md:288`; die Messreihe steht in
`docs/superpowers/berichte/2026-08-21-radio-import-abnahme.md:80-130`).

⚠️ **Die naheliegende Erstdiagnose ist gemessen widerlegt:** es scheitert **auch einzeilig**, auch
mit absolutem Pfad, auch über `file:?mode=ro`. Der scheinbar funktionierende Einzeiler lief,
**nachdem** ein vorheriger Schreibzugriff die `-shm` angelegt hatte.

```bash
# Gegenzaehlung im ZIEL. KEIN -readonly: radio.db liegt im WAL-Modus und traegt
# nach dem Import noch keine -shm; ein Readonly-Handle koennte sie nicht anlegen
# und braeche mit "unable to open database file (14)" ab. Die Datei gehoert uns,
# das Anlegen der -shm ist harmlos.
sqlite3 "$DATA_DIR/radio.db" "select 'devices', count(*) from devices union all select 'software_versions', count(*) from software_versions union all select 'users', count(*) from users union all select 'device_events', count(*) from device_events union all select 'loans', count(*) from loans;"
```

⚠️ **Für die QUELLE gilt das Gegenteil:** dort bleibt der **lesende** Zugriff Pflicht, und er
funktioniert, weil sie im `delete`-Modus liegt. ⛔ **Diese Ablesung ist datiert** — ein Update von
`radio-admin` genügt, sie umzustoßen. **Am Freeze-Abend ist `pragma journal_mode;` der Quelle neu zu
messen**, bevor `-readonly` benutzt wird (Auflage aus
`docs/superpowers/berichte/2026-08-21-radio-import-abnahme.md:155`).

⬜ **Die fünf abgelesenen Zahlen, Quelle:** *(leer — Spec 2 trägt ein)*
⬜ **Die fünf abgelesenen Zahlen, Ziel:** *(leer)*
⬜ **`SELECT COUNT(*) FROM api_tokens;` auf der Quelle (Protokollzeile):** *(leer)*

---

## 3. Der Container-Healthcheck bleibt unverändert

`compose.yaml:140-145` prüft `http://127.0.0.1:3000/api/health/portal` (die Zeile mit der URL ist
`:141`). **Das bleibt so, und es ist richtig:** der Healthcheck entscheidet über Container-Neustart
und `depends_on`; er beantwortet „ist der Prozess ansprechbar", nicht „ist `radio` in Ordnung".
Würde er auf `radio` umgestellt, risse ein Datenproblem **eines einzelnen Moduls die ganze Suite**
in den Neustart (§7.2.2, `Spec:5799-5804`).

⛔ **Die Kehrseite, und sie gehört ins Runbook:** ein kaputtes `radio.db` lässt den Container
„healthy". **Es gibt in dieser Aufstellung keinen Weg, auf dem der Zustand von `radio` von allein
auffällt** — genau deshalb ist der externe Monitor aus Abschnitt 2.1 **nicht optional, sondern der
einzige Melder.**

**Kein Eintrag in `compose.yaml` wird für `radio` gebraucht** — kein zweiter Healthcheck, kein neues
Volume (eine Datei `radio.db` unter `DATA_DIR`, gesetzter Zuschnitt), kein neuer Service. Einzige
compose-Berührung ist `SUITE_TRAEFIK_RULE`, und die lebt in der `.env`.

---

## 4. Was es **nicht** gibt, und warum

| Was | Warum nicht |
|---|---|
| `src/app/api/health/radio/route.ts` | ⛔ **eine zweite Wahrheit über denselben Pfad.** Der `[modul]`-Handler beantwortet `/api/health/radio` bereits (`src/app/api/health/[modul]/route.ts:5-6`), `checkModuleHealth` ist modul-agnostisch (`src/core/health/index.ts:1-16`), `radio` steht in der Registry (`src/core/registry.ts:197-199`). Und die zwei wären **nicht gleichwertig**: nur der generische trägt `revision` (`:23-26`). **Zugesagt** durch `src/app/m/radio/_lib/keine-pwa.test.ts:433-459` — die **erste** Zusicherung dort pinnt die Wurzel `src/app/api/health/` selbst (der `[modul]`-Handler muss dort liegen), weil eine falsch geschriebene Wurzel den Fall sonst **für immer grün** liesse (gemessen, `REVIEW-G7` Fund W1) |
| ein radio-Fall in `src/core/health/index.test.ts` | die Funktion ist modul-agnostisch; ein Test je Modul wäre eine Liste, die das nächste Modul vergisst (`Spec:5848-5849`) |
| ein zweiter, **zählender** HTTP-Endpunkt | siehe 2.2 — der Gegenzug ist ein Runbook-Schritt, kein Code |

**Der Wirknachweis im Lauf** ist **nicht** diese Datei und **nicht** der Abwesenheitsfall, sondern
der e2e-Fall 11 aus Aufgabe **T4** (`e2e/radio-hosts.spec.ts`,
„`/api/health/radio` nennt Modul und Revision"). ⛔ Ohne ihn stünde die Zusage ohne Messung.

---

## 5. Abweichungen von den Ankern der Vorlagen — gemessen am 2026-08-27

Sie sind hier benannt, damit niemand sie für übersehen hält. ⛔ **Keine davon wurde in Spec oder
Analyse zurückgeschrieben** — eine Abweichung wird belegt und geführt, nicht in die Vorlage
zurückkorrigiert.

| Anker der Vorlage | Gemessen | Folge |
|---|---|---|
| `Spec:5826-5829`: „die erste liefert **sechs** Zahlen" — Brief und Plan machten daraus „die Freigabe braucht die **sechs** `COUNT(*)`" | im Ziel existieren **fünf** dieser Tabellen; `api_tokens` fehlt im Schema | ⛔ **blockierend** — sechs gegen das Ziel gefahren heißt `no such table: api_tokens` mitten im Cutover. Aufgelöst nach `Spec:5361-5370` (fünf Sollwerte + eine Protokollzeile). ⛔ **Plan und Briefe sind am 2026-08-27 auf fünf berichtigt** (Ruling **R-G7**), die Spec **nicht** (Hausform R-G1-1) — sie deckt sich selbst: `Spec:5830` sagt „**die verbindliche Liste fuehrt das Import-Kapitel**" |
| `briefs/G7.md`: `compose.yaml:141-146` — `Spec:5799` sagt `:140-144` | der `healthcheck`-Block steht auf `:140-145` (`healthcheck:` auf `:140`, `start_period` auf `:145`), die URL-Zeile auf `:141` | Anker berichtigt zitiert; **beide** Vorlagen weichen ab, in verschiedene Richtungen |
| `Spec:5785-5786`: „`src/app/api/health/[modul]/route.ts:27-30`" | die Datei hat **27** Zeilen; die Statusverzweigung steht auf `:25` | Anker berichtigt zitiert |
| `Spec:5815`: „`src/core/health/index.ts:4-17`" | die Datei hat **16** Zeilen; die drei Schritte stehen auf `:7-9` | Anker berichtigt zitiert |
| `Spec:5829`: „`docs/radio-portierung-analyse.md:751-752`" | die sechs Sollwerte stehen auf `:752-753` | Anker berichtigt zitiert |
| `Spec:5779`: „`src/app/api/health/route.ts` ist **zwei** Zeilen" | die Datei hat **drei** Zeilen | rein zählend, ohne Wirkung auf die Aussage |
