#!/usr/bin/env bash
#
# Rollout der Suite auf den Server — der ausführende Teil des automatischen Rollouts.
# Gerufen vom Job `deploy` in `.github/workflows/ci.yml` auf einem selbst gehosteten
# Runner AUF DIESEM SERVER, und von Hand genauso aufrufbar:
#
#   SUITE_STACK_DIR=/opt/iuk-suite SUITE_REVISION_ERWARTET=<commit> scripts/deploy.sh
#
# Runbook mit Einrichtung, Freigabe, Fehlerbildern und Rollback:
#   docs/runbooks/auto-rollout.md
#
# ─────────────────────────────────────────────────────────────────────────────────────
# DREI EIGENSCHAFTEN, DIE DIESES SKRIPT TRAGEN — sie sind der Grund, dass ein Rollout
# ohne Aufsicht laufen darf:
#
#  1. ES PRÜFT VOR DEM ANFASSEN. Passt der Stand im Registry nicht zum Commit dieses
#     Laufs oder weicht die `compose.yaml` des Servers von der des Repos ab, bricht es
#     ab, BEVOR ein Container ausgetauscht wird. Ein Abbruch hier ist folgenlos.
#  2. ES BEWEIST DEN NEUEN STAND. Nach dem Austausch wird nicht „antwortet etwas?"
#     geprüft, sondern „antwortet DIESER Commit?" (`revision` aus
#     `/api/health/portal`). Ein hängengebliebener alter Container ist von einem
#     erfolgreichen Rollout sonst nicht zu unterscheiden.
#  3. ES HAT EINEN RÜCKWEG. Vor dem Austausch merkt es sich den laufenden Digest; jeder
#     Fehlschlag danach setzt ihn zurück und wartet erneut auf `healthy`.
#
# WAS ES AUSDRÜCKLICH NICHT TUT — beides ist Runbook-Arbeit, siehe Teil E des Runbooks:
#   * `compose.yaml`, `clamd.files.conf` oder `.env` inhaltlich ausrollen. Es prüft die
#     ersten beiden auf Gleichstand und bricht bei Abweichung ab, statt zu überschreiben:
#     die Server-`.env` führte am 19.07.2026 ein `ADMIN_GROUP`, das die Repo-Vorlage nie
#     hatte — wer solche Dateien ungeprüft übernimmt, verliert stille Einstellungen.
#   * Migrationen zurückrollen. Die Boot-Instrumentation migriert beim Start nach vorn;
#     ein Image-Rollback macht das NICHT rückgängig.
# ─────────────────────────────────────────────────────────────────────────────────────
set -euo pipefail

STACK_DIR="${SUITE_STACK_DIR:?SUITE_STACK_DIR fehlt (Verzeichnis mit compose.yaml und .env auf dem Server)}"
ERWARTET="${SUITE_REVISION_ERWARTET:?SUITE_REVISION_ERWARTET fehlt (der Commit, der ausgerollt werden soll)}"
BASIS="${SUITE_IMAGE_BASIS:-ghcr.io/rubenvitt/iuk-suite}"
TAG="${SUITE_IMAGE_TAG:-latest}"
# Frist bis `healthy`. Sie muss über der `start_period` der Suite (40s) UND der von
# clamav (Vorgabe 120s) liegen — die Suite startet wegen `depends_on: service_healthy`
# erst danach. 300s lassen Luft für einen langsamen clamd-Erststart.
FRIST="${SUITE_DEPLOY_FRIST:-300}"
# Öffentliche Gegenprobe über Traefik. `:-` und nicht `-`, weil GitHub eine nicht
# gesetzte Repository-Variable als LEEREN String durchreicht — mit `-` wäre die Prüfung
# in der CI still abgeschaltet und nur bei einem Aufruf von Hand aktiv. Ausschalten geht
# ausdrücklich, aber sichtbar: SUITE_HEALTH_URL=aus.
HEALTH_URL="${SUITE_HEALTH_URL:-https://iuk-ue.de/api/health/portal}"
if [ "$HEALTH_URL" = "aus" ]; then HEALTH_URL=""; fi
# Optionaler Sicherungslauf vor dem Austausch, als vollständiger Befehl. Leer = keiner.
BACKUP_CMD="${SUITE_BACKUP_CMD-}"

REPO_WURZEL="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_DATEI="$STACK_DIR/.env"
NEUES_IMAGE=""
RUECKWEG=""

