// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { click, fill, mount, query, queryAll, submitForm, unmount } from "@/app/m/qr/_lib/test-dom";
import { feldWertImDom, listenOptionen, oeffneListe, waehleDatum } from "./testFelder";
import { FORM_START, type FormState } from "../_lib/formState";

/*
 * `useActionState` SELBST GEMOCKT (Vorbild `RoutineFormular.test.tsx`) — so laesst sich jeder
 * Zustand, inklusive eines Feldfehlers mit zurueckgetragenen Schaltern, als frischer Mount
 * herstellen. `aufgabeEinstellenAction` ist nur ein SENTINEL: dieser Test ruft sie nie auf, ihre
 * eigentliche Logik ist in `actions.test.ts` bewacht.
 */
const { useActionStateMock, EINSTELLEN_MARKER } = vi.hoisted(() => ({
  useActionStateMock: vi.fn(),
  EINSTELLEN_MARKER: Symbol("aufgabeEinstellenAction"),
}));

vi.mock("react", async (echt) => {
  const react = await echt<typeof import("react")>();
  return { ...react, useActionState: useActionStateMock };
});

vi.mock("../actions", () => ({ aufgabeEinstellenAction: EINSTELLEN_MARKER }));

import { AufgabeFormular } from "./AufgabeFormular";

let absendenMock: ReturnType<typeof vi.fn>;
function stelleZustandEin(zustand: FormState, laeuft = false): void {
  absendenMock = vi.fn();
  useActionStateMock.mockReturnValue([zustand, absendenMock, laeuft]);
}

beforeEach(() => {
  useActionStateMock.mockReset();
  stelleZustandEin(FORM_START);
});
afterEach(async () => {
  await unmount();
});

describe("AufgabeFormular — Zeile 1 und die Action", () => {
  it("„use client“ steht als allererste Zeile der Datei, vor jedem Kommentar", () => {
    const quelle = readFileSync("src/app/m/aufgaben/_ui/AufgabeFormular.tsx", "utf8");
    expect(quelle.split("\n")[0]).toBe('"use client";');
  });

  it("ruft useActionState mit aufgabeEinstellenAction auf", async () => {
    await mount(<AufgabeFormular darfFuerAndere={false} />);
    expect(useActionStateMock).toHaveBeenCalledWith(EINSTELLEN_MARKER, FORM_START);
  });
});

describe("AufgabeFormular — „fuer mich selbst einstellen“ erscheint nur, wo die Wahl besteht", () => {
  it("darfFuerAndere=false: KEIN Kontrollkaestchen, aber ein verstecktes Feld mit „true“", async () => {
    await mount(<AufgabeFormular darfFuerAndere={false} />);
    expect(queryAll("#af-fuerSichSelbst")).toHaveLength(0);
    const versteckt = query<HTMLInputElement>("input[type='hidden'][name='fuerSichSelbst']");
    expect(versteckt.value).toBe("true");
  });

  it("darfFuerAndere=true: das Kontrollkaestchen erscheint, standardmaessig NICHT angehakt", async () => {
    await mount(<AufgabeFormular darfFuerAndere />);
    const checkbox = query<HTMLInputElement>("#af-fuerSichSelbst");
    expect(checkbox.checked).toBe(false);
    expect(queryAll("input[type='hidden'][name='fuerSichSelbst']")).toHaveLength(0);
  });
});

describe("AufgabeFormular — Nachweispflicht schaltet die Formwahl sichtbar frei", () => {
  it("ohne Haken: keine Formwahl im DOM, aber ein verstecktes Feld mit dem Vorgabewert „text“", async () => {
    await mount(<AufgabeFormular darfFuerAndere={false} />);
    expect(queryAll("#af-nachweisart")).toHaveLength(0);
    const versteckt = query<HTMLInputElement>("input[type='hidden'][name='nachweisArt']");
    expect(versteckt.value).toBe("text");
  });

  /*
   * DIE FORMWAHL IST SEIT DER FUENFTEN OBERFLAECHEN-RUNDE (2026-08-16) antds `Select`, kein
   * `<select>` — die Zusage („nach dem Anhaken stehen genau Text und Bild zur Wahl") ist woertlich
   * dieselbe geblieben, nur liegen die Optionen jetzt im Portal statt als `<option>` im Feld.
   */
  it("nach dem Anhaken erscheint die Formwahl mit „Text“ und „Bild“", async () => {
    await mount(<AufgabeFormular darfFuerAndere={false} />);
    await click("#af-nachweispflicht");
    await oeffneListe("#af-nachweisart");
    expect(listenOptionen().map((o) => o.textContent)).toEqual(["Text", "Bild"]);
  });
});

