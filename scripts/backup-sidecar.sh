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

# ⚠️ DER STOPPWUNSCH UEBERLEBT KEIN `exec`. Er steht in einer VARIABLEN, und `exec`
# ersetzt den Prozess — die neue Shell startet mit `beenden=0`. Genau dazwischen liegt
# der Vorlauf, und der ist die laengste blockierende Stelle ueberhaupt: `apk add` laedt
# sieben Pakete. Dazu kommt, dass eine POSIX-Shell die Falle aufschiebt, solange ein
# Kind im Vordergrund laeuft — das Signal wirkt also fruehestens NACH `apk`, und dann
# ist der `exec` die naechste Anweisung.
#
# GEMESSEN mit einer `apk`-Attrappe (6s) und SIGTERM nach 2s: der Dienst meldete
# „Backup-Sidecar bereit." und blieb stehen. Im Container haette er damit die volle
# `stop_grace_period` (30min) abgesessen, statt zu enden — und mit BACKUP_BEIM_START=1
# haette er nach dem Stoppbefehl noch ein volles Backup begonnen.
#
# Der Ausgang ist mit Absicht NICHT 0: `vorbereiten` traegt auch `einmal`, und dort
# haengt `SUITE_BACKUP_CMD` im Rollout am Exit-Code. Eine 0 hiesse dort „gesichert",
# obwohl kein Lauf stattgefunden hat — und der Rollout zoege ohne Sicherung weiter.
beenden_pruefen() {
  [ "$beenden" -ne 0 ] || return 0
  protokoll "Beendigung waehrend des Vorlaufs angefordert — es wird nichts mehr begonnen."
  exit 1
}

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
    beenden_pruefen
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
  beenden_pruefen
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

# ⚠️ SIE SCHREIBT NUR, SOLANGE DIE SPERRE UNS GEHOERT. Alle vier Aufrufe stehen in
# `lauf_ungesperrt`, also in einem Lauf unter der Sperre — aber ein Lauf kann sie
# unterwegs verlieren (die Maschine stand laenger als die Altersgrenze, ein anderer hat
# uebernommen). Diese Datei ist der geteilte Stand, den der Healthcheck liest; wer sie
# ohne die Sperre schreibt, ueberschreibt das Ergebnis dessen, der gerade arbeitet.
#
# Die Pruefung steht HIER und nicht an den vier Aufrufstellen: so kann keine kuenftige
# hinzukommen, die sie vergisst. `sperre_gehoert_uns` ist weiter unten definiert — das
# geht, weil eine Shell Funktionen beim AUFRUF aufloest, nicht beim Lesen der Datei.
# ⚠️ EINE MARKE AUSSERHALB DES VOLUMES, UND GENAU DAS IST IHR ZWECK. Laesst sich der
# Stand nicht schreiben, ist das Volume selbst der Defekt — dort noch etwas ablegen zu
# wollen, waere zirkulaer. Der Healthcheck laeuft aber im SELBEN Container, also reicht
# eine Marke in dessen eigenem Dateisystem, um ihn sofort rot zu faerben.
#
# Ohne sie bliebe nur die Frist: der Healthcheck haette den alten `ok`-Stand gelesen und
# waere erst nach BACKUP_FRIST_STUNDEN (26h) umgesprungen. Bei leerem BACKUP_PING_URL ist
# er das einzige Signal — einen Tag zu spaet ist hier zu spaet.
#
# Sie ueberlebt bewusst kein `--force-recreate`: ein neuer Container laeuft in dieselbe
# Lage und setzt sie beim naechsten Versuch neu, und ein behobenes Volume soll nicht an
# einer alten Marke haengen bleiben.
NICHT_VERMERKT="${TMPDIR:-/tmp}/backup-sidecar.nicht-vermerkt"
nicht_vermerkt_setzen() { : >"$NICHT_VERMERKT" 2>/dev/null || true; }
nicht_vermerkt_loeschen() { rm -f "$NICHT_VERMERKT" 2>/dev/null || true; }

