/**
 * Aufgabe 18 — die Ablage der Bildnachweise (Spec §5.3, §6, §7).
 *
 * DIE WICHTIGSTE AUSSAGE DIESER SUITE: ein Dateiname mit `../` oder ein
 * absoluter Pfad landet nicht ausserhalb der Ablage. Sie wird als ECHTER
 * Testfall gefuehrt (ein Aufruf mit einem echten Traversal-Namen, der
 * anschliessend verifiziert wird), nicht als Behauptung im Kommentar.
 *
 * `DATA_DIR` zeigt je Test auf ein frisches `mkdtemp`-Verzeichnis — echtes
 * Dateisystem, kein Mock: die Aussage „liegt unter der Wurzel" ist eine
 * Aussage ueber echte Pfade, und ein Mock koennte sie nicht falsifizieren.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { existsSync, mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve, sep } from "node:path";
import { nanoid } from "nanoid";

import { legeNachweisAb, leseNachweis, loescheNachweis, nachweisPfad, UngueltigeId } from "./ablage";

/*
 * Fix Runde 1 (Review), Minor 4/5: ein Schreibfehler NACH `open("wx", …)`
 * hinterliess vorher einen verwaisten Teilblob, und `write` wurde ungeprueft
 * vertraut. Beide Faelle brauchen einen ECHT scheiternden `write` — dafuer
 * wird `node:fs/promises` an GENAU der Stelle gemockt (Vorbild
 * `files/_lib/storage.test.ts`), alles andere bleibt das echte Dateisystem.
 */
const fsSteuerung = vi.hoisted(() => ({
  naechsterWriteWirft: false,
  naechsterWriteKuerzt: false,
}));

vi.mock("node:fs/promises", async (importOriginal) => {
  const echt = await importOriginal<typeof import("node:fs/promises")>();
  return {
    ...echt,
    open: async (...args: Parameters<typeof echt.open>) => {
      const griff = await echt.open(...args);
      if (!fsSteuerung.naechsterWriteWirft && !fsSteuerung.naechsterWriteKuerzt) return griff;
      return {
        write: async (buf: Uint8Array) => {
          if (fsSteuerung.naechsterWriteWirft) {
            fsSteuerung.naechsterWriteWirft = false;
            throw Object.assign(new Error("simuliert: ENOSPC"), { code: "ENOSPC" });
          }
          if (fsSteuerung.naechsterWriteKuerzt) {
            fsSteuerung.naechsterWriteKuerzt = false;
            const echtesErgebnis = await griff.write(buf);
            // Meldet EINEN Byte weniger, als tatsaechlich (und vollstaendig)
            // geschrieben wurde — die Simulation eines Schreibvorgangs, der
            // sich selbst falsch meldet.
            return { ...echtesErgebnis, bytesWritten: echtesErgebnis.bytesWritten - 1 };
          }
          return griff.write(buf);
        },
        sync: () => griff.sync(),
        close: () => griff.close(),
      } as unknown as typeof griff;
    },
  };
});

let datenVerzeichnis: string;
let vorherigesDataDir: string | undefined;

beforeEach(() => {
  datenVerzeichnis = mkdtempSync(join(tmpdir(), "aufgaben-ablage-"));
  vorherigesDataDir = process.env.DATA_DIR;
  process.env.DATA_DIR = datenVerzeichnis;
});

afterEach(() => {
  if (vorherigesDataDir === undefined) delete process.env.DATA_DIR;
  else process.env.DATA_DIR = vorherigesDataDir;
  rmSync(datenVerzeichnis, { recursive: true, force: true });
});

/** Echte Magic Bytes — kein Fixture-Wert, an dem zwei Faelle zufaellig gleich waeren. */
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4]);
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 1, 2, 3]);
const UNBEKANNT = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]);

const AblageWurzel = () => resolve(datenVerzeichnis, "aufgaben");

