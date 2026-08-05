import { describe, it, expect } from "vitest";
import { grenzen, grenzenFehler, ZAHL_NAMEN } from "./grenzen";
import {
  LAGERBUCH_ENV, LAGERBUCH_HOST, LAGERBUCH_ADMIN_GRUPPE,
} from "../../../../../e2e/helpers/lagerbuch";

/**
 * DIE NEUN ENV-ZEILEN DES E2E-SERVERS, GEGEN DAS MODUL GEKOPPELT (I-16, H9).
 *
 * ⚠️ WARUM ES DIESE DATEI GIBT. `LAGERBUCH_ENV` ist ein
 * `Record<string, string>` — TypeScript prueft daran KEINEN einzigen Schluessel
 * und KEINEN einzigen Wert. Zwei stille Fehlerfaelle:
 *
 *  1. NAMEN. Ein Tippfehler (`LAGERBUCH_VERFAL_ROT_TAGE`) waere gueltiges
 *     TypeScript, `grenzen.ts` fiele auf die Vorgabe zurueck, und Boot-Pruefung 1
 *     meldete NICHTS — „nicht gesetzt" ist dort per Definition in Ordnung. Der
 *     E2E-Lauf bliebe gruen und pruefte einen anderen Wert als den, den die Zeile
 *     zu setzen behauptet.
 *  2. WERTE. Der Kommentar an der Konstante sagt „Fixtures rechnen gegen die
 *     Vorgaben" — die sechs Zahlen sind aber LITERALE. Aenderte jemand eine
 *     Vorgabe (ROT 31 → 45), bliebe E2E bei 31 und testete stillschweigend einen
 *     Nicht-Vorgabewert, ohne dass ein Lauf rot wuerde.
 *
 * Genau die Klasse, fuer die H9 geschrieben wurde („zwei Literale liefen
 * auseinander, ohne dass ein Lauf rot wuerde"). H9 deckt Host, Gruppe und
 * Token-Codes ab; die sechs Zahlen waren die vierte, ungekoppelte Kategorie.
 *
 * ⚠️ DIE VORGABEN WERDEN NICHT ABGESCHRIEBEN, SONDERN GERECHNET. `ZAHLEN` ist
 * bewusst nicht exportiert (sonst pruefte `grenzen.test.ts` sich selbst); die
 * Vorgaben sind ueber `grenzen({})` — die leere Umgebung — ohnehin oeffentlich
 * und exakt. Eine eigene Zahlentabelle hier waere ein DRITTES Literal und
 * brächte den Fehler nur an eine neue Stelle.
 *
 * ⚠️ DIESE DATEI LIEGT UNTER `src/`, NICHT UNTER `e2e/`. `vitest.config.ts`
 * schliesst `e2e/**` aus (dort liegen die Playwright-Specs); ein Test dort liefe
 * nie. Vorbild: `files/_lib/devAufbau.test.ts`, das aus demselben Grund relativ
 * nach `e2e/helpers/` importiert.
 */

/** Die Nicht-Zahl-Variablen mit `LAGERBUCH_`-Praefix. Sie stehen hier
 *  ausgeschrieben, damit eine NEUE `LAGERBUCH_*`-Zeile in `LAGERBUCH_ENV`
 *  auffaellt, statt stillschweigend durchzugehen. */
const ERLAUBT_OHNE_ZAHL = ["LAGERBUCH_HELFER_SITZUNG_SECRET"];

