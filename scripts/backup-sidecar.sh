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
#   werkzeuge Vorlauf, dann der uebergebene Befehl. Fuer JEDEN Handgriff aus dem
#             Runbook, der `sqlite3`, `rclone`, `rsync` oder `bash` braucht.
#   schleife / lauf   Die Rueckseite von `dienst` bzw. `einmal`, nach dem Rechteabbau.
#             Der Vorlauf ruft sie per su-exec; von Hand ruft man sie nicht.
#
# ⚠️ JEDER VON AUSSEN GERUFENE WEG BRAUCHT DEN VORLAUF, nicht nur `dienst`. Der
# dokumentierte Weg ist `docker compose run --rm backup …`, und `run` erzeugt einen
# FRISCHEN Container aus dem nackten alpine-Image — dort gibt es kein `bash`, kein
# `sqlite3`, kein `rsync` und kein `rclone`. (`run` und nicht `exec`, weil bei einem
# gescheiterten Rollout der Dienst womoeglich gerade nicht laeuft und trotzdem gesichert
# werden muss.) Genau deshalb gibt es `werkzeuge`: ein Handgriff aus dem Runbook, der
# `rclone lsl` oder `sqlite3 "pragma integrity_check"` ruft, stirbt sonst mit
# „not found" — und zwar in dem Moment, in dem jemand zum ersten Mal PRUEFT, ob die
# Sicherung ueberhaupt etwas taugt. Busybox deckt nur `sh`, `ls`, `tar`, `du` und `cat` ab.
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

# Wie ein Tarball DIESES Skripts heisst, als Glob. `scripts/backup.sh` baut den Namen aus
# `stamp="$(date +%Y%m%dT%H%M%S)"`, also feste Breite ohne Trenner.
#
# ⚠️ `*.tar.gz` WAERE HIER FALSCH, UND DER FEHLFALL LOESCHT FREMDE DATEN. Die Rotation am
# Ziel raeumt auf; zeigt `BACKUP_RCLONE_ZIEL` auf ein gemeinsam genutztes Verzeichnis —
# oder, viel wahrscheinlicher, versehentlich eine Ebene ZU HOCH —, dann traefe `*.tar.gz`
# jedes fremde Archiv daneben und die Rotation raeumte es mit weg. Die Endung allein sagt
# nichts darueber, wer eine Datei geschrieben hat.
TARBALL_MUSTER='[0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9]T[0-9][0-9][0-9][0-9][0-9][0-9].tar.gz'

# Ueberwachung nach dem Muster von healthchecks.io / Uptime Kuma: Erfolg ruft die URL,
# Fehlschlag ruft `$URL/fail`. LEER = keine Rueckmeldung nach aussen.
#
# ⚠️ DAS IST DER EINZIGE MELDEWEG, DER AUCH DAS SCHWEIGEN MELDET. Der Healthcheck unten
# sieht einen gescheiterten und einen ueberfaelligen Lauf — aber nur, solange ihn jemand
# ansieht. Ein Ziel, das den AUSBLEIBENDEN Ruf als Alarm wertet, meldet sich von selbst,
# auch wenn der ganze Container weg ist. Genau das ist der dritte Punkt des Tickets
# („Ein fehlgeschlagener Lauf faellt erst auf, wenn man ihn braucht").
BACKUP_PING_URL="${BACKUP_PING_URL:-}"
# Eigene URL fuer den Fehlschlag. LEER = healthchecks.io-Konvention, also `$URL/fail`.
#
# ⚠️ DIESE ZEILE IST PFLICHT, SOBALD DAS ZIEL NICHT healthchecks.io IST — und der
# Fehlfall meldet GESUND statt kaputt. Uptime Kuma kodiert den Zustand in der
# ABFRAGE, nicht im Pfad, und seine kopierfertige URL traegt bereits `status=up`:
#   https://kuma/api/push/AbC123?status=up&msg=OK&ping=
# Ein angehaengtes `/fail` landet damit im WERT von `ping=`, der Pfad bleibt derselbe,
# und `status=up` steht unveraendert drin. Der Ruf, der einen Fehlschlag melden soll,
# frischt den Waechter also auf GRUEN auf — die Ueberwachung waere schlimmer als keine,
# weil sie dann aktiv das Gegenteil behauptet. Fuer Kuma gehoert hierher dieselbe URL
# mit `status=down`.
BACKUP_PING_URL_FEHLER="${BACKUP_PING_URL_FEHLER:-}"
# Ab wann der Healthcheck einen ausbleibenden Lauf als Fehler wertet. 26 Stunden lassen
# einem taeglichen Takt zwei Stunden Luft, ohne einen ausgefallenen Tag zu verschlucken.
BACKUP_FRIST_STUNDEN="${BACKUP_FRIST_STUNDEN:-26}"

