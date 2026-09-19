// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

/**
 * ZONE „KOMMENDE ABENDE" (DRK-426).
 *
 * Die einzige Liste der Gruppenseite, die nach VORN schaut. Alles andere dort —
 * Lagekarte, Verlauf, letzter Abend — beantwortet „was war". Daraus folgen die
 * Zusagen, die hier bewacht werden, und alle fünf brechen still:
 *
 * 1. LEER IST KEINE SACKGASSE. Eine Gruppe, die noch nichts geplant hat, sieht
 *    genau diese eine Zone — und wenn sie dann nur „nichts geplant" sagt und
 *    keinen Weg zur Planung trägt, gibt es auf der ganzen Seite keinen.
 * 2. DIE ORDNUNG GEHÖRT HIER NICHT DER KOMPONENTE. Genau umgekehrt zum
 *    `Verlauf`, der selbst sortiert: `_lib/cockpit.ts` liefert `geplant`
 *    aufsteigend, und die Zone reicht das unverändert durch. Eine zweite
 *    Sortierung hier wäre eine zweite Wahrheit — deshalb wird geprüft, dass
 *    KEINE stattfindet.
 * 3. DIE MARKEN SIND DIE EINZIGE ZEITANGABE DER ZEILE. Ein geplanter Abend
 *    faltet auf nichts, wenn sein Tag vorbei ist (`EveningStatus` in
 *    `_lib/lifecycle.ts`) — er bleibt stehen und wartet auf eine Entscheidung.
 *    Ohne „Frist abgelaufen" sucht niemand nach ihm. ⚠️ Die Marke nennt die
 *    FRIST, nicht den Kalendertag: am Morgen nach dem Dienstabend ist der Tag
 *    vorbei, der Bogen aber noch freigebbar — eine Marke neben einem
 *    bedienbaren Knopf wäre ein Widerspruch im selben Bild.
 * 4. DIE FREIGABE NENNT, WAS SIE BEENDET. „Die laufende Umfrage wird beendet"
 *    ohne Namen ist eine Warnung, die niemand prüfen kann: es gibt je Gruppe nur
 *    einen QR-Code, die Entscheidung ist also unwiderruflich und trifft einen
 *    Abend, den man beim Freigeben gerade nicht ansieht.
 * 5. „STEHT SCHON" IST DER ERSATZ FÜR EINE RÜCKMELDUNG. `planEveningsAction`
 *    kommt ohne Formularzustand aus, und ein belegter Tag wird still
 *    übersprungen. Der Dialog muss das VOR dem Absenden sagen und den Knopf
 *    sperren — sonst schließt er sich, und es ist nichts passiert.
 */

const { absagenActionMock, freigebenActionMock, planEveningsActionMock, updateEveningActionMock } =
  vi.hoisted(() => ({
    absagenActionMock: vi.fn(),
    freigebenActionMock: vi.fn(),
    planEveningsActionMock: vi.fn(),
    updateEveningActionMock: vi.fn(),
  }));

/*
 * Die Actions liegen hinter `"use server"` und ziehen Datenbank und `next/*`
 * nach — hier interessiert nur, DASS die richtige mit dem richtigen Schlüssel
 * gerufen wird. `updateEveningAction` gehört nicht der Zone, sondern der
 * `AbendBearbeiten`-Insel, die jede Zeile mitbringt: ohne sie im Mock zöge der
 * echte Modulkörper an.
 */
vi.mock("../actions", () => ({
  absagenAction: absagenActionMock,
  freigebenAction: freigebenActionMock,
  planEveningsAction: planEveningsActionMock,
  updateEveningAction: updateEveningActionMock,
}));

import { KommendeAbende, type GeplanterAbend } from "./KommendeAbende";
import { freigabelage } from "../_lib/lifecycle";
import { clickElement, mount, unmount } from "@/app/m/qr/_lib/test-dom";

/** `evenings.date` ist Mitternacht UTC und meint einen Kalendertag. */
const tag = (iso: string) => new Date(`${iso}T00:00:00Z`);

const HEUTE = "2026-07-25";

