# Runbook — Backup-Sidecar statt Host-Cron

Für den Server-Agenten. **Kein Cutover, keine Domain zieht um.** Der Lauf, der die
Sicherungen erzeugt, wandert vom Host-Cron in den Compose-Stack und bekommt dabei drei
Dinge, die er vorher nicht hatte: ein externes Ziel, eine Rückmeldung bei Fehlschlag und
Sichtbarkeit im Deployment.

> **Das Eigentümliche an diesem Update: `scripts/backup.sh` ist fast unverändert.**
> Gesichert wird genau wie bisher — konsistente SQLite-Kopie je Modul, die `files`-Blobs
> daneben, ein Tarball je Lauf. Was sich ändert, ist **wer** es ruft und **was danach mit
> dem Tarball passiert**. Die Substanz dieses Runbooks steckt deshalb in **Abschnitt 3
> (die .env)** und **Abschnitt 6 (Wiederherstellung)** — nicht in den Handgriffen.

Ticket: DRK-185. Entstanden aus Entscheidung **D1** der Lagerbuch-Portierung.

## 0. Was sich für die Daten NICHT ändert

* **Die Körnung bleibt: ein Tarball je Lauf, `BACKUP_KEEP` Generationen.** Nicht
  Einzeldateien mit Aufbewahrung nach Tagen. Die Begründung steht in Abschnitt 7 — sie
  gehört zur Abnahme, nicht in eine Fußnote.
* **Alte Sicherungen bleiben liegen, wo sie sind** (`<suite_data>/backups`). Der Sidecar
  schreibt ab jetzt nach `backup_data`; er räumt das alte Verzeichnis **nicht** auf und
  rotiert es auch nicht mehr. Abschnitt 8 sagt, wann es weg darf.
* **Die Bildnachweise des Moduls `aufgaben` sind weiterhin NICHT im Tarball.** Das ist
  eine bekannte Lücke (DRK-391), keine Nebenwirkung dieses Updates. Wer das
  Volume `aufgaben_data` nutzt, sichert es bis dahin daneben.

## 1. Vorbedingung: vier Dateien statt zwei

Bisher mussten `compose.yaml` und `clamd.files.conf` neben der `.env` auf dem Server
liegen. Ab jetzt sind es **vier**:

```
$STACK_DIR/compose.yaml
$STACK_DIR/clamd.files.conf
$STACK_DIR/scripts/backup.sh
$STACK_DIR/scripts/backup-sidecar.sh
```

> ⚠️ **`scripts/deploy.sh` (Schritt 1) vergleicht ab jetzt alle vier byteweise mit dem
> Repo und bricht bei Abweichung ab.** Der erste Rollout nach diesem Merge schlägt also
> fehl, bis die Dateien liegen — das ist gewollt und folgenlos (Schritt 1 fasst noch
> nichts an). Diesen Abschnitt **vor** der nächsten Freigabe abarbeiten.

```bash
cd /opt/iuk-suite          # bzw. das Verzeichnis mit compose.yaml und .env
mkdir -p scripts

# Erst diffen, DANN übernehmen — die Server-compose.yaml kann Einträge führen, die die
# Repo-Vorlage nie hatte (Historie: ADMIN_GROUP am 19.07.2026).
diff -u compose.yaml /pfad/zum/repo/compose.yaml

cp /pfad/zum/repo/compose.yaml            compose.yaml
cp /pfad/zum/repo/scripts/backup.sh       scripts/backup.sh
cp /pfad/zum/repo/scripts/backup-sidecar.sh scripts/backup-sidecar.sh
```

Gegenprobe, dass es wirklich Dateien sind und keine Verzeichnisse:

```bash
file scripts/backup.sh scripts/backup-sidecar.sh
```

> ⚠️ **Warum das eine eigene Zeile wert ist:** fehlt eine der beiden beim `up -d`, legt
> Docker an ihrer Stelle ein **leeres Verzeichnis** an. Der Container startet dann mit
> „Is a directory", und `restart: unless-stopped` macht daraus eine Neustartschleife —
> ein Stack, der läuft, ein Dienst, der ständig neu startet, und kein Backup. Dieselbe
> Falle wie bei `clamd.files.conf`, nur zweimal.

