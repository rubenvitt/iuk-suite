# Runbook — Portal-Cutover (iuk-overview → iuk-suite)

Ziel: Die Apex-Domain `iuk-ue.de` von der Alt-App iuk-overview auf die Suite
umschwenken. Rollback ist frei (Router zurück + Alt-Container an). Alt-Stack
bleibt 2 Wochen in Standby.

## Vorbedingungen
- CI grün, Image `ghcr.io/rubenvitt/iuk-suite:latest` gepusht.
- Suite-Stack am Server deployt (`compose.yaml` + `.env` gesetzt), aber der
  Router `iuk-suite` (Host `iuk-ue.de`) ist NOCH NICHT aktiv — sonst kollidiert
  er mit dem iuk-overview-Router auf demselben Host.

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
6. **Verify vor dem Flip** (Router kollidiert noch, daher per Host-Header direkt
   gegen den Suite-Container, nicht über Traefik):
   `curl -H "Host: iuk-ue.de" http://<suite-container>:3000/api/health/portal`
   und die Portal-Kacheln / Admin-CRUD / Gruppen-Gating stichprobenhaft.
7. **Cutover**: Traefik-Router `Host(\`iuk-ue.de\`)` bei iuk-overview deaktivieren
   und bei der Suite aktivieren (genau einer aktiv). `docker compose up -d`.
8. **Standby & Abbau**: nach 2 Wochen iuk-overview-Stack + Postgres abbauen,
   Volume-Tarball archivieren, GitHub-Repo archivieren.

## Rollback
Router zurück auf iuk-overview + dessen Container starten. Sekunden.
