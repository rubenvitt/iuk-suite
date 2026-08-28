// src/app/m/radio/_ui/verwaltung-css.test.ts
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { ohneKommentare } from "../_lib/quelltextScan";

/**
 * DER WAECHTER DES VERWALTUNGS-STYLESHEETS.
 *
 * ⛔ WARUM ES DIESE DATEI GIBT: `_ui/verwaltung.module.css` traegt in seinem Kopf DREI
 * ⛔-Zusicherungen (`_ui/verwaltung.module.css:8-20`) — „eigene Klassen, nie `--ant-*`",
 * „keine Flaechen- und keine Fliesztextfarbe" und „keine Hoehe" —, und bis zur Fix-Runde 1
 * zu V12 hatte KEINE davon eine Mutation, die sie rot macht. Gemessen in
 * `.superpowers/sdd/planteil4/REVIEW-V12.md`, Fund F2: `s.veralteteListe` verschrieben,
 * `var(--iuk-linie)` auf `var(--ant-color-border)` gedreht und ein `color: #cf1322`
 * eingesetzt — jedes Mal `Test Files 56/57 passed`, kein Fall rot. ⛔ Das ist die Klasse aus
 * Ruling **R-V11-1** (`.superpowers/sdd/planteil4/progress.md`): „Wer eine Zusicherung ueber
 * dem Bestand schreibt, schuldet die Mutation, die sie rot macht — oder die Sonde daneben."
 *
 * ⛔ DAS SCHWESTERBLATT FUEHRT DENSELBEN WAECHTER SEIT PLANTEIL 3, und sein Kommentar hat
 * diesen Fall woertlich vorhergesagt: `_ui/AusleihRahmen.test.tsx:42-45` („Eine gemeinsame
 * Liste waere in dem Moment rot-by-construction, in dem A19/A20 eine Flaeche mit einem
 * zweiten Modul-Stylesheet anlegen"). Der Klassenscan dort ist `:231-246`; dieser hier ist
 * seine zweite abgeleitete Menge, kein Umbau der ersten.
 *
 * ⚠️ WAS DIESE DATEI NICHT UEBERNIMMT: den Falle-4-Scan auf `size=`. Der laeuft schon ueber
 * JEDE `.tsx` des Moduls (`_ui/AusleihRahmen.test.tsx:210-214`) und deckt
 * `admin/(arbeit)/page.tsx` damit bereits ab. Eine zweite Kopie waere die handgepflegte
 * Doppelung, gegen die R-V11-1 steht. Hier gehoert nur, was im STYLESHEET steht.
 *
 * ⚠️ UND WAS SIE STRUKTURELL NICHT SEHEN KANN: ob eine Regel gegen antds cssinjs-Regeln
 * ueberhaupt durchkommt (Falle 5) und wie die Flaeche in beiden Farbmodi AUSSIEHT. Das ist
 * der Browserlauf, ⬜ Eigentuemer V23.
 */

const MODUL = "src/app/m/radio";
const STYLESHEET = "src/app/m/radio/_ui/verwaltung.module.css";

/**
 * ⛔ DIE UNTERGRENZE DES WALKERS, NICHT DER LESERLISTE. `toEqual([])` ueber einer leeren
 * Dateimenge waere leer-gruen — ein Walker, der nur die obersten Ebenen laeuft, faende die
 * Seite unter `admin/(arbeit)/` nie. Gemessen am 2026-08-25, mit DIESEM Walker und nicht mit
 * einem aehnlichen `find`: `quellDateien(MODUL).length` → **67** (`.css` faellt durch den
 * Endungsfilter, `.test.`/`.spec.` durch den Namensfilter). Die Zahl ist bewusst KEINE
 * exakte (R-V11-1, Auflage 1) — sie belegt nur, dass der Baum gelesen wurde.
 */
const MODUL_DATEIEN_MINDESTENS = 60;

/**
 * Jede ausgelieferte Quelldatei unter einem Verzeichnis — Testdateien ausgenommen.
 *
 * ⛔ OHNE VERZEICHNISAUSNAHME (Ruling **R-V11-3**): was nicht hineingehoert, entscheidet der
 * Endungs- und der Namensfilter am Blatt. Eine Ausnahme am Ast ist unsichtbar und waechst
 * mit dem Baum.
 */
function quellDateien(wurzel: string, treffer: string[] = []): string[] {
  for (const eintrag of readdirSync(wurzel)) {
    const pfad = join(wurzel, eintrag);
    if (statSync(pfad).isDirectory()) {
      quellDateien(pfad, treffer);
      continue;
    }
    if (!/\.tsx?$/.test(eintrag)) continue;
    if (/\.(?:test|spec)\.tsx?$/.test(eintrag)) continue;
    treffer.push(pfad);
  }
  return treffer;
}

/** Die Teilmenge, die GENAU DIESES Blatt zieht — heute eine Datei, ab V13 mehrere. */
function stylesheetLeser(): string[] {
  return quellDateien(MODUL).filter((pfad) =>
    /\bimport\s+s\s+from\s+["'][^"']*verwaltung\.module\.css["']/.test(
      ohneKommentare(readFileSync(pfad, "utf8")),
    ),
  );
}

