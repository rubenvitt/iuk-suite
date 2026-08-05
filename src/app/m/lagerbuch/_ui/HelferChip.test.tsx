// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import { mount, unmount, query } from "@/app/m/qr/_lib/test-dom";
import { HelferChip } from "./HelferChip";

const QUELLE = "src/app/m/lagerbuch/_ui/HelferChip.tsx";
const STYLESHEET = "src/app/m/lagerbuch/_ui/helfer.module.css";
const TOENE = ["rot", "gelb", "ok", "grau"] as const;

/**
 * Kopie von `ohneKommentare()` aus `_lib/bauform.test.ts` (Regel 1 / N-5 der
 * Regeldatei fuer Teil 4). Die Scans unten lesen sonst den Rohtext INKLUSIVE
 * Kommentaren — und `HelferChip.tsx` traegt in seinem Kopfkommentar woertlich
 * `s[`chip-${ton}`]`, `"use client"` und `verwaltung.module.css`, weil genau
 * das die Begruendung der Datei ist. Ohne diesen Filter waeren die drei
 * Negativ-Scans auf ihrer eigenen Begruendung rot. Der Positiv-Scan auf
 * `Record<AmpelTon, string>` ist ohne ihn noch schlimmer: er waere FALSCH
 * GRUEN, weil derselbe Kommentar die Zeichenkette traegt und der Scan damit
 * auch dann bestuende, wenn der Code das Record verloere.
 * `bauform.test.ts` exportiert die Funktion nicht, und dies ist ein anderer
 * Testkoerper — deshalb die lokale Kopie statt eines Re-Exports, wie schon in
 * `_lib/pwaIcons.test.ts` und `_lib/schreibpfade/tokenEinloesung.test.ts`.
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

/**
 * ⚠️ DIE MESSUNG, OHNE DIE DIESE DATEI EIN SCHEINTEST WAERE.
 *
 * Der Plan sichert die Namensfalle mit `expect(className).not.toContain(
 * "undefined")` zu. Unter Vitest kann diese Zusicherung fuer die ECHTE Falle
 * NIE fehlschlagen: ein CSS-Modul ist hier ein Proxy, der fuer JEDEN Schluessel
 * eine Zeichenkette liefert — auch fuer einen, den das Stylesheet nie
 * deklariert hat. Gemessen am 05.08.2026 gegen `helfer.module.css`:
 *
 *     s.chip        -> "_chip_ef45c4"
 *     s["chip-rot"] -> "_chip-rot_ef45c4"      (das Stylesheet kennt `.chip-rot` NICHT)
 *     s.gibtsNicht  -> "_gibtsNicht_ef45c4"
 *     Object.keys(s) -> []                     (der Proxy zaehlt nichts auf)
 *
 * Ein `s[`chip-${ton}`]` waere unter Vitest also klaglos gruen und im Browser
 * farblos. Deshalb wird die Falle hier NICHT ueber das Wort "undefined"
 * geprueft, sondern gegen das Stylesheet auf der Festplatte: der Schluessel,
 * den die gerenderte Klasse traegt, MUSS dort als Selektor stehen.
 */
const CSS_ROH = readFileSync(STYLESHEET, "utf8");
/* CSS kennt keine `//`-Zeilenkommentare — hier reicht das Leeren der
   Blockkommentare. Absichtlich nicht `ohneKommentare()`: die Funktion ist fuer
   TypeScript-Quelltext geschrieben, und ihr `//`-Zweig wuerde in CSS nichts
   treffen. */
