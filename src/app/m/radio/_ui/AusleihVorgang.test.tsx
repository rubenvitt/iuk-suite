// @vitest-environment jsdom
// src/app/m/radio/_ui/AusleihVorgang.test.tsx
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { act } from "react";
import { readFileSync } from "node:fs";

/**
 * DIE INSEL DES AUSLEIHVORGANGS (Spec 1 §4.3, `:3417-3516`).
 *
 * ⛔ DREI ACTION-MODULE WERDEN ERSETZT, und aus demselben Grund wie in
 * `_ui/AusleihRahmen.test.tsx:7-15`: `_actions/ausleihe.ts` und `_actions/sitzung.ts`
 * tragen `"use server"` und ziehen `next/cache`, `next/headers`, die Gate-Schranke und die
 * Moduldatenbank nach. Die Insel braucht sie als REFERENZEN; WAS sie tun, gehoert A9 und
 * A17 (`_actions/ausleihe.test.ts`, `_actions/guards.test.ts`, `_lib/bauform.test.ts`).
 *
 * ⛔ WAS HIER NICHT GEMOCKT IST, IST ABSICHT: `_lib/auswahl.ts`, `_lib/filter.ts`,
 * `_lib/meldungen.ts` und `_lib/status.ts` laufen ECHT. Der Deckel, die Suche und der
 * Rueckfallsatz sollen an den Funktionen gemessen werden, die auch in Produktion laufen —
 * dieselbe Lehre wie REVIEW-A13 Fund K3 (eine Zusicherung gegen testeigene Hilfsdaten
 * blieb gegen fuenf gleichzeitige Mutationen gruen).
 */
const ausleiheAnlegenMock = vi.hoisted(() => vi.fn());
const entleiherVorschlaegeMock = vi.hoisted(() => vi.fn());
const erneuereSitzungMock = vi.hoisted(() => vi.fn());
const replaceMock = vi.hoisted(() => vi.fn());

vi.mock("../_actions/ausleihe", () => ({
  ausleiheAnlegen: ausleiheAnlegenMock,
  entleiherVorschlaege: entleiherVorschlaegeMock,
}));
vi.mock("../_actions/sitzung", () => ({ erneuereSitzung: erneuereSitzungMock }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: replaceMock }),
  usePathname: () => "/ausleihen",
}));

import { mount, unmount, query, exists, fill, click, submitForm } from "@/app/m/qr/_lib/test-dom";
import { AUSWAHL_MAX } from "../_lib/auswahl";
import { VORSCHLAG_MIN_ZEICHEN } from "../_db/leihen";
import { AusleihVorgang, type AuswahlGeraet } from "./AusleihVorgang";
import { ENTLEIHER_MAX, ENTLEIHER_MIN_ZEICHEN } from "./EntleiherFeld";

const STYLESHEET = "src/app/m/radio/_ui/ausleihe.module.css";
const KNOPF = "[data-rolle='radio-ausleihen']";
const NAMENSFELD = "#radio-entleiher";
const NAMENSWERT = "[data-rolle='radio-entleiher-wert']";
const AUSWAHLWERT = "[data-rolle='radio-auswahl-wert']";
const SUCHE = "[data-rolle='radio-auswahl-suche']";
const DECKEL = "[data-rolle='radio-deckel']";
const NAMENSFEHLER = "[data-rolle='radio-name-fehler']";
const AKTIONSFEHLER = "[data-rolle='radio-ausleih-fehler']";
const ERNEUERN = "[data-rolle='radio-sitzung-erneuern']";

const zeile = (id: string): string => `[data-rolle='radio-auswahlzeile'][data-id='${id}']`;

/**
 * ⛔ DIE SAETZE STEHEN AUSGESCHRIEBEN und werden nicht aus dem Quellmodul importiert: sonst
 * richtete sich die Zusicherung gegen denselben Wert, den die Insel rendert, und koennte
 * konstruktiv nie fehlschlagen (dieselbe Form wie
 * `(ausleihe)/geraete/page.test.tsx:63-70`).
 */
