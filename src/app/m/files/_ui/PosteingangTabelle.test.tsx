// @vitest-environment jsdom
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { act } from "react";

/**
 * DIE POSTEINGANG-TABELLE (Spec §8.6, §10.1; Plan T43).
 *
 * WAS DIESE DATEI BESITZT — die sieben Punkte des Tasks, aufgeteilt auf die
 * Ebenen, die die jeweilige Aussage ueberhaupt tragen koennen:
 *
 *  - DOM (jsdom, Harness aus `qr/_lib/test-dom.tsx`, KEIN zweites erfunden):
 *    die acht Spalten und die Sortierung (1), die vier Filter samt roher
 *    Anzeige einer unbekannten Kategorie (2), „Altbestand" (3), die
 *    AV-Zustaende mit Symbol UND Text (4), der Leerzustand mit Verweis (5),
 *    Loeschen mit Bestaetigung und Groesze sowie die Mehrfachauswahl fuer
 *    Loeschen und ZIP (6), `size="small"` nur in Tabellenzeilen (7).
 *  - QUELLTEXT-SCAN ueber `posteingang.module.css` und ueber die Komponente:
 *    die Umschaltung unter 767.98px und `scroll={{ x: "max-content" }}` (7).
 *    jsdom wertet Medienabfragen NICHT aus — ein DOM-Test, der „bei 390px steht
 *    die Kartenliste" behauptet, geht IMMER durch und misst nichts
 *    (`docs/design/README.md:199-206`). Was hier wirkt, weiss nur ein Browser;
 *    das besitzt `e2e/files-mobil.spec.ts` (T48).
 *
 * WARUM DIE FILTER HIER GEPRUEFT WERDEN UND NICHT AUF DER SEITE: sie sind
 * Zustand der Insel und laufen ueber Zeilen, die FERTIG hereinkommen. Ein
 * serverseitiger Filter ueber `searchParams` waere ein Rundlauf je Klick und
 * haette seine Zusage in einer Datei, die dieser Task nicht besitzt.
 */

// ---------------------------------------------------------------------------
// Mocks — vor jedem Import des Codes unter Test
// ---------------------------------------------------------------------------

const { useActionStateMock, loeschenMock, wiederholenMock } = vi.hoisted(() => ({
  useActionStateMock: vi.fn(),
  loeschenMock: vi.fn(),
  wiederholenMock: vi.fn(),
}));

vi.mock("react", async (echt) => {
  const react = await echt<typeof import("react")>();
  return { ...react, useActionState: useActionStateMock };
});

vi.mock("../(verwaltung)/posteingang/actions", () => ({
  inboxLoeschenAction: loeschenMock,
}));

/*
 * OHNE DIESEN MOCK ZOEGE DER JSDOM-LAUF DIE ECHTE ACTION-DATEI HEREIN — und mit
 * ihr `better-sqlite3`, `next/cache`, `bcryptjs` und ueber `_lib/av` auch
 * `node:net`. Dieselbe Vorsichtsmassnahme wie in `shares/[id]/page.test.tsx`.
 */
vi.mock("../(verwaltung)/actions", () => ({
  avWiederholenAction: wiederholenMock,
}));

import { PosteingangTabelle, type PosteingangZeile } from "./PosteingangTabelle";
import styles from "./posteingang.module.css";
import { SCHREIBBARE_KATEGORIEN } from "../_lib/kategorien";
import { AV_STATUS } from "../_lib/av";
import {
  click,
  clickElement,
  exists,
  mount,
  query,
  queryAll,
  unmount,
} from "@/app/m/qr/_lib/test-dom";

