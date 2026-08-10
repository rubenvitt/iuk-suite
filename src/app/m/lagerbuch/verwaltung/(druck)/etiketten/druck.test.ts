import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import {
  ETIKETT_BREITE_MM, ETIKETT_HOEHE_MM, ETIKETT_QR_MM, ETIKETT_PADDING_MM,
  ETIKETT_SPALT_MM, BOGEN_GAP_BILDSCHIRM_MM, BOGEN_GAP_DRUCK_MM,
  SEITENRAND_MM, ETIKETT_ABGEWAEHLT_OPAZITAET, mm,
} from "@/app/m/lagerbuch/_lib/etikettMasse";

/**
 * DER SCAN AUF `verwaltung/(druck)/druck.css` UND DIE ROUTE-GROUP-GRENZEN
 * (Spec §8.4, §6.10.2, Festlegung F3 aus Teil 1).
 *
 * DREI RULINGS AUS `.superpowers/sdd/2026-08-03-lagerbuch-modul-teil6/entscheidungen.md`
 * UEBERSCHREIBEN DEN BRIEF (bindend, Koordinator/Betreiber 10.08.2026):
 *
 * A4 — Der Shell-Scan auf `layout.tsx` (Modulwurzel) liest ueber `ohneKommentare(...)`.
 *      Roh geprueft waere er garantiert rot: `layout.tsx:8` schreibt im KOMMENTAR
 *      „KEINE Shell, KEIN Rahmen …", die Datei tut inhaltlich das Richtige.
 *
 * A5 — Die `max-width`-Zusicherung (jede Deklaration muss 767.98px sein) entfaellt HIER
 *      ERSATZLOS. Sie traefe Layout-Obergrenzen (`_ui/helfer.module.css:69,165`,
 *      ausdruecklich „kein Breakpoint") statt Breakpoints. Die korrekte, auf
 *      `@media`-Praeludien beschraenkte Fassung existiert bereits und deckt ueber
 *      `cssDateien()` auch `(druck)/druck.css` mit ab:
 *      `_lib/bauform.test.ts:659-683`.
 *
 * A12 — Die Zusicherung „`_ui/helfer.module.css` traegt GAR KEINE Media Query" entfaellt
 *      HIER EBENFALLS ERSATZLOS. `helfer.module.css:336` traegt bewusst EINE:
 *      `@media (prefers-reduced-motion: reduce)` — und `_lib/bauform.test.ts:612-623`
 *      VERLANGT diese Zeile ausdruecklich als die eine zulaessige Ausnahme zu „NULL Media
 *      Queries" (§2 Punkt 16, der Constraint zielt auf BREITEN-Abfragen). Ein roher
 *      `not.toMatch(/@media/)`-Scan haette dem widersprochen — zwei Tests desselben Repos,
 *      die sich gegenseitig rot faerben. Die korrekte enge Fassung (nur `@media (max-width`
 *      ist verboten) existiert bereits: `_lib/bauform.test.ts:651-656`.
 *
 * VIERTER FUND, IM REVIEW (Koordinator, 10.08.2026, nach dem ersten Commit dieser Datei):
 * das Negativpaar `not.toContain("isModuleAdmin")` / `not.toContain("user.isAdmin")` im
 * Riegel-Block unten war ein STRIKT SCHWAECHERES DUPLIKAT von `_lib/bauform.test.ts:181`
 * (kein `isAdmin`) und `:201-203` (keiner der vier Suite-Admin-Riegel, darunter
 * `isModuleAdmin`) — beide halten die Aussage MODULWEIT und ueber `ohneKommentare(...)`,
 * decken also auch diese Datei ab. Eine Kopie hier koennte nie ausloesen, ohne dass dort
 * schon rot waere (Praezedenzfall fuer das Streichen einer solchen Kopie: T87,
 * `bauform.test.ts:304-308`, „Regel 4, Abweichung vom abgedruckten Testkoerper"). Entfaellt
 * hier ERSATZLOS. Fundort: `_lib/bauform.test.ts:181, :201-203`.
 *
 * Derselbe Review-Durchgang deckte auf, dass der POSITIVE Teil desselben Blocks blind war:
 * `toContain("requireLagerbuchAdmin")` erfuellt schon ein blosser Import ODER ein
 * Kommentar, der den Namen woertlich nennt (`(arbeit)/layout.tsx:12` tut genau das) — die
 * Mutation „Aufruf entfernen, Import/Kommentar stehen lassen" bliebe unbemerkt. Repariert
 * nach demselben Muster wie `_lib/bauform.test.ts:281,311` („gemessen: mit
 * `/istLagerbuchAdmin/` gruen, mit `/istLagerbuchAdmin\s*\(/` rot"): `ohneKommentare(...)`
 * UND ein Muster mit `(` am Ende. Siehe die Gegenprobe-Ergaenzung in `task-161-report.md`.
 */

