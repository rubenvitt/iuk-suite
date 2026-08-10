// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import { mount, unmount, query, queryAll, exists, click } from "@/app/m/qr/_lib/test-dom";
import { Entnahme, type EntnahmeDetail } from "./Entnahme";

const QUELLE = "src/app/m/lagerbuch/_ui/Entnahme.tsx";
const STYLESHEET = "src/app/m/lagerbuch/_ui/helfer.module.css";

/**
 * Kopie von `ohneKommentare()` aus `_lib/bauform.test.ts` (Regel 1 / N-5 der
 * Regeldatei fuer Teil 4). Die drei Bauform-Scans unten lesen sonst den Rohtext
 * INKLUSIVE Kommentaren — und `Entnahme.tsx` traegt in seinem Kopfkommentar
 * woertlich `_actions/buchung.ts` (das ist die Begruendung, warum die Action als
 * PROP hereinkommt) und im `catch`-Zweig woertlich das Wort „catch". Ohne
 * diesen Filter waere der Negativ-Scan auf `_actions/buchung` auf seiner
 * EIGENEN Begruendung rot, und — gefaehrlicher — der Positiv-Scan auf das
 * `try`/`catch` waere FALSCH GRUEN: er bestuende auch dann noch, wenn jemand das
 * `try`/`catch` entfernte und nur den erklaerenden Kommentar stehen liesse.
 * `bauform.test.ts` exportiert die Funktion nicht, und dies ist ein anderer
 * Testkoerper — deshalb die lokale Kopie statt eines Re-Exports, wie schon in
 * `_lib/pwaIcons.test.ts`, `_lib/schreibpfade/tokenEinloesung.test.ts` und
 * `_ui/HelferChip.test.tsx`.
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
 * ⚠️ WARUM HIER NICHT `expect(className).not.toContain("undefined")` STEHT.
 *
 * Der Plan sichert §5.17 mit genau dieser Zeile zu. Unter Vitest kann sie fuer
 * die ECHTE Falle nie fehlschlagen: ein CSS-Modul ist dort ein Proxy, der fuer
 * JEDEN Schluessel eine Zeichenkette liefert (gemessen und dokumentiert in
 * `HelferChip.test.tsx:50-67`). Geprueft wird deshalb gegen das Stylesheet auf
 * der Festplatte — und zusaetzlich, dass es der RICHTIGE Ton ist: `ampelTon`
 * bildet `"gruen"` auf `"ok"` ab, und ein fest verdrahtetes `"ok"` an dieser
 * Stelle waere typkorrekt, gruen und im Regal falsch.
 *
 * Dieselbe Zerlegung wie `HelferChip.test.tsx:87-91`, damit ein Umschlagen der
 * Vitest-Namensform an EINER Stelle laut wird statt an zweien still.
 */
