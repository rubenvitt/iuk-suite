// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import {
  clickElement,
  exists,
  fill,
  mount,
  query,
  queryAll,
  rerender,
  submitForm,
  unmount,
} from "@/app/m/qr/_lib/test-dom";
import {
  feldWertImDom,
  listenOptionen,
  oeffneListe,
  waehleAusListe,
  waehleDatum,
} from "./testFelder";
import type { PersonRow } from "../_db/schema";
import { FORM_START, type FormState } from "../_lib/formState";

/*
 * DIESELBE PRUEFSTRATEGIE WIE `RoutineFormular.test.tsx`: `useActionState` selbst gemockt, die
 * beiden Actions nur als unterscheidbare Sentinels — sie werden nie ausgefuehrt.
 */
const { useActionStateMock, personenSucheActionMock, ANLEGEN_MARKER, AENDERN_MARKER } = vi.hoisted(
  () => ({
    useActionStateMock: vi.fn(),
    personenSucheActionMock: vi.fn(),
    ANLEGEN_MARKER: Symbol("personAnlegenAction"),
    AENDERN_MARKER: Symbol("personAendernAction"),
  }),
);

vi.mock("react", async (echt) => {
  const react = await echt<typeof import("react")>();
  return { ...react, useActionState: useActionStateMock };
});

vi.mock("../actions", () => ({
  personAnlegenAction: ANLEGEN_MARKER,
  personAendernAction: AENDERN_MARKER,
  personenSucheAction: personenSucheActionMock,
}));

import { PersonenFormular } from "./PersonenFormular";

const PERSON: PersonRow = {
  id: "p1",
  sub: "dev:alina@localtest.me",
  name: "Alina",
  initialen: "AL",
  rolle: "bufdi",
  sollMinutenTag: 468,
  aktivVon: "2026-08-01",
  aktivBis: null,
  erstelltAm: new Date(0),
};

let absendenMock: ReturnType<typeof vi.fn>;
function stelleZustandEin(zustand: FormState, laeuft = false): void {
  absendenMock = vi.fn();
  useActionStateMock.mockReturnValue([zustand, absendenMock, laeuft]);
}

beforeEach(() => {
  useActionStateMock.mockReset();
  personenSucheActionMock.mockReset();
  personenSucheActionMock.mockResolvedValue({ status: "ok", people: [] });
  stelleZustandEin(FORM_START);
});
afterEach(async () => {
  await unmount();
});

describe("PersonenFormular — Zeile 1 und die Action-Wahl", () => {
  it("„use client“ steht als allererste Zeile der Datei, vor jedem Kommentar", () => {
    const quelle = readFileSync("src/app/m/aufgaben/_ui/PersonenFormular.tsx", "utf8");
    expect(quelle.split("\n")[0]).toBe('"use client";');
  });

  it("waehlt personAnlegenAction ohne `person`-Prop", async () => {
    await mount(<PersonenFormular />);
    expect(useActionStateMock).toHaveBeenCalledWith(ANLEGEN_MARKER, FORM_START);
  });

  it("waehlt personAendernAction MIT `person`-Prop", async () => {
    await mount(<PersonenFormular person={PERSON} />);
    expect(useActionStateMock).toHaveBeenCalledWith(AENDERN_MARKER, FORM_START);
  });
});

