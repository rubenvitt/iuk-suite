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
import type { AufgabeRow } from "../_db/schema";
import { FORM_START, type FormState } from "../_lib/formState";
import s from "./aufgaben.module.css";

/*
 * DER ZEILENWEG VON `einplanenAction` (Oberflaechen-Runde 2026-08-16, dritte Haelfte).
 *
 * WARUM DIESE DATEI GEBRAUCHT WIRD, obwohl `EinplanenFormular.test.tsx` dasselbe Feldpaar schon
 * prueft: die dortige Datei bewacht das SEITENFORMULAR auf `/plan/<person>`, und das bleibt
 * bestehen (es ist der einzige Ort mit dem Dauerfeld). Sie bliebe deshalb gruen, waehrend der
 * Zeilenweg still die Vorbelegung, den Fehlerpfad oder die Selbstschliessung verloere. Zwei Wege
 * zu derselben Action brauchen zwei Riegel — derselbe Grund, aus dem `ZuweisenInline.test.tsx`
 * neben `VerteilenDialog.test.tsx` steht.
 *
 * `useActionState` GEMOCKT (dasselbe Vorbild): so laesst sich der Feldfehler-Zustand als frischer
 * Mount herstellen, ohne echte Server-Action-Transition. `einplanenAction` ist nur ein SENTINEL;
 * ihre Logik bewacht `actions.test.ts`.
 */
const { useActionStateMock, MARKER } = vi.hoisted(() => ({
  useActionStateMock: vi.fn(),
  MARKER: Symbol("einplanenAction"),
}));

vi.mock("react", async (echt) => {
  const react = await echt<typeof import("react")>();
  return { ...react, useActionState: useActionStateMock };
});

vi.mock("../actions", () => ({ einplanenAction: MARKER }));

import { EinplanenInline } from "./EinplanenInline";

const AUFGABE: AufgabeRow = {
  id: "a1",
  titel: "Zeltlager-Inventar",
  beschreibung: "B",
  prioritaet: "niedrig",
  erstellerId: "malte",
  zugewiesenAn: "alina",
  status: "verteilt",
  faelligAm: "2026-08-21",
  faelligUhrzeit: null,
  dauerMinuten: 90,
  nachweisPflicht: false,
  nachweisArt: "text",
  prueferId: "malte",
  istSelbst: false,
  planDatum: null,
  planUhrzeit: null,
  planRang: 0,
  vorschlagDatum: "2026-08-13",
  vorschlagUhrzeit: "09:00",
  erstelltAm: new Date(0),
  aktualisiertAm: new Date(0),
};

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