## 2. Was der Dienst mitbringt

| | |
|---|---|
| **Zeitgeber** | Täglich `BACKUP_UHRZEIT` (Vorgabe 03:30) in `TZ` (Vorgabe `Europe/Berlin`). |
| **Lokal** | Eigenes Volume `backup_data`, `BACKUP_KEEP` Generationen (Vorgabe 7). |
| **Extern** | `rclone copy` nach `BACKUP_RCLONE_ZIEL`, dort `BACKUP_RCLONE_KEEP` Generationen (Vorgabe 30). |
| **Meldung** | Healthcheck am Container **und** Ping an `BACKUP_PING_URL`. |
| **Von Hand** | `docker compose run --rm backup /bin/sh /opt/backup/backup-sidecar.sh einmal` |
| **Diagnose** | … `backup-sidecar.sh werkzeuge <befehl …>` — siehe den Kasten unten |
| **Gleichzeitigkeit** | Eine Sperre im Volume; ein zweiter Lauf wartet, statt den ersten zu zerstoeren. |

Das Basis-Image ist ein nacktes `alpine`; die Werkzeuge (`bash sqlite tar rsync rclone
curl su-exec tzdata`) kommen beim Start per `apk add` dazu. Der Preis ist benannt: der
Start braucht Netz. Ein schweigender Paketspiegel ist damit eine Neustartschleife — laut,
und in `docker compose ps` sichtbar.

> ⚠️ **JEDER Handgriff mit `rclone`, `sqlite3`, `rsync` oder `bash` laeuft ueber
> `werkzeuge` — nicht direkt.** `docker compose run` ueberschreibt das `command` des
> Dienstes und startet einen **frischen** Container aus dem nackten Image; der Vorlauf,
> der die Pakete nachlaedt, kaeme dann nie dran. `docker compose run --rm backup rclone lsl …`
> stirbt mit „executable file not found" — genau in dem Moment, in dem jemand zum ersten
> Mal prueft, ob die Sicherung etwas taugt. Ohne `apk` bringt busybox nur `sh`, `ls`,
> `tar`, `du` und `cat` mit.
>
> ⚠️ **Und die Variablen gehoeren in einfache Anfuehrungszeichen.** `"$BACKUP_RCLONE_ZIEL"`
> in doppelten expandiert die Shell des **Hosts**, wo die Variable nicht gesetzt ist —
> herauskaeme ein leerer Pfad, und `rclone` liste das falsche Verzeichnis. Deshalb steht
> in allen Beispielen unten `sh -c '…'` mit einfachen Anfuehrungszeichen.

### Gleichzeitigkeit

Der Dienst und ein `… einmal` aus dem Rollout sind **getrennte Container am selben
Volume**. `scripts/backup.sh` benennt Arbeitsverzeichnis und Archiv nur auf die Sekunde
genau: starten beide gleichzeitig, schreiben sie dieselben Dateien, und das Aufraeumen des
einen zieht dem `tar` des anderen den Boden weg. Eine Sperre im Volume
(`<backup_data>/.lauf.sperre`) verhindert das — der zweite **wartet** bis zu
`BACKUP_SPERRE_FRIST_MINUTEN` (Vorgabe 30) und gibt danach mit Exit 1 auf.

Warten und nicht ueberspringen, und das ist Absicht: ein uebersprungener Lauf waere fuer
`deploy.sh` ein gruener Exit-Code **ohne Sicherung**, und es rollte ohne aus. Ein zweites
Tarball kurz nach dem ersten kostet dagegen nur Platz.

Wird ein Container mitten im Lauf hart beendet (SIGKILL), bleibt die Sperre stehen. Sie
gilt nach `BACKUP_SPERRE_ALTER_STUNDEN` (Vorgabe 6) als verwaist und wird mit einer
Warnung im Protokoll uebernommen; von Hand entfernt man sie so:

```bash
docker compose run --rm backup rm -rf /backups/.lauf.sperre
```

## 3. Die `.env` — hier steckt die Arbeit

