// @vitest-environment jsdom
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { readFileSync } from "node:fs";
import {
  mount, unmount, query, queryAll, exists, click, clickElement, fill,
} from "@/app/m/qr/_lib/test-dom";
import { BUCHUNG_MENGE_MAX } from "../_lib/grenzen";
import type { HelferErgebnis } from "../_lib/actionTypen";
/*
 * ⚠️ DIE ACTION WIRD GEMOCKT, NICHT ALS PROP INJIZIERT (DRK-375). Die Insel
 * importiert `bucheInEntnahmebox` seit DRK-375 DIREKT — `AGENTS.md`/Falle 9:
 * „Server Actions duerfen als einzige ueber die Grenze, aber direkt importiert,
 * nicht als Prop durchgereicht." Ein Prop waere der bequemere Test, und genau
 * deshalb steht hier der Mock: der Test folgt der Bauform, nicht umgekehrt.
 * Dieselbe Form wie in `_ui/Auffuellen.test.tsx` und `_ui/Entnahme.test.tsx`.
 *
 * ⚠️ `vi.hoisted`, weil `vi.mock` an den Dateikopf gehoben wird — ein
 * gewoehnliches Modulebenen-`const` waere zu diesem Zeitpunkt noch in der
 * temporalen Totzone.
 *
 * ⚠️ OHNE DEN MOCK ZOEGE `_actions/entnahmebox.ts` `better-sqlite3` und
 * `next/headers` in diese jsdom-Umgebung.
 */
const { buchenSpion } = vi.hoisted(() => ({
  buchenSpion: vi.fn<(eingabe: unknown) => Promise<unknown>>(),
}));

vi.mock("../_actions/entnahmebox", () => ({
  bucheInEntnahmebox: (eingabe: unknown) => buchenSpion(eingabe),
}));

import { BoxAbgabe, type BoxEinheit } from "./BoxAbgabe";
import type { BoxPosten } from "../_lib/lesepfade/entnahmebox";

/** Die Signatur, die die Insel von der Action erwartet — frueher der Prop-Typ
 *  `BoxAktion`, heute die Form, auf die der Spion antwortet. */
type BoxEingabe = {
  fahrzeugId: string;
  artikelId: string;
  menge: number;
  chargeId: string | null;
};

/**
 * Setzt die Antwort des gemockten Moduls und gibt den Spion zurueck. Steht an
 * der Stelle, an der frueher `buchen={…}` im JSX stand — die Testkoerper lesen
 * sich damit unveraendert.
 */
function antwortet(
  f: (eingabe: BoxEingabe) => Promise<HelferErgebnis<{ gebucht: number }>>,
) {
  buchenSpion.mockImplementation((eingabe) => f(eingabe as BoxEingabe));
  return buchenSpion;
}

const QUELLE = "src/app/m/lagerbuch/_ui/BoxAbgabe.tsx";

const FAHRZEUG: BoxEinheit = {
  id: "fz-1", name: "RTW 1", kennung: "MS-DRK-1", einheitenart: "fahrzeug",
};
const TASCHE: BoxEinheit = {
  id: "ta-1", name: "Rucksack Betreuung", kennung: null, einheitenart: "tasche",
};

function posten(teil: Partial<BoxPosten> = {}): BoxPosten {
  return {
    artikelId: "art-1",
    artikelName: "Kühlkompresse",
    einheit: "Stk",
    menge: 6,
    chargen: [
      { id: "ch-alt", chargenNr: "L-100", verfall: "2027-01", rest: 2, ampel: "gelb", text: "fällig 01/27" },
      { id: "ch-neu", chargenNr: "L-200", verfall: "2030-01", rest: 4, ampel: "gruen", text: "bis 01/30" },
    ],
    // Der Normalfall: zu diesem Artikel liegt an dieser Einheit keine Meldung
    // vor. Die Faelle, in denen eine vorliegt, setzen sie ueber `teil`.
    gemeldet: null,
    ...teil,
  };
}

/** Die Vorgabeantwort: gebucht wird, was die Insel sendet. */
function gelungen() {
  return antwortet(async (e) => ({ ok: true, wert: { gebucht: e.menge } }));
}

afterEach(async () => {
  await unmount();
  vi.clearAllMocks();
});

beforeEach(() => {
  gelungen();
});