describe("PersonenFormular — Anlegen: der sub ist ein echtes Feld, mit Erklaerung", () => {
  it("zeigt ein leeres sub-Feld und den Anlege-Knopf, kein verstecktes personId", async () => {
    await mount(<PersonenFormular />);
    expect(query<HTMLInputElement>("#pf-sub").value).toBe("");
    expect(query("button[type='submit']").textContent).toBe("Person anlegen");
    expect(queryAll("input[name='personId']")).toHaveLength(0);
  });

  /**
   * DER AUSGANG AUS `NichtEingetragenSeite.tsx` (Brief: "kein Feld, das die Koordination raten
   * laesst") — das Formular erklaert, WOHER der sub kommt, statt ihn nur abzufragen.
   */
  it("erklaert, woher die Kennung kommt — kein blindes Rate-Feld", async () => {
    await mount(<PersonenFormular />);
    expect(document.body.textContent).toContain("Hinweisseite");
  });

  it("sendet sub, Name, Initialen, Rolle, Soll-Zeit, aktivVon/aktivBis beim Absenden", async () => {
    await mount(<PersonenFormular />);
    await fill("#pf-sub", "dev:neu@localtest.me");
    await fill("#pf-name", "Neu");
    await fill("#pf-initialen", "NE");
    await fill("#pf-soll", "400");
    await waehleDatum("#pf-aktiv-von", "2026-08-14");
    await submitForm();

    expect(absendenMock).toHaveBeenCalledTimes(1);
    const formData = absendenMock.mock.calls[0]![0] as FormData;
    expect(formData.get("sub")).toBe("dev:neu@localtest.me");
    expect(formData.get("name")).toBe("Neu");
    expect(formData.get("initialen")).toBe("NE");
    expect(formData.get("sollMinutenTag")).toBe("400");
    expect(formData.get("aktivVon")).toBe("2026-08-14");
  });
});

/**
 * DIE ROLLENAUSWAHL BIETET DIE KOORDINATION NICHT MEHR AN (Quellenwechsel 2026-08-15) — und das ist
 * kein kosmetischer Punkt: solange „Koordination" hier zur Wahl stuende, verspraeche das Formular
 * eine Vergabe, die es nicht mehr leisten kann (die Rolle kommt aus der Pocket-ID-Gruppe, s.
 * `_lib/zugang.ts`), und die Koordination suchte den Fehler bei sich statt in der Gruppenpflege.
 * Die Auswahl liest `ROLLEN`/`ROLLE_TEXT` (`_db/schema.ts`, `_lib/anzeige.ts`) — dieser Test bindet
 * das ANGEBOT an die eine Quelle, statt es nur zu behaupten.
 */
describe("PersonenFormular — die Rollenauswahl kennt nur noch die zwei Tabellenrollen", () => {
  /*
   * DIE AUSWAHL IST SEIT DER FUENFTEN OBERFLAECHEN-RUNDE (2026-08-16) antds `Select` — die Zusage
   * bleibt woertlich dieselbe, ihre Ablesestelle wechselt. UND SIE WIRD DABEI STAERKER: ein
   * `<option>` trug Beschriftung und Wert im selben Knoten, ein antd-Eintrag traegt im DOM nur die
   * Beschriftung. Der Wert ist deshalb nicht mehr abzulesen, sondern zu ERPROBEN — jede
   * Beschriftung wird gewaehlt und der abgesendete Schluessel geprueft. Ein vertauschtes Paar
   * („Auftraggeber" auf `bufdi`) kaeme durch die alte Fassung durch, solange nur die zwei Listen
   * fuer sich stimmten; durch diese kommt es nicht.
   */
  it("bietet genau `auftrag` und `bufdi` an, nicht die Koordination", async () => {
    await mount(<PersonenFormular />);
    await oeffneListe("#pf-rolle");
    expect(listenOptionen().map((o) => o.textContent)).toEqual(["Auftraggeber", "BuFDi"]);

    await waehleAusListe("#pf-rolle", "BuFDi");
    expect(feldWertImDom("rolle")).toBe("bufdi");
    await waehleAusListe("#pf-rolle", "Auftraggeber");
    expect(feldWertImDom("rolle")).toBe("auftrag");
  });
});

