import { test, expect } from "@playwright/test";
import Database from "better-sqlite3";
import { devLogin } from "./fixtures";
import {
  E2E_TOKEN_HELFER,
  LAGERBUCH_ADMIN_GRUPPE,
  LAGERBUCH_HOST,
  LAGERBUCH_PORT,
  lagerbuchUrl,
} from "./helpers/lagerbuch";

/**
 * DER HELFER-WEG (Spec §7.12.4, §12.2, §12.5, §3.8.3).
 *
 * Vier Zusagen, die strukturell in keinem anderen Gate sichtbar sind — deshalb
 * ist diese Datei kein Zusatz, sondern der einzige Nachweis (Task 171).
 *
 * ⚠️ TOKEN-HERKUNFT: `E2E_TOKEN_HELFER`, NIE `select ... limit 1`. Ruling A9
 * reserviert ihn namentlich fuer den echten Einloese-Lauf dieser Datei
 * (`lagerbuch-hosts.spec.ts:192-194` schreibt das ausdruecklich aus). Alle
 * Tests hier benutzen ausschliesslich diesen Code — `/helfer/check` prueft
 * `tokens.scope_lagerort_id` heute nicht (Ansatzpunkt 1, `helfer/check/page.tsx:64-71`),
 * die HELFER-Sitzung erreicht also auch das Check-Fahrzeug `E2E RTW` aus
 * `E2E_TOKEN_CHECK`s eigenen Fixtures, ohne dessen Code zu benutzen.
 *
 * ⚠️ SELEKTOREN SIND NACH DER SPEC BENANNT, NICHT ABGELESEN, UND WURDEN GEGEN
 * DAS GEBAUTE BAUTEIL GEPRUEFT: der Brief nennt „Mullbinde" und `spinbutton` —
 * der Seed fuehrt stattdessen „E2E Verbandpäckchen", und der Stepper ist ein
 * `<input type="text">` (aria-label = die Beschriftung), keine `spinbutton`-Rolle.
 * Was NICHT verhandelbar ist, sind die AUSSAGEN: 303, relatives `Location`,
 * kein `Domain=`, deutsche Sperrmeldung statt Absturz, genau ein `aria-current`.
 *
 * ⚠️ NUR EIN UNGUELTIGER CODE IM GANZEN LAUF (Falle 16, zweiter Test):
 * `LAGERBUCH_GATE_VERSUCHE_PRO_ABSENDER_PRO_MIN=5`, alle Tests teilen sich in
 * `workers:1` denselben Absender. Ein zweiter Fehlversuch-Test riskierte, die
 * eigene Zusicherung durch die eigene Vorbedingung („zu viele Fehlversuche")
 * zu ersetzen.
 *
 * ⚠️ JEDER TEST STELLT SEINEN ZUSTAND SELBST HER (§12.3): `beforeEach`
 * reaktiviert den Code VOR jedem Test, nicht nur ein `afterEach` danach — sonst
 * vererbt ein fehlgeschlagener Sperr-Test seinen Zustand an den naechsten
 * Test in der Datei.
 */

const DB_PFAD = "./.data/e2e/lagerbuch.db";

/** Frische, kurzlebige Verbindung je Aufruf (readonly) — dieselbe Bauform wie
 *  `lagerbuch-hosts.spec.ts:66-81`. */
function leseToken(code: string): { id: string; aktiv: number } {
  const db = new Database(DB_PFAD, { readonly: true });
  try {
    const zeile = db.prepare("select id, aktiv from tokens where code = ?").get(code) as
      | { id: string; aktiv: number }
      | undefined;
    expect(zeile, `der Seed muss ${code} fuehren`).toBeTruthy();
    return zeile!;
  } finally {
    db.close();
  }
}

function sperre(id: string, aktiv: boolean): void {
  const db = new Database(DB_PFAD);
  try {
    db.prepare("update tokens set aktiv = ? where id = ?").run(aktiv ? 1 : 0, id);
  } finally {
    db.close();
  }
}

