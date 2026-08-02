# Design: Modul `files` — Spec 1 (der ganze Bau, lokal)

> Phase 4 der Konsolidierung. Das Modul `files` ersetzt **zwei** Alt-Apps und bedient **zwei** Domains:
> `easy-filesharing` (Shares mit Passwort/Ablauf/Download-Limit, Audit-Log, ZIP, Preview, QR; heute
> S3/MinIO) und `drop`/fuekw-dropzone (anonyme Upload-Inbox `/u/<token>`, Mehrfach-Upload,
> Kategorien/Hinweise, QR, ClamAV).
>
> **Faktenbasis:** `docs/files-portierung-analyse.md` (2383 Zeilen; 22 Entscheidungen, 25
> 1:1-Pflichten, 31 Fallen). Jede Aussage über Bestandscode dort ist belegt; diese Spec zitiert
> Belege erneut, wo sie eine Festlegung tragen.
> **Querschnittsregeln:** `docs/design/README.md`. **Projektregeln:** `CLAUDE.md`.
> **Formvorbilder:** `docs/superpowers/specs/2026-07-24-feedback-modul-design.md`,
> `docs/superpowers/plans/2026-07-24-feedback-modul.md`.
>
> Zielstack: Next.js 16 (App Router/RSC) · Drizzle + better-sqlite3 · Auth.js v5 (Pocket ID) ·
> Ant Design 6 · Vitest + Playwright. Eine SQLite-DB pro Modul (`files.db`).

---

## 1. Gegenstand und Abgrenzung

### 1.1 Was Spec 1 enthält

**Der ganze Bau, lokal lauffähig und lokal abnehmbar.** Alles, was ohne Produktionsdaten und ohne
Domainwechsel gebaut und geprüft werden kann:

1. **Modulgerüst** — Registrierungs-Dreieck, Registry-Eintrag, Zugangsgruppe, Shell-Varianten,
   `nav`-Slot, Route-Baum, Modul-DB samt Migrationen (§2).
2. **Host-Rollen** — `resolveRole`, `hostFuerRolle`, Boot-Prüfung, Dev/E2E-Zweihost-Aufbau (§3).
3. **Datenmodell** — vollständiges Drizzle-Schema für beide Richtungen (§4).
4. **Storage-Schicht** — vier Operationen, Pfadschema, atomares Schreiben, Backup-Erweiterung (§5).
5. **AV-Pipeline** — Statusmodell, Scanner-Vertrag, Compose-Sidecar, Grenzen, fail-closed, Adresse des
   Scanners und der **Fake-clamd für Dev und E2E** (§6, insbesondere §6.8 — ohne ihn erreicht lokal
   keine Datei je `clean`, und das Modul ist unbenutzbar).
6. **Fileshare-Seite** — Anlegen (chunked), Verwaltung, `/s/<id>`, serverseitiges Passwort-Gate,
   Ablauf/Limit/Karenz, ZIP, Preview, Download-Header, Audit-Log, QR (§7).
7. **Inbox-Seite** — `/u/<token>`, Mehrfach-Upload, Kategorien/Hinweis, Posteingang-Ansicht,
   Zugangslink-Verwaltung, Härtung, QR (§8).
8. **Grenzen und Zahlen** — die vier Größen, die drei Kappungsebenen, Namen mit Einheit,
   Boot-Prüfungen (§9).
9. **Aufräum-Timer** — interner Timer mit Protokollzeile und Trockenlauf-Schalter (Analyse E13 (b)).
10. **Compose-Änderungen** — clamav-Sidecar, internes Netz, Signatur-Volume, eigener
    `/data/files`-Mount, `depends_on`.
11. **`scripts/backup.sh`** — Erweiterung auf die Blobs (heute sichert es ausschließlich `*.db`,
    `scripts/backup.sh:13-15,29-33` — nach diesem Umbau lägen die Dateien außerhalb des Backups und
    das Backup meldete Erfolg).
12. **Zwei `core`-Hebungen** mit heute belegbarem zweitem Nutznießer (§2.6).

### 1.2 Was ausdrücklich Spec 2 ist

- **Import beider Alt-Bestände** — `scripts/import/files.ts` (Fileshare-DB), `dropParityView` und
  Manifest über den Dateibaum, Blob-Umzug aus MinIO, Paritätscheck, feldweise Stichproben,
  Differenzbericht für `size` (Analyse Abschnitt 5 vollständig).
- **AV-Nachscan des Altbestands** (Analyse E7 (f)) — Runbook-Lauf vor dem Umschwenken.
- **Generalprobe** mit Snapshot-Kopie.
- **Beide Cutover** — `SUITE_HOST_FILES`, `SUITE_TRAEFIK_RULE`, Reihenfolge, Token-Freeze,
  Markierungsdatei im Alt-Postfach (Analyse E15 (b)), Standby, Rollback.
- **Erhebung aller Serverzahlen** (Analyse Abschnitt 8, Punkte 1–21).
- **Abschalten des alten Cleanup-Cron**, falls es einen gibt (Analyse Abschnitt 8, Punkt 7).

Spec 1 baut **nichts**, was Produktionsdaten braucht. Umgekehrt erfindet Spec 1 **keine Zahl**, die
nur der Server kennt: solche Werte sind als benannte Env-Variable ohne Vorbelegung geführt und
brechen den Boot ab, wenn sie fehlen (§9.4). Das ist Absicht — eine erfundene Vorbelegung ist genau
Falle 22 der Analyse in neuer Gestalt.

### 1.3 Was Spec 2 von hier erbt

Diese Liste ist verbindlich. Wo Spec 2 davon abweicht, ist es ein Fehler in Spec 2, nicht hier.

| Festlegung | Wert | Folge für Spec 2 |
|---|---|---|
| Modul-Key | `files` | DB-Datei `files.db`, `SUITE_HOST_FILES`, `SUITE_ADMIN_GROUP_FILES` |
| Migrationsverzeichnis | `src/app/m/files/_db/migrations` | Dateinamen erzeugt drizzle-kit; Spec 2 liest sie aus `_journal.json`, sie werden **nicht** erfunden (§2.2) |
| Zeitstempel-Einheit | Unix-**Sekunden**, Drizzle `mode: "timestamp"` | Import-Mapper normalisiert auf ganze Sekunden; Faktor-1000-Fehler ist paritätsgrün (§4.1) |
| Pfadschema Shares | `<DATA_DIR>/files/<shareId>/<fileId>` | Blob-Umzug schreibt dorthin; Quellpfad existiert im Ziel nicht mehr → Paritäts-Schlüssel ist der Inhalts-Hash, nicht `relPath` |
| Pfadschema Inbox | `<DATA_DIR>/files/inbox/<inboxFileId>` | dito; Namenskollisionen der Altdaten verschwinden strukturell |
| Gestrichene Spalten | `shares.limit_reached_at`, `shares.s3_prefix`, `share_files.s3_key` | Mapper führt sie **nicht** mit; `s3_key` wird nur **quellseitig** gelesen, um das MinIO-Objekt zu finden (§4.2, §4.3) |
| Umbenannte Spalte | `download_logs.ip` → `client_ip_unbestaetigt` | spaltenweiser Import bildet ab; Name trägt die Aussage (Analyse E12) |
| Absenderadressen **gekürzt** | IPv4 letztes Oktett `0`, IPv6 `/48`, eine Funktion `_lib/ip.ts` | der Import führt **jede** Altzeile (`download_logs`, `inbox_files`-META) durch dieselbe Funktion; ungekürzte Altadressen einzuspielen wäre E12 (c) rückwärts (§4.5) |
| `download_logs` ohne FK-Cascade | eigene Frist `FILES_LOG_AUFBEWAHRUNG_TAGE` | Import darf Zeilen ohne existierende `share_files.id` behalten (der FK fehlt heute, Waisen sind möglich) |
| `download_logs.id` | nicht erhaltungspflichtig | der Mapper darf neu vergeben; nichts verweist auf diese IDs (§4.5) |
| Statuswerte AV | `scanning` · `clean` · `infected` · `error` · `unscanned` | Altbestand kommt als `unscanned` an; CHECK kennt alle fünf (§6.2) |
| `shares.created_by` | neue Zeilen `sub`, Altbestand Platzhalter `import:easy-filesharing` | Mapper setzt den Platzhalter für **jede** Altzeile; Anzeige zeigt „Altbestand — nicht zuordenbar" (Analyse E21 (c)) |
| `share_files.bytes_vollstaendig_at` | neu, nullable | Import setzt sie für jede Zeile **mit** vorhandenem Blob; Zeilen ohne Blob bleiben NULL und werden berichtet (§4.2) |
| `inbox_files.empfangen_at` | Unix-Sekunden, NOT NULL | für META-lose Altdateien ist die Quell-`mtime` die einzige Zeitquelle und muss hierhin; der Ziel-Arm der Parität liest sie von dort (Analyse Abschnitt 5) |
| `inbox_files.mime_type` | **nullable** | `drop` persistiert keinen MIME-Typ — kein erfundener Wert im Import |
| `inbox_files.token_id` | nullable | für den gesamten Altbestand NULL (keine Datei ist einem Token zuzuordnen) |
| Inbox-Kategorie | Spalte, kein Verzeichnis; Anzeige toleriert unbekannte Werte | maßgeblich ist der **Verzeichnisname** der Quelle, nicht das META-Feld `category` |
| Inbox-Hinweis | Spalte, keine Sidecar-`.txt`, keine META-JSON | Sidecars gehen **nicht** ins Paritäts-Multiset ein, werden aber gezählt und mit Pfad berichtet (Analyse Abschnitt 5, Kopplung an E14) |
| Zugangslinks | eigene Tabelle `zugangslinks`, eigenes Hash-Verfahren | das better-auth-`apikey`-Schema wird **nicht** nachgebaut; Voraussetzung ist der 72-Stunden-Token-Freeze (§8.6, Analyse E15) |
| `total_size`/`size` | gemessene Bytezahl | Analyse E20 (b): Messung beim Umzug, vollständiger Differenzbericht, ausdrücklich als Entscheidung, nicht als stille Korrektur |
| Löschregel | `expires_at` + `FILES_LOESCH_KARENZ_STUNDEN`, für **alle** Shares | der erste Lauf nach dem Cutover ist ein Löschereignis → Trockenlauf zuerst (§7.6) |
| Host-Rollen | `SUITE_HOST_FILES` Index 0 = `verwaltung`, Index 1 = `inbox` | die `.env`-Zeile trägt ab dem **ersten** Termin **beide** Hosts in dieser Reihenfolge; ein einzelner Host bricht den Boot ab (§3.3) |
| Rollback-Mechanik | Erreichbarkeit steuert **nur** `SUITE_TRAEFIK_RULE` | ein Teil-Rollback entfernt den Host aus der Traefik-Regel und **lässt `SUITE_HOST_FILES` unverändert**; erst der vollständige Rollback leert die Variable (§3.3) |

---

## 2. Modulgerüst

### 2.1 Route-Baum

```
src/app/m/files/
  _db/
    schema.ts               Drizzle-Tabellen (§4)
    client.ts               export const getDb = () => getModuleDb("files", schema)
    drizzle.config.ts        repo-root-relativ, dbCredentials.url "./.data/files.db"
    migrations/             von drizzle-kit erzeugt + meta/_journal.json
    migrations.test.ts      echter Migrationslauf: Spalten, Typen, CHECK, Indizes, Sekunden-Mode
    gleichzeitigkeit.test.ts  N parallele Zähl-/Budget-Vorgänge gegen eine echte SQLite (§11.1)
  _lib/                     KEIN "use client" in diesem Ordner (Falle 6 / docs/design/README.md:87-103)
    hostRolle.ts            resolveRole, rolleOderNull, requireRolle, hostFuerRolle,
                            oeffentlicheUrl, validateFilesHosts
    access.ts               isFilesAdmin, requireFilesAccess (Backstop)
    grenzen.ts              alle Zahlen und Einheiten an EINER Stelle (§9)
    storage.ts              schreibeStrom, lieseStrom, loesche, groesse (§5)
    av.ts                   AV_STATUS, istFreigegeben, scanne, Warteschlange (§6)
    mime.ts                 Magic-Byte-Tabelle + Abgleich (§8.5)
    passwort.ts             bcrypt-Verify/Hash + Cookie-Signatur (§7.4)
    token.ts                Inbox-Token-Grammatik dz-xxxx-xxxx-xxxx, Hash, Normalisierung
    zip.ts                  Eintragsnamen, Titel-Sanitizing, Abbruchbehandlung
    aufraeumen.ts           Löschregeln + Trockenlauf (reine Funktionen)
    kategorien.ts           Kategorie-Werte, Schreib-Validierung, Anzeige-Toleranz (§8.3)
    ip.ts                   ipKuerzen — die EINE Kürzungsstelle für Absenderadressen (§4.5)
    nav.ts                  SuiteNavItem[] der Verwaltung; zwei Server-Importeure (§2.7)
    <je *.test.ts daneben>
  _ui/                      antd-Bausteine der Verwaltung + files.css (--fi-*)
    VerwaltungsRahmen.tsx   Shell + nav, EINE Stelle, zwei Importeure (§3.5)
    OeffentlicherRahmen.tsx chrome-loses Gerüst + files-public.css, zwei Importeure
    InboxStart.tsx          Inhalt der Inbox-Wurzel; gerendert von `/` und von `/u`
  page.tsx                  ROLLEN-VERTEILER — die EINZIGE Seite, die auf `/` auflöst (§3.5)
  (verwaltung)/             Route-Group, full-Shell, gegatet — OHNE eigene page.tsx (§3.5)
    layout.tsx              requireRolle("verwaltung"); requireFilesAccess; VerwaltungsRahmen
    shares/neu/page.tsx     Anlegen (Server Action + chunked Upload)
    shares/[id]/page.tsx    Detail incl. Audit-Log
    shares/[id]/bearbeiten/page.tsx
    posteingang/page.tsx    Inbox-Ansicht (E14 a)
    zugangslinks/page.tsx   Inbox-Tokens anlegen/widerrufen + QR
    actions.ts              Server Actions, jede mit requireFilesAccess
  (oeffentlich-share)/      Rolle verwaltung, chrome-los, KEIN antd (docs/design/README.md:15-21)
    layout.tsx              requireRolle("verwaltung"); OeffentlicherRahmen
    s/[id]/page.tsx         öffentliche Share-Ansicht (Passwort-Gate serverseitig)
  (oeffentlich-inbox)/      Rolle inbox, chrome-los, KEIN antd
    layout.tsx              requireRolle("inbox"); OeffentlicherRahmen
    u/[token]/page.tsx      Inbox-Abgabe
    u/page.tsx              Inbox-Startseite (ohne Token), rendert InboxStart
  api/                      ALLE Route Handler des Moduls (Falle 15/16, §2.5)
    s/[id]/verify/route.ts          Passwort prüfen, Cookie setzen
    s/[id]/qr.png/route.ts          Share-QR
    download/[id]/route.ts          eine Datei
    download/[id]/zip/route.ts      ZIP des Shares
    preview/[id]/route.ts           Inline-Vorschau
    upload/[fileId]/route.ts        Chunk-PUT + GET (Fortschritt) für Shares
    u/[token]/upload/route.ts       Chunk-PUT für die Inbox + POST-Altweg (§8.2)
    u/[token]/qr.png/route.ts       Inbox-QR
    inbox/[id]/route.ts             Download aus dem Posteingang (gegatet)
```

`_`-Ordner sind Next Private Folders und erzeugen keine Routen. Die drei Route-Groups tragen die
beiden Gestaltungsklassen aus `docs/design/README.md:15-21` und ihre getrennten Layouts;
Route-Groups erscheinen in keinem URL-Pfad, die öffentlichen Pfade bleiben also wörtlich `/s/<id>`
und `/u/<token>` (1:1-Pflicht). **Genau deshalb gibt es keine `(verwaltung)/page.tsx`:** sie und
`page.tsx` lösten beide auf `/m/files` auf, und `next build` bricht mit „You cannot have two parallel
pages that resolve to the same path" ab (§3.5). `feedback` hat aus demselben Grund kein
`src/app/m/feedback/page.tsx` neben `(admin)/page.tsx` — gemessen am Repo: die Datei existiert dort
nicht.

**Warum die öffentliche Gestaltungsklasse ZWEI Route-Groups braucht.** Ein Layout bekommt im App
Router `children` und `params` — **keinen** pathname. Eine Group `(oeffentlich)`, die `/s/<id>` und
`/u/<token>` gemeinsam trägt, könnte ihre Rolle deshalb nicht „je Pfad" prüfen: die beiden Pfade
gehören zu **verschiedenen** Rollen (§3.2). Mit zwei Groups trägt jedes Layout **genau eine**
Rollenzusicherung und die Prüfung bleibt an einer Stelle je Pfadraum. Die dritte Gruppe
(`(verwaltung)`) trägt die Rolle `verwaltung` **plus** den Zugriffsriegel.

**Rolle je Route Handler — Route Handler haben kein Layout.** Die Rollensperre aus §3.2 erreicht die
Handler unter `api/` nicht über die Group-Layouts. Jeder Handler löst die Rolle deshalb **selbst**
auf, als erste Anweisung:

```ts
if (rolleOderNull(req.headers) !== "inbox") return new Response("Not found", { status: 404 });
```

**`rolleOderNull` und nicht `requireRolle`:** in einem Handler ist ein `notFound()`-Wurf keine
brauchbare Antwort auf einen Download-Link, also gehört die 404 dem Handler selbst
(`requireRolle` bleibt die Form für Layouts und Seiten, §3.2). Die Begründung für „je Handler" ist
dieselbe wie bei `requireFilesAccess()` in §2.4: „eine Seiten-Prüfung erstreckt sich nicht auf die
Actions darunter". Verbindliche Zuordnung:

| Route | Rolle | Zugriff |
|---|---|---|
| `POST /api/s/[id]/verify` | `verwaltung` | öffentlich (Rate-Limit, §7.4) |
| `GET /api/s/[id]/qr.png` | `verwaltung` | öffentlich (geklemmtes `?w=`, §7.9) |
| `GET /api/download/[id]` | `verwaltung` | öffentlich + Passwort-Cookie |
| `GET /api/download/[id]/zip` | `verwaltung` | öffentlich + Passwort-Cookie |
| `GET /api/preview/[id]` | `verwaltung` | öffentlich + Passwort-Cookie |
| `PUT`/`GET /api/upload/[fileId]` | `verwaltung` | `requireFilesAccess()` |
| `PUT`/`POST /api/u/[token]/upload` | `inbox` | anonym, Token-Guard (§8.4) |
| `GET /api/u/[token]/qr.png` | `inbox` | `requireFilesAccess()` (§8.7) |
| `GET /api/inbox/[id]` | `verwaltung` | `requireFilesAccess()` |

Ohne diese Spalte wäre `PUT /m/files/api/u/<token>/upload` über den **Verwaltungs**-Host erreichbar —
und über jeden Host, dessen `moduleForHost` auf `files` zeigt, weil `core/routing.ts:57-67` den
internen `/m/<key>`-Pfad bei `requiresAuth: false` ungegatet durchlässt (gemessen am Quelltext:
`if (target.requiresAuth && groups === null)` greift nicht, `canAccess` steigt mit `true` aus). Genau
diese Sperre verlangt Analyse E15 (d) für das Fenster zwischen den zwei Cutovern. Sie ist per E2E über
**alle** Routen dieser Tabelle belegt, nicht per Stichprobe (§11.5).

### 2.2 Das Registrierungs-Dreieck

Drei zusammenpassende Einträge, per Test gekoppelt (`core/bootstrap.test.ts:37-63`) — fehlt der
dritte, läuft es lokal und bricht im Container (`CLAUDE.md:36-40`):

1. **`_db/`-Ordner** unter `src/app/m/files/` mit `migrations/`.
2. **`MODULE_MIGRATIONS`-Eintrag** in `src/core/bootstrap.ts:17-21`:
   `{ key: "files", migrationsFolder: "src/app/m/files/_db/migrations" }`.
3. **`COPY`-Zeile** im `Dockerfile` neben `Dockerfile:35-37`:
   `COPY --from=builder --chown=nextjs:nodejs /app/src/app/m/files/_db/migrations ./src/app/m/files/_db/migrations`.

**Und eine vierte Zeile im selben `Dockerfile`, die kein Test erzwingt:**

```dockerfile
# Dockerfile:44 lautet heute `RUN mkdir -p /data && chown nextjs:nodejs /data`.
RUN mkdir -p /data/files && chown nextjs:nodejs /data /data/files
```

**Gemessen (30.07.2026, Docker 29.4.0, `alpine`, uid/gid 1001 wie `Dockerfile:26-27,47`):** Ein
**leeres benanntes Volume** übernimmt Eigentümer und Modus des Pfades **aus dem Image** — aber nur,
wenn der Pfad dort existiert. Drei Läufe:

| Lage | `ls -ldn` des Mountpunkts | `touch` als uid 1001 |
|---|---|---|
| Volume auf `/data` (im Image angelegt + `chown`) | `1001 1001` | **OK** |
| Volume auf `/data/files` (im Image **nicht** angelegt) | **`0 0`** | **Permission denied** |
| Volume auf `/data/files`, Pfad im Image angelegt + `chown` | `1001 1001` | **OK** |

Ohne diese Zeile schlägt also **jeder** Blob-Schreibvorgang fehl, sobald `files_data` als eigener
Mount dazukommt (§6.5) — und weil `/data` selbst weiter beschreibbar ist, sähe es nach einem
Rechte-Rätsel aus, nicht nach einer fehlenden Dockerfile-Zeile. Die Boot-Prüfung aus §9.4 macht es
laut; diese Zeile macht es unnötig. Bei einem **Bind**-Mount (§13, Frage 11) gilt sie nicht — dort
zählt das Eigentum am Host-Verzeichnis, und das ist uid **1001**, nicht 1000 wie bei `drop`.

**Was die drei Läufe NICHT abdecken:** die **verschachtelte** Lage, die §6.5 tatsächlich baut —
`files_data:/data/files`, **während** `suite_data:/data` gemountet ist. Gemessen wurde die
Volume-Initialisierung ohne den mitgemounteten Elternvolume; ob Docker das leere `files_data` dann aus
dem **Image-Layer** oder aus dem bereits gemounteten Inhalt von `suite_data` initialisiert, ist damit
nicht belegt. Weil `suite_data` produktiv seit dem ersten Modul existiert und **nicht** neu
initialisiert wird, kann der Unterschied nur beim ersten `up -d` mit dem neuen Mount auftreten. Das ist
kein Grund, die Dockerfile-Zeile zu lassen — sie ist in jedem der Fälle richtig —, aber ein
Runbook-Schritt: nach dem ersten `up -d` im Container `ls -ldn /data/files` und ein `touch` als uid
1001 (§13.3, Frage 22). Die Boot-Prüfung §9.4 Punkt 6 fängt es laut ab, aber erst dort.

Dazu zwei Einträge, die **still** scheitern und deshalb auf die Checkliste gehören:

4. **Registry-Eintrag** in `src/core/registry.ts` `MODULES` (§2.3). Ohne ihn wirft `getModule("files")`
   und `moduleForHost` findet den Host nie.
5. **Schema-Import** in `core/bootstrap.ts`. Ein **Seed** gibt es bewusst **nicht** (§2.4) — genau
   damit die Falle „vergessener `seedFiles`-Aufruf sieht wie ein Datenproblem aus" (Analyse Falle 21,
   `core/bootstrap.ts:52-56` ist nicht testgekoppelt) hier gar nicht entstehen kann.

**Die Migrationsdateinamen werden nicht vorgegeben.** drizzle-kit erzeugt `0000_<zwei-Wörter>.sql`;
jeder hier genannte Name wäre erfunden. Verbindlich ist der Ordnerpfad, der `MODULE_MIGRATIONS`-Key
und die Regel für Spec 2: die Namen kommen aus `src/app/m/files/_db/migrations/meta/_journal.json`.

**Der Fehler-Schlucker der Alt-App darf nicht mitkommen.** `easy-filesharing` migriert beim ersten
DB-Zugriff in einem `try/catch` mit `console.warn` (`lib/db/index.ts:20-28`). In der Suite migriert
`migrateAllModules()` beim Boot (`core/bootstrap.ts:39-45`) und ein Fehler bricht den Start ab. Das
bleibt so.

### 2.3 Registry-Eintrag

```ts
// files: zwei Prod-Hosts in EINER Variable, die Reihenfolge trägt die Rolle
// (Index 0 = Verwaltung/Shares, Index 1 = Inbox) — siehe _lib/hostRolle.ts.
// requiresAuth MUSS false bleiben: sonst schickt die Middleware jeden anonymen
// /s/<id>- und /u/<token>-Aufruf in den Login (routing.ts:71-73), und zwar
// sofort beim Cutover. Dadurch liest canAccess() requiredGroups hier NIE
// (früher Ausstieg bei !requiresAuth, registry.ts:133) — durchgesetzt wird der
// Zugang modul-intern in _lib/access.ts.
{ key: "files", title: "Dateien", icon: "FolderOutlined", shell: "full",
  requiresAuth: false, requiredGroups: [], adminGroups: ["drk-files-admin"],
  prodHosts: [], showInSwitcher: true },
```

- `prodHosts: []` — vor dem Cutover hat das Modul keine Prod-Domain; das ist dieselbe Lage wie bei
  `qr` und `feedback` (`registry.ts:49-51,65-67`). Der App-Switcher zeigt es dann nicht
  (`switcherEntries.ts:11-13` verwirft Module ohne URL). In Dev/E2E kommen die Hosts aus
  `SUITE_HOST_FILES` (§3.4).
- `shell: "full"` gilt für die Verwaltung. Der Registry-Wert ist nur die Vorgabe; das Layout
  entscheidet je Route-Group (die beiden `(oeffentlich-*)`-Layouts binden keine `Shell` ein, Vorbild
  `feedback/f/layout.tsx:20-26`).
- `icon` muss ein **Schlüssel der `ICONS`-Map in `SuiteNav.tsx`** sein — **nicht** bloß ein
  existierender `@ant-design/icons`-Komponentenname. Diese Formulierung stand hier zuerst falsch und
  hat den Fehler sofort erzeugt: `FolderOutlined` existiert bei antd, stand aber nicht in der Map, und
  der Eintrag trug daraufhin **still** das Portal-Icon (Rückfall auf `AppstoreOutlined`, Analyse
  Falle 21) — kein Fehler, kein Log, kein rotes Gate. Behoben am 30.07.: `FolderOutlined` ist in der
  Map, die Map ist exportiert, und `SuiteNav.test.tsx` prüft sie **gegen die echte Registry**, sodass
  jedes künftige Modul beim Vergessen einen roten Test bekommt statt eines falschen Bildes.
- **`SUITE_ACCESS_GROUP_FILES` und `SUITE_ADMIN_GROUP_FILES` wirken auf dieselbe, einzige Stufe**
  (§2.4). `SUITE_ACCESS_GROUP_FILES` **leer gesetzt** ist ein Konfigurationsfehler und bricht den Boot
  ab (`groups.ts:135-139`) — anders als `SUITE_HOST_FILES`, wo leer eine sinnvolle Aussage ist
  (`hosts.ts:33-38`). Diese Asymmetrie ist Analyse-Falle 18 und gehört in die `.env`-Kommentare.

### 2.4 Zugriff — genau EINE Stufe, ohne Suite-Admin-Abkürzung

Der Betreiber hat festgelegt: wer in der Modulgruppe ist, darf alles — auch fremde Shares und das
Audit-Log; es gibt **keine** Ownership-Prüfung zwischen Mitgliedern; und der **Suite-Admin bekommt
keine Abkürzung**, wie im Modul `feedback` seit 2026-07-28.

Damit weicht Spec 1 bewusst von der Empfehlung der Analyse ab: E3 empfiehlt „(a) mit `isModuleAdmin`
aus `core/groups`", und `isModuleAdmin` lässt den Suite-Admin unbedingt durch
(`core/groups.ts:104`: `if (groups.includes(suiteAdminGroup(env))) return true`). Die
Betreiberentscheidung gewinnt. Vorbild ist `feedback/_lib/access.ts:31-35`, das genau deshalb
`adminGroupsFor(getModule(...))` liest und `suiteAdminGroup` **nicht** — mit der dort ausgeschriebenen
Begründung „Betrieb und Einsicht sind zwei Rollen".

```ts
// _lib/access.ts
export type Viewer = { sub: string; groups: string[] };

/**
 * BEWUSST NICHT `isModuleAdmin` — dieselbe Entscheidung wie in `feedback`
 * (_lib/access.ts:9-30, seit 2026-07-28): der Suite-Admin (ADMIN_GROUP) ist
 * hier NICHT automatisch berechtigt. Wer `files` verwalten soll, gehört in
 * `drk-files-admin` bzw. in das, was SUITE_ADMIN_GROUP_FILES benennt — auch
 * der Betreiber selbst. Grund: Zugang zu `files` heißt Einblick in fremde
 * Freigaben und in ein Postfach mit Uploads Dritter.
 *
 * ES GIBT NUR DIESE EINE STUFE. Kein zweites Prädikat, keine Ownership-Prüfung
 * zwischen Mitgliedern, `shares.created_by` ist reine Anzeige (§4.2). Wer hier
 * nach einem `assertGroupAccess`-Zwilling wie in `feedback` sucht: es gibt ihn
 * nicht, und das ist Absicht, kein Vergessen.
 */
export function isFilesAdmin(viewer: Viewer | null): boolean { … }
```

`requireFilesAccess()` in derselben Datei ist der **Backstop**, Bauform aus
`feedback/_lib/requireFeedbackAccess.ts:31-48`:

- keine Session → `redirect("/login?callbackUrl=…")`,
- Session ohne Zugang → `notFound()`, **nicht** 403 (verrät die Route nicht; dieselbe Linie wie
  `requireFeedbackAccess.ts:48`),
- die Prüfung liest `adminGroupsFor(mod)` **und** `requiredGroupsFor(mod)` — nie die Registry-Felder
  direkt, sonst ist die Env-Überschreibung an genau dieser Stelle wirkungslos
  (`requireFeedbackAccess.ts:37-44` schreibt die Begründung aus; es war ein Befund vor dem
  feedback-Cutover). Beide Variablen gewähren dieselbe eine Stufe.
- **Die Verknüpfung steht hier im Klartext, weil die naheliegende Vorlage die falsche ist:**

  ```ts
  const erlaubt = [...adminGroupsFor(mod), ...requiredGroupsFor(mod)];
  const hatZugang = viewer.groups.some((g) => erlaubt.includes(g));
  if (!hatZugang) notFound();
  ```

  **Eine leere Liste gewährt NICHTS.** Das ist die Bauform aus `requireFeedbackAccess.ts:45-47`
  (`viewer.groups.some(...)` über die Liste) und ausdrücklich **nicht** die aus `canAccess`
  (`src/core/registry.ts:135-137`), die bei leerer Liste mit `true` aussteigt. Der Kommentar an
  `envAccessGroupsFor` (`src/core/groups.ts:44-58`) nennt das wörtlich „eine **ÖFFNUNG**". Wer die
  Verknüpfung von `canAccess` abschreibt, öffnet `files` mit `requiredGroups: []` für **jeden
  Eingeloggten** — also Zugang zu fremden Freigaben und zu einem Postfach mit Uploads Dritter, und der
  Fehler ist still: alles funktioniert, für zu viele. Zwei Zusagen halten das fest (§11.1):
  Eingeloggter ohne Gruppe → `notFound()`; Suite-Admin **ohne** `files`-Gruppe → `notFound()`.
- **Der `callbackUrl` wird aus der Rolle gebildet**, nicht als interner Pfad kodiert:
  `requireFeedbackAccess.ts:35` schreibt `/m/feedback` hinein, was bei einem Host richtig ist. Bei
  zwei Hosts muss der Rücksprung auf den **Verwaltungs**-Host zeigen (§3.2).
- Aufgerufen vom `(verwaltung)/layout.tsx` **und** von **jeder** Server Action in `actions.ts`. Eine
  Seiten-Prüfung erstreckt sich nicht auf die Actions darunter (mitgelieferte Next-Doku,
  `data-security.md:282,329`; in der Alt-App fehlte sie in allen drei Actions,
  `dashboard/actions.ts` ohne einen einzigen `auth()`-Aufruf).

**Gruppenfrische:** Gruppen im JWT sind nur so frisch wie der letzte Token-Refresh, Takt ≈ eine
Stunde (`CLAUDE.md:54-59`). Für `files` ist das hinnehmbar — ein Gruppenentzug wirkt mit bis zu einer
Stunde Verzug. Eine serverseitige Auflösung aus der DB ist **nicht** möglich und auch nicht nötig: es
gibt keine Objekt-Zugehörigkeit, an der man sie auflösen könnte (genau das ist die Kehrseite der
Ein-Stufen-Entscheidung). Das gehört als bewusster Preis in diese Spec.