melde() { printf '\n▸ %s\n' "$*"; }
warne() { printf '\n⚠ %s\n' "$*" >&2; }
abbruch() {
  printf '\n✖ ABBRUCH: %s\n' "$*" >&2
  exit 1
}

# ══ Schritt 0 — Voraussetzungen ══════════════════════════════════════════════════════
melde "Schritt 0: Voraussetzungen"
[ -d "$STACK_DIR" ] || abbruch "Stack-Verzeichnis $STACK_DIR existiert nicht."
[ -f "$STACK_DIR/compose.yaml" ] || abbruch "$STACK_DIR/compose.yaml fehlt."
[ -f "$ENV_DATEI" ] || abbruch "$ENV_DATEI fehlt — ohne sie startet die Suite ohne AUTH_SECRET."
[ -w "$ENV_DATEI" ] || abbruch "$ENV_DATEI ist für $(id -un) nicht schreibbar; der Rollout pinnt dort das Image."
command -v docker >/dev/null || abbruch "docker nicht im PATH."
docker compose version >/dev/null 2>&1 || abbruch "docker compose (v2) nicht verfügbar."
cd "$STACK_DIR"
echo "Stack:     $STACK_DIR"
echo "Erwartet:  $ERWARTET"
echo "Image:     $BASIS:$TAG"

# ══ Schritt 1 — Stack-Dateien müssen zum Repo passen ═════════════════════════════════
# Ein Image, das ein neues Volume oder ein neues Netz braucht, gegen eine alte
# `compose.yaml` ausgerollt, ergibt KEINE klare Fehlermeldung: das Modul `aufgaben` etwa
# schriebe seine Bildnachweise in das Container-Dateisystem statt in `aufgaben_data`, und
# clamd fände sie nie — sichtbar erst als dauerhaft `scan_status: 'fehler'`, Tage später.
# Deshalb Gleichstand als Vorbedingung, und Abbruch statt Überschreiben.
melde "Schritt 1: compose.yaml und clamd.files.conf gegen das Repo prüfen"
abweichung=0
for datei in compose.yaml clamd.files.conf; do
  if [ ! -f "$STACK_DIR/$datei" ]; then
    warne "$datei fehlt auf dem Server."
    abweichung=1
    continue
  fi
  if diff -u "$STACK_DIR/$datei" "$REPO_WURZEL/$datei" >/tmp/iuk-deploy-diff.$$ 2>&1; then
    echo "  $datei: identisch"
  else
    warne "$datei weicht ab (links Server, rechts Repo):"
    cat /tmp/iuk-deploy-diff.$$ >&2
    abweichung=1
  fi
  rm -f /tmp/iuk-deploy-diff.$$
done
if [ "$abweichung" -ne 0 ]; then
  abbruch "Stack-Dateien weichen ab. Sie werden BEWUSST nicht automatisch übernommen —
  eine Änderung an compose.yaml oder clamd.files.conf ist Runbook-Arbeit (Diff gegen die
  Server-Datei, Einträge in die .env retten, siehe docs/runbooks/auto-rollout.md Teil E).
  Danach diesen Job erneut laufen lassen."
fi

# ══ Schritt 2 — Image ziehen und die Revision prüfen, BEVOR etwas ausgetauscht wird ═══
# `docker pull` auf das TAG, nicht `docker compose pull`: in der .env kann bereits ein
# Digest gepinnt sein (vom letzten Lauf oder von einem Rollback) — `compose pull` zöge
# dann genau diesen alten Stand und der Rollout liefe ins Leere.
melde "Schritt 2: $BASIS:$TAG ziehen und prüfen"
docker pull "$BASIS:$TAG"

rev_label="$(docker image inspect "$BASIS:$TAG" \
  -f '{{ index .Config.Labels "org.opencontainers.image.revision" }}' 2>/dev/null || true)"
rev_env="$(docker image inspect "$BASIS:$TAG" \
  -f '{{ range .Config.Env }}{{ println . }}{{ end }}' 2>/dev/null | sed -n 's/^SUITE_REVISION=//p' || true)"
echo "  Label image.revision: ${rev_label:-<leer>}"
echo "  ENV SUITE_REVISION:   ${rev_env:-<leer>}"

