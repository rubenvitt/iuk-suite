# Runbook — Files-Cutover (`easy-filesharing` + `drop` → iuk-suite)

Ziel: `share.iuk-ue.de` und `drop.iuk-ue.de` zeigen auf das Suite-Modul `files`, **beide in einem
Wartungsfenster**; danach werden beide Alt-Stacks **abgebaut**.

Grundlage: `docs/superpowers/specs/2026-08-01-files-cutover-design.md` (Spec 2). Die Paragraphen
dieses Runbooks verweisen dorthin — wer eine Begründung sucht, findet sie an der genannten Stelle.

---

## ⚠️ Vier Dinge, die diesen Cutover von den vorigen unterscheiden

**1. Es gibt kein Standby und keinen Import — der Abbau ist unumkehrbar.** Die Alt-Stacks werden nach
der Abnahme **abgebaut**, nicht zwei Wochen stehen gelassen (Betreiberentscheidung 01.08.,
Spec §8.3). Solange die Alt-Container nur gestoppt sind, ist Rollback ein Router-Wechsel; danach ist
Rollback ein Neuaufbau aus dem Repo mit `.env`, Volumes und MinIO. Deshalb: **erst die Abnahme
vollständig, dann abbauen** — nie in derselben Handbewegung.

**2. „Kein Bestand" ist die Voraussetzung dieses ganzen Runbooks und wird gezählt, nicht geglaubt.**
Vier Zählungen vor dem Fenster (§A). Ergibt **eine einzige** nicht null, gilt dieses Runbook nicht
mehr, und die große Fassung aus Spec 1 §1.2 (Import, Blob-Umzug, Paritätscheck, AV-Nachscan,
Generalprobe) tritt in Kraft. Ein Cutover, der einen übersehenen Bestand mit abbaut, vernichtet ihn.

**3. `SUITE_HOST_FILES` und die drei `FILES_*`-Zahlen gehören in DIESELBE Änderung.** Sobald ein
Prod-Host für `files` gesetzt ist, werden `FILES_MAX_DATEI_BYTES`, `FILES_AV_MAX_BYTES` und
`FILES_MAX_ABLAUF_TAGE` zur **Startbedingung der ganzen Suite** — die Prüfliste läuft aus
`src/instrumentation.ts` vor den Migrationen **aller** Module. Wer die Hostzeile zuerst setzt und die
Zahlen nachreicht, hat zwischen den beiden Schritten auch `portal`, `qr` und `feedback` unten
(Spec §4.1).

**4. Der wichtigste Einzelpunkt der Abnahme ist ein 404, kein 200.** Ein Suite-Konto **ohne** die
Modulgruppe muss auf `share.iuk-ue.de` **404** bekommen (§D Punkt 2). Ein 200 an dieser Stelle heißt:
die gesamte Verwaltung inklusive Audit-Log steht jedem angemeldeten Suite-Nutzer offen. `files` ist
`requiresAuth: false` — die Middleware gatet hier **nichts**, der einzige Riegel ist `_lib/access.ts`
(Spec §3.1).

---

## §0 — Eingaben: was nur der Betreiber weiß

**Vor dem Fenster ausfüllen.** Jede Zeile ist ein Wert, keine Frage — solange hier ein Feld leer ist,
beginnt das Fenster nicht (Spec §9, §10 Punkt 7). Die späteren Schritte verweisen auf diese Nummern.

| # | Wert | Eingetragen | Ohne ihn |
|---|---|---|---|
| 1 | Exakter Name der bestehenden Pocket-ID-Gruppe, **wie er im `groups`-Claim erscheint** | | Der Zugang greift nicht oder greift zu weit (§3.2) |
| 2 | `FILES_MAX_DATEI_BYTES` = <br> `FILES_AV_MAX_BYTES` = <br> `FILES_MAX_ABLAUF_TAGE` = | | Boot-Abbruch der **ganzen** Suite (§4.1) |
| 3 | Architektur des Zielhosts (`uname -m`) | | Falsches clamav-Manifest → Suite startet nicht |
| 4 | Freies RAM am Zielhost | | clamd braucht ~1 GB zusätzlich; zu wenig sieht aus wie eine zu kurze `start_period` |
| 5 | Am Zielhost gemessene `SUITE_CLAMAV_START_PERIOD` | | Suite wartet zu kurz (startet nie) oder unnötig lang |
| 6 | Pfad von `metaDir` **und** des Blob-Verzeichnisses bei `drop` | | Die Bestandsprobe §A sucht am falschen Ort und **meldet Erfolg** |
| 7 | Restplatz am Blob-Ort, gewünschte Quota | | ENOSPC trifft auch die vier Modul-Datenbanken |
| 8 | Kappt Cloudflare bei 100 MB? | | Abnahmepunkt 17 ist eine Annahme statt einer Messung |
| 9 | Läuft ein Cleanup-Cron der Alt-Apps? Wo? | | Er löscht nach dem Abbau ins Leere oder in ein wiederverwendetes Verzeichnis (§8.3) |
| 10 | Takt, in dem `SUITE_CLAMAV_IMAGE` gezogen wird — **und wer ihn besitzt** | | Die Signaturen altern still; nach einem Jahr ist der Virenschutz ein Jahr alt (§8.2) |

