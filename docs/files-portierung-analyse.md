# Modul `files` — Portierungsanalyse & offene Entscheidungen

**Stand 2026-07-30, Nacharbeit nach der Vollständigkeitskritik am selben Tag eingebaut (letzter
Abschnitt). Das ist noch keine Spec.** Es ist die Vorarbeit dafür: was `easy-filesharing`
und `drop` heute tun, was der 1:1-Nachbau erzwingt, welche Fallen kein Gate findet — und die
**zweiundzwanzig Entscheidungen**, die vor der Spec fallen müssen. Jede einzelne verändert, was gebaut
wird.

Gegenstand ist Phase 4 aus `APP-KONSOLIDIERUNG.md:141-147` — das erste Modul, das **zwei** Alt-Apps
und **zwei** Domains ersetzt, mit Storage-Umstellung S3/MinIO → Volume und ClamAV-Sidecar.

Quelle: sechs unabhängige Analysen von `easy-filesharing`, `drop` und dem Zielmuster der Suite,
jeweils gegengeprüft. Widerlegte Rohbefunde stehen am Ende in einem eigenen Abschnitt, damit sie beim
nächsten Durchgang nicht erneut „gefunden" werden.

---

## 1. Was das Modul `files` ersetzt

| | `easy-filesharing` | `drop` (fuekw-dropzone) |
|---|---|---|
| Richtung | **hinaus**: Betreiber teilt Dateien | **herein**: Ehrenamtliche liefern ab |
| Stack | Next 15/16 + Drizzle + SQLite + S3/MinIO | Fastify 5 + better-auth + SQLite (nur Auth) |
| Öffentlicher Pfad | `/s/<nanoid10>` | `/u/<dz-xxxx-xxxx-xxxx>` |
| Zugangsobjekt | Share-ID = PK = Pfad = Storage-Präfix | API-Key mit 1–72 h Laufzeit |
| Datenmodell der Nutzlast | 3 Tabellen (`shares`, `share_files`, `download_logs`) | **keins** — ausschließlich Dateisystem |
| Leseweg | Download, ZIP, Preview, Audit-Log | **keiner** — write-only, Abholung per SSH/Dateimanager |

**Was zusammenwächst:** Blob-Ablage (beide brauchen ein Verzeichnis unter `/data/files/`), MIME-/Größen-Prüfung,
ClamAV, Rate-Limit, QR-Erzeugung, Suite-Auth für den Verwaltungsbereich.

**Was getrennt bleibt:** die beiden öffentlichen Pfade und ihre Zugangsobjekte. Ein Share-Token ist ein
Primärschlüssel mit unbegrenzter Lebensdauer, ein drop-Token eine Zeile in `apikey` mit höchstens 72 h
Laufzeit. Diese Grenze wird an **zwei** unabhängigen Stellen durchgesetzt, und beide rechnen korrekt:
`POST /api/admin/tokens` nimmt nur ganze Stunden von 1 bis `MAX_TOKEN_EXPIRES_IN_HOURS = 72` an und
antwortet sonst 400 (`drop/src/app.js:16-17,190-201,649-659`), übergeben wird in Sekunden
(`hoursToSeconds`, `app.js:203-205`); das api-key-Plugin prüft denselben Sekundenwert gegen die in
**Tagen** notierten Schranken `minExpiresIn: 1/24` und `maxExpiresIn: 3` (`drop/src/auth.js:87-91`) —
es teilt vorher um (`const expiresIn_in_days = expiresIn / (3600 * 24)`,
`@better-auth/api-key@1.5.5/dist/index.mjs:783-788`, für den Änderungspfad `:1511-1513`). 259200
Sekunden sind genau 3 Tage; die beiden Zahlenpaare beschreiben dasselbe Fenster, ein Einheitenfehler
liegt hier **nicht** vor. Nach Ablauf ist die Zeile ungültig — `validateApiKey` prüft `expiresAt` und
wirft `KEY_EXPIRED` (`index.mjs:1656-1682`) — und wird bei dieser Gelegenheit gelöscht. Diese
Asymmetrie ist der Grund, warum die harte 1:1-Regel für `/s/<id>` dauerhaft gilt und für `/u/<token>`
nur ein 72-Stunden-Fenster.

**Was in keiner der beiden Apps existiert und deshalb Neubau ist, nicht Portierung:** eine
Posteingang-Ansicht für die abgelieferten Dateien. `drop` hat keinen Endpunkt, der Uploads listet
oder ausliefert (vollständige Routenliste `drop/src/app.js:537-719`; `fastifyStatic` wurzelt auf
`web/dist`, nicht auf dem Upload-Verzeichnis, `app.js:453-456`).

---

## 2. easy-filesharing

### 2.1 Datenmodell

13 Spalten in `shares`, 7 in `share_files`, 6 in `download_logs`, drei Migrationen
(`drizzle/meta/_journal.json`), Migration läuft automatisch beim ersten DB-Zugriff und **schluckt
Fehler** (`lib/db/index.ts:20-28` — ein `try/catch` mit `console.warn`).

Alle Zeitstempel sind rohe Unix-**Sekunden** ohne Drizzle-`mode` (`lib/db/schema.ts:9,12,14-16,30-32,43-45`;
jede Schreibstelle `Math.floor(Date.now()/1000)`, jede Lesestelle `* 1000`, z. B. `lib/format.ts:54`).
Zum Kontrast: die Suite mischt — `qr` nutzt `mode: "timestamp_ms"` (`src/app/m/qr/_db/schema.ts:19-20`),
`feedback` und `portal` `mode: "timestamp"`.

SQL-Defaults gibt es **nur** bei `download_count` und `total_size` (`drizzle/0000_…sql:20-21`);
`created_at` und `downloaded_at` haben keinen — ihr Wert kommt ausschließlich aus `$defaultFn` in
TypeScript. Ein roher `INSERT` ohne diese Spalten schlägt an NOT NULL fehl.

`created_by` gehört in dieselbe Klasse und ist die einzige Spalte, deren Wert aus der **Session** kommt:
`text NOT NULL` ohne SQL-Default (`0000_demonic_boom_boom.sql:23`) und ohne `$defaultFn`
(`schema.ts:17`), gefüllt mit `session.user.email ?? "unknown"` (`app/api/upload/init/route.ts:61`) —
also mit einer E-Mail-Adresse im Klartext, angezeigt als „Erstellt von" in der Admin-Detailseite
(`app/(admin)/shares/[id]/page.tsx:159`). Physisch steht sie zwischen `created_at` und `s3_prefix`
(`0000_demonic_boom_boom.sql:22-24`), im Schema an 12. Stelle (`schema.ts:17`) — die
Spaltenverschiebung aus Falle 1 trifft sie also mit. Was künftig darin steht, ist eine eigene
Entscheidung (Entscheidung 21).

Kein einziger Index außer den drei PK-Autoindizes; die tatsächlichen Prädikate
(`share_files.share_id`, `download_logs.share_id` + `downloaded_at`) sind unindexiert
(`lib/db/schema.ts:3-46`, kein `index()`/`uniqueIndex()` im Repo).

**Doppelt kodierte Werte, sechs Fundstellen:**

1. `shares.type` ist abgeleitet: `files.length === 1 ? "file" : "folder"` (`app/api/upload/init/route.ts:56`).
   Enum nur in TypeScript (`schema.ts:7`), im SQL steht `text NOT NULL` ohne CHECK (`0000:16`).
2. `shares.total_size` = Summe der **vom Client gemeldeten** Größen (`init/route.ts:38` über
   `use-chunked-upload.ts:116`) — zwei Oberflächen zeigen zwei Quellen: die Admin-Detailseite rechnet
   neu aus den Zeilen (`shares/[id]/page.tsx:55,145`), die öffentliche Ordneransicht und das Dashboard
   zeigen die gespeicherte Spalte (`folder-view.tsx:31`, `dashboard/page.tsx:54`).
3. `download_count` vs. `count(download_logs)` — nie abgeglichen; die Log-Tabelle existiert erst seit
   Migration 0002, der Zähler seit 0000.
4. `s3_prefix` und `s3_key` kodieren die Share-ID erneut (`init/route.ts:37,68`).
5. `download_logs.file_id IS NULL` ist ein Magic Value für „ZIP-Download" (geschrieben
   `zip/route.ts:79`, gelesen und in den Literalstring `"ZIP"` übersetzt in
   `api/shares/[id]/logs/route.ts:38` und `shares/[id]/page.tsx:80`).
6. `Content-Type` in der Preview: der Torwächter prüft den **DB-Wert**
   (`PREVIEWABLE_TYPES.has(file.mimeType)`, `preview/route.ts:87`), der ausgelieferte Header bevorzugt
   den **Storage-Wert** (`preview/route.ts:104-106`). Eine Route, zwei Quellen für denselben Wert.

**Keine Laufzeitvalidierung an der API-Grenze.** `POST /api/upload/init` liest `req.json()` und castet
per `as` (`init/route.ts:15-30`) — reine Compile-Zeit, kein Zod im Repo. `expiryDays` wird geklammert
(`Math.min(Math.max(1, …), maxExpiryDays)`, `:33`), aber nicht auf Integer geprüft; gemessen mit
better-sqlite3 12.9.0 speichert eine INTEGER-Spalte einen Float als REAL. `title` wird serverseitig
**nicht** getrimmt und nicht auf Nichtleere geprüft (`init/route.ts:54` ist bare `title,`; der Trim
steckt allein im Client, `create-form.tsx:54`) — `updateShare` prüft es dagegen (`actions.ts:49`).
Ein Titel aus Leerzeichen ist über die API anlegbar und geht in den ZIP-Dateinamen ein
(`zip/route.ts:125` ergibt dann `___.zip`).

**Semantische Umkehrung auf der Schreibseite:** `maxDownloads: maxDownloads || null`
(`init/route.ts:59`). Ein API-Aufruf mit `maxDownloads: 0` (Absicht: kein Download) erzeugt still
einen **unbegrenzten** Share. Analog `description: description || null` (`:55`). Beim Port gehören
dort `??` statt `||` — ein Typecheck sieht den Unterschied nie.

### 2.2 Storage und Auslieferung

Kein presigned URL, kein Browser↔Storage-Kontakt: `grep -rn "presign|getSignedUrl|s3-request-presigner"`
über `app/ lib/ components/` liefert 0 Treffer, `@aws-sdk/s3-request-presigner` steht in
`package.json:14` und wird nirgends importiert. Die gesamte S3-Oberfläche sind **sechs** Funktionen in
`lib/s3/operations.ts` (`:13,20,38,53,63,78`) plus `HeadBucketCommand` im Health-Check
(`app/api/health/route.ts:2,16`). Jedes Byte fließt durch den Next-Prozess.

**Key-Schema:** `s3Prefix = shares/<shareId>/` (`init/route.ts:37`, Slash am Ende),
`s3Key = ${s3Prefix}${fileId}/${file.filename}` (`:68`). Der Bucket-Name (`lib/s3/index.ts:32`) kommt
in **keiner** DB-Spalte vor — er wird pro Command als Parameter übergeben. Der Key ist damit nicht rein
aus IDs ableitbar: man braucht die DB-Zeile, um ihn zu kennen.

**ERSTRANG — der rohe Client-Dateiname steckt IM Speicherpfad, und der Storage-Wechsel dieser Phase
macht daraus Pfadsemantik.** `init/route.ts:68` konkateniert `file.filename` ungeprüft — der Wert kommt
aus dem destrukturierten Request-Body (Typdeklaration `:29`, Quelle `use-chunked-upload.ts:115` =
`f.name`), zwischen `:15` und `:68` gibt es keine Normalisierung, keine Prüfung auf `/`, `..` oder
Länge. Auf S3 ist das harmlos: `..` und `/` sind gewöhnliche Key-Bytes, ein Key
`shares/x/y/../../etc/passwd` ist ein Objekt mit diesem Namen, kein Ausbruch. Auf einem Dateisystem
verlässt `path.join("/data/files", key)` bei `..`-Segmenten die Wurzel. Zum Vergleich, wie eng das
Bewusstsein dafür heute ist: `zip/route.ts:125` sanitisiert sehr wohl — aber nur für den
`Content-Disposition`-Header, nicht für den Key.

Die Schadensreichweite entsteht erst durch die Zielumgebung: `/data/files/` liegt laut
`compose.yaml:40-41` im **selben** Volume wie `portal.db`, `qr.db`, `feedback.db` und `files.db` — ein
`..`-Segment schreibt also nicht nur außerhalb des Share-Verzeichnisses, sondern potenziell über die
Datenbanken der drei anderen Module. Zwei Wege sind belegt: der Import der Altdaten (die vorhandenen
`s3_key`-Werte sind ungeprüft und werden 1:1 zu Pfaden, siehe Entscheidung 5) und ein direkter POST auf
`/api/upload/init` (admin-gegated, `:10-13`; die UI kann es nicht auslösen — `upload-zone.tsx:59-67`
setzt nur `multiple`, kein `webkitdirectory`, und Browser liefern in `File.name` keinen Pfadanteil).
Verschärfend kommt hinzu, dass der Zielschlüssel beim Schreiben ohnehin vom Browser kommt
(`chunk/route.ts:11,23`) — auf einem Dateisystem heißt das „schreibe an jede Stelle, die der Prozess
erreicht".

Dazu Dateisystem-Grenzen, die S3 nicht kennt und die kein Altdatentest zeigen kann: 255 Byte pro
Pfadkomponente (S3-Keys dürfen 1024 Byte gesamt), NUL-Bytes, und Case-Insensitivität auf macOS gegen
Case-Sensitivität auf Linux — `Bericht.pdf` und `bericht.pdf` kollidieren lokal, in Produktion nicht.
Kein Typecheck, kein Build und kein Test des Altsystems kann das melden: derselbe Code ist auf S3
korrekt und auf einem Dateisystem unsicher, und das Altsystem benutzt kein Dateisystem. Entscheidung 5
löst das strukturell oder gar nicht.

**Upload-Protokoll ist die S3-Multipart-API, nach außen durchgereicht.** `init` gibt dem Client die
`uploadId` (`init/route.ts:79-87`), der Client schickt pro 5-MiB-Chunk `x-s3-key`, `x-upload-id`,
`x-part-number` (`use-chunked-upload.ts:6,55-59`), sammelt die von S3 gelieferten ETags
(`chunk/route.ts:25`) und schickt die `parts`-Liste an `complete` (`complete/route.ts:12-16`).
`uploadId`, `ETag` und `PartNumber` haben auf einem Dateisystem keine Entsprechung.

`/api/upload/chunk` nimmt den Zielschlüssel als **freien Request-Header** (`chunk/route.ts:11`) und
gibt ihn ungeprüft an `uploadPart` (`:23`); `/api/upload/complete` liest ihn aus dem JSON-Body
(`complete/route.ts:12,25`). Kein Abgleich gegen `share_files.s3_key`, keine Präfix-Prüfung — geprüft
wird nur Nicht-Leerheit und die Admin-Session.

**Verwaiste Zustände auf zwei belegten Wegen:** `abortMultipartUpload` ist definiert
(`operations.ts:53-61`) und hat **keinen Aufrufer** (erschöpfende Suche über `app/ lib/ components/`:
ein Treffer, die Definition); die `share_files`-Zeile entsteht **vor** dem ersten Byte
(`init/route.ts:70-77` vor `:79`). Und `deletePrefix` (`operations.ts:78-91`) listet mit einem
einzigen `ListObjectsV2Command` ohne `ContinuationToken`, wertet `IsTruncated` nicht aus und liest das
`Errors`-Feld der `DeleteObjects`-Antwort nicht — danach werden die DB-Zeilen bedingungslos gelöscht
(`cleanup/route.ts:33-38`, `actions.ts:91-94`). Ein Migrationsskript, das „für jede `share_files`-Zeile
existiert eine Datei" annimmt, bricht auf Produktionsdaten ab; ein Abgleich muss in **beide** Richtungen
laufen.

**Auslieferung:** kein `Range`, kein `Accept-Ranges`, kein 206 — nirgends im Repo (Suche über
`app/ lib/ components/ middleware.ts`: 0 Treffer). Die Download-Route setzt
`Content-Type: contentType ?? "application/octet-stream"` (`download/[id]/route.ts:104`) — **ohne**
DB-Fallback; nur die Preview nutzt `contentType ?? file.mimeType` (`preview/route.ts:104-106`).
Beim Upload wird `ContentType` **nie** gesetzt (`operations.ts:14-16,44-49`), was der Storage heute
also zurückgibt, ist von hier nicht messbar.

`Content-Disposition` ist an allen drei Stellen `filename="${encodeURIComponent(name)}"`
(`download:105`, `preview:107`, `zip:130`) — kein `filename*=UTF-8''`. Beim ZIP wird der Titel vorher
hart entschärft (`share.title.replace(/[^a-zA-Z0-9_-]/g, "_")`, `zip:125`).

**ZIP:** sequenziell, `zlib: { level: 1 }`, Eintragsname der nackte `file.filename` — zwei gleichnamige
Dateien in einem Share ergeben zwei Einträge gleichen Namens (`zip/route.ts:86-132`). Kein
`Content-Length`, kein Temp-File; die Abbruchbehandlung (PassThrough, `archive.on("error")`,
`req.signal`-Listener, Cleanup im `finally`) ist hart erarbeitet und muss mitwandern, auch wenn ihr
S3-Anlass wegfällt. Der `ZipArchive`-Zugriff ist ein Doppel-Cast an TypeScript vorbei
(`zip/route.ts:12-14`): archiver 8.0.0 exportiert die Klasse zur Laufzeit, `@types/archiver` 7.0.0
kennt sie nicht (`package.json:16,39`) — der Typecheck verifiziert an dieser Stelle nichts.

**Preview** ist ein unbezahlter Vollstrom: kein `after()`, kein Zähler-Update; die Route prüft das
Limit (410 sobald erreicht, `preview/route.ts:62-70`) und erhöht es nie. Solange ein Download frei ist,
ist dieselbe Datei beliebig oft vollständig lesbar. Keine Thumbnails (keine Bildverarbeitung in
`package.json:12-36`, `file-preview.tsx:27-31` setzt das Originalobjekt in `<img src>`). Die
100-KB-Kappung für Text existiert nur im Browser **und nur, wenn `Content-Length` vorhanden ist**
(`file-preview.tsx:76-77`; fehlt der Header, liest `:105` `res.text()` die ganze Datei).
`PREVIEWABLE_TYPES` enthält `image/svg+xml` (`preview/route.ts:12`), ausgeliefert mit
`Content-Disposition: inline` (`:107`) auf dem App-Origin, ohne CSP und ohne `nosniff`
(`next.config.ts:3-5` enthält nur `output: "standalone"`).

**Der ganze Socket-Pool-Apparat** (maxSockets 128, `connectionTimeout` 6 s, `requestTimeout` 60 s,
`throwOnRequestTimeout`, `lib/s3/index.ts:5-30`; `abortSignal`-Durchstich `operations.ts:63-70`;
HeadBucket-Probe mit 3-s-Timeout `health/route.ts:14-26`; autoheal-Sidecar `docker-compose.yml:5-9,31-38`)
ist Commit `84afdb0` — „fix: prevent download path wedge from S3 socket-pool exhaustion". Er adressiert
einen Fehlermodus, den es auf einem Dateisystem nicht gibt. Die `abortSignal`-/Stream-Cleanup-Logik
muss trotzdem mit: sie verhindert dort geleckte File-Descriptors statt Sockets.

### 2.3 Zugriff und Jobs

**ERSTRANG — der Passwortschutz ist Dekoration.** `POST /api/download/[id]/verify` prüft das Passwort
korrekt gegen bcrypt und antwortet dann mit `NextResponse.json({ ok: true })` (`verify/route.ts:29`):
kein Cookie, kein Token, keine Session. Der Client merkt sich das in React-State
(`password-gate.tsx:15,34-35`). Die drei Endpunkte, die Bytes ausliefern, lesen `passwordHash`
**nirgends** — `grep` über `download/[id]/route.ts`, `zip/route.ts`, `preview/route.ts`: 0 Treffer.
Wer die Share-ID kennt (sie steht in seiner eigenen URL), lädt ohne Passwort.

Verschärfend: `page.tsx:37-39` lädt die Dateien, **bevor** `:41` das Passwort prüft, und übergibt
`FileView`/`FolderView` als `children` an die Client-Komponente `PasswordGate` (`:42-50`,
`password-gate.tsx:1,20`). Nach der mitgelieferten Next-Doku enthält das RSC-Payload „the rendered
result of Server Components … any props passed from a Server Component to a Client Component"
(`node_modules/next/dist/docs/01-app/01-getting-started/05-server-and-client-components.md:109-113`) —
Dateinamen, Größen, Beschreibung und die fertigen Download-URLs (`folder-view.tsx:49-55`) stecken damit
in derselben Antwort, die die Passwortmaske zeigt. Die fileIds müssen nicht geraten werden.

Dazu ein Orakel: `verify/route.ts:19-21` antwortet 404 für „existiert nicht" **und** „existiert ohne
Passwort", 401/200 sonst — unbegrenzt aufrufbar, ohne Rate-Limit (`grep -rniE "rateLimit|rate-limit"`
über `lib app`: 0 Treffer), und der einzige Ort, an dem pro Anfrage bcrypt mit cost 12 gerechnet wird.

**Fünf Eintrittspunkte, fünf verschiedene Prüfketten.** `/s/<id>` prüft Existenz → Ablauf → Limit →
Passwort und antwortet bei Ablauf/Limit mit **HTTP 200** samt Zustandsseite, obwohl die Design-Spec
410 vorschreibt (`docs/superpowers/specs/2026-04-10-easy-filesharing-design.md:152`); `limit_reached_at`
prüft sie überhaupt nicht. `verify` prüft weder Ablauf noch Limit — ein abgelaufener Share verifiziert
sein Passwort weiter.

**ERSTRANG — `limit_reached_at` überlebt das Anheben eines Limits und tötet den Share.**
`addDownloads` setzt `limitReachedAt: null` unbedingt (`actions.ts:23`), `updateShare` **nur** im Zweig
`if (data.maxDownloads === null)` (`actions.ts:61-66`, selbst nachgelesen). Wer im Bearbeiten-Formular
das Limit von 5 auf 10 erhöht (Pfad: `shares-table.tsx:250` → `edit/page.tsx:33` →
`edit-form.tsx:33-34,61`), hinterlässt `limit_reached_at` gesetzt bei `downloadCount < maxDownloads`.
Zwei Folgen:

- **Zugriff:** 24 h später antworten `download/[id]/route.ts:33-38`, `zip:36-41` und `preview:44-52`
  mit 410, obwohl die jeweils folgende Limitprüfung passieren würde. `/s/<id>` zeigt weiterhin die
  Dateiliste mit Download-Buttons, die dann 410 liefern.
- **Löschung:** `cleanup/route.ts:27` löscht per
  `and(isNotNull(limitReachedAt), lt(limitReachedAt, graceThreshold))` einen Share, der weder abgelaufen
  ist noch sein Limit erreicht hat — samt aller Storage-Objekte (`:33-38`).

Der Admin wollte gerade das Gegenteil. Kein Test, kein Typecheck sieht das. Der Port muss
`limit_reached_at` bei **jeder** Änderung von `max_downloads` zurücksetzen — oder die Spalte streichen
und den Zustand aus `download_count`/`max_downloads` ableiten.

**Der Download-Zähler läuft in `after()`** auf einem vor der Antwort gelesenen Wert
(`download/[id]/route.ts:19-21` gegen `:80-100`). Das SQL-Inkrement ist atomar
(`sql\`${shares.downloadCount} + 1\``, `:87`), die Limit-Ableitung `newCount = share.downloadCount + 1`
(`:82`) nicht. Und laut der mitgelieferten Doku läuft `after` auch dann, wenn die Antwort nicht
erfolgreich abgeschlossen wurde (`node_modules/next/dist/docs/…/after.md:54`) — ein Abbruch nach einem
Byte zählt als Download. `max_downloads` bedeutet heute „etwa N".

**GRACE_PERIOD_HOURS ist asymmetrisch:** abgelaufene Shares werden ohne jede Karenz gelöscht
(`lt(expiresAt, now)`, `cleanup/route.ts:26`), limit-erreichte mit 24 h (`:27`, Wert `.env:18`). Und
der Wert wird an **vier** Stellen unabhängig mit demselben magischen Default gelesen
(`download:9`, `preview:20`, `zip:11`, `cleanup:7`).

**Der Cleanup-Job hat keinen Aufrufer.** `docker-compose.yml` hat vier Services und keinen Scheduler,
der Healthcheck ruft `/api/health`, der GitHub-Workflow hat kein `schedule:`, `scripts/setup.sh:6`
generiert nur das Secret. Nur die Design-Spec erwähnt „externer Cron" (`design.md:153`). Falls dort
wirklich keiner läuft, ist die produktive Aufbewahrung **unbegrenzt** — und der erste Lauf im neuen
System wird ein Löschereignis, keine Hintergrundaufgabe.

**Server Actions ohne eigene Autorisierung.** `app/(admin)/dashboard/actions.ts` hat 97 Zeilen und
enthält keinen einzigen `auth()`-Aufruf; `addDownloads`, `updateShare` und `deleteShare` verlassen sich
allein auf `middleware.ts:11-14`, das nur `/shares`, `/settings`, `/dashboard` prüft. Die
mitgelieferte Next-Doku sagt dazu: „you should still treat Server Actions as reachable via direct POST
requests and verify authentication and authorization inside each one" und „A page-level authentication
check does not extend to the Server Actions defined within it"
(`node_modules/next/dist/docs/01-app/02-guides/data-security.md:282,329`).

**IDOR im Audit-Log.** `GET /api/shares/[id]/logs` prüft nur `if (!session)` — nicht `isAdmin`, nicht
`createdBy` (`logs/route.ts:11-14`) — und liefert bis zu 100 Einträge mit IP, User-Agent und
Zeitstempel zu **jeder** shareId aus der URL (`:18-39`). Die Middleware gatet den Pfad nicht
(`/api/shares` beginnt nicht mit `/shares`), und die UI ruft ihn nirgends auf (die Detailseite liest
direkt aus der DB, `shares/[id]/page.tsx:58-63`) — toter, ungegateter Code. Zum Vergleich: die
Upload-Routen prüfen korrekt `!session?.user?.isAdmin` (`upload/init/route.ts:10-13`).

**Was erhalten bleiben muss:** `if (!file || file.shareId !== id)` in `download/[id]/route.ts:64` und
`preview/route.ts:83`. Die Datei wird davor allein über den Primärschlüssel geholt (`:60-62` bzw.
`:79-81`) — ohne diese Zeile lädt jede fileId über jede gültige shareId. Es ist die **einzige**
serverseitige Objekt-Zugehörigkeitsprüfung der ganzen App.

**Nebenbefund mit Portrelevanz:** `dashboard/page.tsx:13-16` selektiert per `.select()` alle Spalten
inklusive `password_hash`, spreadet sie (`:57-64`) und übergibt sie an die Client-Komponente
`SharesTable`, die `passwordHash: string | null` ausdrücklich deklariert (`shares-table.tsx:1,51`).
Benutzt wird nur der Wahrheitswert (`:203`). Die Bearbeiten-Seite macht es richtig und übergibt
`hasPassword: !!share.passwordHash` (`edit/page.tsx:34`) — ein Copy-Paste-Port erbt die falsche
Variante.

**Und:** `updateShare` setzt bei **jedem** Speichern den Ablauf neu. `edit-form.tsx:32` initialisiert
`expiryDays` mit `useState(1)` (nicht aus `share.expiresAt`) und sendet den Wert bedingungslos (`:60`);
`actions.ts:57-59` schreibt `now + expiryDays * 86400` **ohne** jede Deckelung. Wer nur den Titel
korrigiert, verkürzt den Share auf 24 Stunden. Über einen direkten Action-Aufruf sind 0, negative und
beliebig große Werte möglich; die Grenze `MAX_EXPIRY_DAYS` (`.env:17`) existiert serverseitig nur im
Anlegepfad (`init/route.ts:32-33`) und im Formular als HTML-Attribut (`edit-form.tsx:128`).

---

## 3. drop

### 3.1 Inbox-Modell und Tokens

**Es gibt kein Datenmodell für Uploads.** Der Upload-Handler (`app.js:283-424`) kennt nur `mkdir`,
`createWriteStream`, `rename`, `writeFile`, `rm` — kein DB-Zugriff; er bekommt
`{app, config, semaphore, scanner}` und liest von `req` nur `parts()` und `requestIp(req)`. Die
einzige SQLite-Datei enthält Better-Auth-Daten (`config.js:25`). Persistiert werden pro Upload
maximal drei Dinge:

1. die Nutzdatei unter `uploadDir[/<category>]/<safeName>`,
2. eine META-JSON unter `metaDir/<safeName>.json` mit genau sieben Feldern in fester Reihenfolge
   (`timestamp` als ISO-UTC, `ip`, `filename`, `storedPath`, `size`, `hint`, `category`), 2-Space-Einrückung,
   abschließendes Newline (`app.js:353-364`) — seit dem ersten Commit unverändert,
3. eine Hinweis-Sidecar `uploadDir[/<category>]/<safeName>.txt` (seit Commit `972d7da`, 08.03.2026).

