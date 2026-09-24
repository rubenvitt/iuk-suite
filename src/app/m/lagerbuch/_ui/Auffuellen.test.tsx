// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from "vitest";
import { readFileSync } from "node:fs";
import {
  mount, unmount, query, queryAll, exists, click, clickElement, fill,
} from "@/app/m/qr/_lib/test-dom";
/*
 * ⚠️ DIE ACTION WIRD GEMOCKT, NICHT ALS PROP INJIZIERT (Codex-Befund P1 zu
 * PR #174). Die Insel importiert `bucheAuffuellung` seit dem Befund DIREKT —
 * `CLAUDE.md`/Falle 9: „Server Actions duerfen als einzige ueber die Grenze,
 * aber direkt importiert, nicht als Prop durchgereicht." Ein Prop waere der
 * bequemere Test, und genau deshalb steht hier der Mock: der Test folgt der
 * Bauform, nicht umgekehrt.
 *
 * ⚠️ `vi.hoisted`, weil `vi.mock` an den Dateikopf gehoben wird — ein
 * gewoehnliches Modulebenen-`const` waere zu diesem Zeitpunkt noch in der
 * temporalen Totzone (dieselbe Form wie in `_actions/buchung.test.ts`).
 */
const { buchenSpion } = vi.hoisted(() => ({
  buchenSpion: vi.fn<(eingabe: unknown) => Promise<unknown>>(),
}));

vi.mock("../_actions/buchung", () => ({
  bucheAuffuellung: (eingabe: unknown) => buchenSpion(eingabe),
}));

import { Auffuellen, type AuffuellDetail, type AuffuellZiel } from "./Auffuellen";

const QUELLE = "src/app/m/lagerbuch/_ui/Auffuellen.tsx";

/**
 * Kopie von `ohneKommentare()` aus `_lib/bauform.test.ts` (Regel 1 / N-5),
 * wortgleich mit der in `Entnahme.test.tsx` — und aus demselben Anlass: der
 * Kopfkommentar dieser Insel nennt `antd` und `@ant-design/icons` woertlich,
 * weil er begruendet, warum sie fehlen. `bauform.test.ts` exportiert die
 * Funktion nicht, und dies ist ein anderer Testkoerper.
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

/** Die Radioknoepfe der Schrankwahl, in Dokumentreihenfolge. */
function zielKnoepfe(): HTMLInputElement[] {
  return queryAll<HTMLInputElement>('[data-rolle="ziel-zeile"] input');
}

/**
 * DIE AUFFUELLINSEL — DRK-313.
 *
 * Was hier haengt, und warum jeweils GENAU HIER:
 *
 *   - DER KNOPF IST GESPERRT, SOLANGE DIE ENTSCHEIDUNG OFFEN IST. Das ist die
 *     Umsetzung derselben Regel, die DRK-300 fuer das Entnahme-Ziel getroffen
 *     hat: eine Vorbelegung, die jemand uebersieht, raeumt Material still an
 *     den falschen Ort. Zugesichert wird BEIDES — der gesperrte Knopf UND dass
 *     ein Klick darauf nichts sendet; die zweite Haelfte faengt den Tastendruck
 *     auf einen noch nicht neu gerenderten Knopf.
 *   - BEI GENAU EINEM ZIEL IST VORBELEGT. Sonst waere der Pflicht-Tipp auf die
 *     einzige Zeile reine Zeremonie.
 *   - DIE NUTZLAST TRAEGT DIE GEWAEHLTE CHARGE, nicht die erste der Liste.
 *   - DER BELEG NENNT MENGE, ARTIKEL UND ZIEL (AK3), und das ZIEL kommt aus der
 *     ANTWORT des Servers, nicht aus dem Zustand der Insel.
 *   - EIN FEHLERTEXT DES SERVERS WIRD UNVERAENDERT GEZEIGT (§7.3): die Insel
 *     formuliert nicht neu.
 *   - DER KNOPF IST NICHT ROT. Rot traegt auf dieser Flaeche „Bestand geht weg"
 *     (Entnahme) und die Ampel (Falle 3); ein zweiter roter Breitknopf mit
 *     umgekehrter Wirkung waere am Regal der teuerste Gleichklang.
 */