Zu #2: **Betriebswerte werden nicht erfunden.** Der Boot bricht mit Name und Einheit ab, statt einen
Default zu benutzen — das ist Absicht. Ein Platzhalter aus einer anderen Maschine ist kein Wert.

---

## §A — Bestandsprobe: vier Zählungen, alle null (vor dem Fenster)

Auf dem **Server**, mit Ausgabe zum Mitschreiben. Jede Zählung, die nicht null ergibt, **stoppt
diesen Cutover** (Spec §2).

Zwei Fallen vorweg, beide liefern die erwartete Antwort vom falschen Ort:

- Die `db.sqlite` im **Arbeitsbaum** von `easy-filesharing` ist leer und **nicht** die
  Produktionsdatei. Die echte liegt im Docker-Volume `db-data` (`docker-compose.yml:15,18`).
- Ohne **Eingabe 6** zählt die dritte Zeile ins Leere und sieht dabei aus wie bestanden.

| # | Was | Befehl | Erwartet | Ergebnis |
|---|---|---|---|---|
| 1 | Freigaben, Dateien, Downloads in `easy-filesharing` | `sqlite3 /data/db.sqlite "SELECT (SELECT count(*) FROM shares), (SELECT count(*) FROM share_files), (SELECT count(*) FROM download_logs);"` (im Volume `db-data`) | `0\|0\|0` | |
| 2 | Objekte im MinIO-Bucket | `mc ls --recursive <alias>/<bucket> \| wc -l` und `mc ls --incomplete <alias>/<bucket>` | `0`, keine unvollständigen | |
| 3 | Dateien im Postfach von `drop` | `find <metaDir> -type f \| wc -l`, dasselbe für das Blob-Verzeichnis (**Eingabe 6**) | `0` | |
| 4 | Laufende Zugangsschlüssel in `drop` | `sqlite3 <pfad>/better-auth.sqlite "SELECT id, name, start, createdAt, expiresAt FROM apikey;"` | keine Zeile mit `expiresAt` in der Zukunft | |

Zeile 4 steht bewusst **ohne `WHERE`**: die Einheit von `expiresAt` gehört Better-Auth, nicht diesem
Projekt. Ein `WHERE expiresAt > strftime('%s','now')` wäre eine Behauptung über eine fremde Spalte und
lieferte bei falscher Einheit **stillschweigend null Treffer** — also genau die Antwort, die man sehen
will. Zeilen ausgeben und selbst lesen.

`drop` führt **kein** Datenmodell für die Nutzlast — die Wahrheit ist ausschließlich der Dateibaum.
Eine Datenbankabfrage gegen `drop` beweist an dieser Stelle nichts.

---

## §B — Vor dem Fenster

1. **CI grün**, Image gepusht, und das Manifest passt zu **Eingabe 3**:
   ```bash
   docker pull ghcr.io/rubenvitt/iuk-suite:latest
   docker buildx imagetools inspect ghcr.io/rubenvitt/iuk-suite:latest
   docker image inspect ghcr.io/rubenvitt/iuk-suite:latest \
     -f '{{ index .Config.Labels "org.opencontainers.image.revision" }}'
   ```
   Die Revision muss der aktuelle `main`-Commit sein. Stimmt sie nicht: abbrechen, nicht mit einem
   alten Image weitermachen.

2. **Bestandsprobe nach §A.** Vier Zählungen, alle null. Sonst: **stopp**.