# Wie lange ein Lauf auf einen anderen wartet, bevor er aufgibt (Minuten).
BACKUP_SPERRE_FRIST_MINUTEN="${BACKUP_SPERRE_FRIST_MINUTEN:-30}"
# Ab wann eine Sperre als verwaist gilt und uebernommen werden darf (Stunden).
#
# ⚠️ DIESE ZAHL MISST NICHT, WIE LANGE EIN LAUF SCHON LAEUFT, SONDERN WIE LANGE NIEMAND
# MEHR EIN LEBENSZEICHEN GEGEBEN HAT — und der Unterschied ist der ganze Sinn des
# Herzschlags weiter unten. Ohne ihn waere ein voellig gesunder Lauf, der laenger dauert
# als diese Zahl (grosse Ablage, langsames Ziel), nach Ablauf als „verwaist" eingestuft
# worden, und der naechste haette ihm die Sperre unter den Haenden weggenommen. GEMESSEN:
# mit einer Sperre, deren Zeitstempel 8h zurueckliegt, startete der zweite Lauf sofort.
BACKUP_SPERRE_ALTER_STUNDEN="${BACKUP_SPERRE_ALTER_STUNDEN:-6}"
# Takt des Herzschlags in Sekunden. Muss deutlich unter der Altersgrenze liegen, sonst
# traegt er nicht; 60s gegen 6h ist reichlich Abstand.
BACKUP_HERZSCHLAG_SEKUNDEN="${BACKUP_HERZSCHLAG_SEKUNDEN:-60}"

ZUSTANDSDATEI="$BACKUP_DIR/.zustand"
SPERRVERZEICHNIS="$BACKUP_DIR/.lauf.sperre"

# Die Pakete, die der Vorlauf nachlaedt. `bash` fuer `backup.sh` (Arrays, `shopt`),
# `sqlite` fuer `.backup`, `tar`+`rsync` fuer das Archiv und die Blobs, `rclone` fuer das
# externe Ziel, `curl` fuer den Ping, `su-exec` fuer den Rechteabbau, `tzdata` fuer $TZ
# (ohne es ist der Container UTC, und „03:30" waere im Sommer 05:30 Ortszeit).
PAKETE="bash sqlite tar rsync rclone curl su-exec tzdata"

