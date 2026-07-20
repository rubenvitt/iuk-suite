# Runbook — Cutover Modul `qr` (easy-qr → iuk-suite)

Ziel: Die QR-Domain von `easy-qr` auf die Suite umschwenken, mit übernommenen
Presets. Rollback ist frei (Router zurück + Alt-Container starten).

**Voraussetzung:** PR #2 (`feat/qr-module`) und der Import (`feat/qr-import`) sind
gemergt, CI grün, Image gebaut. Prüfen wie in `suite-update-webfinger.md`, Schritt A0.

> **Was du beisteuern musst und ich nicht selbst herausfinden kann:**
> 1. **Die QR-Domain.** Sie steht nirgends im Repo — `easy-qr/docker-compose.yml` hat
>    das Traefik-Label auskommentiert, `.env.example` nennt nur `localhost`. Sie steht
>    in der `.env` des easy-qr-Stacks auf dem Server (`APP_ORIGIN`, `POCKET_ID_REDIRECT_URI`)
>    bzw. in dessen Traefik-Regel.
> 2. **Einen Snapshot der Presets** (Schritt 2 unten).

---

## 1. Domain und Gruppen feststellen

```bash
cd <easy-qr-Verzeichnis auf dem Server>
grep -E 'APP_ORIGIN|POCKET_ID_REDIRECT_URI|OIDC_.*_GROUPS' .env
docker inspect <easy-qr-container> -f '{{ json .Config.Labels }}' | tr ',' '\n' | grep -i rule
```

Notieren: die Domain, und ob die Gruppen von den Defaults abweichen
(`drk-qr-admin` / `drk-qr-user`). Weicht die Admin-Gruppe ab, gehört sie später als
`SUITE_ADMIN_GROUP_QR` in die `.env` der Suite.

## 2. Snapshot der Presets ziehen

Die Daten liegen in der SQLite des easy-qr-Containers (`DB_PATH=/data/app.db`,
Volume `./data`). **Vor dem Kopieren den Container stoppen** — eine laufende
SQLite mit WAL kopiert man nicht per `cp`, sonst fehlen die Änderungen aus dem
WAL-File oder die Datei ist inkonsistent.

```bash
docker compose stop app          # kurzes Wartungsfenster
cp ./data/app.db /tmp/easy-qr-snapshot.db
docker compose start app         # sofort wieder hoch, der Cutover kommt später
```

Alternative ohne Stoppen (konsistent trotz laufender Schreiber):

```bash
docker compose exec app sh -c 'sqlite3 /data/app.db ".backup /data/snapshot.db"' \
  && cp ./data/snapshot.db /tmp/easy-qr-snapshot.db
```

Prüfen, dass etwas drin ist:

```bash
sqlite3 /tmp/easy-qr-snapshot.db "SELECT count(*) FROM presets;"
sqlite3 /tmp/easy-qr-snapshot.db "SELECT id, kind, sort_order FROM presets ORDER BY sort_order LIMIT 10;"
```

Die Zahl merken — sie muss nach dem Import wieder herauskommen.

Snapshot auf den Rechner holen, auf dem das Repo-Checkout liegt (der Import läuft
**nicht** aus dem App-Image: das standalone-Image enthält weder `scripts/` noch `tsx`).

## 3. Generalprobe: Import gegen ein Wegwerf-Ziel

```bash
cd <repo-checkout>
DATA_DIR=./.data/gp-qr pnpm exec tsx scripts/import/qr.ts /tmp/easy-qr-snapshot.db
```

Erwartet: `QR-Import OK — <n> Presets, parity green.` — mit demselben `<n>` wie in
Schritt 2. **Bricht das Skript ab, ist der Cutover gestoppt**; der Report nennt die
abweichenden Zeilen.

Stichprobe, dass die Daten benutzbar sind:

```bash
sqlite3 ./.data/gp-qr/qr.db "SELECT id, label, kind, substr(value,1,40) FROM presets ORDER BY sort_order LIMIT 5;"
```

`value` muss JSON sein — bei `kind='url'` mit Anführungszeichen (`"https://…"`).
Steht dort ein nackter Wert ohne Anführungszeichen, stimmt etwas nicht: melden,
nicht weitermachen.

## 4. Echter Import in das Produktiv-Volume

Erst ab hier wird das Ziel angefasst. Das Volume heißt deterministisch `suite_data`.

```bash
VOL=$(docker volume inspect suite_data -f '{{ .Mountpoint }}')
DATA_DIR="$VOL" pnpm exec tsx scripts/import/qr.ts /tmp/easy-qr-snapshot.db
```

Alternative ohne Host-Pfad (falls das Volume nicht direkt lesbar ist):

```bash
docker run --rm -v suite_data:/data -v "$PWD":/repo -v /tmp:/snap -w /repo node:22-alpine \
  sh -c 'corepack enable && pnpm install --frozen-lockfile && DATA_DIR=/data pnpm exec tsx scripts/import/qr.ts /snap/easy-qr-snapshot.db'
```

Wieder muss die Ausgabe auf `parity green` enden.

> Der Import ist **idempotent und aktualisierend**: ein zweiter Lauf mit einem
> neueren Snapshot überschreibt geänderte Presets, statt sie zu überspringen.
> Wenn zwischen Generalprobe und Cutover im Alt-System weitergearbeitet wurde,
> zieh einfach einen frischen Snapshot und importiere erneut.

## 5. Verify vor dem Umschwenk

