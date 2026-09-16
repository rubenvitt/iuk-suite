import { test, expect } from "@playwright/test";
import { devLogin, klickeWennRuhig } from "./fixtures";

/**
 * DER EINZIGE BEWEIS FÜR DEN EINGESCHALTETEN ZWEIG.
 *
 * Die normale E2E-Suite fährt mit leeren `SUITE_FORMBRICKS_*` (siehe die
 * Begründung in `playwright.config.ts`) — jeder andere Test der Suite läuft
 * also durch den AUSGESCHALTETEN Zweig. Ohne diese Datei wäre der
 * eingeschaltete von gar keinem Tor gedeckt: `typecheck` und `build` sehen eine
 * gültige Komponente, und **Vitest kann die Server-/Client-Grenze strukturell
 * nicht sehen** (dort ist `"use client"` ein wirkungsloser String, Falle 6/7).
 *
 * ⚠️ DAS SKRIPT WIRD ABGEFANGEN, NICHT GELADEN. Kein Aufruf verlässt die
 * Maschine — der Test soll die Verdrahtung messen, nicht die Erreichbarkeit
 * eines fremden Servers. Der Ersatz meldet jeden Aufruf in `window.__umfragen`,
 * und damit misst diese Datei mehr als ein vorhandenes `<script>`-Element: sie
 * misst, dass `setup()` mit der richtigen Workspace-ID ANKOMMT.
 */

const SKRIPT = "**/js/formbricks.umd.cjs";
const WORKSPACE = "e2e-workspace";

type Aufruf = [string, unknown?];
declare global {
  interface Window {
    __umfragen?: Aufruf[];
  }
}

/** Ersetzt das echte Formbricks durch eine Attrappe, die nur mitschreibt. */
async function skriptAbfangen(seite: import("@playwright/test").Page) {
  await seite.route(SKRIPT, (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/javascript",
      body: `
        window.__umfragen = window.__umfragen || [];
        window.formbricks = {
          setup: (o) => window.__umfragen.push(["setup", o]),
          registerRouteChange: () => window.__umfragen.push(["route"]),
        };
      `,
    }),
  );
}

const aufrufe = (seite: import("@playwright/test").Page) =>
  seite.evaluate(() => window.__umfragen ?? []);

test("Arbeitsfläche: das Skript lädt und setup() kommt mit der Workspace-ID an", async ({
  page,
}) => {
  await skriptAbfangen(page);
  await devLogin(page, { host: "portal.localtest.me", port: 3102 });

  // ⚠️ Zuerst der Status: ein HTTP 500 aus Falle 6/7 wäre sonst nur ein
  // fehlendes Skript-Element, und die Meldung zeigte auf die falsche Ursache.
  const antwort = await page.goto("http://portal.localtest.me:3102/");
  expect(antwort?.status(), "Arbeitsfläche antwortet").toBe(200);

  await expect
    .poll(() => aufrufe(page), { message: "setup() wurde gerufen" })
    .toContainEqual(["setup", expect.objectContaining({ workspaceId: WORKSPACE })]);

  // POSITIVKONTROLLE für die Abwesenheits-Fälle weiter unten: derselbe Greifer
  // findet hier etwas. Ohne diese Zeile wären jene Fälle auch dann grün, wenn
  // der Selektor nie auf irgendetwas passte — sie prüften dann nichts.
  await expect(page.locator('script[src*="formbricks"]')).toHaveCount(1);
});

test("weicher Seitenwechsel meldet sich — sonst feuert eine Umfrage nur einmal", async ({
  page,
}) => {
  await skriptAbfangen(page);
  await devLogin(page, { host: "portal.localtest.me", port: 3102 });
  await page.goto("http://portal.localtest.me:3102/");
  await expect.poll(() => aufrufe(page)).toContainEqual(["setup", expect.anything()]);

  // Ein Klick im Portal, nicht `goto`: nur der weiche Wechsel ist der Fall, den
  // Formbricks von sich aus NICHT bemerkt.
  await page.getByRole("link", { name: /Neuigkeiten/i }).first().click();
  await expect(page).toHaveURL(/neuigkeiten/);

  await expect
    .poll(() => aufrufe(page), { message: "registerRouteChange() nach weichem Wechsel" })
    .toContainEqual(["route"]);
});

