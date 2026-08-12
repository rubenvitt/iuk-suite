import { test, expect, type Page } from "@playwright/test";

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

/**
 * DAS HYDRATIONS-GATE fuer die beiden Live-Wechsel-Tests weiter unten.
 *
 * `page.goto()` wartet auf `load`, nicht auf abgeschlossene Hydration. Und
 * `data-theme` selbst taugt nicht als Signal dafuer: der Server liefert es
 * schon im SSR-Markup korrekt (siehe der erste Test oben, der das sogar mit
 * `javaScriptEnabled: false` beweist). Ohne ein echtes Gate liefe
 * `emulateMedia` ein Rennen gegen den Mount: landet der Wechsel VOR der
 * Hydration, liest `AntdProvider` den neuen Systemwert schon bei seinem
 * ERSTEN `matchMedia(...).matches`-Read waehrend des Mount-Effekts — der Test
 * wuerde gruen, ohne dass je ein `change`-Ereignis den Weg gefunden haette.
 * Ein Provider mit vollstaendig kaputtem `addEventListener("change", …)`
 * bestuende ihn dann trotzdem.
 *
 * Deshalb kapert dieses Skript `window.matchMedia` per `addInitScript` —
 * das laeuft VOR jedem Seitenskript, auch vor dem Inline-Script im `<head>`
 * und vor jeder React-Hydration — und beobachtet, wann
 * `addEventListener("change", …)` auf der `(prefers-color-scheme: dark)`-Liste
 * aufgerufen wird. Das Inline-Script liest dort nur `.matches` und
 * registriert nie einen Listener; NUR der `useEffect` in `AntdProvider` tut
 * das, und der laeuft erst nach dem Commit — fuer server-gerenderte
 * Komponenten wie diese also erst nach abgeschlossener Hydration. Der
 * Zeitpunkt dieses Aufrufs ist damit ein Signal, das ausschliesslich der
 * hydrierte Client erzeugen kann, und zugleich exakt der Mechanismus, den die
 * Tests unten pruefen wollen.
 *
 * Zwei getrennte Funktionen, weil sie an verschiedenen Stellen im Testablauf
 * gehoeren: `installieren` MUSS vor `goto()` laufen (sonst existiert die
 * Kaperung nicht mehr rechtzeitig fuer den ersten Seitenaufbau), `abwarten`
 * MUSS danach laufen (vorher gibt es noch kein `window` der Zielseite, gegen
 * das gewartet werden koennte).
 */
async function matchMediaLauscherInstallieren(seite: Page): Promise<void> {
  await seite.addInitScript(() => {
    (window as unknown as { __mqLauscherAktiv: boolean }).__mqLauscherAktiv = false;
    const echtesMatchMedia = window.matchMedia.bind(window);
    window.matchMedia = (query: string) => {
      const liste = echtesMatchMedia(query);
      if (query === "(prefers-color-scheme: dark)") {
        const echtesAddEventListener = liste.addEventListener.bind(liste);
        liste.addEventListener = ((type: string, ...rest: unknown[]) => {
          if (type === "change") {
            (window as unknown as { __mqLauscherAktiv: boolean }).__mqLauscherAktiv = true;
          }
          return (echtesAddEventListener as (...a: unknown[]) => void)(type, ...rest);
        }) as typeof liste.addEventListener;
      }
      return liste;
    };
  });
}

async function matchMediaLauschAbwarten(seite: Page): Promise<void> {
  // Drittes Argument, nicht zweites: `waitForFunction(fn, arg, options)`. Ohne
  // das explizite `undefined` dazwischen liest Playwright `{ timeout }` als
  // `arg` statt als `options`, und die Wartezeit ist effektiv unbegrenzt —
  // ein bei der Gegenprobe (siehe Bericht) tatsaechlich aufgetretener Fehler.
  await seite.waitForFunction(
    () => (window as unknown as { __mqLauscherAktiv?: boolean }).__mqLauscherAktiv === true,
    undefined,
    { timeout: 10_000 },
  );
}

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

