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
#     Eine Ausnahme endet grün statt rot: liegt auf dem Tag BEWEISBAR ein Nachfolger
#     des erwarteten Commits, ist dieser Lauf überholt und der neuere erledigt den
#     Rollout (Schritt 2) — auch dann wird nichts angefasst.
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
# Seit DRK-185 ist der empfohlene Wert der Sidecar selbst, und er braucht keine Host-Pfade
# mehr (die Volumes sind in seinem Container schon an der richtigen Stelle gemountet):
#   SUITE_BACKUP_CMD=docker compose run --rm backup /bin/sh /opt/backup/backup-sidecar.sh einmal
# `run --rm` und nicht `exec`: der Dienst soll auch dann sichern, wenn sein Container gerade
# nicht laeuft — und genau das ist bei einem gescheiterten Rollout der wahrscheinliche Fall.
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
melde "Schritt 1: Stack-Dateien gegen das Repo pruefen"
abweichung=0
# ⚠️ SEIT DRK-185 SIND ES VIER, NICHT ZWEI. Der Backup-Sidecar reicht `backup.sh` und
# `backup-sidecar.sh` per Bind-Mount in seinen Container — sie liegen damit auf dem
# Server und sind dieselbe Art Datei wie `clamd.files.conf`. Ohne den Vergleich driftet
# die Server-Fassung von der getesteten weg, und das sieht niemand: das Repo am
# wenigsten, und der Sidecar meldet sich erst, wenn eine Sicherung gebraucht wird.
for datei in compose.yaml clamd.files.conf scripts/backup.sh scripts/backup-sidecar.sh; do
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
  eine Änderung an compose.yaml, clamd.files.conf oder den beiden Backup-Skripten ist
  Runbook-Arbeit (Diff gegen die Server-Datei, Einträge in die .env retten, siehe
  docs/runbooks/auto-rollout.md Teil E; für die Backup-Skripte zusätzlich
  docs/runbooks/backup-sidecar.md). Danach diesen Job erneut laufen lassen."
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
  # ── Überholt statt kaputt? ───────────────────────────────────────────────────────────
  # Der häufigste Grund für diese Abweichung ist KEIN Fehler dieses Laufs: der Deploy
  # wartet auf seine Freigabe, und währenddessen überschreibt ein NEUERER main-Merge das
  # Tag (gemessen am 2026-08-28, Lauf 33179101270: erwartet 6fdee090, auf :latest lag
  # bereits e04ba803 aus PR #85 — jede Freigabe eines älteren Laufs war damit rot, und
  # erst der jeweils neueste wurde grün). Diesen Fall grün zu beenden ist ehrlich —
  # ausgerollt wird nichts, und den Rollout erledigt der Lauf des neueren Merges — aber
  # nur mit BEWEIS statt Vermutung: der Stand auf dem Tag muss ein voller Commit-SHA und
  # in der Historie ein NACHFOLGER des erwarteten Commits sein (merge-base --is-ancestor;
  # dafür zieht der Checkout des deploy-Jobs die volle Historie, fetch-depth: 0, und hier
  # wird origin/main nachgeholt, weil der Checkout auf dem Commit DIESES Laufs steht).
  # Alles andere — leeres Label, unbekannter Commit, abgeschnittene Historie, ein nicht
  # gelaufener merge-Job — bleibt ein roter Abbruch wie bisher.
  if printf '%s' "$rev_label" | grep -qE '^[0-9a-f]{40}$' \
    && git -C "$REPO_WURZEL" rev-parse --git-dir >/dev/null 2>&1 \
    && { git -C "$REPO_WURZEL" fetch --quiet origin main 2>/dev/null || true; } \
    && git -C "$REPO_WURZEL" cat-file -e "$rev_label" 2>/dev/null \
    && git -C "$REPO_WURZEL" merge-base --is-ancestor "$ERWARTET" "$rev_label" 2>/dev/null; then
    melde "ÜBERHOLT: :$TAG trägt bereits den NEUEREN main-Commit $rev_label."
    echo "  Diesen Stand rollt der Lauf des neueren Merges aus — hier gibt es nichts zu tun."
    echo "  Produktion ist unberührt."
    if [ -n "${GITHUB_STEP_SUMMARY:-}" ]; then
      {
        echo "### Rollout übersprungen — überholt"
        echo
        echo "\`:$TAG\` trägt bereits \`$rev_label\` — einen Nachfolger von \`$ERWARTET\`."
        echo "Den Rollout erledigt der Lauf des neueren Merges; Produktion ist unberührt."
      } >>"$GITHUB_STEP_SUMMARY"
    fi
    exit 0
  fi
  abbruch "Das Tag :$TAG trägt Commit '${rev_label:-<leer>}', erwartet war '$ERWARTET' —
  und das ist NICHT als überholter Lauf beweisbar (dafür müsste der Stand auf dem Tag ein
  Nachfolger des erwarteten Commits in der Historie sein). Wahrscheinlichster Grund: der
  merge-Job dieses Laufs ist nicht durchgelaufen — dort ins Protokoll schauen. Produktion
  bleibt unberührt."
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