# Wird von der Signalfalle gesetzt. Hier belegt, weil `sperre_erwarten` es liest und
# unter `set -u` sonst auf eine ungesetzte Variable liefe.
beenden=0

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
# "$@" = der Befehl, der nach dem Rechteabbau laufen soll. Er wird ge-`exec`t, nicht
# gerufen: dieser Prozess hat danach nichts mehr zu tun, und so bleibt der Exit-Code der
# des Befehls — daran haengt `SUITE_BACKUP_CMD` im Rollout.
vorbereiten() {
  NUTZER="${SUITE_USER:-1001:1001}"
  # Ohne root gibt es weder `apk` noch einen Rechteabbau. Das ist kein Fehlerfall, den
  # man abbrechen muesste — es ist die Lage in einem Container, der schon vorbereitet
  # ist —, aber es gehoert gesagt: fehlt dann ein Werkzeug, liegt es daran.
  if [ "$(id -u)" -ne 0 ]; then
    protokoll "Kein root — Vorlauf uebersprungen, die Werkzeuge muessen vorhanden sein."
    exec "$@"
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
  protokoll "Vorlauf fertig, weiter als $NUTZER: $*"
  exec su-exec "$NUTZER" "$@"
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
  if [ "$1" = "ok" ]; then
    ziel="$BACKUP_PING_URL"
  elif [ -n "$BACKUP_PING_URL_FEHLER" ]; then
    ziel="$BACKUP_PING_URL_FEHLER"
  else
    ziel="$BACKUP_PING_URL/fail"
  fi
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

  # ⚠️ DIESER BLOCK LOESCHT AN EINEM FREMDEN ZIEL. Wie er sich davor schuetzt, steht am
  # `case` weiter unten — dessen Reihenfolge ist tragend, nicht bloss seine Existenz.
  #
  # Die Sortierung ist lexikografisch und darf es sein: der Name ist `%Y%m%dT%H%M%S`
  # (`backup.sh`, `stamp`), also feste Breite ohne Trenner — dort ist lexikografisch
  # dasselbe wie chronologisch. Genau deshalb steht `-r` (neueste zuerst) und danach
  # `tail -n +KEEP+1` (alles ab der KEEP+1-ten), dieselbe Mechanik wie die lokale
  # Rotation in `backup.sh`.
  protokoll "Rotation am Ziel: die neuesten $BACKUP_RCLONE_KEEP Generationen behalten"
  if ! vorhanden="$(rclone_ruf lsf "$BACKUP_RCLONE_ZIEL/" --include "$TARBALL_MUSTER")"; then
    # KEIN `return 1`: das Tarball liegt am Ziel, dieser Lauf hat also geleistet, wozu er
    # da ist. Folgenlos ist es trotzdem nicht — ohne Rotation waechst das Ziel, bis es
    # voll ist, und dann scheitert der Lauf, der zaehlt.
    warne "Rotation am Ziel nicht moeglich (rclone lsf gescheitert) — das Ziel waechst."
    return 0
  fi
  # ⚠️ ERST FILTERN, DANN ZAEHLEN — und diese Reihenfolge ist der ganze Punkt.
  # GEMESSEN, als es umgekehrt war: liegt am Ziel etwas Fremdes (`wichtig.txt`,
  # `site-dump.tar.gz`), sortiert es sich nach `sort -r` VOR unsere Zeitstempel, besetzt
  # die „neuesten $KEEP" Plaetze und schiebt damit JEDE echte Generation in die
  # Loeschliste — auch die gerade hochgeladene. Ergebnis der Messung: die fremden Dateien
  # ueberlebten alle vier, unsere waren restlos weg. Ein Riegel, der bloss das Loeschen
  # fremder Dateien verhindert, reicht also nicht — die Zahl muss sich von vornherein auf
  # UNSERE Dateien beziehen.
  #
  # Damit ist dieses `case` der tragende Riegel und `--include` oben nur die Abkuerzung.
  # Das ist die richtige Verteilung: rclones Filtersyntax ist nicht die der Shell, und ob
  # sie Zeichenklassen genau so auswertet, sieht in diesem Repo kein Tor — es gibt kein
  # rclone im Laeufer. Das `case` dagegen ist POSIX und in dash, ash und bash gleich
  # gemessen.
  unsere="$(mktemp)"
  printf '%s\n' "$vorhanden" \
    | while read -r name; do
        [ -n "$name" ] || continue
        case "$name" in
          $TARBALL_MUSTER) printf '%s\n' "$name" ;;
          *)
            # Nicht still: der Name gehoert jemand anderem. Entweder teilt sich das Ziel
            # mit etwas Fremdem, oder `BACKUP_RCLONE_ZIEL` zeigt eine Ebene zu hoch.
            warne "  $name sieht nicht wie eine Sicherung dieses Stacks aus — bleibt liegen."
            ;;
        esac
      done >"$unsere"

  # `deletefile` je Name, nie `delete` oder `purge`: die arbeiten auf dem VERZEICHNIS und
  # kennen den Filter ueberhaupt nicht.
  #
  # Die Sortierung ist lexikografisch und darf es sein: der Name ist `%Y%m%dT%H%M%S`, also
  # feste Breite ohne Trenner — dort ist lexikografisch dasselbe wie chronologisch. `-r`
  # (neueste zuerst) und danach `tail -n +KEEP+1` ist dieselbe Mechanik wie die lokale
  # Rotation in `backup.sh`.
  sort -r "$unsere" \
    | tail -n +$((BACKUP_RCLONE_KEEP + 1)) \
    | while read -r alt; do
        [ -n "$alt" ] || continue
        protokoll "  loesche $alt"
        rclone_ruf deletefile "$BACKUP_RCLONE_ZIEL/$alt" \
          || warne "  $alt liess sich nicht loeschen."
      done
  rm -f "$unsere"
  return 0
}