zustand_schreiben() {
  # status meldung
  if ! sperre_gehoert_uns; then
    warne "Der Stand wird NICHT geschrieben ($1: $2) — die Sperre gehoert uns nicht mehr."
    return 0
  fi
  # ⚠️ ERST DEN GANZEN INHALT BAUEN, DANN EINMAL SCHREIBEN — und beides pruefen. Wie es
  # vorher dastand (`{ printf … } >"$tmp"; mv …`), gab es zwei Arten, still zu scheitern,
  # und sie sehen VERSCHIEDEN aus. GEMESSEN, beide auf einem echten tmpfs:
  #
  #   VOLLES VOLUME:    jedes `printf` scheitert mit „I/O error", `$tmp` bleibt LEER —
  #                     und `mv` einer leeren Datei GELINGT. Die Funktion meldete 0, und
  #                     der gute Stand war durch eine leere Datei ersetzt: `letzter_erfolg`
  #                     weg, also genau die Angabe, aus der der Healthcheck „ueberfaellig"
  #                     ableitet.
  #   READ-ONLY VOLUME: schon die Umlenkung scheitert, `mv` findet nichts, Rueckgabe 1 —
  #                     die niemand las. Der alte `ok`-Stand blieb stehen, und der
  #                     Healthcheck meldete nach einem GESCHEITERTEN Lauf „gesund".
  #
  # Ein Inhalt in einer Variablen laesst sich in EINER Umlenkung schreiben und diese
  # pruefen; und `mv` laeuft erst, wenn dabei nichts schiefging.
  inhalt="letzter_versuch=$(date +%s)
letzter_status=$1
letzte_meldung=$2"
  if [ "$1" = "ok" ]; then
    inhalt="$inhalt
letzter_erfolg=$(date +%s)"
  else
    # Den frueheren Erfolg MITNEHMEN, nicht wegwerfen: „seit wann geht es schief"
    # ist die Frage, die morgens um acht zaehlt, und die Antwort steht nur hier.
    alt="$(zustand_lesen letzter_erfolg || true)"
    if [ -n "${alt:-}" ]; then
      inhalt="$inhalt
letzter_erfolg=$alt"
    fi
  fi

  tmp="$ZUSTANDSDATEI.neu.$$"
  if ! printf '%s\n' "$inhalt" >"$tmp" 2>/dev/null; then
    rm -f "$tmp" 2>/dev/null || true
    warne "Der Stand liess sich NICHT schreiben ($1: $2). Ist $BACKUP_DIR voll oder
  nur lesend eingehaengt? Der vorhandene Stand bleibt unangetastet."
    nicht_vermerkt_setzen
    return 1
  fi

  # ⚠️ NOCH EINMAL, UNMITTELBAR VOR DEM UMBENENNEN — UND DAS SCHLIESST DAS FENSTER NICHT,
  # es macht es so schmal, wie es hier geht. Zwischen der Pruefung oben und diesem `mv`
  # lagen bisher zwei `date`-Aufrufe, ein `zustand_lesen` (`sed` plus `tail`) und ein
  # Schreibvorgang — ein halbes Dutzend Prozessstarts. Jetzt liegt dazwischen nur noch
  # diese eine Zeile.
  #
  # ⚠️ EHRLICH BENANNT: das bleibt ein Pruefen-dann-Handeln, und genau davon habe ich in
  # diesem Skript schon zweimal gelernt, dass es das Fenster VERENGT und nicht SCHLIESST.
  # Bei der Sperre gab es dagegen ein Mittel — `rmdir` auf einen identitaetsgebundenen
  # Namen ist ein atomares Vergleiche-und-Tausche. Fuer „benenne nur um, wenn der Inhalt
  # des Ziels noch X ist" gibt es in POSIX kein Gegenstueck; ein echtes Fencing-Token
  # brauchte einen fortlaufenden Zaehler in genau dem Speicher, der hier abgesichert
  # werden soll. Was bliebe, waere der Schaden: EIN veralteter Gesundheitsstand, den der
  # naechste Lauf von selbst richtigstellt — kein Tarball geht verloren, keines wird
  # ueberschrieben (die Namen sind eindeutig, das Auslagern ist da laengst durch).
  if ! sperre_gehoert_uns; then
    rm -f "$tmp" 2>/dev/null || true
    warne "Die Sperre ging verloren, waehrend der Stand geschrieben wurde ($1: $2) — er
  wird NICHT veroeffentlicht."
    return 0
  fi

  if ! mv "$tmp" "$ZUSTANDSDATEI" 2>/dev/null; then
    rm -f "$tmp" 2>/dev/null || true
    warne "Der Stand liess sich NICHT schreiben ($1: $2). Ist $BACKUP_DIR voll oder
  nur lesend eingehaengt? Der vorhandene Stand bleibt unangetastet."
    nicht_vermerkt_setzen
    return 1
  fi
  nicht_vermerkt_loeschen
  return 0
}