function abend(over: Partial<Omit<GeplanterAbend, "datum">> & { datum?: string } = {}): GeplanterAbend {
  const datum = tag(over.datum ?? "2026-08-05");
  return {
    eveningId: over.eveningId ?? 1,
    datum,
    thema: over.thema === undefined ? "Funkübung" : over.thema,
    notizen: over.notizen ?? null,
    /*
     * Vorgabe über die ECHTE Regel statt über ein Literal: sonst müsste jeder
     * Testfall die Lage von Hand setzen, und eine Fixture mit `lage: "ok"` an
     * einem Termin im Dezember wäre eine Lage, die es nie gibt. 48 Stunden ist
     * die Vorgabefrist der Suite.
     */
    lage: over.lage ?? freigabelage(datum, 48, tag(HEUTE)),
  };
}

const zone = (
  abende: GeplanterAbend[],
  extra: { belegteTage?: string[]; laufendesThema?: string | null } = {},
) => (
  <KommendeAbende
    groupId={7}
    abende={abende}
    belegteTage={extra.belegteTage ?? []}
    heute={HEUTE}
    laufendesThema={extra.laufendesThema ?? null}
  />
);

function zeichne(
  abende: GeplanterAbend[],
  extra: { belegteTage?: string[]; laufendesThema?: string | null } = {},
): HTMLElement {
  const wirt = document.createElement("div");
  wirt.innerHTML = renderToStaticMarkup(zone(abende, extra) as ReactElement);
  return wirt;
}

const zeilen = (wirt: HTMLElement): HTMLElement[] => [
  ...wirt.querySelectorAll<HTMLElement>("[data-testid='kommender-abend']"),
];

/** Knöpfe im GANZEN Dokument: Modal, Dropdown und Popconfirm hängen im Portal. */
function knopf(beschriftung: string, wurzel: ParentNode = document): HTMLElement {
  const treffer = [...wurzel.querySelectorAll<HTMLElement>("button")].find(
    (b) => (b.textContent ?? "").trim() === beschriftung,
  );
  if (!treffer) throw new Error(`Kein Knopf „${beschriftung}“`);
  return treffer;
}

/**
 * React hängt an den value-Setter der Eingabe einen eigenen Tracker; eine
 * direkte Zuweisung läse er als „unverändert". `fill` aus dem Harness sucht im
 * Mount-Wirt — der Planungsdialog hängt aber (antd `Modal`) im Portal, also
 * dasselbe Muster mit einem Element statt einem Selektor.
 */
