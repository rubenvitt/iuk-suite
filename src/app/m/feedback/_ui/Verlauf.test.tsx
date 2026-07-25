// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { act, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

/**
 * ZONE d — DER VERLAUF (Entwurf §2.5, §4.3, §4.11, §4.12).
 *
 * Der Verlauf ist die Stelle, an der ein Gruppenleiter vier Tage spaeter
 * zurueckkommt und die Auswertung sucht. Bisher standen dort nackte Links ohne
 * Status, ohne Ruecklauf und ohne Durchschnitt — man musste jeden Abend
 * anklicken, um zu erfahren, was drinsteht.
 *
 * SECHS ZUSAGEN, DIE STILL BRECHEN:
 *
 * 1. DIE ORDNUNG GEHOERT DER KOMPONENTE. Sie sortiert SELBST nach Datum
 *    absteigend und verlaesst sich nicht auf die DB-Ordnung — `listEvenings`
 *    traegt heute `ORDER BY date DESC`, aber ein spaeterer Filter oder ein
 *    zweiter Aufrufer haette die Reihenfolge lautlos gedreht.
 * 2. DIE PILLE ZEIGT `avgSchulnote`, NICHT `overallAvg` (§4.12). Das entscheidet
 *    die SEITE beim Bauen der Zeilen; hier wird bewacht, dass die Zeile den Wert
 *    ueberhaupt als Notenpille traegt (Ziffer, Wort, Farbe).
 * 3. KEIN ERFUNDENER NENNER. Ohne `participantCount` gibt es „14" und keinen
 *    Balken — nie „14 / 0" und nie einen Prozentwert.
 * 4. ROT IST HIER VERBOTEN (Farb-Klausel §4.9). `Progress` und `Tag` faerben in
 *    diesem Projekt mit `colorPrimary === colorError === #c8000f`; der
 *    Ruecklaufbalken ist deshalb eigenes Markup in `--fb-ink`.
 * 5. KEIN `useBreakpoint()` UND KEIN HORIZONTAL SCROLLENDES `Table` (§2.5):
 *    beide Darstellungen liegen im HTML, eine Medienabfrage schaltet. Ein
 *    `useBreakpoint()` liefert beim ersten Rendern auf dem Server ALLE Werte
 *    `false` und laesst die Zone einen Wimpernschlag leer.
 * 6. LEER IST EIN ZUSTAND, KEINE LEERE TABELLE (§4.3, wortgenau).
 */

const {
  activateSurveyActionMock,
  createEveningActionMock,
  deleteEveningActionMock,
  updateEveningActionMock,
} = vi.hoisted(() => ({
  activateSurveyActionMock: vi.fn(),
  createEveningActionMock: vi.fn(),
  deleteEveningActionMock: vi.fn(),
  updateEveningActionMock: vi.fn(),
}));

// Die Actions liegen hinter `"use server"` und ziehen Datenbank und `next/*`
// nach — hier interessiert nur, DASS die richtige mit dem richtigen Schluessel
// gerufen wird.
vi.mock("../actions", () => ({
  activateSurveyAction: activateSurveyActionMock,
  createEveningAction: createEveningActionMock,
  deleteEveningAction: deleteEveningActionMock,
  updateEveningAction: updateEveningActionMock,
}));

import { Verlauf, type VerlaufZeile } from "./Verlauf";
import { clickElement, mount, unmount } from "@/app/m/qr/_lib/test-dom";

/**
 * `submitForm` aus dem Harness sucht INNERHALB des gemounteten Wirts; der Dialog
 * haengt aber (antd `Modal`) in einem Portal an `document.body`. Deshalb dasselbe
 * Muster wie `clickElement`, nur fuer `submit` — am Formular selbst und nicht am
 * Knopf, damit der Test nicht an einem deaktivierten Knopf haengen bleibt.
 */
async function abschicken(form: HTMLFormElement): Promise<void> {
  await act(async () => {
    form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
  });
}

const UI = join(process.cwd(), "src/app/m/feedback/_ui");
const quelle = (datei: string) => readFileSync(join(UI, datei), "utf8");
const ohneKommentare = (text: string) =>
  text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");