# ⚠️ DER STARTVERMERK IST DER GRUND, WARUM DIE GNADENFRIST KURZ SEIN DARF. Vor dem ersten
# Lauf gibt es keinen Stand, und „kein Stand" sah aus wie „kaputt" — gedeckt wurde das
# durch ein `start_period` von 26 Stunden. Das deckte aber ALLES mit, auch einen
# GESPEICHERTEN Fehlschlag: `backup_data` ueberlebt ein `up -d --force-recreate`
# absichtlich, und ein neu erzeugter Container haette den Fehlschlag der letzten Nacht
# danach noch einen Tag lang als `starting` versteckt — bei leerem BACKUP_PING_URL das
# einzige Signal, das es gibt.
#
# Mit diesem Vermerk kann der Healthcheck die beiden Faelle selbst unterscheiden: „noch
# kein Lauf, aber seit kurzem bereit" ist gruen, „seit mehr als der Frist bereit und
# immer noch kein Lauf" ist rot, und ein gespeicherter Fehlschlag ist SOFORT rot. Die
# Gnadenfrist deckt dann nur noch das, wofuer sie da ist: die Sekunden zwischen dem Start
# des Containers und dieser Zeile.
#
# Er wird nur gesetzt, solange es keinen Lauf gibt — `zustand_schreiben` schreibt die
# Datei neu und laesst ihn fallen, was richtig ist: ab dem ersten Lauf zaehlt der Lauf.
#
# ⚠️ ER WIRD GESETZT, NICHT AUFGEFRISCHT, und das ist der Unterschied zwischen einer
# Zusicherung und ihrem Gegenteil: wuerde ihn jeder Start neu schreiben, setzte jeder
# Neustart die Uhr zurueck — ein Dienst, der oefter neu startet als er sichert, meldete
# sich dann nie als ueberfaellig. Ein Neustart entschuldigt keine fehlende Sicherung.
#
# ⚠️ ERST LESEN, DANN SCHREIBEN WAERE HIER FALSCH, und der Fall ist real: der Dienst
# startet, sieht keinen Stand — und waehrend er das feststellt, schreibt ein
# `docker compose run … einmal` daneben seinen ERFOLG in dieselbe Datei. Das `mv` haette
# ihn danach durch eine Datei ersetzt, in der nur `gestartet` steht: die gelungene
# Sicherung waere vergessen und der Healthcheck meldete „noch kein Lauf". Diese Zeile
# laeuft ausserhalb der Sperre und kann sich darauf auch nicht stuetzen — sie gehoert zum
# Start, nicht zu einem Lauf.
#
# `set -C` (noclobber) macht daraus EINE Operation: die Datei entsteht nur, wenn es sie
# nicht gibt, und sonst scheitert die Umlenkung. Damit gibt es kein Fenster zwischen
# Pruefung und Tat — und die beiden frueheren Pruefungen braucht es nicht mehr, denn
# beide Gruende (es gibt einen Lauf / es gibt den Vermerk schon) bedeuten dasselbe: die
# Datei ist da, also wird nichts geschrieben. Das ist zugleich die Zusicherung, dass der
# Vermerk GESETZT und nicht aufgefrischt wird — wuerde ihn jeder Start neu schreiben,
# setzte jeder Neustart die Uhr zurueck, und ein Dienst, der oefter neu startet als er
# sichert, meldete sich nie als ueberfaellig.
#
# Die Subshell haelt `set -C` lokal; ohne sie traefe noclobber jede spaetere Umlenkung.
zustand_bereit_vermerken() {
  ( set -C; printf 'gestartet=%s\n' "$(date +%s)" >"$ZUSTANDSDATEI" ) 2>/dev/null || true
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
  # ⚠️ EINE NULL LOESCHT ALLES UND MELDET ERFOLG — GEMESSEN, nicht hergeleitet. Die
  # Rotation unten laeuft ueber `tail -n +$((KEEP + 1))`, und `tail -n +1` gibt die GANZE
  # Liste aus: jedes Archiv am Ziel wandert in die Loeschliste, auch das gerade
  # hochgeladene. Danach kehrt `auslagern` mit 0 zurueck, der Zustand steht auf `ok` und
  # der Ping meldet Erfolg — gemessen blieben null Generationen am Ziel bei gruenem Lauf.
  # Wer die Rotation abschalten will, schreibt `aus`; eine Null ist ein Tippfehler, und
  # ein Tippfehler darf keine Sicherungen kosten. Nicht geloescht und laut gesagt.
  case "$BACKUP_RCLONE_KEEP" in
    '' | *[!0-9]*)
      warne "BACKUP_RCLONE_KEEP=\"$BACKUP_RCLONE_KEEP\" ist keine Zahl — am Ziel wird NICHTS
  geloescht. Gemeint war vermutlich eine Zahl oder `aus`."
      return 0
      ;;
  esac
  if [ "$BACKUP_RCLONE_KEEP" -lt 1 ]; then
    warne "BACKUP_RCLONE_KEEP=$BACKUP_RCLONE_KEEP wuerde JEDE Generation am Ziel loeschen,
  auch die gerade hochgeladene — es wird NICHTS geloescht. Zum Abschalten `aus` setzen."
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
  #
  # ⚠️ MIT EINER AUSNAHME, UND DIE IST EINMAL IM JAHR ECHT: der Stempel ist ORTSZEIT, und
  # die Wiederholstunde am Ende der Sommerzeit ist kein monoton wachsender Zeitpunkt.
  # In der Nacht der Rueckstellung sortiert eine Sicherung aus der zweiten 02-Stunde VOR
  # eine aeltere aus der ersten. Die Folge ist begrenzt und kostet keine Daten: beim
  # Trimmen faellt von zwei Generationen DERSELBEN Nacht die falsche der beiden zuerst.
  # Auf einen Stempel in UTC umzustellen waere die saubere Loesung fuer diesen einen
  # Nachteil und erkauft ihn mit einem, der jeden Tag gilt — der Name im Runbook und
  # beim Wiederherstellen laese sich dann nicht mehr als die Uhrzeit, zu der gesichert
  # wurde. Deshalb bleibt es bei Ortszeit; die Eindeutigkeit des Namens sichert
  # `backup.sh` ohnehin getrennt davon (es wartet auf die naechste freie Sekunde).
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
  # Rotation in `backup.sh`. Die Ausnahme (Wiederholstunde) steht oben bei `lsf`.
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