const MODUL = join(__dirname, "..", "..", "..");          // src/app/m/lagerbuch
const DRUCK_CSS = join(__dirname, "..", "druck.css");     // (druck)/druck.css
const css = () => readFileSync(DRUCK_CSS, "utf8");

/** Alle .css unter dem Modulbaum — NICHT nur die .module.css. Ein Scan ueber
 *  `_ui/*.module.css` liesse ausgerechnet druck.css aus und waere gruen und
 *  blind (§6.10.2 Punkt 4, Festlegung J11). */
function alleCss(dir = MODUL, treffer: string[] = []): string[] {
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) alleCss(p, treffer);
    else if (e.endsWith(".css")) treffer.push(p);
  }
  return treffer;
}

/**
 * Kopie von `ohneKommentare()` aus `_lib/bauform.test.ts` (byte-identisch, ebenso
 * kopiert in `_lib/pwaIcons.test.ts:19-39`). `bauform.test.ts` exportiert die
 * Funktion nicht, und dieser Testkoerper ist eigenstaendig — deshalb die lokale
 * Kopie statt eines Re-Exports (A4).
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

describe("druck.css — die Regel steht da (§8.5, §6.10.2)", () => {
  /**
   * DIESER SCAN HAELT DIE AUSSAGE „die Regel steht da", NIE „sie wirkt".
   * `pnpm build` und Vitest sehen @media print gar nicht; Playwright rendert per
   * Vorgabe fuer den Bildschirm. Die Wirkung belegt T167 mit
   * page.emulateMedia({ media: "print" }), das Papier belegt der Probebogen (R30).
   */
  it("traegt @page mit dem Seitenrand aus etikettMasse", () => {
    expect(ohneKommentare(css())).toMatch(
      new RegExp(`@page\\s*\\{[^}]*margin:\\s*${SEITENRAND_MM}mm`),
    );
  });

  it("traegt einen @media print-Block", () => {
    expect(ohneKommentare(css())).toMatch(/@media\s+print\s*\{/);
  });

  it("versteckt .lb-nichtDrucken im Druck", () => {
    const block = /@media\s+print\s*\{([\s\S]*)\n\}/.exec(ohneKommentare(css()));
    expect(block, "kein @media print-Block").not.toBeNull();
    expect(block![1]).toMatch(/\.lb-nichtDrucken\s*\{[^}]*display:\s*none/);
  });

  /**
   * FALLE 43 — DIE ZEILE, WEGEN DER DIESER SCAN EXISTIERT.
   *
   * globals.css:277 schaltet heute mit `body * { visibility: hidden }` ALLES
   * unsichtbar. CSS Modules schreiben ausschliesslich KLASSENselektoren um:
   * `body *` bliebe global und leerte JEDE andere Druckseite der Suite — den
   * feedback-Aushang und die files-Zugangslinks. Die Sichtbarkeitsumkehr wird
   * ersatzlos durch die eigene Route-Gruppe ersetzt: ohne Shell gibt es nichts
   * auszublenden.
   *
   * Der zweite Teil des Problems faellt damit auch: `Layout{minHeight:100vh}`
   * (FullShell.tsx:19) bliebe unter `visibility:hidden` im FLUSS und erzeugte
   * leere Folgeseiten hinter dem Bogen.
   */
  it("enthaelt NIRGENDS body * — in keiner CSS-Datei des Moduls", () => {
    for (const datei of alleCss()) {
      const rein = ohneKommentare(readFileSync(datei, "utf8"));
      expect(rein, datei).not.toMatch(/body\s*\*/);
      expect(rein, datei).not.toMatch(/visibility:\s*hidden/);
    }
  });

  /**
   * `print-color-adjust: exact` ist Pflicht: ohne sie schluckt der Browser
   * Flaechen — er faengt beim Sparen von Farbe genau bei grossen und bei kleinen
   * an. Der QR waere dann ein grauer Kasten.
   */
  it("verbietet dem Browser die Farbsparrechnung", () => {
    const rein = ohneKommentare(css());
    expect(rein).toContain("-webkit-print-color-adjust: exact");
    expect(rein).toContain("print-color-adjust: exact");
  });

  /**
   * EIN BLATT PAPIER HAT KEINEN DUNKELMODUS — und die Werte sind LITERALE, kein
   * `--ant-*`: antd deklariert seine Variablen auf der Scope-Klasse SEINER
   * Komponenten (Falle 2), auf eigenem Markup waeren sie still leer. Ohne diese
   * Festlegung druckt ein Bogen aus einer dunkel eingestellten Sitzung weisse
   * Schrift auf weisses Papier, und print-color-adjust:exact verbietet dem
   * Browser jede Notrechnung — es kaeme nur der QR-Kasten heraus.
   */
  it("nagelt Papier auf #fff und Schrift auf #000", () => {
    const rein = ohneKommentare(css());
    expect(rein).toMatch(/\.lb-etikettbogen\s*\{[^}]*background:\s*#ffffff/);
    expect(rein).toMatch(/\.lb-etikettbogen\s*\{[^}]*color:\s*#000000/);
  });

  it("benutzt keine --ant-Variable", () => {
    expect(ohneKommentare(css())).not.toContain("--ant-");
  });

  /** §8.4: das Druck-CSS greift NIE auf `input` und NIE auf `.ant-*`. Eine Regel
   *  gegen einen antd-internen Klassennamen waere eine Kopplung, die ein
   *  antd-Major still bricht. */
  it("greift weder auf ein nacktes input noch auf .ant-", () => {
    const rein = ohneKommentare(css());
    expect(rein).not.toMatch(/(^|[\s,>])input\b/m);
    expect(rein).not.toContain(".ant-");
  });

  describe("die Millimeter stehen zeichengleich in beiden Welten", () => {
    it("Etikettmass, Innenabstand und Spalt", () => {
      const rein = ohneKommentare(css());
      expect(rein).toContain(`width: ${mm(ETIKETT_BREITE_MM)}`);
      expect(rein).toContain(`height: ${mm(ETIKETT_HOEHE_MM)}`);
      expect(rein).toContain(`padding: ${mm(ETIKETT_PADDING_MM)}`);
      expect(rein).toContain(`gap: ${mm(ETIKETT_SPALT_MM)}`);
      expect(rein).toContain(`repeat(auto-fill, ${mm(ETIKETT_BREITE_MM)})`);
    });

    /**
     * DER QR BRINGT NUR EINE viewBox MIT, KEINE BREITE/HOEHE (8-I, Punkt 2).
     * globals.css:25-28 faengt das heute nur fuer [data-testid="qr-display"] ab.
     * Ohne diese Regel faellt der Code auf die Ersatzgroesse des Browsers zurueck
     * und wird winzig — OHNE dass ein Test anschlaegt.
     */
    it("gibt dem eingesetzten SVG eine Kante", () => {
      const rein = ohneKommentare(css());
      const regel = /\.lb-etikettQr\s*>\s*svg\s*\{([^}]*)\}/.exec(rein);
      expect(regel, "keine Groessenregel fuer das eingesetzte SVG").not.toBeNull();
      expect(regel![1]).toContain(`width: ${mm(ETIKETT_QR_MM)}`);
      expect(regel![1]).toContain(`height: ${mm(ETIKETT_QR_MM)}`);
      expect(regel![1]).toMatch(/display:\s*block/);
    });

    /**
     * `flex: none` GEHOERT AN DEN UMSCHLAG, NICHT AN DAS SVG. Flexbox wirkt auf
     * die FLEX-ITEMS — das ist `.lb-etikettQr`, nicht sein Kind. Im Bestand war
     * das <img> selbst das Item (globals.css:268), deshalb sass es dort richtig.
     * Steht es am SVG, draengt ein langer Artikelname den QR unter 20mm.
     */
    it("haelt den QR-Umschlag am Schrumpfen", () => {
      const rein = ohneKommentare(css());
      const umschlag = /\.lb-etikettQr\s*\{([^}]*)\}/.exec(rein);
      expect(umschlag, "keine Regel auf .lb-etikettQr selbst").not.toBeNull();
      expect(umschlag![1]).toMatch(/flex:\s*none/);
    });

    /**
     * `display: block` AUF BEIDEN TEXTKLASSEN IST PFLICHT. `.lb-etikettText` ist
     * ein Flex-Item, aber selbst ein gewoehnlicher Block — seine Kinder blieben
     * sonst INLINE. Zwei Folgen auf einem 48,5 x 25,4 mm grossen Etikett: Titel
     * und Unterzeile stuenden NEBENEINANDER, und `text-overflow: ellipsis`
     * waere wirkungslos, weil die Eigenschaft bei nicht ersetzten
     * Inline-Elementen nicht greift.
     */
    it("stapelt Titel und Unterzeile", () => {
      const rein = ohneKommentare(css());
      for (const klasse of ["lb-etikettTitel", "lb-etikettSub"]) {
        const regel = new RegExp(`\\.${klasse}\\s*\\{([^}]*)\\}`).exec(rein);
        expect(regel, klasse).not.toBeNull();
        expect(regel![1], klasse).toMatch(/display:\s*block/);
      }
    });

    /**
     * DIE HEIKELSTE ZEILE DER GEOMETRIETABELLE: 2mm am Bildschirm, 0 im Druck.
     * Wer nur die Bildschirmansicht portiert, uebernimmt das falsche Raster und
     * merkt es erst am Drucker.
     */
    it("setzt den Bogenabstand am Bildschirm und im Druck verschieden", () => {
      const rein = ohneKommentare(css());
      const druck = /@media\s+print\s*\{([\s\S]*)\n\}/.exec(rein)![1];
      const bildschirm = rein.slice(0, rein.indexOf("@media"));
      expect(bildschirm).toMatch(
        new RegExp(`\\.lb-etikettbogen\\s*\\{[^}]*gap:\\s*${mm(BOGEN_GAP_BILDSCHIRM_MM)}`),
      );
      expect(druck).toMatch(
        new RegExp(`\\.lb-etikettbogen\\s*\\{[^}]*gap:\\s*${BOGEN_GAP_DRUCK_MM}`),
      );
    });

    /** Abgewaehlt: am Bildschirm blass, im Druck WEG. `opacity: 0` liesse den
     *  Platz stehen und verschoebe alles Folgende um eine Kachel. */
    it("blendet abgewaehlte Kacheln im Druck aus statt sie blass zu machen", () => {
      const rein = ohneKommentare(css());
      const druck = /@media\s+print\s*\{([\s\S]*)\n\}/.exec(rein)![1];
      const bildschirm = rein.slice(0, rein.indexOf("@media"));
      expect(bildschirm).toMatch(
        new RegExp(`\\.lb-etikettAbgewaehlt\\s*\\{[^}]*opacity:\\s*${ETIKETT_ABGEWAEHLT_OPAZITAET}`),
      );
      expect(druck).toMatch(/\.lb-etikettAbgewaehlt\s*\{[^}]*display:\s*none/);
    });
  });
});

