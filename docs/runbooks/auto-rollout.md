# Runbook — automatischer Rollout nach dem main-Lauf

Für den Server-Agenten und den Betreiber. Richtet ein, dass ein grüner `main`-Lauf die
Suite auf dem Server ausrollt — **auf einen Klick zur Freigabe**, nicht unbeaufsichtigt.

Bis heute war ein Update eine Runbook-Sitzung (`suite-update-webfinger.md`, Teil A):
Image ziehen, Revision von Hand vergleichen, `up -d`, Health abwarten, prüfen. Diese
Schritte verschwinden nicht — sie ziehen in `scripts/deploy.sh` um und laufen dort in
derselben Reihenfolge, nur jedes Mal gleich.

**Drei Teile:**

- **Teil A — einmalig:** Runner, Environment, Variablen. Danach ist der Rollout scharf.
- **Teil B–D — laufender Betrieb:** was bei jedem Rollout passiert, wie man es prüft,
  wie man zurückgeht.
- **Teil E–F — Störungen und das Abschalten.**

> **Was der Rollout ausdrücklich NICHT ausrollt:** `compose.yaml`, `clamd.files.conf` und
> `.env`. Er *prüft* die ersten beiden auf Gleichstand mit dem Repo und **bricht bei
> Abweichung ab, bevor er etwas anfasst** — statt sie zu überschreiben. Der Grund steht
> in `suite-update-webfinger.md` (A2): die Server-`.env` führte am 19.07.2026 ein
> `ADMIN_GROUP`, das die Repo-Vorlage nie hatte; wer solche Dateien ungeprüft übernimmt,
> verliert stille Einstellungen. Stack-Änderungen bleiben Runbook-Arbeit — siehe **E2**.

---

# Teil A — Einrichtung (einmalig)

## A0. Vorbedingung, ohne die hier nicht weitergemacht wird

**Dieses Repository ist öffentlich, und der Rollout braucht einen selbst gehosteten
Runner auf dem Produktivserver.** Das ist die eine Kombination, vor der GitHub in seiner
eigenen Dokumentation ausdrücklich warnt, und der Grund ist kein theoretischer:

Bei einem `pull_request` aus einem **Fork** benutzt GitHub die Workflow-Datei aus dem
**Merge-Stand**, also einschließlich der Änderungen des Forks. Wer einen Fork anlegt und
darin `runs-on: ubuntu-latest` in `runs-on: [self-hosted, iuk-suite-prod]` ändert, führt
mit dem nächsten PR beliebigen Code auf der Maschine aus, auf der die Suite läuft — mit
Zugriff auf den Docker-Socket, also faktisch als root. Die drei Riegel im `deploy`-Job
(`if: refs/heads/main`, Environment mit Reviewer, `needs: merge`) greifen dagegen
**nicht**: der Angreifer benutzt nicht diesen Job, er schreibt sich einen eigenen.

Der Schalter, der es abstellt, ist eine Einstellung und keine Zeile im Repo:

> **GitHub → Settings → Actions → General → „Fork pull request workflows from outside
> collaborators" → `Require approval for all external contributors`.**

