// @vitest-environment jsdom

import { act } from "react";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import {
  clickElement,
  fill,
  mount,
  query,
  queryAll,
  unmount,
} from "@/app/m/qr/_lib/test-dom";
import s from "../../../_ui/verwaltung.module.css";
import {
  OrtVerfallTabelle,
  sucheTrifft,
  type OrtVerfallZeile,
} from "./OrtVerfallTabelle";

/**
 * DER RAHMEN UM DIE BREITE DARSTELLUNG (DRK-451).
 *
 * ⚠️ SEIT DIESE TABELLE EINE `Kartentabelle` IST, STEHT JEDE ZEILE ZWEIMAL IM
 * BAUM — einmal als Tabellenzeile, einmal als Karte. Beide tragen dieselben
 * Marken, und das ist richtig: `display: none` nimmt die verborgene aus dem
 * Zugaenglichkeitsbaum, ein Greifer ueber das DOM sieht sie trotzdem. jsdom
 * wertet die Media Query gar nicht aus, dort sind also BEIDE „da".
 *
 * ⚠️ OHNE DIESEN RAHMEN MISST EIN FALL DIE DOPPELTE MENGE, und die Meldung
 * fuehrt in die Irre: „erwartet 2, bekommen 4" liest sich wie ein doppelt
 * gerenderter Lesepfad, nicht wie zwei Darstellungen derselben Zeile.
 *
 * ⚠️ `tbody`- UND `thead`-GREIFER BRAUCHEN IHN NICHT — eine Karte hat weder das
 * eine noch das andere. Eingerahmt wird nur, was ohne sie greift.
 */
const BREIT = '[data-rolle="breitansicht"]';


/**
 * DREI FAHRZEUGE, DAMIT DER FAHRZEUGFILTER ETWAS ZU TRENNEN HAT — und „RTW
 * Nord" zweimal, weil genau das der Fall ist, den die Karte vorher nicht
 * zeigen konnte: mehrere Meldungen desselben Fahrzeugs standen ueber die Liste
 * verstreut.
 *
 * Einfuegereihenfolge GEGEN die Sollreihenfolge des Lesepfads (abgelaufen
 * zuerst) — sonst faellt eine fehlende Ordnung nicht auf.
 */
const ZEILEN: OrtVerfallZeile[] = [
  {
    schluessel: "f2:a1",
    ortId: "f2",
    ortName: "RTW Süd",
    ortKennung: "UE-RK 5678",
    ortTyp: "fahrzeug" as const,
    ortEinheitenart: "fahrzeug" as const,
    artikelName: "NaCl",
    verfall: "2026-09",
    verfallText: "09/26",
    statusTon: "gelb",
    statusText: "läuft ab",
    abgelaufen: false,
    gemeldetText: "01.06.2026",
  },
  {
    schluessel: "f1:a2",
    ortId: "f1",
    ortName: "RTW Nord",
    ortKennung: "UE-RK 1234",
    ortTyp: "fahrzeug" as const,
    ortEinheitenart: "fahrzeug" as const,
    artikelName: "Verband",
    verfall: "2026-05",
    verfallText: "05/26",
    statusTon: "rot",
    statusText: "abgelaufen",
    abgelaufen: true,
    gemeldetText: "02.06.2026",
  },
  {
    schluessel: "f1:a3",
    ortId: "f1",
    ortName: "RTW Nord",
    ortKennung: "UE-RK 1234",
    ortTyp: "fahrzeug" as const,
    ortEinheitenart: "fahrzeug" as const,
    artikelName: "Rettungsdecke",
    verfall: "2026-08",
    verfallText: "08/26",
    statusTon: "gelb",
    statusText: "läuft ab",
    abgelaufen: false,
    gemeldetText: "03.06.2026",
  },
];

const getComputedStyleOhnePseudo = window.getComputedStyle.bind(window);

/**
 * antd fragt `getComputedStyle` mit Pseudo-Element ab; jsdom kennt das nicht
 * und schreibt je Aufruf eine „Not implemented"-Zeile ins Protokoll. Der Spy
 * reicht die Anfrage ohne Pseudo-Argument durch — gleiche Stelle, gleicher
 * Grund wie in `FahrzeugeListe.test.tsx`.
 */
beforeAll(() => {
  vi.spyOn(window, "getComputedStyle").mockImplementation((element) =>
    getComputedStyleOhnePseudo(element),
  );
});

