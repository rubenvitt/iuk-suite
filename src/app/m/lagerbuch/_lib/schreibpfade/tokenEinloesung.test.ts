import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { eq } from "drizzle-orm";
import { decodeJwt } from "jose";
import { readFileSync, existsSync } from "node:fs";
import { migrierteTestDb, type TestDb } from "../../_db/testdb";
import { tokens } from "../../_db/schema";
import { verifyHelferSitzung } from "../helferSitzung";
import { redeemToken } from "./tokenEinloesung";

const QUELLE = "src/app/m/lagerbuch/_lib/schreibpfade/tokenEinloesung.ts";

/**
 * Kopie von `ohneKommentare()` aus `_lib/bauform.test.ts` (Regel 1 der Regeldatei
 * fuer Teil 4, K-3). Die beiden Quelltext-Scans unten laesen sonst den Rohtext
 * INKLUSIVE Kommentaren — und `tokenEinloesung.ts` traegt beide gesuchten
 * Zeichenfolgen woertlich in seiner eigenen Begruendung: `getDb()` im
 * `@param db`-Absatz und „KEIN \"use client\"" im Kopfkommentar. Ohne diese
 * Funktion waere jeder der beiden Scans auf genau der Begruendung rot, die er
 * konservieren soll. `bauform.test.ts` exportiert sie nicht, und dies ist ein
 * anderer Testkoerper — deshalb die lokale Kopie statt eines Re-Exports, genau
 * wie `_lib/pwaIcons.test.ts` (T65) es haelt.
 */
function ohneKommentare(quelle: string): string {
  let imBlock = false;
  return quelle
    .split("\n")
    .map((zeile) => {
      if (imBlock) {
        const zu = zeile.indexOf("*/");
        if (zu === -1) return "";
        imBlock = false;
        return " ".repeat(zu + 2) + zeile.slice(zu + 2);
      }
      const auf = zeile.indexOf("/*");
      if (auf !== -1 && !zeile.slice(0, auf).includes("*/")) {
        const zu = zeile.indexOf("*/", auf + 2);
        if (zu === -1) { imBlock = true; return zeile.slice(0, auf); }
        return zeile.slice(0, auf) + " ".repeat(zu + 2 - auf) + zeile.slice(zu + 2);
      }
      return zeile.trimStart().startsWith("//") ? "" : zeile;
    })
    .join("\n");
}

/**
 * Das Sitzungsgeheimnis ist PFLICHT (`_lib/grenzen.ts:192-203`) und hat
 * ausdruecklich KEINE Vorbelegung: ohne diese Zeilen wirft `createHelferSitzung`
 * schon im ersten Treffer-Test mit `GrenzenUngueltig`, und der Fehlschlag saehe
 * aus wie ein Defekt in `redeemToken`. Es wird zur AUFRUFZEIT gelesen (§10.8,
 * Eigenschaft 3), deshalb genuegt `process.env` je Fall — es gibt keinen
 * Modul-Singleton, den man zuruecksetzen muesste. Form 1:1 aus
 * `_lib/helferSitzung.test.ts`.
 */
const GEHEIM = "e2e-helfer-secret-nicht-produktiv-32z";
const ANGELEGT = new Date("2026-06-15T10:00:00Z");

let t: TestDb;
let altesGeheimnis: string | undefined;