Damit startet ein PR aus einem Fork **gar nicht erst**, bevor jemand mit Schreibrecht ihn
freigibt. Die Vorgabe für öffentliche Repos ist die schwächere Stufe („first-time
contributors") — die reicht hier nicht.

**Prüfen und setzen, bevor der Runner registriert wird. Ist der Schalter nicht gesetzt,
gehört der Runner nicht auf diese Maschine.** Wer das nicht will, nimmt eine der
Alternativen aus der Entscheidung vom 16.08.2026 (Portainer-Webhook oder SSH aus der
Action) — beide brauchen keinen Runner am Server.

Zwei weitere Punkte derselben Art, kürzer, aber nicht optional:

- **Der Runner läuft NICHT als root.** Er braucht genau zwei Rechte: die Mitgliedschaft
  in der Gruppe `docker` und Schreibrecht auf das Stack-Verzeichnis. Die
  `docker`-Mitgliedschaft ist bereits root-gleichwertig — deshalb kein zusätzliches
  `sudo`, und deshalb auch kein zweiter Dienst auf demselben Konto.
- **Auf dem Runner liegen keine dauerhaften Registry-Zugangsdaten.** Der `deploy`-Job
  meldet sich mit dem `GITHUB_TOKEN` **dieses Laufs** an ghcr.io an und meldet sich im
  letzten Schritt wieder ab (`docker logout`). Ein PAT auf der Platte wäre bequemer und
  überlebte den Lauf — genau das soll er nicht.

## A1. Stack-Verzeichnis mit dem Repo angleichen

Der Rollout vergleicht `compose.yaml` und `clamd.files.conf` **byteweise** mit dem Repo
und bricht bei Abweichung ab. Das ist gewollt (E2 erklärt, warum), heißt aber: einmal
sauber angleichen, sonst scheitert jeder Lauf in Schritt 1.

```bash
cd <Verzeichnis mit der compose.yaml der Suite>     # dieser Pfad wird gleich SUITE_STACK_DIR
pwd

docker compose version --short                      # muss >= 2.24 sein (env_file: required)
cp compose.yaml compose.yaml.bak-$(date +%F)        # Rückweg sichern

# Erst diffen, DANN übernehmen — die Server-Datei kann Einträge führen, die die
# Repo-Vorlage nie hatte (Historie: ADMIN_GROUP am 19.07.2026).
diff compose.yaml <Repo>/compose.yaml
diff clamd.files.conf <Repo>/clamd.files.conf
```

Jede `environment:`-Zeile, die **nur in der Server-Datei** steht, gehört als Zeile in die
`.env` (sie kommt über `env_file` in den Container). Danach beide Dateien aus dem Repo
übernehmen — `compose.yaml` bringt in diesem Stand genau eine Änderung mit:

```yaml
image: ${SUITE_IMAGE:-ghcr.io/rubenvitt/iuk-suite:latest}
```

`SUITE_IMAGE` ist **nicht** von Hand zu setzen; der Rollout schreibt dort den Digest des
ausgerollten Standes hinein. Ohne die Variable bleibt alles wie bisher (`:latest`).

Prüfen, dass die Substitution steht und die Suite unverändert läuft:

```bash
docker compose config | grep -E 'image:|routers.iuk-suite.rule'
docker compose up -d && docker compose ps        # muss healthy bleiben
```

Zuletzt: der Runner-Nutzer muss in dieses Verzeichnis schreiben dürfen — der Rollout
pinnt dort eine Zeile in der `.env`.

```bash
sudo chown -R <runner-nutzer>: <SUITE_STACK_DIR>
sudo -u <runner-nutzer> test -w <SUITE_STACK_DIR>/.env && echo "schreibbar"
```

## A2. Runner registrieren

Architektur zuerst feststellen — das Paket unterscheidet sich:

```bash
uname -m        # aarch64 -> arm64 | x86_64 -> x64
```

Dann **GitHub → Settings → Actions → Runners → New self-hosted runner**. Die Seite nennt
die aktuelle Runner-Version und den Registrierungs-Token (der läuft nach einer Stunde
ab); hier steht der Ablauf, nicht die Version:

```bash
sudo -u <runner-nutzer> -H bash
mkdir -p ~/actions-runner && cd ~/actions-runner
# curl + tar exakt so, wie die GitHub-Seite sie zeigt (Version und Prüfsumme von dort)

./config.sh \
  --url https://github.com/rubenvitt/iuk-suite \
  --token <TOKEN von der Seite> \
  --name  <servername> \
  --labels iuk-suite-prod \
  --unattended
exit

# Als Dienst, damit er einen Neustart überlebt:
cd ~<runner-nutzer>/actions-runner
sudo ./svc.sh install <runner-nutzer>
sudo ./svc.sh start
sudo ./svc.sh status
```

> ⚠️ **Das Label `iuk-suite-prod` ist wörtlich zu nehmen.** `runs-on: [self-hosted,
> iuk-suite-prod]` in `.github/workflows/ci.yml` sucht genau diese Kombination. Ein
> Tippfehler ergibt keinen Fehler, sondern einen Job, der bis zum Timeout **wartet** —
> das Fehlerbild aus E1.

Der Runner muss Docker sprechen können:

```bash
sudo usermod -aG docker <runner-nutzer>
sudo ./svc.sh stop && sudo ./svc.sh start     # Gruppenmitgliedschaft greift erst neu
sudo -u <runner-nutzer> docker ps             # muss ohne sudo eine Liste zeigen
```

In der Runner-Liste des Repos muss er jetzt als **Idle** stehen.

## A3. Environment `produktion` mit Freigabe anlegen

**GitHub → Settings → Environments → New environment → `produktion`** (der Name ist
wörtlich, `ci.yml` verweist darauf), dann dort:

- **Required reviewers:** `rubenvitt` (ohne diesen Eintrag läuft der Rollout ohne Klick
  durch — das ist die Entscheidung vom 16.08.2026, und sie steckt nur hier, nicht im
  Repo).
- **Deployment branches and tags:** `Selected branches` → `main`. Zweites Schloss neben
  dem `if:` im Job.
- **Environment secrets:** keine. Der Rollout braucht keine.

## A4. Repository-Variablen setzen — das ist zugleich der Einschalter

**GitHub → Settings → Secrets and variables → Actions → Variables → New repository
variable.** Es sind *Variables*, keine *Secrets*: nichts davon ist geheim, und Variablen
sind im Job-Protokoll lesbar, was bei der Fehlersuche zählt.

| Variable | Pflicht | Wert (Beispiel) | Wirkung |
|---|---|---|---|
| `SUITE_STACK_DIR` | **ja** | `/opt/iuk-suite` | Verzeichnis mit `compose.yaml` und `.env`. **Solange sie fehlt, wird der `deploy`-Job übersprungen** — sie ist der Ein-/Ausschalter. |
| `SUITE_HEALTH_URL` | nein | `https://iuk-ue.de/api/health/portal` | Öffentliche Gegenprobe nach dem Rollout. Nicht gesetzt = diese Vorbelegung. `aus` schaltet sie ab. |
| `SUITE_BACKUP_CMD` | nein | siehe unten | Sicherung **vor** dem Austausch. Nicht gesetzt = keine, mit Warnung im Protokoll. |

Für `SUITE_BACKUP_CMD` ist der ganze Befehl der Wert; `scripts/backup.sh` liegt bereits
im Repo und braucht die Volume-Pfade des Hosts:

```
DATA_DIR=/var/lib/docker/volumes/suite_data/_data BLOB_DIR=/var/lib/docker/volumes/files_data/_data /opt/iuk-suite/backup.sh
```

> **Warum das mehr ist als Vorsicht:** der Rollback in Teil D tauscht das **Image**
> zurück, nicht die **Daten**. Die Boot-Instrumentation migriert beim Start nach vorn;
> ein Stand, der eine Spalte umbenennt, ist mit dem alten Image nicht mehr lesbar. Ohne
> Sicherung ist der Rollback in genau diesem Fall keiner.

## A5. Probelauf

**GitHub → Actions → CI → Run workflow → Branch `main`.** Der Lauf geht durch `checks`,
`e2e`, `test`, `build`, `merge` (~10 min) und bleibt dann stehen:

> **Review pending deployments** → `produktion` → **Approve and deploy**

Danach im Protokoll des `deploy`-Jobs die neun Schritte mitlesen. Grün heißt: Schritt 7
hat die Revision der laufenden Instanz mit dem Commit dieses Laufs verglichen — nicht nur
„es antwortet etwas".

Am Ende steht eine Zusammenfassung am Lauf (Commit, Digest, Rückweg, Stack). **Den
Rückweg-Digest beim ersten Lauf notieren**, solange es noch keinen aus einem vorherigen
Rollout gibt.

---

# Teil B — Was bei jedem Rollout passiert

Reihenfolge in `scripts/deploy.sh`. Die Trennlinie liegt zwischen 4 und 5: **bis
einschließlich Schritt 4 ist ein Abbruch folgenlos**, danach greift der Rollback.

| # | Schritt | Bei Fehlschlag |
|---|---|---|
| 0 | Voraussetzungen (Verzeichnis, `.env` schreibbar, Compose v2) | Abbruch, nichts angefasst |
| 1 | `compose.yaml` + `clamd.files.conf` gegen das Repo | Abbruch mit Diff → **E2** |
| 2 | `docker pull :latest`, Revision aus **Label und ENV** prüfen | Abbruch → **E3/E4** |
| 3 | Rückweg festhalten (gepinnter Digest, sonst laufender Container) | Warnung, kein Abbruch |
| 4 | `SUITE_BACKUP_CMD`, falls gesetzt | Abbruch — kein Rollout ohne Sicherung |
| 5 | Digest in die `.env` pinnen, `docker compose up -d` | ab hier: Rollback |
| 6 | Auf `healthy` warten (bis 300 s) | Rollback → **E5** |
| 7 | `revision` aus `/api/health/portal` **im Container** vergleichen | Rollback → **E6** |
| 8 | Öffentliche Gegenprobe über Traefik | nur Warnung → **E7** |
| 9 | Zusammenfassung an den Lauf schreiben | — |

Zwei Entscheidungen darin, die man beim Lesen sonst für Nachlässigkeit hält:

- **Schritt 2 zieht das Tag mit `docker pull`, nicht mit `docker compose pull`.** In der
  `.env` steht nach dem ersten Rollout ein **Digest**; `compose pull` zöge genau den —
  also den alten Stand — und der Rollout liefe ins Leere, ohne dass etwas rot wird.
- **Schritt 8 löst keinen Rollback aus.** Schritt 7 hat den Container bereits bewiesen.
  Was hier scheitern kann, ist der *Weg* dorthin (Traefik, DNS/Hairpin, TLS) — und einen
  Routing-Fehler behebt ein Image-Rollback nicht, er verlängerte nur die Störung.

---

# Teil C — Verify von Hand

Nach einem Rollout, oder wann immer die Frage „was läuft da eigentlich?" aufkommt:

```bash
cd $SUITE_STACK_DIR

# 1) Was ist gepinnt? (die einzige Zeile, die der Rollout anfasst)
grep '^SUITE_IMAGE=' .env

# 2) Was läuft, und ist es gesund?
docker compose ps

# 3) Welcher Commit antwortet? — der eigentliche Beleg
curl -s https://iuk-ue.de/api/health/portal
# {"status":"ok","module":"portal","revision":"<commit>"}

# 4) Gegenprobe am Container selbst, falls 3) abweicht (dann liegt es an Traefik)
docker compose exec -T suite wget -qO- http://127.0.0.1:3000/api/health/portal
```

Der Wert aus 3) ist der volle Commit-SHA von `main`; `git log --oneline -1 origin/main`
ist die Gegenprobe.

