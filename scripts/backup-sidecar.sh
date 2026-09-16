#!/bin/sh
#
# Zeitgeber, externes Ziel und Rueckmeldung fuer `scripts/backup.sh`.
#
# Laeuft als Dienst `backup` im Compose-Stack (siehe `compose.yaml`) und loest damit den
# Host-Cron ab. Runbook mit Einrichtung, rclone-Konfiguration, Verifikation und
# Wiederherstellung: `docs/runbooks/backup-sidecar.md`.
#
# Betriebsarten — die beiden von aussen gerufenen zuerst:
#   dienst    Der Dauerbetrieb: Vorlauf, dann die Schleife. Das `command` des Dienstes.
#   einmal    Ein Lauf, dann Ende. Exit-Code ist der des Laufs. Fuer `SUITE_BACKUP_CMD`
#             im Rollout und fuer den Probelauf des Runbooks.
#   zustand   Liest die Zustandsdatei und faellt bei Fehlschlag ODER Ueberfaelligkeit
#             mit Exit 1. Das ist der Healthcheck — er braucht keinen Vorlauf, weil er
#             nur eine Datei liest.
#   schleife / lauf   Die Rueckseite von `dienst` bzw. `einmal`, nach dem Rechteabbau.
#             Der Vorlauf ruft sie per su-exec; von Hand ruft man sie nicht.
#
# ⚠️ `einmal` BRAUCHT DEN VORLAUF GENAUSO WIE `dienst`, und das ist nicht offensichtlich:
# der dokumentierte Weg ist `docker compose run --rm backup … einmal`, und `run` erzeugt
# einen FRISCHEN Container aus dem nackten alpine-Image — dort gibt es kein `bash`, kein
# `sqlite3` und kein `rclone`. (`run` und nicht `exec`, weil bei einem gescheiterten
# Rollout der Dienst womoeglich gerade nicht laeuft und trotzdem gesichert werden muss.)
#
# ─────────────────────────────────────────────────────────────────────────────────────
# ⚠️ DIESE DATEI IST POSIX-sh, NICHT BASH — und das ist kein Stil, sondern Reihenfolge.
# Sie ist der ERSTE Befehl im Container und laeuft, BEVOR `apk add bash` durch ist; ihr
# Interpreter ist also busybox ash. Wer hier ein Array, ein `[[ ]]` oder ein
# `${x^^}` einbaut, bekommt keinen sauberen Fehler an der Zeile, sondern einen
# Parserfehler beim Einlesen — und weil `restart: unless-stopped` daran haengt, eine
# Neustartschleife statt eines Backups. `scripts/backup.sh` selbst BLEIBT bash (es
# benutzt Arrays und `shopt`) und wird ausdruecklich mit `bash …` gerufen.
#
# ⚠️ AUCH `set -o pipefail` GEHOERT NICHT HIERHER, so naheliegend es in `lauf()` waere.
# busybox ash kann es zwar seit 1.29, dash NICHT — und dash ist auf einem Debian-Host das
# `/bin/sh`, mit dem jemand diese Datei von Hand aufruft. GEMESSEN, nicht vermutet:
# `set: Illegal option -o pipefail`, Exit 2 — und zwar fuer JEDE Betriebsart, auch fuer
# `zustand`. Der Healthcheck haette also dauerhaft rot gestanden, mit einer Meldung ueber
# eine Shell-Option statt ueber das Backup. `lauf()` holt den Status von `backup.sh`
# deshalb ueber eine Statusdatei aus der Pipe: drei Zeilen laenger und ueberall richtig.
# ─────────────────────────────────────────────────────────────────────────────────────
set -eu

# ══ Konfiguration ════════════════════════════════════════════════════════════════════
# Der Kern bleibt `scripts/backup.sh`. Diese Datei ruft es, sie ersetzt es nicht —
# DATA_DIR, BACKUP_DIR, BLOB_DIR und BACKUP_KEEP liest weiterhin JENES Skript aus der
# Umgebung, hier steht kein Zweitwert dafuer.
BACKUP_SKRIPT="${BACKUP_SKRIPT:-/opt/backup/backup.sh}"
BACKUP_DIR="${BACKUP_DIR:-/backups}"