# ══ Sperre gegen ueberlappende Laeufe ════════════════════════════════════════════════
# ⚠️ ZWEI LAEUFE SIND NICHT NUR VERSCHWENDUNG, SIE ZERSTOEREN EINANDER. Der Dienst und
# ein `docker compose run … einmal` aus dem Rollout (`SUITE_BACKUP_CMD`) sind getrennte
# Container am SELBEN Volume, und `scripts/backup.sh` benennt sein Arbeitsverzeichnis und
# sein Archiv nur auf die SEKUNDE genau (`stamp="$(date +%Y%m%dT%H%M%S)"`). Starten beide
# in derselben Sekunde, schreiben sie dieselben SQLite-Kopien in dasselbe Verzeichnis,
# und das `rm -rf "$work"` des einen raeumt es unter dem `tar` des anderen weg. Heraus
# kaeme ein halbes Tarball, das wie ein ganzes aussieht. Dazu raesen beide um `.zustand`.
# Der Anlass ist real, wenn auch selten: ein Rollout, der in das Zeitfenster des
# naechtlichen Laufs faellt.
#
# `mkdir` ist der Riegel, und zwar weil es auf POSIX-Dateisystemen ATOMAR ist: es gelingt
# genau einem von beiden. `flock` waere die naheliegende Wahl und ist hier die schlechtere
# — busybox hat es, dash-auf-Debian-Host nicht zwingend, und eine Sperre, die je nach
# Umgebung fehlt, ist schlimmer als keine.
#
# ⚠️ EINE PID NUETZT HIER NICHTS. Die beiden Laeufe sitzen in VERSCHIEDENEN Containern,
# also in verschiedenen PID-Namensraeumen — eine gespeicherte Nummer sagt dem anderen
# nichts. Gegen die verwaiste Sperre (Container per SIGKILL beendet) hilft deshalb nur
# ihr ALTER, und ohne diese Uebernahme stuende das Backup nach einem harten Abbruch
# dauerhaft still.
# Alter eines Verzeichnisses in Sekunden, -1 wenn es das Verzeichnis nicht gibt.
#
# ⚠️ DER ZEITSTEMPEL IST DIE mtime DES VERZEICHNISSES SELBST, nicht eine Datei darin.
# Eine Datei waere ein ZWEITER Schritt, und zwischen `mkdir` und ihr liegt ein Fenster:
# ein zweiter Prozess saehe dann eine Sperre OHNE Zeitstempel, lese ihn als 0, hielte die
# brandneue Sperre fuer uralt und uebernaehme sie. GEMESSEN, als es so war — und es
# braucht dafuer nicht einmal eine verwaiste Sperre, der Fall trifft die GEWOEHNLICHE
# erste Belegung. `mkdir` setzt die mtime in derselben Operation, mit der es das
# Verzeichnis anlegt.
verzeichnis_alter() {
  m="$(stat -c %Y "$1" 2>/dev/null || echo '')"
  case "$m" in '' | *[!0-9]*) echo -1; return 0 ;; esac
  echo $(( $(date +%s) - m ))
}

sperre_alter() { verzeichnis_alter "$SPERRVERZEICHNIS"; }