describe("BoxAbgabe — der Schirm", () => {
  it("nennt die Art der Einheit, nicht nur ihren Namen", async () => {
    // DRK-309: zwei Einheiten duerfen gleich heissen, und eine Tasche traegt
    // kein Kennzeichen — ohne die Art stuende fuer sie gar nichts da.
    await mount(
      <BoxAbgabe einheit={TASCHE} posten={[posten()]} andereEinheitErreichbar kontoZugang={false} />,
    );
    expect(query("[data-rolle='box-einheit-meta']").textContent).toBe("Tasche");
  });

  /*
   * ⚠️ ZWEI `it`, NICHT EINES MIT EINEM `unmount()` IN DER MITTE. `unmount()`
   * ist ASYNCHRON und setzt seinen Wirt sofort auf `null`, raeumt aber erst
   * danach auf: ein nicht abgewartetes `unmount()` entfernt den Wirt des
   * NAECHSTEN Tests aus dem Dokument. Der Ausfall ist weit weg von der Ursache
   * — er meldet sich als „Element nicht gefunden" im uebernaechsten Test.
   */
  it("beschriftet die Liste am Fahrzeug art-bewusst", async () => {
    await mount(
      <BoxAbgabe einheit={FAHRZEUG} posten={[posten()]} andereEinheitErreichbar kontoZugang={false} />,
    );
    expect(query("[data-rolle='box-liste-titel']").textContent).toBe("Liegt im Fahrzeug");
  });

  it("beschriftet dieselbe Liste an der Tasche anders", async () => {
    await mount(
      <BoxAbgabe einheit={TASCHE} posten={[posten()]} andereEinheitErreichbar kontoZugang={false} />,
    );
    expect(query("[data-rolle='box-liste-titel']").textContent).toBe("Liegt in der Tasche");
  });

  it("nennt die GEMELDETE Angabe als solche — DRK-377", async () => {
    /*
     * ⚠️ DER CHIP SAGT DAZU, DASS ER EINE MELDUNG IST. Neben den Chargenchips
     * stuenden sonst zwei widersprechende Aussagen gleichrangig nebeneinander —
     * „bis 12/99" aus dem Buch und „abgelaufen" von der Packung —, ohne einen
     * Hinweis, welcher wovon spricht. Genau dieser Fall ist der haeufige: der
     * Check legt Bestand, den er keiner echten Charge zuordnen kann, auf eine
     * Pseudo-Charge und schreibt das abgelesene Datum daneben.
     */
    await mount(
      <BoxAbgabe
        einheit={FAHRZEUG}
        posten={[posten({
          chargen: [{
            id: "ch-pseudo", chargenNr: "Korrektur", verfall: "2099-12", rest: 6,
            ampel: "gruen", text: "bis 12/99",
          }],
          gemeldet: { verfall: "2026-05", ampel: "rot", abgelaufen: true, text: "abgelaufen" },
        })]}
        andereEinheitErreichbar
        kontoZugang={false}
      />,
    );
    expect(query("[data-rolle='box-posten']").textContent).toContain("gemeldet: abgelaufen");
  });

  it("laesst den Chip weg, wo nichts gemeldet ist", async () => {
    // Ein Chip „gemeldet: —" waere eine Zeile ueber eine Auskunft, die es nicht
    // gibt; auf dem Telefon kostet jede davon eine Zeile Platz.
    await mount(
      <BoxAbgabe einheit={FAHRZEUG} posten={[posten()]} andereEinheitErreichbar kontoZugang={false} />,
    );
    expect(query("[data-rolle='box-posten']").textContent).not.toContain("gemeldet");
  });

  it("schreibt den Verfallsstatus in die Zusammenfassung, statt ihn zu faerben", async () => {
    /*
     * ⚠️ DIE FARBE IST KEINE AUSKUNFT (Codex-Review zu PR #175). „01/27"
     * allein laesst offen, ob das gut oder schlecht ist; die Antwort steckte
     * bis hierher nur im Ton des Chips und war mit Rot-Gruen-Schwaeche oder
     * einer Vorleseanwendung nicht zu haben. Genau an dieser Zeile entscheidet
     * jemand, ob er den Posten ueberhaupt aufklappt.
     *
     * ⚠️ DIE ZUSAMMENGEKLAPPTE ZEILE, nicht die Chargenwahl darunter: die hat
     * es laengst so, und das war der Grund, warum es hier niemandem auffiel.
     */
    await mount(
      <BoxAbgabe einheit={FAHRZEUG} posten={[posten()]} andereEinheitErreichbar kontoZugang={false} />,
    );
    expect(query("[data-rolle='box-posten-knopf']").textContent)
      .toContain("fällig 01/27");
  });

  it("laesst nicht ueber den Mengendeckel der Action tippen", async () => {
    /*
     * ⚠️ ZWEI WAHRHEITEN WAEREN DER FEHLER (Codex-Review zu PR #175). Der
     * Bestand ist die fachliche Grenze, `BUCHUNG_MENGE_MAX` die technische:
     * `BoxSchema` weist alles darueber ab — und zwar mit „Die Eingabe war
     * unvollständig", einem Satz, der auf ein ausgefuelltes Formular nicht
     * passt. Liegt mehr als der Deckel an der Einheit, bot der Stepper bis
     * hierher die volle Menge an.
     */
    await mount(
      <BoxAbgabe
        einheit={FAHRZEUG}
        posten={[posten({
          menge: 200_000,
          chargen: [{
            id: "ch-viel", chargenNr: "L-300", verfall: "2030-01", rest: 200_000,
            ampel: "gruen", text: "bis 01/30",
          }],
        })]}
        andereEinheitErreichbar
        kontoZugang={false}
      />,
    );
    await click("[data-rolle='box-posten-knopf']");
    await fill("[aria-label='Menge Kühlkompresse']", "150000");

    expect(query<HTMLInputElement>("[aria-label='Menge Kühlkompresse']").value)
      .toBe(String(BUCHUNG_MENGE_MAX));
  });

  /*
   * ⚠️ DER RUECKWEG DER GEFUELLTEN ANSICHT (Codex-Review zu PR #175, zweite
   * Runde am selben Befund). Die erste Runde hatte nur den LEERZUSTAND der
   * Seite geheilt — hier steht derselbe Link, und diese Ansicht sieht man weit
   * oefter. `/helfer/box` waehlt dieselbe Einheit erneut, sobald das Kaertchen
   * gebunden ist oder es nur eine aktive Einheit gibt.
   *
   * ⚠️ GETAUSCHT UND NICHT VERSTECKT: dieser Schirm hat sonst keine
   * Navigation. Ein fehlender Link waere kein Ausgang, sondern gar keiner.
   */
  it("fuehrt den Rueckweg auf die Wahl, solange es eine andere Einheit gibt", async () => {
    await mount(
      <BoxAbgabe
        einheit={FAHRZEUG}
        posten={[posten()]}
        andereEinheitErreichbar
        kontoZugang={false}
      />,
    );
    const weg = query("[data-rolle='box-rueckweg']");
    expect(weg.getAttribute("href")).toBe("/helfer/box");
    expect(weg.textContent).toContain("Andere Einheit");
  });

  it("fuehrt ihn nach draussen, wenn die Wahl dieselbe Einheit zurueckgaebe", async () => {
    await mount(
      <BoxAbgabe
        einheit={FAHRZEUG}
        posten={[posten()]}
        andereEinheitErreichbar={false}
        kontoZugang={false}
      />,
    );
    const weg = query("[data-rolle='box-rueckweg']");
    expect(weg.getAttribute("href")).toBe("/helfer");
    expect(weg.textContent).toContain("Zur Entnahme");
  });

  it("zeigt die Mengeneingabe erst nach dem Tippen auf die Zeile", async () => {
    await mount(
      <BoxAbgabe einheit={FAHRZEUG} posten={[posten()]} andereEinheitErreichbar kontoZugang={false} />,
    );
    expect(exists("[data-rolle='box-eingabe']")).toBe(false);
    expect(query("[data-rolle='box-posten-knopf']").getAttribute("aria-expanded")).toBe("false");

    await click("[data-rolle='box-posten-knopf']");
    expect(exists("[data-rolle='box-eingabe']")).toBe(true);
    expect(query("[data-rolle='box-posten-knopf']").getAttribute("aria-expanded")).toBe("true");
  });

  it("schliesst die Zeile beim zweiten Tipp wieder", async () => {
    // ⚠️ OHNE DIESEN WEG gaebe es keinen Ausgang aus einer versehentlich
    // geoeffneten Zeile ausser dem Absenden — und genau das waere die Buchung,
    // die niemand wollte.
    await mount(
      <BoxAbgabe einheit={FAHRZEUG} posten={[posten()]} andereEinheitErreichbar kontoZugang={false} />,
    );
    await click("[data-rolle='box-posten-knopf']");
    await click("[data-rolle='box-posten-knopf']");
    expect(exists("[data-rolle='box-eingabe']")).toBe(false);
  });

  it("haelt hoechstens EINE Zeile offen", async () => {
    // Zwei halb ausgefuellte Mengenfelder untereinander sind zwei Absichten,
    // von denen der Knopf nur eine ausfuehrt.
    await mount(
      <BoxAbgabe
        einheit={FAHRZEUG}
        posten={[posten(), posten({ artikelId: "art-2", artikelName: "Mullbinde" })]}
        andereEinheitErreichbar
        kontoZugang={false}
      />,
    );
    await clickElement(queryAll("[data-rolle='box-posten-knopf']")[0]!);
    await clickElement(queryAll("[data-rolle='box-posten-knopf']")[1]!);
    expect(queryAll("[data-rolle='box-eingabe']")).toHaveLength(1);
  });
});