if [ "$rev_label" != "$ERWARTET" ]; then
  abbruch "Das Tag :$TAG trägt Commit '${rev_label:-<leer>}', erwartet war '$ERWARTET'.
  Häufigster Grund: ein NEUERER main-Merge hat :$TAG inzwischen überschrieben — dann ist
  dieser Rollout überholt und der neuere Lauf erledigt ihn. Sonst: der merge-Job dieses
  Laufs ist nicht durchgelaufen. In beiden Fällen bleibt Produktion unberührt."
fi
if [ "$rev_env" != "$ERWARTET" ]; then
  abbruch "Das Image trägt das richtige Label, aber ENV SUITE_REVISION='${rev_env:-<leer>}'.
  Dann fehlt im build-Job das --build-arg SUITE_REVISION (Dockerfile, letzte Stage) — und
  ohne die Variable kann kein Rollout beweisen, welcher Stand läuft. Nicht ausrollen."
fi

NEUES_IMAGE="$(docker image inspect "$BASIS:$TAG" \
  -f '{{ range .RepoDigests }}{{ println . }}{{ end }}' | grep "^$BASIS@" | head -1 || true)"
[ -n "$NEUES_IMAGE" ] || abbruch "Kein RepoDigest für $BASIS:$TAG — ohne Digest gibt es nichts zu pinnen."
echo "  Digest: $NEUES_IMAGE"

# ══ Schritt 3 — Rückweg festhalten ═══════════════════════════════════════════════════
# Erst die gepinnte Zeile der .env (die ist die Wahrheit über den zuletzt ausgerollten
# Stand), sonst der Digest des laufenden Containers. `sed -n` liest GENAU diese eine
# Zeile — die .env trägt Geheimnisse und wird nie als Ganzes gelesen oder ausgegeben.
melde "Schritt 3: Rückweg bestimmen"
RUECKWEG="$(sed -n 's/^SUITE_IMAGE=//p' "$ENV_DATEI" | tail -1)"
if [ -z "$RUECKWEG" ]; then
  cid="$(docker compose ps -q suite 2>/dev/null || true)"
  if [ -n "$cid" ]; then
    bild="$(docker inspect -f '{{ .Image }}' "$cid" 2>/dev/null || true)"
    [ -n "$bild" ] && RUECKWEG="$(docker image inspect "$bild" \
      -f '{{ range .RepoDigests }}{{ println . }}{{ end }}' 2>/dev/null | grep "^$BASIS@" | head -1 || true)"
  fi
fi
if [ -n "$RUECKWEG" ]; then
  echo "  Rückweg: $RUECKWEG"
  if [ "$RUECKWEG" = "$NEUES_IMAGE" ]; then
    echo "  (identisch mit dem neuen Stand — dieser Rollout wiederholt sich)"
  fi
else
  # Kein Abbruch: beim allerersten Lauf gibt es zu Recht keinen. Aber laut sagen, denn
  # bis zum nächsten erfolgreichen Rollout ist der Rückweg von Hand zu gehen.
  warne "Kein vorheriger Digest bekannt (erster Rollout?). Bei einem Fehlschlag gibt es
  KEINEN automatischen Rollback — dann Teil D des Runbooks von Hand."
fi

# ══ Schritt 4 — optionale Sicherung ══════════════════════════════════════════════════
# Warum das hier steht und nicht im Runbook als Merksatz: der Image-Rollback in Schritt 9
# holt DATEN nicht zurück. Migrationen laufen beim Boot nach vorn; ein Stand, der eine
# Spalte umbenennt, ist mit dem alten Image nicht mehr lesbar.
melde "Schritt 4: Sicherung vor dem Austausch"
if [ -n "$BACKUP_CMD" ]; then
  bash -c "$BACKUP_CMD" || abbruch "Die Sicherung ist gescheitert. Kein Rollout ohne Sicherung."
  echo "  Sicherung gelaufen."
else
  warne "SUITE_BACKUP_CMD ist nicht gesetzt — es wird ohne frische Sicherung ausgerollt.
  Ein Image-Rollback holt keine Daten zurück (Migrationen laufen nur vorwärts)."
fi