function zaehleBuchungen(artikelId: string, quelleTyp: string, quelleId: string): number {
  const db = new Database(DB_PFAD, { readonly: true });
  try {
    const zeile = db
      .prepare(
        "select count(*) as n from buchungen where artikel_id = ? and quelle_typ = ? and quelle_id = ?",
      )
      .get(artikelId, quelleTyp, quelleId) as { n: number };
    return zeile.n;
  } finally {
    db.close();
  }
}

/** Der juengste Check-Datensatz eines Fahrzeugs, oder `undefined`, wenn es
 *  noch keinen gibt — Tiebreaker `id`, weil `completed_at` sekundengranular
 *  ist (§4.9). */
function letzterCheck(
  fahrzeugId: string,
): { id: string; ergebnis: string | null } | undefined {
  const db = new Database(DB_PFAD, { readonly: true });
  try {
    return db
      .prepare(
        "select id, ergebnis from checks where fahrzeug_id = ? order by completed_at desc, id desc limit 1",
      )
      .get(fahrzeugId) as { id: string; ergebnis: string | null } | undefined;
  } finally {
    db.close();
  }
}

test.beforeEach(() => {
  const t = leseToken(E2E_TOKEN_HELFER);
  if (!t.aktiv) sperre(t.id, true);
});

test.describe("Der Weg am Stueck", () => {
  /**
   * §12.2: „Der Helfer-Weg am Stueck … das Journal zeigt die TOKEN-PROVENIENZ
   * (Label statt Person, roher Code im title)." Cookie ueber drei Routen,
   * Rollen-Weiche im echten Request — in Vitest nicht darstellbar.
   *
   * DIFFERENZIELL, NICHT ABSOLUT (Lehre 4): die Zusicherung zaehlt die
   * Buchungen VOR und NACH, statt gegen den Seed-Zustand zu pruefen — der Seed
   * legt selbst schon eine `zugang`-Buchung fuer denselben Artikel an
   * (`quelleTyp: "system"`), ein absoluter Vergleich waere gegen den falschen
   * Zustand grün.
   */
  test("Gate → Helfer → Entnahme → Journal mit Token-Provenienz", async ({ page }) => {
    const vorher = zaehleBuchungen("e2e-artikel", "token", E2E_TOKEN_HELFER);

    await page.goto(lagerbuchUrl("/"));
    await page.getByRole("textbox", { name: "Zugangs-Code" }).fill(E2E_TOKEN_HELFER);
    await page.getByRole("button", { name: "Weiter" }).click();
    await page.waitForURL(/\/helfer$/);

    await page.getByRole("link", { name: /E2E Verbandpäckchen/ }).click();
    await page.waitForURL(/\/a\/e2e-artikel/);
    await page.getByRole("button", { name: "Entnahme buchen" }).click();
    await expect(page.getByText(/gebucht/i)).toBeVisible();

    const nachher = zaehleBuchungen("e2e-artikel", "token", E2E_TOKEN_HELFER);
    expect(nachher, "die Buchung muss im Journal ankommen").toBe(vorher + 1);

    // Das Journal zeigt LABEL statt Person (1:1-Pflicht 6, quelle.ts:34-47).
    const ctx = await page.context().browser()!.newContext();
    const admin = await ctx.newPage();
    await devLogin(admin, { host: LAGERBUCH_HOST, groups: LAGERBUCH_ADMIN_GRUPPE });
    await admin.goto(lagerbuchUrl("/verwaltung/journal"));

    const zeilen = admin
      .getByRole("row")
      .filter({ hasText: "E2E Verbandpäckchen" })
      .filter({ hasText: "E2E Helfer" });
    await expect(zeilen).toHaveCount(nachher);

    /**
     * DER ROHE CODE IM `title` (Ruling A15). Der vom Brief genannte Fundort
     * (`quelle.ts:20,23`) ist die „BEIDE KENNUNGSRAEUME"-Passage und traegt
     * diese Aussage NICHT — der richtige Fundort ist die eingefrorene
     * Alt-Anwendung, `lagerbuch/src/app/verwaltung/(admin)/journal/page.tsx:62`:
     * `<span className="chip chip-grau" ... title={j.quelleId}>{j.quelleName}</span>`.
     * Label als Text, roher Code im Tooltip — 1:1-Pflicht, beim Port verloren
     * (`journal/page.tsx:44-61` liess `quelleId` fallen, `_ui/Chip.tsx` nahm
     * kein `title`). `_db/quelle.ts:9-11`: die rohe Kennung bleibt in der
     * Datenbank nachweisfest, `title` ist die einzige Stelle in der
     * Oberflaeche, an der sie wieder sichtbar wird — ohne sie waere der
     * Pruefpfad nur noch in der Datenbank vorhanden (8-F: Codes bleiben fuer
     * immer belegt). KEIN `.first()`: die Zusicherung zaehlt ueber die
     * GESAMTE Zeilenmenge, nicht nur die oberste Zeile.
     */
    await expect(zeilen.locator(`[title="${E2E_TOKEN_HELFER}"]`)).toHaveCount(nachher);

    await ctx.close();
  });
});

