// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  click,
  existsPortal,
  mount,
  queryAll,
  queryPortal,
  rerender,
  unmount,
} from "@/app/m/qr/_lib/test-dom";
import type { AuslastungZeile } from "../_db/queries";
import type { AufgabeRow, PersonRow } from "../_db/schema";
import { FORM_START, type FormState } from "../_lib/formState";
import s from "./aufgaben.module.css";

/*
 * DER ZEILENWEG VON `umverteilenAction` (Oberflaechen-Runde 2026-08-16).
 *
 * WARUM DIESE DATEI GEBRAUCHT WIRD, obwohl `VerteilenDialog.test.tsx` „Anders zuweisen" schon
 * prueft: die dortige Datei bewacht den MODALWEG, und der bleibt bestehen. Sie bliebe deshalb
 * gruen, waehrend der Zeilenweg genau die Zusage verloere, die sie fuer den Modal festhaelt — den
 * Satz ueber den geleerten Zeitplan. Zwei Wege zu derselben Action brauchen zwei Riegel; ein
 * Riegel fuer zwei Wege ist einer, der einen davon nicht sieht.
 *
 * `useActionState` GEMOCKT (Vorbild `VerteilenDialog.test.tsx`/`EinplanenFormular.test.tsx`) — so
 * laesst sich der Feldfehler-Zustand als frischer Mount herstellen, ohne eine echte
 * Server-Action-Transition. `umverteilenAction` ist nur ein SENTINEL; ihre Logik bewacht
 * `actions.test.ts`.
 */
const { useActionStateMock, UMVERTEILEN_MARKER, VERTEILEN_MARKER } = vi.hoisted(() => ({
  useActionStateMock: vi.fn(),
  UMVERTEILEN_MARKER: Symbol("umverteilenAction"),
  VERTEILEN_MARKER: Symbol("verteilenAction"),
}));

vi.mock("react", async (echt) => {
  const react = await echt<typeof import("react")>();
  return { ...react, useActionState: useActionStateMock };
});

// BEIDE SCHLUESSEL, AUCH WENN EIN EINZELNER FALL NUR EINEN BRAUCHT: `INLINE_ART` waehlt die Action
// VOR `useActionState` und liest damit BEIM IMPORT beide Eintraege (dieselbe Bauart und derselbe
// Grund wie in `VerteilenDialog.test.tsx`s `ZUWEISUNG`-Mock). Fehlt einer, wirft schon der Import.
vi.mock("../actions", () => ({
  umverteilenAction: UMVERTEILEN_MARKER,
  verteilenAction: VERTEILEN_MARKER,
}));

import { ZuweisenInline } from "./ZuweisenInline";

const AUFGABE: AufgabeRow = {
  id: "a1",
  titel: "Standwache",
  beschreibung: "B",
  prioritaet: "mittel",
  erstellerId: "malte",
  zugewiesenAn: "alina",
  status: "verteilt",
  faelligAm: "2026-08-10",
  faelligUhrzeit: null,
  dauerMinuten: 240,
  nachweisPflicht: false,
  nachweisArt: "text",
  prueferId: "malte",
  istSelbst: false,
  planDatum: "2026-08-12",
  planUhrzeit: null,
  planRang: 0,
  vorschlagDatum: null,
  vorschlagUhrzeit: null,
  erstelltAm: new Date(0),
  aktualisiertAm: new Date(0),
};

function person(id: string, name: string): PersonRow {
  return {
    id,
    name,
    rolle: "bufdi",
    email: `${id}@x`,
    aktivAb: "2026-01-01",
    aktivBis: null,
    wochenstunden: 39,
    arbeitstage: "1,2,3,4,5",
  } as unknown as PersonRow;
}

const BUFDIS = [person("alina", "Alina"), person("bendix", "Bendix")];
const AUSLASTUNG: AuslastungZeile[] = [
  { person: BUFDIS[0]!, verplantMinuten: 360, sollMinuten: 2340, ueberbucht: false },
  { person: BUFDIS[1]!, verplantMinuten: 880, sollMinuten: 2340, ueberbucht: false },
];

