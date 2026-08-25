// @vitest-environment jsdom
// src/app/m/radio/admin/(arbeit)/geraete/[id]/ereignisse/EreignisTabelle.test.tsx
import { afterEach, describe, expect, it } from "vitest";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join, normalize } from "node:path";

/**
 * INSEL 5 — DIE AENDERUNGSHISTORIE EINES GERAETS (`Spec:4759-4776`, §5.10; Aufgabe V15).
 *
 * ⛔ `// @vitest-environment jsdom` ALS ERSTE ZEILE. `vitest.config.ts:7` setzt
 * `environment: "node"` global und kennt kein `environmentMatchGlobs`; ohne die Zeile stirbt
 * jeder `mount()` an `document is not defined` (Vorbild `_ui/GeraeteListe.test.tsx:1`).
 *
 * ⛔ DAS ETABLIERTE HARNESS, KEIN ZWEITES (`CLAUDE.md`, „Tests"):
 * `src/app/m/qr/_lib/test-dom.tsx`.
 *
 * ⛔ DIE FLAECHE IST NEU UND AUSDRUECKLICH KEIN 1:1-PORT (`Spec:4759-4765`): der
 * Alt-Endpunkt `GET /devices/:id/events` existiert
 * (`radio-admin/server/src/routes/devices.ts:66-80`), hat aber gemessen KEINEN Konsumenten.
 * Es gibt also kein Vorbild zum Nachpruefen — geprueft wird gegen das DATENMODELL, die sechs
 * Spalten aus `_db/schema.ts:130-141`, und gegen die vier Zusagen des Spec-Absatzes.
 *
 * ⛔ DIE ARBEITSTEILUNG, UND SIE IST DER GRUND FUER DEN ZUSCHNITT DIESER DATEI: der
 * LESEPFAD bildet ab (Etikettenliste vollzaehlig, Quellwoerter vollzaehlig, Deckel 200,
 * Sortierung) — das prueft `_lib/lesepfade/ereignisse.test.ts` (V7). Die INSEL rendert, und
 * nur das steht hier. ⛔ `FELD_ETIKETTEN` UND `QUELLE_WOERTER` VERLASSEN DEN LESEPFAD NICHT
 * (`_lib/lesepfade/ereignisse.ts:36-37`); dass die Insel sie nie sieht, ist unten ein
 * eigener Fall.
 *
 * ⚠️ WAS DIESE DATEI STRUKTURELL NICHT SEHEN KANN: **Falle 9**. In jsdom gibt es keine
 * RSC-Grenze — eine `render`-Funktion ist hier ein gewoehnlicher Funktionswert. Zoege jemand
 * die Spaltenliste aus der Insel heraus und liesse die Server Component sie durchreichen,
 * bliebe JEDER Fall dieser Datei gruen. Der Waechter dagegen ist der Playwright-Fall aus
 * `Spec:4880` (Fall 4) — Eigentuemer Aufgabe V23.
 */

const INSEL_ORDNER = "src/app/m/radio/admin/(arbeit)/geraete/[id]/ereignisse";
const QUELLE_TABELLE = `${INSEL_ORDNER}/EreignisTabelle.tsx`;
const QUELLE_SEITE = `${INSEL_ORDNER}/page.tsx`;

/**
 * DIE DATEIEN DER INSEL — ⛔ GEFUNDEN, NICHT AUFGEZAEHLT (Ruling **R-V11-1**,
 * `.superpowers/sdd/planteil4/progress.md`, Abschnitt „Rulings"). Gemessen in der
 * Schlusspruefung zu V13 (`REVIEW-V13.md:48`, Fund M2): eine zusaetzliche Datei in einem
 * Inselverzeichnis, ohne Bauform-Direktive UND mit einem Wertimport aus `_db/schema`, liess
 * eine handgeschriebene Namensliste voellig unbeeindruckt.
 *
 * ⛔ DER AUSSCHLUSS STEHT AM BLATT UND NICHT AM AST (Ruling **R-V11-3**): gefiltert wird ueber
 * Endung und Dateinamen, nicht ueber ein uebersprungenes Verzeichnis. Ausgenommen sind genau
 * die Namen, die Next selbst als SERVER-Einstiege fuehrt, und die Testdateien.
 */