---

# Teil D — Rollback

## D1. Automatisch

Scheitert Schritt 6 oder 7, setzt das Skript den vorherigen Digest zurück, startet neu
und wartet erneut auf `healthy`. Der Job ist danach **rot** — das ist richtig: der
Rollout ist gescheitert, auch wenn der Server wieder läuft. Im Protokoll steht dann
`ROLLBACK auf ghcr.io/rubenvitt/iuk-suite@sha256:…`.

## D2. Von Hand

Der Rollback ist derselbe Handgriff wie der Rollout — eine Zeile:

```bash
cd $SUITE_STACK_DIR
grep '^SUITE_IMAGE=' .env                    # was läuft gerade

# Vorherigen Digest finden: aus der Zusammenfassung des letzten Laufs (Feld „Rückweg"),
# sonst aus dem lokalen Bestand:
docker images --digests ghcr.io/rubenvitt/iuk-suite

# Die eine Zeile setzen …
sed -i 's|^SUITE_IMAGE=.*|SUITE_IMAGE=ghcr.io/rubenvitt/iuk-suite@sha256:<alt>|' .env
# … und anwenden:
docker compose up -d && docker compose ps
curl -s https://iuk-ue.de/api/health/portal   # Revision muss der alte Commit sein
```

> ⚠️ **Der Image-Rollback holt keine Daten zurück.** Migrationen laufen beim Boot nur
> vorwärts. Hat der zurückgerollte Stand ein Schema geändert, ist der Rückweg die
> Sicherung aus Schritt 4 — nicht diese Zeile. Deshalb A4.

