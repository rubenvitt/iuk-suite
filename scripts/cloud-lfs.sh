#!/usr/bin/env bash
# Holt die LFS-Medien in einer Cloud-Session (Claude Code on the web) — DRK-368.
#
# Die Cloud-Umgebung bringt kein git-lfs mit; der frische Klon trägt unter
# public/ an Stelle jedes Bildes eine ~130 Byte große Zeigerdatei, und
# src/lfs-medien.test.ts ist dort dauerhaft rot. Der Test wird bewusst NICHT
# übersprungen: er ist der Wächter, der das Ausliefern von Zeigerdateien
# (29.08.2026) verhindert. Gemessen: apt-Installation wenige Sekunden,
# `git lfs pull` unter 2 s für 1,3 MB.
#
# Aufruf als SessionStart-Hook oder aus dem Setup-Skript der Umgebung. Außerhalb
# der Cloud (CLAUDE_CODE_REMOTE nicht "true") tut es nichts, außer mit --immer.
#
# Scheitert etwas, bricht das Skript den Sitzungsstart NICHT ab — es meldet es
# hier, und der Wächter meldet es beim nächsten `pnpm vitest run` noch einmal.
# Laut ist besser als still; ein abgebrochener Start hilft niemandem.

[ "${CLAUDE_CODE_REMOTE:-}" = "true" ] || [ "${1:-}" = "--immer" ] || exit 0
cd "$(dirname "$0")/.." || exit 0

warnung() { echo "DRK-368: $1 — src/lfs-medien.test.ts wird rot sein." >&2; exit 0; }

if ! git lfs version >/dev/null 2>&1; then
  als_root=""
  [ "$(id -u)" = "0" ] || als_root="sudo -n"
  export DEBIAN_FRONTEND=noninteractive
  $als_root apt-get install -y -qq git-lfs >/dev/null 2>&1 \
    || { $als_root apt-get update -qq >/dev/null 2>&1 && $als_root apt-get install -y -qq git-lfs >/dev/null 2>&1; } \
    || warnung "git-lfs ließ sich nicht installieren"
fi

git lfs install --local >/dev/null 2>&1 || warnung "git lfs install schlug fehl"
git lfs pull >/dev/null 2>&1 || warnung "git lfs pull schlug fehl"
echo "DRK-368: git-lfs bereit, $(git lfs ls-files | wc -l | tr -d ' ') Medien geholt."