# ══ Die MARKE: die Identitaet einer Belegung ═════════════════════════════════════════
# ⚠️ OHNE SIE IST JEDE UEBERNAHME EIN WETTLAUF, UND DAS IST GEMESSEN, NICHT HERGELEITET.
# Der naheliegende Weg — pruefen, ob die Sperre verwaist ist, sie wegraeumen, neu anlegen
# — hat ein Fenster zwischen Urteil und Tat, und zwei Wartende treffen es. Ich habe
# dagegen NACHEINANDER versucht: `rm -rf` durch das atomare `mv` ersetzt, dann eine
# ZWEITE Sperre ueber die Uebernahme gelegt und darin noch einmal geprueft. Beides
# verengt das Fenster und schliesst es nicht: 16 Wartende gegen eine verwaiste Sperre
# ergaben in zwei von drei Runden ZWEI bzw. DREI gleichzeitige Laeufe. Genau das, wogegen
# es die Sperre gibt.
#
# Was traegt, ist eine Bedingung auf die IDENTITAET dessen, was man wegraeumt. Die Sperre
# enthaelt deshalb genau ein Unterverzeichnis, ihre Marke. Wer uebernehmen will, hat eine
# bestimmte Marke gesehen — und darf nur dann weitermachen, wenn er GENAU DIESE entfernen
# kann. `rmdir` ist atomar: von zwei Wartenden mit derselben beobachteten Marke gewinnt
# einer, der andere bekommt ENOENT. Und wer zu spaet kommt, findet die alte Marke nicht
# mehr, weil der Gewinner laengst eine neue gesetzt hat.
#
# ⚠️ DIE MARKE MACHT AUCH DEN ZWEITEN FALL SICHER: eine Sperre OHNE Marke (jemand starb
# zwischen den beiden `mkdir`) raeumt `rmdir` auf dem Sperrverzeichnis selbst weg — und
# das gelingt nur, weil es leer ist. Eine ordentlich gehaltene Sperre ist nie leer, kann
# auf diesem Weg also nicht versehentlich mitgerissen werden.
sperre_marke() { ls "$SPERRVERZEICHNIS" 2>/dev/null | head -1; }

sperre_marke_setzen() { mkdir "$SPERRVERZEICHNIS/eigner.$$.$(date +%s)" 2>/dev/null || true; }

# ⚠️ DIE GRENZE HAT EINEN BODEN, UND DER IST KEINE VORSICHT. Eine Grenze unterhalb des
# Herzschlags ist selbstwiderspruechlich: der Lauf meldet sich alle
# BACKUP_HERZSCHLAG_SEKUNDEN, eine kleinere Grenze erklaerte ihn also zwischen zwei
# Lebenszeichen fuer tot. GEMESSEN an der Vorgabe 0 Stunden: der zweite Lauf enteignete
# den laufenden ersten. Zehnfacher Abstand macht die Zusicherung strukturell statt
# dokumentiert — mit den Vorgaben (60s gegen 6h) ist der Abstand ohnehin Faktor 360.
sperre_ist_verwaist() {
  alter="$(sperre_alter)"
  grenze=$((BACKUP_SPERRE_ALTER_STUNDEN * 3600))
  boden=$((BACKUP_HERZSCHLAG_SEKUNDEN * 10))
  if [ "$grenze" -lt "$boden" ]; then grenze="$boden"; fi
  [ "$alter" -ge 0 ] && [ "$alter" -gt "$grenze" ]
}

# $1 = die Marke, die als verwaist beurteilt wurde (leer = Sperre ohne Marke).
sperre_uebernehmen() {
  if [ -n "$1" ]; then
    # Der eigentliche Riegel: nur wer DIESE Marke entfernen kann, hat die beurteilte
    # Belegung erwischt. Jeder Zweite scheitert hier und faellt zurueck ins Warten.
    rmdir "$SPERRVERZEICHNIS/$1" 2>/dev/null || return 1
  fi
  # Jetzt ist die Sperre leer — und nur DANN raeumt `rmdir` sie weg. Haelt sie inzwischen
  # wieder jemand ordentlich (also mit Marke), scheitert das hier und wir treten zurueck.
  rmdir "$SPERRVERZEICHNIS" 2>/dev/null || return 1
  mkdir "$SPERRVERZEICHNIS" 2>/dev/null || return 1
  sperre_marke_setzen
  return 0
}

sperre_holen() {
  # `mkdir` allein entscheidet ueber den Besitz — hier wie bei der Uebernahme.
  if mkdir "$SPERRVERZEICHNIS" 2>/dev/null; then
    sperre_marke_setzen
    return 0
  fi
  marke="$(sperre_marke)"
  if [ -z "$marke" ]; then
    # Eine Sperre ohne Marke ist ein halb angelegter Rest. Sie ist nur dann uebernehmbar,
    # wenn sie lange genug so dasteht, dass kein lebender Prozess sie gerade anlegt — die
    # beiden `mkdir` liegen Millisekunden auseinander.
    [ "$(sperre_alter)" -gt 60 ] || return 1
    sperre_uebernehmen "" && return 0
    return 1
  fi
  if sperre_ist_verwaist; then
    warne "Die Sperre ist $(( $(sperre_alter) / 3600 ))h alt — ein Lauf wurde offenbar hart
  beendet. Es wird versucht, sie zu uebernehmen."
    sperre_uebernehmen "$marke" && return 0
  fi
  return 1
}