describe("BoxAbgabe — die Chargenwahl", () => {
  it("erscheint nur, wenn es mehr als eine Charge gibt", async () => {
    const eine = posten({
      menge: 2,
      chargen: [{ id: "ch-1", chargenNr: "L-1", verfall: "2030-01", rest: 2, ampel: "gruen", text: "bis 01/30" }],
    });
    await mount(
      <BoxAbgabe einheit={FAHRZEUG} posten={[eine]} andereEinheitErreichbar kontoZugang={false} />,
    );
    await click("[data-rolle='box-posten-knopf']");
    // Eine Radiogruppe mit einem Knopf ist eine Bedienung ohne Wirkung.
    expect(exists("[data-rolle='box-chargenwahl']")).toBe(false);
  });

  it("steht auf „zuerst ablaufende“, solange niemand sie anfasst", async () => {
    const buchen = gelungen();
    await mount(
      <BoxAbgabe einheit={FAHRZEUG} posten={[posten()]} andereEinheitErreichbar kontoZugang={false} />,
    );
    await click("[data-rolle='box-posten-knopf']");
    expect(exists("[data-rolle='box-chargenwahl']")).toBe(true);
    await click("[data-rolle='box-buchen']");

    // ⚠️ `null` UND NICHT DIE ID DER ERSTEN CHARGE. Der Unterschied ist fachlich:
    // `null` heisst „nimm die aelteste", eine Id heisst „genau diese". Die
    // Insel darf die Vorgabe nicht in eine Aussage verwandeln.
    expect(buchen).toHaveBeenCalledWith({
      fahrzeugId: "fz-1", artikelId: "art-1", menge: 1, chargeId: null,
    });
  });

  it("schickt die gewaehlte Charge mit", async () => {
    const buchen = gelungen();
    await mount(
      <BoxAbgabe einheit={FAHRZEUG} posten={[posten()]} andereEinheitErreichbar kontoZugang={false} />,
    );
    await click("[data-rolle='box-posten-knopf']");
    // Die Reihenfolge der Knoepfe: „Zuerst ablaufende", dann die Chargen.
    await clickElement(queryAll("[data-rolle='box-chargenwahl'] input")[2]!);
    await click("[data-rolle='box-buchen']");

    expect(buchen).toHaveBeenCalledWith({
      fahrzeugId: "fz-1", artikelId: "art-1", menge: 1, chargeId: "ch-neu",
    });
  });
});