const CSS = CSS_ROH.replace(/\/\*[\s\S]*?\*\//g, "");

/** Jeder Klassenselektor, den `helfer.module.css` TATSAECHLICH deklariert. */
function deklarierteKlassen(css: string): Set<string> {
  return new Set((css.match(/\.[A-Za-z_][\w-]*/g) ?? []).map((t) => t.slice(1)));
}

/** Der Regelkoerper zu `.klasse` — `null`, wenn es die Regel nicht gibt. */
function regelKoerper(css: string, klasse: string): string | null {
  const m = new RegExp(`(?<![\\w-])\\.${klasse}(?![\\w-])\\s*\\{([^}]*)\\}`).exec(css);
  return m ? m[1] : null;
}

/** `_rot_ef45c4` -> `rot`. `null`, wenn die Vitest-Namensform sich aendert. */
function schluessel(klassenToken: string): string | null {
  const m = /^_(.+)_[0-9a-f]+$/.exec(klassenToken);
  return m ? m[1] : null;
}

const DEKLARIERT = deklarierteKlassen(CSS);

afterEach(async () => {
  await unmount();
});

describe("Das Fundament dieser Datei: das Stylesheet kennt keine `chip-<ton>`-Klasse", () => {
  it("deklariert `.chip` und die vier Tonklassen, aber KEINE der vier interpolierten", () => {
    // Waere `chip-rot` hier drin — etwa weil `deklarierteKlassen()` einen
    // Kommentar mitliest —, waere der Tragtest unten dauerhaft gruen und
    // nutzlos (Ausprägung 3 aus Uebergabe Teil 3). Deshalb hier explizit.
    // BEWUSST eine UNTERGRENZE, keine exakte Zahl (heute 74 gemessen):
    // `helfer.module.css` gehoert T64, und T72/T78/T79/T83 rendern dagegen. Eine
    // exakte Zahl waere eine Stolperdrahtleine auf einer fremden Datei — sie
    // ginge bei jeder harmlosen neuen Klasse rot und schickte den Suchenden in
    // die falsche Datei. Was hier zu halten ist, halten die vier `has()`-Paare
    // unten; die Untergrenze faengt nur den Fall „Regex kaputt, Menge leer".
    expect(DEKLARIERT.size).toBeGreaterThanOrEqual(74);
    expect(DEKLARIERT.has("chip")).toBe(true);
    for (const ton of TOENE) {
      expect(DEKLARIERT.has(ton)).toBe(true);
      expect(DEKLARIERT.has(`chip-${ton}`)).toBe(false);
    }
  });
});

describe("HelferChip — die Namensfalle aus §5.17", () => {
  for (const ton of TOENE) {
    it(`\`${ton}\` bekommt eine ECHTE, im Stylesheet deklarierte Klasse`, async () => {
      // `s[\`chip-${ton}\`]` liefert im Browser `undefined`, und React rendert
      // `class="undefined"` — Padding und Radius stehen, die Farbe fehlt, und
      // niemand meldet es. Unter Vitest liefert derselbe Zugriff STATTDESSEN
      // `_chip-rot_ef45c4`; deshalb wird hier gegen das Stylesheet geprueft.
      await mount(<HelferChip ton={ton}>Text</HelferChip>);
      const el = query("[data-rolle='helfer-chip']");

      expect(el.className).not.toContain("undefined");
      const tokens = el.className.trim().split(/\s+/);
      expect(tokens.length).toBe(2); // .chip + Ton, nicht mehr und nicht weniger

      const keys = tokens.map(schluessel);
      // Schlaegt die Namensform von Vitest um, wird das LAUT statt still.
      expect(keys.every((k) => k !== null)).toBe(true);
      expect(keys).toContain("chip");

      const tonKey = keys.find((k) => k !== "chip");
      expect(typeof tonKey).toBe("string");
      // DIE tragende Zeile: `chip-rot` steht nicht im Stylesheet -> rot.
      expect(DEKLARIERT.has(tonKey as string)).toBe(true);

      // Und es ist der RICHTIGE Ton: eine vertauschte Zuordnung
      // (`rot: s.ok`) ist typkorrekt und liesse „abgelaufen" gruen aussehen.
      // `grau` darf dabei NIE auf den ok-Werten landen (§6.6.2).
      const koerper = regelKoerper(CSS, tonKey as string);
      expect(koerper).not.toBeNull();
      expect(koerper as string).toContain(`--lb-ampel-${ton}-text`);
      expect(koerper as string).toContain(`--lb-ampel-${ton}-flaeche`);
    });
  }

  it("die vier Tonklassen sind PAARWEISE VERSCHIEDEN", async () => {
    // Ein Record, in dem zwei Toene dieselbe Klasse tragen, ist typkorrekt und
    // still: „abgelaufen" saehe aus wie „in Ordnung".
    //
    // ⚠️ REGEL 4, offen gesagt: dieser Test haelt KEINEN Fall allein, den der
    // Tontest oben nicht auch haelt — eine Dublette faellt dort ueber
    // `--lb-ampel-<ton>-text` ebenfalls auf. Er bleibt, weil er auf einer
    // ANDEREN Achse haengt: er kennt das Stylesheet nicht und ueberlebt damit
    // jede Umbenennung der `--lb-ampel-*`-Konvention, an der der Tontest
    // angepasst werden muesste.
    const klassen = new Set<string>();
    for (const ton of TOENE) {
      await mount(<HelferChip ton={ton}>Text</HelferChip>);
      klassen.add(query("[data-rolle='helfer-chip']").className);
      await unmount();
    }
    expect(klassen.size).toBe(4);
  });

  it("rendert den Text — es gibt keinen Modus ‚nur Farbe'", async () => {
    // docs/design/README.md: „Bedeutung nie allein ueber Farbe".
    await mount(<HelferChip ton="rot">abgelaufen</HelferChip>);
    expect(query("[data-rolle='helfer-chip']").textContent).toBe("abgelaufen");
  });

  it("reicht auch zusammengesetzte `children` durch, nicht nur eine Zeichenkette", async () => {
    await mount(
      <HelferChip ton="gelb">
        <span data-rolle="probe">12</span> Tage
      </HelferChip>,
    );
    expect(query("[data-rolle='helfer-chip'] [data-rolle='probe']").textContent).toBe("12");
    expect(query("[data-rolle='helfer-chip']").textContent).toBe("12 Tage");
  });
});

describe("HelferChip — Bauform", () => {
  it("benutzt ein vollstaendiges Record, KEINE Interpolation und KEINEN Index-Zugriff auf `s`", () => {
    // ⚠️ Alle drei Muster stehen woertlich im Kopfkommentar der geprueften
    // Datei — ohne `ohneKommentare()` waere der Positiv-Scan falsch gruen und
    // die beiden Negativ-Scans falsch rot.
    const q = ohneKommentare(readFileSync(QUELLE, "utf8"));
    expect(q).toMatch(/Record<AmpelTon, string>/);
    expect(q).not.toMatch(/s\[`/); // kein s[`chip-${…}`]
    expect(q).not.toMatch(/\$\{ton\}/); // keine Interpolation eines Klassennamens
  });

  it("importiert `AmpelTon` als TYP — kein Laufzeit-Zyklus nach `_lib/format.ts`", () => {
    const q = ohneKommentare(readFileSync(QUELLE, "utf8"));
    expect(q).toMatch(/import type \{[^}]*AmpelTon/);
    // Ein zweiter, WERTEHAFTER Import aus derselben Datei zoege `_lib/format.ts`
    // zur Laufzeit herein und machte den `import type` wirkungslos.
    expect(q).not.toMatch(/^\s*import\s+(?!type\b)[^;]*from\s+"\.\.\/_lib\/format"/m);
  });

  it('laeuft in RSC UND in Client-Inseln: kein "use client", kein antd', () => {
    const q = ohneKommentare(readFileSync(QUELLE, "utf8"));
    expect(q).not.toMatch(/"use client"/);
    expect(q).not.toMatch(/from "antd|@ant-design\/icons|lucide-react/);
  });

  it("liest `helfer.module.css` und NICHT `verwaltung.module.css`", () => {
    // `verwaltung.module.css` steht zweimal im Kopfkommentar der Datei (es ist
    // die Begruendung, warum es zwei Chips gibt) — auch dieser Scan braucht
    // `ohneKommentare()`.
    const q = ohneKommentare(readFileSync(QUELLE, "utf8"));
    expect(q).toMatch(/from "\.\/helfer\.module\.css"/);
    expect(q).not.toMatch(/verwaltung\.module\.css/);
  });
});