beforeEach(() => {
  altesGeheimnis = process.env.LAGERBUCH_HELFER_SITZUNG_SECRET;
  process.env.LAGERBUCH_HELFER_SITZUNG_SECRET = GEHEIM;
  t = migrierteTestDb("lagerbuch-sp-tokeneinloesung-");
  /*
   * `createdBy` steht hier, weil die Spalte `notNull()` OHNE Default ist
   * (`_db/schema.ts:411`): Drizzle verlangt sie im Insert-Typ, und SQLite wuerfe
   * sonst `NOT NULL constraint failed: tokens.created_by` — vor JEDEM einzelnen
   * Test dieser Datei (Preflight-Befund 12). `scopeLagerortId` fehlt dagegen
   * bewusst: die Spalte ist nullable UND ein Fremdschluessel auf `lagerorte.id`,
   * und `migrierteTestDb` schaltet `foreign_keys = ON` — ein Wert ohne passende
   * Lagerort-Zeile brauchte eine zweite Fixture, die nichts zusichert.
   */
  t.db.insert(tokens).values([
    { id: "tk-aktiv", code: "482-137", label: "RTW 1", aktiv: true,
      zielTyp: "fahrzeug", zielId: "fz-1",
      createdAt: ANGELEGT, createdBy: "oidc-sub-anna", lastUsedAt: null },
    { id: "tk-gesperrt", code: "900-001", label: "Alt", aktiv: false,
      zielTyp: null, zielId: null,
      createdAt: ANGELEGT, createdBy: "oidc-sub-anna", lastUsedAt: null },
    { id: "tk-artikel", code: "555-000", label: "Regal A", aktiv: true,
      zielTyp: "artikel", zielId: "art-9",
      createdAt: ANGELEGT, createdBy: "oidc-sub-anna", lastUsedAt: null },
  ]).run();
});

afterEach(() => {
  // `schliessen()`, NICHT `aufraeumen()`: `TestDb` (Teil 1, T9) fuehrt genau drei
  // Felder — `db`, `sqlite`, `schliessen` (`_db/testdb.ts:12-16`). Preflight-Befund
  // 11; ohne die Korrektur scheitert schon `pnpm typecheck`, und das temporaere
  // Datenbankverzeichnis bliebe liegen.
  t.schliessen();
  if (altesGeheimnis === undefined) delete process.env.LAGERBUCH_HELFER_SITZUNG_SECRET;
  else process.env.LAGERBUCH_HELFER_SITZUNG_SECRET = altesGeheimnis;
});

const zeile = (id: string) => t.db.select().from(tokens).where(eq(tokens.id, id)).get();