const DETAIL: AuffuellDetail = {
  id: "art-1",
  name: "Mullbinde",
  einheit: "Stk",
  fach: "A-01",
  aktiv: true,
  bestand: 10,
  chargen: [
    { id: "ch-1", chargenNr: "L1", verfall: "2027-03", rest: 6, ampel: "gruen", text: "ok" },
    { id: "ch-2", chargenNr: "L2", verfall: "2026-10", rest: 4, ampel: "gelb", text: "läuft ab" },
  ],
};

const ZIELE: AuffuellZiel[] = [
  { id: "handlager", name: "Handlager (ohne Schrank)", zugangshinweis: null },
  { id: "schrank-1", name: "Schrank 1", zugangshinweis: null },
  { id: "schrank-gf", name: "GF-Schrank", zugangshinweis: "Zugang nur über die GF — LvD anrufen" },
];

/**
 * Der Erfolgsfall des Servers, mit dem Zielnamen UND der Charge, auf die er
 * gebucht hat. Beide kommen aus der Antwort und nicht aus dem Zustand der
 * Insel — bei einer NEU angelegten Charge kann die Insel die Kennung gar nicht
 * kennen.
 */
function ok(gebucht: number, ziel: string, chargeId = "ch-neu") {
  buchenSpion.mockResolvedValue({ ok: true as const, wert: { gebucht, ziel, chargeId } });
  return buchenSpion;
}

afterEach(async () => {
  await unmount();
  vi.clearAllMocks();
});

/**
 * Rendert die Insel. `buchen` ist KEIN Prop mehr — der Parameter setzt nur die
 * Antwort des gemockten Moduls und gibt den Spion zurueck, damit die
 * Testkoerper unveraendert bleiben konnten.
 */
async function zeige(
  ziele: AuffuellZiel[] = ZIELE,
  buchen: ReturnType<typeof ok> = ok(1, "Schrank 1"),
) {
  await mount(<Auffuellen detail={DETAIL} ziele={ziele} />);
  return buchen;
}

/**
 * Dieselbe Insel auf einem DEAKTIVIERTEN Artikel — DRK-380. Bewusst mit EINEM
 * Ziel, damit die Schrankwahl vorbelegt ist: sonst waere der Knopf schon aus
 * dem anderen Grund gesperrt, und der Test bewiese nichts.
 */
async function zeigeInaktiv(buchen: ReturnType<typeof ok> = ok(1, "Handlager (ohne Schrank)")) {
  await mount(<Auffuellen detail={{ ...DETAIL, aktiv: false }} ziele={[ZIELE[0]!]} />);
  return buchen;
}

describe("Auffuellen — die offene Entscheidung bucht nicht", () => {
  it("sperrt den Knopf, solange kein Schrank gewaehlt ist", async () => {
    await zeige();
    expect(query<HTMLButtonElement>('[data-rolle="auffuellen-buchen"]').disabled).toBe(true);
  });

  it("sendet auch dann nichts, wenn der gesperrte Knopf doch getroffen wird", async () => {
    const buchen = await zeige();
    await click('[data-rolle="auffuellen-buchen"]');
    expect(buchen).not.toHaveBeenCalled();
  });

  it("nennt die offene Entscheidung beim Namen, statt sie zu verschweigen", async () => {
    await zeige();
    expect(query('[data-rolle="auffuellen-zusammenfassung"]').textContent)
      .toContain("Noch kein Schrank gewählt");
  });

  it("belegt bei GENAU EINEM Ziel vor — dort gibt es nichts zu entscheiden", async () => {
    await zeige([ZIELE[0]!]);
    expect(query<HTMLInputElement>('[data-rolle="ziel-zeile"] input').checked).toBe(true);
    // Die neue Charge ist die Vorgabe und noch leer — der Knopf bleibt trotzdem
    // gesperrt, nur eben aus dem ANDEREN Grund.
    expect(query<HTMLButtonElement>('[data-rolle="auffuellen-buchen"]').disabled).toBe(true);
  });
});