### 2.5 Wo Route Handler liegen dürfen — und wo sie tot sind

`PASSTHROUGH = ["/api/auth", "/api/health", "/login", "/_next", "/favicon.ico", "/.well-known"]`
wird als **erstes** geprüft, vor jeder Host-Auflösung (`core/routing.ts:12,50-52`). Daraus zwei harte
Regeln:

- **Kein Modul-Endpunkt unter `/api/health/*` oder `/login*`.** Eine Datei
  `src/app/m/files/api/health/route.ts` wäre unter der Suite einfach tot — kein Fehler, kein Log
  (Analyse Falle 15). Der Health-Weg des Moduls ist der generische
  `/api/health/files` (`core/health/index.ts:4-16`); was er **nicht** kann, steht in §5.6.
- **Alle Modul-Routen liegen unter `src/app/m/files/api/…`, nicht unter `src/app/api/…`.** Beide
  Ablageorte sind gültige Next-Routen und bauen fehlerfrei; am falschen Ort zielt der Host-Rewrite
  auf einen Pfad, an dem nichts liegt — 404 auf jedem Download-Link (Analyse Falle 16). Der Rewrite
  ist `/<pfad>` → `/m/files/<pfad>` (`routing.ts:78-79`).

Nicht betroffen und damit 1:1 portierbar: `/s/<id>`, `/u/<token>`, `/api/download/*`,
`/api/preview/*`, `/api/upload/*`.

### 2.6 Zwei `core`-Hebungen mit heute belegbarem zweitem Nutznießer

Maßstab aus `docs/design/README.md:23-33`: „ein zweiter, heute belegbarer Nutznießer" — und:
Modul-Interna aus einem anderen Modul zu importieren ist **verboten**. `files` braucht zwei
Bausteine, die heute in `feedback` liegen. Damit haben beide ab sofort zwei Nutznießer, und der
Präzedenzfall ist ausdrücklich benannt (der QR-Baustein wurde nach `core/qr` gehoben, weil zwei
Module ihn erzeugen).

**`src/core/ratelimit.ts`** — enthält
- `RateLimiter` (heute `feedback/_lib/ratelimit.ts:6-31`, Sliding Window, `now` injizierbar,
  In-Memory pro Prozess),
- `clientIpAus(headers: Headers)`: `cf-connecting-ip`, sonst erster Wert aus `x-forwarded-for`, sonst
  `"unknown"`.

`feedback` importiert danach von dort; für `RateLimiter` ist die Änderung eine Importzeile, und
`feedback/_lib/ratelimit.test.ts` wandert mit. **Die zweite Hebung ist keine reine Importzeile, und
das gehört benannt:** heute steht dort `async function clientIp(): Promise<string>` **ohne Parameter**,
die `await headers()` selbst liest (`feedback/actions.ts:538-544`, gemessen am Quelltext). Die
gehobene Fassung nimmt `Headers` — weil sie sonst in einem Route Handler von `files` nicht benutzbar
und nicht ohne Next-Kontext testbar wäre. Also: **Signaturänderung** von async/parameterlos auf
synchron/`Headers`-nehmend, die feedback-Aufrufstellen bekommen `await headers()` vorgeschaltet, und
`ratelimit.test.ts` bekommt einen neuen Fall für die IP-Auflösung (Vorrang `cf-connecting-ip`, erster
`x-forwarded-for`-Wert, Rückfall `"unknown"`). Unverändert bleibt die **Auswertungslogik**, nicht die
Aufrufform — „kein Verhalten ändert sich" gilt für das Ergebnis, nicht für die Naht.
Der Vorbehalt wandert mit und gehört in den Kopfkommentar: der Zähler liegt **im Prozessspeicher**
(`feedback/README.md:36`) — bei einem Neustart ist er weg, bei mehreren Instanzen wirkungslos. Für
die Notbremse (§8.4) ist das tragbar; das **Mengenbudget** liegt deshalb in der DB, nicht hier.

Nicht gehoben wird: alles andere. Insbesondere kein „Blob-Baustein" und kein „AV-Baustein" in `core` —
beide hätten heute genau einen Nutznießer, und ein Framework für einen Nutzer ist teurer als die
Verdopplung, die es verhindern soll (`docs/design/README.md:23-28`).

### 2.7 `nav`-Slot und Shell

Der `nav`-Slot ist optional (`core/shell/Shell.tsx:6-32`, `types.ts:15-26`). Die Regel aus dem
mobilen Durchgang steht in `src/app/m/portal/layout.tsx:10-22` und lautet: **ohne Verwaltungsrecht
gar keine Navigation, statt einer Zeile mit dem einen Eintrag „Übersicht", der auf die Seite zeigt,
auf der man steht.** `Modulnav` rendert bei leerer Liste ohnehin nichts (`SuiteNav.tsx:190-196`).

Für `files` heißt das:

```ts
// _lib/nav.ts — KEIN "use client" (Falle 6), weil ZWEI Server Components den WERT lesen:
// (verwaltung)/layout.tsx und der Rollen-Verteiler page.tsx (§3.5), beide über
// _ui/VerwaltungsRahmen.tsx.
export const FILES_NAV: SuiteNavItem[] = [
  { key: "start", title: "Freigaben", href: "/" },
  { key: "posteingang", title: "Posteingang", href: "/posteingang" },
  { key: "zugangslinks", title: "Abgabelinks", href: "/zugangslinks" },
];
```

Der Ablageort ist keine Geschmacksfrage: läge das Array neben einer `"use client"`-Komponente in
`_ui/`, bekäme die Server Component eine Client-Referenz statt des Wertes — HTTP 500 für die ganze
Seite, und **weder `pnpm build` noch Vitest finden das** (`docs/design/README.md:87-103`).

Drei Einträge, immer alle drei — es gibt nur eine Zugriffsstufe, also kann kein Eintrag in einen
`notFound()` führen (Prüffrage aus `docs/design/README.md:236-242`). Die Ein-Eintrag-Regel greift hier
also nie; sie ist trotzdem benannt, damit niemand später „Posteingang" und „Abgabelinks" hinter ein
zweites Prädikat legt und dabei eine Ein-Eintrag-Zeile erzeugt.

Die öffentlichen Ansichten haben **keine** Shell, **kein** antd und **keinen** App-Switcher.

### 2.8 Keine PWA

`files` bekommt kein Manifest und keinen Service Worker. Begründung: das Suite-Muster ist
ausdrücklich ein Modul = **ein** Host (`qr/manifest.webmanifest/route.ts`), und bei zwei Hosts ist
diese Voraussetzung weg; es gibt in diesem Repo keinen erprobten Weg, ein Manifest host-abhängig
**und** cachebar auszuliefern (Analyse Abschnitt 8, Punkt 16). Ein Datei-Upload braucht ohnehin Netz.

---

## 3. Host-Rollen

### 3.1 Die Abbildung

`SUITE_HOST_FILES` ist eine Liste, und **die Reihenfolge trägt Bedeutung**:

| Index | Rolle | Host (heute, Betreiberangabe) | bedient |
|---|---|---|---|
| 0 | `verwaltung` | `share.iuk-ue.de` | Verwaltung, `/s/<id>`, Download/ZIP/Preview, Share-QR |
| 1 | `inbox` | `drop.iuk-ue.de` | `/u/<token>`, `/u`, Inbox-Upload |

Warum die Reihenfolge und nicht zwei Variablen: `SUITE_HOST_<KEY>` ist die **eine** Quelle, aus der
Routing (`routing.ts:69` über `moduleForHost`) und Login-Allowlist (`core/auth/redirect.ts:54`)
lesen. Zwei naheliegende Alternativen sind **ausgeschlossen**, nicht nur schlechter: eine zusätzliche
`SUITE_HOST_FILES_SHARES` bricht den Boot ab, weil jedes `SUITE_HOST_*` ohne passenden Modul-Key
gemeldet wird (`hosts.ts:69-76`, `bootstrap.ts:29-35`); eine Rollen-Syntax im Wert
(`inbox:drop.iuk-ue.de`) ebenso, weil ein `:` im Hostnamen abgewiesen wird (`hosts.ts:81-86`). Ein
eigenes Präfix (`FILES_HOST_INBOX`) legte eine zweite Wahrheit über Hosts an — gegen die Begründung
in `core/hosts.ts:14-17`, wo das einheitliche Präfix genau der Grund ist, warum ein Tippfehler
überhaupt auffällt.

**Index 0 = Verwaltung ist eine bewusste Wahl, keine Nebenwirkung:** `moduleUrl` liest
`prodHostsFor(mod)[0]` (`core/shell/moduleUrl.ts:19-22`), der App-Switcher zeigt also auf die
Verwaltungs-Domain. Das ist richtig — die Inbox-Domain ist für anonyme Melder, nicht für angemeldete
Betreiber.

### 3.2 `_lib/hostRolle.ts` — sechs Funktionen, eine Aufgabe je Funktion

```ts
export type Rolle = "verwaltung" | "inbox";

/** Host → Rolle. Unbekannter Host → notFound(). Genau diese eine Aufgabe. */
export function resolveRole(headers: Headers): Rolle;

/** Dieselbe Auflösung OHNE Wurf — für Route Handler, die eine eigene Antwort
 *  bauen müssen (ein `notFound()` in einem Handler ist keine brauchbare Antwort
 *  auf einen Download-Link). Unbekannter Host → null. */
export function rolleOderNull(headers: Headers): Rolle | null;

/** Die Rollensperre für LAYOUTS UND SEITEN, erste Anweisung: passt die Rolle
 *  nicht, `notFound()`. Wirft also — und ist deshalb NICHT die Form für Route
 *  Handler (siehe rolleOderNull). Kein 403: die Existenz eines Pfades auf dem
 *  falschen Host wird nicht verraten (docs/design/README.md:239-242). */
export function requireRolle(rolle: Rolle, headers: Headers): void;

/** Rolle → Host, oder null wenn diese Rolle keinen Host hat (vor dem Cutover). */
export function hostFuerRolle(rolle: Rolle): string | null;

/** Öffentliche Adresse für eine ERZEUGTE Nutzlast: Host aus der ROLLE, Protokoll
 *  und ggf. PORT aus dem Request. Wirft, wenn die Rolle keinen Host hat — der
 *  Aufrufer muss den Zustand vorher abfragen und einen benannten Zustand
 *  zeigen (§10). */
export function oeffentlicheUrl(rolle: Rolle, pfad: string, headers: Headers): string;

/** Boot-Prüfung, eingehängt in assertHostConfig(). Liefert Fehlermeldungen. */
export function validateFilesHosts(env?: EnvLike): string[];
```

- `resolveRole` normalisiert wie `moduleForHost` (Port abschneiden, kleinschreiben,
  `registry.ts:120`) und liest den Host über `resolveHost(headers)` aus `core/routing.ts:36-41` —
  **wiederverwendet**, weil eine zweite Auflösung genau der Ort wäre, an dem beide auseinanderlaufen
  (dieselbe Begründung steht im Kommentar an `resolveHost` und an
  `feedback/_ui/Teilnahme.tsx:40-55`). Kein Treffer → `notFound()`. Kein 403: die Existenz eines
  Pfades auf dem falschen Host wird nicht verraten (Linie aus `docs/design/README.md:239-242`).
- `hostFuerRolle` liest `prodHostsFor(getModule("files"))` — **nie** `mod.prodHosts` direkt, sonst
  greift die Env-Konfiguration nicht (`registry.ts:28-34` schreibt die Falle aus; genau so entstand
  Post-Cutover-Befund 2, als der App-Switcher an der Registry vorbei baute).
- `oeffentlicheUrl` nimmt das Protokoll aus dem Request
  (`x-forwarded-proto`, sonst `http` — die belegte Rückfallbeobachtung aus
  `feedback/_ui/Teilnahme.tsx:51-55`, weil `req.url` nach dem Rewrite immer die interne
  http-Adresse trägt). Der **Host** kommt aus der Rolle. Das ist der ganze Punkt: ein auf der
  Inbox-Domain erzeugter Share-QR trüge sonst `drop.iuk-ue.de`, funktionierte sofort, sähe richtig
  aus und würde beim Abschalten eines Hosts ungültig — auf Papier, das dann längst verteilt ist
  (Analyse Falle 17). **Gedruckt ist gedruckt.**
- **Der PORT kommt aus dem Request, und ohne diese Regel ist der Dev/E2E-Aufbau aus §3.4 kaputt.**
  `SUITE_HOST_*` darf keinen Port tragen — `validateHostConfig` weist jeden Wert mit `:` ab
  (`src/core/hosts.ts:78-86`, gemessen am Quelltext). Der Host aus der Rolle ist damit **immer**
  portlos, E2E läuft aber auf 3100 (`playwright.config.ts:33,35,60`) und `pnpm dev` auf 3000. Ein
  erzeugter Link lautete sonst `http://drop.localtest.me/u/<token>` und wäre lokal unerreichbar —
  also genau der Aufbau unbrauchbar, mit dem §3.4 die benannte Prüflücke schließt. Verbindlich:
  **trägt der Host aus `resolveHost(headers)` einen Port, wird er angehängt.** In Produktion hinter
  Traefik trägt der `Host`/`x-forwarded-host`-Header keinen Port, die Regel ist dort also folgenlos;
  eine `NODE_ENV`-Abfrage braucht es nicht und wäre ein zweiter Schalter. Der Präzedenzfall zeigt,
  warum das nötig ist: `feedback/f/[slugSecret]/qr.png/route.ts` baut die Nutzlast aus
  `resolveHost(req.headers)`, das den Port **mitbringt** — deshalb funktioniert es dort in Dev.
  `hostRolle.test.ts` besitzt die Aussage: **„Host aus der Rolle, Port aus dem Request"** (§11.1);
  ohne diese Zusage fängt sie keine Mutation.

**Bedienen ≠ Erzeugen — und hier weicht Spec 1 von E22 ab.** E22 formuliert „Beide Hosts müssen
weiter **beide** Pfade bedienen, sonst brechen bereits gedruckte Codes". Das trifft für `files`
nicht zu, und die Abweichung ist belegbar:

- Beide Alt-Apps hatten **je einen** Host mit **disjunkten** Pfadräumen: `easy-filesharing` bediente
  `/s/<id>` auf seiner Domain, `drop` `/u/<token>` auf seiner. Beide bauten ihre Links aus der
  eigenen Origin (`easy-filesharing/shares-table.tsx:74-77` aus `window.location.origin`; `drop`
  `web/src/lib/share-tokens.ts:50-52` ebenso). Ein gedruckter Code der Form
  `drop.iuk-ue.de/s/<id>` **kann nicht existieren**.
- Genau diese strikte Trennung verlangt E15 (d) für die zwei Cutover-Termine: „modul-interne
  Host-Rollen-Sperre (404 auf dem falschen Host)", damit das Modul zwischen den Terminen keine
  Routen verrät, deren Alt-Pendant noch live ist.
- Und der Betreiber hat `resolveRole` mit „unbekannter Host → `notFound()`" als **eine** Aufgabe
  festgelegt.

Also: **jeder Host bedient nur die Pfade seiner Rolle.** Ein `/u/<token>` auf dem Verwaltungs-Host
und ein `/s/<id>` auf dem Inbox-Host antworten mit 404. Das ist keine Übergangsregel für das
Cutover-Fenster, sondern der Dauerzustand — sonst wäre es ein Schalter, den irgendwann niemand mehr
umlegt.

**Verankert ist die Sperre an drei Stellen, und die dritte ist die, die man vergisst:**

1. die drei Group-Layouts, je **eine** Rollenzusicherung (§2.1),
2. der Rollen-Verteiler auf `/` (§3.5) — er unterscheidet die Rollen, statt eine abzuweisen,
3. **jeder** Route Handler unter `api/`, als erste Anweisung ein `rolleOderNull`-Abgleich gegen die
   Tabelle in §2.1. Route Handler haben **kein** Layout; ohne diese Zeile wäre die Sperre für die neun
   Endpunkte nirgends verankert, kein Test würde rot, und `/api/download/<id>` antwortete auf dem
   Inbox-Host, während dessen Alt-Pendant zwischen den beiden Cutover-Terminen noch live ist.

**Drei Namen, drei Einsatzorte, und die Trennung ist verbindlich:** `resolveRole` (Seiten und der
Verteiler, wirft bei unbekanntem Host), `requireRolle` (Layouts und Seiten, wirft bei falscher Rolle),
`rolleOderNull` (**Route Handler**, wirft nie — der Handler baut seine 404 selbst). Wer in einem
Handler eine werfende Form benutzt, tauscht eine benannte 404 gegen eine Ausnahme im Antwortweg.

### 3.3 Boot-Prüfung

`validateFilesHosts` wird in `core/bootstrap.ts:29-35` in dieselbe Fehlerliste eingehängt wie
`validateHostConfig`/`validateGroupConfig` (`bootstrap.ts` importiert bereits Modul-Code — Schemata
und Seeds, `:7-12` —, die Kopplung ist also präzedenzgedeckt). Geprüft wird:

| Zahl der Hosts | Urteil | Begründung |
|---|---|---|
| 0 | **erlaubt** | „kein Cutover" bzw. „Cutover zurückgenommen" ist eine sinnvolle Aussage (`hosts.ts:33-38`), und das Modul muss vor dem ersten Cutover bootfähig sein |
| 1 | **Boot-Abbruch** | eine Rolle hätte keinen Host; welche fehlt, kann der Code nicht wissen, und ein QR mit `null` im Host ist Altpapier |
| 2 | erlaubt, wenn **verschieden** | Rollen sind belegt |
| 2, beide gleich | **Boot-Abbruch** | `validateHostConfig` sieht das **nicht**: `claimedBy` meldet nur, wenn `other !== key` (`hosts.ts:87-94`) — eine Doppelung **innerhalb** eines Moduls fällt durch, und beide Rollen zeigten still auf denselben Host |
| ≥ 3 | **Boot-Abbruch** | es gibt nur zwei Rollen |

Die Zwei-Gleich-Prüfung ist ein Befund dieser Spec, nicht der Analyse. Er kostet drei Zeilen und
schließt einen stillen Fehlzustand.

**Und deshalb sieht der Rollback eines EINZELNEN Cutovers anders aus als in der Analyse
beschrieben.** E15 nennt als Mechanik „genau diesen Eintrag und diese Regel entfernen". Den Eintrag
zu entfernen ließe **einen** Host zurück — und bräche damit den Boot der **ganzen** Suite, mitten in
einem Rollback. Verbindlich gilt deshalb:

| Vorgang | `SUITE_HOST_FILES` | `SUITE_TRAEFIK_RULE` |
|---|---|---|
| erster Cutover | **beide** Hosts, in Rollenreihenfolge | nur der umgeschwenkte Host |
| zweiter Cutover | unverändert (beide) | zweiter Host ergänzt |
| Rollback **eines** Zweigs | **unverändert (beide)** | den Host **entfernen** — er zeigt wieder auf den Alt-Stack |
| Rollback **beider** Zweige | **leeren** (0 Hosts, erlaubt) | auf den Ausgangswert zurück |

Ein Host in `SUITE_HOST_FILES`, den Traefik nicht leitet, ist folgenlos: dort antwortet keine
Suite-Route. Er steht lediglich in der Login-Allowlist (`core/auth/redirect.ts:54`) — auch das
folgenlos, solange die Domain den Container nicht erreicht. Die Erreichbarkeit steuert **allein** die
Traefik-Regel, und das ist die einzige Aufteilung, unter der ein Teil-Rollback keine
Positionsbedeutung umdeuten muss.

**Folge für den Cutover (Erbe für Spec 2):** Die `.env`-Zeile trägt **beide** Hosts, sobald der
**erste** Termin läuft. Das ist unschädlich, weil `SUITE_TRAEFIK_RULE` die Erreichbarkeit steuert —
der zweite Host zeigt bis zu seinem Termin weiter auf den Alt-Stack. Die Rollenabbildung bleibt damit
über beide Termine stabil, und niemand muss zwischen den Terminen eine Positionsbedeutung umdeuten.
Die Kehrseite gehört benannt: ab dem ersten Termin steht der Inbox-Host in der Login-Allowlist
(`core/auth/redirect.ts:54`) und im App-Switcher-Fallback, obwohl er noch die Alt-App bedient. Beides
ist folgenlos, weil dort keine Suite-Route antwortet.

### 3.4 Dev und E2E: die benannte Prüflücke und wie sie geschlossen wird

**Die Lücke.** In Dev und Test leitet `moduleUrl` einen **einzigen** Host `<key>.localtest.me` ab
(`moduleUrl.ts:24-26`); es gibt dort also gar keinen zweiten Host, unter dem ein Test daneben greifen
könnte (Analyse Falle 17, ausdrücklich als in Dev/E2E unsichtbare Klasse geführt). Kein Test der
Suite setzt `SUITE_HOST_*` je auf zwei Hosts.

**Der Schluss.** `moduleForHost` prüft `${key}.localtest.me` **und** `prodHostsFor(m, env)`
(`registry.ts:119-126`), und `prodHostsFor` liest `envHostsFor` **unabhängig von `NODE_ENV`**
(`hosts.ts:39-46`). Also genügt es, `SUITE_HOST_FILES` in Dev und E2E mit zwei
`*.localtest.me`-Namen zu setzen — Wildcard-DNS löst dort jeden Namen auf 127.0.0.1 auf. Damit läuft
**derselbe Code-Pfad** in Dev, E2E und Produktion, und die Zwei-Host-Klasse ist lokal prüfbar.

Verbindlich:

```
SUITE_HOST_FILES=files.localtest.me,drop.localtest.me
```

- Index 0 ist **wörtlich** `files.localtest.me`, damit der Dev-Zweig von `moduleUrl`
  (`<key>.localtest.me`) und die Rolle `verwaltung` denselben Host benennen. Weichen sie ab, zeigt
  der App-Switcher lokal auf einen Host, der die Rolle nicht trägt — und genau dieser Unterschied
  wäre die nächste Ausprägung von Falle 17.
