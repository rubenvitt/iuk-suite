// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from "vitest";
import { readFileSync } from "node:fs";
import {
  mount, unmount, query, queryAll, exists, click, clickElement,
} from "@/app/m/qr/_lib/test-dom";
import { BoxAbgabe, type BoxAktion, type BoxEinheit } from "./BoxAbgabe";
import type { BoxPosten } from "../_lib/lesepfade/entnahmebox";

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
    ...teil,
  };
}

function gelungen(): BoxAktion {
  return vi.fn<BoxAktion>(async (e) => ({ ok: true, wert: { gebucht: e.menge } }));
}

afterEach(() => unmount());

describe("BoxAbgabe — der Schirm", () => {
  it("nennt die Art der Einheit, nicht nur ihren Namen", async () => {
    // DRK-309: zwei Einheiten duerfen gleich heissen, und eine Tasche traegt
    // kein Kennzeichen — ohne die Art stuende fuer sie gar nichts da.
    await mount(
      <BoxAbgabe einheit={TASCHE} posten={[posten()]} buchen={gelungen()} kontoZugang={false} />,
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
      <BoxAbgabe einheit={FAHRZEUG} posten={[posten()]} buchen={gelungen()} kontoZugang={false} />,
    );
    expect(query("[data-rolle='box-liste-titel']").textContent).toBe("Liegt im Fahrzeug");
  });

  it("beschriftet dieselbe Liste an der Tasche anders", async () => {
    await mount(
      <BoxAbgabe einheit={TASCHE} posten={[posten()]} buchen={gelungen()} kontoZugang={false} />,
    );
    expect(query("[data-rolle='box-liste-titel']").textContent).toBe("Liegt in der Tasche");
  });

  it("zeigt die Mengeneingabe erst nach dem Tippen auf die Zeile", async () => {
    await mount(
      <BoxAbgabe einheit={FAHRZEUG} posten={[posten()]} buchen={gelungen()} kontoZugang={false} />,
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
      <BoxAbgabe einheit={FAHRZEUG} posten={[posten()]} buchen={gelungen()} kontoZugang={false} />,
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
        buchen={gelungen()}
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
      <BoxAbgabe einheit={FAHRZEUG} posten={[eine]} buchen={gelungen()} kontoZugang={false} />,
    );
    await click("[data-rolle='box-posten-knopf']");
    // Eine Radiogruppe mit einem Knopf ist eine Bedienung ohne Wirkung.
    expect(exists("[data-rolle='box-chargenwahl']")).toBe(false);
  });

  it("steht auf „zuerst ablaufende“, solange niemand sie anfasst", async () => {
    const buchen = gelungen();
    await mount(
      <BoxAbgabe einheit={FAHRZEUG} posten={[posten()]} buchen={buchen} kontoZugang={false} />,
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
      <BoxAbgabe einheit={FAHRZEUG} posten={[posten()]} buchen={buchen} kontoZugang={false} />,
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
      <BoxAbgabe einheit={FAHRZEUG} posten={[posten()]} buchen={gelungen()} kontoZugang={false} />,
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
    const buchen = vi.fn<BoxAktion>(async () => ({
      ok: false, grund: "eingabe", text: "Es liegen aus diesem Fahrzeug nur 3 Stk.",
    }));
    await mount(
      <BoxAbgabe einheit={FAHRZEUG} posten={[posten()]} buchen={buchen} kontoZugang={false} />,
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
    const buchen = vi.fn<BoxAktion>(async () => { throw new Error("weg"); });
    await mount(
      <BoxAbgabe einheit={FAHRZEUG} posten={[posten()]} buchen={buchen} kontoZugang={false} />,
    );
    await click("[data-rolle='box-posten-knopf']");
    await click("[data-rolle='box-buchen']");

    expect(query("[data-rolle='box-ergebnis']").textContent).toContain("Keine Verbindung");
  });

  it("fuehrt beim abgelaufenen KAERTCHEN aufs Gate — mit Rueckweg auf DIESE Einheit", async () => {
    const buchen = vi.fn<BoxAktion>(async () => ({
      ok: false, grund: "sitzung", text: "Dein Zugang ist abgelaufen. Scanne das Kärtchen erneut.",
    }));
    await mount(
      <BoxAbgabe einheit={FAHRZEUG} posten={[posten()]} buchen={buchen} kontoZugang={false} />,
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
    const buchen = vi.fn<BoxAktion>(async () => ({
      ok: false, grund: "sitzung", text: "Dein Zugang ist abgelaufen. Scanne das Kärtchen erneut.",
    }));
    await mount(
      <BoxAbgabe einheit={FAHRZEUG} posten={[posten()]} buchen={buchen} kontoZugang />,
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

  it("importiert die Action NICHT, sondern nimmt sie als Prop", () => {
    // Dieselbe Bauform wie `Entnahme.tsx`: die Insel bleibt ohne Server-Import
    // testbar, und der eine Import liegt in `helfer/box/page.tsx`.
    const q = readFileSync(QUELLE, "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
    expect(q).not.toMatch(/from\s+"\.\.\/_actions\//);
  });
});
