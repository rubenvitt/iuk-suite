import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

/**
 * Die Bildnachweise dieses Moduls im Kern der Sicherung, `scripts/backup.sh` (DRK-391).
 *
 * Bis dahin sicherte das Skript `aufgaben.db`, aber nicht das Volume `aufgaben_data` daneben —
 * ein Restore enthielt Verweise auf Bilder, die es nicht gab, und das Backup meldete Erfolg.
 *
 * Ein QUELLTEXT-SCAN, aus demselben Grund wie `files/_lib/backup.test.ts` (dort ausfuehrlich):
 * ein echter Lauf braucht `sqlite3` und `rsync` auf dem Laeufer und ist ein Runbook-Schritt
 * (`docs/runbooks/backup-sidecar.md`, Probelauf). Was der Scan besitzt, sind die Positionen der
 * Bloecke — und die Kopplung an die zwei Annahmen aus DIESEM Modul, auf denen der Riegel ruht.
 * Den Mount im Dienst `backup` haelt `scripts/backup-sidecar.test.ts`.
 */

const WURZEL = path.resolve(__dirname, "../../../../..");
const quelle = readFileSync(path.join(WURZEL, "scripts/backup.sh"), "utf8");
const zeilen = quelle.split("\n");

/** Erste BEFEHLSzeile mit `teil` — ein erklaerender Kommentar darueber zaehlt nicht. */
function zeileMit(teil: string): number {
  const i = zeilen.findIndex((z) => !z.trim().startsWith("#") && z.includes(teil));
  expect(i, `scripts/backup.sh fuehrt eine Befehlszeile mit "${teil}"`).toBeGreaterThanOrEqual(0);
  return i;
}

describe("scripts/backup.sh — die Bildnachweise von `aufgaben`", () => {
  it("AUFGABEN_DIR ist eine eigene Variable mit Rueckfall auf $DATA_DIR/aufgaben", () => {
    // `_lib/ablage.ts` loest `DATA_DIR/aufgaben` auf; im Dienst `backup` liegt dort der Mount.
    expect(quelle).toMatch(/^AUFGABEN_DIR="\$\{AUFGABEN_DIR:-\$DATA_DIR\/aufgaben\}"$/m);
    expect(readFileSync(path.join(__dirname, "ablage.ts"), "utf8")).toContain(
      'resolve(process.env.DATA_DIR ?? "./.data", "aufgaben")',
    );
  });

  it("kopiert per rsync MIT abschliessendem Schraegstrich, nur wenn das Verzeichnis existiert", () => {
    // Ohne Slash entstuende `$work/aufgaben/aufgaben/…` — der Riegel zaehlte trotzdem Dateien,
    // die Wiederherstellung griffe ins Leere.
    const i = zeileMit('rsync -a "$AUFGABEN_DIR/" "$work/aufgaben/"');
    // Vor dem ersten Upload fehlt das Verzeichnis; ein nacktes rsync naehme unter
    // `set -euo pipefail` das Backup ALLER Module mit.
    expect(zeilen.slice(Math.max(0, i - 3), i).join("\n")).toContain('[ -d "$AUFGABEN_DIR" ]');
  });

  it("bricht ab, wenn `dateien` Zeilen hat, aber kein Blob kopiert wurde", () => {
    const i = zeileMit('[ -f "$work/aufgaben.db" ]');
    const bis = zeileMit("tar -czf");
    const block = zeilen.slice(i, bis).join("\n");
    // Die KOPIE lesen, nicht die laufende DB; `|| echo 0`, weil die Tabelle vor der ersten
    // Migration fehlt.
    expect(block).toContain('sqlite3 "$work/aufgaben.db"');
    expect(block).toContain("select count(*) from dateien");
    expect(block).toContain("|| echo 0");
    // Die Zaehlmechanik: ohne `-type f` zaehlt `find` das leere Verzeichnis selbst mit und der
    // Riegel feuert nie; ohne `[ -d … ]` stirbt der Lauf vor dem ersten Upload.
    expect(block).toContain('find "$work/aufgaben" -type f');
    expect(block).toContain('[ -d "$work/aufgaben" ]');
    // Die Bedingung selbst — ein umgedrehter Vergleich liesse den Block stehen und toeten.
    expect(block).toContain('[ "$zeilen_aufgaben" -gt 0 ] && [ "$blobs_aufgaben" -eq 0 ]');
    expect(block).toContain(">&2");
    expect(block).toContain('rm -rf "$work"');
    expect(block).toContain("exit 1");
  });

  it("die Reihenfolge: sqlite3-Schleife → rsync → Riegel → das eine tar", () => {
    // Die DB-Kopie MUSS vor dem rsync entstehen: nur dann hatte jede ihrer Zeilen ihren Blob
    // schon, als das rsync lief (siehe den naechsten Fall). Umgekehrt koennte eine Zeile in
    // der Kopie auf einen Blob zeigen, der erst nach dem rsync entstand.
    const schleife = zeileMit(".backup '");
    const kopie = zeileMit('rsync -a "$AUFGABEN_DIR/"');
    const riegel = zeileMit('[ -f "$work/aufgaben.db" ]');
    const packen = zeileMit("tar -czf");
    expect(schleife).toBeLessThan(kopie);
    expect(kopie).toBeLessThan(riegel);
    expect(riegel).toBeLessThan(packen);
  });
});

describe("die Annahmen aus diesem Modul, auf denen der Riegel ruht", () => {
  it("der Blob entsteht VOR seiner Zeile in `dateien` — deshalb braucht es keine Spalte „vollstaendig\"", () => {
    // Anders als `files` (chunked Upload, `bytes_vollstaendig_at`) schreibt dieses Modul den
    // Blob in einem Zug und legt die Zeile erst danach an. Dreht jemand die Reihenfolge um,
    // kann eine Zeile ohne Blob entstehen, und `count(*) from dateien` belegt nichts mehr.
    const route = readFileSync(
      path.join(__dirname, "../a/[id]/nachweis/hochladen/route.ts"),
      "utf8",
    );
    const ablegen = route.indexOf("await legeNachweisAb(");
    const zeile = route.indexOf("erstelleDatei(db,");
    expect(ablegen).toBeGreaterThanOrEqual(0);
    expect(zeile).toBeGreaterThan(ablegen);
  });

  it("die Ablage schreibt ohne Zwischendatei — deshalb kein `--exclude` im rsync", () => {
    // Bekaeme die Ablage einen Teil-Suffix wie `files` (`.part`), gehoerte er ins rsync.
    const ablage = readFileSync(path.join(__dirname, "ablage.ts"), "utf8");
    expect(ablage).toContain('await open(pfad, "wx", BLOB_MODUS)');
    expect(ablage).not.toMatch(/\brename\(/);
  });
});