**ERSTRANG — die META entsteht nur bei gesetztem Hinweis ODER Kategorie.** Der komplette Block steht
hinter `if (hint || category)` (`app.js:352`, selbst nachgelesen). Beide Felder sind im Client optional
(Kategorie-Sentinel `__none__` → `""`, `upload-page.tsx:40,52,100`). Ein Import, der über
`metaDir/*.json` iteriert, importiert also **nur die Teilmenge mit Metadaten** — fehlerfrei und
lautlos. Der Import muss über den Dateibaum iterieren und META als optionale Anreicherung joinen. Ein
Paritätscheck „Anzahl META == Anzahl DB-Zeilen" wäre falsch.

**ERSTRANG — `metaDir` ist flach, `uploadDir` nach Kategorie geschachtelt.** Der Metadateiname ist nur
`path.basename(finalPath)` (`app.js:353-354`), die Kategorie geht nicht ein, und `writeFile` läuft ohne
`flag: 'wx'`. Dreimal `IMG_1234.JPG` in drei Kategorien ergibt drei Dateien und **eine**
`img_1234.jpg.json` mit Hinweis und IP des letzten Uploads. Kein Angriff, kein Fehler, Normalbetrieb.
Der Join `metaDir/<basename>.json → Datei` ist nicht eindeutig; nur das Feld `storedPath` sagt, für
welche der gleichnamigen Dateien die META gilt. Die **Sidecar** kollidiert dagegen nicht (sie liegt im
Kategorie-Verzeichnis) und ist bei Namenskollisionen die zuverlässigere Hinweisquelle.

**ERSTRANG — die Sidecar überschreibt echte Uploads.** `writeFile(notePath, …)` ohne `wx`
(`app.js:366-369`), während der Upload selbst über `findAvailableFilePath` geht (`app.js:317`).
`sanitizeFilename('foto.jpg.txt')` ergibt `foto.jpg.txt`, und `text/plain` steht in der
`ALLOWED_MIME`-Vorlage (`.env.example:8`). Liegt eine echte Datei `foto.jpg.txt` im Verzeichnis und
wird danach `foto.jpg` **mit Hinweis** hochgeladen, ist ihr Inhalt durch den Hinweistext ersetzt —
HTTP 200, kein Log. Der umgekehrte Weg ist harmlos (der echte Upload weicht auf `_1` aus). Für den
Import heißt das: eine `.txt` im Baum kann Sidecar, echter Upload **oder** überschriebener echter
Upload sein.

**ERSTRANG — keine Datei ist einem Token oder Benutzer zuzuordnen.** `req.shareKey` wird gesetzt
(`app.js:517`) und danach **nie gelesen** — `bindShareTokenToSentry` bekommt an `:518` `result.key`
übergeben. `req.authSession` hat genau einen Leser: `GET /api/session` (`:555`). Die META enthält
kein `tokenId`, kein `userId`, kein `mode`; die Log-Zeile `{ip, filename, size, result}` (`:373`)
ebenso nicht. Die einzige Senke, die Token-Identität und Upload zeitlich nebeneinander stellt, ist
Sentry — und die läuft im Container gar nicht (siehe 3.2). Für den Import: `uploaded_by_*`-Spalten
müssen nullable sein und für den gesamten Altbestand NULL bleiben.

**`storedPath` in der META ist ein Container-Pfad** (`/uploads/…`, `app.js:359` über `config.js:30`),
der Host bindet `/srv/fuekw/drop_inbox` dorthin (`docker-compose.yml:12`, `README.md:72`). Ein
Importskript, das `storedPath` als Dateipfad benutzt, findet null Dateien — und meldet Erfolg, wenn es
META-Einträge zählt.

**Token-Format** (`share-token-config.js:1-7`, `auth.js:29-48,95-96`): `dz-` + 12 Zeichen aus dem
32er-Alphabet `23456789abcdefghijkmnpqrstuvwxyz` (ohne 0/1/l/o), in drei Vierergruppen — `dz-xxxx-xxxx-xxxx`.
`byte % 32` bei 256 Bytewerten ist verzerrungsfrei. Berechtigung `{ files: ['write'] }`
(`share-token-config.js:1`), als JSON-String in der Zeile (`api-key/dist/index.mjs:809`).

**Der Rohtoken existiert serverseitig nirgends.** Gespeichert ist `base64url_ohne_padding(SHA-256(utf8(voller Token)))`
(gemessen gegen den exportierten `defaultKeyHasher`, `index.mjs:2085-2088`), plus die ersten **acht
Zeichen** im Klartext als `start` (`index.mjs:807`, `auth.js:83-86`) — also `dz-` plus vier der zwölf
Geheimzeichen. Die Admin-Liste zeigt nur `${start}...` (`app.js:175-188`). Der Rohtoken wird genau
einmal in der Create-Antwort zurückgegeben (`:665-669`) und lebt danach ausschließlich im
`localStorage` des Verwalters unter `fuekw-dropzone.admin.share-tokens`
(`shared/admin-token-utils.js:1`) — nur dafür kann die UI später QR-Codes zeigen
(`token-item.tsx:76-78` setzt `shareUrl` auf `null`, wenn kein lokaler Rohtoken vorliegt).
**localStorage ist origin-gebunden:** wechselt die Domain, verliert der Betreiber seine QR-Historie,
auch wenn die Datenbankzeilen mitwandern.

**Die Share-URL wird an vier Stellen unabhängig gebaut**, zwei davon tot: server-seitig
`new URL('/u/'+created.key, config.betterAuthBaseUrl)` (`app.js:668`), client-seitig
`createLocalShareUrl(window.location.origin, rawToken)` (`share-tokens.ts:50-52`), plus zwei nie
importierte Zwillinge (`shared/admin-token-utils.js:34-36`, `auth.js:147-150`). **Die UI benutzt den
Client-Weg** und verwirft das `shareUrl`-Feld der Server-Antwort (`admin-page.tsx:96-112`,
`token-item.tsx:76-77,87-90`) — der QR-Inhalt trägt also die Origin, unter der der Admin gerade
arbeitet.

**Die QR-Erzeugung hängt in `drop` am Server, in `easy-filesharing` am Browser.** `drop` hat dafür
einen eigenen Endpunkt: `POST /api/admin/qrcode`, `preHandler: requireSession('api')`, Nutzlast
`{data}` gegen `MAX_QR_DATA_LENGTH = 2048` geprüft, Antwort `{dataUrl}` als PNG-Data-URL
(`src/app.js:675-688`, Erzeuger `:217-226`) — und er ist ausdrücklich rate-limitiert, in derselben
Liste wie `/upload` und die Token-Erzeugung (`:122`). Aufgerufen wird er an zwei Stellen der SPA
(`web/src/lib/api.ts:107-113`, benutzt in `components/admin/token-item.tsx:90` und
`components/admin/share-kit.tsx:36`), und das Ergebnis lässt sich als Datei speichern
(`token-item.tsx:100-113`, Dateiname `<token-name>-qr.png`) — genau der dokumentierte Zweck
(`README.md:101`). Daneben steht ein zweiter, offline gedachter Druckweg mit identischen Optionen:
`scripts/generate-qr.js:9-17`, dokumentiert **mit** Token (`README.md:104`). `easy-filesharing` hat
nichts davon: der Code entsteht im Browser als SVG in einem Dialog (`shares-table.tsx:29,295`), es gibt
keinen Endpunkt, keinen PNG-Download und keine serverseitige Spur.

**Keine 1:1-Pflicht** — an `/api/admin/qrcode` hängt kein gedruckter Code und kein verteilter Link,
der Pfad darf verschwinden. Es ist Funktionsumfang, und zwar ein zweifach beauftragter: die
QR-Erzeugung steht in beiden Phase-4-Zeilen der Checkliste (`KONSOLIDIERUNG-PROGRESS.md`, Domain-Cutover-Übersicht (beide `files`-Zeilen)). Im
Ziel wird sie ein Server-Weg über `core/qr` (Abschnitt 4.1) — womit der PNG-Download aus `drop` ein
Stück ist, das nicht unbemerkt wegfallen darf, und `easy-filesharing` einen bekommt, den es heute
nicht hat.

**Kategorien sind Freitext.** Der Server veröffentlicht drei Werte (`app.js:22-35` über
`/api/upload/context`, `:272-281`), validiert den eingehenden Wert aber nicht dagegen: `sanitizeCategory`
säubert nur zeichenweise und kürzt auf 40 Zeichen (`utils.js:20-29`), danach `mkdir recursive`
(`app.js:315-316`). Der eigene Test benutzt `berichte` (`test/app.test.js:318-336`), und der Sentinel
`__none__` überlebt die Säuberung unverändert. Path Traversal greift nicht (`../../etc` → `etc`).
Welche Verzeichnisse real existieren, ist aus dem Repo nicht feststellbar.

**Dateinamen-Sanitizing ist verlustbehaftet und deterministisch** (`utils.js:5-18`): NFKD, Combining
Marks weg, kleinschreiben, alles außer `[a-z0-9._-]` weg, Basis auf 100 / Endung auf 15 Zeichen,
Fallback `datei`. Gemessen: `Übung_Größe.pdf` → `ubung_groe.pdf` (das ß fällt ersatzlos weg),
`straße.txt` → `strae.txt`, `日本語.pdf` → `datei.pdf`, `.htaccess` → `htaccess`, `...` → `datei.`.
**Der Originalname ist in keinem persistenten Artefakt gespeichert** — `filename` in der META ist
bereits der sanitisierte Name. Für Altbestände ist er unwiederbringlich verloren; ein Import, der das
Feld als `original_filename` übernimmt, erzeugt eine Spalte, die überzeugend aussieht und falsch ist.
Kollisionen löst `findAvailableFilePath` mit `_1` … `_10000` (`utils.js:35-51`) — der Suffix ist die
einzige Reihenfolgeinformation einer Kollisionsserie.

**Mehrfach-Upload sind N sequenzielle Anfragen mit je einer Datei**
(`drop/web/src/hooks/use-upload.ts:126-128,243-246` — der Pfad ist `hooks/`, nicht `lib/`).
Es gibt kein Batch-Konzept auf der Platte: N Dateien aus einem Vorgang sind nur über identischen
`hint`/`category` und benachbarte Zeitstempel erkennbar — und für META-lose Dateien überhaupt nicht.

### 3.2 Härtung — was greift und was nicht

Die Phase-4-Vorgabe lautet „Härtung aus drop übernehmen: Rate-Limit, MIME-Allowlist, Größenlimits,
fail-closed" (`APP-KONSOLIDIERUNG.md:146`). Gemessen greift davon weniger als der Name verspricht.

**Rate-Limit.** Der Bucket-Key ist `${ip}:${minute}` (`security.js:9`) — kein Token, keine Session.
Vier unabhängige Löcher, alle gegen die laufende App gemessen:

- **Query-String-Bypass:** `shouldRateLimit` vergleicht gegen Pfade ohne Query, liest aber
  `req.raw.url` **mit** Query (`app.js:118-135`). Bei Limit 5: acht `POST /u/<token>/upload` →
  fünf 200, drei 429; danach acht `POST /u/<token>/upload?x=n` → **acht 200**. Dieselbe Route,
  derselbe Handler.
- **X-Forwarded-For:** `getIp` nimmt bedingungslos das erste Element (`security.js:57-63`), Fastify
  läuft ohne `trustProxy` (`app.js:436`, zur Laufzeit `undefined`), und der Wert wird nicht als IP
  validiert. Zwölf Uploads mit rotierendem Header → zwölf 200, kein 429. Rotierender Unsinn und
  200-Zeichen-Strings ebenso.
- **Fixes Minutenfenster** (`Math.floor(now/60_000)`, `security.js:8`): über die Fenstergrenze hinweg
  gehen 2× das Limit in einem Wimpernschlag durch.
- **Abgewiesene Anfragen verbrauchen das Budget.** Der `onRequest`-Hook läuft **vor** jedem
  preHandler-Guard und zählt hoch (`app.js:462-466`, `security.js:16`). Gemessen: fünf `POST /upload`
  **ohne** Session → 5× 401, danach ein Upload **mit** gültiger Session → 429. Ein Fremder ohne
  jede Zugangsdaten kann das Postfach lahmlegen.

Nicht abgedeckt sind außerdem `GET /u/<token>` und `GET /api/u/<token>/upload/context` — beide prüfen
ein Token und sind ungebremst (`app.js:118-135`, `:706`); das plugin-eigene Rate-Limit ist explizit
abgeschaltet (`auth.js:92-94`).

**MIME-Allowlist.** Geprüft wird ausschließlich `config.allowedMime.includes(part.mimetype)`
(`app.js:307`) — der vom Client deklarierte Content-Type. Keine Magic Bytes, kein Abgleich mit der
Endung, keine Umbenennung. Gemessen: HTML-Inhalt in `evil.html`, deklariert als `image/png`, bei
`allowedMime=['image/png']` → 200, gespeichert als `evil.html`. Und ein Multipart-Teil **ohne**
Content-Type-Header rutscht über den busboy-Default durch: `if (contype === undefined) { contype = 'text/plain' }`
(`@fastify/busboy@3.2.0/lib/types/multipart.js:133`) — **sofern** `text/plain` in der Allowlist steht.
Heute ist das ungefährlich, weil drop nichts ausliefert. Im Modul `files` mit Preview und Download wird
daraus gespeicherter XSS auf einer Domain im Cookie-Scope der ganzen Suite.

**Größenlimits.** Pro Datei greift `limits.fileSize` (`app.js:445-451`); für die Gesamtanfrage greift
**nichts** — `bodyLimit` (`app.js:436`) ist bei Multipart wirkungslos: gemessen mit
`maxFileSizeMb=1` (`bodyLimit` = 2.097.152, zur Laufzeit ausgelesen) gingen 10 Dateien à 900 KB =
9.217.071 Bytes in **einer** Anfrage durch. Die einzige Obergrenze ist damit `files: 25` × pro-Datei-Grenze.
Und die Grenzen `files: 25` / `parts: 60` enden in **HTTP 500** — bei 30 Dateien nachdem 25 bereits
geschrieben waren, bei 70 Feldern ohne dass etwas geschrieben wurde. Der Client zeigt dafür
„Serverfehler" (`use-upload.ts:49`).

**ERSTRANG — fail-closed ist toter Code, und der AV-Fehlerpfad tötet den Prozess.** `parseResponse`
akzeptiert nur `stream: OK` und `stream: <x> FOUND` und wirft bei allem anderen
(`antivirus.js:11-26`). Der Wurf passiert aber im `socket.on('end')`-Callback (`:56-58`), also
außerhalb der synchronen Ausführung des Promise-Konstruktors: er wird **keine** Promise-Rejection,
sondern eine uncaught exception, und das Promise settelt nie. Gemessen gegen einen Fake-clamd, mit
plain `node` **und** mit `node --import ./instrument.mjs`: Exit-Code 1 mit Stack aus
`antivirus.js:25` über `:57`. `src/server.js:18-19` registriert nur SIGINT/SIGTERM, es gibt keinen
`uncaughtException`-Handler. Mit `restart: unless-stopped` (`docker-compose.yml:5`) reißt jede
unerwartete clamd-Antwort alle laufenden Uploads mit und startet den Container neu.