test.describe("Flächen, die frei bleiben", () => {
  test("Kiosk trägt kein Umfragen-Skript", async ({ page }) => {
    await skriptAbfangen(page);
    const antwort = await page.goto("http://kioskdemo.localtest.me:3102/");
    expect(antwort?.status()).toBe(200);
    await expect(page.locator('script[src*="formbricks"]')).toHaveCount(0);
  });

  test("die schmale Ansicht (QR-Codes) trägt kein Umfragen-Skript", async ({ page }) => {
    await skriptAbfangen(page);
    const antwort = await page.goto("http://qr.localtest.me:3102/");
    expect(antwort?.status()).toBe(200);
    await expect(page.locator('script[src*="formbricks"]')).toHaveCount(0);
  });
});

/**
 * DAS AUSSEHEN — DER TEIL, DEN NUR EIN ECHTER BROWSER SEHEN KANN (DRK-357).
 *
 * `src/core/umfragen/aussehen.test.ts` prüft die Zuordnung, die Vollständigkeit
 * und die Kontrastzahlen ohne zu rendern. Was dort strukturell NICHT geprüft
 * werden kann, ist genau das, worauf es ankommt:
 *   - dass die Regel die KASKADE gewinnt. Formbricks hängt das eingestellte
 *     Look-&-Feel zur Laufzeit als eigenen `#fbjs { … }`-Block in den `<head>`
 *     — gleiche Spezifität, spätere Position. jsdom wertet keine Kaskade aus;
 *   - dass die Variablen zu einer MALBAREN Farbe auflösen. Ein Tippfehler im
 *     Variablennamen ergibt eine leere Deklaration, und die ist still;
 *   - dass der Wechsel OHNE NEULADEN mitzieht. Der Umschalter schreibt nur
 *     `data-theme` am `<html>` neu.
 *
 * ⚠️ DIE UMFRAGE SELBST IST HIER NICHT AUF DEM SCHIRM, und das ist Absicht: das
 * Skript wird abgefangen (Begründung oben), es gibt also kein Widget. Geprüft
 * wird die WIRKUNG der Regel an einem Wirtselement mit derselben ID, das der
 * Test selbst einhängt — samt Gegenprobe. Eine echte Umfrage hinge an einem
 * fremden Server und an einer im Formbricks angelegten Umfrage; sie machte den
 * Lauf abhängig und prüfte an dieser Stelle nichts dazu.
 */