describe("PersonenFormular — Aendern: der sub ist NICHT mehr editierbar", () => {
  it("zeigt Name/Rolle/Soll-Zeit/aktivVon/aktivBis vorbelegt, das versteckte personId, den Speichern-Knopf", async () => {
    await mount(<PersonenFormular person={PERSON} />);
    expect(query<HTMLInputElement>("#pf-name").value).toBe("Alina");
    expect(query<HTMLInputElement>("#pf-initialen").value).toBe("AL");
    expect(feldWertImDom("rolle")).toBe("bufdi");
    expect(query<HTMLInputElement>("#pf-soll").value).toBe("468");
    // SICHTBAR deutsch, ABGESENDET in ISO — s. den Kommentar in `EinplanenFormular.test.tsx`.
    expect(query<HTMLInputElement>("#pf-aktiv-von").value).toBe("01.08.2026");
    expect(feldWertImDom("aktivVon")).toBe("2026-08-01");
    expect(query<HTMLInputElement>("input[name='personId']").value).toBe("p1");
    expect(query("button[type='submit']").textContent).toBe("Speichern");
  });

  /**
   * DER SUB STEHT NUR NOCH ALS TEXT, NICHT ALS `<input name="sub">` (Kopfkommentar der Komponente):
   * ein geaendertes sub haengte die gesamte Geschichte einer Person still an eine andere Anmeldung
   * um. Kein Formularfeld heisst: ein manipuliertes Formular kann `sub` gar nicht mitschicken, weil
   * diese Komponente es nie rendert.
   */
  it("rendert KEIN Formularfeld namens sub — nur Lesetext", async () => {
    await mount(<PersonenFormular person={PERSON} />);
    expect(queryAll("input[name='sub']")).toHaveLength(0);
    expect(document.body.textContent).toContain("dev:alina@localtest.me");
  });
});

describe("PersonenFormular — Feldfehler tragen die Eingaben mit", () => {
  it("zeigt eine Name-Fehlermeldung am Feld, mit aria-invalid", async () => {
    stelleZustandEin({
      ok: false,
      fieldErrors: { name: "Name fehlt." },
      values: {
        sub: "dev:neu@localtest.me", name: "", initialen: "NE", rolle: "bufdi",
        sollMinutenTag: "300", aktivVon: "2026-08-14", aktivBis: "",
      },
    });
    await mount(<PersonenFormular />);
    expect(query("#pf-name-err").textContent).toBe("Name fehlt.");
    expect(query<HTMLInputElement>("#pf-name").getAttribute("aria-invalid")).toBe("true");
  });

  it("ein bereits vergebener sub kommt als Fehlermeldung am sub-Feld zurueck, der Wert bleibt stehen", async () => {
    stelleZustandEin({
      ok: false,
      fieldErrors: { sub: "Diese Kennung ist bereits vergeben." },
      values: {
        sub: "dev:doppelt@localtest.me", name: "Neu", initialen: "NE", rolle: "bufdi",
        sollMinutenTag: "300", aktivVon: "2026-08-14", aktivBis: "",
      },
    });
    await mount(<PersonenFormular />);
    expect(query<HTMLInputElement>("#pf-sub").value).toBe("dev:doppelt@localtest.me");
    expect(query("#pf-sub-err").textContent).toBe("Diese Kennung ist bereits vergeben.");
  });
});

describe("PersonenFormular — waehrend isPending", () => {
  it("deaktiviert den Absende-Knopf, waehrend eine Absendung laeuft", async () => {
    stelleZustandEin(FORM_START, true);
    await mount(<PersonenFormular />);
    expect(query<HTMLButtonElement>("button[type='submit']").disabled).toBe(true);
  });
});

/**
 * DAS VERZEICHNIS-AUTOFILL (Entwurf 2026-08-15 §6, Aufgabe 5 des Plans).
 *
 * VIER ZUSAGEN, DIE STILL BRECHEN:
 *
 * 1. OHNE VERZEICHNIS BLEIBT ALLES, WIE ES WAR. `verzeichnisAktiv` ist standardmaessig `false`,
 *    und in diesem Zweig gibt es weiterhin ein `<input name="sub" id="pf-sub">` samt dem Hinweis
 *    auf die Erklaerseite. Die Faelle darueber bezeugen das bereits — sie rendern das Formular
 *    ohne die neue Eigenschaft, also genau so.
 * 2. `#pf-sub` UEBERLEBT BEIDE ZWEIGE. `e2e/aufgaben.spec.ts` ("Leerer Start: der volle
 *    Rundlauf") tippt in genau dieses Feld; waere die Id nur im Rueckfallzweig da, faende der
 *    e2e-Lauf sie in einer Umgebung MIT hinterlegtem Key nicht mehr.
 * 3. GETIPPT WIRD WEITERHIN ANGENOMMEN. Findet die Suche niemanden oder antwortet das Verzeichnis
 *    nicht, IST der getippte Text der abgeschickte `sub` — sonst waere die Personenanlage genau
 *    dann unmoeglich, wenn der Identitaetsanbieter klemmt.
 * 4. EIN TREFFER BELEGT DREI FELDER VOR: `sub`, `name` und die daraus abgeleiteten `initialen`.
 *    `rolle`, `sollMinutenTag` und der Zeitraum bleiben Eingabe der Koordination.
 */