describe("Modulweite CSS-Zusicherungen (§12.2, §6.10.2 Punkt 4)", () => {
  /** ES BLEIBT BEI EINEM @media print, und es steht in (druck)/druck.css. */
  it("hat genau eine Datei mit @media print", () => {
    const treffer = alleCss().filter((d) =>
      /@media\s+print/.test(ohneKommentare(readFileSync(d, "utf8"))),
    );
    expect(treffer.map((d) => d.replace(MODUL, ""))).toEqual([
      DRUCK_CSS.replace(MODUL, ""),
    ]);
  });

  // A5: die `max-width`-Zusicherung entfaellt HIER ERSATZLOS. Die richtige,
  // auf `@media`-Praeludien beschraenkte Fassung steht bereits in
  // `_lib/bauform.test.ts:659-683` und deckt ueber `cssDateien()` auch
  // `(druck)/druck.css` mit ab.

  // A12: die Zusicherung „helfer.module.css ohne jede Media Query" entfaellt
  // HIER EBENFALLS ERSATZLOS — sie widerspraeche `_lib/bauform.test.ts:612-623`
  // (die dort geforderte `prefers-reduced-motion`-Ausnahme). Die korrekte enge
  // Fassung (kein `@media (max-width`) steht bereits in
  // `_lib/bauform.test.ts:651-656`.
});

