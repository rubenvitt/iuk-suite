#!/usr/bin/env bash
# Dünner erster Wurf: konsistenter SQLite-Backup je Modul + tar, lokal, rotiert.
# Läuft als Host-Cron; benötigt sqlite3 + tar. Externes Ziel (rclone/rsync) folgt
# bei einem späteren Modul.
set -euo pipefail

DATA_DIR="${DATA_DIR:-/data}"
BACKUP_DIR="${BACKUP_DIR:-$DATA_DIR/backups}"
KEEP="${BACKUP_KEEP:-7}"

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

tar -czf "$work.tar.gz" -C "$BACKUP_DIR" "$stamp"
rm -rf "$work"

# Rotation: nur die neuesten $KEEP Tarballs behalten. Wir haben gerade eines
# geschrieben, das Glob matcht also >=1; mit nullglob AUS bleibt ein (hier
# unmöglicher) Leermatch literal und ls scheitert harmlos, statt das CWD zu listen.
ls -1t "$BACKUP_DIR"/*.tar.gz | tail -n +$((KEEP + 1)) | xargs -r rm -f

echo "backup: wrote $work.tar.gz"