# ══ Schritt 5 — Austausch ════════════════════════════════════════════════════════════
setze_pin() {
  # Nur die EINE Zeile anfassen, atomar tauschen, Rechte der Vorlage behalten.
  #
  # ⚠️ HIER WIRD DIE DATEI MIT DEN GEHEIMNISSEN NEU GESCHRIEBEN. Ein `grep … > tmp ||
  # true` wäre der bequeme Einzeiler und zugleich die gefährlichste Zeile des Skripts:
  # scheitert grep aus einem anderen Grund als „nichts gefunden" (Exit 2), steht in tmp
  # ein Rumpf — und `mv` machte daraus die neue `.env`. Der Stack liefe bis zum nächsten
  # Neustart weiter und wäre danach ohne AUTH_SECRET nicht mehr zu starten. Deshalb:
  # Exit-Code unterscheiden (1 = leer, ≥2 = Fehler) und die Zeilenzahl gegenprüfen.
  local wert="$1" tmp status zeilen_alt zeilen_neu
  tmp="$(mktemp "$ENV_DATEI.rollout.XXXXXX")"
  chmod --reference="$ENV_DATEI" "$tmp" 2>/dev/null || chmod 600 "$tmp"
  zeilen_alt="$(wc -l <"$ENV_DATEI")"
  set +e
  grep -v -e '^SUITE_IMAGE=' -e '^# von scripts/deploy.sh gesetzt' "$ENV_DATEI" >"$tmp"
  status=$?
  set -e
  if [ "$status" -ge 2 ]; then
    rm -f "$tmp"
    abbruch "Konnte $ENV_DATEI nicht lesen (grep Exit $status). Nichts geändert."
  fi
  {
    echo "# von scripts/deploy.sh gesetzt — der ausgerollte Stand (docs/runbooks/auto-rollout.md)"
    echo "SUITE_IMAGE=$wert"
  } >>"$tmp"
  zeilen_neu="$(wc -l <"$tmp")"
  # Entfernt werden höchstens zwei Zeilen (Marke + Pin), zwei kommen wieder dazu.
  if [ "$zeilen_neu" -lt "$((zeilen_alt - 2))" ]; then
    rm -f "$tmp"
    abbruch "Die neu geschriebene .env wäre kürzer als erwartet ($zeilen_neu statt ≥ $((zeilen_alt - 2)) Zeilen).
  Nichts geändert — das wäre der Verlust von Geheimnissen gewesen."
  fi
  mv "$tmp" "$ENV_DATEI"
}

warte_gesund() {
  local frist=$((SECONDS + FRIST)) cid zustand
  while [ "$SECONDS" -lt "$frist" ]; do
    cid="$(docker compose ps -q suite 2>/dev/null || true)"
    if [ -n "$cid" ]; then
      zustand="$(docker inspect -f '{{ if .State.Health }}{{ .State.Health.Status }}{{ else }}ohne-healthcheck{{ end }}' "$cid" 2>/dev/null || echo weg)"
      case "$zustand" in
        healthy) return 0 ;;
        # `unhealthy` erst NACH der start_period und nach `retries` Fehlversuchen —
        # währenddessen steht dort `starting`. Weiterwarten wäre also nur Zeitverlust.
        unhealthy) return 1 ;;
      esac
    fi
    sleep 5
  done
  return 1
}

melde "Schritt 5: Image pinnen und Stack neu starten"
setze_pin "$NEUES_IMAGE"
docker compose config >/dev/null || abbruch "docker compose config ist nach dem Pinnen ungültig — .env prüfen."
docker compose up -d

# ── Ab hier ist Produktion angefasst: jeder Fehlschlag geht über zurueck_und_raus ──────
zurueck_und_raus() {
  local grund="$1"
  warne "$grund"
  if [ -z "$RUECKWEG" ]; then
    abbruch "$grund — und es ist KEIN Rückweg bekannt. Der Stack läuft auf $NEUES_IMAGE.
  Von Hand: Teil D des Runbooks (docs/runbooks/auto-rollout.md)."
  fi
  melde "ROLLBACK auf $RUECKWEG"
  setze_pin "$RUECKWEG"
  docker compose up -d
  if warte_gesund; then
    abbruch "$grund — Rollback auf $RUECKWEG gelaufen, der Stack ist wieder healthy.
  Der Fehler steckt im ausgerollten Stand, nicht im Server."
  fi
  # ⚠️ KEINE UNESCAPTEN BACKTICKS IN DIESEN MELDUNGEN. In einer doppelt gequoteten
  # Zeichenkette ist ein Backtick-Paar für bash eine KOMMANDOSUBSTITUTION: aus dem
  # Hinweis „erster Blick ist `docker compose ps clamav`" wurde beim Probelauf am
  # 16.08.2026 die Ausgabe genau dieses Befehls mitten im Fehlertext — die Meldung, auf
  # die man sich im schlimmsten Fall verlässt, war damit unlesbar. `scripts/deploy.test.ts`
  # riegelt das ab; in Kommentarzeilen (wie dieser hier) sind Backticks unschädlich.
  abbruch "$grund — UND DER ROLLBACK IST EBENFALLS NICHT GESUND GEWORDEN.
  Das ist kein Image-Problem mehr: erster Blick ist \"docker compose ps clamav\"
  (die Suite startet wegen depends_on nicht ohne ihn), dann \"docker compose logs suite\"."
}