# Uhrzeit des taeglichen Laufs, `HH:MM` in der Zeitzone des Containers ($TZ).
BACKUP_UHRZEIT="${BACKUP_UHRZEIT:-03:30}"
# Einen Lauf gleich beim Start, statt bis zur naechsten Uhrzeit zu warten. Vorgabe aus,
# denn `up -d` waere sonst jedes Mal auch ein Backup — bei einem Rollout also mitten im
# Austausch, und beim dritten Neustartversuch eines kaputten Stacks ein drittes Mal.
BACKUP_BEIM_START="${BACKUP_BEIM_START:-0}"

# Externes Ziel, als rclone-Pfad (`fern:eimer/pfad`). LEER = nur lokal, und dann sagt
# der Start das laut: ein Backup neben den Daten ueberlebt den Verlust des Servers nicht.
BACKUP_RCLONE_ZIEL="${BACKUP_RCLONE_ZIEL:-}"
# Generationen am ZIEL. `aus` = nie etwas loeschen (dann waechst das Ziel unbegrenzt und
# laeuft irgendwann voll — was das Backup genau dann scheitern laesst, wenn man es
# braucht). Die Zahl darf groesser sein als BACKUP_KEEP; genau dafuer ist das Ziel da.
BACKUP_RCLONE_KEEP="${BACKUP_RCLONE_KEEP:-30}"
# Optionale rclone-Konfigurationsdatei. LEER ist der dokumentierte Normalfall: rclone
# nimmt seine Konfiguration dann aus `RCLONE_CONFIG_*`-Umgebungsvariablen, und die
# stehen in der `.env` — dort, wo die Geheimnisse dieses Stacks ohnehin liegen, und ohne
# eine zweite Datei, die neben `compose.yaml` auf dem Server vorhanden sein muss.
BACKUP_RCLONE_CONF="${BACKUP_RCLONE_CONF:-}"

# Ueberwachung nach dem Muster von healthchecks.io / Uptime Kuma: Erfolg ruft die URL,
# Fehlschlag ruft `$URL/fail`. LEER = keine Rueckmeldung nach aussen.
#
# ⚠️ DAS IST DER EINZIGE MELDEWEG, DER AUCH DAS SCHWEIGEN MELDET. Der Healthcheck unten
# sieht einen gescheiterten und einen ueberfaelligen Lauf — aber nur, solange ihn jemand
# ansieht. Ein Ziel, das den AUSBLEIBENDEN Ruf als Alarm wertet, meldet sich von selbst,
# auch wenn der ganze Container weg ist. Genau das ist der dritte Punkt des Tickets
# („Ein fehlgeschlagener Lauf faellt erst auf, wenn man ihn braucht").
BACKUP_PING_URL="${BACKUP_PING_URL:-}"
# Ab wann der Healthcheck einen ausbleibenden Lauf als Fehler wertet. 26 Stunden lassen
# einem taeglichen Takt zwei Stunden Luft, ohne einen ausgefallenen Tag zu verschlucken.
BACKUP_FRIST_STUNDEN="${BACKUP_FRIST_STUNDEN:-26}"

ZUSTANDSDATEI="$BACKUP_DIR/.zustand"

# Die Pakete, die der Vorlauf nachlaedt. `bash` fuer `backup.sh` (Arrays, `shopt`),
# `sqlite` fuer `.backup`, `tar`+`rsync` fuer das Archiv und die Blobs, `rclone` fuer das
# externe Ziel, `curl` fuer den Ping, `su-exec` fuer den Rechteabbau, `tzdata` fuer $TZ
# (ohne es ist der Container UTC, und „03:30" waere im Sommer 05:30 Ortszeit).
PAKETE="bash sqlite tar rsync rclone curl su-exec tzdata"

protokoll() { printf '%s  %s\n' "$(date '+%Y-%m-%d %H:%M:%S %z')" "$*"; }
warne() { protokoll "WARNUNG: $*" >&2; }