describe("LAGERBUCH_ENV — die Namen (I-16, erste Haelfte)", () => {
  it("setzt JEDE Zahl-Variable des Moduls", () => {
    for (const name of ZAHL_NAMEN) {
      expect(Object.keys(LAGERBUCH_ENV), `${name} fehlt in LAGERBUCH_ENV`)
        .toContain(name);
    }
  });

  it("setzt KEINEN unbekannten LAGERBUCH_*-Schluessel", () => {
    // Die Gegenrichtung — sie faengt den Tippfehler. Ein
    // `LAGERBUCH_VERFAL_ROT_TAGE` steht in keiner der beiden Listen.
    const bekannt = new Set<string>([...ZAHL_NAMEN, ...ERLAUBT_OHNE_ZAHL]);
    const unbekannt = Object.keys(LAGERBUCH_ENV)
      .filter((k) => k.startsWith("LAGERBUCH_") && !bekannt.has(k));
    expect(unbekannt).toEqual([]);
  });

  it("setzt Host und Admin-Gruppe aus DENSELBEN Konstanten wie die Specs (H9)", () => {
    expect(LAGERBUCH_ENV.SUITE_HOST_LAGERBUCH).toBe(LAGERBUCH_HOST);
    expect(LAGERBUCH_ENV.SUITE_ADMIN_GROUP_LAGERBUCH).toBe(LAGERBUCH_ADMIN_GRUPPE);
  });

  it("setzt SUITE_ACCESS_GROUP_LAGERBUCH ausdruecklich NICHT", () => {
    // §2.5, §10.5 Pruefung 6: ein gesetzter Wert bricht den Boot ab. Die
    // Gegenprobe gehoert hierher, weil sie sonst nur im Kommentar steht.
    expect(LAGERBUCH_ENV).not.toHaveProperty("SUITE_ACCESS_GROUP_LAGERBUCH");
  });
});

describe("LAGERBUCH_ENV — die Werte (I-16, zweite Haelfte)", () => {
  it("setzt jede Zahl auf GENAU ihren Vorgabewert", () => {
    /**
     * ⚠️ DIE EINE ZEILE, DIE DIE ZUSAGE TRAEGT. `grenzen({})` ist die
     * Vorgaben-Auswertung; weicht auch nur eine der sechs E2E-Zahlen ab, sind
     * die beiden Objekte verschieden. Sie faengt BEIDE Richtungen: eine
     * geaenderte Vorgabe in `grenzen.ts` ohne Nachzug in `LAGERBUCH_ENV`, und
     * einen versehentlich „klein gesetzten" E2E-Wert.
     *
     * ⚠️ SIE FAENGT KEINEN TIPPFEHLER IM NAMEN — der faellt auf die Vorgabe
     * zurueck und liefe hier gleich aus. Dafuer sind die beiden Namenstests oben
     * da; die zwei Haelften gehoeren zusammen.
     */
    expect(grenzen(LAGERBUCH_ENV)).toEqual(grenzen({}));
  });

  it("die sechs Zahlen sind ganzzahlig und werden ueberhaupt gelesen", () => {
    // Gegenprobe zum Test darueber: waeren die Werte kaputt („5000x"), wuerfe
    // `grenzen` statt zu vergleichen — und ein leerer String gilt wie nicht
    // gesetzt und liefe ebenfalls gleich aus.
    for (const name of ZAHL_NAMEN) {
      expect(LAGERBUCH_ENV[name], name).toMatch(/^\d+$/);
    }
  });

  it("besteht ALLE vier Boot-Pruefungen — die Kopplungen sind erfuellt", () => {
    /**
     * ROT <= GELB, ABSENDER <= GESAMT/min <= GESAMT/h, Geheimnis >= 32 Zeichen,
     * != Alt-Default, != AUTH_SECRET. `AUTH_SECRET` ist der Wert aus
     * `playwright.config.ts` (`"test-secret"`) — ohne ihn pruefte die letzte der
     * fuenf Bedingungen nichts.
     *
     * Die Meldungen sind bewusst mit ausgegeben: eine leere Liste ist hier die
     * Zusage, und eine nicht-leere soll sagen, WELCHE Kopplung brach.
     */
    const fehler = grenzenFehler({ ...LAGERBUCH_ENV, AUTH_SECRET: "test-secret" });
    expect(fehler, fehler.join(" | ")).toEqual([]);
  });
});