const SERVER_EINSTIEGE = ["page.tsx", "layout.tsx", "template.tsx", "route.ts"];

function inselDateien(): string[] {
  return readdirSync(INSEL_ORDNER)
    .filter((name) => /\.tsx?$/.test(name))
    .filter((name) => !/\.test\.tsx?$/.test(name))
    .filter((name) => !SERVER_EINSTIEGE.includes(name))
    .sort();
}

/** ⛔ Die Sollwerttafel steht NUR auf der rechten Seite — sie ist der Prueffling der Messung. */
const INSEL_SOLL = ["EreignisTabelle.tsx"];

import { queryAll, exists, mount, unmount } from "@/app/m/qr/_lib/test-dom";
import { ohneKommentare } from "../../../../../_lib/quelltextScan";
import type { EreignisZeile } from "../../../../../_lib/lesepfade/ereignisse";
import { EreignisTabelle, QUELLE_TON } from "./EreignisTabelle";

/**
 * Eine Zeile, wie der Lesepfad sie liefert — VORFORMATIERT und serialisierbar, ohne `Date`
 * (`_lib/lesepfade/ereignisse.ts`, Kopf von `EreignisZeile`; Bauform-Zulaessigkeitstafel
 * Nr. 7). Die Vorbelegung ist die haeufigste Zeile der Flaeche: ein Feld von Hand geaendert.
 */
function zeile(teil: Partial<EreignisZeile> = {}): EreignisZeile {
  return {
    zeitText: "03.07.2026, 12:00",
    feldEtikett: "Lagerort",
    alt: "Lager A",
    neu: "Lager B",
    werText: "Anna Beispiel",
    werSub: "sub-anna",
    quelle: "manual",
    quelleWort: "von Hand",
    ...teil,
  };
}

/** Der Text einer Zelle, ohne Randleerraum — `textContent` traegt in antd keine Umbrueche. */
function texte(rolle: string): string[] {
  return queryAll(`[data-rolle="${rolle}"]`).map((el) => (el.textContent ?? "").trim());
}

afterEach(async () => {
  await unmount();
});