describe("Auffuellen — die Charge", () => {
  it("zeigt die Felder der neuen Charge nur, wenn sie gewaehlt ist", async () => {
    await zeige();
    expect(exists('[data-rolle="neue-charge-felder"]')).toBe(true);
    await click('[data-rolle="charge-zeile"] input');
    expect(exists('[data-rolle="neue-charge-felder"]')).toBe(false);
  });

  it("fuehrt neue und vorhandene Chargen in EINER Gruppe — eine Entscheidung, eine Antwort", async () => {
    await zeige();
    const namen = queryAll<HTMLInputElement>('[data-rolle="charge-wahl"] input[type="radio"]')
      .map((e) => e.name);
    expect(namen).toHaveLength(3);
    expect(new Set(namen).size).toBe(1);
  });

  it("sendet die GEWAEHLTE Charge, nicht die erste der Liste", async () => {
    const buchen = await zeige();
    // ⚠️ UEBER `queryAll` UND NICHT `:nth-of-type` (gemessen, nicht vermutet):
    // `nth-of-type` zaehlt unter GLEICHNAMIGEN Geschwistern, und die `legend`
    // der Gruppe ist ein anderes Element — die Zaehlung waere um eins versetzt
    // und der Test still auf der falschen Zeile.
    await clickElement(zielKnoepfe()[1]!);
    await clickElement(queryAll<HTMLInputElement>('[data-rolle="charge-zeile"] input')[1]!);
    await click('[data-rolle="auffuellen-buchen"]');
    expect(buchen).toHaveBeenCalledWith(
      expect.objectContaining({ charge: { art: "vorhanden", chargeId: "ch-2" } }),
    );
  });

  it("verlangt Nummer UND Verfall, bevor eine neue Charge gebucht werden kann", async () => {
    const buchen = await zeige([ZIELE[0]!]);
    const knopf = () => query<HTMLButtonElement>('[data-rolle="auffuellen-buchen"]');

    await fill('[data-rolle="chargennummer"]', "L-NEU");
    expect(knopf().disabled, "ohne Verfall bleibt gesperrt").toBe(true);

    await fill('[data-rolle="verfallsmonat"]', "2028-01");
    expect(knopf().disabled).toBe(false);

    await click('[data-rolle="auffuellen-buchen"]');
    expect(buchen).toHaveBeenCalledWith({
      artikelId: "art-1",
      menge: 1,
      zielLagerortId: "handlager",
      charge: { art: "neu", chargenNr: "L-NEU", verfall: "2028-01" },
    });
  });

  it("schneidet Leerraum aus der Chargennummer — und ein reiner Leerraum gilt als leer", async () => {
    const buchen = await zeige([ZIELE[0]!]);
    await fill('[data-rolle="chargennummer"]', "   ");
    await fill('[data-rolle="verfallsmonat"]', "2028-01");
    expect(query<HTMLButtonElement>('[data-rolle="auffuellen-buchen"]').disabled).toBe(true);

    await fill('[data-rolle="chargennummer"]', "  L-NEU  ");
    await click('[data-rolle="auffuellen-buchen"]');
    expect(buchen).toHaveBeenCalledWith(
      expect.objectContaining({ charge: { art: "neu", chargenNr: "L-NEU", verfall: "2028-01" } }),
    );
  });
});