describe("AufgabeFormular — sendet alle Felder, auch Schalter und Formwahl (Lektion 7)", () => {
  it("Titel, Erklaerung, Prioritaet, Frist, Dauer UND die Schalter kommen in der FormData an", async () => {
    await mount(<AufgabeFormular darfFuerAndere />);
    await fill("#af-titel", "Verbandskästen prüfen");
    await fill("#af-beschreibung", "Bestand kontrollieren.");
    await waehleDatum("#af-faelligAm", "2026-09-01");
    await fill("#af-dauerMinuten", "45");
    await click("#af-fuerSichSelbst");
    await click("#af-nachweispflicht");
    await submitForm();

    expect(absendenMock).toHaveBeenCalledTimes(1);
    const formData = absendenMock.mock.calls[0]![0] as FormData;
    expect(formData.get("titel")).toBe("Verbandskästen prüfen");
    expect(formData.get("beschreibung")).toBe("Bestand kontrollieren.");
    expect(formData.get("prioritaet")).toBe("mittel");
    expect(formData.get("faelligAm")).toBe("2026-09-01");
    expect(formData.get("dauerMinuten")).toBe("45");
    expect(formData.get("fuerSichSelbst")).toBe("true");
    expect(formData.get("nachweisPflicht")).toBe("true");
    expect(formData.get("nachweisArt")).toBe("text");
  });

  /*
   * DER FREMD-PFAD, UNVERAENDERT (Advisor-Fund): der Brief nennt ausdruecklich, dass die
   * Oberflaeche die richtige Wahl uebergeben muss — "fremd ergibt eingegangen mit dem Ersteller
   * als Pruefer". Ohne diesen Test wuerde ein Kontrollkaestchen, das versehentlich IMMER "true"
   * sendet (z. B. `value="true"` ohne `name`-Kopplung an `checked`), nicht auffallen.
   */
  it("darfFuerAndere: OHNE den Haken sendet das Formular gar kein `fuerSichSelbst` (der Fremd-Pfad)", async () => {
    await mount(<AufgabeFormular darfFuerAndere />);
    await fill("#af-titel", "T");
    await fill("#af-beschreibung", "B");
    await waehleDatum("#af-faelligAm", "2026-09-01");
    await fill("#af-dauerMinuten", "30");
    await submitForm();

    const formData = absendenMock.mock.calls[0]![0] as FormData;
    // Ein NICHT angehaktes `<input type="checkbox">` sendet gar kein Feld — `get()` liefert
    // `null`, keinen leeren String. `aufgabeEinstellenAction`s `istGesetzt` behandelt ein
    // fehlendes Feld ohnehin wie "nicht gesetzt" (Brief).
    expect(formData.get("fuerSichSelbst")).toBeNull();
  });

  /*
   * DER SELBST-PFAD FUER EINE ROLLE OHNE WAHL (Advisor-Fund): `darfFuerAndere={false}` traegt ein
   * VERSTECKTES Feld statt eines Kontrollkaestchens (Kopfkommentar) — dieser Test bindet, dass
   * dieses Feld tatsaechlich in der FormData ankommt, nicht nur, dass sein DOM-`value` "true" ist.
   */
  it("darfFuerAndere=false: das versteckte Feld sendet `fuerSichSelbst=true` mit", async () => {
    await mount(<AufgabeFormular darfFuerAndere={false} />);
    await fill("#af-titel", "T");
    await fill("#af-beschreibung", "B");
    await waehleDatum("#af-faelligAm", "2026-09-01");
    await fill("#af-dauerMinuten", "30");
    await submitForm();

    const formData = absendenMock.mock.calls[0]![0] as FormData;
    expect(formData.get("fuerSichSelbst")).toBe("true");
  });
});