# Der Name der Marke, die DIESER Prozess gesetzt hat — sein Besitznachweis. Die Freigabe
# braucht ihn (siehe `sperre_ablegen`).
#
# ⚠️ DAS SETZEN IST EIN ZWEITER SCHRITT, UND DER DARF NICHT BLIND GELINGEN. Zwischen dem
# `mkdir` der Sperre und dem `mkdir` der Marke liegt ein Fenster. Es ist normalerweise
# Millisekunden schmal — aber „normalerweise" ist keine Zusicherung: haelt die Maschine
# an (Host-Suspend, eingefrorener Container, ein stehendes Dateisystem), sieht ein
# Wartender eine Sperre OHNE Marke, haelt sie nach 60s fuer einen halb angelegten Rest
# und uebernimmt sie — zu Recht. Der Erste wacht danach auf und setzt seine Marke in die
# Sperre des ZWEITEN.
#
# GEMESSEN mit einem Halt von 8s zwischen den beiden `mkdir` und einer auf 5min
# zurueckdatierten Sperre: „B: haelt die Sperre" UND „A: haelt die Sperre", zwei Marken
# im Verzeichnis. Genau die Gleichzeitigkeit, gegen die es die Sperre gibt.
#
# Der Riegel ist derselbe wie ueberall hier: eine Bedingung auf die IDENTITAET. Eine
# ordentlich gehaltene Sperre traegt GENAU EINE Marke. Steht nach unserem `mkdir` eine
# zweite da, gehoert die Sperre inzwischen jemand anderem — dann nehmen wir unsere
# zurueck und treten zurueck.
#
# ⚠️ Treffen sich beide genau hier, treten BEIDE zurueck und die Sperre bleibt leer
# liegen. Das ist die richtige der beiden Fehlerarten (keiner laeuft statt zweien), und
# es loest sich von selbst: eine leere Sperre ist nach 60s wieder uebernehmbar.
meine_marke=""
sperre_marke_setzen() {
  meine_marke="eigner.$$.$(date +%s)"
  if ! mkdir "$SPERRVERZEICHNIS/$meine_marke" 2>/dev/null; then
    meine_marke=""
    return 1
  fi
  if [ "$(ls "$SPERRVERZEICHNIS" 2>/dev/null | wc -l)" -ne 1 ]; then
    rmdir "$SPERRVERZEICHNIS/$meine_marke" 2>/dev/null || true
    meine_marke=""
    return 1
  fi
  return 0
}

