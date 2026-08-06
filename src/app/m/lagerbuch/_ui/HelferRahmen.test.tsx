// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from "vitest";
import { readFileSync } from "node:fs";
import type { ComponentProps } from "react";
import {
  mount, hydrate, unmount, query, queryAll, exists, submitForm,
} from "@/app/m/qr/_lib/test-dom";

/**
 * `_actions/sitzung.ts` ist ein `"use server"`-Modul: es zieht `next/headers`,
 * `getDb()` und den Gate-Riegel nach. Ein Import davon oeffnete im Test eine
 * echte Datenbank. Der Rahmen braucht die Aktion nur als REFERENZ fuer
 * `<form action={…}>` — was sie tut, gehoert T74.
 */
const beendenMock = vi.hoisted(() => vi.fn());
vi.mock("../_actions/sitzung", () => ({ beenden: beendenMock }));

import { HelferRahmen } from "./HelferRahmen";

const QUELLE = "src/app/m/lagerbuch/_ui/HelferRahmen.tsx";
const STYLESHEET = "src/app/m/lagerbuch/_ui/helfer.module.css";
/** 17:00 UTC → 19:00 in Europe/Berlin (Sommerzeit). */
const LAEUFT_AB = new Date("2026-08-04T17:00:00.000Z");

/**
 * Kopie von `ohneKommentare()` aus `_lib/bauform.test.ts:84-104` (Regel 1 der
 * Regeldatei fuer Teil 4, Nachtrag N-5) — zeichengleich aus der QUELLE
 * uebernommen, nicht aus einer der Geschwisterkopien.
 *
 * ⚠️ OHNE SIE SIND DREI DER SCANS UNTEN AUF IHRER EIGENEN BEGRUENDUNG ROT.
 * `HelferRahmen.tsx` traegt in seinem Kopfkommentar woertlich „KEIN
 * "use client"", „`pathname.startsWith("/helfer/check")`" und „`usePathname()`"
 * — genau die Zeichenfolgen, die die Scans verbieten. Das sind die Saetze, die
 * der Plan konserviert haben will; die naheliegende „Reparatur" waere, sie zu
 * loeschen. `bauform.test.ts` exportiert die Funktion nicht, und dies ist ein
 * anderer Testkoerper — deshalb die lokale Kopie, genau wie `_lib/pwaIcons.test.ts`
 * (T65), `_lib/schreibpfade/tokenEinloesung.test.ts` (T66), `_ui/Restzeit.test.tsx`
 * (T67) und `_ui/rahmen.test.tsx` (T73) es halten.
 */
function ohneKommentare(quelle: string): string {
  let imBlock = false;
  return quelle
    .split("\n")
    .map((zeile) => {
      if (imBlock) {
        const zu = zeile.indexOf("*/");
        if (zu === -1) return "";
        imBlock = false;
        return " ".repeat(zu + 2) + zeile.slice(zu + 2);
      }
      const auf = zeile.indexOf("/*");
      if (auf !== -1 && !zeile.slice(0, auf).includes("*/")) {
        const zu = zeile.indexOf("*/", auf + 2);
        if (zu === -1) { imBlock = true; return zeile.slice(0, auf); }
        return zeile.slice(0, auf) + " ".repeat(zu + 2 - auf) + zeile.slice(zu + 2);
      }
      return zeile.trimStart().startsWith("//") ? "" : zeile;
    })
    .join("\n");
}

/** Jeder Klassenname, den die Quelldatei als `s.name` aus dem Stylesheet zieht. */
function genutzteKlassen(pfad: string): string[] {
  const treffer = ohneKommentare(readFileSync(pfad, "utf8")).matchAll(/\bs\.([A-Za-z][A-Za-z0-9_]*)/g);
  return [...new Set([...treffer].map((m) => m[1]!))];
}