const KNOPF_EINS = "Gerät ausleihen";
const KNOPF_MEHRERE = "Geräte ausleihen";
const KNOPF_LAEUFT = "Wird gespeichert …";

function geraet(werte: Partial<AuswahlGeraet> & { id: string }): AuswahlGeraet {
  return {
    rufname: `Ruf ${werte.id}`,
    geraetetyp: "Motorola MTP3550",
    standort: "Fahrzeughalle",
    status: "AVAILABLE",
    suchschluessel: `ruf ${werte.id} motorola mtp3550 fahrzeughalle`,
    ...werte,
  };
}

const DREI: AuswahlGeraet[] = [
  geraet({ id: "g-1", rufname: "Kater 1" }),
  geraet({ id: "g-2", rufname: "Kater 2" }),
  geraet({ id: "g-3", rufname: "Wache 7", standort: "Wache", suchschluessel: "wache 7 wache" }),
];

async function rendere(
  geraete: AuswahlGeraet[] = DREI,
  vorauswahl: string[] = [],
  namensVorbelegung: string | null = null,
): Promise<void> {
  await mount(
    <AusleihVorgang geraete={geraete} vorauswahl={vorauswahl} namensVorbelegung={namensVorbelegung} />,
  );
}

/**
 * Die Entprellung des Namensfelds plus die Mikrotasks der Server Action durchlaufen lassen.
 *
 * ⛔ ECHTE ZEIT, KEINE FALSCHEN ZEITGEBER, und die Wartezeit ist grosszuegig gewaehlt: der
 * Zeitgeber der Insel (`_ui/EntleiherFeld.tsx`, 200 ms) wird VOR diesem hier gestellt, also
 * faellt er auch unter Parallellast zuerst — die Reihenfolge zweier Zeitgeber haengt an
 * ihrer Faelligkeit, nicht an der Maschine. ⚠️ Das Ledger warnt vor absoluten
 * ZEITSCHRANKEN im vollen Lauf (`.superpowers/sdd/planteil3/progress.md:477-484`); hier
 * wird nichts GEMESSEN, sondern nur gewartet, und Warten kann unter Last nur laenger
 * dauern, nie kuerzer.
 */
async function warteAufVorschlaege(): Promise<void> {
  await act(async () => {
    await new Promise((r) => setTimeout(r, 350));
  });
  await act(async () => {});
}

/** Die Vorschlagsliste haengt in einem PORTAL an `document.body`, nicht im Wirt. */
function vorschlagsknoten(): HTMLElement[] {
  return Array.from(document.querySelectorAll<HTMLElement>(".ant-select-item-option"));
}

beforeEach(() => {
  ausleiheAnlegenMock.mockResolvedValue(undefined);
  entleiherVorschlaegeMock.mockResolvedValue([]);
  erneuereSitzungMock.mockResolvedValue({ ok: true });
});

afterEach(async () => {
  await unmount();
  vi.clearAllMocks();
});

