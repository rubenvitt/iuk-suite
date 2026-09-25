import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

/**
 * DIE BILDNACHWEISE IM BACKUP (DRK-365). Bis dahin sicherte `scripts/backup.sh` nur die
 * `*.db` und die Blobs von `files` — ein Restore enthielt `aufgaben.db` mit Verweisen auf
 * Bilder, die es nicht gab, und das Backup meldete Erfolg.
 *
 * Ein Quelltext-Scan aus demselben Grund wie `files/_lib/backup.test.ts`: ein echter Lauf
 * braucht `sqlite3` und `rsync` auf dem Laeufer und ist deshalb kein Tor. Was der Scan
 * besitzt, ist die REIHENFOLGE — rsync nach dem `tar` oder die Pruefung nach dem `tar`
 * waeren beide still. Den echten Lauf (Zeile ohne Blob → exit 1, Zeile mit Blob →
 * `aufgaben/<id>` im Tarball, Tabelle fehlt → exit 0) ist am 24.09.2026 gemessen.
 */

const WURZEL = path.resolve(__dirname, "../../../../..");
const quelle = readFileSync(path.join(WURZEL, "scripts/backup.sh"), "utf8");
const zeilen = quelle.split("\n");

/** Erste BEFEHLSZEILE mit `teil` — ein erklaerender Kommentar zaehlt nicht. */
function zeileMit(teil: string): number {
  const i = zeilen.findIndex((z) => !z.trim().startsWith("#") && z.includes(teil));
  expect(i, `scripts/backup.sh fuehrt eine Befehlszeile mit "${teil}"`).toBeGreaterThanOrEqual(0);
  return i;
}

describe("scripts/backup.sh — die Bildnachweise von `aufgaben`", () => {
  it("AUFGABEN_DIR ist eine eigene Variable mit der Vorgabe, die `ablage.ts` beschreibt", () => {
    // `ablageWurzel()` loest `DATA_DIR/aufgaben` auf. Laufen die beiden auseinander,
    // sichert das Skript einen Ordner, in den niemand schreibt.
    expect(quelle).toMatch(/^AUFGABEN_DIR="\$\{AUFGABEN_DIR:-\$DATA_DIR\/aufgaben\}"$/m);
    const ablage = readFileSync(path.join(__dirname, "ablage.ts"), "utf8");
    expect(ablage).toContain('resolve(process.env.DATA_DIR ?? "./.data", "aufgaben")');
    // Die Belegung fuer den Aufruf von Hand muss dastehen — sonst sieht der Betreiber
    // keinen Fehler, nur ein zu kleines Tarball.
    expect(quelle).toContain("AUFGABEN_DIR=/var/lib/docker/volumes/aufgaben_data/_data");
  });

  it("kopiert per rsync MIT abschliessendem Schraegstrich, nur wenn das Verzeichnis existiert", () => {
    // Ohne Slash entstuende `$work/aufgaben/aufgaben/…`: der Riegel zaehlte trotzdem
    // Dateien, die Wiederherstellung griffe ins Leere.
    expect(quelle).toContain('rsync -a "$AUFGABEN_DIR/" "$work/aufgaben/"');
    const i = zeileMit('rsync -a "$AUFGABEN_DIR/"');
    // Vor dem ersten Bildnachweis gibt es das Verzeichnis nicht; ein nacktes rsync naehme
    // unter `set -euo pipefail` das Backup ALLER Module mit.
    expect(zeilen[i - 1]).toContain('[ -d "$AUFGABEN_DIR" ]');
  });

  it("bricht ab, wenn `dateien` Zeilen hat, aber kein Blob kopiert wurde", () => {
    const i = zeileMit('[ -f "$work/aufgaben.db" ]');
    const bis = zeileMit("tar -czf");
    const block = zeilen.slice(i, bis).join("\n");
    // Die KOPIE lesen, nie die laufende DB; `|| echo 0`, weil vor der ersten Migration
    // die Tabelle fehlt und das Backup der anderen Module trotzdem laufen muss.
    expect(block).toContain('sqlite3 "$work/aufgaben.db" "select count(*) from dateien"');
    expect(block).toContain("|| echo 0");
    // Die Bedingung selbst, nicht nur ihre Existenz — `-lt`/`-ne` liessen den Block
    // unveraendert dastehen und nie feuern.
    expect(block).toContain('[ "$zeilen_aufgaben" -gt 0 ]');
    expect(block).toContain('[ "$blobs_aufgaben" -eq 0 ]');
    // Ohne `-type f` zaehlte `find` das leere Verzeichnis selbst mit (blobs = 1), ohne
    // den `-d`-Wrapper stirbt der Lauf vor dem ersten Bildnachweis — beides wie bei `files`.
    expect(block).toContain('find "$work/aufgaben" -type f');
    expect(block).toContain('[ -d "$work/aufgaben" ]');
    expect(block).toContain(">&2");
    expect(block).toContain('rm -rf "$work"');
    expect(block).toContain("exit 1");
  });

  it("stellt rsync und Pruefung zwischen die sqlite3-Schleife und das eine tar", () => {
    const schleife = zeileMit(".backup '");
    const kopie = zeileMit('rsync -a "$AUFGABEN_DIR/"');
    const pruefung = zeileMit('[ -f "$work/aufgaben.db" ]');
    const packen = zeileMit("tar -czf");
    expect(schleife).toBeLessThan(kopie);
    expect(kopie).toBeLessThan(pruefung);
    expect(pruefung).toBeLessThan(packen);
  });
});

describe("die Annahme, auf der der Riegel steht: der Blob liegt vor seiner Zeile", () => {
  it("die Uploadstrecke legt den Nachweis ab, BEVOR sie die `dateien`-Zeile anlegt", () => {
    // Der Riegel zaehlt JEDE Zeile in `dateien` als vollstaendig — es gibt keine Spalte
    // wie `bytes_vollstaendig_at` bei `files`. Das traegt nur, solange der Blob fertig
    // geschrieben ist, bevor seine Zeile entsteht: dann hat jede Zeile der DB-Kopie
    // ihren Blob schon, wenn das rsync danach kopiert. Dreht jemand die Reihenfolge,
    // entstehen Zeilen ohne Blob, und diese Suite muss davon erfahren.
    const route = readFileSync(
      path.join(__dirname, "../a/[id]/nachweis/hochladen/route.ts"),
      "utf8",
    );
    const ablegen = route.indexOf("await legeNachweisAb(");
    const zeile = route.indexOf("erstelleDatei(db,");
    expect(ablegen, "route.ts ruft legeNachweisAb").toBeGreaterThanOrEqual(0);
    expect(zeile, "route.ts ruft erstelleDatei").toBeGreaterThanOrEqual(0);
    expect(ablegen).toBeLessThan(zeile);
  });
});
