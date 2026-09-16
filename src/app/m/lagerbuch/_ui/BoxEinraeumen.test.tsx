// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from "vitest";
import { readFileSync } from "node:fs";
import {
  mount, unmount, query, queryAll, exists, click, clickElement, fill,
} from "@/app/m/qr/_lib/test-dom";

/*
 * ⚠️ DIE ACTION WIRD GEMOCKT, NICHT ALS PROP INJIZIERT — dieselbe Entscheidung
 * und dieselbe Begruendung wie in `Auffuellen.test.tsx`: die Insel importiert
 * `raeumeAusEntnahmebox` DIREKT, weil Falle 9 („Server Actions duerfen als
 * einzige ueber die Grenze — aber direkt importiert, nicht als Prop
 * durchgereicht") genau das verlangt. Ein Prop waere der bequemere Test, und
 * deshalb steht hier der Mock: der Test folgt der Bauform, nicht umgekehrt.
 *
 * `vi.hoisted`, weil `vi.mock` an den Dateikopf gehoben wird.
 */
const { buchenSpion } = vi.hoisted(() => ({
  buchenSpion: vi.fn<(eingabe: unknown) => Promise<unknown>>(),
}));

vi.mock("../_actions/entnahmebox", () => ({
  raeumeAusEntnahmebox: (eingabe: unknown) => buchenSpion(eingabe),
}));

import { BoxEinraeumen, type EinraeumZiel } from "./BoxEinraeumen";
import { BUCHUNG_MENGE_MAX } from "../_lib/grenzen";
import type { EinraeumPosten } from "../_lib/lesepfade/entnahmebox";

const QUELLE = "src/app/m/lagerbuch/_ui/BoxEinraeumen.tsx";

const ZIELE: EinraeumZiel[] = [
  { id: "handlager", name: "Handlager (ohne Schrank)", zugangshinweis: null },
  { id: "sch-1", name: "Schrank 1", zugangshinweis: "Schlüssel bei der GF" },
];

function posten(teil: Partial<EinraeumPosten> = {}): EinraeumPosten {
  return {
    artikelId: "art-1",
    artikelName: "Kühlkompresse",
    einheit: "Stk",
    fach: "A-01",
    artikelAktiv: true,
    menge: 6,
    chargen: [
      { id: "ch-alt", chargenNr: "L-100", verfall: "2027-01", rest: 2, ampel: "gelb", text: "fällig 01/27" },
      { id: "ch-neu", chargenNr: "L-200", verfall: "2030-01", rest: 4, ampel: "gruen", text: "bis 01/30" },
    ],
    ...teil,
  };
}

/** Ein Posten mit genau EINER Charge — der Fall, in dem vorbelegt wird. */
function einzelPosten(teil: Partial<EinraeumPosten> = {}): EinraeumPosten {
  return posten({
    chargen: [
      { id: "ch-1", chargenNr: "L-100", verfall: "2030-01", rest: 6, ampel: "gruen", text: "bis 01/30" },
    ],
    ...teil,
  });
}

function flaeche(props: Partial<Parameters<typeof BoxEinraeumen>[0]> = {}) {
  return (
    <BoxEinraeumen
      boxName="Entnahmebox"
      posten={[posten()]}
      ziele={ZIELE}
      {...props}
    />
  );
}

const KNOPF = "[data-rolle='einraeumen-buchen']";

afterEach(async () => { await unmount(); vi.clearAllMocks(); });

