// @vitest-environment jsdom
// src/app/m/radio/admin/(arbeit)/software/UpdateSuche.test.tsx
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join, normalize } from "node:path";

/**
 * INSEL 7 — DER UPDATE-MODUS (`Spec:4509`, §5.6.1; Aufgabe V17).
 *
 * ⛔ `// @vitest-environment jsdom` ALS ERSTE ZEILE. `vitest.config.ts:7` setzt
 * `environment: "node"` global und kennt kein `environmentMatchGlobs`; ohne die Zeile stirbt
 * jeder `mount()` an `document is not defined` (Vorbild `_ui/GeraeteListe.test.tsx:1`).
 *
 * ⛔ DAS ETABLIERTE HARNESS, KEIN ZWEITES (`CLAUDE.md`, „Tests"):
 * `src/app/m/qr/_lib/test-dom.tsx`.
 *
 * ⚠️ DER BLINDE FLECK, GEERBT UND BENANNT: **Falle 1**. In jsdom gibt es keine RSC-Grenze —
 * `Input.Search`, `Typography.Title` und `AutoComplete` sind hier gewoehnliche Komponenten.
 * Zoege jemand die Flaeche in die Server Component, bliebe JEDER Fall dieser Datei gruen und
 * der Abruf antwortete mit HTTP 500. Der Waechter dagegen ist der Playwright-Fall
 * (`Spec:4881-4882`, Fall 6 in `e2e/radio-verwaltung.spec.ts`) — gefahren in Aufgabe V23.
 *
 * ⛔ WAS DIESE DATEI ZUSAETZLICH ZUM AUFGABENBRIEF HAELT: die SERVERSEITIGEN Haelften der
 * 1:1-Posten „Suche auf drei Feldern" und „`pageSize: 25`". Beide entscheidet seit
 * ⛔ **E-V17** (siehe `page.tsx`) die Seite und nicht die Insel; eine Zusicherung, die nur die
 * Insel misst, waere gegen eine vierte Spalte oder eine geaenderte Seitengroesse blind.
 */

/*
 * ⛔ `vi.hoisted`, WEIL `vi.mock` AN DEN DATEIANFANG GEHOBEN WIRD. Ein gewoehnliches
 * `const aendernMock = vi.fn()` darueber ist zur Ausfuehrungszeit der Fabrik noch nicht
 * initialisiert (gemessen in V13: `ReferenceError: Cannot access ... before initialization`,
 * und die ganze Datei faellt aus, nicht ein Fall).
 *
 * ⛔ DIE ZWEI ACTIONS WERDEN DIREKT IMPORTIERT UND NICHT ALS PROP GEREICHT
 * (Bauform-Zulaessigkeitstafel Nr. 6, `Spec:4495-4497`) — deshalb ist der Modulersatz der
 * einzige Weg, sie im Test abzugreifen.
 */
const { aendernMock, notizMock } = vi.hoisted(() => ({
  aendernMock: vi.fn(),
  notizMock: vi.fn(),
}));
vi.mock("../../actions", () => ({
  geraetAendernAction: aendernMock,
  notizAnfuegenAction: notizMock,
}));

/*
 * ⚠️ OHNE DIESEN ERSATZ STIRBT JEDER `mount()` AN `invariant expected app router to be
 * mounted`: die Insel schreibt ihren Suchtext ueber `router.replace` in die Adresszeile
 * (Regime B, E-V17).
 */
const { replaceMock } = vi.hoisted(() => ({ replaceMock: vi.fn() }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: replaceMock, push: vi.fn() }),
  usePathname: () => "/admin/software",
}));

const INSEL_ORDNER = "src/app/m/radio/admin/(arbeit)/software";
const QUELLE_INSEL = `${INSEL_ORDNER}/UpdateSuche.tsx`;
const QUELLE_SEITE = `${INSEL_ORDNER}/page.tsx`;

