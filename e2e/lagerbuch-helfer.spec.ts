import { registerAuditFunctions } from "@/core/audit/context";
import { test, expect, type Page } from "@playwright/test";
import Database from "better-sqlite3";
import { devLogin } from "./fixtures";
import {
  E2E_FAHRZEUG_NAME,
  E2E_TOKEN_CHECK,
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
 * Tests hier benutzen ausschliesslich diesen Code, und er traegt `ziel_typ =
 * null` — er ist also UNGEBUNDEN. Genau deshalb erreicht die HELFER-Sitzung auch
 * das Check-Fahrzeug `E2E RTW` aus `E2E_TOKEN_CHECK`s eigenen Fixtures, ohne
 * dessen Code zu benutzen.
 *
 * ⚠️ SEIT DRK-302 IST DAS EINE VORBEDINGUNG, KEINE NEBENSACHE: ein Kaertchen MIT
 * Fahrzeugbindung sieht in `/helfer/check` nur noch sein eigenes Fahrzeug. Wer
 * `E2E_TOKEN_HELFER` im Seed ein `ziel_typ`/`ziel_id` gibt, macht die halbe
 * Datei rot — und zwar an Stellen, die nichts mit Bindung zu tun haben. Das
 * gebundene Kaertchen ist deshalb ein VIERTER Code
 * (`E2E_TOKEN_FAHRZEUG`, `e2e/lagerbuch-fahrzeug-kaertchen.spec.ts`).
 * `tokens.scope_lagerort_id` prueft weiterhin NICHTS — die Spalte ist tot, und
 * die Durchsetzung eines Scopes als RIEGEL bleibt die offene Betreiberfrage 5
 * (Ansatzpunkt 2, `_actions/check.ts`).
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
 * ⚠️ WAS DIESE DATEI AN DATEN HINTERLAESST — vollstaendig, weil ein Worker und
 * eine SQLite-Datei jede Spec danach erben:
 *   - `checks`: eine neue Zeile je Lauf des Abschluss-Tests (unten deklariert).
 *   - `tokens.last_used_at`: bei jeder Einloesung neu gesetzt; deshalb pruefen
 *     `lagerbuch-hosts.spec.ts` und diese Datei DIFFERENZIELL statt gegen NULL.
 *   - `lagerort_verfall`: eine Zeile je gemeldetem Verfall, per
 *     `onConflictDoUpdate`, OHNE Historie und OHNE Ruecknahme — der Seed fasst
 *     diese Tabelle nicht an. ⚠️ Der geschriebene Monat MUSS deshalb ausserhalb
 *     der Warnschwelle liegen (`2090-09`), sonst taucht der Artikel in
 *     `/verwaltung/verfall` auf und faerbt eine fremde Spec rot. Begruendung
 *     ausgeschrieben an der Fuellstelle.
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
  registerAuditFunctions(db);
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

/**
 * Der Bestand EINES Artikels AN EINEM Lagerort — DRK-300.
 *
 * ⚠️ NICHT die Zahl der Zeilen, sondern ihre SUMME: eine Umlagerung schreibt
 * zwei Zeilen, und „es sind zwei mehr geworden" wäre auch dann grün, wenn beide
 * im Handlager lägen. Gefragt ist, ob im FAHRZEUG etwas angekommen ist.
 */
function bestandAn(artikelId: string, lagerortId: string): number {
  const db = new Database(DB_PFAD, { readonly: true });
  try {
    const zeile = db
      .prepare(
        "select coalesce(sum(menge), 0) as n from buchungen where artikel_id = ? and lagerort_id = ?",
      )
      .get(artikelId, lagerortId) as { n: number };
    return zeile.n;
  } finally {
    db.close();
  }
}

/**
 * EIN ZIEL WÄHLEN — und dabei die ANTWORT prüfen, nicht nur die Landung.
 *
 * ⚠️ DIE ZWEITE TESTREGEL AUS FALLE 10 (`AGENTS.md`): ein e2e-Test, der eine
 * Anfrage auslöst, prüft ihre Antwort. Die Zeile darunter wäre sonst blind
 * gegen genau den Fall, für den es die Regel gibt — ein abgebrochener oder
 * abgelehnter POST meldet sich nicht als Fehler, sondern als Zeitüberschreitung
 * beim Warten auf eine Navigation, die nie angestoßen wurde. Die Meldung zeigte
 * dann auf `waitForURL` und nicht auf die Server Action, die nicht durchkam.
 *
 * Der POST geht an die Wahlseite selbst — dort steht das Formular, und eine
 * Server Action postet auf die URL ihrer eigenen Seite.
 */
async function waehleZiel(page: Page, name: RegExp): Promise<void> {
  // Eine Radiogruppe, ein Absendeknopf (`docs/design/README.md`: echte
  // Radiogruppen statt Knopfreihen). Der Greifer ist die ROLLE, nicht die
  // Bauform — er überlebt damit einen weiteren Umbau der Zeile.
  await page.getByRole("radio", { name }).check();
  const [antwort] = await Promise.all([
    page.waitForResponse((r) => r.request().method() === "POST" && r.url().includes("/helfer/ziel")),
    page.getByRole("button", { name: "Ziel übernehmen" }).click(),
  ]);
  expect(
    antwort.status(),
    `die Zielwahl muss serverseitig ankommen — Antwort war ${antwort.status()}`,
  ).toBeLessThan(400);
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

    /*
     * DRK-300 — OHNE ZIEL WIRD NICHT GEBUCHT. Der Knopf ist gesperrt, bis die
     * Wahl getroffen ist; „Kein Fahrzeug — Verbrauch" ist eine ausdrückliche
     * Wahl und kein Leerlassen. Diese drei Zeilen sind zugleich der einzige
     * Ort, an dem die GESPERRTE Form im echten Browser nachgewiesen wird —
     * jsdom rechnet keine Bedienbarkeit, und der Vitest-Fall prüft das
     * `disabled`-Attribut, nicht den Klick.
     */
    await expect(page.getByRole("button", { name: "Entnahme buchen" })).toBeDisabled();
    await page.locator("[data-rolle='entnahme-ziel'] a").click();
    await page.waitForURL(/\/helfer\/ziel/);
    await waehleZiel(page, /Kein Fahrzeug/);
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

  /**
   * DRK-300 — DIE ENTNAHME AUF EIN FAHRZEUG.
   *
   * ⚠️ NUR HIER IST SIE GANZ ZU SEHEN. Vitest prüft die Hälften einzeln: die
   * Action bucht zwei Legs, die Insel reicht das Ziel durch, die Seite löst das
   * Cookie auf. Dass ein COOKIE aus der Wahlseite den nächsten Seitenaufruf
   * überlebt und dort zu einer Umlagerung führt, kann nur ein echter Browser
   * zeigen — jsdom hat keinen Cookie-Speicher über Anfragen hinweg, und ein
   * Unit-Test hätte keine zweite Anfrage.
   */
  test("das gewählte Fahrzeug überlebt den nächsten Artikel und bucht dorthin", async ({ page }) => {
    const vorherFahrzeug = bestandAn("e2e-artikel", "e2e-fahrzeug");
    const vorherHandlager = bestandAn("e2e-artikel", "handlager");

    await page.goto(lagerbuchUrl("/"));
    await page.getByRole("textbox", { name: "Zugangs-Code" }).fill(E2E_TOKEN_HELFER);
    await page.getByRole("button", { name: "Weiter" }).click();
    await page.waitForURL(/\/helfer$/);

    await page.getByRole("link", { name: /E2E Verbandpäckchen/ }).click();
    await page.waitForURL(/\/a\/e2e-artikel/);
    await page.locator("[data-rolle='entnahme-ziel'] a").click();
    await page.waitForURL(/\/helfer\/ziel/);
    await waehleZiel(page, new RegExp(E2E_FAHRZEUG_NAME));
    await page.waitForURL(/\/a\/e2e-artikel/);

    // Die Wahl steht über dem Knopf — sonst lenkte sie still Bestand um.
    await expect(page.locator("[data-rolle='entnahme-ziel']")).toContainText(E2E_FAHRZEUG_NAME);

    await page.getByRole("button", { name: "Entnahme buchen" }).click();
    await expect(page.getByText(/gebucht/i)).toBeVisible();

    /*
     * ⚠️ DIE WAHL ÜBERLEBT DEN SEITENWECHSEL — das ist der Punkt, für den es
     * ein Cookie und keinen Suchparameter gibt. Ein frischer Aufruf derselben
     * Seite ist dafür der ehrlichste Nachweis: kein Zustand im Speicher, keine
     * URL, die die Antwort schon enthält.
     */
    await page.goto(lagerbuchUrl("/a/e2e-artikel"));
    await expect(page.locator("[data-rolle='entnahme-ziel']")).toContainText(E2E_FAHRZEUG_NAME);

    // NETTO NULL: was im Fahrzeug ankommt, fehlt im Handlager.
    const zugewachsen = bestandAn("e2e-artikel", "e2e-fahrzeug") - vorherFahrzeug;
    expect(zugewachsen, "im Fahrzeug muss Bestand angekommen sein").toBeGreaterThan(0);
    expect(bestandAn("e2e-artikel", "handlager")).toBe(vorherHandlager - zugewachsen);
  });

  /**
   * DIE WAHL GEHÖRT IHRER SCHICHT — Review-Befund P1 zu PR #140.
   *
   * ⚠️ NUR HIER IST DER FALL ECHT NACHSTELLBAR. Ein Unit-Test prüft, dass ein
   * fremdes Kärtchen den gemerkten Wert verwirft; ob das Cookie den
   * Sitzungswechsel im Browser ÜBERHAUPT überlebt — und damit, ob es die Frage
   * je gibt —, zeigt nur ein echter Wechsel im selben Kontext. Genau so steht
   * das Telefon im Gerätehaus: ein Gerät, wechselnde Kärtchen.
   *
   * Ohne die Bindung stünde nach dem zweiten Einlösen das Fahrzeug der ersten
   * Schicht über dem Knopf, und der wäre sofort bedienbar.
   */
  test("nach einem Kärtchenwechsel gilt die Wahl der vorigen Schicht nicht weiter", async ({ page }) => {
    await page.goto(lagerbuchUrl("/"));
    await page.getByRole("textbox", { name: "Zugangs-Code" }).fill(E2E_TOKEN_HELFER);
    await page.getByRole("button", { name: "Weiter" }).click();
    await page.waitForURL(/\/helfer$/);

    await page.goto(lagerbuchUrl("/a/e2e-artikel"));
    await page.locator("[data-rolle='entnahme-ziel'] a").click();
    await page.waitForURL(/\/helfer\/ziel/);
    await waehleZiel(page, new RegExp(E2E_FAHRZEUG_NAME));
    await page.waitForURL(/\/a\/e2e-artikel/);
    await expect(page.locator("[data-rolle='entnahme-ziel']")).toContainText(E2E_FAHRZEUG_NAME);

    // Schichtwechsel auf DEMSELBEN Gerät: anderes Kärtchen einlösen.
    await page.goto(lagerbuchUrl(`/t/${E2E_TOKEN_CHECK}`));
    await page.goto(lagerbuchUrl("/a/e2e-artikel"));

    const ziel = page.locator("[data-rolle='entnahme-ziel']");
    await expect(ziel).not.toContainText(E2E_FAHRZEUG_NAME);
    await expect(ziel).toContainText("Noch nichts gewählt");
    await expect(page.getByRole("button", { name: "Entnahme buchen" })).toBeDisabled();
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

    /*
     * Ziel wählen, SOLANGE das Kärtchen noch gilt — seit DRK-300 ist der
     * Buchen-Knopf ohne Ziel gesperrt, und eine Zielwahl nach dem Sperren käme
     * gar nicht mehr durch. Das entspricht auch dem Hergang, den dieser Test
     * beschreibt: die Sperre trifft jemanden MITTEN in der Arbeit.
     */
    await page.locator("[data-rolle='entnahme-ziel'] a").click();
    await page.waitForURL(/\/helfer\/ziel/);
    await waehleZiel(page, /Kein Fahrzeug/);
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

    /*
     * ⚠️ EIN FERNER MONAT, UND ZWAR MIT ABSICHT — nicht der naechstbeste.
     *
     * Dieses `fill` ist ein SCHREIBVORGANG in eine Tabelle, die der Seed gar
     * nicht anfasst: `_actions/check.ts` reicht den Wert an `setzeVerfall`
     * weiter, und `_lib/schreibpfade/lagerortVerfall.ts` schreibt ihn per
     * `onConflictDoUpdate` nach `lagerort_verfall` — OHNE Historie und OHNE
     * Ruecknahme. Playwright faehrt EINEN Worker gegen EINE SQLite-Datei; was
     * hier landet, bleibt fuer jede nachfolgende Spec liegen.
     *
     * Der frueher benutzte Wert `2026-09` lag innerhalb der Warnschwelle
     * (`LAGERBUCH_VERFALL_GELB_TAGE = 56`) und machte die Zeile in
     * `/verwaltung/verfall` WARNEND. Genau dagegen fuehrt
     * `e2e/seed-lagerbuch.ts` sein `E2E_VERFALL_FERN = "2090-01"` ein („dann
     * stuenden die Helfer- und Check-Artikel mit in der Verfallsliste … und eine
     * als ‚enthaelt' geschriebene Zusicherung bliebe dabei gruen, waehrend die
     * Liste sich still verdoppelt"). Dieser Test fuehrte den Zustand von der
     * anderen Seite wieder ein — heute latent, weil keine Spec
     * `/verwaltung/verfall` liest, und rot fuer die erste, die es tut, mit
     * Ursache in einer ANDEREN Datei.
     *
     * `2090-09` ist fern genug, um nie zu warnen, und VERSCHIEDEN von
     * `E2E_VERFALL_FERN` — der Wert muss sich vom Ausgangszustand unterscheiden,
     * sonst filtert `checkAbschluss` ihn als ungeaendert weg (siehe oben).
     * Die Zusicherung unten prueft den GESCHRIEBENEN WERT, nicht die
     * Warnwirkung.
     */
    await page.getByLabel(/^Verfall E2E Check Kompressen/).fill("2090-09");

    /*
     * SEIT DRK-304 MUSS HIER GEZAEHLT WERDEN. Die Position startet bei 0, und
     * „Weiter" bleibt gesperrt, solange sie niemand angefasst hat — eine 0, die
     * niemand gezaehlt hat, waere sonst eine unwiderrufliche Leerbuchung auf den
     * Fahrzeugbestand.
     *
     * Dreimal „+" bringt sie auf das Soll (3) und damit auf den Stand, den der
     * Test vor DRK-304 durch die Vorbelegung geschenkt bekam: keine Luecke,
     * keine Nachfuellung, dieselbe Zusicherung am Ende. `toBeEnabled()` steht
     * dazwischen, weil ein Klick auf einen gesperrten Knopf in Playwright nicht
     * scheitert, sondern in sein Zeitbudget laeuft und sich als etwas anderes
     * meldet (Falle 10, zweite Testregel).
     */
    const weiter = page.getByRole("button", { name: "Weiter" });
    await expect(weiter, "unberuehrte Positionen muessen „Weiter\" sperren").toBeDisabled();
    for (let i = 0; i < 3; i++) {
      await page.getByRole("button", { name: /^E2E Check Kompressen.*erhöhen$/ }).click();
    }
    await expect(weiter).toBeEnabled();

    await weiter.click(); // Zaehlen → Nachfuellen
    await page.getByRole("button", { name: "Weiter" }).click(); // Nachfuellen → Sauerstoff
    await page.getByRole("button", { name: "Abschließen" }).click();

    await expect(page.getByText("Check abgeschlossen")).toBeVisible();

    const nachher = letzterCheck("e2e-fahrzeug");
    expect(nachher, "der Abschluss muss eine Check-Zeile schreiben").toBeTruthy();
    expect(nachher!.id, "es muss eine NEUE Zeile sein, nicht die alte").not.toBe(vorher?.id);
    expect(nachher!.ergebnis, "der gemeldete Verfall muss im Ergebnis stehen").toContain("2090-09");
  });
});

