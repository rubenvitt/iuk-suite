# Modul `radio` — Portierungsanalyse & offene Entscheidungen

> ⛔ **VOR DEM LESEN VON KAPITEL 3:** die acht Betreiberfragen sind am 2026-08-17 beantwortet worden
> (Kapitel 6, Abschnitt „Beantwortet am 2026-08-17"). Eine Antwort — **„ist kein Tablet"** — kippt eine
> Grundannahme: es gibt kein festes Kiosk-Gerät, also kein Geräte-Token-Enrollment. **Entscheidung 1 und
> Entscheidung 5 sind damit überholt** und im Text als ⛔ markiert. Wer sie ungelesen umsetzt, baut das
> teuerste Bauteil des Moduls, das niemand braucht.

**Stand 2026-08-17. Das ist noch keine Spec.** Es ist die Vorarbeit dafür: was `radio-admin` und
`radio-inventar` heute tun, was der Cutover auf **einen** Host erzwingt, welche Fallen kein Gate
findet — und die Entscheidungen, die vor der Spec fallen müssen.

**Kennzahlen dieses Dokuments:** 77 Rohbefunde aus sechs unabhängigen Analysen, zusammengeführt zu
**16 Entscheidungen** (10 blockierend) · **25 1:1-Pflichten** · **31 Einträge in Kapitel 5**, davon
**29 Fallen, die kein Gate findet** plus ein Methoden- (Nr. 8) und ein Doku-Hinweis (Nr. 27) ·
**8 Betreiberfragen** (7 blockierend) · **52 Messpunkte, davon 49 offen**. Der Skeptiker-Durchgang hat
**keinen** Rohbefund vollständig widerlegt und **33 präzisiert** — wer von der
`lagerbuch`-Analyse mit ihren 35 widerlegten Rohbefunden herkommt, sucht diese Zeile: es gibt hier
keine Widerlegung, aber ein Drittel aller Befunde trägt eine korrigierte Fassung, und in einem
Dutzend Fällen ist eine **Teilaussage** hart gefallen. Beides steht in Kapitel 8.

⚠️ **Gestrichen: die frühere Zeile „37 Befunde blockierend".** Sie bezog sich auf die 77 Rohbefunde, die
dieses Dokument nirgends einzeln mit Blockierstatus auflistet — nicht nachprüfbar und damit als
Steuerungsgröße unbrauchbar (Kapitel 8, A2 Nr. 16). **Nachrechenbar sind die Zahlen oben:** zehn
blockierende Entscheidungen (Kapitel 3) und sieben blockierende Betreiberfragen (Kapitel 6) — im
Fließtext beide mit 🔴 markiert.

⚠️ **Stand nach den Betreiberantworten vom 2026-08-17:** `grep -c '^### 🔴'` liefert **15**, nicht mehr
17 — Entscheidung 1 und Entscheidung 5 tragen jetzt ⛔ statt 🔴, weil sie überholt sind
(`grep -c '^### ⛔'` liefert **2**). Die sieben blockierenden Betreiberfragen behalten ihr 🔴, sind
aber **beantwortet**; die Markierung sagt „blockiert die Spec", nicht „unbeantwortet". Offen bleibt
**eine** neue Entscheidung, die aus Antwort 5 entsteht: Lebensdauer und Widerrufbarkeit des
Ausleih-Codes (Kapitel 6, Kasten).

## 1. Zuschnitt — die sechs Betreiberentscheidungen, die gesetzt sind

1. **Ein** Prod-Host `radio.iuk-ue.de`: Kiosk an `/`, Verwaltung an `/admin`.
2. Alt-Host `radio-admin.iuk-ue.de` bekommt einen pfaderhaltenden Traefik-Redirect auf
   `radio.iuk-ue.de/admin`, danach abgestellt.
3. Feature-Freeze beider Alt-Apps vereinbart.
4. **Kein externer Konsument** der öffentlichen Loan-/Device-API — die Auflage „API-Tokens 1:1 wegen
   externer Clients" ist gegenstandslos. ⚠️ **Im Wortlaut trifft das nicht zu:** der Kiosk *ist* der
   Konsument, über HTTP, mit genau diesen Tokens (Befund 4 in Kapitel 2). Die Auflage fällt, der Pfad
   nicht.
5. Der Kiosk liest heute schon aus radio-admin; Arbeitsannahme: der Postgres trägt keinen aktuellen
   Bestand. ⚠️ **Für den Bestand ist die Annahme aus dem eingefrorenen Quelltext ABGELEITET, nicht am
   Prod-Postgres gezählt** (Kapitel 4, Pflicht 19: fünf Prisma-Migrationen, Kopfkommentar,
   Durchlesepfade). Falle 8 sagt im selben Dokument, warum die Ableitung die Grundwahrheit **nicht**
   ersetzt: „aus dem Repository lässt sich der Prod-Tabellenbestand grundsätzlich NICHT ableiten —
   `pg_tables` ist die einzige verlässliche Quelle". Die Zählungen aus Kapitel 7, Nr. 8–14 bleiben
   **Runbook-Pflicht vor dem Löschen des Volumes**. Zu weit gefasst war die Annahme ohnehin:
   `AdminUser` sind echte Zeilen.
6. Der Kiosk bleibt in Scope, samt Geräte-Token-Enrollment. ⚠️ **Es gibt heute kein Enrollment**
   (Befund 3 in Kapitel 2).

### Freeze-SHAs und Belegbasis

| Alt-App | Freeze | Aufbau | Datenbank |
|---|---|---|---|
| `radio-admin` (Verwaltung) | `265abd5` | Workspace `client`/`server`/`shared`, Hono + Vite-SPA + antd 5 | SQLite, `DATABASE_PATH=/data/data.sqlite` |
| `radio-inventar` (Kiosk) | `f883ec4` | `apps/backend` (**NestJS**) / `apps/frontend` (Radix + Tailwind + lucide) / `packages/shared` | Postgres 16 im eigenen Container |

Ziel ist `iuk-suite`: Next.js 16 (App Router, RSC), Ant Design **6.5.3** (gemessen), Drizzle +
better-sqlite3, Auth.js v5 gegen Pocket ID, Vitest + Playwright, **eine SQLite-Datei je Modul**.

**Nicht als Quelle verwenden:** `radio-admin/data/data.sqlite` und `radio-admin/server/data/data.sqlite`
(je 48 KB, gitignoriert, vorbaselinig, alle Tabellen leer — Kapitel 6, Frage 2). Wer sie als Schema-
oder Bestandsquelle nimmt, misst das Falsche.

### Verfahren

Sechs unabhängige Analysen — **Datenmodell** (`radio-admin`) · **Kiosk-Fachlichkeit und
Postgres-Bestand** · **Auth heute in beiden Alt-Apps** · **Geräte-Enrollment und Host-Riegel** ·
**Stack-Sprung und die zwölf Fallen** · **Import, Cutover, Abbau** — jede mit einer adversarischen
Gegenprüfung, die jeden Beleg nachgeschlagen hat. **Die Urteile des Skeptikers binden:** wo eine
Fassung präzisiert wurde, steht in den Kapiteln 2 bis 7 die **korrigierte** Fassung samt der
korrigierten Zeilennummern; die alte Fassung steht zusätzlich in Kapitel 8.

**Zwei Widersprüche zwischen Analysen sind nicht still aufgelöst,** sondern als Entscheidung bzw.
Betreiberfrage markiert (Entscheidung 1 und 2, Frage 1). **Zwei verschiedene Zahlen zur selben Sache
sind ein Befund, keine Redaktion** — siehe Kapitel 8.

**Precedence `lagerbuch` (produktiv):** ein Host, zwei Auth-Welten — `/helfer` login-frei mit eigener
`jose`-Sitzung, `/verwaltung` mit Suite-SSO. `registry.shell` packt NICHTS ein;
`src/core/shell/Shell.tsx` ist eine Komponente mit `variant`-Prop, und
`src/app/m/lagerbuch/layout.tsx` rendert bewusst keine Shell. `requiresAuth: false`, Riegel in
Layouts UND Actions UND jedem Route Handler unter `api/`.

---

## 2. Die Befunde mit der größten Reichweite

Fünf Befunde. Das Kapitel für den, der keine Zeit hat. Alle fünf stehen in korrigierter Fassung, und
alle fünf haben entweder **Datenwirkung** oder **erzwingen eine Reihenfolge**. Vier blockieren die
Spec; **Befund 1 blockiert den Import** und die Spec nur unter der Bedingung aus Kapitel 6, Frage 4.

### 1. Millisekunden gegen Sekunden: der Faktor-1000-Fehler ist paritätsgrün UND löscht die Leihhistorie

*(Zusammenführung von `RA-DM-01` und `R-01`; beide präzisiert. Getrennt sind es zwei mittlere
Befunde, zusammen ist es der wichtigste des Dokuments.)*

**ALLE** Zeitstempel-Spalten in `radio-admin` sind epoch-**Millisekunden**, gemessen an jedem
einzelnen Schreibpfad: `devices.created_at/updated_at`
(`radio-admin/server/src/repos/deviceRepo.ts:13`, `:78`), `device_events.changed_at`
(`deviceRepo.ts:230`), `software_versions.created_at`
(`radio-admin/server/src/repos/softwareVersionRepo.ts:36`, `:53`),
`api_tokens.created_at/last_used_at/revoked_at`
(`radio-admin/server/src/repos/apiTokenRepo.ts:49`, `:71`, `:72`, `:96`), `users.last_seen_at`
(`radio-admin/server/src/repos/userRepo.ts:12`), `loans.borrowed_at/returned_at/created_at/updated_at`
(`radio-admin/server/src/repos/loanRepo.ts:75`, `:104`). Nur für `loans` steht es im Schema
(`radio-admin/server/src/db/schema.ts:103-104`: „`borrowed_at`/`returned_at` are epoch-ms"), für alle
anderen Tabellen **nirgends** — allein `Date.now()` belegt es. Gegenprobe:
`rg -n "/ *1000|\* *1000" server/src shared/src --glob '!*.test.ts'` liefert **zwei** Treffer,
`retentionService.ts:11` (`DAY_MS`) und `auth/middleware.ts:24` (JWT-`exp`) — **kein**
Spaltenschreibpfad.

Die Suite fährt die andere Einheit: `integer(mode: "timestamp")` speichert Unix-**Sekunden**, und
`iuk-suite/scripts/import/portal.ts:66-71` trägt dafür schon eine `tsSeconds()`-Normalisierung mit der
Begründung, sonst würden „faithful imports fail parity purely on precision".

**Zwei Schäden, beide unsichtbar für ein Gate.**

*(a) Paritätsgrün.* `iuk-suite/scripts/import/parity.ts:43-56` vergleicht Multimengen von
Zeilen-Hashes, und `portal.ts:73-76` schreibt selbst hin, dass **beide Paritäts-Arme aus derselben
Mapping-Funktion** ableiten: ein konsistenter Faktor-1000-Fehler hasht auf beiden Seiten gleich.
`iuk-suite/docs/runbooks/lagerbuch-cutover.md:411` sagt es unabhängig davon in einem Satz:
„⚠️ Ein Faktor-1000-Fehler ist paritätsgrün."

*(b) Datenvernichtung durch den Boot-Purge.* `radio-admin/server/src/index.ts:35` ruft
`startRetentionSchedule`; `radio-admin/server/src/services/retentionService.ts:47` führt `purge()`
**sofort** aus, **vor** dem Tagestimer — der Quellkommentar auf `:29-30` nennt als Anlass wörtlich
„clears any backlog, e.g. straight after a data migration". Der Cutoff ist `now` minus zwei Monate
(`retentionService.ts:9` `HISTORY_RETENTION_MONTHS = 2`, `:17-21`), gelöscht wird per
`loanRepo.ts:191-196` (`DELETE FROM loans WHERE returned_at IS NOT NULL AND returned_at < cutoffMs`).
Ein Importer, der `returned_at` in Sekunden schreibt, legt jeden Wert ins Jahr 1970, also weit unter
den Cutoff — und der **nächste Boot** löscht die komplette abgeschlossene Leihhistorie. Aktive Leihen
(`returned_at IS NULL`) bleiben. Der Import-Test bleibt grün, weil die Zeilen zum Testzeitpunkt
existieren.

⚠️ **Reichweite, präzisiert:** *Bewiesen* ist dieser Schaden für einen Import in **radio-admins eigene
SQLite** — jeder Beleg der Purge-Mechanik ist radio-admin-Code. Für die Suite ist der Schaden
identisch, **aber nur, wenn die 2-Monats-Retention mitportiert wird**. Das ist eine Annahme, keine
Messung (Kapitel 7) und zugleich eine Betreiberfrage (Kapitel 6, Frage 4).

Der Import-Normalisierer ist in beiden Fällen offen:
`radio-admin/server/src/import/commit-service.ts:45-47` nimmt jede numerische Zeichenkette nur mit
`Number.isFinite`, **ohne Plausibilitätsspanne** — `"1700000000"` (Sekunden) wird wörtlich übernommen.

*Kein Gate:* Parität ist strukturell blind (beide Arme, dieselbe Funktion). `typecheck` sieht keinen
Unterschied zwischen zwei `number`. Vitest sieht die Zeilen, solange der Purge nicht gelaufen ist.
Nur ein **Unit-Test auf der Mapping-Funktion mit je Feld unterschiedlichen Fixture-Werten** fängt
das (Kapitel 4, Pflicht 4).

### 2. Der Host-Riegel: `/m/radio/*` antwortet auf jedem Suite-Host, und beim Enrollment hat das Datenwirkung

*(Zusammenführung von `RI-08`, `R-B4` und `B13` — Falle 61 — mit dem Riegel-Entwurf `R-B1`/`R-B2`/`R-B3`.
`RI-08` und `B13` präzisiert.)*

`iuk-suite/src/core/routing.ts:58-66` gatet einen internen Pfad `/m/<key>/...` **nach dem Modul aus
dem Segment**, ohne jeden Hostbezug; `canAccess` steigt für ein Modul ohne Auth-Pflicht sofort mit
`true` aus (`iuk-suite/src/core/registry.ts:239`). Jeder Host, der auf den Suite-Container terminiert,
antwortet damit auf `/m/radio/*`. `radio` **muss** `requiresAuth: false` führen, weil Kiosk und
Enrollment anonym erreichbar sind.

**Die Datenwirkung, präzisiert.** Der Kiosk-Zugang liegt heute ausschließlich im **`localStorage`**
(`radio-inventar/apps/frontend/src/lib/tokenStorage.ts:5-13`), nicht in einem Cookie —
`localStorage` ist **origin-gebunden**. Läuft ein Enrollment über `files.iuk-ue.de/m/radio/...`,
dann (i) verbrennt der Handler den Einmal-Code (er ist danach nirgends mehr einlösbar) und (ii) legt
den Zugang auf dem **falschen Origin** ab. Die Fehlerrichtung ist ein **stiller Ausfall**, kein
stiller Zugriff: das Tablet gilt auf dem Zielhost als nicht freigeschaltet, ein Überlauf über
Subdomains entsteht nicht. Verschärfend: der QR-Code baut seine URL aus
`import.meta.env.VITE_PUBLIC_APP_URL || window.location.origin`
(`radio-inventar/apps/frontend/src/components/features/admin/AppQRCode.tsx:8`) — und im Repository
setzt **nichts** `VITE_PUBLIC_APP_URL` (`docker-compose.yml:39` setzt ein laufzeitliches
`PUBLIC_APP_URL` im Environment-Block des **Backend**-Dienstes, anderer Name, andere Phase). Der
Fallback auf `window.location.origin` ist damit der zu erwartende Normalfall: **ausgedruckte
QR-Codes zeigen dauerhaft auf den Host des erzeugenden Browsers.**

⚠️ **Wechselt die Suite-Fassung von `localStorage` auf ein Cookie, kehrt sich die Fehlerrichtung um
und wird schlimmer** — ein Cookie auf `iuk-ue.de` reist über Subdomains. Das ist heute schon
Realität, nur in der Alt-App: `radio-inventar/apps/backend/src/config/session.config.ts:16-28` setzt
in Produktion `domain: '.' + parts.slice(-2).join('.')`, also `.iuk-ue.de`, mit dem Kommentar
„for subdomain cookie sharing", plus `sameSite: 'none'` (`:39`).

**Die Bauform des Riegels ist die `lagerbuch`-Form, NICHT die `files`-Form.** Bei `files` trägt die
Reihenfolge in `SUITE_HOST_FILES` die Rolle
(`iuk-suite/src/app/m/files/_lib/hostRolle.ts:47`, Rolle über den Index `:124-125`), deshalb gibt es
dort `validateFilesHosts`, das bei **genau einem** Host abbricht (`:183-196`). Bei `radio` liegen
beide Rollen auf **einem** Host, die Rolle steckt im **Pfad**. Also drei Funktionen wie in
`iuk-suite/src/app/m/lagerbuch/_lib/host.ts:42-56`: ein Prädikat über
`moduleForHost(resolveHost(headers))?.key === "radio"`, eine werfende Form mit `notFound()`
(„Kein 403: die Existenz eines Pfades auf dem falschen Host wird nicht verraten", `:46-50`) und eine
nicht-werfende für Route Handler (`:52-56`). **Kein `validateRadioHosts`:** 0, 1 und ≥2 Hosts sind
alle erlaubt (`host.ts:94-97`) — Betreiberentscheidung 2 lässt `radio-admin.iuk-ue.de` übergangsweise
mitlaufen. Und **kein** „kein Prod-Host konfiguriert → durchlassen"-Zweig; den gibt es bei
`lagerbuch` ausdrücklich nicht (`host.ts:37-40`), er wäre die Sperre, die sich selbst abschaltet.

**Drei Verankerungsstellen, und die dritte ist die tragende** (`host.ts:58-96`, Aufruftabelle):
(i) die Layouts — Bequemlichkeit, keine Sicherheitsgrenze, Route-Group-Grenzen sind keine;
(ii) **jeder Route Handler** — Handler haben KEIN Layout, betroffen sind Enrollment-Handler
(Datenwirkung!), Abmelde-Handler, Manifest, Icons, dort zwingend die nicht-werfende Form mit eigener
404 (`hostRolle.ts:30-32`); (iii) **innen, im Zugangsprädikat selbst** — `requireLagerbuchHost` steht
in allen drei Formen als **erste Anweisung**
(`iuk-suite/src/app/m/lagerbuch/_lib/helferZugang.ts:111`, `:136`, `:173`; auch
`_lib/zugang.ts:252`), mit der Begründung „durch KONSTRUKTION wahr und nicht durch eine Liste, die
die nächste Action vergisst" (`helferZugang.ts:13-15`). Server Actions haben kein Layout über sich.
Gegenregel: nicht-werfende **Prädikate** rufen den Host-Riegel absichtlich **nicht** selbst
(`zugang.ts:69-73`).

⚠️ **Und `/admin` erbt keinen Login-Redirect von der Weiche.** Mit `requiresAuth: false` gibt es für
`/m/radio/admin/...` **null** Middleware-Gating; jede Verwaltungsseite, jede Verwaltungs-Action und
jeder Verwaltungs-Route-Handler muss den Zugriffsriegel **selbst** als erste Anweisung rufen
(`registry.ts:110-121` sagt das für `lagerbuch` wörtlich, `registry.ts:85-89` für `files`).

*Kein Gate:* `iuk-suite/src/core/routing.test.ts` schreibt das Middleware-Verhalten sogar
ausdrücklich fest, und Playwright fährt gegen **einen** `baseURL` (Falle 57). Eine vergessene Stelle
ist typkorrekt und lint-sauber.

### 3. Es gibt kein Enrollment — ein einziges geteiltes Geheimnis im `localStorage` jedes Tablets

*(Zusammenführung von `RI-07`, `R-A1`, `R-10` und `R-11`; `R-10` präzisiert.)*

Der Kiosk kennt **kein Gerät**. `radio-inventar/apps/backend/src/common/guards/api-token.guard.ts:21`
liest **einen** Wert aus der Umgebung (`this.apiToken = this.configService.get<string>('API_TOKEN')!`)
und vergleicht jeden eingehenden Bearer konstantzeitig dagegen (`:43-50`, sonst 401);
`radio-inventar/apps/backend/src/modules/auth/token.controller.ts:31-39` prüft gegen denselben Wert
und antwortet `{ valid: true }`. `API_TOKEN` ist Pflicht mit mindestens 32 Zeichen
(`radio-inventar/apps/backend/src/config/env.config.ts:11`). Das Frontend legt genau diese
Zeichenkette in `localStorage` ab (`tokenStorage.ts:5-13`, geprüft beim Start in
`radio-inventar/apps/frontend/src/routes/__root.tsx:88`). Im Prisma-Schema existiert **keine**
Token-Tabelle — `radio-inventar/apps/backend/prisma/schema.prisma` führt genau ein Modell,
`AdminUser`; über alle fünf Migrationen hinweg wurden überhaupt nur drei Tabellen je angelegt
(`Device`, `Loan`, `AdminUser`).

**„Enrollment" heißt heute also ausschließlich: den einen Token auf ein weiteres Gerät bringen.** Kein
Token je Gerät, kein `aktiv`-Flag, kein Widerruf, kein Ablauf. Ein verlorenes Tablet erzwingt die
Rotation des **einen** Tokens auf **jedem** Tablet, und weil der Wert im `localStorage` steht, ist er
mit entsperrtem Bildschirm auslesbar.

⚠️ **Betreiberentscheidung 4 deckt das NICHT ab.** Sie erledigt die Auflage für radio-admins
**öffentliche** Loan-/Device-API — und das ist ein anderes Ding: `api_tokens` in radio-admin ist eine
Tabelle mit `token_hash` („sha256 hex of the plaintext secret; the plaintext is never stored"),
`prefix`, `last_used_at`, `revoked_at` (`radio-admin/server/src/db/schema.ts:58-70`), also ein
widerrufbares Token **je Konsument**. Wer „API-Tokens sind gegenstandslos" auf beide Systeme liest,
nimmt dem Kiosk seinen einzigen Zugangsriegel.

**Damit ist das Enrollment NEUBAU, kein 1:1-Port** — es gibt nichts, was 1:1 gehen könnte. Welche der
zwei Bauformen es wird (geteiltes Geheimnis 1:1 oder Token je Gerät mit Widerruf), ist **Entscheidung
1** und blockiert das Schema, die Oberfläche und das Runbook. Der ausgearbeitete Entwurf in Kapitel 3,
Entscheidung 5 **setzt Zweig (b) voraus** und ist ohne diese Entscheidung nicht gültig.

### 4. Reihenfolge erzwungen: die HTTP-Grenze darf erst fallen, wenn die sechs `/v1`-Routen Drizzle-Aufrufe sind

*(`B01`, präzisiert; mit `RI-03`.)*

Der Kiosk-Browser spricht **nie** mit radio-admin. Zwei Sprünge: Browser → eigenes NestJS
(`Authorization: Bearer <API_TOKEN>` auf `/api/devices`, `/api/loans/active`, `POST /api/loans`,
`PATCH /api/loans/:loanId`, `/api/borrowers/suggestions` —
`radio-inventar/apps/frontend/src/api/client.ts:4`, `:41`, `api/devices.ts:55`, `:72`,
`api/loans.ts:43`, `:165`, `:226-227`, `api/borrowers.ts:44-45`), dann NestJS → radio-admin mit
eigenem S2S-Bearer auf `api/v1/loan-devices`, `POST api/v1/loans`, `PATCH api/v1/loans/:loanId`,
`GET api/v1/active-loans`, `GET api/v1/loans/history`, `GET api/v1/borrowers/suggestions`
(`radio-inventar/apps/backend/src/modules/radio-admin/radio-admin.service.ts:146`, `:229`, `:240`,
`:248`, `:266`, `:276`). radio-admin ist Master; radio-inventar **schreibt** sehr wohl — aber
ausschließlich in radio-admin, nie in die eigene Datenbank.

`env.config.ts:129` nennt radio-admin ausgeschrieben „the device & loan source" und verlangt in
Produktion `RADIO_ADMIN_URL` plus **einen von zwei** Auth-Wegen (`env.config.ts:106-131`). Beide sind
in der Quelle scharf: `radio-admin/server/src/routes/loanApi.ts:5-6` importiert `verifyApiToken`
(api_tokens-Tabelle, gehasht) **und** `verifyLoanJwt` (client_credentials).

⚠️ **Präzisiert, weil es die Portierungsreihenfolge trägt, aber nicht die Token-Frage entscheidet:**
`RADIO_ADMIN_API_TOKEN` ist `z.string().optional().default('')` (`env.config.ts:28`) — eine optionale
Env-Variable, **kein** Prod-Beleg. Welcher Weg produktiv läuft, ist **nicht gemessen** (Kapitel 6,
Frage 3). Die Aussage „die Token-Kette `tokens.ts` / `ApiTokensPage.tsx` / `useApiTokens.ts` ist der
heutige Zugangsweg" ist nur **eine von zwei** Möglichkeiten. Ebenfalls korrigiert: von den vier
`fetch`-Aufrufen in `radio-admin.service.ts` gehen **zwei** gegen radio-admin (`:148`, `:181`), zwei
gegen den OIDC-Provider (`:301` Token-Endpunkt, `:343` Discovery).

**Die Reihenfolge-Auflage hält unabhängig vom Weg:** die HTTP-Grenze samt Auth darf erst fallen, wenn
die sechs `/v1`-Routen (`loanApi.ts:126`, `:133`, `:140`, `:148`, `:158`, `:187`; ankerfest **6**
`r.`-Routen) durch direkte Drizzle-Aufrufe im selben Prozess ersetzt sind. Wird die Reihenfolge
getauscht, steht der Kiosk ohne Bestand da. **Und schwenkt die Verwaltung zuerst, verliert der
Alt-Kiosk seine Datenquelle** — beide müssen im selben Fenster umziehen.

Mitzunehmen als Fachlichkeit, nicht als Technik: `radio-admin.service.ts:48`
(`STALE_GRACE_MS = 5 * 60_000`) mit der Begründung auf `:43-47` — „loans/return/history stay
operational on a brief outage instead of hard-failing", angewandt auf `:123`. Dieser **Ausfall-Puffer
fällt beim naiven Port weg**.

### 5. Falle 9 ist der teuerste Posten: 31 `render`-Funktionen, und die Dateimengen sind NICHT deckungsgleich

*(`B06`, präzisiert.)*

`radio-admin` ist tabellenlastig und trifft **Suite-Falle 9** (`<Table columns={[{render}]}` aus einer
Server Component → `Error: Functions cannot be passed directly to Client Components`,
`iuk-suite/CLAUDE.md:52-70`) an **31** Stellen.

`render:`-Träger: `radio-admin/client/src/features/devices/deviceColumns.tsx` **15**,
`features/loans/LoanList.tsx` 5, `features/settings/ApiTokensPage.tsx` 5,
`features/settings/SoftwareVersionsPage.tsx` 4, `features/import/ImportWizard.tsx` 2.
`<Table`-Träger: `DeviceList.tsx`, `ImportWizard.tsx`, `LoanList.tsx`, `ApiTokensPage.tsx`,
`SoftwareVersionsPage.tsx`.

⚠️ **Die beiden Fünferlisten sind nicht dieselben.** `deviceColumns.tsx` trägt 15
`render`-Funktionen und **kein** `<Table`; `DeviceList.tsx` trägt ein `<Table` und **kein** `render:`.
Die Geräteliste ist heute schon auf zwei Dateien aufgeteilt — **beide gehören zusammen in EINE
`"use client"`-Insel**, sonst wandern die 15 `render`-Funktionen weiterhin als Prop über die
RSC-Grenze und ergeben genau den Fehler aus `CLAUDE.md:55-57`. Dazu kommt der Kiosk mit
`radio-inventar/apps/frontend/src/components/ui/table.tsx` und den Admin-Routen `admin/history.tsx`,
`admin/devices.tsx`.

*Kein Gate:* `CLAUDE.md:61-64` sagt es wörtlich — `build` prüft Modulgrenzen statisch, jsdom hat
überhaupt keine RSC-Grenze, `typecheck`/`lint` sowieso nicht. Nur ein echter Abruf. Fünf
`"use client"`-Tabellenkomponenten sind **Pflichtbestandteil**, nicht Nachbesserung, und je Tabelle
braucht es einen echten HTTP-Abruf im e2e (Vorbild
`iuk-suite/src/app/m/lagerbuch/verwaltung/(arbeit)/LetzteBuchungenTable.tsx`,
`iuk-suite/src/app/m/aufgaben/_ui/RoutinenTabelle.tsx`).

---

## 3. Entscheidungen vor der Spec

Sechzehn. **Zehn** blockieren die Spec und sind **🔴 blockierend** markiert: die ersten sieben sowie die
drei nachgetragenen 14, 15 und 16. **Entscheidung 1 ist die Wurzel:** sie entscheidet Entscheidungen 5,
6 und die Fallen 19 bis 21 mit. ⚠️ **Zwei der zehn sind erst nach einer Messung beschlussfähig**
(Entscheidung 2 hängt an Frage 3, Entscheidung 4 an Frage 7 (i)/(ii)) — beide tragen die Zeile
„Reihenfolge: messen → entscheiden". Ein Sitzungstermin für sie ist **hinter** die Betreiberantwort zu
legen.

### ⛔ 1. ~~Geteiltes Geheimnis oder Token je Gerät?~~ — **ÜBERHOLT am 2026-08-17** *(`R-11`, mit `RI-07`/`R-A1`/`R-10`/`B13`)*

> ⛔ **Diese Entscheidung ist gegenstandslos.** Betreiberantwort 5 (Kapitel 6): **„ist kein Tablet"** —
> es gibt kein festes Gerät, also auch kein Geräte-Geheimnis. Zugriff entsteht durch einen gescannten
> QR-Code oder durch Anmeldung über die Suite. An ihre Stelle tritt die neue Entscheidung zu
> **Lebensdauer und Widerrufbarkeit des Ausleih-Codes** (Kapitel 6, Kasten unter der Antworttabelle).
> Der Abschnitt bleibt stehen, damit kein späterer Durchgang die Frage erneut „findet" — und weil
> Zweig (b) das Datenmodell beschreibt, das ein widerrufbarer Code ohnehin braucht.

Betreiberentscheidung 4 spricht nur über radio-admins öffentliche API. Über das **Kiosk-Geheimnis**
sagt sie nichts, und das ist ein anderes Ding (Befund 3 in Kapitel 2). **Zwei Zweige, beide mit
eigenem Datenmodell, eigener Oberfläche und eigenen Runbook-Schritten:**

- **(a) 1:1 übernehmen** — ein geteiltes Geheimnis. Kein Widerruf eines einzelnen verlorenen Tablets;
  ein Wechsel entwertet **alle** Tablets gleichzeitig und erzwingt ein Sammel-Neu-Enrollment.
- **(b) Token je Gerät mit Widerruf** — neuer Umfang, den keine Alt-App hat, aber das verlorene Tablet
  wird zu einem Handgriff statt zu einem Feuerwehreinsatz.

⚠️ **Diese Entscheidung wird von der Darstellungsreihenfolge nicht getroffen.** Die Entscheidungen 5
und 6 sowie die Fallen 19 bis 21 sind unter **Zweig (b)** ausgearbeitet und sind unter Zweig (a)
gegenstandslos. Solange 1 offen ist, lässt sich weder das radio-Schema abschließen noch der
Enrollment-Ablauf schreiben.

Nebenbedingung für beide Zweige: **wechselt die Suite-Fassung von `localStorage` auf ein Cookie, wird
die Falsch-Host-Lage schlimmer, nicht besser** (Befund 2 in Kapitel 2).

Belege: `radio-inventar/apps/backend/src/modules/auth/token.controller.ts:31-34` ·
`radio-inventar/apps/frontend/src/lib/tokenStorage.ts:5-13` ·
`radio-admin/server/src/db/schema.ts:58-70`.

### 🔴 2. Bleibt die Token-Verwaltung von radio-admin, und welcher Auth-Weg fällt mit ihr? *(`RA-TOK-1` + `B01`, beide präzisiert)*

`POST /api/tokens` (nur Rolle `admin`) mintet einen Token und gibt den Klartext **einmal** zurück,
danach nie wieder (`radio-admin/server/src/routes/tokens.ts:22-41`, Kommentar `:13-17`: „the one-time
plaintext token is returned only by POST; it is never retrievable afterwards"); gespeichert wird
`token_hash` (sha256) plus `prefix` (`schema.ts:62-65`). `GET /api/tokens` listet ohne Secrets
(`tokens.ts:44`), `DELETE /api/tokens/:id` widerruft (`:47-51`).

⚠️ **Zwei Lesarten, die nicht still aufgelöst werden:**

- **Lesart A (`B01` in der Rohfassung):** die api_tokens-Kette ist der heutige Zugangsweg des Kiosks
  und darf erst nach Befund 4 fallen.
- **Lesart B (Gegenprüfung):** `loanApi.ts:5-6` importiert **beide** Prüfer; `RADIO_ADMIN_API_TOKEN`
  ist optional mit Default `''` (`env.config.ts:28`). Läuft der Kiosk per client_credentials, ist die
  Token-Verwaltung **nicht** der Zugangsweg und kann ersatzlos entfallen.

Zu entscheiden ist damit (i) welcher Weg produktiv läuft (Kapitel 6, Frage 3 — nur der Betreiber weiß
es), (ii) ob die Suite die Token-Verwaltung überhaupt behält oder das Geräte-Enrollment sie ersetzt,
(iii) **ob das Alt-`API_TOKEN` nach dem Umschwenk befristet WEITER akzeptiert wird**
(Übergangs-Doppelakzeptanz) — das ist der einzige Hebel, der den Kiosk zwischen Umschwenk und dem
letzten neu enrollten Tablet am Leben hält (Kapitel 6, Frage 1). Wird er gezogen, braucht er ein
**Ablaufdatum im Runbook**, sonst bleibt das geteilte Geheimnis dauerhaft neben dem Enrollment stehen.

⚠️ **Reihenfolge: messen → entscheiden.** Teil (i) ist **nicht entscheidbar**, sondern erst messbar
(Kapitel 6, Frage 3). Eine Sitzung, die vor dieser Messung angesetzt wird, kann zu (ii) und (iii)
nichts beschließen. Der Termin gehört **hinter** die Betreiberantwort, nicht davor.
Nebenbefund für den Import: `createdBy` speichert hier abweichend `user.name ?? user.sub`
(`tokens.ts:29`) — einen **Anzeigenamen**, nicht den `sub`.

### 🔴 3. Die zweite Verwaltung des Kiosk an `/admin`: streichen oder Pfad auflösen? *(`RI-09`, präzisiert)*

Im Kiosk-Frontend liegt unter `/admin` eine **eigene** Verwaltungsoberfläche: `login.tsx` (44),
`index.tsx` (144, Kennzahlenkarten + aktive Ausleihen), `history.tsx` (300, Filter, Seitenblätterung,
CSV-Export), `devices.tsx` (95), `settings.tsx` (57), dazu `routes/admin.tsx` (73) und die
Komponenten `AdminNavigation`, `DashboardStatsCards`, `ActiveLoansList`, `HistoryTable`,
`HistoryFilters`, `HistoryPagination`, `ExportButton`, `DeviceTable`, `CredentialsChangeForm`,
`PrintTemplateButton` sowie eine eigene API-Schicht (`api/admin-history.ts` 209,
`api/admin-dashboard.ts` 147).

Betreiberentscheidung 1 setzt an `/admin` die **radio-admin**-Verwaltung. Also entweder streichen —
dann muss **je Ansicht** belegt sein, dass radio-admin sie hat; **Historie mit Filtern und CSV-Export
ist der wahrscheinlichste Fehlbetrag** — oder die Pfadkollision auflösen.

Korrektur zur Rohfassung: die Express-Sitzung liegt **nicht** im Postgres, sondern im
prozesslokalen MemoryStore (`radio-inventar/apps/backend/src/main.ts:75-82` ohne `store`). Sitzungen
überleben keinen Neustart und sind **kein Migrationsgegenstand**.

### 🔴 4. Welcher Kiosk-Admin-Anmeldeweg lebt weiter, und was passiert mit `AdminUser`? *(`RI-AUTH-2` + `R-12`)*

Der Kiosk hält eine **dritte** Auth-Welt: einen kompletten zweiten OIDC-Client
(`POCKET_ID_ISSUER_URL`/`CLIENT_ID`/`CLIENT_SECRET`/`REDIRECT_URI`, `env.config.ts:12-15`) mit
selbst gebautem PKCE (`createRandomToken(24)`/`(48)`, S256 —
`radio-inventar/apps/backend/src/modules/admin/auth/pocket-id.service.ts:84-104`), also eine dritte,
unabhängige Pocket-ID-Client-Registrierung neben der von radio-admin und der Suite. Der Modus ist
exklusiv und **reine Konfiguration**: `const provider = this.pocketIdService.isEnabled() ? 'pocketid'
: 'local'` (`admin/auth/auth.service.ts:84`); `GET /api/admin/auth/config` teilt dem Frontend mit,
welcher gilt (`auth.controller.ts:45-51`). Der lokale Modus hat `POST /api/admin/auth/login`
(`auth.controller.ts:55`) mit Rate-Limiting und `PUT /api/admin/auth/credentials` (`:157`). Die
Sitzung trägt nur `userId`/`username`/`isAdmin` (`auth.service.ts:163-165`) — genau **eine** Rolle.

Zu entscheiden: welcher Modus produktiv läuft, ob es lokale Admin-Konten mit `passwordHash` gibt, die
kein Pocket-ID-Pendant haben, wer den dritten Pocket-ID-Client abmeldet — **und was mit `AdminUser`
passiert.** Fallen beide Anmeldewege weg, fällt der **einzige** verbliebene Grund für den
radio-inventar-Postgres (Kapitel 4, Pflicht 19). ⚠️ Ein gelöschtes Volume nimmt die Antwort mit.

⚠️ **Reihenfolge: messen → entscheiden.** Welcher Modus produktiv läuft und ob es lokale Konten mit
`passwordHash` gibt, ist **Messung** (Kapitel 6, Frage 7 (i)/(ii); Kapitel 7, Nr. 10, 11, 30, 31), nicht
Beschluss. Entschieden werden kann erst danach — und dann in einem Zug, weil dieselbe Antwort über den
Abbau des Postgres mitentscheidet.

### ⛔ 5. ~~Enrollment-Ablauf~~ — **ÜBERHOLT am 2026-08-17** *(`R-A1` + `R-A2`, `R-A2` präzisiert)*

> ⛔ **Gegenstandslos mit Entscheidung 1:** der Ablauf setzt ausdrücklich Zweig (b) voraus, und es gibt
> kein Gerät zu enrollen (Betreiberantwort 5). **Was übertragbar bleibt, ist der Ablauf selbst** — er ist
> nach dem `lagerbuch`-Gate entworfen, und genau dieses Muster trägt jetzt den Ausleih-Code: Ausstellung
> durch eine Modul-Adminin, Einlösung am Gate, zeitlich begrenzte Sitzung, Sperrung statt Löschung.
> Lies die Schritte unten als Vorlage für den **Code**, nicht für ein **Gerät**. Wer darf ausstellen,
> steht in Betreiberantwort 6: **nur die radio-admins.**

Konkreter Entwurf nach dem `lagerbuch`-Gate:

1. **Ausstellung.** Eine Modul-Adminin öffnet `/admin/geraete` auf `radio.iuk-ue.de`, tippt eine
   Bezeichnung („MTW 1 Tablet", „Wache Tresen") und erhält einen **einmaligen** Enrollment-Code; die
   Zeile trägt `label`, `erstelltVon`, `erstelltAm`, `eingeloestAm`, `aktiv`.
2. **Einlösung.** Eine Person steht **physisch** am Tablet, ruft `radio.iuk-ue.de/` auf, tippt den
   Code einmal; ein Route Handler (Form wie `t/[code]/route.ts`) **verbrennt** den Code
   (`eingeloestAm` gesetzt) und legt ein signiertes **host-only** Cookie mit **nur** der `geraetId`
   als Nutzlast — nach dem Muster `HelferPayload = { tokenId }`, wo `code` und `label` bewusst
   **nicht** im Cookie stehen (`iuk-suite/src/app/m/lagerbuch/_lib/helferSitzung.ts:25`, Begründung
   `:20-24`).
3. **Lebensdauer.** Lang (Vorschlag 365 Tage), aus **einer** Funktion für JWT-`exp` und
   Cookie-`maxAge` (Vorbild `helferGueltigkeitSekunden`, `helferSitzung.ts:55`, Begründung: „Zwei
   Umrechnungen wären zwei Wahrheiten").
4. ⚠️ **Rotation — hier ist die Rohfassung präzisiert und es entsteht eine ZUSÄTZLICHE Entscheidung.**
   Eine gleitende Verlängerung „bei jedem Aufruf" ist **unmöglich**: in einer Server Component ist
   `cookies()` versiegelt (`iuk-suite/src/app/m/lagerbuch/_lib/helferZugang.ts:117-131`, siehe
   Falle 20). Rotation kann nur in **Route Handlern und Server Actions** ausgestellt werden. Ein
   reines Anzeige-Tablet verlängert nie und läuft still ab. **Zu entscheiden: welcher Pfad trägt die
   Rotation?** (periodischer POST des Kiosk-Frontends, Rotation im Ausleih-/Rückgabe-Handler, …)
5. **Widerruf und Geräteverlust.** `aktiv = false` in der Verwaltung, ein Klick; der DB-Recheck
   (Kapitel 4, Pflicht 15) macht das binnen des nächsten Aufrufs wirksam. Kein anderes Tablet ist
   betroffen — genau der Gewinn gegenüber heute.

Offen: Codelänge/Entropie (Entscheidung 6), Cookie-Lebensdauer, Rotationspfad, und ob die Verwaltung
eine „Alle Geräte sperren"-Sammelaktion braucht.

### 🔴 6. Codelänge und Rate-Limit: Parallelarbeit oder Voraussetzung? *(`R-C1`, präzisiert)*

`iuk-suite/src/core/ratelimit.ts:57-61` nimmt `cf-connecting-ip`, sonst den **ersten (linkesten)**
`x-forwarded-for`-Eintrag. ⚠️ **Korrektur zur Rohfassung: eine „rechteste-vertrauenswürdige"-Auswahl
existiert hier NICHT** — die Wahl des linkesten Eintrags **ist** der CWE-348-Mangel und müsste erst
gebaut werden. Die Datei sagt selbst: „wer den Container direkt erreicht, kann ihn fälschen"
(`:52-55`), der Wert heißt in der Datenbank `client_ip_unbestaetigt`. Ein Angreifer setzt pro Versuch
einen neuen ersten XFF-Wert und hat pro Versuch einen neuen Zählerschlüssel.

**Verdikt: Parallelarbeit, nicht Voraussetzung — unter zwei Bedingungen.** (1) Der Enrollment-Code ist
ein hochentropisches Einmalgeheimnis (mind. 128 bit, nicht menschlich erratbar). (2) Der
Versuchszähler liegt in der **Datenbank**, pro Code und global pro Zeitfenster, nicht in der IP-Map —
`ratelimit.ts:6-10` verweist ein **Mengenbudget** ausdrücklich in die Datenbank, weil die Treffer im
Prozessspeicher liegen und nach einem Neustart weg sind.

**Umgekehrt wird es Voraussetzung:** entscheidet der Betreiber sich für einen kurzen, per Hand
tippbaren Code (etwa sechs Ziffern, weil jemand am Tablet steht und tippt), dann ist der fälschbare
XFF-Eintrag das **Einzige** zwischen einem Angreifer und dem Durchprobieren von 10⁶ Codes — dann muss
die vertrauenswürdige IP-Auswahl **vor** dem Enrollment-Endpunkt fertig sein, plus DB-Versuchszähler.

### 🔴 7. „Vorlage statt Wegwerfware": trägt für Semantik, nicht für Code *(`B05`)*

`radio-admin` sitzt auf antd `^5.22.0` (`radio-admin/client/package.json:18`), die Suite auf `^6.5.3`
(`iuk-suite/package.json:25`) — ein **Major**-Sprung. Der Major ist aber **nicht** der Hauptgrund: der
größere Bruch ist das Ausführungsmodell. `radio-admin` ist eine Vite-SPA mit `react-router-dom
^7.1.0` (`:23`) und `@tanstack/react-query ^5.62.0` (`:17`); alle 37 `.tsx` sind Client-Komponenten
mit imperativem Datenholen. Die Suite ist RSC-first (`next` 16.3.0, `iuk-suite/package.json:33`).

**Ehrliches Urteil:** die Alt-App trägt als Vorlage für **WAS** gezeigt wird — 5 Tabellen mit 31
`render:`-Funktionen sind eine präzise Spezifikation von Spaltensemantik, Formatierung und Aktionen —
und trägt **NICHT** als Vorlage für **WIE**, weil jede dieser 31 Stellen unter Suite-Falle 9 in eine eigene
`"use client"`-Komponente gehoben werden muss (Befund 5 in Kapitel 2). Zweiter Posten: `react-icons
^5.4.0` (`:22`) hat in der Suite keine Entsprechung; Icons laufen über die `ICONS`-Map in
`src/core/shell/icons.ts` und stehen unter Suite-Falle 7 — jedes Icon ist ein Einzelvorgang, kein
Suchen-und-Ersetzen.

**Empfehlung für die Spec:** radio-admin als **Lesequelle** führen (Spaltenlisten, Validierungsregeln,
Fehlertexte wörtlich übernehmen), nicht als Codebasis, von der abgezweigt wird.

---

### 8. `devices.last_updated_at`: `date`-Spalte oder UTC in beiden Schreibwegen erzwingen? *(`RA-DM-05`)*

`devices.last_updated_at` ist `integer`, nullable, epoch-ms (`radio-admin/server/src/db/schema.ts:18`)
— aber semantisch ein reines **Datum** ohne Uhrzeit, und die Schreibwege sind sich über die Zeitzone
uneinig. **Import:** `commit-service.ts:40-56` (`normalizeLastUpdatedAt` → `isoToUtcMs` →
`Date.UTC(year, month-1, day)`) baut **UTC**-Mitternacht aus ISO `YYYY-MM-DD` und aus deutschem
`DD.MM.YYYY`. **Export:** `radio-admin/server/src/routes/export.ts:49-51` formatiert
`new Date(value).toISOString().slice(0,10)`, also **UTC** — der CSV-Rundlauf ist konsistent. **Die UI
aber schreibt LOKALE Mitternacht:** `client/src/features/devices/DeviceFields.tsx:163-164` rendert
einen antd `DatePicker`, und `DeviceFormModal.tsx:63` bzw. `DeviceEditForm.tsx:61` senden
`values.lastUpdatedAt.valueOf()` — dayjs-`valueOf()` eines Tagesanfangs ist Lokalzeit. In
Europe/Berlin ist das 23:00 bzw. 22:00 UTC des **Vortags**: ein per UI gesetztes Datum erscheint im
CSV-Export einen Tag zu früh, und ein Re-Import zementiert den Vortag. **Dritte, wieder andere
Semantik:** `features/update/UpdateDeviceCard.tsx:24` schreibt `lastUpdatedAt: Date.now()`, also eine
echte Uhrzeit. Serverseitig ungeschützt: `shared/src/schemas.ts:29`, `:61`, `:87` typisieren
`z.number().int().nullable()` ohne `min`/`max`.

Entweder als `date`-Spalte (TEXT `YYYY-MM-DD`) modellieren und den Zeitzonenkonflikt damit auflösen,
oder UTC-Mitternacht in **beiden** Schreibwegen erzwingen. **Beides ist eine Entscheidung, keine
1:1-Übernahme** — die heutige Semantik ist in sich widersprüchlich.

### 9. Zeitstempel-Einheit im Ziel: ms 1:1 oder Sekunden mit Umrechnung? *(aus `R-01`/`RA-DM-01`)*

Entweder das radio-Schema trägt die Zeitstempel 1:1 als `integer()`-Millisekunden — dann weicht
`radio` von **allen** anderen Suite-Modulen ab, die `integer(mode:"timestamp")` und damit Sekunden
führen — oder der Import teilt durch 1000, und dann ist **jede** Rückrechnung, jede Retention und
jeder Vergleich gegen die Alt-Datenbank betroffen. Es gibt keine dritte Möglichkeit, und die
Entscheidung muss vor dem Schema fallen, weil sie Befund 1 in Kapitel 2 auslöst oder vermeidet.

### 10. Die 12-Stunden-Sitzung: Bauform ja, Wert nein *(`R-A4`)*

`lagerbuch`s Modell ist eine **Feld**-Sitzung: eine Helferin löst ein Kärtchen ein,
`helferGueltigkeitSekunden()` setzt JWT-`exp` und Cookie-`maxAge` aus derselben Quelle
(`helferSitzung.ts:50-57`), danach tippt sie neu. **Ein Tablet tippt nicht neu** — es steht im MTW,
und wer davorsteht, hat den Enrollment-Code nicht. Ein übernommenes `exp` von 12 h heißt: der Kiosk
ist am nächsten Einsatztag tot. Übernommen wird die **Bauform** (eine Funktion für beide
Ablaufangaben, Ablauf aus dem Cookie, Sperrung aus der DB — `helferZugang.ts:33-40`), **nicht der
Wert**. Der Ablauf ist bei `radio` reine Tiefenverteidigung für ein Gerät, das aus dem Bestand fällt
und nie gesperrt wurde. ⚠️ Ohne die Rotation aus Entscheidung 5 ist eine langlebige Sitzung ein
Cookie, das nach einem Jahr **still** abläuft — auf einem Gerät ohne Bedienpersonal ein Ausfall
mitten im Einsatz.

### 11. Audit-`sub`s: `users` mitimportieren oder Zuordnungstabelle bauen? *(`R-16`)*

Sechs Spalten speichern nicht Namen, sondern die stabile OIDC-Identität `sub`:
`devices.created_by`/`updated_by` (`schema.ts:39-40`), `device_events.changed_by` (`:94`),
`software_versions.created_by` (`:47`), `api_tokens.created_by` (`:67` — **Ausnahme**, siehe
Entscheidung 2). Aufgelöst werden sie über `users` (`sub` PRIMARY KEY, `name`, `last_seen_at`,
`schema.ts:78-82`), gefüllt bei jeder Anmeldung, „so audit columns (which store `sub`) can be
resolved to a human-readable `name` for display" (`:72-77`).

Zu klären: **ob die `sub`s aus radio-admins Pocket-ID-Client dieselben sind, die die Suite sieht.**
Sind sie es, ist `users` mitzuimportieren — sie ist **nicht** weglassbar, ohne sie rendert jede
Audit-Zeile und jedes `device_events`-Ereignis eine nackte UUID, und `device_events` ist die
Änderungshistorie der Geräte. Sind sie es nicht, braucht der Import eine Zuordnungstabelle, und die
Alt-`sub`s bleiben als toter Text in sechs Spalten stehen. ⚠️ Gemessen ist hier **nur das
Datenmodell**; welcher OIDC-Client mit welcher `sub`-Quelle dahintersteht, ist **nicht** gemessen
(Kapitel 7).

### 12. Software-Versionen sortieren: Ziehen oder Hoch/Runter-Knöpfe? *(aus `B08`)*

`radio-admin/server/src/routes/softwareVersions.ts:40` bietet `PATCH /software-versions/order`, also
eine Sortierung. **Suite-Falle 11 (`locator.dragTo()`) ist heute
NICHT berührt**: `rg -ln "dragTo|onDragStart|draggable|dnd-kit|react-beautiful"` über
`radio-admin/client/src` und `radio-inventar/apps/frontend/src` liefert **0 Treffer**. Wird die
Reihenfolge in der Suite als **Ziehen** gebaut statt als Hoch/Runter-Knöpfe, wird Suite-Falle 11 scharf.
Das ist eine Entwurfsentscheidung, keine Portierungspflicht.

### 13. Läuft `/admin` in `FullShell`? *(aus `B07`/`B08`)*

Davon hängt ab, ob **Suite-Falle 8** (die Kopfzeile vererbt 64 px `lineHeight`, `CLAUDE.md:45-51`) und
**Suite-Falle 12** (`.click()` navigiert nicht, wenn die Hülle mit `SessionProvider` zwischen `mousedown`
und `mouseup` umbricht, `CLAUDE.md:94-110`) berührt sind. Für den **Kiosk**-Zweig ist die Antwort
gesetzt: **keine Shell**, sonst erbt er `controlHeight: 44` statt 56/72 (Kapitel 4, Pflicht 18). Für
`/admin` ist sie offen, und die Group-Struktur (eine Group je Rolle?) ebenso.

⚠️ **Diese Entscheidung ist am Präzedenzfall abzulesen, nicht frei zu erfinden:** `kioskdemo` führt
`shell: "kiosk"` in der Registry (`src/core/registry.ts:184-186`) und rendert es in
`src/app/m/kioskdemo/layout.tsx` über `<Shell variant={mod.shell} moduleKey={mod.key}>`; `lagerbuch`
führt einen Registry-Wert und rendert in `src/app/m/lagerbuch/layout.tsx` **gar keine** Shell. Beides
läuft, weil `registry.shell` nichts einpackt (Pflicht 23). Für `radio` heißt das: **der Registry-Wert
entscheidet die Frage nicht** — die beiden Layouts tun es (`app/m/radio/layout.tsx` für den Kiosk,
`app/m/radio/admin/layout.tsx` für die Verwaltung), und ein Modul mit **zwei** Regimen auf einem Host
kann durch **ein** Feld ohnehin nicht beschrieben werden.

### 🔴 14. Zwei Rollen oder eine? Die Trennung admin/updater hat im Ziel keinen Träger *(aus `UPDATER_EDITABLE_FIELDS`; war Kapitel 7, Nr. 44 und 48)*

⚠️ **Umgestuft von „offener Messung" zu blockierender Entscheidung.** Gemessen ist die Alt-App
vollständig, offen ist der **Zielbau** — das ist kein Messpunkt, sondern ein Beschluss.

Heute ist die Autorisierung in radio-admin **feldweise**, nicht nur endpunktweise:
`radio-admin/shared/src/editable-fields.ts:3`
`UPDATER_EDITABLE_FIELDS = ['softwareVersion', 'lastUpdatedAt', 'status']`, dazu `:5-10`
`filterEditableFields`, das gegen genau dieses `Set` filtert. Passend dazu trägt
`server/src/routes/devices.ts:126` (`PATCH /devices/:id`) **bewusst kein** `requireRole`, während `:99`
(`POST /devices`) und `:188` (`DELETE /devices/:id`) `requireRole('admin')` tragen: die Rolle `updater`
darf **ändern, aber nicht anlegen und nicht löschen** — und beim Ändern nur drei Felder.

Im Ziel gibt es dafür **keinen Ort**: bei `requiresAuth: false` prüft `canAccess()` die
`requiredGroups` **nie** (früher Ausstieg, `registry.ts:67-68`, Pflicht 23). Eine zweite Gruppe
`updater` kann also nirgends von der Suite aus wirken; sie muss **modulintern** gebaut werden — nach
dem Muster, das `files` in `_lib/access.ts` schon fährt (`registry.ts:85-89`).

**Zu beschließen, drei Teile:** (i) ein **zweiter** Env-Gruppenname neben `SUITE_ADMIN_GROUP_RADIO`
(`SUITE_ACCESS_GROUP_RADIO` als updater-Gruppe? ⚠️ dann greift bei `ACCESS` die Leer-Meldung, bei
`ADMIN` nicht — Falle 23); (ii) ein **zweites serverseitiges Prädikat** neben dem Admin-Prädikat aus
Pflicht 17; (iii) die **feldweise Filterung in jeder Server Action**, die Geräte schreibt — sonst
reicht ein zusätzliches Feld im Formular, um die Trennung auszuhebeln.

**Wer das als Messung wegschiebt, baut `/admin` mit genau EINER Rolle** und schaltet der
Personal-Gruppe entweder alles frei oder alles ab. Beides ist still und typkorrekt.

### 🔴 15. Rollback-Frist und Verlustumfang: ab wann gilt „nur noch vorwärts"? *(neu; Lücke gegen Pflicht 6 und Falle 28)*

Pflicht 6 definiert Rollback als **Routing-Vorgang** (`SUITE_HOST_RADIO=` leer), Falle 28 sichert ihn
gegen den Cache (302 statt 301). **Was mit den DATEN geschieht, steht nirgends** — und das ist bei
`radio` der teure Teil: der Kiosk wird genau dann benutzt, wenn Material bewegt wird.

Gemessen: es gibt **keinen Rückweg-Importer** (Suite → radio-admin) und kein Vorbild dafür. Jede
Ausleihe und jede Rückgabe, die nach dem Umschwenk in `radio.db` landet, ist beim Rollback **verloren**
— sie steht in einer SQLite-Datei, die die Alt-App nie liest.

Gegengeprüft: das geerbte `iuk-suite/docs/runbooks/lagerbuch-cutover.md` kennt **keine** solche
Hausregel, auf die man sich stützen könnte. Es beschreibt den Teilrückzug als
„`SUITE_HOST_LAGERBUCH` leeren + Host aus `SUITE_TRAEFIK_RULE` — er nimmt die **Domain vom Netz**,
statt eine ältere lagerbuch-Version auszuliefern" (`:420`). Für `radio` heißt derselbe Handgriff: **der
KIOSK ist danach offline** — er landet **nicht** auf der Alt-App, weil `radio.iuk-ue.de` dort nie
bedient wurde (Kapitel 6, Frage 1). Beim `lagerbuch`-Muster war das hinnehmbar; bei einem Wandtablet,
das die Materialausgabe trägt, ist es ein Ausfall.

**Zu beschließen:** (i) eine **Frist** („Rollback nur innerhalb von X Stunden nach dem Umschwenk,
danach nur vorwärts"), (ii) der **benannte Point of no return** — der erste Schreibvorgang in
`radio.db` ist der naheliegende Kandidat, ein Zeitfenster der ehrlichere —, (iii) was in der Frist mit
den bereits geschriebenen Zeilen geschieht: von Hand in die Alt-App nachtragen (dann braucht das
Runbook den `sqlite3`-Auszug dafür) oder ausdrücklich als Verlust hinnehmen. **Ohne (i) entscheidet das
jemand im Störungsfall um 22 Uhr.**

### 🔴 16. PDF-Ausgabe: welcher Ziel-Mechanismus? *(neu; hängt an Pflicht 14 (5))*

Pflicht 14 (5) setzt die **PDF-Geräteliste zum Download ohne Sitzung** als 1:1-Pflicht
(`api/print.ts:1-5`, `:47`, Dateiname aus `PrintTemplateButton.tsx:26-31`), dazu kommt der zweite
Druckweg `api/admin-print.ts:62`. Das liest sich wie Fleißarbeit und ist ein **Neubau mit fremder
Bibliothek**: die Alt-App erzeugt serverseitig mit **`pdfkit ^0.17.2`**
(`radio-inventar/apps/backend/package.json:30`, Typen `:45`), die Suite führt **`pdf-lib ^1.17.1`**
(`iuk-suite/package.json:35`) — ein anderes Modell **ohne Textfluss und ohne Tabellensatz**.
Seitenumbruch, Spaltenbreiten und Datumsformat sind damit **nicht portierbar, sondern neu zu bauen**.

**Zu beschließen:** (a) Tabellensatz von Hand auf `pdf-lib` (volle Kontrolle, der Aufwand steckt im
Umbruch), (b) `pdfkit` als **zusätzliche** Abhängigkeit aufnehmen (dann ist der Alt-Code fast 1:1
übernehmbar, aber die Suite trägt zwei PDF-Bibliotheken), oder (c) **kein Server-PDF**: druckbare HTML-
Ansicht plus Browser-Druck (dann fällt die Pflicht und die Ausgabe ändert sich sichtbar — das ist eine
Änderung am Produkt und gehört dem Betreiber vorgelegt).

⚠️ **Unabhängig vom Zweig:** der Handler bleibt **sitzungsfrei**, muss aber hinter dem **Geräte-Riegel**
(Pflicht 15, DB-Recheck) **und** hinter der **nicht-werfenden Host-Prüfung** liegen (Befund 2) — ein
Route Handler hat kein Layout und erbt keinen Riegel. Kein Suite-Vorbild für einen PDF-Route-Handler
ist im Repo gemessen.

---

## 4. 1:1-Pflichten

Fünfundzwanzig. Was hier steht, darf beim Port **nicht** brechen — entweder weil Daten daran hängen
oder weil eine bewusste Konstruktion sonst still verlorengeht.

### Datenmodell und Import

**1. Die vollständige Spaltenreferenz: 6 Tabellen, 61 Spalten, genau ZWEI SQL-Defaults** *(`RA-DM-08`, präzisiert)*

`devices` (25): `id text PK` · `rufname text` · `issi text NN U` · `tei text` (erst 0004, ausdrücklich
**nicht** unique — `schema.ts:8-11`: „Optional and NOT unique: devices without a recorded TEI are the
norm") · `serial_number` · `device_type` · `status` · `location` · `assigned_to` · `software_version` ·
`last_updated_at integer` · `notes` · `hiorg_id` · `opta` · `funktion` · `hersteller` · `bedieneinheit` ·
`device_modes text` (Klartext, komma-verbundene Teilmenge, z. B. „TMO,DMO") · `alamos_integrated
integer` (0/1) · `loanable integer` (0/1, **Stammdatum**, nie in `UPDATER_EDITABLE_FIELDS`,
`schema.ts:30-32`) · `update_note text` (0001, append-only, getrennt von `notes`) · `created_at
integer NN` · `updated_at integer NN` · `created_by` · `updated_by`.
`software_versions` (6): `id PK` · `value text NN U` · `created_at NN` · `created_by` (**tot**, Falle 4) ·
`sort_order integer NN DEFAULT 0` · `is_target integer NN DEFAULT false`.
`api_tokens` (8): `id PK` · `name NN` · `token_hash NN` (sha256-hex) · `prefix NN` (erste 11 Zeichen,
nur Anzeige, `apiTokenRepo.ts:48`) · `created_at NN` · `created_by` (**tot**) · `last_used_at` ·
`revoked_at` (Widerruf ist ein Zeitstempel, keine Löschung, `apiTokenRepo.ts:68`).
`users` (3): `sub text PK` · `name NN` · `last_seen_at NN`.
`device_events` (8): `id PK` · `device_id NN FK→devices.id CASCADE` · `field NN` · `old_value` ·
`new_value` · `changed_by` · `changed_at NN` · `source NN` (TS-Enum, **kein** DB-CHECK).
`loans` (11): `id PK` · `device_id NN` (**kein FK**) · `snapshot_call_sign NN` ·
`snapshot_serial_number` · `snapshot_device_type` · `borrower_name NN` (personenbezogen, DSGVO-Grund
der Retention) · `borrowed_at NN` · `returned_at` (NULL = aktive Leihe) · `return_note` ·
`created_at NN` · `updated_at NN`.

⚠️ **Präzisiert:** SQL-seitige `DEFAULT`s gibt es genau **ZWEI** (nicht drei), beide aus
`0002_numerous_mandroid.sql`. Über alle fünf Migrationen hinweg erscheint das Schlüsselwort `DEFAULT`
sonst nirgends. Jede `id` bekommt ihren Wert aus `$defaultFn(newId)` **in der Anwendung**
(`schema.ts:5`, `44`, `60`, `87`, `120`), die DDL hat dort `text PRIMARY KEY NOT NULL` ohne Default;
`created_at`/`updated_at` haben nirgends `CURRENT_TIMESTAMP`. **Ein Rohdaten-INSERT ohne `id` schlägt
fehl — jeder Import muss ids UND Zeitstempel selbst mitbringen.**

**2. Genau EIN Fremdschlüssel — die übrigen Referenzen sind absichtlich FK-frei und müssen es bleiben** *(`RA-DM-03`, gehalten)*

Der einzige FK ist `device_events.device_id → devices.id ON DELETE CASCADE` (`schema.ts:88-90`; in
`0000` die einzige `FOREIGN KEY`-Zeile aller fünf Migrationen). `loans.device_id` ist Text ohne FK
(`schema.ts:121`), und `schema.ts:106-110` begründet das wörtlich: „returned loans are retained as
history and must outlive a later device deletion (a cascade FK would wipe that history; a restrict FK
would block deleting a device that merely has old returned loans). Historical accuracy is provided by
the immutable display snapshot copied at borrow time, not by a live join." Deshalb die drei
`snapshot_*`-Spalten (`:122-124`). Die Audit-Spalten halten `user.sub` **ohne** FK auf `users.sub`;
`users` ist nur eine Auflösungstabelle (`:72-82`), nachgeschlagen zur Anzeige
(`routes/devices.ts:88-94`).

**Pflicht: diese FKs nicht „der Ordnung wegen" nachziehen.** Ein `loans.device_id`-FK mit CASCADE
löscht beim ersten Gerätelöschen die Historie; mit RESTRICT blockiert er jedes Löschen eines Geräts
mit alten Rückgaben. Ein FK auf `users.sub` bricht jeden Import, dessen `sub`-Werte noch nie
eingeloggt waren — also **alle** bei einem Kaltimport. ⚠️ Die zwei Tabellen sehen gleich aus und sind
gegensätzlich.

**3. Einfügereihenfolge und Spaltenlisten für `scripts/import/radio.ts`** *(`R-04`, gehalten)*

Reihenfolge: (1) `users`, `software_versions`, `api_tokens` (frei), (2) `devices`, (3) `device_events`,
(4) `loans` (formal frei, fachlich nach `devices`). ⚠️ **Die FK-Kante ist nicht dekorativ:**
`radio-admin/server/src/db/index.ts:28` und `iuk-suite/src/core/db/index.ts:19` setzen beide
`sqlite.pragma("foreign_keys = ON")` — ein `device_events`-Insert vor dem passenden Gerät bricht hart
ab. **Spalten namentlich, nie `SELECT *`** (`iuk-suite/docs/runbooks/lagerbuch-cutover.md:30-31` macht
das zur Regel; die vollständigen Listen stehen in Pflicht 1). **ID-Erhalt:** alle Primärschlüssel sind
`text` aus `newId()` bzw. der OIDC-`sub` bei `users` (`schema.ts:79`) — 1:1 übernehmbar, wie
`portal.ts:36` es vormacht. ⚠️ `device_events.source` ist ein Drizzle-Enum
(`'manual'|'csv-import'|'create'|'update-note'`, `schema.ts:96`) **ohne DB-CHECK**: die Altdaten
können Werte tragen, die das Enum nicht kennt — der Import muss das **prüfen**, nicht annehmen.

**4. Parität beweist den Rundlauf, nicht die Zuordnung — fünf Abfragen VOR dem Import** *(`R-07`, gehalten)*

`iuk-suite/scripts/import/parity.ts:43-56` vergleicht Multimengen von Zeilen-Hashes, und
`portal.ts:73-76` sagt selbst: „parity certifies DB round-trip fidelity — NOT the correctness of the
mapping (both parity arms derive from the same function, so a mapping bug hashes identically on both
sides) … keep its fixture values **distinct per field**."

**Feldweise Stichproben** — die vier Paare, die sich verwechseln lassen, alle zeilengenau geprüft:
`issi` (`schema.ts:7`) ↔ `tei` (`:11`) · `created_at` (`:37`) ↔ `updated_at` (`:38`) ↔
`last_updated_at` (`:18`) · `snapshot_call_sign` (`:122`) ↔ `borrower_name` (`:125`) ·
`alamos_integrated` (`:29`) ↔ `loanable` (`:32`) — zwei 0/1-Integer, die niemandem auffallen. Dazu
`serial_number` ↔ `hiorg_id` ↔ `opta`.

**Abfragen gegen die Alt-SQLite, bevor importiert wird** (Muster `lagerbuch-cutover.md:452`, `:544` —
dieselbe Zahl vorher und nachher):

1. `SELECT COUNT(*) FROM devices; … software_versions; … api_tokens; … users; … device_events; … loans;`
   — sechs Paritäts-Sollwerte.
2. `SELECT COUNT(*) FROM software_versions WHERE is_target = 1;` — **muss genau 1 sein.** Der
   Update-Stand ist berechnet, nicht gespeichert (`schema.ts:53-56`); bei 0 oder 2 kippt der
   angezeigte Status **jedes** Geräts, und keine Parität sieht es (Falle 5).
3. `SELECT COUNT(*) FROM device_events e LEFT JOIN devices d ON d.id = e.device_id WHERE d.id IS NULL;`
   — muss 0 sein, sonst scheitert der Import an der FK-Kante.
4. `SELECT device_id, COUNT(*) FROM loans WHERE returned_at IS NULL GROUP BY device_id HAVING COUNT(*) > 1;`
   — muss leer sein, sonst lässt sich der partielle Index (Falle 2) im Ziel nicht anlegen.
5. `SELECT MIN(created_at), MAX(created_at) FROM devices;` — entscheidet Befund 1 empirisch:
   dreizehnstellig = Millisekunden.

**5. `scripts/import/radio.ts` MUSS ins Repo, mit Test** *(`R-06`, präzisiert)*

`iuk-suite/scripts/import/` enthält genau `feedback-time.ts`, `feedback.ts`, `parity.ts`, `portal.ts`
(plus je einen Test und `fixtures/`) — **kein `lagerbuch.ts`, kein `radio.ts`**.
`lagerbuch-cutover.md:409` nennt beiläufig „das Muster **beider vorhandener** Importer" und bestätigt:
es sind genau zwei. ⚠️ **Wie** der lagerbuch-Import stattdessen ablief — Handarbeit am Server, ein
nicht committetes Skript oder noch gar nicht — ist aus dem Repo **nicht** ableitbar (Kapitel 8, Nr. 10).

Für `radio` gilt unabhängig davon: (i) Generalprobe und Echtimport sind **zwei** Läufe, (ii) nur ein
Unit-Test auf der Mapping-Funktion fängt Befund 1 — der Paritätscheck kann es strukturell nicht,
(iii) ein Runbook ist nicht ausführbar und nicht gegenlesbar.

### Betrieb, Cutover, Abbau

**6. Cutover: was den Boot abbricht und was STILL auf den Portal-Fallback fällt** *(`R-08`, gehalten)*

`iuk-suite/src/core/hosts.ts:65-99` (`validateHostConfig`) bricht den Boot bei **genau drei** Dingen
ab: ein `SUITE_HOST_*`, dessen Suffix zu keinem Modul-Key passt (`:69-76`), ein Wert mit `/` oder `:`
(`:81-85`), ein Host, den zwei Module beanspruchen (`:87-93`). **Alles andere fällt still**
(`:52-57`): ein korrekt geschriebenes `SUITE_HOST_RADIO=falsch.example.com` ist von einem Tippfehler
nicht unterscheidbar, `moduleForHost` fällt auf **portal** zurück, und die radio-Domain zeigt
stillschweigend das Portal.

Zwei getrennte Runbook-Schritte: (1) ein `curl` gegen `radio.iuk-ue.de`, das prüft, dass dort auch
wirklich **radio** antwortet; (2) **einmal von der neuen Domain aus anmelden und prüfen, dass man dort
wieder landet** — die Login-Allowlist in `src/core/auth/redirect.ts` erkennt einen Modul-Host über
genau diese Variable; fehlt sie, wirft Auth.js den Nutzer nach dem Login aufs Portal, ohne Fehler und
ohne Meldung, und **„ein curl sieht davon nichts"** (`hosts.ts:59-63`, wörtlich).

**Rollback ist die LEERE Zeile, nicht die gelöschte:** `SUITE_HOST_RADIO=` ergibt `[]` (bewusst keine
Prod-Hosts), das Entfernen der Variable ergibt `null` und damit den Code-Default aus der Registry
(`hosts.ts:33-46`). ⚠️ Für `radio` schärfer als sonst: unter derselben Domain liegen zwei Auth-Welten;
der Login-Rückweg betrifft nur `/admin`, ein Portal-Fallback würde den **Kiosk** stumm überdecken.

⚠️ **Nachgeschlagen (war Kapitel 7, Nr. 17): die Doppelvergabe-Prüfung sieht nur Env-Hosts.** Die
Schleife läuft über `envHostsFor(key, env) ?? []` (`hosts.ts:79-80`) — verglichen werden also
ausschließlich **per Env gesetzte** Hosts. Ein Host, den ein anderes Modul per Registry-`prodHosts` im
**Code-Default** führt, kollidiert **ohne jede Meldung**. Betrieblich sofort relevant: unter
Betreiberentscheidung 2 läuft `radio-admin.iuk-ue.de` übergangsweise weiter, und der Boot warnt nicht,
wenn dieser Host einem Registry-Default in die Quere kommt. Der Vergleich gegen die Code-Defaults ist
**Handarbeit im Runbook**.

**7. Backup und Abbau** *(`R-15`, gehalten)*

`iuk-suite/scripts/backup.sh:25-27` sammelt `"$DATA_DIR"/*.db` per nullglob und sichert jede Datei per
`sqlite3 .backup` (`:41-43`). **`radio.db` fällt damit ohne jede Skriptänderung ins Backup** — der
Vorteil der Ein-Datei-je-Modul-Regel. **Der Kiosk-Postgres fällt automatisch HERAUS**: das Skript
kennt nur `*.db` und `BLOB_DIR` für files-Blobs (`:19-21`); solange der Alt-Kiosk läuft, hängt sein
Volume an **keiner** Sicherung, die dieses Repo kennt.

Abbau-Reihenfolge: **sofort weg** können der radio-inventar-Stack samt Postgres-Container und Images —
**aber** erst nach einem letzten `pg_dump` in die Archivablage und erst, nachdem Entscheidung 4
(`AdminUser`, Session-Tabelle) entschieden ist; ein gelöschtes Volume nimmt die Antwort mit. **In
Standby**, zwei Wochen nach dem Cutover-Muster (`iuk-suite/CLAUDE.md:235`, `:239`: „Router umschwenken
(nie zwei Router gleichzeitig aktiv) → 2 Wochen Standby"): der radio-admin-Stack gestoppt mit
erhaltenem Volume — er ist die einzige Quelle für einen Re-Import und jede feldweise Nachprüfung aus
Pflicht 4 —, sein Traefik-Label aber **entfernt**, und der DNS-Eintrag `radio-admin.iuk-ue.de`, weil
er den Redirect trägt und **nicht** mit dem Stack fällt.

⚠️ **Der Standby-Stack zerstört beim Start genau die Quelle, für die er steht.** Befund 1 (b) führt den
Boot-Purge als Folge eines Sekunden-Imports — er greift aber **unabhängig davon, bei jedem Start**:
`radio-admin/server/src/index.ts:35` ruft `startRetentionSchedule`,
`services/retentionService.ts:47` führt `purge()` **sofort** aus und erst `:48`
`setInterval(purge, DAY_MS)`; der Cutoff ist `now` minus zwei Monate (`:9`
`HISTORY_RETENTION_MONTHS = 2`, `:19` `d.setUTCMonth(d.getUTCMonth() - HISTORY_RETENTION_MONTHS)`).
Weil der Cutoff an der **Wanduhr** hängt und nicht am Cutover-Zeitpunkt, löscht **jeder weitere Start
mehr als der vorige** — wer den Stack in Woche zwei zum Nachschlagen hochfährt, verliert zwei weitere
Wochen zurückgegebener Leihen aus derselben Historie, gegen die er prüfen wollte.
**Zwei Runbook-Regeln, ohne die der Standby wertlos ist:** (i) jede feldweise Nachprüfung aus Pflicht 4
läuft per `sqlite3` gegen die **Snapshot-KOPIE** des Volumes, **nie** gegen einen gebooteten Alt-Stack;
(ii) muss die Alt-App doch laufen (Re-Import, Oberflächenvergleich), wird `HISTORY_RETENTION_MONTHS`
vorher neutralisiert oder das Volume vorher kopiert.
*Kein Gate:* das ist ein **erfolgreicher** Start mit einer Protokollzeile
(`retentionService.ts:41` `[retention] purged N expired loan(s)`) — kein Fehler, kein roter Test.

⚠️ **Der Posten, der leicht liegen bleibt:** die übernommenen Geheimnisse leben danach **doppelt** auf
demselben Server — `API_TOKEN` (`token.controller.ts:32`) und die OIDC-Client-Zugangsdaten stehen
sowohl in der Alt-`.env` als auch in der Suite-`.env`. Das Abbau-Runbook muss die Alt-Datei
ausdrücklich als **zu löschenden Posten** nennen, sonst bleibt ein gültiges Kiosk-Geheimnis in einer
Datei liegen, die niemand mehr pflegt und die kein Repo kennt.

### Auth und Zugang

**8. Was Suite-SSO übernimmt und was ersatzlos verschwindet** *(`RA-AUTH-1`, gehalten)*

radio-admin ist ein BFF mit Pocket-ID-OIDC: generisches OIDC via `openid-client` mit Discovery gegen
`OIDC_ISSUER`, Client-Secret, PKCE S256, `state` + `nonce`
(`radio-admin/server/src/auth/auth-service.ts:26-48`), Scope fest `openid profile email groups`
(`:5`). Sitzungsform: eigenes HS256-JWT mit `SESSION_SECRET`, Claims nur `sub`/`name`/`role`, Laufzeit
8 h (`auth/session.ts:9-20`); Cookie `httpOnly`, `secure` nur bei `NODE_ENV=production`,
`sameSite=Lax`, `path=/`, `maxAge=8h` (`auth/routes.ts:88-94`). Die OAuth-Transaktion
(`state`/`nonce`/`code_verifier`) liegt in einem zweiten signierten Cookie mit 600 s TTL (`:39-45`).
Endpunkte: `GET /api/auth/login` (`:36`), `GET /api/auth/callback` (`:50`), `POST /api/auth/logout`
(`:99`), `GET /api/auth/me` (`:105`) — letzteres liefert nur `{name, role}`, **keinen `sub`**
(`:106`).

**Suite-SSO übernimmt:** Login, Callback, Logout, Sitzungshaltung, Rollenherleitung aus Gruppen.
**Ersatzlos weg:** das eigene Session-JWT-Format, `SESSION_SECRET`, das `oauth_tx`-Cookie und die
`redirect_uri`-Rekonstruktion.

**9. Rollen aus dem `groups`-Claim — und die 302/403-Semantik ist zweigeteilt** *(`RA-AUTH-2`, präzisiert)*

`mapGroupsToRole` prüft erst `adminGroup`, dann `updaterGroup`, sonst `null`
(`radio-admin/shared/src/role.ts:3-10`). Die Gruppennamen sind konfigurierbar mit den Zod-Defaults
`OIDC_ADMIN_GROUP='admin'` (`server/src/config.ts:28`) und `OIDC_UPDATER_GROUP='personal'` (`:29`) —
**nicht** bloß Testfixtures.

⚠️ **Präzisiert:** bei `null` wird keine Sitzung gesetzt, sondern `c.redirect('/403', 302)`
(`auth/routes.ts:76`) — eine **Browser-Weiterleitung, kein 403-Statuscode**. Den 403-Status vergibt
**nur** `requireRole` am Endpunkt (`auth/middleware.ts:49`). Beide Semantiken sind **getrennt** zu
erhalten.

Nur zwei Rollen existieren, und `requireRole` vergleicht auf **Gleichheit** — es gibt **keine
Hierarchie**: `requireRole('updater')` würde einen Admin mit 403 abweisen
(`auth/middleware.ts:46-53`).

**10. `users` ist auf `sub` geschlüsselt — der `sub`-Bruch anderer Module existiert hier NICHT** *(`RA-SUB-1`, präzisiert)*

`upsertUser(db, result.sub, result.name)` schreibt den OIDC-`sub` als Konfliktziel
(`repos/userRepo.ts:11-20`, target `users.sub`), `users.sub` ist Primärschlüssel (`schema.ts:79`), und
der Schema-Kommentar sagt es explizit: „Known users keyed by their stable identity `sub` (a UUID for
PocketID users)" (`:73`). `resolveUserNames` löst über `users.sub` zu Anzeigenamen auf
(`userRepo.ts:29-40`).

⚠️ **Zwei Korrekturen zur Rohfassung.** (i) `api_tokens.created_by` (`schema.ts:67`) gehört **nicht**
in diese Liste: `routes/tokens.ts:29` schreibt dort `user.name ?? user.sub`, also einen
**Anzeigenamen** — eine gemischte Spalte. (ii) Der Satz „weil Pocket ID `subject_types_supported:
["public"]` liefert, braucht es keine Identitäts-Migration" ist durch **keinen** Beleg gedeckt. Ob der
Auth.js-Client der Suite für dieselbe Person denselben `sub` erhält, ist **offen** (Entscheidung 11,
Kapitel 7).

**11. Der Kiosk ist NICHT offen — ein globaler `ApiTokenGuard` steht auf jeder Route** *(`RI-OPEN-1`, gehalten)*

`ApiTokenGuard` ist als `APP_GUARD` global registriert
(`radio-inventar/apps/backend/src/app.module.ts:37-38`) und verlangt `Authorization: [Bearer] <API_TOKEN>`
mit konstantzeitigem Vergleich; ohne Header 401 (`api-token.guard.ts:38-52`). Das Frontend liest den
Token aus `localStorage` und hängt ihn an **jeden** Request (`lib/tokenStorage.ts:5`,
`api/client.ts:41`, `api/print.ts:56`, `api/admin-print.ts:62`); es gibt eine eigene Einrichtungsseite
`routes/token-setup.tsx:26-40`, die gegen `POST /api/auth/verify-token` prüft
(`token.controller.ts:28-39`).

**Folge für die Portierung: das geplante Geräte-Token-Enrollment ist ein ERSATZ, keine neue Hürde.**
Heute muss jedes Kiosk-Gerät einmal einen geheimen String eintippen, der dann im Browser bleibt. Es
ist aber **keine Nutzeranmeldung** (Befund 3 in Kapitel 2). Die Aussage „auf jeder Route" gilt modulo
der `@BypassApiToken`-Ausnahmen aus Falle 16.

**12. CORS, `credentials: true` und `SameSite=None` fallen ersatzlos — beide Gründe erledigt** *(`RI-CORS-1`, präzisiert)*

`ALLOWED_ORIGINS` wird komma-getrennt geparst und als `origin` an `app.enableCors({ …, credentials:
true })` gegeben (`apps/backend/src/main.ts:55-71`); ist die Liste leer, gilt in Produktion
`origin: false` (CORS aus), in Entwicklung ein Localhost-Default-Set (`:62-69`).

⚠️ **Präzisiert: der Quelltext nennt ZWEI Gründe für `SameSite=None`, nicht einen.**
„Cross-origin requires SameSite=None and Secure=true" (`config/session.config.ts:17`) **und** „OAuth
callbacks from Pocket ID must be able to return to the backend with the session cookie" (`:38`). Nach
der Zusammenlegung auf **einen** Host in **einem** Next.js-Prozess entfallen `ALLOWED_ORIGINS`,
`credentials: true` und `express-session` vollständig; der OIDC-Rückweg braucht kein `SameSite=None`,
weil er eine **Top-Level-GET-Navigation** ist, die `SameSite=Lax` passieren lässt. **Beide** Gründe
sind damit erledigt — und mit ihnen der Grund für das Eltern-Domain-Cookie aus Falle 18.

### Kiosk-Fachlichkeit

**13. Der Datenweg und der Ausfall-Puffer** *(`RI-03`, gehalten)* — vollständig in Befund 4, Kapitel 2.
Kern als Pflicht: **5 Minuten Stale-Grace** (`radio-admin.service.ts:48`, Begründung `:43-47`,
Anwendung `:123`) sind **Fachlichkeit, keine Technik** und fallen beim naiven Port weg.

**14. Was ein Mensch am Kiosk kann — vier Kacheln, alles ohne Login** *(`RI-05`, gehalten)*

Die Bodennavigation nennt den Umfang vollständig: `/loan` Ausleihen, `/return` Zurückgeben, `/`
Übersicht, `/qr-code` QR-Code, plus Theme-Umschalter
(`apps/frontend/src/components/features/Navigation.tsx:6-11`, `:41`). Konkret schuldet der Port:

1. **Ausleihe MEHRERER Geräte in einem Vorgang.** Die Auswahl liegt als `deviceIds`-Array im
   URL-Suchparameter (`routes/loan.tsx:12-14`, Normalisierung `:26-31`, Toggle in die URL `:36-45`),
   ist also teil- und wiederherstellbar; die Erfolgsmeldung unterscheidet Singular/Plural (`:49-51`).
   Zweischritt „1. Gerät(e) wählen" / „2. Empfänger angeben" (`:75-89`).
2. **Entleiher-Eingabe mit Namensvorschlägen** aus der Historie (`/api/borrowers/suggestions`).
3. **Rückgabe über Dialog mit optionaler Rückgabe-Notiz** je Ausleihe (`routes/return.tsx:38-40`,
   `:96-104`).
4. **Übersicht** mit Statusabzeichen in vier Zuständen — „Verfügbar", „Ausgeliehen", „Defekt",
   „Wartung" (`components/features/StatusBadge.tsx:24-46`) —, Sortierung nach Statuspriorität in genau
   dieser Reihenfolge (`api/devices.ts:44-48`), Gruppierung nach Standort mit benannten Standorten
   alphabetisch (`localeCompare(…, 'de')`) und **„Ohne Standort" als letzter Gruppe**
   (`lib/device-filter.ts:66-95`), und bei ausgeliehenen Geräten der Entleihername direkt in der Zeile
   (`components/features/DeviceRow.tsx:20-21`).
5. **PDF-Geräteliste zum Download ohne Sitzung**, nur mit API-Token (`api/print.ts:1-5`: „Requires API
   token but no session authentication", `:47`; Dateiname `geraete-liste-<YYYY-MM-DD>.pdf`,
   `PrintTemplateButton.tsx:26-31`).
6. **PWA-Betrieb** mit Offline-Anzeige, Installationsbanner und Update-Hinweis
   (`routes/__root.tsx:4`, `:46`, `:52-53`).

**Nichts davon verlangt eine Anmeldung** — es gibt am Kiosk keinen Nutzerbegriff, nur den Token.

### Suite-Seite: Riegel, Dichte, Zahlen

**15. Der DB-Recheck auf `aktiv` bei JEDEM Lesepfad IST der Widerruf** *(`R-A3`, gehalten)*

`lagerbuch`s Riegel prüft nicht nur die Cookie-Signatur, sondern schlägt die Token-Zeile über den
Primärschlüssel nach und weist bei `!zeile || !zeile.aktiv` ab
(`iuk-suite/src/app/m/lagerbuch/_lib/helferZugang.ts:84-85`). Genau dieser Doppeltest ist bei `radio`
die **einzige** Widerrufsmechanik: ein signiertes Cookie kann man nicht zurückrufen, eine
Datenbankzeile schon. Er muss auf **jedem Lesepfad** stehen, nicht nur vor schreibenden Aktionen — der
Dateikopf begründet es wörtlich („der Recheck wandert vom Schreib- auf JEDEN Lesepfad … ohne ihn liest
ein gesperrter Code bis zu 12 Stunden weiter den gesamten Bestand", `:17-24`). Bei der langen
Lebensdauer aus Entscheidung 5 wären das **ein Jahr statt 12 Stunden**. Der Recheck kostet einen
Primärschlüssel-Zugriff in derselben SQLite-Verbindung, die die Seite ohnehin öffnet. `label` für die
Anzeige kommt aus **dieser Zeile**, nicht aus der Cookie-Nutzlast (`:28-30`) — deshalb kann das
Geheimnis aus dem Cookie verschwinden.

**16. Die drei Verankerungsstellen des Host-Riegels** *(`R-B3`, gehalten)* — ausgeschrieben in Befund 2,
Kapitel 2. Als Pflicht festgehalten: **(iii) innen, im Zugangsprädikat selbst** ist die tragende;
Server Actions haben kein Layout über sich, und wer die Zeile dort für doppelt hält und entfernt,
öffnet die Lücke wieder. Regel: wer das Zugangsprädikat benutzt, ruft den Host-Riegel **nicht** noch
einmal — ein zweiter Aufruf behauptet, der Riegel sei host-blind.

**17. `radio` ignoriert den `isModuleAdmin`-Kurzschluss modulintern** *(`R-D1`, gehalten)*

`isModuleAdmin` lässt die Suite-Admin-Gruppe durch: `if (groups.includes(suiteAdminGroup(env))) return
true;` (`iuk-suite/src/core/groups.ts:125`, Vorgabe `dashboard-admins`, `:96-97`). `feedback` und
`lagerbuch` nehmen davon ausdrücklich Abstand und bauen ihr eigenes Prädikat aus
`adminGroupsFor(getModule(<key>))` plus `.some()`
(`src/app/m/feedback/_lib/access.ts:10-34`, `src/app/m/lagerbuch/_lib/zugang.ts:79-115`;
`src/core/registry.ts:46`: „feedback, files und lagerbuch trennen Betrieb und Einsicht").

`radio` gehört in dieselbe Menge, mit eigenem Anlass: hinter `/admin` liegen **Klarnamen** der
Ausleihenden samt Bewegungshistorie und — unter Entscheidung 1, Zweig (b) — die Geräteverwaltung, also
die Stelle, an der Enrollment-Codes erzeugt und angezeigt werden.

**Verbindlich dabei:** `adminGroupsFor(mod)` und **nie** `mod.adminGroups` direkt, sonst ist
`SUITE_ADMIN_GROUP_RADIO` an genau dieser Stelle wirkungslos; **`.some()` und NICHT `canAccess`**, weil
`canAccess` bei leerer Liste mit `true` aussteigt (`registry.ts:242`) — eine leere Admin-Liste muss
**nichts** gewähren, sonst ist die Verwaltung für jeden Eingeloggten offen, und der Fehler ist still.
`session.user.isAdmin` kommt im Modul nirgends vor. **Folge: wer `radio` verwalten soll, gehört in
`SUITE_ADMIN_GROUP_RADIO` — auch der Betreiber selbst.**

**18. Die vier Tap-Größen sind 44/48/64/72 — zwei treffen antd-Tokens, zwei sind Nachbau** *(`B09`, gehalten)*

Gemessen in `radio-inventar/apps/frontend/src/globals.css:85-100`: `touch-target-sm` 44 px, `-md`
48 px, `-lg` 64 px, `-xl` 72 px, **je `min-height` UND `min-width`**. Abgleich: `ARBEITSDICHTE` in
`iuk-suite/src/core/theme/theme.ts:207-211` ist `token: { controlHeight: 44, controlHeightLG: 48 }`
plus `components: { Radio: { radioSize: 16, dotSize: 8 } }`. **44 und 48 sind damit Token-gedeckt** —
sm und md brauchen keinen Nachbau, nur `ConfigProvider`. **64 und 72 haben keine Entsprechung**; 72 ist
laut Suite-Falle 4 genau `size="large"`, das man nicht setzen soll. Der Kiosk behält 56/72, läuft also
**ohne `FullShell`** (`CLAUDE.md:18-22`) — konsistent mit dem `lagerbuch`-Präzedenzfall.

**Nachbau-Liste konkret:** die Suite hat Tailwind, lucide, clsx und `class-variance-authority`
**entfernt** (`grep "tailwind|lucide|shadcn|clsx|class-variance" iuk-suite/package.json` → kein
Treffer). Damit fallen 13 shadcn-Kopien unter `components/ui/` plus `touch-button.tsx` weg.
`TouchButton` selbst ist dünn (Klassen-Mapping, `touchAction: 'manipulation'`, `text-lg`) — **aber sein
Vertrag ist dick: `touch-button.spec.tsx` ist 13,6 KB. Dieser Spec ist die wertvollste Vorlage im
ganzen Kiosk und gehört vor dem Neubau gelesen.** antd bringt mit: Größen-Tokens, Fokusringe, ARIA an
`Select`/`Modal`/`Tooltip`, Tastaturnavigation. **Nachbau bleibt:** `min-width` (antd setzt Höhe, nicht
Breite), `touch-action: manipulation` (verhindert Doppeltipp-Zoom, kein antd-Token), **64 als eigene
`ConfigProvider`-Ebene** — und `sonner`-Toasts → antd `message`/`notification`.

⚠️ **Korrektur (Re-Kritik):** hier stand „56/64/72 als eigene `ConfigProvider`-Ebene". Das war falsch
zusammengesetzt. Gemessen sind **vier** Kiosk-Größen 44/48/64/72
(`radio-inventar/apps/frontend/src/globals.css:85-100`). Davon ist **72 genau antds `size="large"`**
(drei Sätze weiter oben schon so ausgewiesen) und **56 gar keine der vier** — es ist der
Suite-Vorgabewert ohne Hülle, wird also **geerbt und nicht nachgebaut**. Nachbau ist **64**; 44 und 48
treffen vorhandene Tokens.

**19. Es gibt keinen Postgres-Arm der Migration — aber „der Postgres hat keine Daten" ist die falsche Formulierung** *(`B02` + `R-12` + `RI-01`, alle drei präzisiert)*

Das Prisma-Schema des Kiosks enthält **genau ein** Modell, `AdminUser` (id, username, passwordHash,
createdAt, updatedAt — `apps/backend/prisma/schema.prisma:17-23`). `Device` wurde in
`20260627155351_remove_device_add_loan_snapshots` entfernt (`DROP TABLE "Device"`, `DROP TYPE
"DeviceStatus"`), `Loan` in `20260629120000_drop_loan` (`DROP TABLE "Loan"`). Über **alle fünf**
Migrationen hinweg wurden überhaupt nur drei Tabellen je angelegt — **keine** Ereignis-, Bild- oder
Anhang-Tabellen. Der Kopfkommentar sagt es aus: „Loans moved to radio-admin (the loan system of
record) … only AdminUser remains local (admin auth / setup)" (`:12-15`). Auch die Historie liest
**durch** nach radio-admin (`modules/admin/history/history.repository.ts:9`, `:65`, `:74`; `:57`
„Retention now lives in radio-admin"), und die Geräte ebenso
(`modules/devices/devices.service.ts:13-16` „Nothing is stored here";
`modules/admin/devices/admin-devices.controller.ts:36` „READ-ONLY").

**Arbeitsannahme 5 ist damit für den Bestand belegt: der Import ist rein SQLite→SQLite aus
radio-admin**, ohne Postgres-Arm (anders als `portal`, dessen Importer NDJSON aus Postgres liest,
`portal.ts:8-34`).

⚠️ **Zwei Reste bleiben, und beide sind zu entscheiden, nicht abzuleiten:** (i) `AdminUser` sind echte
Zeilen mit `passwordHash` — die Zeilenzahl ist **ungezählt**; aus dem Setup-Riegel folgt lediglich,
dass ein laufender Prod-Kiosk **mindestens eine** Zeile hat (`routes/__root.tsx:110-111`,
`modules/setup/setup.repository.ts:17`). (ii) `prisma/create-session-table.sql` legt eine Tabelle
**außerhalb** des Prisma-Schemas an — Inhalt ungemessen. ⚠️ **Nicht mehr haltbar ist die Lesart, im
Postgres liege ein Sitzungsspeicher** (Kapitel 8, Nr. 1).

**20. Die Zahlen: 447 Dateien / 52.730 Zeilen, und der Kiosk ist das Vierfache der Verwaltung** *(`B03`, gehalten)*

| | Dateien | Zeilen |
|---|---:|---:|
| `radio-admin/client/src` | 86 | 5.099 |
| `radio-admin/server/src` | 51 | 3.891 |
| `radio-admin/shared` | 44 | 2.132 |
| **radio-admin gesamt** | **181** | **11.122** |
| `radio-inventar/apps/backend/src` | 103 | 12.752 |
| `radio-inventar/apps/frontend/src` | 142 | 25.846 |
| `radio-inventar/packages/shared/src` | 21 | 3.010 |
| **radio-inventar gesamt** | **266** | **41.608** |

Komponenten: 37 `.tsx` (ohne Tests) in radio-admin, 99 in radio-inventar. **Endpunkte: radio-admin 28**
— ankerfest gezählt mit `rg -c "r\.(get|post|put|patch|delete)\('"`: `devices` 7, `loanApi` 6,
`softwareVersions` 5, `loans` 3, `tokens` 3, `import` 2, `suggestions` 1, `export` 1. radio-inventar: 23
Route-Dekoratoren über 9 Controller, 14 `*.dto.ts`. Schemata: radio-admin 11 `z.object` in 4 Dateien;
radio-inventar 8 Zod-Schemadateien in `packages/shared/src/schemas/`. Tests: 96 bzw. 80 Dateien.

⚠️ **Methodenhinweis, der mit muss:** `rg "\.(get|post|…)\("` liefert für radio-admin **38** und ist
kontaminiert (`c.get('db')`, `c.get('user')`, `names.get(…)`). Die belastbare Zahl ist **28**.

**21. Was ersatzlos verschwindet: rund 2.900 Zeilen Grenzverwaltung, nicht Fachlichkeit** *(`B04`, präzisiert)*

⚠️ **Nachgezählt, nicht geschätzt** (die Rohfassung nannte „rund 8.500" — Kapitel 8, Nr. 2):

| Posten | Zeilen |
|---|---:|
| Kiosk-API-Client, **12** `api/*.ts` ohne Specs (`client.ts` 188, `loans.ts` 271, `auth.ts` 340) | 1.859 |
| `lib/queryClient.ts` | 43 |
| 14 `*.dto.ts` | 483 |
| 7 NestJS-Querschnittsdateien (Guards/Pipes/Interceptor/Filter) + 2 Barrel-`index.ts` | 351 |
| `apps/backend/src/main.ts` | 110 |
| `radio-admin/server/src/index.ts` | 56 |
| **Summe** | **2.902** |

Dazu ohne Zeilenzahl: CORS (`main.ts:68` `app.enableCors`, Origin-Liste ab `:54`), der eigene
HTTP-Server (Hono `^4.6.0` + `@hono/node-server` `^2.0.4` — **nicht** Express), und
`@ant-design/v5-patch-for-react-19` (`radio-admin/client/package.json:15`), das mit antd 6
gegenstandslos wird. Die **14 DTO-Dateien** existieren nur, weil ein Schema die HTTP-Grenze zweimal
beschreiben muss (8 Zod-Schemata in `packages/shared` gegen 14 DTOs) — ohne Grenze bleibt **ein**
Zod-Schema.

**Was PORTIERT wird, ist die Fachlichkeit:** Spalten- und Feldsemantik, CSV-Import/Export mit
Encoding-Erkennung (`chardet`/`iconv-lite` — echte Fachlogik), Software-Versionen mit Reihenfolge und
Ziel-Flag, Leihregeln, Kiosk-Zugang.

**22. TanStack Query fällt weg — aber die Frischhaltung hat ZWEI Auslöser, nicht einen** *(`B11`, präzisiert)*

Gezählt wurden Musterstellen von `useQuery(|useMutation(|useInfiniteQuery(|refetchInterval|invalidateQueries`:
radio-admin **13** in 7 Dateien, radio-inventar **22** ohne Specs in 9 Dateien. **Polling-Prüfung:
`refetchInterval` kommt in KEINER der beiden Apps vor, `useInfiniteQuery` ebenfalls nicht — beide
Muster liefern 0 Treffer.** Die Entscheidung vom 19.07. (Query fällt weg, `useMutation` → Server
Action, `revalidatePath` ersetzt den Cache) trägt damit technisch.

⚠️ **Präzisiert:** die heutige Frischhaltung läuft über **zwei** Auslöser —
`lib/queryClient.ts:28` `refetchOnWindowFocus: 'always'` **und** `:29` `refetchOnReconnect: 'always'` —
auf einem Vorgabe-`staleTime` von 5 Minuten (`:18`), pro Abfrage auf 30 s gesenkt (`api/devices.ts:96`,
`api/borrowers.ts:65`, `api/admin-devices.ts:74`, `api/admin-history.ts:164`) und an drei Stellen auf
`Infinity` (`routes/__root.tsx:103`, `routes/setup.tsx:15`, `api/auth.ts:195`). Die Vorgabe ist
außerdem **bewusst cache-zuerst**: `:19` `gcTime` 24 h („keep unused data in cache for offline
access"), `:30` `networkMode: 'offlineFirst'`, `:20-27` kein Retry bei `!navigator.onLine`.
`revalidatePath` liefert die **interaktionsgetriebene** Frische — weder den Fokuswechsel noch den
Reconnect noch das Cache-zuerst-Verhalten (Kapitel 6, Frage 5).

**23. Drei Riegelschichten, nicht eine** *(`B14`, gehalten)*

Heute existieren im Kiosk-Backend **drei** Zugangswege: `common/guards/session-auth.guard.ts`
(Admin-Sitzung), `common/guards/api-token.guard.ts` (Geräte-Token), `modules/setup/guards/setup.guard.ts`
(Erstinstallation). In der Suite wird daraus `/admin` mit Suite-SSO und `/` mit eigener Kiosk-Sitzung,
`requiresAuth: false` in der Registry. **`registry.shell` packt dabei NICHTS ein** —
`src/core/shell/Shell.tsx` ist eine Komponente mit `variant`-Prop, das Modul-Layout entscheidet. Für
`radio`: der Kiosk-Zweig rendert **keine** Shell (sonst erbt er `controlHeight: 44` statt 56/72,
Pflicht 18), und der Riegel liegt **dreifach** — Layouts, jede Server Action, jeder Route Handler unter
`api/`. Der Registry-Kommentar warnt ausdrücklich: bei `requiresAuth: false` prüft `canAccess()` die
`requiredGroups` **nie** (früher Ausstieg, `registry.ts:67-68`); `files` löst dieselbe Lage bereits
modulintern in `_lib/access.ts` (`registry.ts:85-89`).

**24. Die Fachlichkeit der VERWALTUNG — Ereignisse, Import, Löschen** *(neu; die Lücke zwischen Pflicht 1/20 und Befund 5)*

Bisher ist die Verwaltung als **Spalten-, Zeilen- und Endpunktzahl** inventarisiert (Pflicht 1, 20) und
als **Oberflächenrisiko** (Befund 5) — aber nicht als **Verhalten**. Ein Spec-Autor hätte 61 Spalten und
keine Regel, nach der sie geschrieben werden. Was gemessen ist und 1:1 gilt:

1. **Jede Änderung schreibt Ereigniszeilen, eine je Feld.** `radio-admin/server/src/repos/deviceRepo.ts:222-244`
   (`writeEvents`) legt pro `FieldDiff` **eine** `device_events`-Zeile an (`field`, `oldValue`,
   `newValue`, `changedBy`, `changedAt`, `source`) und bricht bei leerer Diff-Liste ab
   (`if (diffs.length === 0) return;`) — **eine Änderung ohne echten Wertunterschied erzeugt KEIN
   Ereignis.**
2. **Die `source`-Werte sind vier, abschließend:** `deviceRepo.ts:219`
   `EventSource = 'manual' | 'csv-import' | 'create' | 'update-note'`. Jeder Schreibweg im Ziel muss
   seinen Wert **bewusst** setzen; ein fünfter Wert ist ein Datenmodellbruch (vgl. Pflicht 4: Prod-Zeilen
   mit einem Wert außerhalb des Enums sind zu zählen).
3. **Der CSV-Import ist ZWEIPHASIG und muss es bleiben:** `server/src/routes/import.ts:17`
   `POST /import/parse` (Vorschau) und `:40` `POST /import/commit` (Schreiben), dazwischen
   `classifyRows({ rows, mapping, existingByIssi, role })` (`:54`, aus `import/commit-service`),
   Nachschlagen über `import/device-lookup.ts` (`loadDevicesByIssi`, `:8`). **Der Import ist der Weg,
   über den Geräte tatsächlich in den Bestand kommen** — eine einphasige Suite-Fassung („Datei hoch,
   fertig") ist kein Port, sondern ein anderes Produkt. Dass `classifyRows` die **Rolle** entgegennimmt,
   verbindet den Import direkt mit Entscheidung 14.
4. **Sieben Endpunkte auf Geräten** (gemessen, `server/src/routes/devices.ts`): `:40` `GET /devices` ·
   `:66` `GET /devices/:id/events` · `:82` `GET /devices/:id` · `:99` `POST /devices`
   (`requireRole('admin')`) · `:126` `PATCH /devices/:id` (**ohne** `requireRole`) · `:162`
   `POST /devices/:id/update-note` · `:188` `DELETE /devices/:id` (`requireRole('admin')`). Die Notiz hat
   einen **eigenen** Endpunkt und einen **eigenen** `source`-Wert — sie ist kein Sonderfall von `PATCH`,
   und im Ziel wären das zwei getrennte Server Actions.

⚠️ **Was hier NICHT belegt ist und vor der Spec gemessen werden muss** (Kapitel 7, Nr. 43, ergänzt):
**welche** Feldänderungen überhaupt in die Diff-Liste kommen (`shared/src/diff-device.ts`), **was**
`classify-import-row.ts` je Zeile klassifiziert (neu/geändert/unverändert — die Wörter sind erschlossen,
nicht gelesen), **was** `PATCH /devices/:id` validiert, und **was beim Gerätelöschen geschieht**:
`device_events` hängt am Gerät (CASCADE zu prüfen), **Leihen tragen keinen FK** — ein gelöschtes Gerät
kann also eine Leihzeile verwaisen lassen. Das ist die gefährlichste der vier Lücken, weil sie Daten
betrifft und nicht Oberfläche.

**25. Release-Notiz plus Registerzeile — sonst ist der Cutover ein roter Test** *(neu)*

Die Suite spricht mit ihren Anwendern an genau **einer** Stelle von sich aus: den Neuigkeiten im Portal.
Gemessen liegt der Mechanismus unter `iuk-suite/src/app/m/portal/_lib/neuigkeiten/` — **eine Datei je
Notiz** unter `notizen/<modul>/`, **eine Zeile** in `register.ts`, und `register.test.ts` als
**Dreieckswächter**: eine Notiz ohne Registerzeile ist ein **roter Test**, kein vergessener
Nebenschauplatz.

Der Cutover produziert mindestens **drei** bemerkbare Änderungen, die eine Notiz verdienen: neue App
unter neuer Adresse · alter Verwaltungs-Host wird umgeleitet · **Tablets müssen neu freigeschaltet
werden** (unter Entscheidung 1, Zweig (b)). Der letzte Punkt ist der einzige **Vorlauf**, den eine
Helferin bekommt, bevor ihr Tablet nach dem Umschwenk nach einem Code fragt.

⚠️ **Verbunden mit dem Registry-Eintrag:** die Sichtbarkeit einer Notiz hängt am Modul-Switcher —
`auswahl.ts:48` filtert über `visibleSwitcherModules(groups, env)`, und der Dateikopf schreibt die Folge
aus („ein Modul mit `showInSwitcher: false` …", `:34`). **`showInSwitcher` im radio-Eintrag entscheidet
also mit, WER die Notiz überhaupt sieht** — bei einem Modul, dessen Kiosk-Zweig login-frei ist, gehört
das ausdrücklich entschieden und nicht nebenbei gesetzt (Falle 23).

---

## 5. Fallen, die kein Gate findet

**Zur Benennung — drei Nummerierungen kollidieren, deshalb eine Konvention.** „**Suite-Falle N**" meint
die zwölf Fallen aus `iuk-suite/CLAUDE.md`. „**Falle 61 / 57 / 19 (lagerbuch-Zählung)**" meint die
Nummerierung aus `docs/lagerbuch-portierung-analyse.md`. Eine nackte Zahl ohne Zusatz meint **einen
Eintrag dieses Kapitels**. Zwei Einträge (25 und 26) handeln ihrerseits **von** Suite-Fallen — dort ist
der Unterschied besonders leicht zu verlesen.

**Einunddreißig** Einträge: dreißig aus 35 Rohbefunden (fünf Zusammenführungen) **plus einer, der erst
in der Nacharbeit vom 17.08. entstanden ist** (Nr. 31, Anmelde-Dreieck) — deshalb geht die Rechnung
„35 minus fünf" allein nicht auf. `pnpm typecheck`, `pnpm lint`,
`pnpm build` und Vitest sind für diese Klasse blind — teils strukturell, teils weil der eigene Client
die auslösende Eingabe nie erzeugt. **Jede Falle nennt den Satz, warum kein Gate sie sieht.**

### Datenmodell und Import

**1. Millisekunden gegen Sekunden** *(`RA-DM-01` + `R-01`)* — vollständig in Befund 1, Kapitel 2.
*Kein Gate:* beide Paritäts-Arme leiten aus derselben Mapping-Funktion ab (`portal.ts:73-76`), ein
konsistenter Faktor-1000-Fehler hasht identisch; `typecheck` sieht zwei `number`; Vitest sieht die
Zeilen, solange der Boot-Purge nicht gelaufen ist.

**2. Keine Trigger, keine CHECKs — die Absicherung ist ein PARTIELLER Unique-Index, und `drizzle-kit` kann ihn nicht erzeugen** *(`RA-DM-02` + `R-02`, `RA-DM-02` präzisiert)*

Gemessene Negativaussage: radio-admin hat **null** Trigger und **null** CHECK-Constraints —
`rg -rn "CREATE TRIGGER|create trigger|CHECK *\(" server shared client scripts docker` liefert 0
Treffer (Exit 1), und keine der fünf Migrationen enthält beides. Die `lagerbuch`-Präzedenz
„`onConflictDoUpdate` bricht an append-only-Triggern" trifft hier also **nicht** zu; der Riegel liegt
anders.

Die **7 deklarierten Indizes**: `devices_issi_unique` und `software_versions_value_unique` (beide
`0000`), `device_events_device_id_idx` (`0000`), `loans_device_id_idx` / `loans_borrowed_at_idx` /
`loans_returned_at_idx` (`0003`) — und `loans_device_active_uidx`, ein **partieller** Unique-Index
`ON loans (device_id) WHERE returned_at IS NULL`, handgeschrieben ans Ende von `0003_kind_spot.sql`,
weil drizzle-kit partielle Indizes nicht emittieren kann. Die Datei sagt es selbst: „hand-added because
drizzle-kit cannot emit partial indexes … it is invisible to the drizzle schema, so future
`drizzle-kit generate` runs neither see nor drop it." Der Gegenbeleg im Code ist genauso hart: der
Drizzle-Tabellenausdruck führt in `schema.ts:132-136` **genau drei** gewöhnliche Indizes — der
partielle fehlt dort, wie `schema.ts:112-115` beschreibt.

**Zwei Folgen.** (a) Ein mit `drizzle-kit generate` erzeugtes radio-Schema lässt den Index **still**
weg; der Riegel „höchstens eine aktive Ausleihe je Gerät" ist dann weg, und weil die Altdaten die
Invariante erfüllen, importiert alles sauber. (b) SQLite verlangt, dass das Konfliktziel eines Upserts
einen Unique-Index **trifft**, und bei einem partiellen Index muss das Ziel dieselbe `WHERE`-Klausel
tragen: `onConflictDoUpdate({ target: loans.deviceId })` kann `loans_device_active_uidx` nicht treffen.
Historie im Bulk zu importieren ist gefahrlos (dort ist `returned_at NOT NULL`, der Index greift
nicht); zwei **aktive** Leihen für dasselbe Gerät schlagen hart fehl.

**Dritter Halbsatz derselben Falle:** `device_events.source` trägt in Drizzle ein Enum (`schema.ts:96`),
in SQL steht aber nur `` `source` text NOT NULL `` (`0000`). Die DB akzeptiert **jeden** String; ein
Importer, der einen fünften Wert schreibt, passiert DB und Drizzle unbeanstandet und bricht erst in
erschöpfenden Client-Switches.

*Kein Gate:* der fehlende Index ist eine **nicht** erzeugte SQL-Zeile — `typecheck` und `build` fassen
Migrationen nicht an, Parität ist grün, weil die Altdaten die Invariante erfüllen. Sichtbar wird es,
wenn der Kiosk ein zweites Mal dasselbe Gerät ausleiht. Gegenmaßnahme: Index von Hand in die Migration
**und** ein Vitest-Test, der den doppelten Aktiv-Insert als Fehler erwartet — sonst ist die Zeile beim
nächsten `drizzle-kit generate` wieder weg.

⚠️ **Präzisiert:** die Negativaussage stützt sich **allein** auf Quelltext-Grep und Migrationslektüre.
Der Zusatzbeleg „auch `sqlite_master` einer lokalen DB zeigt keine Trigger" ist zu **streichen** — diese
DB ist vorbaselinig und enthält `loans`/`users`/`api_tokens` überhaupt nicht (Kapitel 8, Nr. 3).

**3. Der „offensichtliche" Fremdschlüssel auf `loans.device_id` zerstört die Ausleih-Historie** *(`R-03`, gehalten)* —
Mechanik in Pflicht 2. *Kein Gate:* ein zusätzlicher FK ist gültiges Drizzle, gültiges SQL und
paritätsgrün; der Schaden entsteht erst **Monate später**, bei der ersten Geräteausmusterung. `devices`
und `device_events` sehen gleich aus und sind gegensätzlich (`schema.ts:88-90` **ist** ein
Cascade-FK und muss einer bleiben).

**4. Zwei tote Spalten: `software_versions.created_by` und `api_tokens.created_by` werden geschrieben und NIE gelesen** *(`RA-DM-04`, präzisiert)*

`software_versions.created_by` wird an genau zwei Stellen gesetzt (`softwareVersionRepo.ts:39`, `:53`)
und in **keiner** Projektion selektiert: `listSoftwareVersions` (`:141-148`) wählt id, value, createdAt,
sortOrder, isTarget, deviceCount; `getTargetVersion` (`:65`) nur `value`. `api_tokens.created_by` wird
auf `apiTokenRepo.ts:50` gesetzt und in `listApiTokens` (`:79-86`: id, name, prefix, createdAt,
lastUsedAt, revokedAt) nicht gelesen. **Vollständigkeitsbeleg:**
`rg -n "createdBy" server/src client/src shared/src --glob '!*.test.ts*'` liefert **18** Treffer
(⚠️ nicht 19 — Kapitel 8, Nr. 4); kein einziger ist eine SELECT-Projektion oder ein Anzeigepfad für
diese beiden Spalten. Gegenprobe **lebendig**: `devices.created_by`/`updated_by`
(`routes/devices.ts:89-94` → `createdByName`/`updatedByName`, `client/src/hooks/useDevice.ts:12`),
`devices.tei`, `api_tokens.last_used_at`, `api_tokens.revoked_at`, `loans.return_note`,
`loans.snapshot_device_type`, `software_versions.sort_order`, `devices.hiorg_id`/`funktion`/
`bedieneinheit`.

*Kein Gate:* eine geschriebene und nie gelesene Spalte ist typkorrekt, paritätsgrün und
laufzeitfehlerfrei — sie wandert als toter Ballast mit, wenn niemand hinschaut.

**5. „Genau ein `is_target`" steht nur im Anwendungscode, und der Leser hat kein `ORDER BY`** *(`RA-DM-06`, gehalten)*

Der Schema-Kommentar behauptet „Exactly one version is the update target" (`schema.ts:53-55`), aber es
gibt **keinen** DB-Constraint: kein partieller Unique auf `is_target`, kein Trigger, kein CHECK
(`0002_numerous_mandroid.sql` enthält beide `ALTER TABLE` plus Backfills, sonst nichts). Erzwungen wird
die Invariante ausschließlich in einer Anwendungstransaktion (`softwareVersionRepo.ts:81-87`: erst
`.set({ isTarget: true }).where(eq(id))`, dann `.set({ isTarget: false }).where(ne(id))`). **Der Leser
ist wehrlos:** `getTargetVersion` (`:63-70`) macht `.where(eq(isTarget, true)).limit(1).get()` **ohne
`orderBy`**.

Schreibt eine Datenmigration `is_target = 1` auf mehrere Zeilen — naheliegend, wenn man die Spalte je
Zeile aus einer Quelle mappt —, akzeptiert die DB das schweigend, und der Update-Stand **aller** Geräte
hängt danach daran, welche Zeile SQLite zufällig zuerst liefert. *Kein Gate:* nicht reproduzierbar,
kein Fehler, kein Test schlägt an; Parität ist grün, weil die Zeilen ja da sind. Gegenmaßnahme: die
Abfrage aus Pflicht 4, Nr. 2 — oder den partiellen Unique-Index in die DB ziehen.
**Nebenaussage:** `sort_order` ist NUR Anzeigereihenfolge und leitet den Ziel-Stand ausdrücklich
**nicht** ab (`schema.ts:48-51`) — eine neu erfasste Version, die oben landet, wird nie automatisch
Ziel.

**6. Idempotenz: `onConflictDoUpdate` ÜBERSCHREIBT Suite-Arbeit — und ein Test mit zweimal derselben Quelle beweist nichts** *(`R-05`, gehalten)*

Beide vorhandenen Importer nutzen Upsert per Primärschlüssel (`portal.ts:57-63`
`.onConflictDoUpdate({ target: services.id, set: v })`). Ein Idempotenz-Test, der zweimal dieselbe
Quelle importiert, ist damit **immer** grün. Der echte Fall ist asymmetrisch und geht in **beide**
Richtungen falsch: (a) `onConflictDoUpdate` walzt eine Zeile platt, die in der **Suite** nach der
Generalprobe entstanden ist — bei `devices` trifft das `update_note`, das laut `schema.ts:33-36`
append-only ist („never overwritten by the update flow"); bei `loans` trifft es `returned_at`, und eine
in der Suite zurückgegebene Ausleihe wird **wieder aktiv** und kollidiert dann mit dem partiellen Index
aus Falle 2. (b) `onConflictDoNothing` lässt dafür eine in der **Alt-App** geänderte Zeile stehen.

Die belastbare Lösung ist keine Konfliktstrategie, sondern der **Ablauf**: Generalprobe gegen eine
Schnappschuss-Kopie, Echtimport gegen eine **leere** Ziel-DB nach dem Freeze. Der Idempotenz-Test muss
den asymmetrischen Fall prüfen: importieren, **Ziel-Zeile verändern**, erneut importieren, und
festschreiben, was gelten soll. ⚠️ Bei `device_events` ist Upsert **fachlich falsch** — die Tabelle ist
ein Journal, `INSERT OR IGNORE` ist richtig (`lagerbuch-cutover.md:409` nennt genau diese
Unterscheidung).

*Kein Gate:* `portal.ts:105-107` warnt selbst — „parity runs AFTER this (idempotent) write. A thrown
parity error means the target was already mutated … not ‚nothing happened'". Der Gate-Lauf ist grün,
weil er den Fall gar nicht herstellt.

### Kiosk und Postgres

**7. Was im radio-inventar-Postgres bleibt, ist EINE Sache, nicht zwei** *(`RI-01`, präzisiert)* —
ausgeschrieben in Pflicht 19. Als Falle festgehalten: **`AdminUser` ist der einzige Grund, den Postgres
nicht fallen zu lassen**, und die Zeilenzahl ist ungezählt. *Kein Gate:* eine gelöschte Datenbank
meldet nichts; die Zahl ist nur am laufenden Postgres messbar (Kapitel 7).

**8. Methodenfalle: aus dem Repository lässt sich der Prod-Tabellenbestand grundsätzlich NICHT ableiten** *(`RI-02`, präzisiert — nicht mehr blockierend)*

`schema.prisma` kennt genau ein Modell. `prisma/create-session-table.sql` erzeugt eine Tabelle
**außerhalb** der Migrationen und ist Prisma völlig unbekannt (`:1-2`: „Create session table for
connect-pg-simple") — und wird im gesamten Backend von **nichts** ausgeführt: kein Import, kein
Dockerfile-Schritt, kein `package.json`-Script (`rg -rn "create-session-table" apps/backend` → leer).
Genau dieselbe Klasse: der partielle Unique-Index war handgepflegt, weil Prisma partielle Indizes nicht
ausdrücken kann („Prisma cannot express partial indexes in schema.prisma, so it is maintained here by
hand", `20260627155351/migration.sql:23`).

⚠️ **Einordnung (nachgetragen): dieser Eintrag ist KEINE Baufalle.** Er richtet sich an den
Analysierenden, nicht an den Compiler — es gibt nichts, was man beim Bauen falsch machen könnte, nur
etwas, was man beim **Schließen** falsch machen kann. Er behält seine Nummer (Kapitel 7, Nr. 8 und
Nr. 15 sowie Eintrag 7 dieses Kapitels verweisen darauf), zählt aber in der Kopfzeile als
**Methodenhinweis**, nicht als Falle, die kein Gate findet.

**Lehre:** eine eingecheckte DDL-Datei kann von Hand ausgeführt worden sein oder nicht — **`pg_tables`
ist die einzige verlässliche Quelle.** ⚠️ **Präzisiert:** die Folgerung „ein Prisma-basiertes Audit
übersieht den Sitzungsspeicher" ist **nicht** haltbar; einen Postgres-Sitzungsspeicher gibt es nach
Codelage nicht (Kapitel 8, Nr. 1). *Kein Gate:* keins — das ist eine Methodenfalle für den
Analysierenden, nicht für den Compiler.

**9. Dreifach deklarierte Loan-Form mit DREI verschiedenen Zeittypen auf demselben Feld** *(`RI-04`, gehalten)*

`borrowedAt` existiert dreimal, jedes Mal anders typisiert: als **epoch-ms Integer** im geteilten
Zod-Schema (radio-admins Drahtformat —
`radio-inventar/packages/shared/src/schemas/radio-admin-loan.schema.ts:21`, Kommentar `:9-11`
„timestamps are epoch-ms INTEGERS on the wire. The consuming repositories convert them to JS `Date` …
so radio-inventar's own DTOs/serialization stay byte-identical for the kiosk frontend"), als **`Date`**
im NestJS-Response-DTO (`modules/loans/dto/active-loan-response.dto.ts:48`) und als **ISO-`string`** im
Zod-Schema des Frontends (`apps/frontend/src/api/loans.ts:17-27`). Die Konvertierung passiert **stumm**
in den Repositories (`new Date(ms)` → JSON-Serialisierung → ISO-String). Dazu doppelt das DTO die
Gerätefelder (`DeviceInfoDto` mit callSign/status, `:4-23`), während radio-admins Nutzlast dieselbe
Information als `snapshotCallSign`/`snapshotDeviceType` führt (`radio-admin-loan.schema.ts:27-37`); der
Kiosk verschmilzt beides erst clientseitig zu `DeviceWithLoanInfo` (`api/devices.ts:24-27`).

*Kein Gate:* beim Port in eine RSC-Welt ohne diese drei Ebenen **verschwindet die Konvertierungsstelle**,
und der Fehler ist **kein Typfehler**, sondern ein falsches Datum in der Anzeige.

**10. Die Suche ist akzent- und ß-tolerant, UND-verknüpft — und sucht in Übersicht und Rückgabe über VERSCHIEDENE Felder** *(`RI-06`, präzisiert)*

`normalizeSearchText` (`apps/frontend/src/lib/device-filter.ts:24-31`) senkt Groß-/Kleinschreibung,
zerlegt per NFD und entfernt kombinierende Diakritika (ü→u, ä→a, ö→o) und bildet ß→ss ab. Die Anfrage
wird an Leerzeichen zerlegt und **alle** Terme müssen treffen (`terms.every`). ⚠️ **Wirkung präzise:**
„Straße" und „Strasse" werden gegenseitig auffindbar, und „Mühlheim" ist über die Eingabe „Muhlheim"
findbar. **NICHT geleistet wird die ue/ü-Äquivalenz** — „Muelheim" und „Mühlheim" bleiben auch mit
Normalisierung gegenseitig unfindbar, weil die Ersatzschreibung „ue" kein kombinierendes Zeichen ist
(Kapitel 8, Nr. 5).

**Das Suchfeld ist nicht dasselbe:** in der **Rückgabe** wird über `device.callSign` UND `borrowerName`
gesucht (`lib/loan-filter.ts:5-9`, Platzhalter „Rufname oder Name…", `routes/return.tsx:70`), in der
**Übersicht** über `callSign`, `deviceType`, `serialNumber`, `location` (`device-filter.ts:33-41`) —
dort kommt der Entleiher **nicht** vor, obwohl er in der Zeile steht. Statusfilter: `'ALL' |
'AVAILABLE' | 'ON_LOAN' | 'UNAVAILABLE'`, wobei `UNAVAILABLE` = DEFECT **oder** MAINTENANCE
(`device-filter.ts:43-54`).

*Kein Gate:* wer beim Port eine einzige Suche baut, ändert beide Verhalten, und wer die Normalisierung
weglässt, bricht den ß- und den Umlaut-Fall — **ohne Umlaut-Testdaten sieht das kein Test.**

**11. Es gibt kein Enrollment, sondern ein geteiltes Geheimnis** *(`RI-07` + `R-A1`)* — vollständig in
Befund 3, Kapitel 2. *Kein Gate:* der Zustand ist funktionsfähig; er wird erst am Tag des ersten
Geräteverlusts zum Problem, und dann ist es zu spät für ein Schema.

**12. Falle 61 (lagerbuch-Zählung) hat bei `radio` Datenwirkung** *(`RI-08` + `R-B4` + `B13`)* — vollständig in Befund 2,
Kapitel 2. *Kein Gate:* `iuk-suite/src/core/routing.test.ts` schreibt das Middleware-Verhalten
ausdrücklich **fest**, und Playwright fährt gegen genau einen `baseURL` (Falle 57, lagerbuch-Zählung). Der Nutzer sieht
nur ein Tablet, das sich „nicht merken" will.

**13. Der gesamte Kiosk ist hinter zwei harten Weiterleitungen gesperrt, und die zweite hängt am Zählen von `AdminUser`** *(`RI-10`, gehalten)*

Der Wurzel-Loader leitet bei fehlendem Token auf `/token-setup`
(`apps/frontend/src/routes/__root.tsx:89-91`, `throw redirect`) und danach bei unfertigem Setup auf
`/setup` (`:100-112`), beide **vor** jeder Kiosk-Ansicht. Der Setup-Status kommt aus
`prisma.adminUser.count()` (`modules/setup/setup.repository.ts:17`). Auf Fehler fällt die Prüfung
bewusst auf `isSetupComplete: false` zurück, also auf **Sperren** (`:99`: „secure default").

**Zwei Konsequenzen.** (i) Ohne portierten Setup-Assistenten und ohne `AdminUser`-Zeile ist der Kiosk
**vollständig unbenutzbar**, auch für die login-freien Ausleih-/Rückgabewege — die Sperre lässt sich
nicht durch „Verwaltung fällt weg" (Entscheidung 3) mit entfernen, ohne den Riegel neu zu bauen.
(ii) Die Weiterleitung ist eine **Client-Route** und ersetzt keinen serverseitigen Riegel; der echte
Riegel ist der `ApiTokenGuard` (`api-token.guard.ts:24-52`).

*Kein Gate:* eine Client-Weiterleitung wegzulassen ist typkorrekt und in jedem Unit-Test unsichtbar —
sie fehlt erst im Browser, und der serverseitige Riegel dahinter fehlt still.

### Auth

**14. radio-admin hat eine ZWEITE Auth-Welt — die Loan-API hängt VOR dem Session-Riegel und liest ZWEI Kopfzeilen** *(`RA-LOAN-1`, präzisiert)*

In `radio-admin/server/src/app.ts` wird `loanApiRoutes` in Zeile **51** gemountet,
`app.use('/api/*', requireAuth(cfg))` erst in Zeile **54** — Hono wertet Middleware in
Registrierungsreihenfolge aus, die Loan-API ist also **absichtlich** außerhalb der Sitzungsprüfung
(Kommentar `:48-50`) und trägt ihren eigenen Guard.

⚠️ **Präzisiert und für den Port entscheidend:** `extractToken` akzeptiert **neben**
`Authorization: Bearer <t>` auch den Kopf **`X-API-Key: <t>`** (`routes/loanApi.ts:63-74`). Der Guard
lässt durch, wenn **entweder** ein in der DB gehashter API-Token passt (`verifyApiToken`) **oder** ein
Pocket-ID-client_credentials-JWT gegen Issuer/Audience/optional Subject verifiziert (`:90-93`,
`auth/loan-api-jwt.ts:57-74`); der JWT-Pfad ist nur aktiv, wenn `OIDC_ISSUER` **und**
`LOAN_API_EXPECTED_AUDIENCE` gesetzt sind (`:10-12`), sonst kurzschließt er auf `false`.

*Kein Gate:* in Next.js gibt es diese Mount-Reihenfolge **nicht** — jeder Route Handler unter `api/`
braucht seinen Riegel explizit, **und beide Kopfzeilen**. Ein Handler, der nur `Authorization` liest,
bricht jeden Aufrufer, der `X-API-Key` schickt, und der Compiler sagt nichts.

**15. `AUTH_DEV_BYPASS` erzeugt einen echten DB-Nutzer `dev-user` — in Produktion nur über einen Umweg** *(`RA-BYPASS-1`, präzisiert)*

Unter `AUTH_DEV_BYPASS=true` setzt `requireAuth` eine synthetische Sitzung mit `sub: 'dev-user'` und der
Rolle aus `DEV_USER_ROLE` (Default `admin`) und ruft `upsertUser(db, 'dev-user', …)` bei **jedem**
Request (`auth/middleware.ts:18-33`, `config.ts:39-41`). ⚠️ **Gegensperre, die die Rohfassung
unterschlägt:** `config.ts:48-52` lässt `AUTH_DEV_BYPASS=true` bei `NODE_ENV=production` gar nicht erst
booten, zusätzlich warnt `warnIfDevBypass` laut (`middleware.ts:56-64`).

Das Literal `dev-user` kann in der produktiven SQLite also **nur** stehen, wenn dieselbe Datei je mit
`NODE_ENV != production` bedient wurde (lokaler Lauf gegen das Volume, Import-/Migrationswerkzeug,
Zustand vor Einführung dieser Prüfung). Beim Import in die Suite bleibt `dev-user` ein möglicher
`created_by`-Wert, **der auf keinen Pocket-ID-`sub` abbildet**.

*Kein Gate:* es ist gültiger Text in einer `text`-Spalte. Messbar nur an der echten Datenbank
(Kapitel 7).

**16. `@Public()` heißt NICHT öffentlich — es umgeht nur den Session-Guard; die Token-Mauer hat MINDESTENS VIER Löcher** *(`RI-PUBLIC-1`, präzisiert)*

Zwei unabhängige Guards mit zwei getrennten Metadaten-Keys: `SessionAuthGuard` prüft `IS_PUBLIC_KEY`
(`common/guards/session-auth.guard.ts:13-20`, `common/decorators/public.decorator.ts:4`),
`ApiTokenGuard` prüft `BYPASS_API_TOKEN_KEY` (`api-token.guard.ts:26-32`). Die Kiosk-Controller
`devices`, `borrowers`, `loans` tragen `@Public()` auf **Klassenebene**
(`modules/devices/devices.controller.ts:16`, `modules/borrowers/borrowers.controller.ts:10`,
`modules/loans/loans.controller.ts:15`) — sie sind sitzungsfrei, aber **weiterhin token-gemauert**.

⚠️ **Präzisiert: `grep -rn '@BypassApiToken()' apps/backend/src` liefert VIER Fundstellen, nicht drei** —
`modules/auth/token.controller.ts:29`, `modules/health/health.controller.ts:11`,
`modules/admin/auth/auth.controller.ts:96` und `:108`. Die vierte steht **unindentiert, also auf
Klassenebene**: wie viele Routen dahinter liegen, ist **nicht gezählt** (Kapitel 7).

*Kein Gate:* wer beim Portieren `@Public()` als „offen" liest, reißt die einzige Zugangskontrolle des
Kiosk ein — und kein Test merkt es, weil die Route danach genauso antwortet wie vorher, nur eben für
jeden.

**17. `pocketid:<sub>` — ein präfixierter `sub`, der in den gemessenen Modulen NIE persistiert wird** *(`RI-SUB-1`, präzisiert)*

Weder der `feedback`/`lagerbuch`-Bruch (Zufalls-UUID) noch der saubere Fall: `authenticateCallback` gibt
`` id: `pocketid:${userInfo.sub}` `` zurück (`modules/admin/auth/pocket-id.service.ts:133`), was über
`createSession` als `request.session.userId` landet (`auth.service.ts:107`, `:163`). Die lokale Tabelle
`AdminUser` hat `id String @id @default(cuid())` (`prisma/schema.prisma:17-18`) — eine Zufalls-ID —,
**aber ein Pocket-ID-Login legt dort keine Zeile an**; die Identität lebt nur in der Sitzung.
`AdminUser` wird im Prisma-Schema von keinem anderen Modell referenziert (`:14`, `:17`).

⚠️ **Reichweite präzisiert:** der Beleg „außerhalb von `auth.service.ts` speichert kein Modul die
`session.userId`" stammt aus einem `rg` **nur über `modules/admin`**. `modules/setup`, `devices`,
`loans`, `borrowers` und `radio-admin` sind **ungeprüft**. Für den gemessenen Ausschnitt gilt: keine
Identitäts-Migration nötig, **aber auch keine Nachvollziehbarkeit** — die Admin-Aktionen des
Kiosk-Backends tragen keinen Urheber.

*Kein Gate:* das Präfix bricht nur, wenn jemand annimmt, ein gespeicherter `userId` sei ein blanker
`sub` — und diese Annahme ist typkorrekt (`string`).

**18. Das Kiosk-Session-Cookie geht in Prod an die ELTERNDOMAIN `.iuk-ue.de`, mit `SameSite=None`** *(`RI-COOKIE-1`, gehalten)*

`getSessionCookieOptions()` leitet in Produktion aus `PUBLIC_APP_URL` die letzten zwei Hostname-Teile ab
und setzt `cookieDomain = '.' + parts.slice(-2).join('.')`
(`apps/backend/src/config/session.config.ts:16-28`) — bei `…iuk-ue.de` also **`.iuk-ue.de`** —, dazu
`secure: isProduction` (`:37`), `sameSite: isProduction ? 'none' : 'lax'` (`:39`) und
`...(cookieDomain && { domain: cookieDomain })` (`:41`). Der Kommentar nennt „subdomain cookie sharing"
ausdrücklich als Absicht (`:26`).

**Das Admin-Sitzungscookie des Kiosk geht damit heute an JEDE `iuk-ue.de`-Subdomain, inklusive aller
Suite-Hosts.** Bei der Zusammenlegung auf `radio.iuk-ue.de` trifft dieses Alt-Cookie auf Suite-Cookies
desselben Scopes; Namenskollisionen oder ein nicht gelöschtes Alt-Cookie sind nicht ausgeschlossen.
Zusätzlich: `express-session` läuft **ohne `store`** (`main.ts:74-82`) — MemoryStore, Sitzungen sind bei
jedem Neustart weg und über mehrere Instanzen nicht teilbar.

*Kein Gate:* ein `domain`-Attribut ist typkorrekt, und Playwright fährt gegen **einen** Host, wo sich
ein domain-weites Cookie **exakt wie ein host-only** verhält (Falle 19, lagerbuch-Zählung).

### Suite-Seite: Cookies, Riegel, Registry

**19. Das Geräte-Cookie darf KEIN `domain` tragen — und Playwright kann den Fehler nicht sehen** *(`R-A5`, gehalten; gilt unter Entscheidung 1, Zweig (b))*

`helferCookieOptionen` setzt `httpOnly`, `sameSite: 'lax'`, `path: '/'`, `secure` aus `NODE_ENV`,
`maxAge` — und **kein `domain`** (`iuk-suite/src/app/m/lagerbuch/_lib/helferSitzung.ts:137-145`). Die
naheliegende Vorlage ist die **falsche**: `src/core/auth/cookies.ts:46-59` setzt `domain` aus
`AUTH_COOKIE_DOMAIN`, und das ist für die **Suite-Sitzung** richtig (`helferSitzung.ts:108-136`
begründet es ausführlich). Kopiert nach `radio`, wird aus einem gerätegebundenen Cookie eines, das an
**jeden** Suite-Modul-Host mitgeschickt wird — und damit hält es Falle 61 (lagerbuch-Zählung; Eintrag 12 dieses Kapitels) auch **nach** der
Einlösung offen.

Ebenso mitzunehmen: **das Löschen muss über DIESELBE Optionen-Funktion mit `maxAge: 0` laufen**
(`abmelden/route.ts:89`) — abweichende Attribute machen das Löschen wirkungslos, und der Browser meldet
das nicht.

*Kein Gate:* wörtlich aus der Quelle — „Playwright fährt gegen EINEN Host, und dort verhält sich ein
domain-weites Cookie exakt wie ein host-only (Falle 19)"; `pnpm build`/`typecheck` sehen ein
zusätzliches `domain`-Feld nicht, es ist typkorrekt. Die einzige Absicherung ist eine
**Quelltext-Zusicherung im Unit-Test**, wie `lagerbuch` sie führt.

**20. Der Widerrufs-/Abmeldeweg braucht einen Route Handler — eine Server Component kann kein Cookie räumen** *(`R-A6`, gehalten)*

Wenn der Recheck aus Pflicht 15 ein gesperrtes Gerät erkennt, liegt der Befund in einem Layout oder
einer Seite, also in einer **Server Component**. Dort ist `cookies()` versiegelt: `delete`/`set`/`clear`
sind durch einen werfenden Proxy ersetzt — `helferZugang.ts:117-131` trägt dazu „WARUM DER UMWEG ÜBER
/abmelden — gemessen, nicht vermutet" samt Zitat aus Next 16.2.11 und dem Satz „also NICHT unsauber,
sondern ein **Laufzeitfehler**". Und er trifft ausgerechnet den Fall „Tablet wurde gerade gesperrt".

`radio` braucht dieselbe Konstruktion: der Riegel leitet per `redirect()` **als String** auf einen
GET-Route-Handler, der 303 auf `/` antwortet und das Cookie mit denselben Attributen löscht
(`abmelden/route.ts:8-14`, `:45-50` nicht-werfende Host-Prüfung mit eigener 404, `:73-76` 303, `:89`
Löschen). Zwei Nebenbedingungen: (1) der Pfad darf **nicht** unter dem dynamischen Enrollment-Segment
liegen, (2) auf diesen Pfad gehört **kein `<Link>`** — Nexts Prefetch beendet die Sitzung beim
Darüberfahren.

*Kein Gate:* `cookies().delete(...)` in einer Server Component ist typkorrekt und kompiliert; der
Fehler entsteht erst zur Laufzeit, und zwar nur auf dem Sperrpfad, den kein Test anfährt. Bei einem
Kiosk ohne Bedienpersonal ist eine so entstandene Abmeldung ein Ausfall, den niemand bemerkt.

**21. Der Riegel hat die LAGERBUCH-Form, nicht die `files`-Form** *(`R-B1`)* — vollständig in Befund 2,
Kapitel 2. *Kein Gate:* eine `validateRadioHosts`-Boot-Prüfung nach `files`-Vorbild würde den Zustand
**vor** dem Cutover (0 Hosts) und den Zustand „abgelöste Domain läuft mit" (≥2 Hosts) fälschlich
abbrechen — beide sind bei `radio` erlaubt, und der Fehler zeigt sich als **Startabbruch am schlechtesten
Tag**, den kein Test vorher herstellt.

**22. Mit `requiresAuth: false` hat `/admin` NULL Middleware-Gating** *(`R-B2`)* — vollständig in
Befund 2, Kapitel 2. *Kein Gate:* eine vergessene Riegelzeile in einer Action ist typkorrekt und
lint-sauber; `iuk-suite/src/core/routing.ts:58-66` gatet nach dem Modul aus dem Segment und
unterscheidet `/m/radio/` und `/m/radio/admin/...` **nicht**.

**23. `SUITE_ADMIN_GROUP_RADIO` ohne Registry-Eintrag ist ein Boot-Fehler — LEER gesetzt ist eine stille Aussperrung** *(`R-D2`, gehalten)*

`validateGroupConfig` läuft über alle Env-Namen mit den Präfixen
`SUITE_ADMIN_GROUP_`/`SUITE_ACCESS_GROUP_` und meldet jeden, dessen Suffix zu keinem bekannten
Modul-Key passt („passt zu keinem Modul. Bekannt: …", `iuk-suite/src/core/groups.ts:141-155`); die
Meldung führt über `src/core/bootstrap.ts:84-94` zu einem echten **Startabbruch**. In
`src/core/registry.ts` gibt es heute **keinen** `radio`-Eintrag (gemessen: portal 57, qr 63, feedback
79, files 103, lagerbuch 119, aufgaben 170, alpha 174, gamma 178, beta 181, kioskdemo 184 — kein
radio). **Reihenfolge: erst Registry-Eintrag** (`key: "radio"`, `shell: <Wert>`, `requiresAuth: false`,
`requiredGroups: []`, `adminGroups: [<Vorgabe>]`, `prodHosts: []`, `showInSwitcher: <Wert>`), **dann Env.**

⚠️ **Das Feld, das der Entwurf zuerst vergaß, ist `shell`** — und es ist genau das Feld, um das
Entscheidung 13 kreist. `ShellVariant` kennt **drei** Werte (`iuk-suite/src/core/registry.ts:7`:
`"full" | "minimal" | "kiosk"`), und mit `kioskdemo` liegt ein **lauffähiger Präzedenzfall** im Repo:
Registry-Eintrag `{ key: "kioskdemo", shell: "kiosk", requiresAuth: false, showInSwitcher: false }`
(`registry.ts:184-186`), Layout `src/app/m/kioskdemo/layout.tsx` mit
`<Shell variant={mod.shell} moduleKey={mod.key}>`. **Der harte Punkt: `shell` ist EIN Wert je Modul,
`radio` braucht auf demselben Host ZWEI Regime** — Kiosk mit `controlHeight` 56/72 ohne Hülle,
Verwaltung offen. Ein einzelnes Registry-Feld kann das nicht ausdrücken. Die Auflösung steht bereits in
Pflicht 23 (`registry.shell` packt NICHTS ein, das Modul-**Layout** entscheidet, `lagerbuch` rendert
bewusst keine Shell) — der Registry-Wert bleibt damit reine Deklaration, und **welchen** Wert er trägt,
ist eine Frage der Lesbarkeit, nicht der Wirkung.

⚠️ **Die eigentliche Falle ist die zweite Hälfte:** `SUITE_ADMIN_GROUP_RADIO` **leer** gesetzt ist eine
gültige Aussage („keine modul-eigenen Admins") und wird **nicht** gemeldet — die Leer-Meldung greift
nur bei `ACCESS` (`groups.ts:156`), und die Asymmetrie ist Absicht (`:139`). In Verbindung mit
Pflicht 17 (`.some()` auf leerer Liste gewährt nichts) sperrt das die Verwaltung für **alle** aus,
inklusive Betreiber. *Kein Gate:* die erste Hälfte ist ein lauter, selbsterklärender Startabbruch — die
**zweite** ist still und wird von keiner Prüfung gemeldet.

### Stack-Sprung: die zwölf Fallen

**24. Suite-Falle 9: 31 `render`-Funktionen, und die Dateimengen sind nicht deckungsgleich** *(`B06`, präzisiert)* —
vollständig in Befund 5, Kapitel 2. *Kein Gate:* `CLAUDE.md:61-64` sagt es wörtlich — `pnpm build` prüft
Modulgrenzen **statisch**, nicht die tatsächliche Serialisierung eines Requests, ein `mount()` in jsdom
ist ein einziger JS-Prozess **ohne RSC-Grenze überhaupt**, und `typecheck`/`lint` sehen es sowieso nicht.
Nur ein echter Abruf zeigt den Fehler.

**25. Suite-Fallen 1, 6 und 7 sind berührt — 6 und 7 sind gegenläufig und dürfen NICHT zusammengelegt werden** *(`B07`, gehalten)*

**Suite-Falle 1** (Compound-Zugriff in Server Component = HTTP 500, `CLAUDE.md:11-13`): berührt. radio-admin
ist formularlastig (Geräte anlegen/ändern, Software-Versionen, Token-Anlage, Import-Assistent), der
Kiosk bringt `AdminLoginForm.tsx`, `SetupForm.tsx`, `BorrowerInput.tsx` mit — `Form.Item`,
`Input.TextArea`, `Descriptions.Item`, `Typography.Title` sind die Kandidaten. **Entlastend:** `Card`,
`Table`, `Tag`, `Statistic`, `Result`, `Progress` sind laut Suite-Falle 1 sicher, und genau die tragen die
Tabellenflächen. ⚠️ Die **Stellenzahl** fehlt — anders als bei Suite-Falle 9, wo 31 gemessen sind (Kapitel 7).

**Suite-Falle 6** (`WERT` aus `"use client"`-Modul kommt in RSC nicht an, `CLAUDE.md:27-30`): berührt, weil
beide Alt-Apps Konstanten neben Komponenten legen — `apps/frontend/src/lib/touch-targets.ts`
(`TouchTargetSize`) ist der Prototyp, ebenso Status-Enums aus `packages/shared`. Die Werte gehören in
ein `_lib/` **ohne** `"use client"`.

**Suite-Falle 7** (`@ant-design/icons` in RSC = 500, und `"use client"` macht es STILL, `CLAUDE.md:31-44`):
berührt über zwei Wege — `react-icons` in radio-admin und `lucide-react ^0.577.0` im Kiosk müssen
**beide** auf die `ICONS`-Map. ⚠️ **Kritisch:** setzt man `"use client"` auf `icons.ts`, verwandelt sich
Suite-Falle 7 in Suite-Falle 6 — **HTTP 200 mit leerer Map und still falschem Icon** (`CLAUDE.md:41-44`: „Laut ist
besser als still"). `src/core/shell/icons.test.ts` riegelt repo-weit ab; geht er rot, liegt die Ursache
in der Datei, die die Meldung nennt, **nicht** in `core/shell`.

*Kein Gate:* Falle 1 und 7 sind Laufzeit-500 auf genau der Seite, die niemand im e2e anfährt; Falle 6
ist HTTP 200 mit falschem Inhalt und damit für **jedes** Gate unsichtbar.

**26. Suite-Fallen 10, 11, 12 sind Testfallen — nur 10 wird hier scharf, 11 gar nicht** *(`B08`, gehalten)*

**Suite-Falle 10** (POST auf Route Handler während der Erstkompilierung wird abgebrochen, `CLAUDE.md:71-85`):
**berührt und scharf.** Das Geräte-Enrollment braucht einen Route Handler unter `api/` (der Kiosk-Client
spricht heute `POST /auth/verify-token`, `token.controller.ts:24`, `:28`), und ein Handler hat kein
Layout — also **Warmlauf-GET vor dem ersten echten POST** plus `page.waitForResponse` statt Warten auf
eine Zustandsänderung.

**Suite-Falle 12** (`.click()` auf Anker navigiert nicht, wenn die Hülle zwischen `mousedown`/`mouseup`
umbricht, `CLAUDE.md:94-110`): **berührt**, sobald `/admin` in `FullShell` mit `SessionProvider` läuft
(Entscheidung 13) — dieselbe Konstellation wie im belegten `lagerbuch`-Lauf; `klickeWennRuhig` aus
`e2e/fixtures.ts` verwenden.

**Suite-Falle 11** (`locator.dragTo()`, `CLAUDE.md:86-92`): **NICHT berührt** nach heutiger Messung —
`rg -ln "dragTo|onDragStart|draggable|dnd-kit|react-beautiful"` über beide Frontends liefert **0
Treffer**. Ausnahme siehe Entscheidung 12.

*Kein Gate:* das sind per Definition die Fallen, die das Gate **selbst** zum Flackern bringen — sie
erzeugen rote Läufe ohne Produktfehler und werden dann wegkommentiert.

**27. Der Pfad zur Theme-Datei ist in der Dokumentation UNEINHEITLICH** *(`B10`, präzisiert)*

Gemessen liegt die Datei unter `iuk-suite/src/core/theme/theme.ts`; `iuk-suite/core/` existiert **nicht**
(„No such file or directory"). **Ohne** `src/`-Präfix geschrieben wird sie in `CLAUDE.md:20` und in
`docs/design/README.md:61`, `:75`, `:295`. ⚠️ **MIT** Präfix schreibt `CLAUDE.md:38` dagegen
`src/core/shell/icons.test.ts` — die Doku ist also **uneinheitlich, nicht einheitlich falsch**
(Kapitel 8, Nr. 6). Wer die Angabe wörtlich nimmt, sucht bei `theme.ts` ins Leere; wer daraus die Regel
„`src/` immer ergänzen" macht, greift bei `:38` daneben. **Empfehlung: in der radio-Spec Pfade
konsequent mit `src/`-Präfix zitieren und die Abweichung ausdrücklich vermerken**, statt sie
stillschweigend zu korrigieren. *Kein Gate:* Dokumentation wird von keinem Linter geprüft.

⚠️ **Einordnung (nachgetragen): auch dieser Eintrag ist keine Baufalle**, sondern ein **Doku-Hinweis** —
der Fehlfall ist ein vergeblicher `ls`, kein falsch gebautes Produkt. Nummer bleibt (Kapitel 8, Nr. 6
verweist darauf), Zählung in der Kopfzeile: **Doku-Hinweis**.

### Betrieb

**28. `radio-admin.iuk-ue.de` darf AUSDRÜCKLICH NICHT in `SUITE_TRAEFIK_RULE` stehen** *(`R-09`, präzisiert)*

`iuk-suite/compose.yaml:153` definiert **einen** Router:
``traefik.http.routers.iuk-suite.rule=${SUITE_TRAEFIK_RULE:-Host(`iuk-ue.de`)}``. Wer den Alt-Host dort
mit aufnimmt, bekommt **nicht** den Redirect, sondern den stillen Portal-Fallback aus Pflicht 6: der
Host erreicht den Container, kein `SUITE_HOST_*` beansprucht ihn, `moduleForHost` liefert **portal** —
`radio-admin.iuk-ue.de` zeigt dann das Portal.

Der Alt-Host braucht einen **zweiten, eigenen Router** mit eigener `redirectregex`-Middleware auf
denselben Service (Middleware hängt am **Router**, nicht am Service — nur so trifft der Redirect nicht
auch die Suite), **302 statt 301** (ein 301 liegt im Cache jedes Kiosk-Tablets und macht den Rollback
praktisch unmöglich), in compose mit doppeltem `$$` gegen die Interpolation.

⚠️ **Präzisiert, zweifach.** (i) Die konkreten Label-Zeilen sind ein **Entwurf**:
`grep -rn redirectregex iuk-suite/docs/ iuk-suite/compose.yaml` bleibt leer — es gibt im Repo **kein
erprobtes Vorbild**. (ii) Die Begründung „am 19.07. sind Repo- und Server-`compose.yaml` schon einmal
auseinandergelaufen" ist im Repo **nicht** nachweisbar und gehört als Betreiberfrage gestellt, nicht
als Tatsache gesetzt (Kapitel 8, Nr. 7).

Unabhängig davon bleibt: die Labels gehören (a) als echte, per Env parametrisierte Labels in die
Repo-`compose.yaml` und (b) als kommentierter Block plus Rollback-Handgriff in `.env.example` neben die
`SUITE_TRAEFIK_RULE`-Zeile (`:369`), wie `.env.example:231-239` es für `lagerbuch` vormacht — denn
`SUITE_TRAEFIK_RULE` lebt in der `.env` auf dem Server, nicht im Repo, und die Redirect-Labels sind
**Struktur**, nicht Konfiguration. ⚠️ **Der DNS-Eintrag `radio-admin.iuk-ue.de` muss BLEIBEN, solange
der Redirect steht** — er ist die Abhängigkeit des Redirects, kein Abbau-Posten.

*Kein Gate:* Traefik-Labels werden von keinem Test des Repos angefasst; der Fehlfall ist eine
funktionierende Seite mit falschem Inhalt.

**29. `/api/health/radio` antwortet `ok` auch gegen eine FRISCH ANGELEGTE, LEERE `radio.db`** *(`R-13`, gehalten)*

Zwei Fallen an derselben Naht. (1) `iuk-suite/src/app/api/health/route.ts` ist zwei Zeilen und liefert
konstant `{status:"ok", timestamp}` — kein Modul, kein Parameter, keine Datenbank. Nach dem Cutover
antwortet `radio.iuk-ue.de/api/health` also weiter `ok`, ohne dass irgendetwas über radio geprüft wäre;
der `[modul]`-Handler sagt selbst, warum er der richtige ist (`src/app/api/health/[modul]/route.ts:12-17`:
„BEWUSST NUR HIER … `/api/health/portal` ist ohnehin der Pfad, den der Docker-Healthcheck und alle
Runbooks benutzen"). **Healthcheck und jeder Runbook-Schritt müssen `/api/health/radio` nennen, nie
`/api/health`.**

(2) Und `/api/health/radio` beweist **weniger, als der Name verspricht**: `checkModuleHealth` prüft
`getModule(key)`, öffnet die Datei und führt `SELECT 1` aus — sonst nichts. `openModuleDatabase` legt
das Verzeichnis bei Bedarf **neu an** (`mkdirSync(dir, {recursive:true})`,
`src/core/db/index.ts:12-22`), und better-sqlite3 legt die Datei an, wenn sie fehlt. **Ein vertipptes
`DATA_DIR` oder ein nicht gemountetes Volume ergibt damit eine nagelneue, leere `radio.db`, auf der
`SELECT 1` klaglos gelingt — health grün, null Geräte.** Genau dieselbe Klasse Fehler, gegen die
`scripts/backup.sh:32-35` hart abbricht („no *.db in DATA_DIR — aborting (misconfigured DATA_DIR?)",
unter dem Kommentar „Hart abbrechen statt ein leeres Tarball zu schreiben und Erfolg zu melden").

*Kein Gate:* der Healthcheck **ist** das Gate, und er ist grün. Die Freigabe nach dem Cutover braucht
deshalb einen **zählenden** Check daneben: die sechs Zahlen aus Pflicht 4 gegen die Alt-Werte, nicht
`status:"ok"`.

**30. PWA: Manifest, Service Worker und Icons als Route Handler UNTER dem Modul — nie global** *(`R-14`, präzisiert)*

Der Kiosk bringt einen ausgebauten PWA-Anspruch mit: `apps/frontend/src/components/pwa/` enthält
`PWAInstallBanner.tsx` (merkt sich die Ablehnung unter einem eigenen localStorage-Schlüssel, `:21-49`),
`PWAOfflineIndicator.tsx` und `PWAUpdateNotification.tsx`. Übernommen wird das als Route Handler unter
`src/app/m/radio/` — **nie global**: ein Manifest an der Wurzel würde **jeden** Suite-Host eine
radio-PWA bewerben, also auch `iuk-ue.de` und `lagerbuch.iuk-ue.de` (`hosts.ts:52-57`: jeder Suite-Host
erreicht denselben Container).

Zwei Punkte, **beide unter Vorbehalt und beide vor der Spec zu messen**:

(i) Ein Service Worker beansprucht nur seinen **eigenen Pfad und darunter** — ein SW unter
`/m/radio/sw.js` deckt `/` auf dem radio-Host **nicht** ab; Auslieferungspfad und Scope-Header müssen
zur **Endadresse** passen, nicht zum Modulpfad, und das ist auf dem Portal-Host anders als auf dem
radio-Host. ⚠️ Der Scope des **Alt**-Kiosks (Auslieferungspfad, `Service-Worker-Allowed`-Header,
Vite-PWA-Konfiguration) ist **nicht gemessen** — das ist eine Regel-Ableitung, kein Befund über die
Alt-App.

(ii) Ob der alte Service Worker den Umschwenk überlebt und alte Antworten aus seinem Cache ausliefert,
während die Suite darunter schon antwortet, hängt an derselben **ungemessenen** Tatsache wie Kapitel 6,
Frage 1: nur wenn der Alt-Kiosk **bereits** `radio.iuk-ue.de` bedient, liegt sein SW nach dem Umschwenk
unter derselben Adresse. Trifft das zu, gehört „alte Registrierung austragen"
(`self.registration.unregister()` im Ersatz-SW bzw. je Tablet einmal Speicher löschen) in **denselben
Handgriff** wie ein etwaiges Neu-Enrollment — man hat das Tablet ohnehin in der Hand.

*Kein Gate:* ein Service Worker mit falschem Scope liefert HTTP 200 mit veraltetem Inhalt; kein
Build-Schritt, kein Test und kein Healthcheck sieht das.

**31. Das Anmelde-DREIECK: `_db/migrations` + `MODULE_MIGRATIONS` + `COPY` im Dockerfile — und der Seed, der daran hängt** *(neu; Falle 23 deckt nur den Registry-Eintrag ab)*

Falle 23 behandelt den **Registry**-Eintrag ausführlich und legt damit nahe, die Modul-Anmeldung sei
abgehandelt. Sie ist es nicht — die Datenbankseite hat **drei** Punkte, und der dritte bricht erst im
Container:

1. Migrationsverzeichnis unter `src/app/m/radio/_db/migrations`.
2. Eintrag in `MODULE_MIGRATIONS` (`iuk-suite/src/core/bootstrap.ts:20`, ausgeführt in `:100`
   `for (const m of [...MODULE_MIGRATIONS, ...CORE_MIGRATIONS])`).
3. **Eine `COPY`-Zeile im `Dockerfile`.** Gemessen führt `iuk-suite/Dockerfile:51-56` **je Modul eine
   eigene Zeile** (portal, qr, feedback, files, lagerbuch, aufgaben), dazu `:58` für `core/konto` — es
   gibt **kein** Sammel-`COPY`, das ein neues Modul automatisch mitnimmt. Fehlt die Zeile, findet der
   Container zur Laufzeit keine Migrationen: **lokal grün, im Container kaputt.**

⚠️ **Die zweite Hälfte hängt am Seed und ist bei `radio` gefährlicher als bei jedem bisherigen Modul.**
`shouldSeed()` ist `process.env.SUITE_SEED === "1" || process.env.NODE_ENV === "development"`
(`bootstrap.ts:108-109`), aufgerufen aus `src/instrumentation.ts:57` (`if (shouldSeed()) await
seedAllModules()`) — und `SUITE_SEED=1` ist der **Generalproben**-Schalter, nicht nur der Lokalschalter
(`bootstrap.ts:45` schreibt das ausdrücklich aus). Jedes Modul mit `MODULE_MIGRATIONS`-Eintrag schuldet
ein `_lib/seedLokal.ts`, sonst wird `iuk-suite/scripts/seed-lokal.test.ts` rot. **Für `radio` heißt das:
ein geseedeter Enrollment-Code wäre in der Generalprobe ein GÜLTIGER anonymer Zugang zum gesamten
Bestand samt Ausleihernamen** — genau die Klasse, wegen der `bootstrap.ts` bei anderen Modulen bereits
Ausnahmen führt. Regel für die Spec: `seedLokal` legt Geräte und Stammdaten an, **niemals** eine
einlösbare Zugangszeile; die Enrollment-Tabelle bleibt beim Seed **leer**.

*Kein Gate:* Punkt 1 und 2 fangen sich gegenseitig (Startabbruch bzw. roter Seed-Test), **Punkt 3 nicht**
— der Build ist grün, `pnpm dev` ist grün, und erst der Container meldet die fehlende Migration. Der
geseedete Zugangscode wiederum ist **typkorrekt und testgrün**; nur das Datenleck ist real.

---

## 6. Was nur der Betreiber beantworten kann

Acht Fragen. **Die ersten sieben blockieren die Spec** — Frage 7 gehört dazu, weil ihr Teil (iii) die
blockierende Frage 1 bemisst. **Was auf dem Server steht, steht nicht im Repo** — jede dieser Zahlen
zu erfinden wäre der schlimmste Fehler dieser Analyse.

### ✅ Beantwortet am 2026-08-17 — und eine Antwort kippt eine Grundannahme

Der Betreiber hat sieben der acht Fragen beantwortet. Die Antworten stehen hier gesammelt, weil sie
sonst nur im Sitzungsprotokoll leben; wo eine Antwort **eine andere Frage beantwortet als die
gestellte**, ist das ausdrücklich vermerkt.

| # | Antwort | Folge |
|---|---|---|
| **1** | **`radio.iuk-ue.de`** — der Alt-Kiosk läuft **bereits** unter der Zieladresse. | **Zweig A gilt.** Der Origin bleibt zeichengleich, `localStorage` überlebt den Umschwenk, ein **Neu-Enrollment je Gerät entfällt**. Der Widerspruch in `R-10` ist damit aufgelöst. ⚠️ Kehrseite: `radio.iuk-ue.de` kann **nicht** übergangsweise doppelt bedient werden — Alt-Kiosk und Suite können denselben Host nicht gleichzeitig halten, es gibt also **kein** Parallelfenster und der Rückweg ist ausschließlich „Router zurück". |
| **2** | Invariantenprüfung **passiert in der Migration**; der lokale Bestand darf angesehen werden. | ⚠️ **Die lokale `radio-admin/data/data.sqlite` beantwortet die Frage NICHT:** sie ist **leer** (0 Zeilen) und führt nur `devices`, `device_events`, `software_versions` — `loans`, `api_tokens` und `users` **fehlen ganz**. Das ist ein Stand **vor** der Loan-Migration und als Prod-Beleg unbrauchbar. Die Prüfung bleibt ein Runbook-Schritt gegen den echten Dump; Pflicht 4 (Mapping-Unit-Test) und Falle 1 (Faktor 1000) hängen unverändert daran. |
| **3** | **Statischer `RADIO_ADMIN_API_TOKEN`**, momentan. | Der client_credentials-Weg (`verifyLoanJwt`) ist gebaut, aber **nicht** in Betrieb. Entscheidung 2 kann damit entschieden werden: es fällt der statische Weg, und `api_tokens` in radio-admin trägt produktiv **einen** Konsumenten — den Kiosk, der mit dem Port verschwindet. |
| **4** | **Retention übernehmen. Betroffen: < 100** zurückgegebene Leihen. | Falle 1 bleibt scharf (der Boot-Purge zieht in die Suite mit), und die Reichweiten-Einschränkung aus Kapitel 2, Befund 1 fällt: der Schaden gilt jetzt **auch für die Suite**, nicht nur für radio-admins eigene Datenbank. Die „< 100" ist eine Betreiber-**Schätzung**, keine Zählung — die Zählung bleibt Runbook-Schritt (Kapitel 7). |
| **5** | ⚠️ **„Ist kein Tablet."** Nutzer scannen einen QR-Code und bekommen Zugriff — **oder** melden sich über die iuk-suite an und greifen aus der Kachel zu. | **Das kippt die Grundannahme „Kiosk = festes Gerät".** Siehe den Kasten unter dieser Tabelle. |
| **6** | **Enrollen/administrieren: nur die radio-admins.** **Ausleihen: jeder mit Zugriff** — anonym über QR-Code oder eingeloggt über die Suite, dort ebenfalls „anonym"; der Benutzername **könnte** vorausgefüllt werden, optional. | Zwei getrennte Rechteebenen, und die untere ist **absichtlich** anonym. Die Frage „was passiert in der Stunde nach dem Geräteverlust" ist mit Antwort 5 gegenstandslos — es gibt kein Gerät, das verloren gehen kann. Sie wird ersetzt durch: **was passiert, wenn ein QR-Code in falsche Hände gerät** (siehe Kasten). |
| **7** | **`AdminUser` ist eine Pocket-ID-Rolle.** | **In der Sache bestätigt, mit einer Präzisierung, die der Import braucht:** `AdminUser` ist im Code **auch** eine Prisma-Tabelle mit `username` + `passwordHash` (`apps/backend/prisma/schema.prisma:17-23`), gefüllt über einen Setup-Weg (`modules/setup/setup.repository.ts:28-31`) und einen lokalen Passwort-Login (`modules/admin/auth/auth.controller.ts:55`). Welcher Weg gilt, entscheidet `auth.service.ts`: `const provider = this.nService.isEnabled() ? 'pocketid' : 'local'` — Pocket ID gewinnt, sobald **alle vier** `POCKET_ID_*`-Felder gesetzt sind (`config/env.config.ts:57-73`). Im Pocket-ID-Betrieb schreibt der OIDC-Weg **nicht** in die Tabelle: er baut die Kennung synthetisch als `` `pocketid:${userInfo.sub}` `` (`modules/admin/auth/pocket-id.service.ts:134`). **Folge: die Tabelle ist im Pocket-ID-Betrieb tot und wandert nicht mit** — sie trägt nur Zeilen aus dem lokalen Passwort-Weg. Ein `select count(*) from "AdminUser"` gegen den Prod-Postgres belegt es endgültig, und diese Zählung ist ohnehin fällig, bevor der Postgres abgebaut wird (§A-Lehre aus Phase 4: „Bestand annehmen statt zählen"). Der Präfix `pocketid:` ist **nicht** der rohe `sub` — er verschwindet mit dem Port, weil die Suite den rohen `sub` führt. |
| **8** | *(nicht blockierend, offen)* | Muss der Kiosk offline **schreiben** können? Mit Antwort 5 verschiebt sich die Frage: nicht „Wandtablet ohne Netz", sondern „Telefon im Funkraum mit schlechtem Empfang". |

> ### ⚠️ Antwort 5 kippt die Enrollment-Prämisse — Entscheidung 1 und 5 sind überholt
>
> Die Analyse hat den Kiosk als **festes Gerät** modelliert (Wandtablet, Fahrzeug, Wache) und daraus
> das teuerste Bauteil abgeleitet: ein Geräte-Token-Enrollment mit Lebensdauer, Rotation, Widerruf und
> einem Verfahren für Geräteverlust. **Es gibt kein Gerät.** Zugriff entsteht auf zwei Wegen:
> ein gescannter QR-Code, oder die Anmeldung über die Suite mit Zugriff aus der Kachel.
>
> **Damit fällt Entscheidung 1** („geteiltes Geheimnis 1:1 oder Token je Gerät mit Widerruf") — die
> Antwort ist keins von beidem. **Und Entscheidung 5** (der ausgearbeitete Enrollment-Ablauf, der
> ausdrücklich Zweig (b) von Entscheidung 1 voraussetzt) ist gegenstandslos.
>
> **Was an ihre Stelle tritt, ist das `lagerbuch`-Muster, und zwar wörtlich:** ein gescannter Code
> gewährt eine zeitlich begrenzte, widerrufbare Sitzung für einen anonymen Vorgang; die Verwaltung
> läuft über Suite-SSO. Genau dafür gibt es in der Suite produktiven Code — `/t/<code>` und
> `helferZugang.ts` —, und Kapitel 2, Befund 2 hat den Host-Riegel schon in der `lagerbuch`-Form
> entworfen. Der Port wird dadurch **billiger**, nicht teurer.
>
> **Der Befund, der dabei nicht verschwindet, sondern schärfer wird** (Kapitel 2, Befund 3): der
> QR-Code des Alt-Kiosk trägt heute **den einen geteilten API-Token als URL-Parameter**,
> base64-kodiert, mit dem Quellkommentar „Base64-encode the token to avoid plaintext exposure in
> URLs" (`radio-inventar/apps/frontend/src/components/features/admin/AppQRCode.tsx:11-23`). Base64
> ist keine Verschleierung. Wer den Code abfotografiert oder die URL sieht, hat **dauerhaft
> Vollzugriff auf alle Geräte und Ausleihen** — ohne Ablauf, ohne Widerruf, ohne Bindung an eine
> Person. Weil Antwort 6 den Ausleih-Zugang **absichtlich** anonym hält, ist „anonym" nicht das
> Problem; **„unbefristet und unwiderruflich" ist es.** Die 1:1-Übernahme dieses Mechanismus ist
> damit ausgeschlossen, und das ist eine **Verhaltensänderung mit Ankündigungspflicht**: ein
> ausgedruckter QR-Code, der heute für immer gilt, wird künftig ablaufen oder sperrbar sein.
>
> **Neue Entscheidung, an Stelle von 1 und 5:** Lebensdauer und Widerrufbarkeit des Ausleih-Codes —
> ein Dauercode je Standort (sperrbar), ein rotierender Code, oder eine Sitzung je Scan mit kurzer
> Laufzeit. Daran hängen Schema, Oberfläche und die Frage, ob gedruckte Codes im Umlauf bleiben.
> Dazu die kleine, aber sichtbare aus Antwort 6: **soll der Benutzername bei angemeldeten Nutzern
> vorausgefüllt werden?** (Betreiber: „könnten wir, optional".)

### 🔴 1. Unter welchem Hostnamen läuft der Alt-Kiosk heute?

⚠️ **Diese Frage ist neu und entsteht aus einem Widerspruch innerhalb einer Analyse, der nicht still
aufgelöst wird.** `R-10` behauptet zugleich „ein Token, das heute unter `radio.iuk-ue.de` (Alt-Kiosk)
liegt, ist nach dem Umschwenk noch da" **und** „‚Enrollen vor dem Umschwenk auf der Endadresse' ist
definitorisch unmöglich — dieser Origin existiert vorher nicht". Beides zugleich kann nicht gelten.
Welchen Origin der Alt-Kiosk bedient, ist **nicht gemessen** und im Auftrag nicht genannt
(Betreiberentscheidung 1 nennt `radio.iuk-ue.de` als **Ziel**, Entscheidung 2 `radio-admin.iuk-ue.de`
als Alt-**Verwaltungs**host — den Alt-Kiosk-Host nennt keine der beiden).

Weil `localStorage` **origin-gebunden** ist, kippt diese eine Tatsache drei Runbook-Schritte:

- **Zweig A — der Alt-Kiosk läuft BEREITS unter `radio.iuk-ue.de`.** Dann existiert die Endadresse
  vorher sehr wohl, und ein **Vorab-Test auf der Endadresse** ist möglich. ⚠️ **Was Zweig A NICHT
  bedeutet: einen Umschwenk ohne Neu-Enrollment.** Eine frühere Fassung dieser Zeile stellte in
  Aussicht, ein bestehender `localStorage`-Eintrag könne den Umschwenk überleben, wenn die Suite
  denselben Geheimniswert unter demselben Schlüssel übernimmt. **Das ist mit dem eigenen Zielentwurf
  unvereinbar:** Entscheidung 5 und Falle 19 bauen ein **signiertes host-only Cookie**, Pflicht 15
  verlangt einen **DB-Recheck auf jedem Lesepfad** — ein `localStorage`-Wert wird von **keinem** Request
  mitgeschickt und erreicht damit weder eine Server Component noch einen Route Handler. Tragen würde der
  Satz nur unter Entscheidung 1, Zweig (a) **mit** rein clientseitigem Bearer-Header; diese Konstruktion
  führt das Dokument an **keiner** Stelle als Option. **Zweig A spart also den Vorab-Test, nicht das
  Enrollment.** ⚠️ Dann liegt aber auch der **alte Service Worker** nach dem Umschwenk unter
  derselben Adresse und kann alte Antworten aus seinem Cache ausliefern, während die Suite darunter
  schon antwortet (Falle 30): `self.registration.unregister()` bzw. je Tablet einmal Speicher löschen
  wird **Pflicht**.
- **Zweig B — der Alt-Kiosk läuft unter einem anderen Origin.** Dann ist Vorab-Enrollment auf der
  Endadresse tatsächlich unmöglich, und ein **Neu-Enrollment je Tablet nach dem Umschwenk** ist Pflicht
  — ein Runbook-Schritt **mit Gerätezählung**, kein Nebensatz.

**Drei Runbook-Posten, die in BEIDEN Zweigen fehlen und vor die Spec gehören:**

1. **Wer stellt am Cutover-Abend die Codes aus?** Die Ausstellung liegt hinter `/admin` und damit hinter
   Suite-SSO (Entscheidung 5, Schritt 1) — es braucht also eine namentlich benannte Person mit
   Modul-Admin-Gruppe, **vor Ort**, während jemand anders die Tablets in der Hand hat.
2. **Wie lange fällt der Kiosk aus?** Zwischen Umschwenk und dem **letzten** enrollten Tablet ist jedes
   noch nicht freigeschaltete Gerät ohne Zugang. Die Dauer ist ohne die Gerätezahl aus Frage 7 (iii)
   nicht schätzbar — deshalb ist diese Teilfrage **blockierend** und nicht nachrangig.
3. **Wird das Alt-`API_TOKEN` befristet weiter akzeptiert?** (Übergangs-Doppelakzeptanz, Entscheidung 2
   (iii)). Das ist der einzige Weg, den Ausfall aus (2) auf null zu bringen — und er braucht ein
   **Ablaufdatum**, sonst bleibt das geteilte Geheimnis dauerhaft neben dem Enrollment stehen.

Unabhängig vom Zweig gilt: den Ablauf vorab auf einem **temporären Host** prüfen, der ein echter
`SUITE_HOST_RADIO`-Wert ist (z. B. `radio-neu.iuk-ue.de`, oder der ephemere Container ohne
Traefik-Labels, den das Cutover-Muster ohnehin vorsieht). Weil die Variable diesen Host dann wirklich
beansprucht (`src/core/hosts.ts:39-46`), löst `moduleForHost` dort `radio` auf, und `/m/radio` auf dem
Portal-Host wird gar nicht angefasst — **Falle 61 ist damit bauartbedingt vermieden, nicht durch
Disziplin.**

### 🔴 2. Können wir einen Dump von `/data/data.sqlite` bekommen — und trägt er Zeilen, die die Anwendungsinvarianten verletzen? *(`RA-DM-07`)*

**Im Repository gibt es überhaupt keine Zählung, gegen die Betreiberentscheidung 5 prüfbar wäre.** Die
beiden lokalen SQLite-Dateien sind gitignoriert, leer und **vorbaselinig**: `.tables` zeigt nur
`__drizzle_migrations`, `device_events`, `devices`, `software_versions` — es fehlen `users`,
`api_tokens` **und** `loans`. `PRAGMA table_info(devices)` liefert **15** Spalten (es fehlen `tei`,
`hiorg_id`, `opta`, `funktion`, `hersteller`, `bedieneinheit`, `device_modes`, `alamos_integrated`,
`loanable`, `update_note`, also **10 der 25**); `software_versions` hat 4 statt 6 Spalten;
`SELECT sql FROM sqlite_master WHERE name='loans_device_active_uidx'` liefert leere Ausgabe. Alle
Tabellen haben 0 Zeilen.

Der Produktionsbestand liegt im Container-Volume unter `DATABASE_PATH=/data/data.sqlite` und **muss als
Dump beschafft werden, bevor irgendeine Import-Spec geschrieben wird.** Die vier Invarianten-Zählungen
aus Pflicht 4 sind daran zu fahren.

### 🔴 3. Spricht das Kiosk-Backend heute per statischem `RADIO_ADMIN_API_TOKEN` oder per client_credentials mit radio-admin — und welcher Admin-Modus läuft? *(`RI-ENV-1`, präzisiert)*

Der `backend`-Service in `radio-inventar/docker-compose.yml:33-39` setzt nur `NODE_ENV`, `PORT`,
`DATABASE_URL`, `SESSION_SECRET`, `ALLOWED_ORIGINS`, `PUBLIC_APP_URL` und hat **kein `env_file`** — und
er hängt an `profiles: ["full-app"]` (`:27`), wird also von einem `docker compose up` ohne Profil gar
nicht gestartet. `validateEnv` verlangt aber `API_TOKEN` mit mindestens 32 Zeichen ohne Default
(`config/env.config.ts:11`) und in Produktion zusätzlich `RADIO_ADMIN_URL` samt Auth-Modus (`:106-131`).
**Die eingecheckte Compose-Datei ist damit nicht der Produktionsweg**, und woher die produktive Umgebung
ihre Werte bezieht, ist aus dem eingefrorenen Repo **nicht** belegbar.

⚠️ **Präzisiert:** die `POCKET_ID_*`-Variablen sind alle `.optional().default('')`
(`env.config.ts:12-15`) und blockieren den Boot **nicht** — ihr Fehlen wählt still `provider: 'local'`
(`admin/auth/auth.service.ts:84`). Boot-blockierend sind nur `API_TOKEN` und, in Produktion,
`RADIO_ADMIN_URL` samt Auth-Modus.

**Die Antwort entscheidet:** (i) ob die api_tokens-Kette portiert wird oder ersatzlos entfällt
(Entscheidung 2), (ii) welche radio-admin-Seite beim Abschalten der Alt-App mitstirbt, (iii) ob in
radio-admin `LOAN_API_EXPECTED_AUDIENCE`/`LOAN_API_EXPECTED_SUBJECT` gesetzt sind — davon hängt ab, ob
der JWT-Pfad aus Falle 14 überhaupt aktiv ist. Prüfbar an der laufenden Instanz:
`GET /api/admin/auth/config`.

### 🔴 4. Soll die Suite die 2-Monats-Retention übernehmen — und wie viele zurückgegebene Leihen wären davon betroffen?

`radio-admin` löscht zurückgegebene Leihen älter als zwei Monate, mit einem **sofortigen** Purge beim
Serverstart (`retentionService.ts:9`, `:17-21`, `:47`; `index.ts:35`). Der DSGVO-Grund ist
`loans.borrower_name` (personenbezogen). Zwei Teilfragen, beide nur am Dump beantwortbar und beide
blockierend für Befund 1:

1. **Übernimmt die Suite die Regel?** Wenn ja, ist der Boot-Purge auch dort scharf und der
   Sekunden-Import vernichtet die Historie. Wenn nein, ist Befund 1 auf die Alt-App beschränkt — und
   dann ist die **Nicht**-Übernahme eine bewusste Änderung an einer DSGVO-Löschregel, die aufgeschrieben
   gehört.
2. **Wie viele zurückgegebene Leihen sind älter als zwei Monate** und würden beim ersten Suite-Start
   ohnehin verschwinden, **selbst bei korrekten Millisekunden?** Die Migration ist der Anlass, die
   Frist zu bestätigen oder zu ändern — nicht der Moment, sie versehentlich zu vollstrecken.

### 🔴 5. Braucht der Wandtablet-Kiosk einen LIVE-Stand? *(`B12`, präzisiert)*

Der heutige Kiosk hat **zwei** Frischhalte-Auslöser und **keinen** zeitgesteuerten:
`refetchOnWindowFocus: 'always'` (`lib/queryClient.ts:28`) und `refetchOnReconnect: 'always'` (`:29`).
Auf einem dauerhaft im Vollbild laufenden Wandtablet tritt der **Fokuswechsel praktisch nie** ein, der
**Reconnect nur bei Netzstörung** — mit `staleTime` 30 s und einem bewusst cache-zuerst ausgelegten
Client (`:19` `gcTime` 24 h „for offline access", `:30` `networkMode: 'offlineFirst'`) zeigt der Kiosk
zwischen zwei Bedienvorgängen also plausibel **veralteten Bestand**. Das ist ein bestehender Zustand,
**keine Port-Regression** — der Port macht ihn nur sichtbar.

Zwei Wege: **(A)** Frische nur bei Interaktion — `revalidatePath` nach jeder Server Action, kostet
nichts, entspricht dem heutigen Verhalten. **(B)** Echter Live-Stand — braucht etwas, das
`revalidatePath` **nicht** liefert: ein Intervall im Client, `router.refresh()` auf einem Timer oder ein
Server-Sent-Event. Weg B ist der einzige Fall, in dem Polling doch gebraucht wird, und er muss dann
**bewusst neu gebaut** werden, weil es ihn heute nicht gibt.

**Konkreter Entscheidungspunkt: muss eine Ausleihe am Kiosk A binnen Sekunden am Kiosk B sichtbar
sein?** Wenn ja, ist B Pflicht und gehört in die Spec; wenn nein, ist A ausreichend.

### 🔴 6. Wer darf ein Gerät enrollen, und was passiert in der Stunde nach dem Verlust? *(`R-E1`, gehalten; gilt unter Entscheidung 1, Zweig (b))*

Drei Fragen, die nur der Betreiber beantworten kann:

1. **Wer tippt?** Darf jede Person aus `SUITE_ADMIN_GROUP_RADIO` Enrollment-Codes ausstellen, oder
   braucht es eine engere Gruppe? Der Code ist ein **Klartextgeheimnis**, das Zugriff auf den gesamten
   Bestand samt Ausleihernamen eröffnet — dieselbe Überlegung, die `lagerbuch` für seinen Etikettenbogen
   anstellt (`src/app/m/lagerbuch/_lib/zugang.ts:79-88`: „der Etikettenbogen zeigt Token-Codes IM
   KLARTEXT, dem Secret selbst … Wer lagerbuch verwalten soll, gehört in das, was
   SUITE_ADMIN_GROUP_LAGERBUCH benennt — auch der Betreiber selbst").
2. **Übertragungsweg?** Wird der Code am Bildschirm gezeigt und mündlich/telefonisch weitergegeben,
   gedruckt, oder steht die Adminin selbst am Tablet? Davon hängt die **Lebensdauer des Codes** ab —
   Minuten bei Anwesenheit, Stunden bei Telefon, Tage bei Papier. Und **gedruckt ist gedruckt**
   (`src/app/m/files/_lib/hostRolle.ts:128-141`).
3. **Verlustprozedur?** Wer erfährt von einem verlorenen Tablet, wen ruft diese Person an, und wie
   schnell? Der technische Widerruf ist ein Klick (Pflicht 15); der **organisatorische** Weg dorthin ist
   der langsame Teil, und ohne ihn ist die Sperre nur theoretisch verfügbar.

Zusatzfrage: soll die Verwaltung `letzterZugriff` je Gerät anzeigen, damit ein still verschwundenes
Tablet überhaupt auffällt?

---

### 🔴 7. Was steht wirklich in `AdminUser`, und in welchem Modus läuft der Prod-Kiosk? *(`RI-11`, gehalten; Teil (iii) nachträglich als BLOCKIEREND eingestuft)*

(i) Wie viele Zeilen liegen in `AdminUser` und wer kennt die Zugangsdaten — wurde
`CredentialsChangeForm.tsx` (12,3 KB) je benutzt, oder steht dort noch der Erstnutzer des
Setup-Assistenten? (ii) Läuft die Prod-Anmeldung über Pocket ID (dann ist `AdminUser` weitgehend
vestigial und der Port billig) oder über lokales Passwort (dann ist es eine echte Identität, die
migriert oder verworfen werden muss)? (iii) Wie viele Kiosk-Geräte tragen den geteilten `API_TOKEN`,
also wie viele Geräte müssen bei einem Wechsel neu eingerichtet werden?

⚠️ **Teil (iii) ist blockierend, (i) und (ii) sind es nicht.** Die Gerätezahl **bemisst den
Cutover-Abend**: sie füllt Zweig B der **blockierenden** Frage 1 (Neu-Enrollment je Tablet) und
entscheidet, wie lange der Kiosk zwischen Umschwenk und letztem freigeschaltetem Gerät ausfällt. Eine
blockierende Frage darf ihre eigene Bemessungsgröße nicht aus einer nachrangigen beziehen — daher die
Umstufung. **Zu erheben ist sie nicht in der Datenbank, sondern im Haus**: der `API_TOKEN` liegt im
`localStorage` jedes Tablets (Befund 3), es gibt keine Tabelle, die die Geräte kennt. Die Antwort ist
eine **Begehung**, kein `SELECT`.

### 8. Muss der Kiosk offline SCHREIBEN können? *(`R-17`, präzisiert)*

⚠️ **Die Frage ist enger als in der Rohfassung, weil deren Prämisse widerlegt ist:** der heutige Kiosk
ist beim **LESEN** bereits offline-fähig, und zwar absichtlich (`lib/queryClient.ts:19` `gcTime` 24 h
„keep unused data in cache for offline access", `:30` `networkMode: 'offlineFirst'`, `:20-27` kein
Retry bei `!navigator.onLine`, `:29` `refetchOnReconnect`), dazu eine eigene
`components/pwa/PWAOfflineIndicator.tsx`. Ausleihdaten hält er nicht selbst (Pflicht 19), aber er zeigt
bei Netzverlust **bis zu 24 Stunden alten Bestand** aus dem Cache. Funktionslos ist heute das
**Schreiben**, nicht das Lesen (Kapitel 8, Nr. 8).

**Soll eine AUSLEIHE bei ausgefallenem Netz aufgenommen und später nachgereicht werden?**

- **Ja** bedeutet: eine Warteschlange auf dem Tablet, Konfliktauflösung gegen den partiellen
  Aktiv-Index aus Falle 2 (zwei Tablets leihen offline dasselbe Gerät aus — beim Nachreichen gewinnt
  genau eines), und Zeitstempel, die vom **Tablet** stammen und nicht vom Server, mit allem was das für
  Befund 1 bedeutet.
- **Nein** bedeutet: der SW cached Hülle und Lesedaten und zeigt bei Netzverlust einen ehrlichen Hinweis
  statt eines Formulars, das nichts tut. ⚠️ **Und im Nein-Zweig ist ausdrücklich aufzuschreiben, dass
  das heutige Offline-LESEN erhalten bleibt** — sonst wird die Suite-Fassung an dieser Stelle
  schlechter als die Alt-App, ohne dass es jemand entschieden hat.

Nur der Betreiber weiß, ob im Einsatz (Zeltlager, Halle, Fahrzeug) überhaupt Netz da ist.

---

## 7. Offene Messungen

Zweiundfünfzig Punkte aus den sechs Analysen, jeder mit dem Befehl, der ihn beantwortet. **Vier tragen
ein ✅, und die vier bedeuten drei verschiedene Dinge** — deshalb hier ausgeschrieben statt als eine
Zahl: **Nr. 1 und Nr. 2 sind beantwortet** (echte Messungen, Ergebnis liegt vor) · **Nr. 17 ist zur
Hälfte beantwortet** (`iuk-suite/src/core/auth/cookies.ts:46-59` bleibt nach eigener Aussage ungelesen)
· **Nr. 44 ist nicht beantwortet, sondern umgestuft**: die Alt-App war gemessen, es fehlte ein **Träger
im Ziel**, und daraus ist **Entscheidung 14** geworden. Offen bleiben damit **49** — in dieser Zahl ist
Nr. 44 als „beantwortet" mitgerechnet, obwohl es eine Umstufung war; wer sie nachrechnet, kommt auf 49
oder 50 je nachdem, wie er Nr. 44 zählt. Wer hier Punkte streicht, prüft zuerst, ob sie beantwortet oder
nur **umgestuft** sind.

⚠️ **Nachtrag 2026-08-17:** die Betreiberantworten (Kapitel 6) beantworten weitere Punkte, sind hier
aber **nicht** eingerechnet — insbesondere die Zählung der von der Retention betroffenen Leihen bleibt
offen, weil „< 100" eine Schätzung ist und keine Messung.

### ✅ Zuerst: zwei „offene" Messungen, die eine Nachbaranalyse längst beantwortet hat

Beim Zusammenführen wäre es der klassische Fehler, sie als offen mitzuschleppen — das ließe den Lauf
weniger gemessen aussehen, als er war.

1. **„Nicht geprüft, ob radio-admin die sechs `api/v1/*`-Endpunkte tatsächlich in dieser Form
   anbietet — die Belege stammen alle von der Aufrufseite."** ✅ **Beantwortet:**
   `rg -c "r\.(get|post|put|patch|delete)\('" radio-admin/server/src/routes` liefert für `loanApi.ts`
   genau **6** Routen (`:126`, `:133`, `:140`, `:148`, `:158`, `:187`) — Aufruf- und Anbieterseite
   stimmen in der Zahl überein.
2. **„Trägt die Historie (`modules/admin/history/`) lokale Zeilen, die migriert werden müssen?"**
   ✅ **Beantwortet: nein.** `history.repository.ts:9`, `:65`, `:74` konstruiert mit
   `RadioAdminService` und ruft `fetchActiveLoans()`; `:57` schreibt aus, dass auch die Retention
   inzwischen in radio-admin liegt. Die Historie liest **durch**.

### Zuerst zu messen — an der Produktionsdatenbank

3. **Die sechs Zeilenzahlen und die vier Invarianten-Zählungen** aus Pflicht 4 gegen einen Dump von
   `/data/data.sqlite`. **Formuliert, aber nie ausgeführt** — die Alt-Apps liegen eingefroren im Repo,
   die Prod-Daten nicht. Erster Runbook-Schritt.
4. **Verletzen Prod-Zeilen die Anwendungsinvarianten?** Vier Zählungen: mehrere `is_target = 1` ·
   zwei aktive Leihen pro Gerät (vor `0003` gab es den partiellen Index nicht) ·
   `device_events.source` mit einem Wert außerhalb des TS-Enums · `last_updated_at`-Werte in
   Sekundengröße. Jede Import-Spec braucht diese vier zuerst.
5. **Trägt die Prod-DB nachträglich von Hand angelegte Trigger?** Der Grep-Beleg aus Falle 2 gilt für
   den Quelltext, nicht für die laufende DB:
   `sqlite3 dump.sqlite "SELECT type,name,sql FROM sqlite_master WHERE type IN ('trigger','view')"`.
6. **Steht `dev-user` in der Prod-DB?** (Falle 15)
   `SELECT sub FROM users;` und `SELECT DISTINCT created_by FROM devices;`
7. **Zeitstempel-Größenordnung:** `SELECT MIN(created_at), MAX(created_at) FROM devices;` —
   dreizehnstellig = Millisekunden (Befund 1).

### Postgres des Kiosk — kein Datenbankzugriff in diesen Läufen

8. ⚠️ **Der Tabellenbestand ist aus fünf Migrationsdateien plus einer handgepflegten
   `create-session-table.sql` ABGELEITET, nicht gezählt** — und Falle 8 beweist, dass diese Ableitung
   methodisch unvollständig sein **kann**. **Grundwahrheit statt Zählung:**
   `SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY 1;` — fängt auch out-of-band
   angelegte Tabellen. Abgeleitet erwartet: `AdminUser`, `_prisma_migrations`, evtl. `session`.
9. **Beweis, dass kein Bestand mehr liegt:**
   `SELECT to_regclass('public."Loan"') AS loan, to_regclass('public."Device"') AS device;` — erwartet
   `NULL, NULL`. Ein Nicht-NULL würde bedeuten, dass die Drop-Migrationen in Prod nie gelaufen sind.
10. `SELECT count(*) FROM "AdminUser";` — die Zahl zu Pflicht 19 (i). Ergänzend
    `SELECT username, "createdAt", "updatedAt" FROM "AdminUser";` — `updatedAt` > `createdAt`
    beantwortet Frage 7 (i) ohne Konfigurationszugriff: die Zugangsdaten wurden geändert, der Nutzer
    ist in Benutzung.
11. **Existiert `session` überhaupt, und liegen dort Zeilen?** `SELECT count(*) FROM "session";` und
    `SELECT count(*) FROM "session" WHERE expire > now();` ⚠️ Nach Codelage ist die Tabelle **nie
    angelegt** worden (Kapitel 8, Nr. 1) — die Abfrage prüft genau das. Existiert sie doch, zeigt
    `SELECT sess FROM "session" WHERE expire > now() LIMIT 5;`, ob dort `provider: 'local'` oder
    `'pocketid'` steht, und beantwortet Frage 7 (ii).
12. `SELECT count(*) FROM "_prisma_migrations" WHERE finished_at IS NOT NULL;` — erwartet **5**; ein
    niedrigerer Wert heißt, Prod hängt hinter dem eingefrorenen Stand und trägt womöglich noch
    `Loan`/`Device`.
13. Liefert `pg_tables` **mehr** als die erwarteten Tabellen, ist jede zusätzliche per
    `SELECT count(*)` zu zählen und Pflicht 19 zu erweitern — nach ihr wurde im Repo nicht gesucht,
    weil DDL-Quellen außerhalb von `migrations/` nicht systematisch durchsucht wurden.
14. **Zeilenzahlen aller Tabellen auf einen Blick:**
    `docker compose exec db psql -c "select relname, n_live_tup from pg_stat_user_tables order by n_live_tup desc"`.
15. **Inhalt von `prisma/create-session-table.sql`** ist gelesen (Falle 8), aber ob die Tabelle beim
    Abbau des Postgres etwas mitnimmt, ist ungemessen — hängt an 11.

### Suite-Seite

16. **Kann `drizzle-orm` in der Suite-Version ein `targetWhere` für `onConflictDoUpdate` emittieren**,
    also einen partiellen Unique-Index als Konfliktziel treffen? Ungemessen, weil das ein Blick in
    `node_modules` wäre. **Als offen behandeln, nicht als „geht nicht".** Der Altcode enthält keinen
    einzigen Upsert gegen `loans_device_active_uidx`, also gibt es dort kein Vorbild.
17. ✅ **Zur Hälfte erledigt — und die Angabe war falsch.** `src/core/hosts.ts:65-100`
    (`validateHostConfig`) ist **selbst gelesen**: die drei Abbruchklassen und die Zeilenspannen aus
    Pflicht 6 (`:69-76`, `:81-85`, `:87-93`) stimmen mit der Quelle überein — **Pflicht 6 trägt, dieser
    Punkt war die Fehlangabe** (Kapitel 8, **A2** Nr. 12 — nicht A Nr. 12). Auch die Teilfrage ist beantwortet: die
    Doppelvergabe-Prüfung iteriert ausschließlich `envHostsFor(key, env)` (`hosts.ts:79-80`), vergleicht
    also **nur per Env gesetzte** Hosts; eine Kollision gegen die Code-Default-`prodHosts` eines anderen
    Moduls wird **nicht gemeldet** (nachgetragen in Pflicht 6). **Offen bleibt allein**
    `src/core/auth/cookies.ts:46-59` (`AUTH_COOKIE_DOMAIN`) — für Falle 19 aus einem Kommentar in
    `helferSitzung.ts` zitiert, nicht selbst gelesen.
18. **Hat `src/core/ratelimit.ts` schon Aufrufer in `files`/`feedback`**, deren Schlüsselwahl der
    Enrollment-Endpunkt übernehmen sollte? `rg -n "ratelimit|clientIpAus" src/app/m --glob '!*.test.ts'`
19. **Liegt `/admin` im Ziel als `app/m/radio/admin/**`?** Folgt aus dem Rewrite auf `/m/<key><rest>`
    (`src/core/routing.ts:79`), ist für `radio` aber nicht verifiziert; die Group-Struktur (eine Group
    je Rolle?) ist offen (Entscheidung 13).
20. **`iuk-suite/docs/design/README.md`** — die zwölf Fallen sind über `CLAUDE.md` belegt; ihre
    **Nummerierung** (Falle 6, 17, 19, 57, 61) ist aus Modul-Kommentaren übernommen, nicht aus der
    Quelle.
21. **Antwortform des Enrollment-Handlers** (303 auf `/` wie `abmelden/route.ts:76` gegen JSON) — nicht
    entschieden, weil der Kiosk-Startpfad ungelesen ist (Nr. 26).
22. **`radio-admin`s Zeitzone im Container** (`TZ`-Env) — sie bestimmt, wie groß der Ein-Tages-Versatz
    in Entscheidung 8 tatsächlich ist und ob bereits gespeicherte `last_updated_at`-Werte betroffen
    sind. `.env.example` und `docker-compose.yml` sind nicht auf `TZ` geprüft.
23. **Existiert auf dem Server bereits ein Traefik-Redirect-Router für einen anderen Alt-Host** (Vorbild
    für Falle 28)? Im Repo gibt es keinen (`grep redirectregex` bleibt leer); die Antwort liegt in der
    Server-`compose.yaml` bzw. der dynamischen Traefik-Konfiguration.

### OIDC und Identität

24. **Liefert radio-admins Pocket-ID-Client dieselben `sub`-Werte wie die Suite?** Entscheidet
    Entscheidung 11 und Pflicht 10. Zu messen am Pocket-ID-Discovery-Dokument
    (`subject_types_supported`) bzw. an zwei Sitzungen derselben Person; ergänzend Issuer und Client-ID
    vergleichen: `radio-admin/.env.example` und `server/src/auth/` gegen `iuk-suite/.env.example`.
25. **Vollständige OIDC-Variablenliste in `radio-admin/server/src/config.ts`** — nur die Zeilen 17,
    28-29, 39-42 und 48-52 sind gemessen. Insbesondere, ob `LOAN_API_EXPECTED_AUDIENCE`/
    `LOAN_API_EXPECTED_SUBJECT` gesetzt sind (Falle 14).

### Alt-Apps: ungelesene Dateien mit 1:1-Pflichtdetails

26. **`apps/frontend/src/routes/__root.tsx:88`** — der Kiosk-Startpfad ist die Stelle, an der der
    Enrollment-Bildschirm im Zielbau hängt; nur die Riegelzeilen sind gelesen, nicht der Startablauf.
27. **`lib/tokenStorage.ts`** — Schlüsselname und Ablaufverhalten; und der genaue Wert von
    `API_TOKEN_CONFIG.STORAGE_KEY`/`MIN_LENGTH` aus `@radio-inventar/shared`. Belegt ist nur die
    Zod-Untergrenze 32 (`env.config.ts:11`). ⚠️ **Der Schlüsselname entscheidet Frage 1, Zweig A:** ob
    ein bestehender Eintrag von der Suite-Fassung überhaupt gefunden würde.
28. **`BorrowerInput.tsx`** (Debounce, Mindestlänge, Trefferzahl der Namensvorschläge) ·
    **`ReturnDialog.tsx`** (Längenbegrenzung der Rückgabe-Notiz) · **`DeviceSelector.tsx`** (Obergrenze
    der Mehrfachauswahl) · **`lib/csv-export.ts`** (Spalten und Trennzeichen des Historien-Exports).
    Alle vier tragen 1:1-Pflichtdetails.
29. **`modules/loans/loans.repository.ts`** und **`borrowers.repository.ts`** im Volltext — die
    epoch-ms→`Date`-Konvertierung aus Falle 9 ist per Schema-Kommentar belegt, die konkrete
    Konvertierungsstelle aber nicht per Zeile.
30. **`modules/setup/`** (Controller, `SetupGuard`, `setup.service`) — dort hängt, ob es lokale
    Admin-Konten mit Passwort-Hash gibt, die bei der Portierung ersatzlos verfallen (Entscheidung 4).
31. **`modules/admin/auth/auth.repository.ts`** und **`auth.service.ts:180-260`** — Passwort-Hash-
    Verfahren und `getSessionInfo`-Verhalten für `pocketid:`-Nutzer, die keine `AdminUser`-Zeile haben.
32. **Frontend-Seite der Admin-Anmeldung** (Login-Route, Session-Handling, Weiterleitung nach dem
    Pocket-ID-Callback) — relevant für die Frage, was Nutzer heute konkret sehen.
33. **Vollständige Liste der `@Public()`/`@BypassApiToken()`-Träger:**
    `rg -n '@Public|@BypassApiToken' apps/backend/src` — vier `@BypassApiToken`-Fundstellen sind
    gezählt (Falle 16), aber `health.controller.ts:11` steht auf **Klassenebene** und die Zahl der
    dahinterliegenden Routen ist offen. Grundlage für den Riegel-Nachweis in jedem Route Handler.
34. **Throttler-Konfiguration** (`@nestjs/throttler`): die `AUTH_CONFIG.RATE_LIMIT_*`-Werte in
    `@radio-inventar/shared` sind ungelesen — relevant, falls die Rate-Limits als Pflicht portiert
    werden.
35. **Migrationen `0001`–`0004` von radio-admin** sind für die Spaltenherkunft gelesen, aber **die
    verbindliche Spaltenreihenfolge in `0003_kind_spot.sql` (CREATE TABLE loans)** ist für einen
    positionsweisen Vergleich nicht festgehalten.
36. **Service-Worker-Scope des Alt-Kiosks** (Auslieferungspfad, `Service-Worker-Allowed`-Header,
    Vite-PWA-Konfiguration in `apps/frontend/public/` und der Vite-Konfiguration) — Falle 30
    argumentiert aus der Scope-Regel, nicht aus einer Messung.
37. **Kiosk-Frontend-`routes/`-Struktur gegen den App Router:** 142 Dateien mit
    `@tanstack/react-router` und `@tanstack/router-plugin` (dateibasiertes Routing mit eigener
    Konvention). Die Abbildung der Routenbäume auf `app/`-Verzeichnisse ist nicht gemessen; gesehen
    sind nur einzelne Routendateien.

### Zählungen, die noch fehlen

38. **Stellenzahl der Falle-1-Stellen** (Compound-Zugriff) in beiden Alt-Apps:
    `rg -n "Form\.Item|Typography\.(Title|Text|Paragraph)|Descriptions\.Item|List\.Item|Input\.(TextArea|Password|Search)|Select\.Option|Space\.Compact" radio-admin/client/src radio-inventar/apps/frontend/src`
    — Eintrag 25 in Kapitel 5 nennt Suite-Falle 1 als berührt und begründet das strukturell, aber die Zahl fehlt, anders als
    bei Suite-Falle 9 mit 31.
39. **Klassifikation der 96 + 80 Testdateien.** Nur gezählt, nicht klassifiziert: welche prüfen
    **Fachregeln** (portierbar als Vorlage — insbesondere `touch-button.spec.tsx` 13,6 KB und
    `api/loans.spec.tsx`) und welche prüfen nur **Grenzverwaltung** (Guards, Pipes, Interceptors,
    fetch-Wrapper — entfallen mit Pflicht 21)? Das ist die Zahl, die den Testaufwand der Spec bestimmt.
40. **Feldweiser Abgleich der doppelten Schemata:** `radio-admin/shared/src/loan.ts` (5 `z.object`) und
    `schemas.ts` (3) gegen `radio-inventar/packages/shared/src/schemas/radio-admin-loan.schema.ts` und
    `radio-admin-device.schema.ts`. **Dass es Doppelungen SIND, ist aus den Dateinamen erschlossen,
    nicht Feld für Feld verglichen.** Vor dem Zusammenlegen auf **ein** Schema muss der Abgleich
    gemacht werden — Abweichungen zwischen den beiden Beschreibungen sind genau die Stellen, an denen
    heute stillschweigend etwas verlorengeht.
41. **Der Kiosk-Zweig des Ziel-Schemas:** welche Tabellen braucht `radio.db` über radio-admins sechs
    hinaus (Geräte-Token unter Entscheidung 1 Zweig (b), Setup-Zustand, ggf. Historie)? Nicht gemessen.
42. **`radio-admin/server/src/services/retentionService.ts`** ist für `loans` gelesen; ob und nach
    welcher Frist **`device_events`** in der Alt-App gelöscht werden, ist offen — davon hängt ab, ob der
    Import eine bereits beschnittene Historie mitbringt.
43. **`shared/src/import/classify-import-row.ts`**, **`shared/src/diff-device.ts`**,
    **`server/src/import/device-lookup.ts`** — nur als Suchtreffer gesehen. Relevant für die Frage,
    welche Spalten ein CSV-Import überhaupt anfassen darf (`filterEditableFields`). ⚠️ **Erweitert um
    die vier Verhaltensfragen aus Pflicht 24:** welche Feldänderungen in die Diff-Liste kommen
    (`diff-device.ts`), was `classify-import-row.ts` je Zeile klassifiziert, was `PATCH /devices/:id`
    validiert, und was beim Gerätelöschen mit `device_events` (CASCADE?) und mit Leihen (kein FK)
    geschieht. Das ist **der** Messblock der Verwaltungs-Spec.
44. ✅ **Erledigt und umgestuft — war nie eine Messung.** `UPDATER_EDITABLE_FIELDS` ist gemessen
    (`radio-admin/shared/src/editable-fields.ts:3`: `softwareVersion`, `lastUpdatedAt`, `status`; Filter
    `:5-10`), ebenso die Endpunktseite (`routes/devices.ts:126` ohne, `:99`/`:188` mit
    `requireRole('admin')`). Was fehlt, ist **kein Messwert, sondern ein Träger im Ziel** — das ist jetzt
    **Entscheidung 14** (blockierend).
45. **Hat `radio-admin` ein eigenes Geräte- oder Token-Konzept**, das die Ausstellungsseite von
    Entscheidung 5 ändert? Gemessen ist die api_tokens-Tabelle (Entscheidung 2), aber nicht, ob es
    darüber hinaus einen Gerätebegriff gibt: `rg -n 'token|device' radio-admin/server/src --glob '!*.snap'`.
46. **`radio-inventar`s Postgres-Loan-Datenmodell** ist **historisch** irrelevant geworden (Tabelle
    gedroppt), aber falls ein Prod-Postgres hinter dem Freeze hängt (Nr. 12), ist die
    Zeitstempel-Einheit dort zu messen: `timestamptz` → ms erfordert eine explizite Umrechnung, und
    **genau dort entsteht der Faktor-1000-Fehler**.
47. **Zeilenzahl `radio.db` nach dem Import** gegen die sechs Sollwerte — der **zählende** Check aus
    Falle 29, der `status:"ok"` ersetzt.
48. **`SUITE_ACCESS_GROUP_RADIO`/`SUITE_ADMIN_GROUP_RADIO`: welche Gruppennamen?** Offen als
    **Betreibervorgabe** (Pflicht 9, Pflicht 17). ⚠️ **Die daran hängende Abbildung der Rollen
    admin/updater ist keine Messung mehr, sondern Entscheidung 14** — die Gruppennamen sind erst
    festlegbar, wenn dort beschlossen ist, ob es **zwei** Gruppen gibt.
49. **Ob `radio-admin` in Prod je mit `AUTH_DEV_BYPASS` gebootet wurde** — messbar nur über Nr. 6, weil
    die Boot-Sperre (`config.ts:48-52`) einen direkten Prod-Start ausschließt.
50. **Zeitzone des Suite-Containers** (`TZ`) — die Suite fährt heute ohne; ein nachträgliches
    `TZ=Europe/Berlin` verschiebt jede Datumsgrenze aller laufenden Module und ist **kein**
    radio-Punkt, berührt aber Entscheidung 8.
51. **`loans_device_active_uidx` in der Prod-DB vorhanden?**
    `SELECT sql FROM sqlite_master WHERE name='loans_device_active_uidx';` — in den lokalen Kopien
    fehlt er (Frage 2), und ob Prod ihn trägt, entscheidet, ob Pflicht 4 Nr. 4 überhaupt Zeilen finden
    kann.
52. **Größe des Prod-Volumes und Dauer eines `pg_dump`/`sqlite3 .backup`** — nicht gemessen, aber die
    Zahl, die das Cutover-Fenster bemisst.

---

## 8. Lesarten, die sich nicht gehalten haben

**Zweck dieses Kapitels: kein späterer Durchgang soll sie erneut „finden".**

⚠️ **Eine Besonderheit dieses Laufs:** der Skeptiker-Durchgang hat **keinen** der 77 Rohbefunde
vollständig widerlegt. Wer die `lagerbuch`-Analyse mit ihren 35 widerlegten Rohbefunden kennt, würde
daraus fälschlich schließen, es gäbe hier nichts zu verzeichnen. Es gibt zwei Klassen:

- **A — Teilaussagen, die hart gefallen sind** (Nr. 1 bis 12). Sie lesen sich wie Befunde und ein
  späterer Durchgang wird sie erneut finden. Das ist die wertvolle Hälfte.
- **B — die 33 präzisierten Fassungen** (Nr. 13). Sie stehen in den Kapiteln 2 bis 7 in der
  **korrigierten** Fassung; hier steht, was jeweils die alte Fassung sagte.

---

### A. Teilaussagen, die die Gegenprüfung widerlegt hat

1. **„Der `session`-Speicher des Kiosk liegt im Postgres, und der Port muss entscheiden, was mit den
   offenen Verwaltungssitzungen passiert."** *(aus `RI-01`, `RI-02`, `RI-09`)* — **Widerlegt am
   Quelltext.** `radio-inventar/apps/backend/src/main.ts:75-82` konfiguriert `express-session` mit
   `name`, `secret`, `resave`, `saveUninitialized`, `cookie` — und **ohne `store`**, fällt also auf den
   prozesslokalen **MemoryStore** zurück. `connect-pg-simple` steht ausschließlich in
   `apps/backend/package.json:49` und wird in `apps/backend/src` **nirgends** importiert;
   `prisma/create-session-table.sql` wird von **keinem** Code, keinem Dockerfile und keinem
   `package.json`-Script ausgeführt (`rg -rn "create-session-table" apps/backend` → leer). **Sitzungen
   sind fluchtig und überleben keinen Neustart — kein Migrationsgegenstand.** Damit fällt auch die
   Folgerung, ein Prisma-basiertes Audit „übersehe den Sitzungsspeicher lautlos" (`RI-02`), und `RI-02`
   ist **nicht mehr blockierend**. Was bleibt, ist die Methodenfalle (Falle 8) und die offene Zählung
   (Kapitel 7, Nr. 11): die Tabelle **kann** von Hand angelegt worden sein, `pg_tables` ist die einzige
   verlässliche Quelle.
2. **„Der Stack-Sprung löscht rund 8.500 Zeilen Grenzverwaltung."** *(aus `B04`)* — **Nie gezählt und
   rund dreimal zu hoch.** Nachgezählt ergibt die eigene Belegliste **2.902** Zeilen: 1.859 (12
   `api/*.ts` ohne Specs) + 43 (`queryClient.ts`) + 483 (14 `*.dto.ts`) + 351 (7 Querschnittsdateien)
   + 110 (`main.ts`) + 56 (`radio-admin/server/src/index.ts`). Zwei weitere Zahlen desselben Befundes
   waren falsch: **12** `api/*.ts` ohne Specs, nicht 13; **7** Quelldateien Guards/Pipes/Interceptor/
   Filter plus 2 Barrel-`index.ts`, nicht 9. (`enableCors` steht auf `main.ts:68`, nicht in der
   zitierten Spanne `54-68` — die ist die Berechnung der Origin-Liste.) Der **Befund** trägt, die
   **Größenordnung** trug nicht.
3. **„Auch `sqlite_master` einer lokalen DB zeigt keine Trigger — also hat radio-admin keine."** *(aus
   `RA-DM-02`)* — **Wertloser Beleg, und er widerspricht dem eigenen Befund `RA-DM-07`.** Dieselbe
   lokale DB kennt weder `loans` noch `users` noch `api_tokens` und liegt vor dem `0000`-Stand
   (`.tables` → nur `__drizzle_migrations`, `device_events`, `devices`, `software_versions`). Sie kann
   über Trigger auf Tabellen, die sie gar nicht hat, nichts aussagen. Die Negativaussage trägt allein
   auf Quelltext-Grep plus Migrationslektüre (Falle 2) — die Prod-DB bleibt ungemessen (Kapitel 7,
   Nr. 5).
4. **Zwei Zählungen, die in sich widersprüchlich waren.** *(aus `RA-DM-04` und `RA-DM-08`)* —
   (a) Der Vollständigkeitsbeleg zu den toten Spalten liefert **18** Treffer, nicht 19; die 18 sind
   einzeln durchgesehen, und die Korrektur **stützt** die Schlussfolgerung, statt sie zu schwächen.
   (b) `RA-DM-08` behauptete „SQL-seitige DEFAULTs gibt es nur **DREI**", nannte dann **zwei**
   (`sort_order 0`, `is_target false`) und setzte hinzu „und sonst keinen". Es sind **zwei**; über alle
   fünf Migrationen hinweg erscheint das Schlüsselwort `DEFAULT` sonst nirgends. Eine in sich
   widersprüchliche Zahl in einer Liste, die ausdrücklich als **Nachbau-Referenz** dient, ist kein
   Redaktionsfehler.
5. **„Wer die Normalisierung wegläst, macht ‚Muelheim' und ‚Mühlheim' gegenseitig unfindbar."** *(aus
   `RI-06`)* — **Das Beispiel ist falsch, der Befund richtig.** `device-filter.ts:24-31` bildet ü→u ab,
   **nicht** ue→u: „Mühlheim" wird zu `muhlheim`, „Muelheim" bleibt `muelheim`. Die beiden sind also
   **auch mit** der Normalisierung gegenseitig unfindbar; was sie leistet, ist die Auffindbarkeit von
   „Mühlheim" über die Eingabe „Muhlheim". Nur das ß-Beispiel stimmt („Straße"/„Strasse" → beide
   `strasse`). ⚠️ Das ist genau die Stelle, die ein Spec-Autor in **Testdaten** übernehmen würde — mit
   einem Test, der dann aus dem falschen Grund rot wäre.
6. **„Das Präfix `src/` fehlt in der Dokumentation durchgängig."** *(aus `B10`)* — **Zu weit.** Ohne
   Präfix schreiben `CLAUDE.md:20` und `docs/design/README.md:61`, `:75`, `:295`; **mit** Präfix
   schreibt `CLAUDE.md:38` dagegen `src/core/shell/icons.test.ts`. Die Doku ist **uneinheitlich, nicht
   einheitlich falsch** — und das ist die relevantere Aussage, weil aus „durchgängig fehlend" die
   mechanische Regel „überall `src/` ergänzen" folgen würde, die bei `:38` danebengreift.
7. **„Am 19.07. sind Repo- und Server-`compose.yaml` schon einmal auseinandergelaufen."** *(aus `R-09`)*
   — **Im Repo nicht nachweisbar.** Der Satz trug in `R-09` die Begründungslast dafür, die
   Redirect-Labels ins Repo zu holen; derselbe Befund führt die Behauptung in seinen eigenen offenen
   Messungen richtigerweise als ungemessen. Die **Empfehlung** bleibt (Falle 28), die **Begründung** ist
   eine Betreiberfrage. Ebenso: die konkreten Label-Zeilen sind ein **Entwurf** — `grep -rn
   redirectregex iuk-suite/docs/ iuk-suite/compose.yaml` bleibt leer, es gibt im Repo kein erprobtes
   Vorbild.
8. **„Der Kiosk ist heute bei Netzverlust funktionslos, so aufwendig sein PWA-Banner auch aussieht."**
   *(aus `R-17`)* — **Widerlegt.** `lib/queryClient.ts:19` setzt `gcTime` auf 24 Stunden mit dem
   Kommentar „keep unused data in cache for offline access", `:30` `networkMode: 'offlineFirst'`
   („Return cached data immediately, then refetch"), `:20-27` unterdrückt Retries gezielt bei
   `!navigator.onLine`, `:29` `refetchOnReconnect: 'always'` holt beim Wiederverbinden nach; dazu eine
   eigene `components/pwa/PWAOfflineIndicator.tsx`. **Der Kiosk ist beim LESEN absichtlich
   offline-fähig; funktionslos ist das SCHREIBEN.** ⚠️ Wer die Prämisse ungeprüft übernimmt,
   spezifiziert im Zweig „nein" einen **Rückschritt** gegenüber der Alt-App (Kapitel 6, Frage 8).
9. **„Der einzige Frischhaltemechanismus des heutigen Kiosks ist `refetchOnWindowFocus`."** *(aus `B11`
   und `B12`)* — **Unvollständig und damit irreführend.** Eine Zeile darunter steht
   `refetchOnReconnect: 'always'` (`queryClient.ts:29`) — auf einem Wandtablet der **praktisch
   wirksamere** von beiden, weil WLAN-Abriss und -Rückkehr passieren und ein Fensterfokuswechsel nicht.
   Die Folgerung („zwischen zwei Bedienvorgängen plausibel veralteter Bestand") bleibt richtig, die
   Begründung „weil ein Tablet nie den Fokus wechselt" war unvollständig, und die cache-zuerst-Auslegung
   (Nr. 8) fehlte ganz.
10. **„Der produktiv gelaufene lagerbuch-Import war Handarbeit am Server, deren einzige Spur das
    Runbook ist."** *(aus `R-06`)* — **Nicht belegt.** Aus der **Abwesenheit** eines Skripts folgt nicht,
    dass Handarbeit stattfand; das Runbook ist ein Plandokument, und ob der lagerbuch-Import überhaupt
    schon gelaufen ist, ist im Repo nicht nachweisbar (kein Ausführungsprotokoll, kein Zeitstempel, kein
    Ergebnisartefakt). Die **Messung** hält (kein `lagerbuch.ts`, kein `radio.ts` in
    `iuk-suite/scripts/import/`) und die **Empfehlung** ebenso (Pflicht 5); das **Wie** ist eine
    Betreiberfrage.
11. **„Der Geräte-Token wird als Cookie oder Speichereintrag abgelegt; das Tablet gilt auf dem falschen
    Host als angemeldet."** *(aus `B13`)* — **Zweimal zu unscharf, und die Fehlerrichtung dreht sich.**
    Gemessen ist **ausschließlich `localStorage`** (`tokenStorage.ts:5-13`), und `localStorage` ist
    origin-gebunden: es entsteht **kein** Überlauf über Subdomains. Der Schaden ist „auf dem Zielhost
    nicht vorhanden", **nicht** „auf der falschen Domain gültig" — ein stiller **Ausfall**, kein stiller
    **Zugriff**. Zweitens unterstellen „Geräte-Token-Enrollment" und „ein Geräte-Token" ein Token **je
    Gerät**; es gibt heute nur einen Env-Wert (Befund 3). ⚠️ Ein **Cookie** wäre schlimmer — genau das
    merkt `R-11` als Nebenbedingung an (Entscheidung 1).
12. **„Der Postgres des Kiosk trägt Geräte-Token, Setup-Zustand, Sitzungen und ggf. Historie."** *(aus
    `B02`)* — **Spekulierte Tabellenliste, die es nicht gibt.** Das Prisma-Schema führt **ein** Modell
    (`AdminUser`); es gibt **keine** Token-Tabelle (das Kiosk-Geheimnis ist ein Env-Wert,
    `token.controller.ts:32`), **keine** Setup-Tabelle (der Setup-Status ist
    `prisma.adminUser.count()`), **keinen** Postgres-Sitzungsspeicher (Nr. 1) und **keine**
    Historien-Tabelle (`history.repository.ts:9`, `:57`, `:65`, `:74` liest durch nach radio-admin).
    `B02` war damit nicht falsch, aber **schwächer als die Quellenlage** und riet eine Liste zusammen.
    Ebenso präzisiert: von den vier `fetch`-Aufrufen in `radio-admin.service.ts` gehen **zwei** gegen
    radio-admin (`:148`, `:181`), zwei gegen den OIDC-Provider (`:301` Token-Endpunkt, `:343`
    Discovery) — „vier fetch-Aufrufe gegen radio-admin" (`B01`) ist falsch.

### A2. Aus der Nacharbeit vom 17.08.: was NICHT trägt und was falsch stand

⚠️ **A2 zählt in derselben Folge weiter wie A (12 bis 16) — die Nummern sind also NICHT eindeutig,
solange man den Abschnitt nicht mitnennt.** „Nr. 12" gibt es zweimal: in A ist es der Postgres-Inhalt
des Kiosk, hier ist es die Richtigstellung zu `validateHostConfig`. Jeder Verweis auf einen Eintrag
dieses Abschnitts nennt deshalb **„A2 Nr. n"**, nie nur „Nr. n".

**12. Kapitel 7, Nr. 17 war die falsche Angabe, nicht Pflicht 6.** Nachgeschlagen: `validateHostConfig`
bricht bei genau den drei Klassen mit genau den Zeilenspannen ab, die Pflicht 6 nennt (`hosts.ts:69-76`
unbekanntes Suffix, `:81-85` Wert mit `/` oder `:`, `:87-93` doppelt vergebener Host). Wer künftig einen
Widerspruch zwischen einer Pflicht und einer „offenen Messung" findet: **die Quelle entscheidet, nicht
die vorsichtigere Formulierung.** Der `cookies.ts`-Teil derselben Nummer bleibt offen.

**13. ABGELEHNT — „Falle 23 ist keine Falle, weil `bootstrap.ts` abbricht".** Der Einwand trifft die
**erste** Hälfte des Eintrags, die ihn selbst als „lauten, selbsterklärenden Startabbruch" bezeichnet.
Die **zweite** Hälfte ist der Eintrag: `SUITE_ADMIN_GROUP_RADIO` **leer** gesetzt ist eine gültige
Aussage und wird **nicht** gemeldet — die Leer-Meldung greift nur bei `ACCESS` (`groups.ts:156`), die
Asymmetrie ist Absicht (`:139`). Zusammen mit Pflicht 17 sperrt das die Verwaltung für alle aus, ohne
dass irgendetwas rot wird. **Falle 23 bleibt eine Falle, die kein Gate findet.** Anders liegt es bei den
Einträgen 8 und 27 — dort ist der Einwand angenommen und in-place vermerkt (Methodenhinweis bzw.
Doku-Hinweis).

**14. ABGELEHNT — „der SW-Handgriff aus Falle 30 (ii) steht im Fließtext als Folge, nicht als
Vorbehalt".** Der Absatz kennzeichnet den Scope des Alt-Kiosks **zweimal** ausdrücklich als ungemessen
und formuliert den Handgriff konditional: „**Trifft das zu**, gehört ‚alte Registrierung austragen' … in
denselben Handgriff". Ein Vorbehalt, der zweimal dasteht, ist keiner, der fehlt. Was tatsächlich fehlte,
war die Verknüpfung von Frage 1 Zweig A mit dem **Zielentwurf** — das ist dort korrigiert, nicht hier.

**15. ABGELEHNT als Klassifikationsfehler, ANGENOMMEN als Reihenfolgefehler — Entscheidung 2 und 4.**
Beide tragen eine echte Beschlusshälfte (behält die Suite die Token-Verwaltung? was geschieht mit
`AdminUser`?), sind also keine bloßen Messungen und werden **nicht** umgestuft. Richtig ist der zweite
Teil des Einwands: ohne die vorgelagerte Betreiberantwort kann eine Sitzung dazu nichts beschließen.
Beide tragen jetzt eine ausdrückliche Zeile **„Reihenfolge: messen → entscheiden"**.

**16. Die Kennzahl „37 Befunde blockierend" ist ersatzlos gestrichen.** Sie bezog sich auf die 77
Rohbefunde, die dieses Dokument **nirgends** einzeln mit Blockierstatus auflistet — nicht falsifizierbar,
aber auch nicht nachprüfbar, und damit als Steuerungsgröße für eine Spec unbrauchbar. Nachrechenbar sind
allein die Zahlen der Kopfzeile: blockierende Entscheidungen und blockierende Betreiberfragen.

### B. Die 33 präzisierten Rohbefunde — was die alte Fassung jeweils sagte

Die korrigierten Fassungen stehen in den Kapiteln 2 bis 7. Hier steht die **alte** Lesart, damit
niemand sie wiederherstellt. Fundort-Korrekturen sind mitgeführt, weil eine Zeilennummer, die auf eine
andere Anweisung zeigt, beim nächsten Durchgang Zeit kostet.

| Rohbefund | Was die alte Fassung sagte — und was daran nicht hielt |
|---|---|
| `RA-DM-01` | „Sekunden-Import löscht die Leihhistorie **beim ersten Suite-Start**." → Bewiesen ist der Purge für **radio-admins eigene** SQLite; für die Suite gilt er nur, **wenn** die Retention mitportiert wird (ungemessen). Fundorte: der Kommentar steht auf `retentionService.ts:29-30` (nicht `:30-31`), der numerische Import-Branch auf `commit-service.ts:45-47` (nicht `:44-47`; `:44` ist die Kommentarzeile). Ergänzend **stärker** belegt als behauptet: die Boot-Verdrahtung `index.ts:35`. |
| `RA-DM-02` | Zusatzbeleg „`sqlite_master` einer lokalen DB" → siehe A.3. Alles Übrige gehalten und reproduziert. |
| `RA-DM-04` | „19 Treffer" → **18** (siehe A.4a). |
| `RA-DM-08` | „nur DREI SQL-Defaults" → **zwei** (siehe A.4b). |
| `RI-01` | „Der Postgres trägt eigene Nutzer **UND** den Sitzungsspeicher" → nur `AdminUser` (siehe A.1). Zusätzlich: die `AdminUser`-**Zeilenzahl** ist ungezählt; aus dem Setup-Riegel folgt nur „mindestens eine". Ergänzend stärker belegt: über **alle** Migrationen wurden nur drei Tabellen je angelegt. |
| `RI-02` | „Wer den Tabellenbestand aus `schema.prisma` liest, verliert den Sitzungsspeicher lautlos" + `blockierend: true` → die Folgerung fällt mit A.1; die **Methodenlehre** bleibt und ist sogar stärker (eine eingecheckte DDL-Datei, die kein Code ausführt, macht den Prod-Bestand aus dem Repo **grundsätzlich** unbestimmbar). Nicht mehr blockierend. |
| `RI-06` | Beispiel „Muelheim/Mühlheim" → siehe A.5. |
| `RI-08` | Compose-Beleg „`docker-compose.yml` Vorgabewert zeigt auf localhost" → der Beleg stützt nicht, wofür er zitiert wird: `:39` setzt ein **laufzeitliches `PUBLIC_APP_URL`** im **Backend**-Block, der QR-Code liest ein zur **Build**-Zeit gebackenes `VITE_PUBLIC_APP_URL`. Die **stärkere** Aussage: im Repo setzt **nichts** die gelesene Variable. |
| `RI-09` | „mit Express-Sitzung im Postgres" → MemoryStore (A.1). Damit auch: „fallen beide Anmeldewege weg, faellt der Grund fuer den Postgres weg" gilt **allein wegen `AdminUser`**. |
| `RA-AUTH-2` | „sonst **403**" → es ist ein **302-Redirect** auf `/403` (`routes.ts:76`, nicht `:73-75` — das ist das Optionsobjekt). Den 403-**Status** vergibt nur `requireRole` (`middleware.ts:49`). Zwei getrennte Semantiken. |
| `RA-SUB-1` | (i) `schema.ts:67` (`apiTokens.createdBy`) in der Liste der `sub`-tragenden Audit-Spalten → dort steht `user.name ?? user.sub` (`tokens.ts:29`), eine **gemischte** Spalte. (ii) „Weil Pocket ID `subject_types_supported: ["public"]` liefert, braucht es **keine** Identitäts-Migration" → durch **keinen** Beleg gedeckt; gehört nach Kapitel 7, Nr. 24. |
| `RA-LOAN-1` | „akzeptiert einen `Authorization: Bearer <t>`" → **auch `X-API-Key: <t>`** (`loanApi.ts:63-74`). Für den Port entscheidend: ein Handler, der nur `Authorization` liest, bricht jeden `X-API-Key`-Aufrufer. |
| `RA-TOK-1` | `createdBy` auf `tokens.ts:32` → steht auf `:29`; `:32` ist die öffnende Klammer des Antwortobjekts. Ebenso verschoben: POST `22-41` (nicht `22-40`), GET `44` (nicht `45`), DELETE `47-51` (nicht `48-52`). |
| `RA-BYPASS-1` | Unterschlägt die **Gegensperre**: `config.ts:48-52` lässt `AUTH_DEV_BYPASS=true` bei `NODE_ENV=production` gar nicht booten, `warnIfDevBypass` warnt laut (`middleware.ts:56-64`). Ein direkter Prod-Start mit Bypass ist **unmöglich**; `dev-user` kommt nur über einen Umweg in die Prod-Datei. Wahrscheinlichkeit erheblich niedriger, Befund bleibt. |
| `RI-PUBLIC-1` | „genau **drei** Löcher" → **vier** `@BypassApiToken()`-Fundstellen, und die vierte (`health.controller.ts:11`) steht auf **Klassenebene**, sodass die Zahl der Routen dahinter ungezählt ist. Der Beleg „`token.controller.ts:34`" zeigt auf das `throw new UnauthorizedException`, nicht auf den Dekorator (`:29`). |
| `RI-SUB-1` | „Ausserhalb von `auth.service.ts` speichert **kein Modul** die `session.userId`" → belegt mit einem `rg` **nur über `modules/admin`**; `setup`, `devices`, `loans`, `borrowers`, `radio-admin` ungeprüft. Fundort: `pocket-id.service.ts:133` (nicht `:134`, das ist `username:`). |
| `RI-ENV-1` | „das eingecheckte `docker-compose.yml` kann das Backend nicht booten — `API_TOKEN` **und die Pocket-ID-Variablen** fehlen dort" → die `POCKET_ID_*`-Variablen sind `.optional().default('')` und blockieren den Boot **nicht**; ihr Fehlen wählt still `provider: 'local'`. Boot-blockierend sind nur `API_TOKEN` und in Prod `RADIO_ADMIN_URL` samt Modus. Ergänzend **stärker**: der Service hängt an `profiles: ["full-app"]` (`:27`). |
| `RI-CORS-1` | „**Das** ist der Grund für `sameSite: 'none'`" (Cross-Origin) → der Quelltext nennt **zwei** Gründe: `session.config.ts:17` (Cross-Origin) **und** `:38` (OAuth-Rückweg von Pocket ID). Wer nur den ersten führt, schließt „ein Host ⇒ Lax genügt" ohne den Rückweg geprüft zu haben. |
| `R-A2` | „Bei **jedem Aufruf** stellt der Kiosk ein frisches Cookie aus (gleitende Verlängerung)" → in einer Server Component **unmöglich**, `cookies()` ist versiegelt (`helferZugang.ts:117-131`). Rotation nur in Route Handlern und Server Actions; **welcher Pfad sie trägt, ist eine zusätzliche Entscheidung** (Entscheidung 5, Punkt 4). Fundorte: `helferSitzung.ts:25` (nicht `:26`), `:55` (nicht `:56`), `abmelden/route.ts:89` (nicht `:91`). |
| `R-C1` | „Die **rechteste-Eintrag-Logik** (CWE-348) ist damit umgehbar" → es gibt **keine** rechteste-Eintrag-Logik; der Code nimmt den **ersten**, und genau diese Wahl **ist** der CWE-348-Mangel. So formuliert liest sich eine Härtung als vorhanden, die nicht existiert — der Leser würde schließen, es sei nur eine Umgehung zu schließen statt die Auswahlregel zu bauen. |
| `B01` | „**vier** fetch-Aufrufe gegen radio-admin" → zwei (A.12). „Die api_tokens-Kette **ist** der heutige Zugangsweg" → eine von **zwei** Möglichkeiten; `RADIO_ADMIN_API_TOKEN` ist optional mit Default `''`, und `loanApi.ts:5-6` importiert **beide** Prüfer (Entscheidung 2, Kapitel 6 Frage 3). Die **Reihenfolge**-Auflage überlebt. |
| `B02` | Spekulierte Tabellenliste → A.12. |
| `B04` | „rund 8.500 Zeilen", „13 `api/*.ts`", „9 Querschnittsdateien" → A.2. |
| `B06` | „31 render-Funktionen in **5 Tabellen** … in 5 Dateien" → die beiden Fünferlisten sind **nicht** deckungsgleich: `deviceColumns.tsx` hat 15 `render:` und **kein** `<Table`, `DeviceList.tsx` hat `<Table` und **kein** `render:`. Für die Spec kein Detail — beide Dateien gehören in **eine** Client-Insel (Befund 5). |
| `B10` | „durchgängig" → A.6. |
| `B11` | „die heutige Frischhaltung ist `refetchOnWindowFocus`" → zwei Auslöser, plus cache-zuerst (A.9, A.8). |
| `B12` | „**der einzige** Frischhaltemechanismus" → A.9. |
| `B13` | „Cookie oder Speichereintrag", „ein Geräte-Token", „gilt auf dem falschen Host als angemeldet" → A.11. |
| `R-06` | „Handarbeit am Server" → A.10. |
| `R-09` | „am 19.07. auseinandergelaufen", Label-Zeilen als erprobt → A.7. |
| `R-10` | **Der Befund widersprach sich selbst:** „ein Token, das heute unter `radio.iuk-ue.de` liegt, ist nach dem Umschwenk noch da" **und** „‚Enrollen vor dem Umschwenk auf der Endadresse' ist **definitorisch unmöglich** — dieser Origin existiert vorher nicht". Beides zugleich kann nicht gelten; welchen Origin der Alt-Kiosk bedient, ist **nicht gemessen**. Aufgeteilt in zwei Zweige (Kapitel 6, Frage 1). Damit ist auch „ein Neu-Enrollment je Tablet ist Pflicht" **nur unter Zweig B** wahr. |
| `R-14` | (i) Der Scope-Punkt ist eine **Regel-Ableitung**, keine Messung am Alt-Kiosk — der Befund gab das in seinen offenen Messungen zu, formulierte die Folge im Fließtext aber als Tatsache. (ii) „der ALTE SW liegt nach dem Umschwenk unter derselben Adresse" trägt dieselbe ungemessene Origin-Annahme wie `R-10` und widerspricht dessen zweiter Hälfte. |
| `R-17` | „heute bei Netzverlust funktionslos" → A.8. |

### Was ausdrücklich NICHT bricht — entlastende Befunde

Damit ein späterer Durchgang sie nicht als Risiko neu aufwirft:

- **Kein append-only-Trigger, kein CHECK-Constraint in radio-admin** — die `lagerbuch`-Präzedenz
  „`onConflictDoUpdate` bricht an Triggern" trifft hier **nicht** zu (Falle 2). Der Riegel liegt
  woanders, und der Unterschied ist gemessen, nicht angenommen.
- **Der `sub`-Bruch anderer Module existiert in radio-admin nicht** — `users` ist auf `sub`
  geschlüsselt, keine Zufalls-UUID (Pflicht 10). Es braucht **keine** Identitäts-Migration innerhalb
  der Alt-App; offen ist nur der Client-Vergleich (Kapitel 7, Nr. 24).
- **`refetchInterval` und `useInfiniteQuery` kommen in KEINER der beiden Apps vor** — 0 Treffer. Es gibt
  heute **kein** Polling; die Entscheidung „Query fällt weg, `revalidatePath` ersetzt den Cache" trägt
  technisch (Pflicht 22).
- **Suite-Falle 11 (`locator.dragTo()`) ist nicht berührt** — 0 Treffer für Drag-and-Drop in beiden Frontends
  (Kapitel 5, Eintrag 26). Sie wird nur scharf, wenn die Suite die Versions-Sortierung als Ziehen **neu** baut
  (Entscheidung 12).
- **44 und 48 Pixel sind antd-Token-gedeckt** (`ARBEITSDICHTE`, `src/core/theme/theme.ts:207-211`) — nur
  56/64/72 sind Nachbau, und `min-width` sowie `touch-action: manipulation` (Pflicht 18). Die
  Bediendichte ist die kleinere Hälfte des Oberflächenumbaus.
- **`radio.db` fällt ohne jede Skriptänderung ins Backup** (`scripts/backup.sh:25-27`) — der Vorteil der
  Ein-Datei-je-Modul-Regel (Pflicht 7).
- **Es gibt keinen Postgres-Arm der Migration** — der Import ist rein SQLite→SQLite (Pflicht 19), anders
  als bei `portal` (`scripts/import/portal.ts:8-34` liest NDJSON aus Postgres).
- **CORS, `credentials: true` und `SameSite=None` verschwinden ersatzlos** — beide Gründe sind mit
  einem Host in einem Prozess erledigt (Pflicht 12), und mit ihnen der Grund für das
  Eltern-Domain-Cookie.
- **`iuk-suite` hat kein Tailwind, lucide, clsx oder `class-variance-authority`** (0 Treffer in
  `package.json`) — die 13 shadcn-Kopien fallen weg, und der `@ant-design/v5-patch-for-react-19`-Shim
  wird mit antd 6 gegenstandslos (Pflicht 21).