describe("Auffuellen — dieselbe Lieferung in mehrere Schraenke", () => {
  /**
   * ⚠️ DER TEUERSTE STILLE AUSGANG DIESER FLAECHE (Codex-Befund P1 zu PR #174).
   *
   * Eine Lieferung wird auf mehrere Schraenke verteilt, also mehrfach
   * nacheinander gebucht. Bliebe die Wahl danach auf „Neue Charge" stehen,
   * legte der zweite Griff eine ZWEITE `chargen`-Zeile mit derselben Nummer und
   * demselben Verfall an — es gibt keinen Eindeutigkeitsindex auf
   * `(artikel_id, chargen_nr)`. Eine physische Charge zerfiele in mehrere, in
   * FEFO nicht unterscheidbare Toepfe, und jede Buchung fuer sich gelingt.
   */
  it("bucht die ZWEITE Menge auf die gerade angelegte Charge, nicht auf eine neue", async () => {
    const buchen = ok(3, "Handlager (ohne Schrank)", "ch-frisch");
    await zeige([ZIELE[0]!], buchen);

    await fill('[data-rolle="chargennummer"]', "L-NEU");
    await fill('[data-rolle="verfallsmonat"]', "2028-01");
    await click('[data-rolle="auffuellen-buchen"]');
    expect(buchen).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ charge: { art: "neu", chargenNr: "L-NEU", verfall: "2028-01" } }),
    );

    // Der zweite Griff — ohne dass jemand etwas umstellt.
    await click('[data-rolle="auffuellen-buchen"]');
    expect(buchen).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ charge: { art: "vorhanden", chargeId: "ch-frisch" } }),
    );
  });

  it("zeigt die angelegte Charge als gewaehlte Zeile — kein freigegebener Knopf ohne Auswahl", async () => {
    await zeige([ZIELE[0]!], ok(3, "Handlager (ohne Schrank)", "ch-frisch"));
    await fill('[data-rolle="chargennummer"]', "L-NEU");
    await fill('[data-rolle="verfallsmonat"]', "2028-01");
    await click('[data-rolle="auffuellen-buchen"]');

    // Die Felder sind leer: eine stehengebliebene Nummer lüde dazu ein,
    // dieselbe Charge beim nächsten Wechsel ein zweites Mal anzulegen.
    expect(exists('[data-rolle="neue-charge-felder"]')).toBe(false);

    const gewaehlt = queryAll<HTMLInputElement>('[data-rolle="charge-wahl"] input')
      .filter((e) => e.checked);
    expect(gewaehlt, "genau eine Zeile ist angekreuzt").toHaveLength(1);
    const zeilen = queryAll('[data-rolle="charge-zeile"]');
    expect(zeilen[0]!.textContent, "die Uebergangszeile nennt die frische Charge")
      .toContain("L-NEU");
    expect(zeilen[0]!.textContent).toContain("gerade angelegt");
  });

  /**
   * Die Buchung revalidiert die Seite; sobald `detail.chargen` die neue Zeile
   * fuehrt, muss die provisorische verschwinden — sonst stuende dieselbe
   * Charge zweimal in derselben Gruppe.
   */
  it("verschwindet die Uebergangszeile, sobald die Liste die Charge selbst fuehrt", async () => {
    const mitFrischer: AuffuellDetail = {
      ...DETAIL,
      chargen: [
        { id: "ch-frisch", chargenNr: "L-NEU", verfall: "2028-01", rest: 3,
          ampel: "gruen", text: "ok" },
        ...DETAIL.chargen,
      ],
    };
    ok(3, "Handlager (ohne Schrank)", "ch-frisch");
    await mount(<Auffuellen detail={mitFrischer} ziele={[ZIELE[0]!]} />);
    await fill('[data-rolle="chargennummer"]', "L-NEU-2");
    await fill('[data-rolle="verfallsmonat"]', "2028-02");
    await click('[data-rolle="auffuellen-buchen"]');

    const treffer = queryAll('[data-rolle="charge-zeile"]')
      .filter((z) => z.textContent?.includes("L-NEU"));
    expect(treffer, "„L-NEU“ steht genau einmal, nicht provisorisch UND echt")
      .toHaveLength(1);
    expect(treffer[0]!.textContent).not.toContain("gerade angelegt");
  });
});

