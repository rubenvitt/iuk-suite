import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "node:fs";

/**
 * QUELLTEXT-SCAN UEBER `_ui/files.css` — und NUR darueber.
 *
 * Was dieser Scan besitzt und was nicht: jsdom wertet Medienabfragen nicht aus.
 * Ein Vitest, der „bei 390px ist die Tabelle unsichtbar" behauptet und dafuer im
 * DOM sucht, geht IMMER durch — er misst nichts (`docs/design/README.md`,
 * Abschnitt „Tests fuer Responsives"). Diesem Scan gehoert deshalb genau eine
 * Aussage: „die Klasse traegt die richtige Medienabfrage und den Praefix".
 * Ob die Regel WIRKT, weisz nur ein echter Browser — das besitzt T48
 * (`e2e/files-mobil.spec.ts`) bei 390, 834 und 1280.
 *
 * ABGRENZUNG (Plan §1 Festlegung C): dieser Scan besitzt `_ui/files.css`.
 * `_ui/files-public.css` und ALLE `*.module.css` des Moduls besitzt
 * `files-public-css.test.ts` (T19). Die beiden Globs sind disjunkt und decken
 * zusammen jede CSS-Datei des Moduls ab — ohne diese Aufteilung greift die
 * 767.98px-Zusage genau dort nicht, wo neue Regeln entstehen.
 */
const MODUL_DIR = "src/app/m/files";
/**
 * Die geprueften Dateien als LISTE, obwohl es heute genau eine ist: der Scan
 * muss zuerst zusichern, dass er ueberhaupt etwas gelesen hat. Ein Scan ueber
 * null Dateien ist gruen, ohne etwas zu belegen — und ein Tippfehler im Pfad
 * fiele dann nie auf.
 */
const DATEIEN = [`${MODUL_DIR}/_ui/files.css`];

/**
 * ZWEI SICHTEN AUF DIESELBE DATEI, und die Trennung ist nicht Kosmetik:
 *
 * - `OHNE_KOMMENTARE` traegt die Regeln. `!important` und
 *   `prefers-color-scheme` muessen hier geprueft werden, sonst schlaegt der
 *   Test an der BEGRUENDUNG an — dieses Stylesheet erklaert im Kopf, warum es
 *   bewusst NICHT auf `prefers-color-scheme` selektiert, und ein Scan ueber den
 *   Rohtext wuerde an genau diesem Satz rot. Der naheliegende „Fix" waere dann, die
 *   Begruendung zu loeschen: der Test haette den Kommentar wegoptimiert, den er
 *   an anderer Stelle verlangt.
 * - `ROH` traegt die Kommentare. Die Zusage „die Spezifitaets-Erhoehung ist
 *   kommentiert" ist nur hier pruefbar.
 */