describe("Die Route-Gruppen belegen keinen Pfad doppelt (§8.4, Auflage 2)", () => {
  /**
   * ZWEI ROUTE-GRUPPEN DUERFEN DENSELBEN AUFGELOESTEN PFAD NICHT DOPPELT
   * BELEGEN — dieselbe Einschraenkung, die src/app/m/feedback/(print)/layout.tsx
   * in ihrem Kopf ausschreibt. `(arbeit)/etiketten/` und `(druck)/etiketten/`
   * loesten beide auf /verwaltung/etiketten auf; Next bricht dann beim Bau ab,
   * aber erst, wenn beide da sind — und in einem Plan mit 24 Tasks ist das eine
   * halbe Sitzung spaeter.
   */
  it("hat kein verwaltung/(arbeit)/etiketten/", () => {
    const arbeit = join(MODUL, "verwaltung", "(arbeit)");
    expect(readdirSync(arbeit)).not.toContain("etiketten");
  });

  /** §8.4, Auflage 2 zweiter Teil: weder das Modul-Layout noch ein
   *  verwaltung/layout.tsx darf existieren und die Shell mounten. Ein Layout
   *  ohne Gruppenklammer ist Vorfahr ALLER Kinder, auch der Gruppe (druck) — die
   *  Shell waere dann wieder da und die ganze Entscheidung liefe leer. */
  it("hat kein verwaltung/layout.tsx", () => {
    expect(readdirSync(join(MODUL, "verwaltung"))).not.toContain("layout.tsx");
  });

  // A4: der Rohtext von layout.tsx traegt den Satz „KEINE Shell, KEIN Rahmen …"
  // woertlich in seinem eigenen KOPFKOMMENTAR (layout.tsx:8) — ein roher Scan
  // waere an seiner eigenen Begruendung rot. Der Scan liest deshalb ueber
  // `ohneKommentare(...)`.
  it("mountet im Modul-Layout keine Shell", () => {
    const wurzel = ohneKommentare(readFileSync(join(MODUL, "layout.tsx"), "utf8"));
    expect(wurzel).not.toContain("Shell");
    expect(wurzel).not.toContain("VerwaltungsRahmen");
  });
});