afterEach(async () => {
  await unmount();
});

afterAll(() => vi.restoreAllMocks());

async function warte(): Promise<void> {
  await act(async () => {
    await new Promise((fertig) => setTimeout(fertig, 0));
  });
}

async function warteAuf(pruefen: () => boolean, beschreibung: string): Promise<void> {
  for (let versuch = 0; versuch < 30; versuch += 1) {
    if (pruefen()) return;
    await warte();
  }
  throw new Error(`Nicht rechtzeitig sichtbar: ${beschreibung}`);
}

/** Wie in `FahrzeugeListe.test.tsx`: der Weg, den auch eine Person nimmt. */
async function spaltenFilter(spalte: string, ...eintraege: string[]): Promise<void> {
  const kopf = queryAll<HTMLElement>("thead th")
    .find((th) => (th.textContent ?? "").includes(spalte));
  const trichter = kopf?.querySelector<HTMLElement>(".ant-table-filter-trigger");
  if (!trichter) throw new Error(`Kein Spaltenfilter an: ${spalte}`);
  await clickElement(trichter);

  const offen = () =>
    document.body.querySelector<HTMLElement>(
      ".ant-dropdown:not(.ant-dropdown-hidden) .ant-table-filter-dropdown",
    );
  const menue = () => Array.from(offen()?.querySelectorAll<HTMLElement>("li") ?? []);
  await warteAuf(() => menue().length > 0, `Filtermenü zu ${spalte}`);

  for (const text of eintraege) {
    const eintrag = menue().find((li) => (li.textContent ?? "").includes(text));
    if (!eintrag) throw new Error(`Filtereintrag nicht gefunden: ${text}`);
    await clickElement(eintrag);
  }

  const knopf = (muster: RegExp) => Array.from(
    offen()?.querySelectorAll<HTMLButtonElement>("button") ?? [],
  ).find((element) => muster.test(element.textContent ?? ""));

  if (eintraege.length === 0) {
    const leeren = knopf(/Zurücksetzen|Reset/);
    if (!leeren) throw new Error("Kein Zurücksetzen-Knopf im Filtermenü");
    await clickElement(leeren);
  }
  const uebernehmen = knopf(/^OK$/);
  if (!uebernehmen) throw new Error("Kein OK-Knopf im Filtermenü");
  await clickElement(uebernehmen);
  await warte();
}

/**
 * ⚠️ `[data-row-key]` UND NICHT `tbody tr` (Falle 14). Ab
 * `VIRTUELL_AB_ZEILEN` rendert rc-table Zeilen als `div` ohne `role="row"`;
 * ein Greifer ueber `tbody tr` findet dann nichts mehr — und zwar erst dann,
 * was ihn in einer kleinen Fixture wie dieser gruen laesst.
 */
function zeilenSchluessel(): Array<string | null> {
  return queryAll(`${BREIT} [data-row-key]`).map((zeile) => zeile.getAttribute("data-row-key"));
}

async function suchen(wert: string): Promise<void> {
  await fill("input[type='search']", wert);
  await act(async () => {
    await new Promise((fertig) => setTimeout(fertig, 250));
  });
}