const ROH = DATEIEN.map((p) => (existsSync(p) ? readFileSync(p, "utf8") : "")).join("\n");
const OHNE_KOMMENTARE = ROH.replace(/\/\*[\s\S]*?\*\//g, "");

/**
 * Die flachen Regelbloecke der Datei, mit Selektor. `[^{}@]` schlieszt die
 * `@media`-Preludes aus (sie tragen `@`), die Regeln DARIN werden aber wie alle
 * anderen erfasst — genau richtig, weil die Praefix-Zusage fuer Basis UND
 * Medienabfrage gilt.
 *
 * OHNE Anker vor dem Selektor: ein `(?:^|[{}])` davor verschluckt die
 * schliessende Klammer des Vorgaengers, und dann findet der naechste Durchlauf
 * seinen Startpunkt nicht mehr — gemessen: von vier Umschaltregeln kamen zwei an,
 * und der ganze Dunkelblock fehlte. Ein Test, der so nur die Haelfte der Datei
 * sieht, ist nicht streng, sondern blind.
 */
const regelnAus = (css: string) =>
  [...css.matchAll(/([^{}@]+?)\s*\{([^{}]*)\}/g)].map((m) => ({
    selektor: m[1].replace(/\s+/g, " ").trim(),
    rumpf: m[2],
  }));

/** Die Bloecke der einen Medienabfrage, wie in `feedback-css.test.ts`. */
const MEDIA_767_BLOECKE = [
  ...OHNE_KOMMENTARE.matchAll(/@media \(max-width: 767\.98px\) \{([\s\S]*?)\n\}/g),
].map((m) => m[1]);

/**
 * BASIS UND MEDIENABFRAGE GETRENNT — und zwar durch HERAUSSCHNEIDEN der
 * `@media`-Bloecke, nicht dadurch, dass geprueft wird, ob der Selektortext
 * irgendwo in einem Block vorkommt. Der zweite Weg kann die beiden Haelften
 * strukturell nicht unterscheiden: Basis- und Medienregel tragen denselben
 * Selektor, also findet ihn eine Textsuche in beiden Faellen im Block — gemessen,
 * der Test hielt daraufhin die vorhandene Basisregel fuer fehlend.
 */
const BASIS = OHNE_KOMMENTARE.replace(/@media[^{]*\{[\s\S]*?\n\}/g, "");
const REGELN_BASIS = regelnAus(BASIS);
const REGELN_MEDIA = MEDIA_767_BLOECKE.flatMap(regelnAus);
const REGELN = [...REGELN_BASIS, ...REGELN_MEDIA];

/**
 * ALLE Regeln der Datei — unabhaengig davon, in welchem At-Block sie stehen.
 *
 * `REGELN` ist fuer die Praefix-Zusage NICHT vollstaendig, und das ist keine
 * Feinheit: `REGELN_MEDIA` kommt allein aus `MEDIA_767_BLOECKE` (die Zahl steht
 * im Regex), `BASIS` schneidet dagegen JEDEN `@media`-Block heraus. Eine Regel in
 * einem ANDEREN At-Block — z. B. dem `min-width: 768px`, den der
 * Breakpoint-Fall unten ausdruecklich erlaubt — landet damit in keiner der beiden
 * Mengen. GEMESSEN: `@media (min-width: 768px) { .ant-table-wrapper { display:
 * none; } }` angehaengt und alle 17 Faelle blieben gruen.
 *
 * Deshalb hier der Weg ueber die ganze Datei: nur die At-PRELUDES fallen weg
 * (`@media … {`), die Regeln darin bleiben. Das deckt auch `@supports` und
 * `@layer` ab, ohne sie einzeln zu erraten. Die uebrig bleibende schliessende
 * Klammer des Blocks bildet keine Regel und stoert `regelnAus` nicht.
 */
const AT_PRELUDE = /@[a-z-]+[^{;]*\{/g;
const ALLE_REGELN = regelnAus(OHNE_KOMMENTARE.replace(AT_PRELUDE, ""));

const varNamen = (text: string): Set<string> =>
  new Set([...text.matchAll(/(--fi-[a-z0-9-]+)\s*:/g)].map((m) => m[1]));

/**
 * Nur aus den BASISREGELN — die Variablen stehen auszerhalb jeder Medienabfrage.
 * Ueber `REGELN` gelesen waere der Filter heute genauso gruen, wuerde aber ein
 * spaeteres `:root { --fi-… }` INNERHALB des 767.98px-Blocks stillschweigend in
 * die Hell-Menge ziehen — und die Paritaetspruefung verglich dann die falschen
 * Mengen.
 */
const rumpfVon = (pruefe: (selektor: string) => boolean): string =>
  REGELN_BASIS.filter((r) => pruefe(r.selektor))
    .map((r) => r.rumpf)
    .join("\n");

describe("files.css — der Scan greift nicht ins Leere", () => {
  it("liest eine nicht-leere Dateimenge, die `_ui/files.css` enthaelt", () => {
    expect(DATEIEN.length).toBeGreaterThan(0);
    expect(DATEIEN).toContain("src/app/m/files/_ui/files.css");
    for (const pfad of DATEIEN) {
      expect(existsSync(pfad), `${pfad} fehlt`).toBe(true);
    }
    expect(ROH.trim().length).toBeGreaterThan(0);
  });

  it("findet Regelbloecke (sonst ist die Zerlegung kaputt, nicht die Datei leer)", () => {
    expect(REGELN.length).toBeGreaterThan(0);
  });

  /**
   * ABZAEHLEN GEGEN DIE DATEI, nicht gegen die eigene Zerlegung: `ALLE_REGELN`
   * traegt die Praefix-Zusage fuer JEDE Regel — eine Zerlegung, die eine Regel
   * uebersieht, macht diese Zusage still enger, ohne rot zu werden. Jede
   * oeffnende Klammer der Datei ist entweder ein At-Prelude oder eine Regel;
   * heute: 7 Klammern − 1 Prelude = 6 Regeln.
   */
  it("sieht JEDE Regel der Datei — Klammern minus At-Preludes", () => {
    const klammern = (OHNE_KOMMENTARE.match(/\{/g) ?? []).length;
    const preludes = (OHNE_KOMMENTARE.match(AT_PRELUDE) ?? []).length;
    expect(
      ALLE_REGELN.length,
      "die Zerlegung uebersieht eine Regel — dann gilt die Praefix-Zusage fuer sie nicht",
    ).toBe(klammern - preludes);
  });
});

describe("files.css — Breakpoint", () => {
  /**
   * Die Zahl wird AUSGEGEBEN, nicht nur behauptet: „alle max-width-Abfragen
   * lauten 767.98px" ist bei null Abfragen gruen. Genau so kaeme eine
   * mobile-first gebaute Umschaltung (`min-width: 768px`) durch diesen Test,
   * ohne dass je eine 767.98px-Abfrage existierte.
   */
  it("kennt mindestens eine `max-width`-Abfrage, und jede lautet 767.98px", () => {
    const werte = [...OHNE_KOMMENTARE.matchAll(/@media\s*\(max-width:\s*([\d.]+)px\)/g)].map(
      (m) => m[1],
    );
    console.info(`files.css: ${werte.length} max-width-Abfrage(n) geprueft`);
    expect(werte.length).toBeGreaterThan(0);
    expect(new Set(werte)).toEqual(new Set(["767.98"]));
  });

  /**
   * 767.98 und nicht 768: bei exakt 768px gelten sonst BEIDE Seiten und die
   * Reihenfolge im Stylesheet entscheidet, welche gewinnt.
   */
  it("hat keine 768px-`max-width`-Abfrage und keinen zweiten Breakpoint", () => {
    expect(OHNE_KOMMENTARE).not.toMatch(/\(max-width:\s*768px\)/);
    const minWerte = [...OHNE_KOMMENTARE.matchAll(/@media\s*\(min-width:\s*([\d.]+)px\)/g)].map(
      (m) => m[1],
    );
    for (const wert of minWerte) expect(wert).toBe("768");
  });

  it("hat einen 767.98px-Block, der Regeln enthaelt", () => {
    expect(MEDIA_767_BLOECKE.length).toBeGreaterThan(0);
    expect(MEDIA_767_BLOECKE.some((b) => /\{/.test(b))).toBe(true);
  });
});

describe("files.css — Umschaltung Tabelle/Kartenliste gegen antd", () => {
  const umschaltRegeln = REGELN.filter((r) => /\.nur(Desktop|Mobil)\b/.test(r.selektor));

  it("hat beide Umschaltklassen, in Basis UND Medienabfrage", () => {
    expect(umschaltRegeln.length).toBeGreaterThanOrEqual(4);
    for (const klasse of [".nurDesktop", ".nurMobil"]) {
      expect(
        REGELN_MEDIA.some((r) => r.selektor.includes(klasse)),
        `${klasse} fehlt in einem 767.98px-Block`,
      ).toBe(true);
      expect(
        REGELN_BASIS.some((r) => r.selektor.includes(klasse)),
        `${klasse} fehlt in der Basisregel`,
      ).toBe(true);
    }
  });

  /**
   * Und die Umschaltung muss auch WIRKEN, nicht nur dastehen: die beiden Klassen
   * tragen in Basis und Medienabfrage GEGENSAETZLICHE `display`-Werte. Ohne
   * diesen Fall waeren vier Regeln mit demselben Wert gruen — und beide
   * Darstellungen gleichzeitig sichtbar.
   */
  it("kehrt `display` zwischen Basis und Medienabfrage um", () => {
    const wert = (regeln: { selektor: string; rumpf: string }[], klasse: string) =>
      regeln.find((r) => r.selektor.includes(klasse))?.rumpf.match(/display:\s*([a-z-]+)/)?.[1];
    expect(wert(REGELN_BASIS, ".nurDesktop")).not.toBe("none");
    expect(wert(REGELN_MEDIA, ".nurDesktop")).toBe("none");
    expect(wert(REGELN_BASIS, ".nurMobil")).toBe("none");
    expect(wert(REGELN_MEDIA, ".nurMobil")).not.toBe("none");
  });

  /**
   * DER VORANGESTELLTE `.fi-*` IST DER GANZE PUNKT DIESER REGEL.
   *
   * `.nurDesktop` allein ist (0,1,0) — genau so viel wie antds
   * `.ant-table-wrapper`. Bei Gleichstand entscheidet die Dokumentreihenfolge,
   * und antds Stylesheet kommt SPAETER: die Regel matcht und verliert trotzdem
   * (im Repo dreimal passiert, `docs/design/README.md` Falle 5).
   * `.fi-liste .nurDesktop` ist (0,2,0) und schlaegt antd unabhaengig von der
   * Reihenfolge.
   *
   * Die Pruefung ist als POSITIVFORM gebaut („jeder Selektor sieht so aus"),
   * nicht als Suche nach `.ant-` — im eigenen Selektor steht `.ant-` gar nicht,
   * eine solche Suche faende hier nichts und waere immer gruen. Die Form
   * schliesst zwei Mutationen aus: `.nurDesktop` (Praefix weg) und
   * `.nurDesktop .fi-liste` (eigene Klasse hinten, Spezifitaet gleich,
   * Wirkung anders).
   */
  it("stellt jeder Umschaltklasse eine eigene Klasse VORAN — nie bar, nie hinten", () => {
    expect(umschaltRegeln.length).toBeGreaterThan(0);
    for (const regel of umschaltRegeln) {
      for (const teil of regel.selektor.split(",").map((t) => t.trim())) {
        if (!/\.nur(Desktop|Mobil)\b/.test(teil)) continue;
        expect(
          teil,
          `Selektor "${teil}" muss genau eine eigene Klasse VORANSTELLEN ` +
            `(Form: \`.fi-… .nurDesktop\`). Die Regel gehoert T18 und dieser Datei — ` +
            `wer eine Umschaltklasse anders braucht, aendert nicht hier, sondern legt ` +
            `sie komponentenlokal in ein *.module.css (Plan §1 Festlegung C).`,
        ).toMatch(/^\.fi-[a-z0-9-]+ \.nur(Desktop|Mobil)$/);
      }
    }
  });

  /**
   * DIE FORM DES SELEKTORS IST NICHT SEINE IDENTITAET — und ein Paar, dessen
   * Haelften auf VERSCHIEDENE Praefixe zeigen, ist kein Paar.
   *
   * GEMESSEN: im 767.98px-Block `.fi-liste` → `.fi-list` gedreht (Tippfehler in
   * nur EINER Haelfte) und alle Faelle oben blieben gruen — beide Selektoren
   * erfuellen die Form, beide Haelften enthalten je eine Regel je Klasse, und die
   * `display`-Werte sind weiter gegensaetzlich. Im Browser matcht der Medienblock
   * dann NICHTS: bei 390px bleibt die Tabelle sichtbar und die Kartenliste
   * versteckt — genau das Bild, gegen das diese Regel steht. Gefunden haette es
   * erst `e2e/files-mobil.spec.ts` (T48), fuenf Wellen spaeter.
   *
   * Geprueft wird MENGENGLEICHHEIT der Umschaltselektoren, nicht „es gibt genau
   * einen Praefix": das faengt den Tippfehler genauso, laesst aber einen zweiten
   * Umschaltbehaelter zu, SOLANGE beide Haelften ihn tragen. Die Nicht-Leerheit
   * steht davor, weil ∅ === ∅ gruen waere.
   */
  it("nennt in Basis und Medienabfrage DIESELBEN Umschaltselektoren", () => {
    const umschaltTeile = (regeln: { selektor: string }[]) => [
      ...new Set(
        regeln.flatMap((r) =>
          r.selektor
            .split(",")
            .map((t) => t.trim())
            .filter((t) => /\.nur(Desktop|Mobil)\b/.test(t)),
        ),
      ),
    ].sort();
    const basis = umschaltTeile(REGELN_BASIS);
    expect(basis.length, "keine Umschaltregel in der Basis gefunden").toBeGreaterThan(0);
    expect(
      umschaltTeile(REGELN_MEDIA),
      "Basis und Medienabfrage muessen DENSELBEN Praefix tragen — sonst matcht " +
        "eine Haelfte nichts und die Umschaltung fehlt an genau einer Breite",
    ).toEqual(basis);
  });

  /**
   * GESCHLOSSENE POSITIVFORM UEBER JEDEN SELEKTOR DER DATEI — die Zusage lautet
   * „JEDE Regel, die eine `.ant-`-Klasse ueberstimmt, traegt eine vorangestellte
   * eigene Klasse", der Fall oben prueft aber nur die vier heutigen
   * Umschaltregeln.
   *
   * GEMESSEN (Zuwachs statt Kippen): `.ant-table-wrapper { display: none; }` und
   * `.nurTablet { display: none; }` angehaengt → alle Faelle oben blieben gruen.
   * Diese Datei ist das EINZIGE globale Stylesheet des Moduls; eine bare
   * `.ant-…`-Regel darin ist der Gleichstand-Fall aus Falle 5, der still verliert.
   *
   * Ueber `ALLE_REGELN` und nicht `REGELN`: eine Regel in einem anderen At-Block
   * (etwa dem erlaubten `min-width: 768px`) steht in `REGELN` gar nicht — auch das
   * gemessen, siehe Kommentar an `ALLE_REGELN`.
   */
  it("laesst keinen Selektor ohne eigenen Praefix durch — auch keinen neuen", () => {
    expect(ALLE_REGELN.length).toBeGreaterThan(0);
    for (const regel of ALLE_REGELN) {
      for (const teil of regel.selektor.split(",").map((t) => t.trim())) {
        expect(
          teil,
          `Selektor "${teil}": files.css ist GLOBAL — jede Regel beginnt mit ` +
            `\`.fi-…\` oder \`:root\`. Komponentenlokales CSS gehoert in ein ` +
            `*.module.css neben seine Komponente (Plan §1 Festlegung C); eine bare ` +
            `\`.ant-…\`-Regel hier verliert gegen antd still (Falle 5).`,
        ).toMatch(/^(:root|\.fi-[a-z0-9-]+)/);
      }
    }
  });

  /**
   * Ohne Kommentar entfernt die naechste Aufraeumrunde den Praefix als
   * vermeintlichen Ballast — und baut damit den Defekt wieder ein, gegen den
   * die Regel steht (`docs/design/README.md`, „Und die Erhoehung kommentieren").
   * Deshalb wird der Kommentar hier VERLANGT, im ROHTEXT.
   */
  it("begruendet die Spezifitaets-Erhoehung im Kommentar", () => {
    const kommentare = [...ROH.matchAll(/\/\*[\s\S]*?\*\//g)].map((m) => m[0]);
    const treffer = kommentare.filter(
      (k) => /Spezifit/i.test(k) && /\.fi-/.test(k) && /ant-/.test(k),
    );
    expect(
      treffer.length,
      "kein Kommentar erklaert die vorangestellte Klasse gegen antds Spezifitaet",
    ).toBeGreaterThan(0);
  });

  it("kommt ohne `!important` aus", () => {
    expect(OHNE_KOMMENTARE).not.toMatch(/!\s*important/);
  });
});

describe("files.css — Hell/Dunkel", () => {
  const hell = rumpfVon((s) => s.includes(":root") && !s.includes('data-theme="dark"'));
  const dunkel = rumpfVon((s) => s.includes('[data-theme="dark"]'));

  it("deklariert `--fi-*` auf `:root`", () => {
    expect(varNamen(hell).size).toBeGreaterThan(0);
  });

  /**
   * Und zwar auf dem NACKTEN `:root`, nicht nur auf `:root[data-theme="light"]`.
   * Der `hell`-Filter oben akzeptiert jeden Selektor, der `:root` als Teilstring
   * enthaelt — GEMESSEN: das nackte `:root` gestrichen und der Fall blieb gruen.
   * Die Datei begruendet den Rueckfall im Kopf selbst („damit ein Kontext ohne
   * Attribut nicht ohne Farben dasteht"); bewacht war er nicht. Heute setzt
   * `src/app/layout.tsx` `data-theme` immer, der Rueckfall ist also eine Zusage
   * fuer den Kontext, der es nicht tut — genau die Art Zusage, die niemand
   * vermisst, bis sie fehlt.
   */
  it("legt die Hellwerte zusaetzlich auf das nackte `:root`", () => {
    const nackt = REGELN_BASIS.some((r) =>
      r.selektor
        .split(",")
        .map((t) => t.trim())
        .includes(":root"),
    );
    expect(
      nackt,
      "die Hellwerte brauchen zusaetzlich das nackte `:root` (Rueckfall ohne data-theme)",
    ).toBe(true);
  });

  /**
   * Parität JE VARIABLE, nicht „ein Dunkelblock existiert": ein vergessener
   * Wert im Dunkelmodus faellt sonst erst auf, wenn jemand nachts hinsieht.
   */
  it("fuehrt jede `--fi-*`-Variable auch unter `:root[data-theme=\"dark\"]`", () => {
    const hellNamen = [...varNamen(hell)].sort();
    const dunkelNamen = [...varNamen(dunkel)].sort();
    expect(dunkelNamen).toEqual(hellNamen);
  });

  /**
   * Die Suite hat einen UMSCHALTER (Cookie `iuk-theme-pref`, `<html data-theme>`).
   * Auf `prefers-color-scheme` zu selektieren bricht den Fall „System dunkel,
   * Umschalter hell" — und zwar still.
   */
  it("selektiert nirgends auf `prefers-color-scheme`", () => {
    expect(OHNE_KOMMENTARE).not.toMatch(/prefers-color-scheme/);
  });

  /**
   * `--ant-*` werden auf antds Scope-Klasse deklariert, nicht auf `:root`.
   * Eigenes Markup sieht sie nie, und der Fehler ist still: die Haarlinie
   * verschwindet einfach. In dieser Datei stehen deshalb nur `--fi-*`.
   */
  it("verwendet in eigenem Markup keine `--ant-*`-Variablen", () => {
    expect(OHNE_KOMMENTARE).not.toMatch(/var\(\s*--ant-/);
  });
});