Der `catch`-Block in `app.js:332-340` und damit der **komplette `AV_FAIL_OPEN`-Schalter** werden für
Protokollfehler nie erreicht — end-to-end in beiden Schalterstellungen identisch gemessen. Was
funktioniert, sind Verbindungsfehler und Timeout (`antivirus.js:61-71`, echtes `reject`) — genau der
Pfad, den die beiden Tests abdecken, weil ihr Stub in einer async-Funktion wirft
(`test/app.test.js:619-641`). Die Commit-Nachricht `c582dac` behauptet ausdrücklich das Gegenteil
(„which the upload handler already maps to av_unavailable (fail-closed by default)").

Auslöser ist **jede** clamd-Antwort außer den beiden erwarteten — auch
`stream: Can't allocate memory ERROR`, das mit `stream:` beginnt. Der naheliegendste Fall ist gemessen:
gegen `clamav/clamav:1.4` (30.07.2026, Digest `sha256:6b7c8e09…6aba9`) geht ein INSTREAM mit 100 MiB
(104.857.600 B) als `stream: OK` durch, bei 101 MiB antwortet clamd
`INSTREAM size limit exceeded. ERROR` — **ohne** `stream:`-Präfix, also am generischen `throw`
(`antivirus.js:25`) und damit im tödlichen Pfad. Die Grenze ist nicht das dokumentierte
`StreamMaxLength` (im Image kommentiert, `/etc/clamav/clamd.conf:139`; `clamconf -n` zeigt es als nicht
gesetzt), sondern das Dateigrößen-Limit, das clamd beim Start als „File size limit set to 104857600
bytes" protokolliert. Dieselbe Übergröße per **Pfad** (`zSCAN`) meldet clamd dagegen als `OK` — im
Startlog steht dazu „AlertExceedsMax heuristic detection disabled" (Entscheidung 16). Im Repo gibt es
keine `clamd.conf`, und `docker-compose.yml:26-37` übergibt dem clamav-Service weder Volume noch Env —
es gilt also dieser Image-Default, während `.env.example:7` 500 MB erlaubt. Die Kollision ist damit
keine Vermutung: jede Datei über 100 MiB tötet den Upload-Prozess.

Und: `AV_ENABLED` verstummt bei jedem anderen Wert als `true` (`config.js:48`, Vergleich
`.toLowerCase() === 'true'`) — `1`, `yes` und leer ergeben `false`, dann greift `createNoopScanner`
(`app.js:432-434`) und jede Datei landet ungescannt im Postfach, ohne Hinweis in der Antwort und ohne
Logeintrag.

**`MAX_PARALLEL_UPLOADS` ist ein globaler Engpass ohne Timeout.** Ein einziger Semaphore
(`app.js:428`) umschließt beide Upload-Routen und den gesamten Handler inklusive Virenscan
(`:285` bis `:420-422`); es gibt keine Wartezeitgrenze und keinen Request-Timeout (zur Laufzeit
`requestTimeout=0`, `connectionTimeout=0`). Gemessen mit hängendem Scanner: nach 1200 ms ist **keine**
von vier Anfragen beantwortet, drei `.part-`Dateien liegen im Verzeichnis.

**Gleichzeitige Uploads gleichen Namens verlieren Daten** — quittiert mit 200.
`findAvailableFilePath` prüft mit `access`, das anschließende `rename` (`app.js:350`) überschreibt
bedingungslos, und `flags: 'wx'` schützt nur die je Anfrage eindeutige Temp-Datei (`:318,326`).
Gemessen: vier gleichzeitige Uploads von `gleich.txt` → vier 200, zwei Dateien. `README.md:11` nennt
das „atomare Writes".

**Ein erfolgreich gespeicherter Upload wird als Fehlschlag gemeldet**, wenn die Metadatei nicht
schreibbar ist: das `rename` ist durch, erst `writeFile` scheitert, der gemeinsame `catch`
(`app.js:374-377`) meldet `store_failed`, und der Statuscode ist 207 — `app.js:407` lautet
`reply.code(errors.length > 0 ? 207 : 200)`, **ohne** Bezug auf `uploaded.length`. Gemessen:
`207 {"uploaded":[],"errors":[{"file":"wichtig.pdf","error":"store_failed"}]}`, während die Datei da
liegt. Der Client verlangt `uploaded.length > 0` (`use-upload.ts:164-168`) und zeigt „Upload
abgelehnt (Status 207)" — der Melder lädt erneut hoch und erzeugt eine Dublette.

**Auth der Verwaltungsseite: nur Existenz einer Session.** `requireSession` prüft ausschließlich
`if (!session)` (`app.js:468-486`); in `src/` gibt es keine Prüfung auf E-Mail, Rolle oder Gruppe
(`email` kommt nur in `mapSession`, Sentry und den Scopes vor). Jeder Account der konfigurierten
Pocket-ID-Instanz kann Share-Tokens anlegen und widerrufen. Widerruf ist Zeilenlöschung
(`app.js:690-700`) — es gibt keine Historie zum Importieren, obwohl die Plugin-Spalte `enabled`
existiert und beim Verify geprüft wird (`index.mjs:1655`).

**Tokens im Klartext in den Logs.** Fastify läuft mit `logger: true` (`app.js:436`); gemessen über
stdout-Redirect enthalten die `incoming request`-Zeilen die vollständige URL mit Token. Ein
ungültiges Token wird zusätzlich in den Redirect gespiegelt
(`Location: /?error=invalid_token&token=…`, `app.js:141-158,505-512`) und landet damit in
Browser-History und Referer.

**Die Sentry-Verdrahtung läuft im Container nicht.** `Dockerfile:31` ist `CMD ["node", "src/start.js"]`
— ohne das `--import ./instrument.mjs` aus `package.json:9`, und `docker-compose.yml:3` setzt kein
`command:`. Gemessen: `Sentry.captureException` ohne vorheriges `init` läuft still durch,
`getClient()` ist `undefined`. `captureUnexpectedServerError`, `bindSessionToSentry` und
`bindShareTokenToSentry` sind im Betrieb Zierde. Umgekehrt sendet ein lokales `pnpm start` mit
`sendDefaultPii: true` (`instrument.mjs:14`) und fest hinterlegter DSN (`:5,8`) auch ohne gesetzte
Env-Variable Request-Daten nach außen. Für die Suite ist Sentry ohnehin bewusst gestrichen — nicht
mitportieren.

**Toter Code, der beim Port irreführt:** `src/shared/ui-utils.js` und `src/shared/admin-token-utils.js`
haben **keinen** Produktions-Importeur — die einzigen Importe stehen in `test/ui-utils.test.js:8` und
`test/admin-token-utils.test.js:9`. Produktiv laufen die TS-Zwillinge unter `web/src/lib/`. `pnpm test`
testet also Dateien, die nie ausgeliefert werden; eine grüne Suite sagt über die Token-Eingabe des
Clients nichts. Maßgeblich ist `web/src/lib/utils.ts:69-97` — und die Normalisierung dort prüft das
Alphabet **nicht** (`:75` behält `[a-z0-9-]`, `:96` ist ein Pass-through für beliebigen Rest).
Ebenso tot: `resolveUploadContextPath` (`utils.ts:30`, kein Aufrufer), `isIpInSubnets`
(`security.js:69-88`) und `createShareUrl` (`auth.js:147-150`).

---

## 4. Die Zielseite

### 4.1 Was `files` aus `core` bekommt

- **Host → Modul mit zwei Domains, ohne Eingriff.** `prodHosts` ist `string[]`
  (`src/core/registry.ts:34`), `SUITE_HOST_<KEY>` wird an Kommas zerlegt, getrimmt, kleingeschrieben
  (`src/core/hosts.ts:39-46`), `moduleForHost` trifft **jeden** Listeneintrag
  (`registry.ts:119-126`), und `validateHostConfig` meldet nur denselben Host bei zwei
  **verschiedenen** Modulen (`hosts.ts:87-94`). Der einzige Mehrfach-Host-Test des Repos benutzt
  bereits den Key `files` (`hosts.test.ts:17-21`), und `.env.example:81,96` nennt „das files-Modul mit
  fileshare + drop" wörtlich als Beispiel.
- **Die Login-Allowlist deckt beide Hosts automatisch**, weil `suiteRedirect` über `moduleForHost`
  entscheidet (`src/core/auth/redirect.ts:54`); `absoluteCallbackUrl` macht das Ziel gegen den
  Browser-Origin absolut (`src/core/auth/callbackUrl.ts:15-21`).
- **Registrierungs-Dreieck mit Gate:** `_db/`-Ordner + `MODULE_MIGRATIONS` (`core/bootstrap.ts:17-21`)
  + `COPY`-Zeile im `Dockerfile:35-37` sind per Test gekoppelt (`core/bootstrap.test.ts:37-63`).
- **Health ist generisch:** `checkModuleHealth(key)` öffnet `moduleDbPath(key)` und macht `SELECT 1`
  (`core/health/index.ts:4-16`) — `/api/health/files` funktioniert nach dem Anlegen der DB von selbst.
- **Import-/Paritäts-Harness:** `checkParity` bildet Multisets über SHA-256 einer wertkanonischen
  Serialisierung (`scripts/import/parity.ts:16-56`), `assertParity` wirft mit
  „Import ABORTED — no cutover." (`:58-64`). Vollständige Anatomie im Vorbild `scripts/import/feedback.ts`:
  rohe Quell-Interfaces (`:11-60`), reine `toNew*`-Mapper mit ID 1:1 (`:83-135`), idempotenter Upsert
  per `onConflictDoUpdate` (`:138-169`), Sekunden-Normalisierung (`:171-176`), `__table`-Tag gegen
  Kollisionen strukturell gleicher Zeilen (`:235-256`).
- **Der `feedback`-Backstop** als erprobtes Muster für „anonymer Teil + gegateter Teil in einem
  Modul": Registry-Eintrag `requiresAuth: false` (`registry.ts:52-67`), Durchsetzung in
  `_lib/requireFeedbackAccess.ts:35,48` (Session fehlt → Login-Redirect; Session ohne Zugang →
  `notFound()`, nicht 403, damit die Route nicht verraten wird), zweite Linie `_lib/guardPage.ts:26-40`
  gegen die aus der DB geladene ID.
- **QR-Erzeugung mit genau *einer* verbindlichen Konfiguration.** `core/qr` liefert `qrSvg(text)` und
  `qrPng(text, {width})` (`src/core/qr/index.ts:37-46`) über `qrcode` 1.5.4 (`package.json:27`).
  `QR_OPTIONS` ist ausdrücklich „die *eine* gemeinsame Konfiguration für alle QR-Codes im Projekt":
  `errorCorrectionLevel: "H"`, `margin: 4`, `color: { dark: "#000000", light: "#ffffff" }` (`:24-28`) —
  eingeführt, weil es „vorher drei divergierende Stellen" gab (`:19-23`). Dazu ein Kapazitätswächter:
  `QR_MAX_LENGTH = 1273` gegen die **UTF-8-Länge**, nicht `text.length` (`:3,15-17`), und
  `assertQrCapacity` **wirft** (`:30-35`).

  `files` erbt damit andere Werte als **beide** Altsysteme:

  | | Fehlerkorrektur | Rand (Module) | Vordergrund | Weg |
  |---|---|---|---|---|
  | `easy-filesharing` heute | `L` (Default) | `0` (Default) | `#000000` (Default) | Client-SVG, `<QRCodeSVG value=… size={220} />` (`shares-table.tsx:295`) |
  | `drop` heute | `M` | `1` | `#0f172a` | Server-PNG (`src/app.js:217-226`) und `scripts/generate-qr.js:9-17` |
  | `files` künftig | `H` | `4` | `#000000` | `core/qr` (`index.ts:24-28`) |

  Die Defaults von `qrcode.react` 4.2.0 sind gemessen: `DEFAULT_LEVEL = "L"`,
  `DEFAULT_MARGIN_SIZE = 0`, `DEFAULT_FGCOLOR = "#000000"`
  (`node_modules/qrcode.react/lib/index.js:807,813,809`); `shares-table.tsx:295` übergibt nur `value`
  und `size`. Die Bibliothek nennt 4 selbst den Spezifikationswert (`SPEC_MARGIN_SIZE = 4`, `:812`) und
  liefert 0 — der heutige Fileshare-QR hat also keine Ruhezone.

  **Folge, die benannt sein muss: neu erzeugte Codes sehen anders aus.** Gemessen mit `qrcode` 1.5.4
  an einer 36 bzw. 42 Zeichen langen URL über `share.iuk-ue.de/s/<id>` und `drop.iuk-ue.de/u/<token>`:
  `L` und `M` ergeben Version 3 mit 29×29 Modulen, `H` ergibt Version 5 mit 37×37. **Herleitung:** bei
  gleicher Druckgröße wird damit jedes Modul kleiner, die Robustheit gegen Verschmutzung und
  Verzerrung steigt. Der **Inhalt** bleibt gleich — Bestandsdrucke bleiben gültig, weil sie an
  `/s/<id>` bzw. `/u/<token>` hängen und nicht am Aussehen. Es ist eine bewusste Änderung, keine
  Regression, und sie gehört als solche in die Spec, samt der Frage, ob die Druckgröße der Aushänge
  mitwachsen muss.

  **Ein Fehlerpfad-Unterschied dazu:** `drop` antwortet bei zu langer Nutzlast mit `400`
  (`MAX_QR_DATA_LENGTH = 2048`, `src/app.js:20,677-679`), `core/qr` **wirft** — in einem Route Handler
  wäre das eine 500. Für Share- und Inbox-URLs ist keine der beiden Grenzen erreichbar (36–42 Zeichen
  gegen 1273 Byte); wer den QR-Weg später für Freitext öffnet, muss den Wurf abfangen.
- **Die öffentliche-Adresse-Herleitung**: `resolveHost(headers)` + `x-forwarded-proto`
  (`core/routing.ts:36-41`, benutzt in `feedback/_ui/Teilnahme.tsx:55-59` und
  `f/[slugSecret]/qr.png/route.ts:54-56`). Der Kommentar dort nennt beide verworfenen Alternativen
  namentlich: nicht `moduleUrl()` und nicht die Anfrage-URL, weil die nach dem Rewrite auf
  `http://localhost:3000/…` zeigt — „und das fällt erst AN DER WAND auf". Für **zwei** Hosts trägt
  dieses Muster allerdings nur das **Bedienen**, nicht das **Erzeugen**: bei `feedback` war „der Host,
  auf dem der Erzeuger gerade sitzt" derselbe wie „der Host des Moduls" — bei `files` ist er das nicht
  mehr (Falle 17 und Entscheidung 22).

### 4.2 Was fehlt

- **Kein Baustein für Blobs.** `moduleDbPath(key)` ist `${DATA_DIR}/<key>.db`
  (`core/db/index.ts:8-10`); der einzige `mkdirSync` in `core` legt das Elternverzeichnis einer
  DB-Datei an (`:14-15`). Ein `/data/files/`-Verzeichnis existiert beim ersten Schreibvorgang nicht
  und wird von nichts angelegt. Der Prozess läuft als `nextjs` uid 1001, `/data` ist ihm zugewiesen
  (`Dockerfile:44-48`).
- **`scripts/backup.sh` sichert ausschließlich `*.db`.** Es sammelt `"$DATA_DIR"/*.db` (`:13-15`),
  macht je DB ein `sqlite3 .backup` in ein Arbeitsverzeichnis (`:29-31`) und packt **nur dieses**
  (`tar -czf … -C "$BACKUP_DIR" "$stamp"`, `:33`). Blobs fallen aus dem Backup, und das Backup meldet
  Erfolg. Der eigene Entwurf hatte es vorgesehen — „tar über /data (inkl. spätererem `files/`)"
  (`docs/superpowers/specs/2026-07-18-portal-productionize-design.md:146`) — implementiert ist es nicht.
- **Kein Streaming-, kein Range-, kein Chunk-Vorbild.** Kein `ReadableStream`, kein
  `createReadStream`, kein `formData()` in `src`; die zwei Download-Antworten der Suite bauen die
  ganze Nutzlast als String im Speicher (`export.csv/route.ts:150-158`), die größte Binärantwort ist
  ein QR-PNG mit auf 2048 geklemmter Breite (`qr.png/route.ts:14,25-31`).
- **Kein Cron.** Cron-Jobs sind in der Suite nirgends verdrahtet; `feedback` löst das Problem durch
  Statusfalten beim Abruf („Es gibt keinen Cron", `feedback/_lib/cockpit.ts:19`). Für Blobs trägt das
  nicht — ein Statusfalten löscht keine Bytes.
- **Der Docker-Healthcheck fragt fest `/api/health/portal`** (`compose.yaml:45`). Ein defektes
  `files.db` oder ein volles Volume macht den Container nicht unhealthy — und `unhealthy` löst im Repo
  ohnehin nichts aus (kein `autoheal`, keine Traefik-Bedingung; die einzige Auswertung ist der Mensch
  im Runbook, `docs/runbooks/suite-update-webfinger.md:170`). Was der Check künftig prüft und was der
  Zustand bedeuten soll: Entscheidung 17.
- **Kein ClamAV.** Der eigene Entwurf verschiebt es ausdrücklich auf diese Phase: „Kein ClamAV
  (Phase 4 mit files)" (`portal-productionize-design.md:172`). Der Stack hat heute **einen** Service,
  **ein** Netz (das externe `proxy`), kein `depends_on` und kein Volume außer `suite_data`
  (`compose.yaml:1-4,40-49,61-67`) — was ein zweiter Service konkret kostet, steht in 4.4, die
  Festlegungen dazu in den Entscheidungen 16 und 17.

### 4.3 Was ein Datei-Modul in RSC eigen macht

**ERSTRANG — der Rewrite trägt den Ursprungs-Host nicht weiter.** `decideRoute` liefert nur
`{action, target, moduleKey}` (`core/routing.ts:78-79`), `proxy.ts:36-40` setzt `url.pathname` und
rewritet — ohne einen einzigen zusätzlichen Header. Das Modul erfährt den Host nur über
`resolveHost(headers)`. Und **kein Layout der Suite liest heute `headers()`**: die
`next/headers`-Importe sind `cookies` in `app/layout.tsx:2` und `f/[slugSecret]/page.tsx:1` sowie
`headers` in `feedback/actions.ts:4` und den zwei genannten Seiten. Host-abhängige Navigation oder
host-abhängige PWA-Metadaten wären ungeprüftes Gelände.

**ERSTRANG — die Wurzel `/` kollidiert.** `drop` bedient `/` mit der Welcome-Page
(`drop/src/app.js:557`, dieselbe Funktion wie `/login`), `easy-filesharing` mit
`redirect("/dashboard")` (`app/page.tsx:3-4`). Unter der Suite rewriten **beide** Hosts auf denselben
Pfad `/m/files`, weil `routing.ts:78` für `/` `rest = ""` setzt. Ein Handler, zwei Startseiten — und
es gibt keinen Pfadunterschied, an dem Next das entscheiden könnte. Dasselbe, nur ohne harte
Kollision, gilt für `/api/upload/*`: drop hat `/api/upload/context`, easy-filesharing
`/api/upload/init|chunk|complete`.

**ERSTRANG — `PASSTHROUGH` enteignet das Modul auf jedem Host.** `["/api/auth", "/api/health",
"/login", "/_next", "/favicon.ico", "/.well-known"]` wird als **erstes** geprüft, vor der
Host-Auflösung (`routing.ts:12,50-52`). Damit sind unter der Suite nicht portierbar: drop `/login` und
`/login/pocketid` (`drop/src/app.js:559,563`) und easy-filesharings `/api/health` (eine substanzielle
HeadBucket-Probe, `health/route.ts:14-27`) sowie dessen komplette NextAuth-Montage unter
`/api/auth/[...nextauth]`. Eine Datei unter `src/app/m/files/api/health/route.ts` wäre einfach tot —
kein Fehler, kein Log. Nicht betroffen sind `/s/<id>`, `/u/<token>`, `/upload`, `/u/<token>/upload`,
`/api/download/*`, `/api/preview/*`, `/api/upload/*`, `/api/cleanup`, `/admin`, `/app`, drop `/health`
(nur `/api/health` ist Passthrough). Und weil der Vergleich nur `pathname === p` oder `p + "/"` matcht
(`:50`), fallen drop `/login.html` (`:561`) und `/index.html` (`:625`) **nicht** darunter.

**ERSTRANG — der App-Switcher verliert den zweiten Host.** `moduleUrl` liest in Prod
`prodHostsFor(mod)[0]` (`core/shell/moduleUrl.ts:19-22`), `switcherEntries` baut je Modul genau einen
Eintrag (`switcherEntries.ts:10-15`), und `visibleSwitcherModules` blendet das aktuelle Modul nicht aus
(`registry.ts:140-145`). Wer auf der Inbox-Domain sitzt und „Dateien" klickt, springt auf die
Fileshare-Domain — je nach Kommareihenfolge in der `.env`. Kein Test der Suite setzt
`SUITE_HOST_*` je auf zwei Hosts (vollständig aufgezählt: `registry.test.ts:16,24`,
`moduleUrl.test.ts:37,43,49`, `redirect.test.ts`); der einzige Mehrfach-Host-Test läuft nur gegen
`envHostsFor`. In Dev gibt es überhaupt nur einen Host je Modul, weil `moduleUrl` dort den Prod-Zweig
nicht betritt (`:24-26`) — die Zwei-Host-Aussage ist lokal nicht ohne Zusatzarbeit prüfbar.

**Das Gating hängt am Pfad-Segment, nicht am Host.** Trifft `/m/<key>`, entscheidet `decideRoute`
anhand des Modul-Keys aus dem Segment (`routing.ts:58-67`) — der Host ist irrelevant. Ein Modul mit
einem anonymen und einem gegateten Host kann die Trennung **nur** modul-intern durchsetzen. Ebenso gibt
es genau ein `SUITE_ACCESS_GROUP_FILES` und ein `SUITE_ADMIN_GROUP_FILES` für beide Domains
(`core/groups.ts:32-42`), und `canAccess` steigt bei `requiresAuth: false` sofort mit `true` aus und
liest `requiredGroups` dann nie (`registry.ts:133`).

**ERSTRANG — der Next-Proxy kappt Request-Bodies bei 10 MiB still.** In der installierten Version
16.2.6 lautet der Default `proxyClientMaxBodySize: 10485760`
(`node_modules/next/dist/server/config-shared.js:260`, selbst nachgelesen);
`cloneBodyStream` bricht bei Überschreitung ab, schiebt `null` in beide Streams und gibt **nur** ein
`console.warn` aus (`server/body-streams.js:85-101`). Der Klon passiert bei jedem non-GET/HEAD-Request,
der die Middleware trifft, und `proxy.ts:103` schließt nur `_next/static`, `_next/image` und
`favicon.ico` aus. drop lädt heute **eine** Datei in **einer** Anfrage bis zur Datei-Obergrenze
(`drop/src/app.js:436,446-447`) — eine 1:1-Portierung dieses Wegs zerbricht ab 10 MiB ohne
Fehlermeldung. (Aus dem Quelltext gelesen, nicht gefahren.) Server Actions haben zusätzlich ein
Default-Limit von 1 MB mit HTTP 413 darüber; `next.config.ts:2-11` konfiguriert nichts davon.

**Gestaltungsklassen.** `docs/design/README.md:15-21` trennt zwei: öffentliche, login-freie Ansichten
(per Link/QR, oft auf fremdem Handy) — eigenes Aussehen, eigene CSS-Module, **kein antd**; und
Admin-Ansichten mit antd + Suite-Theme + Suite-Chrome. `/s/<nanoid>` und `/u/<token>` fallen in die
erste Klasse (Vorbild: das shell- und antd-lose `feedback/f/layout.tsx:1-26`), womit die
RSC-Compound-Falle für sie strukturell ausgeschlossen ist. Die `core`-Regel: Maßstab ist „ein zweiter,
heute belegbarer Nutznießer", und Modul-Interna aus einem anderen Modul zu importieren ist verboten
(`:23-33`).

### 4.4 Der Sidecar als Stack-Änderung — gemessen am Image, das `drop` benutzt

„**ClamAV-Sidecar** in den Suite-Stack (fail-closed, scannt beide Richtungen)" ist eine eigene Zeile der
Phase-4-Checkliste (`KONSOLIDIERUNG-PROGRESS.md`, Phase-4-Checkliste, gleichlautend `APP-KONSOLIDIERUNG.md:145`) und
damit ein Lieferergebnis mit Compose-Anteil. Die beiden Stacks stehen heute so:

| | `drop` | Suite |
|---|---|---|
| Services | `dropzone`, `clamav`, `caddy` (nur Profil `tls`) | genau einer: `suite` |
| Netz | eigenes Bridge-Netz `dropnet`, **nicht** `internal: true` | nur das **externe** Netz `proxy` |
| Startreihenfolge | `depends_on: {clamav: {condition: service_healthy}}` am Upload-Service | **kein** `depends_on` |
| Signaturen | **kein** Volume am clamav-Service, kein Env, keine eigene `clamd.conf` | — |
| Healthcheck | `clamdcheck.sh`, `interval 60s`, `start_period 120s` | fest `/api/health/portal`, `start_period 40s` |

(`drop/docker-compose.yml:2-24,26-37,39-54,56-58`; `iuk-suite/compose.yaml:1-4,40-49,61-67`)

**Das Image, gemessen.** Alle Zahlen dieses Abschnitts sind am 30.07.2026 gegen `clamav/clamav:1.4`
erhoben (löst auf 1.4.5 auf, Digest
`sha256:6b7c8e09559250f25b0184516b0a2ae805136e57485260e16c780c9fd6e6aba9`; ausgeführt als `linux/amd64`
unter Emulation auf einem arm64-Host — **Zeiten** sind darum keine Zielhost-Zahlen, Größen und
Protokollantworten schon):

- **Der Tag `1.4` hat nur ein `linux/amd64`-Manifest** (`docker manifest inspect`; ein Pull ohne
  `--platform` scheitert hier mit „no matching manifest for linux/arm64/v8"). arm64 gibt es nur in den
  Debian-Varianten (`1.4-debian`, `1.4.5-debian`, jeweils auch als `_base`). Auf einem arm-Host bricht
  `docker compose up` also ab — laut, aber erst am Zielhost.
- **Die Signaturen stecken im Image:** `/var/lib/clamav` = 110.140 KiB, davon `main.cvd` 89.072.577 B,
  `daily.cvd` 23.421.740 B, `bytecode.cvd` 281.702 B, alle mit Dateidatum 27.07.2026. Die
  `_base`-Varianten kommen ohne DB: 39.671.052 B gegen 152.475.420 B komprimiert in der Registry.
- **Der erste Start lädt trotzdem nach.** freshclam-Log: „daily database available for update (local
  version: 28073, remote version: 28077)" → „daily.cld updated (version: 28077, sigs: 355575)"; danach
  liegt eine **unkomprimierte** `daily.cld` mit 86.136.832 B im Verzeichnis, Gesamtstand 171.388 KiB.
  Ohne Volume ist diese Arbeit nach jedem `up -d --force-recreate` weg. *Herleitung, nicht gemessen:*
  die Nachladelast wächst mit dem Alter des eingebackenen Stands — bei kleinem Versionsabstand sind es
  Diffs, bei großem die vollen CVDs.
- **clamd braucht ~1 GB RSS:** 986,5 MiB bzw. 998,2 MiB in zwei Läufen, jeweils direkt nach
  Bereitschaft (`docker stats --no-stream`). Das ist der geladene Signaturbestand (3.642.682
  Signaturen, `clamconf -n`) und kommt beim Suite-Host zum Bedarf des Node-Prozesses hinzu.
- **clamd ist unauthentifiziert und lauscht auf allen Interfaces:** `TCPSocket 3310` gesetzt, `TCPAddr`
  kommentiert (`/etc/clamav/clamd.conf:118,126`), im Container `0.0.0.0:3310` und `:::3310` im
  `LISTEN`. Genau so sind die Messungen entstanden: ein fremder Container im selben
  Netzwerk-Namespace, ohne jede Zugangsdaten, spricht `zPING`, `zINSTREAM` und `zSCAN`. Auf einem
  gemeinsamen Netz wäre das jeder andere Container dort — und `zSCAN` nimmt einen **Pfad im
  clamav-Container** an, nicht nur Bytes. Welche Container heute am externen `proxy`-Netz hängen, ist
  aus dem Repo nicht feststellbar (`external: true`, `compose.yaml:65-67`); die Aussage gilt als
  Eigenschaft des Netzes, nicht als Aufzählung realer Nachbarn.
- **Bereitschaftsfenster:** `clamdcheck.sh` wird nach 17 s wahr; eine TCP-Probe auf 3310 liefert bei
  0/2/4/6/8 s `ECONNREFUSED` und bei 10 s `PONG`. Der Port ist also entweder zu oder fertig — er hängt
  nicht. Für den Upload-Weg heißt das: eine Anfrage in diesem Fenster läuft in drops
  `socket.on('error')`-Pfad (`antivirus.js:68-70`, echtes `reject`) und wird **sofort** abgelehnt, nicht
  erst nach `AV_TIMEOUT_MS=30000`. Die 120 s in drops `start_period` sind ein gesetzter Puffer
  (`docker-compose.yml:37`), keine gemessene Ladezeit.

**Was daraus für die Suite folgt.** Die Suite hat kein `depends_on` und `restart: unless-stopped`
(`compose.yaml:1-4`). Nach jedem `up -d`, jedem Host-Neustart und jedem clamd-Neustart nimmt sie
Uploads an, während clamd noch lädt — mit fail-closed werden sie in diesem Fenster **alle** abgelehnt,
und der Melder sieht eine Meldung, die den Grund nicht nennt. `depends_on` deckt davon nur den ersten
Fall ab: es wirkt beim Start des abhängigen Service, nicht bei einem späteren clamd-Neustart
(*Herleitung aus der Compose-Semantik, nicht gemessen*). Der Rest ist modul-intern zu lösen
(Entscheidung 17).

**Der Healthcheck bleibt, wie er ist, wenn niemand ihn ändert:** `wget … /api/health/portal`
(`compose.yaml:45`). Der generische Weg existiert bereits — `/api/health/<modul>` macht `SELECT 1` auf
`moduleDbPath(key)` (`core/health/index.ts:4-16`, `api/health/[modul]/route.ts:3-7`), `/api/health`
antwortet ohne DB-Zugriff `{status:"ok", timestamp}` (`api/health/route.ts:1-3`) und ist Passthrough
(4.3). Wichtig für die Erwartung: im Repo reagiert **nichts** auf `unhealthy` — kein `autoheal`, keine
Traefik-Bedingung; die einzige Auswertung ist ein Mensch im Runbook („suite muss ‚healthy' werden",
`docs/runbooks/suite-update-webfinger.md:170`). Eine Erweiterung ist damit zunächst Dokumentation für
den Menschen, kein Automatismus.

---

## 5. 1:1-Pflichten — die Tabelle, an der der Cutover hängt

**Vorbemerkung, die für jede Zeile gilt:** Diese Pflichten sind aus **Code** belegt, nicht an
Produktionsdaten gemessen. `easy-filesharing/db.sqlite` enthält 0 Zeilen in `shares`, `share_files`
und `download_logs` (WAL 0 Byte, also kein verborgener Zustand); die produktive DB liegt im
Docker-Volume `db-data` unter `/data/db.sqlite` (`docker-compose.yml:15,18`). In `drop` liegt gar
keine Auth-DB im Repo (`.gitignore:3`), und **keine der beiden Apps führt ihre Produktionswerte in
git** — `drop` hat nur `.env.example`, bei `easy-filesharing` liegt eine `.env` im Arbeitsbaum (sie ist
gitignoriert, wird unten dort belegt, wo ihre Werte zitiert werden, und ist trotzdem kein Beweis für
den Server: sie trägt `AUTH_DEV_MODE=true`). Jede
Aussage über bestehende Hashes, Dateinamen, Objektzahlen oder gültige Tokens ist damit eine
**Anforderung an den Port** — keine Messung. Ebenso gilt: alle Betriebszahlen unten stammen aus
`.env.example` bzw. Code-Defaults.

| Artefakt | Wert / Regel | Bricht sonst | Beleg |
|---|---|---|---|
| Öffentlicher Share-Pfad | `/s/<id>` an der **Host-Wurzel**, ein Segment, kein Präfix | jeder gedruckte QR und jeder verteilte Link | Verzeichnis `app/(public)/s/[nanoid]/`; `shares-table.tsx:80,244,295,298`; `create-form.tsx:63`; `routing.ts:78` |
| `shares.id` | `nanoid(10)` über das 64-Zeichen-urlAlphabet `useandom-…_GQZbfghjklqvwyzrict` — enthält `-` und `_`, case-sensitive; Werte unverändert übernehmen | ein Validator `/^[a-z0-9]+$/` gibt für ~jeden 32. Zeichenplatz ein stilles 404 | `upload/init/route.ts:36`; Alphabet gemessen aus `node_modules/nanoid` (5.1.11) |
| `share_files.id` + Parametername | `nanoid(10)`, Query `?file=<fileId>` | gemailte und gebookmarkte Direktlinks | `init/route.ts:67`; `file-view.tsx:48`; `folder-view.tsx:55` |
| Download-/ZIP-/Preview-Pfade | `/api/download/<id>?file=<id>`, `/api/download/<id>/zip` (ohne `file`), `/api/preview/<id>?file=<id>` | stehen als `href`/`src` in bereits ausgeliefertem HTML | `file-view.tsx:48`; `folder-view.tsx:55,65`; `file-preview.tsx:21,28,42,69` |
| `shares.password_hash` | bcryptjs-Hash, cost 12, Präfix `$2b$12$`, 60 Zeichen — bcrypt zum Verifizieren behalten | die Passwörter liegen bei den Empfängern; ein Wechsel auf argon2/scrypt macht jeden geschützten Share unöffenbar | `lib/auth/password.ts:1-12`; Präfix/Länge durch Ausführen der Bibliothek gemessen; `package.json` führt bcryptjs seit dem Implementierungs-Commit auf `^3.0.3` |
| Zeitstempel-Einheit | Unix-**Sekunden** als roher Integer — kein `timestamp_ms`, keine ISO-Strings | Faktor 1000 in beide Richtungen: entweder läuft nie ein Share ab und das Cleanup löscht nichts, oder alles ist sofort abgelaufen — **paritätsgrün** | `schema.ts:9,12,14-16,30-32,43-45`; `format.ts:54`; Kontrast `qr/_db/schema.ts:19-20` |
| `s3_prefix` / `s3_key` | wörtlich `shares/<id>/` (Slash am Ende) und `shares/<id>/<fileId>/<roher Dateiname>` — byte-identisch übernehmen **oder** jede Zeile beim Umzug umschreiben | die Strings sind die einzige Brücke zu den Blobs; der Bucket-Name kommt in keiner Spalte vor | `init/route.ts:37,68`; `schema.ts:18,27`; `lib/s3/index.ts:32` |
| Import-Verfahren | **spaltenweise mit Namen** — nie `INSERT … SELECT *`, nie `.dump`-Restore, nie positionsbasiertes CSV | `limit_reached_at` kam per `ALTER TABLE` (`0001_low_stellaris.sql:1`) und steht physisch als letzte von 13 Spalten, im Schema aber an 9. Position: fünf Spalten verschieben sich typplausibel und still | `drizzle/0001_low_stellaris.sql:1`; `schema.ts:11-13`; physische Reihenfolge an der Repo-DB per `pragma_table_info` gemessen (cid 12 von 0..12) |
| `shares.created_by` | `text NOT NULL`, **kein** SQL-Default und **kein** `$defaultFn` — der Import muss für **jede** Zeile einen Wert liefern; **welchen**, entscheidet Entscheidung 21 | ein spaltenweiser Import, der die Spalte nicht mitführt, bricht an NOT NULL ab (laut, aber der Cutover steht). Der stille Fall daneben: ein Mapper mit `""` als Ausweichwert läuft durch — gemessen, `''` erfüllt `text NOT NULL` in SQLite —, und das Feld „Erstellt von" ist danach für jede importierte Zeile leer | `lib/db/schema.ts:17`; `drizzle/0000_demonic_boom_boom.sql:23` (ohne `DEFAULT`); Füllstelle `app/api/upload/init/route.ts:61`; Anzeige `app/(admin)/shares/[id]/page.tsx:159`; NOT-NULL-Verhalten gegen `sqlite3` gemessen |
| `download_logs.file_id IS NULL` | Magic Value „ZIP-Download des ganzen Shares" — nicht zum FK machen, nicht NOT NULL setzen | alle ZIP-Zeilen verlieren ihre Bedeutung, oder der Import bricht ab | `zip/route.ts:79`; `logs/route.ts:38`; `schema.ts:40`; `0002:4,8` |
| NULL-Semantik | `max_downloads` NULL = unbegrenzt (nicht 0, nicht −1); `password_hash` NULL = kein Passwort; `description` NULL = keine | NULL→0 sperrt unbegrenzte Shares sofort zu; `""`→Hash erzeugt geschützte Shares mit leerem Passwort | `download/[id]/route.ts:41`; `s/[nanoid]/page.tsx:31`; `init/route.ts:55,59` |
| `shares.type` | exakt `"file"` / `"folder"`, kleingeschrieben, im SQL **ohne** CHECK | ein Enum/CHECK kann an Altdaten scheitern; neu ableiten kippt Ordner-Shares mit einer Datei | `schema.ts:7`; `0000:16`; `init/route.ts:56`; `s/[nanoid]/page.tsx:44-48` |
| `download_count` | 1:1 übernehmen, **nicht** aus `download_logs` rekonstruieren | die Log-Tabelle existiert erst seit Migration 0002; eine Rekonstruktion setzt Zähler zu niedrig und öffnet ausgeschöpfte Shares wieder | `_journal.json:19-25`; `0002:1-9`; `0000:20` |
| `/api/cleanup` | POST mit `Authorization: Bearer <CLEANUP_SECRET>` — **nur** falls ein externer Cron existiert; siehe Entscheidung 13, die den Endpunkt durch einen internen Timer ersetzt | der Cleanup läuft still nicht mehr, und weil er auch Storage-Objekte löscht, wächst das Volume unbemerkt | `cleanup/route.ts:9-15,33-38`; `.env:24`. Anmerkung: `replace("Bearer ", "")` ist keine Prüfung — das nackte Secret passiert ebenfalls |
| Öffentlicher Inbox-Pfad | `/u/<token>` an der **Host-Wurzel**; ungültiges Token → `302` auf `/?error=invalid_token&token=<eingabe>` | verteilte Inbox-Links; und der Melder braucht die Korrekturaufforderung statt einer 401-Seite | `drop/src/app.js:623,488-519,141-158` |
| drop-Token-Grammatik | `dz-` + 3×4 Zeichen aus `23456789abcdefghijkmnpqrstuvwxyz` (ohne 0/1/l/o), 17 Zeichen | Codes werden von Hand abgeschrieben und vorgelesen; die Körperlänge 12 ist die Voraussetzung für die Umgruppierung im Client | `share-token-config.js:3-7`; `auth.js:29-48`; `web/src/lib/utils.ts:69-97` |
| drop-Token-Hash | `base64url_ohne_padding(SHA-256(utf8(voller Token inkl. "dz-" und Bindestrichen)))`, kein Salt, kein Trim/Lowercase; `start` = erste 8 Zeichen | nur damit können kopierte `apikey`-Zeilen weiterleben — die Rohtokens existieren serverseitig nicht | gemessen gegen `defaultKeyHasher`, `api-key/dist/index.mjs:2085-2088,805-807,1811`; `auth.js:83-86` |
| drop-Berechtigung + Prüfreihenfolge | `{ files: ['write'] }` als JSON-String; `enabled === false` → DISABLED, `expiresAt` → EXPIRED, dann Permissions; **`remaining` muss NULL bleiben** | ein Import, der `remaining` mit 0 statt NULL füllt, lässt jeden Token beim ersten Gebrauch verschwinden (`index.mjs:1691` löscht bei `remaining === 0 && refillAmount === null`) | `share-token-config.js:1`; `auth.js:80-82`; `app.js:503`; `index.mjs:826,1652-1690` |
| drop-Upload-Endpunkte | `POST /upload`, `POST /u/<token>/upload`; Feldnamen im FormData `hint`, `category`, Datei unter `files` | ein bereits geladenes Formular in einem offenen Tab postet weiter genau dorthin | `app.js:702-711`; `web/src/hooks/use-upload.ts:126-128` |
| Kategorie-Values | `bilder`, `dokumente`, `sonstiges` — **und jedes real existierende Verzeichnis** | die Values sind gleichzeitig Verzeichnisnamen und das META-Feld `category`; ein Umbenennen macht den Join inkonsistent | `app.js:22-35,315-316,362`; `test/app.test.js:318-336` |
| META-JSON-Format | sieben Felder in fester Reihenfolge, 2-Space, abschließendes Newline, Ort `metaDir/<basename>.json` | es ist die einzige Quelle für Hinweis und Absender-IP bestehender Uploads | `app.js:353-364`; seit dem Implementierungs-Commit unverändert |
| Sanitizing-Regeln | `sanitizeFilename` und `sanitizeCategory` zeichengenau, inkl. Kollisionsserie `_1` … `_10000` | die Namen auf der Platte **sind** das Ergebnis dieser Regeln; ein „verbessertes" Sanitizing (ue statt u) kollidiert anders als die importierten Altnamen und kann ein `UNIQUE(dir,name)` kippen | `utils.js:5-51`; Werte gegen die echte Funktion gemessen |
| Registry-Eintrag | `requiresAuth: false` | mit `true` schickt die Middleware jeden anonymen `/s/<id>`- und `/u/<token>`-Aufruf in den Login — sofort beim Cutover | `registry.ts:133`; `routing.ts:12,71-73`; Vorbild `registry.ts:52-67` |
| `SUITE_HOST_FILES` | beide Hostnamen exakt, **reiner Hostname** ohne Protokoll/Port; die **Reihenfolge** entscheidet den Switcher-Link | ein Tippfehler im Wert ist nicht erkennbar — der Host fällt durch und die Domain zeigt still das Portal | `hosts.ts:48-63,78-95`; `routing.ts:69`; `moduleUrl.ts:19-22` |
| `SUITE_TRAEFIK_RULE` | muss bei **jedem** der beiden Cutover dieselben Hosts führen | sonst erreicht die Domain den Container nie — und der Boot bleibt fehlerfrei | `compose.yaml:53-57`; `.env.example:100-103` |

Der Modul-Key `files` ist technisch **nicht** erzwungen (kein Code-Pfad liest die Zeichenfolge; die
`.env`-Zeile ist auskommentiert). Wer ihn ändert, muss `.env.example:81,96`, `hosts.test.ts:18` und
`APP-KONSOLIDIERUNG.md` mitziehen — sonst zeigen drei Vorbelegungen ins Leere.

### Die Paritäts-Invariante für den drop-Zweig

Für den Fileshare-Zweig ist das Vorbild vollständig: `checkParity` vergleicht zwei Multisets aus
`Row`-Objekten, `assertParity` bricht mit „Import ABORTED — no cutover." ab
(`scripts/import/parity.ts:34-48,58-65`), und `feedback.ts` baut die beiden Arme aus fünf Tabellen und
trennt sie per `__table`-Tag (`scripts/import/feedback.ts:238-256,260-262`). Der drop-Zweig hat keine
zweite Tabelle — die Quelle ist ein Dateibaum (3.1). Die Invariante muss deshalb aus dem Dateisystem
gebildet werden, und zwar so, dass sie in dieselbe `Row[]`-Form passt: kein neues Parity-Primitiv,
sondern eine `dropParityView` neben den bestehenden.

**Das Quell-Multiset ist ein Manifest, kein Zählstand.** Je Eintrag aufgenommen wird
`{ __class, sha256, sizeBytes, mtimeSeconds }`. Der Inhalts-Hash ist der Schlüssel, weil er das
einzige Merkmal ist, das den Umzug unter **jeder** Variante von Entscheidung 5 überlebt: bei
Empfehlung (b) — `/data/files/<shareId>/<fileId>` ohne Dateinamenskomponente — existiert der Quellpfad
im Ziel nicht mehr. `relPath` (relativ zu `uploadDir`) und die Kategorie werden im Manifest
**mitgeführt und berichtet**, gehen aber nur unter (a)/(c) in die Projektion ein. Das ist eine
Kopplung zwischen Entscheidung 5 und dem Import-Skript, die vor dem Bau feststehen muss.
`mtimeSeconds` wird wie in `feedback.ts:171-176` auf ganze Sekunden normalisiert, sonst unterscheiden
sich die beiden Arme um Sub-Sekunden.

**Der Ziel-Arm muss ebenso benannt sein, sonst ist der Check nicht baubar.** `checkParity` braucht zwei
`Row[]` und verlangt zusätzlich `source.length === target.length` (`parity.ts:43,50`). Der Ziel-Arm
entsteht **nicht** aus den geschriebenen Zahlen, sondern aus dem geschriebenen Zustand: je importierter
Zeile wird die Zieldatei erneut gelesen, `sha256` neu gebildet und `sizeBytes` per `stat` genommen. Nur
so beweist der Check, dass die Bytes angekommen sind, und nicht bloß, dass eine Zahl kopiert wurde;
eine zusätzliche Hash-Spalte braucht es dafür nicht. `mtimeSeconds` dagegen **kann** im Ziel nicht aus
dem Dateisystem kommen — das Schreiben setzt die mtime auf jetzt. Der Wert muss deshalb beim Import in
eine Spalte (der Zeitstempel der Inbox-Zeile), und der Ziel-Arm liest ihn von dort. Das ist eine
Anforderung an das Schema der Inbox-Zeilen, keine Nebenbemerkung: für META-lose Dateien ist die
Quell-mtime die einzige Zeitquelle (3.1), sie muss also ohnehin persistiert werden.

Dass `checkParity` ein **Multiset** ist und Häufigkeiten zählt (`parity.ts:34-48`), ist hier der Kern:
dieselbe Datei in zwei Kategorien sind zwei Einträge, und die Anzahl muss beidseitig stimmen. Genau
daran scheitern die naheliegenden Invarianten „Anzahl META == Anzahl DB-Zeilen" (3.1) und
„Objektzahl == Zeilenzahl" (Falle 9): sie prüfen die Zahl ohne die Identität.

**Aufnahmezeitpunkt: nach dem Freeze, auf der Snapshot-Kopie — nicht am laufenden Baum.** Das
Runbook-Muster ist „Freeze → echter Snapshot → Volume sichern → Import mit Paritätscheck"
(`iuk-suite/CLAUDE.md:79-81`, ausgeführt in `docs/runbooks/feedback-cutover.md:115-145`). Wird das
Manifest live gezogen und der Import liest die Kopie, macht ein einziger Upload dazwischen die Parität
rot und bricht einen Cutover ab, der in Ordnung war. Zweitens hängt `mtime` daran: eine Kopie ohne `-a`
gibt allen Altdateien das Cutover-Datum (Falle 8), und für META-lose Dateien ist die mtime die einzige
Zeitquelle. Also `cp -a`/`rsync -a`, Manifest **auf der Kopie**, und der Import liest ausschließlich
dieselbe Kopie.

**Der Snapshot muss drei Orte erfassen, zwei davon relativ.** `uploadDir` ist der Host-Bind-Mount
`/srv/fuekw/drop_inbox:/uploads`; `metaDir` liegt **außerhalb** davon (`/data/meta`,
`drop/src/config.js:30-31`) und kommt aus `./data/meta:/data/meta`, die Auth-DB aus
`./data/auth:/data/auth` (`drop/docker-compose.yml:12-14`) — die beiden letzten relativ zum
Arbeitsverzeichnis des Compose-Aufrufs, das im Repo nicht steht. Ein Freeze-Schritt, der nur den
Inbox-Mount sichert, verliert lautlos jeden Hinweis, jede Absender-IP und jede Kategorie.

**Drei Klassen, per `__class` getrennt** — nach dem Muster von `__table` (`feedback.ts:238-246`), damit
strukturell gleiche Einträge verschiedener Klassen nicht kollidieren:

`payload` — geht in die Parität ein. Jede Datei unter `uploadDir[/<category>]`, die die Sidecar-Probe
nicht besteht.

`sidecar` — die Probe ist **positiv** formuliert, weil die Fehlrichtung sonst Daten kostet: `X.txt` in
`uploadDir[/<cat>]` ist Sidecar genau dann, wenn (1) `metaDir/X.json` existiert, (2) deren Feld `hint`
plus `\n` **byteweise** dem Inhalt der `.txt` entspricht und (3) deren `storedPath` auf `/X` endet. Alle
drei Merkmale entstehen in einem einzigen Schreibblock (`drop/src/app.js:352-369`). Was die Probe nicht
besteht, wird als `payload` importiert — nie verworfen. Damit ist der Filter, den Falle 7 zu Recht
verbietet („ein Filter, der alle `<name>.<ext>.txt` als Sidecar verwirft, wirft echte Uploads weg"),
durch eine Prüfung ersetzt, deren Fehlrichtung eine Textdatei zu viel ist und kein Datenverlust.
**Ob die Klasse in die Projektion eingeht, hängt an Entscheidung 14** — dieselbe Kopplung wie bei
`relPath` und Entscheidung 5: bleiben Hinweise Dateien, gehen Sidecars als eigene Klasse in das
Multiset ein; werden sie eine Spalte, hat jede Sidecar im Ziel keine Entsprechung, die Zählstände
divergieren und `assertParity` bricht einen Cutover ab, den die Spec verursacht hat und nicht die
Daten. Dann gilt: ausgeschlossen, gezählt, und der `hint`-Wert wandert in die feldweisen Stichproben.

`part-rest` — Temp-Dateien aus `app.js:318`. Der Test ist **am Ende verankert**:
`/\.part-\d+-[0-9a-f]*$/` (die Hex-Gruppe kann leer sein, `Math.random().toString(16).slice(2)`), und
er kann keinen gespeicherten Upload treffen: der Name einer gespeicherten Datei endet immer auf
`safeExt`, und aus dem Endungsteil streicht `sanitizeFilename` jedes `-` weg
(`drop/src/utils.js:8,16`: `ext.replace(/[^a-z0-9.]/g, '')`), während der Basisteil `-` behält
(`:10-15`). Ein echter Upload kann `.part-` also **mitten** im Namen tragen (`foo.part-1.jpg`), aber
niemals darauf **enden**; hat der Name gar keinen Punkt, ist `ext` leer und der Ausdruck greift schon
deshalb nicht. Die Klasse ist damit aus dem Quelltext abgegrenzt und nicht geraten (die Funktion wurde
gelesen, nicht gegen Beispielnamen ausgeführt). **Aus dem Multiset ausgeschlossen, aber gezählt und mit
Pfad aufgelistet** — kein Abbruchkriterium: es sind halbe, nicht virengeprüfte Dateien, die der Import
nicht verursacht hat, und ein Abbruch blockierte den Cutover für einen Vorzustand. Im ganzen
`drop/src/` gibt es kein `readdir` und keinen Aufräumlauf (selbst geprüft); aufgeräumt wird nur in den
drei `rm`-Pfaden (`app.js:335,343,375`). Ein Rest hat damit eine belegte Ursache: der
clamd-Protokollfehler aus 3.2, der den Prozess mitten in der `pipeline` tötet. Eine Zahl > 0 ist eine
Betreiberfrage, keine Fehlermeldung.

**META-lose Dateien und die Kategorie.** Weil der META-Block hinter `if (hint || category)` steht
(`app.js:352`), hat ein Teil des Bestands keine Metadaten; und weil `metaDir` flach ist und der
Metadateiname nur `path.basename(finalPath)` benutzt (`app.js:353-354`), ist der Join
`metaDir/<basename>.json → Datei` bei gleichnamigen Dateien in mehreren Kategorien nicht eindeutig. Für
die Invariante folgt daraus die Umkehrung dessen, was ein naiver Import tut: **maßgeblich für die
Kategorie ist der Verzeichnisname, nicht das META-Feld `category`.** Das META-Feld wird nur übernommen,
wenn `storedPath` genau diese Datei bestätigt; sonst gilt der Eintrag als nicht zuordenbar und wird mit
Pfad berichtet. Für `hint`/`ip`/`timestamp` gibt es dann keinen Ersatz — sie fehlen, und das ist der
belegte Ausgangszustand, kein Importfehler.

**Der eine Fall, den das Manifest nur melden kann.** Die META-Größe ist ein **serverseitig gemessener**
Wert: `bytes` zählt die Chunks des Uploadstreams und landet als `size` in der META
(`app.js:320-323,360`) — anders als bei easy-filesharing (siehe den folgenden Unterabschnitt). Für
einen überschriebenen echten Upload (3.1) heißt das: die Datei auf der Platte trägt den Hinweistext
(**≤ 500 Zeichen, nicht ≤ 500 Byte** — `UPLOAD_HINT_MAX_LENGTH = 500` wird mit
`String(part.value ?? '').slice(0, UPLOAD_HINT_MAX_LENGTH)` durchgesetzt, `app.js:21,299,366-369`, und
`slice` schneidet **UTF-16-Code-Units**: 500 Umlaute sind in UTF-8 rund 1000 Byte, 500 Emoji rund 2000.
Dieselbe Klasse wie der Befund im qr-Modul, wo eine Längenprüfung gegen Code-Units statt Bytes lief
[`bb45f39`] — hier ohne Schaden, weil die Zahl nur eine Obergrenze für einen Bericht ist, aber wer sie
als Bytegrenze in eine Spaltenbreite oder einen Puffer übernimmt, rechnet um den Faktor 4 falsch),
ihre eigene META nennt aber noch
die ursprüngliche Größe. Ein `size`-Vergleich Manifest gegen META ist damit ein **Detektor** für diesen
Fall. Reparieren kann ihn niemand — die Bytes sind weg. Er gehört in den Manifest-Bericht und vor die
Freigabe des Cutovers. (Herleitung aus dem Code; dass der Fall unter `/srv/fuekw/drop_inbox` real
vorkommt, ist nicht gemessen.)

Ebenfalls nur berichtbar: ist die META durch einen späteren gleichnamigen Upload überschrieben worden,
scheitert die Sidecar-Probe und eine echte Sidecar wird als Anhang importiert. Ein beschränkter Fehler
in die harmlose Richtung — eine Textdatei von höchstens 500 Zeichen zu viel — und deshalb eine gezählte Klasse im
Bericht, kein Abbruch.

**Ein roter Report muss lesbar sein.** `missingInTarget`/`missingInSource` führen **nur Checksummen**
(`parity.ts:9-10,47-48,53-54`). Weil `relPath` unter Entscheidung 5 (b) nicht in der Projektion steckt,
bekommt der Betreiber im Abbruchfall eine Liste nackter Hashes und findet die Datei nicht. Das Manifest
muss deshalb eine Seitenabbildung `sha256 → [relPath …]` behalten, und das Import-Skript muss zu jedem
Eintrag beider Listen die Pfade ausgeben. Ohne das ist „Import ABORTED — no cutover." um zwei Uhr
nachts nicht handlungsfähig.

**Was diese Parität nicht beweist — die Stichproben, die dazugehören.** Der Quell-Arm ist hier ein
Dateisystem-Scan, nicht dieselbe Mapping-Funktion wie der Ziel-Arm; die Byte-Identität ist damit echtes
unabhängiges Beweismaterial, und der Vorbehalt aus `feedback.ts:178-181` („beide Arme laufen durch
dieselben `toNew*`-Funktionen") gilt hier schwächer. Dafür öffnet sich eine neue Lücke: `hint`,
`category`, `ip` und der Zeitstempel gehen in die Byte-Projektion **gar nicht** ein. Genau sie müssen
die feldweisen Stichproben abdecken (`iuk-suite/CLAUDE.md:83-85`). Die Auswahl muss deterministisch und
wiederholbar sein, weil das Runbook sie erneut fährt, und sie deckt die Randklassen ab statt einer
Zufallsstichprobe:

- jede `.txt` im Baum — Sidecar-Probe bestanden **und** nicht bestanden,
- jeden Namen mit Kollisionssuffix `_1` … (`drop/src/utils.js:35-51`); die Serie ist die einzige
  Reihenfolgeinformation einer Kollision,
- jede Datei, deren META-`size` von der Manifest-Größe abweicht,
- die älteste und die jüngste Datei nach mtime,
- eine Datei je real existierender Kategorie (welche das sind, weiß nur der Betreiber — Abschnitt 8),
- eine META-lose Datei.

### Der Fileshare-Zweig: `size` und `total_size` sind Client-Selbstauskunft

Die Größenprüfung von `easy-filesharing` greift ausschließlich gegen die vom **Client gemeldete** Zahl:
`app/api/upload/init/route.ts:40-48` vergleicht `file.size` aus dem JSON-Body gegen
`Number(process.env.MAX_FILE_SIZE ?? 524288000)`, und der Wert kommt aus
`app/(admin)/shares/new/use-chunked-upload.ts:114-118` (`f.size` des `File`-Objekts). Dieselbe
gemeldete Zahl wird in `shares.total_size` summiert (`init/route.ts:38,60`) und je Datei nach
`share_files.size` geschrieben (`:75`); beide Spalten sind `notNull` (`lib/db/schema.ts:13,28`). Die
Bytes selbst laufen über eine andere Route, die **keine** Größe prüft
(`app/api/upload/chunk/route.ts:11-25`: drei Header lesen, `arrayBuffer()`, an `uploadPart`
weitergeben), und `app/api/upload/complete/route.ts` schreibt keine gemessene Größe zurück.

Für den Import heißt das: **ein Abgleich „Bytegröße des Objekts == `size`-Spalte" ist keine
Paritätsaussage.** Er kann aus einem belegten, harmlosen Grund scheitern. Die DB-Zeilen entstehen in
`init`, **bevor** ein Byte angekommen ist (`init/route.ts:70-77`); der Chunk-Upload ist eine eigene,
spätere Anfrage, die im Client wirft, wenn sie fehlschlägt (`use-chunked-upload.ts:63-65`), und
`abortMultipartUpload` hat keinen Aufrufer — die Funktion existiert nur als Definition
(`lib/s3/operations.ts:53`; in `app/`, `lib/` und `components/` kein Aufruf, selbst geprüft). Eine
Zeile mit vollständiger gemeldeter Größe und ohne fertiges Objekt ist damit **Regelbetrieb**, nicht
Ausnahme. Wer aus so einer Abweichung auf einen Importfehler schließt, sucht am falschen Ort.

Der Blob-Umzug bleibt deshalb ein eigener, verifizierbarer Schritt (Entscheidung 5), aber sein
Abbruchkriterium ist **nicht** die Größengleichheit gegen die DB. Prüfbar ist: (1) je
`share_files`-Zeile existiert im Ziel ein Objekt, oder die Zeile ist als „ohne Blob" berichtet; (2) je
Objekt existiert eine Zeile, oder es ist als Waise berichtet; (3) Quell- und Ziel-SHA-256 je Objekt
sind gleich. Die Abweichung gegen `size` ist eine **berichtete Kennzahl**, kein Gate — wie viele Fälle
es gibt, weiß nur der Server (Abschnitt 8, Punkt 8). Ob die Spalte beim Umzug korrigiert wird, ist eine
eigene Entscheidung (Entscheidung 20).

---

## 6. Fallen, die kein Gate findet

Build, Typecheck, Vitest und Playwright sind für diese Klasse blind — teils strukturell, teils weil
der eigene Client die auslösende Eingabe nie erzeugt.

**Import**

1. **Positionsbasierter Import.** `limit_reached_at` steht in jeder DB, die 0000→0001 durchlaufen hat,
   physisch als letzte Spalte, im Schema an 9. Position. Drizzle adressiert über Namen — die physische
   Reihenfolge ist für Typecheck und Build prinzipiell unsichtbar, und die verschobenen Werte sind
   alle typplausibel. `total_size` enthält danach einen Zeitstempel, und der Import läuft grün durch.
2. **Millisekunden statt Sekunden.** Alle Anwendungsspalten sind Sekunden — die mitgelieferte
   `__drizzle_migrations.created_at` derselben Datei ist **Millisekunden** (gemessen:
   1775845795002 usw., identisch mit den `when`-Werten in `_journal.json:8,15,22`). Wer sich beim
   Schreiben des Skripts an der falschen Spalte orientiert, multipliziert jedes Ablaufdatum. Beides sind
   Integer in einer INTEGER-Spalte; es gibt keine Einheit im Typ, und der Paritätscheck ist grün.
3. **Die Migrationstabelle mitkopieren.** Ihre drei Hashes passen nur zu genau diesen drei Dateien; im
   Ziel-Repo laufen die eigenen Migrationen dann entweder nicht oder doppelt. Zusätzlich ist sie als
   `id SERIAL PRIMARY KEY` deklariert — kein SQLite-Typ, alle drei Zeilen haben `id = NULL` (gemessen).
4. **Nicht-ganzzahlige Werte in INTEGER-Spalten.** SQLite konvertiert nur verlustfrei; die API
   validiert nichts. Ein Port mit Zod `.int()` bricht mitten im Batch ab, Postgres `integer` rundet
   still. **Vor** dem Import muss `select count(*) … where typeof(spalte) <> 'integer'` gelaufen sein.
5. **`foreign_keys = ON` ist eine Verbindungs-Eigenschaft** (`lib/db/index.ts:14`) und in SQLite
   standardmäßig aus. Das Cleanup verlässt sich für `download_logs` allein auf `ON DELETE cascade`
   (`cleanup/route.ts:35-36` löscht `share_files` und `shares` explizit, `download_logs` nie). Ein
   Skript, das die Datei ohne dieses Pragma öffnet, erzeugt Waisen oder lässt CASCADE ausfallen.
6. **Der Import über `metaDir/*.json` erfasst nur die Teilmenge mit Metadaten** (Abschnitt 3.1) — und
   der Basename-Join weist bei gleichnamigen Dateien in mehreren Kategorien die falsche Kategorie und
   den falschen Hinweis zu. Der Join geht formal auf.
7. **`*.part-*`-Reste und Sidecars im selben Verzeichnis.** Temp-Dateien
   `<name>.part-<Date.now()>-<hex>` (`drop/src/app.js:318`) werden nur in den catch-/AV-Pfaden
   aufgeräumt, es gibt keinen Startup-Cleanup. Ein naives `readdir` importiert halbe, nicht
   virengeprüfte Dateien als Anhänge — und ein Filter, der alle `<name>.<ext>.txt` als Sidecar
   verwirft, wirft echte Uploads weg.
8. **`cp` statt `rsync -a`.** Für Dateien ohne META ist die mtime die einzige Zeitquelle; eine Kopie
   ohne Zeitstempel-Erhalt gibt allen Altdateien das Cutover-Datum. Formal plausible Werte, kein Test
   sieht es.
9. **Die Blob-Bestände sind in beide Richtungen unvollständig.** `deletePrefix` ohne Paginierung
   hinterlässt Objekte ohne DB-Zeile; `abortMultipartUpload` ohne Aufrufer hinterlässt DB-Zeilen ohne
   fertiges Objekt. Ein Migrationsskript, das eine 1:1-Entsprechung annimmt, bricht ab; eine
   Plausibilitätsprüfung „Objektzahl == Zeilenzahl" scheitert immer.
10. **`size` und `total_size` sind nie gemessen worden.** Beide Spalten tragen die vom Client
    gemeldete Zahl (`init/route.ts:38,60,75`, Quelle `use-chunked-upload.ts:114-118`); die Route, über
    die die Bytes tatsächlich laufen, prüft keine Größe (`chunk/route.ts:11-25`), und
    `complete/route.ts` schreibt nichts zurück. Ein Import- oder Umzugsskript, das
    „Bytegröße == `size`" als Konsistenzbedingung benutzt, hat ein Abbruchkriterium, das an
    Produktionsdaten aus harmlosen Gründen rot wird — allen voran an Zeilen, deren Upload nie fertig
    wurde: `init` schreibt sie vor dem ersten Byte (`:70-77`), und `abortMultipartUpload` hat keinen
    Aufrufer (`lib/s3/operations.ts:53`). Dieselben Zahlen zeigt die Alt-Oberfläche
    (`shares-table.tsx:146`, `stats-cards.tsx:84`, `folder-view.tsx:31`) — korrigiert man sie beim
    Import, ändern sich sichtbare Werte, und die feldweise Stichprobe gegen die Alt-App muss davon
    wissen (Entscheidung 20).

**Grenzverletzungen Server/Client**

11. **Der bcrypt-Hash überquert die Grenze.** `dashboard/page.tsx:13-16,57-64,94` →
    `shares-table.tsx:1,51`. Die Bearbeiten-Seite macht es richtig (`edit/page.tsx:34`) — ein
    Copy-Paste-Port erbt die falsche Variante. Typecheck ist zufrieden, `build` findet nichts.
12. **Die Dateiliste eines passwortgeschützten Shares steckt im RSC-Payload** (Abschnitt 2.3).
    Playwright sieht es nur, wenn ein Test den rohen HTTP-Body inspiziert statt den sichtbaren DOM;
    Vitest kann es strukturell nicht sehen, weil `"use client"` dort ein wirkungsloser String ist.
13. **Ein `WERT` aus einem `"use client"`-Modul in einer Server Component ergibt HTTP 500**
    (`docs/design/README.md:87-103`). Bei einem Upload-Modul ist die Chunk-Größe oder die
    MIME-Allowlist genau der naheliegende Kandidat. Werte für Server Components gehören in `_lib/`.
14. **Compound-Zugriff auf antd in einer Server Component ergibt HTTP 500** — und `Upload`,
    `Descriptions.Item`, `Form.Item`, `List.Item` sind bei einer Datei-Verwaltung die erste Wahl. Die
    Suite umgeht es per Deep-Import (`core/shell/MinimalShell.tsx:1-6`).

**Routing und Konfiguration**

15. **Eine Route auf einem PASSTHROUGH-Pfad ist tot** (Abschnitt 4.3) — kein Fehler, kein Log, und die
    Middleware läuft in keinem Gate.
16. **Die API-Routen am falschen Ort.** Liegen sie unter `src/app/api/` statt
    `src/app/m/files/api/`, zielt der Host-Rewrite auf einen Pfad, an dem nichts liegt: 404 auf jedem
    Download-Link. Beide Ablageorte sind gültige Next-Routen und bauen fehlerfrei.
17. **Der Host im gedruckten Code.** Bei zwei Hosts liefert `resolveHost(headers)` den Host, auf dem
    der **Erzeuger gerade sitzt**. Ein Share-Link, erzeugt während man auf der Inbox-Domain arbeitet,
    trägt die Inbox-Domain — er funktioniert (beide Hosts erreichen dasselbe Modul), sieht richtig aus
    und bricht erst, wenn ein Host abgeschaltet wird. Bei `feedback` mit einem Host war das unmöglich.
    Und **keine Prüfung kennt die Rolle eines Hosts:** `moduleUrl(key)` nimmt schlicht den ersten
    Eintrag (`core/shell/moduleUrl.ts:19-22`), `validateHostConfig` prüft Syntax und Doppelvergabe
    (`core/hosts.ts:65-99`) — nie, welcher Host wofür steht. Dazu ist die Klasse in Dev und E2E
    unsichtbar: dort leitet `moduleUrl` einen einzigen `<key>.localtest.me` ab (`:24-26`), es gibt also
    gar keinen zweiten Host, unter dem ein Test daneben greifen könnte. Umgekehrt bleibt `resolveHost`
    für das **Bedienen** richtig — beide Hosts müssen beide Pfade beantworten; falsch ist es nur für
    das **Erzeugen** (Entscheidung 22).
18. **`SUITE_HOST_*` leer heißt „keine Prod-Domain", `SUITE_ACCESS_GROUP_*` leer ist ein
    Konfigurationsfehler, der den Boot abbricht** (`hosts.ts:33-38` gegen `groups.ts:44-71,120-143`).
    Die Asymmetrie ist die Falle, nicht die Prüfung.
19. **`validateHostConfig` prüft die Doppelvergabe nur gegen Env-Hosts** (`hosts.ts:80` liest
    `envHostsFor`, nicht `prodHostsFor`). Ein Env-Host, der den Registry-Fallback eines anderen Moduls
    trifft, wird nicht gemeldet; `moduleForHost` entscheidet dann nach Deklarationsreihenfolge, und
    `portal` steht an erster Stelle.
20. **`SUITE_HOST_*` gesetzt, Traefik-Regel nicht mitgewachsen.** Der Container bootet fehlerfrei, die
    Domain erreicht ihn nur nie. Beide Dateien warnen in Prosa, keine Prüfung koppelt sie.
21. **`seedAllModules` ist nicht testgekoppelt** (`core/bootstrap.ts:52-56`) — ein vergessener
    `seedFiles`-Aufruf sieht aus wie ein Datenproblem. Und ein unbekannter `icon`-Name fällt still auf
    `AppstoreOutlined` zurück (`SuiteNav.tsx:261`).
22. **Zwei Namen, zwei Einheiten, eine Obergrenze.** `easy-filesharing` führt `MAX_FILE_SIZE` in
    **Bytes** (`.env:16` = `524288000`, dort mit dem Kommentar `# 500 MB`; `.env.example:24`), gelesen
    als `Number(process.env.MAX_FILE_SIZE ?? 524288000)` an zwei Stellen
    (`app/api/upload/init/route.ts:40`, `app/(admin)/shares/new/page.tsx:4`). `drop` führt
    `MAX_FILE_SIZE_MB` in **Megabytes** (`.env.example:7` = `500`, `src/config.js:32`) und rechnet
    erst im Code um: `config.maxFileSizeMb * 1024 * 1024` (`src/app.js:427`, dieselbe Rechnung an
    `:275-276` für den Client). Gemessen: `500 * 1024 * 1024 === 524288000` — **beide Systeme
    erzwingen heute exakt dieselbe Grenze von 500 MiB.** Genau deshalb sieht die Zusammenlegung wie
    eine Nulloperation aus. Überlebt der drop-Name mit dem Fileshare-Wert, ist die Grenze
    524.288.000 MB, also praktisch aufgehoben; überlebt der Fileshare-Name mit dem drop-Wert, ist sie
    500 **Byte** und jeder Upload wird abgelehnt. Beide Werte sind `number`, beide Zuweisungen
    typkorrekt — Build, Typecheck und Vitest können den Unterschied nicht sehen, und der Kommentar
    `# 500 MB` neben einem MiB-Wert steht schon heute genau dort, wo ein Portierer nachliest.

    **Es sind nicht drei, sondern vier Größen an vier Orten in drei Einheiten** — und sie bilden zwei
    Paare, die sich als „dieselbe Zahl" lesen und keine sind:

    | Größe | Wert | Einheit | Ort |
    |---|---|---|---|
    | `MAX_FILE_SIZE` (easy-filesharing) | 524.288.000 | Byte (= 500 **MiB**, kommentiert als „500 MB") | `.env:16`, gelesen in `init/route.ts:40` |
    | `MAX_FILE_SIZE_MB` (drop) | 500 | **MB** | `.env.example:7` |
    | clamd-Dateigrenze (Entscheidung 16) | 104.857.600 | Byte (= 100 **MiB**) | im Sidecar, gemessen |
    | Cloudflare Free (Entscheidung 6) | 100.000.000 | Byte (= 100 **MB**) | Plan-Eigenschaft der Zone, nirgends im Repo |

    Beide „500" unterscheiden sich um den Faktor 1,048576; beide „100" um **4.857.600 Byte**. Ein
    Upload zwischen 100 MB und 100 MiB passiert Cloudflare nicht, wäre für clamd aber noch scanbar —
    wer die Grenzen gleichsetzt, sucht den Fehler in der falschen Schicht. Die Einheit gehört deshalb
    in jeden Namen, nicht in einen Kommentar (Entscheidung 19).

**Laufzeitverhalten**

23. **Der 207-Multi-Status.** Ein Upload kann erfolgreich sein, obwohl der Status nicht 200 ist — und
    umgekehrt kann 207 mit leerer `uploaded`-Liste kommen, während die Datei liegt (Abschnitt 3.2).
    Für eine anonyme Inbox ohne Rückkanal bemerkt das niemand außer dem Melder, der ein zweites Mal
    hochlädt.
24. **Die Feldreihenfolge im Multipart-Body entscheidet über Kategorie und Hinweis.** `drop` verarbeitet
    Parts sequenziell (`app.js:296-370`) und benutzt `hint`/`category` in dem Zustand, den sie beim
    Erreichen des Dateiteils haben. Gemessen: kommen die Felder **nach** der Datei, antwortet der Server
    200, die Datei landet im Wurzelverzeichnis, und es wird weder Notiz noch META geschrieben. Innerhalb
    eines Requests sind die Werte damit **positionsgebunden**, nicht requestgebunden — ein Parser, der
    das FormData in `{hint, category, files[]}` überführt (der Next-Normalfall), ändert die Semantik
    still auf „letzter Wert gilt für alle".
25. **Der Download-Zähler unter Parallelität** (Abschnitt 2.3): sequenzielle Tests sind immer grün, und
    die atomare SQL-Variante daneben lässt den JS-Teil unverdächtig aussehen.
26. **`GRACE_PERIOD_HOURS` sieht in drei Auslieferungsrouten wie eine wirksame Zugriffsregel aus und
    ist es in der Regel nicht** — außer im Pfad aus Abschnitt 2.3. Ein leeres `if` mit erklärendem
    Kommentar (`download/[id]/route.ts:40-47`, `preview:54-60`) kompiliert fehlerfrei und wird von
    ESLint nicht als toter Code gemeldet. Wer die Spec aus den Kommentaren rekonstruiert, spezifiziert
    ein Verhalten, das es nie gab.
27. **Der roh gespeicherte Dateiname wird auf einem Dateisystem zu Pfadsemantik.** Auf S3 sind `..`
    und `/` gewöhnliche Key-Bytes; `path.join("/data/files", key)` verlässt bei `..`-Segmenten die
    Wurzel. Derselbe Code ist auf S3 korrekt und auf FS unsicher — kein statisches Werkzeug kennt
    diesen Unterschied, und das Altsystem kann es nicht zeigen, weil es kein Dateisystem benutzt.
    Dazu FS-eigene Grenzen, die S3 nicht kennt: 255 Byte pro Pfadkomponente, NUL-Bytes, und
    Case-Insensitivität auf macOS gegen Case-Sensitivität auf Linux.
28. **Der Zielschlüssel kommt vom Browser** (`chunk/route.ts:11,23`, `complete/route.ts:12,25`) — auf
    einem Dateisystem heißt das „schreibe an jede Stelle, die der Prozess erreicht". Der Typ ist
    `string`, der Wert syntaktisch immer gültig; ein Test müsste bewusst einen bösartigen Key senden.
29. **`e2e`-Zustand vom Seed erben.** Alle Playwright-Dateien teilen eine DB, `workers: 1`, in
    Pfadreihenfolge (`playwright.config.ts:8,35`; `docs/design/README.md:214-220`). Bei `files`
    verschärft: ein Upload-Test hinterlässt zusätzlich Blobs, die kein `rm -rf ./.data/e2e` erfasst,
    wenn sie außerhalb von `DATA_DIR` liegen.
30. **Ein Vitest über responsive Regeln kann nicht messen, was er behauptet** — jsdom wertet Media
    Queries nicht aus, der grüne Balken ist dann eine Lüge (`docs/design/README.md:199-212`).
31. **`created_by` gegen `session.user.id` zu vergleichen trifft nie — und der Dev-Login legt die
    falsche Reparatur nahe.** Links steht eine E-Mail-Adresse (`init/route.ts:61`), rechts der
    OIDC-`sub` (`core/auth/config.ts:171-172`). Beide sind `string`, der Vergleich ist typkorrekt und
    immer `false`: eine Ownership-**Filterung** zeigt dann null Shares, ein Ownership-**Guard** sperrt
    jeden aus — beides sieht nach einem Datenproblem aus, nicht nach einem Vergleichsfehler.
    Verschärfend: beim Dev-Login ist `session.user.id` gleich `dev:<E-Mail>`
    (`core/auth/config.ts:62`), der Vergleich also *fast* richtig. **Herleitung, nicht gemessen:** wer
    daraufhin das Präfix abschneidet, hat einen Vergleich, der lokal und in E2E trifft und in
    Produktion gegen eine UUID läuft. Das ist derselbe Mechanismus, an dem die `sub`-Verwechslung in
    Phase 3 vorbeikam — „was nur der echte OIDC-Weg berührt, kann der Dev-Login nicht bezeugen", die
    E2E-Suite blieb 63/63 grün (Entscheidungs-Log 2026-07-28, `KONSOLIDIERUNG-PROGRESS.md`, Entscheidungs-Log 2026-07-28).

---

## 7. Die zweiundzwanzig Entscheidungen

### 1. Ein Modul mit zwei Hosts — oder zwei Module?

**Was sich ändert:** Zahl der Registry-Zeilen, `_db/`-Ordner, `MODULE_MIGRATIONS`-Einträge,
Dockerfile-COPY-Zeilen, `SUITE_*`-Variablen, Gruppen-Namensräume, Cutover-Runbooks und PWA-Manifeste.

**Optionen:** (a) ein Modul `files`, zwei Hosts in `SUITE_HOST_FILES`; (b) zwei Module `files` +
`drop` mit gemeinsamem Blob-/Audit-Kern in `core`; (c) ein Modul, ein Host, Inbox als Pfad darunter.

**Empfehlung: (a).** (c) ist **ausgeschlossen**, nicht nur schlechter: `routing.ts:78` reicht den Pfad
wörtlich durch, ein Präfix ändert also die verteilten `/u/<token>`-Links und verstößt gegen die harte
Projektregel. (b) gewinnt bei Cutover-Unabhängigkeit, PWA und Switcher, scheitert aber an der
`core`-Regel: der gemeinsame Kern hätte heute nur deshalb zwei Nutznießer, weil man ihn geteilt hat
(`docs/design/README.md:23-33` verlangt einen zweiten, **heute belegbaren**). (a) ist die dokumentierte
Absicht — `.env.example:81` nennt den Fall wörtlich, `hosts.test.ts:17-21` testet ihn mit genau diesem
Key. Der Preis ist bekannt und muss in die Spec: ein Gruppen-Namensraum, ein Switcher-Eintrag,
ein PWA-Namensraum, host-gleiche Navigation, und die `/`-Kollision aus Abschnitt 4.3 muss modul-intern
gelöst werden.

### 2. Woran erkennt das Modul den Host, und wie oft?

**Was sich ändert:** ob `/` auf beiden Domains dasselbe zeigt, ob die Modulnavigation host-abhängig
ist, ob das Modul-Layout dynamisch wird (`headers()` in einem Layout hat in der Suite **keinen**
Präzedenzfall), und wie viele Stellen die Host-Rolle unabhängig herleiten.

**Optionen:** (a) **eine** Funktion `_lib/hostRolle(headers): "shares" | "inbox"`, alle Aufrufer gehen
über sie; (b) kein Layout-Zugriff — die Rolle nur dort lesen, wo sie gebraucht wird, Navigation
host-gleich; (c) Route-Groups `(shares)/` und `(inbox)/` — trennt die Gestaltung, löst die Host-Frage
nicht, weil `/` nur einmal existiert.

**Empfehlung: (a) plus die ausdrückliche Festlegung, ob das Layout sie liest.** Eine zweite Auflösung
ist genau die Stelle, an der beide auseinanderlaufen — dieselbe Begründung, die im Kommentar an
`resolveHost` steht. Liest das Layout sie, ist das der erste `headers()`-Aufruf in einem Suite-Layout
und braucht eine eigene Messung (rendert `/` auf beiden Hosts richtig, und was macht es mit dem
Caching?). Liest es sie nicht, ist die Navigation host-gleich — und das gehört als bewusste
Einschränkung in die Spec, nicht als Versehen.

### 3. Auth-Modell: wer darf was, auf welchem Host?

**Was sich ändert:** der Registry-Eintrag, die Zahl der SSO-Gruppen, und ob der Verwaltungsbereich auf
beiden Domains erreichbar ist.

**Belegte Ausgangslage:** `requiresAuth: false` ist **zwingend** (sonst laufen `/s/<id>` und
`/u/<token>` in den Login), und damit liest `canAccess` `requiredGroups` nie (`registry.ts:133`) — das
Gating muss modul-intern nachgezogen werden. Es gibt genau **ein** `SUITE_ACCESS_GROUP_FILES` und
**ein** `SUITE_ADMIN_GROUP_FILES` für beide Domains. Heute prüft `easy-filesharing` eine Gruppe
(`OIDC_ADMIN_GROUP`, Fallback `fileshare-admin`, `lib/auth/config.ts:44,54`) und filtert das Dashboard
nicht nach `created_by`; `drop` prüft **nur die Existenz** einer Session.

**Optionen:** (a) eine Modul-Admin-Gruppe, alle sehen alles (Alt-Verhalten beider Apps); (b) getrennte
Rechte für Shares-Verwaltung und Inbox-/Token-Verwaltung, modul-intern durchgesetzt; (c) Ownership
über `created_by`.

**Empfehlung: (a) mit `isModuleAdmin` aus `core/groups`** und dem `feedback`-Backstop als Muster
(`_lib/requireFeedbackAccess.ts`). Der Betreiber ist eine Person; (c) ist für Altdaten aus `drop`
ohnehin unmöglich (keine Datei ist einem Benutzer zuzuordnen). Zwei Dinge müssen trotzdem in die Spec:
`session.user.isAdmin` ist **nicht** das Modulrecht (ein wörtlich portiertes
`!session?.user?.isAdmin` prüft im Ziel etwas anderes und ist typkorrekt), und die Audit-Log-Ansicht
braucht ein **härteres** Gating als heute — die IDOR-Route aus Abschnitt 2.3 darf nicht mitkommen.
Beim Backstop nicht die Vorlage abschreiben: `requireFeedbackAccess.ts:35` kodiert den internen Pfad
als `callbackUrl`; bei zwei Hosts muss der aus `resolveHost(headers)` gebildet werden.

### 4. Wird der Passwortschutz serverseitig durchgesetzt?

**Was sich ändert:** ein zusätzlicher Mechanismus (signiertes, share-gebundenes HttpOnly-Cookie), ein
zusätzlicher Zustand, und geändertes Verhalten für jeden, der heute eine nackte
`/api/download/…`-URL benutzt. Bleibt es wie heute, steht in der Spec ein Sicherheitsversprechen, das
das Modul nicht hält — und jemand „repariert" es später versehentlich.

**Optionen:** (a) 1:1 übernehmen und ausdrücklich als „Hinweis, kein Schutz" dokumentieren;
(b) serverseitig erzwingen per Cookie nach erfolgreichem Verify, `PasswordGate` wird Server-Komponente
(damit das Markup erst nach dem Entsperren entsteht); (c) erzwingen, aber Bestandslinks bis zum
jeweiligen `expiresAt` weiter zulassen.

**Empfehlung: (b), plus Rate-Limit auf `/verify`.** Der Pfad `/s/<id>` bleibt unverändert, die
1:1-Regel ist also gewahrt; nur direkt kopierte API-URLs verlieren ihre Wirkung, und die waren nie ein
Verteilweg. Vorher muss der Betreiber bestätigen, dass keine nackten Download-Links verteilt wurden —
falls unklar, (c), weil `expiresAt` bei Altdaten ohnehin ≤ `MAX_EXPIRY_DAYS` in der Zukunft liegt und
die Übergangsfrist von sich aus ausläuft.

### 5. Storage-Layout: Volume oder MinIO — und wie sieht der Pfad aus?

**Was sich ändert:** Volume-Layout, Backup, Health-Aussage, Download-Implementierung, das
Migrationsskript, und ob die `s3_key`-Spalte 1:1 übernommen oder umgeschrieben wird. Die
Phase-4-Vorgabe lautet „S3/MinIO → Volume" (`APP-KONSOLIDIERUNG.md:145`).

**Optionen für den Pfad:** (a) `s3_key` 1:1 als relativen FS-Pfad, plus `resolve`+Präfix-Guard beim
Lesen **und** Schreiben; (b) `/data/files/<shareId>/<fileId>` **ohne** Dateiname, `s3_key` beim Import
umgeschrieben, `filename` bleibt Anzeige-/Header-/ZIP-Wert; (c) 1:1, aber die Dateinamenskomponente
beim Import normalisieren und zurückschreiben.

**Empfehlung: (b), und die Ablage hinter genau einer Modul-Funktion.** `filename` wird nur für Anzeige
(`file-view.tsx:31`), `Content-Disposition` (`download:105`) und den ZIP-Eintragsnamen (`zip:112`)
gebraucht — für keines davon muss er im Pfad stehen. Damit verschwindet die gesamte Traversal-Klasse
**strukturell** statt per Guard, und dieselbe Entscheidung räumt drops Sidecar-Überschreiben und die
Namenskollisionen mit. Preis: der Blob-Umzug ist ein eigener, verifizierbarer Cutover-Schritt mit
Byte- und Objektzählung — DB-Parität sagt darüber nichts. Was dieser Schritt prüfen kann und was nicht,
steht in Abschnitt 5 („Der Fileshare-Zweig").

**Eine Kopplung, die mit dieser Entscheidung mitfällt:** die Wahl bestimmt den Schlüssel des
drop-Paritätschecks. Unter (b) existiert der Quellpfad im Ziel nicht mehr, also kann `relPath` nicht
Teil der Paritäts-Projektion sein — dann ist der Inhalts-Hash das einzige Bindeglied zwischen
Manifest-Eintrag und importierter Datei. Unter (a)/(c) darf `relPath` mit hinein. Wer das erst beim
Schreiben des Import-Skripts merkt, hat die Invariante schon gebaut (Abschnitt 5, „Die
Paritäts-Invariante für den drop-Zweig").

Drei Dinge hängen unmittelbar daran und gehören in dieselbe Entscheidung: `/data/files/` liegt im
**selben** Volume wie `portal.db`, `qr.db`, `feedback.db` und `files.db` (`compose.yaml:40-41`) —
entweder ein eigenes Volume oder eine harte Gesamtgrenze; `scripts/backup.sh` muss erweitert werden
(sonst sind die Metadaten gesichert und die Dateien nicht, mit Erfolgsmeldung); und
`/api/health/files` braucht neben `SELECT 1` eine Aussage über die Ablage (beschreibbar? Restplatz?),
sonst meldet „gesund" ein Modul, dessen Dateien unerreichbar sind. Der bestehende Docker-Healthcheck
prüft nur `/api/health/portal`.

### 6. Upload-Transport: Chunk-Route-Handler oder Server Action?

**Was sich ändert:** ob eine Body-Grenze nötig wird, wie viel Client-JS die Upload-Ansicht braucht, und
ob der Rewrite-Proxy still kappt.

**Belegte Ausgangslage:** die Suite hat für **keinen** der Wege ein Datei-Vorbild. Es gibt zwei
stillschweigende Defaults: Server Actions 1 MB mit HTTP 413, und der Next-Proxy 10 MiB **ohne** Fehler
(nur `console.warn`, siehe 4.3). `drop` lädt heute **eine** Datei in **einer** Anfrage, begrenzt durch
einen einzigen Konfigurationswert: `MAX_FILE_SIZE_MB` (`drop/src/config.js:32`) wird zu
`maxFileSizeBytes` und setzt sowohl `limits.fileSize` des Multipart-Parsers als auch — 1 MiB darüber —
Fastifys `bodyLimit` (`drop/src/app.js:427,436,446-451`). **Die 500 sind keine gemessene
Betriebszahl:** sie stehen in `drop/.env.example:7` und als Code-Default in `config.js:32`; der real
gesetzte Wert liegt in der Server-`.env` und ist als Runbook-Eingabe geführt (Abschnitt 8). Und auf den
heutigen Hosts ist die Zahl ohnehin nicht die bindende Grenze: alle `*.iuk-ue.de` laufen über **eine**
Cloudflare-Zone im Free-Plan, die den Request-Body bei **100 MB** kappt (**Plan-Eigenschaft der Zone —
die Zonenlage ist Betreiberangabe, die Grenze selbst ist weder am Code noch am Server belegt; sie steht
nirgends im Repo. Runbook-Messung: ein ~150-MB-Upload gegen `drop.iuk-ue.de`**) — bei einem
Ein-Request-Upload ist das die tatsächliche Obergrenze
und der Fehler kommt vom Proxy, nicht aus dem Container; ein chunked Upload umgeht es, weil jeder Chunk
eine eigene Anfrage ist. Für diese Entscheidung heißt das: mit einer Bandbreite arbeiten, die Zahl beim
Cutover einsetzen — und die kleinste der drei Grenzen (Cloudflare, Next-Proxy, App) bestimmt, was der
Nutzer erlebt.

**Ein Einwand, der sich beim Nachsehen auflöst.** Ein Chunk-Weg braucht JavaScript, und die Inbox ist
öffentlich — im Modul `feedback` gilt für die öffentliche Ansicht ausdrücklich „ohne JS vollständig
bedienbar" (e2e-belegt), also läge der Verdacht nahe, dass chunked diese Zusage bricht. Für `drop` ist
es **kein** Verlust: `/u/:token` liefert heute schon `index.html` einer React-SPA
(`drop/src/app.js:623`, Einstieg `drop/web/src/main.tsx`) — die Inbox war nie ohne JS bedienbar. Wer die
feedback-Zusage auf sie ausdehnen will, fordert damit etwas **Neues**; das ist eine eigene Entscheidung
und keine Nebenbedingung dieses Transports. (Umgekehrt gilt: eine `<form>`-Rückfallebene wäre auf den
heutigen Hosts ohnehin bei 100 MB gedeckelt.)

**Optionen:** (a) das Alt-Muster 1:1 (`init`/`chunk`/`complete`, `arrayBuffer()`, Metadaten in eigenen
Headern, 5-MiB-Chunks); (b) ein streamender PUT pro Datei mit Zwischendatei und atomarem `rename`;
(c) gemischt: Metadaten/Anlegen per Server Action, Bytes per Route Handler.

**Empfehlung: (c) mit (b) für die Bytes.** Ein streamender PUT beseitigt strukturell die Klasse
„Zielschlüssel kommt vom Client" (der Server holt den Pfad aus der DB), macht
`abortMultipartUpload` überflüssig und entfernt zwei Endpunkte. Die Formularfehler (Titel, Ablauf,
Passwort, Limit) gehören in eine Server Action, weil die Suite-Regel Fehler **am Feld** verlangt
(`useActionState`) und nicht auf einer technischen Fehlerseite mit Datenverlust. Der Client-Rewrite
ist ohnehin nötig, weil der Fortschritt heute an Chunk-Grenzen hängt. **Was nicht geraten werden
darf:** eine Zahl für die Server-Action-Grenze — und die 10-MiB-Proxy-Kappung muss vor dem Bau an
einer laufenden Instanz gemessen werden.

### 7. ClamAV: fail-closed in beide Richtungen — synchron oder asynchron?

**Was sich ändert:** die Prozessarchitektur, das Statusmodell einer Datei
(`scanning`/`clean`/`infected`/`error`), was der Nutzer sieht, und ob ein AV-Ausfall den
Upload-Weg blockiert. Die Phase-4-Vorgabe: „ClamAV-Sidecar in den Suite-Stack (scannt ab jetzt beide
Richtungen)" (`APP-KONSOLIDIERUNG.md:145`) — für `easy-filesharing` ist das ein **Sicherheitsgewinn**,
weil dort heute gar nicht gescannt wird.

**Belegte Ausgangslage:** drops Integration ist der fragilste Teil der „gehärteten" App. Jeder
clamd-Protokollfehler wirft im `socket.on('end')`-Handler und **tötet den Prozess**; der
`AV_FAIL_OPEN`-Schalter ist für diese Fälle toter Code (Abschnitt 3.2). Im Monolithen reißt eine
uncaught exception nicht nur `files`, sondern alle Module mit.

**Optionen für neue Uploads:** (a) synchron wie heute, aber mit korrektem Promise-Vertrag, hartem
Timeout und explizitem Grenzwert neben der Datei-Obergrenze; (b) asynchron: Datei in Quarantäne, erst
nach `clean` abrufbar, Zustand in `files.db`, Upload antwortet sofort; (c) nur unterhalb der
clamd-Streamgrenze scannen, größere Dateien als „ungeprüft" kennzeichnen.

**Und die Frage, die die drei Optionen nicht abdecken: was gilt für den Altbestand?** Jede Datei, die
aus MinIO importiert wird, ist **nie gescannt** worden — `easy-filesharing` hat keinen Scanner
(kein AV-Code im Repo), und `drop` scannte nur zur Annahmezeit, also mit den Signaturen von damals.
„Fail-closed" konsequent gedacht heißt: kein Download, bis geprüft. Damit braucht die Statusspalte
einen vierten Wert `unscanned`, und der Cutover einen Nachscan-Lauf über den importierten Bestand —
oder eine ausdrückliche Amnestie. Zwischen Import und Nachscan-Ende würden bestehende `/s/<id>`-Links
sonst blockiert, und das ist genau der Zustand, den ein Empfänger nicht deuten kann. Optionen:
(d) Altbestand gilt als geprüft (Amnestie, dokumentiert); (e) Altbestand als `unscanned` importieren,
Download erlaubt, Nachscan im Hintergrund, Fund führt zur Sperre plus Benachrichtigung des Betreibers;
(f) `unscanned` sperrt sofort, Nachscan läuft vor dem Router-Umschwenk.

**Empfehlung: (b) für neue Uploads, (f) für den Altbestand — Nachscan als Schritt im Runbook, vor dem
Umschwenken.** Das Wartungsfenster ist ohnehin da, der Bestand ist einmalig, und (e) verlangt eine
Benachrichtigungsstrecke, die es in der Suite nicht gibt. Wie lange der Lauf dauert, hängt an der
Datenmenge — die niemand kennt (Abschnitt 8). Falls sie den Termin sprengt: (d), aber dann
ausdrücklich als Entscheidung dokumentiert, nicht als Auslassung.

Zu (b): nur so ist der Scan von der Upload-Antwort entkoppelt, und nur so kann ein
AV-Ausfall den Upload-Weg nicht blockieren. Vier Dinge müssen unabhängig von der Wahl in die Spec:
die AV-Größengrenze ist ein **expliziter, geprüfter Wert** neben der Datei-Obergrenze (mit der
Cloudflare-Kante sind es **vier Größen an vier Orten in drei Einheiten**, die heute niemand
gegeneinander prüft — die Aufstellung samt der beiden trügerischen Zahlenpaare („500" ≠ „500",
„100" ≠ „100") steht bei Falle 22, die Entscheidung bei 19; und die Verletzung äußert sich nicht als „Datei zu groß"); der Scanner-Vertrag muss ein settelndes Promise sein, gegen einen echten
Socket getestet, nicht gegen einen Stub, der in einer async-Funktion wirft; „fail-closed" muss
nachweislich **erreichbar** sein; und die Auswertung darf nicht auf `stream:`-Präfixe bauen, weil auch
`stream: … ERROR` ein Fehler ist. Der Prozess braucht außerdem einen
`uncaughtException`/`unhandledRejection`-Handler — den hat drop nicht.

**Betriebsseite und Ort des Status sind eigene Entscheidungen.** Was der Sidecar im Compose-Stack
kostet (internes Netz, Signatur-Volume, `depends_on`, Startfenster, ~1 GB RSS) steht in 4.4 und
Entscheidung 17; der Scan-Transport samt der gemessenen 100-MiB-Kante in Entscheidung 16; in welcher
Tabelle die Statusspalte liegt, in Entscheidung 18. Drei Präzisierungen zu den vier Spec-Punkten oben,
alle gemessen (30.07.2026, `clamav/clamav:1.4`, Digest `sha256:6b7c8e09…6aba9`, Apparat siehe 4.4):

- Option (c) („nur unterhalb der Streamgrenze scannen") hat jetzt eine Zahl: **100 MiB**
  (104.857.600 B). INSTREAM mit 100 MiB → `stream: OK`, mit 101 MiB →
  `INSTREAM size limit exceeded. ERROR` (3.2).
- Die Forderung „die Auswertung darf nicht auf `stream:`-Präfixe bauen" ist damit nicht mehr nur
  plausibel, sondern belegt: die Antwort auf die Überschreitung beginnt mit `INSTREAM`, nicht mit
  `stream:` — sie landet also im generischen `throw` (`antivirus.js:25`), nicht im ERROR-Zweig.
- Der Weg per Pfad (`zSCAN`) meldet dieselbe Übergröße als **`OK`** („AlertExceedsMax heuristic
  detection disabled" im clamd-Log). Wer von INSTREAM auf Pfad wechselt, tauscht damit einen lauten
  Fehler gegen ein stilles fail-open — es sei denn, `AlertExceedsMax` wird gesetzt.

### 8. Worauf schlüsselt das Rate-Limit?

**Was sich ändert:** Datenmodell (Zähler pro Token in SQLite statt Map im Prozess), Fehlertext,
Betriebsverhalten — und ob die Maßnahme überhaupt greift.

**Belegte Ausgangslage:** drops Limit schlüsselt auf die IP und ist über einen Query-String, über
`X-Forwarded-For` und über die Fenstergrenze umgehbar; abgewiesene Anfragen verbrauchen das Budget,
sodass ein Fremder ohne Zugangsdaten das Postfach sperren kann. Der Zähler ist eine Map im
Prozessspeicher — im Monolithen mit mehreren Instanzen oder bei jedem Neustart faktisch wirkungslos.
Und in einem Ehrenamts-WLAN ist die IP kein Nutzeräquivalent — mit einer Mechanik, die den Schlüssel
schon bei einem einzigen Vorgang sprengt: der Client lädt **eine Datei je Anfrage** und die Anfragen
**streng nacheinander** (`drop/web/src/hooks/use-upload.ts:113-128,243-246`; das serverseitige
`files: 25` aus `drop/src/app.js:446-451` greift für diesen Client also nie). Gezählt wird in einem
Ein-Minuten-Eimer je IP mit `RATE_LIMIT_PER_MIN` als Deckel (`drop/src/security.js:3-26`; Default 30
in `drop/src/config.js:35`), und geprüft wird u. a. auf `POST /u/<token>/upload`
(`drop/src/app.js:118-128,463-464`). **Herleitung aus diesen Messwerten, nicht selbst gemessen:** N
Dateien sind N Anfragen, ein Vorgang mit mehr als `RATE_LIMIT_PER_MIN` Dateien innerhalb einer Minute
läuft also in ein 429 — bei Default-Konfiguration ab der 31. Datei, und für alle Melder hinter
derselben NAT-Adresse zusammen. Wie viele Dateien ein realer Einsatz-Upload umfasst, weiß nur der
Betreiber (Abschnitt 8).

**Optionen:** (a) IP-Schlüssel wie heute; (b) **Token-Schlüssel** als Primärgrenze, IP nur als
Notbremse in Größenordnungen, die kein Einsatz erreicht; (c) Mengenbudget pro Token (Dateien/Bytes)
statt Anfragen-Rate; (d) zweistufig: (b) + (c).

**Empfehlung: (d).** Der Token ist das, was der Betreiber ausgibt, sperren kann und was pro Link ein
sinnvolles Kontingent hat. Dazu drei Randbedingungen: die Trusted-Proxy-Kette muss explizit definiert
sein (nur der letzte nicht vertrauenswürdige Hop zählt als Client), der Zähler gehört in `files.db`
oder einen gemeinsamen Store, und die Prüfung muss **nach** dem Zugangs-Guard laufen — sonst bleibt
der Sperr-Hebel aus Abschnitt 3.2 erhalten. Das Verhalten wird gegenüber heute sichtbar anders (heute
gehen über die Fenstergrenze 2× das Limit durch); das ist kein Bug, den man reproduzieren muss.

### 9. MIME-Prüfung und Auslieferung

**Was sich ändert:** Storage-Layout (Zufalls-ID auf der Platte?), der ausgelieferte `Content-Type`, die
Content-Disposition, und ob eine hochgeladene Datei Skript im Suite-Origin ausführen kann.

**Belegte Ausgangslage:** beide Apps glauben ausschließlich dem deklarierten Content-Type, drop hat
zusätzlich den busboy-Default-Bypass. Auf dem Dateisystem gibt es keinen gespeicherten Content-Type
mehr: die Download-Route liefert heute pauschal `application/octet-stream`, wenn der Storage keinen
Wert hat (`download:104`) — der DB-Wert wird dort **gar nicht** herangezogen; die Preview zieht ihn.
Der Port muss beides explizit entscheiden. `image/svg+xml` steht in `PREVIEWABLE_TYPES` und wird mit
`Content-Disposition: inline` ausgeliefert, ohne `nosniff` und ohne CSP
(`easy-filesharing/app/api/preview/[id]/route.ts:7-18,87-111`). Ein SVG ist damit ein ausführbares
Dokument im Origin der Fileshare-Domain — das gilt unabhängig von jeder Cookie-Frage und ist der
Grund, warum die Empfehlung unten **nicht** daran hängt. Der Cookie-Scope entscheidet nur, wie weit
es trägt: die heutigen Hosts sind `share.iuk-ue.de` und `drop.iuk-ue.de` (Betreiber, 30.07.;
`KONSOLIDIERUNG-PROGRESS.md`, Phase-4-Abschnitt (Betreiberantworten 30.07.) und „Notizen / offene Fragen“), beide liegen im Scope von `.iuk-ue.de`. **Der Beleg dafür ist
die Betreiberangabe, nicht die Compose-Datei:** `compose.yaml:25` lautet
`AUTH_COOKIE_DOMAIN=${AUTH_COOKIE_DOMAIN:-.iuk-ue.de}` und ist damit nur der Vorgabewert für den Fall,
dass die Server-`.env` nichts setzt — was dort produktiv steht, ist im Runbook zu bestätigen (dieselbe
Klasse wie die übrigen Server-Werte). Das Session-Cookie ist `HttpOnly; SameSite=Lax` (am echten Login nachgemessen,
`src/core/auth/cookies.ts:36-40`) — auslesen kann ein Skript es also nicht, aber es fährt bei
Anfragen **innerhalb derselben Site** mit, und alle `*.iuk-ue.de` gehören zu derselben Site. Welche
Hosts die Suite später bedient, ist ausdrücklich offen (`KONSOLIDIERUNG-PROGRESS.md`, Phase-4-Abschnitt (Betreiberantworten 30.07.)); liegen sie
außerhalb `.iuk-ue.de`, schrumpft der Radius auf den Fileshare-Origin selbst — die Maßnahme bleibt
dieselbe.

**Optionen:** (a) Allowlist wie heute; (b) Magic-Byte-Prüfung des geschriebenen Temp-Files plus
Abgleich mit Endung und Deklaration, Abweichung = Ablehnung; (c) zusätzlich: Ablage unter Zufalls-ID,
Anzeigename nur in der DB, Auslieferung immer `attachment` + `nosniff`, SVG und HTML **nie** inline.

**Empfehlung: (b) und (c) zusammen.** Die Inhaltsprüfung allein zieht bei jedem neuen Containerformat
nach; die Entkopplung von Name und Auslieferung hält auch bei einer Fehlklassifikation. Für die
Preview: Allowlist serverseitig, SVG aus der Inline-Vorschau nehmen (Download bleibt möglich),
`X-Content-Type-Options: nosniff` und `Content-Security-Policy: sandbox` auf der Route. Und weil das
Modul künftig ausliefert, was drop annimmt, muss die **wirklich eingesetzte** `ALLOWED_MIME` vom
Server gelesen werden, bevor die Allowlist geschrieben wird.

### 10. Ist das Download-Limit eine harte Zusage?

**Was sich ändert:** ob Zähler und Auslieferungsentscheidung in einer Transaktion liegen — heute ist
das ausdrücklich anders gebaut („Zähler nicht im kritischen Pfad", Kommentar in
`download/[id]/route.ts:73-74`).

**Optionen:** (a) 1:1: nach Response-Start zählen, Überbuchung bei Gleichzeitigkeit und Zählung von
Abbrüchen in Kauf nehmen; (b) atomar vorher zählen und sperren
(`UPDATE … SET download_count = download_count + 1 WHERE download_count < max_downloads`, bei 0
betroffenen Zeilen 410); (c) erst nach vollständiger Übertragung zählen.

**Empfehlung: (b).** Es ist die einzige Variante, bei der `max_downloads` hält, was es verspricht, und
sie ist ein einzelnes SQL-Statement. (c) macht bestehende Limits großzügiger als heute — eine
Verhaltensänderung für bereits verteilte Links. Wenn der Betreiber Empfängern „dieser Link
funktioniert dreimal" zugesagt hat, ist (a) nicht haltbar.

### 11. `limit_reached_at` und die Karenzzeit

**Was sich ändert:** Schema, Cleanup-Bedingung, Zugriffslogik — und die **Datenlebensdauer**.

**Belegte Ausgangslage:** der Zugriffs-Zweig ist im Normalfall unerreichbar (die härtere Zählerprüfung
greift vorher), die Löschverzögerung ist live, und im Pfad aus Abschnitt 2.3 blockiert die Karenz
einen Share, der weder abgelaufen ist noch sein Limit erreicht hat — und löscht ihn samt Dateien.
Zusätzlich ist der Wert asymmetrisch: abgelaufene Shares werden **ohne** Karenz gelöscht.

**Optionen:** (a) Spalte und beide Zweige 1:1 (toter Code inklusive); (b) Spalte behalten, den toten
Zugriffszweig entfernen, die Löschverzögerung als solche benennen (`DELETE_GRACE_HOURS`), und
`limit_reached_at` bei **jeder** Änderung von `max_downloads` zurücksetzen; (c) Spalte streichen und
den Zustand aus `download_count`/`max_downloads` ableiten; (d) den Karenz-Zugriff „reparieren", also
das Fenster tatsächlich gewähren.

**Empfehlung: (c), oder (b) wenn die Spalte importiert werden soll.** (c) beseitigt den Defekt
strukturell — der Zustand ist ohnehin ableitbar. (d) ist eine fachliche Neuerung, die der Betreiber
beauftragen müsste (Links, die heute 410 liefern, funktionierten dann noch). (a) ist ausdrücklich
falsch. In jedem Fall: die Karenz auf **abgelaufene** Shares ausdehnen, damit ein Wert nicht zwei
Bedeutungen hat — heute werden abgelaufene Shares sofort samt Dateien gelöscht, was jede Verlängerung
nach Ablauf unmöglich macht. Und: das serverseitige Deckeln beim Bearbeiten nachziehen (heute setzt
jedes Speichern den Ablauf auf „jetzt + 1 Tag").

### 12. Audit-Log: Cascade, Aufbewahrung, IP

**Was sich ändert:** Schema (FK oder nicht), Cleanup-Job, und was nach dem Löschen eines Shares noch
nachweisbar ist.

**Belegte Ausgangslage:** `ON DELETE cascade` (`0002:8`) plus ein Cleanup, das Shares löscht, macht das
Log konstruktionsbedingt flüchtig — es verschwindet genau dann, wenn man es braucht. Es gibt keine
Aufbewahrungsfrist. `ip` ist kein belastbares Feld: es ist der erste Eintrag aus `X-Forwarded-For`
ohne Trusted-Proxy-Prüfung, also ein vom Client gesetzter Wert (in `easy-filesharing`
`download/[id]/route.ts:75-78`, in `drop` `security.js:57-63`).

**Optionen:** (a) 1:1, Cascade bleibt; (b) entkoppeln (kein FK-Cascade) mit eigener Frist, z. B. 90
Tage; (c) wie (b), zusätzlich IP gekürzt oder gehasht; (d) IP für anonyme Uploads nicht mehr
speichern.

**Empfehlung: (b) + (c).** Ein Log, das mit dem Share stirbt, ist kein Audit-Log; unbefristet
gespeicherte IPs sind im Ehrenamtskontext schwer zu begründen. Wenn das Feld bleibt, muss es heißen,
was es ist — `client_ip_unbestaetigt`, nicht `client_ip`. Und die Ansicht darauf braucht das härtere
Gating aus Entscheidung 3.

### 13. Wer löst den Cleanup aus?

**Was sich ändert:** ob ein Secret in die Suite-`.env` wandert, ob es einen externen Aufrufer gibt, und
ob der erste Lauf ein Löschereignis ist.

**Belegte Ausgangslage:** die Suite hat **keinen** Cron; `feedback` löst sein Zeitproblem durch
Statusfalten beim Abruf — für Bytes trägt das nicht. `/api/cleanup` läuft nach dem Host-Rewrite intern
unter `/m/files/api/cleanup` und ist nicht im PASSTHROUGH; ein Cron, der einen Host aufruft, den
`moduleForHost` nicht kennt, bekommt ein **302 auf `/login`**, nicht 401 — und meldet Erfolg, wenn er
nur auf HTTP-Fehler prüft. Dass dieses Muster real ist, zeigt der eigene Healthcheck, der
`127.0.0.1` aufruft (`compose.yaml:45`).

**Optionen:** (a) Endpunkt beibehalten, Route unter `src/app/m/files/api/cleanup`, Cron-URL beim
Cutover umstellen; (b) interner Timer beim Boot (analog `migrateAllModules` in `bootstrap.ts`) mit
Lauf-Protokoll in `files.db`; (c) beides: Timer als Normalfall, Endpunkt als manueller Auslöser.

**Empfehlung: (b) mit Protokollzeile**, plus einen **Trockenlauf-Modus**, der zählt statt löscht, für
den ersten Lauf nach dem Cutover. Die Suite hat mit `instrumentation.ts`/`bootstrap.ts` bereits einen
Boot-Hook und läuft heute als **ein** Container (`compose.yaml:1-4`, kein `deploy:`/`replicas:` im
File — bei mehreren Instanzen liefe der Timer mehrfach und bräuchte ein Lock); ein Secret weniger in
der `.env` ist ein echter Gewinn. Der
Cutover muss den alten Cron dann ausdrücklich abschalten. Und der Fehler-Schlucker aus
`lib/db/index.ts:20-28` darf **nicht** mitkommen — ein fehlgeschlagener Migrationslauf muss laut
werden.

### 14. Ersetzt eine Posteingang-Ansicht die Sidecar-Dateien?

**Was sich ändert:** ob eine neue Funktion gebaut wird, und ob der heutige Abholweg des Betreibers
(SSH/Dateimanager auf `/srv/fuekw/drop_inbox`) weiter funktioniert. `drop` hat keine Leseansicht — die
Sidecar `.txt` ist dort die **einzige** Möglichkeit, den Hinweis zum Bild zu sehen.

**Optionen:** (a) nur DB, keine Sidecars, keine META — dafür eine Inbox-Ansicht im Modul mit Hinweis,
Kategorie, Zeit, Größe, Download und Löschen; (b) Sidecars und META weiterschreiben, aber mit
`flag: 'wx'` und Ausweichnamen; (c) Sidecars weiterschreiben, aber in ein **separates**
Metadatenverzeichnis neben der Inbox.

**Empfehlung: (a), gekoppelt an die Zusage der Ansicht — sonst (c).** Das gemessene Überschreiben ist
ein direkter Grund, die Sidecar nicht unverändert zu übernehmen. Hält der Betreiber am
Dateisystem-Abholweg fest, ist (c) die sichere Variante: getrennte Ebene, keine Namensraum-Kollision
mit Nutzdateien, kein Filterproblem beim Lesen. Wer die Ansicht baut, beantwortet damit auch Fragen,
die `drop` nie stellen musste: wer sieht die Inbox (für Altdaten ist „nur der Ersteller" unmöglich),
wie lange bleiben Dateien liegen, wird beim Löschen die Datei mitentfernt. Und die Prüffragen aus
`docs/design/README.md:236-249` gelten für jede neue Aktion: hat sie einen Einstiegspunkt, und führt
kein Einstiegspunkt dorthin, wo der Klickende einen 404 bekommt.

### 15. Reihenfolge und Kopplung der beiden Cutover

**Was sich ändert:** ein Runbook mit zwei Teilen oder zwei Runbooks, was zwischen den Terminen
erreichbar ist, und was ein Rollback bedeutet.

**Belegte Mechanik:** `SUITE_HOST_FILES` wird beim zweiten Termin um einen **Kommaeintrag** erweitert,
`SUITE_TRAEFIK_RULE` um ein `|| Host(...)`. Einen Host zurücknehmen heißt: genau diesen Eintrag und
diese Regel entfernen — die Variable zu **leeren** nimmt **beide** Cutover zurück
(`hosts.ts:33-38`). Zwischen den Terminen ist der noch nicht umgeschwenkte Zweig über den bereits
umgeschwenkten Host erreichbar, weil das Gating am Pfad-Segment hängt, nicht am Host.

**Optionen:** (a) Fileshare zuerst; (b) drop zuerst; (c) beide am selben Termin; (d) zwei Termine mit
modul-interner Host-Rollen-Sperre (404 auf dem falschen Host).

**Empfehlung: (d).** Ein Modul, das zwischen den Terminen auf beiden Hosts alles anbietet, verrät
Routen, deren Alt-Pendant noch live ist — genau die Prüffrage „führt kein Weg dorthin, wo die
aufrufende Person nicht hindarf". Welcher Zweig zuerst geht, kann der Code nicht entscheiden; die
Reihenfolge sollte der Alt-Stack bestimmen, dessen Freeze-Fenster kürzer und dessen Datenmenge kleiner
ist. Für `drop` gilt zusätzlich: **Token-Freeze**. Kein Token lebt länger als 72 h — die Grenze steht in
der Route (`drop/src/app.js:16-17,190-201,649-659`) und ein zweites Mal in der Plugin-Konfiguration
(`auth.js:87-91` gegen `index.mjs:783-788`, siehe Abschnitt 1). Werden 72 Stunden vor dem Umschwenken
keine neuen Links mehr ausgegeben, ist zum Termin kein Token mehr gültig, und das
SHA-256/base64url-Verfahren muss nicht nachgebaut werden. Tragend ist dabei die **Ungültigkeit**,
nicht das Verschwinden der Zeile: `validateApiKey` prüft `expiresAt` und wirft `KEY_EXPIRED`
(`index.mjs:1656-1682`). Das Löschen abgelaufener Zeilen hängt dagegen an **Verkehr** — es läuft als
Nebenwirkung der Key-Routen und der Key-Anmeldung, höchstens einmal je 10 Sekunden
(`index.mjs:1898-1917`, Drosselung über `lastChecked` in `:1899-1902`). Nach einem Freeze fährt kein
Verkehr mehr; abgelaufene Zeilen können also durchaus noch in `apikey` stehen. Das schadet nicht,
solange der Cutover sie nicht als „gültige Tokens" zählt: die Erhebung aus Abschnitt 8 muss
`expiresAt` gegen die Uhrzeit vergleichen, nicht Zeilen zählen. Was ein alter QR nach dem
Cutover sieht, muss die Spec trotzdem sagen: heute landet ein ungültiges Token auf
`/?error=invalid_token&token=…`, nicht auf einer 404.

**Teilfrage 15a — nach dem Umschwenk liegt das drop-Postfach an zwei Orten.** `drop`s Inbox ist kein
Docker-Volume, sondern ein Host-Bind-Mount: `/srv/fuekw/drop_inbox:/uploads`
(`drop/docker-compose.yml:12`; Containerpfad `UPLOAD_DIR=/uploads`, `drop/.env.example:4`,
`drop/src/config.js:30`). Die Suite schreibt in das **benannte** Volume `suite_data`
(`iuk-suite/compose.yaml:40-41,61-63`). Ab dem Umschwenken landet jeder neue Upload dort, während
`/srv/fuekw/drop_inbox` unverändert liegen bleibt — für die zwei Standby-Wochen
(`docs/runbooks/feedback-cutover.md:4,188-190`) gibt es zwei Postfächer.

**Was sich je Antwort ändert:** ein benannter Runbook-Schritt oder keiner; ob der Betreiber weiter
über das Dateisystem abholt oder über eine Ansicht im Modul; und ob `/data/files` ein eigener Mount
wird (Kopplung an Entscheidung 5).

**Warum es ohne Schritt schiefgeht.** Der heutige Abholweg ist SSH/Dateimanager auf genau diesen Pfad
(Entscheidung 14). Zeigt er nach dem Cutover unverändert dorthin, holt der Betreiber zwei Wochen ein
Postfach ab, in das nichts mehr geliefert wird — **ohne Fehlermeldung**, und die Uploads eines
Einsatzes wären scheinbar verschwunden. Umgekehrt ist derselbe Pfad nach dem Import die
Rollback-Quelle: nach einem Rollback muss der Alt-Container wieder dorthin schreiben können, unter dem
ursprünglichen Namen und mit dem Eigentümer aus `DROP_UID`/`DROP_GID` (`drop/docker-compose.yml:6`,
Vorbelegung 1000/1000 in `drop/.env.example:28-29`). „Einfrieren" heißt hier also: nicht anfassen,
aber erkennbar machen.

**Und es sind zwei Quellpfade, nicht einer.** Die META-JSONs liegen **nicht** in der Inbox, sondern in
einem *relativen* Bind-Mount `./data/meta:/data/meta` (`drop/docker-compose.yml:13`;
`META_DIR=/data/meta`, `drop/.env.example:5`) — also im Deploy-Verzeichnis des Alt-Stacks, dessen
absoluter Pfad im Repo nirgends steht. In der Inbox selbst liegen Nutzdateien plus die
`.txt`-Sidecars (`drop/src/app.js:366-368` schreibt sie nach `targetDir`), und die META-JSON ist laut
Abschnitt 5 die einzige Quelle für Hinweis und Absender-IP bestehender Uploads. Freeze, Inventar und
Import brauchen **beide** Pfade; der zweite ist eine Betreiberfrage (Abschnitt 8, Frage 10).

**Optionen für den Übergang:** (a) Altpfad unangetastet lassen und den Abholweg nur durch Ansage
umstellen; (b) nach Inventar und Import eine Markierungsdatei auf oberster Ebene ablegen
(`_ABGESCHALTET-neue-Uploads-unter-<host>.txt`), Altpfad sonst unverändert; (c) Altpfad umbenennen
(`drop_inbox` → `drop_inbox.stillgelegt-<datum>`) und den alten Namen für den Rollback freihalten.

**Empfehlung: (b).** Sie ist additiv, kostet keinen Schreibzugriff auf die Nutzdaten und erklärt sich
dem Menschen, der per Dateimanager hinsieht — genau der Person, die den stillen Fall sonst nicht
bemerkt. Zwei Randbedingungen: die Markierung wird **nach** Inventar und Import geschrieben, sonst
zählt sie als Nutzdatei mit und verfälscht die Parität, und sie wird beim Rollback wieder entfernt.
(c) schützt zusätzlich vor versehentlichen Schreibzugriffen, verlangt aber einen zusätzlichen
Rollback-Schritt (Rückbenennen **vor** dem Start des Alt-Containers, damit der Bind-Quellpfad unter dem
ursprünglichen Namen existiert) — und ein Rollback ist der Moment mit dem wenigsten Kopf für
Zusatzschritte. (a) ist die Variante, die den Befund oben nur benennt und dann darauf hofft.

**Wie der Betreiber danach an die Dateien kommt**, muss die Spec ausdrücklich sagen — sonst ist der
Abholweg nach dem Cutover unbestimmt: (i) über die Posteingang-Ansicht im Modul (Entscheidung 14,
Option (a)); der Dateisystemweg entfällt dann bewusst. (ii) Über das Volume, per
`docker volume inspect suite_data -f '{{ .Mountpoint }}'` — im Repo erprobt
(`docs/runbooks/feedback-cutover.md:136`), liegt aber unter dem Docker-Datenverzeichnis und braucht
root. (iii) `/data/files` als eigener Bind-Mount, z. B. `/srv/iuk-suite/files:/data/files` — erhält
den heutigen Handgriff und löst zugleich die ENOSPC- und Backup-Frage aus Entscheidung 5
(`scripts/backup.sh:13-15` sichert ausschließlich `$DATA_DIR/*.db`, Dateien sind in keiner Variante im
Backup). Vorbedingung von (iii): das Verzeichnis muss dem Suite-Nutzer gehören — **uid 1001**
(`Dockerfile:26-27,47`), nicht 1000 wie bei `drop`. **Empfehlung: (i) plus (iii)** — die Ansicht als
Regelweg, der Mount als Notweg und als Anker für ein Datei-Backup.

### 16. Scan-Transport: INSTREAM über TCP oder gemeinsames Volume per Pfad?

**Was sich ändert:** ob der clamav-Service ein Volume mit den Nutzdateien sieht, wo die AV-Größengrenze
geprüft wird, was oberhalb davon passiert, und ob die Dateirechte auf `/data/files` Teil der Spec sind.
Die Frage hängt **unmittelbar an Entscheidung 5**: die Pfad-Variante (b) (`/data/files/<shareId>/<fileId>`
ohne Dateiname) ist die einzige, bei der ein Pfad, den das Modul an clamd übergibt, keinen rohen
Client-Dateinamen enthält.

**Belegte Ausgangslage.** `drop` scannt per TCP-INSTREAM gegen `AV_HOST=clamav`, `AV_PORT=3310`,
`AV_TIMEOUT_MS=30000`, `AV_FAIL_OPEN=false` (`.env.example:21-25`) — und liest die Bytes dabei ohnehin
**von der Platte** (`antivirus.js:33`, `createReadStream(filePath)`), nachdem der Upload in eine
Temp-Datei geschrieben wurde. INSTREAM kauft hier also nichts, was das Dateisystem nicht schon hergibt.
Beide Transporte haben eine Grenze bei 100 MiB, und sie verhalten sich dort **entgegengesetzt** (Messung
und Apparat in 3.2 bzw. 4.4):

- **INSTREAM, 100 MiB (104.857.600 B) → `stream: OK\0`; 101 MiB → `INSTREAM size limit exceeded. ERROR\0`.**
  Die Antwort trägt **keinen** `stream:`-Präfix. Damit greift in drops `parseResponse` keiner der drei
  Zweige (`antivirus.js:11-23`), und der generische `throw` in `:25` läuft im
  `socket.on('end')`-Callback (`:56-58`) — der Prozesstod aus 3.2, laut und reproduzierbar.
- **`zSCAN` per Pfad auf dieselbe Größe (125.829.120 B) → `/tmp/big120.bin: OK\0`.** clamd protokolliert
  beim Start „File size limit set to 104857600 bytes" und „AlertExceedsMax heuristic detection
  disabled": eine Datei über der Grenze wird **nicht** vollständig geprüft und trotzdem als sauber
  gemeldet. Das ist die gefährlichere Richtung — fail-closed wird für große Dateien still zu fail-open.

Die Zahl `100 MiB` stammt aus dem effektiven Dateigrößen-Limit, **nicht** aus `StreamMaxLength`: der
Eintrag ist im Image kommentiert (`/etc/clamav/clamd.conf:139` `#StreamMaxLength 25M`), und `clamconf -n`
listet als gesetzt nur `LogFile`, `LogTime`, `LocalSocket`, `TCPSocket`, `User`. Daneben liegt eine
zweite, unabhängige ~100-MB-Kante: Cloudflare kappt im Free-Plan den Body pro Anfrage bei 100 MB
(Plan-Eigenschaft der Zone, nirgends im Repo und nicht gemessen — Runbook-Schritt). Beide Apps
konfigurieren dagegen 500 MB (`drop/.env.example:7`,
`easy-filesharing/.env:16`).

**Optionen:** (a) INSTREAM wie heute, plus eine ausdrückliche AV-Grenze **unter** der clamd-Kappe und
korrektem Promise-Vertrag; (b) `/data/files` (oder das Quarantäneverzeichnis) zusätzlich **read-only** in
den clamav-Service mounten und per `zSCAN`/`zMULTISCAN` mit Pfad scannen; (c) wie (b), zusätzlich eine
eigene `clamd.conf` als Volume mit angehobenem `MaxFileSize`/`StreamMaxLength` und `AlertExceedsMax yes`
— dann meldet clamd Übergrößen als Treffer statt als OK.

**Empfehlung: (b) + `AlertExceedsMax yes` aus (c), plus eine geprüfte AV-Grenze im Modul.** Begründung:
der Scan wird ein Nachlauf auf einer fertig geschriebenen Datei (genau die asynchrone Variante (b) aus
Entscheidung 7), es gibt keine zweite Kopie der Bytes über einen Socket, und der Fehlerfall ist ein
Rückgabewert statt einer Protokollantwort, die geparst werden muss. Drei Randbedingungen gehören
zwingend dazu:

1. **Die Ablage muss für clamd lesbar sein.** Im Image läuft clamd als `clamav` **uid 100 / gid 101**
   (`id clamav`, `/etc/passwd`; die DB-Dateien gehören 100:101), der Suite-Prozess als `nextjs`
   **uid 1001 / gid 1001** (`iuk-suite/Dockerfile:26-27,44-48`). Modus von `/data` und der geschriebenen
   Dateien sind **nicht gemessen** — deshalb ist das eine Anforderung an die Spec, keine Feststellung:
   entweder eine gemeinsame gid am Verzeichnis plus expliziter Datei-Modus, oder ein `user:` am
   clamav-Service. Zu prüfen an der laufenden Instanz, nicht am Schreibtisch.
2. **Was oberhalb der AV-Grenze passiert, ist eine Festlegung**, kein Defaultwert: ablehnen, annehmen
   und dauerhaft als `unscanned` kennzeichnen, oder die clamd-Grenze anheben (Preis: RSS und
   Scandauer). Diese Zahl ist die dritte neben Datei-Obergrenze und Cloudflare-Kante — sie gehört an
   **eine** Stelle und in den Start-/Healthcheck, nicht in zwei Systeme (Entscheidung 19).
3. **Der Pfad wird Teil eines clamd-Kommandos.** Mit `z`-Präfix ist er NUL-terminiert (so gemessen);
   mit `n`-Präfix wäre ein `\n` im Dateinamen ein Trennzeichen. Bei Entscheidung 5 Variante (a)
   (`s3_key` 1:1, roher Client-Dateiname im Pfad) wandert dieser Name in das Kommando — ein weiterer,
   unabhängiger Grund für Variante (b).

Bleibt es bei (a), gilt derselbe Grenzwert, aber die Auswertung muss die Antwort
`INSTREAM size limit exceeded. ERROR` **namentlich** kennen — sie ist gemessen und sie kommt ohne
`stream:`-Präfix.

### 17. Wie hängt der Sidecar im Stack — und was soll `unhealthy` bedeuten?

**Was sich ändert:** `compose.yaml` (zweiter Service, zweites Netz, zweites Volume, `depends_on`), das
Verhalten der Suite in den ersten Sekunden nach jedem Neustart, der RAM-Bedarf des Hosts (~1 GB, siehe
4.4) — und ob ein Fehler im Modul `files` den ganzen Container als krank markiert.

**Belegte Ausgangslage:** die Messungen in 4.4. Kurz: clamd ist unauthentifiziert und lauscht auf allen
Interfaces; das Netz der Suite ist das **externe** `proxy` (`compose.yaml:42-43,65-67`); es gibt kein
`depends_on`; die Signaturen liegen ohne Volume im Container; auf `unhealthy` reagiert im Repo nichts.

**Optionen für Netz und Signaturen:** (a) wie in `drop` übernehmen — Sidecar in dasselbe Netz, kein
Volume; im Suite-Stack heißt „dasselbe Netz" aber `proxy`, und damit steht ein unauthentifizierter
Scan- und Dateileseservice allen Containern dieses Netzes offen; (b) **eigenes Netz** `av` mit
`internal: true`, der Suite-Service in beiden Netzen, plus `clamav_db:/var/lib/clamav` als benanntes
Volume; (c) wie (b), aber mit der `_base`-Variante des Images und Signaturen ausschließlich aus dem
Volume — erster Start dann ohne eingebackenen Bestand.

**Optionen für das Startfenster:** (i) `depends_on: {clamav: {condition: service_healthy}}` wie in
`drop`; (ii) modul-intern: das Modul kennt den Zustand „AV noch nicht bereit" und beantwortet ihn
verständlich (bei asynchronem Scan aus Entscheidung 7 (b): Datei annehmen, Status `scanning`, Scan
nachholen); (iii) beides.

**Optionen für den Healthcheck:** (I) unverändert `/api/health/portal`; (II) auf einen Endpunkt
erweitern, der alle Modul-DBs **und** die Ablage prüft (Entscheidung 5 verlangt für `/api/health/files`
ohnehin mehr als `SELECT 1`); (III) wie (II), zusätzlich clamd-Bereitschaft.

**Empfehlung: (b), (iii) und (II).** Zu (b): ein internes Netz kostet drei Zeilen und nimmt clamd aus
der Reichweite aller anderen Container am `proxy`; das Signatur-Volume spart bei jedem Recreate die
nachgeladenen ~57 MiB (110.140 → 171.388 KiB gemessen) und macht den Start unabhängig von einer
Netzstörung. `drop`s `dropnet` ist übrigens **nicht** `internal: true`
(`drop/docker-compose.yml:56-58`) — die Abschottung dort entsteht allein daraus, dass der clamav-Service
kein `ports:` hat; das ist im Suite-Stack nicht übertragbar, weil `proxy` von außen bestückt wird.
Zu (iii): `depends_on` deckt den `compose up`-Fall ab, der modul-interne Zustand alles andere. Zu (II)
gehört eine ausdrückliche Antwort auf „wer handelt darauf": heute niemand außer dem Menschen im Runbook.
Solange das so bleibt, ist (III) unschädlich; sobald ein Automatismus dazukommt, würde ein
files-eigener Fehler den **gesamten** Container neu starten und die anderen drei Module mitnehmen — die
Entscheidung dazu gehört in dieselbe Zeile wie die Erweiterung. clamd behält seinen eigenen Healthcheck
(`clamdcheck.sh`); die `start_period` ist am Zielhost zu messen und nicht aus den 17 s der Messung in
4.4 oder den 120 s aus `drop` zu übernehmen.

### 18. Wo liegt der AV-Status — eigene Tabelle für Inbox-Uploads oder Mitwohnen in `share_files`?

**Was sich ändert:** das Schema, das Import-Skript samt Paritätscheck, der Nachscan-Lauf aus
Entscheidung 7 (f), die Inbox-Ansicht aus Entscheidung 14 — und ob Inbox-Uploads im Shares-Dashboard
auftauchen. Eine nachträgliche Trennung ist nach dem Import teuer: sie bewegt Zeilen, die dann schon
mit `share_files.id` in verteilten Links und in Log-Zeilen stehen.

**Belegte Ausgangslage.** Die Statusspalte braucht `share_files` **in jedem Fall**: der importierte
Fileshare-Bestand ist nie gescannt worden und muss als `unscanned` ankommen. Offen ist nur, wo die
Inbox-Uploads liegen — und gegen das Mitwohnen sprechen vier gemessene Dinge:

- `share_files.share_id` ist `notNull().references(() => shares.id, { onDelete: "cascade" })`
  (`easy-filesharing/lib/db/schema.ts:23-25`). Ein Inbox-Upload in dieser Tabelle braucht also eine
  **synthetische `shares`-Zeile** — die ihrerseits `title`, `type`, `expires_at`, `created_by` und
  `s3_prefix` als NOT NULL mitbringt (`schema.ts:5,7,9,17-18`), im Dashboard erscheint und beim Cleanup
  nach `expires_at` mitgelöscht wird.
- `share_files.mime_type` ist NOT NULL (`schema.ts:29`), und `drop` persistiert **keinen** MIME-Typ: die
  META hat genau sieben Felder (`timestamp`, `ip`, `filename`, `storedPath`, `size`, `hint`, `category`;
  `drop/src/app.js:355-363`). Jeder importierte Inbox-Upload bräuchte einen erfundenen Wert.
- Der Paritätscheck vergleicht **Multisets ganzer Zeilen** und verlangt
  `source.length === target.length` (`scripts/import/parity.ts:43-56`). Zusätzliche Inbox-Zeilen in
  `share_files` machen ihn rot, solange die Zielabfrage sie nicht ausfiltert — und dieser Filter ist
  dann selbst Teil der Invariante und muss aufgeschrieben werden.
- Umgekehrt ist eine **neue Spalte** unproblematisch: das Vorbild projiziert beide Arme über explizite
  `*ParityView`-Funktionen (`scripts/import/feedback.ts:182-233,238-256`), eine Zielspalte ohne
  Quellpendant bleibt dort einfach weg. Der spaltenweise Import aus Abschnitt 5 bleibt unberührt.

**Optionen:** (a) eigene Tabelle `inbox_files` (Token-Bezug nullable, Kategorie, Hinweis, IP, Zeit,
Größe, Status), `share_files` bekommt nur die Statusspalte dazu; (b) Inbox-Uploads wohnen in
`share_files`, mit einer synthetischen `shares`-Zeile je Token oder je Tag; (c) eine gemeinsame Tabelle
`files` mit nullable `share_id` und nullable `inbox_token_id`, in die `share_files` beim Import
umgeformt wird.

**Empfehlung: (a).** (c) verstößt gegen die spaltenweise 1:1-Übernahme aus Abschnitt 5 und macht den
Rundlauf-Beweis des Imports zu einem Umformungsbeweis; (b) erkauft eine Tabelle weniger mit
Phantom-Shares, einem erfundenen MIME-Wert und einem Filter im Paritätscheck. Die Kosten von (a) gehören
ehrlich in die Spec: den Nachscan-Lauf, jede Statusabfrage und jede „ist diese Datei freigegeben"-Prüfung
gibt es **zweimal**, und zwei Statusvokabulare können auseinanderlaufen. Gegenmaßnahme: der Wertebereich
(`scanning` · `clean` · `infected` · `error` · `unscanned`) steht in **einer** Konstante, die beide
Tabellen benutzen, und die Freigabeprüfung ist **eine** Funktion mit zwei Aufrufern. Für die Spalte
selbst gilt die Regel aus Abschnitt 5 sinngemäß (`shares.type`, im SQL ohne CHECK): kein CHECK, der
`unscanned` nicht kennt — der Altbestand kommt genau mit diesem Wert.

### 19. Eine Datei-Obergrenze — welcher Name, welche Einheit, und wo wird sie erzwungen?

**Was sich ändert:** ein Env-Name samt Einheit, die Stelle, an der geprüft wird, und ob die Obergrenze
überhaupt eine ist. Nachgelagert: ob ein Admin-Client das Volume füllen kann, in dem auch `portal.db`,
`qr.db` und `feedback.db` liegen.

**Belegte Ausgangslage — drei Zahlen, drei Orte, drei Einheiten:** `MAX_FILE_SIZE` in Bytes
(`easy-filesharing/.env:16`, `init/route.ts:40`, `shares/new/page.tsx:4`), `MAX_FILE_SIZE_MB` in
Megabytes (`drop/.env.example:7`, `src/config.js:32`, Umrechnung `src/app.js:427`), und die
AV-Grenze, für die das Repo weder eine `clamd.conf` noch Env oder Volume am clamav-Service hat
(`drop/docker-compose.yml:26-37`) — es gilt der Image-Default von 100 MiB (Entscheidung 16). Die ersten
beiden sind heute gemessen identisch (`500 * 1024 * 1024 === 524288000`), was die Kollision unsichtbar
macht (Falle 22).

Dazu: **die Fileshare-Grenze greift nicht.** Geprüft wird die vom Client gemeldete `file.size`
(`init/route.ts:40-48`); die Route, über die die Bytes laufen, prüft keine Größe
(`chunk/route.ts:11-25`), und `complete/route.ts` schreibt nichts zurück. Ein Client, der `size: 1`
meldet und beliebig viele Chunks schickt, wird nirgends gebremst (Herleitung aus den beiden Routen,
nicht gegen eine laufende Instanz gemessen). Heute landet das in MinIO mit **eigenem** Volume
(`easy-filesharing/docker-compose.yml:47` `minio-data:/data`, DB getrennt in `:18` `db-data:/data`);
nach der in dieser Phase geplanten Umstellung auf `/data/files` landet es in `suite_data`, wo
`DATA_DIR=/data` (`iuk-suite/compose.yaml:21,41`, `src/core/db/index.ts:6,9`) auch die Datenbanken der
drei anderen Module hält. Dieselbe Klasse wie der roh gespeicherte Dateiname in Abschnitt 6: derselbe
Code, auf S3 harmlos, gefährlich erst durch die Storage-Entscheidung dieser Phase. Entscheidung 5
verlangt dafür „ein eigenes Volume oder eine harte Gesamtgrenze" — dass die Datei-Obergrenze dazu heute
nichts beiträgt, ist der Punkt hier.

**Optionen:** (a) ein Name in Bytes, geprüft **an der schreibenden Route** gegen die tatsächlich
geschriebene Bytezahl, Abbruch mit Löschen der Zwischendatei; (b) ein Name in MiB mit genau einer
Umrechnungsstelle; (c) zwei Grenzen — eine je Datei, eine je Share/Token als Mengenbudget (Anschluss an
Entscheidung 8, Option (c)); (d) zusätzlich eine harte Gesamtgrenze für `/data/files` bzw. ein eigenes
Volume.

**Empfehlung: (a) + (c) + (d), und der Name trägt die Einheit.** Bytes, weil die AV-Grenze ebenfalls in
Bytes rechnet und jede Umrechnung eine zweite Fehlerquelle ist; die Einheit im Namen (`…_BYTES`), damit
dieselbe Kollision beim nächsten Zusammenlegen nicht wieder typplausibel ist. Die Prüfung gehört
dorthin, wo gezählt wird — drops Muster ist hier das richtige (`limits.fileSize` bricht den Stream ab,
`app.js:445-451`), nur mit einem gemeldeten Statuscode statt HTTP 500 (Abschnitt 3.2). Und die drei
Zahlen müssen **gegeneinander** geprüft werden: Datei-Obergrenze ≤ AV-Grenze ≤ clamd-Kappe, als
Startprüfung, die den Boot abbricht — sonst äußert sich die Verletzung nicht als „Datei zu groß",
sondern als AV-Fehler (Entscheidung 7). **Was nicht geraten werden darf:** die produktiven Werte beider
Alt-Apps und die real wirksame clamd-Konfiguration (Abschnitt 8).

### 20. Wandert `size` als Selbstauskunft weiter, oder wird sie beim Umzug gemessen?

**Was sich ändert:** eine Spalte der 1:1-pflichtigen Tabelle `share_files`, die Summe in
`shares.total_size`, drei angezeigte Zahlen — und ob das Modul überhaupt eine belastbare Größenangabe
hat (Anzeige, Volumengrenze, ZIP-Abschätzung).

**Belegte Ausgangslage:** beide Spalten tragen die vom Client gemeldete Zahl (Abschnitt 5, „Der
Fileshare-Zweig"), sind `notNull` (`lib/db/schema.ts:13,28`) und werden angezeigt
(`shares-table.tsx:146`, `stats-cards.tsx:84`, `folder-view.tsx:31`). Die Admin-Detailseite rechnet die
Summe schon heute aus den Dateizeilen neu, statt `share.totalSize` zu lesen
(`app/(admin)/shares/[id]/page.tsx:55,145`) — Dashboard und Detailseite können also bereits
verschiedene Zahlen zeigen.

**Optionen:** (a) 1:1 übernehmen, wie Abschnitt 5 es für alle Spalten verlangt; (b) beim Blob-Umzug die
tatsächliche Bytezahl messen und schreiben, jede Differenz je Zeile berichten; (c) 1:1 übernehmen und
die gemessene Zahl in einer zusätzlichen Spalte führen.

**Empfehlung: (b), mit vollständigem Differenzbericht und ausdrücklich als Entscheidung dokumentiert —
nicht als stille Korrektur.** Der Umzug liest jedes Objekt ohnehin, die Messung kostet nichts, und eine
Volumengrenze (Entscheidung 19) auf Selbstauskunft zu stellen wäre widersprüchlich. Der Preis gehört
mitgeschrieben: (b) verlässt für diese eine Spalte die 1:1-Regel, und einzelne angezeigte Zahlen ändern
sich gegenüber der Alt-Anwendung — die feldweise Stichprobe muss das wissen, sonst wird die gewollte
Korrektur als Mapping-Fehler gemeldet. Zeilen ohne Objekt behalten ihren gemeldeten Wert und werden
berichtet; sie zu löschen ist eine eigene Entscheidung, keine Nebenwirkung des Imports.

### 21. Was steht künftig in `shares.created_by`?

**Was sich ändert:** die Schemazeile des neuen Moduls, der Import-Mapper, das Feld „Erstellt von" in der
Detailansicht, ob E-Mail-Adressen aus dem Altbestand in `files.db` wandern — und ob eine
Ownership-Ansicht später überhaupt gebaut werden **kann**.

**Belegte Ausgangslage.** Heute: `text("created_by").notNull()` (`schema.ts:17`), im SQL ohne Default
(`0000_demonic_boom_boom.sql:23`), gefüllt mit `session.user.email ?? "unknown"`
(`app/api/upload/init/route.ts:61`), angezeigt als „Erstellt von" (`app/(admin)/shares/[id]/page.tsx:159`).
Der Literal `"unknown"` entsteht, wenn die Session **keinen** `email`-Claim trägt — **nicht** im
Dev-Modus: dessen Credentials-Provider setzt immer eine (`<name>@dev.local`,
`lib/auth/config.ts:27,31`).

Im Ziel ist die Kennung eine andere. `session.user.id` **ist** der OIDC-`sub`
(`src/core/auth/config.ts:171-172`, im jwt-Callback aus dem `profile` zurückgeholt, `:143-145`) — beim
Dev-Login `dev:<E-Mail>` (`:62`). Eine E-Mail gibt es in der Suite auch, aber nur optional und nur am
`email`-Scope hängend (`src/core/auth/pocketId.ts:88` liefert `string | undefined`, Scope `:3`). Das
Hausmuster für genau diese Spalte steht in `qr`: `created_by`/`updated_by` als `text NOT NULL` **ohne**
FK, gefüllt mit `session?.user?.id ?? "unbekannt"` (`src/app/m/qr/actions.ts:19`, `_lib/presets.ts:67`),
Seed-Zeile mit dem Platzhalter `"system"` (`_lib/seed.ts:19`, Kommentar: „Reine Audit-Felder ohne FK",
`_db/schema.ts:21-23`). Anzeigenamen hält `feedback` bewusst **getrennt** in `known_users`
(`user_id` = `sub` → Name/E-Mail, „Kein Identitätsspeicher", `feedback/_db/schema.ts:87-88,99-109`).
Für Altdaten aus `drop` gibt es ohnehin nichts zuzuordnen (kein Datenmodell für Uploads, Abschnitt 3.1).

**Optionen:** (a) 1:1 — Altwerte übernehmen, neue Zeilen weiter mit der E-Mail füllen;
(b) Mischbestand — Altwerte 1:1, neue Zeilen mit dem `sub`, die Doppelnatur der Spalte deklariert;
(c) Bruch — Altwerte auf einen erkennbaren Platzhalter (`import:easy-filesharing`), neue Zeilen mit dem
`sub` nach `qr`-Muster; (d) Spalte streichen.

**Empfehlung: (c).** (a) trägt E-Mail-Adressen in die neue Datenbank und braucht dort denselben
`??`-Zweig, weil `email` in der Suite optional ist — dazu ein Feld, das wie eine Kennung aussieht und
keine ist. (d) ist kein Import-Vorteil (NOT NULL bleibt) und nimmt dem Betrieb die einzige Auskunft
„wer hat diesen Share angelegt". Die echte Abwägung liegt zwischen (b) und (c): (b) **behält** die
Auskunft über Bestands-Shares, muss dafür aber die Warnung „`created_by` ist kein Berechtigungsfeld"
allein tragen — bei einer zweiwertigen Spalte trifft jeder Vergleich zur Hälfte, und genau das löst
Falle 31 aus. (c) räumt die Falle **strukturell** (die Spalte ist immer `sub` oder Platzhalter) und
zahlt mit der Auskunft. Für (c) spricht die Linie aus Entscheidung 12: „wenn das Feld bleibt, muss es
heißen, was es ist" — und dass es hier um ein reines Anzeigefeld einer Admin-Seite geht, nicht um eine
Auswertung.

Drei Dinge gehören mit in die Spec. **Erstens: (c) ist nur solange umkehrbar, wie der Alt-Stack in
Standby steht.** Die Cutover-Praxis des Projekts lässt ihn mit intakten Volumes ~zwei Wochen stehen
(`feedback`: „Alt-Stack `da-feedback` gestoppt (Standby), Volumes intakt",
`KONSOLIDIERUNG-PROGRESS.md`, „Aktueller Stand“ (Alt-Stack iuk-overview)) — nach dem Abbau sind die Adressen weg. **Zweitens:** die
Detailansicht muss für Bestandszeilen etwas anderes zeigen als eine Kennung („Altbestand — nicht
zuordenbar"), sonst steht dort ein Wert, den niemand liest wie gemeint. **Drittens:** `created_by` ist
kein Berechtigungsfeld — das steht in Entscheidung 3 und muss dort verlinkt bleiben, unabhängig von der
hier gewählten Option.

### 22. Welcher Host steht in einem neu erzeugten QR-Code oder Link?

**Was sich ändert:** ob die Abbildung Rolle → Host in der Konfiguration steht oder aus dem Request
abgeleitet wird, wie viele Stellen sie lesen, auf welche der beiden Domains der App-Switcher zeigt —
und ob Dev und E2E diese Klasse überhaupt zeigen können.

**Belegte Ausgangslage.** Beide Altsysteme haben genau einen Host, die Frage stellt sich dort nicht —
und beide bauen ihre Links trotzdem schon unterschiedlich: `drop` serverseitig aus der Konfiguration
(`new URL('/u/'+created.key, config.betterAuthBaseUrl)`, `src/app.js:668` über `config.js:43`), aber
die Oberfläche **verwirft** dieses Feld und nimmt den Client-Weg
`createLocalShareUrl(window.location.origin, rawToken)` (`web/src/lib/share-tokens.ts:50-52`,
`token-item.tsx:76-77`; Abschnitt 3.1); `easy-filesharing` baut ausschließlich im Browser aus
`window.location.origin`, mit `NEXT_PUBLIC_APP_URL` als unerreichbarem Fallback
(`shares-table.tsx:74-77`, Rohbefund 5).

In der Suite ist der Request-Weg das erprobte Muster: `resolveHost(headers)` + `x-forwarded-proto` in
`f/[slugSecret]/qr.png/route.ts:54-56` und `feedback/_ui/Teilnahme.tsx:55-59` — mit **einem** Host pro
Modul richtig, und in Phase 3 als Fehlerbehebung eingeführt (die QR-Route kodierte vorher bei
umgeschriebenem Host eine unerreichbare Adresse ins Druckstück, `KONSOLIDIERUNG-PROGRESS.md`, Phase 3 (Redesign-Befunde 25.07.)).

Für zwei Hosts fehlt das Gegenstück. `moduleUrl(key)` liefert `prodHostsFor(mod)[0]` — den **ersten**
Eintrag (`src/core/shell/moduleUrl.ts:19-22`); der zweite Host hat **keinen** benannten Zugriff, nur
eine Position, die nichts prüft: `validateHostConfig` prüft Syntax und Doppelvergabe, nie Rollen
(`core/hosts.ts:65-99`). In Dev und Test leitet `moduleUrl` außerdem einen **einzigen** Host
`<key>.localtest.me` ab (`:24-26`) — ohne handgesetzte Variable existiert dort gar kein zweiter Host.

Zwei naheliegende Namensvarianten sind **ausgeschlossen**, nicht nur schlechter: eine zusätzliche
Variable `SUITE_HOST_FILES_SHARES` bricht den Boot ab, weil jedes `SUITE_HOST_*` ohne passenden
Modul-Key gemeldet wird (`hosts.ts:69-76`) und `assertHostConfig` wirft (`core/bootstrap.ts:29-35`);
eine Rollen-Syntax im Wert (`shares:share.iuk-ue.de,inbox:drop.iuk-ue.de`) ebenso, weil ein `:` im
Hostnamen abgewiesen wird (`hosts.ts:81-86`).

Die heutigen Hosts hat der Betreiber genannt: `share.iuk-ue.de` (Shares) und `drop.iuk-ue.de`
(Inbox); ob die Suite sie übernimmt, ist laut derselben Zeile noch offen
(`KONSOLIDIERUNG-PROGRESS.md`, „Notizen / offene Fragen“).

**Optionen:** (a) wie `feedback` aus dem Request (`resolveHost`); (b) die Rollen an die **Reihenfolge**
in `SUITE_HOST_FILES` binden (Index 0 = Shares, 1 = Inbox), gekapselt in **einer** Modul-Funktion, mit
Boot-Prüfung „genau zwei Hosts" und einem Test, der die Zuordnung festnagelt; (c) zwei eigene
Variablen unter einem **anderen** Präfix (`FILES_HOST_SHARES`/`FILES_HOST_INBOX`), weil nur
`SUITE_HOST_*` geprüft wird.

**Empfehlung: (b) — und die Trennung „Bedienen ≠ Erzeugen" ausdrücklich in die Spec.** Beide Hosts
müssen weiter **beide** Pfade bedienen, sonst brechen bereits gedruckte Codes; festgelegt wird allein,
welcher Host in eine **neu** erzeugte Nutzlast geschrieben wird. (a) erzeugt genau Falle 17: ein
Share-QR, auf der Inbox-Domain erzeugt, trägt `drop.iuk-ue.de`, funktioniert sofort, sieht richtig aus
und wird beim Abschalten eines Hosts ungültig — auf Papier, das dann längst verteilt ist. (c) legt
eine zweite Wahrheit über Hosts an, gegen die Begründung in `core/hosts.ts:14-17` (das einheitliche
Präfix ist der Grund, warum ein Tippfehler überhaupt auffällt): Routing und Druck könnten
auseinanderlaufen, ohne dass etwas meldet. (b) hält **eine** Quelle — dieselbe Variable, aus der
Routing (`routing.ts:69`) und Login-Allowlist (`core/auth/redirect.ts:54` über `moduleForHost`) lesen.

Der Preis von (b) ist die positionsgebundene Bedeutung; sie ist deshalb an drei Stellen zu befestigen:
`.env.example` (Reihenfolge kommentiert, dort steht der Fall schon als Beispiel, `:81`), eine
Boot-Prüfung (`files` mit ungleich zwei Hosts bricht ab, in derselben Kette wie `assertHostConfig`)
und ein Test, der einen Share-QR **unter dem Inbox-Host** erzeugt und den Shares-Host in der Nutzlast
erwartet. Und weil `moduleUrl(key)` den ersten Eintrag nimmt, heißt „Index 0 = Shares" zugleich: der
App-Switcher zeigt auf die Shares-Domain — eine bewusste Wahl, keine Nebenwirkung.

**Vorbedingung:** die Ziel-Hosts müssen bestätigt sein (Abschnitt 8, Punkt 1). Die Rollenzuordnung
selbst ist davon unabhängig, die `.env`-Zeile nicht.

---

## 8. Was nur der Betreiber beantworten kann

**Blockiert die Spec:**

1. **Die Ziel-Hosts der Suite.** Die *heutigen* Domains sind beantwortet: `share.iuk-ue.de` und
   `drop.iuk-ue.de` (Betreiber, 30.07.; `KONSOLIDIERUNG-PROGRESS.md`, Phase-4-Abschnitt (Betreiberantworten 30.07.) und „Notizen / offene Fragen“). Für `drop` deckt sich
   das mit dem Repo — `.env.example:11,13` führen `CADDY_DOMAIN=drop.iuk-ue.de` und
   `BETTER_AUTH_BASE_URL=https://drop.iuk-ue.de`, `README.md:39,104` nennen den Host samt
   `/u/<token>`-Beispiel. Das belegt die dokumentierte **Absicht**, nicht die Serverkonfiguration: der
   Code liest den Wert ausschließlich aus der Umgebung (`config.js:43`). Für `easy-filesharing` gab es
   im Repo nie einen Hinweis, nur Platzhalter (`scripts/setup.sh:60,77` mit `share.example.com`,
   `.env:9` mit `APP_URL=http://localhost:3000`) — dieser Host stammt allein aus der Betreiberantwort
   und gehört beim Cutover am Server geprüft (`grep APP_URL /pfad/zu/easy-filesharing/.env`, Muster:
   `docs/runbooks/feedback-cutover.md:29-34`). **Blockierend ist, welche Hosts die Suite danach
   bedient** (`SUITE_HOST_FILES`; die Reihenfolge entscheidet den Switcher-Link, Abschnitt 5). Die
   Übernahme der beiden Altnamen ist die billigste Antwort: die gedruckten `/u/<token>`-Zettel und die
   verteilten `/s/<id>`-Links tragen genau diese Hosts, ein neuer Name macht sie zu Altpapier —
   dieselbe Mechanik wie bei `SUITE_HOST_FEEDBACK` und den Aushängen
   (`docs/runbooks/feedback-cutover.md:9-15`). Die Cookie-Frage ist für die heutigen Hosts damit
   **erledigt** (beide unter `.iuk-ue.de`, `compose.yaml:25`); sie kehrt zurück, sobald ein Zielhost
   außerhalb liegen soll — dort erreicht ihn kein Session-Cookie und der Verwaltungsbereich ist
   unbenutzbar.
2. **Der Produktionsdump von `easy-filesharing`** (`/data/db.sqlite` im Volume `db-data`) — und die
   Messungen **vor** dem Import, nicht danach: sind alle Werte in `expires_at`, `created_at`,
   `limit_reached_at`, `downloaded_at`, `max_downloads`, `download_count`, `total_size`, `size` vom Typ
   `integer`? Gibt es Zeitstempel > 100000000000 (Millisekunden-Verdacht)? `type`-Werte außer
   `file`/`folder`? `password_hash` ohne `$2`-Präfix oder ≠ 60 Zeichen? `filename`-Werte mit `/`, `\`
   oder `..`? `download_logs.file_id`, die auf keine `share_files.id` zeigen (der FK fehlt, ist also
   möglich)? Und die Zeilenzahlen — ohne sie ist jede Aussage über Aufwand und Wartungsfenster geraten.
   Dazu, in derselben Abfrage: `SELECT created_by, count(*) FROM shares GROUP BY 1` — wie viele
   verschiedene Werte gibt es, sind es Klartext-E-Mail-Adressen, und steht irgendwo der Literal
   `unknown` oder ein leerer String? Ohne diese Zahl ist Entscheidung 21 nicht entscheidbar: sie
   tauscht Nachvollziehbarkeit gegen Datensparsamkeit, und beide Seiten hängen an der Menge — bei einer
   Handvoll Adressen ist es eine Zeile im Runbook, bei Hunderten eine andere Entscheidung.
3. **Zusammenlegung oder Trennung** (Entscheidung 1). Daran hängen Registry, Gruppen-Namensraum, PWA
   und die Zahl der Cutover.
4. **Das Storage-Layout** (Entscheidung 5). Daran hängen Pfadschema, Backup und Health-Aussage.
5. **Die real eingesetzte `ALLOWED_MIME` von `drop`** (Entscheidung 9). **Keine der beiden Apps hat eine
   `.env` eingecheckt** (`easy-filesharing/.gitignore:34`, per `git check-ignore` geprüft;
   `drop/.gitignore:2`), und die Konsolidierungsdokumente nennen die Werte nicht — dasselbe gilt für
   `MAX_FILE_SIZE_MB`, `RATE_LIMIT_PER_MIN`, `MAX_PARALLEL_UPLOADS`, `AV_ENABLED`, `AV_FAIL_OPEN`,
   `MAX_EXPIRY_DAYS`, `GRACE_PERIOD_HOURS`. **Der Vorbehalt gilt auch für `easy-filesharing`, wo eine
   `.env` im Arbeitsbaum liegt:** sie ist nur die lokale Kopie (wie bei `AUTH_DEV_MODE`, Punkt 6), und
   `docker-compose.yml:12-13` lädt per `env_file` genau diese Datei — zu erfragen sind deshalb auch die
   Server-Werte von `MAX_FILE_SIZE` und `MAX_EXPIRY_DAYS`. Und die dritte Zahl derselben Familie: die
   wirksame Größengrenze des clamav-Sidecars, für den `drop` weder `clamd.conf` noch Env übergibt
   (`drop/docker-compose.yml:26-37`) — es gilt der Image-Default (gemessen 100 MiB, Entscheidung 16),
   dessen Wert an der laufenden Instanz zu bestätigen ist. Welcher **Name** und welche **Einheit** im
   Modul überleben, ist dagegen keine Betreiberfrage, sondern Entscheidung 19.

**Blockiert einzelne Entscheidungen:**

6. **Steht `AUTH_DEV_MODE` auf dem Server?** Die ausgecheckte `easy-filesharing/.env` hat
   `AUTH_DEV_MODE=true` (`:13`) und **keine** einzige OIDC-Zeile; in diesem Modus ist der einzige
   Provider ein Credentials-Provider, der jeden Namen ohne Passwort annimmt, und `isAdmin` ist
   unbedingt `true` (`lib/auth/config.ts:21-34,56`). Die Datei ist gitignored, also die lokale Kopie —
   aber `docker-compose.yml:12-13` lädt genau `.env`. Wenn der Cutover die Server-`.env` übernimmt,
   muss diese Zeile geprüft werden. Und: wie heißt `OIDC_ADMIN_GROUP` wirklich?
7. **Läuft der Cleanup-Cron?** Im Repo gibt es keinen Aufrufer. Falls nein, enthält die Produktions-DB
   abgelaufene Shares samt Dateien vollständig, und der erste Lauf im neuen System löscht Monate auf
   einmal (Entscheidung 13).
8. **Wie viele Objekte liegen im MinIO-Bucket, und stimmt die Zahl mit `share_files` überein?** Waisen
   sind auf zwei belegten Wegen möglich. Nur am Server abgleichbar — und `mc ls --incomplete` für
   liegengebliebene Multipart-Uploads, die `ListObjectsV2` nicht zeigt und ein Umzug übersieht.
9. **Sind nackte `/api/download/…`- oder `/api/preview/…`-Links im Umlauf** (Mail, Chat, Lesezeichen)?
   Davon hängt Entscheidung 4 unmittelbar ab. Und: gibt es überhaupt passwortgeschützte Shares, und
   sind darunter per QR verteilte?
10. **Welches Inventar liegt unter `/srv/fuekw/drop_inbox` — und wo liegt `metaDir` auf dem Host?**
    Für die Inbox: `find -maxdepth 1 -type d` (welche Kategorien real existieren — die Kategorie ist
    Freitext), Zahl der Nutzdateien, und `find -name '*.part-*'` (halbe, ungescannte Dateien, die kein
    Import mitnehmen darf). Der zweite Ort ist **nicht** im Bind-Mount: `metaDir` ist `/data/meta`
    (`drop/src/config.js:31`) und kommt aus `./data/meta:/data/meta`, die Auth-DB aus
    `./data/auth:/data/auth` (`drop/docker-compose.yml:12-14`) — beide **relativ zum
    Arbeitsverzeichnis des Compose-Aufrufs**, das im Repo nirgends steht. Gebraucht wird der absolute
    Host-Pfad des Deploy-Verzeichnisses, sonst sichert der Freeze-Schritt nur die Nutzdateien und
    verliert jeden Hinweis, jede Absender-IP und jede Kategorie. Miterfragen: **wem gehören die
    Dateien** (`DROP_UID`/`DROP_GID`, Vorbelegung 1000, `drop/docker-compose.yml:6`,
    `drop/.env.example:28-29`) — der Suite-Prozess läuft als uid 1001 (`Dockerfile:26-27,47`), und der
    Import muss beide Pfade lesen können. Dazu die Zahl der META-JSONs gegen die Zahl der Nutzdateien
    (die Differenz ist die Menge ohne Metadaten) und ein Abgleich der META-`size` gegen die tatsächliche
    Dateigröße: jede Abweichung ist ein Kandidat für den überschriebenen echten Upload aus 3.1, und der
    ist nach dem Cutover nicht mehr feststellbar.
11. **Wie viele drop-Tokens sind zum Cutover-Zeitpunkt gültig, und wie lange?**
    `SELECT id, name, start, createdAt, expiresAt FROM apikey` in `data/auth/better-auth.sqlite`. Die
    Abfrage kann keine Rohtokens liefern — die existieren serverseitig nicht.
12. **Werden die Container-Logs aufbewahrt, und wer hat Zugriff?** Die rohen Share-Tokens stehen dort
    im Klartext und sind bis zum Ablauf gültige Zugangsdaten. Der Log ist zugleich die einzige Spur
    für Uploads ohne META — falls er existiert, ist er eine bessere Zeitquelle als die mtime.
13. **Darf der importierte Altbestand als virengeprüft gelten, oder wird er nachgescannt?** Keine
    einzige bestehende Datei ist je gescannt worden. Anschlussfrage, falls nachgescannt wird: was sehen
    Empfänger bestehender `/s/<id>`-Links, solange der Lauf läuft (Entscheidung 7)?
14. **Wie lange soll die Inbox Dateien halten, und darf ein Admin sie über die Web-UI löschen?**
    `drop` hat weder Frist noch Löschfunktion — beides ist eine fachliche Zusage, keine technische
    Entscheidung.
15. **Welche Domain bleibt für den Posteingang, und läuft sie während des Cutovers parallel?** Bei
    Parallelbetrieb ist der Befund „QR trägt die Origin des Erzeugers" akut.
16. **Braucht `files` eine PWA?** Das Suite-Muster ist ausdrücklich **ein** Modul = **ein** Host
    (`qr/manifest.webmanifest/route.ts:3-11`); bei zwei Hosts ist diese Voraussetzung weg. Ohne
    konkreten Bedarf: keine — es gibt in diesem Repo keinen erprobten Weg, ein Manifest host-abhängig
    **und** cachebar auszuliefern.
17. **Nutzt die Suite denselben Pocket-ID-Client, und wie heißen die Gruppen für `files`?** Es gibt
    genau eine Zugangs- und eine Admin-Gruppe für beide Domains.
18. **Wie groß darf `/data/files` werden, und ist `suite_data` in die Backups eingebunden?**
19. **Welche Architektur und wie viel freies RAM hat der Suite-Host?** Der Tag `clamav/clamav:1.4` hat
    nur ein `linux/amd64`-Manifest (gemessen 30.07.2026, 4.4) — auf arm64 muss es eine
    `-debian`-Variante sein, sonst bricht `docker compose up` mit „no matching manifest" ab. Und clamd
    belegt mit geladenen Signaturen ~1 GB RSS (986,5 bzw. 998,2 MiB in zwei Läufen), die zum
    Node-Prozess hinzukommen (Entscheidung 17).
20. **Gibt es im Bestand Dateien über 100 MiB** (`find /srv/fuekw/drop_inbox -size +100M`, dazu die
    Größenverteilung aus `share_files.size`)? Oberhalb dieser Kante scannt clamd im Image-Default nicht
    mehr — per INSTREAM mit einem Fehler, der den Prozess tötet, per Pfad mit einem stillen `OK`
    (Entscheidung 16). Dieselbe Größenordnung kappt Cloudflare, aber mit einer anderen exakten Zahl
    (100 MB; Plan-Eigenschaft der Zone, nicht gemessen).
21. **Wie viele Dateien umfasst ein realer Upload-Vorgang, und wie viele Melder hängen dabei an
    derselben Adresse?** Das ist der Eingangswert für Entscheidung 8: der drop-Client sendet eine Datei
    je Anfrage, streng sequenziell (`drop/web/src/hooks/use-upload.ts:243-246`), und das IP-Limit ist
    ein Ein-Minuten-Eimer (`drop/src/security.js:3-26`). Ohne diese Zahl ist nicht entscheidbar, ob der
    IP-Schlüssel heute schon Einsätze abwürgt oder erst in der Theorie. Quelle ohne Rückfrage: die
    Fastify-Zugriffslogs (`logger: true`, `drop/src/app.js:436`) — Zahl der `POST /u/…/upload` je Token
    und Minute; die Aufbewahrung dieser Logs steht ohnehin als Frage 12.

---

## Rohbefunde, die die Gegenprüfung widerlegt hat

Diese Aussagen stammen aus den Rohanalysen und haben die Gegenprüfung **nicht** überstanden. Sie stehen
hier, damit sie beim nächsten Durchgang nicht erneut „gefunden" werden.

1. **„`GRACE_PERIOD_HOURS` beeinflusst NUR den Löschzeitpunkt, niemals den Zugriff."** Widerlegt durch
   `actions.ts:61-66` (selbst nachgelesen): `updateShare` setzt `limit_reached_at` nur zurück, wenn
   `maxDownloads` auf `null` gesetzt wird. Nach dem Anheben eines Limits auf eine Zahl überlebt der
   Wert, und die Karenzprüfung sperrt den Share dauerhaft mit 410 — der Zugriff hängt also sehr wohl am
   Konfigurationswert. Der Defekt selbst steht in Abschnitt 2.3; nur die **Formulierung** „nur
   Löschzeitpunkt" ist falsch. **Zwei Analysen widersprechen sich hier ausdrücklich:** eine
   Gegenprüfung bestätigte die Aussage „der Grace-Zweig gewährt keinen Zugriff", zwei widerlegten sie.
   Beide haben teils recht — im Normalpfad gewährt die Karenz nie Zugriff, im Pfad über `updateShare`
   **verweigert** sie ihn. Wer den einen Halbsatz in die Spec schreibt, schreibt den falschen.
2. **„bucket → Wurzelverzeichnis ist die eine saubere, verlustfreie Abbildung."** Widerlegt durch den
   Befund im selben Bericht: der Key enthält einen ungeprüften Client-Dateinamen (`init/route.ts:68`).
   S3-Keys sind ein flacher Byte-Namensraum, Dateisystempfade nicht. Verlustfrei ist die Übernahme der
   **Strings** in der DB-Spalte — nicht ihre Interpretation als Pfad. Beide Aussagen können nicht
   gleichzeitig gelten.
3. **„Ein fehlender Storage-Key ergibt an allen drei Stellen einen 500er."** Widerlegt für die
   ZIP-Route: `zip:108` liegt innerhalb des `try` der IIFE (`:104-121`), und die Antwort ist mit Status
   200 und `Content-Type: application/zip` längst gesendet (`:127-131`). Dort entsteht ein
   **abgeschnittener Stream**, kein 500 und kein 404. Für Download (`:68-71`) und Preview (`:94-97`)
   trifft die Aussage zu.
4. **„Beide Auslieferungsrouten lesen `contentType ?? file.mimeType`, der DB-Wert ist toter
   Fallback."** Widerlegt für den Download: `download/[id]/route.ts:104` lautet
   `contentType ?? "application/octet-stream"` — dort gibt es **keinen** DB-Fallback (selbst
   nachgelesen). Nur die Preview nutzt `file.mimeType` (`:104-106`). Folge für die Spec: ein 1:1-Port
   des Downloads auf ein Dateisystem liefert pauschal `application/octet-stream`, wenn nicht bewusst
   umgestellt wird — eine andere Entscheidung als die Rohaussage nahelegt.
5. **„`NEXT_PUBLIC_APP_URL` ist nirgends gesetzt, also liefert SSR einen QR-Wert `/s/<id>` ohne
   Host."** Widerlegt: `appUrl` wird nur in `handleCopyLink` (im `onClick`) und im QR-Dialog benutzt,
   und der steckt hinter `{qrShareId && …}` mit `useState<string | null>(null)`
   (`shares-table.tsx:71,79-84,285`). Beim Server-Render ist `qrShareId` null, der Dialog wird gar
   nicht gerendert; sichtbar wird er erst nach einem Klick im Browser, wo `window.location.origin`
   greift. Der env-Zweig ist **unerreichbarer toter Code**, kein falsch ausgeliefertes Markup. Die
   Variable fehlt trotzdem in jeder Env-Datei — wer die QR-Erzeugung nach Server-Side verlegt, erzeugt
   dann lautlos hostlose Codes.
6. **„Der drop-Client leitet den Upload-Pfad aus `window.location.pathname` ab
   (`resolveUploadPath`/`resolveUploadContextPath`)."** Widerlegt: `resolveUploadContextPath` hat
   **keinen** Produktions-Aufrufer (der Kontextpfad entsteht in `web/src/lib/api.ts:82-86` aus dem
   React-Router-Param), und `resolveUploadPath` wird nur im else-Zweig benutzt —
   `upload-page.tsx:45-47` nimmt `/u/${token}/upload`, sobald der Router-Param existiert, und
   `App.tsx:13` liefert ihn immer. Die Pfade sind 1:1-pflichtig, die Begründung trägt nicht.
7. **„Der QR aus `scripts/generate-qr.js` zeigt am plausibelsten auf `/`, weil der Default
   `http://drop.local` ist."** Widerlegt: `README.md:104` dokumentiert den realen Aufruf ausdrücklich
   **mit** Token (`node scripts/generate-qr.js "https://drop.iuk-ue.de/u/<token>" …`). Der Default ist
   ein Fallback-Argument, kein Hinweis auf die Praxis — und „am plausibelsten" ist genau die
   Vermutungsformulierung, die dieses Projekt nicht zulässt.
8. **„207 heißt Teilerfolg: mindestens eine Datei geschrieben und mindestens ein Fehler."** Widerlegt:
   `app.js:407` lautet `reply.code(errors.length > 0 ? 207 : 200)` — **ohne** Bezug auf
   `uploaded.length`. Gemessen kommt 207 auch mit leerer `uploaded`-Liste, während die Datei auf der
   Platte liegt. Und ein Multipart **ohne** jeden Part liefert 200 mit `{"uploaded":[],"errors":[]}`.
9. **„Der Modul-Key MUSS `files` heißen, sonst bricht `assertHostConfig` den Boot ab."** Widerlegt:
   kein Code-Pfad liest die Zeichenfolge `files` — der einzige Vorkommen in `src` ist ein
   String-Argument in `hosts.test.ts:18`, und dieser Test konsultiert `MODULES` nie. Die `.env`-Zeile
   ist auskommentiert. Ein Modul `dateien` mit `SUITE_HOST_DATEIEN` läuft fehlerfrei durch. Die
   Vorbelegung bleibt trotzdem gültig (siehe Ende von Abschnitt 5).
10. **„In der Suite ist keine Body-Größe konfiguriert, also gibt es keine Grenze."** Widerlegt: es
    greifen zwei stillschweigende Defaults — Server Actions 1 MB mit HTTP 413, und der Next-Proxy
    10 MiB **ohne** Fehler (`config-shared.js:260`, `body-streams.js:85-101`). „Nichts konfiguriert"
    heißt hier „still gekappt", nicht „unbegrenzt".
11. **„`deleteAllExpiredApiKeys` läuft bei jedem create/verify/list/delete."** Widerlegt für den
    Verify-Pfad: dort hängt der Aufruf an `deferUpdates` (`index.mjs:1821`), und das ist per Default
    `false` und in `auth.js` nicht gesetzt. Der Massenlöscher läuft bei create, delete, get, list und
    update. **Die Schlussfolgerung „abgelaufene Tokens verschwinden physisch" trägt aber nur unter
    Verkehr** (nachgetragen 30.07.): `validateApiKey` löscht die einzelne Zeile beim nächsten Gebrauch
    (`index.mjs:1656-1682`), und der Massenlöscher hängt an den Key-Routen und ist auf einen Lauf je
    10 Sekunden gedrosselt (`:1898-1917`). Nach einem Token-Freeze fährt kein Verkehr mehr — dann
    stehen abgelaufene Zeilen weiter in `apikey`. Tragend für den Freeze ist die **Ungültigkeit**
    (`KEY_EXPIRED`), nicht das Verschwinden; siehe Entscheidung 15.
12. **„Die Karenz-Blöcke `if`/`preview` haben in allen drei Auslieferungsrouten dieselbe Form."**
    Widerlegt für die ZIP-Route: dort gibt es **kein** leeres `if` — `zip:36-41` geht direkt auf das
    410 bei `:43-48`. Der leere Block existiert in `download:40-47` und `preview:54-60`.
13. **„`addDownloads` verwandelt jedes unbegrenzte Share in ein begrenztes."** Überzogen: der
    Menüpunkt wird nur unter `{share.maxDownloads != null && …}` gerendert (`shares-table.tsx:258`),
    der NULL-Fall ist über die UI also nicht erreichbar; und für `max_downloads = 0` ist der
    Falsy-Zweig numerisch folgenlos (`amount` und `0 + amount` sind derselbe Wert). Der Code-Riecher
    bleibt, die Priorität sinkt deutlich.
14. **„Die AV-Fehler lassen die Anfrage hängen."** Nicht widerlegt, sondern **verschärft**: der
    Prozess stirbt (Exit 1, kein `uncaughtException`-Handler, `restart: unless-stopped`). Wer die
    mildere Formulierung übernimmt, unterschätzt die Reichweite im Monolithen.
15. **„Auslöser des AV-Fehlerpfads ist, dass die Antwort nicht mit `stream:` beginnt."** Zu eng:
    `stream: Can't allocate memory ERROR` beginnt mit `stream:` und wirft trotzdem. Richtig ist: alles
    außer exakt `stream: OK` und `stream: <x> FOUND` führt in den Fehlerpfad.

Die folgenden fünf Einträge stammen aus **diesem Dokument** und sind bei der Nacharbeit am 30.07.2026
widerlegt oder als unbelegt entfernt worden. Sie stehen hier aus demselben Grund wie die übrigen.

16. **„Ein drop-Token ist eine Zeile in `apikey`, die nach maximal 72 h physisch gelöscht wird —
    `auth.js:87-91` notiert `minExpiresIn: 1/24`/`maxExpiresIn: 3` in TAGEN, während der übergebene
    Wert Sekunden ist" (bisher in Abschnitt 1).** Der behauptete Einheitenfehler existiert nicht: das
    Plugin teilt vor dem Vergleich um (`const expiresIn_in_days = expiresIn / (3600 * 24)`,
    `@better-auth/api-key@1.5.5/dist/index.mjs:783-788`, im Änderungspfad `:1511-1513`; Version über
    den pnpm-Pfad geprüft). 259200 s sind genau 3 Tage — beide Zahlenpaare beschreiben dasselbe
    72-Stunden-Fenster, und die Grenze wird zusätzlich in der Route durchgesetzt
    (`drop/src/app.js:190-201,649-659`). Aus einem erfundenen Defekt wurde damit ein Befund, der
    Entscheidung 15 **stützt**: die Durchsetzung ist doppelt.
17. **„Der naheliegendste Fall ist `INSTREAM size limit exceeded`, also die Kollision der Größengrenze
    mit clamds `StreamMaxLength`" (bisher in Abschnitt 3.2).** Der Antworttext ist wörtlich bestätigt,
    die Ursache nicht: `StreamMaxLength` ist im Image kommentiert
    (`/etc/clamav/clamd.conf:139` `#StreamMaxLength 25M`) und in `clamconf -n` nicht als gesetzt
    geführt. Gemessen greift das Dateigrößen-Limit bei 104.857.600 B („File size limit set to
    104857600 bytes" im Startlog). Und die Antwort trägt **keinen** `stream:`-Präfix — sie landet also
    nicht im ERROR-Zweig, sondern im generischen `throw` (`antivirus.js:25`).
18. **„Weil kein Token länger als 72 h lebt und abgelaufene Zeilen physisch verschwinden, genügt ein
    Token-Freeze" (bisher in Entscheidung 15).** Die Schlussfolgerung bleibt, die Begründung nicht: das
    Löschen hängt an API-Key-Verkehr (siehe Rohbefund 11), und nach einem Freeze fährt keiner. Tragend
    ist `KEY_EXPIRED` aus `validateApiKey`. Praktische Folge: die Cutover-Erhebung darf keine Zeilen
    zählen, sondern muss `expiresAt` gegen die Uhrzeit vergleichen.
19. **„Ein Foto-Upload aus einem Einsatz sind 20–60 sequenzielle Anfragen von einer NAT-Adresse"
    (bisher in Entscheidung 8).** Die Spanne ist nirgends gemessen und stammt aus keiner Quelle —
    dieselbe Klasse wie Rohbefund 16. Belegbar sind die Mechanik (eine Datei je Anfrage, streng
    sequenziell, `drop/web/src/hooks/use-upload.ts:113-128,243-246`) und der Deckel
    (`RATE_LIMIT_PER_MIN`, Default 30, `drop/src/config.js:35`; Ein-Minuten-Eimer je IP,
    `drop/src/security.js:3-26`). Die reale Dateizahl je Vorgang ist eine Betreiberfrage
    (Abschnitt 8, Punkt 21).
20. **„Die zwei echten Domains — in keinem der beiden Repos auffindbar" (bisher Abschnitt 8, Punkt 1).**
    Für `easy-filesharing` stimmt es (nur Platzhalter, `scripts/setup.sh:60,77`), für `drop` nicht:
    `.env.example:11,13` und `README.md:39,104` nennen `drop.iuk-ue.de` — das widerspricht auch dem
    eigenen Rohbefund 7. Und die Frage selbst ist beantwortet: `share.iuk-ue.de` + `drop.iuk-ue.de`
    (Betreiber, 30.07., `KONSOLIDIERUNG-PROGRESS.md`, Phase-4-Abschnitt (Betreiberantworten 30.07.) und „Notizen / offene Fragen“), womit die Cookie-Anschlussfrage für die
    heutigen Hosts erledigt ist. Blockierend ist nur noch, welche Hosts die **Suite** bedient.

**Belegfehler, die die Gegenprüfung korrigiert hat** (die Sachaussagen stimmten jeweils, die
Zeilenangaben zeigten ins Leere): `easy-filesharing/.env` hat 30 Zeilen — `MAX_EXPIRY_DAYS` steht
`:17`, `GRACE_PERIOD_HOURS` `:18`, `MAX_FILE_SIZE` `:16`, `APP_URL` `:9` (nicht `:32`, `:33`, `:11`).
`file-view.tsx:48` statt `:44`; `folder-view.tsx:55` und `:65` statt `:56`/`:66`; `format.ts:54` statt
`:56-62`; `dashboard/page.tsx:54` statt `:53`; `edit-form.tsx:128` statt `:147`; alle
`package.json`-Zeilen um 2–4 versetzt (`archiver` `:16`, `@types/archiver` `:39`,
`@aws-sdk/s3-request-presigner` `:14`); `drop/README.md:91` statt `:97` und `:101` statt `:60-61`;
`drop/scripts/setup.sh:6` statt `:7`; Design-Spec `:255` statt `:250`.

**Belegfehler, die die Nacharbeit am 30.07.2026 korrigiert hat:** die Phase-4-Vorgaben in
`APP-KONSOLIDIERUNG.md` standen zwei Zeilen zu tief — „S3/MinIO → Volume" und der ClamAV-Sidecar stehen
in `:145` (nicht `:147`, das ist die Datenübernahme-Zeile), die Härtungsvorgabe in `:146` (nicht `:148`);
beide Zitate waren inhaltlich richtig, die Zeilenangaben nicht. Und `use-upload.ts` liegt in
`drop/web/src/hooks/`, nicht in `web/src/lib/` — die Zeilennummern `:126-128,243-246` stimmen. Zur
Vorsicht bei `KONSOLIDIERUNG-PROGRESS.md`: die Datei wächst laufend, ihre Zeilennummern sind nur mit
Ankertext belastbar; Stand 30.07.2026 stehen die Phase-4-Checkliste bei `:207-214`, die
Betreiberantworten bei `:199-201` und der Entscheidungs-Log-Eintrag zum OIDC-`sub` bei `:268`.

---

## Nicht als Quelle verwenden

`easy-filesharing/docs/superpowers/specs/2026-04-10-easy-filesharing-design.md` beschreibt die
**Absicht** und ist an fünf Punkten überholt; wo sie widerspricht, gilt das Schema: sie listet nur 12
`shares`-Spalten (`limit_reached_at` fehlt, kam mit Migration 0001), `download_logs` kommt **überhaupt
nicht** vor (eine Suche nach `audit|download_log|logs|limit_reached|grace` liefert 0 Treffer), sie
nennt „~59 Bit Entropie" (`:255`, tatsächlich 60), kündigt Rate-Limiting an (`:254`, nicht
implementiert) und beschreibt die Cleanup-Reihenfolge umgekehrt (`:154` gegen
`cleanup/route.ts:34-36`). Wer die neue Spec aus dem alten Design-Dokument statt aus dem Schema
ableitet, verliert genau die zwei Dinge, die nachträglich hinzugefügt wurden — und die der Auftrag
ausdrücklich verlangt.

`drop/README.md:11` nennt „atomare Writes" als Härtungsmerkmal; gemessen verlieren vier parallele
Uploads gleichen Namens zwei Dateien bei vier Erfolgsmeldungen. Und die Commit-Nachricht `c582dac`
behauptet, unbekannte ClamAV-Antworten würden „fail-closed" behandelt — gemessen sieht der Handler den
Fehler nie.

`drop/src/shared/*` ist toter Code und wird von `pnpm test` getestet; maßgeblich sind die TS-Zwillinge
unter `drop/web/src/lib/`.

Sentry ist in `drop` verdrahtet (und läuft im Container nicht), in der Suite bewusst gestrichen — nicht
mitportieren.

---

## Nacharbeit nach der Vollständigkeitskritik (Stand 2026-07-30)

Eine Vollständigkeitskritik gab das Dokument mit acht Lücken und fünf unbelegten oder falschen Aussagen
zurück. Die Nacharbeit ist am 30.07.2026 eingebaut; die Messungen dieses Tages sind als solche
gekennzeichnet. Aus **fünfzehn** Entscheidungen sind damit **zweiundzwanzig** geworden, aus 28 Fallen 31.

**Ergänzt**

- **Die Betriebsseite des ClamAV-Sidecars** — neuer Abschnitt 4.4 mit Messungen am Image, das `drop`
  benutzt (Manifest nur `linux/amd64`, ~1 GB RSS, Signaturen im Image plus Nachladen beim ersten Start,
  unauthentifizierter clamd auf allen Interfaces, Bereitschaftsfenster). Dazu drei Entscheidungen:
  **16** (Scan-Transport INSTREAM gegen Pfad, mit der gemessenen 100-MiB-Kante), **17** (Netz,
  Signatur-Volume, `depends_on`, Bedeutung von `unhealthy`) und **18** (wo der AV-Status liegt).
  Entscheidung 7 zeigt jetzt dorthin, 4.2 ebenso.
- **Eine Paritäts-Invariante für den drop-Zweig** (Abschnitt 5): Manifest als Quell-Arm mit Inhalts-Hash,
  benannter Ziel-Arm, drei Klassen (`payload`/`sidecar`/`part-rest`), Aufnahmezeitpunkt nach dem Freeze,
  Lesbarkeit des roten Reports und die feldweisen Stichproben, die die Byte-Parität nicht abdeckt. Die
  Kopplung an Entscheidung 5 steht dort **und** als Zeiger in Entscheidung 5.
- **Der Fileshare-Zweig des Imports** (Abschnitt 5): `size`/`total_size` sind Client-Selbstauskunft;
  daraus Falle 10, Entscheidung 20 und ein Abbruchkriterium, das nicht die Größengleichheit ist.
- **Die Einheitenkollision `MAX_FILE_SIZE` (Bytes) gegen `MAX_FILE_SIZE_MB` (MB)** — Falle 22 und
  Entscheidung 19; heute erzwingen beide gemessen dieselben 500 MiB, was die Zusammenlegung wie eine
  Nulloperation aussehen lässt.
- **`shares.created_by`** — Absatz in 2.1, Zeile in der 1:1-Tabelle (NOT NULL ohne Default),
  Entscheidung 21 und Falle 31 (Vergleich E-Mail gegen OIDC-`sub` trifft nie).
- **`core/qr` in 4.1** — die suiteweit verbindlichen `QR_OPTIONS`; neu erzeugte Codes sehen anders aus
  als in beiden Altsystemen (H/4 gegen L/0 bzw. M/1), der Inhalt bleibt gleich. Dazu drops
  serverseitiger QR-Endpunkt `POST /api/admin/qrcode` in 3.1 und Entscheidung 22 („welcher Host steht in
  einem neu erzeugten Code?"), auf die Falle 17 und 4.1 jetzt zeigen.
- **Das drop-Postfach nach dem Umschwenk** — Teilfrage 15a in Entscheidung 15: Bind-Mount gegen
  benanntes Volume, zwei Postfächer während des Standby, zwei Quellpfade, und wie der Betreiber danach
  an die Dateien kommt.
- **Abschnitt 8** um die Punkte 19 (Architektur und RAM des Suite-Hosts), 20 (Dateien über 100 MiB) und
  21 (Dateien je realem Upload-Vorgang) erweitert; Punkt 2 um die `created_by`-Abfrage, Punkt 10 um den
  META-Pfad und die Dateieigentümer, Punkt 5 um die `.env`-Lage beider Apps.

**Korrigiert** (die falschen Fassungen stehen als Rohbefunde 16–20 am Ende, damit sie nicht erneut
„gefunden" werden)

- Abschnitt 1: der behauptete Einheitenfehler im api-key-Plugin existiert nicht — das Plugin rechnet
  Sekunden in Tage um. Die Stelle beschreibt jetzt die **doppelte** Durchsetzung der 72 h.
- Abschnitt 3.2: die kollidierende Grenze ist nicht `StreamMaxLength`, sondern das Dateigrößen-Limit bei
  104.857.600 B; die Antwort trägt keinen `stream:`-Präfix.
- Entscheidung 15: der Token-Freeze ruht auf der **Ungültigkeit** abgelaufener Zeilen, nicht auf ihrem
  Verschwinden. Rohbefund 11 ist entsprechend nachgezogen.
- Entscheidung 6: „bis 500 MB" war unbelegt und als Transportmaß falsch — auf den heutigen Hosts kappt
  Cloudflare bei 100 MB pro Anfrage.
- Entscheidung 8: die Spanne „20–60 sequenzielle Anfragen" ist durch Messwerte ersetzt (eine Datei je
  Anfrage, sequenziell; Ein-Minuten-Eimer je IP, Default 30) plus eine ausdrücklich als Herleitung
  gekennzeichnete Schwelle.
- Entscheidung 9: die Cookie-Scope-Aussage war eine Feststellung ohne Beleg für die Lage der Domain; sie
  ist jetzt getrennt in „SVG ist im Origin ausführbar" (unabhängig wahr) und „wie weit es trägt".
- Abschnitt 8, Punkt 1: „in keinem der beiden Repos auffindbar" war für `drop` falsch; blockierend ist
  jetzt die Frage nach den Ziel-Hosts der Suite.
- Belegfehler: `APP-KONSOLIDIERUNG.md:147/:148` → `:145/:146`; `use-upload.ts` liegt in
  `drop/web/src/hooks/`.

**Was die Nacharbeit nicht bestätigen konnte**

- **Ob clamd `/data/files` tatsächlich lesen kann.** Die uids sind gemessen (clamd 100:101, Suite
  1001:1001), der Modus von `/data` und der geschriebenen Dateien **nicht**. Deshalb steht das in
  Entscheidung 16 als Anforderung an die Spec und als Prüfung an der laufenden Instanz.
- **Die Ladezeit von clamd am Zielhost.** Die 120 s aus `drop` sind eine gesetzte `start_period`, keine
  Messung; die eigenen 17 s stammen von amd64 **unter Emulation** und mit drei Tage altem
  Signaturstand. Die strukturelle Aussage (es gibt ein Bereitschaftsfenster, die Suite hat kein
  `depends_on`) braucht die Dauer nicht.
- **Wie viel ein Recreate ohne Signatur-Volume wirklich kostet.** Gemessen sind 110.140 KiB im Image
  und 171.388 KiB nach dem ersten Start — also ~57 MiB Nachladen bei kleinem Versionsabstand, nicht der
  ganze Bestand. Dass es der ganze wird, gilt nur bei großem Abstand (Herleitung).
- **Welche Container heute am externen `proxy`-Netz hängen.** `proxy` ist `external: true`, sein Inhalt
  liegt außerhalb des Repos. Die Offenheit von clamd ist als Eigenschaft des Netzes formuliert, nicht
  als Aufzählung realer Nachbarn.
- **Ob die belegten Fehlerfälle in Produktion vorkommen** — der überschriebene echte Upload (3.1) und
  ein Client, der `size: 1` meldet und beliebig viele Chunks schickt (Entscheidung 19): beides ist aus
  dem Code hergeleitet und im Text so gekennzeichnet, nicht an Produktionsdaten bzw. einer laufenden
  Instanz gemessen. Ebenso ist die Abgrenzung der `part-rest`-Klasse aus `sanitizeFilename` **gelesen**,
  nicht gegen Beispielnamen ausgeführt.
- **Was Docker mit einem fehlenden Bind-Quellpfad tut** (Teilfrage 15a, Option (c)) — nicht überprüfbar;
  die Aussage ist als Anforderung an den Rollback-Schritt formuliert. Ebenso ungeprüft: dass
  `/srv/fuekw/drop_inbox` und das Deploy-Verzeichnis auf dem Server tatsächlich so liegen — dafür gibt
  es nur `drop/docker-compose.yml:12-13`, keinen Serverzugriff.

**Nachträge nach der Re-Kritik (30.07., von Hand):** Die Re-Kritik bestätigte alle dreizehn Punkte als
geschlossen (`spec_kann_beginnen`) und fand dabei vier neue Ungenauigkeiten, die anschließend behoben
wurden: die Zählung „drei Zahlen an drei Orten" bezeichnete zwei verschiedene Tripel und war zu klein
(es sind **vier** Größen — Aufstellung bei Falle 22) · `UPLOAD_HINT_MAX_LENGTH` ist eine **Zeichen**-,
keine Bytegrenze (`slice` auf UTF-16-Code-Units) · der Cookie-Scope war mit `compose.yaml:25` belegt,
das dort nur ein `${…:-…}`-Vorgabewert ist · der `.env`-Vorbehalt widersprach sich zwischen Abschnitt 5
und 8. Dazu zwei Dinge, die kein Kritiker angemerkt hat: die Cloudflare-Kante war über den
Phase-4-Vorspann von `KONSOLIDIERUNG-PROGRESS.md` **im Kreis belegt** (die Zeile dort stammt aus
derselben Betreiberangabe, nicht aus einer Messung) und ist jetzt als Plan-Eigenschaft mit
Runbook-Messung gekennzeichnet; und **alle Zeilennummern-Verweise in `KONSOLIDIERUNG-PROGRESS.md` sind
durch Abschnittsnamen ersetzt** — die Datei wird laufend beschrieben, ein positionsgebundenes Zitat
dorthin ist binnen Stunden falsch. `APP-KONSOLIDIERUNG.md` ist seit dem 23.07. unverändert; dessen
Zeilenbelege sind stichprobenhaft geprüft und bleiben.

Der Phase-4-Vorspann in `KONSOLIDIERUNG-PROGRESS.md` trägt jetzt die richtigen Kennzahlen (22
Entscheidungen, 25 1:1-Pflichten, 31 Fallen).