const CSS_PFAD = "src/app/m/files/_ui/posteingang.module.css";
const KOMPONENTE_PFAD = "src/app/m/files/_ui/PosteingangTabelle.tsx";
const ohneKommentare = (quelle: string) => quelle.replace(/\/\*[\s\S]*?\*\//g, "");

/**
 * EINE Absendefunktion, geteilt von allen Formularen — anders als in
 * `ZugangslinksListe.test.tsx`, und aus einem Grund: dort gibt es DREI Actions,
 * hier genau EINE. Unterschieden werden die Aufrufer deshalb an ihrer NUTZLAST
 * (`formData.getAll("ids")`), und das ist die schaerfere Aussage: sie sagt nicht
 * nur „irgendetwas wurde abgeschickt", sondern WELCHE Zeilen mitgingen.
 */
let abschicken = vi.fn();

beforeEach(() => {
  useActionStateMock.mockReset();
  loeschenMock.mockReset();
  wiederholenMock.mockReset();
  abschicken = vi.fn();
  useActionStateMock.mockImplementation(() => [{ ok: false, feldFehler: {} }, abschicken, false]);
});

afterEach(async () => {
  await unmount();
});

// ---------------------------------------------------------------------------
// Vorrichtungen
// ---------------------------------------------------------------------------

/** Ein fester Anker in Unix-SEKUNDEN — die Spalte fuehrt Sekunden, nie ms. */
const JETZT_SEKUNDEN = 1_800_000_000;
const STUNDE_SEKUNDEN = 3600;
const TAG_SEKUNDEN = 24 * STUNDE_SEKUNDEN;

const LINK_A = { id: "linkAAAAAA", tokenStart: "dz-abcd", name: "Übung Nord" };
const LINK_B = { id: "linkBBBBBB", tokenStart: "dz-efgh", name: "Übung Süd" };

/** Vor einer Stunde, `clean`, bekannte Kategorie, Abgabelink A. */
const NEU: PosteingangZeile = {
  id: "aaaaaaaaaa",
  empfangenSekunden: JETZT_SEKUNDEN - STUNDE_SEKUNDEN,
  empfangenText: "01.08.2026, 09:00",
  dateiname: "lage.txt",
  groesseBytes: 1_048_576,
  kategorieRoh: "bilder",
  hinweis: "Lage Nord, Übergabe 21:30",
  avStatus: "clean",
  herunterladbar: true,
  abgabelink: LINK_A,
};

/** Vor drei Tagen, `scanning`, OHNE Abgabelink — der Altbestand (§4.6). */
const MITTE: PosteingangZeile = {
  id: "bbbbbbbbbb",
  empfangenSekunden: JETZT_SEKUNDEN - 3 * TAG_SEKUNDEN,
  empfangenText: "29.07.2026, 10:00",
  dateiname: "plan.pdf",
  groesseBytes: 2048,
  kategorieRoh: "dokumente",
  hinweis: null,
  avStatus: "scanning",
  herunterladbar: false,
  abgabelink: null,
};

/** Vor zwanzig Tagen, `error`, UNBEKANNTE Kategorie aus dem Import. */
const ALT: PosteingangZeile = {
  id: "cccccccccc",
  empfangenSekunden: JETZT_SEKUNDEN - 20 * TAG_SEKUNDEN,
  empfangenText: "12.07.2026, 08:00",
  dateiname: "bericht.docx",
  groesseBytes: 3_145_728,
  kategorieRoh: "berichte",
  hinweis: null,
  avStatus: "error",
  herunterladbar: false,
  abgabelink: LINK_B,
};

/**
 * BEWUSST IN FALSCHER REIHENFOLGE uebergeben. „Neueste zuerst" ist sonst nicht
 * von „in der Reihenfolge der Eingabe" zu unterscheiden.
 */
const ALLE_DREI = [MITTE, ALT, NEU];

async function zeige(zeilen: PosteingangZeile[] = ALLE_DREI): Promise<void> {
  await mount(<PosteingangTabelle zeilen={zeilen} jetztSekunden={JETZT_SEKUNDEN} />);
}

/** Die Dateinamen in der Reihenfolge der TABELLENzeilen. */
function tabellenDateinamen(): string[] {
  return queryAll("tbody.ant-table-tbody tr.ant-table-row").map(
    (zeile) => zeile.querySelector("[data-spalte='dateiname']")?.textContent ?? "",
  );
}

function spaltenTitel(): string[] {
  return queryAll("thead.ant-table-thead th").map((th) => th.textContent ?? "");
}

/**
 * Radios und Kontrollkaestchen ueber den Prototyp-Setter, aus demselben Grund
 * wie `fill` im Harness: React haengt an `checked` einen eigenen Tracker, und
 * eine direkte Zuweisung liest er als „unveraendert" — `onChange` bliebe aus,
 * und der Filter waere im Test still unbenutzt (in
 * `AbgabeFormular.test.tsx:105-119` nachgemessen).
 */
async function schalte(feld: HTMLInputElement, an = true): Promise<void> {
  const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(feld), "checked")?.set;
  setter!.call(feld, an);
  await act(async () => {
    feld.dispatchEvent(new Event("click", { bubbles: true }));
    feld.dispatchEvent(new Event("change", { bubbles: true }));
  });
}

async function filtere(gruppe: string, wert: string): Promise<void> {
  await schalte(
    query<HTMLInputElement>(`[data-testid="files-inbox-filter-${gruppe}"] input[value="${wert}"]`),
  );
}

function filterWerte(gruppe: string): string[] {
  return queryAll<HTMLInputElement>(
    `[data-testid="files-inbox-filter-${gruppe}"] input`,
  ).map((feld) => feld.value);
}

async function waehle(id: string): Promise<void> {
  await schalte(query<HTMLInputElement>(`[data-testid="files-inbox-auswahl-tabelle-${id}"] input`));
}

/** Den Bestaetigungsknopf EINES offenen Popconfirm im Portal finden. */
function bestaetigung(beschriftung: string): HTMLElement {
  const knopf = Array.from(
    document.body.querySelectorAll<HTMLElement>(".ant-popconfirm .ant-btn"),
  ).find((k) => k.textContent === beschriftung);
  if (!knopf) throw new Error(`Kein Bestaetigungsknopf „${beschriftung}“ im Popconfirm`);
  return knopf;
}

function popconfirmText(): string {
  return document.body.querySelector(".ant-popconfirm")?.textContent ?? "";
}