# Warten statt ueberspringen, und das ist die Entscheidung: fuer den Rollout waere ein
# uebersprungener Lauf ein gruener Exit-Code ohne Sicherung — `deploy.sh` rollte dann
# ohne aus. Ein zweites Tarball kurz nach dem ersten kostet dagegen nur Platz.
sperre_erwarten() {
  frist=$((BACKUP_SPERRE_FRIST_MINUTEN * 60))
  gewartet=0
  while :; do
    # ⚠️ DIE BEENDIGUNG WIRD VOR JEDEM VERSUCH GEPRUEFT, NICHT DANACH — und genau das
    # hatte ich zuerst falsch. Stand die Pruefung im Schleifenrumpf und `sperre_holen` in
    # der Schleifenbedingung, lief sie zu spaet: gibt der andere Lauf waehrend unseres
    # Schlafs frei, belegt die BEDINGUNG die Sperre und verlaesst die Schleife, bevor der
    # Rumpf ueberhaupt drankommt. NACHGESTELLT: SIGTERM im Schlaf, danach die Sperre
    # freigegeben — „Sperre nach 10s bekommen", und ein volles Backup lief an, nach dem
    # Stoppbefehl.
    if [ "$beenden" -ne 0 ]; then
      protokoll "Beendigung angefordert — es wird kein neuer Lauf mehr begonnen."
      return 1
    fi
    if sperre_holen; then
      # ⚠️ UND NOCH EINMAL DANACH. Zwischen der Pruefung oben und dem `mkdir` liegt ein
      # Fenster, in dem das Signal eintreffen kann. Die gerade geholte Sperre gehoert
      # dann uns — und muss sofort wieder weg, sonst blockiert sie jeden naechsten Lauf
      # bis zur Altersgrenze, obwohl niemand mehr arbeitet.
      haelt_sperre=1
      if [ "$beenden" -ne 0 ]; then
        protokoll "Beendigung angefordert — die eben geholte Sperre wird freigegeben."
        sperre_ablegen
        return 1
      fi
      break
    fi
    if [ "$gewartet" -ge "$frist" ]; then
      warne "Seit ${BACKUP_SPERRE_FRIST_MINUTEN}min laeuft bereits eine Sicherung — aufgegeben."
      return 1
    fi
    if [ "$gewartet" -eq 0 ]; then protokoll "Ein anderer Lauf haelt die Sperre — warte."; fi
    sleep 10 || true
    gewartet=$((gewartet + 10))
  done
  if [ "$gewartet" -ne 0 ]; then protokoll "Sperre nach ${gewartet}s bekommen."; fi
  return 0
}