Die Zeile ganz zu **entfernen** ist ebenfalls gültig: dann greift wieder `:latest` aus
der `compose.yaml`. Das ist allerdings der Zustand, in dem ein späteres `up -d` von Hand
still den nächsten CI-Stand zieht — als Dauerzustand nicht gewollt.

---

# Teil E — Fehlerbilder

### E1 — Der Job steht auf „Waiting for a runner to pick up this job"

Der Runner ist offline oder trägt das Label nicht. `sudo ./svc.sh status` auf dem Server,
und in **Settings → Actions → Runners** muss er **Idle** sein und `iuk-suite-prod`
tragen. Ein Job wartet hier stundenlang, ohne rot zu werden — er meldet sich also nicht
von selbst.

### E2 — Abbruch in Schritt 1: „Stack-Dateien weichen ab"

Der erwartete Fall, sobald ein PR `compose.yaml` oder `clamd.files.conf` anfasst — etwa
weil ein neues Modul ein Volume braucht. Der Abbruch ist folgenlos; Produktion läuft
weiter auf dem alten Stand.

Der Diff steht im Protokoll (links Server, rechts Repo). Ablauf: Repo-Datei übernehmen,
dabei **jede `environment:`-Zeile, die nur die Server-Datei hatte, in die `.env`
retten** (A1), dann den `deploy`-Job des Laufs neu starten (**Re-run failed jobs** —
er fordert die Freigabe erneut an).