describe("radio-AusleihVorgang: die Auswahl", () => {
  it("schreibt die Auswahl nach ?geraete= zurueck", async () => {
    /*
     * Spec:3426 („Die Insel schreibt die Auswahl mit `router.replace` in `?geraete=`
     * zurueck — reload- und zurueck-fest") und §4.3.3.
     * ⛔ `replace`, NICHT `push`: jedes Antippen legte sonst einen Verlaufseintrag an.
     * ⛔ DIE ADRESSE KOMMT AUS `usePathname()` und ist nicht verdrahtet — auf dem zweiten
     * Weg (`/m/radio/ausleihen`, `src/core/routing.ts:54-67`) waere `/ausleihen` falsch.
     * ⛔ UND DER PARAMETER VERSCHWINDET GANZ, wenn nichts mehr gewaehlt ist.
     */
    await rendere();

    await click(zeile("g-1"));
    expect(replaceMock).toHaveBeenLastCalledWith("/ausleihen?geraete=g-1", { scroll: false });

    await click(zeile("g-3"));
    expect(replaceMock).toHaveBeenLastCalledWith("/ausleihen?geraete=g-1,g-3", { scroll: false });

    await click(zeile("g-1"));
    expect(replaceMock).toHaveBeenLastCalledWith("/ausleihen?geraete=g-3", { scroll: false });

    await click(zeile("g-3"));
    expect(replaceMock, "ohne Auswahl steht kein nacktes ?geraete= in der Adresse")
      .toHaveBeenLastCalledWith("/ausleihen", { scroll: false });
  });

  it("uebernimmt die serverseitig gepruefte Vorauswahl und schickt sie im Formular mit", async () => {
    /*
     * §4.3.1 Schritt 3: „das Geraet aus Schritt 2 ist bereits markiert". Die Liste kommt
     * bereits GEPRUEFT aus `page.tsx` (§4.3.3) — diese Insel prueft nicht noch einmal.
     */
    await rendere(DREI, ["g-2"]);

    expect(query(zeile("g-2")).getAttribute("aria-pressed")).toBe("true");
    expect(query(zeile("g-1")).getAttribute("aria-pressed")).toBe("false");
    expect(query<HTMLInputElement>(AUSWAHLWERT).value).toBe("g-2");
  });

  it("ein nicht freies Geraet ist nicht antippbar", async () => {
    /*
     * `DeviceRow.tsx:47`, `:49-50`: kein Bedienelement, `aria-disabled="true"`, 60 %
     * Deckkraft. ⛔ DIE DECKKRAFT IST NICHT DER TRAEGER DER AUSSAGE (Spec:3696-3697).
     * ⛔ Und „frei" ist der GEFALTETE Wert (⬜ A-L13, `progress.md:22-32`): die Faltung
     * `NULL -> frei` steht in `_lib/status.ts`, diese Flaeche sieht nur das Ergebnis.
     */
    await rendere([geraet({ id: "g-1" }), geraet({ id: "g-9", status: "ON_LOAN" })]);

    const vergeben = query(zeile("g-9"));
    expect(vergeben.tagName).toBe("DIV");
    expect(vergeben.getAttribute("aria-disabled")).toBe("true");
    expect(vergeben.getAttribute("aria-pressed"), "kein Knopfzustand an einer toten Zeile").toBeNull();

    await click(zeile("g-9"));
    expect(replaceMock, "eine tote Zeile schreibt nichts in die Adresse").not.toHaveBeenCalled();
  });

  it("nimmt hoechstens AUSWAHL_MAX Geraete an und sagt es", async () => {
    /*
     * Spec:3482-3484: „Der Deckel 20 ist neu und SICHTBAR: mehr Geraete als 20 in einem
     * Vorgang nimmt die Flaeche nicht an, und sie sagt es."
     * ⛔ DIE ZAHL IM SATZ KOMMT AUS `AUSWAHL_MAX` (`_lib/auswahl.ts:53`) — Auflage aus
     * `_lib/auswahl.ts:33-37`. Deshalb baut dieser Fall seine Liste AUS der Konstante und
     * schreibt keine zweite 20.
     * ⛔ ABWAEHLEN GEHT WEITERHIN: ein Deckel, der auch das Entfernen sperrt, sperrt den
     * einzigen Weg wieder unter die Grenze.
     */
    const viele = Array.from({ length: AUSWAHL_MAX + 1 }, (_, i) => geraet({ id: `g-${i}` }));
    const volle = viele.slice(0, AUSWAHL_MAX).map((g) => g.id);
    await rendere(viele, volle);

    expect(query(DECKEL).textContent).toContain(`${AUSWAHL_MAX} Ger`);

    const ueberzaehlig = `g-${AUSWAHL_MAX}`;
    await click(zeile(ueberzaehlig));
    expect(query(zeile(ueberzaehlig)).getAttribute("aria-pressed")).toBe("false");
    expect(replaceMock, "ueber dem Deckel wird die Adresse nicht angefasst").not.toHaveBeenCalled();

    await click(zeile("g-0"));
    expect(query<HTMLInputElement>(AUSWAHLWERT).value.split(",")).toHaveLength(AUSWAHL_MAX - 1);
    expect(exists(DECKEL), "unter dem Deckel verschwindet der Satz wieder").toBe(false);
  });

  it("sucht ueber den vorberechneten Suchschluessel und nicht ueber die sichtbaren Felder", async () => {
    /*
     * §4.5.2 (Spec:3629-3632): der `suchschluessel` ist SERVERSEITIG vorberechnet und
     * enthaelt auch die Seriennummer, die als eigenes Feld nicht mitreist (§4.1 Punkt 2).
     * ⛔ EINE SUCHE, EIN ORT: `filtereGeraete` (`_lib/filter.ts:180`) ist dieselbe
     * Funktion, die die Uebersicht benutzt — deshalb laeuft sie hier ECHT und ist nicht
     * gemockt.
     */
    await rendere([
      geraet({ id: "g-1", rufname: "Kater 1", suchschluessel: "kater 1 sn-4711" }),
      geraet({ id: "g-2", rufname: "Kater 2", suchschluessel: "kater 2 sn-0815" }),
    ]);

    await fill(SUCHE, "4711");

    expect(exists(zeile("g-1"))).toBe(true);
    expect(exists(zeile("g-2")), "was nicht im Suchschluessel steht, faellt heraus").toBe(false);
  });
});