/**
 * DIE DATEIEN DER INSEL — ⛔ GEFUNDEN, NICHT AUFGEZAEHLT (Ruling **R-V11-1**,
 * `.superpowers/sdd/planteil4/progress.md`, Abschnitt „Rulings"). Gemessen in der
 * Schlusspruefung zu V13 (Fund M2): eine zusaetzliche Datei in einem Inselverzeichnis, ohne
 * Bauform-Direktive UND mit einem Wertimport aus `_db/schema`, liess eine handgeschriebene
 * Namensliste voellig unbeeindruckt.
 *
 * ⛔ DER AUSSCHLUSS STEHT AM BLATT UND NICHT AM AST (Ruling **R-V11-3**).
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
const INSEL_SOLL = ["UpdateSuche.tsx"];

import { act } from "react";
import { click, exists, fill, mount, query, queryAll, unmount } from "@/app/m/qr/_lib/test-dom";
import { ohneKommentare } from "../../../_lib/quelltextScan";
import { SUCHFELDER, UPDATE_SEITENGROESSE, UPDATE_SUCHFELDER } from "../../../_lib/geraeteFelder";
import { UPDATER_FELDER } from "../../../_lib/rollen";
import type { UpdateKarteZeile } from "../../../_lib/lesepfade/geraete";
import { UpdateSuche } from "./UpdateSuche";

/** Das Zielversionsfeld und das Suchfeld — ueber `id`, wie `_ui/AusleihVorgang.test.tsx:46`. */
const ZIELFELD = "#radio-update-ziel";
const SUCHFELD = "#radio-update-suche";

/**
 * Eine Karte, wie der Lesepfad sie liefert — VORFORMATIERT und serialisierbar, ohne `Date`
 * (Bauform-Zulaessigkeitstafel Nr. 7). `updateAnmerkung` ist die benannte Erweiterung aus
 * ⛔ **E-V17b** (`_lib/lesepfade/geraete.ts`, `updateKarten`).
 */
function karte(teil: Partial<UpdateKarteZeile> = {}): UpdateKarteZeile {
  return {
    id: "g-1",
    issi: "1234567",
    tei: null,
    rufname: "41/12",
    opta: "HE FD 41/12",
    funktion: "Zugführer",
    geraeteTyp: "MTP3550",
    status: "Einsatzbereit",
    lagerort: "Funkraum",
    hersteller: "Motorola",
    bedieneinheit: null,
    geraeteFunktionen: "TMO,DMO",
    zuordnung: null,
    seriennummer: null,
    ausleihbar: true,
    alamos: false,
    softwareVersion: "2.0.0",
    updateStand: "veraltet",
    hatAbweichung: false,
    letztesUpdateText: "2026-08-03",
    updateAnmerkung: null,
    ...teil,
  };
}

/** Die vorbelegten Props — jeder Fall aendert nur, worauf er zielt. */
function props(teil: Partial<Parameters<typeof UpdateSuche>[0]> = {}) {
  return {
    versionen: ["3.1.0", "2.0.0"],
    zielVersion: "3.1.0",
    gesamt: 40,
    aufZiel: 10,
    zeilen: [karte()],
    suchtext: "41/12",
    ...teil,
  };
}

/** Der Text jeder Zelle einer Rolle, ohne Randleerraum. */
function texte(rolle: string): string[] {
  return queryAll(`[data-rolle="${rolle}"]`).map((el) => (el.textContent ?? "").trim());
}

/**
 * ⛔ OHNE DIESE ZEILEN ZAEHLEN DIE FAELLE UEBEREINANDER. `vi.hoisted` legt jeden Ersatz EINMAL
 * fuer die ganze Datei an; ein zweiter Fall saehe die Aufrufe des ersten mit, und
 * `toHaveBeenCalledTimes(1)` waere von der Reihenfolge der Faelle abhaengig statt von der
 * Sache. Dieselbe Vorkehrung und derselbe Grund wie in `AusleihenTabelle.test.tsx`.
 */
beforeEach(() => {
  replaceMock.mockReset();
  aendernMock.mockReset();
  aendernMock.mockResolvedValue({ ok: true });
  notizMock.mockReset();
  notizMock.mockResolvedValue({ ok: true });
  window.history.replaceState({}, "", "/admin/software");
});

afterEach(async () => {
  await unmount();
  vi.useRealTimers();
});

/** Der Patch des einzigen `geraetAendernAction`-Aufrufs. */
function gesendeterPatch(): Record<string, unknown> {
  return aendernMock.mock.calls[0]![1] as Record<string, unknown>;
}