- Gesetzt wird das an zwei Orten: als kommentierte Dev-Zeile in `.env.example` (neben `:96`, wo der
  Fall „das files-Modul mit fileshare + drop" schon als Beispiel steht) und in
  `playwright.config.ts` `webServer.env` (neben `DATA_DIR`, `:55-62`).
- **Der Test, der die Lücke schließt** (§11.5): einen **Abgabelink** auf dem **Verwaltungs**-Host
  anlegen und prüfen, dass Link und QR-Nutzlast `drop.localtest.me:3100` tragen — **mit** Port, weil
  der Test dem Link **folgen** muss (die anonyme Abgabe erscheint danach im Posteingang). Ein
  Stringvergleich auf den Hostnamen allein wäre die schwächere Hälfte der Zusage; die Portregel aus
  §3.2 ist genau das, was den Rest erreichbar macht. Das ist die nicht-triviale
  Richtung: die Erzeugung sitzt auf dem einen Host, die Nutzlast muss den anderen tragen. Die
  Gegenrichtung (Share-QR mit Inbox-Host) ist durch die Rollentrennung aus §3.2 **strukturell**
  unmöglich — die Anlegen-Ansicht existiert auf dem Inbox-Host nicht —, und dass sie unmöglich ist,
  prüft derselbe Test durch einen 404 auf `/shares/neu` unter `drop.localtest.me`.

### 3.5 Die `/`-Kollision

`drop` bediente `/` mit einer Welcome-Page, `easy-filesharing` mit `redirect("/dashboard")`. Unter der
Suite rewriten **beide** Hosts auf denselben Pfad `/m/files`, weil `routing.ts:78` für `/` `rest = ""`
setzt — ein Handler, zwei Startseiten, und es gibt keinen Pfadunterschied, an dem Next entscheiden
könnte (Analyse Abschnitt 4.3).

**Lösung — eine Bauform, verbindlich, keine Umsetzerfreiheit.** `src/app/m/files/page.tsx` ist der
Verteiler und die **einzige** Datei, die auf `/m/files` auflöst. Es gibt **keine**
`(verwaltung)/page.tsx` — beide lösten auf denselben Pfad auf, Route-Groups erscheinen in keinem
URL-Pfad, und `next build` bricht mit „You cannot have two parallel pages that resolve to the same
path" ab. Derselbe Grund, warum `feedback` kein `src/app/m/feedback/page.tsx` neben
`(admin)/page.tsx` hat.

```
// src/app/m/files/page.tsx
switch (resolveRole(await headers())) {
  case "verwaltung":
    await requireFilesAccess();                    // GUARD HIER, nicht im Layout
    return <VerwaltungsRahmen nav={FILES_NAV}><SharesUebersicht … /></VerwaltungsRahmen>;
  case "inbox":
    return <OeffentlicherRahmen><InboxStart /></OeffentlicherRahmen>;
}
```

**Warum Riegel und Chrome hier stehen und nicht am Layout:** der Verteiler liegt außerhalb aller
Route-Groups (er muss beide Rollen bedienen können), also greift `(verwaltung)/layout.tsx` für ihn
nicht. Hingen Guard und Shell allein dort, stünde die Shares-Übersicht auf der Modulwurzel
**ungegatet** und ohne Navigation, und §10.1 („kein Zugang → `notFound()` (Backstop)" für `/`) wäre
unwahr. Deshalb:

- `requireFilesAccess()` wird von **zwei** Stellen gerufen — vom Verteiler (Zweig `verwaltung`) und
  von `(verwaltung)/layout.tsx`. Das ist kein Duplikat, sondern das bereits erprobte Muster:
  `requireFeedbackAccess` ist ausdrücklich „EINE Stelle, zwei Layouts"
  (`feedback/_lib/requireFeedbackAccess.ts:10,17-23`), weil die Druckansicht aus dem `(admin)`-Layout
  herausfiel. Hier fällt die Wurzelseite heraus, aus demselben strukturellen Grund.
- Shell und `nav` liegen in **einer** Komponente `_ui/VerwaltungsRahmen.tsx` mit zwei Importeuren
  (Verteiler und `(verwaltung)/layout.tsx`), die `nav`-Liste in `_lib/nav.ts` (§2.7).
- Die Route-Group `(verwaltung)` trägt damit ausschließlich `/shares/*`, `/posteingang` und
  `/zugangslinks`.
- Der Verteiler **redirected nicht** — ein Redirect auf `/u` bzw. `/shares` würde die 1:1-Erwartung
  „die Domain-Wurzel zeigt sofort etwas" durch einen Hüpfer ersetzen und wäre auf der Inbox-Domain
  eine zusätzliche Runde für ein Handy im Funkloch.
- `InboxStart` wird von `/` **und** von `/u` gerendert; die Inbox-Wurzel existiert damit unter beiden
  Adressen ohne zweite `page.tsx` auf `/`.

**Und deshalb liest hier `headers()` in einem Layout bzw. einer Wurzelseite.** Analyse E2 markiert
das als ersten `headers()`-Aufruf in einem Suite-Layout ohne Präzedenzfall. Die Festlegung samt
Begründung:

- **Ja, die Group-Layouts lösen die Rolle auf — je Layout genau eine Rolle.** Deshalb sind es **drei**
  Groups und nicht zwei: `(verwaltung)` und `(oeffentlich-share)` sichern `verwaltung` zu,
  `(oeffentlich-inbox)` sichert `inbox` zu (§2.1). Ein Layout „prüft je Pfad" wäre **nicht
  implementierbar**: es bekommt `children` und `params`, aber **keinen** pathname — und `/s/<id>`
  gegen `/u/<token>` sind verschiedene Rollen. Die frühere Formulierung dieser Spec versprach genau
  das und hätte den Umsetzer in den Zustand geschickt, den der Satz danach als Fehler benennt.
  Ohne die Layouts müsste jede einzelne Seite die Rolle prüfen, und die erste vergessene wäre die
  Lücke. Für die Route Handler gilt trotzdem die Prüfung je Handler — sie haben kein Layout (§3.2).
- **Das Caching-Risiko ist keines:** `app/layout.tsx:2` liest bereits `cookies()`, also eine dynamische
  API derselben Klasse, und `pnpm build` weist ohnehin **jede** Route der Suite als `ƒ (Dynamic)` aus
  (festgehalten im mobilen Durchgang zu `navFuerPortal`). Es gibt in dieser Suite keine statisch
  gerenderte Route, die durch `headers()` dynamisch werden könnte.
- **Belegt wird es trotzdem gemessen, nicht behauptet:** ein E2E-Test ruft `/` auf **beiden** Hosts
  auf und erwartet zwei verschiedene Ansichten (§11.5). Das ist die Messung, die E2 verlangt.

---

## 4. Datenmodell

### 4.1 Grundsätze

**Zeitstempel: Unix-Sekunden, Drizzle `mode: "timestamp"`.** Die 1:1-pflichtigen Fileshare-Tabellen
führen rohe Unix-**Sekunden** ohne Drizzle-`mode` (`easy-filesharing/lib/db/schema.ts:9,12,14-16,30-32,43-45`,
jede Schreibstelle `Math.floor(Date.now()/1000)`). `mode: "timestamp"` schreibt und liest genau
diese Sekunden und ist damit 1:1-verträglich; es ersetzt die Handarithmetik `*1000`/`/1000` durch den
Treiber. **Ausdrücklich nicht `timestamp_ms`** — das nutzt `qr` (`qr/_db/schema.ts:19-20`), und ein
Copy-Paste von dort ist der wahrscheinlichste Weg in den Faktor-1000-Fehler. Dessen Symptom ist
brutal und **paritätsgrün**: entweder läuft nie ein Share ab und das Aufräumen löscht nichts, oder
alles ist sofort abgelaufen (1:1-Tabelle der Analyse, Zeile „Zeitstempel-Einheit"). `migrations.test.ts`
schreibt deshalb ein bekanntes Datum und prüft den **rohen** Spaltenwert auf zehnstellige Sekunden.

**Kein `CHECK` auf `shares.type`.** Im SQL der Alt-App steht `text NOT NULL` ohne CHECK
(`0000_demonic_boom_boom.sql:16`); ein Enum kann an Altdaten scheitern, und neu abzuleiten kippt
Ordner-Shares mit einer Datei (1:1-Tabelle). Der Wertebereich `"file" | "folder"` lebt im
TypeScript-Typ.

**`CHECK` auf die AV-Statusspalten — mit allen fünf Werten.** Ein CHECK, der `unscanned` nicht kennt,
bricht den Import (Analyse E18). Deshalb: `IN ('scanning','clean','infected','error','unscanned')`,
und `unscanned` steht darin, **weil der Altbestand genau mit diesem Wert ankommt**.

**Indizes, die die Alt-App nicht hat.** Dort existiert kein einziger Index außer den PK-Autoindizes,
die tatsächlichen Prädikate sind unindexiert (Analyse Abschnitt 2.1). `files` legt sie an (§4.9).

**Laufzeitvalidierung an jeder Grenze.** Die Alt-App castet den Request-Body per `as`
(`init/route.ts:15-30`), prüft `expiryDays` nicht auf Integer und trimmt `title` serverseitig nicht.
Jede Server Action und jeder Route Handler in `files` validiert selbst: Ganzzahligkeit, Bereich,
getrimmte Nichtleere. Und **`??` statt `||`**: `maxDownloads: maxDownloads || null`
(`init/route.ts:59`) macht aus „0 Downloads" still einen **unbegrenzten** Share; ein Typecheck sieht
den Unterschied nie.

### 4.2 `shares`

| Spalte | Typ | Regel / Einheit | Herkunft |
|---|---|---|---|
| `id` | `text` PK | `nanoid(10)` über das 64-Zeichen-`urlAlphabet` (enthält `-` und `_`, **case-sensitive**) | 1:1-Pflicht: `init/route.ts:36`. Ein Validator `/^[a-z0-9]+$/` gäbe für ~jeden 32. Zeichenplatz ein stilles 404 |
| `title` | `text NOT NULL` | serverseitig **getrimmt** und auf Nichtleere geprüft (neu) | Alt: `init/route.ts:54` bare `title`; ein Titel aus Leerzeichen ergibt `___.zip` (`zip/route.ts:125`) |
| `description` | `text NULL` | NULL = keine. `??`, nicht `\|\|` | `init/route.ts:55` |
| `type` | `text NOT NULL` | exakt `"file"` / `"folder"`, kleingeschrieben, **ohne CHECK** | 1:1-Pflicht; abgeleitet `files.length === 1 ? "file" : "folder"` |
| `expires_at` | `integer` Sekunden `NOT NULL` | serverseitig gedeckelt auf `FILES_MAX_ABLAUF_TAGE` — bei **jedem** Speichern, nicht nur beim Anlegen | Alt: `updateShare` schreibt `now + expiryDays*86400` ohne Deckelung, und das Formular initialisiert `expiryDays` mit `useState(1)` → wer nur den Titel korrigiert, verkürzt den Share auf 24 h (Analyse Abschnitt 2.3) |
| `max_downloads` | `integer NULL` | NULL = **unbegrenzt** (nicht 0, nicht −1) | 1:1-Pflicht (NULL-Semantik) |
| `download_count` | `integer NOT NULL DEFAULT 0` | 1:1 übernehmen, **nie** aus `download_logs` rekonstruieren | 1:1-Pflicht: die Log-Tabelle existiert erst seit Migration 0002, der Zähler seit 0000 |
| `password_hash` | `text NULL` | bcryptjs, cost 12, Präfix `$2b$12$`, 60 Zeichen — **auch für neue** Passwörter | 1:1-Pflicht: die Passwörter liegen bei den Empfängern; ein Wechsel auf argon2/scrypt macht jeden geschützten Share unöffenbar. Eine zweite Hash-Familie wäre ein zweiter Codepfad ohne Nutzen |
| `total_size` | `integer NOT NULL DEFAULT 0` | **gemessene** Bytesumme der vollständigen Dateien | Analyse E20 (b). Alt: Client-Selbstauskunft (`init/route.ts:38`) |
| `created_at` | `integer` Sekunden `NOT NULL` | `$defaultFn` | Alt: kein SQL-Default, Wert nur aus TS |
| `created_by` | `text NOT NULL` | neue Zeilen: `session.user.id` (= OIDC-`sub`) `?? "unbekannt"`; Altbestand: `import:easy-filesharing` | Analyse E21 (c); Hausmuster `qr/actions.ts:19`, `qr/_db/schema.ts:21-23` („Reine Audit-Felder ohne FK") |

**Gestrichen gegenüber der Alt-App:**

- **`s3_prefix`, `s3_key`** — der Pfad entsteht ausschließlich in `_lib/storage.ts` aus `shareId` und
  `fileId` (§5). Die Spalten kodierten die IDs erneut (Analyse Abschnitt 2.1, Befund 4) und wären
  unter dem neuen Pfadschema eine zweite, driftfähige Wahrheit. **Erbe für Spec 2:** `s3_key` wird
  **quellseitig** gelesen, um das MinIO-Objekt zu finden, und **nicht** ins Ziel geschrieben.
- **`limit_reached_at`** — Analyse E11 (c). Der Zugriffszustand ist aus `download_count`/`max_downloads`
  ableitbar; die Spalte war der Träger eines belegten Defekts: `updateShare` setzt sie nur im Zweig
  `maxDownloads === null` zurück (`actions.ts:61-66`), also hinterlässt das **Anheben** eines Limits
  einen gesetzten Wert bei `download_count < max_downloads` — 24 h später antworten drei
  Auslieferungsrouten mit 410, obwohl die Limitprüfung passieren würde, und der Aufräumjob **löscht**
  den Share samt Dateien (`cleanup/route.ts:27,33-38`). Der Admin wollte gerade das Gegenteil.

**Was das Streichen für die Löschregel bedeutet — und der Preis.** Ohne die Spalte gibt es keinen
Zeitpunkt „Limit erreicht am". Also gilt **eine** Löschregel für alle Shares:
`expires_at < now − FILES_LOESCH_KARENZ_STUNDEN`. Damit hat ein Wert **eine** Bedeutung (heute ist er
asymmetrisch: abgelaufene Shares werden ohne jede Karenz gelöscht, limit-erreichte mit 24 h,
`cleanup/route.ts:26-27`), und E11s Forderung „die Karenz auf abgelaufene Shares ausdehnen" ist
erfüllt — das ist die Voraussetzung dafür, einen Share nach Ablauf überhaupt noch verlängern zu
können. **Preis:** ein ausgeschöpfter Share belegt Platz bis zu seinem Ablauf plus Karenz. Das ist
hinnehmbar und ausdrücklich gewählt; die Gegenrichtung (früheres Löschen) hat in der Alt-App Daten
gekostet.

### 4.3 `share_files`

| Spalte | Typ | Regel | Herkunft |
|---|---|---|---|
| `id` | `text` PK | `nanoid(10)` | 1:1-Pflicht: steckt als `?file=<fileId>` in gemailten und gebookmarkten Direktlinks |
| `share_id` | `text NOT NULL` | FK → `shares.id` `ON DELETE cascade` | 1:1 |
| `filename` | `text NOT NULL` | **nur** Anzeige, `Content-Disposition` und ZIP-Eintragsname — **nie** Teil eines Pfades | Analyse E5 (b); Alt: `s3Key = …/${fileId}/${file.filename}` ungeprüft konkateniert |
| `mime_type` | `text NOT NULL` | serverseitig **festgestellt** (Magic Bytes, §8.5), nicht die Client-Deklaration | Alt: reine Client-Angabe |
| `size` | `integer NOT NULL` | **gemessene** Bytezahl | Analyse E20 (b) |
| `created_at` | `integer` Sekunden `NOT NULL` | | 1:1 |
| `bytes_vollstaendig_at` | `integer` Sekunden `NULL` | **neu.** NULL = Upload nicht abgeschlossen | §4.4 |
| `av_status` | `text NOT NULL` | CHECK über alle fünf Werte; neue Zeilen starten auf `scanning` | §6 |
| `av_geprueft_at` | `integer` Sekunden `NULL` | Zeitpunkt des letzten Prüfergebnisses | §6 |

**Was erhalten bleiben MUSS:** `if (!file || file.shareId !== id)` (Alt:
`download/[id]/route.ts:64`, `preview/route.ts:83`). Die Datei wird davor allein über den
Primärschlüssel geholt — ohne diese Zeile lädt jede `fileId` über jede gültige `shareId`. Es ist die
**einzige** serverseitige Objekt-Zugehörigkeitsprüfung der ganzen Alt-App, und sie ist im Ziel keine
Ownership-Frage (die gibt es nicht, §2.4), sondern die Zusammengehörigkeit zweier IDs. Sie steht in
`files` **einmal**, in der Ladefunktion — nicht dreimal in drei Routen.

### 4.4 Der Zwischenzustand „Zeile ohne Bytes" — sichtbar statt still

Ein zweiphasiger Upload (Metadaten, dann Bytes) ist unvermeidlich, weil der Pfad aus der `fileId`
entsteht. In der Alt-App war dieser Zustand **unsichtbar und dauerhaft**: die `share_files`-Zeile
entsteht vor dem ersten Byte (`init/route.ts:70-77`), `abortMultipartUpload` ist definiert und hat
**keinen** Aufrufer (`operations.ts:53-61`) — eine Zeile mit vollständiger gemeldeter Größe ohne
fertiges Objekt ist dort **Regelbetrieb** (Analyse Abschnitt 5).

In `files` trägt `bytes_vollstaendig_at` diesen Zustand:

- NULL → die Datei zählt **nicht** in `total_size`, erscheint in der Verwaltung als „Upload
  unvollständig", ist **nicht** herunterladbar und nicht Teil des ZIP.
- Der Aufräum-Timer löscht Zeilen mit `bytes_vollstaendig_at IS NULL` und
  `created_at < now − FILES_UPLOAD_VERFALL_STUNDEN` samt `.part`-Datei.
- Ein Share, dessen **alle** Dateien unvollständig sind, ist in der öffentlichen Ansicht ein
  benannter Zustand, keine leere Liste (§10).

Damit ist Analyse-Falle 9/10 für **neue** Daten strukturell erledigt: „je Zeile ein Blob" gilt für
alle Zeilen mit gesetztem `bytes_vollstaendig_at`, und das ist eine prüfbare Invariante.

### 4.5 `download_logs`

| Spalte | Typ | Regel | Herkunft |
|---|---|---|---|
| `id` | `integer` PK autoincrement | **Werte müssen nicht erhalten bleiben** — nichts außerhalb der Tabelle verweist auf sie. **Erbe für Spec 2:** der Mapper darf neu vergeben | die Analyse belegt für `download_logs` sechs **Spalten**, nicht deren Typen; der Ziel-Typ ist damit eine Wahl dieser Spec, keine 1:1-Pflicht |
| `share_id` | `text NOT NULL` | **kein** FK-Cascade | Analyse E12 (b): ein Log, das mit dem Share stirbt, ist kein Audit-Log — es verschwindet genau dann, wenn man es braucht |
| `file_id` | `text NULL` | **NULL = ZIP-Download des ganzen Shares.** Nicht zum FK machen, nicht NOT NULL setzen | 1:1-Pflicht (Magic Value) |
| `client_ip_unbestaetigt` | `text NULL` | umbenannt aus `ip`, **und gekürzt geschrieben** (siehe unten) | Analyse E12: es ist der erste Eintrag aus `X-Forwarded-For` ohne Trusted-Proxy-Prüfung, also ein vom Client gesetzter Wert. „Wenn das Feld bleibt, muss es heißen, was es ist" |
| `user_agent` | `text NULL` | | 1:1 |
| `downloaded_at` | `integer` Sekunden `NOT NULL` | | 1:1 |

Aufbewahrung: `FILES_LOG_AUFBEWAHRUNG_TAGE` (Vorschlag 90), durchgesetzt vom Aufräum-Timer. Ohne FK
überlebt das Log seinen Share — das ist der Zweck. Vorschauen werden **nicht** geloggt (§7.7).

**Die Adresse wird gekürzt gespeichert — das ist der zweite Teil von E12.** Die Analyse empfiehlt
„**(b) + (c)**": (b) kein FK-Cascade plus eigene Frist, (c) zusätzlich die IP **gekürzt oder
gehasht**, mit der Begründung „unbefristet gespeicherte IPs sind im Ehrenamtskontext schwer zu
begründen". (b) allein wäre eine unbenannte Abweichung an der datenschutzrelevantesten Stelle des
Moduls. Verbindlich:

- **Eine** Funktion `ipKuerzen(roh: string | null): string | null` in `_lib/ip.ts`, aufgerufen an
  **jeder** Schreibstelle einer Absenderadresse — `download_logs` und `inbox_files` (§4.6). IPv4:
  letztes Oktett auf `0` (`93.184.216.34` → `93.184.216.0`); IPv6: auf das `/48`-Präfix
  (`2001:db8:1234:5678::1` → `2001:db8:1234::`); unparsbar → `null`, **nicht** der Rohwert.
- **Gekürzt statt gehasht**, weil ein Hash die Ansicht unbrauchbar macht: der Betreiber soll „drei
  Downloads aus demselben Netz" erkennen können, und dafür genügt das Netz. Die Wiedererkennung für
  die **Notbremse** hängt daran ohnehin nicht — der Rate-Limiter arbeitet mit der vollen Adresse im
  Prozessspeicher (§2.6, §8.4) und schreibt sie nie.
- Die Ansicht schreibt es dazu: Spaltenüberschrift **„IP (unbestätigt, gekürzt)"** (§7.8).
- **Erbe für Spec 2:** der Import führt jede Altzeile durch dieselbe Funktion. Ein Import, der die
  ungekürzten Altadressen einspielt, wäre die Maßnahme rückwärts.

### 4.6 `inbox_files` — eigene Tabelle, nicht Mitwohnen

Analyse E18 (a), mit vier gemessenen Gründen gegen das Mitwohnen in `share_files`:
`share_files.share_id` ist `notNull` mit Cascade (ein Inbox-Upload bräuchte eine **synthetische**
`shares`-Zeile mit `title`, `type`, `expires_at`, `created_by`, `s3_prefix` als NOT NULL, die im
Dashboard erschiene und beim Aufräumen mitgelöscht würde); `share_files.mime_type` ist NOT NULL,
`drop` persistiert **keinen** MIME-Typ (die META hat genau sieben Felder), jeder importierte Upload
bräuchte einen **erfundenen** Wert; der Paritätscheck vergleicht Multisets **ganzer Zeilen** und
verlangt `source.length === target.length` (`scripts/import/parity.ts:43-56`), zusätzliche Zeilen
machen ihn rot und der nötige Filter wäre selbst Teil der Invariante; eine zusätzliche **Spalte** ist
dagegen unproblematisch, weil beide Arme über explizite `*ParityView`-Funktionen projizieren.

| Spalte | Typ | Regel |
|---|---|---|
| `id` | `text` PK | `nanoid(10)` |
| `token_id` | `text NULL` | FK → `zugangslinks.id`, **kein** Cascade. NULL für den gesamten Altbestand — keine Datei ist dort einem Token zuzuordnen (`req.shareKey` wird gesetzt und nie gelesen) |
| `dateiname` | `text NOT NULL` | **Anzeigename.** Für neue Uploads der Originalname, nur um Steuerzeichen und Pfadtrenner bereinigt (der Name steckt in keinem Pfad mehr, also braucht er kein verlustbehaftetes Sanitizing) |
| `kategorie` | `text NULL` | gegen `_lib/kategorien.ts` validiert; die **Anzeige toleriert unbekannte Werte** (Altbestand kann Freitext tragen) |
| `hinweis` | `text NULL` | ≤ 500 **Zeichen** (Code Points), §8.3 |
| `mime_type` | `text NULL` | **nullable** — für den Altbestand gibt es keinen Wert |
| `size` | `integer NOT NULL` | gemessene Bytezahl |
| `client_ip_unbestaetigt` | `text NULL` | wie in `download_logs`, **durch `ipKuerzen` geschrieben** (§4.5); für den Altbestand aus der META, falls vorhanden — ebenfalls gekürzt |
| `empfangen_at` | `integer` Sekunden `NOT NULL` | für neue Uploads die Annahmezeit; **für META-lose Altdateien die Quell-`mtime`** — die einzige Zeitquelle, und der Ziel-Arm der Parität liest sie von hier (Analyse Abschnitt 5) |
| `bytes_vollstaendig_at` | `integer` Sekunden `NULL` | wie §4.4 |
| `av_status` | `text NOT NULL` | CHECK über alle fünf Werte |
| `av_geprueft_at` | `integer` Sekunden `NULL` | |

**Der Preis von (a) gehört ehrlich hierher:** jede Statusabfrage und jede „ist diese Datei
freigegeben"-Prüfung gibt es **zweimal**, und zwei Statusvokabulare können auseinanderlaufen.
Gegenmaßnahme, verbindlich: der Wertebereich steht in **einer** Konstante `AV_STATUS` in `_lib/av.ts`,
die beide Tabellen benutzen, und die Freigabeprüfung ist **eine** Funktion `istFreigegeben(status)`
mit zwei Aufrufern.

**Keine Sidecar-`.txt`, keine META-JSON.** Analyse E14 (a), an die Zusage der Posteingang-Ansicht
gekoppelt (§8.5). Der gemessene Grund gegen die Sidecar: `writeFile(notePath, …)` läuft ohne
`flag: 'wx'`, `sanitizeFilename('foto.jpg.txt')` ergibt `foto.jpg.txt`, und `text/plain` steht in der
`ALLOWED_MIME`-Vorlage — liegt eine echte Datei `foto.jpg.txt` im Verzeichnis und wird danach
`foto.jpg` **mit Hinweis** hochgeladen, ist ihr Inhalt durch den Hinweistext ersetzt: HTTP 200, kein
Log.

### 4.7 `zugangslinks` — Inbox-Tokens

| Spalte | Typ | Regel |
|---|---|---|
| `id` | `text` PK | `nanoid(10)` |
| `name` | `text NOT NULL` | Bezeichnung für den Betreiber („Übung Nord 30.07.") |
| `token_start` | `text NOT NULL` | die ersten 8 Zeichen im Klartext, für die Liste (`dz-` plus vier Geheimzeichen) |
| `token_hash` | `text NOT NULL UNIQUE` | `base64url_ohne_padding(SHA-256(utf8(voller Token)))` |
| `created_at` | `integer` Sekunden `NOT NULL` | |
| `created_by` | `text NOT NULL` | `sub` |
| `expires_at` | `integer` Sekunden `NOT NULL` | 1–72 ganze Stunden ab Anlegen |
| `revoked_at` | `integer` Sekunden `NULL` | Widerruf ist **kein** Zeilenlöschen |
| `budget_dateien` | `integer NOT NULL` | Mengenbudget, §8.4 |
| `budget_bytes` | `integer NOT NULL` | dito |
| `verbraucht_dateien` | `integer NOT NULL DEFAULT 0` | atomar hochgezählt |
| `verbraucht_bytes` | `integer NOT NULL DEFAULT 0` | atomar hochgezählt |

**Grammatik 1:1** (1:1-Pflicht, weil Codes von Hand abgeschrieben und vorgelesen werden):
`dz-` + 3×4 Zeichen aus `23456789abcdefghijkmnpqrstuvwxyz` (ohne `0`/`1`/`l`/`o`), 17 Zeichen gesamt.
`byte % 32` bei 256 Bytewerten ist verzerrungsfrei. Die Eingabe-Normalisierung im Client prüft das
Alphabet **mit** — die Alt-Fassung tat das nicht (`web/src/lib/utils.ts:75,96` behält `[a-z0-9-]` und
ist am Ende ein Pass-through).

**Hash statt bcrypt:** ein Token trägt 12 Zeichen aus einem 32er-Alphabet, also 60 Bit Entropie und
höchstens 72 Stunden Lebensdauer — SHA-256 ist hier richtig, und bcrypt auf jedem Upload-Chunk wäre
eine Rechenlast ohne Sicherheitsgewinn. Das ist derselbe Aufbau wie in `drop`, aber **nicht** dessen
`apikey`-Schema: das wird nicht nachgebaut, weil nach dem 72-Stunden-Token-Freeze zum Cutover-Termin
kein Alt-Token mehr gültig ist (Analyse E15).

**Der Rohtoken wird nicht gespeichert.** Er entsteht einmal, wird einmal angezeigt (QR + PNG +
Druckansicht) und existiert danach nirgends. Wer den Zettel verliert, legt einen neuen Link an — bei
≤ 72 h Laufzeit ist das der Normalfall, nicht die Ausnahme. Damit fällt der `localStorage`-Umweg der
Alt-App weg, an dem die QR-Historie beim Domainwechsel verloren ging (origin-gebunden).

### 4.8 `aufraeum_laeufe` — die Protokollzeile des Timers

Sie gehört in den Schemateil, nicht nur in die Prosa von §7.6: §1.1 Punkt 3 sagt „vollständiges
Drizzle-Schema" zu, und eine Tabelle, die dort fehlt, fehlt leicht auch in der Migration.

| Spalte | Typ | Regel / Einheit |
|---|---|---|
| `id` | `integer` PK autoincrement | nichts verweist darauf |
| `gestartet_at` | `integer` Sekunden `NOT NULL` | wie alle Zeitstempel des Moduls: Unix-**Sekunden**, `mode: "timestamp"` (§4.1) |
| `beendet_at` | `integer` Sekunden `NULL` | NULL = Lauf abgebrochen (Prozess weg); genau daran ist ein Absturz mitten im Lauf erkennbar |
| `trockenlauf` | `integer NOT NULL` | 0/1, Drizzle `mode: "boolean"` |
| `shares_geloescht` | `integer NOT NULL DEFAULT 0` | Anzahl |
| `dateien_geloescht` | `integer NOT NULL DEFAULT 0` | Anzahl |
| `bytes_geloescht` | `integer NOT NULL DEFAULT 0` | **Bytes** — die Einheit steht im Namen (§9.1) |
| `logzeilen_geloescht` | `integer NOT NULL DEFAULT 0` | Anzahl |
| `inbox_geloescht` | `integer NOT NULL DEFAULT 0` | Anzahl |
| `parts_geloescht` | `integer NOT NULL DEFAULT 0` | Anzahl |
| `verwaiste_blobs_gemeldet` | `integer NOT NULL DEFAULT 0` | Anzahl — **gemeldet**, nicht gelöscht (§7.6) |
| `fehler` | `text NULL` | NULL = fehlerfrei; sonst der Grund im Klartext |

Im **Trockenlauf** tragen dieselben Spalten die Zahlen, die der Lauf gelöscht **hätte** — sonst wäre
die Vorschau nicht mit dem echten Lauf vergleichbar, und genau dieser Vergleich ist der Zweck vor dem
ersten Lauf nach dem Cutover.

### 4.9 Indizes

```
shares:        idx_shares_expires (expires_at)                 -- Aufräum-Prädikat
               idx_shares_created (created_at)                  -- Dashboard-Sortierung
share_files:   idx_share_files_share (share_id)                 -- heute unindexiert
               idx_share_files_av (av_status)                    -- Nachscan + Warteschlange
download_logs: idx_logs_share_time (share_id, downloaded_at)    -- heute unindexiert
               idx_logs_time (downloaded_at)                     -- Aufbewahrungsfrist
inbox_files:   idx_inbox_empfangen (empfangen_at)                -- Posteingang-Sortierung
               idx_inbox_av (av_status)
               idx_inbox_token (token_id)
zugangslinks:  uniqueIndex idx_zugangslinks_hash (token_hash)   -- Auflösung beim Upload
aufraeum_laeufe: KEIN Index -- die Tabelle wächst um eine Zeile je FILES_AUFRAEUMEN_TAKT_MINUTEN
                            -- (Vorgabe 60 → ~8.760 Zeilen im Jahr) und wird ausschließlich
                            -- „die letzten n" gelesen; der PK-Autoindex trägt das. Ein Index auf
                            -- gestartet_at wäre hier Ballast, und die Entscheidung steht hier,
                            -- damit sie nicht als Vergessen gelesen wird.
```

`foreign_keys = ON` ist eine **Verbindungs**-Eigenschaft und in SQLite standardmäßig aus;
`core/db/index.ts:19` setzt sie für jede Modulverbindung. **Erbe für Spec 2:** ein Importskript, das
die Datei ohne dieses Pragma öffnet, erzeugt Waisen oder lässt CASCADE ausfallen (Analyse Falle 5).

---

## 5. Storage-Schicht

### 5.1 Pfadschema

```
<DATA_DIR>/files/<shareId>/<fileId>      Share-Datei   (Betreiberentscheidung E5 b)
<DATA_DIR>/files/inbox/<inboxFileId>     Inbox-Datei
```

**Kein Dateiname im Pfad.** `filename` wird nur für Anzeige, `Content-Disposition` und den
ZIP-Eintragsnamen gebraucht — für keines davon muss er im Pfad stehen. Damit verschwindet die gesamte
Traversal-Klasse **strukturell** statt per Guard, und dieselbe Entscheidung räumt drops
Sidecar-Überschreiben und die Namenskollisionen mit. Der Anlass ist Analyse-Falle 27: auf S3 sind
`..` und `/` gewöhnliche Key-Bytes, `path.join("/data/files", key)` verlässt bei `..`-Segmenten die
Wurzel — derselbe Code ist auf S3 korrekt und auf einem Dateisystem unsicher, und kein statisches
Werkzeug kennt diesen Unterschied. Dazu FS-eigene Grenzen, die S3 nicht kennt und die ein
Altdatentest nicht zeigen kann: 255 Byte pro Pfadkomponente, NUL-Bytes, und Case-Insensitivität auf
macOS gegen Case-Sensitivität auf Linux.

**Die beiden Namensräume sind beweisbar disjunkt:** `<shareId>` ist immer `nanoid(10)`, also genau 10
Zeichen; `inbox` hat 5. Ein Share-Verzeichnis kann `inbox` nie heißen.

### 5.2 Die vier Operationen

```ts
// _lib/storage.ts — die EINZIGE Stelle, an der ein Dateipfad entsteht.
export type BlobZiel =
  | { art: "share"; shareId: string; fileId: string }
  | { art: "inbox"; inboxFileId: string };

/** Schreibt in eine Zwischendatei und benennt atomar um. Bricht bei
 *  Überschreitung ab, löscht die Zwischendatei und wirft `GroesseUeberschritten`.
 *  Liefert die GEMESSENE Bytezahl — sie ist die Quelle für `size`. */
export async function schreibeStrom(
  ziel: BlobZiel,
  quelle: AsyncIterable<Uint8Array>,
  opts: { maxBytes: number; anhaengen?: boolean },
): Promise<{ bytes: number }>;

/** Fehlende Datei → `BlobFehlt` (der Aufrufer antwortet 404, nicht 500). */
export async function lieseStrom(ziel: BlobZiel): Promise<{ strom: Readable; bytes: number }>;

/** Idempotent: eine fehlende Datei ist KEIN Fehler. Löscht auch eine liegen
 *  gebliebene Zwischendatei desselben Ziels. */
export async function loesche(ziel: BlobZiel): Promise<void>;

/** Fehlende Datei → `BlobFehlt`. */
export async function groesse(ziel: BlobZiel): Promise<number>;
```

- Die Pfadfunktion ist **privat** und wird nicht exportiert. Sie prüft jede ID gegen
  `/^[A-Za-z0-9_-]{10}$/` (das nanoid-`urlAlphabet`) und wirft sonst. Das ist billig und macht einen
  Ausbruch auch dann unmöglich, wenn eine DB-Zeile durch einen Import verdorben wurde — die Prüfung
  ist die Naht zwischen „Daten" und „Pfad".
- **Kein Aufrufer außerhalb dieser Datei kennt einen Pfad.** Weder Route Handler noch Actions noch der
  Scanner bauen Pfade; der Scanner bekommt seinen Pfad ebenfalls von hier (§6.4).
- Das Elternverzeichnis wird bei Bedarf angelegt. In `core` legt der einzige `mkdirSync` das
  Elternverzeichnis einer **DB-Datei** an (`core/db/index.ts:14-15`); `<DATA_DIR>/files/` existiert
  beim ersten Schreibvorgang nicht und wird von nichts angelegt (Analyse Abschnitt 4.2).

### 5.3 Atomares Schreiben

```
<pfad>.part      →  fsync  →  rename(<pfad>)
```

- Die Zwischendatei liegt **im selben Verzeichnis** wie das Ziel — `rename` ist nur innerhalb eines
  Dateisystems atomar.
- **Der Name ist deterministisch, ohne Zufallsanteil.** Das ist keine Vereinfachung, sondern
  Bedingung: der chunked Upload muss die Zwischendatei in der **nächsten Anfrage** wiederfinden
  (§7.1, §8.2), `GET /api/upload/<fileId>` liest den Fortschritt als ihre Länge, das Aufräumen und
  das Abbrechen löschen sie (§7.2, §7.6), und `--exclude='*.part'` im Backup (§5.5) trifft sie. Mit
  einem Zufallsanteil im Namen wäre ihr Ort **nicht** aus dem Ziel ableitbar und alle vier Zusagen
  fielen. Eine frühere Fassung dieser Spec forderte beides gleichzeitig — das geht nicht.
- **Flags nach Vorgang:** `anhaengen: false` (einmaliger Schreibvorgang, erster Chunk) öffnet mit
  `flags: "wx"` (exklusiv) — ein zweiter Starter auf dasselbe Ziel bekommt `EEXIST` und damit einen
  **gemeldeten** Konflikt statt verschränkter Bytes. `anhaengen: true` öffnet mit `flags: "a"`,
  nachdem `ab` gegen die aktuelle Länge geprüft wurde (§7.1). Ein echter Kollisionsfall entsteht
  dabei nicht, weil das Ziel aus `fileId` besteht und `fileId` je Upload neu ist. Der Kontrast gehört
  benannt: in `drop` verlieren gleichzeitige Uploads gleichen Namens Daten und werden mit 200
  quittiert (gemessen: vier gleichzeitige Uploads von `gleich.txt` → vier 200, **zwei** Dateien),
  während `README.md:11` das „atomare Writes" nennt.
- Beim **chunked** Upload (§7.2, §8.2) bleibt die Zwischendatei über mehrere Anfragen liegen
  (`anhaengen: true`), und ihr Ort ist aus dem Ziel ableitbar — deshalb ist der aktuelle
  Fortschritt einfach ihre Länge. `rename` passiert genau einmal, beim letzten Chunk.
- `opts.maxBytes` wird **beim Zählen** durchgesetzt, nicht aus einer gemeldeten Größe. Das ist drops
  richtiges Muster (`limits.fileSize` bricht den Stream ab) — nur mit einem gemeldeten Statuscode
  statt HTTP 500 (Analyse Abschnitt 3.2: `files: 25`/`parts: 60` enden dort in HTTP 500, bei 30
  Dateien nachdem 25 bereits geschrieben waren).
- **Stream-Cleanup ist Pflicht, auch wenn sein S3-Anlass wegfällt.** Der `abortSignal`-Durchstich und
  die `finally`-Aufräumpfade der Alt-App verhindern hier geleckte **File-Descriptors** statt Sockets.
  Der ganze Socket-Pool-Apparat (maxSockets 128, Timeouts, autoheal-Sidecar) wandert dagegen
  **nicht** mit: er adressiert einen Fehlermodus, den es auf einem Dateisystem nicht gibt.

### 5.4 Fehlerfälle

| Fall | Antwort | Warum |
|---|---|---|
| Datei fehlt (ENOENT) | **404** mit benanntem Zustand | Die Alt-App liefert dort 500. Eine fehlende Datei ist ein belegter Regelzustand (Waisen in beide Richtungen, Analyse Falle 9) |
| DB-Zeile fehlt | 404 | |
| `av_status ≠ clean` | 403 mit Zustand „wird geprüft" / „gesperrt" | §6.3 |
| Größe überschritten | 413 mit benannter Grenze und Einheit | §9 |
| Volume voll (ENOSPC) | 507, Zwischendatei gelöscht, Logeintrag | ohne Löschen bliebe halber Müll liegen |
| Rechte (EACCES) | 500, laut | Konfigurationsfehler, kein Nutzerfehler |

Zusätzlich: weicht die tatsächliche Größe von `size` ab, wird die **tatsächliche** ausgeliefert und
die Abweichung geloggt — ein falsches `Content-Length` bricht den Download beim Client ab, und der
Fehler wäre dann beim Empfänger sichtbar statt im Log.

### 5.5 Backup — sonst ist das Backup ab jetzt unvollständig und meldet Erfolg

`scripts/backup.sh` sammelt `"$DATA_DIR"/*.db` (`:13-15`), macht je DB ein `sqlite3 .backup` in ein
Arbeitsverzeichnis (`:29-31`) und packt **nur dieses** (`:33`). Blobs fielen damit aus dem Backup.
Der eigene Entwurf hatte es vorgesehen — „tar über /data (inkl. späterem `files/`)"
(`docs/superpowers/specs/2026-07-18-portal-productionize-design.md:146`) — implementiert ist es nicht.

Erweiterung, verbindlich. **Zwei Dinge sind daran nicht frei wählbar, weil beide Varianten des
naheliegenden Wegs still scheitern:**

1. **Die Blobs wandern VOR dem einen `tar` in das Arbeitsverzeichnis.** `scripts/backup.sh:33` schreibt
   `tar -czf "$work.tar.gz"`, also **gzip-komprimiert**; ein `tar -rf` daran ist unmöglich (gemessen:
   `tar: Cannot append to compressed archive`), und unter `set -euo pipefail` (`:5`) bräche der
   **ganze** Backup-Lauf ab — auch für `portal`, `qr` und `feedback`. Verbindlich ist deshalb:

   ```bash
   # Nach der sqlite3-.backup-Schleife (:29-31), vor dem tar (:33):
   if [ -d "$BLOB_DIR" ]; then
     rsync -a --exclude='*.part' "$BLOB_DIR/" "$work/files/"
   fi
   ```

   `rsync` und **nicht** `cp -al`: Hardlinks scheitern über eine Dateisystemgrenze, und `BLOB_DIR`
   liegt je nach Antwort auf Frage 11 in einem anderen Volume-Root als `$DATA_DIR` — unter `pipefail`
   wäre das ein abgebrochenes Backup aller Module. Das bestehende `tar -czf` und die Rotation bleiben
   damit **unverändert**, und das Tarball enthält beide Teile.
2. **`BLOB_DIR` ist eine eigene Variable, nicht `$DATA_DIR/files`.** Das Skript läuft als **Host**-Cron
   über `$DATA_DIR` (`scripts/backup.sh:2,7`; Muster `DATA_DIR="$VOL"` in
   `docs/runbooks/portal-cutover.md:28-30`). Liegen die Blobs im **eigenen** benannten Volume
   `files_data` (§6.5), dann ist `$DATA_DIR/files` host-seitig ein **leerer Mountpunkt** im
   `suite_data`-Verzeichnis: das `tar` sichert nichts und meldet Erfolg — wörtlich der Fehlermodus, den
   die Überschrift dieses Abschnitts verhindern soll. Also:

   ```bash
   # Benanntes Volume (Vorgabe):  BLOB_DIR=/var/lib/docker/volumes/files_data/_data
   # Bind-Mount (Frage 11):       BLOB_DIR=/srv/iuk-suite/files
   BLOB_DIR="${BLOB_DIR:-$DATA_DIR/files}"
   ```

   Der Rückfall auf `$DATA_DIR/files` gilt für die Lage **ohne** eigenen Mount (Dev, und der Zustand
   vor der Compose-Änderung). Welcher Wert produktiv gilt, entscheidet Frage 11 — und weil die Frage
   offen ist, deckt das Skript **beide** Fälle ab, statt einen zu unterstellen.
3. **Der stille Fall bekommt einen Abbruch.** Ist `$BLOB_DIR` **leer oder nicht vorhanden**, während
   die gesicherte `files.db` Zeilen mit `bytes_vollstaendig_at IS NOT NULL` führt, bricht das Skript ab
   — dieselbe Linie wie der bestehende Abbruch bei „keine `*.db` gefunden" (`:20-23`), dessen
   Begründung lautet: kein leeres Tarball schreiben und Erfolg melden. Die Prüfung liest die **Kopie**
   in `$work` (nicht die laufende DB) und ist auf ihre Existenz bedingt:

   ```bash
   if [ -f "$work/files.db" ]; then
     zeilen="$(sqlite3 "$work/files.db" \
       "select count(*) from share_files where bytes_vollstaendig_at is not null" 2>/dev/null || echo 0)"
     …
   fi
   ```

   Die Bedingung auf `-f` und das `|| echo 0` sind Pflicht, nicht Vorsicht: **vor** dem ersten
   files-Deploy gibt es weder die Datei noch die Tabelle, und eine nackte Abfrage unter `pipefail`
   nähme das Backup der anderen drei Module mit — dieselbe Klasse, die §5.6 beim Healthcheck ablehnt.
4. **`*.part` ausschließen** — halbe Uploads gehören nicht ins Backup.
5. **Konsistenz ohne Freeze ist hier zulässig und der Grund gehört in den Kommentar:** eine Blob-Datei
   entsteht ausschließlich per atomarem `rename` und wird danach **nie** verändert. Das `rsync` über
   die Blobs liefert deshalb je Datei einen konsistenten Stand; es kann nur Dateien **verpassen**, die
   während des Laufs entstehen, und das ist derselbe Vorbehalt wie bei jedem inkrementellen Backup.
6. Existiert `$BLOB_DIR` **nicht**, ist das kein Fehler, solange Punkt 3 nichts findet (der Zustand vor
   dem ersten Upload). Existiert es und ist nicht lesbar, bricht das Skript ab — dieselbe Linie wie der
   bestehende Abbruch bei „keine `*.db` gefunden" (`:20-23`).
7. Der Platzbedarf wächst um die Blob-Menge; `BACKUP_KEEP` (Vorgabe 7) multipliziert das. Das gehört
   in den Kommentar und als Runbook-Frage an den Betreiber (§13).

### 5.6 Health — was geprüft wird und was ausdrücklich nicht

- **`/api/health/files`** funktioniert nach dem Anlegen der DB von selbst: `checkModuleHealth(key)`
  öffnet `moduleDbPath(key)` und macht `SELECT 1` (`core/health/index.ts:4-16`).
- **Die Ablage kann dort nicht mitgeprüft werden.** Analyse E5 verlangt für `/api/health/files` mehr
  als `SELECT 1`. Es ist trotzdem der falsche Ort: `/api/health` ist **PASSTHROUGH**
  (`routing.ts:12`), eine Modul-Route darunter wäre tot (§2.5), und `core/health` für einen einzigen
  Nutznießer zu erweitern verstößt gegen die `core`-Regel.
- **Stattdessen zwei Stellen:**
  1. **Boot-Prüfung** in derselben Kette wie `assertHostConfig()`: `<DATA_DIR>/files` wird angelegt,
     eine Probedatei geschrieben, gelesen, gelöscht. Scheitert das, bricht der Start ab — fail fast,
     statt beim ersten Upload eines Melders aufzufallen.
  2. **Ablage-Kachel auf dem Verwaltungs-Dashboard**: belegter Platz, freier Platz (`statfsSync`),
     Zahl der Zeilen ohne Blob, Zahl der `scanning`-Zeilen, Zahl der `.part`-Reste. Dort sieht sie
     der Mensch, der handeln kann.
- **Der Docker-Healthcheck bleibt `/api/health/portal`** (`compose.yaml:45`). Das ist eine bewusste
  Auslassung mit Begründung: im Repo reagiert auf `unhealthy` **nichts** — kein autoheal, keine
  Traefik-Bedingung; die einzige Auswertung ist ein Mensch im Runbook
  (`docs/runbooks/suite-update-webfinger.md:170`). Ein files-eigener Fehler, der den **gesamten**
  Container als krank markiert, würde bei einem später eingeführten Automatismus die anderen drei
  Module mitnehmen (Analyse E17). Die Erweiterung gehört in dieselbe Zeile wie ein solcher
  Automatismus, nicht hierher. **Runbook-Schritt für Spec 2:** Restplatz und `.part`-Reste vor und
  nach dem Cutover ablesen.

### 5.7 E2E-Zustand

Weil die Blobs unter `DATA_DIR` liegen, erfasst `rm -rf ./.data/e2e`
(`playwright.config.ts:35`) sie **mit**. Analyse-Falle 29 („ein Upload-Test hinterlässt Blobs, die
kein `rm -rf` erfasst, wenn sie außerhalb von `DATA_DIR` liegen") ist damit durch die
Storage-Entscheidung erledigt — solange niemand `files/` aus `DATA_DIR` heraus verschiebt. Der
eigene Compose-Mount (§6.5) liegt **innerhalb** von `/data` und ändert daran nichts.

---

## 6. AV-Pipeline

### 6.1 Asynchron, und was der Empfänger sieht

Betreiberentscheidung E7 (b): **asynchron mit Statusspalte.** Nur so ist der Scan von der
Upload-Antwort entkoppelt, und nur so kann ein AV-Ausfall den Upload-Weg nicht blockieren.

Die Scan-Lücke ist ausdrücklich geregelt: **der Empfänger wartet.**

- **Fileshare:** Der Share-Link entsteht **sofort** und ist sofort weitergebbar. Ruft jemand ihn vor
  `clean` ab, zeigt `/s/<id>` den Zustand „wird geprüft", aktualisiert sich selbst und der Download
  bleibt gesperrt.
- **Inbox:** Der Upload ist **sofort** quittiert. Die Datei erscheint dem Betreiber im Posteingang mit
  Status und ist erst ab `clean` herunterladbar.

**Die Selbstaktualisierung ist JS-frei:** der Wartezustand enthält
`<meta http-equiv="refresh" content="5">`. Das kostet nichts, funktioniert auf jedem Handy und in
jedem Kiosk-Browser, und es ist auf genau diesen Zustand begrenzt — die fertige Ansicht lädt nicht
nach.

### 6.2 Statusmodell

```ts
// _lib/av.ts — EINE Konstante für beide Tabellen (Analyse E18)
export const AV_STATUS = ["scanning", "clean", "infected", "error", "unscanned"] as const;

/** DIE Freigabeprüfung. Genau ein Wert gibt frei. Zwei Aufrufer. */
export function istFreigegeben(status: AvStatus): boolean {
  return status === "clean";
}
```

| Wert | Bedeutung | Entsteht |
|---|---|---|
| `scanning` | angenommen, Prüfung läuft oder steht aus | bei jedem neuen Upload |
| `clean` | geprüft, freigegeben | Scanner meldet OK |
| `infected` | Fund | Scanner meldet Signatur |
| `error` | Prüfung nicht möglich (Protokollfehler, Zeitüberschreitung, Scanner unerreichbar nach N Versuchen) | §6.4 |
| `unscanned` | **nie** geprüft | ausschließlich Altbestand (Spec-2-Import) |

Übergänge: `scanning → clean | infected | error`; `error → scanning` (nur durch die Wiederholung, per
Timer oder Knopf); `unscanned → scanning` (nur durch den Nachscan-Lauf aus Spec 2). **Kein** Übergang
führt aus `clean` oder `infected` heraus.

**Jeder Leseweg prüft den STATUS, nicht die Datei.** Betroffen sind: Download, ZIP, Vorschau,
Inbox-Download, und die ZIP-Zusammenstellung (eine nicht freigegebene Datei wird **nicht** ins Archiv
aufgenommen, und der Nutzer erfährt, dass Dateien fehlen — ein stilles Weglassen wäre schlimmer als
ein 403).

### 6.3 fail-closed, nachweislich erreichbar

Nicht verhandelbar, weil drops Integration genau daran scheitert (Analyse Abschnitt 3.2: der
`catch`-Block und damit der **komplette** `AV_FAIL_OPEN`-Schalter werden für Protokollfehler nie
erreicht — end-to-end in beiden Schalterstellungen identisch gemessen):

1. **Es gibt keinen fail-open-Schalter.** `istFreigegeben` kennt einen Wert. Ein Env-Schalter, der
   „im Notfall doch ausliefern" erlaubt, wäre genau der toten Code aus `drop` in neuer Gestalt.
2. **`error` ist erreichbar und wird getestet** — und zwar über **alle fünf** Lesewege aus §6.2, nicht
   über drei: Download, ZIP (Ausschluss plus `_HINWEIS.txt`), Vorschau, Inbox-Download und die
   ZIP-Zusammenstellung aus dem Posteingang. Der Zustand wird über den Fake-clamd im Modus `error`
   hergestellt (§6.8) — die Herstellung gehört zur Zusage, sonst ist „mit abgeschaltetem Scanner" eine
   Aufgabe, die niemand ausführen kann. Geprüft wird zusätzlich `scanning` als eigener Zustand und der
   **Wiederholen-Knopf** in Detailseite **und** Posteingang. Die Zeile dazu steht in §11.5.
3. **Die Auswertung baut nicht auf `stream:`-Präfixe.** Gemessen: eine Übergröße antwortet
   `INSTREAM size limit exceeded. ERROR` — **ohne** `stream:`-Präfix. Die Auswertung ist deshalb:
   Antwort endet auf ` FOUND` → `infected` (Signatur ist der Teil davor); Antwort ist genau
   `stream: OK` bzw. `<pfad>: OK` → `clean`; **alles andere** → `error` mit der rohen Antwort als
   Grund. Insbesondere ist `stream: … ERROR` ein Fehler.

### 6.4 Der Scanner-Vertrag: ein settelndes Promise

```ts
export type AvErgebnis =
  | { art: "clean" }
  | { art: "infected"; signatur: string }
  | { art: "error"; grund: string };

/** Settelt IMMER, genau EINMAL. Wirft nie asynchron. */
export async function scanne(ziel: BlobZiel): Promise<AvErgebnis>;
```

Der belegte Anlass: drops `parseResponse` wirft bei jeder unerwarteten Antwort, und der Wurf passiert
im `socket.on('end')`-Callback (`antivirus.js:11-26,56-58`) — also außerhalb der synchronen
Ausführung des Promise-Konstruktors. Er wird **keine** Promise-Rejection, sondern eine uncaught
exception, und das Promise settelt **nie**. Gemessen: Exit-Code 1 mit Stack; `src/server.js:18-19`
registriert nur SIGINT/SIGTERM. **Im Monolithen reißt das ALLE Module mit** — `portal`, `qr`,
`feedback` inklusive.

Bauregeln:

- Ein `abschluss(ergebnis)`-Aufruf, durch ein `bereits`-Flag idempotent. **Alle** Ereignisse
  (`error`, `close`, `timeout`, `end`, Parse-Ergebnis) laufen durch ihn.
- **Kein `throw` in irgendeinem Socket-Handler.** Ein Parse-Fehler ist ein Rückgabewert.
- Harte Zeitgrenze (`FILES_AV_TIMEOUT_MS`), danach `socket.destroy()` und `{art:"error"}`.
- `socket.destroy()` in **jedem** Ausgang — sonst leckt der Descriptor.
- Der Pfad kommt aus `_lib/storage.ts`, nicht aus einem String-Bau. Mit `z`-Präfix ist er
  NUL-terminiert; mit `n`-Präfix wäre ein `\n` im Dateinamen ein Trennzeichen — im neuen Pfadschema
  gibt es keine Dateinamen im Pfad, aber die Wahl bleibt `z`.
- **Prozessweiter Netzhaken** in `src/instrumentation.ts` (dort läuft `register()` einmal beim Boot,
  `:4-13`): `process.on("unhandledRejection")` loggt mit Markierung und beendet **nicht**;
  `process.on("uncaughtException")` loggt mit Markierung und beendet dann mit `exit(1)`, weil ein
  unterdrückter uncaughtException den Prozess in einem undefinierten Zustand lässt und
  `restart: unless-stopped` (`compose.yaml:4`) der ehrlichere Weg ist. Der Haken ist die **zweite**
  Linie: tragend ist §6.4 selbst, und genau das muss der Test zeigen (§11.3).

**Warteschlange und Neustart.** Die Warteschlange ist die DB: Zeilen mit `av_status = 'scanning'`.
Ein In-Process-Arbeiter mit fester Nebenläufigkeit (`FILES_AV_PARALLEL`, Vorgabe 2) nimmt sie in
`empfangen_at`-Reihenfolge. Beim Boot werden Zeilen mit `av_status = 'scanning'` und
`av_geprueft_at IS NULL` erneut eingereiht — ohne diesen Schritt bliebe eine Zeile nach einem
Neustart mitten im Scan **für immer** auf `scanning`, und der Empfänger wartet auf etwas, das nie
kommt. Nach `FILES_AV_VERSUCHE` erfolglosen Versuchen (Scanner unerreichbar) → `error` mit Grund.

**Zwischen zwei Versuchen liegt `FILES_AV_WIEDERHOLUNG_SEKUNDEN` (Vorgabe 60), und das ist keine
Kosmetik.** clamd braucht nach einem Neustart bis zur Bereitschaft eine Größenordnung von zwei Minuten
(§6.5, `start_period` als Variable). Fünf **unmittelbar** aufeinander folgende Versuche wären nach
wenigen Sekunden erschöpft und ließen jede in diesem Fenster hochgeladene Datei in `error` fallen —
fail-closed, also nicht herunterladbar, obwohl der Scanner zwei Minuten später da ist. Mit 5 × 60 s
überspannt die Wiederholung das Startfenster. Was danach kommt, ist ein **benannter** Zustand mit
Wiederholen-Knopf (§6.7, §10.1) und **kein** automatischer Dauerversuch: `error → scanning` läuft nur
über die Wiederholung, per Knopf oder Timer (§6.2).

**Wo der Arbeiter startet.** Dieselbe `register()`-Kette wie alles andere Einmalige beim Boot:
`src/instrumentation.ts:4-13` → `core/bootstrap.ts` (dort laufen schon `assertHostConfig()` und
`migrateAllModules()`), **nach** den Migrationen, weil er die Tabellen liest. Der Startpunkt ist damit
derselbe wie beim Aufräum-Timer (§7.6) — und er ist hier benannt, weil ein Arbeiter ohne Startpunkt
eine Warteschlange ist, die niemand abarbeitet: die Uploads werden quittiert, alles bleibt auf
`scanning`, und kein Test wird rot.

**Kein globaler Semaphore über den Upload-Weg.** In `drop` umschließt ein einziger Semaphore beide
Upload-Routen **und** den gesamten Handler inklusive Virenscan, ohne Wartezeitgrenze und ohne
Request-Timeout; gemessen mit hängendem Scanner ist nach 1200 ms **keine** von vier Anfragen
beantwortet. Weil der Scan hier hinter der Antwort liegt, kann er den Upload-Weg nicht mehr stauen.

### 6.5 Compose — der Sidecar als Stack-Änderung

Heute hat der Stack **einen** Service, **ein** Netz (das externe `proxy`), kein `depends_on` und ein
Volume (`compose.yaml:1-4,40-49,61-67`).

```yaml
services:
  suite:
    volumes:
      - suite_data:/data
      - files_data:/data/files        # eigener Mount für die Blobs
    networks: [proxy, av]
    depends_on:
      clamav:
        condition: service_healthy
  clamav:
    image: ${SUITE_CLAMAV_IMAGE:-clamav/clamav:1.4}
    restart: unless-stopped
    networks: [av]                    # NUR das interne Netz
    volumes:
      - clamav_db:/var/lib/clamav     # Signaturen überleben ein Recreate
      - files_data:/data/files:ro     # Scan per Pfad, nur lesend
      - ./clamd.files.conf:/etc/clamav/clamd.conf:ro
    healthcheck:
      test: ["CMD", "clamdcheck.sh"]
      interval: 60s
      start_period: ${SUITE_CLAMAV_START_PERIOD:-120s}
volumes:
  files_data: { name: files_data }
  clamav_db:  { name: clamav_db }
networks:
  av: { internal: true }
```

Jede Zeile hat einen gemessenen Grund:

- **`internal: true`** — clamd ist **unauthentifiziert** und lauscht auf allen Interfaces (`TCPSocket 3310`
  gesetzt, `TCPAddr` kommentiert; im Container `0.0.0.0:3310`). So sind die Messungen der Analyse
  entstanden: ein fremder Container im selben Netz spricht ohne Zugangsdaten `zPING`, `zINSTREAM`,
  `zSCAN`. Am **externen** `proxy`-Netz wäre das jeder Container dort — und `zSCAN` nimmt einen
  **Pfad im clamav-Container** an, nicht nur Bytes. `drop`s `dropnet` ist übrigens **nicht**
  `internal: true`; die Abschottung dort entsteht allein daraus, dass der Service kein `ports:` hat,
  und das ist hier nicht übertragbar, weil `proxy` von außen bestückt wird.
- **`clamav_db`-Volume** — die Signaturen stecken im Image (`/var/lib/clamav` = 110.140 KiB), aber der
  erste Start lädt nach (danach 171.388 KiB, `daily.cld` unkomprimiert 86.136.832 B). Ohne Volume ist
  diese Arbeit nach jedem `up -d --force-recreate` weg, und der Start hängt an einer Netzverbindung.
- **`files_data` als eigener Mount, `:ro` im Sidecar** — er löst zwei Dinge: clamd sieht
  die **Datenbanken nicht** (`portal.db`, `qr.db`, `feedback.db`, `files.db` liegen in `suite_data`,
  `compose.yaml:40-41`); und `scripts/backup.sh` hat einen benannten Anker (§5.5). Für den Handgriff
  des Betreibers kann daraus in Spec 2 ein Bind-Mount werden
  (`/srv/iuk-suite/files:/data/files`, Analyse E15 (iii)) — **Vorbedingung: das Verzeichnis gehört
  uid 1001** (`Dockerfile:26-27,44-48`), nicht 1000 wie bei `drop`.
  **Was der eigene Mount NICHT leistet, und das gehört ehrlich hierher:** er schützt die Datenbanken
  **nicht** vor einem volllaufenden Blob-Bestand. Zwei benannte Docker-Volumes ohne `driver_opts`
  liegen auf **demselben** Host-Dateisystem (beide unter dem Docker-Datenverzeichnis); ein volles
  `files_data` erzeugt ENOSPC genau dort, wo auch die vier Modul-DBs liegen, und ein Bind-Mount auf
  derselben Partition ändert daran nichts. Analyse E19 (d) verlangt „eigenes Volume **oder** eine harte
  Gesamtgrenze" — Spec 1 hat weder eine belastbare Trennung noch eine Gesamtgrenze, und eine erfundene
  Gesamtgrenze wäre eine Zahl, die nur der Server kennt (§1.2). Getragen wird der Restplatz deshalb von
  **drei benannten Dingen**: der Ablage-Kachel mit freiem Platz (`statfsSync`, §5.6), der
  ENOSPC-Behandlung mit 507 und gelöschter Zwischendatei (§5.4), und einem eigenen Dateisystem bzw.
  einer Quota für den Blob-Ort — das ist eine Vorbedingung an den Betreiber, keine Codeentscheidung
  (§13.2, Frage 14).
- **`depends_on: service_healthy`** — Betreiberentscheidung, und die Kehrseite gehört benannt, weil
  diese Spec dieselbe Abwägung an zwei anderen Stellen **gegen** die Kopplung entscheidet (§5.6: kein
  files-eigener Healthcheck, „ein files-eigener Fehler nähme die anderen drei mit"; §9.3: die
  Zahlenpflicht ist bedingt, sonst startet die Suite „`portal`, `qr` und `feedback` inklusive" nicht).
  `depends_on` tut genau das: wird clamav nicht healthy — fehlgeschlagener freshclam-Erststart, zu
  knappe `start_period`, RAM-Mangel (§13, Frage 4) —, **startet die Suite gar nicht, mit allen vier
  Modulen**. Heute hat `compose.yaml:1-4,40-49` kein `depends_on`, der Präzedenzfall fehlt also auch.
  Warum es trotzdem so bleibt: der Unterschied ist **Stack-Reihenfolge** gegen **Fehlerfortpflanzung
  im Betrieb** — §5.6 und §9.3 verhindern, dass ein *laufender* files-Fehler die anderen Module
  trifft; `depends_on` ordnet nur den Start, und der Knopf, der die Wartezeit begrenzt, heißt
  `SUITE_CLAMAV_START_PERIOD`. Zwei Folgen, verbindlich: **Runbook-Zeile** „kommt die Suite nach
  `up -d` nicht hoch, ist `docker compose ps clamav` der erste Blick, nicht das Suite-Log"; und der
  Vorbehalt zur Begründung — das Startfenster wäre **auch ohne** `depends_on` gedeckt, weil Uploads
  angenommen werden und auf `scanning` stehen bleiben, statt abgelehnt zu werden (§6.7, Zeile 1). Die
  Kopplung kauft also nicht „keine Ablehnungen", sondern „kein Wartezustand direkt nach dem Start".
- **Eigene `clamd.files.conf`** mit `AlertExceedsMax yes`. Grund, gemessen:
  `zSCAN` per Pfad meldet eine Übergröße als **`OK`** („AlertExceedsMax heuristic detection
  disabled") — wer von INSTREAM auf Pfad wechselt, tauscht einen lauten Fehler gegen ein **stilles
  fail-open**. Genau das darf nicht passieren.
  **Und die Grenzen werden nicht „angehoben", sondern gleichgesetzt:** `MaxFileSize` und
  `StreamMaxLength` in `clamd.files.conf` tragen **denselben Wert wie `FILES_AV_MAX_BYTES`** (§9.3).
  Damit ist die dritte Zahl der Kette aus §6.6 kein Runbook-Rätsel mehr, sondern ein **Repo-Artefakt**
  aus einer einzigen Quelle, und §13.3/Frage 21 (`clamconf -n`) wird zur **Verifikation** statt zur
  Quelle. Die Datei trägt den Wert als Kommentar mit dem Namen der Env-Variable daneben, damit
  niemand nur eine der beiden Stellen ändert.
- **Image-Tag als Variable** — der Tag `clamav/clamav:1.4` hat nur ein `linux/amd64`-Manifest; auf
  arm64 muss es eine `-debian`-Variante sein, sonst bricht `docker compose up` mit „no matching
  manifest" ab. Welche Architektur der Host hat, ist Betreiberangabe (§13).
- **RAM:** clamd belegt mit geladenen Signaturen ~1 GB RSS (986,5 / 998,2 MiB in zwei Läufen), die
  zum Node-Prozess **hinzukommen**. Das ist eine Betreiberfrage vor dem Bau, nicht danach.
- **`start_period`** ist am Zielhost zu messen und **nicht** aus den 17 s der Analyse-Messung oder
  den 120 s aus `drop` zu übernehmen (die 120 s sind dort ein gesetzter Puffer, keine gemessene
  Ladezeit). Deshalb als Variable mit Runbook-Eingabe.

**Scan-Transport: `zSCAN` per Pfad** (Analyse E16 (b)). `drop` scannt per INSTREAM, liest die Bytes
dabei aber ohnehin **von der Platte** (`antivirus.js:33`, `createReadStream(filePath)`) — INSTREAM
kauft nichts, was das Dateisystem nicht schon hergibt, und es gibt keine zweite Kopie der Bytes über
einen Socket. **Randbedingung, ausdrücklich unmessbar am Schreibtisch:** clamd läuft im Image als
uid 100/gid 101, der Suite-Prozess als uid 1001/gid 1001; Modus von `/data/files` und der
geschriebenen Dateien sind **nicht gemessen**. Also: `schreibeStrom` setzt einen expliziten Modus
(`0o640`) und das Verzeichnis eine gemeinsame gid, **oder** der clamav-Service bekommt ein `user:`.
Welche Variante gilt, wird an der laufenden Instanz entschieden — Runbook-Schritt, nicht Vermutung
(§13).

### 6.6 Größengrenze und was oberhalb passiert

Drei Zahlen, **zwei Beziehungen**, und nur eine davon ist eine Prüfung:

```
FILES_MAX_DATEI_BYTES  ≤  FILES_AV_MAX_BYTES  ==  clamd-Kappe (MaxFileSize/StreamMaxLength)
       └── Boot-Prüfung, bricht den Start ab           └── per Konstruktion: EINE Quelle (§6.5)
```

Die clamd-Kappe kann die App nicht **lesen** — deshalb wird sie nicht geraten, sondern **gesetzt**:
`clamd.files.conf` trägt `FILES_AV_MAX_BYTES`, und beide stehen im Repo (§6.5). Damit bleibt als
Boot-Prüfung genau eine Ungleichung übrig, und die Kette hat keine unbelegte dritte Zahl mehr. Ohne
diese Kette äußert sich die Verletzung **nicht** als „Datei zu groß", sondern als AV-Fehler — und der
Nutzer sucht in der falschen Schicht (Analyse E19).

**Was passiert, wenn der real gesetzte `MAX_FILE_SIZE` über der scanbaren Größe liegt.** Der Fall ist
nicht hypothetisch: beide Alt-Apps erzwingen heute gemessen 500 MiB (`500 * 1024 * 1024 ===
524288000`, Analyse Falle 22), und der Image-Default von clamd kappt bei 100 MiB. Antwortet der
Betreiber auf Frage 1 mit 524.288.000, dann gilt:

- **`FILES_AV_MAX_BYTES` wird auf denselben Wert gesetzt, nicht `FILES_MAX_DATEI_BYTES` heruntergezogen.**
  Andernfalls wäre die Portierung eine stille Verhaltensänderung — Dateien, die heute durchgehen,
  würden abgelehnt, und die Spec hätte das nirgends als Entscheidung geführt.
- **Der Preis ist RAM und Scandauer, und er ist zu messen, nicht zu schätzen** (Analyse Punkt 20):
  clamd belegt mit geladenen Signaturen schon ~1 GB RSS (§6.5); eine 500-MiB-Datei per `zSCAN` per Pfad
  kommt oben drauf, und `FILES_AV_TIMEOUT_MS` (Vorgabe 60 000) muss für die größte real zugelassene
  Datei reichen, sonst landet jede große Datei über die Zeitgrenze in `error` — fail-closed, also
  dauerhaft nicht herunterladbar, obwohl nichts kaputt ist. Deshalb gehört zur Antwort auf Frage 1 der
  Runbook-Schritt „eine Datei in Höhe von `FILES_MAX_DATEI_BYTES` scannen, Dauer und RSS ablesen"
  (§13.3, Frage 23) — und wenn die Dauer die Zeitgrenze reißt, ist die Entscheidung des Betreibers
  entweder ein höheres `FILES_AV_TIMEOUT_MS` oder eine kleinere Obergrenze. Beides ist eine
  Betreiberentscheidung mit benannter Folge; geraten wird keine davon.

**Oberhalb von `FILES_AV_MAX_BYTES` wird abgelehnt**, mit einer benannten Meldung („Datei zu groß für
die Virenprüfung"). Nicht „annehmen und dauerhaft `unscanned`": das erzeugte eine Datei, die
fail-closed **nie** herunterladbar ist — eine Sackgasse mit Bytes darin. Weil
`FILES_MAX_DATEI_BYTES ≤ FILES_AV_MAX_BYTES` beim Boot erzwungen ist, ist dieser Zweig im
Normalbetrieb unerreichbar; er ist die zweite Linie und existiert, damit die erste keine stille
Voraussetzung hat.

### 6.7 Wenn clamd nicht erreichbar ist

| Lage | Verhalten |
|---|---|
| Startfenster nach `compose up` | `depends_on` verhindert es für den Suite-Start; passiert es doch (clamd-Neustart im Betrieb), bleiben Zeilen auf `scanning`, die Wiederholung greift, Uploads werden weiter **angenommen** |
| clamd dauerhaft weg | nach `FILES_AV_VERSUCHE` → `av_status = 'error'`, Grund im Log; Verwaltung zeigt „Prüfung nicht möglich" plus **Wiederholen**; Downloads bleiben gesperrt |
| clamd antwortet Unsinn | `error` mit roher Antwort als Grund; **Prozess läuft weiter** (das ist die Zusage aus §6.4) |
| Zeitüberschreitung | `error`, Socket zerstört, Wiederholung |

Der Melder sieht in **keinem** dieser Fälle einen technischen Fehler: sein Upload ist quittiert. Der
Empfänger sieht „wird geprüft" und, wenn es dabei bleibt, einen benannten Zustand mit dem Hinweis,
sich an den Absender zu wenden (§10).

### 6.8 Die Adresse des Scanners — und wie er in Dev und E2E aussieht

**Ohne diesen Abschnitt ist das Modul lokal unbenutzbar**, und zwar still: es gibt keinen fail-open-Schalter
(§6.3), `istFreigegeben` gibt nur bei `clean` frei, also erreicht ohne erreichbaren Scanner **keine
Datei** je `clean`. Weder `pnpm dev` noch mindestens sechs Zusagen aus §11.5 wären dann erfüllbar.

**Die Adresse.** Zwei Namen, Vorbelegung wie im Alt-System (`drop/.env.example:21-25`: `AV_HOST=clamav`,
`AV_PORT=3310`), damit der Compose-Servicename und die Vorbelegung übereinstimmen:

| Name | Vorbelegung | Bemerkung |
|---|---|---|
| `FILES_AV_HOST` | `clamav` | der Servicename aus §6.5; im internen Netz `av` auflösbar |
| `FILES_AV_PORT` | `3310` | clamds TCP-Port |

Beide haben eine Vorbelegung und stehen deshalb **nicht** unter den Pflichtvariablen (§9.3): es sind
keine Serverzahlen, sondern die Adresse eines Dienstes, den dieselbe Compose-Datei definiert.

**Dev und E2E: ein einschaltbarer Fake-clamd, kein zweiter Codepfad.** Verbindlich, weil §6.3.3 die
Auswertung an den Transport bindet und die Transportwahl damit nicht dem Umsetzer überlassen werden
darf:

- `scripts/fake-clamd.mjs` — ein `net.createServer` auf `127.0.0.1:${PORT:-3310}`, der `zPING` mit
  `PONG\0` und `zSCAN <pfad>\0` mit `<pfad>: OK\0` beantwortet, **nachdem** er den Pfad tatsächlich
  gestattet hat; existiert die Datei nicht, antwortet er `<pfad>: Can't access file ERROR\0`. Damit
  ist derselbe Transport (`zSCAN` per Pfad) in Dev, E2E und Produktion aktiv, und die Klasse „clamd
  sieht den Pfad nicht" ist lokal überhaupt darstellbar. Dass der Pfad in Dev `./.data/e2e/files/…`
  lautet (`playwright.config.ts:59`), ist unschädlich: der Fake läuft auf **derselben** Maschine mit
  demselben Arbeitsverzeichnis. Für einen echten clamav-Container wäre dieser Pfad unsichtbar — genau
  deshalb ist der Fake der Weg und nicht ein Sidecar im E2E-Aufbau.
- **Dasselbe Werkzeug wie in §11.3.** Der Fake ist die ausführbare Hülle um denselben
  `net.createServer`, den die Socket-Tests ohnehin bauen; Antwortmuster (`OK`, ` FOUND`, `… ERROR`,
  Zeitüberschreitung, `ECONNREFUSED`) liegen in **einer** Datei und werden per Argument bzw. Env
  gewählt (`FAKE_CLAMD_MODUS=ok|found|error|haengt`). Zwei Fakes wären zwei Wahrheiten über das
  Protokoll.
- **Gesetzt wird er an drei Orten:** `.env.example` (kommentierte Dev-Zeilen `FILES_AV_HOST=127.0.0.1`,
  `FILES_AV_PORT=3310`), ein `package.json`-Skript `"dev:av": "node scripts/fake-clamd.mjs"`, und
  `playwright.config.ts` als **zweiter** `webServer`-Eintrag (`webServer` nimmt ein Array; installiert
  ist `@playwright/test` 1.61.1). Der Fake-Eintrag startet vor `next dev` und bekommt seinen eigenen
  `port: 3310`-Bereitschaftscheck (nicht `url`: Playwrights `url`-Probe schickt eine HTTP-Anfrage, und ein roher clamd-Socket antwortet darauf nicht — der Lauf hinge beim Start statt laut zu scheitern).
- **Was ein Entwickler sieht, der `pnpm dev:av` vergisst** — der Satz gehört dazu, weil er den
  Unterschied zwischen einem benannten Zustand und einem halben Tag ausmacht: der Upload wird
  quittiert, die Datei steht auf „wird geprüft", nach `FILES_AV_VERSUCHE × FILES_AV_WIEDERHOLUNG_SEKUNDEN`
  auf „Prüfung nicht möglich" mit Wiederholen-Knopf, und der Download antwortet die ganze Zeit 403. Das
  ist **richtiges** Verhalten, sieht aber wie ein kaputtes Modul aus. Deshalb nennt die Ablage-Kachel
  (§5.6) die Zahl der `scanning`- und `error`-Zeilen, und der Grund im Log lautet wörtlich
  `ECONNREFUSED <host>:<port>`.

---

## 7. Fileshare-Seite (Rolle `verwaltung`)

### 7.1 Anlegen — Metadaten per Server Action, Bytes per Route Handler

Analyse E6: **(c) mit (b) für die Bytes.** Die Formularfehler (Titel, Ablauf, Passwort, Limit) gehören
in eine Server Action, weil die Suite-Regel Fehler **am Feld** verlangt (`useActionState`) und nicht
auf einer technischen Fehlerseite mit Datenverlust (`docs/design/README.md:245-247`). Die Bytes gehen
über einen Route Handler, der den Zielpfad **selbst** aus der DB holt.

Ablauf:

1. `anlegenAction(formData)` — validiert (getrimmter Titel nichtleer; `expiryDays` ganzzahlig,
   1 ≤ n ≤ `FILES_MAX_ABLAUF_TAGE`; `maxDownloads` entweder leer → NULL oder ganzzahlig ≥ 1;
   Passwort optional, bei gesetztem Wert Mindestlänge; **Zahl der gemeldeten Dateien
   1 ≤ n ≤ `FILES_MAX_DATEIEN_PRO_SHARE`**). Legt `shares` an und je gemeldeter Datei eine
   `share_files`-Zeile mit `bytes_vollstaendig_at = NULL`, `av_status = 'scanning'`,
   `size = 0`, `mime_type = 'application/octet-stream'` (Platzhalter, wird nach dem Upload durch den
   **festgestellten** Typ ersetzt). Liefert `{ shareId, dateien: [{ fileId, name }] }`.
   Nutzlast: reiner Text — die 1-MB-Grenze für Server Actions (HTTP 413) ist unerreichbar.
2. `PUT /api/upload/<fileId>?ab=<byteOffset>` — ein Chunk. Der Handler:
   - `requireFilesAccess()` (jede Route, nicht nur die Seite),
   - lädt die `share_files`-Zeile über `fileId`, holt `shareId` **aus der Zeile**,
   - `ab` muss **genau** der aktuellen Länge der Zwischendatei entsprechen; sonst 409 mit dem
     erwarteten Offset. **Ein Byte-Offset, keine Chunk-Nummer:** eine Nummer stimmt nur, solange jeder
     Chunk außer dem letzten exakt `FILES_CHUNK_BYTES` groß ist — eine unausgesprochene Invariante,
     die der erste abweichende Client still bricht. Der Offset trägt sie nicht,
   - `schreibeStrom(..., { anhaengen: true, maxBytes: FILES_MAX_DATEI_BYTES })`,
   - beim letzten Chunk (`?ende=1`): Magic-Byte-Prüfung (§8.5), `rename`, `size` = gemessene Bytezahl,
     `mime_type` = festgestellter Typ, `bytes_vollstaendig_at = now`, `total_size` neu summiert,
     Scan eingereiht.
3. `GET /api/upload/<fileId>` — liefert die bereits empfangene Bytezahl, also genau den nächsten
   `ab`-Wert. Damit ist der Upload **fortsetzbar**, ohne dass es dafür einen eigenen Mechanismus
   braucht: der Zustand ist die Länge der Zwischendatei.

**Die Mengengrenze ist nicht optional, weil ohne sie ein Aufruf Zeilen ohne Bytes erzeugt.** Die
Dateiliste in Schritt 1 kommt vom Client, und §9 führte bisher vier **Größen**, aber keine
**Mengengrenze**: ein Aufruf mit 50.000 gemeldeten Dateien legte 50.000 `share_files`-Zeilen an,
ohne dass ein Byte fließt, und der Aufräum-Timer holt sie erst nach `FILES_UPLOAD_VERFALL_STUNDEN`.
Die Alt-Systeme hatten hier Grenzen (`drop`: `files: 25`, `parts: 60`, Analyse Abschnitt 3.2) — für
die Inbox trägt das heute das Mengenbudget je Token (§8.4), der **Verwaltungs**weg hatte keins.
Deshalb `FILES_MAX_DATEIEN_PRO_SHARE` (§9.3), durchgesetzt in `anlegenAction`, mit einer Zusage in
§11.1: **n+1 gemeldete Dateien → Ablehnung, und es entsteht keine einzige Zeile** (die Ablehnung liegt
**vor** dem ersten `INSERT`, sonst wäre der halb angelegte Share genau der Zustand, den §4.4 vermeiden
will).

**Was damit strukturell verschwindet.** Der Zielschlüssel kommt **nicht** mehr vom Browser. In der
Alt-App nimmt `/api/upload/chunk` ihn als freien Request-Header und gibt ihn ungeprüft weiter
(`chunk/route.ts:11,23`), `/api/upload/complete` liest ihn aus dem JSON-Body
(`complete/route.ts:12,25`) — kein Abgleich gegen `share_files.s3_key`, keine Präfix-Prüfung. Auf
einem Dateisystem heißt das „schreibe an jede Stelle, die der Prozess erreicht" (Analyse Falle 28).
Ebenso weg: `uploadId`, `ETag`, `PartNumber` (haben auf einem Dateisystem keine Entsprechung) und
`abortMultipartUpload` (das ohnehin keinen Aufrufer hatte).

**Chunk-Größe: `FILES_CHUNK_BYTES = 4 MiB`, eine Konstante in `_lib/grenzen.ts`, keine Env-Variable.**
Grund: der Next-Proxy kappt Request-Bodies bei `proxyClientMaxBodySize`, Default **10 MiB**
(`node_modules/next/dist/server/config-shared.js:260`), und `cloneBodyStream` bricht bei
Überschreitung ab, schiebt `null` in beide Streams und gibt **nur** ein `console.warn` aus
(`server/body-streams.js:85-101`). Der Klon passiert bei jedem non-GET/HEAD-Request, der die
Middleware trifft, und `proxy.ts` schließt nur `_next/static`, `_next/image` und `favicon.ico` aus
(`src/proxy.ts:102-104`). 4 MiB liegt mit Abstand darunter — **eine Zahl, die wir ohne Server kennen**,
weil sie eine Untergrenze gegen einen Default ist, keine Anpassung an eine unbekannte Konfiguration.
Der **konfigurierte** Wert der Kappung ist Runbook-Eingabe (§13); solange er nicht unter 4 MiB
gesenkt wurde, ist der Weg tragfähig.

**Warum nicht ein streamender PUT pro Datei** (E6, Option b in Reinform): eine Datei ist größer als
10 MiB, sobald ein Handyfoto-Bündel oder ein Video im Spiel ist — und die Kappung wäre **still**.
Chunked ist deshalb keine Zutat, sondern die Konsequenz aus dem gemessenen Default. Der Betreiber hat
„chunked Upload" ohnehin so benannt.

### 7.2 Fortschritt und Client-Inseln

**Die Verwaltung hat fünf Client-Inseln, nicht eine — und „die Seite bleibt RSC" gilt für die Seite,
nicht für die Tabelle.** Eine antd-`Table` ist laut `docs/design/README.md:43` in RSC sicher, aber nur
gegen **Falle 1** (Compound-Zugriff). Das Problem einer Arbeitstabelle ist ein anderes: `columns` mit
`render`-Funktionen, Zeilenaktionen, Bestätigungsdialogen und Filtern reicht **Funktionen** über die
RSC-Grenze, und das scheitert unabhängig von Falle 1. Der Präzedenzfall bestätigt es und wird hier
ausdrücklich genannt: `feedback/_ui/Verlauf.tsx:1` trägt `"use client"`, obwohl §7.3 es als Vorbild
für die CSS-Umschaltung Tabelle/Kartenliste zitiert.

| Insel (`"use client"`) | Wofür |
|---|---|
| `_ui/UploadInsel.tsx` | chunked Upload auf `/shares/neu`: Fortschritt, Wiederholen, Abbrechen je Datei |
| `_ui/SharesTabelle.tsx` | Übersicht auf `/`: `render`-Spalten, Zeilenaktionen, QR-Dialog, Löschen mit Bestätigung |
| `_ui/PosteingangTabelle.tsx` | `/posteingang`: Filter, Mehrfachauswahl, Zeilenaktionen (§8.6) |
| `_ui/ZugangslinksListe.tsx` | `/zugangslinks`: Anlegen-Dialog, einmalige Ausgabe mit QR, Widerrufen |
| `_ui/AbgabeFormular.tsx` | `/u/<token>`: Dateiauswahl, Fortschritt, Quittung (öffentliche Klasse, **kein** antd) |

**Was in der Server Component bleibt:** die gesamte Datenaufbereitung. Die Seite lädt, projiziert
(inklusive `hatPasswort: boolean` statt `password_hash`, §7.3), formatiert Größen und Zeiten und
übergibt **fertige, serialisierbare** Zeilen-Objekte — keine Drizzle-Rows, keine `Date`-Objekte in
Feldern, die eine `render`-Funktion nur ausgibt, keine Funktionen. Damit ist die Grenze schmal und
das Route-JS klein, und die Insel enthält Darstellung plus Interaktion, nicht Fachlogik.

Regeln für alle Inseln:

- **Keine Konstante wird aus der Insel in eine Server Component importiert.** `FILES_CHUNK_BYTES`, die
  MIME-Allowlist und jede Grenze liegen in `_lib/grenzen.ts` bzw. `_lib/mime.ts` — Module **ohne**
  `"use client"`. Andernfalls bekäme die Server Component eine Client-Referenz statt des Wertes, HTTP
  500 für die ganze Seite, und **weder `pnpm build` noch Vitest können das finden**
  (`docs/design/README.md:87-103`; bei einem Upload-Modul ist genau die Chunk-Größe der naheliegende
  Kandidat, Analyse Falle 13).
- **Kein antd-Compound-Zugriff in einer Server Component.** Verboten sind u. a. `Form.Item`,
  `Descriptions.Item`, `List.Item`, `Upload` in RSC (`docs/design/README.md:39-44`) — und das sind bei
  einer Datei-Verwaltung die erste Wahl (Analyse Falle 14). Interaktive Teile sind Client-Kinder, die
  Seite bleibt RSC.
- `size` wird auf Bedienelementen **nicht** gesetzt: `controlHeight: 56` ist die Vorgabe,
  `size="large"` wären 72px (`docs/design/README.md:59-62`).
- Fortschritt je Datei, Wiederholen je Datei, und ein **Abbrechen**, das die Zwischendatei löscht
  (`loesche`) und die Zeile entfernt.

### 7.3 Verwaltung

**Übersicht (`/`)** — antd `Table` mit: Titel, Typ, Dateien, Größe (gemessen), Ablauf, Downloads
(`n / m` bzw. `n / ∞`), Passwortschutz (Ja/Nein), AV-Zustand als Sammelwert, „Erstellt von", Aktionen.

- `scroll={{ x: "max-content" }}` — die Spalten tragen keine `width`, also ist `max-content` die
  einzige ehrliche Angabe (`docs/design/README.md:176-182`). **Keine Spalte bekommt `fixed`,
  `ellipsis` oder `scroll.y`**, sonst schaltet rc-table auf `table-layout: fixed` und das
  Desktop-Bild ändert sich, ohne dass irgendwo etwas überläuft (`lib/Table.js:426-442`).
- Unter 768px eine **Kartenliste** statt der Tabelle: beide Darstellungen werden gerendert, CSS
  blendet eine aus (Vorbild `feedback/_ui/Verlauf.tsx`). Die Umschaltung ist CSS, nie JavaScript.
- **768px ist der einzige Breakpoint**, in `max-width`-Abfragen **767.98px**
  (`docs/design/README.md:158-197`). Handlungsknöpfe unter 768px: volle Breite, untereinander.
- **Die Umschaltung sitzt auf antd-Markup, also braucht sie eine Klasse mehr.** Die Regel, die die
  Tabelle unter 767.98px ausblendet, trifft `.ant-table-wrapper` — ein eigener Selektor `.nurDesktop`
  ist (0,1,0) und damit im **Gleichstand** mit antds Klasse; bei Gleichstand entscheidet die
  Dokumentreihenfolge, und **antds Stylesheet kommt später** (`docs/design/README.md:64-79`, dort ist
  es dreimal passiert). Verbindlich: der eigene Selektor trägt eine vorangestellte Klasse
  (`.fi-liste .nurDesktop` = (0,2,0)) — **nie** `!important` —, und **die Erhöhung wird kommentiert**,
  sonst entfernt sie die nächste Aufräumrunde als Ballast (`docs/design/README.md:81-85`). Der
  Quelltext-Scan aus §11.4 besitzt die Aussage „der eigene Selektor trägt den Präfix"; ob sie **wirkt**,
  besitzt Playwright bei 390, 1280 **und** dazwischen (§11.5).
- **`password_hash` überquert die Grenze nicht.** Die Alt-App selektiert alle Spalten inklusive
  `password_hash`, spreadet sie und übergibt sie an die Client-Komponente, die `passwordHash: string | null`
  ausdrücklich deklariert, benutzt aber nur den Wahrheitswert (Analyse Falle 11). In `files` liefert
  die Abfrage `hatPasswort: boolean` — die Query listet ihre Spalten auf, `select()` ohne Argument ist
  im Modul nicht erlaubt.

**Detail (`/shares/[id]`)** — Metadaten, Dateiliste mit AV-Zustand je Datei, Audit-Log (§7.8),
öffentlicher Link mit Kopieren, QR mit PNG-Download, Aktionen: Bearbeiten, Downloads aufstocken,
Löschen. Die Größensumme wird **aus den Zeilen** gerechnet und `total_size` daneben nicht mehr
angezeigt — heute zeigen Dashboard und Detailseite dieselbe Größe aus **zwei** Quellen und können
verschiedene Zahlen zeigen (Analyse Abschnitt 2.1, Befund 2).

**Bearbeiten (`/shares/[id]/bearbeiten`)** — Titel, Beschreibung, Ablauf, Limit, Passwort setzen/entfernen.
Zwei Defekte werden hier **nicht** mitportiert:

1. Der Ablauf wird mit dem **tatsächlichen** Wert der Zeile vorbelegt und nur geschrieben, wenn er
   verändert wurde. Alt: `useState(1)` und bedingungsloses Senden → wer nur den Titel korrigiert,
   verkürzt den Share auf 24 Stunden.
2. Serverseitige Deckelung auf `FILES_MAX_ABLAUF_TAGE` **in der Action**, nicht nur als
   HTML-Attribut. Über einen direkten Action-Aufruf waren in der Alt-App 0, negative und beliebig
   große Werte möglich.

**Löschen** — `shares`-Zeile, `share_files`-Zeilen, **alle Blobs** (`loesche` je Datei, danach das
Verzeichnis), Zwischendateien. Das Audit-Log bleibt (kein Cascade, §4.5). Bestätigungsdialog mit der
Zahl der Dateien und der Größe.

### 7.4 Öffentliche Ansicht `/s/<id>` und das serverseitige Passwort-Gate

Gestaltungsklasse: **öffentlich** — eigenes CSS-Modul, **kein antd**, mobile-first, eigene Skala
erlaubt (`docs/design/README.md:15-21`). Damit ist die RSC-Compound-Falle für diese Route strukturell
ausgeschlossen. Vorbild für die Anmutung: `docs/design/feedback-oeffentliche-ansicht.md`.

**Der Passwortschutz wird serverseitig erzwungen** (Betreiberentscheidung, Analyse E4 (b)). Heute ist
er Dekoration: `POST /api/download/[id]/verify` prüft korrekt gegen bcrypt und antwortet dann
`{ ok: true }` (`verify/route.ts:29`) — kein Cookie, kein Token; der Client merkt sich das in
React-State; und die drei Endpunkte, die Bytes ausliefern, lesen `passwordHash` **nirgends**. Wer die
Share-ID kennt — sie steht in seiner eigenen URL — lädt ohne Passwort. Verschärfend: die Alt-Seite
lädt die Dateien **bevor** sie das Passwort prüft und übergibt die fertigen Ansichten als `children`
an eine Client-Komponente; Dateinamen, Größen, Beschreibung und die fertigen Download-URLs stecken
damit im **RSC-Payload derselben Antwort**, die die Passwortmaske zeigt.

Aufbau in `files`:

- `PasswordGate` ist eine **Server-Komponente**. Bei gesetztem `password_hash` und fehlendem gültigem
  Cookie rendert die Seite **nur** die Maske: Titel, Hinweis, Feld, Knopf. **Keine Dateiliste, keine
  IDs, keine Größen, keine Beschreibung** — das Markup entsteht erst nach dem Entsperren.
- `POST /api/s/<id>/verify` prüft mit bcrypt und setzt bei Erfolg das Cookie:
  - Name `files_s_<shareId>` (die ID ist `[A-Za-z0-9_-]{10}`, also ein gültiger Cookie-Name; ein
    einziges Cookie würde beim zweiten geschützten Share den ersten überschreiben),
  - Wert `<shareId>.<gueltigBis>.<hmac>`, HMAC-SHA256 über `AUTH_SECRET` mit der
    Domänentrennung `files-share-v1:` im Nachrichtenpräfix. **Kein neues Geheimnis in der `.env`** —
    `AUTH_SECRET` ist bereits Pflicht (`compose.yaml:23`), und die Domänentrennung verhindert, dass
    ein Wert aus einem anderen Zusammenhang hier gilt.
  - `HttpOnly`, `SameSite=Lax`, `Secure` in Produktion, `Path=/`, `Max-Age = min(4 h, Restlaufzeit
    des Shares)`. `Path=/` ist nötig, weil auch `/api/download/…` und `/api/preview/…` es lesen.
- **Jeder** Byte-Weg prüft das Cookie: Download, ZIP, Vorschau. Die Prüfung ist **eine** Funktion in
  `_lib/passwort.ts` mit drei Aufrufern. **Es gibt genau einen Annahmeweg** — das Cookie. Kein
  Bestandslink-Sonderweg, keine Karenz, kein zweites Prädikat.
- **Und deshalb ist die Frage nach nackten `/api/download/…`-Links eine Vorbedingung des Baus, nicht
  eine Feinjustierung danach** (§13.1, Frage 6). Analyse E4 formuliert es in dieser Richtung: „**Vorher**
  muss der Betreiber bestätigen, dass keine nackten Download-Links verteilt wurden — falls unklar, (c)."
  Fällt die Antwort „ja/unklar", ist (c) **kein Schalter**, sondern ein **zweiter Annahmeweg auf allen
  drei Byte-Routen** (Cookie **oder** Bestandslink-Karenz bis `expires_at`), mit eigener Zustandslogik,
  eigenen Statuscodes und eigenen Tests — gebaut in Spec 1, nicht in Spec 2. Solange die Antwort
  aussteht, wird der Cookie-Weg gebaut und (c) ist **nicht** spezifiziert; wer ihn braucht, spezifiziert
  ihn dann hier, bevor die Byte-Routen entstehen.
- **Rate-Limit auf `/verify`** (E4): Schlüssel `${shareId}|${ip}`, 10 Versuche / 10 Minuten, **vor**
  dem bcrypt-Aufruf. Heute ist `verify` unbegrenzt aufrufbar und der einzige Ort, an dem pro Anfrage
  bcrypt mit cost 12 gerechnet wird — ein Rechenlast-Verstärker mit einer Zeichenfolge als
  Eintrittskarte.
- **Das Orakel wird geschlossen:** heute antwortet `verify` 404 für „existiert nicht" **und**
  „existiert ohne Passwort". In `files` gibt es genau zwei Antworten: „falsch" (401) und „richtig"
  (200) — für einen nicht existierenden oder passwortfreien Share ebenfalls 401, damit die Antwort
  keine Existenzaussage trägt.
- Prüfreihenfolge auf **allen** Wegen identisch, in **einer** Ladefunktion:

  ```
  Existenz → Ablauf → Passwort-Cookie → AV-Status → Limit
                                                     └── LESEND in der Ladefunktion,
                                                         VERBRAUCHEND nur auf den Byte-Wegen (§7.5)
  ```

  Heute sind es fünf Eintrittspunkte mit fünf verschiedenen Prüfketten, und `verify` prüft weder Ablauf
  noch Limit (ein abgelaufener Share verifiziert sein Passwort weiter).

  **Das Limit steht hinter dem Passwort, nicht davor — und die Ladefunktion zählt nichts hoch.** Eine
  frühere Fassung dieser Spec setzte „Existenz → Ablauf → Limit → Passwort" in **eine** Funktion, die
  auch die Seite `/s/<id>` bedient, während §7.5 die Limitprüfung als **verbrauchendes** `UPDATE`
  festlegt. Zusammengelesen hätte schon das Öffnen der öffentlichen Seite — und jeder anonyme
  `/api/download/<id>`-Aufruf **ohne** Passwort — einen Download verbraucht: ein Share mit
  `max_downloads = 3` wäre mit drei fremden GETs tot, und das serverseitige Gate aus E4 (b) wäre still
  ausgehebelt statt schützend. Verbindlich ist deshalb die Trennung:
  - **Die Ladefunktion liest** `download_count`/`max_downloads` nur, für die Zustandsseite „Die
    zulässige Zahl an Downloads ist erreicht" (§10.1) und für die Darstellung.
  - **Das atomare Inkrement (§7.5) läuft ausschließlich in `download` und `zip`**, nach Existenz,
    Ablauf, Passwort-Cookie und AV-Status, als **letzter** Schritt vor dem ersten Byte. Nie beim
    Rendern von `/s/<id>`, nie in `preview`, nie in `verify`.
  - Zwei Zusagen halten das fest (§11.1/§11.5): **ein 401** (fehlendes/falsches Cookie) **und ein 403**
    (AV nicht `clean`) **erhöhen `download_count` nicht.**

**Der gemischte AV-Zustand eines Shares — Zeilenzustand, nicht Seitenzustand.** Ein Share mit drei
`clean`- und einer `scanning`-Datei ist der Normalfall, sobald mehrere Dateien hochgeladen werden, und
er braucht eine Regel, sonst blockiert eine hängende Datei einen fertigen Share:

- Die Dateiliste zeigt **je Zeile** ihren Zustand (freigegeben / wird geprüft / gesperrt / nicht
  auffindbar); freigegebene Zeilen sind sofort herunterladbar.
- `<meta http-equiv="refresh" content="5">` steht **genau dann** im Markup, wenn **mindestens eine**
  Datei `scanning` ist. Sonst nicht.
- **`error` und `infected` sind Endzustände ohne Refresh.** Ohne diese Festlegung lädt eine Seite mit
  einer dauerhaft fehlgeschlagenen Datei alle 5 Sekunden nach — für immer, auf einem fremden Handy.
  Die Zeile trägt stattdessen den benannten Zustand plus den Hinweis, sich an die Person zu wenden,
  die den Link gegeben hat.
- Der **ganzseitige** Wartezustand bleibt genau einem Fall vorbehalten: **keine** Datei ist freigegeben
  und mindestens eine ist `scanning`. Dann gibt es nichts zu zeigen außer dem Warten.

**Zustandsseiten und Statuscodes.** Eine Next-**Seite** kann keinen 410 setzen; nur ein Route Handler
kann das. Deshalb, ausdrücklich als Festlegung, damit niemand es „repariert" und dabei die Seite in
einen Route Handler umbaut:

| Weg | Lage | Antwort |
|---|---|---|
| `/s/<id>` | unbekannte ID | `notFound()` → 404, Suite-404-Seite (`src/app/not-found.tsx`) |
| `/s/<id>` | abgelaufen / Limit erreicht | **HTTP 200** mit eindeutiger Zustandsseite (wie heute) |
| `/s/<id>` | AV nicht `clean` | 200, Wartezustand mit Selbstaktualisierung (§6.1) |
| `/api/download/…`, `…/zip`, `…/preview` | abgelaufen / Limit erreicht | **410** |
| dieselben | AV nicht `clean` | **403** |
| dieselben | Passwort fehlt/falsch | **401** |
| dieselben | Blob fehlt | **404** (Alt-App: 500) |

### 7.5 Download-Limit als harte Zusage

Analyse E10 (b): **atomar vorher zählen und sperren.**

```sql
UPDATE shares SET download_count = download_count + 1
 WHERE id = ? AND (max_downloads IS NULL OR download_count < max_downloads)
```

**Wo dieses `UPDATE` läuft, ist Teil der Zusage:** in `download` und `zip`, als **letzter** Schritt vor
dem ersten Byte — nach Existenz, Ablauf, **Passwort-Cookie** und AV-Status (§7.4). Nicht in der
gemeinsamen Ladefunktion, nicht beim Rendern von `/s/<id>`, nicht in `preview`, nicht in `verify`.
Liefe es früher, wäre „ein abgebrochener Download ist verbraucht" nicht der benannte Preis, sondern die
Tarnung für „ein fremder GET ist verbraucht".

Null betroffene Zeilen → 410, kein Byte fließt. Das ist die einzige Variante, bei der
`max_downloads` hält, was es verspricht, und sie ist ein einzelnes SQL-Statement. Heute läuft der
Zähler in `after()` auf einem vor der Antwort gelesenen Wert; das SQL-Inkrement ist atomar, die
**Limit-Ableitung** `newCount = share.downloadCount + 1` nicht — und `after` läuft laut
mitgelieferter Doku auch dann, wenn die Antwort nicht erfolgreich abgeschlossen wurde: ein Abbruch
nach einem Byte zählt als Download. `max_downloads` bedeutet heute „etwa N".

Der Preis gehört benannt: ein abgebrochener Download ist **verbraucht**. Das ist die
Betreiber-freundliche Richtung — „dieser Link funktioniert dreimal" ist dann eine Obergrenze, keine
Schätzung —, und die Verwaltung hat „Downloads aufstocken" als Gegenmittel.

**Ein ZIP-Download zählt als genau ein Download** (wie heute; `file_id = NULL` im Log).

### 7.6 Aufräumen — interner Timer, Protokollzeile, Trockenlauf

Analyse E13 (b): Die Suite hat **keinen** Cron; `feedback` löst sein Zeitproblem durch Statusfalten
beim Abruf („Es gibt keinen Cron", `feedback/_lib/cockpit.ts:19`) — für Bytes trägt das nicht, ein
Statusfalten löscht keine Bytes.

- **Timer beim Boot**, angehängt an `instrumentation.ts`/`bootstrap.ts` (dort läuft schon
  `migrateAllModules`). Takt `FILES_AUFRAEUMEN_TAKT_MINUTEN`, erster Lauf verzögert.
- **Ein Container, ein Timer.** `compose.yaml:1-4` hat kein `deploy:`/`replicas:`. Bei mehreren
  Instanzen liefe der Timer mehrfach und bräuchte ein Lock — das steht als Kommentar an der
  Timer-Registrierung, damit die Voraussetzung sichtbar ist.
- **Protokollzeile je Lauf** in `files.db`, Tabelle `aufraeum_laeufe` — **Spalten, Typen und Einheiten
  stehen in §4.8 und nur dort.** Eine zweite Aufzählung hier wäre eine zweite Wahrheit, und eine
  Migration nach der kürzeren Liste fehlte eine Spalte (dieselbe Regel wie bei `AV_STATUS` und der
  clamd-Kappe: eine Quelle). Ohne diese Zeile ist „hat es gelaufen?" nicht beantwortbar.
- **Trockenlauf-Schalter** `FILES_AUFRAEUMEN_TROCKENLAUF=1`: zählt und protokolliert, löscht nichts.
  Er ist für den **ersten** Lauf nach dem Cutover da — falls auf dem Server kein Cleanup-Cron läuft,
  enthält die Produktions-DB abgelaufene Shares vollständig, und der erste Lauf im neuen System ist
  ein **Löschereignis**, keine Hintergrundaufgabe (Analyse Abschnitt 8, Punkt 7). Der Ablauf gehört ins
  Spec-2-Runbook.
- **Kein `/api/cleanup`-Endpunkt.** Ein Secret weniger in der `.env`. Und der Alt-Endpunkt hatte eine
  Falle, die man nicht erbt: `replace("Bearer ", "")` ist keine Prüfung — das nackte Secret passiert
  ebenfalls. Dazu käme, dass ein Cron, der einen Host aufruft, den `moduleForHost` nicht kennt, ein
  **302 auf `/login`** bekommt und Erfolg meldet, wenn er nur auf HTTP-Fehler prüft. Ein manueller
  Auslöser ist stattdessen ein **Knopf in der Verwaltung** (mit Trockenlauf-Vorschau) — er hat eine
  Session, also kein Secret.

Regeln, die der Timer durchsetzt (alle in `_lib/aufraeumen.ts` als **reine** Funktionen, damit sie
ohne Uhr und ohne Dateisystem testbar sind):

| Was | Bedingung |
|---|---|
| Share + Dateien + Blobs | `expires_at < now − FILES_LOESCH_KARENZ_STUNDEN` |
| unvollständige Uploads + `.part` | `bytes_vollstaendig_at IS NULL AND created_at < now − FILES_UPLOAD_VERFALL_STUNDEN` |
| Audit-Logzeilen | `downloaded_at < now − FILES_LOG_AUFBEWAHRUNG_TAGE` |
| Inbox-Dateien | nur wenn `FILES_INBOX_AUFBEWAHRUNG_TAGE` **gesetzt** ist: `empfangen_at < now − n` |
| verwaiste Blobs | Verzeichnis ohne `shares`-Zeile → **berichten**, nicht löschen |

Die letzte Zeile ist Absicht: verwaiste Bytes automatisch zu löschen wäre in einem Modul, dessen
Bestand gerade importiert wird, der teuerste denkbare Fehler. Sie erscheinen in der Ablage-Kachel und
im Protokoll.

`FILES_INBOX_AUFBEWAHRUNG_TAGE` hat **keine Vorbelegung**, und nicht gesetzt heißt „keine Frist" —
das ist genau das heutige Verhalten von `drop` (weder Frist noch Löschfunktion). Die Frist ist eine
fachliche Zusage, keine technische Entscheidung (§13).

### 7.7 ZIP, Vorschau, Download-Header

**ZIP** (`/api/download/<id>/zip`) — sequenziell, `zlib: { level: 1 }`, Streaming ohne Temp-File.
Die hart erarbeitete Abbruchbehandlung der Alt-App **wandert mit**, auch wenn ihr S3-Anlass wegfällt:
PassThrough, `archive.on("error")`, `req.signal`-Listener, Cleanup im `finally` — sie verhindert hier
geleckte File-Descriptors statt Sockets.

Zwei Korrekturen:

- **Gleichnamige Dateien** bekommen im Archiv einen Zählsuffix (`bericht.pdf`, `bericht-1.pdf`). Alt:
  zwei Einträge gleichen Namens, und was das entpackende Programm daraus macht, ist offen.
- **Nicht freigegebene Dateien** (`av_status ≠ clean`, unvollständige Uploads) sind **nicht** im
  Archiv, und die Antwort sagt es: fehlen Dateien, trägt das ZIP eine `_HINWEIS.txt` mit ihren Namen
  und dem Grund. Ein stilles Weglassen wäre schlimmer als ein 403.

Der Dateiname des Archivs: Titel hart entschärft (`replace(/[^a-zA-Z0-9_-]/g, "_")`, 1:1 aus
`zip/route.ts:125`) als ASCII-Fallback **plus** `filename*=UTF-8''<prozentkodiert>` mit dem echten
Titel. Alt gab es an allen drei Stellen nur `filename="${encodeURIComponent(name)}"` und kein
`filename*` — Umlaute kommen dort als `%C3%9C` beim Empfänger an.

**Vorschau** (`/api/preview/<id>?file=<id>`):

- **Serverseitige Typ-Allowlist**, geprüft gegen den **festgestellten** `mime_type` aus der DB — eine
  Quelle, nicht zwei. Alt prüft den DB-Wert und liefert den Storage-Wert im Header: eine Route, zwei
  Quellen für denselben Wert (Analyse Abschnitt 2.1, Befund 6).
- **`image/svg+xml` ist NICHT in der Inline-Allowlist.** Ein SVG ist ein ausführbares Dokument im
  Origin der Fileshare-Domain; heute steht es in `PREVIEWABLE_TYPES` und wird mit
  `Content-Disposition: inline` ausgeliefert, ohne `nosniff` und ohne CSP. Der Download bleibt
  möglich. Der Radius hängt am Cookie-Scope (beide Hosts liegen unter `.iuk-ue.de`,
  `compose.yaml:25` ist dafür nur der Vorgabewert), aber die Maßnahme hängt **nicht** daran: das SVG
  wäre auch ohne jede Cookie-Frage ausführbares Fremd-Markup auf einer Suite-Domain.
- Jede Vorschau-Antwort trägt `X-Content-Type-Options: nosniff` und
  `Content-Security-Policy: sandbox` (Analyse E9).
- **`FILES_VORSCHAU_MAX_BYTES` gilt für ALLE Vorschauen, nicht nur für Text** — sonst trägt der Name
  seine Aussage nicht (§9.1), und die Begründung im nächsten Punkt („begrenzt wird das durch die
  Typ-Allowlist und die Bytekappe") hielte nicht: eine 400-MB-JPEG-Vorschau wäre ein ungezählter,
  beliebig oft wiederholbarer Vollabruf. Zwei Verhaltensweisen, eine Grenze:
  - **Text** wird serverseitig **gekappt** und mit dem Hinweis „gekürzt angezeigt" ausgeliefert. Alt
    existiert die 100-KB-Kappung nur im Browser **und nur, wenn `Content-Length` vorhanden ist** —
    fehlt der Header, liest der Client die ganze Datei.
  - **Alles andere** (Bild, PDF) oberhalb der Grenze bekommt **keine** Inline-Vorschau: an der Stelle
    des Vorschau-Knopfes steht der benannte Zustand „Zu groß für die Vorschau" plus der
    Download-Knopf. Ein halbes Bild ist keine Vorschau, also wird nicht gekappt, sondern abgelehnt.
- **Die Vorschau zählt nicht als Download und wird nicht geloggt** — 1:1 wie heute. Der Preis ist
  benannt: solange ein Download frei ist, ist eine vorschaufähige Datei beliebig oft vollständig
  lesbar. Begrenzt wird das durch die Typ-Allowlist und die Bytekappe, **nicht** durch den Zähler; ein
  Mitzählen würde einen Share mit `max_downloads = 1` durch das Öffnen der Vorschau verbrauchen, und
  das wäre eine Verhaltensänderung für bereits verteilte Links.
- Keine Thumbnails, keine Bildverarbeitung.

**Download** (`/api/download/<id>?file=<id>`):

- `Content-Type` aus der DB (`mime_type`), **nie** geraten und **nie** aus einer Storage-Angabe. Alt
  setzt `contentType ?? "application/octet-stream"` **ohne** DB-Fallback, und beim Upload wurde
  `ContentType` nie gesetzt.
- `Content-Disposition: attachment` — immer, für jeden Typ.
- `filename="<ASCII-Fallback>"; filename*=UTF-8''<prozentkodiert>`.
- `X-Content-Type-Options: nosniff`.
- `Content-Length` aus der gemessenen Größe (mit dem Abgleich aus §5.4).
- **Kein `Range`, kein `Accept-Ranges`, kein 206** — wie heute (im Alt-Repo 0 Treffer). Bewusst
  nicht ergänzt: es wäre neue Funktionalität, sie kollidiert mit dem atomaren Zähler (ein Client, der
  drei Range-Anfragen stellt, wäre drei Downloads), und niemand hat sie beauftragt. Als verworfene
  Alternative in §12.

### 7.8 Audit-Log

- Ansicht auf der Share-Detailseite: Zeit, Was (`Datei <name>` / `ZIP`), `client_ip_unbestaetigt`,
  User-Agent; bis 100 Einträge mit „mehr laden".
- **Gegatet wie alles andere** — `requireFilesAccess()`. Die Alt-Route
  `GET /api/shares/[id]/logs` wird **nicht** portiert: sie prüft nur `if (!session)`, nicht `isAdmin`
  und nicht `createdBy`, liefert bis zu 100 Einträge mit IP, User-Agent und Zeitstempel zu **jeder**
  shareId aus der URL, die Middleware gatet den Pfad nicht (`/api/shares` beginnt nicht mit
  `/shares`), und die UI ruft sie nirgends auf — toter, ungegateter Code. Die Detailseite liest direkt
  aus der DB, so wie die Alt-Detailseite es auch schon tat.
- **Der Feldname trägt die Aussage:** `client_ip_unbestaetigt`, weil der Wert ohne
  Trusted-Proxy-Prüfung vom Client kommt (§4.5) — und er ist **gekürzt** gespeichert (letztes Oktett
  bzw. `/48`, E12 (c)). Die Ansicht schreibt beides als Spaltenüberschrift dazu — „IP (unbestätigt,
  gekürzt)" — und die Spaltenbreite rechnet mit `0` am Ende, nicht mit einer vollständigen Adresse.

### 7.9 QR

- `/api/s/<id>/qr.png` — Nutzlast `oeffentlicheUrl("verwaltung", "/s/<id>", headers)` (§3.2).
- Erzeugt über `core/qr` (`qrPng`), also mit der **einen** verbindlichen Konfiguration:
  `errorCorrectionLevel: "H"`, `margin: 4`, Schwarz auf Weiß (`core/qr/index.ts:24-28`).
- `?w=` wird geklemmt wie in `feedback/f/[slugSecret]/qr.png/route.ts:26-31` (Vorgabe 512, Obergrenze
  2048): die Route ist öffentlich und `cache-control: public` schlüsselt auf die ganze URL, ein
  ungeprüftes `?w=100000` wäre Rechenlast- **und** Cache-Verstärkung.
- **PNG-Download** im Dialog (Dateiname `<entschärfter-titel>-qr.png`). `drop` hatte das, und es darf
  nicht unbemerkt wegfallen; `easy-filesharing` hatte es nicht und bekommt es damit.
- `assertQrCapacity` **wirft** (`core/qr/index.ts:30-35`) — in einem Route Handler wäre das eine 500.
  Für Share- und Inbox-URLs ist die Grenze unerreichbar (36–42 Zeichen gegen 1273 Byte), also wird
  hier **nicht** abgefangen; der Wurf ist die richtige Antwort auf einen Programmierfehler. Wer den
  QR-Weg später für Freitext öffnet, muss ihn abfangen.
- **Neu erzeugte Codes sehen anders aus als die alten** — und das gehört in die Spec: `L`/`M` ergaben
  Version 3 mit 29×29 Modulen, `H` ergibt Version 5 mit 37×37. Bei gleicher Druckgröße wird jedes
  Modul kleiner, die Robustheit gegen Verschmutzung und Verzerrung steigt. Der **Inhalt** bleibt
  gleich, Bestandsdrucke bleiben gültig. Ob die Druckgröße der Aushänge mitwachsen muss, ist eine
  Betreiberfrage (§13).

---

## 8. Inbox-Seite (Rolle `inbox`)

### 8.1 `/u/<token>` — anonym, öffentlich, mobil

Gestaltungsklasse **öffentlich**: eigenes CSS-Modul, **kein antd**, mobile-first — die Ansicht wird
auf einem fremden Handy im Einsatz benutzt. Eingabefelder nie unter 16px, Trefferflächen 44px, Zoom
ist suiteweit gesperrt (`docs/design/README.md:158-171`).

- Der Pfad bleibt wörtlich `/u/<token>` an der **Host-Wurzel** (1:1-Pflicht — verteilte und gedruckte
  Inbox-Links).
- **Ungültiges Token → Zustandsseite am Ort, kein Redirect.** Heute antwortet `drop` mit `302` auf
  `/?error=invalid_token&token=<eingabe>`. Die 1:1-Pflicht ist die **Korrekturaufforderung** statt
  einer 401-Seite — nicht der Parameter. `files` rendert `/u/<token>` mit HTTP 200 und dem Zustand
  „Dieser Abgabelink ist nicht (mehr) gültig", plus Hinweis, sich den aktuellen Link geben zu lassen.
  Der Token-Parameter im Redirect wird **nicht** übernommen: er landet in Browser-History und Referer
  (belegter Befund), und ein gültiges Token wäre dort ein Zugangsdatum.
- **Kein Token im Log.** `drop` läuft mit `logger: true`, und die `incoming request`-Zeilen enthalten
  die vollständige URL mit Token. Die Suite loggt keine Anfrage-URLs; wo `files` selbst loggt
  (AV-Fehler, Aufräumläufe), erscheint höchstens `token_start`, nie der volle Token.
- `/u` **ohne** Token (die Inbox-Wurzel, §3.5): kurze öffentliche Seite „Abgabe nur über den Link oder
  QR-Code, den Sie erhalten haben." Kein Eingabefeld für den Token — es gäbe nichts zu prüfen, was der
  Link nicht besser prüft, und ein Eingabefeld wäre ein Rateweg.

### 8.2 Mehrfach-Upload

- Dateiauswahl mit `multiple` (kein `webkitdirectory`), Kamera-Auswahl auf dem Handy.
- **N Dateien = N Uploads, je Datei chunked** über `PUT /api/u/<token>/upload?datei=<n>&teil=<m>`,
  sequenziell. Grund für chunked auch hier: der Next-Proxy kappt bei 10 MiB **still** (§7.1), und ein
  Handyvideo überschreitet das regelmäßig. Eine 1:1-Portierung des Ein-Anfrage-Wegs von `drop`
  zerbräche ab 10 MiB ohne Fehlermeldung.
- **Damit weicht Spec 1 von einer 1:1-Pflicht ab, und die Abweichung wird hier begründet, nicht
  verschwiegen.** Die Pflichtzeile lautet: „`POST /upload`, `POST /u/<token>/upload`; Feldnamen im
  FormData `hint`, `category`, Datei unter `files`", Bruchfolge „ein bereits geladenes Formular in
  einem offenen Tab postet weiter genau dorthin" (Belege `drop/src/app.js:702-711`,
  `drop/web/src/hooks/use-upload.ts:126-128`). Was von dieser Pflicht wirklich zu erhalten ist, ergibt
  ein Blick auf die **Aufrufer**:
  - **`POST /upload` (ohne Token) ist nicht anonym erreichbar** — gemessen am Quelltext:
    `app.post('/upload', { preHandler: requireSession('api') }, uploadHandler)`
    (`drop/src/app.js:710`). Sein einziger Aufrufer ist die **Admin-SPA** von `drop`, die es nach dem
    Cutover nicht mehr gibt (der Betreiber arbeitet dann in der Suite). Kein gedruckter Code, kein
    verteilter Link, kein anonymer Nutzer hängt daran — der Pfad **darf verschwinden**, und er hat
    deshalb keine Entsprechung im Route-Baum (§2.1).
  - **`POST /u/<token>/upload` hat genau einen Aufrufer:** drops React-SPA in einem **bereits
    geöffneten** Tab (`app.js:711` mit `requireShareToken()`). Jede neue Navigation lädt nach dem
    Umschwenken die Suite-Ansicht; das Fenster ist also „Tab war beim Cutover schon offen".
  - **Verbindlich für dieses Fenster:** derselbe Route Handler nimmt zusätzlich `POST` an und antwortet
    **409** mit dem Text „Diese Seite ist veraltet — bitte neu laden und die Abgabe wiederholen."
    Nicht 405 und nicht 404 ohne Text: der Alt-Client wertet nur `uploaded.length > 0` aus und zeigt
    „Upload abgelehnt" (§8.2, 207-Absatz) — das ist die richtige Aussage für diesen Zustand, und die
    Datei ist **nicht** gespeichert, also entsteht keine Dublette. Die Feldnamen `hint`/`category`/`files`
    werden dabei **nicht** gelesen; mit dem Chunk-Format entfallen sie, und ein 409 braucht keinen Body.
  - Einstiegspunkt in der Oberfläche hat dieser POST-Zweig **keinen**, und das ist Absicht (§10.2): er
    bedient ausschließlich Alt-Clients im Cutover-Fenster. Nach dem Standby-Ende darf er entfallen —
    die Zeile dafür steht in §12.
- **JavaScript ist erforderlich, und das ist keine Regression.** `/u/:token` liefert heute schon die
  `index.html` einer React-SPA — die Inbox war **nie** ohne JS bedienbar. Die feedback-Zusage
  „ohne JS vollständig bedienbar" gilt für die dortige öffentliche Ansicht und wird hier
  **ausdrücklich nicht** ausgedehnt; das wäre neue Funktionalität und eine eigene Beauftragung.
  Ein `<noscript>`-Block nennt den Weg (Link an eine Person mit Rechner) statt einer leeren Seite.
- **Fortschritt je Datei**, Wiederholen je Datei, und eine Quittung, die **jede** Datei einzeln
  ausweist. Der 207-Multi-Status wird **nicht** übernommen: heute kann ein Upload erfolgreich sein,
  obwohl der Status nicht 200 ist, und umgekehrt kann 207 mit leerer `uploaded`-Liste kommen, während
  die Datei liegt (der `catch` meldet `store_failed`, nachdem das `rename` durch war). Der Client
  verlangt `uploaded.length > 0`, zeigt „Upload abgelehnt", der Melder lädt erneut hoch und erzeugt
  eine Dublette. In `files` ist eine Datei = eine Anfrage = ein Ergebnis, und der letzte Chunk
  antwortet erst, wenn die Zeile steht.

### 8.3 Kategorien und Hinweis

- **Kategorien aus `_lib/kategorien.ts`**, serverseitig gegen die Liste validiert. Vorbelegung
  `bilder`, `dokumente`, `sonstiges` (1:1 — sie sind heute Verzeichnisnamen **und** META-Feld). Welche
  Verzeichnisse real existieren, weiß nur der Betreiber (§13); zusätzliche Werte kommen per Import und
  die Anzeige **toleriert unbekannte Werte** (roh anzeigen), statt sie zu verwerfen.
  Heute ist die Kategorie **Freitext**: `sanitizeCategory` säubert nur zeichenweise und kürzt auf 40
  Zeichen, danach `mkdir recursive` — der Sentinel `__none__` überlebt die Säuberung unverändert. Weil
  die Kategorie hier eine **Spalte** ist, kann sie kein Verzeichnis mehr erzeugen.
- **Hinweis ≤ 500 Zeichen**, gezählt als **Code Points** (`Array.from(s).length`). Der Grund gehört
  daneben: `drop` schneidet mit `slice(0, 500)` **UTF-16-Code-Units**; 500 Umlaute sind in UTF-8 rund
  1000 Byte, 500 Emoji rund 2000. Wer 500 als **Bytegrenze** in eine Spaltenbreite oder einen Puffer
  übernimmt, rechnet um den Faktor 4 falsch (dieselbe Klasse wie der behobene Befund im `qr`-Modul).
  Hier ist es unkritisch, weil SQLite-TEXT keine Bytebreite hat — deshalb genügt die Zeichengrenze,
  und sie steht als solche im Namen der Konstante (`FILES_HINWEIS_MAX_ZEICHEN`).
- **Ein Hinweis und eine Kategorie gelten für den ganzen Vorgang** — für alle Dateien der Abgabe.
  Das ist eine bewusste Änderung: `drop` verarbeitet Multipart-Teile sequenziell und benutzt
  `hint`/`category` in dem Zustand, den sie beim Erreichen des Dateiteils haben; gemessen landet eine
  Datei im Wurzelverzeichnis **ohne** Notiz, wenn die Felder **nach** ihr kommen. Innerhalb eines
  Requests sind die Werte dort also **positionsgebunden**, nicht requestgebunden (Analyse Falle 24).
  In `files` sind sie Felder des Vorgangs, nicht Positionen im Body — und weil jede Datei eine eigene
  Anfrage ist, wird der Wert je Anfrage mitgeschickt.

### 8.4 Härtung — Rate-Limit, Budget, Schlüsselwahl

**Der Schlüssel ist das Token, nicht die IP** (Analyse E8 (d)). Warum das nicht verhandelbar ist,
belegt die eigene Suite: im Modul `feedback` hat ein einziger IP-Limiter mit 10/min den Kernfall
getötet — **15 Ehrenamtliche scannen um 21:30 aus einem Vereins-WLAN, teilen also eine NAT-IP, und ab
der 11. Abgabe kam „Zu viele Anfragen"** (`src/app/m/feedback/actions.ts:99-109`,
`docs/design/feedback-oeffentliche-ansicht.md:85`). Die Reparatur dort ist genau die Bauform, die
`files` übernimmt: der IP-Zähler zählt nur noch **Fehlversuche**, echte Vorgänge laufen über einen
eigenen, weiten Zähler mit zusammengesetztem Schlüssel.

Drei Stufen, in dieser Reihenfolge:

1. **Zugangs-Guard zuerst.** Token auflösen (`token_hash`), `revoked_at IS NULL`,
   `expires_at > now`. Ungültig → Zustandsseite / 401 und **Fehlversuchszähler** (Schlüssel = IP,
   `FILES_FEHLVERSUCHE_PRO_MIN`, Vorgabe 10). Damit ist die Reihenfolge umgekehrt zu `drop`, wo der
   `onRequest`-Hook **vor** jedem preHandler-Guard hochzählt: gemessen sperren dort fünf Uploads
   **ohne** Session (5× 401) den nächsten Upload **mit** gültiger Session — ein Fremder ohne jede
   Zugangsdaten kann das Postfach lahmlegen.
2. **Mengenbudget je Token**, in der DB, atomar:
   ```sql
   UPDATE zugangslinks
      SET verbraucht_dateien = verbraucht_dateien + 1,
          verbraucht_bytes    = verbraucht_bytes + ?
    WHERE id = ? AND verbraucht_dateien < budget_dateien
      AND verbraucht_bytes + ? <= budget_bytes
   ```
   Null Zeilen → 429 mit benanntem Grund („Kontingent dieses Abgabelinks erschöpft"). Der Zähler
   gehört in `files.db` und nicht in eine `Map` im Prozessspeicher: dort wäre er nach jedem Neustart
   weg und bei mehreren Instanzen wirkungslos.
   Gezählt wird **bei Abschluss** der Datei mit der **gemessenen** Bytezahl; der laufende Chunk-Upload
   prüft vorab gegen das Restbudget und bricht früh ab, statt Bytes zu schreiben, die nicht passen.
   **Der Wettlauf ist benannt und behandelt:** zwei gleichzeitige Abgaben können die Vorprüfung beide
   passieren, dann liefert das `UPDATE` für die zweite **null Zeilen** — obwohl ihre Bytes schon auf
   der Platte liegen. Dann werden **Blob und Zeile entfernt** (`loesche`) und es gibt ein 429 mit
   demselben benannten Grund. Ohne diesen Zweig blieben die Bytes als stiller Waise liegen, den nur
   der Bericht über verwaiste Blobs (§7.6) je gefunden hätte. Die Zusage dazu ist ein Test mit
   **echter** Parallelität, nicht ein sequenzieller (§11.1, `gleichzeitigkeit.test.ts`).

   **Das Budget ist nachträglich erhöhbar, und das ist Teil der Entscheidung, kein Komfort.** Der
   Abgabelink ist **gedruckt** (QR, PNG, Druckansicht, §8.6), und der Rohtoken existiert danach
   nirgends (§4.7). Ein mitten im Einsatz erschöpftes `budget_dateien` wäre ohne diesen Weg keine
   Grenze, sondern eine **Sackgasse**: neuer Link, neuer Ausdruck, neu verteilen — genau die Klasse,
   die §3.2 mit „Gedruckt ist gedruckt" für unverhandelbar erklärt. Deshalb gibt es
   `kontingentAufstockenAction` auf `/zugangslinks` (§8.6), analog zu „Downloads aufstocken" in §7.3:
   sie erhöht `budget_dateien`/`budget_bytes` **derselben** Zeile, der gedruckte Code bleibt gültig.
   Die **Vorbelegungen** des Anlegen-Formulars (`FILES_INBOX_BUDGET_DATEIEN`, `FILES_INBOX_BUDGET_BYTES`)
   sind damit ein Startwert und keine harte Obergrenze; ihre belastbare Größenordnung ist eine
   Betreiberfrage (§13.2, Frage 15 — Analyse Abschnitt 8, Punkt 21: „Wie viele Dateien umfasst ein
   realer Upload-Vorgang, und wie viele Melder hängen dabei an derselben Adresse?", Quelle ohne
   Rückfrage sind die Fastify-Zugriffslogs, `drop/src/app.js:436`).
3. **IP-Notbremse** in einer Größenordnung, die kein Einsatz erreicht
   (`FILES_IP_ANFRAGEN_PRO_10MIN`, Vorgabe 600) — `RateLimiter` aus `core/ratelimit`, In-Memory.
   Sie greift **nach** dem Zugangs-Guard und nach dem Budget. Der Wert ist eine Env-Variable und
   keine Konstante: er ist die Zahl, an der der `feedback`-Vorfall hing, und die Größenordnung eines
   realen Einsatzes kennt nur der Betreiber (§13.2, Frage 15). Zur Einordnung, damit die Vorbelegung
   nachvollziehbar ist statt geraten: bei 4-MiB-Chunks (§7.1) sind 600 Anfragen/10 min ≈ 2,3 GiB in
   zehn Minuten über **eine** Adresse — die 15 Melder des `feedback`-Falls hinter einer NAT-IP
   erreichen das mit Handyfotos nicht. Wer den Wert senkt, reproduziert genau jenen Ausfall.

**Was gegenüber heute sichtbar anders ist, und das ist kein Bug:** `drop`s Limit ist über einen
Query-String umgehbar (gemessen: acht `POST /u/<token>/upload` → fünf 200, drei 429; danach acht
`…?x=n` → **acht 200**), über `X-Forwarded-For` (zwölf Uploads mit rotierendem Header → zwölf 200) und
über die Fenstergrenze (2× das Limit in einem Wimpernschlag). Nichts davon wird reproduziert. Die
Suite-Fassung schlüsselt auf den **Pfad ohne Query** — genauer: sie schlüsselt gar nicht auf Pfade,
sondern der Guard sitzt im Handler.

**Trusted-Proxy-Kette, ausdrücklich:** `clientIpAus` liest `cf-connecting-ip`, sonst den **ersten**
Wert aus `x-forwarded-for` (`core/ratelimit`, gehoben aus `feedback/actions.ts:538-544`). Vor der
Suite stehen Cloudflare und Traefik; `cf-connecting-ip` wird von Cloudflare gesetzt und überschrieben.
Wer den Container direkt erreicht, kann den Wert fälschen. Deshalb: die IP ist **Notbremse**, niemals
Primärschlüssel, und in der Datenbank heißt sie `client_ip_unbestaetigt`. Das ist die einzige ehrliche
Aussage, die ohne eine gemessene Proxy-Kette möglich ist (§13).

### 8.5 MIME-Prüfung und was das für die Auslieferung heißt

Analyse E9: **(b) und (c) zusammen** — Inhaltsprüfung **und** Entkopplung von Name und Auslieferung.

- **Magic-Byte-Prüfung der geschriebenen Zwischendatei** in `_lib/mime.ts`: eine eigene Tabelle für
  die Allowlist-Typen (JPEG, PNG, GIF, WebP, HEIC/HEIF, PDF, ZIP-basierte Office-Formate, `text/plain`
  mit UTF-8-Gültigkeitsprüfung). Keine neue Abhängigkeit: die Allowlist ist kurz, und eine Tabelle,
  die wir besitzen, ist ehrlich darüber, dass sie bei jedem neuen Containerformat nachzieht — was die
  Analyse ausdrücklich als Preis der Inhaltsprüfung benennt.
- **Abgleich in drei Richtungen**: festgestellter Typ ↔ Deklaration ↔ Endung. Weicht die Feststellung
  von der Allowlist ab → **Ablehnung**, Zwischendatei gelöscht. Der festgestellte Typ (nicht die
  Deklaration) landet in `mime_type`.
- Warum das nötig ist: heute wird ausschließlich der vom Client deklarierte Content-Type geprüft; und
  ein Multipart-Teil **ohne** Content-Type-Header rutscht über den busboy-Default `text/plain` durch,
  sofern `text/plain` in der Allowlist steht. Gemessen: HTML-Inhalt in `evil.html`, deklariert als
  `image/png`, bei `allowedMime=['image/png']` → 200, gespeichert als `evil.html`. Heute ist das
  ungefährlich, weil `drop` nichts ausliefert — **im Modul `files` mit Preview und Download wird daraus
  gespeicherter XSS auf einer Domain im Cookie-Scope der ganzen Suite.**
- **Entkopplung von Name und Auslieferung** ist bereits durch das Pfadschema erledigt: die Datei liegt
  unter einer ID, der Anzeigename steht nur in der DB, und ausgeliefert wird immer `attachment` +
  `nosniff` (§7.7). Damit hält die Maßnahme auch bei einer **Fehlklassifikation** — und genau deshalb
  ist sie die zweite Linie und nicht die erste.
- **Die wirklich eingesetzte `ALLOWED_MIME` des Servers muss gelesen werden, bevor die Allowlist
  geschrieben wird** (§13). Die Vorbelegung im Repo ist nur eine Vorlage; ein zu enger Wert lehnt
  Handyfotos ab (HEIC), ein zu weiter öffnet den Ausliefer-Weg.

### 8.6 Posteingang-Ansicht und Abgabelinks

**Posteingang (`/posteingang`, Rolle `verwaltung`)** — Neubau, keine Portierung: `drop` hat **keinen**
Endpunkt, der Uploads listet oder ausliefert (`fastifyStatic` wurzelt auf `web/dist`, nicht auf dem
Upload-Verzeichnis). Betreiberentscheidung E14 (a): **keine Sidecar-`.txt`, keine META-JSON, kein
SSH-Abholweg mehr.**

Spalten: Zeit (`empfangen_at`), Dateiname, Größe, Kategorie, Hinweis, AV-Status, Abgabelink
(`token_start` + Name, oder „Altbestand"), Aktionen (Download, Löschen).

- Filter: Kategorie, AV-Status, Zeitraum, Abgabelink. Vorgabesortierung: neueste zuerst.
- **Download** über `/api/inbox/<id>` — `requireFilesAccess()`, `istFreigegeben` erzwungen,
  `attachment` + `nosniff` + `filename*`, `Content-Type` aus `mime_type`, und **wenn `mime_type` NULL
  ist** (Altbestand) `application/octet-stream`. Kein Rateweg über die ID: sie ist `nanoid(10)`, und
  die Route ist gegatet.
- **Löschen** entfernt Zeile **und** Bytes, mit Bestätigung und Angabe der Größe. Das ist eine
  fachliche Zusage, die `drop` nicht hatte, und sie ist der Grund, warum die Sidecar entfallen darf.
- Mehrfachauswahl: „ausgewählte herunterladen" (als ZIP, mit derselben Ausschlussregel wie §7.7) und
  „ausgewählte löschen".
- Tabelle: `scroll={{ x: "max-content" }}`, Kartenliste unter 768px — dieselben Regeln wie §7.3.
  `size="small"` ist **innerhalb** von Tabellenzeilen erlaubt und hier nötig, weil eine
  56px-Zeilenaktion die Zeile sprengt (`docs/design/README.md:59-62`).

**Abgabelinks (`/zugangslinks`, Rolle `verwaltung`)** — Liste mit Name, `token_start…`, Laufzeit,
Restbudget, Zustand (gültig / abgelaufen / widerrufen), Uploads-Zähler; Aktionen: anlegen,
**Kontingent aufstocken**, widerrufen.

- **Kontingent aufstocken** (`kontingentAufstockenAction`) erhöht `budget_dateien` und/oder
  `budget_bytes` derselben Zeile. Der gedruckte Code bleibt gültig — das ist der ganze Zweck (§8.4).
  Die Aktion ist auf gültige, nicht widerrufene Links beschränkt und im Restbudget-Feld der Zeile
  erreichbar, damit sie dort steht, wo der Zustand ablesbar ist.

- **Anlegen** fragt: Name, Laufzeit in **ganzen Stunden** 1–72, Budget (Dateien, Bytes). Die 72
  Stunden sind 1:1 aus dem Alt-System, wo die Grenze an zwei unabhängigen Stellen korrekt erzwungen
  wird; sie zu erhöhen ist eine Betreiberentscheidung (§13), nicht eine Nebenwirkung des Ports.
- Nach dem Anlegen: **einmalige** Ausgabe — voller Token, Link, QR (aus
  `oeffentlicheUrl("inbox", "/u/<token>", headers)`), PNG-Download, Druckansicht. Danach ist der
  Rohtoken weg (§4.7).
- **Wenn die Rolle `inbox` keinen Host hat** (vor dem zweiten Cutover, `hostFuerRolle` liefert
  `null`), zeigt die Seite einen benannten Zustand: „Die Abgabe-Domain ist noch nicht auf die Suite
  umgestellt — Abgabelinks können erst danach ausgegeben werden", und der Anlegen-Knopf ist
  deaktiviert. **Kein** QR mit einem geratenen Host, kein Link ins Leere. Das ist der Zustand, der
  ohne §3.2 unbemerkt Altpapier produziert hätte.
- **Widerrufen** setzt `revoked_at`, löscht die Zeile **nicht**. `drop` löscht die Zeile — es gibt
  dort keine Historie zum Importieren, obwohl die Plugin-Spalte `enabled` existiert und beim Verify
  geprüft wird. Mit `revoked_at` bleibt nachvollziehbar, welcher Link wann abgeschaltet wurde, und die
  Uploads behalten ihren `token_id`-Bezug.

### 8.7 QR für die Inbox

`/api/u/<token>/qr.png` — dieselben Regeln wie §7.9, Nutzlast aus der Rolle `inbox`.
Der Endpunkt ist **gegatet** (`requireFilesAccess`), weil er nur in der Verwaltung gebraucht wird und
sonst ein Orakel wäre („existiert dieses Token?"). Die Alt-Entsprechung
(`POST /api/admin/qrcode`, `MAX_QR_DATA_LENGTH = 2048`, 400 bei Überlänge) hat **keine 1:1-Pflicht**
— an ihr hängt kein gedruckter Code und kein verteilter Link, der Pfad darf verschwinden. Erhalten
bleiben muss der **PNG-Download**, weil er der dokumentierte Zweck war.

---

## 9. Grenzen und Zahlen

### 9.1 Vier Größen, vier Orte, drei Einheiten — und wie Spec 1 die dritte auflöst (Analyse Falle 22)

| Größe | Wert | Einheit | Ort | Wer setzt ihn |
|---|---|---|---|---|
| `MAX_FILE_SIZE` (easy-filesharing) | 524.288.000 | Byte (= 500 **MiB**, kommentiert als „500 MB") | Alt-`.env` | — (Bestand) |
| `MAX_FILE_SIZE_MB` (drop) | 500 | **MB** | Alt-`.env` | — (Bestand) |
| clamd-Dateigrenze, **Image-Default** | 104.857.600 | Byte (= 100 **MiB**) | im Image, gemessen | — (Bestand des Images) |
| clamd-Dateigrenze, **wie Spec 1 sie setzt** | `= FILES_AV_MAX_BYTES` | Byte | `clamd.files.conf` | Spec 1, aus **einer** Quelle (§6.5) |
| Cloudflare Free | 100.000.000 | Byte (= 100 **MB**) | Plan-Eigenschaft der Zone | — (nicht im Repo) |

**Beide „500" unterscheiden sich um den Faktor 1,048576; beide „100" um 4.857.600 Byte.** Ein Upload
zwischen 100 MB und 100 MiB passiert Cloudflare **nicht**, wäre für clamd aber noch scanbar — wer die
Grenzen gleichsetzt, sucht den Fehler in der falschen Schicht. Und heute erzwingen beide Alt-Apps
gemessen **exakt dieselbe** Grenze (`500 * 1024 * 1024 === 524288000`), was die Kollision unsichtbar
macht: überlebt der drop-Name mit dem Fileshare-Wert, ist die Grenze 524.288.000 MB, also praktisch
aufgehoben; überlebt der Fileshare-Name mit dem drop-Wert, ist sie 500 **Byte** und jeder Upload wird
abgelehnt. Beide Werte sind `number`, beide Zuweisungen typkorrekt — Build, Typecheck und Vitest
können den Unterschied nicht sehen.

**Deshalb: die Einheit steht im NAMEN, nicht in einem Kommentar** (Analyse E19). Und es gibt genau
**einen** Namen je Größe.

**Die dritte Zeile ist keine Messung mehr, sondern eine Setzung** — das ist der Unterschied zur
Analyse-Fassung: dort ist die clamd-Kappe „im Sidecar, gemessen" und damit eine vierte unabhängige
Zahl, die zur Kette aus §6.6 passen **muss**. Spec 1 dreht das um: `clamd.files.conf` bekommt
`FILES_AV_MAX_BYTES` (§6.5), also gibt es **eine** Quelle und keine Unterstellung. Der Image-Default
(100 MiB) steht in der Tabelle, weil er beschreibt, was **ohne** diese Datei gilt — und weil genau
dort der Fall liegt, den §6.6 ausschreibt: die real gesetzte Annahmegrenze beider Alt-Apps ist 500
MiB, also **fünffach** über dem Default. Wer die Datei vergisst, bekommt keinen Fehler, sondern ein
stilles `OK` per Pfad (§6.5).

### 9.2 Die drei Kappungsebenen und ihre drei verschiedenen Symptome

| Ebene | Grenze | Symptom | Wo sichtbar |
|---|---|---|---|
| 1. Cloudflare | 100 MB pro Request-Body (Plan-Eigenschaft) | **413 vom Edge**, die Anfrage erreicht den Container nie | im Browser des Nutzers; **kein** Logeintrag der Suite |
| 2. Next-Proxy | `proxyClientMaxBodySize`, Default 10 MiB | **stille Kappung**: `cloneBodyStream` bricht ab, schiebt `null` in beide Streams, gibt nur ein `console.warn` aus | Container-Log, und dort auch nur als Warnung |
| 3. Anwendung | `FILES_MAX_DATEI_BYTES` beim **Zählen** | benannter Fehler mit Grenze und Einheit, Zwischendatei gelöscht | am Upload-Eintrag der Oberfläche |
| (4.) clamd | `FILES_AV_MAX_BYTES` / clamd-Kappe | **AV-Fehler**, nicht „Datei zu groß"; per Pfad ohne `AlertExceedsMax` ein stilles `OK` | AV-Status der Datei |

**Die kleinste der Grenzen bestimmt, was der Nutzer erlebt.** Der chunked Weg (§7.1, §8.2) nimmt Ebene
1 und 2 aus dem Spiel: jeder Chunk ist 4 MiB und damit eine eigene, kleine Anfrage. Damit ist
Ebene 3 die **einzige** wirksame Grenze — und das ist der Punkt der Entscheidung.

### 9.3 Alle Namen mit Einheit

In **einer** Datei, `_lib/grenzen.ts`, ohne `"use client"` (Falle 6):

| Name | Einheit im Namen | Quelle | Vorbelegung |
|---|---|---|---|
| `FILES_MAX_DATEI_BYTES` | Bytes | Env, **Pflicht** | **keine** — fehlt sie, bricht der Boot ab |
| `FILES_AV_MAX_BYTES` | Bytes | Env, **Pflicht** | **keine** — Vorbelegung `FILES_MAX_DATEI_BYTES` wäre möglich, ist aber falsch: dieselbe Zahl an zwei Bedeutungen (Annahme- und Scangrenze) macht die Kette aus §6.6 zur Tautologie und verdeckt genau die Kollision aus §9.1. Sie ist **Frage 1** in §13.1, gemeinsam mit `MAX_FILE_SIZE`, und sie setzt zugleich `MaxFileSize`/`StreamMaxLength` in `clamd.files.conf` (§6.5) |
| `FILES_CHUNK_BYTES` | Bytes | Konstante | 4 MiB (`4 * 1024 * 1024`) |
| `FILES_MAX_DATEIEN_PRO_SHARE` | Anzahl | Env | 200 — Obergrenze gegen unbegrenztes Zeilenanlegen (§7.1), **keine** Portierungsaussage: die Alt-App hatte keine Grenze, `drop` 25 je Anfrage. 200 liegt über jedem beobachteten Vorgang und ist per Env anhebbar |
| `FILES_VORSCHAU_MAX_BYTES` | Bytes | Env | 5 MiB — gilt für **alle** Vorschauen (§7.7) |
| `FILES_HINWEIS_MAX_ZEICHEN` | Zeichen (Code Points) | Konstante | 500 |
| `FILES_MAX_ABLAUF_TAGE` | Tage | Env, **Pflicht** | **keine** (Serverwert unbekannt) |
| `FILES_LOESCH_KARENZ_STUNDEN` | Stunden | Env | 24 |
| `FILES_UPLOAD_VERFALL_STUNDEN` | Stunden | Env | 24 |
| `FILES_LOG_AUFBEWAHRUNG_TAGE` | Tage | Env | 90 |
| `FILES_INBOX_AUFBEWAHRUNG_TAGE` | Tage | Env | **keine** = keine Frist (heutiges Verhalten) |
| `FILES_INBOX_BUDGET_DATEIEN` | Anzahl | Env | 100 — **Startwert** des Anlegen-Formulars, nachträglich erhöhbar (§8.4); Größenordnung ist §13.2/Frage 15 |
| `FILES_INBOX_BUDGET_BYTES` | Bytes | Env | 2 GiB — dito |
| `FILES_FEHLVERSUCHE_PRO_MIN` | Anzahl/Minute | Konstante | 10 |
| `FILES_IP_ANFRAGEN_PRO_10MIN` | Anzahl/10 min | Env | 600 — Notbremse, §8.4 Punkt 3; §13.2/Frage 15 |
| `FILES_AV_HOST` | Hostname | Env | `clamav` (§6.8) |
| `FILES_AV_PORT` | Port | Env | 3310 (§6.8) |
| `FILES_AV_TIMEOUT_MS` | Millisekunden | Env | 60 000 |
| `FILES_AV_VERSUCHE` | Anzahl | Env | 5 |
| `FILES_AV_WIEDERHOLUNG_SEKUNDEN` | Sekunden | Env | 60 — Abstand zwischen zwei Versuchen; 5 × 60 s überspannt das clamd-Startfenster (§6.4) |
| `FILES_AV_PARALLEL` | Anzahl | Env | 2 |
| `FILES_AUFRAEUMEN_TAKT_MINUTEN` | Minuten | Env | 60 |
| `FILES_AUFRAEUMEN_TROCKENLAUF` | Schalter | Env | aus |

**Drei Pflichtvariablen ohne Vorbelegung** — `FILES_MAX_DATEI_BYTES`, `FILES_AV_MAX_BYTES`,
`FILES_MAX_ABLAUF_TAGE`. Das ist die zentrale Vorsichtsmaßnahme gegen Falle 22:
eine erfundene Vorbelegung wäre genau der Kommentar „`# 500 MB`" neben einem MiB-Wert, der schon
heute dort steht, wo ein Portierer nachliest. Fehlt eine, bricht der Boot mit einer Meldung ab, die
den Namen **und die Einheit** nennt.

**Die Dev- und E2E-Werte stehen als Zahlen da, nicht als „klein".** „Klein" ist hier unerfüllbar: die
Boot-Prüfungen 2 und 3 (§9.4) verlangen `FILES_CHUNK_BYTES < FILES_MAX_DATEI_BYTES ≤ FILES_AV_MAX_BYTES`,
und `FILES_CHUNK_BYTES` ist eine **4-MiB-Konstante** — jeder Wert unter 4 MiB bricht den Boot des
E2E-Servers ab, bevor ein Test läuft. Dazu verlangt §11.5 eine Datei **über 10 MiB**. Verbindlich in
`.env.example` (Dev) und `playwright.config.ts` `webServer.env` (E2E):

| Variable | Wert | Rechnung |
|---|---|---|
| `FILES_MAX_DATEI_BYTES` | `12582912` (12 MiB) | > 4 MiB Chunk (Prüfung 2) **und** > 10 MiB für den Proxy-Kappen-Test |
| `FILES_AV_MAX_BYTES` | `12582912` (12 MiB) | `= FILES_MAX_DATEI_BYTES` (Prüfung 3 erfüllt, Gleichheit erlaubt) |
| `FILES_MAX_ABLAUF_TAGE` | `7` | ≥ 1 (Prüfung 4) |
| `FILES_AV_HOST` / `FILES_AV_PORT` | `127.0.0.1` / `3310` | der Fake-clamd aus §6.8 |
| `FILES_AV_TIMEOUT_MS` | `2000` | |
| `FILES_AV_VERSUCHE` | `2` | |
| `FILES_AV_WIEDERHOLUNG_SEKUNDEN` | `1` | |
| `FILES_AV_PARALLEL` | `1` | ein Arbeiter, damit die Reihenfolge im Test bestimmt ist |
| `FILES_LOESCH_KARENZ_STUNDEN` | `0` | ein Test, der Ablauf und Löschung prüft, wartet sonst 24 h |
| `FILES_AUFRAEUMEN_TAKT_MINUTEN` | `60` | der Test löst den Lauf über den Knopf aus, nicht über den Takt |

**Die AV-Vorgaben der Produktion sprengen das Testbudget, deshalb die vier kleinen Zahlen:**
`FILES_AV_TIMEOUT_MS` 60 000 × `FILES_AV_VERSUCHE` 5 wären fünf Minuten gegen `timeout: 90_000`
(`playwright.config.ts:32`) — die Zusage „fail-closed ist erreichbar" liefe in einen
Playwright-Timeout, sobald der Fake-Scanner **hängt** statt abzulehnen. Mit 2 × 2 000 ms + 1 s Abstand
ist derselbe Weg in ≈ 5 s durchlaufen und passt mit Aufbau und Navigation bequem in 90 s.

**Pflicht nur, wenn das Modul erreichbar ist — und das ist keine Milderung, sondern eine
Notwendigkeit.** `assertHostConfig()` läuft aus `instrumentation.ts:11` für die **ganze** Suite, vor
den Migrationen aller Module. Eine unbedingte Pflicht hieße: sobald ein Image mit `files` auf dem
Server landet, startet die Suite nicht mehr — `portal`, `qr` und `feedback` inklusive —, bis der
Betreiber die `.env` ergänzt hat. Damit blockierte das Modul jeden unbeteiligten Deploy im Fenster
zwischen Merge und Cutover, und §1.2 („Spec 1 baut nichts, was Produktionsdaten braucht") wäre
gebrochen.

Die Bedingung ist deshalb:

```ts
// _lib/grenzen.ts — geprüft nur, wenn das Modul überhaupt eine Domain hat.
const erreichbar = prodHostsFor(getModule("files")).length > 0;
```

Null Hosts = vor dem Cutover = keine Zahlen nötig (und keine Anfrage, die eine bräuchte, weil kein
Host auf das Modul zeigt). Damit schaltet **dieselbe** Variable, die das Modul einschaltet, auch
seine Zahlenpflicht ein — die Regel dokumentiert sich selbst, und es gibt keinen zweiten Schalter,
den jemand vergessen kann. In Dev und E2E ist `SUITE_HOST_FILES` gesetzt (§3.4), die Prüfung greift
dort also von Anfang an.

### 9.4 Boot-Prüfungen

In derselben Kette wie `assertHostConfig()` (`core/bootstrap.ts:29-35`, aufgerufen aus
`instrumentation.ts:11` vor den Migrationen). **Die Prüfungen 1–4 und 6 greifen nur, wenn
`prodHostsFor(getModule("files")).length > 0`** (§9.3) — sonst nähme ein Modul, das niemand erreichen
kann, die anderen drei mit. Prüfung 5 greift **immer**: sie liest nur die Konfiguration, hat keine
Nebenwirkung und ist genau dann nützlich, wenn jemand die Hostliste gerade ändert:

1. Alle Pflichtvariablen gesetzt und ganzzahlig positiv.
2. `FILES_CHUNK_BYTES < FILES_MAX_DATEI_BYTES`.
3. `FILES_MAX_DATEI_BYTES ≤ FILES_AV_MAX_BYTES`.
4. `FILES_LOESCH_KARENZ_STUNDEN ≥ 0`, `FILES_MAX_ABLAUF_TAGE ≥ 1`,
   `FILES_MAX_DATEIEN_PRO_SHARE ≥ 1`, `FILES_AV_VERSUCHE ≥ 1`,
   `FILES_AV_WIEDERHOLUNG_SEKUNDEN ≥ 0`.
5. `validateFilesHosts` (§3.3).
6. `<DATA_DIR>/files` anlegbar und beschreibbar (§5.6).

**Was der Boot nicht prüfen kann:** die **wirksame** clamd-Kappe (Spec 1 *setzt* sie aus
`FILES_AV_MAX_BYTES`, §6.5 — ob der Sidecar die Datei auch geladen hat, sagt nur `clamconf -n`), die
Cloudflare-Grenze (Plan-Eigenschaft, nirgends im Repo) und den konfigurierten Wert von
`proxyClientMaxBodySize`. Alle drei sind Runbook-Schritte mit benanntem Prüfweg (§11.7).

---

## 10. Fehlerbehandlung und Zustände

### 10.1 Zustandsmatrix je Ansicht

| Ansicht | Leer | Warten | Fehler | Verweigert |
|---|---|---|---|---|
| `/` (Rolle `verwaltung`) — Freigaben | „Noch keine Freigabe angelegt" + Knopf „Freigabe anlegen" | Skeleton der Tabelle | Alert `type="warning"` + Wiederholen; **kein** `type="error"` auf einer Datenfläche | kein Zugang → `notFound()` (Backstop) — gerufen **im Verteiler** `page.tsx`, nicht im Group-Layout, weil die Wurzelseite außerhalb der Route-Group liegt (§3.5) |
| `/shares/neu` | — | Fortschritt je Datei | Feldfehler am Feld (`useActionState`); Byte-Fehler am Datei-Eintrag mit Wiederholen | wie oben |
| `/shares/[id]` | Share ohne Dateien → „Keine Datei vollständig übertragen" + Löschen/Erneut hochladen | Dateien mit `scanning` als eigener Zeilenzustand | Blob fehlt → Zeile trägt „Datei nicht auffindbar" statt einer Größe | `notFound()` bei unbekannter ID |
| `/posteingang` | „Noch keine Abgabe eingegangen" + Verweis auf Abgabelinks | `scanning`-Zeilen mit Uhr-Symbol **und** Text | AV `error` → „Prüfung nicht möglich" + Wiederholen | wie oben |
| `/zugangslinks` | „Kein Abgabelink vorhanden" + Anlegen | — | — | Rolle `inbox` ohne Host → benannter Zustand, Anlegen deaktiviert (§8.6) |
| `/s/<id>` (öffentlich) | alle Dateien unvollständig → „Diese Freigabe enthält noch keine übertragene Datei" | **je Zeile** „wird geprüft"; freigegebene Zeilen sind sofort ladbar | „Diese Datei ist nicht auffindbar. Bitte wenden Sie sich an die Person, die Ihnen den Link gegeben hat." | Passwort: nur die Maske, **kein** Inhalt im Markup |
| `/s/<id>` — `<meta refresh>` | — | steht im Markup **genau dann**, wenn mindestens eine Datei `scanning` ist (§7.4) | `error`/`infected` sind **Endzustände ohne Refresh** — sonst lädt die Seite für immer alle 5 s nach | — |
| `/s/<id>` — ganzseitiges Warten | — | nur wenn **keine** Datei freigegeben **und** mindestens eine `scanning` ist | — | — |
| `/s/<id>` abgelaufen / erschöpft | — | — | 200 + „Dieser Link ist abgelaufen" bzw. „Die zulässige Zahl an Downloads ist erreicht" (Limit **lesend** ermittelt, §7.4) | — |
| `/u/<token>` (öffentlich) | — | Fortschritt + Quittung je Datei | je Datei benannt (zu groß / Typ nicht erlaubt / Kontingent erschöpft / Netzfehler) | ungültiges/abgelaufenes/widerrufenes Token → 200 + Korrekturaufforderung |
| `/u` (Inbox-Wurzel) | statische Hinweisseite | — | — | — |
| falscher Host für den Pfad | — | — | — | `notFound()` (§3.2) |

Zusätzlich, aus `docs/design/README.md:53-57`: **`colorError === colorPrimary === #c8000f`.** Ein
`Alert type="error"` sieht wie eine Primäraktion aus. Warnungen sind `type="warning"` oder Text plus
3px linke Kante; und weil im Modul `files` **Rot keine fachliche Bedeutung** trägt, ist die Regel hier
milder als in `feedback` — aber ein roter `Tag` für „infiziert" bleibt verboten, weil er auf einer
Datenfläche steht. AV-Zustände tragen **Text plus Symbol**, nie Farbe allein
(`docs/design/README.md:133-137`).

### 10.2 Die Prüffragen aus `docs/design/README.md:236-249`

**Hat jede Action einen Weg in der Oberfläche?**

| Action / Route | Einstiegspunkt |
|---|---|
| `anlegenAction` | `/shares/neu`, Knopf „Freigabe anlegen" auf `/` |
| `PUT /api/upload/<fileId>` | Upload-Insel auf `/shares/neu` |
| `bearbeitenAction` | Knopf „Bearbeiten" in Tabelle und Detailseite |
| `downloadsAufstockenAction` | Knopf auf der Detailseite (sichtbar, wenn `max_downloads` gesetzt) |
| `shareLoeschenAction` | Knopf in Tabelle und Detailseite, mit Bestätigung |
| `POST /api/s/<id>/verify` | Passwortmaske auf `/s/<id>` |
| `GET /api/download/…`, `…/zip`, `…/preview` | Links/Knöpfe auf `/s/<id>` |
| `GET /api/s/<id>/qr.png` | QR-Dialog auf Tabelle und Detailseite |
| `zugangslinkAnlegenAction` | `/zugangslinks`, Knopf „Abgabelink anlegen" |
| `kontingentAufstockenAction` | Zeilenaktion am Restbudget-Feld auf `/zugangslinks` (§8.4, §8.6) |
| `zugangslinkWiderrufenAction` | Zeilenaktion auf `/zugangslinks` |
| `GET /api/u/<token>/qr.png` | Ausgabe-Dialog nach dem Anlegen + Druckansicht |
| `PUT /api/u/<token>/upload` | Abgabeformular auf `/u/<token>` |
| `POST /api/u/<token>/upload` (Altweg) | **keiner, und das ist Absicht** — er antwortet ausschließlich Alt-Clients im Cutover-Fenster mit 409 „bitte neu laden" (§8.2). Ein Einstiegspunkt in der Suite-Oberfläche wäre ein Weg in einen Zustand, den niemand braucht |
| `inboxLoeschenAction` | Zeilenaktion + Mehrfachauswahl auf `/posteingang` |
| `GET /api/inbox/<id>` | Zeilenaktion „Herunterladen" auf `/posteingang` |
| `avWiederholenAction` | Knopf an jeder Zeile mit `av_status = 'error'` (Detailseite und Posteingang) |
| `aufraeumenAction` (manuell) | Knopf in der Ablage-Kachel, mit Trockenlauf-Vorschau |

Der Anlass für diese Tabelle ist die Fehleranalyse des `feedback`-Ports: das Modul war nicht schlecht
gestaltet, es war **unfertig** — sechs von acht Server-Actions und drei Seiten hatten keinen
Einstiegspunkt. Die Tabelle wird beim Bau abgehakt, nicht danach behauptet.

**Führt kein Einstiegspunkt dorthin, wo die aufrufende Person nicht hindarf?**

- Es gibt **eine** Zugriffsstufe, also kein Eintrag, der für eine Teilmenge in einen `notFound()`
  führt (§2.7). `feedback` brauchte dafür das doppelte Prädikat auf demselben Viewer — hier gibt es
  kein zweites.
- Die **Rollentrennung** ist die einzige Stelle, an der ein Weg in ein `notFound()` laufen könnte:
  ein Link von der Verwaltung auf `/u/<token>` würde auf dem Verwaltungs-Host 404 liefern. Deshalb
  sind **alle** Links auf Inbox-Pfade absolut und aus `oeffentlicheUrl("inbox", …)` gebaut — nie
  relativ. Und wenn die Rolle keinen Host hat, gibt es keinen Link, sondern den benannten Zustand
  (§8.6). Ein E2E-Test prüft, dass keine Verwaltungsseite einen relativen `/u/`-Link enthält (§11.5).
- Umgekehrt: die öffentlichen Ansichten verlinken **nie** in die Verwaltung.

**Ist der Zustand ablesbar, ohne zu klicken?** Jede Liste zeigt Status, Menge und Datum — nicht nur
einen Link. AV-Zustand und Ablauf stehen in der Zeile.

**Führt jede Seite zurück?** Die Verwaltungsseiten tragen die Modulnavigation (§2.7) und einen
klickbaren Modultitel; Detail- und Bearbeiten-Seiten zusätzlich einen Zurück-Weg zur Liste. Die
öffentlichen Ansichten sind bewusst Sackgassen — sie haben kein Zurück, weil es dort kein „hinter"
gibt.

**Kommen Fehler aus Server Actions am Feld an?** Ja, über `useActionState`; die 404-Seite der Suite
ist `src/app/not-found.tsx` und ersetzt alle Modul-Layouts.

---

## 11. Testaufbau — wer welche Aussage besitzt

### 11.1 Unit (Vitest), reine Funktionen

| Datei | Besitzt die Aussage |
|---|---|
| `_lib/grenzen.test.ts` | jede Pflichtvariable fehlt → Fehler nennt Name **und** Einheit; Ketten-Prüfungen (§9.4) greifen in beide Richtungen |
| `_lib/hostRolle.test.ts` | Host → Rolle für beide Hosts, Port und Großschreibung normalisiert; unbekannter Host wirft; `rolleOderNull` wirft **nicht** und liefert `null`; `requireRolle` lässt die passende Rolle durch und wirft bei der anderen; 0/1/2-gleich/3 Hosts → die vier Urteile aus §3.3; **„Host aus der Rolle, Port aus dem Request"** — `oeffentlicheUrl` nimmt den Host aus der **Rolle**, Protokoll aus `x-forwarded-proto` und den **Port** aus dem Request-Host, wenn er einen trägt (§3.2) |
| `_lib/access.test.ts` | Eingeloggter **ohne** Gruppe → `notFound()`; Suite-Admin **ohne** `files`-Gruppe → `notFound()` (die Betreiberentscheidung, §2.4); Mitglied einer Gruppe aus `adminGroupsFor` **oder** `requiredGroupsFor` → Zugang; **leere Listen gewähren nichts** (die Verknüpfung aus §2.4, nicht die aus `canAccess`); keine Session → `redirect` auf `/login` mit `callbackUrl` auf den **Verwaltungs**-Host |
| `_lib/ip.test.ts` | IPv4 → letztes Oktett `0`; IPv6 → `/48`-Präfix; unparsbar → `null`, **nicht** der Rohwert; die Funktion ist idempotent (eine bereits gekürzte Adresse bleibt gleich) |
| `_lib/storage.test.ts` | Pfad entsteht nur aus IDs; jede ID, die nicht `[A-Za-z0-9_-]{10}` ist, wirft (inkl. `..`, `/`, leer, 11 Zeichen, NUL); `schreibeStrom` bricht bei `maxBytes` ab und lässt **keine** Datei zurück; `lieseStrom` auf Fehlendes → `BlobFehlt`; `loesche` auf Fehlendes ist still. **Dazu die drei Zusagen des chunked Wegs** (§5.3): der **zweite** Chunk findet die Zwischendatei und hängt an; der Fortschritt ist ihre **Länge**; ein zweiter Schreibvorgang mit `anhaengen: false` auf dasselbe Ziel bekommt `EEXIST` statt verschränkter Bytes |
| `_lib/av.test.ts` | Antwortauswertung: `stream: OK` → clean; `<pfad>: OK` → clean; `… FOUND` → infected samt Signatur; **`stream: … ERROR` → error**; `INSTREAM size limit exceeded. ERROR` → error; leere Antwort → error; `istFreigegeben` gibt nur bei `clean` frei |
| `_lib/mime.test.ts` | HTML-Inhalt als `image/png` deklariert → Ablehnung; Multipart-Teil ohne Content-Type → Ablehnung, nicht `text/plain`; jedes Allowlist-Format mit echten Magic Bytes |
| `_lib/token.test.ts` | Grammatik `dz-` + 3×4 aus dem 32er-Alphabet; `0`/`1`/`l`/`o` werden abgelehnt; Hash = `base64url_ohne_padding(SHA-256(utf8(voller Token)))`; Normalisierung akzeptiert Groß-/Kleinschreibung und fehlende Bindestriche, aber **kein** fremdes Zeichen |
| `_lib/passwort.test.ts` | Cookie-Signatur: fremder shareId, abgelaufenes `gueltigBis`, manipuliertes HMAC → alle ungültig; Domänentrennung — ein Wert aus einem anderen Präfix gilt nicht |
| `_lib/aufraeumen.test.ts` | jede Regel aus §7.6 als reine Funktion, inkl. „ausgeschöpfter, nicht abgelaufener Share wird **nicht** gelöscht" (der Alt-Defekt) und „verwaiste Blobs werden berichtet, nicht gelöscht" |
| `_lib/zip.test.ts` | Titel-Entschärfung 1:1; gleichnamige Dateien bekommen Zählsuffix; nicht freigegebene Dateien fehlen und stehen im `_HINWEIS.txt` |
| `_lib/kategorien.test.ts` | unbekannter Wert wird beim Schreiben abgelehnt, beim **Anzeigen** toleriert |
| `_db/migrations.test.ts` | echter Migrationslauf: **alle sechs Tabellen** aus §4 (inkl. `aufraeum_laeufe`, §4.8), Spalten, Typen, `CHECK` mit allen fünf AV-Werten, alle Indizes aus §4.9, **und** dass ein geschriebenes Datum als zehnstellige **Sekunden**-Zahl in der Spalte steht (nicht Millisekunden) |
| `_db/gleichzeitigkeit.test.ts` | **N gleichzeitige** Anfragen gegen einen Share mit `max_downloads = 1` erhöhen `download_count` auf genau 1: **eine** Anfrage bekommt Bytes, N−1 bekommen 410 (gezählt wird die Rückgabe des `UPDATE`, §7.5). Dieselbe Zusage für das Mengenbudget aus §8.4: N gleichzeitige Abgaben gegen `budget_dateien = 1` → **eine** 200, N−1 mal 429, `verbraucht_dateien = 1`. Gegen eine **echte** better-sqlite3-Verbindung, nicht gegen ein Mock — Analyse Falle 25: „sequenzielle Tests sind immer grün, und die atomare SQL-Variante daneben lässt den JS-Teil unverdächtig aussehen" |

### 11.2 Alt-Defekt → der Test, der ihn fängt

Die Spec sagt an vielen Stellen „wird **nicht** mitportiert". Ohne diese Tabelle ist das eine
Absichtserklärung: die Mutationsprobe (die Zusage im Code wieder umdrehen) bliebe grün. Je Zeile steht
die **Ebene** daneben, weil sie über den Wert der Zusage entscheidet.

| Alt-Defekt / Zusage | Mutation, die grün bliebe | Test | Ebene |
|---|---|---|---|
| Download-Limit ist eine Obergrenze (§7.5) | `download_count < max_downloads` zu `<=` kippen, oder das atomare `UPDATE` durch Lesen+Schreiben ersetzen | drei Downloads bei `max_downloads = 2` → 200, 200, 410; und N gleichzeitige bei `max_downloads = 1` → genau eine 200 | `_db/gleichzeitigkeit.test.ts` + reine Funktion über In-Memory-DB |
| `maxDownloads ?? null` statt `\|\| null` (§4.1) | `??` zu `\|\|` | Eingabe `0` → **Ablehnung** (Validierung verlangt ≥ 1), Eingabe leer → NULL; niemals „0 wird unbegrenzt" | `_lib`-Test über die Validierung von `anlegenAction` |
| Ein ZIP zählt als genau **ein** Download (§7.5) | je Datei im Archiv einmal zählen | ZIP eines Shares mit drei Dateien erhöht `download_count` um 1, Logzeile mit `file_id = NULL` | reine Funktion / Handler-Test |
| Serverseitige Deckelung des Ablaufs (§7.3, Punkt 2) | die Deckelung aus `bearbeitenAction` entfernen (sie steht dann nur noch als HTML-Attribut) | direkter Action-Aufruf mit `0`, `-1`, `99999` → Ablehnung, `expires_at` **unverändert**; und „nur Titel geändert" verkürzt den Share **nicht** | Action-Test |
| Rate-Limit auf `/verify` (§7.4) | den Limiter entfernen | 11 Versuche in 10 Minuten auf denselben `${shareId}\|${ip}` → der 11. antwortet 429 **ohne** bcrypt-Aufruf (der Aufruf wird gezählt) | Handler-Test mit injizierter Uhr (`RateLimiter` nimmt `now`, §2.6) |
| Das geschlossene Orakel (§7.4) | für nicht existierende Shares wieder 404 statt 401 | `verify` gegen unbekannte ID, gegen passwortfreien Share und gegen falsches Passwort → **dreimal 401**, ununterscheidbar | E2E (Statuscode über den echten Request) |
| `password_hash` überquert die Grenze nicht (§7.3) | `select()` ohne Spaltenliste | die Projektion liefert `hatPasswort: boolean` und **kein** Feld, dessen Wert mit `$2b$` beginnt; dazu eine Quelltext-Zusicherung „kein `select()` ohne Argument in `files`" | reine Funktion + Quelltext-Scan |
| Kein Zählen ohne Berechtigung (§7.4) | das Inkrement vor die Cookie-Prüfung ziehen | ein 401 (kein Cookie) und ein 403 (AV nicht `clean`) erhöhen `download_count` **nicht** | Handler-Test + E2E |
| Mengengrenze je Share (§7.1) | die Prüfung entfernen | `FILES_MAX_DATEIEN_PRO_SHARE + 1` gemeldete Dateien → Ablehnung, **keine** Zeile angelegt | Action-Test |

Die Quelltext-Zusicherungen sind die ehrliche Ebene für „diese Bauform ist eingehalten" und nicht für
„sie wirkt" — dieselbe Aufteilung wie beim Media-Query-Scan (§11.4) und beim `throw`-Scan (§11.3).

### 11.3 Was nur ein echter Socket belegen kann

Ein Vitest mit `net.createServer` als **Fake-clamd** — kein Stub, der in einer async-Funktion wirft.
Der Unterschied ist der ganze Punkt: drops zwei Tests decken genau den Pfad ab, in dem ihr Stub
**innerhalb** einer async-Funktion wirft (echtes `reject`), und lassen den tödlichen Pfad ungeprüft.

| Fall am echten Socket | Zusage |
|---|---|
| Antwort `stream: OK\0` | `{art:"clean"}`, Socket geschlossen |
| Antwort `stream: Eicar-Test-Signature FOUND\0` | `{art:"infected"}` mit Signatur |
| Antwort `INSTREAM size limit exceeded. ERROR\0` | `{art:"error"}` — **und der Testprozess lebt danach** |
| Antwort ohne `\0`, dann Verbindungsabbruch | `{art:"error"}`, Promise settelt |
| Server nimmt an und antwortet **nie** | nach `FILES_AV_TIMEOUT_MS` → `{art:"error"}`, Socket zerstört |
| `ECONNREFUSED` | `{art:"error"}` |
| Server sendet zwei Antworten | genau **ein** Ergebnis (Idempotenz von `abschluss`) |

Zusätzlich, prozessweit: ein Test stellt sicher, dass **kein** `throw` in einem Socket-Handler
steht — als Quelltext-Zusicherung über `_lib/av.ts` (`expect(quelle).not.toMatch(/socket\.on\([^)]*\)[\s\S]*throw/)`
in der Bauform, die der mobile Durchgang für `MONATS_FENSTER` benutzt hat). Ein Quelltext-Scan ist
hier die ehrliche Ebene: er kann die Bauform festhalten, nicht ihre Wirkung.

### 11.4 DOM (Vitest, jsdom) — mit dem etablierten Harness

**`src/app/m/qr/_lib/test-dom.tsx`** — `mount`/`hydrate`/`rerender`/`unmount`/`query`/`queryAll`/
`exists`/`fill`/`click`/`submitForm`/`queryPortal`. **Kein zweites Harness erfinden**
(`CLAUDE.md:92-93`).

`files` **importiert** es von dort, unverändert und ohne Kopie. Das ist eine bewusste, begrenzte
Abweichung von „Modul-Interna sind kein API" (`docs/design/README.md:23-33`), und die Begründung
gehört dazu:

- Der Präzedenzfall der Regel ist `payloadToSvg` — **Produktionscode**, der in ein ausgeliefertes
  Bundle geraten wäre. Ein Testhelfer wird nicht ausgeliefert; die Kopplung kann nur einen Testlauf
  brechen, und dann laut.
- Die Alternative wäre eine **Kopie** — genau das, was `CLAUDE.md:92-93` verbietet.
- Eine Hebung nach `src/core/test-dom.tsx` wäre nach dem Maßstab aus §2.6 vertretbar (zwei
  Nutznießer), macht aber `CLAUDE.md:92-93` und die Aufgabenstellung zu **falschen Zeigern** — beide
  nennen den Pfad wörtlich, und der nächste Leser liest `CLAUDE.md`. Der Preis der Hebung ist damit
  höher als ihr Nutzen.
- **Der Auslöser für eine späte Hebung ist benannt**, damit die Entscheidung nicht schleift: sobald
  ein **drittes** Modul das Harness braucht **oder** `files` eine Änderung darin braucht, wandert es
  nach `src/core/` — und `CLAUDE.md:92-93` wird in derselben Änderung mitgezogen.

Geprüft wird damit:

| Test | Zusage |
|---|---|
| `UploadInsel.test.tsx` | Chunk-Aufteilung bei einer Datei > `FILES_CHUNK_BYTES`; Abbruch löscht; Wiederholen setzt nur die fehlgeschlagene Datei fort; Fortschritt steigt monoton |
| `AbgabeFormular.test.tsx` | Hinweis über 500 Zeichen wird im Feld gemeldet, nicht abgeschnitten; Kategorie-Auswahl ist eine echte Radiogruppe (ein Tabstop, Pfeiltasten wählen nativ) |
| `PasswortMaske.test.ts` | falsches Passwort meldet am Feld; die Eingabe bleibt stehen |
| `_ui/*.test.tsx` | Leerzustände, AV-Zustände mit Text (nicht nur Farbe) |

**Was jsdom strukturell nicht kann:** Media Queries auswerten. Ein Vitest, der „auf 390px ist X
unsichtbar" behauptet und dafür im DOM sucht, geht **immer** durch — er misst nichts, und der grüne
Balken ist eine Lüge (`docs/design/README.md:199-206`, Analyse Falle 30). Deshalb besitzt Vitest hier
nur die Aussage **„die Klasse trägt die richtige Media Query"** als Quelltext-Scan über
`files.css`/`files-public.css`, inklusive der Prüfung auf **767.98px** in `max-width`-Abfragen.

**Und eine zweite Quelltext-Zusage, die genauso wichtig ist:** jede Regel, die eine antd-Klasse
überstimmen muss — die Umschaltung Tabelle/Kartenliste sitzt auf `.ant-table-wrapper` (§7.3) —, trägt
den **vorangestellten Präfix-Selektor** (`.fi-liste .nurDesktop`) und **kein** `!important`. Das ist
die Gegenmaßnahme zu Falle 5, und ein Quelltext-Scan kann genau sie festhalten: „der eigene Selektor
trägt den Präfix". Ob sie **wirkt**, kennt nur der Browser — ein Scan kennt Reihenfolge und
Fremd-Stylesheets nicht (`docs/design/README.md:222-228`). Die Wirkung besitzt Playwright bei 390,
1280 und dazwischen (§11.5).

### 11.5 E2E (Playwright) — was NUR e2e belegen kann

`webServer` wird zu einem **Array** aus zwei Einträgen (`@playwright/test` 1.61.1 nimmt beides): dem
Fake-clamd aus §6.8 und dem bestehenden `next dev -p 3100`. `webServer.env` des Next-Eintrags bekommt
`SUITE_HOST_FILES=files.localtest.me,drop.localtest.me` (§3.4) und **die Zahlenwerte aus der Tabelle in
§9.3** — die **drei** Pflichtvariablen plus AV-Adresse, AV-Zeiten und `FILES_LOESCH_KARENZ_STUNDEN=0`.
Nicht „kleine Werte": kleiner als 4 MiB bricht der Boot ab, und > 10 MiB verlangt §11.5 selbst (§9.3
schreibt die Rechnung aus).

**Regel für jede Datei:** den benötigten Zustand **im Test selbst** herstellen. Die
Playwright-Datenbank wird einmal je Lauf gelöscht, aber alle Dateien teilen sie sich, `workers: 1`, in
Pfadreihenfolge (`playwright.config.ts:8,35`); ein Test, der „hier liegt ein Share" voraussetzt, ist
entweder allein grün oder in der Suite grün, nie beides (`docs/design/README.md:214-220`).

| Zusage | Warum nur e2e |
|---|---|
| **`/` zeigt auf beiden Hosts verschiedene Ansichten** | die Rollenauflösung hängt an echten Request-Headern nach dem Middleware-Rewrite; §3.5 fordert diese Messung ausdrücklich |
| **Ein Abgabelink, auf dem Verwaltungs-Host erzeugt, trägt den Inbox-Host** | die Klasse ist in Dev mit einem Host unsichtbar; das ist der Test, der Falle 17 schließt (§3.4) |
| **`/shares/neu` unter dem Inbox-Host ist 404, `/u/<token>` unter dem Verwaltungs-Host ist 404** | Rollentrennung wirkt nur im echten Request |
| **JEDE Route aus der Tabelle in §2.1 antwortet auf dem FREMDEN Host mit 404** — eine Schleife über die neun Endpunkte, nicht zwei Stichproben | Route Handler haben kein Layout; ohne diese Zeile bliebe die Mutation „den `rolleOderNull`-Abgleich in allen api-Routen weglassen" grün, und `/api/download/<id>` antwortete auf dem Inbox-Host, dessen Alt-Pendant zwischen den Cutovern noch live ist (§3.2, E15 d) |
| **Keine Verwaltungsseite enthält einen relativen `/u/`-Link** | DOM-Scan über die gerenderte Seite |
| **Das Markup eines passwortgeschützten Shares enthält vor dem Entsperren keinen Dateinamen** | muss den **rohen HTTP-Body** inspizieren, nicht den sichtbaren DOM — im RSC-Payload steckt sonst alles (Analyse Falle 12). Vitest kann es strukturell nicht sehen, weil `"use client"` dort ein wirkungsloser String ist |
| **Nach dem Entsperren ist der Download möglich, ohne Cookie nicht** | Cookie-Weg über drei Routen |
| **Chunked Upload über die Proxy-Kappe hinaus** | eine Datei größer als 10 MiB hochladen und vollständig zurücklesen; ein einzelner PUT derselben Größe wird still gekappt — genau diese Differenz ist die Zusage |
| **Der Wartezustand aktualisiert sich und der Download ist bis `clean` gesperrt** | `<meta refresh>` und Statuswechsel im echten Browser |
| **Der `<meta refresh>` verschwindet** — Share mit einer `error`-Datei: die Seite trägt ihn **nicht** mehr | die Regel aus §7.4 ist erst im gerenderten Markup prüfbar; ohne die Zusage lädt eine Seite mit einer dauerhaft fehlgeschlagenen Datei für immer alle 5 s nach |
| **Ein Share mit `clean` UND `scanning` liefert die freigegebene Datei aus** und zeigt die andere als Zeilenzustand | der gemischte Zustand ist der Normalfall bei mehreren Dateien; ganzseitiges Warten wäre hier ein blockierter fertiger Share (§7.4) |
| **fail-closed ist erreichbar — über ALLE fünf Lesewege** | Herstellung des Zustands, ausgeschrieben: der Fake-clamd läuft in `FAKE_CLAMD_MODUS=error` (§6.8), also settelt `scanne` mit `{art:"error"}` nach `2 × 2 000 ms`. Geprüft wird je **einer** Zeile in `error` **und** einer in `scanning`: `GET /api/download/<id>` → 403, `…/zip` → 403 bzw. Archiv **ohne** die Datei plus `_HINWEIS.txt`, `…/preview` → 403, `GET /api/inbox/<id>` → 403, und die ZIP-Zusammenstellung aus dem Posteingang → dieselbe Ausschlussregel. Dazu: die Verwaltung zeigt „Prüfung nicht möglich" **mit** Wiederholen-Knopf (Detailseite **und** Posteingang), und der Upload war die ganze Zeit quittiert. Das ist die Zusage, die §6.3 Punkt 2 für nicht verhandelbar erklärt — vier der fünf Lesewege waren dafür bisher unbelegt |
| **Mobile Zusagen bei 390×844, 1280×720 und dazwischen (834×1112)** | jsdom kann es nicht; und **wer nur die Enden misst, prüft die Mitte nicht** — die Mitte ist jedes Tablet im Hochformat (`docs/design/README.md:199-212`) |
| **Der Desktop-Lauf als eigene Hälfte** | ein Test, der nur bei 390px misst, kann eine `display:none`-Regel nicht widerlegen: dort sagen die richtige und die kaputte Fassung beide „sichtbar" |
| **Anonyme Abgabe von zwei Dateien mit Hinweis und Kategorie erscheint im Posteingang** | ganze Kette über zwei Hosts |
| **Ein widerrufener Abgabelink lehnt ab, ohne 404** | Zustandsseite statt Fehlerseite |

Dateien: `e2e/files-fileshare.spec.ts`, `e2e/files-inbox.spec.ts`, `e2e/files-hosts.spec.ts`,
`e2e/files-mobil.spec.ts`.

### 11.6 Was `pnpm build`, `typecheck` und `lint` hier **nicht** finden

Damit niemand einen grünen Balken für eine Zusage nimmt, die er nicht trägt:

- den Compound-Zugriff auf antd in RSC (HTTP 500, §7.2),
- einen **Wert** aus einem `"use client"`-Modul in einer Server Component (HTTP 500),
- eine Route auf einem PASSTHROUGH-Pfad (tot, kein Log),
- API-Routen am falschen Ort (404 auf jedem Download-Link),
- die Kaskadenkollision zwischen eigenem CSS und antd (die Regel steht richtig da und greift nicht),
- den Faktor 1000 bei Zeitstempeln (paritätsgrün),
- `MAX_FILE_SIZE` gegen `MAX_FILE_SIZE_MB` (beide `number`, beide Zuweisungen typkorrekt),
- den `null`-Zielschlüssel beim gekappten Proxy-Body (nur `console.warn`).

### 11.7 Was kein Gate belegen kann → Runbook-Schritte (Spec 2)

| Zusage | Runbook-Schritt |
|---|---|
| `proxyClientMaxBodySize` ist auf dem Server nicht unter 4 MiB gesenkt | einen 6-MiB-Chunk gegen die laufende Instanz senden und die vollständige Ankunft prüfen |
| Cloudflare kappt bei 100 MB | ein ~150-MB-Upload gegen den Inbox-Host; erwartet: 413 vom Edge |
| clamd liest `/data/files` | im Sidecar `zSCAN` auf eine gerade geschriebene Datei; erwartet: `OK`, nicht `Can't access file` |
| clamd-Kappe und `AlertExceedsMax` wirken | eine Datei über der Kappe scannen; erwartet: **Fund**, nicht `OK` |
| `start_period` reicht | Zeit von `up -d` bis `clamdcheck.sh` wahr am **Zielhost** messen |
| RAM reicht | `docker stats` nach Bereitschaft; clamd ~1 GB **plus** Node |
| Image-Manifest passt zur Architektur | `docker manifest inspect` vor dem ersten `up -d` |
| Restplatz und Backup-Größe | `statfs` + Größe des ersten Tarballs mit Blobs |
| Das Backup enthält die Blobs **und** die DBs | erstes Tarball öffnen: `files.db` **und** `files/` mit Dateien, **keine** `*.part` (§5.5) |
| Scandauer und RSS für die größte zugelassene Datei | eine Datei in Höhe von `FILES_MAX_DATEI_BYTES` scannen, Dauer gegen `FILES_AV_TIMEOUT_MS` und RSS gegen den freien Speicher stellen (§6.6) |

**Nicht mehr hier:** „Kein nackter `/api/download/…`-Link im Umlauf" war eine Runbook-Zeile und ist
jetzt **§13.1, Frage 6** — sie entscheidet, ob auf den Byte-Routen ein zweiter Annahmeweg gebaut wird,
also **vor** dem Bau und nicht danach (§7.4).

---

## 12. Verworfene Alternativen

| Verworfen | Grund |
|---|---|
| **Zwei Module `files` + `drop`** (E1 b) | Der gemeinsame Blob-/Audit-Kern hätte heute nur deshalb zwei Nutznießer, weil man ihn geteilt hat — gegen `docs/design/README.md:23-33`. Der Preis von einem Modul ist bekannt und benannt: ein Gruppen-Namensraum, ein Switcher-Eintrag, host-gleiche Navigation, `/`-Kollision modul-intern |
| **Inbox als Pfad unter einem Host** (E1 c) | **Ausgeschlossen**, nicht nur schlechter: `routing.ts:78` reicht den Pfad wörtlich durch, ein Präfix ändert die verteilten `/u/<token>`-Links |
| **`SUITE_HOST_FILES_SHARES` / `FILES_HOST_INBOX`** | Ersteres bricht den Boot ab (`hosts.ts:69-76`), Letzteres legt eine zweite Wahrheit über Hosts an, gegen die Begründung in `core/hosts.ts:14-17` |
| **Rollen-Syntax im Wert** (`inbox:drop.iuk-ue.de`) | `:` im Hostnamen wird abgewiesen (`hosts.ts:81-86`) |
| **Rolle aus dem Request für erzeugte Links** (E22 a) | Genau Falle 17: ein Share-QR, auf der Inbox-Domain erzeugt, trägt die Inbox-Domain, funktioniert sofort und bricht beim Abschalten eines Hosts — auf verteiltem Papier |
| **Beide Hosts bedienen beide Pfade** (E22, wörtlich) | Kein gedruckter Alt-Link kann kreuzen: die Alt-Apps hatten je einen Host mit disjunkten Pfadräumen und bauten Links aus der eigenen Origin. Und E15 (d) verlangt die Sperre für die Cutover-Fenster (§3.2) |
| **Boot-Prüfung „genau zwei Hosts"** (E22, wörtlich) | Bricht den Zustand vor dem Cutover, wo `SUITE_HOST_FILES` leer/nicht gesetzt eine **sinnvolle** Aussage ist (`hosts.ts:33-38`). Ersetzt durch 0 oder 2-verschieden (§3.3) |
| **`isModuleAdmin`** (E3 a, wörtlich) | Lässt den Suite-Admin unbedingt durch (`core/groups.ts:104`). Betreiberentscheidung: keine Abkürzung, wie in `feedback` seit 28.07. |
| **Ownership über `created_by`** (E3 c) | Für drop-Altdaten unmöglich (keine Datei ist einem Benutzer zuzuordnen) und für Fileshare-Daten falsch: links steht eine E-Mail, rechts der OIDC-`sub` — der Vergleich ist typkorrekt und **immer** `false`; beim Dev-Login ist er *fast* richtig (`dev:<E-Mail>`), was zur falschen Reparatur einlädt (Falle 31) |
| **Passwortschutz 1:1 belassen** (E4 a) | Dann stünde in der Spec ein Sicherheitsversprechen, das das Modul nicht hält — und jemand „repariert" es später versehentlich |
| **`s3_key` 1:1 als FS-Pfad plus Guard** (E5 a) | Der rohe Client-Dateiname wäre Pfadsemantik; ein Guard muss überall stehen, das Pfadschema nur an einer Stelle. Zusätzlich wanderte der Name in ein clamd-Kommando |
| **`limit_reached_at` behalten** (E11 a/b) | (a) ist ausdrücklich falsch (importiert einen belegten Defekt). (b) wäre nötig, wenn die Spalte importiert werden soll — sie wird es nicht (§4.2) |
| **Karenz-Zugriff „reparieren"** (E11 d) | Fachliche Neuerung: Links, die heute 410 liefern, funktionierten dann noch. Das müsste der Betreiber beauftragen |
| **Inbox-Uploads in `share_files`** (E18 b) | Phantom-Shares, ein **erfundener** MIME-Wert und ein Filter im Paritätscheck, der selbst Teil der Invariante wird |
| **Gemeinsame Tabelle `files`** (E18 c) | Macht den Rundlauf-Beweis des Imports zu einem Umformungsbeweis und verstößt gegen die spaltenweise 1:1-Übernahme |
| **`/api/cleanup` mit Bearer-Secret** (E13 a) | Ein Secret mehr; `replace("Bearer ", "")` ist keine Prüfung; ein Cron gegen einen unbekannten Host bekommt **302 auf `/login`** und meldet Erfolg |
| **Sidecar-`.txt` weiterschreiben** (E14 b/c) | Das gemessene Überschreiben echter Uploads. (c) bliebe als Rückfall, wenn der Betreiber am Dateisystem-Abholweg festhält — dann fällt die Posteingang-Zusage (§13) |
| **INSTREAM als Scan-Transport** (E16 a) | Zweite Kopie aller Bytes über einen Socket, und der Fehlerfall ist eine zu parsende Protokollantwort statt eines Rückgabewerts. Bleibt es dabei, muss die Auswertung `INSTREAM size limit exceeded. ERROR` **namentlich** kennen |
| **Sidecar im `proxy`-Netz** (E17 a) | Ein unauthentifizierter Scan- und Dateileseservice stünde allen Containern dieses Netzes offen |
| **`unhealthy` auf files-Fehler ausweiten** (E17 III) | Sobald ein Automatismus dazukommt, startete ein files-eigener Fehler den **gesamten** Container neu und nähme die anderen drei Module mit (§5.6) |
| **Vorschau mitzählen** | Verhaltensänderung für bereits verteilte Links: ein Share mit `max_downloads = 1` wäre durch das Öffnen der Vorschau verbraucht |
| **`Range`/206 ergänzen** | Neue Funktionalität, kollidiert mit dem atomaren Zähler (drei Range-Anfragen = drei Downloads), niemand hat sie beauftragt |
| **`argon2`/`scrypt` für Share-Passwörter** | Die Passwörter liegen bei den Empfängern; jeder geschützte Bestands-Share wäre unöffenbar |
| **bcrypt für Inbox-Tokens** | Rechenlast auf jedem Chunk ohne Sicherheitsgewinn: 60 Bit Entropie, ≤ 72 h Laufzeit |
| **Rohtoken speichern, um QR nachträglich zu zeigen** | Ein Zugangsdatum at rest. Bei ≤ 72 h Laufzeit ist Neuausgeben der Normalfall |
| **`localStorage` für die QR-Historie** (drop-Weg) | Origin-gebunden: beim Domainwechsel verliert der Betreiber seine Historie, obwohl die DB-Zeilen mitwandern |
| **Seed für `files`** | Ein Seed-Abgabelink wäre in einer Generalprobe ein gültiger anonymer Schreibzugang; E2E stellt seinen Zustand ohnehin selbst her |
| **PWA/Manifest** | Ein Modul = ein Host ist die Voraussetzung des Suite-Musters, und die ist bei zwei Hosts weg |
| **Sentry** | Für die Suite bewusst gestrichen. In `drop` läuft die Verdrahtung im Container ohnehin nicht (`CMD` ohne `--import`), während ein lokales `pnpm start` mit `sendDefaultPii: true` und fest hinterlegter DSN Request-Daten nach außen sendet |
| **Socket-Pool-Apparat, autoheal, HeadBucket-Health** | Adressieren einen Fehlermodus, den es auf einem Dateisystem nicht gibt |
| **`?error=invalid_token&token=…`** | Ein gültiges Token landete in Browser-History und Referer. Die 1:1-Pflicht ist die Korrekturaufforderung, nicht der Parameter |
| **`POST /upload` (drop, ohne Token) nachbauen** | Er ist `requireSession('api')`-gegatet (`drop/src/app.js:710`), sein einziger Aufrufer ist drops Admin-SPA, und die gibt es nach dem Cutover nicht mehr. Kein gedruckter Code, kein verteilter Link hängt daran (§8.2) |
| **Die FormData-Feldnamen `hint`/`category`/`files` beibehalten** | Sie gehören zum Ein-Anfrage-Weg, der ab 10 MiB **still** kappt (§7.1). Der Ersatz ist benannt: derselbe Pfad nimmt zusätzlich `POST` an und antwortet 409 „bitte neu laden", statt einem offenen Alt-Tab ein 405 ohne Text zu geben (§8.2). **Nach dem Standby-Ende darf dieser POST-Zweig entfallen** — er ist die einzige Zeile im Modul mit einem Ablaufdatum |
| **Eine harte Gesamtgrenze für `/data/files` in Spec 1** | Sie wäre eine Zahl, die nur der Server kennt (§1.2), und der eigene Mount leistet die Trennung nicht (zwei benannte Volumes liegen auf demselben Host-Dateisystem, §6.5). Getragen wird der Restplatz von Ablage-Kachel, ENOSPC-Behandlung und einer Quota am Blob-Ort — Letztere als Vorbedingung an den Betreiber (§13.2, Frage 14) |
| **Ein clamav-Sidecar im E2E-Aufbau** | `DATA_DIR=./.data/e2e` ist für einen Container strukturell unsichtbar, und `zSCAN` nimmt einen Pfad **im clamav-Container**. Ersatz ist der Fake-clamd auf demselben Dateisystem — derselbe Transport, dieselbe Auswertung (§6.8) |
| **Ein fail-open-Schalter „nur für Dev"** | Er wäre genau drops toter `AV_FAIL_OPEN` in neuer Gestalt (§6.3) und würde die einzige Zusage aushöhlen, die alle fünf Lesewege trägt. Dev bekommt stattdessen einen Scanner, der antwortet |
| **207 Multi-Status** | Ein erfolgreich gespeicherter Upload wurde als Fehlschlag gemeldet, der Melder lud erneut hoch und erzeugte Dubletten |
| **Freitext-Kategorien** | Sie waren gleichzeitig Verzeichnisnamen; als Spalte brauchen sie keine Freiheit mehr, und `mkdir recursive` auf Nutzereingabe entfällt |
| **Verlustbehaftetes Dateinamen-Sanitizing für neue Uploads** | `Übung_Größe.pdf` → `ubung_groe.pdf` war nötig, weil der Name im Pfad stand. Er steht nicht mehr im Pfad — für **neue** Uploads bleibt der Originalname. Für den **Altbestand** sind die Namen unwiederbringlich sanitisiert, und ein Import darf `filename` **nicht** als `original_filename` ausgeben |

---

## 13. Offene Fragen

### 13.1 Blockiert den Bau von Spec 1

| # | Frage | Wer antwortet |
|---|---|---|
| 1 | **`FILES_MAX_DATEI_BYTES` und `FILES_AV_MAX_BYTES`** — Grundlage ist der real gesetzte `MAX_FILE_SIZE` (easy-filesharing, Server-`.env`) und `MAX_FILE_SIZE_MB` (drop). Ohne die Zahlen gibt es keine Vorbelegung, und der Boot bricht ab (§9.3). **Dieselbe Antwort setzt drei Dinge:** die Annahmegrenze, die Scangrenze und `MaxFileSize`/`StreamMaxLength` in `clamd.files.conf` (§6.5). Liegt der Wert über 100 MiB — heute gemessen 500 MiB in beiden Alt-Apps —, ist die Folge benannt und gehört zur Antwort: Scandauer und RAM sind zu messen (§6.6, §13.3/Frage 23), und ein Herunterziehen der Grenze wäre eine **Verhaltensänderung** gegenüber beiden Alt-Apps, also eine Entscheidung, nicht eine Nebenwirkung | **Betreiber** (Server-`.env` lesen; Muster `docs/runbooks/feedback-cutover.md:29-34`) |
| 2 | **`FILES_MAX_ABLAUF_TAGE`** — der real gesetzte `MAX_EXPIRY_DAYS` | **Betreiber** |
| 3 | **Die wirklich eingesetzte `ALLOWED_MIME` von `drop`** — die Allowlist wird erst danach geschrieben; ein zu enger Wert lehnt Handyfotos ab, ein zu weiter öffnet den Ausliefer-Weg (§8.5) | **Betreiber** |
| 4 | **Architektur und freies RAM des Suite-Hosts** — der Tag `clamav/clamav:1.4` hat nur ein `linux/amd64`-Manifest, clamd belegt ~1 GB RSS zusätzlich zum Node-Prozess (§6.5) | **Betreiber** |
| 5 | **Welche Verzeichnisse unter `/srv/fuekw/drop_inbox` real existieren** — sie sind die Kategorie-Werte, und die Anzeige muss sie kennen (§8.3) | **Betreiber** (`find -maxdepth 1 -type d`) |
| 6 | **Sind nackte `/api/download/…`- oder `/api/preview/…`-Links im Umlauf** (Mail, Chat, Lesezeichen)? | **Betreiber** |

**Warum Frage 6 hier steht und nicht unter „blockiert einzelne Festlegungen".** Fällt die Antwort
„ja/unklar", gilt statt E4 (b) die Variante (c) — und (c) ist **kein Schalter**, sondern ein **zweiter
Annahmeweg auf allen drei Byte-Routen** (Cookie **oder** Bestandslink-Karenz bis `expires_at`), mit
eigener Zustandslogik, eigenen Statuscodes und eigenen Tests. Gebaut wird das in **Spec 1** (§7.4),
also muss die Antwort **vor** den Byte-Routen vorliegen; Analyse E4 sagt es wörtlich: „**Vorher** muss
der Betreiber bestätigen, dass keine nackten Download-Links verteilt wurden — falls unklar, (c)."
Die Übergangsfrist von (c) läuft von sich aus aus, weil `expires_at` bei Altdaten ≤ `MAX_EXPIRY_DAYS`
in der Zukunft liegt. Bis zur Antwort ist (c) **nicht** spezifiziert, und §11.7 führt die Zeile nicht
mehr als Runbook-Schritt.

### 13.2 Blockiert einzelne Festlegungen, nicht den Baubeginn

| # | Frage | Wer antwortet | Was hängt daran |
|---|---|---|---|
| 7 | **Wie lange soll der Posteingang Dateien halten?** | **Betreiber** | `FILES_INBOX_AUFBEWAHRUNG_TAGE`. Nicht gesetzt = heutiges Verhalten (keine Frist). Es ist eine fachliche Zusage, keine technische Entscheidung |
| 8 | **Bleibt es bei der Posteingang-Ansicht, oder braucht der Betreiber den Dateisystem-Abholweg weiter?** | **Betreiber** | Bei „weiter" gilt E14 (c) statt (a): ein **separates** Metadatenverzeichnis neben der Inbox, und §4.6/§8.6 ändern sich. Die Ansicht ist gebaut; die Sidecar wäre zusätzlich |
| 9 | Soll die Laufzeit eines Abgabelinks über 72 Stunden hinausgehen können (Mehrtages-Einsatz)? | **Betreiber** | Heute 1:1 begrenzt; eine Erhöhung ist eine Beauftragung, keine Portierung (§8.6) |
| 10 | **Muss die Druckgröße der Aushänge mitwachsen?** `H`/`margin 4` ergibt 37×37 statt 29×29 Module, jedes Modul wird bei gleicher Druckgröße kleiner (§7.9) | **Betreiber** | Nur die Druckvorlage, nicht der Code |
| 11 | **Wird `/data/files` ein Bind-Mount** (`/srv/iuk-suite/files`) oder bleibt es das benannte Volume `files_data`? | **Betreiber** | Bind-Mount erhält den Handgriff und ist der Backup-Anker; Vorbedingung ist Eigentum **uid 1001** (§6.5) |
| 12 | **Backup-Größe:** wie viele Generationen mit Blobs sind vertretbar (`BACKUP_KEEP`, heute 7)? | **Betreiber** | `scripts/backup.sh` (§5.5) |
| 13 | **Wie heißen die SSO-Gruppen für `files`?** Es gibt genau eine Stufe | **Betreiber** | `SUITE_ADMIN_GROUP_FILES`; die Registry-Vorbelegung `drk-files-admin` ist eine Vorgabe, keine Festschreibung (§2.3) |
| 14 | **Bekommt der Blob-Ort ein eigenes Dateisystem oder eine Quota?** | **Betreiber** | Zwei benannte Docker-Volumes liegen auf **demselben** Host-Dateisystem; ein volllaufendes `files_data` erzeugt ENOSPC dort, wo auch `portal.db`, `qr.db`, `feedback.db` und `files.db` liegen (§6.5). Analyse E19 (d) verlangt „eigenes Volume **oder** eine harte Gesamtgrenze" — Spec 1 kann keins von beidem erfinden. Ohne Quota tragen Ablage-Kachel und ENOSPC-Behandlung den Fall allein, und der Restplatz ist eine Betriebsaufgabe |
| 15 | **Wie viele Dateien umfasst ein realer Abgabe-Vorgang, und wie viele Melder hängen an derselben Adresse?** | **Betreiber** (Quelle ohne Rückfrage: die Fastify-Zugriffslogs, `drop/src/app.js:436` — Zahl der `POST /u/…/upload` je Token und Minute) | Analyse Abschnitt 8, Punkt 21 nennt es „den Eingangswert für Entscheidung 8". Daran hängen `FILES_INBOX_BUDGET_DATEIEN` (100), `FILES_INBOX_BUDGET_BYTES` (2 GiB) und `FILES_IP_ANFRAGEN_PRO_10MIN` (600). Der Bau ist **nicht** blockiert, weil das Budget nachträglich erhöhbar ist (§8.4) und die drei Werte Env-Variablen sind; ohne die Antwort sind sie aber Startwerte und keine belegten Größen |

### 13.3 Wird am Server gemessen, nicht entschieden — Runbook

| # | Frage | Prüfweg |
|---|---|---|
| 16 | Kann clamd (uid 100/gid 101) die von uid 1001 geschriebenen Blobs lesen? | `zSCAN` im Sidecar auf eine frisch geschriebene Datei. Ergebnis entscheidet zwischen expliziter gid + `0o640` und `user:` am clamav-Service (§6.5) |
| 17 | Wirkt `AlertExceedsMax yes` zusammen mit dem gesetzten `MaxFileSize`? | Datei über der Kappe scannen; erwartet **Fund**, nicht `OK` |
| 18 | Welche `start_period` braucht clamd am Zielhost? | Zeit bis `clamdcheck.sh` wahr; **nicht** 17 s aus der Analyse und **nicht** 120 s aus `drop` übernehmen. **Der Wert ist doppelt wichtig, weil `depends_on: service_healthy` gilt:** ist er zu knapp, startet die **ganze** Suite nicht (§6.5) |
| 19 | Ist `proxyClientMaxBodySize` auf dem Server unter 4 MiB gesenkt? | 6-MiB-Chunk gegen die Instanz; vollständige Ankunft prüfen |
| 20 | Kappt Cloudflare bei 100 MB? | ~150-MB-Upload gegen den Inbox-Host; erwartet 413 vom Edge |
| 21 | Ist im Sidecar wirklich `clamd.files.conf` wirksam? | `clamconf -n` im laufenden Container; erwartet **`FILES_AV_MAX_BYTES`** in `MaxFileSize`/`StreamMaxLength`. Das ist eine **Verifikation**, keine Quelle — Spec 1 setzt den Wert (§6.5) |
| 22 | Übernimmt das leere `files_data` bei **verschachteltem** Mount Eigentümer und Modus aus dem Image? | Nach dem ersten `up -d` im Container `ls -ldn /data/files` und ein `touch` als uid 1001. Die drei Läufe aus §2.2 wurden **ohne** mitgemountetes `suite_data:/data` gemessen; die Boot-Prüfung §9.4 Punkt 6 fängt den Fall laut ab, aber erst dort |
| 23 | Dauer und RSS eines Scans für die **größte** zugelassene Datei | eine Datei in Höhe von `FILES_MAX_DATEI_BYTES` schreiben und per `zSCAN` scannen; Dauer gegen `FILES_AV_TIMEOUT_MS`, RSS gegen den freien Speicher (§6.6). Reißt die Dauer die Zeitgrenze, landet **jede** große Datei in `error` und ist fail-closed dauerhaft nicht ladbar |

### 13.4 Gehört Spec 2, ist hier nur benannt

| # | Frage | Wer |
|---|---|---|
| 24 | Darf der importierte Altbestand als virengeprüft gelten, oder wird er nachgescannt? Und was sehen Empfänger bestehender `/s/<id>`-Links, solange der Lauf läuft? | **Betreiber**; die Empfehlung ist E7 (f) — Nachscan vor dem Umschwenken, weil das Wartungsfenster ohnehin da ist. Spec 1 liefert dafür `unscanned` und den Wiederholungsweg |
| 25 | Läuft der Cleanup-Cron der Alt-App? | **Betreiber**. Falls nein, ist der erste Aufräumlauf ein Löschereignis → Trockenlauf zuerst (§7.6) |
| 26 | Wo liegt `metaDir` absolut auf dem Host, und wem gehören die Dateien (`DROP_UID`/`DROP_GID`)? | **Betreiber**; ohne den Pfad verliert der Freeze jeden Hinweis, jede Absender-IP und jede Kategorie |
| 27 | Wie viele Objekte liegen im MinIO-Bucket, und stimmt die Zahl mit `share_files`? | **Betreiber**; Waisen sind auf zwei belegten Wegen möglich, dazu `mc ls --incomplete` |
| 28 | Wie viele verschiedene `created_by`-Werte gibt es, und sind es Klartext-E-Mail-Adressen? | **Betreiber**; ohne die Zahl ist E21 nicht abschließend entscheidbar. Spec 1 setzt (c) — Platzhalter für den Altbestand — und (c) ist nur umkehrbar, solange der Alt-Stack in Standby steht |
| 29 | Welche Reihenfolge haben die beiden Cutover? | **Betreiber**; der Code entscheidet es nicht, die Rollenabbildung ist über beide Termine stabil (§3.3) |

---

## Anhang: Abhängigkeiten der Bauwege

Die tragende Schicht zuerst, danach zwei möglichst unabhängige Gruppen (abgestimmter Bauweg):

```
A  Modulgerüst (§2)  ──►  B  Host-Rollen (§3)  ──►  C  Datenmodell (§4)
                                                     │
                            D  Storage (§5) ◄─────────┤
                                   │                  │
                            E  AV-Pipeline (§6) ◄─────┘
                                   │
                     ┌─────────────┴─────────────┐
                     ▼                           ▼
        F  Fileshare-Seite (§7)      G  Inbox-Seite (§8)
                     │                           │
                     └────────► H  Grenzen, Zustände, Tests (§9–§11)
```

F und G teilen ausschließlich A–E und die `core`-Hebung aus §2.6. Sie berühren
verschiedene Tabellen, verschiedene Route-Groups und verschiedene Hosts — zwei Umsetzer können sie
parallel bauen, sobald E steht.