/**
 * DIE KERNZUSAGE DES AUTO-MODUS, live im echten Browser.
 *
 * `AntdProvider.test.tsx` haengt seinen `matchMedia`-Listener an eine von Hand
 * gebaute Attrappe (`matchMediaStellen`) und loest den Wechsel selbst aus,
 * indem es die dort registrierten Handler direkt aufruft. Das beweist, dass
 * `AntdProvider` den Listener, den der Test ihm gegeben hat, korrekt bedient —
 * es beweist NICHT, dass ein echtes `change`-Ereignis von
 * `window.matchMedia("(prefers-color-scheme: dark)")` denselben Weg bis zum
 * gestempelten `data-theme` findet. Genau diese Naht (echtes Browser-Ereignis
 * → React-State → `dataset.theme`) ist in Vitest strukturell nicht pruefbar:
 * jsdom kennt kein `matchMedia`, das auf eine OS-Praeferenz reagiert, und die
 * Attrappe kann per Definition nur die eigene Verdrahtung bezeugen.
 *
 * Playwrights `page.emulateMedia` aendert `prefers-color-scheme` fuer die
 * laufende Seite, OHNE zu reloaden — ob das dabei tatsaechlich ein
 * `change`-Ereignis auf der `MediaQueryList` feuert (statt nur `matches` beim
 * naechsten Abfragen umspringen zu lassen), war beim Schreiben dieses Tests
 * offen und wird hier erstmals gegen einen echten Browser geklaert.
 *
 * `emulateMedia` steht bewusst ERST NACH `matchMediaLauschAbwarten` (siehe
 * deren Kommentar oben): ohne das Gate bestuende auch ein Provider ohne
 * funktionierenden `change`-Listener diesen Test, wenn der Wechsel zufaellig
 * vor dem Mount landet und der einmalige Mount-Read schon den richtigen Wert
 * liest.
 */
test("Auto-Modus: ein OS-Wechsel waehrend der Sitzung schlaegt ohne Reload durch", async ({
  browser,
}) => {
  const kontext = await browser.newContext({ colorScheme: "light" });
  try {
    // Kein `iuk-theme-pref`-Cookie — die Vorgabe ist Auto.
    const seite = await kontext.newPage();
    await matchMediaLauscherInstallieren(seite);
    await seite.goto(`${PORTAL}/login`);
    await matchMediaLauschAbwarten(seite);

    await expect(seite.locator("html")).toHaveAttribute("data-theme", "light");

    await seite.emulateMedia({ colorScheme: "dark" });

    // Selbstwiederholend (kein `waitForTimeout`): der Test haengt sonst an
    // einem geratenen Zeitfenster statt am tatsaechlichen Ereignis.
    await expect(seite.locator("html")).toHaveAttribute("data-theme", "dark");
  } finally {
    await kontext.close();
  }
});

/**
 * Die Gegenprobe zum Test oben — und ohne sie waere auch ein Provider gruen,
 * der stur IMMER dem OS nachzieht, egal was die Person gewaehlt hat. Mit
 * `iuk-theme-pref=light` gesetzt darf derselbe OS-Wechsel `data-theme` nicht
 * anfassen.
 *
 * Dasselbe Hydrations-Gate wie oben, und hier zaehlt es doppelt: ohne den
 * Beweis, dass der Client bereits lauscht, koennte ein unveraendertes
 * `data-theme` nach dem Wechsel genauso gut heissen "der Client war noch gar
 * nicht da" statt "der Provider respektiert die Wahl" — die anschliessende
 * Wartezeit prueft nur den Endzustand, nicht ob ueberhaupt ein aktiver Client
 * dem Ereignis haette folgen koennen.
 */
test("Auto-Modus, Gegenprobe: eine ausdrueckliche Wahl ignoriert denselben OS-Wechsel", async ({
  browser,
}) => {
  const kontext = await browser.newContext({ colorScheme: "light" });
  try {
    await kontext.addCookies([{ name: "iuk-theme-pref", value: "light", url: PORTAL }]);
    const seite = await kontext.newPage();
    await matchMediaLauscherInstallieren(seite);
    await seite.goto(`${PORTAL}/login`);
    await matchMediaLauschAbwarten(seite);

    await expect(seite.locator("html")).toHaveAttribute("data-theme", "light");

    await seite.emulateMedia({ colorScheme: "dark" });

    // Kurz gewartet, damit ein faelschlich nachziehender Provider Zeit haette
    // umzuschalten — und dann bezeugt, dass er es nicht getan hat.
    await seite.waitForTimeout(1000);
    await expect(seite.locator("html")).toHaveAttribute("data-theme", "light");
  } finally {
    await kontext.close();
  }
});