const tag = (iso: string) => new Date(`${iso}T00:00:00Z`);

function zeile(
  // `Omit` vor dem Schnitt: `Partial<VerlaufZeile> & { datum?: string }` ergibt
  // `Date & string` und laesst sich mit keinem Wert mehr belegen.
  over: Omit<Partial<VerlaufZeile>, "datum"> & { datum?: Date | string } = {},
): VerlaufZeile {
  const datum = typeof over.datum === "string" ? tag(over.datum) : (over.datum ?? tag("2026-07-22"));
  return {
    eveningId: over.eveningId ?? 1,
    surveyId: over.surveyId === undefined ? 11 : over.surveyId,
    datum,
    thema: over.thema === undefined ? "Erste Hilfe Auffrischung" : over.thema,
    rueckmeldungen: over.rueckmeldungen ?? 14,
    teilnehmer: over.teilnehmer === undefined ? 18 : over.teilnehmer,
    avgSchulnote: over.avgSchulnote === undefined ? 2.4 : over.avgSchulnote,
    hasLegacyScale: over.hasLegacyScale ?? false,
    entwurf: over.entwurf ?? false,
  };
}

const zone = (zeilen: VerlaufZeile[]) => (
  <Verlauf groupId={7} zeilen={zeilen} heute="2026-07-25" />
);

function zeichne(zeilen: VerlaufZeile[]): HTMLElement {
  const wirt = document.createElement("div");
  wirt.innerHTML = renderToStaticMarkup(zone(zeilen) as ReactElement);
  return wirt;
}

/** Die Zeilen der breiten Darstellung — antds `Table` schreibt sie als `<tr>`. */
const tabellenzeilen = (wirt: HTMLElement): HTMLElement[] => [
  ...wirt.querySelectorAll<HTMLElement>(".fb-verlauf-breit tbody tr.ant-table-row"),
];

/** Die Bloecke der schmalen Darstellung (§2.5, 68px je Abend). */
const bloecke = (wirt: HTMLElement): HTMLElement[] => [
  ...wirt.querySelectorAll<HTMLElement>("[data-testid='verlauf-block']"),
];

afterEach(async () => {
  await unmount();
  activateSurveyActionMock.mockReset();
  createEveningActionMock.mockReset();
  deleteEveningActionMock.mockReset();
  updateEveningActionMock.mockReset();
});

describe("Verlauf — die Ordnung gehoert der Komponente (§2.5)", () => {
  const gemischt = [
    zeile({ eveningId: 2, datum: "2026-06-10", thema: "Juni" }),
    zeile({ eveningId: 4, datum: "2026-07-22", thema: "Juli" }),
    zeile({ eveningId: 1, datum: "2026-05-06", thema: "Mai" }),
    zeile({ eveningId: 3, datum: "2026-07-01", thema: "Anfang Juli" }),
  ];

  it("sortiert eine durcheinander gelieferte Liste selbst absteigend", () => {
    const wirt = zeichne(gemischt);
    const themen = tabellenzeilen(wirt).map((tr) => tr.textContent ?? "");

    expect(themen).toHaveLength(4);
    expect(themen[0]).toContain("Juli");
    expect(themen[1]).toContain("Anfang Juli");
    expect(themen[2]).toContain("Juni");
    expect(themen[3]).toContain("Mai");
  });

  it("sortiert die schmale Darstellung nach derselben Regel — nicht zwei Ordnungen", () => {
    const wirt = zeichne(gemischt);
    const themen = bloecke(wirt).map((b) => b.textContent ?? "");

    expect(themen).toHaveLength(4);
    expect(themen[0]).toContain("Juli");
    expect(themen[3]).toContain("Mai");
  });

  it("laesst die uebergebene Liste unberuehrt — sie gehoert der Seite", () => {
    const eingabe = [...gemischt];
    zeichne(eingabe);
    expect(eingabe.map((z) => z.eveningId)).toEqual(gemischt.map((z) => z.eveningId));
  });
});