describe("BoxAbgabe — die Rueckmeldung", () => {
  it("nennt nach dem Erfolg die Menge und den Artikel und schliesst die Zeile", async () => {
    await mount(
      <BoxAbgabe einheit={FAHRZEUG} posten={[posten()]} andereEinheitErreichbar kontoZugang={false} />,
    );
    await click("[data-rolle='box-posten-knopf']");
    await click("[data-rolle='box-buchen']");

    expect(query("[data-rolle='box-ergebnis']").textContent)
      .toBe("In die Entnahmebox gelegt: 1 × Kühlkompresse");
    expect(exists("[data-rolle='box-eingabe']")).toBe(false);
  });

  it("gibt die Servermeldung WOERTLICH weiter, statt sie neu zu formulieren", async () => {
    // §7.3: nur der Server weiss, WORAN es lag. Eine Insel, die den Satz
    // ersetzt, ersetzt ihn durch einen, der die Lage nicht kennt.
    antwortet(async () => ({
      ok: false, grund: "eingabe", text: "Es liegen aus diesem Fahrzeug nur 3 Stk.",
    }));
    await mount(
      <BoxAbgabe einheit={FAHRZEUG} posten={[posten()]} andereEinheitErreichbar kontoZugang={false} />,
    );
    await click("[data-rolle='box-posten-knopf']");
    await click("[data-rolle='box-buchen']");

    expect(query("[data-rolle='box-ergebnis']").textContent)
      .toBe("Es liegen aus diesem Fahrzeug nur 3 Stk.");
    // Die Zeile bleibt offen: die eingetippte Menge soll nicht verloren gehen.
    expect(exists("[data-rolle='box-eingabe']")).toBe(true);
  });

  it("faengt den Wurf ab, statt ihn zur Fehlerseite durchschlagen zu lassen", async () => {
    // FALLE 62/66: in Produktion stuende dort ein englischer Satz mit `digest`.
    antwortet(async () => { throw new Error("weg"); });
    await mount(
      <BoxAbgabe einheit={FAHRZEUG} posten={[posten()]} andereEinheitErreichbar kontoZugang={false} />,
    );
    await click("[data-rolle='box-posten-knopf']");
    await click("[data-rolle='box-buchen']");

    expect(query("[data-rolle='box-ergebnis']").textContent).toContain("Keine Verbindung");
  });

  it("fuehrt beim abgelaufenen KAERTCHEN aufs Gate — mit Rueckweg auf DIESE Einheit", async () => {
    antwortet(async () => ({
      ok: false, grund: "sitzung", text: "Dein Zugang ist abgelaufen. Scanne das Kärtchen erneut.",
    }));
    await mount(
      <BoxAbgabe einheit={FAHRZEUG} posten={[posten()]} andereEinheitErreichbar kontoZugang={false} />,
    );
    await click("[data-rolle='box-posten-knopf']");
    await click("[data-rolle='box-buchen']");

    expect(query("[data-rolle='box-zum-gate']").getAttribute("href"))
      .toBe(`/?returnTo=${encodeURIComponent("/helfer/box?fz=fz-1")}`);
    expect(exists("[data-rolle='box-zur-anmeldung']")).toBe(false);
  });

  it("fuehrt beim abgelaufenen KONTO zur Anmeldung und sagt einen anderen Satz", async () => {
    // DRK-305: `RIEGEL_TEXTE.sitzung` lautet woertlich „Scanne das Kärtchen
    // erneut" — fuer eine angemeldete Person ist das eine Sackgasse, und der
    // Server kann die Herkunft nicht unterscheiden.
    antwortet(async () => ({
      ok: false, grund: "sitzung", text: "Dein Zugang ist abgelaufen. Scanne das Kärtchen erneut.",
    }));
    await mount(
      <BoxAbgabe einheit={FAHRZEUG} posten={[posten()]} kontoZugang andereEinheitErreichbar />,
    );
    await click("[data-rolle='box-posten-knopf']");
    await click("[data-rolle='box-buchen']");

    expect(query("[data-rolle='box-ergebnis']").textContent).toContain("Melde dich in einem neuen Tab an");
    expect(query("[data-rolle='box-zur-anmeldung']").getAttribute("href")).toBe("/verwaltung");
    expect(exists("[data-rolle='box-zum-gate']")).toBe(false);
  });
});

