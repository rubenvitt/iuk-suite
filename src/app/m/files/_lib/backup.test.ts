import { describe, it, expect } from "vitest";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";

/**
 * `scripts/backup.sh` sichert heute ausschliesslich `"$DATA_DIR"/*.db`. Ab dem Modul
 * `files` liegen die Nutzdaten daneben im Dateisystem — ohne diese Erweiterung ist das
 * Backup ab jetzt unvollstaendig UND MELDET ERFOLG (Spec §5.5).
 *
 * WARUM DAS EIN QUELLTEXT-SCAN IST: ein echter Lauf des Skripts gegen ein echtes
 * `DATA_DIR` verlangt `sqlite3`, `tar` und `rsync` auf dem Laeufer und ist deshalb
 * ausdruecklich KEIN Gate, sondern ein Runbook-Schritt (Plan T25). Ein
 * `skipIf(!hasRsync)` waere auf dem Laeufer gruen durch Abwesenheit und beliese nichts.
 * Was ein Scan dagegen wirklich besitzt, ist die REIHENFOLGE der vier Bloecke: beide
 * naheliegenden Umbauten scheitern still (siehe unten), und beide sind reine
 * Positionsfehler, die kein `toContain` sieht.
 *
 * `bash -n` gehoert dazu und laeuft hier mit: ein Syntaxfehler in einem Cron-Skript
 * faellt sonst erst nachts auf, und dann fuer ALLE vier Module.
 */

const WURZEL = path.resolve(__dirname, "../../../../..");
const SKRIPT = path.join(WURZEL, "scripts/backup.sh");
const quelle = readFileSync(SKRIPT, "utf8");
const zeilen = quelle.split("\n");

/**
 * Nur die Befehlszeilen. Die VERBOTE muessen hierauf zielen und nicht auf den ganzen
 * Text: das Skript BEGRUENDET in Kommentaren, warum `cp -al` und `tar -rf` falsch waeren
 * — ein Scan ueber die ganze Datei verboete damit genau die Erklaerung, die den naechsten
 * Leser vor dem Rueckbau bewahrt.
 */
const befehle = zeilen.filter((z) => !z.trim().startsWith("#"));
const befehleText = befehle.join("\n");

/**
 * Index der ERSTEN Zeile, die `teil` enthaelt — Kommentarzeilen ausgenommen. Ohne diese
 * Ausnahme genuegte ein erklaerender Kommentar oberhalb, um die Reihenfolgekette gruen zu
 * faerben, ohne dass der Befehl selbst umzieht.
 */
function zeileMit(teil: string): number {
  const i = zeilen.findIndex((z) => !z.trim().startsWith("#") && z.includes(teil));
  expect(i, `scripts/backup.sh fuehrt eine Befehlszeile mit "${teil}"`).toBeGreaterThanOrEqual(0);
  return i;
}

/**
 * Der `.part`-Suffix wird NICHT hier hartkodiert, sondern aus `_lib/storage.ts` gelesen.
 * Sonst waere ein Umbenennen dort selbstkonsistent: Ablage und Ausschlussregel truegen
 * verschiedene Suffixe, halbe Uploads landeten im Backup, und beide Tests blieben gruen.
 * storage.ts:28-34 nennt `scripts/backup.sh` als Gegenstueck — die Kopplung ist echt.
 * Gelesen als Text, weil `TEIL_SUFFIX` dort absichtlich nicht exportiert ist.
 */
function teilSuffixAusStorage(): string {
  const storage = readFileSync(path.join(__dirname, "storage.ts"), "utf8");
  const treffer = storage.match(/const TEIL_SUFFIX = "([^"]+)"/);
  expect(treffer, "TEIL_SUFFIX in _lib/storage.ts").not.toBeNull();
  return treffer?.[1] ?? "";
}