describe("Auffuellen — der Beleg (AK3)", () => {
  it("nennt VOR der Buchung Menge, Artikel und Ziel", async () => {
    await zeige([ZIELE[0]!]);
    expect(query('[data-rolle="auffuellen-zusammenfassung"]').textContent)
      .toContain("1 Stk Mullbinde → Handlager (ohne Schrank)");
  });

  it("nennt NACH der Buchung den Zielnamen aus der ANTWORT, nicht aus dem Zustand", async () => {
    const buchen = ok(3, "GF-Schrank");
    await zeige([ZIELE[0]!], buchen);
    await fill('[data-rolle="chargennummer"]', "L-NEU");
    await fill('[data-rolle="verfallsmonat"]', "2028-01");
    await click('[data-rolle="auffuellen-buchen"]');
    expect(query('[data-rolle="auffuellen-ergebnis"]').textContent)
      .toBe("Aufgefüllt: 3 × Mullbinde → GF-Schrank");
  });

  it("zeigt den Fehlertext des Servers unveraendert — die Insel formuliert nicht neu", async () => {
    buchenSpion.mockResolvedValue({
      ok: false as const, grund: "eingabe" as const, text: "Dieser Schrank ist stillgelegt.",
    });
    await mount(<Auffuellen detail={DETAIL} ziele={[ZIELE[0]!]} />);
    await fill('[data-rolle="chargennummer"]', "L-NEU");
    await fill('[data-rolle="verfallsmonat"]', "2028-01");
    await click('[data-rolle="auffuellen-buchen"]');
    expect(query('[data-rolle="auffuellen-ergebnis"]').textContent)
      .toBe("Dieser Schrank ist stillgelegt.");
  });

  it("ein Wurf wird zu „keine Verbindung“ — `netz` entsteht nur hier", async () => {
    buchenSpion.mockRejectedValue(new Error("offline"));
    await mount(<Auffuellen detail={DETAIL} ziele={[ZIELE[0]!]} />);
    await fill('[data-rolle="chargennummer"]', "L-NEU");
    await fill('[data-rolle="verfallsmonat"]', "2028-01");
    await click('[data-rolle="auffuellen-buchen"]');
    expect(query('[data-rolle="auffuellen-ergebnis"]').textContent)
      .toContain("Keine Verbindung");
  });
});

