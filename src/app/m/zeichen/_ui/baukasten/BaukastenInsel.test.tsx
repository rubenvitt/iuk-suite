// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  click,
  exists,
  fill,
  mount,
  query,
  queryAll,
  submitForm,
  unmount,
} from "@/app/m/qr/_lib/test-dom";
import { AKTION_FEHLGESCHLAGEN } from "../../_lib/aktionsfehler";
import { kodiereSpec } from "./zustand";
import BaukastenInsel from "./BaukastenInsel";

/*
 * Die Server Action wird ATTRAPPIERT: `useActionState` braucht nur eine Funktion,
 * und ein echter Aufruf zoege `auth()` und die Datenbank in einen jsdom-Lauf.
 * Direkt importiert wird sie in der Insel trotzdem — Server Actions duerfen als
 * einzige ueber die RSC-Grenze, aber nur importiert, nie als Prop (Falle 9).
 */
vi.mock("../../actions", () => ({
  speichereEigenesZeichen: vi.fn(async () => ({ ok: true, name: "Test" })),
}));

/** Die Adresszeile ist der Anfangszustand der Insel — jeder Fall setzt sie selbst. */
function adresse(suche: string): void {
  window.history.replaceState(null, "", `/m/zeichen/baukasten${suche}`);
}

beforeEach(() => {
  adresse("");
});

afterEach(async () => {
  await unmount();
  vi.restoreAllMocks();
});