# Ein hart beendeter Prozess laesst die Sperre stehen; dagegen steht die Alterspruefung
# oben. Diese Falle deckt den geordneten Fall ab (SIGTERM waehrend eines Laufs) — ohne
# sie blockierte eine Sperre bis zu BACKUP_SPERRE_ALTER_STUNDEN, obwohl niemand mehr
# arbeitet. ⚠️ `exec` in `vorbereiten` loest KEIN EXIT aus, der Vorlauf faellt also nicht
# faelschlich hier hinein.
# ⚠️ OHNE DEN HERZSCHLAG IST DIE ALTERSGRENZE EINE FRIST AUF DEN LAUF SELBST. Ein
# gesunder Lauf, der laenger dauert (eine grosse Ablage, ein langsames Ziel), galte nach
# ihrem Ablauf als verwaist — und der naechste Lauf naehme ihm die Sperre weg, waehrend er
# noch schreibt. Genau die Gleichzeitigkeit, gegen die es die Sperre gibt, nur mit
# Zeitverzoegerung. GEMESSEN: Sperre mit 8h alter mtime, zweiter Lauf startete sofort.
#
# `touch` auf das VERZEICHNIS hebt seine mtime, ohne etwas hineinzulegen — die Sperre
# bleibt also leer (was sie bleiben muss, siehe `verzeichnis_alter`). Damit misst die
# Altersgrenze das, was sie messen soll: wie lange niemand mehr ein Lebenszeichen gab.
#
# ⚠️ DIE SCHLEIFE PRUEFT ZWEI DINGE, UND DAS ZWEITE IST DAS WICHTIGERE. Dass die Sperre
# noch da ist, reicht NICHT: stirbt der Eigentuemer hart, bleibt sie ja gerade stehen —
# der Herzschlag liefe weiter und hielte sie ewig jung, womit die Uebernahme einer
# wirklich verwaisten Sperre nie mehr griffe. Genau die Verklemmung, gegen die die
# Altersgrenze da ist. GEMESSEN an einer abgesetzten Sitzung: Eigentuemer per SIGKILL
# beendet, der Herzschlag lief weiter, die mtime blieb im Takt frisch.
#
# Im Container waere das folgenlos (SIGKILL auf PID 1 reisst den ganzen Namensraum mit,
# der Herzschlag stirbt zwangslaeufig), aber darauf zu bauen hiesse, die Richtigkeit an
# die Umgebung zu haengen. `kill -0` fragt den Eigentuemer direkt und kostet nichts.
herzschlag_pid=""
herzschlag_starten() {
  eltern=$$
  (
    while [ -d "$SPERRVERZEICHNIS" ] && kill -0 "$eltern" 2>/dev/null; do
      sleep "$BACKUP_HERZSCHLAG_SEKUNDEN" || exit 0
      touch "$SPERRVERZEICHNIS" 2>/dev/null || exit 0
    done
  ) &
  herzschlag_pid=$!
}

herzschlag_beenden() {
  if [ -n "$herzschlag_pid" ]; then
    kill "$herzschlag_pid" 2>/dev/null || true
    herzschlag_pid=""
  fi
}

haelt_sperre=0
sperre_ablegen() {
  herzschlag_beenden
  if [ "$haelt_sperre" -eq 1 ]; then
    haelt_sperre=0
    rm -rf "$SPERRVERZEICHNIS"
  fi
}
trap sperre_ablegen EXIT

# ══ Ein Lauf ═════════════════════════════════════════════════════════════════════════
# Die Huelle haelt die Sperre ueber genau einen Lauf. `if … then … else` und nicht
# `lauf_ungesperrt; ergebnis=$?`: Letzteres risse unter `set -e` den ganzen Prozess ab,
# sobald ein Lauf scheitert — und zwar VOR der Freigabe, sodass die naechste Sicherung
# bis zur Altersgrenze ausgesperrt bliebe. Ein Fehlschlag darf keine Sperre hinterlassen.
lauf() {
  sperre_erwarten || return 1
  haelt_sperre=1
  herzschlag_starten
  if lauf_ungesperrt; then ergebnis=0; else ergebnis=$?; fi
  sperre_ablegen
  return "$ergebnis"
}

lauf_ungesperrt() {
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
# `/bin/sh "$0"` und nicht `"$0"`: su-exec fuehrt die Datei sonst direkt aus und braucht
# dafuer das Ausfuehrbar-Bit. Die Datei kommt aber per Bind-Mount aus dem Repo — ihr
# Modus ist der des Servers, nicht unserer.
case "${1:-dienst}" in
  dienst) vorbereiten /bin/sh "$0" schleife ;;
  einmal) vorbereiten /bin/sh "$0" lauf ;;
  zustand) zustand ;;
  werkzeuge)
    shift
    if [ "$#" -eq 0 ]; then
      echo "werkzeuge: es fehlt der Befehl, z. B. … werkzeuge sh -c 'rclone lsl \"\$BACKUP_RCLONE_ZIEL/\"'" >&2
      exit 2
    fi
    vorbereiten "$@"
    ;;
  # Rueckseiten — vom Vorlauf gerufen, nicht von Hand.
  schleife) schleife ;;
  lauf) lauf ;;
  *)
    echo "Aufruf: $0 [dienst|einmal|zustand|werkzeuge <befehl …>]" >&2
    exit 2
    ;;
esac