> Warum hier nicht automatisch überschrieben wird: ein Image gegen eine alte
> `compose.yaml` ausgerollt gibt **keine klare Fehlermeldung**. Fehlt etwa der Mount
> `aufgaben_data`, schreibt das Modul seine Bildnachweise in das Container-Dateisystem,
> clamd findet sie nie, und sichtbar wird das Tage später als dauerhaft
> `scan_status: 'fehler'`. Und fehlt `clamd.files.conf` ganz, legt Docker an der Stelle
> ein leeres **Verzeichnis** an — clamd startet ohne Konfiguration, wird nie `healthy`,
> und **die ganze Suite startet nicht** (`depends_on: service_healthy`).

### E3 — Abbruch in Schritt 2: „Das Tag :latest trägt Commit X, erwartet war Y"

Meist harmlos: ein **neuerer** main-Merge hat `:latest` inzwischen überschrieben. Dann
ist dieser Rollout überholt, und der neuere Lauf erledigt ihn — nichts zu tun.

Ist Y **neuer** als X, ist der `merge`-Job dieses Laufs nicht durchgelaufen (oder hat die
Manifest-Liste nicht getaggt). Dann dort ins Protokoll schauen, nicht auf den Server.

### E4 — Abbruch in Schritt 2: „ENV SUITE_REVISION ist leer"

Das Image trägt das richtige Label, aber nicht die Variable: im `build`-Job fehlt
`--build-arg SUITE_REVISION`, oder das `ARG`/`ENV`-Paar am Ende des `Dockerfile` ist
verschwunden. `scripts/deploy.test.ts` fängt beides in der CI ab — steht dieser Abbruch
trotzdem da, wurde am Image außerhalb der Pipeline gebaut.

### E5 — Rollback nach Schritt 6: nicht `healthy` geworden

**Erster Blick ist `docker compose ps clamav`, nicht das Suite-Log.** Die Suite wartet
per `depends_on: service_healthy` auf den Scanner; ein fehlgeschlagener freshclam-
Erststart oder eine zu knappe `start_period` hält sie beliebig lange zurück.

