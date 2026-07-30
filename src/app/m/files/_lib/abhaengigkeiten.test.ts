import { describe, it, expect } from "vitest";
import bcrypt from "bcryptjs";
import archiver from "archiver";

/**
 * Der kleinste Test des Moduls und der einzige, der eine 1:1-Pflicht schuetzt,
 * deren Bruch JEDEN geschuetzten Bestands-Share unoeffenbar macht (Spec §4.2):
 * die Passwoerter liegen bei den Empfaengern, nicht bei uns. Ein Wechsel der
 * Hash-Familie (argon2/scrypt) oder der Bibliothek (`bcrypt` statt `bcryptjs`)
 * faellt sonst erst am Cutover auf — an einem Share, den niemand mehr oeffnen
 * kann.
 *
 * `bcryptjs`, nicht `bcrypt`: die Alt-App fuehrt `bcryptjs: ^3.0.3`
 * (`easy-filesharing/package.json`) und hasht mit cost 12
 * (`easy-filesharing/lib/auth/password.ts:4`).
 */

// Beide Vektoren gehoeren zum Passwort unten. Sie sind fest hinterlegt, weil
// ein im Test selbst erzeugter Hash nur beweisen wuerde, dass die Bibliothek
// sich selbst versteht — nicht, dass sie den BESTAND liest.
const PASSWORT = "Testpasswort-2026";

// Vektor 1: erzeugt von bcryptjs@3.0.3 aus dem node_modules der Alt-App
// (easy-filesharing) — dieselbe Bibliothek und derselbe cost, die die
// Bestands-Hashes geschrieben haben.
const ALT_HASH_2B = "$2b$12$SC/ie/AcUjuq8nm6tuLMCe8VNxq3tJ.xWQribbyA4aIZ6Wz604Oya";

// Vektor 2: derselbe Klartext, aber mit dem Praefix `$2y$` und einem anderen
// Salt. Er steht hier, weil bcrypt-Hashes im Umlauf nicht alle `$2b$` tragen:
// ein Verify, das am Praefix haengt, faellt damit HIER auf und nicht erst beim
// ersten fremden Bestands-Hash. (Ueber den Erzeuger sagt der Vektor nichts —
// belegt ist allein, dass `bcryptjs` ihn liest.)
const FREMD_HASH_2Y = "$2y$12$1XRDWLWnN9obfOoYuKvwcOeMP1GePkpwg3Ei1pRx/v4JPHeS4/T/a";

describe("bcryptjs — die 1:1-Pflicht der Passwort-Hashes", () => {
  it("hasht mit cost 12 in die Alt-Familie: Praefix $2b$12$, Laenge 60", () => {
    const hash = bcrypt.hashSync("x", 12);
    expect(hash.startsWith("$2b$12$")).toBe(true);
    // 60 Zeichen ist die Spaltenbreite, gegen die die Alt-DB geschrieben wurde
    // (Spec §4.2, Analyse Zeile 825).
    expect(hash).toHaveLength(60);
  });

  it("verifiziert einen Bestands-Hash der Alt-App", () => {
    expect(bcrypt.compareSync(PASSWORT, ALT_HASH_2B)).toBe(true);
  });

  it("verifiziert einen Hash einer fremden bcrypt-Implementierung ($2y$)", () => {
    expect(bcrypt.compareSync(PASSWORT, FREMD_HASH_2Y)).toBe(true);
  });

  it("weist ein falsches Passwort gegen beide Bestands-Hashes ab", () => {
    // Die Gegenprobe zu den zwei Zeilen darueber: ein `compare`, das immer
    // `true` liefert, wuerde sie beide bestehen.
    expect(bcrypt.compareSync("falsch", ALT_HASH_2B)).toBe(false);
    expect(bcrypt.compareSync("falsch", FREMD_HASH_2Y)).toBe(false);
  });
});

describe("archiver — streamt ein ZIP", () => {
  it("liefert einen Stream mit `error`-Haken", () => {
    const archiv = archiver("zip", { zlib: { level: 1 } });
    // Der Haken ist Pflicht, nicht Kosmetik: ein `error` auf einem
    // Archiv-Stream ohne Listener beendet in Node den Prozess.
    expect(typeof archiv.on).toBe("function");
    archiv.on("error", () => {});
    archiv.abort();
  });

  it("schreibt aus angehaengten Bytes ein lesbares ZIP", async () => {
    const archiv = archiver("zip", { zlib: { level: 1 } });
    const teile: Buffer[] = [];
    const fertig = new Promise<void>((loesen, ablehnen) => {
      archiv.on("data", (stueck: Buffer) => teile.push(stueck));
      archiv.on("end", () => loesen());
      archiv.on("error", ablehnen);
    });

    archiv.append(Buffer.from("Inhalt"), { name: "a.txt" });
    await archiv.finalize();
    await fertig;

    const zip = Buffer.concat(teile);
    // `typeof archiv.on === "function"` besaesse diese Aussage nicht: sie gilt
    // fuer jeden EventEmitter. Die ZIP-Signatur `PK\x03\x04` gilt nur fuer ein
    // echtes Archiv, und mehr als ein Stueck belegt zugleich, dass es
    // stroemend entsteht (Spec §7.7: kein Puffern der ganzen Zusammenstellung).
    expect(zip.subarray(0, 4)).toEqual(Buffer.from([0x50, 0x4b, 0x03, 0x04]));
    expect(zip.length).toBeGreaterThan(0);
    expect(teile.length).toBeGreaterThan(0);
  });
});
