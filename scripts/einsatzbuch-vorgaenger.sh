#!/usr/bin/env bash
# Kompatibilität der Einsatzbuch-App mit ihrem letzten Release (DRK-488): Jede neue Version muss
# lesen, was die Version davor geschrieben hat, und die Version davor muss lesen, was die neue
# schreibt. Gerufen vom Job `vorgaenger` in `.github/workflows/einsatzbuch.yml`, lokal genauso:
#
#   scripts/einsatzbuch-vorgaenger.sh                # gegen das letzte Release vor HEAD
#   scripts/einsatzbuch-vorgaenger.sh einsatzbuch-v1.0.0
#
# VORGÄNGER ist der höchste Tag `einsatzbuch-vX.Y.Z`, der von HEAD aus erreichbar ist und nicht
# auf HEAD selbst zeigt (beim Notfallweg trägt HEAD den eigenen Tag). Braucht die Tags im Klon
# (`fetch-depth: 0`). Das Release wird als eigener Worktree ausgecheckt, der Klon bleibt unberührt.
#
# Vier Proben, jede muss genau einen Test fahren (ein umbenannter Test fiele sonst still durch):
#
#   1. HEAD schreibt eine Formatprobe (Sicherung und Datenbank, `kern/tests/vorgaenger.rs`).
#   2. Das Release liest sie: wiederherstellen, prüfen, weiter versiegeln.
#   3. Das Release schreibt seine Probe, HEAD liest sie und übernimmt dazu die Datenbank
#      (der Weg eines Updates).
#   4. Das Release liest die Drahtbeispiele der Suite aus HEAD
#      (`src/app/m/einsatzbuch/_lib/anbindung/vertrag/`): Die Suite spricht nach dem Merge noch
#      mit jedem Rechner, der das Update nicht hat.
#
# Ein Release ohne `kern/tests/vorgaenger.rs` (`einsatzbuch-v1.0.0`) bekommt die Datei aus HEAD.
# Scheitert eine Probe an einer gewollten Formatänderung, gilt die Zwei-Schritt-Regel im Runbook
# docs/runbooks/einsatzbuch-release.md („Kompatibilität mit dem letzten Release“).
set -euo pipefail

wurzel=$(git rev-parse --show-toplevel)
cd "$wurzel"
KERN=apps/einsatzbuch/src-tauri
VERTRAG=src/app/m/einsatzbuch/_lib/anbindung/vertrag

if [ $# -ge 1 ]; then
  tag=$1
else
  kopf=$(git rev-parse HEAD)
  tag=$(git tag --list 'einsatzbuch-v*' --merged HEAD \
    | grep -E '^einsatzbuch-v[0-9]+\.[0-9]+\.[0-9]+$' \
    | while read -r t; do [ "$(git rev-parse "$t^{commit}")" != "$kopf" ] && echo "$t"; done \
    | sort -V | tail -n 1 || true)
fi
if [ -z "$tag" ]; then
  echo "::notice::Noch kein Einsatzbuch-Release vor diesem Stand, nichts zu vergleichen."
  exit 0
fi
echo "Vorgänger: $tag"

arbeit=$(mktemp -d)
alt="$arbeit/vorgaenger"
aufraeumen() {
  git worktree remove --force "$alt" >/dev/null 2>&1 || true
  rm -rf "$arbeit"
}
trap aufraeumen EXIT
# Ohne LFS-Filter: Der Kern braucht keine Icons, und die Zeigerdateien genügen.
GIT_LFS_SKIP_SMUDGE=1 git worktree add --detach --quiet "$alt" "$tag"

if [ ! -f "$alt/$KERN/kern/tests/vorgaenger.rs" ]; then
  echo "$tag hat keine eigene Formatprobe, sie kommt aus diesem Stand."
  cp "$KERN/kern/tests/vorgaenger.rs" "$alt/$KERN/kern/tests/vorgaenger.rs"
fi

# Fährt genau einen Test des Kerns in `$1` und scheitert, wenn keiner lief.
fahre() {
  local wo=$1 datei=$2 test=$3 ausgabe
  shift 3
  echo "::group::$test ($datei) in $([ "$wo" = "$wurzel" ] && echo HEAD || echo "$tag")"
  if ! ausgabe=$(cd "$wo/$KERN" && env "$@" cargo test -p einsatzbuch-kern --locked --test "$datei" "$test" -- --exact --nocapture 2>&1); then
    echo "$ausgabe"
    echo "::endgroup::"
    echo "::error::$test ($datei) scheitert in $([ "$wo" = "$wurzel" ] && echo HEAD || echo "$tag")."
    return 1
  fi
  echo "$ausgabe" | tail -n 8
  echo "::endgroup::"
  if ! grep -q "test result: ok. 1 passed" <<<"$ausgabe"; then
    echo "::error::$test ($datei) lief nicht genau einmal – umbenannt? Der Name ist Vertrag (kern/tests/vorgaenger.rs)."
    return 1
  fi
}

neu_probe="$arbeit/probe-neu"
alt_probe="$arbeit/probe-alt"

fahre "$wurzel" vorgaenger probe_schreiben EINSATZBUCH_FORMATPROBE_SCHREIBEN="$neu_probe"
fahre "$alt" vorgaenger probe_lesen EINSATZBUCH_FORMATPROBE_LESEN="$neu_probe"
fahre "$alt" vorgaenger probe_schreiben EINSATZBUCH_FORMATPROBE_SCHREIBEN="$alt_probe"
fahre "$wurzel" vorgaenger probe_lesen EINSATZBUCH_FORMATPROBE_LESEN="$alt_probe" EINSATZBUCH_FORMATPROBE_BUCH=1

# Nur die Beispiele, die das Release schon kennt: Ein neuer Endpunkt ist ihm fremd, und sein
# Test zählt die Dateien.
for datei in "$alt/$VERTRAG"/*.json; do
  cp "$VERTRAG/$(basename "$datei")" "$datei"
done
fahre "$alt" vertrag jede_fixture_liest_sich_mit_ihrem_typ_und_lehnt_fremde_felder_ab

echo "Kompatibel mit $tag: Formatprobe in beide Richtungen, Datenbank-Übernahme und Drahtvertrag."
