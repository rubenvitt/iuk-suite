import Database from "better-sqlite3";
import { test, expect } from "@playwright/test";
import { registerAuditFunctions } from "@/core/audit/context";
import { devLogin, klickeWennRuhig } from "./fixtures";
import { LAGERBUCH_ADMIN_GRUPPE, LAGERBUCH_HOST, lagerbuchUrl } from "./helpers/lagerbuch";

/**
 * AUSSONDERN JE SCHRANK (DRK-339).
 *
 * ⚠️ WARUM DIESE SPEC NEBEN `AussondernRow.test.tsx` STEHT — DREI AUSSAGEN,
 * DIE NUR EIN ECHTER ABRUF MACHEN KANN:
 *
 * (1) `/verwaltung/verfall` ANTWORTET NOCH. Die Zeile bekommt seit diesem
 *     Ticket die Liegeplaetze als Prop; eine Insel, die einen nicht
 *     serialisierbaren Wert ueber die RSC-Grenze bekaeme, waere HTTP 500 fuer
 *     die ganze Seite — `typecheck` und `build` blieben gruen, und ein
 *     `mount()` in jsdom ist ein einziger JS-Prozess OHNE RSC-Grenze (Falle 9,
 *     `CLAUDE.md`).
 *
 * (2) DIE AUSWAHL IST BEDIENBAR. Die Radio-Gruppe haengt in einem Popconfirm,
 *     also in einem Portal ueber einer Kartenliste. In `AussondernRow.test.tsx`
 *     steht, dass sie die richtigen Werte SCHICKT — nicht, dass man sie im
 *     Browser trifft.
 *
 * (3) DER GEWAEHLTE ORT KOMMT AM ANDEREN ENDE AN. Dort ist die Action gemockt;
 *     dass genau EIN Schrank leer wird und der andere voll bleibt, steht erst
 *     hier fest. Das ist der ganze Zweck des Tickets.
 *
 * ── DIESE SPEC SCHREIBT, UND SIE STELLT IHREN ZUSTAND SELBST HER ────────────
 *
 * Nach dem ersten Durchgang ist Schrank B leer — die Vorbedingung „liegt an
 * ZWEI Orten" waere damit fuer jeden Retry und jeden zweiten Lauf zerstoert,
 * und der Spec faende keine Auswahl mehr vor. `stelleZweiOrteHer` bucht die
 * fehlende Menge deshalb vor JEDEM Test wieder zu.
 *
 * ⚠️ GEGENBUCHUNG, KEIN DELETE. `buchungen` ist append-only; ein
 * `DELETE FROM buchungen` bricht am Trigger `buchungen_no_delete`
 * (Migration 0001). Die Wiederherstellung sieht deshalb aus wie ein
 * Wareneingang — was sie fachlich auch ist.
 */
const DB_PFAD = "./.data/e2e/lagerbuch.db";
const SEITE = "/verwaltung/verfall";
const CHARGE = "e2e-ortswahl-charge";
const SCHRANK_A = "e2e-ortswahl-schrank-a";
const SCHRANK_B = "e2e-ortswahl-schrank-b";
const SOLL = { [SCHRANK_A]: 4, [SCHRANK_B]: 6 } as const;

/**
 * Frische, kurzlebige Verbindung je Aufruf — dieselbe Bauform wie
 * `lagerbuch-helfer.spec.ts:90`.
 *
 * ⚠️ `registerAuditFunctions` IST PFLICHT, NICHT VORSORGE. Die Audit-Trigger
 * der Suite rufen `suite_audit_id()`; eine rohe `better-sqlite3`-Verbindung
 * kennt die Funktion nicht, und ohne diese Zeile bricht schon das `prepare`.
 *
 * ⚠️ `ts` IST IN UNIX-SEKUNDEN, nicht in Millisekunden (`_db/schema.ts`:
 * `{ mode: "timestamp" }`). Eine Millisekundenzahl laege rund 55 000 Jahre in
 * der Zukunft — die Buchung zaehlte trotzdem, das Journal sortierte sie nur
 * fuer immer nach ganz oben.
 */
