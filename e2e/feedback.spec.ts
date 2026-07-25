import { test, expect, type Locator, type Page } from "@playwright/test";
import { devLogin } from "./fixtures";

/**
 * E2E DER OEFFENTLICHEN STRECKE `/f/**` (Plan Teil 2, Task 15) UND DES
 * ADMIN-ABLAUFS (Plan Teil 3, Task 23).
 *
 * ZWEI KERNZUSAGEN werden hier automatisiert belegt, je eine pro Strecke:
 *
 * 1. OEFFENTLICH (Entwurf 3.11): die Seite ist OHNE JavaScript vollstaendig
 *    bedienbar. `page.tsx` ist Server Component, `Zettel.tsx` wird serverseitig
 *    mitgerendert, und nach der Hydration wird die Oberflaeche NICHT
 *    ausgetauscht — dieselbe Bestandsaufnahme (acht Notenzeilen, 48 Chips, sechs
 *    Freitextzeilen, zwei Absende-Knoepfe) rendert in beiden Kontexten, und in
 *    beiden fuehrt Absenden zur Danke-Seite.
 *
 * 2. ADMIN (Entwurf 2.1/2.3, die Beanstandung des Auftraggebers): der
 *    Hauptablauf geht in ZWEI KLICKS — Gruppe oeffnen, „Feedback starten" — und
 *    danach stehen QR und Teilnahme-Link auf derselben Seite. Vorher waren es
 *    fuenf Klicks ueber drei Seiten, und danach gab es keinen Weg, die Umfrage
 *    zu verteilen. Der Beleg ist `Hauptablauf in zwei Klicks` unten: zwischen
 *    dem Einstieg und der sichtbaren Adresse liegen genau zwei `click()`.
 *
 * WAS HIER ERSETZT WURDE (§4.16): die Admin-Szenarien hingen an der alten
 * Oberflaeche — der geloeschten Umfragesteuerung („Umfrage erstellen"/
 * „Aktivieren"/„Schließen"/„Archivieren", samt der Abend-Detailseite, die sie
 * trug — heute nur noch ein Redirect auf die Auswertung),
 * dem Abend-Link der Gruppenliste und dem Einstiegsformular ohne Modal. Sie sind
 * auf die neue Oberflaeche umgestellt: „Feedback starten"/„Feedback jetzt
 * beenden" mit Popconfirm, Lagekarte statt Abend-Detailseite, „+ Neue Gruppe"
 * vor dem Formular. ZWEI HOOKS BLEIBEN UNVERAENDERT, weil andere Tests an ihnen
 * haengen: `data-testid="group-row"` samt `href="/m/feedback/groups/{id}"` am
 * selben Knoten (der IDOR-Test parst die ID daraus) und
 * `data-testid="module-title"` (Keystone-Test, `keystone.spec.ts`).
 */

const FEEDBACK = "http://feedback.localtest.me:3100";
// Aus dem Seed (`_lib/seed.ts`): zwei Gruppen, beide mit AKTIVER Umfrage aus den
// 14 STANDARD_QUESTIONS (acht `schulnote`, sechs `text`). "demo" ist der Zettel
// aller Formular-Szenarien; "jugend" wird fuer Zustand D geschlossen und
// deshalb bewusst NICHT von den anderen Tests benutzt.
const DEMO_TOKEN = "demo-demo1";
const JUGEND_TOKEN = "jugend-jgnd1";

const NOTENFRAGEN = 8;
const STUFEN = 6;
const FREITEXTE = 6;
/** Zwei austauschbare Absende-Knoepfe (Abschluss-Block und unter den Freitexten). */
const ABSENDEKNOEPFE = 2;

const ABSENDEN = "Rückmeldung absenden";

/**
 * DIE GRUPPENKARTE DES EINSTIEGS, an ihrem Namen erkannt.
 *
 * `data-testid="group-row"` und `href="/m/feedback/groups/{id}"` sitzen am selben
 * Knoten: dem `<Link>`, in den die komplette Karte gewickelt ist (§3.1/§4.16).
 * Deshalb `filter({ has: heading })` statt `.getByRole("link", …)` — ein Link IM
 * Hook-Knoten existiert nicht, und der barrierefreie Name des Hook-Knotens ist
 * der ganze Kartentext. Die Ueberschrift traegt den Gruppennamen exakt und
 * unterscheidet damit "Demo" von "Demo Jugend" (beide im Seed).
 */
function gruppenkarte(page: Page, name: string): Locator {
  return page
    .getByTestId("group-row")
    .filter({ has: page.getByRole("heading", { name, exact: true }) });
}

/**
 * Die Notenzeilen. Selektiert wird ueber `fieldset` + Radio und nicht ueber
 * Klassennamen: die kommen aus einem CSS-Modul und tragen einen Hash.
 */
function notenzeilen(page: Page): Locator {
  return page.locator('form fieldset:has(input[type="radio"])');
}

/** Der Chip einer Stufe in einer Zeile — die Radios selbst sind sr-only. */
function chip(zeile: Locator, stufe: number): Locator {
  return zeile.locator(`label[aria-label^="Note ${stufe} "]`);
}

/** Der `name` der Radiogruppe einer Zeile (= Frage-Id, ohne Seed-Annahme). */
async function frageId(zeile: Locator): Promise<string> {
  const name = await zeile.locator('input[type="radio"]').first().getAttribute("name");
  expect(name, "Notenzeile ohne name am Radio").toBeTruthy();
  return name as string;
}