/** Jeder Klassenname, den `helfer.module.css` tatsaechlich DEKLARIERT. */
function deklarierteKlassen(): Set<string> {
  let css = ohneKommentare(readFileSync(STYLESHEET, "utf8"));
  // Erst die Regelkoerper leeren, damit `1.5px` oder `.07em` nicht als Selektor
  // gelesen werden. Wiederholt, weil `@media { … { … } }` genestet ist.
  for (let i = 0; i < 5; i++) css = css.replace(/\{[^{}]*\}/g, " ");
  const namen = new Set<string>();
  for (const m of css.matchAll(/(?:^|[\s,>+~(])\.([A-Za-z][A-Za-z0-9_-]*)/gm)) namen.add(m[1]!);
  return namen;
}

/** Das serverseitig gerenderte HTML — VOR jedem `useEffect`. */
function serverBaum(html: string): HTMLElement {
  const traeger = document.createElement("div");
  traeger.innerHTML = html;
  return traeger;
}

afterEach(async () => {
  await unmount();
  beendenMock.mockClear();
});

describe("HelferRahmen — die Aktivmarkierung kommt als PROP (Falle 63)", () => {
  it("`aktiv=\"entnahme\"` setzt `aria-current=\"page\"` GENAU EINMAL, am Entnahme-Tab", async () => {
    await mount(
      <HelferRahmen aktiv="entnahme" sitzungsetikett="Token 482-137 · RTW 1" laeuftAb={LAEUFT_AB}>
        <p>Inhalt</p>
      </HelferRahmen>,
    );
    const aktive = queryAll("[data-testid='lb-tableiste'] a[aria-current='page']");
    expect(aktive.length).toBe(1);
    expect(aktive[0]!.textContent).toContain("Entnahme");
  });

  it("`aktiv=\"check\"` setzt sie am Fahrzeug-Check-Tab", async () => {
    // ⚠️ DIESER TEST IST KEINE KOPIE DES VORIGEN (Regel 4). Er allein haelt den
    // Fall, den Falle 63 im Betrieb traf: eine fest auf „Entnahme" verdrahtete
    // Markierung — oder eine aus `pathname.startsWith(…)` abgeleitete, die auf
    // dem zweiten Weg (`/m/lagerbuch/helfer/check`) dauerhaft „Entnahme"
    // markierte — laesst den vorigen Test GRUEN und faellt nur hier.
    // Per Mutation belegt (Bericht, Mutation A).
    await mount(
      <HelferRahmen aktiv="check" sitzungsetikett="X" laeuftAb={LAEUFT_AB}>
        <p>Inhalt</p>
      </HelferRahmen>,
    );
    const aktive = queryAll("[data-testid='lb-tableiste'] a[aria-current='page']");
    expect(aktive.length).toBe(1);
    expect(aktive[0]!.textContent).toContain("Fahrzeug-Check");
  });

  it("die beiden `href` sind AEUSSERE Pfade", async () => {
    // Innere (/m/lagerbuch/helfer/check) waeren die naheliegende und falsche
    // Vereinheitlichung mit Falle 49 — sie wuerden auf dem aeusseren Host
    // DOPPELT praefixiert.
    await mount(
      <HelferRahmen aktiv="entnahme" sitzungsetikett="X" laeuftAb={LAEUFT_AB}><p /></HelferRahmen>,
    );
    const links = queryAll<HTMLAnchorElement>("[data-testid='lb-tableiste'] a");
    expect(links.map((a) => a.getAttribute("href"))).toEqual(["/helfer", "/helfer/check"]);
  });

  it("die CSS-Klasse folgt aus `aria-current`, nicht umgekehrt (§7.8.2 Punkt 4)", async () => {
    // Damit prueft der E2E dieselbe Sache, die die Bildschirmleserin hoert.
    //
    // ⚠️ Der Plan prueft das mit `expect(q).not.toMatch(/className=\{[^}]*aktiv ===/)`
    // — einem Scan auf eine SCHREIBWEISE. Ein `const k = aktiv === "check" ? …`
    // eine Zeile hoeher liefe daran vorbei, und ein Verhaltenstest ist hier
    // moeglich: BEIDE Tabs tragen DIESELBE Klassenliste, der Unterschied liegt
    // allein im ARIA-Attribut. Per Mutation belegt (Bericht, Mutation C).
    await mount(
      <HelferRahmen aktiv="check" sitzungsetikett="X" laeuftAb={LAEUFT_AB}><p /></HelferRahmen>,
    );
    const links = queryAll<HTMLAnchorElement>("[data-testid='lb-tableiste'] a");
    expect(links.length).toBe(2);
    // Erst dass ueberhaupt eine Tab-Klasse dranhaengt — sonst waere die
    // Gleichheit zweier LEERER Klassenlisten die ganze Zusage.
    for (const a of links) expect(a.className).toMatch(/tab/);
    expect(links[0]!.className).toBe(links[1]!.className);
    // Und die Regel, aus der die Darstellung folgt, steht im Stylesheet.
    expect(readFileSync(STYLESHEET, "utf8")).toMatch(/\.tab\[aria-current="page"\]/);
  });

  it("die Tab-Leiste IST ein `<nav>` und traegt die zwei Merkmale aus E11 (Teil 6, T171)", async () => {
    // ⚠️ §2 Punkt 3 verbietet dem Wortlaut nach jedes `nav` fuer `/helfer/*`.
    // Der Folgesatz begrenzt das erkennbar auf die SUITE-Navigation („Das
    // Modul-Wurzel-Layout traegt ausschliesslich `metadata.manifest` und
    // `{children}`"), und E11 verlangt `data-testid="lb-tableiste"` ausdruecklich
    // AM `<nav>`. Wer den Constraint woertlich nimmt und ein `<div>` baut,
    // bricht E11 und T171 (Preflight-Scan, Befund 23).
    //
    // Geprueft wird am gerenderten Baum, nicht am Quelltext: der Plan scannt
    // `q.toContain('data-testid="lb-tableiste"')`, was auch dann gruen bliebe,
    // wenn die Zeichenfolge in einem toten Zweig oder an einem `<div>` staende.
    await mount(
      <HelferRahmen aktiv="entnahme" sitzungsetikett="X" laeuftAb={LAEUFT_AB}><p /></HelferRahmen>,
    );
    const leiste = query("[data-testid='lb-tableiste']");
    expect(leiste.tagName).toBe("NAV");
    expect(leiste.getAttribute("aria-label")).toBe("Helfer-Bereiche");
    expect(queryAll("nav").length).toBe(1);
  });
});

describe("HelferRahmen — der Kopf", () => {
  it("zeigt das Sitzungsetikett auf der dafuer vorgesehenen Flaeche", async () => {
    await mount(
      <HelferRahmen aktiv="entnahme" sitzungsetikett="Token 482-137 · RTW 1" laeuftAb={LAEUFT_AB}>
        <p />
      </HelferRahmen>,
    );
    // `[class*='etikett']` und nicht nur `header`: ein CSS-Modul loest unter
    // Vitest zu `_etikett_<hash>` auf. Ohne die Klasse gaebe es die Zeile zwar,
    // aber ohne ihre Schriftgroesse und Farbe — und `header` allein saehe das
    // nicht.
    expect(query("header [class*='etikett']").textContent).toBe("Token 482-137 · RTW 1");
  });

  it("rendert die Restzeit-Insel mit der SERVER-Uhrzeit", async () => {
    await mount(
      <HelferRahmen aktiv="entnahme" sitzungsetikett="X" laeuftAb={LAEUFT_AB}><p /></HelferRahmen>,
    );
    // `uhrzeit()` aus `_lib/zeit.ts` rechnet in Europe/Berlin: 17:00 UTC → 19:00.
    // Eine im Rahmen selbst gebaute Zeit (`toISOString().slice(11,16)`) ergaebe
    // „17:00" — der Browser einer Helferin steht nicht zwingend auf Berlin.
    // Per Mutation belegt (Bericht, Mutation G).
    expect(query("[data-rolle='restzeit']").textContent).toContain("19:00");
  });

  it("rendert den Beenden-Knopf als FORMULAR, nicht als Link — und er ruft die Aktion", async () => {
    // Ein Link waere vorlade- und prefetch-faehig. Ein Prefetch, der die
    // Sitzung beendet, ist genau die Sorte Fehler, die niemand reproduziert.
    await mount(
      <HelferRahmen aktiv="entnahme" sitzungsetikett="X" laeuftAb={LAEUFT_AB}><p /></HelferRahmen>,
    );
    expect(exists("header form button[type='submit']")).toBe(true);
    expect(query("header form button").textContent).toContain("Beenden");
    // Kein anderer Weg aus dem Kopf heraus: waere der Knopf zusaetzlich oder
    // stattdessen ein `<a href=…>`, blieben die zwei Zeilen darueber gruen.
    expect(exists("header a")).toBe(false);
    // Und das Formular haengt an der Aktion — ein `<form>` ohne `action` sieht
    // in beiden Zeilen darueber identisch aus und tut nichts.
    await submitForm("header form");
    expect(beendenMock).toHaveBeenCalledTimes(1);
  });

  it("rendert die Kinder im `<main>`", async () => {
    await mount(
      <HelferRahmen aktiv="entnahme" sitzungsetikett="X" laeuftAb={LAEUFT_AB}>
        <p data-rolle="kind">Inhalt</p>
      </HelferRahmen>,
    );
    expect(query("main [data-rolle='kind']").textContent).toBe("Inhalt");
  });
});

describe("HelferRahmen — die Warnschwelle rechnet der SERVER (§3.4.3 Punkt 1)", () => {
  /**
   * ⚠️ BEIDE TESTS PRUEFEN DAS SERVER-HTML, nicht den gemounteten Baum — und
   * genau darin liegt ihre Zusage. `Restzeit` rechnet in seinem `useEffect`
   * SOFORT nach (`pruefen()` vor dem Intervall); im gemounteten Baum haette ein
   * fest verdrahtetes `warntInitial={false}` deshalb dieselbe Anzeige ergeben
   * wie die richtige Rechnung, und der Test waere gruen geblieben.
   * `renderToString` fuehrt keinen Effekt aus — dort ist `warntInitial` die
   * EINZIGE Quelle. Der Startwert existiert genau dafuer: waere er falsch,
   * meldete Next einen Hydrations-Unterschied.
   *
   * Die beiden sind keine Kopien voneinander (Regel 4): der erste haelt allein
   * ein verdrahtetes `true`, der zweite allein ein verdrahtetes `false` — und
   * nur der zweite ist im DOM ueberhaupt nicht sichtbar.
   * Per Mutation belegt (Bericht, Mutationen F1 und F2).
   */
  it("weit vor Ablauf: das Server-HTML traegt KEINE Warnung", async () => {
    let html = "";
    await hydrate(
      <HelferRahmen
        aktiv="entnahme"
        sitzungsetikett="X"
        laeuftAb={new Date(Date.now() + 6 * 3600_000)}
      >
        <p />
      </HelferRahmen>,
      (wirt) => { html = wirt.innerHTML; },
    );
    expect(serverBaum(html).querySelector("[data-rolle='restzeit']")).not.toBeNull();
    expect(serverBaum(html).querySelector("[data-rolle='restzeit-warnung']")).toBeNull();
  });

  it("innerhalb der 30 Minuten: das Server-HTML traegt die Warnung schon", async () => {
    let html = "";
    await hydrate(
      <HelferRahmen
        aktiv="entnahme"
        sitzungsetikett="X"
        laeuftAb={new Date(Date.now() + 10 * 60_000)}
      >
        <p />
      </HelferRahmen>,
      (wirt) => { html = wirt.innerHTML; },
    );
    expect(serverBaum(html).querySelector("[data-rolle='restzeit-warnung']")).not.toBeNull();
  });
});

describe("HelferRahmen — der Traeger und die Zeichen", () => {
  it("`.rahmen` umschliesst Streifen, Kopf, Inhalt UND Tab-Leiste (Falle 2)", async () => {
    // `.rahmen` ist der TRAEGER ALLER `--lb-`-Variablen (`helfer.module.css:20`).
    // Saesse eines der vier Teile ausserhalb, fiele jede `var(--lb-…)` darin
    // still auf `transparent` zurueck — gueltiges CSS, unsichtbarer Ausfall.
    await mount(
      <HelferRahmen aktiv="entnahme" sitzungsetikett="X" laeuftAb={LAEUFT_AB}>
        <p data-rolle="kind">Inhalt</p>
      </HelferRahmen>,
    );
    const rahmen = query("[class*='rahmen']");
    for (const sel of ["[data-rolle='lb-streifen']", "header", "main", "nav"]) {
      expect(rahmen.contains(query(sel)), `ausserhalb von .rahmen: ${sel}`).toBe(true);
    }
    expect(query("[data-rolle='lb-streifen']").className).toMatch(/streifen/);
  });

  it("jedes Zeichen ist ein lokales Inline-SVG, versteckt UND neben Text", async () => {
    // Querschnittsregel des ganzen Helfer-Wegs: kein Icon-Paket, und ein Zeichen
    // OHNE danebenstehenden Text waere ein Bedienelement, das ein `aria-label`
    // am Knopf braeuchte (die einzige festgeschriebene Ausnahme ist der
    // Taschenlampenschalter in `_ui/BarcodeScanner.tsx`, N-7).
    await mount(
      <HelferRahmen aktiv="entnahme" sitzungsetikett="X" laeuftAb={LAEUFT_AB}><p /></HelferRahmen>,
    );
    const zeichen = queryAll("svg");
    // Ohne diese Zeile fuehrte ein leeres Trefferarray null Zusicherungen aus.
    expect(zeichen.length).toBe(3); // Beenden + zwei Tabs
    for (const svg of zeichen) {
      expect(svg.getAttribute("aria-hidden")).toBe("true");
      expect(svg.getAttribute("focusable")).toBe("false");
      const traeger = svg.closest("a, button");
      expect(traeger, "ein Zeichen ausserhalb von Knopf und Link").not.toBeNull();
      expect(traeger!.textContent!.trim().length).toBeGreaterThan(0);
    }
  });
});

describe("HelferRahmen — die drei Angaben sind PFLICHT-Props (§7.8.2, §3.4.3 Punkt 1)", () => {
  it("keine der drei ist optional — ein Aufruf ohne sie ist ein Typfehler", () => {
    // ⚠️ DIESE ZUSICHERUNG TRAEGT `pnpm typecheck`, NICHT VITEST. Wuerde eine der
    // drei optional (`laeuftAb?:`), waere die zugehoerige
    // `@ts-expect-error`-Direktive unbenutzt, und `tsc` meldet „Unused
    // '@ts-expect-error' directive" — der Bau bricht.
    //
    // Jedes der drei Objekte laesst GENAU EINE Angabe weg und traegt die
    // anderen drei: liesse eines zusaetzlich `children` weg, bliebe die
    // Direktive auch dann verbraucht, wenn die gepruefte Angabe optional wuerde
    // — und der Test traege nichts. Per Mutation belegt (Bericht, Mutation E).
    // @ts-expect-error `aktiv` ist ABSICHTLICH nicht optional (Falle 63).
    const ohneAktiv: ComponentProps<typeof HelferRahmen> = {
      sitzungsetikett: "X", laeuftAb: LAEUFT_AB, children: null,
    };
    // @ts-expect-error `sitzungsetikett` ist ABSICHTLICH nicht optional (§7.8.2).
    const ohneEtikett: ComponentProps<typeof HelferRahmen> = {
      aktiv: "entnahme", laeuftAb: LAEUFT_AB, children: null,
    };
    // @ts-expect-error `laeuftAb` ist ABSICHTLICH nicht optional (§3.4.3 Punkt 1).
    const ohneAblauf: ComponentProps<typeof HelferRahmen> = {
      aktiv: "entnahme", sitzungsetikett: "X", children: null,
    };
    expect("aktiv" in ohneAktiv).toBe(false);
    expect("sitzungsetikett" in ohneEtikett).toBe(false);
    expect("laeuftAb" in ohneAblauf).toBe(false);
  });
});

describe("HelferRahmen — Bauform", () => {
  it("ist eine Server Component ohne antd, ohne Icon-Paket", () => {
    // Gelesen wird OHNE Kommentare (Regel 1, Befund 1): der Kopfkommentar der
    // Datei traegt „KEIN "use client"" woertlich.
    const q = ohneKommentare(readFileSync(QUELLE, "utf8"));
    expect(q).not.toMatch(/"use client"/);
    expect(q).not.toMatch(/from\s+"antd(\/|")|from\s+"@ant-design\/icons|lucide-react/);
  });

  it("benutzt KEIN `usePathname` und KEIN `startsWith`", () => {
    // Die zentrale Regel dieses Tasks. Ein Verhaltenstest dafuer gibt es nicht:
    // `usePathname()` haette im Test gar keinen Router, und ein
    // `startsWith`-Vergleich waere typkorrekt und am Bildschirm nicht als
    // kaputt erkennbar.
    // Gelesen wird OHNE Kommentare (Regel 1, Befund 1): der Kopfkommentar traegt
    // beide Zeichenfolgen woertlich in seiner Begruendung.
    const q = ohneKommentare(readFileSync(QUELLE, "utf8"));
    expect(q).not.toMatch(/usePathname|startsWith/);
  });

  it("baut die Uhrzeit NICHT selbst — sie kommt aus `_lib/zeit.ts`", () => {
    const q = ohneKommentare(readFileSync(QUELLE, "utf8"));
    expect(q).toMatch(/from "\.\.\/_lib\/zeit"/);
    expect(q).not.toMatch(/toLocaleTimeString|\bIntl\b/);
  });

  it("nennt nur Klassen, die `helfer.module.css` DEKLARIERT", () => {
    // ⚠️ Vite erzeugt fuer JEDEN Schluessel eines CSS-Moduls einen Namen, auch
    // fuer einen, den es nicht gibt — `s.gibtEsNicht` liefert unter Vitest
    // `"_gibtEsNicht_ef45c4"`, nicht `undefined`. Ein Tippfehler im
    // Klassennamen ist unter Vitest also strukturell unsichtbar, waehrend er im
    // Next-Build `undefined` ergibt und React still `class="undefined"`
    // rendert. Nur der Abgleich gegen das Stylesheet selbst faengt das.
    const deklariert = deklarierteKlassen();
    expect(deklariert.size, "leeres Stylesheet — der Scan waere leer-gruen").toBeGreaterThanOrEqual(50);
    const genutzt = genutzteKlassen(QUELLE);
    expect(genutzt.length, "keine einzige Klasse geprueft").toBeGreaterThanOrEqual(10);
    expect(genutzt.filter((k) => !deklariert.has(k))).toEqual([]);
  });
});
