import Database from "better-sqlite3";
import { test, expect } from "@playwright/test";
import { registerAuditFunctions } from "@/core/audit/context";
import { devLogin, klickeWennRuhig, warteAufGestreamteInhalte } from "./fixtures";
import { LAGERBUCH_ADMIN_GRUPPE, LAGERBUCH_HOST, lagerbuchUrl } from "./helpers/lagerbuch";

/**
 * SAMMELAKTIONEN FUER BESTELLUNG UND AUSSONDERN (IDA-238).
 *
 * ⚠️ WARUM NEBEN DEN DOM-TESTS — ZWEI AUSSAGEN, DIE NUR EIN ECHTER ABRUF MACHT:
 *
 * (1) DIE INSELN BEKOMMEN NUR SERIALISIERBARES. Die Handlager-Tabelle traegt
 *     die Liegeplaetze als Prop; ein nicht serialisierbarer Wert ueber die
 *     RSC-Grenze waere HTTP 500 fuer die ganze Seite (Falle 9), und jsdom hat
 *     keine solche Grenze.
 *
 * (2) EINE AUSWAHL IST EINE ANFRAGE, und am anderen Ende stehen trotzdem je
 *     Charge eigene Journalzeilen. Dort sind die Actions gemockt; hier zaehlt
 *     die Datenbank.
 *
 * ── DIESE SPEC SCHREIBT, UND SIE STELLT IHREN ZUSTAND SELBST HER ────────────
 *
 * Eigene Artikel und Chargen (`e2e-sammel-*`), damit keine fremde Spec ihre
 * Vorbedingung verliert. Vor jedem Test: die Markierungen genullt, die
 * ausgesonderten Chargen per GEGENBUCHUNG wieder aufgefuellt — `buchungen` ist
 * append-only (Trigger `buchungen_no_delete`), ein DELETE bricht.
 *
 * ⚠️ `ts`/`created_at` IN UNIX-SEKUNDEN (`_db/schema.ts`, `{ mode: "timestamp" }`).
 */
const DB_PFAD = "./.data/e2e/lagerbuch.db";
const ARTIKEL = ["e2e-sammel-a", "e2e-sammel-b"] as const;
const CHARGEN = ["e2e-sammel-ch-a", "e2e-sammel-ch-b"] as const;
const SOLL = 3;

function datenbank<T>(arbeit: (db: Database.Database) => T): T {
  const db = new Database(DB_PFAD);
  registerAuditFunctions(db);
  try {
    return arbeit(db);
  } finally {
    db.close();
  }
}

function stelleHer(): void {
  datenbank((db) => {
    const jetzt = Math.floor(Date.now() / 1000);
    ARTIKEL.forEach((id, i) => {
      db.prepare(
        "insert or ignore into artikel (id, name, einheit, fach, mindestbestand, aktiv, created_at)"
        + " values (?, ?, 'Stk.', 'E2E-S', 50, 1, ?)",
      ).run(id, `E2E Mehrfach ${i === 0 ? "Alpha" : "Beta"}`, jetzt);
      db.prepare("update artikel set bestellt_at = null where id = ?").run(id);
      db.prepare(
        "insert or ignore into chargen (id, artikel_id, chargen_nr, verfall, created_at)"
        + " values (?, ?, ?, '2020-02', ?)",
      ).run(CHARGEN[i], id, `E2E-SAM-${i + 1}`, jetzt);
      const { saldo } = db
        .prepare("select coalesce(sum(menge), 0) as saldo from buchungen where charge_id = ? and lagerort_id = 'handlager'")
        .get(CHARGEN[i]) as { saldo: number };
      if (saldo < SOLL) {
        db.prepare(
          "insert into buchungen (id, ts, typ, artikel_id, charge_id, lagerort_id, menge,"
          + " quelle_typ, quelle_id, referenz, kommentar)"
          + " values (?, ?, 'zugang', ?, ?, 'handlager', ?, 'system', 'e2e', null, null)",
        ).run(`e2e-sammel-${CHARGEN[i]}-${Date.now()}`, jetzt, id, CHARGEN[i], SOLL - saldo);
      }
    });
  });
}

function aussonderungen(): number {
  return datenbank((db) => (db
    .prepare(
      "select count(*) as n from buchungen where charge_id in (?, ?) and referenz like 'aussondern:%'",
    )
    .get(...CHARGEN) as { n: number }).n);
}