describe("BoxAbgabe — die Bauform des Helfer-Wegs", () => {
  it("importiert weder antd noch ein Icon-Paket", () => {
    // Fallen 1 und 7. `_lib/bauform.test.ts` riegelt das fuer den ganzen Ast ab;
    // diese Zusicherung steht daneben, weil sie am Ort des Verstosses rot wird.
    const q = readFileSync(QUELLE, "utf8");
    expect(q).not.toMatch(/from\s+"antd/);
    expect(q).not.toMatch(/from\s+"@ant-design\/icons/);
    expect(q).not.toMatch(/lucide-react/);
  });

  /**
   * ⚠️ DIESER SCAN STAND EINMAL ANDERSHERUM (DRK-375) — er sicherte zu, dass
   * die Insel GAR KEIN `_actions/`-Modul importiert. Falle 9
   * (`AGENTS.md`/`CLAUDE.md`) verlangt das Gegenteil: „Server Actions duerfen
   * als einzige ueber die Grenze — aber direkt importiert, nicht als Prop
   * durchgereicht."
   *
   * ⚠️ OHNE KOMMENTARE, sonst trifft der zweite Teil den Kopfkommentar der
   * geprueften Datei: der nennt den alten Prop beim Namen, weil er die
   * Umstellung begruendet.
   */
  it("importiert die Action direkt und nimmt sie NICHT als Prop", () => {
    const q = readFileSync(QUELLE, "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
    expect(q).toMatch(/import \{ bucheInEntnahmebox \} from "\.\.\/_actions\/entnahmebox"/);
    expect(q, "kein `buchen`-Prop mehr").not.toMatch(/\bbuchen[?]?:/);
  });
});