```bash
docker compose ps
docker compose logs clamav | tail -20
docker compose logs suite | tail -40
```

Zweiter Verdacht, wenn clamav gesund ist: eine **ungültige Host-Konfiguration**. Der
Container bleibt dann `running`, antwortet aber auf nichts — `restart: unless-stopped`
greift nicht, weil der Prozess nicht endet. Nach außen sind das 502er:

```bash
docker compose logs suite | grep -A5 'Ungültige Host-Konfiguration'
```

Das ist ein `.env`-Fehler, kein Image-Fehler — der automatische Rollback bringt den alten
Stand zurück, aber der nächste Rollout scheitert genauso, bis die `.env` stimmt.

### E6 — Rollback nach Schritt 7: „meldet Commit A, erwartet war B"

Der Container ist gesund, trägt aber den falschen Stand. Praktisch bedeutet das, dass
`up -d` den alten Container **nicht ersetzt** hat (Pin nicht angekommen, Compose hat
keine Änderung gesehen). Gegenprobe:

```bash
grep '^SUITE_IMAGE=' .env
docker compose config | grep 'image:'
docker inspect -f '{{ .Image }}' "$(docker compose ps -q suite)"
```

### E7 — Warnung in Schritt 8: intern richtig, öffentlich falsch oder keine Antwort

Der Rollout ist **erfolgreich** (Schritt 7 ist der Beweis), der Weg von außen aber nicht.
Drei Ursachen in dieser Reihenfolge:

1. **Traefik hat den neuen Container nicht übernommen** — `docker logs <traefik>` und
   prüfen, ob der Router `iuk-suite` noch auf den alten Container zeigt.
2. **Der Server erreicht seine eigene öffentliche Domain nicht** (Hairpin-NAT/Split-DNS).
   Dann ist die Warnung eine Eigenschaft des Netzes und kein Befund; entweder eine
   interne URL in `SUITE_HEALTH_URL` eintragen oder sie auf `aus` setzen.
3. **TLS/Cloudflare** davor.

### E8 — „Rollback ebenfalls nicht gesund geworden"

Die eine Meldung, die keinen Aufschub verträgt: weder der neue noch der alte Stand läuft.
Das ist dann kein Image-Problem mehr — Reihenfolge wie in E5 (clamav zuerst), und der
schnellste Rückweg auf einen bekannten Zustand ist die `compose.yaml.bak-<datum>` aus A1
plus der zuletzt bekannte Digest.

---

# Teil F — Abschalten

**Vorübergehend, ohne Codeänderung:** die Repository-Variable `SUITE_STACK_DIR` löschen.
Der `deploy`-Job wird ab dem nächsten Lauf **übersprungen**; alles andere bleibt.

**Nur pausieren:** die Freigabe im Environment einfach nicht erteilen — der Lauf wartet
30 Tage und läuft dann ab.

**Dauerhaft:** zusätzlich den Runner-Dienst stoppen und die Registrierung entfernen —
sonst steht eine Maschine mit Docker-Socket weiter an einem öffentlichen Repo:

```bash
cd ~<runner-nutzer>/actions-runner
sudo ./svc.sh stop && sudo ./svc.sh uninstall
sudo -u <runner-nutzer> ./config.sh remove --token <Token von der Runner-Seite>
```

---

## Was in diesem Runbook NICHT vorkommt

- **Kein Domain-Umschwenk, kein Modul-Cutover.** Dafür gilt weiter `Teil C` in
  `suite-update-webfinger.md` — eine `.env`-Zeile plus `docker compose up -d`.
- **Keine automatische Übernahme von `compose.yaml`/`.env`.** Siehe E2.
- **Keine Rücknahme von Migrationen.** Siehe A4 und D2.
- **Kein zweiter Weg auf den Server.** Kein SSH-Zugang aus der Action, kein PAT auf der
  Platte, kein Portainer-Webhook — die Alternativen aus der Entscheidung vom 16.08.2026
  sind bewusst nicht zusätzlich eingerichtet.