test.describe("Falle 16 — /t/<code> setzt das Cookie auf DEMSELBEN Host", () => {
  /**
   * DIE ROUTE HAT HEUTE NULL E2E (Falle 32), und der Bruch ist in Vitest per
   * Konstruktion unsichtbar: `token-redeem.test.ts:3` mockt die Basis-URL auf
   * denselben Host wie der Testserver.
   *
   * `page.request` MIT `maxRedirects: 0`, NICHT `page.on("response")`: ein
   * Listener liefe race-behaftet gegen `page.goto`s eigenes Folgen der
   * Weiterleitung (Lehre aus der Review-Runde). `headersArray()` statt
   * `headers()` fuer `Set-Cookie` — Playwright faltet Mehrfachkopfzeilen in
   * `headers()` mit „, " zusammen, und genau daran wuerde eine
   * `Domain=`-Pruefung vorbeisehen.
   */
  test("antwortet 303 mit relativem Location und setzt das Cookie ohne Domain", async ({
    page,
  }) => {
    const antwort = await page.request.get(lagerbuchUrl(`/t/${E2E_TOKEN_HELFER}`), {
      maxRedirects: 0,
    });

    expect(antwort.status()).toBe(303);
    const location = antwort.headers()["location"];
    // RELATIV: der Browser loest es gegen den Host auf, den er tatsaechlich
    // aufgerufen hat. `new URL(ziel, req.url)` waere falsch — req.url traegt
    // nach dem Rewrite die INTERNE Adresse.
    //
    // ⚠️ GENAU EIN SCHRAEGSTRICH, deshalb `(?!\/)`. Ein blosses `/^\//` liesse
    // ein PROTOKOLL-RELATIVES `//fremder-host/pfad` durch — das ist keine
    // relative Adresse, sondern eine offene Weiterleitung, und die Zeile
    // darunter faengt es NICHT: `//fremder-host` beginnt nicht mit `http`.
    // Heute nicht erreichbar; die Zusicherung ist genau der Waechter, der das
    // BLEIBEN lassen soll. Dieselbe Form wie `_lib/returnTo.ts` sie prueft
    // („weist alles ab, was nicht mit genau EINEM Schraegstrich beginnt").
    expect(location).toMatch(/^\/(?!\/)/);
    expect(location).not.toMatch(/^https?:/);

    const setCookie = antwort
      .headersArray()
      .filter((h) => h.name.toLowerCase() === "set-cookie");
    const helferCookie = setCookie.find((h) => h.value.includes("helfer_session="));
    expect(helferCookie, "Set-Cookie muss helfer_session tragen").toBeTruthy();
    // OHNE Domain=: das Cookie ist host-only (§3.4).
    expect(helferCookie!.value.toLowerCase()).not.toContain("domain=");

    // Und die Landung passiert auf DEMSELBEN Host — Host UND Port, nicht nur
    // ein Teilstring, der auf jedem Port desselben Hostnamens gruen waere.
    await page.goto(lagerbuchUrl(`/t/${E2E_TOKEN_HELFER}`));
    expect(new URL(page.url()).host).toBe(`${LAGERBUCH_HOST}:${LAGERBUCH_PORT}`);
    await expect(page).toHaveURL(/\/(helfer|a\/)/);
  });

  /**
   * FALLE 60: ein ungueltiger Code landet mit einem GRUND am Gate, und das
   * Gate ZEIGT ihn — der VOLLE Satz aus `gateTexte.ts:67`, nicht nur ein
   * Teilstring, der auch im Fehlerzustand bestuende (Lehre 2).
   */
  test("leitet einen ungueltigen Code mit sichtbarem Grund ans Gate", async ({ page }) => {
    await page.goto(lagerbuchUrl("/t/000-000"));
    await expect(page).toHaveURL(/\?grund=code/);
    await expect(page.locator('[data-rolle="gate-fehler"]')).toHaveText(
      "Dieser Code ist unbekannt oder wurde gesperrt. Wende dich an die Leitung.",
    );
  });
});

