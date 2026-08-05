// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import type { ComponentProps } from "react";
import { mount, unmount, query, queryAll, exists } from "@/app/m/qr/_lib/test-dom";
import { OeffentlicherRahmen } from "./OeffentlicherRahmen";
import { LeerZustand } from "./LeerZustand";

const RAHMEN_QUELLE = "src/app/m/lagerbuch/_ui/OeffentlicherRahmen.tsx";
const LEER_QUELLE = "src/app/m/lagerbuch/_ui/LeerZustand.tsx";
const STYLESHEET = "src/app/m/lagerbuch/_ui/helfer.module.css";

/**
 * Kopie von `ohneKommentare()` aus `_lib/bauform.test.ts` (Regel 1 der Regeldatei
 * fuer Teil 4, Nachtrag N-5). `bauform.test.ts` exportiert sie nicht, und dies ist
 * ein anderer Testkoerper — deshalb die zeichengleiche lokale Kopie statt eines
 * Re-Exports, genau wie `_lib/pwaIcons.test.ts` (T65),
 * `_lib/schreibpfade/tokenEinloesung.test.ts` (T66), `_ui/Restzeit.test.tsx` (T67)
 * und `_ui/Stepper.test.tsx` (T68) es halten.
 *
 * ⚠️ OHNE SIE SIND DREI DER SCANS UNTEN AUF IHRER EIGENEN BEGRUENDUNG ROT.
 * `OeffentlicherRahmen.tsx` schreibt „KEIN "use client"" in seinen Kopfkommentar,
 * `LeerZustand.tsx` ebenso — UND zusaetzlich „⚠️ KEIN `notFound()`". Genau diese
 * Saetze sind die Begruendung, die der Plan konserviert haben will; sie duerfen
 * den Scan nicht ausloesen, und die naheliegende „Reparatur" waere, sie zu
 * loeschen.
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
        if (zu === -1) {
          imBlock = true;
          return zeile.slice(0, auf);
        }
        return zeile.slice(0, auf) + " ".repeat(zu + 2 - auf) + zeile.slice(zu + 2);
      }
      return zeile.trimStart().startsWith("//") ? "" : zeile;
    })
    .join("\n");
}

/** Jeder Klassenname, den eine Quelldatei als `s.name` aus dem Stylesheet zieht. */
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

afterEach(async () => {
  await unmount();
});

describe("OeffentlicherRahmen", () => {
  it("traegt `.rahmen` UND haelt Streifen und Inhalt DARIN — den Traeger ALLER --lb-Variablen", async () => {
    // Schriebe jede Seite die Klasse selbst, gaebe es mehrere Stellen, an denen
    // jemand sie vergisst — und der Fehler waere still: jedes var(--lb-…) fiele
    // auf transparent zurueck (Falle 2).
    //
    // ⚠️ DIE KLASSE ALLEIN IST NICHT DIE ZUSAGE, und deshalb steht die reine
    // Klassenpruefung des Plans hier NICHT als eigener Testkoerper: sie waere
    // eine echte Teilmenge dieses Tests, also die Kopie, vor der Regel 4 warnt.
    // Saesse `.rahmen` auf einem GESCHWISTER des Inhalts, bliebe sie gruen —
    // und jede `var(--lb-…)` im Inhalt fiele trotzdem auf `transparent`
    // zurueck, also genau der Ausfall, gegen den es diese Komponente
    // ueberhaupt gibt. Gepruefte Zusage ist die ENTHALTENHEIT, nicht die
    // Nachbarschaft.
    await mount(
      <OeffentlicherRahmen>
        <p data-rolle="kind">Inhalt</p>
      </OeffentlicherRahmen>,
    );
    const rahmen = query("div");
    expect(rahmen.className).toMatch(/rahmen/);
    expect(rahmen.contains(query("[data-rolle='lb-streifen']"))).toBe(true);
    expect(rahmen.contains(query("[data-rolle='kind']"))).toBe(true);
    // Der Inhalt haengt am eigenen Traeger, nicht direkt am Rahmen: `.rahmen`
    // ist ein Spaltenlayout mit `overflow: hidden`, das Scrollen liegt auf
    // `.oeffentlichInhalt`.
    const inhalt = query("[data-rolle='kind']").parentElement!;
    expect(inhalt.className).toMatch(/oeffentlichInhalt/);
  });

  it("rendert den roten Streifen und den Inhalt", async () => {
    await mount(
      <OeffentlicherRahmen>
        <p data-rolle="kind">Inhalt</p>
      </OeffentlicherRahmen>,
    );
    expect(exists("[data-rolle='lb-streifen']")).toBe(true);
    // Der Streifen IST seine Klasse: ohne `.streifen` gibt es kein rotes Band,
    // sondern ein leeres `div` — und `data-rolle` allein saehe das nicht.
    expect(query("[data-rolle='lb-streifen']").className).toMatch(/streifen/);
    expect(query("[data-rolle='kind']").textContent).toBe("Inhalt");
  });

  it("rendert WEDER Kopf NOCH Tab-Leiste — hier gibt es keine Sitzung", async () => {
    // Eine Tab-Leiste auf dem Gate zeigte zwei Ziele, die ohne Sitzung beide
    // sofort wieder aufs Gate zuruecklaufen.
    await mount(
      <OeffentlicherRahmen>
        <p>Inhalt</p>
      </OeffentlicherRahmen>,
    );
    expect(exists("nav")).toBe(false);
    expect(exists("header")).toBe(false);
  });

  it("ist eine Server Component", () => {
    const q = ohneKommentare(readFileSync(RAHMEN_QUELLE, "utf8"));
    expect(q).not.toMatch(/"use client"/);
    expect(q).not.toMatch(/from\s+"antd(\/|")|from\s+"@ant-design\/icons|lucide-react/);
  });
});