describe("redeemToken — Treffer", () => {
  it("loest einen aktiven Code ein und gibt Ziel und Cookie zurueck", async () => {
    const r = await redeemToken("482-137", t.db);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.tokenId).toBe("tk-aktiv");
    expect(r.zielTyp).toBe("fahrzeug");
    expect(r.zielId).toBe("fz-1");
    expect(r.cookieValue.length).toBeGreaterThan(20);
  });

  it("das Cookie verifiziert und traegt NUR `tokenId` (§3.4.3)", async () => {
    /*
     * ⚠️ WAS DIESER TEST TRAEGT — UND WAS NICHT. §3.4.3 selbst ist bereits auf
     * TYP-Ebene erzwungen: `HelferPayload = { tokenId: string }`
     * (`_lib/helferSitzung.ts:25`), und `createHelferSitzung` signiert
     * ausdruecklich nur `{ tokenId: p.tokenId }` (`:61`). Dieser Test kann §3.4.3
     * also gar nicht brechen sehen. Was er traegt, ist die NAHT: dass
     * `redeemToken` sein Cookie ueber `createHelferSitzung` ausstellt und nicht
     * an ihr vorbei ein eigenes `SignJWT` mit `{tokenId, code, label}` baut — die
     * 1:1-Form des Bestands (`token-redeem.ts:17`).
     *
     * Der abgedruckte Plan-Rumpf pruefte `expect(sitzung).not.toHaveProperty(…)`
     * gegen den Rueckgabewert von `verifyHelferSitzung`. Der ist konstruktiv
     * `{ tokenId, laeuftAb }` (`:99`) — die Zusicherung kann nicht fehlschlagen.
     * Geprueft werden deshalb die CLAIMS des ausgestellten Cookies selbst.
     *
     * NEGATIVE FORM statt exakter Schluesselmenge: `["exp","iat","tokenId"]`
     * koppelte T66 an T22s Claim-Liste und ginge rot, sobald dort z.B. `nbf`
     * dazukaeme — ohne dass sich hier etwas verschlechtert haette.
     */
    const r = await redeemToken("482-137", t.db);
    if (!r.ok) throw new Error("erwartet: Treffer");

    const sitzung = await verifyHelferSitzung(r.cookieValue);
    expect(sitzung?.tokenId).toBe("tk-aktiv");

    const claims = decodeJwt(r.cookieValue);
    expect(claims.tokenId).toBe("tk-aktiv");
    expect("code" in claims).toBe(false);
    expect("label" in claims).toBe(false);
  });

  it("SCHREIBT `lastUsedAt` — und genau das macht Falle 16 teuer", async () => {
    // ⚠️ KOSTENAUSSAGE AUF DEM STAND VON 8-F (korrigiert im Abschluss von
    // Teil 4). Ein cross-origin-Redirect verbrennt KEIN Kaertchen — `lastUsedAt`
    // beeinflusst weder Gueltigkeit noch Loeschbarkeit (`_db/schema.ts:412-413`,
    // und der Nachbartest unten belegt es am Verhalten). Der Schaden ist eine
    // EINLOESUNG OHNE SITZUNG: der Code laeuft auf dem fremden Host durch, das
    // Cookie landet auf einer Origin, auf der es niemand benutzen kann, und die
    // Helferin steht am Regal und hat nichts. Der Satz „nicht mehr loeschbar,
    // nur noch sperrbar" stammt aus der ALT-Anwendung (loeschen.ts:89-99, eine
    // Herkunftsmarke — die Datei existiert im neuen Modul nicht).
    //
    // Der Vorher-Wert steht ausdruecklich mit drin: ohne ihn behauptete der
    // Nachher-Wert nichts ueber DIESEN Aufruf — die Fixture koennte den Wert
    // schon getragen haben.
    expect(zeile("tk-aktiv")?.lastUsedAt).toBeNull();
    await redeemToken("482-137", t.db);
    expect(zeile("tk-aktiv")?.lastUsedAt).toBeInstanceOf(Date);
  });

  it("BLEIBT NACH DER EINLOESUNG EINLOESBAR — dasselbe Kaertchen, zweite Schicht", async () => {
    /*
     * ⚠️ DIE ZENTRALE VERFUEGBARKEITSZUSAGE DIESES SCHREIBWEGS, und bis hierher
     * trug sie keine einzige Zusicherung. `_db/schema.ts:412` legt sie als
     * ENTSCHEIDUNG fest: `lastUsedAt` ist „reines Anzeigefeld, OHNE Einfluss auf
     * Gueltigkeit und (nach Entscheidung 8-F) auch ohne Einfluss auf
     * Loeschbarkeit". Ein laminiertes Kaertchen am Regal wird JEDE SCHICHT
     * gescannt — ein Code, der nach dem ersten Scan tot waere, ist ein Ausfall am
     * Regal, kein Testdetail.
     *
     * WARUM ES DIESEN TEST BRAUCHT: der Funktionsname `redeemToken` liest sich
     * wie „einloesen = verbrauchen", und genau diese Drift baut ein spaeterer
     * Leser ein. Gefahren: `if (t.lastUsedAt) return { ok: false };` nach dem
     * Riegel — OHNE diesen Testkoerper laeuft die Datei damit 11/11 GRUEN, weil
     * jede Fixture-Zeile `lastUsedAt: null` traegt und kein anderer Test zweimal
     * einloest. Die Drift fiele erst im Betrieb auf.
     *
     * Die MITTLERE Zusicherung ist nicht schmueckend: ohne sie truege der Test
     * nur „zwei Aufrufe gehen", nicht „bleibt einloesbar, NACHDEM es benutzt
     * wurde" — die Spur muss zwischen den beiden Aufrufen nachweislich liegen.
     * Ein Vergleich der beiden Zeitstempel steht bewusst NICHT hier: `mode:
     * "timestamp"` schneidet auf ganze Sekunden ab, beide Aufrufe fallen in
     * dieselbe, und die Probe waere ein Wackeltest.
     */
    const erst = await redeemToken("482-137", t.db);
    expect(erst.ok).toBe(true);

    expect(zeile("tk-aktiv")?.lastUsedAt).not.toBeNull();

    const zweit = await redeemToken("482-137", t.db);
    expect(zweit.ok).toBe(true);
    if (!zweit.ok) return;
    expect(zweit.tokenId).toBe("tk-aktiv");
    expect(zweit.zielTyp).toBe("fahrzeug");
    expect(zweit.zielId).toBe("fz-1");
  });

  it("gibt bei zielTyp=artikel Zeile UND Ziel des GETROFFENEN Tokens durch", async () => {
    // Traegt die Zusage, dass Ziel und Id aus der GEFUNDENEN Zeile stammen und
    // nicht aus einer festen: `tk-aktiv` steht als erste Zeile in der Fixture und
    // waere der stille Ersatztreffer.
    const r = await redeemToken("555-000", t.db);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.tokenId).toBe("tk-artikel");
    expect(r.zielTyp).toBe("artikel");
    expect(r.zielId).toBe("art-9");
  });
});