describe("scripts/backup.sh — BLOB_DIR ist eine eigene Variable", () => {
  it("faellt auf $DATA_DIR/files zurueck, statt den Pfad fest zu verdrahten", () => {
    // Ohne eigene Variable ist `$DATA_DIR/files` host-seitig ein LEERER Mountpunkt,
    // sobald die Blobs im eigenen Volume `files_data` liegen (Spec §6.5): das `tar`
    // sicherte nichts und meldete Erfolg. Der Rueckfall deckt die Lage ohne eigenen
    // Mount ab (Dev, und der Zustand vor der Compose-Aenderung) — beide Faelle, weil
    // §13.2 Frage 11 offen ist.
    expect(quelle).toMatch(/^BLOB_DIR="\$\{BLOB_DIR:-\$DATA_DIR\/files\}"$/m);
  });

  it("nennt im Kommentar beide produktiven Belegungen, damit der Betreiber waehlen kann", () => {
    // Ein Rueckfall ohne den benannten Alternativwert ist fuer den Betreiber unsichtbar:
    // er sieht keinen Fehler, nur ein zu kleines Tarball.
    expect(quelle).toContain("files_data");
    expect(quelle).toMatch(/BLOB_DIR=\/(var|srv)\//);
  });

  it("erwaehnt BACKUP_KEEP als Multiplikator des neuen Platzbedarfs", () => {
    // Die Blob-Menge geht ab jetzt in JEDE der 7 Generationen ein (Spec §5.5 Punkt 7,
    // §13.2 Frage 12). Steht das nirgends, laeuft die Platte voll, und das Backup
    // scheitert genau dann, wenn man es braucht.
    const block = quelle.split("\n").filter((z) => z.includes("BACKUP_KEEP"));
    expect(block.some((z) => z.trim().startsWith("#"))).toBe(true);
  });
});

describe("scripts/backup.sh — das rsync der Blobs", () => {
  it("kopiert mit rsync -a und schliesst *.part aus", () => {
    // Halbe Uploads gehoeren nicht ins Backup (Spec §5.5 Punkt 4).
    expect(quelle).toContain(`rsync -a --exclude='*${teilSuffixAusStorage()}'`);
  });

  it("schreibt den Quellpfad MIT abschliessendem Schraegstrich", () => {
    // `"$BLOB_DIR"` ohne Slash legt `$work/files/files/…` an. Das Tarball enthaelt dann
    // trotzdem Blobs, die Abbruchpruefung zaehlt trotzdem Dateien — die Wiederherstellung
    // greift nur ins Leere. Diesen Fehler kann NUR der Scan sehen.
    expect(quelle).toContain(`"$BLOB_DIR/" "$work/files/"`);
  });

  it("laeuft nur, wenn das Blob-Verzeichnis existiert", () => {
    // Vor dem ersten Upload existiert es nicht; ein nacktes `rsync` naehme unter
    // `set -euo pipefail` das Backup der anderen drei Module mit.
    const i = zeileMit("rsync -a --exclude=");
    const davor = zeilen.slice(Math.max(0, i - 3), i).join("\n");
    expect(davor).toContain('[ -d "$BLOB_DIR" ]');
  });

  it("benutzt NICHT cp -al", () => {
    // Hardlinks scheitern ueber eine Dateisystemgrenze, und `BLOB_DIR` liegt je nach
    // §13.2 Frage 11 in einem anderen Volume-Root als `$DATA_DIR` — unter `pipefail`
    // waere das ein abgebrochenes Backup ALLER Module.
    expect(befehleText).not.toContain("cp -al");
  });

  it("nennt rsync im Kopf als Voraussetzung des Laeufers", () => {
    // Der Kopf ist die Voraussetzungsliste fuer den Host-Cron und stand bisher auf
    // „sqlite3 + tar". Ein fehlendes rsync auf einem schmalen Zielhost ist unter
    // `set -e` ein abgebrochenes Backup ALLER Module — und die Zeile ist der einzige
    // Ort, an dem das vorher auffaellt.
    // Geprueft wird der Satz BIS ZUM PUNKT, nicht die Zeile: derselbe Kopf erwaehnt
    // „Externes Ziel (rclone/rsync)" im naechsten Satz, und eine Suche ueber die ganze
    // Zeile waere davon von Anfang an gruen gewesen — ohne irgendeine Zusage zu halten.
    const kopf = zeilen.slice(0, 6).join("\n");
    const satz = kopf.match(/benötigt([^.]*)\./);
    expect(satz, "der Kopf fuehrt einen `benötigt …`-Satz").not.toBeNull();
    expect(satz?.[1]).toContain("rsync");
  });

  it("begruendet im Kommentar, warum Konsistenz ohne Freeze hier reicht", () => {
    // Der Grund ist nicht offensichtlich und die naechste Aufraeumrunde entfernte sonst
    // das rsync als vermeintlich unsicher: eine Blob-Datei entsteht ausschliesslich per
    // atomarem `rename` und wird danach nie veraendert.
    expect(quelle).toMatch(/rename/);
  });
});

describe("scripts/backup.sh — die Abbruchpruefung fuer den stillen Fall", () => {
  it("liest die KOPIE in $work und ist auf deren Existenz bedingt", () => {
    // Die laufende DB zu lesen waere ein zweiter, inkonsistenter Stand. Und vor dem
    // ersten files-Deploy gibt es die Datei ueberhaupt nicht — ohne `-f` nimmt der
    // Abbruch das Backup der anderen Module mit.
    expect(quelle).toContain('[ -f "$work/files.db" ]');
    expect(quelle).toContain('sqlite3 "$work/files.db"');
  });

  it("fragt share_files nach bytes_vollstaendig_at und traegt || echo 0", () => {
    // `|| echo 0` ist Pflicht, nicht Vorsicht: vor der ersten Migration existiert die
    // TABELLE nicht, und eine nackte Abfrage bricht unter `pipefail` alles ab.
    expect(quelle).toMatch(/from share_files where bytes_vollstaendig_at is not null/);
    // BEIDE Richtungen des Moduls. Ein Bestand nur aus Inbox-Uploads ist derselbe
    // stille Fall wie einer nur aus Freigaben — gemessen: leere `share_files`, eine
    // vollstaendige Zeile in `inbox_files`, leeres Blob-Verzeichnis → exit 0 und ein
    // Tarball mit leerem `files/`. Der Riegel fragte damals nur die eine Tabelle.
    expect(quelle).toMatch(/from inbox_files where bytes_vollstaendig_at is not null/);
    expect(quelle).toContain("|| echo 0");
  });

  it("bricht mit exit 1 ab, wenn vollstaendige Zeilen ohne kopierte Blobs dastehen", () => {
    // Dieselbe Linie wie der bestehende Abbruch bei „keine *.db gefunden" (:20-23):
    // kein Tarball schreiben und Erfolg melden. Cron soll das sehen, also stderr.
    const i = zeileMit('[ -f "$work/files.db" ]');
    const bis = zeileMit("tar -czf");
    const block = zeilen.slice(i, bis).join("\n");
    expect(block).toContain("exit 1");
    expect(block).toContain(">&2");
    // Die BEDINGUNG gehoert dazu, nicht nur ihre Existenz: mit `-lt 0` statt `-gt 0`
    // (oder `-ne 0` auf der Blob-Seite) steht der ganze Block unveraendert da, feuert
    // aber nie — und ein Scan, der nur `-f`, die Abfrage und `exit 1` sieht, ist dann
    // vollstaendig gruen bei einem toten Riegel. Gemessen: diese Mutation ueberlebte
    // die uebrigen 16 Faelle.
    expect(block).toContain('[ "$zeilen" -gt 0 ]');
    expect(block).toContain('[ "$blobs" -eq 0 ]');
    /*
     * DIE ZAEHLMECHANIK GEHOERT EBENFALLS DAZU — beide Teile, und beide sind
     * gemessen, nicht vermutet:
     *
     * 1. `-type f` weglassen (EIN Token) und der Riegel feuert nie: `find` zaehlt
     *    dann das leere Verzeichnis `$work/files` SELBST mit, `blobs` ist 1 statt
     *    0, und das Backup meldet Erfolg mit einem Tarball ohne einen einzigen
     *    Blob. Nachgestellt mit DATA_DIR=tmp, einer vollstaendigen Zeile in
     *    files.db und leerem $DATA_DIR/files: „backup: wrote …tar.gz", exit 0.
     *    Das ist woertlich der Fehlermodus „leerer Mountpunkt" aus Spec §5.5.
     * 2. Den Wrapper `[ -d "$work/files" ]` weglassen und der Lauf stirbt im
     *    Normalfall VOR dem ersten Upload: `find` schreibt „No such file or
     *    directory", die Kommandosubstitution scheitert, `set -euo pipefail`
     *    reisst alles ab — kein Tarball, auch nicht fuer portal, qr und feedback.
     *
     * Beide Mutationen ueberlebten die uebrigen 16 Faelle gruen.
     */
    expect(block).toContain('find "$work/files" -type f');
    expect(block).toContain('[ -d "$work/files" ]');
  });
});

describe("scripts/backup.sh — die Reihenfolge der vier Bloecke", () => {
  it("stellt rsync und Abbruchpruefung zwischen die sqlite3-Schleife und das eine tar", () => {
    // DIE tragende Zusage dieser Suite. Drei Positionsfehler sind je fuer sich still:
    //  * rsync VOR der `sqlite3 .backup`-Schleife: `$work` existiert, aber die
    //    Abbruchpruefung findet keine `files.db` und schweigt.
    //  * rsync NACH dem `tar`: das Tarball enthaelt keine Blobs, die Rotation hat aber
    //    schon eine gute Generation verdraengt.
    //  * Abbruchpruefung NACH dem `tar`: das Skript schreibt erst ein unbrauchbares
    //    Tarball, rotiert, und faellt dann um.
    // Kein `toContain` sieht irgendeinen davon.
    const schleife = zeileMit(".backup '");
    const kopie = zeileMit("rsync -a --exclude=");
    const pruefung = zeileMit('[ -f "$work/files.db" ]');
    const packen = zeileMit("tar -czf");
    expect(schleife).toBeLessThan(kopie);
    expect(kopie).toBeLessThan(pruefung);
    expect(pruefung).toBeLessThan(packen);
  });
});

describe("scripts/backup.sh — was unveraendert bleiben muss", () => {
  it("packt genau EIN tar und haengt nichts an ein gzip-Archiv an", () => {
    // `tar -rf` an ein gzip-Archiv ist unmoeglich („Cannot append to compressed
    // archive") und braeche unter `set -euo pipefail` den GANZEN Lauf ab — auch fuer
    // portal, qr und feedback. Deshalb wandern die Blobs vorher ins Arbeitsverzeichnis.
    expect(quelle).toContain('tar -czf "$work.tar.gz" -C "$BACKUP_DIR" "$stamp"');
    expect(befehleText).not.toMatch(/tar\s+-[a-z]*r/);
    expect(befehle.filter((z) => z.includes("tar -"))).toHaveLength(1);
  });

  it("laesst die Rotation und den bestehenden DATA_DIR-Abbruch stehen", () => {
    expect(quelle).toContain('ls -1t "$BACKUP_DIR"/*.tar.gz | tail -n +$((KEEP + 1)) | xargs -r rm -f');
    expect(quelle).toContain("shopt -s nullglob");
    expect(quelle).toContain("shopt -u nullglob");
    expect(quelle).toContain('if [ "${#dbs[@]}" -eq 0 ]; then');
    expect(quelle).toContain("set -euo pipefail");
  });

  it("ist syntaktisch gueltiges bash", () => {
    // Ein Cron-Skript mit Syntaxfehler faellt sonst nachts auf, und dann fuer alle
    // vier Module gleichzeitig.
    expect(() => execFileSync("bash", ["-n", SKRIPT], { stdio: "pipe" })).not.toThrow();
  });
});