describe("Auffuellen — der Zugangshinweis und die Bauform", () => {
  it("zeigt den Zugangshinweis eines Schranks VORN, nicht in einem Tooltip", async () => {
    await zeige();
    const zeilen = queryAll('[data-rolle="ziel-zeile"]');
    expect(zeilen.at(-1)!.textContent).toContain("Zugang nur über die GF — LvD anrufen");
    // Die Bedingung ist die Zusage: ohne Hinweis steht dort KEINE leere Zeile.
    expect(zeilen[0]!.querySelectorAll("div")).toHaveLength(2);
  });

  /**
   * ⚠️ DER KNOPF IST NICHT ROT (Falle 3). Geprueft wird am QUELLTEXT, nicht am
   * DOM: CSS-Module sind unter Vitest ein Proxy, der fuer JEDEN Schluessel eine
   * Zeichenkette liefert — `className` enthielte `knopfRot` auch dann, wenn es
   * die Klasse gar nicht gaebe (gemessen in `HelferChip.test.tsx`).
   */
  it("traegt den Tinte-Knopf, nicht den roten der Entnahme", () => {
    const quelle = readFileSync(QUELLE, "utf8");
    expect(quelle).toContain("s.knopfTinte");
    expect(quelle).not.toContain("s.knopfRot");
  });

  /**
   * ⚠️ DIE ACTION WIRD DIREKT IMPORTIERT, NICHT ALS PROP GENOMMEN
   * (`CLAUDE.md`/Falle 9). Geprueft am QUELLTEXT und ohne Kommentare: der
   * Kopfkommentar dieser Insel erklaert die Regel und nennt dabei beide
   * Formen, ein Scan auf dem Rohtext waere also auf seiner eigenen Begruendung
   * gruen. Ein `buchen`-Prop faellt hier auf — und zwar VOR dem echten Abruf,
   * der als einziges die RSC-Grenze sieht.
   */
  it("importiert die Action direkt und nimmt sie NICHT als Prop", () => {
    const quelle = ohneKommentare(readFileSync(QUELLE, "utf8"));
    expect(quelle).toMatch(/import \{ bucheAuffuellung \} from "\.\.\/_actions\/buchung"/);
    expect(quelle, "kein `buchen`-Prop mehr").not.toMatch(/\bbuchen[?]?:/);
  });

  /** KEIN antd und KEIN `@ant-design/icons` (Fallen 1 und 7) — wie der ganze
   *  Helfer-Ast. */
  it("importiert weder antd noch dessen Zeichenpaket", () => {
    // ⚠️ OHNE KOMMENTARE. Der Kopfkommentar der Datei NENNT beide Namen — das
    // ist die Begruendung, warum sie fehlen. Ein Scan auf dem Rohtext waere auf
    // seiner eigenen Begruendung rot (dieselbe Kopie wie in `Entnahme.test.tsx`).
    const quelle = ohneKommentare(readFileSync(QUELLE, "utf8"));
    expect(quelle).not.toMatch(/from "antd/);
    expect(quelle).not.toMatch(/@ant-design\/icons/);
  });
});

/**
 * DER DEAKTIVIERTE ARTIKEL — DRK-380.
 *
 * ⚠️ DIE SEITE RENDERT WEITER, UND DAS IST DIE ENTSCHEIDUNG, nicht ihr Rest.
 * Diese Flaeche haengt an einem gescannten Regal-QR; ein `notFound()` machte
 * daraus eine Sackgasse fuer Material, das physisch im Regal liegt. Gesperrt
 * wird allein die BUCHUNG — dieselbe Richtung, die der Schreibpfad haelt:
 * heraus ja, hinein nein.
 *
 * ⚠️ ZUGESICHERT WIRD BEIDES — der gesperrte Knopf UND dass ein Klick darauf
 * nichts sendet. Die zweite Haelfte faengt den Tastendruck auf einen noch
 * nicht neu gerenderten Knopf; sie ist derselbe Grund, aus dem `detail.aktiv`
 * in `bereit` steht und nicht in einer eigenen Weiche daneben.
 */
describe("Auffuellen — ein deaktivierter Artikel nimmt nichts mehr an", () => {
  it("rendert die Seite trotzdem — der Regal-QR bleibt eine Auskunft", async () => {
    await zeigeInaktiv();
    expect(query('[data-rolle="bestand"]').textContent).toContain("10");
    expect(queryAll('[data-rolle="charge-zeile"]').length).toBe(DETAIL.chargen.length);
  });

  it("sperrt den Knopf, obwohl Ziel und Charge vollstaendig waeren", async () => {
    await zeigeInaktiv();
    // Das EINE Ziel ist vorbelegt — der Knopf haengt also nicht daran.
    expect(query<HTMLInputElement>('[data-rolle="ziel-zeile"] input').checked).toBe(true);
    await clickElement(queryAll<HTMLInputElement>('[data-rolle="charge-zeile"] input')[0]!);
    expect(query<HTMLButtonElement>('[data-rolle="auffuellen-buchen"]').disabled).toBe(true);
  });

  it("sendet auch dann nichts, wenn der gesperrte Knopf doch getroffen wird", async () => {
    const buchen = await zeigeInaktiv();
    await clickElement(queryAll<HTMLInputElement>('[data-rolle="charge-zeile"] input')[0]!);
    await click('[data-rolle="auffuellen-buchen"]');
    expect(buchen).not.toHaveBeenCalled();
  });

  /**
   * ⚠️ DER HINWEIS NENNT DEN AUSGANG, nicht nur die Lage. „Geht nicht" allein
   * laesst jemanden mit dem Karton in der Hand stehen; der Schalter sitzt in
   * der Verwaltung, und das ist die einzige brauchbare Auskunft an dieser
   * Stelle. Zugesichert wird deshalb der WEG, nicht bloss das Wort.
   */
  it("sagt, warum — und wer es aendern kann", async () => {
    await zeigeInaktiv();
    const text = query('[data-rolle="auffuellen-inaktiv"]').textContent ?? "";
    expect(text).toContain("deaktiviert");
    expect(text).toContain("Verwaltung");
  });

  it("steht auf einem AKTIVEN Artikel nicht da", async () => {
    await zeige();
    expect(exists('[data-rolle="auffuellen-inaktiv"]')).toBe(false);
  });
});