describe("OrtVerfallTabelle — Spalten", () => {
  it("macht Artikel, Ablaufdatum und Fahrzeug erkennbar", async () => {
    await mount(<OrtVerfallTabelle zeilen={ZEILEN} />);

    // Die drei Angaben aus Akzeptanzkriterium 2, plus Status und Meldedatum.
    // DRK-309: „Einheit" statt „Fahrzeug" — die Tabelle führt beide Arten.
    // DRK-377: „Ort", weil sie seither auch die Entnahmebox führt, und die ist
    // keine Einheit, sondern ein Lager.
    expect(queryAll("thead th").map((spalte) => spalte.textContent)).toEqual([
      "Ort",
      "Artikel",
      "Verfall",
      "Status",
      "Gemeldet",
    ]);
    expect(query("table").getAttribute("aria-label")).toBe("Gemeldete Verfälle");

    const zeile = query(`${BREIT} [data-row-key='f1:a2']`);
    expect(zeile.textContent).toContain("RTW Nord");
    expect(zeile.textContent).toContain("UE-RK 1234");
    expect(zeile.textContent).toContain("Verband");
    expect(zeile.textContent).toContain("05/26");
    expect(zeile.textContent).toContain("02.06.2026");
  });

  it("verlinkt das Fahrzeug auf sein Blatt", async () => {
    await mount(<OrtVerfallTabelle zeilen={ZEILEN} />);

    expect(query(`${BREIT} [data-row-key='f1:a2'] a`).getAttribute("href"))
      .toBe("/verwaltung/fahrzeuge/f1");
  });

  /*
   * ── DIE ENTNAHMEBOX IN DIESER TABELLE (DRK-377) ──────────────────────────
   *
   * Seit die Kompensationszeile nicht mehr ans Soll gebunden ist, traegt auch
   * die Entnahmebox gemeldete Verfaelle — und sie ist keine Einheit, sondern
   * ein LAGER. Beide Zusicherungen hier waeren ohne `ortTyp` still falsch, und
   * zwar auf verschiedene Weise: die eine liest sich als Datenfehler, die
   * andere ist ein toter Link.
   */
  const BOX_ZEILE: OrtVerfallZeile = {
    schluessel: "entnahmebox:a1",
    ortId: "entnahmebox",
    ortName: "Entnahmebox",
    ortKennung: null,
    ortTyp: "lager",
    ortEinheitenart: null,
    artikelName: "Kühlkompresse",
    verfall: "2026-05",
    verfallText: "05/26",
    statusTon: "rot",
    statusText: "abgelaufen",
    abgelaufen: true,
    gemeldetText: "01.06.2026",
  };

  it("nennt die Entnahmebox ein Lager — nicht „nicht zugeordnet“", async () => {
    // ⚠️ `einheitenartLabel(null)` ergaebe „nicht zugeordnet" — richtig als
    // Zwischenstand einer EINHEIT, an einem Lager aber eine Behauptung ueber
    // eine Zuordnung, die jemand vergessen haben soll. Die Box stuende damit
    // auf einer To-do-Liste, die es nicht gibt.
    await mount(<OrtVerfallTabelle zeilen={[BOX_ZEILE]} />);

    const zeile = query(`${BREIT} [data-row-key='entnahmebox:a1']`);
    expect(zeile.textContent).toContain("Lager");
    expect(zeile.textContent).not.toContain("nicht zugeordnet");
  });

  it("verlinkt die Entnahmebox auf ihre Seite, nicht auf ein Fahrzeugblatt", async () => {
    // ⚠️ `/verwaltung/fahrzeuge/entnahmebox` ergaebe ein 404 — ein toter Link
    // in genau der Zeile, die jemanden zum Aufraeumen schicken soll.
    await mount(<OrtVerfallTabelle zeilen={[BOX_ZEILE]} />);

    expect(query(`${BREIT} [data-row-key='entnahmebox:a1'] a`).getAttribute("href"))
      .toBe("/verwaltung/entnahmebox");
  });

  /**
   * ⚠️ ROT FUER ABGELAUFEN, GELB FUER WARNEND — und der Ton kommt FERTIG aus
   * der Server Component. Die Ampel entscheidet der Server (`ampelTon`), die
   * Client-Insel stellt sie nur dar; ein `Ampel`-Wert aus einem Modul mit
   * "use client" kaeme in der Server Component als Client-Referenz an
   * (Falle 6).
   */
  it("zeigt den Status als Chip im gelieferten Ton", async () => {
    await mount(<OrtVerfallTabelle zeilen={ZEILEN} />);

    expect(query(`${BREIT} [data-row-key='f1:a2'] .${s.rot}`).textContent).toContain("abgelaufen");
    expect(query(`${BREIT} [data-row-key='f2:a1'] .${s.gelb}`).textContent).toContain("läuft ab");
  });

  /**
   * ⚠️ SORTIERT WIRD UEBER "YYYY-MM", NICHT UEBER "MM/YYYY".
   * Als Anzeigetext stuende „05/2026" VOR „08/2026", aber auch „01/2027" vor
   * „05/2026" — die Ordnung waere still falsch, sobald ein Jahreswechsel in der
   * Liste liegt.
   */
  it("sortiert Verfall chronologisch, nicht über den Anzeigetext", async () => {
    await mount(<OrtVerfallTabelle zeilen={ZEILEN} />);

    const kopf = queryAll<HTMLElement>("thead th")
      .find((th) => (th.textContent ?? "").includes("Verfall"))!;
    await clickElement(kopf.querySelector<HTMLElement>(".ant-table-column-sorters")!);
    expect(zeilenSchluessel()).toEqual(["f1:a2", "f1:a3", "f2:a1"]);
  });
});

