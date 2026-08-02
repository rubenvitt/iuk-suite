#!/usr/bin/env bash
# Dünner erster Wurf: konsistenter SQLite-Backup je Modul + tar, lokal, rotiert.
# Läuft als Host-Cron; benötigt sqlite3, tar + rsync. Externes Ziel (rclone) folgt
# bei einem späteren Modul.
set -euo pipefail

DATA_DIR="${DATA_DIR:-/data}"
BACKUP_DIR="${BACKUP_DIR:-$DATA_DIR/backups}"
# BACKUP_KEEP multipliziert ab dem Modul `files` die BLOB-Menge, nicht mehr nur ein
# paar hundert kB DBs: 7 Generationen sind 7x die Ablage. Wer hier hochgeht, prueft
# den freien Platz — ein vollgelaufenes Ziel laesst das Backup genau dann scheitern,
# wenn man es braucht.
KEEP="${BACKUP_KEEP:-7}"

# Der Ort der files-Blobs ist eine EIGENE Variable und nicht fest `$DATA_DIR/files`:
# liegen die Blobs im eigenen benannten Volume, ist `$DATA_DIR/files` host-seitig ein
# LEERER Mountpunkt — das tar sicherte nichts und meldete Erfolg. Der Rueckfall gilt
# fuer die Lage ohne eigenen Mount (Dev, und der Zustand vor der Compose-Aenderung).
#   Benanntes Volume (Vorgabe): BLOB_DIR=/var/lib/docker/volumes/files_data/_data
#   Bind-Mount:                 BLOB_DIR=/srv/iuk-suite/files
BLOB_DIR="${BLOB_DIR:-$DATA_DIR/files}"

# DBs einsammeln. nullglob NUR hier, danach sofort wieder aus — sonst leakt es in
# das Rotations-Glob unten und ein leerer Match würde dort zum CWD-Listing/rm.
shopt -s nullglob
dbs=("$DATA_DIR"/*.db)
shopt -u nullglob

# Keine DB = mit hoher Wahrscheinlichkeit falsch konfiguriertes DATA_DIR
# (Tippfehler, ungemountetes Volume). Hart abbrechen statt ein leeres Tarball zu
# schreiben und Erfolg zu melden — Cron soll das sehen.
if [ "${#dbs[@]}" -eq 0 ]; then
  echo "backup: no *.db in $DATA_DIR — aborting (misconfigured DATA_DIR?)" >&2
  exit 1
fi

stamp="$(date +%Y%m%dT%H%M%S)"
work="$BACKUP_DIR/$stamp"
mkdir -p "$work"

for db in "${dbs[@]}"; do
  sqlite3 "$db" ".backup '$work/$(basename "$db")'"
done

# Die Blobs wandern VOR dem einen tar in das Arbeitsverzeichnis. Ein `tar -rf` an das
# gzip-Archiv unten ist unmoeglich ("Cannot append to compressed archive") und braeche
# unter `set -euo pipefail` den GANZEN Lauf ab, auch fuer portal, qr und feedback.
# rsync und nicht `cp -al`: Hardlinks scheitern ueber eine Dateisystemgrenze, und
# BLOB_DIR liegt je nach Betriebsart in einem anderen Volume-Root als DATA_DIR.
# `*.part` sind halbe Uploads und gehoeren nicht ins Backup.
# Konsistenz ohne Freeze reicht hier, und der Grund ist nicht offensichtlich: eine
# Blob-Datei entsteht ausschliesslich per atomarem rename und wird danach NIE
# veraendert. Das rsync liefert deshalb je Datei einen konsistenten Stand; es kann nur
# Dateien VERPASSEN, die waehrend des Laufs entstehen — derselbe Vorbehalt wie bei
# jedem inkrementellen Backup. Existiert das Verzeichnis nicht (vor dem ersten
# Upload), ist das kein Fehler; ein nacktes rsync naehme hier alles mit.
if [ -d "$BLOB_DIR" ]; then
  rsync -a --exclude='*.part' "$BLOB_DIR/" "$work/files/"
fi

# Der stille Fall: vollstaendige Zeilen in der DB, aber kein einziger Blob kopiert
# (falsch belegtes BLOB_DIR, leerer Mountpunkt). Dieselbe Linie wie der Abbruch oben
# bei "keine *.db gefunden": kein unbrauchbares Tarball schreiben und Erfolg melden.
# Gelesen wird die KOPIE in $work, nie die laufende DB — und gezaehlt wird ebenfalls in
# $work, weil erst das den Erfolg des rsync belegt und nicht bloss die Quelle.
# Die Bedingung auf -f und das `|| echo 0` sind Pflicht, nicht Vorsicht: vor dem ersten
# files-Deploy gibt es weder die Datei noch die Tabelle, und eine nackte Abfrage naehme
# unter pipefail das Backup der anderen drei Module mit.
if [ -f "$work/files.db" ]; then
  # BEIDE Tabellen, und bewusst in ZWEI Abfragen: das Modul hat zwei Richtungen,
  # und ein Bestand, der nur aus Inbox-Uploads besteht, ist derselbe stille Fall
  # wie einer nur aus Freigaben (gemessen: leere share_files + eine vollstaendige
  # Zeile in inbox_files + leeres $DATA_DIR/files ergaben exit 0 und ein Tarball
  # mit leerem files/). Eine kombinierte Abfrage waere kuerzer, faellt aber ganz
  # aus, sobald EINE der Tabellen fehlt — und genau das ist der Zustand vor dem
  # ersten files-Deploy, in dem das Backup der anderen drei Module weiterlaufen
  # muss. Deshalb je ein `|| echo 0`.
  zeilen_share="$(sqlite3 "$work/files.db" \
    "select count(*) from share_files where bytes_vollstaendig_at is not null" \
    2>/dev/null || echo 0)"
  zeilen_inbox="$(sqlite3 "$work/files.db" \
    "select count(*) from inbox_files where bytes_vollstaendig_at is not null" \
    2>/dev/null || echo 0)"
  [ -n "$zeilen_share" ] || zeilen_share=0
  [ -n "$zeilen_inbox" ] || zeilen_inbox=0
  zeilen=$((zeilen_share + zeilen_inbox))
  blobs=0
  if [ -d "$work/files" ]; then
    blobs="$(find "$work/files" -type f | wc -l | tr -d ' ')"
  fi
  if [ "$zeilen" -gt 0 ] && [ "$blobs" -eq 0 ]; then
    echo "backup: $zeilen complete rows in files.db but no blobs from $BLOB_DIR — aborting" >&2
    # Das halbe Arbeitsverzeichnis abraeumen: die Rotation unten fasst nur *.tar.gz an,
    # ein Rest bliebe also bei jedem Cron-Lauf liegen und saehe wie ein Backup aus.
    rm -rf "$work"
    exit 1
  fi
fi

tar -czf "$work.tar.gz" -C "$BACKUP_DIR" "$stamp"
rm -rf "$work"

# Rotation: nur die neuesten $KEEP Tarballs behalten. Wir haben gerade eines
# geschrieben, das Glob matcht also >=1; mit nullglob AUS bleibt ein (hier
# unmöglicher) Leermatch literal und ls scheitert harmlos, statt das CWD zu listen.
ls -1t "$BACKUP_DIR"/*.tar.gz | tail -n +$((KEEP + 1)) | xargs -r rm -f

echo "backup: wrote $work.tar.gz"