# ══ Schritt 6 — auf `healthy` warten ═════════════════════════════════════════════════
melde "Schritt 6: auf healthy warten (bis zu ${FRIST}s)"
warte_gesund || zurueck_und_raus "Die Suite ist nicht healthy geworden."
echo "  healthy."

# ══ Schritt 7 — Beweis: antwortet WIRKLICH der neue Commit? ══════════════════════════
melde "Schritt 7: Revision der laufenden Instanz prüfen"
antwort="$(docker compose exec -T suite wget -qO- http://127.0.0.1:3000/api/health/portal 2>/dev/null || true)"
rev_live="$(printf '%s' "$antwort" | sed -n 's/.*"revision":"\([^"]*\)".*/\1/p')"
echo "  Antwort: ${antwort:-<leer>}"
[ -n "$rev_live" ] || zurueck_und_raus "In /api/health/portal steht kein Feld \`revision\`.
  Entweder läuft ein Stand von VOR dieser Änderung, oder der Health-Abruf ist gescheitert."
[ "$rev_live" = "$ERWARTET" ] || zurueck_und_raus "Die laufende Instanz meldet '$rev_live', erwartet war '$ERWARTET'."
echo "  Revision stimmt."

# ══ Schritt 8 — öffentliche Gegenprobe über Traefik ══════════════════════════════════
# BEWUSST NUR EINE WARNUNG, kein Rollback: Schritt 7 hat den Container bereits bewiesen.
# Was hier scheitern kann, ist der WEG dorthin (Traefik hat den neuen Container nicht
# übernommen, DNS/Hairpin vom Server auf die eigene öffentliche Domain, TLS) — und einen
# Routing-Fehler behebt ein Image-Rollback nicht, er verlängerte nur die Störung.
melde "Schritt 8: öffentliche Gegenprobe"
if [ -n "$HEALTH_URL" ]; then
  oeffentlich="$(curl -fsS --max-time 15 "$HEALTH_URL" 2>/dev/null || true)"
  rev_oeffentlich="$(printf '%s' "$oeffentlich" | sed -n 's/.*"revision":"\([^"]*\)".*/\1/p')"
  if [ "$rev_oeffentlich" = "$ERWARTET" ]; then
    echo "  $HEALTH_URL meldet $rev_oeffentlich."
  else
    warne "$HEALTH_URL meldet '${rev_oeffentlich:-<keine Antwort>}' statt '$ERWARTET'.
  Der Container ist nachweislich der richtige (Schritt 7) — geprüft wird also Traefik
  bzw. der Weg vom Server zur eigenen Domain, nicht der Rollout. Runbook Teil E."
  fi
else
  echo "  übersprungen (SUITE_HEALTH_URL leer)."
fi

# ══ Schritt 9 — Ergebnis ═════════════════════════════════════════════════════════════
melde "Rollout abgeschlossen: $ERWARTET läuft."
if [ -n "${GITHUB_STEP_SUMMARY:-}" ]; then
  {
    echo "### Rollout auf den Server"
    echo
    echo "| | |"
    echo "|---|---|"
    echo "| Commit | \`$ERWARTET\` |"
    echo "| Image | \`$NEUES_IMAGE\` |"
    echo "| Rückweg | \`${RUECKWEG:-— (erster Rollout)}\` |"
    echo "| Stack | \`$STACK_DIR\` |"
    echo
    echo "Rollback: \`SUITE_IMAGE\` in der \`.env\` auf den Rückweg setzen und"
    echo "\`docker compose up -d\` — siehe \`docs/runbooks/auto-rollout.md\`, Teil D."
  } >>"$GITHUB_STEP_SUMMARY"
fi