describe("Baukasten-Insel", () => {
  it("stellt die neun Achsen in der erzwungenen Reihenfolge dar", async () => {
    await mount(<BaukastenInsel />);
    expect(queryAll("[data-achse]").map((e) => e.getAttribute("data-achse"))).toEqual([
      "grundzeichenart",
      "zugehoerigkeit",
      "kopfzone",
      "funktion",
      "fussstreifen",
      "koerperform",
      "faehigkeit",
      "koerpermarken",
      "beschriftung",
    ]);
  });

  it("zeigt nach der Wahl einer Grundzeichenart eine Vorschau", async () => {
    await mount(<BaukastenInsel />);
    await click("[data-testid='tz-kachel-formation']");
    expect(query("[data-testid='tz-vorschau']").innerHTML).toContain("<svg");
  });

  /*
   * ⛔ EIN BEDIENFELD JE ACHSE, NICHT JE SPEC-FELD (Korrektur 3 des Auftrags,
   * Spec §6.1). Drei nebeneinanderstehende Auswahlfelder fuer dieselbe Zone laden
   * dazu ein, zwei davon zu setzen — gemessen erzeugte das bei jedem zweiten Klick
   * `head-zone-conflict`. Die drei Quellen laufen deshalb als `<optgroup>` in EINEM
   * Feld zusammen.
   */
  it("fuehrt die Kopfzone als EIN Feld mit drei Quellen", async () => {
    await mount(<BaukastenInsel />);
    const achse = query("[data-achse='kopfzone']");
    expect(achse.querySelectorAll("select")).toHaveLength(1);
    expect(
      Array.from(achse.querySelectorAll("optgroup")).map((g) => g.getAttribute("data-feld")),
    ).toEqual(["strength", "administrativeLevel", "technicalHeadMark"]);
  });

  /*
   * DIE ZWEI SPERRARTEN (M10, Spec §6.2): `scope: "value"` heisst „ueberall
   * unmoeglich" und bleibt dauerhaft ausgegraut; alles andere heisst „passt hier
   * nicht" und traegt seinen Grund am Feld. Ein Baukasten, der stattdessen
   * hinterher meckert, laesst 99,6 % Unsinn zu (M16: 894 von 225.720 tragen).
   */
  it("graut einen nirgends vermessenen Wert aus", async () => {
    await mount(<BaukastenInsel />);
    await click("[data-testid='tz-kachel-vehicle-land']");
    const option = query<HTMLOptionElement>(
      "[data-feld='vehicleCategory'] option[value='vehicleCategory:amphibienfahrzeug']",
    );
    expect(option.disabled).toBe(true);
    expect(option.textContent).toContain("nicht vermessen");
  });

  it("nennt gesperrte Kombinationen mit Grund am Feld", async () => {
    await mount(<BaukastenInsel />);
    await click("[data-testid='tz-kachel-building']");
    expect(query("[data-gesperrt='kopfzone']").textContent).toMatch(/Einheiten|passt/i);
  });

  /*
   * WORT ZUERST, ZEICHEN ZWEITENS, FARBE ZULETZT — und Rot gar nicht: in dieser
   * Suite ist `colorError === colorPrimary === #c8000f` (Falle 3), ein roter
   * Hinweis saehe aus wie eine Primaeraktion.
   */
  it("setzt keinen Fehlertext in Rot", async () => {
    await mount(<BaukastenInsel />);
    await click("[data-testid='tz-kachel-building']");
    const stil = query("[data-gesperrt='kopfzone']").getAttribute("style") ?? "";
    expect(stil).not.toMatch(/#c8000f|red/i);
  });

  /*
   * KORREKTUR 4 UND 5 DES AUFTRAGS (Spec §6.3): der Erklaertext haengt an der
   * Achse, an der die Regel entsteht — eine Sammelablage unter „Beschriftung"
   * schickte den Anwender dorthin, wo er gerade NICHT geklickt hat. Darunter steht
   * klein die originale Paketmeldung (`issue.message`, nicht `error.message` — die
   * ist fuers Log).
   */
  it("haengt den Regeltext an die betroffene Achse, mit der Paketmeldung darunter", async () => {
    await mount(<BaukastenInsel />);
    await fill("#tz-designation", "LANGERTEXTHIERUNTEN");
    const hinweis = query("[data-regel='fussstreifen']");
    expect(hinweis.textContent).toContain("zu breit");
    expect(query("[data-regel='fussstreifen'] [data-testid='tz-regel-meldung']").textContent).
      toContain("LANGERTEXTHIERUNTEN");
    expect(exists("[data-regel='beschriftung']")).toBe(false);
  });

  /*
   * KORREKTUR 6 DES AUFTRAGS (Spec §4.6 Stufe 2): eine aus `/meine` geoeffnete
   * Zusammenstellung, die die heutige Katalogfassung nicht mehr zeichnet, sagt
   * MIT WELCHER Fassung sie einmal gespeichert wurde. Ohne die Version sagt die
   * Meldung nicht, warum es heute nicht mehr geht.
   */
  it("nennt bei einer nicht mehr zeichenbaren Spec die gespeicherte Paketversion", async () => {
    const spec = kodiereSpec({ kind: "building", strength: "zug" } as never);
    adresse(`?s=${spec}&v=1.0.2`);
    await mount(<BaukastenInsel />);
    expect(query("[data-testid='tz-kein-bild']").textContent).toContain("1.0.2");
  });

  it("startet eine Uebungsaufgabe, zeigt nur die Bedeutung und schreibt nichts", async () => {
    // Der Wuerfel wird festgehalten: sonst zieht der Fall gelegentlich genau das
    // Zeichen, mit dem die Insel startet, und das Urteil lautete „Stimmt genau".
    vi.spyOn(Math, "random").mockReturnValue(0);
    await mount(<BaukastenInsel />);
    await click("[data-testid='tz-uebung-start']");
    const aufgabe = query("[data-testid='tz-uebung-aufgabe']");
    expect(aufgabe.textContent).toMatch(/Grundzeichen/);
    // Der gesuchte Titel steht NICHT da — sonst waere die Aufgabe geschenkt.
    expect(exists("[data-testid='tz-uebung-loesung']")).toBe(false);
    await click("[data-testid='tz-uebung-pruefen']");
    expect(query("[data-testid='tz-uebung-urteil']").textContent).toMatch(/Stimmt|fehlt|Anders/);
  });

  it("bietet die drei Ausgabewege an", async () => {
    await mount(<BaukastenInsel />);
    await click("[data-testid='tz-kachel-formation']");
    expect(exists("[data-testid='tz-export-svg']")).toBe(true);
    expect(exists("[data-testid='tz-export-png']")).toBe(true);
    expect(exists("[data-testid='tz-export-json']")).toBe(true);
  });

  /*
   * Kein `Form`/`Form.Item` (Compound, in RSC verboten — und eine zweite Bauform
   * fuers gleiche Formular hier). Statt dessen ein natives `<label htmlFor>`.
   */
  it("beschriftet das Namensfeld nativ ueber htmlFor", async () => {
    await mount(<BaukastenInsel />);
    const label = query<HTMLLabelElement>("label[for='tz-name']");
    expect(label.textContent).toMatch(/Name/);
    expect(exists("#tz-name")).toBe(true);
  });
});

/*
 * KORREKTUR 9 DES AUFTRAGS, dritte Stelle: `speichereEigenesZeichen` wirft ohne
 * Sitzung. Ungefangen reicht `useActionState` den Wurf weiter und die ganze
 * Baukastenflaeche verschwindet — samt der Zusammenstellung, an der jemand
 * gerade gearbeitet hat.
 */
describe("Baukasten-Insel — abgewiesene Aktion", () => {
  it("zeigt beim Speichern einen Satz und laesst die Flaeche stehen", async () => {
    const { speichereEigenesZeichen } = await import("../../actions");
    vi.mocked(speichereEigenesZeichen).mockRejectedValueOnce(new Error("Forbidden"));
    await mount(<BaukastenInsel />);

    await submitForm("[data-testid='tz-speichern']");

    expect(query("[data-testid='tz-speichern-fehler']").textContent).toContain(
      AKTION_FEHLGESCHLAGEN,
    );
    expect(exists("[data-achse='grundzeichenart']")).toBe(true);
  });
});
