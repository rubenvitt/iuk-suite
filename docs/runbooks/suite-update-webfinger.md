# Runbook — Suite-Update (Webfinger + PWA-Spike) und Alt-Stack-Abbau

Für den Server-Agenten. **Zwei getrennte Teile:**

- **Teil A — jetzt:** die laufende Suite auf den aktuellen Stand bringen. Bringt die
  eigene `/.well-known/webfinger`-Route mit. Rein additiv, kein Domain-Umschwenk.
- **Teil B — frühestens 02.08.2026:** den Alt-Stack `iuk-overview` abbauen, inklusive
  des Webfinger-Containers. **Nicht vorziehen** (Standby-Frist).

Kontext: Der Portal-Cutover lief am 19.07.2026 (Runbook `portal-cutover.md`). Seitdem
bedient die Suite `iuk-ue.de`; vom Alt-Stack laufen noch `iuk-overview-db` (Rollback-Netz)
und `iuk-overview-webfinger` (bediente bis jetzt als einziger die Webfinger-Route).

---

# Teil A — Suite-Update

## A0. Vorbedingung: das Image muss existieren — sonst STOPP

Der Deploy zieht `ghcr.io/rubenvitt/iuk-suite:latest`. Dieses Tag ist nur dann der
gewünschte Stand, wenn der CI-Lauf für den aktuellen `main`-Commit **durchgelaufen** ist.

```bash
# Auf dem Server oder lokal – erwarteter Commit:
# 7102a7f  docs(qr): Portierungsanalyse + neun offene Entscheidungen
docker pull ghcr.io/rubenvitt/iuk-suite:latest
docker image inspect ghcr.io/rubenvitt/iuk-suite:latest \
  -f '{{ index .Config.Labels "org.opencontainers.image.revision" }}'
```

Die ausgegebene Revision muss der aktuelle `main`-Commit sein.

> ⚠️ **Stand 19.07.2026 ist das nicht gegeben.** Der `build-push`-Job der CI hängt seit
> Stunden im Multi-Arch-Schritt (QEMU-emulierter arm64-Build, `better-sqlite3` wird nativ
> kompiliert). Der amd64-Build braucht 49 Sekunden, der Multi-Arch-Build läuft nach
> 2,5 Stunden noch. **Wenn die Revision nicht stimmt: hier abbrechen und melden.** Nicht
> mit einem alten Image weitermachen — es hätte die Webfinger-Route nicht, und Teil B
> würde später eine Route abschalten, die nirgends ersetzt ist.

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

## A2. Deployen

Die Suite läuft bereits — das ist ein Container-Austausch, **keine** Router-Änderung.
Kurze Downtime (wenige Sekunden) beim Neustart einplanen.

```bash
cd <Verzeichnis mit compose.yaml der Suite>
docker compose pull
docker compose up -d
docker compose ps          # suite muss "healthy" werden (start_period 40s abwarten)
```

## A3. Verify nach dem Deploy

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

## A4. Rollback

```bash
docker compose down
docker run -d ... ghcr.io/rubenvitt/iuk-suite:<vorheriger-sha-tag>   # oder:
# in compose.yaml das image-Tag auf den vorherigen type=sha-Tag pinnen, dann up -d
```

Der Deploy ändert **keine Daten und keine Router** — ein Rückrollen auf das vorherige
Image genügt. Die Volume-Daten bleiben unberührt.

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

## Was in diesem Runbook NICHT vorkommt

- **Kein Domain-Umschwenk, kein Import, kein Paritätscheck.** Das Update ist additiv.
- **Kein QR-/Phase-2-Deploy.** Das Modul `qr` existiert noch nicht; vor dem Bau stehen
  neun offene Entscheidungen (`docs/qr-portierung-analyse.md`).
- **Nichts an `iuk-overview-db` vor Teil B.** Sie ist bis dahin das Rollback-Netz.