3. **Gruppe in Pocket ID** auswählen und befüllen. Den exakten Namen als **Eingabe 1** notieren, wie
   er im `groups`-Claim erscheint — der Vergleich in `_lib/access.ts` ist exakt, inklusive
   Groß-/Kleinschreibung.

   Mitglieder pflegt der Betreiber **von Hand**; es gibt keine Altquelle, aus der abzuleiten wäre.
   Die Better-Auth-Konten von `easy-filesharing` verschwinden mit dem Volume, **niemand wird
   migriert** — ab dem Cutover ist Pocket ID der einzige Weg (Spec §3.5).

4. **`clamd.files.conf` auf den Server**, neben `compose.yaml`. Bis zu diesem Deploy lag dort genau
   **eine** Datei, ab jetzt sind es **zwei** (Spec §5, siehe auch §G).

5. **`.env` vorbereiten — alle Zeilen aus der Tabelle unten in EINER Änderung**, aber noch nicht
   aktiv: `SUITE_HOST_FILES` und `SUITE_TRAEFIK_RULE` bleiben bis zum Fenster ungesetzt.

   | Variable | Wert | Folge, wenn sie fehlt oder falsch ist |
   |---|---|---|
   | `SUITE_HOST_FILES` | `share.iuk-ue.de,drop.iuk-ue.de` | **Die Reihenfolge trägt die Rolle**: Index 0 = `verwaltung` = `share`, Index 1 = `inbox` = `drop`. Vertauscht ist `/s/<id>` auf der Freigaben-Domain 404 und auf der Abgabe-Domain erreichbar, und jeder erzeugte Link trägt den falschen Host. Boot-Prüfung 5 fängt Formfehler und „zwei gleiche", **nicht** die Vertauschung. |
   | `SUITE_TRAEFIK_RULE` | bestehende Hosts **plus** ``Host(`share.iuk-ue.de`) \|\| Host(`drop.iuk-ue.de`)`` | Die Domain erreicht den Container nie. Muss dieselben Hosts führen wie die Zeile darüber — zwei Wahrheiten, die niemand automatisch abgleicht. Bestehende Hosts **übernehmen**, nicht ersetzen. |
   | `SUITE_ACCESS_GROUP_FILES` | **Eingabe 1** | Leer gesetzt: **Boot-Abbruch** (Absicht). Nicht gesetzt: nur `drk-files-admin` gilt. |
   | `SUITE_ADMIN_GROUP_FILES` | **derselbe Name** (empfohlen) | Ohne die Zeile bleibt der Registry-Rückfall `drk-files-admin` **zusätzlich** gültig — siehe Kasten unten. |
   | `FILES_MAX_DATEI_BYTES` | **Eingabe 2**, Bytes | Boot-Abbruch, sobald ein Host gesetzt ist. |
   | `FILES_AV_MAX_BYTES` | **Eingabe 2**, ≥ `FILES_MAX_DATEI_BYTES` (Gleichheit erlaubt) | dito — **und siehe die Kopplung unten.** |
   | `FILES_MAX_ABLAUF_TAGE` | **Eingabe 2**, Tage | dito. |
   | `FILES_AV_HOST` / `FILES_AV_PORT` | `clamav` / `3310` | Der **Servicename** aus `compose.yaml`. Die `127.0.0.1` aus `.env.example` ist der **Dev**-Wert für `pnpm dev:av` und gehört nicht auf den Server. Ohne den Sidecar-Namen läuft jeder Scan in ECONNREFUSED und nach `FILES_AV_VERSUCHE` in `av_status = 'error'` — fail-closed und richtig, sieht aber wie ein kaputtes Modul aus. |
   | `SUITE_CLAMAV_IMAGE` | passend zu **Eingabe 3** | `clamav/clamav:1.4` hat nur ein `linux/amd64`-Manifest. Auf arm64 bricht `docker compose up` mit „no matching manifest" ab — und weil `suite` per `depends_on: service_healthy` an clamav hängt, kommt **die ganze Suite** nicht hoch. |
   | `SUITE_CLAMAV_START_PERIOD` | **Eingabe 5** | Zu knapp: clamav wird nie healthy, die Suite startet nicht. Zu knappes RAM (**Eingabe 4**) sieht genauso aus. |
   | `FILES_LOESCH_KARENZ_STUNDEN`, `FILES_AUFRAEUMEN_TAKT_MINUTEN` | Betreiberwerte (vorbelegt) | Die Einheit steht im Namen. |
   | `FILES_AUFRAEUMEN_TROCKENLAUF` | **`true`** für den ersten Lauf | §E.1 — der erste Aufräumlauf ist das einzige Löschereignis dieses Cutovers. |
   | `BLOB_DIR` (im **Host-Cron des Backups**, nicht in der Suite-`.env`) | `/var/lib/docker/volumes/files_data/_data` | Ohne sie sichert `scripts/backup.sh` einen **leeren Mountpunkt**. Die Blobs liegen im benannten Volume `files_data`, nicht unter `$DATA_DIR/files`. |

   > **Die Falle in der Vereinigung** (Spec §3.2): `erlaubteGruppen()` ist
   > `SUITE_ADMIN_GROUP_FILES ∪ SUITE_ACCESS_GROUP_FILES` — **kein Vorrang, eine Vereinigung.**
   > `SUITE_ACCESS_GROUP_FILES=<gruppe>` **ersetzt** die Registry-Vorgabe `drk-files-admin` nicht,
   > sondern tritt neben sie. Existiert in Pocket ID je eine Gruppe dieses Namens — heute oder
   > irgendwann später —, hat jedes ihrer Mitglieder vollen Zugang, ohne dass es in der `.env` steht.
   > Deshalb **beide** Zeilen auf denselben Namen setzen; dann fällt die Vereinigung auf genau einen
   > Namen zusammen. Wer die Registry-Vorgabe bewusst stehen lässt, notiert das hier:
   > ______________________
   >
   > Es gibt **keine** Ownership-Prüfung zwischen Mitgliedern und **keine** Abkürzung für den
   > Suite-Admin: wer in einer der Gruppen ist, darf alles — auch fremde Freigaben und das Audit-Log.

   > **Kopplung, die an zwei Orten steht und nur hier zusammenkommt:** `MaxFileSize`,
   > `StreamMaxLength` und `MaxScanSize` in `clamd.files.conf` stehen fest auf **524288000**
   > (500 MiB, die heute in beiden Alt-Anwendungen erzwungene Grenze). clamd liest **keine**
   > Umgebungsvariablen. Weicht **Eingabe 2** (`FILES_AV_MAX_BYTES`) davon ab, laufen die beiden
   > Zahlen auseinander — und das äußert sich **nicht** als „Datei zu groß", sondern als **AV-Fehler**,
   > der den Download sperrt (es gibt keinen fail-open-Schalter). Wer die eine ändert, ändert die
   > andere mit.