describe("radio-Update-Modus: die Suche", () => {
  it("ohne Suchtext wird kein Geraet gezeigt", async () => {
    /*
     * ⛔ 1:1 `UpdateMode.tsx:67-68` — UND NICHT „eine leere Liste", SONDERN DER LEERTEXT.
     * Die Aussage ist die Aufforderung, nicht die Abwesenheit von Zeilen.
     *
     * ⛔ DIE PROPS SIND ADVERSARIAL: `zeilen` ist NICHT leer. Ein Fixture mit leerer Liste
     * bestuende jede Fassung — auch die, die den Leerzweig gar nicht hat —, und die Sonde
     * S-V17a („die Liste ohne Suchtext laden") waere 0 rot by construction.
     *
     * ⛔ DIE ZWEITE HAELFTE, DER SERVER, STEHT WEITER UNTEN („die Seite laedt ohne Suchtext
     * gar nichts"): hier haengt nur die Anzeige, dort das Vorab-Laden.
     */
    await mount(<UpdateSuche {...props({ suchtext: "", zeilen: [karte()] })} />);

    expect(texte("radio-update-leer")).toEqual(["Gerät suchen, um es zu aktualisieren"]);
    expect(queryAll('[data-rolle="radio-update-karte"]').length, "eine Karte trotz leerer Suche").toBe(0);
  });

  it("mit Suchtext und ohne Treffer steht der ANDERE Leertext", async () => {
    /*
     * ⛔ DER ZWEITE `Empty`-ZWEIG, 1:1 `UpdateMode.tsx:76`. Ohne ihn faellt eine erfolglose
     * Suche auf den Aufforderungstext zurueck — und der Bedienende liest „such doch", obwohl
     * er gerade gesucht hat.
     */
    await mount(<UpdateSuche {...props({ suchtext: "gibtesnicht", zeilen: [] })} />);

    expect(texte("radio-update-leer")).toEqual(["Kein Gerät gefunden"]);
  });

  it("die Suche greift auf genau drei Felder", async () => {
    /*
     * ⛔ `toEqual`, 1:1 `UpdateMode.tsx:8` (`const SEARCH_FIELDS = ['issi', 'rufname',
     * 'opta']`). Eine vierte Spalte bestuende jede Enthaltensein-Pruefung.
     *
     * ⛔ UND DIE ZWEITE ZUSICHERUNG IST DIE, DIE NICHT TAUTOLOGISCH IST: jeder der drei Namen
     * muss in der Allowlist des Servers stehen (`SUCHFELDER`, `_lib/geraeteFelder.ts`). Der
     * Grund steht dort ausgeschrieben — waehlt die Flaeche ausschliesslich Felder, die der
     * Lesepfad nicht kennt, greift der Sicherheitszweig `sql\`0\`` und die Suche liefert fuer
     * JEDEN Begriff KEINE Zeile, bei gruenem typecheck, lint, build und Test.
     */
    expect([...UPDATE_SUCHFELDER]).toEqual(["issi", "rufname", "opta"]);
    for (const feld of UPDATE_SUCHFELDER) {
      expect(SUCHFELDER as readonly string[], `${feld} steht nicht in der Allowlist`).toContain(feld);
    }
  });

  it("die Seitengroesse des Update-Modus ist 25", async () => {
    /*
     * ⛔ 1:1 `UpdateMode.tsx:29` (`pageSize: 25`) — und NICHT die 20 der Geraeteliste
     * (`SEITEN_GROESSE`, `_lib/suchparameter.ts:49`). Die zwei Flaechen haben verschiedene
     * Zahlen, und sie stehen deshalb als zwei benannte Konstanten da.
     */
    expect(UPDATE_SEITENGROESSE).toBe(25);
  });

  it("die Suche schreibt die Adresszeile ENTPRELLT, nicht bei jedem Anschlag", async () => {
    /*
     * ⛔ 300 ms, 1:1 `UpdateMode.tsx:24-27`. In Regime B ist die Entprellung nicht Kosmetik:
     * ohne sie stiesse JEDER Tastenanschlag einen Serverlauf mit einer neuen Adresse an.
     *
     * ⛔ ZWEI MESSPUNKTE, UND DER ERSTE IST DER TRAGENDE: vor Ablauf der Frist darf NICHTS
     * geschrieben sein. Ein Fall, der nur das Ende misst, bestuende auch eine Fassung ohne
     * jede Entprellung.
     */
    vi.useFakeTimers();
    await mount(<UpdateSuche {...props({ suchtext: "" })} />);
    await fill(SUCHFELD, "41/12");

    await act(async () => {
      await vi.advanceTimersByTimeAsync(200);
    });
    expect(replaceMock, "die Suche schreibt ohne Entprellung").toHaveBeenCalledTimes(0);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(200);
    });
    expect(replaceMock, "die Entprellung schreibt nie").toHaveBeenCalledTimes(1);
    const ziel = String(replaceMock.mock.calls[0]![0]);
    expect(ziel, "die Insel schreibt einen fremden Pfad").toMatch(/^\/admin\/software\?/);
    expect(new URLSearchParams(ziel.split("?")[1]).get("q")).toBe("41/12");
  });
});