const CSS = readFileSync(STYLESHEET, "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
const DEKLARIERT = new Set((CSS.match(/\.[A-Za-z_][\w-]*/g) ?? []).map((t) => t.slice(1)));

/**
 * Die Deklarationen EINES Selektors aus `helfer.module.css`, als Map.
 *
 * Gelesen statt behauptet: der Riegel unten prueft, dass jede Eigenschaft, mit
 * der `.chip` einen ganzen Satz unlesbar macht, am Rueckmeldungselement
 * ueberschrieben ist — und zwar mit einem ANDEREN Wert als dem im Stylesheet.
 * Aendert T64 `.chip`, aendert sich die Vergleichsgrundlage mit.
 */
function regeln(selektor: string): Map<string, string> {
  const escaped = selektor.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const treffer = [...CSS.matchAll(new RegExp(`^${escaped}\\s*\\{([^}]*)\\}`, "gm"))];
  if (treffer.length !== 1) {
    throw new Error(`${selektor} steht ${treffer.length}× in ${STYLESHEET} — erwartet: genau 1×`);
  }
  return new Map(
    treffer[0][1]
      .split(";")
      .map((d) => d.trim())
      .filter(Boolean)
      .map((d) => {
        const i = d.indexOf(":");
        return [d.slice(0, i).trim(), d.slice(i + 1).trim()] as [string, string];
      }),
  );
}

/** `_ok_ef45c4` -> `ok`. Wirft, wenn die Vitest-Namensform sich aendert. */
function schluessel(el: HTMLElement): string[] {
  return el.className
    .trim()
    .split(/\s+/)
    .map((token) => {
      const m = /^_(.+)_[0-9a-f]+$/.exec(token);
      if (!m) throw new Error(`unerwartete Klassenform: ${token}`);
      return m[1];
    });
}

/** Der Tonschluessel eines Chips — Formklassen zählen nicht als Ton. */
function ton(el: HTMLElement): string {
  const keys = schluessel(el);
  expect(keys).toContain("chip");
  const rest = keys.filter((k) => k !== "chip" && k !== "rueckmeldung");
  expect(rest.length).toBe(1);
  // DIE tragende Zeile: ein Klassenname, den das Stylesheet nicht kennt, ist
  // gueltiges Markup und still farblos.
  expect(DEKLARIERT.has(rest[0])).toBe(true);
  return rest[0];
}

/**
 * ⚠️ FIXTURE-ABWEICHUNG (Befund 18a). Der Plan gibt `ch-2` den Chip-Text
 * „läuft ab 09/26" und sichert `fmtVerfall` mit `toContain("09/26")` zu — die
 * Zeichenkette steht damit schon IM CHIP, und ein ersatzlos entferntes
 * `fmtVerfall` liesse den Test gruen. Der Chip-Text traegt hier deshalb KEIN
 * Datum; „09/26" kann nur noch aus `fmtVerfall("2026-09")` stammen.
 */
const DETAIL: EntnahmeDetail = {
  id: "art-1",
  name: "Kompresse 10×10",
  einheit: "Stk",
  fach: "A-01",
  bestand: 42,
  chargen: [
    { id: "ch-1", chargenNr: "L1", verfall: "2027-03", rest: 30, ampel: "gruen", text: "bis 03/27" },
    { id: "ch-2", chargenNr: "L2", verfall: "2026-09", rest: 12, ampel: "gelb", text: "läuft bald ab" },
  ],
};

const PLUS = "button[aria-label='Menge erhöhen']";
const BUCHEN = "[data-rolle='entnahme-buchen']";
const MENGE = "input[aria-label='Menge']";
const ERGEBNIS = "[data-rolle='entnahme-ergebnis']";

afterEach(async () => {
  await unmount();
});

describe("Entnahme — die Anzeige", () => {
  it("zeigt Name, Fach, Bestand und Einheit", async () => {
    await mount(<Entnahme detail={DETAIL} buchen={async () => ({ ok: true, wert: { gebucht: 1 } })} />);
    expect(query("h1").textContent).toBe("Kompresse 10×10");
    expect(query("[data-rolle='fach']").textContent).toBe("A-01");
    expect(query("[data-rolle='bestand']").textContent).toContain("42");
    expect(query("[data-rolle='bestand']").textContent).toContain("Stk");
  });

  it("der Rueckweg behaelt sein stummes Zeichen neben sichtbarem Text", async () => {
    await mount(<Entnahme detail={DETAIL} buchen={async () => ({ ok: true, wert: { gebucht: 1 } })} />);
    const link = query<HTMLAnchorElement>("a[href='/helfer']");
    const svg = query("a[href='/helfer'] svg");
    expect(svg.getAttribute("aria-hidden")).toBe("true");
    expect(svg.getAttribute("focusable")).toBe("false");
    expect(link.textContent?.trim()).toBe("Zurück");
  });

  it("listet die Chargen mit Chip und Monatsangabe (FEFO)", async () => {
    await mount(<Entnahme detail={DETAIL} buchen={async () => ({ ok: true, wert: { gebucht: 1 } })} />);
    const zeilen = queryAll("[data-rolle='charge-zeile']");
    expect(zeilen.length).toBe(2);
    expect(zeilen[1].textContent).toContain("L2");
    // Der Chip-Text wird DURCHGEREICHT, nicht neu formuliert.
    expect(zeilen[1].textContent).toContain("läuft bald ab");
    // ⚠️ Befund 18a: „09/26" steht in KEINER Fixture-Zeichenkette. Faellt
    // `fmtVerfall(c.verfall)` weg, ist diese Zeile rot.
    expect(zeilen[1].textContent).toContain("09/26");
    // Und es ist die FORMATIERTE Form, nicht der Rohwert: ein `{c.verfall}`
    // statt `{fmtVerfall(c.verfall)}` faellt hier auf.
    expect(zeilen[1].textContent).not.toContain("2026-09");
    expect(zeilen[0].textContent).toContain("03/27");
    expect(zeilen[0].textContent).not.toContain("2027-03");
  });

  it("der Chip traegt den Ton aus `ampelTon` — eine im Stylesheet DEKLARIERTE Klasse (§5.17)", async () => {
    await mount(<Entnahme detail={DETAIL} buchen={async () => ({ ok: true, wert: { gebucht: 1 } })} />);
    const chips = queryAll("[data-rolle='charge-zeile'] [data-rolle='helfer-chip']");
    // ⚠️ Befund 18b: ohne diese Zeile fuehrt die Pruefung bei leerem
    // Trefferarray NULL Zusicherungen aus — benennt jemand das `data-rolle` um,
    // bliebe der einzige §5.17-Regressionstest dieser Datei gruen.
    expect(chips.length).toBe(2);
    // `gruen` -> `ok` ist genau die Abbildung, fuer die es `ampelTon` gibt; ein
    // durchgereichtes `c.ampel` ergaebe `_gruen_…`, und `.gruen` gibt es nicht.
    expect(ton(chips[0])).toBe("ok");
    expect(ton(chips[1])).toBe("gelb");
  });

  it("der Buchen-Knopf ist bei Bestand 0 deaktiviert", async () => {
    await mount(
      <Entnahme
        detail={{ ...DETAIL, bestand: 0, chargen: [] }}
        buchen={async () => ({ ok: true, wert: { gebucht: 0 } })}
      />,
    );
    expect(query<HTMLButtonElement>(BUCHEN).disabled).toBe(true);
  });
});

describe("Entnahme — der ERFOLG", () => {
  it("volle Menge: gruener Chip mit Menge und Namen", async () => {
    await mount(<Entnahme detail={DETAIL} buchen={async () => ({ ok: true, wert: { gebucht: 1 } })} />);
    await click(BUCHEN);
    const r = query(ERGEBNIS);
    // ⚠️ NICHT `toMatch(/\bok\b/)` wie im Plan: die Vitest-Klasse heisst
    // `_ok_ef45c4`, und `\b` findet an einem Unterstrich keine Wortgrenze. Die
    // Positivform waere dauerhaft ROT, die Negativform (`not.toMatch`) dauerhaft
    // GRUEN — sie koennte fuer keine Eingabe je fehlschlagen.
    expect(ton(r)).toBe("ok");
    expect(r.textContent).toBe("Entnahme gebucht: 1 × Kompresse 10×10");
  });

  it("TEILMENGE: sagt ‚3 von 5 gebucht' — heute steht dort nur die kleinere Zahl", async () => {
    // §7.3: heute ein gruener Chip mit der KLEINEREN Zahl, ohne Hinweis. Der
    // Helfer legt fuenf Teile ins Fahrzeug und das Journal kennt drei.
    await mount(<Entnahme detail={DETAIL} buchen={async () => ({ ok: true, wert: { gebucht: 3 } })} />);
    for (let i = 0; i < 4; i++) await click(PLUS); // 1 → 5
    await click(BUCHEN);
    expect(query(ERGEBNIS).textContent).toBe("3 von 5 gebucht; mehr lag nicht im Handlager.");
    // Der Hinweis ist der Punkt — die blosse Zahl „3" stand auch bisher da.
    expect(query(ERGEBNIS).textContent).not.toContain("Entnahme gebucht");
  });

  it("setzt die Menge nach einem Erfolg auf 1 zurueck", async () => {
    await mount(<Entnahme detail={DETAIL} buchen={async () => ({ ok: true, wert: { gebucht: 3 } })} />);
    for (let i = 0; i < 2; i++) await click(PLUS);
    expect(query<HTMLInputElement>(MENGE).value).toBe("3");
    await click(BUCHEN);
    expect(query<HTMLInputElement>(MENGE).value).toBe("1");
  });
});

describe("Entnahme — die Fehlerlagen (§7.3)", () => {
  it("`leer` rendert die FEHLERform, NICHT den gruenen Chip", async () => {
    // DER REGRESSIONSTEST gegen „Entnahme gebucht: 0 × X" mit Haekchen
    // (HelferEntnahme.tsx:26-27, :55 `chip chip-ok`). Ein 200, das luegt, ist
    // der teuerste Zustand der Tabelle.
    await mount(
      <Entnahme
        detail={DETAIL}
        buchen={async () => ({
          ok: false,
          grund: "leer",
          text: "Im Handlager liegt nichts mehr von Kompresse 10×10. Bitte der Verwaltung melden.",
        })}
      />,
    );
    await click(BUCHEN);
    const r = query(ERGEBNIS);
    // Ein zweites `expect(ton(r)).not.toBe("ok")` stuende hier nur zur Zierde:
    // `ton()` liefert GENAU EINEN Schluessel, die Zeile koennte nach der
    // vorigen nie fehlschlagen — dieselbe Klasse, die der Plan an drei Stellen
    // hat (Regel 2).
    expect(ton(r)).toBe("rot");
    expect(r.textContent).toBe(
      "Im Handlager liegt nichts mehr von Kompresse 10×10. Bitte der Verwaltung melden.",
    );
    // Und keine Spur der alten Erfolgsform.
    expect(r.textContent).not.toContain("gebucht: 0");
  });

  it("`gesperrt` zeigt den Text und KEINEN Weg zurueck aufs Gate", async () => {
    // Ein erneutes Einloesen desselben Codes scheitert genauso; einen Weg
    // anzubieten, der nicht helfen kann, ist schlimmer als keiner (§7.4.4).
    await mount(
      <Entnahme
        detail={DETAIL}
        buchen={async () => ({
          ok: false,
          grund: "gesperrt",
          text: "Dieses Kärtchen wurde gesperrt. Die Buchung wurde nicht gespeichert.",
        })}
      />,
    );
    await click(BUCHEN);
    expect(query(ERGEBNIS).textContent).toContain("gesperrt");
    expect(ton(query(ERGEBNIS))).toBe("rot");
    // ⚠️ Der Plan prueft hier `exists("[data-rolle='erneuern']")` — ein
    // Erneuerungsfeld, das diese Datei fuer KEINEN Grund rendert. Die Zeile
    // koennte nie fehlschlagen. Geprueft wird deshalb das, was es hier
    // tatsaechlich gibt und was bei `sitzung` NEBENAN erscheint.
    expect(exists("[data-rolle='erneuern']")).toBe(false);
    expect(exists("[data-rolle='entnahme-zum-gate']")).toBe(false);
  });

  it("`sitzung` zeigt den Text und schickt zum Gate — ohne die Menge zu verwerfen", async () => {
    await mount(
      <Entnahme
        detail={DETAIL}
        buchen={async () => ({
          ok: false,
          grund: "sitzung",
          text: "Dein Zugang ist abgelaufen. Scanne das Kärtchen erneut — deine Eingaben bleiben stehen.",
        })}
      />,
    );
    for (let i = 0; i < 2; i++) await click(PLUS);
    await click(BUCHEN);
    expect(query<HTMLAnchorElement>("[data-rolle='entnahme-zum-gate']").getAttribute("href")).toBe(
      "/?returnTo=%2Fa%2Fart-1",
    );
    expect(query<HTMLInputElement>(MENGE).value).toBe("3");
  });

  it("`eingabe` (B4) zeigt den Servertext — und KEINEN Weg zurueck aufs Gate", async () => {
    // Der fuenfte Grund aus Betreiberentscheidung B4: die Nutzlast war
    // unvollstaendig. `darfErneuern("eingabe")` ist false — eine unvollstaendige
    // Nutzlast wird nicht dadurch vollstaendig, dass jemand die Sitzung
    // erneuert. Die Insel formuliert nichts neu; der `text` traegt die Botschaft.
    await mount(
      <Entnahme
        detail={DETAIL}
        buchen={async () => ({
          ok: false,
          grund: "eingabe",
          text: "Die Angaben waren unvollständig. Bitte die Seite neu laden und erneut buchen.",
        })}
      />,
    );
    await click(BUCHEN);
    expect(query(ERGEBNIS).textContent).toBe(
      "Die Angaben waren unvollständig. Bitte die Seite neu laden und erneut buchen.",
    );
    expect(ton(query(ERGEBNIS))).toBe("rot");
    expect(exists("[data-rolle='entnahme-zum-gate']")).toBe(false);
  });

  it("ein GEWORFENER Fehler wird gefangen: ‚Keine Verbindung', Menge bleibt, Knopf wieder aktiv", async () => {
    // Falle 62: HelferEntnahme.tsx:22-30 hat KEIN catch — der Wurf schlaegt bis
    // zur Fehlerseite durch, und in Produktion steht dort ein ENGLISCHER Satz
    // (Falle 66).
    await mount(<Entnahme detail={DETAIL} buchen={async () => { throw new Error("offline"); }} />);
    for (let i = 0; i < 4; i++) await click(PLUS);
    await click(BUCHEN);
    expect(query(ERGEBNIS).textContent).toBe("Keine Verbindung. Die Buchung wurde nicht gespeichert.");
    expect(ton(query(ERGEBNIS))).toBe("rot");
    expect(query<HTMLInputElement>(MENGE).value).toBe("5");
    expect(query<HTMLButtonElement>(BUCHEN).disabled).toBe(false);
    // `"netz"` ist ein CLIENT-Grund: er fuehrt zu keinem Gate-Weg.
    expect(exists("[data-rolle='entnahme-zum-gate']")).toBe(false);
  });
});

describe("Entnahme — die Rueckmeldung ist ganz lesbar (Review-Befund 1)", () => {
  /**
   * ⚠️ WARUM ES DIESEN TEST GIBT. `.chip` ist ein KURZstatus:
   * `white-space: nowrap`, `border-radius: 99px`, `padding: 2.5px 9px`,
   * `font-size: 12px` (`helfer.module.css:227-230`), und die umgebende `.karte`
   * traegt `overflow: hidden` (`:186`). In diesen Chip laufen hier die
   * vollstaendigen §7.3-Saetze: bei 390px Geraetebreite bleiben 334px
   * Karteninnenraum (390 − 2×14 `.inhalt` − 2×14 `.kartePad`), der
   * `sitzung`-Satz braucht bei 12px/600 rund 540px. Ohne Umbruchmoeglichkeit
   * schneidet `overflow: hidden` den Ueberhang OHNE Ellipse ab — genau der
   * Handlungssatz faellt weg, um dessentwillen der ganze Task existiert.
   *
   * ⚠️ WARUM ER DIE REGEL LIEST UND NICHT DAS AUSSEHEN. jsdom berechnet kein
   * CSS. Der Test belegt deshalb das gerenderte Klassenpaar UND liest
   * `.chip.rueckmeldung`: zwei Klassen sind spezifischer als `.chip` und lassen
   * die Umbruchregeln nicht von der Stylesheet-Reihenfolge abhängen.
   *
   * ⚠️ WARUM NUR DER FEHLERFALL GEPRUEFT WIRD. Der Stil haengt nicht an `art` —
   * es ist EIN Element ohne Verzweigung. Ein zweiter Test auf dem Erfolgsfall
   * waere eine Kopie, keine zweite Zusage (Regel 4). Geprueft wird der
   * `leer`-Satz, weil er der laengste und der Gegenstand des Befunds ist.
   */
  it("nutzt die umbruchfaehige Rueckmeldung-Klasse statt Inline-Stile", async () => {
    const chip = regeln(".chip");
    const rueckmeldung = regeln(".chip.rueckmeldung");
    // Die Voraussetzung des Befunds, aus dem Stylesheet GELESEN statt behauptet:
    // faellt `nowrap` in T64 je weg, geht diese Zeile rot und der naechste Leser
    // weiss, dass die Ueberschreibung neu zu bewerten ist.
    expect(chip.get("white-space")).toBe("nowrap");

    await mount(
      <Entnahme
        detail={DETAIL}
        buchen={async () => ({
          ok: false,
          grund: "leer",
          text: "Im Handlager liegt nichts mehr von Kompresse 10×10. Bitte der Verwaltung melden.",
        })}
      />,
    );
    await click(BUCHEN);
    const r = query(ERGEBNIS);

    expect(r.className).toMatch(/rueckmeldung/);

    // Und die Geometrie MUSS mit: `border-radius: 99px` mit `padding: 2.5px 9px`
    // ueber drei Zeilen ist ein zerlaufendes Oval — man tauschte Abschneiden
    // gegen Unlesbarkeit. Die Liste ist genau die Schnittmenge aus „steht in
    // `.chip`" und „macht einen SATZ unlesbar".
    for (const eig of ["display", "white-space", "border-radius", "padding", "font-size"]) {
      expect(chip.has(eig)).toBe(true);
      expect(rueckmeldung.get(eig)).toBeTruthy();
      expect(rueckmeldung.get(eig)).not.toBe(chip.get(eig));
    }
    expect(rueckmeldung.get("margin-top")).toBe("10px");

    // Der Ton bleibt, wo er war: die Ueberschreibung tauscht die Form, nicht die
    // Farbe — `ton()` verlangt weiterhin `chip` plus genau einen Tonschluessel.
    expect(ton(r)).toBe("rot");
  });
});

describe("Entnahme — Bauform", () => {
  it("importiert die Action NICHT, sie kommt als Prop", () => {
    // `_actions/buchung.ts` gehoert Teil 5 (H7). Als Prop ist diese Insel
    // vollstaendig, testbar und gruen; der eine Import liegt in T83.
    //
    // ⚠️ Befund 1: `ohneKommentare()`, sonst trifft der Scan den Kopfkommentar
    // der geprueften Datei — also seine eigene Begruendung.
    expect(ohneKommentare(readFileSync(QUELLE, "utf8"))).not.toMatch(/_actions\/buchung/);
  });

  it("faengt JEDEN Action-Aufruf in try/catch", () => {
    // Der Verhaltensnachweis steht oben („ein GEWORFENER Fehler wird
    // gefangen"). Dieser Scan haelt einen anderen Fall: einen ZWEITEN
    // Aufrufort, den kein DOM-Test erreicht.
    const q = ohneKommentare(readFileSync(QUELLE, "utf8"));
    const aufrufe = q.match(/\bbuchen\(/g) ?? [];
    expect(aufrufe.length).toBe(1);
    expect(q).toMatch(/try \{[\s\S]*?await buchen\([\s\S]*?\} catch/);
  });

  it("ist eine Client-Insel ohne antd, ohne lucide, ohne Plakette", () => {
    // `_ui/Plakette.tsx` (das Zifferblatt) gehoert Teil 5, T107 — die FEFO-Zeile
    // steht hier als Chip plus Text und kann spaeter additiv erweitert werden.
    const q = ohneKommentare(readFileSync(QUELLE, "utf8"));
    expect(q).toMatch(/^"use client";/m);
    expect(q).not.toMatch(/from "antd|@ant-design\/icons|lucide-react|\.\/Plakette/);
  });

  it("nennt kein `--ant-` und keine Router-Navigation (Querschnittsregeln)", () => {
    const q = ohneKommentare(readFileSync(QUELLE, "utf8"));
    // Falle 2: eine nicht aufloesbare CSS-Variable ist gueltiges CSS und faellt
    // still auf `transparent` zurueck.
    expect(q).not.toMatch(/--ant-/);
    expect(q).not.toMatch(/usePathname|useSearchParams|router\.(push|replace)/);
  });
});
