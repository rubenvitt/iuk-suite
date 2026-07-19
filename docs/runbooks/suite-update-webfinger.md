# Runbook — Suite-Update (Webfinger, Domains aus der .env) und Alt-Stack-Abbau

Für den Server-Agenten. **Drei Teile:**

- **Teil A — jetzt:** die laufende Suite auf den aktuellen Stand bringen. Bringt die
  eigene `/.well-known/webfinger`-Route mit **und stellt die Modul-Domains auf die
  `.env` um**. Rein additiv, kein Domain-Umschwenk.
- **Teil B — frühestens 02.08.2026:** den Alt-Stack `iuk-overview` abbauen, inklusive
  des Webfinger-Containers. **Nicht vorziehen** (Standby-Frist).
- **Teil C — Referenz:** wie ab jetzt ein Modul-Cutover läuft (ohne Rebuild).

> **Neu in diesem Update: die Prod-Domains kommen aus der `.env`, nicht mehr aus dem
> Code.** `SUITE_HOST_<MODUL>` legt fest, unter welcher Domain ein Modul läuft; ist
> nichts gesetzt, gilt weiterhin der Fallback aus dem Code (für `portal`:
> `iuk-ue.de`). Ein künftiger Cutover ist damit eine `.env`-Zeile plus
> `docker compose up -d` — kein Commit, kein CI-Lauf, und der Rollback ist das
> Zurücksetzen derselben Zeile.

Kontext: Der Portal-Cutover lief am 19.07.2026 (Runbook `portal-cutover.md`). Seitdem
bedient die Suite `iuk-ue.de`; vom Alt-Stack laufen noch `iuk-overview-db` (Rollback-Netz)
und `iuk-overview-webfinger` (bediente bis jetzt als einziger die Webfinger-Route).

---

# Teil A — Suite-Update

## A0. Vorbedingung: das Image muss existieren — sonst STOPP

Der Deploy zieht `ghcr.io/rubenvitt/iuk-suite:latest`. Dieses Tag ist nur dann der
gewünschte Stand, wenn der CI-Lauf für den aktuellen `main`-Commit **durchgelaufen** ist.

```bash
docker pull ghcr.io/rubenvitt/iuk-suite:latest

# Welcher Commit steckt drin?
docker image inspect ghcr.io/rubenvitt/iuk-suite:latest \
  -f '{{ index .Config.Labels "org.opencontainers.image.revision" }}'

# Beide Architekturen im Manifest? (Server-Arch war beim Schreiben unbekannt)
docker buildx imagetools inspect ghcr.io/rubenvitt/iuk-suite:latest
```

Die Revision muss der aktuelle `main`-Commit sein. **Stimmt sie nicht: hier abbrechen
und melden** — nicht mit einem alten Image weitermachen. Es hätte die Webfinger-Route
nicht, und Teil B würde später eine Route abschalten, die nirgends ersetzt ist.

> **Historie (19.07.2026):** Die CI baute Multi-Arch mit QEMU; der emulierte
> arm64-Build lief >2,5 h ohne fertig zu werden (amd64: 49 s) und Prod hing dadurch auf
> einem alten Image fest. Seit `5a39486` baut jede Architektur auf einem nativen Runner
> — arm64 jetzt 154 s, ganzer Lauf ~6 min. Wenn dieser Schritt also *wieder* ein altes
> Image zeigt, ist das ein neues Problem, nicht das alte.

## A1. Neues Image prüfen, bevor es live geht

Ephemerer Container **ohne Volume und ohne Traefik-Labels** — er kann weder die
Produktiv-DB anfassen noch mit dem Router der laufenden Suite kollidieren:

```bash
docker run --rm -d --name suite-verify -p 3999:3000 \
  -e AUTH_SECRET=verify-only \
  -e POCKET_ID_ISSUER=https://id.iuk-ue.de \
  ghcr.io/rubenvitt/iuk-suite:latest
sleep 15
```

`POCKET_ID_ISSUER` ist Pflicht — ohne ihn antwortet die Webfinger-Route bewusst mit 503.

Dann die vier Fälle. **Alle vier müssen stimmen**, nicht nur der erste:

```bash
B="http://127.0.0.1:3999/.well-known/webfinger"

# 1) Gültiger Account -> 200 + JRD
curl -s -w '\n%{http_code}\n' "$B?resource=acct:test@iuk-ue.de"
# erwartet:
# {"subject":"acct:test@iuk-ue.de","links":[{"rel":"http://openid.net/specs/connect/1.0/issuer","href":"https://id.iuk-ue.de"}]}
# 200

# 2) Ohne resource -> 400
curl -s -w '\n%{http_code}\n' "$B"                       # -> missing resource parameter / 400

# 3) Fremde Domain -> 404
curl -s -w '\n%{http_code}\n' "$B?resource=acct:x@example.com"  # -> resource not found / 404

# 4) Content-Type
curl -sI "$B?resource=acct:test@iuk-ue.de" | grep -i content-type   # -> application/jrd+json
```

Zusätzlich Health:

```bash
curl -fsS -H "Host: iuk-ue.de" http://127.0.0.1:3999/api/health/portal
```

Aufräumen: `docker stop suite-verify`

**Wenn einer der Punkte abweicht: STOPP, nicht deployen, melden.**

> Diese sechs Prüfungen wurden am 19.07.2026 gegen das publizierte Image
> (`ghcr.io/rubenvitt/iuk-suite:latest`, arm64) durchgespielt und waren grün — die
> Antworten sind byte-identisch mit denen des Alt-Dienstes. Sie sollten also
> durchlaufen; tun sie es nicht, stimmt etwas am Image oder an der Umgebung.

## A2. `.env` und `compose.yaml` angleichen

Die neue `compose.yaml` reicht die `.env` per `env_file` durch und nimmt die
Traefik-Regel aus einer Variablen. **Beides muss auf dem Server nachgezogen werden** —
`compose.yaml` liegt dort, nicht im Image.

```bash
cd <Verzeichnis mit compose.yaml der Suite>
cp compose.yaml compose.yaml.bak-$(date +%F)      # Rückweg sichern
docker compose version --short                    # muss >= 2.24 sein (env_file: required)
```

**Erst diffen, dann übernehmen.** Die Server-Datei kann Einträge führen, die die
Repo-Vorlage nie hatte — beim Deploy am 19.07.2026 war das `ADMIN_GROUP`, ohne das
das Admin-Gating still bricht:

```bash
diff compose.yaml.bak-$(date +%F) <neue-compose.yaml>
```

Jede `environment:`-Zeile, die nur in der **alten** Datei steht, gehört als Zeile in
die `.env` (sie kommt dann über `env_file` in den Container). Danach die neue
`compose.yaml` übernehmen (Branch `main`) und in der `.env` **ergänzen**:

```dotenv
SUITE_HOST_PORTAL=iuk-ue.de
SUITE_TRAEFIK_RULE=Host(`iuk-ue.de`)
ADMIN_GROUP=<Wert aus der alten compose.yaml, sonst entfällt die Zeile>
```

Nach dem Deploy stichprobenhaft im Container gegenprüfen, dass die aus der alten
`compose.yaml` übernommenen Variablen wirklich ankommen:

```bash
docker compose exec suite sh -c 'echo "ADMIN_GROUP=$ADMIN_GROUP"'
```

Beides entspricht exakt dem bisherigen Verhalten — dieser Schritt ändert nichts, er
verlagert nur die Quelle. Vorlage mit allen Kommentaren: `.env.example` im Repo.

Vor dem Anwenden prüfen, dass die Substitution stimmt:

```bash
docker compose config | grep -E 'routers.iuk-suite.rule|SUITE_HOST'
# erwartet u. a.: traefik.http.routers.iuk-suite.rule: Host(`iuk-ue.de`)
```

> **Am 19.07.2026 komplett durchgespielt** — echte `compose.yaml` + `.env` gegen das
> publizierte Image: die `SUITE_HOST_*` kommen per `env_file` im Container an, der
> gesetzte Host wird geroutet, der Portal-Fallback bleibt unberührt, die Traefik-Regel
> wird korrekt substituiert und der Container wird `healthy`.
>
> **Stolperstelle, die hier bewusst vermieden wird:** `SUITE_HOST_PORTAL` gehört
> **nicht** als `- SUITE_HOST_PORTAL=${SUITE_HOST_PORTAL:-}` unter `environment`.
> Compose setzt eine fehlende Variable dann auf einen **leeren String**, und leer
> bedeutet „dieses Modul hat keine Prod-Domain" — das Portal verschwände aus dem
> App-Switcher. Über `env_file` bleibt „nicht gesetzt" auch wirklich nicht gesetzt.

