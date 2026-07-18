#!/usr/bin/env bash
# Dünner erster Wurf: konsistenter SQLite-Backup je Modul + tar, lokal, rotiert.
# Läuft als Host-Cron; benötigt sqlite3 + tar. Externes Ziel (rclone/rsync) folgt
# bei einem späteren Modul.
set -euo pipefail

DATA_DIR="${DATA_DIR:-/data}"
BACKUP_DIR="${BACKUP_DIR:-$DATA_DIR/backups}"
KEEP="${BACKUP_KEEP:-7}"

stamp="$(date +%Y%m%dT%H%M%S)"
work="$BACKUP_DIR/$stamp"
mkdir -p "$work"

shopt -s nullglob
found=0
for db in "$DATA_DIR"/*.db; do
  found=1
  sqlite3 "$db" ".backup '$work/$(basename "$db")'"
done
if [ "$found" -eq 0 ]; then
  echo "backup: no *.db in $DATA_DIR — nothing to do" >&2
fi

tar -czf "$work.tar.gz" -C "$BACKUP_DIR" "$stamp"
rm -rf "$work"

# Rotation: nur die neuesten $KEEP Tarballs behalten.
ls -1t "$BACKUP_DIR"/*.tar.gz 2>/dev/null | tail -n +"$((KEEP + 1))" | xargs -r rm -f

echo "backup: wrote $work.tar.gz"