describe("Verlauf — jede Zeile beantwortet „was war da“ (§2.5, §4.11)", () => {
  it("traegt Datum, Wochentag, Thema, Ruecklauf und die Notenpille", () => {
    const text = zeichne([zeile({ datum: "2026-07-22" })]).textContent ?? "";

    expect(text).toContain("22.07.2026");
    expect(text).toContain("Mittwoch");
    expect(text).toContain("Erste Hilfe Auffrischung");
    expect(text).toContain("14 / 18");
    // Ziffer UND Wort — Farbe ist die verzichtbare Schicht (§4.11). 2,4 rundet
    // auf Stufe 2, angezeigt wird der EXAKTE Wert (§4.11).
    expect(text).toContain("2,4");
    expect(text).toContain("gut");
  });

  it("faerbt die Pille aus der Stufe des Wertes — 2,4 ist Note 2", () => {
    const wirt = zeichne([zeile({ avgSchulnote: 2.4 })]);
    const pille = [...wirt.querySelectorAll<HTMLElement>('[role="img"]')].find((e) =>
      (e.getAttribute("aria-label") ?? "").startsWith("Durchschnitt"),
    );
    expect(pille).toBeDefined();
    expect(pille!.getAttribute("style")).toContain("var(--note-2)");
  });

  it("zeigt ohne Wert „—“ und KEINE Pille (§4.3)", () => {
    const wirt = zeichne([zeile({ avgSchulnote: null, rueckmeldungen: 0 })]);
    const pillen = [...wirt.querySelectorAll<HTMLElement>('[role="img"]')].filter((e) =>
      (e.getAttribute("aria-label") ?? "").startsWith("Durchschnitt"),
    );
    expect(pillen).toHaveLength(0);
    expect(wirt.textContent).toContain("—");
  });

  it("erfindet ohne Teilnehmerzahl keinen Nenner und keinen Balken", () => {
    const wirt = zeichne([zeile({ teilnehmer: null, rueckmeldungen: 14 })]);
    const text = wirt.textContent ?? "";

    expect(text).toContain("14");
    expect(text).not.toContain("14 / ");
    expect(text).not.toContain("%");
    expect(wirt.querySelectorAll("[data-testid='verlauf-balken']")).toHaveLength(0);
  });

  it("zeichnet den Ruecklaufbalken in `--fb-ink` — nie in DRK-Rot", () => {
    const wirt = zeichne([zeile({ rueckmeldungen: 9, teilnehmer: 18 })]);
    const balken = wirt.querySelector<HTMLElement>("[data-testid='verlauf-balken'] > *");

    expect(balken).not.toBeNull();
    expect(balken!.getAttribute("style")).toContain("var(--fb-ink)");
    // antds `Progress` waere `colorPrimary` — also #c8000f auf einer Datenflaeche.
    expect(wirt.querySelectorAll(".ant-progress")).toHaveLength(0);
  });

  it("schreibt ohne Thema „—“, nie „(ohne Thema)“", () => {
    const text = zeichne([zeile({ thema: null })]).textContent ?? "";
    expect(text).toContain("—");
    expect(text).not.toContain("(ohne Thema)");
  });

  it("haengt an Altbestands-Boegen die Fussnote aus §4.12 wortgenau", () => {
    const mit = zeichne([zeile({ hasLegacyScale: true })]).textContent ?? "";
    const ohne = zeichne([zeile({ hasLegacyScale: false })]).textContent ?? "";
    const satz = "enthält Altbestands-Fragen (Skala 1–5) — nicht in den Durchschnitt gerechnet";

    expect(mit).toContain(satz);
    expect(ohne).not.toContain(satz);
  });

  it("verlinkt jede Zeile MIT Umfrage auf die Auswertung — in beiden Darstellungen", () => {
    const wirt = zeichne([zeile({ eveningId: 42 })]);
    const ziele = [...wirt.querySelectorAll<HTMLAnchorElement>("a")].map((a) =>
      a.getAttribute("href"),
    );
    const auswertung = "/m/feedback/groups/7/evenings/42/auswertung";

    expect(ziele.filter((z) => z === auswertung).length).toBeGreaterThanOrEqual(2);
  });

  /*
   * Ein nachgetragener Abend (`createEveningAction` legt nie eine Umfrage an) hat
   * `surveyId === null`, und `.../auswertung` antwortet dafuer mit 404 („ohne
   * Umfrage nichts auszuwerten"). KEIN Anker der Zone darf dort landen — auch
   * nicht der, der in der Schmalvariante die ganze 68px-Flaeche ist.
   */
  it("schickt einen Abend ohne Umfrage NICHT in die Auswertung, sondern auf die Abendseite", () => {
    const wirt = zeichne([zeile({ eveningId: 42, surveyId: null })]);
    const ziele = [...wirt.querySelectorAll<HTMLAnchorElement>("a")].map((a) =>
      a.getAttribute("href"),
    );

    expect(ziele.length).toBeGreaterThan(0);
    expect(ziele.some((z) => z?.endsWith("/auswertung"))).toBe(false);
    expect(ziele).toContain("/m/feedback/groups/7/evenings/42");
    // Die Beschriftung wandert mit: kein Link „Auswertung" auf die Abendseite.
    // Nur die ZEILE geprueft, nicht die ganze Zone — sonst stolpert der Test
    // ueber die naechste Auswertungs-Schaltflaeche in der Kopfzeile.
    expect(tabellenzeilen(wirt)[0].textContent ?? "").not.toContain("Auswertung");
  });
});