const TREFFER = [
  { userId: "PID-Alina", name: "Alina Rathje", email: "alina@iuk.example" },
  { userId: "pid-bendix", name: "Bendix Petersen", email: null },
];

/** Die Vorschlagsliste haengt in einem Portal an `document.body`, nicht im Wirt. */
function vorschlagsknoten(): HTMLElement[] {
  return Array.from(document.querySelectorAll<HTMLElement>(".ant-select-item-option"));
}

/** Verzoegerung (auf 0 gesetzt) plus die Mikrotasks der Server-Action durchlaufen lassen. */
async function warteAufSuche(): Promise<void> {
  await act(async () => {
    await new Promise((r) => setTimeout(r, 5));
  });
}

async function mitVerzeichnis(): Promise<void> {
  await mount(<PersonenFormular verzeichnisAktiv sucheVerzoegerungMs={0} />);
}

async function tippe(wert: string): Promise<void> {
  await fill("#pf-sub", wert);
  await warteAufSuche();
}

describe("PersonenFormular — Anlegen MIT Verzeichnis: Suche statt blindem Textfeld", () => {
  it("das Suchfeld traegt weiterhin #pf-sub, aber kein name — den traegt ein verstecktes Feld", async () => {
    await mitVerzeichnis();
    expect(query("#pf-sub").getAttribute("name")).toBeNull();
    expect(queryAll<HTMLInputElement>("input[name='sub']")).toHaveLength(1);
    expect(query<HTMLInputElement>("input[name='sub']").type).toBe("hidden");
  });

  it("erklaert beide Wege — Liste UND getippte Kennung von der Hinweisseite", async () => {
    await mitVerzeichnis();
    const hinweis = query("#pf-sub-hinweis").textContent ?? "";
    expect(hinweis).toContain("aus der Liste");
    expect(hinweis).toContain("Hinweisseite");
  });

  it("eine getippte Kennung IST der abgeschickte sub — ohne jeden Treffer", async () => {
    await mitVerzeichnis();
    await tippe("dev:neu@localtest.me");

    expect(query<HTMLInputElement>("input[name='sub']").value).toBe("dev:neu@localtest.me");

    await fill("#pf-name", "Neu");
    await fill("#pf-initialen", "NE");
    await submitForm();
    const formData = absendenMock.mock.calls[0]![0] as FormData;
    expect(formData.get("sub")).toBe("dev:neu@localtest.me");
    expect(formData.get("name")).toBe("Neu");
  });

  it("unter zwei Zeichen wird gar nicht gesucht", async () => {
    await mitVerzeichnis();
    await tippe("a");
    expect(personenSucheActionMock).not.toHaveBeenCalled();

    await tippe("al");
    expect(personenSucheActionMock).toHaveBeenCalledWith("al");
  });

  /** Die Kennung steht unter JEDEM Vorschlag — sie ist das einzige Merkmal, das weder optional
   *  noch mehrdeutig ist (Lehre aus `feedback/_ui/Zuordnung.tsx`, 2026-07-28). */
  it("zeigt zu jedem Vorschlag Name, E-Mail und die Kennung", async () => {
    personenSucheActionMock.mockResolvedValue({ status: "ok", people: TREFFER });
    await mitVerzeichnis();
    await tippe("al");

    const text = vorschlagsknoten()
      .map((k) => k.textContent ?? "")
      .join(" | ");
    expect(text).toContain("Alina Rathje");
    expect(text).toContain("alina@iuk.example");
    expect(text).toContain("PID-Alina");
    expect(text).toContain("pid-bendix");
  });

  it("ein Treffer belegt sub, Name und die abgeleiteten Initialen vor", async () => {
    personenSucheActionMock.mockResolvedValue({ status: "ok", people: TREFFER });
    await mitVerzeichnis();
    await tippe("al");

    const alina = vorschlagsknoten().find((k) => (k.textContent ?? "").includes("PID-Alina"));
    if (!alina) throw new Error("Vorschlag 'PID-Alina' nicht gefunden");
    await clickElement(alina);

    // GROSS-/KLEINSCHREIBUNG UNVERAENDERT: `sub`-Werte sind sensitiv (s. `actions.ts`).
    expect(query<HTMLInputElement>("input[name='sub']").value).toBe("PID-Alina");
    expect(query<HTMLInputElement>("#pf-name").value).toBe("Alina Rathje");
    expect(query<HTMLInputElement>("#pf-initialen").value).toBe("AR");
  });

  it("Rolle, Soll-Zeit und Zeitraum bleiben Eingabe der Koordination", async () => {
    personenSucheActionMock.mockResolvedValue({ status: "ok", people: TREFFER });
    await mitVerzeichnis();
    await tippe("al");
    const alina = vorschlagsknoten().find((k) => (k.textContent ?? "").includes("PID-Alina"));
    if (!alina) throw new Error("Vorschlag 'PID-Alina' nicht gefunden");
    await clickElement(alina);

    expect(feldWertImDom("rolle")).toBe("auftrag");
    expect(query<HTMLInputElement>("#pf-soll").value).toBe("468");
    expect(feldWertImDom("aktivVon")).toBe("");
    expect(feldWertImDom("aktivBis")).toBe("");
  });

  /**
   * "KENNT NIEMANDEN" UND "ANTWORTET NICHT" SIND ZWEI VERSCHIEDENE AUSKUENFTE. Der erste Satz
   * schickt die Koordination auf die Suche nach einem Tippfehler, den es beim zweiten gar nicht
   * gibt — deshalb reicht `personenSucheAction` den `status` mit durch.
   */
  it("unterscheidet 'niemanden gefunden' von 'Verzeichnis antwortet nicht'", async () => {
    await mitVerzeichnis();
    await tippe("zzz");
    expect(document.body.textContent).toContain("Niemand gefunden");

    personenSucheActionMock.mockResolvedValue({ status: "error", people: [] });
    await tippe("zzzz");
    expect(document.body.textContent).toContain("antwortet gerade nicht");
  });

  it("wirft die Suche, bleibt das Feld bedienbar", async () => {
    personenSucheActionMock.mockRejectedValue(new Error("weg"));
    await mitVerzeichnis();
    await tippe("dev:trotzdem@localtest.me");

    expect(query<HTMLInputElement>("input[name='sub']").value).toBe("dev:trotzdem@localtest.me");
  });

  /**
   * DER FELDFEHLER BRINGT DIE GETIPPTE KENNUNG ZURUECK — auch im Suchzweig.
   *
   * Im Rueckfallzweig erledigt das `defaultValue` von selbst; das Suchfeld ist KONTROLLIERT und
   * wird ueber seinen `key` neu aufgesetzt. Bestuende der `key` nur aus dem Absendezaehler,
   * bliebe das Feld auf dem leeren Stand des Absendens stehen: die Koordination bekaeme
   * „Diese Kennung ist bereits vergeben." zu einem Feld, das nichts mehr enthaelt.
   */
  it("nach einem Feldfehler steht die gesendete Kennung wieder im Suchfeld", async () => {
    await mitVerzeichnis();
    await tippe("dev:doppelt@localtest.me");
    await submitForm();

    // Der Server antwortet mit einem Feldfehler und traegt die Eingabe zurueck (`values`).
    stelleZustandEin({
      ok: false,
      fieldErrors: { sub: "Diese Kennung ist bereits vergeben." },
      values: {
        sub: "dev:doppelt@localtest.me", name: "Neu", initialen: "NE", rolle: "bufdi",
        sollMinutenTag: "300", aktivVon: "2026-08-14", aktivBis: "",
      },
    });
    await rerender(<PersonenFormular verzeichnisAktiv sucheVerzoegerungMs={0} />);

    expect(query<HTMLInputElement>("#pf-sub").value).toBe("dev:doppelt@localtest.me");
    expect(query<HTMLInputElement>("input[name='sub']").value).toBe("dev:doppelt@localtest.me");
    expect(query("#pf-sub-err").textContent).toBe("Diese Kennung ist bereits vergeben.");
  });

  /**
   * DASSELBE FUER NAME UND INITIALEN — der Fall, den die erste Fassung uebersah (Review-Runde).
   *
   * Beide Felder haengen im Suchzweig am selben Remount-Schluessel wie das Suchfeld, weil ein
   * Treffer sie ueberschreiben muss. Fehlten die Serverwerte darin, montierten sie beim Absenden
   * leer neu und blieben es: die Koordination bekaeme zu einem Fehler in einem GANZ ANDEREN Feld
   * ("Aktiv von fehlt") beim naechsten Absenden zusaetzlich "Name fehlt." und "Initialen fehlen."
   * — und muesste eine gerade getroffene Auswahl neu treffen.
   *
   * Im Rueckfallzweig gibt es den Fall nicht (kein `key`, `defaultValue` traegt) — die Gegenprobe
   * steht deshalb daneben.
   */
  it("nach einem Feldfehler stehen auch Name und Initialen wieder da", async () => {
    personenSucheActionMock.mockResolvedValue({ status: "ok", people: TREFFER });
    await mitVerzeichnis();
    await tippe("al");
    const alina = vorschlagsknoten().find((k) => (k.textContent ?? "").includes("PID-Alina"));
    if (!alina) throw new Error("Vorschlag 'PID-Alina' nicht gefunden");
    await clickElement(alina);
    await submitForm();

    // Der Server bemaengelt ein ANDERES Feld und traegt alle gesendeten Werte zurueck.
    stelleZustandEin({
      ok: false,
      fieldErrors: { aktivVon: "Aktiv von fehlt oder ist ungueltig." },
      values: {
        sub: "PID-Alina", name: "Alina Rathje", initialen: "AR", rolle: "auftrag",
        sollMinutenTag: "468", aktivVon: "", aktivBis: "",
      },
    });
    await rerender(<PersonenFormular verzeichnisAktiv sucheVerzoegerungMs={0} />);

    expect(query<HTMLInputElement>("#pf-name").value).toBe("Alina Rathje");
    expect(query<HTMLInputElement>("#pf-initialen").value).toBe("AR");
    expect(query<HTMLInputElement>("input[name='sub']").value).toBe("PID-Alina");
  });

  it("Gegenprobe ohne Verzeichnis: dort tragen Name und Initialen ohnehin", async () => {
    await mount(<PersonenFormular />);
    await fill("#pf-name", "Alina Rathje");
    await submitForm();

    stelleZustandEin({
      ok: false,
      fieldErrors: { aktivVon: "Aktiv von fehlt oder ist ungueltig." },
      values: {
        sub: "dev:alina@localtest.me", name: "Alina Rathje", initialen: "AR", rolle: "auftrag",
        sollMinutenTag: "468", aktivVon: "", aktivBis: "",
      },
    });
    await rerender(<PersonenFormular />);

    expect(query<HTMLInputElement>("#pf-name").value).toBe("Alina Rathje");
  });

  it("beim Aendern gibt es kein Suchfeld — der sub bleibt unveraenderlich", async () => {
    await mount(<PersonenFormular person={PERSON} verzeichnisAktiv />);
    expect(exists("#pf-sub")).toBe(false);
    expect(queryAll("input[name='sub']")).toHaveLength(0);
  });
});