describe("BoxEinraeumen — was der Schirm sagt", () => {
  it("nennt die Richtung UND die Art des Vorgangs", async () => {
    /*
     * ⚠️ DIE TEUERSTE FALLE DES TICKETS IST EINE SPRACHLICHE. Die Flaeche sieht
     * der Entnahme und dem Auffuellen zum Verwechseln aehnlich — das ist
     * Absicht (der vertraute Ablauf war die Anforderung) und genau deshalb die
     * Gefahr: wer hier einen WARENEINGANG vermutet, bucht dieselben Teile ein
     * zweites Mal ins append-only-Journal.
     */
    await mount(flaeche());
    const hinweis = query("[data-rolle='einraeumen-hinweis']").textContent ?? "";
    expect(hinweis).toContain("umgeräumt, nicht neu angenommen");
    expect(hinweis).toContain("zurück ins Handlager");
  });

  it("zeigt das Fach in der zugeklappten Zeile", async () => {
    // Es ist die Angabe, die beantwortet, wohin der Artikel gehoert — und die
    // einzige, die das kann: Fach und Schrank haengen in den Daten nicht
    // zusammen.
    await mount(flaeche());
    expect(query("[data-rolle='einraeum-posten-knopf']").textContent).toContain("A-01");
  });

  it("schreibt den Verfallsstatus als TEXT in die zugeklappte Zeile", async () => {
    // Genau hier entscheidet jemand, ob der Posten zurueck in den Schrank geht
    // oder in den Muell. „01/27" allein sagt nicht, ob das gut oder schlecht
    // ist — die Antwort steckte sonst allein in der Farbe.
    await mount(flaeche());
    expect(query("[data-rolle='einraeum-posten-knopf']").textContent).toContain("fällig 01/27");
  });

  it("benennt einen stillgelegten Artikel, statt ihn zu verstecken", async () => {
    /*
     * ⚠️ DIE DRITTE OFFENE FRAGE DES TICKETS, UND DIE ANTWORT IST „ERLAUBT,
     * ABER BENANNT". Verbieten ginge nicht: es gibt heute keinen Weg, aus der
     * Kiste auszusondern — das Material bliebe fuer immer darin liegen, an
     * einem Ort, den weder Verfallsliste noch Inventur sehen.
     */
    await mount(flaeche({ posten: [posten({ artikelAktiv: false })] }));
    expect(query("[data-rolle='einraeum-posten-knopf']").textContent).toContain("stillgelegt");
  });

  it("sagt an keiner Stelle „auffüllen“", async () => {
    // Das Wort gehoert dem anderen Vorgang (`bucheAuffuellung`, ein
    // Wareneingang). Beide Flaechen liegen im selben Ast und sehen gleich aus;
    // der Unterschied sind genau die Worte.
    await mount(flaeche());
    await click("[data-rolle='einraeum-posten-knopf']");
    expect((query("[data-rolle='einraeum-eingabe']").textContent ?? "").toLowerCase())
      .not.toContain("auffüll");
  });
});

describe("BoxEinraeumen — die Wahl", () => {
  it("haelt den Knopf gesperrt, solange Charge oder Ziel offen sind", async () => {
    /*
     * ⚠️ ZWEI OFFENE ENTSCHEIDUNGEN, UND KEINE DAVON HAT EINE VORGABE (DRK-300,
     * dieselbe Regel wie beim Entnahme-Ziel): eine Vorbelegung, die jemand
     * uebersieht, raeumt Material still an den falschen Ort — oder bucht die
     * falsche Charge, und das ist wegen append-only nicht mehr zu heilen.
     */
    await mount(flaeche());
    await click("[data-rolle='einraeum-posten-knopf']");
    expect(query<HTMLButtonElement>(KNOPF).disabled).toBe(true);

    // Nur die Charge: das Ziel fehlt weiterhin.
    await clickElement(queryAll<HTMLInputElement>("[data-rolle='einraeum-chargenwahl'] input")[1]!);
    expect(query<HTMLButtonElement>(KNOPF).disabled).toBe(true);

    await clickElement(queryAll<HTMLInputElement>("[data-rolle='einraeum-ziel-zeile'] input")[1]!);
    expect(query<HTMLButtonElement>(KNOPF).disabled).toBe(false);
  });

  it("sendet auch dann nichts, wenn der gesperrte Knopf doch getroffen wird", async () => {
    // Die zweite Haelfte derselben Zusage: ein Tastendruck auf einen noch nicht
    // neu gerenderten Knopf kaeme sonst durch.
    await mount(flaeche());
    await click("[data-rolle='einraeum-posten-knopf']");
    await click(KNOPF);
    expect(buchenSpion).not.toHaveBeenCalled();
  });

  it("belegt die Charge vor, wenn es nur eine gibt — und zeigt keine Wahl", async () => {
    // Eine Radiogruppe mit einem Knopf ist eine Bedienung ohne Wirkung.
    await mount(flaeche({ posten: [einzelPosten()], ziele: [ZIELE[0]!] }));
    await click("[data-rolle='einraeum-posten-knopf']");
    expect(exists("[data-rolle='einraeum-chargenwahl']")).toBe(false);
    expect(query<HTMLButtonElement>(KNOPF).disabled).toBe(false);
  });

  it("belegt das Ziel vor, wenn es nur eines gibt", async () => {
    // Bei genau einem Ort gibt es nichts zu entscheiden; ein Pflicht-Tipp auf
    // die einzige Zeile waere reine Zeremonie.
    await mount(flaeche({ ziele: [ZIELE[0]!] }));
    await click("[data-rolle='einraeum-posten-knopf']");
    await clickElement(queryAll<HTMLInputElement>("[data-rolle='einraeum-chargenwahl'] input")[0]!);
    expect(query<HTMLButtonElement>(KNOPF).disabled).toBe(false);
  });

  it("zeigt den Zugangshinweis eines Schranks, ohne dass man ihn aufdecken muss", async () => {
    await mount(flaeche());
    await click("[data-rolle='einraeum-posten-knopf']");
    expect(query("[data-rolle='einraeum-zielwahl']").textContent).toContain("Schlüssel bei der GF");
  });

  it("schliesst die Zeile beim zweiten Tipp", async () => {
    // Ohne diesen Zweig gaebe es keinen Weg zurueck aus einer versehentlich
    // geoeffneten Zeile ausser dem Absenden — und genau das waere die Buchung,
    // die niemand wollte.
    await mount(flaeche());
    await click("[data-rolle='einraeum-posten-knopf']");
    expect(exists("[data-rolle='einraeum-eingabe']")).toBe(true);
    await click("[data-rolle='einraeum-posten-knopf']");
    expect(exists("[data-rolle='einraeum-eingabe']")).toBe(false);
  });

  it("haelt hoechstens EINE Zeile offen", async () => {
    // Zwei halb ausgefuellte Mengenfelder untereinander sind zwei Absichten,
    // von denen der Knopf nur eine ausfuehrt; welche, waere aus der Anzeige
    // nicht zu erkennen.
    await mount(flaeche({
      posten: [posten(), posten({ artikelId: "art-2", artikelName: "Mullbinde" })],
    }));
    const knoepfe = queryAll("[data-rolle='einraeum-posten-knopf']");
    await clickElement(knoepfe[0]!);
    await clickElement(knoepfe[1]!);
    expect(queryAll("[data-rolle='einraeum-eingabe']")).toHaveLength(1);
  });
});