# Filtert einen Log-Strom, bevor er ins Protokoll des Laufs geht: jeder Wert aus der
# Server-.env wird zu ***, ebenso Zugangsdaten in einer URL (://nutzer:pass@).
#
# ⚠️ DAS PROTOKOLL IST ÖFFENTLICH, das Repo ist es auch. GitHub maskiert nur, was es als
# Secret kennt, und AUTH_SECRET, POCKET_ID_CLIENT_SECRET oder eine BACKUP_PING_URL aus
# der Server-Datei kennt es nicht. Deshalb schwärzt der Filter ALLE Werte der .env und
# nicht nur die mit „geheim" klingendem Namen: eine Namensliste übersähe genau die URL
# mit dem Token darin. Der Preis ist bewusst gezahlt — ein Hostname aus SUITE_HOST_*
# steht im Auszug dann als ***, der NAME der Variable aber bleibt lesbar, und der ist
# es, den die Boot-Prüfungen melden („SUITE_HOST_… passt zu keinem Modul").
#
# Ausgenommen sind Werte unter 8 Zeichen (true, 0, 3000 schwärzten sonst jede zweite
# Zeile, und so kurz ist kein Geheimnis dieser Datei) und SUITE_IMAGE, das dieses Skript
# selbst setzt und oben schon ausgibt. Gegen einen Wert, den die Anwendung umkodiert
# ausgibt (JSON-escaped, URL-kodiert), hilft der Filter nicht — deshalb zeigt ihn nur
# der Fall, in dem der Container keinen Verkehr hatte (siehe zeige_suite_log).
#
# Kann awk die .env nicht lesen, kommt KEIN Log durch: ungeschwärzt ist schlechter als
# gar nicht. Nur index/substr, kein gensub — auf dem Server kann mawk stehen.
schwaerze() {
  awk -v env_datei="$ENV_DATEI" '
    function merke(w) { if (length(w) >= 8) geheim[++n] = w }
    BEGIN {
      q = sprintf("%c", 39)
      while ((r = (getline zeile < env_datei)) > 0) {
        sub(/\r$/, "", zeile)
        if (zeile ~ /^[[:space:]]*(#|$)/) continue
        sub(/^[[:space:]]*export[[:space:]]+/, "", zeile)
        p = index(zeile, "=")
        if (p == 0) continue
        name = substr(zeile, 1, p - 1)
        gsub(/[[:space:]]/, "", name)
        if (name == "SUITE_IMAGE") continue
        roh = substr(zeile, p + 1)
        merke(roh)
        w = roh
        sub(/^[[:space:]]+/, "", w)
        sub(/[[:space:]]+$/, "", w)
        erstes = substr(w, 1, 1)
        if (length(w) >= 2 && (erstes == "\"" || erstes == q) && substr(w, length(w), 1) == erstes) {
          w = substr(w, 2, length(w) - 2)
        } else {
          sub(/[[:space:]]+#.*$/, "", w)
        }
        if (w != roh) merke(w)
      }
      if (r < 0) {
        print "  (kein Auszug: " env_datei " ist nicht lesbar, und ungeschwärzt geht nichts ins Protokoll)"
        exit 2
      }
      # Längste zuerst: steckt ein Wert in einem anderen, bliebe sonst ein Rest stehen.
      for (i = 2; i <= n; i++) {
        v = geheim[i]
        for (j = i - 1; j >= 1 && length(geheim[j]) < length(v); j--) geheim[j + 1] = geheim[j]
        geheim[j + 1] = v
      }
    }
    {
      zeile = $0
      for (i = 1; i <= n; i++) {
        aus = ""
        while ((p = index(zeile, geheim[i])) > 0) {
          aus = aus substr(zeile, 1, p - 1) "***"
          zeile = substr(zeile, p + length(geheim[i]))
        }
        zeile = aus zeile
      }
      gsub(/:\/\/[^\/@[:space:]]+@/, "://***@", zeile)
      print zeile
    }'
}

# Schreibt ins Protokoll, WARUM die Suite nicht hochkommt — BEVOR der Rollback den
# Container ersetzt, denn mit ihm verschwindet sein Log. Ohne das stand im Lauf nur „nicht
# healthy geworden", und die Ursache (etwa „Ungültige Host-Konfiguration") lag allein im
# Container-Log auf dem Server (DRK-467, Lauf 35843699990).
#
# ⚠️ NUR NACH SCHRITT 6, NICHT NACH SCHRITT 7. Ein Container, der nie healthy war, hatte
# keinen Verkehr: Traefik übergeht Container, deren Healthcheck nicht healthy meldet, und
# das Log beginnt mit dem Austausch in Schritt 5 — im Auszug stehen also Startmeldungen
# und die Anfragen des Healthchecks, keine Nutzer. Nach Schritt 7 dagegen war er healthy
# und öffentlich erreichbar; sein Log kann Namen und Adressen tragen, und die gehören
# nicht in ein öffentliches Protokoll.
#
# `ps -a` zuerst, weil der häufigste Grund gar nicht im Suite-Log steht: ein clamav, der
# nicht healthy wird, hält die Suite per depends_on zurück (Runbook E5).
LOG_ZEILEN=80
zeige_suite_log() {
  melde "Auszug für die Fehlersuche ($1) — Werte aus der .env geschwärzt"
  echo "  docker compose ps -a:"
  { docker compose ps -a 2>&1 || true; } | schwaerze || true
  echo
  echo "  docker compose logs suite, letzte $LOG_ZEILEN Zeilen:"
  { docker compose logs --no-color --timestamps --tail="$LOG_ZEILEN" suite 2>&1 || true; } | schwaerze || true
  echo "  (Ende des Auszugs)"
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

# ⚠️ EIN GEÄNDERTES BIND-MOUNT-SKRIPT ERREICHT DEN LAUFENDEN DIENST NICHT. `docker
# compose up -d` tauscht einen Container aus, wenn sich sein IMAGE oder seine
# KONFIGURATION geändert hat; der Inhalt einer Datei hinter einem unveränderten Mount-Pfad
# ist beides nicht. Der Sidecar läuft aber als ein einziger `sh`-Prozess über Wochen
# (`command: [… "dienst"]`), und der hat seine Funktionen beim Start gelesen.
#
# GEMESSEN an einem Skript, das im Sekundentakt eine Zeile schreibt und dabei ausgetauscht
# wurde: der laufende Prozess gab sechsmal die ALTE Fassung aus, ein neu gestarteter sofort
# die neue. Schritt 1 meldet die Datei dabei als „identisch" — sie IST es ja —, und genau
# das ist die Falle: der Rollout sagt „aktuell", und nachts läuft der alte Stand.
#
# ⚠️ FÜR `backup.sh` GILT DAS NICHT, und der Unterschied ist tragend: das startet der
# Sidecar je Lauf als eigenen Prozess (`bash "$BACKUP_SKRIPT"`), liest also jedes Mal neu.
# Nur `backup-sidecar.sh` selbst braucht den Neustart — geprüft werden trotzdem beide,
# weil die Unterscheidung hier niemand im Kopf haben soll.
#
# ⚠️ ctime, NICHT mtime: `cp -p`, `install -p` und `rsync -a` erhalten die mtime, und dann
# wäre eine frisch kopierte Datei „älter" als der Container. Die ctime setzt der Kern beim
# Schreiben, sie lässt sich nicht erhalten. Ist die Startzeit nicht zu lesen, wird
# neugestartet — lieber einmal zu viel als eine Nacht auf dem alten Stand.
# Wartet, bis der backup-Dienst sich gesund meldet.
#
# ⚠️ EIN `up -d` MELDET „GESTARTET", NICHT „LAEUFT". Der Sidecar holt seine Werkzeuge zur
# Laufzeit per `apk add` — schweigt der Paketspiegel, bricht der Vorlauf ab, und
# `restart: unless-stopped` macht daraus eine Neustartschleife. `up -d` ist da längst
# erfolgreich zurückgekehrt, der Rollout meldete „abgeschlossen", und ohne konfigurierten
# Ping fällt es erst auf, wenn jemand von sich aus nach Docker sieht — also frühestens,
# wenn die Sicherung der nächsten Nacht fehlt.
#
# Rückgabe: 0 gesund (oder laufend ohne Healthcheck) · 1 weg oder in der Neustartschleife
# · 2 nach der Frist immer noch im Anlauf. Drei Ausgänge, weil sie drei verschiedene
# Handgriffe bedeuten — ein gemeinsames „nicht gesund" verschenkte genau die Auskunft.
backup_wird_gesund() {
  local frist="$1" ende cid lage gesund
  # ⚠️ ERST PRÜFEN, DANN RECHNEN — und die beiden Fehlfälle gehen GEGENLÄUFIG
  # auseinander, beide unter `set -euo pipefail` gemessen:
  #
  #   SUITE_BACKUP_GESUND_FRIST=abc  → `abc: unbound variable`, EXIT 1. Das Skript stirbt
  #     hier, also HINTER dem in Schritt 7 bewiesenen Rollout: Schritt 9 wird nie
  #     erreicht, und ein erfolgreicher Rollout meldet sich als gescheiterter Job.
  #   SUITE_BACKUP_GESUND_FRIST=08   → `value too great for base` (führende Null ist
  #     OKTAL), das Skript läuft WEITER, aber `ende` bleibt leer und die Warterei ist
  #     still kaputt — ein langsamer Dienst gälte sofort als „noch im Anlauf".
  #
  # Dieselbe Klasse wie im Sidecar (dort `entnullen` plus Ziffernprüfung), und dieselbe
  # Reihenfolge: Ziffern, dann Länge, dann Wert. Eine Obergrenze steht dabei nicht gegen
  # den Überlauf, sondern gegen den Unsinn: ein Rollout, der eine Stunde auf den
  # Backup-Dienst wartet, hat den Job längst verfehlt.
  case "$frist" in
    '' | *[!0-9]*)
      warne "SUITE_BACKUP_GESUND_FRIST=\"$frist\" ist keine Zahl — es gelten 120s."
      frist=120
      ;;
  esac
  # ⚠️ ERST DIE NULLEN WEG, DANN DIE LÄNGE MESSEN — sonst meldet `00120` „zu gross",
  # obwohl 120 gemeint und gültig ist (gemessen). Das letzte Zeichen bleibt stehen,
  # damit aus `000` eine `0` wird und keine leere Zeichenkette.
  while [ "${frist#0}" != "$frist" ] && [ "${#frist}" -gt 1 ]; do frist="${frist#0}"; done
  # Danach steht keine führende Null mehr da, und die Arithmetik liest nicht mehr oktal.
  if [ "${#frist}" -gt 4 ]; then
    warne "SUITE_BACKUP_GESUND_FRIST=\"$frist\" ist zu gross — es gelten 120s."
    frist=120
  fi
  if [ "$frist" -gt 3600 ]; then
    warne "SUITE_BACKUP_GESUND_FRIST=$frist ist groesser als 3600 — es gelten 3600s."
    frist=3600
  fi
  ende=$(( $(date +%s) + frist ))
  while :; do
    # `-a` aus demselben Grund wie in Schritt 8b: ein Container, der waehrend des
    # Wartens STIRBT, soll als `exited` gelesen werden und nicht als „gar nicht da".
    cid="$(docker compose ps -q -a backup 2>/dev/null || true)"
    [ -n "$cid" ] || return 1
    lage="$(docker inspect -f '{{.State.Status}}' "$cid" 2>/dev/null || echo "")"
    # `{{if .State.Health}}`: ohne Healthcheck gibt es den Block gar nicht, und ein
    # blindes `.State.Health.Status` wäre dann ein Fehler statt einer Auskunft.
    gesund="$(docker inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{else}}ohne{{end}}' "$cid" 2>/dev/null || echo "")"
    case "$gesund" in
      healthy) return 0 ;;
      # Ohne Healthcheck ist „läuft" alles, was sich feststellen lässt.
      ohne) [ "$lage" = "running" ] && return 0 ;;
    esac
    case "$lage" in restarting | exited | dead) return 1 ;; esac
    [ "$(date +%s)" -lt "$ende" ] || return 2
    sleep 5
  done
}

