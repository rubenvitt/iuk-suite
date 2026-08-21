# 6. Der Wegfall der HTTP-Grenze und was aus der oeffentlichen API wird

Heute stehen zwischen einem Klick auf „Ausleihen" und der Zeile in `loans` **zwei** HTTP-Spruenge und
**zwei** Auth-Systeme: Browser → NestJS (`Authorization: Bearer <API_TOKEN>`), NestJS → radio-admin
(S2S-Bearer auf `api/v1/*`). Der Port loescht beide Spruenge. Dieses Kapitel schreibt aus, was an ihre
Stelle tritt, was ersatzlos verschwindet, was von der Fachlichkeit der Grenze gerettet werden muss, und
in welcher Reihenfolge das gebaut wird — die Reihenfolge ist hier kein Ratschlag, sondern die
Bedingung dafuer, dass der Cutover ueberhaupt deploybar ist.

> **Zu den Verweisen auf andere Kapitel:** die endgueltige Kapitelnummerierung entsteht erst bei der
> Zusammenfuehrung. Zusagen sind deshalb nach **Gegenstand** adressiert („Zusage an das
> Datenmodell-Kapitel"), nicht nach Nummer. Fallennummern sind **zweigleisig**: 1–12 sind die aus
> `iuk-suite/CLAUDE.md`; die Zaehlung 57/60/61 ist die des `lagerbuch`-Vorgaengers und steht **nicht**
> in `docs/design/README.md` (dort sind die Fallen unnummeriert) — sie wird ueber
> `docs/lagerbuch-portierung-analyse.md` und `src/app/m/lagerbuch/_lib/host.ts` gefuehrt, die
> Nachbarkapitel benutzen sie ebenso. Dieses Kapitel beruehrt **Falle 61** (Host-Riegel — hier in der
> Form „er wird **nicht** ein zweites Mal gerufen", 6.1), **Falle 6** (die Lesefunktionen liegen in
> einem Modul ohne `"use client"`), **Falle 9** (die Vorschlags-Action wird importiert, nicht als Prop
> gereicht, 6.2), **Falle 10** (abgebrochener POST waehrend der Erstkompilierung — betrifft nur den
> e2e-Test) und in 6.7 **Falle 7** als Grund, warum Abschnitt D einen echten Abruf verlangt. Mehr wird
> hier nicht behauptet.

## 6.1 Die sechs `/v1`-Routen und ihr Ersatz

Alle sechs liegen in **einer** Datei, `radio-admin/server/src/routes/loanApi.ts`, und sind
ankerfest gezaehlt:

```
grep -n "r\.\(get\|post\|patch\|put\|delete\)('" radio-admin/server/src/routes/loanApi.ts
126:  r.get('/v1/loan-devices', auth, (c) => {
133:  r.get('/v1/active-loans', auth, (c) => {
140:  r.get('/v1/loans/history', auth, (c) => {
148:  r.get('/v1/borrowers/suggestions', auth, (c) => {
158:  r.post('/v1/loans', auth, async (c) => {
187:  r.patch('/v1/loans/:loanId', auth, async (c) => {
```

Gemountet werden sie **vor** dem Sitzungs-Riegel (`radio-admin/server/src/app.ts:51`,
`app.route('/api', loanApiRoutes(db, cfg))`) — daher der Praefix `api/v1/...` auf der Aufruferseite.
Der einzige Aufrufer ist `RadioAdminService` im Kiosk-Backend
(`radio-inventar/apps/backend/src/modules/radio-admin/radio-admin.service.ts:146`, `:229`, `:240`,
`:248`, `:266`, `:276`), und der wird aus vier Stellen gerufen:
`modules/devices/devices.service.ts`, `modules/loans/loans.repository.ts`,
`modules/borrowers/borrowers.repository.ts`, `modules/admin/history/history.repository.ts`.

| Alt-Route (`loanApi.ts`) | Was sie tut | Wer sie heute ruft | Ersatz im Monolithen | Warum diese Form |
|---|---|---|---|---|
| `GET /v1/loan-devices` (`:126`) | `listLoanableDevices(db)`, projiziert per `toLoanDevice` (`:47-61`) — verleihbare Geraete, Teilmenge ohne Audit-/Software-Felder | `radio-admin.service.ts:146` (`refreshDevices`), von dort `devices.service.ts` und indirekt `getDeviceById` (`:138-141`) | **Interne Lesefunktion**, aus der Server Component (RSC) direkt gerufen | Lesen braucht keine Server Action. Der Aufruf sitzt im Render-Pfad der Ausleihe-Seite; jede Action-Form waere ein zusaetzlicher POST ohne Nutzen. |
| `GET /v1/active-loans` (`:133`) | `findActiveLoans(db)`, projiziert per `toActiveLoan` (`:98-107`) — Statusquelle fuer Geraete-Overlay und Dashboard. Bewusst **nicht** in `/loan-devices` gefaltet (Kommentar `:130-132`: sonst verschwindet eine Leihe auf einem seit dem Verleih un-verleihbar gemachten Geraet) | `radio-admin.service.ts:248` → `loans.repository.ts` | **Interne Lesefunktion** aus RSC | wie oben. ⚠️ Die Nicht-Faltung ist eine **fachliche** Entscheidung, keine Routenaufteilung — sie muss die Grenze ueberleben (6.3, Posten 2). |
| `GET /v1/loans/history` (`:140`) | `listLoans(db, params)` nach `loanHistoryParamsSchema` (aktiv + zurueckgegeben, paginiert). Kommentar `:137-139`: Retention ist ein Job, Lesen purgt nicht | `radio-admin.service.ts:266` → `admin/history/history.repository.ts` | **Interne Lesefunktion** aus RSC, Filter/Seite ueber `searchParams` | Historie ist eine verlinkbare, teilbare Ansicht. Der Zustand gehoert in die URL, nicht in einen Client-Cache — TanStack Query faellt weg. |
| `GET /v1/borrowers/suggestions` (`:148`) | `findBorrowerSuggestions(db, q, limit)` nach `borrowerSuggestionsQuerySchema` — Namens-Vorschlaege beim Tippen | `radio-admin.service.ts:276` → `borrowers.repository.ts` | **Server Action**, aus der Client-Insel des Ausleih-Formulars gerufen | Der **einzige** Fall, der wirklich offen war — Begruendung in 6.2. |
| `POST /v1/loans` (`:158`) | Rumpf nach `createLoanSchema`; dann `getDeviceById` → `loanable` → `mapDeviceCondition(device.status) === 'AVAILABLE'` → `createLoan` mit Snapshot-Feldern; `LoanConflictError` → 409 | `radio-admin.service.ts:229` → `loans.repository.ts` | **Server Action** `ausleiheAnlegen` (→ `bucheAusleihe`) | Schreibvorgang aus einem Formular, `revalidatePath` danach. Genau der Fall, fuer den eine Action da ist. ⚠️ Ein POST **je Gerät** wird zu **einer** Transaktion ueber die ganze Auswahl (siehe Signaturblock). |
| `PATCH /v1/loans/:loanId` (`:187`) | Rumpf nach `returnLoanSchema`; `returnLoan(db, loanId, returnNote)`; `updated`/`alreadyReturned` unterscheidet 200/409/404 | `radio-admin.service.ts:240` → `loans.repository.ts` | **Server Action** `rueckgabeBuchen` (→ `bucheRueckgabe`) | wie oben. |

**Es bleibt kein Route Handler.** Die drei Lesefunktionen laufen im Render, die drei Schreib-/
Tippfunktionen sind Server Actions. Damit entsteht durch die sechs Routen **kein** neuer Pfad, der den
Cordon aus Entscheidung 10 von Hand tragen muesste, und **kein** neuer Pfad, der Falle 61 beruehrt.

### Zusage an das Datenmodell- und Fachlogik-Kapitel: die sechs Ersatz-Signaturen

Die Lesefunktionen liegen in **einem** Modul ohne `"use client"` (Falle 6), die Actions in einem Modul
mit `"use server"`.

⚠️ **Namensabgleich — diese Namen sind nicht in diesem Kapitel entschieden.** Die drei Actions, ihre
Ergebnistypen und die beiden Lesepfade der Ausleihe-Flaeche gehoeren dem **Ausleihe-Kapitel**, das sie
mit Bildschirmtexten und Testnamen ausschreibt (`ausleiheAnlegen`, `rueckgabeBuchen`,
`entleiherVorschlaege`, `AusleihErgebnis`/`RueckgabeErgebnis`, Datei `_actions/ausleihe.ts`). Dieses
Kapitel uebernimmt sie **woertlich**, damit die Zusammenfuehrung nicht zwei Namen fuer dieselbe
Funktion liest; sein eigener Beitrag ist die Abbildung Alt-Route → Ersatzfunktion, die Fehler-Abbildung
in 6.3 und die Reihenfolge in 6.7. Neu benannt sind hier nur die drei Ersaetze, fuer die kein anderes
Kapitel einen Namen fuehrt: `leihhistorie` (die Verwaltungs-Ansicht der Historie) sowie `bucheAusleihe`,
`bucheRueckgabe` und `sucheEntleiher` — die **Datenfunktionen** unter den drei Actions. Die Trennung ist
nicht kosmetisch: die Action traegt Riegel, `FormData` und `revalidatePath`, die Datenfunktion traegt die
Transaktion und ist ohne Next-Laufzeit testbar (6.6). ⚠️ Sie darf auch **nicht** denselben Namen tragen
wie die Action: `_actions/ausleihe.ts` **importiert** die Datenfunktion und **exportiert** die Action —
gleiche Namen kollidieren in derselben Datei. Deshalb heisst die Datenseite der Vorschlaege
`sucheEntleiher` und nicht noch einmal `entleiherVorschlaege`.

`src/app/m/radio/_db/leihen.ts` — kein `"use client"`, kein `"use server"`, reine Datenzugriffe. **Alle
nehmen `db` als ersten Parameter**, nach dem Muster, das die Suite in diesem Modul bereits setzt
(`raeumeLeihhistorie(db, jetzt?)` im Datenmodell-Kapitel, dort mit dem Aufrufer
`raeumeLeihhistorie(getDb())`) — die Funktion holt sich die Verbindung nicht selbst, sonst ist sie im
Test nicht gegen eine eigene Datei zu haengen (6.6). `RadioDb` ist der Typ aus `_db/client.ts`
(Datenmodell-Kapitel):

```ts
export function geraeteMitLeihstand(db: RadioDb): GeraetMitLeihstand[];   // ersetzt GET /v1/loan-devices
export function offeneAusleihen(db: RadioDb): OffeneAusleihe[];           // ersetzt GET /v1/active-loans
export function leihhistorie(db: RadioDb, f: LeihhistorieFilter): LeihhistorieSeite;
export function sucheEntleiher(db: RadioDb, suchtext: string, deckel: number): Vorschlag[];
export function bucheAusleihe(db: RadioDb, e: AusleihEingabe): AusleihErgebnis;
export function bucheRueckgabe(db: RadioDb, ausleiheId: string, notiz: string | null): RueckgabeErgebnis;
```

⚠️ **`Vorschlag` ist kein `string`.** `findBorrowerSuggestions` gibt heute
`BorrowerSuggestion[]` = `{ name, lastUsed }` zurueck (`radio-admin/server/src/repos/loanRepo.ts:168`
und `:184`, Schema `radio-admin/shared/src/loan.ts:126-129`) — `lastUsed` ist der letzte Ausleihzeitpunkt
und traegt die Nebenzeile „zuletzt am 14.06." im Vorschlag. Eine Signatur `string[]` waere genau der
Posten aus 6.3, der beim Port **still** verschwindet, hier im eigenen Vertrag. Nach der Entscheidung des
Ausleihe-Kapitels ist `Vorschlag` = `{ name: string; zuletztText: string }` — eine **fertige
Zeichenkette**, kein Zeitstempel. Damit beruehrt dieser Pfad Entscheidung 11 gar nicht: die epoch-ms
aus der Quelle erreichen die Fläche nie als Zahl.

`src/app/m/radio/_actions/ausleihe.ts` — `"use server"`, ruft ausschliesslich nach oben (Signaturen
woertlich aus dem Ausleihe-Kapitel, `_vorher` weil beide an `useActionState` haengen):

```ts
export async function ausleiheAnlegen(_v: AusleihErgebnis | null, f: FormData): Promise<AusleihErgebnis>;
export async function rueckgabeBuchen(_v: RueckgabeErgebnis | null, f: FormData): Promise<RueckgabeErgebnis>;
export async function entleiherVorschlaege(suchtext: string): Promise<Vorschlag[]>;
```

⚠️ **`bucheAusleihe` nimmt eine Liste, nicht ein Gerät.** Das Ausleihe-Kapitel hat den Vorgang als
**eine** Drizzle-Transaktion ueber alle gewaehlten Geraete entschieden (alles oder nichts, Deckel 20).
Die Alt-Route ist ein POST je Gerät, und sie feuert alle **gleichzeitig**:
`await Promise.all(deviceIds.map((deviceId) => mutateAsync({ deviceId, borrowerName })))`
(`radio-inventar/apps/frontend/src/components/features/ConfirmLoanButton.tsx:55-59`). Damit ist der
Teilerfolg heute der Normalfall — scheitert der dritte von vier, sind die anderen drei gebucht und die
Fläche meldet trotzdem einen Fehler. Ein Ersatz mit Einzelgeraet-Signatur zoege genau diese Form still
wieder ein und koennte die Zusage „es wurde nichts gebucht" nicht halten. Die drei Master-Pruefungen aus
6.3 laufen deshalb **je Gerät innerhalb** der einen Transaktion.

Jede der drei Actions ruft als **erste Anweisung** `requireRadioZugang` (Entscheidung 10). ⚠️ **Sie
ruft den Host-Riegel NICHT zusaetzlich:** `requireRadioZugang` ruft ihn **intern** als erste Anweisung,
und das Ausleihe-Kapitel sagt dieselbe Zusage zu und prueft sie („liest die Kopfzeilen genau einmal").
Genau so steht es im Vorbild: `requireLagerbuchHost` liegt **innerhalb** von
`requireLagerbuchAdmin`/`requireHelferSitzung` und nicht in einer Liste, die die naechste Action
vergisst (`src/app/m/lagerbuch/_lib/host.ts`, Abschnitt „WO DIESE FUNKTIONEN GERUFEN WERDEN"). Ein
zweiter Aufruf waere keine zweite Sicherung, sondern ein zweites Lesen der Kopfzeilen — und damit ein
roter Test im Nachbarkapitel. Wie die anonyme Ausleihe von der Verwaltung unterschieden wird,
entscheidet das **Zugangs-Kapitel**; dieses Kapitel sagt nur: es gibt keinen Aufruf ohne Riegel als
erste Zeile, und `ausleiheAnlegen`/`rueckgabeBuchen` sind die **anonyme** Stufe, nicht die Admin-Stufe.

**Zusage an das Datenmodell-Kapitel:** `bucheAusleihe` verlaesst sich auf den **partiellen Unique-Index**
gegen den gleichzeitigen Zweitverleih. Heute ist er der einzige atomare Schutz („The partial unique index
is the atomic guard against a concurrent borrow (no SELECT-then-insert race)", `loanApi.ts:154-157`) und
seine Verletzung kommt als `LoanConflictError` (`loanApi.ts:13`, `:180`) zurueck. Der Index gehoert ins
Datenmodell-Kapitel; hier wird er **benannt, nicht entworfen**. Faellt er weg und wird durch ein
`SELECT`-dann-`INSERT` ersetzt, ist der Port fachlich falsch, und kein Test in diesem Kapitel wuerde es
sehen.

⚠️ **Er heisst `loans_device_active_uidx`, und kein Generator erzeugt ihn.** In der Quelle steht er von
Hand am Ende von `radio-admin/server/drizzle/0003_kind_spot.sql`, mit der Begruendung im Schema selbst:
„enforced by a PARTIAL unique index `loans_device_active_uidx` ON (device_id) WHERE returned_at IS NULL,
hand-added in the migration because drizzle-kit cannot emit partial indexes"
(`radio-admin/server/src/db/schema.ts:112-115`). Das Ziel benutzt dasselbe `drizzle-kit`, also gilt
dieselbe Grenze — der Index ist dem Drizzle-Schema unsichtbar, `drizzle-kit generate` sieht ihn nicht
und entfernt ihn nicht. Das Datenmodell-Kapitel legt ihn deshalb in eine **eigene, handgeschriebene**
Migrationsdatei. Diese Zeile steht hier, weil die tragende Zusage dieses Kapitels („`bucheAusleihe`
braucht kein `SELECT` vor dem `INSERT`") an einem Objekt haengt, das kein Gate und kein Generator
herstellt.

## 6.2 Der eine offene Fall: die Ausleiher-Vorschlaege

`GET /v1/borrowers/suggestions` ist der einzige der sechs, der aus einer **Client-Insel waehrend des
Tippens** gerufen wird. Zwei Formen waren moeglich:

* **Route Handler** (`src/app/m/radio/api/vorschlaege/route.ts`): GET, `fetch` aus der Insel,
  HTTP-cachebar. **Preis:** ein Route Handler hat kein Layout ueber sich, also truege er den
  Zugangs-Riegel **und** den Host-Riegel (Falle 61) von Hand — dauerhaft, bei jeder spaeteren
  Aenderung neu. Dazu die zweite Testpflicht aus Falle 10 (Warmlauf-GET vor dem ersten echten Treffer
  unter `next dev`, `page.waitForResponse` statt Warten auf eine Zustandsaenderung).
* **Server Action** aus der Insel: `entleiherVorschlaege(suchtext)`. POST, nicht HTTP-cachebar.
  **Preis:** ein POST je Tastendruck-Fenster.

**Entschieden: Server Action.** Die Begruendung ist projektspezifisch und nicht Geschmack: mit
`requiresAuth: false` (Entscheidung 4) erbt **kein** Pfad dieses Moduls ein Middleware-Gating, also ist
jeder ueberlebende HTTP-Endpunkt eine Flaeche, die den Cordon fuer immer selbst traegt. Der einzige
Vorteil des Handlers waere HTTP-Caching — und der ist hier wertlos: die Antwort haengt am Tippstand,
ist personenbezogen (Namen von Ausleihern) und darf gar nicht in einem Shared Cache landen. Die
Datenmenge ist klein (Entscheidung 12 nennt < 100 Leihen im Retentionsfenster als Schaetzung), die
Abfrage ist ein `SELECT DISTINCT` im selben Prozess.

⚠️ **Damit uebernimmt diese Action die Einhegung, die vorher das Query-Schema trug — und sie muss sie
verschaerfen.** Heute steht sie in `borrowerSuggestionsQuerySchema`: `q: z.string().trim().min(1)` und
`limit` mit Vorgabe 10 (`radio-admin/shared/src/loan.ts:116-119`), geklemmt auf 1..50 im Repo
(`radio-admin/server/src/repos/loanRepo.ts:169`). **Eine Server Action hat kein Query-Schema.** Ohne
eigene Pruefung laeuft `entleiherVorschlaege("")` in ein `LIKE '%%'` (`loanRepo.ts:174-179`) und liefert
einem **anonymen** Aufrufer die vollstaendige Namensliste des Retentionsfensters. Verbindlich deshalb,
als erste Anweisungen der Action **nach** dem Riegel:

1. `suchtext.trim().length < 2` → sofort `[]`. **Zwei** Zeichen, nicht eines: das Ausleihe-Kapitel
   stuetzt seine Datenschutz-Begruendung ausdruecklich auf „keine Auflistung ohne Suchtext", und die
   Alt-Fläche hat dieselbe Schwelle.
2. Der Deckel steht **serverseitig fest** bei 10 und ist kein Parameter der Action — ein von aussen
   gesetztes `limit` gaebe es nur, damit es jemand auf 50 dreht.
3. Zurueck geht `{ name, zuletztText }`, nie `lastUsed` als Zahl — kein Zeitstempel in Millisekunden
   verlaesst den Server.

Die Insel entprellt (`~200 ms`) und verwirft veraltete Antworten anhand des zuletzt gesendeten `q` —
Server Actions sind **nicht** reihenfolgegarantiert, und ohne diese Zeile blinkt die Vorschlagsliste
zurueck auf einen aelteren Tippstand. Das ist die Stelle, an der TanStack Querys
`keepPreviousData`/`isFetching` wegfaellt, ohne dass jemand es merkt.

**Zusage an das Ausleihe-Kapitel:** die Vorschlagsliste ist eine `"use client"`-Insel, die
`entleiherVorschlaege` **direkt importiert** — nicht als Prop durchgereicht (Falle 9: nur Server
Actions duerfen die RSC-Grenze passieren, und auch die nur per Import). Die Bauform der Insel
(`AutoComplete` mit Nebenzeile) ist dort bereits entschieden; dieses Kapitel legt nur fest, dass hinter
ihr eine Action und kein Endpunkt liegt.

## 6.3 Was ersatzlos verschwindet — und was dabei stillschweigend mitverschwinden wuerde

### Gezaehlt, nicht geschaetzt

| Posten | Zahl | Befehl |
|---|---:|---|
| NestJS-Querschnittsdateien in `common/` ohne Specs | **14** Dateien / **505** Zeilen | `find radio-inventar/apps/backend/src/common -name '*.ts' -not -name '*.spec.ts'` |
| davon Guards | 2 | `common/guards/{api-token,session-auth}.guard.ts` |
| davon Pipes | 2 | `common/pipes/{parse-cuid2,zod-validation}.pipe.ts` |
| davon Interceptor / Filter | 1 / 1 | `common/interceptors/transform.interceptor.ts`, `common/filters/http-exception.filter.ts` |
| davon Decorators | 2 | `common/decorators/{bypass-api-token,public}.decorator.ts` |
| davon Barrel-`index.ts` | 4 | `decorators/`, `guards/`, `pipes/`, `utils/` |
| davon **kein** Grenzposten | 2 | `common/middleware/request-id.middleware.ts` (Betriebs-Telemetrie), `common/utils/string-transform.util.ts` (Hilfsfunktion — vor dem Loeschen pruefen, ob Fachlogik darin steckt) |
| dritter Guard, ausserhalb `common/` | 1 | `radio-inventar/apps/backend/src/modules/setup/guards/setup.guard.ts` |
| DTO-Dateien | **14** | `find radio-inventar/apps/backend/src -name '*.dto.ts'` |
| Zod-Schemadateien im Kiosk-`shared` | **8** | `radio-inventar/packages/shared/src/schemas/` |

⚠️ **Zahlenabgleich mit der Analyse, damit die Zusammenfuehrung keinen Widerspruch liest:**
`docs/radio-portierung-analyse.md:1082` nennt „7 NestJS-Querschnittsdateien
(Guards/Pipes/Interceptor/Filter) + 2 Barrel-`index.ts`" = 9 Dateien / 351 Zeilen. Das ist dieselbe
Menge, anders geschnitten: die 7 sind 3 Guards (inklusive `setup.guard.ts`) + 2 Pipes + 1 Interceptor
+ 1 Filter, die 2 Barrels sind `guards/index.ts` und `pipes/index.ts`. Meine 14 sind **alles** unter
`common/` ohne Specs, also zusaetzlich die 2 Decorators, die 2 weiteren Barrels und die zwei
Nicht-Grenzposten. Beide Zahlen sind richtig; wer sie vergleicht, muss den Schnitt mitlesen.

### Die doppelten Schemata

Die 14 DTO-Dateien existieren **ausschliesslich**, weil ein Schema die HTTP-Grenze zweimal beschreiben
muss: einmal als Zod-Schema in `radio-inventar/packages/shared/src/schemas/` (8 Dateien, darunter
`radio-admin-loan.schema.ts` mit 6 Exporten und `radio-admin-device.schema.ts` mit 2 — die
Spiegelbilder von `@ra/shared`), einmal als DTO-Klasse fuer den Controller. Ohne Grenze bleibt **ein**
Schema. Dazu faellt die dritte Beschreibung derselben Sache: `LoanDevice`/`ActiveLoan` als
Projektions-Interfaces in `loanApi.ts:34-45` bzw. in `@ra/shared`.

Weiter ersatzlos:

* **Der API-Client des Kiosks** (12 `api/*.ts`, 1.859 Zeilen; Analyse `:1079`) und `lib/queryClient.ts`.
* **CORS** — `app.enableCors` (`radio-inventar/apps/backend/src/main.ts:68`) und die Origin-Liste ab
  `:54`, gefuettert aus `ALLOWED_ORIGINS` (`config/env.config.ts:9`,
  `z.string().optional().default('')`). Im Monolithen gibt es keinen Cross-Origin-Aufruf mehr; die
  Variable verschwindet aus jeder Umgebung.
* **Der zweite HTTP-Sprung samt Auth-Apparat:** `getAuthHeader` (`radio-admin.service.ts:88-92`), der
  client_credentials-Weg (`requestToken` `:293`, `discoverTokenEndpoint` `:336`,
  `TOKEN_REFRESH_SKEW_MS`, `DEFAULT_TOKEN_TTL_SECONDS`), die Token- und Discovery-Caches, die
  In-Flight-Deduplizierung — und auf der Gegenseite `verifyApiToken` und `verifyLoanJwt`
  (`loanApi.ts:5-6`) samt `auth/loan-api-jwt.ts`.
* **Der eigene HTTP-Server** von radio-admin (`server/src/index.ts`, 56 Zeilen; Hono + `@hono/node-server`).
* **Der `RADIO_ADMIN_*`-Env-Block** des Kiosks: `RADIO_ADMIN_URL`, `RADIO_ADMIN_API_TOKEN`,
  `RADIO_ADMIN_ISSUER_URL`, `RADIO_ADMIN_CLIENT_ID`, `RADIO_ADMIN_CLIENT_SECRET`,
  `RADIO_ADMIN_CACHE_TTL_MS` (`radio-inventar/apps/backend/src/config/env.config.ts:28`, `:106-131`;
  `:129` nennt radio-admin ausgeschrieben „the device & loan source"). **Zusage an Spec 2 (Runbook):**
  dieser Block wird beim Abstellen des Alt-Kiosks aus der Compose-Datei entfernt, nicht auskommentiert
  — ein stehengelassener `RADIO_ADMIN_URL` auf `radio.iuk-ue.de` laesst einen versehentlich
  neugestarteten Alt-Container gegen die Suite laufen.

### Die vier Dinge, die beim naiven Port still mitverschwinden

**1. Das Fehlercode-Vokabular.** Acht maschinenlesbare Codes gehen heute ueber die Grenze und werden
vom Client zu HttpExceptions gemappt (`RadioAdminLoanError`, `radio-admin.service.ts:23-31`,
Auswertung `:198-212`). Der Monolith hat keine HTTP-Antwort mehr, in die sie passen — sie werden zur
**diskriminierten Union** als Rueckgabewert der Server Action. Die Union ist im Ausleihe-Kapitel
entschieden (`AusleihErgebnis` / `RueckgabeErgebnis`, Diskriminator `grund`, dazu `text` und bei der
Ausleihe `betroffen: { rufname, status }[]`); dieses Kapitel liefert die **Abbildung**, damit kein
Ausgang beim Port unbemerkt zusammenfaellt:

| Alt-Code (`loanApi.ts`) | Status | Ursache | Neue Form |
|---|---:|---|---|
| `invalid_body` (`:161` POST, `:191` PATCH), `invalid_query` (`:142`, `:150`) | 400 | Schema-Verletzung | kein eigener `grund`, sondern der **feldnahe** der beiden Unions: `keine-auswahl` / `kein-name` (Ausleihe), `notiz-zu-lang` (Rueckgabe) — Feldfehler am Formularfeld, nicht als Seitenmeldung |
| `device_not_found` (`:165`) | 404 | Geraete-Id unbekannt | `grund: "verschwunden"` |
| `device_not_loanable` (`:166`) | 409 | `loanable = false` | `grund: "nicht-verfuegbar"`, Gerät in `betroffen` |
| `device_not_available` (`:168`) | 409 | `mapDeviceCondition(status) !== 'AVAILABLE'` | `grund: "nicht-verfuegbar"`, `betroffen[].status` traegt den Zustand |
| `device_already_on_loan` (`:180`) | 409 | Unique-Index / `LoanConflictError` | `grund: "nicht-verfuegbar"`, `betroffen[].status` sagt „ausgeliehen"; der Satz nennt Rufname und Entleiher |
| `loan_already_returned` (`:196`) | 409 | `returnedAt` gesetzt | `grund: "schon-zurueck"` |
| `loan_not_found` (`:197`) | 404 | Leih-Id unbekannt | `grund: "unbekannt-geworden"` |

⚠️ **Zahlenabgleich fuer die Zusammenfuehrung:** dieses Kapitel zaehlt **acht** Codes (`loanApi.ts`
gibt sie aus), das Ausleihe-Kapitel **sechs** Ausgaenge. Beide stimmen: die sechs sind die **fachlichen**
Ablehnungen, `invalid_body` und `invalid_query` sind Schema-Verletzungen und in der neuen Form gar keine
eigene Klasse mehr, weil die Action ihr Formular selbst validiert. Wer die Zahlen vergleicht, muss den
Schnitt mitlesen.

⚠️ **Der Diskriminator ist gröber als das Alt-Vokabular, und das ist die Stelle zum Hinsehen.** Drei
Alt-Codes (`device_not_loanable`, `device_not_available`, `device_already_on_loan`) fallen auf **einen**
`grund: "nicht-verfuegbar"`. Was sie auseinanderhaelt, ist `betroffen[].status` und der Satz — nicht der
Typ. **Deshalb bleiben die drei Pruefungen im Server getrennt** (Posten 3) und der Test dort prueft sie
einzeln; faellt die Trennung *dort* zusammen, merkt es niemand mehr an der Union.

⚠️ **Der leichteste Verlust ist das Feld `condition` im 409-Rumpf** (`loanApi.ts:168`:
`c.json({ error: 'device_not_available', condition }, 409)`). Es ist das einzige, das dem Kiosk sagt,
**warum** ein Geraet nicht verfuegbar ist — ohne es steht auf dem Bildschirm „nicht verfuegbar" und die
Person am Kiosk sucht das Geraet weiter. Sein Platz in der neuen Form ist **`betroffen[].status`**; das
Feld existiert in der Union des Ausleihe-Kapitels bereits, es muss nur gefuellt werden. Ein
`betroffen`-Eintrag ohne `status` ist derselbe Verlust in neuer Schreibweise.
**Zusage an das Ausleihe-Kapitel:** die Union ist die Rueckgabeform beider Schreib-Actions, und **jeder**
`grund` braucht dort einen Text. Kein `throw` fuer fachliche Ablehnungen — ein geworfener Fehler aus
einer Server Action kommt in Produktion als anonymisierte Meldung an und ist damit genau der Fall
`device_not_available` ohne `condition`.

**2. Die Projektionen `toLoanDevice` (`:47-61`) und `toActiveLoan` (`:98-107`).** Ihr Kommentar sagt
ausdruecklich, was sie sind: „a deliberate subset, no audit/software fields" (`:27-32`). Im selben
Prozess gibt es dafuer **keinen Sicherheitsgrund mehr** — und genau deshalb ist das der Posten, der
still verschwindet: wer `geraeteMitLeihstand` als „alle Spalten aus `devices`" baut, bekommt eine
Ausleihe-Flaeche, auf der ploetzlich Software-Version, Audit-Spalten und `tei` stehen (die Quelltabelle
hat 25 Spalten, siehe Datenmodell-Kapitel). Die **fachliche** Entscheidung „die Ausleihe zeigt Geraet,
nicht Geraeteakte" muss als **Lesemodell** weiterleben: die elf Felder aus `loanApi.ts:34-44`
(`id`, `issi`, `opta`, `rufname`, `status`, `location`, `deviceType`, `serialNumber`, `hersteller`,
`bedieneinheit`, `funktion`) sind die **Obergrenze**, die sechs aus `:100-105` die der aktiven Leihe.
Der Kommentar auf `:29-31` begruendet auch, **warum `id` und nicht `issi` der Schluessel ist** („issi is
mutable (a device can be reprogrammed) and unsuitable as a foreign key") — diese Begruendung wandert als
Kommentar mit, sonst ist der naechste naheliegende Umbau ein Join auf `issi`.

⚠️ **Das Ausleihe-Kapitel schneidet noch enger, und das ist kein Widerspruch, sondern die Richtung, in
die dieser Posten zeigt.** Sein `geraeteMitLeihstand(db)` liefert
`{ id, rufname, geraetetyp, standort, status, suchschluessel, entleiher?, seit? }` — die Seriennummer
steht **nicht** in der Zeile, sondern nur im Suchschluessel. Die Regel dieses Kapitels ist deshalb
„**hoechstens** die elf", nicht „genau die elf": jede Spalte, die weder in `loanApi.ts:34-44` noch im
Feldsatz des Ausleihe-Kapitels steht, ist ein Regelbruch.

**Test:** `src/app/m/radio/_db/leihen.test.ts` → `reicht keine Audit- und keine Software-Spalte an die
Ausleihe durch`: prueft `Object.keys()` des ersten Elements von `geraeteMitLeihstand(db)` gegen den
**exakten** Feldsatz des Ausleihe-Kapitels (Gleichheit, nicht Teilmenge — eine Teilmengenpruefung faengt
genau den Fall nicht, gegen den der Test steht) und zusaetzlich, dass keiner der Namen
`softwareVersion`, `tei`, `createdBy`, `updatedAt` darunter ist.

**3. Die Master-Pruefungen bleiben, sie wandern nur.** Der Kommentar auf `:154-157` begruendet sie mit
„Device existence + loanable + condition are gated HERE at the master: the kiosk is open, so the caller
is not trusted to enforce these." Es ist verfuehrerisch, das nach dem Wegfall der Grenze als
„jetzt ist der Aufrufer ja wir selbst" zu lesen — falsch: der **anonyme Ausleiher** und sein Formular
sind unveraendert unvertraut, und mit Entscheidung 4/10 ist die Flaeche sogar breiter erreichbar als
vorher. Geraet lesen → `loanable` → `mapDeviceCondition` bleiben die ersten Anweisungen von
`bucheAusleihe`, in dieser Reihenfolge und **je gewaehltem Gerät innerhalb der Transaktion**, mit
denselben drei unterscheidbaren Ergebnissen.
**`mapDeviceCondition` ist Fachlogik** (heute aus `@ra/shared`, `loanApi.ts:21`) und wandert mit
Testabdeckung mit — sie ist die Abbildung des freien `devices.status`-Textes auf den Leihzustand und
die einzige Stelle, an der „reserviert", „defekt" und „verfuegbar" auseinandergehalten werden.

**Test:** `src/app/m/radio/_db/leihen.test.ts` — vier Faelle mit je einem Namen:
`lehnt ein unbekanntes Geraet ab`, `lehnt ein nicht verleihbares Geraet ab`,
`lehnt ein Geraet in nicht verleihbarem Zustand ab und nennt den Zustand in betroffen`,
`lehnt den zweiten gleichzeitigen Verleih ueber den Unique-Index ab`. ⚠️ Die vier pruefen die
**Server**-Seite und muessen unterscheidbar bleiben, auch wenn drei von ihnen auf denselben `grund`
laufen — sonst ist die Gröbung des Diskriminators aus Posten 1 unbemerkt bis in die Fachlogik
durchgeschlagen.

**4. `X-API-Key` neben `Authorization: Bearer`.** `extractToken` (`loanApi.ts:67-74`, Kommentar ab
`:63`) akzeptiert
**beide** Koepfe. Das ist hier nur eine Zeile wert, aber es ist die dokumentierte Bruchstelle jedes
naiven Ports (Analyse `:2388`, `RA-LOAN-1`): wer die Grenze „erstmal 1:1 nachbaut" und dabei nur
`Authorization` liest, bricht jeden `X-API-Key`-Aufrufer — lautlos, mit 401. Da dieses Kapitel die
Grenze **loescht** statt sie nachzubauen, ist der Posten erledigt; er steht hier, damit niemand ihn
als „noch zu portieren" wiederentdeckt.

## 6.4 Bleibt eine oeffentliche API? Nein.

**Entschieden: die oeffentliche Loan-API wird ersatzlos gestrichen.** Es gibt keinen externen
Konsumenten (Entscheidung 13, Betreiberantwort 3), und der eine produktive Konsument — der Alt-Kiosk —
stirbt mit dem Port.

**Was mit ihr faellt**, vollstaendig aufgezaehlt, damit ein Plan-Autor daraus Loeschtasks schneiden kann:

* `radio-admin/server/src/routes/loanApi.ts` (die sechs Routen, `requireLoanApiAuth` `:83-95`,
  `extractToken` `:67-74`, beide Projektionen)
* `radio-admin/server/src/routes/tokens.ts` (3 Endpunkte: anlegen, listen, widerrufen)
* `radio-admin/server/src/repos/apiTokenRepo.ts` (`verifyApiToken`, `mintToken`, `listTokens`, `revokeToken`)
* `radio-admin/server/src/auth/loan-api-jwt.ts` (`verifyLoanJwt`, JWKS-Resolver)
* die Tabelle `api_tokens` (`radio-admin/server/src/db/schema.ts:59-70`) — siehe 6.5
* `radio-admin/client/src/features/settings/ApiTokensPage.tsx` (5 `render`-Funktionen, damit auch 5
  Posten von der Falle-9-Rechnung der Analyse `:300`) und `client/src/hooks/useApiTokens.ts`,
  plus der Einsprung aus `client/src/pages/SettingsPage.tsx`
* auf der Kiosk-Seite der ganze `RADIO_ADMIN_*`-Block (6.3) und `modules/radio-admin/` als Ganzes

**Der Preis dieses Wegs, ausgeschrieben:** eine gestrichene API ist eine Tuer, die man spaeter neu
bauen muss. Konkret kostet ein spaeterer Neubau (a) einen Route Handler unter
`src/app/m/radio/api/…`, (b) eine Widerrufstabelle mit `token_hash`/`prefix`/`revoked_at` — also
funktional genau das, was hier geloescht wird —, und (c) neu hinzu: den Cordon von Hand, weil das
Modul `requiresAuth: false` fuehrt.

**Der Preis des Gegenwegs — „als Modul-Route erhalten" — ist hoeher, und zwar dauerhaft:** eine API
ohne Konsument ist Angriffsflaeche ohne Nutzen. Mit `requiresAuth: false` (Entscheidung 4) erbt sie
**kein** Middleware-Gating; jeder Endpunkt traegt Zugangs- und Host-Riegel selbst, bei jeder spaeteren
Aenderung neu, und Falle 61 ist genau der Fehler, den man dabei macht — `src/app/m/lagerbuch/_lib/host.ts`
beschreibt ihn ausgeschrieben. Dazu kommt der Kern von Entscheidung 8: der heutige Zugang ist ein
**unbefristetes, unwiderrufliches** geteiltes Geheimnis. Eine „erhaltene" API muesste entweder dieses
Modell mitschleppen (ausgeschlossen) oder ein neues Token-Modell **mitbauen**, das niemand ruft. Man
zahlt (b) und (c) also sofort, nicht spaeter, und ohne einen Nutzer, der es rechtfertigt.

**Damit gilt:** nach dem Port hat das Modul `radio` **keinen** HTTP-Endpunkt, der von aussen
authentifiziert wird. Der einzige nicht angemeldete Zugang ist der gescannte QR-Code (Entscheidungen 5
und 6), und der ist Sache des Zugangs-Kapitels, nicht dieses hier. **Zusage an das Zugangs-Kapitel:**
dieses Kapitel erzeugt keinen Route Handler und beansprucht keinen Pfad unter `src/app/m/radio/api/`.

## 6.5 `api_tokens`, wenn ihr einziger Konsument stirbt

Die Tabelle traegt acht Spalten (`radio-admin/server/src/db/schema.ts:59-70`): `id`, `name`,
`token_hash` (sha256-hex, „the plaintext is never stored"), `prefix` (erste ~11 Zeichen fuer die
Anzeige), `created_at`, `created_by`, `last_used_at`, `revoked_at`.

**Sie wandert nicht.** Und anders als bei den Leihdaten haengt daran **keine** Historie — das ist
belegbar, nicht geschaetzt:

```
grep -n "export const loans" -A 30 radio-admin/server/src/db/schema.ts
grep -n "changed_by\|export const " radio-admin/server/src/db/schema.ts
```

* `loans` (`schema.ts:117-137`) fuehrt **keine** Token-, Konsumenten- oder Herkunftsspalte: `id`,
  `device_id`, drei `snapshot_*`, `borrower_name`, `borrowed_at`, `returned_at`, `return_note`,
  `created_at`, `updated_at`. Wer eine Leihe erzeugt hat, steht dort nicht — **keine Journalzeile zeigt
  auf einen Token.**
* `device_events.changed_by` (`schema.ts:94`) ist die einzige Herkunftsspalte im Schema und speichert
  einen `sub` (`schema.ts:73-77`: „audit columns (which store `sub`)"), keinen Token. Und der
  Leih-API-Pfad schreibt ohnehin keine Geraete-Ereignisse.
* `api_tokens.created_by` ist eine **tote Spalte** — geschrieben und nie gelesen (Analyse `:1255-1259`,
  mit der ausdruecklichen Korrektur auf `:888`, dass sie **nicht** zu den Audit-Spalten gehoert, die
  ueber `users` aufgeloest werden).

**Folge:** `api_tokens` kann fallen, ohne eine einzige Zeile zu verwaisen. Es gibt keine
Fremdschluesselbeziehung, keinen Bericht, keine Anzeige, die einen Token-Namen neben einer Leihe zeigt.

**Import:** die Tabelle wird **nicht** angelegt und **nicht** gelesen.
**Zusage an das Datenmodell- und das Import-Kapitel:** `api_tokens` erscheint nicht im Suite-Schema und
nicht im Import. Das Datenmodell-Kapitel fuehrt sie ausdruecklich als „wandert nicht" und haelt dieselbe
Protokoll-statt-Paritaet-Regel.

⚠️ **Zusage an das Uebergabe-/Runbook-Kapitel, und hier liegt ein Widerspruch, den die Zusammenfuehrung
aufloesen muss.** `api_tokens` darf **nicht** in den Paritaetscheck: ein Paritaetscheck vergleicht
`SELECT COUNT(*)` auf **beiden** Seiten, und auf der Zielseite gibt es die Tabelle nicht — die Abfrage
scheitert nicht mit „ungleich", sondern mit `no such table`, also mit einem Abbruch mitten im Cutover,
zu dem Schritt und Uhrzeit im Runbook stehen. Die Zaehlreihe der Analyse fuehrt sie noch mit
(`docs/radio-portierung-analyse.md:751-752`, sechs Paritaets-Sollwerte inklusive `api_tokens`), und die
Uebergabe hat sie von dort uebernommen. Mit Entscheidung 13 ist diese Zeile **gestrichen**: die
Zeilenzahl der **Quell**tabelle wird beim Snapshot **protokolliert** (eine Zeile im Runbook, „so viele
Tokens waren zum Freeze aktiv"), damit die Loeschung nachvollziehbar ist, aber **nicht** verglichen.
Aus sechs Paritaets-Sollwerten werden damit **fuenf**: `devices`, `software_versions`, `users`,
`device_events`, `loans`.

Ebenfalls **nicht** portiert wird `AdminUser` aus radio-inventar (Entscheidung 14) — hier nur der
Grenzbezug: die Tabelle war Traeger eines **zweiten** Identitaetssystems neben Pocket ID, und sie ist im
OIDC-Betrieb ohnehin unbeschrieben (`pocket-id.service.ts:134` baut `pocketid:${sub}` statt zu
schreiben). Mit dem Wegfall der Grenze faellt der Grund, ueberhaupt zwei Identitaetssysteme zu haben.

## 6.6 Der Ausfall-Puffer `STALE_GRACE_MS` — weder portieren noch stillschweigend streichen

Heute haelt `STALE_GRACE_MS = 5 * 60_000` (`radio-admin.service.ts:48`, angewandt auf `:123`) den Kiosk
bei einer kurzen Stoerung von radio-admin bedienbar: nach Ablauf der Cache-TTL wird ein nicht zu alter
Geraete-Cache weiter ausgeliefert, statt hart zu scheitern. Die Begruendung steht auf `:43-47`:
„loans/return/history stay operational on a brief outage instead of hard-failing."

**Portieren geht nicht — der Puffer hat im Monolithen strukturell keine Funktion.** Er puffert genau
einen Ausfallmodus: einen **unerreichbaren fremden Host** (`fetch` wirft → `:190-196`, oder non-2xx →
`:151-153` `ServiceUnavailableException`). Diesen Modus gibt es nach dem Wegfall der Grenze nicht mehr.
Ein 1:1-Port waere ein In-Memory-Cache, der einen Fehler abfedert, der nicht eintreten kann — und der
dabei die Frischezusage der Geraeteliste aufgibt, die heute die TTL traegt.

**Streichen ohne Ersatz geht auch nicht**, weil die **fachliche** Zusage ueberlebt: „Ausleihe, Rueckgabe
und Historie bleiben bei einer kurzen Stoerung bedienbar." Die Frage, die das entscheidet, ist: welcher
Ausfallmodus tritt in-process an die Stelle des unerreichbaren Hosts? Antwort: **eine belegte
SQLite-Datenbank** (`SQLITE_BUSY` unter gleichzeitigem Schreibzugriff), nicht ein Netzwerkfehler. Und
den deckt der DB-Helfer der Suite bereits ab:

```
src/core/db/index.ts:18   sqlite.pragma("journal_mode = WAL");
src/core/db/index.ts:19   sqlite.pragma("foreign_keys = ON");
src/core/db/index.ts:20   sqlite.pragma("busy_timeout = 5000");
src/core/db/index.ts:21   sqlite.pragma("synchronous = NORMAL");
```

WAL erlaubt Lesern, waehrend eines Schreibvorgangs weiterzulesen — die drei **Lesepfade**
(Geraeteliste, aktive Leihen, Historie) sind damit von einem laufenden Schreibvorgang gar nicht
betroffen. `busy_timeout = 5000` gibt einem **Schreibvorgang** fuenf Sekunden Wartezeit, bevor er
scheitert. Das ist der ganze Ersatz, und er ist bereits gebaut; es entsteht **kein** modul-eigener
Cache und **kein** modul-eigener Retry.

**Was dieses Kapitel daraus als Auflage macht:** der Ausfall-Puffer wird als Zeile im Kommentarkopf von
`_db/leihen.ts` **festgehalten**, mit Verweis auf `radio-admin.service.ts:43-48`, damit die
Streichung eine dokumentierte Entscheidung ist und nicht eine Auslassung, die beim naechsten Blick in
die Alt-App als „vergessen" wiederentdeckt wird. Fuenf Minuten Toleranz gegen einen Netzwerkausfall
werden **nicht** zu fuenf Minuten veralteter Geraeteliste ohne Grund.

**Test:** `src/app/m/radio/_db/leihen.test.ts` → `liest die Geraeteliste waehrend eines offenen
Schreibvorgangs`. Der Test gehoert hierher und nicht ins Datenmodell-Kapitel, weil er die **fachliche
Zusage aus der Grenze** prueft, nicht das Schema. Seine Bauform ist verbindlich, und zwar in drei
Punkten — **die naheliegende Form kann die Zusage nicht halten und ist trotzdem gruen:**

1. **Zwei getrennte Verbindungen, nicht eine.** `better-sqlite3` ist synchron und
   verbindungsgebunden: ein Lesen auf **demselben** Handle innerhalb der eigenen offenen Transaktion
   sieht deren eigenen Zustand und kann gar nicht in Konkurrenz geraten. Ein Test, der eine
   Transaktion oeffnet und danach auf derselben Verbindung liest, **kann nicht rot werden** — er
   prueft nichts. Also: `const schreiber = openModuleDatabase(pfad)` und
   `const leser = openModuleDatabase(pfad)`, auf dem Schreiber `BEGIN IMMEDIATE` plus ein `INSERT` in
   `loans`, und **auf dem Leser** `geraeteMitLeihstand(leser)`.
2. **Eine Datei, kein `:memory:`.** Zwei `:memory:`-Handles sind zwei **verschiedene** Datenbanken;
   der Test liefe dann an der Frage vorbei. Der Pfad kommt aus `os.tmpdir()` und wird im `afterEach`
   entfernt.
3. **Der Test prueft seine eigene Voraussetzung.** Erste Zusicherung:
   `expect(leser.pragma("journal_mode", { simple: true })).toBe("wal")`. Damit haengt die Aussage
   nicht an einer Behauptung ueber `openModuleDatabase`, sondern misst sie — und wenn ein spaeterer
   Umbau von `src/core/db/index.ts:18` WAL entfernt, faellt genau dieser Test, statt still
   weiterzulaufen.

Der zweite Fall in derselben Datei heisst `wartet auf eine belegte Datenbank, statt sofort zu
scheitern` und prueft die andere Haelfte des Ersatzes: bei offener Schreibtransaktion auf dem einen
Handle scheitert ein Schreibversuch auf dem anderen **nicht sofort**, sondern erst nach
`busy_timeout` (`src/core/db/index.ts:20`).

## 6.7 Die Reihenfolge-Auflage als Bauabschnitte

Entscheidung 15 klingt wie eine Empfehlung zur Bauplanung. Sie ist schaerfer, und der Grund ist
Entscheidung 3: **der Alt-Kiosk laeuft heute schon unter `radio.iuk-ue.de`.** Es gibt kein
Parallelfenster. Damit **ist der Router-Schwenk der Fall der HTTP-Grenze** — kein Schritt danach. Alles,
was Entscheidung 15 verlangt, muss **vor** dem Schwenk fertig sein, und beide Domains ziehen im selben
Fenster um (Analyse `:283-284`). **Keine Halb-Migration ist deploybar.**

| Abschnitt | Was fertig sein muss | Woran man es sieht |
|---|---|---|
| **A — Datenmodell und Import** | `loans` und `devices` im Suite-Schema, Import mit normalisierten Zeitstempeln (Entscheidung 11), Unique-Index gegen Doppelverleih | Import laeuft gegen die Snapshot-Kopie, Paritaetscheck **plus** feldweise Stichprobe (`CLAUDE.md`, „Cutover einer Alt-Anwendung") |
| **B — die sechs Ersatzfunktionen** | `_db/leihen.ts` vollstaendig, alle sechs als Drizzle-Aufrufe **im selben Prozess**; `mapDeviceCondition` mitgewandert; die Abbildung der acht Codes auf die beiden Unions vollstaendig | `src/app/m/radio/_db/leihen.test.ts` gruen — die vier Riegel-Faelle, das Lesemodell und die beiden WAL-Faelle |
| **C — beide Oberflaechen auf B** | Ausleihe an `/` und Verwaltung an `/admin` rufen **ausschliesslich** `_db/leihen.ts` (ueber `_actions/ausleihe.ts`, wo geschrieben wird); kein `fetch` gegen einen fremden Host im Modul | `rg -n "RADIO_ADMIN_\|api/v1/" src/app/m/radio` liefert **nichts** — der Abnahmebefehl fuer diesen Abschnitt |
| **D — Router-Schwenk** | A–C gruen. Traefik-Router fuer `radio.iuk-ue.de` zeigt auf den Suite-Container; der pfaderhaltende `redirectRegex` von `radio-admin.iuk-ue.de` auf `radio.iuk-ue.de/admin` steht (Entscheidung 2) | ein echter Abruf von `/` und `/admin` auf dem Prod-Host — nicht `pnpm build`; die Falle-61-Klasse und Falle 7 zeigen sich **nur** im echten Abruf |
| **E — Abbau** | Alt-Kiosk und Alt-Verwaltung abgestellt, `RADIO_ADMIN_*` aus der Compose-Datei entfernt, Alt-Volumes 2 Wochen im Standby | `docker ps` ohne die beiden Alt-Container, Volumes noch vorhanden |

**Der Rueckweg ist „Router zurueck"** (Entscheidung 3), und er ist nur bis E moeglich: solange die
Alt-Container samt Volume stehen, ist ein Schwenk zurueck eine Traefik-Aenderung. Nach E ist er ein
Restore. **Zusage an Spec 2 (Runbook):** D und E sind zwei getrennte Runbook-Schritte mit mindestens
zwei Wochen dazwischen, und die Zeile fuer den `redirectRegex` lebt auf dem Server, nicht im Repo.

### Wenn jemand die Reihenfolge tauscht

⚠️ **Verwaltung zuerst geschwenkt (Suite bedient `radio.iuk-ue.de`, Alt-Kiosk laeuft weiter).** Der
Alt-Kiosk zeigt mit `RADIO_ADMIN_URL` auf einen Host, der jetzt die Suite bedient. `api/v1/loan-devices`
antwortet 404 → `refreshDevices` wirft `ServiceUnavailableException` (`:151-153`). Der Ausfall ist
zunaechst **unsichtbar**: der Geraete-Cache traegt noch, und `:123` haelt ihn nach Ablauf der TTL weitere
fuenf Minuten. Erst danach faellt der Kiosk hart aus. Schlimmer als der Ausfall ist das Fenster davor:
Ausleihen und Rueckgaben, die in dieser Zeit ausgeloest werden, laufen ueber `loanRequest` (`:171`) gegen
denselben toten Endpunkt und landen **nirgends** — nicht in der alten Datenbank, denn radio-inventar
„never writes back" (`:51-54`: „radio-admin is the master for device data; radio-inventar never writes
back"), und nicht in der neuen. Genau der Ausfall-Puffer, der im Normalbetrieb
hilft, verzoegert hier die Entdeckung um bis zu TTL + 5 Minuten.

⚠️ **Kiosk zuerst geschwenkt (Suite bedient die Ausleihe, Alt-Verwaltung laeuft weiter).** Die
Suite-Ausleihe zeigt eine leere oder veraltete Geraeteliste, weil der Bestand weiter in der alten SQLite
gepflegt wird; jede Aenderung der Alt-Verwaltung (neues Geraet, `loanable`-Umschaltung,
Statusaenderung) laeuft in eine Datenbank, die nach dem Cutover ueberschrieben wird. Ergebnis: stille
**Divergenz** — die Suite verleiht auf einem Bestand, den niemand mehr pflegt, und der Import beim
echten Cutover ueberschreibt entweder die neuen Leihen oder die alten Bestandsaenderungen. Beides ist
Datenverlust ohne Fehlermeldung.

**Beide Bilder haben dieselbe Ursache:** radio-admin ist Master fuer Geraete **und** Leihen, und
radio-inventar schreibt ausschliesslich dorthin. Wer nur eine der beiden Domains schwenkt, trennt
Master und Schreiber. Deshalb ist die Auflage nicht „erst B, dann D", sondern **„D ist ein einziger
Schnitt fuer beide Domains"**.