describe("Verlauf — der Altbestands-Entwurf (§2.2 Belegung E, §2.5)", () => {
  const entwurf = zeile({ eveningId: 5, surveyId: 55, entwurf: true, avgSchulnote: null, rueckmeldungen: 0 });

  it("kennzeichnet ihn als `Tag` „Entwurf (Altbestand)“", () => {
    const wirt = zeichne([entwurf]);
    const etikett = wirt.querySelector(".ant-tag");

    expect(etikett).not.toBeNull();
    expect(etikett!.textContent).toBe("Entwurf (Altbestand)");
    // Ein Etikett, kein Alarm: randlos und ohne Farbe (Farb-Klausel §4.9).
    expect(etikett!.className).not.toMatch(/ant-tag-(red|error)/);
  });

  it("bietet „Jetzt starten“ — und nur dort", () => {
    const mit = zeichne([entwurf]).textContent ?? "";
    const ohne = zeichne([zeile({ entwurf: false })]).textContent ?? "";

    expect(mit).toContain("Jetzt starten");
    expect(ohne).not.toContain("Jetzt starten");
  });

  it("startet mit der SURVEY-Kennung, nicht mit der des Abends", async () => {
    await mount(zone([entwurf]));
    const starten = [...document.querySelectorAll<HTMLElement>("button")].find(
      (b) => (b.textContent ?? "").trim() === "Jetzt starten",
    );
    expect(starten).toBeDefined();

    await clickElement(starten!);
    // Die Bestaetigung liegt im Popconfirm (§4.6): starten wuerde eine laufende
    // Umfrage ersetzen.
    const bestaetigen = [...document.querySelectorAll<HTMLElement>(".ant-popconfirm button")].find(
      (b) => (b.textContent ?? "").trim() === "Starten",
    );
    expect(bestaetigen).toBeDefined();
    expect(activateSurveyActionMock).not.toHaveBeenCalled();

    await clickElement(bestaetigen!);
    expect(activateSurveyActionMock).toHaveBeenCalledTimes(1);
    const daten = activateSurveyActionMock.mock.calls[0][0] as FormData;
    expect(daten.get("id")).toBe("55");
  });
});