describe("EinplanenInline — der Termin in der Zeile", () => {
  /**
   * DER AUSLOESER IST KEIN antd-KNOPF, UND DAS IST EINE ZUSAGE AN DEN ZAEHLRIEGEL: `e2e/
   * aufgaben.spec.ts` laesst in `data-testid="aufgaben-flaeche"` hoechstens EINEN
   * `.ant-btn-primary` zu, und diese Insel steht auf der Fuehrungskarte — also mitten in der
   * gemessenen Flaeche. Solange sie gar keinen antd-Knopf rendert, kann sie den Riegel
   * strukturell nicht reissen.
   */
  it("rendert einen stillen Ausloeser, keinen antd-Knopf", async () => {
    await mount(<EinplanenInline aufgabe={AUFGABE} />);
    const ausloeser = queryAll("button");
    expect(ausloeser).toHaveLength(1);
    expect(ausloeser[0]!.classList.contains("ant-btn")).toBe(false);
    expect(ausloeser[0]!.classList.contains(s.zeilenKnopf!)).toBe(true);
    expect(ausloeser[0]!.textContent).toContain("Anders einplanen");
  });

  it("klappt erst auf Klick auf — vorher steht kein Formular im DOM", async () => {
    await mount(<EinplanenInline aufgabe={AUFGABE} />);
    expect(existsPortal("form")).toBe(false);
    await click(`[data-testid="einplanen-${AUFGABE.id}"]`);
    expect(existsPortal("form")).toBe(true);
  });

  /**
   * ══ DIE FELDNAMEN SIND DIE DER ACTION, NICHT NEUE. `einplanenAction` liest `aufgabeId`,
   *    `planDatum` und `planUhrzeit`; weicht auch nur einer ab, laeuft der Klick in einen Feldfehler
   *    oder — schlimmer — still ins Leere, und kein Tor sieht es. Genau deshalb steht die Liste hier
   *    als GANZE Menge und nicht als drei einzelne `toBeTruthy`.
   *
   * ══ `dauerMinuten` STEHT ABSICHTLICH NICHT DARIN (s. Kopfkommentar der Komponente): die
   *    Zeilenfrage ist WANN, nicht WIE LANGE. Ohne diese Gegenprobe koennte eine spaetere Runde das
   *    Feld „der Vollstaendigkeit halber" ergaenzen und den Unterschied zum Seitenformular
   *    einebnen, den diese Datei bewacht.
   */
  it("sendet genau die drei Felder, die `einplanenAction` liest", async () => {
    await mount(<EinplanenInline aufgabe={AUFGABE} />);
    await click(`[data-testid="einplanen-${AUFGABE.id}"]`);
    const namen = Array.from(
      queryPortal("form").querySelectorAll<HTMLInputElement>("input[name]"),
    ).map((f) => f.name);
    expect(new Set(namen)).toEqual(new Set(["aufgabeId", "planDatum", "planUhrzeit"]));
    expect(namen).not.toContain("dauerMinuten");
  });

  /**
   * DER VORSCHLAG IST DIE VORBELEGUNG, WEIL DIESES FELD DER ABWEICHUNGSWEG IST. „Annehmen: Do,
   * 13.08., 09:00" steht als eigener Knopf DANEBEN; wer stattdessen dieses Feld oeffnet, will vom
   * Vorschlag abweichen — und braucht ihn dafuer als Ausgangspunkt. Ein leeres Feld zwaenge dazu,
   * ein Datum abzutippen, das eine Zeile weiter steht.
   */
  it("belegt Tag und Uhrzeit mit dem offenen Zeitvorschlag vor", async () => {
    await mount(<EinplanenInline aufgabe={AUFGABE} />);
    await click(`[data-testid="einplanen-${AUFGABE.id}"]`);
    const form = queryPortal("form");
    expect(form.querySelector<HTMLInputElement>("input[name=planDatum]")!.value).toBe("2026-08-13");
    expect(form.querySelector<HTMLInputElement>("input[name=planUhrzeit]")!.value).toBe("09:00");
  });

  /**
   * OHNE VORSCHLAG GEWINNT DER BESTEHENDE PLAN — die zweite Haelfte derselben Regel. Eine bereits
   * eingeplante Aufgabe, die man verschieben will, zeigt ihren HEUTIGEN Tag; alles andere waere
   * ein Formular, das den Ist-Zustand verschweigt.
   */
  it("belegt ohne Vorschlag mit dem bestehenden Plan vor", async () => {
    await mount(
      <EinplanenInline
        aufgabe={{
          ...AUFGABE,
          vorschlagDatum: null,
          vorschlagUhrzeit: null,
          planDatum: "2026-08-19",
          planUhrzeit: "14:30",
        }}
      />,
    );
    await click(`[data-testid="einplanen-${AUFGABE.id}"]`);
    const form = queryPortal("form");
    expect(form.querySelector<HTMLInputElement>("input[name=planDatum]")!.value).toBe("2026-08-19");
    expect(form.querySelector<HTMLInputElement>("input[name=planUhrzeit]")!.value).toBe("14:30");
  });

  /**
   * DER GETIPPTE WERT SCHLAEGT DIE VORBELEGUNG. Ohne diese Zeile faende `feldWert` zwar statt, die
   * Vorbelegung stuende aber danach und ueberschriebe sie — der Nutzer bekaeme nach einem
   * Feldfehler seinen Vorschlag zurueck statt dessen, was er eingegeben hat. Genau die
   * Asymmetrie, die `ZuweisenInline` bis heute hat (dort ohne `feldWert`).
   */
  it("traegt nach einem Feldfehler den gesendeten Wert zurueck, nicht die Vorbelegung", async () => {
    setzeZustand({
      ok: false,
      fieldErrors: { planDatum: "Der Tag liegt vor dem Eintritt dieser Person." },
      values: { planDatum: "2025-01-02", planUhrzeit: "07:15" },
    });
    await mount(<EinplanenInline aufgabe={AUFGABE} />);
    await click(`[data-testid="einplanen-${AUFGABE.id}"]`);
    const form = queryPortal("form");
    expect(form.querySelector<HTMLInputElement>("input[name=planDatum]")!.value).toBe("2025-01-02");
    expect(form.querySelector<HTMLInputElement>("input[name=planUhrzeit]")!.value).toBe("07:15");
    expect(queryPortal(`#ei-${AUFGABE.id}-datum-err`).textContent).toBe(
      "Der Tag liegt vor dem Eintritt dieser Person.",
    );
  });

  /**
   * ══ DIE SELBSTSCHLIESSUNG, UND SIE IST DER GRUND FUER DIE ABGELEITETE SICHTBARKEIT. Eine
   *    umgeplante Aufgabe kann in DERSELBEN Zone mit DEMSELBEN `key` stehen bleiben (eine
   *    ueberfaellige bleibt ueberfaellig, auch mit neuem Tag). Ein `useState(false)` ueberlebte die
   *    Revalidierung: das Feld bliebe offen stehen und zeigte still den alten Wert.
   *
   *    NUR EIN VOLLSTAENDIGER DURCHLAUF ZEIGT DAS — kein Bildschirmabzug des offenen Feldes und
   *    kein Test, der nur mountet. Hier wird deshalb der Prop-Wechsel nachgestellt, den die
   *    Revalidierung ausloest.
   */
  it("schliesst sich, wenn der Plan der Aufgabe wechselt", async () => {
    await mount(<EinplanenInline aufgabe={AUFGABE} />);
    await click(`[data-testid="einplanen-${AUFGABE.id}"]`);
    expect(existsPortal("form")).toBe(true);
    /*
     * ABGELESEN AN `data-offen`, NICHT AN `existsPortal` — antds `Popover` LAESST seinen Rumpf
     * nach dem Schliessen im Portal stehen (nur versteckt), und ein `existsPortal("form")` waere
     * hier dauerhaft wahr. Dieselbe Ablesestelle, die `ZuweisenInline.test.tsx` fuer denselben
     * Fall benutzt; sie ist ausserdem genau die Marke, an der die `:has()`-Regel im Stylesheet
     * haengt.
     */
    await rerender(<EinplanenInline aufgabe={{ ...AUFGABE, planDatum: "2026-08-14" }} />);
    expect(queryAll(`.${s.zuweisenHuelle}`)[0]!.getAttribute("data-offen")).toBeNull();
  });

  /**
   * DIE GEGENPROBE ZUM TEST DARUEBER: ein Neurendern OHNE Planwechsel darf das Feld NICHT
   * schliessen. Ohne sie waere „schliesst bei Wechsel" auch von der Fassung erfuellt, die bei
   * jedem beliebigen Neurendern zuklappt — und die waere unbedienbar, denn eine Zone rendert neu,
   * sobald irgendeine andere Zeile sich aendert.
   */
  it("bleibt bei einem Neurendern ohne Planwechsel offen", async () => {
    await mount(<EinplanenInline aufgabe={AUFGABE} />);
    await click(`[data-testid="einplanen-${AUFGABE.id}"]`);
    await rerender(<EinplanenInline aufgabe={{ ...AUFGABE, titel: "Anderer Titel" }} />);
    expect(queryAll(`.${s.zuweisenHuelle}`)[0]!.getAttribute("data-offen")).toBe("true");
  });

  /**
   * KEIN FOLGESATZ, UND DAS IST GEPRUEFT STATT UEBERSEHEN: `_lib/lebenszyklus.ts` fuehrt
   * `einplanen` mit `planLoeschen: false` — es SETZT einen Tag, es leert nichts. `ZuweisenInline`s
   * `umverteilen`-Zweig traegt `planLoeschen: true` und deshalb sehr wohl einen Satz. Wer hier je
   * einen ergaenzt, hat entweder die Action geaendert (dann gehoert der Satz hin und dieser Test
   * mit) oder eine leere Rueckfrage eingebaut (dann faellt er zu Recht).
   */
  it("traegt keinen Folgesatz — `einplanen` leert nichts", async () => {
    await mount(<EinplanenInline aufgabe={AUFGABE} />);
    await click(`[data-testid="einplanen-${AUFGABE.id}"]`);
    expect(queryPortal("form").querySelector(`.${s.zuweisenFolge}`)).toBeNull();
  });

  /**
   * DER ABSENDEKNOPF TRAEGT `.zuweisenZiel` UND DAMIT DIE 44PX — dieselbe Klasse wie die
   * Namensknoepfe der Zuweisung, aus demselben Grund (der Popover-Inhalt liegt im Portal, wo
   * weder `.modul` noch die `--auf-*`-Variablen greifen). Eine eigene Klasse waere eine zweite,
   * fast gleiche Regel; dieser Test haelt fest, dass es bei einer bleibt.
   */
  it("gibt dem Absenden die geteilte 44px-Klasse", async () => {
    await mount(<EinplanenInline aufgabe={AUFGABE} />);
    await click(`[data-testid="einplanen-${AUFGABE.id}"]`);
    const absenden = queryPortal("form").querySelector<HTMLButtonElement>("button[type=submit]");
    expect(absenden).not.toBeNull();
    expect(absenden!.classList.contains(s.zuweisenZiel!)).toBe(true);
    expect(absenden!.textContent).toContain("Einplanen");
  });
});