const FEHLERTEXT = "Bitte mindestens eine Abgabe auswählen.";

/**
 * DEN FEHLERZWEIG SCHARFSTELLEN. `feldFehler` MUSS gefuellt sein: `fehlerText`
 * liefert fuer `{}` `null`, und der Alert entstuende gar nicht — mit einem
 * leeren Objekt prueft der Test nichts und ist trotzdem gruen.
 */
function imFehler(): void {
  useActionStateMock.mockImplementation(() => [
    { ok: false, feldFehler: { ids: FEHLERTEXT } },
    abschicken,
    false,
  ]);
}

/** Die `ids` der zuletzt abgeschickten Nutzlast. */
function abgeschickteIds(): string[] {
  const letzte = abschicken.mock.calls.at(-1);
  if (!letzte) throw new Error("Es wurde nichts abgeschickt");
  return (letzte[0] as FormData).getAll("ids").map(String);
}

// ---------------------------------------------------------------------------
// Punkt 1 — die acht Spalten, neueste zuerst
// ---------------------------------------------------------------------------

describe("Punkt 1 — Spalten und Vorgabesortierung", () => {
  it("zeigt genau die acht Spalten aus §8.6 in ihrer Reihenfolge", async () => {
    await zeige();
    // Die AUSWAHLspalte steht davor und ist keine der acht: sie traegt keinen
    // Wert der Abgabe, sondern die Mehrfachauswahl aus Punkt 6.
    expect(spaltenTitel().slice(1)).toEqual([
      "Zeit",
      "Dateiname",
      "Größe",
      "Kategorie",
      "Hinweis",
      "AV-Status",
      "Abgabelink",
      "Aktionen",
    ]);
  });

  it("sortiert neueste zuerst, unabhaengig von der Reihenfolge der Eingabe", async () => {
    await zeige();
    expect(tabellenDateinamen()).toEqual(["lage.txt", "plan.pdf", "bericht.docx"]);
  });

  /**
   * PUNKT 4, ZWEITER HALBSATZ (Review-Runde zu Aufgabe 12): Spaltenkoepfe
   * tragen `SCHRIFT.kicker`, nicht nur ihren Text. Ohne diese Zusicherung
   * naehme eine spaetere Aufraeumrunde das `<span style={SCHRIFT.kicker}>`
   * als Ballast wieder heraus — der Text sieht fuer sich genommen unveraendert
   * aus, die Rolle steckt ausschlieszlich im Stil.
   */
  it("traegt an der Spalte „Zeit“ die Rolle SCHRIFT.kicker (600, versal)", async () => {
    await zeige();
    const kopf = queryAll("thead.ant-table-thead th")[1]; // Index 0 ist die Auswahlspalte.
    const span = kopf?.querySelector("span");
    expect(span?.textContent).toBe("Zeit");
    expect(span?.style.fontWeight).toBe("600");
    expect(span?.style.textTransform).toBe("uppercase");
  });

  it("zeigt Groeszen in BINAEREN Einheiten mit dem Wort dazu", async () => {
    await zeige();
    // Die Einheit steht im Text, nicht in einem Kommentar (§9.1): „1,0 MB" und
    // „1,0 MiB" unterscheiden sich um den Faktor 1,048576, und genau dieses Paar
    // ist im Modul `files` schon einmal teuer geworden.
    expect(query("[data-testid='files-posteingang-tabelle']").textContent).toContain("1,0 MiB");
  });
});

// ---------------------------------------------------------------------------
// Punkt 2 — die vier Filter
// ---------------------------------------------------------------------------