describe("legeNachweisAb — der Dateiname aus dem Upload ist Eingabe, kein Pfad", () => {
  it("ein Traversal-Dateiname landet nicht außerhalb der Ablage", async () => {
    const id = nanoid();
    const befund = await legeNachweisAb(id, "../../../etc/passwd.jpg", PNG);

    expect(befund.ok).toBe(true);

    // Die Datei liegt GENAU unter der Ablagewurzel, unter der `id` — nicht
    // unter irgendeinem aus dem Dateinamen abgeleiteten Pfad.
    const erwarteterPfad = join(AblageWurzel(), id);
    expect(nachweisPfad(id)).toBe(erwarteterPfad);
    expect(existsSync(erwarteterPfad)).toBe(true);

    // Die Ablagewurzel enthält NUR diese eine Datei — kein zweiter Eintrag,
    // der aus dem Traversal-Namen entstanden wäre.
    expect(readdirSync(AblageWurzel())).toEqual([id]);

    // Und außerhalb der Ablagewurzel (z. B. am Ziel, das der Name suggeriert)
    // ist nichts entstanden.
    expect(existsSync(resolve(AblageWurzel(), "..", "..", "etc", "passwd.jpg"))).toBe(false);
    expect(existsSync(resolve(datenVerzeichnis, "etc", "passwd.jpg"))).toBe(false);
  });

  it("ein absoluter Pfad als Dateiname wandert nicht in den Pfad", async () => {
    const id = nanoid();
    const befund = await legeNachweisAb(id, "/etc/passwd", JPEG);

    expect(befund.ok).toBe(true);
    expect(existsSync(join(AblageWurzel(), id))).toBe(true);
    expect(existsSync("/etc/passwd.jpg")).toBe(false);
  });

  it("gibt den ursprünglichen Dateinamen nicht zurück und liest ihn nicht — er ist reiner Anzeigetext beim Aufrufer", async () => {
    // Es gibt keinen Rückgabewert, der den Dateinamen trägt: die Funktion
    // nimmt ihn zwar entgegen (weil eine echte Uploadstrecke ihn mitbringt),
    // baut daraus aber nichts. Der Beleg ist der Pfad-Test oben; diese Zeile
    // hält zusätzlich fest, dass der Erfolgsbefund NUR `mime` und `groesse`
    // trägt.
    const id = nanoid();
    const befund = await legeNachweisAb(id, "beliebig.png", PNG);
    expect(Object.keys(befund).sort()).toEqual(["groesse", "mime", "ok"].sort());
  });
});

describe("legeNachweisAb — MIME-Prüfung über Magic Bytes, nicht über Endung oder Deklaration", () => {
  it("erkennt PNG unabhängig von der (falschen) Endung", async () => {
    const id = nanoid();
    const befund = await legeNachweisAb(id, "bild.txt", PNG);
    expect(befund).toMatchObject({ ok: true, mime: "image/png" });
  });

  it("erkennt JPEG", async () => {
    const id = nanoid();
    const befund = await legeNachweisAb(id, "bild.jpg", JPEG);
    expect(befund).toMatchObject({ ok: true, mime: "image/jpeg" });
  });

  it("lehnt Inhalt ohne bekannte Bild-Signatur ab und legt nichts ab", async () => {
    const id = nanoid();
    const befund = await legeNachweisAb(id, "bild.png", UNBEKANNT);
    expect(befund).toMatchObject({ ok: false, grund: "inhalt-nicht-erlaubt" });
    expect(existsSync(join(AblageWurzel(), id))).toBe(false);
  });

  it("lehnt leeren Inhalt ab und legt nichts ab", async () => {
    const id = nanoid();
    const befund = await legeNachweisAb(id, "leer.png", new Uint8Array());
    expect(befund).toMatchObject({ ok: false, grund: "kein-inhalt" });
    expect(existsSync(join(AblageWurzel(), id))).toBe(false);
  });
});

describe("legeNachweisAb — Größenprüfung mit konfigurierbarer Obergrenze", () => {
  it("lehnt eine Datei über der übergebenen Grenze ab und legt nichts ab", async () => {
    const id = nanoid();
    const befund = await legeNachweisAb(id, "bild.png", PNG, PNG.byteLength - 1);
    expect(befund).toMatchObject({ ok: false, grund: "zu-gross" });
    expect(existsSync(join(AblageWurzel(), id))).toBe(false);
  });

  it("nimmt eine Datei GENAU an der Grenze an — Gleichstand ist erlaubt", async () => {
    const id = nanoid();
    const befund = await legeNachweisAb(id, "bild.png", PNG, PNG.byteLength);
    expect(befund.ok).toBe(true);
  });
});