describe("LeerZustand — der Rueckweg ist PFLICHT (§11.7, E5)", () => {
  it("rendert Titel, Text und den benannten Weg", async () => {
    await mount(
      <LeerZustand
        titel="Kein Fahrzeug angelegt"
        text="Die Verwaltung muss zuerst ein Fahrzeug mit Soll-Bestückung pflegen."
        weg={{ href: "/helfer", text: "Zur Entnahme" }}
      />,
    );
    expect(query("[data-rolle='leer-titel']").textContent).toBe("Kein Fahrzeug angelegt");
    expect(query("[data-rolle='leer-text']").textContent).toContain("Soll-Bestückung");
    const weg = query<HTMLAnchorElement>("[data-rolle='leer-weg']");
    expect(weg.getAttribute("href")).toBe("/helfer");
    expect(weg.textContent).toBe("Zur Entnahme");
  });

  it("reicht `weg.href` UNVERAENDERT durch — die Komponente praefixiert nicht", async () => {
    // ⚠️ Der Plan prueft hier nur `.not.toMatch(/^\/m\/lagerbuch/)` auf einen
    // Pfad, den der Test selbst hineingibt. Das ist konstruktiv nicht
    // fehlschlagbar, solange die Komponente irgendetwas durchreicht — und die
    // Regel „AEUSSERER Pfad" liegt ohnehin beim AUFRUFER, nicht hier.
    // Zusicherbar ist hier genau eine Sache, und die traegt die Regel: die
    // Komponente fasst den Pfad NICHT an. Ein `/m/lagerbuch`-Praefix in
    // `LeerZustand` waere auf dem Modul-Host eine DOPPELTE Praefixierung
    // (Falle 63); die Gegenkonvention gilt nur fuer `revalidatePath`.
    for (const href of ["/helfer/check", "/a/17", "/"]) {
      await mount(<LeerZustand titel="X" text="Y" weg={{ href, text: "Zum Check" }} />);
      const gerendert = query<HTMLAnchorElement>("[data-rolle='leer-weg']").getAttribute("href");
      expect(gerendert).toBe(href);
      expect(gerendert).not.toMatch(/^\/m\/lagerbuch/);
      await unmount();
    }
  });

  it("rendert genau EINEN Weg — kein zweiter, konkurrierender Ausgang", async () => {
    await mount(<LeerZustand titel="X" text="Y" weg={{ href: "/helfer", text: "Zurück" }} />);
    expect(queryAll("a").length).toBe(1);
  });

  it("`weg` ist ein PFLICHT-Prop — ein Aufruf ohne Rueckweg ist ein Typfehler", () => {
    // ⚠️ DIESE ZUSICHERUNG TRAEGT `pnpm typecheck`, NICHT VITEST. Sie ist der
    // einzige Traeger der zentralen Regel dieses Tasks: wuerde `weg` optional
    // (`weg?:`), waere die `@ts-expect-error`-Direktive unbenutzt, und `tsc`
    // meldet „Unused '@ts-expect-error' directive" — der Bau bricht. Als
    // Optional waere §11.7 eine Bitte; als Pflicht ist es eine Zusage.
    // @ts-expect-error `weg` ist ABSICHTLICH nicht optional (§11.7, E5).
    const ohneWeg: ComponentProps<typeof LeerZustand> = { titel: "X", text: "Y" };
    expect("weg" in ohneWeg).toBe(false);
  });

  it("ist eine Server Component ohne antd", () => {
    const q = ohneKommentare(readFileSync(LEER_QUELLE, "utf8"));
    expect(q).not.toMatch(/"use client"/);
    expect(q).not.toMatch(/from\s+"antd(\/|")|from\s+"@ant-design\/icons|lucide-react/);
  });

  it("ruft KEIN notFound() — Entscheidung 36 (a)", () => {
    // Die Suite-404 ersetzt alle Modul-Layouts, traegt Geist statt der
    // Modulschrift und einen antd-Button (:57). Auf einem Weg, den eine Person
    // mit einem gedruckten Gegenstand in der Hand nimmt, ist das die falsche
    // Antwort.
    expect(ohneKommentare(readFileSync(LEER_QUELLE, "utf8"))).not.toMatch(/notFound/);
  });
});

describe("beide Traeger nennen nur Klassen, die `helfer.module.css` DEKLARIERT", () => {
  it("jede `s.…`-Klasse aus beiden Dateien steht im Stylesheet", () => {
    // ⚠️ Dieser Scan ist NICHT redundant zu den Klassen-Zusicherungen oben, und
    // der Grund ist gemessen: Vite erzeugt fuer JEDEN Schluessel eines
    // CSS-Moduls einen Namen, auch fuer einen, den es nicht gibt —
    // `s.gibtEsNicht` liefert unter Vitest `"_gibtEsNicht_ef45c4"`, nicht
    // `undefined`. Ein Tippfehler im Klassennamen ist unter Vitest also
    // strukturell unsichtbar, waehrend er im Next-Build `undefined` ergibt und
    // React still `class="undefined"` rendert. Nur der Abgleich gegen das
    // Stylesheet selbst faengt das.
    const deklariert = deklarierteKlassen();
    expect(deklariert.size, "leeres Stylesheet — der Scan waere leer-gruen").toBeGreaterThanOrEqual(50);
    const genutzt = [...genutzteKlassen(RAHMEN_QUELLE), ...genutzteKlassen(LEER_QUELLE)];
    expect(genutzt.length, "keine einzige Klasse geprueft").toBeGreaterThanOrEqual(9);
    expect(genutzt.filter((k) => !deklariert.has(k))).toEqual([]);
  });
});