test.describe("Hell/Dunkel", () => {
  /** Die Farbe, mit der die Gegenprobe gewinnen WÜRDE, wenn sie gewinnt. */
  const GEGENPROBE = "rgb(0, 255, 0)";

  /**
   * Hängt zuerst den Block ein, den Formbricks zur Laufzeit selbst schreibt —
   * mit demselben Stilelement-Namen, derselben Spezifität und derselben
   * Position (`<head>`, nach allem anderen) —, dann ein Wirtselement `#fbjs`
   * mit einem Kind, das die beiden tragenden Variablen tatsächlich MALT.
   */
  async function wirtUndGegenprobe(seite: import("@playwright/test").Page) {
    await seite.evaluate((gegenprobe) => {
      const stil = document.createElement("style");
      stil.id = "formbricks__css__custom";
      stil.textContent = `#fbjs { --fb-survey-background-color: ${gegenprobe}; --fb-heading-color: ${gegenprobe}; }`;
      document.head.appendChild(stil);

      const wirt = document.createElement("div");
      wirt.id = "fbjs";
      const kind = document.createElement("p");
      kind.id = "umfragen-probe";
      kind.style.background = "var(--fb-survey-background-color)";
      kind.style.color = "var(--fb-heading-color)";
      kind.textContent = "Probe";
      wirt.appendChild(kind);
      document.body.appendChild(wirt);
    }, GEGENPROBE);
  }

  /**
   * Liest in EINEM Rutsch: den gestempelten Modus, die beiden Variablen am
   * Wirt, die daraus gemalten Farben und den Kontrast zwischen ihnen. Der
   * Kontrast wird aus den GEMALTEN Werten gerechnet, nicht aus der Zuordnung —
   * damit die Zahl unabhängig von der Tabelle ist, die sie bestätigen soll.
   */
  function messen(seite: import("@playwright/test").Page) {
    return seite.evaluate(() => {
      const wirt = document.getElementById("fbjs");
      const probe = document.getElementById("umfragen-probe");
      if (!wirt || !probe) throw new Error("Wirt oder Probe fehlt");
      const am = getComputedStyle(wirt);
      const gemalt = getComputedStyle(probe);

      /*
       * ⚠️ MIT DER DECKUNGSSTUFE GERECHNET. antds Schriftrollen sind
       * `rgba(…)` — `rgba(0,0,0,0.88)` ungerechnet ist reines Schwarz und
       * ergibt 21:1, wo in Wirklichkeit 15:1 stehen. Der Fehler geht in die
       * falsche Richtung: eine Zusicherung, die zu GUT rechnet, hält nichts.
       */
      const kanal = (farbe: string): number[] => {
        const teile = farbe.match(/[\d.]+/g);
        if (!teile) throw new Error(`keine Farbe: ${farbe}`);
        const [r, g, b] = teile.slice(0, 3).map(Number);
        return [r, g, b, teile[3] === undefined ? 1 : Number(teile[3])];
      };
      const leuchtdichte = (farbe: string, grund?: string) => {
        const [r, g, b, a] = kanal(farbe);
        const [gr, gg, gb] = grund === undefined ? [0, 0, 0] : kanal(grund);
        const [lr, lg, lb] = [
          r * a + gr * (1 - a),
          g * a + gg * (1 - a),
          b * a + gb * (1 - a),
        ]
          .map((v) => v / 255)
          .map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
        return 0.2126 * lr + 0.7152 * lg + 0.0722 * lb;
      };

      // Das `<style>` der Insel, als Text — daraus liest der Test gleich, was
      // für den geltenden Modus deklariert IST, und vergleicht es mit dem, was
      // der Browser daraus gemacht hat.
      const stylesheet = document.getElementById("umfragen-farben")?.textContent ?? "";

      const [hoch, tief] = [
        leuchtdichte(gemalt.backgroundColor),
        leuchtdichte(gemalt.color, gemalt.backgroundColor),
      ].sort((a, b) => b - a);

      return {
        modus: document.documentElement.dataset.theme ?? "",
        flaeche: am.getPropertyValue("--fb-survey-background-color").trim(),
        schrift: am.getPropertyValue("--fb-heading-color").trim(),
        gemalteFlaeche: gemalt.backgroundColor,
        gemalteSchrift: gemalt.color,
        kontrast: (hoch + 0.05) / (tief + 0.05),
        stylesheet,
      };
    });
  }

  /** Was der ausgelieferte Block für einen Modus deklariert. */
  function ausStylesheet(stylesheet: string, modus: string, variable: string): string {
    const anfang = stylesheet.indexOf(`html[data-theme="${modus}"] #fbjs {`);
    expect(anfang, `Block für ${modus}`).toBeGreaterThanOrEqual(0);
    const block = stylesheet.slice(anfang, stylesheet.indexOf("}", anfang));
    const treffer = block.match(new RegExp(`--fb-${variable}:\\s*([^;]+);`));
    expect(treffer, `--fb-${variable} im Block ${modus}`).not.toBeNull();
    return treffer![1].trim();
  }

  test("die Umfragenfarben folgen dem Umschalter — ohne Neuladen", async ({ page }) => {
    await skriptAbfangen(page);
    await devLogin(page, { host: "portal.localtest.me", port: 3102 });

    const antwort = await page.goto("http://portal.localtest.me:3102/");
    expect(antwort?.status(), "Arbeitsfläche antwortet").toBe(200);
    await expect
      .poll(() => aufrufe(page), { message: "setup() wurde gerufen" })
      .toContainEqual(["setup", expect.anything()]);

    await wirtUndGegenprobe(page);

    // ── Hell ────────────────────────────────────────────────────────────────
    const hell = await messen(page);
    expect(hell.modus, "Vorgabe ist Auto, und das System ist hier hell").toBe("light");
    expect(hell.stylesheet, "das Stylesheet der Insel ist ausgeliefert").toContain("#fbjs");

    // Die Gegenprobe steht später im `<head>` und hat dieselbe Spezifität wie
    // ein Block auf `#fbjs` allein. Sie darf nicht gewinnen — genau das ist
    // Falle 5, und sie wäre still.
    expect(hell.flaeche, "Gegenprobe darf nicht gewinnen").not.toBe(GEGENPROBE);
    expect(hell.gemalteFlaeche).not.toBe(GEGENPROBE);
    expect(hell.flaeche).toBe(ausStylesheet(hell.stylesheet, "light", "survey-background-color"));
    expect(hell.schrift).toBe(ausStylesheet(hell.stylesheet, "light", "heading-color"));

    // Auflösung bis zur gemalten Farbe: ein Tippfehler im Variablennamen ergäbe
    // eine leere Deklaration, und `background` fiele still auf durchsichtig.
    expect(hell.gemalteFlaeche, "Fläche ist eine echte Farbe").toMatch(/^rgb/);
    expect(hell.kontrast, "Schrift auf Fläche, hell").toBeGreaterThanOrEqual(4.5);

    // ── Umschalten, ohne die Seite zu verlieren ─────────────────────────────
    // Der Wächter beweist, dass kein Neuladen dazwischenkommt: bei einem Reload
    // wären Wirt, Gegenprobe UND diese Markierung weg.
    await page.evaluate(() => {
      (window as unknown as { __ohneNeuladen?: boolean }).__ohneNeuladen = true;
    });

    // Drei Zustände, ein Knopf: auto → hell → dunkel. Geklickt wird über
    // `klickeWennRuhig` (Falle 12).
    for (let versuch = 0; versuch < 3; versuch++) {
      if ((await messen(page)).modus === "dark") break;
      await klickeWennRuhig(page.getByTestId("theme-toggle"));
    }

    const dunkel = await messen(page);
    expect(dunkel.modus, "der Umschalter ist bei dunkel angekommen").toBe("dark");
    expect(
      await page.evaluate(
        () => (window as unknown as { __ohneNeuladen?: boolean }).__ohneNeuladen === true,
      ),
      "kein Neuladen zwischen den beiden Messungen",
    ).toBe(true);

    // ── Dunkel ──────────────────────────────────────────────────────────────
    expect(dunkel.flaeche, "Gegenprobe darf auch hier nicht gewinnen").not.toBe(GEGENPROBE);
    expect(dunkel.flaeche).toBe(
      ausStylesheet(dunkel.stylesheet, "dark", "survey-background-color"),
    );
    expect(dunkel.schrift).toBe(ausStylesheet(dunkel.stylesheet, "dark", "heading-color"));
    expect(dunkel.kontrast, "Schrift auf Fläche, dunkel").toBeGreaterThanOrEqual(4.5);

    /*
     * ⚠️ DER FALL, DEN ALLE VORHERIGEN ZUSAMMEN NICHT AUSSCHLIESSEN: beide
     * Blöcke könnten denselben Satz tragen. Dann wären alle Zusicherungen oben
     * grün, und die Umfrage stünde in einem der beiden Modi trotzdem daneben —
     * also genau der Befund, der dieses Ticket ausgelöst hat. Gemessen wird an
     * der Leuchtdichte, nicht am Farbwert: sie ist die Aussage („erscheint
     * dunkel"), der Farbwert nur ihre Schreibweise.
     */
    expect(dunkel.gemalteFlaeche, "dunkel ist nicht hell").not.toBe(hell.gemalteFlaeche);
    const dichte = (farbe: string) => {
      const [r, g, b] = farbe.match(/[\d.]+/g)!.slice(0, 3).map(Number);
      return (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    };
    expect(dichte(hell.gemalteFlaeche), "helle Karte ist hell").toBeGreaterThan(0.8);
    expect(dichte(dunkel.gemalteFlaeche), "dunkle Karte ist dunkel").toBeLessThan(0.2);
  });
});