describe("Beide Group-Layouts rufen BEIDE Riegel (F3, §6.1.3)", () => {
  /**
   * ⚠️ DIESER SCAN IST NICHT DIE ZUSICHERUNG, SONDERN NUR IHR BILLIGSTER TEIL.
   * Die tragende Zusicherung ist ein ABRUF: /verwaltung/etiketten OHNE
   * Lagerbuch-Gruppe muss dieselbe Antwort geben wie /verwaltung/artikel ohne
   * Gruppe (T167 Schritt 6, T175). Ein Quelltext-Scan sieht die Kopplung
   * zwischen zwei Layouts nicht — er sieht nur, dass die Zeile dasteht.
   *
   * Er steht trotzdem hier, weil er den haeufigsten Weg abschneidet, auf dem die
   * Zeile verschwindet: jemand raeumt „doppelten" Code auf.
   */
  it.each(["(arbeit)", "(druck)"])("%s/layout.tsx riegelt Host UND Gruppe", (gruppe) => {
    /**
     * ⚠️ DER POSITIVE NACHWEIS HAENGT AM `(`, NICHT AM NAMEN — sonst genuegt
     * schon ein Import oder ein Kommentar, der den Namen woertlich nennt.
     * `(arbeit)/layout.tsx:12` tut genau das: der Begruendungskommentar dort
     * schreibt „requireLagerbuchAdmin" woertlich aus. Ein Muster ohne `(`
     * bliebe deshalb selbst dann gruen, wenn Aufruf UND Import verschwaenden —
     * der Zweig, der die Kopplung zwischen den beiden Layouts bewachen soll,
     * waere vollstaendig blind. Gelesen wird zusaetzlich ueber
     * `ohneKommentare(...)`, sonst haelt der Kommentar allein den Match am
     * Leben. Beide Haelften sind Pflicht (Praezedenzfall gemessen in
     * `_lib/bauform.test.ts:281,311`).
     *
     * Das Negativpaar gegen `isModuleAdmin`/`user.isAdmin` ENTFAELLT hier
     * ersatzlos — siehe Kopfkommentar dieser Datei, Fundort
     * `_lib/bauform.test.ts:181, :201-203`.
     */
    const quelle = ohneKommentare(
      readFileSync(join(MODUL, "verwaltung", gruppe, "layout.tsx"), "utf8"),
    );
    expect(quelle).toMatch(/\brequireLagerbuchHost\s*\(/);
    expect(quelle).toMatch(/\bawait\s+requireLagerbuchAdmin\s*\(/);
  });
});