function setzeZustand(state: FormState): void {
  useActionStateMock.mockReturnValue([state, vi.fn(), false]);
}

beforeEach(() => {
  useActionStateMock.mockReset();
  setzeZustand(FORM_START);
});

afterEach(async () => {
  await unmount();
});

async function oeffne(): Promise<void> {
  await mount(<ZuweisenInline aufgabe={AUFGABE} bufdis={BUFDIS} auslastung={AUSLASTUNG} />);
  await click(`[data-testid="zuweisen-${AUFGABE.id}"]`);
}

describe("ZuweisenInline — die Zuweisung in der Zeile", () => {
  /**
   * DER AUSLOESER IST KEIN antd-KNOPF, UND DAS IST EINE ZUSAGE AN DEN ZAEHLRIEGEL: `e2e/aufgaben
   * .spec.ts` laesst in `data-testid="aufgaben-flaeche"` hoechstens EINEN `.ant-btn-primary` zu.
   * Solange dieser Weg gar keinen antd-Knopf rendert, kann er den Riegel strukturell nicht
   * reissen — vorher hing das an einem `primaer={false}` an der Aufrufstelle.
   */
  it("rendert einen stillen Ausloeser, keinen antd-Knopf", async () => {
    await mount(<ZuweisenInline aufgabe={AUFGABE} bufdis={BUFDIS} auslastung={AUSLASTUNG} />);
    const ausloeser = queryAll("button");
    expect(ausloeser).toHaveLength(1);
    expect(ausloeser[0]!.classList.contains("ant-btn")).toBe(false);
    expect(ausloeser[0]!.textContent).toContain("Zuweisen");
  });

  it("klappt erst auf Klick auf — vorher steht keine Namensliste im DOM", async () => {
    await mount(<ZuweisenInline aufgabe={AUFGABE} bufdis={BUFDIS} auslastung={AUSLASTUNG} />);
    expect(existsPortal("form")).toBe(false);
    await click(`[data-testid="zuweisen-${AUFGABE.id}"]`);
    expect(existsPortal("form")).toBe(true);
  });

  /**
   * ══ DIE WICHTIGSTE ZUSAGE DIESER DATEI (§7 Nr. 3). `_lib/lebenszyklus.ts` fuehrt `umverteilen`
   *    mit `planLoeschen: true`: wer anders zuweist, verliert die bestehende Tagesplanung. Der
   *    Wechsel vom Modal auf ein Zeilenfeld darf diese Auskunft nicht mitnehmen — sie ist der
   *    Grund, aus dem die Aktion ueberhaupt eine Bestaetigung braucht.
   *
   *    UND SIE MUSS VOR DER LISTE STEHEN, nicht irgendwo im Feld: sie betrifft die ENTSCHEIDUNG,
   *    und unter den Namen stuende sie hinter dem Klick, den sie beeinflussen soll. Deshalb wird
   *    die POSITION gemessen und nicht nur die Anwesenheit — ein `toContain` auf dem Feldtext
   *    bliebe gruen, wenn der Satz ans Ende rutschte.
   */
  it("nennt die Folge — den geleerten Zeitplan — UEBER der Namensliste", async () => {
    await oeffne();
    const feld = queryPortal("form");
    const text = feld.textContent ?? "";
    const satz = text.indexOf("Der bisher eingeplante Tag");
    const ersterName = text.indexOf("Alina");
    expect(satz, "der Satz ueber den geleerten Zeitplan fehlt").toBeGreaterThanOrEqual(0);
    expect(ersterName).toBeGreaterThanOrEqual(0);
    expect(satz, "der Satz steht hinter der Namensliste").toBeLessThan(ersterName);
  });

  /**
   * DIE PERSONENWAHL IST DAS ABSENDEN — dafuer muss jeder Namensknopf `type="submit"` UND
   * `name="zielId"` mit seiner Id als `value` tragen. Ein abgesendetes Formular traegt Name und
   * Wert SEINES Ausloesers; faellt eines der drei Attribute weg, kaeme bei `umverteilenAction` ein
   * Formular OHNE `zielId` an, und der Fehler waere nicht sichtbar kaputt, sondern nur ein
   * Feldfehler „Ziel fehlt" nach dem Klick.
   */
  it("macht jeden Namen selbst zum Absender — `zielId` als `name`/`value` am Submit-Knopf", async () => {
    await oeffne();
    const ziele = [...queryPortal("form").querySelectorAll<HTMLButtonElement>("button")];
    expect(ziele.map((b) => b.getAttribute("name"))).toEqual(["zielId", "zielId"]);
    expect(ziele.map((b) => b.getAttribute("type"))).toEqual(["submit", "submit"]);
    expect(ziele.map((b) => b.getAttribute("value"))).toEqual(["alina", "bendix"]);
    expect(queryPortal("input[name='aufgabeId']").getAttribute("value")).toBe("a1");
  });

  /**
   * DIE AUSLASTUNG STEHT AN JEDEM NAMEN (Modulspec §8.2, „damit der Vorschlag nicht ins Leere
   * geht") — sie ist der Grund, aus dem die Wahl ueberhaupt eine Entscheidung ist. Im Modal stand
   * sie in einem eigenen Block unter dem Formular.
   */
  it("zeigt die Wochenauslastung an jedem waehlbaren Namen", async () => {
    await oeffne();
    expect(queryPortal("form").textContent).toContain("14,67 / 39 Std.");
  });

  /**
   * DIE HEUTIGE TRAEGERIN IST NICHT WAEHLBAR: ein Klick auf sie waere ein Uebergang auf sich
   * selbst — `umverteilenAction` liesse ihn zu, aber er leerte den Zeitplan, ohne etwas zu
   * aendern. Das ist der eine Fall, in dem die Zeile mehr weiss als die Action, und deshalb steht
   * er hier statt in `lebenszyklus.ts`.
   */
  it("sperrt die Person, die die Aufgabe heute traegt — und sagt warum", async () => {
    await oeffne();
    const ziele = [...queryPortal("form").querySelectorAll<HTMLButtonElement>("button")];
    expect(ziele[0]!.disabled, "Alina traegt sie heute und darf nicht waehlbar sein").toBe(true);
    expect(ziele[0]!.textContent).toContain("trägt sie heute");
    expect(ziele[1]!.disabled).toBe(false);
  });

  /**
   * EIN FELDFEHLER KOMMT AM FELD AN, nicht auf einer Fehlerseite (Spec §9.9). Der Weg dorthin ist
   * `aria-describedby` an jedem Namensknopf — ohne ihn liest ein Screenreader die Meldung nie vor,
   * und das saehe kein Test, der nur den Text sucht.
   */
  it("zeigt einen `zielId`-Feldfehler im Feld und verknuepft ihn mit den Namen", async () => {
    setzeZustand({ ok: false, fieldErrors: { zielId: "Ziel fehlt" }, values: {} });
    await oeffne();
    const fehler = queryPortal(`.${s.zuweisenFehler}`);
    expect(fehler.textContent).toBe("Ziel fehlt");
    const ziele = [...queryPortal("form").querySelectorAll<HTMLButtonElement>("button")];
    expect(ziele[1]!.getAttribute("aria-describedby")).toBe(fehler.id);
  });

  /**
   * WAEHREND DES ABSENDENS IST KEIN ZWEITER KLICK MOEGLICH — sonst liefen zwei Zuweisungen
   * derselben Aufgabe gegeneinander, und die zweite gewaenne willkuerlich.
   */
  it("sperrt alle Namen, solange die Aktion laeuft", async () => {
    useActionStateMock.mockReturnValue([FORM_START, vi.fn(), true]);
    await oeffne();
    const ziele = [...queryPortal("form").querySelectorAll<HTMLButtonElement>("button")];
    expect(ziele.every((b) => b.disabled)).toBe(true);
  });

  /**
   * DIE MARKE, AN DER DIE AKTIONSSPALTE HAENGT: `.zeilenAktion` ist ohne Zuwendung durchsichtig,
   * und die Deckkraft eines Elternteils kann ein Kind nicht zuruecknehmen. Der Inhalt des Popover
   * liegt zudem im Portal, also greift `:focus-within` an der Zeile nicht mehr, sobald er offen
   * ist. Ohne `data-offen` verschwaende der Ausloeser unter dem geoeffneten Feld, sobald die Maus
   * die Zeile verlaesst — ein Ausfall, den nur ein Bildschirmabzug MIT Hover je zeigen wuerde.
   */
  it("markiert sich als offen, damit die Aktionsspalte sichtbar bleibt", async () => {
    await mount(<ZuweisenInline aufgabe={AUFGABE} bufdis={BUFDIS} auslastung={AUSLASTUNG} />);
    const huelle = () => queryAll(`.${s.zuweisenHuelle}`)[0]!;
    expect(huelle().getAttribute("data-offen")).toBeNull();
    await click(`[data-testid="zuweisen-${AUFGABE.id}"]`);
    expect(huelle().getAttribute("data-offen")).toBe("true");
  });

  /**
   * ══ DAS FELD SCHLIESST SICH, SOBALD DIE ZUWEISUNG GELANDET IST — UND ES IST DERSELBE FALL, DEN
   *    `VerteilenTabelle` ueber ihren `posteingang`-Prop loest, nur mit einem anderen Merkmal.
   *
   *    DER FEHLER, DEN EIN NAIVES `useState(false)` HIER MACHT: eine umverteilte Aufgabe bleibt
   *    `verteilt` und bleibt ueberfaellig, steht nach der Revalidierung also WEITER in derselben
   *    Zone, mit demselben `key`. Der lokale Schalter ueberlebte und das Feld bliebe offen stehen
   *    — mit einer gesperrten Zeile, die still auf die neue Person springt.
   *
   *    NUR EIN VOLLSTAENDIG DURCHGEFUEHRTER KLICK ZEIGT DAS. Kein Bildschirmabzug des OFFENEN
   *    Feldes sieht es, und jeder Test, der `useActionState` mockt, sieht die Revalidierung nie —
   *    dieser hier stellt sie deshalb als Prop-Wechsel her, was genau das ist, was React nach
   *    einer erfolgreichen Server-Action tut.
   */
  it("schliesst sich, sobald die Aufgabe eine andere Person traegt", async () => {
    await mount(<ZuweisenInline aufgabe={AUFGABE} bufdis={BUFDIS} auslastung={AUSLASTUNG} />);
    await click(`[data-testid="zuweisen-${AUFGABE.id}"]`);
    expect(existsPortal("form")).toBe(true);

    await rerender(
      <ZuweisenInline
        aufgabe={{ ...AUFGABE, zugewiesenAn: "bendix" }}
        bufdis={BUFDIS}
        auslastung={AUSLASTUNG}
      />,
    );
    expect(queryAll(`.${s.zuweisenHuelle}`)[0]!.getAttribute("data-offen")).toBeNull();
  });

  /**
   * DIE GEGENPROBE ZUM TEST DARUEBER: ein Neurendern OHNE Traegerwechsel darf das Feld NICHT
   * schliessen. Ohne sie waere „schliesst bei Wechsel" auch von der Fassung erfuellt, die bei
   * jedem beliebigen Neurendern zuklappt — und die waere unbedienbar, denn eine Zone rendert
   * neu, sobald irgendeine andere Zeile sich aendert.
   */
  it("bleibt bei einem Neurendern ohne Traegerwechsel offen", async () => {
    await mount(<ZuweisenInline aufgabe={AUFGABE} bufdis={BUFDIS} auslastung={AUSLASTUNG} />);
    await click(`[data-testid="zuweisen-${AUFGABE.id}"]`);
    await rerender(
      <ZuweisenInline
        aufgabe={{ ...AUFGABE, titel: "Anderer Titel" }}
        bufdis={BUFDIS}
        auslastung={AUSLASTUNG}
      />,
    );
    expect(queryAll(`.${s.zuweisenHuelle}`)[0]!.getAttribute("data-offen")).toBe("true");
  });
});
