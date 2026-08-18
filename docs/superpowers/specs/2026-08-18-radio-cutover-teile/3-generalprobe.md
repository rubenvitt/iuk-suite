# 3. Generalprobe und Verifikation ohne Parallelfenster

**Was dieses Kapitel entscheidet:** wie vor dem Umschwenk überhaupt etwas geprüft wird, obwohl die
Endadresse `radio.iuk-ue.de` **schon besetzt ist** — vom Alt-Kiosk (gesetzte Entscheidung 3,
`docs/radio-portierung-analyse.md:1771`). Es legt die Generalprobe fest (Ablauf, Messgrößen,
Grün-Bedingung, Abbruchpunkt), schreibt den ephemeren Container aus, benennt die drei Stufen, mit denen
der Modul-Host vorgetäuscht wird, und zählt auf, was an diesem Container **strukturell nicht** prüfbar
ist.

**Was es nicht entscheidet:** den Freeze, den echten Snapshot und den Import gegen das produktive
Volume (Kapitel 2), die Reihenfolge des Umschwenks und den Redirect vom Alt-Host (Kapitel 4), den Abbau
und die Zählungen davor (Kapitel 5). Kapitelnummern in diesem Text meinen: **2 = Import und Freeze ·
4 = Umschwenk · 5 = Abbau.**

**Die Lage in einem Satz.** Es gibt **kein Parallelfenster**: Alt-Kiosk und Suite können denselben
Origin nicht gleichzeitig bedienen, und das Suite-Muster „nie zwei Router gleichzeitig aktiv"
(`CLAUDE.md:239`) ist hier keine Vorsichtsregel, sondern eine physische Grenze. Deshalb ist der
**ephemere Container ohne Traefik-Labels** (`CLAUDE.md:238`) bei `radio` nicht eine von mehreren
Prüfgelegenheiten, sondern die **einzige** vor dem Umschwenk. Der Rückweg ist „Router zurück", nichts
sonst.

---

## 3.1 Die Generalprobe

### 3.1.1 Was sie ist — und was das Wort hier nicht bedeutet

Die Generalprobe ist der **vollständige Import in eine Wegwerf-Umgebung, gegen eine Kopie des
Snapshots, mit anschließender Verifikation am ephemeren Container.** Sie läuft **vor** dem
Cutover-Abend, mehrfach, und niemals gegen das produktive Volume.

Drei Dinge sind dabei streng getrennt, und die Trennung ist der ganze Sicherheitsgewinn:

| Ding | In der Generalprobe | Im Echtlauf (Kapitel 2) |
|---|---|---|
| **Quelle** | `radio-admin-snapshot.sqlite` — die **Kopie** aus §9.4.1 | derselbe Weg, aber nach dem Freeze neu gezogen |
| **Ziel** | Wegwerf-`DATA_DIR` (`$GP/data`), Datei `radio.db` | das produktive Volume `suite_data` |
| **Läufer** | ephemerer Container **ohne Labels**, Port 3999 | der reguläre Stack aus `compose.yaml` |

⚠️ **Die Quelle wird nie zweimal gezogen und nie gegen einen laufenden Alt-Stack abgefragt.** Jeder
Start von `radio-admin` löscht Historie: `radio-admin/server/src/index.ts:35` ruft
`startRetentionSchedule`, und `radio-admin/server/src/services/retentionService.ts:47` führt `purge()`
**sofort** aus — Kommentar dort: „clears any backlog, e.g. straight after a data migration". Der Cutoff
hängt an der Wanduhr (`:9`, `:19`), also löscht **jeder weitere Start mehr als der vorige**. Das ist
kein Fehler und kein rotes Log, sondern eine Erfolgszeile (`retentionService.ts:41`,
`[retention] purged N expired loan(s)`). **Alle Abfragen der Generalprobe laufen gegen die
Snapshot-Kopie** (§9.3.4 Zeile 2).

### 3.1.2 Der Aufbau, ausgeschrieben

**Die Blöcke in diesem Kapitel sind `bash`.** Die Shell des Betreibers ist `fish`, die weder
`for … do … done` noch diese `$( )`-Verschachtelungen so kennt — vorher einmal `bash` starten. Die
übrigen Runbooks des Hauses sind ebenfalls bash-geschrieben; das ist Hausstil, aber eine erste
Fehlermeldung aus der falschen Shell kostet im Fenster genauso viel Zeit wie eine echte.

```bash
# ---- 0) Einmalig: Kennung aus dem Image lesen -------------------------------
# Warum: Dockerfile:88 startet den Prozess als `USER nextjs`, und Dockerfile:72
# (`RUN mkdir -p /data/files && chown nextjs:nodejs /data`) übereignet den
# Mountpunkt. Schreibt der Import als root in dasselbe Verzeichnis, gehört
# `radio.db` root — und die Migrationen beim Boot scheitern mit SQLITE_CANTOPEN.
# Laut, im Container-Log, kein stiller Fall. Aber ein verbrannter Durchlauf.
IMG=ghcr.io/rubenvitt/iuk-suite:latest
UID_APP=$(docker run --rm --entrypoint sh "$IMG" -c 'id -u')
GID_APP=$(docker run --rm --entrypoint sh "$IMG" -c 'id -g')
# ⚠️ BEIDE Werte, und beide abgelesen. Die Kennung heisst `nextjs:nodejs` —
# Benutzer und Gruppe tragen verschiedene Namen (Dockerfile:42-43 legt sie als
# `addgroup --gid 1001 nodejs` und `adduser --uid 1001 nextjs` an, Dockerfile:72
# übereignet an `nextjs:nodejs`). Die Zahlen ins Protokoll; ein fest
# eingetragenes `1001:1001` wäre genau die Art Annahme, die dieses Kapitel
# überall sonst vermeidet.

# ---- 1) Wegwerf-DATA_DIR ---------------------------------------------------
# ⚠️ `data/files` MUSS mit angelegt werden, und das ist kein files-Zubehör:
# ein BIND-Mount erbt die Verzeichnisstruktur des Images NICHT (nur ein LEERES
# benanntes Volume tut das — Dockerfile:64-71 schreibt die Regel aus). Und
# `src/core/bootstrap.ts:87-90` ruft die Boot-Prüfungen JEDES Moduls, nicht nur
# die von radio: `src/app/m/files/_lib/boot.ts:425` löst
# `resolve(DATA_DIR, "files")` auf. Fehlt der Pfad, bricht der Prüfcontainer aus
# einem Grund ab, der nichts mit radio zu tun hat — und genau das wird um 22 Uhr
# als radio-Defekt gelesen.
GP="$HOME/gp-radio"
rm -rf "$GP" && mkdir -p "$GP/data/files"

# ---- 2) Import aus einem REPO-CHECKOUT, nicht aus dem App-Image ------------
# ⚠️ Das standalone-Image enthält weder `scripts/` noch `tsx`
# (docs/runbooks/portal-cutover.md:24-25). `docker compose exec suite tsx …`
# ist der Reflex und er scheitert — im besten Fall.
DATA_DIR="$GP/data" pnpm exec tsx scripts/import/radio.ts ./radio-admin-snapshot.sqlite

# ---- 3) Eigentum an die Kennung aus dem Image übergeben --------------------
sudo chown -R "$UID_APP:$GID_APP" "$GP/data"
```

**Wo mir eine Vorlage fehlt, und das gehört hier hin:** `scripts/import/` führt nur `portal.ts`,
`feedback.ts` und `parity.ts` — **es gibt kein `lagerbuch.ts`**, obwohl der lagerbuch-Import produktiv
gelaufen ist. Die Aufrufform oben ist deshalb aus `portal` abgeleitet (`portal-cutover.md:19`: ein
positionales Argument, der Snapshot-Pfad) und nicht aus dem nächstgelegenen Vorbild. Spec 1 §2.8.1 sagt
dasselbe: „Wie der `lagerbuch`-Import stattdessen ablief, ist aus dem Repo nicht ableitbar … Das ist
kein Vorbild, dem zu folgen wäre."

⬜ **zu ergänzen nach dem Bau:** die genaue Abschlusszeile von `scripts/import/radio.ts`. Bei `portal`
ist es die Zeichenkette `parity green` (`docs/runbooks/portal-cutover.md:20`, `:33`); das Runbook prüft
diese Zeile **und** den Exit-Code, nicht nur einen von beiden.

### 3.1.3 Idempotenz heißt **Reset**, nicht Wiederholung

Die Generalprobe darf beliebig oft laufen — aber die Wiederholbarkeit liegt im `rm -rf "$GP"` aus
Schritt 1, **nicht** in der Konfliktstrategie des Importers. Spec 1 §2.8.4 schreibt den Grund aus:

* Ein Test, der zweimal dieselbe Quelle importiert, ist wegen `onConflictDoUpdate` **immer grün**
  (`scripts/import/portal.ts:57-63`) und beweist damit nichts.
* Ein zweiter Lauf **über einen bereits benutzten Stand** walzt genau das platt, was die Generalprobe
  erzeugt hat: `devices.update_note` ist append-only
  (`radio-admin/server/src/db/schema.ts:33-36`), und bei `loans` trifft der Upsert `returned_at` — eine
  in der Probe zurückgegebene Ausleihe wird **wieder aktiv** und kollidiert dann mit
  `loans_device_active_uidx`.
* `device_events` ist `INSERT OR IGNORE` (Journal), `users`/`software_versions`/`devices`/`loans` sind
  Upsert. Der Upsert ist die Sicherung gegen einen **abgebrochenen** Lauf, nicht gegen einen zweiten.

