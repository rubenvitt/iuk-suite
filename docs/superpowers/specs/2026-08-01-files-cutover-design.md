# Spec 2 — Inbetriebnahme des Moduls `files`: Gruppen und Cutover

Stand 2026-08-01. Setzt Spec 1 (`2026-07-30-files-modul-design.md`, 51/51 Tasks gebaut und committet)
voraus und ersetzt deren §1.2 („Was ausdrücklich Spec 2 ist") in dem Umfang, den der Betreiber am
01.08. entschieden hat.

---

## 1. Auftrag und Abgrenzung

### 1.1 Was diese Spec ist

Zwei Dinge, mehr nicht:

1. **Gruppen-Migration** — die Menschen, die heute mit `easy-filesharing` und `drop` arbeiten,
   kommen in die Pocket-ID-Gruppe, die das Modul `files` gaten soll.
2. **Deployment-Cutover** — `share.iuk-ue.de` und `drop.iuk-ue.de` zeigen auf die Suite, beide in
   **einem** Wartungsfenster; danach werden beide Alt-Stacks **abgebaut**.

### 1.2 Was entfällt — und warum das eine Entscheidung ist, keine Vereinfachung

Der Betreiber hat am 01.08. festgestellt: **es gibt keinen Bestand.** Damit entfällt der gesamte
Datenteil, den Spec 1 §1.2 für Spec 2 vorgesehen hatte:

| Entfällt | Weil |
|---|---|
| `scripts/import/files.ts`, `dropParityView`, Manifest über den Dateibaum | nichts zu importieren |
| Blob-Umzug aus MinIO | keine Objekte |
| Paritätscheck, feldweise Stichproben, Differenzbericht für `size` | kein Import, dessen Rundlauf zu beweisen wäre |
| AV-Nachscan des Altbestands | kein Altbestand; der Zustand `unscanned` bleibt gebaut und **unbenutzt** |
| Generalprobe mit Snapshot-Kopie | die Probe prüfte den Import; ohne ihn probt sie nichts |
| Volume-Snapshot vor dem Import | kein Import, kein Schreibvorgang, der zurückzunehmen wäre |

**Das ist die riskanteste Zeile dieser Spec**, deshalb steht sie nicht am Ende: „kein Bestand" ist
eine **Behauptung über den Server**, und diese Spec nimmt sie nicht an, sondern **belegt sie** — vor
dem Fenster, mit Zählungen (§2). Fällt die Zählung anders aus, gilt diese Spec nicht und die große
Fassung aus Spec 1 §1.2 tritt wieder in Kraft. Ein Cutover, der einen übersehenen Bestand
mitabbaut, ist nicht rückabwickelbar: die Alt-Stacks werden **abgebaut**, nicht in Standby gestellt.

### 1.3 Was aus Spec 1 gültig bleibt

§1.3 dort („Was Spec 2 von hier erbt") bleibt **vollständig gültig**, auch wo einzelne Zeilen jetzt
gegenstandslos sind (die Mapper-Regeln haben ohne Import keinen Adressaten). Zwei Erbstücke tragen
weiterhin unmittelbar:

- **`SUITE_HOST_FILES` führt beide Hosts, und die Reihenfolge trägt die Rolle** — Index 0 =
  `verwaltung` = `share.iuk-ue.de`, Index 1 = `inbox` = `drop.iuk-ue.de`.
- **Zeitstempel sind Unix-Sekunden.** Für den Betrieb heißt das nur: wer je von Hand in `files.db`
  schaut, liest Sekunden, nicht Millisekunden.

---

## 2. „Kein Bestand" ist zu belegen, nicht zu glauben

**Vor** dem Wartungsfenster, auf dem Server, mit Ausgabe zum Mitschreiben. Vier Zählungen; jede
einzelne, die nicht null ergibt, **stoppt** diese Spec:

| Was | Wo (aus der Analyse, mit Beleg) | Wie | Erwartet |
|---|---|---|---|
| Freigaben und Dateien in `easy-filesharing` | **`/data/db.sqlite` im Docker-Volume `db-data`** (`docker-compose.yml:15,18`) — **nicht** die `db.sqlite` im Arbeitsbaum, die ist ohnehin leer | `sqlite3 /data/db.sqlite "SELECT (SELECT count(*) FROM shares), (SELECT count(*) FROM share_files), (SELECT count(*) FROM download_logs);"` | `0\|0\|0` |
| Objekte im MinIO-Bucket | Bucket der Alt-App | `mc ls --recursive <alias>/<bucket> \| wc -l`, dazu `mc ls --incomplete` | `0` |
| Dateien im Postfach von `drop` | `drop` führt **kein** Datenmodell für die Nutzlast — die Wahrheit ist ausschließlich der Dateibaum unter `metaDir` und dem Blob-Verzeichnis | `find <metaDir> -type f \| wc -l`, dasselbe für das Blob-Verzeichnis | `0` |
| Laufende Zugangsschlüssel in `drop` | `data/auth/better-auth.sqlite`, Tabelle `apikey` (Better-Auth-Schema, nicht unseres) | `sqlite3 <pfad>/better-auth.sqlite "SELECT id, name, start, createdAt, expiresAt FROM apikey;"` — **Zeilen lesen, nicht filtern** | keine Zeile mit `expiresAt` in der Zukunft |

Zur letzten Zeile: die Abfrage steht bewusst **ohne** `WHERE`. Die Einheit von `expiresAt` gehört
Better-Auth, nicht diesem Projekt; ein `WHERE expiresAt > strftime('%s','now')` wäre eine
Behauptung über eine fremde Spalte und liefert bei falscher Einheit **stillschweigend null Treffer**
— also genau die Antwort, die man sehen will. Zeilen ausgeben und selbst lesen ist hier billiger als
recht zu haben.

**Der Pfad von `metaDir` ist eine Runbook-Eingabe** (Spec 1 §13.4, Frage 26) — ohne ihn zählt die
dritte Zeile ins Leere und meldet dabei Erfolg. Das ist genau die Form von Fehlschlag, vor der Spec 1
durchgehend warnt: eine Prüfung, die nichts findet, weil sie am falschen Ort sucht, sieht aus wie
eine bestandene Prüfung. Dasselbe gilt für Zeile 1: die Datei im Repo-Arbeitsbaum ist **leer und
nicht die Produktionsdatei** — wer sie zählt, bekommt das erwartete Ergebnis aus dem falschen Ort.

**Was auch bei leerem Bestand im Umlauf sein kann**, und was das jeweils bedeutet:

- **Gedruckte oder verteilte `/u/<token>`-Zugangslinks.** Sie haben ≤ 72 h Laufzeit. Ist die vierte
  Zählung null, gibt es keine gültigen mehr — ein alter Link läuft nach dem Cutover auf die
  Suite-Antwort für unbekannte Token, und die ist **absichtlich nicht unterscheidbar** von „falsch
  eingegeben". Das ist richtig und muss niemandem erklärt werden.
- **`/s/<id>`-Links.** Ohne `shares`-Zeilen kann keiner mehr gültig sein.
- **Lesezeichen auf die Verwaltungsoberflächen der Alt-Apps.** Sie landen nach dem Cutover auf der
  Suite. Wer dort keine Modulgruppe hat, bekommt **404** — nicht den Login (§3.4).

---

## 3. Die Gruppen-Migration

### 3.1 Wie der Zugang wirklich entschieden wird

`files` ist `requiresAuth: false` — das ist Pflicht, sonst schickte die Middleware jeden anonymen
`/s/<id>`- und `/u/<token>`-Aufruf in den Login. **Folge:** `canAccess` liest `requiredGroups` für
dieses Modul **nie**, und die Middleware gatet die Verwaltung **nicht**. Der einzige Riegel ist
`_lib/access.ts`, und er liest:

```
erlaubteGruppen() = adminGroupsFor(files) ∪ requiredGroupsFor(files)
                  = SUITE_ADMIN_GROUP_FILES  ∪  SUITE_ACCESS_GROUP_FILES
                    (Rückfall: "drk-files-admin")   (Rückfall: leere Liste)
```

**Es ist eine Vereinigung, kein Vorrang.** Beide Variablen gewähren dieselbe eine Stufe: wer in einer
der genannten Gruppen ist, darf alles — auch fremde Freigaben und das Audit-Log. Es gibt **keine**
Ownership-Prüfung zwischen Mitgliedern, und der Suite-Admin bekommt **keine** Abkürzung
(Betreiberentscheidung vom 30.07.).

### 3.2 Die Entscheidung vom 01.08. und ihre Falle

**Entschieden:** eine **bestehende** Pocket-ID-Gruppe wird wiederverwendet; ihr Name kommt per
`SUITE_ACCESS_GROUP_FILES` in die `.env`. Die Mitgliederliste pflegt der Betreiber **von Hand** in
Pocket ID — es gibt keine Altquelle, aus der sie abzuleiten wäre.

**Die Falle steckt in der Vereinigung:** `SUITE_ACCESS_GROUP_FILES=<bestehende-gruppe>` **ersetzt
nicht** die Registry-Vorgabe `drk-files-admin`, sondern **tritt neben sie**. Existiert in Pocket ID
eine Gruppe dieses Namens — heute oder irgendwann später —, hat jedes ihrer Mitglieder vollen Zugang
zum Modul, ohne dass es je in der `.env` steht. Zwei saubere Auswege, beide zulässig:

| Weg | Wirkung | Wann |
|---|---|---|
| **`SUITE_ADMIN_GROUP_FILES=<dieselbe-gruppe>`** (empfohlen) | Die Vereinigung fällt auf genau einen Namen zusammen. Der Registry-Rückfall ist überschrieben und kann nicht mehr wirken. | immer, wenn nur eine Gruppe gelten soll |
| Registry-Vorgabe bewusst stehen lassen | `drk-files-admin` bleibt zusätzlich gültig | nur, wenn es die Gruppe geben **soll** |

Die Spec verlangt **eine der beiden Zeilen ausdrücklich** in der `.env`, damit die Entscheidung
sichtbar dort steht, wo jemand sie später liest — und nicht nur in einem Registry-Feld, das beim
Lesen wie eine Vorgabe aussieht und wie eine Berechtigung wirkt.

**Ein leerer Wert ist kein „aus":** `SUITE_ACCESS_GROUP_FILES=` **bricht den Boot ab** (die leere
Zeile wäre wirkungslos, der Registry-Wert gälte weiter — deshalb wird sie als Konfigurationsfehler
gemeldet). Das ist das Gegenteil von `SUITE_HOST_FILES=`, wo leer eine sinnvolle Aussage ist. Die
beiden Variablen sehen gleich aus und verhalten sich entgegengesetzt.

### 3.3 Der Takt, in dem eine Gruppenänderung ankommt

Gruppen stehen im JWT und sind nur so frisch wie der letzte erfolgreiche Token-Refresh — Takt ist die
Access-Token-Lebensdauer von Pocket ID, heute **eine Stunde**, nicht die Sitzungsdauer (30 Tage).

Für den Cutover-Tag heißt das zweierlei, und beides gehört ins Runbook:

- Wer **schon angemeldet** ist, sieht die frisch vergebene Gruppe **bis zu eine Stunde** lang nicht.
  Abkürzung: einmal ab- und wieder anmelden.
- Ein **Gruppenentzug** wirkt mit demselben Verzug. Eine serverseitige Auflösung aus der Datenbank —
  der Weg, den `CLAUDE.md` für eilige Fälle nennt — ist hier **nicht möglich**: es gibt keine
  Objekt-Zugehörigkeit, an der man sie auflösen könnte. Das ist die Kehrseite der Ein-Stufen-
  Entscheidung, und sie ist bekannt, nicht übersehen.

### 3.4 Die Probe, dass die Gruppe wirklich ankommt

Zwei Anmeldungen, und die **zweite** ist die eigentliche Prüfung:

1. **Mitglied:** anmelden, `https://share.iuk-ue.de/` aufrufen → die Freigaben-Übersicht erscheint
   (leer, mit „Noch keine Freigabe angelegt").
2. **Nicht-Mitglied** (ein beliebiges Suite-Konto ohne die Gruppe): dieselbe Adresse → **HTTP 404**,
   **nicht** der Login und **nicht** eine leere Liste. Ein 200 an dieser Stelle heißt: die Gruppe
   greift nicht, und die gesamte Verwaltung steht jedem angemeldeten Suite-Nutzer offen.

Probe 2 ist nicht optional. Sie ist der einzige Beleg dafür, dass der Name in der `.env` **genau** so
geschrieben ist wie der Gruppenname im `groups`-Claim — der Vergleich ist exakt, inklusive
Groß-/Kleinschreibung, und ein Tippfehler äußert sich nur als „niemand kommt rein" (harmlos, fällt
sofort auf) **oder**, wenn er die falsche Variable trifft, gar nicht (nicht harmlos).

### 3.5 Was mit den Alt-Zugängen passiert

Beide Alt-Apps hatten eigene Zugangswege, und beide enden mit dem Abbau:

- `easy-filesharing`: Better-Auth-Konten in einer eigenen SQLite-Datei. Sie verschwinden mit dem
  Volume. **Niemand muss migriert werden** — ab dem Cutover ist Pocket ID der einzige Weg.
- `drop`: API-Schlüssel mit 1–72 h Laufzeit. Sie verfallen ohnehin; die Zählung in §2 belegt, dass
  keiner mehr läuft.

---

## 4. Die `.env` — jede Zeile mit ihrer Folge, wenn sie fehlt

### 4.1 Der gefährlichste Einzelschritt des ganzen Cutovers

**Sobald `SUITE_HOST_FILES` gesetzt ist, werden die drei Zahlen zur Startbedingung — für die GANZE
Suite.** Die Prüfliste des Moduls läuft aus `src/instrumentation.ts` **vor** den Migrationen aller
Module; fehlt eine Zahl, sammelt sie die Fehler und bricht den Start ab. Dann steht nicht nur
`files`, sondern auch `portal`, `qr` und `feedback`.

Genau deshalb sind die Prüfungen 1–4 und 6 **bedingt** gebaut (sie greifen erst, wenn das Modul
Prod-Hosts hat) — damit ein Image mit `files` schon auf dem Server liegen darf, bevor die `.env`
ergänzt ist. Die Kehrseite ist diese eine Regel:

> **`SUITE_HOST_FILES` und die drei Zahlen gehören in DIESELBE Änderung.** Nie die Hostzeile zuerst
> setzen und die Zahlen nachreichen. Zwischen beiden Schritten startet die Suite nicht mehr.

Prüfung 5 (`validateFilesHosts`) läuft dagegen **immer**: sie liest nur Konfiguration und meldet
einen Tippfehler in der Hostliste, bevor er wirkt.

### 4.2 Die Zeilen

| Variable | Wert | Folge, wenn sie fehlt oder falsch ist |
|---|---|---|
| `SUITE_HOST_FILES` | `share.iuk-ue.de,drop.iuk-ue.de` | **Reihenfolge trägt die Rolle.** Vertauscht: `/s/<id>` ist auf der Freigaben-Domain 404 und auf der Abgabe-Domain erreichbar, und jeder erzeugte Link trägt den falschen Host. Boot-Prüfung 5 fängt nur Formfehler und „zwei gleiche", nicht die Vertauschung. |
| `SUITE_TRAEFIK_RULE` | `Host(\`iuk-ue.de\`) \|\| … \|\| Host(\`share.iuk-ue.de\`) \|\| Host(\`drop.iuk-ue.de\`)` | Die Domain erreicht den Container nie. **Muss dieselben Hosts führen wie die Variable darüber** — zwei Wahrheiten, die niemand automatisch abgleicht. Die bestehenden Hosts (Portal, QR, Feedback) **mit übernehmen**, nicht ersetzen. |
| `SUITE_ACCESS_GROUP_FILES` | Name der bestehenden Gruppe | Leer gesetzt: **Boot-Abbruch**. Nicht gesetzt: nur `drk-files-admin` gilt (§3.2). |
| `SUITE_ADMIN_GROUP_FILES` | derselbe Name (empfohlen) | Ohne die Zeile bleibt der Registry-Rückfall zusätzlich gültig. |
| `FILES_MAX_DATEI_BYTES` | Betreiberwert, **Bytes** | Boot-Abbruch, sobald ein Host gesetzt ist. |
| `FILES_AV_MAX_BYTES` | ≥ `FILES_MAX_DATEI_BYTES` | dito. Gleichheit ist erlaubt. |
| `FILES_MAX_ABLAUF_TAGE` | Betreiberwert, **Tage** | dito. |
| `FILES_AV_HOST` / `FILES_AV_PORT` | `clamav` / `3310` — der **Servicename** aus `compose.yaml`, im internen Netz `av` auflösbar (Spec 1 §6.5). Die `127.0.0.1` aus `.env.example` ist der **Dev**-Wert für `pnpm dev:av` und gehört nicht auf den Server | Ohne den Sidecar-Namen läuft jeder Scan in ECONNREFUSED und nach `FILES_AV_VERSUCHE` in `av_status = 'error'`. Das ist fail-closed und **richtig**, sieht aber wie ein kaputtes Modul aus. |
| `SUITE_CLAMAV_IMAGE` | passend zur **Architektur des Zielhosts** | `clamav/clamav:1.4` hat nur ein `linux/amd64`-Manifest. Auf arm64 bricht `docker compose up` mit „no matching manifest" ab — und weil `suite` per `depends_on: service_healthy` an clamav hängt, kommt **die ganze Suite** nicht hoch. |
| `SUITE_CLAMAV_START_PERIOD` | **am Zielhost gemessen** | Zu knapp: clamav wird nie healthy, die Suite startet nicht. Zu knappes RAM sieht genauso aus. |
| `FILES_LOESCH_KARENZ_STUNDEN`, `FILES_AUFRAEUMEN_TAKT_MINUTEN` | Betreiberwerte | Vorbelegt; die Einheit steht im Namen. |
| `FILES_AUFRAEUMEN_TROCKENLAUF` | **`true` für den ersten Lauf** | Siehe §8.1 — der erste Aufräumlauf ist das einzige Löschereignis dieses Cutovers. |
| `BLOB_DIR` (Backup, Host-Cron) | `/var/lib/docker/volumes/files_data/_data` | Ohne sie sichert `scripts/backup.sh` einen **leeren Mountpunkt** und meldet Erfolg. Die Blobs liegen im benannten Volume `files_data`, nicht unter `$DATA_DIR/files`. |

**Betriebswerte werden nicht erfunden.** Wo oben „Betreiberwert" steht, gehört eine gemessene oder
entschiedene Zahl hin — kein Platzhalter aus einer anderen Maschine. Der Boot bricht mit Name und
Einheit ab, statt einen Default zu benutzen; das ist Absicht.

---

## 5. Die zweite Datei auf dem Server

Bis zu diesem Deploy lag genau **eine** Datei neben der `.env` auf dem Server: `compose.yaml`. Ab
jetzt sind es **zwei** — `clamd.files.conf` kommt dazu, und das bestehende Update-Runbook weiß nichts
von ihr.

**Fehlt sie, ist das kein Konfigurationsfehler mit klarer Meldung.** Docker legt an der Stelle des
Mounts ein **leeres Verzeichnis** an, clamd startet ohne seine Konfiguration, der Healthcheck
schlägt fehl — und weil `suite` per `depends_on: service_healthy` wartet, **startet die gesamte Suite
nicht**, mit allen vier Modulen. Erster Blick bei einem hängenden `up -d` ist deshalb
`docker compose ps clamav`, nicht das Suite-Log.

Zwei weitere Zeilen, die zusammengehören und an verschiedenen Orten stehen:

- **`MaxFileSize` / `StreamMaxLength` / `MaxScanSize` in `clamd.files.conf` müssen zu
  `FILES_AV_MAX_BYTES` passen.** clamd liest keine Umgebungsvariablen. Wer die eine ändert und die
  andere nicht, bekommt keine Meldung „Datei zu groß", sondern einen **AV-Fehler** — und der sperrt
  den Download, weil es keinen fail-open-Schalter gibt.
- Der `LocalSocket` aus derselben Datei ist es, den `clamdcheck.sh` anspricht. Wer die Zeile
  entfernt, nimmt den Healthcheck mit und damit den Start der Suite.

---

## 6. Das Wartungsfenster

Beide Hosts in einem Fenster (Entscheidung vom 01.08.). Ohne Import ist das Fenster kurz — die
Wartezeit steckt in `clamav`, nicht in den Daten.

### 6.1 Vorher, außerhalb des Fensters

1. **CI grün**, Image `ghcr.io/rubenvitt/iuk-suite:latest` gepusht; `docker manifest inspect` gegen
   die Architektur des Zielhosts (§4.2).
2. **Bestandsprobe nach §2.** Vier Zählungen, alle null. Sonst: **stopp**.
3. **Gruppe** in Pocket ID auswählen und befüllen (§3.2). Den exakten Namen notieren, wie er im
   `groups`-Claim erscheint.
4. **`clamd.files.conf`** auf den Server, neben `compose.yaml` (§5).
5. **`.env` vorbereiten** — alle Zeilen aus §4.2 **in einer Änderung**, aber noch nicht aktiv:
   `SUITE_HOST_FILES` und `SUITE_TRAEFIK_RULE` bleiben bis zum Fenster ungesetzt.
6. **Restplatz und RAM** prüfen: clamd belegt mit geladenen Signaturen ~1 GB RSS **zusätzlich** zum
   Node-Prozess. `files_data` und `suite_data` liegen ohne `driver_opts` auf **demselben**
   Host-Dateisystem — ein volllaufendes `files_data` erzeugt ENOSPC genau dort, wo die vier
   Modul-Datenbanken liegen.
7. **`BLOB_DIR`** im Host-Cron des Backups setzen (§4.2).
8. **DNS** für beide Hosts vorbereiten, falls sie heute nicht schon auf denselben Proxy zeigen.

### 6.2 Im Fenster

1. **Alt-Router zuerst weg.** Beide Alt-Stacks vom Traefik-Router nehmen, dann erst die Suite
   umstellen. **Nie zwei Router gleichzeitig auf dieselbe Domain** — die Regel steht so schon in
   `CLAUDE.md` und hat einen Grund: welcher gewinnt, ist nicht deterministisch.
2. **`.env` scharf schalten**: `SUITE_HOST_FILES` **und** die drei Zahlen **und**
   `SUITE_TRAEFIK_RULE` — eine Änderung (§4.1).
3. `docker compose pull && docker compose up -d`.
4. **Auf `clamav` warten**, nicht auf die Suite: `docker compose ps clamav` bis `healthy`. Erst
   danach wird `suite` überhaupt gestartet.
5. **Abnahme nach §7 abarbeiten.** Vollständig, bevor irgendetwas abgebaut wird.
6. **Alt-Stacks abbauen** — als eigener Schritt, nach bestandener Abnahme (§8.3).

---

## 7. Abnahme — was tatsächlich abgerufen sein muss

Kein Punkt hier ist durch einen Statuscode allein erfüllt. Die Reihenfolge ist so gewählt, dass jeder
Schritt den vorigen benutzt.

**Zugang und Rollen**

1. Anmeldung als Gruppenmitglied auf `share.iuk-ue.de` → Übersicht erscheint.
2. Anmeldung als **Nicht-Mitglied** → **404** (§3.4). Der wichtigste Einzelpunkt der Abnahme.
3. `https://drop.iuk-ue.de/shares/neu` → **404**. Die Rollensperre gilt in beide Richtungen.
4. `https://share.iuk-ue.de/u/<beliebig>` → **404**.

**Der Byte-Weg — hier liegen drei stille Kappungsebenen**

5. Eine Datei **über 10 MiB** über `/shares/neu` hochladen — nicht „über 4 MiB". Die Zahl ist
   gewählt, nicht gegriffen: 4 MiB beweisen nur, dass überhaupt gestückelt wird, und liefen an der
   **stillen** Kappe des Next-Proxys bei 10 MiB vorbei, ohne sie zu berühren. Erst oberhalb von
   10 MiB unterscheidet der Test die drei Ebenen (Server Actions 1 MB → 413, Next-Proxy 10 MiB →
   **still**, Cloudflare 100 MB → Edge-Fehler ohne Container-Log).
   **Vorbedingung:** `FILES_MAX_DATEI_BYTES` muss über der Testgröße liegen. Ist der Betreiberwert
   kleiner als 10 MiB, ist dieser Punkt so nicht prüfbar — dann für die Abnahme vorübergehend
   anheben und danach zurücksetzen, statt ihn stillschweigend mit einer kleineren Datei abzuhaken.
6. **Auf `clean` warten**, nicht auf eine Zeitspanne: der Download antwortet vorher **403**. Das ist
   fail-closed und richtig.
7. Die Datei **byteweise identisch** zurücklesen (`sha256sum` beider Seiten).
8. `/s/<id>` **anonym** in einem fremden Browser öffnen; mit Passwort denselben Weg noch einmal.
9. ZIP-Download einer Freigabe mit mehreren Dateien.

**Der Abgabe-Weg**

10. Abgabelink anlegen, den Token **einmalig** notieren (er wird nie wieder angezeigt), QR-PNG laden.
11. `/u/<token>` auf einem **fremden Handy** über den QR öffnen, eine Datei abgeben.
12. Die Datei im `/posteingang` sehen, herunterladen, löschen.

**Betrieb**

13. Ablage-Kachel: freier Platz plausibel, Aufräumlauf **als Trockenlauf** auslösen (§8.1).
14. `docker compose exec clamav clamconf -n | grep -i maxfilesize` — die **wirksame** Kappe, nicht
    die Datei. Kein Boot kann das prüfen.
15. Eine Datei in Höhe von `FILES_MAX_DATEI_BYTES` scannen lassen: Dauer gegen `FILES_AV_TIMEOUT_MS`,
    RSS gegen den freien Speicher.
16. **Backup einmal von Hand laufen lassen und das Tarball öffnen:** `files.db` **und** ein `files/`
    mit den Blobs, **keine** `*.part`. Ein leeres `files/` heißt `BLOB_DIR` falsch (§4.2).
17. Ein ~150-MB-Upload gegen `drop.iuk-ue.de`: erwartet ist ein **413 vom Edge**, ohne Eintrag im
    Container-Log. Damit ist die Cloudflare-Kappe belegt statt angenommen.
18. `docker compose exec clamav sh -c 'ls -l /data/files/...'` auf eine frisch geschriebene Datei —
    **kann clamd (uid 100) lesen, was der Node-Prozess (uid 1001) geschrieben hat?** Wenn nein,
    antwortet jeder Scan mit „Can't access file" und **jede** Datei bleibt gesperrt.

Punkte 14–18 sind die Runbook-Messungen aus Spec 1 §11.7, die kein Gate belegen kann. Sie gehören in
dieses Fenster, weil danach niemand mehr hinsieht.

---

## 8. Nach dem Cutover

### 8.1 Der erste Aufräumlauf ist das einzige Löschereignis

`FILES_AUFRAEUMEN_TROCKENLAUF=true` für den ersten Lauf, Protokollzeile lesen, **dann** scharf
schalten. Ohne Bestand sollte er nichts finden — und genau deshalb ist er die billigste Gelegenheit
zu prüfen, ob er das Richtige nicht findet.

### 8.2 Die Signaturen altern

Das `av`-Netz ist `internal: true`, in **beide** Richtungen. `freshclam` erreicht damit keinen
Spiegel; clamd startet trotzdem, weil die Signaturen im Image liegen (~110 MiB) — **aber sie sind so
frisch wie das Image.** Der Sidecar ist nur so gut wie der Takt, in dem `SUITE_CLAMAV_IMAGE` gezogen
wird. Wer das ändern will, braucht ein zweites Netz am clamav-Service ohne `internal` — eine
Betreiberentscheidung mit Abwägung, kein Nachtrag.

Daraus folgt eine **Betriebszeile, die jemand besitzen muss**: in welchem Takt wird das clamav-Image
gezogen? Ohne Antwort ist der Virenschutz nach einem Jahr ein Jahr alt.

### 8.3 Der Abbau — und warum er der letzte Schritt ist

Der Betreiber hat entschieden: **kein Standby, sofortiger Abbau.** Das ist bei leerem Bestand
vertretbar und hat eine Konsequenz, die vor dem Abbau bekannt sein muss:

> **Der billige Rückweg endet mit dem Abbau.** Solange die Alt-Container nur gestoppt sind, ist
> Rollback ein Router-Wechsel. Danach ist Rollback ein Neuaufbau aus dem Repo — mit `.env`,
> Volumes und MinIO. Deshalb: erst §7 vollständig, dann abbauen.

Abbau heißt: Container entfernen, Volumes entfernen, MinIO-Bucket entfernen, DNS-Einträge und
Router-Regeln der Alt-Stacks entfernen, **den alten Cleanup-Cron abschalten**, falls einer existiert
(Spec 1 §13.4, Frage 25 — läuft er weiter, löscht er ins Leere oder, schlimmer, in ein
wiederverwendetes Verzeichnis).

### 8.4 Der billige Teilrückzug bleibt

Auch nach dem Abbau gibt es einen Rückweg für den Fall, dass das **Modul** Ärger macht, nicht die
Alt-App: `SUITE_HOST_FILES=` **leeren** (nicht die Zeile entfernen) und die beiden Hosts aus
`SUITE_TRAEFIK_RULE` nehmen. Das Modul hat dann wieder keine Prod-Domain, verschwindet aus dem
App-Switcher, die drei anderen Module laufen weiter — und die Boot-Zahlenpflicht entfällt mit, weil
sie an den Prod-Hosts hängt (§4.1). Die Daten im Volume bleiben unangetastet.

---

## 9. Runbook-Eingaben — was nur der Betreiber weiß

| # | Wert | Ohne ihn |
|---|---|---|
| 1 | **Exakter Name der bestehenden Pocket-ID-Gruppe** | Der Zugang greift nicht oder greift zu weit (§3.2) |
| 2 | `FILES_MAX_DATEI_BYTES`, `FILES_AV_MAX_BYTES`, `FILES_MAX_ABLAUF_TAGE` | Boot-Abbruch der ganzen Suite (§4.1) |
| 3 | **Architektur des Zielhosts** | Falsches clamav-Manifest → Suite startet nicht |
| 4 | **Freies RAM** | clamd ~1 GB zusätzlich; zu wenig sieht aus wie eine zu kurze `start_period` |
| 5 | **Gemessene `start_period`** am Zielhost | Suite wartet zu kurz oder unnötig lang |
| 6 | **Pfad von `metaDir`** (drop) | Die Bestandsprobe §2 sucht am falschen Ort und meldet Erfolg |
| 7 | **Restplatz** und gewünschte Quota am Blob-Ort | ENOSPC trifft auch die vier Modul-Datenbanken |
| 8 | **Kappt Cloudflare bei 100 MB?** | Abnahmepunkt 17 ist eine Annahme statt einer Messung |
| 9 | **Läuft ein Cleanup-Cron der Alt-Apps?** | Er löscht nach dem Abbau ins Leere (§8.3) |
| 10 | **Takt, in dem `SUITE_CLAMAV_IMAGE` gezogen wird** | Die Signaturen altern still (§8.2) |

---

## 10. Wann diese Spec erfüllt ist

1. Die vier Zählungen aus §2 sind dokumentiert und waren null.
2. Beide Hosts antworten aus der Suite; beide Rollensperren sind in **beide** Richtungen belegt.
3. Probe 2 aus §3.4 hat **404** ergeben.
4. Alle 18 Punkte aus §7 sind abgehakt, mit Ausgabe, nicht mit Erwartung.
5. Ein Backup-Tarball wurde geöffnet und enthielt `files.db` **und** Blobs.
6. Beide Alt-Stacks sind abgebaut, ihr Cron ist aus, ihre Router-Regeln sind weg.
7. Die zehn Runbook-Eingaben aus §9 stehen als Werte im Runbook, nicht als Fragen.

---

## 11. Verworfene Alternativen

| Verworfen | Grund |
|---|---|
| **Bestand annehmen statt zählen** | Ein übersehener Bestand wird mit dem Abbau vernichtet, und der Abbau ist die einzige unumkehrbare Handlung dieses Cutovers |
| **Nacheinander umschwenken** (erst `drop`, dann `share`) | Ohne Import ist das Fenster kurz; zwei Fenster verdoppeln den Aufwand und lassen die Suite zwischenzeitlich mit halber Hostliste laufen, wo `validateFilesHosts` „genau 0 oder 2" erwartet |
| **Zwei Wochen Standby** (Projektmuster) | Es gibt nichts zu retten. Der Preis ist benannt: der billige Rückweg endet früher (§8.3) |
| **Gruppe aus den `easy-filesharing`-Konten ableiten** | Die Alt-App kennt Better-Auth-Konten, kein Gruppenmodell — es gäbe nichts abzuleiten, nur zu raten |
| **`SUITE_ACCESS_GROUP_FILES` leeren, damit „jeder Angemeldete" darf** | Bricht den Boot ab (Absicht). Und wäre es anders, öffnete es die gesamte Verwaltung inklusive Audit-Log jedem Suite-Konto |
| **`TZ` im Container setzen, statt der Zone im Kode zu vertrauen** | Seit dem 01.08. liegt die Anzeigezone in `_lib/zeit.ts` fest; ein `TZ` wäre für die Anzeige wirkungslos und suggerierte eine Wirkung, die es nicht hat |
| **clamav ohne `depends_on: service_healthy`** | Uploads würden angenommen und blieben auf `scanning` — ein Wartezustand direkt nach jedem Start, statt eines lauten Fehlschlags beim Hochfahren |