test.describe("Ein gesperrter Code — deutsche Meldung statt Absturz", () => {
  /**
   * ERSETZT `lagerbuch/e2e/helfer-flow.spec.ts:56`.
   *
   *   ALTE FASSUNG: `await expect(page.getByText(/server-side exception/))
   *                  .toBeVisible()` — der ABSTURZ ist dort die erwartete
   *                  Ausgabe, und dieselbe Datei schreibt das selbst hin. Die
   *                  Helferin sieht eine englische Fehlerseite.
   *   NEUE FASSUNG: kein Erfolgs-Chip, sondern die deutsche Sperrmeldung aus
   *                  `_lib/actionTypen.ts:72` (§11.5, Zustand 7).
   *
   * Die serverseitige Haelfte liegt in `_lib/helferZugang.test.ts` und bleibt.
   */
  test("weist eine schreibende Aktion mit deutschem Text ab", async ({ page }) => {
    const t = leseToken(E2E_TOKEN_HELFER);

    await page.goto(lagerbuchUrl(`/t/${E2E_TOKEN_HELFER}`));
    await page.waitForURL(/\/helfer$/);
    await page.getByRole("link", { name: /E2E Verbandpäckchen/ }).click();
    await page.waitForURL(/\/a\/e2e-artikel/);

    // Mitten in der Schicht gesperrt.
    sperre(t.id, false);

    await page.getByRole("button", { name: "Entnahme buchen" }).click();

    await expect(page.getByText(/server-side exception/i)).toHaveCount(0);
    await expect(
      page.getByText("Dieses Kärtchen wurde gesperrt. Die Buchung wurde nicht gespeichert."),
    ).toBeVisible();

    sperre(t.id, true); // Zustand zuruecksetzen — workers:1, eine DB.
  });

  /**
   * §3.8.3: ein gesperrter Code blockt auch den LESEPFAD. Die Umleitung laeuft
   * ueber `/abmelden` — eine Server Component darf kein Cookie loeschen, und
   * ohne den Handler bliebe ein totes Cookie stehen.
   *
   * DIE KETTE WIRD HOP FUER HOP GEPRUEFT (`maxRedirects: 0` an jeder Stufe),
   * nicht nur die Endadresse: sonst bliebe eine ungeloeschte Cookie-Zeile
   * gruen, und der `page.on("response")`-Mitschnitt des Briefs waere
   * race-behaftet gegenueber `page.goto`s eigenem Redirect-Folgen.
   */
  test("schickt einen gesperrten Zugang ueber /abmelden ans Gate", async ({ page }) => {
    const t = leseToken(E2E_TOKEN_HELFER);

    // TEIL 1 — DIE KOPFZEILEN, HOP FUER HOP. `page.request` teilt sich den
    // Cookie-Speicher mit `page`: der zweite Hop raeumt das Cookie WIRKLICH,
    // das ist die gepruefte Wirkung von /abmelden und keine Nebenwirkung, die
    // man vermeiden muesste — deshalb bekommt Teil 2 unten eine FRISCHE
    // Sitzung, statt auf dieser aufzusetzen.
    await page.goto(lagerbuchUrl(`/t/${E2E_TOKEN_HELFER}`));
    await page.waitForURL(/\/helfer$/);
    sperre(t.id, false);

    const ersterHop = await page.request.get(lagerbuchUrl("/helfer"), { maxRedirects: 0 });
    expect(ersterHop.status(), "muss umleiten").toBeGreaterThanOrEqual(300);
    expect(ersterHop.status()).toBeLessThan(400);
    const zuAbmelden = ersterHop.headers()["location"]!;
    expect(zuAbmelden).toMatch(/^\/abmelden\?grund=gesperrt/);

    const zweiterHop = await page.request.get(lagerbuchUrl(zuAbmelden), { maxRedirects: 0 });
    expect(zweiterHop.status()).toBe(303);
    expect(zweiterHop.headers()["location"]).toBe("/?grund=gesperrt");
    const setCookie = zweiterHop
      .headersArray()
      .filter((h) => h.name.toLowerCase() === "set-cookie")
      .find((h) => h.value.includes("helfer_session="));
    expect(setCookie, "/abmelden muss das Cookie raeumen").toBeTruthy();
    expect(setCookie!.value).toContain("Max-Age=0");
    expect(setCookie!.value.toLowerCase()).not.toContain("domain=");

    sperre(t.id, true);

    // TEIL 2 — DIE SICHTBARE LANDUNG, mit einer neu eingeloesten Sitzung: Teil
    // 1 hat das Cookie im Browser-Kontext bereits geraeumt.
    await page.goto(lagerbuchUrl(`/t/${E2E_TOKEN_HELFER}`));
    await page.waitForURL(/\/helfer$/);
    sperre(t.id, false);

    await page.goto(lagerbuchUrl("/helfer"));
    await expect(page).toHaveURL(/\/\?grund=gesperrt$/);
    await expect(page.locator('[data-rolle="gate-fehler"]')).toHaveText(
      "Dieser Zugangs-Code wurde gesperrt. Wende dich an die Leitung.",
    );

    // Ein zweiter Aufruf landet OHNE Umweg am Gate: das Cookie ist jetzt weg,
    // es gibt nichts mehr zu raeumen.
    await page.goto(lagerbuchUrl("/helfer"));
    expect(new URL(page.url()).pathname).toBe("/");
    expect(new URL(page.url()).search).toBe("");

    sperre(t.id, true);
  });
});

