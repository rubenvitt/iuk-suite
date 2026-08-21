# 4. Der Cutover selbst

**Stand 2026-08-18.** Grundlage: Spec 1 (`docs/superpowers/specs/2026-08-17-radio-modul-design.md`),
verbindlich davon Kapitel A (die 15 gesetzten Entscheidungen), Kapitel B (die entschiedenen
Widersprüche — was dort steht, gilt) und Kapitel 9 (die Übergabeliste). Vorbild der Gattung:
`docs/runbooks/files-cutover.md` (§B/§C/§D/§F) und `docs/runbooks/lagerbuch-cutover.md`.

Dieses Kapitel ist der **Ablauf des Fensters**: die Reihenfolge, die `.env`, der Redirect, die
Verifikation, der Rückweg und der Ausstellungsplan für die Zugangscodes. Es führt den Import **nicht
selbst** (Kapitel 2), es beschreibt die Generalprobe **nicht** (Kapitel 3) und es baut **nicht** ab
(Kapitel 5).

---

## 4.0 Die eine Zeile, die diesen Cutover von den fünf vorherigen unterscheidet

⚠️ **Es gibt kein Parallelfenster.** Der Alt-Kiosk (`radio-inventar`) läuft **bereits** unter
`radio.iuk-ue.de` (Betreiberantwort 1, `docs/radio-portierung-analyse.md:1771`; gesetzte
Entscheidung 3). Der Origin bleibt zeichengleich. Alt und Neu können denselben Host nicht
gleichzeitig bedienen — „nie zwei Router gleichzeitig auf derselben Domain" (`CLAUDE.md:239`) ist hier
keine Vorsichtsregel, sondern eine physische Grenze.

Daraus folgen drei Dinge, die in diesem Kapitel überall wiederkehren:

1. **Die Verifikation gegen einen ephemeren Container ohne Traefik-Labels ist nicht Kür, sondern der
   einzige Weg**, vor dem Umschwenk überhaupt etwas zu prüfen (§9.3.2).
2. **Der Rückweg ist „Router zurück"**, nichts sonst (§9.3.3) — und er kostet Daten, sobald einmal
   fachlich geschrieben wurde.
3. **Beide Domains ziehen im SELBEN Fenster um** (gesetzte Entscheidung 15). Es gibt keinen
   Zwischenzustand, in dem `radio-admin` schon in der Suite liegt und der Kiosk noch per HTTP mit ihm
   spricht. Wer zwei Abende plant, plant ein Fenster, in dem der Kiosk gegen einen abgeschalteten
   Server spricht.

---

## 4.1 Die Reihenfolge, und warum sie nicht tauschbar ist

Freeze → Snapshot → Volume sichern → Import → Parität + Stichproben → `.env` → `up -d` →
Verifikation → **Router**.