# ══ Vorlauf als root ═════════════════════════════════════════════════════════════════
# ⚠️ WARUM DER LAUF DANACH NICHT ALS root WEITERGEHT, und der Grund ist nicht
# Prinzipienreiterei: die Modul-Datenbanken laufen im WAL-Modus (`core/db/index.ts`
# setzt `journal_mode = WAL`). Ein WAL-Leser LEGT die Dateien `*.db-shm` und `*.db-wal`
# an, wenn sie fehlen — und sie fehlen genau dann, wenn die Suite sauber gestoppt hat,
# also mitten in einem Rollout. Liest root zuerst, gehoeren sie danach root, und der
# Suite-Prozess (uid 1001) bekommt beim naechsten Start SQLITE_CANTOPEN auf seine eigene
# Datenbank. Ein Backup, das die Anwendung lahmlegt, ist kein Backup.
# $1 = Betriebsart, die nach dem Rechteabbau laufen soll (`schleife` oder `lauf`).
vorbereiten() {
  NUTZER="${SUITE_USER:-1001:1001}"
  # Ohne root gibt es weder `apk` noch einen Rechteabbau. Das ist kein Fehlerfall, den
  # man abbrechen muesste — es ist die Lage in einem Container, der schon vorbereitet
  # ist —, aber es gehoert gesagt: fehlt dann ein Werkzeug, liegt es daran.
  if [ "$(id -u)" -ne 0 ]; then
    protokoll "Kein root — Vorlauf uebersprungen, die Werkzeuge muessen vorhanden sein."
    "$1"
    return
  fi
  protokoll "Vorlauf: Pakete nachladen ($PAKETE)"
  # Ohne `--no-cache` bleibt der Index im Container-Dateisystem liegen; er nuetzt beim
  # naechsten Start nichts, weil der Container dann neu ist.
  apk add --no-cache $PAKETE >/dev/null
  # ⚠️ PFLICHTZEILE, KEINE VORSICHT: `backup_data` ist beim ersten `up -d` leer, und ein
  # leeres benanntes Volume erbt Eigentuemer und Modus seines Mountpunkts IM IMAGE. In
  # `alpine` gibt es `/backups` nicht, der Mountpunkt ist damit `root:root` — und der
  # gleich folgende su-exec-Wechsel auf uid 1001 koennte dort keine einzige Datei
  # anlegen. Dieselbe Falle, die im `Dockerfile` bei `/data/files` steht.
  mkdir -p "$BACKUP_DIR"
  chown "$NUTZER" "$BACKUP_DIR"
  protokoll "Vorlauf fertig, weiter als $NUTZER ($1)"
  # `/bin/sh "$0"` und nicht `"$0"`: su-exec fuehrt die Datei sonst direkt aus und
  # braucht dafuer das Ausfuehrbar-Bit. Die Datei kommt aber per Bind-Mount aus dem
  # Repo — ihr Modus ist der des Servers, nicht unserer.
  exec su-exec "$NUTZER" /bin/sh "$0" "$1"
}

# ══ Zustandsdatei ════════════════════════════════════════════════════════════════════
# Sie ist das Gedaechtnis zwischen zwei Laeufen UND zwischen Lauf und Healthcheck. Sie
# liegt im Backup-Volume, ueberlebt also ein `up -d --force-recreate`: ein neu erzeugter
# Container weiss sonst nichts von dem Fehlschlag der letzten Nacht und meldet sich
# wieder gesund, ohne dass ein Backup gelaufen waere.
zustand_lesen() {
  [ -f "$ZUSTANDSDATEI" ] || return 1
  sed -n "s/^$1=//p" "$ZUSTANDSDATEI" | tail -1
}

zustand_schreiben() {
  # status meldung
  tmp="$ZUSTANDSDATEI.neu.$$"
  {
    printf 'letzter_versuch=%s\n' "$(date +%s)"
    printf 'letzter_status=%s\n' "$1"
    printf 'letzte_meldung=%s\n' "$2"
    if [ "$1" = "ok" ]; then
      printf 'letzter_erfolg=%s\n' "$(date +%s)"
    else
      # Den frueheren Erfolg MITNEHMEN, nicht wegwerfen: „seit wann geht es schief"
      # ist die Frage, die morgens um acht zaehlt, und die Antwort steht nur hier.
      alt="$(zustand_lesen letzter_erfolg || true)"
      if [ -n "${alt:-}" ]; then printf 'letzter_erfolg=%s\n' "$alt"; fi
    fi
  } >"$tmp"
  mv "$tmp" "$ZUSTANDSDATEI"
}

# ══ Rueckmeldung nach aussen ═════════════════════════════════════════════════════════
ping_senden() {
  [ -n "$BACKUP_PING_URL" ] || return 0
  ziel="$BACKUP_PING_URL"
  [ "$1" = "ok" ] || ziel="$BACKUP_PING_URL/fail"
  # Ein gescheiterter Ping darf den Lauf NICHT scheitern lassen — das Backup liegt dann
  # ja da. Er ist aber auch nicht folgenlos: ohne ihn ist die Ueberwachung blind, und
  # das gehoert ins Protokoll statt in die Stille.
  if curl -fsS -m 15 --retry 3 --retry-delay 5 -o /dev/null "$ziel"; then
    protokoll "Ping ($1) abgesetzt."
  else
    warne "Ping an $ziel ist gescheitert — die Ueberwachung hat diesen Lauf NICHT gesehen."
  fi
}