Alles ist vorbelegt. **Zwei Zeilen zu lassen, wie sie sind, ist trotzdem eine
Entscheidung**, und zwar die teuerste dieses Runbooks:

* **Ohne `BACKUP_RCLONE_ZIEL`** liegt die Sicherung auf demselben Server wie die Daten und
  überlebt dessen Verlust nicht. Genau das war Grund 2 für dieses Ticket.
* **Ohne `BACKUP_PING_URL`** meldet sich ein Fehlschlag nur im Healthcheck — also nur
  dort, wo jemand hinsehen muss. Grund 3.

Der Dienst schreibt beides beim Start als Warnung ins Protokoll, statt es zu verschweigen.
Entscheiden kann er es nicht.

### 3.1 Externes Ziel

Die rclone-Zugangsdaten gehören in die `.env`, **nicht** in eine fünfte Datei neben der
`compose.yaml`: dort liegen die Geheimnisse dieses Stacks ohnehin, und der Rollout
vergleicht die `.env` nicht. Das Schema ist `RCLONE_CONFIG_<FERNNAME>_<SCHLÜSSEL>`, der
Fernname GROSS und derselbe wie links vom Doppelpunkt im Ziel:

```
BACKUP_RCLONE_ZIEL=hetzner:iuk-suite/backups
RCLONE_CONFIG_HETZNER_TYPE=s3
RCLONE_CONFIG_HETZNER_PROVIDER=Other
RCLONE_CONFIG_HETZNER_ENDPOINT=https://fsn1.your-objectstorage.com
RCLONE_CONFIG_HETZNER_ACCESS_KEY_ID=…
RCLONE_CONFIG_HETZNER_SECRET_ACCESS_KEY=…
```

> ⚠️ **Den Pfad im Ziel zweimal lesen.** Der Sidecar **löscht** dort — er hält
> `BACKUP_RCLONE_KEEP` Generationen. Er löscht ausschließlich, was wie unser Tarball
> aussieht (`*.tar.gz`), und einzeln per Dateiname; ein gemeinsam genutzter Eimer verliert
> dadurch nichts. Ein Ziel mit **einem Pfad zu wenig** (`hetzner:iuk-suite` statt
> `hetzner:iuk-suite/backups`) wäre trotzdem ein schlechter Tag. Wer das nicht will:
> `BACKUP_RCLONE_KEEP=aus`.

**Den Platzbedarf vorher ausrechnen, nicht hinterher feststellen.** Jede Generation
enthält die **vollen** Blobs, es gibt keine Deduplizierung zwischen Läufen:

```bash
docker compose run --rm backup /bin/sh -c 'du -sh /data /data/files'
# 30 Generationen ≈ 30 × diese Summe am Ziel, plus BACKUP_KEEP × am Server.
```

Ist das zu viel, ist die Antwort `BACKUP_RCLONE_KEEP` (oder ein Ziel mit eigener
Versionierung), **nicht** ein selteneres Backup.

### 3.2 Überwachung

`BACKUP_PING_URL` folgt dem Muster von healthchecks.io und Uptime Kuma: Erfolg ruft die
URL, Fehlschlag ruft `$URL/fail`.

> ⚠️ **Das ist der einzige Meldeweg, der auch das Schweigen meldet.** Der Healthcheck sieht
> einen gescheiterten und einen überfälligen Lauf — aber nur, solange ihn jemand ansieht.
> Ein Ziel, das den **ausbleibenden** Ruf als Alarm wertet, meldet sich von selbst, auch
> wenn der ganze Container weg ist. Beim Einrichten dort die Erwartung auf **einen Ruf pro
> Tag plus Karenz** stellen, passend zu `BACKUP_UHRZEIT`.

## 4. Deploy

```bash
cd /opt/iuk-suite
docker compose config >/dev/null        # Syntax, bevor etwas angefasst wird
docker compose up -d backup
docker compose logs -f backup
```

Erwartet im Protokoll, in dieser Reihenfolge:

```
Vorlauf: Pakete nachladen (bash sqlite tar rsync rclone curl su-exec tzdata)
Vorlauf fertig, weiter als 1001:1001
Backup-Sidecar bereit.
  Zeit:      taeglich 03:30 (TZ=Europe/Berlin)
  Lokal:     /backups, 7 Generationen
  Extern:    hetzner:iuk-suite/backups, 30 Generationen
  Meldung:   Ping nach jedem Lauf
Naechster Lauf in 8h 6min.
```

**Steht dort eine `WARNUNG:`-Zeile zu `BACKUP_RCLONE_ZIEL` oder `BACKUP_PING_URL`, ist
Abschnitt 3 nicht durch.** Zurück, nicht weiter.

`docker compose up -d` ohne Dienstnamen tut es auch — die Suite wird dabei nicht neu
gestartet, solange sich an ihrem Abschnitt nichts geändert hat. **`depends_on` gibt es in
keine Richtung**: der Backup-Dienst kann die Suite nicht am Starten hindern, und umgekehrt.

## 5. Probelauf — der eigentliche Beweis

**Nicht bis 03:30 warten.** Der Probelauf ist zugleich der Schritt, der den Healthcheck
aus `starting` holt (vor dem ersten Lauf gibt es keinen Stand, den er lesen könnte):

```bash
docker compose run --rm backup /bin/sh /opt/backup/backup-sidecar.sh einmal
```

Erwartet am Ende:

```
Lokal: /backups/20260916T191500.tar.gz (412M)
Auslagern nach hetzner:iuk-suite/backups
Rotation am Ziel: die neuesten 30 Generationen behalten
Lauf fertig: /backups/…tar.gz (412M), ausgelagert nach hetzner:iuk-suite/backups
Ping (ok) abgesetzt.
```

Dann die drei Gegenproben — **jede einzeln, keine ersetzt eine andere**:

```bash
# 1) Liegt es lokal?
docker compose run --rm backup ls -lh /backups

# 2) Liegt es WIRKLICH am Ziel? (nicht: „rclone hat nicht gemeckert")
docker compose run --rm backup /bin/sh /opt/backup/backup-sidecar.sh werkzeuge \
  sh -c 'rclone lsl "$BACKUP_RCLONE_ZIEL/"'

# 3) Ist der Inhalt der, den man erwartet? — der Schritt, den man weglässt
docker compose run --rm backup /bin/sh -c \
  'tar -tzf "$(ls -1t /backups/*.tar.gz | head -1)" | head -30'
```

Im Tarball müssen stehen: **jede** `*.db` aus `MODULE_MIGRATIONS` und `CORE_MIGRATIONS`
(heute u. a. `portal.db`, `qr.db`, `feedback.db`, `files.db`, `lagerbuch.db`,
`aufgaben.db`, `radio.db`, `uav.db`, `zeichen.db`, `konto.db`, `audit.db`) — **und** ein
Verzeichnis `files/` mit Blobs, sofern im Modul `files` überhaupt welche liegen.

> ⚠️ **Fehlt eine `*.db`, ist das KEIN Backup-Fehler, sondern ein Hinweis auf ein Modul,
> das nie gebootet hat.** `scripts/backup.sh` sammelt ein, was in `$DATA_DIR` liegt; eine
> Datenbank entsteht beim ersten Start ihres Moduls. Vor dem Cutover eines Moduls ist ihr
> Fehlen also richtig.

Und zuletzt der Healthcheck:

```bash
docker compose ps backup                  # muss (healthy) sein, nicht (health: starting)
docker compose exec backup /bin/sh /opt/backup/backup-sidecar.sh zustand
```

## 6. Wiederherstellung — vorher üben, nicht nachher lesen

**Ein Backup, das nie zurückgespielt wurde, ist eine Vermutung.** Der Rundlauf gehört
einmal gemacht, und zwar gegen einen **ephemeren Container ohne Traefik-Labels**, nie
gegen das Produktivvolume:

```bash
# Tarball holen — lokal oder vom Ziel
docker compose run --rm backup /bin/sh /opt/backup/backup-sidecar.sh werkzeuge \
  sh -c 'rclone copy "$BACKUP_RCLONE_ZIEL/20260916T033000.tar.gz" /backups/probe/'

# In ein WEGWERF-Verzeichnis auspacken
docker compose run --rm backup /bin/sh -c \
  'mkdir -p /backups/probe/aus && tar -xzf /backups/probe/20260916T033000.tar.gz -C /backups/probe/aus'

# Die Datenbanken einzeln auf Unversehrtheit prüfen — das ist der Kern
docker compose run --rm backup /bin/sh /opt/backup/backup-sidecar.sh werkzeuge \
  sh -c 'for db in /backups/probe/aus/*/*.db; do
     printf "%-28s %s\n" "$(basename "$db")" "$(sqlite3 "$db" "pragma integrity_check;")"
   done'
```

Jede Zeile muss `ok` sagen. Danach das Wegwerf-Verzeichnis entfernen.

Für den echten Ernstfall: **Suite stoppen, bevor Dateien ins Volume zurückgehen.**

```bash
docker compose stop suite
# … Dateien aus dem entpackten Stand nach /data zurückkopieren, als SUITE_USER …
docker compose start suite
```

> ⚠️ **Ein Restore ist kein Rollback.** Die Boot-Instrumentation migriert beim Start nach
> vorn; ein Tarball von vor einer Migration passt nicht zu einem neueren Image. Wer weit
> zurückgeht, braucht **beides** — die Daten von damals und das Image von damals
> (`SUITE_IMAGE` in der `.env`, siehe `auto-rollout.md`, Teil D).

## 7. Die Körnung — die Entscheidung, die das Ticket offen ließ

**Es bleibt beim Tarball je Lauf mit `KEEP`-Generationen.** Nicht Einzeldateien mit
Aufbewahrung nach Tagen. Drei Gründe, in dieser Reihenfolge:

1. **Ein Tarball ist ein Zeitpunkt.** Alle Modul-Datenbanken und die Blobs stammen aus
   demselben Lauf. Einzeldateien mit eigener Aufbewahrung ergäben eine Mischung aus
   `lagerbuch.db` von heute und Blobs von vorgestern — ein Stand, den es nie gab, und der
   Fehler fiele erst beim Zurückspielen auf.
2. **Generationen sind ehrlicher als Tage, sobald ein Lauf scheitern kann.** „7 Tage
   Aufbewahrung" wird stillschweigend zu „0 Sicherungen", wenn acht Tage lang nichts lief.
   „7 Generationen" heißt immer sieben tatsächliche Sicherungen.
3. **`scripts/backup.sh` ist erprobt.** Seine Abbruchbedingungen (kein `*.db` gefunden,
   vollständige Zeilen ohne Blobs) sind der Ertrag zweier Fehlerbilder aus dem
   `files`-Cutover. Die Körnung zu drehen hieße, diesen Kern neu zu schreiben.

**Der Preis, ausgeschrieben:** keine Deduplizierung zwischen Generationen. Jede enthält die
vollen Blobs. Wird das teuer, ist der Hebel `BACKUP_RCLONE_KEEP` oder ein Ziel mit eigener
Versionierung — **nicht** ein selteneres Backup.

## 8. Den Host-Cron abbauen — zuletzt, nicht zuerst

**Erst wenn Abschnitt 5 durch ist und mindestens ein planmäßiger Lauf um 03:30 grün war.**
Zwei parallele Sicherungen für eine Nacht sind kein Problem; eine Lücke zwischen abgebautem
Cron und erstem Sidecar-Lauf ist eine.

```bash
crontab -l                 # den Eintrag ablesen und notieren, bevor er weg ist
crontab -e                 # die Zeile mit backup.sh entfernen
```

Danach:

* **`SUITE_BACKUP_CMD`** in den GitHub-Repository-Variablen auf den Sidecar umstellen — der
  Wert braucht keine Host-Pfade mehr, weil die Volumes im Container schon an der richtigen
  Stelle liegen:
  ```
  SUITE_BACKUP_CMD=docker compose run --rm backup /bin/sh /opt/backup/backup-sidecar.sh einmal
  ```
  (`run --rm` und nicht `exec`: bei einem gescheiterten Rollout läuft der Container
  womöglich gerade nicht, und gesichert werden muss trotzdem.)