/** Note `stufe` in den Zeilen `von`…`bis-1` antippen. */
async function notenSetzen(page: Page, stufe: number, von = 0, bis = NOTENFRAGEN): Promise<void> {
  const zeilen = notenzeilen(page);
  for (let i = von; i < bis; i++) await chip(zeilen.nth(i), stufe).click();
}

/**
 * Die Bestandsaufnahme des Bogens. Sie ist der Kern des Ohne-JavaScript-Belegs:
 * verglichen wird nicht "es rendert irgendwas", sondern dass beide Kontexte
 * dieselbe Oberflaeche zeigen.
 */
async function inventar(page: Page) {
  return {
    zeilen: await notenzeilen(page).count(),
    chips: await page.locator('form fieldset label[aria-label^="Note "]').count(),
    textfelder: await page.locator("form textarea").count(),
    absendeknoepfe: await page.locator("[data-absenden]").count(),
  };
}

const SOLL_INVENTAR = {
  zeilen: NOTENFRAGEN,
  chips: NOTENFRAGEN * STUFEN,
  textfelder: FREITEXTE,
  absendeknoepfe: ABSENDEKNOEPFE,
};

/**
 * Warten, bis die Client Component uebernommen hat: vor der Hydration tragen
 * beide Knoepfe das regulaere Absende-Label (der Weg ohne JavaScript), danach
 * den Lueckentext. Ohne dieses Warten wuerde ein Test, der "Rückmeldung
 * absenden" erwartet, auch dann gruen, wenn JavaScript gar nicht angekommen
 * ist — und der Unterschied zum Ohne-JavaScript-Test waere verloren.
 */
async function hydriert(page: Page): Promise<void> {
  await expect(page.locator("[data-absenden][data-offen]").first()).toHaveText(
    `Noch ${NOTENFRAGEN} Noten offen`,
  );
}

// ---------------------------------------------------------------------------
// HANDGRIFFE DES ADMIN-ABLAUFS
// ---------------------------------------------------------------------------

/** Anmeldung als Modul-Admin, Landung auf dem Einstieg („Deine Gruppen"). */
async function alsAdmin(page: Page): Promise<void> {
  await devLogin(page, {
    host: "feedback.localtest.me",
    groups: "da-feedback-admin",
    callbackPath: "/",
  });
}

/**
 * Die ID einer Gruppe, gelesen aus dem `href` IHRER KARTE — nie hart kodiert:
 * die Insert-Reihenfolge haengt an allen Testdateien dieses Laufs. Das `href`
 * sitzt am Hook-Knoten selbst (§4.16), nicht an einem Kind.
 */
async function gruppenId(page: Page, name: string): Promise<string> {
  const href = await gruppenkarte(page, name).getAttribute("href");
  const id = href?.match(/\/groups\/(\d+)$/)?.[1];
  expect(id, `Gruppen-Link ohne numerische ID: ${href}`).toBeTruthy();
  return id as string;
}

/**
 * EINE FRISCHE GRUPPE ueber „+ Neue Gruppe" (§4.16: „Gruppe anlegen" liegt jetzt
 * IM Modal — der Ablauf klickt erst die gestrichelte Karte, tippt dann in
 * dieselben Felder wie vorher).
 *
 * Jedes Admin-Szenario bekommt seine EIGENE Gruppe. Die beiden Seed-Gruppen
 * tragen die oeffentlichen Tests dieser Datei ueber ihre festen Token
 * (`demo-demo1`, `jugend-jgnd1`); ein neu erzeugtes Secret oder eine
 * nachgetragene Teilnehmerzahl dort waere eine Fernwirkung auf Tests, die davon
 * nichts wissen. Die Datenbank steht fuer den GANZEN Lauf (`workers: 1`,
 * `rm -rf ./.data/e2e` einmal beim Serverstart), die Slugs muessen deshalb je
 * Test verschieden sein.
 */
async function neueGruppe(page: Page, name: string, slug: string): Promise<void> {
  await page.getByRole("button", { name: "+ Neue Gruppe" }).click();
  const modal = page.getByRole("dialog");
  await modal.getByPlaceholder("Name", { exact: true }).fill(name);
  await modal.getByPlaceholder("slug", { exact: true }).fill(slug);
  await modal.getByRole("button", { name: "Gruppe anlegen" }).click();
  // Die Karte erscheint durch die Revalidierung der Action. Das Modal schliesst
  // sich dabei NICHT von selbst (es haelt seinen eigenen `open`-Zustand) und
  // liegt mit seiner Maske ueber den Karten — ohne Escape traefe der naechste
  // Klick die Maske und nicht die Gruppe.
  await expect(gruppenkarte(page, name)).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(modal).toBeHidden();
}

/** Gruppenkarte anklicken und auf dem Cockpit ankommen. */
async function cockpitOeffnen(page: Page, name: string): Promise<void> {
  await gruppenkarte(page, name).click();
  // Erst `waitForURL`: die Navigation laeuft clientseitig, ohne das Warten
  // stuende hier noch die Adresse des Einstiegs.
  await page.waitForURL(/\/groups\/\d+$/);
}

/**
 * Der Teilnahme-Token der Gruppe, gelesen aus dem QR-PFAD des Cockpits.
 *
 * Bewusst nicht aus der gedruckten Adresse (`[data-fb="teilnahme-url"]`): die
 * kommt aus `teilnahmeUrlAus(headers(), …)` und traegt einen Host, der nicht der
 * Ursprung des Tests sein muss. `/f/{token}/qr.png` ist relativ und kann den
 * Host nicht verlieren. Die gedruckte Adresse wird stattdessen BEHAUPTET (sie
 * muss den Slug enthalten) — sie ist Gegenstand der Zusage, nicht ihr Werkzeug.
 */