describe("radio-Update-Modus: Zielversion und Fortschritt", () => {
  it("die Zielversion ist mit der markierten Version vorbelegt", async () => {
    /*
     * ⛔ 1:1 `UpdateMode.tsx:17-22`: der Bestand belegt das Feld mit der `isTarget`-Version
     * vor, sobald die Liste geladen ist. In der Suite liefert der Server sie bereits als Prop
     * (`zielVersion`, `_lib/lesepfade/versionen.ts:112`) — der Effekt entfaellt, die Zusage
     * nicht.
     *
     * ⛔ UND DIE VORBELEGUNG MUSS AM KNOPF ANKOMMEN, NICHT NUR IM FELD: die Beschriftung
     * traegt sie („Auf <version> aktualisiert", `UpdateDeviceCard.tsx:57`), und genau sie
     * entscheidet, was ein Tap sendet.
     */
    await mount(<UpdateSuche {...props()} />);

    expect(query<HTMLInputElement>(ZIELFELD).value).toBe("3.1.0");
    expect(texte("radio-update-tap")).toEqual(["Auf 3.1.0 aktualisiert"]);
  });

  it("die Zielversion ist aenderbar", async () => {
    /*
     * ⛔ DIE GEGENPROBE ZUR VORBELEGUNG — ohne sie waere die Vorbelegung eine SPERRE. Der
     * Bestand setzt sie nur, solange nichts gewaehlt ist (`UpdateMode.tsx:18`), und sein
     * `onChange` (`:49`) schreibt frei weiter.
     *
     * ⛔ UND DER GEAENDERTE WERT MUSS BIS IN DEN GESENDETEN PATCH DURCHSCHLAGEN: eine Fassung,
     * die nur das Feld beschriftet und beim Tap die Vorbelegung schickt, saehe auf dem
     * Bildschirm richtig aus und schriebe die falsche Version in die Datenbank.
     */
    await mount(<UpdateSuche {...props()} />);
    await fill(ZIELFELD, "2.0.0");

    expect(query<HTMLInputElement>(ZIELFELD).value).toBe("2.0.0");
    expect(texte("radio-update-tap")).toEqual(["Auf 2.0.0 aktualisiert"]);

    await click('[data-rolle="radio-update-tap"]');
    expect(gesendeterPatch().softwareVersion, "der Tap schickt die alte Version").toBe("2.0.0");
  });

  it("der Fortschritt bleibt aus, solange es kein Geraet gibt", async () => {
    /*
     * ⛔ 1:1 `UpdateMode.tsx:53` (`{total > 0 && …}`). Ohne die Bedingung rechnete
     * `Math.round((done / total) * 100)` bei `total === 0` ein `NaN` in den `Progress` — und
     * die leere Datenbank zeigte einen Balken ohne Zahl.
     *
     * ⛔ BEIDE HAELFTEN, sonst bestuende eine Fassung ohne jeden Fortschritt.
     */
    await mount(<UpdateSuche {...props({ gesamt: 0, aufZiel: 0 })} />);
    expect(exists('[data-rolle="radio-update-fortschritt"]'), "ein Balken ohne Geraete").toBe(false);

    await unmount();
    await mount(<UpdateSuche {...props({ gesamt: 40, aufZiel: 10 })} />);
    expect(texte("radio-update-fortschritt-text")).toEqual(["10 von 40 auf Zielversion"]);
  });

  it("der Aktualisieren-Knopf ist gesperrt, solange keine Zielversion gewaehlt ist", async () => {
    /*
     * ⛔ 1:1 `UpdateDeviceCard.tsx:56` (`disabled={!targetVersion}`). Ohne die Sperre schriebe
     * ein Tap `softwareVersion: ""` — ein Geraet ohne Version, das der Update-Stand danach als
     * „unbekannt" fuehrt (`_lib/updateStand.ts`), und niemand saehe die Ursache.
     *
     * ⛔ DER GEGENFALL STEHT DANEBEN: mit gesetzter Zielversion ist der Knopf offen. Sonst
     * bestuende eine Fassung, die IMMER sperrt.
     */
    await mount(<UpdateSuche {...props({ zielVersion: null, versionen: [] })} />);
    expect(query<HTMLButtonElement>('[data-rolle="radio-update-tap"]').disabled).toBe(true);

    await unmount();
    await mount(<UpdateSuche {...props()} />);
    expect(query<HTMLButtonElement>('[data-rolle="radio-update-tap"]').disabled).toBe(false);
  });

  it("der Hinweis steht woertlich ueber der Flaeche", async () => {
    /*
     * ⛔ 1:1 `UpdateMode.tsx:40`. Er ist die einzige Stelle, an der der Flaeche ihre
     * FACHLICHE Auflage anhaengt: „Nur die Geräte, die du wirklich aktualisiert hast" — ein
     * Tap ist eine Behauptung ueber die Wirklichkeit, kein Filter.
     */
    await mount(<UpdateSuche {...props()} />);

    expect(texte("radio-update-hinweis")).toEqual([
      "Gerät suchen, mit einem Tap auf die Zielversion setzen. Nur die Geräte, die du wirklich aktualisiert hast.",
    ]);
  });
});