**Verbindlich: jede Generalprobe beginnt mit einem leeren `DATA_DIR`.** Wer stattdessen „nochmal
importiert", prüft die Idempotenz des Skripts und nicht den Import.

⚠️ Und der Satz, der im Fenster teuer wird: `scripts/import/portal.ts:105-107` warnt selbst, „parity
runs AFTER this (idempotent) write. A thrown parity error means the target was already mutated … not
‚nothing happened'". **Ein roter Paritätscheck ist kein „es ist nichts passiert".** Der Rückweg ist
die leere Ziel-DB, nie ein zweiter Versuch auf demselben Stand.

### 3.1.4 Die acht Abfragen gegen die Kopie, **vor** dem Import

Sie gehören in die Generalprobe, weil dort ein Treffer eine halbe Stunde Arbeit ist und im Echtlauf ein
Abbruch um 23 Uhr. Vollständig ausgeschrieben stehen sie in Spec 1 §9.4.1 (sechs Sollwerte, vier
Invarianten, drei Belege) und §2.8.3 (dieselben, mit dem elfspaltigen
Zeitstempel-Plausibilitätsriegel). Hier nur die Zuordnung zur Probe:

| Nr. | Was | Blockierend? |
|---|---|---|
| 1 | sechs Zeilenzahlen (`devices`, `software_versions`, `api_tokens`, `users`, `device_events`, `loans`) | nein — sie **sind** die Sollwerte |
| 2 | `software_versions where is_target = 1` MUSS genau 1 sein | ja |
| 3 | verwaiste `device_events` MUSS 0 sein | ja |
| 4 | doppelt aktive Leihen je Gerät MUSS leer sein | ja |
| 5 | `min/max(created_at)` **dreizehnstellig** = Millisekunden | ja — zehnstellig heißt: Absage, nicht Anpassung |
| 6 | Trigger/Views in `sqlite_master` MUSS leer sein | ja |
| 7 | die Retention-Zahl (ersetzt die Schätzung „< 100") | nein, aber Protokollpflicht |
| 8 | elfspaltiger Plausibilitätsriegel `NOT BETWEEN 1e12 AND 4e12` MUSS 0 sein | ja |

⚠️ **Zu Nr. 7 zwei Sätze, weil beide gern verlorengehen.** Erstens: „< 100" ist eine **Schätzung des
Betreibers** (`docs/radio-portierung-analyse.md:1774`), keine Zählung — die Zählung ist dieser Schritt,
und ihr Ergebnis ist eine Protokollzeile, kein Wert in dieser Spec. Zweitens: der Faktor 1000 steht in
dieser Abfrage **absichtlich** im SQL (`returned_at < strftime('%s','now','-2 months') * 1000`), weil
die Alt-Spalte Millisekunden führt. Wer ihn weglässt, zählt **alle** zurückgegebenen Leihen und hält
das für eine bestätigte Schätzung.

### 3.1.5 Was die Generalprobe grün macht — und warum „parity green" allein es **nicht** ist

⚠️ **Der teuerste Fehler dieses Ports ist paritätsgrün.** Quelle ist epoch-**Millisekunden**, Ziel ist
Drizzle `mode: "timestamp"` (**Sekunden**, gesetzte Entscheidung 11). Die Parität vergleicht
Zeilen-Hashes, die auf **beiden** Armen aus **derselben** Mapping-Funktion stammen — `parity.ts`
kanonisiert nur (`scripts/import/parity.ts:16-31`, `rowChecksum` auf einer sortierten,
`Date`→ISO-normalisierten Sicht), und `scripts/import/portal.ts:73-76` schreibt die Folge selbst hin:
„both parity arms derive from `toNewService`, so a mapping bug hashes identically on both sides".
Ein konsistenter Faktor-1000-Fehler ist damit **beidseitig gleich gehasht und grün**.

Was er anrichtet: Sekunden statt Millisekunden legt jedes `returned_at` ins Jahr 1970. Der
Retention-Purge löscht dann beim ersten Lauf die **komplette abgeschlossene Leihhistorie**. Aktive
Leihen (`returned_at IS NULL`) überleben (§2.7.4) — der Verlust ist also unauffällig genau dort, wo
niemand hinsieht.

**Die Grün-Bedingung ist deshalb zusammengesetzt. Alle sechs Zeilen, nicht eine Auswahl:**

| # | Messung | Befehl / Stelle |
|---|---|---|
| G1 | Die acht Abfragen aus 3.1.4 haben ihre Sollwerte, die vier blockierenden sind erfüllt | §9.4.1, §2.8.3 |
| G2 | Der Importer endet mit Exit-Code 0 **und** der Paritätszeile | 3.1.2, ⬜ Wortlaut |
| G3 | **Fünf** Zeilenzahlen im Ziel entsprechen den Sollwerten der Quelle — **paarweise, nicht in der Summe** | 3.1.5.1 |
| G4 | Die vier Verwechslungspaare stimmen **zeilengenau** | 3.1.5.2 |
| G5 | Die Zeitstempel-Gegenprobe zeigt keinen 1970er-Stand | 3.1.5.3 |
| G6 | Der ephemere Container besteht den Prüfsatz aus 3.2.6 | 3.2.6 |

#### 3.1.5.1 Fünf Tabellen im Ziel, nicht sechs

```bash
for t in devices software_versions users device_events loans; do
  printf '%s\t' "$t"
  sqlite3 "$GP/data/radio.db" "select count(*) from $t;"
done
```

⚠️ **Hier weicht dieses Kapitel bewusst von Spec 1 §9.4.3 ab, und zwar mit Belegen aus Spec 1 selbst.**
Die Schleife dort läuft über **sechs** Tabellen und führt `api_tokens` mit. Im Ziel existiert diese
Tabelle nicht: gesetzte Entscheidung 13 (`api_tokens` trägt genau einen Konsumenten, der mit dem Port
verschwindet), Widerspruch B16 wörtlich („`mappeApiToken` **entfällt** (Entscheidung 13: die Tabelle
existiert im Ziel nicht)"), und §2.8.3 Nr. 1 zählt folgerichtig „fünf Paritäts-Sollwerte. Dazu
`SELECT COUNT(*) FROM api_tokens;` als **Protokollzeile**". Kapitel A und B gehen dem Kapiteltext vor —
so steht es im Kopf von Kapitel B. Die Sechser-Schleife bricht mit `Error: no such table: api_tokens`
ab; in der Generalprobe ist das eine Korrektur, im Cutover-Fenster ein verbrannter Schritt.

**`api_tokens` wird also genau einmal gezählt: in der Quelle, als Protokollzeile.** Sie belegt
Entscheidung 13 und wird in Kapitel 5 (Abbau) gebraucht.

#### 3.1.5.2 Die vier Verwechslungspaare — feldweise, weil die Parität die Zuordnung nicht sieht

Die Paare sind namentlich benannt (`docs/radio-portierung-analyse.md:743-747`) und in §9.4.3
übernommen. **Je Paar eine Zeile, zeilengenau gegen die Snapshot-Kopie:**

* `issi` ↔ `tei`
* `created_at` ↔ `updated_at` ↔ `last_updated_at`
* `snapshot_call_sign` ↔ `borrower_name`
* `alamos_integrated` ↔ `loanable` — **zwei 0/1-Integer, die niemandem auffallen**
* `serial_number` ↔ `hiorg_id` ↔ `opta`

Warum feldweise und nicht als Zählung: ein vertauschtes Spaltenpaar ändert **keine** Zeilenzahl und
keinen Hash, wenn beide Arme dieselbe Vertauschung tragen. Es ändert nur, was die Oberfläche behauptet.

#### 3.1.5.3 Die Gegenprobe gegen den Faktor 1000

Zwei Schnitte, und der zweite ist der scharfe:

```bash
# a) Die Retention-Zahl aus Abfrage 7 muss im Ziel wiederzufinden sein — in SEKUNDEN.
sqlite3 "$GP/data/radio.db" \
  "select count(*) from loans
    where returned_at is not null
      and returned_at < strftime('%s','now','-2 months');"

# b) Der Fingerabdruck: ein Sekundenwert, der als Millisekunde gelesen wurde,
#    liegt im Jahr 1970 — positiv, aber unmöglich klein.
sqlite3 "$GP/data/radio.db" \
  "select min(returned_at), max(returned_at), count(*)
     from loans where returned_at is not null;"
```

(b) ist eine Zeile und eindeutig: die Quelldaten stammen aus dem Betrieb dieser Anwendung, ein
`max(returned_at)` unterhalb von etwa `1000000000` (2001) ist damit ausgeschlossen. Zeigt (b) einen
1970er-Stand, ist der Faktor-1000-Fehler bewiesen — **bevor** der erste Retention-Lauf ihn unsichtbar
macht.

⚠️ **(a) und (b) sind kein Ersatz für den Mapping-Unit-Test** (§2.2.5, Fixture-Werte **je Feld
unterschiedlich**). Sie sind die Betriebsprobe daneben. Der Test läuft in CI und muss **vor** der
Generalprobe grün sein.

### 3.1.6 Der Retention-Arbeiter wird in der Probe stillgelegt

**`RADIO_HISTORIE_PURGE=0` gehört in die Env des ephemeren Containers.** Der Erstlauf steht auf 1440
Minuten (B5), eine kurze Probe erreicht ihn also gar nicht — aber eine Probe, die über Nacht läuft oder
mehrfach neu startet, löschte genau die Historie, die G5 gerade nachweist.

Der Schalter ist **nicht** stumm und das ist beabsichtigt: er meldet „Retention abgeschaltet" als
**`console.info`**, nicht als `console.warn` (§7.3.4). Die Trennung ist scharf und prüfbar —
**`warn` = Stopp, `info` = Zustand.** Die Generalprobe ist damit auch die Probe darauf, dass diese
Trennung im Log wirklich so aussieht:

```bash
docker logs radio-gp 2>&1 | grep -i 'radio:'
# erwartet: eine radio:-INFO-Zeile („Retention abgeschaltet"), KEINE radio:-WARNUNG.
# ⚠️ Der Filter muss auf `radio:` allein stehen. Ein zusätzliches `^` im Muster
# trifft JEDE Zeile, der Befehl gibt dann das ganze Log aus — und die Aussage
# „genau eine info-Zeile, keine warn-Zeile" ist nicht mehr ablesbar.
```

⚠️ **Zwei `warn`-Zeilen sind in der Probe legitim und dürfen nicht als Stopp gelesen werden**, solange
Schritt 2 noch nicht gelaufen ist: „`devices` ist leer" und „`radio.db` wurde neu angelegt" (§7.3.4 —
„vor dem Import ist die Tabelle **legitim** leer"). Nach dem Import müssen **beide verschwunden** sein.
Sind sie es nicht, zeigt `DATA_DIR` woanders hin als der Import — Analyse-Falle 29
(`docs/radio-portierung-analyse.md:1685-1696`).

### 3.1.7 `SUITE_SEED` bleibt aus — und das ist bei `radio` schärfer als bisher

`shouldSeed()` ist `SUITE_SEED === "1" || NODE_ENV === "development"` (`CLAUDE.md:180-182`).
**`SUITE_SEED=1` ist der Generalproben-Schalter, nicht der Lokalschalter** — und bei `radio` wäre ein
geseedeter Zugangscode ein **gültiger anonymer Zugang** zum gesamten Bestand samt Ausleihernamen
(§9.3.2 Punkt 2).

**Verbindlich: `SUITE_SEED` ist in der Generalprobe nicht gesetzt.** Und weil eine Zusage, die niemand
abliest, keine ist, wird sie abgelesen:

```bash
sqlite3 "$GP/data/radio.db" "select count(*) from zugangscodes;"   # MUSS 0 sein
```

Spec 1 sagt dazu zu: `seedLokal` legt Geräte und Stammdaten an und **niemals** eine einlösbare
Zugangszeile (§9.3.2). Diese Zeile prüft die Zusage, statt ihr zu glauben.

### 3.1.8 Die Probe hat eine Reihenfolge, und sie folgt aus dem Datenmodell

`zugangscodes` ist **nicht Teil des Imports**: in der Quelle gibt es nichts, was ihnen entspräche — der
heutige QR-Mechanismus trägt den einen geteilten API-Token base64-kodiert als URL-Parameter
(`radio-inventar/apps/frontend/src/components/features/admin/AppQRCode.tsx:11-23`), ohne Ablauf und ohne
Widerruf (§2.8.2 Punkt 5). **Nach dem Import gibt es also keinen einzigen Code, der eingelöst werden
könnte.**

Daraus folgt die Reihenfolge der Probe — der Verwaltungsweg ist **Voraussetzung** des Ausleihwegs, nicht
ein zweiter, unabhängiger Prüfpunkt:

1. Anmelden als radio-admin (Dev-Login, 3.2.3).
2. `/admin/geraete` — der Bestand steht da, mit echten Zeilen aus dem Import.
3. `/admin/zugaenge` — **einen Code ausstellen.** Das ist der erste Code, den es überhaupt gibt.
4. Den Code einlösen: einmal über `/t/<code>` (der gescannte Weg) und einmal über das Eingabefeld am
   Gate (der Ausweichweg, `_actions/gate.ts#einloesenAmGate`).
5. Ausleihen, zurückgeben, Historie ansehen.
6. Den Code sperren und die Einlösung erneut versuchen — sie muss scheitern, und zwar mit dem
   vorgesehenen Text, nicht mit einem Stacktrace.

⚠️ **Das ist gleichzeitig ein Ankündigungsposten, kein reiner Testschritt.** Der erste Satz Codes
entsteht in der Suite; die 1:1-Übernahme des heutigen QR-Mechanismus ist ausgeschlossen (gesetzte
Entscheidung 8) und damit eine **Verhaltensänderung mit Ankündigungspflicht**. Ob und wo gedruckte
Aufsteller im Umlauf sind, weiß nur der Betreiber (C.3) — **Zusage an Kapitel 4:** die Frage muss vor
dem Umschwenk beantwortet sein, weil „Bestandscodes zeichengleich übernehmen" ein **Druck**vorgang ist
und Papier für jedes Tor unsichtbar bleibt.

---

## 3.2 Die Verifikation gegen einen ephemeren Container ohne Traefik-Labels

**Der einzige Weg, vor dem Umschwenk etwas zu prüfen.** Deshalb ausführlich.

### 3.2.1 Warum ohne Labels, welches Netz, welches Volume

**Ohne Traefik-Labels.** Ein zweiter Router auf `Host(\`radio.iuk-ue.de\`)` ist ausgeschlossen, weil
dieser Container gar nicht an Traefik hängt (Vorbild: `docs/runbooks/portal-cutover.md:35-37`, „keine
Router-Kollision möglich, da dieser Container gar nicht an Traefik hängt"). Erreicht wird er über IP und
Port.

**Welches Netz: das Standard-Bridge-Netz. Ausdrücklich nicht `proxy`, ausdrücklich nicht `av`.**
Der reguläre Service hängt in `networks: [proxy, av]` (`compose.yaml:127`); der Prüfcontainer braucht
keines von beiden. `proxy` ist das Netz, über das Traefik die Container erreicht — ihn dort
herauszuhalten ist der **zweite, unabhängige Riegel** neben den fehlenden Labels. `av` bedient ClamAV
für `files`-Uploads und ist für `radio` ohne Bedeutung.

**Welches Volume: ⚠️ niemals das produktive.** Prod ist `suite_data` — deterministisch, ohne
Projektpräfix, weil `compose.yaml:221-223` es mit `name: suite_data` festnagelt. Der Prüfcontainer
mountet stattdessen das Wegwerf-Verzeichnis aus 3.1.2.

> **Der Riegel, der das hält, ist eine Textprüfung, und sie steht so im Runbook:**
> **die `docker run`-Zeile der Generalprobe enthält die Zeichenkette `suite_data` nicht.**
> Ein `-v suite_data:/data` ist ein Zeichen Unterschied und schreibt in die Produktion.

Auch nicht gemountet werden `files_data` und `aufgaben_data` (`compose.yaml:225-227`). Der Container ist
für die Dauer der Probe eine Suite ohne Dateien und ohne Aufgaben — das ist richtig und kein Mangel.

### 3.2.2 Die `docker run`-Form, ausgeschrieben

```bash
docker run --rm -d --name radio-gp \
  --user "$UID_APP:$GID_APP" \
  -p 127.0.0.1:3999:3000 \
  -v "$GP/data":/data \
  -e DATA_DIR=/data \
  -e SUITE_HOST_RADIO=localhost \
  -e SUITE_ADMIN_GROUP_RADIO=radio-verwaltung-gp \
  -e RADIO_AUSLEIH_SITZUNG_SECRET="$(openssl rand -hex 32)" \
  -e RADIO_HISTORIE_PURGE=0 \
  -e AUTH_SECRET="$(openssl rand -hex 32)" \
  -e AUTH_URL=http://localhost:3999 \
  -e AUTH_TRUST_HOST=true \
  -e AUTH_DEV_LOGIN=true \
  "$IMG"
sleep 15
docker logs radio-gp 2>&1 | tail -30      # Boot-Prüfungen: siehe 3.2.4
```

**Zeile für Zeile, weil jede eine Prüfung ist oder eine Falle vermeidet:**

| Zeile | Warum sie so lautet |
|---|---|
| `--rm -d --name radio-gp` | benannt, damit `docker logs`/`docker stop` ohne ID gehen; `--rm`, damit kein Prüfcontainer liegen bleibt und irgendwann als „der läuft doch" gelesen wird |
| `--user "$UID_APP:$GID_APP"` | 3.1.2 Schritt 0: der Import muss dieselbe Kennung benutzt haben wie der Prozess. `Dockerfile:88` (`USER nextjs`), `Dockerfile:72` (`chown nextjs:nodejs /data`), `Dockerfile:42-43` (die beiden Kennungen) |
| `-p 127.0.0.1:3999:3000` | **die Bindung an `127.0.0.1` ist Absicht.** Ohne sie ist die Probe von außen erreichbar — mit `AUTH_DEV_LOGIN=true` und einem Bestand samt Ausleihernamen darin. Der Container hört auf 3000 (`Dockerfile:89`, `compose.yaml:155`) |
| `-v "$GP/data":/data` + `DATA_DIR=/data` | derselbe Pfad wie im regulären Stack (`compose.yaml:79`), nur ein anderes Ziel. `radio.db` liegt damit unter `DATA_DIR` — **eine** Datei, kein zweiter Store (§9.1) |
| `SUITE_HOST_RADIO=localhost` | **der Kern dieses Kapitels** — 3.2.4 |
| `SUITE_ADMIN_GROUP_RADIO=…` | Pflicht, sonst startet die **gesamte Suite** nicht — 3.2.3 |
| `RADIO_AUSLEIH_SITZUNG_SECRET` | Pflicht, ≥ 32 Zeichen, **≠ `AUTH_SECRET`** — 3.2.3 |
| `RADIO_HISTORIE_PURGE=0` | 3.1.6 |
| `AUTH_SECRET` | Auth.js; frisch erzeugt, nie der Prod-Wert in einem Prüfcontainer |
| **`AUTH_URL=http://localhost:3999`** | ⚠️ **die Zeile, die am leichtesten fehlt und deren Fehlen wie ein Moduldefekt aussieht.** „Auth.js leitet seine `baseUrl` aus `AUTH_URL` ab — **immer**" (`src/core/auth/redirect.ts:8`, ebenso `src/core/auth/callbackUrl.ts:4` und `src/core/auth/redirect.test.ts:7`). Im regulären Stack steht sie in `compose.yaml:80` mit der Vorbelegung `https://iuk-ue.de` — die greift aber nur über die compose-Ersetzung, ein `docker run` ohne die Zeile hat sie **nicht**. Sie muss **zeichengleich der Origin der Probe** sein, sonst führt der Dev-Login aus `localhost:3999` heraus und kommt nicht zurück |
| **`AUTH_TRUST_HOST=true`** | im regulären Stack unbedingt gesetzt (`compose.yaml:82`). Fehlt sie, misstraut Auth.js dem Host der Probe |
| `AUTH_DEV_LOGIN=true` | `src/core/auth/devLogin.ts:10-11`: „`AUTH_DEV_LOGIN=true` → force on (**even in production**)". Gruppen sind dabei freier Text (`src/core/registry.ts:137`) — nur so ist die Verwaltungsfläche ohne Pocket-ID prüfbar. Und weil Pocket ID damit ungefragt bleibt, braucht die Probe **kein** `POCKET_ID_*` und keinen Weg zum IdP (`src/core/auth/pocketId.ts:54-55` baut die `redirectProxyUrl` nur für diesen Anbieter) |
| **kein** `SUITE_SEED` | 3.1.7 |
| **kein** `SUITE_TRAEFIK_RULE` | §7.3.4: die Warnung „Host nicht in der Rule" feuert nur, wenn **beide** Variablen gesetzt sind. Ohne die Rule bleibt sie still — im Prüfcontainer richtig, weil die Labels auf dem Server leben |
| **keine** `labels:` | 3.2.1 |

### 3.2.3 Die Env-Liste ist selbst eine Prüfung

Sobald `SUITE_HOST_RADIO` einen Wert hat, ist `radio` **eingeschaltet**: `radioBootFehler()` steigt als
erste Anweisung mit `prodHostsFor(getModule("radio"), env).length === 0` aus (§7.3.2), und mit
`prodHosts: []` in der Registry ist dieser Schalter genau „der Betreiber hat radio eingeschaltet".

Damit laufen im Prüfcontainer **dieselben fünf Boot-Prüfungen wie in der Produktion** (§7.3.3), und
jeder zurückgegebene String **ist** ein Startabbruch — `assertHostConfig` wirft bei `length > 0`
(`src/core/bootstrap.ts:92`). Konkret bedeutet das:

* `SUITE_ADMIN_GROUP_RADIO` fehlt → **die Suite startet nicht.** Nicht `radio` allein: portal, qr,
  feedback, files, lagerbuch und aufgaben stehen mit.
* `RADIO_AUSLEIH_SITZUNG_SECRET` fehlt, ist kürzer als 32 Zeichen **oder gleich `AUTH_SECRET`** →
  dasselbe.
* `SUITE_ACCESS_GROUP_RADIO` gesetzt → dasselbe, und zwar richtig: der Wert wäre **still wirkungslos**
  (`canAccess` steigt für `requiresAuth: false` sofort mit `true` aus, `src/core/registry.ts:239`).
* `RADIO_HISTORIE_MONATE=0` → dasselbe. `0` wird ausdrücklich abgewiesen und **nicht** als „aus"
  gelesen; `0` Monate lösche beim ersten Lauf die gesamte abgeschlossene Historie.

**Das ist ein Gewinn, nicht ein Hindernis.** Die Generalprobe ist die erste und einzige Gelegenheit, die
Boot-Prüfungen unter echten Bedingungen feuern zu sehen — und §7.3.1 sagt, warum das nötig ist: ohne die
Einhängung in `src/core/bootstrap.ts` laufen **alle** Prüfungen nie, die Tests dazu sind grün und
`pnpm build` auch. „Für die Boot-Haken gibt es kein Netz."

**Vorgeschriebener Handgriff: die Probe wird einmal absichtlich rot gefahren.** `SUITE_ADMIN_GROUP_RADIO`
weglassen, starten, den Abbruch im Log lesen, Variable wieder setzen. Wer diesen Abbruch nie gesehen
hat, weiß am Cutover-Abend nicht, ob eine startende Suite die Prüfungen bestanden hat oder sie nie
gelaufen sind.

### 3.2.4 ⚠️ Wie der Modul-Host vorgetäuscht wird, obwohl `radio.iuk-ue.de` der Alt-Kiosk ist

**Das ist die zentrale Frage dieses Kapitels.** Es gibt drei Stufen, sie kosten unterschiedlich viel
und kaufen unterschiedlich viel. Die Auflösung liegt in zwei Dateien:

* `src/core/routing.ts:37` — `resolveHost` nimmt `x-forwarded-host` **vor** `host`; bei einer Kommaliste
  gewinnt der erste Wert, ein leerer Wert fällt auf `host` zurück.
* `src/core/registry.ts:225-232` — `moduleForHost` schneidet den Port ab
  (`host.split(":")[0].toLowerCase()`) und prüft dann **zwei** Dinge: `h === \`${m.key}.localtest.me\``
  (eingebaut, ohne jede Env-Variable) und `prodHostsFor(m, env)`, das `SUITE_HOST_RADIO` liest.

| Stufe | Form | Kauft | Kauft **nicht** |
|---|---|---|---|
| **1** | `curl -H 'Host: radio.iuk-ue.de'` | jede HTTP-Aussage: Status, Header, Weiterleitung, Rumpf. Der **zeichengleiche** Prod-Host im Header | alles, was einen Browser braucht |
| **2** | Browser auf `http://radio.localtest.me:3999` | Modulauflösung ohne jede Env-Zeile (`registry.ts:228`); `localtest.me` löst öffentlich auf `127.0.0.1` auf | ⚠️ **kein sicherer Kontext** und damit **kein Secure-Cookie** — siehe 3.3.2. Der Ausleihweg sieht dort kaputt aus, obwohl er es nicht ist |
| **3** | Browser auf `http://localhost:3999` mit `SUITE_HOST_RADIO=localhost` | dasselbe **plus** vertrauenswürdiger Origin: sicherer Kontext, Secure-Cookies werden angenommen | den echten TLS-Handschlag, Cloudflare, den echten Hostwert |

**Verbindlich ist Stufe 3 für alles Browsergestützte und Stufe 1 für alles Kopfgestützte.** Stufe 2 wird
hier nur benannt, damit niemand sie für den bequemen Weg hält: sie ist der Weg, der eine intakte
Ausleihe als Fehler ausweist.

**Warum Stufe 3 zulässig ist, nachgeschlagen und nicht angenommen:**

1. `validateHostConfig` weist einen Wert nur ab, wenn er `/` oder `:` enthält — „muss ein reiner
   Hostname sein — ohne Protokoll und ohne Port" (`src/core/hosts.ts:80-85`). **`localhost` enthält
   keines von beiden.** `SUITE_HOST_RADIO=localhost:3999` wäre dagegen ein Startabbruch.
2. `moduleForHost` schneidet den Port ab (`registry.ts:226`), also trifft `localhost:3999` → `localhost`
   → `radio`.
3. Kein anderes Modul beansprucht `localhost`, die Doppelvergabeprüfung (`hosts.ts:86-93`) bleibt
   still.
4. `/login`, `/api/auth`, `/api/health` und `/_next` sind PASSTHROUGH (`src/core/routing.ts:13`) — der
   Dev-Login funktioniert also weiter, obwohl `radio` den ganzen Host beansprucht.
5. ⚠️ **`AUTH_URL` muss mitwandern und zeichengleich `http://localhost:3999` lauten.** Auth.js löst
   seine `baseUrl` **immer** aus dieser Variable auf (`src/core/auth/redirect.ts:8`), nicht aus dem
   Request. Stufe 3 ist also **zwei** zeichengleiche Werte, nicht einer: `SUITE_HOST_RADIO=localhost`
   und `AUTH_URL=http://localhost:3999`. Weicht der zweite ab, führt der Login aus der Probe heraus.

**Der Präzedenzfall dazu ist im Haus vernarbt und heißt anders, meint aber dasselbe:**
`docs/runbooks/lagerbuch-cutover.md:158` — „⚠️ `APP_BASE_URL` und `SUITE_HOST_LAGERBUCH` müssen
ZEICHENGLEICH derselbe Host sein", dort „der teuerste Einzelposten aus dem Bau von Teil 4". Der Grund
ist bei `radio` identisch: das Sitzungscookie trägt `path: "/"` und **kein** `domain`, es ist damit an
**genau die Origin** gebunden, auf der es gesetzt wurde (§3.4.1) — „und **kein Test sieht das**. Vitest
kennt nur einen Host, Playwright kennt nur `<modul>.localtest.me`, und `pnpm build` prüft keine
Env-Werte gegeneinander."

Zwei Folgen, die auseinanderzuhalten sind:

* **Für die Probe:** die Origin der Probe (`http://localhost:3999`) ist eine andere als die
  Produktion. Alle in der Probe geprägten Ausleih-Sitzungen sind danach wertlos — das ist richtig, sie
  gehören zu einem Wegwerf-Stand.
* **Für den Umschwenk (Zusage an Kapitel 4):** `SUITE_HOST_RADIO` und der Wert, gegen den Auth.js
  auflöst, werden vor dem Umschwenk **nebeneinandergelegt und zeichenweise verglichen**. `radio` führt
  kein eigenes `APP_BASE_URL` (Spec 1 nennt keines); die Variable, die hier zählt, ist `AUTH_URL`
  (`compose.yaml:80`). Ein Unterschied in der Schreibweise beendet keine laufende Alt-Sitzung — es gibt
  keine zu erhalten, weil der Alt-Kiosk seinen Zugang im `localStorage` hält (§3.4.1) —, aber er bricht
  den Login-Rückweg, und dieser Bruch ist **stumm**.

⚠️ **Was Stufe 3 ausdrücklich NICHT beweist — und das ist die wichtigste Einschränkung dieses
Kapitels.** Sie beweist, dass das Modul unter **einem beansprochenen Host** arbeitet. Sie beweist
**nicht**, dass der Produktionswert `SUITE_HOST_RADIO=radio.iuk-ue.de` richtig gesetzt ist. Genau dieser
Fehlfall ist **stumm**: die Allowlist in `src/core/auth/redirect.ts` erkennt einen Modul-Host über
**genau** diese Variable; fehlt der Wert, wirft Auth.js den Nutzer nach dem Login aufs Portal, „ohne
Fehler und ohne Meldung", und — wörtlich — „Ein curl sieht davon nichts" (`src/core/hosts.ts:59-63`).

Spec 1 §9.3.1 nennt die zwei ehrlichen Wege und empfiehlt **Weg A** (temporärer echter Host
`radio-neu.iuk-ue.de` samt `SUITE_TRAEFIK_RULE`-Eintrag), mit der Warnung: „Beim Wechsel gilt
**dieselbe** Prüfung noch einmal — der Rückweg hängt am **Wert**, nicht am Code."
**Zusage an Kapitel 4:** die Wahl zwischen Weg A und Weg B (Nachprüfung als erster Schritt nach dem
Umschwenk, mit `SUITE_HOST_RADIO=` leeren als benanntem Rückweg und einer namentlich benannten Person)
wird **vor** dem Cutover-Abend getroffen, nicht an ihm. Stufe 3 aus dieser Tabelle ersetzt diese
Entscheidung nicht — sie macht nur die browsergestützten Prüfungen möglich, die §9.3.1 gar nicht
vorsah.

⚠️ **Und ein zweiter Unterschied, der leicht verschwimmt: Falle 61 ist bei Stufe 3 NICHT
bauartbedingt vermieden.** §9.3.1 schreibt das für Weg A zu, weil dort `/m/radio` auf dem Portal-Host
gar nicht angefasst wird. Bei Stufe 3 ist der interne Pfad weiter erreichbar: `decideRoute` behandelt
`/m/<key>` in einem eigenen Zweig, und für ein Modul mit `requiresAuth: false` liefert `canAccess`
sofort `true` (`src/core/routing.ts:57-67`, `src/core/registry.ts:239`). **Die Negativprobe ist deshalb
Pflicht und steht in 3.2.6 (V7).**

### 3.2.5 Wenn ein echter TLS-Handschlag gebraucht wird: die Escalation, benannt und nicht empfohlen

Stufe 3 liefert einen **sicheren Kontext** ohne TLS, weil `localhost` als vertrauenswürdiger Origin
gilt. Was sie nicht liefert, ist ein echter Handschlag und der Header-Vorlauf eines Reverse-Proxys.
Wer das braucht, stellt einen TLS-Abschluss vor den Prüfcontainer, der `X-Forwarded-Host` setzt — und
trifft damit den Zweig, den die Produktion wirklich benutzt (`routing.ts:37`):

```yaml
# gp-compose.yaml — NUR für die Generalprobe. Keine traefik.*-Labels, kein proxy-Netz.
services:
  app:
    image: ghcr.io/rubenvitt/iuk-suite:latest
    user: "${UID_APP}:${UID_APP}"     # abgelesen in 3.1.2, nicht eingetragen
    volumes: ["${GP}/data:/data"]
    environment:
      DATA_DIR: /data
      SUITE_HOST_RADIO: radio.iuk-ue.de   # ⚠️ nur zulässig, weil KEIN Router hier hängt
      SUITE_ADMIN_GROUP_RADIO: radio-verwaltung-gp
      RADIO_AUSLEIH_SITZUNG_SECRET: ${GP_SECRET}
      RADIO_HISTORIE_PURGE: "0"
      AUTH_SECRET: ${GP_AUTH_SECRET}
      AUTH_URL: https://localhost:8443     # zeichengleich die Origin des Browsers
      AUTH_TRUST_HOST: "true"
      AUTH_DEV_LOGIN: "true"
  tls:
    image: caddy:2-alpine
    ports: ["127.0.0.1:8443:8443"]
    command: >
      caddy reverse-proxy --from https://localhost:8443 --to app:3000
      --header-up "X-Forwarded-Host: radio.iuk-ue.de"
```

**Zwei Warnungen, ohne die diese Form gefährlich ist:**

1. ⚠️ **`SUITE_HOST_RADIO=radio.iuk-ue.de` steht hier nur deshalb, weil dieser Stack keinen Router
   trägt.** Dieselbe Zeile in der echten `.env` ist der Umschwenk. Die Datei heißt `gp-compose.yaml`
   und nicht `compose.override.yaml`, damit ein `docker compose up -d` im Projektverzeichnis sie **nicht**
   einliest.
2. Der Browser muss das Caddy-interne Zertifikat annehmen. Eine durchgeklickte
   Zertifikatswarnung ist kein sicherer Kontext im Sinne des Cookie-Verhaltens — wer prüfen will, ob
   das Cookie ankommt, prüft es **an dieser Stelle noch einmal** und glaubt nicht dem Erfolg auf Stufe 3.

**Empfehlung: Stufe 3, nicht diese Form.** Ein Container statt zwei, eine Env-Zeile statt eines
Zertifikats — und der Zweig, der hier zusätzlich getroffen wird (`x-forwarded-host`), ist nach dem
Umschwenk in einem Atemzug nachprüfbar. Diese Form steht hier, damit sie im Fenster nicht erfunden wird.

### 3.2.6 Der Prüfsatz am ephemeren Container

**Kopfgestützt (Stufe 1). Alle Zeilen laufen, nicht nur die erste:**

```bash
B=http://127.0.0.1:3999
H='Host: radio.iuk-ue.de'

# V1) Die Ausleihfläche antwortet unter dem radio-Host.
curl -si -H "$H" "$B/" | head -3                       # erwartet: 200

# V2) /admin riegelt anonym ab — als WEITERLEITUNG in den Login, nicht als 404.
curl -si -H "$H" "$B/admin" | grep -iE '^HTTP/|^location:'

# V3) Health, mit Revision — der einzige Beleg, dass der NEUE Stand antwortet.
curl -s -H "$H" "$B/api/health/radio"

# V4) Der CSV-Export antwortet anonym 404, nicht 403 (B10/B17).
curl -s -o /dev/null -w '%{http_code}\n' -H "$H" "$B/admin/geraete/export"

# V5) Der Abräum-Worker liegt im Image und ist der richtige.
curl -si -H "$H" "$B/sw.js" | head -5
curl -s  -H "$H" "$B/sw.js" | grep -c 'registration.unregister'   # MUSS >= 1
curl -s  -H "$H" "$B/sw.js" | grep -c 'caches.keys'               # MUSS >= 1
curl -s  -H "$H" "$B/sw.js" | grep -c 'addEventListener("fetch"'  # MUSS 0 sein

# V6) /sw.js auf einem FREMDEN Host darf ihn nicht liefern.
curl -s -o /dev/null -w '%{http_code}\n' -H 'Host: iuk-ue.de' "$B/sw.js"

# V7) Falle 61: der interne Pfad auf dem Portal-Host.
curl -si -H 'Host: iuk-ue.de' "$B/m/radio" | head -3

# V8) siehe unten — R36 ist bei radio KEIN curl.
```

**Zu V2, weil hier zwei Riegelformen dicht nebeneinanderliegen und der naheliegende Sollwert der
falsche ist.** `requireRadioAdmin()` läuft in einer festen Reihenfolge (§3.6.1): Host, dann
`viewerAusSession`, dann **Schritt 4** `redirect('/login?callbackUrl=' + verwaltungsZiel(kopf))` für
**anonym**, und erst **Schritt 5** `notFound()` — „NICHT 403" — für **angemeldet ohne Gruppe**. Also:

| Fall | Erwartung | Wo geprüft |
|---|---|---|
| anonym auf `/admin` (Seite) | **Weiterleitung** in den Login, mit `callbackUrl` | V2 |
| angemeldet **ohne** `SUITE_ADMIN_GROUP_RADIO` auf `/admin` (Seite) | **404** | V11 |
| anonym auf `/admin/geraete/export` (**Route Handler**) | **404**, nie 403 und nie ein Login-Umweg | V4 |

Der Unterschied zwischen Zeile 1 und Zeile 3 ist keine Unsauberkeit, sondern B11: Seiten und Actions
rufen `requireRadioAdmin()`, **Route Handler unter `admin/` rufen `radioHostOderNull` +
`istRadioAdmin(await viewerOderNull())`** und bauen ihre Antwort selbst — „wörtlich umgesetzt landete
ein anonymer `GET` auf `/admin/geraete/export` in einem Login-Umweg". Wer V2 und V4 denselben Sollwert
gibt, hat eine der beiden Bauformen kaputtgeprüft.

⬜ **zu ergänzen nach dem Bau: der genaue Sollwert des `Location`-Kopfes von V2** — Statuscode (307 oder
302) sowie Protokoll und Host, die `verwaltungsZiel(headers)` in die `callbackUrl` schreibt. Protokolliert
wird der **vollständige** Wert, in jedem Fall: nennt die `callbackUrl` nicht den Host aus dem
`Host`-Kopf, ist das derselbe stumme Fehlfall wie beim Login-Rückweg (3.2.4).

**Zu V8: R36 ist bei `radio` kein `curl`, sondern eine Abwesenheitsprüfung — und das ist die stärkere
Form.** §7.1.1 entscheidet: „**`radio` erhält kein Manifest, keine Icon-Handler und keinen
`<link rel="manifest">`**", und schreibt die Folge selbst aus: „Damit ist lagerbuch-Falle 56 (‚jeder
Suite-Host bewirbt eine Modul-PWA') durch **Abwesenheit** beantwortet … es gibt keinen Pfad an der
Wurzel, der sie auslösen könnte." Ein `curl -H 'Host: iuk-ue.de' …/manifest.webmanifest` prüft dann die
Abwesenheit von etwas, das kategorisch nicht entstehen kann: **immer grün, und liest sich als Zusage.**

Verbindlich ist stattdessen:

```bash
# R36 in der radio-Fassung: es entsteht keine Manifest-Route unter dem Modul.
test ! -e src/app/m/radio/manifest.webmanifest/route.ts && echo "R36 ok"
rg -n 'metadata.*manifest|rel="manifest"' src/app/m/radio/ || echo "R36 ok"
```

Das läuft im **Repo**, nicht gegen den Container, und es gehört damit vor die Generalprobe.
**Zusage an Kapitel 4:** was nach dem Umschwenk gegen den Portal-Host zu prüfen bleibt, ist nicht die
Abwesenheit des radio-Manifests, sondern die **Unverändertheit** des Portal-Manifests — dieselbe Zeile
wie bei lagerbuch (`docs/runbooks/lagerbuch-cutover.md:436`), aber mit umgekehrter Beweislast.

**Zu V3, weil `200` allein zu wenig ist.** `/api/health/radio` wäre gegen eine frisch angelegte,
**leere** `radio.db` grün (§9.4.3). Was hier zählt, sind **zwei** Dinge im Rumpf: `status` und
`revision`. `revision` kommt aus `laufendeRevision()` und damit aus `SUITE_REVISION`, das
`Dockerfile:85-86` in die letzte Metadatenschicht schreibt — es ist „der einzige Beleg, den der
automatische Rollout von AUSSEN prüfen kann". Und die Gegenrichtung, aus §7.2.4: **solange der
Registry-Eintrag `radio` fehlt, antwortet `/api/health/radio` mit 503**, weil `getModule` bei unbekanntem
Key wirft. **200 heißt „das Modul ist im Image", 503 heißt „falsches Image".** Die billigste
Image-Prüfung, die es gibt.

**Zu V5:** der Handler ist in §7.1.3 vollständig ausgeschrieben, die Zusicherungen sind also keine
Vermutung: `content-type: text/javascript; charset=utf-8`, `cache-control: no-cache`, im Rumpf
`self.registration.unregister()` und `caches.keys()`, und **kein** `fetch`-Handler („Ein Worker ohne
`fetch`-Handler lässt jede Anfrage unberührt zum Netz"). V6 prüft die nicht werfende Riegelform
`hostAbweisung` (B13): ein `notFound()` wäre eine HTML-Seite mit `Content-Type: text/html`, und der
Browser meldete „manifest fetch failed" statt einer klaren Absage.

**Zu V7:** hier steht **kein** Sollwert im Text, weil er von einer Entscheidung abhängt, die dieses
Kapitel nicht trifft. §1.2 legt fest, was mit den internen Pfaden auf einem Fremdhost geschieht.
⬜ **zu ergänzen nach dem Bau: was `GET /m/radio` mit `Host: iuk-ue.de` liefern soll** — die
Möglichkeiten sind eine 404 aus dem Host-Riegel oder eine gerenderte Fläche, und nur eine davon ist die
gebaute. Die Zeile bleibt trotzdem im Runbook: **abgelesen und protokolliert wird sie in jedem Fall**,
denn Falle 61 ist die zweite Herkunft, die in keinem Runbook steht.

**Browsergestützt (Stufe 3), auf `http://localhost:3999`:**

| # | Schritt | Was ihn scheitern lässt, und wie man es merkt |
|---|---|---|
| V9 | `/login` → Dev-Login mit der Gruppe aus `SUITE_ADMIN_GROUP_RADIO` | fehlt `AUTH_DEV_LOGIN=true`, führt der Login gegen Pocket ID und die Rückleitung auf `localhost:3999` scheitert — sichtbar als Fehlerseite des IdP, nicht der Suite. Fehlt `AUTH_URL`, landet der Login **auf einem anderen Host** und der Fehler sieht aus wie ein Riegel, der zu viel riegelt (3.2.4 Punkt 5) |
| V10 | `/admin/geraete` zeigt echte Zeilen aus dem Import | leere Tabelle bei nicht-leerem `select count(*)` → Falle 9 (Client-Insel ohne serialisierbare Daten), sichtbar nur hier, nie im Build |
| V11 | Negativprobe: abmelden, neu anmelden **ohne** die Admin-Gruppe → `/admin` ist 404 | eine gerenderte Verwaltungsseite heißt: der Riegel steht nicht in **jeder** Datei. Mit `requiresAuth: false` erbt `/admin` **kein** Middleware-Gating (gesetzte Entscheidung 10) |
| V12 | `/admin/zugaenge`: Code ausstellen, Blatt drucken (Druckvorschau) | erbt das Druckblatt Kopfzeile, Navigation und `controlHeight: 44`, fehlen die zwei Route-Groups aus §1.2.2 (B9) — **still, der Build ist grün, sichtbar nur auf Papier bzw. in der Vorschau** |
| V13 | `/t/<code>` aufrufen → 303 auf die Ausleihfläche, **und das Cookie `radio_ausleihe` steht danach in den DevTools** | 3.3.2 |
| V14 | Ausleihen, zurückgeben, Historie | eine 500 hier ist ein Fund; eine falsche Konfliktmeldung ist auch einer (§4.3.5: sechs Ausgänge, heute vier Sätze) |
| V15 | Code sperren, Einlösung erneut versuchen | die Meldung muss aus dem geschlossenen Satz der vier Texte kommen (§3.3.4), nicht aus einem Stacktrace |
| V16 | Hell **und** dunkel je Fläche einmal ansehen | Vorbild `docs/runbooks/lagerbuch-cutover.md:267-284`: Ampelringe, Statuschips, Tabellenkanten. Keine weiße Fremdfläche im Dunkelmodus, kein offensichtlich abgeschnittener Inhalt |

### 3.2.7 Aufräumen — und warum das ein eigener Schritt ist

```bash
docker stop radio-gp          # --rm entfernt ihn dabei
rm -rf "$GP"
```

Ein liegengebliebener Prüfcontainer ist ein Container mit `AUTH_DEV_LOGIN=true` und einem echten
Bestand. Er hängt an keinem Router, also fällt er niemandem auf. **Der Schritt gehört ins Protokoll wie
jeder andere.**

---

## 3.3 Der sichere Kontext — was HTTPS hier wirklich betrifft

Bei `lagerbuch` war „Die Generalprobe MUSS über HTTPS laufen — sonst sind die Kamerawege ungeprüft" ein
eigener Runbook-Punkt (`docs/runbooks/lagerbuch-cutover.md:290-310`). Bei `radio` gilt derselbe Satz,
**aber aus einem anderen Grund** — und das ist ein Befund, nicht eine Kürzung.

### 3.3.1 `radio` hat keine Kamerafläche im Modul — nachgesehen, nicht angenommen

Ein Scan über Spec 1 und die Portierungsanalyse findet **keine** Stelle mit `getUserMedia`,
`BarcodeDetector`, `mediaDevices` oder einer Scanner-Komponente unter `src/app/m/radio/`. Der einzige
Treffer für „Scanner" ist eine Prosastelle über anonyme Nutzung (§3.5.3). Der gescannte Code ist bei
`radio` **ein GET aus der Adresszeile**: §3.3.2 begründet den Route Handler `t/[code]/route.ts` genau
damit, und §3.3.3 nennt das Eingabefeld am Gate den Weg „für den Fall, dass die Kamera nicht will" —
gemeint ist die **Kamera-App des Telefons**, nicht eine Fläche des Moduls.

Der lagerbuch-Punkt ist damit **nicht übertragbar**: dort gibt es `/verwaltung/geraete/scan` und
`/verwaltung/bz/scan` mit einem eigenen `BarcodeScanner.tsx`, das über `http://` ausschließlich den
Zustand `KEIN_SICHERER_KONTEXT` zeigt. Bei `radio` gibt es diese Fläche nach Spec 1 nicht.

⬜ **zu ergänzen nach dem Bau: ob `/` oder `/t/<code>` eine kamerabasierte Fläche trägt.** Falls ja, ist
ein sicherer Kontext für sie Pflicht, und Stufe 3 aus 3.2.4 stellt ihn her — dieselbe URL, kein
zusätzlicher Handgriff. Falls nein, bleibt es bei 3.3.2 und 3.3.3.

⚠️ Warum das hier als Leerstelle steht und nicht als Zusage: eine Prüfzeile auf eine Fläche, die es
nicht gibt, ist entweder immer grün oder immer rot, und beides wird als Aussage gelesen.
**Präzedenzfall:** die lagerbuch-Spec verlangte ein `cookies().delete()` in einer Server Component, wo
es **wirft** — ein Playwright-Test hätte dort eine Zusage geprüft, die die Bauform nicht halten kann.

### 3.3.2 Der echte Zwang zum sicheren Kontext ist das **Secure-Cookie**

Die Ausleih-Sitzung setzt `secure: process.env.NODE_ENV === "production"` (§3.4.1), und
`Dockerfile:36` setzt `ENV NODE_ENV=production`. **Im Prüfcontainer ist das Cookie also `Secure` —
genau wie in der Produktion.** Ein `Secure`-Cookie von einem nicht vertrauenswürdigen Origin wird vom
Browser verworfen; auf `http://radio.localtest.me:3999` (Stufe 2) ist der Ausleihweg damit **nicht
benutzbar, obwohl er intakt ist**.

**Das ist der zweite falsche Schluss aus dem lagerbuch-Punkt, in neuer Gestalt:** wer die Probe über
Stufe 2 fährt, hält den Gate-Weg für kaputt und „repariert" ihn — oder er hält ihn für geprüft, weil
die Seite ja erschien. Der zweite ist der teurere.

**Deshalb ist V13 kein Behauptungssatz, sondern eine Ablesung:**

> Nach `GET /t/<code>` MUSS das Cookie **`radio_ausleihe`** in den DevTools unter
> Application → Cookies → `http://localhost:3999` stehen, mit `HttpOnly`, `SameSite=Lax`, `Path=/`
> und **ohne** `Domain`-Eintrag. Fehlt es, liegt die Ursache am Origin und nicht am Modul — dann ist
> der Ausleihweg in dieser Probe **ungeprüft**, und die Probe wird auf Stufe 3 wiederholt, nicht
> das Modul angefasst.

Der Name ist nachgeschlagen: `AUSLEIH_COOKIE = "radio_ausleihe"` (§3.4.1). Er kollidiert **nicht** mit
dem Alt-Cookie `radio-inventar.sid`
(`radio-inventar/packages/shared/src/constants/auth.constants.ts:29`) — auch das ist nachgeschlagen und
nicht angenommen.

Die Probe läuft in **Chromium oder Firefox**. Wenn das Cookie dort fehlt, ist das ein Fund; wenn es in
einem anderen Browser fehlt, ist es zuerst eine Frage an den Browser. Die Ablesung entscheidet, nicht
eine Erinnerung an Browserregeln.

### 3.3.3 Der gedruckte QR-Code: prüfbar ist die **Nutzlast**, nicht der Scan

Ein gedruckter Code trägt eine **absolute** URL auf `https://radio.iuk-ue.de/t/<code>`. Bis zum
Umschwenk führt diese URL zum Alt-Kiosk — der Scan ist also vorher **nicht** prüfbar, und keine
Umgehung ändert das.

**Was vorher prüfbar ist, und es ist nicht wenig:** die Nutzlast als Text. Den Code im ephemeren
Container ausstellen, das Druckblatt öffnen, den QR mit einem beliebigen Leser als **Zeichenkette**
auslesen und **zeichenweise** gegen die erwartete URL vergleichen. Ein Tippfehler im Host, ein
fehlendes `https`, ein Modul-Pfad `/m/radio/t/…` statt `/t/…` — alles drei fällt hier auf und keines
davon nach dem Druck.

⚠️ **Reihenfolge, damit daraus kein Altpapier wird:** gedruckt wird **nach** dem Umschwenk oder mit
einem Code, dessen URL bereits die Endadresse trägt. §9.4.1 nennt es beim Namen: Papier ist für jedes
Tor unsichtbar. **Zusage an Kapitel 4:** der Druck des ersten Codesatzes ist ein eigener,
protokollierter Schritt **nach** dem Umschwenk, keine Vorbereitung.

---

## 3.4 Was am ephemeren Container NICHT prüfbar ist

Sechs Punkte, je Punkt: wann prüfbar, und was der Ersatz vorher ist. **Diese Tabelle ist der Grund,
warum das Kapitel nicht mit 3.2 endet.**

| Aussage | Warum nicht am Prüfcontainer | Wann prüfbar | Der Ersatz vorher |
|---|---|---|---|
| **Cloudflare lässt die Wege durch** | Der Container hängt an keinem Router und schon gar nicht am Rand. Bekannter Bestandsfall: `iuk-ue.de`/`qr.iuk-ue.de` zeigten Bot-Challenges | **nach** dem Umschwenk, erster Abruf von außen | keiner am Container. Der Ersatz ist ein **Vorabblick in die Zone**: trägt `radio.iuk-ue.de` heute Regeln, die der Alt-Kiosk brauchte (Bot Fight Mode, Cache-Regeln, Page Rules)? **Zusage an Kapitel 4:** ein benannter Schritt „Zonenregeln für `radio.iuk-ue.de` gelesen und protokolliert" **vor** dem Fenster |
| **Echtes TLS, echtes Zertifikat, HSTS** | kein Router, kein ACME. Stufe 3 liefert einen *sicheren Kontext* ohne TLS | **nach** dem Umschwenk | Stufe 3 für alles, was nur einen sicheren Kontext braucht (3.3.2); notfalls die Escalation aus 3.2.5 für einen echten Handschlag |
| **Der Header-Vorlauf des Randes** (`x-forwarded-host`) | ein `docker run` setzt ihn nicht; die Probe trifft den `host`-Rückfall in `routing.ts:37`, die Produktion den Vorrangzweig. Vernarbt: `docs/runbooks/lagerbuch-cutover.md:102` („Der Edge-Proxy muss `X-Forwarded-Host` überschreiben") | **nach** dem Umschwenk, in einem Atemzug mit dem ersten Abruf | die Escalation aus 3.2.5 setzt den Header und trifft denselben Zweig |
| **Gedruckte QR-Codes** | absolute URL auf die besetzte Endadresse | **nach** dem Umschwenk | die Nutzlast als Text vergleichen (3.3.3) |
| **Der Service Worker des Alt-Kiosk** | er lebt in **fremden Browsern**, nicht im Image. Er überlebt den Umschwenk, weil der Origin zeichengleich bleibt (§9.3.5), und liefert HTTP 200 mit veraltetem Inhalt — kein Build, kein Test, kein Healthcheck sieht das | **nach** dem Umschwenk, auf einem Gerät, das den Alt-Kiosk kannte: einmal neu laden, die Suite-Oberfläche muss erscheinen | V5/V6: der Abräum-Worker ist **im Image**, hat den richtigen Rumpf und wird auf Fremdhosts nicht ausgeliefert. ⚠️ Er gehört in den **ersten Deploy**, nicht in den Cutover (§7.1.3) — bis zum Umschwenk holt ihn niemand ab, weil nichts in der Suite `register()` ruft. Worst Case bleibt **eine** veraltete Ansicht je Gerät |
| **Die Cookie-Domain** (host-only, **kein** `.iuk-ue.de`) | ⚠️ **nie per HTTP prüfbar — auch nicht nach dem Umschwenk.** §3.4.1 wörtlich: „Playwright kann diesen Fehler nicht sehen. Es fährt gegen **einen** Host, und dort verhält sich ein domain-weites Cookie **exakt** wie ein host-only" (Falle 19). `pnpm build` und `pnpm typecheck` sehen ein zusätzliches `domain`-Feld nicht — es ist typkorrekt | **nie** durch einen Abruf | **die Quelltext-Zusicherung aus §3.8, und sie muss vor der Generalprobe grün sein.** Das ist die einzige Absicherung. V13 liest zusätzlich ab, dass in den DevTools **keine** `Domain` steht — ein Indiz, kein Beweis |

**Dazu, aus §9.3.1 unverändert übernommen und hier nicht aufgeweicht:**

* **Der Redirect vom Alt-Host `radio-admin.iuk-ue.de` darf vorher NICHT scharf sein.** Er zeigt auf
  `radio.iuk-ue.de/admin`, und dort liegt bis zum Umschwenk die **eigene Verwaltung des Alt-Kiosk**
  (`login.tsx`, `index.tsx`, `history.tsx`, `devices.tsx`, `settings.tsx`,
  `docs/radio-portierung-analyse.md:392-398`). Früh geschaltet führt er jeden Verwaltenden aus einer
  funktionierenden Alt-Verwaltung in die Verwaltung **einer anderen Anwendung** — schlechter als nichts
  zu tun. **Zusage an Kapitel 4:** der Redirect wird im selben Fenster wie der Umschwenk scharf, und die
  drei `curl` aus §9.2.3 laufen **danach**.
* **Der Login-Rückweg** ist der einzige Fehlfall, der **stumm** ist (3.2.4). Er entscheidet über Weg A
  oder Weg B, und diese Entscheidung fällt vor dem Fenster.

---

## 3.5 Der Abbruchpunkt: was die Generalprobe rot macht — und was rot bedeutet

**„Rot" heißt vier verschiedene Dinge, und die Unterscheidung ist der Zweck dieses Abschnitts.** Wer
sie im Fenster improvisiert, verschiebt entweder einen behebbaren Fund oder repariert einen, der eine
Absage ist.

### Klasse A — **Absagen, nicht anpassen**

| Fund | Warum Absage |
|---|---|
| **Zehnstellige Zeitstempel** in der Quelle (§9.4.1 Abfrage 5) | „ist die gesamte Import-Annahme falsch und der Cutover wird **abgesagt, nicht angepasst**" — Spec 1 wörtlich. Die Einheitenentscheidung (gesetzte Entscheidung 11), die Mapping-Funktionen und der Riegel `[1e12, 4e12]` hängen daran |
| **Trigger oder Views** in `sqlite_master` (Abfrage 6) | „Ein Treffer ist Fachlogik, die kein Repo kennt." Der Grep-Beleg der Analyse gilt für den **Quelltext**, nicht für die laufende Datenbank |
| **Der Registry-Eintrag fehlt im Image** (V3 antwortet 503) | Falsches Image. Kein Handgriff am Cutover-Abend behebt das; es braucht einen CI-Lauf. Vorbild derselben Härte: `docs/runbooks/suite-update-webfinger.md:43-45`, „**Stimmt sie nicht: hier abbrechen und melden**" |

### Klasse B — **in der Kopie bereinigen, Bereinigung protokollieren**

| Fund | Handgriff |
|---|---|
| `software_versions where is_target = 1` ≠ 1 (Abfrage 2) | „wird sie **vor** dem Import in der Kopie bereinigt und die Bereinigung protokolliert" (§9.4.1). Der Update-Stand ist **berechnet, nicht gespeichert** (`radio-admin/server/src/db/schema.ts:53-56`) — bei 0 oder 2 kippt der angezeigte Status **jedes** Geräts, und keine Parität sieht es |

⚠️ Die Bereinigung geschieht in der **Kopie** und wird im Echtlauf **wiederholt**, nicht vererbt. Eine
Bereinigung, die nur in der Generalprobe stattfand, ist ein Fund, den das Fenster erneut trifft.

### Klasse C — **reparieren, dann Generalprobe von vorn**

Verwaiste `device_events` (Abfrage 3) · doppelt aktive Leihen (Abfrage 4) · unbekannte
`device_events.source`-Werte (`device_events.source` ist ein TS-Enum **ohne** DB-CHECK,
`radio-admin/server/src/db/schema.ts:96`) · ein Treffer im elfspaltigen Plausibilitätsriegel (§2.8.3
Nr. 6) · jeder Fund aus V1–V16.

**„Von vorn" ist wörtlich zu nehmen:** `rm -rf "$GP"`, neu importieren (3.1.3). Ein Nachbessern auf dem
bestehenden Stand prüft die Reparatur und nicht den Import.

### Klasse D — **der Fund, der aussieht wie C und keiner ist**

**Ein roter Paritätscheck.** `scripts/import/portal.ts:105-107`: „A thrown parity error means the target
was already mutated … not ‚nothing happened'". Der Rückweg ist **die leere Ziel-DB**, nie ein zweiter
Lauf. In der Generalprobe kostet das ein `rm -rf`; im Echtlauf ist es der Grund, warum Kapitel 2 gegen
eine **leere** Ziel-DB importiert und nicht gegen eine „fast fertige".

### Und die Klasse, die keine ist: ein Startabbruch aus `radioBootFehler()`

Fünf Meldungen (§7.3.3) brechen den Start der **gesamten** Suite ab. Das ist **kein Moduldefekt**,
sondern eine unvollständige Env — behebbar in einer Zeile, und die Probe ist danach zu wiederholen.
3.2.3 macht diesen Abbruch zum vorgeschriebenen Handgriff, damit er im Fenster wiedererkannt wird.

### Die Grenze, verschieben oder reparieren

> **Verschoben wird bei Klasse A. Repariert wird bei B, C, D — aber niemals im Cutover-Fenster.**
> Jede Reparatur zieht eine vollständige neue Generalprobe nach sich (3.1.3), und eine vollständige
> Generalprobe passt nicht in ein Fenster ohne Parallelbetrieb.

Der Grund steht in der Lage selbst: es gibt keinen Rückweg-Importer (Suite → radio-admin) und kein
Vorbild dafür (`docs/radio-portierung-analyse.md:626-628`). Der Point of no return ist der **erste
fachliche Schreibvorgang in `radio.db`** nach dem Umschwenk (§9.3.3). Ein Fund, der im Fenster
„schnell" behoben wird, wird also entweder vor diesem Punkt behoben — oder er wird zu einem
Datenverlust mit bekanntem Umfang.

**Die Abbruchbedingung in einem Satz:** *Die Generalprobe ist grün, wenn G1 bis G6 vollständig grün
sind. Ist eine Zeile rot, ist die Generalprobe rot — es gibt keine teilweise grüne Generalprobe, und es
gibt keinen Cutover auf einer roten.*

---

## 3.6 Zusagen an andere Kapitel und die Leerstellen, gesammelt

**Was vor der Generalprobe grün sein muss (Voraussetzungen, keine Zusagen):** der Mapping-Unit-Test aus
§2.2.5 mit **je Feld unterschiedlichen** Fixture-Werten · die Quelltext-Zusicherung zur Cookie-Domain aus
§3.8 · die Abwesenheitsprüfung R36 aus 3.2.6 (V8). Alle drei laufen im Repo und keiner von ihnen ist
durch eine Betriebsprobe ersetzbar.

**Zusagen an Kapitel 2 (Import und Freeze):**

1. Der Echtimport benutzt **dieselbe** Aufrufform wie 3.1.2 — nur mit echtem Snapshot und echtem
   Volume. Vorbild und Begründung: `docs/runbooks/portal-cutover.md:22-33`.
2. Der Echtimport läuft gegen eine **leere** Ziel-DB (§2.8.4), und der Rückweg bei roter Parität ist
   die leere Ziel-DB, nicht ein zweiter Lauf (Klasse D).
3. Die Klasse-B-Bereinigung (`is_target`) wird im Echtlauf **wiederholt**, nicht aus der Generalprobe
   übernommen.
4. `api_tokens` wird **nur in der Quelle** gezählt, als Protokollzeile. Im Ziel existiert die Tabelle
   nicht (Entscheidung 13, B16) — die Sechser-Schleife aus §9.4.3 bricht gegen `radio.db` ab.
5. Der Importer muss committet sein (§2.8.1). Ein Runbook ist nicht ausführbar und nicht gegenlesbar.

**Zusagen an Kapitel 4 (Umschwenk):**

6. Die Wahl zwischen Weg A und Weg B für den Login-Rückweg fällt **vor** dem Cutover-Abend (3.2.4).
7. Die Cloudflare-Zonenregeln für `radio.iuk-ue.de` werden **vor** dem Fenster gelesen und
   protokolliert (3.4).
8. Der Redirect vom Alt-Host wird im selben Fenster wie der Umschwenk scharf, nie davor; die drei
   `curl` aus §9.2.3 laufen danach.
9. Der Druck des ersten Codesatzes ist ein eigener Schritt **nach** dem Umschwenk (3.3.3), und die
   Betreiberfrage C.3 (gedruckte Aufsteller im Umlauf?) ist davor beantwortet.
10. Nach dem Start einmal `docker compose logs --since 2m suite` — erwartet: **keine** `radio:`-Warnung.
    Eine gefundene Warnung ist ein Stopp-Punkt (§7.3.4). Die `info`-Zeile „Retention abgeschaltet" ist
    ein **Zustand**; nach dem Fenster muss sie **fehlen**.
11. Erster Schritt nach dem Umschwenk: ein Telefon, das den Alt-Kiosk kannte, einmal neu laden (§7.1.3).
12. **`SUITE_HOST_RADIO` und `AUTH_URL` werden vor dem Umschwenk nebeneinandergelegt und zeichenweise
    verglichen** (3.2.4 Punkt 5, Präzedenzfall `docs/runbooks/lagerbuch-cutover.md:158`). Kein Test sieht
    einen Unterschied, und der Bruch ist stumm.
13. Was nach dem Umschwenk gegen den Portal-Host zu prüfen bleibt, ist die **Unverändertheit** des
    Portal-Manifests — nicht die Abwesenheit eines radio-Manifests, die §7.1.1 bauartbedingt zusagt
    (V8).

**Zusage an Kapitel 5 (Abbau):**

12. Solange das Standby-Fenster läuft, ist `radio-inventar` das Rollback-Ziel und darf nicht abgebaut
    werden (§9.3.3). **Und: `HISTORY_RETENTION_MONTHS` in der Standby-Umgebung ist vor dem
    Cutover-Abend neutralisiert oder das Volume ist kopiert** — danach ist es zu spät, weil der erste
    Start schon gelöscht hat (§9.3.4 Zeile 1). Jede feldweise Nachprüfung läuft gegen die
    **Snapshot-Kopie**, nie gegen einen gebooteten Alt-Stack.

**Die Leerstellen dieses Kapitels, vollständig:**

* ⬜ **die Abschlusszeile von `scripts/import/radio.ts`** — bei `portal` ist es `parity green`; das
  Runbook prüft Zeichenkette **und** Exit-Code (3.1.2, G2).
* ⬜ **der genaue `Location`-Kopf von V2** — Statuscode und der Wert, den `verwaltungsZiel(headers)` in
  die `callbackUrl` schreibt (3.2.6). Abgelesen und protokolliert wird er in jedem Fall.
* ⬜ **was `GET /m/radio` mit `Host: iuk-ue.de` liefern soll** — 404 aus dem Host-Riegel oder eine
  gerenderte Fläche; §1.2 entscheidet es, V7 liest es in jedem Fall ab (3.2.6).
* ⬜ **ob `/` oder `/t/<code>` eine kamerabasierte Fläche trägt** — falls ja, ist der sichere Kontext
  für sie Pflicht und Stufe 3 stellt ihn her; falls nein, bleibt es beim Secure-Cookie als einzigem
  Grund (3.3.1).

**Und die Stelle, an der mir eine Vorlage fehlt, ausdrücklich benannt:** es gibt **kein**
`scripts/import/lagerbuch.ts` im Repo, obwohl dieser Import produktiv gelaufen ist. Die Aufrufform, die
Paritätsausgabe und der Umgang mit einem abgebrochenen Lauf sind hier aus `portal` abgeleitet — dem
**zweitnächsten** Vorbild. Spec 1 §2.8.1 sagt dasselbe und zieht daraus die richtige Folge: „Das ist
kein Vorbild, dem zu folgen wäre."