describe("Verlauf — die Kopfzeile (§2.5)", () => {
  const sechs = [2.4, 2.0, 2.2, 1.8, 2.1, 2.1].map((note, i) =>
    zeile({ eveningId: i + 1, datum: tag(`2026-0${i + 2}-05`), avgSchulnote: note }),
  );

  it("nennt den Kicker „VERLAUF“ und den Ø der letzten sechs Abende", () => {
    const text = zeichne(sechs).textContent ?? "";
    expect(text).toContain("VERLAUF");
    // Ø = 2,1 → Stufe 2 → „gut" (Schwellen aus `_lib/noten.ts`, keine zweite Rechnung).
    expect(text).toContain("Ø der letzten sechs Abende: 2,1 gut");
  });

  it("behauptet keine sechs, wenn es weniger sind", () => {
    const text = zeichne(sechs.slice(0, 2)).textContent ?? "";
    expect(text).toContain("Ø aus 2 Abenden:");
    expect(text).not.toContain("der letzten sechs");
  });

  it("laesst den Ø ganz weg, wenn kein Abend eine Schulnote traegt", () => {
    // Gemessen wird die KOPFZEILE — der Spaltenkopf „Ø Note (1 = beste)" steht
    // in der Tabelle und bleibt selbstverstaendlich stehen.
    const kopf = zeichne([zeile({ avgSchulnote: null })]).querySelector<HTMLElement>(
      "[data-testid='verlauf-kopf']",
    )!;
    expect(kopf.textContent).not.toContain("Ø");
  });

  it("zeigt den Notenfunken mit invertierter Y-Achse — Note 1 OBEN", () => {
    const wirt = zeichne(sechs);
    const funke = wirt.querySelector<SVGElement>("[data-testid='notenfunke'] polyline");
    expect(funke).not.toBeNull();

    // Der Funke laeuft chronologisch: aeltester Abend links. Die y-Werte muessen
    // fuer die BESSERE Note KLEINER sein (SVG waechst nach unten).
    const punkte = (funke!.getAttribute("points") ?? "")
      .trim()
      .split(/\s+/)
      .map((p) => Number(p.split(",")[1]));
    expect(punkte).toHaveLength(6);
    // Chronologisch (aeltester zuerst): 2,4 · 2,0 · 2,2 · 1,8 · 2,1 · 2,1.
    // 1,8 ist die beste Note der Reihe → KLEINSTER y-Wert (steht oben).
    expect(Math.min(...punkte)).toBe(punkte[3]);
    // 2,4 ist die schlechteste → groesster y-Wert (steht unten).
    expect(Math.max(...punkte)).toBe(punkte[0]);
  });

  it("traegt drei leise Textknoepfe: Trend, CSV, Abend nachtragen", () => {
    const wirt = zeichne(sechs);
    const kopf = wirt.querySelector<HTMLElement>("[data-testid='verlauf-kopf']")!;
    const beschriftungen = [...kopf.querySelectorAll<HTMLElement>("a, button")].map((e) =>
      (e.textContent ?? "").trim(),
    );

    expect(beschriftungen).toContain("Trend");
    expect(beschriftungen).toContain("CSV (alle Abende)");
    expect(beschriftungen).toContain("Abend ohne Feedback nachtragen");

    const ziele = [...kopf.querySelectorAll<HTMLAnchorElement>("a")].map((a) => a.getAttribute("href"));
    expect(ziele).toContain("/m/feedback/groups/7/trend");
    expect(ziele).toContain("/m/feedback/groups/7/export.csv");
    // Kein zweiter Primaerknopf auf der Seite (§2.6) — der gehoert der Lagekarte.
    expect(kopf.querySelectorAll(".ant-btn-primary")).toHaveLength(0);
  });

  it("legt einen nachgetragenen Abend ueber `createEveningAction` an", async () => {
    await mount(zone(sechs));
    const oeffnen = [...document.querySelectorAll<HTMLElement>("button")].find(
      (b) => (b.textContent ?? "").trim() === "Abend ohne Feedback nachtragen",
    );
    await clickElement(oeffnen!);

    const feld = document.querySelector<HTMLInputElement>("input[name='date']");
    expect(feld).not.toBeNull();
    // Vorbelegt mit HEUTE in `Europe/Berlin` — nie mit `toISOString()` (§4.5).
    expect(feld!.value).toBe("2026-07-25");

    const form = document.querySelector<HTMLFormElement>("form[data-testid='verlauf-nachtragen']");
    expect(form).not.toBeNull();
    expect(form!.querySelector<HTMLInputElement>("input[name='groupId']")!.value).toBe("7");

    /*
     * ABGESCHICKT, nicht nur angezeigt. Der Knopf waere sonst genau der Fall, der
     * schlimmer ist als ein fehlender Knopf: sichtbar, bedienbar, wirkungslos.
     * Der Riegel liegt an der Reihenfolge — die Karte darf sich erst schliessen,
     * NACHDEM die Action gelaufen ist, sonst wird das Formular (`destroyOnHidden`)
     * mitten im Absenden ausgebaut.
     */
    await abschicken(form!);
    expect(createEveningActionMock).toHaveBeenCalledTimes(1);
    const daten = createEveningActionMock.mock.calls[0][0] as FormData;
    expect(daten.get("groupId")).toBe("7");
    expect(daten.get("date")).toBe("2026-07-25");
  });
});