* **Die alten Tarballs unter `<suite_data>/backups`** rotiert ab jetzt niemand mehr. Sie
  dürfen weg, sobald am neuen Ort `BACKUP_KEEP` Generationen liegen — also nach
  `BACKUP_KEEP` Tagen. Bis dahin sind sie die einzige Tiefe vor der Umstellung.

## 9. Fehlerbilder

### F1 — `docker compose ps backup` zeigt dauerhaft `Restarting`

`docker compose logs backup` lesen. Die zwei häufigen Ursachen:

* **„Is a directory"** → eine der beiden Skriptdateien fehlt auf dem Server, Docker hat ein
  Verzeichnis angelegt. Abschnitt 1, inklusive der `file`-Gegenprobe.
* **`apk` scheitert** → kein Netz aus dem Container heraus, oder der Tag in
  `SUITE_BACKUP_IMAGE` kennt einen der Paketnamen nicht. Gegenprobe:
  ```bash
  docker compose run --rm backup /bin/sh -c 'apk add --no-cache bash sqlite rclone'
  ```

### F2 — `(health: starting)` und es hört nicht auf

Vor dem **ersten** Lauf gibt es keine Zustandsdatei; die Spanne ist mit Absicht 26 Stunden
lang (`SUITE_BACKUP_START_PERIOD`). Der Probelauf aus Abschnitt 5 beendet sie sofort. Hört
es auch danach nicht auf, schreibt der Lauf nicht ins richtige Volume — `BACKUP_DIR` in
`compose.yaml` gegen den Mount `backup_data:/backups` halten.

### F3 — `(unhealthy)`, aber es gibt Tarballs

```bash
docker compose exec backup /bin/sh /opt/backup/backup-sidecar.sh zustand
```

Die Meldung sagt, welcher der beiden Fälle es ist:

* **„letzter Lauf gescheitert: …"** → im Protokoll nachlesen. Steht dort „Tarball liegt
  lokal, das Auslagern … ist gescheitert", **ist das ein echter Fehlschlag**: der ganze
  Zweck des Ziels ist der Fall „Server weg", und den hat dieser Lauf nicht abgedeckt.
* **„letzter Erfolg vor Nh — Frist sind 26h"** → es läuft niemand mehr. Protokoll auf den
  letzten „Naechster Lauf in …" prüfen; wurde der Container zwischendurch neu erzeugt,
  fängt der Zeitgeber bei der nächsten Uhrzeit wieder an.

### F4 — Der Ping kommt nicht an

Der Lauf ist davon **nicht** betroffen — die Sicherung liegt. Im Protokoll steht dann
„WARNUNG: Ping an … ist gescheitert". Das ist trotzdem eine Störung, denn die Überwachung
ist blind: aus ihrer Sicht ist ein nicht gemeldeter Erfolg dasselbe wie ein ausgefallener
Dienst. Netzweg aus dem Container prüfen:

```bash
docker compose run --rm backup /bin/sh -c 'apk add --no-cache curl >/dev/null && curl -fsS -o /dev/null -w "%{http_code}\n" "$BACKUP_PING_URL"'
```

## Was in diesem Runbook NICHT vorkommt

* **Ein zweites eigenes Image.** Der Sidecar ist ein nacktes `alpine` plus `apk add` beim
  Start. Ein eigenes Image hieße: eigener Build-Job, eigene Digest-Kette, eigener
  Rollout-Pfad — für einen Dienst, der einmal am Tag ein Skript ruft. Der Tausch ist
  benannt (Abschnitt 2), nicht verschwiegen.
* **Ein modul-eigener Timer** (`startBackgroundWork()`). Bei D1 ausdrücklich verworfen: ein
  Nebenläufer im Suite-Prozess ist die Kopplung, die beim nächsten Deploy niemand erwartet,
  und er hätte für jedes Modul einzeln gebaut werden müssen.
* **Verschlüsselung der Tarballs am Ziel.** Heute nicht vorgesehen; wer sie braucht, nimmt
  ein rclone-`crypt`-Ziel — dann ändert sich hier genau eine Zeile (`BACKUP_RCLONE_ZIEL`),
  und die Schlüsselverwahrung ist eine Betreiberentscheidung mit eigenem Gewicht.