/** Jeder `s.name`, den eine Flaeche nennt — ueber `ohneKommentare`, wie die Vorlage. */
function genutzteKlassen(pfad: string): string[] {
  const treffer = ohneKommentare(readFileSync(pfad, "utf8")).matchAll(
    /\bs\.([A-Za-z][A-Za-z0-9_]*)/g,
  );
  return [...new Set([...treffer].map((m) => m[1]!))];
}

/**
 * Jeder Klassenname, den das Blatt tatsaechlich DEKLARIERT.
 *
 * ⛔ UEBER `ohneKommentare` (`_lib/quelltextScan.ts:61`), nicht roh: roh gelesen gelten
 * Datei-Anker in Kommentaren als Deklaration — `\.([a-zA-Z]+)\s*(?=:)` passt auf das `.ts:`
 * in „…GeraeteListe.tsx:152". Gemessen am Schwesterblatt (Review K5): 28 roh gegen 24 echt.
 */
function deklarierteKlassen(): Set<string> {
  const treffer = ohneKommentare(readFileSync(STYLESHEET, "utf8")).matchAll(
    /\.([a-zA-Z][a-zA-Z0-9_]*)\s*(?=[,{:[])/g,
  );
  return new Set([...treffer].map((m) => m[1]!));
}

/** Das Blatt ohne seine Kommentare — sie nennen die verbotenen Werte selbst. */
function blatt(): string {
  return ohneKommentare(readFileSync(STYLESHEET, "utf8"));
}

describe("radio-verwaltung.module.css: die drei Zusicherungen seines Kopfes", () => {
  it("nennt nur Klassen, die verwaltung.module.css DEKLARIERT", () => {
    /*
     * Falle 2 in ihrer stillsten Gestalt: `s.tippfehler` ist `undefined`, das Element rendert
     * ohne Klasse, und weder `typecheck` noch `lint` noch `build` sagen ein Wort — die Linie
     * verschwindet einfach. Vorbild `_ui/AusleihRahmen.test.tsx:231-246`.
     */
    const gescannt = quellDateien(MODUL);
    expect(gescannt.length, "der Walker hat den Modulbaum nicht gelesen").toBeGreaterThanOrEqual(
      MODUL_DATEIEN_MINDESTENS,
    );
    const leser = stylesheetLeser();
    expect(leser.length, "leere Leserliste — der Scan waere leer-gruen").toBeGreaterThanOrEqual(1);
    const deklariert = deklarierteKlassen();
    const fehlend = leser.flatMap((pfad) =>
      genutzteKlassen(pfad)
        .filter((name) => !deklariert.has(name))
        .map((name) => `${pfad}: s.${name}`),
    );
    expect(fehlend).toEqual([]);
  });

  it("liest keine --ant-Variable, sondern nur die Suite-Variablen auf :root", () => {
    /*
     * ⛔ FALLE 2 (`CLAUDE.md:14-15`): antd deklariert seine Variablen auf SEINER Scope-Klasse,
     * eigenes Markup sieht sie nicht — und der Fehler ist STILL, die Regel steht richtig da
     * und die Linie verschwindet einfach. Lesbar sind allein die vier Suite-Variablen auf
     * `:root` (`src/app/globals.css:152-164`), die ihren Dunkelzweig selbst mittragen.
     *
     * ⛔ EINE PRAEFIXPRUEFUNG UND KEINE NAMENSLISTE: ein `var(--lb-rot)` aus dem Nachbarmodul
     * waere in `radio` genauso still wie ein `--ant-*`, und eine Aufzaehlung der vier Namen
     * veraltete mit der naechsten Variablen in `globals.css`.
     */
    const css = blatt();
    expect(css, "eine --ant-Variable ausserhalb von antds Scope (Falle 2)").not.toMatch(
      /var\(\s*--ant-/,
    );
    /*
     * ⛔ SEIT DEM 2026-08-28 IST DIE ZWEITE HAELFTE „--iuk- ODER IM BLATT SELBST DEKLARIERT"
     * (Betreiberentscheidung zur Zeichenfarbe): `--radio-zeichen-gruen` steht an
     * `.kennzahlKopf` und ist ein modul-eigener Wert, kein Griff in ein fremdes Blatt.
     * ⛔ UND DAS IST KEINE NAMENSAUSNAHME, SONDERN DIE SCHAERFERE FASSUNG: ein vertipptes
     * `var(--radio-zeichn-gruen)` ist NIRGENDS deklariert und wird hier rot — eine
     * Ausnahmeliste auf `--radio-` liesse es durch.
     */
    const eigene = new Set(
      [...css.matchAll(/(--[A-Za-z0-9_-]+)\s*:/g)].map((m) => m[1]!),
    );
    const fremde = [...css.matchAll(/var\(\s*(--[A-Za-z0-9_-]+)/g)]
      .map((m) => m[1]!)
      .filter((name) => !name.startsWith("--iuk-") && !eigene.has(name));
    expect([...new Set(fremde)], "weder --iuk- noch in diesem Blatt deklariert").toEqual([]);
  });

  it("verdrahtet keine Farbe ausser den zwei benannten Zeilen, und keine Hoehe", () => {
    /*
     * ⛔ FALLE 3 UND FALLE 4, beide als Textteil. Ein verdrahtetes `color: #000` waere in der
     * Dunkeldarstellung schwarz auf schwarz, und `build`, `typecheck` und Vitest saehen davon
     * nichts; eine feste Hoehe naehme der Flaeche die Bediendichte, die sie erbt
     * (`CLAUDE.md:18-22`, `_ui/RadioVerwaltungsRahmen.tsx:18-21`).
     *
     * ⚠️ FALLE 3 IST SEIT DEM 2026-08-28 FUER GENAU ZWEI ZEILEN AUFGEHOBEN (Hell- und
     * Dunkelwert der modul-eigenen Zeichenfarbe) — die Ausnahme steht unten als REGEX ueber
     * einer ZEILE, nicht als Ausnahme fuer diese Datei.
     *
     * ⚠️ ER FAENGT NICHT JEDES ROT: `color: red` steht als Schluesselwort da und faellt hier
     * durch die Wertpruefung, `background: url(...)` mit einem eingebetteten Ton nicht. Der
     * gerenderte Ton in beiden Farbmodi bleibt der Browserlauf (⬜ V23).
     */
    const css = blatt();
    /*
     * ⛔ DIE NAMENTLICHE AUSNAHME VOM 2026-08-28, UND SIE IST EINE ZEILENFORM UND KEINE
     * DATEIAUSNAHME: erlaubt ist ALLEIN die Deklaration einer modul-eigenen
     * `--radio-*`-Variablen mit einem Hexwert. Ein `color: #cf1322` an einer Klasse faellt
     * weiterhin durch, ebenso ein Hexwert an einer Flaeche. Grund: die vier Kennzahlzeichen
     * tragen seit dem 2026-08-28 Farbe (Betreiberentscheidung, Falle 3 fuer sie aufgehoben),
     * und die Suite kennt kein Gruen — Rot kommt aus `--iuk-marke`, Grau aus
     * `--iuk-gedaempft`, nur das Gruen ist modul-eigen.
     */
    const AUSNAHME = /^\s*--radio-[a-z0-9-]+:\s*#[0-9a-fA-F]{3,8};\s*$/;
    const zeilen = css.split("\n");
    const ausgenommen = zeilen.filter((zeile) => AUSNAHME.test(zeile));
    /*
     * ⛔ DIE GEGENPROBE ZUR AUSNAHME (R-V11-1): eine Ausnahme ohne Untergrenze ist ein
     * unbewachtes Loch, das aussieht wie eine Regel. Zwei Zeilen, weil jede modul-eigene
     * Variable einen Hell- UND einen Dunkelwert braucht — die Zuordnung dazu misst der
     * Block darunter.
     */
    expect(ausgenommen.length, "keine --radio-Variable mehr — die Ausnahme kann weg").toBe(2);
    expect(
      zeilen.filter((zeile) => !AUSNAHME.test(zeile)).join("\n").match(/#[0-9a-fA-F]{3,8}\b/g),
      "ein Farbwert im Stylesheet (Falle 3)",
    ).toBeNull();
    /*
     * ⛔ JEDE MODUL-EIGENE VARIABLE BRAUCHT EINEN DUNKELWERT, und der Ausfall waere STILL:
     * fehlte er, faerbte der Hellwert auch die Dunkeldarstellung — kein Gate saehe es, und
     * auf dem Bildschirm bliebe ein zu dunkles Gruen auf fast schwarzem Grund stehen.
     * ⛔ UEBER `:root[data-theme="dark"]`, NIE `prefers-color-scheme`: die Suite schaltet
     * ueber ein Cookie-Attribut (`core/theme/mode.ts:18-19`).
     */
    const dunkel = [...css.matchAll(/:root\[data-theme="dark"\][^{]*\{([^}]*)\}/g)]
      .map((m) => m[1]!)
      .join("\n");
    for (const name of new Set([...css.matchAll(/(--radio-[A-Za-z0-9-]+)\s*:/g)].map((m) => m[1]!))) {
      expect(dunkel, `${name} hat keinen Wert im Dunkelzweig`).toContain(`${name}:`);
    }
    const werte = [...css.matchAll(/(?:^|[\s;{])(?:background-color|background|color)\s*:\s*([^;}]+)/g)]
      .map((m) => m[1]!.trim())
      .filter((wert) => wert !== "inherit" && !/^var\(\s*--(?:iuk|radio)-/.test(wert));
    expect(werte, "eine verdrahtete Flaechen- oder Fliesztextfarbe").toEqual([]);
    expect(css, "eine feste Hoehe — 32 wird geerbt, nicht geschrieben (Falle 4)").not.toMatch(
      /(?:^|[\s;{])(?:min-|max-)?height\s*:/,
    );
  });
});