describe("Punkt 2 — Filter fuer Kategorie, AV-Status, Zeitraum und Abgabelink", () => {
  /**
   * DIE FILTERLISTE KOMMT AUS DERSELBEN QUELLE WIE DIE SCHREIB-VALIDIERUNG
   * (`_lib/kategorien.ts`, T6), nie aus einer zweiten Aufzaehlung. Heiszen die
   * realen Verzeichnisse anders (Spec §13.1 Frage 5), aendert sich EINE Liste —
   * eine abgeschriebene zweite griffe danach ins Leere, und zwar still.
   */
  it("bietet als Kategorie genau `alle` plus die Schreibliste", async () => {
    await zeige();
    expect(filterWerte("kategorie")).toEqual([
      "alle",
      ...SCHREIBBARE_KATEGORIEN.map((k) => k.wert),
    ]);
  });

  it("bietet als AV-Status genau `alle` plus jeden Wert des Wertebereichs", async () => {
    await zeige();
    expect(filterWerte("avstatus").slice(1).sort()).toEqual([...AV_STATUS].sort());
    expect(filterWerte("avstatus")[0]).toBe("alle");
  });

  it("filtert nach Kategorie", async () => {
    await zeige();
    await filtere("kategorie", "dokumente");
    expect(tabellenDateinamen()).toEqual(["plan.pdf"]);
  });

  it("filtert nach AV-Status", async () => {
    await zeige();
    await filtere("avstatus", "error");
    expect(tabellenDateinamen()).toEqual(["bericht.docx"]);
  });

  it("filtert nach Zeitraum, gegen die SERVERUHR", async () => {
    await zeige();
    await filtere("zeitraum", "24h");
    expect(tabellenDateinamen()).toEqual(["lage.txt"]);
    await filtere("zeitraum", "7t");
    expect(tabellenDateinamen()).toEqual(["lage.txt", "plan.pdf"]);
  });

  it("filtert nach Abgabelink — und `Altbestand` ist einer der Werte", async () => {
    await zeige();
    expect(filterWerte("abgabelink")).toEqual(["alle", "altbestand", LINK_A.id, LINK_B.id]);

    await filtere("abgabelink", LINK_B.id);
    expect(tabellenDateinamen()).toEqual(["bericht.docx"]);

    await filtere("abgabelink", "altbestand");
    expect(tabellenDateinamen()).toEqual(["plan.pdf"]);
  });

  /**
   * DIE FILTERLISTE ERODIERT NICHT. Waere sie aus den GEFILTERTEN Zeilen
   * abgeleitet statt aus allen, verschwaende mit dem ersten Filtergriff der
   * halbe Rest der Liste — und die Auswahl liesse sich nicht mehr zuruecknehmen,
   * weil es den Eintrag, zu dem man zurueckwollte, nicht mehr gaebe.
   *
   * OHNE DIESEN TEST WAERE DIE MUTATION GRUEN, und das ist nachgemessen: die
   * Pruefung der Filterwerte oben laeuft ausschliesslich auf dem UNGEFILTERTEN
   * Stand, wo beide Ableitungen dasselbe liefern. Erst hier wird der
   * Unterschied sichtbar (mit `links` aus den gefilterten Zeilen: 1 rot statt
   * 0 von 31).
   */
  it("laesst die Abgabelink-Liste vollstaendig, auch wenn ein anderer Filter greift", async () => {
    await zeige();
    // `bilder` laesst nur die Zeile mit Abgabelink A stehen …
    await filtere("kategorie", "bilder");
    expect(tabellenDateinamen()).toEqual(["lage.txt"]);
    // … und trotzdem stehen BEIDE Links zur Wahl.
    expect(filterWerte("abgabelink")).toEqual(["alle", "altbestand", LINK_A.id, LINK_B.id]);
  });

  /**
   * ANZEIGE-TOLERANZ GEGEN SCHREIB-VALIDIERUNG (T6): der Altbestand kann jeden
   * Wert tragen, den `sanitizeCategory` durchliess. Eine Zeile, deren Kategorie
   * nicht in der Schreibliste steht, verschwindet NICHT — sonst faende der
   * Betreiber die Datei nie und saehe auch nicht, dass er umbenennen muss.
   */
  it("zeigt eine unbekannte Kategorie ROH an, statt die Zeile zu verwerfen", async () => {
    await zeige();
    expect(tabellenDateinamen()).toContain("bericht.docx");
    expect(query("[data-testid='files-posteingang-tabelle']").textContent).toContain("berichte");
  });

  it("nennt den leeren Trefferzustand und bietet einen Weg zurueck", async () => {
    await zeige();
    await filtere("zeitraum", "24h");
    await filtere("kategorie", "dokumente");
    expect(tabellenDateinamen()).toEqual([]);
    // Eine leere Tabelle ohne Erklaerung ist von „keine Abgabe eingegangen"
    // nicht zu unterscheiden — und ohne Ruecksetzer eine Sackgasse.
    expect(exists("[data-testid='files-posteingang-kein-treffer']")).toBe(true);
    await click("[data-testid='files-posteingang-filter-zuruecksetzen']");
    expect(tabellenDateinamen()).toEqual(["lage.txt", "plan.pdf", "bericht.docx"]);
  });
});

// ---------------------------------------------------------------------------
// Punkt 3 — `token_id IS NULL` heiszt „Altbestand"
// ---------------------------------------------------------------------------

describe("Punkt 3 — Altbestand", () => {
  it("schreibt „Altbestand“ in die Abgabelink-Spalte, wo kein Token haengt", async () => {
    await zeige([MITTE]);
    const zelle = query("[data-spalte='abgabelink']");
    expect(zelle.textContent).toBe("Altbestand");
  });

  it("zeigt sonst `token_start` und den Namen des Abgabelinks", async () => {
    await zeige([NEU]);
    const zelle = query("[data-spalte='abgabelink']");
    expect(zelle.textContent).toContain(LINK_A.tokenStart);
    expect(zelle.textContent).toContain(LINK_A.name);
  });
});

// ---------------------------------------------------------------------------
// Punkt 4 — AV-Zustaende
// ---------------------------------------------------------------------------