async function tippe(feld: HTMLInputElement, wert: string): Promise<void> {
  const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(feld), "value")!.set!;
  await act(async () => {
    setter.call(feld, wert);
    feld.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

/** Der Planungsdialog, geöffnet über den einzigen Weg, den die Zone anbietet. */
async function planungOeffnen(belegteTage: string[] = []): Promise<HTMLFormElement> {
  await mount(zone([], { belegteTage }));
  await clickElement(knopf("Dienstabend planen"));
  const form = document.querySelector<HTMLFormElement>("form[data-testid='abende-planen']");
  if (!form) throw new Error("Kein Planungsformular");
  return form;
}

afterEach(async () => {
  await unmount();
  absagenActionMock.mockReset();
  freigebenActionMock.mockReset();
  planEveningsActionMock.mockReset();
  updateEveningActionMock.mockReset();
});

/*
 * Die Zone entfällt anders als der Verlauf NICHT in der Betriebsart
 * „Einrichtung": eine Gruppe ohne je erhobenes Feedback kann ihr Jahr längst
 * geplant haben. Ist sie dann doch leer, ist sie das Einzige, was auf der Seite
 * steht — und der Knopf ist der einzige Weg zur Planung, den es überhaupt gibt.
 * Ein Leerzustand ohne ihn wäre die teuerste Art von Sackgasse: eine, die
 * aussieht, als sei alles in Ordnung.
 */
describe("KommendeAbende — leer ist ein Zustand, keine Sackgasse", () => {
  it("erklärt, wozu die Zone da ist, statt eine leere Liste zu zeigen", () => {
    const wirt = zeichne([]);

    expect(zeilen(wirt)).toHaveLength(0);
    expect(wirt.textContent).toContain("Noch nichts geplant.");
    expect(wirt.textContent).toContain(
      "Du kannst kommende Dienstabende im Voraus eintragen",
    );
  });

  it("lässt „Dienstabend planen“ auch ohne einen einzigen Abend erreichbar", () => {
    const wirt = zeichne([]);
    const beschriftungen = [...wirt.querySelectorAll<HTMLElement>("button")].map((b) =>
      (b.textContent ?? "").trim(),
    );

    expect(beschriftungen).toContain("Dienstabend planen");
  });

  it("trägt den Knopf auch dann, wenn die Liste voll ist — er wandert nicht mit", () => {
    const wirt = zeichne([abend()]);
    const beschriftungen = [...wirt.querySelectorAll<HTMLElement>("button")].map((b) =>
      (b.textContent ?? "").trim(),
    );

    expect(beschriftungen).toContain("Dienstabend planen");
  });
});

/*
 * ⚠️ HIER SORTIERT DIE KOMPONENTE ABSICHTLICH NICHT — genau umgekehrt zum
 * `Verlauf`, der es tut. Die Ordnung entsteht in `_lib/cockpit.ts`
 * (`geplant`, aufsteigend); eine zweite Sortierung in der Zone wäre eine zweite
 * Wahrheit, die beim nächsten Wechsel der Regel lautlos auseinanderliefe.
 *
 * Geprüft wird mit einer ABSICHTLICH UNSORTIERTEN Eingabe: käme sie schon
 * sortiert herein, wäre die Zusicherung mit und ohne Sortierung erfüllt und
 * sagte nichts aus.
 */
describe("KommendeAbende — die Ordnung kommt von der Seite, nicht von hier", () => {
  const durcheinander = [
    abend({ eveningId: 3, datum: "2026-09-02", thema: "Kartenkunde" }),
    abend({ eveningId: 1, datum: "2026-08-05", thema: "Funkübung" }),
    abend({ eveningId: 2, datum: "2026-08-19", thema: "Erste Hilfe" }),
  ];

  it("zeigt die Abende in der Reihenfolge, in der sie hereingereicht werden", () => {
    const texte = zeilen(zeichne(durcheinander)).map((z) => z.textContent ?? "");

    expect(texte).toHaveLength(3);
    // Datum UND Thema: nach Datum wäre die Liste sonst 05.08./19.08./02.09.,
    // die Zusicherung fiele also auch dann, wenn nur eines von beiden stimmte.
    expect(texte[0]).toContain("02.09.2026");
    expect(texte[0]).toContain("Kartenkunde");
    expect(texte[1]).toContain("05.08.2026");
    expect(texte[1]).toContain("Funkübung");
    expect(texte[2]).toContain("19.08.2026");
    expect(texte[2]).toContain("Erste Hilfe");
  });

  it("lässt die übergebene Liste unberührt — sie gehört der Seite", () => {
    const eingabe = [...durcheinander];
    zeichne(eingabe);

    expect(eingabe.map((a) => a.eveningId)).toEqual([3, 1, 2]);
  });
});

/*
 * Ein geplanter Abend, dessen Tag vorbei ist, faltet auf nichts — er bleibt
 * stehen und wartet auf eine Entscheidung (freigeben oder absagen). Die Marke
 * ist die einzige Stelle, an der das sichtbar wird; ohne sie liest sich die
 * Zeile wie jeder andere kommende Abend, und niemand sucht nach ihr.
 *
 * Der Vergleich läuft über `tagInZone` gegen den von der Seite gerechneten Tag
 * (§4.5) und nicht über `Date.now()`: sonst hinge das Ergebnis an der Zone des
 * Servers und kippte zwischen 00:00 und 02:00 Ortszeit auf den Vortag.
 */
describe("KommendeAbende — die Marken der Zeile", () => {
  const drei = [
    abend({ eveningId: 1, datum: HEUTE, thema: "Heute Abend" }),
    abend({ eveningId: 2, datum: "2026-07-18", thema: "Letzte Woche" }),
    abend({ eveningId: 3, datum: "2026-08-05", thema: "Nächsten Monat" }),
  ];

  it("markiert den Abend des heutigen Tages mit „heute“", () => {
    const [heute] = zeilen(zeichne(drei));

    expect(heute.querySelectorAll("[data-testid='abend-heute']")).toHaveLength(1);
    expect(heute.querySelector("[data-testid='abend-heute']")!.textContent).toBe("heute");
    expect(heute.querySelectorAll("[data-testid='abend-ueberfaellig']")).toHaveLength(0);
  });

  it("markiert einen Abend mit abgelaufener Frist als „Frist abgelaufen“", () => {
    const vorbei = zeilen(zeichne(drei))[1];

    expect(vorbei.querySelectorAll("[data-testid='abend-ueberfaellig']")).toHaveLength(1);
    expect(vorbei.querySelector("[data-testid='abend-ueberfaellig']")!.textContent).toBe(
      "Frist abgelaufen",
    );
    expect(vorbei.querySelectorAll("[data-testid='abend-heute']")).toHaveLength(0);
  });

  it("MARKIERT NICHT, solange die Frist noch läuft — auch wenn der Tag vorbei ist", () => {
    /*
     * Der Alltagsfall, und er trennt die beiden Zeitriegel: wer den Bogen am
     * Morgen nach dem Dienstabend freigibt, ist spät dran, aber innerhalb der
     * Frist (bei 48 Stunden bis zwei Tage Rückstand). Eine Marke „abgelaufen"
     * stünde hier neben einem Knopf, der funktioniert.
     */
    const gestern = zeilen(zeichne([abend({ datum: "2026-07-24" })]))[0];

    expect(gestern.querySelectorAll("[data-testid='abend-ueberfaellig']")).toHaveLength(0);
    const knopf = [...gestern.querySelectorAll("button")].find(
      (b) => (b.textContent ?? "").trim() === "Feedback freigeben",
    )!;
    expect(knopf.hasAttribute("disabled")).toBe(false);
  });

  it("SCHALTET DEN KNOPF AB, wo die Action werfen würde — mit Grund", () => {
    // Ein Knopf, der wirft, ist schlimmer als keiner: die Bestätigung verspricht
    // „ab sofort kann geantwortet werden", und die Action lehnt danach ab.
    for (const [datum, grund] of [
      ["2026-08-05", "Freigabe erst am Tag des Dienstabends"],
      ["2026-07-18", "Die Frist dieses Abends ist abgelaufen"],
    ] as const) {
      const zeile = zeilen(zeichne([abend({ datum })]))[0];
      const knopf = [...zeile.querySelectorAll("button")].find(
        (b) => (b.textContent ?? "").trim() === "Feedback freigeben",
      )!;

      expect(knopf.hasAttribute("disabled")).toBe(true);
      expect(knopf.getAttribute("title")).toContain(grund);
    }
  });

  it("lässt einen künftigen Abend ohne jede Marke — sie ist ein Hinweis, kein Schmuck", () => {
    const kuenftig = zeilen(zeichne(drei))[2];

    expect(kuenftig.querySelectorAll("[data-testid='abend-heute']")).toHaveLength(0);
    expect(kuenftig.querySelectorAll("[data-testid='abend-ueberfaellig']")).toHaveLength(0);
  });

  it("nennt Wochentag und Datum ausgeschrieben — nie ISO (§4.7)", () => {
    const text = zeilen(zeichne([abend({ datum: "2026-08-05" })]))[0].textContent ?? "";

    expect(text).toContain("Mittwoch");
    expect(text).toContain("05.08.2026");
    expect(text).not.toContain("2026-08-05");
  });
});

/*
 * Ohne Thema steht die zweite Zeile sonst LEER da — und eine leere Zeile liest
 * sich wie ein Ladefehler, nicht wie eine Angabe, die es nicht gibt. Der Abend
 * ist trotzdem vollständig: ein Thema ist optional, und wer weit im Voraus
 * plant, kennt es oft noch nicht.
 */
describe("KommendeAbende — ein Abend ohne Thema", () => {
  it("schreibt „Ohne Thema“ statt einer leeren Zeile", () => {
    const text = zeilen(zeichne([abend({ thema: null })]))[0].textContent ?? "";

    expect(text).toContain("Ohne Thema");
  });

  it("zeigt ein vorhandenes Thema unverändert", () => {
    const text = zeilen(zeichne([abend({ thema: "Erste Hilfe" })]))[0].textContent ?? "";

    expect(text).toContain("Erste Hilfe");
    expect(text).not.toContain("Ohne Thema");
  });
});

/*
 * FREIGEBEN IST UNWIDERRUFLICH UND TRIFFT ETWAS, DAS MAN GERADE NICHT ANSIEHT.
 * Es gibt je Gruppe nur einen QR-Code; eine laufende Umfrage wird dabei beendet.
 * Deshalb muss die Bestätigung sie beim NAMEN nennen — „die laufende Umfrage
 * wird beendet" ist eine Warnung, die niemand prüfen kann, und wer sie nicht
 * prüfen kann, klickt sie weg.
 *
 * Die Gegenprobe gehört dazu: läuft nichts, darf der Satz auch nicht dastehen —
 * eine Warnung vor einer Folge, die es nicht gibt, kostet die Glaubwürdigkeit
 * der Warnung im Fall, in dem es sie gibt.
 */
describe("KommendeAbende — Feedback freigeben (§4.6)", () => {
  /*
   * ⚠️ DER ABEND MUSS HEUTE SEIN. Freigegeben wird erst ab dem Tag des
   * Dienstes — vorher ist der Knopf abgeschaltet, weil die Freigabe den Abend
   * auf „hat stattgefunden" setzt. Ein Termin im August (die Vorgabe von
   * `abend()`) haette hier also gar keinen bedienbaren Knopf ergeben, und der
   * Test haette am falschen Ort gemeldet, es gebe keine Bestaetigung.
   */
  async function bestaetigung(laufendesThema: string | null): Promise<HTMLElement> {
    await mount(zone([abend({ eveningId: 42, datum: HEUTE })], { laufendesThema }));
    await clickElement(knopf("Feedback freigeben"));
    const dialog = document.querySelector<HTMLElement>(".ant-popconfirm");
    if (!dialog) throw new Error("Keine Bestätigung");
    return dialog;
  }

  it("nennt das Thema der laufenden Umfrage, die dabei beendet wird", async () => {
    const text = (await bestaetigung("Kartenkunde")).textContent ?? "";

    expect(text).toContain("Kartenkunde");
    expect(text).toContain("wird dabei beendet");
    expect(text).toContain("es gibt je Gruppe nur einen QR-Code");
  });

  it("warnt nicht vor dem Beenden, wenn gar nichts läuft", async () => {
    const text = (await bestaetigung(null)).textContent ?? "";

    expect(text).toContain("Ab sofort kann über den QR-Code der Gruppe geantwortet werden.");
    expect(text).not.toContain("wird dabei beendet");
  });

  it("gibt erst nach der Bestätigung frei, mit der Kennung des Abends", async () => {
    const dialog = await bestaetigung("Kartenkunde");
    expect(freigebenActionMock).not.toHaveBeenCalled();

    await clickElement(knopf("Freigeben", dialog));

    expect(freigebenActionMock).toHaveBeenCalledTimes(1);
    const daten = freigebenActionMock.mock.calls[0][0] as FormData;
    expect(daten.get("eveningId")).toBe("42");
  });

  it("gibt den Abend frei, auf dessen Zeile geklickt wurde — nicht den ersten", async () => {
    // Gestern und heute: beide innerhalb der Frist und damit freigebbar. Ein
    // Termin von letzter Woche waere abgelaufen, sein Knopf abgeschaltet — der
    // Test haette dann am falschen Ort gemeldet, es gebe keine zwei Knoepfe.
    await mount(
      zone([abend({ eveningId: 11, datum: "2026-07-24" }), abend({ eveningId: 22, datum: HEUTE })]),
    );
    const knoepfe = [...document.querySelectorAll<HTMLElement>("button")].filter(
      (b) => (b.textContent ?? "").trim() === "Feedback freigeben",
    );
    expect(knoepfe).toHaveLength(2);

    await clickElement(knoepfe[1]);
    const dialog = document.querySelector<HTMLElement>(".ant-popconfirm")!;
    await clickElement(knopf("Freigeben", dialog));

    expect((freigebenActionMock.mock.calls[0][0] as FormData).get("eveningId")).toBe("22");
  });
});

/*
 * ABSAGEN liegt im „…"-Menü und nicht als eigener Knopf in der Zeile: die Zeile
 * hat GENAU EINE Hauptaktion (freigeben), und zwei gleich große Knöpfe
 * nebeneinander machen die Entscheidung zur Suchaufgabe. Geprüft wird der Weg
 * über das Menü mit, weil der Menüpunkt sonst genau der Fall wäre, der schlimmer
 * ist als ein fehlender: sichtbar, bedienbar, wirkungslos.
 */
describe("KommendeAbende — Abend absagen", () => {
  async function menuepunkt(beschriftung: string, welche = 0): Promise<HTMLElement> {
    const punkte = [...document.querySelectorAll<HTMLElement>("button")].filter(
      (b) => (b.textContent ?? "").trim() === "…",
    );
    if (punkte.length === 0) throw new Error("Kein Aktionsmenü in der Zeile");
    await clickElement(punkte[welche]);
    const eintrag = [...document.querySelectorAll<HTMLElement>(".ant-dropdown-menu-item")].find(
      (e) => (e.textContent ?? "").trim() === beschriftung,
    );
    if (!eintrag) throw new Error(`Kein Menüpunkt „${beschriftung}“`);
    return eintrag;
  }

  /**
   * DER MENÜPUNKT SAGT NOCH NICHTS AB, er fragt. Das ist der Punkt dieses
   * Blocks: ein Fehlklick in einem Dropdown ist billig, und die Rücknahme liegt
   * in einer anderen Zone (im Verlauf, „Doch wieder ansetzen") — wer sie sucht,
   * muss erst begreifen, wohin der Abend verschwunden ist.
   */
  async function bestaetigeAbsage(welche = 0): Promise<HTMLElement> {
    await clickElement(await menuepunkt("Abend absagen", welche));
    const dialog = document.querySelector<HTMLElement>(".ant-popconfirm");
    if (!dialog) throw new Error("Keine Bestätigung");
    return dialog;
  }

  it("fragt erst nach und ruft `absagenAction` dann mit der Kennung des Abends", async () => {
    await mount(zone([abend({ eveningId: 42 })]));

    const dialog = await bestaetigeAbsage();
    expect(absagenActionMock).not.toHaveBeenCalled();
    expect(dialog.textContent ?? "").toContain("bleibt im Verlauf stehen");

    await clickElement(knopf("Absagen", dialog));

    expect(absagenActionMock).toHaveBeenCalledTimes(1);
    expect((absagenActionMock.mock.calls[0][0] as FormData).get("eveningId")).toBe("42");
    // Absagen ist NICHT Freigeben — ein vertauschter Aufruf wäre der teuerste
    // Fehler dieser Zeile und sähe im Markup identisch aus.
    expect(freigebenActionMock).not.toHaveBeenCalled();
  });

  it("sagt nichts ab, wenn die Rückfrage abgebrochen wird", async () => {
    await mount(zone([abend({ eveningId: 42 })]));

    const dialog = await bestaetigeAbsage();
    await clickElement(knopf("Abbrechen", dialog));

    expect(absagenActionMock).not.toHaveBeenCalled();
  });

  it("sagt den Abend ab, dessen Menü geöffnet wurde", async () => {
    await mount(
      zone([abend({ eveningId: 11, datum: "2026-08-05" }), abend({ eveningId: 22, datum: "2026-08-19" })]),
    );

    const dialog = await bestaetigeAbsage(1);
    await clickElement(knopf("Absagen", dialog));

    expect((absagenActionMock.mock.calls[0][0] as FormData).get("eveningId")).toBe("22");
  });

  it("öffnet über denselben Weg die Zeilenbearbeitung, ohne etwas abzusagen", async () => {
    await mount(zone([abend({ eveningId: 42, datum: "2026-08-05", thema: "Funkübung" })]));

    await clickElement(await menuepunkt("Bearbeiten"));

    const form = document.querySelector<HTMLFormElement>("form[data-testid='abend-bearbeiten']");
    expect(form).not.toBeNull();
    expect(form!.querySelector<HTMLInputElement>("input[name='id']")!.value).toBe("42");
    expect(absagenActionMock).not.toHaveBeenCalled();
  });

  /**
   * EIN GEPLANTER ABEND HAT KEINE TEILNEHMERZAHL — und sie darf hier auch nicht
   * EINTRAGBAR sein.
   *
   * ⚠️ WAS OHNE DIESE ZUSICHERUNG STILL FALSCH WIRD: die Zeile reicht
   * `teilnehmer: null` durch, und das sieht nach „leer" aus — das Feld rendert
   * und sendet aber unabhaengig vom Wert. Wer an einem Abend, der erst in sechs
   * Wochen ist, eine Anwesenheit eintraegt, setzt damit den NENNER der
   * Ruecklaufquote im Voraus. Nach der Freigabe ist diese geratene Zahl von
   * einer gezaehlten nicht mehr zu unterscheiden, und die Quote darunter ist
   * falsch, ohne je eine Meldung zu erzeugen. „Nachtragbar, nie geraten" steht
   * unter dem Feld — im Voraus ist jede Zahl dort geraten.
   *
   * Die Gegenprobe, dass dasselbe Formular OHNE `geplant` das Feld sehr wohl
   * zeigt und mitschickt, steht bei der Zone, der es gehoert
   * (`Verlauf.test.tsx`, Block zur Zeilenbearbeitung). Hier waere sie nicht
   * herstellbar: `KommendeAbende` fuehrt ausschliesslich geplante Abende.
   */
  it("laesst im Bearbeiten-Dialog eines geplanten Abends die Teilnehmerzahl weg", async () => {
    await mount(zone([abend({ eveningId: 42, datum: "2026-08-05", thema: "Funkübung" })]));

    await clickElement(await menuepunkt("Bearbeiten"));

    const form = document.querySelector<HTMLFormElement>("form[data-testid='abend-bearbeiten']")!;
    expect(form.querySelector("input[name='participantCount']")).toBeNull();
    // Auch der Satz darunter darf nicht stehenbleiben: er erklaert ein Feld,
    // das es hier nicht gibt, und laese sich als „traegst du spaeter nach".
    expect(form.textContent ?? "").not.toContain("Der Nenner der Rücklaufquote");
    /*
     * Die drei Felder, die bleiben — ohne sie waere die Zusicherung oben auch
     * dann gruen, wenn der Dialog gar kein Formular mehr baute. Der Fall ist
     * nicht theoretisch: weggelassen wird das Feld ueber eine Bedingung im
     * Rumpf, und eine zu weit gezogene Bedingung naehme den Rest mit.
     */
    expect(form.querySelector("input[name='date']")).not.toBeNull();
    expect(form.querySelector("input[name='topic']")).not.toBeNull();
    expect(form.querySelector("input[name='notes']")).not.toBeNull();
  });
});

/*
 * „STEHT SCHON" IM PLANUNGSDIALOG IST KEIN SCHMUCK. `planEveningsAction` kommt
 * ohne Formularzustand aus, und `planEvenings` überspringt einen belegten Tag
 * still. Ohne den Hinweis schlösse sich der Dialog nach dem Klick, und es wäre
 * nichts passiert — das sieht aus wie ein Fehler der Anwendung.
 */
describe("KommendeAbende — der Planungsdialog", () => {
  const hinweis = () => document.querySelector("[data-testid='planen-steht-schon']");

  it("fragt nach genau einem Datum — kein Takt, kein Enddatum", async () => {
    const form = await planungOeffnen();

    // Der Start steht auf „heute" (§4.5).
    expect(form.querySelector<HTMLInputElement>("input[name='date']")!.value).toBe(HEUTE);
    expect(form.querySelector("input[name='topic']")).not.toBeNull();
    expect(form.querySelector("input[name='bis']")).toBeNull();
    expect(form.querySelector("input[name='rhythmus']")).toBeNull();
    expect(knopf("Abend eintragen").hasAttribute("disabled")).toBe(false);
  });

  it("sagt, wenn an dem Tag schon ein Abend steht, und sperrt das Absenden", async () => {
    const form = await planungOeffnen(["2026-08-08"]);
    expect(hinweis()).toBeNull();

    await tippe(form.querySelector<HTMLInputElement>("input[name='date']")!, "2026-08-08");

    expect(hinweis()!.textContent).toContain("08.08.2026");
    expect(hinweis()!.textContent).toContain("steht schon ein Abend");
    expect(knopf("Abend eintragen").hasAttribute("disabled")).toBe(true);
  });

  it("gibt den Knopf wieder frei, sobald ein freier Tag gewählt ist", async () => {
    const form = await planungOeffnen([HEUTE]);
    expect(knopf("Abend eintragen").hasAttribute("disabled")).toBe(true);

    await tippe(form.querySelector<HTMLInputElement>("input[name='date']")!, "2026-08-01");

    expect(hinweis()).toBeNull();
    expect(knopf("Abend eintragen").hasAttribute("disabled")).toBe(false);
  });

  it("schickt `groupId` mit", async () => {
    const form = await planungOeffnen();

    expect(form.querySelector<HTMLInputElement>("input[name='groupId']")!.value).toBe("7");
  });
});