async function teilnahmeToken(page: Page): Promise<string> {
  const src = await page.locator('[data-fb="qr-kasten"] img').getAttribute("src");
  const token = src?.match(/^\/f\/([^/]+)\/qr\.png$/)?.[1];
  expect(token, `QR-Pfad ohne Token: ${src}`).toBeTruthy();
  return token as string;
}

/**
 * Der QR ist nicht nur im DOM, sondern GELADEN. `toBeVisible` allein waere hier
 * zu wenig: ein `<img>` mit gebrochener Quelle hat eine Kastengroesse und keine
 * Zusage — und dieses Bild wird an die Wand gehaengt.
 */
async function qrGeladen(bild: Locator): Promise<void> {
  await expect(bild).toBeVisible();
  await expect
    .poll(() => bild.evaluate((el) => (el as HTMLImageElement).naturalWidth))
    .toBeGreaterThan(0);
}

/** Eine vollstaendige Abgabe auf `/f/{token}` — in einem eigenen Tab, wie am Abend. */
async function abgabeAuf(page: Page, token: string, stufe: number): Promise<void> {
  const abgabe = await page.context().newPage();
  try {
    await abgabe.goto(`${FEEDBACK}/f/${token}`);
    await hydriert(abgabe);
    await notenSetzen(abgabe, stufe);
    await abgabe.locator("[data-absenden]").first().click();
    await abgabe.waitForURL(`${FEEDBACK}/f/${token}/thanks`);
  } finally {
    await abgabe.close();
  }
}

/**
 * „Feedback jetzt beenden" samt Bestaetigung. Der okText des Popconfirm
 * („Beenden") ist ein TEILWORT des Ausloesers — ohne `exact` traefe der zweite
 * Klick wieder den Knopf darunter.
 */
async function feedbackBeenden(page: Page): Promise<void> {
  await page.getByRole("button", { name: "Feedback jetzt beenden" }).click();
  await page.getByRole("button", { name: "Beenden", exact: true }).click();
}

test.describe("mobil (390×844)", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("vollständige Abgabe: acht Noten antippen, absenden, Danke-Seite", async ({ page }) => {
    await page.goto(`${FEEDBACK}/f/${DEMO_TOKEN}`);
    expect(await inventar(page)).toEqual(SOLL_INVENTAR);
    await hydriert(page);

    await notenSetzen(page, 2);
    // Die Fussnote am Zeilenende ist der dritte Kanal neben Ziffer und Farbe
    // (Entwurf 3.10) — sie belegt, dass die Wahl auch angekommen ist.
    await expect(notenzeilen(page).first().locator("[data-fussnote]")).toHaveText("2 · gut");

    // Ein Freitext genuegt; die sechs Zeilen sind freiwillig.
    await page.locator("form textarea").first().fill("Die praktischen Übungen waren super.");

    const knoepfe = page.locator("[data-absenden]");
    await expect(knoepfe).toHaveCount(ABSENDEKNOEPFE);
    await expect(knoepfe.first()).toHaveText(ABSENDEN);
    await knoepfe.first().click();

    await page.waitForURL(`${FEEDBACK}/f/${DEMO_TOKEN}/thanks`);
    await expect(page.getByRole("heading", { level: 1, name: "Danke." })).toBeVisible();
  });
});

test("unvollständige Abgabe: Knopf zeigt „Noch 3 Noten offen“, Tipp springt zur Lücke, sendet nicht", async ({
  page,
}) => {
  await page.goto(`${FEEDBACK}/f/${DEMO_TOKEN}`);
  await hydriert(page);

  await notenSetzen(page, 3, 0, 5);
  const knopf = page.locator("[data-absenden]").first();
  await expect(knopf).toHaveText("Noch 3 Noten offen");

  await knopf.click();

  // Der Tipp ist Navigation, keine Ruege: Fokus auf dem ERSTEN Feld der
  // Ziel-Zeile, genau eine Ansage im Live-Bereich — und nichts wurde gesendet.
  const luecke = notenzeilen(page).nth(5);
  await expect(luecke.locator('input[type="radio"]').first()).toBeFocused();
  await expect(page.locator("[data-ansage]")).toHaveText("Noch 3 Noten offen — Frage 6.");
  await expect(page).toHaveURL(`${FEEDBACK}/f/${DEMO_TOKEN}`);
  await expect(knopf).toHaveText("Noch 3 Noten offen");
});

test("Freitext wird an der Grenze von 500 Zeichen gestoppt", async ({ page }) => {
  await page.goto(`${FEEDBACK}/f/${DEMO_TOKEN}`);
  await hydriert(page);

  const zeile = page.locator("[data-textzeile]").first();
  const feld = zeile.locator("textarea");
  // 495 Zeichen: ueber der Zaehlerschwelle (420), noch unter der Grenze.
  await feld.fill("a".repeat(495));
  await expect(zeile.locator("[data-zaehler]")).toHaveText("noch 5 Zeichen");

  // ECHTE Tastendrucke: `fill` setzt den Wert programmatisch und `maxLength`
  // greift nur bei Nutzereingaben — mit `fill` wuerde der Test die Grenze
  // gar nicht pruefen, sondern nur den Zaehler.
  await feld.pressSequentially("bbbbbbbbbbbbbbbbbbbb");
  expect((await feld.inputValue()).length).toBe(500);
  await expect(zeile.locator("[data-zaehler]")).toHaveText("Zeile ist voll");
});