describe("legeNachweisAb — fail-closed: keine halbe Datei", () => {
  it("hinterlässt bei Ablehnung kein Ablageverzeichnis", async () => {
    const id = nanoid();
    await legeNachweisAb(id, "bild.png", UNBEKANNT);
    // Nicht nur „diese eine Datei fehlt" — die Wurzel selbst wurde nie
    // angelegt, weil vor jedem Schreibversuch geprüft wird.
    expect(existsSync(AblageWurzel())).toBe(false);
  });

  /*
   * Fix Runde 1, Minor 4: „keine halbe Datei" galt vorher nur für eine
   * ABLEHNUNG vor dem ersten Schreibversuch. `open("wx", …)` legt die Datei
   * aber bereits AN, bevor überhaupt ein Byte fließt — ein Schreibfehler
   * DANACH (ENOSPC) hätte einen leeren/halben Rest hinterlassen. Diese Zeile
   * beweist die Aufräumung mit einem ECHT scheiternden `write` (kein Mock,
   * der nur behauptet zu scheitern — der Mock ersetzt `write`, das
   * anschließende `unlink` läuft gegen das echte Dateisystem).
   */
  it("räumt eine bereits angelegte Datei auf, wenn der Schreibvorgang danach scheitert (ENOSPC)", async () => {
    const id = nanoid();
    fsSteuerung.naechsterWriteWirft = true;
    await expect(legeNachweisAb(id, "bild.png", PNG)).rejects.toThrow(/ENOSPC/);
    expect(existsSync(join(AblageWurzel(), id))).toBe(false);
  });

  /*
   * Fix Runde 1, Minor 5: `write` wurde bisher ungeprüft vertraut. Diese
   * Zeile simuliert einen Schreibvorgang, der WENIGER Bytes meldet, als
   * angefordert — ohne die Prüfung bliebe die Datei mit falscher `groesse`
   * liegen, obwohl der Erfolgsbefund `ok:true` behauptet hätte.
   */
  it("erkennt einen unvollständigen Schreibvorgang und räumt auf, statt ok:true zu melden", async () => {
    const id = nanoid();
    fsSteuerung.naechsterWriteKuerzt = true;
    await expect(legeNachweisAb(id, "bild.png", PNG)).rejects.toThrow(/unvollständiger Schreibvorgang/);
    expect(existsSync(join(AblageWurzel(), id))).toBe(false);
  });
});

describe("nachweisPfad — die ID ist die einzige Pfadquelle", () => {
  /*
   * `id` kommt normalerweise aus `newId()` (nanoid, 21 Zeichen) und nie von
   * einem Nutzer direkt. Diese Zusicherung ist trotzdem eine zweite Linie:
   * eine DB-Zeile, die durch einen Import oder eine Handkorrektur eine
   * verdorbene `id` trägt (z. B. `"../../etc/passwd"`), darf keinen Pfad
   * außerhalb der Ablagewurzel erzeugen. Ohne die ID-Prüfung in `pfadFuer`
   * würde genau das passieren — das ist die Gegenprobe zu §Test „Pfadprüfung
   * entfernen": mit ihr wirft diese Zeile `UngueltigeId`, ohne sie liefe
   * `join()` durch und `dirname(resolve(pfad))` läge außerhalb der Wurzel.
   */
  it("wirft UngueltigeId für eine verdorbene ID statt einen Pfad zu bauen", () => {
    expect(() => nachweisPfad("../../../etc/passwd")).toThrow(UngueltigeId);
    expect(() => nachweisPfad("")).toThrow(UngueltigeId);
    expect(() => nachweisPfad("mit/schraegstrich")).toThrow(UngueltigeId);
  });

  it("liegt für eine gültige ID direkt unter der Ablagewurzel", () => {
    const id = nanoid();
    const pfad = nachweisPfad(id);
    expect(dirname(resolve(pfad))).toBe(AblageWurzel());
    expect(pfad.endsWith(`${sep}${id}`)).toBe(true);
  });
});

describe("leseNachweis / loescheNachweis", () => {
  it("liest die abgelegten Bytes unverändert zurück", async () => {
    const id = nanoid();
    await legeNachweisAb(id, "bild.png", PNG);
    const zurueck = await leseNachweis(id);
    // `leseNachweis` liefert ein Node-`Buffer` (Uint8Array-Subklasse) — `toEqual`
    // unterscheidet die Klasse, deshalb wird gegen ein `Buffer` verglichen.
    expect(zurueck).toEqual(Buffer.from(PNG));
  });

  it("liefert null für eine fehlende Datei, statt zu werfen", async () => {
    const id = nanoid();
    expect(await leseNachweis(id)).toBeNull();
  });

  it("loescheNachweis ist idempotent — eine fehlende Datei ist kein Fehler", async () => {
    const id = nanoid();
    await expect(loescheNachweis(id)).resolves.toBeUndefined();
  });

  it("loescht eine abgelegte Datei wirklich", async () => {
    const id = nanoid();
    await legeNachweisAb(id, "bild.png", PNG);
    await loescheNachweis(id);
    expect(await leseNachweis(id)).toBeNull();
  });
});
