import { test, expect } from "@playwright/test";

/**
 * DIE AUFLOESUNG DES AUTO-MODUS, serverseitig.
 *
 * Der Server sieht `prefers-color-scheme` nicht — deshalb fuehrt die Suite den
 * zuletzt beobachteten OS-Wert in einem zweiten Cookie (`iuk-theme-system`)
 * und die Wahl in `iuk-theme-pref`. Ob beide richtig zusammenkommen, ist in
 * Vitest strukturell nicht pruefbar: dort gibt es weder einen Serverrender
 * noch eine echte Medienabfrage.
 *
 * `/login` ist bewusst gewaehlt: login-frei, auf jedem Host erreichbar und
 * ohne Seed-Abhaengigkeit.
 */
const PORTAL = "http://portal.localtest.me:3100";

test("Auto ohne Praeferenz: der Server liefert den Systemwert — ohne eine Zeile JavaScript", async ({
  browser,
}) => {
  const kontext = await browser.newContext({ colorScheme: "dark", javaScriptEnabled: false });
  try {
    // Kein `iuk-theme-pref` — genau der Zustand nach der Umstellung, in dem
    // jeder Bestandsnutzer landet.
    await kontext.addCookies([{ name: "iuk-theme-system", value: "dark", url: PORTAL }]);
    const seite = await kontext.newPage();
    await seite.goto(`${PORTAL}/login`);

    await expect(seite.locator("html")).toHaveAttribute("data-theme", "dark");
  } finally {
    await kontext.close();
  }
});

test("eine ausdrueckliche Wahl schlaegt das System — der Fall, fuer den es das Cookie gibt", async ({
  browser,
}) => {
  const kontext = await browser.newContext({ colorScheme: "dark", javaScriptEnabled: false });
  try {
    await kontext.addCookies([
      { name: "iuk-theme-system", value: "dark", url: PORTAL },
      { name: "iuk-theme-pref", value: "light", url: PORTAL },
    ]);
    const seite = await kontext.newPage();
    await seite.goto(`${PORTAL}/login`);

    await expect(seite.locator("html")).toHaveAttribute("data-theme", "light");
  } finally {
    await kontext.close();
  }
});

/**
 * Die andere Haelfte: WIE der Systemwert ueberhaupt ins Cookie kommt. Ohne
 * diesen Test steht der erste auf einem von Hand gesetzten Cookie und belegt
 * die Kette nie ganz.
 *
 * Der erste Aufruf rendert serverseitig hell — der Server kennt den OS-Wert
 * noch nicht. Das wird hier NICHT zugesichert: der Client zieht nach der
 * Hydration sofort nach, eine Zusicherung auf "hell" waere ein Rennen. Belegt
 * wird, dass der Wert danach im Cookie steht und der zweite Aufruf ihn traegt.
 */
test("erster Besuch: der Client legt den Systemwert ab, der zweite Aufruf traegt ihn", async ({
  browser,
}) => {
  const kontext = await browser.newContext({ colorScheme: "dark" });
  try {
    const seite = await kontext.newPage();
    await seite.goto(`${PORTAL}/login`);

    // Nach der Hydration steht der Modus richtig — auch schon beim ersten Mal.
    await expect(seite.locator("html")).toHaveAttribute("data-theme", "dark");

    const kekse = await kontext.cookies();
    expect(kekse.find((k) => k.name === "iuk-theme-system")?.value).toBe("dark");
    // Die Wahl selbst bleibt ungesetzt: Auto ist die Vorgabe, kein Zustand,
    // den man erst waehlen muss.
    expect(kekse.find((k) => k.name === "iuk-theme-pref")).toBeUndefined();

    await seite.reload();
    await expect(seite.locator("html")).toHaveAttribute("data-theme", "dark");
  } finally {
    await kontext.close();
  }
});

/**
 * Die Migration: der Altschluessel `iuk-theme` wird nicht mehr gelesen, und
 * nur das Inline-Script raeumt ihn ab (weder Server noch `AntdProvider` tun
 * das). Vitest prueft nur den ERZEUGTEN Skripttext von `themeInitScript()` —
 * ob ein echter Browser ihn vor dem ersten Paint auch tatsaechlich ausfuehrt
 * und `document.cookie` danach wirklich veraendert ist, sieht nur dieser
 * Test. Waere das Script schadhaft und schriebe die Loeschung nicht, wuerde
 * das hier trotzdem beobachtbar bleiben — anders als ein Test, der wie die
 * beiden oben auch den `matchMedia`-Effekt in `AntdProvider` schreiben liesse
 * (der schreibt nur das System-Cookie nach, nie den Altschluessel, aber ein
 * zu grobmaschiger Test koennte das verdecken).
 */
test("Migration: der Altschluessel iuk-theme wird beim ersten Laden abgeraeumt", async ({
  browser,
}) => {
  const kontext = await browser.newContext();
  try {
    // Genau der Zustand jeder Bestandsnutzerin/jedes Bestandsnutzers vor dem
    // Umstieg: der alte, kombinierte Cookie steht, die neuen beiden nicht.
    await kontext.addCookies([{ name: "iuk-theme", value: "dark", url: PORTAL }]);
    const seite = await kontext.newPage();
    await seite.goto(`${PORTAL}/login`);

    const kekse = await kontext.cookies();
    expect(kekse.find((k) => k.name === "iuk-theme")).toBeUndefined();
  } finally {
    await kontext.close();
  }
});