# Haelt DIESER Prozess die Sperre noch? Der Besitznachweis ist die eigene Marke: liegt
# sie nicht mehr im Sperrverzeichnis, hat jemand anderes uebernommen.
sperre_gehoert_uns() {
  [ -n "$meine_marke" ] && [ -d "$SPERRVERZEICHNIS/$meine_marke" ]
}

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
  # Auch hier zaehlt erst die Marke als Besitz, nicht schon das `mkdir`.
  sperre_marke_setzen || return 1
  return 0
}

sperre_holen() {
  # `mkdir` allein entscheidet ueber den Besitz — hier wie bei der Uebernahme.
  if mkdir "$SPERRVERZEICHNIS" 2>/dev/null; then
    # Das `mkdir` ist die halbe Belegung; besetzt ist sie erst mit der Marke.
    sperre_marke_setzen || return 1
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
#
# ⚠️ ZWEI DINGE, DIE BEIDE GEMESSEN SIND UND VON DENEN DAS ZWEITE ALLES ANHAELT.
#
# ERSTENS haelt ein Herzschlag ohne Besitzpruefung eine FREMDE Sperre jung. Wurde die
# unsere inzwischen uebernommen, frischt er die des Nachfolgers auf — und deren eigene
# Altersgrenze griffe nie mehr. Deshalb wird vor jedem `touch` geprueft, ob dort noch
# UNSERE Marke liegt; liegt sie nicht mehr, ist der Herzschlag fertig.
#
# ZWEITENS, und das ist der teure Teil: `touch` LEGT AN, was es nicht findet. Eine
# Uebernahme besteht aus `rmdir` und `mkdir`; faellt der Herzschlag genau dazwischen,
# entsteht `.lauf.sperre` als REGULAERE DATEI — und dann scheitert jedes kuenftige
# `mkdir` daran. Nicht einmal, sondern fuer immer: die Sicherung stuende dauerhaft still,
# und kein Lauf koennte sie je wieder aufnehmen. GEMESSEN, genau so nachgestellt:
#
#   Danach ist .lauf.sperre: REGULAERE DATEI
#   mkdir SCHEITERT — Backups dauerhaft blockiert
#
# `touch -c` legt nicht an (POSIX), und die Besitzpruefung davor schliesst das Fenster
# ohnehin — beides zusammen, weil eine der beiden allein je auf die andere baute.
herzschlag_starten() {
  eltern=$$
  marke="$meine_marke"
  (
    while [ -n "$marke" ] && [ -d "$SPERRVERZEICHNIS/$marke" ] && kill -0 "$eltern" 2>/dev/null; do
      sleep "$BACKUP_HERZSCHLAG_SEKUNDEN" || exit 0
      # Nach dem Schlaf ERNEUT pruefen: in der Zwischenzeit kann die Sperre den
      # Eigentuemer gewechselt haben, und dann ist sie nicht mehr unsere aufzufrischen.
      [ -d "$SPERRVERZEICHNIS/$marke" ] || exit 0
      touch -c "$SPERRVERZEICHNIS" 2>/dev/null || exit 0
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
# ⚠️ DIE FREIGABE PRUEFT DEN BESITZ, SONST LOESCHT SIE EINE FREMDE SPERRE. `haelt_sperre`
# allein sagt nur, dass wir sie EINMAL hatten — nicht, dass wir sie noch haben. Verliert
# ein Lauf seine Pacht (Herzschlag tot, Container nach einer Pause jenseits der
# Altersgrenze wieder da), uebernimmt ein anderer ordnungsgemaess und setzt SEINE Marke;
# ein `rm -rf` von uns riss sie danach weg, und ein dritter Lauf konnte neben dem zweiten
# starten. GEMESSEN: fremde Marke gesetzt, erster Lauf beendet — die fremde Sperre war weg.
#
# `rmdir` auf die EIGENE Marke ist der Nachweis: es gelingt nur, wenn sie noch da ist.
# Danach raeumt `rmdir` das Verzeichnis selbst weg — und auch das nur, wenn es leer ist.
sperre_ablegen() {
  herzschlag_beenden
  [ "$haelt_sperre" -eq 1 ] || return 0
  haelt_sperre=0
  if [ -n "$meine_marke" ] && ! rmdir "$SPERRVERZEICHNIS/$meine_marke" 2>/dev/null; then
    warne "Die Sperre traegt nicht mehr unsere Marke — sie wird NICHT freigegeben.
  Ein anderer Lauf hat sie uebernommen, waehrend dieser noch arbeitete."
    meine_marke=""
    return 0
  fi
  meine_marke=""
  rmdir "$SPERRVERZEICHNIS" 2>/dev/null || true
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

  # ⚠️ DER ZAUN. Bis hierher kann viel Zeit vergangen sein — ein grosses `tar` dauert.
  # Stand die Maschine zwischendurch laenger als die Altersgrenze, hat inzwischen ein
  # anderer Lauf die Sperre uebernommen und arbeitet. Der Herzschlag merkt das und endet,
  # und die Freigabe fasst eine fremde Sperre nicht an — aber BEIDES HAELT DIESEN LAUF
  # NICHT AUF. Ohne diese Stelle liefe er weiter in genau die geteilten Dinge hinein,
  # gegen die es die Sperre gibt: dieselbe Rotation am Ziel und dieselbe Zustandsdatei.
  #
  # Das lokale Tarball ist dabei nicht das Problem — es traegt seit dem Wartelauf in
  # `backup.sh` einen eindeutigen Namen. Das Auslagern und der Zustand sind es.
  if ! sperre_gehoert_uns; then
    meldung="Die Sperre gehoert uns nicht mehr — ein anderer Lauf hat uebernommen. $tarball
  liegt lokal; ausgelagert und vermerkt wird NICHT, das ist Sache des neuen Laufs."
    warne "$meldung"
    return 1
  fi

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
  # ⚠️ EINE ABLESUNG, NICHT DREI. Drei `date`-Aufrufe koennen einen Sekunden- oder
  # Stundenwechsel umspannen, und dann setzt sich `jetzt` aus Feldern VERSCHIEDENER
  # Zeitpunkte zusammen. Nachgerechnet mit einer Attrappe, die zwischen dem ersten und
  # dem zweiten Aufruf von 03:59:59 auf 04:00:00 rollt: abgelesen wurden 03:00:00 — eine
  # Stunde rueckwaerts.
  #
  # Das Symptom kommt dabei erst eine Runde SPAETER und sieht nach etwas anderem aus:
  # der Rest faellt zuerst nur (84601 → 1800), und beim naechsten, korrekten Ablesen
  # springt er wieder hoch (1800 → 84570). Dieser Sprung ist genau das Zeichen, an dem
  # die Schleife „Zielzeit ueberschritten" erkennt — sie startet also einen ungeplanten
  # Lauf, Stunden vor der Zeit.
  uhr="$(date '+%H %M %S')"
  uhr_rest="${uhr#* }"
  jetzt=$(( $(ohne_null "${uhr%% *}") * 3600 \
          + $(ohne_null "${uhr_rest%% *}") * 60 \
          + $(ohne_null "${uhr_rest##* }") ))
  rest=$((ziel - jetzt))
  [ "$rest" -gt 0 ] || rest=$((rest + 86400))
  echo "$rest"
}

# Ohne diese Falle stirbt der Container beim `docker compose stop` erst nach der
# Gnadenfrist per SIGKILL — mitten in einem laufenden `tar`, was ein halbes Tarball
# hinterliesse. Mit ihr endet die Schleife an ihrer naechsten Prüfstelle.
trap 'beenden=1' TERM INT

schleife() {
  # Vor dem Protokoll: ab hier laeuft der Zeitgeber, und genau das vermerkt er.
  zustand_bereit_vermerken
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
  # ⚠️ ZUERST: KONNTE DER LETZTE LAUF SEIN ERGEBNIS UEBERHAUPT HINTERLEGEN? Wenn nicht,
  # ist alles, was danach in der Zustandsdatei steht, VERALTET — und ein alter `ok`-Stand
  # ist dann die gefaehrlichste Auskunft von allen. Diese Zeile steht deshalb vor jedem
  # Lesen der Datei.
  if [ -f "$NICHT_VERMERKT" ]; then
    echo "der letzte Lauf konnte seinen Stand nicht schreiben — $BACKUP_DIR voll oder nur lesend?"
    return 1
  fi
  status="$(zustand_lesen letzter_status || echo '')"
  meldung="$(zustand_lesen letzte_meldung || echo '')"
  erfolg="$(zustand_lesen letzter_erfolg || echo '')"
  gestartet="$(zustand_lesen gestartet || echo '')"

  # ⚠️ ZUERST DER FALL „NOCH KEIN LAUF", UND ZWAR GETRENNT VOM FEHLSCHLAG. Beides in eine
  # lange Gnadenfrist zu packen war der Fehler: der eine Fall ist harmlos und geht
  # vorueber, der andere ist die Meldung selbst. Getrennt darf die Frist kurz sein.
  if [ -z "$status" ]; then
    case "$gestartet" in
      '' | *[!0-9]*)
        echo "kein Lauf und kein Startvermerk — der Dienst ist nicht bis zur Schleife gekommen"
        return 1
        ;;
    esac
    alter=$(( $(date +%s) - gestartet ))
    if [ "$alter" -gt $((BACKUP_FRIST_STUNDEN * 3600)) ]; then
      echo "seit $((alter / 3600))h bereit, aber noch kein Lauf — Frist sind ${BACKUP_FRIST_STUNDEN}h"
      return 1
    fi
    echo "noch kein Lauf, seit $((alter / 3600))h bereit"
    return 0
  fi

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