6. **Restplatz und RAM prüfen** (**Eingaben 4 und 7**). clamd belegt mit geladenen Signaturen ~1 GB
   RSS **zusätzlich** zum Node-Prozess. `files_data` und `suite_data` liegen ohne `driver_opts` auf
   **demselben** Host-Dateisystem — ein volllaufendes `files_data` erzeugt ENOSPC genau dort, wo die
   vier Modul-Datenbanken liegen.

7. **`BLOB_DIR` im Host-Cron des Backups setzen** (Zeile oben).

8. **DNS** für beide Hosts vorbereiten, falls sie heute nicht schon auf denselben Proxy zeigen.

---

## §C — Im Fenster

1. **Alt-Router zuerst weg.** Beide Alt-Stacks vom Traefik-Router nehmen (Labels entfernen bzw.
   Service aus dem Stack), **dann erst** die Suite umstellen. **Nie zwei Router gleichzeitig auf
   derselben Domain** — welcher gewinnt, ist nicht deterministisch.

2. **`.env` scharf schalten: `SUITE_HOST_FILES` UND die drei Zahlen UND `SUITE_TRAEFIK_RULE` — eine
   einzige Änderung.** Siehe ⚠️ Punkt 3 oben.

3. ```bash
   docker compose pull && docker compose up -d
   ```

4. **Auf `clamav` warten, nicht auf die Suite:**
   ```bash
   docker compose ps clamav      # bis "healthy"
   ```
   Erst danach startet `suite` überhaupt. **Hängt `up -d`, ist das hier der erste Blick, nicht das
   Suite-Log** — die häufigste Ursache ist eine fehlende `clamd.files.conf` (§G) oder ein
   Architektur-Mismatch beim Image.

5. **Abnahme nach §D abarbeiten — vollständig, bevor irgendetwas abgebaut wird.**

6. **Alt-Stacks abbauen** — als eigener Schritt, nach bestandener Abnahme (§E.3).

---

## §D — Abnahme: 18 Punkte, jeder mit Ausgabe