describe("BoxEinraeumen — die Menge", () => {
  it("deckelt an der gewaehlten CHARGE, nicht am Posten", async () => {
    /*
     * ⚠️ OHNE DIESE UNTERSCHEIDUNG BOETE DER STEPPER EINE ZAHL AN, DIE DER
     * SERVER DANACH ABLEHNT, und zwar erst nach dem Tippen: die Deckung wird je
     * CHARGE geprueft, der Posten summiert ueber alle.
     */
    await mount(flaeche());
    await click("[data-rolle='einraeum-posten-knopf']");
    // Die alte Charge hat Rest 2, der Posten insgesamt 6.
    await clickElement(queryAll<HTMLInputElement>("[data-rolle='einraeum-chargenwahl'] input")[0]!);
    await fill("[aria-label='Menge Kühlkompresse']", "6");
    expect(query<HTMLInputElement>("[aria-label='Menge Kühlkompresse']").value).toBe("2");
  });

  it("laesst nicht ueber den Mengendeckel der Action tippen", async () => {
    /*
     * ⚠️ ZWEI WAHRHEITEN WAEREN DER FEHLER. Der Bestand ist die fachliche
     * Grenze, `BUCHUNG_MENGE_MAX` die technische: `EinraeumenSchema` weist
     * alles darueber ab — mit „Die Eingabe war unvollständig", einem Satz, der
     * auf ein ausgefuelltes Formular nicht passt.
     */
    await mount(flaeche({
      posten: [einzelPosten({
        menge: 200_000,
        chargen: [{
          id: "ch-viel", chargenNr: "L-300", verfall: "2030-01", rest: 200_000,
          ampel: "gruen", text: "bis 01/30",
        }],
      })],
      ziele: [ZIELE[0]!],
    }));
    await click("[data-rolle='einraeum-posten-knopf']");
    await fill("[aria-label='Menge Kühlkompresse']", "150000");
    expect(query<HTMLInputElement>("[aria-label='Menge Kühlkompresse']").value)
      .toBe(String(BUCHUNG_MENGE_MAX));
  });
});