test.describe("Task 2 (Typografie & Farbe, Teil A) — die Display-Familie im Helfer-Weg", () => {
  /**
   * DIE EINZIGE PRUEFUNG, DIE DEN URSPRUNGSFEHLER FAENGT. `helfer.module.css`
   * loeste `--lb-display` ueber Monate gegen ein nicht deklariertes
   * `--font-display` auf und fiel still auf "Arial Narrow" zurueck (Task 1
   * dieses Plans behebt die Deklaration in `globals.css`). Im Quelltext ist
   * ein fehlgeschlagener Font-Fallback von einer erfolgreichen Zuweisung NICHT
   * zu unterscheiden — beide sehen aus wie `font-family: var(--lb-display)`.
   * Nur ein echter Browser weiss, was am Ende dasteht.
   *
   * Gemessen wird die AUFGELOESTE VARIABLE und die tatsaechlich gerenderte
   * `fontFamily` — nicht `document.fonts`: ob die Schriftdatei geladen wurde,
   * ist eine andere (und flackernde) Frage; hier geht es nur darum, dass die
   * Kette der Variablen ueberhaupt traegt.
   *
   * KEIN `data-testid="helfer-marke"`: das gibt es im Markup nicht, und ein
   * neues einzufuehren waere eine Markup-Aenderung ausserhalb dieser Aufgabe.
   * Die Marke (`HelferRahmen.tsx:77`, Klasse `.marke`) ist stattdessen ueber
   * ihre CSS-Modul-Klasse erreichbar — gehasht, also ein Attribut-Teilselektor
   * statt `.marke` direkt (dieselbe Bauform wie `HelferRahmen.test.tsx:189`
   * fuer Vitest). `.first()` waehlt die AEUSSERE `div.marke`: der innere
   * `span.markeAkzent` matcht denselben Teilstring, steht im Dokument aber
   * NACH dem Div und erbt dessen `font-family` ohnehin per Kaskade.
   */
  test("der Helfer-Weg rendert die Display-Familie, nicht den Arial-Narrow-Fallback", async ({
    page,
  }) => {
    // Zustand selbst hergestellt (§12.3), nicht vom Seed geerbt: derselbe
    // Einstieg wie die uebrigen Tests dieser Datei, das aktive Token kommt aus
    // `beforeEach` oben — unabhaengig davon, was vorherige Dateien hinterlassen.
    await page.goto(lagerbuchUrl(`/t/${E2E_TOKEN_HELFER}`));
    await page.waitForURL(/\/helfer$/);

    const stapel = await page.evaluate(() =>
      getComputedStyle(document.documentElement).getPropertyValue("--font-display").trim(),
    );
    expect(stapel, "--font-display ist auf :root nicht aufgeloest").not.toBe("");
    expect(stapel).toContain("Barlow");

    // Und die Familie kommt auch an der Marke an, nicht nur an der Wurzel.
    const marke = page.locator('header [class*="marke"]').first();
    await expect(marke).toBeVisible();
    const gerendert = await marke.evaluate((el) => getComputedStyle(el).fontFamily);
    expect(gerendert, `Marke rendert in: ${gerendert}`).toContain("Barlow");
    /*
     * NICHT `.not.toContain("Arial Narrow")`: `getComputedStyle().fontFamily`
     * gibt den VOLLEN deklarierten Stapel zurueck, nicht die eine Schrift, die
     * am Ende gezeichnet wird — "Arial Narrow" steht dort mit Absicht als
     * Fallback-Eintrag (`globals.css`: `var(--font-barlow-condensed), "Arial
     * Narrow", sans-serif`) und bliebe auch im REPARIERTEN Zustand im String.
     * Die tragende Aussage ist die REIHENFOLGE: Barlow muss die ERSTE Familie
     * sein, sonst waere sie nur irgendwo im Fallback-Stapel gelandet, statt die
     * Kette angefuehrt zu haben — genau das war der Ursprungsfehler.
     */
    expect(
      gerendert.split(",")[0],
      `Barlow muss die erste Familie im Stapel sein, nicht nur enthalten: ${gerendert}`,
    ).toContain("Barlow");
  });
});