describe("OrtVerfallTabelle — nach Fahrzeug gruppieren", () => {
  async function umschalten(auf: string): Promise<void> {
    const knopf = queryAll<HTMLElement>(".ant-segmented-item")
      .find((element) => (element.textContent ?? "").includes(auf));
    if (!knopf) throw new Error(`Kein Umschalter-Eintrag: ${auf}`);
    await clickElement(knopf);
  }

  /**
   * ⚠️ DER VORGABEZUSTAND IST DIE FLACHE LISTE. Fuer alle, die nichts
   * anklicken, aendert sich dadurch nichts — und genau darauf beruht die
   * Entscheidung, den Umschalter NICHT in der URL zu fuehren.
   */
  it("startet flach und zeigt erst auf Wunsch die Fahrzeugzeilen", async () => {
    await mount(<OrtVerfallTabelle zeilen={ZEILEN} />);
    // ⚠️ `document.querySelector` und NICHT `query` — der Helfer WIRFT, wenn er
    // nichts findet, und taugt deshalb nicht fuer eine Abwesenheitsprobe.
    expect(document.querySelector("[data-row-key='fzg:f1']")).toBeNull();

    await umschalten("nach Ort");
    expect(query(`${BREIT} [data-row-key='fzg:f1']`)).toBeTruthy();
  });

  /**
   * ⚠️ DIE KINDZEILEN MUESSEN WIRKLICH DA SEIN. `defaultExpandAllRows` sah aus,
   * als taete es das, und wird nur beim ERSTEN Rendern ausgewertet — im echten
   * Abruf stand die Fahrzeugzeile da und ihre Meldung fehlte im DOM. Ohne
   * diese Probe war die Gruppierung eine Liste von Ueberschriften.
   */
  it("klappt die Meldungen von sich aus auf", async () => {
    await mount(<OrtVerfallTabelle zeilen={ZEILEN} />);
    await umschalten("nach Ort");

    expect(document.querySelector("[data-row-key='f1:a2']")).toBeTruthy();
    expect(document.querySelector("[data-row-key='f1:a3']")).toBeTruthy();
  });

  it("trägt auf der Fahrzeugzeile Name, Kennung und Bilanz", async () => {
    await mount(<OrtVerfallTabelle zeilen={ZEILEN} />);
    await umschalten("nach Ort");

    const kopf = query(`${BREIT} [data-row-key='fzg:f1']`);
    expect(kopf.textContent).toContain("RTW Nord");
    expect(kopf.textContent).toContain("UE-RK 1234");
    expect(kopf.querySelector(`.${s.rot}`)!.textContent).toContain("1 abgelaufen");
    expect(kopf.querySelector(`.${s.gelb}`)!.textContent).toContain("1 läuft ab");
  });

  /**
   * ⚠️ DIE SUCHE WIRKT IN BEIDEN DARSTELLUNGEN GLEICH, weil gefaltet wird,
   * NACHDEM gefiltert wurde. Ein Fahrzeug, dessen Meldungen alle weggefiltert
   * sind, entsteht gar nicht erst — es bleibt nicht als leere Elternzeile
   * stehen, die behauptet, es gaebe dort etwas.
   */
  it("lässt ein leer gefiltertes Fahrzeug gar nicht erst entstehen", async () => {
    await mount(<OrtVerfallTabelle zeilen={ZEILEN} />);
    await umschalten("nach Ort");
    expect(document.querySelector("[data-row-key='fzg:f2']")).toBeTruthy();

    await suchen("Nord");
    expect(document.querySelector("[data-row-key='fzg:f2']")).toBeNull();
    expect(document.querySelector("[data-row-key='fzg:f1']")).toBeTruthy();
  });

  /** Derselbe Beweis für den Spaltenfilter — er läuft über einen anderen Weg. */
  it("faltet erst nach dem Spaltenfilter", async () => {
    await mount(<OrtVerfallTabelle zeilen={ZEILEN} />);
    await umschalten("nach Ort");

    await spaltenFilter("Status", "abgelaufen");
    // Nur f1 hat eine abgelaufene Meldung.
    expect(document.querySelector("[data-row-key='fzg:f2']")).toBeNull();
    expect(query(`${BREIT} [data-row-key='fzg:f1']`).querySelector(`.${s.gelb}`)).toBeNull();
  });
});