test.describe("Falle 63 — aria-current an drei Einstiegen", () => {
  /**
   * VITEST IST HIER STRUKTURELL BLIND: `core/shell/SuiteNav.test.tsx:48` mockt
   * `usePathname`, und der Test sagt das ueber sich selbst. Im Modul kommt
   * `usePathname` gar nicht vor (§7.8.2) — die Aktivmarkierung ist ein
   * SERVER-Prop (`_ui/HelferRahmen.tsx:128-145`).
   */
  const EINSTIEGE = [
    { pfad: "/helfer", tab: "Entnahme" },
    { pfad: "/helfer/check", tab: "Fahrzeug-Check" },
  ];

  for (const e of EINSTIEGE) {
    test(`${e.pfad} markiert den richtigen Tab`, async ({ page }) => {
      await page.goto(lagerbuchUrl(`/t/${E2E_TOKEN_HELFER}`));
      await page.goto(lagerbuchUrl(e.pfad));

      const aktiv = page.locator('[aria-current="page"]');
      await expect(aktiv).toHaveCount(1);
      await expect(aktiv).toHaveText(e.tab);
    });
  }

  /**
   * Der dritte Einstieg: ueber den Deep-Link, nicht ueber die Tab-Leiste. Der
   * Klick aus der Artikelliste liefert die ECHTE Artikel-ID — kein `limit 1`
   * gegen die Datenbank fuer eine ID, die der Test gar nicht braucht.
   */
  test("/a/<id> markiert die Entnahme", async ({ page }) => {
    await page.goto(lagerbuchUrl(`/t/${E2E_TOKEN_HELFER}`));
    await page.waitForURL(/\/helfer$/);
    await page.getByRole("link", { name: /E2E Verbandpäckchen/ }).click();
    await page.waitForURL(/\/a\//);

    const aktiv = page.locator('[aria-current="page"]');
    await expect(aktiv).toHaveCount(1);
    await expect(aktiv).toHaveText("Entnahme");
  });

  /**
   * DIE GEGENRICHTUNG (Vorbild `e2e/shell-mobil.spec.ts:288-324`): ohne sie
   * bewiese der Test nur, dass IRGENDWO ein `aria-current` steht. Das Gate
   * traegt `OeffentlicherRahmen` (`_ui/OeffentlicherRahmen.tsx:24-31`) — kein
   * Kopf, keine Tab-Leiste, also strukturell kein `nav`.
   */
  test("markiert auf dem Gate gar nichts", async ({ page }) => {
    await page.goto(lagerbuchUrl("/"));
    await expect(page.locator('[aria-current="page"]')).toHaveCount(0);
  });
});

test.describe("§12.1 Punkt 1 — der gemeldete Verfall ueberlebt bis in die Datenbank", () => {
  /**
   * Die dritte Ebene der Aussage aus §12.1, Punkt 1. Die Unit-Haelfte besitzt
   * `_lib/checkNutzlast.ts` (Teil 3), die DOM-Haelfte `_ui/CheckFlow.test.tsx`
   * (Teil 4). Hier zaehlt nur: der im Zaehlschritt gemeldete Verfall steht
   * danach in `checks.ergebnis`.
   *
   * `E2E RTW` (`e2e-fahrzeug`, Fixtures von `E2E_TOKEN_CHECK`) traegt Soll UND
   * eine Sauerstoffflasche, aber KEIN Geraet — der Weg zum letzten Schritt
   * fuehrt ueber Zaehlen → Nachfuellen → Sauerstoff, „Abschließen" erscheint
   * erst dort (`_ui/CheckFlow.tsx:79,167-171`).
   *
   * NEUE ZEILE, NICHT NUR DER INHALT (Lehre 4): `checkAbschluss` filtert
   * `verfaelle` auf GEAENDERTE Werte (`CheckFlow.tsx:195-199`) — ein
   * wiederholter Lauf ohne Reseed saehe eine leere Differenz und ein
   * `toContain` allein bliebe TROTZDEM gruen, weil `verfallErgebnis` den
   * Lagerort-Zustand NACH dem Schreiben frisch liest (`check.ts:298-300`), auch
   * wenn dieser Lauf selbst nichts geaendert hat. Der Vergleich der Check-ID
   * gegen den Stand VOR dem Lauf macht daraus trotzdem eine Aussage ueber
   * DIESEN Lauf, nicht ueber den Datenbestand.
   */
  test("ein im Check gemeldeter Verfall steht danach in checks.ergebnis", async ({ page }) => {
    const vorher = letzterCheck("e2e-fahrzeug");

    await page.goto(lagerbuchUrl(`/t/${E2E_TOKEN_HELFER}`));
    await page.goto(lagerbuchUrl("/helfer/check"));
    await page.getByRole("link", { name: /^E2E RTW/ }).click();
    await page.waitForURL(/\/helfer\/check\?fz=/);

    await page
      .getByLabel(/^Verfall E2E Check Kompressen/)
      .fill("2026-09");
    await page.getByRole("button", { name: "Weiter" }).click(); // Zaehlen → Nachfuellen
    await page.getByRole("button", { name: "Weiter" }).click(); // Nachfuellen → Sauerstoff
    await page.getByRole("button", { name: "Abschließen" }).click();

    await expect(page.getByText("Check abgeschlossen")).toBeVisible();

    const nachher = letzterCheck("e2e-fahrzeug");
    expect(nachher, "der Abschluss muss eine Check-Zeile schreiben").toBeTruthy();
    expect(nachher!.id, "es muss eine NEUE Zeile sein, nicht die alte").not.toBe(vorher?.id);
    expect(nachher!.ergebnis).toContain("2026-09");
  });
});