**Kein Punkt ist durch einen Statuscode allein erfüllt, und keiner durch eine Erwartung.** Die
Reihenfolge ist so gewählt, dass jeder Schritt den vorigen benutzt. Ergebnis danebenschreiben, nicht
nur abhaken.

**Zugang und Rollen**

- [ ] **1.** Anmeldung als Gruppenmitglied auf `https://share.iuk-ue.de/` → Freigaben-Übersicht
  erscheint (leer, „Noch keine Freigabe angelegt"). → ____________________
- [ ] **2.** Anmeldung als **Nicht-Mitglied** (beliebiges Suite-Konto ohne die Gruppe), dieselbe
  Adresse → **404**. Nicht der Login, nicht eine leere Liste. **Der wichtigste Einzelpunkt dieser
  Abnahme** (⚠️ Punkt 4). → ____________________
- [ ] **3.** `https://drop.iuk-ue.de/shares/neu` → **404**. Die Rollensperre gilt in **beide**
  Richtungen. → ____________________
- [ ] **4.** `https://share.iuk-ue.de/u/<beliebig>` → **404**. → ____________________

> Wer schon angemeldet ist, sieht eine frisch vergebene Gruppe **bis zu eine Stunde** lang nicht:
> Gruppen stehen im JWT und sind nur so frisch wie der letzte Token-Refresh (Takt = Access-Token-
> Lebensdauer von Pocket ID, heute eine Stunde — **nicht** die Sitzungsdauer von 30 Tagen).
> Abkürzung für die Abnahme: einmal ab- und wieder anmelden. Dasselbe gilt für einen **Entzug**; eine
> serverseitige Auflösung aus der Datenbank ist hier nicht möglich, weil es keine Objekt-Zugehörigkeit
> gibt, an der man sie auflösen könnte (Spec §3.3).

**Der Byte-Weg — hier liegen drei stille Kappungsebenen**

- [ ] **5.** Eine Datei **über 10 MiB** über `/shares/neu` hochladen — nicht „über 4 MiB". Die Zahl
  ist gewählt, nicht gegriffen: 4 MiB beweisen nur, dass gestückelt wird, und liefen an der
  **stillen** Kappe des Next-Proxys bei 10 MiB vorbei, ohne sie zu berühren. Erst oberhalb von 10 MiB
  trennt der Test die drei Ebenen (Server Actions 1 MB → 413, Next-Proxy 10 MiB → **still**,
  Cloudflare 100 MB → Edge-Fehler ohne Container-Log).
  **Vorbedingung:** `FILES_MAX_DATEI_BYTES` (**Eingabe 2**) muss über der Testgröße liegen. Ist der
  Betreiberwert kleiner als 10 MiB, ist dieser Punkt so **nicht prüfbar** — dann für die Abnahme
  vorübergehend anheben und danach **zurücksetzen**, statt ihn stillschweigend mit einer kleineren
  Datei abzuhaken. Vorübergehend angehoben? ☐ ja, auf ________ / zurückgesetzt ☐ → ____________________
- [ ] **6.** **Auf `clean` warten**, nicht auf eine Zeitspanne: der Download antwortet vorher **403**.
  Das ist fail-closed und richtig. → ____________________
- [ ] **7.** Die Datei **byteweise identisch** zurücklesen (`sha256sum` auf beiden Seiten).
  → ____________________
- [ ] **8.** `/s/<id>` **anonym** in einem fremden Browser öffnen; danach denselben Weg mit Passwort.
  → ____________________
- [ ] **9.** ZIP-Download einer Freigabe mit mehreren Dateien. → ____________________

**Der Abgabe-Weg**

- [ ] **10.** Abgabelink anlegen, Token **einmalig** notieren (er wird nie wieder angezeigt), QR-PNG
  laden. → ____________________
- [ ] **11.** `/u/<token>` auf einem **fremden Handy** über den QR öffnen, eine Datei abgeben.
  → ____________________
- [ ] **12.** Die Datei im `/posteingang` sehen, herunterladen, löschen. → ____________________

**Betrieb — die Messungen, die kein Gate belegen kann**

- [ ] **13.** Ablage-Kachel: freier Platz plausibel (**Eingabe 7**); Aufräumlauf **als Trockenlauf**
  auslösen (§E.1). → ____________________
- [ ] **14.** Die **wirksame** Kappe lesen, nicht die Datei:
  ```bash
  docker compose exec clamav clamconf -n | grep -i maxfilesize
  ```
  → ____________________
- [ ] **15.** Eine Datei in Höhe von `FILES_MAX_DATEI_BYTES` scannen lassen: **Dauer** gegen
  `FILES_AV_TIMEOUT_MS`, **RSS** gegen den freien Speicher (**Eingabe 4**). Reißt die Dauer den
  Timeout, landet jede große Datei in `error` — fail-closed, also dauerhaft nicht herunterladbar,
  obwohl nichts kaputt ist. → Dauer ________ / RSS ________
- [ ] **16.** **Backup einmal von Hand laufen lassen und das Tarball öffnen.** Das Skript liest
  `DATA_DIR`, `BACKUP_DIR` und `BLOB_DIR` aus der Umgebung (Kopf von `scripts/backup.sh`); den
  geschriebenen Pfad nennt die letzte Zeile seiner Ausgabe (`backup: wrote …`). Erwartet im Tarball:
  `files.db` **und** ein `files/` mit den Blobs, **keine** `*.part`. Ein leeres `files/` heißt
  `BLOB_DIR` falsch.
  *Erst **nach** Punkt 5–12 ausführen:* liegen vollständige Zeilen in `files.db`, aber kein Blob im
  Arbeitsverzeichnis, bricht das Skript selbst ab (`complete rows in files.db but no blobs`) — vor
  dem ersten Upload könnte es diesen Fall nicht sehen. → ____________________
- [ ] **17.** Ein ~150-MB-Upload gegen `drop.iuk-ue.de`: erwartet ist ein **413 vom Edge**, **ohne**
  Eintrag im Container-Log. Damit ist **Eingabe 8** belegt statt angenommen. → ____________________
- [ ] **18.** Auf eine frisch geschriebene Datei — **den Pfad der in Punkt 5 hochgeladenen Datei
  einsetzen**, nicht das Verzeichnis auflisten (in einem leeren `files/` beweist ein `ls` nichts):
  ```bash
  docker compose exec clamav sh -c 'ls -l /data/files/<pfad-aus-punkt-5>'
  ```
  **Kann clamd (uid 100) lesen, was der Node-Prozess (uid 1001) geschrieben hat?** Wenn nein,
  antwortet jeder Scan mit „Can't access file" und **jede** Datei bleibt gesperrt. → ____________________

Punkte 14–18 sind die Runbook-Messungen aus Spec 1 §11.7. Sie gehören in dieses Fenster, **weil
danach niemand mehr hinsieht.**

---

## §E — Nach dem Cutover

### E.1 Der erste Aufräumlauf ist das einzige Löschereignis

`FILES_AUFRAEUMEN_TROCKENLAUF=true` für den ersten Lauf, **Protokollzeile lesen**, dann scharf
schalten. Ohne Bestand sollte er nichts finden — und genau deshalb ist er die billigste Gelegenheit
zu prüfen, ob er das Richtige nicht findet.

Protokollzeile des Trockenlaufs: ____________________ · scharf geschaltet am ____________

### E.2 Die Signaturen altern — jemand muss diese Zeile besitzen

Das Netz `av` ist `internal: true`, in **beide** Richtungen. `freshclam` erreicht damit keinen
Spiegel; clamd startet trotzdem, weil die Signaturen im Image liegen (~110 MiB) — **aber sie sind so
frisch wie das Image.** Der Sidecar ist nur so gut wie der Takt, in dem `SUITE_CLAMAV_IMAGE` gezogen
wird (**Eingabe 10**). Wer das ändern will, braucht ein zweites Netz am clamav-Service ohne
`internal` — eine Betreiberentscheidung mit Abwägung, kein Nachtrag.

### E.3 Der Abbau — der letzte Schritt, und der einzige unumkehrbare

> **Der billige Rückweg endet hier.** Solange die Alt-Container nur gestoppt sind, ist Rollback ein
> Router-Wechsel. Danach ist Rollback ein Neuaufbau aus dem Repo — mit `.env`, Volumes und MinIO.
> Deshalb: **erst §D vollständig**, dann abbauen.

Abbau heißt, und jede Zeile einzeln abhaken:

- [ ] Container beider Alt-Stacks entfernen
- [ ] Volumes entfernen (`db-data` von `easy-filesharing`, Datenverzeichnisse von `drop`)
- [ ] MinIO-Bucket entfernen
- [ ] DNS-Einträge und Router-Regeln der Alt-Stacks entfernen
- [ ] **Den alten Cleanup-Cron abschalten** (**Eingabe 9**) — läuft er weiter, löscht er ins Leere
      oder, schlimmer, in ein wiederverwendetes Verzeichnis
- [ ] Repos auf GitHub archivieren

---

## §F — Rollback

**Vor dem Abbau (§E.3):** Router zurück auf die Alt-Stacks, Alt-Container starten. Sekunden.
In der Suite abgelegte Dateien stehen dann **nur** dort — vor dem Rückweg prüfen, ob zwischen Cutover
und Rollback etwas hochgeladen wurde, und `files.db` samt Blobs sichern.

**Nach dem Abbau — der billige Teilrückzug bleibt** (Spec §8.4). Für den Fall, dass das **Modul**
Ärger macht, nicht die Alt-App:

```dotenv
SUITE_HOST_FILES=            # leeren, NICHT die Zeile entfernen
SUITE_TRAEFIK_RULE=...       # beide files-Hosts herausnehmen
```
```bash
docker compose up -d
```

Das Modul hat dann wieder keine Prod-Domain, verschwindet aus dem App-Switcher, **die drei anderen
Module laufen weiter** — und die Boot-Zahlenpflicht entfällt mit, weil sie an den Prod-Hosts hängt.
Die Daten im Volume bleiben unangetastet.

---

## §G — Die zweite Datei auf dem Server

Bis zu diesem Deploy lag genau **eine** Datei neben der `.env`: `compose.yaml`. Ab jetzt sind es
**zwei**.

**Fehlt `clamd.files.conf`, ist das kein Konfigurationsfehler mit klarer Meldung.** Docker legt an der
Stelle des Mounts ein **leeres Verzeichnis** an, clamd startet ohne seine Konfiguration, der
Healthcheck schlägt fehl — und weil `suite` per `depends_on: service_healthy` wartet, **startet die
gesamte Suite nicht**, mit allen vier Modulen. Erster Blick bei einem hängenden `up -d` ist deshalb
`docker compose ps clamav`, nicht das Suite-Log.

Zwei Zeilen in dieser Datei, die man nicht anfassen darf, ohne die Folge zu kennen:

- **`MaxFileSize` / `StreamMaxLength` / `MaxScanSize` müssen zu `FILES_AV_MAX_BYTES` passen** — siehe
  den Kopplungs-Kasten in §B.5.
- **`LocalSocket`** ist der Pfad, den `clamdcheck.sh` anspricht. Wer die Zeile entfernt, nimmt den
  Healthcheck mit und damit den Start der Suite.

Das Update-Runbook `suite-update-webfinger.md` (Abschnitt A2) führt diese Datei ab sofort mit.

---

## §H — Wann dieser Cutover erfüllt ist

Aus Spec §10 — alle sieben, nicht sechs:

- [ ] 1. Die vier Zählungen aus §A sind **dokumentiert** und waren null.
- [ ] 2. Beide Hosts antworten aus der Suite; beide Rollensperren sind in **beide** Richtungen belegt.
- [ ] 3. Probe aus §D Punkt 2 hat **404** ergeben.
- [ ] 4. Alle 18 Punkte aus §D sind abgehakt, **mit Ausgabe, nicht mit Erwartung**.
- [ ] 5. Ein Backup-Tarball wurde **geöffnet** und enthielt `files.db` **und** Blobs.
- [ ] 6. Beide Alt-Stacks sind abgebaut, ihr Cron ist aus, ihre Router-Regeln sind weg.
- [ ] 7. Die zehn Eingaben aus §0 stehen als **Werte**, nicht als Fragen.

---

## Was mit alten Links passiert — falls jemand fragt

- **Gedruckte oder verteilte `/u/<token>`-Zugangslinks** haben ≤ 72 h Laufzeit. Ist Zählung 4 aus §A
  null, gibt es keine gültigen mehr. Ein alter Link läuft nach dem Cutover auf die Suite-Antwort für
  unbekannte Token, und die ist **absichtlich nicht unterscheidbar** von „falsch eingegeben". Das ist
  richtig und muss niemandem erklärt werden.
- **`/s/<id>`-Links:** ohne `shares`-Zeilen kann keiner mehr gültig sein.
- **Lesezeichen auf die Verwaltungsoberflächen der Alt-Apps** landen nach dem Cutover auf der Suite.
  Wer dort keine Modulgruppe hat, bekommt **404** — nicht den Login.
