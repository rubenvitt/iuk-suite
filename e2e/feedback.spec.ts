import { test, expect, type Locator, type Page } from "@playwright/test";
import { devLogin } from "./fixtures";

/**
 * E2E DER OEFFENTLICHEN STRECKE `/f/**` (Plan Teil 2, Task 15).
 *
 * WAS HIER ERSETZT WURDE: die alte Fassung dieser Datei kodierte die
 * Sterne-Oberflaeche (`[role="radio"][aria-setsize="6"]` — rc-rate, existiert
 * nicht mehr) und den Admin-Ablauf draft -> active. Beides ist Vergangenheit;
 * die Admin-Szenarien kommen in Teil 3 (Task 23) neu in diese Datei zurueck.
 * Der IDOR-Guard unten bleibt: er haengt an keiner der beiden abgeloesten
 * Oberflaechen und waere sonst bis Teil 3 ungedeckt.
 *
 * DIE KERNZUSAGE, die hier automatisiert belegt wird (Entwurf 3.11): die Seite
 * ist OHNE JavaScript vollstaendig bedienbar. `page.tsx` ist Server Component,
 * `Zettel.tsx` wird serverseitig mitgerendert, und nach der Hydration wird die
 * Oberflaeche NICHT ausgetauscht — dieselbe Bestandsaufnahme (acht Notenzeilen,
 * 48 Chips, sechs Freitextzeilen, zwei Absende-Knoepfe) rendert in beiden
 * Kontexten, und in beiden fuehrt Absenden zur Danke-Seite.
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
  // bleibt. KOPPLUNG: Teil 3 benennt diesen Knopf in „Feedback jetzt beenden"
  // um, dann aendert sich hier eine Zeile.
  await devLogin(page, {
    host: "feedback.localtest.me",
    groups: "da-feedback-admin",
    callbackPath: "/",
  });
  // Der Hook `group-row` sitzt seit Teil 3 auf dem `<Link>`, in den die ganze
  // Karte gewickelt ist (§3.1) — er IST also der Link, und ein Link DARIN gibt es
  // nicht mehr. Unterschieden wird ueber die Ueberschrift der Karte: der
  // barrierefreie Name des Links ist der komplette Kartentext (Zustandszeile,
  // Note …), ein `name: "Demo Jugend", exact: true` traefe damit nichts.
  await gruppenkarte(page, "Demo Jugend").click();
  // Die Gruppen-Seite ist der Ausgangspunkt fuer den zweiten Teil (unten) — die
  // ID steht nur hier, nicht hart im Test. Erst `waitForURL`, dann `page.url()`:
  // die Navigation laeuft clientseitig, ohne das Warten stuende hier noch die
  // Adresse der Gruppenliste.
  await page.waitForURL(/\/groups\/\d+$/);
  const gruppenSeite = page.url();
  await page.getByRole("link", { name: /Erlebnispädagogischer Abend/ }).click();
  await page.getByRole("button", { name: "Schließen" }).click();
  await expect(page.getByText("Geschlossen", { exact: true })).toBeVisible();

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
  const naechsterAbend = new Date(Date.now() + 7 * 86_400_000).toISOString().slice(0, 10);
  await page.locator('form input[name="date"]').fill(naechsterAbend);
  await page.locator('form input[name="topic"]').fill("Kartenkunde");
  await page.getByRole("button", { name: "Dienstabend anlegen" }).click();
  await expect(page.getByRole("link", { name: new RegExp(naechsterAbend) })).toBeVisible();

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
  await devLogin(page, { host: "feedback.localtest.me", groups: "da-feedback-admin", callbackPath: "/" });
  // Exakte Überschrift statt hasText:"Demo" — der Seed legt inzwischen auch
  // "Demo Jugend" an, dessen Name "Demo" als Teilstring enthält und sonst zwei
  // group-rows träfe (Playwright-Strict-Mode-Fehler). Das `href` steht am
  // Hook-Knoten selbst (§4.16), nicht an einem Kind.
  const href = await gruppenkarte(page, "Demo").getAttribute("href");
  const groupId = href?.match(/\/groups\/(\d+)$/)?.[1];
  expect(groupId, `Demo-Gruppen-Link ohne numerische ID: ${href}`).toBeTruthy();

  await page.context().clearCookies();

  // "da-feedback-gl" reicht für den (ungegateten) Modul-Zugang, aber ohne
  // Zeile in user_groups bleibt memberGroupIdsFor leer — genau der Fall, den
  // assertGroupAccess/guardPage abfangen muss (die Alt-IDOR).
  await devLogin(page, { host: "feedback.localtest.me", groups: "da-feedback-gl" });
  const res = await page.goto(`${FEEDBACK}/groups/${groupId}`);
  expect(res?.status()).toBe(404);
});