describe("redeemToken — Nicht-Treffer, und was er NICHT verraet", () => {
  /*
   * REGEL 4 — WELCHER TEST WELCHEN FALL ALLEIN HAELT. Die drei folgenden
   * Abweisungen sind keine Kopien voneinander:
   *  - „unbekannter Code" haelt die WHERE-Klausel auf `code`. Faellt sie weg,
   *    liefert `.get()` die ERSTE Zeile (`tk-aktiv`) und der Aufruf gelaenge —
   *    nur dieser Test sieht das.
   *  - „gesperrter Code" haelt allein das `!t.aktiv` im Riegel.
   *  - „normalisiert nicht" haelt die Abwesenheit einer zweiten Normalisierung.
   * Die Form `toStrictEqual` statt `toEqual` traegt zusaetzlich die FEHLERFORM:
   * ein Rueckgabewert `{ ok: false, grund: undefined }` — der erste Schritt zu
   * einem Orakel — bliebe unter `toEqual` gruen (Regel 2, Ausprägung 4).
   */
  it("weist einen unbekannten Code ab", async () => {
    expect(await redeemToken("000-000", t.db)).toStrictEqual({ ok: false });
  });

  it("weist einen GESPERRTEN Code ab — und unterscheidbar ist das von aussen nicht", async () => {
    // Ein Rueckgabewert, der „gesperrt" von „unbekannt" traennte, waere ein
    // Orakel: er sagte einem Angreifer, welche der 10^6 Ziffernfolgen je
    // vergeben waren. Das Gate zeigt fuer beide denselben Satz (§3.9).
    expect(await redeemToken("900-001", t.db)).toStrictEqual({ ok: false });
  });

  it("schreibt bei einem gesperrten Code KEIN `lastUsedAt`", async () => {
    // Sonst traegt ein gesperrtes Kaertchen nach jedem Scanversuch eine frische
    // Spur, und die Token-Verwaltung zeigte Aktivitaet, die es nicht gibt.
    await redeemToken("900-001", t.db);
    expect(zeile("tk-gesperrt")?.lastUsedAt).toBeNull();
  });

  it("NORMALISIERT NICHT — weder ` 482-137 ` mit Rand noch `482137` ohne Bindestrich findet hier etwas", async () => {
    /*
     * Die Normalisierung steht in `_lib/code.ts#normalisiereCode` (Teil 2, T17)
     * und wird vom AUFRUFER angewandt (§7.5.2, Schritt 3). Zwei Normalisierungen
     * an zwei Orten sind der Ort, an dem sie auseinanderlaufen.
     *
     * ⚠️ BEIDE ZUSICHERUNGEN TRAGEN, UND ZWAR VERSCHIEDENE FAELLE — keine der
     * beiden ist die Kopie der anderen (Regel 4). Gefahren, nicht behauptet:
     *
     *  - `" 482-137 "` (Rand) haelt ALLEIN die BESTANDSFORM
     *    `code.trim().toUpperCase()` (`token-redeem.ts:13`). Unter ihr ist
     *    `"482137"` weiterhin ein Nicht-Treffer, denn sie ergaenzt den
     *    Bindestrich nicht — der ist Teil des gespeicherten Werts
     *    (`_db/schema.ts:379-383`). `.toUpperCase()` ist auf einer reinen
     *    Ziffernfolge ueberhaupt nicht falsifizierbar; das ist Falle 24s Punkt.
     *
     *  - `"482137"` haelt ALLEIN jede Normalisierung, die den BINDESTRICH
     *    EINSETZT. Das ist der Fall, den Nachtrag N-2 benennt: ruft jemand die
     *    modul-eigene `normalisiereCode` INNERHALB von `redeemToken`, dann
     *    liefert sie fuer `"482137"` den Wert `"482-137"` (`_lib/code.ts:27-28`)
     *    — der Aufruf gelaenge. `" 482-137 "` sieht diesen Fall zwar MIT, weil
     *    `normalisiereCode` zusaetzlich trimmt; eine Bindestrich-Einsetzung ohne
     *    trim (etwa eine aufgeteilte Fassung) faellt aber NUR hier auf.
     *
     * ⚠️ WER EINE DER BEIDEN ZEILEN ALS REDUNDANT STREICHT, verliert genau einen
     * der beiden Faelle. Die zweite ist nicht die schwaechere: sie haelt den
     * REALISTISCHEREN Regelbruch (N-2), und der scheitert STILL — auf dem
     * Haupt-Erfolgspfad, mit „Code unbekannt" am Gate.
     */
    expect(await redeemToken(" 482-137 ", t.db)).toStrictEqual({ ok: false });
    expect(await redeemToken("482137", t.db)).toStrictEqual({ ok: false });
  });
});