describe("radio-AusleihVorgang: der Absendeknopf", () => {
  it("sperrt den Knopf sofort und wechselt die Beschriftung", async () => {
    /*
     * `ConfirmLoanButton.tsx:42-66` (sofortige Sperre ueber `isSubmitting`) und `:68`
     * (Beschriftung je nach Anzahl) — woertlich erhalten, nur wird aus dem `useState` ein
     * `useActionState`, dessen `pending` dasselbe leistet (Spec:3431-3433).
     */
    let nieFertig: () => void = () => {};
    ausleiheAnlegenMock.mockReturnValue(new Promise<void>((r) => (nieFertig = r)));

    await rendere(DREI, ["g-1"], "Max Mustermann");
    expect(query(KNOPF).textContent, "eine Auswahl, Einzahl").toContain(KNOPF_EINS);

    await click(zeile("g-2"));
    expect(query(KNOPF).textContent, "zwei Auswahlen, Mehrzahl").toContain(KNOPF_MEHRERE);

    await submitForm();

    expect(query(KNOPF).textContent).toContain(KNOPF_LAEUFT);
    expect(query<HTMLButtonElement>(KNOPF).disabled).toBe(true);

    nieFertig();
  });

  it("ist ohne Geraet und ohne Namen gesperrt", async () => {
    // `ConfirmLoanButton.tsx:46`: `deviceIds.length === 0 || !trimmedName`.
    await rendere();
    expect(query<HTMLButtonElement>(KNOPF).disabled, "kein Geraet").toBe(true);

    await click(zeile("g-1"));
    expect(query<HTMLButtonElement>(KNOPF).disabled, "kein Name").toBe(true);

    await fill(NAMENSFELD, "   ");
    expect(query<HTMLButtonElement>(KNOPF).disabled, "nur Leerzeichen ist kein Name").toBe(true);

    await fill(NAMENSFELD, "Max Mustermann");
    expect(query<HTMLButtonElement>(KNOPF).disabled).toBe(false);
  });

  it("schickt den Namen unveraendert im versteckten Feld mit", async () => {
    /*
     * ⛔ DER NAME WIRD NICHT UMGESCHRIEBEN (Spec:3587-3592, §4.12 Nr. 9): kein `trim()`,
     * kein `sanitizeForDisplay` — bei „Mueller & Sohn" waere das ein Datenschaden, kein
     * Schutz. ENTSCHIEDEN wird auf dem getrimmten Wert (der Knopf oben), GESCHICKT wird der
     * rohe; dieselbe Trennung wie in `_actions/ausleihe.ts:249-250` fuer die Zustandsnotiz.
     * ⛔ UND DAS SICHTBARE FELD TRAEGT DEN NAMEN NICHT: was das innere Suchfeld eines
     * antd-`AutoComplete` an ein `FormData` liefert, ist kein Vertrag.
     */
    await rendere();
    await fill(NAMENSFELD, "  Mueller & Sohn  ");

    expect(query<HTMLInputElement>(NAMENSWERT).value).toBe("  Mueller & Sohn  ");
    expect(query<HTMLInputElement>(NAMENSFELD).getAttribute("name"), "das sichtbare Feld traegt keinen Namen")
      .toBeNull();
  });
});

