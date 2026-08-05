// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from "vitest";
import { readFileSync } from "node:fs";
import { mount, unmount, query, queryAll, exists, fill } from "@/app/m/qr/_lib/test-dom";
import { ArtikelSuche, type ArtikelZeileHelfer } from "./ArtikelSuche";

const QUELLE = "src/app/m/lagerbuch/_ui/ArtikelSuche.tsx";

/**
 * DAS ERSATZ-FALTUNGS-GESCHIRR — der Verhaltensnachweis fuer §5.13.2.
 *
 * Der Quelltext-Scan weiter unten faengt nur die SCHREIBWEISE `toLowerCase(`.
 * Eine zweite Faltung als `.normalize("NFD").replace(…)`, als Zeichentabelle
 * oder ueber `Intl.Collator` liefe an ihm gruen vorbei — und genau daran haengt
 * die Praemisse „EINE Faltung, EIN Ort". Dieses Geschirr ersetzt `falte` fuer
 * EINEN Test durch eine erkennbar andere Faltung und prueft, ob die Liste ihr
 * folgt. Tut sie es nicht, faltet die Komponente selbst.
 *
 * Voreinstellung ist die ECHTE `falte` (ueber `importOriginal`): alle uebrigen
 * Tests fahren unveraendert gegen `_lib/suche.ts`, nicht gegen einen Stub.
 * `vi.hoisted` und nicht ein blosses `let`, weil `vi.mock` ueber jede
 * Modulebenen-Deklaration gehisst wird.
 */
const H = vi.hoisted(() => ({ ersatz: null as null | ((s: string) => string) }));

vi.mock("../_lib/suche", async (importOriginal) => {
  const echt = await importOriginal<typeof import("../_lib/suche")>();
  return { falte: (s: string) => (H.ersatz ?? echt.falte)(s) };
});