## A3. Deployen

Die Suite läuft bereits — das ist ein Container-Austausch, **keine** Router-Änderung.
Kurze Downtime (wenige Sekunden) beim Neustart einplanen.

```bash
docker compose pull
docker compose up -d
docker compose ps          # suite muss "healthy" werden (start_period 40s abwarten)
```

> ⚠️ **Den Health-Status wirklich abwarten.** Eine ungültige Host-Konfiguration
> (Tippfehler im Variablennamen, doppelt vergebener Host, Protokoll/Port im Wert)
> lässt den Server beim Boot abbrechen. Der Container bleibt dabei im Status
> `running`, antwortet aber auf nichts — `restart: unless-stopped` greift nicht, weil
> der Prozess nicht beendet wird. Nach außen sind das 502er. Die Ursache steht im Log:
>
> ```bash
> docker compose logs suite | grep -A5 'Ungültige Host-Konfiguration'
> ```
>
> Rückweg: `.env` korrigieren, `docker compose up -d`.

## A4. Verify nach dem Deploy

**Wichtig zur Erwartung:** Über die Domain antwortet auf `/.well-known/webfinger`
**weiterhin der Alt-Container** — sein Traefik-Router ist spezifischer (`PathPrefix`) als
der Apex-Router der Suite und gewinnt, solange er existiert. Das ist korrekt und
gewollt; umgeschaltet wird erst in Teil B. Die Suite-Route wurde in A1 direkt geprüft.

```bash
# 1) Portal lädt (nicht nur Statuscode – die Login-Weiterleitung ist erwartbar)
curl -si https://iuk-ue.de/ | head -5

# 2) Webfinger antwortet unverändert (noch aus dem Alt-Container)
curl -s "https://iuk-ue.de/.well-known/webfinger?resource=acct:test@iuk-ue.de"

# 3) Keine toten localtest.me-Links (Post-Cutover-Befund 2).
#    -i, nicht -I: HEAD hat keinen Body und prüft damit nichts.
curl -si https://iuk-ue.de/ | grep localtest.me        # muss LEER sein

# 4) Kein PWA-Manifest auf der Apex-Domain. Das Update bringt einen
#    domain-scoped PWA-Spike auf dem Wegwerf-Modul `beta` mit; er darf auf
#    iuk-ue.de nicht auftauchen.
curl -si https://iuk-ue.de/ | grep -i 'rel="manifest"'  # muss LEER sein
curl -si https://iuk-ue.de/manifest.webmanifest | grep -i 'application/manifest'  # muss LEER sein

# 5) Traefik-Access-Log kurz beobachten: die /m/portal-Kette darf nicht wachsen
#    (Post-Cutover-Befund 1). Kein /m/portal/m/portal/... in den Pfaden.
docker logs --tail 100 <traefik-container> | grep -o '/m/[^ "]*' | sort -u | head
```

## A5. Rollback

```bash
cp compose.yaml.bak-<datum> compose.yaml    # alte Compose-Datei zurück
# in compose.yaml das image-Tag auf den vorherigen type=sha-Tag pinnen
docker compose up -d
```

Der Deploy ändert **keine Daten und keine Router** — Image-Tag und `compose.yaml`
zurückzurollen genügt. Die Volume-Daten bleiben unberührt.

---

# Teil B — Alt-Stack abbauen (frühestens 02.08.2026)

Voraussetzung: Teil A ist gelaufen und A1 war grün. Sonst ist die Webfinger-Route nach
dem Abschalten des Alt-Containers **weg**.

## B1. Nochmal prüfen, dass die Suite die Route wirklich hat

```bash
docker compose exec suite sh -c 'echo "ISSUER=$POCKET_ID_ISSUER"'
```

`POCKET_ID_ISSUER` muss gesetzt sein. Ist es leer, antwortet die Route mit 503 —
dann erst `.env` korrigieren und `docker compose up -d`, sonst hier abbrechen.

## B2. Reihenfolge: erst der Alt-Router weg, dann verifizieren