describe("radio-Ereignisse: die vier Spalten der Insel", () => {
  it("leere Werte werden als Gedankenstrich dargestellt", async () => {
    /*
     * ⛔ DER FALL, DEN `Spec:4864-4869` NAMENTLICH NENNT („`EreignisTabelle.test.tsx` (leere
     * Werte als `—`)"), und die Zusage selbst steht in `Spec:4771-4772`.
     *
     * ⛔ BEIDE SEITEN, MIT JE UNTERSCHIEDLICHEM WERT AUF DER ANDEREN. Ein Bau, der nur eine
     * der beiden Seiten faltet, bliebe bei einem symmetrischen Fixture gruen — derselbe
     * Grund, den `_lib/lesepfade/ereignisse.test.ts:351-353` fuer den Lesepfad ausschreibt.
     *
     * ⛔ UND DIE INSEL TRAEGT IHREN EIGENEN RUECKFALL, obwohl der Lesepfad bereits faltet
     * (`_lib/lesepfade/ereignisse.ts`, `wertText`). Das ist die Hausform: `GeraeteTabelle.tsx:69`
     * fuehrt dieselbe Konstante ein zweites Mal. Der Grund ist die Grenze — was ueber die
     * Props hereinkommt, ist der Vertrag DIESER Datei, und die leere Zeichenkette ist der
     * Wert, den `toEventValue` fuer ein geleertes Feld herausgibt
     * (`radio-admin/shared/src/diff-device.ts:4-6`).
     */
    await mount(
      <EreignisTabelle
        zeilen={[
          zeile({ alt: "", neu: "gesetzt" }),
          zeile({ alt: "vorher", neu: "" }),
        ]}
      />,
    );

    expect(texte("radio-ereignis-aenderung")).toEqual(["— → gesetzt", "vorher → —"]);
  });

  it("die Aenderung liest sich als alt Pfeil neu", async () => {
    /*
     * `Spec:4771-4772` woertlich: „Änderung („alt → neu", leere Werte als `—`)". ⛔ DIE
     * REIHENFOLGE IST DIE AUSSAGE: „nachher → vorher" waere zeichengleich lang, typkorrekt,
     * lint-sauber — und die Historie stuende auf dem Kopf.
     */
    await mount(<EreignisTabelle zeilen={[zeile({ alt: "vorher", neu: "nachher" })]} />);

    expect(texte("radio-ereignis-aenderung")).toEqual(["vorher → nachher"]);
  });

  it("das Feld traegt sein deutsches Etikett, nicht seinen Spaltennamen", async () => {
    /*
     * `Spec:4770-4771`: „Feld (deutsches Etikett aus derselben Etikettenliste, die das
     * Formular benutzt)".
     *
     * ⚠️ HIER WIRD NUR GEPRUEFT, DASS DIE INSEL `feldEtikett` RENDERT — dass die Abbildung
     * stimmt und vollzaehlig ist, prueft V7 am Lesepfad
     * (`_lib/lesepfade/ereignisse.test.ts`, „jedes Feld der Etikettenliste hat ein deutsches
     * Etikett", `toBe(20)`).
     *
     * ⛔ DIE TRAGENDE HAELFTE IST DIE NEGATIVE: `FELD_ETIKETTEN` und `QUELLE_WOERTER`
     * VERLASSEN DEN LESEPFAD NICHT (`_lib/lesepfade/ereignisse.ts:36-37`, Aufgabenbrief V15
     * „Interfaces"). Zoege die Insel die Etikettenliste selbst, waere die Zuordnung an zwei
     * Stellen — und die Korrektur kaeme nur an einer an. Ausserdem ist jene Datei ein
     * WERTMODUL mit `drizzle-orm`-Import; ein Wertimport daraus zoege Drizzle ins
     * Browser-Bundle (`_lib/csv/klassifizieren.ts:6-9`).
     */
    await mount(
      <EreignisTabelle
        zeilen={[zeile({ feldEtikett: "Gerätefunktionen" }), zeile({ feldEtikett: "Lagerort" })]}
      />,
    );

    expect(texte("radio-ereignis-feld")).toEqual(["Gerätefunktionen", "Lagerort"]);

    const quelle = ohneKommentare(readFileSync(QUELLE_TABELLE, "utf8"));
    expect(
      quelle,
      "die Insel liest die Zuordnungen des Lesepfads selbst — sie bleiben serverseitig",
    ).not.toMatch(/FELD_ETIKETTEN|QUELLE_WOERTER/);
  });

  it("der aufgeloeste Name steht in der Zelle, der rohe sub im title", async () => {
    /*
     * `Spec:4772`: „Wer (aufgelöster Name aus `users`, roher `sub` nur im `title`)".
     * ⛔ BEIDE, AN VERSCHIEDENEN STELLEN — und der Fall misst genau die Trennung: die Zelle
     * darf den `sub` NICHT tragen, sonst waere die Zusage mit einer einzigen Zeile
     * („`{z.werSub}` statt `{z.werText}`") verloren und alles uebrige bliebe gruen.
     *
     * ⛔ UND OHNE URHEBER KEIN LEERES `title`: `changed_by` ist nullable (`_db/schema.ts:133`),
     * und jede per CSV importierte Zeile traegt ihn gar nicht — der Lesepfad liefert dann
     * `werSub: ""` (`_lib/lesepfade/ereignisse.test.ts:426-445`). Ein `title=""` waere ein
     * leerer Sprechblasentext auf jeder importierten Zeile.
     */
    await mount(
      <EreignisTabelle
        zeilen={[
          zeile({ werText: "Anna Beispiel", werSub: "sub-anna" }),
          zeile({ werText: "—", werSub: "" }),
        ]}
      />,
    );

    const zellen = queryAll('[data-rolle="radio-ereignis-wer"]');
    expect(zellen.length, "die Wer-Spalte fehlt").toBe(2);
    expect((zellen[0]!.textContent ?? "").trim()).toBe("Anna Beispiel");
    expect(
      (zellen[0]!.textContent ?? "").includes("sub-anna"),
      "der rohe sub steht in der Zelle statt im title",
    ).toBe(false);
    expect(zellen[0]!.getAttribute("title")).toBe("sub-anna");
    expect(
      zellen[1]!.getAttribute("title"),
      "eine Zeile ohne Urheber traegt ein leeres title",
    ).toBeNull();
  });

  it("jeder der vier Quellwerte bekommt seinen eigenen Ton, und der Tag zeigt das WORT, nicht den Rohwert", async () => {
    /*
     * `Spec:4772-4773`: „`source` wird als `Tag` gezeigt, mit den vier Wörtern in Klartext:
     * „von Hand", „CSV-Import", „angelegt", „Abweichung"."
     *
     * ⛔ `toBe(4)` AUSSERHALB DER SCHLEIFE — eine Zusicherung nur INNERHALB waere ueber einer
     * geschrumpften Zuordnung still gruen (dieselbe Fehlerform wie NT11).
     *
     * ⛔ UND „SEINEN EIGENEN" IST WOERTLICH ZU NEHMEN: vier Werte auf DREI Toene waeren
     * zwei Quellen, die sich auf dem Bildschirm nicht unterscheiden lassen. Deshalb die
     * zweite Zahl ueber der Menge der Toene.
     *
     * ⛔ KEIN ROTTON, IN KEINEM DER VIER: `colorError === colorPrimary`
     * (`src/core/theme/theme.ts:32-33`) — ein rotes Zeichen auf einer Datenflaeche saehe aus
     * wie eine Primaeraktion (Falle 3). Rot bleibt allein den zerstoerenden Knoepfen.
     *
     * ⚠️ DIE VOLLZAEHLIGKEIT DER WOERTER PRUEFT V7 AM LESEPFAD („jedes der vier Quellwoerter
     * hat ein Klartextwort"); hier steht die TONZUORDNUNG und die Zusage, dass die Zelle das
     * Wort und nicht den Rohwert zeigt.
     */
    const woerter: Record<string, string> = {
      manual: "von Hand",
      "csv-import": "CSV-Import",
      create: "angelegt",
      "update-note": "Abweichung",
    };

    expect(Object.keys(QUELLE_TON).length, "vier Quellwerte (Spec:4772-4773)").toBe(4);
    expect(Object.keys(QUELLE_TON).sort()).toEqual(["create", "csv-import", "manual", "update-note"]);
    expect(
      new Set(Object.values(QUELLE_TON)).size,
      "zwei Quellen teilen sich einen Ton — sie waeren nicht zu unterscheiden",
    ).toBe(4);
    expect(
      Object.values(QUELLE_TON).filter((ton) => ton === "red" || ton === "error"),
      "ein Rotton auf einer Datenflaeche (Falle 3)",
    ).toEqual([]);

    const roh = Object.keys(QUELLE_TON);
    await mount(
      <EreignisTabelle
        zeilen={roh.map((wert) => zeile({ quelle: wert, quelleWort: woerter[wert]! }))}
      />,
    );

    const marken = queryAll('[data-rolle="radio-ereignis-quelle"]');
    expect(marken.length, "die Quellmarke fehlt").toBe(4);
    roh.forEach((wert, i) => {
      const marke = marken[i]!;
      expect((marke.textContent ?? "").trim(), `${wert}: der Tag zeigt nicht das Wort`).toBe(
        woerter[wert]!,
      );
      expect(
        (marke.textContent ?? "").includes(wert),
        `${wert}: der Tag zeigt den Rohwert statt des Klartextworts`,
      ).toBe(false);
      expect(
        marke.classList.contains(`ant-tag-${QUELLE_TON[wert]!}`),
        `${wert}: der Tag traegt seinen Ton nicht (antd/es/tag/index.js:94)`,
      ).toBe(true);
    });
  });

  it("ein fuenfter, unbekannter Quellwert bekommt KEINEN Ton und stuerzt nicht ab", async () => {
    /*
     * ⛔ DER FALL, DER DEN ERSCHOEPFENDEN SWITCH BEWEIST. Das Schema fuehrt `source` als
     * Drizzle-Enum OHNE DB-Check (`_db/schema.ts:135-137`, woertlich): „Die Datenbank
     * akzeptiert JEDEN String; ein fuenfter Wert passiert Datenbank und Typpruefung
     * unbeanstandet und bricht erst in einem erschoepfenden Switch der Oberflaeche."
     *
     * ⛔ ER BRAUCHT `quelle` ALS ROHWERT IN DER ZEILE — und genau das belegen die ZWEI
     * Fixtures hier, jedes fuer eine andere Haelfte:
     *
     *   `geist`     — ein gewoehnlicher Unbekannter. Er belegt „stuerzt nicht ab" und
     *                 „bekommt keinen Ton". Der Lesepfad faellt fuer ihn auf den ROHEN Wert
     *                 als Wort zurueck (`_lib/lesepfade/ereignisse.ts`, `QUELLE_WOERTER[...] ?? e.source`).
     *   `angelegt`  — ⛔ EIN UNBEKANNTER, DESSEN RUECKFALLWORT MIT DEM KLARTEXTWORT VON
     *                 `create` ZUSAMMENFAELLT. Er ist die einzige Form, die „Ton aus dem
     *                 ROHWERT" von „Ton aus dem WORT" trennt: leitete die Insel ihren Ton aus
     *                 `quelleWort` ab, bekaeme diese Zeile den Ton von `create` — obwohl die
     *                 Quelle unbekannt ist. Das ist Sonde **S-V15d**, und ohne diese zweite
     *                 Zeile waere sie 0 rot. Der Lesepfad schreibt denselben Gedanken in den
     *                 Kopf von `EreignisZeile`: „Traege die Zeile nur das Wort, koennte die
     *                 Insel einen fuenften Wert nicht mehr von den vier bekannten
     *                 unterscheiden."
     */
    await mount(
      <EreignisTabelle
        zeilen={[
          zeile({ quelle: "geist", quelleWort: "geist" }),
          zeile({ quelle: "angelegt", quelleWort: "angelegt" }),
        ]}
      />,
    );

    const marken = queryAll('[data-rolle="radio-ereignis-quelle"]');
    expect(marken.length, "eine unbekannte Quelle hat die Zeile verschluckt").toBe(2);
    expect(marken.map((m) => (m.textContent ?? "").trim())).toEqual(["geist", "angelegt"]);
    for (const marke of marken) {
      const getragen = Object.values(QUELLE_TON).filter((ton) =>
        marke.classList.contains(`ant-tag-${ton}`),
      );
      expect(
        getragen,
        `${marke.textContent}: ein unbekannter Quellwert hat einen der vier Toene bekommen`,
      ).toEqual([]);
    }
  });

  it("ohne Ereignisse steht ein Leertext statt einer leeren Tabelle", async () => {
    /*
     * Sonst sieht die Seite kaputt aus: ein Tabellenkopf ueber nichts liest sich wie ein
     * Ladefehler, nicht wie „hier ist nichts passiert". ⛔ DIE TABELLE WIRD GAR NICHT ERST
     * GEBAUT — `locale={{ emptyText }}` liesse ihre Huelle stehen (die Form, die
     * `GeraeteTabelle.tsx:479` fuehrt, weil dort eine Suche mit Filtern darueber steht und
     * die Spalten die Auskunft geben, WONACH gesucht wurde). Hier gibt es weder Suche noch
     * Filter, also traegt der Kopf keine Auskunft.
     *
     * ⚠️ KEIN UMLAUT ALS ANKER (Hausregel): gepruefte Groesse ist die ROLLE des Knotens, nicht
     * sein Text.
     */
    await mount(<EreignisTabelle zeilen={[]} />);

    expect(exists('[data-rolle="radio-ereignis-leer"]'), "kein Leertext").toBe(true);
    expect(exists("table"), "eine leere Tabellenhuelle statt des Leertexts").toBe(false);
    expect(exists('[data-rolle="radio-ereignis-flaeche"]'), "die Flaeche fehlt ganz").toBe(true);
  });
});