/**
 * Kopie von `ohneKommentare()` aus `_lib/bauform.test.ts` (Regel 1 der Regeldatei
 * fuer Teil 4, Nachtrag N-5). `bauform.test.ts` exportiert sie nicht, und dies ist
 * ein anderer Testkoerper — deshalb die zeichengleiche lokale Kopie statt eines
 * Re-Exports, genau wie `_lib/pwaIcons.test.ts` (T65),
 * `_lib/schreibpfade/tokenEinloesung.test.ts` (T66), `_ui/Restzeit.test.tsx` (T67),
 * `_ui/Stepper.test.tsx` (T68) und `_ui/rahmen.test.tsx` (T69) es halten.
 *
 * ⚠️ OHNE SIE IST DER `toLowerCase`-SCAN AUF SEINER EIGENEN BEGRUENDUNG ROT.
 * `ArtikelSuche.tsx` schreibt in seinen Kopfkommentar, dass der Alt-Bestand mit
 * `a.name.toLowerCase().includes(…)` filtert — das IST die Begruendung, die der
 * Plan konserviert haben will, und sie darf den Scan nicht ausloesen. Die
 * naheliegende „Reparatur" waere, genau sie zu loeschen.
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

const LISTE: ArtikelZeileHelfer[] = [
  { id: "a1", name: "Kompresse 10×10", einheit: "Stk", fach: "A-01", bestand: 42 },
  { id: "a2", name: "Mullbinde 6 cm", einheit: "Stk", fach: "A-02", bestand: 0 },
  { id: "a3", name: "Wärmedecke", einheit: "Stk", fach: "B-11", bestand: 7 },
];

afterEach(async () => {
  H.ersatz = null;
  await unmount();
});

describe("ArtikelSuche — die Liste", () => {
  it("rendert jede Zeile mit Name, Fach, Bestand und Einheit", async () => {
    await mount(<ArtikelSuche artikel={LISTE} />);
    const zeilen = queryAll("[data-rolle='artikel-zeile']");
    expect(zeilen.length).toBe(3);
    expect(zeilen[0].textContent).toContain("Kompresse 10×10");
    expect(zeilen[0].textContent).toContain("A-01");
    expect(zeilen[0].textContent).toContain("42");
    expect(zeilen[0].textContent).toContain("Stk");
  });

  it("JEDE Zeile ist ein Link auf den AEUSSEREN Pfad `/a/<id>`", async () => {
    // Ein innerer Pfad wuerde auf dem aeusseren Host doppelt praefixiert
    // (Falle 63). `/a/<id>` ist derselbe Pfad, der auf dem Regaletikett steht.
    //
    // Geprueft werden ALLE drei Zeilen, nicht nur die erste: der Titel sagt
    // „jede", und ein `query()` auf die erste liesse eine Praefixierung ab der
    // zweiten Zeile durch.
    await mount(<ArtikelSuche artikel={LISTE} />);
    const zeilen = queryAll<HTMLAnchorElement>("[data-rolle='artikel-zeile']");
    expect(zeilen.length).toBe(3);
    for (const [i, zeile] of zeilen.entries()) {
      expect(zeile.tagName).toBe("A");
      expect(zeile.getAttribute("href")).toBe(`/a/${LISTE[i].id}`);
    }
  });

  it("zeigt einen Artikel mit Bestand 0 — er wird NICHT ausgeblendet, und die Null steht da", async () => {
    // Der Bestand 0 ist eine Auskunft („da liegt nichts mehr"), kein Grund zum
    // Verstecken. Wer das Regalfach vor sich hat, will die Zeile sehen.
    //
    // Die Laenge steht VOR dem Indexzugriff: ohne sie sicherte der Test bei
    // einem herausgefilterten Artikel nur noch eine Position zu, und
    // `toContain("Bestand 0")` sichert zusaetzlich zu, dass die Null angezeigt
    // und nicht als Falsy-Wert unterdrueckt wird.
    await mount(<ArtikelSuche artikel={LISTE} />);
    const zeilen = queryAll("[data-rolle='artikel-zeile']");
    expect(zeilen.length).toBe(3);
    expect(zeilen[1].textContent).toContain("Mullbinde 6 cm");
    expect(zeilen[1].textContent).toContain("Bestand 0");
  });
});

describe("ArtikelSuche — das Filtern, ueber die EINE Faltung", () => {
  it("filtert nach Name, unabhaengig von Gross-/Kleinschreibung", async () => {
    await mount(<ArtikelSuche artikel={LISTE} />);
    await fill("[data-rolle='artikel-suche']", "KOMPRESSE");
    const treffer = queryAll("[data-rolle='artikel-zeile']");
    expect(treffer.length).toBe(1);
    expect(treffer[0].textContent).toContain("Kompresse 10×10");
  });

  it("filtert auch nach FACH — das steht auf dem Regaletikett", async () => {
    await mount(<ArtikelSuche artikel={LISTE} />);
    await fill("[data-rolle='artikel-suche']", "B-11");
    const treffer = queryAll("[data-rolle='artikel-zeile']");
    expect(treffer.length).toBe(1);
    expect(treffer[0].textContent).toContain("Wärmedecke");
  });

  it("sucht ueber Name UND Fach als EINEN Heuhaufen — wie der Server-Filter aus Teil 3", async () => {
    // `_lib/artikelFilter.ts:57` faltet `\`${name} ${fach} ${chargenNr}\`` zu
    // EINER Zeichenkette und prueft `includes` darauf. Eine ODER-Verknuepfung
    // zweier Einzelfelder liefert fuer eine feldueberschreitende Eingabe eine
    // ANDERE Treffermenge als der Server — dieselbe Divergenzklasse wie das
    // fehlende `trim()`. Aufgeloest wird sie zugunsten des Servers.
    //
    // Die Chargennummer bleibt draussen: sie steht auf keinem Gegenstand, den
    // jemand auf diesem Weg in der Hand hat, und `ArtikelZeileHelfer` fuehrt sie
    // gar nicht.
    await mount(<ArtikelSuche artikel={LISTE} />);
    await fill("[data-rolle='artikel-suche']", "10×10 a-01");
    const treffer = queryAll("[data-rolle='artikel-zeile']");
    expect(treffer.length).toBe(1);
    expect(treffer[0].textContent).toContain("Kompresse 10×10");
  });

  it("faltet Umlaute so, wie `falte` sie faltet — „wärme“ findet „Wärmedecke“", async () => {
    await mount(<ArtikelSuche artikel={LISTE} />);
    await fill("[data-rolle='artikel-suche']", "wärme");
    const treffer = queryAll("[data-rolle='artikel-zeile']");
    expect(treffer.length).toBe(1);
    expect(treffer[0].textContent).toContain("Wärmedecke");
  });

  it("faltet „ae“ NICHT auf „ä“ — die eine Faltung des Moduls leistet das bewusst nicht", async () => {
    // ⚠️ KORRIGIERTE ERWARTUNG (Befund 7 des Vorab-Scans). Der Plan erwartete
    // hier 1 Treffer unter dem Titel „findet ueber die Faltung auch bei
    // abweichenden Umlauten". `falte` ist aber `s.toLowerCase()`
    // (`_lib/suche.ts:20`), und `"wärmedecke".includes("waerme")` ist `false` —
    // tatsaechlich sind es 0 Treffer. Korrigiert wird die ERWARTUNG, nicht die
    // Faltung: eine zweite, grosszuegigere Faltung im Client waere genau der
    // zweite Ort, den §5.13.2 ausschliesst, und liefe der SQL-Haelfte
    // (`lb_falte`) auseinander.
    //
    // Der Test steht als ZUSAGE ueber die Grenze da, nicht als Luecke: wer sie
    // je verschiebt, verschiebt sie in `_lib/suche.ts` fuer BEIDE Haelften.
    await mount(<ArtikelSuche artikel={LISTE} />);
    await fill("[data-rolle='artikel-suche']", "waerme");
    expect(queryAll("[data-rolle='artikel-zeile']").length).toBe(0);
    expect(exists("[data-rolle='kein-treffer']")).toBe(true);
  });

  it("faltet AUSSCHLIESSLICH ueber `falte` aus `_lib/suche.ts` — eine ersetzte Faltung schlaegt durch", async () => {
    // DER VERHALTENSNACHWEIS zu §5.13.2, den der Quelltext-Scan nicht fuehren
    // kann: er faengt nur die Schreibweise `toLowerCase(`. Hier wird `falte` fuer
    // die Dauer dieses Tests durch eine Faltung ersetzt, die „ae" auf „ä" zieht.
    // Folgt die Liste ihr, laeuft JEDE Faltstelle der Komponente — Nadel wie
    // Heuhaufen — ueber `_lib/suche.ts`. Faltet die Komponente irgendwo selbst,
    // bleibt der Treffer aus.
    //
    // Das ist zugleich die positive Gegenseite zum Test darueber: lernt `falte`
    // je Umlaute, folgt die Client-Suche ohne eine Zeile Aenderung.
    H.ersatz = (s: string) => s.replace(/ä/g, "ae").replace(/Ä/g, "AE").toLowerCase();
    await mount(<ArtikelSuche artikel={LISTE} />);
    await fill("[data-rolle='artikel-suche']", "waerme");
    const treffer = queryAll("[data-rolle='artikel-zeile']");
    expect(treffer.length).toBe(1);
    expect(treffer[0].textContent).toContain("Wärmedecke");
  });

  it("ignoriert fuehrende und nachlaufende Leerzeichen — wie der Server-Filter aus Teil 3", async () => {
    // ⚠️ ABWEICHUNG ZUR ABGEDRUCKTEN IMPLEMENTIERUNG (Befund 8). Der Plan setzte
    // `const nadel = falte(q)`, und `falte` trimmt nicht — die Erwartung 1 war
    // mit dem abgedruckten Code unerreichbar. Aufgeloest zugunsten des Servers:
    // `_lib/artikelFilter.ts:54` ist `falte(f.suche.trim())`. Ohne das lieferten
    // Client- und Serversuche fuer dieselbe Eingabe verschiedene Treffermengen.
    await mount(<ArtikelSuche artikel={LISTE} />);
    await fill("[data-rolle='artikel-suche']", "   mull   ");
    const treffer = queryAll("[data-rolle='artikel-zeile']");
    expect(treffer.length).toBe(1);
    expect(treffer[0].textContent).toContain("Mullbinde 6 cm");
  });

  it("eine Eingabe aus lauter Leerzeichen ist KEINE Suche — die Liste bleibt vollstaendig", async () => {
    await mount(<ArtikelSuche artikel={LISTE} />);
    await fill("[data-rolle='artikel-suche']", "     ");
    expect(queryAll("[data-rolle='artikel-zeile']").length).toBe(3);
    expect(exists("[data-rolle='kein-treffer']")).toBe(false);
  });

  it("ohne Eingabe steht die vollstaendige Liste", async () => {
    // Der Zwischenschritt haengt daran, dass „Kompresse 10×10" das ZEICHEN „×"
    // (U+00D7) fuehrt und nicht den Buchstaben „x". Wer die Fixture je auf
    // ASCII „10x10" normalisiert, kippt genau diese eine Zusicherung.
    await mount(<ArtikelSuche artikel={LISTE} />);
    await fill("[data-rolle='artikel-suche']", "x");
    expect(queryAll("[data-rolle='artikel-zeile']").length).toBe(0);
    await fill("[data-rolle='artikel-suche']", "");
    expect(queryAll("[data-rolle='artikel-zeile']").length).toBe(3);
  });
});

describe("ArtikelSuche — die beiden Leerlagen sind VERSCHIEDEN", () => {
  it("kein Treffer: sagt, wonach gesucht wurde", async () => {
    await mount(<ArtikelSuche artikel={LISTE} />);
    await fill("[data-rolle='artikel-suche']", "zzz");
    expect(query("[data-rolle='kein-treffer']").textContent)
      .toBe("Kein Artikel gefunden für „zzz“.");
    expect(exists("[data-rolle='keine-artikel']")).toBe(false);
  });

  it("gar keine Artikel: sagt etwas ANDERES — und nennt die Verwaltung", async () => {
    // „Kein Artikel gefunden" bei leerer Datenbank schickt die Helferin auf die
    // Suche nach einem Tippfehler, den es nicht gibt.
    await mount(<ArtikelSuche artikel={[]} />);
    expect(exists("[data-rolle='kein-treffer']")).toBe(false);
    expect(query("[data-rolle='keine-artikel']").textContent)
      .toBe("Es ist noch kein Artikel angelegt. Die Verwaltung pflegt den Bestand.");
  });

  it("gar keine Artikel: auch MIT Eingabe bleibt es der Datenbank-Text", async () => {
    // Die Unterscheidung haengt an `artikel.length`, nicht an `q`. Ohne den
    // Riegel kippte die leere Datenbank beim ersten Tastendruck in „Kein Artikel
    // gefunden fuer …" — also in genau den Satz, der auf die Suche nach einem
    // Tippfehler schickt.
    await mount(<ArtikelSuche artikel={[]} />);
    await fill("[data-rolle='artikel-suche']", "mull");
    expect(exists("[data-rolle='kein-treffer']")).toBe(false);
    expect(exists("[data-rolle='keine-artikel']")).toBe(true);
  });
});

describe("ArtikelSuche — Bauform", () => {
  it("das Suchfeld ist benannt und traegt `type=\"search\"`", async () => {
    await mount(<ArtikelSuche artikel={LISTE} />);
    const feld = query<HTMLInputElement>("[data-rolle='artikel-suche']");
    expect(feld.getAttribute("aria-label")).toBe("Artikel suchen");
    expect(feld.getAttribute("type")).toBe("search");
  });

  it("benutzt `falte` aus `_lib/suche.ts` und baut keine zweite Faltung", () => {
    // ⚠️ UEBER `ohneKommentare` (Befund 1): der Kopfkommentar der geprueften
    // Datei nennt `a.name.toLowerCase().includes(…)` als das, was der Bestand
    // falsch macht — der Rohtext-Scan traefe seine eigene Begruendung.
    //
    // Das Muster ist die belastbare Form aus `_lib/bauform.test.ts` (B1) und
    // nicht das `/toLowerCase\(\)/` des Plans: jenes verlangt die Klammern
    // unmittelbar anschliessend und liesse `.toLowerCase( )` sowie
    // `.toLocaleLowerCase()` durch.
    const q = ohneKommentare(readFileSync(QUELLE, "utf8"));
    expect(q, "die eine Faltung des Moduls kommt aus _lib/suche.ts (§5.13.2)")
      .toMatch(/import\s*\{[^}]*\bfalte\b[^}]*\}\s*from\s*["']\.\.\/_lib\/suche["']/);
    expect(q, "ein eigenes toLowerCase() waere der zweite Ort — genau der, den §5.13.2 ausschliesst")
      .not.toMatch(/\.toLoc(?:ale)?LowerCase\s*\(|\.toLowerCase\s*\(/);
  });

  it("benutzt KEIN useSearchParams und KEIN router.push (§7.8.2 Punkt 6)", () => {
    // Der modulweite Scan in `_lib/bauform.test.ts` traegt dieselbe Zusage fuer
    // den ganzen oeffentlichen Ast — aber mit einer NAMENTLICHEN Ausnahmeliste
    // (`Suchfeld`, `ArtikelDrawer`, …). Diese Zusicherung haelt den Fall allein,
    // in dem diese Datei je auf jener Liste landet oder in den
    // Verwaltungszweig wandert; der modulweite haelt allein die Dateien, die
    // keinen eigenen Test haben.
    const q = ohneKommentare(readFileSync(QUELLE, "utf8"));
    expect(q).not.toMatch(/useSearchParams|router\.(push|replace)|usePathname/);
  });

  it("ist eine Client-Insel ohne antd", () => {
    // `"use client"` prueft KEIN anderer Test: `bauform.test.ts` verbietet die
    // Direktive nur unter `_lib/` und `_db/`, fordert sie nirgends. Ohne sie
    // waere `useState` in einer Server Component ein HTTP 500, den weder
    // `typecheck` noch `build` sehen.
    const q = ohneKommentare(readFileSync(QUELLE, "utf8"));
    expect(q).toMatch(/^"use client";/m);
    expect(q).not.toMatch(/from "antd|@ant-design\/icons|lucide-react/);
  });
});