# ══ Externes Ziel ════════════════════════════════════════════════════════════════════
rclone_ruf() {
  if [ -n "$BACKUP_RCLONE_CONF" ]; then
    rclone --config "$BACKUP_RCLONE_CONF" "$@"
  else
    rclone "$@"
  fi
}

# Das eine frische Tarball hochladen und danach am Ziel rotieren.
#
# ⚠️ JEDER rclone-AUFRUF WIRD HIER EINZELN GEPRUEFT, und das ist kein Stilmittel —
# GEMESSEN, als diese Funktion sich noch auf `set -e` verliess: ein Ziel, das es nicht
# gibt, ergab „Lauf fertig … ausgelagert nach …", `letzter_status=ok` und einen gruenen
# Healthcheck. Hochgeladen war nichts.
#
# Der Grund ist die Regel, die man genau einmal uebersieht: `set -e` ist INNERHALB einer
# Funktion ausgesetzt, die als Bedingung eines `if` laeuft — und `lauf()` ruft diese hier
# als `if auslagern …`. Ein scheiterndes `rclone copy` brach also nichts ab, der Rumpf
# lief weiter, und zurueck kam der Status des LETZTEN Befehls (der Rotation). Genau der
# Fehlfall, den dieser Dienst sichtbar machen soll, war damit der stillste von allen.
auslagern() {
  tarball="$1"
  protokoll "Auslagern nach $BACKUP_RCLONE_ZIEL"
  if ! rclone_ruf copy --stats-one-line --stats 30s "$tarball" "$BACKUP_RCLONE_ZIEL/"; then
    warne "rclone copy nach $BACKUP_RCLONE_ZIEL ist gescheitert."
    return 1
  fi

  if [ "$BACKUP_RCLONE_KEEP" = "aus" ]; then
    protokoll "Rotation am Ziel: aus (BACKUP_RCLONE_KEEP=aus) — das Ziel waechst unbegrenzt."
    return 0
  fi

  # ⚠️ DAS `--include` IST DER RIEGEL, NICHT DIE KOSMETIK. Dieser Block LOESCHT an einem
  # fremden Ziel. Ein Ziel, das auch andere Dinge traegt (ein gemeinsamer Eimer, ein
  # falsch gesetztes BACKUP_RCLONE_ZIEL mit einem Pfad zu wenig), verloere sie sonst
  # still. Geloescht wird ausschliesslich, was AUSSIEHT WIE UNSER TARBALL — und
  # `deletefile` je Name, nie `delete` oder `purge` auf das Verzeichnis.
  #
  # Die Sortierung ist lexikografisch und darf es sein: der Name ist `%Y%m%dT%H%M%S`
  # (`backup.sh`, `stamp`), also feste Breite ohne Trenner — dort ist lexikografisch
  # dasselbe wie chronologisch. Genau deshalb steht `-r` (neueste zuerst) und danach
  # `tail -n +KEEP+1` (alles ab der KEEP+1-ten), dieselbe Mechanik wie die lokale
  # Rotation in `backup.sh`.
  protokoll "Rotation am Ziel: die neuesten $BACKUP_RCLONE_KEEP Generationen behalten"
  if ! vorhanden="$(rclone_ruf lsf "$BACKUP_RCLONE_ZIEL/" --include '*.tar.gz')"; then
    # KEIN `return 1`: das Tarball liegt am Ziel, dieser Lauf hat also geleistet, wozu er
    # da ist. Folgenlos ist es trotzdem nicht — ohne Rotation waechst das Ziel, bis es
    # voll ist, und dann scheitert der Lauf, der zaehlt.
    warne "Rotation am Ziel nicht moeglich (rclone lsf gescheitert) — das Ziel waechst."
    return 0
  fi
  printf '%s\n' "$vorhanden" \
    | sort -r \
    | tail -n +$((BACKUP_RCLONE_KEEP + 1)) \
    | while read -r alt; do
        [ -n "$alt" ] || continue
        protokoll "  loesche $alt"
        rclone_ruf deletefile "$BACKUP_RCLONE_ZIEL/$alt" \
          || warne "  $alt liess sich nicht loeschen."
      done
  return 0
}