describe("OrtVerfallTabelle — nach Fahrzeug filtern", () => {
  /**
   * AKZEPTANZKRITERIUM 1. Vorher war das gar nicht moeglich: die Karte zeigte
   * eine flache Aufzaehlung, in der die Meldungen eines Fahrzeugs ueber die
   * ganze Liste verstreut standen.
   */
  it("filtert über den Spaltenkopf auf ein Fahrzeug", async () => {
    await mount(<OrtVerfallTabelle zeilen={ZEILEN} />);

    await spaltenFilter("Ort", "RTW Nord");
    expect(zeilenSchluessel()).toEqual(["f1:a2", "f1:a3"]);
  });

  /**
   * ⚠️ GEFILTERT WIRD UEBER DIE IDENTITAET, NICHT UEBER DEN NAMEN
   * (Reviewbefund zu DRK-298). `lagerorte.name` traegt keinen Unique-Index und
   * `createFahrzeug` prueft nichts — zwei „MTW" sind erlaubt. Ueber den Namen
   * gefiltert stuenden hier BEIDE Fahrzeuge, und das gemeinte liesse sich ueber
   * diese Spalte gar nicht isolieren; sie verfehlte damit genau ihren Zweck.
   *
   * Die Kennung steht deshalb auch in der Beschriftung — sonst waeren die
   * beiden Eintraege im Menue nicht auseinanderzuhalten.
   *
   * ⚠️ UND SEIT DRK-309 (Reviewrunde 7) STEHT DIE ART DANEBEN, NICHT STATT
   * IHRER. Vorher hiess die Regel „Kennung, sonst Art"; das setzte voraus, dass
   * nur Fahrzeuge eine Kennung tragen, und `createFahrzeug` sagt das nicht zu.
   * Eine Tasche MIT Kennung war damit von einem Fahrzeug nicht zu
   * unterscheiden — der Fehler sass ausgerechnet in der Zeile, die ihn beheben
   * sollte.
   */
  it("trennt zwei gleichnamige Fahrzeuge", async () => {
    await mount(
      <OrtVerfallTabelle
        zeilen={[
          { ...ZEILEN[1], schluessel: "mtw-a:a1", ortId: "mtw-a",
            ortName: "MTW", ortKennung: "UE-RK 1" },
          { ...ZEILEN[1], schluessel: "mtw-b:a1", ortId: "mtw-b",
            ortName: "MTW", ortKennung: "UE-RK 2" },
        ]}
      />,
    );

    await spaltenFilter("Ort", "MTW · Fahrzeug · UE-RK 2");
    expect(zeilenSchluessel()).toEqual(["mtw-b:a1"]);
  });

  /**
   * ⚠️ AUCH OHNE KENNUNG MUESSEN DIE EINTRAEGE UNTERSCHEIDBAR BLEIBEN (zweiter
   * Reviewbefund zu DRK-298). Gleicher Name UND keine Kennung ist erlaubt —
   * das Schema verlangt weder das eine noch das andere. Stuenden dann zwei
   * identisch beschriftete Eintraege im Menue, filterte ein Klick zwar korrekt
   * auf EIN Fahrzeug, aber der Benutzer erfaehrt nicht, auf welches: er liest
   * die Meldungen des einen in dem Glauben, die des anderen zu sehen.
   *
   * Die Kennung waere die schoenere Unterscheidung; wo es keine gibt, bleibt
   * die ID. Haesslich, aber nur in genau diesem Fall — und ehrlicher als zwei
   * gleiche Zeilen.
   */
  it("unterscheidet gleichnamige Fahrzeuge auch ohne Kennung", async () => {
    await mount(
      <OrtVerfallTabelle
        zeilen={[
          { ...ZEILEN[1], schluessel: "mtw-a:a1", ortId: "mtw-a",
            ortName: "MTW", ortKennung: null },
          { ...ZEILEN[1], schluessel: "mtw-b:a1", ortId: "mtw-b",
            ortName: "MTW", ortKennung: null },
        ]}
      />,
    );

    // DRK-309: Ohne Kennung traegt die Beschriftung die ART — zwei gleich
    // benannte Einheiten sind damit erst dann noch gleich, wenn auch die Art
    // uebereinstimmt, und erst DANN haengt die Liste die ID an.
    await spaltenFilter("Ort", "MTW · Fahrzeug · mtw-b");
    expect(zeilenSchluessel()).toEqual(["mtw-b:a1"]);
  });

  /**
   * DRK-309, Reviewrunde 7 — EINE TASCHE MIT KENNUNG.
   *
   * ⚠️ DER FALL, DEN DIE ALTE REGEL VERSCHLUCKT HAT. „Kennung, sonst Art"
   * zeigte fuer diese Zeile nur Name und Kennung — also genau das, was auch
   * ein Fahrzeug zeigt. Dass `createFahrzeug` einer Tasche eine Kennung
   * erlaubt, macht den Fall nicht exotisch: eine Sanitaetstasche traegt oft
   * eine Inventarnummer.
   */
  it("nennt bei einer Tasche MIT Kennung beides — Art und Kennung", async () => {
    await mount(
      <OrtVerfallTabelle
        zeilen={[
          { ...ZEILEN[1], schluessel: "tasche:a1", ortId: "tasche-1",
            ortName: "Rucksack Betreuung", ortKennung: "INV-77",
            ortEinheitenart: "tasche" as const },
        ]}
      />,
    );

    const zeile = query("tbody tr[data-row-key]");
    expect(zeile.textContent).toContain("Tasche");
    expect(zeile.textContent).toContain("INV-77");
    // Und sie wird NICHT als Fahrzeug gefuehrt — das war der Befund.
    expect(zeile.textContent).not.toContain("Fahrzeug");
  });

  /** Gegenprobe: ein eindeutiger Name bekommt keine ID angehaengt. */
  it("hängt einem eindeutigen Fahrzeugnamen keine ID an", async () => {
    await mount(<OrtVerfallTabelle zeilen={ZEILEN} />);

    await spaltenFilter("Ort", "RTW Süd · Fahrzeug · UE-RK 5678");
    expect(zeilenSchluessel()).toEqual(["f2:a1"]);
  });

  it("trennt abgelaufen von bald ablaufend", async () => {
    await mount(<OrtVerfallTabelle zeilen={ZEILEN} />);

    await spaltenFilter("Status", "abgelaufen");
    expect(zeilenSchluessel()).toEqual(["f1:a2"]);

    await spaltenFilter("Status");
    await spaltenFilter("Status", "läuft ab");
    expect(zeilenSchluessel()).toEqual(["f2:a1", "f1:a3"]);
  });

  it("sucht über Fahrzeug, Kennung und Artikel", () => {
    expect(sucheTrifft(ZEILEN[1], "rtw nord")).toBe(true);
    expect(sucheTrifft(ZEILEN[1], "UE-RK 1234")).toBe(true);
    expect(sucheTrifft(ZEILEN[1], "verband")).toBe(true);
    expect(sucheTrifft(ZEILEN[1], "NaCl")).toBe(false);
  });

  /**
   * ⚠️ DIE TREFFERANZEIGE FOLGT DEM ZUSTAND, NICHT DER TABELLE (Falle 15).
   * `onChange` feuert nur bei Bedienung DER TABELLE — tippt jemand daneben in
   * die Suche, filtert antd neu, meldet es aber nicht. Wer sich die LISTE aus
   * `extra.currentDataSource` merkt, zeigt nach der naechsten Eingabe eine
   * Zahl von vorhin.
   */
  it("zählt nach Suche UND Spaltenfilter", async () => {
    await mount(<OrtVerfallTabelle zeilen={ZEILEN} />);

    await spaltenFilter("Status", "läuft ab");
    await suchen("Nord");
    expect(zeilenSchluessel()).toEqual(["f1:a3"]);
    expect(query("[data-testid='trefferanzeige']").textContent).toBe("1 von 3");
  });

  it("nennt bei leerem Filter den Filter-Leertext", async () => {
    await mount(<OrtVerfallTabelle zeilen={ZEILEN} />);

    await suchen("gibtesnicht");
    expect(zeilenSchluessel()).toEqual([]);
    expect(query("tr.ant-table-placeholder").textContent)
      .toBe("Keine Meldung passt zu Suche und Filter.");
  });
});