describe("radio-Ereignisse: die Bauform der Insel und ihrer Seite", () => {
  it("die Datei der Insel traegt use client als erste Zeile", () => {
    /*
     * ⛔ FALLE 9 (Bauform-Zulaessigkeitstafel Nr. 1): die vier Spalten fuehren vier
     * `render`-Funktionen. Aus einer Server Component ueber die Grenze gereicht:
     * `Error: Functions cannot be passed directly to Client Components`. ⛔ DIE MENGE WIRD
     * GEFUNDEN, NICHT AUFGEZAEHLT (R-V11-1).
     */
    const gefunden = inselDateien();
    expect(gefunden, "eine Datei ist dazugekommen oder verschwunden").toEqual(INSEL_SOLL);
    for (const datei of gefunden) {
      const quelle = readFileSync(`${INSEL_ORDNER}/${datei}`, "utf8");
      expect(quelle.trimStart().split("\n")[0]!.trim(), `${datei}: keine Direktive`).toMatch(
        /^["']use client["'];?$/,
      );
    }
  });

  it("keine Datei der Insel zieht _db/ oder drizzle-orm in den Browser", () => {
    /*
     * ⛔ DER FEHLER WAR IN V13 EINMAL GEBAUT, und alle fuenf Tore blieben gruen
     * (`.superpowers/sdd/planteil4/BERICHT-V13.md`): eine Insel-Datei las einen WERT aus
     * einem Lesepfad, und jene Datei importiert `drizzle-orm` und `_db/schema` als Werte.
     * ⛔ HIER IST DIE GEFAHR NAMENTLICH: `_lib/lesepfade/ereignisse.ts` traegt den Typ
     * `EreignisZeile` UND die zwei Zuordnungslisten — er darf NUR als `import type`
     * vorkommen, und ein `import type` ist eine EIGENE Anweisung, kein `type` in einer
     * gemischten Klammer.
     *
     * ⛔ ER FOLGT DEM IMPORTGRAPHEN, ER LIEST NICHT NUR DIE WURZELN (Ruling R-V11-3: „Ein
     * Gegen-`grep` mit Dateiliste prueft die Liste, nicht die Klasse"). ⚠️ Die Untergrenze
     * ist hier die WURZELZAHL und nicht mehr: im gruenen Zustand zieht die Insel gar keinen
     * relativen Wert, es gibt also nichts zu laufen. Genau das ist die Aussage — faellt das
     * `type` weg, waechst die Menge um `_lib/lesepfade/ereignisse.ts`, und der Walker findet
     * dort `drizzle-orm`.
     *
     * ⚠️ ER IST DIE UNTERGRENZE, NICHT DER BEWEIS: keine dynamischen Importe, kein
     * Seiteneffekt-Import. Was das Bundle wirklich enthaelt, zeigt erst `pnpm build` (V23).
     */
    const gefunden = inselDateien();
    expect(gefunden, "eine Datei ist dazugekommen oder verschwunden").toEqual(INSEL_SOLL);
    const WURZELN = gefunden.map((datei) => `${INSEL_ORDNER}/${datei}`);

    /** Ein `import`/`export … from` mit seiner Typ-Markierung und seinem Modulpfad. */
    const BEZUG = /\b(?:import|export)\s+(type\s+)?([^;]*?)\s*from\s*["']([^"']+)["']/g;

    function aufloesen(vonDatei: string, spezifizierer: string): string | null {
      if (!spezifizierer.startsWith(".")) return null;
      const basis = normalize(join(dirname(vonDatei), spezifizierer));
      for (const kandidat of [`${basis}.ts`, `${basis}.tsx`, join(basis, "index.ts")]) {
        if (existsSync(kandidat)) return kandidat;
      }
      return null;
    }

    const gesehen = new Set<string>(WURZELN);
    const offen = [...WURZELN];
    const verstoesse: string[] = [];

    /*
     * ⛔ AN EINER `"use server"`-DATEI ENDET DER GRAPH, UND DAS IST DIE GRENZE SELBST: Next
     * ersetzt den Import durch eine Referenz, die Datei wird nie ins Client-Bundle kopiert.
     */
    const istServerModul = (datei: string): boolean =>
      /^["']use server["'];?$/.test(readFileSync(datei, "utf8").trimStart().split("\n")[0]!.trim());

    while (offen.length > 0) {
      const datei = offen.pop()!;
      if (istServerModul(datei)) continue;
      const quelle = ohneKommentare(readFileSync(datei, "utf8"));
      for (const treffer of quelle.matchAll(BEZUG)) {
        const nurTyp = treffer[1] !== undefined;
        const spezifizierer = treffer[3]!;
        if (nurTyp) continue;
        if (/^(?:drizzle-orm|node:|better-sqlite3)(?:\/|$)/.test(spezifizierer)) {
          verstoesse.push(`${datei}: Wertimport von ${spezifizierer}`);
          continue;
        }
        const ziel = aufloesen(datei, spezifizierer);
        if (ziel === null) continue;
        if (/[/\\]_db[/\\]/.test(ziel)) {
          verstoesse.push(`${datei}: Wertimport aus _db/ (${spezifizierer})`);
          continue;
        }
        if (!gesehen.has(ziel)) {
          gesehen.add(ziel);
          offen.push(ziel);
        }
      }
    }

    expect(gesehen.size, "der Walker hat die Wurzeln nicht gelesen").toBeGreaterThanOrEqual(
      WURZELN.length,
    );
    expect(verstoesse).toEqual([]);
  });

  it("die Seite traegt den Riegel der Verwaltungs-Stufe und antwortet mit notFound", () => {
    /*
     * ⛔ `Spec:4372`: die Aenderungshistorie ist eine der Flaechen, die auch eine
     * Updater-Person sieht (Rechtetafel `Spec:4444-4454`: „Uebersicht, Geraeteliste,
     * Geraetedetail, Ereignisse, Ausleihen | ja | ja").
     *
     * ⛔ UND DIESE ZEILE IST DER EINZIGE WAECHTER DAGEGEN. `riegel.test.ts` faengt eine
     * faelschlich ANGEHOBENE Seite im `(arbeit)`-Zweig strukturell NICHT — die ODER-Klausel
     * dort laesst beide Namen zu (`riegel.test.ts:253-262`), und zwar absichtlich, sonst
     * waere der Scan gegen `Spec:4367` rot-by-construction. Eine Seite mit
     * `requireRadioAdmin()` bestuende jedes Tor und sperrte jede Updater-Person mit 404 aus
     * einer Flaeche, die ihr gehoert.
     *
     * ⛔ UND EIN FEHLENDES GERAET IST `notFound()`, NICHT EINE FEHLERSEITE
     * (`radio-admin/server/src/routes/devices.ts:68`, `:84`). Der Alt-Handler antwortet fuer
     * ein unbekanntes Geraet mit 404, bevor er die Ereignisse liest; hier ist der 404 der
     * Statuscode der Seite selbst.
     *
     * ⛔ Ueber `ohneKommentare`: der Kopfkommentar der Seite nennt beide Riegelnamen, um die
     * Stufenwahl zu begruenden.
     */
    const quelle = ohneKommentare(readFileSync(QUELLE_SEITE, "utf8"));
    expect(quelle).toMatch(/await requireRadioVerwaltung\(\)/);
    expect(quelle, "auf die Admin-Stufe angehoben — jede Updater-Person bekaeme 404").not.toMatch(
      /\brequireRadioAdmin\s*\(/,
    );
    expect(quelle, "ein fehlendes Geraet endet nicht in notFound()").toMatch(/notFound\(\)/);
  });

  it("die Seite reicht KEINE Funktion und KEIN Date ueber die Grenze", () => {
    /*
     * Bauform-Zulaessigkeitstafel Nr. 6 und 7 (`Spec:4495-4497`, `Spec:4536-4539`): ueber die
     * Insel-Grenze gehen nur serialisierbare, VORFORMATIERTE Werte. Die Muster zielen auf die
     * KLASSE, nicht auf eine Schreibweise.
     */
    const quelle = ohneKommentare(readFileSync(QUELLE_SEITE, "utf8"));
    expect(quelle, "eine Action als Prop").not.toMatch(/=\{[^}]*Action\b/);
    expect(quelle, "eine Pfeilfunktion als Prop").not.toMatch(/=\{[^}]*=>/);
    expect(quelle, "ein Date in der Seite").not.toMatch(/\bnew Date\(/);
  });

  it("die Seite liest die Historie mit der Grenze des Lesepfads und verlinkt zurueck auf die Akte", () => {
    /*
     * ⛔ DER DECKEL IST EINE KONSTANTE DES LESEPFADS, KEINE ZAHL IN DER SEITE
     * (`_lib/lesepfade/ereignisse.ts`, `EREIGNIS_GRENZE = 200`; ⬜ **V-L7**, abzulesen bei der
     * Generalprobe). Schriebe die Seite die 200 selbst hin, stuenden zwei Zahlen da, und die
     * Ablesung korrigierte nur eine.
     *
     * ⛔ UND DIE ADRESSEN IN DER AEUSSEREN FORM `/admin/...`, nie `/m/radio/admin/...`
     * (`_lib/nav.test.ts:134-152`, dort als echter 404 gemessen: ein innerer Pfad fuehrt auf
     * dem Verwaltungshost auf `/m/radio/m/radio/...`, und typecheck wie lint bleiben gruen).
     *
     * ⚠️ DER RUECKWEG IST EINE BENANNTE ERWEITERUNG UEBER `Spec:4759-4776` HINAUS: die Flaeche
     * haengt an KEINEM Navigationseintrag (`_lib/nav.ts` fuehrt sie nicht), sie ist allein
     * ueber die Akte erreichbar. Ohne Rueckweg endet der Weg dort.
     */
    const quelle = ohneKommentare(readFileSync(QUELLE_SEITE, "utf8"));
    expect(quelle, "die Historie wird gar nicht erst gelesen").toMatch(
      /ereignisseFuerGeraet\(db, id\)/,
    );
    expect(quelle, "die Seite schreibt den Deckel selbst hin statt ihn zu erben").not.toMatch(
      /\b200\b/,
    );
    expect(quelle, "die Zeilen erreichen die Insel nicht").toMatch(/zeilen=\{zeilen\}/);
    expect(quelle, "kein Rueckweg auf die Geraeteakte").toMatch(
      /href=\{`\/admin\/geraete\/\$\{akte\.id\}`\}/,
    );
    expect(quelle, "innere Pfadform in einem href — sie gehoert allein revalidatePath").not.toMatch(
      /href=\{?["'`]?\/m\/radio/,
    );
  });
});
