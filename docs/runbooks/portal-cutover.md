# Runbook — Portal-Cutover (iuk-overview → iuk-suite)

Ziel: Die Apex-Domain `iuk-ue.de` von der Alt-App iuk-overview auf die Suite
umschwenken. Rollback ist frei (Router zurück + Alt-Container an). Alt-Stack
bleibt 2 Wochen in Standby.

## Vorbedingungen
- CI grün, Image `ghcr.io/rubenvitt/iuk-suite:latest` gepusht.
- `.env` für die Suite vorbereitet, Volume `suite_data` existiert. Der
  Suite-**Stack selbst wird VOR dem Cutover NICHT `up`-gebracht**: `compose.yaml`
  aktiviert den Traefik-Router `Host(\`iuk-ue.de\`)` unbedingt (kein Feature-Flag),
  der würde sofort mit dem iuk-overview-Router auf demselben Host kollidieren,
  solange iuk-overview die Domain noch bedient. Die Pre-Cutover-Verifikation
  läuft daher gegen einen **ephemeren `docker run`** (Host-Header direkt gegen
  den Container, an Traefik vorbei) — siehe Schritt 6.

## Ablauf
1. **Generalprobe** (lokal/Staging, automatisierbar):
   `DATA_DIR=./.data/gp pnpm exec tsx scripts/import/portal.ts <snapshot>.ndjson`
   → muss `parity green` liefern.
2. **Freeze**: iuk-overview read-only/stoppen (kurzes Wartungsfenster).
3. **Echten Snapshot ziehen** (auf dem iuk-overview-Postgres):
   `psql "$DATABASE_URL" -Atc "select row_to_json(t) from services t" > services.ndjson`
4. **Import** — aus einem **Repo-Checkout**, identisch zum Generalprobe-Befehl,
   nur mit echtem Snapshot + echtem Volume. Das standalone-Image enthält weder
   `scripts/` noch `tsx` → NICHT aus dem App-Image importieren. Das Volume heißt
   dank `name: suite_data` in `compose.yaml` deterministisch `suite_data` (kein
   Projekt-Präfix). `DATA_DIR` auf dessen Mountpoint zeigen:
   `VOL=$(docker volume inspect suite_data -f '{{ .Mountpoint }}')`
   `DATA_DIR="$VOL" pnpm exec tsx scripts/import/portal.ts services.ndjson`
   (Alternative ohne Host-Pfad: throwaway `node:22-alpine` mit
   `-v suite_data:/data -v "$PWD":/repo -w /repo`, darin `corepack enable && pnpm install`
   + derselbe `tsx`-Aufruf mit `DATA_DIR=/data`.) Entscheidend: Ausgabe endet mit `parity green`.
5. **Paritätscheck**: bricht das Skript ab → KEIN Cutover, Report prüfen.
6. **Verify vor dem Flip** — gegen das echte Image, per **ephemerem Container ohne
   Traefik-Labels** (keine Router-Kollision möglich, da dieser Container gar nicht
   an Traefik hängt):
   ```
   docker run --rm -p 3000:3000 -v suite_data:/data \
     -e AUTH_SECRET=<secret> -e AUTH_DEV_LOGIN=true \
     ghcr.io/rubenvitt/iuk-suite:latest
   ```
   dann in einem zweiten Terminal:
   `curl -H "Host: iuk-ue.de" http://127.0.0.1:3000/api/health/portal`
   plus Portal-Kacheln / Admin-CRUD / Gruppen-Gating stichprobenhaft. Danach den
   Container stoppen (Ctrl-C bzw. `docker stop`).
7. **Cutover** — Reihenfolge ist entscheidend, nie beide Router gleichzeitig aktiv:
   1. Traefik-Router `Host(\`iuk-ue.de\`)` bei **iuk-overview zuerst deaktivieren**.
   2. Erst danach für die Suite: `docker compose pull && docker compose up -d`
      (holt das aktuelle `:latest`-Image statt einer evtl. veralteten lokalen Kopie
      und aktiviert dabei deren Router).
8. **Standby & Abbau**: nach 2 Wochen iuk-overview-Stack + Postgres abbauen,
   Volume-Tarball archivieren, GitHub-Repo archivieren.

   ⚠️ **Der Container `iuk-overview-webfinger` gehört mit dazu** — er bedient
   `Host(\`iuk-ue.de\`) && PathPrefix(/.well-known/webfinger)` und lief nach dem
   Cutover vom 19.07.2026 bewusst weiter. Die Suite bringt diese Route seit
   `src/app/.well-known/webfinger/route.ts` selbst mit, aber **der
   PathPrefix-Router des Alt-Containers ist spezifischer und gewinnt**, solange
   er existiert. Reihenfolge deshalb wie beim Apex-Router:

   1. Prüfen, dass die Suite die Route hat und `POCKET_ID_ISSUER` im Stack gesetzt
      ist (ohne Issuer antwortet sie bewusst mit 503):
      `docker compose exec suite sh -c 'echo $POCKET_ID_ISSUER'`
   2. Router/Container `iuk-overview-webfinger` **zuerst** abschalten.
   3. Danach verifizieren — die Antwort muss unverändert bleiben:
      `curl -s "https://iuk-ue.de/.well-known/webfinger?resource=acct:a@iuk-ue.de"`
      → `{"subject":"acct:a@iuk-ue.de","links":[{"rel":"http://openid.net/specs/connect/1.0/issuer","href":"https://id.iuk-ue.de"}]}`
      Ebenso: kein `resource` → 400, fremde Domain → 404.

   Rollback ist derselbe wie oben: Alt-Container wieder starten.

## Rollback
Router zurück auf iuk-overview + dessen Container starten. Sekunden.