# ══ Ein Lauf ═════════════════════════════════════════════════════════════════════════
lauf() {
  protokoll "──────── Lauf beginnt ────────"
  log="$(mktemp)"
  statusdatei="$(mktemp)"

  # `tee` und nicht „erst sammeln, dann ausgeben": ein Lauf, der HAENGT (ein Ziel, das
  # nicht antwortet, ein rsync ueber Millionen Blobs), zeigte sonst bis zum Zeitablauf
  # gar nichts — und genau dann will man mitlesen.
  #
  # ⚠️ DER STATUS KOMMT AUS EINER DATEI, WEIL ER SONST VERLOREN GEHT. Der Exit-Code einer
  # Pipe ist der ihres LETZTEN Gliedes, also der von `tee` — und `tee` gelingt praktisch
  # immer. Ohne diesen Umweg meldete ein abgebrochenes `backup.sh` Erfolg, und genau
  # dieser Fall ist der, den der ganze Dienst sichtbar machen soll. `PIPESTATUS` ist
  # bash, `set -o pipefail` kann dash nicht (siehe Kopf) — bleibt die Statusdatei, und
  # sie schreibt in die DATEI, nicht in die Pipe, sonst stuende die Zahl im Protokoll.
  #
  # ⚠️ `set +e` IST PFLICHT UND NICHT VORSICHT — GEMESSEN. Das linke Glied einer Pipe
  # laeuft in einer Subshell, und die ERBT `set -e`: scheitert `backup.sh`, stirbt die
  # Subshell SOFORT, das `echo "$?"` kommt nie dazu, und die Statusdatei bleibt LEER.
  # Der Lauf scheiterte dann zwar auch — aber mit „nennt kein lesbares Tarball" und
  # einem `[: Illegal number:` davor, also mit der Diagnose des uebernaechsten Problems.
  set +e
  { bash "$BACKUP_SKRIPT" 2>&1; echo "$?" >"$statusdatei"; } | tee "$log"
  ausgang="$(cat "$statusdatei" 2>/dev/null)"
  set -e
  rm -f "$statusdatei"
  # Leer heisst: die Subshell ist ausgestiegen, bevor sie ihren Status schreiben konnte.
  # Das ist ein Fehlschlag, kein Erfolg — und es als 1 zu buchen ist die einzige Lesart,
  # die nicht still ein kaputtes Backup durchwinkt.
  [ -n "$ausgang" ] || ausgang=1

  if [ "$ausgang" -ne 0 ]; then
    meldung="scripts/backup.sh ist mit Exit $ausgang gescheitert"
    warne "$meldung"
    zustand_schreiben fehler "$meldung"
    ping_senden fehler
    rm -f "$log"
    return 1
  fi

  # ⚠️ EIN GRUENER EXIT-CODE OHNE DIESE ZEILE IST KEIN BEWEIS. `backup.sh` endet mit
  # `backup: wrote <pfad>`; fehlt die Zeile, hat entweder jemand den Vertrag geaendert
  # oder das Skript ist an einer Stelle ausgestiegen, die wir nicht kennen. Beides als
  # Erfolg zu buchen hiesse, nichts auszulagern und Erfolg zu melden — dieselbe Linie,
  # die `backup.sh` selbst bei „keine *.db gefunden" zieht.
  tarball="$(sed -n 's/^backup: wrote //p' "$log" | tail -1)"
  rm -f "$log"
  if [ -z "$tarball" ] || [ ! -f "$tarball" ]; then
    meldung="scripts/backup.sh meldete Erfolg, nennt aber kein lesbares Tarball"
    warne "$meldung"
    zustand_schreiben fehler "$meldung"
    ping_senden fehler
    return 1
  fi
  groesse="$(du -h "$tarball" | cut -f1)"
  protokoll "Lokal: $tarball ($groesse)"

  if [ -n "$BACKUP_RCLONE_ZIEL" ]; then
    if auslagern "$tarball"; then
      meldung="$tarball ($groesse), ausgelagert nach $BACKUP_RCLONE_ZIEL"
    else
      # ⚠️ DAS IST EIN FEHLSCHLAG, AUCH WENN LOKAL ETWAS LIEGT. Der ganze Zweck des
      # Ziels ist der Fall „Server weg"; ein Lauf, der nur lokal ankam, hat ihn nicht
      # abgedeckt. Als Erfolg gebucht, faellt das erst beim Wiederherstellen auf.
      meldung="Tarball liegt lokal, das Auslagern nach $BACKUP_RCLONE_ZIEL ist gescheitert"
      warne "$meldung"
      zustand_schreiben fehler "$meldung"
      ping_senden fehler
      return 1
    fi
  else
    meldung="$tarball ($groesse), NUR LOKAL (BACKUP_RCLONE_ZIEL ist leer)"
  fi

  protokoll "Lauf fertig: $meldung"
  zustand_schreiben ok "$meldung"
  ping_senden ok
  return 0
}