describe("BoxEinraeumen — die Buchung", () => {
  async function bereitMachen() {
    await mount(flaeche({ posten: [einzelPosten()], ziele: [ZIELE[0]!] }));
    await click("[data-rolle='einraeum-posten-knopf']");
  }

  it("schickt Artikel, Charge, Menge und Ziel — und nichts sonst", async () => {
    buchenSpion.mockResolvedValue({ ok: true, wert: { eingeraeumt: 1, ziel: "Handlager (ohne Schrank)" } });
    await bereitMachen();
    await click(KNOPF);

    expect(buchenSpion).toHaveBeenCalledWith({
      artikelId: "art-1",
      chargeId: "ch-1",
      menge: 1,
      zielLagerortId: "handlager",
    });
  });

  it("nennt im Beleg den Zielnamen DES SERVERS, nicht den angezeigten", async () => {
    /*
     * ⚠️ DER UNTERSCHIED WIRD SICHTBAR, SOBALD JEMAND EINEN SCHRANK UMBENENNT:
     * der Zustand hier traegt den Namen von vorhin, der Server den, auf den er
     * wirklich gebucht hat. Deshalb weicht die Attrappe hier ausdruecklich ab.
     */
    buchenSpion.mockResolvedValue({ ok: true, wert: { eingeraeumt: 3, ziel: "Schrank 7" } });
    await bereitMachen();
    await click(KNOPF);

    expect(query("[data-rolle='einraeumen-ergebnis']").textContent)
      .toBe("Eingeräumt: 3 × Kühlkompresse → Schrank 7");
  });

  it("schliesst die Zeile nach dem Erfolg", async () => {
    // Ein gefuelltes Mengenfeld ueber einer Liste stehen zu lassen, deren
    // Zahlen der naechste Serverstand gerade aendert, laedt zu einer zweiten
    // Buchung gegen einen Bestand ein, der nicht mehr auf dem Schirm steht.
    buchenSpion.mockResolvedValue({ ok: true, wert: { eingeraeumt: 1, ziel: "Handlager (ohne Schrank)" } });
    await bereitMachen();
    await click(KNOPF);
    expect(exists("[data-rolle='einraeum-eingabe']")).toBe(false);
  });

  it("zeigt den Satz DES SERVERS, ohne ihn neu zu formulieren", async () => {
    // §7.3: der Server hat den Text. Eine Insel, die ihn nachbaut, hat die
    // zweite Wahrheit ueber denselben Fehler.
    buchenSpion.mockResolvedValue({
      ok: false, grund: "eingabe", text: "Von dieser Charge liegen in der Entnahmebox nur 2 Stk.",
    });
    await bereitMachen();
    await click(KNOPF);
    expect(query("[data-rolle='einraeumen-ergebnis']").textContent)
      .toBe("Von dieser Charge liegen in der Entnahmebox nur 2 Stk.");
  });

  it("laesst die Zeile nach einem Fehler OFFEN", async () => {
    // Der Gegenfall zum Erfolg: wer die Menge korrigieren soll, braucht das
    // Feld noch.
    buchenSpion.mockResolvedValue({ ok: false, grund: "eingabe", text: "Zu viel." });
    await bereitMachen();
    await click(KNOPF);
    expect(exists("[data-rolle='einraeum-eingabe']")).toBe(true);
  });

  it("macht aus einem Wurf „keine Verbindung“ — und zwar HIER", async () => {
    /*
     * ⚠️ `"netz"` ENTSTEHT AUSSCHLIESSLICH IM CLIENT (Global Constraint 12).
     * Ohne diesen `catch` schluege der Wurf bis zur Fehlerseite durch, und in
     * Produktion stuende dort ein englischer Satz mit `digest` (Falle 66).
     */
    buchenSpion.mockRejectedValue(new Error("offline"));
    await bereitMachen();
    await click(KNOPF);
    expect(query("[data-rolle='einraeumen-ergebnis']").textContent).toContain("Verbindung");
  });
});

describe("BoxEinraeumen — die Bauform", () => {
  /**
   * Kopie von `ohneKommentare()` aus `_lib/bauform.test.ts`, wortgleich mit der
   * in `Auffuellen.test.tsx` — und aus demselben Anlass: der Kopfkommentar
   * dieser Insel NENNT `antd` und `@ant-design/icons` woertlich, weil er
   * begruendet, warum sie fehlen. Ein roher Scan schluege daran an.
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

  it("importiert weder antd noch @ant-design/icons (Fallen 1 und 7)", () => {
    const quelle = ohneKommentare(readFileSync(QUELLE, "utf8"));
    expect(quelle).not.toMatch(/from\s+"antd(\/|")/);
    expect(quelle).not.toMatch(/from\s+"@ant-design\/icons/);
  });

  it("importiert die Action DIREKT, statt sie als Prop zu nehmen (Falle 9)", () => {
    // ⚠️ DIE REGEL LAUTET WOERTLICH: „Server Actions duerfen als einzige ueber
    // die Grenze — aber direkt importiert, nicht als Prop durchgereicht." Die
    // Prop-Form in `Entnahme.tsx` und `BoxAbgabe.tsx` lebt allein aus ihrer
    // Vorgeschichte (Begruendung im Kopf von `Auffuellen.tsx`).
    const quelle = ohneKommentare(readFileSync(QUELLE, "utf8"));
    expect(quelle).toMatch(/import\s*\{\s*raeumeAusEntnahmebox\s*\}\s*from\s*"\.\.\/_actions\/entnahmebox"/);
  });
});