describe("Verlauf — Leerzustand (§4.3)", () => {
  it("sagt den Satz aus §4.3 wortgenau statt eine leere Tabelle zu zeigen", () => {
    const wirt = zeichne([]);
    expect(wirt.textContent).toContain("Noch keine vergangenen Dienstabende.");
    expect(tabellenzeilen(wirt)).toHaveLength(0);
    // Kein zweiter Startaufruf — der Knopf steht 24px darueber (§4.3).
    expect(wirt.textContent).not.toContain("Feedback starten");
  });

  it("zeigt ohne zwei Noten keinen Funken, sondern „—“ (§4.11)", () => {
    const wirt = zeichne([zeile({ avgSchulnote: 2.4 })]);
    expect(wirt.querySelectorAll("[data-testid='notenfunke']")).toHaveLength(0);
  });
});

describe("Verlauf — Quelltext-Zusagen, die im Markup nicht sichtbar sind", () => {
  const CODE = ohneKommentare(quelle("Verlauf.tsx"));

  it("benutzt KEIN `useBreakpoint()` — beide Darstellungen liegen im HTML (§2.5)", () => {
    expect(CODE).not.toContain("useBreakpoint");
    const wirt = zeichne([zeile({})]);
    expect(wirt.querySelectorAll(".fb-verlauf-breit")).toHaveLength(1);
    expect(wirt.querySelectorAll(".fb-verlauf-schmal")).toHaveLength(1);
  });

  it("laesst das `Table` nicht horizontal scrollen (§2.5)", () => {
    // `scroll={{ x: … }}` waere genau die Loesung, die der Entwurf ausschliesst.
    expect(CODE).not.toMatch(/scroll=\{\{\s*x/);
  });

  it("schaltet die beiden Darstellungen in `feedback.css` bei 768px", () => {
    const css = quelle("feedback.css");
    expect(css).toContain(".fb-verlauf-breit");
    expect(css).toContain(".fb-verlauf-schmal");
    expect(css).toMatch(/@media \(min-width: 768px\)/);
  });

  it("gliedert die Tabelle mit der Haarlinie des Moduls, nicht mit antds Vorgabe (§2.5)", () => {
    const css = quelle("feedback.css");
    expect(css).toContain("border-bottom-color: var(--fb-split)");
    expect(css).toContain("background: var(--fb-tint)");
    // Kein Zebra: antd streift nicht von sich aus, und hier wird keins erfunden.
    expect(CODE).not.toContain("rowClassName");
  });

  it("nennt `#c8000f` nicht und benutzt keine `--ant-*`-Variable (§4.9, §4.10)", () => {
    expect(CODE.toLowerCase()).not.toContain("#c8000f");
    expect(CODE).not.toMatch(/--ant-/);
    expect(CODE).not.toContain('danger');
  });

  it("formatiert Datum und Wochentag ueber `datum.ts`, nicht mit eigenem `toLocaleDateString`", () => {
    expect(CODE).not.toContain("toLocaleDateString");
    expect(CODE).not.toContain("toISOString");
  });
});

/**
 * DIE ZEILENBEARBEITUNG (§2.5 „Bearbeiten", §2.3/§2.4).
 *
 * `updateEveningAction` hatte keinen Aufrufer — die TEILNEHMERZAHL war damit
 * nicht nachtragbar, und genau sie ist der Nenner jeder Ruecklaufquote und wird
 * typischerweise erst am Abend selbst bekannt. Der Entwurf schickt sie und die
 * weggefallenen `notes` (§2.3) ausdruecklich hierher.
 *
 * Vorher zeigte der Menuepunkt auf die alte Detailseite, die nur die
 * Umfragesteuerung traegt und kein einziges Feld des Abends — ein Weg, der nach
 * „Bearbeiten" heisst und nichts bearbeiten kann.
 */
describe("Verlauf — Abend bearbeiten (§2.5)", () => {
  /** Der „…"-Knopf der ersten Zeile; die schmale Darstellung liegt mit im DOM. */
  async function menueOeffnen(): Promise<void> {
    const punkte = [...document.querySelectorAll<HTMLElement>("button")].filter(
      (b) => (b.textContent ?? "").trim() === "…",
    );
    if (punkte.length === 0) throw new Error("Kein Aktionsmenue in der Zeile");
    await clickElement(punkte[0]);
  }

  async function bearbeitenWaehlen(): Promise<HTMLFormElement> {
    const eintrag = [...document.querySelectorAll<HTMLElement>(".ant-dropdown-menu-item")].find(
      (e) => (e.textContent ?? "").trim() === "Bearbeiten",
    );
    if (!eintrag) throw new Error("Kein Menuepunkt „Bearbeiten“");
    await clickElement(eintrag);
    const form = document.querySelector<HTMLFormElement>("form[data-testid='verlauf-bearbeiten']");
    if (!form) throw new Error("Kein Bearbeiten-Formular");
    return form;
  }

  const einer = [
    zeile({ eveningId: 42, datum: "2026-07-22", thema: "Funkübung", teilnehmer: null }),
  ];

  it("oeffnet einen Dialog mit den Feldern des Abends statt zu navigieren", async () => {
    await mount(zone(einer));
    await menueOeffnen();
    const form = await bearbeitenWaehlen();

    expect(form.querySelector<HTMLInputElement>("input[name='id']")!.value).toBe("42");
    expect(form.querySelector<HTMLInputElement>("input[name='date']")!.value).toBe("2026-07-22");
    expect(form.querySelector<HTMLInputElement>("input[name='topic']")!.value).toBe("Funkübung");
    // Der Nenner ist leer und damit nachtragbar — nie erfunden (§2.3).
    expect(form.querySelector<HTMLInputElement>("input[name='participantCount']")!.value).toBe("");
    // `notes` ist in §2.3 aus dem Startformular gefallen und NUR hier erreichbar.
    expect(form.querySelector("[name='notes']")).not.toBeNull();
  });

  it("schickt die nachgetragene Teilnehmerzahl an updateEveningAction", async () => {
    await mount(zone(einer));
    await menueOeffnen();
    const form = await bearbeitenWaehlen();

    const feld = form.querySelector<HTMLInputElement>("input[name='participantCount']")!;
    const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(feld), "value")!.set!;
    await act(async () => {
      setter.call(feld, "18");
      feld.dispatchEvent(new Event("input", { bubbles: true }));
    });

    await abschicken(form);

    expect(updateEveningActionMock).toHaveBeenCalledTimes(1);
    const daten = updateEveningActionMock.mock.calls[0][0] as FormData;
    expect(daten.get("id")).toBe("42");
    expect(daten.get("participantCount")).toBe("18");
    // Das Datum faehrt mit: aendert es sich, ankert die Action `closesAt` neu.
    expect(daten.get("date")).toBe("2026-07-22");
  });

  it("nennt die Folge einer Datumsaenderung, damit die Frist keine Ueberraschung ist", async () => {
    await mount(zone(einer));
    await menueOeffnen();
    const form = await bearbeitenWaehlen();

    expect(form.textContent).toContain(
      "Ein anderes Datum verschiebt die Frist einer laufenden Umfrage mit.",
    );
  });
});