# ══ Zeitgeber ════════════════════════════════════════════════════════════════════════
# Sekunden bis zum naechsten Auftreten von $BACKUP_UHRZEIT.
#
# ⚠️ GERECHNET, NICHT GEPARST, und das ist Absicht: `date -d "tomorrow 03:30"` ist
# GNU-date. Im Container laeuft busybox, dessen `-d` andere Formate kennt — der
# naheliegende Einzeiler liefert dort wahlweise einen Fehler oder still eine falsche
# Zahl. Zwei Multiplikationen sind haesslicher und stimmen ueberall.
#
# ⚠️ UND DIE FUEHRENDE NULL MUSS VORHER WEG, SONST STIRBT DER DIENST SOFORT. `date +%H`
# liefert `09`, und eine Shell liest das in `$(( ))` als OKTAL. Der bash-Ausweg `10#$hh`
# ist KEINER: POSIX kennt den Praefix nicht. GEMESSEN unter dash — `arithmetic
# expression: expecting EOF: "10#19 * 3600 …"`, Exit 2, und zwar bei JEDER Uhrzeit, nicht
# nur bei 08 und 09. Der Zeitgeber waere damit nie bis zum ersten Lauf gekommen, und
# `restart: unless-stopped` haette daraus eine Neustartschleife gemacht: ein Stack, der
# laeuft, ein Dienst, der staendig neu startet, und kein einziges Backup.
# `${x#0}` schneidet genau eine fuehrende Null ab und ist ueberall dieselbe Regel.
ohne_null() { echo "${1#0}"; }

