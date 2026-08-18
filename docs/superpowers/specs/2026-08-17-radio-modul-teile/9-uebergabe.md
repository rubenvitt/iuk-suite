# 9. Uebergabe an Spec 2 — Import, Cutover, Abbau

Diese Spec baut das Modul. Sie fuehrt den Cutover **nicht** durch. Was hier steht, ist die
verbindliche Uebergabeliste an Spec 2 (das Cutover-Runbook `docs/runbooks/radio-cutover.md`).

⚠️ **Dieses Kapitel ist vollstaendig und woertlich in das Cutover-Runbook zu uebernehmen — nicht
zusammenfassen, nicht verlinken.** Begruendung aus dem Vorbild `docs/runbooks/lagerbuch-cutover.md:390-393`:
das Runbook wird unter Zeitdruck gelesen, und ein Verweis in eine mehrhundert-Kilobyte-Spec ist unter
Zeitdruck kein Verweis. **Wo Spec 2 von dieser Liste abweicht, ist es ein Fehler in Spec 2, nicht
hier.**

---

## 9.1 Was Spec 2 aus Spec 1 erbt

| Festlegung | Wert | Folge fuer Spec 2 |
|---|---|---|
| **Modul-Key** | `radio` | DB-Datei `radio.db` unter `DATA_DIR` — **eine** Datei, kein zweiter Store. Env-Namen daraus abgeleitet: `SUITE_HOST_RADIO`, `SUITE_ADMIN_GROUP_RADIO` (`src/core/hosts.ts:29-30` bildet den Namen als `SUITE_HOST_` + Key in Grossbuchstaben). `radio.db` faellt **ohne jede Skriptaenderung** ins Backup: `scripts/backup.sh:25-27` sammelt `"$DATA_DIR"/*.db` per nullglob und sichert jede Datei per `sqlite3 .backup` (`:41-43`) |
| **`SUITE_ADMIN_GROUP_RADIO`** | **Pflicht zum Cutover, gesetzt und NICHT leer** | ⚠️ **Der Fehlfall ist stumm und trifft alle Verwaltenden auf einmal.** Eine leere Liste gewaehrt **nichts**, und weil `radio` den `isModuleAdmin`-Kurzschluss modulintern ignoriert (wie `feedback` und `lagerbuch`, Entscheidung 9), faengt der Suite-Admin niemanden auf: die Folge ist ein stummes 404 fuer **jede** Verwaltungsseite — kein Fehler, kein roter Test, kein Eintrag im Protokoll. Wortgleiches Vorbild samt Begruendung: `.env.example:241-244` fuer `lagerbuch`. ⚠️ Der **Gruppenname** ist eine Betreiberauskunft (bei `lagerbuch` `lagerbuch_nutzer`, `.env.example:244`) und steht als U10 in §9.8. Zweite Folge, die im Cutover-Fenster teuer ist: ein Gruppenentzug oder eine frisch angelegte Gruppe wirkt mit bis zu **einer Stunde** Verzug, weil Gruppen im JWT nur beim Login und beim Token-Refresh nachgezogen werden (`CLAUDE.md:151-156`) — wer die Gruppe am Cutover-Abend anlegt, prueft die Verwaltung **nach** einer neuen Anmeldung, nicht mit der offenen Sitzung |
| **Ein Fenster, zwei Alt-Apps** | radio-admin **und** radio-inventar ziehen im **selben** Umschwenk um | ⚠️ **Es gibt keinen Zwischenzustand, in dem radio-admin schon in der Suite liegt und der Kiosk noch per HTTP mit ihm spricht.** Der Kiosk ist heute Konsument der sechs `/v1`-Routen von radio-admin (`radio-admin/server/src/routes/loanApi.ts`); die HTTP-Grenze faellt erst, wenn dieselben Aufrufe Drizzle-Aufrufe **im selben Prozess** sind (Entscheidung 15). Fuer Spec 2 heisst das: **ein** Cutover-Abend, **eine** Freeze, **eine** Snapshot-Runde ueber beide Bestaende — kein „erst die Verwaltung, naechste Woche der Kiosk". Wer zwei Abende plant, plant ein Fenster, in dem der Kiosk gegen einen abgeschalteten Server spricht. Die Fachlichkeit, die dabei mitwandert (der Ausfall-Puffer `STALE_GRACE_MS = 5 * 60_000`, `radio-inventar/apps/backend/src/modules/radio-admin/radio-admin.service.ts:48`), gehoert dem Implementierungs-Kapitel, nicht dem Runbook — hier steht nur, dass sie **vor** dem Cutover gebaut sein muss |
| **`SUITE_ACCESS_GROUP_RADIO`** | wird **NICHT** gesetzt | Die Ausleihe ist anonym erreichbar (`requiresAuth: false`). Eine gesetzte Zugriffsgruppe waere eine zweite, widerspruechliche Wahrheit neben `requiresAuth`. Vorbild der Aufschreibung: `.env.example:246-248` fuer `lagerbuch` |
| **Migrationsverzeichnis** | `src/app/m/radio/_db/migrations` | Dateinamen kommen aus `meta/_journal.json` und werden **nicht** erfunden. ⚠️ **Das Dreieck ist dreiteilig** (`CLAUDE.md:127-131`): Verzeichnis + Eintrag in `MODULE_MIGRATIONS` (`src/core/bootstrap.ts:20`) + **eine `COPY`-Zeile im `Dockerfile`**. Gemessen fuehrt `Dockerfile:51-56` je Modul eine eigene Zeile (portal, qr, feedback, files, lagerbuch, aufgaben), dazu `:58` fuer `core/konto` — es gibt **kein** Sammel-`COPY`. Fehlt die Zeile, ist lokal alles gruen und der Container findet zur Laufzeit keine Migrationen |
| **Prod-Domain und ihre Herkunft** | `radio.iuk-ue.de`, **ausschliesslich** ueber `SUITE_HOST_RADIO`; Registry `prodHosts: []` | Cutover = **eine** `.env`-Zeile plus die Erweiterung von `SUITE_TRAEFIK_RULE` (§9.2). ⚠️ **Rollback ist die LEERE Zeile, nicht die geloeschte:** `SUITE_HOST_RADIO=` ergibt `[]`, das Entfernen der Variable ergibt `null` und damit den Code-Default aus der Registry (`src/core/hosts.ts:39-46`, Kommentar `:33-38` schreibt genau diesen Zweck aus) |
| **Alt-Host der Verwaltung** | `radio-admin.iuk-ue.de` → pfaderhaltender 302 auf `radio.iuk-ue.de/admin` | Lebt als Traefik-Router **auf dem Server**, nicht im Repo. Vollstaendig in §9.2, inklusive der Antwort auf „gehoert der Host in `SUITE_TRAEFIK_RULE`?" (**nein, ausdruecklich nicht**) |
| **Oeffentliche Pfadformen** | `/` = Ausleihen (anonym), `/admin/*` = Verwaltung (Suite-SSO + Modul-Admin-Gruppe) | Beide Rollen liegen auf **einem** Host; die Rolle steckt im **Pfad**. Der Rewrite auf `/m/radio<rest>` macht das ohne Aenderung. ⚠️ Daraus folgt die Riegel-Bauform: `requiresAuth: false` erbt **kein** Middleware-Gating fuer `/admin` — jede Verwaltungsseite, jede Server Action und jeder Route Handler ruft den Riegel selbst als erste Anweisung (Falle 61; Bauform im Zugangs-Kapitel) |
| **Einfuegereihenfolge nach Fremdschluesseln** | (1) `users`, `software_versions`, `api_tokens` (untereinander frei) → (2) `devices` → (3) `device_events` → (4) `loans` | Es gibt genau **einen** FK: `device_events.device_id → devices.id ON DELETE CASCADE` (`radio-admin/server/src/db/schema.ts:88-90`, die einzige `FOREIGN KEY`-Zeile aller fuenf Migrationen). ⚠️ **Die Kante ist nicht dekorativ:** `radio-admin/server/src/db/index.ts:28` und `iuk-suite/src/core/db/index.ts:19` setzen beide `sqlite.pragma("foreign_keys = ON")` — ein `device_events`-Insert vor dem Geraet bricht hart ab. `loans.device_id` ist Text **ohne** FK und bleibt es (`schema.ts:106-110` begruendet es woertlich: zurueckgegebene Leihen muessen eine spaetere Geraeteloeschung ueberleben) |
| **Spaltenlisten** | namentlich, nie `SELECT *` | Regel aus `docs/runbooks/lagerbuch-cutover.md:14` („Der Import in `tokens` nennt seine Spalten — immer"). Die vollstaendigen 61 Spalten ueber 6 Tabellen stehen in `docs/radio-portierung-analyse.md:677-696` |
| **IDs** | 1:1 uebernehmbar | Alle Primaerschluessel sind `text` aus `newId()` bzw. der OIDC-`sub` bei `users` (`radio-admin/server/src/db/schema.ts:79`). ⚠️ **Es gibt keine SQL-Defaults fuer `id` und keine `CURRENT_TIMESTAMP`** — genau zwei `DEFAULT`s im ganzen Schema (`docs/radio-portierung-analyse.md:698-703`). **Jeder Import muss ids UND Zeitstempel selbst mitbringen** |
| **Zeitstempel-Einheit** | Quelle = epoch-**Millisekunden**, Ziel = Drizzle `mode: "timestamp"` = Unix-**Sekunden** | ⚠️ **Ein Faktor-1000-Fehler ist paritaetsgruen** und loescht ueber die Retention die abgeschlossene Leihhistorie. Der Mapper normalisiert; der Schutz ist ein **Unit-Test auf der Mapping-Funktion mit je Feld UNTERSCHIEDLICHEN Fixture-Werten**. Belege: alle Schreibpfade in `radio-admin` sind ms (`docs/radio-portierung-analyse.md:102-115`), die Paritaet ist strukturell blind, weil beide Arme aus derselben Funktion ableiten (`scripts/import/portal.ts:73-76`) |
| **Retention** | 2 Monate **uebernommen**, aber **nicht** beim Boot | Betreiberantwort 4 (`docs/radio-portierung-analyse.md:1774`), betroffen < 100 Leihen — **Schaetzung, keine Zaehlung**; die Zaehlung ist Runbook-Schritt (§9.4.1, Abfrage 7). ⚠️ Ausdruecklich **nicht** in der Alt-Bauform: `radio-admin/server/src/services/retentionService.ts:47` purgt **sofort** und erst `:48` startet den Tagestimer, mit dem Quellkommentar „clears any backlog, e.g. straight after a data migration" — genau das macht den Sekunden-Fehler aus einem Anzeigefehler zu einer Loeschung |
| **`api_tokens`** | wandert nur, soweit Historie es verlangt | Produktiv genau **ein** Konsument, der Alt-Kiosk mit statischem `RADIO_ADMIN_API_TOKEN` (Betreiberantwort 3, `docs/radio-portierung-analyse.md:1773`), und der verschwindet mit dem Port. **Es gibt keinen externen Konsumenten.** Die sechs Zeilenzahlen aus §9.4.1 gelten trotzdem, weil die Tabelle in der Paritaet steht |
| **`AdminUser` (radio-inventar)** | wandert **NICHT** | Im Pocket-ID-Betrieb schreibt der OIDC-Weg nicht in die Tabelle, sondern baut die Kennung synthetisch als `` `pocketid:${userInfo.sub}` `` (`radio-inventar/apps/backend/src/modules/admin/auth/pocket-id.service.ts:134`). Die Suite fuehrt den **rohen** `sub`; der Praefix verschwindet. ⚠️ Die Tabelle wird trotzdem **gezaehlt, bevor der Postgres stirbt** (§9.4.2) — „Bestand annehmen statt zaehlen" ist der benannte Fehler aus Phase 4 |
| **Geheimnisse** | genau **EIN** neuer Wert, **frisch erzeugt**; **nichts** wird wertgleich uebernommen | ⚠️ **Radio invertiert das lagerbuch-Muster.** Dort wurde `HELFER_SESSION_SECRET` **wertgleich** aus der produktiven `stack.env` uebernommen, damit laufende Sitzungen den Cutover ueberleben (`.env.example:252-258`). Hier gibt es nichts zu erben: der heutige Zugang ist ein base64-kodierter Bearer-Token im `localStorage` (`radio-inventar/apps/frontend/src/components/features/admin/AppQRCode.tsx:11-23`), kein signiertes Cookie. Also `openssl rand -base64 32`, und ⚠️ **nicht gleich `AUTH_SECRET`** — dieselbe Signatur fuer Suite- und Modulsitzung hebt die Domaenentrennung auf, die das eigene Geheimnis begruendet (`.env.example:256-257`). Wer nach einem zu uebernehmenden Wert sucht, sucht vergeblich; das muss dastehen |
| **Health-Pfad** | `/api/health/radio` | ⚠️ **Nie `/api/health`.** `src/app/api/health/route.ts` liefert konstant `{status:"ok"}` ohne Modul, ohne Datenbank; der `[modul]`-Handler schreibt selbst aus, warum er der richtige ist (`src/app/api/health/[modul]/route.ts:11-18`). Nach dem Cutover antwortet `radio.iuk-ue.de/api/health` weiter `ok`, **ohne etwas ueber radio zu sagen**. Monitor und `docs/deployment.md` mit umstellen |
| **Health beweist weniger als der Name** | `SELECT 1` auf einer Datei, die bei Bedarf **neu angelegt** wird | `openModuleDatabase` legt das Verzeichnis per `mkdirSync(dir, {recursive:true})` an (`src/core/db/index.ts:12-22`), better-sqlite3 die Datei. **Ein vertipptes `DATA_DIR` oder ein nicht gemountetes Volume ergibt eine nagelneue, leere `radio.db` — health gruen, null Geraete.** Deshalb der **zaehlende** Check aus §9.4.3 neben dem Healthcheck, nicht statt seiner |
| **Rollback-Koernung** | **grob** | Ein Rueckzug auf ein aelteres Image nimmt portal, qr, feedback, files, lagerbuch und aufgaben mit. Der **Teilrueckzug** ist `SUITE_HOST_RADIO` leeren + Host aus `SUITE_TRAEFIK_RULE`. ⚠️ **Bei radio bedeutet dieser Handgriff etwas anderes als bei lagerbuch:** er nimmt die Domain vom Netz, und weil dort heute der Alt-Kiosk laeuft (Entscheidung 3), ist der Rueckweg **„Router zurueck" auf radio-inventar**, nicht „Domain offline". Vollstaendig in §9.3.3 |

**Zusage an das Import-Kapitel:** dieses Kapitel verlangt `scripts/import/radio.ts` **im Repo, mit
Test** — kein Handgriff am Server und kein nicht committetes Skript. Begruendung dreiteilig
(`docs/radio-portierung-analyse.md:772-774`): (i) Generalprobe und Echtimport sind **zwei** Laeufe
derselben Datei, (ii) nur ein Unit-Test auf der Mapping-Funktion faengt den Faktor-1000-Fehler — die
Paritaet kann es strukturell nicht, (iii) ein Runbook ist nicht ausfuehrbar und nicht gegenlesbar.
Heute enthaelt `scripts/import/` genau `feedback-time.ts`, `feedback.ts`, `parity.ts`, `portal.ts`.

**Zusage an das Zugangs-Kapitel:** die Env-Namen des Modulgeheimnisses und der Sitzungsdauer folgen
dem lagerbuch-Muster (`.env.example:258`, `:265`) und lauten in dieser Uebergabe
`RADIO_ZUGANG_SITZUNG_SECRET` (Pflicht, ohne Wert in `.env.example`, damit kein aus der Vorlage
mitgeschleppter Wert entsteht) und `RADIO_ZUGANG_SITZUNG_STUNDEN` (optional, Vorbelegung im Code).
Legt das Zugangs-Kapitel andere Namen fest, gelten dessen Namen und diese Zeile wird nachgezogen —
die **Anzahl** der Geheimnisse (genau eines, frisch erzeugt) ist dagegen hier gesetzt.

---

## 9.2 Was nur im Runbook stehen kann: der Redirect vom Alt-Host

### 9.2.1 Die gepruefte Antwort: `radio-admin.iuk-ue.de` gehoert **ausdruecklich NICHT** in `SUITE_TRAEFIK_RULE`

Gepruefte Lage: `compose.yaml:146-156` definiert **genau einen** Router,
``traefik.http.routers.iuk-suite.rule=${SUITE_TRAEFIK_RULE:-Host(`iuk-ue.de`)}`` (`:153`), und
`.env.example:366-369` fuehrt die Variable mit dem Erweiterungshinweis fuer einen Cutover.

Wer `radio-admin.iuk-ue.de` dort mit aufnimmt, bekommt **nicht** den Redirect, sondern den stillen
Portal-Fallback: der Host erreicht den Container, kein `SUITE_HOST_*` beansprucht ihn, und
`decideRoute` schreibt auf **portal** um — `const mod = moduleForHost(host) ?? getModule("portal")`
(`src/core/routing.ts:69`; `moduleForHost` selbst steht in `src/core/registry.ts:225`, **nicht** in
`hosts.ts`). Der Kommentar, der genau diesen Fehlfall ausschreibt, steht daneben in
`src/core/hosts.ts:52-57` („der Host fällt dann in `moduleForHost` auf das Portal zurück und die
QR-Domain zeigt stillschweigend das Portal"). Der Alt-Verwaltungshost zeigt dann das Portal: ein
funktionierender Ausdruck mit falschem Inhalt, und **kein Test des Repos sieht Traefik-Labels an**.

**Runbook-Zeile:** `SUITE_TRAEFIK_RULE` wird beim Cutover um ``|| Host(`radio.iuk-ue.de`)`` erweitert
— und **nur** darum. Der Alt-Host bleibt draussen und bekommt einen **zweiten, eigenen Router**.

⚠️ **Reihenfolge, und sie ist nicht die naheliegende:** der zweite Router wird **im selben Fenster wie
der Umschwenk** scharf, nicht vorher. Begruendung in §9.3.1, Zeile „Der Redirect vom Alt-Host trifft" —
bis zum Umschwenk liegt unter `radio.iuk-ue.de/admin` die **Verwaltung des Alt-Kiosk**
(`docs/radio-portierung-analyse.md:392-398`). Praktisch heisst das: die Labels stehen ab dem Deploy im
Image, aber `SUITE_REDIRECT_RULE_RADIO_ADMIN` bleibt bis zum Umschwenk **ungesetzt** (die Vorbelegung
`radio-admin.invalid` trifft nichts) und wird in **derselben** `.env`-Aenderung gesetzt wie
`SUITE_HOST_RADIO`.

**Zusage an das Verwaltungs-Kapitel:** dass unter `radio.iuk-ue.de/admin` nach dem Umschwenk die
**radio-admin**-Verwaltung liegt und nicht mehr die des Alt-Kiosk, ist Voraussetzung dieses Redirects.
Die Pfadkollision (Alt-Kiosk-Verwaltung mit Historie, Filtern und CSV-Export gegen
radio-admin-Verwaltung) wird dort aufgeloest, nicht hier — diese Uebergabe verlangt nur, dass sie
**vor** dem Cutover aufgeloest ist. Bleibt sie offen, ist der Redirect nicht schaltbar.

### 9.2.2 Die Label-Zeilen — Entwurf, kein erprobtes Vorbild

⚠️ **Nachgeschlagen zum Zeitpunkt des Schreibens:** `rg -n -i redirectregex compose.yaml .env.example docs/`
trifft **ausschliesslich** `docs/radio-portierung-analyse.md` (`:1654`, `:1660`, `:2105`, `:2287`) — im
Repo gibt es **kein erprobtes Vorbild**. Die folgenden Zeilen sind ein **Entwurf**, und deshalb steht
in §9.2.3 eine Verifikation daneben, die sie beweist.

```yaml
# in compose.yaml, am selben Service `app`, unter den bestehenden Labels
- traefik.http.routers.radio-admin-alt.rule=${SUITE_REDIRECT_RULE_RADIO_ADMIN:-Host(`radio-admin.invalid`)}
- traefik.http.routers.radio-admin-alt.entrypoints=web
- traefik.http.routers.radio-admin-alt.middlewares=radio-admin-alt-redirect
- traefik.http.middlewares.radio-admin-alt-redirect.redirectregex.regex=^https?://radio-admin\.iuk-ue\.de/(.*)
- traefik.http.middlewares.radio-admin-alt-redirect.redirectregex.replacement=https://radio.iuk-ue.de/admin/$${1}
- traefik.http.middlewares.radio-admin-alt-redirect.redirectregex.permanent=false
```

Fuenf Punkte, jeder mit einem Preis, wenn er fehlt:

1. **Die Middleware haengt am Router, nicht am Service.** Haengte sie am Service, traefe der Redirect
   auch die Suite selbst (`docs/radio-portierung-analyse.md:1654-1656`).
2. **`permanent=false` → 302, nie 301.** Ein 301 liegt im Cache jedes Telefons, das den Alt-Host je
   besucht hat, und macht den Rollback praktisch unmoeglich (`:1656`).
3. **`$$` gegen die Compose-Interpolation.** `$${1}` erreicht Traefik als `${1}`; ein einfaches `$`
   verschluckt Compose, und die Ersetzung liefert `/admin/` fuer **jeden** Pfad — der Redirect
   funktioniert, ist aber nicht mehr pfaderhaltend. Das ist der stille Fehlfall dieses Blocks.
4. **Pfaderhaltend heisst: `radio-admin.iuk-ue.de/geraete` → `radio.iuk-ue.de/admin/geraete`.** Die
   Alt-Verwaltung bediente ihre Oberflaeche ab `/`; das neue Praefix ist `/admin`.
5. **Die Rule kommt aus einer eigenen Variable mit unschaedlicher Vorbelegung.** `radio-admin.invalid`
   ist ein Host, den niemand aufloest — solange die Variable nicht gesetzt ist, existiert der Router,
   trifft aber nichts. Ohne Vorbelegung scheitert `docker compose config`, sobald die Variable fehlt.
   ⚠️ **Der Name ist bewusst nicht `SUITE_HOST_`-praefigiert:** `const PREFIX = "SUITE_HOST_"`
   (`src/core/hosts.ts:20`), und `validateHostConfig` bricht den Boot bei **jedem** Namen mit diesem
   Praefix ab, der zu keinem Modul-Key passt (`src/core/hosts.ts:69-76`).
   `SUITE_REDIRECT_RULE_RADIO_ADMIN` faellt nicht darunter und ist damit boot-neutral.

### 9.2.3 Der Preis: die Struktur lebt im Repo, die Konfiguration auf dem Server

Die Labels gehoeren (a) als echte, per Env parametrisierte Labels in die **Repo**-`compose.yaml` und
(b) als kommentierter Block plus Rollback-Handgriff in `.env.example` **neben** die
`SUITE_TRAEFIK_RULE`-Zeile (`:366-369`), wie `.env.example:231-239` es fuer `lagerbuch` vormacht.
Grund: `SUITE_TRAEFIK_RULE` und `SUITE_REDIRECT_RULE_RADIO_ADMIN` leben in der `.env` **auf dem
Server**, die Redirect-Labels sind dagegen **Struktur** und keine Konfiguration
(`docs/radio-portierung-analyse.md:1665-1670`).

⚠️ **Damit bleibt ein unaufloesbarer Rest: die zwei Env-Zeilen sind in keinem Repo nachlesbar.** Wer
nach dem Cutover fragt, warum der Alt-Host redirected, findet die Struktur im Repo und den Wert nur
auf dem Server. Zwei Runbook-Zeilen dagegen: (i) die gesetzten Werte beider Variablen woertlich ins
Cutover-Protokoll, (ii) `docker compose config | grep -A2 radio-admin-alt` nach dem Deploy, damit
protokolliert ist, was Traefik tatsaechlich bekommt.

⚠️ **Zu bestaetigen (Betreiberfrage):** die Behauptung, am 19.07. seien Repo- und
Server-`compose.yaml` schon einmal auseinandergelaufen, ist **im Repo nicht nachweisbar** und gehoert
als Frage gestellt, nicht als Tatsache gesetzt (`docs/radio-portierung-analyse.md:1661-1663`). Die
Aufschreibpflicht aus (b) haengt nicht daran — sie folgt schon aus „Struktur gehoert ins Repo".

**Verifikation (drei `curl`, alle NACH dem Umschwenk, alle protokollpflichtig):**

```bash
curl -si https://radio-admin.iuk-ue.de/geraete | head -5
#   erwartet: HTTP/2 302  +  location: https://radio.iuk-ue.de/admin/geraete
curl -si https://radio-admin.iuk-ue.de/       | head -5
#   erwartet: HTTP/2 302  +  location: https://radio.iuk-ue.de/admin/
curl -si https://radio.iuk-ue.de/             | head -5
#   erwartet: HTTP/2 200 — der Ziel-Host darf NICHT redirecten.
#   Ein 302 hier heisst: die Middleware haengt am Service statt am Router.
```

### 9.2.4 Der Redirect hat kein Ablaufdatum — er braucht eine benannte Bedingung

⚠️ **Der DNS-Eintrag `radio-admin.iuk-ue.de` muss BLEIBEN, solange der Redirect steht** — er ist die
Abhaengigkeit des Redirects und **kein** Abbau-Posten (`docs/radio-portierung-analyse.md:1669-1670`).
Was die Analyse offen laesst und dieses Kapitel schliesst: **wann faellt der Redirect?**

Festlegung: der Redirect steht **mindestens** bis zum Ende des Standby-Fensters (§9.5) und wird
danach abgebaut, sobald **eine** Bedingung erfuellt ist — im Traefik-Zugriffsprotokoll erscheint
ueber vier zusammenhaengende Wochen kein Treffer mehr auf `radio-admin.iuk-ue.de`. Ohne benannte
Bedingung lebt ein Redirect fuer immer, und mit ihm ein DNS-Eintrag, den niemand mehr erklaeren kann.
Der Abbau ist drei Zeilen: Labels aus `compose.yaml`, `SUITE_REDIRECT_RULE_RADIO_ADMIN` aus der `.env`,
DNS-Eintrag loeschen — **in dieser Reihenfolge**, weil der DNS-Eintrag zuletzt faellt.

---

## 9.3 Kein Parallelfenster — was das fuer Generalprobe, Verifikation und Rueckweg heisst

**Die Lage in einem Satz:** der Alt-Kiosk laeuft **bereits** unter `radio.iuk-ue.de`
(Betreiberantwort 1, `docs/radio-portierung-analyse.md:1771`), der Origin bleibt zeichengleich — und
genau deshalb koennen Alt-Kiosk und Suite denselben Host **nicht gleichzeitig** bedienen. Es gibt
**kein Parallelfenster**. Das Cutover-Muster der Suite („nie zwei Router gleichzeitig aktiv",
`CLAUDE.md:239`) ist hier keine Vorsichtsregel, sondern eine physische Grenze.

### 9.3.1 Was vorher pruefbar ist und was strukturell erst nachher

| Aussage | Vorher pruefbar? | Wie, und wenn nein: warum nicht |
|---|---|---|
| Der Import ist vollstaendig | **ja** | Sechs Zeilenzahlen + vier Invarianten gegen die Snapshot-Kopie (§9.4.1, §9.4.3), im **ephemeren Container ohne Traefik-Labels** |
| Die Ausleih-Oberflaeche rendert unter dem radio-Host | **ja** | Ephemerer Container, Host per Header vorgetaeuscht (§9.3.2) |
| `/admin` riegelt ohne Modul-Admin-Gruppe ab | **ja** | Ephemerer Container, angemeldete Negativprobe |
| `/api/health/radio` antwortet 200 mit `revision` | **ja** | Ephemerer Container; `src/app/api/health/[modul]/route.ts` liefert `revision` aus `laufendeRevision()` — der einzige Beleg, dass wirklich der neue Stand antwortet |
| Der Redirect vom Alt-Host trifft | ⚠️ **nein — und er darf vorher nicht scharf sein** | ⚠️ **Die naheliegende Reihenfolge ist falsch.** Der Redirect zeigt auf `radio.iuk-ue.de/admin`, und bis zum Umschwenk liegt dort die **eigene Verwaltungsoberflaeche des Alt-Kiosk**: `login.tsx`, `index.tsx`, `history.tsx` (Filter, Seitenblaetterung, CSV-Export), `devices.tsx`, `settings.tsx` plus eigene API-Schicht (`docs/radio-portierung-analyse.md:392-398`). Ein frueh geschalteter Redirect fuehrt jeden Verwaltenden aus einer funktionierenden Alt-Verwaltung in die **Verwaltung einer anderen Anwendung** — schlechter als nichts zu tun. **Der Redirect wird im selben Fenster wie der Umschwenk scharf, nie davor**, und die drei `curl` aus §9.2.3 laufen **danach**. Es gibt auch hier kein Parallelfenster |
| **Der Login-Rueckweg landet wieder auf `radio.iuk-ue.de/admin`** | ⚠️ **nein** | Die Allowlist in `src/core/auth/redirect.ts` erkennt einen Modul-Host ueber genau `SUITE_HOST_RADIO`; fehlt der Wert, wirft Auth.js den Nutzer nach dem Login aufs Portal, **ohne Fehler und ohne Meldung**, und „Ein curl sieht davon nichts" (`src/core/hosts.ts:59-63`, woertlich). Der Test braucht einen echten Browser auf dem echten Host — und den haelt bis zum Umschwenk der Alt-Kiosk |
| Der alte Service Worker liefert keine Altantworten mehr | ⚠️ **nein** | Er liegt nach dem Umschwenk unter derselben Adresse (§9.3.4) |
| Die gedruckten/gescannten QR-Wege funktionieren | ⚠️ **nein** | Braucht die echte Endadresse ueber HTTPS. Vorbild derselben Einschraenkung: `docs/runbooks/lagerbuch-cutover.md:290` („Die Generalprobe MUSS ueber HTTPS laufen — sonst sind die Kamerawege ungeprueft") |

**Die Konsequenz, ausgeschrieben:** drei Aussagen sind vor dem Umschwenk nicht beweisbar. Dafuer gibt
es genau zwei ehrliche Wege, und Spec 2 waehlt einen davon **vor** dem Cutover-Abend, nicht an ihm:

- **Weg A — temporaerer Host.** `SUITE_HOST_RADIO=radio-neu.iuk-ue.de` als **echter** Wert plus
  passender `SUITE_TRAEFIK_RULE`-Eintrag. Weil die Variable diesen Host dann wirklich beansprucht
  (`src/core/hosts.ts:39-46`), loest `moduleForHost` dort `radio` auf, der Login-Rueckweg ist
  vollstaendig pruefbar, und `/m/radio` auf dem Portal-Host wird gar nicht angefasst — **Falle 61 ist
  damit bauartbedingt vermieden, nicht durch Disziplin**
  (`docs/radio-portierung-analyse.md:1856-1861`). Preis: ein zweiter DNS-Eintrag und ein zweiter
  Umschwenk, denn der Wert muss am Cutover-Abend auf `radio.iuk-ue.de` wechseln. ⚠️ Beim Wechsel gilt
  **dieselbe** Pruefung noch einmal — der Rueckweg haengt am Wert, nicht am Code.
- **Weg B — Nachpruefung als erster Schritt nach dem Umschwenk**, mit `SUITE_HOST_RADIO=` leeren als
  benanntem Rueckweg und einer namentlich benannten Person, die die Anmeldung durchfuehrt, **bevor**
  der Kiosk als freigegeben gilt.

**Empfehlung: Weg A.** Der Login-Rueckweg ist die einzige Pruefung, deren Fehlfall **stumm** ist, und
ein stummer Fehlfall gehoert nicht in ein Fenster ohne Parallelbetrieb.

### 9.3.2 Der ephemere Container ist hier nicht Kuer, sondern der einzige Weg

Das Cutover-Muster der Suite sieht ihn ohnehin vor (`CLAUDE.md:238-239`: „Verifikation gegen einen
ephemeren Container ohne Traefik-Labels"). Bei radio ist er **nicht** eine von mehreren
Pruefgelegenheiten, sondern die einzige vor dem Umschwenk — weil die Endadresse besetzt ist.

Zwei Handgriffe, die dabei leicht fehlen:

1. **Der Host muss vorgetaeuscht werden.** Der Container haengt an keinem Router; erreicht wird er
   ueber IP und Port. Ohne den Header laeuft jede Anfrage auf den Portal-Fallback und **prueft radio
   ueberhaupt nicht**:
   ```bash
   curl -si -H 'Host: radio.iuk-ue.de' http://127.0.0.1:<port>/          | head -3   # Ausleihe, 200
   curl -si -H 'Host: radio.iuk-ue.de' http://127.0.0.1:<port>/admin     | head -3   # Riegel greift
   curl -s  -H 'Host: radio.iuk-ue.de' http://127.0.0.1:<port>/api/health/radio
   ```
2. **`SUITE_SEED` bleibt aus, oder der Seed ist beweisbar harmlos.** `shouldSeed()` ist
   `SUITE_SEED === "1" || NODE_ENV === "development"` (`CLAUDE.md:180-182`) — `SUITE_SEED=1` ist der
   **Generalproben**-Schalter, nicht der Lokalschalter. ⚠️ **Bei radio ist das schaerfer als bei jedem
   bisherigen Modul:** ein geseedeter Zugangscode waere in der Generalprobe ein **gueltiger anonymer
   Zugang** zum gesamten Bestand samt Ausleihernamen. **Zusage an das Zugangs-Kapitel:** `seedLokal`
   legt Geraete und Stammdaten an und **niemals** eine einloesbare Zugangszeile; die Zugangstabelle
   bleibt beim Seed leer.

### 9.3.3 Der Rueckweg ist „Router zurueck" — und er kostet Daten

Rollback ist ein **Routing**-Vorgang: `SUITE_HOST_RADIO=` leeren (leer, nicht geloescht) und
`radio.iuk-ue.de` aus `SUITE_TRAEFIK_RULE` nehmen. ⚠️ **Bei radio bedeutet dieser Handgriff etwas
anderes als bei lagerbuch.** Dort nahm er die Domain vom Netz
(`docs/runbooks/lagerbuch-cutover.md:420`). Hier ist der Alt-Kiosk der **Rueckfall**, weil er
`radio.iuk-ue.de` bis zum Umschwenk bedient hat — der Rueckweg ist damit vollstaendig nur mit einem
dritten Handgriff: **radio-inventar wieder ansprechen lassen**.

⚠️ **Damit ist eine Aussage der Analyse ueberholt:** `docs/radio-portierung-analyse.md:633-635`
schliesst „der KIOSK ist danach offline … weil `radio.iuk-ue.de` dort nie bedient wurde". Das gilt
fuer radio-**admin** und ist fuer den **Kiosk** durch Betreiberantwort 1 (`:1771`) widerlegt.
Ebenso ueberholt: `:814-816` erklaert den radio-inventar-Stack samt Postgres und Images fuer „sofort
weg" — geschrieben, als Frage 1 noch offen war. **Solange das Standby-Fenster laeuft, ist
radio-inventar das Rollback-Ziel und darf nicht abgebaut werden**, und sein Postgres-Volume geht mit
ihm (`radio-inventar/docker-compose.yml:42-44`: der Backend-Service haengt per
`depends_on: postgres: condition: service_healthy`).

**Was der Rollback nicht zurueckholt.** Es gibt **keinen** Rueckweg-Importer (Suite → radio-admin) und
kein Vorbild dafuer (`docs/radio-portierung-analyse.md:626-628`). Jede Ausleihe und jede Rueckgabe,
die nach dem Umschwenk in `radio.db` landet, steht in einer SQLite-Datei, die die Alt-Apps nie lesen.
Festlegung fuer Spec 2, damit das nicht um 22 Uhr entschieden wird:

1. **Point of no return: der erste fachliche Schreibvorgang in `radio.db`** — die erste Ausleihe oder
   Rueckgabe nach dem Umschwenk. Ab da ist der Rollback ein **Datenverlust mit bekanntem Umfang**,
   nicht mehr eine Routing-Ruecknahme.
2. **Frist: Rollback ohne Nachtrag nur innerhalb der ersten Stunde nach dem Umschwenk**, und in dieser
   Stunde bleibt der Kiosk unter Beobachtung. Danach nur noch vorwaerts.
3. **Der Nachtrag ist ausgeschrieben, nicht improvisiert.** Wird in der Frist zurueckgezogen, liefert
   ein `sqlite3`-Auszug die Liste, die von Hand in die Alt-App nachgetragen wird:
   ```bash
   sqlite3 "$DATA_DIR/radio.db" \
     "select id, device_id, borrower_name, borrowed_at, returned_at, return_note
        from loans where created_at >= <umschwenk_epoch_sekunden> order by created_at;"
   ```
   ⚠️ Die Zeitstempel stehen hier in **Sekunden**, die Alt-App erwartet **Millisekunden** — beim
   Nachtragen mit 1000 multiplizieren. Derselbe Faktor, andere Richtung.

### 9.3.4 ⚠️ Die Koppelung, die das Standby-Fenster wertlos machen kann

Ein Rollback (oder auch nur ein Nachschlagen) bootet den Alt-Stack — und **jeder Start von
radio-admin loescht Historie**: `radio-admin/server/src/index.ts:35` ruft `startRetentionSchedule`,
`radio-admin/server/src/services/retentionService.ts:47` fuehrt `purge()` **sofort** aus, erst `:48`
folgt der Tagestimer. Der Cutoff haengt an der **Wanduhr** (`now` minus zwei Monate, `:9`, `:19`),
nicht am Cutover-Zeitpunkt — **jeder weitere Start loescht mehr als der vorige**. Wer den Stack in
Woche zwei hochfaehrt, um gegen die Historie zu pruefen, verliert zwei weitere Wochen genau dieser
Historie (`docs/radio-portierung-analyse.md:823-837`).

*Kein Gate:* das ist ein **erfolgreicher** Start mit einer Protokollzeile
(`retentionService.ts:41`, `[retention] purged N expired loan(s)`) — kein Fehler, kein roter Test.

**Drei Runbook-Zeilen, ohne die das Standby-Fenster nichts wert ist:**

1. **Vor** dem Cutover-Abend, nicht wenn man es braucht: `HISTORY_RETENTION_MONTHS` in der
   Standby-Umgebung neutralisieren **oder** das Volume kopieren. Danach ist es zu spaet — der erste
   Start hat dann schon geloescht.
2. Jede feldweise Nachpruefung laeuft per `sqlite3` gegen die **Snapshot-Kopie** des Volumes,
   **nie** gegen einen gebooteten Alt-Stack.
3. Muss die Alt-App doch laufen (Rollback, Oberflaechenvergleich), gilt Zeile 1 als erfuellt
   nachgewiesen — sonst wird der Start abgesagt.

### 9.3.5 Der alte Service Worker liegt nach dem Umschwenk unter derselben Adresse

Weil der Origin zeichengleich bleibt, ueberlebt die Service-Worker-Registrierung des Alt-Kiosk den
Umschwenk und kann alte Antworten aus ihrem Cache ausliefern, **waehrend die Suite darunter schon
antwortet** (`docs/radio-portierung-analyse.md:1716-1721`). Der Kiosk bringt dafuer die volle
PWA-Maschinerie mit (`radio-inventar/apps/frontend/src/components/pwa/` mit `PWAInstallBanner.tsx`,
`PWAOfflineIndicator.tsx`, `PWAUpdateNotification.tsx`).

*Kein Gate:* HTTP 200 mit veraltetem Inhalt. Kein Build, kein Test, kein Healthcheck sieht das.

**Zwei Runbook-Posten:**

1. **Ein Ersatz-Service-Worker unter der Endadresse, der `self.registration.unregister()` ruft** —
   die Bauform gehoert dem PWA-Kapitel; hier steht die **Pflicht**, dass es einen gibt.
   **Zusage an das PWA-/Oberflaechen-Kapitel:** Manifest, Service Worker und Icons entstehen als
   Route Handler **unter** `src/app/m/radio/`, **nie global** — ein Manifest an der Wurzel bewuerbe
   jeden Suite-Host als radio-PWA, also auch `iuk-ue.de` und `lagerbuch.iuk-ue.de`: alle Suite-Hosts
   haengen an **einem** Traefik-Router auf **einem** Container (`compose.yaml:146-155`, Rule in `:153`).
   **Die Pruefzeile dafuer ist im Haus schon formuliert** und wird fuer `radio` zeichengleich
   uebernommen — `docs/runbooks/lagerbuch-cutover.md:436` (R36, Falle 56 der lagerbuch-Zaehlung):
   `curl -si https://<portal-host>/manifest.webmanifest` darf das radio-Manifest **nicht** liefern.
2. **Fuer Geraete, die den alten Kiosk installiert haben: einmal Speicher loeschen.** Wie viele
   Geraete das sind, ist **im Repo nicht abzaehlbar** — der Token liegt im `localStorage`, es gibt
   keine Tabelle, die die Geraete kennt; die Antwort ist eine **Begehung, kein `SELECT`**
   (`docs/radio-portierung-analyse.md:1969-1971`). ⚠️ **Zu bestaetigen (Betreiberfrage):** wie viele
   Geraete tragen heute den geteilten Token im Browser? Die Zahl bemisst, wie lange nach dem
   Umschwenk noch Altantworten im Umlauf sein koennen.

---

## 9.4 Die Zaehlungen vor dem Abbau

**Warum das keine Formalie ist.** Der Abbau ist **unumkehrbar**, und „Bestand annehmen statt zaehlen"
ist der namentlich benannte Fehler der Phase 4 (§A-Lehre). Dazu die strukturelle Blindheit des
Paritaetschecks: er beweist den Datenbank-**Rundlauf**, nicht die **Feldzuordnung** — ein konsistenter
Zuordnungsfehler ist paritaetsgruen (`CLAUDE.md:241-243`, `scripts/import/parity.ts:43-56`).

⚠️ **Die lokalen Kopien im Repo beantworten nichts.** `radio-admin/data/data.sqlite` ist **leer** und
**vorbaselinig**: `.tables` zeigt nur `__drizzle_migrations`, `device_events`, `devices`,
`software_versions` — `loans`, `api_tokens` und `users` **fehlen ganz**
(`docs/radio-portierung-analyse.md:1865-1872`). Jede Zahl unten kommt aus dem **Prod-Dump**, nicht
aus dem Repo.

### 9.4.1 radio-admin: SQLite unter `/data/data.sqlite`

Quelle: `radio-admin/docker-compose.yml` setzt `DATABASE_PATH=/data/data.sqlite` auf dem Volume, das
dort als `radio-data` **deklariert** ist. Der Auszug entsteht **einmal** als Snapshot-Kopie, und alle
Abfragen laufen gegen die Kopie, nie gegen einen laufenden Stack (§9.3.4, Zeile 2):

```bash
docker compose -f radio-admin/docker-compose.yml stop app

# ⚠️ ZUERST den ECHTEN Volume-Namen ermitteln und ins Protokoll schreiben.
docker volume ls | grep -i radio-data
#   -> compose praefixt deklarierte Volumes mit dem PROJEKTNAMEN, z. B.
#      `radio-admin_radio-data`. Ein `-v radio-data:/d` legt sonst ein NEUES,
#      LEERES Volume an, und der `cp` scheitert an einer fehlenden Datei —
#      laut, aber ein verbrannter Schritt im Cutover-Fenster.

VOL=<die Zeile aus dem Befehl oben>
docker run --rm -v "$VOL":/d -v "$PWD":/out alpine \
  sh -c 'cp /d/data.sqlite /out/radio-admin-snapshot.sqlite'
```

**Die sechs Paritaets-Sollwerte** (`docs/radio-portierung-analyse.md:752-753`):

```sql
select 'devices',           count(*) from devices
union all select 'software_versions', count(*) from software_versions
union all select 'api_tokens',        count(*) from api_tokens
union all select 'users',             count(*) from users
union all select 'device_events',     count(*) from device_events
union all select 'loans',             count(*) from loans;
```

**Die vier Invarianten-Zaehlungen** — jede mit der Folge, wenn sie ueberrascht:

```sql
-- 1) MUSS genau 1 sein.
select count(*) from software_versions where is_target = 1;
```
Der Update-Stand ist **berechnet, nicht gespeichert** (`radio-admin/server/src/db/schema.ts:53-56`).
Bei 0 oder 2 kippt der angezeigte Status **jedes** Geraets, und keine Paritaet sieht es. Weicht die
Zahl ab, wird sie **vor** dem Import in der Kopie bereinigt und die Bereinigung protokolliert.

```sql
-- 2) MUSS 0 sein — sonst scheitert der Import an der FK-Kante.
select count(*) from device_events e
  left join devices d on d.id = e.device_id
 where d.id is null;
```
`foreign_keys = ON` gilt auf beiden Seiten (`radio-admin/server/src/db/index.ts:28`,
`src/core/db/index.ts:19`). Ein Treffer heisst: der Import bricht hart ab — besser jetzt als im
Cutover-Fenster.

```sql
-- 3) MUSS leer sein — sonst laesst sich der partielle Aktiv-Index im Ziel nicht anlegen.
select device_id, count(*) from loans
 where returned_at is null group by device_id having count(*) > 1;
```

```sql
-- 4) MUSS leer sein — `device_events.source` ist ein TS-Enum OHNE DB-CHECK.
select distinct source from device_events
 where source not in ('manual','csv-import','create','update-note');
```
Das Enum steht nur im Quelltext (`radio-admin/server/src/db/schema.ts:96`); die Altdaten koennen
Werte tragen, die es nicht kennt. **Pruefen, nicht annehmen.**

**Drei Abfragen, die keine Invariante pruefen, sondern eine Entscheidung belegen:**

```sql
-- 5) Zeitstempel-Groessenordnung: DREIZEHNSTELLIG = Millisekunden.
select min(created_at), max(created_at), length(cast(max(created_at) as text)) from devices;
```
Das ist der empirische Beweis fuer die Uebergabe-Zeile „Zeitstempel-Einheit" und damit fuer den
Mapping-Unit-Test. Kaeme hier **zehn**stellig heraus, ist die gesamte Import-Annahme falsch und der
Cutover wird abgesagt, nicht angepasst.

```sql
-- 6) Traegt die Prod-DB von Hand angelegte Trigger oder Views?
select type, name, sql from sqlite_master where type in ('trigger','view');
```
Der Grep-Beleg der Analyse gilt fuer den **Quelltext**, nicht fuer die laufende Datenbank
(`docs/radio-portierung-analyse.md:2038-2040`). Ein Treffer ist Fachlogik, die kein Repo kennt.

```sql
-- 7) Die Retention-Zahl, die der Betreiber geschaetzt hat (< 100).
select count(*) from loans
 where returned_at is not null
   and returned_at < (strftime('%s','now','-2 months') * 1000);
```
⚠️ **Der Faktor 1000 steht hier absichtlich im SQL**: die Alt-Spalte ist in Millisekunden,
`strftime('%s')` liefert Sekunden. Wer ihn weglaesst, zaehlt **alle** zurueckgegebenen Leihen und
haelt das fuer eine bestaetigte Schaetzung. Diese Zahl ersetzt die Betreiber-Schaetzung („< 100",
`docs/radio-portierung-analyse.md:1774`) durch eine Zaehlung — und sie ist gleichzeitig die Zahl, die
der Import **nicht** verlieren darf.

```sql
-- 8) Steht `dev-user` in der Prod-DB? (Falle 15)
select sub from users;
select distinct created_by from devices;
```
Ein `dev-user` unter den Audit-Spalten heisst: `AUTH_DEV_BYPASS` war irgendwann aktiv, und die
Zuordnung von Journalzeilen zu Personen ist an diesen Stellen keine.

### 9.4.2 radio-inventar: Postgres

Zugang aus `radio-inventar/docker-compose.yml`: Container `radio-inventar-db` (`:5`), Nutzer
`${POSTGRES_USER:-radio}` (`:7`), Datenbank `radio_inventar` (`:10`), deklariertes Volume
`postgres_data` (`:12`).

⚠️ **Zwei Werte davon sind Vorbelegungen, keine Tatsachen** — dieselbe Einschraenkung wie in U4
(§9.5.1): `POSTGRES_USER` traegt nur einen `:-radio`-Default, und der Volume-Name bekommt vom
Projektnamen ein Praefix (typisch `radio-inventar_postgres_data`). Beide **vor** dem ersten Befehl
ablesen und ins Protokoll schreiben:

```bash
docker compose -f radio-inventar/docker-compose.yml exec -T postgres printenv POSTGRES_USER
docker volume ls | grep -i postgres_data
```
Nur `POSTGRES_DB: radio_inventar` ist im Compose **hart** gesetzt und darf uebernommen werden.

⚠️ **Die Anfuehrungszeichen sind tragend.** Prisma legt die Tabellen in gemischter
Gross-/Kleinschreibung an; Postgres braucht dafuer doppelte Anfuehrungszeichen im SQL. Deshalb steht
das SQL in **einfachen** Anfuehrungszeichen — ein `-c "…"` mit doppelten aussen zerstoert die inneren
und die Abfrage scheitert an einer nicht existierenden Relation `adminuser`.

```bash
PG="docker compose -f radio-inventar/docker-compose.yml exec -T postgres psql -U ${POSTGRES_USER:-radio} -d radio_inventar -c"
```

```sql
-- 1) Grundwahrheit statt Ableitung: welche Tabellen existieren wirklich?
select tablename from pg_tables where schemaname = 'public' order by 1;
```
Abgeleitet erwartet: `AdminUser`, `_prisma_migrations`, evtl. `session`
(`docs/radio-portierung-analyse.md:2048-2052`). ⚠️ **Der Tabellenbestand war bisher aus fuenf
Migrationsdateien plus einer handgepflegten `create-session-table.sql` ABGELEITET, nicht gezaehlt.**
Liefert `pg_tables` mehr, ist **jede** zusaetzliche Tabelle per `select count(*)` zu zaehlen und die
Abbau-Liste zu erweitern.

```sql
-- 2) Liegt noch Bestand? Erwartet: NULL, NULL.
select to_regclass('public."Loan"') as loan, to_regclass('public."Device"') as device;
```
**Ein Nicht-NULL blockiert den Abbau.** Es bedeutet, dass die Drop-Migrationen in Prod nie gelaufen
sind — dann liegt dort Bestand, den niemand eingeplant hat, und die Import-Spec braucht einen zweiten
Zweig. Ergaenzend `select count(*) from "_prisma_migrations" where finished_at is not null;` —
**erwartet 5**; ein niedrigerer Wert heisst, Prod haengt hinter dem eingefrorenen Stand `f883ec4`.

```sql
-- 3) AdminUser: wandert nicht, wird aber gezaehlt.
select count(*) from "AdminUser";
select username, "createdAt", "updatedAt" from "AdminUser";
```
Die Zeile „`AdminUser` wandert NICHT" ist eine **Entscheidung**, keine Messung, und diese Zaehlung
dokumentiert, **was verworfen wird**. Ein Ergebnis > 0 heisst: es gab lokale Passwort-Identitaeten,
und ihr Verlust ist **vor** dem Loeschen des Volumes ausdruecklich zur Kenntnis zu nehmen — nicht
danach zu entdecken. `updatedAt > createdAt` beantwortet zusaetzlich ohne Konfigurationszugriff, ob
die Zugangsdaten je geaendert wurden, also ob der Nutzer in Benutzung war
(`docs/radio-portierung-analyse.md:2056-2059`). Die Entscheidung selbst bleibt unberuehrt: im
Pocket-ID-Betrieb baut der OIDC-Weg die Kennung synthetisch als `` `pocketid:${sub}` ``
(`radio-inventar/apps/backend/src/modules/admin/auth/pocket-id.service.ts:134`) und schreibt gar
nicht in die Tabelle.

```sql
-- 4) Existiert `session` ueberhaupt, und liegen dort Zeilen?
select count(*) from "session";
select count(*) from "session" where expire > now();
select sess from "session" where expire > now() limit 5;
```
Nach Codelage ist die Tabelle **nie angelegt** worden — die Abfrage prueft genau das. Existiert sie
doch, zeigt `sess`, ob dort `provider: 'local'` oder `'pocketid'` steht
(`docs/radio-portierung-analyse.md:2060-2064`). Ein `'local'` mit lebenden Sitzungen heisst: jemand
arbeitet heute mit einem Passwort-Login, den der Port ersatzlos streicht — das ist eine Ankuendigung
an eine namentlich bekannte Person, kein technischer Posten.

```sql
-- 5) Zeilenzahlen aller Tabellen auf einen Blick, fuer das Protokoll.
select relname, n_live_tup from pg_stat_user_tables order by n_live_tup desc;
```

```bash
# 6) Der Archiv-Dump. Erst danach darf das Volume fallen.
docker compose -f radio-inventar/docker-compose.yml exec -T postgres \
  pg_dump -U "${POSTGRES_USER:-radio}" -d radio_inventar --format=custom \
  > radio-inventar-final-$(date +%Y%m%dT%H%M%S).dump
```
⚠️ **Zu bestaetigen (Messung, nicht Betreiberfrage):** Groesse des Prod-Volumes und Dauer eines
`pg_dump` bzw. `sqlite3 .backup` sind nicht gemessen — sie bemessen das Cutover-Fenster
(`docs/radio-portierung-analyse.md:2212-2213`). Beide Zahlen entstehen bei der **Generalprobe**, nicht
am Cutover-Abend.

### 9.4.3 Nach dem Import: der zaehlende Check, der `status:"ok"` ersetzt

`/api/health/radio` waere gegen eine **frisch angelegte, leere** `radio.db` gruen (§9.1,
Zeile „Health beweist weniger als der Name"). Die Freigabe braucht daneben:

```bash
for t in devices software_versions api_tokens users device_events loans; do
  printf '%s\t' "$t"
  sqlite3 "$DATA_DIR/radio.db" "select count(*) from $t;"
done
```

Die sechs Zahlen muessen den sechs Sollwerten aus §9.4.1 entsprechen — **paarweise, nicht in der
Summe**. Dazu die **feldweisen Stichproben**, weil die Paritaet die Zuordnung nicht sieht: die vier
Paare, die sich verwechseln lassen, sind namentlich benannt (`docs/radio-portierung-analyse.md:743-747`)
— `issi` ↔ `tei` · `created_at` ↔ `updated_at` ↔ `last_updated_at` · `snapshot_call_sign` ↔
`borrower_name` · `alamos_integrated` ↔ `loanable` (zwei 0/1-Integer, die niemandem auffallen), dazu
`serial_number` ↔ `hiorg_id` ↔ `opta`. **Je Paar eine Zeile, zeilengenau gegen die Snapshot-Kopie.**

Und die Retention-Gegenprobe: die Zahl aus §9.4.1 Abfrage 7 muss **nach** dem Import in `radio.db`
wiederzufinden sein (in Sekunden gerechnet). Fehlt sie, hat der Faktor-1000-Fehler zugeschlagen — und
zwar an der einzigen Stelle, an der er nicht paritaetsgruen bleibt.

---

## 9.5 Der Abbau

### 9.5.1 Was bleiben muss und was sofort weg kann

⚠️ **Diese Tabelle korrigiert `docs/radio-portierung-analyse.md:814-816`.** Dort steht, der
radio-inventar-Stack samt Postgres und Images koenne „sofort weg" — geschrieben, als Kapitel 6,
Frage 1 noch offen war. Unter Entscheidung 3 ist radio-inventar der **Rollback-Traeger** und bleibt
im Standby.

| Posten | Bis wann | Bedingung fuer den Abbau |
|---|---|---|
| **radio-inventar-Stack** (`radio-inventar-backend`) | **Standby**, 2 Wochen | Gestoppt, Traefik-Anbindung entfernt, Image behalten. Er ist der Rueckweg fuer `radio.iuk-ue.de` (§9.3.3) |
| **radio-inventar-Postgres** (`radio-inventar-db`) + Volume `postgres_data` (⚠️ **deklarierter** Name; der echte traegt das Projekt-Praefix, §9.4.2) | **Standby**, 2 Wochen | Gestoppt, Volume erhalten — der Backend haengt per `depends_on: condition: service_healthy` daran (`radio-inventar/docker-compose.yml:42-44`), ein Rollback ohne ihn startet nicht. Abbau **erst** nach dem Archiv-`pg_dump` (§9.4.2 Nr. 6) und **erst**, nachdem §9.4.2 Nr. 1–5 protokolliert sind |
| **radio-admin-Stack** (`app`, Image `radio-admin:local`) + Volume `radio-data` (⚠️ **deklarierter** Name; der echte traegt das Projekt-Praefix, §9.4.1) | **Standby**, 2 Wochen | Gestoppt, Volume erhalten — einzige Quelle fuer Re-Import und feldweise Nachpruefung. ⚠️ **Vor** dem Cutover-Abend die Retention neutralisieren oder das Volume kopieren (§9.3.4, Zeile 1); ein Start ohne diesen Schritt zerstoert genau die Quelle, fuer die der Stack steht |
| **Snapshot-Kopie** `radio-admin-snapshot.sqlite` + Postgres-Dump | **Archiv**, dauerhaft | Nicht auf demselben Server wie die Suite; sie sind der Rest, der den Volumes ueberlebt |
| **Traefik-Anbindung radio-inventar** | **sofort** beim Umschwenk | Sie muss weg, sonst halten zwei Router `radio.iuk-ue.de` (`CLAUDE.md:239`) |
| **DNS `radio.iuk-ue.de`** | **bleibt**, unveraendert | Zeigt vor und nach dem Cutover auf denselben Edge; nichts zu tun. Genau das ist der Grund, warum es kein Parallelfenster gibt |
| **DNS `radio-admin.iuk-ue.de`** | **bleibt**, solange der Redirect steht | **Kein** Abbau-Posten (`docs/radio-portierung-analyse.md:1669-1670`). Ende benannt in §9.2.4 |
| **Redirect-Router + `SUITE_REDIRECT_RULE_RADIO_ADMIN`** | nach der Bedingung aus §9.2.4 | Vier Wochen ohne Treffer im Zugriffsprotokoll |
| **Images** (`radio-admin:local`, `ghcr.io/rubenvitt/radio-inventar/radio-inventar-backend`) | **Standby**, 2 Wochen | Ohne Image ist der Rollback kein Handgriff, sondern ein Build |
| **Alte `.env`-Dateien beider Stacks** | **sofort** nach dem Standby-Ende, mit dem Volume | §9.5.2 — der Posten, der liegen bleibt |
| **Repos `radio-admin`, `radio-inventar`** | archivieren, nicht loeschen | GitHub-Archivierung (read-only) mit den Freeze-SHAs `265abd5` bzw. `f883ec4` im Archivierungshinweis. Sie sind die Belegquelle jeder `datei:zeile` dieser Spec; ein geloeschtes Repo macht die gesamte Spec unnachpruefbar |
| **`radio-inventar`-Frontend-Auslieferung** | ⚠️ **zu bestaetigen** | `radio-inventar/docker-compose.yml` fuehrt **nur** `postgres` und `backend` (letzterer hinter `profiles: ["full-app"]`, `:27`) — **es gibt keinen Frontend-Service**. Wo und wie das Kiosk-Frontend produktiv ausgeliefert wird, ist aus dem eingefrorenen Repo **nicht belegbar**; dasselbe gilt fuer die Herkunft von `API_TOKEN`, das `apps/backend/src/config/env.config.ts:11` mit mindestens 32 Zeichen **ohne Default** verlangt und das in der eingecheckten Compose-Datei **nicht vorkommt**. **Die eingecheckte Compose-Datei ist nicht der Produktionsweg** (`docs/radio-portierung-analyse.md:1880-1886`). Ohne diese Auskunft ist die Abbau-Liste unvollstaendig — sie ist **vor** dem Cutover einzuholen, nicht danach |

### 9.5.2 Geheimnisse — der Posten, der liegen bleibt

⚠️ **Hier weicht dieses Kapitel bewusst von `docs/radio-portierung-analyse.md:839-843` ab.** Dort
steht, die uebernommenen Geheimnisse lebten nach dem Cutover „doppelt auf demselben Server". Das
trifft fuer `radio` **nicht** zu, weil **nichts** uebernommen wird (§9.1, Zeile „Geheimnisse"). Der
Befund wird dadurch nicht schwaecher, sondern staerker: die alten Werte bleiben **gueltig** in Dateien,
die niemand mehr pflegt und die kein Repo kennt — ein verwaister, aber funktionierender
Vollzugriffs-Token braucht kein Duplikat, um gefaehrlich zu sein. Deshalb steht das Loeschen als
**Zeile** hier und nicht als Absicht.

**Zu loeschen, namentlich** (aus `radio-admin/.env.example`, gelesen zum Zeitpunkt des Schreibens):

| Datei | Werte |
|---|---|
| radio-admin `.env` | `SESSION_SECRET` · `OIDC_CLIENT_ID` · `OIDC_CLIENT_SECRET` · `OIDC_ISSUER` · `OIDC_REDIRECT_URI` · `OIDC_ADMIN_GROUP` · `OIDC_UPDATER_GROUP` · `LOAN_API_EXPECTED_AUDIENCE` · `LOAN_API_EXPECTED_SUBJECT` · `AUTH_DEV_BYPASS`/`DEV_USER_*` |
| radio-inventar Produktionsumgebung | `API_TOKEN` (der geteilte Kiosk-Token) · `SESSION_SECRET` · `POSTGRES_PASSWORD` · `POCKET_ID_CLIENT_SECRET` und die drei uebrigen `POCKET_ID_*` (`radio-inventar/apps/backend/src/config/env.config.ts:12-15`) |

⚠️ **`API_TOKEN` braucht eine eigene Zeile:** er ist Pflichtwert (`env.config.ts:11`), steht aber
**nicht** in der eingecheckten Compose-Datei. Der Handgriff lautet daher „finden, wo Produktion ihn
setzt — dann dort loeschen", nicht „aus der Compose-Datei entfernen". Solange er irgendwo lebt, lebt
ein Vollzugriff auf den alten Bestand.

⚠️ **Der Posten, den die Analyse-Liste nicht nennt: zwei OIDC-Client-Registrierungen in Pocket ID.**
radio-admin ist ein eigener OIDC-Client (`OIDC_CLIENT_ID`/`OIDC_CLIENT_SECRET`,
`radio-admin/server/src/auth/auth-service.ts:26-48`), radio-inventar ein zweiter
(`POCKET_ID_CLIENT_ID`/`POCKET_ID_CLIENT_SECRET`). Beide tragen lebende Secrets und `redirect_uri`s
auf Hosts, die verschwinden. Ob sie geloescht oder aufbewahrt werden, entscheidet der Betreiber —
**die Zeile muss existieren**, sonst bleiben zwei gueltige Clients mit toten Rueckadressen stehen.

### 9.5.3 Was der Abbau nicht anfasst

`scripts/backup.sh` braucht **keine** Aenderung: es sammelt `"$DATA_DIR"/*.db` per nullglob (`:25-27`)
und sichert jede Datei per `sqlite3 .backup` (`:41-43`) — `radio.db` faellt automatisch hinein. ⚠️ Der
Kiosk-Postgres fiel umgekehrt automatisch **heraus**: das Skript kennt nur `*.db` und `BLOB_DIR`
(`:19-21`). **Solange der Alt-Kiosk laeuft, haengt sein Volume an keiner Sicherung, die dieses Repo
kennt** — genau deshalb ist der `pg_dump` aus §9.4.2 Nr. 6 kein Nice-to-have, sondern die einzige
Sicherung, die dieses Volume je hatte.

---

## 9.6 Die Ankuendigung an die Nutzer

**Es sind zwei Aenderungen, also zwei Notizen.** `CLAUDE.md:226-227` verbietet, sie
zusammenzulegen — „Zwei Aufforderungen heissen: es sind zwei Aenderungen, also zwei Notizen", und
`register.test.ts` erzwingt es.

**Form, verbindlich** (`CLAUDE.md:197-203`): je eine Datei
`src/app/m/portal/_lib/neuigkeiten/notizen/radio/<YYYY-MM-DD>-<slug>.ts` **plus** je eine Zeile in
`register.ts`. Das Dreieck ist Dateiname ↔ Felder (`modul`, `datum`, `slug`) ↔ Registerzeile;
`datum` ist der Tag des **Rollouts**, nicht des Commits. Sichtbar ausschliesslich im Portal unter
`/neuigkeiten`. Kein Markdown im Text, keine Werbewoerter, kein Dateiname, Du-Form, Praesens.

**Notiz 1 — fuer alle, die per QR-Code ausleihen.** Ein gescannter Code fuehrt kuenftig in eine
**zeitlich begrenzte** Sitzung statt in einen dauerhaften Zugang. Der entscheidende Satz fuer die
Betroffenen: **der Code hoert nicht auf zu funktionieren — die Sitzung laeuft ab.** Wer nach Ablauf
weiterarbeiten will, scannt erneut. Was gleich bleibt, gehoert ausdruecklich hinein
(`CLAUDE.md:228-229`): **die Ausleihe bleibt anonym**, es wird keine Anmeldung verlangt, und der
Ablauf am Bildschirm bleibt derselbe.

Der Grund gehoert dazu, nicht ein Adjektiv davor: der heutige QR-Code traegt den einen geteilten
Zugangs-Token als URL-Parameter, base64-kodiert
(`radio-inventar/apps/frontend/src/components/features/admin/AppQRCode.tsx:11-23`, Quellkommentar
„Base64-encode the token to avoid plaintext exposure in URLs" — Base64 ist keine Verschleierung).
Wer den Code abfotografiert, hat **dauerhaft** Vollzugriff auf alle Geraete und alle Ausleihen samt
Namen — ohne Ablauf, ohne Widerruf. **Anonym ist gewollt; unbefristet und unwiderruflich ist der
Fehler.**

**Notiz 2 — fuer die radio-Verwaltenden.** Ein Zugangs-Code ist kuenftig **dauerhaft und sperrbar,
aber nicht loeschbar**. Wer heute einen versehentlich angelegten Code loescht, findet den Knopf nicht
mehr. Der Grund gehoert in die Notiz, weil die Aenderung sonst wie eine fehlende Funktion aussieht:
ein geloeschter Code kann an ein spaeter ausgestelltes Kaertchen zurueckfallen, und historische
Journalzeilen erschienen danach unter dem **neuen** Label. Vorbild derselben Ankuendigung:
`docs/runbooks/lagerbuch-cutover.md:430` (R34).

⚠️ **Zu bestaetigen (Betreiberfrage), und die Antwort aendert den Zeitpunkt der Ankuendigung:**
**sind gedruckte Aufsteller oder Kaertchen mit QR-Code im Umlauf?** Wenn ja, geht die Ankuendigung
**vor** dem Cutover raus und nennt, was mit den gedruckten Exemplaren passiert (sie funktionieren
weiter, nur die Sitzung ist befristet); wenn nein, genuegt die Notiz am Rollout-Tag. **Gedruckt ist
gedruckt** — dieselbe Ueberlegung, die `src/app/m/files/_lib/hostRolle.ts:128-141` fuer seine
Adressen anstellt.

⚠️ **Zu bestaetigen (Betreiberfrage), sichtbar in Notiz 1:** die **Sitzungsdauer**. Vorschlag **12 h**,
zeichengleich zu `lagerbuch` (`.env.example:265`, `LAGERBUCH_HELFER_SITZUNG_STUNDEN=12`) — die Zahl
steht in der Notiz und ist damit oeffentlich, sie muss also vor dem Rollout bestaetigt sein.

⚠️ **Zu bestaetigen (Betreiberfrage), moeglicherweise eine dritte Notiz:** soll bei **angemeldeten**
Nutzern der Benutzername im Ausleihformular **vorausgefuellt** werden (Betreiberantwort 6: „koennten
wir, optional", `docs/radio-portierung-analyse.md:1776`)? Faellt die Antwort auf „ja", ist das eine
bemerkbare Aenderung auf dem Bildschirm und schuldet nach `CLAUDE.md:192-195` eine **eigene** Notiz.
Faellt sie auf „nein", entfaellt sie ersatzlos — die Ausleihe bleibt in der Sache anonym, auch fuer
Angemeldete.

---

## 9.7 Was Spec 2 ausdruecklich **nicht** von hier erbt

| Gegenstand | Warum nicht | Wo es hingehoert |
|---|---|---|
| **`TZ=Europe/Berlin` setzen** | Der Suite-Container faehrt heute ohne `TZ`. Alles, was portal, qr, feedback, files, lagerbuch und aufgaben an Datumsgrenzen gezogen haben, ist in UTC gezogen worden; ein nachtraegliches `TZ` verschoebe jede solche Grenze | Eigener Suite-Posten mit eigener Pruefung gegen **alle** laufenden Module. `radio` haengt bewusst nicht daran |
| **Die CWE-348-Umstellung in `core/ratelimit.ts`** | `core`-Arbeit, die alle Module beruehrt | Eigener Suite-Posten. ⚠️ **Als Voraussetzung benannt, nicht selbst umgesetzt:** der Einloese-Endpunkt des Zugangscodes braucht eine Absenderschluesselwahl, die nicht gefaelscht werden kann. Solange die Umstellung aussteht, ist die Rate-Begrenzung dort eine **Bremse, kein Riegel** — das gehoert so ins Runbook, damit niemand sie fuer mehr haelt |
| **Das Entfernen des Suite-Admin-Kurzschlusses in `core/groups.ts`** | Der Kurzschluss ist **kein Versehen**; ihn zu entfernen ist `core`-Arbeit und beruehrt sechs Module | Eigene Suite-Entscheidung. `radio` erreicht dasselbe Ziel modulintern, indem es `isModuleAdmin` gar nicht benutzt — wie `feedback` und `lagerbuch` — und ist damit **vorwaertskompatibel** zur Umstellung des Admin-Modells vom 03.08. |
| **Das suiteweite Gating von `/m/*`** | Dass `/m/<key>/*` von jedem Suite-Host beantwortet wird, ist eine **Klasse** und kein radio-Problem (Falle 61) | Eigene Suite-Spec. Fuer diese Phase genuegt der modulinterne Host-Riegel in der `lagerbuch`-Form (`src/app/m/lagerbuch/_lib/host.ts`) — ⚠️ und er ist bei `radio` **nicht optional**: beide Rollen liegen auf einem Host, die Rolle steckt im Pfad, und ein ungeriegelter Verwaltungspfad auf dem Portal-Host haette **Datenwirkung**, nicht bloss eine kosmetische |

---

## 9.8 Offene Punkte dieses Kapitels, gesammelt

Alle sind **Betreiberfragen oder Messungen am Prod-Bestand** — nichts davon ist im Repo
entscheidbar, und keiner ist ein Platzhalter fuer eine Entscheidung, die diese Spec haette treffen
koennen.

| # | Offen | Wer beantwortet | Blockiert |
|---|---|---|---|
| U1 | Sitzungsdauer des Zugangscodes (Vorschlag 12 h) | Betreiber | Notiz 1 (§9.6), `RADIO_ZUGANG_SITZUNG_STUNDEN` |
| U2 | Sind gedruckte Aufsteller/Kaertchen im Umlauf? | Betreiber | Zeitpunkt der Ankuendigung (§9.6) |
| U3 | Benutzername bei Angemeldeten vorausfuellen? | Betreiber | ob es eine dritte Notiz gibt (§9.6) |
| U4 | Wo laeuft das radio-inventar-Frontend produktiv, und woher kommt `API_TOKEN`? | Betreiber | Vollstaendigkeit der Abbau-Liste (§9.5.1) und der Loeschliste (§9.5.2) |
| U5 | Wie viele Geraete tragen den Alt-Token im `localStorage`? | Begehung im Haus, kein `SELECT` | Umfang des SW-/Speicher-Handgriffs (§9.3.5) |
| U6 | Werden die zwei Pocket-ID-Clients geloescht oder aufbewahrt? | Betreiber | §9.5.2 |
| U7 | Lief `radio-admin` in Prod je mit `AUTH_DEV_BYPASS`? | §9.4.1 Abfrage 8 | Lesbarkeit der Audit-Spalten nach dem Import |
| U8 | Volumengroesse und Dump-Dauer beider Stacks | Messung bei der Generalprobe | Bemessung des Cutover-Fensters (§9.4.2) |
| U9 | Stimmt die 19.07.-Divergenz von Repo- und Server-`compose.yaml`? | Betreiber | nichts — die Aufschreibpflicht aus §9.2.3 folgt schon aus „Struktur gehoert ins Repo" (`docs/radio-portierung-analyse.md:1661-1663`) |