test.describe("Sammelaktionen", () => {
  test.beforeEach(async ({ page }) => {
    stelleHer();
    await devLogin(page, {
      host: LAGERBUCH_HOST,
      groups: LAGERBUCH_ADMIN_GRUPPE,
      callbackPath: "/verwaltung",
    });
  });

  test("markiert zwei Artikel in einer Anfrage als bestellt und nimmt es zurueck", async ({ page }) => {
    const antwort = await page.goto(lagerbuchUrl("/verwaltung/bestellung"));
    expect(antwort!.status()).toBe(200);
    await warteAufGestreamteInhalte(page);

    const zeile = (id: string) => page.locator(`[data-rolle='breitansicht'] [data-row-key='${id}']`);
    for (const id of ARTIKEL) {
      await expect(zeile(id)).toContainText("offen");
      await zeile(id).locator("input[type='checkbox']").check();
    }
    const leiste = page.getByTestId("bestell-sammelleiste");
    await expect(leiste).toContainText("2 ausgewählt");

    const posts: string[] = [];
    page.on("request", (r) => { if (r.method() === "POST") posts.push(r.url()); });
    const [markiert] = await Promise.all([
      page.waitForResponse((r) => r.request().method() === "POST" && r.url().includes("/verwaltung/bestellung")),
      klickeWennRuhig(leiste.getByRole("button", { name: "Als bestellt markieren (2)" })),
    ]);
    expect(markiert.status()).toBe(200);
    for (const id of ARTIKEL) await expect(zeile(id)).toContainText("bestellt seit");
    expect(posts, "EINE Anfrage fuer die ganze Auswahl").toHaveLength(1);

    for (const id of ARTIKEL) await zeile(id).locator("input[type='checkbox']").check();
    const [zurueck] = await Promise.all([
      page.waitForResponse((r) => r.request().method() === "POST" && r.url().includes("/verwaltung/bestellung")),
      klickeWennRuhig(leiste.getByRole("button", { name: "Markierung zurücknehmen (2)" })),
    ]);
    expect(zurueck.status()).toBe(200);
    for (const id of ARTIKEL) await expect(zeile(id)).toContainText("offen");
  });

  test("sondert zwei abgelaufene Chargen nach einer Rueckfrage mit je eigener Buchung aus", async ({ page }) => {
    const antwort = await page.goto(lagerbuchUrl("/verwaltung/verfall"));
    expect(antwort!.status()).toBe(200);
    await warteAufGestreamteInhalte(page);

    const zeile = (id: string) => page.locator(`[data-rolle='breitansicht'] [data-row-key='${id}']`);
    for (const id of CHARGEN) {
      await expect(zeile(id)).toContainText("abgelaufen");
      await zeile(id).locator("input[type='checkbox']").check();
    }
    const vorher = aussonderungen();

    await klickeWennRuhig(
      page.getByTestId("verfall-sammelleiste").getByRole("button", { name: "Ausgewählte aussondern" }),
    );
    const rueckfrage = page.locator(".ant-modal").filter({ hasText: "2 Chargen aussondern?" });
    await expect(rueckfrage).toBeVisible();
    await expect(rueckfrage.getByTestId("verfall-sammelliste")).toContainText("E2E-SAM-1 · E2E Mehrfach Alpha");
    await expect(rueckfrage.getByTestId("verfall-sammelliste")).toContainText("E2E-SAM-2 · E2E Mehrfach Beta");

    const [aktion] = await Promise.all([
      page.waitForResponse((r) => r.request().method() === "POST" && r.url().includes("/verwaltung/verfall")),
      rueckfrage.getByRole("button", { name: "2 Chargen aussondern" }).click(),
    ]);
    expect(aktion.status()).toBe(200);

    await expect(page.getByText("2 Chargen ausgesondert.")).toBeVisible();
    for (const id of CHARGEN) await expect(zeile(id)).toHaveCount(0);
    expect(aussonderungen(), "je Charge eine eigene Journalzeile").toBe(vorher + 2);
  });
});

/**
 * TABELLENAUSWAHL (IDA-245): am Tablet treffbar, neutral hervorgehoben, ohne
 * antds Filterwarnung. Gemessen an der Artikelliste, weil sie das Kreuzchen
 * vor IDA-245 noch in 22 px trug, und an allen drei Seiten mit Auswahl.
 */
test.describe("Tabellenauswahl", () => {
  test.use({ viewport: { width: 1024, height: 768 } });

  test.beforeEach(async ({ page }) => {
    stelleHer();
    await devLogin(page, {
      host: LAGERBUCH_HOST,
      groups: LAGERBUCH_ADMIN_GRUPPE,
      callbackPath: "/verwaltung",
    });
  });

  test("Kreuzchen sind 44 px, die gewaehlte Zeile ist nicht rot, keine Filterwarnung", async ({ page }) => {
    const meldungen: string[] = [];
    page.on("console", (m) => { if (m.type() === "error" || m.type() === "warning") meldungen.push(m.text()); });

    for (const pfad of ["/verwaltung/bestellung", "/verwaltung/verfall", "/verwaltung/artikel"]) {
      const antwort = await page.goto(lagerbuchUrl(pfad));
      expect(antwort!.status()).toBe(200);
      await warteAufGestreamteInhalte(page);
    }

    const breit = page.locator("[data-rolle='breitansicht']");
    const kopf = breit.locator("thead label").first();
    const zeile = breit.locator("[data-row-key]").first();
    const kreuz = zeile.locator("label").first();
    for (const [name, ort] of [["Alle auswählen", kopf], ["Zeile", kreuz]] as const) {
      const mass = await ort.boundingBox();
      expect(mass, name).not.toBeNull();
      expect(mass!.width, name).toBeGreaterThanOrEqual(44);
      expect(mass!.height, name).toBeGreaterThanOrEqual(44);
    }

    await zeile.locator("input[type='checkbox']").check();
    await expect(zeile).toHaveClass(/ant-table-row-selected/);
    // Die Maus aus der Zeile nehmen: gemessen wird die Ruhefarbe, nicht der Hover.
    await page.mouse.move(0, 0);
    // Die Artikelliste ist virtualisiert: Zellen sind dort `div`, kein `td` (Falle 14).
    const grund = await zeile.locator(":scope > *").nth(1).evaluate((zelle) => getComputedStyle(zelle).backgroundColor);
    expect(grund, "die Zeile ist ueberhaupt hinterlegt").not.toBe("rgba(0, 0, 0, 0)");
    const [r, g, b] = (grund.match(/\d+/g) ?? []).map(Number);
    expect(Math.max(r, g, b) - Math.min(r, g, b), `neutral statt rot: ${grund}`).toBeLessThanOrEqual(8);

    expect(meldungen.filter((m) => m.includes("filteredValue"))).toEqual([]);
  });
});