test("geschlossene Umfrage: Zustand D — zwischen zwei Abenden dagegen Zustand C", async ({
  page,
}) => {
  // Der Bogen wird ueber den Admin-Bereich geschlossen — bewusst die Gruppe
  // "Demo Jugend", damit der Zettel der anderen Szenarien ("demo") offen
  // bleibt. SEIT TEIL 3 (§4.16) geschieht das im Cockpit: es gibt keine
  // Abend-Detailseite mehr, auf die man erst navigieren muesste, und der Knopf
  // heisst „Feedback jetzt beenden" mit Popconfirm statt „Schließen".
  await alsAdmin(page);
  // Der Hook `group-row` sitzt seit Teil 3 auf dem `<Link>`, in den die ganze
  // Karte gewickelt ist (§3.1) — er IST also der Link, und ein Link DARIN gibt es
  // nicht mehr. Unterschieden wird ueber die Ueberschrift der Karte: der
  // barrierefreie Name des Links ist der komplette Kartentext (Zustandszeile,
  // Note …), ein `name: "Demo Jugend", exact: true` traefe damit nichts.
  await cockpitOeffnen(page, "Demo Jugend");
  // Die Gruppen-Seite ist der Ausgangspunkt fuer den zweiten Teil (unten) — die
  // ID steht nur hier, nicht hart im Test.
  const gruppenSeite = page.url();
  await feedbackBeenden(page);
  // Der Beleg fuer „geschlossen" ist der Zustandswechsel der Seite: die
  // Lagekarte laeuft nicht mehr, und der Abend ist mit seinen zwei Seed-
  // Rueckmeldungen zu „LETZTER ABEND" geworden (§2.7).
  await expect(page.getByText("LETZTER ABEND")).toBeVisible();
  await expect(page.getByRole("button", { name: "Feedback jetzt beenden" })).toHaveCount(0);

  await page.goto(`${FEEDBACK}/f/${JUGEND_TOKEN}`);
  await expect(
    page.getByRole("heading", { level: 1, name: "Die Umfrage zu diesem Abend ist beendet." }),
  ).toBeVisible();
  // Kein Formular mehr — und der Legendenstreifen ist entsaettigt (3.2 D).
  await expect(notenzeilen(page)).toHaveCount(0);
  await expect(page.locator("[data-absenden]")).toHaveCount(0);
  await expect(page.locator("[data-stumm]")).toBeVisible();

  /*
   * ZWISCHEN ZWEI ABENDEN — derselbe Token, dieselbe geschlossene Umfrage, aber
   * der naechste Dienstabend steht schon im Kalender und ist noch nicht
   * freigegeben. Dann ist "die Umfrage zu DIESEM Abend ist beendet" die falsche
   * Auskunft: der Abend, von dem der Scanner kommt, ist nicht der geschlossene.
   * Der Unterschied haengt an genau einer Stelle — `ohneAktiveUmfrage` waehlt den
   * JUENGSTEN Abend und findet dort keine Umfrage -> Zustand C statt D.
   */
  await page.goto(gruppenSeite);
  // Streng SPAETER als der Seed-Abend (heute, Mitternacht UTC): `ohneAktiveUmfrage`
  // vergleicht mit `>`, ein Abend von heute wuerde den geschlossenen nicht abloesen.
  //
  // SEIT TEIL 3 ist das der leise Textknopf „Abend ohne Feedback nachtragen" im
  // Verlauf (§2.5) und kein Formular mehr auf der Seite: der Ein-Klick-Start
  // legt Abend UND Umfrage an, hier soll aber ausdruecklich KEINE Umfrage
  // entstehen — sonst waere der naechste Abend wieder Zustand A/B und nicht C.
  const naechsterAbend = new Date(Date.now() + 7 * 86_400_000).toISOString().slice(0, 10);
  await page.getByRole("button", { name: "Abend ohne Feedback nachtragen" }).click();
  const nachtragen = page.locator('[data-testid="verlauf-nachtragen"]');
  await nachtragen.locator('input[name="date"]').fill(naechsterAbend);
  await nachtragen.locator('input[name="topic"]').fill("Kartenkunde");
  await nachtragen.getByRole("button", { name: "Abend eintragen" }).click();
  // Das Datum wird deutsch formatiert (`formatDatumLang`), ein ISO-Muster traefe
  // nicht mehr — das Thema ueberlebt jede Formatfrage. Beide Darstellungen des
  // Verlaufs liegen gleichzeitig im HTML (CSS schaltet bei 768px), deshalb die
  // breite Zone als Bezug und nicht die ganze Seite.
  await expect(page.locator(".fb-verlauf-breit").getByText("Kartenkunde")).toBeVisible();

  await page.goto(`${FEEDBACK}/f/${JUGEND_TOKEN}`);
  await expect(
    page.getByRole("heading", { level: 1, name: "Zurzeit läuft keine Umfrage." }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Die Umfrage zu diesem Abend ist beendet." }),
  ).toHaveCount(0);
  await expect(notenzeilen(page)).toHaveCount(0);
  // "Neu laden" ist ein `<a href>` und kein Knopf — wer gerade nichts sieht, hat
  // vielleicht auch kein JavaScript (Zustaende.tsx).
  await expect(page.getByRole("link", { name: "Neu laden" })).toBeVisible();
});

test("geteiltes Gerät: nach der Abgabe „Leeren Bogen öffnen“ → zweite Abgabe möglich", async ({
  page,
}) => {
  await page.goto(`${FEEDBACK}/f/${DEMO_TOKEN}`);
  await hydriert(page);
  await notenSetzen(page, 1);
  await page.locator("[data-absenden]").first().click();
  await page.waitForURL(`${FEEDBACK}/f/${DEMO_TOKEN}/thanks`);

  // Das Dedup-Cookie `feedback-{surveyId}` steht jetzt. Der Knopf loescht es
  // (nativer `<form action>`, kein Client-Wrapper) und fuehrt zurueck.
  await page.getByRole("button", { name: "Leeren Bogen öffnen" }).click();
  await page.waitForURL(`${FEEDBACK}/f/${DEMO_TOKEN}`);
  await expect(notenzeilen(page)).toHaveCount(NOTENFRAGEN);

  await hydriert(page);
  await notenSetzen(page, 4);
  await page.locator("[data-absenden]").first().click();
  // Der Beleg ist die zweite DANKE-Seite: ohne die Freigabe waere hier
  // Zustand E ("Von diesem Gerät ist schon eine Rückmeldung abgegeben.").
  await page.waitForURL(`${FEEDBACK}/f/${DEMO_TOKEN}/thanks`);
  await expect(page.getByRole("heading", { level: 1, name: "Danke." })).toBeVisible();
});

test("ohne JavaScript: dieselbe Oberfläche, Absenden funktioniert, `required` greift", async ({
  page,
  browser,
}) => {
  // Die Vergleichsgroesse zuerst: derselbe Bogen MIT JavaScript.
  await page.goto(`${FEEDBACK}/f/${DEMO_TOKEN}`);
  const mitJs = await inventar(page);
  expect(mitJs).toEqual(SOLL_INVENTAR);

  const ohneJsKontext = await browser.newContext({ javaScriptEnabled: false });
  try {
    const seite = await ohneJsKontext.newPage();
    await seite.goto(`${FEEDBACK}/f/${DEMO_TOKEN}`);

    // 1. Kein Austausch der Oberflaeche: identische Bestandsaufnahme.
    expect(await inventar(seite)).toEqual(mitJs);
    // 2. Das Formular ist ohne JavaScript abschickbar: `method="POST"` auf die
    //    eigene URL (`action=""`) plus die versteckten `$ACTION_*`-Felder, mit
    //    denen React die Server Action ansprechbar macht. Ein Client-Wrapper um
    //    die Action waere nicht serialisierbar — React DOM gaebe dem Formular
    //    dann `action="javascript:throw …"` und es gaebe keine `$ACTION`-Felder;
    //    ein Bruch, den weder Typecheck noch Build sehen.
    const formular = seite.locator("form");
    await expect(formular).toHaveAttribute("method", "POST");
    expect(await formular.getAttribute("action")).not.toContain("javascript:");
    expect(await seite.locator('form input[name^="$ACTION"]').count()).toBeGreaterThan(0);
    // 3. Beide Knoepfe sind regulaere Absende-Knoepfe (kein Lueckentext).
    await expect(seite.locator("[data-absenden]").first()).toHaveText(ABSENDEN);

    // 4. `required` greift bei einer Luecke: sieben Zeilen gesetzt, absenden
    //    bleibt auf der Seite, die achte Radiogruppe ist ungueltig.
    await notenSetzen(seite, 2, 0, NOTENFRAGEN - 1);
    await seite.locator("[data-absenden]").first().click();
    await expect(seite).toHaveURL(`${FEEDBACK}/f/${DEMO_TOKEN}`);
    const offen = await frageId(notenzeilen(seite).nth(NOTENFRAGEN - 1));
    expect(await seite.locator(`input[name="${offen}"]:invalid`).count()).toBe(STUFEN);

    // 5. Vollstaendig: die Abgabe geht durch — nativer POST, ohne eine Zeile
    //    JavaScript.
    await chip(notenzeilen(seite).nth(NOTENFRAGEN - 1), 2).click();
    await seite.locator("form textarea").first().fill("Ohne JavaScript getippt.");
    await seite.locator("[data-absenden]").first().click();
    await seite.waitForURL(`${FEEDBACK}/f/${DEMO_TOKEN}/thanks`);
    await expect(seite.getByRole("heading", { level: 1, name: "Danke." })).toBeVisible();
  } finally {
    await ohneJsKontext.close();
  }
});

test("Dunkelmodus: die Notenfelder tragen die Dunkel-Palette", async ({ page, context }) => {
  // Der Umschalter der Suite IST dieses Cookie (`core/theme/mode.ts`,
  // serverseitig gelesen) — er gilt auch ohne Login. Beide Richtungen werden
  // geprueft: eine Zusicherung nur fuer dunkel wuerde auch eine fest
  // eingebaute Dunkelfarbe durchlassen.
  await context.addCookies([{ name: "iuk-theme", value: "light", url: FEEDBACK }]);
  await page.goto(`${FEEDBACK}/f/${DEMO_TOKEN}`);
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  const gewaehlt = chip(notenzeilen(page).first(), 1);
  await gewaehlt.click();
  // NOTEN_HELL[0] = #2F7F59 (`_lib/noten.ts`).
  await expect(gewaehlt).toHaveCSS("background-color", "rgb(47, 127, 89)");

  await context.addCookies([{ name: "iuk-theme", value: "dark", url: FEEDBACK }]);
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  const dunkel = chip(notenzeilen(page).first(), 1);
  await dunkel.click();
  // NOTEN_DUNKEL[0] = #A1DBC0 — Luminanz umgekehrt, dieselbe Rangfolge.
  await expect(dunkel).toHaveCSS("background-color", "rgb(161, 219, 192)");
});

test("IDOR-Guard: groupleader ohne Zuordnung bekommt auf einer fremden Gruppen-Seite 404", async ({
  page,
}) => {
  // Demo-Gruppen-ID bewusst NICHT hart kodiert: als Admin einloggen, die ID
  // aus dem Listen-Link lesen (verlässlich, unabhängig von Insert-Reihenfolge
  // über mehrere Testdateien/-läufe hinweg), dann ausloggen.
  await alsAdmin(page);
  // Exakte Überschrift statt hasText:"Demo" — der Seed legt inzwischen auch
  // "Demo Jugend" an, dessen Name "Demo" als Teilstring enthält und sonst zwei
  // group-rows träfe (Playwright-Strict-Mode-Fehler). Das `href` steht am
  // Hook-Knoten selbst (§4.16), nicht an einem Kind.
  const groupId = await gruppenId(page, "Demo");

  await page.context().clearCookies();

  // "da-feedback-gl" reicht für den (ungegateten) Modul-Zugang, aber ohne
  // Zeile in user_groups bleibt memberGroupIdsFor leer — genau der Fall, den
  // assertGroupAccess/guardPage abfangen muss (die Alt-IDOR).
  await devLogin(page, { host: "feedback.localtest.me", groups: "da-feedback-gl" });
  const res = await page.goto(`${FEEDBACK}/groups/${groupId}`);
  expect(res?.status()).toBe(404);
});

// ---------------------------------------------------------------------------
// DER ADMIN-ABLAUF (Plan Teil 3, Task 23)
// ---------------------------------------------------------------------------

/**
 * DIE KERNZUSAGE DES UMBAUS, als Klickzahl gemessen.
 *
 * Zwischen dem Einstieg und der sichtbaren Teilnahme-Adresse liegen GENAU ZWEI
 * `click()`: die Gruppenkarte und „Feedback starten". Kein Datum tippen (das
 * Feld ist mit heute vorbelegt), keine Zwischenseite, kein zweiter Knopf
 * „Aktivieren". Der Zaehler ist der Test: kaeme ein dritter Klick dazu, muesste
 * hier eine Zeile stehen, und diese Zeile ist die Beanstandung.
 *
 * Die Gruppe wird VORHER angelegt — das ist Vorbereitung, nicht der Ablauf: im
 * Betrieb stehen die Gruppen schon da.
 */
test("Hauptablauf in zwei Klicks: Gruppe öffnen, „Feedback starten“ — danach sind QR und Link sichtbar", async ({
  page,
}) => {
  await alsAdmin(page);
  await neueGruppe(page, "E2E Zweiklick", "e2e-zweiklick");

  // KLICK 1 — die Karte IST der Link (§3.1).
  await cockpitOeffnen(page, "E2E Zweiklick");
  // Belegung A: eine Gruppe ohne jeden Dienstabend zeigt die Schrittzeile und
  // genau einen Primaerknopf.
  await expect(
    page.getByRole("heading", { name: "Ersten Dienstabend anlegen und Feedback starten" }),
  ).toBeVisible();

  // KLICK 2.
  await page.getByRole("button", { name: "Feedback starten", exact: true }).click();

  // Danach laeuft die Umfrage …
  await expect(page.getByRole("button", { name: "Feedback jetzt beenden" })).toBeVisible();
  await expect(
    page.getByText("Noch keine Rückmeldung — zeig den QR-Code am Ende des Abends."),
  ).toBeVisible();

  // … und der Weg, sie zu verteilen, steht auf DERSELBEN Seite. Das ist die
  // zweite Haelfte der Beanstandung: vorher gab es nach dem Start keinen.
  await qrGeladen(page.locator('[data-fb="qr-kasten"] img'));
  await expect(page.locator('[data-fb="teilnahme-url"]')).toContainText("/f/e2e-zweiklick-");
  await expect(page.getByRole("link", { name: "Aushang drucken" })).toBeVisible();
});

/**
 * ZWISCHENAUSWERTUNG OHNE SCHLIESSEN, dann das Beenden und der Weg in die
 * Auswertung — die zwei Zustandswechsel der Lagekarte am selben Abend.
 *
 * Beides in EINEM Test, weil das zweite ohne das erste nicht existiert:
 * „Auswertung ansehen" haengt an `letzterAbend`, und das setzt
 * `cockpitZustand` nur bei mindestens einer Rueckmeldung (§2.7). Ein
 * geschlossener Abend ohne Abgabe hat keinen Weg zur Auswertung — und soll ihn
 * nicht haben.
 */
test("Rücklauf erscheint im Cockpit, ohne dass jemand schließt — „Feedback jetzt beenden“ führt in die Auswertung", async ({
  page,
}) => {
  await alsAdmin(page);
  await neueGruppe(page, "E2E Rücklauf", "e2e-ruecklauf");
  await cockpitOeffnen(page, "E2E Rücklauf");

  // Die Teilnehmerzahl gleich im Startformular: sie ist der Nenner des Zaehlers
  // „1 von 4" und der Rücklaufquote.
  await page.locator('input[name="participantCount"]').fill("4");
  await page.getByRole("button", { name: "Feedback starten", exact: true }).click();
  await expect(page.getByRole("button", { name: "Feedback jetzt beenden" })).toBeVisible();

  const token = await teilnahmeToken(page);
  expect(token).toMatch(/^e2e-ruecklauf-/);
  await abgabeAuf(page, token, 2);

  // Der Rücklauf erscheint im Cockpit, OHNE dass jemand die Umfrage schliesst.
  // Angestossen ueber den Textknopf „Aktualisieren" und nicht ueber die
  // 30-Sekunden-Insel: eine Zusage, die auf einen Timer wartet, ist ein
  // Flackertest.
  await page.getByRole("button", { name: "Aktualisieren" }).click();
  await expect(page.getByText("25 % Rücklauf")).toBeVisible();
  await expect(page.getByText("ZWISCHENSTAND — NOCH NICHT ENDGÜLTIG")).toBeVisible();
  await expect(
    page.getByText("Erst 1 Rückmeldung — die Zahlen schwanken noch stark."),
  ).toBeVisible();
  // Sie laeuft weiter: der Zwischenstand kostet kein Schliessen.
  await expect(page.getByRole("button", { name: "Feedback jetzt beenden" })).toBeVisible();

  await feedbackBeenden(page);

  // Erst jetzt gibt es einen Weg in die Auswertung — „Auswertung ansehen" auf
  // der Karte „LETZTER ABEND" (§2.7).
  const auswertung = page.getByRole("link", { name: "Auswertung ansehen" });
  await expect(auswertung).toBeVisible();
  await auswertung.click();
  await expect(page.getByRole("heading", { level: 1, name: /^Auswertung — / })).toBeVisible();

  /*
   * §4.16: „Gesamt-Ø:" ist weg, die Note steht in der Notenplakette. Geprueft
   * wird ihr `aria-label` — und ZWINGEND in der Kennzahlenkarte: die acht
   * Notenspuren tragen „Durchschnitt" ebenfalls in ihrem `aria-label`
   * (`spurBeschriftung`), ein ungebundenes Muster traefe neun Knoten.
   *
   * Alle acht Noten wurden auf 2 getippt, der Durchschnitt ist also 2,0 — und
   * die Beschriftung sagt die Richtung der Skala mit („1 ist die beste Note").
   */
  const plakette = page.locator('[data-testid="kennzahlen"] [aria-label*="Durchschnitt"]');
  await expect(plakette).toHaveCount(1);
  await expect(plakette).toHaveAttribute(
    "aria-label",
    "Durchschnitt 2,0 von 6 — gut. 1 ist die beste Note, 6 die schlechteste.",
  );
});

/**
 * EINSTELLUNGEN: die zwei Handgriffe, die vor Teil 3 keine Oberflaeche hatten.
 *
 * „Teilnehmerzahl nachtragen" steht an der laufenden Karte, weil der laufende
 * Abend nicht im Verlauf liegt (§2.4) — ohne diesen Knopf waere der Nenner am
 * Abend selbst unerreichbar. „Zugang neu vergeben" liegt im eingeklappten
 * Panel und ist folgenschwer: es macht jeden gedruckten Aushang ungueltig,
 * also verlangt es eine Bestaetigung.
 */
test("Einstellungen: Teilnehmerzahl nachtragen, Zugang neu vergeben — nur nach Bestätigung", async ({
  page,
}) => {
  await alsAdmin(page);
  await neueGruppe(page, "E2E Einstellungen", "e2e-einstellungen");
  await cockpitOeffnen(page, "E2E Einstellungen");

  // OHNE Teilnehmerzahl starten — genau der Fall, fuer den es den Nachtrag gibt.
  await page.getByRole("button", { name: "Feedback starten", exact: true }).click();
  const nachtragen = page.getByRole("button", { name: "Teilnehmerzahl nachtragen" });
  await expect(nachtragen).toBeVisible();
  await nachtragen.click();
  const bearbeiten = page.locator('[data-testid="abend-bearbeiten"]');
  await bearbeiten.locator('input[name="participantCount"]').fill("12");
  await bearbeiten.getByRole("button", { name: "Speichern" }).click();
  // Der Knopf verschwindet, weil es nichts mehr nachzutragen gibt — der Nenner
  // steht. (Ein Zaehler „0 von 12" gibt es bewusst nicht: ohne Rueckmeldung
  // steht dort der Satz zum QR-Code, keine Zahl.)
  await expect(nachtragen).toHaveCount(0);
  await expect(bearbeiten).toHaveCount(0);

  // ZUGANG NEU VERGEBEN. Die Adresse vorher festhalten: sie ist der Beleg.
  const adresse = page.locator('[data-fb="teilnahme-url"]');
  const vorher = (await adresse.textContent()) ?? "";
  expect(vorher).toContain("/f/e2e-einstellungen-");

  // Der Kopf des `Collapse` ist ein Knopf, sein barrierefreier Name beginnt aber
  // mit dem Zustand des Pfeils („collapsed Einstellungen Name, Frist, …") —
  // deshalb ein Teilmuster und kein Anfangsanker.
  await page.getByRole("button", { name: /Einstellungen/ }).click();
  await page.getByRole("button", { name: "Neues Secret erzeugen" }).click();
  // Die Bestaetigung ist die Zusage: der Auslöser allein aendert nichts.
  await expect(page.getByText("Neues Secret erzeugen?")).toBeVisible();
  await expect(adresse).toHaveText(vorher);
  await page.getByRole("button", { name: "Secret neu erzeugen" }).click();

  await expect(adresse).not.toHaveText(vorher);
  await expect(adresse).toContainText("/f/e2e-einstellungen-");
  // Der QR zeigt auf den NEUEN Token — sonst haengt an der Wand ein Code, den
  // die Adresse darunter nicht mehr meint.
  const neuerToken = await teilnahmeToken(page);
  expect(vorher).not.toContain(neuerToken);
  await qrGeladen(page.locator('[data-fb="qr-kasten"] img'));
});

/**
 * DER AUSHANG DRUCKT (§2.4). Die Seite liegt in der Druck-Gruppe, traegt kein
 * Suite-Chrom und loest den Druckdialog selbst aus — aber erst, wenn der QR
 * geladen ist (`Drucken.tsx`), sonst kaeme ein leeres Blatt aus dem Drucker.
 */
test("Aushang: die Druckansicht rendert Frage, Gruppenname, QR und Adresse — und druckt erst mit Bild", async ({
  page,
}) => {
  // `window.print` VOR dem ersten Skript ersetzen: ein echter Druckdialog hielte
  // den Test an, und der Zaehler belegt zugleich, dass der Automatismus feuert.
  await page.addInitScript(() => {
    const w = window as unknown as { __gedruckt: number };
    w.__gedruckt = 0;
    window.print = () => {
      w.__gedruckt += 1;
    };
  });
  await alsAdmin(page);
  // Die Seed-Gruppe „Demo" wird hier nur GELESEN — der Aushang aendert nichts.
  const groupId = await gruppenId(page, "Demo");

  await page.goto(`${FEEDBACK}/aushang/${groupId}`);
  await expect(page.getByRole("heading", { level: 1, name: "Wie war der Dienstabend?" })).toBeVisible();
  await expect(page.locator(".fb-aushang-gruppe")).toHaveText("Demo");
  await qrGeladen(page.locator(".fb-aushang-qr img"));
  await expect(page.locator(".fb-aushang-url")).toContainText(`/f/${DEMO_TOKEN}`);
  await expect(page.locator(".fb-aushang-zeile")).toHaveText(
    "Anonym · 8 Noten, 6 freie Zeilen · etwa 2 Minuten",
  );
  // Traeger 2 von zwei fuer DRK-Rot auf diesem Blatt: das Wortzeichen.
  await expect(page.locator(".fb-aushang-wortzeichen")).toHaveText("DRK");
  await expect.poll(() => page.evaluate(() => (window as unknown as { __gedruckt: number }).__gedruckt))
    .toBeGreaterThan(0);
});

/**
 * DER GRUPPENLEITER SIEHT NUR SEINE GRUPPE — auch nicht per direkter URL.
 *
 * Anders als der IDOR-Test darueber ist dieser Nutzer ZUGEORDNET (der Seed legt
 * `dev:gl@localtest.me` auf „Demo Jugend"). Genau eine Gruppe heisst: der
 * Einstieg leitet direkt ins Cockpit (`einstiegZiel`), es gibt also gar keine
 * Liste, in der eine fremde Gruppe stehen koennte — und der Handgriff, sie
 * trotzdem zu erreichen, ist die getippte Adresse.
 */
test("Gruppenleiter: der Einstieg landet in der eigenen Gruppe, die fremde bleibt auch per URL verschlossen", async ({
  page,
}) => {
  await alsAdmin(page);
  const demoId = await gruppenId(page, "Demo");
  await page.context().clearCookies();

  await devLogin(page, {
    host: "feedback.localtest.me",
    email: "gl@localtest.me",
    groups: "da-feedback-gl",
    callbackPath: "/",
  });
  await page.waitForURL(/\/groups\/\d+$/);
  await expect(page.getByRole("heading", { level: 1, name: "Demo Jugend" })).toBeVisible();
  // Kein Weg zurueck in eine Liste, die es fuer diesen Nutzer nicht gibt (§4.1):
  // ohne diese Pruefung waere die Breadcrumb eine Schleife auf sich selbst.
  await expect(page.getByRole("link", { name: "Gruppen" })).toHaveCount(0);

  const res = await page.goto(`${FEEDBACK}/groups/${demoId}`);
  expect(res?.status()).toBe(404);
});

test.describe("mobil (390×844) — das Cockpit", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  /**
   * Auf 390px bleibt das Cockpit bedienbar: „Feedback starten" ist ohne
   * Querscrollen erreichbar und nimmt die volle Breite (`fb-block-mobil`), und
   * die Teilnahme-Zone rutscht unter die Lagekarte, statt zu verschwinden.
   */
  test("bleibt bedienbar, „Feedback starten“ ist erreichbar", async ({ page }) => {
    await alsAdmin(page);
    await neueGruppe(page, "E2E Mobil", "e2e-mobil");
    await cockpitOeffnen(page, "E2E Mobil");

    const knopf = page.getByRole("button", { name: "Feedback starten", exact: true });
    await expect(knopf).toBeVisible();
    const kasten = await knopf.boundingBox();
    // Volle Breite heisst hier: breiter als die Beschriftung ihn machen wuerde.
    expect(kasten!.width).toBeGreaterThan(300);
    // Eine Seite, die auf dem Handy seitlich scrollt, ist nicht bedienbar.
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);

    await knopf.click();
    await expect(page.getByRole("button", { name: "Feedback jetzt beenden" })).toBeVisible();
    await expect(page.locator('[data-fb="teilnahme-url"]')).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  });
});