Ephemerer Container **ohne Traefik-Labels**, mit dem Produktiv-Volume nur lesend
gedacht — die Suite läuft parallel weiter, deshalb hier **kein** zweiter Schreiber
auf dieselbe SQLite. Stattdessen gegen eine Kopie prüfen:

```bash
docker run --rm -d --name qr-verify -p 3998:3000 \
  -e AUTH_SECRET=verify-only -e POCKET_ID_ISSUER=https://id.iuk-ue.de \
  -e SUITE_HOST_QR=qr.iuk-ue.de \
  -v suite_data:/data \
  ghcr.io/rubenvitt/iuk-suite:latest
sleep 15
curl -s -H "Host: qr.iuk-ue.de" http://127.0.0.1:3998/ | grep -o 'data-testid="[a-z-]*"' | head -3
docker stop qr-verify
```

Erwartet: Test-IDs des QR-Moduls (`qr-home` o. ä.). **Kommt das Portal, ist
`SUITE_HOST_QR` falsch** — ein Tippfehler im Wert fällt still auf den
Portal-Fallback zurück und wird nur hier sichtbar.

## 6. Cutover — Reihenfolge ist entscheidend

Nie beide Router gleichzeitig auf derselben Domain.

1. **easy-qr vom Router nehmen** (Traefik-Label deaktivieren bzw. Container stoppen).
2. In der `.env` der Suite ergänzen:
   ```dotenv
   SUITE_HOST_QR=<die Domain aus Schritt 1>
   SUITE_TRAEFIK_RULE=Host(`iuk-ue.de`) || Host(`<die Domain aus Schritt 1>`)
   # nur falls die Admin-Gruppe von drk-qr-admin abweicht:
   # SUITE_ADMIN_GROUP_QR=<Gruppe aus Schritt 1>
   ```
   **Beide Zeilen.** Ohne `SUITE_HOST_QR` kennt die Suite die Domain nicht; ohne die
   Traefik-Regel erreicht die Domain den Container gar nicht erst.
3. `docker compose up -d` und den Health abwarten:
   ```bash
   docker compose ps        # muss "healthy" werden
   docker compose logs suite | grep -A5 'Ungültige Host-Konfiguration'   # muss leer sein
   ```
   Eine kaputte Host-Konfiguration lässt den Boot abbrechen; der Container bleibt
   dabei `running` und antwortet auf nichts — nach außen 502er.

## 7. Verify nach dem Umschwenk

```bash
D=<die Domain>

# 1) Es antwortet wirklich das QR-Modul, nicht das Portal
curl -s "https://$D/" | grep -o 'data-testid="[a-z-]*"' | head -3

# 2) Anonym nutzbar — der Kern des Moduls
curl -s -o /dev/null -w "%{http_code}\n" "https://$D/wifi"     # 200, kein Login-Redirect

# 3) Der QR-URL-Vertrag hält (geteilte und gebookmarkte Links)
curl -s "https://$D/qr?data=tel%3A%2B49301234&kind=tel" | grep -c "svg"   # > 0

# 4) Presets sind da (eingeloggt im Browser prüfen, nicht per curl)
#    -> Startseite zeigt die Schnellzugriffe, Anzahl wie in Schritt 2

# 5) Keine toten Switcher-Links (-i, nicht -I: HEAD hat keinen Body)
curl -si "https://$D/" | grep localtest.me      # muss LEER sein

# 6) PWA nur hier, nicht auf dem Apex
curl -si "https://$D/manifest.webmanifest" | grep -i 'application/manifest'   # muss treffen
curl -si "https://iuk-ue.de/manifest.webmanifest" | grep -i 'application/manifest'  # muss LEER sein
```

Zusätzlich im Browser auf einem Mobilgerät: Seite installieren, Flugmodus an,
WLAN-QR erzeugen. Das ist der Einsatzfall, für den das Modul gebaut ist.

## 8. Rollback

```bash
# .env: SUITE_HOST_QR leeren (nicht löschen), SUITE_TRAEFIK_RULE zurück
docker compose up -d
# easy-qr wieder an den Router hängen und starten
```

Leer gesetztes `SUITE_HOST_QR` heißt „dieses Modul hat keine Prod-Domain" — es
verschwindet damit auch aus dem App-Switcher. Die importierten Daten bleiben im
Volume liegen und stören nicht.

## 9. Standby und Abbau

easy-qr **zwei Wochen** in Standby lassen (Container gestoppt, Volume unangetastet),
danach abbauen: Volume-Tarball archivieren, Stack entfernen, GitHub-Repo archivieren.

---

## Offener Punkt, vor Schritt 6 zu entscheiden

`/m/qr` ist — wie alle Modul-Routen — auf **jeder** Domain erreichbar, also auch
unter `https://iuk-ue.de/m/qr`. Bei den Wegwerf-Modulen war das kosmetisch; hier
entsteht ein zweiter, ungewollter Zugang zum QR-Modul auf der Portal-Domain, mit
einem Manifest-Link, der dort ins Leere zeigt.

Kein Sicherheitsproblem (das Modul ist bewusst anonym), aber unsauber. Das Host-Gating
von `/m/*` zu verschärfen berührt die RSC-Prefetch-Mechanik aus Post-Cutover-Befund 1
und gehört nicht nebenbei erledigt — es braucht eine eigene Betrachtung. Entscheide
vor dem Cutover, ob das vorher passieren soll oder ob es bis zum Rückbau der
Wegwerf-Module wartet.
