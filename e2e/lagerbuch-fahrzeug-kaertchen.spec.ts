import { test, expect } from "@playwright/test";
import {
  E2E_FAHRZEUG_ANDERES_ID,
  E2E_FAHRZEUG_ANDERES_NAME,
  E2E_FAHRZEUG_ID,
  E2E_FAHRZEUG_NAME,
  E2E_TOKEN_FAHRZEUG,
  E2E_TOKEN_HELFER,
  lagerbuchUrl,
} from "./helpers/lagerbuch";

/**
 * DER EINSTIEG NACH DEM FAHRZEUG-SCAN — DRK-302.
 *
 * ⚠️ WARUM DAS HIER UND NICHT IN VITEST STEHT. Die Unit-Halbzeit
 * (`helfer/check/page.test.tsx`) rendert die Seite mit ATTRAPPEN fuer
 * `next/headers` und alle vier Lesepfade; sie kann zeigen, WAS die Seite aus
 * einer Token-Zeile macht, aber nicht, dass ein gescannter Code ueberhaupt in
 * dieser Zeile landet. Dazwischen liegen der Route Handler `/t/<code>`, seine
 * 303 mit relativem `Location`, das gesetzte Cookie und der Riegel, der es
 * wieder aufloest — vier Stationen, die zusammen genau die Zusage tragen, die
 * das Ticket als erstes Akzeptanzkriterium fuehrt („Der Scan eines
 * Fahrzeug-QR-Codes oeffnet den Kontext des zugehoerigen Fahrzeugs").
 *
 * ⚠️ NUR LESEN, NICHT BUCHEN. Playwright faehrt alle Specs in EINEM Worker
 * gegen EINE SQLite-Datei; diese Datei hinterlaesst deshalb nichts ausser
 * `tokens.last_used_at` von `E2E_TOKEN_FAHRZEUG` — und den liest keine andere
 * Spec. Der Abschluss-Weg gehoert `lagerbuch-helfer.spec.ts` und bleibt dort.
 *
 * ⚠️ KEIN WARMLAUF-GET (Falle 10): diese Datei loest keinen einzigen POST aus.
 * Und kein `klickeWennRuhig` (Falle 12): sie navigiert mit `goto`, statt zu
 * klicken.
 *
 * ⚠️ ZWEI AKTIVE FAHRZEUGE SIND VORBEDINGUNG, nicht Kulisse. Gaebe es nur
 * eines, waere „keine Fahrzeugwahl" trivial wahr — die Seite bietet die Wahl
 * schon im Bestand nicht an, wenn genau ein aktives Fahrzeug existiert
 * (`helfer/check/page.tsx`). Der erste Test prueft die Vorbedingung deshalb
 * ausdruecklich, statt sie anzunehmen.
 */

/**
 * Ein Fahrzeugname als Suchmuster. Die Namen stehen in `helpers/lagerbuch.ts`
 * und tragen mit „E2E Geräte RTW" absichtlich einen, der den anderen NICHT
 * enthaelt — sonst waere jede `toHaveCount(0)`-Gegenprobe unten wertlos.
 *
 * ⚠️ UND DAS KAERTCHEN-LABEL TRAEGT KEINEN FAHRZEUGNAMEN (Seed: „E2E
 * Fahrzeugkärtchen"). Das Label steht im Sitzungsetikett des Helfer-Rahmens,
 * also auf JEDER Seite dieses Zweigs; truege es „E2E RTW", faende jede
 * Zusicherung unten ihren Treffer schon dort — und bliebe gruen, wenn die
 * Ueberschrift ueber dem Check-Schritt ganz fehlte.
 */
const alsText = (name: string) => new RegExp(name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));