sekunden_bis_uhrzeit() {
  hh="$(ohne_null "${BACKUP_UHRZEIT%%:*}")"
  mm="$(ohne_null "${BACKUP_UHRZEIT##*:}")"
  ziel=$((hh * 3600 + mm * 60))
  jetzt=$(( $(ohne_null "$(date +%H)") * 3600 \
          + $(ohne_null "$(date +%M)") * 60 \
          + $(ohne_null "$(date +%S)") ))
  rest=$((ziel - jetzt))
  [ "$rest" -gt 0 ] || rest=$((rest + 86400))
  echo "$rest"
}

beenden=0
# Ohne diese Falle stirbt der Container beim `docker compose stop` erst nach der
# Gnadenfrist per SIGKILL — mitten in einem laufenden `tar`, was ein halbes Tarball
# hinterliesse. Mit ihr endet die Schleife an ihrer naechsten Prüfstelle.
trap 'beenden=1' TERM INT

schleife() {
  protokoll "Backup-Sidecar bereit."
  protokoll "  Zeit:      taeglich $BACKUP_UHRZEIT (TZ=${TZ:-UTC})"
  protokoll "  Quelle:    $BACKUP_SKRIPT"
  protokoll "  Lokal:     $BACKUP_DIR, ${BACKUP_KEEP:-7} Generationen"
  if [ -n "$BACKUP_RCLONE_ZIEL" ]; then
    protokoll "  Extern:    $BACKUP_RCLONE_ZIEL, $BACKUP_RCLONE_KEEP Generationen"
  else
    # Laut, nicht als Fussnote: das ist der zweite der drei Gruende, aus denen es diesen
    # Dienst ueberhaupt gibt. Ein Backup im selben Volume wie die Daten ueberlebt den
    # Verlust des Servers nicht.
    warne "BACKUP_RCLONE_ZIEL ist LEER — es wird NUR LOKAL gesichert."
  fi
  if [ -n "$BACKUP_PING_URL" ]; then
    protokoll "  Meldung:   Ping nach jedem Lauf"
  else
    warne "BACKUP_PING_URL ist LEER — ein Fehlschlag meldet sich nur im Healthcheck,
  und der meldet sich nur, wenn jemand hinsieht."
  fi

  if [ "$BACKUP_BEIM_START" = "1" ]; then
    protokoll "BACKUP_BEIM_START=1 — ein Lauf sofort."
    lauf || true
  fi

  while [ "$beenden" -eq 0 ]; do
    rest="$(sekunden_bis_uhrzeit)"
    protokoll "Naechster Lauf in $((rest / 3600))h $(((rest % 3600) / 60))min."
    # In Scheiben schlafen, damit ein SIGTERM nicht bis zur naechsten Uhrzeit wartet —
    # und den Rest bei JEDER Runde neu aus der Uhr rechnen statt herunterzuzaehlen: so
    # tragen eine Zeitumstellung und eine angehaltene Maschine sich von selbst aus.
    while [ "$rest" -gt 0 ] && [ "$beenden" -eq 0 ]; do
      if [ "$rest" -lt 30 ]; then scheibe="$rest"; else scheibe=30; fi
      # `|| true`: das SIGTERM bricht das `sleep` ab, und unter `set -e` waere der
      # Ruecksprung sonst ein Abbruch statt eines geordneten Endes.
      sleep "$scheibe" || true
      neu="$(sekunden_bis_uhrzeit)"
      # ⚠️ DER SPRUNG NACH OBEN IST DAS SIGNAL, NICHT DIE NULL. Der Rest faellt bis zur
      # Zielzeit und springt in dem Moment, in dem sie vorbeizieht, auf fast 24h — eine
      # exakte Null sieht man bei 30-Sekunden-Scheiben praktisch nie. Wer auf `-le 0`
      # wartet, wartet ewig.
      #
      # Die Gegenrichtung (Uhr laeuft rueckwaerts: NTP-Korrektur, Ende der Sommerzeit)
      # sieht genauso aus und loest einen zusaetzlichen Lauf aus. Das ist die richtige
      # der beiden Fehlerarten — ein Backup zu viel kostet Platz, eines zu wenig kostet
      # Daten — und es trifft hoechstens zweimal im Jahr.
      if [ "$neu" -gt "$rest" ]; then rest=0; else rest="$neu"; fi
    done
    [ "$beenden" -eq 0 ] || break
    # Nach dem Lauf rechnet die aeussere Runde neu; weil `lauf` die Zielminute in jedem
    # Fall ueberschreitet, steht dort dann der volle Tag — kein zweiter Lauf am Stueck.
    lauf || true
  done
  protokoll "Beendet."
}

# ══ Healthcheck ══════════════════════════════════════════════════════════════════════
zustand() {
  if [ ! -f "$ZUSTANDSDATEI" ]; then
    echo "noch kein Lauf verzeichnet"
    return 1
  fi
  status="$(zustand_lesen letzter_status || echo unbekannt)"
  meldung="$(zustand_lesen letzte_meldung || echo '')"
  erfolg="$(zustand_lesen letzter_erfolg || echo '')"

  if [ "$status" != "ok" ]; then
    echo "letzter Lauf gescheitert: $meldung"
    return 1
  fi
  # ⚠️ DER ZWEITE FALL IST DER WICHTIGERE. Ein Dienst, der gar nicht mehr laeuft, hat
  # keinen gescheiterten Lauf — er hat KEINEN. Ohne diese Pruefung meldete der
  # Healthcheck bis in alle Ewigkeit den Erfolg von vorletzter Woche.
  if [ -n "$erfolg" ]; then
    alter=$(( $(date +%s) - erfolg ))
    if [ "$alter" -gt $((BACKUP_FRIST_STUNDEN * 3600)) ]; then
      echo "letzter Erfolg vor $((alter / 3600))h — Frist sind ${BACKUP_FRIST_STUNDEN}h"
      return 1
    fi
    echo "ok, letzter Erfolg vor $((alter / 3600))h: $meldung"
    return 0
  fi
  echo "ok: $meldung"
  return 0
}

# ══ Betriebsart ══════════════════════════════════════════════════════════════════════
case "${1:-dienst}" in
  dienst) vorbereiten schleife ;;
  einmal) vorbereiten lauf ;;
  zustand) zustand ;;
  # Rueckseiten — vom Vorlauf gerufen, nicht von Hand.
  schleife) schleife ;;
  lauf) lauf ;;
  *)
    echo "Aufruf: $0 [dienst|einmal|zustand]" >&2
    exit 2
    ;;
esac