describe("radio-AusleihVorgang: das Namensfeld", () => {
  it("fragt erst ab zwei Zeichen", async () => {
    /*
     * §4.3.4 (Spec:3496-3500) und Spec:5117-5121: „Die zwei Zeichen sind eine
     * DATENSCHUTZGRENZE, keine Bequemlichkeit" — ohne sie liefert ein Aufruf einem ANONYMEN
     * Aufrufer die Namensliste des Retentionsfensters.
     * ⛔ GEMESSEN WIRD, DASS DIE ACTION NICHT GERUFEN WIRD, nicht dass die Liste leer
     * bleibt: ein Abruf, dessen Ergebnis man wegwirft, ist derselbe anonyme Lesezugriff.
     */
    await rendere();

    await fill(NAMENSFELD, "a");
    await warteAufVorschlaege();
    expect(entleiherVorschlaegeMock).not.toHaveBeenCalled();

    await fill(NAMENSFELD, "an");
    await warteAufVorschlaege();
    expect(entleiherVorschlaegeMock).toHaveBeenCalledWith("an");
  });

  it("die Schwelle der Insel ist die Schwelle des Servers", () => {
    /*
     * ⚠️ DIE ZAHL STEHT AN ZWEI ORTEN, und das ist benannt statt still
     * (`_ui/EntleiherFeld.tsx`): der Server setzt sie in `sucheEntleiher`
     * (`_db/leihen.ts:346`), die Insel bricht schon davor ab. Importieren laesst sie sich
     * dort nicht, ohne Drizzle und die Moduldatenbank in das Client-Bundle zu ziehen.
     * ⛔ DIESER FALL IST DIE KLAMMER: laufen die zwei auseinander, wird er rot.
     */
    expect(ENTLEIHER_MIN_ZEICHEN).toBe(VORSCHLAG_MIN_ZEICHEN);
  });

  it("zeigt die Nebenzeile mit dem letzten Ausleihdatum", async () => {
    /*
     * ⛔ DER POSTEN, DER BEIM PORT STILL VERSCHWAENDE (Spec:3498, `_db/leihen.ts:111-120`):
     * `Vorschlag` ist kein `string`, sondern `{ name, zuletztText }`. Eine Signatur
     * `string[]` haette denselben Testnamen bestanden, solange nur der Name erscheint —
     * deshalb prueft dieser Fall die NEBENZEILE und nicht den Namen.
     * ⛔ `zuletztText` IST EINE FERTIGE ZEICHENKETTE VOM SERVER (Spec:5122-5123): kein
     * Zeitstempel in Millisekunden verlaesst ihn, und die Insel rechnet nichts nach.
     */
    entleiherVorschlaegeMock.mockResolvedValue([
      { name: "Anna Beispiel", zuletztText: "zuletzt am 14.06.2026, 09:12" },
    ]);
    /*
     * ⚠️ ERST EIN GERAET WAEHLEN: ohne Auswahl ist das Namensfeld gesperrt
     * (`routes/loan.tsx:87`), und ein gesperrtes `AutoComplete` klappt nichts auf. Genau
     * diese Reihenfolge fuehrt auch der Mensch.
     */
    await rendere();
    await click(zeile("g-1"));

    await fill(NAMENSFELD, "an");
    await warteAufVorschlaege();

    const text = vorschlagsknoten()
      .map((k) => k.textContent ?? "")
      .join(" | ");
    expect(text).toContain("Anna Beispiel");
    expect(text, "ohne die Nebenzeile waere der Vorschlag der halbe Posten")
      .toContain("zuletzt am 14.06.2026, 09:12");
  });

  it("der vorbelegte Name ist ueberschreibbar", async () => {
    /*
     * ⬜ A-L2, §3.5.4 (Spec:2738-2748): „ein `defaultValue`, UEBERSCHREIBBAR, kein
     * `readOnly`, keine Herkunftsmarkierung in der Zeile. Was gespeichert wird, ist
     * ausschliesslich das ABGESENDETE Feld."
     * ⛔ ZWEI HAELFTEN, UND DIE ZWEITE IST DIE TRAGENDE: dass der Wert dasteht, UND dass er
     * sich ueberschreiben laesst — bis in das versteckte Feld, das abgeschickt wird.
     */
    await rendere(DREI, [], "Rita Roth");

    const feld = query<HTMLInputElement>(NAMENSFELD);
    expect(feld.value).toBe("Rita Roth");
    expect(feld.readOnly, "kein readOnly — sonst waere es eine Zuschreibung").toBe(false);
    expect(feld.disabled, "ohne Geraet gesperrt, aber nicht schreibgeschuetzt").toBe(true);

    await click(zeile("g-1"));
    await fill(NAMENSFELD, "Karl Kollege");

    expect(query<HTMLInputElement>(NAMENSWERT).value).toBe("Karl Kollege");
  });

  it("der zu lange Name sperrt den Knopf und steht als Feldfehler am Feld", async () => {
    /*
     * ⬜ A-L17, die FELDHAELFTE (`.superpowers/sdd/planteil3/progress.md:518-536`): „das
     * Namensfeld traegt die Grenze als `maxLength` PLUS einen Feldfehler neben dem Feld".
     * ⛔ DER FALL IST ERREICHBAR UND NICHT BLOSS DEFENSIV: `maxLength` begrenzt das TIPPEN,
     * nicht den VORBELEGTEN Wert aus `weg: "suite"` (§3.5.4). Genau dieser Weg wird hier
     * gefahren.
     * ⛔ DIE SERVERHAELFTE BLEIBT OFFEN — `bucheAusleihe` prueft weiterhin nur auf
     * Nichtleere (`_db/leihen.ts:475`); dieser Fall behauptet nichts anderes.
     */
    await rendere(DREI, ["g-1"], "L".repeat(ENTLEIHER_MAX + 1));

    expect(query(NAMENSFEHLER).textContent).toContain(`${ENTLEIHER_MAX} Zeichen`);
    expect(query(NAMENSFEHLER).getAttribute("role")).toBe("alert");
    expect(query(NAMENSFEHLER).getAttribute("aria-live")).toBeNull();
    expect(query<HTMLButtonElement>(KNOPF).disabled).toBe(true);

    await fill(NAMENSFELD, "Rita Roth");
    expect(exists(NAMENSFEHLER)).toBe(false);
    expect(query<HTMLButtonElement>(KNOPF).disabled).toBe(false);
  });

  it("das Namensfeld traegt die Grenze auch als maxLength", async () => {
    /*
     * Die zweite Haelfte derselben Auflage. Gemessen wird am DOM-Feld und nicht am Prop:
     * `AutoComplete` reicht `maxLength` nur im Combobox-Modus durch
     * (`@rc-component/select/es/SelectInput/Content/SingleContent.js:95`).
     */
    await rendere();
    expect(query<HTMLInputElement>(NAMENSFELD).maxLength).toBe(ENTLEIHER_MAX);
  });
});