describe("Bauform", () => {
  it("verlangt das DB-Handle — es holt sich keins (§5.13.2)", () => {
    /*
     * `_db/client.ts#getDb()` ist der EINZIGE Opener des Moduls. Ein Schreibpfad,
     * der ihn selbst riefe, waere der erste, der die Regel aufweicht — und der
     * Aufrufer weiss, ob er in einer Transaktion steht.
     *
     * `redeemToken.length` steht VOR den Quelltext-Scans, weil es der einzige
     * nicht-textuelle Traeger ist: `Function.length` zaehlt die Parameter BIS zum
     * ersten mit Vorgabewert. Das `db: DB = getDb()` des Bestands
     * (`token-redeem.ts:8`) machte daraus eine 1 — unabhaengig von jeder
     * Schreibweise.
     */
    expect(redeemToken.length).toBe(2);

    const q = ohneKommentare(readFileSync(QUELLE, "utf8"));
    expect(q).toMatch(/redeemToken\(\s*code: string,\s*db: DB\s*\)/);
    expect(q).not.toMatch(/getDb\(\)/);
  });

  it("liegt unter `_lib/schreibpfade/` — sie SCHREIBT (§2.1 h)", () => {
    // `expect(QUELLE).toMatch(/\/_lib\/schreibpfade\//)` pruefte ein Literal
    // gegen sich selbst (QUELLE ist Zeile 10 DIESER Datei) und kann konstruktiv
    // nie fehlschlagen — derselbe Review-Befund, den T65 in `pwaIcons.test.ts`
    // schon behoben hat. Geprueft wird deshalb der TATSAECHLICHE Ort: die Datei
    // liegt genau dort, und NICHT flach unter `_lib/`.
    expect(existsSync(QUELLE)).toBe(true);
    const FLACH = QUELLE.replace("/_lib/schreibpfade/", "/_lib/");
    expect(FLACH).not.toBe(QUELLE);
    expect(existsSync(FLACH)).toBe(false);
  });

  it("traegt KEIN \"use client\"", () => {
    // Drei Aufrufer, alle serverseitig. Gelesen wird ohne Kommentare — die Datei
    // benennt die Eigenschaft in ihrem eigenen Kopf (Regel 1, K-3).
    expect(ohneKommentare(readFileSync(QUELLE, "utf8"))).not.toMatch(/"use client"/);
  });
});