backup_skripte_neuer_als() {
  local seit="$1" datei zeit
  for datei in scripts/backup.sh scripts/backup-sidecar.sh; do
    zeit="$(stat -c %Z "$STACK_DIR/$datei" 2>/dev/null || echo 0)"
    # ⚠️ `-ge`, NICHT `-gt`: bei GLEICHER Sekunde ist die Reihenfolge nicht mehr
    # feststellbar. Beide Zahlen sind auf Sekunden gerundet (gemessen: StartedAt
    # `…00.000000001Z` und `…00.999999999Z` ergeben ueber `date +%s` dieselbe Zahl) —
    # „Skript kurz VOR dem Start geschrieben" (Container hat es) und „kurz DANACH"
    # (Container hat es nicht) sind darin dasselbe Zahlenpaar. Das ist keine knapp
    # falsche Rechnung, sondern eine Frage, die diese Daten nicht beantworten; es
    # bleibt die Wahl, wohin man irrt — und die ist im Kopf dieser Funktion schon
    # getroffen: lieber einmal zu viel als eine Nacht auf dem alten Stand.
    if [ "$zeit" -ge "$seit" ]; then
      echo "  $datei ist nicht älter als der laufende backup-Container."
      return 0
    fi
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
  # Auch der alte Stand war nie healthy, hatte also ebenso keinen Verkehr (zeige_suite_log).
  zeige_suite_log "Rollback $RUECKWEG"
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
if ! warte_gesund; then
  zeige_suite_log "neuer Stand $NEUES_IMAGE"
  zurueck_und_raus "Die Suite ist nicht healthy geworden. Ihre letzten Logzeilen stehen oben."
fi
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
# Nur zur Auskunft, kein Prüfschritt: der Beweis ist die Revision (je Commit eindeutig),
# die Nummer ist ihre lesbare Form (docs/runbooks/versionierung.md). Ein Stand von VOR
# der Versionierung liefert das Feld gar nicht — deshalb kein Abbruch bei leer.
VERSION_LIVE="$(printf '%s' "$antwort" | sed -n 's/.*"version":"\([^"]*\)".*/\1/p')"
echo "  Version: ${VERSION_LIVE:-<kein Feld>}"

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

# ══ Schritt 8b — den Backup-Sidecar nachziehen ═══════════════════════════════════════
# ⚠️ ER STEHT HIER UND NICHT IN SCHRITT 5, und das ist die Lehre aus einem Befund: dort
# läge er in dem Fenster, in dem Produktion schon angefasst ist, `zurueck_und_raus` aber
# noch nicht definiert. Ein Docker-Fehler beim Austausch beendete das Skript per `set -e`
# — und eine ungeprüfte Fassung liefe weiter, ohne dass der festgehaltene Rückweg je
# gegangen wird. Hier ist der Rollout bewiesen (Schritt 7), und der Rückweg existiert.
#
# ⚠️ UND ER ROLLT NICHTS ZURÜCK, dieselbe Abwägung wie in Schritt 8: der Backup-Dienst
# hat in KEINE Richtung ein depends_on; ein Image-Rollback machte einen Docker-Fehler an
# ihm nicht besser, er verlängerte nur die Störung. Laut ist er trotzdem — sonst sichert
# der Sidecar still nach dem alten Skript, und genau das ist der Fund, dessentwegen es
# diesen Schritt überhaupt gibt.
#
# Gefragt wird erst hier, weil `docker compose up -d` in Schritt 5 den Container ohnehin
# ausgetauscht haben kann (geänderte .env, geänderte compose.yaml): dann ist seine
# Startzeit jünger als jedes Skript, und es bleibt beim einen Austausch.
melde "Schritt 8b: Backup-Sidecar gegen die Skripte pruefen"
# ⚠️ `-a`, SONST IST EIN GESTOPPTER CONTAINER DASSELBE WIE GAR KEINER. `docker compose
# ps -q` zeigt nur LAUFENDE; ein abgestürzter oder von Hand gestoppter Sidecar liefert
# damit eine leere Antwort, und der Rollout las das als „nichts auszutauschen" und
# meldete Erfolg — obwohl es bis auf Weiteres keine nächtliche Sicherung gibt. Mit `-a`
# findet die Abfrage ihn, `backup_wird_gesund` liest seinen Zustand (`exited`) und sagt
# es laut. Das ist zugleich die Rücknahme einer eigenen Entscheidung: der leere Fall war
# bewusst still, weil „ein Stack ohne diesen Dienst soll nicht bei jedem Rollout warnen"
# — nur ist der leere Fall JETZT ein anderer.
backup_cid="$(docker compose ps -q -a backup 2>/dev/null || true)"
if [ -z "$backup_cid" ]; then
  # ⚠️ UND DAS IST KEINE HARMLOSE AUSKUNFT MEHR: nach `-a` heisst leer, dass es GAR
  # KEINEN Container gibt, auch keinen gestoppten — obwohl Schritt 1 die `compose.yaml`
  # des Servers byteweise gegen die des Repos geprüft hat (dort steht der Dienst) und
  # Schritt 5 den Stack hochgefahren hat. Dann ist etwas anderes kaputt als ein Skript.
  warne "Der Dienst backup hat gar keinen Container — auch keinen gestoppten. Die Suite
  läuft und ist geprüft, dieser Rollout wird deshalb nicht zurückgerollt; es gibt aber
  bis auf Weiteres KEINE naechtliche Sicherung.
  Nachsehen: docker compose ps -a backup && docker compose up -d backup"
else
  gestartet="$(docker inspect -f '{{.State.StartedAt}}' "$backup_cid" 2>/dev/null || true)"
  seit="$(date -d "${gestartet:-@0}" +%s 2>/dev/null || echo 0)"
  if backup_skripte_neuer_als "$seit"; then
    melde "Backup-Sidecar austauschen — er liest sein Skript nur beim Start"
    # ⚠️ KEINE UNESCAPTEN BACKTICKS IN DIESEN MELDUNGEN (siehe setze_pin).
    docker compose up -d --force-recreate backup || warne "Der Austausch des Dienstes
  backup ist gescheitert. Die Suite läuft und ist geprüft — der Sidecar sichert aber bis
  zu einem Neustart nach dem ALTEN Skript. Von Hand nachholen:
  docker compose up -d --force-recreate backup"
  else
    echo "  beide Skripte sind älter als der laufende Container — kein Austausch nötig."
  fi

  # ⚠️ UND JETZT GEFRAGT, OB ER LAEUFT — UNABHAENGIG DAVON, OB DIESER SCHRITT IHN
  # AUSGETAUSCHT HAT. Das ist die Lehre aus einem Befund: stand der Austausch im `if`,
  # blieb ausgerechnet der wahrscheinlichste Fall ungeprueft. SCHRITT 5 (`docker compose
  # up -d`) erzeugt den Container naemlich selbst neu, sobald sich Image oder
  # Konfiguration geaendert haben — beim ERSTEN Rollout dieses Features und nach jeder
  # backup-bezogenen Aenderung in der `.env`. Danach ist seine Startzeit juenger als
  # beide Skripte, `backup_skripte_neuer_als` ist falsch, und die einzige Stelle, die
  # gewartet haette, wurde uebersprungen: ein scheiterndes `apk add` haette den frischen
  # Dienst in die Neustartschleife geschickt, waehrend der Rollout Erfolg meldet.
  #
  # Die Frage kostet im Regelfall einen `docker inspect` — ein Dienst, der seit Wochen
  # laeuft, antwortet sofort mit `healthy`.
  # 120s: das `apk add` der sieben Pakete braucht gemessen Sekunden, die Anlaufspanne des
  # Healthchecks sind 5 Minuten. Wer den Rollout nicht so lange aufhalten will, setzt
  # SUITE_BACKUP_GESUND_FRIST.
  echo "  auf den Healthcheck des backup-Dienstes warten …"
  lage_backup=0
  backup_wird_gesund "${SUITE_BACKUP_GESUND_FRIST:-120}" || lage_backup=$?
  case "$lage_backup" in
    0) echo "  backup meldet sich gesund." ;;
    2) warne "Der Dienst backup ist nach der Frist immer noch im Anlauf. Das kann an
  einem langsamen Paketspiegel liegen und sich von selbst geben — nachsehen:
  docker compose ps backup && docker compose logs --tail=50 backup" ;;
    *) warne "Der Dienst backup laeuft NICHT — gestoppt, abgestuerzt oder in der
  Neustartschleife. Die Suite läuft und ist geprüft, dieser Rollout wird deshalb nicht
  zurückgerollt; es gibt aber bis auf Weiteres KEINE naechtliche Sicherung.
  Ursache ablesen: docker compose logs --tail=50 backup" ;;
  esac
fi

# ══ Schritt 9 — Ergebnis ═════════════════════════════════════════════════════════════
melde "Rollout abgeschlossen: $ERWARTET läuft."
if [ -n "${GITHUB_STEP_SUMMARY:-}" ]; then
  {
    echo "### Rollout auf den Server"
    echo
    echo "| | |"
    echo "|---|---|"
    echo "| Version | \`${VERSION_LIVE:-—}\` |"
    echo "| Commit | \`$ERWARTET\` |"
    echo "| Image | \`$NEUES_IMAGE\` |"
    echo "| Rückweg | \`${RUECKWEG:-— (erster Rollout)}\` |"
    echo "| Stack | \`$STACK_DIR\` |"
    echo
    echo "Rollback: \`SUITE_IMAGE\` in der \`.env\` auf den Rückweg setzen und"
    echo "\`docker compose up -d\` — siehe \`docs/runbooks/auto-rollout.md\`, Teil D."
  } >>"$GITHUB_STEP_SUMMARY"
fi