⚠️ **Der eine Punkt, an dem die naive Lesart dieser Kette den Cutover bricht:** `SUITE_TRAEFIK_RULE`
wirkt über Traefik-Labels, die beim Containerstart gelesen werden (`compose.yaml:153`). Wer die Regel
in derselben Änderung setzt, in der er `up -d` ruft, **hat den Router damit schon umgeschwenkt** — die
Verifikation liefe dann nach dem Umschwenk, nicht davor. Deshalb wird die `.env` in **einer**
Änderung vorbereitet, aber die drei schaltenden Zeilen bleiben zunächst **ungesetzt**
(`SUITE_HOST_RADIO`, `SUITE_TRAEFIK_RULE`-Erweiterung, `SUITE_REDIRECT_RULE_RADIO_ADMIN`). Genau so
macht es `docs/runbooks/files-cutover.md:107-109` („`.env` vorbereiten — alle Zeilen in EINER
Änderung, aber noch nicht aktiv"). Der Router ist damit ein **eigener, letzter** Schritt.

| # | Schritt | Warum nicht früher | Warum nicht später |
|---|---|---|---|
| 1 | **Freeze** beider Alt-Apps (Schreibwege aus) | — | Jede Ausleihe oder Rückgabe **nach** dem Snapshot steht in einer Datei, die niemand mehr importiert. Der Verlust ist **stumm**: Parität, Zählungen und Health sind grün, die Zeile fehlt einfach |
| 2 | **Echter Snapshot** (Kopie des Volumes, gegen die alles Weitere läuft) | Ohne Freeze ist die Kopie ein Zwischenstand mitten in einem Schreibvorgang | Der Import darf **nie** gegen einen laufenden Alt-Stack laufen (§9.3.4 Zeile 2) |
| 3 | **Volume sichern** (Archiv: SQLite-Kopie + `pg_dump` des Kiosk-Postgres) | Der Dump gehört zum eingefrorenen Stand, nicht zu einem späteren | ⚠️ Der Kiosk-Postgres hängt an **keiner** Sicherung, die dieses Repo kennt (`scripts/backup.sh` kennt `*.db` und `BLOB_DIR`, `:15-21`). Fällt das Volume ohne Dump, ist die `AdminUser`-Zählung für immer weg (§9.4.2 Nr. 3, gesetzte Entscheidung 14) |
| 4 | **Import** in `radio.db` | Ohne Snapshot keine stabile Quelle; ohne den **früheren** Deploy (§4.2) kein Schema, in das geschrieben werden könnte | Der Import ist der langsamste Schritt; nach ihm folgen nur noch Prüfungen |
| 5 | **Parität + feldweise Stichproben + Retention-Gegenprobe** | Ohne Import nichts zu vergleichen | ⚠️ **Die Parität allein gibt die Freigabe nicht her** (§4.5, Schritt 5) |
| 6 | **`.env` scharf schalten** — ohne die drei Router-Zeilen | Vor dem Import stünden Boot-Prüfungen auf einer Datenlage, die es nicht gibt; und `SUITE_HOST_RADIO` **vor** dem Registry-Eintrag bricht den Start der **ganzen Suite** ab (§4.4.2) | — |
| 7 | **`docker compose up -d`** | — | — |
| 8 | **Verifikation** gegen den **ephemeren Container** mit vorgetäuschtem `Host`-Kopf | — | Nach dem Umschwenk ist die Prüfung keine Vorprüfung mehr, sondern eine Nachricht über einen bereits sichtbaren Zustand |
| 9 | **Router umschwenken:** Alt-Kiosk vom Traefik-Router nehmen, **dann** die drei Zeilen setzen, `up -d` | Nie zwei Router gleichzeitig (`CLAUDE.md:239`); der Alt-Kiosk muss **zuerst** weg, sonst ist nicht deterministisch, wer gewinnt (Vorbild `docs/runbooks/files-cutover.md:167-170`) | Ab hier läuft die Uhr für den Rückweg (§4.9) |

**Was zwischen 8 und 9 ausdrücklich nicht passieren darf:** die HTTP-Grenze fällt **mit** dem
Umschwenk, nicht davor. Schwenkt die Verwaltung zuerst, verliert der Alt-Kiosk seine Datenquelle (die
sechs `/v1`-Routen, `radio-admin/server/src/routes/loanApi.ts`); fällt die Grenze zu früh, steht der
Kiosk ohne Bestand da. Beides ist mit **einem** Fenster ausgeschlossen — deshalb ist Schritt 9 **ein**
Schritt und nicht zwei.

---

## 4.2 Was vor dem Fenster fertig sein muss

Diese Liste ist keine Wiederholung von Kapitel 3 (Generalprobe), sondern die Menge der Dinge, deren
Fehlen das Fenster **verbrennt**.

1. **Der Deploy mit dem Registry-Eintrag und dem Abräum-Worker ist gelaufen — in einem FRÜHEREN
   Fenster.** Beweis, gegen den **laufenden** Container:
   ```bash
   curl -s -o /dev/null -w '%{http_code}\n' https://iuk-ue.de/api/health/radio
   #   200 = das Modul ist im Image
   #   503 = falsches Image: getModule(key) wirft bei unbekanntem Key (§7.2.4)
   ```
   **Abbruch:** 503 → der Cutover wird abgesagt, nicht angepasst. Ohne den Registry-Eintrag hat der
   Import kein Zielschema, und `SUITE_HOST_RADIO` in der `.env` bricht den Start der ganzen Suite ab
   (§4.4.2).
2. ⚠️ **Der Abräum-Worker gehört in diesen ersten Deploy, nicht in den Cutover** (Spec 1 §7.1.3,
   Randbedingung 7). Begründung in §4.7.
3. **Die Retention der Standby-Umgebung ist neutralisiert oder das Volume ist kopiert** — **vor** dem
   Cutover-Abend, nicht wenn man es braucht (§9.3.4 Zeile 1). `radio-admin/server/src/index.ts:35`
   ruft `startRetentionSchedule`, `radio-admin/server/src/services/retentionService.ts:47` purgt
   **sofort**, erst `:48` startet den Tagestimer. Der Cutoff hängt an der **Wanduhr** (`:9`, `:19`) —
   **jeder weitere Start löscht mehr als der vorige.** Handgriff: `HISTORY_RETENTION_MONTHS` in der
   Standby-Umgebung neutralisieren **oder** das Volume kopieren.
   **Wie man es merkt, wenn es fehlt:** ein **erfolgreicher** Start mit einer Protokollzeile
   `[retention] purged N expired loan(s)` (`retentionService.ts:41`) — kein Fehler, kein roter Test.
4. **`SUITE_SEED` ist nicht `1`.** `shouldSeed()` ist `SUITE_SEED === "1" || NODE_ENV === "development"`
   (`CLAUDE.md:180-182`). ⚠️ Bei `radio` schärfer als bei jedem bisherigen Modul: ein geseedeter
   Zugangscode wäre ein **gültiger anonymer Zugang** zum gesamten Bestand samt Ausleihernamen.
   (Gegenzusage aus Spec 1: `seedLokal` legt **niemals** eine einlösbare Zugangszeile an, §9.3.2 Nr. 2.)
5. **Die Pfadkollision unter `/admin` ist aufgelöst.** Bis zum Umschwenk liegt unter
   `radio.iuk-ue.de/admin` die **eigene Verwaltungsoberfläche des Alt-Kiosk** (`login.tsx`, `index.tsx`,
   `history.tsx`, `devices.tsx`, `settings.tsx`, `docs/radio-portierung-analyse.md:392-398`). Bleibt das
   offen, ist der Redirect aus §4.4.4 **nicht schaltbar** (§9.2.1).
6. **Der Registry-Code-Default-Abgleich, den kein Boot sehen kann:**
   ```bash
   grep -n 'prodHosts' src/core/registry.ts
   ```
   und die Code-Defaults von Hand gegen die gesetzten `SUITE_HOST_*` vergleichen. Grund: die
   Kollisions-Map in `validateHostConfig` wird **ausschließlich** aus `envHostsFor` gefüllt
   (`src/core/hosts.ts:78-95`) — ein Host, den ein anderes Modul per Registry-`prodHosts` im
   **Code-Default** führt, erreicht sie **nie** und kollidiert ohne jede Meldung. `moduleForHost`
   entscheidet dann nach **Registry-Reihenfolge**, nicht nach Env.
7. **Zwei Messungen aus der Generalprobe liegen vor** (sie bemessen das Fenster, U8): Größe der
   Prod-Volumes und Dauer von `pg_dump` bzw. `sqlite3 .backup`.
8. ⚠️ **Belegen, dass der Edge-Proxy `X-Forwarded-Host` SETZT statt durchreicht** — und für `radio` gilt
   das mit derselben Schärfe wie für `lagerbuch`, aus demselben Grund. Der Host-Riegel löst den Host
   über `resolveHost` auf, und das liest `x-forwarded-host` mit **Vorrang** vor `host`; nach dem Rewrite
   der Middleware ist das die einzig richtige Reihenfolge, aber der Header ist client-fälschbar. Der
   Docblock in `core/routing.ts` begründet die Ungefährlichkeit mit `requiresAuth`/`canAccess` als
   Auffangriegel — **und `requiresAuth: false` entfernt genau diesen Auffangriegel** (gesetzte
   Entscheidung 4, wörtlich dieselbe Lage wie `docs/runbooks/lagerbuch-cutover.md:102-118`).
   **Deployment-Invariante, im Repo nicht belegbar** — es liegt hier keine Traefik-Konfiguration, die es
   zeigt. Also: **vor** dem Umschwenken am Server belegen und ins Protokoll schreiben.
9. **`TZ=Europe/Berlin` ist als Voraussetzung benannt, aber in diesem Fenster NICHT gesetzt.** Es ist
   ein eigener Suite-Posten mit eigener Prüfung gegen **alle** laufenden Module; ein nachträgliches
   `TZ` verschöbe jede Datumsgrenze, die portal, qr, feedback, files, lagerbuch und aufgaben bisher in
   UTC gezogen haben (§9.7). `radio` hängt bewusst nicht daran. Wer es doch am Cutover-Abend setzt,
   ändert sechs fremde Module mit.

---

## 4.3 Die Eingaben: was nur der Betreiber oder der Server hergibt

Keine dieser Zeilen ist im Repo entscheidbar. Sie werden **vor** dem Fenster ausgefüllt und ins
Cutover-Protokoll geschrieben.

| # | Eingabe | Woher | Blockiert |
|---|---|---|---|
| E1 | **Gruppenname** für `SUITE_ADMIN_GROUP_RADIO`, exakt wie er im `groups`-Claim erscheint | Betreiber (U10). Vorbild: `lagerbuch` führt `lagerbuch_nutzer`, `.env.example:244`. Der Vergleich ist exakt, inklusive Groß-/Kleinschreibung | Jede Verwaltungsseite |
| E2 | **Echter Volume-Name** von `radio-admin` (`docker volume ls \| grep -i radio-data`) | Server | Schritt 2 |
| E3 | **Echter Volume-Name und `POSTGRES_USER`** von `radio-inventar` | Server (§9.4.2) | Schritt 3 |
| E4 | **Sitzungsdauer** `RADIO_AUSLEIH_SITZUNG_STUNDEN` (Vorschlag **12**, C.2/U1) | Betreiber | Der Text `<N>` in der Neuigkeitennotiz (§4.8.3) |
| E5 | **Gedruckte Aufsteller: Anzahl, Ort, wer sie ersetzen kann** (C.3/U2) | Begehung, kein `SELECT` | Der Ausstellungsplan (§4.8) |
| E6 | **Wie viele Geräte tragen den Alt-Token im `localStorage`** (U5) | Begehung, kein `SELECT` — der Token liegt im `localStorage`, es gibt keine Tabelle, die die Geräte kennt (`docs/radio-portierung-analyse.md:1969-1971`) | Umfang des SW-Handgriffs (§4.7) |
| E7 | **Traefik-Containername** (für den Access-Log-Blick, §4.6 Nr. 9) | Server | — |
| E8 | **Wer ist am Cutover-Abend namentlich anwesend** und stellt den ersten Code aus (§4.8.2) | Betreiber | Der erste einlösbare Zugang |

⚠️ **Zu E1, und es ist im Fenster teuer:** Gruppen werden im JWT nur beim Login und beim
Token-Refresh nachgezogen — ein Gruppenentzug oder eine frisch angelegte Gruppe wirkt mit bis zu
**einer Stunde** Verzug (`CLAUDE.md:151-156`). Wer die Gruppe am Cutover-Abend anlegt, prüft die
Verwaltung **nach einer neuen Anmeldung**, nicht mit der offenen Sitzung.

---

## 4.4 Die `.env`

### 4.4.1 Die Zeilen, ausgeschrieben

Alle Zeilen in **einer** Änderung, aber die drei mit ⏸ markierten bleiben bis Schritt 9 **ungesetzt**.

⚠️ **Die drei ⏸-Zeilen stehen im Block ABSICHTLICH auskommentiert** — wer den Block unter Zeitdruck
kopiert, bekommt damit den richtigen Zustand *vor* dem Umschwenk. Sie werden in Schritt 9
einkommentiert, nicht neu getippt.

```dotenv
# ── im Block „Prod-Domains der Module" (.env.example:112) ──
# ⏸ SUITE_HOST_RADIO=radio.iuk-ue.de        # erst in Schritt 9

# ── Block „── Modul radio ──" (neu, nach dem lagerbuch-Block, vor .env.example:309) ──
SUITE_ADMIN_GROUP_RADIO=<E1>
# SUITE_ACCESS_GROUP_RADIO  — DIESE ZEILE DARF NICHT EXISTIEREN. Siehe unten.
RADIO_AUSLEIH_SITZUNG_SECRET=<openssl rand -base64 32, frisch, NICHT gleich AUTH_SECRET>
RADIO_AUSLEIH_SITZUNG_STUNDEN=<E4, Vorschlag 12>
RADIO_GATE_VERSUCHE_PRO_ABSENDER_PRO_MIN=5
RADIO_GATE_FEHLVERSUCHE_GESAMT_PRO_MIN=30
RADIO_GATE_FEHLVERSUCHE_GESAMT_PRO_STUNDE=300
RADIO_HISTORIE_PURGE=0          # Cutover-Schalter, wird nach dem Fenster ENTFERNT (§4.6 Nr. 12)
# RADIO_HISTORIE_MONATE=2                 # Vorbelegung, im Fenster nicht setzen
# RADIO_HISTORIE_ERSTLAUF_MINUTEN=1440    # Vorbelegung, im Fenster nicht setzen

# ── neben der SUITE_TRAEFIK_RULE-Zeile (.env.example:366-369) ──
# ⏸ SUITE_TRAEFIK_RULE=Host(`iuk-ue.de`) || … || Host(`radio.iuk-ue.de`)   # erst in Schritt 9
# ⏸ SUITE_REDIRECT_RULE_RADIO_ADMIN=Host(`radio-admin.iuk-ue.de`)          # erst in Schritt 9
```

⚠️ **`SUITE_TRAEFIK_RULE` ist bis Schritt 9 nicht „weg", sondern trägt ihren bisherigen Wert weiter** —
sie führt heute schon die Hosts der sechs laufenden Module. Auskommentiert wird nur die **erweiterte**
Fassung; die bestehende Zeile bleibt unverändert stehen, bis sie in Schritt 9 ersetzt wird. Wer sie
versehentlich auskommentiert, nimmt mit **einem** Handgriff sechs fremde Module vom Netz
(Vorbelegung ``Host(`iuk-ue.de`)``, `compose.yaml:153`).

| Variable | Wert | Was passiert, wenn sie fehlt oder falsch ist |
|---|---|---|
| `SUITE_HOST_RADIO` | `radio.iuk-ue.de` | Fehlt sie: `moduleForHost` fällt auf **portal** zurück (`src/core/hosts.ts:52-57`), der Rewrite auf `/m/radio<rest>` greift nicht, `/sw.js` landet im Portal-Modul (§7.1.4), und der Login-Rückweg wirft auf das Portal (`:59-63`). **Alles davon still.** ⚠️ Bei `radio` schärfer als sonst: der Portal-Fallback überdeckt die **Ausleihe** — die anonyme Fläche, die kein Anmeldefenster zeigt, an dem jemand den Fehler bemerkt |
| `SUITE_ADMIN_GROUP_RADIO` | `<E1>`, **nicht leer** | Leer oder fehlend = **Startabbruch** (§7.3.3 Nr. 1). Der Boot-Riegel existiert genau deshalb: die Alternative wäre ein **stummes 404 für JEDE Verwaltungsseite und alle Verwaltenden auf einmal** — `radio` ignoriert den `isModuleAdmin`-Kurzschluss modulintern (gesetzte Entscheidung 9), es gibt keine Suite-Admin-Rückfallebene |
| `SUITE_ACCESS_GROUP_RADIO` | ⚠️ **Zeile gar nicht vorhanden** | ⚠️ **Diese Variable invertiert `SUITE_HOST_RADIO`, und die naheliegende Zeile ist der Startabbruch.** Die Prüfung ist `!== undefined` (§7.3.3 Nr. 2), und ein `SUITE_ACCESS_GROUP_RADIO=` kommt per `env_file` als **leerer String**, also als *definiert*, im Prozess an → **Boot-Abbruch**. Gemeint ist: die Zeile **ersatzlos entfernen**. Wäre sie gesetzt und würde nicht geprüft, wäre sie **still wirkungslos** — `canAccess` steigt bei `requiresAuth: false` sofort mit `true` aus (`src/core/registry.ts:239`) und liest `requiredGroups` nie |
| `RADIO_AUSLEIH_SITZUNG_SECRET` | frisch, ≥ 32 Zeichen | Fehlt, zu kurz, **oder gleich `AUTH_SECRET`** → **Startabbruch** (§7.3.3 Nr. 3). ⚠️ **Hier gibt es nichts zu erben** — anders als bei `lagerbuch`, wo `HELFER_SESSION_SECRET` wertgleich aus der Prod-`stack.env` übernommen wurde, damit laufende Sitzungen den Cutover überleben (`.env.example:252-258`). Der heutige Zugang des Kiosk ist ein base64-Bearer-Token im `localStorage` (`radio-inventar/apps/frontend/src/components/features/admin/AppQRCode.tsx:11-23`), kein signiertes Cookie. Wer nach einem zu übernehmenden Wert sucht, sucht vergeblich |
| `RADIO_AUSLEIH_SITZUNG_STUNDEN` | `<E4>`, ganze Zahl `1..168` | Außerhalb des Bereichs → **Startabbruch** (§7.3.3 Nr. 5). Ohne die Zeile gilt die Vorbelegung 12 |
| `RADIO_GATE_VERSUCHE_PRO_ABSENDER_PRO_MIN` | `5` | Je Absender, **nur Fehlversuche** (§3.7.2). Keine ganze Zahl im Bereich → Startabbruch über denselben Helfer `zahlFehler` (§7.3.3) |
| `RADIO_GATE_FEHLVERSUCHE_GESAMT_PRO_MIN` | `30` | Modulweite Burst-Kappe gegen Rotation des Absenderschlüssels (= sechs Absender-Budgets) |
| `RADIO_GATE_FEHLVERSUCHE_GESAMT_PRO_STUNDE` | `300` | Der tragende Zähler (= 5/min × 60). ⚠️ Die drei Grenzen sind ab dem ersten Import **eingefroren**; eine geänderte `.env` wirkt erst nach einem Neustart (`grenzen()` steht auf Modulebene, §3.7.2 Nr. 4). ⚠️ Solange die CWE-348-Umstellung in `src/core/ratelimit.ts` aussteht (eigener Suite-Posten, §9.7), ist die Absenderkennung fälschbar und diese Schranke eine **Bremse, kein Riegel** — das steht hier, damit sie niemand für mehr hält |
| `RADIO_HISTORIE_PURGE` | `0` **im Fenster** | Die zweite Hälfte der Faktor-1000-Absicherung (§7.3.5, §4.5 Schritt 5). Wird nach dem Fenster **entfernt** (§4.6 Nr. 12) |
| `SUITE_TRAEFIK_RULE` | bestehende Hosts **plus** ``\|\| Host(`radio.iuk-ue.de`)`` | Ohne die Erweiterung erreicht die Domain den Container gar nicht erst (`compose.yaml:149-153`). Bestehende Hosts **übernehmen**, nicht ersetzen. ⚠️ **`radio-admin.iuk-ue.de` gehört dort ausdrücklich NICHT hinein** — §4.4.4 |
| `SUITE_REDIRECT_RULE_RADIO_ADMIN` | ``Host(`radio-admin.iuk-ue.de`)`` | Solange ungesetzt, existiert der Redirect-Router und trifft nichts (Vorbelegung `radio-admin.invalid`). Wird in **derselben** Änderung gesetzt wie `SUITE_HOST_RADIO` (§9.2.1) |

**Was ausdrücklich nicht entsteht:** kein `RADIO_ADMIN_URL`, kein `RADIO_ADMIN_API_TOKEN`, kein
`POCKET_ID_*` für `radio`. `api_tokens` trug produktiv genau einen Konsumenten — den Alt-Kiosk
(Betreiberantwort 3, gesetzte Entscheidung 13) —, und der verschwindet mit dem Port. Eine Variable
dafür wäre ein Angebot an einen Konsumenten, den es nicht gibt.

### 4.4.2 Was den Boot abbricht — und was STILL auf den Portal-Fallback zurückfällt

Nachgeschlagen in `src/core/hosts.ts` zum Zeitpunkt des Schreibens.

**Abbruch (drei Dinge, und nur diese drei, aus `validateHostConfig`, `:65-99`):**

1. Ein `SUITE_HOST_*`, dessen Suffix zu **keinem** Modul-Key passt (`:69-76`, Meldung „… passt zu
   keinem Modul. Bekannt: …"). ⚠️ **Daraus folgt die einzige Reihenfolge, die ein Cutover selbst
   verletzen kann: erst der Registry-Eintrag im Image, dann die `.env`.** Solange `key: "radio"` in
   `src/core/registry.ts` fehlt, bricht `SUITE_HOST_RADIO` **oder** `SUITE_ADMIN_GROUP_RADIO` den
   Start der **ganzen Suite** ab — nachweisbar vermeidbar über §4.2 Nr. 1 (200 statt 503).
2. Ein Wert mit `/` oder `:` (`:81-85`) — reiner Hostname, ohne Protokoll, ohne Port.
3. Ein Host, den **zwei per Env gesetzte** Module beanspruchen (`:87-93`).

Dazu die fünf modul-eigenen Abbrüche aus `radioBootFehler()` (§7.3.3): leere Admin-Gruppe · gesetztes
`SUITE_ACCESS_GROUP_RADIO` · fehlendes/zu kurzes/gleiches Sitzungsgeheimnis · `RADIO_HISTORIE_MONATE`
keine ganze Zahl ≥ 1 · `RADIO_AUSLEIH_SITZUNG_STUNDEN` außerhalb `1..168`. Jeder zurückgegebene String
**ist** ein Startabbruch: `assertHostConfig` wirft bei `length > 0` (`src/core/bootstrap.ts:92`).

**Still (drei Ausprägungen, jede mit ihrem eigenen Handgriff — §7.4.4):**

| Stiller Fall | Beleg | Handgriff, und wo er in diesem Kapitel steht |
|---|---|---|
| **Richtig geschriebener, falscher Hostname.** `SUITE_HOST_RADIO=falsch.example.com` ist von einem Tippfehler nicht zu unterscheiden; `moduleForHost` fällt auf **portal** zurück, `radio.iuk-ue.de` zeigt stillschweigend das Portal | `src/core/hosts.ts:52-57` (wörtlich: „der Host fällt dann in `moduleForHost` auf das Portal zurück und die QR-Domain zeigt stillschweigend das Portal") | **Eigener Verifikationsschritt** §4.6 Nr. 1 + Nr. 3 + Nr. 5. Bei `files` war das ebenfalls ein eigener Schritt, kein Nebensatz |
| **Der Login-Rückweg, den kein `curl` sieht.** Die Allowlist in `src/core/auth/redirect.ts` erkennt einen Modul-Host über genau diese Variable; fehlt sie, wirft Auth.js den Nutzer nach dem Login **aufs Portal**, ohne Fehler und ohne Meldung | `src/core/hosts.ts:59-63` (wörtlich: „Ein curl sieht davon nichts") | **Handarbeit**, §4.6 Nr. 10 — und dieselbe Person stellt den ersten Zugangscode aus (§4.8.2), damit der Schritt nicht vergessen wird |
| **Die Kollision, die `validateHostConfig` strukturell nicht sehen kann** — ein Host im Registry-**Code-Default** eines anderen Moduls erreicht die Kollisions-Map nie | `src/core/hosts.ts:78-95`; `docs/radio-portierung-analyse.md:798-804` | **Vor** dem Fenster, §4.2 Nr. 6 |

⚠️ **Und der stille Fall, den nur eine Protokollzeile findet:** `SUITE_HOST_RADIO` gesetzt, aber in
`SUITE_TRAEFIK_RULE` nicht enthalten — die Domain ist tot, ohne dass etwas kaputt aussieht. Das
**meldet** (`console.warn`), es wirft nicht: die Labels leben in der `.env` auf dem Server, und ein
Abbruch träfe genau in dem Moment, in dem der Betreiber die `.env` gerade umstellt (§7.3.4). Deshalb
§4.6 Nr. 11: **`warn` = Stopp, `info` = Zustand.**

### 4.4.3 Rollback ist die leere Zeile, nicht die gelöschte

`SUITE_HOST_RADIO=` ergibt `[]` (bewusst **keine** Prod-Hosts). Das **Entfernen** der Variable ergibt
`null` und damit den Code-Default aus der Registry (`src/core/hosts.ts:33-46`). Mit `prodHosts: []`
(gesetzter Zuschnitt 1) ist der Unterschied heute wirkungsgleich — aber nur heute, und die leere Zeile
ist die Form, die sagt, was gemeint ist.

⚠️ **Die beiden Formen sind bei `radio` gegenläufig, und das ist die Zeile, die man am leichtesten
verkehrt schreibt:**

* `SUITE_HOST_RADIO=` → **leer, Zeile bleibt stehen.** Das ist der Rückweg.
* `SUITE_ACCESS_GROUP_RADIO` → **Zeile weg.** Ein leerer Wert ist hier der **Startabbruch**.

### 4.4.4 Der Redirect vom Alt-Host

**Muss `radio-admin.iuk-ue.de` in `SUITE_TRAEFIK_RULE` stehen? Nein — ausdrücklich nicht.** Wer ihn
dort mit aufnimmt, bekommt **nicht** den Redirect, sondern den stillen Portal-Fallback: der Host
erreicht den Container, kein `SUITE_HOST_*` beansprucht ihn, und `decideRoute` schreibt auf portal um
(`const mod = moduleForHost(host) ?? getModule("portal")`, `src/core/routing.ts:69`). Der Alt-Host
zeigt dann das **Portal** — ein funktionierender Ausdruck mit falschem Inhalt, und **kein Test des
Repos sieht Traefik-Labels an**. Genau diesen Fall meldet die Boot-Warnung „`SUITE_TRAEFIK_RULE`
enthält einen Host, der mit `radio-admin.` beginnt" (§7.3.4).

Der Redirect braucht deshalb einen **zweiten, eigenen Router** mit eigener Middleware:

```yaml
# in compose.yaml, am selben Service `app`, unter den bestehenden Labels
- traefik.http.routers.radio-admin-alt.rule=${SUITE_REDIRECT_RULE_RADIO_ADMIN:-Host(`radio-admin.invalid`)}
- traefik.http.routers.radio-admin-alt.entrypoints=web
- traefik.http.routers.radio-admin-alt.middlewares=radio-admin-alt-redirect
- traefik.http.middlewares.radio-admin-alt-redirect.redirectregex.regex=^https?://radio-admin\.iuk-ue\.de/(.*)
- traefik.http.middlewares.radio-admin-alt-redirect.redirectregex.replacement=https://radio.iuk-ue.de/admin/$${1}
- traefik.http.middlewares.radio-admin-alt-redirect.redirectregex.permanent=false
```

⚠️ **Es gibt im Repo kein erprobtes Vorbild.** `rg -n -i redirectregex compose.yaml .env.example docs/`
trifft ausschließlich `docs/radio-portierung-analyse.md` (`:1654`, `:1660`, `:2105`, `:2287`). Das ist
ein **Entwurf** — und deshalb sind die drei `curl` aus §4.6 Nr. 8 protokollpflichtig, nicht optional.

Fünf Punkte, jeder mit seinem Preis:

1. **Middleware am Router, nicht am Service.** Am Service träfe der Redirect auch die Suite selbst.
2. **`permanent=false` → 302, nie 301.** Ein 301 liegt im Cache jedes Telefons, das den Alt-Host je
   besucht hat, und macht den Rückweg praktisch unmöglich.
3. **`$$` gegen die Compose-Interpolation.** `$${1}` erreicht Traefik als `${1}`; ein einfaches `$`
   verschluckt Compose, und die Ersetzung liefert `/admin/` für **jeden** Pfad. Der Redirect
   funktioniert dann, ist aber nicht mehr pfaderhaltend — **der stille Fehlfall dieses Blocks.**
4. **Pfaderhaltend heißt:** `radio-admin.iuk-ue.de/geraete` → `radio.iuk-ue.de/admin/geraete`. Die
   Alt-Verwaltung bediente ihre Oberfläche ab `/`; das neue Präfix ist `/admin`.
5. **Eigene Variable mit unschädlicher Vorbelegung.** `radio-admin.invalid` löst niemand auf; ohne
   Vorbelegung scheitert `docker compose config`, sobald die Variable fehlt. ⚠️ Der Name ist bewusst
   **nicht** `SUITE_HOST_`-präfigiert: `const PREFIX = "SUITE_HOST_"` (`src/core/hosts.ts:20`), und
   `validateHostConfig` bricht bei jedem Namen mit diesem Präfix ab, der zu keinem Modul-Key passt
   (`:69-76`). `SUITE_REDIRECT_RULE_RADIO_ADMIN` ist damit boot-neutral.
6. ⚠️ **`entrypoints=web` ist richtig, und der Grund gehört hierher, weil er sonst wie ein Fehler
   aussieht.** Nachgeschlagen: der bestehende Suite-Router trägt genau dieselbe Zeile —
   `traefik.http.routers.iuk-suite.entrypoints=web` (`compose.yaml:154`) — und **im ganzen Compose gibt
   es kein `tls`- und kein `certresolver`-Label.** TLS endet also **vor** Traefik, an einem Edge-Proxy;
   `docs/runbooks/lagerbuch-cutover.md:102-105` nennt denselben Umstand als „Deployment-Invariante, im
   Repo nicht belegbar". Der Redirect-Router muss deshalb **dieselben** Entrypoints führen wie der
   Suite-Router — nicht mehr und nicht weniger. Führt er einen anderen, oder lernt der Edge-Proxy den
   Alt-Host nicht kennen, antwortet `https://radio-admin.iuk-ue.de/` über HTTPS **gar nicht** oder mit
   einem Zertifikatsfehler, und die drei `curl` aus §4.6 Nr. 7 laufen ins Leere, statt rot zu werden —
   also **keine** 302-Zeile, sondern ein Verbindungs- oder TLS-Fehler.
   ⬜ **zu ergänzen: welche Entrypoints der Edge-Proxy an Traefik weitergibt** und ob
   `radio-admin.iuk-ue.de` dort schon bekannt ist. Das ist eine Server-Ablesung, keine Repo-Frage.

⚠️ **Der Redirect wird im selben Fenster wie der Umschwenk scharf, nie davor.** Bis dahin liegt unter
`radio.iuk-ue.de/admin` die Verwaltung des **Alt-Kiosk** (§4.2 Nr. 5). Ein früh geschalteter Redirect
führt jeden Verwaltenden aus einer funktionierenden Alt-Verwaltung in die Verwaltung einer **anderen
Anwendung** — schlechter als nichts zu tun.

⚠️ **Der DNS-Eintrag `radio-admin.iuk-ue.de` muss BLEIBEN, solange der Redirect steht.** Er ist die
Abhängigkeit des Redirects, kein Abbau-Posten. **Zusage an Kapitel 5 (Abbau):** der Redirect fällt,
sobald im Traefik-Zugriffsprotokoll über **vier zusammenhängende Wochen** kein Treffer mehr auf
`radio-admin.iuk-ue.de` erscheint — und dann in dieser Reihenfolge: Labels aus `compose.yaml`,
`SUITE_REDIRECT_RULE_RADIO_ADMIN` aus der `.env`, **DNS zuletzt**.

#### Der Preis: die Regel lebt auf dem Server, nicht im Repo

Die Labels sind **Struktur** und gehören als echte, per Env parametrisierte Labels in die
**Repo**-`compose.yaml`. Die zwei **Werte** (`SUITE_TRAEFIK_RULE`, `SUITE_REDIRECT_RULE_RADIO_ADMIN`)
leben in der `.env` **auf dem Server** und sind in keinem Repo nachlesbar. Damit die nächste Sitzung
sie kennt, gehören sie an **drei** Orte:

1. **`compose.yaml` im Repo** — die sechs Label-Zeilen oben, parametrisiert, mit Vorbelegung.
2. **`.env.example`, neben der `SUITE_TRAEFIK_RULE`-Zeile (`:366-369`)** — als kommentierter Block
   plus Rollback-Handgriff, wie `.env.example:231-239` es für `lagerbuch` vormacht.
3. **Ins Cutover-Protokoll, wörtlich, beide gesetzten Werte** — plus nach dem Deploy:
   ```bash
   docker compose config | grep -A2 radio-admin-alt
   ```
   damit protokolliert ist, was Traefik **tatsächlich** bekommt.

⚠️ **Die Behauptung, am 19.07. seien Repo- und Server-`compose.yaml` auseinandergelaufen (`ADMIN_GROUP`
fehlte in der Vorlage), ist im Repo nicht nachweisbar** und steht deshalb als **Betreiberfrage U9**,
nicht als Tatsache (§9.2.3, `docs/radio-portierung-analyse.md:1661-1663`). Die Aufschreibpflicht aus
(1)–(3) hängt **nicht** daran: sie folgt schon aus „Struktur gehört ins Repo".

---

## 4.5 Der Ablauf im Fenster, Schritt für Schritt

Jeder Schritt: Befehl · Erwartung · **was ihn scheitern lässt und wie man es merkt.** Ergebnis
danebenschreiben, nicht nur abhaken (Vorbild `docs/runbooks/files-cutover.md:192-196`).

### Schritt 1 — Freeze

```bash
docker compose -f radio-admin/docker-compose.yml stop app
# und im selben Handgriff den Kiosk:
docker compose -f radio-inventar/docker-compose.yml stop backend
```

**Erwartung:** beide Schreibwege sind zu. `radio.iuk-ue.de` ist ab hier nicht bedienbar — das ist der
Beginn der angekündigten Auszeit, nicht ein Fehler.
**Scheitert an:** einem noch laufenden zweiten Frontend-Prozess. ⚠️ `radio-inventar/docker-compose.yml`
führt nur `postgres` und `backend` (letzteres hinter einem Profil) — **wer das Frontend ausliefert, ist
offen (C.5/U4)** und muss vor dem Freeze bekannt sein, sonst bleibt ein Schreibweg offen, den niemand
gestoppt hat.
**Wie man es merkt:** die Zeilenzahlen aus Schritt 5 stimmen nicht mit denen aus Schritt 2 überein —
also **erst dann**, wenn der Import schon gelaufen ist.

### Schritt 2 — Echter Snapshot

```bash
docker volume ls | grep -i radio-data            # → E2, ins Protokoll
VOL=<die Zeile aus dem Befehl oben>
docker run --rm -v "$VOL":/d -v "$PWD":/out alpine \
  sh -c 'cp /d/data.sqlite /out/radio-admin-snapshot.sqlite'
```

**Erwartung:** eine Datei `radio-admin-snapshot.sqlite` mit plausibler Größe.
**Scheitert an:** dem **deklarierten** statt dem echten Volume-Namen. Compose präfixt deklarierte
Volumes mit dem Projektnamen (`radio-admin_radio-data`); ein `-v radio-data:/d` legt ein **neues,
leeres** Volume an und der `cp` scheitert an einer fehlenden Datei — laut, aber ein verbrannter
Schritt im Fenster.
**Wie man es merkt:** `cp: can't stat '/d/data.sqlite'`.

⚠️ **Die lokale `radio-admin/data/data.sqlite` ist als Beleg unbrauchbar:** leer und vorbaselinig —
`.tables` zeigt nur `__drizzle_migrations`, `device_events`, `devices`, `software_versions`; `loans`,
`api_tokens` und `users` **fehlen ganz** (`docs/radio-portierung-analyse.md:1865-1872`). **Jede** Zahl
in diesem Kapitel kommt aus dem Snapshot, nie aus dieser Datei.

**Und im selben Schritt die Zählungen gegen die Kopie**, die die Sollwerte setzen. Die vollständigen
Abfragen (sechs Paritäts-Sollwerte, vier Invarianten, drei belegende) stehen in §9.4.1 und gehören
wörtlich hierher. Zwei davon sind **Abbruchbedingungen des Fensters**:

```sql
-- Zeitstempel-Größenordnung: DREIZEHNSTELLIG = Millisekunden.
select min(created_at), max(created_at), length(cast(max(created_at) as text)) from devices;
```
**Zehnstellig → der Cutover wird ABGESAGT, nicht angepasst.** Dann ist die gesamte Import-Annahme
falsch.

```sql
-- Die Retention-Zahl, die der Betreiber auf „< 100" GESCHÄTZT hat.
select count(*) from loans
 where returned_at is not null
   and returned_at < (strftime('%s','now','-2 months') * 1000);
```
⚠️ Der Faktor 1000 steht hier **absichtlich** im SQL: die Alt-Spalte ist in Millisekunden,
`strftime('%s')` liefert Sekunden. Wer ihn weglässt, zählt **alle** zurückgegebenen Leihen und hält
das für eine bestätigte Schätzung. **Diese Zahl ist die Zählung, die die Schätzung ersetzt** (die
2-Monats-Retention wird übernommen, Betreiberantwort 4 / Entscheidung 12) **und gleichzeitig die
Zahl, die der Import nicht verlieren darf** (Schritt 5).

### Schritt 3 — Volume sichern (Archiv)

```bash
# radio-inventar: Werte ZUERST ablesen, dann dumpen (E3)
docker compose -f radio-inventar/docker-compose.yml exec -T postgres printenv POSTGRES_USER
docker volume ls | grep -i postgres_data

docker compose -f radio-inventar/docker-compose.yml exec -T postgres \
  pg_dump -U "${POSTGRES_USER:-radio}" -d radio_inventar --format=custom \
  > radio-inventar-final-$(date +%Y%m%dT%H%M%S).dump
```

**Erwartung:** ein Dump mit plausibler Größe, in der Archivablage.
**Scheitert an:** übernommenen **Vorbelegungen** statt gelesenen Werten. `POSTGRES_USER` trägt nur
einen `:-radio`-Default; nur `POSTGRES_DB: radio_inventar` ist im Compose hart gesetzt.
**Wie man es merkt:** `FATAL: role "radio" does not exist`.

⚠️ **Der Kiosk-Postgres fällt aus jeder Sicherung heraus, die dieses Repo kennt** (`scripts/backup.sh`
kennt `*.db` und `BLOB_DIR`, `:15-21`). Dieser Dump ist der einzige. Er ist zugleich die
Voraussetzung dafür, dass die `AdminUser`-Zählung überhaupt noch möglich ist — **ein gelöschtes Volume
nimmt die Antwort mit** (`docs/radio-portierung-analyse.md:814-816`).

**Zusage an Kapitel 5 (Abbau):** die fünf Postgres-Zählungen aus §9.4.2 (Tabellenbestand ·
`to_regclass('public."Loan"')`/`"Device"` · `select count(*) from "AdminUser"` · `session` · `n_live_tup`)
sind **Abbau**-Schritte, nicht Cutover-Schritte — aber sie brauchen dieses Volume. Insbesondere:
`AdminUser` wandert **nicht** (gesetzte Entscheidung 14, `pocket-id.service.ts:134` baut die Kennung
als `pocketid:${sub}`), und **genau deshalb** wird sie gezählt: die Zählung dokumentiert, **was
verworfen wird**. „Bestand annehmen statt zählen" ist der namentlich benannte Fehler der Phase 4.

### Schritt 4 — Import

Der Importer ist `scripts/import/radio.ts`, **committet, mit Test** — kein Handgriff am Server und
kein nicht committetes Skript (§9.1, Zusage an das Import-Kapitel). Er öffnet die Snapshot-Kopie per
`better-sqlite3` **lesend**, nennt seine Spalten **namentlich** (nie `SELECT *`,
`docs/runbooks/lagerbuch-cutover.md:14`) und fügt in dieser Reihenfolge ein:

`users`, `software_versions` → `devices` → `device_events` → `loans`.

**Die Reihenfolge ist Pflicht, nicht Stil:** `foreign_keys = ON` gilt auf **beiden** Seiten
(`radio-admin/server/src/db/index.ts:28`, `src/core/db/index.ts:19`), und die einzige FK-Kante des
Schemas ist `device_events.device_id → devices.id ON DELETE CASCADE`. Ein Ereignis vor seinem Gerät
bricht **hart** ab.
`api_tokens` wandert nicht als Zieltabelle (Entscheidung 13). `zugangscodes` ist **nicht Teil des
Imports** — in der Quelle gibt es nichts, was ihnen entspräche (§4.8).

⬜ **zu ergänzen nach dem Bau: die exakte Aufrufzeile von `scripts/import/radio.ts`** —
Argumentnamen, Reihenfolge, Zielpfad. Sie ist **zeichengleich** der Aufrufzeile aus der Generalprobe
(Kapitel 3); Generalprobe und Echtimport sind zwei Läufe **derselben** Datei.
**Zusage an Kapitel 2 (Import):** dort steht die Aufrufform ausgeschrieben, und dieses Kapitel
verweist darauf, statt sie zu erfinden.
⚠️ **Das `lagerbuch`-Import-Skript ist NICHT im Repo** (`scripts/import/` führt `feedback-time.ts`,
`feedback.ts`, `parity.ts`, `portal.ts`), obwohl der Import produktiv gelaufen ist. Es gibt hier also
**kein Vorbild zu lesen** — die Aufrufform kann nur aus dem Bau kommen.

**Scheitert an:** der FK-Kante (siehe Invariante 2 aus Schritt 2) oder einem `device_events.source`,
den das TS-Enum nicht kennt (Invariante 4 — das Enum steht **nur** im Quelltext,
`radio-admin/server/src/db/schema.ts:96`, es gibt keinen DB-CHECK).
**Wie man es merkt:** harter Abbruch mit SQLITE-Constraint-Fehler. Das ist der **gute** Fall.

### Schritt 5 — Parität, Stichproben, Retention-Gegenprobe

⚠️ **Dieser Schritt ist der Grund, warum dieses Kapitel überhaupt lang ist. Die Parität allein gibt
die Freigabe nicht her.**

Der Paritätscheck vergleicht Zeilen-Hashes, die aus **derselben** Mapping-Funktion auf **beiden**
Armen entstehen (`scripts/import/parity.ts:43-56`; `scripts/import/portal.ts:73-76` schreibt es selbst
hin: „both parity arms derive from `toNewService`, so a mapping bug hashes identically on both
sides"). Er beweist den Datenbank-**Rundlauf**, nicht die **Feldzuordnung** (`CLAUDE.md:241-243`).

**Der Fehler, der paritätsgrün ist und trotzdem löscht:** Quelle ist epoch-**Millisekunden**, Ziel
Drizzle `mode: "timestamp"` = Unix-**Sekunden** (Entscheidung 11). Sekunden statt Millisekunden legt
jedes `returned_at` ins Jahr **1970**. Der Retention-Purge der Alt-App läuft **sofort** beim Boot
(`radio-admin/server/src/index.ts:35` → `retentionService.ts:47`, Quellkommentar: „clears any backlog,
e.g. straight after a data migration"), Cutoff = jetzt minus zwei Monate — **der nächste Boot löscht
die komplette abgeschlossene Leihhistorie.** Aktive Leihen (`returned_at IS NULL`) überleben. **Der
Import-Test bleibt grün.** Genau deshalb übernimmt die Suite die Retention **nicht** als Sofort-Purge
beim Boot (Entscheidung 12), und genau deshalb steht `RADIO_HISTORIE_PURGE=0` im Fenster.

Drei Prüfungen, alle drei Pflicht:

**(a) Die sechs Zählungen, paarweise gegen die Sollwerte aus Schritt 2 — nicht in der Summe:**
```bash
for t in devices software_versions api_tokens users device_events loans; do
  printf '%s\t' "$t"
  sqlite3 "$DATA_DIR/radio.db" "select count(*) from $t;"
done
```
⬜ **zu ergänzen nach dem Bau: welche dieser sechs Tabellen im Ziel überhaupt existiert.** `api_tokens`
wandert nach Entscheidung 13 **nicht** als Zieltabelle; die Zeile aus §9.4.3 führt sie, weil sie in der
Paritätssicht steht. Was hier abzulesen ist, entscheidet das gebaute Schema — abzulesen ist der
Tabellenbestand von `radio.db` (`.tables`) gegen §2.5.

**(b) Die feldweisen Stichproben, je Paar eine Zeile, zeilengenau gegen die Snapshot-Kopie.** Die
verwechselbaren Paare sind namentlich benannt (`docs/radio-portierung-analyse.md:743-747`):
`issi` ↔ `tei` · `created_at` ↔ `updated_at` ↔ `last_updated_at` · `snapshot_call_sign` ↔
`borrower_name` · `alamos_integrated` ↔ `loanable` (zwei 0/1-Integer, die niemandem auffallen) ·
`serial_number` ↔ `hiorg_id` ↔ `opta`.

**(c) Die Retention-Gegenprobe.** Die Zahl aus Schritt 2 (Abfrage 7) muss in `radio.db`
wiederzufinden sein — **in Sekunden gerechnet**:
```bash
sqlite3 "$DATA_DIR/radio.db" \
  "select count(*) from loans
    where returned_at is not null
      and returned_at < strftime('%s','now','-2 months');"
```
**Erwartung:** dieselbe Zahl wie in Schritt 2.
**Weicht sie ab, hat der Faktor-1000-Fehler zugeschlagen** — und zwar an der **einzigen** Stelle, an
der er nicht paritätsgrün bleibt.
**Abbruchbedingung:** Abweichung → **kein Umschwenk.** Der Import wird verworfen, `radio.db` gelöscht,
der Mapper korrigiert, der Import läuft neu gegen dieselbe Snapshot-Kopie.

### Schritt 6 — `.env` scharf schalten, ohne die drei Router-Zeilen

Alle Zeilen aus §4.4.1 **außer** den drei mit ⏸.

**Scheitert an:** `SUITE_ACCESS_GROUP_RADIO=` (leer statt entfernt) → **Startabbruch** in Schritt 7.
**Wie man es merkt:** `up -d` läuft, der Container startet nicht, und die Meldung ist selbsterklärend.

### Schritt 7 — `up -d`

```bash
docker compose pull && docker compose up -d
docker compose logs --since 2m suite | grep -i '^radio:'
```

**Erwartung:** genau **eine** `radio:`-Zeile, und sie ist eine **`info`**: „Retention abgeschaltet"
(die Folge von `RADIO_HISTORIE_PURGE=0`). **Keine** `radio:`-**Warnung**.
**Warum die Unterscheidung trägt:** `warn` = **Stopp**, `info` = **Zustand** (§7.3.4). Wäre die
Retention-Zeile ein `warn`, träte der vorgeschriebene Cutover-Zustand seine eigene Stopp-Bedingung
aus.
**Erwartete Warnungen, die hier trotzdem legitim erscheinen können und protokolliert werden:**
„`devices` ist leer" (nach dem Import darf sie **nicht** kommen — kommt sie doch, ist `DATA_DIR`
vertippt oder das Volume nicht gemountet) und „`radio.db` wurde neu angelegt" (dieselbe Familie, eine
Stufe früher — nach dem Import ein **Stopp**).

### Schritt 8 — Verifikation gegen den ephemeren Container

⚠️ **Ohne Traefik-Labels, und der Host muss vorgetäuscht werden.** Der Container hängt an keinem
Router; erreicht wird er über IP und Port. **Ohne den `Host`-Kopf läuft jede Anfrage auf den
Portal-Fallback und prüft `radio` überhaupt nicht.**

```bash
curl -si -H 'Host: radio.iuk-ue.de' http://127.0.0.1:<port>/          | head -5   # Ausleihe, 200
curl -si -H 'Host: radio.iuk-ue.de' http://127.0.0.1:<port>/admin     | head -5   # Seite: 302 → Login
curl -si -H 'Host: radio.iuk-ue.de' http://127.0.0.1:<port>/admin/geraete/export | head -5   # Handler: 404
curl -s  -H 'Host: radio.iuk-ue.de' http://127.0.0.1:<port>/api/health/radio
curl -si -H 'Host: radio.iuk-ue.de' http://127.0.0.1:<port>/sw.js     | head -5
```

**Erwartung:** Ausleihe 200 · Health 200 mit `"module":"radio"` **und** `revision` = dem deployten
Commit (der einzige Beleg, dass wirklich der neue Stand antwortet) · `/sw.js` mit `content-type:
text/javascript`.

⚠️ **Der `/admin`-Riegel hat ZWEI Ausgänge, und sie zu verwechseln ist die Regression, die B10/B11
gerade beseitigt haben** (§4.6 Nr. 5 führt sie als Dauerprüfung):

* **Seiten und Server Actions** rufen `requireRadioAdmin()`; das endet für einen **anonymen** Abruf in
  `redirect('/login?…')` → **302 mit `location:` auf den Login.** Ein **404** hier hieße: die Seite ruft
  den Riegel gar nicht.
* **Route Handler unter `admin/`** rufen `radioHostOderNull` + `istRadioAdmin(await viewerOderNull())`
  und bauen ihre Antwort selbst → **404, nie 403 und nie ein Login-Umweg** (B10, B11, B17). Wörtlich
  umgesetzt landete ein anonymer `GET` auf `/admin/geraete/export` sonst in einem Login-Umweg, und ein
  403 machte den Bestand an Verwaltungspfaden aufzählbar.
* **Der `notFound()`-Zweig von `requireRadioAdmin` (angemeldet, aber nicht in der Gruppe) ist mit `curl`
  gar nicht erreichbar** — er braucht eine echte Sitzung und ist damit die angemeldete Negativprobe im
  Browser, kein Statuscode in dieser Liste.

**Was hier strukturell NICHT prüfbar ist** (§9.3.1) und deshalb in §4.6 wandert: der Redirect vom
Alt-Host · der **Login-Rückweg** · der alte Service Worker · die gescannten QR-Wege (die brauchen die
echte Endadresse über HTTPS, dieselbe Einschränkung wie `docs/runbooks/lagerbuch-cutover.md:290`).

⚠️ **Spec 1 empfiehlt, das Stumme davon vorwegzunehmen: Weg A — ein temporärer Host**
(`SUITE_HOST_RADIO=radio-neu.iuk-ue.de` als **echter** Wert plus passender `SUITE_TRAEFIK_RULE`-Eintrag,
§9.3.1). Dann beansprucht die Variable diesen Host wirklich, `moduleForHost` löst dort `radio` auf, der
Login-Rückweg ist vollständig prüfbar, und `/m/radio` auf dem Portal-Host wird gar nicht angefasst —
Falle 61 ist **bauartbedingt** vermieden, nicht durch Disziplin. Preis: ein zweiter DNS-Eintrag und ein
zweiter Umschwenk; beim Wechsel auf `radio.iuk-ue.de` gilt **dieselbe** Prüfung noch einmal, denn der
Rückweg hängt am **Wert**, nicht am Code.
**Zusage an Kapitel 3 (Generalprobe):** die Wahl zwischen Weg A und Weg B fällt **dort** und **vor**
dem Cutover-Abend, nicht an ihm. Fällt sie auf Weg B, ist §4.6 Nr. 10 ein benannter Schritt mit einer
**namentlich benannten Person** (E8), und `SUITE_HOST_RADIO=` leeren ist der benannte Rückweg.

### Schritt 9 — Router umschwenken

**In dieser Reihenfolge, und beide Domains im selben Handgriff:**

1. **Alt-Router zuerst weg.** `radio-inventar` vom Traefik-Router nehmen (Labels entfernen bzw.
   Service aus dem Stack). Nie zwei Router gleichzeitig auf derselben Domain — welcher gewinnt, ist
   nicht deterministisch (`docs/runbooks/files-cutover.md:167-170`).
2. **Die drei ⏸-Zeilen setzen — in EINER Änderung:** `SUITE_HOST_RADIO`, die
   `SUITE_TRAEFIK_RULE`-Erweiterung, `SUITE_REDIRECT_RULE_RADIO_ADMIN`.
3. ```bash
   docker compose up -d
   docker compose config | grep -A2 radio-admin-alt   # ins Protokoll
   ```

**Ab hier läuft die Uhr:** der Rückweg ist ab dem **ersten fachlichen Schreibvorgang** in `radio.db`
kein Routing-Vorgang mehr (§4.9).

---

## 4.6 Die Verifikation nach dem Umschwenk

Kein Punkt ist durch einen Statuscode allein erfüllt. Ausgabe danebenschreiben.

**1. Die Ausleihe antwortet, und es ist nicht das Portal.**
```bash
curl -si https://radio.iuk-ue.de/ | head -20
```
**Erwartung:** HTTP 200 **und** im Body eine Zeichenkette, die es nur auf der Ausleih-Fläche gibt.
⚠️ **`-si`, nicht `-sI`** — ein HEAD hat keinen Body und prüft damit nichts
(`docs/runbooks/suite-update-webfinger.md:220`). Portal und Ausleihe antworten **beide** 200; nur der
Body unterscheidet sie. Das ist der Handgriff gegen den ersten stillen Fall aus §4.4.2.
⬜ **zu ergänzen nach dem Bau: die Zeichenkette aus dem modul-eigenen Ausleih-Rahmen (Spec 1 §4.2), die
im Portal-HTML nicht vorkommt** — sie ist der `grep`-Anker dieses Schritts. Eine erfundene Zeichenkette
wäre ein Test, der grün ist, weil er nichts trifft.

**2. Keine toten `localtest.me`-Links** (Post-Cutover-Befund 2).
```bash
curl -si https://radio.iuk-ue.de/ | grep localtest.me       # muss LEER sein
curl -si https://radio.iuk-ue.de/admin | grep localtest.me  # muss LEER sein
```
**Erwartung: leere Ausgabe.** Wieder `-i`, nicht `-I`.

**3. Health nennt das Modul und die Revision.**
```bash
curl -s https://radio.iuk-ue.de/api/health/radio
```
**Erwartung:** 200, `"module":"radio"`, `revision` = deployter Commit.
⚠️ **Nie `/api/health`.** `src/app/api/health/route.ts` liefert konstant `{status:"ok"}` ohne Modul und
ohne Datenbank; `radio.iuk-ue.de/api/health` antwortet nach dem Cutover weiter `ok`, **ohne etwas über
radio zu sagen**. Monitor und `docs/deployment.md` mit umstellen.
⚠️ **Und Health beweist weniger als der Name:** `openModuleDatabase` legt Verzeichnis und Datei stumm an
(`src/core/db/index.ts:12-22`) — ein vertipptes `DATA_DIR` oder ein nicht gemountetes Volume ergibt eine
**nagelneue, leere** `radio.db`: Health grün, null Geräte. Deshalb Nr. 4.

**4. Der zählende Check ersetzt `status:"ok"`.** Die sechs Zählungen aus Schritt 5 (a) **noch einmal**,
paarweise gegen die Sollwerte aus Schritt 2. Dieselbe Zahl vorher und nachher (Muster
`docs/runbooks/lagerbuch-cutover.md:452`, `:544`).

⚠️ **Was dieser Befehl beweist und was nicht — sonst prüft er genau den Fall nicht, für den er da ist.**
`sqlite3 "$DATA_DIR/radio.db"` läuft auf dem **Host** und beweist damit **die importierte Datei**. Ist
`DATA_DIR` im **Container** vertippt oder das Volume nicht gemountet, zeigt der Host weiter die
importierten Zahlen, während der Container eine **nagelneue, leere** `radio.db` bedient — Health grün,
null Geräte (§9.1, „Health beweist weniger als der Name"). Was **die Sicht des Containers** beweist, sind
drei andere Dinge: die zwei Log-Zeilen aus Schritt 7 („`devices` ist leer" / „`radio.db` wurde neu
angelegt" — nach dem Import **beide** ein Stopp), das `revision`-Feld aus Nr. 3, und der Body aus Nr. 1.

**5. `/admin` riegelt ab — mit ZWEI verschiedenen Ausgängen — und `/sw.js` liefert den Abräum-Worker.**
```bash
curl -si https://radio.iuk-ue.de/admin | head -5
#   erwartet: 302 + location: …/login?…   (Seite, requireRadioAdmin)
#   ein 404 hier heisst: die Seite ruft den Riegel nicht.
curl -si https://radio.iuk-ue.de/admin/geraete/export | head -5
#   erwartet: 404. Nie 403 (macht Verwaltungspfade aufzaehlbar, B10),
#   nie ein Login-Umweg (B11: Route Handler benutzen das PRAEDIKAT, nicht den werfenden Riegel).
curl -si https://radio.iuk-ue.de/sw.js | head -5
```
**Erwartung `/sw.js`:** `content-type: text/javascript; charset=utf-8`, `cache-control: no-cache`, und
im Body die Abräum-Quelle (`self.registration.unregister()`).
**Kommt hier HTML oder Portal-Inhalt, greift der Rewrite nicht** — also ist `SUITE_HOST_RADIO` falsch
gesetzt (§7.1.4). Das ist derselbe stille Fall wie Nr. 1, nur mit einer schärferen Ausgabe.

**6. Kein radio-Manifest auf einem fremden Host.**
```bash
curl -si https://iuk-ue.de/manifest.webmanifest | head -20
```
**Erwartung: kein radio-Manifest.** Die Prüfzeile ist im Haus schon formuliert und wird zeichengleich
übernommen (`docs/runbooks/lagerbuch-cutover.md:436`, R36 / Falle 56). Der Fehlfall, den sie fängt: ein
Manifest oder Icon an der **Wurzel** statt unter `src/app/m/radio/` bewürbe **jeden** Suite-Host als
radio-PWA — alle Suite-Hosts hängen an **einem** Traefik-Router auf **einem** Container
(`compose.yaml:146-155`).
⚠️ **`radio` baut ausdrücklich KEINE PWA** (§7.1.1) — es gibt also gar kein radio-Manifest, das hier
auftauchen dürfte. Die Prüfung bleibt trotzdem Pflicht: sie prüft nicht eine Zusage, sondern deren
Verletzung.
⬜ **zu ergänzen nach dem Bau: was `curl -si https://radio.iuk-ue.de/manifest.webmanifest` tatsächlich
liefert** (404, oder das Manifest eines anderen Moduls über den Rewrite). Was hier richtig ist, entscheidet
die gebaute Routentabelle; eine Erwartung dazu wäre hier eine Erfindung.

**7. Der Redirect vom Alt-Host trifft** (alle drei, protokollpflichtig, §9.2.3):
```bash
curl -si https://radio-admin.iuk-ue.de/geraete | head -5
#   erwartet: HTTP/2 302  +  location: https://radio.iuk-ue.de/admin/geraete
curl -si https://radio-admin.iuk-ue.de/       | head -5
#   erwartet: HTTP/2 302  +  location: https://radio.iuk-ue.de/admin/
curl -si https://radio.iuk-ue.de/             | head -5
#   erwartet: HTTP/2 200 — der Ziel-Host darf NICHT redirecten.
```
**Ein 302 in der dritten Zeile heißt: die Middleware hängt am Service statt am Router.**
**Ein `location: …/admin/` für JEDEN Pfad in der ersten Zeile heißt: `$$` wurde von Compose
verschluckt** — der Redirect funktioniert, ist aber nicht mehr pfaderhaltend (§4.4.4 Punkt 3).

**8. Das Traefik-Access-Log zeigt keine wachsende `/m/<key>`-Kette** (Post-Cutover-Befund 1).
```bash
docker logs --tail 200 <E7> | grep -o '/m/[^ "]*' | sort -u | head
```
**Erwartung:** kein `/m/radio/m/radio/…`. Jede weitere Ebene ist ein RSC-/Prefetch-Request, der eine
Ebene akkumuliert.

**9. Ein Blick in das Suite-Log, mit der scharfen Trennung.**
```bash
docker compose logs --since 2m suite | grep -i '^radio:'
```
**Erwartung:** genau eine Zeile, `info`, „Retention abgeschaltet". **Jede `radio:`-Warnung ist ein
Stopp-Punkt, kein Hinweis.**

**10. Der Login-Rückweg — Handarbeit, nicht automatisierbar.** Einmal von `https://radio.iuk-ue.de/admin`
aus anmelden und prüfen, dass man **dort** wieder landet, nicht auf dem Portal.
**Wie der Fehlfall aussieht:** man landet auf `iuk-ue.de`, ohne Fehler und ohne Meldung
(`src/core/hosts.ts:59-63`: „Ein curl sieht davon nichts"). **Diese Prüfung ist die einzige, deren
Fehlfall vollständig stumm ist** — deshalb macht sie eine namentlich benannte Person (E8), und
deshalb ist es dieselbe Person, die im nächsten Schritt den ersten Zugangscode ausstellt (§4.8.2).
⚠️ Betrifft nur `/admin`, aber genau die Personen, die den Cutover verantworten. Und: **nach einer
neuen Anmeldung** prüfen, wenn die Gruppe am selben Abend angelegt wurde (bis zu eine Stunde Verzug,
`CLAUDE.md:151-156`).

**11. Ein Telefon, das den Alt-Kiosk kannte, einmal neu laden.** Siehe §4.7.

**12. Das Backup einmal von Hand — der Glob ist bewiesen, wenn er gelaufen ist.**
```bash
scripts/backup.sh
tar -tzf <das erzeugte Tarball> | grep radio.db
```
**Erwartung:** `radio.db` ist im Tarball. `scripts/backup.sh:25-27` sammelt `"$DATA_DIR"/*.db` per
`nullglob` und sichert jede Datei per `sqlite3 .backup` (`:41-43`) — **ohne jede Skriptänderung**.
`BACKUP_KEEP` bleibt unverändert.

**13. Die Retention wieder einschalten — und der zweite Log-Blick, in dem die Zeile FEHLT.**
Nach bestandener Verifikation: `RADIO_HISTORIE_PURGE=0` **aus der `.env` entfernen**, `up -d`, dann
```bash
docker compose logs --since 2m suite | grep -i '^radio:'
```
**Erwartung: keine Zeile mehr.** Ein nach dem Fenster **vergessenes** `RADIO_HISTORIE_PURGE=0` ist ein
**stiller** Verlust der Löschrichtlinie, die der DSGVO-Grund für `borrower_name` ist — die Info-Zeile
bei **jedem** Start ist das einzige, was ihn findbar hält (§7.3.4). Der erste Purge läuft danach nach
`RADIO_HISTORIE_ERSTLAUF_MINUTEN` (Vorbelegung **1440**, ein Tag, B5) — bewusst so lang, dass
Verifikation, Stichprobe und „Router zurück" noch ins Fenster passen.

**14. Der Monitor zeigt auf `/api/health/radio`**, nicht auf `/api/health`. (Vorbild für den Fehlfall:
`docs/runbooks/lagerbuch-cutover.md:122` — „Der Monitor zeigt auf den falschen Endpunkt".)

---

## 4.7 Der Service Worker des Alt-Kiosk

⚠️ **Er überlebt den Umschwenk, weil der Origin zeichengleich bleibt.** Gemessen (Spec 1 §7.1.2):
Registrierung mit **Root-Scope** (`radio-inventar/apps/frontend/src/hooks/usePWA.ts:72-73`), Cache-Name
`radio-inventar-v1` (`public/sw.js:2`), `skipWaiting()` + `clients.claim()` (`:24`, `:40`), also
**aktiv ohne Reload**.

**Was das konkret heißt:**

* **Kein dauerhaft veraltetes HTML.** Navigationen sind **network-first** (`sw.js:78-96`); solange Netz
  da ist, kommt die Suite-Antwort durch.
* **Aber ohne Netz** liefert der alte Worker `/` aus seinem Cache — die **Alt-Oberfläche**, gegen ein
  Backend, das es nicht mehr gibt.
* **Und `cache-first` gilt dauerhaft** für `/manifest.json`, `/favicon.svg`, `/apple-touch-icon.svg` und
  drei Icons (`sw.js:100-127`): eine installierte Alt-PWA bewirbt sich nach dem Cutover **weiter mit
  dem alten Manifest**.
* **Dazu die zwischengespeicherten `/api`-Antworten:** Bestands- und Ausleihdaten samt Ausleihernamen
  liegen im Cache eines fremden Telefons.

*Kein Gate sieht davon etwas:* **HTTP 200 mit veraltetem Inhalt.** Kein Build, kein Test, kein
Healthcheck.

### 4.7.1 Der Abräum-Worker gehört in den ERSTEN Deploy

Spec 1 §7.1.3 baut ihn: `src/app/m/radio/sw.js/route.ts` liefert `RADIO_SW_ABRAEUM_QUELLE` aus
`_lib/sw-quelle.ts`, geriegelt durch `hostAbweisung(req) ?? …` (die **nicht werfende** Riegelform, weil
ein `notFound()` eine HTML-Fehlerseite wäre und der Browser „manifest fetch failed" bzw. einen
irreführenden Registrierungsabbruch meldete). Der Worker hat **keinen `fetch`-Handler**, löscht **alle**
Cache-Namen über `caches.keys()` (ein fester Name wäre eine Annahme) und ruft `skipWaiting()` +
`clients.claim()` **vor** `unregister()`.

**Er muss VORHER deployt sein — im Deploy aus §4.2 Nr. 1, nicht im Cutover.** Grund: **nichts in der
Suite ruft `navigator.serviceWorker.register()`.** Die Route wird ausschließlich von der
**Update-Prüfung eines schon registrierten Workers** abgeholt — der Browser holt das Worker-Skript bei
einer Navigation im Scope neu und vergleicht die Bytes. Kommt der Abräum-Worker erst mit dem Cutover,
gibt es im entscheidenden Fenster nichts, was sich vom Alten unterscheidet.
Auf einem Gerät, das den Alt-Kiosk **nie** geöffnet hat, wird die Route nie abgerufen — das ist richtig
und kein Fehler.

### 4.7.2 Wie man am Cutover-Abend prüft, dass er greift

**Zwei Hälften, und die erste beweist die zweite nicht.**

**Hälfte 1 — die Route liefert das Richtige** (`curl`, siehe §4.6 Nr. 5): `content-type:
text/javascript`, im Body `self.registration.unregister()`.
**Was man sieht, wenn nicht:** HTML, oder Portal-Inhalt → der Rewrite greift nicht, `SUITE_HOST_RADIO`
ist falsch.

**Hälfte 2 — ein echtes Gerät, und das kann kein `curl`.** ⚠️ **`curl` hat keinen Service Worker.**
Ein Telefon, das den Alt-Kiosk kannte, wird **einmal** neu geladen (Runbook-Zeile aus §7.1.3).
**Erwartung:** im **schlechtesten** Fall **eine** veraltete Seitenansicht, danach die
Suite-Oberfläche; die Registrierung ist weg und die Cache Storage leer.
**Was man sieht, wenn er nicht greift:** HTTP 200 mit der **Alt-Oberfläche**, `radio-inventar-v1` steht
weiter in der Cache Storage, und im Flugmodus erscheint die alte `offline.html`.
⬜ **zu ergänzen nach dem Bau: der genaue Ablesepunkt in den Browser-Entwicklerwerkzeugen** —
welche Einträge unter *Application → Service Workers* und *Application → Cache Storage* nach dem
Reload leer sein müssen, und ob dort noch ein „redundant"-Eintrag stehen bleibt. Das hängt am gebauten
Worker und wird abgelesen, nicht behauptet.

**Umfang des Handgriffs:** **E6** — wie viele Geräte den Alt-Token im `localStorage` tragen, ist im Repo
**nicht abzählbar** (der Token liegt im `localStorage`, es gibt keine Tabelle). Die Antwort ist eine
**Begehung, kein `SELECT`**. Für Geräte, die den Kiosk **installiert** haben, kommt „einmal Speicher
löschen" dazu — das ist ein Handgriff pro Gerät, kein Serverbefehl.

**Und das gehört in die Ankündigung:** der Worst Case ist **eine** veraltete Seitenansicht je Gerät
(§4.8.3).

---

## 4.8 Der Ausstellungsplan für die Zugangscodes

Spec 1 §3.9 hängt daran, und **C.3 ist offen** (U2: sind gedruckte Aufsteller im Umlauf, wo, und wer
kann sie ersetzen?). Beide Zweige sind hier behandelt, weil die Entscheidung am Cutover-Abend zu spät
kommt.

**Die gemeinsame Lage, gegen die beide Zweige laufen:** `zugangscodes` ist **nicht Teil des Imports**
(§2.8.2 Nr. 5) — in der Quelle gibt es nichts, was ihnen entspräche. Der heutige QR-Code trägt den
**einen geteilten API-Token base64-kodiert als URL-Parameter**, ohne Ablauf und ohne Widerruf
(`radio-inventar/apps/frontend/src/components/features/admin/AppQRCode.tsx:11-23`). Und `seedLokal`
legt **niemals** eine einlösbare Zugangszeile an (§9.3.2 Nr. 2).
**Daraus folgt der Zustand, den niemand plant und den man sonst um 22 Uhr entdeckt:** unmittelbar nach
dem Umschwenk steht eine **anonym erreichbare Ausleih-Fläche** ohne **einen einzigen einlösbaren
Code**. Der erste Satz Codes entsteht **in der Suite**, ausgestellt von einem `radio`-Admin
(`erstelleCode(bezeichnung)`, erste Anweisung `requireRadioAdmin()`, §3.2.3).

### 4.8.1 Zweig „ja, es sind gedruckte Aufsteller im Umlauf" (C.3 = ja)

⚠️ **„Bestandscodes zeichengleich übernehmen" ist hier NICHT möglich** — das ist der Satz, den C.3
offenlässt und der hier zu korrigieren ist. Ein Aufsteller trägt heute einen base64-Token in einer URL,
kein 28-Zeichen-Crockford-Base32-Code in sieben Gruppen (§3.2.1). Es gibt **keine Zeichenkette zu
übernehmen**. Der Zweig ist also **kein Datenvorgang, sondern ein Austausch von Papier**:

1. **Zählen und verorten** (E5): Anzahl, Ort, wer sie ersetzen kann. Papier ist für jedes Tor
   unsichtbar.
2. **Je Aufsteller ein Code**, ausgestellt in der Suite mit einer `bezeichnung`, die den **Ort** nennt
   — nur so ist später ein einzelner Aufsteller sperrbar, ohne die anderen mitzunehmen. Der Code wird
   **einmal** zurückgegeben und danach in der Verwaltungsliste im Klartext angezeigt und gedruckt: er
   ist kein Einmalgeheimnis, sondern ein **Dauerausweis** (§3.2.3/§3.2.4).
3. **Drucken** über `admin/(druck)/zugaenge/blatt` — die eigene Route-Group ist der Grund, warum das
   Druckblatt Kopfzeile, Navigation und `controlHeight: 44` **nicht** auf Papier erbt (B9, Falle 4).
4. **Austauschen, mit Datum je Ort ins Protokoll.**
5. **Solange ein Aufsteller nicht ersetzt ist, ist die Handeingabe der Ausweichweg:** der Code wird der
   betroffenen Person **außerhalb** des Aufstellers mitgeteilt und in das Feld auf der Startseite
   getippt (Groß-/Kleinschreibung gleichgültig, §3.9 Absatz 3).
   **Was schiefgeht, wenn man diesen Ausweichweg nicht plant:** der alte QR-Code hört mit dem Port auf
   zu funktionieren, und wer vor dem Aufsteller steht, hat **keinen** Weg herein.
6. **Abbruchbedingung für den Umschwenk:** Schritt 5 ist nicht abgedeckt und es ist niemand erreichbar,
   der Codes ausstellen kann → der Umschwenk wird verschoben, nicht durchgeführt.

### 4.8.2 Zweig „nein, es sind keine im Umlauf" (C.3 = nein)

Dann entstehen **alle** Codes in der Suite, und die einzige offene Frage ist die, die sonst am Abend
gestellt wird: **wer stellt den ersten aus, wann, und auf welchem Host?**

**Festlegung, damit sie nicht um 22 Uhr fällt:**

1. **Wer:** die namentlich benannte Person aus **E8** — dieselbe, die §4.6 Nr. 10 durchführt. Das ist
   kein Zufall: `erstelleCode` verlangt `requireRadioAdmin()` auf dem **umgeschwenkten** Host, also
   eine Anmeldung genau auf dem Weg, dessen Fehlfall stumm ist. **Der Schritt beweist beides in
   einem.**
2. **Wann:** **unmittelbar nach** §4.6 Nr. 3 (Health grün, Modul antwortet) und **vor** der Freigabe an
   die Nutzer. Nicht vorher — auf dem Alt-Host gibt es die Fläche nicht.
3. **Auf welchem Host:** `https://radio.iuk-ue.de/admin/zugaenge` (der Pfadname ist mit B9 entschieden).
   Nicht über den Portal-Host, nicht über den internen `/m/radio`-Pfad — dort antwortet der Host-Riegel
   mit 404.
4. **Wie viele:** mindestens einer je Ort, an dem geliehen wird, mit ortsnennender `bezeichnung`.
   Ein einziger Code für alles ist technisch gültig und betrieblich der Rückfall in genau das Modell,
   das Entscheidung 8 abschafft: ein Code, den man sperren muss, sperrt dann alle.
5. **Abbruchbedingung:** die benannte Person kann sich nicht anmelden oder landet nach dem Login auf dem
   Portal → **Stopp**, und der Fall ist §4.6 Nr. 10, nicht ein Codeproblem. Rückweg §4.9.

### 4.8.3 Die Neuigkeitennotiz ist ein Schritt am Rollout-Tag, kein Vorab-Commit

Spec 1 §3.9 legt Datei, Titel und Text fest; **drei Dinge werden am Cutover-Tag gesetzt** (Zusagen von
§3.9 an das Runbook):

* **`datum`** = der Tag des **Rollouts**, nicht des Commits.
* **die Registerzeile** in `src/app/m/portal/_lib/neuigkeiten/notizen/register.ts` — das Dreieck ist
  Dateiname ↔ Felder (`modul`, `datum`, `slug`) ↔ Registerzeile, und `register.test.ts` hält alle drei
  zusammen.
* **`<N>`** = der tatsächlich gesetzte Wert von `RADIO_AUSLEIH_SITZUNG_STUNDEN` (**E4**),
  **ausgeschrieben** („zwölf Stunden", nicht „12"). Er ist der einzige Platzhalter der Notiz, und er ist
  einer mit Grund: eine Anwendernotiz, die eine unbestätigte Zahl behauptet, ist eine falsche Auskunft,
  die niemand mehr korrigiert.

**Kein Markdown im Text** — er wird als Textknoten gerendert, `**fett**` käme mit Sternchen auf dem
Bildschirm an, und `register.test.ts` prüft es.
**Und der Satz aus §7.1.3 gehört hinein:** im schlechtesten Fall **eine** veraltete Seitenansicht je
Gerät nach dem Umschwenk (§4.7.2).

---

## 4.9 Der Rückweg

**Er ist ein Routing-Vorgang, und er hat drei Handgriffe — nicht zwei.**

```dotenv
SUITE_HOST_RADIO=                       # LEEREN, die Zeile NICHT entfernen
SUITE_TRAEFIK_RULE=...                  # radio.iuk-ue.de herausnehmen
SUITE_REDIRECT_RULE_RADIO_ADMIN=        # leeren; `${…:-radio-admin.invalid}` greift bei leer UND ungesetzt
```
```bash
docker compose up -d
```

**Und dann der dritte Handgriff, der bei `lagerbuch` fehlte — und er ist zweiteilig, weil der Freeze
in §4.5 Schritt 1 zwei Stacks angehalten hat:**

```bash
# 3a) radio-admin zuerst: er ist die Datenquelle des Kiosk.
docker compose -f radio-admin/docker-compose.yml start app
# 3b) dann der Kiosk selbst, samt seinem Postgres.
docker compose -f radio-inventar/docker-compose.yml start postgres backend
# 3c) beide wieder an den Traefik-Router: radio.iuk-ue.de auf radio-inventar,
#     radio-admin.iuk-ue.de auf radio-admin (die Labels, die der Cutover entfernt hat).
```

⚠️ **Die Reihenfolge 3a vor 3b ist keine Kosmetik.** Der Kiosk ist Konsument der sechs `/v1`-Routen von
`radio-admin` (`radio-admin/server/src/routes/loanApi.ts`, gesetzte Entscheidung 15). Allein
zurückgeholt, startet er und zeigt **keinen Bestand** — ein Rollback, der aussieht wie ein zweiter
Ausfall. Und `radio-inventar`s Backend hängt per `depends_on: postgres: condition: service_healthy`
(`radio-inventar/docker-compose.yml:42-44`): ohne Postgres startet er gar nicht.
⚠️ **`radio-admin.iuk-ue.de` braucht seinen eigenen Router zurück**, sobald
`SUITE_REDIRECT_RULE_RADIO_ADMIN` geleert ist — sonst ist der Alt-Verwaltungshost nach dem Rollback tot.
Der DNS-Eintrag bleibt in beiden Richtungen unangetastet (§4.4.4).

⚠️ **Bei `radio` bedeutet der Rückweg etwas anderes als bei `lagerbuch`.** Dort nahm er die Domain
**vom Netz** (`docs/runbooks/lagerbuch-cutover.md:420`). Hier ist der **Alt-Kiosk der Rückfall**, weil
er `radio.iuk-ue.de` bis zum Umschwenk bedient hat. Ohne 3a–3c ist die Domain nach dem „Rollback"
**tot**.

⚠️ **Und der Start von `radio-admin` in Schritt 3a ist selbst gefährlich: er löscht Historie.**
`radio-admin/server/src/index.ts:35` ruft `startRetentionSchedule`,
`radio-admin/server/src/services/retentionService.ts:47` purgt **sofort**, erst `:48` folgt der
Tagestimer, und der Cutoff hängt an der **Wanduhr** (`:9`, `:19`). Der Kiosk (`radio-inventar`) purgt
nichts — die Gefahr sitzt **allein** in 3a. Ein Rollback ist deshalb nur zulässig, wenn §4.2 Nr. 3
(Retention neutralisiert **oder** Volume kopiert) **als erfüllt nachgewiesen** ist. Sonst wird der
Start abgesagt — auch der Rollback.
**Wie man den Schaden merkt, wenn man es doch tut:** ein **erfolgreicher** Start mit der Zeile
`[retention] purged N expired loan(s)` (`retentionService.ts:41`). Kein Fehler, kein roter Test.

**Was der Rückweg NICHT zurückholt:**

1. **Jede Ausleihe und jede Rückgabe, die nach dem Umschwenk in `radio.db` gelandet ist.** Es gibt
   **keinen** Rückweg-Importer (Suite → radio-admin) und kein Vorbild dafür
   (`docs/radio-portierung-analyse.md:626-628`). Die Zeilen stehen in einer SQLite-Datei, die die
   Alt-Apps nie lesen.
2. **Die Historie, die ein Start des Alt-Stacks bereits gelöscht hat.** Der Cutoff hängt an der
   Wanduhr — **jeder weitere Start löscht mehr als der vorige.**
3. **Die ausgestellten Zugangscodes** (§4.8). `zugangscodes` existiert in der Alt-App nicht; ein
   gedruckter Suite-Code ist nach dem Rollback wertlos, und der alte QR-Weg gilt wieder.
4. **Die Cache Storage der Telefone, auf denen der Abräum-Worker schon gelaufen ist.** Sie sind leer und
   die alte Registrierung ist weg — kein Schaden (der Kiosk registriert bei der nächsten Navigation
   neu), aber die erste Ansicht kommt dann aus dem Netz, nicht aus dem Cache.
5. **Nichts an einem 301** — deshalb ist der Redirect ein **302** (§4.4.4 Punkt 2). Ein 301 läge im
   Cache jedes Telefons und machte genau diesen Rückweg praktisch unmöglich.

**Die zwei Fristen, ausgeschrieben, damit sie nicht um 22 Uhr entschieden werden (§9.3.3):**

* **Point of no return:** der **erste fachliche Schreibvorgang** in `radio.db` — die erste Ausleihe oder
  Rückgabe nach dem Umschwenk. Ab da ist der Rollback ein **Datenverlust mit bekanntem Umfang**, keine
  Routing-Rücknahme.
* **Frist:** Rollback **ohne Nachtrag** nur innerhalb der **ersten Stunde** nach dem Umschwenk, und in
  dieser Stunde bleibt der Kiosk unter Beobachtung. Danach nur noch vorwärts.

**Der Nachtrag, wenn in der Frist zurückgezogen wird — ausgeschrieben, nicht improvisiert:**
```bash
sqlite3 "$DATA_DIR/radio.db" \
  "select id, device_id, borrower_name, borrowed_at, returned_at, return_note
     from loans where created_at >= <umschwenk_epoch_sekunden> order by created_at;"
```
⚠️ **Die Zeitstempel stehen hier in Sekunden, die Alt-App erwartet Millisekunden — beim Nachtragen mit
1000 multiplizieren.** Derselbe Faktor, andere Richtung.

**Was der Rückweg nicht ist:** ein Rückzug auf ein älteres **Image**. Die Rollback-Körnung ist **grob**
— ein älteres Image nimmt portal, qr, feedback, files, lagerbuch und aufgaben mit. Der Teilrückzug ist
die `.env`, nicht das Image.

---

## 4.10 Zusagen und Leerstellen dieses Kapitels

**Zusagen an andere Kapitel:**

| An | Zusage |
|---|---|
| **Kapitel 2 (Import)** | Dieses Kapitel ruft `scripts/import/radio.ts` und verweist auf die dort ausgeschriebene Aufrufform, statt sie zu erfinden. Es verlangt: Skript **committet mit Test**, Einfügereihenfolge `users`/`software_versions` → `devices` → `device_events` → `loans`, Spalten **namentlich**, `zugangscodes` **nicht** im Import, und die Retention-Gegenprobe aus Schritt 5 (c) als Freigabebedingung |
| **Kapitel 3 (Generalprobe)** | Die Wahl zwischen Weg A (temporärer Host `radio-neu.iuk-ue.de`) und Weg B (Nachprüfung als erster Schritt nach dem Umschwenk) fällt **dort** und **vor** dem Cutover-Abend. Dort entstehen außerdem die zwei Messungen aus §4.2 Nr. 7 (Volumengröße, Dump-Dauer), die das Fenster bemessen |
| **Kapitel 5 (Abbau)** | Der Redirect steht **mindestens** bis zum Ende des Standby-Fensters; seine Abbau-Bedingung ist „vier zusammenhängende Wochen kein Treffer auf `radio-admin.iuk-ue.de` im Traefik-Zugriffsprotokoll", und die Reihenfolge ist Labels → `.env`-Zeile → **DNS zuletzt**. Die fünf Postgres-Zählungen aus §9.4.2 sind Abbau-Schritte, brauchen aber das in §4.5 Schritt 3 gesicherte Volume. `radio-inventar` und `radio-admin` bleiben **im Standby** und dürfen nicht abgebaut werden, solange das Rollback-Fenster läuft |

**Die benannten Leerstellen dieses Kapitels** — jede ist eine Ablesung nach dem Bau, keine Entscheidung:

| ⬜ | Was genau abzulesen ist | Wo |
|---|---|---|
| ⬜ 1 | Die exakte Aufrufzeile von `scripts/import/radio.ts` (Argumentnamen, Reihenfolge, Zielpfad), zeichengleich in Generalprobe und Echtimport | §4.5 Schritt 4 |
| ⬜ 2 | Welche der sechs Tabellen im Zielschema tatsächlich existiert (`.tables` von `radio.db` gegen §2.5) — `api_tokens` wandert nach Entscheidung 13 nicht als Zieltabelle | §4.5 Schritt 5 (a) |
| ⬜ 3 | Die Zeichenkette aus dem modul-eigenen Ausleih-Rahmen, die im Portal-HTML **nicht** vorkommt — der `grep`-Anker der Portal-Fallback-Probe | §4.6 Nr. 1 |
| ⬜ 4 | Was `curl -si https://radio.iuk-ue.de/manifest.webmanifest` tatsächlich liefert (404 oder ein fremdes Manifest über den Rewrite) | §4.6 Nr. 6 |
| ⬜ 5 | Der genaue Ablesepunkt in den Entwicklerwerkzeugen nach dem Reload (Service Workers / Cache Storage), und ob ein „redundant"-Eintrag stehen bleibt | §4.7.2 |
| ⬜ 6 | Welche Entrypoints der Edge-Proxy an Traefik weitergibt, und ob `radio-admin.iuk-ue.de` dort bekannt ist — Server-Ablesung, keine Repo-Frage | §4.4.4 Punkt 6 |

**Die offenen Punkte, die kein ⬜ sind, weil nur der Betreiber oder der Server sie beantwortet:** E1–E8
in §4.3, dazu U9 (die 19.07.-Divergenz von Repo- und Server-`compose.yaml`, als **Frage** gestellt,
nicht als Tatsache gesetzt) und C.5/U4 (wer das radio-inventar-Frontend produktiv ausliefert — es
blockiert den **Freeze** in §4.5 Schritt 1, nicht erst den Abbau).