describe("AufgabeFormular — Feldfehler tragen die Eingaben mit, einschliesslich Schalter und Formwahl", () => {
  it("zeigt eine Titel-Fehlermeldung am Feld, mit aria-invalid", async () => {
    stelleZustandEin({
      ok: false,
      fieldErrors: { titel: "Titel fehlt." },
      values: {
        titel: "", beschreibung: "B", prioritaet: "mittel", faelligAm: "", faelligUhrzeit: "",
        dauerMinuten: "30", nachweisArt: "text", fuerSichSelbst: "", nachweisPflicht: "",
      },
    });
    await mount(<AufgabeFormular darfFuerAndere />);
    expect(query("#af-titel-err").textContent).toBe("Titel fehlt.");
    expect(query<HTMLInputElement>("#af-titel").getAttribute("aria-invalid")).toBe("true");
  });

  /*
   * DER FALL, DEN DIE AUFGABE 9-FIX-RUNDE NAMENTLICH NENNT (Brief): ein verlorenes `fuerSichSelbst`
   * kippte die Aufgabe beim zweiten Absendeversuch von Selbst- auf Fremdaufgabe. Nach einem
   * Feldfehler MUSS das Kontrollkaestchen GENAU dem zurueckgemeldeten Wert folgen — nicht der
   * Vorgabe (unangehakt), sonst waere die Wahl der Person nach einem Tippfehler im Titel weg.
   */
  it("„fuer mich selbst“ UND „Nachweispflicht“ bleiben angehakt, wenn state.values es sagt", async () => {
    stelleZustandEin({
      ok: false,
      fieldErrors: { titel: "Titel fehlt." },
      values: {
        titel: "", beschreibung: "B", prioritaet: "hoch", faelligAm: "2026-09-01",
        faelligUhrzeit: "", dauerMinuten: "30", nachweisArt: "bild", fuerSichSelbst: "true",
        nachweisPflicht: "true",
      },
    });
    await mount(<AufgabeFormular darfFuerAndere />);
    expect(query<HTMLInputElement>("#af-fuerSichSelbst").checked).toBe(true);
    // `nachweisPflicht` steuert `useState`s Initialwert — mit gesetztem Haken erscheint die
    // Formwahl direkt, vorbelegt mit dem zurueckgemeldenen Wert "bild", nicht dem Vorgabewert "text".
    expect(feldWertImDom("nachweisArt")).toBe("bild");
  });

  it("die Prioritaet aus dem Feldfehler-Zustand gewinnt, nicht der Vorgabewert „mittel“", async () => {
    stelleZustandEin({
      ok: false,
      fieldErrors: { dauerMinuten: "Dauerschaetzung muss eine ganze Zahl groesser 0 sein." },
      values: {
        titel: "T", beschreibung: "B", prioritaet: "niedrig", faelligAm: "2026-09-01",
        faelligUhrzeit: "", dauerMinuten: "0", nachweisArt: "text", fuerSichSelbst: "",
        nachweisPflicht: "",
      },
    });
    await mount(<AufgabeFormular darfFuerAndere={false} />);
    /*
     * DIE PRIORITAET IST SEIT DER DRITTEN OBERFLAECHEN-RUNDE EINE RADIOGRUPPE, KEIN `<select>` —
     * die Zusage bleibt woertlich dieselbe („der zurueckgemeldete Wert gewinnt gegen die
     * Vorgabe"), nur ihre Ablesestelle wechselt vom `value` des Feldes zum `checked` der Stufe.
     *
     * ALLE DREI WERDEN GEPRUEFT, NICHT NUR DIE ERWARTETE: eine Radiogruppe kann auch ZWEI gesetzte
     * Felder haben, wenn `defaultChecked` falsch abgeleitet wird — der Browser zeigt dann eine
     * Stufe, sendet aber die andere. Ein `expect(niedrig.checked).toBe(true)` allein bliebe dabei
     * gruen.
     */
    const stufen = queryAll<HTMLInputElement>("input[name=prioritaet]");
    expect(stufen.map((f) => [f.value, f.checked] as const)).toEqual([
      ["hoch", false],
      ["mittel", false],
      ["niedrig", true],
    ]);
    expect(query("#af-dauerMinuten-err").textContent).toBe(
      "Dauerschaetzung muss eine ganze Zahl groesser 0 sein.",
    );
  });
});

describe("AufgabeFormular — waehrend `isPending`", () => {
  it("deaktiviert den Absende-Knopf, waehrend eine Absendung laeuft", async () => {
    stelleZustandEin(FORM_START, true);
    await mount(<AufgabeFormular darfFuerAndere={false} />);
    expect(query<HTMLButtonElement>("button[type='submit']").disabled).toBe(true);
  });
});