describe("radio-AusleihVorgang: das Ergebnis der Action", () => {
  it("zeigt den Fehlersatz der Action am Ort der Aktion", async () => {
    /*
     * ⛔ KEIN TOAST (Entscheidung E6, Spec:3754-3776) und ⛔ KEIN `Alert type="error"`
     * (Falle 3: `colorError === colorPrimary`). Der Satz kommt aus dem Ergebnistyp und wird
     * hier NICHT nachgebaut (`_lib/meldungen.ts`).
     * ⛔ `role="alert"` OHNE `aria-live` — Ruling `progress.md:603-634`, Punkt 1.
     */
    ausleiheAnlegenMock.mockResolvedValue({
      ok: false,
      grund: "nicht-verfuegbar",
      text: "Ruf 41/12 ist inzwischen an Anna Beispiel ausgeliehen. Es wurde nichts gebucht.",
      betroffen: [{ rufname: "41/12", status: "ON_LOAN" }],
    });
    await rendere(DREI, ["g-1"], "Max Mustermann");

    await submitForm();

    const ort = query(AKTIONSFEHLER);
    expect(ort.textContent).toContain("Es wurde nichts gebucht.");
    expect(ort.getAttribute("role")).toBe("alert");
    expect(ort.getAttribute("aria-live")).toBeNull();
    expect(
      query("[data-rolle='radio-ausleihform']").textContent,
      "ein technischer Schluessel gehoert nie auf den Bildschirm (Spec:3549-3550)",
    ).not.toContain("ON_LOAN");
  });

  it("faengt einen Wurf der Action ab und nennt denselben Satz wie der Server", async () => {
    /*
     * ⛔ `?? null` IST DER ERFOLGSPFAD und das `catch` die drei Ausnahmelagen
     * (`_ui/GateFormular.tsx:32-62`). ⛔ DER SATZ WIRD NICHT NEU ERFUNDEN: er kommt aus
     * `ausleihText({ grund: "unbekannt" })`, also aus derselben Datei wie der Serversatz —
     * ein zweiter Wortlaut waere die Fehlerform, die `_lib/bauform.test.ts` („kein
     * Rueckfalltext hinter gateMeldung") modulweit verbietet.
     */
    ausleiheAnlegenMock.mockRejectedValue(new Error("Verbindung weg"));
    await rendere(DREI, ["g-1"], "Max Mustermann");

    await submitForm();

    const { ausleihText } = await import("../_lib/meldungen");
    expect(query(AKTIONSFEHLER).textContent).toBe(ausleihText({ grund: "unbekannt" }));
  });

  it("zeigt die Inline-Erneuerung bei grund sitzung und nicht bei grund gesperrt", async () => {
    /*
     * Die VERDRAHTUNG der Zusage §3.10 Nr. 8 (Spec:3235-3236). Ob die Insel selbst richtig
     * entscheidet, misst `_ui/SitzungErneuern.test.tsx`; hier wird gemessen, dass dieses
     * Formular ihr den UNVERAENDERTEN `grund` reicht — `_actions/ausleihe.ts:111-116` gibt
     * ihn ausdruecklich durch, statt ihn auf `"unbekannt"` einzufalten.
     */
    ausleiheAnlegenMock.mockResolvedValue({
      ok: false,
      grund: "sitzung",
      text: "Dein Zugang ist abgelaufen.",
      betroffen: [],
    });
    await rendere(DREI, ["g-1"], "Max Mustermann");
    await submitForm();
    expect(exists(ERNEUERN)).toBe(true);

    await unmount();
    ausleiheAnlegenMock.mockResolvedValue({
      ok: false,
      grund: "gesperrt",
      text: "Dieser Zugangs-Code wurde gesperrt.",
      betroffen: [],
    });
    await rendere(DREI, ["g-1"], "Max Mustermann");
    await submitForm();
    expect(exists(AKTIONSFEHLER), "der Satz steht, nur das Feld nicht").toBe(true);
    expect(exists(ERNEUERN)).toBe(false);
  });

  it("behaelt Auswahl und Name, wenn die Erneuerung gelingt", async () => {
    /*
     * ⛔ DER FALL, DER DEN GANZEN BAU BEGRUENDET (§3.4.4, Spec:2563-2570): „die Flaeche
     * bietet inline ein Codefeld an, das die Sitzung erneuert, OHNE DIE EINGETRAGENEN WERTE
     * ZU VERLIEREN." Er ist zugleich der Unit-Traeger des e2e-Namens „abgelaufene Sitzung
     * verliert die eingetragenen Werte nicht" (NS-A12).
     *
     * ⚠️ ABWEICHUNG VOM BRIEF, BENANNT: die Testtabelle fuehrt diesen Fall unter
     * `_ui/SitzungErneuern.test.tsx` (`.superpowers/sdd/planteil3/briefs/A19.md:75`). Dort
     * gibt es aber weder eine Auswahl noch einen Namen, die verlorengehen koennten — der
     * Fall waere leer-gruen und die Sonde S-A19d 0 rot, weil die Zeilen, die den Zustand
     * halten, in DIESER Datei stehen. Gemessen wird deshalb hier.
     */
    ausleiheAnlegenMock.mockResolvedValue({
      ok: false,
      grund: "sitzung",
      text: "Dein Zugang ist abgelaufen. Gib den Code erneut ein — deine Eingaben bleiben stehen.",
      betroffen: [],
    });
    await rendere(DREI, ["g-1"], null);

    await click(zeile("g-3"));
    await fill(NAMENSFELD, "Rita Roth");
    await submitForm();

    expect(exists(ERNEUERN), "ohne das Feld gibt es nichts zu messen").toBe(true);

    await fill("#radio-erneuern-code", "kj3m-7q0z-h8ax-bt2v-9r5n-w4dc-ye6f");
    await click("[data-rolle='radio-erneuern-senden']");

    expect(exists("[data-rolle='radio-sitzung-erneuert']"), "die Erneuerung ist durch").toBe(true);
    expect(query<HTMLInputElement>(AUSWAHLWERT).value, "die Auswahl steht noch").toBe("g-1,g-3");
    expect(query(zeile("g-1")).getAttribute("aria-pressed")).toBe("true");
    expect(query(zeile("g-3")).getAttribute("aria-pressed")).toBe("true");
    expect(query<HTMLInputElement>(NAMENSWERT).value, "der Name steht noch").toBe("Rita Roth");
    expect(query<HTMLInputElement>(NAMENSFELD).value).toBe("Rita Roth");
  });
});