Nie umgekehrt — solange der Alt-Container läuft, prüfst du weiter ihn und hältst sein
Ergebnis für einen Erfolg der Suite.

```bash
docker stop iuk-overview-webfinger
sleep 5

# Jetzt antwortet die Suite. Erwartete Ausgabe identisch zu vorher:
curl -s -w '\n%{http_code}\n' "https://iuk-ue.de/.well-known/webfinger?resource=acct:test@iuk-ue.de"
# {"subject":"acct:test@iuk-ue.de","links":[{"rel":"http://openid.net/specs/connect/1.0/issuer","href":"https://id.iuk-ue.de"}]}
# 200
curl -s -w '\n%{http_code}\n' "https://iuk-ue.de/.well-known/webfinger"                        # 400
curl -s -w '\n%{http_code}\n' "https://iuk-ue.de/.well-known/webfinger?resource=acct:x@example.com"  # 404
```

**Weicht etwas ab: sofort `docker start iuk-overview-webfinger`** und melden.

## B3. Erst wenn B2 grün ist: den Rest abbauen

```bash
# Volume-Tarball archivieren, BEVOR irgendetwas gelöscht wird
docker run --rm -v /data/iuk-overview/postgres:/src:ro -v "$PWD":/out alpine \
  tar czf /out/iuk-overview-postgres-$(date +%F).tar.gz -C /src .

docker stop iuk-overview-db iuk-overview-web 2>/dev/null
# Container/Stack entfernen, Volumes NICHT löschen, bis der Tarball geprüft ist
```

Repo `iuk-overview` auf GitHub archivieren.

## B4. Rollback für Teil B

`docker start iuk-overview-webfinger iuk-overview-db iuk-overview-web` — solange die
Volumes existieren, ist der Alt-Stack in Sekunden zurück.

---

---

# Teil C — Referenz: so läuft ab jetzt ein Modul-Cutover

Nicht jetzt auszuführen — die Vorlage für QR, Feedback, Files, Lagerbuch und Funk.
Seit dem Update braucht keiner dieser Schritte einen Commit oder CI-Lauf.

1. **DNS + TLS** für die neue Domain auf den Server zeigen lassen.
2. **`.env` ergänzen** — beide Zeilen, sonst greift die Umstellung nur halb:
   ```dotenv
   SUITE_HOST_QR=qr.iuk-ue.de
   SUITE_TRAEFIK_RULE=Host(`iuk-ue.de`) || Host(`qr.iuk-ue.de`)
   ```
   Ohne `SUITE_HOST_QR` weiß die Suite nichts von der Domain; ohne die Traefik-Regel
   erreicht die Domain den Container gar nicht erst.
3. **Alten Stack zuerst vom Router nehmen**, dann `docker compose up -d`. Nie beide
   Router gleichzeitig auf derselben Domain.
4. **Verifizieren, dass dort auch das richtige Modul antwortet** — das ist der Schritt,
   den man nicht auslassen darf:
   ```bash
   curl -s https://qr.iuk-ue.de/ | grep -o 'data-testid="[a-z-]*"' | head -3
   ```
   Erwartet werden die Test-IDs des QR-Moduls. **Kommt hier das Portal, ist der Wert
   von `SUITE_HOST_QR` falsch** — ein Tippfehler im *Wert* kann beim Boot nicht
   erkannt werden, der Host fällt dann still auf den Portal-Fallback zurück. Das ist
   die einzige Fehlkonfiguration, die durchrutscht, und dieser curl fängt sie.
5. **Rollback** ist eine Zeile: `SUITE_HOST_QR=` leeren (nicht löschen) und
   `docker compose up -d`. Das Modul hat dann wieder keine Prod-Domain und
   verschwindet auch aus dem App-Switcher.

## Was in diesem Runbook NICHT vorkommt

- **Kein Domain-Umschwenk, kein Import, kein Paritätscheck.** Das Update ist additiv.
- **Kein QR-/Phase-2-Deploy.** Das Modul `qr` existiert noch nicht; vor dem Bau stehen
  neun offene Entscheidungen (`docs/qr-portierung-analyse.md`).
- **Nichts an `iuk-overview-db` vor Teil B.** Sie ist bis dahin das Rollback-Netz.