test.describe("DRK-302 — ein gescanntes Fahrzeug-Kaertchen begrenzt den Check", () => {
  test("die Vorbedingung: ES GIBT mehr als ein aktives Fahrzeug", async ({ page }) => {
    /*
     * Ohne diesen Test bewiese der Rest nichts. Der Beleg kommt aus der
     * Anwendung selbst und nicht aus der Datenbank: ein UNGEBUNDENES Kaertchen
     * bekommt die Wahl zu sehen — und die Wahl gibt es nur bei zwei oder mehr
     * aktiven Fahrzeugen.
     */
    await page.goto(lagerbuchUrl(`/t/${E2E_TOKEN_HELFER}`));
    await page.goto(lagerbuchUrl("/helfer/check"));

    // DRK-309: NEUTRAL — die Liste darunter fuehrt Fahrzeuge UND Taschen.
    await expect(page.getByText("Einheit wählen")).toBeVisible();
    await expect(page.getByRole("link", { name: alsText(E2E_FAHRZEUG_NAME) })).toBeVisible();
    await expect(
      page.getByRole("link", { name: alsText(E2E_FAHRZEUG_ANDERES_NAME) }),
    ).toBeVisible();
  });

  test("der Scan landet unmittelbar im Check SEINES Fahrzeugs", async ({ page }) => {
    // AKZEPTANZKRITERIUM 1 und 3 in einem Lauf: der Kontext oeffnet sich, und
    // das Fahrzeug steht als Ueberschrift darueber.
    await page.goto(lagerbuchUrl(`/t/${E2E_TOKEN_FAHRZEUG}`));

    // Als Praedikat und nicht als Regex: ein `?` im Muster ist der klassische
    // stille Fehlgriff — unescaped macht es das vorige Zeichen optional, und die
    // Zusicherung passte dann auf eine URL ohne jeden Suchparameter.
    await page.waitForURL(
      (u) => u.pathname.endsWith("/helfer/check") && u.searchParams.get("fz") === E2E_FAHRZEUG_ID,
    );
    await expect(page.getByText(alsText(E2E_FAHRZEUG_NAME))).toBeVisible();
  });

  test("ohne `?fz=` bleibt es bei SEINEM Fahrzeug — keine Wahl", async ({ page }) => {
    /*
     * DER TAB-WEG, und er ist der wichtigere von beiden: die Tab-Leiste zeigt
     * auf das nackte `/helfer/check` (`_ui/HelferRahmen.tsx`). Ohne die Bindung
     * landete die Helferin nach einem einzigen Tipp auf „Check" wieder
     * in der Liste aller Fahrzeuge — der Scan waere dann eine Vorauswahl
     * gewesen, kein Kontext.
     */
    await page.goto(lagerbuchUrl(`/t/${E2E_TOKEN_FAHRZEUG}`));
    await page.goto(lagerbuchUrl("/helfer/check"));

    await expect(page.getByText(alsText(E2E_FAHRZEUG_NAME))).toBeVisible();
    /*
     * ⚠️ DER TEXT MUSS DER HEUTIGE SEIN (DRK-309). „Fahrzeug wählen" gibt es
     * nicht mehr, und `toHaveCount(0)` darauf waere ab sofort trivial gruen —
     * die Zusicherung „das Kaertchen ueberspringt die Wahl" haette aufgehoert,
     * irgendetwas zu behaupten, ohne rot zu werden.
     */
    await expect(page.getByText("Einheit wählen")).toHaveCount(0);
    await expect(
      page.getByRole("link", { name: alsText(E2E_FAHRZEUG_ANDERES_NAME) }),
    ).toHaveCount(0);
  });

  test("ein `?fz=` auf ein ANDERES Fahrzeug zaehlt nicht", async ({ page }) => {
    /*
     * AKZEPTANZKRITERIUM 2, schaerfste Form. Nach dem Scan steht `?fz=` in der
     * URL: sie ist teilbar, sie bleibt im Verlauf stehen, und sie ist
     * Nutzereingabe. Gewaenne sie gegen das Kaertchen, genuegte ein alter
     * Verlaufseintrag, um den Check am falschen Fahrzeug zu fuehren — und der
     * URL sieht das niemand an.
     *
     * ⚠️ DER TEST BEWEIST KEINE BERECHTIGUNGSREGEL, und das ist Absicht: das
     * Ticket grenzt ausdruecklich ab („Fahrzeugfilterung ist nicht automatisch
     * eine neue Berechtigungsregel"). Eine selbst gebaute Anfrage an die
     * Abschluss-Action erreicht weiterhin jedes Fahrzeug — die Durchsetzung
     * dort ist die offene Betreiberfrage 5 und gehoert nicht in dieses Ticket.
     */
    await page.goto(lagerbuchUrl(`/t/${E2E_TOKEN_FAHRZEUG}`));
    await page.goto(lagerbuchUrl(`/helfer/check?fz=${E2E_FAHRZEUG_ANDERES_ID}`));

    await expect(page.getByText(alsText(E2E_FAHRZEUG_NAME))).toBeVisible();

    /*
     * ⚠️ SEIT DRK-373 STEHT DER NAME DES ANDEREN FAHRZEUGS AUF DEM SCHIRM — UND
     * GENAU DAS IST DIE VERBESSERUNG, NICHT IHR BRUCH.
     *
     * Hier stand `toHaveCount(0)` auf diesen Namen. Die ZUSAGE war nie „der
     * Name kommt nicht vor", sondern „der Check laeuft nicht auf diesem
     * Fahrzeug"; `toHaveCount(0)` war damals nur ihre einfachste Form, weil die
     * Seite den uebergangenen Parameter SCHWEIGEND verwarf. Genau dieses
     * Schweigen ist der offene Rest, den DRK-373 schliesst: die Person erfuhr
     * nicht, dass ihr `?fz=` nicht gegolten hat, und musste aus dem angezeigten
     * Namen selbst schliessen, dass das nicht das Fahrzeug ist, das sie
     * verlangt hat.
     *
     * ⚠️ DER TEST WIRD DABEI NICHT WEICHER, ER WIRD PRAEZISER: der Name darf
     * NUR im Hinweis stehen. Ein `toHaveCount(1)` allein liesse offen, WO —
     * stuende er in der Ueberschrift, waere genau der Fehler zurueck, gegen den
     * dieser Fall geschrieben ist. Deshalb zusaetzlich: der Hinweis enthaelt
     * ihn, und ausserhalb des Hinweises kommt er nicht vor.
     *
     * ⚠️ UND DER HINWEIS GILT AUCH HIER, obwohl nichts gescannt wurde. Aus
     * Serversicht ist ein getipptes `?fz=` von einem gescannten Ortsetikett
     * nicht zu unterscheiden (`_lib/ortZiel.ts`); derselbe Vorrang gilt, also
     * gehoert dieselbe Auskunft dazu (DRK-373, offene Frage 3).
     */
    const hinweis = page.locator("[data-rolle='scan-hinweis']");
    await expect(hinweis).toContainText(E2E_FAHRZEUG_ANDERES_NAME);
    await expect(page.getByText(alsText(E2E_FAHRZEUG_ANDERES_NAME))).toHaveCount(1);
  });

  test("ein UNGEBUNDENES Kaertchen waehlt weiterhin frei", async ({ page }) => {
    /*
     * DIE GEGENRICHTUNG. Ohne sie bewiese die Datei nur, dass die Seite
     * IRGENDWANN ein einzelnes Fahrzeug zeigt — sie unterschiede nicht zwischen
     * „gebunden" und „kaputt". Das allgemeine Helfer-Kaertchen und das
     * Regaletikett tragen `ziel_typ = null` und muessen weiter waehlen duerfen;
     * die uebergreifende Ansicht fuer GF und Lagerbuch-Nutzer ist ein eigener
     * Einstieg (DRK-305) und wird hier nicht nebenbei abgeschafft.
     */
    await page.goto(lagerbuchUrl(`/t/${E2E_TOKEN_HELFER}`));
    await page.goto(lagerbuchUrl(`/helfer/check?fz=${E2E_FAHRZEUG_ANDERES_ID}`));

    // Ein `?fz=` OHNE Bindung wirkt unveraendert als Vorauswahl.
    await expect(page.getByText(alsText(E2E_FAHRZEUG_ANDERES_NAME))).toBeVisible();
  });
});