function stelleZweiOrteHer(): void {
  const db = new Database(DB_PFAD);
  registerAuditFunctions(db);
  try {
    for (const [lagerortId, soll] of Object.entries(SOLL)) {
      const zeile = db
        .prepare("select coalesce(sum(menge), 0) as saldo from buchungen where charge_id = ? and lagerort_id = ?")
        .get(CHARGE, lagerortId) as { saldo: number };
      const fehlt = soll - zeile.saldo;
      if (fehlt <= 0) continue;
      db.prepare(
        "insert into buchungen (id, ts, typ, artikel_id, charge_id, lagerort_id, menge," +
        " quelle_typ, quelle_id, referenz, kommentar)" +
        " values (?, ?, 'zugang', 'e2e-ortswahl-artikel', ?, ?, ?, 'system', 'e2e', null, null)",
      ).run(
        `e2e-ow-${lagerortId}-${Date.now()}`, Math.floor(Date.now() / 1000),
        CHARGE, lagerortId, fehlt,
      );
    }
  } finally {
    db.close();
  }
}

test.describe("Aussondern je Schrank", () => {
  test.beforeEach(async ({ page }) => {
    stelleZweiOrteHer();
    await devLogin(page, {
      host: LAGERBUCH_HOST,
      groups: LAGERBUCH_ADMIN_GRUPPE,
      callbackPath: "/verwaltung",
    });
  });

  test("die Zeile nennt beide Schraenke, und die Wahl sondert nur einen aus", async ({ page }) => {
    const antwort = await page.goto(lagerbuchUrl(SEITE));
    // ⛔ NICHT nur `toBeVisible()` weiter unten: eine 500er Seite waere hier
    // schon entschieden, und die Sichtbarkeitsprobe liefe stattdessen in ihr
    // Zeitbudget und meldete sich als etwas ganz anderes (Falle 10).
    expect(antwort!.status()).toBe(200);

    const zeile = page.getByRole("listitem").filter({ hasText: "E2E-OW" });
    await expect(zeile).toContainText("E2E Ortswahl Schrank A: 4 Stk.");
    await expect(zeile).toContainText("E2E Ortswahl Schrank B: 6 Stk.");
    // Die Summe steht daneben, weil es ZWEI Liegeplaetze sind.
    await expect(zeile).toContainText("Rest 10 Stk.");

    await klickeWennRuhig(
      zeile.getByRole("button", { name: /^E2E-OW · E2E Ortswahl Schere aussondern$/ }),
    );

    const bestaetigung = page.locator(".ant-popconfirm").filter({ hasText: "Charge aussondern?" });
    await expect(bestaetigung).toBeVisible();

    /**
     * ⚠️ GEWAEHLT UND GEPRUEFT WIRD AM LABEL, NICHT AM `input` — dieselbe
     * Lehre, die `lagerbuch-einheitenart.spec.ts` ausgeschrieben hat: antd legt
     * das eigentliche `input[type=radio]` unsichtbar unter das Label, und eine
     * Aktion darauf wartet auf eine Sichtbarkeit, die nie eintritt. Die
     * Meldung nennt dann das gefundene Element und klingt nach einem
     * Zeitproblem, ist aber ein Bauformproblem.
     */
    const wahl = (beschriftung: string) =>
      bestaetigung.locator("label.ant-radio-wrapper")
        .filter({ hasText: new RegExp(`^${beschriftung}$`) });

    await expect(wahl("Alles \\(10 Stk\\.\\)"))
      .toHaveClass(/ant-radio-wrapper-checked/);

    await wahl("nur E2E Ortswahl Schrank B \\(6 Stk\\.\\)").click();

    /*
     * ⚠️ AUF DIE ANTWORT WARTEN, NICHT AUF EINE SPAETERE ZUSTANDSAENDERUNG
     * (Falle 10, zweite Testregel). Eine abgelehnte Server Action (404, 405,
     * abgebrochen) liefe sonst still ins Zeitbudget und meldete sich als
     * „die Zeile hat sich nicht geaendert" — einem Symptom, das in die Irre
     * fuehrt.
     */
    const [aktionsAntwort] = await Promise.all([
      page.waitForResponse((r) => r.request().method() === "POST" && r.url().includes(SEITE)),
      bestaetigung.getByRole("button", { name: "Aussondern", exact: true }).click(),
    ]);
    expect(aktionsAntwort.status()).toBe(200);

    /*
     * DIE EIGENTLICHE ZUSICHERUNG DES TICKETS: Schrank B ist leer, Schrank A
     * steht unveraendert. Vor DRK-339 hatte derselbe Knopf BEIDE ausgebucht.
     */
    await expect(zeile).not.toContainText("E2E Ortswahl Schrank B");
    await expect(zeile).toContainText("E2E Ortswahl Schrank A: 4 Stk.");
    // Ein einziger Liegeplatz — die Summe daneben faellt weg, sie saegte
    // dieselbe Zahl ein zweites Mal hin.
    await expect(zeile).not.toContainText("Rest");
  });
});