describe("radio-AusleihVorgang: das Stylesheet", () => {
  it("keine Regel unterhalb des Rahmen-Traegers liest eine Gate-Variable", () => {
    /*
     * ⛔ FALLE 2 IN IHRER STILLSTEN GESTALT (`CLAUDE.md:14-15`), und sie war HIER schon
     * einmal eingetreten: acht Regeln des A16/A18-Abschnitts lasen `--radio-gate-linie`,
     * `--radio-gate-marke`, `--radio-gate-flaeche` und `--radio-gate-gedaempft`. Diese vier
     * sind ausschliesslich auf `.gate` deklariert (`ausleihe.module.css:35-39`) — die
     * Ausleihflaechen haengen aber unter `.rahmen` (`_ui/AusleihRahmen.tsx`), einem GANZ
     * ANDEREN Teilbaum. Dort ist der Wert nicht da, die Erklaerung wird „invalid at
     * computed-value time", und die gedaempfte Farbe faellt still auf die geerbte zurueck.
     * ⛔ KEIN TOR SAH DAS: `typecheck`, `lint` und jsdom rechnen keine Kaskade, und der
     * Klassenscan in `_ui/AusleihRahmen.test.tsx` prueft NAMEN, nicht Werte. Behoben in
     * A19, zeilenzahl-neutral; dieser Fall haelt es fest.
     *
     * ⚠️ DIE VORAUSSETZUNG IST DIE DATEIORDNUNG, und sie steht im Kopf der Datei: der
     * Gate-Teil steht zuerst, ab `.rahmen` folgt der Ausleihzweig. Deshalb reicht der
     * Schnitt am Traeger. Faellt die Ordnung, faellt dieser Fall mit — dann ist er neu zu
     * schreiben und nicht zu loeschen.
     */
    const css = readFileSync(STYLESHEET, "utf8");
    const traeger = css.indexOf(".rahmen {");
    expect(traeger, "der Traeger `.rahmen` fehlt — der Fall waere leer-gruen").toBeGreaterThan(0);
    expect(css.slice(0, traeger), "der Gate-Teil MUSS die Gate-Variablen lesen").toMatch(/var\(--radio-gate-/);
    expect(
      css.slice(traeger),
      "eine Regel unter `.rahmen` liest eine Variable, die nur `.gate` deklariert (Falle 2)",
    ).not.toMatch(/var\(--radio-gate-/);
  });
});