describe("Punkt 4 — AV-Zustand mit Symbol UND Text", () => {
  it("gibt `scanning` ein Uhr-Symbol und den Satz daneben", async () => {
    await zeige([MITTE]);
    const zelle = query("[data-spalte='avstatus']");
    // BEIDE Haelften einzeln: Bedeutung nie allein ueber ein Symbol, und ein
    // Symbol ohne Text waere fuer eine Sprachausgabe stumm
    // (`docs/design/README.md:133-137`).
    expect(zelle.querySelector(".anticon-clock-circle"), "kein Uhr-Symbol").not.toBeNull();
    expect(zelle.textContent).toContain("wird geprüft");
  });

  it("nennt `error` mit dem Satz „Prüfung nicht möglich“", async () => {
    await zeige([ALT]);
    expect(query("[data-spalte='avstatus']").textContent).toContain("Prüfung nicht möglich");
  });

  /**
   * Der Download bleibt bis `clean` gesperrt (§6.3, T32 Punkt 2). Ein Knopf, der
   * immer 403 bekaeme, waere eine Sackgasse — der Zustand daneben sagt, warum.
   */
  it("sperrt den Download, solange die Zeile nicht freigegeben ist", async () => {
    await zeige([MITTE]);
    const knopf = query("[data-testid='files-inbox-download-tabelle-bbbbbbbbbb']");
    expect(knopf.getAttribute("aria-disabled")).toBe("true");
    expect(knopf.getAttribute("href")).toBeNull();
  });

  it("verlinkt den Download einer freigegebenen Zeile auf `/api/inbox/<id>`", async () => {
    await zeige([NEU]);
    expect(
      query("[data-testid='files-inbox-download-tabelle-aaaaaaaaaa']").getAttribute("href"),
    ).toBe("/api/inbox/aaaaaaaaaa");
  });
});

// ---------------------------------------------------------------------------
// Punkt 5 — Leerzustand
// ---------------------------------------------------------------------------