describe("radio-Update-Modus: was ein Tap schreibt", () => {
  it("ein Tap sendet genau YYYY-MM-DD, keine Uhrzeit", async () => {
    /*
     * ⛔ DIE ZWEITE HAELFTE VON **E-V11**, UND DER TYP FAENGT SIE NICHT. Die Suite-Spalte ist
     * `text("last_updated_at")` (`_db/schema.ts:39`), ihr Drizzle-Typ also `string | null` —
     * JEDE uhrzeittragende Zeichenkette (`"2026-08-24 10:30"`, `new Date().toISOString()`)
     * uebersetzt sauber. Nur die ZAHL-Form des Bestands (`UpdateDeviceCard.tsx:24` setzt
     * `Date.now()`) erroret. ⛔ Ohne diesen Fall ist die Update-Modus-Haelfte von E-V11 durch
     * gar nichts bewacht.
     *
     * ⛔ REGEXFORM AUF DEM GESENDETEN WERT, NICHT `toBeTruthy` — „2026-08-24T08:30:00.000Z"
     * ist ebenso wahr wie „2026-08-24".
     */
    await mount(<UpdateSuche {...props()} />);
    await click('[data-rolle="radio-update-tap"]');

    expect(aendernMock, "der Tap hat nichts gesendet").toHaveBeenCalledTimes(1);
    expect(aendernMock.mock.calls[0]![0], "der Tap trifft das falsche Geraet").toBe("g-1");
    expect(gesendeterPatch().lastUpdatedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("ein Tap schreibt NUR Felder, die auch eine Updater-Person schreiben darf", async () => {
    /*
     * ⛔ DAS IST KEIN ZUFALL, SONDERN DER ZWECK DER ZWEITEN STUFE. Die Flaeche ist fuer BEIDE
     * Stufen offen (`Spec:4374`, Rechtetafel `Spec:4444-4454`: „Update-Modus … ja/ja"), und
     * der Feldriegel verwirft STILL, statt abzulehnen (`radio-admin/shared/src/editable-fields.ts:3`,
     * durchgesetzt in `filterSchreibbareFelder`, `_lib/rollen.ts:106`). Schriebe der Tap ein
     * viertes Feld mit, verschwaende es fuer eine Updater-Person geraeuschlos — der Knopf
     * meldete Erfolg, und die Haelfte der Aenderung waere weg.
     *
     * ⛔ ZWEI ZUSICHERUNGEN: der exakte Satz (`toEqual`, sonst bestuende ein fuenftes Feld die
     * Enthaltensein-Pruefung) UND die Deckung gegen `UPDATER_FELDER` (sonst bestuende ein
     * umbenanntes Feld den exakten Satz).
     */
    await mount(<UpdateSuche {...props()} />);
    await click('[data-rolle="radio-update-tap"]');

    const patch = gesendeterPatch();
    expect(Object.keys(patch).sort()).toEqual(["lastUpdatedAt", "softwareVersion"]);
    for (const feld of Object.keys(patch)) {
      expect(UPDATER_FELDER as readonly string[], `${feld} ist fuer die Updater-Stufe gesperrt`)
        .toContain(feld);
    }
  });

  it("die Anmerkung geht als GETRIMMTER Text an notizAnfuegenAction", async () => {
    /*
     * ⛔ DER ZWEITE KNOPF DER KARTE (`UpdateDeviceCard.tsx:59-61`, `:31-41`): leerer Text
     * laeuft gar nicht erst los, und gesendet wird der getrimmte. ⚠️ Die Wahrheit ist die
     * serverseitige Pruefung in `notizAnfuegenAction` — „eine Regel, die nur im Client steht,
     * ist keine Regel" (`Spec:3583-3585`); diese hier spart den Rundlauf.
     */
    await mount(<UpdateSuche {...props()} />);
    await click('[data-rolle="radio-update-anmerkung-knopf"]');

    await fill('[data-rolle="radio-update-anmerkung-feld"]', "   ");
    await click('[data-rolle="radio-update-anmerkung-speichern"]');
    expect(notizMock, "leerer Text laeuft los").toHaveBeenCalledTimes(0);

    await fill('[data-rolle="radio-update-anmerkung-feld"]', "  echte ISSI 7654321  ");
    await click('[data-rolle="radio-update-anmerkung-speichern"]');
    expect(notizMock).toHaveBeenCalledTimes(1);
    expect(notizMock.mock.calls[0]).toEqual(["g-1", "echte ISSI 7654321"]);
  });

  it("die gespeicherte Anmerkung steht auf der Karte", async () => {
    /*
     * ⛔ 1:1 `UpdateDeviceCard.tsx:74-78`, und der Posten haette beim Port still verschwinden
     * KOENNEN: `GeraetZeile` fuehrt nur `hatAbweichung: boolean`
     * (`_lib/lesepfade/geraete.ts:91`), nicht den Text. ⛔ Entscheidung **E-V17b** legt
     * deshalb `updateKarten` an — ohne sie schriebe der Bedienende dieselbe Abweichung ein
     * zweites Mal auf, weil er die erste nicht sieht.
     *
     * ⛔ UND DER LEERFALL DANEBEN: ohne ihn bestuende eine Fassung, die IMMER einen (leeren)
     * Absatz rendert.
     */
    await mount(
      <UpdateSuche
        {...props({
          zeilen: [
            karte({ updateAnmerkung: "2026-08-01: echte ISSI 7654321", hatAbweichung: true }),
            karte({ id: "g-2", issi: "7654322", rufname: "41/13", updateAnmerkung: null }),
          ],
        })}
      />,
    );

    expect(texte("radio-update-anmerkung-text")).toEqual(["2026-08-01: echte ISSI 7654321"]);
  });

  it("der Update-Stand wandert als WORT, nicht als Farbe", async () => {
    /*
     * ⛔ FALLE 3 (`Spec:4555-4561`, Regel 4 der Insel-Tafel): `colorError === colorPrimary`
     * (`src/core/theme/theme.ts:32-33`), ein rotes Zeichen auf einer Datenflaeche saehe aus
     * wie eine Primaeraktion. Der Alt-Ton `#cf1322` entfaellt.
     *
     * ⛔ DREI ZUSTAENDE MIT DREI VERSCHIEDENEN WOERTERN: ein Bau, der alle gleich beschriftet,
     * bestuende eine blosse „nicht leer"-Pruefung.
     */
    await mount(
      <UpdateSuche
        {...props({
          zeilen: [
            karte({ id: "g-1", updateStand: "aktuell" }),
            karte({ id: "g-2", updateStand: "veraltet" }),
            karte({ id: "g-3", updateStand: "unbekannt" }),
          ],
        })}
      />,
    );

    expect(texte("radio-update-stand")).toEqual(["Aktuell", "Veraltet", "Unbekannt"]);
  });

  it("die Karte nennt das Geraet nach Rufname, sonst OPTA, sonst ISSI", async () => {
    /*
     * ⛔ 1:1 `UpdateDeviceCard.tsx:48` (`device.rufname || device.opta || device.issi`) — mit
     * `||` und nicht `??`, weil alle drei Freitext sind und die LEERE Zeichenkette
     * weiterfallen muss.
     */
    await mount(
      <UpdateSuche
        {...props({
          zeilen: [
            karte({ id: "g-1" }),
            karte({ id: "g-2", rufname: "" }),
            karte({ id: "g-3", rufname: null, opta: null }),
          ],
        })}
      />,
    );

    expect(texte("radio-update-karte-name")).toEqual(["41/12", "HE FD 41/12", "1234567"]);
  });
});

describe("radio-Update-Modus: die Bauform der Insel und ihrer Seite", () => {
  it("die Datei der Insel traegt use client als erste Zeile", () => {
    /*
     * ⛔ FALLE 1 (Bauform-Zulaessigkeitstafel Nr. 3): `Input.Search`, `Typography.Title` und
     * `Space.Compact` sind Compound-Zugriffe — in einer Server Component HTTP 500. Dazu haelt
     * die Flaeche Zustand (Zielversion, Suchtext, Anmerkungsfeld).
     * ⛔ DIE MENGE WIRD GEFUNDEN, NICHT AUFGEZAEHLT (R-V11-1).
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
     * ⛔ DER FEHLER WAR IN V13 EINMAL GEBAUT, und alle fuenf Tore blieben gruen. ⛔ HIER IST
     * DIE GEFAHR NAMENTLICH: `_lib/lesepfade/geraete.ts` traegt den Typ `UpdateKarteZeile` UND
     * importiert `_db/schema` als WERT — er darf NUR als `import type` vorkommen, und ein
     * `import type` ist eine EIGENE Anweisung, kein `type` in einer gemischten Klammer.
     *
     * ⛔ ER FOLGT DEM IMPORTGRAPHEN, ER LIEST NICHT NUR DIE WURZELN (Ruling R-V11-3).
     * ⚠️ ER IST DIE UNTERGRENZE, NICHT DER BEWEIS: was das Bundle wirklich enthaelt, zeigt
     * erst `pnpm build` (V23).
     */
    const gefunden = inselDateien();
    expect(gefunden, "eine Datei ist dazugekommen oder verschwunden").toEqual(INSEL_SOLL);
    const WURZELN = gefunden.map((datei) => `${INSEL_ORDNER}/${datei}`);

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
    const gelesen = new Set<string>();

    const istServerModul = (datei: string): boolean =>
      /^["']use server["'];?$/.test(readFileSync(datei, "utf8").trimStart().split("\n")[0]!.trim());

    while (offen.length > 0) {
      const datei = offen.pop()!;
      if (istServerModul(datei)) continue;
      const quelle = ohneKommentare(readFileSync(datei, "utf8"));
      gelesen.add(datei);
      for (const treffer of quelle.matchAll(BEZUG)) {
        const nurTyp = treffer[1] !== undefined;
        const spezifizierer = treffer[3]!;
        if (nurTyp) continue;
        if (/^(?:drizzle-orm|node:|better-sqlite3|next\/headers)(?:\/|$)/.test(spezifizierer)) {
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

    expect(
      WURZELN.filter((wurzel) => !gelesen.has(wurzel)),
      "der Walker hat eine Wurzel nicht gelesen — er ist nicht gelaufen",
    ).toEqual([]);
    expect(verstoesse).toEqual([]);
  });

  it("die Seite traegt force-dynamic und den Riegel der Verwaltungs-Stufe", () => {
    /*
     * ⛔ `Spec:4374`: der Update-Modus ist eine der Flaechen, die auch eine Updater-Person
     * bedient — und er ist der WICHTIGSTE davon, denn die drei Felder, die er schreibt, sind
     * genau der Grund, aus dem die zweite Stufe existiert (Rechtetafel `Spec:4444-4454`:
     * „Update-Modus (`softwareVersion`, `lastUpdatedAt`, `status`) | ja | ja").
     *
     * ⛔ UND DIESE ZEILE IST DER EINZIGE WAECHTER DAGEGEN. `riegel.test.ts` faengt eine
     * faelschlich ANGEHOBENE Seite im `(arbeit)`-Zweig strukturell NICHT — die ODER-Klausel
     * dort laesst beide Namen zu (`riegel.test.ts:253-262`), und zwar absichtlich, sonst waere
     * der Scan gegen `Spec:4367` rot-by-construction.
     *
     * ⛔ `force-dynamic` IST PFLICHT (`Spec:4644-4645`): die Seite liest einen Suchparameter,
     * und ohne die Zeile faellt sie in Nexts statischen Zweig.
     */
    const quelle = ohneKommentare(readFileSync(QUELLE_SEITE, "utf8"));
    expect(quelle).toMatch(/await requireRadioVerwaltung\(\)/);
    expect(quelle, "auf die Admin-Stufe angehoben — jede Updater-Person bekaeme 404").not.toMatch(
      /\brequireRadioAdmin\s*\(/,
    );
    expect(quelle, "ohne force-dynamic zeigt die Flaeche den Stand des Bauzeitpunkts").toMatch(
      /export const dynamic = "force-dynamic"/,
    );
  });

  it("die Seite laedt ohne Suchtext gar nichts", () => {
    /*
     * ⛔ „KEIN VORAB-LADEN DER GANZEN LISTE" (Aufgabenbrief V17, 1:1 `UpdateMode.tsx:14`,
     * `:29`: `q` bleibt `undefined`, bis die Entprellung einen Begriff setzt, und `useDevices`
     * laeuft im Bestand zwar, liefert aber eine Liste, die die Flaeche wegen `!q` nie zeigt).
     *
     * ⛔ IN REGIME B IST DAS EINE SERVERSEITIGE AUSSAGE UND KEINE ANZEIGE-ENTSCHEIDUNG: die
     * Seite darf `updateKarten` gar nicht erst rufen, sonst laeuft bei jedem Aufruf von
     * `/admin/software` eine ungefilterte Abfrage ueber `devices`. Der Fall der Insel
     * („ohne Suchtext wird kein Geraet gezeigt") sieht das strukturell nicht.
     */
    const quelle = ohneKommentare(readFileSync(QUELLE_SEITE, "utf8"));
    expect(quelle, "der Lesepfad laeuft unbedingt").toMatch(
      /suchtext === ""\s*\?\s*\[\]\s*:\s*updateKarten\(/,
    );
  });

  it("die Seite schreibt weder die drei Suchfelder noch die Seitengroesse selbst hin", () => {
    /*
     * ⛔ DIE ZWEI 1:1-ZAHLEN STEHEN IN `_lib/geraeteFelder.ts` UND WERDEN GELESEN, NICHT
     * ABGESCHRIEBEN. Schriebe die Seite sie ein zweites Mal hin, misst der Fall
     * „die Suche greift auf genau drei Felder" eine Konstante, die niemand benutzt — und eine
     * vierte Spalte in der Seite bliebe unentdeckt.
     */
    const quelle = ohneKommentare(readFileSync(QUELLE_SEITE, "utf8"));
    expect(quelle, "die Suchfelder erreichen den Lesepfad nicht").toMatch(
      /suchfelder:\s*\[\.\.\.UPDATE_SUCHFELDER\]/,
    );
    expect(quelle, "die Seitengroesse erreicht den Lesepfad nicht").toMatch(
      /seitenGroesse:\s*UPDATE_SEITENGROESSE/,
    );
    expect(quelle, "die Seite schreibt die Seitengroesse selbst hin").not.toMatch(/\b25\b/);
    expect(quelle, "die Seite schreibt einen Feldnamen selbst hin").not.toMatch(/"issi"/);
  });

  it("die Seite reicht KEINE Funktion und KEIN Date ueber die Grenze", () => {
    /*
     * Bauform-Zulaessigkeitstafel Nr. 6 und 7 (`Spec:4495-4497`, `Spec:4536-4539`): ueber die
     * Insel-Grenze gehen nur serialisierbare, VORFORMATIERTE Werte. Die zwei Actions
     * importiert die Insel DIREKT.
     */
    const quelle = ohneKommentare(readFileSync(QUELLE_SEITE, "utf8"));
    expect(quelle, "eine Action als Prop").not.toMatch(/=\{[^}]*Action\b/);
    expect(quelle, "eine Pfeilfunktion als Prop").not.toMatch(/=\{[^}]*=>/);
    expect(quelle, "ein Date in der Seite").not.toMatch(/\bnew Date\(/);
  });

  it("die Insel setzt kein size an einem antd-Bedienelement", () => {
    /*
     * ⛔ FALLE 4: `FullShell` traegt `controlHeight: 44` (`src/core/theme/theme.ts:207-209`),
     * auch auf dem Telefon. Der Bestand setzt `size="small"` an der Karte
     * (`UpdateDeviceCard.tsx:44`) — ⛔ das wandert NICHT mit.
     */
    const quelle = ohneKommentare(readFileSync(QUELLE_INSEL, "utf8"));
    expect(quelle, "ein size-Attribut an einem antd-Bedienelement (Falle 4)").not.toMatch(
      /\bsize=\{?["']?(?:small|large)/,
    );
  });

  it("die Flaeche traegt ihre Rolle, auch ohne ein einziges Geraet", async () => {
    /*
     * ⛔ DER GRIFF DES PLAYWRIGHT-FALLS (V23, `Spec:4881-4882`) — und er darf nicht an einer
     * Karte haengen: ohne Suchtext gibt es keine, und ⬜ V13-L2 laesst den e2e-Lauf ohnehin
     * ohne `radio`-Bestand fahren. `[data-rolle="radio-update-flaeche"]` fehlt genau dann,
     * wenn die Insel an der RSC-Grenze bricht.
     */
    await mount(<UpdateSuche {...props({ suchtext: "", zeilen: [] })} />);
    expect(queryAll('[data-rolle="radio-update-flaeche"]').length).toBe(1);
  });
});