describe("Punkt 5 — Leerzustand", () => {
  it("nennt den Zustand und verweist auf die Abgabelinks", async () => {
    await zeige([]);
    const leer = query("[data-testid='files-posteingang-leer']");
    expect(leer.textContent).toContain("Noch keine Abgabe eingegangen");
    // OHNE den Verweis waere die leere Seite eine Sackgasse: Abgaben entstehen
    // ausschliesslich ueber einen Abgabelink (§8.1).
    const verweis = query<HTMLAnchorElement>(
      "[data-testid='files-posteingang-leer'] a[href='/zugangslinks']",
    );
    expect(verweis.textContent).not.toBe("");
  });

  it("zeigt im Leerzustand keine Tabelle und keine Filterleiste", async () => {
    await zeige([]);
    expect(exists("tbody.ant-table-tbody")).toBe(false);
    expect(exists("[data-testid='files-inbox-filter-kategorie']")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Punkt 6 — Loeschen, Mehrfachauswahl, ZIP
// ---------------------------------------------------------------------------

describe("Punkt 6 — Loeschen mit Bestaetigung und Groesze", () => {
  it("fragt vor dem Loeschen nach und nennt Name und Groesze", async () => {
    await zeige([NEU]);
    await click("[data-testid='files-inbox-loeschen-tabelle-aaaaaaaaaa']");
    const text = popconfirmText();
    expect(text).toContain("lage.txt");
    // Die GROESZE gehoert in die Rueckfrage (§8.6): ohne sie sagt „wird
    // geloescht" nicht, was verloren geht.
    expect(text).toContain("1,0 MiB");
  });

  it("schickt erst NACH der Bestaetigung ab — und dann mit genau dieser ID", async () => {
    await zeige([NEU]);
    await click("[data-testid='files-inbox-loeschen-tabelle-aaaaaaaaaa']");
    expect(abschicken).not.toHaveBeenCalled();
    await clickElement(bestaetigung("Löschen"));
    expect(abgeschickteIds()).toEqual([NEU.id]);
  });
});

describe("Punkt 6 — Mehrfachauswahl", () => {
  it("haelt beide Sammelaktionen bei leerer Auswahl deaktiviert", async () => {
    await zeige();
    const zip = query("[data-testid='files-inbox-zip']");
    expect(zip.getAttribute("aria-disabled")).toBe("true");
    // Kein `href` im deaktivierten Zustand: ein Anker mit Ziel bliebe per
    // Mittelklick erreichbar und riefe `?ids=` ohne eine einzige ID.
    expect(zip.getAttribute("href")).toBeNull();
    expect(
      query("[data-testid='files-inbox-loeschen-auswahl']").hasAttribute("disabled"),
    ).toBe(true);
  });

  it("baut die ZIP-Adresse aus den ausgewaehlten IDs — derselbe Endpunkt wie T49", async () => {
    await zeige();
    await waehle(NEU.id);
    await waehle(ALT.id);
    // Kommagetrennt und in der ANGEZEIGTEN Reihenfolge — `api/inbox/zip`
    // zerlegt `?ids=` genau so (`route.ts`, `ausgewaehlteIds`).
    expect(query("[data-testid='files-inbox-zip']").getAttribute("href")).toBe(
      `/api/inbox/zip?ids=${NEU.id},${ALT.id}`,
    );
  });

  it("loescht ueber die Mehrfachauswahl genau die ausgewaehlten Zeilen", async () => {
    await zeige();
    await waehle(NEU.id);
    await waehle(ALT.id);
    await click("[data-testid='files-inbox-loeschen-auswahl']");
    // Anzahl UND Summe in der Rueckfrage.
    expect(popconfirmText()).toContain("2");
    expect(popconfirmText()).toContain("4,0 MiB");
    await clickElement(bestaetigung("Löschen"));
    expect(abgeschickteIds()).toEqual([NEU.id, ALT.id]);
  });

  /**
   * EINE AUSGEBLENDETE ZEILE DARF NICHT MITSTERBEN. Wer eine Zeile waehlt und
   * dann filtert, sieht sie nicht mehr — ein Sammelloeschen ueber die rohe
   * Auswahl entfernte sie trotzdem, und zwar ohne dass sie je in der Rueckfrage
   * stand. Die Auswahl gilt deshalb nur, soweit sie SICHTBAR ist.
   */
  it("beschraenkt die Auswahl auf die sichtbaren Zeilen", async () => {
    await zeige();
    await waehle(NEU.id);
    await waehle(ALT.id);
    await filtere("kategorie", "bilder");
    expect(tabellenDateinamen()).toEqual(["lage.txt"]);
    expect(query("[data-testid='files-inbox-zip']").getAttribute("href")).toBe(
      `/api/inbox/zip?ids=${NEU.id}`,
    );
  });

  it("waehlt mit dem Kopf-Kaestchen alle sichtbaren Zeilen und hebt sie wieder auf", async () => {
    await zeige();
    await filtere("zeitraum", "7t");
    await schalte(query<HTMLInputElement>("[data-testid='files-inbox-auswahl-alle'] input"));
    expect(query("[data-testid='files-inbox-zip']").getAttribute("href")).toBe(
      `/api/inbox/zip?ids=${NEU.id},${MITTE.id}`,
    );
    await schalte(
      query<HTMLInputElement>("[data-testid='files-inbox-auswahl-alle'] input"),
      false,
    );
    expect(query("[data-testid='files-inbox-zip']").getAttribute("aria-disabled")).toBe("true");
  });
});

// ---------------------------------------------------------------------------
// Punkt 7 — Kartenliste, Scroll, Knopfgroeszen
// ---------------------------------------------------------------------------

describe("Punkt 7 — beide Darstellungen, Scroll und Knopfgroeszen", () => {
  it("haelt Tabelle UND Kartenliste im Markup, mit den Klassen aus `files.css`", async () => {
    await zeige();
    // Die Umschaltung ist CSS, nie JavaScript: ein JS-Breakpoint zeigte beim
    // ersten Render die falsche Variante (`docs/design/README.md:163-165`).
    expect(query("[data-testid='files-posteingang']").className).toContain("fi-liste");
    expect(query("[data-testid='files-posteingang-tabelle']").className).toContain("nurDesktop");
    expect(query("[data-testid='files-posteingang-karten']").className).toContain("nurMobil");
    expect(queryAll("[data-testid^='files-inbox-karte-']")).toHaveLength(3);
  });

  /*
   * KORRIGIERT AUFGABE 12: die alte Ausnahme „size=small INNERHALB von
   * Tabellenzeilen" galt der 56px-`controlHeight` — bei `ARBEITSDICHTE` (44)
   * unterbietet `size="small"` (24px) die Mindesttapflaeche, egal ob Zeile
   * oder nicht. Die Zusicherung dreht sich deshalb um: KEIN Knopf traegt
   * `ant-btn-sm`, weder in der Tabelle noch auszerhalb.
   */
  it("gibt keinem Knopf `small` — weder in der Tabelle noch auszerhalb", async () => {
    await zeige();
    const inZeilen = queryAll("tbody.ant-table-tbody .ant-btn");
    expect(inZeilen.length, "keine Zeilenaktion gefunden").toBeGreaterThan(0);
    for (const knopf of inZeilen) {
      expect(knopf.className, `Zeilenaktion mit small: ${knopf.textContent}`).not.toContain(
        "ant-btn-sm",
      );
    }

    const draussen = queryAll(".ant-btn").filter((k) => !k.closest("tbody.ant-table-tbody"));
    expect(draussen.length, "kein Knopf auszerhalb der Tabelle gefunden").toBeGreaterThan(0);
    for (const knopf of draussen) {
      // `ARBEITSDICHTE` setzt `controlHeight` auf 44 und schon das richtige
      // Masz; `size="large"` waeren 72px.
      expect(knopf.className, `Handlungsknopf mit small: ${knopf.textContent}`).not.toContain(
        "ant-btn-sm",
      );
      expect(knopf.className, `Handlungsknopf mit large: ${knopf.textContent}`).not.toContain(
        "ant-btn-lg",
      );
    }
  });

  /**
   * QUELLTEXT-SCAN, und er besitzt genau „die Prop steht da". Die Spalten tragen
   * keine `width`, also ist `max-content` die einzige ehrliche Angabe — jede
   * Pixelzahl waere erfunden. Und KEINE Spalte traegt `fixed` oder `ellipsis`,
   * `scroll.y` ist nicht gesetzt: rc-table schaltet sonst auf
   * `table-layout: fixed` und das DESKTOP-Bild aendert sich, ohne dass irgendwo
   * etwas ueberlaeuft (`lib/Table.js:426-442`).
   */
  it("gibt der Tabelle `scroll={{ x: \"max-content\" }}` und keiner Spalte `fixed`/`ellipsis`", () => {
    const quelle = ohneKommentare(readFileSync(KOMPONENTE_PFAD, "utf8"));
    expect(quelle).toMatch(/scroll=\{\{\s*x:\s*"max-content"\s*\}\}/);
    expect(quelle).not.toMatch(/\bfixed:\s*"(left|right)"/);
    expect(quelle).not.toMatch(/\bellipsis:\s*true/);
  });

  /**
   * DER FEHLERZWEIG WIRD SONST IN KEINEM TEST GERENDERT. `beforeEach` setzt
   * `useActionState` auf `{ok:false, feldFehler:{}}`, und `fehlerText` liefert
   * dafuer `null` — der ganze `{fehler !== null && …}`-Block samt Alert und
   * Wiederholen-Knopf blieb damit ungeprueft, und die Knopfgroeszen-Schleife
   * oben konnte ihn strukturell nicht sehen. Der Zustand wird deshalb HIER
   * gesetzt, je Test und nicht global.
   */
  it("gibt dem Wiederholen-Knopf `small` an KEINER Stelle — weder Tabelle noch Karte", async () => {
    imFehler();
    await zeige([NEU]);

    /*
     * KORRIGIERT AUFGABE 12 — siehe Kommentar an der Schwestertest oben. Beide
     * Darstellungen tragen jetzt dieselbe 44px-`controlHeight`, ohne `size`.
     * `block` bleibt weiterhin falsch fuer den Alert-Wiederholen-Knopf: eine
     * vollbreite Flaeche in einer Alert-Aktion.
     */
    const inTabelle = query(`[data-testid='files-inbox-wiederholen-tabelle-${NEU.id}']`);
    expect(inTabelle.className, "Zeilenaktion mit small").not.toContain("ant-btn-sm");
    expect(inTabelle.className, "Zeilenaktion mit large").not.toContain("ant-btn-lg");

    const inKarte = query(`[data-testid='files-inbox-wiederholen-karte-${NEU.id}']`);
    expect(inKarte.className, "Kartenaktion mit small").not.toContain("ant-btn-sm");
    expect(inKarte.className, "Kartenaktion mit large").not.toContain("ant-btn-lg");
    expect(inKarte.className, "Kartenaktion vollbreit").not.toContain("ant-btn-block");
  });

  it("nennt den Fehler der Action und schickt ueber `Wiederholen` erneut ab", async () => {
    imFehler();
    await zeige([NEU]);

    // OHNE Rueckfrage: die Bestaetigung stand schon vor dem ersten Versuch —
    // ein zweites Popconfirm waere eine Rueckfrage zu einer Entscheidung, die
    // die Person gerade getroffen hat.
    expect(query(`[data-testid='files-inbox-fehler-tabelle-${NEU.id}']`).textContent).toContain(
      FEHLERTEXT,
    );
    await click(`[data-testid='files-inbox-wiederholen-tabelle-${NEU.id}']`);
    expect(abgeschickteIds()).toEqual([NEU.id]);
  });

  it("stapelt die Knopfzeile unter 767.98px und gibt volle Breite", () => {
    const css = ohneKommentare(readFileSync(CSS_PFAD, "utf8"));
    const mobil = /@media \(max-width: 767\.98px\) \{([\s\S]*?)\n\}/.exec(css);
    expect(mobil, "kein 767.98px-Block").not.toBeNull();
    expect(mobil![1]).toMatch(/\.knopfzeile\s*\{[^}]*flex-direction:\s*column/);
    expect(mobil![1]).toMatch(/width:\s*100%/);
  });

  /**
   * `.knopfzeile > *` TRIFFT DEN LOESCHKNOPF NICHT. Er steht in einem `<form>`
   * (Popconfirm bestaetigt und `requestSubmit` schickt ab), und der Kindselektor
   * trifft damit das FORMULAR: das ginge auf volle Breite, der Knopf darin
   * bliebe auto-breit — neben einem vollbreiten „Ausgewählte herunterladen"
   * stuende ein halbbreites „Ausgewählte löschen".
   *
   * ZWEI HAELFTEN, und keine besitzt die Aussage allein: der Scan sagt „die
   * Regel steht im 767.98px-Block", der DOM-Test sagt „der Knopf traegt die
   * Klasse, auf die sie zielt". Die CSS-Module-Aufloesung in Vitest liefert fuer
   * JEDEN Schluessel einen Namen (nachgemessen: `styles.gibtEsNicht` ergibt
   * `_gibtEsNicht_<hash>`) — ein DOM-Test allein bliebe deshalb auch dann gruen,
   * wenn es die Regel gar nicht gaebe. Ob sie WIRKT, weiss nur ein Browser
   * (T48 bei 390px).
   */
  it("zielt die Mobilregel auf eine Klasse AM Knopf, nicht auf das Formular", () => {
    const css = ohneKommentare(readFileSync(CSS_PFAD, "utf8"));
    const mobil = /@media \(max-width: 767\.98px\) \{([\s\S]*?)\n\}/.exec(css);
    // ZWEI Klassen und nicht eine: `.knopf` allein waere (0,1,0) und damit im
    // Gleichstand mit `.ant-btn` — bei Gleichstand entscheidet die
    // Dokumentreihenfolge, und antds Stylesheet kommt spaeter
    // (`docs/design/README.md:64-79`, dort dreimal passiert).
    expect(mobil![1]).toMatch(/\.knopfzeile\s+\.knopf\s*\{[^}]*width:\s*100%/);
  });

  it("gibt dem Loeschknopf im Formular genau diese Klasse", async () => {
    await zeige();
    expect(
      query("[data-testid='files-inbox-loeschen-auswahl']").classList.contains(styles.knopf),
      "der Loeschknopf traegt die Klasse der Mobilregel nicht",
    ).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// T45 — der Wiederholen-Knopf fuer die AV-Pruefung
// ---------------------------------------------------------------------------

/**
 * ZWEI KNOEPFE HEISSEN „WIEDERHOLEN" UND MEINEN VERSCHIEDENES.
 *
 * Der aeltere sitzt in der Alert-Aktion und schickt das LOESCHEN noch einmal ab
 * (`files-inbox-wiederholen-…`, oben geprueft). Der hier wiederholt die
 * VIRENPRUEFUNG und traegt deshalb `av` im Namen. Zwei Testids fuer zwei
 * Vorgaenge: mit einer einzigen wuesste kein Test, welchen der beiden er
 * gerade bedient — und die Faelle oben rufen ihn auf einer `clean`-Zeile auf,
 * an der es diesen hier gar nicht geben darf.
 */
const AV_KNOPF = (kennung: "tabelle" | "karte", id: string) =>
  `[data-testid='files-inbox-av-wiederholen-${kennung}-${id}']`;

/** Dieselbe Abgabe, nur in einem anderen Pruefzustand. */
function mitAvStatus(status: (typeof AV_STATUS)[number], id: string): PosteingangZeile {
  return { ...ALT, id, avStatus: status, herunterladbar: status === "clean" };
}

describe("T45 — Wiederholen der Virenpruefung", () => {
  it("steht an der `error`-Zeile — in der Tabelle UND in der Karte", async () => {
    await zeige([ALT]);
    expect(exists(AV_KNOPF("tabelle", ALT.id))).toBe(true);
    // Die Kartenliste steht IMMER im Markup (die Umschaltung ist CSS): ohne
    // den Knopf dort haette die Zeile unter 768px keinen Einstiegspunkt.
    expect(exists(AV_KNOPF("karte", ALT.id))).toBe(true);
  });

  /*
   * DIE GEGENPROBE IST DIE HAELFTE DER ZUSAGE. Ohne sie bliebe eine Bedingung
   * `avStatus !== "clean"` gruen — und der Knopf stuende an jeder Zeile, die
   * gerade laeuft (`scanning`) oder einen Fund traegt (`infected`), also an
   * genau den beiden Zustaenden, aus denen §6.2 KEINEN Weg zurueck kennt.
   */
  for (const status of ["clean", "scanning", "infected", "unscanned"] as const) {
    it(`fehlt an einer Zeile in '${status}'`, async () => {
      const zeile = mitAvStatus(status, "dddddddddd");
      await zeige([zeile]);
      expect(exists(AV_KNOPF("tabelle", zeile.id))).toBe(false);
      expect(exists(AV_KNOPF("karte", zeile.id))).toBe(false);
    });
  }

  it("nennt Tabelle und ID der Zeile — `art=inbox` und die eigene ID", async () => {
    await zeige([ALT]);
    const formular = query(AV_KNOPF("tabelle", ALT.id)).closest("form");
    expect(formular, "der Knopf steht in keinem Formular").not.toBeNull();
    const daten = new FormData(formular!);
    // `art` entscheidet die Tabelle; ein Rateweg ueber beide Tabellen waere
    // eine zweite Wahrheit darueber, welche Zeile gemeint ist.
    expect(daten.get("art")).toBe("inbox");
    expect(daten.get("id")).toBe(ALT.id);
  });

  it("ruft beim Absenden die Server Action, nicht das Loeschen", async () => {
    await zeige([ALT]);
    const formular = query(AV_KNOPF("tabelle", ALT.id)).closest("form")!;
    await act(async () => {
      formular.requestSubmit();
    });
    expect(wiederholenMock).toHaveBeenCalledTimes(1);
    expect((wiederholenMock.mock.calls[0][0] as FormData).get("id")).toBe(ALT.id);
    expect(loeschenMock).not.toHaveBeenCalled();
  });
});
